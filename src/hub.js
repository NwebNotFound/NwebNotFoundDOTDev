// Creative Hub shell (docs/creative-hub-plan.md §3, §8; DESIGN.md §11). Since fix/nwebos-no-optout only the shell is
// left (sitePage for the blog pages, navReady for the account pages); every page of the site is an NwebOS window.
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
import { publishedWriting } from "./content.js";
import { FEED_MIME } from "./feed.js";
import { mainNav, mainItems, UNAV_HEAD } from "./unav.js";

export const SITE = "nwebnotfound.dev";
export const MC_HOST = "mc.nwebnotfound.dev";
export const GITHUB_URL = "https://github.com/NwebNotFound";
export const X_URL = "https://x.com/NwebNotFound";

// The generated content index (scripts/build-content.mjs). Empty until Nils publishes something.
const WRITING = CONTENT.writing || [];

// Sections that only enter the nav once they have content (Nils, 05.11.: hide Musik/Texte until
// their pages exist). `/writing` is ready as soon as one text is published; `/music` has no source yet.
// Sections with a page but maybe no content yet: in the nav they are "bald" until ready (nav v2).
export const navReady = () => ({ music: false, blog: false, writing: publishedWriting(WRITING).length > 0 });

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** External link: a normal link with `rel="noopener noreferrer"`, never a widget or an embed. */
const ext = (url, text, cls = "") => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
/** The artboard arrow inside a button or a CTA line. */
const arrow = `<span class="sm-btn__arrow" aria-hidden="true">&#8594;</span>`;

const href = (path, lang) => withLang(path, lang);

/* ---------- pixel art (inline SVG, whole-pixel grid, crispEdges) ---------- */


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
  `<svg class="sm-px-icon" height="${h}" viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
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

/* ---------- numbers ---------- */

const NUM_LOCALE = { de: "de-DE", en: "en-GB" };

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

/* ---------- shell ---------- */

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

/**
 * The star field of the night artboard (Main-night): eight pixel stars with staggered twinkles,
 * stretched over the panel. Only visible at night (`.sm-scene__stars`), day keeps the sun.
 */
const starDots = [
  [12, 10, 2, "#ffffff", ""],
  [34, 22, 1, "#ffffff", "sm-twinkle--d2"],
  [58, 8, 2, "#ffd45e", "sm-twinkle--d4"],
  [80, 30, 1, "#ffffff", "sm-twinkle--d1"],
  [22, 40, 1, "#ffffff", "sm-twinkle--d5"],
  [70, 18, 1, "#c9b8ff", "sm-twinkle--d3"],
  [46, 34, 1, "#ffffff", "sm-twinkle--d3"],
  [92, 12, 1, "#ffc8dd", "sm-twinkle--d1"],
];
const starField = () =>
  `<svg class="sm-px-icon" viewBox="0 0 120 76" preserveAspectRatio="none" aria-hidden="true" focusable="false" shape-rendering="crispEdges">` +
  starDots
    .map(([x, y, s, fill, cls]) => `<rect class="${cls}" x="${x}" y="${y}" width="${s}" height="${s}" fill="${fill}"></rect>`)
    .join("") +
  `</svg>`;

/**
 * The sky panel of the home hero (artboard Main-day / Main-night): sun by day, moon and stars by
 * night, two clouds, ground, mascot, twinkles. Each layer sits in its own wrapper so the parallax
 * (scroll-driven CSS or the mouse helper) can move the wrapper while the art keeps its own
 * bob/drift animation.
 */
function scene(t) {
  return `<div class="sm-scene" data-sm-parallax>
