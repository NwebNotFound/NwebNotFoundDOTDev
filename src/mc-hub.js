import { AV } from "./asset-version.js";
// MC-Hub: gemeinsames Design-System, Startseite, Markt, Wiki (mc.nwebnotfound.dev)
export const HUB_CSS = String.raw`
.seg{display:inline-flex;padding:.25rem;border-radius:12px;background:rgba(255,255,255,.06)}.seg button{border:0;background:transparent;color:var(--mut);font:inherit;font-size:.82rem;padding:.4rem .9rem;border-radius:9px;cursor:pointer;transition:background .2s,color .2s}
.acct .btn{white-space:nowrap}
.tabs button,.seg button{min-height:44px}*,*::before,*::after{box-sizing:border-box}#hs{grid-template-columns:minmax(0,1fr)!important}#hs>*{min-width:0;width:100%}#hs .addr{display:flex;width:100%;justify-content:space-between}#hs .addr code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stats{gap:.8rem!important}.stats>*,.kv2>*,.kv3>*,.shg>*,.lrow>*,.wgrid>*,.grid>*,[style*="display:grid"]>*,[style*="display:flex"]>*{min-width:0}.stats .card{width:100%;padding:1rem 1.1rem}@media(max-width:600px){.g.pad,.card.pad{padding:1rem}#hs{gap:.8rem!important}#hs>div:first-child{gap:.8rem!important}#hs .addr code{font-size:.78rem}}.nl{display:flex;align-items:center;gap:1.2rem}.nl .l{display:inline-flex;align-items:center;min-height:44px;white-space:nowrap}
@media(max-width:900px){.nav .wrap{flex-wrap:wrap;height:auto;min-height:52px;row-gap:0;column-gap:.8rem;padding-top:4px}.nl{order:3;flex:1 0 100%;overflow-x:auto;scrollbar-width:none;gap:.2rem;margin:0 -.4rem;padding:0 .4rem;-webkit-mask:linear-gradient(90deg,#000 90%,transparent)}.nl::-webkit-scrollbar{display:none}.nl .l{padding:0 .55rem;border-radius:10px;font-size:.88rem}.nl .l[aria-current=page]{background:rgba(74,222,128,.12)}.nav .hide-s{display:inline-flex}}
.seg button{min-height:44px}@media(pointer:coarse){.seg button{min-height:44px}}
.wgrid>*{min-width:0}
.addr .btn{flex:none}
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.28s}
main{animation:hubin .45s cubic-bezier(.2,.8,.2,1) both}@keyframes hubin{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){main{animation:none}}
.nav .l[aria-current=page]{color:var(--fg);font-weight:600}.nl a.l:hover{text-decoration:none;color:var(--fg)}
.nav .l{transition:color .2s}
/* Layout-Helfer (Panels: ds.css) */
.hub-wrap{max-width:1120px;margin:0 auto;padding:0 clamp(1rem,4vw,2rem)}
.hub-h{font-size:clamp(2.2rem,6.5vw,4.4rem);line-height:1.04;letter-spacing:-.035em;font-weight:700;margin:.2rem 0 .8rem}
.hub-h2{font-size:clamp(1.5rem,3.4vw,2.2rem);letter-spacing:-.025em;font-weight:700;margin:0 0 1rem}
.eyb{font-size:.78rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--acc)}
.sub{color:var(--mut);font-size:clamp(1rem,2vw,1.2rem);max-width:40rem}
.sec{padding:clamp(2rem,5vw,3.5rem) 0}
.pill{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .8rem;border-radius:99px;background:rgba(255,255,255,.06);border:1px solid var(--line);font-size:.85rem}
.qgrid{display:grid;gap:.9rem;grid-template-columns:repeat(2,1fr)}@media(min-width:900px){.qgrid{grid-template-columns:repeat(3,1fr)}}@media(min-width:1100px){.qgrid.q6{grid-template-columns:repeat(6,1fr)}}
.q{padding:1.2rem;min-height:128px;display:flex!important;flex-direction:column;justify-content:space-between}
.mi{image-rendering:pixelated;image-rendering:crisp-edges;display:inline-block;flex:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}.wside a{display:flex!important;align-items:center;gap:.5rem;min-height:40px}
.bigpct small{font-size:.75rem;font-weight:500;opacity:.75}.bigpct.bu{background:rgba(74,222,128,.14);color:#4ade80}.bigpct.bd{background:rgba(248,113,113,.14);color:#f87171}.bigpct.bf{background:rgba(255,255,255,.06);color:var(--mut)}.bigpct span{color:inherit}
.tnum{font-variant-numeric:tabular-nums}
.todo{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.06em;color:#fbbf24;border:1px dashed rgba(251,191,36,.5);border-radius:6px;padding:.05rem .4rem;margin:0 .2rem}
.empty-st{text-align:center;padding:3rem 1rem}.empty-st .big{font-size:2.6rem;margin-bottom:.6rem}
.inp{width:100%;font:inherit;font-size:1rem;color:var(--fg);background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:14px;padding:.85rem 1rem .85rem 2.6rem;outline:none;transition:border-color .2s,box-shadow .2s}
.srch{position:relative}.srch svg{position:absolute;left:.9rem;top:50%;transform:translateY(-50%);opacity:.55}
.ac a{display:flex;align-items:center;gap:.7rem;padding:.55rem .7rem;border-radius:10px;color:var(--fg);text-decoration:none}
.ac small{margin-left:auto;color:var(--mut)}
.ic{display:inline-grid;place-items:center;width:28px;height:28px;flex:none;border-radius:7px;background:rgba(255,255,255,.06);font-size:.62rem;font-weight:700;color:var(--mut);overflow:hidden}.ic img{width:22px;height:22px;image-rendering:pixelated}

.shg{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));margin-bottom:1rem}
.shc,.auc{padding:1.1rem}.shh,.auh{display:flex;align-items:center;gap:.8rem}.shh b,.auh b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.shh small,.auh small{display:block;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slots{display:flex;flex-wrap:wrap;gap:4px;margin-top:.9rem}.slot{position:relative;display:inline-grid;place-items:center;width:40px;height:40px;background:#2a2a2a;box-shadow:var(--slot);flex:none}.slot .ic{box-shadow:none!important;background:none!important}
.slot.big{width:56px;height:56px}.slot.big .ic img{width:36px;height:36px}.slot.huge{width:80px;height:80px}.slot.huge .ic{width:56px;height:56px}.slot.huge .ic img{width:48px;height:48px}
.slot i{position:absolute;right:3px;bottom:1px;font-style:normal;font-family:var(--pf);font-size:.8rem;color:#fff;text-shadow:2px 2px 0 #3f3f3f}
.nbt{margin:.7rem 0 0;font-size:.82rem;color:#c9a8ff;font-family:var(--pf);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.aum{display:flex;justify-content:space-between;gap:1rem;margin-top:.9rem;padding-top:.8rem;border-top:2px solid #000;box-shadow:0 -2px 0 #333 inset}.aum small,.aum b{display:block}.aum b{font-family:var(--pf);font-size:1.05rem}
.gold{color:var(--gold)}
.lrow{display:grid;grid-template-columns:auto 1fr auto auto auto;align-items:center;gap:.8rem;padding:.65rem .2rem;border-top:2px solid #161616;color:inherit;min-height:52px}.lrow:hover{text-decoration:none}a.lrow:hover{background:#262626}.lrow b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lrow small{display:block;font-size:.8rem}
@media(max-width:600px){.lrow{grid-template-columns:auto 1fr auto;row-gap:.3rem}.lrow>:nth-child(n+4){grid-column:2/-1;justify-self:start}.hm{display:none}}
.tag{font-family:var(--pf);font-size:.72rem;padding:.15rem .45rem;box-shadow:var(--slot);background:#2a2a2a;white-space:nowrap}.tag.ts{color:#55ff55}.tag.tb{color:#55ffff}.tag.tw{color:#ffff55}.tag.tr{color:#ff5555}
.buy{display:flex;gap:.4rem;align-items:center}.buy input,.bidf input{width:5.5rem;min-height:44px;padding:0 .6rem;background:#000;border:2px solid #a0a0a0;color:#fff;font:inherit;font-family:var(--pf)}.bidf input{width:11rem;font-size:1.1rem}
.aud{display:grid;gap:1rem}@media(min-width:900px){.aud{grid-template-columns:1.2fr 1fr}}
.kv2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.kv2 small,.kv2 b{display:block}.kv2 .big{font-family:var(--pf);font-size:clamp(1.4rem,4.5vw,2rem);margin:.2rem 0}
.kv3{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-top:1rem}.kv3 span{background:#2a2a2a;box-shadow:var(--slot);padding:.6rem}.kv3 small,.kv3 b{display:block}.kv3 small{font-size:.72rem}
.mctip{display:inline-block;max-width:100%;background:rgba(16,0,16,.95);border:2px solid #100010;box-shadow:inset 0 0 0 2px #3a0f8f;padding:.6rem .8rem;font-family:var(--pf);font-size:.85rem;color:#c9a8ff}.mctip b{color:#fff}
`;

