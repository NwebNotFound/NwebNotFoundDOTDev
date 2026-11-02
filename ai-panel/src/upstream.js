// Hermes client. Every call goes through the Cloudflare Tunnel hostname to the loopback
// origin-proxy, which verifies the shared secret and injects the real Hermes key.
// Nothing in this module ever puts a key in a response body.

const JSON_TIMEOUT_MS = 25_000;

export function bots(env) {
  return String(env.PANEL_BOTS || "cloudflare,minecraft,discord,homelab")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const BOT_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function isBot(env, name) {
  return typeof name === "string" && BOT_NAME.test(name) && bots(env).includes(name);
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
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    return new Response(JSON.stringify({ error: "upstream_error", status: res.status, detail }), {
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
  if (!env.OPENROUTER_API_KEY) return { status: 501, data: null, error: "OPENROUTER_API_KEY not set" };
  try {
    const res = await fetch(`${OPENROUTER}${path}`, {
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { status: res.status, data: null, error: `OpenRouter ${res.status}` };
    return { status: res.status, data };
  } catch (err) {
    return { status: 502, data: null, error: String(err && err.message) };
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
