#!/usr/bin/env node
// Unit-Tests für die Feeds (Phase 3b, docs/creative-hub-plan.md §8 "Feeds"): Wohlgeformtheit,
// XML-Escapes und CDATA, Datumsformate, stabile GUIDs, draft/archived-Ausschluss, Auszug-Länge,
// Determinismus, ETag/304-Vergleich und Routen-Auflösung.
// Läuft allein (`node scripts/feed-unit.mjs`) und wird von scripts/e2e.mjs importiert, damit die CI
// (die nur e2e ausführt) sie mitnimmt.
import assert from "node:assert/strict";
import { analyze, toIndex } from "../src/content.js";
import { renderMarkdown } from "../src/markdown.js";
import {
  buildFeeds,
  cdata,
  feedEtag,
  feedFor,
  feedItems,
  feedLang,
  feedPaths,
  itemHtml,
  itemSummary,
  matchesEtag,
  permalinkOf,
  renderFeed,
  rfc822,
  rfc3339,
  xmlEscape,
} from "../src/feed.js";
import { makeT } from "../src/i18n/index.js";
import { checkWellFormed } from "./xml-check.mjs";

const SITE = "nwebnotfound.dev";
const feedsOf = (writing, series = []) => buildFeeds({ writing, series, site: SITE, t: makeT });
const feedAt = (feeds, path) => {
  const feed = feedFor(feeds, path);
  assert.ok(feed, `no feed at ${path} (have: ${feeds.map((f) => f.path).join(", ")})`);
  return feed;
};

const mk = (o) => ({
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
  seriesTitle: o.seriesTitle || null,
  chapter: o.chapter || null,
  wordCount: 1,
  readingMinutes: 1,
  body: o.body || "text",
  html: o.html || `<p>${o.body || "text"}</p>`,
});

/* ---- 1. the checker itself (a test that cannot fail is worth nothing) --------------------------- */
assert.deepEqual(checkWellFormed("<a><b/></a>"), { ok: true, errors: [] });
assert.deepEqual(checkWellFormed('<?xml version="1.0"?>\n<rss><item><![CDATA[<p>a &amp; b c</p>]]></item></rss>').ok, true, "CDATA is not markup");
assert.equal(checkWellFormed("<a><b></a></b>").ok, false, "mismatched tags are caught");
assert.equal(checkWellFormed("<a>x & y</a>").ok, false, "a bare ampersand is caught");
assert.equal(checkWellFormed("<a>]]></a>").ok, false, "a stray ]]> is caught");
assert.equal(checkWellFormed('<a x=1></a>').ok, false, "an unquoted attribute is caught");
assert.equal(checkWellFormed("<a/><b/>").ok, false, "two root elements are caught");
assert.equal(checkWellFormed("<a>").ok, false, "an unclosed element is caught");
assert.equal(checkWellFormed("<a><!-- x --></a>").ok, true, "comments are allowed");

/* ---- 2. escaping and CDATA --------------------------------------------------------------------- */
assert.equal(xmlEscape(`A & B <c> "d" 'e'`), "A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;");
assert.equal(xmlEscape("a ]]> b"), "a ]]&gt; b", "]]> is escaped in text, so it can never end a section");
assert.equal(cdata("plain"), "<![CDATA[plain]]>");
assert.equal(cdata("a ]]> b"), "<![CDATA[a ]]]]><![CDATA[> b]]>", "]]> inside CDATA is split");

/* ---- 3. dates ---------------------------------------------------------------------------------- */
assert.equal(rfc822("2026-11-03"), "Tue, 03 Nov 2026 00:00:00 GMT");
assert.equal(rfc822("2024-02-29"), "Thu, 29 Feb 2024 00:00:00 GMT", "leap day");
assert.equal(rfc822("2026-02-30"), null, "a day that does not exist has no RFC 822 form");
assert.equal(rfc822(""), null);
assert.equal(rfc3339("2026-11-03"), "2026-11-03T00:00:00Z");
assert.equal(rfc3339("2026-13-01"), null);

