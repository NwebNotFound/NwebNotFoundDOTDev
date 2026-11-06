// VIP-Panel v2. Freitext immer über MC.E. Keine Inline-Styles. Profil-Link ist fest, nicht aus der API.
// Owner/Admin verwalten eine Welt direkt auf der Karte (Einstellungen, Mitglieder, Umbenennen, Löschen).
// Trusted und eingeladene Spieler sehen dieselbe Karte, dürfen aber nur starten.
// Alle Aktionen laufen über die bestehende Queue (/api/mc-vip/worlds/...).
(() => {
  const { E, NF, get } = window.MC;
  const T = document.getElementById("vip");
  if (!T) return;
  const ICON = /^[a-z0-9_]{1,48}$/;
  const NAME = /^[A-Za-z0-9_]{1,16}$/;
  const COLOR = /^[0-9a-f]$/;
  // Anzeige akzeptiert jede Blob-Welt-ID (nur harmlose Zeichen), Aktionen nur echte UUIDs.
  const WID = /^[A-Za-z0-9_-]{1,64}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const WNAME = /^[A-Za-z0-9_-]{3,24}$/;
  const RANKL = { vip: "VIP", mvp: "MVP", builder: "Builder", admin: "Admin", default: "Spieler" };
  const RLIMIT = { vip: 1, mvp: 3, admin: 3 };
  // Gleiche Liste wie LOG_ACTION im Worker, als Fallback wenn nur action ankommt.
  const ACTL = {
    create: "Welt erstellt", rename: "Welt umbenannt", start: "Welt gestartet", stop: "Welt gestoppt",
    settings: "Einstellungen geändert", set_visibility: "Sichtbarkeit geändert", invite: "Spieler eingeladen",
    uninvite: "Einladung entfernt", trust: "Vertrauensstufe geändert", addons: "Addons geändert", delete: "Welt gelöscht",
  };
  const TYPE = {
    normal: { label: "Normal", icon: "grass_block" },
    flat: { label: "Flach", icon: "sandstone" },
    void: { label: "Leer", icon: "glass" },
  };
  const GM = [["survival", "Survival"], ["creative", "Kreativ"], ["adventure", "Abenteuer"]];
  const DIFF = [["peaceful", "Friedlich"], ["easy", "Leicht"], ["normal", "Normal"], ["hard", "Schwer"]];
  const TOGGLES = [
    ["pvp", "iron_sword", "PvP", "Spieler können sich schlagen"],
    ["keepInventory", "chest", "Inventar behalten", "Nach dem Tod bleibt alles"],
    ["mobGriefing", "creeper_head", "Mob-Griefing", "Creeper sprengen Blöcke"],
    ["doDaylightCycle", "clock", "Tageszyklus", "Sonne und Mond wandern"],
  ];
  const slot = (id, big) => {
    const i = ICON.test(id) ? id : "paper";
    return `<span class="slot${big ? " big" : ""}"><img loading="lazy" alt="" width="${big ? 40 : 28}" height="${big ? 40 : 28}" src="/mc-icon/v2/${i}"></span>`;
  };
  const ico = (id, size) => {
    const i = ICON.test(id) ? id : "paper";
    return `<img loading="lazy" alt="" width="${size}" height="${size}" src="/mc-icon/v2/${i}">`;
  };
  const head = (name, size, cls) => NAME.test(name || "")
    ? `<img${cls ? ` class="${cls}"` : ""} alt="" width="${size}" height="${size}" src="/mc-head/${encodeURIComponent(name)}/${size}">`
    : slot("player_head", size > 40);
  const up = (t) => {
    t = Math.max(0, Math.floor(+t || 0));
    const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
    return d ? d + " T " + h + " Std" : h ? h + " Std " + m + " Min" : m + " Min";
  };
  const badge = (rank, color) => RANKL[rank] && COLOR.test(color || "") ? `<span class="rk rk-${color}">${RANKL[rank]}</span>` : "";
  const note = (t) => (t || "").trim() ? `<p class="mut vip-note">${E(t)}</p>` : "";
  const pips = (on, total) => {
    const n = Math.max(0, Math.min(12, Math.floor(+total || 0)));
    const k = Math.max(0, Math.min(n, Math.floor(+on || 0)));
    return `<span class="v2-pips" aria-label="${NF(k)} von ${NF(n)} Plätzen belegt">${Array.from({ length: n }, (_, i) => `<i${i < k ? ' class="on"' : ""}></i>`).join("")}</span>`;
  };
  // Rang-Karten mit Platz-Pips: die Zahl kommt aus limits.worlds, nicht aus einer zweiten Liste im Browser.
  const cards = (cat, limits) => {
    const lim = limits && limits.worlds && typeof limits.worlds === "object" ? limits.worlds : RLIMIT;
    return `<div class="vip-ranks${Array.isArray(cat) && cat.length === 3 ? " is-three" : ""}">${(cat || []).map((c) => {
      const rk = c.rank === "mvp" || c.rank === "vip" || c.rank === "admin" ? c.rank : "";
      if (!rk) return "";
      const n = Number.isFinite(+lim[rk]) ? Math.floor(+lim[rk]) : RLIMIT[rk] || 1;
      return `<article class="g vip-card is-${rk}${c.yours ? " is-you" : ""}"><header><span class="vip-card-h">${slot(c.icon)}<h3 class="hub-h2">${E(c.label || RANKL[rk])}</h3></span>${c.yours ? '<span class="tag ts">Dein Rang</span>' : ""}</header><div class="v2-slots" aria-label="${n} ${n === 1 ? "Welt" : "Welten"}">${Array.from({ length: n }, () => slot("grass_block")).join("")}</div><ul class="vip-perks">${(c.perks || []).map((p) => `<li>${slot(p.icon)}<span><b>${E(p.title)}</b><span class="mut">${E(p.text)}</span></span></li>`).join("")}</ul></article>`;
    }).join("")}</div>`;
  };
  const seg = (label, key, cur, opts) => `<div class="v2-row"><span class="v2-lab">${E(label)}</span><div class="seg" role="group" aria-label="${E(label)}">${opts.map(([v, t]) => `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${cur === v}">${t}</button>`).join("")}</div></div>`;
  const settingsPane = (s) => {
    const st = s.settings || {};
    const vis = s.visibility === "private" ? "private" : "friends";
    return `<section class="v2-pane" aria-label="Einstellungen"><h3 class="v2-h3">Einstellungen</h3>${seg("Sichtbarkeit", "visibility", vis, [["friends", "Für Freunde"], ["private", "Privat"]])}<p class="mut v2-hint">Freunde aus deiner Freundesliste dürfen rein. Privat: nur eingeladene Spieler.</p>${seg("Spielmodus", "gamemode", st.gamemode, GM)}${seg("Schwierigkeit", "difficulty", st.difficulty, DIFF)}<ul class="v2-toggles">${TOGGLES.map(([k, icon, title, text]) => {
      const on = st[k] === true;
      return `<li>${slot(icon)}<span><b>${E(title)}</b><span class="mut">${E(text)}</span></span><button class="v2-tgl" type="button" role="switch" data-set="${k}" data-val="${on ? "false" : "true"}" aria-checked="${on}" aria-label="${E(title)}"></button></li>`;
    }).join("")}</ul><div class="v2-save"><button class="btn" type="button" data-save="${E(s.id)}" disabled>Änderungen speichern</button><span class="mut v2-hint">Regeln werden zusammen gesendet.</span></div></section>`;
  };
  const membersPane = (s) => {
    const list = (Array.isArray(s.members) ? s.members : []).filter((m) => NAME.test(m && m.name || ""));
    const rows = list.map((m) => {
      const trusted = m.role === "trusted";
      return `<li>${head(m.name, 32, "v2-mhead")}<span class="v2-mname"><b>${E(m.name)}</b><span class="mut">${trusted ? "darf starten" : "darf mitspielen"}</span></span><div class="seg v2-role" role="group" aria-label="Rolle von ${E(m.name)}"><button type="button" data-act="trust" data-id="${E(s.id)}" data-name="${E(m.name)}" data-role="member" aria-pressed="${!trusted}">Mitglied</button><button type="button" data-act="trust" data-id="${E(s.id)}" data-name="${E(m.name)}" data-role="trusted" aria-pressed="${trusted}">Vertraut</button></div><button class="v2-icbtn v2-x" type="button" data-act="uninvite" data-id="${E(s.id)}" data-name="${E(m.name)}" aria-label="${E(m.name)} entfernen">×</button></li>`;
    }).join("");
    return `<section class="v2-pane" aria-label="Mitglieder"><h3 class="v2-h3">Mitglieder <span class="mut v2-count">${NF(list.length)} / 12</span></h3><ul class="v2-members">${rows || '<li class="v2-empty"><span class="mut">Noch niemand eingeladen.</span></li>'}</ul><form class="v2-invite" data-id="${E(s.id)}"><div class="field"><label for="inv-${E(s.id)}">Spieler einladen</label><input id="inv-${E(s.id)}" name="name" placeholder="Minecraft-Name" autocomplete="off" maxlength="16" pattern="[A-Za-z0-9_]{1,16}" required></div><button class="btn" type="submit">Einladen</button></form><p class="mut v2-hint">Vertraut = darf die Welt starten. Verwalten, einladen und löschen kannst nur du.</p></section>`;
  };
  const renameForm = (s) => `<form class="v2-rename" id="rn-${E(s.id)}" data-id="${E(s.id)}" hidden><div class="field"><label for="rn-in-${E(s.id)}">Neuer Name</label><input id="rn-in-${E(s.id)}" name="name" value="${E(s.label)}" maxlength="24" minlength="3" pattern="[A-Za-z0-9_-]{3,24}" autocomplete="off" required></div><button class="btn sm" type="submit">Umbenennen</button></form>`;
  const deleteForm = (s) => `<form class="v2-delconfirm" id="dc-${E(s.id)}" data-id="${E(s.id)}" data-name="${E(s.label)}" hidden><div class="field"><label for="dc-in-${E(s.id)}">Zum Löschen <b>${E(s.label)}</b> eintippen</label><input id="dc-in-${E(s.id)}" name="confirm" autocomplete="off" placeholder="${E(s.label)}" maxlength="24" required></div><button class="btn danger" type="submit">Endgültig löschen</button><p class="mut v2-hint">Löschen lässt sich nicht rückgängig machen. Die Welt und ihre Einstellungen sind danach weg.</p></form>`;
  // Eine Weltkarte. Verwalten nur für Owner/Admin; trusted und Mitglieder sehen Starten.
  const world = (s, opts = {}) => {
    if (!s || typeof s !== "object" || !WID.test(s.id || "")) return "";
    const online = s.online === true;
    const uuid = UUID.test(s.id);
    const typ = TYPE[s.type] || TYPE.normal;
    const max = s.max == null || s.max === "" || !Number.isFinite(+s.max) ? "" : " / " + NF(s.max);
    const tps = s.tps == null || s.tps === "" || !Number.isFinite(+s.tps) ? "" : " · " + NF(s.tps, 1) + " TPS";
    const meta = [
      online ? '<span class="tag ts"><span class="dot v2-live"></span>online</span>' : '<span class="tag tr">offline</span>',
      NF(s.players || 0) + max + " Spieler" + tps,
      E(typ.label),
      s.visibility === "private" ? "privat" : "für Freunde",
    ];
    if (opts.admin) meta.push(s.owner ? "Deine Welt" : s.owner_name ? "Besitzer " + E(s.owner_name) : "Besitzer unbekannt");
    else if (s.invited) meta.push(s.owner_name ? "von " + E(s.owner_name) : "eingeladen", s.role === "trusted" ? 'du bist <b class="v2-trust">vertraut</b>' : "du bist Mitglied");
    const info = (s.info || "").trim() ? `<p class="mut v2-hint">${E(s.info)}</p>` : "";
    const acts = [];
    if (uuid && s.can_start) acts.push(`<button class="btn sm${online ? " sec" : ""}" type="button" data-act="${online ? "stop" : "start"}" data-id="${E(s.id)}">${online ? "Stoppen" : "Starten"}</button>`);
    if (uuid && s.can_manage) acts.push(`<button class="btn sm sec v2-more" type="button" data-manage="${E(s.id)}" aria-expanded="true" aria-controls="wb-${E(s.id)}"><span class="v2-more-t">Schließen</span> <span class="arrow">›</span></button>`);
    if (online) acts.push(`<span class="chip v2-join">${ico("ender_pearl", 16)}<code>/vw join ${E(s.label)}</code></span>`);
    const manage = uuid && s.can_manage;
    const body = manage ? `<div class="v2-wbody" id="wb-${E(s.id)}">${settingsPane(s)}${membersPane(s)}</div><footer class="v2-wfoot"><span class="mut v2-hint">Änderungen laufen über den Server, meist in ein paar Sekunden.</span><button class="btn sm ghost v2-danger" type="button" data-del="${E(s.id)}" aria-controls="dc-${E(s.id)}" aria-expanded="false">Welt löschen…</button></footer>${deleteForm(s)}` : "";
    return `<article class="g v2-world${online ? " is-on" : ""}${manage ? " is-open" : " v2-guest"}${opts.extra ? " is-extra" : ""}" data-wid="${E(s.id)}"><header class="v2-wh">${slot(typ.icon, true)}<div class="v2-wt"><b class="v2-wname">${E(s.label) || "VIP-Welt"}${manage && uuid ? `<button class="v2-icbtn" type="button" data-rename="${E(s.id)}" aria-label="Umbenennen" aria-controls="rn-${E(s.id)}" aria-expanded="false">${ico("name_tag", 16)}</button>` : ""}</b><p class="mut v2-wmeta">${meta.join(" · ")}</p>${info}${manage && uuid ? renameForm(s) : ""}</div><div class="v2-wacts">${acts.join("")}</div></header>${body}</article>`;
  };
  const createCard = () => `<article class="v2-free"><span class="slot big v2-plus" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 5 5"><rect x="2" y="0" width="1" height="5" fill="currentColor"/><rect x="0" y="2" width="5" height="1" fill="currentColor"/></svg></span><div class="v2-free-in"><b>Freier Platz</b><p class="mut">Leg deine nächste Welt an. Name 3–24 Zeichen, nur Buchstaben, Zahlen, - und _.</p><form class="v2-create"><div class="field"><label for="v2-nm">Name</label><input id="v2-nm" name="name" placeholder="z. B. Kirschtal" autocomplete="off" maxlength="24" minlength="3" pattern="[A-Za-z0-9_-]{3,24}" required></div><div class="field"><span class="v2-flab">Art</span><div class="v2-types" role="radiogroup" aria-label="Weltart">${Object.entries(TYPE).map(([k, v], i) => `<button type="button" role="radio" data-type="${k}" aria-checked="${i === 0}">${ico(v.icon, 28)}${v.label}</button>`).join("")}</div></div><button class="btn" type="submit">Welt anlegen <span class="arrow">›</span></button></form></div></article>`;
  const full = (max) => `<div class="v2-full g">${pips(max, max)}<p><b>Dein Platz ist belegt.</b> <span class="mut">${max === 1 ? "VIP hat eine Welt." : "Du hast alle " + NF(max) + " Welten."} Für eine neue Welt lösche erst eine alte.</span></p></div>`;
  const ownSection = (w, max, admin) => {
    const all = w && Array.isArray(w.slots) ? w.slots : [];
    const own = all.filter((s) => s && s.owner === true);
    const mine = w && Number.isFinite(+w.mine) ? Math.max(own.length, Math.floor(+w.mine)) : own.length;
    const invited = all.filter((s) => s && s.owner !== true && s.invited === true);
    const ownHtml = own.map((s) => world(s, { admin })).filter(Boolean).join("");
    const invitedHtml = invited.map((s) => world(s, {})).filter(Boolean).join("");
    const add = mine < max ? createCard() : full(max);
    const empty = ownHtml ? "" : `<p class="mut v2-hint">Sobald der Server deine Welt meldet, steht hier ihr Status.</p>`;
    // Eingeladene Welten stehen wie im Mockup in einem eigenen Block, damit "gehört mir" und
    // "bin eingeladen" nicht in einer Liste zusammenfallen.
    const invitedBlock = invitedHtml
      ? `<section class="vip-block" id="v2-invited"><div class="vip-head"><div><p class="eyb">Eingeladen</p><h2 class="hub-h2">Welten von Freunden</h2></div></div><div class="v2-wlist">${invitedHtml}</div></section>`
      : "";
    return `<section class="vip-block" id="${admin ? "vip-admin-worlds" : "v2-worlds"}"><div class="vip-head v2-head-row"><div><p class="eyb">${admin ? "Verwaltung" : "Verwalten"}</p><h2 class="hub-h2">${admin ? "Alle VIP-Welten" : "Deine Welten"}</h2></div><span class="mut vip-head-n">${NF(mine)} von ${NF(max)} belegt</span></div><div class="v2-wlist">${ownHtml}${empty}${add}</div></section>${invitedBlock}`;
  };
  const ADMIN_PAGE = 12;
  const adminWorlds = (w) => {
    const slots = w && Array.isArray(w.slots) ? w.slots : [];
    const head = `<section class="vip-block" id="vip-admin-worlds"><div class="vip-head"><div><p class="eyb">Verwaltung</p><h2 class="hub-h2">Alle VIP-Welten</h2></div></div>`;
    const html = slots.map((s, i) => world(s, { admin: true, extra: i >= ADMIN_PAGE })).filter(Boolean).join("");
    if (!html) return `${head}<div class="g vip-soon">${slot("barrier", true)}<p class="tag tw">keine Welten</p><p class="mut">Der Server hat noch keine VIP-Welten gemeldet.</p></div></section>`;
    const more = slots.length > ADMIN_PAGE
      ? `<button class="btn sm sec vip-more" type="button" data-more="1" aria-expanded="false">Alle ${NF(slots.length)} Welten zeigen</button>`
      : "";
    return `${head}<div class="v2-wlist vip-aworlds" id="vip-aworlds">${html}</div>${more}</section>`;
  };
  const when = (iso) => {
    if (!iso) return "–";
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–";
  };
  const adminLog = (l) => {
    const head = `<section class="vip-block" id="vip-admin-log"><h2 class="hub-h2">Admin-Log</h2>`;
    const list = l && Array.isArray(l.entries) ? l.entries : [];
    if (!list.length) return `${head}<div class="g vip-soon">${slot("writable_book", true)}<p class="tag tw">noch leer</p><p class="mut">Eingriffe auf fremde Welten stehen mit Zeit, Admin, Besitzer und Welt im Protokoll.</p></div></section>`;
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
  const say = (msg, bad) => {
    const n = document.getElementById("vip-say");
    if (!n) return;
    n.textContent = msg || "";
    n.className = "vip-say v2-toast" + (msg ? " is-on" : "") + (bad ? " is-bad" : "");
  };
  const panel = (d) => {
    const p = d.player || {};
    const admin = d.admin === true;
    const name = NAME.test(p.name || "") ? p.name : "";
    const headImg = name ? `<span class="v2-headwrap"><img loading="lazy" class="v2-head" alt="" width="64" height="64" src="/mc-head/${encodeURIComponent(name)}/64?v=5"></span>` : `<span class="v2-headwrap">${slot("player_head", true)}</span>`;
    const st = d.stats || {};
    const max = d.limits && Number.isFinite(+d.limits.mine) && +d.limits.mine > 0 ? Math.floor(+d.limits.mine) : 3;
    const ownList = d.worlds && Array.isArray(d.worlds.slots) ? d.worlds.slots.filter((s) => s && s.owner === true) : [];
    const mine = d.worlds && Number.isFinite(+d.worlds.mine) ? Math.max(ownList.length, Math.floor(+d.worlds.mine)) : ownList.length;
    const bal = st.money == null ? "–" : NF(st.money) + " CP";
    const pub = name ? `<a class="btn sm sec" href="/spieler/${encodeURIComponent(name)}">Öffentliches Profil</a>` : "";
    const abadge = admin ? '<span class="tag tl vip-admin-tag">Admin-Ansicht</span>' : "";
    const rk = ["vip", "mvp", "admin"].includes(p.rank) ? p.rank : "";
    const headCard = `<div class="g v2-me is-${rk}">${headImg}<div class="v2-me-id"><p class="eyb">Dein Rang ${abadge}</p><h2 class="hub-h2">${E(name || "Spieler")} ${badge(p.rank, p.color)}</h2><p class="vip-acts"><a class="btn sm" href="/profile">Zum Profil</a>${pub}</p></div><div class="v2-kpis"><div class="v2-kpi"><span class="k">Guthaben</span><b class="v tnum">${bal}</b></div><div class="v2-kpi"><span class="k">Spielzeit</span><b class="v tnum">${st.playtime == null ? "–" : up(st.playtime)}</b></div><div class="v2-kpi is-worlds"><span class="k">Deine Welten</span><b class="v tnum">${NF(mine)} / ${NF(max)}</b>${pips(mine, max)}</div></div></div>`;
    const ranks = `<section class="vip-block" id="vip-ranks"><div class="vip-head"><div><p class="eyb">Ränge</p><h2 class="hub-h2">VIP und MVP</h2></div><p class="mut vip-head-note">Beide Ränge kosten nichts. Nils vergibt sie von Hand an enge Freunde.</p></div>${cards(d.catalog, d.limits)}${note(d.note)}</section>`;
    // Admin (Nils, 06.11.): own worlds with the free-slot card on top, as for VIP/MVP; the all-worlds
    // view below keeps the other players' worlds (no card twice, ids stay unique).
    // An admin who is also invited/trusted in someone else's world gets that world only once, in the
    // all-worlds view (full admin controls): no "Eingeladen" copy, so the rn-/inv-/dc- ids stay unique.
    const slotsOf = d.worlds && Array.isArray(d.worlds.slots) ? d.worlds.slots : [];
    const others = d.worlds ? { ...d.worlds, slots: slotsOf.filter((s) => !(s && s.owner === true)) } : d.worlds;
    const mineOnly = d.worlds ? { ...d.worlds, slots: slotsOf.filter((s) => s && s.owner === true) } : d.worlds;
    const worlds = admin ? ownSection(mineOnly, max, false) + adminWorlds(others) + adminLog(d.admin_log) : ownSection(d.worlds, max, false);
    return `${headCard}<p class="vip-say v2-toast" id="vip-say" role="status" aria-live="polite"></p>${worlds}${ranks}`;
  };
  const gate = (d) => {
    const raw = location.pathname + location.search + location.hash;
    const rel = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !raw.includes("://") ? raw : "/vip";
    const login = "https://nwebnotfound.dev/auth/discord/login?next=" + encodeURIComponent(rel);
    let msg;
    if (d.reason === "login") msg = `<p class="mut">Melde dich mit Discord an. Das Panel gibt es für verknüpfte Spieler mit VIP, MVP oder Admin.</p><a class="btn discord sm" href="${login}">Mit Discord anmelden</a>`;
    else if (d.reason === "link") msg = `<p class="mut">Verknüpfe deinen Minecraft-Account im Discord mit <code>/link</code> und bestätige ihn. Danach prüft diese Seite deinen Rang.</p><a class="btn sm sec" href="/profile">Zum Profil</a>`;
    else if (d.reason === "error") msg = `<p class="mut">Das Panel konnte nicht geladen werden. Versuch es gleich noch einmal.</p>`;
    else {
      const own = d.own_rank && RANKL[d.own_rank.rank] ? " Dein Rang ist " + E(RANKL[d.own_rank.rank]) + "." : "";
      msg = `<p class="mut">Das Panel ist für die Ränge VIP, MVP und Admin.${own} Builder und Spieler sehen die Übersicht, nicht das eigene Panel.</p><a class="btn sm sec" href="/profile">Zum Profil</a>`;
    }
    return `<div class="vip-gate g v2-gate">${slot("player_head", true)}${msg}</div><h2 class="hub-h2">Vorteile</h2>${cards(d.catalog, d.limits)}${note(d.note)}`;
  };
  // Ein Speichern statt sechs Aufträge: die Regeln einer Welt sammeln sich hier und gehen als
  // ein Teil-Update raus (der 10-pro-Stunde-Eimer gilt für alles andere).
  const dirty = new Map();
  const markDirty = (id, key, val) => {
    const d = { ...(dirty.get(id) || {}), [key]: val };
    dirty.set(id, d);
    const card = document.querySelector('.v2-world[data-wid="' + id + '"]');
    const btn = card && card.querySelector("button[data-save]");
    if (btn) { btn.disabled = false; btn.textContent = `Änderungen speichern (${Object.keys(d).length})`; }
  };
  const rid = () => {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch { /* Fallback unten */ }
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  };
  const ERR = {
    not_trusted: "Du darfst diese Welt nicht starten.", not_owner: "Du darfst diese Welt nicht ändern.",
    no_rank: "Der Besitzer hat keinen VIP-Rang mehr.", no_free_slot: "Kein freier Weltplatz.",
    name_taken: "Dieser Name ist schon vergeben.", invalid_name: "Name: 3–24 Zeichen, nur Buchstaben, Zahlen, - und _.",
    invalid_type: "Unbekannte Weltart.", invalid_setting: "Diese Einstellung ist ungültig.",
    invalid_role: "Unbekannte Rolle.", invalid_visibility: "Unbekannte Sichtbarkeit.",
    busy: "Für diese Welt läuft schon ein Auftrag.", not_linked: "Dein Minecraft-Account ist nicht verknüpft.",
    member_not_found: "Dieser Spieler ist nicht eingeladen.", "schon eingeladen": "Dieser Spieler ist schon eingeladen.",
    "nicht eingeladen": "Dieser Spieler ist nicht eingeladen.", "höchstens 12 Mitglieder": "Höchstens 12 Mitglieder.",
  };
  const send = async (path, body, method) => {
    try {
      const r = await fetch(path, { method: method || "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
      return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
    } catch { return { ok: false, status: 0, j: {} }; }
  };
  const run = async (path, body, method, okMsg) => {
    const r = await send(path, body, method);
    if (r.ok) {
      await load();
      say(okMsg || "Auftrag an den Server gesendet.", false);
    } else if (r.status === 429) {
      say("Zu viele Aktionen in der letzten Stunde. Bitte später erneut versuchen.", true);
    } else {
      const why = (r.j && (r.j.reason || r.j.error)) || "";
      // Rang zwischenzeitlich entzogen: Ansicht neu laden, damit keine veralteten Buttons bleiben.
      if (r.status === 403) await load();
      say(ERR[why] || (why ? String(why).slice(0, 120) : "Die Aktion ist fehlgeschlagen. Versuch es gleich noch einmal."), true);
    }
  };
  T.addEventListener("click", async (ev) => {
    if (!ev.target.closest) return;
    const btn = ev.target.closest("button");
    if (!btn || !T.contains(btn)) return;
    const manage = btn.getAttribute("data-manage");
    if (manage) {
      const card = btn.closest(".v2-world");
      if (!card) return;
      const open = card.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      // Die Karte startet offen; die Beschriftung sagt, was der Knopf jetzt tut.
      const lab = btn.querySelector(".v2-more-t");
      if (lab) lab.textContent = open ? "Schließen" : "Verwalten";
      return;
    }
    const ren = btn.getAttribute("data-rename");
    if (ren) {
      const box = document.getElementById("rn-" + ren);
      if (!box) return;
      box.hidden = !box.hidden;
      btn.setAttribute("aria-expanded", box.hidden ? "false" : "true");
      return;
    }
    const del = btn.getAttribute("data-del");
    if (del) {
      const box = document.getElementById("dc-" + del);
      if (!box) return;
      box.hidden = !box.hidden;
      btn.setAttribute("aria-expanded", box.hidden ? "false" : "true");
      return;
    }
    const typ = btn.getAttribute("data-type");
    if (typ) {
      const box = btn.closest(".v2-types");
      if (!box) return;
      box.querySelectorAll('button[role="radio"]').forEach((b) => b.setAttribute("aria-checked", b === btn ? "true" : "false"));
      return;
    }
    const save = btn.getAttribute("data-save");
    if (save) {
      const d = dirty.get(save);
      if (!UUID.test(save) || !d || !Object.keys(d).length) return;
      btn.disabled = true;
      const outgoing = { ...d };
      dirty.delete(save);
      await run("/api/mc-vip/worlds/" + encodeURIComponent(save) + "/settings", { request_id: rid(), settings: outgoing }, "POST", "Einstellungen gespeichert. Der Server übernimmt sie gleich.");
      return;
    }
    const set = btn.getAttribute("data-set");
    if (set) {
      const card = btn.closest(".v2-world");
      const id = card && card.getAttribute("data-wid") || "";
      if (!UUID.test(id)) return;
      if (set === "visibility") {
        const vis = btn.getAttribute("data-val") === "private" ? "private" : "friends";
        btn.disabled = true;
        await run("/api/mc-vip/worlds/" + encodeURIComponent(id) + "/visibility", { request_id: rid(), visibility: vis }, "POST", "Sichtbarkeit geändert. Die Welt übernimmt es beim nächsten Abgleich.");
        return;
      }
      // Regel lokal umschalten und merken; gesendet wird erst mit "Änderungen speichern".
      if (btn.classList.contains("v2-tgl")) {
        const on = btn.getAttribute("aria-checked") === "true";
        btn.setAttribute("aria-checked", on ? "false" : "true");
        btn.setAttribute("data-val", on ? "false" : "true");
        markDirty(id, set, !on);
      } else {
        const group = btn.closest(".seg");
        if (group) group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
        markDirty(id, set, btn.getAttribute("data-val"));
      }
      return;
    }
    const act = btn.getAttribute("data-act");
    if (act === "start" || act === "stop") {
      const id = btn.getAttribute("data-id") || "";
      if (!UUID.test(id)) return;
      btn.disabled = true;
      await run("/api/mc-vip/worlds/" + encodeURIComponent(id) + "/" + act, { request_id: rid() }, "POST", act === "start" ? "Startauftrag an den Server gesendet. Der Status aktualisiert sich, sobald die Welt läuft." : "Stopauftrag an den Server gesendet.");
      return;
    }
    if (act === "trust") {
      const id = btn.getAttribute("data-id") || "";
      const nm = btn.getAttribute("data-name") || "";
      const role = btn.getAttribute("data-role") === "trusted" ? "trusted" : "member";
      if (!UUID.test(id) || !NAME.test(nm)) return;
      btn.disabled = true;
      await run("/api/mc-vip/worlds/" + encodeURIComponent(id) + "/members/" + encodeURIComponent(nm) + "/trust", { request_id: rid(), role }, "POST", "Rolle geändert.");
      return;
    }
    if (act === "uninvite") {
      const id = btn.getAttribute("data-id") || "";
      const nm = btn.getAttribute("data-name") || "";
      if (!UUID.test(id) || !NAME.test(nm)) return;
      btn.disabled = true;
      await run("/api/mc-vip/worlds/" + encodeURIComponent(id) + "/members/" + encodeURIComponent(nm), { request_id: rid() }, "DELETE", "Einladung entfernt.");
      return;
    }
    if (btn.getAttribute("data-more")) {
      const box = document.getElementById("vip-aworlds");
      if (!box) return;
      const open = box.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "Weniger anzeigen" : "Alle Welten zeigen";
    }
  });
  T.addEventListener("submit", async (ev) => {
    const f = ev.target;
    if (!f || !f.matches) return;
    if (f.matches(".v2-create")) {
      ev.preventDefault();
      const input = f.querySelector('input[name="name"]');
      const nm = (input && input.value || "").trim();
      if (!WNAME.test(nm)) { say(ERR.invalid_name, true); return; }
      const chosen = f.querySelector('.v2-types button[aria-checked="true"]');
      const type = chosen && chosen.getAttribute("data-type") || "normal";
      const btn = f.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      await run("/api/mc-vip/worlds", { request_id: rid(), name: nm, type }, "POST", "Welt angelegt. Der Server erstellt sie jetzt.");
      return;
    }
    if (f.matches(".v2-invite")) {
      ev.preventDefault();
      const id = f.getAttribute("data-id") || "";
      const input = f.querySelector('input[name="name"]');
      const nm = (input && input.value || "").trim();
      if (!UUID.test(id)) return;
      if (!NAME.test(nm)) { say("Name: 1–16 Zeichen, nur Buchstaben, Zahlen und _.", true); return; }
      const btn = f.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      await run("/api/mc-vip/worlds/" + encodeURIComponent(id) + "/members", { request_id: rid(), name: nm }, "POST", "Einladung an den Server gesendet.");
      return;
    }
    if (f.matches(".v2-rename")) {
      ev.preventDefault();
      const id = f.getAttribute("data-id") || "";
      const input = f.querySelector('input[name="name"]');
      const nm = (input && input.value || "").trim();
      if (!UUID.test(id)) return;
      if (!WNAME.test(nm)) { say(ERR.invalid_name, true); return; }
      const btn = f.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      await run("/api/mc-vip/worlds/" + encodeURIComponent(id) + "/rename", { request_id: rid(), name: nm }, "POST", "Welt umbenannt.");
      return;
    }
    if (f.matches(".v2-delconfirm")) {
      ev.preventDefault();
      const id = f.getAttribute("data-id") || "";
      const want = f.getAttribute("data-name") || "";
      const input = f.querySelector('input[name="confirm"]');
      const confirm = (input && input.value || "").trim();
      if (!UUID.test(id)) return;
      if (!want || confirm !== want) { say("Zum Löschen den Weltnamen exakt eintippen.", true); return; }
      const btn = f.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      await run("/api/mc-vip/worlds/" + encodeURIComponent(id) + "/delete", { request_id: rid(), confirm }, "POST", "Löschauftrag an den Server gesendet. Die Welt verschwindet nach dem Abgleich.");
    }
  });
  const load = async () => {
    let d;
    try { d = await get("/api/mc-vip"); } catch { d = { access: false, reason: "error", catalog: [], note: "" }; }
    T.innerHTML = d && d.access ? panel(d) : gate(d || {});
  };
  load();
})();
