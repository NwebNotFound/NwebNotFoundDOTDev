import { resolveIcon, TEX_BASE } from "./mc-icon.js";
import { HUB_CSS, hubNav, homeBody, marketBody, marketItemBody, WIKI, wikiIndexBody, wikiArticleBody, shopsBody, shopBody, auctionsBody, auctionBody } from "./mc-hub.js";
import { makeTrade, cleanShops, cleanAuctions, blobStatement } from "./mc-trade.js";
// nwebnotfound.dev – Portfolio (nwebnotfound.dev) + Minecraft-Bereich (mc.nwebnotfound.dev) + Discord-Login
const SITEKEY = "0x4AAAAAAFplEJyvitu_qwlx";
const MAIN = "nwebnotfound.dev", MCD = "mc.nwebnotfound.dev", MC_HOST = "mc.nwebnotfound.dev";
const COOKIE = "nnf_session", SESSION_DAYS = 30;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const authReady = (env) => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.SESSION_SECRET);

/* ---------- gemeinsames CSS ---------- */
const BASE_CSS = `@view-transition{navigation:auto}
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--fg);line-height:1.5;-webkit-font-smoothing:antialiased;letter-spacing:-.01em}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;display:block}
.wrap{width:min(1080px,100% - 2.5rem);margin-inline:auto}
.nav{position:sticky;top:0;z-index:50;background:var(--navbg);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;gap:1.4rem;height:52px}
.brand{white-space:nowrap;font-weight:600;color:var(--fg);font-size:1.02rem;margin-right:auto;display:flex;align-items:center;gap:.5rem}.brand:hover{text-decoration:none}
.nav a.l{color:var(--mut);font-size:.86rem}.nav a.l:hover,.nav a.l[aria-current]{color:var(--fg);text-decoration:none}
.acct{display:flex;align-items:center;gap:.5rem;font-size:.82rem}
.acct img{width:26px;height:26px;border-radius:50%}
.only-s{display:none}.um{position:relative}.um>button{display:flex;min-height:44px;align-items:center;gap:.5rem;background:transparent;border:0;color:var(--fg);font:inherit;font-size:.82rem;padding:.25rem .5rem .25rem .25rem;border-radius:99px;cursor:pointer;transition:background .2s}
.um>button:hover,.um>button[aria-expanded=true]{background:var(--line)}.um .chev{width:10px;height:10px;opacity:.6;transition:transform .25s}.um>button[aria-expanded=true] .chev{transform:rotate(180deg)}
.menu{position:absolute;right:0;top:calc(100% + 8px);min-width:220px;background:var(--menubg,var(--card));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--line);border-radius:14px;padding:.4rem;box-shadow:0 20px 50px -20px var(--shadow);opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top right;pointer-events:none;transition:opacity .18s ease,transform .18s ease;z-index:60}
.menu.open{opacity:1;transform:none;pointer-events:auto}.menu .hd{padding:.55rem .7rem .6rem;border-bottom:1px solid var(--line);margin-bottom:.3rem}.menu .hd b{display:block;font-size:.88rem}.menu .hd span{font-size:.75rem;color:var(--mut)}
.menu a{display:flex;align-items:center;gap:.6rem;padding:.6rem .7rem;border-radius:9px;color:var(--fg);font-size:.88rem}.menu a:hover,.menu a:focus-visible{background:var(--line);text-decoration:none;outline:none}.menu a.out{color:#ff453a}
@media (max-width:640px){.menu{position:fixed;left:.75rem;right:.75rem;top:60px;min-width:0}.menu a{padding:.8rem .8rem;font-size:.95rem}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border:0;border-radius:980px;min-height:44px;padding:0 1.25rem;line-height:1.2;white-space:nowrap;max-width:100%;font:inherit;font-size:.95rem;font-weight:500;cursor:pointer;background:var(--acc);color:var(--accfg);transition:transform .2s ease,opacity .2s ease,background .2s}
.btn:hover{text-decoration:none;transform:translateY(-1px)}.btn:active{transform:scale(.98)}
.btn.sec{background:transparent;color:var(--link);box-shadow:inset 0 0 0 1px currentColor}
.btn.sm{min-height:36px;padding:0 .95rem;font-size:.84rem;position:relative}.btn.sm::before{content:"";position:absolute;inset:-4px -2px}
@media(pointer:coarse){.btn.sm{min-height:40px}}
.btn[disabled]{opacity:.5;cursor:not-allowed;transform:none}
.discord{background:#5865F2;color:#fff}
.mut{color:var(--mut)}
.eyebrow{font-size:.85rem;font-weight:600;color:var(--acc2);letter-spacing:.02em;margin:0 0 .6rem}
h1,h2,h3{letter-spacing:-.025em;line-height:1.08;margin:0}
.h-xl{font-size:clamp(2.6rem,8vw,5rem);font-weight:700}
.h-l{font-size:clamp(2rem,5vw,3.2rem);font-weight:700}
.lead{font-size:clamp(1.1rem,2.4vw,1.4rem);color:var(--mut);max-width:40ch;margin:1.1rem auto 0}
section{padding:clamp(3.5rem,9vw,7rem) 0}
.center{text-align:center}
.grid{display:grid;gap:1.1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.card{background:var(--card);border-radius:22px;padding:clamp(1.4rem,3vw,2rem);border:1px solid var(--line);transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s}
a.card{color:inherit;display:block}a.card:hover{text-decoration:none;transform:translateY(-4px);box-shadow:0 18px 40px -18px var(--shadow)}
.card h3{font-size:1.3rem;margin-bottom:.45rem}.card p{margin:.3rem 0;color:var(--mut)}
.more{color:var(--link);font-weight:500;margin-top:.9rem;display:inline-block}
footer{border-top:1px solid var(--line);padding:2rem 0 2.6rem;font-size:.78rem;color:var(--mut)}
footer .wrap{display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;justify-content:space-between}
input,textarea{width:100%;padding:.8rem 1rem;margin:.35rem 0 1rem;background:var(--field);color:var(--fg);border:1px solid var(--line);border-radius:12px;font:inherit;transition:border-color .2s,box-shadow .2s}
input:focus,textarea:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 4px var(--ring)}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.js .reveal{opacity:0;transform:translateY(24px);transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1)}
.js .reveal.in{opacity:1;transform:none}
.d1{transition-delay:.08s}.d2{transition-delay:.16s}.d3{transition-delay:.24s}
@media (max-width:420px){.nav .wrap{gap:.55rem!important}.nav a.l{font-size:.76rem!important}.brand{font-size:.95rem}}@media (max-width:640px){.only-s{display:inline}.nav .wrap{gap:.9rem}.nav a.l{font-size:.8rem}.hide-s{display:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.js .reveal{opacity:1;transform:none}@view-transition{navigation:none}}`;

const PORT_CSS = `:root{--bg:#fbfbfd;--fg:#1d1d1f;--mut:#6e6e73;--link:#0066cc;--acc:#0071e3;--acc2:#bf4800;--accfg:#fff;--card:#fff;--line:rgba(0,0,0,.08);--navbg:rgba(251,251,253,.72);--field:#fff;--ring:rgba(0,113,227,.18);--shadow:rgba(0,0,0,.25);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#000;--fg:#f5f5f7;--mut:#a1a1a6;--link:#2997ff;--acc:#0a84ff;--acc2:#ff9f0a;--card:#1c1c1e;--line:rgba(255,255,255,.1);--navbg:rgba(0,0,0,.7);--field:#1c1c1e;--ring:rgba(10,132,255,.3);--shadow:rgba(0,0,0,.9)}}
.hero{padding-top:clamp(4.5rem,12vw,9rem)}
.grad{background:linear-gradient(90deg,#0071e3,#a855f7 50%,#ff6b35);-webkit-background-clip:text;background-clip:text;color:transparent}
.alt{background:var(--alt,#f5f5f7)}@media (prefers-color-scheme:dark){.alt{--alt:#0b0b0c}}
.tag{display:inline-block;font-size:.72rem;font-weight:600;padding:.2rem .6rem;border-radius:99px;background:var(--line);color:var(--mut);margin-bottom:.8rem}
.entry{display:flex;gap:.9rem;padding:1.1rem 0;border-bottom:1px solid var(--line)}
.entry:last-child{border:0}.av{width:40px;height:40px;border-radius:50%;flex:none;background:var(--line);display:grid;place-items:center;font-weight:600;color:var(--mut);overflow:hidden}
.entry p{margin:.25rem 0 0;white-space:pre-wrap;word-break:break-word}`;

const MC_CSS = `:root{--bg:#0b0f0c;--fg:#eef5ef;--mut:#93a39a;--link:#7ee787;--acc:#4ade80;--acc2:#4ade80;--accfg:#052e12;--card:rgba(255,255,255,.04);--line:rgba(255,255,255,.09);--navbg:rgba(11,15,12,.72);--field:rgba(255,255,255,.05);--ring:rgba(74,222,128,.25);--shadow:rgba(0,0,0,.9);--menubg:#141a16;color-scheme:dark}
body{background:radial-gradient(1200px 600px at 50% -10%,rgba(74,222,128,.14),transparent 60%),var(--bg)}
.px{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:0}
.pixbg{position:absolute;inset:0;z-index:-1;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:32px 32px;mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 75%);-webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 75%)}
.hero{position:relative;isolation:isolate;padding-top:clamp(4rem,11vw,8rem)}
.block{width:56px;height:56px;margin:0 auto 1.6rem;image-rendering:pixelated;animation:float 6s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-8px)}}
.status{display:flex;align-items:center;justify-content:center;gap:.7rem;font-size:clamp(1.4rem,4vw,2rem);font-weight:700;margin:0}
.dot{width:14px;height:14px;border-radius:50%;background:#6b7280;flex:none}
.dot.on{background:#22c55e;box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:pulse 2s infinite}.dot.off{background:#ef4444}
@keyframes pulse{70%{box-shadow:0 0 0 12px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:1rem;margin-top:1.6rem}
.mcgrid{grid-template-columns:repeat(2,1fr)}@media(min-width:700px){.mcgrid{grid-template-columns:repeat(3,1fr)}}@media(min-width:1000px){.mcgrid{grid-template-columns:repeat(5,1fr)}}
.stat .k{font-size:.8rem;color:var(--mut)}.stat .v{font-size:1.6rem;font-weight:700;margin-top:.2rem}
.bar{height:6px;background:var(--line);border-radius:3px;margin-top:.6rem;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--acc);transition:width .8s cubic-bezier(.2,.8,.2,1)}
.addr{display:inline-flex;align-items:center;gap:.6rem;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.5rem .5rem .5rem 1rem;margin-top:2rem;max-width:100%}
.addr code{font-size:1rem;overflow:hidden;text-overflow:ellipsis}
.steps{counter-reset:s;list-style:none;padding:0;margin:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.steps li{counter-increment:s;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:1.6rem}
.steps li::before{content:counter(s);display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--acc);color:var(--accfg);font-weight:700;margin-bottom:1rem}
.soon{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--acc);border:1px solid var(--ring);border-radius:6px;padding:.15rem .45rem;display:inline-block;margin-bottom:.8rem}${HUB_CSS}`;

