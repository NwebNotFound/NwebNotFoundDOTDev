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
    if (h2 && !/^###/.test(l)) { on = /spieler/i.test(h2[1]); cur = null; continue; }
    if (!on) continue;
    const h3 = /^###\s+(.+?)\s*$/.exec(l); if (h3) { out.push(cur = { title: h3[1], items: [] }); continue; }
    const li = /^\s*[-*]\s+(.+?)\s*$/.exec(l); if (li) { if (!cur) out.push(cur = { title: null, items: [] }); cur.items.push(li[1]); }
  }
  return out.filter((s) => s.items.length);
}
// Group sections with an explicitly stated date; never infer a date for undated source entries.
function sectionDate(title) {
  if (!title) return null;
  const match = title.match(/\b(\d{4})-(\d{2})-(\d{2})\b/) || title.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (!match) return null;
  const iso = match[1].length === 4 ? `${match[1]}-${match[2]}-${match[3]}` : `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso ? { iso, label: match[0] } : null;
}

// Explicit update types take precedence. Topic labels use only words in the entry itself;
// unknown text stays neutral instead of claiming a change is new or fixed.
function entryCategory(text) {
  const type = text.match(/^\s*(?:\*\*)?(?:\[(neu|new|feature|fix|fixes|behoben|geändert|geaendert|changed|change|balance|event)\]|(neu|new|feature|fix|fixes|behoben|geändert|geaendert|changed|change|balance|event)\s*:)/i);
  const name = (type?.[1] || type?.[2] || "").toLowerCase();
  const status = ["neu", "new", "feature"].includes(name) ? { id: "new", label: "Neu", icon: "grass_block", chip: "t-new" }
    : ["fix", "fixes", "behoben"].includes(name) ? { id: "fix", label: "Fix", icon: "anvil", chip: "t-fix" }
    : ["balance"].includes(name) ? { id: "balance", label: "Balance", icon: "gold_ingot", chip: "t-chg" }
    : ["event"].includes(name) ? { id: "event", label: "Event", icon: "bell", chip: "t-new" }
    : ["geändert", "geaendert", "changed", "change"].includes(name) ? { id: "change", label: "Geändert", icon: "comparator", chip: "t-chg" } : null;
  const topic = /\bdiscord\b/i.test(text) ? { id: "discord", label: "Discord", icon: "note_block" }
    : /\b(?:website|webseite|webseite\w*|websit\w*)\b/i.test(text) ? { id: "website", label: "Website", icon: "filled_map" }
    : /\b(?:economy|wirtschaft|cp|bank)\b/i.test(text) ? { id: "economy", label: "Economy", icon: "emerald" }
    : /\b(?:server|survival|lobby)\b/i.test(text) ? { id: "server", label: "Server", icon: "grass_block" } : null;
  if (topic) return { ...topic, label: status?.label || topic.label, chip: status?.chip || "" };
  if (status) return status;
  if (/\b(?:offline|einloggen|verbindung)\b/i.test(text)) return { id: "connection", label: "Verbindung", icon: "ender_pearl", chip: "" };
  if (/\b(?:verkauf\w*|verkaufst|handel\w*|markt\w*|shop\w*)/i.test(text)) return { id: "trade", label: "Handel", icon: "emerald", chip: "" };
  return { id: "other", label: "Eintrag", icon: "writable_book", chip: "" };
}

function renderEntry(text) {
  const category = entryCategory(text);
  return `<li data-category="${category.id}"><span class="slot cl-icon"><img loading="lazy" class="mi" alt="" width="20" height="20" src="/mc-icon/v2/${category.icon}"></span><span class="cl-entry"><span class="chip ${category.chip}">${category.label}</span><span class="cl-copy">${inline(text)}</span></span></li>`;
}

/** Latest player-facing entries for the start page: [{ date: "06.11." | "", title, sub, text }], newest first.
 *  An entry is "Title sentence. Optional second sentence as subline." under a dated `### dd.mm.yyyy` heading. */
export function latestEntries(limit = 4, md = CHANGELOG_MD) {
  const out = [];
  for (const section of playerSections(md)) {
    const d = sectionDate(section.title);
    const date = d ? `${d.iso.slice(8, 10)}.${d.iso.slice(5, 7)}.` : "";
    for (const raw of section.items) {
      const plain = (x) => x.replace(/^\s*(?:\*\*)?\[[^\]]+\](?:\*\*)?\s*/, "").replace(/[`*]/g, "").trim();
      // "**Title** – subline" (preferred), else the first sentence is the title and the rest the subline.
      const bold = /^\s*\*\*(.+?)\*\*\s*[–—-]\s*(\S.*)$/s.exec(raw);
      const text = bold ? plain(bold[2]) : plain(raw);
      if (!text) continue;
      const cut = bold ? null : /^(.+?[.!?])\s+(\S.*)$/s.exec(text);
      out.push({ date, text, title: bold ? plain(bold[1]) : (cut ? cut[1] : text).replace(/[.]$/, ""), sub: bold ? text : cut ? cut[2] : "" });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export const changelogBody = (md = CHANGELOG_MD) => {
  const groups = [];
  for (const section of playerSections(md)) {
    const date = sectionDate(section.title);
    let group = date && groups.find((g) => g.date?.iso === date.iso);
    if (!group) groups.push(group = { date, sections: [] });
    group.sections.push(section);
  }
  const list = groups.length ? `<div class="cl-timeline">${groups.map((group) => `<article class="g clg"${group.date ? ` data-date="${group.date.iso}"` : ""}>${group.date ? `<time class="chip cl-date" datetime="${group.date.iso}">${esc(group.date.label)}</time>` : ""}${group.sections.map((s) => `${s.title ? `<h2 class="clh">${inline(s.title)}</h2>` : `<h2 class="clh">Neu auf dem Server</h2>`}<ul class="cll">${s.items.map(renderEntry).join("")}</ul>`).join("")}</article>`).join("")}</div>`
    : `<div class="g empty-st" id="cl-empty"><h2 class="hub-h2">Noch keine Einträge</h2><p class="mut">Sobald es Neuigkeiten gibt, stehen sie hier.</p></div>`;
  return `<link rel="stylesheet" href="/mc/changelog.css?v=${AV}"><section class="hero cl-hero"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Server-News</p><h1 class="hub-h">Changelog.</h1><p class="sub">Was sich auf dem Server geändert hat.</p></div></section>
<section class="sec cl-sec"><div class="hub-wrap cl-wrap" id="changelog">${list}<p class="mut cl-src">Stand: mc-stack@${esc(CHANGELOG_SRC.sha.slice(0, 7))}</p></div></section>`;
};
