#!/usr/bin/env node
// Local request/byte/cache measurement for the baseline pages (perf/baseline-2026-11-05.md).
// Usage: node scripts/perf-measure.mjs <baseUrl> <out.json> [shotDir]
// Needs a running `wrangler dev` whose .dev.vars sets MC_INGEST_TOKEN=e2e-token (the test-host
// header then selects nwebnotfound.dev or mc.nwebnotfound.dev). Per page and width: a fresh browser
// context (cold), then a second navigation in the same context (warm). Counted via CDP:
// requests = every network request incl. redirect hops and cross-origin; wire = those not served
// from memory/disk cache; KiB = summed encodedDataLength.
import fs from "node:fs";
import { chromium } from "playwright";

const [BASE, OUT, SHOTS] = process.argv.slice(2);
const PAGES = [
  ["main", "/"], ["main", "/de"], ["main", "/portfolio"], ["main", "/guestbook"],
  ["mc", "/"], ["mc", "/spieler"], ["mc", "/spieler/NwebNotFound"], ["mc", "/wiki"], ["mc", "/wiki/economy"],
  ["mc", "/changelog"], ["mc", "/leaderboards"], ["mc", "/markt"], ["mc", "/vip"],
];
const HOST = { main: "nwebnotfound.dev", mc: "mc.nwebnotfound.dev" };

async function pass(page, cdp, url) {
  const reqs = new Map(); let redirects = 0;
  const onReq = (e) => { if (e.redirectResponse) redirects++; reqs.set(e.requestId, { url: e.request.url, cached: false, bytes: 0, status: 0, cc: "" }); };
  const onResp = (e) => { const r = reqs.get(e.requestId); if (!r) return; r.status = e.response.status; r.cached = !!(e.response.fromDiskCache || e.response.fromPrefetchCache) || r.cached; r.cc = e.response.headers["cache-control"] || e.response.headers["Cache-Control"] || ""; };
  const onMem = (e) => { reqs.set(e.requestId, { url: e.request.url, cached: true, bytes: 0, status: 200, cc: "" }); };
  const onFin = (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; };
  cdp.on("Network.requestWillBeSent", onReq); cdp.on("Network.responseReceived", onResp);
  cdp.on("Network.requestServedFromCache", (e) => { const r = reqs.get(e.requestId); if (r) r.cached = true; });
  cdp.on("Network.loadingFinished", onFin);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  cdp.off("Network.requestWillBeSent", onReq); cdp.off("Network.responseReceived", onResp); cdp.off("Network.loadingFinished", onFin);
  const list = [...reqs.values()];
  const wire = list.filter((r) => !r.cached);
  return { requests: list.length + redirects, wire: wire.length + redirects, kib: Math.round(list.reduce((s, r) => s + r.bytes, 0) / 1024),
    revalidated: wire.filter((r) => r.status === 304).length, list: list.map((r) => `${r.cached ? "C" : r.status} ${r.url.replace(BASE, "")} [${r.cc}]`) };
}

const browser = await chromium.launch();
const out = [];
for (const width of [375, 1280]) {
  for (const [site, path] of PAGES) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, extraHTTPHeaders: { "x-nnf-test-host": HOST[site] }, reducedMotion: "reduce" });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send("Network.enable");
    const cold = await pass(page, cdp, BASE + path);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${site}${path.replace(/\//g, "_") || "_"}-${width}.png`, fullPage: true }); }
    const warm = await pass(page, cdp, BASE + path);
    out.push({ site, path, width, cold, warm });
    console.log(`${site} ${path} ${width}: cold ${cold.requests} req ${cold.kib} KiB, warm ${warm.wire} on wire (${warm.revalidated} x 304)`);
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
