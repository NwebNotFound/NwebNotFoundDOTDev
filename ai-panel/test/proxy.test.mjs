// The tunnel boundary: the origin proxy must reject anything without the shared secret,
// inject the *right* credential per destination (dashboard session token, per-bot gateway
// key), and rewrite Host. Spawns the real proxy process.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROXY = path.join(here, "..", "origin-proxy", "proxy.mjs");
const SECRET = "proxy-test-secret-0123456789";
const DASH_TOKEN = "dash-session-token-for-tests";
const KEYS = { cloudflare: "key-for-cloudflare", minecraft: "key-for-minecraft" };

// Hermetic Hermes home: the proxy reads profile .env files, and the real ones must not leak in.
const HERMES_HOME = mkdtempSync(path.join(os.tmpdir(), "hermes-home-test-"));

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
      HERMES_HOME: HERMES_HOME,
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

test("health reports the proxy, the gateway and the bots without leaking anything", async () => {
  const res = await get("/health");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.gateway, true, "the mock gateway answered");
  assert.deepEqual(data.bots, ["default"], "the empty temp profiles dir yields default only");
  assert.equal(data.keys, undefined);
  assert.equal(data.secret, undefined);
  assert.doesNotMatch(JSON.stringify(data), /key-for-/, "no key material in the health payload");
});

test("health needs the shared secret too", async () => {
  const res = await fetch(`${proxyUrl}/health`);
  assert.equal(res.status, 401, "the tunnel cannot be used to probe the host");
});

test("an idle event stream is kept alive through the proxy", async () => {
  const holder = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.write('data: {"event":"run.started"}\n\n');
    setTimeout(() => res.end(), 400);
  });
  holder.listen(0, "127.0.0.1");
  await once(holder, "listening");
  const gateway = `http://127.0.0.1:${holder.address().port}`;
  const port = await freePort();
  const proc = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      PORT: String(port),
      GATEWAY: gateway,
      DASHBOARD: gateway,
      PANEL_SECRET: SECRET,
      HERMES_HOME: HERMES_HOME,
      HERMES_KEY_CLOUDFLARE: KEYS.cloudflare,
      SSE_PING_MS: "60",
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
    const res = await fetch(`http://127.0.0.1:${port}/gw/p/cloudflare/v1/runs/run_1/events`, {
      headers: { "x-hermes-panel-secret": SECRET },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/event-stream/);
    const text = await res.text();
    assert.match(text, /run\.started/, "the upstream frame is passed through");
    assert.match(text, /: ping/, "an idle stream got keep-alive frames");
  } finally {
    proc.kill();
    await new Promise((r) => holder.close(r));
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

test("gateway keys are resolved from the profile env files, cached, and never logged", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "hermes-home-dynamic-"));
  mkdirSync(path.join(home, "profiles", "alpha"), { recursive: true });
  mkdirSync(path.join(home, "profiles", "beta"), { recursive: true });
  writeFileSync(path.join(home, ".env"), "# default profile\nAPI_SERVER_KEY=key-from-default-env\n");
  // Quoted, `export `-prefixed and with a trailing comment: all valid in a Hermes .env.
  writeFileSync(
    path.join(home, "profiles", "alpha", ".env"),
    'FOO=bar\nexport API_SERVER_KEY="key-for-alpha"  # rotated 2026-01-01\n',
  );
  writeFileSync(path.join(home, "profiles", "beta", ".env"), "OTHER_SETTING=1\n");

  const port = await freePort();
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("HERMES_KEY_")) delete env[key];
  Object.assign(env, {
    PORT: String(port),
    GATEWAY: upstreamUrl,
    DASHBOARD: upstreamUrl,
    PANEL_SECRET: SECRET,
    HERMES_HOME: home,
    API_SERVER_KEY: "key-from-process-env",
  });

  const proc = spawn(process.execPath, [PROXY], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  proc.stdout.on("data", (buf) => (log += buf.toString()));
  proc.stderr.on("data", (buf) => (log += buf.toString()));
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
    const call = async (p) => {
      const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { "x-hermes-panel-secret": SECRET } });
      return { status: res.status, body: await res.json() };
    };

    const alpha = await call("/gw/p/alpha/v1/runs");
    assert.equal(alpha.status, 200);
    assert.equal(alpha.body.auth, "Bearer key-for-alpha", "quotes, export and comments are handled");

    const fallback = await call("/gw/p/default/v1/runs");
    assert.equal(fallback.body.auth, "Bearer key-from-default-env", "default reads the Hermes home .env");

    const noKey = await call("/gw/p/beta/v1/runs");
    assert.equal(noKey.status, 404);
    assert.equal(noKey.body.error, "unknown_bot", "a profile without a key stays a 404");

    const badName = await call("/gw/p/Bad..Name/v1/runs");
    assert.equal(badName.status, 404, "an invalid bot name is not a profile route");
    assert.equal(badName.body.error, "unknown_bot");

    const plain = await call("/gw/health");
    assert.equal(plain.body.auth, "Bearer key-from-process-env", "/gw/ without a profile keeps using API_SERVER_KEY");

    // Rotation is picked up within the cache window, not on every request.
    writeFileSync(path.join(home, "profiles", "alpha", ".env"), "API_SERVER_KEY=key-for-alpha-rotated\n");
    const cached = await call("/gw/p/alpha/v1/runs");
    assert.equal(cached.body.auth, "Bearer key-for-alpha", "the key is cached for ~30 s");

    assert.match(log, /gateway keys resolved from profile \.env: default, alpha, beta/, "startup log lists discovered bots");
    assert.doesNotMatch(log, /key-for-alpha|key-from-default-env|key-from-process-env/, "no key value is ever logged");
  } finally {
    proc.kill();
  }
});
