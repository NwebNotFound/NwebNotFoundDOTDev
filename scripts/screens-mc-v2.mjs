#!/usr/bin/env node
// Before/after screenshots for the Minecraft surface redesign (Summer Theme v2, artboards Mc*).
//
//   node scripts/screens-mc-v2.mjs --serve            # starts a local wrangler dev, seeds fixtures, captures
//   node scripts/screens-mc-v2.mjs                    # expects http://127.0.0.1:8791 to answer already
//   node scripts/screens-mc-v2.mjs --only mockup      # only re-render the artboards
//   node scripts/screens-mc-v2.mjs --mockups <dir>    # where the Mc*.html artboards live
//
// Output (default --out docs/screens/v2/mc):
//   mockup-<page>-1280.png   the artboard from the mockup set
//   mockup-<page>-390.png    the artboard at phone width
//   neu-<page>-1280.png      the implementation at 1280x900
//   neu-<page>-390.png       the implementation at 390x844
//
// The artboards pull Pixelify Sans and Nunito from Google Fonts, which the site must not do; the
// capture injects @font-face rules that point at the same self-hosted OFL files the theme uses, so
// the comparison is font-for-font identical. The impl run also prints a style probe (computed
// animation names with and without prefers-reduced-motion, plus the geometry contract of cards,
// buttons and focus rings) as JSON on stdout.
//
// Notes on the local run: a fresh D1 under .wrangler/screens-mc is created per run and seeded through
// the public ingest API — the same path the bot uses — so no production data is ever touched.

import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { webcrypto as C } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SERVED = !args.includes("--no-serve");
const SERVE = args.includes("--serve");
const ONLY = opt("only", "all");
const MC = opt("mc", "http://127.0.0.1:8791");
const MOCK_DIR = path.resolve(opt("mockups", "/w/mockups"));
const OUT = path.resolve(ROOT, opt("out", "docs/screens/v2/mc"));
const TOK = "screens-ingest-token", SECRET = "screens-session-secret-0123456789abcdef";
const PORT = new URL(MC).port || "8791";
const HOST = "mc.nwebnotfound.dev";
const D1 = "100000000000000001";
const U1 = "11111111-2222-3333-4444-555555555555";

// One row per artboard file in the mockup set. `slug` is the file name used for the screenshots.
const PAGES = [
  { slug: "home", file: "McHome.html", url: "/", full: false },
  { slug: "markt", file: "McMarket.html", url: "/markt" },
  { slug: "item", file: "McItem.html", url: "/markt/diamond" },
  { slug: "shops", file: "McShops.html", url: "/shops" },
  { slug: "auktionen", file: "McAuctions.html", url: "/auktionen" },
  { slug: "parkour", file: "McParkour.html", url: "/parkour" },
  { slug: "pvp", file: "McPvp.html", url: "/pvp" },
  { slug: "spieler", file: "McPlayers.html", url: "/spieler" },
  { slug: "player", file: "McPlayer.html", url: "/spieler/Nils" },
  { slug: "leaderboards", file: "McLeaderboards.html", url: "/leaderboards" },
  { slug: "changelog", file: "McChangelog.html", url: "/changelog" },
  { slug: "feedback", file: "McFeedback.html", url: "/feedback" },
  { slug: "wiki", file: "McWiki.html", url: "/wiki" },
  { slug: "wiki-artikel", file: "McWiki.html", url: "/wiki/economy" },
  { slug: "vip", file: "McVip.html", url: "/vip" },
  { slug: "account", file: "McAccount.html", url: "/profile" },
];
const VIEWPORTS = [
  { w: 1280, h: 900, tag: "1280" },
  { w: 390, h: 844, tag: "390" },
];

const children = [];
function serve(cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  children.push(child);
  return child;
}
function stopServers() {
  for (const child of children) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch { /* already gone */ }
  }
}
process.on("exit", stopServers);
process.on("SIGINT", () => { stopServers(); process.exit(130); });

async function reachable(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`timed out waiting for ${url}`);
}

