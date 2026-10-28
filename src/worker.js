const SITEKEY = "0x4AAAAAAFplEJyvitu_qwlx";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CSS = `:root{--bg:#0f1117;--fg:#e6e8ef;--mut:#9aa3b5;--acc:#5eead4;--card:#171a23}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg);line-height:1.6}a{color:var(--acc)}nav{display:flex;gap:1.2rem;padding:1rem 2rem;border-bottom:1px solid #252a36}nav b{margin-right:auto}main{max-width:820px;margin:0 auto;padding:2rem}.card{background:var(--card);border:1px solid #252a36;border-radius:12px;padding:1.2rem 1.5rem;margin:1rem 0}.ph{color:#fbbf24;font-size:.85rem}.mut{color:var(--mut)}input,textarea{width:100%;padding:.6rem;margin:.3rem 0 .8rem;background:#0b0d12;color:var(--fg);border:1px solid #2d3341;border-radius:8px;font:inherit}button{background:var(--acc);color:#0b0d12;border:0;padding:.6rem 1.2rem;border-radius:8px;font-weight:600;cursor:pointer}.dot{display:inline-block;width:.8rem;height:.8rem;border-radius:50%;margin-right:.4rem}footer{text-align:center;color:var(--mut);padding:2rem;font-size:.85rem}`;
const page = (title, body, head = "") => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · NwebNotFound</title><style>${CSS}</style>${head}</head><body><nav><b>NwebNotFound</b><a href="/">Start</a><a href="/guestbook">Gästebuch</a><a href="/minecraft">Minecraft</a></nav><main>${body}</main><footer>© ${new Date().getFullYear()} Nils Weberruß · nwebnotfound.dev</footer></body></html>`;

const HOME = page("Start", `<h1>Hi, ich bin Nils 👋</h1><p class="mut">aka <b>NwebNotFound</b> – Informatik-Student an der TH Ulm.</p>
<div class="card"><h2>Über mich</h2><p>Ich studiere Informatik an der Technischen Hochschule Ulm und baue in meiner Freizeit Web- und Server-Projekte.</p><p class="ph">[Platzhalter: weitere Infos zu Interessen &amp; Skills folgen]</p></div>
<div class="card"><h2>Projekte</h2><ul><li><a href="/minecraft">Minecraft-Server</a> – in Vorbereitung</li><li><a href="/guestbook">Gästebuch</a> – diese Seite läuft auf Cloudflare Workers + D1</li></ul><p class="ph">[Platzhalter: weitere Projekte folgen]</p></div>
<div class="card"><h2>Kontakt</h2><p class="ph">[Platzhalter: Kontaktmöglichkeiten folgen]</p><p>Bis dahin: Hinterlass gern eine Nachricht im <a href="/guestbook">Gästebuch</a>.</p></div>`);

const GUEST = page("Gästebuch", `<h1>Gästebuch</h1><div class="card"><form id="f"><label>Name (max. 50)</label><input name="name" maxlength="50" required><label>Nachricht (max. 500)</label><textarea name="message" maxlength="500" rows="4" required></textarea><div class="cf-turnstile" data-sitekey="${SITEKEY}"></div><button>Eintragen</button> <span id="st" class="mut"></span></form></div><div id="list" class="mut">Lade Einträge…</div>
<script>
const e=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function load(){const r=await fetch('/api/guestbook');const d=await r.json();document.getElementById('list').innerHTML=d.entries.length?d.entries.map(x=>'<div class="card"><b>'+e(x.name)+'</b> <span class="mut">'+e(x.created_at)+' UTC</span><p>'+e(x.message).replace(/\\n/g,'<br>')+'</p></div>').join(''):'Noch keine Einträge – sei die/der Erste!';}
document.getElementById('f').onsubmit=async ev=>{ev.preventDefault();const st=document.getElementById('st');st.textContent='Sende…';const fd=new FormData(ev.target);const r=await fetch('/api/guestbook',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),message:fd.get('message'),token:fd.get('cf-turnstile-response')})});const d=await r.json();st.textContent=r.ok?'Danke!':(d.error||'Fehler');if(r.ok){ev.target.reset();}window.turnstile&&turnstile.reset();load();};
load();
</script>`, `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`);

const MC = page("Minecraft", `<h1>Minecraft-Server</h1>
<div class="card"><p style="font-size:1.3rem;margin:.2rem 0"><span id="dot" class="dot" style="background:#6b7280"></span><b id="state">Prüfe Status…</b></p>
<p id="motd" class="mut" style="font-style:italic"></p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem;margin:1rem 0">
<div class="card" style="margin:0"><div class="mut">Spieler</div><b id="pl" style="font-size:1.4rem">–</b><div style="height:6px;background:#0b0d12;border-radius:3px;margin-top:.4rem"><div id="bar" style="height:6px;width:0;background:var(--acc);border-radius:3px;transition:width .5s"></div></div></div>
<div class="card" style="margin:0"><div class="mut">Version</div><b id="ver" style="font-size:1.4rem">–</b></div>
<div class="card" style="margin:0"><div class="mut">Adresse</div><code>mc.nwebnotfound.dev</code> <button id="cp" style="padding:.2rem .6rem;font-size:.8rem">Kopieren</button></div></div>
<p id="names" class="mut"></p></div>
<p class="mut" style="font-size:.85rem">Aktualisiert sich automatisch alle 60 Sekunden · zuletzt: <span id="ts">–</span></p>
<script>
const $=id=>document.getElementById(id);
$('cp').onclick=()=>{navigator.clipboard.writeText('mc.nwebnotfound.dev');$('cp').textContent='Kopiert!';setTimeout(()=>$('cp').textContent='Kopieren',1500);};
function set(on,txt){$('dot').style.background=on?'#22c55e':'#ef4444';$('state').textContent=txt;}
async function load(){try{const d=await (await fetch('/api/mc-status')).json();
if(!d.online){set(false,d.error?'Status nicht abrufbar':'Offline');$('motd').textContent=d.error?'Bitte später nochmal versuchen.':'Der Server ist gerade nicht erreichbar.';$('pl').textContent='–';$('ver').textContent='–';$('bar').style.width='0';$('names').textContent='';}
else{set(true,'Online');$('motd').textContent=d.motd||'';const o=d.players.online??0,m=d.players.max??0;$('pl').textContent=o+' / '+m;$('bar').style.width=(m?Math.min(100,o/m*100):0)+'%';$('ver').textContent=d.version||'?';$('names').textContent=d.players.list&&d.players.list.length?'Online: '+d.players.list.join(', '):'';}
}catch(_){set(false,'Status nicht abrufbar');}
$('ts').textContent=new Date().toLocaleTimeString('de-DE');}
load();setInterval(load,60000);
</script>`);

const MC_HOST = "mc.nwebnotfound.dev";
async function mcStatus(ctx) {
  const cache = caches.default, key = new Request("https://nwebnotfound.dev/__cache/mc-status");
  const hit = await cache.match(key); if (hit) return hit;
  let out = null;
  try {
    const r = await fetch(`https://api.mcsrvstat.us/3/${MC_HOST}`, { headers: { "user-agent": "nwebnotfound.dev status page" } });
    if (r.ok) { const d = await r.json(); out = { online: !!d.online, players: { online: d.players?.online ?? 0, max: d.players?.max ?? 0, list: (d.players?.list || []).map(x => x.name || String(x)).slice(0, 50) }, version: d.version || null, motd: (d.motd?.clean || []).join(" ").trim() || null, source: "mcsrvstat.us" }; }
  } catch {}
  if (!out) try {
    const r = await fetch(`https://api.mcstatus.io/v2/status/java/${MC_HOST}`);
    if (r.ok) { const d = await r.json(); out = { online: !!d.online, players: { online: d.players?.online ?? 0, max: d.players?.max ?? 0, list: (d.players?.list || []).map(x => x.name_clean || x.name_raw).slice(0, 50) }, version: d.version?.name_clean || null, motd: (d.motd?.clean || "").trim() || null, source: "mcstatus.io" }; }
  } catch {}
  if (!out) out = { online: false, players: { online: 0, max: 0, list: [] }, version: null, motd: null, error: "Status-APIs nicht erreichbar" };
  out.host = MC_HOST; out.checked_at = new Date().toISOString();
  const res = new Response(JSON.stringify(out), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });
