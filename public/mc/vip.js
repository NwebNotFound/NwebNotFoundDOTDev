// VIP-Panel. Freitext immer über MC.E. Keine Inline-Styles. Profil-Link ist fest, nicht aus der API.
// Admin sieht alle Welten mit Besitzer und Verwaltung plus das Admin-Log; VIP/MVP nur eigene und
// eingeladene Welten. Aktionen laufen über die bestehende Queue (/api/mc-vip/worlds/...).
(() => {
  const { E, NF, get, post } = window.MC;
  const T = document.getElementById("vip");
  if (!T) return;
  const ICON = /^[a-z0-9_]{1,48}$/;
  const NAME = /^[A-Za-z0-9_]{1,16}$/;
  const COLOR = /^[0-9a-f]$/;
  const WID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const RANKL = { vip: "VIP", mvp: "MVP", builder: "Builder", admin: "Admin", default: "Spieler" };
  // Gleiche Liste wie LOG_ACTION im Worker, als Fallback wenn nur action ankommt.
  const ACTL = {
    create: "Welt erstellt", rename: "Welt umbenannt", start: "Welt gestartet", stop: "Welt gestoppt",
    settings: "Einstellungen geändert", set_visibility: "Sichtbarkeit geändert", invite: "Spieler eingeladen",
    uninvite: "Einladung entfernt", trust: "Vertrauensstufe geändert", addons: "Addons geändert", delete: "Welt gelöscht",
  };
  const slot = (id, big) => {
    const i = ICON.test(id) ? id : "paper";
    return `<span class="slot${big ? " big" : ""}"><img alt="" width="${big ? 40 : 28}" height="${big ? 40 : 28}" src="/mc-icon/v2/${i}"></span>`;
  };
  const up = (t) => {
    t = Math.max(0, Math.floor(+t || 0));
    const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
    return d ? d + " T " + h + " Std" : h ? h + " Std " + m + " Min" : m + " Min";
  };
  const badge = (rank, color) => RANKL[rank] && COLOR.test(color || "") ? `<span class="rk rk-${color}">${RANKL[rank]}</span>` : "";
  const note = (t) => (t || "").trim() ? `<p class="mut vip-note">${E(t)}</p>` : "";
  const perks = (list) => `<ul class="vip-perks">${(list || []).map((p) => `<li>${slot(p.icon)}<span><b>${E(p.title)}</b><span class="mut">${E(p.text)}</span></span></li>`).join("")}</ul>`;
  const cards = (cat) => `<div class="vip-ranks${Array.isArray(cat) && cat.length === 3 ? " is-three" : ""}">${(cat || []).map((c) => {
    const rk = c.rank === "mvp" || c.rank === "vip" || c.rank === "admin" ? c.rank : "";
    if (!rk) return "";
    return `<article class="g vip-card is-${rk}${c.yours ? " is-you" : ""}"><header><span class="vip-card-h">${slot(c.icon)}<h3 class="hub-h2">${E(c.label || RANKL[rk])}</h3></span>${c.yours ? '<span class="tag ts">Dein Rang</span>' : ""}</header>${perks(c.perks)}</article>`;
  }).join("")}</div>`;
  // Eine Weltzeile. Besitzer und Verwaltung nur, wenn der Worker sie mitgibt (Admin).
  const world = (s, manage) => {
    if (!s || typeof s !== "object" || !WID.test(s.id || "")) return "";
    const tag = s.online ? '<span class="tag ts">online</span>' : '<span class="tag tr">offline</span>';
    const max = s.max == null || s.max === "" || !Number.isFinite(+s.max) ? "" : " / " + NF(s.max);
    const tps = s.tps == null || s.tps === "" || !Number.isFinite(+s.tps) ? "" : " · " + NF(s.tps, 1) + " TPS";
    const owner = NAME.test(s.owner_name || "") ? s.owner_name : "";
    const vis = s.visibility === "private" ? "privat" : "für Freunde";
    const meta = [owner ? (s.owner ? "Deine Welt" : "Besitzer " + owner) : "", NF(s.players || 0) + max + " Spieler" + tps, vis].filter(Boolean).join(" · ");
    const info = (s.info || "").trim() ? `<p class="mut vip-world-info">${E(s.info)}</p>` : "";
    const acts = manage
      ? `<div class="vip-world-acts">${s.online ? "" : `<button class="btn sm sec" type="button" data-act="start" data-id="${s.id}">Starten</button>`}<button class="btn sm sec" type="button" data-act="visibility" data-id="${s.id}" data-vis="${s.visibility === "private" ? "friends" : "private"}">${s.visibility === "private" ? "Auf Freunde" : "Auf privat"}</button></div>`
      : "";
    return `<article class="g vip-world${manage ? " vip-aw" : ""}">${slot(s.online ? "grass_block" : "barrier")}<div><b>${E(s.label) || "VIP-Welt"}</b>${tag}<p class="mut vip-world-meta">${E(meta)}</p>${info}${acts}</div></article>`;
  };
  const worlds = (w) => {
    const head = `<section class="vip-block" id="vip-worlds"><h2 class="hub-h2">VIP-Welten</h2>`;
    const slots = w && !w.placeholder && Array.isArray(w.slots) ? w.slots : [];
    const html = slots.map((s) => world(s, false)).filter(Boolean).join("");
    if (!html) return `${head}<div class="g vip-soon">${slot("barrier", true)}<p class="tag tw">bald verfügbar</p><p class="mut">Bis zu drei VIP-Welten sind geplant. Sobald der Server sie meldet, steht hier der Status.</p></div></section>`;
    return `${head}<div class="vip-worlds">${html}</div></section>`;
  };
  const adminWorlds = (w) => {
    const slots = w && Array.isArray(w.slots) ? w.slots : [];
    const head = `<section class="vip-block" id="vip-admin-worlds"><h2 class="hub-h2">Alle VIP-Welten</h2>`;
    const html = slots.map((s) => world(s, true)).filter(Boolean).join("");
    if (!html) return `${head}<div class="g vip-soon">${slot("barrier", true)}<p class="tag tw">keine Welten</p><p class="mut">Der Server hat noch keine VIP-Welten gemeldet.</p></div></section>`;
    return `${head}<div class="vip-aworlds">${html}</div></section>`;
  };
  const when = (iso) => {
    if (!iso) return "–";
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–";
  };
  const adminLog = (l) => {
    const head = `<section class="vip-block" id="vip-admin-log"><h2 class="hub-h2">Admin-Log</h2>`;
    const list = l && Array.isArray(l.entries) ? l.entries : [];
    if (!list.length) return `${head}<div class="g vip-soon">${slot("writable_book", true)}<p class="tag tw">noch leer</p><p class="mut">Sobald ein Admin eine fremde Welt startet oder ihre Sichtbarkeit ändert, steht der Eintrag hier.</p></div></section>`;
    const rows = list.map((e) => {
      const label = ACTL[e.action] || (typeof e.action_label === "string" ? e.action_label : "Aktion");
      const admin = NAME.test(e.admin_name || "") ? e.admin_name : "";
      const owner = NAME.test(e.owner_name || "") ? e.owner_name : "";
      const who = [admin ? "Admin " + admin : "Admin", owner ? "Besitzer " + owner : ""].filter(Boolean).join(" · ");
      const detail = (e.detail || "").trim() ? `<span class="mut">${E(e.detail)}</span>` : "";
      return `<li><span class="when tnum">${E(when(e.at))}</span><span class="what"><b>${E(label)}</b>${detail}</span><span class="mut who">${E(who)}</span></li>`;
    }).join("");
    return `${head}<ul class="vip-log">${rows}</ul></section>`;
  };
  const cell = (icon, k, v) => `<div class="g vip-stat">${slot(icon)}<span class="k">${k}</span><b class="v tnum">${v}</b></div>`;
  const say = (msg, bad) => {
    const n = document.getElementById("vip-say");
    if (!n) return;
    n.textContent = msg || "";
    n.className = "vip-say" + (msg ? " is-on" : "") + (bad ? " is-bad" : "");
  };
  const panel = (d) => {
    const p = d.player || {};
    const admin = d.admin === true;
    const name = NAME.test(p.name || "") ? p.name : "";
    const head = name ? `<span class="slot big"><img alt="" width="40" height="40" src="/mc-head/${encodeURIComponent(name)}/64?v=5"></span>` : slot("player_head", true);
    const st = d.stats || {};
    const bal = st.money == null ? "–" : NF(st.money) + " CP";
    const pub = name ? `<a class="btn sec" href="/spieler/${encodeURIComponent(name)}">Öffentliches Profil</a>` : "";
    const abadge = admin ? '<span class="tag tl vip-admin-tag">Admin-Ansicht</span>' : "";
    return `<div class="g vip-me">${head}<div><p class="eyb">Dein Rang ${abadge}</p><h2 class="hub-h2">${E(name || "Spieler")} ${badge(p.rank, p.color)}</h2><p class="vip-acts"><a class="btn" href="/profile">Zum Profil</a>${pub}</p></div></div><p class="vip-say" id="vip-say" role="status" aria-live="polite"></p>${admin ? adminWorlds(d.worlds) + adminLog(d.admin_log) : ""}<h2 class="hub-h2">Vorteile</h2>${cards(d.catalog)}${note(d.note)}${admin ? "" : worlds(d.worlds)}<section class="vip-block" id="vip-stats"><h2 class="hub-h2">Deine Stats</h2><div class="vip-stats">${cell("gold_ingot", "Kontostand", bal)}${cell("clock", "Spielzeit", st.playtime == null ? "–" : up(st.playtime))}${cell("iron_sword", "Spieler-Kills", st.kills == null ? "–" : NF(st.kills))}${cell("skeleton_skull", "Tode", st.deaths == null ? "–" : NF(st.deaths))}${cell("iron_pickaxe", "Blöcke", st.blocks_mined == null ? "–" : NF(st.blocks_mined))}</div></section>`;
  };
  const gate = (d) => {
    const raw = location.pathname + location.search + location.hash;
    const rel = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !raw.includes("://") ? raw : "/vip";
    const login = "https://nwebnotfound.dev/auth/discord/login?next=" + encodeURIComponent(rel);
    let msg;
    if (d.reason === "login") msg = `<p class="mut">Melde dich mit Discord an. Das Panel gibt es für verknüpfte Spieler mit dem Rang VIP, MVP oder Admin.</p><p class="vip-acts"><a class="btn discord" href="${login}">Mit Discord anmelden</a></p>`;
    else if (d.reason === "link") msg = `<p class="mut">Verknüpfe deinen Minecraft-Account im Discord mit <code>/link</code> und bestätige ihn. Danach prüft diese Seite deinen Rang.</p><p class="vip-acts"><a class="btn sec" href="/profile">Zum Profil</a></p>`;
    else if (d.reason === "error") msg = `<p class="mut">Das Panel konnte nicht geladen werden. Versuch es gleich noch einmal.</p>`;
    else {
      const own = d.own_rank && RANKL[d.own_rank.rank] ? " Dein Rang ist " + E(RANKL[d.own_rank.rank]) + "." : "";
      msg = `<p class="mut">Das Panel ist für die Ränge VIP, MVP und Admin.${own} Builder und Spieler sehen die Übersicht, nicht das eigene Panel.</p><p class="vip-acts"><a class="btn sec" href="/profile">Zum Profil</a></p>`;
    }
    return `<div class="vip-gate">${msg}</div><h2 class="hub-h2">Vorteile</h2>${cards(d.catalog)}${note(d.note)}${worlds(null)}`;
  };
  const rid = () => {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch { /* Fallback unten */ }
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  };
  const ERR = { not_trusted: "Du darfst diese Welt nicht starten.", not_owner: "Du darfst diese Welt nicht ändern.", no_rank: "Der Besitzer hat keinen VIP-Rang mehr.", busy: "Für diese Welt läuft schon ein Auftrag.", not_linked: "Dein Minecraft-Account ist nicht verknüpft." };
  const run = async (btn) => {
    const id = btn.getAttribute("data-id") || "";
    const kind = btn.getAttribute("data-act");
    if (!WID.test(id) || (kind !== "start" && kind !== "visibility")) return;
    const path = "/api/mc-vip/worlds/" + encodeURIComponent(id) + (kind === "start" ? "/start" : "/visibility");
    const body = kind === "start" ? { request_id: rid() } : { request_id: rid(), visibility: btn.getAttribute("data-vis") === "private" ? "private" : "friends" };
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sende…";
    let r;
    try { r = await post(path, body); } catch { r = { ok: false, status: 0, j: {} }; }
    btn.disabled = false;
    btn.textContent = label;
    if (r.ok) {
      await load();
      say(kind === "start" ? "Startauftrag an den Server gesendet. Der Status aktualisiert sich, sobald die Welt läuft." : "Sichtbarkeit geändert. Die Welt übernimmt es beim nächsten Abgleich.", false);
    } else if (r.status === 429) {
      say("Zu viele Aktionen in der letzten Stunde. Bitte später erneut versuchen.", true);
    } else {
      const why = (r.j && (r.j.reason || r.j.error)) || "";
      say(ERR[why] || (why ? String(why).slice(0, 120) : "Die Aktion ist fehlgeschlagen. Versuch es gleich noch einmal."), true);
    }
  };
  T.addEventListener("click", (ev) => {
    const btn = ev.target.closest ? ev.target.closest("button[data-act]") : null;
    if (!btn || btn.disabled || !T.contains(btn)) return;
    ev.preventDefault();
    run(btn);
  });
  const load = async () => {
    let d;
    try { d = await get("/api/mc-vip"); } catch { d = { access: false, reason: "error", catalog: [], note: "" }; }
    T.innerHTML = d && d.access ? panel(d) : gate(d || {});
  };
  load();
})();
