import { AV } from "./asset-version.js";
// VIP/MVP-Panel. Rang kommt aus mc_player_ranks (Join über mc_links). Welten nur, wenn der
// Server-Snapshot einen passenden Key hat (vip, vip_1, vip-2, vipwelt, vip_world …), sonst Platzhalter.
// Keine Schreibaktion, kein RCON.

export const VIP_NOTE = "Weitere Ingame-Vorteile liegen in LuckPerms und werden hier nicht ausgelesen. Diese Seite ändert nichts am Server.";
const WORLD_RE = /^vip(?:[-_]?(?:world|welt))?(?:[-_]?\d+)?$/i;
const PANEL = new Set(["vip", "mvp"]);
const RANK_LABEL = { vip: "VIP", mvp: "MVP", builder: "Builder", admin: "Admin", default: "Spieler" };
const STATS = {
  money: ["money", "cp", "balance"],
  playtime: ["playtime", "playtime_s", "play_time"],
  kills: ["kills", "player_kills"],
  deaths: ["deaths"],
  blocks_mined: ["blocks_mined", "mined_total", "blocks"],
};
const PERKS = {
  vip: [
    { id: "badge", icon: "name_tag", title: "Rang-Badge", text: "Goldenes VIP-Badge auf Profil, Spielerliste und in der PvP-Rangliste." },
    { id: "panel", icon: "ender_chest", title: "Dieses Panel", text: "Rang, Welten-Status und eine kurze Stats-Übersicht. Die Seite liest nur und schickt keine Befehle an den Server." },
    { id: "worlds", icon: "grass_block", title: "VIP-Welten", text: "Zugang zu den VIP-Welten, sobald sie online sind. Geplant sind bis zu drei." },
  ],
  mvp: [
    { id: "badge", icon: "name_tag", title: "Rang-Badge", text: "MVP-Badge in eigener Farbe, sichtbar über VIP, auf Profil, Spielerliste und in der PvP-Rangliste." },
    { id: "panel", icon: "ender_chest", title: "Dieses Panel", text: "Rang, Welten-Status und eine kurze Stats-Übersicht. Die Seite liest nur und schickt keine Befehle an den Server." },
    { id: "worlds", icon: "grass_block", title: "VIP-Welten", text: "Zugang zu den VIP-Welten, sobald sie online sind. Geplant sind bis zu drei." },
    { id: "higher", icon: "nether_star", title: "Höherer Rang", text: "MVP steht über VIP. Weitere Ingame-Rechte liegen in LuckPerms und sind hier noch nicht angebunden." },
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
  if (typeof color !== "string" || !/^&[0-9a-f]$/i.test(color)) return null;
  return { rank: r, color: color.slice(1).toLowerCase(), label: RANK_LABEL[r] };
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
async function loadWorlds(env) {
  const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null);
  let servers = null, at = null;
  if (row?.data) {
    try {
      const d = JSON.parse(row.data) || {};
      servers = d.servers && typeof d.servers === "object" ? d.servers : null;
      at = d.servers_at || row.updated_at || null;
    } catch { servers = null; }
  }
  const slots = pickVipWorlds(servers);
  if (!slots.length) return { placeholder: true, slots: [] };
  return { placeholder: false, updated_at: isoFrom(at), slots };
}
export async function vipApi(env, user) {
  if (!user?.id) return gate("login");
  const link = await env.DB.prepare(
    "SELECT l.mc_name AS mc_name, l.mc_uuid AS mc_uuid, l.has_role AS has_role, l.verified AS verified, r.rank AS rank, r.color AS color FROM mc_links l LEFT JOIN mc_player_ranks r ON r.uuid = lower(replace(l.mc_uuid, '-', '')) WHERE l.discord_id = ? LIMIT 1"
  ).bind(String(user.id)).first().catch(() => null);
  if (!link || !link.verified || !link.has_role || !/^[A-Za-z0-9_]{1,16}$/.test(String(link.mc_name || ""))) return gate("link");
  const raw = String(link.rank || "").toLowerCase();
  if (!PANEL.has(raw)) {
    const own = RANK_LABEL[raw] ? { rank: raw, label: RANK_LABEL[raw], ...(typeof link.color === "string" && /^&[0-9a-f]$/i.test(link.color) ? { color: link.color.slice(1).toLowerCase() } : {}) } : null;
    return gate("rank", own ? { own_rank: own } : {});
  }
  const view = vipRankView(raw, link.color);
  const player = { name: link.mc_name, ...(view || { rank: raw, label: RANK_LABEL[raw] }) };
  let stats = {}, stats_at = null;
  const ps = await env.DB.prepare("SELECT stats, updated_at FROM mc_player_stats WHERE mc_uuid = ?").bind(link.mc_uuid).first().catch(() => null);
  if (ps) {
    let rawS = {};
    try { rawS = JSON.parse(ps.stats || "{}"); } catch { rawS = {}; }
    if (!rawS || typeof rawS !== "object") rawS = {};
    stats = vipStats(rawS);
    stats_at = ps.updated_at ? isoFrom(ps.updated_at) : null;
  }
  return {
    access: true, reason: null, catalog: vipCatalog(raw), note: VIP_NOTE,
    player, stats, stats_at, worlds: await loadWorlds(env), profile: "/profile",
  };
}
export const vipBody = () => `<link rel="stylesheet" href="/mc/ranks.css?v=${AV}"><link rel="stylesheet" href="/mc/vip.css?v=${AV}"><section class="hero vip-hero"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Community</p><h1 class="hub-h">VIP.</h1><p class="sub">Rang, Vorteile von VIP und MVP, und der Status der VIP-Welten. Das eigene Panel gibt es nur mit verknüpftem Account und dem Rang VIP oder MVP.</p></div></section><section class="sec vip-sec"><div class="hub-wrap" id="vip" aria-live="polite"><div class="g pad mut">Lade Panel…</div></div></section><script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/vip.js?v=${AV}" defer></script>`;
