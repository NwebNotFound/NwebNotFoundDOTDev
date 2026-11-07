#!/usr/bin/env node
// Issue #82: /mc-icon/ hält keinen unbegrenzten Cache mehr und weist Unsinns-IDs ab; /mc-head/ und
// /mc-skin/ cachen Negativ-Ergebnisse und drosseln Cache-Fehlgriffe pro IP.
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { resolveIcon, iconCacheSize } from "../src/mc-icon.js";
import { headResponse, skinResponse, MISS_LIMIT, RETRY_MS } from "../src/mc-head.js";

const env = { DB: { prepare: () => { const s = { bind: () => s, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: {} }) }; return s; } } };
const go = (path) => worker.fetch(new Request("https://mc.nwebnotfound.dev" + path, { headers: { host: "mc.nwebnotfound.dev" }, redirect: "manual" }), env, { waitUntil() {} });

// ---- /mc-icon/ ----
assert.equal((await go("/mc-icon/v2/diamond")).status, 302, "gültige ID → 302");
assert.equal((await go("/mc-icon/v2/minecraft:diamond.png")).status, 302, "minecraft:-Präfix und .png sind erlaubt");
assert.equal((await go("/mc-icon/v2/DIAMOND")).status, 302, "Großschreibung wird normalisiert");
assert.equal((await go("/mc-icon/v2/" + "a".repeat(49))).status, 404, "zu lange ID → 404");
assert.equal((await go("/mc-icon/v2/" + "x".repeat(8192))).status, 404, "8-KB-ID → 404");
assert.equal((await go("/mc-icon/v2/foo%20bar")).status, 404, "Sonderzeichen → 404");
assert.equal((await go("/mc-icon/v2/%E0%A4%A")).status, 404, "kaputtes %-Encoding → 404");
for (let i = 0; i < 6000; i++) resolveIcon("zz_unknown_" + i);
assert.ok(iconCacheSize() <= 4096, "Icon-Cache bleibt begrenzt: " + iconCacheSize());
assert.ok(resolveIcon("diamond"), "nach Verdrängung weiterhin auflösbar");

// ---- /mc-head/ und /mc-skin/: Negativ-Cache ----
const store = new Map();
globalThis.caches = { default: { match: async (k) => { const r = store.get(typeof k === "string" ? k : k.url); return r ? r.clone() : undefined; }, put: async (k, r) => { store.set(typeof k === "string" ? k : k.url, r.clone()); } } };
RETRY_MS.v = 0;
let calls = 0; const down = async () => { calls++; return new Response("", { status: 404 }); };
const STEVE = new Uint8Array(200).fill(7);
const envA = { ASSETS: { fetch: async () => new Response(STEVE, { headers: { "content-type": "image/png" } }) } };
const hreq = (p, ip = "198.51.100.1") => new Request("https://mc.nwebnotfound.dev" + p, { headers: { "cf-connecting-ip": ip } });
let r = await headResponse(hreq("/mc-head/NoSuchPlayer1"), "/mc-head/NoSuchPlayer1", null, envA, down);
assert.equal(r.status, 200); assert.equal(r.headers.get("x-skin-source"), "asset:steve");
const first = calls; assert.ok(first > 0, "erster Abruf fragt Upstream");
r = await headResponse(hreq("/mc-head/NoSuchPlayer1"), "/mc-head/NoSuchPlayer1", null, envA, down);
assert.equal(r.status, 200); assert.equal(calls, first, "unbekannter Name: zweiter Abruf kommt aus dem Negativ-Cache, kein Upstream");
calls = 0;
r = await skinResponse(hreq("/mc-skin/NoSuchPlayer2"), "/mc-skin/NoSuchPlayer2", null, null, down); assert.equal(r.status, 404);
const sfirst = calls;
r = await skinResponse(hreq("/mc-skin/NoSuchPlayer2"), "/mc-skin/NoSuchPlayer2", null, null, down); assert.equal(r.status, 404);
assert.equal(calls, sfirst, "Skin-404 wird negativ gecacht");

// ---- Drossel pro IP für Cache-Fehlgriffe ----
calls = 0; const ip = "203.0.113.99";
for (let i = 0; i < MISS_LIMIT.perMin; i++) await headResponse(hreq("/mc-head/Rnd" + i, ip), "/mc-head/Rnd" + i, null, envA, down);
const before = calls;
r = await headResponse(hreq("/mc-head/RndX", ip), "/mc-head/RndX", null, envA, down);
assert.equal(r.status, 200, "über dem Limit: lokaler Steve"); assert.equal(calls, before, "über dem Limit kein Upstream-Abruf");
assert.ok(/max-age=60$/.test(r.headers.get("cache-control")), "gedrosselte Antwort nur kurz cachebar");
r = await skinResponse(hreq("/mc-skin/RndY", ip), "/mc-skin/RndY", null, null, down); assert.equal(r.status, 429, "Skin über dem Limit → 429");
r = await headResponse(hreq("/mc-head/NoSuchPlayer1", ip), "/mc-head/NoSuchPlayer1", null, envA, down); assert.equal(r.status, 200, "Cache-Treffer gehen trotz Limit durch");
r = await headResponse(hreq("/mc-head/RndZ", "203.0.113.100"), "/mc-head/RndZ", null, envA, down); assert.ok(calls > before, "andere IP nicht betroffen");
delete globalThis.caches;
console.log("dos-unit: alle Tests grün");
