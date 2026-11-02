// The highlighter must be lossless: the tokens it returns, concatenated, have to equal the
// input byte for byte. Otherwise a code block would silently drop characters.

import test from "node:test";
import assert from "node:assert/strict";

import { highlight, normalizeLang, langFromPath } from "../public/highlight.js";

const SAMPLES = {
  js: 'const a = `x${1}`; // hi\nfunction f(b) { return "s" + 2; }',
  json: '{"a": 1, "b": [true, null]}',
  python: 'def f(x):\n    """doc"""\n    return "s"  # c',
  bash: 'npm run build && echo "$HOME" # done',
  html: '<div class="a" data-x=\'1\'>x</div><!-- c -->',
  css: '.a { color: #fff; margin: 0 auto; }',
  sql: "SELECT * FROM t WHERE a = 1 -- c",
  yaml: "key: value # comment\nlist:\n  - a",
  diff: "+added\n-removed\n context\n@@ -1 +1 @@",
  text: "just words",
};

test("token concatenation reproduces the input exactly", () => {
  for (const [lang, code] of Object.entries(SAMPLES)) {
    const joined = highlight(code, lang).map((t) => t.v).join("");
    assert.equal(joined, code, `${lang} round-trip`);
  }
});

test("empty input yields no tokens", () => {
  assert.deepEqual(highlight("", "js"), []);
});

test("known languages produce more than one token", () => {
  for (const lang of ["js", "python", "bash", "html", "css", "sql", "yaml"]) {
    assert.ok(highlight(SAMPLES[lang], lang).length > 1, `${lang} tokenised`);
  }
});

test("only renderer-known token types are emitted", () => {
  const known = new Set(["text", "kw", "str", "num", "com", "fn", "type", "var", "meta", "tag", "attr", "sel", "add", "del"]);
  for (const [lang, code] of Object.entries(SAMPLES)) {
    for (const tok of highlight(code, lang)) assert.ok(known.has(tok.t), `${lang}: ${tok.t}`);
  }
});

test("diff lines are classified", () => {
  const toks = highlight("+a\n-b\n c", "diff");
  assert.equal(toks[0].t, "add");
  assert.equal(toks[2].t, "del");
  assert.equal(toks[4].t, "text");
});

test("language aliases and unknown languages", () => {
  assert.equal(normalizeLang("JavaScript"), "js");
  assert.equal(normalizeLang("TS"), "js");
  assert.equal(normalizeLang("py"), "python");
  assert.equal(normalizeLang("sh"), "bash");
  assert.equal(normalizeLang("yml"), "yaml");
  assert.equal(normalizeLang("brainfuck"), "text");
  assert.equal(normalizeLang(""), "text");
  assert.deepEqual(highlight("x", "brainfuck"), [{ t: "text", v: "x" }]);
});

test("langFromPath maps extensions", () => {
  assert.equal(langFromPath("src/index.js"), "js");
  assert.equal(langFromPath("a/b.py"), "python");
  assert.equal(langFromPath("Dockerfile"), "text");
});
