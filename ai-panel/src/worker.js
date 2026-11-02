// KI-Panel. Vertrag und Setup: docs/ai-panel.md
import { cleanSoul, isBotName, keyEnvName } from "./names.js";
import { createRedactor } from "./redact.js";
import { PAGE } from "./page.js";

const HOST = "ai.nwebnotfound.dev";
const BUILTIN = ["cloudflare", "minecraft", "discord", "homelab"];
const JOB_ID = "[A-Za-z0-9_-]{1,80}";
const PROXY = [
  ["POST", /^\/v1\/chat\/completions$/],
  ["GET", /^\/v1\/runs$/],
  ["POST", /^\/v1\/runs$/],
  ["GET", /^\/v1\/runs\/[A-Za-z0-9_-]{1,64}$/],
  ["POST", /^\/v1\/approval$/],
  ["POST", /^\/v1\/steer$/],
  ["POST", /^\/v1\/stop$/],
  ["GET", /^\/v1\/runs\/[A-Za-z0-9_-]{1,64}\/events$/],
  ["GET", /^\/api\/sessions$/],
  ["GET", /^\/api\/jobs$/],
  ["POST", /^\/api\/jobs$/],
  ["PATCH", new RegExp(`^/api/jobs/${JOB_ID}$`)],
  ["DELETE", new RegExp(`^/api/jobs/${JOB_ID}$`)],
  ["POST", new RegExp(`^/api/jobs/${JOB_ID}/(pause|resume|run)$`)],
];
const WINDOW_MS = 60000, LIMIT = 30, SESSION_MS = 30 * 86400000;
const enc = new TextEncoder();
const SECURITY = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" };
const CSP = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://discord.com; object-src 'none'";

