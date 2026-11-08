#!/usr/bin/env node
// Unit tests for the automatic changelog (src/changelog-ingest.js, migration 0022): the "## Changelog" block of a PR
// body, the row for a merged PR event, and the ingest endpoint against a real SQLite (one row per PR, an identical
// re-send writes nothing, an edited row is never overwritten). Imported by scripts/e2e.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseChangelog, rowFromEvent, makeChangelogIngest, berlinDay } from "../src/changelog-ingest.js";
import { rowsToMd, latestEntries, playerSections } from "../src/mc-changelog.js";

// ---- the block ----
const tpl = fs.readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
assert.equal(parseChangelog(tpl).error, "area", "the untouched template is not an entry");
assert.deepEqual(parseChangelog("## Summary\nx\n\n## Changelog\n<!-- c -->\nnone\n\n## Checks\n"), { none: true });
assert.equal(parseChangelog("## Summary\nno block").error, "missing");
const ok = parseChangelog("## Changelog\narea: mc\nde: **Neue Welt** – mit Kirschbäumen\nen: New world - with cherry trees\n## Checks\nran");
assert.deepEqual(ok, { area: "server", de: { title: "Neue Welt", sub: "mit Kirschbäumen" }, en: { title: "New world", sub: "with cherry trees" } });
assert.deepEqual(parseChangelog("## Changelog\narea: site\nde: Nur ein Titel").de, { title: "Nur ein Titel", sub: "" });
assert.equal(parseChangelog("## Changelog\narea: site\nde: Titel").en, null, "EN is optional");
assert.equal(parseChangelog("## Changelog\narea: site | mc\nde: x").error, "area", "both areas = not filled in");
assert.equal(parseChangelog("## Changelog\narea: site\nde: <kurzer Titel> – <optionale Unterzeile>").error, "de");
assert.equal(parseChangelog("## Changelog\narea: site\nde: " + "x".repeat(81)).error, "de", "title max 80");

// ---- the event ----
const ev = (o = {}) => ({ repository: { full_name: "NwebNotFound/NwebNotFoundDOTDev" }, pull_request: { number: 141, merged: true, merged_at: "2026-11-08T22:30:00Z", base: { ref: "main" }, html_url: "https://github.com/NwebNotFound/NwebNotFoundDOTDev/pull/141", body: "## Changelog\narea: site\nde: Texte – im Editor\nen: Writing – in the editor", ...o } });
const r = rowFromEvent(ev()).row;
assert.equal(r.source, "NwebNotFound/NwebNotFoundDOTDev#141"); assert.equal(r.day, "2026-11-08"); assert.equal(r.area, "website");
assert.equal(berlinDay("2026-11-08T23:30:00Z"), "2026-11-09", "the day in Berlin");
assert.equal(rowFromEvent(ev({ merged: false })).skip, "not_merged");
assert.equal(rowFromEvent(ev({ base: { ref: "dev" } })).skip, "not_main");
assert.equal(rowFromEvent({ ...ev(), repository: { full_name: "evil/repo" } }).skip, "repo");
assert.equal(rowFromEvent({ ...ev(), repository: { full_name: "NwebNotFound/NwebNotFound" } }).row.source, "NwebNotFound/NwebNotFoundDOTDev#141", "old repo name maps to the new one");
assert.equal(rowFromEvent(ev({ body: "## Changelog\nnone" })).skip, "none");
assert.equal(rowFromEvent(ev({ html_url: "javascript:alert(1)" })).row.pr_url, null);

// ---- D1 rows as the mc player part (the mc page and the Neuigkeiten window read it unchanged) ----
const md = rowsToMd([{ day: "2026-11-08", title_de: "Neue *Welt*", text_de: "mit <!-- Bäumen", title_en: "New world", text_en: "trees" }, { day: "2026-11-07", title_de: "Fix", text_de: "" }]);
assert.equal(playerSections(md).length, 2);
assert.equal(latestEntries(4, md, "en")[0].title, "New world");
assert.equal(latestEntries(4, md, "de")[0].title, "Neue Welt", "markdown/comment characters from a title can't break the format");

// ---- the endpoint on SQLite ----
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch { console.log("changelog-unit: node:sqlite unavailable, endpoint part skipped"); }
if (sqlite) {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const D1 = { prepare(sql) { const st = db.prepare(sql); let a = []; const o = { bind(...x) { a = x; return o; }, run: async () => ({ meta: { changes: Number(st.run(...a).changes) } }) }; return o; } };
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  let purged = 0;
  const ingest = makeChangelogIngest({ json, safeEq: (a, b) => a === b, onWrite: () => purged++ });
  const env = { DB: D1, CHANGELOG_TOKEN: "t0k" };
  const post = async (body, auth = "Bearer t0k", e = env) => { const res = await ingest(new Request("https://nwebnotfound.dev/api/changelog/ingest", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }), e, 1000); return { s: res.status, j: await res.json() }; };
  assert.equal((await post(ev(), "Bearer t0k", { DB: D1 })).s, 404, "no secret: endpoint off");
  assert.equal((await post(ev(), "Bearer nope")).s, 401);
  assert.equal((await post(ev())).s, 201);
  const row = () => ({ ...db.prepare("SELECT day, area, title_de, title_en, text_de, status, version, source, edited FROM changelog WHERE source = 'NwebNotFound/NwebNotFoundDOTDev#141'").get() });
  assert.deepEqual(row(), { day: "2026-11-08", area: "website", title_de: "Texte", title_en: "Writing", text_de: "im Editor", status: "live", version: 1, source: "NwebNotFound/NwebNotFoundDOTDev#141", edited: 0 });
  const again = await post(ev());
  assert.equal(again.s, 200); assert.equal(again.j.changed, false, "identical re-send writes nothing"); assert.equal(purged, 1);
  await post(ev({ body: "## Changelog\narea: site\nde: Texte & Kapitel – im Editor" }));
  assert.equal(row().title_de, "Texte & Kapitel"); assert.equal(row().version, 2, "an edited PR body updates the row");
  db.exec("UPDATE changelog SET title_de = 'Von Nils', edited = 1");
  await post(ev({ body: "## Changelog\narea: site\nde: Überschrieben?" }));
  assert.equal(row().title_de, "Von Nils", "an edited row is never overwritten");
  assert.equal((await post(ev({ body: "## Changelog\nnone" }))).s, 202);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM changelog").get().n, 1, "one row per PR");
}
console.log("changelog-unit ok");
