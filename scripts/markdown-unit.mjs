#!/usr/bin/env node
// Markdown-Renderer-Tests (Phase 3a, docs/creative-hub-plan.md §4.1/§8 "Writing").
// Läuft allein (`node scripts/markdown-unit.mjs`) und wird von scripts/e2e.mjs importiert, damit die
// CI (die nur e2e ausführt) sie mitnimmt. Kein process.exit: ein Fehler soll den Import scheitern
// lassen, nicht den Testlauf beenden.
import assert from "node:assert/strict";
import { escapeHtml, htmlToText, renderInline, renderMarkdown as md, IMAGE_HOST_ALLOWLIST } from "../src/markdown.js";

/* ---- headings (h1 is the page title, so `#` maps to h2; levels clamp to h2…h4) ---- */
assert.equal(md("## Hallo"), "<h2>Hallo</h2>");
assert.equal(md("# Eins"), "<h2>Eins</h2>");
assert.equal(md("### Drei"), "<h3>Drei</h3>");
assert.equal(md("###### Sechs"), "<h4>Sechs</h4>");
assert.equal(md("####### Sieben"), "<p>####### Sieben</p>", "seven hashes is a paragraph");
assert.equal(md("## Hallo ##"), "<h2>Hallo</h2>", "closing hashes are dropped");

/* ---- paragraphs, soft breaks, rules ---- */
assert.equal(md("a\nb"), "<p>a b</p>");
assert.equal(md("---"), "<hr>");
assert.equal(md("***"), "<hr>");
assert.equal(md("___"), "<hr>");
assert.equal(md("A\n\nB"), "<p>A</p>\n<p>B</p>");

/* ---- blockquote and code ---- */
assert.equal(md("> hi"), "<blockquote><p>hi</p></blockquote>");
assert.equal(md("```js\nconst a = 1;\n```"), '<pre><code class="language-js">const a = 1;</code></pre>');
assert.equal(md("```\n<script>\n```"), "<pre><code>&lt;script&gt;</code></pre>", "code block content is escaped");
assert.equal(md("```\n<script>"), "<pre><code>&lt;script&gt;</code></pre>", "unclosed fence still renders");

