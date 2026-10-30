import { AV } from "./asset-version.js";
// Spielersuche /spieler: öffentliche Basis-Stats, Details nur mit Discord-Login
const PUB = { money: ["money", "cp", "balance"], playtime: ["playtime", "playtime_s", "play_time"], kills: ["kills", "player_kills", "mob_kills"], deaths: ["deaths"], blocks_mined: ["blocks_mined", "mined_total", "blocks"], distance: ["distance", "distance_m"] };
const pick = (s) => { const o = {}; for (const [k, ks] of Object.entries(PUB)) for (const x of ks) { const v = s?.[x]; if (v != null && v !== "" && Number.isFinite(+v)) { o[k] = +v; break; } } return o; };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
// Fuzzy: exakt > Präfix > Teilstring > Subsequenz > Levenshtein ≤ 2
function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; let p = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[b.length]; }
export function fuzzyScore(name, q) {
  const n = norm(name), t = norm(q); if (!t) return 1; if (!n) return 0;
  if (n === t) return 1000; if (n.startsWith(t)) return 800 - n.length; const i = n.indexOf(t); if (i >= 0) return 600 - i;
  let k = 0; for (const ch of n) if (ch === t[k]) k++; if (k === t.length) return 400 - n.length;
  const d = lev(n.slice(0, t.length + 1), t); const d2 = lev(n, t); const m = Math.min(d, d2); return m <= (t.length >= 5 ? 2 : 1) ? 200 - m * 50 : 0;
}
async function players(env) {
  const { results } = await env.DB.prepare("SELECT l.mc_name, l.mc_uuid, s.stats, s.updated_at FROM mc_links l LEFT JOIN mc_player_stats s ON s.mc_uuid = l.mc_uuid WHERE l.verified = 1 AND l.has_role = 1 GROUP BY l.mc_uuid").all().catch(() => ({ results: [] }));
  return results.map((r) => { let s = {}; try { s = JSON.parse(r.stats || "{}"); } catch {} return { name: r.mc_name, uuid: r.mc_uuid, stats: pick(s), updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null }; });
}
export async function playersApi(env, url) {
  const q = String(url.searchParams.get("q") || "").slice(0, 32);
  let L = await players(env);
  L = L.map((p) => [p, fuzzyScore(p.name, q)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || (b[0].stats.playtime || 0) - (a[0].stats.playtime || 0) || a[0].name.localeCompare(b[0].name)).slice(0, 60).map((x) => x[0]);
  return L;
}
export async function playerApi(env, name, user) {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return null;
  const r = await env.DB.prepare("SELECT l.mc_name, l.mc_uuid, s.stats, s.details, s.updated_at FROM mc_links l LEFT JOIN mc_player_stats s ON s.mc_uuid = l.mc_uuid WHERE l.verified = 1 AND l.has_role = 1 AND lower(l.mc_name) = lower(?) LIMIT 1").bind(name).first().catch(() => null);
  if (!r) return null;
  let s = {}, d = null; try { s = JSON.parse(r.stats || "{}"); } catch {} try { d = r.details ? JSON.parse(r.details) : null; } catch {}
  const o = { name: r.mc_name, uuid: r.mc_uuid, stats: pick(s), updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null, viewer: { logged_in: !!user } };
  if (user) o.details = { all: s, extra: d }; // Details nur mit Discord-Login
  return o;
}
const SEARCH_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
export const PLAYER_CSS = `<style>
.plg{display:grid;gap:.8rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}
.plc{display:flex!important;align-items:center;gap:.9rem;padding:.9rem 1rem;color:var(--fg);text-decoration:none;min-height:76px}
.plc .slot{width:52px;height:52px;display:grid;place-items:center;flex:none}.plc .slot img,.plh .slot img{image-rendering:pixelated;display:block}
.plc b{display:block;font-family:var(--f-px,monospace);font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.plc small{display:block;color:var(--mut);font-size:.8rem}
.plc>div{min-width:0;flex:1}.plc .chev{color:var(--mut);flex:none}
.plh{display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap}.plh .slot{width:96px;height:96px;display:grid;place-items:center;flex:none}
.pst{display:grid;gap:.7rem;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:1.2rem}@media(min-width:760px){.pst{grid-template-columns:repeat(3,minmax(0,1fr))}}
.pst>div{padding:1rem}.pst .k{font-size:.78rem;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.pst .v{font-family:var(--f-px,monospace);font-size:clamp(1.1rem,4vw,1.5rem);margin-top:.25rem;overflow-wrap:anywhere}
.lock{text-align:center;padding:2rem 1.2rem}.lock p{max-width:28rem;margin:.4rem auto 1.2rem}
.kvl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:.2rem 1.2rem}.kvl div{display:flex;justify-content:space-between;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--line);font-size:.9rem}.kvl span{color:var(--mut);overflow:hidden;text-overflow:ellipsis}
</style>`;
const FMT = `const E=MC.E,NF=MC.NF;const up=t=>{t=+t||0;const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return d?d+' T '+h+' Std':h?h+' Std '+m+' Min':m+' Min'};const KM=m=>m>=1000?NF(m/1000,1)+' km':NF(Math.round(m))+' m';
const LB={money:['CP',v=>NF(v)+' CP'],playtime:['Spielzeit',up],blocks_mined:['Blöcke abgebaut',NF],kills:['Kills',NF],deaths:['Tode',NF],distance:['Distanz',KM]};
const HEAD=(n,s)=>'<img alt="" width="'+s+'" height="'+s+'" loading="lazy" src="https://mc-heads.net/avatar/'+encodeURIComponent(n)+'/'+s+'" onerror="this.src=\\'https://mc-heads.net/avatar/MHF_Steve/'+s+'\\'">';`;
export const playersBody = () => `${PLAYER_CSS}<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Spieler</p><h1 class="hub-h">Spieler.</h1><p class="sub">Finde Mitspieler, auch wenn du den Namen nur ungefähr weißt.</p>
<div class="srch" style="margin-top:1.4rem;max-width:560px">${SEARCH_SVG}<input name="mc-q-find" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-form-type="other" data-lpignore="true" class="inp" id="q" type="search" placeholder="Spielername suchen" aria-label="Spieler suchen"></div></div></section>
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap" id="root" aria-live="polite"><div class="g pad mut">Lade Spieler…</div></div></section>
<script src="/mc/common.js?v=${AV}"></script><script>(()=>{${FMT}
const R=document.getElementById('root'),q=document.getElementById('q');const u=new URL(location.href);q.value=u.searchParams.get('q')||'';let tm,seq=0;
const card=p=>'<a class="g plc" href="/spieler/'+encodeURIComponent(p.name)+'"><span class="slot">'+HEAD(p.name,40)+'</span><div><b>'+E(p.name)+'</b><small>'+(p.stats.playtime!=null?up(p.stats.playtime)+' gespielt':'Noch keine Stats')+(p.stats.money!=null?' · '+NF(p.stats.money)+' CP':'')+'</small></div><span class="chev" aria-hidden="true">›</span></a>';
async function load(){const s=++seq,t=q.value.trim();let d;try{d=await MC.get('/api/mc-players?q='+encodeURIComponent(t))}catch(_){d={players:[]}}if(s!==seq)return;const L=d.players||[];
history.replaceState(null,'',t?'?q='+encodeURIComponent(t):location.pathname);
R.innerHTML=L.length?'<p class="mut" style="font-size:.85rem;margin:0 0 .8rem">'+L.length+' Spieler'+(t?' für „'+E(t)+'“':'')+'</p><div class="plg">'+L.map(card).join('')+'</div>':'<div class="g empty-st"><div class="big"><img alt="" width="56" height="56" class="mi" style="margin:0 auto" src="/mc-icon/player_head"></div><h2 class="hub-h2">'+(t?'Niemand gefunden':'Noch keine Spieler')+'</h2><p class="mut">'+(t?'Prüf die Schreibweise oder such nach einem Teil des Namens.':'Sobald Spieler ihren Account im Discord mit /link verknüpfen, tauchen sie hier auf.')+'</p></div>'}
q.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(load,160)});q.addEventListener('keydown',e=>{if(e.key==='Enter'){const a=R.querySelector('a.plc');if(a)location.href=a.href}});load()})();</script>`;
export const playerBody = (name, MAIN) => `${PLAYER_CSS}<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p style="margin:0 0 1rem"><a href="/spieler">‹ Spieler</a></p><div id="hd" class="plh"><h1 class="hub-h">${name.replace(/[^A-Za-z0-9_]/g, "")}</h1></div></div></section>
<section class="sec" style="padding-top:.6rem"><div class="hub-wrap" id="root"><div class="g pad mut">Lade…</div></div></section>
<script src="/mc/common.js?v=${AV}"></script><script>(()=>{${FMT}
const N=${JSON.stringify(name)},H=document.getElementById('hd'),R=document.getElementById('root');
(async()=>{const r=await fetch('/api/mc-players/'+encodeURIComponent(N),{credentials:'include'});if(!r.ok){R.innerHTML='<div class="g empty-st"><h2 class="hub-h2">Spieler nicht gefunden</h2><p class="mut">'+E(N)+' hat keinen verknüpften Account.</p><p style="margin-top:1rem"><a class="btn sec" href="/spieler">Zur Spielersuche</a></p></div>';return}const p=await r.json();
H.innerHTML='<span class="slot">'+HEAD(p.name,80)+'</span><div style="min-width:0"><h1 class="hub-h" style="margin:0;overflow-wrap:anywhere">'+E(p.name)+'</h1><p class="mut" style="margin:.3rem 0 0;font-size:.85rem">'+(p.updated_at?'Stand '+new Date(p.updated_at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'Noch keine Stats')+'</p></div>';
const ks=Object.keys(LB).filter(k=>p.stats[k]!=null);let h='<h2 class="hub-h2" style="font-size:1.2rem">Öffentliche Stats</h2>'+(ks.length?'<div class="pst">'+ks.map(k=>'<div class="g"><div class="k">'+LB[k][0]+'</div><div class="v tnum">'+E(LB[k][1](p.stats[k]))+'</div></div>').join('')+'</div>':'<div class="g pad mut">Noch keine Stats.</div>');
if(p.details){const a=Object.entries(p.details.all||{}).filter(([k,v])=>v!=null&&typeof v!=='object');h+='<div class="g pad" style="margin-top:1.2rem" id="det"><h2 class="hub-h2" style="font-size:1.2rem">Details</h2>'+(a.length?'<div class="kvl">'+a.map(([k,v])=>'<div><span>'+E(MC.NM(k))+'</span><b class="tnum">'+E(typeof v==='number'?NF(v,v%1?2:0):v)+'</b></div>').join('')+'</div>':'<p class="mut">Noch keine Detail-Stats.</p>')+'</div>'}
else h+='<div class="g lock" style="margin-top:1.2rem" id="det"><img alt="" width="40" height="40" class="mi" style="margin:0 auto" src="/mc-icon/barrel"><h2 class="hub-h2" style="font-size:1.2rem;margin-top:.6rem">Details nur für Mitspieler</h2><p class="mut">Melde dich mit Discord an, um alle Stats von '+E(p.name)+' zu sehen.</p><a class="btn discord" href="https://${MAIN}/auth/discord/login?next='+encodeURIComponent(location.href)+'">Mit Discord anmelden</a></div>';
R.innerHTML=h})()})();</script>`;