/* ---- 4. selection: drafts out, archived out, newest first, capped ------------------------------ */
{
  const writing = [
    mk({ slug: "draft", date: "2026-11-09", draft: true }),
    mk({ slug: "archived", date: "2026-11-08", archived: true }),
    mk({ slug: "blog-de", date: "2026-11-07", tags: ["kaffee"] }),
    mk({ slug: "blog-en", date: "2026-11-06", lang: "en" }),
    mk({ slug: "chapter-1", kind: "story", series: "serie", seriesTitle: "Die Serie", chapter: 1, date: "2026-11-05" }),
    mk({ slug: "chapter-2", kind: "story", series: "serie", chapter: 2, date: "2026-11-04" }),
  ];
  assert.deepEqual(feedItems(writing).map((w) => w.slug), ["blog-de", "blog-en", "chapter-1", "chapter-2"], "drafts and archived never enter a feed");
  assert.deepEqual(feedItems(writing, { type: "kind", kind: "story" }).map((w) => w.slug), ["chapter-1", "chapter-2"]);
  assert.deepEqual(feedItems(writing, { type: "series", series: "serie" }).map((w) => w.slug), ["chapter-1", "chapter-2"]);
  assert.equal(feedLang(writing), "de", "the majority language wins (3 de, 1 en)");
  assert.equal(feedLang([mk({ slug: "a", lang: "en", date: "2026-01-02" }), mk({ slug: "b", lang: "de", date: "2026-01-01" })]), "en", "a tie goes to the newest entry");
  assert.equal(feedLang([]), "de", "an empty feed falls back to German");
  const many = Array.from({ length: 35 }, (_, i) => mk({ slug: `p${String(i).padStart(2, "0")}`, date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
  assert.equal(feedItems(many).length, 30, "at most 30 entries");
}

/* ---- 5. the feeds of an index ------------------------------------------------------------------ */
{
  const writing = [
    mk({ slug: "draft", date: "2026-11-09", draft: true, title: "DRAFT TITLE" }),
    mk({ slug: "archived", date: "2026-11-08", archived: true, title: "ARCHIVED TITLE" }),
    mk({ slug: "blog-one", date: "2026-11-07", tags: ["kaffee", "test"], title: `Kaffee & Kuchen <toll> "x"`, html: "<p>Volltext mit ]]> und &amp; Zeichen.</p>" }),
    mk({ slug: "blog-two", date: "2026-11-06", lang: "en", title: "English post" }),
    mk({ slug: "blog-three", date: "2026-11-05", lang: "en", title: "Second English post" }),
    mk({ slug: "chapter-1", kind: "story", series: "serie", seriesTitle: "Die Serie", chapter: 1, date: "2026-11-04", summary: "Kapitel eins kurz." }),
    mk({ slug: "chapter-2", kind: "story", series: "serie", chapter: 2, date: "2026-11-03", body: "wort ".repeat(120) }),
  ];
  const series = [{ slug: "serie", title: "Die Serie", chapters: ["chapter-1", "chapter-2"], count: 2 }];
  const feeds = feedsOf(writing, series);

  assert.deepEqual(
    feeds.map((f) => f.path),
    [
      "/writing/atom.xml",
      "/writing/blog/atom.xml",
      "/writing/blog/feed.xml",
      "/writing/feed.xml",
      "/writing/series/serie/atom.xml",
      "/writing/series/serie/feed.xml",
      "/writing/stories/atom.xml",
      "/writing/stories/feed.xml",
    ],
    "every scope has an RSS and an Atom feed (sorted by path)",
  );
  assert.ok(feeds.every((f) => f.path.startsWith("/writing/")), "writing is the only section with feeds");

  for (const feed of feeds) {
    const check = checkWellFormed(feed.xml);
    assert.deepEqual(check.errors, [], `${feed.path} is well-formed`);
    assert.ok(feed.xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'), `${feed.path} starts with the XML declaration`);
    assert.equal(feed.count > 0, true, `${feed.path} has entries`);
    assert.ok(feed.etag.startsWith('"') && feed.etag.endsWith('"'), `${feed.path} has a quoted ETag`);
    assert.ok(feed.lastModified, `${feed.path} has a Last-Modified from the newest entry`);
    assert.ok(!feed.xml.includes("DRAFT TITLE") && !feed.xml.includes("ARCHIVED TITLE"), `${feed.path} contains no draft and no archived item`);
  }

  const all = feedAt(feeds, "/writing/feed.xml");
  assert.equal(all.format, "rss");
  assert.equal(all.lang, "de", "3 German entries against 2 English ones");
  assert.equal(all.count, 5);
  assert.ok(all.xml.includes('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">'), "RSS 2.0 with the Atom self-link namespace");
  assert.ok(all.xml.includes('<atom:link href="https://nwebnotfound.dev/writing/feed.xml" rel="self" type="application/rss+xml"/>'), "RSS carries its own URL");
  assert.ok(all.xml.includes("<language>de</language>"), "RSS carries the content language");
  assert.equal(all.lastModified, "Sat, 07 Nov 2026 00:00:00 GMT", "Last-Modified comes from the newest entry, not from the clock");
  assert.ok(all.xml.includes("<lastBuildDate>Sat, 07 Nov 2026 00:00:00 GMT</lastBuildDate>"), "lastBuildDate comes from the newest entry");

  // stable GUIDs: the permalink at the language the text was written in
  assert.ok(all.xml.includes('<guid isPermaLink="true">https://nwebnotfound.dev/de/writing/blog-one</guid>'), "the GUID is the permalink");
  assert.ok(all.xml.includes('<link>https://nwebnotfound.dev/en/writing/blog-two</link>'), "an English post links to its English URL");
  assert.equal(permalinkOf(SITE, writing[2]), "https://nwebnotfound.dev/de/writing/blog-one");

  // titles are escaped, a `]]>` in a title cannot end a section
  assert.ok(all.xml.includes("<title>Kaffee &amp; Kuchen &lt;toll&gt; &quot;x&quot;</title>"), "the title is escaped");
  assert.ok(all.xml.includes("und &amp; Zeichen"), "the CDATA keeps the HTML entity as it is");

  // blog = full text in CDATA, story = excerpt plus link
  const blogItem = all.xml.slice(all.xml.indexOf("<item>"), all.xml.indexOf("</item>"));
  assert.ok(blogItem.includes("<description><![CDATA[<p>Volltext mit ]]]]><![CDATA[> und &amp; Zeichen.</p>]]></description>"), "a blog post carries its full text, `]]>` split inside CDATA");
  assert.ok(all.xml.includes("<category>kaffee</category>") && all.xml.includes("<category>test</category>"), "tags become categories");

  const stories = feedAt(feeds, "/writing/stories/feed.xml");
  assert.ok(stories.xml.includes("<description><![CDATA[<p>Kapitel eins kurz.</p><p><a href=\"https://nwebnotfound.dev/de/writing/chapter-1\">Weiterlesen</a></p>]]></description>"), "a story carries summary plus link");
  assert.ok(!stories.xml.includes("wort ".repeat(120)), "a story does not carry its full text");
  assert.ok(stories.xml.includes("\u2026</p>"), "a cut story excerpt ends with an ellipsis");

  const seriesAtom = feedAt(feeds, "/writing/series/serie/atom.xml");
  assert.equal(seriesAtom.format, "atom");
  assert.ok(seriesAtom.xml.includes('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="de">'), "Atom 1.0 with the content language");
  assert.ok(seriesAtom.xml.includes('<title>NwebNotFound – Serie: Die Serie</title>'), "the series feed is titled after the series");
  assert.ok(seriesAtom.xml.includes('<link rel="self" type="application/atom+xml" href="https://nwebnotfound.dev/writing/series/serie/atom.xml"/>'), "Atom carries its own URL");
  assert.ok(seriesAtom.xml.includes("<published>2026-11-04T00:00:00Z</published>") && seriesAtom.xml.includes("<updated>2026-11-04T00:00:00Z</updated>"), "RFC 3339 dates");
  assert.ok(seriesAtom.xml.indexOf("chapter-1") < seriesAtom.xml.indexOf("chapter-2"), "newest first");
  assert.ok(seriesAtom.xml.includes('<category term=""/>') === false, "no empty category");

  // the English-only feed is English end to end
  const blog = feedAt(feeds, "/writing/blog/atom.xml");
  assert.equal(blog.lang, "en", "the blog feed's language is the language of its content");
  assert.ok(blog.xml.includes('xml:lang="en"') && blog.xml.includes("New writing from nwebnotfound.dev"), "title and description follow the feed language");
  assert.ok(blog.xml.includes("und &amp;amp; Zeichen"), "Atom escapes the HTML, so a reader sees the same entity");

  // Atom `type="html"` content is escaped HTML, so an excerpt with markup stays text
  const storiesAtom = feedAt(feeds, "/writing/stories/atom.xml");
  assert.ok(storiesAtom.xml.includes('<content type="html">&lt;p&gt;Kapitel eins kurz.&lt;/p&gt;&lt;p&gt;&lt;a href=&quot;https://nwebnotfound.dev/de/writing/chapter-1&quot;&gt;Weiterlesen&lt;/a&gt;&lt;/p&gt;</content>'), "Atom content is escaped HTML");
  assert.ok(storiesAtom.xml.includes('<summary type="text">Kapitel eins kurz.</summary>'), "Atom carries a plain-text summary");

  // excerpt length: a story without a summary is cut at ~280 characters
  const long = mk({ slug: "long", kind: "story", series: "serie", chapter: 3, date: "2026-11-03", body: "wort ".repeat(200) });
  assert.ok(itemSummary(long).length <= 281, `the excerpt stays short (${itemSummary(long).length})`);
  assert.ok(itemSummary(long).endsWith("\u2026"), "a cut excerpt ends with an ellipsis");
  assert.ok(itemHtml(long, permalinkOf(SITE, long), "Weiterlesen").includes("Weiterlesen"));
  const blogItem2 = mk({ slug: "full", date: "2026-11-03", html: "<p>eins</p><p>zwei</p>" });
  assert.equal(itemHtml(blogItem2, permalinkOf(SITE, blogItem2), "Weiterlesen"), "<p>eins</p><p>zwei</p>", "a blog post keeps its full text");
}

/* ---- 6. determinism: two builds of the same content are byte-identical ------------------------- */
{
  const writing = [mk({ slug: "a", date: "2026-11-07" }), mk({ slug: "b", date: "2026-11-06", lang: "en" })];
  const first = feedsOf(writing);
  const second = feedsOf(writing);
  assert.equal(JSON.stringify(first), JSON.stringify(second), "no clock, no randomness: same content, same bytes");
  const changed = feedsOf([mk({ slug: "a", date: "2026-11-07" }), mk({ slug: "b", date: "2026-11-06", lang: "en", title: "Anders" })]);
  assert.notEqual(feedAt(changed, "/writing/feed.xml").etag, feedAt(first, "/writing/feed.xml").etag, "different content, different ETag");
}

/* ---- 7. an empty index still produces valid feeds --------------------------------------------- */
{
  const feeds = feedsOf([], []);
  assert.deepEqual(feeds.map((f) => f.path), ["/writing/atom.xml", "/writing/feed.xml"], "only the two main feeds exist without content");
  for (const feed of feeds) {
    assert.deepEqual(checkWellFormed(feed.xml).errors, [], `${feed.path} is valid XML with 0 entries`);
    assert.equal(feed.count, 0);
    assert.equal(feed.lastModified, null, "an empty feed has no Last-Modified");
    assert.ok(!feed.xml.includes("<item>") && !feed.xml.includes("<entry>"), "an empty feed has no entries");
  }
  const rss = feedAt(feeds, "/writing/feed.xml");
  const atom = feedAt(feeds, "/writing/atom.xml");
  assert.ok(rss.xml.includes("<lastBuildDate>Thu, 01 Jan 1970 00:00:00 GMT</lastBuildDate>"), "an empty RSS feed uses a fixed date, not the build time");
  assert.ok(atom.xml.includes("<updated>1970-01-01T00:00:00Z</updated>"), "an empty Atom feed uses a fixed date");
}

/* ---- 8. routes and validators ------------------------------------------------------------------ */
assert.deepEqual(feedPaths(), { rss: "/writing/feed.xml", atom: "/writing/atom.xml" });
assert.deepEqual(feedPaths({ type: "kind", kind: "story" }), { rss: "/writing/stories/feed.xml", atom: "/writing/stories/atom.xml" });
assert.deepEqual(feedPaths({ type: "kind", kind: "blog" }), { rss: "/writing/blog/feed.xml", atom: "/writing/blog/atom.xml" });
assert.deepEqual(feedPaths({ type: "series", series: "sommer" }), { rss: "/writing/series/sommer/feed.xml", atom: "/writing/series/sommer/atom.xml" });

{
  const feeds = feedsOf([mk({ slug: "a", date: "2026-11-07" })]);
  assert.equal(feedFor(feeds, "/writing/feed.xml").path, "/writing/feed.xml");
  assert.equal(feedFor(feeds, "/writing/feed.xml/").path, "/writing/feed.xml", "a trailing slash still resolves");
  assert.equal(feedFor(feeds, "/de/writing/feed.xml").path, "/writing/feed.xml", "the language prefix is ignored");
  assert.equal(feedFor(feeds, "/en/writing/atom.xml").path, "/writing/atom.xml");
  assert.equal(feedFor(feeds, "/writing/feed.xml?x=1"), null, "a query string is not part of the lookup");
  assert.equal(feedFor(feeds, "/writing/notes/feed.xml"), null);
  assert.equal(feedFor(feeds, "/writing/"), null);
  assert.equal(feedFor([], "/writing/feed.xml"), null);
}

{
  const etag = feedEtag("<rss/>");
  assert.equal(feedEtag("<rss/>"), etag, "the ETag is derived from the body only");
  assert.notEqual(feedEtag("<rss />"), etag);
  assert.ok(matchesEtag(etag, etag));
  assert.ok(matchesEtag(`W/${etag}`, etag), "a weak comparison still matches");
  assert.ok(matchesEtag(`"anderer", ${etag}`, etag), "a list is understood");
  assert.ok(matchesEtag("*", etag));
  assert.ok(!matchesEtag('"anderer"', etag));
  assert.ok(!matchesEtag(null, etag) && !matchesEtag("", etag), "no header, no 304");
  assert.ok(!matchesEtag(etag, null));
}

/* ---- 9. integration with the content index (drafts never reach a feed) ------------------------- */
{
  const text = (fm) => ({ file: `${fm.match(/slug: (\S+)/)[1]}.md`, text: `---\n${fm}\n---\n\nText.\n` });
  const { entries, errors } = analyze([
    text("title: Sichtbar\nslug: sichtbar\nkind: blog\ndate: 2026-11-07\nlang: de"),
    text("title: Entwurf\nslug: entwurf\nkind: blog\ndate: 2026-11-06\ndraft: true\nlang: de"),
  ]);
  assert.deepEqual(errors, []);
  const { writing } = toIndex(entries, renderMarkdown);
  const xml = feedAt(feedsOf(writing), "/writing/feed.xml").xml;
  assert.ok(xml.includes("Sichtbar") && !xml.includes("Entwurf"), "a draft that never entered the index cannot appear in a feed");
  assert.deepEqual(checkWellFormed(xml).errors, [], "a feed built from the real content pipeline is well-formed");
}

/* ---- 10. renderFeed is pure and format-aware --------------------------------------------------- */
{
  const options = { items: [], site: SITE, selfPath: "/writing/feed.xml", title: "T", desc: "D", lang: "de", readMore: "Weiterlesen" };
  assert.equal(renderFeed({ ...options, format: "rss" }), renderFeed({ ...options, format: "rss" }));
  assert.ok(renderFeed({ ...options, format: "atom" }).includes("<feed xmlns"));
  assert.ok(renderFeed({ ...options, format: "rss" }).includes("<rss version"));
}

console.log("feed-unit ok");
