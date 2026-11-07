// Kleine D1-Attrappe auf node:sqlite (Node >= 22.5) für Unit-Tests ohne wrangler: prepare/bind/
// first/all/run/batch mit denselben Rückgabeformen wie D1. Schema aus schema.sql.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* ältere Node-Version */ }
export const sqliteAvailable = !!DatabaseSync;
export function makeD1({ schema = true } = {}) {
  const db = new DatabaseSync(":memory:");
  if (schema) db.exec(fs.readFileSync(ROOT + "schema.sql", "utf8"));
  const norm = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
  const stmt = (sql, params = []) => ({
    sql, params,
    bind: (...p) => stmt(sql, p.map(norm)),
    first: async (col) => { const r = db.prepare(sql).get(...params); return r == null ? null : col ? r[col] : { ...r }; },
    all: async () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })), meta: {} }),
    run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => { db.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } },
    exec: async (sql) => db.exec(sql),
  };
}
