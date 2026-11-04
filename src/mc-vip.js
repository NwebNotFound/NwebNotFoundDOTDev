import { AV } from "./asset-version.js";
// VIP/MVP-Panel. Rang kommt aus mc_player_ranks. Der Ingest (normUuid) speichert die UUID
// ohne Bindestriche; mc_links speichert normU mit Bindestrichen. Gelesen wird beides über normU.
// Welten nur, wenn der Server-Snapshot einen passenden Key hat, sonst Platzhalter.
// Keine Schreibaktion, kein RCON.

export const VIP_NOTE = "";
const WORLD_RE = /^vip(?:[-_]?(?:world|welt))?(?:[-_]?\d+)?$/i;
// Ränge mit eigenem Panel. Admin sieht zusätzlich alle Welten und das Protokoll.
const PANEL = new Set(["vip", "mvp", "admin"]);
const RANK_LABEL = { vip: "VIP", mvp: "MVP", builder: "Builder", admin: "Admin", default: "Spieler" };
const RANK_COLOR = { vip: "6", mvp: "d", admin: "c" };
const NAME_OK = /^[A-Za-z0-9_]{1,16}$/;
// Aktionen, die im vip_admin_log stehen dürfen. Muss deckungsgleich mit CONTRACT_ACTIONS
// in mc-vip-cmd.js bleiben (dort geprüft beim Ingest, hier Whitelist für die Ausgabe).
const LOG_ACTION = {
  create: "Welt erstellt", rename: "Welt umbenannt", start: "Welt gestartet", stop: "Welt gestoppt",
  settings: "Einstellungen geändert", set_visibility: "Sichtbarkeit geändert", invite: "Spieler eingeladen",
  uninvite: "Einladung entfernt", trust: "Vertrauensstufe geändert", addons: "Addons geändert", delete: "Welt gelöscht",
};
// Gleiche Normalisierung wie normU in worker.js / mc-parkour.js / mc-trade.js: lowercase, Bindestriche kanonisch.
export const normU = (x) => { const s = String(x ?? "").toLowerCase().replace(/-/g, ""); return /^[0-9a-f]{32}$/.test(s) ? s.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5") : null; };
const STATS = {
  money: ["money", "cp", "balance"],
  playtime: ["playtime", "playtime_s", "play_time"],
  kills: ["kills", "player_kills"],
  deaths: ["deaths"],
  blocks_mined: ["blocks_mined", "mined_total", "blocks"],
};
const PANEL_TEXT = "Dein Rang, der Status der VIP-Welten und eine kurze Übersicht deiner Stats.";
// Welt-Limits laut Nils, 04.11.2026: VIP darf genau eine eigene Welt haben, MVP bis zu drei.
// Einzige Quelle für die Zahlen im Panel (Rangkarten und Zähler „Deine Welten n von max").
// Keine D1-Migration, keine Plugin-Änderung; Sichtbarkeit/Filterung der Welten bleibt unberührt.
// `admin` steht ausdrücklich drin: der Admin sieht alle Welten, der Zähler bleibt bei 3. Fehlt ein
// Rang hier, gilt der kleinste Wert (VIP) — ein unbekannter oder neuer Rang darf nie stillschweigend
// das MVP-Limit bekommen, sonst öffnet eine Rang-Umbenennung im Plugin zwei Welten zu viel.
export const WORLD_LIMITS = { vip: 1, mvp: 3, admin: 3 };
export const worldLimit = (rank) => {
  const r = String(rank || "").toLowerCase();
  return Number.isFinite(WORLD_LIMITS[r]) ? WORLD_LIMITS[r] : WORLD_LIMITS.vip;
};
const PERKS = {
  vip: [
    { id: "badge", icon: "name_tag", title: "Rang-Badge", text: "Goldenes VIP-Badge auf Profil, Spielerliste und in der PvP-Rangliste." },
    { id: "panel", icon: "book", title: "Dieses Panel", text: PANEL_TEXT },
    { id: "worlds", icon: "grass_block", title: "Eine eigene Welt", text: `VIP darf ${WORLD_LIMITS.vip} eigene Welt haben. Den Status siehst du unter „Deine Welten".` },
  ],
  mvp: [
    { id: "badge", icon: "name_tag", title: "Rang-Badge", text: "MVP-Badge in eigener Farbe, sichtbar über VIP, auf Profil, Spielerliste und in der PvP-Rangliste." },
    { id: "panel", icon: "book", title: "Dieses Panel", text: PANEL_TEXT },
    { id: "worlds", icon: "grass_block", title: `Bis zu ${WORLD_LIMITS.mvp} eigene Welten`, text: `MVP darf bis zu ${WORLD_LIMITS.mvp} eigene Welten haben, VIP ${WORLD_LIMITS.vip}.` },
    { id: "higher", icon: "golden_apple", title: "Höherer Rang", text: "MVP steht über VIP. Weitere Ingame-Vorteile folgen." },
  ],
  admin: [
    { id: "all", icon: "map", title: "Alle VIP-Welten", text: "Du siehst jede Welt mit Besitzer, Status und Mitgliedern, nicht nur deine eigenen." },
    { id: "manage", icon: "redstone_torch", title: "Verwaltung", text: "Du startest fremde Welten und änderst ihre Sichtbarkeit. Jede Aktion läuft über die Queue." },
    { id: "log", icon: "writable_book", title: "Admin-Log", text: "Eingriffe auf fremde Welten stehen mit Zeit, Admin, Besitzer und Welt im Protokoll." },
  ],
};

export function isVipWorldKey(k) {
  return typeof k === "string" && WORLD_RE.test(k);
}
export function vipWorldLabel(id) {
  const s = String(id || "").toLowerCase();
  const n = s.match(/(\d+)$/);
  return n ? `VIP-Welt ${Number(n[1])}` : "VIP-Welt";
}
function numOrNull(v) {
  if (v == null || v === "" || typeof v === "boolean" || !Number.isFinite(+v)) return null;
  return +v;
}
function playerCount(v) {
  if (Array.isArray(v?.players)) return v.players.filter((n) => typeof n === "string" && /^[A-Za-z0-9_]{1,16}$/.test(n)).length;
  const n = numOrNull(v?.players);
  return n != null && n >= 0 ? Math.min(100, Math.floor(n)) : 0;
}
export function pickVipWorlds(servers, limit = 3) {
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  const keys = Object.keys(servers).filter(isVipWorldKey);
  keys.sort((a, b) => {
    const na = (String(a).match(/(\d+)$/) || [])[1], nb = (String(b).match(/(\d+)$/) || [])[1];
    const da = na == null ? 0 : Number(na), db = nb == null ? 0 : Number(nb);
    return da - db || a.toLowerCase().localeCompare(b.toLowerCase());
  });
  // Ohne Angabe drei Welten; Admin sieht alle (Infinity).
  const n = Number.isFinite(+limit) && +limit > 0 ? Math.floor(+limit) : limit === Infinity ? Infinity : 3;
  return keys.slice(0, n).map((k) => {
    const v = servers[k] && typeof servers[k] === "object" ? servers[k] : {};
    const id = k.toLowerCase();
    const max = numOrNull(v.max), tps = numOrNull(v.tps);
    return {
      id, label: vipWorldLabel(id), online: !!v.online, players: playerCount(v),
      max: max == null ? null : Math.max(0, Math.floor(max)),
      tps: tps == null ? null : Math.round(tps * 10) / 10,
    };
  });
}
export function vipStats(raw) {
  const o = {};
  if (!raw || typeof raw !== "object") return o;
  for (const [k, ks] of Object.entries(STATS)) {
    for (const x of ks) {
      const v = raw[x];
      if (v == null || v === "" || typeof v === "boolean" || typeof v === "object") continue;
      const n = +v;
      if (Number.isFinite(n) && n >= 0) { o[k] = n; break; }
    }
  }
  return o;
}
const CATALOG = ["vip", "mvp"];
const CATALOG_ICON = { vip: "gold_ingot", mvp: "nether_star", admin: "command_block" };
export function vipCatalog(active) {
  const a = PANEL.has(active) ? active : null;
  // Admin bekommt zusätzlich die eigene Karte; Nicht-Admins sehen VIP und MVP.
  const ranks = a === "admin" ? [...CATALOG, "admin"] : CATALOG;
  return ranks.map((rank) => ({
    rank, label: RANK_LABEL[rank], icon: CATALOG_ICON[rank],
    color: RANK_COLOR[rank], yours: rank === a,
    perks: PERKS[rank].map((p) => ({ ...p })),
  }));
}
export function vipRankView(rank, color) {
  const r = String(rank || "").toLowerCase();
  if (!PANEL.has(r)) return null;
  const c = typeof color === "string" && /^&[0-9a-f]$/i.test(color) ? color.slice(1).toLowerCase() : RANK_COLOR[r];
  return { rank: r, color: c, label: RANK_LABEL[r] };
}
function gate(reason, extra = {}) {
  return { access: false, reason, catalog: vipCatalog(null), note: VIP_NOTE, limits: { worlds: { ...WORLD_LIMITS }, mine: WORLD_LIMITS.mvp }, ...extra };
}
function isoFrom(at) {
  if (at == null || at === "") return null;
  const n = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(n)) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}
