// Durable state for the panel: rate-limit counters, the request log ring and the
// "all sessions revoked before" marker.
//
// Why a Durable Object: Workers isolates are per-colo and short-lived, so an in-memory
// counter or ring resets whenever the isolate goes away. A DO lives on one instance and
// keeps its storage, which makes both the limiter and the log survive that.
//
// The module also exposes thin async helpers that fall back to the in-memory
// ratelimit.js/log.js when the binding is absent (node --test, wrangler dev without DOs),
// so no call site has to care.

import * as rl from "./ratelimit.js";
import * as log from "./log.js";

const LOG_MAX = 200;
const RUN_MAX = 200;
const CONVERSATION_MAX = 100;
// A Durable Object value has to stay far below the per-key limit (128 KiB on the KV backend),
// and one transcript row alone can be 20 000 characters. So every row gets its own key
// `msg:<conv>:<seq>`; nothing is ever written as one big array again.
export const VALUE_BYTES_MAX = 96 * 1024;
// Per-thread budget, then the oldest rows are dropped. Well under the DO's total storage and
// enough for a long working session.
export const CONVERSATION_BYTES_MAX = 4 * 1024 * 1024;
export const CONVERSATION_ROWS_MAX = 2_000;
export const MESSAGE_PAGE_DEFAULT = 50;
export const MESSAGE_PAGE_MAX = 200;
const MESSAGE_CONTENT_MAX = 20_000;
// Deliberately short: an isolate that cannot be told about a logout re-reads the marker
// within five seconds, so "sign out everywhere" bites almost immediately everywhere.
export const REVOKED_CACHE_TTL_MS = 5_000;

const encoder = new TextEncoder();
const bytesOf = (value) => encoder.encode(JSON.stringify(value)).length;
const msgPrefix = (convId) => `msg:${convId}:`;
/** Lexicographically sortable: `msg:<seq padded to 10>` orders like the number it encodes. */
const msgKey = (convId, seq) => `${msgPrefix(convId)}${String(Math.max(0, Math.floor(seq))).padStart(10, "0")}`;
const metaKey = (convId) => `mmeta:${convId}`;
const runKey = (convId, runId) => `mrun:${convId}:${runId}`;
const emptyMeta = () => ({ count: 0, bytes: 0, last_seq: 0, first_seq: 0, dropped: 0 });

