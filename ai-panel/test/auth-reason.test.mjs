// /auth/denied?reason=… carries a value an attacker can write. The login screen may only
// render a sentence from the closed list, never the query string itself (issue #43).

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DENIED_MESSAGES,
  DENIED_FALLBACK,
  deniedNotice,
} from "../public/auth-reason.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const pub = path.join(root, "public");

// The codes src/index.js redirects with (fail("…") in handleCallback).
const WORKER_CODES = ["bad_state", "missing_code", "token_exchange", "user_fetch", "not_allowed"];

test("every Worker reason code has its own German message", async () => {
  const src = await readFile(path.join(root, "src", "index.js"), "utf8");
  const codes = [...src.matchAll(/fail\(\s*["']([a-z_]+)["']\s*\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(codes)].sort(), [...WORKER_CODES].sort(), "codes in the Worker changed");
  for (const code of WORKER_CODES) {
    assert.ok(Object.hasOwn(DENIED_MESSAGES, code), `${code} is not in the whitelist`);
    assert.match(deniedNotice(code), /[äöüß]|\b(Bitte|Discord|Konto)\b/, "message is German prose");
    assert.notEqual(deniedNotice(code), DENIED_FALLBACK, `${code} must not collapse into the fallback`);
  }
  const messages = WORKER_CODES.map((c) => deniedNotice(c));
  assert.equal(new Set(messages).size, WORKER_CODES.length, "each code explains something different");
});

test("unknown codes and free text fall back to one generic message", () => {
  for (const raw of [
    "nope",
    "NOT_ALLOWED",
    "not allowed",
    "<img src=x onerror=alert(1)>",
    "<script>alert(1)</script>",
    "\"><svg/onload=alert(1)>",
    "javascript:alert(document.cookie)",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    "toString",
  ]) {
    assert.equal(deniedNotice(raw), DENIED_FALLBACK, `"${raw}" must not reach the DOM`);
  }
});

test("the query value never becomes the output", () => {
  const evil = "x".repeat(200) + "<b>pwned</b>";
  const out = deniedNotice(evil);
  assert.equal(out, DENIED_FALLBACK);
  assert.ok(!out.includes("pwned") && !out.includes("xxxx"), "no fragment of the input survives");
});

test("no reason at all renders nothing", () => {
  for (const raw of [null, undefined, "", "   "]) assert.equal(deniedNotice(raw), "", String(raw));
});

test("non-string input is treated as an unknown code, not stringified into the DOM", () => {
  assert.equal(deniedNotice(5), DENIED_FALLBACK);
  assert.equal(deniedNotice({ reason: "not_allowed" }), DENIED_FALLBACK);
  assert.equal(deniedNotice(["not_allowed"]), DENIED_FALLBACK);
});

test("the login screen has a notice slot above the sign-in button", async () => {
  const html = await readFile(path.join(pub, "index.html"), "utf8");
  const notice = html.indexOf('id="login-notice"');
  const button = html.indexOf('class="login-btn"');
  assert.ok(notice > -1, "#login-notice exists");
  assert.ok(notice < button, "the notice sits above the Discord button");
  assert.match(html, /id="login-notice" role="status"[^>]*hidden/, "hidden until a reason arrives");
});

test("app.js renders the notice through textContent, gated on /auth/denied", async () => {
  const src = await readFile(path.join(pub, "app.js"), "utf8");
  assert.match(src, /import \{ deniedNotice \} from "\.\/auth-reason\.js"/);
  const fn = (src.match(/function showDeniedNotice\(\) \{[\s\S]*?\n\}/) || [])[0] || "";
  assert.ok(fn, "showDeniedNotice() exists");
  assert.match(fn, /url\.pathname === "\/auth\/denied"/, "only the denied redirect explains itself");
  assert.match(fn, /deniedNotice\(url\.searchParams\.get\("reason"\)\)/, "the reason goes through the whitelist");
  assert.match(fn, /\.textContent\s*=/, "text lands as textContent");
  assert.doesNotMatch(fn, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/, "no HTML sink");
  assert.match(src, /function showLogin\(\) \{[\s\S]*?showDeniedNotice\(\);/, "showLogin() paints the notice");
});

test("the notice has a theme-aware style, no hard-coded colour", async () => {
  const css = await readFile(path.join(pub, "app.css"), "utf8");
  const rule = (css.match(/\.login-notice \{[\s\S]*?\n\}/) || [])[0] || "";
  assert.ok(rule, ".login-notice is styled");
  assert.match(rule, /color: var\(--ds-danger\)/);
  assert.match(rule, /border: 1px solid var\(--ds-danger\)/, "border, so it is not colour-only");
  assert.doesNotMatch(rule, /#[0-9a-f]{3,8}\b|rgba?\(/i, "tokens only, both themes come from the token layer");
  assert.match(css, /\.login-notice\[hidden\] \{ display: none; \}/);
});
