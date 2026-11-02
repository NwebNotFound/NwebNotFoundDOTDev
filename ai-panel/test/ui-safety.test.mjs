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

test("index.html loads one module script and no inline code", async () => {
  const html = await read("index.html");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, "exactly one script tag");
  assert.match(scripts[0][1], /src="\/app\.js"/);
  assert.match(scripts[0][1], /type="module"/);
  assert.equal(scripts[0][2].trim(), "", "no inline script body");
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