const REVEAL_JS = `<script>(()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){els.forEach(e=>e.classList.add('in'));return}const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -40px 0px'});els.forEach(e=>io.observe(e))})();</script>`;

// Account-Chip: lädt /api/me clientseitig (Seiten bleiben cachebar)
const ACCT_JS = (loginBase) => `<script>(async()=>{const el=document.getElementById('acct');if(!el)return;try{const d=await(await fetch('/api/me',{credentials:'include'})).json();const nx=encodeURIComponent(location.href);
if(d.user){const n=d.user.name.replace(/[<>&"']/g,''),un=(d.user.username||'').replace(/[<>&"']/g,'');el.innerHTML='<div class="um"><button type="button" id="umb" aria-haspopup="menu" aria-expanded="false" aria-controls="umm"><img alt="" src="'+d.user.avatar+'"><span class="hide-s">'+n+'</span><svg class="chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button><div class="menu" id="umm" role="menu"><div class="hd"><b>'+n+'</b><span>@'+un+'</span></div><a role="menuitem" href="/profile">Profil</a><a role="menuitem" class="out" href="${loginBase}/auth/discord/logout?next='+nx+'">Abmelden</a></div></div>';
const b=document.getElementById('umb'),m=document.getElementById('umm'),it=()=>[...m.querySelectorAll('a')];const set=o=>{b.setAttribute('aria-expanded',o);m.classList.toggle('open',o);if(o)setTimeout(()=>it()[0].focus(),20)};
b.onclick=e=>{e.stopPropagation();set(!m.classList.contains('open'))};document.addEventListener('click',e=>{if(!m.contains(e.target))set(false)});
document.addEventListener('keydown',e=>{if(!m.classList.contains('open'))return;if(e.key==='Escape'){set(false);b.focus()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const a=it(),i=a.indexOf(document.activeElement);a[(i+(e.key==='ArrowDown'?1:a.length-1))%a.length].focus()}});}
else if(d.available){el.innerHTML='<a class="btn discord sm" href="${loginBase}/auth/discord/login?next='+nx+'"><span class="hide-s">Mit Discord anmelden</span><span class="only-s">Anmelden</span></a>';}
else{el.innerHTML='<button class="btn sm sec" disabled title="Discord-Login ist bald verfügbar"><span class="hide-s">Login </span>bald</button>';}
window.__me=d;document.dispatchEvent(new CustomEvent('me',{detail:d}));}catch(_){}})();</script>`;

const DISCORD_SVG = `<svg width="18" height="14" viewBox="0 0 71 55" fill="currentColor" aria-hidden="true"><path d="M60.1 4.9A58.5 58.5 0 0045.4.4a40 40 0 00-1.9 3.8 54 54 0 00-16.2 0A40 40 0 0025.4.4 58.4 58.4 0 0010.7 4.9C1.4 18.7-1.1 32.2.1 45.5a59 59 0 0018 9.1 43 43 0 003.8-6.2 38 38 0 01-6-2.9l1.5-1.1a42 42 0 0036 0l1.5 1.1a38 38 0 01-6 2.9 43 43 0 003.8 6.2 58.7 58.7 0 0018-9.1c1.5-15.4-2.5-28.8-10.6-40.6zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2z"/></svg>`;

function shell({ title, desc, css, nav, body, head = "", footer, loginBase = "", themeColor }) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="${themeColor}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<script>document.documentElement.classList.add("js")</script><style>${BASE_CSS}${css}</style>${head}</head><body>
<header class="nav"><div class="wrap">${nav}<div class="acct" id="acct"></div></div></header>
<main>${body}</main><footer><div class="wrap">${footer}</div></footer>${REVEAL_JS}${ACCT_JS(loginBase)}</body></html>`;
}

/* ---------- Portfolio ---------- */
const pNav = (cur) => `<a class="brand" href="/">NwebNotFound</a>
<a class="l hide-s" href="/#projekte">Projekte</a><a class="l" href="/guestbook"${cur === "gb" ? ' aria-current="page"' : ""}>Gästebuch</a><a class="l" href="https://${MCD}/">Minecraft</a>`;
const pFoot = `<span>© {{Y}} Nils Weberruß</span><span><a href="/">Start</a> · <a href="/guestbook">Gästebuch</a> · <a href="https://${MCD}/">Minecraft</a></span>`;
const portfolio = (o) => shell({ css: PORT_CSS, footer: pFoot, themeColor: "#fbfbfd", loginBase: "", ...o });

const HOME = portfolio({ title: "Nils Weberruß · NwebNotFound", desc: "Informatik-Student an der TH Ulm. Web- und Server-Projekte.", nav: pNav("home"), body: `
<section class="hero center"><div class="wrap">
<p class="eyebrow reveal">Informatik · TH Ulm</p>
<h1 class="h-xl reveal d1">Hi, ich bin Nils.<br><span class="grad">Ich baue Dinge fürs Web.</span></h1>
<p class="lead reveal d2">Aka <b>NwebNotFound</b>. Ich studiere Informatik an der Technischen Hochschule Ulm und baue in meiner Freizeit Web- und Server-Projekte.</p>
<p class="reveal d3" style="margin-top:2rem;display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap"><a class="btn" href="#projekte">Projekte ansehen</a><a class="btn sec" href="/guestbook">Gästebuch</a></p>
</div></section>
<section id="projekte" class="alt"><div class="wrap">
<h2 class="h-l center reveal">Projekte.</h2><p class="lead center reveal d1" style="margin-bottom:2.6rem">Woran ich gerade arbeite.</p>
<div class="grid">
<a class="card reveal" href="https://${MCD}/"><span class="tag">Live</span><h3>Minecraft-Server</h3><p>Vanilla+ für Freunde: Velocity, Paper, Simple Voice Chat, eigene Economy und Discord-Anbindung. Läuft in Docker.</p><span class="more">Zum Server ›</span></a>
<div class="card reveal d1"><span class="tag">Discord</span><h3>Discord-Bot</h3><p>Verknüpft Discord und Minecraft: Whitelist per /link, Status, Chat-Sync, Shop und Admin-Befehle.</p></div>
<a class="card reveal d2" href="/guestbook"><span class="tag">Cloudflare</span><h3>Diese Website</h3><p>Ein einzelner Cloudflare Worker mit D1, Turnstile und Discord-Login. Schnell, ohne Framework.</p><span class="more">Gästebuch ausprobieren ›</span></a>
</div></div></section>
<section class="center"><div class="wrap">
<h2 class="h-l reveal">Sag Hallo.</h2><p class="lead reveal d1">Hinterlass eine Nachricht im Gästebuch. Anmelden geht mit Discord.</p>
<p class="reveal d2" style="margin-top:2rem"><a class="btn" href="/guestbook">Zum Gästebuch</a></p>
</div></section>` });

const GUEST = portfolio({ title: "Gästebuch · NwebNotFound", desc: "Hinterlass eine Nachricht.", nav: pNav("gb"),
  head: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`, body: `
<section class="hero center" style="padding-bottom:2rem"><div class="wrap"><p class="eyebrow reveal">Gästebuch</p><h1 class="h-l reveal d1">Schön, dass du da bist.</h1><p class="lead reveal d2">Lass einen Gruß da. Zum Schreiben meldest du dich mit Discord an.</p></div></section>
<section style="padding-top:0"><div class="wrap" style="max-width:720px">
<div class="card reveal" id="compose"><p class="mut" style="margin:0">Lade…</p></div>
<div class="card reveal d1" style="margin-top:1.2rem"><div id="list" class="mut">Lade Einträge…</div></div>
</div></section>
<script>
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=t=>{try{return new Date(t.replace(' ','T')+'Z').toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}catch(_){return t}};
async function load(){const d=await(await fetch('/api/guestbook')).json();const L=document.getElementById('list');
L.innerHTML=d.entries.length?d.entries.map(x=>'<div class="entry"><div class="av">'+(x.avatar?'<img alt="" src="'+e(x.avatar)+'" width="40" height="40">':e((x.name||'?')[0].toUpperCase()))+'</div><div><b>'+e(x.name)+'</b> <span class="mut" style="font-size:.8rem">'+e(fmt(x.created_at))+'</span><p>'+e(x.message)+'</p></div></div>').join(''):'Noch keine Einträge. Sei die/der Erste!';L.classList.remove('mut');}
function compose(d){const C=document.getElementById('compose');const nx=encodeURIComponent(location.href);
if(!d.user){C.innerHTML=d.available?'<h3 style="margin-bottom:.5rem">Eintrag schreiben</h3><p class="mut">Melde dich mit Discord an, dann erscheinen dein Name und dein Avatar beim Eintrag.</p><p style="margin-top:1.2rem"><a class="btn discord" href="/auth/discord/login?next='+nx+'">${DISCORD_SVG} Mit Discord anmelden</a></p>':'<h3 style="margin-bottom:.5rem">Eintrag schreiben</h3><p class="mut">Neue Einträge gehen bald per Discord-Login. Der Login ist gleich fertig eingerichtet.</p><p style="margin-top:1.2rem"><button class="btn discord" disabled>${DISCORD_SVG} Discord-<span class="hide-s">Login </span>bald</button></p>';return;}
C.innerHTML='<form id="f"><div style="display:flex;align-items:center;gap:.7rem;margin-bottom:1rem"><img alt="" src="'+e(d.user.avatar)+'" width="36" height="36" style="border-radius:50%"><b>'+e(d.user.name)+'</b></div><label for="m" class="mut" style="font-size:.85rem">Nachricht (max. 500 Zeichen)</label><textarea id="m" name="message" maxlength="500" rows="4" required></textarea><div class="cf-turnstile" data-sitekey="${SITEKEY}" data-theme="auto" style="margin-bottom:1rem"></div><button class="btn">Eintragen</button> <span id="st" class="mut" style="margin-left:.6rem"></span></form>';
window.turnstile&&turnstile.render&&C.querySelector('.cf-turnstile')&&!C.querySelector('iframe')&&setTimeout(()=>{try{if(!C.querySelector('iframe'))turnstile.render(C.querySelector('.cf-turnstile'))}catch(_){}},50);
document.getElementById('f').onsubmit=async ev=>{ev.preventDefault();const st=document.getElementById('st');st.textContent='Sende…';const fd=new FormData(ev.target);
const r=await fetch('/api/guestbook',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({message:fd.get('message'),token:fd.get('cf-turnstile-response')})});const j=await r.json().catch(()=>({}));
st.textContent=r.ok?'Danke!':(j.error||'Fehler');if(r.ok)ev.target.reset();window.turnstile&&turnstile.reset();load();};}
if(window.__me)compose(window.__me);else document.addEventListener('me',ev=>compose(ev.detail));
load();
</script>` });

