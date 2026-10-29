// MC-Hub: gemeinsames Design-System, Startseite, Markt, Wiki (mc.nwebnotfound.dev)
export const HUB_CSS = String.raw`
.seg{display:inline-flex;padding:.25rem;border-radius:12px;background:rgba(255,255,255,.06)}.seg button{border:0;background:transparent;color:var(--mut);font:inherit;font-size:.82rem;padding:.4rem .9rem;border-radius:9px;cursor:pointer;transition:background .2s,color .2s}.seg button[aria-pressed=true]{background:#1f2a22;color:var(--fg);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.acct .btn{white-space:nowrap}
@media(max-width:480px){.nav .l{font-size:.82rem;margin-left:.1rem;margin-right:.1rem}.acct .btn.discord{font-size:0;padding:.45rem .75rem}.acct .btn.discord::after{content:"Login";font-size:.8rem}}
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.28s}
main{animation:hubin .45s cubic-bezier(.2,.8,.2,1) both}@keyframes hubin{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){main{animation:none}}
.nav .l[aria-current=page]{color:var(--fg);font-weight:600}
.nav .l{transition:color .2s}
.g{background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.025));border:1px solid var(--line);border-radius:22px;backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 20px 40px -24px rgba(0,0,0,.8)}
.g.pad{padding:1.4rem}@media(min-width:760px){.g.pad{padding:1.8rem}}
a.g{display:block;color:inherit;text-decoration:none;transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .25s,background .25s}
a.g:hover{transform:translateY(-3px);border-color:rgba(74,222,128,.35);text-decoration:none}
.hub-wrap{max-width:1120px;margin:0 auto;padding:0 clamp(1rem,4vw,2rem)}
.hub-h{font-size:clamp(2.2rem,6.5vw,4.4rem);line-height:1.04;letter-spacing:-.035em;font-weight:700;margin:.2rem 0 .8rem}
.hub-h2{font-size:clamp(1.5rem,3.4vw,2.2rem);letter-spacing:-.025em;font-weight:700;margin:0 0 1rem}
.eyb{font-size:.78rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--acc)}
.sub{color:var(--mut);font-size:clamp(1rem,2vw,1.2rem);max-width:40rem}
.sec{padding:clamp(2rem,5vw,3.5rem) 0}
.pill{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .8rem;border-radius:99px;background:rgba(255,255,255,.06);border:1px solid var(--line);font-size:.85rem}
.qgrid{display:grid;gap:.9rem;grid-template-columns:repeat(2,1fr)}@media(min-width:900px){.qgrid{grid-template-columns:repeat(4,1fr)}}
.q{padding:1.2rem;min-height:128px;display:flex!important;flex-direction:column;justify-content:space-between}
.q .qi{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:1.25rem;background:rgba(74,222,128,.14)}
.q b{font-size:1.05rem}.q span{font-size:.82rem;color:var(--mut)}
.up{color:#4ade80}.dn{color:#f87171}.flat{color:var(--mut)}
.tnum{font-variant-numeric:tabular-nums}
.todo{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.06em;color:#fbbf24;border:1px dashed rgba(251,191,36,.5);border-radius:6px;padding:.05rem .4rem;margin:0 .2rem}
.empty-st{text-align:center;padding:3rem 1rem}.empty-st .big{font-size:2.6rem;margin-bottom:.6rem}
.inp{width:100%;font:inherit;font-size:1rem;color:var(--fg);background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:14px;padding:.85rem 1rem .85rem 2.6rem;outline:none;transition:border-color .2s,box-shadow .2s}
.inp:focus{border-color:rgba(74,222,128,.5);box-shadow:0 0 0 4px var(--ring)}
.srch{position:relative}.srch svg{position:absolute;left:.9rem;top:50%;transform:translateY(-50%);opacity:.55}
.ac{position:absolute;left:0;right:0;top:calc(100% + .4rem);z-index:30;background:#141a16f2;border:1px solid var(--line);border-radius:16px;padding:.35rem;box-shadow:0 20px 50px rgba(0,0,0,.6);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);max-height:340px;overflow:auto}
.ac a{display:flex;align-items:center;gap:.7rem;padding:.55rem .7rem;border-radius:10px;color:var(--fg);text-decoration:none}.ac a[aria-selected=true],.ac a:hover{background:rgba(74,222,128,.12);text-decoration:none}
.ac small{margin-left:auto;color:var(--mut)}
.ic{display:inline-grid;place-items:center;width:28px;height:28px;flex:none;border-radius:7px;background:rgba(255,255,255,.06);font-size:.62rem;font-weight:700;color:var(--mut);overflow:hidden}.ic img{width:22px;height:22px;image-rendering:pixelated}
`;