export const hubNav = (MAIN) => `<a class="brand" href="/"><img class="mi" alt="" width="22" height="22" src="/mc-icon/v2/grass_block"> NwebNotFound MC</a><nav class="nl" aria-label="Bereiche"><a class="l" href="/">Start</a><a class="l" href="/leaderboards">Bestenlisten</a><a class="l" href="/parkour">Parkour</a><a class="l" href="/spieler">Spieler</a><a class="l" href="/markt">Markt</a><a class="l" href="/shops">Shops</a><a class="l" href="/auktionen">Auktionen</a><a class="l" href="/wiki">Wiki</a></nav><script>(()=>{const p=location.pathname.replace(/\\/$/,'')||'/';document.querySelectorAll('.nav .l').forEach(a=>{const h=a.getAttribute('href');if(h===p||(h!=='/'&&p.startsWith(h+'/')))a.setAttribute('aria-current','page')})})()</script>`;

export const MI = (id, px = 26) => `<img class="mi" alt="" width="${px}" height="${px}" loading="lazy" src="/mc-icon/v2/${id}">`;
const SEARCH_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/* ---------- Startseite ---------- */
export const homeBody = (HOST) => `
<section class="hero" style="padding-bottom:1rem"><div class="pixbg"></div><div class="hub-wrap">
<p class="eyb">Java Edition · Vanilla+</p>
<h1 class="hub-h">Dein Server.<br><span style="color:var(--acc)">Alles an einem Ort.</span></h1>
<p class="sub">Status, Profil, Bestenlisten, Markt und Wiki für unseren Survival-Server unter Freunden.</p>
<div class="g pad" style="margin-top:1.8rem;display:grid;gap:1.2rem;grid-template-columns:1fr" id="hs">
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:.8rem 1.4rem;justify-content:space-between">
<p class="status" style="justify-content:flex-start;margin:0"><span id="dot" class="dot"></span><span id="state">Prüfe Status…</span></p>
<div class="addr" style="margin:0"><code class="px">${HOST}</code><button class="btn sm" id="cp">Kopieren</button></div></div>
<div class="stats" style="margin:0"><div class="card stat"><div class="k">Spieler online</div><div class="v px tnum" id="pl">–</div><div class="bar"><i id="bar"></i></div></div>
<div class="card stat"><div class="k">Version</div><div class="v px" id="ver">–</div></div><div class="card stat"><div class="k">Server</div><div class="v px" id="srvn">–</div></div></div>
<p id="names" class="mut" style="margin:0;font-size:.9rem;min-height:1.2em"></p></div>
</div></section>
<section class="sec" style="padding-top:1rem"><div class="hub-wrap"><div class="qgrid q6">
<a class="g q" href="/profile"><div class="qi">${MI("name_tag", 40)}</div><div class="qt"><b>Profil</b><span>Deine Stats & dein 3D-Skin</span></div></a>
<a class="g q" href="/leaderboards"><div class="qi">${MI("diamond", 40)}</div><div class="qt"><b>Bestenlisten</b><span>Woche & Gesamt</span></div></a>
<a class="g q" href="/markt"><div class="qi">${MI("emerald", 40)}</div><div class="qt"><b>Markt</b><span>Preise & Verläufe</span></div></a>
<a class="g q" href="/shops"><div class="qi">${MI("barrel", 40)}</div><div class="qt"><b>Shops</b><span>Spielershops & Angebote</span></div></a>
<a class="g q" href="/auktionen"><div class="qi">${MI("bell", 40)}</div><div class="qt"><b>Auktionen</b><span>Live bieten</span></div></a>
<a class="g q" href="/wiki"><div class="qi">${MI("bookshelf", 40)}</div><div class="qt"><b>Wiki</b><span>Anleitungen & FAQ</span></div></a>
</div></div></section>
<section class="sec" id="srv-sec" hidden><div class="hub-wrap"><h2 class="hub-h2">Welten.</h2><div class="qgrid" id="srv" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))"></div></div></section>
<section class="sec"><div class="hub-wrap" style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))">
<div class="g pad"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="hub-h2" style="font-size:1.35rem">Top-Spieler</h2><a href="/leaderboards">Alle ›</a></div><div id="tops" class="mut">Lade…</div></div>
<div class="g pad"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="hub-h2" style="font-size:1.35rem">Markt heute</h2><a href="/markt">Zum Markt ›</a></div><div id="mk" class="mut">Lade…</div></div>
</div></section>
<section class="sec" id="join"><div class="hub-wrap"><h2 class="hub-h2">So kommst du drauf.</h2>
<ol class="steps"><li><h3>Starten</h3><p class="mut">Minecraft <b>Java Edition</b> öffnen, <b>Mehrspieler</b> wählen.</p></li>
<li><h3>Hinzufügen</h3><p class="mut"><b>Server hinzufügen</b> mit der Adresse <code class="px">${HOST}</code>.</p></li>
<li><h3>Freischalten</h3><p class="mut">Im Discord mit <code class="px">/link</code> verknüpfen und den Code im Spiel bestätigen. <a href="/wiki/erste-schritte">Anleitung ›</a></p></li></ol>
</div></section>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/home.js?v=${AV}" defer></script>`;

