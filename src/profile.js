// Private site profile of nwebnotfound.dev/profile (mockup mockups/feat-site-profile v2). Server-rendered
// for the signed-in owner only (no public view). No Minecraft data here; that stays on mc.nwebnotfound.dev.
// Styles: public/design/profile.css, behaviour: public/design/profile.js.
import { pxIcon } from "./home-icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const parse = (iso) => { const d = new Date(String(iso || "").replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? "" : "Z")); return Number.isNaN(d.getTime()) ? null : d; };
export const sinceLabel = (iso) => { const d = parse(iso); return d ? `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ""; };
const stamp = (iso) => { const d = parse(iso); return d ? `${String(d.getUTCDate()).padStart(2, "0")}. ${MONTHS[d.getUTCMonth()].slice(0, 3).toUpperCase()}<br>${d.getUTCFullYear()}` : ""; };

/**
 * @param {{ user: {name:string, username?:string, avatar?:string}, since?: string, gbCount: number, entries: {message:string, created_at:string}[], logoutHref: string }} d
 */
export function siteProfileBody(d) {
  const { user, entries = [], gbCount = 0 } = d;
  const name = String(user.name || user.username || "Du");
  const avatar = /^https:\/\//.test(user.avatar || "") ? user.avatar : "";
  const gb = gbCount === 1 ? "1 Gruß" : gbCount > 1 ? `${gbCount} Grüße` : "noch keinen Gruß";
  const line = [user.username ? `@${esc(user.username)}` : "", d.since ? `seit ${esc(sinceLabel(d.since))} da` : ""].filter(Boolean).join(" · ");
  const paper = entries.length
    ? entries.slice(0, 3).map((e) => `<p class="p3-entry">${esc(e.message)}</p>`).join("") + `<p class="p3-sign">– ${esc(name)}</p>`
    : `<p class="p3-ps">Hier ist noch Platz. Dein erster Gruß landet auf diesem Blatt.</p>`;
  return `<div class="p2 p3" id="uebersicht">
<section class="p3-head">
<div class="p3-tagcard">
<span class="p3-hole" aria-hidden="true"></span>
<p class="p3-hello">HALLO, ICH BIN</p>
<div class="p3-who">${avatar ? `<img alt="" src="${esc(avatar)}" width="72" height="72">` : ""}<h1 class="p2-name">${esc(name)}</h1></div>
${line ? `<p class="p3-line">${line}</p>` : ""}
</div>
<div class="p3-intro">
<p class="p3-sum">Du hast <b class="u1">${gb}</b> ins Gästebuch geschrieben, <b class="u2">noch keine Sticker</b> gesammelt und <b class="u3">noch kein Kapitel</b> gelesen.</p>
<p class="p3-private">${pxIcon("face", 16)} Nur du siehst diese Seite.</p>
<a class="p3-mc" href="https://mc.nwebnotfound.dev/profile" target="_blank" rel="noopener noreferrer"><img alt="" src="/mc-icon/v2/grass_block" width="20" height="20"> Dein Minecraft-Profil liegt auf mc.nwebnotfound.dev <span class="h2-arrow" aria-hidden="true">&#8250;</span></a>
</div>
</section>
<nav class="p3-tabs" aria-label="Profil" data-p3-tabs><a href="#uebersicht" aria-current="page">Übersicht</a><a href="#lesen">Lesen</a><a href="#erfolge">Erfolge</a><a href="#gaestebuch">Gästebuch</a><a href="#einstellungen">Einstellungen</a></nav>
<div class="p3-grid">
<section class="p3-book" id="lesen">
<h2 class="p3-h">Weiterlesen</h2>
<p class="p3-empty">Noch nichts angefangen. Sobald es Kapitel und Blog-Beiträge gibt, merke ich mir hier, wo du aufgehört hast.</p>
<p class="p3-sub">Gemerkt</p>
<p class="p3-empty">Nichts gemerkt. Lesezeichen für Beiträge und Kapitel kommen mit dem Blog.</p>
</section>
<section class="p3-sheet" id="erfolge" aria-label="Erfolge">
<h2 class="p3-h">Stickerbogen</h2>
<ul class="p3-stickers" aria-hidden="true"><li class="is-off" style="--tint:var(--sm-accent-sakura);--r:-6deg"><span class="p3-st">${pxIcon("heart", 30)}</span><b>???</b></li><li class="is-off" style="--tint:var(--sm-accent-peach);--r:4deg"><span class="p3-st">${pxIcon("text", 30)}</span><b>???</b></li><li class="is-off" style="--tint:var(--sm-accent-grass);--r:-2deg"><span class="p3-st">${pxIcon("pixels", 30)}</span><b>???</b></li></ul>
<p class="p3-scrawl">Hier sammelst du bald Sticker. Manche findest du nur, wenn du genau hinschaust.</p>
</section>
<section class="p3-paper" id="gaestebuch" aria-label="Deine Gästebuch-Einträge">
<span class="p3-tape" aria-hidden="true"></span>
<header class="p3-ph"><h2>Mein Gästebuch</h2>${entries.length ? `<span class="p3-stamp">${stamp(entries[0].created_at)}</span>` : ""}</header>
<div class="p3-lines">${paper}</div>
<footer class="p3-pf">${entries.length ? `<a href="/guestbook">bearbeiten</a> · ` : ""}<a href="/guestbook">${entries.length ? "noch was schreiben" : "Eintrag schreiben"}</a>${pxIcon("heart", 16)}</footer>
<span class="p3-doodle" aria-hidden="true">${pxIcon("star", 28)}</span>
</section>
<section class="p3-acc" id="einstellungen">
<h2 class="p3-h">Konto</h2>
<dl class="p3-dl">
<dt>Name</dt><dd>${esc(name)} <small>von Discord</small></dd>
<dt>Sprache</dt><dd>Deutsch <small>wie oben in der Leiste</small></dd>
<dt>Sichtbar für</dt><dd>nur dich</dd>
<dt>Deine Daten</dt><dd><a href="/api/profile" target="_blank" rel="noopener">ansehen</a> · <button class="p3-linkbtn" type="button" data-p3-delete>löschen</button></dd>
</dl>
<a class="p3-out" href="${esc(d.logoutHref)}">Abmelden</a>
<p class="p3-note" data-p3-msg role="status" aria-live="polite"></p>
</section>
</div>
</div>`;
}
