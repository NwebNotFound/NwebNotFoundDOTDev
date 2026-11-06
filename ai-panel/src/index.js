// AI-Panel Worker — router and API handlers.
// Everything the browser calls lives under /api/*; everything else is a static asset.
//
// Two rules this file keeps:
//   1. No upstream error text ever reaches the browser. Details go to the Worker log; the
//      response carries a generic code the SPA can translate.
//   2. Every response leaves with the security headers (CSP, frame-ancestors 'none', …).

import * as auth from "./auth.js";
import * as up from "./upstream.js";
import * as store from "./store.js";
import { teeSseFrames } from "./sse-tap.js";
import { clampInt, redactText, redactValue, sessionKind } from "./redact.js";
import * as crewRoutes from "./crew-routes.js";

export { PanelStore } from "./store.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

// No inline script/style anywhere in the SPA, so 'self' is enough — no 'unsafe-inline'.
const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://cdn.discordapp.com",
    "connect-src 'self'",
    "font-src 'self'",
    "manifest-src 'self'",
  ].join("; "),
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
  "cross-origin-opener-policy": "same-origin",
};

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...SECURITY_HEADERS, ...headers } });

const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { location, "cache-control": "no-store", ...SECURITY_HEADERS, ...headers } });

/** Add the security headers to a response we did not build ourselves (assets, SSE). */
function withSecurity(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  const nullBody = res.status === 204 || res.status === 304 || res.status === 101;
  return new Response(nullBody ? null : res.body, { status: res.status, statusText: res.statusText, headers });
}

function clientIp(req) {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
}

async function readJson(req) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return null;
  }
}

/** Upstream failures: generic code to the browser, the real reason to the log. */
function upstreamProblem(where, status, data) {
  let detail = data;
  if (data && typeof data === "object") detail = data.error ?? data.detail ?? data.message ?? data;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? null);
  // Redact before truncating: upstream error text can quote the request or a tool's output.
  console.error(JSON.stringify({ ai_panel_upstream: { where, status, detail: redactText(String(text)).slice(0, 300) } }));
}

function upstreamFailure(err) {
  let status = err instanceof up.UpstreamError ? err.status : 502;
  // Never forward an upstream 401/403: the browser would treat it as its own session expiring.
  if (status === 401 || status === 403 || !status) status = 502;
  console.error(JSON.stringify({ ai_panel_upstream: { where: "transport", status, detail: redactText(String(err?.message || err)).slice(0, 300) } }));
  return json({ error: status === 503 ? "upstream_not_configured" : "upstream_unreachable" }, status);
}

/**
 * Usage data comes from OpenRouter, not from the Hermes origin, so it has its own error path.
 * Only a closed set of codes may reach the browser: the two upstream.js returns are translated
 * to a human message, anything else is logged here and collapsed into the same generic text.
 */
const USAGE_ERRORS = { not_configured: "Kein OpenRouter-Key", upstream_error: "Upstream-Fehler" };
const GENERIC_UPSTREAM_ERROR = "Upstream-Fehler";

function usageError(res, where) {
  const code = res && res.error;
  if (!code) return null;
  if (USAGE_ERRORS[code]) return USAGE_ERRORS[code];
  console.error(
    JSON.stringify({ ai_panel_upstream: { where, status: Number(res?.status) || 0, detail: redactText(String(code)).slice(0, 300) } }),
  );
  return GENERIC_UPSTREAM_ERROR;
}

// ---------------------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------------------

async function handleLogin(req, env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return json({ error: "auth_not_configured" }, 503);
  }
  const limit = await store.rateTake(env, "auth", clientIp(req));
  if (!limit.ok) return json({ error: "rate_limited", retry_after: limit.retryAfter }, 429);
  const state = auth.randomToken(24);
  const sealed = await auth.sign(env.SESSION_SECRET, {
    n: state,
    exp: Math.floor(Date.now() / 1000) + auth.STATE_SECONDS,
  });
  return redirect(auth.authorizeUrl(env, state), {
    "set-cookie": auth.cookie(auth.STATE_COOKIE, sealed, auth.STATE_SECONDS),
  });
}

async function handleCallback(req, env, url) {
  const clearState = auth.clearCookie(auth.STATE_COOKIE);
  const fail = (reason) => redirect(`/auth/denied?reason=${encodeURIComponent(reason)}`, { "set-cookie": clearState });

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return fail("missing_code");

  const sealed = auth.parseCookies(req)[auth.STATE_COOKIE];
  const payload = await auth.verify(env.SESSION_SECRET, sealed);
  if (!payload || !auth.safeEq(payload.n, state)) return fail("bad_state");

  const token = await auth.exchangeCode(env, code);
  if (!token) return fail("token_exchange");
  const user = await auth.fetchDiscordUser(token.access_token);
  if (!user) return fail("user_fetch");

  if (!env.ALLOWED_DISCORD_ID || !auth.safeEq(user.id, env.ALLOWED_DISCORD_ID)) {
    await store.logAppend(env, { method: "GET", path: "/auth/callback", status: 403, user: user.id, note: "not_allowed" });
    return fail("not_allowed");
  }

  const session = await auth.createSession(env, user);
  const csrf = auth.randomToken(24);
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("location", "/");
  headers.set("cache-control", "no-store");
  headers.append("set-cookie", auth.cookie(auth.SESSION_COOKIE, session, auth.SESSION_SECONDS));
  headers.append("set-cookie", auth.cookie(auth.CSRF_COOKIE, csrf, auth.SESSION_SECONDS, { httpOnly: false }));
  headers.append("set-cookie", clearState);
  return new Response(null, { status: 302, headers });
}