/* ---------- Markt ---------- */
export const marketBody = () => `
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap">
<p class="eyb">Server-Börse</p><h1 class="hub-h">Markt.</h1><p class="sub">Live-Preise aus dem Shop, in CP. Wer steigt, wer fällt.</p>
<div class="srch" style="margin-top:1.4rem;max-width:560px">${SEARCH_SVG}<input name="mc-q-find" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-form-type="other" data-lpignore="true" class="inp" id="q" type="search" placeholder="Item suchen, z. B. Diamant" role="combobox" aria-expanded="false" aria-controls="ac" aria-label="Item suchen"><div class="ac" id="ac" role="listbox" hidden></div></div>
</div></section>
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap" id="mroot"><div class="g pad mut">Lade Marktdaten…</div></div></section>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/market.js?v=${AV}" defer></script>`;
// Öffentlicher Turnstile-Sitekey (gleich wie SITEKEY in worker.js)
const TS_SITEKEY = "0x4AAAAAAFplEJyvitu_qwlx";
export const marketItemBody = (item) => `
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap">
<p style="margin:0 0 1rem"><a href="/markt">‹ Markt</a></p><div id="ihd" data-item="${item}"><h1 class="hub-h">…</h1></div></div></section>
<section class="sec" style="padding-top:.6rem"><div class="hub-wrap" id="iroot"><div class="g pad mut">Lade…</div></div></section>
<section class="sec" style="padding-top:0"><div class="hub-wrap"><div class="g pad" id="bbuy" data-item="${item}" data-sitekey="${TS_SITEKEY}" hidden></div></div></section>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/item.js?v=${AV}" defer></script><script src="/mc/bankbuy.js?v=${AV}" defer></script>`;

/* ---------- Wiki ---------- */
const T = (s = "") => `<span class="todo" title="Noch offen">TODO${s ? ": " + s : ""}</span>`;
const WIP = `<span class="wip" title="Wird gerade gebaut, Stand 29.10.2026">im Aufbau</span>`;
// Befehle: [befehl, beschreibung, ort, status]  status: "" = live, "wip" = im Aufbau
export const COMMANDS = [
  ["/link <Minecraft-Name>", "Minecraft-Account mit Discord verknüpfen; Creepy prüft den Namen bei Mojang und deine Rolle und schickt einen Einmal-Code", "Discord", ""],
  ["/setup", "Einsteiger-Anleitung per DM", "Discord", ""],
  ["/status", "Serverstatus und Spieler online", "Discord", ""],
  ["/event", "Server-Events anzeigen", "Discord", ""],
  ["/whitelist · /restart · /backup", "Admin-Befehle (nur Admins)", "Discord", ""],
  ["/spawn", "Nach 10 Sekunden Stillstehen zum Lobby-Spawn; Bewegung oder Schaden bricht ab. Von Survival aus geht's über den Proxy in die Lobby", "Lobby, Survival", ""],
  ["/home", "Zu deinem Home teleportieren", "Survival", ""],
  ["/sethome", "Home setzen; der erste Home-Slot ist gratis, weitere kosten CP", "Survival", ""],
  ["/tpteam", "Zu deinem Team teleportieren (statt Warps)", "Survival", ""],
  ["/menu", "Ein Menü für Bank, Shop, Auktionshaus, Homes und Warps", "alle", "wip"],
  ["/bank", "Items an die Bank verkaufen oder von ihr kaufen", "Lobby", ""],
  ["/market", "Marktpreise im Spiel ansehen", "Lobby", ""],
  ["/shop", "Spielershops: kaufen (auch Teilmengen 1/8/16/32/64/Alles) und Kaufaufträge", "Survival", ""],
  ["/shop sell", "Eigenes Angebot einstellen (Preis pro Stück)", "Survival", ""],
  ["/shop show · /shop remove", "Eigene Angebote ansehen bzw. zurückziehen (Items kommen zurück)", "Survival", ""],
  ["/ah", "Auktionshaus: zwischen Spielern handeln, auch seltene Items", "Survival", ""],
  ["/pay <Spieler> <CP>", "CP an einen anderen Spieler überweisen", "alle", ""],
  ["/trade <Spieler>", "Sicherer Direkthandel per Menü", "Survival", "wip"],
  ["/abholen", "Gekaufte oder zurückgegebene Items aus dem Abholfach holen (passiert auch automatisch beim Join)", "Survival", "wip"],
  ["/challenges", "Tägliche und wöchentliche Aufgaben mit CP-Belohnung", "Survival", ""],
  ["/stats", "Deine Statistiken im Spiel", "Survival", ""],
  ["/bounty <Spieler> <CP> · /bounty list", "Kopfgeld aussetzen bzw. offene Kopfgelder ansehen", "Survival", "wip"],
  ["/season top", "Season-Bestenliste", "Survival", "wip"],
  ["/minerush party invite|accept|leave", "MineRush-Dungeon in Parties von 1 bis 4 Spielern", "Survival", "wip"],
];
const cmdTable = (filter) => `<div class="srch" style="margin:1rem 0"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input name="mc-cq-find" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-form-type="other" data-lpignore="true" class="inp" id="cq" type="search" placeholder="Befehl suchen, z. B. home" aria-label="Befehle filtern"></div>
<div style="overflow-x:auto"><table class="cmd" id="ct"><tr><th data-i="0"><button>Befehl</button></th><th data-i="1"><button>Was es macht</button></th><th data-i="2"><button>Wo</button></th></tr>${COMMANDS.filter(filter || (() => true)).map(([c, d, w, s]) => `<tr><td><code>${c.replace(/</g, "&lt;")}</code>${s ? " " + WIP : ""}</td><td>${d}</td><td class="mut">${w}</td></tr>`).join("")}</table></div><p class="mut" id="cnone" hidden>Kein Befehl gefunden.</p>
<script>(()=>{const q=document.getElementById('cq'),T=document.getElementById('ct'),R=[...T.querySelectorAll('tr')].slice(1),N=s=>s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\//g,' ').replace(/\\s+/g,' ').trim();R.forEach(r=>r._t=N(r.textContent));q.oninput=()=>{const w=N(q.value).split(' ').filter(Boolean);let n=0;R.forEach(r=>{const ok=w.every(p=>r._t.includes(p));r.hidden=!ok;n+=ok});document.getElementById('cnone').hidden=!!n};let si=-1,dir=1;T.querySelectorAll('th').forEach(th=>th.onclick=()=>{const i=+th.dataset.i;dir=si===i?-dir:1;si=i;T.querySelectorAll('th').forEach(h=>h.setAttribute('aria-sort',h===th?(dir>0?'ascending':'descending'):'none'));const b=R[0].parentNode;R.slice().sort((a,c)=>a.cells[i].textContent.localeCompare(c.cells[i].textContent,'de')*dir).forEach(r=>b.appendChild(r))})})()</script>`;

