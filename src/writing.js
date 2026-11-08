// Texte & Kapitel from D1 (migration 0021, Verwaltung PR C). The windows, the old shared links, the reading-progress
// check and the feeds all read one index in the same shape as the build-time one (src/content.js toIndex), so the
// renderers stay as they are. While D1 has no published row (status live or archived) the built index is used, which
// keeps the site byte-identical until the first text is published in the Verwaltung.
import { renderMarkdown } from "./markdown.js";
import { countWords, readingTimeMinutes, byNewest } from "./content.js";
import { buildFeeds } from "./feed.js";
import { makeT } from "./i18n/index.js";

export const WRITING_TTL_MS = 60000;
export const FEED_TTL_MS = 300000;
const SITE = "nwebnotfound.dev";   // must match `SITE` in scripts/build-content.mjs (absolute feed links)

const day = (ms) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(ms));
const tagsOf = (s) => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };

/** D1 rows -> index items for one reading language (pure; tests call it directly). EN fields are used per field when
 *  the reader wants English and they exist; `lang` says which language the text really is in. */
export function toItems(series, items, lang = "de") {
  const en = lang === "en";
  const byId = new Map(series.map((s) => [s.id, s]));
  return items.filter((r) => r.status === "live" || r.status === "archived").map((r) => {
    const se = r.series_id != null ? byId.get(r.series_id) : null;
    const story = r.kind === "story" && se && r.chapter;
    const body = en && r.body_en ? r.body_en : r.body_de;
    const pub = r.published_at || r.updated_at;
    return {
      slug: r.slug, kind: story ? "story" : "blog", title: en && r.title_en ? r.title_en : r.title_de,
      date: day(pub), updated: r.updated_at && day(r.updated_at) > day(pub) ? day(r.updated_at) : null,
      tags: tagsOf(r.tags), draft: false, archived: r.status === "archived", lang: en && r.body_en ? "en" : "de",
      summary: null, cover: null, series: story ? se.slug : null, seriesTitle: story ? (en && se.title_en ? se.title_en : se.title_de) : null,
      chapter: story ? r.chapter : null, wordCount: countWords(body), readingMinutes: readingTimeMinutes(body),
      html: renderMarkdown(body), d1: true,
    };
  }).sort(byNewest);
}

let IDX = null, FEED = null;
export function purgeWriting() { IDX = null; FEED = null; }

async function rows(env) {
  const [s, i] = await env.DB.batch([
    env.DB.prepare("SELECT id, slug, title_de, title_en, status, sort FROM writing_series ORDER BY sort, id"),
    env.DB.prepare("SELECT id, series_id, kind, chapter, slug, title_de, title_en, body_de, body_en, tags, status, published_at, updated_at FROM writing_items WHERE status IN ('live', 'archived') LIMIT 2000"),
  ]);
  return { series: s.results || [], items: i.results || [] };
}

/** The writing index for `lang`: D1 when it has published rows, else `fallback` (the built CONTENT.writing).
 *  60 s isolate cache per language, cleared by every Verwaltung write (purgeWriting via purgeSite). */
export function writingIndex(env, lang, fallback, now = Date.now()) {
  if (!IDX || now - IDX.at >= WRITING_TTL_MS) IDX = { at: now, p: rows(env).catch(() => null), by: {} };
  const L = lang === "en" ? "en" : "de";
  if (!IDX.by[L]) IDX.by[L] = IDX.p.then((d) => (d && d.items.length ? toItems(d.series, d.items, L) : fallback));
  return IDX.by[L];
}

/** The feeds: built at request time from D1 when it has published rows (5 min cache), else `fallback` (FEEDS). */
export function writingFeeds(env, fallback, now = Date.now()) {
  if (FEED && now - FEED.at < FEED_TTL_MS) return FEED.p;
  const p = rows(env).then((d) => {
    if (!d || !d.items.length) return fallback;
    const writing = toItems(d.series, d.items, "de"), grouped = new Map();
    for (const w of writing) if (w.kind === "story") { if (!grouped.has(w.series)) grouped.set(w.series, []); grouped.get(w.series).push(w); }
    const series = [...grouped].map(([slug, ch]) => { const o = ch.slice().sort((a, b) => a.chapter - b.chapter); return { slug, title: o[0].seriesTitle || slug, chapters: o.map((c) => c.slug), count: o.length }; });
    return buildFeeds({ writing, series, site: SITE, t: makeT });
  }).catch(() => fallback);
  FEED = { at: now, p };
  return p;
}