export const hubNav = (MAIN) => `<a class="brand" href="/"><span class="px" style="color:var(--acc)">■</span> NwebNotFound MC</a><a class="l hide-s" href="/">Start</a><a class="l" href="/leaderboards">Bestenlisten</a><a class="l" href="/markt">Markt</a><a class="l" href="/wiki">Wiki</a><a class="l hide-s" href="/profile">Profil</a><script>(()=>{const p=location.pathname.replace(/\\/$/,'')||'/';document.querySelectorAll('.nav .l').forEach(a=>{const h=a.getAttribute('href');if(h===p||(h!=='/'&&p.startsWith(h+'/')))a.setAttribute('aria-current','page')})})()</script>`;

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
<section class="sec" style="padding-top:1rem"><div class="hub-wrap"><div class="qgrid">
<a class="g q" href="/profile"><div class="qi">👤</div><div><b>Profil</b><br><span>Deine Stats & dein 3D-Skin</span></div></a>
<a class="g q" href="/leaderboards"><div class="qi">🏆</div><div><b>Bestenlisten</b><br><span>Woche & Gesamt</span></div></a>
<a class="g q" href="/markt"><div class="qi">📈</div><div><b>Markt</b><br><span>Preise & Verläufe</span></div></a>
<a class="g q" href="/wiki"><div class="qi">📖</div><div><b>Wiki</b><br><span>Anleitungen & FAQ</span></div></a>
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
<script src="/mc/common.js" defer></script><script src="/mc/home.js" defer></script>`;

/* ---------- Markt ---------- */
export const marketBody = () => `
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap">
<p class="eyb">Server-Börse</p><h1 class="hub-h">Markt.</h1><p class="sub">Live-Preise aus dem Shop, in CP. Wer steigt, wer fällt.</p>
<div class="srch" style="margin-top:1.4rem;max-width:560px">${SEARCH_SVG}<input class="inp" id="q" type="search" placeholder="Item suchen, z. B. Diamant" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ac" aria-label="Item suchen"><div class="ac" id="ac" role="listbox" hidden></div></div>
</div></section>
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap" id="mroot"><div class="g pad mut">Lade Marktdaten…</div></div></section>
<script src="/mc/common.js" defer></script><script src="/mc/market.js" defer></script>`;
export const marketItemBody = (item) => `
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap">
<p style="margin:0 0 1rem"><a href="/markt">‹ Markt</a></p><div id="ihd" data-item="${item}"><h1 class="hub-h">…</h1></div></div></section>
<section class="sec" style="padding-top:.6rem"><div class="hub-wrap" id="iroot"><div class="g pad mut">Lade…</div></div></section>
<script src="/mc/common.js" defer></script><script src="/mc/item.js" defer></script>`;

/* ---------- Wiki ---------- */
const T = (s = "") => `<span class="todo" title="Noch offen">TODO${s ? ": " + s : ""}</span>`;
export const WIKI = [
  { slug: "erste-schritte", icon: "🚀", title: "Erste Schritte", sum: "Beitreten, Discord verknüpfen, Whitelist.", body: (H) => `
