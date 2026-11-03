// Creative Hub shell and pages (docs/creative-hub-plan.md §3, §8; DESIGN.md §11).
//
// The hub lives on nwebnotfound.dev (the Minecraft surface on mc.nwebnotfound.dev is untouched) and
// renders server-side from this one Worker. Everything here is a string builder:
//   - no framework, no build step, no new dependency,
//   - only the Phase 1 assets: public/design/summer.css (`.sm-*`), public/design/summer-theme.js,
//     the placeholder sprites in public/design/summer-sprites.svg and the self-hosted SmPixel/SmBody
//     woff2 files. No remote font, no CDN, no tracker, no inline event handler,
//   - interface text comes from src/i18n/{de,en}.js via `t()`, so a missing key falls back to the
//     other language instead of rendering `undefined`,
//   - `/de/…` and `/en/…` are the canonical URLs, `hreflang` and `<html lang>` follow the language,
//     and the unprefixed paths keep working (the language came from the cookie or Accept-Language).
import { AV } from "./asset-version.js";
import { LANGS, makeT, withLang } from "./i18n/index.js";

export const SITE = "nwebnotfound.dev";
export const MC_HOST = "mc.nwebnotfound.dev";
export const GITHUB_URL = "https://github.com/NwebNotFound";
export const X_URL = "https://x.com/NwebNotFound";

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
  "/writing": ["meta.writing.title", "meta.writing.desc"],
  "/reviews": ["meta.reviews.title", "meta.reviews.desc"],
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Same-origin sprite reference from the Phase 1 placeholder sheet. */
const icon = (id, cls = "sm-icon") => `<svg class="${cls}" width="24" height="24" aria-hidden="true" focusable="false"><use href="/design/summer-sprites.svg#${id}"></use></svg>`;

/** External link: a normal link with `rel="noopener noreferrer"`, never a widget or an embed. */
const ext = (url, text, cls = "") => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

const sprIdx = `&#8250;`; // ›

const href = (path, lang) => withLang(path, lang);

function navLink(item, lang, active, t) {
  const cur = item.path === active ? ' aria-current="page"' : "";
  const badge = item.soon ? ` <span class="sm-badge sm-badge--sun">${esc(t("nav.soon"))}</span>` : "";
  const label = item.soon ? `${esc(t(item.key))} (${esc(t("nav.soon_label"))})` : esc(t(item.key));
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
  const canonical = hubUrl(lang, bare);
  const alt = (l) => hubUrl(l, bare);
  const xDefault = `https://${SITE}${bare === "/" ? "/" : bare}`;
  return `<!doctype html><html lang="${lang}" class="sm-root"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta name="theme-color" content="#8fd3ff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141b33" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="de" href="${alt("de")}"><link rel="alternate" hreflang="en" href="${alt("en")}">
<link rel="alternate" hreflang="x-default" href="${xDefault}">
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

/* ---------- pages ---------- */

function tile({ href_, title, text, badge, cta, external, lang }) {
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
${tile({ href_: `https://${MC_HOST}/`, title: t("tile.minecraft.title"), text: t("tile.minecraft.text"), badge: "", cta: t("tile.minecraft.cta"), external: true, lang })}
${tile({ href_: href("/music", lang), title: t("tile.music.title"), text: t("tile.music.text"), badge: soon, cta: t("tile.cta.soon"), lang })}
${tile({ href_: href("/writing", lang), title: t("tile.writing.title"), text: t("tile.writing.text"), badge: soon, cta: t("tile.cta.soon"), lang })}
${tile({ href_: href("/reviews", lang), title: t("tile.reviews.title"), text: t("tile.reviews.text"), badge: soon, cta: t("tile.cta.soon"), lang })}
${tile({ href_: href("/about", lang), title: t("tile.about.title"), text: t("tile.about.text"), badge: "", cta: t("tile.cta.more"), lang })}
${tile({ href_: "/guestbook", title: t("tile.guestbook.title"), text: t("tile.guestbook.text"), badge: "", cta: t("tile.cta.more"), lang })}
${tile({ href_: href("/portfolio", lang), title: t("tile.portfolio.title"), text: t("tile.portfolio.text"), badge: "", cta: t("tile.cta.more"), lang })}
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

/**
 * Render a hub page. `bare` is the path without a language prefix (`/`, `/about`, `/music`, …).
 * Returns `null` for a path the hub does not own, so the caller can keep the legacy routing.
 */
export function hubPage(bare, lang) {
  const meta = META[bare];
  if (!meta) return null;
  const t = makeT(lang);
  const body = bare === "/" ? homeBody(t, lang) : bare === "/about" ? aboutBody(t, lang) : soonBody(t, lang, bare);
  return document_({ lang, bare, t, title: t(meta[0]), desc: t(meta[1]), body });
}

export const hubPageExists = (bare) => Object.prototype.hasOwnProperty.call(META, bare);