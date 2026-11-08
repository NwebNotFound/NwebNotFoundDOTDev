#!/usr/bin/env node
// Unit tests for the Verwaltung data side (src/admin.js): validation, the /api/admin router (admin only, 404 for
// everyone else, Origin, versions -> 409, admin_log, guestbook hide/delete) and the windows' D1-or-fallback render.
// Runs alone (`node scripts/admin-unit.mjs`) and is imported by scripts/e2e.mjs so CI runs it.
import assert from "node:assert/strict";
import fs from "node:fs";
import { cleanBlock, cleanProject, cleanNews, makeAdmin, siteData, purgeSite, ADMIN_RATE } from "../src/admin.js";
import { nwebosPage, DEFAULT_BLOCKS } from "../src/nwebos.js";
import { changelog, changelogFeed } from "../src/nwebos-apps.js";

// ---- validation ----
assert.deepEqual(cleanBlock("home.hero", "de", { eyebrow: " Hi ", name: "Nils", lead: "Text" }), { eyebrow: "Hi", name: "Nils", lead: "Text" });
assert.equal(cleanBlock("home.hero", "de", { name: "", lead: "x" }), null, "name required");
assert.equal(cleanBlock("home.hero", "*", { name: "Nils", lead: "x" }), null, "hero has no '*' language");
assert.equal(cleanBlock("home.xp", "*", { value: 1.5 }), null);
assert.deepEqual(cleanBlock("home.xp", "*", { value: 0.643 }), { value: 0.64 });
assert.equal(cleanBlock("home.facts", "de", { rows: Array(9).fill({ k: "a", v: "b" }) }), null, "max 8 rows");
assert.deepEqual(cleanBlock("home.facts", "en", { rows: [{ icon: "<x>", k: "Likes", v: "summer" }] }), { rows: [{ icon: "heart", k: "Likes", v: "summer" }] });
assert.equal(cleanBlock("nope", "de", {}), null);
assert.ok(cleanProject({ title_de: "A", status: "live", progress: 10, href: "/about" }).val);
assert.deepEqual(cleanProject({ title_de: "A", status: "x", progress: 11, href: "javascript:alert(1)" }).err.sort(), ["href", "progress", "status"]);
assert.ok(cleanProject({ title_de: "A", status: "neu", progress: 0, href: "https://mc.nwebnotfound.dev/" }).val);
assert.deepEqual(cleanNews({ day: "2026-02-30", area: "website", title_de: "x" }).err, ["day"]);
assert.equal(cleanNews({ day: "2026-11-08", area: "blog", title_de: "x" }).val.status, "draft", "new news are drafts");

// ---- render: fallback = today's texts; D1 rows win ----
const pageOf = (site, lang = "de") => nwebosPage({ lang, app: "about", path: "/about", site });
const fb = pageOf(null);
assert.ok(fb.includes("<h1>Hi, ich bin Nils.</h1>") && fb.includes("<dt>Mag</dt><dd>Pixel-Art, gemütliche Spiele, Sommer</dd>") && fb.includes("<em class=\"st live\">live</em>"), "fallback about + projects");
const site = { blocks: { "home.hero": { de: { name: "Nils <b>", lead: "Ich [[baue|1]] Dinge." } }, "home.facts": { de: { rows: [{ icon: "site", k: "Baut", v: "Neues" }] } }, "about.text": { de: { md: "**fett** <script>x</script>" } } },
  projects: [{ icon: "blog", title_de: "Neu-Projekt", title_en: null, status: "idee", progress: 2, text_de: "t", text_en: null, href: "javascript:x" }], changelog: null };
const d1 = pageOf(site), d1en = pageOf(site, "en");
assert.ok(d1.includes("Hi, ich bin Nils &lt;b&gt;.") && d1.includes("<p>Ich baue Dinge.</p>") && d1.includes("<dt>Baut</dt><dd>Neues</dd>") && !d1.includes("<dt>Mag</dt>"), "D1 blocks render, escaped, markers plain");
assert.ok(d1.includes("<strong>fett</strong>") && !d1.includes("<script>x"), "about.text Markdown sanitised");
assert.ok(d1.includes("Neu-Projekt") && d1.includes('<em class="st Idee">Idee</em>') && !d1.includes("Diese Website"), "D1 projects replace PROJ");
assert.ok(d1en.includes("Neu-Projekt") && d1en.includes('<em class="st Idee">idea</em>') && d1en.includes("<h1>Hi, I'm Nils.</h1>"), "EN falls back per field: project title, hero default");
const day = new Date("2026-11-08T10:00:00Z");
const rows = [{ day: "2026-11-08", area: "blog", title_de: "D1-Neuigkeit", title_en: "D1 news", text_de: "Satz.", text_en: null, status: "live" }];
assert.ok(changelog("de", day, rows).includes("D1-Neuigkeit") && !changelog("de", day, rows).includes("Blog mit Editor"), "news from D1 replace SITE_LOG");
assert.ok(changelog("de", day).includes("Blog mit Editor"), "fallback SITE_LOG");
assert.ok(changelogFeed("en", day, rows).includes("D1 news") && changelogFeed("en", day, rows).includes("Satz."), "feed from D1, EN falls back per field");
assert.deepEqual(DEFAULT_BLOCKS["home.xp"]["*"], { value: 0.64 });
// before migration 0019 (no tables): the windows get nulls and keep today's texts, nothing throws
purgeSite();
const noTables = { DB: { prepare: () => ({}), batch: async () => { throw new Error("D1_ERROR: no such table: site_blocks"); } } };
assert.deepEqual(await siteData(noTables, 1), { blocks: {}, projects: null, changelog: null });
purgeSite();

