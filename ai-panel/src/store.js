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
const MESSAGE_MAX = 400;
// Deliberately short: an isolate that cannot be told about a logout re-reads the marker
// within five seconds, so "sign out everywhere" bites almost immediately everywhere.
export const REVOKED_CACHE_TTL_MS = 5_000;

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
        await storage.put("conversations", rows.slice(-CONVERSATION_MAX));
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
        const key = `msgs:${row.conversation_id}`;
        const rows = (await storage.get(key)) || [];
        const entry = {
          seq: rows.length + 1,
          role: String(row.role).slice(0, 20),
          kind: String(row.kind || "message").slice(0, 20),
          content: String(row.content ?? "").slice(0, 20_000),
          tool: row.tool ? String(row.tool).slice(0, 80) : null,
          ok: typeof row.ok === "boolean" ? row.ok : null,
          run_id: row.run_id ? String(row.run_id).slice(0, 64) : null,
          ts: Number(row.ts) || Date.now(),
        };
        // One final assistant row per run: the SSE tap and the poll fallback both report it.
        const existing =
          entry.role === "assistant" && entry.run_id
            ? rows.findIndex((r) => r.role === "assistant" && r.run_id === entry.run_id)
            : -1;
        if (existing >= 0) rows[existing] = { ...rows[existing], ...entry, seq: rows[existing].seq };
        else rows.push(entry);
        await storage.put(key, rows.slice(-MESSAGE_MAX));
        const convs = (await storage.get("conversations")) || [];
        const ci = convs.findIndex((c) => c.id === row.conversation_id);
        if (ci >= 0) {
          convs[ci] = { ...convs[ci], updated_at: entry.ts, messages: rows.length };
          await storage.put("conversations", convs);
        }
        return json({ ok: true, message: entry });
      }
      if (!id) return json({ error: "conversation_id_required" }, 400);
      const limit = Math.max(1, Math.min(MESSAGE_MAX, Number(url.searchParams.get("limit")) || MESSAGE_MAX));
      const rows = (await storage.get(`msgs:${id}`)) || [];
      return json({ conversation_id: id, messages: rows.slice(-limit) });
    }

    return json({ error: "not_found" }, 404);
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
    content: String(row.content ?? "").slice(0, 20_000),
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
    if (existing >= 0) rows[existing] = { ...rows[existing], ...clean };
    else rows.push({ ...clean, seq: rows.length + 1 });
    messageFallback.set(clean.conversation_id, rows.slice(-MESSAGE_MAX));
    const conv = conversationFallback.find((c) => c.id === clean.conversation_id);
    if (conv) {
      conv.updated_at = clean.ts;
      conv.messages = rows.length;
    }
    return clean;
  }
  try {
    const res = await s.fetch("https://panel-store/messages", { method: "POST", body: JSON.stringify(clean) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return (await res.json()).message || clean;
  } catch {
    return clean;
  }
}

/** The transcript of one conversation, oldest first. */
export async function messageList(env, { conversationId, limit = MESSAGE_MAX } = {}) {
  if (!conversationId) return [];
  const s = stub(env);
  if (!s) return (messageFallback.get(conversationId) || []).slice(-limit);
  try {
    const q = new URLSearchParams({ conversation_id: conversationId, limit: String(limit) });
    const res = await s.fetch(`https://panel-store/messages?${q}`);
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return messageFallback.get(conversationId) || [];
  }
}

/** Test seam: forget the in-memory conversations. */
export function resetConversations() {
  conversationFallback.length = 0;
  messageFallback.clear();
}

const revokedCache = new Map(); // marker key → { value, expires }
const REVOKED_KEY = "revoked";

function rememberRevoked(value) {
  revokedCache.set(REVOKED_KEY, { value, expires: Date.now() + REVOKED_CACHE_TTL_MS });
  return value;
}

/**
 * Drop the cached revocation marker now instead of waiting for the TTL. A plain logout clears
 * this isolate's entry; `all: true` ("sign out everywhere") clears every entry, so no cached
 * pre-logout value survives anywhere in this isolate. Other isolates are covered by the TTL.
 */
export function invalidateRevokedCache({ all = false } = {}) {
  if (all) revokedCache.clear();
  else revokedCache.delete(REVOKED_KEY);
}

/** Epoch seconds; sessions issued at or before this are dead. Cached briefly. */
export async function revokedBefore(env) {
  const cached = revokedCache.get(REVOKED_KEY);
  if (cached && cached.expires > Date.now()) return cached.value;
  const s = stub(env);
  if (!s) return 0;
  try {
    const res = await s.fetch("https://panel-store/revoked");
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    const value = Number(data.before) || 0;
    revokedCache.set(REVOKED_KEY, { value, expires: Date.now() + REVOKED_CACHE_TTL_MS });
    return value;
  } catch {
    return cached ? cached.value : 0;
  }
}

/** Invalidate every session issued so far. Returns the new marker. */
export async function revokeAll(env) {
  const before = Math.floor(Date.now() / 1000);
  // Sign out everywhere: every cached entry goes first, then only the fresh marker is put back.
  invalidateRevokedCache({ all: true });
  const s = stub(env);
  if (!s) return rememberRevoked(before);
  try {
    const res = await s.fetch("https://panel-store/revoked", { method: "POST", body: JSON.stringify({ before }) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    const data = await res.json();
    return rememberRevoked(Number(data.before) || before);
  } catch {
    return rememberRevoked(before);
  }
}

/** Test seam: forget every cached revocation marker. */
export function resetCache() {
  revokedCache.clear();
}
