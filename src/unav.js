// One navigation for nwebnotfound.dev (hub + German-only pages) and mc.nwebnotfound.dev.
// Mockup: OpenBot/Shared/NwebNotFound/mockups/fix-unified-nav. Styles: /design/unav.css, behaviour:
// /design/unav.js (external, no inline JS). The account slot is filled by unav.js from /api/me, so
// no avatar is shipped before the session is known.
import { AV } from "./asset-version.js";
import { makeT } from "./i18n/index.js";

export const MAIN_HOST = "nwebnotfound.dev";
export const MC_HOST = "mc.nwebnotfound.dev";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CHEV = `<svg class="u-chev" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 3h2v2h2v2h0V5h2V3h2v2H7v2H5v2h0V7H3V5H1z" fill="currentColor"/></svg>`;
const BURGER = `<svg class="u-bi u-bi--open" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="1" y="2" width="10" height="2" fill="currentColor"/><rect x="1" y="5" width="10" height="2" fill="currentColor"/><rect x="1" y="8" width="10" height="2" fill="currentColor"/></svg><svg class="u-bi u-bi--close" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 2h2v1h1v1h2V3h1V2h2v2H9v1H8v2h1v1h1v2H8V9H7V8H5v1H4v1H2V8h1V7h1V5H3V4H2z" fill="currentColor"/></svg>`;
// The cat mascot of the main site (same pixels as the hub brand).
export const CAT = `<svg class="px" width="28" height="28" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><rect x="2" y="1" width="3" height="3" fill="currentColor"/><rect x="11" y="1" width="3" height="3" fill="currentColor"/><rect x="1" y="3" width="14" height="11" fill="currentColor"/><rect x="2" y="4" width="12" height="9" fill="var(--sm-cream, var(--cream, #fff7e6))"/><rect x="5" y="7" width="2" height="2" fill="#1f2a44"/><rect x="9" y="7" width="2" height="2" fill="#1f2a44"/><rect x="7" y="10" width="2" height="1" fill="#1f2a44"/></svg>`;
const SUN = `<svg class="px" width="22" height="22" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="4" y="4" width="4" height="4" fill="#e2a52a"/><rect x="3" y="5" width="6" height="2" fill="#ffd45e"/><rect x="5" y="3" width="2" height="6" fill="#ffd45e"/></svg>`;
const MOON = `<svg class="px" width="22" height="22" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="4" y="1" width="4" height="1" fill="#ffd45e"/><rect x="2" y="2" width="3" height="1" fill="#ffd45e"/><rect x="1" y="3" width="3" height="6" fill="#ffd45e"/><rect x="2" y="9" width="3" height="1" fill="#ffd45e"/><rect x="4" y="10" width="4" height="1" fill="#ffd45e"/></svg>`;
const icon = (id) => `<img alt="" width="22" height="22" src="/mc-icon/v2/${id}">`;

// All labels come from the hub dictionary (src/i18n); mc.* is German only.
const labels = (lang) => {
  const t = makeT(lang);
  return { t, nav: t("nav.label"), lang: t("lang.label"), open: t("nav.menu_open"), close: t("nav.menu_close"), login: t("acct.login"), logout: t("acct.logout"), soon: t("acct.soon"), account: t("acct.label"), profile: t("acct.profile"), orders: t("acct.orders"), day: t("theme.day"), night: t("theme.night"), toDay: t("theme.switch_to_day"), toNight: t("theme.switch_to_night") };
};

export const UNAV_HEAD = `<link rel="stylesheet" href="/design/unav.css?v=${AV}"><script src="/design/unav.js?v=${AV}" defer></script>`;

function themeToggle(l) {
  return `<button class="u-ib u-theme" type="button" data-summer-theme-toggle aria-pressed="false" aria-label="${esc(l.toNight)}" data-label-day="${esc(l.day)}" data-label-night="${esc(l.night)}" data-aria-day="${esc(l.toDay)}" data-aria-night="${esc(l.toNight)}"><span class="u-ti u-ti--sun">${SUN}</span><span class="u-ti u-ti--moon">${MOON}</span><span class="u-vh" data-sm-theme-label>${esc(l.night)}</span></button>`;
}

