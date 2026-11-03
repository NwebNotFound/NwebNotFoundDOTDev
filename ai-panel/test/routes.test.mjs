// End-to-end: the real Worker handler against a real local mock Hermes (HTTP, not stubs).
// Covers login → session → chat run → SSE → approve/steer/stop → jobs → models → soul →
// sessions → usage → log, plus CSRF, the allow-list, session revocation and the headers.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";

import { handle } from "../src/index.js";
import { createSession, sign, SESSION_COOKIE, CSRF_COOKIE } from "../src/auth.js";
import { resetCache, PanelStore, revokedBefore } from "../src/store.js";
import { startMockHermes, PANEL_SECRET, discordFetch, cookiesFrom, cookieHeader } from "./helpers.mjs";

const HOST = "https://ai.nwebnotfound.dev";
const ALLOWED = "111111111111111111";
const CSRF = "csrf-token-for-tests";

let mock;
let env;
let session;

const origLog = console.log;
const origErr = console.error;
console.log = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith('{"ai_panel"')) return;
  origLog(...args);
};
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
    ASSETS: { fetch: async () => new Response("<html>spa</html>", { headers: { "content-type": "text/html" } }) },
  };
  session = await createSession(env, { id: ALLOWED, name: "Nils" });
});

after(async () => {
  console.log = origLog;
  console.error = origErr;
  await mock.close();
});

