import { AV } from "./asset-version.js";
import { pubRank } from "./mc-ranks.js";
// pvp_stats: Vollständiger Snapshot vom Bot (Creepy). Öffentlich nur Spielerfelder + Rang-Badge, keine Zeitstempel.
export const PVP_MAX = 5000;
const KEYS = new Set(["uuid", "name", "wins", "losses", "draws", "matches", "winrate_pct", "favorite_kit"]);
const nn = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const normUuid = (u) => { if (typeof u !== "string") return null; const s = u.toLowerCase().replace(/-/g, ""); return /^[0-9a-f]{32}$/.test(s) ? s : null; };
export function cleanPvp(a) {
  if (!Array.isArray(a)) return { error: "pvp_stats must be an array" };
  if (a.length > PVP_MAX) return { error: `pvp_stats: max ${PVP_MAX} rows` };
  const rows = [], seen = new Set(); let unknown = false;
  for (let i = 0; i < a.length; i++) {
    const r = a[i];
    if (!r || typeof r !== "object" || Array.isArray(r)) return { error: `pvp_stats[${i}]: object expected` };
    if (!unknown && Object.keys(r).some((k) => !KEYS.has(k))) unknown = true;
    const uuid = normUuid(r.uuid); if (!uuid) return { error: `pvp_stats[${i}].uuid: uuid expected` };
    if (seen.has(uuid)) return { error: `pvp_stats[${i}].uuid: duplicate` }; seen.add(uuid);
    if (typeof r.name !== "string" || !/^[A-Za-z0-9_]{1,16}$/.test(r.name)) return { error: `pvp_stats[${i}].name: minecraft name expected` };
    for (const k of ["wins", "losses", "draws", "matches"]) if (!nn(r[k])) return { error: `pvp_stats[${i}].${k}: non-negative integer expected` };
    let wr = r.winrate_pct === undefined ? null : r.winrate_pct;
    if (wr !== null) { if (!(typeof wr === "number" && Number.isFinite(wr) && wr >= 0 && wr <= 100)) return { error: `pvp_stats[${i}].winrate_pct: number 0-100 or null expected` }; wr = Math.round(wr); }
    let kit = r.favorite_kit === undefined ? null : r.favorite_kit;
    if (kit !== null) { if (typeof kit !== "string") return { error: `pvp_stats[${i}].favorite_kit: string or null expected` }; kit = kit.replace(/[\u0000-\u001f\u007f]/g, "").trim(); if (kit.length > 32) return { error: `pvp_stats[${i}].favorite_kit: max 32 chars` }; if (!kit) kit = null; }
    rows.push({ uuid, name: r.name, wins: r.wins, losses: r.losses, draws: r.draws, matches: r.matches, winrate_pct: wr, favorite_kit: kit });
  }
  if (unknown) console.warn("mc-ingest: pvp_stats rows contain unknown fields (ignored)");
  return { rows };
}
export function pvpStatements(env, rows, now) {
  const st = rows.map((r) => env.DB.prepare(
    "INSERT INTO mc_pvp_stats (uuid, name, wins, losses, draws, matches, winrate_pct, favorite_kit, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, wins=excluded.wins, losses=excluded.losses, draws=excluded.draws, matches=excluded.matches, winrate_pct=excluded.winrate_pct, favorite_kit=excluded.favorite_kit, updated_at=excluded.updated_at"
  ).bind(r.uuid, r.name, r.wins, r.losses, r.draws, r.matches, r.winrate_pct, r.favorite_kit, now));
  st.push(env.DB.prepare("DELETE FROM mc_pvp_stats WHERE uuid NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(rows.map((r) => r.uuid))));
  return st;
}
const SEL = "SELECT p.uuid, p.name, p.wins, p.losses, p.draws, p.matches, p.winrate_pct, p.favorite_kit, r.rank, r.color FROM mc_pvp_stats p LEFT JOIN mc_player_ranks r ON r.uuid = p.uuid";
// Öffentliche Quote: gespeicherter Wert, sonst Siege/(Siege+Niederlagen). Clients zeigen nur die Zahl.
export function pvpQuote(x) {
  if (x.winrate_pct != null && x.winrate_pct !== "") return x.winrate_pct;
  const m = +x.matches || 0;
  if (!(m > 0)) return 0;
  const d = (+x.wins || 0) + (+x.losses || 0);
  return Math.round((100 * (+x.wins || 0)) / (d || m));
}
const pub = (x) => ({ uuid: x.uuid, name: x.name, wins: x.wins, losses: x.losses, draws: x.draws, matches: x.matches, winrate_pct: pvpQuote(x), favorite_kit: x.favorite_kit, rank: pubRank(x.rank, x.color) });
export async function pvpApi(env) {
  const { results } = await env.DB.prepare(SEL + " ORDER BY p.wins DESC, p.winrate_pct IS NULL, p.winrate_pct DESC, lower(p.name) LIMIT 500").all().catch(() => ({ results: [] }));
  return { players: results.map(pub) };
}
export async function pvpPlayerApi(env, name) {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return null;
  const x = await env.DB.prepare(SEL + " WHERE lower(p.name) = lower(?) LIMIT 1").bind(name).first().catch(() => null);
  return x ? pub(x) : null;
}
export const pvpBody = () => `<link rel="stylesheet" href="/mc/ranks.css?v=${AV}"><link rel="stylesheet" href="/mc/pvp.css?v=${AV}"><section class="hero pvp-hero"><div class="pixbg"></div><div class="hub-wrap"><p class="eyb">Arena</p><h1 class="hub-h">PvP.</h1><p class="sub">Die Rangliste der Arena: sortiert nach Siegen, dann nach Siegquote.</p></div></section>
<section class="sec pvp-sec"><div class="hub-wrap" id="pvp" aria-live="polite"><div class="g pad mut">Lade Rangliste…</div></div></section>
<script src="/mc/common.js?v=${AV}" defer></script><script src="/mc/pvp.js?v=${AV}" defer></script>`;
