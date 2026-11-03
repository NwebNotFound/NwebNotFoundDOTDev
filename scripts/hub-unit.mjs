#!/usr/bin/env node
// Unit checks for the hub shell that do not need a Worker or a browser (Phase 2):
// language negotiation, path prefixes, the `t()` fallback and the generated HTML (hreflang,
// <html lang>, navigation, footer links, accessibility hints, no remote resources).
//
//   node scripts/hub-unit.mjs
//
// The HTTP half of the same story (status codes, Set-Cookie, redirects, Minecraft regression) runs
// in scripts/e2e.mjs against a real `wrangler dev`; this file is the cheap, deterministic half.
import { MESSAGES, LANGS, LANG_COOKIE, makeT, missingKeys, parseAcceptLanguage, pickLang, splitLang, withLang } from "../src/i18n/index.js";
import { GITHUB_URL, HUB_PAGES, MC_HOST, X_URL, hubPage, hubPageExists } from "../src/hub.js";

let pass = 0;
let fail = 0;
const ok = (cond, msg, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log((cond ? "  ✓ " : "  ✗ ") + msg + (cond ? "" : "  " + extra));
};

const t = (lang) => makeT(lang);

/* ---- 1. language negotiation ------------------------------------------------------- */
ok(pickLang("de-DE,de;q=0.9,en;q=0.8", undefined) === "de", "Accept-Language de → de");
ok(pickLang("en-US,en;q=0.9", undefined) === "en", "Accept-Language en-US → en");
ok(pickLang("en;q=0.3,de;q=0.9", undefined) === "de", "highest q wins (de 0.9 over en 0.3)");
ok(pickLang("fr-FR,fr;q=0.9", undefined) === "de", "unknown language falls back to German");
ok(pickLang("", undefined) === "de", "no header → German (default)");
ok(pickLang("*", undefined) === "de", "wildcard → German (default)");
ok(pickLang("EN-gb", undefined) === "en", "case-insensitive tag");
ok(pickLang("en;q=0,de;q=0", undefined) === "de", "q=0 never selects a language");
ok(pickLang("de-DE", "en") === "en", "cookie beats Accept-Language");
ok(pickLang("en", "de") === "de", "cookie beats Accept-Language (other way round)");
ok(pickLang("en", "klingon") === "en", "unknown cookie value is ignored");
ok(parseAcceptLanguage("en;q=0.2,de;q=1")[0].tag === "de", "parseAcceptLanguage sorts by q");
ok(parseAcceptLanguage("").length === 0, "parseAcceptLanguage('') is empty");
ok(LANG_COOKIE === "nnf_lang", "cookie name is stable (documented in DESIGN.md/HUB)");

/* ---- 2. path prefixes -------------------------------------------------------------- */
const split = (p) => JSON.stringify(splitLang(p));
ok(split("/en/about") === '{"lang":"en","path":"/about"}', "splitLang /en/about");
ok(split("/de") === '{"lang":"de","path":"/"}', "splitLang /de → root");
ok(split("/") === '{"lang":null,"path":"/"}', "splitLang / has no language");
ok(split("/en/guestbook") === '{"lang":"en","path":"/guestbook"}', "splitLang keeps the rest of the path");
ok(split("/english") === '{"lang":null,"path":"/english"}', "no false prefix on /english");
ok(split("/deutsch") === '{"lang":null,"path":"/deutsch"}', "no false prefix on /deutsch");
ok(split("/about") === '{"lang":null,"path":"/about"}', "unprefixed path keeps lang null");
ok(withLang("/", "en") === "/en", "withLang root → /en");
ok(withLang("/about", "de") === "/de/about", "withLang /about → /de/about");
ok(!withLang("/", "en").includes("//"), "no double slash in prefixed root");
for (const p of ["/", "/about"]) for (const lang of LANGS) ok(splitLang(withLang(p, lang)).lang === lang, `round trip ${withLang(p, lang)}`);

/* ---- 3. t() fallback --------------------------------------------------------------- */
{
  const saved = MESSAGES.de["nav.home"];
  delete MESSAGES.de["nav.home"];
  ok(t("de")("nav.home") === MESSAGES.en["nav.home"], "missing key falls back to the other language", `got ${t("de")("nav.home")}`);
  MESSAGES.de["nav.home"] = saved;
  ok(t("de")("nav.home") === "Start" && t("en")("nav.home") === "Home", "and the normal lookup is back");
}
ok(t("de")("no.such.key") === "no.such.key", "unknown key renders as the key (visible, not undefined)");
ok(t("en")("footer.rights", { year: 2027 }).includes("2027"), "t() interpolates {year}");
ok(t("de")("soon.title", { section: "Musik" }) === "Musik kommt bald", "t() interpolates the section name", t("de")("soon.title", { section: "Musik" }));
{
  const m = missingKeys();
  ok(m.de.length === 0 && m.en.length === 0, "both message files define the same keys", JSON.stringify(m));
}

