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
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border:0;border-radius:980px;padding:.62rem 1.25rem;font:inherit;font-size:.95rem;font-weight:500;cursor:pointer;background:var(--acc);color:var(--accfg);transition:transform .2s ease,opacity .2s ease,background .2s}
.btn:hover{text-decoration:none;transform:translateY(-1px)}.btn:active{transform:scale(.98)}
.btn.sec{background:transparent;color:var(--link);box-shadow:inset 0 0 0 1px currentColor}
.btn.sm{padding:.38rem .85rem;font-size:.8rem}
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
@media (max-width:640px){.nav .wrap{gap:.9rem}.nav a.l{font-size:.8rem}.hide-s{display:none}}
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

const MC_CSS = `:root{--bg:#0b0f0c;--fg:#eef5ef;--mut:#93a39a;--link:#7ee787;--acc:#4ade80;--acc2:#4ade80;--accfg:#052e12;--card:rgba(255,255,255,.04);--line:rgba(255,255,255,.09);--navbg:rgba(11,15,12,.72);--field:rgba(255,255,255,.05);--ring:rgba(74,222,128,.25);--shadow:rgba(0,0,0,.9);color-scheme:dark}
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
.stat .k{font-size:.8rem;color:var(--mut)}.stat .v{font-size:1.6rem;font-weight:700;margin-top:.2rem}
.bar{height:6px;background:var(--line);border-radius:3px;margin-top:.6rem;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--acc);transition:width .8s cubic-bezier(.2,.8,.2,1)}
.addr{display:inline-flex;align-items:center;gap:.6rem;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.5rem .5rem .5rem 1rem;margin-top:2rem;max-width:100%}
.addr code{font-size:1rem;overflow:hidden;text-overflow:ellipsis}
.steps{counter-reset:s;list-style:none;padding:0;margin:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.steps li{counter-increment:s;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:1.6rem}
.steps li::before{content:counter(s);display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--acc);color:var(--accfg);font-weight:700;margin-bottom:1rem}
.soon{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--acc);border:1px solid var(--ring);border-radius:6px;padding:.15rem .45rem;display:inline-block;margin-bottom:.8rem}`;

const REVEAL_JS = `<script>(()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){els.forEach(e=>e.classList.add('in'));return}const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -40px 0px'});els.forEach(e=>io.observe(e))})();</script>`;

