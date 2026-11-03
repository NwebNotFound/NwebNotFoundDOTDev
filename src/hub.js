// Creative Hub shell and pages (docs/creative-hub-plan.md §3, §8; DESIGN.md §11).
//
// The hub lives on nwebnotfound.dev (the Minecraft surface on mc.nwebnotfound.dev is untouched) and
// renders server-side from this one Worker. Everything here is a string builder:
//   - no framework, no build step, no runtime Markdown parsing (writing bodies come prebuilt from
//     src/generated/content.js, produced by scripts/build-content.mjs),
//   - only the Phase 1 assets: public/design/summer.css (`.sm-*`), public/design/summer-theme.js,
//     the placeholder sprites in public/design/summer-sprites.svg and the self-hosted SmPixel/SmBody
//     woff2 files. No remote font, no CDN, no tracker, no inline event handler,
//   - interface text comes from src/i18n/{de,en}.js via `t()`, so a missing key falls back to the
//     other language instead of rendering `undefined`,
//   - `/de/…` and `/en/…` are the canonical URLs, `hreflang` and `<html lang>` follow the language,
//     and the unprefixed paths keep working (the language came from the cookie or Accept-Language).
import { AV } from "./asset-version.js";
import { LANGS, makeT, withLang } from "./i18n/index.js";
import { CONTENT } from "./generated/content.js";
import { allTags, byNewest, chaptersOf, excerpt, filterWriting, findWriting, prevNext, publishedWriting } from "./content.js";
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

/** Same-origin sprite reference from the Phase 1 placeholder sheet. */
const icon = (id, cls = "sm-icon") => `<svg class="${cls}" width="24" height="24" aria-hidden="true" focusable="false"><use href="/design/summer-sprites.svg#${id}"></use></svg>`;

/** External link: a normal link with `rel="noopener noreferrer"`, never a widget or an embed. */
const ext = (url, text, cls = "") => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

const sprIdx = `&#8250;`; // ›

const href = (path, lang) => withLang(path, lang);

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
// there is exactly one URL per feed (`/writing/feed.xml`, not `/de/writing/feed.xml`).
const feedLinks = (base, title, label) => [
  { format: "rss", href: `${base}/feed.xml`, title },
  { format: "atom", href: `${base}/atom.xml`, title: label },
];

/** Autodiscovery links for the `/writing` list (the whole writing feed). */
export const writingListFeeds = (t) => feedLinks("/writing", t("feed.title"), t("feed.title"));

/** Autodiscovery links for one post: its kind feed, plus the series feed for a story chapter. */
export function writingPostFeeds(item, all, t) {
  const kind = item.kind === "story" ? "/writing/stories" : "/writing/blog";
  const kindTitle = t(item.kind === "story" ? "feed.title.stories" : "feed.title.blog");
  const feeds = feedLinks(kind, kindTitle, kindTitle);
  if (item.kind === "story" && item.series) {
    const title = t("feed.title.series", { series: seriesTitleOf(all, item.series) });
    feeds.push(...feedLinks(`/writing/series/${item.series}`, title, title));
  }
  return feeds;
}

/** Autodiscovery links for a series page. */
export function writingSeriesFeeds(series, t) {
  const title = t("feed.title.series", { series: series.title });
  return feedLinks(`/writing/series/${series.slug}`, title, title);
}

/** The visible footnote: which feeds this page belongs to, so a reader can subscribe. */
function feedNote(feeds, t) {
  if (!feeds || !feeds.length) return "";
  const links = feeds
    .map((f) => `<a class="sm-feed-note__link" href="${esc(f.href)}">${esc(t(f.format === "rss" ? "feed.rss" : "feed.atom"))}</a>`)
    .join(`<span class="sm-feed-note__sep" aria-hidden="true"> · </span>`);
  return `<p class="sm-feed-note">${esc(t("writing.feed.note"))} ${links}</p>`;
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

  const body = filtered.length
    ? `<div class="sm-post-grid">${filtered.map((item) => writingCard(item, lang, t)).join("")}</div>`
    : `<p class="sm-lead">${esc(t("writing.no_results"))}</p>`;

  return `
<section class="sm-section"><div class="sm-wrap">
<p class="sm-eyebrow">${esc(t("writing.eyebrow"))}</p>
<h1 class="sm-h1">${esc(t("writing.title"))}</h1>
<p class="sm-lead">${esc(t("writing.lead"))}</p>
<nav class="sm-filters" aria-label="${esc(t("writing.filter.label"))}">${chips}${tagChips}</nav>
<p class="sm-muted sm-filters__count">${esc(t("writing.count", { n: filtered.length }))}</p>
${body}
${feedNote(writingListFeeds(t), t)}
</div></section>`;
}

