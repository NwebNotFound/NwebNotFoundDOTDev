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
import { GITHUB_URL, HUB_PAGES, MC_HOST, X_URL, formatNumber, hubPage, hubPageExists, writingListBody, writingListPage, writingPostPage, writingSeriesPage } from "../src/hub.js";

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
    ok(html.includes("/design/summer.css?v=") && html.includes(`<script src="/design/summer-theme.js?v=${AV}"></script>`), `${label}: summer.css and the theme bootstrap`);
    ok(html.indexOf("summer-theme.js") < html.indexOf("summer.css?v="), `${label}: theme bootstrap runs before the stylesheet (no theme flash)`);
    ok(html.includes(`class="sm-skip-link" href="#main"`) && html.includes(`<main id="main">`), `${label}: skip link targets the main landmark`);
    ok(html.indexOf("sm-skip-link") < html.indexOf("<header class=\"u-nav u-main sm-nav\""), `${label}: skip link is the first focusable element`);
    ok(html.includes('<header class="u-nav u-main sm-nav"') && html.includes('<footer class="sm-footer"'), `${label}: header and footer landmarks`);
    ok(!/<script(?![^>]*\bsrc=)/.test(html), `${label}: no inline script (script-src 'self')`);
    ok(!/\son[a-z]+\s*=/i.test(html), `${label}: no inline event handler`);
    // Summer Theme v2: the mascot is the approved inline pixel art (artboard), not the Phase 1
    // placeholder sprite — an inline SVG follows the theme tokens and needs no second request.
    ok(html.includes('shape-rendering="crispEdges"'), `${label}: uses inline pixel art (crispEdges)`);
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
  // Summer Theme v2: real Minecraft texture (the same /mc-icon endpoint the MC surface uses) plus
  // the parallax layer markup and the external parallax helper.
  ok(home.includes('src="/mc-icon/v2/grass_block"') && home.includes('class="h2-tile"'), "the Minecraft project card shows the real grass_block texture");
  // New start page (mockups/feat-home-about-me): no hero illustration, no parallax.
  ok(!home.includes("data-sm-parallax") && !home.includes("sm-scene") && !home.includes("summer-parallax.js"), "the start page has no hero scene and no parallax");
  ok(home.includes(`/design/home.css?v=${AV}`) && home.includes(`/design/home.js?v=${AV}`) && !hubPage("/about", "en").includes("/design/home.css"), "only the start page loads home.css/home.js");
  // Night hero (artboard Main-night): the moon and the star field are in the markup, the swap itself
  // is pure CSS (data-theme / prefers-color-scheme), so no script is involved.
  ok(home.includes("Hi, I&#39;m ") && home.includes("What I&#39;m building"), "the English start page uses the content file (src/home-content.js)");
  ok(hubPage("/", "de").includes("Hi, ich bin ") && hubPage("/", "de").includes("Woran ich baue") && hubPage("/", "de").includes("Steckbrief"), "the German start page: hero, project heading and Steckbrief");
  // Unified nav (mockup fix-unified-nav): one bar, the phone drawer is the same panel, the burger
  // controls it, and the account slot is empty until /api/me answers (no avatar before the session).
  const bar = home.slice(home.indexOf("<header"), home.indexOf("</header>"));
  ok(bar.includes('class="u-bar"') && bar.includes('id="u-panel"') && bar.includes('aria-controls="u-panel"') && bar.includes("data-u-acct></div>"), "the header is the unified bar with drawer panel, burger and empty account slot");
  ok(home.includes('<script src="/design/unav.js?v=') && home.includes('/design/unav.css?v='), "the hub loads the shared nav assets");
  ok([">Home<", ">Projects<", ">Guestbook<", ">About<"].every((x) => bar.includes(x)) && !bar.includes(">Music<"), "nav: Home, Projects, Guestbook, About; Music stays hidden until it has a page");
  ok(bar.indexOf(">Home<") < bar.indexOf(">Projects<") && bar.indexOf(">Guestbook<") < bar.indexOf(">About<"), "nav order follows the mockup");
  ok(bar.includes(`class="u-switch" href="https://${MC_HOST}/"`), "the Minecraft site switch is a chip, not a nav item");
  ok(!bar.includes("sm-nav__link--soon"), "no dimmed 'soon' entries in the nav any more");
  ok(!hubPage("/about", "de").includes("summer-parallax.js"), "inner pages do not load the parallax helper");
  // Formatted numbers follow the page language.
  ok(formatNumber(1234, "de") === "1.234" && formatNumber(1234, "en") === "1,234", "counts are grouped per language", `${formatNumber(1234, "de")} / ${formatNumber(1234, "en")}`);
  ok(formatNumber("kaputt", "de") === "kaputt", "a non-number is passed through instead of 'NaN'");
  ok(["music", "writing"].every((s) => home.includes(`href="/en/${s}"`)), "home links the still-empty sections");
  // Rezensionen gibt es nicht mehr (Nils, 04.11.2026): keine Spur in Navigation, Kacheln oder Hinweisen.
  ok(!home.includes("/reviews") && !home.includes("Rezensionen") && !home.includes("Reviews"), "die Startseite kennt keine Rezensionen mehr");
  ok(
    ["/", "/about", "/music", "/writing"].every((p) => !hubPage(p, "de").includes("Rezensionen") && !hubPage(p, "en").includes("Reviews")),
    "kein Rezensionen-Hinweis mehr in Navigation, Kacheln, About oder Meta",
  );
  ok(hubPage("/reviews", "de") === null && hubPage("/reviews", "en") === null && !hubPageExists("/reviews"), "/reviews gehört dem Hub nicht mehr (fällt auf die 404-Seite)");
  // Sechs Kacheln passen in ein 3-Spalten-Raster ohne Lücke: kein `sm-tile--wide` mehr, weil zwei
  // breite Kacheln + vier normale nur acht von neun Zellen belegt hätten.
  const tileCount = (home.match(/class="h2-proj"/g) || []).length;
  ok(tileCount === 6 && tileCount % 3 === 0, `sechs gleich große Projektkarten, Raster ohne Lücke (${tileCount})`);
  ok(["Zuletzt", "Latest"].some((x) => hubPage("/", "de").includes(x)) && hubPage("/", "de").includes("data-gb-latest") && hubPage("/", "de").includes("h2-log"), "Zuletzt (Changelog) and the guestbook teaser are on the start page");
  ok(/<li><span class="h2-when">\d\d\.\d\d\.<\/span><span class="h2-lic">[\s\S]*?<b>[^<]+<\/b><small>[^<]+<\/small>/.test(hubPage("/", "de")), "Zuletzt shows date, title and subline per entry");
  // Und die Chips auf /about zählen dieselben Bereiche.
  const aboutChips = (hubPage("/about", "de").match(/sm-badge sm-badge--(ramune|sakura|lavender|peach|sun)/g) || []).length;
  ok(aboutChips >= 3 && !hubPage("/about", "de").includes("Rezensionen"), "die Bereichs-Chips auf /about passen zur Navigation");
  ok(home.includes("h2-st is-soon") && home.includes("h2-st is-idea") && home.includes(">soon<"), "projects without a page are marked soon / idea");
  const de = hubPage("/", "de");
  ok(de.includes("h2-st is-soon") && de.includes(">bald<") && de.includes(">Idee<"), "the German home says 'bald' and 'Idee'");
  const soon = hubPage("/writing", "de");
  ok(soon.includes("sm-hammer") && soon.includes("(◕‿◕)"), "empty state shows the building mascot and a kaomoji");
  ok(soon.includes("Texte kommt bald"), "empty state names the section", soon.slice(soon.indexOf("sm-h1"), soon.indexOf("sm-h1") + 120));
  // The call to action must not point at the page the reader is already on (review finding).
  const soonCta = soon.slice(soon.indexOf("sm-row sm-row--center"), soon.indexOf("sm-row sm-row--center") + 500);
  ok(soonCta.includes('href="/guestbook"') && !soonCta.includes('href="/de/writing"'), "empty state links somewhere useful instead of itself");
}

