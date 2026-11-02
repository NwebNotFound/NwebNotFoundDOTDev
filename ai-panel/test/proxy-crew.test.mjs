// The crew routes at the tunnel boundary: a real proxy process against a stub gateway.
// What is asserted here is what the browser could otherwise try: other methods, other bots,
// malformed ids, paging beyond the cap, and secrets coming back out of the transcript.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROXY = path.join(here, "..", "origin-proxy", "proxy.mjs");
const SECRET = "crew-proxy-secret-0123456789";
const KEY = "key-for-cloudflare";
const HERMES_HOME = mkdtempSync(path.join(os.tmpdir(), "hermes-home-crew-"));

const sessions = [
  { id: "run_aaa111", title: "Deploy check", status: "completed", started_at: 1767225600, last_active: 1767229200, message_count: 4 },
  { id: "run_bbb222", title: "Cron: status report", status: "failed", started_at: 1767139200, last_active: 1767142800, message_count: 2 },
  // A credential in a title, and a lowercase-looking id that is neither run_ nor local-.
  { id: "legacy_ccc", title: "Rotate sk-or-v1-0123456789abcdef0123456789abcdef", started_at: 1767052800, last_active: 1767056400, message_count: 1 },
  { id: "local-ddd444", title: "CLI session on the host", started_at: 1766966400, last_active: 1766970000, message_count: 7 },
  { id: "local-eee555", title: "Another CLI session", started_at: 1766880000, last_active: 1766883600, message_count: 3 },
];

const messages = [
  { role: "user", content: "start", timestamp: 1767225600 },
  { role: "tool", tool_name: "terminal", content: "GITHUB_TOKEN=ghp_0123456789abcdefghijABCDEFGHIJ012345", timestamp: 1767225660 },
  { role: "assistant", content: "Authorization: Bearer abcdefghijklmnop123456", timestamp: 1767225720 },
];

// A long transcript, for the "a 600-message session is still reachable" case.
const longMessages = Array.from({ length: 6 }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  content: `m${i + 1}`,
  timestamp: 1767000000 + i * 60,
}));

let gateway;
let proxy;
let proxyUrl;
const seen = [];

function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

before(async () => {
  gateway = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    seen.push({ method: req.method, path: url.pathname, search: url.search, auth: req.headers.authorization || null });
    const send = (status, data) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(data));

    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "bad key" });

    const limit = Number(url.searchParams.get("limit")) || 0;
    const offset = Number(url.searchParams.get("offset")) || 0;
    const order = url.searchParams.get("order") || "";

    if (url.pathname === "/p/cloudflare/api/sessions" && req.method === "GET") {
      const page = limit > 0 ? sessions.slice(offset, offset + limit) : sessions;
      return send(200, { sessions: page, total: sessions.length, limit, offset });
    }
    const m = url.pathname.match(/^\/p\/cloudflare\/api\/sessions\/([^/]+)\/messages$/);
    if (m && req.method === "GET") {
      // Same contract as the gateway (hermes_cli/web_routers/sessions.py): limit, offset and
      // order=oldest|latest, where latest anchors the offset at the newest message.
      const rows = m[1] === "run_long1" ? longMessages : m[1] === "run_aaa111" ? messages : null;
      if (!rows) return send(404, { error: "no such session" });
      const page =
        order === "latest"
          ? rows.slice(Math.max(0, rows.length - offset - limit), rows.length - offset)
          : rows.slice(offset, offset + limit);
      return send(200, { messages: page, pagination: { limit, offset, order: order || "oldest", returned: page.length } });
    }
    return send(404, { error: "not found" });
  });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");

  const port = await freePort();
  proxyUrl = `http://127.0.0.1:${port}`;
  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      PORT: String(port),
      GATEWAY: `http://127.0.0.1:${gateway.address().port}`,
      DASHBOARD: `http://127.0.0.1:${gateway.address().port}`,
      PANEL_SECRET: SECRET,
      HERMES_HOME,
      HERMES_KEY_CLOUDFLARE: KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("proxy did not start")), 8000);
    proxy.stdout.on("data", (buf) => {
      if (buf.toString().includes("origin proxy on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    proxy.stderr.on("data", (buf) => process.stderr.write(buf));
  });
});

after(async () => {
  proxy?.kill();
  await new Promise((r) => gateway.close(r));
});

const call = (p, init = {}) =>
  fetch(`${proxyUrl}${p}`, { ...init, headers: { "x-hermes-panel-secret": SECRET, ...(init.headers || {}) } });

test("the crew list is GET-only and never reaches the gateway otherwise", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const before = seen.length;
    const res = await call("/gw/p/cloudflare/api/sessions", { method });
    assert.equal(res.status, 405, `${method} refused`);
    assert.equal(res.headers.get("allow"), "GET");
    assert.equal(seen.length, before, `${method} was not proxied`);
  }
  const msgs = await call("/gw/p/cloudflare/api/sessions/run_aaa111/messages", { method: "POST" });
  assert.equal(msgs.status, 405);
});

test("a bot without a configured key is a 404, not another bot's history", async () => {
  const before = seen.length;
  const res = await call("/gw/p/ghost/api/sessions");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "unknown_bot");
  assert.equal(seen.length, before, "nothing reached the gateway");
});

test("the crew list injects the bot key and strips client credentials", async () => {
  const res = await call("/gw/p/cloudflare/api/sessions", {
    headers: { authorization: "Bearer attacker-key", cookie: "session=attacker" },
  });
  assert.equal(res.status, 200);
  const last = seen.at(-1);
  assert.equal(last.auth, `Bearer ${KEY}`, "the proxy key wins");
  assert.equal(last.path, "/p/cloudflare/api/sessions");
});

