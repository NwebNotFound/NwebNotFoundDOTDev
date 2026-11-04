#!/usr/bin/env node
// playerSkinInfo gegen eine echte lokale D1 (SQLite in workerd) statt gegen einen Mock.
// Aufruf: node scripts/skin-sql.mjs [--keep]
//
// Warum so: der Test soll die Query treffen, die wirklich ausgeliefert wird. Deshalb bekommt
// playerSkinInfo() ein env.DB, das jede prepare(sql) an `wrangler d1 execute --local` weiterreicht
// — der SQL-Text kommt aus src/mc-head.js selbst, nicht aus einer Kopie hier. Angewendet werden
// schema.sql und danach alle migrations/*.sql in Dateinamen-Reihenfolge, wie beim Aufbau der DB.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { playerSkinInfo } from "../src/mc-head.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PERSIST = path.join(ROOT, ".wrangler", "skin-sql");
const NO_TABLES = path.join(ROOT, ".wrangler", "skin-sql-empty");
const KEEP = process.argv.includes("--keep");

let pass = 0, fail = 0;
const ok = (c, m, extra = "") => { if (c) pass++; else fail++; console.log((c ? "  ✓ " : "  ✗ ") + m + (c ? "" : "  " + extra)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- D1 über die CLI ---------------------------------------------------------------------
const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sqlArgs = (file, persist) => `DB --local --persist-to ${JSON.stringify(persist)} --file ${JSON.stringify(file)}`;
// cmd.exe bekommt die Query als ein Argument: JSON.stringify macht aus einem Newline ein
// literales "\n" und SQLite stolpert darüber. Deshalb alles auf eine Zeile, bevor es rausgeht.
const oneLine = (q) => String(q).replace(/\s+/g, " ").trim();
const sqlRows = (q, persist = PERSIST) =>
  JSON.parse(sh(`npx wrangler d1 execute DB --local --persist-to ${JSON.stringify(persist)} --json --command ${JSON.stringify(oneLine(q))}`))[0].results;
const sqlRun = (q, persist = PERSIST) => { sqlRows(q, persist); };
const quote = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");

// env.DB, das die Query der Funktion unverändert an die echte D1 gibt. `?`-Platzhalter werden zu
// Literalen — die Werte sind reine Test-Fixtures, und D1 bindet TEXT 1:1, die Suche bleibt gleich.
const queries = new Set();
function d1(persist = PERSIST) {
  return {
    prepare(sql) {
      queries.add(sql);
      return {
        bind(...args) {
          let i = 0;
          const q = sql.replace(/\?/g, () => quote(args[i++]));
          return {
            first: async () => sqlRows(q, persist)[0] ?? null,
            all: async () => ({ results: sqlRows(q, persist) }),
          };
        },
      };
    },
  };
}

// ---- Fixtures ----------------------------------------------------------------------------
const U_MAIN = "5629bc24-db84-4c65-b73d-40b038fa5906", U_LEGACY = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const U_NOSTATS = "11111111-2222-3333-4444-555555555555", U_BROKEN = "22222222-3333-4444-5555-666666666666";
const U_BADSKIN = "33333333-4444-5555-6666-777777777777", U_HTTPSKIN = "44444444-5555-6666-7777-888888888888";
const TX = "https://textures.minecraft.net/texture/feedbeef00112233";
const flat = (u) => u.replace(/-/g, "");

if (!KEEP) { fs.rmSync(PERSIST, { recursive: true, force: true }); fs.rmSync(NO_TABLES, { recursive: true, force: true }); }

console.log("Schema + Migrationen …");
sqlRun(`CREATE TABLE IF NOT EXISTS _probe (x INTEGER)`); // legt das persist-Verzeichnis an
sqlRun("DROP TABLE _probe");
execSync(`npx wrangler d1 execute ${sqlArgs("schema.sql", PERSIST)}`, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
const migs = fs.readdirSync(path.join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
// schema.sql ist der vollständige Snapshot, die Migrationen sind für bestehende DBs. Ein
// "duplicate column name"/"already exists" heißt also nur: der Stand steckt schon im Snapshot.
let already = 0;
for (const f of migs) {
  try { execSync(`npx wrangler d1 execute ${sqlArgs("migrations/" + f, PERSIST)}`, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) {
    const out = String(e.stderr || "") + String(e.stdout || "");
    if (/duplicate column name|already exists/i.test(out)) { already++; continue; }
    console.error("Migration " + f + " fehlgeschlagen:\n" + out.replace(/\x1b\[[0-9;]*m/g, ""));
    process.exit(1);
  }
}

{ // Aufbau prüfen, bevor irgendetwas am Lookup behauptet wird
  const t = sqlRows("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
  ok(t.includes("mc_links") && t.includes("mc_player_stats"), "schema.sql + " + migs.length + " Migrationen angewendet (" + already + " steckten schon im Snapshot)", t.join(","));
  const cols = sqlRows("PRAGMA table_info(mc_links)").map((r) => r.name);
  ok(!cols.includes("skin_url"), "mc_links hat keine skin_url-Spalte (SELECT l.* liefert dort nichts)", cols.join(","));
}

sqlRun(`INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES
  ('100000000000000001','NaniSan123','${U_MAIN}',1,1,0),
  ('100000000000000002','LegacyDashed','${U_LEGACY}',1,1,0),
  ('100000000000000003','NoStats','${U_NOSTATS}',1,1,0),
  ('100000000000000004','BrokenStats','${U_BROKEN}',1,1,0),
  ('100000000000000005','BadSkin','${U_BADSKIN}',1,1,0),
  ('100000000000000006','HttpSkin','${U_HTTPSKIN}',1,1,0)`);
sqlRun(`INSERT INTO mc_player_stats (mc_uuid, stats, updated_at) VALUES
  ('${U_MAIN}', '{"skin_url":"${TX}","kills":3}', 0),
  ('${U_BROKEN}', 'kaputt{', 0),
  ('${U_BADSKIN}', '{"skin_url":"https://evil.example/texture/abc"}', 0),
  ('${U_HTTPSKIN}', '{"skin_url":"http://textures.minecraft.net/texture/abc123abc123abc1"}', 0)`);

const rows = sqlRows("SELECT mc_name, mc_uuid FROM mc_links ORDER BY mc_name");
ok(rows.length === 6, "6 Links in der echten DB", JSON.stringify(rows));

// ---- Lookup ------------------------------------------------------------------------------
console.log("playerSkinInfo gegen echte D1");
const db = d1();
const known = { uuid: flat(U_MAIN), skinUrl: TX };
{ const g = await playerSkinInfo({ DB: db }, "NaniSan123");
  ok(same(g, known), "bekannter Spieler: UUID + skin_url aus mc_player_stats", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "nanisan123");
  ok(same(g, known), "Name klein geschrieben trifft denselben Spieler", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "NANISAN123");
  ok(same(g, known), "Name GROSS geschrieben trifft denselben Spieler", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "nAnIsAn123");
  ok(same(g, known), "gemischte Schreibweise trifft denselben Spieler", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, U_MAIN);
  ok(same(g, known), "UUID mit Bindestrichen findet den Spieler", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, U_MAIN.toUpperCase());
  ok(same(g, known), "UUID GROSS mit Bindestrichen findet den Spieler", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, flat(U_MAIN));
  ok(same(g, known), "UUID ohne Bindestriche findet den Spieler", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, flat(U_LEGACY));
  ok(g.uuid === flat(U_LEGACY) && g.skinUrl === null, "UUID ohne Bindestriche zu altem Link mit Bindestrichen", JSON.stringify(g)); }

{ const g = await playerSkinInfo({ DB: db }, "gibtsnicht");
  ok(same(g, {}), "unbekannter Name → {}", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "NaniSan1234");
  ok(same(g, {}), "fast-passender Name trifft nicht (kein LIKE)", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, flat(U_NOSTATS).replace(/1/g, "9"));
  ok(same(g, {}), "unbekannte UUID → {}", JSON.stringify(g)); }

{ const g = await playerSkinInfo({ DB: db }, "NoStats");
  ok(g.uuid === flat(U_NOSTATS) && g.skinUrl === null, "ohne stats-Zeile: UUID trotzdem da, kein Skin", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "BrokenStats");
  ok(g.uuid === flat(U_BROKEN) && g.skinUrl === null, "kaputtes stats-JSON wird toleriert", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "BadSkin");
  ok(g.uuid === flat(U_BADSKIN) && g.skinUrl === null, "skin_url von fremdem Host wird verworfen", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "HttpSkin");
  ok(g.skinUrl === "https://textures.minecraft.net/texture/abc123abc123abc1", "http-Skin-URL wird auf https gehoben", JSON.stringify(g)); }

{ const g = await playerSkinInfo({ DB: db }, "");
  ok(same(g, {}), "leerer Name → {}", JSON.stringify(g)); }
{ const g = await playerSkinInfo({ DB: db }, "' OR 1=1 --");
  ok(same(g, {}), "SQL im Namen ist nur ein Name", JSON.stringify(g)); }

{ // Die Query, die der Test fährt, ist die der Funktion — nicht eine Kopie hier.
  const [q] = [...queries];
  ok(queries.size === 1 && /FROM mc_links l LEFT JOIN mc_player_stats s/.test(q) && /lower\(replace\(l\.mc_uuid, '-', ''\)\)/.test(q),
    "getestet wird die echte Query aus src/mc-head.js", q); }

{ // Fehlende Tabellen (frische DB) → {} statt Throw
  const g = await playerSkinInfo({ DB: d1(NO_TABLES) }, "NaniSan123");
  ok(same(g, {}), "DB ohne Tabellen → {} (catch-Zweig)", JSON.stringify(g)); }
{ const g = await playerSkinInfo({}, "NaniSan123");
  ok(same(g, {}), "ohne DB-Binding → {}", JSON.stringify(g)); }

if (!KEEP) { fs.rmSync(PERSIST, { recursive: true, force: true }); fs.rmSync(NO_TABLES, { recursive: true, force: true }); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
