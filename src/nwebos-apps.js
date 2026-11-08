// NwebOS app windows for the main site (mockups/nwebos/apps, final 07.11.): server-rendered contents.
// Markup and classes follow the mockup (public/design/nwebos-apps.css); behaviour is public/design/nwebos-apps.js.
// Every function returns the inner HTML of one window and is readable without JS. Data comes from the blog
// (D1, src/blog.js), the writing content (src/content.js), the mc changelog and the guestbook.
import { AV } from "./asset-version.js";
import { latestEntries } from "./mc-changelog.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const ic = (k, size = 16, cls = "ic") => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="/design/nwebos-icons.svg?v=${AV}#i-${k}"/></svg>`;
const href = (lang, p) => (lang === "en" ? (p === "/" ? "/en" : "/en" + p) : p);

export const CATS = [["bauen", "Bauen", "Building"], ["server", "Server", "Server"], ["musik", "Musik", "Music"], ["notizen", "Notizen", "Notes"]];
const catName = (k, lang) => { const c = CATS.find((x) => x[0] === k); return c ? c[lang === "en" ? 2 : 1] : k; };
const chip = (c, lang) => `<span class="chip c-${esc(c)}">${esc(catName(c, lang))}</span>`;
const rxc = (n) => `<span class="rxc">${ic("heart", 12)}${Number(n) || 0}</span>`;
const MONTHS = { de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
const MONTHS_LONG = { de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"], en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] };
const berlin = (ms) => { const d = new Date(ms); const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d); const g = (t) => p.find((x) => x.type === t).value; return { d: g("day"), m: +g("month"), y: g("year") }; };
const dateLong = (ms) => { const b = berlin(ms); return `${b.d}.${String(b.m).padStart(2, "0")}.${b.y}`; };
const minutes = (chars) => Math.max(1, Math.round((Number(chars) || 0) / 6 / 200));

// A14: the "Abonnieren" pill; nwebos.js opens the subscribe sheet. Without JS it is the plain feed link.
const RSSI = '<svg viewBox="0 0 16 16" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><rect width="16" height="16" rx="3" fill="#f2a33a"/><rect x="3" y="11" width="2" height="2" fill="#fff"/><path d="M3 7h2v1h1v1h1v1h1v3H6v-2H5v-1H4V9H3zM3 3h4v1h2v1h1v1h1v1h1v2h1v4h-2V9h-1V8h-1V7H9V6H8V5H6V4H3z" fill="#fff"/></svg>';
export const FEED_URL = { blog: () => "/blog/feed.xml", writing: () => "/writing/feed.xml", changelog: (lang) => (lang === "en" ? "/en" : "") + "/changelog/feed.xml" };
const subb = (k, lang) => `<a class="subb" href="${FEED_URL[k](lang)}" data-sub="${k}" role="button">${RSSI}${lang === "en" ? "Subscribe" : "Abonnieren"}</a>`;
// ---------------- Blog list ----------------
/** posts: [{ slug, category, tags[], title, summary, published_at, body_len, hearts }] (published, newest first) */
export function blogList(lang, posts = []) {
  const de = lang !== "en";
  const tags = [...new Set(posts.flatMap((p) => p.tags))].slice(0, 12);
  const months = new Map();
  const mk = (p) => { const b = berlin(p.published_at); return `${b.y}-${String(b.m).padStart(2, "0")}`; };
  for (const p of posts) months.set(mk(p), (months.get(mk(p)) || 0) + 1);
  const q = (p) => esc(`${p.title} ${p.tags.join(" ")}`.toLowerCase());
  const link = (p) => href(lang, "/blog/" + p.slug);
  const [feat, ...rest] = posts;
  const featHtml = feat ? `<article class="feat" data-cat="${esc(feat.category)}" data-m="${mk(feat)}" data-q="${q(feat)}"><a class="cover" href="${link(feat)}" aria-label="${esc(feat.title)} ${de ? "lesen" : "read"}"><span class="sky"></span>${ic("blog", 64)}<i class="new">${de ? "Neu" : "New"}</i></a>
<div class="fbody">${chip(feat.category, lang)}<h3><a href="${link(feat)}">${esc(feat.title)}</a></h3><p>${esc(feat.summary)}</p><p class="meta">${dateLong(feat.published_at)} · ${minutes(feat.body_len)} ${de ? "Min. Lesezeit" : "min read"} · ${rxc(feat.hearts)}</p></div></article>` : "";
  const rows = rest.map((p) => { const b = berlin(p.published_at); return `<li data-cat="${esc(p.category)}" data-m="${mk(p)}" data-q="${q(p)}"><a href="${link(p)}"><span class="dblk"><b>${b.d}</b>${MONTHS[de ? "de" : "en"][b.m - 1]}</span><span class="bt">${chip(p.category, lang)}<b>${esc(p.title)}</b><small>${esc(p.summary)}</small></span><span class="bm">${minutes(p.body_len)} Min.<br>${rxc(p.hearts)}</span></a></li>`; }).join("");
  const empty = de ? "Noch keine Beiträge. Der erste kommt bald." : "No posts yet. The first one is coming soon.";
  return `<div class="bl"><aside class="tasks bl-side" aria-label="Filter">
<div class="tp"><b>${de ? "Suchen" : "Search"}</b><form class="bsearch" role="search" action="${href(lang, "/blog")}"><input type="search" name="q" data-bq placeholder="${de ? "Titel oder Tags …" : "Title or tags …"}" aria-label="${de ? "Titel oder Tags suchen" : "Search title or tags"}"><kbd>/</kbd></form></div>
<div class="tp"><b>${de ? "Kategorien" : "Categories"}</b><nav class="cats" aria-label="${de ? "Kategorien" : "Categories"}"><button type="button" class="on" data-cat="">${de ? "Alle" : "All"} <em>${posts.length}</em></button>${CATS.map(([k]) => `<button type="button" data-cat="${k}">${esc(catName(k, lang))} ${((n) => `<em${n === 0 ? ' class="zero"' : ""}>${n}</em>`)(posts.filter((p) => p.category === k).length)}</button>`).join("")}</nav></div>
${tags.length ? `<details class="tp more" open><summary><b>Tags</b></summary><span class="tagc">${tags.map((t) => `<button type="button" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</span></details>` : ""}
${months.size ? `<details class="tp more" open><summary><b>${de ? "Archiv" : "Archive"}</b></summary><span class="arch">${[...months].map(([k, n]) => `<button type="button" data-month="${k}" aria-pressed="false">${MONTHS_LONG[de ? "de" : "en"][+k.slice(5) - 1]} ${k.slice(0, 4)} <em>${n}</em></button>`).join("")}</span></details>` : ""}
<div class="tp">${subb("blog", lang)}<span>${de ? "Den Roman findest du unter" : "The novel lives in"} <a href="${href(lang, "/writing")}" data-open="writing">${de ? "Texte" : "Writing"}</a>.</span></div></aside>
<div class="bl-main"><p class="bl-h"><b>${de ? "Notizen vom Bauen." : "Notes from building."}</b> <span>${posts.length} ${de ? (posts.length === 1 ? "Beitrag" : "Beiträge") : posts.length === 1 ? "post" : "posts"}</span><span class="subw">${subb("blog", lang)}</span></p>
${posts.length ? featHtml + `<ul class="bposts">${rows}</ul><p class="empty nohit" hidden>${de ? "Keine passenden Beiträge." : "No matching posts."} <button type="button" class="lnk" data-clear>${de ? "Filter zurücksetzen" : "Reset filters"}</button></p>` : `<p class="empty">${empty}</p>`}</div></div>`;
}

// ---------------- Blog post (reader) ----------------
/** post: { slug, category, tags[], title, summary, html, toc[], published_at, body_len, has_en, lang }, rx: { heart, star, sun, mine: Set }, nav: { older, newer } */
export function blogPost(lang, post, rx = {}, { signedIn = false, older = null, newer = null, preview = false } = {}) {
  const de = lang !== "en";
  const url = `https://nwebnotfound.dev${href(post.lang, "/blog/" + post.slug)}`;
  const other = post.has_en ? `<a class="tbtn" href="${post.lang === "en" ? "/blog/" + post.slug : "/en/blog/" + post.slug}" hreflang="${post.lang === "en" ? "de" : "en"}">${post.lang === "en" ? "DE" : "EN"}</a>` : "";
  const toc = post.toc.length > 1 ? `<details class="toc" open><summary>${de ? "Inhalt" : "Contents"}</summary><ol>${post.toc.filter((h) => h.level === 2).map((h, n) => `<li><a href="#${h.id}" data-jump="${h.id}"${n === 0 ? ' class="on"' : ""}>${esc(h.text)}</a></li>`).join("")}</ol>${signedIn ? `<p class="saved">${ic("book", 12)} ${de ? "Lesefortschritt gespeichert" : "Reading progress saved"}</p>` : ""}</details>` : "";
  const kinds = [["heart", de ? "Mag ich" : "Like"], ["star", de ? "Gelernt" : "Learned"], ["sun", de ? "Gute Laune" : "Made my day"]];
  const mine = rx.mine || new Set();
  const react = `<footer class="react"><p>${de ? "Hat dir der Beitrag gefallen?" : "Did you like the post?"}</p><div class="rx" role="group" aria-label="${de ? "Reaktionen" : "Reactions"}" data-rx="${esc(post.slug)}">${kinds.map(([k, l]) => `<button type="button" data-react="${k}" aria-pressed="${mine.has(k)}">${ic(k, 18)}<span>${l}</span><em>${Number(rx[k]) || 0}</em></button>`).join("")}</div>
<p class="rxn">${de ? "Reaktionen ohne Kommentare. Antworten gern im" : "Reactions, no comments. Replies welcome in the"} <a class="lnk" href="${href(lang, "/guestbook")}" data-open="guestbook">${de ? "Gästebuch" : "guestbook"}</a>.${signedIn ? "" : ` <small>${de ? "Zum Reagieren mit Discord anmelden." : "Sign in with Discord to react."}</small>`}</p></footer>`;
  const pn = `<nav class="pn2">${older ? `<a href="${href(lang, "/blog/" + older.slug)}"><small>‹ ${de ? "Älter" : "Older"}</small>${esc(older.title)}</a>` : `<span><small>‹ ${de ? "Älter" : "Older"}</small>${de ? "noch nichts" : "nothing yet"}</span>`}${newer ? `<a href="${href(lang, "/blog/" + newer.slug)}"><small>${de ? "Neuer" : "Newer"} ›</small>${esc(newer.title)}</a>` : `<span><small>${de ? "Neuer" : "Newer"} ›</small>${de ? "noch nichts" : "nothing yet"}</span>`}</nav>`;
  return `<div class="rd" data-read="${esc(post.slug)}"><div class="rbar"><a class="tbtn" href="${href(lang, "/blog")}" data-open="blog">‹ ${de ? "Alle Beiträge" : "All posts"}</a><span class="sp"></span>
<button type="button" class="tbtn" data-fs="-1" aria-label="${de ? "Schrift kleiner" : "Smaller text"}">A−</button><button type="button" class="tbtn" data-fs="1" aria-label="${de ? "Schrift größer" : "Larger text"}">A+</button>${other}<button type="button" class="tbtn" data-copy="${esc(url)}">${de ? "Link kopieren" : "Copy link"}</button></div>
<div class="prog" aria-hidden="true"><i></i></div><div class="rscroll"><div class="rgrid">${toc}
<article class="post" lang="${post.lang}">${preview ? `<p class="draftpill" role="status">${de ? "Entwurf · nur mit Link sichtbar" : "Draft · visible with the link only"}</p>` : ""}<p class="crumb2">Blog › ${esc(catName(post.category, lang))}</p><h1>${esc(post.title)}</h1>
<p class="by">${ic("cat", 28, "ic dav")}<span><b>Nils</b><small>${post.published_at ? dateLong(post.published_at) + " · " : ""}${minutes(post.body_len)} ${de ? "Min. Lesezeit" : "min read"}</small></span>${chip(post.category, lang)}${post.tags.length ? `<span class="tg">${post.tags.map((t) => "#" + esc(t)).join(" ")}</span>` : ""}</p>
${post.summary ? `<p class="lead">${esc(post.summary)}</p>` : ""}<div class="pbody">${post.html}</div>
${preview ? "" : react}${preview ? "" : pn}</article></div></div></div>`;
}

// ---------------- Changelog ----------------
// Site entries: the merged main-site PRs (real), newest first. Server entries come from the mc changelog.
const SITE_LOG = [
  ["2026-11-07", "blog", "Blog mit Editor", "Blog with an editor", "Beiträge entstehen jetzt im Editor auf der Website, mit Vorschau, Autosave, Suche und RSS.", "Posts are now written in the editor on the website, with preview, autosave, search and RSS."],
  ["2026-11-07", "website", "Saubere Links pro Sprache", "Clean links per language", "Jeder Blog-Beitrag hat eine feste Adresse auf Deutsch und auf Englisch.", "Every blog post has a fixed address in German and in English."],
  ["2026-11-07", "website", "NwebOS-Desktop", "NwebOS desktop", "Die Hauptseite als kleines Betriebssystem: Fenster, Taskleiste, Startmenü.", "The main site as a tiny operating system: windows, taskbar, start menu."],
  ["2026-11-06", "website", "Neue Startseite", "New home page", "Die Hauptseite stellt Nils und seine Projekte vor.", "The main site introduces Nils and his projects."],
  ["2026-11-06", "website", "Schnellere Website", "Faster website", "Styles, Skripte und Bilder werden besser zwischengespeichert.", "Styles, scripts and images are cached better."],
  ["2026-11-06", "website", "Eine Navigation für alles", "One navigation for everything", "Hauptseite und Server-Seite teilen sich dieselbe Leiste.", "The main site and the server site share the same bar."],
];
const TN = { website: ["Website", "Website"], server: ["Server", "Server"], blog: ["Blog", "Blog"] };
function changelogDays(lang, today) {
  const de = lang !== "en";
  const groups = new Map();
  // one row per change: the mc changelog repeats some website changes of the same day (Design QA #115)
  const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
  const add = (iso, t, title, text) => { if (!groups.has(iso)) groups.set(iso, []); const g = groups.get(iso); if (g.some((x) => key(x.title) === key(title))) return; g.push({ t, title, text }); };
  for (const [iso, t, tde, ten, xde, xen] of SITE_LOG) add(iso, t, de ? tde : ten, de ? xde : xen);
  const year = today.getUTCFullYear();
  for (const e of latestEntries(24, undefined, lang)) {
    if (!e.date) continue;
    const [dd, mm] = e.date.split(".");
    const iso = `${year}-${mm}-${dd}`;
    add(iso, /\b(?:website|webseite)\b/i.test(e.title + " " + e.sub) ? "website" : "server", e.title, e.sub);
  }
  return { groups };
}
export function changelog(lang, today = new Date()) {
  const de = lang !== "en";
  const { groups } = changelogDays(lang, today);
  const todayIso = new Date(today.getTime() + 3600e3).toISOString().slice(0, 10);
  const days = [...groups.keys()].sort().reverse().slice(0, 8);
  const fmt = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
  return `<div class="cl2"><header class="clh">${ic("changelog", 40)}<div><b>${de ? "Neu auf NwebOS" : "New on NwebOS"}</b><small>${de ? "Sommer Edition · Stand" : "Summer Edition · as of"} ${days[0] ? fmt(days[0]) : ""}</small></div>${subb("changelog", lang)}</header>
<nav class="seg clf" aria-label="Filter"><button type="button" class="on" data-clf="">${de ? "Alle" : "All"}</button><button type="button" data-clf="website">Website</button><button type="button" data-clf="server">Server</button><button type="button" data-clf="blog">Blog</button></nav>
<ol class="tl">${days.map((iso) => `<li><h3><time datetime="${iso}">${fmt(iso)}</time>${iso === todayIso ? ` <i class="today">${de ? "heute" : "today"}</i>` : ""}</h3><ul>${groups.get(iso).map((x) => `<li data-t="${x.t}"><span class="ctag t-${x.t}">${TN[x.t][de ? 0 : 1]}</span><b>${esc(x.title)}</b>${x.text ? `<p>${esc(x.text)}</p>` : ""}</li>`).join("")}</ul></li>`).join("")}</ol>
<p class="hint">${de ? "Server-Neuigkeiten kommen aus dem Changelog von" : "Server news comes from the changelog of"} <a href="https://mc.nwebnotfound.dev/changelog">mc.nwebnotfound.dev</a>.</p></div>`;
}

// A14: the changelog as RSS (/changelog/feed.xml, /en/changelog/feed.xml): the same rows as the window, newest 30
export function changelogFeed(lang, today = new Date()) {
  const de = lang !== "en", { groups } = changelogDays(lang, today), SITE = "https://nwebnotfound.dev", page = SITE + (de ? "" : "/en") + "/changelog";
  const x = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
  const items = [];
  for (const iso of [...groups.keys()].sort().reverse()) for (const e of groups.get(iso)) items.push({ iso, ...e });
  const out = ['<?xml version="1.0" encoding="utf-8"?>', '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">', "<channel>",
    `<title>${de ? "Neuigkeiten" : "What's new"} · NwebNotFound</title>`, `<link>${page}</link>`, `<description>${x(de ? "Neues an Website und Minecraft-Server." : "New on the website and the Minecraft server.")}</description>`, `<language>${de ? "de" : "en"}</language>`,
    `<atom:link href="${SITE}${FEED_URL.changelog(lang)}" rel="self" type="application/rss+xml"/>`];
  for (const e of items.slice(0, 30)) {
    const id = e.iso + "-" + e.title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    out.push("<item>", `<title>${x(e.title)}</title>`, `<link>${page}#${encodeURIComponent(e.iso)}</link>`, `<guid isPermaLink="false">${x("changelog:" + id)}</guid>`,
      `<pubDate>${new Date(e.iso + "T12:00:00Z").toUTCString()}</pubDate>`, `<description>${x(e.text || "")}</description>`, `<category>${TN[e.t][de ? 0 : 1]}</category>`, "</item>");
  }
  out.push("</channel>", "</rss>");
  return out.join("\n") + "\n";
}

// ---------------- Music ----------------
// No tracks exist yet: example titles, labelled; the player plays nothing until real tracks exist.
// No real tracks exist yet (phone polish 3e): the player says so instead of showing made-up titles. Add real ones as
// [title, "mm:ss"]; then the playlist and the controls switch on.
const TRACKS = [];
/** Control icons (pixel, currentColor; i-c-* in nwebos-icons.svg). */
export const ic2 = (k) => `<svg class="ic2" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="/design/nwebos-icons.svg?v=${AV}#i-c-${k}"/></svg>`;
export function music(lang) {
  const de = lang !== "en";
  const bars = [0.5, 0.8, 0.6, 0.95, 0.7, 0.4, 0.85, 0.55, 0.75, 0.35, 0.65, 0.9, 0.45, 0.7, 0.5, 0.3];
  const none = TRACKS.length === 0, dis = none ? ' aria-disabled="true"' : "";
  const t0 = TRACKS[0] || null;
  const lcdRow = none ? `<span>${de ? "NOCH KEIN TRACK" : "NO TRACK YET"}</span><span data-time>--:-- / --:--</span>` : `<span>TRACK 01</span><span data-time>00:00 / ${esc(t0[1])}</span>`;
  const ticker = none ? (de ? "ERSTER LOOP KOMMT BALD · FL STUDIO ·&nbsp;" : "FIRST LOOP COMING SOON · FL STUDIO ·&nbsp;") : `${esc(t0[0].toUpperCase())} · NILS · FL STUDIO ·&nbsp;`;
  const list = none
    ? `<p class="empty">${de ? "Noch keine Tracks. Sobald der erste Loop aus FL Studio fertig ist, spielt er hier." : "No tracks yet. Once the first loop from FL Studio is done, it plays here."}</p>`
    : `<p class="plh">Playlist</p><ol class="pl">${TRACKS.map(([t, d], n) => `<li${n === 0 ? ' class="on"' : ""}><button type="button"><span class="n">${String(n + 1).padStart(2, "0")}</span><b>${esc(t)}</b><span>${esc(d)}</span></button></li>`).join("")}</ol>`;
  return `<div class="mp" data-mp><div class="mlcd"><div class="row">${lcdRow}</div>
<div class="msc"><span>${ticker}</span><span>${ticker}</span></div>
<div class="viz" aria-hidden="true">${bars.map((h) => `<i style="--h:${h}"></i>`).join("")}</div></div>
<input class="seek" type="range" min="0" max="100" value="0" style="--v:0" aria-label="${de ? "Position" : "Position"}"${none ? " disabled" : ""}>
<div class="mctl"><button type="button" class="sm" data-toggle aria-pressed="false" aria-label="${de ? "Zufall" : "Shuffle"}"${dis}>${ic2("shuffle")}</button><button type="button" aria-label="${de ? "Zurück" : "Previous"}"${dis}>${ic2("prev")}</button><button type="button" class="pp" data-play aria-label="${de ? "Abspielen" : "Play"}" aria-pressed="false"${dis}><span class="i-play">${ic2("play")}</span><span class="i-pause">${ic2("pause")}</span></button><button type="button" aria-label="${de ? "Weiter" : "Next"}"${dis}>${ic2("next")}</button><button type="button" class="sm" data-toggle aria-pressed="false" aria-label="${de ? "Wiederholen" : "Repeat"}"${dis}>${ic2("repeat")}</button>
<label class="mvol">${ic("music", 14)}<input type="range" min="0" max="10" value="7" style="--v:70" aria-label="${de ? "Lautstärke" : "Volume"}"></label></div>
${list}</div>`;
}

// ---------------- Writing library + chapter ----------------
/** series: [{ slug, title, chapters: [{ n, title, slug }] }] from src/content.js (published stories) */
export function writing(lang, series = [], shorts = []) {
  const de = lang !== "en";
  const s = series[0];
  const head = s ? `<header class="libh"><div class="bkc">${ic("writing", 48)}<span>${de ? "ROMAN" : "NOVEL"}</span></div><div><small>${de ? "Roman" : "Novel"}</small><b>${esc(s.title)}</b>
<p>${de ? "Eine Geschichte in Kapiteln." : "A story in chapters."}</p><p class="btns"><a class="xpbtn go" href="${href(lang, `/writing/${s.slug}/${s.chapters[0].n}`)}">${de ? "Von vorn lesen" : "Start reading"}</a></p></div></header>
<h3>${de ? "Kapitel" : "Chapters"}</h3><ol class="chs">${s.chapters.map((c) => `<li><a href="${href(lang, `/writing/${s.slug}/${c.n}`)}"><span class="n">${c.n}</span><b>${esc(c.title)}</b><span class="pg"><i style="width:0%"></i></span><em></em></a></li>`).join("")}</ol>`
    : `<header class="libh"><div class="bkc">${ic("writing", 48)}<span>${de ? "ROMAN" : "NOVEL"}</span></div><div><small>${de ? "Roman · in Arbeit" : "Novel · in progress"}</small><b>${de ? "Der Roman entsteht gerade" : "The novel is being written"}</b><p>${de ? "Eine Geschichte in Kapiteln. Das erste Kapitel erscheint hier, sobald es fertig ist." : "A story in chapters. The first chapter appears here once it's done."}</p></div></header>`;
  const sh = shorts.length ? `<ul class="dash">${shorts.map((x) => `<li><a href="${href(lang, "/writing/" + x.slug)}"><b>${esc(x.title)}</b></a></li>`).join("")}</ul>` : `<p class="empty">${de ? "Noch keine Kurztexte." : "No short texts yet."}</p>`;
  return `<div class="lib"><div class="subw">${subb("writing", lang)}</div>${head}<h3>${de ? "Kurztexte" : "Short texts"}</h3>${sh}</div>`;
}
export function chapter(lang, ser, item, html, prev, next) {
  const de = lang !== "en";
  const total = ser.chapters.length;
  const link = (c) => href(lang, `/writing/${ser.slug}/${c.n}`);
  return `<div class="rd rbook" data-read="writing:${esc(ser.slug)}:${item.chapter}"><div class="rbar"><a class="tbtn" href="${href(lang, "/writing")}" data-open="writing">‹ ${de ? "Bibliothek" : "Library"}</a><span class="rtitle">${esc(ser.title)} · ${de ? "Kapitel" : "Chapter"} ${item.chapter} ${de ? "von" : "of"} ${total}</span><span class="sp"></span>
<button type="button" class="tbtn" data-fs="-1" aria-label="${de ? "Schrift kleiner" : "Smaller text"}">A−</button><button type="button" class="tbtn" data-fs="1" aria-label="${de ? "Schrift größer" : "Larger text"}">A+</button><button type="button" class="tbtn" data-paper aria-pressed="false" aria-label="${de ? "Nachtpapier" : "Night paper"}">${ic("star", 14)}</button></div>
<div class="prog" aria-hidden="true"><i></i></div><div class="rscroll"><article class="page"><p class="kap">${de ? "Kapitel" : "Chapter"} ${item.chapter}</p><h1>${esc(item.title)}</h1><div class="drop">${html}</div>
<nav class="pn2">${prev ? `<a href="${link(prev)}"><small>‹ ${de ? "Kapitel" : "Chapter"} ${prev.n}</small>${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a href="${link(next)}"><small>${de ? "Kapitel" : "Chapter"} ${next.n} ›</small>${esc(next.title)}</a>` : `<span><small>${de ? "Nächstes Kapitel" : "Next chapter"} ›</small>${de ? "in Arbeit" : "in progress"}</span>`}</nav></article></div></div>`;
}

// ---------------- Trash, 404, coming soon ----------------
const TRASH = [["blog", "alte-startseite.html", "06.11.2026", "ersetzt durch NwebOS", "replaced by NwebOS"], ["about", "riesiges-minecraft-banner.png", "06.11.2026", "die Seite soll um Nils gehen", "the site should be about Nils"], ["writing", "lorem-ipsum.txt", "01.11.2026", "war nie echt", "was never real"], ["music", "loop-final-final-2.flp", "21.10.2026", "„final“ war gelogen", "“final” was a lie"]];
export function trash(lang) {
  const de = lang !== "en";
  return `<div class="explorer trw"><aside class="tasks"><div class="tp"><b>${de ? "Papierkorb-Aufgaben" : "Recycle bin tasks"}</b><button type="button" class="lnk" data-trash-empty>${de ? "Papierkorb leeren" : "Empty the recycle bin"}</button><button type="button" class="lnk" data-trash-restore>${de ? "Alle wiederherstellen" : "Restore all"}</button></div>
<div class="tp"><b>Details</b><span data-trash-count>${TRASH.length} ${de ? "Objekte" : "items"}</span></div></aside><div class="trm"><table class="xtbl trt"><thead><tr><th>Name</th><th>${de ? "Gelöscht am" : "Deleted on"}</th><th>${de ? "Grund" : "Reason"}</th></tr></thead><tbody>
${TRASH.map(([k, n, d, gde, gen]) => `<tr tabindex="0"><td>${ic(k, 16)} ${esc(n)}</td><td>${d}</td><td>${esc(de ? gde : gen)}</td></tr>`).join("")}</tbody></table>
<div class="tempty" hidden>${ic("cat", 48)}<p><b>${de ? "Der Papierkorb ist leer." : "The recycle bin is empty."}</b><br>${de ? "Sauber. Fast zu sauber." : "Clean. Almost too clean."}</p></div>
<div class="trq" hidden role="alertdialog" aria-label="${de ? "Papierkorb leeren" : "Empty the recycle bin"}">${ic("warn", 32)}<p>${de ? `Sollen wirklich alle ${TRASH.length} Objekte endgültig gelöscht werden?` : `Really delete all ${TRASH.length} items for good?`}</p><p class="btns"><button type="button" class="xpbtn go" data-trash-yes>${de ? "Ja" : "Yes"}</button><button type="button" class="xpbtn" data-trash-no>${de ? "Nein" : "No"}</button></p></div></div></div>`;
}
export function notfound(lang, path) {
  const de = lang !== "en";
  return `<div class="nf">${ic("warn", 48)}<div><b>${de ? "Diese Seite gibt es nicht." : "This page doesn't exist."}</b><p><code>nwebnotfound.dev${esc(path)}</code> ${de ? "wurde nicht gefunden. Passt ja irgendwie zum Namen." : "was not found. Fitting, given the name."}</p>
<p>${de ? "Vielleicht meintest du:" : "Maybe you meant:"}</p><ul class="sug"><li><a href="${href(lang, "/blog")}" data-open="blog">${ic("blog", 16)} Blog</a></li><li><a href="${href(lang, "/portfolio")}" data-open="portfolio">${ic("portfolio", 16)} ${de ? "Projekte" : "Projects"}</a></li><li><a href="${href(lang, "/guestbook")}" data-open="guestbook">${ic("guestbook", 16)} ${de ? "Gästebuch" : "Guestbook"}</a></li></ul>
<p class="btns"><a class="xpbtn go" href="${href(lang, "/")}" data-close>${de ? "Zum Desktop" : "To the desktop"}</a><button type="button" class="xpbtn" data-focus-search>${de ? "Suchen …" : "Search …"}</button></p><p class="hint">${de ? "Fehler 404 · die Adresse bleibt so stehen, damit du sie prüfen kannst." : "Error 404 · the address stays as it is so you can check it."}</p></div></div>`;
}
export function soon(lang) {
  const de = lang !== "en";
  return `<div class="nf soonw">${ic("soon", 48)}<div><b>${de ? "Pixelwand kommt bald." : "The pixel wall is coming soon."}</b><p>${de ? "Eine gemeinsame Leinwand, auf der jeder ein paar Pixel setzt. Noch ist sie nur eine Idee." : "A shared canvas where everyone sets a few pixels. For now it's just an idea."}</p>
<div class="build" aria-label="${de ? "Fortschritt: Idee" : "Progress: idea"}"><i></i></div><p class="hint">${de ? "Status: Idee · steht auf der Liste in" : "Status: idea · on the list in"} <a class="lnk" href="${href(lang, "/portfolio")}" data-open="portfolio">${de ? "Projekte" : "Projects"}</a></p>
<p class="btns"><a class="xpbtn go" href="${href(lang, "/portfolio")}" data-open="portfolio">${de ? "Zu den Projekten" : "To the projects"}</a><button type="button" class="xpbtn" data-closewin>${de ? "Schließen" : "Close"}</button></p></div></div>`;
}

// ---------------- Profile (private) ----------------
// ---------------- Mein Profil v3 (mockups/nwebos/apps/profile-v3/notes.md) ----------------
const R3 = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const PX = (r, n = 16) => `<svg viewBox="0 0 16 16" width="${n}" height="${n}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`;
const ART = {
  heart: R3(3, 3, 4, 2, "#e2483d") + R3(9, 3, 4, 2, "#e2483d") + R3(2, 5, 12, 3, "#e2483d") + R3(3, 8, 10, 2, "#e2483d") + R3(5, 10, 6, 2, "#e2483d") + R3(7, 12, 2, 1, "#e2483d") + R3(4, 4, 2, 1, "#fff"),
  book: R3(2, 3, 6, 10, "#1b2238") + R3(8, 3, 6, 10, "#1b2238") + R3(3, 4, 4, 8, "#fff") + R3(9, 4, 4, 8, "#fff") + R3(4, 6, 2, 1, "#7a5fd6") + R3(10, 6, 2, 1, "#7a5fd6") + R3(4, 8, 2, 1, "#7a5fd6") + R3(10, 8, 2, 1, "#7a5fd6"),
  five: R3(1, 4, 3, 3, "#2bb3a3") + R3(5, 4, 3, 3, "#2bb3a3") + R3(9, 4, 3, 3, "#f2a33a") + R3(13, 4, 2, 3, "#2bb3a3") + R3(1, 9, 3, 3, "#2bb3a3") + R3(5, 9, 3, 3, "#2bb3a3") + R3(9, 9, 3, 3, "#2bb3a3") + R3(13, 9, 2, 3, "#2bb3a3"),
  mine: R3(5, 4, 6, 8, "#1b2238") + R3(4, 5, 8, 6, "#1b2238") + R3(7, 2, 2, 12, "#1b2238") + R3(2, 7, 12, 2, "#1b2238") + R3(6, 6, 2, 2, "#fff"),
  pixel: R3(2, 2, 4, 4, "#ff7fb6") + R3(6, 2, 4, 4, "#7ad3ff") + R3(10, 2, 4, 4, "#ffd23f") + R3(2, 6, 4, 4, "#5fbf4f") + R3(6, 6, 4, 4, "#1b2238") + R3(10, 6, 4, 4, "#7a5fd6") + R3(2, 10, 4, 4, "#ffd23f") + R3(6, 10, 4, 4, "#ff8a6b") + R3(10, 10, 4, 4, "#7ad3ff"),
  note: R3(6, 2, 7, 2, "#1b2238") + R3(11, 2, 2, 8, "#1b2238") + R3(6, 2, 2, 10, "#1b2238") + R3(2, 10, 5, 4, "#1b2238") + R3(9, 8, 4, 4, "#1b2238"),
  sun: R3(5, 5, 6, 6, "#1b2238") + R3(6, 6, 4, 4, "#fff6dc") + R3(7, 1, 2, 2, "#1b2238") + R3(7, 13, 2, 2, "#1b2238") + R3(1, 7, 2, 2, "#1b2238") + R3(13, 7, 2, 2, "#1b2238"),
  lock: R3(5, 2, 6, 2, "#d9452f") + R3(4, 4, 2, 3, "#d9452f") + R3(10, 4, 2, 3, "#d9452f") + R3(3, 7, 10, 7, "#d9452f"),
  rss: R3(0, 0, 16, 16, "#f2a33a") + R3(3, 11, 2, 2, "#fff") + R3(3, 7, 2, 1, "#fff") + R3(5, 8, 2, 1, "#fff") + R3(7, 9, 1, 2, "#fff") + R3(8, 11, 1, 2, "#fff") + R3(3, 3, 3, 1, "#fff") + R3(6, 4, 2, 1, "#fff") + R3(8, 5, 2, 1, "#fff") + R3(10, 6, 1, 2, "#fff") + R3(11, 8, 1, 2, "#fff") + R3(12, 10, 1, 3, "#fff"),
  mc: R3(1, 1, 14, 5, "#5fbf4f") + R3(1, 6, 14, 9, "#8a5a2b") + R3(3, 8, 2, 2, "#6b4520") + R3(9, 10, 2, 2, "#6b4520") + R3(12, 7, 2, 2, "#6b4520") + R3(1, 5, 3, 2, "#5fbf4f") + R3(8, 5, 2, 2, "#5fbf4f"),
};
const DISCORD_W = '<svg viewBox="0 0 71 55" width="40" height="40" fill="#fff" aria-hidden="true" focusable="false"><path d="M60.1 4.9A58.5 58.5 0 0045.4.4a40 40 0 00-1.9 3.8 54 54 0 00-16.2 0A40 40 0 0025.4.4 58.4 58.4 0 0010.7 4.9C1.4 18.7-1.1 32.2.1 45.5a59 59 0 0018 9.1 43 43 0 003.8-6.2 38 38 0 01-6-2.9l1.5-1.1a42 42 0 0036 0l1.5 1.1a38 38 0 01-6 2.9 43 43 0 003.8 6.2 58.7 58.7 0 0018-9.1c1.5-15.4-2.5-28.8-10.6-40.6zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2z"/></svg>';
/* badge set 1: id, art, sticker colour, DE/EN name, DE/EN condition */
const BADGE_SET = [
  ["gruss", "heart", "#ff9ec7", ["Erster Gruß", "First hello"], ["ins Gästebuch geschrieben", "signed the guestbook"]],
  ["leseratte", "book", "#b9a8ff", ["Leseratte", "Bookworm"], ["einen Beitrag bis zum Ende gelesen", "read a post to the end"]],
  ["fuenf5", "five", "#7fe0d3", ["Fünf am Stück", "Five in a row"], ["Fünf-Serie von 5", "a Fünf streak of 5"]],
  ["minen", "mine", "#ffd23f", ["Minenräumer", "Minesweeper"], ["Pixelminen gewonnen", "won Pixel Mines"]],
  ["pixel", "pixel", "#7ad3ff", ["Pixelkünstler", "Pixel artist"], ["10 Pixel auf der Pixelwand", "10 pixels on the pixel wall"], ["kommt mit der Pixelwand", "comes with the pixel wall"]],
  ["ohrwurm", "note", "#ffe27a", ["Ohrwurm", "Earworm"], ["einen Loop geladen", "downloaded a loop"], ["kommt mit dem Studio", "comes with the Studio"]],
  ["nacht", "sun", "#ffd23f", ["???", "???"], ["geheim", "secret"]],
];
const day = (ms, de) => { const d = new Date(Number(ms) || 0); return de ? `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.` : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }); };
const mmss = (s) => (s == null ? "–" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) + " %" : "–");

