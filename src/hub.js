// Creative Hub shell and pages (docs/creative-hub-plan.md §3, §8; DESIGN.md §11).
//
// The hub lives on nwebnotfound.dev (the Minecraft surface on mc.nwebnotfound.dev is untouched) and
// renders server-side from this one Worker. Everything here is a string builder:
//   - no framework, no build step, no runtime Markdown parsing (writing bodies come prebuilt from
//     src/generated/content.js, produced by scripts/build-content.mjs),
//   - only hub assets: public/design/summer.css (`.sm-*`), public/design/summer-theme.js and the
//     self-hosted SmPixel/SmBody woff2 files. No remote font, no CDN, no tracker, no inline event
//     handler. Pixel art is inline SVG with `shape-rendering: crispEdges` (the approved artboards in
//     /opt/data/mockups/summer-v2), so a themed page needs no second request and no image file,
//   - interface text comes from src/i18n/{de,en}.js via `t()`, so a missing key falls back to the
//     other language instead of rendering `undefined`,
//   - `/de/…` and `/en/…` are the canonical URLs, `hreflang` and `<html lang>` follow the language,
//     and the unprefixed paths keep working (the language came from the cookie or Accept-Language).
import { AV } from "./asset-version.js";
import { LANGS, makeT, withLang } from "./i18n/index.js";
import { CONTENT } from "./generated/content.js";
import { allTags, byNewest, chaptersOf, excerpt, filterWriting, findWriting, prevNext, publishedWriting } from "./content.js";
import { epubPath, seriesEpubPath } from "./epub.js";
import { FEED_MIME } from "./feed.js";
import { htmlToText } from "./markdown.js";

export const SITE = "nwebnotfound.dev";
export const MC_HOST = "mc.nwebnotfound.dev";
export const GITHUB_URL = "https://github.com/NwebNotFound";
export const X_URL = "https://x.com/NwebNotFound";

// The generated content index (scripts/build-content.mjs). Empty until Nils publishes something.
const WRITING = CONTENT.writing || [];
const SERIES = CONTENT.series || [];

// Hub routes. The first entry is the new start page; `/portfolio` is the previous start page and
// keeps its own (German) portfolio shell in src/worker.js.
export const HUB_PAGES = ["/", "/about", "/music", "/writing", "/reviews"];
const SOON = { "/music": "music", "/writing": "writing", "/reviews": "reviews" };

const NAV = [
  { path: "/", key: "nav.home" },
  { path: "/music", key: "nav.music", soon: true },
  { path: "/writing", key: "nav.writing", soon: true },
  { path: "/reviews", key: "nav.reviews", soon: true },
  { path: "/about", key: "nav.about" },
];