const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sessionCookie(sid) {
  const key = await C.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "nnf_session=" + encodeURIComponent(sid + "." + b64u(await C.subtle.sign("HMAC", key, new TextEncoder().encode(sid))));
}

const hoursAgo = (h) => Math.floor(Date.now() / 3600000) * 3600 - h * 3600;

// Fixture payload for POST /api/mc-ingest — the documented contract from INGEST.md. Values are
// sample numbers, never production data.
function fixture() {
  const names = ["Nils", "KaiDasEi", "hadzyc05", "Mira", "Fuchsi", "Tobsi", "Lena", "Bene"];
  // Nils' row is the linked account (U1), so /profile and /spieler/Nils render the full profile.
  const uuid = (i) => (i === 0 ? U1 : `aaaaaaaa-0000-4000-8000-00000000000${i}`);
  const lead = (f) => names.map((n, i) => ({ name: n, value: Math.round(f(i)) }));
  const market = [
    ["diamond", 120.5, 96.4, 100, 340, 38200, 57, 4.25],
    ["iron_ingot", 18.2, 14.5, 16, 900, 16400, 120, -2.1],
    ["emerald", 42, 33.6, 40, 210, 8800, 44, 1.4],
    ["gold_ingot", 26.4, 21.1, 24, 180, 4750, 31, 0],
    ["netherite_scrap", 890, 712, 800, 22, 19600, 9, 6.8],
    ["oak_log", 3.2, 2.56, 3, 4200, 13400, 260, -0.6],
  ].map(([item, buy, sell, base, vol, cp, trades, ch]) => ({
    item, buy_price: buy, sell_price: sell, base_price: base, volume_24h_qty: vol, volume_24h_cp: cp, trades_24h: trades, change_24h_pct: ch, updated_at: Math.floor(Date.now() / 1000),
  }));
  const history = [];
  for (let h = 0; h < 72; h += 1) {
    for (const [item, buy] of [["diamond", 120], ["iron_ingot", 18], ["netherite_scrap", 880]]) {
      const wave = 1 + Math.sin((72 - h) / 7) * 0.06 + (h / 400);
      history.push({ item, hour_ts: hoursAgo(h), avg_price: +(buy * wave).toFixed(2), min_price: +(buy * wave * 0.94).toFixed(2), max_price: +(buy * wave * 1.07).toFixed(2), volume_qty: 12 + (h % 9) });
    }
  }
  return {
    servers: {
      lobby: { online: true, players: ["Nils", "Mira"], max: 20, tps: 20, uptime_seconds: 84200, version: "26.3", mode: "dev" },
      survival: { online: true, players: ["Nils", "KaiDasEi", "hadzyc05", "Mira"], max: 20, tps: 19.8, uptime_seconds: 84200, version: "26.3", mode: "dev" },
      vip1: { online: false, players: [], max: 5, tps: 20, version: "26.3", mode: "dev" },
    },
    leaderboards: {
      money: lead((i) => 48200 / (i + 1)), playtime: lead((i) => 486000 / (i + 1)), blocks_mined: lead((i) => 128000 / (i + 1)),
      kills: lead((i) => 480 / (i + 1)), distance: lead((i) => 4200000 / (i + 1)), kd: lead((i) => 4.2 / (i + 1)),
    },
    leaderboards_weekly: { money: lead((i) => 6200 / (i + 1)), playtime: lead((i) => 42000 / (i + 1)) },
    links: [{ discord_id: D1, mc_name: "Nils", mc_uuid: U1, has_role: true, verified: true }],
    player_ranks: names.map((n, i) => ({ uuid: uuid(i), name: n, rank: i === 0 ? "vip" : i === 1 ? "mvp" : "default", color: i === 0 ? "&a" : i === 1 ? "&b" : "&7", weight: 10 - i })),
    pvp_stats: names.map((n, i) => ({ uuid: uuid(i), name: n, wins: 42 - i * 4, losses: 12 + i, draws: 1, matches: 55 - i * 3, winrate_pct: 76 - i * 6, favorite_kit: ["Sword", "Axe", "Bow"][i % 3] })),
    parkour: names.slice(0, 6).flatMap((n, i) => [
      { course: "cave_rush", course_name: "Cave Rush", course_icon: "golden_boots", mc_uuid: uuid(i), mc_name: n, time_ms: 42123 + i * 4200, set_at: "2026-10-30T11:00:00Z" },
      { course: "lobby_loop", course_name: "Lobby Loop", course_icon: "feather", mc_uuid: uuid(i), mc_name: n, time_ms: 18200 + i * 3100, set_at: "2026-10-29T18:20:00Z" },
      { course: "nether_dash", course_name: "Nether Dash", course_icon: "blaze_rod", mc_uuid: uuid(i), mc_name: n, time_ms: 96400 + i * 7800, set_at: "2026-10-28T09:05:00Z" },
    ]),
    market,
    market_history: history,
    economy_daily: [6, 5, 4, 3, 2, 1, 0].map((d) => {
      const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      return { day, money_supply_cp: 2400000 + (6 - d) * 38000, minted_cp: 42000, burned_cp: 9000, net_cp: 33000 };
    }),
    shops: [
      { id: "s1", owner_uuid: uuid(1), owner_name: "KaiDasEi", name: "Kais Erzladen", location: { world: "survival", x: 120, y: 64, z: -340 }, updated_at: Date.now(), items: [{ listing_id: "L1", item: "diamond", price: 4500, stock: 32, mode: "sell" }, { listing_id: "L2", item: "iron_ingot", price: 900, stock: 240, mode: "sell" }] },
      { id: "s2", owner_uuid: uuid(3), owner_name: "Mira", name: "Miras Bauernhof", location: { world: "survival", x: -80, y: 70, z: 210 }, updated_at: Date.now(), items: [{ listing_id: "L3", item: "wheat", price: 320, stock: 512, mode: "sell" }] },
      { id: "s3", owner_uuid: uuid(4), owner_name: "Fuchsi", name: "Fuchsi kauft Netherite", location: { world: "survival", x: 12, y: 64, z: 98 }, updated_at: Date.now(), items: [{ listing_id: "L4", item: "netherite_scrap", price: 78000, stock: 64, mode: "buy" }] },
      { id: "s4", owner_uuid: uuid(2), owner_name: "hadzyc05", name: "hadzys Tränke", location: { world: "survival", x: 300, y: 63, z: -12 }, updated_at: Date.now(), items: [{ listing_id: "L5", item: "potion", price: 1200, stock: 12, mode: "sell" }] },
    ],
    auctions: [
      { id: "a1", seller_uuid: uuid(1), seller_name: "KaiDasEi", item: "elytra", amount: 1, nbt_summary: "Haltbarkeit III", min_price: 200000, current_bid: 250000, current_bidder_name: "hadzyc05", bid_count: 3, ends_at: Date.now() + 4 * 60000, status: "active", bids: [{ name: "hadzyc05", amount: 250000, at: Date.now() - 300000 }] },
      { id: "a2", seller_uuid: uuid(3), seller_name: "Mira", item: "netherite_ingot", amount: 2, min_price: 300000, current_bid: 320000, current_bidder_name: "Nils", bid_count: 2, ends_at: Date.now() + 2 * 3600000, status: "active", bids: [{ name: "Nils", amount: 320000, at: Date.now() - 900000 }] },
      { id: "a3", seller_uuid: uuid(5), seller_name: "Tobsi", item: "dragon_egg", amount: 1, min_price: 500000, current_bid: null, bid_count: 0, ends_at: Date.now() + 20 * 3600000, status: "active", bids: [] },
    ],
    players_stats: Object.fromEntries(names.map((n, i) => [uuid(i), {
      money: 48200 - i * 5200, playtime: 486000 - i * 42000, kills: 480 - i * 50, deaths: 62 + i * 9, blocks_mined: 128000 - i * 12000,
      distance: 4200000 - i * 300000, online: i < 4,
      details: {
        mined: { stone: 38200 - i * 2000, deepslate: 12400 - i * 900, dirt: 9800, diamond_ore: 240 - i * 12, oak_log: 6400 },
        placed: { cobblestone: 8400, torch: 3200, oak_planks: 2100 },
        killed: { zombie: 320 - i * 10, creeper: 180, skeleton: 96, enderman: 24 },
        crafted: { torch: 2600, stick: 1800, iron_pickaxe: 42 },
        deaths_by: { fall: 12, lava: 4, creeper: 3, void: 1 },
        distance_m: { walk: 3200000, sprint: 620000, fly: 180000, swim: 42000, boat: 33000, horse: 12000, elytra: 26000, minecart: 9000, climb: 78000, crouch: 22000 },
        fished: 240 - i * 8, traded: 96, jumps: 62000, damage_dealt: 48000, damage_taken: 22000, cp_earned: 128000, shop_sales: 42,
      },
    }])),
  };
}

