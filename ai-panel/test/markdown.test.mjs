// The markdown parser is the only thing standing between model output and the DOM, so it is
// tested against the shapes that matter: structure, and every way a link could be abused.

import test from "node:test";
import assert from "node:assert/strict";

import { parseMarkdown, parseInline, safeHref, inlineText } from "../public/markdown.js";

const types = (blocks) => blocks.map((b) => b.type);

test("headings, paragraphs and code fences", () => {
  const blocks = parseMarkdown("# Titel\n\nEin Absatz.\n\n```js\nconst a = 1;\n```");
  assert.deepEqual(types(blocks), ["h", "p", "code"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[2].lang, "js");
  assert.equal(blocks[2].text, "const a = 1;");
});

test("an unclosed fence still becomes a code block", () => {
  const blocks = parseMarkdown("```bash\nnpm test");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "code");
  assert.equal(blocks[0].text, "npm test");
});

test("fence content is never parsed as markdown", () => {
  const blocks = parseMarkdown("```\n# not a heading\n- not a list\n```");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "# not a heading\n- not a list");
});

test("lists keep their order and nesting level", () => {
  const blocks = parseMarkdown("- a\n- b\n  - b1\n\n1. x\n2. y");
  assert.equal(blocks[0].type, "list");
  assert.equal(blocks[0].ordered, false);
  assert.deepEqual(blocks[0].items.map((i) => i.level), [0, 0, 1]);
  assert.equal(blocks[1].ordered, true);
  assert.equal(blocks[1].items.length, 2);
});

test("blockquote, rule and table", () => {
  const blocks = parseMarkdown("> zitat\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.deepEqual(types(blocks), ["quote", "hr", "table"]);
  assert.equal(blocks[0].blocks[0].type, "p");
  assert.equal(blocks[2].head.length, 2);
  assert.equal(blocks[2].rows[0].length, 2);
});

test("inline emphasis, code and line breaks", () => {
  const toks = parseInline("**fett** *kursiv* `code` ~~weg~~\nzeile");
  assert.deepEqual(toks.map((t) => t.t), ["strong", "text", "em", "text", "code", "text", "del", "br", "text"]);
  assert.equal(inlineText(toks), "fett kursiv code weg\nzeile");
});

test("safe links survive, unsafe ones become plain text", () => {
  assert.equal(parseInline("[a](https://example.com/x)")[0].t, "link");
  assert.equal(parseInline("[a](https://example.com/x)")[0].href, "https://example.com/x");
  assert.equal(parseInline("[a](/local/path)")[0].t, "link");
  assert.equal(parseInline("[a](mailto:n@example.com)")[0].t, "link");

  for (const bad of [
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "[x](vbscript:msgbox)",
    "[x](//evil.example.com/x)",
    "[x](java\nscript:alert(1))",
  ]) {
    const toks = parseInline(bad);
    assert.ok(toks.every((t) => t.t !== "link"), `${bad} must not become a link`);
    assert.equal(inlineText(toks), bad.replace(/^\[x\]\(/, "[x]("), "the text is preserved verbatim");
  }
});

test("safeHref rejects control characters and unknown schemes", () => {
  assert.equal(safeHref("https://a.b"), "https://a.b");
  assert.equal(safeHref("http://a.b"), "http://a.b");
  assert.equal(safeHref("/rel"), "/rel");
  assert.equal(safeHref("//proto-relative"), null);
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("https://a.b/\u0000x"), null);
  assert.equal(safeHref(""), null);
});

test("raw HTML is text, never markup", () => {
  const toks = parseInline('<img src=x onerror="alert(1)"><script>bad()</script>');
  assert.ok(toks.every((t) => t.t === "text"));
  assert.match(inlineText(toks), /<img src=x onerror=/);
  const blocks = parseMarkdown("<div onclick=alert(1)>hi</div>");
  assert.equal(blocks[0].type, "p");
  assert.equal(inlineText(blocks[0].inl), "<div onclick=alert(1)>hi</div>");
});

test("every inline token type is one the renderer knows", () => {
  const known = new Set(["text", "code", "strong", "em", "del", "link", "br"]);
  const toks = parseInline("**a** *b* `c` ~~d~~ [e](https://f.g) <https://h.i> \\*escaped\\*");
  for (const t of toks) assert.ok(known.has(t.t), `unexpected token ${t.t}`);
});

test("empty and whitespace input produce no blocks", () => {
  assert.deepEqual(parseMarkdown(""), []);
  assert.deepEqual(parseMarkdown("   \n\n  "), []);
  assert.deepEqual(parseInline(""), []);
});