const META = {
  "/": ["meta.home.title", "meta.home.desc"],
  "/about": ["meta.about.title", "meta.about.desc"],
  "/music": ["meta.music.title", "meta.music.desc"],
  "/reviews": ["meta.reviews.title", "meta.reviews.desc"],
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** External link: a normal link with `rel="noopener noreferrer"`, never a widget or an embed. */
const ext = (url, text, cls = "") => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

const sprIdx = `&#8250;`; // ›
/** The artboard arrow inside a button or a CTA line. */
const arrow = `<span class="sm-btn__arrow" aria-hidden="true">&#8594;</span>`;
const ctaArrow = `<span class="sm-tile__cta-arrow" aria-hidden="true">&#8594;</span>`;

const href = (path, lang) => withLang(path, lang);

/* ---------- pixel art (inline SVG, whole-pixel grid, crispEdges) ---------- */

/** Brand mark: the mascot's head, 28px, in the artboard's day colouring. */
const brandMark = () =>
  `<svg class="sm-px-icon" width="28" height="28" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="2" y="1" width="3" height="3" fill="currentColor"></rect>` +
  `<rect x="11" y="1" width="3" height="3" fill="currentColor"></rect>` +
  `<rect x="1" y="3" width="14" height="11" fill="currentColor"></rect>` +
  `<rect x="2" y="4" width="12" height="9" fill="var(--sm-cream)"></rect>` +
  `<rect x="5" y="7" width="2" height="2" fill="#1f2a44"></rect>` +
  `<rect x="9" y="7" width="2" height="2" fill="#1f2a44"></rect>` +
  `<rect x="7" y="10" width="2" height="1" fill="#1f2a44"></rect>` +
  `</svg>`;

/** The full creature (artboard Main-day): ears, cheeks, blinking eyes, feet. */
const mascotArt = (size, cls = "sm-bob", label = "") =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 16 16"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true" focusable="false"'} shape-rendering="crispEdges">` +
  `<rect x="2" y="1" width="3" height="3" fill="#1f2a44"></rect>` +
  `<rect x="11" y="1" width="3" height="3" fill="#1f2a44"></rect>` +
  `<rect x="3" y="2" width="1" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="12" y="2" width="1" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="1" y="3" width="14" height="11" fill="#1f2a44"></rect>` +
  `<rect x="2" y="4" width="12" height="9" fill="var(--sm-cream)"></rect>` +
  `<rect class="sm-blink" x="5" y="7" width="2" height="2" fill="#1f2a44"></rect>` +
  `<rect class="sm-blink" x="9" y="7" width="2" height="2" fill="#1f2a44"></rect>` +
  `<rect x="5" y="7" width="1" height="1" fill="#ffffff"></rect>` +
  `<rect x="9" y="7" width="1" height="1" fill="#ffffff"></rect>` +
  `<rect x="3" y="10" width="2" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="11" y="10" width="2" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="7" y="10" width="2" height="1" fill="#1f2a44"></rect>` +
  `<rect x="3" y="14" width="3" height="1" fill="#1f2a44"></rect>` +
  `<rect x="10" y="14" width="3" height="1" fill="#1f2a44"></rect>` +
  `</svg>`;

/** The creature with a straw hat and a hammer — the "under construction" artboard. */
const mascotHammer = (size, label) =>
  `<svg class="sm-bob" width="${size}" height="${size}" viewBox="0 0 20 16" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges">` +
  `<rect x="2" y="1" width="3" height="3" fill="#1f2a44"></rect>` +
  `<rect x="11" y="1" width="3" height="3" fill="#1f2a44"></rect>` +
  `<rect x="1" y="3" width="14" height="11" fill="#1f2a44"></rect>` +
  `<rect x="2" y="4" width="12" height="9" fill="var(--sm-cream)"></rect>` +
  `<rect class="sm-blink" x="5" y="7" width="2" height="2" fill="#1f2a44"></rect>` +
  `<rect class="sm-blink" x="9" y="7" width="2" height="2" fill="#1f2a44"></rect>` +
  `<rect x="3" y="10" width="2" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="11" y="10" width="2" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="7" y="10" width="2" height="1" fill="#1f2a44"></rect>` +
  `<rect x="1" y="2" width="14" height="2" fill="#ffd45e"></rect>` +
  `<rect x="3" y="1" width="10" height="1" fill="#ffd45e"></rect>` +
  `<g class="sm-hammer">` +
  `<rect x="15" y="6" width="1" height="6" fill="#8a5d3a"></rect>` +
  `<rect x="14" y="4" width="4" height="2" fill="#647aa0"></rect>` +
  `</g></svg>`;

/** The 404 creature: one eye squinted, slightly tilted. */
const mascotConfused = (size, label) =>
  `<svg class="sm-tilt" width="${size}" height="${size}" viewBox="0 0 16 16" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges">` +
  `<rect x="2" y="1" width="3" height="3" fill="#a9b7d9"></rect>` +
  `<rect x="11" y="1" width="3" height="3" fill="#a9b7d9"></rect>` +
  `<rect x="1" y="3" width="14" height="11" fill="#a9b7d9"></rect>` +
  `<rect x="2" y="4" width="12" height="9" fill="var(--sm-cream)"></rect>` +
  `<rect x="5" y="7" width="2" height="1" fill="#1f2a44"></rect>` +
  `<rect class="sm-blink" x="9" y="6" width="2" height="3" fill="#1f2a44"></rect>` +
  `<rect x="3" y="10" width="2" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="11" y="10" width="2" height="1" fill="var(--sm-cheek)"></rect>` +
  `<rect x="6" y="11" width="4" height="1" fill="#1f2a44"></rect>` +
  `</svg>`;

const sunArt = (size, cls = "") =>
  `<svg class="sm-px-icon ${cls}" width="${size}" height="${size}" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="4" y="4" width="4" height="4" fill="#e2a52a"></rect>` +
  `<rect x="3" y="5" width="6" height="2" fill="#ffd45e"></rect>` +
  `<rect x="5" y="3" width="2" height="6" fill="#ffd45e"></rect>` +
  `<rect x="5" y="0" width="2" height="2" fill="#e2a52a"></rect>` +
  `<rect x="5" y="10" width="2" height="2" fill="#e2a52a"></rect>` +
  `<rect x="0" y="5" width="2" height="2" fill="#e2a52a"></rect>` +
  `<rect x="10" y="5" width="2" height="2" fill="#e2a52a"></rect>` +
  `<rect x="2" y="2" width="1" height="1" fill="#e2a52a"></rect>` +
  `<rect x="9" y="2" width="1" height="1" fill="#e2a52a"></rect>` +
  `<rect x="2" y="9" width="1" height="1" fill="#e2a52a"></rect>` +
  `<rect x="9" y="9" width="1" height="1" fill="#e2a52a"></rect>` +
  `</svg>`;

const moonArt = (size) =>
  `<svg class="sm-px-icon" width="${size}" height="${size}" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="4" y="1" width="4" height="1" fill="#ffd45e"></rect>` +
  `<rect x="2" y="2" width="3" height="1" fill="#ffd45e"></rect>` +
  `<rect x="1" y="3" width="3" height="6" fill="#ffd45e"></rect>` +
  `<rect x="2" y="9" width="3" height="1" fill="#ffd45e"></rect>` +
  `<rect x="4" y="10" width="4" height="1" fill="#ffd45e"></rect>` +
  `</svg>`;

const cloudArt = (w, h, cls = "sm-drift") =>
  `<svg class="sm-px-icon ${cls}" width="${w}" height="${h}" viewBox="0 0 24 10" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="6" y="2" width="8" height="2" fill="#ffffff"></rect>` +
  `<rect x="14" y="1" width="5" height="3" fill="#ffffff"></rect>` +
  `<rect x="2" y="4" width="20" height="3" fill="#ffffff"></rect>` +
  `<rect x="0" y="7" width="24" height="2" fill="#ffffff"></rect>` +
  `</svg>`;

/** Grass + dirt ground, stretched to the panel width (artboard uses preserveAspectRatio="none"). */
const groundArt = (h, viewBox = "0 0 60 16") =>
  `<svg class="sm-px-icon sm-scene__ground" height="${h}" viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="0" y="6" width="60" height="10" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="10" y="4" width="22" height="2" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="16" y="2" width="12" height="2" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="40" y="5" width="14" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="0" y="12" width="60" height="4" fill="var(--sm-accent-dirt)"></rect>` +
  `<rect x="6" y="13" width="2" height="1" fill="rgba(0,0,0,.15)"></rect>` +
  `<rect x="30" y="14" width="2" height="1" fill="rgba(0,0,0,.15)"></rect>` +
  `<rect x="48" y="13" width="2" height="1" fill="rgba(0,0,0,.15)"></rect>` +
  `</svg>`;

const twinkleArt = (size, colour, cls = "") =>
  `<svg class="sm-px-icon sm-twinkle ${cls}" width="${size}" height="${size}" viewBox="0 0 5 5" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="2" y="0" width="1" height="5" fill="${colour}"></rect>` +
  `<rect x="0" y="2" width="5" height="1" fill="${colour}"></rect>` +
  `</svg>`;

/** Grass line above the footer (artboard: an 80x2 strip with notches). */
const grassline = () =>
  `<svg class="sm-px-icon sm-grassline" viewBox="0 0 80 2" preserveAspectRatio="none" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="0" y="1" width="80" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="3" y="0" width="2" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="17" y="0" width="1" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="29" y="0" width="3" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="48" y="0" width="1" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="61" y="0" width="2" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `<rect x="74" y="0" width="1" height="1" fill="var(--sm-accent-grass)"></rect>` +
  `</svg>`;

const rssArt = (size = 16) =>
  `<svg class="sm-px-icon" width="${size}" height="${size}" viewBox="0 0 8 8" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  `<rect x="0" y="6" width="2" height="2" fill="var(--sm-sun-edge)"></rect>` +
  `<rect x="0" y="3" width="2" height="1" fill="var(--sm-sun-edge)"></rect>` +
  `<rect x="2" y="4" width="1" height="1" fill="var(--sm-sun-edge)"></rect>` +
  `<rect x="3" y="5" width="1" height="3" fill="var(--sm-sun-edge)"></rect>` +
  `<rect x="0" y="0" width="3" height="1" fill="var(--sm-sun-edge)"></rect>` +
  `<rect x="3" y="1" width="2" height="1" fill="var(--sm-sun-edge)"></rect>` +
  `<rect x="5" y="2" width="1" height="2" fill="var(--sm-sun-edge)"></rect>` +
  `<rect x="6" y="4" width="1" height="4" fill="var(--sm-sun-edge)"></rect>` +
  `</svg>`;

/* Tile icons, drawn on a 10x10 grid (artboards). */
const TILE_ART = {
  minecraft:
    `<rect x="0" y="0" width="10" height="3" fill="#3f9a4f"></rect><rect x="0" y="3" width="10" height="7" fill="#a8703f"></rect><rect x="2" y="3" width="1" height="2" fill="#3f9a4f"></rect><rect x="6" y="3" width="1" height="1" fill="#3f9a4f"></rect><rect x="3" y="6" width="1" height="1" fill="#7a4f2a"></rect><rect x="7" y="7" width="1" height="1" fill="#7a4f2a"></rect>`,
  about:
    `<rect x="2" y="1" width="6" height="6" fill="#ffffff"></rect><rect x="1" y="2" width="8" height="6" fill="#ffffff"></rect><rect x="3" y="3" width="1" height="1" fill="#1f2a44"></rect><rect x="6" y="3" width="1" height="1" fill="#1f2a44"></rect><rect x="4" y="5" width="2" height="1" fill="#1f2a44"></rect><rect x="2" y="8" width="2" height="1" fill="#ffffff"></rect>`,
  music:
    `<rect x="4" y="1" width="5" height="1" fill="#1f2a44"></rect><rect x="8" y="1" width="1" height="6" fill="#1f2a44"></rect><rect x="4" y="1" width="1" height="7" fill="#1f2a44"></rect><rect x="2" y="7" width="3" height="2" fill="#1f2a44"></rect><rect x="6" y="6" width="3" height="2" fill="#1f2a44"></rect>`,
  writing:
    `<rect x="1" y="2" width="4" height="6" fill="#ffffff"></rect><rect x="5" y="2" width="4" height="6" fill="#f1ecff"></rect><rect x="4" y="2" width="2" height="7" fill="#1f2a44"></rect><rect x="2" y="3" width="2" height="1" fill="#1f2a44"></rect><rect x="2" y="5" width="2" height="1" fill="#1f2a44"></rect><rect x="6" y="3" width="2" height="1" fill="#1f2a44"></rect>`,
  reviews:
    `<rect x="4" y="0" width="2" height="2" fill="#1f2a44"></rect><rect x="0" y="3" width="10" height="2" fill="#1f2a44"></rect><rect x="2" y="2" width="6" height="5" fill="#1f2a44"></rect><rect x="1" y="7" width="3" height="2" fill="#1f2a44"></rect><rect x="6" y="7" width="3" height="2" fill="#1f2a44"></rect>`,
  guestbook:
    `<rect x="1" y="1" width="8" height="6" fill="#ffffff"></rect><rect x="2" y="7" width="2" height="2" fill="#ffffff"></rect><rect x="3" y="3" width="1" height="1" fill="#1f2a44"></rect><rect x="5" y="3" width="1" height="1" fill="#1f2a44"></rect><rect x="7" y="3" width="1" height="1" fill="#1f2a44"></rect>`,
  projects:
    `<rect x="3" y="2" width="1" height="1" fill="currentColor"></rect><rect x="2" y="3" width="1" height="1" fill="currentColor"></rect><rect x="1" y="4" width="1" height="2" fill="currentColor"></rect><rect x="2" y="6" width="1" height="1" fill="currentColor"></rect><rect x="3" y="7" width="1" height="1" fill="currentColor"></rect><rect x="6" y="2" width="1" height="1" fill="currentColor"></rect><rect x="7" y="3" width="1" height="1" fill="currentColor"></rect><rect x="8" y="4" width="1" height="2" fill="currentColor"></rect><rect x="7" y="6" width="1" height="1" fill="currentColor"></rect><rect x="6" y="7" width="1" height="1" fill="currentColor"></rect>`,
};

const tileIcon = (key, size = 28) =>
  `<svg class="sm-px-icon" width="${size}" height="${size}" viewBox="0 0 10 10" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${TILE_ART[key] || ""}</svg>`;

/* ---------- writing: dates, kinds, tags, urls ---------- */

const MONTHS = {
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** `2026-11-03` → `3. November 2026` (de) / `3 November 2026` (en). No Intl: deterministic. */
function formatDate(iso, lang) {
  const parts = String(iso || "").split("-");
  if (parts.length !== 3) return String(iso || "");
  const [y, m, d] = parts;
  const name = (MONTHS[lang] || MONTHS.de)[Number(m) - 1] || m;
  return lang === "en" ? `${Number(d)} ${name} ${y}` : `${Number(d)}. ${name} ${y}`;
}

const kindLabel = (kind, t) => (kind === "story" ? t("writing.kind.story") : t("writing.kind.blog"));
const postUrl = (slug, lang) => href(`/writing/${slug}`, lang);
const seriesUrl = (slug, lang) => href(`/writing/series/${slug}`, lang);

function writingListUrl(lang, { kind = "", tag = "" } = {}) {
  const q = new URLSearchParams();
  if (kind) q.set("kind", kind);
  if (tag) q.set("tag", tag);
  const s = q.toString();
  return href("/writing", lang) + (s ? `?${s}` : "");
}

const seriesTitleOf = (all, slug) => (all.find((w) => w.series === slug && w.seriesTitle) || {}).seriesTitle || slug;

function tagsHtml(tags, lang, cls = "") {
  if (!tags || !tags.length) return "";
  const items = tags.map((tag) => `<li><a class="sm-tag" href="${writingListUrl(lang, { tag })}">${esc(tag)}</a></li>`).join("");
  return `<ul class="sm-tags ${cls}">${items}</ul>`;
}

/* ---------- feeds (plan §8 "Feeds", phase 3b) ---------- */

// Feed URLs are language-neutral: a feed carries the language of its content, not the UI language, so
// there is exactly one URL per feed (`/writing/feed.xml`, not `/de/writing/feed.xml`). `group` is the
// short scope name shown in the footnote, so a chapter page does not end up with four identical
// "RSS · Atom · RSS · Atom" links.
const feedLinks = (base, title, group = "") => [
  { format: "rss", href: `${base}/feed.xml`, title, group },
  { format: "atom", href: `${base}/atom.xml`, title, group },
];

/** Autodiscovery links for the `/writing` list (the whole writing feed). */
export const writingListFeeds = (t) => feedLinks("/writing", t("feed.title"));

/** Autodiscovery links for one post: its kind feed, plus the series feed for a story chapter. */
export function writingPostFeeds(item, all, t) {
  const kind = item.kind === "story" ? "/writing/stories" : "/writing/blog";
  const kindTitle = t(item.kind === "story" ? "feed.title.stories" : "feed.title.blog");
  const group = t(item.kind === "story" ? "writing.filter.story" : "writing.filter.blog");
  const feeds = feedLinks(kind, kindTitle, group);
  if (item.kind === "story" && item.series) {
    const seriesTitle = seriesTitleOf(all, item.series);
    feeds.push(...feedLinks(`/writing/series/${item.series}`, t("feed.title.series", { series: seriesTitle }), t("feed.series_label", { series: seriesTitle })));
  }
  return feeds;
}

/** Autodiscovery links for a series page. */
export function writingSeriesFeeds(series, t) {
  return feedLinks(`/writing/series/${series.slug}`, t("feed.title.series", { series: series.title }), t("feed.series_label", { series: series.title }));
}

/** The visible footnote: which feeds this page belongs to, so a reader can subscribe. */
function feedNote(feeds, t) {
  if (!feeds || !feeds.length) return "";
  const links = feeds
    .map((f) => {
      const label = t(f.format === "rss" ? "feed.rss" : "feed.atom");
      return `<a class="sm-feed-note__link" href="${esc(f.href)}">${esc(f.group ? `${label} (${f.group})` : label)}</a>`;
    })
    .join(`<span class="sm-feed-note__sep" aria-hidden="true"> · </span>`);
  return `<p class="sm-feed-note">${esc(t("writing.feed.note"))} ${links}</p>`;
}

/* ---------- export (plan §8 "Export", phase 3c) ---------- */

// Download and print live on story pages only. Blog posts and (later) reviews get no export at all —
// Nils' decision in plan §0. The print button calls `window.print()` from an external script
// (/design/summer-print.js), never from an inline handler, so the CSP stays clean.
const printButton = (t) => `<button class="sm-btn sm-btn--soft sm-btn--dense" type="button" data-sm-print>${esc(t("writing.export.print"))}</button>`;

const rightsLine = (t) => `<p class="sm-export__rights">${esc(t("writing.export.rights"))}</p>`;

/** Download + print block of one story chapter. An archived chapter is not exported, so it gets none. */
function exportBlock(item, t) {
  if (item.archived) return "";
  const series = item.series ? `<a class="sm-btn sm-btn--soft sm-btn--dense" href="${seriesEpubPath(item.series)}" download>${esc(t("writing.export.series_epub"))}</a>` : "";
  return `
<div class="sm-export">
<p class="sm-export__label">${esc(t("writing.export.note"))}</p>
<p class="sm-row sm-export__row">
<a class="sm-btn sm-btn--soft sm-btn--dense" href="${epubPath(item.slug)}" download>${esc(t("writing.export.epub"))}</a>
${series}
${printButton(t)}
</p>
<p class="sm-hint">${esc(t("writing.export.print_hint"))}</p>
${rightsLine(t)}
</div>`;
}

/** Download + print block of a series page (one EPUB with every published chapter). */
function seriesExportBlock(series, t) {
  return `
<div class="sm-export">
<p class="sm-export__label">${esc(t("writing.export.note"))}</p>
<p class="sm-row sm-export__row">
<a class="sm-btn sm-btn--soft sm-btn--dense" href="${seriesEpubPath(series.slug)}" download>${esc(t("writing.export.series_epub"))}</a>
${printButton(t)}
</p>
<p class="sm-hint">${esc(t("writing.export.print_hint"))}</p>
${rightsLine(t)}
</div>`;
}

/* ---------- writing: bodies ---------- */

function writingCard(item, lang, t) {
  const text = excerpt(item, htmlToText, 160);
  const updated = item.updated ? `<span>${esc(t("writing.updated", { date: formatDate(item.updated, lang) }))}</span>` : "";
  const archived = item.archived ? `<span class="sm-badge sm-badge--warning">${esc(t("writing.archived"))}</span>` : "";
  return `<article class="sm-post-card">
<span class="sm-badge sm-badge--lavender sm-post-card__kind">${esc(kindLabel(item.kind, t))}</span>
<h2 class="sm-post-card__title"><a href="${postUrl(item.slug, lang)}">${esc(item.title)}</a></h2>
<p class="sm-post-card__meta"><time datetime="${esc(item.date)}">${esc(formatDate(item.date, lang))}</time> <span aria-hidden="true">${sprIdx}</span> ${esc(t("writing.reading_time", { minutes: item.readingMinutes }))} ${updated} ${archived}</p>
<p class="sm-post-card__summary">${esc(text)}</p>
${tagsHtml(item.tags, lang, "sm-post-card__tags")}
</article>`;
}

/**
 * The featured series card at the top of `/writing` (artboard: cover with the title, chips, the
 * "read on" button and the series EPUB). Only rendered when a series with published chapters exists,
 * so nothing is invented for an empty index.
 */
function featuredSeries(series, all, lang, t) {
  const chapters = chaptersOf(all, series.slug);
  if (!chapters.length) return "";
  const latest = chapters[chapters.length - 1];
  return `
<article class="sm-card sm-feature sm-rise">
<div class="sm-feature__cover">
${cloudArt(80, 34)}
<span class="sm-feature__title">${esc(series.title)}</span>
<svg class="sm-px-icon sm-feature__ground" height="40" viewBox="0 0 20 4" preserveAspectRatio="none" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><rect x="0" y="2" width="20" height="2" fill="var(--sm-accent-grass)"></rect><rect x="4" y="1" width="8" height="1" fill="var(--sm-accent-grass)"></rect></svg>
</div>
<div class="sm-feature__body">
<div class="sm-feature__chips">
<span class="sm-badge sm-badge--lavender">${esc(t("writing.series.eyebrow"))}</span>
<span class="sm-badge">${esc(t("writing.count", { n: chapters.length }))}</span>
</div>
<h2 class="sm-h2"><a href="${seriesUrl(series.slug, lang)}">${esc(series.title)}</a></h2>
<div class="sm-feature__cta">
<a class="sm-btn" href="${postUrl(latest.slug, lang)}">${esc(t("feed.read_more"))} ${arrow}</a>
<a class="sm-btn sm-btn--soft" href="${seriesUrl(series.slug, lang)}">${esc(t("writing.series.lead", { count: chapters.length }))}</a>
</div>
</div>
</article>`;
}

/** The `/writing` list: newest first, filterable by kind and tag. Empty → the mascot empty state. */
export function writingListBody(items, lang, filters = {}, t = makeT(lang)) {
  const visible = publishedWriting(items).slice().sort(byNewest);
  if (!visible.length) return soonBody(t, lang, "/writing");

  const tags = allTags(visible);
  const filtered = filterWriting(visible, filters);
  const chip = (label, url, active) => `<a class="sm-tag${active ? " sm-tag--active" : ""}" href="${url}"${active ? ' aria-current="true"' : ""}>${esc(label)}</a>`;
  const chips = [
    chip(t("writing.filter.all"), writingListUrl(lang, {}), !filters.kind && !filters.tag),
    chip(t("writing.filter.story"), writingListUrl(lang, { kind: "story" }), filters.kind === "story"),
    chip(t("writing.filter.blog"), writingListUrl(lang, { kind: "blog" }), filters.kind === "blog"),
  ].join("");
  const tagChips = tags.length
    ? `<span class="sm-filters__label">${esc(t("writing.filter.tags"))}</span>${tags
        .map((tag) => chip(tag, writingListUrl(lang, { tag }), filters.tag === tag))
        .join("")}`
    : "";

  const featured = filters.kind || filters.tag ? "" : SERIES.map((s) => featuredSeries(s, visible, lang, t)).join("");
  const body = filtered.length
    ? `<div class="sm-post-grid">${filtered.map((item) => writingCard(item, lang, t)).join("")}</div>`
    : `<p class="sm-lead">${esc(t("writing.no_results"))}</p>`;

  return `
<section class="sm-section"><div class="sm-wrap">
<div class="sm-page-head">
<div class="sm-row-between">
<div>
<p class="sm-eyebrow">${esc(t("writing.eyebrow"))}</p>
<h1 class="sm-h1">${esc(t("writing.title"))}</h1>
<p class="sm-lead">${esc(t("writing.lead"))}</p>
</div>
<a class="sm-btn sm-btn--soft sm-btn--dense" href="/writing/feed.xml">${rssArt()} ${esc(t("feed.rss"))}</a>
</div>
<nav class="sm-filters sm-filters--tabs" aria-label="${esc(t("writing.filter.label"))}">${chips}</nav>
</div>
<p class="sm-muted sm-filters__count">${esc(t("writing.count", { n: filtered.length }))}</p>
${featured}
${body}
${feedNote(writingListFeeds(t), t)}
</div></section>`;
}

/** One post / chapter page: header, the prebuilt body, previous/next for a series. */
export function writingPostBody(item, all, lang, t = makeT(lang)) {
  const original = item.lang === "de" ? t("writing.original_de") : t("writing.original_en");
  const note = item.lang !== lang ? `<p class="sm-note" role="note">${esc(original)}</p>` : "";
  const archived = item.archived ? `<p class="sm-note sm-note--archive" role="note">${esc(t("writing.archived_note"))}</p>` : "";
  const chapters = item.kind === "story" && item.series ? chaptersOf(all, item.series) : [];
  const topBack = chapters.length ? `<a class="sm-back" href="${seriesUrl(item.series, lang)}">&#8592; ${esc(seriesTitleOf(all, item.series))}</a>` : "";
  const eyebrow =
    item.kind === "story" && item.series
      ? `<p class="sm-eyebrow"><a href="${seriesUrl(item.series, lang)}">${esc(seriesTitleOf(all, item.series))}</a></p>`
      : `<p class="sm-eyebrow">${esc(kindLabel(item.kind, t))}</p>`;
  const updated = item.updated ? `<span>${esc(t("writing.updated", { date: formatDate(item.updated, lang) }))}</span>` : "";
  const archivedBadge = item.archived ? `<span class="sm-badge sm-badge--warning">${esc(t("writing.archived"))}</span>` : "";

  return `
<article class="sm-section sm-reader"><div class="sm-wrap sm-measure">
<div class="sm-page-head sm-page-head--center">
${topBack}
${eyebrow}
<h1 class="sm-h1">${esc(item.title)}</h1>
<p class="sm-post-meta"><time datetime="${esc(item.date)}">${esc(formatDate(item.date, lang))}</time> <span aria-hidden="true">${sprIdx}</span> <span>${esc(t("writing.reading_time", { minutes: item.readingMinutes }))}</span> ${updated} ${archivedBadge}</p>
${tagsHtml(item.tags, lang)}
</div>
${note}
${archived}
<div class="sm-prose" lang="${esc(item.lang)}">${item.html}</div>
<div class="sm-divider" aria-hidden="true">${twinkleArt(12, "var(--sm-accent-lavender)")}${twinkleArt(12, "var(--sm-accent-sun)")}${twinkleArt(12, "var(--sm-accent-sakura)")}</div>
${item.kind === "story" ? exportBlock(item, t) : ""}
${prevNextHtml(item, all, lang, t)}
${feedNote(writingPostFeeds(item, all, t), t)}
<p><a class="sm-btn sm-btn--soft sm-btn--dense" href="${href("/writing", lang)}">${esc(t("writing.back"))}</a></p>
</div></article>`;
}

function prevNextHtml(item, all, lang, t) {
  if (item.kind !== "story" || !item.series) return "";
  const { prev, next } = prevNext(all, item);
  if (!prev && !next) return "";
  const link = (target, cls, label) =>
    target
      ? `<a class="sm-prevnext__link ${cls}" href="${postUrl(target.slug, lang)}"><span class="sm-prevnext__label">${esc(label)}</span><span>${esc(target.title)}</span></a>`
      : "<span></span>";
  return `<nav class="sm-prevnext" aria-label="${esc(t("writing.series.nav"))}">
${link(prev, "sm-prevnext__link--prev", t("writing.prev"))}
${link(next, "sm-prevnext__link--next", t("writing.next"))}
</nav>`;
}

/** The series page: title, blurb and the chapter list (archived chapters are marked, not hidden). */
export function writingSeriesBody(series, all, lang, t = makeT(lang)) {
  const chapters = chaptersOf(all, series.slug);
  const rows = chapters
    .map(
      (c) =>
        `<li class="sm-chapters__item"><span class="sm-chapters__num" aria-hidden="true">${String(c.chapter).padStart(2, "0")}</span><a class="sm-chapters__link" href="${postUrl(c.slug, lang)}">${esc(c.title)}</a>${c.archived ? `<span class="sm-badge sm-badge--warning">${esc(t("writing.archived"))}</span>` : ""}</li>`,
    )
    .join("");
  return `
<section class="sm-section"><div class="sm-wrap sm-measure">
<div class="sm-page-head">
<p class="sm-eyebrow">${esc(t("writing.series.eyebrow"))}</p>
<h1 class="sm-h1">${esc(series.title)}</h1>
<p class="sm-lead">${esc(t("writing.series.lead", { count: chapters.length }))}</p>
</div>
<ul class="sm-chapters">${rows}</ul>
${seriesExportBlock(series, t)}
${feedNote(writingSeriesFeeds(series, t), t)}
<p><a class="sm-btn sm-btn--soft sm-btn--dense" href="${href("/writing", lang)}">${esc(t("writing.back"))}</a></p>
</div></section>`;
}

/* ---------- shell ---------- */

function navLink(item, lang, active, t) {
  // A section is "soon" while it carries no content: `/writing` as soon as the index is empty, and
  // `/music` + `/reviews` until they get their own source. The nav then dims the label and adds the
  // small sun pixel (artboard `.nav a.soon`) instead of a yellow text badge.
  const sectionReady = item.path === "/writing" && publishedWriting(WRITING).length > 0;
  const soon = item.soon && !sectionReady;
  const cur = item.path === active ? ' aria-current="page"' : "";
  // A section that is not ready yet is dimmed and carries a small sun pixel (the artboard's
  // `.nav a.soon`), not a yellow text badge — the badge stays on the home tiles where there is room.
  const cls = soon ? "sm-nav__link sm-nav__link--soon" : "sm-nav__link";
  const label = soon ? `${esc(t(item.key))} (${esc(t("nav.soon_label"))})` : esc(t(item.key));
  return `<li><a class="${cls}" href="${href(item.path, lang)}"${cur} aria-label="${label}">${esc(t(item.key))}</a></li>`;
}

function langSwitch(bare, lang, t, cls = "") {
  return `<nav class="sm-lang ${cls}" aria-label="${esc(t("lang.label"))}">${LANGS.map((l) =>
    `<a class="sm-lang__link" href="${href(bare, l)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ""} aria-label="${esc(t(`lang.${l}`))}" title="${esc(t(`lang.${l}`))}">${esc(t(`lang.${l}.short`))}</a>`).join("")}</nav>`;
}

/**
 * The round theme toggle of the artboards: the icon shows the theme that is painted, the label (read
 * by summer-theme.js into the visually hidden span, and as the accessible name) says what the click
 * does. The icon is a sibling of the label span so the bootstrap never wipes the art.
 */
function themeToggle(t, slot = "header") {
  return `<button class="sm-iconbtn sm-theme" type="button" data-summer-theme-toggle data-sm-theme-slot="${esc(slot)}" aria-pressed="false" aria-label="${esc(t("theme.switch_to_night"))}" data-label-day="${esc(t("theme.day"))}" data-label-night="${esc(t("theme.night"))}" data-aria-day="${esc(t("theme.switch_to_day"))}" data-aria-night="${esc(t("theme.switch_to_night"))}" title="${esc(t("theme.switch"))}">` +
    `<span class="sm-theme__icon sm-theme__icon--sun">${sunArt(22)}</span>` +
    `<span class="sm-theme__icon sm-theme__icon--moon">${moonArt(22)}</span>` +
    `<span class="sm-visually-hidden" data-sm-theme-label>${esc(t("theme.night"))}</span>` +
    `</button>`;
}

/** The sky panel of the home hero (artboard Main-day): sun, two clouds, ground, mascot, twinkles. */
function scene(t) {
  return `<div class="sm-scene">
${sunArt(72, "sm-scene__sun")}
${cloudArt(120, 50, "sm-drift sm-scene__cloud")}
${cloudArt(84, 34, "sm-drift--slow sm-scene__cloud sm-scene__cloud--far")}
${groundArt(96)}
<div class="sm-scene__mascot">
${mascotArt(120, "sm-bob", t("home.mascot_alt"))}
<span class="sm-scene__shadow" aria-hidden="true"></span>
</div>
${twinkleArt(15, "#ffd45e", "sm-scene__twinkle sm-scene__twinkle--a")}
${twinkleArt(10, "#ffc8dd", "sm-scene__twinkle sm-scene__twinkle--b")}
</div>`;
}

function document_(o) {
  const { lang, bare, title, desc, body } = o;
  const t = o.t;
  const hubUrl = (l, b) => `https://${SITE}${b === "/" ? `/${l}/` : `/${l}${b}`}`;
  const canonical = o.canonicalTo || hubUrl(lang, bare);
  const alt = (l) => hubUrl(l, bare);
  // hreflang only when the same page exists in both languages. A writing post carries content in one
  // language only, so its caller passes an empty list and points the canonical at the language the
  // text was written in.
  const alternates =
    o.hreflangs === undefined
      ? [
          { hreflang: "de", href: alt("de") },
          { hreflang: "en", href: alt("en") },
          { hreflang: "x-default", href: `https://${SITE}${bare === "/" ? "/" : bare}` },
        ]
      : o.hreflangs;
  const hreflangTags = alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`).join("");
  // Feed autodiscovery (plan §8 "Feeds"): every hub page points at the writing feeds, a writing page
  // at the feed(s) it belongs to (its kind, plus the series for a chapter).
  const feedTags = (o.feeds === undefined ? writingListFeeds(t) : o.feeds)
    .map((f) => `<link rel="alternate" type="${FEED_MIME[f.format]}" title="${esc(f.title)}" href="${esc(f.href)}">`)
    .join("");
  // The print helper is an external file (never an inline handler), loaded only where a print button
  // exists — story chapters and series pages.
  const printScript = o.print ? `<script src="/design/summer-print.js" defer></script>` : "";
  return `<!doctype html><html lang="${lang}" class="sm-root"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta name="theme-color" content="#9ad8ff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#10172e" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${canonical}">
${hreflangTags}
${feedTags}
<link rel="preload" href="/design/fonts/pixelify-sans-latin-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/design/fonts/nunito-latin-400.woff2" as="font" type="font/woff2" crossorigin>
<script src="/design/summer-theme.js"></script><link rel="stylesheet" href="/design/summer.css?v=${AV}">${printScript}
</head><body class="sm-shell">
<a class="sm-skip-link" href="#main">${esc(t("skip"))}</a>
<header class="sm-nav"><div class="sm-wrap"><div class="sm-hdr">
<a class="sm-brand" href="${href("/", lang)}">${brandMark()}<span class="sm-brand__name">${esc(t("site.name"))}</span></a>
<nav class="sm-nav__nav" aria-label="${esc(t("nav.label"))}"><ul class="sm-nav__links">${NAV.map((n) => navLink(n, lang, bare, t)).join("")}</ul></nav>
<div class="sm-hdr__tools">${langSwitch(bare, lang, t)}${themeToggle(t)}</div>
</div></div></header>
<main id="main">${body}</main>
<footer class="sm-footer">
${grassline()}
<div class="sm-wrap sm-footer__in">
<span class="sm-footer__brand">${esc(t("site.name"))}</span>
<ul class="sm-footer__links">
<li>${ext(GITHUB_URL, "GitHub", "sm-nav__link")}</li>
<li>${ext(X_URL, "X (@NwebNotFound)", "sm-nav__link")}</li>
<li><a class="sm-nav__link" href="https://${MC_HOST}/">${esc(t("nav.minecraft"))}</a></li>
<li><a class="sm-nav__link" href="/guestbook">${esc(t("footer.guestbook"))}</a></li>
<li><a class="sm-nav__link" href="/portfolio">${esc(t("footer.projects"))}</a></li>
</ul>
</div>
<div class="sm-wrap sm-footer__bottom">
<p class="sm-footer__note">${esc(t("footer.rights", { year: new Date().getUTCFullYear() }))} · ${esc(t("footer.built"))} · ${esc(t("footer.privacy_note"))}</p>
<div class="sm-footer__tools">${langSwitch(bare, lang, t)}${themeToggle(t, "footer")}</div>
</div>
</footer></body></html>`;
}

/* ---------- other pages ---------- */

function tile({ href_, iconKey, tone, title, text, badge, cta, ctaMuted, external, wide }) {
  const inner = `<h2 class="sm-h3">${esc(title)}</h2><p class="sm-tile__text">${esc(text)}</p>` +
    `<span class="sm-tile__cta${ctaMuted ? " sm-tile__cta--muted" : ""}">${esc(cta)}${ctaMuted ? "" : ` ${ctaArrow}`}</span>`;
  const cls = `sm-card sm-card--link sm-tile${wide ? " sm-tile--wide" : ""}${badge ? " sm-tile--soon" : ""} sm-rise`;
  const head = `<div class="sm-tile__head"><span class="sm-tile__icon sm-tile__icon--${tone}">${tileIcon(iconKey)}</span>${badge || ""}</div>`;
  if (external) return `<a class="${cls}" href="${esc(href_)}" target="_blank" rel="noopener noreferrer">${head}${inner}</a>`;
  return `<a class="${cls}" href="${href_}">${head}${inner}</a>`;
}

function homeBody(t, lang) {
  const soon = `<span class="sm-badge sm-badge--sun"><span class="sm-badge__dot"></span>${esc(t("nav.soon"))}</span>`;
  return `
<section class="sm-hero"><div class="sm-wrap sm-hero__inner">
<div class="sm-hero__text">
<span class="sm-badge sm-badge--live sm-rise"><span class="sm-badge__dot"></span>${esc(t("home.eyebrow"))}</span>
<h1 class="sm-display sm-rise">${esc(t("home.title"))}<br><span class="sm-display__soft">${esc(t("home.title2"))}</span></h1>
<p class="sm-lead sm-rise">${esc(t("home.lead"))}</p>
<p class="sm-hero__cta sm-rise"><a class="sm-btn" href="${href("/portfolio", lang)}">${esc(t("tile.portfolio.title"))} ${arrow}</a><a class="sm-btn sm-btn--soft" href="https://${MC_HOST}/">${esc(t("tile.minecraft.cta"))}</a></p>
</div>
<div class="sm-hero__art sm-rise">${scene(t)}</div>
</div></section>
<section class="sm-section"><div class="sm-wrap">
<div class="sm-row-between">
<h2 class="sm-h2">${esc(t("home.sections_title"))}</h2>
<p class="sm-lead">${esc(t("home.sections_lead"))}</p>
</div>
<div class="sm-tiles">
${tile({ href_: `https://${MC_HOST}/`, iconKey: "minecraft", tone: "grass", title: t("tile.minecraft.title"), text: t("tile.minecraft.text"), cta: t("tile.minecraft.cta"), external: true, wide: true })}
${tile({ href_: href("/about", lang), iconKey: "about", tone: "sakura", title: t("tile.about.title"), text: t("tile.about.text"), cta: t("tile.cta.more") })}
${tile({ href_: href("/music", lang), iconKey: "music", tone: "ramune", title: t("tile.music.title"), text: t("tile.music.text"), badge: soon, cta: t("tile.cta.soon"), ctaMuted: true })}
${tile({ href_: href("/writing", lang), iconKey: "writing", tone: "lavender", title: t("tile.writing.title"), text: t("tile.writing.text"), badge: soon, cta: t("tile.cta.soon"), ctaMuted: true })}
${tile({ href_: href("/reviews", lang), iconKey: "reviews", tone: "sun", title: t("tile.reviews.title"), text: t("tile.reviews.text"), badge: soon, cta: t("tile.cta.soon"), ctaMuted: true })}
${tile({ href_: "/guestbook", iconKey: "guestbook", tone: "peach", title: t("tile.guestbook.title"), text: t("tile.guestbook.text"), cta: t("tile.cta.more") })}
${tile({ href_: href("/portfolio", lang), iconKey: "projects", tone: "surface", title: t("tile.portfolio.title"), text: t("tile.portfolio.text"), cta: t("tile.cta.more"), wide: true })}
</div>
</div></section>`;
}

function aboutBody(t, lang) {
  // Pastel chips for the four sections the hub offers. No `sm-badge--sun` here: that tint marks a
  // "soon" section, and /about is not an empty state (kept as an assertion in scripts/hub-unit.mjs).
  const chips = ["nav.minecraft", "nav.writing", "nav.music", "nav.reviews"]
    .map((k, i) => `<span class="sm-badge sm-badge--${["ramune", "sakura", "lavender", "peach"][i]}">${esc(t(k))}</span>`)
    .join("");
  return `
<section class="sm-section"><div class="sm-wrap">
<div class="sm-page-head">
<p class="sm-eyebrow">${esc(t("about.eyebrow"))}</p>
<h1 class="sm-h1">${esc(t("about.title"))}</h1>
<p class="sm-lead">${esc(t("about.lead"))}</p>
</div>
<div class="sm-about">
<aside class="sm-panel sm-about__aside sm-rise">
<div class="sm-portrait">
${mascotArt(110, "sm-bob", t("home.mascot_alt"))}
<svg class="sm-px-icon sm-portrait__ground" height="28" viewBox="0 0 40 4" preserveAspectRatio="none" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><rect x="0" y="1" width="40" height="3" fill="var(--sm-accent-grass)"></rect><rect x="8" y="0" width="10" height="1" fill="var(--sm-accent-grass)"></rect></svg>
</div>
<div>
<p class="sm-h3">Nils Weberruß</p>
<p class="sm-muted sm-small">${esc(t("about.role"))}</p>
</div>
<div class="sm-row sm-row--center">${chips}</div>
<div class="sm-row sm-row--center">${ext(GITHUB_URL, "GitHub", "sm-btn sm-btn--soft sm-btn--dense")}${ext(X_URL, "X (@NwebNotFound)", "sm-btn sm-btn--soft sm-btn--dense")}</div>
</aside>
<div class="sm-about__body sm-rise">
<div class="sm-panel">
<h2 class="sm-h2">${esc(t("about.intro_title"))}</h2>
<p class="sm-prose">${esc(t("about.intro_p1"))}</p>
<p class="sm-prose">${esc(t("about.intro_p2"))}</p>
<span class="sm-badge sm-badge--warning">${esc(t("about.placeholder_badge"))}</span>
<p class="sm-hint">${esc(t("about.placeholder_note"))}</p>
</div>
<div class="sm-panel">
<h2 class="sm-h2">${esc(t("about.links_title"))}</h2>
<p class="sm-lead">${esc(t("about.links_lead"))}</p>
<p class="sm-row">${ext(GITHUB_URL, "GitHub", "sm-btn sm-btn--soft sm-btn--dense")}${ext(X_URL, "X (@NwebNotFound)", "sm-btn sm-btn--soft sm-btn--dense")}</p>
<p class="sm-hint">${esc(t("about.external_note"))}</p>
</div>
<div class="sm-panel sm-panel--tint sm-row-between">
<p class="sm-h4">${esc(t("about.projects_lead"))}</p>
<a class="sm-btn" href="${href("/portfolio", lang)}">${esc(t("about.projects_link"))} ${arrow}</a>
</div>
</div>
</div>
</div></section>`;
}

function soonBody(t, lang, bare) {
  const section = SOON[bare];
  return `
<section class="sm-section"><div class="sm-wrap sm-measure sm-soon">
<div class="sm-soon__art sm-rise">${mascotHammer(160, t("soon.art_alt", { section: t(`nav.${section}`) }))}</div>
<p class="sm-eyebrow">${esc(t("soon.eyebrow"))}</p>
<h1 class="sm-h1">${esc(t("soon.title", { section: t(`nav.${section}`) }))}</h1>
<p class="sm-lead">${esc(t(`soon.${section}_text`))}</p>
<p class="sm-kaomoji">(◕‿◕)</p>
<p class="sm-row sm-row--center"><a class="sm-btn" href="${href("/", lang)}">${esc(t("soon.back"))}</a><a class="sm-btn sm-btn--soft" href="${href("/writing", lang)}">${esc(t("nav.writing"))} ${arrow}</a></p>
</div></section>`;
}

/* ---------- routing ---------- */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Resolve a language-less path to a writing route, or null when the hub does not own it. */
function writingRoute(bare) {
  if (bare === "/writing" || bare === "/writing/") return { type: "list" };
  if (bare.startsWith("/writing/series/")) {
    const slug = bare.slice("/writing/series/".length);
    return SLUG.test(slug) ? { type: "series", series: slug } : null;
  }
  if (bare.startsWith("/writing/")) {
    const slug = bare.slice("/writing/".length);
    return SLUG.test(slug) ? { type: "post", slug } : null;
  }
  return null;
}

const queryFilters = (query) => {
  const get = (k) => (query && typeof query.get === "function" ? query.get(k) : null);
  const kind = get("kind");
  const tag = get("tag");
  return {
    kind: kind === "story" || kind === "blog" ? kind : "",
    tag: tag && tag.length <= 64 ? tag : "",
  };
};

/** Full document for the `/writing` list (newest first, filterable). Empty → the mascot empty state. */
export function writingListPage(all, lang, filters = {}, t = makeT(lang)) {
  const hasContent = publishedWriting(all).length > 0;
  return document_({
    lang,
    bare: "/writing",
    t,
    title: hasContent ? t("meta.writing.list.title") : t("meta.writing.title"),
    desc: hasContent ? t("meta.writing.list.desc") : t("meta.writing.desc"),
    body: writingListBody(all, lang, filters, t),
    feeds: writingListFeeds(t),
  });
}

/**
 * Full document for one post / chapter. The content exists in a single language (`item.lang`), so the
 * page carries no `hreflang` alternates and the canonical points at the original-language URL.
 */
export function writingPostPage(item, all, lang, t = makeT(lang)) {
  return document_({
    lang,
    bare: `/writing/${item.slug}`,
    t,
    title: `${item.title} · NwebNotFound`,
    desc: excerpt(item, htmlToText),
    body: writingPostBody(item, all, lang, t),
    canonicalTo: `https://${SITE}${withLang(`/writing/${item.slug}`, item.lang)}`,
    hreflangs: [],
    feeds: writingPostFeeds(item, all, t),
    print: item.kind === "story",
  });
}

