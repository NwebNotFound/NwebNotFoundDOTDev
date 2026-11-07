#!/usr/bin/env node
// Runtime (jank) measurement for the baseline pages: CPU throttled 4x via CDP, mobile (375, touch)
// and desktop (1280). Usage: node scripts/perf-runtime.mjs <baseUrl> <out.json> [pagesFilter]
// Needs `wrangler dev` with .dev.vars MC_INGEST_TOKEN=e2e-token (test-host header picks the site).
// Per page: LCP, CLS, long tasks + TBT during load (until 4 s after load), idle main-thread busy
// share over 3 s without input (always-running animations/timers), scroll FPS and frames > 50 ms
// during a 3 s wheel/touch scroll, and the slowest event duration of one tap/click on the nav
// toggle (INP proxy, Event Timing).
import fs from "node:fs";
import { chromium } from "playwright";

const [BASE, OUT, FILTER] = process.argv.slice(2);
const PAGES = [
  ["main", "/"], ["main", "/de"], ["main", "/portfolio"], ["main", "/guestbook"],
  ["mc", "/"], ["mc", "/spieler"], ["mc", "/spieler/NwebNotFound"], ["mc", "/wiki"], ["mc", "/changelog"],
  ["mc", "/leaderboards"], ["mc", "/markt"], ["mc", "/vip"],
].filter(([s, p]) => !FILTER || (s + p).includes(FILTER));
const HOST = { main: "nwebnotfound.dev", mc: "mc.nwebnotfound.dev" };

const INIT = () => {
  window.__perf = { lcp: 0, cls: 0, long: [], events: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.events.push(e.duration); }).observe({ type: "event", buffered: true, durationThreshold: 16 });
};

// Idle is measured WITHOUT a rAF sampler: a running rAF loop makes Chrome run a main frame every
// vsync, which then also ticks composited CSS animations and inflates the style count. The frame
// sampler only runs during the scroll pass (FPS).
async function busy(cdp, ms, page, during) {
  const m = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const a = await m();
  if (during) await page.evaluate(() => { window.__fr = []; let last = performance.now(); const tick = (t) => { window.__fr.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); }; window.__raf = requestAnimationFrame(tick); });
  if (during) await during(); else await page.waitForTimeout(ms);
  const fr = during ? await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__fr; }) : [];
  const b = await m();
  const task = b.TaskDuration - a.TaskDuration, wall = b.Timestamp - a.Timestamp;
  const dropped = fr.filter((d) => d > 50).length;
  const fps = fr.length ? Math.round((fr.length / (fr.reduce((s, d) => s + d, 0) / 1000)) * 10) / 10 : 0;
  return { busyPct: Math.round((task / wall) * 1000) / 10, fps, dropped, layouts: b.LayoutCount - a.LayoutCount, styles: b.RecalcStyleCount - a.RecalcStyleCount };
}

const browser = await chromium.launch();
const out = [];
for (const width of [375, 1280]) {
  for (const [site, path] of PAGES) {
    const mobile = width === 375;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 812 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, extraHTTPHeaders: { "x-nnf-test-host": HOST[site], ...(process.env.PERF_COOKIE ? { cookie: process.env.PERF_COOKIE } : {}) } });
    // Main pages are NwebOS by default (PERF_COOKIE=nnf_os=0 measures the old pages); booted/user set = straight to the desktop
    const os = site === "main" && !/nnf_os=0/.test(process.env.PERF_COOKIE || "");
    if (os) await ctx.addInitScript(() => { try { localStorage.setItem("nwebos.booted", "1"); localStorage.setItem("nwebos.user", "gast"); } catch (e) {} });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Performance.enable");
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    const load = await page.evaluate(() => { const p = window.__perf; return { lcp: Math.round(p.lcp), cls: Math.round(p.cls * 1000) / 1000, longTasks: p.long.length, tbt: Math.round(p.long.reduce((s, [, d]) => s + Math.max(0, d - 50), 0)) }; });
    const idle = await busy(cdp, 3000, page);
    const scroll = await busy(cdp, 0, page, async () => {
      const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      if (h <= 0) { await page.waitForTimeout(3000); return; }
      for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, Math.max(60, Math.round(h / 30))); await page.waitForTimeout(100); }
    });
    await page.evaluate(() => { window.scrollTo(0, 0); window.__perf.events = []; });
    await page.waitForTimeout(300);
    const toggle = os ? (mobile ? "[data-home]" : "#startb") : mobile ? "[data-unav] .u-burger, [data-unav] button[aria-controls]" : "[data-unav] .u-gbtn, [data-unav] button[aria-controls]";
    const btn = page.locator(toggle).first();
    let inp = null;
    if (await btn.count()) {
      try { if (mobile) await btn.tap({ timeout: 2000 }); else await btn.click({ timeout: 2000 }); await page.waitForTimeout(800); inp = await page.evaluate(() => Math.round(Math.max(0, ...window.__perf.events))); } catch { inp = null; }
    }
    const row = { site, path, width, ...load, idleBusyPct: idle.busyPct, idleStyles: idle.styles, idleLayouts: idle.layouts, scrollFps: scroll.fps, scrollDropped: scroll.dropped, scrollBusyPct: scroll.busyPct, inp };
    out.push(row);
    console.log(JSON.stringify(row));
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
