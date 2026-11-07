#!/usr/bin/env node
// Unit tests for the blog back end (src/blog.js): validation, Markdown XSS, table of contents,
// search escaping, admin-only API, drafts/preview token, autosave conflicts, publish rules, RSS.
// Runs alone (`node scripts/blog-unit.mjs`) and is imported by scripts/e2e.mjs so CI runs it.
// The API part runs against a real SQLite (node:sqlite) loaded with schema.sql behind a tiny D1 shim.
import assert from "node:assert/strict";
import fs from "node:fs";
import { cleanPost, slugify, renderBody, publishProblem, localized, makeBlog } from "../src/blog.js";

// ---- pure helpers ----
assert.equal(slugify("Über Häuser & Bäume!"), "ueber-haeuser-baeume");
assert.equal(slugify("  --  "), "");
assert.equal(slugify("x".repeat(200)).length, 80);
assert.deepEqual(cleanPost({ tags: ["Redstone", "redstone ", "Server  Bau"] }).post.tags, ["redstone", "server bau"]);
assert.ok(cleanPost({ tags: ['a"b'] }).error, "quotes in tags rejected");
assert.ok(cleanPost({ tags: new Array(9).fill("x") }).error, "max 8 tags");
assert.ok(cleanPost({ slug: "Bad Slug" }).error && cleanPost({ slug: "-x" }).error && !cleanPost({ slug: "gut-1" }).error);
assert.match(cleanPost({ slug: "admin" }).error, /reserved/, "editor route can't be a slug (Gatekeeper #106)");
assert.equal(publishProblem({ title_de: "T", body_de: "b", slug: "admin", category: "bauen" }), "slug invalid");
assert.ok(cleanPost({ category: "spam" }).error && !cleanPost({ category: "musik" }).error);
assert.ok(cleanPost({ title_de: "x".repeat(141) }).error && cleanPost({ body_de: 5 }).error && cleanPost([]).error);
assert.deepEqual(Object.keys(cleanPost({ title_de: "T", evil: 1, status: "published", preview_token: "x" }).post), ["title_de"], "unknown fields are dropped");
assert.equal(publishProblem({ title_de: "T", body_de: " ", slug: "t", category: "bauen" }), "body_de missing");
assert.equal(publishProblem({ title_de: "T", body_de: "b", slug: "t", category: "bauen" }), null);