/* ---------- Minecraft-Bereich ---------- */
const BLOCK_SVG = `<svg class="block" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><rect width="8" height="8" fill="#6b4a2b"/><rect width="8" height="3" fill="#4ade80"/><rect y="3" width="1" height="1" fill="#4ade80"/><rect x="3" y="3" width="1" height="2" fill="#4ade80"/><rect x="6" y="3" width="1" height="1" fill="#4ade80"/><rect x="1" y="1" width="1" height="1" fill="#22c55e"/><rect x="5" y="0" width="1" height="1" fill="#86efac"/><rect x="2" y="5" width="1" height="1" fill="#5a3c22"/><rect x="5" y="6" width="1" height="1" fill="#7c5a37"/></svg>`;
const mNav = hubNav(MAIN);
const mFoot = `<span>© {{Y}} Nils Weberruß · Kein offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden.</span><span><a href="https://${MAIN}/">Hauptseite</a></span>`;

const mcPage = (title, desc, body) => shell({ title, desc, css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", loginBase: `https://${MAIN}`, body });
const MC_HOME = mcPage("Minecraft-Server · NwebNotFound", "Status, Profil, Bestenlisten, Markt und Wiki für mc.nwebnotfound.dev", homeBody(MC_HOST));

/* ---------- Detail-Stats (Profil) + Bestenlisten ---------- */
const ICON_JS = `const ICO=id=>'<span class="ic"><img alt="" loading="lazy" src="/mc-icon/'+encodeURIComponent(id)+'" onerror="this.parentNode.textContent=\\''+String(id).slice(0,2).toUpperCase()+'\\'"></span>';
const NM=id=>String(id).replace(/_/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());const NF=v=>(+v).toLocaleString('de-DE');const KM=m=>m>=1000?(m/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km':NF(Math.round(m))+' m';`;
const DET_CSS = `<style>
.dg{display:grid;gap:1.2rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))}
.dc{border-radius:24px;padding:1.5rem;border:1px solid var(--line);background:linear-gradient(160deg,color-mix(in srgb,var(--fg) 5%,transparent),color-mix(in srgb,var(--fg) 1.5%,transparent));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.dc h3{font-size:1.1rem;margin:0 0 1rem;display:flex;justify-content:space-between;align-items:baseline}.dc h3 small{font-size:.75rem;font-weight:500;opacity:.55}
.row{display:flex;align-items:center;gap:.75rem;padding:.5rem 0}.row+.row{border-top:1px solid var(--line)}
.row .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.92rem}.row b{font-variant-numeric:tabular-nums;font-size:.92rem}
.ic{width:32px;height:32px;flex:none;border-radius:8px;background:color-mix(in srgb,var(--fg) 7%,transparent);display:grid;place-items:center;font-size:.62rem;font-weight:700;opacity:.9}.ic img{width:24px;height:24px;image-rendering:pixelated}
.meter{height:4px;border-radius:2px;background:var(--line);margin-top:.3rem;overflow:hidden}.meter i{display:block;height:100%;background:var(--acc,#4ade80);border-radius:2px}
.mini{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem}.mini div{padding:.85rem 1rem;border-radius:16px;background:color-mix(in srgb,var(--fg) 5%,transparent)}.mini .k{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;opacity:.6}.mini .v{font-size:1.25rem;font-weight:650;margin-top:.15rem;font-variant-numeric:tabular-nums}
.emp{padding:1.4rem 0 .4rem;text-align:center;opacity:.55;font-size:.9rem}
</style>`;
const PROFILE_DETAILS = `${DET_CSS}<script>(()=>{${ICON_JS}const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MOB={zombie:'rotten_flesh',skeleton:'bone',creeper:'gunpowder',spider:'string',enderman:'ender_pearl',cow:'leather',pig:'porkchop',sheep:'white_wool',chicken:'feather',witch:'glass_bottle',slime:'slime_ball',drowned:'trident',blaze:'blaze_rod',ender_dragon:'dragon_egg',wither:'nether_star',phantom:'phantom_membrane',pillager:'bow',villager:'emerald'};const MIC=id=>'<span class="ic"><img alt="" width="22" height="22" style="image-rendering:pixelated" src="/mc-icon/'+id+'"></span>';
const DB={fall:'Fallschaden',lava:'Lava',drown:'Ertrunken',fire:'Feuer',on_fire:'Verbrannt',starve:'Verhungert',void:'Void',explosion:'Explosion',suffocation:'Erstickt',zombie:'Zombie',skeleton:'Skelett',creeper:'Creeper',player:'Spieler'};
const list=(o,f,n=10)=>{const e=Object.entries(o||{}).sort((a,b)=>b[1]-a[1]).slice(0,n);if(!e.length)return '<div class="emp">Noch keine Daten. Spiel eine Runde auf Survival.</div>';const mx=e[0][1]||1;return e.map(([k,v])=>'<div class="row">'+f(k)+'<div class="n">'+E(NM(k))+'<div class="meter"><i style="width:'+Math.max(4,v/mx*100)+'%"></i></div></div><b>'+NF(v)+'</b></div>').join('')};
const card=(t,sub,body)=>'<div class="dc"><h3>'+t+(sub?'<small>'+sub+'</small>':'')+'</h3>'+body+'</div>';
document.addEventListener('mcprofile',ev=>{const m=ev.detail.minecraft;if(!m||!m.visible)return;const d=m.details||{},B=document.getElementById('pb');
const emo=k=>MIC(MOB[k]||'iron_sword');const dd=d.distance_m||{};const DL={walk:'Gelaufen',sprint:'Gesprintet',fly:'Geflogen',swim:'Geschwommen',boat:'Boot',horse:'Pferd'};
const dist=Object.keys(DL).filter(k=>dd[k]!=null);const tot=dist.reduce((a,k)=>a+dd[k],0);
const MS=[['fished','Gefischt'],['traded','Gehandelt'],['jumps','Sprünge'],['damage_dealt','Schaden ausgeteilt'],['damage_taken','Schaden erlitten'],['cp_earned','CP verdient'],['shop_sales','Shop-Verkäufe']].filter(([k])=>d[k]!=null);
const h='<div class="dg">'+card('Top-Blöcke','abgebaut',list(d.mined,ICO))+card('Mob-Kills','',list(d.killed,emo,8))+card('Distanzen',tot?KM(tot)+' gesamt':'',dist.length?'<div class="mini">'+dist.map(k=>'<div><div class="k">'+DL[k]+'</div><div class="v">'+KM(dd[k])+'</div></div>').join('')+'</div>':'<div class="emp">Noch keine Daten.</div>')
+card('Todesursachen','',list(d.deaths_by,k=>MIC(MOB[k]||'bone'),8).replace(/<div class="n">([^<]*)/g,(a,x)=>{const k=x.toLowerCase().replace(/ /g,'_');return '<div class="n">'+E(DB[k]||x)}))
+card('Gesetzt & gecraftet','',list(Object.assign({},d.placed),ICO,5)+(d.crafted?'<div style="height:.8rem"></div>'+list(d.crafted,ICO,5):''))
+card('Sonstiges','',MS.length?'<div class="mini">'+MS.map(([k,t])=>'<div><div class="k">'+t+'</div><div class="v">'+NF(Math.round(d[k]))+'</div></div>').join('')+'</div>':'<div class="emp">Noch keine Daten.</div>')+'</div>';
const w=document.createElement('div');w.innerHTML=h;const mch=B.querySelector('.mch');if(mch)mch.after(w.firstChild);else B.prepend(w.firstChild);});})();</script>`;
const LEADERBOARDS_MC = () => shell({ title: "Bestenlisten · NwebNotFound MC", desc: "Bestenlisten des Minecraft-Servers", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", loginBase: `https://${MAIN}`, body: `${DET_CSS}<style>
.tabs{display:flex;gap:.35rem;overflow-x:auto;padding:.3rem;border-radius:99px;background:color-mix(in srgb,var(--fg) 6%,transparent);border:1px solid var(--line);scrollbar-width:none;max-width:100%}.tabs::-webkit-scrollbar{display:none}
.tabs button{flex:none;border:0;background:transparent;color:var(--mut);font:inherit;font-size:.88rem;font-weight:500;padding:.5rem 1rem;border-radius:99px;cursor:pointer;transition:background .2s,color .2s}.tabs button[aria-selected=true]{background:var(--acc);color:var(--accfg)}
.seg{display:inline-flex;padding:.25rem;border-radius:12px;background:color-mix(in srgb,var(--fg) 6%,transparent);margin-top:1rem}.seg button{border:0;background:transparent;color:var(--mut);font:inherit;font-size:.82rem;padding:.4rem 1rem;border-radius:9px;cursor:pointer}.seg button[aria-pressed=true]{background:var(--card);color:var(--fg);box-shadow:0 1px 4px rgba(0,0,0,.3);background:#1f2a22}
.pod{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:.8rem;align-items:end;margin:1.6rem 0}.pod>div{text-align:center;padding:1.2rem .6rem;border-radius:22px;border:1px solid var(--line);background:color-mix(in srgb,var(--fg) 4%,transparent)}
.pod img{width:56px;height:56px;margin:0 auto .6rem;border-radius:10px;image-rendering:pixelated}.pod .p1{padding-top:1.8rem;background:linear-gradient(180deg,rgba(74,222,128,.18),transparent);border-color:rgba(74,222,128,.35)}.pod .p1 img{width:72px;height:72px}
.pod b{display:block;font-size:.95rem;overflow:hidden;text-overflow:ellipsis}.pod span{font-size:.8rem;opacity:.7;font-variant-numeric:tabular-nums}.pod .r{font-size:.7rem;font-weight:700;letter-spacing:.1em;color:var(--acc)}
.lbr{display:flex;align-items:center;gap:.8rem;padding:.75rem .4rem}.lbr+.lbr{border-top:1px solid var(--line)}.lbr .px{width:1.6rem;opacity:.6}.lbr img{width:30px;height:30px;border-radius:6px;image-rendering:pixelated}.lbr .n{flex:1}.lbr b{font-variant-numeric:tabular-nums}
</style>
<section class="hero center" style="padding-bottom:1.5rem"><div class="pixbg"></div><div class="wrap"><p class="eyebrow">Minecraft</p><h1 class="h-xl">Bestenlisten.</h1><p class="lead">Wer auf dem Server vorne liegt.</p></div></section>
<section style="padding-top:0"><div class="wrap" style="max-width:760px">
<div style="display:flex;flex-direction:column;align-items:center"><div class="tabs" role="tablist" id="tabs"></div><div class="seg" id="seg"><button data-k="weekly" aria-pressed="false">Woche</button><button data-k="total" aria-pressed="true">Gesamt</button></div></div>
<div id="out"></div><p class="mut center" id="upd" style="font-size:.78rem;margin-top:1.4rem"></p></div></section>
<script>(()=>{${ICON_JS}const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const up=t=>{t=+t||0;const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return d?d+' T '+h+' Std':h?h+' Std '+m+' Min':m+' Min'};
const T=[['money','CP',v=>NF(v)+' CP'],['playtime','Spielzeit',up],['blocks_mined','Blöcke',NF],['kills','Kills',NF],['kd','K/D',v=>(+v).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})],['distance','Distanz',KM]];
let D={},tab=(location.hash.slice(1)||'money'),per='total';if(!T.some(t=>t[0]===tab))tab='money';
const av=n=>'https://mc-heads.net/avatar/'+encodeURIComponent(n)+'/72';
function draw(){document.getElementById('tabs').innerHTML=T.map(([k,t])=>'<button role="tab" data-k="'+k+'" aria-selected="'+(k===tab)+'">'+t+'</button>').join('');
document.querySelectorAll('#seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===per));
const [,lbl,f]=T.find(t=>t[0]===tab),P=D[per],L=(P&&P.lists&&P.lists[tab])||[],O=document.getElementById('out');
document.getElementById('upd').textContent=P&&P.updated_at?'Stand: '+new Date(P.updated_at).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'';
if(!L.length){O.innerHTML='<div class="dc" style="margin-top:1.6rem;text-align:center;padding:3rem 1.5rem"><div style="font-size:2.4rem"><img alt="" width="48" height="48" style="image-rendering:pixelated;margin:0 auto" src="/mc-icon/diamond"></div><h3 style="justify-content:center;margin:.6rem 0 .3rem">Noch niemand auf dem Treppchen</h3><p class="mut" style="margin:0">'+(per==='weekly'?'Diese Woche gibt es noch keine Werte für '+lbl+'.':'Für '+lbl+' gibt es noch keine Werte.')+' Spiel auf Survival und hol dir Platz 1.</p></div>';return}
const pd=[L[1],L[0],L[2]];O.innerHTML='<div class="pod">'+pd.map((x,i)=>x?'<div class="'+(i===1?'p1':'')+'"><div class="r">#'+(i===1?1:i===0?2:3)+'</div><img alt="" src="'+av(x.name)+'"><b>'+E(x.name)+'</b><span>'+E(f(x.value))+'</span></div>':'<div style="opacity:0"></div>').join('')+'</div>'+
(L.length>3?'<div class="dc">'+L.slice(3).map((x,i)=>'<div class="lbr"><span class="px">'+(i+4)+'</span><img alt="" src="'+av(x.name).replace('/72','/30')+'"><span class="n">'+E(x.name)+'</span><b>'+E(f(x.value))+'</b></div>').join('')+'</div>':'');}
document.getElementById('tabs').onclick=e=>{const k=e.target.dataset.k;if(k){tab=k;history.replaceState(null,'','#'+k);draw()}};
document.getElementById('seg').onclick=e=>{const k=e.target.dataset.k;if(k){per=k;draw()}};
draw();fetch('/api/mc-leaderboards').then(r=>r.json()).then(d=>{D=d;draw()}).catch(()=>{});})();</script>` });

/* ---------- Profil ---------- */
const PROFILE_BODY = (mc) => `
<style>
.mch{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(240px,340px) 1fr;gap:2rem;align-items:center;padding:2.2rem;border-radius:28px;border:1px solid var(--line);background:linear-gradient(160deg,color-mix(in srgb,var(--fg) 6%,transparent),color-mix(in srgb,var(--fg) 1%,transparent));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 30px 80px -40px var(--shadow,rgba(0,0,0,.5))}
.mch-glow{position:absolute;inset:-40% auto auto -20%;width:70%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(74,222,128,.28),transparent 65%);filter:blur(30px);pointer-events:none}
.mch-model{position:relative;height:400px;display:grid;place-items:center}
.mch-model canvas{position:absolute;inset:0;width:100%!important;height:100%!important;opacity:0;animation:mchIn .8s ease forwards}
.mch-model.ready .mch-fb{opacity:0;transition:opacity .4s}
.mch-fb{max-height:300px;image-rendering:pixelated;filter:drop-shadow(0 20px 30px rgba(0,0,0,.35))}
.mch-model::after{content:"";position:absolute;bottom:18px;left:50%;width:46%;height:16px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(rgba(0,0,0,.45),transparent 70%);z-index:-1}
@keyframes mchIn{to{opacity:1}}
.mch-info{position:relative;min-width:0}
.mch-name{font-size:clamp(2rem,5vw,3.2rem);letter-spacing:-.03em;line-height:1.05;margin:.2rem 0 .3rem;font-weight:700}
.mch-sub{margin:0 0 1.4rem;font-size:.85rem;opacity:.65}
.mch-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.7rem}
.mch-tile{padding:1rem 1.1rem;border-radius:18px;background:color-mix(in srgb,var(--fg) 5%,transparent);border:1px solid var(--line);transition:transform .25s ease,background .25s}
.mch-tile:hover{transform:translateY(-2px);background:color-mix(in srgb,var(--fg) 8%,transparent)}
.mch-tile.wide{grid-column:1/-1}.mch-tile.wide .v{font-size:2rem}
.mch-tile .k{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;opacity:.6}
.mch-tile .v{font-size:1.45rem;font-weight:650;letter-spacing:-.02em;margin-top:.25rem;font-variant-numeric:tabular-nums}
.mch-tile.empty .v{opacity:.35}.mch-tile .nd{font-size:.7rem;opacity:.5;margin-top:.15rem}
@media (max-width:760px){.mch{grid-template-columns:1fr;padding:1.4rem;gap:.5rem;text-align:center}.mch-model{height:320px}.mch-grid{text-align:left}}
@media (prefers-reduced-motion:reduce){.mch-model canvas{animation:none;opacity:1}.mch-tile{transition:none}}
</style>
<section class="hero center" style="padding-bottom:2rem">${mc ? '<div class="pixbg"></div>' : ""}<div class="wrap" id="ph"><p class="mut">Lade Profil…</p></div></section>
<section style="padding-top:0"><div class="wrap" style="max-width:860px;display:grid;gap:1.2rem" id="pb"></div></section>
<script>
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fd=t=>{try{return new Date(t.replace(' ','T')+(t.includes('Z')?'':'Z')).toLocaleDateString('de-DE',{dateStyle:'long'})}catch(_){return t}};
const up=t=>{t=+t||0;const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return d?d+' T '+h+' Std':h?h+' Std '+m+' Min':m+' Min'};
const LBL={money:['Kontostand',v=>(+v).toLocaleString('de-DE')+' CP'],playtime:['Spielzeit',up],kills:['Kills',v=>(+v).toLocaleString('de-DE')],deaths:['Tode',v=>(+v).toLocaleString('de-DE')],blocks_mined:['Abgebaute Blöcke',v=>(+v).toLocaleString('de-DE')]};

function sv3d(url){const box=document.getElementById('mcm');if(!box)return;
const ok=(()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch(_){return false}})();if(!ok)return;
const go=()=>{const s=document.createElement('script');s.src='/vendor/skinview3d-3.4.2.min.js';s.async=true;s.onload=()=>init();document.head.appendChild(s)};
const io=new IntersectionObserver(e=>{if(e[0].isIntersecting){io.disconnect();go()}},{rootMargin:'200px'});io.observe(box);
function init(){try{const RM=matchMedia('(prefers-reduced-motion: reduce)').matches,fine=matchMedia('(hover: hover) and (pointer: fine)').matches;
const cv=document.createElement('canvas');const w=box.clientWidth||300,hh=box.clientHeight||380;
const v=new skinview3d.SkinViewer({canvas:cv,width:w,height:hh,skin:url,zoom:.82,fov:40});
v.controls.enableRotate=false;v.controls.enableZoom=false;v.controls.enablePan=false;v.globalLight.intensity=2.6;v.cameraLight.intensity=.7;
v.loadSkin(url).then(()=>{box.classList.add('ready');box.appendChild(cv)}).catch(()=>{try{v.dispose()}catch(_){}});
new ResizeObserver(()=>{v.setSize(box.clientWidth,box.clientHeight)}).observe(box);
const P=v.playerObject,head=P.skin.head;P.rotation.y=-.35;
if(RM){v.renderPaused=false;return}
if(!fine){const a=new skinview3d.IdleAnimation();v.animation=a;let t=0;const tick=()=>{t+=.012;P.rotation.y=Math.sin(t*.6)*.45-.1;head.rotation.y=Math.sin(t*.9)*.18;requestAnimationFrame(tick)};tick();return}
v.animation=new skinview3d.IdleAnimation();v.animation.speed=.6;
let tx=0,ty=0,cx=0,cy=0;addEventListener('pointermove',e=>{const r=cv.getBoundingClientRect();const ox=r.left+r.width/2,oy=r.top+r.height*.22;
tx=Math.max(-1,Math.min(1,(e.clientX-ox)/(innerWidth*.45)));ty=Math.max(-1,Math.min(1,(e.clientY-oy)/(innerHeight*.45)))},{passive:true});
addEventListener('pointerleave',()=>{tx=0;ty=0});
const loop=()=>{cx+=(tx-cx)*.08;cy+=(ty-cy)*.08;head.rotation.y=cx*.85;head.rotation.x=cy*.55;P.rotation.y=cx*.35;requestAnimationFrame(loop)};loop();
}catch(err){console.warn('skinview3d',err)}}}
(async()=>{const H=document.getElementById('ph'),B=document.getElementById('pb');
const r=await fetch('/api/profile',{credentials:'include'});const d=await r.json().catch(()=>({}));
if(!d.user){H.innerHTML='<h1 class="h-l">Dein Profil.</h1><p class="lead">Melde dich mit Discord an, um dein Profil zu sehen.</p><p style="margin-top:2rem"><a class="btn discord" href="${mc ? `https://${MAIN}` : ""}/auth/discord/login?next='+encodeURIComponent(location.href)+'">${DISCORD_SVG} Mit Discord anmelden</a></p>';return}
const u=d.user;H.innerHTML='<img alt="" src="'+E(u.avatar)+'" width="112" height="112" style="width:112px;height:112px;border-radius:50%;margin:0 auto 1.2rem;box-shadow:0 10px 40px -10px var(--shadow)"><h1 class="h-l">'+E(u.name)+'</h1><p class="mut" style="margin:.4rem 0 0">@'+E(u.username)+(u.member_since?' · Mitglied seit '+E(fd(u.member_since)):'')+'</p>';
let h='';const m=d.minecraft;
if(m&&m.visible){const st=m.stats||{};const ks=Object.keys(st).filter(k=>k!=='inventory');
const SK=['money','playtime','kills','deaths','blocks_mined'].concat(ks.filter(k=>!LBL[k]));const id=encodeURIComponent(m.mc_uuid||m.mc_name);
h+='<div class="mch"><div class="mch-glow"></div><div class="mch-model" id="mcm"><img class="mch-fb" alt="Skin von '+E(m.mc_name)+'" src="https://mc-heads.net/body/'+id+'/220" loading="lazy"></div><div class="mch-info"><p class="eyebrow" style="margin:0">Minecraft</p><h2 class="mch-name">'+E(m.mc_name)+'</h2><p class="mch-sub">Verifiziert · Survival</p>'+
'<div class="mch-grid">'+SK.map((k,j)=>{const [t,f]=LBL[k]||[k.replace(/_/g,' '),v=>typeof v==='number'?v.toLocaleString('de-DE'):String(v)];const has=st[k]!=null&&st[k]!=='';return '<div class="mch-tile'+(j===0?' wide':'')+(has?'':' empty')+'"><div class="k">'+E(t)+'</div><div class="v">'+(has?E(f(st[k])):'–')+'</div>'+(has?'':'<div class="nd">noch keine Daten</div>')+'</div>'}).join('')+'</div>'+
(m.updated_at?'<p class="mut" style="font-size:.78rem;margin:1rem 0 0">Stand: '+E(new Date(m.updated_at).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}))+'</p>':'')+'</div></div>';
window.__skin='https://mc-heads.net/skin/'+id;
h+='<div class="card"><h3>Inventar</h3><p class="mut" style="font-size:.8rem;margin-top:0">Nur für dich sichtbar.</p>'+(Array.isArray(st.inventory)&&st.inventory.length?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:.5rem;margin-top:1rem">'+st.inventory.map(i=>'<div title="'+E(i.item)+'" style="aspect-ratio:1;border:1px solid var(--line);border-radius:10px;display:grid;place-items:center;font-size:.62rem;text-align:center;padding:.3rem;position:relative">'+E(String(i.item||'').replace(/^minecraft:/,'').replace(/_/g,' '))+'<b style="position:absolute;right:5px;bottom:3px;font-size:.7rem">'+(i.count>1?i.count:'')+'</b></div>').join('')+'</div>':'<p class="mut">Inventar-Anzeige kommt bald.</p>')+'</div>';}
else if(m){h+='<div class="card" style="text-align:center"><p class="eyebrow">Minecraft</p><h3>Noch nicht verknüpft</h3><p>'+E(m.hint)+'</p></div>';}
const g=d.guestbook||[];h+='<div class="card"><h3 style="margin-bottom:.6rem">Deine Gästebuch-Einträge</h3>'+(g.length?g.map(x=>'<div style="padding:.9rem 0;border-top:1px solid var(--line)"><span class="mut" style="font-size:.8rem">'+E(fd(x.created_at))+'</span><p style="margin:.25rem 0 0;white-space:pre-wrap;word-break:break-word;color:var(--fg)">'+E(x.message)+'</p></div>').join(''):'<p>Noch keine Einträge. <a href="https://${MAIN}/guestbook">Jetzt einen schreiben ›</a></p>')+'</div>';
B.innerHTML=h;document.dispatchEvent(new CustomEvent('mcprofile',{detail:d}));if(window.__skin)sv3d(window.__skin);})();
</script>${PROFILE_DETAILS}`;
const PROFILE_MAIN = () => portfolio({ title: "Profil · NwebNotFound", desc: "Dein Profil", nav: pNav("profile"), body: PROFILE_BODY(false) });
const PROFILE_MC = () => shell({ title: "Profil · NwebNotFound MC", desc: "Dein Profil", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", loginBase: `https://${MAIN}`, body: PROFILE_BODY(true) });

async function profileApi(req, env) {
  const origin = req.headers.get("origin");
  const cors = origin === `https://${MCD}` || origin === `https://${MAIN}` ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "origin" } : {};
  const u = await getUser(req, env).catch(() => null);
  if (!u) return json({ user: null }, 200, cors);
  const since = await env.DB.prepare("SELECT MIN(created_at) AS c FROM sessions WHERE discord_id = ?").bind(u.id).first().catch(() => null);
  const { results: gb } = await env.DB.prepare("SELECT message, created_at FROM entries WHERE discord_id = ? ORDER BY id DESC LIMIT 20").bind(u.id).all().catch(() => ({ results: [] }));
  const link = await env.DB.prepare("SELECT mc_name, mc_uuid, has_role, verified FROM mc_links WHERE discord_id = ?").bind(u.id).first().catch(() => null);
  let minecraft = { visible: false, hint: "Verknüpfe deinen Account im Discord mit /link" };
  if (link && link.verified && link.has_role) {
    const ps = await env.DB.prepare("SELECT stats, updated_at, details FROM mc_player_stats WHERE mc_uuid = ?").bind(link.mc_uuid).first().catch(() => null);
    minecraft = { visible: true, mc_name: link.mc_name, mc_uuid: link.mc_uuid, stats: ps ? JSON.parse(ps.stats) : {}, details: ps && ps.details ? JSON.parse(ps.details) : null, updated_at: ps ? new Date(ps.updated_at).toISOString() : null };
  } else if (link && !link.verified) minecraft.hint = "Bestätige die Verknüpfung im Discord mit deinem Code (/link).";
  else if (link && !link.has_role) minecraft.hint = "Dir fehlt noch die Server-Rolle im Discord. Danach erscheinen hier deine Stats.";
  return json({ user: { id: u.id, name: u.name, username: u.username, avatar: u.avatar, member_since: since?.c || null }, guestbook: gb, minecraft }, 200, cors);
}

