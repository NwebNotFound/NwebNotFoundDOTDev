// economy_daily: eigener Ingest-POST vom Discord-Bot (mc-stack #32) + öffentliche Lese-API.
export const ECON_MAX = 90;
const KEYS = new Set(["day", "money_supply_cp", "minted_cp", "burned_cp", "net_cp"]);
const isInt = (v) => typeof v === "number" && Number.isSafeInteger(v);
function validDay(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
// Liefert { rows } oder { error } (strikt: alles oder nichts)
export function cleanEconomy(a) {
  if (!Array.isArray(a)) return { error: "economy_daily must be an array" };
  if (a.length > ECON_MAX) return { error: `economy_daily: max ${ECON_MAX} rows` };
  const rows = []; let unknown = false;
  for (let i = 0; i < a.length; i++) {
    const r = a[i];
    if (!r || typeof r !== "object" || Array.isArray(r)) return { error: `economy_daily[${i}]: object expected` };
    if (!unknown && Object.keys(r).some((k) => !KEYS.has(k))) unknown = true;
    if (!validDay(r.day)) return { error: `economy_daily[${i}].day: YYYY-MM-DD expected` };
    if (!isInt(r.money_supply_cp)) return { error: `economy_daily[${i}].money_supply_cp: integer expected` };
    const o = { day: r.day, money_supply_cp: r.money_supply_cp };
    for (const k of ["minted_cp", "burned_cp", "net_cp"]) {
      const v = r[k] === undefined ? null : r[k];
      if (v !== null && !isInt(v)) return { error: `economy_daily[${i}].${k}: integer or null expected` };
      o[k] = v;
    }
    if (rows.length && rows[rows.length - 1].day >= o.day) return { error: `economy_daily[${i}].day: strictly ascending (oldest first) expected` };
    rows.push(o);
  }
  // Unbekannte Felder werden ignoriert; einmal pro Request warnen, ohne Werte
  if (unknown) console.warn("mc-ingest: economy_daily rows contain unknown fields (ignored)");
  return { rows };
}
export const economyStatements = (env, rows, now) => rows.map((r) => env.DB.prepare(
  "INSERT INTO mc_economy_daily (day, money_supply_cp, minted_cp, burned_cp, net_cp, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET money_supply_cp=excluded.money_supply_cp, minted_cp=excluded.minted_cp, burned_cp=excluded.burned_cp, net_cp=excluded.net_cp, updated_at=excluded.updated_at WHERE money_supply_cp IS NOT excluded.money_supply_cp OR minted_cp IS NOT excluded.minted_cp OR burned_cp IS NOT excluded.burned_cp OR net_cp IS NOT excluded.net_cp"
).bind(r.day, r.money_supply_cp, r.minted_cp, r.burned_cp, r.net_cp, now));
export async function economyApi(env) {
  const { results } = await env.DB.prepare("SELECT day, money_supply_cp, minted_cp, burned_cp, net_cp, updated_at FROM mc_economy_daily ORDER BY day DESC LIMIT ?").bind(ECON_MAX).all().catch(() => ({ results: [] }));
  const at = results.reduce((m, x) => Math.max(m, x.updated_at || 0), 0);
  return { updated_at: at ? new Date(at).toISOString() : null, days: results.reverse().map(({ updated_at, ...r }) => r) };
}