/** Trim content until the serialized row fits VALUE_BYTES_MAX. Returns the row plus `truncated`. */
export function fitValue(entry) {
  if (bytesOf(entry) <= VALUE_BYTES_MAX) return entry;
  const content = String(entry.content ?? "");
  let lo = 0;
  let hi = content.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = { ...entry, content: content.slice(0, mid) };
    if (bytesOf(candidate) <= VALUE_BYTES_MAX) lo = mid;
    else hi = mid - 1;
  }
  // Never cut a surrogate pair in half: that would store a lone half.
  if (lo > 0 && lo < content.length && /[\uD800-\uDBFF]/.test(content[lo - 1])) lo -= 1;
  return { ...entry, content: content.slice(0, lo), truncated: true };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export class PanelStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const storage = this.state.storage;

    if (url.pathname === "/rate" && request.method === "POST") {
      const { bucket, id, max, window } = await request.json();
      const key = `rl:${bucket}:${id}`;
      const now = Date.now();
      let entry = await storage.get(key);
      if (!entry || entry.reset <= now) entry = { count: 0, reset: now + window * 1000 };
      entry.count += 1;
      await storage.put(key, entry);
      await this.sweep(now);
      return json({
        ok: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        retryAfter: Math.max(1, Math.ceil((entry.reset - now) / 1000)),
        limit: max,
      });
    }

    if (url.pathname === "/log") {
      if (request.method === "POST") {
        const entry = await request.json();
        const rows = (await storage.get("log")) || [];
        rows.push(entry);
        await storage.put("log", rows.slice(-LOG_MAX));
        return json({ ok: true });
      }
      const rows = (await storage.get("log")) || [];
      const n = Math.max(1, Math.min(LOG_MAX, Number(url.searchParams.get("limit")) || 50));
      return json({ entries: rows.slice(-n).reverse() });
    }

    if (url.pathname === "/revoked") {
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const before = Number(body.before) || Math.floor(Date.now() / 1000);
        await storage.put("revoked_before", before);
        return json({ ok: true, before });
      }
      return json({ before: (await storage.get("revoked_before")) || 0 });
    }

    // Run history: one small ring, merged by (bot, run_id), so a panel restart or a new
    // isolate does not lose what was started from the chat.
    if (url.pathname === "/runs") {
      if (request.method === "POST") {
        const row = await request.json().catch(() => null);
        if (!row || !row.bot || !row.run_id) return json({ error: "bot_and_run_id_required" }, 400);
        const rows = (await storage.get("runs")) || [];
        const existing = rows.findIndex((r) => r.bot === row.bot && r.run_id === row.run_id);
        const merged = { ...(existing >= 0 ? rows[existing] : {}), ...row, updated_at: Date.now() };
        if (existing >= 0) rows[existing] = merged;
        else rows.push(merged);
        await storage.put("runs", rows.slice(-RUN_MAX));
        return json({ ok: true, run: merged });
      }
      const bot = url.searchParams.get("bot") || "";
      const limit = Math.max(1, Math.min(RUN_MAX, Number(url.searchParams.get("limit")) || 25));
      const rows = (await storage.get("runs")) || [];
      const filtered = rows.filter((r) => !bot || r.bot === bot).slice(-limit).reverse();
      return json({ runs: filtered });
    }

    // Conversations: one row per chat thread, plus its messages. This is the panel's own chat
    // history — the sidebar and the transcript survive a reload, a new isolate and a re-login.
    if (url.pathname === "/conversations") {
      if (request.method === "POST") {
        const row = await request.json().catch(() => null);
        if (!row || !row.bot || !row.id) return json({ error: "bot_and_id_required" }, 400);
        const rows = (await storage.get("conversations")) || [];
        const i = rows.findIndex((r) => r.id === row.id);
        const merged = {
          ...(i >= 0 ? rows[i] : { started_at: Date.now(), messages: 0 }),
          ...row,
          updated_at: Date.now(),
        };
        if (i >= 0) rows[i] = merged;
        else rows.push(merged);
        // Prune whole threads, and their message keys with them: a bounded list must not leave
        // orphaned transcripts (and their bytes) behind.
        const kept = await this.pruneConversations(storage, rows);
        await storage.put("conversations", kept);
        return json({ ok: true, conversation: merged });
      }
      const bot = url.searchParams.get("bot") || "";
      const limit = Math.max(1, Math.min(CONVERSATION_MAX, Number(url.searchParams.get("limit")) || 30));
      const rows = (await storage.get("conversations")) || [];
      const filtered = rows
        .filter((r) => !bot || r.bot === bot)
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
        .slice(0, limit);
      return json({ conversations: filtered });
    }

    if (url.pathname === "/messages") {
      const id = url.searchParams.get("conversation_id") || "";
      if (request.method === "POST") {
        const row = await request.json().catch(() => null);
        if (!row || !row.conversation_id || !row.role) return json({ error: "conversation_id_and_role_required" }, 400);
        const convId = String(row.conversation_id).slice(0, 64);
        const meta = (await storage.get(metaKey(convId))) || emptyMeta();
        const entry = fitValue({
          role: String(row.role).slice(0, 20),
          kind: String(row.kind || "message").slice(0, 20),
          content: String(row.content ?? "").slice(0, MESSAGE_CONTENT_MAX),
          tool: row.tool ? String(row.tool).slice(0, 80) : null,
          ok: typeof row.ok === "boolean" ? row.ok : null,
          run_id: row.run_id ? String(row.run_id).slice(0, 64) : null,
          ts: Number(row.ts) || Date.now(),
        });
        // One final assistant row per run: the SSE tap and the poll fallback both report it, and
        // the run index says which seq that row already has.
        let seq = null;
        if (entry.role === "assistant" && entry.run_id) {
          const known = Number(await storage.get(runKey(convId, entry.run_id)));
          if (known > 0 && (await storage.get(msgKey(convId, known)))) seq = known;
        }
        if (seq === null) seq = meta.last_seq + 1;
        entry.seq = seq;
        const key = msgKey(convId, seq);
        const prev = await storage.get(key);
        await storage.put(key, entry);
        meta.bytes = Math.max(0, meta.bytes - (prev ? bytesOf(prev) : 0)) + bytesOf(entry);
        if (!prev) meta.count += 1;
        meta.last_seq = Math.max(meta.last_seq, seq);
        meta.first_seq = meta.first_seq || seq;
        if (entry.role === "assistant" && entry.run_id) await storage.put(runKey(convId, entry.run_id), seq);
        await this.trimConversation(storage, convId, meta);
        await storage.put(metaKey(convId), meta);
        const convs = (await storage.get("conversations")) || [];
        const ci = convs.findIndex((c) => c.id === convId);
        if (ci >= 0) {
          convs[ci] = { ...convs[ci], updated_at: entry.ts, messages: meta.count };
          await storage.put("conversations", convs);
        }
        return json({ ok: true, message: entry, count: meta.count });
      }
      if (!id) return json({ error: "conversation_id_required" }, 400);
      // Newest page first, newest row last: the client renders top-down and asks for `before`
      // when the user scrolls up / taps "older messages".
      const limit = Math.max(1, Math.min(MESSAGE_PAGE_MAX, Number(url.searchParams.get("limit")) || MESSAGE_PAGE_DEFAULT));
      const before = Math.max(0, Number(url.searchParams.get("before")) || 0);
      const opts = { prefix: msgPrefix(id), reverse: true, limit: limit + 1 };
      if (before > 0) opts.end = msgKey(id, before);
      const found = await storage.list(opts);
      const rows = [...found.values()].sort((a, b) => a.seq - b.seq);
      const hasMore = rows.length > limit;
      const messages = hasMore ? rows.slice(rows.length - limit) : rows;
      const meta = await storage.get(metaKey(id));
      return json({
        conversation_id: id,
        messages,
        has_more: hasMore,
        next_before: hasMore && messages.length ? messages[0].seq : null,
        total: meta ? meta.count : messages.length,
        dropped: meta ? meta.dropped || 0 : 0,
      });
    }

    return json({ error: "not_found" }, 404);
  }

  /**
   * Keep one conversation inside its byte/row budget by dropping the oldest rows. The newest
   * rows always survive, so an active thread keeps working instead of losing its tail.
   */
  async trimConversation(storage, convId, meta) {
    let guard = 0;
    while ((meta.bytes > CONVERSATION_BYTES_MAX || meta.count > CONVERSATION_ROWS_MAX) && meta.count > 1 && guard++ < 128) {
      const page = await storage.list({ prefix: msgPrefix(convId), limit: 32 });
      if (!page.size) {
        meta.count = 0;
        meta.bytes = 0;
        return meta;
      }
      const dead = [];
      for (const [key, value] of page) {
        dead.push(key);
        meta.bytes = Math.max(0, meta.bytes - bytesOf(value));
        meta.count -= 1;
        meta.dropped = (meta.dropped || 0) + 1;
        meta.first_seq = Number(value.seq) + 1;
        if (meta.count <= 1) break;
        if (meta.bytes <= CONVERSATION_BYTES_MAX && meta.count <= CONVERSATION_ROWS_MAX) break;
      }
      if (dead.length) await storage.delete(dead);
    }
    return meta;
  }

  /** Bounded conversation list; threads that fall out of it lose their message keys too. */
  async pruneConversations(storage, rows) {
    if (rows.length <= CONVERSATION_MAX) return rows;
    const sorted = [...rows].sort((a, b) => (a.updated_at || 0) - (b.updated_at || 0));
    const keep = new Set(sorted.slice(sorted.length - CONVERSATION_MAX).map((c) => c.id));
    const dropped = rows.filter((c) => !keep.has(c.id));
    for (const conv of dropped) await this.dropConversation(storage, conv.id);
    return rows.filter((c) => keep.has(c.id));
  }

  /** Delete every key of one conversation (rows, run index, meta), in batches of 128. */
  async dropConversation(storage, convId) {
    const keys = [metaKey(convId)];
    for (const prefix of [msgPrefix(convId), `mrun:${convId}:`]) {
      const found = await storage.list({ prefix });
      for (const key of found.keys()) keys.push(key);
    }
    for (let i = 0; i < keys.length; i += 128) await storage.delete(keys.slice(i, i + 128));
  }

  /** Drop expired rate buckets now and then; the key space is small but unbounded. */
  async sweep(now) {
    const counter = ((await this.state.storage.get("sweeps")) || 0) + 1;
    await this.state.storage.put("sweeps", counter);
    if (counter % 100 !== 0) return;
    const all = await this.state.storage.list({ prefix: "rl:" });
    const dead = [];
    for (const [key, value] of all) if (!value || value.reset <= now) dead.push(key);
    if (dead.length) await this.state.storage.delete(dead);
  }
}

