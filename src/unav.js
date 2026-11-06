// One navigation for nwebnotfound.dev (hub + German-only pages) and mc.nwebnotfound.dev.
// Nav v2, mockup OpenBot/Shared/NwebNotFound/mockups/fix-nav-v2 (Nils, 06.11.: "OK as shown").
// Styles: /design/unav.css, behaviour: /design/unav.js (external, no inline JS). The account slot is
// filled by unav.js from /api/me, so no avatar is shipped before the session is known.
// Same panel on every width: inline links on desktop, the tile drawer on phones.
import { AV } from "./asset-version.js";
import { makeT } from "./i18n/index.js";

export const MAIN_HOST = "nwebnotfound.dev";
export const MC_HOST = "mc.nwebnotfound.dev";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CHEV = `<svg class="u-chev" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 3h2v2h2v2h0V5h2V3h2v2H7v2H5v2h0V7H3V5H1z" fill="currentColor"/></svg>`;
const BURGER = `<span class="u-bi" aria-hidden="true"><i></i><i></i><i></i></span>`;
// The cat mascot of the main site (same pixels as the hub brand).
export const CAT = `<svg class="px" width="28" height="28" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><rect x="2" y="1" width="3" height="3" fill="currentColor"/><rect x="11" y="1" width="3" height="3" fill="currentColor"/><rect x="1" y="3" width="14" height="11" fill="currentColor"/><rect x="2" y="4" width="12" height="9" fill="var(--sm-cream, var(--cream, #fff7e6))"/><rect x="5" y="7" width="2" height="2" fill="#1f2a44"/><rect x="9" y="7" width="2" height="2" fill="#1f2a44"/><rect x="7" y="10" width="2" height="1" fill="#1f2a44"/></svg>`;
const SUN = `<svg class="u-sun" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="4" y="4" width="4" height="4" fill="#e2a52a"/><rect x="3" y="5" width="6" height="2" fill="#ffd45e"/><rect x="5" y="3" width="2" height="6" fill="#ffd45e"/><rect x="5" y="0" width="2" height="2" fill="#e2a52a"/><rect x="5" y="10" width="2" height="2" fill="#e2a52a"/><rect x="0" y="5" width="2" height="2" fill="#e2a52a"/><rect x="10" y="5" width="2" height="2" fill="#e2a52a"/><rect x="2" y="2" width="1" height="1" fill="#e2a52a"/><rect x="9" y="2" width="1" height="1" fill="#e2a52a"/><rect x="2" y="9" width="1" height="1" fill="#e2a52a"/><rect x="9" y="9" width="1" height="1" fill="#e2a52a"/></svg>`;
const MOON = `<svg class="u-moon" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="4" y="1" width="4" height="1" fill="#ffd45e"/><rect x="2" y="2" width="3" height="1" fill="#ffd45e"/><rect x="1" y="3" width="3" height="6" fill="#ffd45e"/><rect x="2" y="9" width="3" height="1" fill="#ffd45e"/><rect x="4" y="10" width="4" height="1" fill="#ffd45e"/><rect x="9" y="3" width="1" height="1" fill="#fff3d9"/></svg>`;
const icon = (id) => `<img alt="" width="22" height="22" loading="lazy" decoding="async" src="/mc-icon/v2/${id}">`;

// Pixel icons for the main site's tiles and "Mehr" (mockup fix-nav-v2): one cached sprite file,
// referenced with <use>, so the icons are not repeated in every page's HTML.
const px = (k) => `<svg class="u-ti" viewBox="0 0 8 8" aria-hidden="true" focusable="false"><use href="/design/nav-icons.svg?v=${AV}#i-${k}"/></svg>`;

// All labels come from the hub dictionary (src/i18n); mc.* is German only.
const labels = (lang) => {
  const t = makeT(lang);
  return { t, nav: t("nav.label"), lang: t("lang.label"), open: t("nav.menu_open"), close: t("nav.menu_close"), login: t("acct.login"), logout: t("acct.logout"), soon: t("acct.soon"), account: t("acct.label"), profile: t("acct.profile"), orders: t("acct.orders"), day: t("theme.day"), night: t("theme.night"), toDay: t("theme.switch_to_day"), toNight: t("theme.switch_to_night"), settings: t("nav.settings"), theme: t("theme.label"), more: t("nav.more") };
};