<h2>1. Discord beitreten</h2><p>Der Server ist für unsere Freundesgruppe. Du brauchst eine Einladung zu unserem Discord ${T("Invite-Link")} und die Mitglieder-Rolle.</p>
<h2>2. Account verknüpfen</h2><p>Im Discord schreibst du <code>/link &lt;Minecraft-Name&gt;</code>. Unser Bot <b>Creepy</b> prüft deinen Namen bei Mojang und deine Rolle. Danach bekommst du einen <b>einmaligen Bestätigungscode</b>, den du im Spiel eingibst ${T("genauer Befehl im Spiel")}. <code>/setup</code> schickt dir die Anleitung zusätzlich per DM.</p>
<h2>3. Whitelist</h2><p>Nach der Bestätigung setzt dich Creepy automatisch auf die Whitelist aller Server. Verlässt du den Discord oder verlierst die Rolle, wirst du automatisch wieder entfernt.</p>
<h2>4. Verbinden</h2><ol><li>Minecraft <b>Java Edition</b> starten ${T("unterstützte Version")}.</li><li><b>Mehrspieler → Server hinzufügen</b>.</li><li>Adresse <code>${H}</code> eintragen und verbinden.</li></ol><p>Du landest zuerst in der <a href="/wiki/server">Lobby</a>.</p>` },
  { slug: "server", icon: "🗺️", title: "Server-Übersicht", sum: "Lobby, Survival und VIP-Welten.", body: () => `
<h2>Lobby</h2><p>Treffpunkt und Spawn. Von hier wechselst du in die anderen Welten ${T("Portal/NPC/Befehl zum Wechseln")}.</p>
<h2>Survival</h2><p>Die Hauptwelt: Vanilla+ im CraftAttack-Stil, mit <a href="/wiki/voice-chat">Simple Voice Chat</a> und eigener <a href="/wiki/economy">Economy</a>.</p>
<h2>VIP-Welten</h2><p>${T("Welche VIP-Welten es gibt, wer Zugang hat und wie man ihn bekommt")}</p>
<h2>Technik</h2><p>Die Server laufen hinter einem Velocity-Proxy, Wechsel zwischen Welten geht ohne Neuverbinden.</p>` },
  { slug: "economy", icon: "🪙", title: "Economy & Shop", sum: "CP, Kontostand und der Shop.", body: () => `
<h2>CP</h2><p>Die Währung auf dem Server heißt <b>CP</b>. Deinen Kontostand siehst du in deinem <a href="/profile">Profil</a> und in der Bestenliste „CP“.</p>
<h2>CP verdienen</h2><p>${T("Wie man CP verdient (Verkauf an den Shop, Jobs, Belohnungen …)")}</p>
<h2>Shop</h2><p>Im Shop kaufst und verkaufst du Items gegen CP ${T("Wo/wie der Shop geöffnet wird")}. Die Preise bewegen sich mit Angebot und Nachfrage, siehe <a href="/wiki/markt">Markt erklärt</a>.</p>
<h2>Überweisen</h2><p>${T("Befehl zum Bezahlen anderer Spieler")}</p>` },
  { slug: "markt", icon: "📈", title: "Markt erklärt", sum: "Kaufpreis, Verkaufspreis, Basispreis, Charts.", body: () => `
<p>Die <a href="/markt">Markt-Seite</a> zeigt die Shop-Preise wie an einer Börse.</p>
<ul><li><b>Kaufpreis</b>: was du zahlst, wenn du ein Item im Shop kaufst.</li><li><b>Verkaufspreis</b>: was du bekommst, wenn du es verkaufst.</li><li><b>Basispreis</b>: der Ausgangspreis, um den sich der Preis bewegt.</li><li><b>24h-Änderung</b>: Preisänderung gegenüber vor 24 Stunden.</li><li><b>Volumen</b>: gehandelte Menge bzw. CP in den letzten 24 Stunden.</li></ul>
<h2>Charts</h2><p>Pro Item gibt es einen Preisverlauf für 1, 7, 30 und 90 Tage, stündlich aufgelöst. Daten werden etwa alle 5 Minuten aktualisiert.</p>
<h2>Wie entstehen die Preise?</h2><p>${T("Preisformel / wie stark Käufe und Verkäufe den Preis bewegen")}</p>` },
  { slug: "voice-chat", icon: "🎙️", title: "Voice Chat", sum: "Simple Voice Chat einrichten.", body: () => `
