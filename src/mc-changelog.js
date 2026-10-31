import { AV } from "./asset-version.js";
import { CHANGELOG_MD, CHANGELOG_SRC } from "./generated/changelog.js";
// Changelog-Seite /changelog: rendert NUR den Abschnitt „Für Spieler“ aus mc-stack/CHANGELOG.md (Admin-Teil bleibt intern).
// Kein Inline-Script/-Style (CSP-vorbereitet); Styles in /mc/changelog.css.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
// → [{ title, items: [] }] für die Unterabschnitte (###) des Spieler-Teils; Einträge ohne ### landen in einem Block ohne Titel.
export function playerSections(md = CHANGELOG_MD) {
  const lines = md.split(/\r?\n/); let on = false; const out = []; let cur = null;
  for (const l of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(l);
    if (h2 && !/^###/.test(l)) { on = /spieler/i.test(h2[1]); continue; }
    if (!on) continue;
    const h3 = /^###\s+(.+?)\s*$/.exec(l); if (h3) { out.push(cur = { title: h3[1], items: [] }); continue; }
    const li = /^\s*[-*]\s+(.+?)\s*$/.exec(l); if (li) { if (!cur) out.push(cur = { title: null, items: [] }); cur.items.push(li[1]); }
  }
  return out.filter((s) => s.items.length);
}
export const changelogBody = (md = CHANGELOG_MD) => {
  const S = playerSections(md);
  const list = S.length ? S.map((s) => `<div class="g clg">${s.title ? `<h2 class="clh">${inline(s.title)}</h2>` : `<h2 class="clh">Neu auf dem Server</h2>`}<ul class="cll">${s.items.map((i) => `<li><span class="slot"><img class="mi" alt="" width="20" height="20" src="/mc-icon/v2/writable_book"></span><span>${inline(i)}</span></li>`).join("")}</ul></div>`).join("")
    : `<div class="g empty-st" id="cl-empty"><h2 class="hub-h2">Noch keine Einträge</h2><p class="mut">Sobald es Neuigkeiten gibt, stehen sie hier.</p></div>`;
  return `<link rel="stylesheet" href="/mc/changelog.css?v=${AV}"><section class="hero cl-hero"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Server-News</p><h1 class="hub-h">Changelog.</h1><p class="sub">Was sich auf dem Server geändert hat.</p></div></section>
<section class="sec cl-sec"><div class="hub-wrap cl-wrap" id="changelog">${list}<p class="mut cl-src">Stand: mc-stack@${esc(CHANGELOG_SRC.sha.slice(0, 7))}</p></div></section>`;
};