// Account-Chip: lädt /api/me clientseitig (Seiten bleiben cachebar)
const ACCT_JS = (loginBase) => `<script>(async()=>{const el=document.getElementById('acct');if(!el)return;try{const d=await(await fetch('/api/me',{credentials:'include'})).json();const nx=encodeURIComponent(location.href);
if(d.user){el.innerHTML='<img alt="" src="'+d.user.avatar+'"><span class="hide-s">'+d.user.name.replace(/[<>&"]/g,'')+'</span><a class="btn sec sm" href="${loginBase}/auth/discord/logout?next='+nx+'">Abmelden</a>';}
else if(d.available){el.innerHTML='<a class="btn discord sm" href="${loginBase}/auth/discord/login?next='+nx+'">Mit Discord anmelden</a>';}
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
const mNav = `<a class="brand" href="/"><span class="px" style="color:var(--acc)">■</span> NwebNotFound MC</a><a class="l hide-s" href="#join">Beitreten</a><a class="l" href="https://${MAIN}/">nwebnotfound.dev</a>`;
const mFoot = `<span>© {{Y}} Nils Weberruß · Kein offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden.</span><span><a href="https://${MAIN}/">Hauptseite</a></span>`;

const MC = shell({ title: "Minecraft-Server · NwebNotFound", desc: "Status und Infos zum Minecraft-Server mc.nwebnotfound.dev", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", loginBase: `https://${MAIN}`, body: `
<section class="hero center"><div class="pixbg"></div><div class="wrap">
${BLOCK_SVG}
<p class="eyebrow reveal">Java Edition · Vanilla+</p>
<h1 class="h-xl reveal d1">Unser Server.<br><span style="color:var(--acc)">Eure Welt.</span></h1>
<p class="lead reveal d2">Survival unter Freunden, mit Voice Chat, eigener Economy und Discord-Anbindung.</p>
<div class="reveal d3"><div class="addr"><code class="px">${MC_HOST}</code><button class="btn sm" id="cp">Kopieren</button></div></div>
</div></section>
<section style="padding-top:0"><div class="wrap">
<div class="card reveal" style="text-align:center">
<p class="status"><span id="dot" class="dot"></span><span id="state">Prüfe Status…</span></p>
<p id="motd" class="mut" style="margin:.6rem 0 0;min-height:1.5em"></p>
<div class="stats" style="text-align:left">
<div class="card stat"><div class="k">Spieler</div><div class="v px" id="pl">–</div><div class="bar"><i id="bar"></i></div></div>
<div class="card stat"><div class="k">Version</div><div class="v px" id="ver">–</div></div>
<div class="card stat"><div class="k">Zuletzt geprüft</div><div class="v px" id="ts">–</div></div>
</div><p id="names" class="mut" style="margin:1.2rem 0 0;font-size:.9rem"></p></div>
</div></section>
<section style="padding-top:0" id="srv-sec" hidden><div class="wrap">
<h2 class="h-l center reveal in" style="margin-bottom:2.4rem">Server.</h2>
<div class="grid" id="srv"></div></div></section>
<section style="padding-top:0" id="lb-sec" hidden><div class="wrap">
<h2 class="h-l center" style="margin-bottom:.6rem">Bestenlisten.</h2><p class="lead center" style="margin-bottom:2.4rem">Wer vorne liegt.</p>
<div class="grid" id="lb"></div></div></section>
<section id="join"><div class="wrap">
<h2 class="h-l center reveal">So kommst du drauf.</h2><p class="lead center reveal d1" style="margin-bottom:2.4rem">In drei Schritten im Spiel.</p>
<ol class="steps"><li class="reveal"><h3>Starten</h3><p class="mut">Minecraft <b>Java Edition</b> öffnen und auf <b>Mehrspieler</b> klicken.</p></li>
<li class="reveal d1"><h3>Hinzufügen</h3><p class="mut"><b>Server hinzufügen</b> und <code class="px">${MC_HOST}</code> als Adresse einfügen.</p></li>
<li class="reveal d2"><h3>Freischalten</h3><p class="mut">Noch nicht auf der Whitelist? Im Discord mit <code class="px">/link</code> freischalten, dann beitreten.</p></li></ol>
</div></section>
<section style="padding-top:0"><div class="wrap">
<h2 class="h-l center reveal" style="margin-bottom:2.4rem">Demnächst.</h2>
<div class="grid">
<div class="card reveal"><span class="soon">Bald</span><h3>Börse</h3><p>Preisverläufe der Shop-Items, Top-Gewinner und -Verlierer und eine Item-Suche.</p></div>
<div class="card reveal d1"><span class="soon">Bald</span><h3>Spielerprofile</h3><p>Deine Stats und dein Kontostand, mit Discord-Login.</p></div>
<div class="card reveal d2"><span class="soon">Bald</span><h3>Weltkarte</h3><p>Die Live-Karte der Welt, nur für angemeldete Mitglieder.</p></div>
</div></div></section>
<script>
const $=id=>document.getElementById(id);
$('cp').onclick=()=>{navigator.clipboard.writeText('${MC_HOST}');const b=$('cp');b.textContent='Kopiert ✓';setTimeout(()=>b.textContent='Kopieren',1500);};
function set(on,txt){$('dot').className='dot '+(on?'on':'off');$('state').textContent=txt;}
async function load(){try{const d=await(await fetch('/api/mc-status')).json();
if(!d.online){set(false,d.error?'Status nicht abrufbar':'Offline');$('motd').textContent=d.error?'Bitte später nochmal versuchen.':'Der Server ist gerade nicht erreichbar.';$('pl').textContent='–';$('ver').textContent='–';$('bar').style.width='0';$('names').textContent='';}
else{set(true,'Online');$('motd').textContent=d.motd||'';const o=d.players.online??0,m=d.players.max??0;$('pl').textContent=o+' / '+m;$('bar').style.width=(m?Math.min(100,o/m*100):0)+'%';$('ver').textContent=/velocity|bungee|waterfall/i.test(d.version||'')?'Java Edition':(d.version||'?');$('names').textContent=d.players.list&&d.players.list.length?'Online: '+d.players.list.join(', '):'';}
}catch(_){set(false,'Status nicht abrufbar');}
$('ts').textContent=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const up=t=>{if(t==null)return null;const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return d?d+' T '+h+' Std':h?h+' Std '+m+' Min':m+' Min'};
const NAMES={lobby:'Lobby',survival:'Survival'},MODES={lobby:'Treffpunkt & Spawn',survival:'Survival · Vanilla+'};
const LB={money:['Reichste Spieler',v=>v.toLocaleString('de-DE')+' CP'],playtime:['Meiste Spielzeit',v=>up(v)||'0 Min'],kills:['Meiste Kills',v=>v.toLocaleString('de-DE')],deaths:['Meiste Tode',v=>v.toLocaleString('de-DE')],blocks_mined:['Abgebaute Blöcke',v=>v.toLocaleString('de-DE')]};
async function data(){try{const d=await(await fetch('/api/mc-data')).json();if(!d.fresh){$('srv-sec').hidden=true;$('lb-sec').hidden=true;return}
const S=Object.entries(d.servers||{});$('srv-sec').hidden=!S.length;
$('srv').innerHTML=S.map(([k,v])=>{const n=v.players.length;return '<div class="card"><p class="status" style="justify-content:flex-start;font-size:1.3rem"><span class="dot '+(v.online?'on':'off')+'"></span>'+E(NAMES[k]||k)+'</p><p class="mut" style="margin:.3rem 0 1rem">'+E(v.mode||MODES[k]||'')+(v.version?' · '+E(v.version):'')+'</p><div class="stats" style="margin-top:0;grid-template-columns:1fr 1fr"><div class="stat"><div class="k">Spieler</div><div class="v px">'+(v.online?n+(v.max?' / '+v.max:''):'–')+'</div></div><div class="stat"><div class="k">Uptime</div><div class="v px" style="font-size:1.1rem;margin-top:.5rem">'+(v.online&&v.uptime_seconds!=null?E(up(v.uptime_seconds)):'–')+'</div></div></div>'+(n?'<p class="mut" style="margin:1rem 0 0;font-size:.9rem">'+v.players.map(E).join(', ')+'</p>':'')+'</div>'}).join('');
const L=Object.entries(d.leaderboards||{}).filter(([,v])=>v.length);$('lb-sec').hidden=!L.length;
$('lb').innerHTML=L.map(([k,v])=>{const [t,f]=LB[k]||[k,x=>x.toLocaleString('de-DE')];return '<div class="card"><h3 style="margin-bottom:1rem">'+E(t)+'</h3><ol style="list-style:none;padding:0;margin:0">'+v.map((x,i)=>'<li style="display:flex;align-items:center;gap:.7rem;padding:.5rem 0;border-top:'+(i?'1px solid var(--line)':'0')+'"><span class="px" style="width:1.6rem;color:'+(i<3?'var(--acc)':'var(--mut)')+'">'+(i+1)+'</span><img alt="" width="24" height="24" style="border-radius:4px;image-rendering:pixelated" src="https://mc-heads.net/avatar/'+encodeURIComponent(x.name)+'/24"><span style="flex:1">'+E(x.name)+'</span><b class="px" style="font-size:.9rem">'+E(f(x.value))+'</b></li>').join('')+'</ol></div>'}).join('');
}catch(_){}}
load();data();setInterval(()=>{load();data()},60000);
</script>` });

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
      max: Number.isFinite(+v.max) ? +v.max : null, version: v.version ? clip(v.version, 40) : null, mode: v.mode ? clip(v.mode, 40) : null, uptime_seconds: Number.isFinite(+v.uptime_seconds) ? Math.max(0, Math.floor(+v.uptime_seconds)) : null, tps: Number.isFinite(+v.tps) ? Math.round(+v.tps * 10) / 10 : null };
  }
  const leaderboards = {};
  for (const [k, v] of Object.entries(b?.leaderboards || {}).slice(0, 12)) {
    if (!/^[a-z0-9_-]{1,24}$/i.test(k) || !Array.isArray(v)) continue;
    leaderboards[k] = v.slice(0, 10).map(x => ({ name: clip(x?.name, 16), value: Number(x?.value) || 0 })).filter(x => x.name);
  }
  return { servers, leaderboards };
}
async function mcIngest(req, env) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const tok = req.headers.get("x-ingest-token") || "";
  if (!env.MC_INGEST_TOKEN || !safeEq(tok, env.MC_INGEST_TOKEN)) return json({ error: "unauthorized" }, 401);
  const raw = await req.text(); if (raw.length > 65536) return json({ error: "too large" }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: "invalid json" }, 400); }
  const data = cleanIngest(b);
  await env.DB.prepare("INSERT INTO mc_snapshot (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(JSON.stringify(data), Date.now()).run();
  return json({ ok: true, servers: Object.keys(data.servers).length, leaderboards: Object.keys(data.leaderboards).length });
}
async function mcData(env) {
  const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null);
  if (!row || Date.now() - row.updated_at > FRESH_MS) return json({ fresh: false, updated_at: row ? new Date(row.updated_at).toISOString() : null }, 200, { "cache-control": "public, max-age=30" });
  return json({ fresh: true, updated_at: new Date(row.updated_at).toISOString(), ...JSON.parse(row.data) }, 200, { "cache-control": "public, max-age=30" });
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

    if (p === "/api/mc-status") return mcStatus(ctx);
    if (p === "/api/me") return me(req, env);
    if (p === "/api/mc-ingest") return mcIngest(req, env);
    if (p === "/api/mc-data") return mcData(env);
    if (p.startsWith("/auth/")) {
      if (isMc) { url.hostname = MAIN; return redirect(url.toString()); }
      const r = await auth(p, req, env, url); if (r) return r;
    }
    if (isMc) {
      if (p === "/") return html(MC);
      return notFound(true);
    }
    if (p === "/api/guestbook") return guestbookApi(req, env);
    if (p === "/") return html(HOME);
    if (p === "/guestbook") return html(GUEST);
    if (p === "/minecraft" || p.startsWith("/minecraft/")) return Response.redirect(`https://${MCD}/`, 301);
    return notFound(false);
  },
};
