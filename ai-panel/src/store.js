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