export const UNAV_JS = `<script src="/design/unav.js?v=${AV}" defer></script>`;
export const UNAV_HEAD = `<link rel="stylesheet" href="/design/unav.css?v=${AV}">${UNAV_JS}`;

// Day/night as a switch: sky track (cloud) crossfades to a night sky (stars); the knob carries
// sun -> moon. summer-theme.js keeps driving it through data-summer-theme-toggle / aria-pressed.
function themeToggle(l) {
  const stars = [[10, 9], [22, 26], [16, 17], [30, 8], [48, 30]].map(([x, y]) => `<i class="u-s${x}"></i>`).join("");
  return `<button class="u-theme" type="button" data-summer-theme-toggle aria-pressed="false" aria-label="${esc(l.toNight)}" data-label-day="${esc(l.day)}" data-label-night="${esc(l.night)}" data-aria-day="${esc(l.toDay)}" data-aria-night="${esc(l.toNight)}"><span class="u-sky" aria-hidden="true"></span><span class="u-stars" aria-hidden="true">${stars}</span><span class="u-cloud" aria-hidden="true"></span><span class="u-knob" aria-hidden="true">${SUN}${MOON}</span><span class="u-vh" data-sm-theme-label>${esc(l.night)}</span></button>`;
}

// DE/EN as one sliding switch: real links, the knob sits under the current language.
function langSeg(lang, hrefs, l) {
  return `<nav class="u-seg" data-v="${lang === "en" ? "en" : "de"}" aria-label="${esc(l.lang)}">${["de", "en"].map((x) => `<a href="${esc(hrefs[x])}" hreflang="${x}" lang="${x}"${x === lang ? ' aria-current="true"' : ""}>${x.toUpperCase()}</a>`).join("")}</nav>`;
}

function shellNav({ site, lang, brand, list, tools, row, loginBase, menu }) {
  const l = labels(lang);
  const data = { login: l.login, logout: l.logout, soon: l.soon, account: l.account, open: l.open, close: l.close, menu };
  return `<header class="u-nav ${site === "mc" ? "u-mc" : "u-main sm-nav"}" data-unav data-site="${site}" data-login-base="${esc(loginBase)}" data-l="${esc(JSON.stringify(data))}"><div class="u-wrap"><div class="u-bar">
${brand}
<div class="u-panel" id="u-panel"><div class="u-me" data-u-me></div><nav class="u-nav__nav" aria-label="${esc(l.nav)}"><ul class="u-links">${list}<li class="u-dotli" aria-hidden="true"><span class="u-dot"></span></li></ul></nav>${row}</div>
<div class="u-tools">${tools}<div class="u-acct-slot" data-u-acct></div><button class="u-burger" type="button" aria-expanded="false" aria-controls="u-panel" aria-label="${esc(l.open)}">${BURGER}</button></div>
</div></div></header>`;
}

const tag = (i, l) => (i.soon ? `<span class="u-tag">${esc(i.idea ? l.t("nav.idea") : l.t("nav.soon"))}</span>` : "");
const link = (i, l) => `<a class="u-link${i.soon ? " u-soon" : ""}" href="${esc(i.href)}"${i.cur ? ' aria-current="page"' : ""}>${px(i.k)}<span class="u-lt">${esc(i.label)}</span>${i.soon ? '<i class="u-blink" aria-hidden="true"></i>' : ""}<small class="u-sub">${esc(i.soon ? (i.idea ? l.t("nav.idea") : l.t("nav.soon")) : i.sub || "")}</small></a>`;

/**
 * Main site (hub pages and the German-only pages). `items` is a list of `{ k, href, label, sub, cur,
 * soon, more }`. Items with `more` sit in the "Mehr" dropdown on desktop and as tiles on phones.
 * "bald" items stay visible and lead to their coming-soon page (Nils, 06.11.).
 */