/* ---------- Status-API ---------- */
async function mcStatus(ctx) {
  const cache = caches.default, key = new Request("https://nwebnotfound.dev/__cache/mc-status");
  const hit = await cache.match(key); if (hit) return withCors(hit);
  let out = null;
  try {
    const r = await fetch(`https://api.mcsrvstat.us/3/${MC_HOST}`, { headers: { "user-agent": "nwebnotfound.dev status page" } });
    if (r.ok) { const d = await r.json(); out = { online: !!d.online, players: { online: d.players?.online ?? 0, max: d.players?.max ?? 0, list: (d.players?.list || []).map(x => x.name || String(x)).slice(0, 50) }, version: d.version || null, motd: (d.motd?.clean || []).join(" ").trim() || null, source: "mcsrvstat.us" }; }
  } catch {}
  if (!out || !out.online) try {
    const r = await fetch(`https://api.mcstatus.io/v2/status/java/${MC_HOST}`);
    if (r.ok) { const d = await r.json(); out = { online: !!d.online, players: { online: d.players?.online ?? 0, max: d.players?.max ?? 0, list: (d.players?.list || []).map(x => x.name_clean || x.name_raw).slice(0, 50) }, version: d.version?.name_clean || null, motd: (d.motd?.clean || "").trim() || null, source: "mcstatus.io" }; }
  } catch {}
  if (!out) out = { online: false, players: { online: 0, max: 0, list: [] }, version: null, motd: null, error: "Status-APIs nicht erreichbar" };
  out.host = MC_HOST; out.checked_at = new Date().toISOString();
  const res = new Response(JSON.stringify(out), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return withCors(res);
}
const withCors = (r) => { r = new Response(r.body, r); r.headers.set("access-control-allow-origin", "*"); return r; };

/* ---------- Auth (Discord OAuth2) ---------- */
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function hmac(secret, data) { const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data))); }
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function sign(env, v) { return `${v}.${await hmac(env.SESSION_SECRET, v)}`; }
async function unsign(env, s) { if (!s || !env.SESSION_SECRET) return null; const i = s.lastIndexOf("."); if (i < 1) return null; const v = s.slice(0, i); return safeEq(s.slice(i + 1), await hmac(env.SESSION_SECRET, v)) ? v : null; }
const cookies = (req) => Object.fromEntries((req.headers.get("cookie") || "").split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const sessCookie = (v, maxAge) => `${COOKIE}=${encodeURIComponent(v)}; Domain=.${MAIN}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const safeNext = (n) => { try { const u = new URL(n); if (u.protocol === "https:" && (u.hostname === MAIN || u.hostname === MCD)) return u.toString(); } catch {} return `https://${MAIN}/`; };
const avatarUrl = (id, av) => av ? `https://cdn.discordapp.com/avatars/${id}/${av}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
const redirect = (loc, headers = {}) => new Response(null, { status: 302, headers: { location: loc, "cache-control": "no-store", ...headers } });

async function getUser(req, env) {
  if (!authReady(env)) return null;
  const sid = await unsign(env, cookies(req)[COOKIE]); if (!sid) return null;
  const row = await env.DB.prepare("SELECT discord_id, username, global_name, avatar FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(sid).first();
  if (!row) return null;
  return { id: row.discord_id, name: row.global_name || row.username, username: row.username, avatar: avatarUrl(row.discord_id, row.avatar), sid };
}

async function auth(p, req, env, url) {
  const next = safeNext(url.searchParams.get("next") || `https://${MAIN}/`);
  const redirectUri = `https://${MAIN}/auth/discord/callback`;
  if (p === "/auth/discord/login") {
    if (!authReady(env)) return html(portfolio({ title: "Login bald verfügbar", desc: "", nav: pNav(""), body: `<section class="hero center"><div class="wrap"><h1 class="h-l">Discord-Login ist bald verfügbar.</h1><p class="lead">Der Login wird gerade eingerichtet. Schau bald wieder vorbei.</p><p style="margin-top:2rem"><a class="btn" href="${esc(next)}">Zurück</a></p></div></section>` }), 503);
    const state = rand(24);
    const st = await sign(env, `${state}|${b64u(enc.encode(next))}`);
    const q = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: redirectUri, scope: "identify", state, prompt: "none" });
    return redirect(`https://discord.com/oauth2/authorize?${q}`, { "set-cookie": `nnf_oauth=${encodeURIComponent(st)}; Path=/auth/discord; Max-Age=600; HttpOnly; Secure; SameSite=Lax` });
  }
  if (p === "/auth/discord/callback") {
    if (!authReady(env)) return redirect(`https://${MAIN}/`);
    const clear = "nnf_oauth=; Path=/auth/discord; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
    const raw = await unsign(env, cookies(req).nnf_oauth);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (!raw || !code || !state) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    const [s, nb] = raw.split("|"); if (!safeEq(s, state)) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    let back = `https://${MAIN}/`; try { back = safeNext(new TextDecoder().decode(Uint8Array.from(atob(nb.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)))); } catch {}
    const tr = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
    if (!tr.ok) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    const tok = await tr.json();
    const ur = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${tok.access_token}` } });
    if (!ur.ok) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    const u = await ur.json();
    const sid = rand(32);
    await env.DB.prepare("INSERT INTO sessions (id, discord_id, username, global_name, avatar, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))").bind(sid, u.id, u.username, u.global_name || null, u.avatar || null, `+${SESSION_DAYS} days`).run();
    const h = new Headers({ location: back, "cache-control": "no-store" });
    h.append("set-cookie", clear); h.append("set-cookie", sessCookie(await sign(env, sid), SESSION_DAYS * 86400));
    return new Response(null, { status: 302, headers: h });
  }
  if (p === "/auth/discord/logout") {
    const user = await getUser(req, env);
    if (user) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(user.sid).run();
    return redirect(next, { "set-cookie": sessCookie("", 0) });
  }
  return null;
}

/* ---------- MC-Ingest (Push von PC-Nils) ---------- */
const FRESH_MS = 5 * 60 * 1000;
const clip = (v, n = 32) => String(v ?? "").slice(0, n);
function cleanIngest(b) {
  const servers = {};
  for (const [k, v] of Object.entries(b?.servers || {}).slice(0, 8)) {
    if (!/^[a-z0-9_-]{1,24}$/i.test(k) || typeof v !== "object" || !v) continue;
    servers[k] = { online: !!v.online, players: (Array.isArray(v.players) ? v.players : []).slice(0, 100).map(x => clip(typeof x === "string" ? x : x?.name, 16)).filter(Boolean),
      max: Number.isFinite(+v.max) ? +v.max : null, version: v.version ? clip(v.version, 40) : null, mode: v.mode ? clip(v.mode, 40) : null, uptime_seconds: Number.isFinite(+(v.uptime_seconds ?? v.uptime)) && (v.uptime_seconds ?? v.uptime) !== null ? Math.max(0, Math.floor(+(v.uptime_seconds ?? v.uptime))) : null, tps: Number.isFinite(+v.tps) ? Math.round(+v.tps * 10) / 10 : null };
  }
  const leaderboards = {};
  for (const [k, v] of Object.entries(b?.leaderboards || {}).slice(0, 12)) {
    if (!/^[a-z0-9_-]{1,24}$/i.test(k) || !Array.isArray(v)) continue;
    leaderboards[k] = v.slice(0, 10).map(x => ({ name: clip(x?.name, 16), value: Number(x?.value) || 0 })).filter(x => x.name);
  }
  const leaderboards_weekly = cleanLb(b?.leaderboards_weekly);
  const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  const normU = (x) => String(x).toLowerCase().replace(/-/g, "").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const links = Array.isArray(b?.links) ? b.links.slice(0, 200).filter(l => /^\d{15,21}$/.test(String(l?.discord_id ?? "")) && UUID.test(String(l?.mc_uuid ?? "")) && /^[A-Za-z0-9_]{1,16}$/.test(String(l?.mc_name ?? "")))
    .map(l => ({ discord_id: String(l.discord_id), mc_name: String(l.mc_name), mc_uuid: normU(l.mc_uuid), has_role: l.has_role === true, verified: l.verified === true })) : null;
  const players_stats = {}, details = {};
  for (const [k, v] of Object.entries(b?.players_stats || {}).slice(0, 200)) {
    if (!UUID.test(k) || typeof v !== "object" || !v) continue;
    const o = {};
    if (v.details !== undefined) { const d = cleanDetails(v.details); if (d) details[normU(k)] = d; }
    for (const [sk, sv] of Object.entries(v).filter(([x]) => x !== "details").slice(0, 24)) {
      if (!/^[a-z0-9_]{1,24}$/i.test(sk)) continue;
      if (sk === "inventory") { if (Array.isArray(sv)) o.inventory = sv.slice(0, 41).map(i => ({ item: clip(i?.item, 48), count: Math.max(0, Math.min(999, Math.floor(+i?.count || 0))) })).filter(i => i.item); continue; }
      if (Number.isFinite(+sv) && typeof sv !== "boolean") o[sk] = +sv; else if (typeof sv === "string") o[sk] = clip(sv, 40);
    }
    players_stats[normU(k)] = o;
  }
  return { servers, leaderboards, links, players_stats, details, leaderboards_weekly };
}
/* Erweiterung Detail-Stats + Wochen-Bestenlisten */
function cleanLb(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = {};
  for (const [k, v] of Object.entries(o).slice(0, 12)) {
    if (!/^[a-z0-9_-]{1,24}$/i.test(k) || !Array.isArray(v)) continue;
    r[k] = v.slice(0, 10).map(x => ({ name: clip(x?.name, 16), value: Number(x?.value) || 0 })).filter(x => /^[A-Za-z0-9_]{1,16}$/.test(x.name)).sort((a, b) => b.value - a.value);
  }
  return r;
}
const DETAIL_MAPS = ["mined", "placed", "killed", "deaths_by", "crafted", "playtime_by_world"];
const DETAIL_NUMS = ["fished", "traded", "jumps", "damage_dealt", "damage_taken", "cp_earned", "shop_sales"];
const DIST_KEYS = ["walk", "sprint", "fly", "swim", "boat", "horse"];
const num = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(+v) ? Math.max(0, +v) : null;
function cleanDetails(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const o = {};
  for (const m of DETAIL_MAPS) {
    const src = d[m]; if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const e = [];
    for (const [k, v] of Object.entries(src)) {
      const id = String(k).toLowerCase().replace(/^minecraft:/, ""), n = num(v);
      if (/^[a-z0-9_./-]{1,48}$/.test(id) && n !== null) e.push([id, n]);
    }
    e.sort((a, b) => b[1] - a[1]); if (e.length) o[m] = Object.fromEntries(e.slice(0, 25));
  }
  if (d.distance_m && typeof d.distance_m === "object") { const r = {}; for (const k of DIST_KEYS) { const n = num(d.distance_m[k]); if (n !== null) r[k] = Math.round(n); } if (Object.keys(r).length) o.distance_m = r; }
  for (const k of DETAIL_NUMS) { const n = num(d[k]); if (n !== null) o[k] = n; }
  if (!Object.keys(o).length) return null;
  return JSON.stringify(o).length <= 16384 ? o : null;
}
async function mcLeaderboards(env) {
  const { results } = await env.DB.prepare("SELECT kind, data, updated_at FROM mc_leaderboards").all().catch(() => ({ results: [] }));
  const out = { total: null, weekly: null };
  for (const r of results) if (r.kind in out) out[r.kind] = { updated_at: new Date(r.updated_at).toISOString(), lists: JSON.parse(r.data) };
  if (!out.total) { const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null); const lb = row ? JSON.parse(row.data).leaderboards : null; if (lb && Object.keys(lb).length) out.total = { updated_at: new Date(row.updated_at).toISOString(), lists: lb }; }
  return json(out, 200, { "cache-control": "public, max-age=30" });
}
async function mcIngest(req, env) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const tok = req.headers.get("x-ingest-token") || "";
  if (!env.MC_INGEST_TOKEN || !safeEq(tok, env.MC_INGEST_TOKEN)) return json({ error: "unauthorized" }, 401);
  const raw = await req.text(); if (raw.length > 8388608) return json({ error: "too large" }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: "invalid json" }, 400); }
  const { links, players_stats, details, leaderboards_weekly, ...data } = cleanIngest(b), now = Date.now();
  const st = [], market = cleanMarket(b?.market), market_history = cleanHistory(b?.market_history);
  if (b?.servers || b?.leaderboards) {
    // Teile unabhängig mergen: jeder Teil mit eigenem Zeitstempel
    const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null);
    const cur = row ? JSON.parse(row.data) : {};
    if (cur.servers && !cur.servers_at) cur.servers_at = row.updated_at;
    if (cur.leaderboards && !cur.leaderboards_at) cur.leaderboards_at = row.updated_at;
    if (b.servers) { cur.servers = data.servers; cur.servers_at = now; }
    if (b.leaderboards) { cur.leaderboards = data.leaderboards; cur.leaderboards_at = now; }
    st.push(env.DB.prepare("INSERT INTO mc_snapshot (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(JSON.stringify(cur), now));
  }
  if (links) {
    if (b.links_full === true) st.push(env.DB.prepare("DELETE FROM mc_links"));
    for (const l of links) st.push(env.DB.prepare("INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(discord_id) DO UPDATE SET mc_name=excluded.mc_name, mc_uuid=excluded.mc_uuid, has_role=excluded.has_role, verified=excluded.verified, updated_at=excluded.updated_at WHERE mc_name IS NOT excluded.mc_name OR mc_uuid IS NOT excluded.mc_uuid OR has_role IS NOT excluded.has_role OR verified IS NOT excluded.verified").bind(l.discord_id, l.mc_name, l.mc_uuid, l.has_role ? 1 : 0, l.verified ? 1 : 0, now));
  }
  if (b?.leaderboards) st.push(env.DB.prepare("INSERT INTO mc_leaderboards (kind, data, updated_at) VALUES ('total', ?, ?) ON CONFLICT(kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE data IS NOT excluded.data OR updated_at < excluded.updated_at - 240000").bind(JSON.stringify(cleanLb(b.leaderboards) || {}), now));
  if (leaderboards_weekly) st.push(env.DB.prepare("INSERT INTO mc_leaderboards (kind, data, updated_at) VALUES ('weekly', ?, ?) ON CONFLICT(kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE data IS NOT excluded.data OR updated_at < excluded.updated_at - 240000").bind(JSON.stringify(leaderboards_weekly), now));
  for (const [k, v] of Object.entries(players_stats)) st.push(env.DB.prepare("INSERT INTO mc_player_stats (mc_uuid, stats, updated_at, details) VALUES (?, ?, ?, ?) ON CONFLICT(mc_uuid) DO UPDATE SET stats=excluded.stats, updated_at=excluded.updated_at, details=COALESCE(excluded.details, mc_player_stats.details) WHERE stats IS NOT excluded.stats OR (excluded.details IS NOT NULL AND details IS NOT excluded.details) OR updated_at < excluded.updated_at - 240000").bind(k, JSON.stringify(v), now, details[k] ? JSON.stringify(details[k]) : null));
  st.push(...marketStatements(env, market, market_history));
  const shops = cleanShops(b?.shops), auctions = cleanAuctions(b?.auctions);
  if (shops) st.push(blobStatement(env, "shops", shops, now));
  if (auctions) st.push(blobStatement(env, "auctions", auctions, now));
  if (st.length) await env.DB.batch(st);
  return json({ ok: true, shops: shops ? shops.length : 0, auctions: auctions ? auctions.length : 0, market: market ? market.length : 0, market_history: market_history ? market_history.length : 0, servers: Object.keys(data.servers).length, leaderboards: Object.keys(data.leaderboards).length, links: links ? links.length : 0, players_stats: Object.keys(players_stats).length, details: Object.keys(details).length, leaderboards_weekly: leaderboards_weekly ? Object.keys(leaderboards_weekly).length : 0 });
}
let _trade; const TRADE = () => _trade || (_trade = makeTrade({ json, getUser, safeEq, MAIN, MCD }));
async function mcData(env) {
  const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null);
  const d = row ? JSON.parse(row.data) : {}, now = Date.now(), iso = (t) => t ? new Date(t).toISOString() : null;
  const sAt = d.servers_at || (d.servers ? row.updated_at : null), lAt = d.leaderboards_at || (d.leaderboards ? row.updated_at : null);
  const sF = !!sAt && now - sAt <= FRESH_MS, lF = !!lAt && now - lAt <= FRESH_MS;
  return json({ fresh: sF || lF, updated_at: iso(row?.updated_at), servers_fresh: sF, servers_at: iso(sAt), leaderboards_fresh: lF, leaderboards_at: iso(lAt),
    servers: d.servers || {}, leaderboards: lF ? d.leaderboards || {} : {} }, 200, { "cache-control": "public, max-age=30" });
}

/* ---------- Markt ---------- */
const ITEM_RE = /^[a-z0-9_]{1,48}$/;
const cleanItem = (v) => { const id = String(v ?? "").toLowerCase().replace(/^minecraft:/, ""); return ITEM_RE.test(id) ? id : null; };
const price = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n * 1e4) / 1e4 : null; };
const MARKET_MAX = 2000, HIST_MAX = 60000, HIST_CHUNK = 4000, HIST_DAYS = 90;
function cleanMarket(a) {
  if (!Array.isArray(a)) return null;
  const seen = new Set(), out = [];
  for (const x of a.slice(0, MARKET_MAX)) {
    const item = cleanItem(x?.item); if (!item || seen.has(item)) continue;
    const buy = price(x.buy_price), sell = price(x.sell_price); if (buy === null && sell === null) continue;
    const ch = Number(x.change_24h_pct), up = Number(x.updated_at);
    seen.add(item);
    out.push({ item, buy_price: buy ?? sell, sell_price: sell ?? buy, base_price: price(x.base_price) ?? buy ?? sell, volume_24h_qty: price(x.volume_24h_qty) ?? 0, volume_24h_cp: price(x.volume_24h_cp) ?? 0,
      trades_24h: Math.floor(price(x.trades_24h) ?? 0), change_24h_pct: Number.isFinite(ch) ? Math.max(-1e4, Math.min(1e4, Math.round(ch * 100) / 100)) : 0,
      updated_at: Number.isFinite(up) && up > 0 ? Math.floor(up > 1e11 ? up / 1000 : up) : Math.floor(Date.now() / 1000) });
  }
  return out;
}
function cleanHistory(a) {
  if (!Array.isArray(a)) return null;
  const now = Math.floor(Date.now() / 1000), min = now - HIST_DAYS * 86400, m = new Map();
  for (const x of a.slice(0, HIST_MAX)) {
    const item = cleanItem(x?.item); let ts = Number(x?.hour_ts); if (!item || !Number.isFinite(ts)) continue;
    if (ts > 1e11) ts = ts / 1000; ts = Math.floor(ts / 3600) * 3600; if (ts < min || ts > now + 3600) continue;
    const avg = price(x.avg_price); if (avg === null) continue;
    m.set(item + "|" + ts, { item, hour_ts: ts, avg_price: avg, min_price: price(x.min_price) ?? avg, max_price: price(x.max_price) ?? avg, volume_qty: price(x.volume_qty) ?? 0 });
  }
  return [...m.values()];
}
function marketStatements(env, market, hist) {
  const st = [];
  if (market) {
    // Nur geänderte Zeilen schreiben (Push jede Minute): Upsert mit WHERE, danach verschwundene Items löschen
    for (let i = 0; i < market.length; i += HIST_CHUNK) st.push(env.DB.prepare(`INSERT INTO mc_market (item, buy_price, sell_price, base_price, volume_24h_qty, volume_24h_cp, trades_24h, change_24h_pct, updated_at)
      SELECT json_extract(value,'$.item'), json_extract(value,'$.buy_price'), json_extract(value,'$.sell_price'), json_extract(value,'$.base_price'), json_extract(value,'$.volume_24h_qty'), json_extract(value,'$.volume_24h_cp'), json_extract(value,'$.trades_24h'), json_extract(value,'$.change_24h_pct'), json_extract(value,'$.updated_at') FROM json_each(?) WHERE 1
      ON CONFLICT(item) DO UPDATE SET buy_price=excluded.buy_price, sell_price=excluded.sell_price, base_price=excluded.base_price, volume_24h_qty=excluded.volume_24h_qty, volume_24h_cp=excluded.volume_24h_cp, trades_24h=excluded.trades_24h, change_24h_pct=excluded.change_24h_pct, updated_at=excluded.updated_at
      WHERE buy_price IS NOT excluded.buy_price OR sell_price IS NOT excluded.sell_price OR base_price IS NOT excluded.base_price OR volume_24h_qty IS NOT excluded.volume_24h_qty OR volume_24h_cp IS NOT excluded.volume_24h_cp OR trades_24h IS NOT excluded.trades_24h OR change_24h_pct IS NOT excluded.change_24h_pct`).bind(JSON.stringify(market.slice(i, i + HIST_CHUNK))));
    st.push(env.DB.prepare("DELETE FROM mc_market WHERE item NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(market.map((m) => m.item))));
  }
  if (hist && hist.length) {
    for (let i = 0; i < hist.length; i += HIST_CHUNK) st.push(env.DB.prepare(`INSERT INTO mc_market_history (item, hour_ts, avg_price, min_price, max_price, volume_qty)
      SELECT json_extract(value,'$.item'), json_extract(value,'$.hour_ts'), json_extract(value,'$.avg_price'), json_extract(value,'$.min_price'), json_extract(value,'$.max_price'), json_extract(value,'$.volume_qty') FROM json_each(?) WHERE 1
      ON CONFLICT(item, hour_ts) DO UPDATE SET avg_price=excluded.avg_price, min_price=excluded.min_price, max_price=excluded.max_price, volume_qty=excluded.volume_qty WHERE avg_price IS NOT excluded.avg_price OR min_price IS NOT excluded.min_price OR max_price IS NOT excluded.max_price OR volume_qty IS NOT excluded.volume_qty`).bind(JSON.stringify(hist.slice(i, i + HIST_CHUNK))));
    st.push(env.DB.prepare("DELETE FROM mc_market_history WHERE hour_ts < ?").bind(Math.floor(Date.now() / 1000) - HIST_DAYS * 86400));
  }
  return st;
}
async function mcMarket(env) {
  const { results: items } = await env.DB.prepare("SELECT * FROM mc_market").all().catch(() => ({ results: [] }));
  const spark = {};
  if (items.length) {
    const by = [...items].sort((a, b) => b.change_24h_pct - a.change_24h_pct);
    const pick = new Set([...by.slice(0, 5), ...by.slice(-5), ...[...items].sort((a, b) => Math.abs(b.change_24h_pct) - Math.abs(a.change_24h_pct)).slice(0, 4)].map((x) => x.item));
    const ids = [...pick], since = Math.floor(Date.now() / 1000) - 7 * 86400;
    const { results } = await env.DB.prepare(`SELECT item, avg_price FROM mc_market_history WHERE item IN (${ids.map(() => "?").join(",")}) AND hour_ts >= ? ORDER BY hour_ts`).bind(...ids, since).all().catch(() => ({ results: [] }));
    for (const r of results) (spark[r.item] ||= []).push(r.avg_price);
  }
  const at = items.reduce((m, x) => Math.max(m, x.updated_at || 0), 0);
  return json({ updated_at: at ? new Date(at * 1000).toISOString() : null, items, spark }, 200, { "cache-control": "public, max-age=60" });
}
async function mcMarketItem(env, raw) {
  const id = cleanItem(raw); if (!id) return json({ error: "invalid item" }, 400);
  const item = await env.DB.prepare("SELECT * FROM mc_market WHERE item = ?").bind(id).first().catch(() => null);
  const { results } = await env.DB.prepare("SELECT hour_ts, avg_price, min_price, max_price, volume_qty FROM mc_market_history WHERE item = ? AND hour_ts >= ? ORDER BY hour_ts").bind(id, Math.floor(Date.now() / 1000) - HIST_DAYS * 86400).all().catch(() => ({ results: [] }));
  return json({ item: item || null, history: results.map((r) => [r.hour_ts, r.avg_price, r.min_price, r.max_price, r.volume_qty]) }, 200, { "cache-control": "public, max-age=60" });
}

/* ---------- Helfer ---------- */
const SEC_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "SAMEORIGIN", "permissions-policy": "camera=(), microphone=(), geolocation=()" };
const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const html = (h, s = 200) => new Response(h.replaceAll("{{Y}}", String(new Date().getUTCFullYear())), { status: s, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", ...SEC_HEADERS } });
const notFound = (mc) => html(mc
  ? shell({ title: "404 · NwebNotFound MC", desc: "", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", loginBase: `https://${MAIN}`, body: `<section class="hero center"><div class="wrap"><h1 class="h-xl">404</h1><p class="lead">Diesen Chunk gibt es nicht.</p><p style="margin-top:2rem"><a class="btn" href="/">Zur Startseite</a></p></div></section>` })
  : portfolio({ title: "404 · NwebNotFound", desc: "", nav: pNav(""), body: `<section class="hero center"><div class="wrap"><h1 class="h-xl">404</h1><p class="lead">Not Found. Passend zum Namen.</p><p style="margin-top:2rem"><a class="btn" href="/">Zur Startseite</a></p></div></section>` }), 404);