/** POST only: a GET logout is CSRF-able (an <img src> would sign Nils out). */
function handleLogout(req, env, url) {
  if (req.method !== "POST") return json({ error: "method_not_allowed", hint: "POST with X-CSRF-Token" }, 405);
  if (!auth.csrfOk(req, url)) return json({ error: "csrf_failed" }, 403);
  // Drop this isolate's cached revocation marker right away: after a logout the next request
  // must re-read the store instead of serving a value cached before the sign-out.
  store.invalidateRevokedCache();
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.append("set-cookie", auth.clearCookie(auth.SESSION_COOKIE));
  headers.append("set-cookie", auth.clearCookie(auth.CSRF_COOKIE));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

/** Sign out everywhere: bump the store marker so every issued cookie stops validating. */
async function handleLogoutAll(env) {
  // revokeAll clears every cached marker for the user before it writes the fresh one. If the
  // marker cannot be persisted the sign-out did not happen: say so instead of answering ok.
  let before;
  try {
    before = await store.revokeAll(env);
  } catch (err) {
    if (err instanceof store.RevocationUnavailableError) return json({ error: "revoke_failed" }, 503);
    throw err;
  }
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.append("set-cookie", auth.clearCookie(auth.SESSION_COOKIE));
  headers.append("set-cookie", auth.clearCookie(auth.CSRF_COOKIE));
  return new Response(JSON.stringify({ ok: true, revoked_before: before }), { status: 200, headers });
}

// ---------------------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------------------

async function listBots(env) {
  const { status, data } = await up.call(env, "dash", "/api/profiles");
  if (status >= 400) {
    upstreamProblem("profiles", status, data);
    return json({ error: "profiles_unavailable" }, 502);
  }
  const rows = Array.isArray(data?.profiles) ? data.profiles : Array.isArray(data) ? data : [];
  const allowed = await up.botList(env, { fresh: true });
  const byName = new Map(rows.map((p) => [p.name, p]));
  return json({
    bots: allowed.map((name) => {
      const p = byName.get(name);
      return {
        name,
        exists: Boolean(p),
        description: p?.description || "",
        model: p?.model || null,
        provider: p?.provider || null,
        gateway_running: Boolean(p?.gateway_running),
        is_default: Boolean(p?.is_default),
      };
    }),
  });
}

async function createBot(env, body) {
  const name = String(body.name || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) return json({ error: "invalid_name" }, 400);
  const payload = {
    name,
    description: String(body.description || ""),
    clone_from_default: body.clone_from_default !== false,
  };
  if (body.soul) payload.soul = String(body.soul);
  const { status, data } = await up.call(env, "dash", "/api/profiles", { method: "POST", body: payload });
  if (status >= 400) {
    upstreamProblem("create_profile", status, data);
    return json({ error: "create_failed" }, status === 409 ? 409 : 502);
  }
  // The allowlist now comes from the live profile list, so the new bot works immediately —
  // no PANEL_BOTS edit, no redeploy. (Its gateway key still has to exist in the proxy .env.)
  up.invalidateBots(env);
  const names = await up.botList(env, { fresh: true });
  return json({ ok: true, name, panel_enabled: names.includes(name), result: data });
}

async function getSoul(env, bot) {
  const { status, data } = await up.call(env, "dash", `/api/profiles/${bot}/soul`);
  if (status >= 400) {
    upstreamProblem("soul_read", status, data);
    return json({ error: "soul_unavailable" }, status === 404 ? 404 : 502);
  }
  return json({ bot, content: data?.content || "", exists: Boolean(data?.exists) });
}

async function putSoul(env, bot, body) {
  if (body.confirm !== true) return json({ error: "confirm_required", message: `SOUL.md für ${bot} überschreiben?` }, 409);
  const content = String(body.content ?? "");
  if (content.length > 200_000) return json({ error: "too_large" }, 413);
  const { status, data } = await up.call(env, "dash", `/api/profiles/${bot}/soul`, {
    method: "PUT",
    body: { content },
  });
  if (status >= 400) {
    upstreamProblem("soul_write", status, data);
    return json({ error: "soul_write_failed" }, status === 404 ? 404 : 502);
  }
  return json({ ok: true, bot, bytes: content.length });
}

// ---------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------

function normalizeOptions(data) {
  const providers = Array.isArray(data?.providers) ? data.providers : [];
  return {
    current: { provider: data?.provider || "", model: data?.model || "" },
    providers: providers.map((p) => ({
      slug: p.slug || p.provider || "",
      name: p.name || p.slug || "",
      is_current: Boolean(p.is_current),
      models: (Array.isArray(p.models) ? p.models : [])
        .map((m) => (typeof m === "string" ? { id: m, name: m } : { id: m.id || m.model || "", name: m.name || m.id || "" }))
        .filter((m) => m.id),
    })).filter((p) => p.slug),
  };
}

async function getModels(env, bot) {
  const { status, data } = await up.call(env, "dash", `/api/model/options?profile=${encodeURIComponent(bot)}`);
  if (status >= 400) {
    upstreamProblem("model_options", status, data);
    return json({ error: "options_unavailable" }, 502);
  }
  return json({ bot, ...normalizeOptions(data) });
}

async function setModel(env, bot, body) {
  const provider = String(body.provider || "").trim();
  const model = String(body.model || "").trim();
  if (!provider || !model) return json({ error: "provider_and_model_required" }, 400);
  const payload = {
    scope: "main",
    provider,
    model,
    confirm_expensive_model: body.confirm === true,
  };
  const { status, data } = await up.call(env, "dash", `/api/model/set?profile=${encodeURIComponent(bot)}`, {
    method: "POST",
    body: payload,
  });
  if (data && data.confirm_required) {
    return json(
      { confirm_required: true, message: data.confirm_message || "Teures Modell — bestätigen?", provider, model },
      409,
    );
  }
  if (status >= 400) {
    upstreamProblem("model_set", status, data);
    return json({ error: "model_set_failed" }, status === 404 ? 404 : 502);
  }
  return json({ ok: true, bot, provider, model });
}

// ---------------------------------------------------------------------------------------
// Cron jobs
// ---------------------------------------------------------------------------------------

const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function getJobs(env, bot) {
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs?include_disabled=true`);
  if (status >= 400) {
    upstreamProblem("jobs_list", status, data);
    return json({ error: "jobs_unavailable" }, 502);
  }
  return json({ bot, jobs: Array.isArray(data?.jobs) ? redactValue(data.jobs) : [] });
}

async function createJob(env, bot, body) {
  const name = String(body.name || "").trim();
  const schedule = String(body.schedule || "").trim();
  const prompt = String(body.prompt || "").trim();
  if (!name || !schedule) return json({ error: "name_and_schedule_required" }, 400);
  if (prompt.length > 5000) return json({ error: "prompt_too_long" }, 413);
  const payload = { name, schedule, prompt };
  if (body.deliver) payload.deliver = String(body.deliver);
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs`, { method: "POST", body: payload });
  if (status >= 400) {
    upstreamProblem("job_create", status, data);
    return json({ error: "job_create_failed" }, status === 400 ? 400 : 502);
  }
  return json({ ok: true, job: data?.job || null });
}

