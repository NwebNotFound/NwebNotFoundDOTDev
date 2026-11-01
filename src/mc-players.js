import { AV } from "./asset-version.js";
import { pubRank } from "./mc-ranks.js";
// Spielersuche /spieler: öffentliche Basis-Stats, Details nur mit Discord-Login
const PUB = { money: ["money", "cp", "balance"], playtime: ["playtime", "playtime_s", "play_time"], kills: ["kills", "player_kills", "mob_kills"], deaths: ["deaths"], blocks_mined: ["blocks_mined", "mined_total", "blocks"], distance: ["distance", "distance_m"] };
const ALL_OK = new Set(["money", "cp", "balance", "playtime", "playtime_s", "play_time", "kills", "player_kills", "mob_kills", "mobs_killed", "deaths", "blocks_mined", "mined_total", "blocks", "blocks_placed", "distance", "distance_m", "fished", "traded", "jumps", "damage_dealt", "damage_taken", "cp_earned", "shop_sales", "level", "xp"]);
const allowed = (s) => { const o = {}; for (const [k, v] of Object.entries(s || {})) if (ALL_OK.has(k) && typeof v !== "boolean" && v !== null && v !== "" && Number.isFinite(+v)) o[k] = +v; return o; };
const pick = (s) => { const o = {}; for (const [k, ks] of Object.entries(PUB)) for (const x of ks) { const v = s?.[x]; if (v != null && v !== "" && Number.isFinite(+v)) { o[k] = +v; break; } } return o; };
const meta = (s) => { const o = {}; const t = s?.team ?? s?.team_name; if (typeof t === "string" && t.trim()) o.team = t.trim().replace(/§./g, "").slice(0, 32); const l = s?.last_seen ?? s?.last_online ?? s?.last_login; if (l != null && l !== "" && !Number.isNaN(new Date(typeof l === "number" && l < 1e12 ? l * 1000 : l).getTime())) o.last_seen = l; if (s?.online === true || s?.online === 1 || s?.online === "1" || s?.online === "true") o.online = true; const c = [s?.team_color, s?.team_color_hex].find((v) => typeof v === "string" && /^#[0-9A-F]{6}$/i.test(v)); if (o.team && c) o.team_color = c.toUpperCase(); return o; };
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
  const { results } = await env.DB.prepare("SELECT l.mc_name, l.mc_uuid, s.stats, s.updated_at, r.rank, r.color FROM mc_links l LEFT JOIN mc_player_stats s ON s.mc_uuid = l.mc_uuid LEFT JOIN mc_player_ranks r ON r.uuid = lower(replace(l.mc_uuid, '-', '')) WHERE l.verified = 1 AND l.has_role = 1 GROUP BY l.mc_uuid").all().catch(() => ({ results: [] }));
  return results.map((r) => { let s = {}; try { s = JSON.parse(r.stats || "{}"); } catch {} return { name: r.mc_name, uuid: r.mc_uuid, stats: pick(s), updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null, rank: pubRank(r.rank, r.color) }; });
}
export async function playersApi(env, url) {
  const q = String(url.searchParams.get("q") || "").slice(0, 32);
  let L = await players(env);
  L = L.map((p) => [p, fuzzyScore(p.name, q)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || (b[0].stats.playtime || 0) - (a[0].stats.playtime || 0) || a[0].name.localeCompare(b[0].name)).slice(0, 60).map((x) => x[0]);
  return L;
}
export async function playerApi(env, name, user) {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return null;
  const r = await env.DB.prepare("SELECT l.mc_name, l.mc_uuid, s.stats, s.details, s.updated_at, r.rank, r.color FROM mc_links l LEFT JOIN mc_player_stats s ON s.mc_uuid = l.mc_uuid LEFT JOIN mc_player_ranks r ON r.uuid = lower(replace(l.mc_uuid, '-', '')) WHERE l.verified = 1 AND l.has_role = 1 AND lower(l.mc_name) = lower(?) LIMIT 1").bind(name).first().catch(() => null);
  if (!r) return null;
  let s = {}, d = null; try { s = JSON.parse(r.stats || "{}"); } catch {} try { d = r.details ? JSON.parse(r.details) : null; } catch {}
  const o = { name: r.mc_name, uuid: r.mc_uuid, stats: pick(s), ...meta(s), updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null, rank: pubRank(r.rank, r.color), viewer: { logged_in: !!user } };
  // Details nur für eingeloggte, verifizierte Mitspieler mit Server-Rolle; nur Whitelist numerischer Stats (nie inventory/pickup)
  if (user) {
    const l = await env.DB.prepare("SELECT verified, has_role FROM mc_links WHERE discord_id = ?").bind(String(user.id)).first().catch(() => null);
    o.viewer.can_details = !!(l && l.verified && l.has_role);
    if (o.viewer.can_details) o.details = { all: allowed(s), extra: d };
  }
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
.pstats{display:grid;gap:.7rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,148px),1fr));margin-top:1.2rem}
.pstats>div{padding:1rem;min-height:5.5rem;display:flex;flex-direction:column;justify-content:flex-end}
.pstats .k{font-size:.78rem;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.pstats .v{font-family:var(--f-px,monospace);font-size:clamp(1.1rem,4vw,1.5rem);margin-top:.25rem;overflow-wrap:anywhere}
.lock{text-align:center;padding:2rem 1.2rem}.lock p{max-width:28rem;margin:.4rem auto 1.2rem}
.kvl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:.2rem 1.2rem}.kvl div{display:flex;justify-content:space-between;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--line);font-size:.9rem}.kvl span{color:var(--mut);overflow:hidden;text-overflow:ellipsis}
.dgr{display:grid;gap:1rem;margin-top:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))}.dgr>*{min-width:0}
.dcard h3{font-size:1.05rem;margin:0 0 .8rem;display:flex;justify-content:space-between;align-items:baseline;gap:.6rem}.dcard h3 small{font-family:var(--f-body,sans-serif);font-size:.78rem;font-weight:500;color:var(--mut)}
.prow{display:flex;align-items:center;gap:.75rem;padding:.5rem 0}.prow+.prow{border-top:1px solid var(--line)}.prow .n{flex:1;min-width:0}.prow .n span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.92rem}.prow .meter{margin-top:.35rem}.prow b{font-size:.92rem}
.prow .ic{width:34px;height:34px;display:grid;place-items:center;flex:none}.prow .ic img{width:22px;height:22px;image-rendering:pixelated}
.dmini{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.slotbox{padding:.75rem .9rem;background:var(--c-s2,rgba(255,255,255,.04));border:1px solid var(--line);border-radius:6px}.slotbox .k{font-size:.72rem;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.slotbox .v{font-family:var(--f-px,monospace);font-size:1.05rem;margin-top:.2rem}
.emp{padding:1.2rem 0 .4rem;text-align:center;color:var(--mut);font-size:.9rem}
</style>`
const FMT = `const E=MC.E,NF=MC.NF;const up=t=>{t=+t||0;const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return d?d+' T '+h+' Std':h?h+' Std '+m+' Min':m+' Min'};const KM=m=>m>=1000?NF(m/1000,1)+' km':NF(Math.round(m))+' m';
const RL={vip:'VIP',mvp:'MVP',builder:'Builder',admin:'Admin'};const RB=p=>p.rank&&RL[p.rank.rank]&&/^[0-9a-f]$/.test(p.rank.color)?'<span class="rk rk-'+p.rank.color+'" title="Rang '+RL[p.rank.rank]+'">'+RL[p.rank.rank]+'</span>':'';
const LB={money:['CP',v=>NF(v)+' CP'],playtime:['Spielzeit',up],blocks_mined:['Blöcke abgebaut',NF],kills:['Spieler-Kills',NF],deaths:['Tode',NF],distance:['Distanz',KM]};
const HEAD=(n,s)=>'<img alt="" width="'+s+'" height="'+s+'" loading="lazy" src="/mc-head/'+encodeURIComponent(n)+'/'+s+'" onerror="this.src=\\'/mc-head/MHF_Steve/'+s+'\\'">';`;
export const playersBody = () => `${PLAYER_CSS}<link rel="stylesheet" href="/mc/ranks.css?v=${AV}"><link rel="stylesheet" href="/mc/profile.css?v=${AV}"><script src="/mc/player3d.js?v=${AV}"></script><section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Spieler</p><h1 class="hub-h">Spieler.</h1><p class="sub">Finde Mitspieler, auch wenn du den Namen nur ungefähr weißt.</p>
<div class="srch" style="margin-top:1.4rem;max-width:560px">${SEARCH_SVG}<input name="mc-q-find" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-form-type="other" data-lpignore="true" class="inp" id="q" type="search" placeholder="Spielername suchen" aria-label="Spieler suchen"></div></div></section>
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap" id="root" aria-live="polite"><div class="g pad mut">Lade Spieler…</div></div></section>
<script src="/mc/common.js?v=${AV}"></script><script>(()=>{${FMT}
const R=document.getElementById('root'),q=document.getElementById('q');const u=new URL(location.href);q.value=u.searchParams.get('q')||'';let tm,seq=0;
const card=p=>'<a class="g plc" data-player="'+E(p.name)+'" href="/spieler/'+encodeURIComponent(p.name)+'"><span class="slot">'+HEAD(p.name,40)+'</span><div><b>'+E(p.name)+RB(p)+'</b><small>'+(p.stats.playtime!=null?up(p.stats.playtime)+' gespielt':'Noch keine Stats')+(p.stats.money!=null?' · '+NF(p.stats.money)+' CP':'')+'</small></div><span class="chev" aria-hidden="true">›</span></a>';
async function load(){const s=++seq,t=q.value.trim();let d;try{d=await MC.get('/api/mc-players?q='+encodeURIComponent(t))}catch(_){d={players:[]}}if(s!==seq)return;const L=d.players||[];
history.replaceState(null,'',t?'?q='+encodeURIComponent(t):location.pathname);
R.innerHTML=L.length?'<p class="mut" style="font-size:.85rem;margin:0 0 .8rem">'+L.length+' Spieler'+(t?' für „'+E(t)+'“':'')+'</p><div class="plg">'+L.map(card).join('')+'</div>':'<div class="g empty-st"><div class="big"><img alt="" width="56" height="56" class="mi" style="margin:0 auto" src="/mc-icon/v2/player_head"></div><h2 class="hub-h2">'+(t?'Niemand gefunden':'Noch keine Spieler')+'</h2><p class="mut">'+(t?'Prüf die Schreibweise oder such nach einem Teil des Namens.':'Sobald Spieler ihren Account im Discord mit /link verknüpfen, tauchen sie hier auf.')+'</p></div>'}
if(window.MC3D)MC3D.hover(R,'a.plc[data-player]');q.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(load,160)});q.addEventListener('keydown',e=>{if(e.key==='Enter'){const a=R.querySelector('a.plc');if(a)location.href=a.href}});load()})();</script>`;
export const playerBody = (name, MAIN) => `${PLAYER_CSS}<link rel="stylesheet" href="/mc/ranks.css?v=${AV}"><link rel="stylesheet" href="/mc/pvp.css?v=${AV}"><link rel="stylesheet" href="/mc/profile.css?v=${AV}"><section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p style="margin:0 0 16px"><a href="/spieler">‹ Spieler</a></p><div id="hd"><div class="pf-hd"><div class="m3d pf-model"></div><div class="pf-info"><h1 class="pf-name">${name.replace(/[^A-Za-z0-9_]/g, "")}</h1></div></div></div></div></section>
<section class="sec" style="padding-top:8px"><div class="hub-wrap" id="root"><div class="g pad mut">Lade…</div></div></section>
<section class="sec pvp-pl-sec"><div class="hub-wrap pvp-pl" id="pvp-pl" data-name="${name.replace(/[^A-Za-z0-9_]/g, "")}" hidden></div></section>
<script src="/mc/pvp.js?v=${AV}" defer></script><script src="/mc/common.js?v=${AV}"></script><script src="/mc/player3d.js?v=${AV}"></script><script>(()=>{${FMT}
const N=${JSON.stringify(name)},H=document.getElementById('hd'),R=document.getElementById('root');
(async()=>{const r=await fetch('/api/mc-players/'+encodeURIComponent(N),{credentials:'include'});if(!r.ok){R.innerHTML='<div class="g empty-st"><h2 class="hub-h2">Spieler nicht gefunden</h2><p class="mut">'+E(N)+' hat keinen verknüpften Account.</p><p style="margin-top:1rem"><a class="btn sec" href="/spieler">Zur Spielersuche</a></p></div>';return}const p=await r.json();const G=await MCP.games(p.name);const st=p.stats||{};
H.innerHTML=MCP.header({name:p.name,rank:RB(p),eyebrow:'Spieler',sub:p.updated_at?'Stats vom '+new Date(p.updated_at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'Noch keine Stats',meta:[['Team',p.team,'white_banner',{color:MCP.TC(p)}],['CP',st.money!=null?NF(st.money)+' CP':null,'gold_ingot'],p.online?['Status','Online','clock',{online:true}]:['Zuletzt online',p.last_seen!=null?MCP.SEEN(p.last_seen):null,'clock',{seen:true}],['Spielzeit',st.playtime!=null?up(st.playtime):null,'compass']]})
+MCP.kpi([['Spieler-Kills',st.kills!=null?NF(st.kills):null,'iron_sword'],['Tode',st.deaths!=null?NF(st.deaths):null,'skeleton_skull'],['Distanz',st.distance!=null?KM(st.distance):null,'leather_boots'],['Blöcke',st.blocks_mined!=null?NF(st.blocks_mined):null,'iron_pickaxe'],['PvP-Winrate',G.winrate,'shield',G.pvp?NF(G.pvp.matches)+' Kämpfe':''],['Beste Parkour-Zeit',G.best?MCP.MS(G.best.ms):null,'feather',G.best?G.best.name:'']]);MC3D.scan(H);
let h='';
if(p.details){const d=p.details.extra||{},A=p.details.all||{};const ST=k=>String(k).replace(/^minecraft:/,'');const NO=o=>{const r={};for(const[k,v]of Object.entries(o||{}))if(Number.isFinite(+v))r[ST(k)]=(r[ST(k)]||0)+ +v;return r};
const ICO=id=>'<span class="slot ic"><img alt="" loading="lazy" width="22" height="22" src="/mc-icon/v2/'+encodeURIComponent(id)+'" onerror="this.onerror=null;this.src=\\'/mc-icon/v2/paper\\'"></span>';
const MIC=k=>'<span class="slot ic"><img alt="" loading="lazy" width="22" height="22" style="image-rendering:pixelated" src="/mc-mob/'+encodeURIComponent(k)+'" onerror="this.onerror=null;this.src=\\'/mc-icon/v2/bone\\'"></span>';
const MN={zombie:'Zombie',skeleton:'Skelett',creeper:'Creeper',spider:'Spinne',enderman:'Enderman',cow:'Kuh',pig:'Schwein',sheep:'Schaf',chicken:'Huhn',witch:'Hexe',slime:'Schleim',drowned:'Ertrunkener',blaze:'Lohe',ender_dragon:'Enderdrache',wither:'Wither',phantom:'Phantom',pillager:'Plünderer',villager:'Dorfbewohner',fall:'Fallschaden',lava:'Lava',fire:'Feuer',fire_tick:'Feuer',drowning:'Ertrinken',drown:'Ertrunken',on_fire:'Verbrannt',starve:'Verhungert',void:'Void',suffocation:'Erstickt',starvation:'Verhungert',explosion:'Explosion',block_explosion:'Explosion',entity_explosion:'Explosion',projectile:'Geschoss',magic:'Magie',freeze:'Erfroren',lightning:'Blitz',contact:'Kaktus/Beere',wither:'Wither',player:'Spieler',sonstige:'Sonstige'};const MG=(o,L)=>{const r={},f={};for(const[k,v]of Object.entries(o||{})){const l=String(L(k)).toLowerCase();const c=f[l]??=k;r[c]=(r[c]||0)+(+v||0)}return r};const OTH=(o,tot,n)=>{const e=Object.entries(o||{}).map(([k,v])=>[k,+v||0]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);const s=e.reduce((a,x)=>a+x[1],0);let r=Math.max(0,(+tot||0)-s);let k=e;if(e.length+(r>0?1:0)>n){k=e.slice(0,n-1);r+=e.slice(n-1).reduce((a,x)=>a+x[1],0)}const out=Object.fromEntries(k);if(r>0)out.sonstige=(out.sonstige||0)+r;return out};
const list=(o,f,n,lab)=>{const e=Object.entries(NO(o)).sort((a,b)=>b[1]-a[1]).slice(0,n);if(!e.length)return '<div class="emp">Noch keine Daten.</div>';const mx=e[0][1]||1;return e.map(([k,v])=>'<div class="prow">'+f(k)+'<div class="n"><span>'+E(lab?lab(k):MC.NM(k))+'</span><div class="meter"><i style="width:'+Math.max(4,v/mx*100)+'%"></i></div></div><b class="tnum">'+NF(v)+'</b></div>').join('')};
const card=(t,sub,body)=>body.includes('class="emp"')?'':'<div class="g pad dcard"><h3>'+t+(sub?'<small>'+sub+'</small>':'')+'</h3>'+body+'</div>';
const DL={walk:'Gelaufen',sprint:'Gesprintet',fly:'Geflogen',elytra:'Elytra',swim:'Geschwommen',boat:'Boot',horse:'Pferd',minecart:'Lore',climb:'Geklettert',crouch:'Geschlichen'};const dd=NO(d.distance_m);const dk=Object.keys(dd).filter(k=>dd[k]>0).sort((a,b)=>dd[b]-dd[a]);const tot=dk.reduce((a,k)=>a+dd[k],0);
const pubShown=new Set(Object.keys(LB).filter(k=>p.stats[k]!=null));
const ALIASES={money:['money','cp','balance'],playtime:['playtime','playtime_s','play_time'],kills:['kills','player_kills','mob_kills','mobs_killed'],deaths:['deaths'],blocks_mined:['blocks_mined','mined_total','blocks'],distance:['distance','distance_m']};
const skip=new Set();for(const[canon,aliases]of Object.entries(ALIASES)){if(pubShown.has(canon))aliases.forEach(a=>skip.add(a))}
const LBLX={money:'CP',cp:'CP',balance:'CP',playtime:'Spielzeit',playtime_s:'Spielzeit',play_time:'Spielzeit',kills:'Spieler-Kills',player_kills:'Spieler-Kills',mob_kills:'Mob-Kills',deaths:'Tode',blocks_mined:'Blöcke abgebaut',mined_total:'Blöcke abgebaut',blocks_placed:'Blöcke gesetzt',distance:'Distanz',distance_m:'Distanz',fished:'Gefischt',traded:'Gehandelt',jumps:'Sprünge',damage_dealt:'Schaden ausgeteilt',damage_taken:'Schaden erlitten',cp_earned:'CP verdient',shop_sales:'Shop-Verkäufe',level:'Level',xp:'XP'};
const FM=(k,v)=>{v=+v;if(/playtime|play_time|_s$/.test(k)&&k!=='blocks_mined')return up(v);if(/distance|_m$/.test(k))return KM(v);if(/^(money|cp|balance|cp_)/.test(k))return NF(v)+' CP';return NF(v,v%1?2:0)};
const M=[];for(const[k,v]of Object.entries(A))if(v!=null&&Number.isFinite(+v)&&!skip.has(k))M.push([LBLX[k]||MC.NM(k.replace(/_s$/,'')),FM(k,v)]);
h+='<div id="det">'+(M.length?'<div class="g pad"><div class="kvl">'+M.map(([l,v])=>'<div><span>'+E(l)+'</span><b class="tnum">'+E(v)+'</b></div>').join('')+'</div></div>':'')
+'<div class="dgr">'+card('Top-Blöcke','abgebaut',list(d.mined,ICO,10))+card('Mob-Kills','',list(d.killed,MIC,8,k=>MN[k]||MC.NM(k)))
+card('Distanzen',tot?KM(tot)+' gesamt':'',dk.length?'<div class="dmini">'+dk.map(k=>'<div class="slotbox"><div class="k">'+E(DL[k]||MC.NM(k))+'</div><div class="v tnum">'+KM(dd[k])+'</div></div>').join('')+'</div>':'<div class="emp">Noch keine Daten.</div>')
+(d.deaths_entity&&Object.keys(d.deaths_entity).length?card('Getötet von','Mobs',list(d.deaths_entity,MIC,8,k=>MN[k]||MC.NM(k))):'')+(d.deaths_by&&Object.keys(d.deaths_by).length?card('Todesursachen','',list(OTH(MG(NO(d.deaths_by),k=>MN[k]||MC.NM(k)),(A.deaths??(p.stats||{}).deaths)-Object.values(d.deaths_entity||{}).reduce((x,y)=>x+(+y||0),0),8),MIC,8,k=>MN[k]||MC.NM(k))):'')+'</div></div>'}
else h+='<div class="g lock" id="det"><img alt="" width="40" height="40" class="mi" style="margin:0 auto" src="/mc-icon/v2/barrel"><h2 class="hub-h2" style="font-size:1.2rem;margin-top:.6rem">Details nur für Mitspieler</h2><p class="mut">'+(p.viewer&&p.viewer.logged_in?'Details sehen nur verifizierte Spieler mit Server-Rolle. Verknüpfe deinen Minecraft-Account im <a href="/profile">Profil</a>.':'Melde dich mit Discord an, um alle Stats von '+E(p.name)+' zu sehen.')+'</p>'+(p.viewer&&p.viewer.logged_in?'':'<a class="btn discord" href="https://${MAIN}/auth/discord/login?next='+encodeURIComponent(location.href)+'">Mit Discord anmelden</a>')+'</div>';
const mg=(G.pvp||G.parkourHtml)?'<div id="pvp-slot"></div>'+G.parkourHtml:'';
R.innerHTML=MCP.tabs('ptabs',[['statistiken','Statistiken',h,'book'],['minispiele','Minispiele',mg,'golden_boots']]);
{const sl=document.getElementById('pvp-slot'),pv=document.getElementById('pvp-pl');if(sl&&pv){pv.classList.remove('hub-wrap');sl.replaceWith(pv);const sec=document.querySelector('.pvp-pl-sec');if(sec)sec.remove()}}
MCP.bindTabs(R)})()})();</script>`;