<p>Auf Survival läuft <b>Simple Voice Chat</b>: Spieler in deiner Nähe hörst du im Spiel, je weiter weg, desto leiser.</p>
<h2>Installation</h2><ol><li>Einen Mod-Loader installieren, z. B. <b>Fabric</b> oder <b>NeoForge</b> ${T("empfohlener Loader")}.</li><li>Simple Voice Chat für deine Minecraft-Version von <a href="https://modrinth.com/plugin/simple-voice-chat" rel="noopener">Modrinth</a> laden und in den <code>mods</code>-Ordner legen.</li><li>Spiel starten und verbinden. Ohne Mod kannst du spielen, hörst aber niemanden.</li></ol>
<h2>Einstellungen</h2><p>Mit <kbd>V</kbd> öffnest du das Voice-Chat-Menü: Mikrofon wählen, Lautstärke, Push-to-Talk (Standard <kbd>Caps Lock</kbd>) oder Sprachaktivierung. Gruppen erstellst du über <kbd>G</kbd>.</p>
<h2>Probleme?</h2><p>Hörst du nichts, prüfe im Menü, ob das richtige Gerät gewählt ist und der Mod zur Spielversion passt.</p>` },
  { slug: "regeln", icon: "📜", title: "Regeln", sum: "Was auf dem Server gilt.", body: () => `<p>${T("Offizielle Regeln von Nils einfügen")}</p><p>Grundsätzlich gilt: fair spielen, nichts von anderen kaputt machen oder klauen, keine Hacks oder X-Ray.</p>` },
  { slug: "befehle", icon: "⌨️", title: "Befehle", sum: "Discord- und Ingame-Befehle.", body: () => `
<h2>Discord (Creepy)</h2><table><tr><td><code>/setup</code></td><td>Einsteiger-Anleitung per DM</td></tr><tr><td><code>/link</code></td><td>Minecraft-Account verknüpfen (mit Bestätigungscode)</td></tr><tr><td><code>/status</code></td><td>Serverstatus und Spieler online</td></tr></table>
<h2>Im Spiel</h2><p>${T("Liste der Ingame-Befehle (Shop, Geld, Homes, Teleport …)")}</p>` },
  { slug: "faq", icon: "❓", title: "FAQ", sum: "Häufige Fragen.", body: (H) => `
