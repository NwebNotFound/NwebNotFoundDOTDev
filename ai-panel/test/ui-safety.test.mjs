// Static guards for the SPA: the XSS story depends on these files never reaching for
// innerHTML, and on index.html staying compatible with the CSP (no inline script/style).

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");

const JS = ["app.js", "markdown.js", "highlight.js"];

async function read(name) {
  return readFile(path.join(pub, name), "utf8");
}

test("no DOM-HTML sinks in the SPA", async () => {
  const banned = [/\.innerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /outerHTML\s*=/, /\beval\s*\(/, /new Function\s*\(/];
  for (const name of JS) {
    const src = await read(name);
    for (const re of banned) assert.doesNotMatch(src, re, `${name} must not use ${re}`);
  }
});

test("the SPA only imports local modules (CSP has no external script-src)", async () => {
  const src = await read("app.js");
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
    assert.match(m[1], /^\.\/[\w.-]+\.js$/, `unexpected import ${m[1]}`);
  }
});

test("index.html loads theme.js + one module script and no inline code", async () => {
  const html = await read("index.html");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2, "theme.js + app.js");
  assert.match(scripts[0][1], /src="\/theme\.js"/);
  assert.match(scripts[1][1], /src="\/app\.js"/);
  assert.match(scripts[1][1], /type="module"/);
  for (const s of scripts) assert.equal(s[2].trim(), "", "no inline script body");
  assert.doesNotMatch(html, /<style\b/, "no inline style block");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "no inline event handlers");
  assert.doesNotMatch(html, /\sstyle="/, "no inline style attributes");
});

test("the shell has the pieces the chat UI needs", async () => {
  const html = await read("index.html");
  for (const id of [
    "sidebar",
    "btn-new-chat",
    "bot-list",
    "session-list",
    "messages",
    "input",
    "btn-send",
    "btn-stop",
    "model-picker",
    "btn-menu",
    "btn-theme",
    "scrim",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id} present`);
  }
});

test("markdown and highlight are pure modules (no DOM access)", async () => {
  for (const name of ["markdown.js", "highlight.js"]) {
    const src = await read(name);
    assert.doesNotMatch(src, /\bdocument\./, `${name} must stay DOM-free so it is testable`);
    assert.doesNotMatch(src, /\bwindow\./, `${name} must stay DOM-free`);
  }
});

test("signed-out UI shows a login screen instead of redirecting (no reload loop)", async () => {
  const src = await read("app.js");
  assert.doesNotMatch(src, /location\.href\s*=\s*["']\/auth\/login["']/);
  const html = await read("index.html");
  assert.match(html, /id="login-screen"/);
  assert.match(html, /href="\/auth\/login"/);
});

test("no native prompt/alert/confirm; the two flows use <dialog>", async () => {
  const src = await read("app.js");
  assert.doesNotMatch(src, /(^|[^.\w])(?:window\.)?(?:prompt|alert|confirm)\s*\(/m, "browser prompts are not allowed (DESIGN.md §0.11)");
  assert.match(src, /showModal\(\)/, "dialogs are opened with showModal()");
  assert.match(src, /function initDrawerSwipe\(\)/, "the drawer has an edge-swipe gesture");
  const html = await read("index.html");
  assert.match(html, /<dialog id="modal"/, "confirm dialog exists");
  assert.match(html, /<dialog id="bot-dialog"/, "new-bot dialog exists");
  assert.match(html, /id="bot-name"/, "the new-bot dialog has a real input");
  assert.match(html, /aria-labelledby="bot-dialog-title"/, "the dialog is labelled");
});

test("the two light token blocks in app.css stay identical", async () => {
  const css = await read("app.css");
  const grab = (re) => (css.match(re) || [])[1];
  const tokens = (block) => Object.fromEntries([...block.matchAll(/(--ds-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const explicit = grab(/(\[data-theme="light"\]\s*\{[\s\S]*?\n\})/);
  const media = grab(/(html:not\(\[data-theme\]\)\s*\{[\s\S]*?\n  \})/);
  assert.ok(explicit && media, "both light blocks exist");
  assert.deepEqual(tokens(media), tokens(explicit), "light tokens: [data-theme] and prefers-color-scheme must match");
});
