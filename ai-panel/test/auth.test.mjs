import test from "node:test";
import assert from "node:assert/strict";

import {
  sign,
  verify,
  safeEq,
  randomToken,
  parseCookies,
  cookie,
  csrfOk,
  currentUser,
  createSession,
  authorizeUrl,
  callbackUrl,
  SESSION_COOKIE,
  CSRF_COOKIE,
} from "../src/auth.js";

const SECRET = "unit-test-secret";

test("sign/verify round trip", async () => {
  const token = await sign(SECRET, { u: "42", exp: Math.floor(Date.now() / 1000) + 60 });
  const payload = await verify(SECRET, token);
  assert.equal(payload.u, "42");
});

test("verify rejects a tampered payload", async () => {
  const token = await sign(SECRET, { u: "42", exp: Math.floor(Date.now() / 1000) + 60 });
  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "1", exp: 9999999999 })).toString("base64url");
  assert.equal(await verify(SECRET, `${forged}.${mac}`), null);
  assert.equal(await verify(SECRET, `${body}.deadbeef`), null);
});

test("verify rejects an expired token and a wrong secret", async () => {
  const expired = await sign(SECRET, { u: "42", exp: 1000 });
  assert.equal(await verify(SECRET, expired), null);
  const fresh = await sign(SECRET, { u: "42", exp: Math.floor(Date.now() / 1000) + 60 });
  assert.equal(await verify("other-secret", fresh), null);
});

test("verify tolerates garbage", async () => {
  for (const bad of ["", "abc", "a.b.c", "..", null, undefined, 42]) {
    assert.equal(await verify(SECRET, bad), null);
  }
});

test("safeEq is length-safe and value-exact", () => {
  assert.equal(safeEq("abc", "abc"), true);
  assert.equal(safeEq("abc", "abd"), false);
  assert.equal(safeEq("abc", "abcd"), false);
  assert.equal(safeEq("", ""), true);
});

test("randomToken is unique and url-safe", () => {
  const a = randomToken(24);
  const b = randomToken(24);
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test("cookies parse and encode", () => {
  const req = new Request("https://x.test/", { headers: { cookie: "a=1; b=hello%20world; broken" } });
  const parsed = parseCookies(req);
  assert.equal(parsed.a, "1");
  assert.equal(parsed.b, "hello world");
  const c = cookie("nnf_ai", "v", 60);
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Max-Age=60/);
});

test("csrfOk requires cookie == header and a matching origin", () => {
  const url = new URL("https://ai.nwebnotfound.dev/api/bots");
  const ok = new Request(url, {
    method: "POST",
    headers: { cookie: `${CSRF_COOKIE}=tok`, "x-csrf-token": "tok", origin: "https://ai.nwebnotfound.dev" },
  });
  assert.equal(csrfOk(ok, url), true);

  const missing = new Request(url, { method: "POST", headers: { cookie: `${CSRF_COOKIE}=tok` } });
  assert.equal(csrfOk(missing, url), false);

  const mismatch = new Request(url, {
    method: "POST",
    headers: { cookie: `${CSRF_COOKIE}=tok`, "x-csrf-token": "other" },
  });
  assert.equal(csrfOk(mismatch, url), false);

  const badOrigin = new Request(url, {
    method: "POST",
    headers: { cookie: `${CSRF_COOKIE}=tok`, "x-csrf-token": "tok", origin: "https://evil.test" },
  });
  assert.equal(csrfOk(badOrigin, url), false);
});

test("currentUser only accepts the allowed Discord id", async () => {
  const env = { SESSION_SECRET: SECRET, ALLOWED_DISCORD_ID: "42" };
  const token = await createSession(env, { id: "42", name: "Nils" });
  const good = new Request("https://x.test/api/me", { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } });
  const user = await currentUser(env, good);
  assert.equal(user.id, "42");

  const other = await createSession(env, { id: "99", name: "Someone" });
  const bad = new Request("https://x.test/api/me", { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(other)}` } });
  assert.equal(await currentUser(env, bad), null);

  const none = new Request("https://x.test/api/me");
  assert.equal(await currentUser(env, none), null);
});

test("authorize url carries the fixed client id, scope and callback", () => {
  const env = { DISCORD_CLIENT_ID: "1566865767029284884", PANEL_HOST: "ai.nwebnotfound.dev" };
  const url = new URL(authorizeUrl(env, "state123"));
  assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "1566865767029284884");
  assert.equal(url.searchParams.get("scope"), "identify");
  assert.equal(url.searchParams.get("redirect_uri"), "https://ai.nwebnotfound.dev/auth/callback");
  assert.equal(url.searchParams.get("state"), "state123");
  assert.equal(callbackUrl(env), "https://ai.nwebnotfound.dev/auth/callback");
});
