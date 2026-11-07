#!/usr/bin/env node
// Unit tests for the NwebOS shell (src/nwebos.js): opt-in switch, OS paths, server-rendered content
// (escaping, current app first, both languages), no Microsoft names or assets, icon sprite in sync.
// Runs alone (`node scripts/nwebos-unit.mjs`) and is imported by scripts/e2e.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { nwebosPage, nwebosChoice, nwebosApp, nwebosRoute, OS_PATHS, APPS } from "../src/nwebos.js";
import { blogList, blogPost, notfound, profile, changelog } from "../src/nwebos-apps.js";
import { buildSprite } from "./build-nwebos-icons.mjs";

const U = (q = "") => new URL("https://nwebnotfound.dev/guestbook" + q);
assert.deepEqual(nwebosChoice(U(), {}), { on: false, setCookie: null }, "off without the cookie");
assert.equal(nwebosChoice(U(), { nnf_os: "1" }).on, true);
assert.match(nwebosChoice(U("?nwebos=1"), {}).setCookie, /^nnf_os=1; Path=\/; Max-Age=\d+; Secure; SameSite=Lax$/);
assert.match(nwebosChoice(U("?nwebos=0"), { nnf_os: "1" }).setCookie, /^nnf_os=0; Path=\/; Max-Age=31536000;/, "opt-out is remembered, not just cleared");
assert.equal(nwebosChoice(U(), {}, true).on, true, "default-on (switch-over PR) unless opted out");
assert.equal(nwebosChoice(U(), { nnf_os: "0" }, true).on, false);
assert.deepEqual(OS_PATHS, ["/", "/about", "/portfolio", "/blog", "/music", "/writing", "/guestbook", "/trash", "/profile", "/changelog", "/pixelwand"]);
assert.equal(nwebosApp("/"), ""); assert.equal(nwebosApp("/guestbook"), "guestbook"); assert.equal(nwebosApp("/blog"), "blog");
// every main-site page is a window: posts and chapters by pattern; the editor, feeds and unknown paths are not
assert.equal(nwebosRoute("/blog/eine-navigation").k, "blog-post"); assert.equal(nwebosRoute("/blog/eine-navigation").m[1], "eine-navigation");
for (const p of ["/blog/admin", "/blog/feed", "/blog/-x", "/blog/a/b", "/sommerfest", "/writing/x", "/api/blog"]) assert.equal(nwebosRoute(p), null, p);
assert.deepEqual([nwebosRoute("/writing/roman/3").k, nwebosRoute("/writing/roman/3").m[2]], ["chapter", "3"]);
// dynamic windows only on their own address; 404 window keeps the status; search index without the blog
const post = nwebosPage({ app: "blog-post", path: "/blog/x", title: "Ein <Titel>", content: { "blog-post": "<p>inhalt</p>" } });
assert.ok(post.includes('id="app-blog-post"') && post.includes("<title>Ein &lt;Titel&gt; · NwebOS</title>") && !nwebosPage({ app: "about" }).includes('id="app-blog-post"'));
const nf = nwebosPage({ app: "notfound", path: "/sommerfest", content: { notfound: notfound("de", "/sommerfest") }, status: 404 });
assert.ok(nf.includes('"status":404') && nf.includes("/sommerfest") && nf.includes('id="app-notfound"'));
const idx = JSON.parse(/<script type="application\/json" id="os-l">(.*?)<\/script>/.exec(nwebosPage({}))[1]).idx;
assert.ok(idx.some((r) => r.t === "Blog" && r.p === "/blog") && idx.some((r) => /^Wiki: /.test(r.t) && r.url.startsWith("https://mc.nwebnotfound.dev/wiki/")) && !idx.some((r) => r.k === "soon"));
// app markup escapes user and post data
const bl = blogList("de", [{ slug: "a", category: "bauen", tags: ["<b>"], title: "<img src=x>", summary: "s", published_at: 1794059416661, body_len: 900, hearts: 2 }]);
assert.ok(!bl.includes("<img src=x>") && bl.includes("&lt;img src=x&gt;") && !bl.includes("#<b>"));
assert.ok(profile("de", null).includes("Mit Discord anmelden") && !profile("de", null).includes("data-pf-delete"), "guest profile: sign-in prompt, no data");

