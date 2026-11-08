#!/usr/bin/env node
// Unit tests for the automatic changelog (src/changelog-ingest.js, migration 0022): the "## Changelog" block of a PR
// body, the row for a merged PR event, and the ingest endpoint against a real SQLite (one row per PR, an identical
// re-send writes nothing, an edited row is never overwritten). Imported by scripts/e2e.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseChangelog, rowFromEvent, makeChangelogIngest, berlinDay } from "../src/changelog-ingest.js";
import { rowsToMd, latestEntries, playerSections, entryKey } from "../src/mc-changelog.js";
import { changelog, changelogFeed } from "../src/nwebos-apps.js";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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

// ---- #143 review: the static history stays next to D1 rows ----
const base = "## Für Spieler\n### 01.11.2026\n- **Alter Eintrag** – bleibt\n- **Schon importiert** – doppelt\n### Ohne Datum\n- Undatiert\n## Für Admins\n- intern\n";
const merged = rowsToMd([{ day: "2026-11-08", title_de: "Neu per PR", text_de: "x" }, { day: "2026-11-01", title_de: "Schon importiert", text_de: "aus D1" }], base);
const mergedTitles = latestEntries(20, merged).map((e) => e.title);
assert.deepEqual(mergedTitles, ["Neu per PR", "Schon importiert", "Alter Eintrag", "Undatiert"], "one ingested row + the static history: all shown, a same-day same-title entry once");
assert.ok(merged.includes("aus D1") && !merged.includes("– doppelt") && !merged.includes("intern"), "the D1 copy wins; the admin part stays out");
assert.equal(entryKey("2026-11-01", "Neue Welt!"), entryKey("2026-11-01", "neue  welt"));
const wDe = changelog("de", new Date("2026-11-08T12:00:00Z"), [{ day: "2026-11-08", area: "server", title_de: "Nur in D1", text_de: "neu" }]);
assert.ok(wDe.includes("Nur in D1") && latestEntries(1).every((e) => wDe.includes(esc(e.title))), "the Neuigkeiten window: D1 server row and the CHANGELOG.md history together");
// an EN title without its own subline never shows the German one
const wEn = changelogFeed("en", new Date("2026-11-08T12:00:00Z"), [{ day: "2026-11-08", area: "website", title_de: "Neue Welt", text_de: "mit Kirschbäumen", title_en: "New world", text_en: null }]);
assert.ok(wEn.includes("New world") && !wEn.includes("Kirschbäumen"), "EN: no German subline under an English title");
assert.ok(changelogFeed("en", new Date("2026-11-08T12:00:00Z"), [{ day: "2026-11-08", area: "website", title_de: "Nur DE", text_de: "Unterzeile", title_en: null, text_en: null }]).includes("Unterzeile"), "EN without any English: the German row as it is");
// control characters can't reach the feed
const ctl = parseChangelog("## Changelog\narea: site\nde: Titel\u0001mit\u0007Steuerzeichen – Zeile\u001fzwei\u007f");
assert.equal(ctl.de.title, "Titel mit Steuerzeichen"); assert.equal(ctl.de.sub, "Zeile zwei");
const feed = changelogFeed("de", new Date("2026-11-08T12:00:00Z"), [{ day: "2026-11-08", area: "website", title_de: ctl.de.title, text_de: ctl.de.sub }]);
assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(feed), "feed: no control characters");

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
  // before migration 0022: 503 migration_missing (the workflow retries), not a 500
  const D1old2 = { prepare() { const o = { bind() { return o; }, run: async () => { throw new Error("D1_ERROR: no such column: source"); } }; return o; } };
  const pre = await post(ev(), "Bearer t0k", { DB: D1old2, CHANGELOG_TOKEN: "t0k" });
  assert.equal(pre.s, 503); assert.equal(pre.j.error, "migration_missing");
  await assert.rejects(post(ev(), "Bearer t0k", { DB: { prepare() { const o = { bind() { return o; }, run: async () => { throw new Error("D1 down"); } }; return o; } }, CHANGELOG_TOKEN: "t0k" }), /D1 down/, "other errors are not hidden");
}
console.log("changelog-unit ok");
