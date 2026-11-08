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
/** One filter for the Texte window (Planner 08.11.): f.series = a series slug (that series, no short texts), f.tag = a
 *  tag (chapters and short texts carrying it). Old shared links /writing/series/<s> and /writing?tag=<t> land here. */
export function filterTexte(series, shorts, f = {}) {
  const has = (it) => Array.isArray(it && it.tags) && it.tags.includes(f.tag);
  if (f.series) { series = series.filter((s) => s.slug === f.series); shorts = []; }
  if (f.tag) { series = series.map((s) => ({ ...s, chapters: s.chapters.filter((c) => has(c.item)) })).filter((s) => s.chapters.length); shorts = shorts.filter(has); }
  return { series, shorts };
}
export function writing(lang, allSeries = [], allShorts = [], f = {}) {
  const de = lang !== "en";
  const { series, shorts } = filterTexte(allSeries, allShorts, f);
  const fs = f.series && allSeries.find((x) => x.slug === f.series);
  const chip = f.series || f.tag ? `<p class="fchip" role="status"><span>${f.series ? `${de ? "Serie" : "Series"}: ${esc(fs ? fs.title : f.series)}` : `#${esc(f.tag)}`}</span><a href="${href(lang, "/writing")}" data-open="writing" aria-label="${de ? "Filter entfernen" : "Clear filter"}">×</a></p>` : "";
  const s = series[0];
  const head = s ? `<header class="libh"><div class="bkc">${ic("writing", 48)}<span>${de ? "ROMAN" : "NOVEL"}</span></div><div><small>${de ? "Roman" : "Novel"}</small><b>${esc(s.title)}</b>
<p>${de ? "Eine Geschichte in Kapiteln." : "A story in chapters."}</p><p class="btns"><a class="xpbtn go" href="${href(lang, `/writing/${s.slug}/${s.chapters[0].n}`)}">${de ? "Von vorn lesen" : "Start reading"}</a></p></div></header>
<h3>${de ? "Kapitel" : "Chapters"}</h3><ol class="chs">${s.chapters.map((c) => `<li><a href="${href(lang, `/writing/${s.slug}/${c.n}`)}"><span class="n">${c.n}</span><b>${esc(c.title)}</b><span class="pg"><i style="width:0%"></i></span><em></em></a></li>`).join("")}</ol>`
    : `<header class="libh"><div class="bkc">${ic("writing", 48)}<span>${de ? "ROMAN" : "NOVEL"}</span></div><div><small>${de ? "Roman · in Arbeit" : "Novel · in progress"}</small><b>${de ? "Der Roman entsteht gerade" : "The novel is being written"}</b><p>${de ? "Eine Geschichte in Kapiteln. Das erste Kapitel erscheint hier, sobald es fertig ist." : "A story in chapters. The first chapter appears here once it's done."}</p></div></header>`;
  const sh = shorts.length ? `<ul class="dash">${shorts.map((x) => `<li><a href="${href(lang, "/writing/" + x.slug)}"><b>${esc(x.title)}</b></a></li>`).join("")}</ul>` : `<p class="empty">${de ? "Noch keine Kurztexte." : "No short texts yet."}</p>`;
  const none = f.tag && !series.length && !shorts.length ? `<p class="empty">${de ? "Nichts mit diesem Stichwort." : "Nothing with this tag."}</p>` : "";
  return `<div class="lib"><div class="subw">${subb("writing", lang)}</div>${chip}${none}${f.tag && !series.length ? "" : head}${f.series ? "" : `<h3>${de ? "Kurztexte" : "Short texts"}</h3>${sh}`}</div>`;
}
/* A text from Texte that is not a chapter (/writing/<slug>): the chapter reader without series navigation. item: the
   content index entry ({ title, date, lang, archived, readingMinutes, tags }). Written in another language than the
   window: a note says so. */
export function text(lang, item, html) {
  const de = lang !== "en", other = item.lang && item.lang !== lang;
  return `<div class="rd rbook" data-read="writing:${esc(item.slug)}"><div class="rbar"><a class="tbtn" href="${href(lang, "/writing")}" data-open="writing">‹ ${de ? "Bibliothek" : "Library"}</a><span class="rtitle">${esc(item.title)}</span><span class="sp"></span>
<button type="button" class="tbtn" data-fs="-1" aria-label="${de ? "Schrift kleiner" : "Smaller text"}">A−</button><button type="button" class="tbtn" data-fs="1" aria-label="${de ? "Schrift größer" : "Larger text"}">A+</button></div>
<div class="prog" aria-hidden="true"><i></i></div><div class="rscroll"><article class="page"${item.lang ? ` lang="${esc(item.lang)}"` : ""}><p class="kap">${item.date ? `<time datetime="${esc(item.date)}">${esc(item.date.split("-").reverse().join("."))}</time> · ` : ""}${Number(item.readingMinutes) || 1} ${de ? "Min. Lesezeit" : "min read"}</p><h1>${esc(item.title)}</h1>
${item.archived ? `<p class="arch" role="note">${de ? "Dieser Text wurde archiviert. Er bleibt über den direkten Link lesbar, wird aber nicht mehr in der Übersicht geführt." : "This text has been archived. It stays readable through the direct link but is no longer listed."}</p>` : ""}${other ? `<p class="arch" role="note" lang="${lang}">${de ? (item.lang === "en" ? "Original auf Englisch." : "Original in einer anderen Sprache.") : item.lang === "de" ? "Original in German." : "Original in another language."}</p>` : ""}<div class="drop">${html}</div></article></div></div>`;
}