/** d (signed in): { user: { name, username, avatar }, gbCount, entries: [{ message, created_at }], reads: [{ title, kind,
 *  pct, href }], link: { mc_name, verified, has_role } | null, prefs, games: { "mines:9x9": row, "five:de": row, … },
 *  badges: [{ badge, earned_at }], session: { created_at, expires_at } } — or null for guests. */
export function profile(lang, d) {
  const de = lang !== "en", L = (pair) => pair[de ? 0 : 1], T = (a, b) => (de ? a : b);
  if (!d) {
    return `<div class="pf p3"><div class="p3-out"><span class="big">${DISCORD_W}</span><h2>${T("Dein Profil", "Your profile")}</h2><p>${T("Mit Discord anmelden, und NwebOS merkt sich ein paar Dinge für dich:", "Sign in with Discord and NwebOS remembers a few things for you:")}</p>
<ul><li>${ic("blog", 22)}${T("wo du beim Lesen warst", "where you stopped reading")}</li><li>${PX(ART.five, 22)}${T("deine Spiele-Bestwerte, auf jedem Gerät", "your game records, on every device")}</li><li>${PX(ART.sun, 22)}${T("Abzeichen für kleine Erfolge", "badges for small wins")}</li><li>${ic("guestbook", 22)}${T("deinen Gästebuch-Eintrag", "your guestbook entry")}</li></ul>
<a class="xpbtn discord" href="/auth/discord/login?next=${encodeURIComponent(href(lang, "/profile"))}">${T("Mit Discord anmelden", "Sign in with Discord")}</a><p class="small">${T("Nur Name und Bild. Keine E-Mail, kein Tracking.", "Name and picture only. No email, no tracking.")}</p></div></div>`;
  }
  const av = /^https:\/\//.test(d.user.avatar || "") ? d.user.avatar : "";
  const avImg = (cls, n) => (av ? `<img class="${cls}" src="${esc(av)}" width="${n}" height="${n}" alt="">` : ic("cat", n, "ic " + cls));
  const games = d.games || {}, mines = games["mines:9x9"] || null;
  const fv = ["five:de", "five:en"].map((k) => games[k]).filter(Boolean);
  const five = fv.length ? fv.reduce((a, r) => ({ played: a.played + r.played, won: a.won + r.won, streak: Math.max(a.streak, r.streak), best_streak: Math.max(a.best_streak, r.best_streak), dist: [0, 1, 2, 3, 4, 5].map((i) => (a.dist[i] || 0) + ((r.dist || [])[i] || 0)) }), { played: 0, won: 0, streak: 0, best_streak: 0, dist: [0, 0, 0, 0, 0, 0] }) : null;
  const got = new Map((d.badges || []).map((b) => [b.badge, b.earned_at]));
  const nGot = BADGE_SET.filter((b) => got.has(b[0])).length;
  const readDone = (d.reads || []).filter((r) => r.pct >= 100).length;
  const progress = { leseratte: [readDone, 1], fuenf5: [Math.min(5, five ? five.streak : 0), 5], minen: [mines && mines.won ? 1 : 0, 1], gruss: [d.gbCount ? 1 : 0, 1] };
  const sticker = (b, small) => {
    const [id, art, col, name, cond, later] = b, at = got.get(id), secret = id === "nacht" && !at, pr = progress[id];
    const bar = !at && pr && pr[1] > 1 ? `<span class="bar" style="--p:${Math.round((pr[0] / pr[1]) * 100)}%"></span><small>${pr[0]} / ${pr[1]}</small>` : "";
    return `<div class="p3-bdg${at ? "" : " lock"}${secret ? " secret" : ""}" style="--c:${col}"><span class="st">${secret ? "?" : PX(ART[art], 34)}</span><b>${secret ? "???" : L(name)}</b>${small ? "" : `<small>${at ? T("bekommen am ", "earned ") + day(at, de) : later ? L(later) : L(cond)}</small>${bar}`}</div>`;
  };
  const newest = [...BADGE_SET].filter((b) => got.has(b[0])).sort((a, b) => got.get(b[0]) - got.get(a[0])).slice(0, 3);
  const stat = (n, label) => `<span class="p3-stat"><b>${n}</b>${label}</span>`;
  const head = `<header class="p3-hd"><div class="tagst p3-tag"><span class="hi top">${T("HALLO, ICH BIN", "HELLO, MY NAME IS")}</span><span class="nm mid">${avImg("dav", 40)}<b>${esc(d.user.name)}</b></span></div>
<div><div class="p3-facts">${stat(d.gbCount, d.gbCount === 1 ? T("Gruß", "hello") : T("Grüße", "hellos"))}${stat(readDone, T("Texte gelesen", "texts read"))}${stat(nGot, `/ ${BADGE_SET.length} ${T("Abzeichen", "badges")}`)}${stat(five ? five.streak : 0, T("Fünf-Serie", "Fünf streak"))}</div><p class="p3-priv"><i aria-hidden="true"></i>${T("Nur du siehst diese Seite.", "Only you can see this page.")}</p></div></header>`;
  const tabs = [["over", T("Übersicht", "Overview")], ["games", T("Spiele", "Games")], ["badges", T("Abzeichen", "Badges"), `${nGot}/${BADGE_SET.length}`], ["set", T("Einstellungen", "Settings")]];
  const tabBar = `<nav class="p3-tabs" role="tablist" aria-label="${T("Profil", "Profile")}">${tabs.map(([k, t, em], i) => `<button type="button" role="tab" data-pane="p3-${k}" aria-selected="${i === 0}"${i === 0 ? ' class="on"' : ""}>${t}${em ? `<em>${em}</em>` : ""}</button>`).join("")}</nav>`;
  const r0 = (d.reads || [])[0];   /* the last post or chapter (newest first) */
  const readCard = r0 ? `<a class="p3-row p3-read" href="${esc(r0.href)}">${ic("blog", 28)}<span><b>${esc(r0.title)}</b><small>${esc(r0.kind)} · ${r0.pct} % ${T("gelesen", "read")}</small><span class="bar" style="--p:${Math.max(0, Math.min(100, r0.pct))}%"></span></span><em>›</em></a>`
    : `<div class="p3-empty">${PX(ART.book, 40)}${T("Noch nichts angefangen.", "Nothing started yet.")}<a class="xpbtn" href="${href(lang, "/blog")}" data-open="blog">${T("Zum Blog", "Go to the blog")}</a></div>`;
  const e = (d.entries || [])[0];
  const gbCard = e ? `<div class="p3-paper paper"><span class="stamp">${esc(String(e.created_at).slice(0, 10).split("-").reverse().join("."))}</span><p>${esc(e.message)}</p><small>– ${esc(d.user.name)}</small></div>`
    : `<div class="p3-empty">${PX(ART.heart, 40)}${T("Du hast noch nicht ins Gästebuch geschrieben.", "You haven’t signed the guestbook yet.")}<a class="xpbtn" href="${href(lang, "/guestbook")}" data-open="guestbook">${T("Gästebuch öffnen", "Open the guestbook")}</a></div>`;
  const link = d.link && d.link.verified ? d.link : null;
  const mcCard = link ? `<div class="p3-row">${'<span class="p3-ok">✓</span>'}<span><b>${esc(link.mc_name)}</b><small>${T("verknüpft · Rang, Stats und VIP-Welten auf mc.nwebnotfound.dev", "linked · rank, stats and VIP worlds on mc.nwebnotfound.dev")}</small></span><a class="xpbtn" href="https://mc.nwebnotfound.dev/profile" rel="noopener">${T("Öffnen ↗", "Open ↗")}</a></div>`
    : `<p class="p3-mut">${T("Noch nicht verknüpft. Auf dem Server <b>/link</b> eingeben, dann im Discord bestätigen.", "Not linked yet. Type <b>/link</b> on the server, then confirm in Discord.")}</p><a class="xpbtn" href="https://mc.nwebnotfound.dev/profile" rel="noopener">${T("Verknüpfen auf mc ↗", "Link on mc ↗")}</a>`;
  const over = `<div class="p3-grid"><section class="p3-card"><h3>${ic("blog", 22)}${T("Weiterlesen", "Continue reading")}</h3>${readCard}</section>
<section class="p3-card"><h3>${ic("guestbook", 22)}${T("Dein Gästebuch-Eintrag", "Your guestbook entry")}<a href="${href(lang, "/guestbook")}" data-open="guestbook">${T("schreiben", "write")}</a></h3>${gbCard}</section>
<section class="p3-card"><h3>${PX(ART.five, 22)}${T("Spiele", "Games")}<a href="#p3-games" data-p3-tab="games">${T("alle Werte", "all stats")}</a></h3><div class="p3-mini"><div><b>${mmss(mines ? mines.best : null)}</b><small>${T("Pixelminen-Bestzeit", "Pixel Mines best")}</small></div><div><b>${five ? five.streak : 0}</b><small>${T("Fünf-Serie", "Fünf streak")}</small></div><div><b>${five ? pctOf(five.won, five.played) : "–"}</b><small>${T("Fünf gewonnen", "Fünf won")}</small></div></div></section>
<section class="p3-card"><h3>${PX(ART.sun, 22)}${T("Abzeichen", "Badges")} <span class="p3-cnt">${nGot} / ${BADGE_SET.length}</span><a href="#p3-badges" data-p3-tab="badges">${T("alle ansehen", "see all")}</a></h3><div class="p3-strip">${newest.length ? newest.map((b) => sticker(b, 1)).join("") : `<p class="p3-mut">${T("Noch keine – schau mal in den Abzeichen-Tab.", "None yet – have a look at the badges tab.")}</p>`}</div></section>
<section class="p3-card wide"><h3>${PX(ART.mc, 22)}Minecraft</h3>${mcCard}</section></div>`;
  const dist = five ? five.dist : [0, 0, 0, 0, 0, 0], dmax = Math.max(1, ...dist), dtop = dist.indexOf(Math.max(...dist));
  const sync = (t) => `<span class="p3-sync"><i aria-hidden="true"></i>${t}</span>`;
  const gm = (cells) => `<div class="p3-gm">${cells.map(([n, l]) => `<div><b>${n}</b><small>${l}</small></div>`).join("")}</div>`;
  const gamesV = `<div class="p3-grid"><section class="p3-card"><h3>${ic("mines", 22)}Pixelminen${sync(T("mit Konto synchronisiert", "synced to your account"))}</h3>${gm([[mines ? mines.played : 0, T("gespielt", "played")], [mines ? mines.won : 0, T("gewonnen", "won")], [mines ? pctOf(mines.won, mines.played) : "–", T("Quote", "win rate")], [mmss(mines ? mines.best : null), T("Bestzeit", "best time")]])}
<div class="p3-sizes"><div><span>9 × 9 · 10 ${T("Minen", "mines")}</span><b>${mmss(mines ? mines.best : null)}</b></div><div class="soon"><span>16 × 16 · 40 ${T("Minen", "mines")}</span><b>–</b><small>${T("kommt", "soon")}</small></div></div></section>
<section class="p3-card"><h3>${ic("five", 22)}Fünf${sync(T("synchronisiert", "synced"))}</h3>${gm([[five ? five.played : 0, T("gespielt", "played")], [five ? pctOf(five.won, five.played) : "–", T("gewonnen", "won")], [five ? five.streak : 0, T("Serie", "streak")], [five ? five.best_streak : 0, T("beste Serie", "best streak")]])}
<p class="p3-cap">${T("Versuche bis zum Wort", "Guesses to solve")}</p><div class="p3-dist">${dist.map((n, i) => `<div${n && i === dtop ? ' class="on"' : ""}><span>${i + 1}</span><i style="--w:${Math.max(8, Math.round((n / dmax) * 100))}%">${n}</i></div>`).join("")}</div></section>
<section class="p3-card wide p3-merge" data-p3-merge hidden><h3>${T("Auf diesem Gerät gespeichert", "Saved on this device")}</h3><p class="p3-mut" data-p3-merge-text></p><div class="p3-acts"><button type="button" class="xpbtn go" data-p3-merge-yes>${T("Übernehmen", "Add them")}</button><button type="button" class="xpbtn" data-p3-merge-no>${T("Verwerfen", "Discard")}</button></div></section></div>`;
  const badgesV = `<p class="p3-mut">${T("Kleine Sticker für Dinge, die du auf der Seite machst. Graue fehlen noch.", "Little stickers for things you do on the site. Grey ones are still missing.")}</p><div class="p3-badges">${BADGE_SET.map((b) => sticker(b)).join("")}</div>`;
  const p = d.prefs || {};
  const sw = (key, on, label) => `<button type="button" class="p3s" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-p3-pref="${key}"></button>`;
  const row = (icon, t, sub, end, opt = {}) => { const tag = opt.href ? "a" : "div"; return `<li><${tag} class="p3-row${opt.cls ? " " + opt.cls : ""}"${opt.href ? ` href="${esc(opt.href)}"` : ""}${opt.attrs || ""}><span class="ri">${icon}</span><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</span>${end}</${tag}></li>`; };
  const grp = (h, rows) => `<div class="p3-grp"><h4>${h}</h4><ul class="p3-list">${rows.join("")}</ul></div>`;
  const days = d.session && d.session.expires_at ? Math.max(0, Math.ceil((Date.parse(String(d.session.expires_at).replace(" ", "T") + "Z") - Date.now()) / 864e5)) : null;
  const since = d.session && d.session.created_at ? String(d.session.created_at).slice(0, 10).split("-").reverse().join(".") : "";
  const setV = `<div class="p3-set">${grp(T("Darstellung", "Display"), [
    row(ic("about", 24), T("Sprache", "Language"), "", `<span class="p3-seg" role="group" aria-label="${T("Sprache", "Language")}"><a href="/profile" hreflang="de" aria-pressed="${de}" data-p3-lang="de">DE</a><a href="/en/profile" hreflang="en" aria-pressed="${!de}" data-p3-lang="en">EN</a></span>`),
    row(PX(ART.sun, 24), T("Design", "Theme"), T("Automatisch folgt deinem Gerät", "Auto follows your device"), `<span class="p3-seg" role="group" aria-label="${T("Design", "Theme")}">${[["day", T("Tag", "Day")], ["night", T("Nacht", "Night")], ["auto", "Auto"]].map(([k, t]) => `<button type="button" data-p3-theme="${k}" aria-pressed="${(p.theme || "day") === k}">${t}</button>`).join("")}</span>`),
    row(ic("about", 24), T("Start-Animation", "Boot animation"), T("NwebOS-Startbildschirm beim ersten Besuch am Tag", "NwebOS boot screen on the first visit of the day"), sw("boot", p.boot !== 0, T("Start-Animation", "Boot animation"))),
    row(PX(ART.pixel, 24), T("Bewegung reduzieren", "Reduce motion"), T("keine Fenster-, Wolken- und Pop-Animationen", "no window, cloud and pop animations"), sw("reduced_motion", p.reduced_motion === 1, T("Bewegung reduzieren", "Reduce motion"))),
  ])}${grp(T("Ton", "Sound"), [row(PX(ART.note, 24), T("Klänge", "Sounds"), T("Klicks, Start-Jingle, Spiele", "clicks, start jingle, games"), sw("sound", p.sound !== 0, T("Klänge", "Sounds")))])}
${grp(T("Neues mitbekommen", "Stay updated"), [row(PX(ART.rss, 24), T("Per RSS abonnieren", "Subscribe via RSS"), T("Blog, Neuigkeiten, Texte", "blog, what’s new, writing"), "<em>›</em>", { href: "/blog/feed.xml", attrs: ' data-sub="blog" role="button"' })])}
${grp(T("Verbundene Konten", "Connected accounts"), [
    row(avImg("p3-acc", 24), `Discord · @${esc(d.user.username || d.user.name)}`, T("Name und Bild kommen von Discord", "name and picture come from Discord"), `<span class="p3-ok">✓ ${T("verbunden", "connected")}</span>`),
    link ? row(PX(ART.mc, 24), `Minecraft · ${esc(link.mc_name)}`, T("verknüpft · auf mc verwalten", "linked · manage on mc"), "<em>↗</em>", { href: "https://mc.nwebnotfound.dev/profile" }) : row(PX(ART.mc, 24), "Minecraft", T("noch nicht verknüpft", "not linked yet"), `<em>${T("Verknüpfen ↗", "Link ↗")}</em>`, { href: "https://mc.nwebnotfound.dev/profile" }),
  ])}
${grp(T("Sitzung", "Session"), [row(ic("profile", 24), T("Angemeldet auf diesem Gerät", "Signed in on this device"), since ? `${T("seit", "since")} ${since}${days != null ? ` · ${T("läuft ab in", "expires in")} ${days} ${days === 1 ? T("Tag", "day") : T("Tagen", "days")}` : ""}` : "", `<button type="button" class="xpbtn" data-egg="logout">${T("Abmelden", "Sign out")}</button>`)])}
${grp(T("Deine Daten", "Your data"), [
    row(ic("writing", 24), T("Meine Daten herunterladen", "Download my data"), T("alles, was wir über dich speichern, als JSON", "everything we store about you, as JSON"), "<em>↓</em>", { href: "/api/profile/export", attrs: " download" }),
    `<li><button type="button" class="p3-row dz" data-pf-delete><span class="ri">${PX(ART.lock, 24)}</span><span><b>${T("Daten löschen", "Delete my data")}</b><small>${T("Gästebuch, Lesefortschritt, Reaktionen, Spiele, Abzeichen, Sitzungen", "guestbook, reading progress, reactions, games, badges, sessions")}</small></span><em>›</em></button></li>`,
  ])}</div>`;
  const panel = (k, html, on) => `<section class="p3-pane" data-panel="p3-${k}" id="p3-${k}" role="tabpanel"${on ? "" : " hidden"}>${html}</section>`;
  return `<div class="pf p3" data-p3>${head}${tabBar}${panel("over", over, 1)}${panel("games", gamesV)}${panel("badges", badgesV)}${panel("set", setV)}</div>`;
}