<h3>Ich komme nicht auf den Server („nicht auf der Whitelist“).</h3><p>Verknüpfe deinen Account mit <code>/link</code> im Discord und bestätige den Code im Spiel. Siehe <a href="/wiki/erste-schritte">Erste Schritte</a>.</p>
<h3>Welche Adresse?</h3><p><code>${H}</code>, Java Edition.</p>
<h3>Geht Bedrock / Handy / Konsole?</h3><p>${T("Bedrock-Support ja/nein")}</p>
<h3>Ich höre niemanden im Voice Chat.</h3><p>Du brauchst den Simple-Voice-Chat-Mod, siehe <a href="/wiki/voice-chat">Voice Chat</a>.</p>
<h3>Warum sehe ich keine Stats im Profil?</h3><p>Melde dich auf der Website mit Discord an. Die Stats erscheinen, wenn dein Account verknüpft und bestätigt ist.</p>
<h3>Wo melde ich Bugs oder Griefing?</h3><p>${T("Kanal im Discord")}</p>` },
];
const WIKI_CSS = `<style>.wk h2{font-size:1.3rem;margin:2rem 0 .6rem;letter-spacing:-.01em}.wk h3{font-size:1.05rem;margin:1.6rem 0 .4rem}.wk p,.wk li{color:color-mix(in srgb,var(--fg) 85%,transparent);line-height:1.7}.wk code,.wk kbd{background:rgba(255,255,255,.08);padding:.1rem .4rem;border-radius:6px;font-size:.9em}.wk table{border-collapse:collapse;width:100%}.wk td{padding:.6rem .4rem;border-top:1px solid var(--line);vertical-align:top}.wk>:first-child{margin-top:0}
.wl{display:grid;gap:.9rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}.wl a{display:flex!important;gap:1rem;align-items:flex-start;padding:1.2rem}.wl .qi{font-size:1.4rem;width:44px;height:44px;border-radius:12px;background:rgba(74,222,128,.12);display:grid;place-items:center;flex:none}.wl b{display:block;margin-bottom:.15rem}.wl span{color:var(--mut);font-size:.9rem}
.wgrid{display:grid;gap:1.4rem}@media(min-width:900px){.wgrid{grid-template-columns:240px 1fr}}.wside a{display:block;padding:.5rem .8rem;border-radius:10px;color:var(--mut)}.wside a[aria-current]{background:rgba(74,222,128,.12);color:var(--fg)}@media(max-width:899px){.wside{display:flex;overflow-x:auto;gap:.3rem;scrollbar-width:none}.wside a{flex:none}}</style>`;
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export const wikiIndexBody = (H) => `${WIKI_CSS}
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Wiki</p><h1 class="hub-h">Alles, was du wissen musst.</h1><p class="sub">Anleitungen, Regeln und Antworten rund um den Server.</p>
<div class="srch" style="margin-top:1.4rem;max-width:560px">${SEARCH_SVG}<input class="inp" id="wq" type="search" placeholder="Wiki durchsuchen" autocomplete="off" aria-label="Wiki durchsuchen"></div></div></section>
<section class="sec" style="padding-top:1.2rem"><div class="hub-wrap"><div class="wl" id="wl">${WIKI.map((a) => `<a class="g" href="/wiki/${a.slug}" data-t="${(a.title + " " + a.sum + " " + strip(a.body(H))).toLowerCase().replace(/"/g, "")}"><div class="qi">${a.icon}</div><div><b>${a.title}</b><span>${a.sum}</span></div></a>`).join("")}</div>
<p class="mut" id="wnone" hidden>Nichts gefunden.</p></div></section>
<script>(()=>{const q=document.getElementById('wq'),L=[...document.querySelectorAll('#wl a')];q.oninput=()=>{const t=q.value.toLowerCase().trim().split(/\\s+/);let n=0;L.forEach(a=>{const ok=t.every(w=>a.dataset.t.includes(w));a.hidden=!ok;n+=ok});document.getElementById('wnone').hidden=!!n}})()</script>`;
export const wikiArticleBody = (a, H) => `${WIKI_CSS}
<section class="hero" style="padding-bottom:.5rem"><div class="pixbg"></div><div class="hub-wrap"><p style="margin:0 0 1rem"><a href="/wiki">‹ Wiki</a></p><p class="eyb">${a.icon} Wiki</p><h1 class="hub-h" style="font-size:clamp(2rem,5vw,3.2rem)">${a.title}</h1><p class="sub">${a.sum}</p></div></section>
<section class="sec" style="padding-top:1rem"><div class="hub-wrap wgrid"><nav class="wside g" style="padding:.5rem;align-self:start">${WIKI.map((x) => `<a href="/wiki/${x.slug}"${x.slug === a.slug ? ' aria-current="page"' : ""}>${x.icon} ${x.title}</a>`).join("")}</nav>
<article class="g pad wk">${a.body(H)}</article></div></section>`;