const b64u = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
function safeEq(a, b) {
  const aa = enc.encode(String(a ?? "")), bb = enc.encode(String(b ?? ""));
  const n = Math.max(aa.length, bb.length);
  let r = aa.length ^ bb.length;
  for (let i = 0; i < n; i++) r |= (aa[i] || 0) ^ (bb[i] || 0);
  return r === 0;
}
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
async function sign(env, v) { return `${v}.${await hmac(env.AI_SESSION_SECRET, v)}`; }
async function unsign(env, s) {
  if (!s || !env.AI_SESSION_SECRET) return null;
  const i = s.lastIndexOf(".");
  if (i < 1) return null;
  const v = s.slice(0, i);
  return safeEq(s.slice(i + 1), await hmac(env.AI_SESSION_SECRET, v)) ? v : null;
}
const cookies = (req) => {
  const out = {};
  for (const part of (req.headers.get("cookie") || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    try { out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1)); } catch { /* kaputtes Cookie */ }
  }
  return out;
};
const cookie = (name, value, maxAge, path) => `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...SECURITY, "content-type": "application/json; charset=utf-8", ...extra } });
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...SECURITY, "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, ...extra } });
const redirect = (loc, extra = {}) => new Response(null, { status: 302, headers: { ...SECURITY, location: loc, ...extra } });
const authReady = (env) => !!(env.AI_DISCORD_CLIENT_ID && env.AI_DISCORD_CLIENT_SECRET && env.AI_SESSION_SECRET && env.ALLOWED_DISCORD_ID);
const allowed = (env, id) => /^\d{15,21}$/.test(String(env.ALLOWED_DISCORD_ID || "")) && safeEq(String(id || ""), String(env.ALLOWED_DISCORD_ID));
const loopback = (host) => host === "127.0.0.1" || host === "localhost" || host === "::1";
const requestHost = (req) => (req.headers.get("host") || "").replace(/:\d+$/, "").toLowerCase();
const isLocalReq = (req, url) => loopback(requestHost(req)) || loopback(url.hostname);
const clip = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 32);

function httpBase(v) {
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.username || u.password || (u.protocol !== "https:" && u.protocol !== "http:")) return null;
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return u.origin + path;
  } catch { return null; }
}
function loopbackBase(v) {
  const base = httpBase(v);
  if (!base) return null;
  try { return loopback(new URL(base).hostname) ? base : null; } catch { return null; }
}
function testBase(req, url, env, name) {
  const base = loopbackBase(env[name]);
  if (!base) return null;
  if (isLocalReq(req, url) || req.headers.get("x-ai-local") === "1") return base;
  return null;
}
function discordBase(req, url, env) { return testBase(req, url, env, "AI_OAUTH_BASE") || "https://discord.com"; }
function openRouterBase(req, url, env) { return testBase(req, url, env, "OPENROUTER_ORIGIN") || "https://openrouter.ai"; }
function redirectUri(req, url) {
  const host = req.headers.get("host") || "";
  if ((isLocalReq(req, url) || req.headers.get("x-ai-local") === "1") && loopback(host.replace(/:\d+$/, ""))) return `http://${host}/auth/callback`;
  return `https://${HOST}/auth/callback`;
}
function originOk(req) {
  const o = req.headers.get("origin");
  if (!o) return false;
  try {
    const u = new URL(o);
    const here = new URL(req.url);
    if (u.origin === here.origin) return true;
    if (loopback(u.hostname)) return true;
    return u.hostname === HOST && u.protocol === "https:";
  } catch { return false; }
}
function accessHeaders(env) {
  if (!env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) return {};
  return { "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET };
}
function knownSecrets(env, extra) {
  return [env.AI_DISCORD_CLIENT_SECRET, env.AI_SESSION_SECRET, env.HERMES_DASHBOARD_SESSION_TOKEN, env.OPENROUTER_KEY, env.CF_ACCESS_CLIENT_ID, env.CF_ACCESS_CLIENT_SECRET, env.HERMES_KEY_CLOUDFLARE, env.HERMES_KEY_MINECRAFT, env.HERMES_KEY_DISCORD, env.HERMES_KEY_HOMELAB, extra];
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function getUser(req, env) {
  const raw = await unsign(env, cookies(req).ai_session);
  if (!raw) return null;
  const row = await env.DB.prepare("SELECT id, discord_id, username, global_name, expires_at FROM ai_sessions WHERE id = ?").bind(raw).first();
  if (!row || row.expires_at < Date.now() || !allowed(env, row.discord_id)) return null;
  return row;
}
function botKey(env, name) {
  const slot = keyEnvName(name);
  const value = slot && env[slot];
  return typeof value === "string" && value ? value : null;
}
async function writeLog(env, info) {
  const res = await env.DB.prepare("INSERT INTO ai_log (at, session_id, bot, path, status, model) VALUES (?, ?, ?, ?, ?, ?)").bind(Date.now(), info.session || null, info.bot || null, String(info.path || "/").slice(0, 180), info.status, info.model || null).run();
  return res.meta?.last_row_id || null;
}
function costOf(pricing, usage) {
  const p = num(pricing?.prompt), c = num(pricing?.completion);
  const tin = num(usage?.prompt_tokens ?? usage?.input_tokens), tout = num(usage?.completion_tokens ?? usage?.output_tokens);
  if (p == null || c == null || tin == null || tout == null) return null;
  return tin * p + tout * c;
}
async function rememberUsage(env, id, usage, pricing) {
  if (!id || !usage) return;
  const tin = num(usage.prompt_tokens ?? usage.input_tokens), tout = num(usage.completion_tokens ?? usage.output_tokens);
  await env.DB.prepare("UPDATE ai_log SET tokens_in = ?, tokens_out = ?, cost_usd = ? WHERE id = ?").bind(tin, tout, costOf(pricing, usage), id).run();
}

const FAIL = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Anmeldung</title><body style="font-family:-apple-system,sans-serif;padding:2rem"><h1>Anmeldung abgebrochen.</h1><p><a href="/auth/login">Noch einmal anmelden</a></p></body></html>`;
const DENY = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kein Zugang</title><body style="font-family:-apple-system,sans-serif;padding:2rem"><h1>Kein Zugang.</h1><p>Dieser Discord-Account darf das Panel nicht öffnen.</p></body></html>`;

async function login(req, env, url) {
  if (!authReady(env)) return html(`<!doctype html><html lang="de"><meta charset="utf-8"><title>KI</title><body style="font-family:-apple-system,sans-serif;padding:2rem"><h1>Login ist noch nicht eingerichtet.</h1></body></html>`, 503);
  const state = rand(24);
  const signed = await sign(env, `${state}|${Date.now() + 600000}`);
  const q = new URLSearchParams({ client_id: env.AI_DISCORD_CLIENT_ID, response_type: "code", redirect_uri: redirectUri(req, url), scope: "identify", state });
  return redirect(`${discordBase(req, url, env)}/oauth2/authorize?${q}`, { "set-cookie": cookie("ai_oauth", signed, 600, "/auth") });
}
async function callback(req, env, url) {
  const clear = cookie("ai_oauth", "", 0, "/auth");
  if (!authReady(env)) return redirect("/", { "set-cookie": clear });
  const raw = await unsign(env, cookies(req).ai_oauth);
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!raw || !code || !state) return html(FAIL, 400, { "set-cookie": clear });
  const [s, exp] = raw.split("|");
  if (!safeEq(s || "", state) || !(Number(exp) > Date.now())) return html(FAIL, 400, { "set-cookie": clear });
  const base = discordBase(req, url, env);
  const back = redirectUri(req, url);
  const tr = await fetch(`${base}/api/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.AI_DISCORD_CLIENT_ID, client_secret: env.AI_DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: back }) });
  if (!tr.ok) return html(FAIL, 400, { "set-cookie": clear });
  const tok = await tr.json();
  const ur = await fetch(`${base}/api/users/@me`, { headers: { authorization: `Bearer ${tok.access_token}` } });
  if (!ur.ok) return html(FAIL, 400, { "set-cookie": clear });
  const u = await ur.json();
  if (!allowed(env, u.id)) return html(DENY, 403, { "set-cookie": clear });
  const sid = rand(32);
  const avatar = /^[A-Za-z0-9_]+$/.test(u.avatar || "") ? u.avatar : null;
  await env.DB.prepare("INSERT INTO ai_sessions (id, discord_id, username, global_name, avatar, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(sid, String(u.id), clip(u.username), clip(u.global_name || u.username), avatar, Date.now() + SESSION_MS).run();
  const headers = new Headers({ ...SECURITY, location: "/" });
  headers.append("set-cookie", clear);
  headers.append("set-cookie", cookie("ai_session", await sign(env, sid), 30 * 86400, "/"));
  return new Response(null, { status: 302, headers });
}

async function cached(keyUrl, load) {
  try {
    const cache = caches.default, key = new Request(keyUrl);
    const hit = await cache.match(key);
    if (hit) return await hit.json();
    const value = await load();
    if (value != null) await cache.put(key, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } }));
    return value;
  } catch { return await load(); }
}
async function credits(req, env, url) {
  if (!env.OPENROUTER_KEY) return null;
  try {
    return await cached("https://ai.nwebnotfound.dev/__cache/openrouter/credits", async () => {
      const base = openRouterBase(req, url, env);
      const headers = { authorization: `Bearer ${env.OPENROUTER_KEY}` };
      let data = null;
      const cr = await fetch(`${base}/api/v1/credits`, { headers });
      if (cr.ok) { const j = await cr.json(); data = j?.data ?? j; }
      if (data?.total_credits == null && data?.limit_remaining == null) {
        const kr = await fetch(`${base}/api/v1/key`, { headers });
        if (kr.ok) { const j = await kr.json(); data = j?.data ?? j; }
      }
      const total = num(data?.total_credits), used = num(data?.total_usage ?? data?.usage), remaining = num(data?.limit_remaining);
      if (total == null && used == null && remaining == null) return null;
      return { remaining: remaining != null ? remaining : (total != null && used != null ? total - used : total), used };
    });
  } catch { return null; }
}
async function modelPrice(req, env, url) {
  if (!env.OPENROUTER_KEY) return null;
  try { return await cached("https://ai.nwebnotfound.dev/__cache/openrouter/hermes-agent", async () => {
    const r = await fetch(`${openRouterBase(req, url, env)}/api/v1/models`, { headers: { authorization: `Bearer ${env.OPENROUTER_KEY}` } });
    if (!r.ok) return null;
    const row = ((await r.json())?.data || []).find((m) => m?.id === "hermes-agent");
    const prompt = String(row?.pricing?.prompt ?? ""), completion = String(row?.pricing?.completion ?? "");
    if (!row || !/^\d+(\.\d+)?$/.test(prompt) || !/^\d+(\.\d+)?$/.test(completion)) return null;
    return { id: "hermes-agent", prompt, completion };
  }); } catch { return null; }
}
async function usage(req, env, url, user) {
  if (!user) return json({ error: "Anmeldung nötig" }, 401);
  const now = Date.now(), day = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const [today, week, byBot, cred, model] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM ai_log WHERE at >= ?").bind(day).first(),
    env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM ai_log WHERE at >= ?").bind(now - 7 * 86400000).first(),
    env.DB.prepare("SELECT bot, COUNT(*) AS requests, COALESCE(SUM(COALESCE(tokens_in,0)+COALESCE(tokens_out,0)),0) AS tokens, COALESCE(SUM(cost_usd),0) AS cost_usd FROM ai_log WHERE at >= ? AND bot IS NOT NULL GROUP BY bot ORDER BY requests DESC").bind(now - 7 * 86400000).all(),
    credits(req, env, url),
    modelPrice(req, env, url),
  ]);
  return json({
    credits: cred, today_usd: num(today?.cost) || 0, week_usd: num(week?.cost) || 0,
    by_bot: (byBot.results || []).map((r) => ({ bot: r.bot, requests: r.requests, tokens: r.tokens, cost_usd: r.cost_usd })),
    model,
  });
}

function profileNames(j) {
  const raw = Array.isArray(j) ? j : (j?.profiles || j?.items || []);
  return raw.map((x) => typeof x === "string" ? x : x?.name).filter(isBotName);
}
function scrubBody(text, max) {
  if (text.length > max) return { error: 413 };
  let body; try { body = text ? JSON.parse(text) : {}; } catch { return { error: 400 }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: 400 };
  for (const k of ["key", "api_key", "api_server_key", "token", "session_token", "authorization"]) delete body[k];
  if (typeof body.soul === "string") body.soul = cleanSoul(body.soul);
  if (typeof body.content === "string") body.content = cleanSoul(body.content);
  if (body.name != null && !isBotName(String(body.name))) return { error: 400 };
  return { body };
}
async function dashFetch(env, method, path, bodyText) {
  const base = httpBase(env.HERMES_DASHBOARD_ORIGIN);
  if (!base || !env.HERMES_DASHBOARD_SESSION_TOKEN) return { error: json({ error: "Dashboard ist nicht eingerichtet" }, 503) };
  const headers = { "X-Hermes-Session-Token": env.HERMES_DASHBOARD_SESSION_TOKEN, accept: "application/json", "accept-encoding": "identity", ...accessHeaders(env) };
  if (bodyText != null) headers["content-type"] = "application/json";
  let upstream;
  try { upstream = await fetch(base + path, { method, headers, body: bodyText ?? undefined, signal: AbortSignal.timeout(8000) }); }
  catch { return { error: json({ error: "Dashboard nicht erreichbar" }, 502) }; }
  const raw = await upstream.text();
  const redactor = createRedactor(knownSecrets(env, env.HERMES_DASHBOARD_SESSION_TOKEN));
  const clean = redactor.push(raw.slice(0, 1_000_000)) + redactor.end();
  let parsed = null; try { parsed = JSON.parse(clean); } catch { parsed = null; }
  return { status: upstream.status, text: clean, json: parsed, type: upstream.headers.get("content-type") || "application/json" };
}
function dashResponse(got) {
  if (got.error) return got.error;
  return new Response(got.text, { status: got.status, headers: { ...SECURITY, "content-type": got.type } });
}
async function listBots(env) {
  let names = [];
  const got = await dashFetch(env, "GET", "/api/profiles", null);
  if (!got.error && got.status === 200) names = profileNames(got.json);
  if (!names.length && (got.error || got.status !== 200)) names = BUILTIN.slice();
  return json({ bots: names.filter(isBotName).map((name) => ({ name, ready: !!botKey(env, name), secret: keyEnvName(name) })) });
}
async function dashboard(req, env, url, user) {
  if (!user) return json({ error: "Anmeldung nötig" }, 401);
  if (req.method !== "GET" && !originOk(req)) return json({ error: "Ungültige Herkunft" }, 403);
  const limited = await rateLimit(env, user.id);
  if (limited) return limited;
  const rest = url.pathname.slice("/api/hermes".length) || "/";
  const profile = url.searchParams.get("profile");
  if (profile != null && profile !== "" && !isBotName(profile)) return json({ error: "Name ungültig" }, 400);
  const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
  let path = "";
  const one = rest.match(/^\/profiles\/([^/]+)(?:\/(model|soul))?$/);
  if (rest === "/profiles" && (req.method === "GET" || req.method === "POST")) path = "/api/profiles";
  else if (one && isBotName(decodeURIComponent(one[1])) && !one[2] && (req.method === "PATCH" || req.method === "DELETE")) path = `/api/profiles/${encodeURIComponent(decodeURIComponent(one[1]))}`;
  else if (one && isBotName(decodeURIComponent(one[1])) && one[2] && req.method === "PUT") path = `/api/profiles/${encodeURIComponent(decodeURIComponent(one[1]))}/${one[2]}`;
  else if (rest === "/model/options" && req.method === "GET" && profile) path = "/api/model/options" + q;
  else if (rest === "/model/set" && req.method === "POST" && profile) path = "/api/model/set" + q;
  else return json({ error: "not found" }, 404);
  let bodyText = null;
  if (req.method !== "GET" && req.method !== "DELETE") {
    const cleaned = scrubBody(await req.text(), 8000);
    if (cleaned.error) return json({ error: cleaned.error === 413 ? "Anfrage zu groß" : "invalid json" }, cleaned.error);
    if (req.method === "POST" && rest === "/profiles" && !isBotName(cleaned.body.name)) return json({ error: "Name ungültig" }, 400);
    bodyText = JSON.stringify(cleaned.body);
  }
  const got = await dashFetch(env, req.method, path, bodyText);
  if (got.error) return got.error;
  if (req.method === "POST" && rest === "/profiles" && got.status >= 200 && got.status < 300) {
    const name = JSON.parse(bodyText).name;
    const hint = `Setze API_SERVER_KEY als Worker-Secret ${keyEnvName(name)} und starte auf PC-Nils: hermes gateway restart.`;
    const payload = got.json && typeof got.json === "object" && !Array.isArray(got.json) ? { ...got.json } : { ok: true };
    for (const k of ["key", "api_key", "api_server_key", "token", "session_token"]) delete payload[k];
    return json({ ...payload, name, ready: !!botKey(env, name), hint }, got.status);
  }
  return dashResponse(got);
}

async function rateLimit(env, sessionId) {
  const since = Date.now() - WINDOW_MS;
  const rate = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(at) AS t FROM ai_log WHERE session_id = ? AND at > ? AND (path LIKE '/p/%' OR path LIKE '/api/hermes/%')").bind(sessionId, since).first();
  if ((rate?.n || 0) >= LIMIT) return json({ error: "Zu viele Anfragen", retry_after_ms: Math.max(1, (rate?.t || Date.now()) + WINDOW_MS - Date.now()) }, 429);
  return null;
}
function textual(ct) { return !ct || /json|text|event-stream|xml|javascript|urlencoded/i.test(ct); }
function streamRedacted(body, secrets) {
  let usage = null, buf = "";
  const redactor = createRedactor(secrets), decoder = new TextDecoder();
  const scan = (text) => {
    buf = (buf + text).slice(-65536);
    const m = buf.match(/"usage"\s*:\s*(\{[^{}]*\})/);
    if (!m) return;
    try { usage = JSON.parse(m[1]); } catch { /* unvollständig */ }
  };
  const ts = new TransformStream({
    transform(chunk, controller) {
      const text = redactor.push(decoder.decode(chunk, { stream: true }));
      if (text) { controller.enqueue(enc.encode(text)); scan(text); }
    },
    flush(controller) {
      const text = redactor.push(decoder.decode()) + redactor.end();
      if (text) { controller.enqueue(enc.encode(text)); scan(text); }
    },
  });
  const done = body.pipeTo(ts.writable).then(() => usage, () => usage);
  return { readable: ts.readable, done };
}

async function proxy(req, env, url, user) {
  const m = url.pathname.match(/^\/p\/([^/]+)(\/.*)$/);
  if (!m) return json({ error: "not found" }, 404);
  let name = ""; try { name = decodeURIComponent(m[1]); } catch { return json({ error: "Name ungültig" }, 400); }
  const rest = m[2].replace(/\/$/, "") || "/";
  if (!isBotName(name)) return json({ error: "Name ungültig" }, 400);
  if (!PROXY.some(([method, re]) => method === req.method && re.test(rest))) return json({ error: "not found" }, 404);
  if (!user) return json({ error: "Anmeldung nötig" }, 401);
  if (req.method !== "GET" && !originOk(req)) return json({ error: "Ungültige Herkunft" }, 403);
  const key = botKey(env, name);
  if (!key) return json({ error: "Bot nicht bereit", secret: keyEnvName(name) }, 404);
  const limited = await rateLimit(env, user.id);
  if (limited) return limited;
  const base = httpBase(env.HERMES_ORIGIN);
  if (!base) return json({ error: "Hermes ist nicht eingerichtet" }, 503);
  let upstreamBody;
  if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
    const text = await req.text();
    if (text.length > (rest === "/v1/chat/completions" ? 100000 : 8000)) return json({ error: "Anfrage zu groß" }, 413);
    if (rest === "/v1/chat/completions") {
      let body; try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: "invalid json" }, 400); }
      if (body.model != null && body.model !== "hermes-agent") return json({ error: "nur Modell hermes-agent" }, 400);
      body.model = "hermes-agent";
      upstreamBody = JSON.stringify(body);
    } else upstreamBody = text;
  }
  let upstream;
  try {
    const headers = { authorization: `Bearer ${key}`, accept: (req.headers.get("accept") || "*/*").slice(0, 200), "accept-encoding": "identity", ...accessHeaders(env) };
    if (upstreamBody != null) headers["content-type"] = "application/json";
    upstream = await fetch(base + rest, { method: req.method, headers, body: upstreamBody });
  } catch { return json({ error: "Hermes nicht erreichbar" }, 502); }
  const ct = upstream.headers.get("content-type") || "application/json";
  const headers = { ...SECURITY, "content-type": ct };
  const model = rest === "/v1/chat/completions" ? "hermes-agent" : null;
  if (!upstream.body || !textual(ct)) return new Response(upstream.body, { status: upstream.status, headers });
  if (!/event-stream/i.test(ct)) {
    const raw = await upstream.text();
    const redactor = createRedactor(knownSecrets(env, key));
    const text = (raw.length > 1_000_000 ? raw.slice(0, 1_000_000) : raw);
    const clean = redactor.push(text) + redactor.end();
    let found = null;
    const m = clean.match(/"usage"\s*:\s*(\{[^{}]*\})/);
    if (m) { try { found = JSON.parse(m[1]); } catch { /* kein Usage-Objekt */ } }
    return { response: new Response(clean, { status: upstream.status, headers }), usage: Promise.resolve(found), model, bot: name };
  }
  const streamed = streamRedacted(upstream.body, knownSecrets(env, key));
  return { response: new Response(streamed.readable, { status: upstream.status, headers }), usage: streamed.done, model, bot: name };
}

async function dispatch(req, env, url) {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/favicon.ico") return new Response(null, { status: 204, headers: SECURITY });
  if (path === "/") return html(PAGE);
  if (path === "/auth/login" && req.method === "GET") return login(req, env, url);
  if (path === "/auth/callback" && req.method === "GET") return callback(req, env, url);
  if (path === "/auth/logout" && req.method === "GET") {
    const user = await getUser(req, env);
    if (user) await env.DB.prepare("DELETE FROM ai_sessions WHERE id = ?").bind(user.id).run();
    return redirect("/", { "set-cookie": cookie("ai_session", "", 0, "/") });
  }
  const user = path.startsWith("/api/") || path.startsWith("/p/") ? await getUser(req, env) : null;
  if (path === "/api/me") return user ? json({ user: { name: user.global_name || user.username, username: user.username } }) : json({ user: null }, 401);
  if (path === "/api/usage" && req.method === "GET") return usage(req, env, url, user);
  if (path === "/api/bots" && req.method === "GET") return user ? listBots(env) : json({ error: "Anmeldung nötig" }, 401);
  if (path === "/api/hermes" || path.startsWith("/api/hermes/")) return dashboard(req, env, url, user);
  if (path.startsWith("/p/")) return proxy(req, env, new URL(path, url), user);
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    let response, usageDone = null, bot = null, model = null, session = null;
    try {
      if (path.startsWith("/api/") || path.startsWith("/p/")) {
        const user = await getUser(req, env);
        session = user?.id || null;
        if (path.startsWith("/p/")) {
          const mm = path.match(/^\/p\/([^/]+)/);
          if (mm) { try { const n = decodeURIComponent(mm[1]); if (isBotName(n)) bot = n; } catch { /* Name bleibt leer */ } }
        }
      } else {
        const user = await getUser(req, env).catch(() => null);
        session = user?.id || null;
      }
      const out = await dispatch(req, env, url);
      if (out instanceof Response) response = out;
      else { response = out.response; usageDone = out.usage; model = out.model; if (out.bot) bot = out.bot; }
    } catch {
      response = json({ error: "interner Fehler" }, 500);
    }
    const status = response.status;
    ctx.waitUntil((async () => {
      try {
        const id = await writeLog(env, { session, bot, path, status, model });
        const used = usageDone ? await usageDone : null;
        if (used && model) await rememberUsage(env, id, used, await modelPrice(req, env, url));
      } catch { /* Log darf die Antwort nicht kippen */ }
    })());
    return response;
  },
};