// ---------------------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------------------

function stub(env) {
  const ns = env && env.PANEL_STORE;
  if (!ns || typeof ns.idFromName !== "function" || typeof ns.get !== "function") return null;
  try {
    return ns.get(ns.idFromName("panel"));
  } catch {
    return null;
  }
}

/** {ok, remaining, retryAfter, limit} — durable when the DO is bound, in-memory otherwise. */
export async function rateTake(env, bucket, id) {
  const limit = rl.LIMITS[bucket] || rl.LIMITS.api;
  const s = stub(env);
  if (!s) return rl.take(bucket, id);
  try {
    const res = await s.fetch("https://panel-store/rate", {
      method: "POST",
      body: JSON.stringify({ bucket, id, max: limit.max, window: limit.window }),
    });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return await res.json();
  } catch {
    // A store hiccup must not lock Nils out of his own panel.
    return rl.take(bucket, id);
  }
}

/** Append a request-log row. Always also goes to Workers Logs. */
export async function logAppend(env, entry) {
  const row = log.record(entry);
  const s = stub(env);
  if (!s) return row;
  try {
    await s.fetch("https://panel-store/log", { method: "POST", body: JSON.stringify(row) });
  } catch {
    // logging must never break a request
  }
  return row;
}

export async function logRecent(env, limit = 50) {
  const s = stub(env);
  if (!s) return log.recent(limit);
  try {
    const res = await s.fetch(`https://panel-store/log?limit=${encodeURIComponent(limit)}`);
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return log.recent(limit);
  }
}

