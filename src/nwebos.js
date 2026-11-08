// NwebOS: the new nwebnotfound.dev (mockups/nwebos, approved by Nils 07.11.). Server side of the shell.
//
// Every OS path (/, /about, /portfolio, /guestbook; /en/… for English) is one full HTML page: the shell
// (boot, login, desktop, taskbar, start menu) plus the content of every app as plain, server-rendered
// sections in <main id="apps">. Without JS that main is the page (readable, indexable); with JS,
// public/design/nwebos.js turns the sections into windows and opens the one for the current path.
//
// NwebOS is the default (Nils, 07.11.: "And nwebOS is default"). `?nwebos=0` opts out to the old site (cookie
// nnf_os=0, a year), `?nwebos=1` opts back in. Paths without an NwebOS app yet (blog, profile, changelog, …) keep
// their current pages; their desktop/start-menu icons link there.
import { AV } from "./asset-version.js";
import { WIKI } from "./mc-hub.js";
import { music, trash, soon, ic2 } from "./nwebos-apps.js";

export const MAIN_HOST = "nwebnotfound.dev";
export const MC_HOST = "mc.nwebnotfound.dev";
export const OS_COOKIE = "nnf_os";
const GITHUB = "https://github.com/NwebNotFound";
const X = "https://x.com/NwebNotFound";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (k, size = 16, cls = "ic") => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="/design/nwebos-icons.svg?v=${AV}#i-${k}"/></svg>`;
const mcIcon = (size) => `<img src="/mc-icon/v2/grass_block" width="${size}" height="${size}" alt="" loading="lazy" decoding="async">`;
const icon = (k, size) => (k === "minecraft" ? mcIcon(size) : ic(k, size));

/**
 * App modules (docs/nwebos-modules.md): an app with `module: "/design/<file>.js"` gets an empty window whose
 * content a client module fills in; its section holds the no-JS fallback. The shell loads the module on the first
 * open and calls the `mount` it registered with `NwebOS.register(key, { mount, unmount })`. Used by the games.
 *
 * Apps of the desktop. `path` = its own address; `win` = it opens as a window in this PR. The others
 * still lead to their current page (blog, music, writing) or the MC site until the apps PR.
 */
export const APPS = [
  { k: "about", path: "/about", de: "Über mich", en: "About me", w: 420, h: 380, win: true, inline: true },
  { k: "portfolio", path: "/portfolio", de: "Projekte", en: "Projects", w: 640, h: 430, win: true, inline: true },
  { k: "blog", path: "/blog", de: "Blog", en: "Blog", w: 780, h: 520, x: 200, y: 40, win: true, menu: "no" },
  { k: "music", path: "/music", de: "Musik", en: "Music", w: 400, h: 410, x: 760, y: 60, win: true, inline: true, menu: "no" },
  { k: "writing", path: "/writing", de: "Texte", en: "Writing", w: 600, h: 520, x: 300, y: 50, win: true, menu: "no" },
  { k: "guestbook", path: "/guestbook", de: "Gästebuch", en: "Guestbook", w: 460, h: 420, win: true, inline: true },
  { k: "minecraft", path: "", de: "Minecraft-Server", en: "Minecraft server", href: `https://${MC_HOST}/` },
  { k: "trash", path: "/trash", de: "Papierkorb", en: "Recycle bin", w: 560, h: 340, x: 520, y: 220, win: true, inline: true },
  { k: "mines", path: "", de: "Pixelminen", en: "Pixel Mines", w: 300, h: 528, x: 560, y: 60, win: true, inline: true, module: "/design/nwebos-games.js" },
  { k: "five", path: "", de: "Fünf", en: "Five", w: 340, h: 600, x: 880, y: 30, win: true, inline: true, module: "/design/nwebos-games.js" },
];
/** Windows without a desktop icon: opened from links, the start menu or their address. `re` matches the bare path. */
export const EXTRA = [
  // Blog editor (admin only, the server checks; mockups/nwebos/apps "Editor"): a module window, its client is
  // public/design/nwebos-editor.js on the #106 admin API.
  { k: "blog-edit", icon: "blog", re: /^\/blog\/admin(?:\/([0-9a-f-]{36}))?$/, de: "Blog-Editor", en: "Blog editor", w: 920, h: 580, x: 180, y: 20, menu: "no", module: "/design/nwebos-editor.js" },
  { k: "blog-post", icon: "blog", re: /^\/blog\/([a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?)$/, de: "Beitrag", en: "Post", w: 820, h: 560, x: 240, y: 30, menu: "no" },
  { k: "profile", icon: "profile", path: "/profile", de: "Mein Profil", en: "My profile", w: 740, h: 540, x: 260, y: 30, menu: "no" },
  { k: "changelog", icon: "changelog", path: "/changelog", de: "Neuigkeiten", en: "What's new", w: 560, h: 520, x: 420, y: 40, menu: "no" },
  { k: "chapter", icon: "book", re: /^\/writing\/([a-z0-9-]+)\/(\d{1,3})$/, de: "Kapitel", en: "Chapter", w: 640, h: 580, x: 340, y: 20, menu: "no" },
  { k: "soon", icon: "soon", path: "/pixelwand", de: "Pixelwand", en: "Pixel wall", w: 460, h: 250, x: 460, y: 200, menu: "no", inline: true },
  { k: "notfound", icon: "warn", de: "Nicht gefunden", en: "Not found", w: 470, h: 250, x: 420, y: 180, menu: "no" },
];
const ALL = [...APPS.filter((a) => a.win), ...EXTRA];
export const OS_PATHS = ["/", ...ALL.filter((a) => a.path).map((a) => a.path)];

const T = {
  de: {
    skip: "Zum Inhalt springen", boot: "Klick oder Taste zum Überspringen", edition: "Sommer Edition",
    loginHint: "Klick auf deinen Namen, um anzufangen.", loginHintT: "Tipp auf deinen Namen, um anzufangen.", offSubT: "(oder einfach tippen, dann geht's weiter)", viaDiscord: "über Discord angemeldet", signIn: "Mit Discord anmelden", signInSub: "Name und Avatar im Gästebuch",
    guest: "Gast", guestSub: "ohne Anmeldung umsehen", loginFoot: "Nach dem Anmelden kannst du Fenster ziehen, schließen und stapeln.",
    search: "Suchen", searchPh: "Suchen: Apps, Blog, Wiki …", noHit: "Nichts gefunden für", newTab: "neuer Tab",
    desktop: "Desktop", openWins: "Offene Fenster", start: "Startmenü", lang: "Sprache", theme: "Tag oder Nacht", sound: "Ton an oder aus",
    logout: "Abmelden", shutdown: "Herunterfahren", aboutOs: "Über NwebOS", trashSoon: "Papierkorb", home: "Startbildschirm",
    offText: "Du kannst die Seite jetzt schließen.", offSub: "(oder einfach klicken, dann geht's weiter)",
    nojs: "NwebOS braucht JavaScript für die Fenster. Alle Inhalte stehen oben als normale Seite.",
    minimize: "Minimieren", maximize: "Maximieren", restoreWin: "Wiederherstellen", close: "Schließen", back: "Zurück", menu: ["Datei", "Bearbeiten", "Ansicht", "Hilfe"],
    desc: "Nils' Ecke im Internet: Projekte, Gästebuch, Blog und ein Minecraft-Server, als kleines Betriebssystem.",
  },
  en: {
    skip: "Skip to content", boot: "Click or press a key to skip", edition: "Summer Edition",
    loginHint: "Click your name to begin.", loginHintT: "Tap your name to start.", offSubT: "(or tap, and it starts again)", viaDiscord: "signed in with Discord", signIn: "Sign in with Discord", signInSub: "name and avatar in the guestbook",
    guest: "Guest", guestSub: "look around without signing in", loginFoot: "Once you're in, drag, close and stack windows.",
    search: "Search", searchPh: "Search: apps, blog, wiki …", noHit: "Nothing found for", newTab: "new tab",
    desktop: "Desktop", openWins: "Open windows", start: "Start menu", lang: "Language", theme: "Day or night", sound: "Sound on or off",
    logout: "Log off", shutdown: "Shut down", aboutOs: "About NwebOS", trashSoon: "Recycle bin", home: "Home screen",
    offText: "It's now safe to close this page.", offSub: "(or click, and it starts again)",
    nojs: "NwebOS needs JavaScript for its windows. All content is above as a normal page.",
    minimize: "Minimise", maximize: "Maximise", restoreWin: "Restore", close: "Close", back: "Back", menu: ["File", "Edit", "View", "Help"],
    desc: "Nils' corner of the internet: projects, guestbook, blog and a Minecraft server, as a tiny operating system.",
  },
};

const bar = (n) => `<span class="sbar" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`;
const PROJ = {
  de: [["about", "Diese Website", "live", 10, "Mein Zuhause im Netz. Gästebuch, Blog, zweisprachig, selbst gebaut auf Cloudflare Workers.", "/about"],
    ["minecraft", "Minecraft-Server", "live", 10, "Kleiner Vanilla+-Server für Freunde mit eigener Economy, Markt und Wiki.", `https://${MC_HOST}/`],
    ["blog", "Blog", "neu", 8, "Was ich baue, was schiefging und was ich dabei gelernt habe.", "/blog"],
    ["music", "Musik", "bald", 3, "Loops, Beats und Stems aus FL Studio.", "/music"],
    ["writing", "Texte & Roman", "bald", 3, "Eine Geschichte in Kapiteln.", "/writing"],
    ["portfolio", "Pixelwand", "Idee", 1, "Eine gemeinsame Leinwand, auf der jeder ein paar Pixel setzt.", "/pixelwand"]],
  en: [["about", "This website", "live", 10, "My home on the web. Guestbook, blog, two languages, built by me on Cloudflare Workers.", "/about"],
    ["minecraft", "Minecraft server", "live", 10, "A small Vanilla+ server for friends with its own economy, market and wiki.", `https://${MC_HOST}/`],
    ["blog", "Blog", "new", 8, "What I build, what went wrong and what I learned.", "/blog"],
    ["music", "Music", "soon", 3, "Loops, beats and stems from FL Studio.", "/music"],
    ["writing", "Writing & novel", "soon", 3, "A story in chapters.", "/writing"],
    ["portfolio", "Pixel wall", "idea", 1, "A shared canvas where everyone sets a few pixels.", "/pixelwand"]],
};
const STATE_CLASS = { live: "live", neu: "neu", new: "neu", bald: "bald", soon: "bald", Idee: "Idee", idea: "Idee" };

function about(lang) {
  const de = lang !== "en";
  return `<div class="pad about">${ic("cat", 72, "av")}<div><h1>${de ? "Hi, ich bin Nils." : "Hi, I'm Nils."}</h1>
<p>${de ? "Ich baue Dinge, die mir Spaß machen: Webseiten, einen Minecraft-Server für Freunde, Musik und Geschichten. Hier landet alles, sobald es fertig genug ist." : "I build things I enjoy: websites, a Minecraft server for friends, music and stories. Everything lands here once it's ready enough."}</p></div></div>
<dl class="props"><dt>${de ? "Baut" : "Builds"}</dt><dd>${de ? "diese Seite und einen MC-Server" : "this site and an MC server"}</dd><dt>${de ? "Macht" : "Makes"}</dt><dd>${de ? "Musik in FL Studio" : "music in FL Studio"}</dd><dt>${de ? "Schreibt" : "Writes"}</dt><dd>${de ? "einen Roman in Kapiteln" : "a novel in chapters"}</dd><dt>${de ? "Mag" : "Likes"}</dt><dd>${de ? "Pixel-Art, gemütliche Spiele, Sommer" : "pixel art, cosy games, summer"}</dd><dt>${de ? "Findest mich" : "Find me"}</dt><dd><a href="${GITHUB}" rel="noopener">GitHub</a> · <a href="${X}" rel="noopener">X</a></dd></dl>`;
}

function portfolio(lang) {
  const de = lang !== "en", list = PROJ[de ? "de" : "en"];
  const live = list.filter((p) => p[2] === "live").length;
  return `<div class="explorer"><aside class="tasks"><div class="tp"><b>${de ? "Projekt-Aufgaben" : "Project tasks"}</b><a href="/blog">${de ? "Blog öffnen" : "Open the blog"}</a><a href="/guestbook" data-open="guestbook">${de ? "Ins Gästebuch schreiben" : "Sign the guestbook"}</a></div><div class="tp"><b>Details</b><span>${de ? `${list.length} Projekte<br>${live} laufen, ${list.length - live} wachsen noch` : `${list.length} projects<br>${live} running, ${list.length - live} still growing`}</span></div></aside>
<ul class="files">${list.map(([k, t, s, n, d, href]) => `<li><a href="${esc(href)}"${winKey(href)}>${icon(k, 32)}<span><b>${esc(t)}</b><small>${esc(d)}</small></span>${bar(n)}<em class="st ${STATE_CLASS[s]}">${esc(s)}</em></a></li>`).join("")}</ul></div>`;
}

function winKey(href) { const a = APPS.find((x) => x.win && x.path === href); return a ? ` data-open="${a.k}"` : ""; }
const fmtDate = (t, lang) => { try { return new Date(String(t).replace(" ", "T") + "Z").toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" }); } catch { return String(t); } };
const initial = (n) => esc((String(n || "?")[0] || "?").toUpperCase());

/** Guestbook as a messenger window. Entries are rendered on the server (no JS needed to read them). */
function guestbook(lang, entries = []) {
  const de = lang !== "en";
  const n = entries.length;
  const msgs = n
    ? entries.map((x) => `<article class="msg">${x.avatar ? `<img src="${esc(x.avatar)}" width="28" height="28" alt="" loading="lazy" decoding="async">` : `<span class="ini" aria-hidden="true">${initial(x.name)}</span>`}<div><b>${esc(x.name)}</b> <time datetime="${esc(String(x.created_at).replace(" ", "T"))}Z">${esc(fmtDate(x.created_at, lang))}</time><p>${esc(x.message)}</p></div></article>`).join("")
    : `<p class="sys">${de ? "Noch keine Einträge. Sei die oder der Erste!" : "No entries yet. Be the first!"}</p>`;
  return `<div class="chat"><div class="buddy">${ic("guestbook", 40)}<span><b>${de ? "Gästebuch" : "Guestbook"}</b><small>${de ? `${n} ${n === 1 ? "Eintrag" : "Einträge"}` : `${n} ${n === 1 ? "entry" : "entries"}`}</small></span></div>
<div class="msgs" data-gb-list>${msgs}</div>
<div class="gb-form" data-gb-compose><div class="say"><a class="xpbtn discord" href="/auth/discord/login?next=${encodeURIComponent(`https://${MAIN_HOST}${de ? "" : "/en"}/guestbook`)}">${de ? "Mit Discord anmelden" : "Sign in with Discord"}</a></div></div></div>`;
}

const href = (lang, path) => (lang === "en" ? (path === "/" ? "/en" : "/en" + path) : path);

/**
 * The full OS page. `app` is the window for this address ("" = desktop only); `entries` the latest
 * guestbook entries; `sitekey` the Turnstile site key for the guestbook form.
 */
/** Search index without the blog (the shell loads /api/blog on the first search): windows, mc wiki, links. */
function searchIndex(lang) {
  const t = T[lang], mc = `https://${MC_HOST}`;
  const apps = ALL.filter((a) => (a.path || a.module) && a.k !== "soon").map((a) => ({ t: a[lang], d: "App", p: a.path ? href(lang, a.path) : "", ic: a.icon || a.k, kw: a.k, ...(a.path ? {} : { k: a.k }) }));
  return [...apps,
    { t: "Minecraft-Server", d: `${MC_HOST} · ${t.newTab}`, url: `${mc}/`, ic: "minecraft", kw: "minecraft server mc" },
    ...WIKI.map((w) => ({ t: `Wiki: ${w.title}`, d: `${MC_HOST}/wiki · ${t.newTab}`, url: `${mc}/wiki/${w.slug}`, ic: "minecraft", kw: `wiki minecraft ${w.sum || ""}` })),
    { t: "GitHub · NwebNotFound", d: t.newTab, url: GITHUB, ic: "portfolio", kw: "github code" }];
}
export function nwebosPage({ lang = "de", app = "", path: curPath = "", entries = [], sitekey = "", content: extra = {}, title: winTitle = "", status = 200 } = {}) {
  lang = lang === "en" ? "en" : "de";
  const t = T[lang];
  const cur = ALL.find((a) => a.k === app) || null;
  const curTitle = winTitle || (cur ? cur[lang] : "");
  const title = cur ? `${curTitle} · NwebOS` : `NwebOS · ${lang === "en" ? "Nils' corner of the internet" : "Nils' Ecke im Internet"}`;
  const path = cur ? curPath || cur.path || "/" : "/";
  // Light windows are always in the page; heavier or dynamic ones only when they are the current window (the shell
  // fetches the others from their address when opened). The current window's section comes first.
  const game = (de, en) => `<p class="nojs-g">${lang === "en" ? en : de}</p>`;
  const content = { about: about(lang), portfolio: portfolio(lang), guestbook: guestbook(lang, entries), music: music(lang), trash: trash(lang), soon: soon(lang),
    mines: game("Pixelminen: ein kleines Minensuch-Spiel. Es braucht JavaScript.", "Pixel Mines: a small minesweeper game. It needs JavaScript."),
    five: game("Fünf: errate das Wort mit fünf Buchstaben. Es braucht JavaScript.", "Five: guess the five-letter word. It needs JavaScript."), ...extra };
  const inl = ALL.filter((a) => a.inline && content[a.k] !== undefined);
  const ordered = cur ? [cur, ...inl.filter((a) => a !== cur)] : inl;
  const sec = (a) => { const isCur = a === cur; const p = isCur ? path : a.path || ""; const tt = isCur ? curTitle : a[lang];
    return `<section class="app" id="app-${a.k}" data-app="${a.k}" data-path="${esc(p)}"${a.module ? ` data-module="${esc(a.module)}?v=${AV}"` : ""} data-title-de="${esc(isCur && winTitle ? winTitle : a.de)}" data-title-en="${esc(isCur && winTitle ? winTitle : a.en)}" data-w="${a.w}" data-h="${a.h}"${a.x != null ? ` data-x="${a.x}" data-y="${a.y}"` : ""}${a.menu ? ` data-menu="${a.menu}"` : ""}${a.icon ? ` data-icon="${a.icon}"` : ""} aria-labelledby="h-${a.k}"><h2 class="nojs-h" id="h-${a.k}">${esc(tt)}</h2>${content[a.k] ?? ""}</section>`; };
  const sections = ordered.filter((a) => content[a.k] !== undefined).map(sec).join("\n");
  // routes the shell may open without a full page load (fetches their section from the address)
  const routes = ALL.filter((a) => a.path).map((a) => [a.k, a.path]);
  const iconHref = (a) => (a.win ? href(lang, a.path) : a.href.startsWith("/") ? href(lang, a.href) : a.href);
  const dicons = APPS.map((a) => `<li><a class="dicon" href="${esc(iconHref(a))}"${a.win ? ` data-open="${a.k}"` : ""} data-de="${esc(a.de)}" data-en="${esc(a.en)}">${icon(a.k, 40)}<span>${esc(a[lang])}</span></a></li>`).join("");
  const progs = APPS.map((a) => `<li><a href="${esc(iconHref(a))}"${a.win ? ` data-open="${a.k}"` : ""}>${icon(a.k, 24)}<span>${esc(a[lang])}</span></a></li>`).join("");
  const tpl = [...APPS.map((a) => [a.k, a.k]), ...EXTRA.map((a) => [a.k, a.icon])].map(([k, i]) => `<template id="ic-${k}">${icon(i, 16)}</template>`).join("");
  const other = lang === "en" ? "de" : "en";
  const alt = (l) => `https://${MAIN_HOST}${href(l, path)}`;
  const DISCORD = '<svg viewBox="0 0 71 55" fill="#fff" aria-hidden="true" focusable="false"><path d="M60.1 4.9A58.5 58.5 0 0045.4.4a40 40 0 00-1.9 3.8 54 54 0 00-16.2 0A40 40 0 0025.4.4 58.4 58.4 0 0010.7 4.9C1.4 18.7-1.1 32.2.1 45.5a59 59 0 0018 9.1 43 43 0 003.8-6.2 38 38 0 01-6-2.9l1.5-1.1a42 42 0 0036 0l1.5 1.1a38 38 0 01-6 2.9 43 43 0 003.8 6.2 58.7 58.7 0 0018-9.1c1.5-15.4-2.5-28.8-10.6-40.6zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2z"/></svg>';
  const L = { ...t, lang, path, sprite: `/design/nwebos-icons.svg?v=${AV}`, idx: searchIndex(lang), home: href(lang, "/"), login: `/auth/discord/login?next=`, logoutUrl: `/auth/discord/logout?next=`, sitekey, routes, status };
  return `<!doctype html>
<html lang="${lang}" class="no-js nwebos"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(t.desc)}"><link rel="canonical" href="${alt(lang)}">
<link rel="alternate" hreflang="${lang}" href="${alt(lang)}"><link rel="alternate" hreflang="${other}" href="${alt(other)}">
<link rel="alternate" type="application/rss+xml" title="Blog · NwebNotFound" href="/blog/feed.xml"><link rel="alternate" type="application/rss+xml" title="${lang === "en" ? "What's new" : "Neuigkeiten"} · NwebNotFound" href="${lang === "en" ? "/en" : ""}/changelog/feed.xml">${path === "/writing" || path.startsWith("/writing/") ? `<link rel="alternate" type="application/rss+xml" title="NwebNotFound – Texte" href="/writing/feed.xml">` : ""}
<meta name="theme-color" content="#2463d6"><link rel="icon" href="/favicon.ico">
<script src="/design/summer-theme.js?v=${AV}"></script><link rel="preload" href="/design/fonts/pixelify-sans-latin-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/design/nwebos.css?v=${AV}"><link rel="stylesheet" href="/design/nwebos-apps.css?v=${AV}"><link rel="stylesheet" href="/design/nwebos-polish.css?v=${AV}"><link rel="stylesheet" href="/design/nwebos-phone.css?v=${AV}"><script src="/design/nwebos.js?v=${AV}" defer></script><script src="/design/nwebos-apps.js?v=${AV}" defer></script></head><body>
<a class="skip" href="#apps">${t.skip}</a>
<div id="boot" class="scr" hidden><div class="bootin"><div class="blogo">${ic("cat", 72)}<span><b>Nweb</b>OS</span></div><small>${t.edition}</small><div class="bbar"><i></i><i></i><i></i></div><p>${t.boot}</p></div><span class="bcopy">© {{Y}} Nils Weberruß</span></div>
<div id="login" class="scr" hidden role="dialog" aria-modal="true" aria-label="NwebOS"><div class="lgtop"></div><div class="lgmid"><div class="lgl">${ic("cat", 64)}<b><span>Nweb</span>OS</b><p><span class="ptr-m">${t.loginHint}</span><span class="ptr-t">${t.loginHintT}</span></p></div>
<ul class="users"><li data-login-me hidden><button type="button" data-user="me"><img data-me-av src="data:," width="56" height="56" alt=""><span><b data-me-name></b><small>${t.viaDiscord}</small></span></button></li>
<li data-login-discord><a class="ubtn" data-login-link href="/auth/discord/login"><span class="dc">${DISCORD}</span><span><b>${t.signIn}</b><small>${t.signInSub}</small></span></a></li>
<li><button type="button" data-user="gast"><span class="guest">${ic("about", 40)}</span><span><b>${t.guest}</b><small>${t.guestSub}</small></span></button></li></ul></div>
<div class="lgbot"><span>NwebOS · ${t.edition}</span><span>${t.loginFoot}</span></div></div>
<div id="off" class="scr" hidden><div class="offin">${ic("cat", 56)}<p>${t.offText}</p><small><span class="ptr-m">${t.offSub}</span><span class="ptr-t">${t.offSubT}</span></small></div></div>
<div id="desk" hidden><form class="hsearch" role="search"><div class="fld"><input id="hq" type="search" placeholder="${t.search} …" aria-label="${t.search}" autocomplete="off" enterkeyhint="go" autocapitalize="off" spellcheck="false"><button type="button" class="clr" aria-label="${lang === "en" ? "Clear search" : "Suche leeren"}"><i></i></button></div><button type="button" class="cnl">${lang === "en" ? "Cancel" : "Abbrechen"}</button><ul class="results" id="hres" hidden></ul></form><ul class="dicons" aria-label="${t.desktop}">${dicons}</ul><div id="wins"></div>
<div id="startm" hidden role="menu" aria-label="${t.start}"><div class="smtop" data-open="profile" title="${lang === "en" ? "My profile" : "Mein Profil"}"><img id="smav" src="data:," width="44" height="44" alt=""><b id="smname">${t.guest}</b></div>
<div class="smsearch"><input id="smq" type="search" placeholder="${t.searchPh}" aria-label="${t.search}" autocomplete="off"></div><ul class="results" id="smres" hidden></ul>
<div class="smmid"><ul class="progs">${progs}</ul><ul class="side"><li><a href="${href(lang, "/profile")}" data-open="profile">${ic("profile", 20)}<span>${lang === "en" ? "My profile" : "Mein Profil"}</span></a></li><li><a href="${href(lang, "/changelog")}" data-open="changelog">${ic("changelog", 20)}<span>${lang === "en" ? "What's new" : "Neuigkeiten"}</span></a></li><li><a href="${GITHUB}" rel="noopener"><span>GitHub</span></a></li><li><button type="button" data-egg="about-os"><span>${t.aboutOs}</span></button></li></ul></div>
<div class="smbot"><button type="button" data-egg="logout">${t.logout}</button><button type="button" data-egg="shutdown" class="sd">${t.shutdown}</button></div></div>
<footer class="task"><button id="startb" type="button" aria-expanded="false" aria-controls="startm" aria-label="${t.start}">${ic("cat", 22)}<span>NwebOS</span></button><div id="tbtns" role="tablist" aria-label="${t.openWins}"></div>
<div class="tray"><nav class="lang" data-lang="${lang}" aria-label="${t.lang}"><a href="${esc(href("de", path))}" hreflang="de" lang="de"${lang === "de" ? ' aria-current="true"' : ""}>DE</a><a href="${esc(href("en", path))}" hreflang="en" lang="en"${lang === "en" ? ' aria-current="true"' : ""}>EN</a></nav>

<button id="thm" type="button" aria-label="${t.theme}" aria-pressed="false"><i></i></button><button id="snd" type="button" aria-pressed="true" aria-label="${t.sound}"><svg viewBox="0 0 12 12" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="4" width="3" height="4" fill="#fff"/><rect x="4" y="3" width="1" height="6" fill="#fff"/><rect x="5" y="2" width="1" height="8" fill="#fff"/><rect class="w1" x="8" y="4" width="1" height="4" fill="#fff"/><rect class="w2" x="10" y="3" width="1" height="6" fill="#fff"/><rect class="mx" x="7" y="3" width="5" height="1" fill="#ff8a6b" transform="rotate(45 9 6)"/></svg></button><time id="clock"></time></div>
<nav class="mbar" aria-label="NwebOS"><button type="button" data-home aria-label="${t.home}">${ic("cat", 22)}</button><span id="mtitle">NwebOS</span><button type="button" class="msrch" data-msearch aria-label="${t.search}">${ic2("search")}</button><button type="button" class="mme" data-quick aria-haspopup="dialog" aria-label="${lang === "en" ? "Quick menu: account, day/night, language" : "Schnellmenü: Konto, Tag/Nacht, Sprache"}"><i class="mi" aria-hidden="true"></i><time data-qclock></time><img alt="" src="data:," width="30" height="30" data-qav></button><time id="mclock"></time></nav></footer></div>
<main id="apps">${sections}</main>${tpl}
<script type="application/json" id="os-l">${JSON.stringify(L).replace(/</g, "\\u003c")}</script>
<noscript><p class="nojs-note">${t.nojs}</p></noscript>
</body></html>`;
}

/** OS on or off for this request: ?nwebos=1/0 switches and remembers it in the cookie; else cookie, else `defaultOn`. */
export function nwebosChoice(url, cookies, defaultOn = false) {
  const q = url.searchParams.get("nwebos");
  if (q === "1") return { on: true, setCookie: `${OS_COOKIE}=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax` };
  if (q === "0") return { on: false, setCookie: `${OS_COOKIE}=0; Path=/; Max-Age=31536000; Secure; SameSite=Lax` };   // lasting opt-out
  const c = cookies[OS_COOKIE];
  return { on: c === "1" || (defaultOn && c !== "0"), setCookie: null };
}

/**
 * The window for an OS path: { k, path, m } (m = regex match for dynamic windows), "" for the desktop, or null when the
 * path belongs to no window (assets, APIs, the blog editor, feeds …). Unknown page paths are decided by the worker (404).
 */
export function nwebosRoute(bare) {
  if (bare === "/") return { k: "", path: "/" };
  for (const a of ALL) {
    if (a.path && a.path === bare) return { k: a.k, path: bare };
    const m = a.re && a.re.exec(bare);
    if (m && !(a.k === "blog-post" && ["admin", "feed", "rss"].includes(m[1]))) return { k: a.k, path: bare, m };
  }
  return null;
}
/** Backwards-compatible key lookup (tests, older callers). */
export function nwebosApp(bare) { const r = nwebosRoute(bare); return r ? r.k : null; }
