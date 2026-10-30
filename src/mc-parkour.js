import { AV } from "./asset-version.js";
// Parkour-Bestzeiten: Ingest-Validierung, öffentliche API (Top 10 pro Kurs), Seite /parkour
export const PK_MAX_MS = 24 * 3600 * 1000, PK_MAX = 1000;
const COURSE = /^[a-z0-9_-]{1,32}$/, UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i, NAME = /^[A-Za-z0-9_]{1,16}$/;
const normU = (x) => String(x).toLowerCase().replace(/-/g, "").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
// → { rows, rejected } oder null (Feld fehlt = keine Änderung)
export function cleanParkour(a, now = Date.now()) {
  if (a === undefined || a === null) return null;
  if (!Array.isArray(a)) return { rows: [], rejected: 1 };
  const best = new Map(); let rejected = Math.max(0, a.length - PK_MAX);
  for (const e of a.slice(0, PK_MAX)) {
    const course = typeof e?.course === "string" ? e.course : "", u = String(e?.mc_uuid ?? ""), t = e?.time_ms, name = e?.mc_name;
    if (!COURSE.test(course) || !UUID.test(u) || !Number.isSafeInteger(t) || t <= 0 || t > PK_MAX_MS || (name != null && name !== "" && !NAME.test(String(name)))) { rejected++; continue; }
    let set = now;
    if (e.set_at != null) { const ms = typeof e.set_at === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,6})?)?(Z|[+-]00:?00)$/.test(e.set_at) ? Date.parse(e.set_at) : NaN; if (!Number.isFinite(ms) || ms > now + 600000 || ms < Date.UTC(2020, 0, 1)) { rejected++; continue; } set = ms; }
    const r = { course, mc_uuid: normU(u), mc_name: name ? String(name) : null, time_ms: t, set_at: new Date(set).toISOString() };
    const k = course + "|" + r.mc_uuid, o = best.get(k); if (!o || r.time_ms < o.time_ms) best.set(k, r);
  }
  return { rows: [...best.values()], rejected };
}
export const parkourStatements = (env, rows) => rows.map((r) => env.DB.prepare(
  "INSERT INTO mc_parkour (course, mc_uuid, mc_name, time_ms, set_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(course, mc_uuid) DO UPDATE SET time_ms = excluded.time_ms, set_at = excluded.set_at, mc_name = COALESCE(excluded.mc_name, mc_parkour.mc_name) " +
  "WHERE excluded.time_ms < mc_parkour.time_ms OR (excluded.time_ms = mc_parkour.time_ms AND excluded.mc_name IS NOT NULL AND excluded.mc_name IS NOT mc_parkour.mc_name)").bind(r.course, r.mc_uuid, r.mc_name, r.time_ms, r.set_at));
