// AI-Panel Worker — router and API handlers.
// Everything the browser calls lives under /api/*; everything else is a static asset.

import * as auth from "./auth.js";
import * as rl from "./ratelimit.js";
import * as log from "./log.js";
import * as up from "./upstream.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });

const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { location, "cache-control": "no-store", ...headers } });

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

function upstreamFailure(err) {
  if (err instanceof up.UpstreamError) {
    return json({ error: err.status === 503 ? "upstream_not_configured" : "upstream_unreachable", detail: err.message }, err.status);
  }
  return json({ error: "internal_error" }, 500);
}

// ---------------------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------------------

async function handleLogin(req, env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return json({ error: "auth_not_configured" }, 503);
  }
  const limit = rl.take("auth", clientIp(req));
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
    log.record({ method: "GET", path: "/auth/callback", status: 403, user: user.id, note: "not_allowed" });
    return fail("not_allowed");
  }

  const session = await auth.createSession(env, user);
  const csrf = auth.randomToken(24);
  const headers = new Headers({ location: "/", "cache-control": "no-store" });
  headers.append("set-cookie", auth.cookie(auth.SESSION_COOKIE, session, auth.SESSION_SECONDS));
  headers.append("set-cookie", auth.cookie(auth.CSRF_COOKIE, csrf, auth.SESSION_SECONDS, { httpOnly: false }));
  headers.append("set-cookie", clearState);
  return new Response(null, { status: 302, headers });
}

function handleLogout() {
  const headers = new Headers({ location: "/", "cache-control": "no-store" });
  headers.append("set-cookie", auth.clearCookie(auth.SESSION_COOKIE));
  headers.append("set-cookie", auth.clearCookie(auth.CSRF_COOKIE));
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------------------

async function listBots(env) {
  const { status, data } = await up.call(env, "dash", "/api/profiles");
  if (status >= 400) return json({ error: data?.error || "profiles_unavailable", status }, 502);
  const rows = Array.isArray(data?.profiles) ? data.profiles : Array.isArray(data) ? data : [];
  const allowed = up.bots(env);
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
    others: rows.filter((p) => !allowed.includes(p.name)).map((p) => p.name),
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
  if (status >= 400) return json({ error: "create_failed", detail: data?.detail || data?.error || null }, status);
  return json({ ok: true, name, panel_enabled: up.bots(env).includes(name), result: data });
}

async function getSoul(env, bot) {
  const { status, data } = await up.call(env, "dash", `/api/profiles/${bot}/soul`);
  if (status >= 400) return json({ error: "soul_unavailable" }, status === 404 ? 404 : 502);
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
  if (status >= 400) return json({ error: "soul_write_failed", detail: data?.detail || null }, status);
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
  if (status >= 400) return json({ error: "options_unavailable", detail: data?.detail || null }, 502);
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
  if (status >= 400) return json({ error: "model_set_failed", detail: data?.detail || data?.error || null }, status);
  return json({ ok: true, bot, provider, model });
}

// ---------------------------------------------------------------------------------------
// Cron jobs
// ---------------------------------------------------------------------------------------

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function getJobs(env, bot) {
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs?include_disabled=true`);
  if (status >= 400) return json({ error: "jobs_unavailable", detail: data?.error || null }, 502);
  return json({ bot, jobs: Array.isArray(data?.jobs) ? data.jobs : [] });
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
  if (status >= 400) return json({ error: "job_create_failed", detail: data?.error || null }, status);
  return json({ ok: true, job: data?.job || null });
}

async function patchJob(env, bot, id, body) {
  if (!JOB_ID.test(id)) return json({ error: "invalid_job_id" }, 400);
  const allowed = ["name", "schedule", "prompt", "deliver", "skills", "repeat", "enabled"];
  const patch = {};
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
  if (!Object.keys(patch).length) return json({ error: "nothing_to_update" }, 400);
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs/${id}`, { method: "PATCH", body: patch });
  if (status >= 400) return json({ error: "job_update_failed", detail: data?.error || null }, status);
  return json({ ok: true, job: data?.job || null });
}

async function deleteJob(env, bot, id, url) {
  if (!JOB_ID.test(id)) return json({ error: "invalid_job_id" }, 400);
  if (url.searchParams.get("confirm") !== "1") {
    return json({ error: "confirm_required", message: "Cron-Job wirklich löschen?" }, 409);
  }
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs/${id}`, { method: "DELETE" });
  if (status >= 400) return json({ error: "job_delete_failed", detail: data?.error || null }, status);
  return json({ ok: true });
}

async function jobAction(env, bot, id, action) {
  if (!JOB_ID.test(id)) return json({ error: "invalid_job_id" }, 400);
  if (!["pause", "resume", "run"].includes(action)) return json({ error: "invalid_action" }, 400);
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/jobs/${id}/${action}`, { method: "POST", body: {} });
  if (status >= 400) return json({ error: "job_action_failed", detail: data?.error || null }, status);
  return json({ ok: true, action, job: data?.job || null });
}

// ---------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------