function langSeg(lang, hrefs, l) {
  return `<nav class="u-seg" aria-label="${esc(l.lang)}">${["de", "en"].map((x) => `<a href="${esc(hrefs[x])}" hreflang="${x}" lang="${x}"${x === lang ? ' aria-current="true"' : ""}>${x.toUpperCase()}</a>`).join("")}</nav>`;
}

function shellNav({ site, lang, brand, list, tools, row, loginBase, menu }) {
  const l = labels(lang);
  const data = { login: l.login, logout: l.logout, soon: l.soon, account: l.account, open: l.open, close: l.close, menu };
  return `<header class="u-nav ${site === "mc" ? "u-mc" : "u-main sm-nav"}" data-unav data-site="${site}" data-login-base="${esc(loginBase)}" data-l="${esc(JSON.stringify(data))}"><div class="u-wrap"><div class="u-bar">
${brand}
<div class="u-panel" id="u-panel"><div class="u-me" data-u-me></div><nav class="u-nav__nav" aria-label="${esc(l.nav)}"><ul class="u-links">${list}</ul></nav><div class="u-row">${row}</div></div>
<div class="u-tools">${tools}<div class="u-acct-slot" data-u-acct></div><button class="u-ib u-burger" type="button" aria-expanded="false" aria-controls="u-panel" aria-label="${esc(l.open)}">${BURGER}</button></div>
</div></div></header>`;
}

/**
 * Main site (hub pages and the German-only pages). `items` is a list of `{ href, label, cur }`; a
 * section without a page yet is simply left out by the caller (Nils, 05.11.: hide Musik/Texte).
 */
export function mainNav({ lang = "de", items, langHrefs, brandHref = "/", extra = "" }) {
  const l = labels(lang);
  const brand = `<a class="u-brand" href="${esc(brandHref)}">${CAT}<span>NwebNotFound</span></a>`;
  const list = items.map((i) => `<li><a class="u-link" href="${esc(i.href)}"${i.cur ? ' aria-current="page"' : ""}>${esc(i.label)}</a></li>`).join("");
  const sw = `<a class="u-switch" href="https://${MC_HOST}/">${icon("grass_block")}${esc(l.t("nav.switch_mc"))}</a>`;
  const ctl = `${sw}${langSeg(lang, langHrefs, l)}${themeToggle(l)}`;
  const menu = [["/profile", l.profile, "name_tag"], [`https://${MC_HOST}/bestellungen`, l.orders, "chest"]];
  return shellNav({ site: "main", lang, brand, list, tools: ctl + extra, row: ctl, loginBase: "", menu });
}

/** The fixed link set of the main site in the order of the mockup. `cur` is one of the keys. */
export function mainItems(lang, cur, href = (p) => p) {
  const t = makeT(lang);
  return [
    { k: "start", href: href("/"), label: t("nav.home") },
    { k: "portfolio", href: "/portfolio", label: t("footer.projects") },
    { k: "guestbook", href: "/guestbook", label: t("footer.guestbook") },
    { k: "about", href: href("/about"), label: t("nav.about") },
  ].map((i) => ({ ...i, cur: i.k === cur }));
}

/** mc.* groups: `groups` is `[key, label, [[href, label, icon], …]]`. The active entry is marked by unav.js. */
export function mcNav(groups) {
  const l = labels("de");
  const brand = `<a class="u-brand" href="/">${icon("grass_block")}<span>NwebNotFound <span class="u-sub">MC</span></span></a>`;
  const list = groups.map(([k, label, links]) => `<li class="u-group" data-g="${k}"><button class="u-link u-gbtn" type="button" aria-expanded="false" aria-controls="ug-${k}">${esc(label)}${CHEV}</button><div class="u-drop" id="ug-${k}">${links.map(([h, n, i]) => `<a href="${esc(h)}">${icon(i)}${esc(n)}</a>`).join("")}</div></li>`).join("");
  const sw = `<a class="u-switch" href="https://${MAIN_HOST}/">${CAT}Hauptseite</a>`;
  const menu = [["/profile", l.profile, "name_tag"], ["/vip", "VIP", "nether_star"], ["/bestellungen", l.orders, "chest"]];
  return shellNav({ site: "mc", lang: "de", brand, list, tools: sw, row: sw, loginBase: `https://${MAIN_HOST}`, menu });
}