function call(path, { method = "GET", body, cookies = {}, csrf = true, origin = true, sessionCookie = session, e = env } = {}) {
  const headers = {};
  const jar = { [SESSION_COOKIE]: sessionCookie, [CSRF_COOKIE]: CSRF, ...cookies };
  const cookieStr = cookieHeader(jar);
  if (cookieStr) headers.cookie = cookieStr;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && csrf) headers["x-csrf-token"] = CSRF;
  if (origin) headers.origin = HOST;
  return handle(
    new Request(`${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
  );
}

const body = (res) => res.json();

test("health is public but only says {ok} without a session", async () => {
  const res = await handle(new Request(`${HOST}/api/health`), env);
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.deepEqual(data, { ok: true }, "no bots, no session_version, nothing internal leaks");
  assert.equal(res.headers.get("cache-control")?.includes("no-store"), true, "not cacheable across users");
});

test("health with a session reports configuration plus the origin's view", async () => {
  const res = await call("/api/health");
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data.ok, true);
  assert.equal(data.authenticated, true);
  assert.equal(data.upstream, true);
  assert.equal(data.origin.reachable, true, "the proxy's /health answered");
  assert.equal(data.origin.gateway, true);
  assert.equal(data.auth, true);
  assert.equal(data.store, false, "no Durable Object binding in tests");
  assert.equal(data.session_version, "1");
  // The proxy's list (profiles dir + default) comes first, the dashboard adds the rest.
  assert.deepEqual(
    [...data.bots].sort(),
    ["cloudflare", "default", "discord", "homelab", "minecraft"],
  );
  assert.equal(data.bots.slice(0, 3).join(","), "cloudflare,minecraft,default", "routing source wins the order");
});

test("health with a forged or expired session still only says {ok}", async () => {
  const forged = await handle(
    new Request(`${HOST}/api/health`, { headers: { cookie: cookieHeader({ [SESSION_COOKIE]: "not-a-session" }) } }),
    env,
  );
  assert.deepEqual(await body(forged), { ok: true }, "a garbage cookie sees nothing internal");

  // correctly signed, but past its exp
  const old = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
  const expired = await sign(env.SESSION_SECRET, {
    u: ALLOWED,
    n: "Nils",
    v: "1",
    iat: old,
    exp: old + 60,
  });
  const res = await handle(
    new Request(`${HOST}/api/health`, { headers: { cookie: cookieHeader({ [SESSION_COOKIE]: expired }) } }),
    env,
  );
  assert.deepEqual(await body(res), { ok: true }, "an expired session sees nothing internal");
});

test("static assets fall through to ASSETS and still get the security headers", async () => {
  const res = await handle(new Request(`${HOST}/`), env);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /spa/);
  assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
});

test("every response carries CSP with frame-ancestors 'none'", async () => {
  for (const path of ["/api/health", "/api/me"]) {
    const res = await call(path);
    const csp = res.headers.get("content-security-policy") || "";
    assert.match(csp, /frame-ancestors 'none'/, `${path} has frame-ancestors`);
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }
});

test("api without a session is 401", async () => {
  const res = await call("/api/me", { sessionCookie: "" });
  assert.equal(res.status, 401);
});

test("discord oauth: login → callback → session cookie", async () => {
  const restore = discordFetch({ userId: ALLOWED });
  try {
    const login = await handle(new Request(`${HOST}/auth/login`), env);
    assert.equal(login.status, 302);
    const location = new URL(login.headers.get("location"));
    assert.equal(location.host, "discord.com");
    assert.equal(location.searchParams.get("client_id"), "1566865767029284884");
    assert.equal(location.searchParams.get("redirect_uri"), "https://ai.nwebnotfound.dev/auth/callback");
    assert.equal(location.searchParams.get("prompt"), null, "prompt=none removed");
    const state = location.searchParams.get("state");
    const jar = cookiesFrom(login);
    assert.ok(jar.nnf_ai_state);

    const cb = await handle(
      new Request(`${HOST}/auth/callback?code=abc&state=${state}`, {
        headers: { cookie: cookieHeader({ nnf_ai_state: jar.nnf_ai_state }) },
      }),
      env,
    );
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get("location"), "/");
    const set = cookiesFrom(cb);
    assert.ok(set[SESSION_COOKIE], "session cookie set");
    assert.ok(set[CSRF_COOKIE], "csrf cookie set");
    const setCookies = cb.headers.getSetCookie().join("\n");
    assert.match(setCookies, /HttpOnly/);
    assert.match(setCookies, /Secure/);
    assert.match(setCookies, /SameSite=Lax/);

    // the minted session actually authenticates
    const me = await handle(
      new Request(`${HOST}/api/me`, { headers: { cookie: cookieHeader({ [SESSION_COOKIE]: set[SESSION_COOKIE] }) } }),
      env,
    );
    assert.equal(me.status, 200);
    assert.equal((await body(me)).user.id, ALLOWED);
  } finally {
    restore();
  }
});

test("discord oauth: another account is refused and gets no session", async () => {
  const restore = discordFetch({ userId: "999999999999999999" });
  try {
    const login = await handle(new Request(`${HOST}/auth/login`), env);
    const state = new URL(login.headers.get("location")).searchParams.get("state");
    const jar = cookiesFrom(login);
    const cb = await handle(
      new Request(`${HOST}/auth/callback?code=abc&state=${state}`, {
        headers: { cookie: cookieHeader({ nnf_ai_state: jar.nnf_ai_state }) },
      }),
      env,
    );
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get("location"), /^\/auth\/denied/);
    assert.equal(cookiesFrom(cb)[SESSION_COOKIE], undefined);
  } finally {
    restore();
  }
});

test("callback with a bad state is refused", async () => {
  const restore = discordFetch({ userId: ALLOWED });
  try {
    const login = await handle(new Request(`${HOST}/auth/login`), env);
    const jar = cookiesFrom(login);
    const cb = await handle(
      new Request(`${HOST}/auth/callback?code=abc&state=wrong`, {
        headers: { cookie: cookieHeader({ nnf_ai_state: jar.nnf_ai_state }) },
      }),
      env,
    );
    assert.match(cb.headers.get("location"), /reason=bad_state/);
  } finally {
    restore();
  }
});

test("mutating requests need the csrf header", async () => {
  const res = await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "hi" }, csrf: false });
  assert.equal(res.status, 403);
  assert.equal((await body(res)).error, "csrf_failed");
});

test("logout is POST-only and needs the csrf token", async () => {
  const get = await call("/auth/logout");
  assert.equal(get.status, 405, "GET logout must not sign anyone out");

  const noToken = await call("/auth/logout", { method: "POST", csrf: false });
  assert.equal(noToken.status, 403);
  assert.equal((await body(noToken)).error, "csrf_failed");

  const ok = await call("/auth/logout", { method: "POST" });
  assert.equal(ok.status, 200);
  assert.equal((await body(ok)).ok, true);
  const cleared = ok.headers.getSetCookie().join("\n");
  assert.match(cleared, /nnf_ai=;.*Max-Age=0/);
  assert.match(cleared, /nnf_ai_csrf=;.*Max-Age=0/);
});

test("logout invalidates the cached revocation marker right away", async () => {
  resetCache();
  const map = new Map();
  const storage = {
    async get(k) {
      return map.get(k);
    },
    async put(k, v) {
      map.set(k, v);
    },
    async delete(k) {
      if (Array.isArray(k)) for (const x of k) map.delete(x);
      else map.delete(k);
    },
    async list({ prefix = "" } = {}) {
      return new Map([...map].filter(([k]) => k.startsWith(prefix)));
    },
  };
  const doStore = new PanelStore({ storage }, {});
  const envWithStore = {
    ...env,
    PANEL_STORE: { idFromName: (n) => n, get: () => ({ fetch: (url, init) => doStore.fetch(new Request(url, init)) }) },
  };
  const writeMarker = (before) =>
    doStore.fetch(new Request("https://panel-store/revoked", { method: "POST", body: JSON.stringify({ before }) }));
  try {
    assert.equal(await revokedBefore(envWithStore), 0, "the empty marker is cached");
    await writeMarker(1700000000);
    assert.equal(await revokedBefore(envWithStore), 0, "another isolate's write is not seen yet");

    const out = await call("/auth/logout", { method: "POST", e: envWithStore });
    assert.equal(out.status, 200);
    assert.equal(await revokedBefore(envWithStore), 1700000000, "the logout dropped the stale value");

    const all = await call("/api/logout-all", { method: "POST", e: envWithStore });
    assert.equal(all.status, 200);
    const marker = (await body(all)).revoked_before;
    assert.equal(await revokedBefore(envWithStore), marker, "sign out everywhere stores the fresh marker");
  } finally {
    resetCache();
  }
});

test("me returns the user, csrf token and bots", async () => {
  const data = await body(await call("/api/me"));
  assert.equal(data.user.id, ALLOWED);
  assert.equal(data.csrf, CSRF);
  assert.ok(data.bots.includes("cloudflare"));
  assert.ok(data.bots.includes("default"), "live profiles are allowed, not just PANEL_BOTS");
});

test("me mints a csrf cookie when it is missing", async () => {
  const res = await call("/api/me", { cookies: { [CSRF_COOKIE]: "" } });
  const data = await body(res);
  assert.ok(data.csrf && data.csrf.length > 10);
  const set = cookiesFrom(res);
  assert.equal(set[CSRF_COOKIE], data.csrf);
});

test("bots list comes from the live profile list", async () => {
  const data = await body(await call("/api/bots"));
  const names = data.bots.map((b) => b.name);
  assert.ok(names.includes("cloudflare"));
  assert.ok(names.includes("default"));
  assert.equal(data.bots.find((b) => b.name === "cloudflare").exists, true);
  assert.equal(data.others, undefined, "no dead 'others' bucket");
});

test("bot creation validates the name", async () => {
  const bad = await call("/api/bots", { method: "POST", body: { name: "../etc" } });
  assert.equal(bad.status, 400);
  const good = await call("/api/bots", { method: "POST", body: { name: "research", description: "papers" } });
  assert.equal(good.status, 200);
  const data = await body(good);
  assert.equal(data.ok, true);
  assert.equal(data.panel_enabled, true, "a bot created in the panel is usable without a redeploy");
});

test("a bot created in the panel works immediately, no PANEL_BOTS edit", async () => {
  const soul = await call("/api/bots/research/soul");
  assert.equal(soul.status, 200);
  const jobs = await call("/api/bots/research/jobs");
  assert.equal(jobs.status, 200);
});

test("chat run: start, stream events, approve, steer, stop", async () => {
  const started = await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "status?" } });
  assert.equal(started.status, 200);
  const { run_id } = await body(started);
  assert.match(run_id, /^run_/);

  const upstream = mock.state.requests.find((r) => r.path === "/gw/p/cloudflare/v1/runs");
  assert.equal(upstream.body.model, "hermes-agent");
  assert.equal(upstream.headers["x-hermes-panel-secret"], PANEL_SECRET);

  const events = await call(`/api/bots/cloudflare/runs/${run_id}/events`);
  assert.equal(events.status, 200);
  assert.match(events.headers.get("content-type"), /text\/event-stream/);
  const text = await events.text();
  assert.match(text, /run\.started/);
  assert.match(text, /thinking\.delta/);
  assert.match(text, /tool\.started/);
  assert.match(text, /run\.completed/);

  const approve = await call(`/api/bots/cloudflare/runs/${run_id}/approval`, { method: "POST", body: { choice: "once" } });
  assert.equal(approve.status, 200);
  // The gateway's session authority takes exactly {request_id, execution_generation, choice};
  // both ids are filled in from GET /v1/runs/<id> when the client did not send them.
  const sent = mock.state.requests.filter((r) => r.path === `/gw/p/cloudflare/v1/runs/${run_id}/approval`).at(-1);
  assert.deepEqual(Object.keys(sent.body).sort(), ["choice", "execution_generation", "request_id"]);
  assert.deepEqual(sent.body, { request_id: "req_1", execution_generation: 3, choice: "once" });
  assert.ok(
    mock.state.requests.some((r) => r.path === `/gw/p/cloudflare/v1/runs/${run_id}` && r.method === "GET"),
    "the pending control was resolved from the run",
  );
  const badChoice = await call(`/api/bots/cloudflare/runs/${run_id}/approval`, { method: "POST", body: { choice: "yolo" } });
  assert.equal(badChoice.status, 400);

  const resumed = await call(`/api/bots/cloudflare/runs/${run_id}/events?since=3`);
  assert.equal(resumed.status, 200);
  await resumed.text();
  const resumedUpstream = mock.state.requests.filter((r) => r.path === `/gw/p/cloudflare/v1/runs/${run_id}/events`).at(-1);
  assert.match(resumedUpstream.search, /since=3/, "a resume cursor is forwarded");

  await (await call(`/api/bots/cloudflare/runs/${run_id}/events?since=../etc`)).text();
  const junkCursor = mock.state.requests.filter((r) => r.path === `/gw/p/cloudflare/v1/runs/${run_id}/events`).at(-1);
  assert.equal(junkCursor.search, "", "a non-numeric cursor is dropped");

  const steer = await call(`/api/bots/cloudflare/runs/${run_id}/steer`, { method: "POST", body: { input: "faster" } });
  assert.equal(steer.status, 200);

  const stop = await call(`/api/bots/cloudflare/runs/${run_id}/stop`, { method: "POST", body: {} });
  assert.equal(stop.status, 200);
});

test("approval uses the client's request_id and execution_generation when it has them", async () => {
  const started = await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "approve me" } });
  const { run_id } = await body(started);
  const before = mock.state.requests.filter((r) => r.path.endsWith("/approval")).length;
  mock.state.pendingControls = null;
  try {
    const res = await call(`/api/bots/cloudflare/runs/${run_id}/approval`, {
      method: "POST",
      body: { choice: "session", request_id: "req_from_client", execution_generation: 7 },
    });
    assert.equal(res.status, 200);
    const sent = mock.state.requests.filter((r) => r.path.endsWith("/approval")).slice(before);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body, { request_id: "req_from_client", execution_generation: 7, choice: "session" });
  } finally {
    mock.state.pendingControls = { request_id: "req_1", execution_generation: 3 };
  }
});

test("an approval with no resolvable context is a 409 instead of a silent no-op", async () => {
  const started = await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "no context" } });
  const { run_id } = await body(started);
  const before = mock.state.requests.filter((r) => r.path.endsWith("/approval")).length;
  mock.state.pendingControls = null;
  try {
    const res = await call(`/api/bots/cloudflare/runs/${run_id}/approval`, { method: "POST", body: { choice: "once" } });
    assert.equal(res.status, 409);
    assert.equal((await body(res)).error, "approval_context_missing");
    assert.equal(
      mock.state.requests.filter((r) => r.path.endsWith("/approval")).length,
      before,
      "no approval was sent upstream",
    );
  } finally {
    mock.state.pendingControls = { request_id: "req_1", execution_generation: 3 };
  }
});

test("run history is persisted, listed per bot, and refreshed by polling", async () => {
  const started = await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "history check" } });
  const { run_id } = await body(started);

  const listed = await body(await call("/api/runs?limit=20"));
  const row = listed.runs.find((r) => r.run_id === run_id);
  assert.ok(row, "the started run is in the history");
  assert.equal(row.bot, "cloudflare");
  assert.equal(row.input, "history check");

  const fetched = await call(`/api/bots/cloudflare/runs/${run_id}`);
  assert.equal((await body(fetched)).pending.request_id, "req_1", "the poll reports the pending control");

  mock.state.runs.set(run_id, { status: "completed", output: "done" });
  await body(await call(`/api/bots/cloudflare/runs/${run_id}`));
  const refreshed = await body(await call("/api/runs?bot=cloudflare&limit=20"));
  assert.equal(refreshed.runs.find((r) => r.run_id === run_id).status, "completed", "status refreshed by the poll");

  const unknown = await call("/api/runs?bot=nope");
  assert.equal(unknown.status, 404);
});

test("chat history: send, reload, and the transcript is still there", async () => {
  const started = await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "Was ist der Status?" } });
  assert.equal(started.status, 200);
  const { run_id, conversation_id } = await body(started);
  assert.match(conversation_id, /^c_/);

  // The user message is stored at run start, before anything streams.
  const early = await body(await call(`/api/bots/cloudflare/conversations/${conversation_id}/messages`));
  assert.deepEqual(early.messages.map((m) => [m.role, m.content]), [["user", "Was ist der Status?"]]);

  // The stream tap records tool row and final answer while the bytes go through untouched.
  const events = await call(`/api/bots/cloudflare/runs/${run_id}/events`);
  assert.equal(events.status, 200);
  const streamed = await events.text();
  assert.match(streamed, /run\.completed/, "the client still sees the raw stream");
  assert.doesNotMatch(streamed, /: ping/, "the tap does not inject frames itself");

  // "Reload": a fresh list call finds the thread and its full transcript.
  const list = await body(await call("/api/bots/cloudflare/conversations"));
  const conv = list.conversations.find((c) => c.id === conversation_id);
  assert.ok(conv, "conversation listed after reload");
  assert.equal(conv.title, "Was ist der Status?");
  assert.equal(conv.bot, "cloudflare");

  const full = await body(await call(`/api/bots/cloudflare/conversations/${conversation_id}/messages`));
  assert.deepEqual(full.messages.map((m) => m.role), ["user", "tool", "assistant"]);
  assert.equal(full.messages[1].tool, "terminal");
  assert.equal(full.messages[1].content, "exit 0");
  assert.equal(full.messages[2].content, "fertig");
});

test("a second message continues the same conversation and keeps its title", async () => {
  const first = await body(
    await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "erste frage" } }),
  );
  const second = await body(
    await call("/api/bots/cloudflare/runs", {
      method: "POST",
      body: { input: "zweite frage", conversation_id: first.conversation_id },
    }),
  );
  assert.equal(second.conversation_id, first.conversation_id, "same thread");

  const list = await body(await call("/api/bots/cloudflare/conversations"));
  const matches = list.conversations.filter((c) => c.id === first.conversation_id);
  assert.equal(matches.length, 1, "no duplicate thread");
  assert.equal(matches[0].title, "erste frage", "the title stays the first message");

  const messages = await body(await call(`/api/bots/cloudflare/conversations/${first.conversation_id}/messages`));
  assert.deepEqual(
    messages.messages.filter((m) => m.role === "user").map((m) => m.content),
    ["erste frage", "zweite frage"],
  );
});

test("history survives a fresh login: a new session sees the same threads", async () => {
  const started = await body(
    await call("/api/bots/discord/runs", { method: "POST", body: { input: "nach dem re-login" } }),
  );
  await (await call(`/api/bots/discord/runs/${started.run_id}/events`)).text();

  // What /auth/callback mints on a new login: an unrelated session cookie for the same user.
  const nowS = Math.floor(Date.now() / 1000);
  const fresh = await sign(env.SESSION_SECRET, { u: ALLOWED, n: "Nils", v: "1", iat: nowS - 30, exp: nowS + 3600 });
  assert.notEqual(fresh, session, "it really is a different session");

  const list = await body(await call("/api/bots/discord/conversations", { sessionCookie: fresh }));
  const conv = list.conversations.find((c) => c.id === started.conversation_id);
  assert.ok(conv, "the thread is listed for the new session");
  assert.equal(conv.title, "nach dem re-login");

  const page = await body(
    await call(`/api/bots/discord/conversations/${started.conversation_id}/messages`, { sessionCookie: fresh }),
  );
  assert.deepEqual(page.messages.map((m) => m.role), ["user", "tool", "assistant"], "the transcript is intact");
  assert.equal(page.messages.at(-1).content, "fertig");
  assert.equal(page.has_more, false);
});

test("the transcript endpoint pages with before/limit", async () => {
  const started = await body(
    await call("/api/bots/homelab/runs", { method: "POST", body: { input: "erste" } }),
  );
  await (await call(`/api/bots/homelab/runs/${started.run_id}/events`)).text();

  const all = await body(await call(`/api/bots/homelab/conversations/${started.conversation_id}/messages?limit=50`));
  assert.equal(all.messages.length, 3);

  const newest = await body(
    await call(`/api/bots/homelab/conversations/${started.conversation_id}/messages?limit=1`),
  );
  assert.equal(newest.messages.length, 1);
  assert.equal(newest.has_more, true, "there are older rows");
  assert.equal(newest.next_before, newest.messages[0].seq);

  const older = await body(
    await call(
      `/api/bots/homelab/conversations/${started.conversation_id}/messages?limit=50&before=${newest.next_before}`,
    ),
  );
  assert.equal(older.messages.length, 2, "the page above it");
  assert.equal(older.has_more, false);
  assert.ok(older.messages.every((m) => m.seq < newest.next_before), "strictly older rows");
});

test("a formatting-only message does not break the store", async () => {
  const res = await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "  " } });
  assert.ok([200, 400].includes(res.status), "no 500 for whitespace input");
});

test("chat history survives a dropped stream through the poll fallback", async () => {
  mock.state.streamDrops = true;
  try {
    const started = await body(
      await call("/api/bots/cloudflare/runs", { method: "POST", body: { input: "poll me" } }),
    );
    const events = await call(`/api/bots/cloudflare/runs/${started.run_id}/events`);
    await events.text(); // only run.started, then the upstream ends

    mock.state.runs.set(started.run_id, { status: "completed", output: "per Poll fertig" });
    const polled = await body(await call(`/api/bots/cloudflare/runs/${started.run_id}`));
    assert.equal(polled.status, "completed");

    const messages = await body(
      await call(`/api/bots/cloudflare/conversations/${started.conversation_id}/messages`),
    );
    const last = messages.messages.at(-1);
    assert.equal(last.role, "assistant");
    assert.equal(last.content, "per Poll fertig", "the poll persisted the answer server-side");
  } finally {
    mock.state.streamDrops = false;
  }
});

test("a run can continue an existing session", async () => {
  const started = await call("/api/bots/cloudflare/runs", {
    method: "POST",
    body: { input: "weiter", session_id: "20260101_120000_aaaaaa" },
  });
  assert.equal(started.status, 200);
  const upstream = mock.state.requests.filter((r) => r.path === "/gw/p/cloudflare/v1/runs").at(-1);
  assert.equal(upstream.body.session_id, "20260101_120000_aaaaaa");
});

test("quick chat proxies the chat/completions stream", async () => {
  const res = await call("/api/bots/cloudflare/quick", {
    method: "POST",
    body: { messages: [{ role: "user", content: "hi" }] },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const text = await res.text();
  assert.match(text, /hallo/);
  assert.match(text, /\[DONE\]/);
});

test("cron jobs: list, create, patch, pause, delete needs confirm", async () => {
  const list = await body(await call("/api/bots/minecraft/jobs"));
  assert.equal(list.jobs.length, 1);

  const created = await call("/api/bots/minecraft/jobs", {
    method: "POST",
    body: { name: "nightly", schedule: "0 3 * * *", prompt: "backup" },
  });
  assert.equal(created.status, 200);
  const job = (await body(created)).job;
  assert.equal(job.name, "nightly");

  const patched = await call(`/api/bots/minecraft/jobs/${job.id}`, { method: "PATCH", body: { schedule: "0 4 * * *" } });
  assert.equal(patched.status, 200);

  const paused = await call(`/api/bots/minecraft/jobs/${job.id}/pause`, { method: "POST", body: {} });
  assert.equal(paused.status, 200);

  const noConfirm = await call(`/api/bots/minecraft/jobs/${job.id}`, { method: "DELETE" });
  assert.equal(noConfirm.status, 409);
  assert.equal((await body(noConfirm)).error, "confirm_required");

  const deleted = await call(`/api/bots/minecraft/jobs/${job.id}?confirm=1`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
});

test("models: options, plain switch, confirm_required switch", async () => {
  const options = await body(await call("/api/bots/discord/models"));
  assert.equal(options.current.provider, "openrouter");
  assert.equal(options.providers[0].slug, "openrouter");
  assert.equal(options.providers[0].models[1].id, "expensive/x");

  const plain = await call("/api/bots/discord/model", { method: "POST", body: { provider: "openrouter", model: "deepseek/x" } });
  assert.equal(plain.status, 200);

  const needsConfirm = await call("/api/bots/discord/model", {
    method: "POST",
    body: { provider: "openrouter", model: "expensive/x" },
  });
  assert.equal(needsConfirm.status, 409);
  const data = await body(needsConfirm);
  assert.equal(data.confirm_required, true);
  assert.match(data.message, /expensive/);

  const confirmed = await call("/api/bots/discord/model", {
    method: "POST",
    body: { provider: "openrouter", model: "expensive/x", confirm: true },
  });
  assert.equal(confirmed.status, 200);
});

test("soul: read, write needs confirm", async () => {
  const read = await body(await call("/api/bots/homelab/soul"));
  assert.match(read.content, /SOUL/);

  const noConfirm = await call("/api/bots/homelab/soul", { method: "PUT", body: { content: "new" } });
  assert.equal(noConfirm.status, 409);

  const written = await call("/api/bots/homelab/soul", { method: "PUT", body: { content: "new soul", confirm: true } });
  assert.equal(written.status, 200);
  assert.equal(mock.state.soul, "new soul");
});

test("sessions list and messages", async () => {
  const list = await body(await call("/api/bots/cloudflare/sessions"));
  assert.equal(list.sessions.length, 3);
  const deploy = list.sessions.find((s) => s.title === "Deploy check");
  assert.ok(deploy, "the fixture session is listed");
  assert.equal(deploy.cost_usd > 0, true);

  const msgs = await body(await call(`/api/bots/cloudflare/sessions/${deploy.id}/messages`));
  assert.equal(msgs.messages.length, 3);
  assert.equal(msgs.messages[0].role, "user");
});

test("usage aggregates per bot and tolerates a missing OpenRouter key", async () => {
  const data = await body(await call("/api/usage"));
  assert.equal(data.openrouter.available, false);
  assert.equal(data.openrouter.error, "Kein OpenRouter-Key");
  assert.equal(data.prices_error, "Kein OpenRouter-Key", "prices degrade the same generic way");
  assert.ok(data.per_bot.length >= 4);
  const cf = data.per_bot.find((b) => b.bot === "cloudflare");
  assert.equal(cf.sessions, 3);
  assert.ok(cf.cost_usd > 0);
  assert.ok(data.daily.length >= 1);
  assert.ok(Array.isArray(data.prices));
});

test("usage keeps upstream error text server-side", async () => {
  const realFetch = globalThis.fetch;
  const outerErr = console.error;
  const logged = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://openrouter.ai/")) throw new Error("getaddrinfo ENOTFOUND openrouter.ai");
    return realFetch(url, init);
  };
  console.error = (...args) => logged.push(args.map(String).join(" "));
  let data;
  try {
    data = await body(await call("/api/usage", { e: { ...env, OPENROUTER_API_KEY: "sk-or-test-key" } }));
  } finally {
    globalThis.fetch = realFetch;
    console.error = outerErr;
  }
  assert.equal(data.openrouter.error, "Upstream-Fehler");
  assert.equal(data.prices_error, "Upstream-Fehler");
  const asText = JSON.stringify(data);
  assert.doesNotMatch(asText, /ENOTFOUND|getaddrinfo/);
  assert.doesNotMatch(asText, /sk-or-test-key/, "the OpenRouter key never reaches the browser");
  assert.match(logged.join("\n"), /ENOTFOUND/, "the real reason still reaches the Worker log");
});

test("request log records the calls without secrets", async () => {
  const data = await body(await call("/api/log?limit=10"));
  assert.ok(data.entries.length > 0);
  const asText = JSON.stringify(data.entries);
  assert.doesNotMatch(asText, /panel-secret|discord-secret|session-secret/);
  assert.ok(data.entries.some((e) => e.path.startsWith("/api/")));
});

test("unknown bot and unknown route are 404", async () => {
  assert.equal((await call("/api/bots/nope/soul")).status, 404);
  assert.equal((await call("/api/bots/cloudflare/nope")).status, 404);
});

test("upstream failure surfaces as a generic 502, not a 500", async () => {
  const broken = { ...env, HERMES_ORIGIN: "http://127.0.0.1:1" };
  const res = await handle(
    new Request(`${HOST}/api/bots`, { headers: { cookie: cookieHeader({ [SESSION_COOKIE]: session }) } }),
    broken,
  );
  assert.equal(res.status, 502);
  const data = await body(res);
  assert.equal(data.error, "upstream_unreachable");
  assert.equal(data.detail, undefined);
  assert.doesNotMatch(JSON.stringify(data), /ECONNREFUSED|127\.0\.0\.1/);
});

test("an upstream 401 is a 502 for the panel and leaks no upstream text", async () => {
  const srv = createServer((req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad key sk-live-do-not-leak" }));
  });
  srv.listen(0, "127.0.0.1");
  await once(srv, "listening");
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    const res = await handle(
      new Request(`${HOST}/api/bots`, { headers: { cookie: cookieHeader({ [SESSION_COOKIE]: session }) } }),
      { ...env, HERMES_ORIGIN: url },
    );
    assert.equal(res.status, 502);
    const data = await body(res);
    assert.equal(data.error, "profiles_unavailable");
    assert.doesNotMatch(JSON.stringify(data), /sk-live-do-not-leak|bad key/);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("a session from an older SESSION_VERSION is refused", async () => {
  const old = await createSession(env, { id: ALLOWED, name: "Nils" });
  const res = await call("/api/me", { sessionCookie: old, e: { ...env, SESSION_VERSION: "2" } });
  assert.equal(res.status, 401);
});

test("logout-all revokes every issued session", async () => {
  resetCache();
  const mine = await createSession(env, { id: ALLOWED, name: "Nils" });
  assert.equal((await call("/api/me", { sessionCookie: mine })).status, 200);
  const out = await call("/api/logout-all", { method: "POST", sessionCookie: mine });
  assert.equal(out.status, 200);
  assert.ok((await body(out)).revoked_before > 0);
  const after = await call("/api/me", { sessionCookie: mine });
  assert.equal(after.status, 401, "the old cookie no longer authenticates");
  resetCache();
});
