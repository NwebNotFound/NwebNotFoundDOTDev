// Feedback (Bug/Idee): nur eingeloggte Discord-User mit verifiziertem MC-Account + Server-Rolle.
// Schutz: Turnstile, Origin-Check, 3 Einreichungen/Tag pro Discord-Account. Keine IP-Speicherung.
// Admin: GET/PATCH mit "Authorization: Bearer <FEEDBACK_ADMIN_TOKEN>" (nur aus env, wird nie ausgegeben).
const TYPES = ["bug", "idea"], STATUS = ["open", "in_progress", "done", "rejected"], DAY = 864e5, LIMIT = 3;
const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);
const iso = (t) => (t ? new Date(t).toISOString() : null);

export function makeFeedback({ json, getUser, safeEq, MAIN, MCD }) {
  const originOk = (req) => { const o = req.headers.get("origin"); if (!o) return false; try { const h = new URL(o).hostname; return h === MAIN || h === MCD; } catch { return false; } };
  const adminOk = (req, env) => { const a = req.headers.get("authorization") || ""; const t = a.startsWith("Bearer ") ? a.slice(7) : ""; return !!env.FEEDBACK_ADMIN_TOKEN && t.length > 0 && safeEq(t, env.FEEDBACK_ADMIN_TOKEN); };
  const linkFor = (env, id) => env.DB.prepare("SELECT mc_name, mc_uuid, has_role, verified FROM mc_links WHERE discord_id = ?").bind(id).first().catch(() => null);
  const NOSTORE = { "cache-control": "private, no-store" };

  async function who(req, env) {
    const user = await getUser(req, env); if (!user) return { user: null };
    const link = await linkFor(env, user.id);
    return { user, link, can: !!(link && link.verified && link.has_role) };
  }
  async function used(env, did) { const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE discord_id = ? AND created_at > ?").bind(did, Date.now() - DAY).first(); return r?.n || 0; }

  async function me(req, env) {
    const w = await who(req, env);
    if (!w.user) return json({ logged_in: false }, 200, NOSTORE);
    const mine = (await env.DB.prepare("SELECT id, type, title, status, created_at FROM feedback WHERE discord_id = ? ORDER BY created_at DESC LIMIT 10").bind(w.user.id).all()).results.map((r) => ({ ...r, created_at: iso(r.created_at) }));
    return json({ logged_in: true, name: w.user.name, mc_name: w.link?.mc_name || null, linked: !!w.link?.verified, has_role: !!w.link?.has_role, can: w.can, remaining: Math.max(0, LIMIT - (await used(env, w.user.id))), mine }, 200, NOSTORE);
  }

  async function submit(req, env) {
    if (!originOk(req)) return json({ error: "Ungültige Herkunft" }, 403);
    const w = await who(req, env);
    if (!w.user) return json({ error: "Bitte mit Discord anmelden" }, 401);
    if (!w.can) return json({ error: "Nur für verifizierte Spieler mit Server-Rolle" }, 403);
    let b; try { b = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
    const type = String(b?.type || ""), title = clip(b?.title, 100), body = clip(b?.body, 2000), location = clip(b?.location, 120) || null;
    if (!TYPES.includes(type)) return json({ error: "Typ muss bug oder idea sein" }, 400);
    if (title.length < 3) return json({ error: "Titel: 3–100 Zeichen" }, 400);
    if (body.length < 10) return json({ error: "Beschreibung: 10–2000 Zeichen" }, 400);
    if ((await used(env, w.user.id)) >= LIMIT) return json({ error: "Limit erreicht: 3 Einreichungen pro Tag" }, 429);
    if (!env.TURNSTILE_SECRET) return json({ error: "Captcha nicht konfiguriert" }, 503);
    const fd = new FormData(); fd.append("secret", env.TURNSTILE_SECRET); fd.append("response", String(b?.token || ""));
    let v = {}; try { v = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd })).json(); } catch {}
    if (!v.success) return json({ error: "Captcha fehlgeschlagen" }, 403);
    const now = Date.now();
    const r = await env.DB.prepare("INSERT INTO feedback (type, title, body, location, discord_id, mc_name, mc_uuid, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)").bind(type, title, body, location, w.user.id, w.link.mc_name, w.link.mc_uuid, now, now).run();
    return json({ ok: true, id: r.meta?.last_row_id ?? null, remaining: Math.max(0, LIMIT - (await used(env, w.user.id))) }, 201);
  }

  async function adminList(req, env, url) {
    if (!adminOk(req, env)) return json({ error: "unauthorized" }, 401);
    const st = url.searchParams.get("status"), ty = url.searchParams.get("type"), lim = Math.min(200, Math.max(1, +url.searchParams.get("limit") || 50));
    const w = [], a = []; if (STATUS.includes(st)) { w.push("status = ?"); a.push(st); } if (TYPES.includes(ty)) { w.push("type = ?"); a.push(ty); }
    const { results } = await env.DB.prepare(`SELECT id, type, title, body, location, mc_name, status, admin_note, created_at, updated_at FROM feedback ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ?`).bind(...a, lim).all();
    return json({ items: results.map((r) => ({ ...r, created_at: iso(r.created_at), updated_at: iso(r.updated_at) })) }, 200, NOSTORE);
  }
  async function adminPatch(req, env, id) {
    if (!adminOk(req, env)) return json({ error: "unauthorized" }, 401);
    if (!/^\d{1,10}$/.test(id)) return json({ error: "ungültige id" }, 400);
    let b; try { b = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const sets = [], a = [];
    if (b?.status !== undefined) { if (!STATUS.includes(b.status)) return json({ error: "status: " + STATUS.join("|") }, 400); sets.push("status = ?"); a.push(b.status); }
    if (b?.admin_note !== undefined) { sets.push("admin_note = ?"); a.push(clip(b.admin_note, 500) || null); }
    if (!sets.length) return json({ error: "nichts zu ändern" }, 400);
    const r = await env.DB.prepare(`UPDATE feedback SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).bind(...a, Date.now(), +id).run();
    return r.meta?.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
  }

  return {
    route(p, req, env, url) {
      if (p === "/api/feedback") { if (req.method === "GET") return me(req, env); if (req.method === "POST") return submit(req, env); return json({ error: "Method not allowed" }, 405); }
      if (p === "/api/feedback/admin" && req.method === "GET") return adminList(req, env, url);
      const m = p.match(/^\/api\/feedback\/admin\/([^/]+)$/); if (m && req.method === "PATCH") return adminPatch(req, env, m[1]);
      if (p.startsWith("/api/feedback")) return json({ error: "not found" }, 404);
      return null;
    },
  };
}

export const feedbackBody = (SITEKEY, MAIN) => `<section class="sec"><div class="wrap" style="max-width:720px"><p class="eyebrow">Survival</p><h1 class="h-l">Feedback</h1><p class="lead">Bug gefunden oder eine Idee für den Server? Schreib es uns.</p><div id="fbc" aria-live="polite"><p class="mut">Lade …</p></div></div></section>
<script>addEventListener('DOMContentLoaded',async()=>{const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const C=document.getElementById('fbc');
const ST={open:'offen',in_progress:'in Arbeit',done:'erledigt',rejected:'abgelehnt'};
const d=await fetch('/api/feedback',{credentials:'include'}).then(r=>r.json()).catch(()=>({}));
if(!d.logged_in){C.innerHTML='<div class="card"><h3>Bitte anmelden</h3><p class="mut">Feedback geht nur mit deinem Discord-Login.</p><a class="btn" href="https://${MAIN}/auth/discord/login?next='+encodeURIComponent(location.href)+'">Mit Discord anmelden</a></div>';return}
if(!d.can){C.innerHTML='<div class="card"><h3>'+(d.linked?'Server-Rolle fehlt':'Minecraft noch nicht verknüpft')+'</h3><p class="mut">Feedback können nur verifizierte Spieler mit Server-Rolle senden.</p><a class="btn" href="/profile">Zum Profil</a></div>';return}
const mine=(d.mine||[]).length?'<div class="card"><h3>Deine Einreichungen</h3><ul class="plist">'+d.mine.map(x=>'<li class="po"><div class="pom"><b>'+E(x.title)+'</b><span class="mut">'+(x.type==='bug'?'Bug':'Idee')+' · '+E(ST[x.status]||x.status)+' · '+new Date(x.created_at).toLocaleDateString('de-DE')+'</span></div></li>').join('')+'</ul></div>':'';
C.innerHTML='<div class="card"><form id="fbf" class="fbf"><p class="mut" style="margin-top:0">Angemeldet als <b>'+E(d.mc_name)+'</b> · noch '+d.remaining+' von 3 heute</p>'+
'<fieldset class="fbt"><legend>Art</legend><label><input type="radio" name="type" value="bug" checked> Bug</label><label><input type="radio" name="type" value="idea"> Idee</label></fieldset>'+
'<label>Titel<input name="title" required minlength="3" maxlength="100" placeholder="Kurz und knapp"></label>'+
'<label>Beschreibung<textarea name="body" required minlength="10" maxlength="2000" rows="6" placeholder="Was ist passiert / was wünschst du dir?"></textarea></label>'+
'<label>Wo? <span class="mut">(optional)</span><input name="location" maxlength="120" placeholder="z. B. Survival, /markt, Spawn x=120 z=-40"></label>'+
'<div class="cf-turnstile" data-sitekey="${SITEKEY}" data-theme="dark"></div><button class="btn" type="submit"'+(d.remaining?'':' disabled')+'>Absenden</button><p id="fbs" class="mut" role="status"></p></form></div>'+mine;
window.turnstile&&turnstile.render&&!C.querySelector('.cf-turnstile iframe')&&setTimeout(()=>{try{if(!C.querySelector('.cf-turnstile iframe'))turnstile.render('.cf-turnstile')}catch{}},50);
document.getElementById('fbf').onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.target),s=document.getElementById('fbs');s.textContent='Sende …';
const r=await fetch('/api/feedback',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({type:f.get('type'),title:f.get('title'),body:f.get('body'),location:f.get('location'),token:f.get('cf-turnstile-response')})});
const j=await r.json().catch(()=>({}));s.textContent=r.ok?'Danke! Dein Feedback ist angekommen.':(j.error||'Fehler');if(r.ok){ev.target.reset();setTimeout(()=>location.reload(),1200)}window.turnstile&&turnstile.reset()}})</script>`;
