// Hermes client. Every call goes through the Cloudflare Tunnel hostname to the loopback
// origin-proxy, which verifies the shared secret and injects the real Hermes key.
// Nothing in this module ever puts a key in a response body.

const JSON_TIMEOUT_MS = 25_000;

const BOT_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const BOTS_TTL_MS = 60_000;
const botsCache = new Map(); // origin → {names, expires}

/** The static seed from wrangler.jsonc. Used as the fallback and always kept in the list. */
export function staticBots(env) {
  return String(env.PANEL_BOTS || "cloudflare,minecraft,discord,homelab")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => BOT_NAME.test(s));
}

/**
 * The bots the panel accepts: the live profile list from the dashboard (so a bot created in
 * the panel works without a redeploy), unioned with PANEL_BOTS, every name pattern-checked.
 * Cached per isolate for a minute; a dashboard hiccup falls back to the static list.
 */
export async function botList(env, { fresh = false } = {}) {
  const key = origin(env) || "none";
  const cached = botsCache.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return cached.names;
  if (!origin(env)) return staticBots(env);
  try {
    const { status, data } = await call(env, "dash", "/api/profiles");
    if (status >= 400) throw new Error(`profiles ${status}`);
    const rows = Array.isArray(data?.profiles) ? data.profiles : Array.isArray(data) ? data : [];
    const live = rows.map((p) => String(p?.name || "")).filter((n) => BOT_NAME.test(n));
    const names = [...new Set([...live, ...staticBots(env)])];
    botsCache.set(key, { names, expires: Date.now() + BOTS_TTL_MS });
    return names;
  } catch {
    const names = staticBots(env);
    botsCache.set(key, { names, expires: Date.now() + 10_000 });
    return names;
  }
}

export function invalidateBots(env) {
  botsCache.delete(origin(env) || "none");
}

export async function isBot(env, name) {
  if (typeof name !== "string" || !BOT_NAME.test(name)) return false;
  return (await botList(env)).includes(name);
}

export function origin(env) {
  return String(env.HERMES_ORIGIN || "").replace(/\/+$/, "");
}

export function upstreamHeaders(env) {
  const h = { "content-type": "application/json", "x-hermes-panel-secret": env.HERMES_PANEL_SECRET || "" };
  if (env.HERMES_API_KEY) h.authorization = `Bearer ${env.HERMES_API_KEY}`;
  return h;
}

/** kind: "gw" = Hermes gateway (8642), "dash" = dashboard (9119). */
export function upstreamUrl(env, kind, path) {
  return `${origin(env)}/${kind}${path.startsWith("/") ? path : `/${path}`}`;
}

export class UpstreamError extends Error {
  constructor(message, status = 502, detail = "") {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** JSON call. Returns {status, data}; throws UpstreamError when the origin is unreachable. */
export async function call(env, kind, path, { method = "GET", body, timeout = JSON_TIMEOUT_MS } = {}) {
  if (!origin(env)) throw new UpstreamError("HERMES_ORIGIN is not configured", 503);
  const init = {
    method,
    headers: upstreamHeaders(env),
    signal: AbortSignal.timeout(timeout),
  };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  let res;
  try {
    res = await fetch(upstreamUrl(env, kind, path), init);
  } catch (err) {
    throw new UpstreamError("Hermes gateway unreachable", 502, String(err && err.message));
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
  }
  // A 401/403 from Hermes means the panel's own credential is wrong, not that the browser
  // session expired. Map it to 502 so the SPA does not bounce the user to /auth/login.
  if (res.status === 401 || res.status === 403) {
    return { status: 502, data: { error: "upstream_auth_failed", upstream_status: res.status } };
  }
  return { status: res.status, data };
}

/** Streaming call (SSE). Returns the raw upstream Response so the body can be piped through. */
export async function stream(env, kind, path, { method = "POST", body } = {}) {
  if (!origin(env)) throw new UpstreamError("HERMES_ORIGIN is not configured", 503);
  const init = { method, headers: { ...upstreamHeaders(env), accept: "text/event-stream" } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  try {
    return await fetch(upstreamUrl(env, kind, path), init);
  } catch (err) {
    throw new UpstreamError("Hermes gateway unreachable", 502, String(err && err.message));
  }
}

export function sseHeaders(extra = {}) {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    ...extra,
  };
}

/** Pass an upstream SSE body through untouched, keeping status and content type. */
export async function pipeSse(res) {
  const type = res.headers.get("content-type") || "";
  if (!res.ok && !type.includes("event-stream")) {
    // Detail stays in the Worker log; the browser only learns that the upstream failed.
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    console.error(JSON.stringify({ ai_panel_upstream: { status: res.status, detail } }));
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (!res.body) {
    return new Response('data: {"event":"error","message":"empty upstream stream"}\n\n', {
      status: 502,
      headers: sseHeaders(),
    });
  }
  return new Response(res.body, {
    status: res.ok ? 200 : res.status,
    headers: sseHeaders({ "x-upstream-status": String(res.status) }),
  });
}

// -- OpenRouter (usage page) --------------------------------------------------------------
// The key stays in the Worker; the browser only ever sees derived numbers.

const OPENROUTER = "https://openrouter.ai/api/v1";

async function openrouter(env, path) {
  if (!env.OPENROUTER_API_KEY) return { status: 501, data: null, error: "not_configured" };
  try {
    const res = await fetch(`${OPENROUTER}${path}`, {
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(JSON.stringify({ ai_panel_upstream: { where: "openrouter", path, status: res.status } }));
      return { status: res.status, data: null, error: "upstream_error" };
    }
    return { status: res.status, data };
  } catch (err) {
    // The text of a fetch failure (host, TLS, timeout) stays in the Worker log; the browser
    // only ever receives the generic code, which the router may translate.
    console.error(
      JSON.stringify({
        ai_panel_upstream: { where: "openrouter", path, status: 502, detail: String(err?.message || err).slice(0, 300) },
      }),
    );
    return { status: 502, data: null, error: "upstream_error" };
  }
}

export async function openrouterCredits(env) {
  return openrouter(env, "/credits");
}

export async function openrouterKey(env) {
  return openrouter(env, "/key");
}

export async function openrouterModels(env) {
  return openrouter(env, "/models");
}
