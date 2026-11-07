#!/usr/bin/env node
// Unit checks for the hub shell that do not need a Worker or a browser (Phase 2):
// language negotiation, path prefixes, the `t()` fallback and the generated HTML (hreflang,
// <html lang>, navigation, footer links, accessibility hints, no remote resources).
//
//   node scripts/hub-unit.mjs
//
// The HTTP half of the same story (status codes, Set-Cookie, redirects, Minecraft regression) runs
// in scripts/e2e.mjs against a real `wrangler dev`; this file is the cheap, deterministic half.
import { AV } from "../src/asset-version.js";
import { MESSAGES, LANGS, LANG_COOKIE, makeT, missingKeys, parseAcceptLanguage, pickLang, splitLang, withLang } from "../src/i18n/index.js";
import { navReady, sitePage } from "../src/hub.js";

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

/* ---- 4. the shell left after fix/nwebos-no-optout (pages are NwebOS windows: scripts/nwebos-unit.mjs, e2e) ---- */
{
  const html = sitePage({ lang: "en", bare: "/blog", title: "Blog · NwebNotFound", desc: "d", body: "<p>x</p>" });
  ok(html.startsWith('<!doctype html><html lang="en" class="sm-root">') && html.includes('<link rel="canonical" href="https://nwebnotfound.dev/blog"'), "sitePage: <html lang> and canonical");
  ok(!/https:\/\/(fonts\.|cdn\.|www\.google)/.test(html), "sitePage: no remote fonts, CDN or tracker");
  ok(typeof navReady().writing === "boolean", "navReady() still answers for the account pages");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);