/** One post / chapter page: header, the prebuilt body, previous/next for a series. */
export function writingPostBody(item, all, lang, t = makeT(lang)) {
  const original = item.lang === "de" ? t("writing.original_de") : t("writing.original_en");
  const note = item.lang !== lang ? `<p class="sm-note" role="note">${esc(original)}</p>` : "";
  const archived = item.archived ? `<p class="sm-note sm-note--archive" role="note">${esc(t("writing.archived_note"))}</p>` : "";
  const eyebrow =
    item.kind === "story" && item.series
      ? `<p class="sm-eyebrow"><a href="${seriesUrl(item.series, lang)}">${esc(seriesTitleOf(all, item.series))}</a></p>`
      : `<p class="sm-eyebrow">${esc(kindLabel(item.kind, t))}</p>`;
  const updated = item.updated ? `<span>${esc(t("writing.updated", { date: formatDate(item.updated, lang) }))}</span>` : "";
  const archivedBadge = item.archived ? `<span class="sm-badge sm-badge--warning">${esc(t("writing.archived"))}</span>` : "";

  return `
<article class="sm-section sm-reader"><div class="sm-wrap">
<header class="sm-post-header">
${eyebrow}
<h1 class="sm-h1">${esc(item.title)}</h1>
<p class="sm-post-meta"><time datetime="${esc(item.date)}">${esc(formatDate(item.date, lang))}</time> <span aria-hidden="true">${sprIdx}</span> <span>${esc(t("writing.reading_time", { minutes: item.readingMinutes }))}</span> ${updated} ${archivedBadge}</p>
${tagsHtml(item.tags, lang)}
</header>
${note}
${archived}
<div class="sm-prose" lang="${esc(item.lang)}">${item.html}</div>
${prevNextHtml(item, all, lang, t)}
${feedNote(writingPostFeeds(item, all, t), t)}
<p><a class="sm-btn sm-btn--ghost" href="${href("/writing", lang)}">${esc(t("writing.back"))}</a></p>
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
<p class="sm-eyebrow">${esc(t("writing.series.eyebrow"))}</p>
<h1 class="sm-h1">${esc(series.title)}</h1>
<p class="sm-lead">${esc(t("writing.series.lead", { count: chapters.length }))}</p>
<ul class="sm-chapters">${rows}</ul>
${feedNote(writingSeriesFeeds(series, t), t)}
<p><a class="sm-btn sm-btn--ghost" href="${href("/writing", lang)}">${esc(t("writing.back"))}</a></p>
</div></section>`;
}

/* ---------- shell ---------- */

function navLink(item, lang, active, t) {
  const hasContent = item.path !== "/writing" || publishedWriting(WRITING).length > 0;
  const soon = item.soon && !hasContent;
  const cur = item.path === active ? ' aria-current="page"' : "";
  const badge = soon ? ` <span class="sm-badge sm-badge--sun">${esc(t("nav.soon"))}</span>` : "";
  const label = soon ? `${esc(t(item.key))} (${esc(t("nav.soon_label"))})` : esc(t(item.key));
  return `<li><a class="sm-nav__link" href="${href(item.path, lang)}"${cur} aria-label="${label}">${esc(t(item.key))}${badge}</a></li>`;
}

function langSwitch(bare, lang, t, cls = "") {
  return `<nav class="sm-lang ${cls}" aria-label="${esc(t("lang.label"))}">${LANGS.map((l) =>
    `<a class="sm-lang__link" href="${href(bare, l)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ""} aria-label="${esc(t(`lang.${l}`))}" title="${esc(t(`lang.${l}`))}">${esc(t(`lang.${l}.short`))}</a>`).join("")}</nav>`;
}

