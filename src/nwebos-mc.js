// NwebOS · Block Edition for mc.nwebnotfound.dev (mockups/nwebos-mc, Planner 07.11.: option (c), same core, Block look).
// BE-1: the shell (boot, login, desktop, taskbar, start menu, search, tray) around the existing mc pages. Each address
// is one page load whose own window holds that page's body with its scripts (<section data-live>: moved, not cloned,
// so the VIP panel, market, wiki and login keep working unchanged). Desktop and start-menu entries are plain links
// (<html data-os-nav="page">): opening another app loads its page; nothing is fetched into inert windows. German only.
// The boot/login "seen" state is shared with the main site through the nnf_os cookie (data-os-store, core #138).
import { AV } from "./asset-version.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tex = (id, size, cls = "") => `<img class="tx${cls ? " " + cls : ""}" src="/mc-icon/v2/${esc(id)}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async">`;

/** The mc apps (notes.md "Apps -> paths"): key, path, title, texture, search words. Order = desktop order. */
export const MC_APPS = [
  { k: "status", path: "/", t: "Server-Status", tx: "grass_block", kw: "server online status ip verbinden" },
  { k: "spieler", path: "/spieler", t: "Spieler", tx: "player_head", kw: "spieler suche skin profil" },
  { k: "markt", path: "/markt", t: "Markt", tx: "emerald", kw: "markt preise handel cp" },
  { k: "shops", path: "/shops", t: "Shops", tx: "chest", kw: "shops spielershops angebote" },
  { k: "auktionen", path: "/auktionen", t: "Auktionen", tx: "bell", kw: "auktionen gebote" },
  { k: "leaderboards", path: "/leaderboards", t: "Bestenlisten", tx: "diamond", kw: "bestenliste top rang" },
  { k: "pvp", path: "/pvp", t: "PvP", tx: "iron_sword", kw: "pvp arena siege" },
  { k: "parkour", path: "/parkour", t: "Parkour", tx: "golden_boots", kw: "parkour zeiten kurse" },
  { k: "wiki", path: "/wiki", t: "Wiki", tx: "book", kw: "wiki hilfe regeln faq anleitung" },
  { k: "vip", path: "/vip", t: "VIP-Panel", tx: "nether_star", kw: "vip mvp welten panel" },
  { k: "changelog", path: "/changelog", t: "Changelog", tx: "writable_book", kw: "changelog neuigkeiten updates" },
  { k: "feedback", path: "/feedback", t: "Feedback", tx: "compass", kw: "feedback bug idee" },
  { k: "konto", path: "/profile", t: "Mein Konto", tx: "name_tag", kw: "konto profil bestellungen verknüpfen" },
];
/** Which app owns an address (sub pages belong to their app: /spieler/<name> -> spieler, /wiki/<seite> -> wiki …). */
export function mcAppFor(path) {
  if (path === "/") return MC_APPS[0];
  if (path === "/bestellungen" || path === "/abholungen") return MC_APPS.find((a) => a.k === "konto");
  return MC_APPS.find((a) => a.path !== "/" && (path === a.path || path.startsWith(a.path + "/"))) || null;
}

const MAIN = "nwebnotfound.dev";
const DISCORD = '<svg viewBox="0 0 71 55" fill="#fff" aria-hidden="true" focusable="false"><path d="M60.1 4.9A58.5 58.5 0 0045.4.4a40 40 0 00-1.9 3.8 54 54 0 00-16.2 0A40 40 0 0025.4.4 58.4 58.4 0 0010.7 4.9C1.4 18.7-1.1 32.2.1 45.5a59 59 0 0018 9.1 43 43 0 003.8-6.2 38 38 0 01-6-2.9l1.5-1.1a42 42 0 0036 0l1.5 1.1a38 38 0 01-6 2.9 43 43 0 003.8 6.2 58.7 58.7 0 0018-9.1c1.5-15.4-2.5-28.8-10.6-40.6zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2-2.8 7.2-6.4 7.2z"/></svg>';
const HOME_ICON = `<svg viewBox="0 0 16 16" width="40" height="40" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><rect x="2" y="1" width="3" height="3" fill="#1b2238"/><rect x="11" y="1" width="3" height="3" fill="#1b2238"/><rect x="1" y="3" width="14" height="11" fill="#1b2238"/><rect x="2" y="4" width="12" height="9" fill="#fff3d9"/><rect x="4" y="7" width="2" height="2" fill="#1b2238"/><rect x="10" y="7" width="2" height="2" fill="#1b2238"/><rect x="7" y="10" width="2" height="1" fill="#1b2238"/><rect x="3" y="9" width="2" height="1" fill="#ff9fb4"/><rect x="11" y="9" width="2" height="1" fill="#ff9fb4"/></svg>`;

/**
 * One mc page as the Block Edition. `body` is the page's existing body (with its <link>/<script> tags), `head` the mc
 * stylesheets the page needs, `key`/`path` the app and address, `online`/`max` the live player count when known.
 */