export async function parkourApi(env) {
  const { results } = await env.DB.prepare("SELECT course, mc_uuid, mc_name, time_ms, set_at FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY course ORDER BY time_ms, set_at, mc_uuid) AS rk FROM mc_parkour) WHERE rk <= 10 ORDER BY course, rk").all().catch(() => ({ results: [] }));
  const courses = {}; for (const r of results) (courses[r.course] ||= []).push({ rank: courses[r.course].length + 1, mc_uuid: r.mc_uuid, mc_name: r.mc_name, time_ms: r.time_ms, set_at: r.set_at });
  return { courses };
}
const CSS = `<style>
.pkt{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1rem}.pkt .btn{min-height:40px;font-family:var(--pf);font-weight:400}.pkt .btn[aria-selected=false]{background:#3a3a3a;border-color:#000;color:#ddd;box-shadow:inset 0 -3px 0 rgba(0,0,0,.35),inset 0 2px 0 rgba(255,255,255,.18)}
.pkg{padding:1rem}.pkh{display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem}.pkh h2{margin:0;font-family:var(--pf);font-size:1.25rem;font-weight:400}.pkh small{color:var(--mut);margin-left:auto}
.pkr{display:flex;align-items:center;gap:.75rem;padding:.45rem .3rem}.pkr+.pkr{border-top:2px solid #000;box-shadow:inset 0 2px 0 #333}.pkr .rk{width:2rem;font-family:var(--pf);font-size:1.05rem;text-align:center;color:var(--mut)}.pkr.p1 .rk{color:#fcd34d}.pkr.p2 .rk{color:#d1d5db}.pkr.p3 .rk{color:#d97706}
.pkr .slot img{width:32px;height:32px;image-rendering:pixelated}.pkr .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pkr .n small{display:block;color:var(--mut);font-size:.75rem}.pkr b{font-family:var(--pf);font-weight:400;font-size:1.1rem;font-variant-numeric:tabular-nums}
@media (max-width:480px){.pkr{gap:.5rem}.pkr .rk{width:1.5rem}.pkr b{font-size:1rem}}
</style>`;
export const parkourBody = () => `${CSS}<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Lobby</p><h1 class="hub-h">Parkour.</h1><p class="sub">Die schnellsten Läufe pro Kurs. Top 10, nur die Bestzeit jedes Spielers zählt.</p></div></section>
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap" style="max-width:760px" id="root" aria-live="polite"><div class="g pad mut">Lade Zeiten…</div></div></section>
<script src="/mc/common.js?v=${AV}"></script><script>(()=>{const E=MC.E,R=document.getElementById('root');
const F=ms=>{ms=Math.max(0,Math.round(+ms||0));const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000),x=ms%1000;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(x).padStart(3,'0')};
const HEAD=(n,s)=>'<img alt="" width="'+s+'" height="'+s+'" loading="lazy" src="https://mc-heads.net/avatar/'+encodeURIComponent(n)+'/'+s+'" onerror="this.src=\\'https://mc-heads.net/avatar/MHF_Steve/'+s+'\\'">';
const MI=(id,s)=>'<img class="mi" alt="" width="'+s+'" height="'+s+'" style="image-rendering:pixelated" src="/mc-icon/'+id+'">';
const T=n=>n.replace(/[_-]/g,' ').replace(/^./,c=>c.toUpperCase());let D={},cur='';
function draw(){const K=Object.keys(D).sort();if(!K.length){R.innerHTML='<div class="g empty-st" id="pk-empty"><div class="big">'+MI('feather',56)+'</div><h2 class="hub-h2">Noch keine Zeiten</h2><p class="mut">Lauf in der Lobby einen Parkour-Kurs und hol dir Platz 1.</p></div>';return}
if(!K.includes(cur))cur=K.includes(location.hash.slice(1))?location.hash.slice(1):K[0];
R.innerHTML=(K.length>1?'<div class="pkt" role="tablist">'+K.map(k=>'<button class="btn" role="tab" data-k="'+E(k)+'" aria-selected="'+(k===cur)+'">'+E(T(k))+'</button>').join('')+'</div>':'')+
'<div class="g pkg" id="pk-'+E(cur)+'"><div class="pkh"><span class="slot">'+MI('golden_boots',26)+'</span><h2>'+E(T(cur))+'</h2><small>Top '+D[cur].length+'</small></div>'+D[cur].map(x=>{const n=x.mc_name||'Unbekannt';return '<div class="pkr p'+x.rank+'"><span class="rk">'+x.rank+'</span><span class="slot">'+HEAD(x.mc_name||'MHF_Steve',32)+'</span><span class="n">'+(x.mc_name?'<a href="/spieler/'+encodeURIComponent(n)+'">'+E(n)+'</a>':E(n))+'<small>'+E(new Date(x.set_at).toLocaleDateString('de-DE',{dateStyle:'medium'}))+'</small></span><b class="tm">'+F(x.time_ms)+'</b></div>'}).join('')+'</div>'}
R.onclick=e=>{const k=e.target.closest('[data-k]');if(k){cur=k.dataset.k;history.replaceState(null,'','#'+cur);draw()}};
fetch('/api/mc-parkour').then(r=>r.json()).then(d=>{D=d.courses||{};draw()}).catch(()=>{D={};draw()})})();</script>`;
