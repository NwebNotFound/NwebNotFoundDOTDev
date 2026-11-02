// The tunnel boundary: the origin proxy must reject anything without the shared secret, inject
// the gateway key, and rewrite Host for the dashboard. Spawns the real proxy process.

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
    res.end(JSON.stringify({ ok: true, path: req.url, host: req.headers.host, auth: req.headers.authorization || null }));
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
      API_SERVER_KEY: "test-gateway-key",
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

test("requests without the shared secret are refused", async () => {
  const res = await fetch(`${proxyUrl}/gw/health`);
  assert.equal(res.status, 401);
  assert.equal(seen.length, 0, "nothing reached the upstream");
});

test("a wrong secret is refused", async () => {
  const res = await fetch(`${proxyUrl}/gw/health`, { headers: { "x-hermes-panel-secret": "nope-nope-nope-nope" } });
  assert.equal(res.status, 401);
});

test("gateway routes get the key injected and the secret stripped", async () => {
  const res = await fetch(`${proxyUrl}/gw/p/cloudflare/v1/runs`, {
    method: "POST",
    headers: { "x-hermes-panel-secret": SECRET, "content-type": "application/json" },
    body: JSON.stringify({ input: "hi" }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.path, "/p/cloudflare/v1/runs");
  assert.equal(data.auth, "Bearer test-gateway-key");
  const last = seen.at(-1);
  assert.equal(last.headers["x-hermes-panel-secret"], undefined, "panel secret never reaches Hermes");
});

test("dashboard routes are rewritten to the dashboard host", async () => {
  const res = await fetch(`${proxyUrl}/dash/api/profiles`, { headers: { "x-hermes-panel-secret": SECRET } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.path, "/api/profiles");
  assert.equal(data.host, new URL(upstreamUrl).host);
});

test("unknown prefixes are 404 and never proxied", async () => {
  const before = seen.length;
  const res = await fetch(`${proxyUrl}/etc/passwd`, { headers: { "x-hermes-panel-secret": SECRET } });
  assert.equal(res.status, 404);
  assert.equal(seen.length, before);
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