async function guestbookApi(req, env) {
  if (req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT name, message, created_at, discord_id, avatar FROM entries ORDER BY id DESC LIMIT 50").all();
    return json({ entries: results.map(r => ({ name: r.name, message: r.message, created_at: r.created_at, avatar: r.discord_id ? avatarUrl(r.discord_id, r.avatar) : null })) });
  }
  if (req.method === "POST") {
    if (!authReady(env)) return json({ error: "Discord-Login ist bald verfügbar" }, 503);
    const user = await getUser(req, env); if (!user) return json({ error: "Bitte zuerst mit Discord anmelden" }, 401);
    let b; try { b = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
    const message = String(b.message || "").trim();
    if (!message || message.length > 500) return json({ error: "Nachricht 1–500 Zeichen" }, 400);
    const fd = new FormData(); fd.append("secret", env.TURNSTILE_SECRET); fd.append("response", String(b.token || "")); fd.append("remoteip", req.headers.get("CF-Connecting-IP") || "");
    const v = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd })).json();
    if (!v.success) return json({ error: "Captcha fehlgeschlagen" }, 403);
    const row = await env.DB.prepare("SELECT avatar FROM sessions WHERE id = ?").bind(user.sid).first();
    await env.DB.prepare("INSERT INTO entries (name, message, discord_id, avatar) VALUES (?, ?, ?, ?)").bind(user.name.slice(0, 50), message, user.id, row?.avatar || null).run();
    return json({ ok: true }, 201);
  }
  return json({ error: "Method not allowed" }, 405);
}