export function mainNav({ lang = "de", items, langHrefs, brandHref = "/", extra = "" }) {
  const l = labels(lang);
  const brand = `<a class="u-brand" href="${esc(brandHref)}"><span class="u-logo">${CAT}</span><span class="u-bname">NwebNotFound</span></a>`;
  const top = items.filter((i) => !i.more), more = items.filter((i) => i.more);
  const moreCur = more.some((i) => i.cur);
  const drop = more.map((i) => `<a href="${esc(i.href)}"${i.cur ? ' aria-current="page"' : ""}${i.soon ? ' class="u-soon"' : ""}>${px(i.k)}${esc(i.label)}${tag(i, l)}</a>`).join("");
  const list = top.map((i) => `<li>${link(i, l)}</li>`).join("")
    + (more.length ? `<li class="u-group u-more" data-g="more"><button class="u-link u-gbtn" type="button" aria-expanded="false" aria-controls="ug-more"${moreCur ? " data-cur" : ""}><span class="u-lt">${esc(l.more)}</span>${CHEV}</button><div class="u-drop" id="ug-more">${drop}</div></li>` : "")
    + more.map((i) => `<li class="u-tile">${link(i, l)}</li>`).join("");
  const sw = `${langSeg(lang, langHrefs, l)}${themeToggle(l)}`;
  const row = `<p class="u-dsect">${esc(l.settings)}</p><div class="u-row"><div class="u-drow">${esc(l.lang)} ${langSeg(lang, langHrefs, l)}</div><div class="u-drow">${esc(l.theme)} ${themeToggle(l)}</div></div>`;
  const menu = [["/profile", l.profile, "name_tag"], [`https://${MC_HOST}/bestellungen`, l.orders, "chest"]];
  return shellNav({ site: "main", lang, brand, list, tools: sw + extra, row, loginBase: "", menu });
}

/**
 * The fixed link set of the main site, in the mockup's order. `cur` is one of the keys; `ready`
 * says which "bald" sections already have content (then they lead to the real page, unmarked).
 */
export function mainItems(lang, cur, href = (p) => p, ready = {}) {
  const t = makeT(lang);
  return [
    { k: "start", href: href("/"), label: t("nav.home"), sub: t("nav.sub_home") },
    { k: "portfolio", href: "/portfolio", label: t("footer.projects"), sub: t("nav.sub_projects") },
    { k: "blog", href: href("/blog"), label: t("nav.blog"), sub: t("nav.sub_blog"), soon: !ready.blog },
    { k: "music", href: href("/music"), label: t("nav.music"), soon: !ready.music },
    { k: "guestbook", href: "/guestbook", label: t("footer.guestbook"), sub: t("nav.sub_guestbook") },
    { k: "about", href: href("/about"), label: t("nav.about"), sub: t("nav.sub_about"), more: true },
    { k: "writing", href: href("/writing"), label: t("nav.writing"), soon: !ready.writing, more: true },
    { k: "pixelwand", href: href("/pixelwand"), label: t("nav.pixelwand"), soon: true, idea: true, more: true },
  ].map((i) => ({ ...i, cur: i.k === cur }));
}

/** mc.* groups: `groups` is `[key, label, [[href, label, icon], …], sub?]`. The active entry is marked by unav.js. */
export function mcNav(groups) {
  const l = labels("de");
  const brand = `<a class="u-brand" href="/"><span class="u-logo">${icon("grass_block")}</span><span class="u-bname">NwebNotFound <span class="u-mcname">MC</span></span></a>`;
  const list = groups.map(([k, label, links, sub], n) => `<li class="u-group${n === groups.length - 1 ? " u-end" : ""}" data-g="${k}"><button class="u-link u-gbtn" type="button" aria-expanded="false" aria-controls="ug-${k}">${links[0] ? icon(links[0][2]) : ""}<span class="u-lt">${esc(label)}</span>${CHEV}<small class="u-sub">${esc(sub || links.map((x) => x[1]).slice(0, 2).join(", "))}</small></button><div class="u-drop" id="ug-${k}">${links.map(([h, n, i]) => `<a href="${esc(h)}">${icon(i)}${esc(n)}</a>`).join("")}</div></li>`).join("");
  const menu = [["/profile", l.profile, "name_tag"], ["/vip", "VIP", "nether_star"], ["/bestellungen", l.orders, "chest"]];
  return shellNav({ site: "mc", lang: "de", brand, list, tools: "", row: "", loginBase: `https://${MAIN_HOST}`, menu });
}