const html = (h) => new Response(h, { headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname === "www.nwebnotfound.dev") { url.hostname = "nwebnotfound.dev"; return Response.redirect(url.toString(), 301); }
    const p = url.pathname.replace(/\/$/, "") || "/";
    if (p === "/api/guestbook") {
      if (req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT name, message, created_at FROM entries ORDER BY id DESC LIMIT 50").all();
        return json({ entries: results });
      }
      if (req.method === "POST") {
        let b; try { b = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
        const name = String(b.name || "").trim(), message = String(b.message || "").trim();
        if (!name || name.length > 50 || !message || message.length > 500) return json({ error: "Name 1–50, Nachricht 1–500 Zeichen" }, 400);
        const fd = new FormData(); fd.append("secret", env.TURNSTILE_SECRET); fd.append("response", String(b.token || "")); fd.append("remoteip", req.headers.get("CF-Connecting-IP") || "");
        const v = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd })).json();
        if (!v.success) return json({ error: "Captcha fehlgeschlagen" }, 403);
        await env.DB.prepare("INSERT INTO entries (name, message) VALUES (?, ?)").bind(name, message).run();
        return json({ ok: true }, 201);
      }
      return json({ error: "Method not allowed" }, 405);
    }
    if (p === "/api/mc-status") return mcStatus(ctx);
    if (p === "/") return html(HOME);
    if (p === "/guestbook") return html(GUEST);
    if (p === "/minecraft") return html(MC);
    return new Response(page("404", "<h1>404 – Not Found</h1><p>Passend zum Namen 😉 <a href='/'>Zur Startseite</a></p>"), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