const evil = { name: '"><img src=x onerror=alert(1)>', message: "<script>alert(2)</script>", created_at: "2026-11-07 10:00:00", avatar: 'https://cdn.discordapp.com/x.png"onload="alert(3)' };
const gb = nwebosPage({ lang: "de", app: "guestbook", entries: [evil], sitekey: "0xKEY" });
assert.ok(!/<script>alert|<img src=x|"onload=/.test(gb), "entries are escaped");
assert.ok(gb.indexOf('id="app-guestbook"') < gb.indexOf('id="app-about"'), "current app first (no-JS readers, crawlers)");
assert.match(gb, /<title>Gästebuch · NwebOS<\/title>/);
assert.ok(gb.includes('<link rel="canonical" href="https://nwebnotfound.dev/guestbook">') && gb.includes('hreflang="en" href="https://nwebnotfound.dev/en/guestbook"'));
assert.ok(gb.includes('"sitekey":"0xKEY"') && !/<script(?![^>]*(src=|type="application\/json"))/.test(gb), "no inline executable script (CSP)");
const en = nwebosPage({ lang: "en", app: "about" });
assert.ok(en.startsWith("<!doctype html>\n<html lang=\"en\"") && en.includes("Hi, I'm Nils.") && en.includes('href="/en/portfolio"') && en.includes("<title>About me · NwebOS</title>"));
const home = nwebosPage({ lang: "de" });
assert.ok(home.includes('<link rel="canonical" href="https://nwebnotfound.dev/">') && home.includes('class="dicon" href="/blog"') && home.includes(`href="https://mc.nwebnotfound.dev/"`));
for (const a of APPS.filter((x) => x.win)) assert.ok(home.includes(`data-open="${a.k}"`), a.k);
// Rule 10: no Minecraft head on the main site; Discord only. No Microsoft names or assets.
for (const page of [gb, en, home]) {
  assert.ok(!page.includes("/mc-head/"), "no MC head on the main domain");
  assert.ok(!/windows|microsoft|\bxp\b|bliss|luna/i.test(page.replace(/window/gi, "")), "no Microsoft names");
}
const js = fs.readFileSync(new URL("../public/design/nwebos.js", import.meta.url), "utf8"), css = fs.readFileSync(new URL("../public/design/nwebos.css", import.meta.url), "utf8");
assert.ok(!/<canvas|getContext\(|requestAnimationFrame|addEventListener\("(scroll|resize)"/.test(js), "perf budget: no canvas, no rAF loop, no scroll/resize listeners");
assert.ok(!/microsoft|windows xp|tahoma\.ttf|segoe.*\.woff/i.test(css) && !/url\((?!\/design\/|\/mc-icon\/)/.test(css), "only our own assets in CSS");
// The committed sprite matches its source.
const sprite = buildSprite(JSON.parse(fs.readFileSync(new URL("./nwebos-icons.json", import.meta.url), "utf8")));
assert.equal(fs.readFileSync(new URL("../public/design/nwebos-icons.svg", import.meta.url), "utf8").replace(/\r\n/g, "\n"), sprite,   // a Windows checkout may have CRLF
  "public/design/nwebos-icons.svg is out of date: node scripts/build-nwebos-icons.mjs");
console.log("nwebos-unit ok");
// Neuigkeiten: one row per change, also when the mc changelog repeats a website change of that day (Design QA #115)
{ const titles = [...changelog("de").matchAll(/<li data-t="[^"]+">.*?<b>([^<]+)<\/b>/g)].map((m) => m[1]); assert.ok(titles.length > 0 && new Set(titles).size === titles.length, "changelog rows unique: " + titles.join(" | ")); }