async function seed(session) {
  const res = await fetch(`${MC}/api/mc-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-token": TOK, host: HOST },
    body: JSON.stringify(fixture()),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`ingest ${res.status}: ${txt.slice(0, 400)}`);
  console.log("seed:", txt.slice(0, 300));
  session.cookie = await sessionCookie("s-screens");
}

async function startServer() {
  const persist = path.join(ROOT, ".wrangler", "screens-mc");
  await rm(persist, { recursive: true, force: true });
  const dv = path.join(ROOT, ".dev.vars");
  let hadDv = null;
  if (fs.existsSync(dv)) { hadDv = fs.readFileSync(dv); }
  fs.writeFileSync(dv, `MC_INGEST_TOKEN=${TOK}\nSESSION_SECRET=${SECRET}\nDISCORD_CLIENT_ID=1\nDISCORD_CLIENT_SECRET=x\n`);
  const restore = () => { try { if (hadDv) fs.writeFileSync(dv, hadDv); else fs.rmSync(dv, { force: true }); } catch { /* keep it */ } };
  process.on("exit", restore);
  try {
    execSync(`npx wrangler d1 execute DB --local --persist-to "${persist}" --file schema.sql`, { cwd: ROOT, stdio: "ignore" });
  } catch {
    console.warn("! schema.sql did not apply — the pages will show their error states");
  }
  execSync(`npx wrangler d1 execute DB --local --persist-to "${persist}" --command ${JSON.stringify(`INSERT INTO sessions (id, discord_id, username, global_name, expires_at) VALUES ('s-screens','${D1}','nils','Nils',datetime('now','+1 day'))`)}`, { cwd: ROOT, stdio: "ignore" });
  serve("npx", ["wrangler", "dev", "--port", PORT, "--ip", "127.0.0.1", "--local-upstream", HOST, "--persist-to", persist]);
  await reachable(`${MC}/`);
  return restore;
}

// Self-hosted faces, mapped onto the names the artboards ask for, so a mockup capture is not
// silently rendered in a fallback font because Google is unreachable.
function fontCss() {
  const f = (family, file, weight) => `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;src:url("file://${path.join(ROOT, "public/design/fonts", file)}") format("woff2")}`;
  return [
    f("Pixelify Sans", "pixelify-sans-latin-400.woff2", 400), f("Pixelify Sans", "pixelify-sans-latin-700.woff2", 700),
    f("Nunito", "nunito-latin-400.woff2", 400), f("Nunito", "nunito-latin-700.woff2", 700),
  ].join("\n");
}

const probe = { mockups: [], impl: [], style: {} };

async function capture(browser, url, file, vp, { cookie, inject, wait, blockExternal } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, reducedMotion: "no-preference", colorScheme: "dark" });
  if (cookie) await ctx.addCookies([{ name: "nnf_session", value: decodeURIComponent(cookie.split("=")[1]), domain: "127.0.0.1", path: "/" }]);
  // The artboards ask Google for their fonts; the offline run must not depend on that request, so
  // every non-file:// subresource is dropped and the injected local faces are the only ones used.
  if (blockExternal) await ctx.route("**/*", (route) => (route.request().url().startsWith("file://") ? route.continue() : route.abort()));
  const page = await ctx.newPage();
  if (inject) await page.addInitScript(inject);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(wait || 1400);
  await page.screenshot({ path: file, fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  await ctx.close();
  return { file: path.relative(ROOT, file), w: vp.w, h: vp.h, pageHeight: height, scrollWidth: width };
}

// Style probe: proves the v2 layer is actually applied and that reduced motion switches it off.
async function styleProbe(browser, cookie) {
  const out = {};
  for (const motion of ["no-preference", "reduce"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: motion, colorScheme: "dark" });
    if (cookie) await ctx.addCookies([{ name: "nnf_session", value: decodeURIComponent(cookie.split("=")[1]), domain: "127.0.0.1", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${MC}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    out[motion] = await page.evaluate(() => {
      const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
      const nav = document.querySelector(".nav .wrap");
      return {
        bodyFont: cs("body", "fontFamily"),
        headingFont: cs(".hub-h", "fontFamily"),
        cardRadius: cs(".q", "borderRadius"),
        cardBackground: cs(".q", "backgroundColor"),
        quickLinkAnimation: cs(".qgrid > *", "animationName"),
        buttonShadow: cs(".btn", "boxShadow"),
        buttonHeight: document.querySelector(".btn") ? Math.round(document.querySelector(".btn").getBoundingClientRect().height) : null,
        navRadius: nav ? getComputedStyle(nav).borderRadius : null,
        navBlur: nav ? getComputedStyle(nav).backdropFilter : null,
        themeCss: [...document.styleSheets].some((s) => (s.href || "").includes("theme-v2.css")),
      };
    });
    await ctx.close();
  }
  out.diff = { quickLinkAnimation: [out["no-preference"].quickLinkAnimation, out.reduce.quickLinkAnimation] };
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const session = {};
  let restore = () => {};
  if (SERVE) {
    if (!SERVE && SERVED) throw new Error("--serve is required to start the local Worker");
    restore = await startServer();
    await seed(session);
  } else {
    console.log(`using running server at ${MC}`);
    session.cookie = await sessionCookie("s-screens");
  }

  const browser = await chromium.launch();
  const impl = ONLY === "all" || ONLY === "impl";
  const mockup = ONLY === "all" || ONLY === "mockup";

  if (mockup) {
    const inject = `(()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(fontCss())};document.head.appendChild(s);document.addEventListener("DOMContentLoaded",()=>document.head.appendChild(s));})()`;
    for (const p of PAGES) {
      const src = path.join(MOCK_DIR, p.file);
      if (!fs.existsSync(src)) { console.warn(`! missing artboard ${src}`); continue; }
      for (const vp of VIEWPORTS) {
        const r = await capture(browser, `file://${src}`, path.join(OUT, `mockup-${p.slug}-${vp.tag}.png`), vp, { inject, wait: 1200, blockExternal: true });
        probe.mockups.push({ page: p.slug, ...r });
      }
    }
  }
  if (impl) {
    for (const p of PAGES) {
      for (const vp of VIEWPORTS) {
        const r = await capture(browser, `${MC}${p.url}`, path.join(OUT, `neu-${p.slug}-${vp.tag}.png`), vp, { cookie: session.cookie, wait: p.slug === "home" ? 2600 : 1600 });
        probe.impl.push({ page: p.slug, ...r });
      }
    }
    probe.style = await styleProbe(browser, session.cookie);
    // Horizontal overflow at phone width is the classic regression of a new layout layer.
    probe.overflow390 = probe.impl.filter((x) => x.w === 390 && x.scrollWidth > 390).map((x) => ({ page: x.page, scrollWidth: x.scrollWidth }));
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(probe, null, 2));
  restore();
  console.log(JSON.stringify({ mockups: probe.mockups.length, impl: probe.impl.length, style: probe.style, overflow390: probe.overflow390 }, null, 2));
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