export function nwebosMcPage({ title = "", desc = "", body = "", head = "", path = "/", online = null, max = 20 } = {}) {
  const app = mcAppFor(path) || MC_APPS[0];
  const winTitle = title.replace(/\s*·\s*NwebNotFound MC\s*$/, "") || app.t;
  const count = online == null ? "" : `${online}/${max}`;
  const idx = MC_APPS.map((a) => ({ t: a.t, d: "App", url: a.path, ic: a.k, kw: a.kw }))
    .concat([{ t: "Bestellungen", d: "Mein Konto", url: "/bestellungen", ic: "konto", kw: "bestellungen abholfach abholungen bank käufe" }, { t: "Hauptseite", d: "nwebnotfound.dev", url: `https://${MAIN}/`, sw: "main", ic: "status", kw: "hauptseite nwebos blog gästebuch" }]);
  const dicons = MC_APPS.map((a) => `<li><a class="dicon" href="${esc(a.path)}">${tex(a.tx, 40)}<span>${esc(a.t)}</span></a></li>`).join("")
    + `<li><a class="dicon home" href="https://${MAIN}/" data-os-switch="main">${HOME_ICON}<span>Hauptseite</span></a></li>`;
  const progs = MC_APPS.map((a) => `<li><a href="${esc(a.path)}">${tex(a.tx, 24)}<span>${esc(a.t)}</span></a></li>`).join("");
  const tpl = MC_APPS.map((a) => `<template id="ic-${a.k}">${tex(a.tx, 16)}</template>`).join("");
  const L = { lang: "de", path, edition: "Block Edition", routes: [], status: 200, sprite: `/design/nwebos-icons.svg?v=${AV}`, home: "/", login: `https://${MAIN}/auth/discord/login?next=`, logoutUrl: `https://${MAIN}/auth/discord/logout?next=`,
    skip: "Zum Inhalt springen", boot: "Klick oder Taste zum Überspringen", search: "Suchen", searchPh: "Suchen: Apps, Spieler, Wiki …", noHit: "Nichts gefunden für", newTab: "neuer Tab",
    desktop: "Desktop", openWins: "Offene Fenster", start: "Startmenü", theme: "Tag oder Nacht", sound: "Ton an oder aus", logout: "Abmelden", shutdown: "Herunterfahren", aboutOs: "Über NwebOS",
    home2: "Startbildschirm", offText: "Du kannst die Seite jetzt schließen.", offSub: "(oder einfach klicken, dann geht's weiter)", minimize: "Minimieren", maximize: "Maximieren", restoreWin: "Wiederherstellen", close: "Schließen", back: "Zurück", menu: [],
    // "Schnell öffnen" chips of the empty search (the main site's are Blog/Gästebuch/Musik)
    sug: [["markt", "Markt", "/markt"], ["wiki", "Wiki", "/wiki"], ["spieler", "Spieler", "/spieler"], ["changelog", "Changelog", "/changelog"], ["vip", "VIP", "/vip"]] };
  return `<!doctype html>
<html lang="de" class="no-js nwebos edb mc" data-os-store="nwebos-mc" data-os-home="status" data-os-nav="page" data-os-avatar="mc"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(winTitle)} · NwebOS Block Edition</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title || winTitle)}"><meta property="og:description" content="${esc(desc)}"><meta name="theme-color" content="#3f8a2a"><link rel="icon" href="/favicon.ico">
<script src="/design/summer-theme.js?v=${AV}"></script>
<link rel="stylesheet" href="/design/nwebos.css?v=${AV}"><link rel="stylesheet" href="/design/nwebos-apps.css?v=${AV}"><link rel="stylesheet" href="/design/nwebos-polish.css?v=${AV}"><link rel="stylesheet" href="/design/nwebos-phone.css?v=${AV}">
${head}<link rel="stylesheet" href="/design/nwebos-block.css?v=${AV}">
<script src="/design/nwebos.js?v=${AV}" defer></script><script src="/design/nwebos-mc.js?v=${AV}" defer></script></head><body>
<a class="skip" href="#apps">Zum Inhalt springen</a>
<div id="boot" class="scr" hidden><div class="bootin"><div class="blogo">${tex("grass_block", 72)}<span><b>Nweb</b>OS</span></div><small>Block Edition</small><div class="bbar"><i></i><i></i><i></i></div><p>Klick oder Taste zum Überspringen</p></div><span class="bcopy">© {{Y}} Nils Weberruß · kein offizielles Minecraft-Produkt</span></div>
<div id="login" class="scr" hidden role="dialog" aria-modal="true" aria-label="NwebOS"><div class="lgtop"></div><div class="lgmid"><div class="lgl">${tex("grass_block", 64)}<b><span>Nweb</span>OS</b><p>Block Edition · mc.nwebnotfound.dev</p></div>
<ul class="users"><li data-login-me hidden><button type="button" data-user="me"><img data-me-av src="data:," width="56" height="56" alt="" class="hd"><span><b data-me-name></b><small>Minecraft-Account verknüpft</small></span></button></li>
<li data-login-discord><a class="ubtn" data-login-link href="https://${MAIN}/auth/discord/login"><span class="dc">${DISCORD}</span><span><b>Mit Discord anmelden</b><small>dann Minecraft-Account verknüpfen</small></span></a></li>
<li><button type="button" data-user="gast"><span class="guest">${tex("player_head", 40)}</span><span><b>Gast</b><small>ohne Anmeldung umsehen</small></span></button></li></ul></div>
<div class="lgbot"><span>NwebOS · Block Edition</span><span data-srv-line>${count ? `Server online · ${count} Spieler` : "mc.nwebnotfound.dev"}</span></div></div>
<div id="off" class="scr" hidden><div class="offin">${tex("grass_block", 56)}<p>Du kannst die Seite jetzt schließen.</p><small>(oder einfach klicken, dann geht's weiter)</small></div></div>
<div id="desk" hidden><form class="hsearch" role="search"><div class="fld"><input id="hq" type="search" placeholder="Suchen …" aria-label="Suchen" autocomplete="off" enterkeyhint="go" autocapitalize="off" spellcheck="false"><button type="button" class="clr" aria-label="Suche leeren"><i></i></button></div><button type="button" class="cnl">Abbrechen</button><ul class="results" id="hres" hidden></ul></form><ul class="dicons" aria-label="Desktop">${dicons}</ul><div id="wins"></div></div>
<div id="startm" hidden role="menu" aria-label="Startmenü"><div class="smtop"><img id="smav" src="data:," width="44" height="44" alt="" class="hd"><b id="smname">Gast</b></div>
<div class="smsearch"><input id="smq" type="search" placeholder="Suchen: Apps, Spieler, Wiki …" aria-label="Suchen" autocomplete="off"></div><ul class="results" id="smres" hidden></ul>
<div class="smmid"><ul class="progs">${progs}</ul><ul class="side"><li><a href="https://${MAIN}/" data-os-switch="main">${HOME_ICON.replace(/width="40" height="40"/, 'width="20" height="20"')}<span>Hauptseite</span></a></li><li><a href="/profile">${tex("name_tag", 20)}<span>Mein Konto</span></a></li><li><a href="/bestellungen">${tex("chest", 20)}<span>Bestellungen</span></a></li><li><a href="/wiki">${tex("book", 20)}<span>Hilfe (Wiki)</span></a></li></ul></div>
<div class="smbot"><button type="button" data-egg="logout">Abmelden</button><button type="button" data-egg="shutdown" class="sd">Herunterfahren</button></div></div>
<div class="task" role="contentinfo"><button id="startb" type="button" aria-expanded="false" aria-controls="startm" aria-label="Startmenü">${tex("grass_block", 22)}<span>NwebOS</span></button><div id="tbtns" role="tablist" aria-label="Offene Fenster"></div>
<div class="tray"><span class="srv" title="Server-Status" data-srv${count ? "" : " hidden"}><i></i><span data-srv-n>${esc(count)}</span></span>
<button id="thm" type="button" aria-label="Tag oder Nacht" aria-pressed="false"><i></i></button><button id="snd" type="button" aria-pressed="true" aria-label="Ton an oder aus"><svg viewBox="0 0 12 12" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="4" width="3" height="4" fill="#fff"/><rect x="4" y="3" width="1" height="6" fill="#fff"/><rect x="5" y="2" width="1" height="8" fill="#fff"/><rect class="w1" x="8" y="4" width="1" height="4" fill="#fff"/><rect class="w2" x="10" y="3" width="1" height="6" fill="#fff"/><rect class="mx" x="7" y="3" width="5" height="1" fill="#ff8a6b" transform="rotate(45 9 6)"/></svg></button><time id="clock">00:00</time></div>
<div class="mbar" role="navigation" aria-label="NwebOS"><button type="button" data-home aria-label="Startbildschirm">${tex("grass_block", 22)}</button><span id="mtitle">NwebOS</span><button type="button" class="msrch" data-msearch aria-label="Suchen"><svg class="ic2" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="/design/nwebos-icons.svg?v=${AV}#i-c-search"/></svg></button><button type="button" class="mme" data-quick aria-haspopup="dialog" aria-label="Schnellmenü: Konto, Tag/Nacht"><i class="mi" aria-hidden="true"></i><time data-qclock></time><img alt="" src="data:," width="30" height="30" data-qav></button><time id="mclock"></time></div></div>
<main id="apps"><section class="app" id="app-${app.k}" data-app="${app.k}" data-path="${esc(path)}" data-live data-title-de="${esc(winTitle)}" data-title-en="${esc(winTitle)}" data-w="980" data-h="640" data-x="220" data-y="20" data-menu="no" data-kw="${esc(app.kw)}">
${body}
</section></main>${tpl}
<script type="application/json" id="os-index">${JSON.stringify(idx).replace(/</g, "\\u003c")}</script>
<script type="application/json" id="os-l">${JSON.stringify(L).replace(/</g, "\\u003c")}</script>
</body></html>`;
}