function themeToggle(t, extra = "") {
  return `<button class="sm-btn sm-btn--ghost sm-btn--dense sm-theme" type="button" data-summer-theme-toggle aria-pressed="false" data-label-day="${esc(t("theme.day"))}" data-label-night="${esc(t("theme.night"))}" title="${esc(t("theme.switch"))}"${extra}>${esc(t("theme.night"))}</button>`;
}

function mascot(t, cls) {
  return `<span class="sm-mascot sm-mascot--placeholder ${cls}">${icon("sm-mascot-placeholder", "sm-mascot__art")}</span>`;
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
  return `<!doctype html><html lang="${lang}" class="sm-root"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta name="theme-color" content="#8fd3ff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141b33" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${canonical}">
${hreflangTags}
${feedTags}
<link rel="preload" href="/design/fonts/pixelify-sans-latin-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/design/fonts/nunito-latin-400.woff2" as="font" type="font/woff2" crossorigin>
<script src="/design/summer-theme.js"></script><link rel="stylesheet" href="/design/summer.css?v=${AV}">
</head><body class="sm-shell">
<a class="sm-skip-link" href="#main">${esc(t("skip"))}</a>
<header class="sm-nav"><div class="sm-wrap sm-nav__inner">
<a class="sm-brand" href="${href("/", lang)}">${mascot(t, "sm-mascot--brand")}<span class="sm-brand__name">${esc(t("site.name"))}</span></a>
<nav class="sm-nav__nav" aria-label="${esc(t("nav.label"))}"><ul class="sm-nav__links">${NAV.map((n) => navLink(n, lang, bare, t)).join("")}</ul></nav>
<div class="sm-nav__tools">${langSwitch(bare, lang, t)}${themeToggle(t)}</div>
</div></header>
<main id="main">${body}</main>
<footer class="sm-footer"><div class="sm-wrap sm-footer__grid">
<div class="sm-footer__col"><p class="sm-footer__title">${esc(t("footer.nav_title"))}</p><ul class="sm-footer__list">${NAV.map((n) => `<li><a href="${href(n.path, lang)}">${esc(t(n.key))}</a></li>`).join("")}</ul></div>
<div class="sm-footer__col"><p class="sm-footer__title">${esc(t("footer.links_title"))}</p><ul class="sm-footer__list">
<li>${ext(GITHUB_URL, "GitHub")}</li><li>${ext(X_URL, "X (@NwebNotFound)")}</li>
<li><a href="https://${MC_HOST}/">${esc(t("nav.minecraft"))}</a></li>
<li><a href="/guestbook">${esc(t("footer.guestbook"))}</a></li><li><a href="/portfolio">${esc(t("footer.projects"))}</a></li>
</ul></div>
<div class="sm-footer__col"><p class="sm-footer__title">${esc(t("footer.settings_title"))}</p>${langSwitch(bare, lang, t)}${themeToggle(t, ' data-summer-theme-toggle="footer"')}</div>
</div>
<div class="sm-wrap sm-footer__bottom"><span>${esc(t("footer.rights", { year: new Date().getUTCFullYear() }))}</span><span class="sm-muted">${esc(t("footer.built"))}</span><span class="sm-muted">${esc(t("footer.privacy_note"))}</span></div>
</footer></body></html>`;
}

/* ---------- other pages ---------- */

function tile({ href_, title, text, badge, cta, external }) {
  const inner = `<h2 class="sm-card__title">${esc(title)}</h2><p class="sm-tile__text">${esc(text)}</p><span class="sm-tile__cta">${esc(cta)} ${sprIdx}</span>`;
  const cls = `sm-card sm-card--link sm-tile${badge ? " sm-tile--soon" : ""}`;
  if (external) return `<a class="${cls}" href="${esc(href_)}" target="_blank" rel="noopener noreferrer">${badge}${inner}</a>`;
  return `<a class="${cls}" href="${href_}">${badge}${inner}</a>`;
}