/* ---- lists ---- */
assert.equal(md("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
assert.equal(md("* a\n+ b"), "<ul><li>a</li><li>b</li></ul>");
assert.equal(md("- a\n  - b"), "<ul><li>a<ul><li>b</li></ul></li></ul>", "nested list");
assert.equal(md("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
assert.equal(md("3. c"), '<ol start="3"><li>c</li></ol>');
assert.equal(md("- a\n\nb"), "<ul><li>a</li></ul>\n<p>b</p>", "a blank line ends the list");

/* ---- inline ---- */
assert.equal(md("`x`"), "<p><code>x</code></p>");
assert.equal(md("`*x*`"), "<p><code>*x*</code></p>", "inline code is not re-parsed");
assert.equal(renderInline("`<b>`"), "<code>&lt;b&gt;</code>");
assert.equal(md("**b**"), "<p><strong>b</strong></p>");
assert.equal(md("__b__"), "<p><strong>b</strong></p>");
assert.equal(md("*i*"), "<p><em>i</em></p>");
assert.equal(md("_i_"), "<p><em>i</em></p>");
assert.equal(md("a_b_c"), "<p>a_b_c</p>", "intra-word underscores stay literal");
assert.equal(md('"hi"'), "<p>&quot;hi&quot;</p>", "quotes are escaped, never smart-quoted");
assert.ok(!md('"hi"').includes("\u201c") && !md("'hi'").includes("\u2018"), "no smart quotes are introduced");

/* ---- links ---- */
assert.equal(md("[x](https://example.org/)"), '<p><a href="https://example.org/" target="_blank" rel="noopener noreferrer">x</a></p>');
assert.equal(md("[x](mailto:a@b.c)"), '<p><a href="mailto:a@b.c">x</a></p>');
assert.equal(md("[x](/de/writing)"), '<p><a href="/de/writing">x</a></p>');
assert.equal(md("[x](#anker)"), '<p><a href="#anker">x</a></p>');
assert.equal(md('[x](https://example.org/ "Titel")'), '<p><a href="https://example.org/" title="Titel" target="_blank" rel="noopener noreferrer">x</a></p>');

/* ---- XSS cases: raw HTML escaped, dangerous schemes removed ---- */
assert.equal(md("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
assert.ok(!md("<script>alert(1)</script>").includes("<script"));
assert.ok(md("<img src=x onerror=alert(1)>").includes("&lt;img"));
assert.ok(!md("<img src=x onerror=alert(1)>").includes("<img"), "raw <img> is never emitted");
assert.ok(md('<a href="javascript:void(0)" onclick="alert(2)"><b>t</b></a>').includes("&lt;a href=&quot;javascript:void(0)&quot;"));
assert.ok(!/<a\s[^>]*onclick/.test(md('<a href="javascript:void(0)" onclick="alert(2)"><b>t</b></a>')), "no live handler");
assert.equal(md("[x](javascript:alert(1))"), "<p>x</p>", "javascript: link removed");
assert.equal(md("[x](data:text/html,1)"), "<p>x</p>", "data: link removed");
assert.equal(md("[x](//evil.example/)"), "<p>x</p>", "protocol-relative link removed");
assert.equal(md("[x](JAVASCRIPT:alert(1))"), "<p>x</p>", "scheme check is case-insensitive");
assert.ok(!md("[x](vbscript:msgbox(1))").includes("vbscript:"), "unknown scheme removed");
for (const bad of ["<script>", "</script>", "<iframe", "<svg", "<object", "onmouseover=", "javascript:", "data:text/html"]) {
  const out = md(`Text ${bad} mehr`);
  const tags = [...out.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase());
  const allowed = new Set(["p", "em", "strong", "code", "a", "img", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre", "hr"]);
  assert.ok(tags.every((t) => allowed.has(t)), `only our own tags are emitted (${bad} → ${tags.join(",")})`);
  assert.ok(!/<\w[^>]*\son[a-z]+\s*=/i.test(out), `no event attribute on a live tag (${bad})`);
}

/* ---- images ---- */
assert.deepEqual(IMAGE_HOST_ALLOWLIST, [], "phase 3a allows no remote image host");
assert.equal(md("![alt](/content-assets/a.png)"), '<p><img src="/content-assets/a.png" alt="alt" loading="lazy" decoding="async"></p>');
assert.equal(md('![alt](/content-assets/a.png "T")'), '<p><img src="/content-assets/a.png" alt="alt" title="T" loading="lazy" decoding="async"></p>');
assert.ok(!md("![a](https://evil.example/x.png)").includes("<img"), "remote image dropped");
assert.ok(!md("![a](//evil.example/x.png)").includes("<img"), "protocol-relative image dropped");
assert.ok(!md("![a](javascript:alert(1))").includes("<img"), "javascript: image dropped");
assert.ok(!md("![a](data:image/png;base64,AAAA)").includes("<img"), "data: image dropped");
assert.ok(!md("![a](/content-assets/../../etc/passwd)").includes("<img"), "path traversal dropped");
assert.ok(!md("![a](/etc/passwd)").includes("<img"), "non content-assets path dropped");
assert.ok(!/<img[^>]*\son[a-z]+\s*=/i.test(md('![a](/content-assets/x.png" onerror="alert(1))')), "attribute break-out impossible");

/* ---- unicode tricks and very long input never break out ---- */
{
  const u = md("Zeile A\u2028Zeile B\u202eRTL");
  assert.ok(u.includes("\u2028") && u.includes("\u202e"), "unicode separators survive as text");
  assert.ok(!/<script/i.test(u));
}
{
  const long = "x".repeat(20000);
  const out = md(long);
  assert.ok(out.startsWith("<p>x") && out.endsWith("</p>"), "a 20k-character line renders as one paragraph");
  assert.ok(out.length >= 20000);
}
assert.equal(md("\u0000null\u0000"), "<p>\u0000null\u0000</p>", "NUL characters do not confuse the renderer");

/* ---- helpers ---- */
assert.equal(escapeHtml("<&\"'>"), "&lt;&amp;&quot;&#39;&gt;");
assert.equal(htmlToText("<p>a &amp; b</p><h2>c</h2>"), "a & b c");

console.log("markdown-unit ok");