/** Full document for a series page (the chapter list is the same in both UI languages). */
export function writingSeriesPage(series, all, lang, t = makeT(lang)) {
  return document_({
    lang,
    bare: `/writing/series/${series.slug}`,
    t,
    title: `${series.title} · ${t("nav.writing")} · NwebNotFound`,
    desc: t("meta.writing.series.desc", { series: series.title }),
    body: writingSeriesBody(series, all, lang, t),
    feeds: writingSeriesFeeds(series, t),
    print: true,
  });
}

/**
 * Render a hub page. `bare` is the path without a language prefix (`/`, `/about`, `/music`, …).
 * `opts.query` is the request's URLSearchParams (writing list filters).
 * Returns `null` for a path the hub does not own, so the caller can keep the legacy routing.
 */
export function hubPage(bare, lang, opts = {}) {
  const t = makeT(lang);
  const route = writingRoute(bare);
  if (route) {
    if (route.type === "list") return writingListPage(WRITING, lang, queryFilters(opts.query), t);
    if (route.type === "post") {
      const item = findWriting(WRITING, route.slug);
      return item ? writingPostPage(item, WRITING, lang, t) : null;
    }
    const series = SERIES.find((s) => s.slug === route.series);
    if (!series || !chaptersOf(WRITING, series.slug).length) return null;
    return writingSeriesPage(series, WRITING, lang, t);
  }

  const meta = META[bare];
  if (!meta) return null;
  const body = bare === "/" ? homeBody(t, lang) : bare === "/about" ? aboutBody(t, lang) : soonBody(t, lang, bare);
  return document_({ lang, bare, t, title: t(meta[0]), desc: t(meta[1]), body });
}

export const hubPageExists = (bare) => Object.prototype.hasOwnProperty.call(META, bare) || writingRoute(bare) !== null;
