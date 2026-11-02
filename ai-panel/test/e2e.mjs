#!/usr/bin/env node
// KI-Panel gegen lokales wrangler dev: Auth 403, Namen, Proxy ohne Schlüssel im Klartext.
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import "./unit.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = +(process.env.AI_E2E_PORT || 8798);
const MOCK = +(process.env.AI_E2E_MOCK || 8797);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;
const PERSIST = ROOT + ".wrangler/e2e";
const DV = ROOT + ".dev.vars";
const ALLOWED = "100000000000000001";
const SECRETS = ["hermes-key-cloudflare-SECRET", "hermes-key-minecraft-SECRET", "hermes-key-discord-SECRET", "hermes-key-homelab-SECRET", "sidebot-key-SECRET", "cf-access-id-SECRET", "cf-access-secret-SECRET", "openrouter-key-SECRET", "dashboard-session-SECRET", "e2e-discord-secret", "e2e-session-secret"];
const leak = (t) => SECRETS.find((s) => String(t).includes(s)) || "";
let pass = 0, fail = 0;
const ok = (c, m, extra = "") => { if (c) pass++; else fail++; console.log((c ? "  ✓ " : "  ✗ ") + m + (c ? "" : "  " + String(extra).slice(0, 400))); };

const seen = { hermes: [], approvals: [], dash: [], deletes: [] };
let lastCode = "";
const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  const send = (status, data, type = "application/json; charset=utf-8") => { res.writeHead(status, { "content-type": type, "cache-control": "no-store" }); res.end(typeof data === "string" ? data : JSON.stringify(data)); };
  if (url.pathname === "/discord/api/oauth2/token") { lastCode = new URLSearchParams(body).get("code") || ""; return send(200, { access_token: "discord-user-token", token_type: "Bearer" }); }
  if (url.pathname === "/discord/api/users/@me") {
    const good = lastCode === "good";
    return send(200, { id: good ? ALLOWED : "100000000000000002", username: good ? "nils" : "other", global_name: good ? "Nils" : "Other", avatar: "abc" });
  }
  if (url.pathname === "/hermes/v1/chat/completions") {
    seen.hermes.push({ authorization: req.headers.authorization || "", cfid: req.headers["cf-access-client-id"] || "", cfsec: req.headers["cf-access-client-secret"] || "", body });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
    res.write('data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\n');
    res.write("data: token " + token.slice(0, 8));
    res.write(token.slice(8) + "\n\n");
    res.write('data: {"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n');
    res.end();
    return;
  }
  if (url.pathname === "/hermes/v1/runs") return send(200, { runs: [{ id: "run-1", status: "awaiting_approval", title: "Neustart" }] });
  if (url.pathname === "/hermes/api/sessions") return send(200, { sessions: [{ id: "s-1", title: "Heute" }] });
  if (url.pathname === "/hermes/v1/approval") { seen.approvals.push(body); return send(200, { ok: true }); }
  if (url.pathname === "/hermes/v1/stop" || url.pathname === "/hermes/v1/steer") return send(200, { ok: true });
  if (url.pathname === "/hermes/api/jobs" && req.method === "GET") return send(200, { jobs: [{ id: "job-1", name: "nacht", schedule: "0 3 * * *" }] });
  if (url.pathname === "/hermes/api/jobs" && req.method === "POST") return send(200, { ok: true, id: "job-2" });
  if (url.pathname === "/hermes/api/jobs/job-1" && req.method === "DELETE") { seen.deletes.push(req.headers.authorization || ""); return send(200, { ok: true }); }
  if (url.pathname === "/hermes/api/jobs/job-1/pause" || url.pathname === "/hermes/api/jobs/job-1/resume" || url.pathname === "/hermes/api/jobs/job-1/run") return send(200, { ok: true });
  if (url.pathname.startsWith("/dash/")) {
    if ((req.headers["x-hermes-session-token"] || "") !== "dashboard-session-SECRET") return send(401, { error: "no token" });
    seen.dash.push({ method: req.method, path: url.pathname + url.search, body, cf: req.headers["cf-access-client-id"] || "" });
    if (url.pathname === "/dash/api/profiles" && req.method === "GET") return send(200, { profiles: [{ name: "cloudflare" }, { name: "minecraft" }, { name: "discord" }, { name: "homelab" }, { name: "sidebot" }] });
    if (url.pathname === "/dash/api/profiles" && req.method === "POST") return send(200, { ok: true, api_server_key: "should-not-leak" });
    if (url.pathname === "/dash/api/model/options") return send(200, { options: [{ id: "hermes-agent" }, { id: "expensive" }] });
    if (url.pathname === "/dash/api/model/set") {
      const j = JSON.parse(body || "{}");
      if (j.confirm_expensive_model === true) return send(200, { ok: true });
      return send(200, { ok: false, confirm_required: true, confirm_message: "Teures Modell" });
    }
    return send(200, { ok: true });
  }
  if (url.pathname === "/openrouter/api/v1/credits") return send(200, { data: { total_credits: 12.5, total_usage: 1.25 } });
  if (url.pathname === "/openrouter/api/v1/models") return send(200, { data: [{ id: "hermes-agent", pricing: { prompt: "0.000001", completion: "0.000002" } }, { id: "expensive", pricing: { prompt: "0.01", completion: "0.03" } }] });
  send(404, { error: "mock" });
});
await new Promise((resolve) => mock.listen(MOCK, "127.0.0.1", resolve));