async function getSessions(env, bot, url) {
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/sessions?limit=${limit}`);
  if (status >= 400) return json({ error: "sessions_unavailable", detail: data?.error || null }, 502);
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
  if (!JOB_ID.test(sid)) return json({ error: "invalid_session_id" }, 400);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
  const { status, data } = await up.call(env, "gw", `/p/${bot}/api/sessions/${sid}/messages?limit=${limit}`);
  if (status >= 400) return json({ error: "messages_unavailable", detail: data?.error || null }, 502);
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

async function startRun(env, bot, body) {
  const input = String(body.input || "").trim();
  if (!input) return json({ error: "input_required" }, 400);
  if (input.length > 20_000) return json({ error: "input_too_long" }, 413);
  const payload = { model: "hermes-agent", input };
  const continueId = body.session_id || body.session_key;
  if (continueId) payload.session_id = String(continueId);
  const { status, data } = await up.call(env, "gw", `/p/${bot}/v1/runs`, { method: "POST", body: payload });
  if (status >= 400) {
    return json({ error: "run_start_failed", detail: data?.error?.message || data?.error || null }, status);
  }
  return json({ ok: true, run_id: data?.run_id, session_id: data?.session_id || null, status: data?.status || "queued" });
}

async function runEvents(env, bot, runId, req) {
  if (!JOB_ID.test(runId)) return json({ error: "invalid_run_id" }, 400);
  const res = await up.stream(env, "gw", `/p/${bot}/v1/runs/${runId}/events`, { method: "GET" });
  return await up.pipeSse(res);
}

async function runAction(env, bot, runId, action, body) {
  if (!JOB_ID.test(runId)) return json({ error: "invalid_run_id" }, 400);
  let payload;
  if (action === "approval") {
    const choice = String(body.choice || "").toLowerCase();
    if (!["once", "session", "always", "deny"].includes(choice)) return json({ error: "invalid_choice" }, 400);
    payload = { choice };
    if (body.request_id) payload.request_id = String(body.request_id);
    if (body.all === true) payload.all = true;
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
  if (status >= 400) return json({ error: `${action}_failed`, detail: data?.error?.message || data?.error || null }, status);
  return json({ ok: true, action, result: data });
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
  const [credits, key, modelsRes] = await Promise.all([
    up.openrouterCredits(env),
    up.openrouterKey(env),
    up.openrouterModels(env),
  ]);

  const creditData = credits.data?.data || credits.data || null;
  const keyData = key.data?.data || key.data || null;

  const perBot = [];
  const daily = new Map();
  const modelIds = new Map();
  const recent = [];
  const now = Date.now() / 1000;

  const botRows = await Promise.all(
    up.bots(env).map(async (bot) => {
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
      error: credits.error || key.error || null,
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
    prices_error: modelsRes.error || null,
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
    return json({
      ok: true,
      upstream: Boolean(up.origin(env)),
      auth: Boolean(env.DISCORD_CLIENT_ID && env.SESSION_SECRET && env.ALLOWED_DISCORD_ID),
      bots: up.bots(env),
      now: new Date().toISOString(),
    });
  }

  if (path === "/auth/login") return handleLogin(request, env);
  if (path === "/auth/callback") return handleCallback(request, env, url);
  if (path === "/auth/logout") return handleLogout();

  if (!path.startsWith("/api/")) {
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  }

  // ---- authenticated API ----
  const user = await auth.currentUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  ctx.user = user;

  const limit = rl.take("api", user.id);
  if (!limit.ok) {
    return json({ error: "rate_limited", retry_after: limit.retryAfter }, 429, { "retry-after": String(limit.retryAfter) });
  }
  if (method !== "GET" && !auth.csrfOk(request, url)) return json({ error: "csrf_failed" }, 403);

  const cookies = auth.parseCookies(request);
  const csrf = cookies[auth.CSRF_COOKIE] || "";

  if (path === "/api/me") {
    return json({ user: { id: user.id, name: user.name, avatar: user.avatar }, csrf, bots: up.bots(env) });
  }
  if (path === "/api/log") {
    return json({ entries: log.recent(Number(url.searchParams.get("limit")) || 50) });
  }
  if (path === "/api/usage") return await usage(env);

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
  if (!up.isBot(env, bot)) return json({ error: "unknown_bot" }, 404);
  const rest = m[2] || "";

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
    const chatLimit = rl.take("chat", user.id);
    if (!chatLimit.ok) return json({ error: "rate_limited", retry_after: chatLimit.retryAfter }, 429);
    return await startRun(env, bot, body);
  }

  if (rest === "/quick") {
    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await readJson(request);
    if (!body) return json({ error: "invalid_json" }, 400);
    const chatLimit = rl.take("chat", user.id);
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
      return json(data ?? { error: "empty" }, status);
    }
    if (action === "events") {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return await runEvents(env, bot, runId, request);
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
      console.error("ai-panel error", err && err.stack ? err.stack : String(err));
      res = json({ error: "internal_error" }, 500);
    }
  }
  if (path.startsWith("/api/") || path.startsWith("/auth/")) {
    log.record({
      method,
      path,
      status: res?.status ?? 0,
      ms: Date.now() - started,
      bot: ctx.bot,
      user: ctx.user?.id,
    });
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const res = await handle(request, env);
    // Streaming bodies must not be touched here; handle() already returned them.
    return res;
  },
};
