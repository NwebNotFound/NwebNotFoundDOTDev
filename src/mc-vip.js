import { AV } from "./asset-version.js";
// VIP/MVP-Panel. Rang kommt aus mc_player_ranks. Der Ingest (normUuid) speichert die UUID
// ohne Bindestriche; mc_links speichert normU mit Bindestrichen. Gelesen wird beides über normU.
// Welten nur, wenn der Server-Snapshot einen passenden Key hat, sonst Platzhalter.
// Keine Schreibaktion, kein RCON.

export const VIP_NOTE = "";
const WORLD_RE = /^vip(?:[-_]?(?:world|welt))?(?:[-_]?\d+)?$/i;
const PANEL = new Set(["vip", "mvp"]);
const RANK_LABEL = { vip: "VIP", mvp: "MVP", builder: "Builder", admin: "Admin", default: "Spieler" };
const RANK_COLOR = { vip: "6", mvp: "d" };
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
const WORLDS_TEXT = "Zugang zu den VIP-Welten, sobald sie online sind. Geplant sind bis zu drei.";
const PERKS = {
  vip: [
    { id: "badge", icon: "name_tag", title: "Rang-Badge", text: "Goldenes VIP-Badge auf Profil, Spielerliste und in der PvP-Rangliste." },
    { id: "panel", icon: "book", title: "Dieses Panel", text: PANEL_TEXT },
    { id: "worlds", icon: "grass_block", title: "VIP-Welten", text: WORLDS_TEXT },
  ],
  mvp: [
    { id: "badge", icon: "name_tag", title: "Rang-Badge", text: "MVP-Badge in eigener Farbe, sichtbar über VIP, auf Profil, Spielerliste und in der PvP-Rangliste." },
    { id: "panel", icon: "book", title: "Dieses Panel", text: PANEL_TEXT },
    { id: "worlds", icon: "grass_block", title: "VIP-Welten", text: WORLDS_TEXT },
    { id: "higher", icon: "golden_apple", title: "Höherer Rang", text: "MVP steht über VIP. Weitere Ingame-Vorteile folgen." },
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
export function pickVipWorlds(servers) {
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  const keys = Object.keys(servers).filter(isVipWorldKey);
  keys.sort((a, b) => {
    const na = (String(a).match(/(\d+)$/) || [])[1], nb = (String(b).match(/(\d+)$/) || [])[1];
    const da = na == null ? 0 : Number(na), db = nb == null ? 0 : Number(nb);
    return da - db || a.toLowerCase().localeCompare(b.toLowerCase());
  });
  return keys.slice(0, 3).map((k) => {
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
export function vipCatalog(active) {
  const a = active === "vip" || active === "mvp" ? active : null;
  return ["vip", "mvp"].map((rank) => ({
    rank, label: RANK_LABEL[rank], icon: rank === "mvp" ? "nether_star" : "gold_ingot",
    color: rank === "mvp" ? "d" : "6", yours: rank === a,
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
  return { access: false, reason, catalog: vipCatalog(null), note: VIP_NOTE, ...extra };
}
function isoFrom(at) {
  if (at == null || at === "") return null;
  const n = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(n)) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}
async function loadWorlds(env, viewer) {
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
      const isMine = (i) => (i.uuid && normU(i.uuid) === viewer?.uuid) || (i.name && String(i.name).toLowerCase() === name);
      const mine = list.filter((w) => viewer?.admin || normU(w.owner_uuid) === viewer?.uuid || (w.invites || []).some(isMine));
      const slots = mine.slice(0, 3).map((w) => ({
        id: w.id, label: w.name || "VIP-Welt", visibility: w.visibility === "private" ? "private" : "friends",
        online: w.status === "running", players: w.players || 0, max: w.player_limit ?? null, tps: null, info: w.info || "",
        owner_name: w.owner_name || null, owner: normU(w.owner_uuid) === viewer?.uuid,
        members: (w.invites || []).map((i) => ({ name: i.name || null, role: i.role === "trusted" ? "trusted" : "member" })),
      }));
      return { placeholder: slots.length === 0, updated_at: synced.updated_at, slots };
    }
  }
  const slots = pickVipWorlds(servers);
  if (!slots.length) return { placeholder: true, slots: [] };
  return { placeholder: false, updated_at: isoFrom(at), slots };
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
  let stats = {}, stats_at = null;
  const ps = await env.DB.prepare("SELECT stats, updated_at FROM mc_player_stats WHERE mc_uuid = ?").bind(uuid).first().catch(() => null);
  if (ps) {
    let rawS = {};
    try { rawS = JSON.parse(ps.stats || "{}"); } catch { rawS = {}; }
    if (!rawS || typeof rawS !== "object") rawS = {};
    stats = vipStats(rawS);
    stats_at = ps.updated_at ? isoFrom(ps.updated_at) : null;
  }
  return {
    access: true, reason: null, catalog: vipCatalog(raw), note: VIP_NOTE,
    player, stats, stats_at, worlds: await loadWorlds(env, { uuid, name: link.mc_name, admin: raw === "admin" }), profile: "/profile",
  };
}
export const vipBody = () => `<link rel="stylesheet" href="/mc/ranks.css?v=${AV}"><link rel="stylesheet" href="/mc/vip.css?v=${AV}"><section class="hero vip-hero"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Community</p><h1 class="hub-h">VIP.</h1><p class="sub">Rang, Vorteile von VIP und MVP, und der Status der VIP-Welten. Das eigene Panel gibt es nur mit verknüpftem Account und dem Rang VIP oder MVP.</p></div></section><section class="sec vip-sec"><div class="hub-wrap" id="vip" aria-live="polite"><div class="g pad mut">Lade Panel…</div></div></section><script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/vip.js?v=${AV}" defer></script>`;
