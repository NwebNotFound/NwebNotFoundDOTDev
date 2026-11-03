#!/usr/bin/env node
// Unit-Tests für den Inhalts-Typ "writing": Front-Matter-Parser (inkl. Fehlerfälle), Validierung,
// draft/archived-Logik, Serien-Reihenfolge und Lesezeit (Phase 3a).
// Läuft allein (`node scripts/content-unit.mjs`) und wird von scripts/e2e.mjs importiert, damit die
// CI (die nur e2e ausführt) sie mitnimmt.
import assert from "node:assert/strict";
import {
  allTags,
  analyze,
  chaptersOf,
  countWords,
  excerpt,
  filterWriting,
  findWriting,
  isValidDate,
  normalizeItem,
  parseFrontMatter,
  prevNext,
  publishedWriting,
  readingTimeMinutes,
  toIndex,
} from "../src/content.js";
import { htmlToText } from "../src/markdown.js";

const doc = (fm, body = "Text.") => `---\n${fm}\n---\n\n${body}\n`;
const BLOG = "title: T\nslug: t\nkind: blog\ndate: 2026-11-03\nlang: de";
const problems = (fm) => normalizeItem(parseFrontMatter(doc(fm)).data).problems;
const valid = (fm) => {
  const r = normalizeItem(parseFrontMatter(doc(fm)).data);
  assert.deepEqual(r.problems, [], `expected a valid item for:\n${fm}\ngot: ${r.problems.join("; ")}`);
  return r.item;
};
const A = (file, fm, body) => ({ file, text: doc(fm, body) });
const E = (o) => ({
  file: `${o.slug}.md`,
  title: o.title || o.slug,
  slug: o.slug,
  kind: o.kind || "blog",
  date: o.date,
  updated: o.updated || null,
  tags: o.tags || [],
  draft: !!o.draft,
  archived: !!o.archived,
  lang: o.lang || "de",
  summary: o.summary || null,
  cover: null,
  series: o.series || null,
  chapter: o.chapter || null,
  seriesTitle: o.seriesTitle || null,
  wordCount: 1,
  readingMinutes: 1,
  body: o.body || "text",
});

/* ---- 1. front matter parser -------------------------------------------------------- */
{
  const p = parseFrontMatter(doc("title: Hallo\nslug: hallo\ntags:\n  - a\n  - b", "Body"));
  assert.deepEqual(p.data, { title: "Hallo", slug: "hallo", tags: ["a", "b"] }, "block list");
  assert.equal(p.body, "Body");
}
assert.deepEqual(parseFrontMatter(doc("tags: [a, b, c]")).data.tags, ["a", "b", "c"], "inline list");
assert.deepEqual(parseFrontMatter(doc("tags: []")).data.tags, [], "empty inline list");
assert.equal(parseFrontMatter(doc('title: "Hallo: Welt"')).data.title, "Hallo: Welt", "quoted value keeps its colon");
assert.equal(parseFrontMatter(doc("chapter: 3")).data.chapter, 3, "number");
assert.equal(parseFrontMatter(doc("draft: true")).data.draft, true, "boolean");
assert.equal(parseFrontMatter(doc("summary:")).data.summary, null, "bare key is null");
assert.equal(parseFrontMatter(doc("# comment\ntitle: x")).data.title, "x", "comments are skipped");
assert.equal(parseFrontMatter("---\r\ntitle: x\r\n---\r\n\r\nBody\r\n").body, "Body", "CRLF input");

assert.throws(() => parseFrontMatter("title: x\n---\n"), /must start with a '---' line/, "no opening fence");
assert.throws(() => parseFrontMatter("---\ntitle: x\n"), /not closed with a '---' line/, "no closing fence");
assert.throws(() => parseFrontMatter("---\nnot a pair\n---\n"), /is not "key: value"/, "malformed line");
assert.throws(() => parseFrontMatter("---\ntitle: a\ntitle: b\n---\n"), /duplicate front matter key "title"/, "duplicate key");

