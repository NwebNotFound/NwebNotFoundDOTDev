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
  { w: 375, h: 812, tag: "375" },
];
const STRESS = args.includes("--stress");

// Item 2: pages whose formatting is worth pushing to the contract limits (16-char MC names, 48-char
// shop names, nine-digit CP sums). Captured as stress-<slug>-<tag>.png next to the normal shots.
const LONG = "Xx_LaengsterName";
const STRESS_PAGES = [
  { slug: "spieler", url: "/spieler" },
  { slug: "player", url: `/spieler/${LONG}` },
  { slug: "leaderboards", url: "/leaderboards" },
  { slug: "markt", url: "/markt" },
  { slug: "shops", url: "/shops" },
  { slug: "bestellungen", url: "/bestellungen" },
];

const children = [];
// `spawn("npx", …)` is ENOENT on Windows and `spawn("npx.cmd", …)` throws EINVAL on Node 18.20+/20+
// (the cmd.exe shell-escape fix), so a local run of this harness died before the first screenshot.
// Run the npm CLI's npx entry with the current node binary instead: same command, no shell and no
// argument re-quoting, and it works on Linux/macOS unchanged.
const NPX = (() => {
  if (process.platform !== "win32") return { cmd: "npx", args: [], opts: {} };
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  if (fs.existsSync(cli)) return { cmd: process.execPath, args: [cli], opts: {} };
  return { cmd: "npx", args: [], opts: { shell: true } };
})();
function serve(cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", ...NPX.opts });
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
  // `rot` rotates the names independently of the values, so each list has its own leader. With one
  // shared order every list head on the start page was the same player and the four avatars looked
  // like one repeated placeholder instead of four heads.
  const lead = (f, rot = 0) => names.map((n, i) => ({ name: names[(i + rot) % names.length], value: Math.round(f(i)) }));
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
  // Every item gets its own series: phase, amplitude and period differ, plus a mild trend. One shared
  // sine for all items made the sparklines pixel-identical and every 24h-change the same -12.6x %,
  // which reads like a rendering bug in review. This is fixture data either way — /api/mc-market keys
  // `spark` per item (worker.js mcMarket) and the page reads `spark[item]`.
  const HIST = {
    diamond: [120, 0.085, 1.1, 9],
    iron_ingot: [18, 0.14, 3.6, 5.5],
    netherite_scrap: [880, 0.055, 5.2, 13],
    emerald: [42, 0.1, 0.35, 7.5],
  };
  for (let h = 0; h < 72; h += 1) {
    for (const [item, [buy, amp, phase, period]] of Object.entries(HIST)) {
      const ago = 72 - h;
      const wave = 1 + Math.sin(ago / period + phase) * amp - (ago / 72) * amp * 1.2;
      history.push({ item, hour_ts: hoursAgo(h), avg_price: +(buy * wave).toFixed(2), min_price: +(buy * wave * 0.94).toFixed(2), max_price: +(buy * wave * 1.07).toFixed(2), volume_qty: 12 + ((h * 7 + item.length * 3) % 41) });
    }
  }
  return {
    servers: {
      lobby: { online: true, players: ["Nils", "Mira"], max: 20, tps: 20, uptime_seconds: 84200, version: "26.3", mode: "dev" },
      survival: { online: true, players: ["Nils", "KaiDasEi", "hadzyc05", "Mira"], max: 20, tps: 19.8, uptime_seconds: 84200, version: "26.3", mode: "dev" },
      vip1: { online: false, players: [], max: 5, tps: 20, version: "26.3", mode: "dev" },
    },
    leaderboards: {
      money: lead((i) => 48200 / (i + 1)), playtime: lead((i) => 486000 / (i + 1), 1), blocks_mined: lead((i) => 128000 / (i + 1), 2),
      kills: lead((i) => 480 / (i + 1), 3), distance: lead((i) => 4200000 / (i + 1), 4), kd: lead((i) => 4.2 / (i + 1), 5),
    },
    leaderboards_weekly: { money: lead((i) => 6200 / (i + 1), 6), playtime: lead((i) => 42000 / (i + 1), 7) },
    links: [{ discord_id: D1, mc_name: "Nils", mc_uuid: U1, has_role: true, verified: true }],
    player_ranks: names.map((n, i) => ({ uuid: uuid(i), name: n, rank: i === 0 ? "mvp" : i === 1 ? "vip" : "default", color: i === 0 ? "&d" : i === 1 ? "&6" : "&7", weight: 10 - i })),
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
      // A populated inventory for the linked account so /profile proves armour, storage, hotbar and
      // offhand placement (an empty fixture cannot show the slot grid).
      inventory: i === 0 ? [{ item: "diamond_helmet", slot: 39 }, { item: "iron_chestplate", slot: 38 }, { item: "iron_leggings", slot: 37 }, { item: "iron_boots", slot: 36 }, { item: "shield", slot: 40 }, { item: "diamond_sword", slot: 0 }, { item: "bread", count: 32, slot: 1 }, { item: "diamond", count: 64, slot: 9 }, { item: "oak_log", count: 48, slot: 17 }, { item: "cobblestone", count: 64, slot: 27 }] : undefined,
      money: 48200 - i * 5200, playtime: 486000 - i * 42000, kills: 480 - i * 50, deaths: 62 + i * 9, blocks_mined: 128000 - i * 12000,
      distance: 4200000 - i * 300000, online: i < 4,
      details: {
        mined: { stone: 38200 - i * 2000, deepslate: 12400 - i * 900, dirt: 9800, diamond_ore: 240 - i * 12, oak_log: 6400 },
        placed: { cobblestone: 8400, torch: 3200, oak_planks: 2100 },
        // Mob variety for the Mob-Kills list: heads that exist in /mc/heads plus German entity names.
        killed: { zombie: 320, pig: 280, husk: 240, sheep: 180, chicken: 140, cow: 100, skeleton: 64, spider: 32 },
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
  serve(NPX.cmd, [...NPX.args, "wrangler", "dev", "--port", PORT, "--ip", "127.0.0.1", "--local-upstream", HOST, "--persist-to", persist]);
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

const probe = { mockups: [], impl: [], stress: [], style: {}, stressChecks: {}, motion: {} };
// `--only mockup|impl` runs must not drop the other half of the report: carry the untouched
// sections over from the previous run so the committed report.json always holds both.
const REPORT = path.join(OUT, "report.json");
let prevReport = {};
try { prevReport = JSON.parse(fs.readFileSync(REPORT, "utf8")); } catch { /* first run */ }

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
  // 3D models load lazily and asynchronously: give them a bounded moment so no tile is captured
  // mid-load (this is why the "Gerade online" row still looked empty on desktop while the phone
  // breakpoint, which renders a static frame, already showed the figures). Never blocks a run.
  if (!blockExternal) {
    await page.waitForFunction(() => {
      const els = [...document.querySelectorAll(".m3d")];
      if (!els.length) return true;
      return els.every((e) => {
        if (e.classList.contains("ready")) return true;
        const i = e.querySelector("img.m3d-fb");
        return !!i && i.complete && i.naturalWidth > 0;
      });
    }, { timeout: 8000 }).catch(() => {});
    // The start page's status box is server-truth: /api/mc-status asks two public status APIs, so it
    // resolves seconds after the paint. A fixed timeout caught the desktop shot mid-load ("Prüfe
    // Status…", "–" values) while the phone shot, taken later in the same run, already had numbers —
    // that read as a layout bug in review. The page sets data-mc-home="ready" once status, servers,
    // top players and market have all settled; wait for that, bounded, and never fail the run on it.
    await page.waitForFunction(() => {
      if (!document.getElementById("state")) return true;
      return document.documentElement.dataset.mcHome === "ready";
    }, { timeout: 25_000 }).catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.screenshot({ path: file, fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  const status = await page.evaluate(() => {
    const s = document.getElementById("state");
    return s ? (s.textContent || "").trim() : null;
  });
  await ctx.close();
  return { file: path.relative(ROOT, file), w: vp.w, h: vp.h, pageHeight: height, scrollWidth: width, ...(status ? { status } : {}) };
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

// Stress fixtures: same ingest contract, the longest names and the largest numbers it accepts.
function stressFixture() {
  const long = "Xx_LaengsterName"; // 16 chars — the MC name limit
  const others = ["AAAAAAAAAAAAAAAA", "ZZZZZZZZZZZZZZZZ", "Neunzehn_Zeichen", "LangLangLangLang"];
  const uuid = (i) => (i === 0 ? U1 : `bbbbbbbb-0000-4000-8000-00000000000${i}`);
  const lead = (f) => [long, ...others].map((n, i) => ({ name: n, value: Math.round(f(i)) }));
  return {
    links: [{ discord_id: D1, mc_name: long, mc_uuid: U1, has_role: true, verified: true }],
    leaderboards: {
      money: lead((i) => 1234567890 / (i + 1)), playtime: lead((i) => 999999999 / (i + 1)),
      blocks_mined: lead((i) => 987654321 / (i + 1)), kills: lead((i) => 1234567 / (i + 1)),
      distance: lead((i) => 123456789 / (i + 1)), kd: lead((i) => 1234.5678 / (i + 1)),
    },
    leaderboards_weekly: { money: lead((i) => 98765432 / (i + 1)), playtime: lead((i) => 8640000 / (i + 1)) },
    player_ranks: [long, ...others].map((n, i) => ({ uuid: uuid(i), name: n, rank: i === 0 ? "vip" : "default", color: i === 0 ? "&a" : "&7", weight: 10 - i })),
    players_stats: Object.fromEntries([long, ...others].map((n, i) => [uuid(i), {
      money: 1234567890 - i, playtime: 999999999 - i * 1000, kills: 1234567 - i, deaths: 98765 - i,
      blocks_mined: 987654321 - i * 100, distance: 123456789 - i * 10, online: i < 2,
      details: {
        mined: { stone: 9876543, deepslate: 1234567, diamond_ore: 98765, netherrack: 123456 },
        killed: { zombie: 123456, creeper: 98765 }, placed: { cobblestone: 1234567 },
        deaths_by: { fall: 12345, lava: 9876 }, crafted: { torch: 123456 },
        distance_m: { walk: 123456789, sprint: 98765432, fly: 5432109 },
        fished: 98765, traded: 43210, jumps: 1234567, damage_dealt: 9876543, damage_taken: 1234567,
        cp_earned: 1234567890, shop_sales: 98765,
      },
    }])),
    market: [
      ["enchanted_golden_apple", 1234567.89, 987654.31, 1000000, 987654321, 1234567890, 987654, 1234.5678],
      ["netherite_chestplate", 987654.32, 790123.45, 800000, 12345678, 987654321, 45678, -1234.5678],
      ["diamond", 120.5, 96.4, 100, 340, 38200, 57, 4.25],
    ].map(([item, buy, sell, base, vol, cp, trades, ch]) => ({ item, buy_price: buy, sell_price: sell, base_price: base, volume_24h_qty: vol, volume_24h_cp: cp, trades_24h: trades, change_24h_pct: ch, updated_at: Math.floor(Date.now() / 1000) })),
    shops: [
      { id: "s-long", owner_uuid: uuid(0), owner_name: long, name: "Der allerallerallerlaengste Erz- und Trankeladen", location: { world: "survival", x: 1234567, y: 64, z: -9876543 }, updated_at: Date.now(), items: [{ listing_id: "L1", item: "enchanted_golden_apple", price: 1234567, stock: 999999, mode: "sell" }, { listing_id: "L2", item: "netherite_chestplate", price: 987654, stock: 123456, mode: "buy" }] },
      { id: "s-long2", owner_uuid: uuid(1), owner_name: others[0], name: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", location: "survival · 9876543 / 64 / -1234567", updated_at: Date.now(), items: [{ listing_id: "L3", item: "diamond", price: 123456, stock: 999999, mode: "sell" }] },
    ],
    auctions: [
      { id: "a-long", seller_uuid: uuid(0), seller_name: long, item: "netherite_chestplate", amount: 9999, nbt_summary: "Schutz IV, Haltbarkeit III, Reparatur, Unzerstörbar, Fluch der Bindung", min_price: 987654321, current_bid: 1234567890, current_bidder_name: others[0], bid_count: 987654, ends_at: Date.now() + 3600000, status: "active", bids: [{ name: others[0], amount: 1234567890, at: Date.now() - 60000 }] },
    ],
  };
}

async function seedStress(session) {
  const res = await fetch(`${MC}/api/mc-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-token": TOK, host: HOST },
    body: JSON.stringify(stressFixture()),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`stress ingest ${res.status}: ${txt.slice(0, 300)}`);
  console.log("stress seed:", txt.slice(0, 200));
  return session;
}

// Item 2 checks: nothing overflows horizontally, long labels ellipsize instead of pushing the row
// wide, and big numbers come out grouped in German.
async function stressChecks(browser, cookie) {
  const out = {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", colorScheme: "dark" });
  if (cookie) await ctx.addCookies([{ name: "nnf_session", value: decodeURIComponent(cookie.split("=")[1]), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  for (const [name, url] of [["player", `/spieler/${LONG}`], ["leaderboards", "/leaderboards"], ["shops", "/shops"], ["bestellungen", "/bestellungen"]]) {
    await page.goto(`${MC}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1700);
    out[name] = await page.evaluate(() => {
      // "Ellipsized" is the goal for names; "spilled" would mean the box really overflows its row.
      const rows = [...document.querySelectorAll(".lrow b:not(.tnum), .li b:not(.tnum), .shh b, .lbr .n, .card h3")];
      const cut = rows.filter((e) => e.scrollWidth > e.clientWidth + 2);
      const clipped = (e) => getComputedStyle(e).textOverflow !== "ellipsis" && getComputedStyle(e).overflow !== "hidden";
      const text = document.body.innerText;
      return {
        docOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        checkedNames: rows.length,
        ellipsizedNames: cut.filter((e) => !clipped(e)).map((e) => (e.textContent || "").trim().slice(0, 28)),
        spilledText: cut.filter(clipped).map((e) => (e.textContent || "").trim().slice(0, 32)),
        groupedThousands: /\d{1,3}(?:\.\d{3})+/.test(text),
        sample: (text.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?\s*(?:CP|%)/) || [])[0] || null,
        ellipsisOnRows: rows.length ? getComputedStyle(rows[0]).textOverflow : null,
      };
    });
  }
  await ctx.close();
  return out;
}

// Items 3 + 4 evidence: scroll-driven layer offsets, pointer parallax, reduced-motion opt-out and
// the view-transition names, plus screenshots at two scroll positions and mid-transition.
async function motionEvidence(browser, cookie) {
  const out = { shots: [] };
  const read = (page) => page.evaluate(() => {
    const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).transform : null; };
    return { stars: g(".l-stars"), clouds: g(".l-clouds"), hills: g(".l-hills"), mascot: g(".l-mascot"), glow: g(".pixbg") };
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference", colorScheme: "dark" });
  if (cookie) await ctx.addCookies([{ name: "nnf_session", value: decodeURIComponent(cookie.split("=")[1]), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${MC}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  out.supportsScrollTimeline = await page.evaluate(() => CSS.supports("animation-timeline: scroll()"));
  out.viewTransition = await page.evaluate(() => {
    const n = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).viewTransitionName : null; };
    return { header: n(".nav"), footer: n("footer"), main: n("main"), jsFallbackActive: !!document.querySelector(".hscene.par-js"), scenePresent: !!document.querySelector(".hscene") };
  });
  out.layers = {};
  out.layers.scroll0 = await read(page);
  out.shots.push(await shot(page, "parallax-home-top.png"));
  await page.evaluate(() => window.scrollTo(0, 280));
  await page.waitForTimeout(800);
  out.layers.scroll280 = await read(page);
  out.shots.push(await shot(page, "parallax-home-scrolled.png"));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.mouse.move(1240, 90);
  await page.waitForTimeout(150);
  await page.mouse.move(160, 780, { steps: 14 });
  await page.waitForTimeout(700);
  out.pointer = await page.evaluate(() => {
    const sc = document.querySelector(".hscene");
    return { mx: getComputedStyle(sc).getPropertyValue("--mx").trim(), my: getComputedStyle(sc).getPropertyValue("--my").trim(), mascotInner: getComputedStyle(document.querySelector(".l-mascot .in")).transform };
  });
  out.shots.push(await shot(page, "parallax-home-pointer.png"));
  // Same-document view transition (test-side only, no page JS): the CSS rules for ::view-transition-*
  // (mc-page) have to fire, and the header/footer must not move. The animations are stretched to 2 s
  // for the capture only (a slow-motion photo of the theme's own keyframes, names and easing).
  try {
    await page.addStyleTag({ content: "::view-transition-old(mc-page){animation-duration:2s !important}::view-transition-new(mc-page){animation-duration:2s !important}" });
    await page.evaluate(() => new Promise((res) => {
      // `ready` rejects when the transition is skipped, so both paths resolve — plus a hard stop, so
      // the harness can never hang on a browser that decides not to run the transition.
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      try {
        const t = document.startViewTransition(() => { const m = document.querySelector("main"); if (m) m.style.minHeight = "1600px"; });
        t.ready.then(() => setTimeout(finish, 420)).catch(finish);
      } catch { finish(); }
      setTimeout(finish, 2500);
    }));
    out.transitionRunning = true;
    const cdp = await ctx.newCDPSession(page);
    const cap = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, "transition-same-document.png"), Buffer.from(cap.data, "base64"));
    out.shots.push("transition-same-document.png");
  } catch (e) { out.transitionRunning = String(e).slice(0, 120); }
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", colorScheme: "dark" });
  const p2 = await ctx2.newPage();
  await p2.goto(`${MC}/`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(1600);
  out.reducedMotion = await read(p2);
  await ctx2.close();
  return out;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  return name;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const session = {};
  let restore = () => {};
  if (SERVE) {
    restore = await startServer();
    await seed(session);
  } else {
    console.log(`using running server at ${MC}`);
    session.cookie = await sessionCookie("s-screens");
  }

  const browser = await chromium.launch();
  const impl = ONLY === "all" || ONLY === "impl";
  const mockup = ONLY === "all" || ONLY === "mockup";
  const motionOnly = ONLY === "motion";
  const stressOnly = ONLY === "stress";
  if (stressOnly) {
    if (SERVE) await seedStress(session);
    for (const p of STRESS_PAGES) {
      for (const vp of VIEWPORTS) {
        const r = await capture(browser, `${MC}${p.url}`, path.join(OUT, `stress-${p.slug}-${vp.tag}.png`), vp, { cookie: session.cookie, wait: 1600 });
        probe.stress.push({ page: p.slug, ...r });
      }
    }
    probe.overflow390Stress = probe.stress.filter((x) => x.w === 390 && x.scrollWidth > 390).map((x) => ({ page: x.page, scrollWidth: x.scrollWidth }));
    probe.stressChecks = await stressChecks(browser, session.cookie);
    probe.mockups = prevReport.mockups || [];
    probe.impl = prevReport.impl || [];
    probe.style = prevReport.style || {};
    probe.motion = prevReport.motion || {};
    probe.overflow390 = prevReport.overflow390 || [];
    await browser.close();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(probe, null, 2));
    restore();
    console.log(JSON.stringify({ overflow390Stress: probe.overflow390Stress, stressChecks: probe.stressChecks }, null, 2));
    return;
  }
  if (motionOnly) {
    probe.motion = await motionEvidence(browser, session.cookie);
    probe.mockups = prevReport.mockups || [];
    probe.impl = prevReport.impl || [];
    probe.stress = prevReport.stress || [];
    probe.style = prevReport.style || {};
    probe.stressChecks = prevReport.stressChecks || {};
    probe.overflow390 = prevReport.overflow390 || [];
    probe.overflow390Stress = prevReport.overflow390Stress || [];
    await browser.close();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(probe, null, 2));
    restore();
    console.log(JSON.stringify({ motion: probe.motion }, null, 2));
    return;
  }

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
  } else if (prevReport.mockups) probe.mockups = prevReport.mockups;
  if (impl) {
    for (const p of PAGES) {
      for (const vp of VIEWPORTS) {
        const r = await capture(browser, `${MC}${p.url}`, path.join(OUT, `neu-${p.slug}-${vp.tag}.png`), vp, { cookie: session.cookie, wait: p.slug === "home" ? 2600 : 1600 });
        probe.impl.push({ page: p.slug, ...r });
      }
    }
    probe.style = await styleProbe(browser, session.cookie);
    // Horizontal overflow at phone width is the classic regression of a new layout layer.
    const spill = (w) => probe.impl.filter((x) => x.w === w && x.scrollWidth > w).map((x) => ({ page: x.page, scrollWidth: x.scrollWidth }));
    probe.overflow390 = spill(390);
    probe.overflow375 = spill(375);
  } else {
    probe.impl = prevReport.impl || [];
    probe.style = prevReport.style || {};
    probe.overflow390 = prevReport.overflow390 || [];
    probe.overflow375 = prevReport.overflow375 || [];
  }

  // Stress pass (item 2): same pages, but with the longest allowed names and the biggest numbers the
  // contracts permit, so ellipsis/wrapping and grouped digits are checked instead of assumed.
  if (impl || STRESS) {
    if (SERVE) await seedStress(session);
    for (const p of STRESS_PAGES) {
      for (const vp of VIEWPORTS) {
        const r = await capture(browser, `${MC}${p.url}`, path.join(OUT, `stress-${p.slug}-${vp.tag}.png`), vp, { cookie: session.cookie, wait: 1600 });
        probe.stress.push({ page: p.slug, ...r });
      }
    }
    probe.overflow390Stress = probe.stress.filter((x) => x.w === 390 && x.scrollWidth > 390).map((x) => ({ page: x.page, scrollWidth: x.scrollWidth }));
    probe.stressChecks = await stressChecks(browser, session.cookie);
  } else {
    probe.stress = prevReport.stress || [];
    probe.overflow390Stress = prevReport.overflow390Stress || [];
    probe.stressChecks = prevReport.stressChecks || {};
  }

  // Parallax + view transition evidence (items 3 + 4).
  if (impl) probe.motion = await motionEvidence(browser, session.cookie);
  else probe.motion = prevReport.motion || {};

  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(probe, null, 2));
  restore();
  console.log(JSON.stringify({
    mockups: probe.mockups.length, impl: probe.impl.length, stress: probe.stress.length,
    style: probe.style, overflow390: probe.overflow390, overflow375: probe.overflow375, overflow390Stress: probe.overflow390Stress,
    stressChecks: probe.stressChecks, motion: probe.motion,
  }, null, 2));
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