/** In-memory run ring for node --test / a binding-less dev server. */
const runFallback = [];

/**
 * Remember a chat run (started, approved, stopped, finished). Merged by (bot, run_id) so callers
 * only send what changed. Never throws: history is a convenience, not a precondition.
 */
export async function runRecord(env, row) {
  const clean = { bot: String(row.bot || ""), run_id: String(row.run_id || "") };
  // Only carry the fields the caller actually set: an update from the poll must not wipe the
  // conversation id or the input of the row written at run start.
  if (row.session_id !== undefined) clean.session_id = row.session_id ? String(row.session_id) : null;
  if (row.conversation_id !== undefined) clean.conversation_id = row.conversation_id ? String(row.conversation_id) : null;
  if (row.input !== undefined) clean.input = String(row.input || "").slice(0, 200);
  clean.status = String(row.status || "started").slice(0, 40);
  clean.error = row.error ? String(row.error).slice(0, 200) : null;
  if (row.started_at !== undefined) clean.started_at = Number(row.started_at) || Date.now();
  if (!clean.bot || !clean.run_id) return clean;
  const s = stub(env);
  if (!s) {
    const i = runFallback.findIndex((r) => r.bot === clean.bot && r.run_id === clean.run_id);
    const merged = { ...(i >= 0 ? runFallback[i] : {}), ...clean, updated_at: Date.now() };
    if (i >= 0) runFallback[i] = merged;
    else runFallback.push(merged);
    if (runFallback.length > RUN_MAX) runFallback.splice(0, runFallback.length - RUN_MAX);
    return merged;
  }
  try {
    const res = await s.fetch("https://panel-store/runs", { method: "POST", body: JSON.stringify(clean) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return (await res.json()).run || clean;
  } catch {
    return clean;
  }
}

/** Newest-first run history, optionally for one bot. */
export async function runRecent(env, { bot = "", limit = 25 } = {}) {
  const s = stub(env);
  if (!s) {
    return runFallback
      .filter((r) => !bot || r.bot === bot)
      .slice(-limit)
      .reverse();
  }
  try {
    const q = new URLSearchParams({ limit: String(limit) });
    if (bot) q.set("bot", bot);
    const res = await s.fetch(`https://panel-store/runs?${q}`);
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.runs) ? data.runs : [];
  } catch {
    return runFallback.filter((r) => !bot || r.bot === bot).slice(-limit).reverse();
  }
}

/** Test seam: forget the in-memory run ring. */
export function resetRuns() {
  runFallback.length = 0;
}

// ---------------------------------------------------------------------------------------
// Conversations (chat history)
// ---------------------------------------------------------------------------------------

const conversationFallback = []; // {id, bot, title, started_at, updated_at, messages}
const messageFallback = new Map(); // conversation id → rows

/** Create or update a conversation row. Never throws. */
export async function conversationUpsert(env, row) {
  const clean = {
    id: String(row.id || ""),
    bot: String(row.bot || ""),
    session_id: row.session_id ? String(row.session_id) : null,
    run_id: row.run_id ? String(row.run_id) : null,
    started_at: Number(row.started_at) || Date.now(),
  };
  // Only set a title when the caller supplies one: a follow-up message must not rename the thread.
  if (row.title !== undefined) clean.title = String(row.title || "Neuer Chat").slice(0, 120);
  if (!clean.id || !clean.bot) return clean;
  const s = stub(env);
  if (!s) {
    const i = conversationFallback.findIndex((c) => c.id === clean.id);
    const merged = { ...(i >= 0 ? conversationFallback[i] : { messages: 0 }), ...clean, updated_at: Date.now() };
    if (i >= 0) conversationFallback[i] = merged;
    else conversationFallback.push(merged);
    return merged;
  }
  try {
    const res = await s.fetch("https://panel-store/conversations", { method: "POST", body: JSON.stringify(clean) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return (await res.json()).conversation || clean;
  } catch {
    return clean;
  }
}

/** Newest-first conversations, optionally for one bot. */
export async function conversationList(env, { bot = "", limit = 30 } = {}) {
  const s = stub(env);
  if (!s) {
    return conversationFallback
      .filter((c) => !bot || c.bot === bot)
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
      .slice(0, limit);
  }
  try {
    const q = new URLSearchParams({ limit: String(limit) });
    if (bot) q.set("bot", bot);
    const res = await s.fetch(`https://panel-store/conversations?${q}`);
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.conversations) ? data.conversations : [];
  } catch {
    return conversationFallback.filter((c) => !bot || c.bot === bot).slice(0, limit);
  }
}

/** Append one transcript row (user, assistant, tool, approval). Never throws. */
export async function messageAppend(env, row) {
  const clean = {
    conversation_id: String(row.conversation_id || ""),
    role: String(row.role || "assistant").slice(0, 20),
    kind: String(row.kind || "message").slice(0, 20),
    content: String(row.content ?? "").slice(0, MESSAGE_CONTENT_MAX),
    tool: row.tool ? String(row.tool).slice(0, 80) : null,
    ok: typeof row.ok === "boolean" ? row.ok : null,
    run_id: row.run_id ? String(row.run_id) : null,
    ts: Number(row.ts) || Date.now(),
  };
  if (!clean.conversation_id) return clean;
  const s = stub(env);
  if (!s) {
    const rows = messageFallback.get(clean.conversation_id) || [];
    const existing =
      clean.role === "assistant" && clean.run_id
        ? rows.findIndex((r) => r.role === "assistant" && r.run_id === clean.run_id)
        : -1;
    const entry = fitValue({ ...clean });
    if (existing >= 0) {
      rows[existing] = { ...rows[existing], ...entry };
    } else {
      entry.seq = rows.length ? rows[rows.length - 1].seq + 1 : 1;
      rows.push(entry);
    }
    messageFallback.set(clean.conversation_id, trimRows(rows));
    const conv = conversationFallback.find((c) => c.id === clean.conversation_id);
    if (conv) {
      conv.updated_at = clean.ts;
      conv.messages = messageFallback.get(clean.conversation_id).length;
    }
    return entry;
  }
  try {
    const res = await s.fetch("https://panel-store/messages", { method: "POST", body: JSON.stringify(clean) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return (await res.json()).message || clean;
  } catch {
    return clean;
  }
}

/** Same byte/row budget as the Durable Object, for the in-memory fallback. */
function trimRows(rows) {
  let total = rows.reduce((sum, r) => sum + bytesOf(r), 0);
  while (rows.length > 1 && (total > CONVERSATION_BYTES_MAX || rows.length > CONVERSATION_ROWS_MAX)) {
    total -= bytesOf(rows.shift());
  }
  return rows;
}

/**
 * One page of a transcript, oldest row first, plus the cursor for the page before it.
 * `{ messages, has_more, next_before, total }` — the API passes this through unchanged.
 */
export async function messageList(env, { conversationId, limit = MESSAGE_PAGE_DEFAULT, before = 0 } = {}) {
  const empty = { messages: [], has_more: false, next_before: null, total: 0, conversation_id: conversationId || null };
  if (!conversationId) return empty;
  const page = Math.max(1, Math.min(MESSAGE_PAGE_MAX, Number(limit) || MESSAGE_PAGE_DEFAULT));
  const cursor = Math.max(0, Number(before) || 0);
  const s = stub(env);
  if (!s) {
    const all = messageFallback.get(conversationId) || [];
    const older = cursor > 0 ? all.filter((r) => r.seq < cursor) : all;
    const messages = older.slice(-page).map((r) => ({ ...r }));
    const hasMore = older.length > messages.length;
    return {
      ...empty,
      messages,
      has_more: hasMore,
      next_before: hasMore && messages.length ? messages[0].seq : null,
      total: all.length,
    };
  }
  try {
    const q = new URLSearchParams({ conversation_id: conversationId, limit: String(page) });
    if (cursor > 0) q.set("before", String(cursor));
    const res = await s.fetch(`https://panel-store/messages?${q}`);
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    return {
      conversation_id: conversationId,
      messages: Array.isArray(data.messages) ? data.messages : [],
      has_more: Boolean(data.has_more),
      next_before: Number(data.next_before) > 0 ? Number(data.next_before) : null,
      total: Number(data.total) || 0,
    };
  } catch {
    const all = messageFallback.get(conversationId) || [];
    return { ...empty, messages: all.slice(-page).map((r) => ({ ...r })), total: all.length };
  }
}

/** Test seam: forget the in-memory conversations. */
export function resetConversations() {
  conversationFallback.length = 0;
  messageFallback.clear();
}

const revokedCache = new Map(); // marker key → { value, expires }
const REVOKED_KEY = "revoked";
// The last marker this isolate saw, kept without a TTL. It is the fallback when the store cannot
// be read: an old value is still a valid lower bound, whereas 0 would revive every session.
let lastKnownRevoked = null;

/** The store could not tell whether sessions are revoked; callers must fail closed. */
export class RevocationUnavailableError extends Error {
  constructor(message = "revocation_unavailable") {
    super(message);
    this.name = "RevocationUnavailableError";
  }
}

function rememberRevoked(value) {
  revokedCache.set(REVOKED_KEY, { value, expires: Date.now() + REVOKED_CACHE_TTL_MS });
  lastKnownRevoked = Math.max(lastKnownRevoked ?? 0, value);
  return value;
}

/**
 * Drop the cached revocation marker now instead of waiting for the TTL. A plain logout clears
 * this isolate's entry; `all: true` ("sign out everywhere") clears every entry, so no cached
 * pre-logout value survives anywhere in this isolate. Other isolates are covered by the TTL.
 * The TTL-less last-known fallback is kept: it only ever moves forward.
 */
export function invalidateRevokedCache({ all = false } = {}) {
  if (all) revokedCache.clear();
  else revokedCache.delete(REVOKED_KEY);
}

/**
 * Epoch seconds; sessions issued at or before this are dead. Cached briefly.
 * Fails closed: if the store errors and this isolate has never seen a marker, it throws
 * `RevocationUnavailableError` instead of answering 0 ("nothing revoked").
 * Without a store binding (local dev, tests) the in-memory marker is authoritative.
 */
export async function revokedBefore(env) {
  const cached = revokedCache.get(REVOKED_KEY);
  if (cached && cached.expires > Date.now()) return cached.value;
  const s = stub(env);
  if (!s) return lastKnownRevoked ?? 0;
  try {
    const res = await s.fetch("https://panel-store/revoked");
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    return rememberRevoked(Number(data.before) || 0);
  } catch {
    if (lastKnownRevoked !== null) return lastKnownRevoked;
    throw new RevocationUnavailableError();
  }
}

/**
 * Invalidate every session issued so far. Returns the new marker. Throws
 * `RevocationUnavailableError` when the marker could not be persisted, so the caller does not
 * report a sign-out that only happened in this isolate's memory.
 */
export async function revokeAll(env) {
  const before = Math.floor(Date.now() / 1000);
  // Sign out everywhere: every cached entry goes first, then only the fresh marker is put back.
  invalidateRevokedCache({ all: true });
  const s = stub(env);
  if (!s) return rememberRevoked(before);
  let data;
  try {
    const res = await s.fetch("https://panel-store/revoked", { method: "POST", body: JSON.stringify({ before }) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    data = await res.json();
  } catch {
    throw new RevocationUnavailableError("revoke_failed");
  }
  return rememberRevoked(Number(data.before) || before);
}

/** Test seam: forget every cached revocation marker. */
export function resetCache() {
  revokedCache.clear();
  lastKnownRevoked = null;
}