fs.rmSync(PERSIST, { recursive: true, force: true });
const hadDV = fs.existsSync(DV); if (hadDV) fs.copyFileSync(DV, DV + ".e2e-bak");
fs.writeFileSync(DV, [
  "AI_DISCORD_CLIENT_ID=e2e-discord-client",
  "AI_DISCORD_CLIENT_SECRET=e2e-discord-secret",
  "AI_SESSION_SECRET=e2e-session-secret",
  `ALLOWED_DISCORD_ID=${ALLOWED}`,
  `HERMES_ORIGIN=http://127.0.0.1:${MOCK}/hermes`,
  `HERMES_DASHBOARD_ORIGIN=http://127.0.0.1:${MOCK}/dash`,
  "HERMES_DASHBOARD_SESSION_TOKEN=dashboard-session-SECRET",
  "HERMES_KEY_SIDEBOT=sidebot-key-SECRET",
  "HERMES_KEY_CLOUDFLARE=hermes-key-cloudflare-SECRET",
  "HERMES_KEY_MINECRAFT=hermes-key-minecraft-SECRET",
  "HERMES_KEY_DISCORD=hermes-key-discord-SECRET",
  "HERMES_KEY_HOMELAB=hermes-key-homelab-SECRET",
  "CF_ACCESS_CLIENT_ID=cf-access-id-SECRET",
  "CF_ACCESS_CLIENT_SECRET=cf-access-secret-SECRET",
  "OPENROUTER_KEY=openrouter-key-SECRET",
  `AI_OAUTH_BASE=http://127.0.0.1:${MOCK}/discord`,
  `OPENROUTER_ORIGIN=http://127.0.0.1:${MOCK}/openrouter`,
  "",
].join("\n"));
execSync(`npx wrangler d1 execute DB --local --persist-to ${PERSIST} --file schema.sql --config wrangler.jsonc`, { cwd: ROOT, stdio: "ignore" });
const wd = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", PERSIST, "--config", "wrangler.jsonc"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = ""; wd.stdout.on("data", (d) => { log += d; }); wd.stderr.on("data", (d) => { log += d; });
const cleanup = () => { try { process.kill(-wd.pid); } catch {} try { mock.close(); } catch {} fs.rmSync(DV, { force: true }); if (hadDV) fs.renameSync(DV + ".e2e-bak", DV); };
process.on("exit", cleanup); process.on("SIGINT", () => process.exit(130));
let up = false;
for (let i = 0; i < 80; i++) { try { await fetch(BASE + "/"); up = true; break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
if (!up) { console.log(log.slice(-3000)); console.log("wrangler nicht bereit"); process.exit(1); }

const local = { "x-ai-local": "1" };
const cookiesOf = (res) => {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
  const out = {};
  for (const c of list) {
    const pair = c.split(";")[0];
    const i = pair.indexOf("=");
    if (i < 1) continue;
    let value = pair.slice(i + 1);
    try { value = decodeURIComponent(value); } catch { /* schon roh */ }
    out[pair.slice(0, i)] = { value, raw: c };
  }
  return out;
};
const sqlText = (q) => execSync(`npx wrangler d1 execute DB --local --persist-to ${PERSIST} --json --config wrangler.jsonc --command ${JSON.stringify(q)}`, { cwd: ROOT, encoding: "utf8" });
const rows = (q) => { const out = sqlText(q); return JSON.parse(out.slice(out.indexOf("[")))[0].results; };
async function login(code, stateOverride) {
  const start = await fetch(BASE + "/auth/login", { redirect: "manual", headers: local });
  const loc = start.headers.get("location") || "";
  const state = stateOverride ?? new URL(loc).searchParams.get("state");
  const oauth = cookiesOf(start).ai_oauth?.value || "";
  const cb = await fetch(`${BASE}/auth/callback?code=${code}&state=${encodeURIComponent(state || "")}`, { redirect: "manual", headers: { ...local, cookie: `ai_oauth=${encodeURIComponent(oauth)}` } });
  return { start, loc, cb, text: await cb.text(), cookies: cookiesOf(cb) };
}
async function post(path, body, cookie) {
  const r = await fetch(BASE + path, { method: "POST", headers: { ...local, "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, t, j, h: [...r.headers] };
}

try {
  console.log("Auth");
  const anon = await post("/p/cloudflare/v1/chat/completions", { model: "hermes-agent", messages: [] });
  ok(anon.s === 401 && seen.hermes.length === 0, "Proxy ohne Session → 401, Hermes sieht nichts", anon.t);
  const denied = await login("bad");
  const authUrl = new URL(denied.loc);
  ok(authUrl.searchParams.get("scope") === "identify" && (authUrl.searchParams.get("redirect_uri") || "").endsWith("/auth/callback") && denied.loc.startsWith(`http://127.0.0.1:${MOCK}/discord/`), "Login: identify, Callback, Mock statt discord.com", denied.loc);
  ok(!denied.loc.includes("e2e-discord-secret"), "Authorize-URL ohne Client-Secret");
  ok(denied.cb.status === 403 && denied.text.includes("darf das Panel nicht öffnen") && !denied.cookies.ai_session?.value, "fremde Discord-ID → 403 ohne Session", denied.cb.status + " " + denied.text.slice(0, 120));
  ok(!leak(denied.text), "403-Seite ohne Schlüssel", leak(denied.text));
  const csrf = await login("good", "falscher-state");
  ok(csrf.cb.status === 400 && !csrf.cookies.ai_session?.value, "falscher state → 400 ohne Session", String(csrf.cb.status));
  const good = await login("good");
  ok(good.cb.status === 302 && good.cookies.ai_session?.value && /HttpOnly/i.test(good.cookies.ai_session.raw) && /Secure/i.test(good.cookies.ai_session.raw) && /SameSite=Lax/i.test(good.cookies.ai_session.raw), "erlaubte ID → Session HttpOnly Secure SameSite=Lax", good.cookies.ai_session?.raw);
  const session = `ai_session=${encodeURIComponent(good.cookies.ai_session.value)}`;
  const home = await fetch(BASE + "/", { headers: { ...local, cookie: session } });
  const homeText = await home.text();
  ok(home.status === 200 && homeText.includes('id="app"') && !leak(homeText), "Startseite ohne Schlüssel", leak(homeText));

  console.log("Proxy");
  const noOrigin = await fetch(BASE + "/p/cloudflare/v1/chat/completions", { method: "POST", headers: { ...local, cookie: session, "content-type": "application/json" }, body: "{}" });
  ok(noOrigin.status === 403 && seen.hermes.length === 0, "POST ohne Origin → 403", String(noOrigin.status));
  const pricey = await post("/p/cloudflare/v1/chat/completions", { model: "expensive", messages: [{ role: "user", content: "GEHEIM-PROMPT-TEXT" }] }, session);
  ok(pricey.s === 400 && pricey.j?.error.includes("hermes-agent") && seen.hermes.length === 0, "anderes Modell → 400, kein Upstream", pricey.t);
  const badName = await post("/p/Bad_Name/v1/chat/completions", { messages: [] }, session);
  ok(badName.s === 400 && seen.hermes.length === 0, "Bot-Name mit Großbuchstaben → 400", badName.t);
  const closed = await fetch(BASE + "/p/cloudflare/v1/models", { headers: { ...local, cookie: session } });
  ok(closed.status === 404 && seen.hermes.length === 0, "nicht freigegebener Hermes-Pfad → 404", String(closed.status));
  const chat = await post("/p/cloudflare/v1/chat/completions", { messages: [{ role: "user", content: "GEHEIM-PROMPT-TEXT" }] }, session);
  ok(chat.s === 200 && chat.t.includes("Hallo") && !leak(chat.t) && !chat.t.includes("hermes-key-cloudflare"), "SSE ohne Schlüssel, Text kommt an", leak(chat.t) || chat.t.slice(0, 180));
  ok(!chat.h.some(([k, v]) => leak(k + v)), "Antwort-Header ohne Schlüssel");
  ok(seen.hermes[0]?.authorization === "Bearer hermes-key-cloudflare-SECRET" && seen.hermes[0].cfid === "cf-access-id-SECRET" && seen.hermes[0].cfsec === "cf-access-secret-SECRET", "Upstream bekommt Bot-Key und Access-Token", seen.hermes[0]?.authorization);
  ok(seen.hermes[0].body.includes('"model":"hermes-agent"') && seen.hermes[0].body.includes("GEHEIM-PROMPT-TEXT"), "Modell wird serverseitig gesetzt");
  let usageRow = null;
  for (let i = 0; i < 25 && !usageRow?.tokens_in; i++) {
    usageRow = rows("SELECT tokens_in, tokens_out, cost_usd, path, model FROM ai_log WHERE path = '/p/cloudflare/v1/chat/completions' ORDER BY id DESC LIMIT 1")[0];
    if (!usageRow?.tokens_in) await new Promise((r) => setTimeout(r, 150));
  }
  ok(usageRow?.tokens_in === 3 && usageRow.tokens_out === 1 && Math.abs(usageRow.cost_usd - 0.000005) < 1e-9 && usageRow.model === "hermes-agent", "Log speichert Tokens und Kosten", JSON.stringify(usageRow));
  const dump = sqlText("SELECT path, status, bot, model FROM ai_log");
  ok(!leak(dump) && !dump.includes("GEHEIM-PROMPT-TEXT"), "D1 ohne Prompt und ohne Schlüssel", leak(dump));

  console.log("Bots, Cron und Usage");
  const dashBefore = seen.dash.length;
  const badBot = await post("/api/hermes/profiles", { name: "a;rm -rf /" }, session);
  ok(badBot.s === 400 && seen.dash.length === dashBefore, "Profilname mit Shell-Zeichen → 400, Dashboard bleibt still", badBot.t);
  const made = await post("/api/hermes/profiles", { name: "sidebot" }, session);
  ok(made.s === 200 && made.j?.hint?.includes("HERMES_KEY_SIDEBOT") && made.j.hint.includes("gateway restart") && !leak(made.t) && !made.t.includes("should-not-leak") && !made.t.includes("dashboard-session"), "Neuer Bot nennt das Secret und den Neustart, ohne Schlüssel", made.t);
  ok(seen.dash.at(-1)?.cf === "cf-access-id-SECRET" && !seen.dash.at(-1).body.includes("dashboard-session"), "Dashboard-Aufruf trägt Access, nicht den Token im Body");
  const ask = await post("/api/hermes/model/set?profile=cloudflare", { model: "expensive" }, session);
  ok(ask.s === 200 && ask.j?.confirm_required === true && ask.j.confirm_message === "Teures Modell" && seen.dash.filter((d) => d.path.startsWith("/dash/api/model/set")).length === 1 && !seen.dash.filter((d) => d.path.startsWith("/dash/api/model/set"))[0].body.includes("confirm_expensive_model"), "confirm_required ohne automatische zweite Anfrage", ask.t);
  const yes = await post("/api/hermes/model/set?profile=cloudflare", { model: "expensive", confirm_expensive_model: true }, session);
  ok(yes.s === 200 && yes.j?.ok === true && !leak(yes.t), "Bestätigung wird erst im zweiten Aufruf geschickt", yes.t);
  const badOpt = await fetch(BASE + "/api/hermes/model/options?profile=Bad_Name", { headers: { ...local, cookie: session } });
  ok(badOpt.status === 400, "Modelloptionen mit ungültigem Profil → 400", String(badOpt.status));
  const jobs = await fetch(BASE + "/p/cloudflare/api/jobs", { headers: { ...local, cookie: session } });
  const jobsText = await jobs.text();
  ok(jobs.status === 200 && jobsText.includes("job-1") && seen.hermes.at(-1)?.authorization === "Bearer hermes-key-cloudflare-SECRET" && !jobsText.includes("dashboard-session"), "Cron läuft über den Bot-Key", jobsText.slice(0, 160));
  const side = await post("/p/sidebot/v1/chat/completions", { messages: [{ role: "user", content: "noch ein geheimtext" }] }, session);
  ok(side.s === 200 && seen.hermes.at(-1)?.authorization === "Bearer sidebot-key-SECRET" && !leak(side.t), "HERMES_KEY_SIDEBOT bleibt serverseitig", seen.hermes.at(-1)?.authorization);
  const use = await fetch(BASE + "/api/usage", { headers: { ...local, cookie: session } });
  const uj = await use.json();
  ok(use.status === 200 && uj.credits?.remaining === 11.25 && uj.model?.id === "hermes-agent" && !JSON.stringify(uj).includes("expensive") && !leak(JSON.stringify(uj)), "Usage: Guthaben, nur hermes-agent, kein OpenRouter-Key", JSON.stringify(uj).slice(0, 300));

  const botsRes = await fetch(BASE + "/api/bots", { headers: { ...local, cookie: session }, signal: AbortSignal.timeout(5000) });
  const botsJson = await botsRes.json();
  ok(botsRes.status === 200 && botsJson.bots?.some((b) => b.name === "cloudflare" && b.ready) && !leak(JSON.stringify(botsJson)), "Bot-Liste ohne Schlüssel", JSON.stringify(botsJson));
  let runsText = "";
  try {
    const runs = await fetch(BASE + "/p/cloudflare/v1/runs", { headers: { ...local, cookie: session }, signal: AbortSignal.timeout(4000) });
    runsText = await runs.text();
    ok(runs.status === 200 && runsText.includes("run-1") && runsText.includes("awaiting_approval") && !leak(runsText), "Runs ohne Schlüssel", runsText.slice(0, 180));
  } catch (e) { ok(false, "Runs ohne Schlüssel", e.name + " " + e.message); }
  console.log("UI");
  const approvals = seen.approvals.length;
  await new Promise((resolve, reject) => {
    const child = spawn("python3", ["test/ui.py", BASE, good.cookies.ai_session.value], { cwd: ROOT, stdio: "inherit", env: { ...process.env, AI_SHOTS: "/tmp" } });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("ui " + code)));
  });
  pass++;
  ok(seen.approvals.length === approvals + 1 && seen.approvals.at(-1).includes("run-1") && seen.approvals.at(-1).includes("true"), "Bestätigen im UI ruft /approval auf", seen.approvals.at(-1));
  ok(seen.deletes.at(-1) === "Bearer hermes-key-cloudflare-SECRET", "Löschen im UI geht erst nach der zweiten Bestätigung an den Bot-Key", seen.deletes.at(-1));

  console.log("Rate-Limit");
  const sid = rows("SELECT id FROM ai_sessions")[0].id;
  const values = Array.from({ length: 30 }, () => `(${Date.now()}, '${sid}', 'cloudflare', '/p/cloudflare/v1/runs', 200)`).join(",");
  sqlText(`INSERT INTO ai_log (at, session_id, bot, path, status) VALUES ${values}`);
  const hermesBefore = seen.hermes.length;
  const limited = await post("/p/cloudflare/v1/runs", {}, session);
  ok(limited.s === 429 && Number(limited.j?.retry_after_ms) > 0 && seen.hermes.length === hermesBefore, "31. Proxy-Aufruf in der Minute → 429", limited.t);
} catch (e) {
  fail++;
  console.log("Fehler:", e.stack);
  console.log(log.slice(-2500));
}
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
