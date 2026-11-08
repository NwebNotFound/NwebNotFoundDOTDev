// player_ranks: Vollständiger Snapshot aus v_player_rank (Creepy-Ingest alle 5 Min). Öffentlich nur Rang + Farbe.
export const RANKS_MAX = 5000;
const RANKS = new Set(["default", "vip", "mvp", "builder", "admin"]);
const KEYS = new Set(["uuid", "name", "rank", "color", "weight"]);
const normUuid = (u) => { if (typeof u !== "string") return null; const s = u.toLowerCase().replace(/-/g, ""); return /^[0-9a-f]{32}$/.test(s) ? s : null; };
// Liefert { rows } oder { error } (strikt: alles oder nichts)
export function cleanRanks(a) {
  if (!Array.isArray(a)) return { error: "player_ranks must be an array" };
  if (a.length > RANKS_MAX) return { error: `player_ranks: max ${RANKS_MAX} rows` };
  const rows = [], seen = new Set(); let unknown = false;
  for (let i = 0; i < a.length; i++) {
    const r = a[i];
    if (!r || typeof r !== "object" || Array.isArray(r)) return { error: `player_ranks[${i}]: object expected` };
    if (!unknown && Object.keys(r).some((k) => !KEYS.has(k))) unknown = true;
    const uuid = normUuid(r.uuid); if (!uuid) return { error: `player_ranks[${i}].uuid: uuid expected` };
    if (seen.has(uuid)) return { error: `player_ranks[${i}].uuid: duplicate` }; seen.add(uuid);
    if (typeof r.name !== "string" || !/^[A-Za-z0-9_]{1,16}$/.test(r.name)) return { error: `player_ranks[${i}].name: minecraft name expected` };
    const rank = r.rank === "player" ? "default" : r.rank;
    if (!RANKS.has(rank)) return { error: `player_ranks[${i}].rank: one of default|vip|mvp|builder|admin expected` };
    if (typeof r.color !== "string" || !/^&[0-9a-f]$/i.test(r.color)) return { error: `player_ranks[${i}].color: legacy color code like &c expected` };
    if (typeof r.weight !== "number" || !Number.isSafeInteger(r.weight)) return { error: `player_ranks[${i}].weight: integer expected` };
    rows.push({ uuid, name: r.name, rank, color: r.color.toLowerCase(), weight: r.weight });
  }
  if (unknown) console.warn("mc-ingest: player_ranks rows contain unknown fields (ignored)");
  return { rows };
}
// Snapshot: Upsert + alle UUIDs löschen, die nicht im Snapshot sind
export function rankStatements(env, rows, now) {
  const st = rows.map((r) => env.DB.prepare(
    "INSERT INTO mc_player_ranks (uuid, name, rank, color, weight, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, rank=excluded.rank, color=excluded.color, weight=excluded.weight, updated_at=excluded.updated_at WHERE name IS NOT excluded.name OR rank IS NOT excluded.rank OR color IS NOT excluded.color OR weight IS NOT excluded.weight"
  ).bind(r.uuid, r.name, r.rank, r.color, r.weight, now));
  st.push(env.DB.prepare("DELETE FROM mc_player_ranks WHERE uuid NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(rows.map((r) => r.uuid))));
  return st;
}
// Öffentliche Form: nur Rang + Farbe, default ohne Badge
export const pubRank = (rank, color) => (rank && rank !== "default" && RANKS.has(rank) && /^&[0-9a-f]$/.test(color || "") ? { rank, color: color.slice(1) } : null);