<span class="sm-layer sm-parallax sm-parallax--slow sm-scene__stars" aria-hidden="true">${starField()}</span>
<span class="sm-layer sm-parallax sm-parallax--slow sm-scene__sun">${sunArt(72)}</span>
<span class="sm-layer sm-parallax sm-parallax--slow sm-scene__moon">${moonArt(64)}</span>
<span class="sm-layer sm-parallax sm-parallax--mid sm-scene__cloud">${cloudArt(120, 50)}</span>
<span class="sm-layer sm-parallax sm-parallax--mid sm-scene__cloud sm-scene__cloud--far">${cloudArt(84, 34, "sm-drift--slow")}</span>
<span class="sm-layer sm-parallax sm-scene__ground-wrap">${groundArt(96)}</span>
<span class="sm-layer sm-parallax sm-scene__mascot">
${mascotArt(120, "sm-bob", t("home.mascot_alt"))}
<span class="sm-scene__shadow" aria-hidden="true"></span>
</span>
<span class="sm-layer sm-parallax sm-parallax--slow sm-scene__twinkle sm-scene__twinkle--a">${twinkleArt(15, "#ffd45e")}</span>
<span class="sm-layer sm-parallax sm-parallax--slow sm-scene__twinkle sm-scene__twinkle--b">${twinkleArt(10, "#ffc8dd")}</span>
</div>`;
}

/**
 * The "Aa" control of the chapter pages (artboard Story.html puts it in the header). One button that
 * cycles small → normal → large; the size is written to localStorage by /design/summer-reader.js
 * (external file, no inline JS). Without the script the button does nothing and the prose stays at
 * the artboard size, so the page never depends on JavaScript.
 */
function readingSizeControl(t) {
  return `<button class="sm-btn sm-btn--soft sm-btn--dense sm-reader-size" type="button" data-sm-reading-size data-size="normal"` +
    ` aria-label="${esc(t("reading.size.button", { size: t("reading.size.normal") }))}"` +
    ` data-label="${esc(t("reading.size.button", { size: "{size}" }))}"` +
    ` data-size-small="${esc(t("reading.size.small"))}" data-size-normal="${esc(t("reading.size.normal"))}" data-size-large="${esc(t("reading.size.large"))}">` +
    `<span class="sm-reader-size__aa" aria-hidden="true">Aa</span></button>`;
}

/** The shared bar of both sites (src/unav.js) with the hub's links, language and theme. */
function hubNav(lang, bare, t, extra) {
  const cur = bare === "/" ? "start" : bare.split("/")[1];
  const items = mainItems(lang, cur, (p) => href(p, lang), navReady());
  return mainNav({ lang, items, langHrefs: { de: href(bare, "de"), en: href(bare, "en") }, brandHref: href("/", lang), extra });
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
  // exists — story chapters and series pages. The parallax helper is a small external file too, and
  // only the page that has a hero scene loads it.
  const printScript = o.print ? `<script src="/design/summer-print.js?v=${AV}" defer></script>` : "";
  const homeAssets = o.home ? `<link rel="stylesheet" href="/design/home.css?v=${AV}"><script src="/design/home.js?v=${AV}" defer></script>` : "";
  const parallaxScript = o.parallax ? `<script src="/design/summer-parallax.js?v=${AV}" defer></script>` : "";
  const readerScript = o.reading ? `<script src="/design/summer-reader.js?v=${AV}" defer></script>` : "";
  // Reading progress: a lavender 4px line pinned above the header, driven by scroll position
  // (artboard Story.html). Purely visual — it duplicates the scrollbar, so it is hidden from the
  // accessibility tree instead of announcing a value that only exists once the script runs.
  const progressBar = o.reading ? `<div class="sm-progress" data-sm-progress aria-hidden="true"><span class="sm-progress__bar"></span></div>` : "";
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
<script src="/design/summer-theme.js?v=${AV}"></script><link rel="stylesheet" href="/design/summer.css?v=${AV}">${UNAV_HEAD}${printScript}${parallaxScript}${readerScript}${homeAssets}${o.head || ""}
</head><body class="sm-shell">
${progressBar}
<a class="sm-skip-link" href="#main">${esc(t("skip"))}</a>
${hubNav(lang, bare, t, o.reading ? readingSizeControl(t) : "")}
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

/** A hub-shell page with a caller-made body (the private /profile): same header, footer and tokens. */
export function sitePage({ lang = "de", bare, title, desc, body, head = "", canonicalTo, hreflangs }) {
  const t = makeT(lang);
  return document_({ lang, bare, t, title, desc, body, head, hreflangs: hreflangs || [], canonicalTo: canonicalTo || `https://${SITE}${bare}` });
}