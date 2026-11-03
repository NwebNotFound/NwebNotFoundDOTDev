// Build-time RSS 2.0 / Atom 1.0 feeds for the Creative Hub writing section
// (docs/creative-hub-plan.md §8 "Feeds", §9 phase 3b).
//
// `scripts/build-content.mjs` renders every feed once and bundles the result into
// `src/generated/feeds.js`; the Worker only looks the prebuilt descriptor up by path and answers with
// `ETag` / `Last-Modified` (304 on `If-None-Match`). There is no feed rendering at request time.
// Everything here is pure and dependency-free, so the build script, the unit tests and the Worker can
// share it.
//
// Rules (plan §8 "Feeds" plus Nils' decisions):
//   - only published items: a draft never reaches the bundle at all, archived leaves the list,
//   - newest 30 entries, stable GUIDs (the permalink at the language the text was written in),
//   - blog posts carry the full text, story chapters an excerpt plus a link,
//   - `<lastBuildDate>` / `<updated>` come from the newest entry — never from the wall clock — so two
//     builds of the same content produce byte-identical feeds,
//   - a feed's language is the language of its content (`lang`); an empty feed falls back to German,
//   - an empty feed is still valid XML with 0 entries.
import { byNewest, excerpt, isValidDate, publishedWriting } from "./content.js";
import { escapeHtml, htmlToText } from "./markdown.js";
import { splitLang, withLang } from "./i18n/index.js";

export const FEED_MAX_ITEMS = 30;
export const FEED_EXCERPT_LIMIT = 280;
/** MIME type per feed format (also used for `<link rel="alternate" type=…>`). */
export const FEED_MIME = { rss: "application/rss+xml", atom: "application/atom+xml" };
export const FEED_FORMATS = ["rss", "atom"];
/** Deterministic stand-in for `<lastBuildDate>`/`<updated>` of a feed without entries. */
export const EMPTY_FEED_DATE = "1970-01-01T00:00:00Z";
export const DEFAULT_FEED_LANG = "de";
export const FEED_GENERATOR = "nwebnotfound.dev";

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
/** Escape a value for XML text or an attribute value. `]]>` survives as `]]&gt;`, which is valid. */
export const xmlEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

/**
 * Wrap HTML in a CDATA section. A `]]>` inside the payload would end the section early, so it is
 * split into `]]]]><![CDATA[>` — the concatenation is byte-identical for the reader.
 */
export const cdata = (value) => `<![CDATA[${String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/* ---- dates ------------------------------------------------------------------------------------- */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayOf = (iso) => {
  if (!isValidDate(iso)) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** `2026-11-03` → `Tue, 03 Nov 2026 00:00:00 GMT` (RFC 822, UTC, midnight). `null` for garbage. */
export function rfc822(iso) {
  const d = dayOf(iso);
  if (!d) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${WEEKDAYS[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} 00:00:00 GMT`;
}

/** `2026-11-03` → `2026-11-03T00:00:00Z` (RFC 3339). `null` for garbage. */
export function rfc3339(iso) {
  return dayOf(iso) ? `${iso}T00:00:00Z` : null;
}

/** The date an entry last changed: `updated` when it is later, otherwise `date`. */
export const itemDate = (item) => (item && item.updated && item.updated > item.date ? item.updated : item && item.date);

/* ---- selection --------------------------------------------------------------------------------- */

const ALL = { type: "all" };
export const kindScope = (kind) => ({ type: "kind", kind });
export const seriesScope = (slug) => ({ type: "series", series: slug });

/** Published items of a scope, newest first, capped at `limit`. */
export function feedItems(writing, scope = ALL, limit = FEED_MAX_ITEMS) {
  return publishedWriting(writing)
    .filter((w) =>
      scope.type === "kind" ? w.kind === scope.kind : scope.type === "series" ? w.kind === "story" && w.series === scope.series : true,
    )
    .slice()
    .sort(byNewest)
    .slice(0, limit);
}