async function patchJob(env, bot, id, body) {
  if (!ID.test(id)) return json({ error: "invalid_job_id" }, 400);
  const allowed = ["name", "schedule", "prompt", "deliver", "skills", "repeat", "enabled"];
  const patch = {};
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
  if (!Object.keys(patch).length) return json({ error: "nothing_to_update" }, 400);
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs/${id}`, { method: "PATCH", body: patch });
  if (status >= 400) {
    upstreamProblem("job_patch", status, data);
    return json({ error: "job_update_failed" }, status === 404 ? 404 : 502);
  }
  return json({ ok: true, job: data?.job || null });
}

async function deleteJob(env, bot, id, url) {
  if (!ID.test(id)) return json({ error: "invalid_job_id" }, 400);
  if (url.searchParams.get("confirm") !== "1") {
    return json({ error: "confirm_required", message: "Cron-Job wirklich löschen?" }, 409);
  }
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs/${id}`, { method: "DELETE" });
  if (status >= 400) {
    upstreamProblem("job_delete", status, data);
    return json({ error: "job_delete_failed" }, status === 404 ? 404 : 502);
  }
  return json({ ok: true });
}

async function jobAction(env, bot, id, action) {
  if (!ID.test(id)) return json({ error: "invalid_job_id" }, 400);
  if (!["pause", "resume", "run"].includes(action)) return json({ error: "invalid_action" }, 400);
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs/${id}/${action}`, { method: "POST", body: {} });
  if (status >= 400) {
    upstreamProblem("job_action", status, data);
    return json({ error: "job_action_failed" }, status === 404 ? 404 : 502);
  }
  return json({ ok: true, action, job: data?.job || null });
}

// ---------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------

async function getSessions(env, bot, url) {
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/sessions?limit=${limit}`);
  if (status >= 400) {
    upstreamProblem("sessions_list", status, data);
    return json({ error: "sessions_unavailable" }, 502);
  }
  const rows = Array.isArray(data?.sessions) ? data.sessions : Array.isArray(data) ? data : [];
  return json({ bot, sessions: rows.map(trimSession) });
}

function epoch(value) {
  if (typeof value === "number") return value > 1e12 ? Math.round(value / 1000) : Math.round(value);
  if (typeof value === "string" && value) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return epoch(n);
    const t = Date.parse(value);
    if (Number.isFinite(t)) return Math.round(t / 1000);
  }
  return null;
}

