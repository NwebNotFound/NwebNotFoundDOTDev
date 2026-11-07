// The local dev server must not be usable from a DNS-rebound page: it only answers loopback
// Host headers, and the session-minting /__dev/login needs the token printed at startup.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import { createDevServer, hostAllowed, loginTokenOk } from "../scripts/dev-server.mjs";

const TOKEN = "dev-login-token-for-tests";
let server;
let port;

before(async () => {
  const env = { SESSION_SECRET: "dev-session-secret", ALLOWED_DISCORD_ID: "111111111111111111", SESSION_VERSION: "1" };
  server = createDevServer({ env, loginToken: TOKEN });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = server.address().port;
});

after(() => server.close());

function get(pathname, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, headers: { host: host ?? `127.0.0.1:${port}` } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res));
    });
    req.on("error", reject);
    req.end();
  });
}

test("hostAllowed accepts only loopback names with the server's port", () => {
  assert.equal(hostAllowed("127.0.0.1:8788", 8788), true);
  assert.equal(hostAllowed("localhost:8788", 8788), true);
  assert.equal(hostAllowed("LOCALHOST:8788", 8788), true);
  for (const h of ["evil.example:8788", "localhost", "localhost:8789", "127.0.0.1.evil.example:8788", "", undefined]) {
    assert.equal(hostAllowed(h, 8788), false, String(h));
  }
});

test("loginTokenOk rejects a missing, wrong or empty token", () => {
  assert.equal(loginTokenOk(TOKEN, TOKEN), true);
  assert.equal(loginTokenOk("", TOKEN), false);
  assert.equal(loginTokenOk(null, TOKEN), false);
  assert.equal(loginTokenOk(TOKEN + "x", TOKEN), false);
  assert.equal(loginTokenOk("", ""), false, "an unset token never matches");
});

test("a rebound Host is refused before any route runs", async () => {
  const res = await get(`/__dev/login?token=${TOKEN}`, `rebind.example:${port}`);
  assert.equal(res.statusCode, 421);
  assert.equal(res.headers["set-cookie"], undefined);
});

test("/__dev/login without the startup token mints nothing", async () => {
  for (const p of ["/__dev/login", "/__dev/login?token=wrong"]) {
    const res = await get(p);
    assert.equal(res.statusCode, 403, p);
    assert.equal(res.headers["set-cookie"], undefined, p);
  }
});

test("/__dev/login with the token on a loopback Host sets the session and CSRF cookies", async () => {
  const res = await get(`/__dev/login?token=${TOKEN}`, `localhost:${port}`);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers["set-cookie"].length, 2);
});