/* ---- 2. validation ---------------------------------------------------------------- */
assert.equal(valid(BLOG).slug, "t");
assert.equal(valid(`${BLOG}\nsummary: Kurz\nupdated: 2026-12-01\ntags: [a]`).updated, "2026-12-01");
assert.ok(problems("slug: t\nkind: blog\ndate: 2026-11-03\nlang: de").some((p) => p.includes("missing required field: title")));
assert.ok(problems("title: T\nkind: blog\ndate: 2026-11-03\nlang: de").some((p) => p.includes("missing required field: slug")));
assert.ok(problems("title: T\nslug: t\ndate: 2026-11-03\nlang: de").some((p) => p.includes("missing required field: kind")));
assert.ok(problems("title: T\nslug: t\nkind: blog\nlang: de").some((p) => p.includes("missing required field: date")));
assert.ok(problems("title: T\nslug: t\nkind: blog\ndate: 2026-11-03").some((p) => p.includes("missing required field: lang")));
assert.ok(problems("title: T\nslug: Bad Slug\nkind: blog\ndate: 2026-11-03\nlang: de").some((p) => p.includes('invalid slug "Bad Slug"')));
assert.ok(problems("title: T\nslug: t\nkind: post\ndate: 2026-11-03\nlang: de").some((p) => p.includes('invalid kind "post"')));
assert.ok(problems("title: T\nslug: t\nkind: blog\ndate: 2026-02-30\nlang: de").some((p) => p.includes("invalid date")));
assert.ok(problems("title: T\nslug: t\nkind: blog\ndate: 03.11.2026\nlang: de").some((p) => p.includes("invalid date")));
assert.ok(problems("title: T\nslug: t\nkind: blog\ndate: 2026-11-03\nlang: fr").some((p) => p.includes('invalid lang "fr"')));
assert.ok(problems(`${BLOG}\nupdated: 2026-10-01`).some((p) => p.includes("is before date")));
assert.ok(problems(`${BLOG}\nupdated: kaputt`).some((p) => p.includes("invalid updated date")));
assert.ok(problems(`${BLOG}\ntags: x`).some((p) => p.includes("tags must be a list")));
assert.ok(problems(`${BLOG}\ntags:\n  - a\n  - ""`).some((p) => p.includes("tags must not contain empty entries")));
assert.ok(problems(`${BLOG}\ncover: https://example.org/x.png`).some((p) => p.includes("cover must be a path under /content-assets/")));
assert.equal(valid(`${BLOG}\ncover: /content-assets/x.png`).cover, "/content-assets/x.png");
assert.ok(problems(`${BLOG}\ndraft: ja`).some((p) => p.includes("draft must be true or false")));
assert.ok(problems(`${BLOG}\nseries: s`).some((p) => p.includes("kind=blog must not set series")));

const STORY = "title: S\nslug: s\nkind: story\ndate: 2026-11-03\nlang: de\nseries: sommer\nchapter: 1";
assert.equal(valid(STORY).chapter, 1);
assert.equal(valid(`${STORY}\nseries_title: Sommer`).seriesTitle, "Sommer");
assert.ok(problems("title: S\nslug: s\nkind: story\ndate: 2026-11-03\nlang: de\nchapter: 1").some((p) => p.includes("requires a series")), "chapter without series");
assert.ok(problems("title: S\nslug: s\nkind: story\ndate: 2026-11-03\nlang: de\nseries: sommer").some((p) => p.includes("requires a chapter number")));
assert.ok(problems("title: S\nslug: s\nkind: story\ndate: 2026-11-03\nlang: de\nseries: sommer\nchapter: 0").some((p) => p.includes("positive whole number")));
assert.ok(problems("title: S\nslug: s\nkind: story\ndate: 2026-11-03\nlang: de\nseries: sommer\nchapter: 1.5").some((p) => p.includes("positive whole number")));
assert.ok(problems("title: S\nslug: s\nkind: story\ndate: 2026-11-03\nlang: de\nseries: 'Bad Serie'\nchapter: 1").some((p) => p.includes("invalid series slug")));

/* ---- 3. cross-file validation ------------------------------------------------------ */
{
  const { entries, errors } = analyze([A("a.md", "title: A\nslug: dup\nkind: blog\ndate: 2026-01-01\nlang: de"), A("b.md", "title: B\nslug: dup\nkind: blog\ndate: 2026-01-02\nlang: de")]);
  assert.equal(entries.length, 2);
  assert.ok(errors.some((e) => e.startsWith("b.md:") && e.includes('duplicate slug "dup"')), JSON.stringify(errors));
}
{
  const { errors } = analyze([
    A("c1.md", "title: C1\nslug: c1\nkind: story\nseries: s\nchapter: 1\ndate: 2026-01-01\nlang: de"),
    A("c2.md", "title: C2\nslug: c2\nkind: story\nseries: s\nchapter: 1\ndate: 2026-01-02\nlang: de"),
  ]);
  assert.ok(errors.some((e) => e.includes('duplicate chapter 1 in series "s"')), JSON.stringify(errors));
}
{
  const { errors } = analyze([
    A("c1.md", "title: C1\nslug: c1\nkind: story\nseries: s1\nchapter: 1\ndate: 2026-01-01\nlang: de"),
    A("c2.md", "title: C2\nslug: c2\nkind: story\nseries: s2\nchapter: 1\ndate: 2026-01-02\nlang: de"),
  ]);
  assert.deepEqual(errors, [], "the same chapter number in two different series is fine");
}
{
  const { entries, errors } = analyze([A("bad.md", "title: T\nslug: t\nkind: blog\ndate: 2026-13-01\nlang: de")]);
  assert.equal(entries.length, 0, "a file with problems is dropped");
  assert.ok(errors[0].startsWith("bad.md:"), JSON.stringify(errors));
}