// ---- router against a real SQLite behind a small D1 shim ----
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch { console.log("admin-unit: node:sqlite unavailable, API part skipped (e2e covers it over HTTP)"); }
if (sqlite) {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  db.exec("INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES ('1','Nils','00000000-0000-4000-8000-000000000001',1,1,0),('2','Seller','00000000-0000-4000-8000-000000000002',1,1,0)");
  db.exec("INSERT INTO mc_player_ranks (uuid, name, rank, color, weight, updated_at) VALUES ('00000000000040008000000000000001','Nils','admin','c',100,0),('00000000-0000-4000-8000-000000000002','Seller','vip','6',40,0)");
  db.exec("INSERT INTO entries (name, message, discord_id) VALUES ('A','hallo','7'),('B','spam','8')");
  const stmt = (sql) => { const st = db.prepare(sql); let a = []; const o = { sql, bind(...x) { a = x; return o; }, first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }), run: async () => ({ meta: { changes: Number(st.run(...a).changes) } }), _exec: () => (/^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql) ? { results: st.all(...a), meta: {} } : { meta: { changes: Number(st.run(...a).changes) } }) }; return o; };
  const env = { DB: { prepare: stmt, batch: async (list) => { db.exec("BEGIN"); try { const r = list.map((s) => s._exec()); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } } } };
  const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...h } });
  const users = { a: { id: "1", name: "Nils" }, v: { id: "2", name: "Seller" } };
  const A = makeAdmin({ json, getUser: async (req) => users[req.headers.get("x-u")] || null, MAIN: "nwebnotfound.dev", defaults: { blocks: DEFAULT_BLOCKS } });
  let clock = 1_000_000;
  const call = async (method, path, { u = "a", body, origin = "https://nwebnotfound.dev" } = {}) => {
    const url = new URL("https://nwebnotfound.dev" + path);
    const headers = { ...(u ? { "x-u": u } : {}), ...(origin ? { origin } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) };
    const res = await A.api(url.pathname, new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, url, (clock += 1000));
    return { s: res.status, j: await res.json().catch(() => null), h: res.headers };
  };
  const logN = () => db.prepare("SELECT COUNT(*) AS n FROM admin_log").get().n;

  // only admins; everyone else gets a 404 (also for unknown sections), writes need the Origin
  for (const u of [null, "v"]) for (const [m, p] of [["GET", "/api/admin/projects"], ["POST", "/api/admin/projects"], ["GET", "/api/admin/guestbook"]]) assert.equal((await call(m, p, { u, body: m === "POST" ? { title_de: "x" } : undefined })).s, 404, `${u} ${m} ${p}`);
  assert.equal((await call("GET", "/api/admin/nope")).s, 404);
  assert.equal((await call("POST", "/api/admin/projects", { origin: "https://evil.example", body: { title_de: "x", status: "live", progress: 1 } })).s, 403);
  const g = await call("GET", "/api/admin/projects");
  assert.equal(g.s, 200); assert.match(g.h.get("cache-control"), /private, no-store/);

  // projects: create (sort appended), save with version, stale version -> 409, delete; each write logged
  const c1 = await call("POST", "/api/admin/projects", { body: { title_de: "Eins", status: "live", progress: 10, href: "/about", icon: "about" } });
  const c2 = await call("POST", "/api/admin/projects", { body: { title_de: "Zwei", status: "bald", progress: 3 } });
  assert.equal(c1.s, 201); assert.equal(c2.j.item.sort, c1.j.item.sort + 1);
  assert.equal((await call("POST", "/api/admin/projects", { body: { title_de: "", status: "live", progress: 1 } })).s, 400);
  const sv = await call("PATCH", `/api/admin/projects/${c1.j.item.id}`, { body: { text_de: "Neu", version: 1 } });
  assert.equal(sv.s, 200); assert.equal(sv.j.item.version, 2); assert.equal(sv.j.item.title_de, "Eins", "PATCH merges into the row");
  const stale = await call("PATCH", `/api/admin/projects/${c1.j.item.id}`, { body: { text_de: "Alt", version: 1 } });
  assert.equal(stale.s, 409); assert.equal(stale.j.item.text_de, "Neu", "409 carries the current row");
  const same = await call("PATCH", `/api/admin/projects/${c1.j.item.id}`, { body: { text_de: "Neu", version: 2 } });
  assert.ok(same.j.unchanged, "an identical save writes nothing");
  assert.equal((await call("DELETE", `/api/admin/projects/${c2.j.item.id}`)).s, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM projects").get().n, 1);
  const del = db.prepare("SELECT before_json FROM admin_log WHERE section='projects' AND action='delete'").get();
  assert.ok(del && JSON.parse(del.before_json).title_de === "Zwei", "delete keeps the row in admin_log");
  assert.equal(logN(), 1, "only the delete is logged (creates, saves, the 400, 409 and no-op are not)");

  // news: drafts are not public; publish -> live in siteData (purged at once), withdraw -> draft again
  const n1 = await call("POST", "/api/admin/changelog", { body: { day: "2026-11-08", area: "website", title_de: "Verwaltung", text_de: "Neu." } });
  purgeSite(); let sd = await siteData(env, clock);
  assert.deepEqual(sd.changelog, [], "a draft is not public, but the table is no longer empty (no fallback)");
  const pub = await call("POST", `/api/admin/changelog/${n1.j.item.id}/publish`, { body: { version: 1 } });
  assert.equal(pub.j.item.status, "live");
  sd = await siteData(env, clock);
  assert.equal(sd.changelog[0].title_de, "Verwaltung", "publish purges the cache");
  assert.equal((await call("POST", `/api/admin/changelog/${n1.j.item.id}/withdraw`, { body: { version: 1 } })).s, 409, "withdraw with the old version");
  sd = await siteData(env, clock + 1000);
  assert.equal(sd.projects[0].title_de, "Eins");

  // text blocks: create needs version 0, then each save the current version
  const h0 = await call("GET", "/api/admin/home");
  assert.equal(h0.j.blocks["home.hero"].de, null); assert.equal(h0.j.defaults["home.hero"].de.name, "Nils");
  assert.equal((await call("PATCH", "/api/admin/home/home.hero", { body: { lang: "de", version: 0, data: { name: "Nils", lead: "Neu" } } })).s, 200);
  assert.equal((await call("PATCH", "/api/admin/home/home.hero", { body: { lang: "de", version: 0, data: { name: "Nils", lead: "Zweiter Tab" } } })).s, 409);
  const h2 = await call("PATCH", "/api/admin/home/home.hero", { body: { lang: "de", version: 1, data: { name: "Nils", lead: "Neuer" } } });
  assert.equal(h2.j.version, 2);
  assert.equal((await call("PATCH", "/api/admin/home/home.hero", { body: { lang: "de", version: 2, data: { name: "", lead: "x" } } })).s, 400);
  assert.equal((await siteData(env, clock)).blocks["home.hero"].de.lead, "Neuer");
  const same2 = await call("PATCH", "/api/admin/home/home.hero", { body: { lang: "de", version: 2, data: { name: "Nils", lead: "Neuer" } } });
  assert.ok(same2.j.unchanged && same2.j.version === 2, "an identical text autosave writes nothing");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE section = 'home'").get().n, 0, "text saves add no admin_log rows");

  // guestbook: hide (not public, reversible), delete; filters and counts
  const spam = db.prepare("SELECT id FROM entries WHERE message='spam'").get().id;
  db.exec(`UPDATE entries SET reported = 1 WHERE id = ${spam}`);
  let gb = await call("GET", "/api/admin/guestbook?filter=reported");
  assert.equal(gb.j.items.length, 1); assert.equal(gb.j.counts.reported, 1);
  assert.equal((await call("POST", `/api/admin/guestbook/${spam}/hide`)).s, 200);
  assert.deepEqual({ ...db.prepare(`SELECT hidden, reported FROM entries WHERE id = ${spam}`).get() }, { hidden: 1, reported: 0 }, "hiding clears the report");
  gb = await call("GET", "/api/admin/guestbook?filter=hidden");
  assert.equal(gb.j.items[0].message, "spam");
  assert.equal((await call("POST", `/api/admin/guestbook/${spam}/unhide`)).s, 200);
  assert.equal((await call("DELETE", `/api/admin/guestbook/${spam}`)).s, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM entries").get().n, 1);
  assert.equal((await call("GET", "/api/admin/guestbook?filter=x")).s, 400);

  // runaway guard: more than ADMIN_RATE.max writes a minute -> 429 (reads are not counted)
  const A2 = makeAdmin({ json, getUser: async () => users.a, MAIN: "nwebnotfound.dev" });
  let last = 0;
  for (let i = 0; i <= ADMIN_RATE.max; i++) { const url = new URL("https://nwebnotfound.dev/api/admin/projects/999999"); last = (await A2.api(url.pathname, new Request(url, { method: "DELETE", headers: { origin: "https://nwebnotfound.dev" } }), env, url, 5_000_000)).status; }
  assert.equal(last, 429);
}
console.log("admin-unit ok");
