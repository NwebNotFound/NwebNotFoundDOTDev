#!/usr/bin/env node
// Unit tests for the NwebOS shell (src/nwebos.js): opt-in switch, OS paths, server-rendered content
// (escaping, current app first, both languages), no Microsoft names or assets, icon sprite in sync.
// Runs alone (`node scripts/nwebos-unit.mjs`) and is imported by scripts/e2e.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { nwebosPage, nwebosChoice, nwebosApp, OS_PATHS, APPS } from "../src/nwebos.js";
import { buildSprite } from "./build-nwebos-icons.mjs";

const U = (q = "") => new URL("https://nwebnotfound.dev/guestbook" + q);
assert.deepEqual(nwebosChoice(U(), {}), { on: false, setCookie: null }, "off without the cookie");
assert.equal(nwebosChoice(U(), { nnf_os: "1" }).on, true);
assert.match(nwebosChoice(U("?nwebos=1"), {}).setCookie, /^nnf_os=1; Path=\/; Max-Age=\d+; Secure; SameSite=Lax$/);
assert.match(nwebosChoice(U("?nwebos=0"), { nnf_os: "1" }).setCookie, /Max-Age=0/);
assert.equal(nwebosChoice(U(), {}, true).on, true, "default-on (switch-over PR) unless opted out");
assert.equal(nwebosChoice(U(), { nnf_os: "0" }, true).on, false);
assert.deepEqual(OS_PATHS, ["/", "/about", "/portfolio", "/guestbook"]);
assert.equal(nwebosApp("/"), ""); assert.equal(nwebosApp("/guestbook"), "guestbook"); assert.equal(nwebosApp("/blog"), null, "blog stays the old page in this PR");

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
assert.equal(fs.readFileSync(new URL("../public/design/nwebos-icons.svg", import.meta.url), "utf8"), sprite, "public/design/nwebos-icons.svg is out of date: node scripts/build-nwebos-icons.mjs");
console.log("nwebos-unit ok");
