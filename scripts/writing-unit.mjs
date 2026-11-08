#!/usr/bin/env node
// Unit tests for Texte & Kapitel from D1 (src/writing.js, migration 0021): rows -> the built index's item shape,
// language per field, drafts never, archived reachable, the fallback while D1 has nothing published, validation.
// Runs alone (`node scripts/writing-unit.mjs`) and is imported by scripts/e2e.mjs.
import assert from "node:assert/strict";
import { toItems, writingIndex, writingFeeds, purgeWriting } from "../src/writing.js";
import { cleanWriting, cleanSeries } from "../src/admin.js";
import { chaptersOf, publishedWriting, findWriting } from "../src/content.js";

const series = [{ id: 1, slug: "sommer", title_de: "Sommerfunken", title_en: "Summer sparks", status: "live" }];
const at = Date.parse("2026-09-01T10:00:00Z");
const rows = [
  { id: 1, series_id: 1, kind: "story", chapter: 1, slug: "sommer-1", title_de: "Eins", title_en: "One", body_de: "**Hallo** <script>x</script>", body_en: null, tags: '["a"]', status: "live", published_at: at, updated_at: at },
  { id: 2, series_id: 1, kind: "story", chapter: 2, slug: "sommer-2", title_de: "Zwei", title_en: null, body_de: "zwei", body_en: "two", tags: "[]", status: "archived", published_at: at + 864e5, updated_at: at + 3 * 864e5 },
  { id: 3, series_id: 1, kind: "story", chapter: 3, slug: "sommer-3", title_de: "Drei", body_de: "x", tags: "[]", status: "draft", published_at: null, updated_at: at },
  { id: 4, series_id: null, kind: "short", chapter: null, slug: "kurz", title_de: "Kurz", body_de: "k", tags: "x", status: "live", published_at: at, updated_at: at },
];
const de = toItems(series, rows, "de"), en = toItems(series, rows, "en");
assert.deepEqual(de.map((x) => x.slug).sort(), ["kurz", "sommer-1", "sommer-2"], "drafts never");
const one = de.find((x) => x.slug === "sommer-1");
assert.equal(one.kind, "story"); assert.equal(one.series, "sommer"); assert.equal(one.seriesTitle, "Sommerfunken"); assert.equal(one.date, "2026-09-01");
assert.ok(one.html.includes("<strong>Hallo</strong>") && !one.html.includes("<script>"), "rendered, sanitised");
assert.deepEqual(one.tags, ["a"]); assert.equal(one.d1, true); assert.equal(one.updated, null);
const two = de.find((x) => x.slug === "sommer-2");
assert.equal(two.archived, true); assert.equal(two.updated, "2026-09-04", "edited later -> updated");
assert.equal(de.find((x) => x.slug === "kurz").kind, "blog", "a short text is the old kind blog"); assert.deepEqual(de.find((x) => x.slug === "kurz").tags, [], "broken tags -> []");
const oneEn = en.find((x) => x.slug === "sommer-1"), twoEn = en.find((x) => x.slug === "sommer-2");
assert.equal(oneEn.title, "One"); assert.equal(oneEn.lang, "de", "no EN body: still the German text"); assert.equal(oneEn.seriesTitle, "Summer sparks");
assert.equal(twoEn.title, "Zwei"); assert.equal(twoEn.lang, "en"); assert.ok(twoEn.html.includes("two"));
// the old query helpers work on it unchanged
assert.deepEqual(chaptersOf(de, "sommer").map((c) => c.chapter), [1, 2]);
assert.deepEqual(publishedWriting(de).map((x) => x.slug).sort(), ["kurz", "sommer-1"], "archived off the lists");
assert.ok(findWriting(de, "sommer-2"), "archived reachable"); assert.equal(findWriting(de, "sommer-3"), null);

// a draft series hides its chapters (window, links, feeds, progress); short texts are not affected
const hidden = toItems([{ ...series[0], status: "draft" }], rows, "de");
assert.deepEqual(hidden.map((x) => x.slug), ["kurz"], "draft series: no chapter anywhere");
// html is rendered on first use only (lists need titles), and only once
let renders = 0; const big = toItems(series, [{ ...rows[0], body_de: "x" }], "de")[0];
assert.ok(!Object.getOwnPropertyDescriptor(big, "html").value && typeof Object.getOwnPropertyDescriptor(big, "html").get === "function", "html is a lazy getter");
assert.equal(big.html, big.html); void renders;

// fallback while nothing is published; D1 errors fall back too
const fb = [{ slug: "built" }];
const envOf = (items) => ({ DB: { prepare: (sql) => ({ sql }), batch: async () => [{ results: series }, { results: items }] } });
purgeWriting(true); assert.equal(await writingIndex(envOf([]), "de", fb, 1), fb);
purgeWriting(); assert.equal((await writingIndex(envOf(rows.filter((r) => r.status === "live")), "de", fb, 1)).length, 2);
purgeWriting(true);   // before 0021 there is no last good state: assert.equal(await writingIndex({ DB: { prepare: () => ({}), batch: async () => { throw new Error("no such table: writing_items"); } } }, "en", fb, 1), fb);
// after a good read, a failing D1 serves the last good state (not the built fallback), and retries after 5 s
const flaky = { ok: true, DB: { prepare: (sql) => ({ sql }), batch: async () => { if (!flaky.ok) throw new Error("D1 overloaded"); return [{ results: series }, { results: rows.filter((r) => r.status === "live") }]; } } };
purgeWriting(); assert.equal((await writingIndex(flaky, "de", fb, 1000)).length, 2);
flaky.ok = false; purgeWriting();
const during = await writingIndex(flaky, "de", fb, 2000);
assert.equal(during.length, 2, "transient D1 error: last good texts, not the built (empty) index");
flaky.ok = true;
assert.equal(await writingIndex(flaky, "de", fb, 2000 + 4000), during, "failure is cached briefly");
assert.notEqual(await writingIndex(flaky, "de", fb, 2000 + 5000), during, "and retried after 5 s");
const FB = [{ path: "/writing/feed.xml", xml: "built" }];
purgeWriting(true); assert.equal(await writingFeeds(envOf([]), FB, 1), FB);
purgeWriting(); const feeds = await writingFeeds(envOf(rows.filter((r) => r.status === "live")), FB, 1);
assert.ok(feeds.find((f) => f.path === "/writing/feed.xml").xml.includes("Eins"), "feeds built from D1");
purgeWriting();

// validation
assert.ok(cleanWriting({ series_id: 1, chapter: 2, slug: "a-b", title_de: "T", body_de: "x" }).val);
assert.deepEqual(cleanWriting({ series_id: 1, chapter: 0, slug: "A B", title_de: "" }).err.sort(), ["chapter", "slug", "title_de"]);
assert.equal(cleanWriting({ kind: "short", slug: "k", title_de: "K", tags: ["x", " x "] }).val.tags, '["x"]');
assert.deepEqual(cleanWriting({ kind: "story", slug: "k", title_de: "K" }).err.sort(), ["chapter", "series_id"], "a chapter needs its series and number");
assert.ok(cleanSeries({ slug: "s", title_de: "S" }).val); assert.deepEqual(cleanSeries({ slug: "", title_de: "S" }).err, ["slug"]);
console.log("writing-unit ok");