test("paging is capped at the hard maximum even when the client asks for more", async () => {
  const res = await call("/gw/p/cloudflare/api/sessions?limit=9999&offset=-3");
  const data = await res.json();
  assert.equal(data.limit, 200, "limit clamped to the cap");
  assert.equal(data.offset, 0, "negative offset clamped");
  const sent = new URL(`http://x${seen.at(-1).search}`);
  assert.equal(sent.searchParams.get("limit"), "200", "the gateway is asked for one capped window");
  assert.equal(sent.searchParams.get("order"), "recent");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("paging slices locally and reports has_more/total", async () => {
  const first = await (await call("/gw/p/cloudflare/api/sessions?limit=2&offset=0")).json();
  assert.deepEqual(first.sessions.map((s) => s.id), ["run_aaa111", "run_bbb222"]);
  assert.equal(first.total, 5);
  assert.equal(first.has_more, true);

  const third = await (await call("/gw/p/cloudflare/api/sessions?limit=2&offset=4")).json();
  assert.deepEqual(third.sessions.map((s) => s.id), ["local-eee555"]);
  assert.equal(third.has_more, false, "last page");
});

test("filter=run and filter=cli split API runs from CLI sessions", async () => {
  const runs = await (await call("/gw/p/cloudflare/api/sessions?filter=run")).json();
  assert.deepEqual(runs.sessions.map((s) => s.id).sort(), ["run_aaa111", "run_bbb222"]);
  assert.equal(runs.total, 2);

  const cli = await (await call("/gw/p/cloudflare/api/sessions?filter=cli")).json();
  assert.deepEqual(cli.sessions.map((s) => s.id).sort(), ["local-ddd444", "local-eee555"]);

  const bad = await call("/gw/p/cloudflare/api/sessions?filter=everything");
  assert.equal(bad.status, 400);
});

test("rows are normalised to the displayed fields only", async () => {
  const data = await (await call("/gw/p/cloudflare/api/sessions?filter=run")).json();
  const row = data.sessions.find((s) => s.id === "run_aaa111");
  assert.deepEqual(Object.keys(row).sort(), [
    "api_call_count",
    "cost_usd",
    "id",
    "input_tokens",
    "kind",
    "last_active",
    "message_count",
    "model",
    "output_tokens",
    "provider",
    "source",
    "started_at",
    "status",
    "title",
  ]);
  assert.equal(row.kind, "run");
  assert.equal(row.message_count, 4);
});

test("credential-shaped text is redacted in titles before it leaves the host", async () => {
  const raw = await (await call("/gw/p/cloudflare/api/sessions")).text();
  assert.doesNotMatch(raw, /sk-or-v1-0123456789abcdef0123456789abcdef/, "the key itself is gone");
  assert.match(raw, /\[redacted\]/);
  assert.match(raw, /Rotate/, "the readable part of the title survives");
});

test("the transcript is paged, ordered, and redacted", async () => {
  const res = await call("/gw/p/cloudflare/api/sessions/run_aaa111/messages?limit=2&offset=0");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.session_id, "run_aaa111");
  assert.deepEqual(data.messages.map((m) => m.role), ["tool", "assistant"], "the newest page");
  assert.equal(data.messages[0].tool_name, "terminal");
  assert.equal(data.has_more, true, "the user message is behind this page");

  const raw = JSON.stringify(await (await call("/gw/p/cloudflare/api/sessions/run_aaa111/messages")).json());
  assert.doesNotMatch(raw, /ghp_0123456789abcdefghijABCDEFGHIJ012345/);
  assert.doesNotMatch(raw, /abcdefghijklmnop123456/);
  assert.match(raw, /\[redacted\]/);
  // The values that are not secrets are untouched.
  assert.match(raw, /terminal/);
});

test("an unknown session is the gateway's 404, and a malformed id never gets the crew shape", async () => {
  const missing = await call("/gw/p/cloudflare/api/sessions/run_nope/messages");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "session_not_found");

  // Near-miss paths used to fall through to the generic passthrough, which does not redact.
  // They are refused here now, before any upstream call.
  for (const p of [
    "/gw/p/cloudflare/api/sessions/bad..id/messages",
    "/gw/p/cloudflare/api/sessions/run_aaa111",
    "/gw/p/cloudflare/api/sessions/",
  ]) {
    const before = seen.length;
    const res = await call(p);
    assert.equal(res.status, 404, `${p} is not a crew route`);
    const body = await res.json();
    assert.equal(body.error, "not_found");
    assert.equal(body.messages, undefined, "no transcript payload");
    assert.equal(seen.length, before, `${p} never reached the gateway`);
  }
});

test("a transcript longer than one page stays reachable page by page", async () => {
  // The review point: a 600-message session must not stop at the first window.
  const contents = [];
  let offset = 0;
  let page;
  let guard = 0;
  do {
    page = await (await call(`/gw/p/cloudflare/api/sessions/run_long1/messages?limit=2&offset=${offset}`)).json();
    contents.unshift(...page.messages.map((m) => m.content));
    offset += page.messages.length;
    guard += 1;
  } while (page.has_more && guard < 10);
  assert.equal(guard, 3, "six messages in pages of two");
  assert.equal(page.has_more, false, "the oldest page says it is the end");
  assert.deepEqual(contents, ["m1", "m2", "m3", "m4", "m5", "m6"], "the whole transcript is reachable");
  const sent = new URL(`http://x${seen.at(-1).search}`);
  assert.equal(sent.searchParams.get("offset"), "4", "the last page asked for a real offset");
  assert.equal(sent.searchParams.get("order"), "latest");
});

test("the crew routes still need the shared secret", async () => {
  const res = await fetch(`${proxyUrl}/gw/p/cloudflare/api/sessions`);
  assert.equal(res.status, 401);
});