export const WIKI = [
  { slug: "erste-schritte", icon: "oak_sapling", title: "Erste Schritte", sum: "Discord, Verknüpfung, Whitelist und dein erster Join.", body: (H) => `
<p>Der Server ist ein privater <b>Java-Edition</b>-Server für unsere Freundesgruppe (ca. 12–15 Leute), CraftAttack-artig: Vanilla+ mit Voice Chat, eigener Economy und Discord-Anbindung. Reinkommen geht nur über die Whitelist, und die läuft komplett über Discord.</p>
<h2>1. Discord beitreten</h2><p>Du brauchst eine Einladung in unseren Discord ${T("Invite-Link")} und dort die Mitglieder-Rolle. Ohne Rolle kann dich der Bot nicht freischalten.</p>
<h2>2. Account verknüpfen mit Creepy</h2><ol><li>Schreib im Discord <code>/link &lt;dein Minecraft-Name&gt;</code>. Mit <code>/setup</code> bekommst du die Anleitung auch per DM.</li><li>Unser Bot <b>Creepy</b> prüft deinen Namen bei Mojang (UUID) und ob du die Rolle hast.</li><li>Du bekommst per DM einen <b>Einmal-Bestätigungscode</b> mit Hilfe-Button und Fortschrittsanzeige. Den gibst du im Spiel ein ${T("genauer Ingame-Befehl für den Code")}.</li></ol>
<h2>3. Whitelist</h2><p>Nach der Bestätigung setzt Creepy dich automatisch auf die Whitelist <b>aller</b> Server (Lobby, Survival). Verlässt du den Discord oder verlierst die Rolle, wirst du automatisch wieder entfernt.</p>
<h2>4. Verbinden</h2><ol><li>Minecraft <b>Java Edition</b> starten. Der Server meldet Version <b>26.3</b> ${T("weitere unterstützte Versionen bestätigen")}.</li><li><b>Mehrspieler → Server hinzufügen</b>, Adresse <code>${H}</code>.</li><li>Verbinden. Du landest in der <a href="/wiki/server">Lobby</a>, von dort geht's per Portal nach Survival.</li></ol>
<h2>5. Website</h2><p>Melde dich auf dieser Seite mit Discord an. Ist dein Account verknüpft und bestätigt, siehst du im <a href="/profile">Profil</a> deinen 3D-Skin und deine Stats.</p>
<h2>Tipps für den Start</h2><ul><li>Installier <a href="/wiki/voice-chat">Simple Voice Chat</a>, sonst hörst du niemanden.</li><li>Auf Survival landest du an einem <b>sicheren Zufalls-Spawn</b> im Umkreis von 100 Blöcken (nicht auf Blättern, nicht in Höhlen).</li><li>Setz dir früh ein Home mit <code>/sethome</code>, der erste Slot ist gratis.</li><li>Zurück in die Lobby kommst du immer mit <code>/spawn</code>.</li></ul>` },
  { slug: "server", icon: "filled_map", title: "Server-Übersicht", sum: "Lobby, Survival, MineRush und VIP-Welten.", body: () => `
<p>Alle Server laufen hinter einem <b>Velocity</b>-Proxy unter einer Adresse. Zwischen den Welten wechselst du ohne neu zu verbinden.</p>
<h2>Lobby</h2><ul><li>Treffpunkt und Spawn, hier landest du beim Join.</li><li><b>Portale</b> bringen dich auf Survival.</li><li><b>Parkour</b> mit Bestenlisten-Hologramm.</li><li><code>/bank</code> und <code>/market</code> funktionieren hier.</li><li>NPCs für Bank und Auktionshaus ${WIP}</li></ul>
<h2>Survival</h2><ul><li>Die Hauptwelt: Vanilla+ im CraftAttack-Stil.</li><li><a href="/wiki/voice-chat">Simple Voice Chat</a> mit <b>VoiceSculk</b>: lautes Sprechen kann Sculk-Sensoren im Umkreis von 8 Blöcken auslösen. Flüstern und Gruppen-Voice lösen nichts aus.</li><li>Teams: <code>/tpteam</code>, Team-Einladungen über alle Server. Die Locator-Bar (Spielermarker auf der XP-Leiste) zeigt nur deine Teammitglieder.</li><li>Claim-Schutz für Bauten, Truhen und Tiere ${T("wie man claimt")}</li><li>Homes, Shops, Auktionshaus, Challenges, siehe <a href="/wiki/befehle">Befehle</a>.</li></ul>
<h2>MineRush ${WIP}</h2><p>Ein instanzierter Dungeon: Parties von 1–4 Spielern bekommen eine eigene Instanz mit Etagen, jede 5. Etage ein Boss. Gegner skalieren mit der Partygröße, Belohnungen sinken, je langsamer ihr seid. Stirbst du, geht's zurück zum Eingang. Noch nicht spielbar.</p>
<h2>VIP-Welten ${WIP}</h2><p>Bis zu 3 VIP-Welten sind geplant. ${T("wer Zugang bekommt und wie")}</p>
<h2>Servermodus</h2><p>Der Server hat die Modi <b>dev</b>, <b>online</b> und <b>wartung</b>. Er steht im MOTD und in der Tab-Liste. Im Moment läuft <b>dev</b>: Bis zum Go-Live können Welten und Economy noch zurückgesetzt werden. Whitelist, Ränge, Lobby-Bauten und der Parkour bleiben dabei erhalten. ${T("Go-Live-Datum")}</p>
<h2>Backups</h2><p>Geplant sind tägliche Backups um 04:50 Uhr (Welten und Datenbank, 7 Tage lang) mit einem Neustart danach.</p>` },
  { slug: "economy", icon: "gold_ingot", title: "Economy & CP", sum: "CP, Bank, Limits, Challenges und Seasons.", body: () => `
<h2>CP</h2><p>Die Währung heißt <b>CP</b>. Deinen Kontostand siehst du im Scoreboard, im <a href="/profile">Profil</a> und in der Bestenliste „CP“. Überweisen geht mit <code>/pay &lt;Spieler&gt; &lt;CP&gt;</code>.</p>
<h2>Bank (Server)</h2><ul><li>Mit <code>/bank</code> verkaufst du Items an den Server oder kaufst welche.</li><li>Die Bank ist absichtlich knauserig: Beim Verkauf bekommst du <b>25 %</b> vom Wert, beim Kauf zahlst du <b>150 %</b>.</li><li>Verkaufst du viel vom selben Item an einem Tag, bekommst du immer weniger dafür. Massenware wie Cobble, Dirt oder Rotten Flesh bringt fast nichts.</li><li><b>Verkaufslimit: 1.500 CP pro Tag</b>.</li><li>Teure Items wie Diamant oder Netherite haben einen Mindestpreis, unter den sie nie fallen.</li></ul>
<h2>Seltene Items</h2><p>Elytra, Netherite, Totems, Beacon, Nether Star, Heavy Core, Trident, Dragon Egg, verzauberte goldene Äpfel und Ähnliches gibt es <b>nie</b> bei der Bank, nur von anderen Spielern im Auktionshaus.</p>
<h2>Spielershops und Auktionshaus</h2><ul><li><code>/shop sell</code> stellt ein Angebot mit <b>Preis pro Stück</b> ein. Käufer können Teilmengen nehmen (1, 8, 16, 32, 64 oder alles).</li><li>Verkäufe, während du offline warst, bekommst du beim nächsten Join zusammengefasst gemeldet.</li><li><b>Kaufaufträge</b>: Unter <code>/shop</code> kannst du ein Gesuch aufgeben. Die CP werden reserviert, Teilverkauf und Storno gehen.</li><li><code>/ah</code> ist das Auktionshaus für Handel zwischen Spielern.</li></ul>
<h2>CP verdienen</h2><ul><li>Items an die Bank oder an Spieler verkaufen.</li><li><b>Challenges</b> (<code>/challenges</code>): 3 tägliche (ca. 50–150 CP) und 3 wöchentliche (ca. 300–600 CP), z. B. Mining, Mobs, Fischen, Craften, Erkunden. Dazu kommen Season-Punkte.</li><li>Login-Streak, Spielzeit-Titel und Meilensteine.</li><li>Kopfgelder ${WIP}: Bei PvP-Kills droppt der Kopf des Opfers. Mit <code>/bounty</code> setzt du ein Kopfgeld aus, das CP liegt sicher hinterlegt. Nicht auf dich selbst oder Teammitglieder, 1 Stunde Cooldown pro Opfer, nur in PvP-Zonen.</li><li>Startguthaben: ${T("Startguthaben in CP")}</li></ul>
<h2>Homes</h2><p>Der erste Home-Slot ist gratis, weitere kosten CP ${T("Preise der Home-Slots")}.</p>
<h2>Seasons ${WIP}</h2><p>Seasons mit Start und Ende. Die Top 3 bekommen einzigartige, nummerierte Trophäen, die nie nachproduziert werden. Bestenliste mit <code>/season top</code> und als Hologramm in der Lobby.</p>` },
  { slug: "markt", icon: "emerald", title: "Markt erklärt", sum: "Kaufpreis, Verkaufspreis, Basispreis und Charts.", body: () => `
<p>Die <a href="/markt">Markt-Seite</a> zeigt die Shop-Preise wie an einer Börse: Top-Gewinner und -Verlierer der letzten 24 h, eine Item-Suche und für jedes Item einen eigenen Chart. Im Spiel siehst du die Preise mit <code>/market</code>.</p>
<h2>Begriffe</h2><ul><li><b>Kaufpreis</b>: was du zahlst, wenn du das Item kaufst.</li><li><b>Verkaufspreis</b>: was du beim Verkauf bekommst.</li><li><b>Basispreis</b>: der Grundwert, um den sich der dynamische Preis bewegt. An der Bank: Verkauf 25 %, Kauf 150 % vom Wert.</li><li><b>24h-Änderung</b>: Preisänderung gegenüber vor 24 Stunden.</li><li><b>Volumen</b>: gehandelte Stückzahl bzw. CP in den letzten 24 Stunden. <b>Trades</b>: Anzahl der Käufe und Verkäufe.</li></ul>
<h2>Charts</h2><p>Für 1, 7, 30 und 90 Tage, stündlich aufgelöst (Durchschnitt, Min, Max, Menge). Fahr mit der Maus über den Chart oder tipp drauf, dann siehst du die Werte einer Stunde. Creepy aktualisiert die Daten etwa alle 5 Minuten.</p>
<h2>Tipps</h2><ul><li>Massenware fällt, wenn alle sie verkaufen. Verkauf lieber verteilt über mehrere Tage, auch wegen des Tageslimits von 1.500 CP.</li><li>Seltene Items gibt's nur im <code>/ah</code>, dort bestimmen die Spieler den Preis.</li></ul>
<h2>Wie sich Preise bewegen</h2><p>Die Preise verhalten sich wie Aktienkurse:</p><ul><li><b>Verkäufe drücken den Preis</b>: Verkaufen viele Spieler dasselbe Item, fällt der Kurs.</li><li><b>Käufe treiben ihn hoch</b>: Hohe Nachfrage lässt den Kurs steigen.</li><li><b>Zurück zum Basispreis</b>: Ohne Handel driftet der Kurs langsam wieder zum Basispreis.</li><li><b>Boden und Decke</b>: Jedes Item hat einen Mindest- und einen Höchstpreis. Teure Items wie Diamant oder Netherite fallen nie unter ihren Boden.</li></ul><p>${T("genaue Stärke der Bewegung und Drift-Tempo")}</p>
<h2>Kursticker und Charts</h2><p>Oben auf der Markt-Seite läuft ein Ticker mit Preis und 24h-Änderung, grün für steigend, rot für fallend. Der Chart zeigt den Durchschnittspreis jeder Stunde, das helle Band dahinter den Bereich zwischen Tiefst- und Höchstpreis.</p>` },
  { slug: "auktionshaus-shops", icon: "bell", title: "Auktionshaus & Shops", sum: "Bieten, kaufen und verkaufen, im Spiel und auf der Website.", body: () => `
<h2>Spielershops</h2><ul><li>Im Spiel: <code>/shop sell</code> stellt ein Angebot mit Preis pro Stück ein. Mit <code>/shop show</code> siehst du deine Angebote, mit <code>/shop remove</code> ziehst du sie zurück.</li><li>Ankauf: Unter <code>/shop</code> kannst du ein Gesuch aufgeben. Die CP werden reserviert.</li><li>Auf der Website unter <a href="/shops">Shops</a> siehst du alle Shops mit Besitzer, Ort, Preisen und Lager. Die Suche findet Items, Shops und Spieler.</li><li><b>Kaufen über die Website</b>: Bei einem Angebot Menge eingeben und auf <b>Kaufen</b> klicken. Die Bestellung steht dann auf „wird bestätigt“, bis der Server sie ausführt. Er prüft Lager und Kontostand, bucht die CP ab und meldet „bestätigt“ oder „abgelehnt“ mit Grund. Ist der Preis inzwischen höher als beim Bestellen, wird die Bestellung abgelehnt.</li><li><b>Abholen</b>: Was du über die Website oder Discord kaufst oder ersteigerst, landet nie direkt im Inventar, sondern in deiner Abholkiste. Im Spiel holst du es mit <code>/abholen</code>, auch wenn du beim Kauf offline warst.</li><li>In deinem eigenen Shop kannst du nicht kaufen.</li></ul>
<h2>Auktionshaus</h2><ul><li>Im Spiel öffnest du das Auktionshaus mit <code>/ah</code>. Der Verkäufer legt einen <b>Mindestpreis</b> und eine <b>Endzeit</b> fest. Eine Auktion läuft mindestens 1 Stunde und höchstens 72 Stunden.</li><li>Ein Gebot muss mindestens den Mindestpreis erreichen und das aktuelle Gebot um die Mindeststeigerung übertreffen. Die Mindeststeigerung ist 5 % des aktuellen Gebots, mindestens aber 1 CP.</li><li>Bei einem angenommenen Gebot <b>reserviert</b> der Server deine CP. Wirst du überboten, bekommst du sie zurück.</li><li><b>Anti-Sniping</b>: Ein Gebot in den letzten 2 Minuten verlängert die Auktion um 2 Minuten.</li><li>Gewonnene Items holst du im Spiel mit <code>/abholen</code> ab.</li><li>Auf deine eigenen Auktionen kannst du nicht bieten.</li><li>Seltene Items wie Elytra, Netherite oder den Dragon Egg gibt es nie bei der Bank, nur hier zwischen Spielern.</li></ul>
<h2>Bieten auf der Website</h2><ol><li>Mit Discord anmelden. Du brauchst einen verknüpften, bestätigten Account mit Mitglieder-Rolle.</li><li>Unter <a href="/auktionen">Auktionen</a> eine Auktion öffnen. Dort siehst du einen Live-Countdown, das aktuelle Gebot, den Mindestpreis und den Gebotsverlauf.</li><li>Betrag eingeben und auf <b>Bieten</b> klicken. Dein Gebot steht auf „wird bestätigt“, bis der Server es annimmt oder ablehnt.</li></ol>
<p>Zum Schutz gelten Limits: höchstens 5 Aktionen pro Minute und 30 pro Stunde. Der Minecraft-Account wird immer aus deiner Verknüpfung genommen, nie aus dem Formular.</p>` },
  { slug: "voice-chat", icon: "note_block", title: "Voice Chat", sum: "Simple Voice Chat installieren und einstellen.", body: () => `
<p>Auf Survival läuft <b>Simple Voice Chat</b>: Wer in deiner Nähe ist, den hörst du im Spiel, und je weiter weg, desto leiser. Ohne den Mod kannst du trotzdem spielen, hörst aber niemanden.</p>
<h2>Installation</h2><ol><li>Einen Mod-Loader für deine Minecraft-Version installieren, z. B. <b>Fabric</b> (mit Fabric API) oder <b>NeoForge</b>.</li><li><a href="https://modrinth.com/plugin/simple-voice-chat" rel="noopener">Simple Voice Chat von Modrinth</a> laden (passend zu Loader und Version) und in den <code>mods</code>-Ordner legen.</li><li>Mit dem Loader-Profil starten und auf <code>mc.nwebnotfound.dev</code> verbinden.</li></ol>
<h2>Einstellungen</h2><ul><li><kbd>V</kbd>: Voice-Chat-Menü (Mikrofon, Lautstärke, Test).</li><li>Push-to-Talk (Standard <kbd>Caps Lock</kbd>) oder Sprachaktivierung.</li><li><kbd>G</kbd>: Gruppen, damit ihr unabhängig von der Entfernung miteinander redet.</li><li>Flüstern ist leiser und hat weniger Reichweite.</li></ul>
<h2>Sculk-Sensoren (VoiceSculk)</h2><p>Normales Sprechen kann Sculk-Sensoren im Umkreis von <b>8 Blöcken</b> auslösen. Flüstern und Gruppen-Voice lösen keine aus. Vorsicht in der Deep Dark!</p>
<h2>Probleme?</h2><ul><li>Kein Ton: im Menü (<kbd>V</kbd>) das richtige Ein- und Ausgabegerät wählen.</li><li>„Voice Chat nicht verfügbar“: Mod-Version passt nicht zur Spielversion, oder du bist in der Lobby. Voice ist auf Survival aktiv ${T("Voice auch in der Lobby?")}.</li></ul>` },
  { slug: "befehle", icon: "command_block", title: "Befehle", sum: "Alle Discord- und Ingame-Befehle, durchsuchbar.", body: () => `
<p>Alle bekannten Befehle. „im Aufbau“ heißt: wird gerade gebaut oder getestet und kann sich noch ändern. Die meisten Hauptbefehle öffnen ohne Argumente ein Menü.</p>${cmdTable()}` },
  { slug: "plugins", icon: "redstone", title: "Plugins & Technik", sum: "Was auf dem Server läuft.", body: () => `
<table class="cmd"><tr><th>Plugin</th><th>Wofür</th></tr>
<tr><td><b>CraftCore</b></td><td>Unser eigenes Plugin: CP-Economy, Bank, Markt, Shops, Auktionshaus, Homes, Teams, Challenges, Stats, Scoreboard, Spawn, MineRush</td></tr>
<tr><td><b>Simple Voice Chat</b></td><td>Proximity-Voice-Chat (Survival)</td></tr>
<tr><td><b>VoiceSculk</b></td><td>Sprechen löst Sculk-Sensoren aus</td></tr>
<tr><td><b>Advanced Portals</b></td><td>Portale zwischen Lobby und Survival</td></tr>
<tr><td><b>Lobby Parkour</b></td><td>Parkour in der Lobby mit Bestenliste</td></tr>
<tr><td><b>LuckPerms</b></td><td>Ränge und Rechte</td></tr>
<tr><td><b>Vault</b></td><td>Economy-Schnittstelle</td></tr>
<tr><td><b>WorldEdit, WorldGuard</b></td><td>Bauen und Schutz der Lobby</td></tr>
<tr><td><b>DiscordLink</b></td><td>Verbindung zum Discord (Verknüpfung, Chat-Sync)</td></tr></table>
<h2>Discord-Bot Creepy</h2><p>Verknüpfung und Auto-Whitelist, Status-Kanal, Chat-Sync Discord ↔ Minecraft, Wochen-Recap jeden Sonntag um 18 Uhr, Events, Admin-Befehle. Er schickt auch die Daten für diese Website (Bestenlisten, Profile, Markt).</p>
<h2>Technik</h2><p>Paper-Server (Lobby, Survival) hinter einem Velocity-Proxy, in Docker. Die Website läuft auf Cloudflare. Die Server-IP bleibt verborgen, verbunden wird nur über <code>mc.nwebnotfound.dev</code>.</p>` },
  { slug: "regeln", icon: "writable_book", title: "Regeln", sum: "Was auf dem Server gilt.", body: () => `<p>${T("Offizielle Serverregeln von Nils")}</p>
<h2>Was technisch gilt</h2><ul><li>Zugang nur mit verknüpftem Discord-Account und Mitglieder-Rolle.</li><li>Kopfgelder nicht auf dich selbst oder Teammitglieder; Kills durch Teammitglieder oder verdächtige Zweit-Accounts zählen nicht.</li><li>Claims schützen Bauten, Truhen und Tiere.</li></ul>` },
  { slug: "faq", icon: "book", title: "FAQ", sum: "Häufige Fragen.", body: (H) => `
<h3>„Du bist nicht auf der Whitelist“</h3><p>Verknüpfe deinen Account mit <code>/link</code> im Discord und bestätige den Code im Spiel. Du brauchst die Mitglieder-Rolle. Siehe <a href="/wiki/erste-schritte">Erste Schritte</a>.</p>
<h3>Welche Adresse und Version?</h3><p><code>${H}</code>, Java Edition. Der Server meldet Version 26.3.</p>
<h3>Geht Bedrock, Handy oder Konsole?</h3><p>${T("Bedrock-Support ja/nein")}</p>
<h3>Wie komme ich zurück in die Lobby?</h3><p><code>/spawn</code>, dann 10 Sekunden stillstehen.</p>
<h3>Wie setze ich ein Home?</h3><p><code>/sethome</code>, zurück mit <code>/home</code>. Nur auf Survival. Der erste Slot ist gratis.</p>
<h3>Ich höre niemanden.</h3><p>Du brauchst den Mod <a href="/wiki/voice-chat">Simple Voice Chat</a>.</p>
<h3>Wo sind meine gekauften Items?</h3><p>Passt etwas nicht ins Inventar, landet es im Abholfach (<code>/abholen</code>, auch automatisch beim Join).</p>
<h3>Warum fällt mein Verkaufspreis?</h3><p>Die Bank zahlt bei vielen Verkäufen desselben Items an einem Tag immer weniger, und es gibt ein Tageslimit von 1.500 CP. Siehe <a href="/wiki/economy">Economy</a>.</p>
<h3>Wird die Welt zurückgesetzt?</h3><p>Bis zum Go-Live (Servermodus „dev“) ja, danach nicht mehr.</p>
<h3>Warum sehe ich keine Stats im Profil?</h3><p>Melde dich hier mit Discord an. Die Stats erscheinen, wenn dein Account verknüpft und bestätigt ist und du einmal auf Survival warst.</p>
<h3>Wo melde ich Bugs oder Griefing?</h3><p>${T("Discord-Kanal")}</p>` },
];
const WIKI_CSS = `<style>.wk h2{font-size:1.3rem;margin:2rem 0 .6rem;letter-spacing:-.01em}.wk h3{font-size:1.05rem;margin:1.6rem 0 .4rem}.wk p,.wk li{color:color-mix(in srgb,var(--fg) 85%,transparent);line-height:1.7}.wk code,.wk kbd{background:rgba(255,255,255,.08);padding:.1rem .4rem;border-radius:6px;font-size:.9em;white-space:nowrap}.wk table{border-collapse:collapse;width:100%}.wk td,.wk th{padding:.6rem .5rem;border-top:1px solid var(--line);vertical-align:top;text-align:left}.wk th{font-size:.78rem;color:var(--mut);font-weight:500;border:0}.wk>:first-child{margin-top:0}
.wip{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.04em;color:#60a5fa;border:1px solid rgba(96,165,250,.45);border-radius:6px;padding:.02rem .4rem;vertical-align:middle;white-space:nowrap}
.wl{display:grid;gap:.9rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}.wl a{display:flex!important;gap:1rem;align-items:flex-start;padding:1.2rem;color:inherit;text-decoration:none}.wl .qi{line-height:0;flex:none;display:flex;align-items:center}.wl .qi .mi{width:36px;height:36px;image-rendering:pixelated;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}.wl b{display:block;margin-bottom:.15rem;font-family:var(--f-px,monospace)}.wl span{color:var(--mut);font-size:.9rem}
.hits{display:grid;gap:.7rem}.hits a{display:block;padding:1rem 1.2rem}.hits b{display:block;margin-bottom:.25rem}.hits p{margin:.2rem 0 0;color:var(--mut);font-size:.9rem;line-height:1.5}.hits mark{background:rgba(74,222,128,.25);color:var(--fg);border-radius:3px;padding:0 .1rem}
.wgrid{display:grid;gap:1.4rem}@media(min-width:900px){.wgrid{grid-template-columns:240px 1fr}}.wside a{display:block;padding:.5rem .8rem;border-radius:10px;color:var(--mut)}.wside a[aria-current]{background:rgba(74,222,128,.12);color:var(--fg)}@media(max-width:899px){.wside{display:flex;overflow-x:auto;gap:.3rem;scrollbar-width:none}.wside a{flex:none}}</style>`;
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<\/(p|li|h2|h3|tr|td)>/g, " · ").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/(\s*·\s*)+/g, " · ").replace(/^ · | · $/g, "").trim();
// Suchindex: pro Artikel Abschnitte (Überschrift + Text), damit Treffer auf den Abschnitt zeigen
const sections = (a, H) => { const html = a.body(H), parts = html.split(/(?=<h[23][^>]*>)/); return parts.map((p) => { const m = p.match(/^<h[23][^>]*>([\s\S]*?)<\/h[23]>/); return { h: m ? strip(m[1]) : "", t: strip(m ? p.slice(m[0].length) : p) }; }).filter((s) => s.t || s.h); };
const wikiIndex = (H) => JSON.stringify(WIKI.map((a) => ({ s: a.slug, ti: a.title, i: a.icon, su: a.sum, x: sections(a, H) }))).replace(/</g, "\\u003c");
export const wikiIndexBody = (H) => `${WIKI_CSS}
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Wiki</p><h1 class="hub-h">Alles, was du wissen musst.</h1><p class="sub">Anleitungen, Befehle, Economy und Antworten rund um den Server.</p>
<div class="srch" style="margin-top:1.4rem;max-width:560px"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input name="mc-wq-find" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-form-type="other" data-lpignore="true" class="inp" id="wq" type="search" placeholder="Wiki durchsuchen, z. B. /home, CP, Voice" aria-label="Wiki durchsuchen"></div></div></section>
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap"><div class="hits" id="hits" hidden></div><div class="wl" id="wl">${WIKI.map((a) => `<a class="g" href="/wiki/${a.slug}"><div class="qi">${MI(a.icon, 28)}</div><div><b>${a.title}</b><span>${a.sum}</span></div></a>`).join("")}</div>
<p class="mut" id="wnone" hidden>Nichts gefunden. Versuch's mit einem anderen Wort.</p></div></section>
<script>(()=>{const IX=${wikiIndex(H)};const q=document.getElementById('wq'),H=document.getElementById('hits'),L=document.getElementById('wl'),N=document.getElementById('wnone');
const E=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));const norm=s=>s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
const snip=(t,w)=>{const n=norm(t),i=Math.max(0,n.indexOf(w[0]));let s=t.slice(Math.max(0,i-60),i+140);s=(i>60?'… ':'')+E(s)+(t.length>i+140?' …':'');w.forEach(x=>{if(!x)return;s=s.replace(new RegExp('('+x.replace(/[.*+?^$\{\}()|[\\]\\\\\\/]/g,'\\\\$&')+')','ig'),'<mark>$1</mark>')});return s};
function run(){const raw=q.value.trim();if(!raw){H.hidden=true;L.hidden=false;N.hidden=true;return}const w=norm(raw).split(/\\s+/).filter(Boolean);const R=[];
IX.forEach(a=>a.x.forEach(sec=>{const hay=norm(a.ti+' '+sec.h+' '+sec.t);if(w.every(x=>hay.includes(x))){let sc=0;w.forEach(x=>{if(norm(sec.h).includes(x))sc+=3;if(norm(a.ti).includes(x))sc+=2;sc+=hay.split(x).length-1});R.push({a,sec,sc})}}));
R.sort((x,y)=>y.sc-x.sc);L.hidden=true;H.hidden=!R.length;N.hidden=!!R.length;H.innerHTML=R.slice(0,12).map(r=>'<a class="g" href="/wiki/'+r.a.s+'"><b><img class="mi" alt="" width="18" height="18" src="/mc-icon/v2/'+r.a.i+'" style="vertical-align:-3px;margin-right:.35rem">'+E(r.a.ti)+(r.sec.h?' › '+E(r.sec.h):'')+'</b><p>'+snip(r.sec.t||r.sec.h,w)+'</p></a>').join('')}
q.oninput=run;const p=new URLSearchParams(location.search).get('q');if(p){q.value=p;run()}})()</script>`;
export const wikiArticleBody = (a, H) => `${WIKI_CSS}
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p style="margin:0 0 1rem"><a href="/wiki">‹ Wiki</a></p><div class="wiki-hero-meta">${MI(a.icon, 28)}<p class="eyb">Wiki</p></div><h1 class="hub-h" style="font-size:clamp(2rem,5vw,3.2rem);margin-top:0">${a.title}</h1><p class="sub">${a.sum}</p></div></section>
<section class="sec" style="padding-top:1rem"><div class="hub-wrap wgrid"><nav class="wside g" style="padding:.5rem;align-self:start">${WIKI.map((x) => `<a href="/wiki/${x.slug}"${x.slug === a.slug ? ' aria-current="page"' : ""}>${MI(x.icon, 18)} ${x.title}</a>`).join("")}</nav>
<article class="g pad wk">${a.body(H)}</article></div></section>`;