// XSS: raw HTML, javascript:/data: links, event handlers, heading HTML; ids are safe slugs.
const evil = [
  "# <script>alert(1)</script> Titel",
  '<img src=x onerror="alert(1)">',
  "[klick](javascript:alert(1)) [d](data:text/html,<b>x</b>) [ok](https://example.com)",
  "## Zwei",
  "## Zwei",
  "![x](https://evil.example/x.png)",
  "```html\n<script>alert(2)</script>\n```",
].join("\n\n");
const r = renderBody(evil);
// Escaped text like "&lt;img onerror=…" is fine; no live tag, handler attribute or unsafe URL may survive.
assert.ok(!/<script|<img|<[^>]*\son\w+=|(?:href|src)="(?:javascript|data):/i.test(r.html), "no executable HTML: " + r.html);
assert.ok(!r.html.includes("evil.example"), "remote images are dropped");
assert.ok(r.html.includes('href="https://example.com"') && r.html.includes("&lt;script&gt;"));
assert.deepEqual(r.toc.map((h) => h.id), ["h-script-alert-1-script-titel", "h-zwei", "h-zwei-2"]);
assert.ok(r.toc.every((h) => /^h-[a-z0-9-]+$/.test(h.id)) && r.toc[0].text === "<script>alert(1)</script> Titel");
assert.equal(localized({ title_de: "D", body_de: "d", title_en: "E", body_en: "  ", tags: "[]" }, "en").lang, "de", "EN only with an EN body");

// ---- API against SQLite ----
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch { console.log("blog-unit: node:sqlite unavailable, API part skipped (e2e covers it over HTTP)"); }
if (sqlite) {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  db.exec("INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES ('1','Nils','00000000-0000-4000-8000-000000000001',1,1,0),('2','Seller','00000000-0000-4000-8000-000000000002',1,1,0),('3','Fake','00000000-0000-4000-8000-000000000003',1,0,0)");
  db.exec("INSERT INTO mc_player_ranks (uuid, name, rank, color, weight, updated_at) VALUES ('00000000000040008000000000000001','Nils','admin','c',100,0),('00000000-0000-4000-8000-000000000002','Seller','vip','6',40,0),('00000000-0000-4000-8000-000000000003','Fake','admin','c',100,0)");
  const D1 = { prepare(sql) { const st = db.prepare(sql); let a = []; const o = { bind(...x) { a = x; return o; }, first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }), run: async () => ({ meta: { changes: Number(st.run(...a).changes) } }) }; return o; } };
  const env = { DB: D1 };
  const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...h } });
  const users = { a: { id: "1", name: "Nils" }, v: { id: "2", name: "Seller" }, f: { id: "3", name: "Fake" } };
  let n = 0;
  const B = makeBlog({ json, getUser: async (req) => users[req.headers.get("x-u")] || null, html: (h, s = 200, extra = {}) => new Response(h, { status: s, headers: { "content-type": "text/html", ...extra } }), sitePage: ({ body }) => body, rand: () => "tok" + String(++n).padStart(24, "0"), safeEq: (a, b) => a === b, MAIN: "nwebnotfound.dev", notFound: () => new Response("nf", { status: 404 }) });
  const call = async (method, path, { u, body, origin = "https://nwebnotfound.dev", ct = "application/json" } = {}) => {
    const url = new URL("https://nwebnotfound.dev" + path);
    const headers = { ...(u ? { "x-u": u } : {}), ...(origin ? { origin } : {}), ...(body !== undefined ? { "content-type": ct } : {}) };
    const res = await B.api(url.pathname, new Request(url, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env, url);
    return { s: res.status, j: await res.json().catch(() => null), h: res.headers };
  };
  const page = async (path, u) => { const url = new URL("https://nwebnotfound.dev" + path); const res = await B.page(url.pathname, new Request(url, { headers: u ? { "x-u": u } : {} }), env, url, "de"); return { s: res.status, t: await res.text(), h: res.headers }; };

  // Admin only, server-side: logged out 401, non-admin 403, unverified link with admin rank 403.
  for (const [u, s] of [[undefined, 401], ["v", 403], ["f", 403]]) {
    assert.equal((await call("GET", "/api/blog/admin/posts", { u })).s, s, `list as ${u}`);
    assert.equal((await call("POST", "/api/blog/admin/posts", { u, body: { title_de: "x" } })).s, s, `create as ${u}`);
    assert.equal((await call("POST", "/api/blog/admin/render", { u, body: { md: "x" } })).s, s, `render as ${u}`);
    assert.equal((await page("/blog/admin", u)).s, u ? 404 : 302, `editor page as ${u}`);
  }
  assert.equal((await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "x" }, origin: "https://evil.example" })).s, 403, "foreign origin");
  assert.equal((await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "x" }, origin: null })).s, 403, "no origin");
  assert.equal((await call("POST", "/api/blog/admin/posts", { u: "a", body: "title_de=x", ct: "application/x-www-form-urlencoded" })).s, 415, "form posts rejected");
  assert.equal((await page("/blog/admin", "a")).s, 200);

  // Reserved slugs: explicit "admin" refused, a post titled "Admin" gets admin-1, /blog/admin stays the editor.
  assert.equal((await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "x", slug: "admin" } })).s, 400);
  const adm = await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "Admin" } });
  assert.equal(adm.j.slug, "admin-1");
  assert.equal((await call("PUT", `/api/blog/admin/posts/${adm.j.id}`, { u: "a", body: { base: adm.j.updated_at, slug: "admin" } })).s, 400);
  // Create a draft, autosave, conflict from a stale tab.
  const c = await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "Mein Haus <b>", category: "bauen", tags: ["holz"] } });
  assert.equal(c.s, 201); assert.equal(c.j.slug, "mein-haus-b");
  const id = c.j.id;
  assert.equal((await call("GET", "/api/blog/post/mein-haus-b")).s, 404, "draft hidden from the public");
  assert.equal((await page("/blog/mein-haus-b")).s, 404);
  let s1 = await call("PUT", `/api/blog/admin/posts/${id}`, { u: "a", body: { base: c.j.updated_at, body_de: "# Hallo\n\n<script>x</script>", summary_de: "Kurz" } });
  assert.equal(s1.s, 200);
  const stale = await call("PUT", `/api/blog/admin/posts/${id}`, { u: "a", body: { base: c.j.updated_at, body_de: "alt" } });
  assert.equal(stale.s, 409); assert.equal(stale.j.updated_at, s1.j.updated_at);
  assert.equal((await call("GET", `/api/blog/admin/posts/${id}`, { u: "a" })).j.body_de, "# Hallo\n\n<script>x</script>", "stale save did not overwrite");
  // Preview token: wrong token 404, right token shows the draft (noindex, private).
  const tok = c.j.preview_token;
  assert.equal((await call("GET", `/api/blog/post/mein-haus-b?preview=${"x".repeat(32)}`)).s, 404);
  const pv = await page(`/blog/mein-haus-b?preview=${tok}`);
  assert.equal(pv.s, 200); assert.ok(pv.t.includes("Vorschau (nicht veröffentlicht)") && !pv.t.includes("<script>x") && pv.t.includes("Mein Haus &lt;b&gt;"));
  assert.match(pv.h.get("cache-control") || "", /no-store/);
  const rot = await call("POST", `/api/blog/admin/posts/${id}/preview-token`, { u: "a", body: {} });
  assert.equal((await page(`/blog/mein-haus-b?preview=${tok}`)).s, 404, "old preview link revoked");
  assert.equal((await page(`/blog/mein-haus-b?preview=${rot.j.preview_token}`)).s, 200);

  const baseOf = async (pid) => (await call("GET", `/api/blog/admin/posts/${pid}`, { u: "a" })).j.updated_at;
  // Publish rules, published list, search (title and tags; LIKE wildcards are literal), categories.
  const e = await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "" } });
  assert.equal((await call("POST", `/api/blog/admin/posts/${e.j.id}/status`, { u: "a", body: { status: "published", base: await baseOf(e.j.id) } })).j.error, "title_de missing");
  // Status changes need the editor's base: missing 400, stale 409 (a stale tab can't publish), status unchanged.
  assert.equal((await call("POST", `/api/blog/admin/posts/${id}/status`, { u: "a", body: { status: "published" } })).s, 400);
  const st = await call("POST", `/api/blog/admin/posts/${id}/status`, { u: "a", body: { status: "published", base: c.j.updated_at } });
  assert.equal(st.s, 409); assert.equal(st.j.error, "conflict");
  assert.equal((await call("GET", "/api/blog/post/mein-haus-b")).s, 404, "stale status request published nothing");
  const pub = await call("POST", `/api/blog/admin/posts/${id}/status`, { u: "a", body: { status: "published", base: await baseOf(id) } });
  assert.equal(pub.s, 200);
  const list = await call("GET", "/api/blog");
  assert.deepEqual(list.j.posts.map((p) => p.slug), ["mein-haus-b"]);
  assert.ok(!("body" in list.j.posts[0]) && !("preview_token" in list.j.posts[0]));
  assert.equal((await call("GET", "/api/blog?q=HAUS")).j.posts.length, 1, "title search, case-insensitive");
  assert.equal((await call("GET", "/api/blog?q=holz")).j.posts.length, 1, "tag search");
  assert.equal((await call("GET", "/api/blog?q=%25")).j.posts.length, 0, "% is literal");
  assert.equal((await call("GET", "/api/blog?q=_")).j.posts.length, 0, "_ is literal");
  assert.equal((await call("GET", "/api/blog?cat=musik")).j.posts.length, 0);
  const post = await call("GET", "/api/blog/post/mein-haus-b");
  assert.ok(post.j.html.includes('<h2 id="h-hallo">Hallo</h2>') && post.j.html.includes("&lt;script&gt;x&lt;/script&gt;"));
  // A published post can't be saved into an unpublishable state; slug collisions are 409.
  const pubBase = (await call("GET", `/api/blog/admin/posts/${id}`, { u: "a" })).j.updated_at;
  assert.equal((await call("PUT", `/api/blog/admin/posts/${id}`, { u: "a", body: { base: pubBase, body_de: "" } })).s, 400);
  const other = await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "Zwei", slug: "zwei" } });
  assert.equal((await call("PUT", `/api/blog/admin/posts/${other.j.id}`, { u: "a", body: { base: other.j.updated_at, slug: "mein-haus-b" } })).s, 409);
  assert.equal((await call("POST", "/api/blog/admin/posts", { u: "a", body: { title_de: "x", slug: "zwei" } })).j.error, "slug_taken");
  // Withdrawn posts leave the public list; the admin still sees them.
  await call("POST", `/api/blog/admin/posts/${id}/status`, { u: "a", body: { status: "withdrawn", base: await baseOf(id) } });
  assert.equal((await call("GET", "/api/blog")).j.posts.length, 0);
  assert.equal((await call("GET", "/api/blog/post/mein-haus-b", { u: "a" })).s, 200);
  await call("POST", `/api/blog/admin/posts/${id}/status`, { u: "a", body: { status: "published", base: await baseOf(id) } });
  // RSS: well-formed enough, escaped title, sanitised body inside CDATA.
  const feed = await (await B.page("/blog/feed.xml", new Request("https://nwebnotfound.dev/blog/feed.xml"), env, new URL("https://nwebnotfound.dev/blog/feed.xml"), "de")).text();
  assert.ok(feed.startsWith("<?xml") && feed.includes("<title>Mein Haus &lt;b&gt;</title>") && feed.includes("https://nwebnotfound.dev/blog/mein-haus-b") && !feed.includes("<script>x"));
  // Public pages escape everything.
  const lp = await page("/blog?q=%3Cscript%3E");
  assert.ok(lp.s === 200 && !lp.t.includes("<script>") && lp.t.includes("&lt;script&gt;"));
}

console.log("blog-unit ok");
