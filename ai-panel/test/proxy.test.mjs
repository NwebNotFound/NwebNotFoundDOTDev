// The tunnel boundary: the origin proxy must reject anything without the shared secret,
// inject the *right* credential per destination (dashboard session token, per-bot gateway
// key), and rewrite Host. Spawns the real proxy process.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROXY = path.join(here, "..", "origin-proxy", "proxy.mjs");
const SECRET = "proxy-test-secret-0123456789";
const DASH_TOKEN = "dash-session-token-for-tests";
const KEYS = { cloudflare: "key-for-cloudflare", minecraft: "key-for-minecraft" };

let upstream;
let upstreamUrl;
let child;
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
  upstream = createServer((req, res) => {
    seen.push({ path: req.url, headers: req.headers });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        path: req.url,
        host: req.headers.host,
        auth: req.headers.authorization || null,
        dash: req.headers["x-hermes-session-token"] || null,
      }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;

  const port = await freePort();
  proxyUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      PORT: String(port),
      GATEWAY: upstreamUrl,
      DASHBOARD: upstreamUrl,
      PANEL_SECRET: SECRET,
      HERMES_DASHBOARD_SESSION_TOKEN: DASH_TOKEN,
      HERMES_KEY_CLOUDFLARE: KEYS.cloudflare,
      HERMES_KEY_MINECRAFT: KEYS.minecraft,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("proxy did not start")), 8000);
    child.stdout.on("data", (buf) => {
      if (buf.toString().includes("origin proxy on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (buf) => process.stderr.write(buf));
    child.on("exit", (code) => reject(new Error(`proxy exited ${code}`)));
  });
});

after(async () => {
  child?.kill();
  await new Promise((r) => upstream.close(r));
});

const get = (p, headers = {}) => fetch(`${proxyUrl}${p}`, { headers: { "x-hermes-panel-secret": SECRET, ...headers } });

test("requests without the shared secret are refused", async () => {
  const res = await fetch(`${proxyUrl}/gw/health`);
  assert.equal(res.status, 401);
  assert.equal(seen.length, 0, "nothing reached the upstream");
});

test("a wrong secret is refused", async () => {
  const res = await fetch(`${proxyUrl}/gw/health`, { headers: { "x-hermes-panel-secret": "nope-nope-nope-nope" } });
  assert.equal(res.status, 401);
});

test("each bot gets its own gateway key, chosen from the /p/<bot>/ prefix", async () => {
  const cf = await get("/gw/p/cloudflare/v1/runs", { "content-type": "application/json" });
  assert.equal(cf.status, 200);
  const cfData = await cf.json();
  assert.equal(cfData.path, "/p/cloudflare/v1/runs");
  assert.equal(cfData.auth, `Bearer ${KEYS.cloudflare}`);

  const mc = await get("/gw/p/minecraft/api/jobs");
  assert.equal(mc.status, 200);
  const mcData = await mc.json();
  assert.equal(mcData.path, "/p/minecraft/api/jobs");
  assert.equal(mcData.auth, `Bearer ${KEYS.minecraft}`, "minecraft must not get cloudflare's key");

  const last = seen.at(-1);
  assert.equal(last.headers["x-hermes-panel-secret"], undefined, "panel secret never reaches Hermes");
});

test("a profile without a configured key is a 404 and is never proxied", async () => {
  const before = seen.length;
  const res = await get("/gw/p/unknownbot/v1/runs", { "content-type": "application/json" });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "unknown_bot");
  assert.equal(seen.length, before, "no upstream request for an unknown bot");
});

test("dashboard routes get the dashboard session token and the dashboard host", async () => {
  const res = await get("/dash/api/profiles");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.path, "/api/profiles");
  assert.equal(data.host, new URL(upstreamUrl).host);
  assert.equal(data.dash, DASH_TOKEN, "dashboard session token injected");
  assert.equal(data.auth, null, "no gateway bearer on dashboard calls");
});

test("a client cannot smuggle its own credentials through", async () => {
  const res = await get("/gw/p/cloudflare/v1/runs", {
    authorization: "Bearer attacker-key",
    "x-hermes-session-token": "attacker-token",
  });
  const data = await res.json();
  assert.equal(data.auth, `Bearer ${KEYS.cloudflare}`, "proxy key wins over a client header");
  assert.equal(data.dash, null, "client cannot set the dashboard token on gateway calls");

  const dash = await get("/dash/api/profiles", {
    authorization: "Bearer attacker-key",
    "x-hermes-session-token": "attacker-token",
  });
  const dashData = await dash.json();
  assert.equal(dashData.dash, DASH_TOKEN, "proxy token wins");
  assert.equal(dashData.auth, null, "client bearer stripped on dashboard calls");
});

test("unknown prefixes are 404 and never proxied", async () => {
  const before = seen.length;
  const res = await get("/etc/passwd");
  assert.equal(res.status, 404);
  assert.equal(seen.length, before);
});

test("an unreachable upstream is a generic 502 without internals", async () => {
  const deadPort = await freePort();
  const dead = `http://127.0.0.1:${deadPort}`;
  const listenPort = await freePort();
  const proc = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      PORT: String(listenPort),
      PANEL_SECRET: SECRET,
      GATEWAY: dead,
      DASHBOARD: dead,
      HERMES_KEY_CLOUDFLARE: KEYS.cloudflare,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("proxy did not start")), 8000);
      proc.stdout.on("data", (buf) => {
        if (buf.toString().includes("origin proxy on")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const res = await fetch(`http://127.0.0.1:${listenPort}/gw/p/cloudflare/v1/runs`, {
      headers: { "x-hermes-panel-secret": SECRET },
    });
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.equal(data.error, "upstream_unreachable");
    assert.equal(data.detail, undefined, "no err.message in the response");
    assert.doesNotMatch(JSON.stringify(data), /ECONNREFUSED|127\.0\.0\.1/);
  } finally {
    proc.kill();
  }
});

test("the proxy refuses to start without a secret", async () => {
  const port = await freePort();
  const proc = spawn(process.execPath, [PROXY], {
    env: { ...process.env, PORT: String(port), PANEL_SECRET: "", GATEWAY: upstreamUrl, DASHBOARD: upstreamUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [code] = await once(proc, "exit");
  assert.equal(code, 1);
});

test("the proxy refuses a non-loopback bind", async () => {
  const proc = spawn(process.execPath, [PROXY], {
    env: { ...process.env, PORT: "0", HOST: "0.0.0.0", PANEL_SECRET: SECRET, GATEWAY: upstreamUrl, DASHBOARD: upstreamUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [code] = await once(proc, "exit");
  assert.equal(code, 1);
});