/* ---- 4. index: drafts out, newest first, series ordered ---------------------------- */
{
  const entries = [
    E({ slug: "draft", date: "2026-01-03", draft: true }),
    E({ slug: "arch", date: "2026-01-02", archived: true }),
    E({ slug: "pub", date: "2026-01-01" }),
    E({ slug: "ch1", kind: "story", series: "s", seriesTitle: "Serie", chapter: 1, date: "2026-01-01" }),
    E({ slug: "ch2", kind: "story", series: "s", chapter: 2, date: "2026-01-02" }),
  ];
  const { writing, series } = toIndex(entries, (md) => `<p>${md}</p>`);
  assert.deepEqual(writing.map((w) => w.slug), ["arch", "ch2", "ch1", "pub"], "newest first, drafts gone");
  assert.ok(!writing.some((w) => w.slug === "draft"), "a draft never reaches the bundle");
  assert.equal(writing.find((w) => w.slug === "arch").archived, true);
  assert.equal(writing.find((w) => w.slug === "pub").html, "<p>text</p>");
  assert.deepEqual(series, [{ slug: "s", title: "Serie", chapters: ["ch1", "ch2"], count: 2 }]);
  assert.equal(findWriting(writing, "draft"), null, "a draft is not reachable");
  assert.equal(findWriting(writing, "arch").slug, "arch", "an archived post stays reachable");
  assert.equal(findWriting(writing, "nope"), null);
}

/* ---- 5. helpers -------------------------------------------------------------------- */
assert.ok(isValidDate("2026-11-03") && isValidDate("2024-02-29"));
assert.ok(!isValidDate("2026-02-30") && !isValidDate("2026-13-01") && !isValidDate("2026-11-3") && !isValidDate(2026) && !isValidDate(null));
assert.equal(countWords("eins zwei drei"), 3);
assert.equal(readingTimeMinutes(""), 1, "an empty text still counts as one minute");
assert.equal(readingTimeMinutes(Array.from({ length: 200 }, () => "wort").join(" ")), 1);
assert.equal(readingTimeMinutes(Array.from({ length: 201 }, () => "wort").join(" ")), 2);

{
  const list = [E({ slug: "a", date: "2026-01-01", tags: ["b", "a"] }), E({ slug: "b", date: "2026-01-02", archived: true, tags: ["B"] }), E({ slug: "s", kind: "story", series: "s", chapter: 1, date: "2026-01-03" })];
  assert.deepEqual(publishedWriting(list).map((w) => w.slug), ["a", "s"], "archived is not in the public list");
  assert.deepEqual(allTags(list), ["a", "b"], "tags are de-duplicated case-insensitively");
  assert.deepEqual(filterWriting(list, { kind: "story" }).map((w) => w.slug), ["s"]);
  assert.deepEqual(filterWriting(list, { tag: "b" }).map((w) => w.slug), ["a"]);
  assert.deepEqual(filterWriting(list, { tag: "B" }).map((w) => w.slug), ["b"]);
  assert.deepEqual(filterWriting(list, { kind: "story", tag: "b" }), []);
  assert.deepEqual(chaptersOf([E({ slug: "c3", kind: "story", series: "x", chapter: 3 }), E({ slug: "c1", kind: "story", series: "x", chapter: 1 })], "x").map((c) => c.slug), ["c1", "c3"]);
  const chapters = [E({ slug: "c1", kind: "story", series: "x", chapter: 1 }), E({ slug: "c2", kind: "story", series: "x", chapter: 2 }), E({ slug: "c3", kind: "story", series: "x", chapter: 3, archived: true })];
  assert.deepEqual(prevNext(chapters, chapters[1]), { prev: chapters[0], next: chapters[2] }, "archived chapters still link");
  assert.deepEqual(prevNext(chapters, chapters[0]).prev, null);
  assert.deepEqual(prevNext(chapters, chapters[2]).next, null);
  assert.deepEqual(prevNext([E({ slug: "b", kind: "blog" })], { slug: "b", kind: "blog" }), { prev: null, next: null }, "a blog post has no chapter navigation");
}

assert.equal(excerpt({ summary: "Kurz", html: "<p>lang</p>" }, htmlToText), "Kurz");
assert.equal(excerpt({ summary: null, html: "<p>Hello world</p>" }, htmlToText), "Hello world");
assert.ok(excerpt({ summary: null, html: `<p>${"wort ".repeat(100)}</p>` }, htmlToText).endsWith("\u2026"), "a long body is truncated with an ellipsis");

console.log("content-unit ok");
