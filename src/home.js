// Start page body of nwebnotfound.dev (mockups/feat-home-about-me). Text: src/home-content.js, icons:
// src/home-icons.js, styles: public/design/home.css, guestbook teaser: public/design/home.js.
import { HOME } from "./home-content.js";
import { pxIcon } from "./home-icons.js";
import { latestEntries } from "./mc-changelog.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICYCLE = ["site", "star", "sparkle", "clock"];

/** `[[word|2]]` -> <mark class="m2">word</mark>, everything else escaped. */
const leadHtml = (s) =>
  String(s).split(/(\[\[[^\]]+\]\])/).map((part) => {
    const m = /^\[\[(.+)\|([1-4])\]\]$/.exec(part);
    return m ? `<mark class="m${m[2]}">${esc(m[1])}</mark>` : esc(part);
  }).join("");

const tile = (inner, tint, small) => `<span class="h2-tile${small ? " is-sm" : ""}" style="--tint:var(--sm-accent-${tint})">${inner}</span>`;

/**
 * @param {string} lang "de" | "en"
 * @param {{ href: (path: string, lang: string) => string, github: string, x: string }} ctx
 */
export function homeAbout(lang, ctx) {
  const c = HOME[lang] || HOME.de;
  const url = (p) => (/^https?:/.test(p) ? p : ctx.href(p, lang));
  const ext = (u) => (/^https?:/.test(u) ? ` target="_blank" rel="noopener noreferrer"` : "");
  const gb = "/guestbook"; // German-only page, no language prefix
  const facts = c.facts.map((f) => `<li><span class="h2-fi">${pxIcon(f.icon, 20)}</span><span class="h2-fk">${esc(f.k)}</span><span class="h2-fv">${esc(f.v)}</span></li>`).join("") +
    `<li><span class="h2-fi">${pxIcon("mail", 20)}</span><span class="h2-fk">${esc(c.findK)}</span><span class="h2-fv"><a href="${esc(ctx.github)}" target="_blank" rel="noopener noreferrer">GitHub</a> · <a href="${esc(ctx.x)}" target="_blank" rel="noopener noreferrer">X</a></span></li>`;
  const projects = c.projects.map((p) => {
    const ico = p.mc ? `<img alt="" src="/mc-icon/v2/${esc(p.mc)}" width="30" height="30">` : pxIcon(p.icon, 30);
    const st = `<span class="h2-st is-${esc(p.st)}">${p.st === "live" ? "<i></i>" : ""}${esc(c.states[p.st])}</span>`;
    return `<a class="h2-proj" href="${esc(url(p.href))}"${ext(p.href)} style="--tint:var(--sm-accent-${esc(p.tint)})">${tile(ico, p.tint)}<span class="h2-ph"><b>${esc(p.title)}</b>${st}</span><span class="h2-pt">${esc(p.text)}</span><span class="h2-tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span><span class="h2-more">${esc(p.cta)} <span class="h2-arrow" aria-hidden="true">&#8250;</span></span></a>`;
  }).join("");
  const recent = latestEntries(4);
  const log = recent.length
    ? `<ul class="h2-log${recent.some((e) => e.date) ? "" : " is-nodate"}">${recent.map((e, i) => `<li>${recent.some((x) => x.date) ? `<span class="h2-when">${esc(e.date)}</span>` : ""}<span class="h2-lic">${pxIcon(ICYCLE[i % ICYCLE.length], 20)}</span><span><b>${esc(e.text)}</b></span></li>`).join("")}</ul>`
    : `<p class="h2-gbt">${esc(c.recentNone)}</p>`;
  return `<div class="h2">
<section class="h2-hero">
<div class="h2-intro">
<p class="h2-eyb"><span class="h2-wave">${pxIcon("sparkle", 16)}</span>${esc(c.eyebrow)}</p>
<h1 class="h2-h1">${esc(c.h1a)}<span class="h2-name">${esc(c.h1name)}<i></i></span>${esc(c.h1b)}</h1>
<p class="h2-lead">${leadHtml(c.lead)}</p>
<div class="h2-ctas"><a class="h2-btn" href="#projekte">${esc(c.ctaProjects)} <span class="h2-arrow" aria-hidden="true">&#8595;</span></a><a class="h2-btn is-soft" href="${gb}">${esc(c.ctaGuestbook)}</a></div>
</div>
<aside class="h2-card h2-facts" aria-label="${esc(c.factsTitle)}">
<div class="h2-cardh">${tile(pxIcon("face", 24), "sun", true)}<b>${esc(c.factsTitle)}</b><span class="h2-mini">${esc(c.factsBadge)}</span></div>
<ul>${facts}</ul>
<div class="h2-xp"><span>${esc(c.xpLabel)}</span><span class="h2-bar" aria-hidden="true"><i style="--p:${Math.max(0, Math.min(1, +c.xp || 0))}"></i></span></div>
</aside>
</section>
<section class="h2-sec" id="projekte">
<div class="h2-head"><div><p class="h2-eyb">${pxIcon("chest", 16)}${esc(c.projEyebrow)}</p><h2 class="h2-h2">${esc(c.projTitle)}</h2></div><p class="h2-sub">${esc(c.projSub)}</p></div>
<div class="h2-grid">${projects}</div>
</section>
<section class="h2-sec h2-two">
<div class="h2-card">
<div class="h2-cardh">${tile(pxIcon("clock", 24), "ramune", true)}<b>${esc(c.recentTitle)}</b><a class="h2-link" href="https://mc.nwebnotfound.dev/changelog" target="_blank" rel="noopener noreferrer">${esc(c.recentAll)} <span class="h2-arrow" aria-hidden="true">&#8250;</span></a></div>
${log}
</div>
<div class="h2-card h2-gb" data-gb-empty="${esc(c.gbEmpty)}">
<div class="h2-cardh">${tile(pxIcon("heart", 24), "sakura", true)}<b>${esc(c.gbTitle)}</b><a class="h2-link" href="${gb}">${esc(c.gbAll)} <span class="h2-arrow" aria-hidden="true">&#8250;</span></a></div>
<blockquote data-gb-latest><p>${esc(c.gbEmpty)}</p></blockquote>
<p class="h2-gbt">${esc(c.gbText)}</p>
<a class="h2-btn" href="${gb}">${esc(c.gbCta)} <span class="h2-arrow" aria-hidden="true">&#8250;</span></a>
</div>
</section>
</div>`;
}