function trimSession(s) {
  const cost = Number(s.actual_cost_usd || s.estimated_cost_usd || s.cost_usd || 0) || 0;
  return {
    id: s.id || s.session_id,
    title: s.title || s.preview || "(ohne Titel)",
    model: s.model || null,
    provider: s.provider || null,
    source: s.source || null,
    started_at: epoch(s.started_at || s.created_at),
    last_active: epoch(s.last_active || s.updated_at || s.ended_at || s.started_at),
    messages: Number(s.message_count || 0) || 0,
    input_tokens: Number(s.input_tokens || 0) || 0,
    output_tokens: Number(s.output_tokens || 0) || 0,
    api_calls: Number(s.api_call_count || 0) || 0,
    cost_usd: cost,
  };
}

async function getMessages(env, bot, sid, url) {
  if (!ID.test(sid)) return json({ error: "invalid_session_id" }, 400);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/sessions/${sid}/messages?limit=${limit}`);
  if (status >= 400) {
    upstreamProblem("session_messages", status, data);
    return json({ error: "messages_unavailable" }, 502);
  }
  const rows = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
  return json({
    bot,
    session_id: sid,
    messages: rows.map((m) => ({
      role: m.role || "?",
      content: typeof m.content === "string" ? m.content.slice(0, 20_000) : m.content ?? null,
      ts: epoch(m.timestamp || m.created_at),
      tool: m.tool_name || m.name || null,
    })),
  });
}

// ---------------------------------------------------------------------------------------
// Runs (chat)
// ---------------------------------------------------------------------------------------

const CONVERSATION_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** A readable thread title from the first message. */
function conversationTitle(input) {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (!text) return "Neuer Chat";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function newConversationId() {
  return `c_${crypto.randomUUID().replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}`;
}

/** The conversation a run belongs to, for the SSE tap and the poll fallback. */
async function conversationForRun(env, bot, runId) {
  const rows = await store.runRecent(env, { bot, limit: 100 });
  const row = rows.find((r) => r.run_id === runId);
  return row?.conversation_id || "";
}

async function startRun(env, bot, body) {
  const input = String(body.input || "").trim();
  if (!input) return json({ error: "input_required" }, 400);
  if (input.length > 20_000) return json({ error: "input_too_long" }, 413);
  const payload = { model: "hermes-agent", input };
  const continueId = body.session_id || body.session_key;
  if (continueId) {
    if (!ID.test(String(continueId))) return json({ error: "invalid_session_id" }, 400);
    payload.session_id = String(continueId);
  }
  const { status, data } = await up.call(env, "gw", `/p/${bot}/v1/runs`, { method: "POST", body: payload });
  if (status >= 400) {
    upstreamProblem("run_start", status, data);
    return json({ error: "run_start_failed" }, status === 400 ? 400 : 502);
  }
  const runId = data?.run_id;
  let conversationId = null;
  if (runId) {
    // The panel's own transcript: the thread is created on the first message and reused after.
    const wanted = String(body.conversation_id || body.conversationId || "");
    const isNew = !CONVERSATION_ID.test(wanted);
    const conv = await store.conversationUpsert(env, {
      id: isNew ? newConversationId() : wanted,
      bot,
      ...(isNew ? { title: conversationTitle(input) } : {}),
      session_id: data?.session_id || payload.session_id || null,
      run_id: String(runId),
    });
    conversationId = conv.id;
    await store.messageAppend(env, {
      conversation_id: conversationId,
      role: "user",
      kind: "message",
      content: input,
      run_id: String(runId),
    });
    await store.runRecord(env, {
      bot,
      run_id: String(runId),
      conversation_id: conversationId,
      session_id: data?.session_id || payload.session_id || null,
      input,
      status: String(data?.status || "started"),
      started_at: Date.now(),
    });
  }
  return json({
    ok: true,
    run_id: runId,
    session_id: data?.session_id || null,
    conversation_id: conversationId,
    status: data?.status || "queued",
  });
}

// --- transcript recording from the run stream -------------------------------------------------
function textOf(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Record one run event into the conversation transcript. Returns a promise. */
function recordRunEvent(env, conversationId, runId, event, acc) {
  if (!conversationId) return Promise.resolve();
  const name = String(event?.event || event?.type || "").toLowerCase();
  const isThinking = name.includes("thinking") || name.includes("reasoning");

  if (name === "approval.request" || name === "approval.requested") {
    const what = textOf(event.command ?? event.description ?? event.message ?? event.prompt).slice(0, 1000);
    return store.messageAppend(env, { conversation_id: conversationId, role: "tool", kind: "approval", content: what, run_id: runId });
  }
  if (["tool.completed", "tool.end", "tool.failed", "tool.error"].includes(name)) {
    const out = textOf(
      event.output ?? event.result ?? event.stdout ?? event.preview ?? (typeof event.error === "string" ? event.error : ""),
    ).slice(0, 2000);
    const failed = event.error === true || (typeof event.error === "string" && event.error.trim() !== "") || event.ok === false;
    return store.messageAppend(env, {
      conversation_id: conversationId,
      role: "tool",
      kind: "tool",
      tool: textOf(event.tool || event.tool_name).slice(0, 80) || "tool",
      content: out,
      ok: !failed,
      run_id: runId,
    });
  }
  if (name === "run.completed" || name === "run.finished") {
    const answer = (textOf(event.output).trim() || acc.text.trim()).slice(0, 20_000);
    return store.messageAppend(env, { conversation_id: conversationId, role: "assistant", kind: "message", content: answer, run_id: runId });
  }
  if (name === "run.failed" || name === "run.error") {
    const reason = textOf(event.error ?? event.message).slice(0, 500);
    return store.messageAppend(env, {
      conversation_id: conversationId,
      role: "assistant",
      kind: "message",
      content: `Fehler: ${reason || "Run fehlgeschlagen"}`,
      run_id: runId,
    });
  }
  const delta = event?.delta ?? event?.text;
  if (typeof delta === "string" && name.includes("delta") && !isThinking) acc.text += delta;
  return Promise.resolve();
}

async function runEvents(env, bot, runId, url) {
  if (!ID.test(runId)) return json({ error: "invalid_run_id" }, 400);
  // The cursor is a query parameter on the gateway route; pass it through untouched so a
  // reconnecting client can resume instead of replaying the whole run.
  const since = url?.searchParams.get("since") || url?.searchParams.get("after") || "";
  const q = since && /^\d{1,12}$/.test(since) ? `?since=${since}` : "";
  const res = await up.stream(env, "gw", `/p/${bot}/v1/runs/${runId}/events${q}`, { method: "GET" });
  return await streamWithTranscript(env, bot, runId, res);
}

/** Forward the run stream and record the transcript on the way through. */
async function streamWithTranscript(env, bot, runId, res) {
  const type = res.headers.get("content-type") || "";
  if (!res.body || (!res.ok && !type.includes("event-stream"))) return await up.pipeSse(res);
  const conversationId = await conversationForRun(env, bot, runId);
  const acc = { text: "" };
  let pending = Promise.resolve();
  const tap = teeSseFrames(
    res.body,
    (event) => {
      pending = pending.then(() => recordRunEvent(env, conversationId, runId, event, acc)).catch(() => {});
    },
    () => pending,
  );
  return new Response(up.sseBody(tap), {
    status: 200,
    headers: up.sseHeaders({ "x-upstream-status": String(res.status) }),
  });
}

const TERMINAL_RUN_STATES = new Set([
  "completed",
  "finished",
  "success",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "stopped",
  "aborted",
]);

function intOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * The gateway's pending approval fields. `/v1/runs/<id>` reports them under `pending_controls`
 * (an object or a list); the id has been seen as both `request_id` and `prompt_id`.
 */
export function pendingControl(data) {
  const pc = data?.pending_controls;
  const rows = Array.isArray(pc) ? pc : Array.isArray(pc?.pending) ? pc.pending : pc && typeof pc === "object" ? [pc] : [];
  const first = rows.find((r) => r && (r.request_id || r.prompt_id)) || rows[0] || null;
  return {
    request_id: first?.request_id ? String(first.request_id) : first?.prompt_id ? String(first.prompt_id) : "",
    execution_generation: intOrNull(first?.execution_generation ?? first?.generation),
  };
}

async function runAction(env, bot, runId, action, body) {
  if (!ID.test(runId)) return json({ error: "invalid_run_id" }, 400);
  let payload;
  if (action === "approval") {
    const choice = String(body.choice || "").toLowerCase();
    if (!["once", "session", "always", "deny"].includes(choice)) return json({ error: "invalid_choice" }, 400);

    // The gateway's session-authority approval endpoint takes exactly
    // {request_id, execution_generation, choice}. Anything else is rejected upstream, and a
    // missing generation makes the approval silently not apply — so resolve them here.
    let requestId = body.request_id ? String(body.request_id).slice(0, 200) : "";
    let generation = intOrNull(body.execution_generation ?? body.generation);
    if (!requestId || generation === null) {
      const { status, data } = await up.call(env, "gw", `/p/${bot}/v1/runs/${runId}`);
      if (status >= 400) {
        upstreamProblem("run_get", status, data);
        return json({ error: "run_unavailable" }, status === 404 ? 404 : 502);
      }
      const pending = pendingControl(data);
      if (!requestId && pending.request_id) requestId = pending.request_id;
      if (generation === null && pending.execution_generation !== null) generation = pending.execution_generation;
    }
    if (!requestId || generation === null) {
      return json(
        {
          error: "approval_context_missing",
          message: "Freigabe-Kontext fehlt (request_id/execution_generation) — Run neu laden und erneut bestätigen.",
        },
        409,
      );
    }
    payload = { request_id: requestId, execution_generation: generation, choice };
  } else if (action === "steer") {
    const input = String(body.input || body.message || "").trim();
    if (!input) return json({ error: "input_required" }, 400);
    payload = { input };
  } else if (action === "stop") {
    payload = {};
  } else {
    return json({ error: "invalid_action" }, 400);
  }
  const { status, data } = await up.call(env, "gw", `/p/${bot}/v1/runs/${runId}/${action}`, { method: "POST", body: payload });
  if (status >= 400) {
    upstreamProblem(`run_${action}`, status, data);
    return json({ error: `${action}_failed` }, status === 400 ? 400 : 502);
  }
  await store.runRecord(env, {
    bot,
    run_id: runId,
    status: action === "approval" ? `approval:${payload.choice}` : action === "stop" ? "stopped" : "steered",
  });
  return json({ ok: true, action, result: redactValue(data) });
}

async function quickChat(env, bot, body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return json({ error: "messages_required" }, 400);
  const res = await up.stream(env, "gw", `/p/${bot}/v1/chat/completions`, {
    method: "POST",
    body: { model: "hermes-agent", messages, stream: true },
  });
  return await up.pipeSse(res);
}

// ---------------------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------------------

function dayKey(ts) {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function usage(env) {
  const [credits, key, modelsRes, bots] = await Promise.all([
    up.openrouterCredits(env),
    up.openrouterKey(env),
    up.openrouterModels(env),
    up.botList(env),
  ]);

  const creditData = credits.data?.data || credits.data || null;
  const keyData = key.data?.data || key.data || null;

  const perBot = [];
  const daily = new Map();
  const modelIds = new Map();
  const recent = [];
  const now = Date.now() / 1000;

  const botRows = await Promise.all(
    bots.map(async (bot) => {
      try {
        const { status, data } = await up.call(env, "gw", `/p/${bot}/api/sessions?limit=100`);
        const rows = status < 400 && Array.isArray(data?.sessions) ? data.sessions.map(trimSession) : [];
        return { bot, rows };
      } catch {
        return { bot, rows: [] };
      }
    }),
  );

  for (const { bot, rows } of botRows) {
    let cost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    for (const r of rows) {
      cost += r.cost_usd;
      inputTokens += r.input_tokens;
      outputTokens += r.output_tokens;
      const d = dayKey(r.last_active);
      if (d && now - (r.last_active || 0) < 8 * 86400) daily.set(d, (daily.get(d) || 0) + r.cost_usd);
      if (r.model) modelIds.set(r.model, (modelIds.get(r.model) || 0) + 1);
      if (r.cost_usd > 0) recent.push({ bot, ...r });
    }
    perBot.push({ bot, sessions: rows.length, cost_usd: round(cost), input_tokens: inputTokens, output_tokens: outputTokens });
  }

  recent.sort((a, b) => (b.last_active || 0) - (a.last_active || 0));

  const allModels = Array.isArray(modelsRes.data?.data) ? modelsRes.data.data : [];
  const wanted = new Set(modelIds.keys());
  const prices = allModels
    .filter((m) => wanted.has(m.id))
    .slice(0, 40)
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      prompt: perMillion(m.pricing?.prompt),
      completion: perMillion(m.pricing?.completion),
    }));

  return json({
    generated_at: new Date().toISOString(),
    openrouter: {
      available: Boolean(creditData || keyData),
      error: usageError(credits, "usage_credits") || usageError(key, "usage_key"),
      total_credits: num(creditData?.total_credits),
      total_usage: num(creditData?.total_usage),
      limit: num(keyData?.limit),
      limit_remaining: num(keyData?.limit_remaining),
      usage: num(keyData?.usage),
      usage_daily: num(keyData?.usage_daily),
      usage_weekly: num(keyData?.usage_weekly),
      usage_monthly: num(keyData?.usage_monthly),
    },
    per_bot: perBot,
    daily: [...daily.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, cost]) => ({ day, cost_usd: round(cost) })),
    recent_requests: recent.slice(0, 25),
    prices,
    prices_error: usageError(modelsRes, "usage_models"),
  });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(v) {
  return Math.round((Number(v) || 0) * 1e6) / 1e6;
}

function perMillion(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1e6 * 1000) / 1000 : null;
}

// ---------------------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------------------

export async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/api/health") {
    // Liveness is public so the browser can tell "panel down" from "tunnel down". Everything
    // else here (which bots exist, whether the store is bound, the session version) is
    // internal detail and only goes to a signed-in user.
    if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
    // An unreadable revocation marker means "treat as signed out" here, never "nothing revoked".
    const revokedNow = await store.revokedBefore(env).catch(() => null);
    const who = revokedNow === null ? null : await auth.currentUser(env, request, { revokedBefore: revokedNow });
    if (!who) return json({ ok: true });
    // The panel's own view plus the origin proxy's: a red "tunnel/gateway" dot here is what the
    // UI shows when things are down, instead of a generic "Load failed" in the chat.
    const [health, bots] = await Promise.all([up.proxyHealth(env), up.botList(env)]);
    return json({
      ok: true,
      authenticated: true,
      upstream: Boolean(up.origin(env)),
      origin: { reachable: Boolean(health), gateway: Boolean(health?.gateway) },
      auth: Boolean(env.DISCORD_CLIENT_ID && env.SESSION_SECRET && env.ALLOWED_DISCORD_ID),
      store: Boolean(env.PANEL_STORE),
      session_version: auth.sessionVersion(env),
      bots,
      now: new Date().toISOString(),
    });
  }

  if (path === "/auth/login") return handleLogin(request, env);
  if (path === "/auth/callback") return handleCallback(request, env, url);
  if (path === "/auth/logout") return handleLogout(request, env, url);

  if (!path.startsWith("/api/")) {
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  }

  // ---- authenticated API ----
  let revoked;
  try {
    revoked = await store.revokedBefore(env);
  } catch (err) {
    // Fail closed: without the marker a revoked (possibly stolen) cookie cannot be told apart.
    if (err instanceof store.RevocationUnavailableError) return json({ error: "store_unavailable" }, 503);
    throw err;
  }
  const user = await auth.currentUser(env, request, { revokedBefore: revoked });
  if (!user) return json({ error: "unauthorized" }, 401);
  ctx.user = user;

  const limit = await store.rateTake(env, "api", user.id);
  if (!limit.ok) {
    return json({ error: "rate_limited", retry_after: limit.retryAfter }, 429, { "retry-after": String(limit.retryAfter) });
  }
  if (method !== "GET" && !auth.csrfOk(request, url)) return json({ error: "csrf_failed" }, 403);

  const cookies = auth.parseCookies(request);
  const csrf = cookies[auth.CSRF_COOKIE] || "";

  if (path === "/api/me") {
    // If the CSRF cookie is missing (cleared cookies, older session), mint one here instead of
    // leaving the UI with an empty token that makes every mutation fail.
    const token = csrf || auth.randomToken(24);
    const headers = csrf
      ? {}
      : { "set-cookie": auth.cookie(auth.CSRF_COOKIE, token, auth.SESSION_SECONDS, { httpOnly: false }) };
    return json(
      { user: { id: user.id, name: user.name, avatar: user.avatar }, csrf: token, bots: await up.botList(env) },
      200,
      headers,
    );
  }
  if (path === "/api/logout-all") {
    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
    return await handleLogoutAll(env);
  }
  if (path === "/api/log") {
    return json({ entries: await store.logRecent(env, Number(url.searchParams.get("limit")) || 50) });
  }
  if (path === "/api/usage") return await usage(env);

  // Crew-Runs lives in crew-routes.js; the router only asks it and passes its own json helper on.
  const crewResponse = await crewRoutes.handle(request, env, url, method, { json, upstreamProblem });
  if (crewResponse) return crewResponse;

  if (path === "/api/runs") {
    if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const botQ = url.searchParams.get("bot") || "";
    if (botQ && !(await up.isBot(env, botQ))) return json({ error: "unknown_bot" }, 404);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 25));
    return json({ runs: await store.runRecent(env, { bot: botQ, limit }) });
  }

  if (path === "/api/bots") {
    if (method === "GET") return await listBots(env);
    if (method === "POST") {
      const body = await readJson(request);
      if (!body) return json({ error: "invalid_json" }, 400);
      return await createBot(env, body);
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  const m = path.match(/^\/api\/bots\/([a-z0-9][a-z0-9_-]{0,31})(\/.*)?$/);
  if (!m) return json({ error: "not_found" }, 404);
  const bot = m[1];
  ctx.bot = bot;
  if (!(await up.isBot(env, bot))) return json({ error: "unknown_bot" }, 404);
  const rest = m[2] || "";

  if (rest === "/conversations") {
    if (method === "GET") {
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 30));
      return json({ bot, conversations: await store.conversationList(env, { bot, limit }) });
    }
    if (method === "POST") {
      const body = (await readJson(request)) || {};
      const conv = await store.conversationUpsert(env, {
        id: newConversationId(),
        bot,
        title: conversationTitle(body.title || "Neuer Chat"),
      });
      return json({ ok: true, conversation: conv });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  const convMatch = rest.match(/^\/conversations\/([A-Za-z0-9_-]{1,64})\/messages$/);
  if (convMatch) {
    const conversationId = convMatch[1];
    if (method === "GET") {
      // Paged: `limit` rows, newest page by default, `before=<seq>` for the page above it.
      const page = await store.messageList(env, {
        conversationId,
        limit: Number(url.searchParams.get("limit")) || store.MESSAGE_PAGE_DEFAULT,
        before: Number(url.searchParams.get("before")) || 0,
      });
      return json({ bot, ...page });
    }
    if (method === "POST") {
      const body = (await readJson(request)) || {};
      const role = String(body.role || "assistant");
      if (!["user", "assistant", "tool"].includes(role)) return json({ error: "invalid_role" }, 400);
      const message = await store.messageAppend(env, {
        conversation_id: conversationId,
        role,
        kind: body.kind || "message",
        content: String(body.content ?? ""),
        tool: body.tool,
        ok: body.ok,
        run_id: body.run_id,
      });
      return json({ ok: true, message });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  if (rest === "/soul") {
    if (method === "GET") return await getSoul(env, bot);
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body) return json({ error: "invalid_json" }, 400);
      return await putSoul(env, bot, body);
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  if (rest === "/models") {
    if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return await getModels(env, bot);
  }

  if (rest === "/model") {
    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await readJson(request);
    if (!body) return json({ error: "invalid_json" }, 400);
    return await setModel(env, bot, body);
  }

  if (rest === "/jobs") {
    if (method === "GET") return await getJobs(env, bot);
    if (method === "POST") {
      const body = await readJson(request);
      if (!body) return json({ error: "invalid_json" }, 400);
      return await createJob(env, bot, body);
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  const jobMatch = rest.match(/^\/jobs\/([A-Za-z0-9_-]{1,64})(?:\/(pause|resume|run))?$/);
  if (jobMatch) {
    const id = jobMatch[1];
    const action = jobMatch[2];
    if (action) {
      if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return await jobAction(env, bot, id, action);
    }
    if (method === "PATCH") {
      const body = await readJson(request);
      if (!body) return json({ error: "invalid_json" }, 400);
      return await patchJob(env, bot, id, body);
    }
    if (method === "DELETE") return await deleteJob(env, bot, id, url);
    return json({ error: "method_not_allowed" }, 405);
  }

  if (rest === "/sessions") {
    if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return await getSessions(env, bot, url);
  }

  const msgMatch = rest.match(/^\/sessions\/([A-Za-z0-9_-]{1,64})\/messages$/);
  if (msgMatch) {
    if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return await getMessages(env, bot, msgMatch[1], url);
  }

  if (rest === "/runs") {
    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await readJson(request);
    if (!body) return json({ error: "invalid_json" }, 400);
    const chatLimit = await store.rateTake(env, "chat", user.id);
    if (!chatLimit.ok) return json({ error: "rate_limited", retry_after: chatLimit.retryAfter }, 429);
    return await startRun(env, bot, body);
  }

  if (rest === "/quick") {
    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await readJson(request);
    if (!body) return json({ error: "invalid_json" }, 400);
    const chatLimit = await store.rateTake(env, "chat", user.id);
    if (!chatLimit.ok) return json({ error: "rate_limited", retry_after: chatLimit.retryAfter }, 429);
    return await quickChat(env, bot, body);
  }

  const runMatch = rest.match(/^\/runs\/([A-Za-z0-9_-]{1,64})(?:\/(events|approval|steer|stop))?$/);
  if (runMatch) {
    const runId = runMatch[1];
    const action = runMatch[2];
    if (!action) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const { status, data } = await up.call(env, "gw", `/p/${bot}/v1/runs/${runId}`);
      if (status >= 400) {
        upstreamProblem("run_get", status, data);
        return json({ error: "run_unavailable" }, status === 404 ? 404 : 502);
      }
      // Polling is also how the SPA recovers a dropped stream, so this is a good moment to
      // refresh the persisted status instead of leaving the row at "started".
      const state = String(data?.status || data?.state || "").toLowerCase();
      if (state) {
        await store.runRecord(env, {
          bot,
          run_id: runId,
          status: state,
          error: TERMINAL_RUN_STATES.has(state) && state !== "completed" && state !== "finished" && state !== "success"
            ? redactText(String(data?.error || data?.detail || state)).slice(0, 200)
            : null,
        });
      }
      const pending = pendingControl(data);
      if (TERMINAL_RUN_STATES.has(state)) {
        const conversationId = await conversationForRun(env, bot, runId);
        const out = typeof data?.output === "string" ? redactText(data.output.trim()) : "";
        if (conversationId && out) {
          await store.messageAppend(env, {
            conversation_id: conversationId,
            role: "assistant",
            kind: "message",
            content: out,
            run_id: runId,
          });
        }
      }
      return json({ ...redactValue(data ?? {}), pending: pending.request_id ? pending : null });
    }
    if (action === "events") {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return await runEvents(env, bot, runId, url);
    }
    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = (await readJson(request)) || {};
    return await runAction(env, bot, runId, action, body);
  }

  return json({ error: "not_found" }, 404);
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const started = Date.now();
  const ctx = { bot: null, user: null };
  let res;
  try {
    res = await route(request, env, ctx);
  } catch (err) {
    if (err instanceof up.UpstreamError) {
      res = upstreamFailure(err);
    } else {
      console.error("ai-panel error", redactText(err && err.stack ? err.stack : String(err)));
      res = json({ error: "internal_error" }, 500);
    }
  }
  if (path.startsWith("/api/") || path.startsWith("/auth/")) {
    await store.logAppend(env, {
      method,
      path,
      status: res?.status ?? 0,
      ms: Date.now() - started,
      bot: ctx.bot,
      user: ctx.user?.id,
    });
  }
  return withSecurity(res);
}

export default {
  async fetch(request, env, ctx) {
    const res = await handle(request, env);
    // Streaming bodies must not be touched here; handle() already returned them.
    return res;
  },
};