/* ---- 6. writing: list, post, series (phase 3a) -------------------------------------- */
{
  const mk = (o) => ({
    slug: o.slug,
    kind: o.kind || "blog",
    title: o.title || o.slug,
    date: o.date || "2026-01-01",
    updated: o.updated || null,
    tags: o.tags || [],
    draft: !!o.draft,
    archived: !!o.archived,
    lang: o.lang || "de",
    summary: o.summary || null,
    cover: null,
    series: o.series || null,
    seriesTitle: o.seriesTitle || null,
    chapter: o.chapter || null,
    wordCount: 10,
    readingMinutes: o.readingMinutes || 1,
    html: o.html || "<p>Body</p>",
  });
  const all = [
    mk({ slug: "post-one", title: "Post One", date: "2026-01-03", tags: ["alpha"], summary: "Kurz eins" }),
    mk({ slug: "post-two", title: "Post Two", date: "2026-01-02", tags: ["beta"] }),
    mk({ slug: "old", title: "Old Post", date: "2026-01-01", archived: true }),
    mk({ slug: "en-post", title: "English Post", date: "2026-01-04", lang: "en" }),
    mk({ slug: "ch-1", title: "Chapter One", kind: "story", series: "serie", seriesTitle: "Serie", chapter: 1, date: "2025-01-01" }),
    mk({ slug: "ch-2", title: "Chapter Two", kind: "story", series: "serie", chapter: 2, date: "2025-01-02" }),
  ];

  /* list */
  const list = writingListPage(all, "de");
  ok(list.startsWith('<!doctype html><html lang="de" class="sm-root">') && list.includes('href="https://nwebnotfound.dev/de/writing"'), "writing list: shell and canonical");
  ok(list.includes("sm-post-grid") && list.includes("Post One") && list.includes("English Post"), "writing list: cards for the published posts");
  ok(!list.includes("Old Post") && !list.includes("/de/writing/old"), "writing list: an archived post is not listed");
  ok(!list.includes("sm-soon"), "writing list: no empty state while there is content");
  ok(list.includes("sm-tag--active") && list.includes('aria-current="true"'), "writing list: the 'all' chip is marked");
  ok(list.includes('href="/de/writing?kind=story"') && list.includes('href="/de/writing?tag=alpha"'), "writing list: kind and tag filter links");
  ok(list.includes("5 Beiträge"), "writing list: count excludes archived", list.slice(list.indexOf("sm-filters__count"), list.indexOf("sm-filters__count") + 120));
  ok(list.indexOf("English Post") < list.indexOf("Post One"), "writing list: newest first");
  ok(writingListBody(all, "de", { kind: "story" }).includes("2 Beiträge") && !writingListBody(all, "de", { kind: "story" }).includes("Post One"), "writing list: filter by kind");
  ok(writingListBody(all, "de", { tag: "alpha" }).includes("1 Beiträge"), "writing list: filter by tag");
  ok(writingListBody(all, "de", { kind: "story", tag: "alpha" }).includes("Zu diesem Filter"), "writing list: empty filter result is explained");
  const emptyList = writingListPage([], "de");
  ok(emptyList.includes("sm-hammer") && emptyList.includes("Texte kommt bald"), "writing list: nothing published → the mascot empty state");

  /* post */
  const post = writingPostPage(all[0], all, "de");
  ok(post.startsWith('<!doctype html><html lang="de" class="sm-root">') && post.includes("<h1 class=\"sm-h1\">Post One</h1>"), "post: shell and title");
  ok(post.includes('href="https://nwebnotfound.dev/de/writing/post-one"') && !/rel="alternate" hreflang=/.test(post), "post: canonical at the original language, no hreflang alternates");
  ok(post.includes("Min. Lesezeit") && post.includes('href="/de/writing?tag=alpha"'), "post: reading time and tag link");
  ok(post.includes('class="sm-prose" lang="de"'), "post: body in the .sm-prose reader with its own lang");
  ok(post.includes('href="/de/writing"'), "post: back link to the list");
  ok(!post.includes("sm-note"), "post: no original-language note when UI language == content language");
  const enOnDe = writingPostPage(all[3], all, "de");
  ok(enOnDe.includes("Original auf Englisch.") && enOnDe.includes('href="https://nwebnotfound.dev/en/writing/en-post"'), "post: English text on the German UI notes the original and keeps its canonical");
  ok(writingPostPage(all[0], all, "en").includes("Original in German."), "post: German text on the English UI notes the original");
  const archivedPage = writingPostPage(all[2], all, "de");
  ok(archivedPage.includes("wurde archiviert") && archivedPage.includes("Archiviert"), "post: an archived post stays reachable and shows the banner");
  const ch1 = writingPostPage(all[4], all, "de");
  ok(ch1.includes("Nächstes Kapitel") && ch1.includes('href="/de/writing/ch-2"') && !ch1.includes("Vorheriges Kapitel"), "chapter: next link on the first chapter, no previous");
  const ch2 = writingPostPage(all[5], all, "de");
  ok(ch2.includes("Vorheriges Kapitel") && ch2.includes('href="/de/writing/ch-1"') && !ch2.includes("Nächstes Kapitel"), "chapter: previous link on the last chapter, no next");
  ok(writingPostPage(all[0], all, "de").includes('href="/de/writing/series/serie"') === false, "post: a blog post has no series eyebrow link");
  ok(ch1.includes('href="/de/writing/series/serie"'), "chapter: eyebrow links to the series page");

  /* feeds (phase 3b) */
  ok(list.includes('class="sm-feed-note"') && list.includes('href="/writing/feed.xml"') && list.includes('href="/writing/atom.xml"'), "list: the feed footnote offers RSS and Atom");
  ok(list.includes('<link rel="alternate" type="application/rss+xml" title="NwebNotFound – Texte" href="/writing/feed.xml">'), "list: feed autodiscovery in the head");
  ok(post.includes('type="application/rss+xml" title="NwebNotFound – Blog" href="/writing/blog/feed.xml"') && !post.includes("/writing/stories/feed.xml"), "post: a blog post advertises the blog feed only");
  ok(post.includes('class="sm-feed-note"') && post.includes('href="/writing/blog/atom.xml"'), "post: the footnote links its own feed");
  ok(ch1.includes('href="/writing/stories/feed.xml"') && ch1.includes('href="/writing/series/serie/feed.xml"'), "chapter: the kind feed and the series feed");
  ok(writingSeriesPage({ slug: "serie", title: "Serie", chapters: ["ch-1", "ch-2"], count: 2 }, all, "de").includes('href="/writing/series/serie/atom.xml"') && writingSeriesPage({ slug: "serie", title: "Serie", chapters: ["ch-1", "ch-2"], count: 2 }, all, "de").includes("sm-feed-note"), "series: its own feed in the head and as a footnote");
  ok(writingListPage([], "de").includes('href="/writing/feed.xml"'), "an empty writing list still advertises the (empty) feed");
  ok(hubPage("/about", "de").includes('href="/writing/feed.xml"'), "the hub shell advertises the writing feed on other pages too");

  /* export (phase 3c) */
  ok(ch1.includes('href="/downloads/story-ch-1.epub"') && ch1.includes('href="/downloads/series-serie.epub"'), "chapter: chapter EPUB and series EPUB are linked");
  ok(ch1.includes("data-sm-print") && ch1.includes(`<script src="/design/summer-print.js?v=${AV}" defer></script>`), "chapter: print button with the external helper");
  ok(ch1.includes("© Nils, nur zum persönlichen Lesen."), "chapter: the rights line is on the page");
  ok(ch1.includes("Öffnet den Druckdialog"), "chapter: the print hint is shown");
  /* reading aids of the chapter page (review findings + artboard Story.html) */
  ok(ch1.includes('class="sm-kicker sm-kicker--center"') && ch1.includes("Kapitel 1 von 2"), "chapter: the head names chapter and count as a centered kicker");
  ok(ch1.includes("data-sm-progress") && ch1.includes("data-sm-reading-size") && ch1.includes(`<script src="/design/summer-reader.js?v=${AV}" defer></script>`), "chapter: progress line, Aa control and the external reader helper");
  ok(ch1.includes('data-size-small="klein"') && ch1.includes("Schriftgröße: normal"), "chapter: the Aa control carries the German labels");
  ok(!hubPage("/writing", "de").includes("summer-reader.js"), "the list page does not load the reader helper");
  ok(!ch1.includes("sm-feed-note__sep") && ch1.includes("sm-feed-note__links"), "chapter: the feed note is a quiet row without separators");
  ok(ch1.includes("sm-card sm-card--link sm-prevnext__link") && ch1.includes("sm-prevnext__title"), "chapter: previous/next are cards, not bare links");
  ok(!post.includes("/downloads/") && !post.includes("data-sm-print") && !post.includes("summer-print.js"), "post: a blog post gets no export and no print button");
  const archivedChapter = writingPostPage(mk({ slug: "ch-arch", kind: "story", series: "serie", chapter: 9, archived: true, date: "2025-01-03" }), all, "de");
  ok(!archivedChapter.includes("/downloads/") && !archivedChapter.includes("data-sm-print"), "an archived chapter offers neither download nor print");
  ok(writingSeriesPage({ slug: "serie", title: "Serie", chapters: ["ch-1", "ch-2"], count: 2 }, all, "de").includes('href="/downloads/series-serie.epub"'), "series: the whole series is offered as one EPUB");
  ok(!list.includes("/downloads/") && !list.includes("data-sm-print"), "list: no download or print buttons");

  /* escaping on a writing page */
  const unsafe = writingPostPage(mk({ slug: "unsafe", title: "Unsafe", html: "<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;</p>" }), all, "de");
  ok(!/<script(?![^>]*\ssrc=)/i.test(unsafe), "post: a payload in the body never becomes a live script tag");
  ok(!/<img[^>]*\son[a-z]+\s*=/i.test(unsafe), "post: no event attribute on a live tag");
  ok(unsafe.includes("&lt;script&gt;"), "post: the payload is visible as escaped text");

  /* series */
  const series = { slug: "serie", title: "Serie", chapters: ["ch-1", "ch-2"], count: 2 };
  const seriesPage = writingSeriesPage(series, all, "de");
  ok(seriesPage.includes("<h1 class=\"sm-h1\">Serie</h1>") && seriesPage.includes('href="https://nwebnotfound.dev/de/writing/series/serie"'), "series: shell, title and canonical");
  ok(seriesPage.includes("Chapter One") && seriesPage.includes("Chapter Two") && seriesPage.indexOf("Chapter One") < seriesPage.indexOf("Chapter Two"), "series: chapter list in reading order");
  ok(seriesPage.includes('hreflang="de"') && seriesPage.includes('hreflang="en"'), "series: the UI page keeps its hreflang alternates");
  ok(writingSeriesPage({ slug: "serie", title: "Serie", chapters: [], count: 0 }, all, "de").includes("Diese Serie hat 2 Kapitel"), "series: the chapter count comes from the chapters that exist");

  /* routing */
  ok(hubPageExists("/writing") && hubPageExists("/writing/post-one") && hubPageExists("/writing/series/serie"), "hubPageExists owns the writing routes");
  ok(!hubPageExists("/writing/series/BAD") && !hubPageExists("/writing/UPPER"), "hubPageExists rejects a non-slug segment");
  ok(!hubPageExists("/writingx") && !hubPageExists("/writing/a/b"), "hubPageExists is exact about its shapes");
  ok(hubPage("/writing/post-one", "de") === null, "hubPage: an unknown slug (empty index) falls through to the caller");
  ok(hubPage("/writing/series/unknown", "de") === null, "hubPage: an unknown series falls through");
  const q = new URLSearchParams("kind=story");
  ok(hubPage("/writing", "de", { query: q }).includes("Texte kommt bald"), "hubPage: with an empty index the list stays the empty state");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);