async function me(req, env) {
  const origin = req.headers.get("origin");
  const cors = origin === `https://${MCD}` || origin === `https://${MAIN}` ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "origin" } : {};
  const u = await getUser(req, env).catch(() => null);
  return json({ available: authReady(env), user: u ? { id: u.id, name: u.name, username: u.username, avatar: u.avatar } : null }, 200, cors);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname === `www.${MAIN}`) { url.hostname = MAIN; return Response.redirect(url.toString(), 301); }
    const p = url.pathname.replace(/\/$/, "") || "/";
    const isMc = url.hostname === MCD;

    if (p.startsWith("/api/mc-")) { const r = TRADE().route(p, req, env, url); if (r) return r; }
    if (p === "/api/mc-status") return mcStatus(ctx);
    if (p === "/api/me") return me(req, env);
    if (p === "/api/mc-ingest") return mcIngest(req, env);
    if (p === "/api/mc-data") return mcData(env);
    if (p === "/api/profile") return profileApi(req, env);
    if (p === "/api/mc-leaderboards") return mcLeaderboards(env);
    if (p === "/api/mc-market") return mcMarket(env);
    if (p.startsWith("/api/mc-market/")) return mcMarketItem(env, decodeURIComponent(p.slice(15)));
    if (p.startsWith("/mc-icon/")) { const r = resolveIcon(decodeURIComponent(p.slice(9)).replace(/\.png$/, "")); return r ? new Response(null, { status: 302, headers: { location: TEX_BASE + r + ".png", "cache-control": "public, max-age=604800" } }) : new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=86400" } }); }
    if (p.startsWith("/auth/")) {
      if (isMc) { url.hostname = MAIN; return redirect(url.toString()); }
      const r = await auth(p, req, env, url); if (r) return r;
    }
    if (isMc) {
      if (p === "/") return html(MC_HOME);
      if (p === "/profile") return html(PROFILE_MC());
      if (p === "/leaderboards") return html(LEADERBOARDS_MC());
      if (p === "/markt" && url.searchParams.has("item")) {
        const raw = String(url.searchParams.get("item") || "").trim(), it = cleanItem(raw);
        const known = it ? await env.DB.prepare("SELECT 1 FROM mc_market WHERE item = ?").bind(it).first().catch(() => null) : null;
        return redirect(known ? `/markt/${encodeURIComponent(it)}` : `/markt?q=${encodeURIComponent(raw.replace(/^minecraft:/i, "").replace(/_/g, " ").slice(0, 48))}`);
      }
      if (p === "/shops") return html(mcPage("Shops · NwebNotFound MC", "Spielershops: Angebote, Preise, Lager und Orte", shopsBody()));
      if (p.startsWith("/shops/")) { const id = decodeURIComponent(p.slice(7)); if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) return notFound(true); return html(mcPage("Shop · NwebNotFound MC", "Spielershop", shopBody(id))); }
      if (p === "/auktionen") return html(mcPage("Auktionen · NwebNotFound MC", "Live-Auktionen vom Server", auctionsBody()));
      if (p.startsWith("/auktionen/")) { const id = decodeURIComponent(p.slice(11)); if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) return notFound(true); return html(mcPage("Auktion · NwebNotFound MC", "Auktion mit Gebotsverlauf", auctionBody(id))); }
      if (p === "/markt") return html(mcPage("Markt · NwebNotFound MC", "Preise, Gewinner und Verlierer im Server-Shop", marketBody()));
      if (p.startsWith("/markt/")) { const it = cleanItem(decodeURIComponent(p.slice(7))); if (!it) return notFound(true); return html(mcPage(it.replace(/_/g, " ") + " · Markt · NwebNotFound MC", "Preisverlauf im Server-Shop", marketItemBody(it))); }
      if (p === "/wiki") return html(mcPage("Wiki · NwebNotFound MC", "Anleitungen, Regeln und FAQ zum Minecraft-Server", wikiIndexBody(MC_HOST)));
      if (p.startsWith("/wiki/")) { const a = WIKI.find((x) => x.slug === p.slice(6)); if (!a) return notFound(true); return html(mcPage(a.title + " · Wiki · NwebNotFound MC", a.sum, wikiArticleBody(a, MC_HOST))); }
      return notFound(true);
    }
    if (p === "/api/guestbook") return guestbookApi(req, env);
    if (p === "/") return html(HOME);
    if (p === "/guestbook") return html(GUEST);
    if (p === "/profile") return html(PROFILE_MAIN());
    if (p === "/minecraft" || p.startsWith("/minecraft/")) return Response.redirect(`https://${MCD}/`, 301);
    return notFound(false);
  },
};