function homeBody(t, lang) {
  const soon = `<span class="sm-badge sm-badge--sun">${esc(t("nav.soon"))}</span>`;
  return `
<section class="sm-hero sm-sky"><div class="sm-wrap sm-hero__inner">
${mascot(t, "sm-mascot--xl")}
<p class="sm-eyebrow">${esc(t("home.eyebrow"))}</p>
<h1 class="sm-display">${esc(t("home.title"))}<br><span class="sm-display__soft">${esc(t("home.title2"))}</span></h1>
<p class="sm-lead">${esc(t("home.lead"))}</p>
<p class="sm-row sm-hero__cta"><a class="sm-btn" href="${href("/portfolio", lang)}">${esc(t("tile.portfolio.title"))}</a><a class="sm-btn sm-btn--ghost" href="https://${MC_HOST}/">${esc(t("tile.minecraft.cta"))}</a></p>
<p class="sm-muted sm-hero__note">${esc(t("home.placeholder_note"))}</p>
</div></section>
<section class="sm-section"><div class="sm-wrap">
<h2 class="sm-h2">${esc(t("home.sections_title"))}</h2><p class="sm-lead">${esc(t("home.sections_lead"))}</p>
<div class="sm-tiles">
${tile({ href_: `https://${MC_HOST}/`, title: t("tile.minecraft.title"), text: t("tile.minecraft.text"), badge: "", cta: t("tile.minecraft.cta"), external: true })}
${tile({ href_: href("/music", lang), title: t("tile.music.title"), text: t("tile.music.text"), badge: soon, cta: t("tile.cta.soon") })}
${tile({ href_: href("/writing", lang), title: t("tile.writing.title"), text: t("tile.writing.text"), badge: soon, cta: t("tile.cta.soon") })}
${tile({ href_: href("/reviews", lang), title: t("tile.reviews.title"), text: t("tile.reviews.text"), badge: soon, cta: t("tile.cta.soon") })}
${tile({ href_: href("/about", lang), title: t("tile.about.title"), text: t("tile.about.text"), badge: "", cta: t("tile.cta.more") })}
${tile({ href_: "/guestbook", title: t("tile.guestbook.title"), text: t("tile.guestbook.text"), badge: "", cta: t("tile.cta.more") })}
${tile({ href_: href("/portfolio", lang), title: t("tile.portfolio.title"), text: t("tile.portfolio.text"), badge: "", cta: t("tile.cta.more") })}
</div></div></section>`;
}

function aboutBody(t, lang) {
  return `
<section class="sm-section"><div class="sm-wrap sm-measure">
<p class="sm-eyebrow">${esc(t("about.eyebrow"))}</p>
<h1 class="sm-h1">${esc(t("about.title"))}</h1>
<p class="sm-lead">${esc(t("about.lead"))}</p>
<div class="sm-card sm-card--pixel sm-placeholder">
<span class="sm-badge sm-badge--warning">${esc(t("about.placeholder_badge"))}</span>
<p class="sm-placeholder__note">${esc(t("about.placeholder_note"))}</p>
</div>
<div class="sm-prose"><p>${esc(t("about.intro_p1"))}</p><p>${esc(t("about.intro_p2"))}</p></div>
<h2 class="sm-h2">${esc(t("about.links_title"))}</h2>
<p class="sm-lead">${esc(t("about.links_lead"))}</p>
<p class="sm-row">${ext(GITHUB_URL, "GitHub", "sm-btn sm-btn--ghost")}${ext(X_URL, "X (@NwebNotFound)", "sm-btn sm-btn--ghost")}<a class="sm-btn sm-btn--ghost" href="${href("/portfolio", lang)}">${esc(t("about.projects_link"))}</a></p>
<p class="sm-hint">${esc(t("about.external_note"))}</p>
</div></section>`;
}

function soonBody(t, lang, bare) {
  const section = SOON[bare];
  return `
<section class="sm-section"><div class="sm-wrap sm-measure sm-soon">
${mascot(t, "sm-mascot--xl")}
<p class="sm-eyebrow">${esc(t("soon.eyebrow"))}</p>
<h1 class="sm-h1">${esc(t("soon.title", { section: t(`nav.${section}`) }))}</h1>
<p class="sm-lead">${esc(t(`soon.${section}_text`))}</p>
<p class="sm-kaomoji">(◕‿◕)</p>
<p><a class="sm-btn sm-btn--ghost" href="${href("/", lang)}">${esc(t("soon.back"))}</a></p>
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