/** The language of a feed: the most frequent `lang` of its entries, ties go to the newest entry. */
export function feedLang(items, fallback = DEFAULT_FEED_LANG) {
  const counts = new Map();
  for (const item of items || []) counts.set(item.lang, (counts.get(item.lang) || 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

/** The two feed URLs of a scope. Feeds are language-neutral: one URL per scope, not per UI language. */
export function feedPaths(scope = ALL) {
  const base =
    scope.type === "kind"
      ? scope.kind === "story"
        ? "/writing/stories"
        : "/writing/blog"
      : scope.type === "series"
        ? `/writing/series/${scope.series}`
        : "/writing";
  return { rss: `${base}/feed.xml`, atom: `${base}/atom.xml` };
}

/* ---- rendering --------------------------------------------------------------------------------- */

/** Stable permalink of an entry: the post URL at the language it was written in. */
export const permalinkOf = (site, item) => `https://${site}${withLang(`/writing/${item.slug}`, item.lang)}`;

/**
 * The HTML fragment of one entry: the full body for a blog post, an excerpt plus a link for a story
 * chapter (plan §8 "Feeds": the reader mode and the downloads stay the main experience).
 */
export function itemHtml(item, url, readMore) {
  if (item.kind === "blog") return item.html || "";
  const text = excerpt(item, htmlToText, FEED_EXCERPT_LIMIT);
  return `<p>${escapeHtml(text)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(readMore)}</a></p>`;
}

/** Plain-text teaser of an entry (Atom `<summary>`, always short). */
export const itemSummary = (item) => excerpt(item, htmlToText, FEED_EXCERPT_LIMIT);

function rssFeed({ items, site, selfPath, title, desc, lang, readMore }) {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${xmlEscape(title)}</title>`,
    `<link>${xmlEscape(`https://${site}${withLang("/writing", lang)}`)}</link>`,
    `<description>${xmlEscape(desc)}</description>`,
    `<language>${xmlEscape(lang)}</language>`,
    `<lastBuildDate>${items.length ? rfc822(itemDate(items[0])) : rfc822(EMPTY_FEED_DATE.slice(0, 10))}</lastBuildDate>`,
    `<generator>${xmlEscape(FEED_GENERATOR)}</generator>`,
    `<atom:link href="${xmlEscape(`https://${site}${selfPath}`)}" rel="self" type="application/rss+xml"/>`,
  ];
  for (const item of items) {
    const url = permalinkOf(site, item);
    lines.push(
      "<item>",
      `<title>${xmlEscape(item.title)}</title>`,
      `<link>${xmlEscape(url)}</link>`,
      `<guid isPermaLink="true">${xmlEscape(url)}</guid>`,
      `<pubDate>${rfc822(item.date)}</pubDate>`,
      `<description>${cdata(itemHtml(item, url, readMore))}</description>`,
      ...item.tags.map((tag) => `<category>${xmlEscape(tag)}</category>`),
      "</item>",
    );
  }
  lines.push("</channel>", "</rss>");
  return `${lines.join("\n")}\n`;
}

function atomFeed({ items, site, selfPath, title, desc, lang, readMore }) {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xmlEscape(lang)}">`,
    `<title>${xmlEscape(title)}</title>`,
    `<subtitle>${xmlEscape(desc)}</subtitle>`,
    `<id>${xmlEscape(`https://${site}${selfPath}`)}</id>`,
    `<link rel="alternate" type="text/html" href="${xmlEscape(`https://${site}${withLang("/writing", lang)}`)}"/>`,
    `<link rel="self" type="application/atom+xml" href="${xmlEscape(`https://${site}${selfPath}`)}"/>`,
    `<updated>${items.length ? rfc3339(itemDate(items[0])) : EMPTY_FEED_DATE}</updated>`,
    `<generator uri="https://${xmlEscape(site)}/" version="1">${xmlEscape(FEED_GENERATOR)}</generator>`,
  ];
  for (const item of items) {
    const url = permalinkOf(site, item);
    lines.push(
      "<entry>",
      `<title>${xmlEscape(item.title)}</title>`,
      `<link rel="alternate" type="text/html" href="${xmlEscape(url)}"/>`,
      `<id>${xmlEscape(url)}</id>`,
      `<published>${rfc3339(item.date)}</published>`,
      `<updated>${rfc3339(itemDate(item))}</updated>`,
      `<summary type="text">${xmlEscape(itemSummary(item))}</summary>`,
      `<content type="html">${xmlEscape(itemHtml(item, url, readMore))}</content>`,
      ...item.tags.map((tag) => `<category term="${xmlEscape(tag)}"/>`),
      "</entry>",
    );
  }
  lines.push("</feed>");
  return `${lines.join("\n")}\n`;
}

/** Render one feed. Pure: the same input always produces the same bytes. */
export function renderFeed(options) {
  return options.format === "atom" ? atomFeed(options) : rssFeed(options);
}

/** FNV-1a over the XML, plus its length: cheap, deterministic, enough for a cache validator. */
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A strong-looking ETag derived from the body, so it never changes between two builds. */
export const feedEtag = (xml) => `"${hash32(xml).toString(16).padStart(8, "0")}-${xml.length.toString(36)}"`;

/** Does an `If-None-Match` header match our ETag? Understands lists, `W/` and `*`. */
export function matchesEtag(header, etag) {
  if (!header || !etag) return false;
  for (const raw of String(header).split(",")) {
    const value = raw.trim();
    if (!value) continue;
    if (value === "*") return true;
    if (value.replace(/^W\//, "") === etag) return true;
  }
  return false;
}

/**
 * Build every feed of a content index. `t` is `(lang) => t` (src/i18n/index.js), so feed titles and
 * descriptions come from the same message files as the rest of the interface.
 * `/writing/feed.xml` and `/writing/atom.xml` always exist (valid XML, 0 entries when there is no
 * content); a per-kind or per-series feed only exists once it has at least one published entry.
 */
export function buildFeeds({ writing = [], series = [], site, t, limit = FEED_MAX_ITEMS }) {
  const scopes = [ALL];
  for (const kind of ["blog", "story"]) if (feedItems(writing, kindScope(kind), limit).length) scopes.push(kindScope(kind));
  for (const s of series) if (feedItems(writing, seriesScope(s.slug), limit).length) scopes.push({ ...seriesScope(s.slug), title: s.title });

  const feeds = [];
  for (const scope of scopes) {
    const items = feedItems(writing, scope, limit);
    const lang = feedLang(items);
    const translate = t(lang);
    const title =
      scope.type === "series"
        ? translate("feed.title.series", { series: scope.title })
        : scope.type === "kind"
          ? translate(scope.kind === "story" ? "feed.title.stories" : "feed.title.blog")
          : translate("feed.title");
    const desc = scope.type === "kind" && scope.kind === "story" ? translate("feed.desc.stories") : translate("feed.desc");
    const paths = feedPaths(scope);
    for (const format of FEED_FORMATS) {
      const selfPath = paths[format];
      const xml = renderFeed({ items, format, site, selfPath, title, desc, lang, readMore: translate("feed.read_more") });
      feeds.push({
        path: selfPath,
        format,
        scope: scope.type,
        kind: scope.kind || "",
        series: scope.series || "",
        lang,
        title,
        count: items.length,
        etag: feedEtag(xml),
        lastModified: items.length ? rfc822(itemDate(items[0])) : null,
        xml,
      });
    }
  }
  return feeds.sort((a, b) => a.path.localeCompare(b.path));
}

/** Look a prebuilt feed up by request path (a `/de` or `/en` prefix is ignored). `null` if unknown. */
export function feedFor(feeds, path) {
  const bare = splitLang(String(path || "/")).path;
  const clean = bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
  return (feeds || []).find((feed) => feed.path === clean) || null;
}