// Eine Welt für die Ausgabe aufbereiten. Nur vertraglich geprüfte Felder, damit ein alter
// oder manipulierter Blob die Seite nicht verfälscht.
function worldSlot(w, viewer) {
  const id = normU(w.id);
  if (!id) return null;
  const mine = normU(w.owner_uuid) === viewer?.uuid;
  const players = Math.max(0, Math.min(100, Math.floor(numOrNull(w.players) ?? 0)));
  const max = numOrNull(w.player_limit);
  return {
    id, label: typeof w.name === "string" && w.name ? w.name : "VIP-Welt",
    visibility: w.visibility === "private" ? "private" : "friends",
    status: typeof w.status === "string" ? w.status : "stopped",
    online: w.status === "running", players,
    max: max == null ? null : Math.max(0, Math.floor(max)), tps: null,
    info: typeof w.info === "string" ? w.info : "",
    owner_name: NAME_OK.test(String(w.owner_name || "")) ? String(w.owner_name) : null,
    owner: mine,
    members: (Array.isArray(w.invites) ? w.invites : []).map((i) => ({
      name: NAME_OK.test(String(i?.name || "")) ? String(i.name) : null,
      role: i?.role === "trusted" ? "trusted" : "member",
    })),
  };
}
async function loadWorlds(env, viewer) {
  const admin = !!viewer?.admin;
  const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null);
  let servers = null, at = null;
  if (row?.data) {
    try {
      const d = JSON.parse(row.data) || {};
      servers = d.servers && typeof d.servers === "object" ? d.servers : null;
      at = d.servers_at || row.updated_at || null;
    } catch { servers = null; }
  }
  const synced = await env.DB.prepare("SELECT data, updated_at FROM mc_blobs WHERE kind = 'vip_worlds'").first().catch(() => null);
  if (synced?.data) {
    let list = [];
    try { list = JSON.parse(synced.data); } catch { list = []; }
    if (Array.isArray(list) && list.length) {
      const name = String(viewer?.name || "").toLowerCase();
      // Vertrag: UUID bevorzugt, Name nur wenn der Eintrag keine UUID hat.
      const isMine = (i) => !!i && (i.uuid ? normU(i.uuid) === viewer?.uuid : !!i.name && String(i.name).toLowerCase() === name);
      const owns = (w) => normU(w.owner_uuid) === viewer?.uuid;
      const all = list.filter((w) => w && typeof w === "object" && normU(w.id));
      // Admin sieht alle Welten. VIP/MVP sehen eigene zuerst, dann eingeladene, höchstens drei.
      const visible = admin ? all : [
        ...all.filter(owns),
        ...all.filter((w) => !owns(w) && Array.isArray(w.invites) && w.invites.some(isMine)),
      ];
      const slots = (admin ? visible : visible.slice(0, 3)).map((w) => worldSlot(w, viewer)).filter(Boolean);
      return { placeholder: slots.length === 0, updated_at: synced.updated_at, slots };
    }
  }
  const slots = pickVipWorlds(servers, admin ? Infinity : 3);
  if (!slots.length) return { placeholder: true, slots: [] };
  return { placeholder: false, updated_at: isoFrom(at), slots };
}
// Admin-Protokoll (mc_blobs kind vip_admin_log). Nur für Admins, nur Vertrags-Aktionen,
// neueste zuerst. Namen und Details sind beim Ingest geprüft und werden hier erneut gefiltert.
async function loadAdminLog(env) {
  const row = await env.DB.prepare("SELECT data, updated_at FROM mc_blobs WHERE kind = 'vip_admin_log'").first().catch(() => null);
  let list = [];
  if (row?.data) { try { list = JSON.parse(row.data); } catch { list = []; } }
  const entries = (Array.isArray(list) ? list : [])
    .filter((x) => x && typeof x === "object" && LOG_ACTION[x.action])
    .map((x) => ({
      at: isoFrom(x.at), action: x.action, action_label: LOG_ACTION[x.action],
      admin_name: NAME_OK.test(String(x.admin_name || "")) ? String(x.admin_name) : null,
      owner_name: NAME_OK.test(String(x.owner_name || "")) ? String(x.owner_name) : null,
      world_id: normU(x.world_id),
      detail: typeof x.detail === "string" ? x.detail.slice(0, 120) : "",
    }))
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .slice(0, 20);
  return { updated_at: isoFrom(row?.updated_at), entries };
}
export async function vipApi(env, user) {
  if (!user?.id) return gate("login");
  const link = await env.DB.prepare(
    "SELECT mc_name, mc_uuid, has_role, verified FROM mc_links WHERE discord_id = ? LIMIT 1"
  ).bind(String(user.id)).first().catch(() => null);
  const uuid = normU(link?.mc_uuid);
  if (!link || !link.verified || !link.has_role || !uuid || !/^[A-Za-z0-9_]{1,16}$/.test(String(link.mc_name || ""))) return gate("link");
  const rankRow = await env.DB.prepare(
    "SELECT rank, color FROM mc_player_ranks WHERE lower(replace(uuid, '-', '')) = ? LIMIT 1"
  ).bind(uuid.replace(/-/g, "")).first().catch(() => null);
  const raw = String(rankRow?.rank || "").toLowerCase();
  if (!PANEL.has(raw)) {
    const own = RANK_LABEL[raw] ? { rank: raw, label: RANK_LABEL[raw], ...(typeof rankRow?.color === "string" && /^&[0-9a-f]$/i.test(rankRow.color) ? { color: rankRow.color.slice(1).toLowerCase() } : {}) } : null;
    return gate("rank", own ? { own_rank: own } : {});
  }
  const view = vipRankView(raw, rankRow?.color);
  const player = { name: link.mc_name, ...view };
  const admin = raw === "admin";
  let stats = {}, stats_at = null;
  const ps = await env.DB.prepare("SELECT stats, updated_at FROM mc_player_stats WHERE mc_uuid = ?").bind(uuid).first().catch(() => null);
  if (ps) {
    let rawS = {};
    try { rawS = JSON.parse(ps.stats || "{}"); } catch { rawS = {}; }
    if (!rawS || typeof rawS !== "object") rawS = {};
    stats = vipStats(rawS);
    stats_at = ps.updated_at ? isoFrom(ps.updated_at) : null;
  }
  const out = {
    access: true, reason: null, catalog: vipCatalog(raw), note: VIP_NOTE,
    // Welt-Limits laut Nils, 04.11.2026 (WORLD_LIMITS): die Zahlen für Karten und Zähler.
    limits: { worlds: { ...WORLD_LIMITS }, mine: worldLimit(raw) },
    player, stats, stats_at, admin,
    worlds: await loadWorlds(env, { uuid, name: link.mc_name, admin }), profile: "/profile",
  };
  // Das Protokoll sieht ausschließlich der Admin.
  if (admin) out.admin_log = await loadAdminLog(env);
  return out;
}
export const vipBody = () => `<link rel="stylesheet" href="/mc/ranks.css?v=${AV}"><link rel="stylesheet" href="/mc/vip.css?v=${AV}"><section class="hero vip-hero"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Community</p><h1 class="hub-h">VIP.</h1><p class="sub">Rang, Vorteile von VIP, MVP und Admin, und der Status der VIP-Welten. Das eigene Panel gibt es nur mit verknüpftem Account und dem Rang VIP, MVP oder Admin.</p></div></section><section class="sec vip-sec"><div class="hub-wrap" id="vip" aria-live="polite"><div class="g pad mut">Lade Panel…</div></div></section><script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/vip.js?v=${AV}" defer></script>`;