/* x (from the old chapter page, now that it is gone): { archived, epub, seriesEpub } — download + print + rights, and the
   archived note. An archived chapter is not exported. Print runs window.print() from nwebos-apps.js (no inline handler). */
export function chapter(lang, ser, item, html, prev, next, x = {}) {
  const de = lang !== "en";
  const total = ser.chapters.length;
  const link = (c) => href(lang, `/writing/${ser.slug}/${c.n}`);
  return `<div class="rd rbook" data-read="writing:${esc(ser.slug)}:${item.chapter}"><div class="rbar"><a class="tbtn" href="${href(lang, "/writing")}" data-open="writing">‹ ${de ? "Bibliothek" : "Library"}</a><span class="rtitle">${esc(ser.title)} · ${de ? "Kapitel" : "Chapter"} ${item.chapter} ${de ? "von" : "of"} ${total}</span><span class="sp"></span>
<button type="button" class="tbtn" data-fs="-1" aria-label="${de ? "Schrift kleiner" : "Smaller text"}">A−</button><button type="button" class="tbtn" data-fs="1" aria-label="${de ? "Schrift größer" : "Larger text"}">A+</button><button type="button" class="tbtn" data-paper aria-pressed="false" aria-label="${de ? "Nachtpapier" : "Night paper"}">${ic("star", 14)}</button></div>
<div class="prog" aria-hidden="true"><i></i></div><div class="rscroll"><article class="page"><p class="kap">${de ? "Kapitel" : "Chapter"} ${item.chapter}</p><h1>${esc(item.title)}</h1>${x.itemLang && x.itemLang !== lang ? `<p class="arch" role="note">${de ? (x.itemLang === "en" ? "Original auf Englisch." : "Original in einer anderen Sprache.") : x.itemLang === "de" ? "Original in German." : "Original in another language."}</p>` : ""}${x.archived ? `<p class="arch" role="note">${de ? "Dieses Kapitel wurde archiviert. Es bleibt über den direkten Link lesbar, wird aber nicht mehr in der Übersicht geführt." : "This chapter has been archived. It stays readable through the direct link but is no longer listed."}</p>` : ""}<div class="drop">${html}</div>
${x.epub && !x.archived ? `<p class="rexpb"><button type="button" class="xpbtn" data-rexp aria-haspopup="dialog">${de ? "Herunterladen & drucken" : "Download & print"}</button></p><aside class="rexp" aria-label="${de ? "Herunterladen und drucken" : "Download and print"}"><a class="xpbtn" href="${esc(x.epub)}" download>${de ? "EPUB herunterladen" : "Download EPUB"}</a>${x.seriesEpub ? `<a class="xpbtn" href="${esc(x.seriesEpub)}" download>${de ? "Ganze Serie als EPUB" : "Whole series as EPUB"}</a>` : ""}<button type="button" class="xpbtn" data-print>${de ? "Als PDF drucken" : "Print as PDF"}</button>
<p class="hint">${de ? "Drucken öffnet den Druckdialog – dort „Als PDF speichern“ wählen." : "Print opens the print dialog – choose “Save as PDF” there."}</p><p class="rights">${de ? "© Nils, nur zum persönlichen Lesen." : "© Nils, personal reading only."}</p></aside>` : ""}
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
/** d: { user: { name, avatar }, gbCount, entries: [{ message, created_at }], reads: [{ title, kind, pct, href }] } or null for guests */
export function profile(lang, d) {
  const de = lang !== "en";
  if (!d) return `<div class="nf">${ic("profile", 48)}<div><b>${de ? "Dein Profil ist privat." : "Your profile is private."}</b><p>${de ? "Melde dich mit Discord an, dann siehst du hier deine Gästebuch-Einträge und was du gerade liest." : "Sign in with Discord to see your guestbook entries and what you're reading."}</p><p class="btns"><a class="xpbtn discord" href="/auth/discord/login?next=${encodeURIComponent("https://nwebnotfound.dev" + href(lang, "/profile"))}">${de ? "Mit Discord anmelden" : "Sign in with Discord"}</a></p></div></div>`;
  const av = /^https:\/\//.test(d.user.avatar || "") ? `<img class="dav" src="${esc(d.user.avatar)}" width="40" height="40" alt="">` : ic("cat", 40, "ic dav");
  const n = d.gbCount, r = d.reads.length;
  const sentence = de ? `Du hast <mark>${n} ${n === 1 ? "Gruß" : "Grüße"}</mark> ins Gästebuch geschrieben und <mark>${r} ${r === 1 ? "Text" : "Texte"}</mark> angefangen zu lesen.` : `You wrote <mark>${n} ${n === 1 ? "greeting" : "greetings"}</mark> in the guestbook and started reading <mark>${r} ${r === 1 ? "text" : "texts"}</mark>.`;
  const bookm = r ? `<ul class="bmk">${d.reads.map((x) => `<li><a href="${esc(x.href)}"><i class="rib"></i><span><small>${esc(x.kind)}</small><b>${esc(x.title)}</b><span class="pg"><i style="width:${Math.max(0, Math.min(100, x.pct))}%"></i></span><small>${x.pct} % ${de ? "gelesen · weiterlesen ›" : "read · continue ›"}</small></span></a></li>`).join("")}</ul>` : `<p class="empty">${de ? "Noch nichts angefangen. Im" : "Nothing started yet. Try the"} <a href="${href(lang, "/blog")}" data-open="blog">Blog</a> ${de ? "findest du etwas zum Lesen." : "for something to read."}</p>`;
  const e = d.entries[0];
  const paper = e ? `<div class="paper"><i class="tape"></i><span class="stamp">${esc(String(e.created_at).slice(0, 10).split("-").reverse().join("."))}</span><p class="hand">${esc(e.message)}</p><p class="sig">— ${esc(d.user.name)}</p><p class="ppl"><a class="lnk" href="${href(lang, "/guestbook")}" data-open="guestbook">${de ? "noch was schreiben" : "write something else"}</a></p></div>` : `<p class="empty">${de ? "Noch kein Eintrag." : "No entry yet."} <a href="${href(lang, "/guestbook")}" data-open="guestbook">${de ? "Ins Gästebuch schreiben" : "Sign the guestbook"}</a></p>`;
  const tabs = [["o", de ? "Übersicht" : "Overview"], ["r", de ? "Lesen" : "Reading"], ["g", de ? "Gästebuch" : "Guestbook"], ["s", de ? "Einstellungen" : "Settings"]];
  return `<div class="pf"><header class="pfh"><div class="tagst"><span class="hi">${de ? "HALLO, ICH BIN" : "HELLO, I AM"}</span><span class="nm">${av} ${esc(d.user.name)}</span></div>
<div class="pft"><p>${sentence}</p><p class="hint">${de ? "Nur du siehst diese Seite." : "Only you can see this page."} · <a href="https://mc.nwebnotfound.dev/profile">${de ? "Minecraft-Profil auf mc.nwebnotfound.dev ›" : "Minecraft profile on mc.nwebnotfound.dev ›"}</a></p></div></header>
<nav class="utabs" aria-label="${de ? "Profil" : "Profile"}">${tabs.map(([k, t], i) => `<button type="button" data-pane="pf-${k}"${i === 0 ? ' class="on"' : ""}>${t}</button>`).join("")}</nav>
<section class="pfp" data-panel="pf-o"><div class="pfcols"><div><h3>${de ? "Weiterlesen" : "Continue reading"}</h3>${bookm}</div><div><h3>${de ? "Dein Gästebuch-Eintrag" : "Your guestbook entry"}</h3>${paper}</div></div></section>
<section class="pfp" data-panel="pf-r" hidden><h3>${de ? "Weiterlesen" : "Continue reading"}</h3>${bookm}</section>
<section class="pfp" data-panel="pf-g" hidden>${paper}</section>
<section class="pfp" data-panel="pf-s" hidden><ul class="dash"><li><b>${de ? "Anzeigename" : "Display name"}</b><small>${esc(d.user.name)} · ${de ? "kommt von Discord" : "from Discord"}</small></li><li><b>${de ? "Sprache" : "Language"}</b><span class="seg"><a class="${de ? "on" : ""}" href="/profile">Deutsch</a><a class="${de ? "" : "on"}" href="/en/profile">English</a></span></li>
<li><b>${de ? "Sichtbarkeit" : "Visibility"}</b><small>${de ? "Nur für dich. Profile sind privat." : "Only you. Profiles are private."}</small></li><li><b>${de ? "Meine Daten" : "My data"}</b><span><button type="button" class="lnk danger" data-pf-delete>${de ? "Gästebuch-Einträge, Lesefortschritt, Reaktionen und Sitzungen löschen" : "Delete guestbook entries, reading progress, reactions and sessions"}</button></span></li>
<li><b>${de ? "Abmelden" : "Sign out"}</b><button type="button" class="xpbtn" data-egg="logout">${de ? "Abmelden" : "Sign out"}</button></li></ul></section></div>`;
}