/* ---- 4. generated documents --------------------------------------------------------- */
const pages = HUB_PAGES;
ok(!hubPageExists("/guestbook") && !hubPageExists("/portfolio") && !hubPageExists("/de"), "hubPageExists knows exactly its own routes");
ok(!hubPage("/guestbook", "de"), "hubPage returns null for a foreign path");

for (const lang of LANGS) {
  for (const bare of pages) {
    const html = hubPage(bare, lang);
    const label = `${bare} (${lang})`;
    const url = (b) => (b === "/" ? `/${lang}/` : `/${lang}${b}`);
    ok(!!html && html.startsWith(`<!doctype html><html lang="${lang}" class="sm-root">`), `${label}: <html lang> and the .sm-root landmark`, html && html.slice(0, 80));
    ok(html.includes(`<link rel="canonical" href="https://nwebnotfound.dev${url(bare)}"`), `${label}: canonical points at the language URL`);
    ok(["de", "en", "x-default"].every((h) => html.includes(`<link rel="alternate" hreflang="${h}" href="https://nwebnotfound.dev`)), `${label}: hreflang de/en/x-default`);
    ok(html.includes("/design/summer.css?v=") && html.includes(`<script src="/design/summer-theme.js"></script>`), `${label}: summer.css and the theme bootstrap`);
    ok(html.indexOf("summer-theme.js") < html.indexOf("summer.css?v="), `${label}: theme bootstrap runs before the stylesheet (no theme flash)`);
    ok(html.includes(`class="sm-skip-link" href="#main"`) && html.includes(`<main id="main">`), `${label}: skip link targets the main landmark`);
    ok(html.indexOf("sm-skip-link") < html.indexOf("<header class=\"sm-nav\""), `${label}: skip link is the first focusable element`);
    ok(html.includes('<header class="sm-nav"') && html.includes('<footer class="sm-footer"'), `${label}: header and footer landmarks`);
    ok(!/<script(?![^>]*\bsrc=)/.test(html), `${label}: no inline script (script-src 'self')`);
    ok(!/\son[a-z]+\s*=/i.test(html), `${label}: no inline event handler`);
    ok(html.includes("summer-sprites.svg#sm-mascot-placeholder"), `${label}: uses the placeholder sprite sheet`);
    ok(html.includes("data-summer-theme-toggle") && html.includes('data-label-day="') && html.includes('data-label-night="'), `${label}: theme toggle is wired for summer-theme.js`);
    ok(html.includes(`href="${withLang("/", lang)}"`), `${label}: brand links to the language home`);
    const urls = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const bad = urls.filter((u) => !/^https:\/\/(github\.com\/NwebNotFound|x\.com\/NwebNotFound|mc\.nwebnotfound\.dev|nwebnotfound\.dev)(\/|$)/.test(u));
    ok(bad.length === 0, `${label}: every absolute URL is a known host (no CDN/tracker)`, bad.join(" "));
    ok(!/\{[a-z_]+\}/.test(html), `${label}: no leftover {placeholder}`);
    ok(!html.includes("undefined"), `${label}: no 'undefined' in the output`);
  }
}

/* ---- 5. navigation, language switch, footer links ---------------------------------- */
{
  const html = hubPage("/about", "de");
  ok(html.includes('aria-current="page"') && html.includes(">Über mich"), "active nav entry is marked");
  ok(LANGS.every((l) => html.includes(`href="/${l}/about"`)) && html.includes('aria-current="true"'), "language switch links both variants and marks the current one");
  ok(html.includes('hreflang="en" lang="en"'), "language switch carries hreflang and lang");
  ok(html.includes(`href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer"`), "GitHub is a plain external link with rel=noopener noreferrer");
  ok(html.includes(`href="${X_URL}" target="_blank" rel="noopener noreferrer"`), "X is a plain external link with rel=noopener noreferrer");
  ok(html.includes(`https://${MC_HOST}/`), "footer links the Minecraft surface");
  const aboutMain = html.slice(html.indexOf("<main id=\"main\">"), html.indexOf("</main>"));
  ok(!aboutMain.includes("sm-badge--sun"), "About content carries no 'soon' badge (only the nav marks the empty sections)");

  const home = hubPage("/", "en");
  ok(home.includes(`href="https://${MC_HOST}/" target="_blank" rel="noopener noreferrer"`), "home tile opens the Minecraft server externally");
  ok(["music", "writing", "reviews"].every((s) => home.includes(`href="/en/${s}"`)), "home links the still-empty sections");
  ok(home.includes("sm-badge--sun") && home.includes("soon"), "still-empty sections are marked as soon");
  const de = hubPage("/", "de");
  ok(de.includes("sm-badge--sun") && de.includes("bald"), "the German home says 'bald'");
  const soon = hubPage("/writing", "de");
  ok(soon.includes("sm-mascot--placeholder") && soon.includes("(◕‿◕)"), "empty state shows the mascot placeholder and a kaomoji");
  ok(soon.includes("Texte kommt bald"), "empty state names the section", soon.slice(soon.indexOf("sm-h1"), soon.indexOf("sm-h1") + 120));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);