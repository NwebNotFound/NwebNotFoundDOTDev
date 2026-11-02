// Crew routes at the Worker: read-only, authenticated, GET-only, validating bot and id,
// forwarding to the proxy with clamped paging, and re-redacting what comes back.
// The proxy's own caps and filtering are covered in proxy-crew.test.mjs; here the mock Hermes
// stands in for the tunnel and we assert what the Worker sends and returns.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { handle } from "../src/index.js";
import { createSession, SESSION_COOKIE, CSRF_COOKIE } from "../src/auth.js";
import { startMockHermes, PANEL_SECRET, cookieHeader } from "./helpers.mjs";

const HOST = "https://ai.nwebnotfound.dev";
const ALLOWED = "111111111111111111";
const CSRF = "csrf-token-for-tests";

let mock;
let env;
let session;

const origErr = console.error;
console.error = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith('{"ai_panel_upstream"')) return;
  origErr(...args);
};

before(async () => {
  mock = await startMockHermes();
  env = {
    DISCORD_CLIENT_ID: "1566865767029284884",
    DISCORD_CLIENT_SECRET: "discord-secret",
    SESSION_SECRET: "session-secret-for-tests",
    ALLOWED_DISCORD_ID: ALLOWED,
    HERMES_ORIGIN: mock.url,
    HERMES_PANEL_SECRET: PANEL_SECRET,
    PANEL_BOTS: "cloudflare,minecraft,discord,homelab",
    PANEL_HOST: "ai.nwebnotfound.dev",
    SESSION_VERSION: "1",
  };
  session = await createSession(env, { id: ALLOWED, name: "Nils" });
});

after(async () => {
  console.error = origErr;
  await mock.close();
});

function call(path, { method = "GET", cookies = {}, csrf = true, sessionCookie = session, e = env } = {}) {
  const headers = {};
  const jar = { [SESSION_COOKIE]: sessionCookie, [CSRF_COOKIE]: CSRF, ...cookies };
  const cookieStr = cookieHeader(jar);
  if (cookieStr) headers.cookie = cookieStr;
  if (method !== "GET" && csrf) headers["x-csrf-token"] = CSRF;
  headers.origin = HOST;
  return handle(new Request(`${HOST}${path}`, { method, headers }), e);
}

const body = (res) => res.json();
const lastUpstream = () => mock.state.requests.at(-1);

test("crew endpoints need a panel session", async () => {
  const list = await call("/api/crew/sessions?bot=cloudflare", { sessionCookie: "" });
  assert.equal(list.status, 401);
  const msgs = await call("/api/crew/sessions/cloudflare/run_9f2c1a4b/messages", { sessionCookie: "" });
  assert.equal(msgs.status, 401);
});

test("crew sessions lists a bot's sessions with the fields the tab renders", async () => {
  const res = await call("/api/crew/sessions?bot=cloudflare");
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data.bot, "cloudflare");
  assert.equal(data.filter, "all");
  assert.equal(data.sessions.length, 3);
  for (const row of data.sessions) {
    assert.ok(row.id, "id");
    assert.equal(typeof row.title, "string");
    assert.ok(["run", "cli", "other"].includes(row.kind), `kind for ${row.id}`);
    assert.equal(typeof row.message_count, "number");
    assert.ok(row.started_at === null || typeof row.started_at === "number");
  }
  const kinds = data.sessions.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["cli", "run", "run"], "run_* and local-* are classified");
});

test("crew sessions forwards the filter and paging, clamped to the Worker's cap", async () => {
  const res = await call("/api/crew/sessions?bot=cloudflare&filter=run&limit=999&offset=-5");
  assert.equal(res.status, 200);
  const sent = new URL(`http://x${lastUpstream().path}${lastUpstream().search}`);
  assert.equal(sent.searchParams.get("filter"), "run");
  assert.equal(sent.searchParams.get("limit"), "100", "999 is clamped to the worker cap");
  assert.equal(sent.searchParams.get("offset"), "0", "a negative offset is clamped to 0");
  const data = await body(res);
  assert.equal(data.filter, "run");
  assert.equal(data.limit, 100);
  assert.equal(data.offset, 0);
});

test("crew sessions rejects an unknown filter and an unknown bot", async () => {
  assert.equal((await call("/api/crew/sessions?bot=cloudflare&filter=everything")).status, 400);
  const unknown = await call("/api/crew/sessions?bot=nope");
  assert.equal(unknown.status, 404);
  assert.equal((await body(unknown)).error, "unknown_bot");
  assert.equal((await call("/api/crew/sessions")).status, 404, "a missing bot is not a wildcard");
});

test("crew sessions redacts credentials that came out of a session title", async () => {
  const data = await body(await call("/api/crew/sessions?bot=cloudflare"));
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /ghp_[A-Za-z0-9]{20,}/, "no GitHub token reaches the browser");
  assert.match(text, /\[redacted\]/);
});

test("crew endpoints are GET-only", async () => {
  const post = await call("/api/crew/sessions?bot=cloudflare", { method: "POST" });
  assert.equal(post.status, 405);
  const del = await call("/api/crew/sessions/cloudflare/run_9f2c1a4b/messages", { method: "DELETE" });
  assert.equal(del.status, 405);
});

test("crew transcript is paged, redacted, and carries role/tool/time", async () => {
  const res = await call("/api/crew/sessions/cloudflare/run_9f2c1a4b/messages?limit=50&offset=0");
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data.session_id, "run_9f2c1a4b");
  assert.equal(data.messages.length, 3);
  assert.deepEqual(data.messages.map((m) => m.role), ["user", "tool", "assistant"]);
  assert.equal(data.messages[1].tool_name, "terminal");
  assert.equal(typeof data.messages[0].timestamp, "number");
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /sk-or-v1-/, "the OpenRouter key is redacted");
  assert.doesNotMatch(text, /abcdefghijklmnop123456/, "the bearer token is redacted");
  assert.match(text, /\[redacted\]/);
});

test("crew transcript rejects a malformed session id", async () => {
  const long = "a".repeat(80);
  assert.equal((await call(`/api/crew/sessions/cloudflare/${long}/messages`)).status, 404);
  assert.equal((await call("/api/crew/sessions/cloudflare/..%2F..%2Fetc/messages")).status, 404);
  assert.equal((await call("/api/crew/sessions/cloudflare/-bad/messages")).status, 404);
});

test("crew transcript for an unknown bot is a 404, not another bot's history", async () => {
  const res = await call("/api/crew/sessions/unknownbot/run_9f2c1a4b/messages");
  assert.equal(res.status, 404);
  assert.equal((await body(res)).error, "unknown_bot");
});

test("unknown crew paths are a clean 404", async () => {
  assert.equal((await call("/api/crew/whatever")).status, 404);
  assert.equal((await call("/api/crew/sessions/cloudflare/run_9f2c1a4b")).status, 404);
});

test("a dead origin degrades to a generic 502 without internals", async () => {
  const res = await call("/api/crew/sessions?bot=cloudflare", { e: { ...env, HERMES_ORIGIN: "http://127.0.0.1:1" } });
  assert.equal(res.status, 502);
  const text = JSON.stringify(await body(res));
  assert.doesNotMatch(text, /ECONNREFUSED|127\.0\.0\.1/);
});