/* ---------- Shops & Auktionen ---------- */
const listHero = (eyb, h, sub, ph) => `<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">${eyb}</p><h1 class="hub-h">${h}</h1><p class="sub">${sub}</p>
<div class="srch" style="margin-top:1.4rem;max-width:560px">${SEARCH_SVG}<input name="mc-q-find" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-form-type="other" data-lpignore="true" class="inp" id="q" type="search" placeholder="${ph}" aria-label="Suchen"></div></div></section>`;
export const shopsBody = () => `${listHero("Spielershops", "Shops.", "Was deine Mitspieler verkaufen und suchen, mit Preis, Lager und Ort.", "Item, Shop oder Spieler suchen")}
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap" id="root"><div class="g pad mut">Lade Shops…</div></div></section>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/shops.js?v=${AV}" defer></script>`;
export const shopBody = (id) => `<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p style="margin:0 0 1rem"><a href="/shops">‹ Shops</a></p><div id="hd" data-id="${id}"><h1 class="hub-h">…</h1></div></div></section>
<section class="sec" style="padding-top:.6rem"><div class="hub-wrap" id="root"><div class="g pad mut">Lade…</div></div></section>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/shop.js?v=${AV}" defer></script>`;
export const auctionsBody = () => `${listHero("Auktionshaus", "Auktionen.", "Live-Auktionen vom Server. Bieten geht mit verknüpftem Account direkt hier.", "Item oder Verkäufer suchen")}
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap" id="root"><div class="g pad mut">Lade Auktionen…</div></div></section>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/auctions.js?v=${AV}" defer></script>`;
export const auctionBody = (id) => `<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p style="margin:0 0 1rem"><a href="/auktionen">‹ Auktionen</a></p><div id="hd" data-id="${id}"><h1 class="hub-h">…</h1></div></div></section>
<section class="sec" style="padding-top:.6rem"><div class="hub-wrap" id="root"><div class="g pad mut">Lade…</div></div></section>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/auction.js?v=${AV}" defer></script>`;
