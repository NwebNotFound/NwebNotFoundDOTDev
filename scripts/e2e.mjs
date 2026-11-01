#!/usr/bin/env node
// End-to-End-Test gegen lokales `wrangler dev` + lokale D1 (frische DB unter .wrangler/e2e). Aufruf: node scripts/e2e.mjs
import { spawn, execSync } from "node:child_process";
import { webcrypto as C } from "node:crypto";
import fs from "node:fs";
import { normInv, inventorySlotMap, renderInventoryCard } from "../src/mc-inventory.js";
import { faceRgba, skinOk, skinResponse, renderHead, encodePng, fetchRetry, RETRY_MS, resolveSkin, DEFAULT_SKINS, validSkinUrl } from "../src/mc-head.js";
import "./vip-unit.mjs";
const ROOT = new URL("..", import.meta.url).pathname, PORT = +(process.env.E2E_PORT || 8799), BASE = `http://127.0.0.1:${PORT}`, HOST = "mc.nwebnotfound.dev", TOK = "e2e-token", SECRET = "e2e-secret";
const PERSIST = ROOT + ".wrangler/e2e", DV = ROOT + ".dev.vars";
let pass = 0, fail = 0; const ok = (c, m, extra = "") => { if (c) pass++; else fail++; console.log((c ? "  ✓ " : "  ✗ ") + m + (c ? "" : "  " + extra)); };
const sql = (q) => execSync(`npx wrangler d1 execute DB --local --persist-to ${PERSIST} --json --command ${JSON.stringify(q)}`, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sqlRows = (q) => JSON.parse(sql(q))[0].results;
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function cookieFor(sid) { const k = await C.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return "nnf_session=" + encodeURIComponent(sid + "." + b64u(await C.subtle.sign("HMAC", k, new TextEncoder().encode(sid)))); }
const req = async (path, { method = "GET", body, token, cookie, origin, ip = "10.0.0.1", headers = {}, host = HOST, testHost } = {}) => {
  const h = { host, "cf-connecting-ip": ip, ...headers };
  if (testHost) h["x-nnf-test-host"] = testHost;
  if (body) h["content-type"] = "application/json";
  if (token) h["x-ingest-token"] = token;
  if (cookie) h.cookie = cookie;
  if (origin) h.origin = origin;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t };
};
const U1 = "11111111-2222-3333-4444-555555555555", U2 = "0f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f8", D1 = "100000000000000001", D2 = "100000000000000002", O = "https://" + HOST;
const now = Date.now(), H = 3600, HR0 = Math.floor(now / 1000 / H) * H, RESET = new Date((HR0 - 28 * H) * 1000).toISOString();

// Rang-Badges im hellen Theme: Kontrast >= 4.5:1 gegen Badge-Hintergrund
{ const css = fs.readFileSync(ROOT + "public/mc/profile.css", "utf8"), L = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }, CR = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  const bg = (css.match(/html:not\(\.mc\) \.pk-run \.pk-rk\{[^}]*background:(#[0-9a-f]{6})/i) || [])[1], cols = [...css.matchAll(/html:not\(\.mc\) \.pk-run \.pk-rk(?:\.p\d)?\{color:(#[0-9a-f]{6})/gi)].map((m) => m[1]);
  ok(bg && cols.length === 4 && cols.every((c) => CR(c, bg) >= 4.5), "Rang-Badges hell: Kontrast >= 4.5:1", JSON.stringify(cols.map((c) => [c, bg && CR(c, bg).toFixed(2)]))); }
// --- Setup
fs.rmSync(PERSIST, { recursive: true, force: true });
const hadDV = fs.existsSync(DV); if (hadDV) fs.copyFileSync(DV, DV + ".e2e-bak");
fs.writeFileSync(DV, `MC_INGEST_TOKEN=${TOK}\nSESSION_SECRET=${SECRET}\nDISCORD_CLIENT_ID=1\nDISCORD_CLIENT_SECRET=x\nTURNSTILE_SECRET=1x0000000000000000000000000000000AA\nFEEDBACK_ADMIN_TOKEN=e2e-admin\nPRICE_RESET_AT=${RESET}\n`);
console.log("Schema …"); execSync(`npx wrangler d1 execute DB --local --persist-to ${PERSIST} --file schema.sql`, { cwd: ROOT, stdio: "ignore" });
const wd = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--local-upstream", HOST, "--persist-to", PERSIST], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = ""; wd.stdout.on("data", (d) => (log += d)); wd.stderr.on("data", (d) => (log += d));
const cleanup = () => { try { process.kill(-wd.pid); } catch {} fs.rmSync(DV, { force: true }); if (hadDV) fs.renameSync(DV + ".e2e-bak", DV); };
process.on("exit", cleanup); process.on("SIGINT", () => process.exit(130));
for (let i = 0; i < 60; i++) { try { await fetch(BASE + "/", { headers: { host: HOST } }); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

try {
  sql(`INSERT INTO sessions (id, discord_id, username, global_name, expires_at) VALUES ('s1','${D1}','nils','Nils',datetime('now','+1 day')),('s2','${D2}','seller','Seller',datetime('now','+1 day'))`);
  const c1 = await cookieFor("s1"), c2 = await cookieFor("s2");

  console.log("0) Parkour leer");
  { const g = fs.readFileSync(ROOT + "src/generated/changelog.js", "utf8"); ok(g.includes("Für Spieler") && !/## Admin|creepy_ro|PR #\d|v_economy_daily|--profile/.test(g), "Gebündelter Changelog enthält nur den Spieler-Teil"); }
  { const r = await req("/changelog"); ok(r.s === 200 && r.t.includes("Changelog.") && r.t.includes("Stack für Stack") && r.t.includes("/mc/changelog.css"), "GET /changelog → 200 mit Spieler-Einträgen", r.t.slice(0, 200));
    ok(!r.t.includes("creepy_ro") && !r.t.includes("PR #28") && !r.t.includes("Admin"), "Changelog zeigt keinen Admin-Teil");
    const body = r.t.slice(r.t.indexOf('id="changelog"')); ok(!/<script|<style| style=/.test(body.slice(0, body.indexOf("</section>"))), "Changelog-Inhalt ohne Inline-Script/-Style");
    { const m = await req("/changelog", { testHost: "nwebnotfound.dev" }); ok(!m.t.includes("Stack für Stack"), "Changelog nicht auf der persönlichen Seite", String(m.s)); } }
  { const r = await req("/api/mc-parkour"); ok(r.s === 200 && r.j && Object.keys(r.j.courses).length === 0, "Parkour-API leer → courses {}", r.t); const pg = await req("/parkour"); ok(pg.s === 200 && pg.t.includes("/api/mc-parkour") && pg.t.includes("Noch keine Zeiten"), "GET /parkour leer → 200 mit Leerzustand"); }
  console.log("1) Ingest");
  ok((await req("/api/mc-ingest", { method: "POST", body: {} })).s === 401, "Ingest ohne Token → 401");
  ok((await req("/api/mc-ingest", { method: "POST", body: {}, token: "falsch" })).s === 401, "Ingest falscher Token → 401");
  const hr = Math.floor(now / 1000 / H) * H;
  const payload = {
    links: [{ discord_id: D1, mc_name: "Nils", mc_uuid: U1.replace(/-/g, ""), has_role: true, verified: true }, { discord_id: D2, mc_name: "Seller", mc_uuid: U2, has_role: true, verified: true }],
    market: [
      { item: "diamond", buy_price: 11, sell_price: 2, base_price: 10, volume_24h_cp: 500, trades_24h: 3, change_24h_pct: 0 },
      { item: "elytra", buy_price: null, sell_price: 3750, locked: true },
      { item: "netherite_block", buy_price: 0, sell_price: 16875 },
      { item: "beacon", buy_price: 18000, sell_price: null, buy_enabled: true, sell_enabled: false },
      { item: "dirt", buy_price: 0.1, sell_price: 0.01 },
      { item: "dragon_egg", buy_price: null, sell_price: null, buy_enabled: false, sell_enabled: false },
      { item: "copper_ingot", buy_price: 2.4, sell_price: 1, base_price: 2, volume_24h_cp: 900, trades_24h: 5, change_24h_pct: -97.6 },
      { item: "shulker_box", buy_price: 50, sell_price: 30, base_price: 50, volume_24h_cp: 100, trades_24h: 1, change_24h_pct: 4900 },
    ],
    v_market_history: [
      { item: "diamond", ts: hr - 26 * H, price: 10, volume: 4 }, { item: "diamond", hour_ts: (hr - 1 * H) * 1000, avg_price: 11, min: 10.5, max: 11.5, qty: 2 },
      // Preis-Reset (PRICE_RESET_AT = hr-28h): Kupfer 100 → (Reset) 2 → 2,4; alter Punkt bleibt in der Historie, zählt aber nicht für %
      { item: "copper_ingot", ts: hr - 40 * H, price: 100, volume: 1 }, { item: "copper_ingot", ts: hr - 27 * H, price: 2, volume: 3 }, { item: "copper_ingot", ts: hr - 1 * H, price: 2.4, volume: 3 },
    ],
    shops: [{ id: "s1", owner_uuid: U2, owner_name: "Seller", name: "Seller-Shop", items: [{ listing_id: "L1", item: "diamond", price: 1500, stock: 10, mode: "sell" }, { listing_id: "L2", item: "dirt", price: null, stock: 5 }] },
            { id: "s2", owner_uuid: U1, owner_name: "Nils", name: "Mein Shop", items: [{ listing_id: "L3", item: "oak_log", price: 100, stock: 64 }] }],
    v_auctions: [
      { id: "a1", item: "diamond", menge: 16, seller: U2, min_price: 5000, current_bid: null, current_bidder: null, bid_count: 0, ends_at: now + 36e5, status: "active", created_at: Math.floor(now / 1000), min_next_bid: null },
      { id: "a2", item: "minecraft:elytra", menge: 1, seller: U2, min_price: 10000, current_bid: 20000, current_bidder: U2, bid_count: 2, ends_at: now + 36e5, status: "ACTIVE", created_at: now, source_last_bid: "game", min_next_bid: 21500 },
      { id: "a3", item: "beacon", menge: 1, seller: U2, min_price: 10000, current_bid: 20000, current_bidder: U2, bid_count: 1, ends_at: now + 36e5, status: "active", created_at: now, min_next_bid: null },
      { id: "a4", item: "oak_log", menge: 64, seller: U1, min_price: 100, bid_count: 0, ends_at: now + 36e5, status: "active", created_at: now },
      { id: "a5", item: "dirt", menge: 1, seller: U2, min_price: 100, bid_count: 0, ends_at: now - 1000, status: "sold", created_at: now - 9e6 },
    ],
    v_auction_bids: [{ id: 1, auction_id: "a2", bidder: U2, amount: 20000, created_at: Math.floor(now / 1000), source: "game" }, { id: 2, auction_id: "a2", bidder: "99999999-8888-7777-6666-555555555555", amount: 15000, created_at: now - 6e4, source: "web" }],
    v_leaderboards: [
      { category: "cp", uuid: U1, value: 1500, rank: 1 }, { category: "cp", player: U2, score: 1200, rank: 2 }, { stat: "playtime", player_uuid: U2, name: "Seller", value: 3600 },
      { key: "kills", uuid: U1, value: 5, period: "weekly" }, { category: "cp", uuid: "99999999-8888-7777-6666-555555555555", value: 1 },
    ],
    v_player_stats_ext: [{ uuid: U1, name: "Nils", inv: '[{"id":"minecraft:diamond_sword","amount":1,"slot":0},{"type":"OAK_LOG","qty":32,"slot":9},{"item":"abandoned_camp_map","slot":40},{"item":"air","slot":5}]', abholfach: [{ material: "diamond", count: 2 }, "minecraft:bread"], cp: 900, playtime_s: 7200, deaths: 3, mined: '{"minecraft:stone":120,"dirt":5}', killed: { zombie: 12, creeper: 3 }, distance_m: { walk: 15300, sprint: 820 }, fished: 4 }, { player: U2, stat: "cp", value: 1200 }, { player: U2, stat: "deaths", value: 1 }],
  };
  const ing = await req("/api/mc-ingest", { method: "POST", body: payload, token: TOK });
  ok(ing.s === 200 && ing.j?.ok, "Ingest mit Token → 200", ing.t.slice(0, 200));
  ok(ing.j?.auctions === 5 && ing.j?.shops === 2 && ing.j?.market === 8, "Zählung auctions/shops/market", JSON.stringify(ing.j));
  ok(ing.j?.views?.leaderboards >= 3 && ing.j?.players_stats === 2, "Views: Leaderboards + Player-Stats erkannt", JSON.stringify(ing.j));
  ok(ing.j?.market_history === 5, "v_market_history: 5 Punkte", JSON.stringify(ing.j));

  console.log("2) Markt");
  const m = (await req("/api/mc-market")).j, by = Object.fromEntries(m.items.map((x) => [x.item, x]));
  ok(by.elytra.buy_locked === 1 && by.netherite_block.buy_locked === 1, "locked/buy_price 0 → buy_locked");
  ok(by.beacon.sell_locked === 1 && by.beacon.buy_locked === 0, "sell_enabled:false → sell_locked");
  ok(by.dragon_egg && by.dragon_egg.buy_locked === 1 && by.dragon_egg.sell_locked === 1, "beide Preise null → trotzdem übernommen, gesperrt");
  ok(by.diamond.hist_pct === 1 && Math.abs(by.diamond.change_24h_pct - 10) < 0.01, "%-Änderung aus Historie (10 → 11 = +10 %)", JSON.stringify(by.diamond));
  ok(!by.dirt.hist_pct && !by.dirt.has_hist, "ohne Historie: kein hist_pct (UI zeigt —)");
  ok(m.price_reset_at === RESET, "price_reset_at aus PRICE_RESET_AT", m.price_reset_at);
  ok(by.copper_ingot.hist_pct === 1 && Math.abs(by.copper_ingot.change_24h_pct - 20) < 0.01, "Preis-Reset: % nur ab Stichtag (2 → 2,4 = +20 %, kein −98 %-Crash)", JSON.stringify(by.copper_ingot));
  ok(m.spark.copper_ingot?.length === 3 && m.spark_reset?.copper_ingot === 1, "Preis-Reset: Sparkline behält alte Punkte + Reset-Index", JSON.stringify([m.spark.copper_ingot, m.spark_reset]));
  ok(!m.spark_reset?.diamond, "Diamant: kein Reset-Marker (alle Punkte nach Stichtag)");
  const mc = (await req("/api/mc-market/copper_ingot")).j; ok(mc.history.length === 3 && mc.price_reset_at === RESET && mc.item.change_24h_pct === 20, "Item-API: volle Historie + Reset-Zeit", JSON.stringify(mc).slice(0, 300));
  // Ingest-Feld price_reset_at hat Vorrang vor env; null löscht wieder
  const R2 = new Date((HR0 - 2 * H) * 1000).toISOString();
  const ir = await req("/api/mc-ingest", { method: "POST", body: { price_reset_at: R2 }, token: TOK }); ok(ir.s === 200 && ir.j.price_reset_at === R2 && sqlRows("SELECT value FROM mc_meta WHERE key='price_reset_at'")[0]?.value === R2, "Ingest price_reset_at → mc_meta gespeichert", ir.t);
  const m2 = (await req("/api/mc-market")).j, cu2 = m2.items.find((x) => x.item === "copper_ingot");
  ok(m2.price_reset_at === R2 && m2.spark_reset.copper_ingot === 2 && cu2.reset_new === 1 && cu2.change_24h_pct === 0 && !cu2.hist_pct, "Ingest-Reset vor env: <24h nach Reset keine %-Änderung ('neu')", JSON.stringify([m2.price_reset_at, m2.spark_reset, cu2]));
  ok((await req("/api/mc-ingest", { method: "POST", body: { price_reset_at: "kaputt" }, token: TOK })).j.price_reset_at === "invalid" && (await req("/api/mc-market")).j.price_reset_at === R2, "ungültiges price_reset_at wird ignoriert");
  ok((await req("/api/mc-ingest", { method: "POST", body: { price_reset_at: null }, token: TOK })).j.price_reset_at === null && (await req("/api/mc-market")).j.price_reset_at === RESET, "price_reset_at: null → zurück auf env PRICE_RESET_AT");
  const mi = (await req("/api/mc-market/diamond")).j; ok(mi.history.length === 2 && mi.item.hist_pct === 1, "Item-API: Historie + hist_pct");


  console.log("3) Bestenlisten + Stats");
  const lb = (await req("/api/mc-leaderboards")).j;
  const cp = lb.total?.lists?.money; ok(cp?.[0]?.name === "Nils" && cp[1].name === "Seller", "cp→money, nach rank, Namen aus mc_links", JSON.stringify(lb.total?.lists));
  ok(cp?.length === 2, "unbekannte UUID ohne Namen wird übersprungen");
  ok(lb.total.lists.playtime?.[0]?.name === "Seller", "stat/name-Spalten akzeptiert");
  ok(lb.weekly?.lists?.kills?.[0]?.value === 5, "period weekly → Wochenliste", JSON.stringify(lb.weekly));
  const ps = sqlRows("SELECT mc_uuid, stats, details FROM mc_player_stats ORDER BY mc_uuid");
  const p1 = ps.find((r) => r.mc_uuid === U1), p2 = ps.find((r) => r.mc_uuid === U2);
  ok(p1 && JSON.parse(p1.stats).cp === 900 && JSON.parse(p1.details || "{}").mined?.stone === 120, "Player-Stats breit + mined-JSON → details", p1 && p1.stats + " " + p1.details);
  ok(p2 && JSON.parse(p2.stats).deaths === 1, "Player-Stats lang (stat/value)", p2 && p2.stats);

  console.log("4) Auktionen + Gebote");
  const au = (await req("/api/mc-auctions")).j.auctions, A = Object.fromEntries(au.map((x) => [x.id, x]));
  ok(A.a1.min_next === 5000, "keine Gebote, min_next_bid null → min_price", A.a1.min_next);
  ok(A.a2.min_next === 21500, "min_next_bid gesetzt → genutzt");
  ok(A.a3.min_next === 21000, "Gebote, min_next_bid null → höchstes + max(100, 5 %)", A.a3.min_next);
  ok(A.a5.status === "ended" && A.a1.seller_name === "Seller" && A.a1.amount === 16, "Status sold→ended, Name aus mc_links, menge");
  ok(A.a1.created_at === Math.floor(now / 1000) * 1000, "created_at Sekunden → ms");
  const d2 = (await req("/api/mc-auctions/a2")).j.auction; ok(d2.bids.length === 2 && d2.bids[0].name === "Seller" && d2.bids[1].name === "99999999…", "Gebotsverlauf mit Namen / Kurz-UUID", JSON.stringify(d2.bids));
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a1", amount: 5000 }, origin: O })).s === 401, "Gebot ohne Session → 401");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a1", amount: 5000 }, cookie: c1, origin: "https://evil.example" })).s === 403, "falscher Origin → 403");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a1", amount: 5000 }, cookie: c1 })).s === 403, "kein Origin → 403");
  let r = await req("/api/mc-bid", { method: "POST", body: { auction_id: "a1", amount: 4999 }, cookie: c1, origin: O }); ok(r.s === 409 && r.j.min_next === 5000, "unter min_price → 409");
  r = await req("/api/mc-bid", { method: "POST", body: { auction_id: "a1", amount: 5000, bidder_uuid: U2 }, cookie: c1, origin: O }); ok(r.s === 202, "Gebot = min_price → 202", r.t);
  const bidId = r.j?.request_id;
  ok(sqlRows(`SELECT bidder_uuid FROM mc_bids_pending WHERE id='${bidId}'`)[0]?.bidder_uuid === U1, "bidder_uuid serverseitig aus mc_links (Client-UUID ignoriert)");
  r = await req("/api/mc-bid", { method: "POST", body: { auction_id: "a1", amount: 5000 }, cookie: c1, origin: O }); ok(r.s === 409 && r.j.min_next === 5001, "eigenes offenes Gebot hebt Minimum");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a2", amount: 21499 }, cookie: c1, origin: O })).s === 409, "a2 21499 < min_next_bid → 409");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a2", amount: 21500 }, cookie: c1, origin: O })).s === 202, "a2 21500 → 202");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a3", amount: 20999 }, cookie: c1, origin: O })).s === 409, "a3 20999 → 409");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a4", amount: 500 }, cookie: c1, origin: O })).s === 403, "eigene Auktion → 403");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a5", amount: 500 }, cookie: c1, origin: O })).s === 409, "beendete Auktion → 409");
  ok((await req("/api/mc-bid", { method: "POST", body: { auction_id: "a1", amount: 50.5 }, cookie: c1, origin: O })).s === 400, "Kommabetrag → 400");

  console.log("5) Shop-Bestellungen");
  ok((await req("/api/mc-shop-order", { method: "POST", body: { listing_id: "L1", qty: 11 }, cookie: c1, origin: O })).s === 409, "Menge > Lager → 409");
  ok((await req("/api/mc-shop-order", { method: "POST", body: { listing_id: "L2", qty: 1 }, cookie: c1, origin: O })).s === 404, "Angebot mit Preis null wird verworfen → 404");
  ok((await req("/api/mc-shop-order", { method: "POST", body: { listing_id: "L3", qty: 1 }, cookie: c1, origin: O })).s === 403, "eigener Shop → 403");
  r = await req("/api/mc-shop-order", { method: "POST", body: { listing_id: "L1", qty: 2 }, cookie: c1, origin: O }); ok(r.s === 202 && r.j.total === 3000, "Bestellung per listing_id → 202, total 3000", r.t);
  const ordId = r.j?.request_id;
  { const row = sqlRows(`SELECT type, shop_id, listing_id FROM mc_shop_orders_pending WHERE id='${ordId}'`)[0]; ok(row && row.type === "shop" && row.shop_id === "s1" && row.listing_id === "L1" && /^[0-9a-f-]{36}$/.test(ordId), "Shop-Order unverändert: type shop, shop_id/listing_id gesetzt, request_id serverseitig", JSON.stringify(row)); }
  { const pz = (await req("/api/mc-shop-orders/pending", { token: TOK })).j.items.find((x) => x.request_id === ordId || x.id === ordId); ok(pz && pz.type === "shop" && pz.shop_id === "s1", "Shop-Order in /pending wie bisher (+type)", JSON.stringify(pz)); }
  r = await req("/api/mc-shop-order", { method: "POST", body: { shop_id: "s1", item: "diamond", qty: 1 }, cookie: c1, origin: O }); ok(r.s === 202, "Legacy shop_id+item → 202 (4. Aktion)");
  r = await req("/api/mc-bid", { method: "POST", body: { auction_id: "a3", amount: 21000 }, cookie: c1, origin: O }); ok(r.s === 202, "a3 21000 → 202 (5. Aktion)", r.t);
  r = await req("/api/mc-shop-order", { method: "POST", body: { listing_id: "L1", qty: 1 }, cookie: c1, origin: O }); ok(r.s === 429, "6. Aktion in 1 min → 429 Rate-Limit", r.s);
  r = await req("/api/mc-shop-order", { method: "POST", body: { listing_id: "L1", qty: 1 }, cookie: c2, origin: O, ip: "10.0.0.1" }); ok(r.s === 403, "anderer User, eigener Shop → 403 (nicht vom Limit des ersten Users betroffen)", r.s);

  console.log("6) Bot: pending + ack");
  ok((await req("/api/mc-bids/pending")).s === 401, "pending ohne Token → 401");
  const pb = (await req("/api/mc-bids/pending", { token: TOK })).j; ok(pb.items.length === 3 && pb.items.every((x) => x.idem_key && x.bidder_uuid === U1), "3 offene Gebote mit idem_key", JSON.stringify(pb.items));
  const po = (await req("/api/mc-shop-orders/pending", { token: TOK })).j; ok(po.items.length === 2 && po.items[0].listing_id === "L1" && po.items[0].max_unit_price_cent === 1500 && po.items[0].uuid === U1, "Bestellungen mit listing_id/uuid/max_unit_price_cent", JSON.stringify(po.items[0]));
  const other = pb.items.find((x) => x.auction_id === "a2").id, third = pb.items.find((x) => x.auction_id === "a3").id;
  r = await req("/api/mc-bids/ack", { method: "POST", token: TOK, body: { acks: [{ id: bidId, status: "accepted" }, { id: other, status: "rejected", reason: "OUTBID" }, { id: third, status: "accepted" }, { id: "x", status: "bogus" }] } }); ok(r.j?.updated === 3, "Gebote ack OK/ERR (ungültige ignoriert)", r.t);
  r = await req("/api/mc-shop-orders/ack", { method: "POST", token: TOK, body: { acks: [{ id: ordId, status: "rejected", reason: "PRICE_CHANGED" }] } }); ok(r.j?.updated === 1, "Bestellung ack ERR");
  r = await req("/api/mc-bids/ack", { method: "POST", token: TOK, body: { acks: [{ id: bidId, status: "rejected" }] } }); ok(r.j?.updated === 0, "doppeltes ack ändert nichts");
  ok((await req("/api/mc-bids/pending", { token: TOK })).j.items.length === 0, "nach ack keine offenen Gebote");
  console.log("6c) Abholungen");
  ok((await req("/api/mc-abholungen")).j.logged_in === false, "Abholungen ohne Login → logged_in false");
  let ab = (await req("/api/mc-abholungen", { cookie: c1 })).j;
  ok(ab.linked && ab.orders.length === 2 && ab.orders.some((o) => o.status === "rejected" && o.stage === "failed"), "Abholungen: Bestellungen mit Stufen", JSON.stringify(ab.orders));
  ok(ab.pickup.length === 2 && ab.pickup[0].item === "diamond" && ab.pickup[0].count === 2 && ab.pickup[1].item === "bread", "Abholfach flexibel gemappt", JSON.stringify(ab.pickup));
  const openO = ab.orders.find((o) => o.stage === "pending").id;
  r = await req("/api/mc-shop-orders/ack", { method: "POST", token: TOK, body: { acks: [{ id: openO, status: "ready" }] } }); ok(r.j?.updated === 1, "ack 'ready' → abholbereit");
  ok((await req("/api/mc-abholungen", { cookie: c1 })).j.orders.find((o) => o.id === openO).stage === "ready", "Stufe ready");
  r = await req("/api/mc-shop-orders/ack", { method: "POST", token: TOK, body: { acks: [{ id: openO, status: "collected" }] } }); ok(r.j?.updated === 1, "ack 'collected'");
  r = await req("/api/mc-shop-orders/ack", { method: "POST", token: TOK, body: { acks: [{ id: openO, status: "ready" }] } }); ok(r.j?.updated === 0, "abgeholt ist final");
  r = await req("/api/mc-shop-orders/ack", { method: "POST", token: TOK, body: { acks: [{ id: openO, status: "accepted" }] } }); ok(r.j?.updated === 0, "accepted nur aus pending");
  const pf = (await req("/api/profile", { cookie: c1 })).j.minecraft?.stats?.inventory || [];
  ok(pf.length === 3 && pf[0].item === "diamond_sword" && pf[1].item === "oak_log" && pf[1].count === 32 && pf[1].slot === 9, "Inventar flexibel normalisiert (id/type/amount/qty, air raus)", JSON.stringify(pf));
  ok((await req("/profile", { cookie: c1 })).t.includes("/mc/inventory.js"), "Profil lädt Inventar-Renderer");
  const invHtml = renderInventoryCard(pf);
  ok((invHtml.match(/class="ivs/g) || []).length >= 41 && invHtml.includes("iv-pane") && invHtml.includes("iv-arm"), "Inventar-HTML: volles Layout (41+ Slots)", invHtml.slice(0, 120));
  const legacy = normInv([{ item: "bread", count: 5 }, { item: "diamond", count: 1 }]);
  ok(inventorySlotMap(legacy)[0]?.item === "bread" && inventorySlotMap(legacy)[1]?.item === "diamond", "Legacy-Inventar ohne slot → Hotbar 0,1", JSON.stringify(legacy));
  const mixed = normInv([{ item: "bread", slot: 0 }, { item: "diamond", count: 1 }, { item: "oak_log", slot: 9 }]);
  const mm = inventorySlotMap(mixed);
  ok(mm[0]?.item === "bread" && mm[1]?.item === "diamond" && mm[9]?.item === "oak_log", "Gemischtes Inventar: slotted zuerst, Rest in freie Slots", JSON.stringify(mm));
  const mainProf = await req("/profile", { cookie: c1, testHost: "nwebnotfound.dev" });
  ok(mainProf.s === 200 && mainProf.t.includes("/mc/inventory.js") && mainProf.t.includes("#pb .mch") && !/ds\.css\?v=/.test(mainProf.t), "Hauptdomain-Profil: inline CSS + Inventar-Skript");
  ok((await req("/mc/inventory.js", { testHost: "nwebnotfound.dev" })).s === 200 && (await req("/mc/inventory.js")).s === 200, "/mc/inventory.js auf Haupt- und MC-Host");
  ok(!JSON.stringify((await req("/api/mc-players/Nils")).j).includes("diamond_sword"), "Inventar/Abholfach nicht öffentlich");
  const mine = (await req("/api/mc-auctions/a1", { cookie: c1 })).j; ok(mine.mine[0]?.status === "accepted" && mine.viewer.can_bid === true, "Auktionsseite zeigt eigenes Gebot 'accepted'");
  const mine2 = (await req("/api/mc-auctions/a2", { cookie: c1 })).j; ok(mine2.mine[0]?.status === "rejected" && mine2.mine[0]?.reason === "OUTBID", "abgelehntes Gebot mit Grund");
  const own = (await req("/api/mc-auctions/a1", { cookie: c2 })).j; ok(own.viewer.own === true && own.viewer.can_bid === false, "Verkäufer sieht eigene Auktion, kein Bieten");
  r = await req("/api/mc-bid", { method: "POST", token: TOK, body: { discord_id: D2, auction_id: "a4", amount: 100 } }); ok(r.s === 202, "Bot-Gebot im Auftrag (Token + discord_id) → 202", r.t);
  ok((await req("/api/mc-bid", { method: "POST", token: "falsch", body: { discord_id: D2, auction_id: "a3", amount: 30000 } })).s === 401, "Bot-Gebot falscher Token → 401");

  console.log("6b) Spielersuche");
  sql(`INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES ('100000000000000009','Versteckt','aaaaaaaa-0000-0000-0000-00000000c0de',1,0,0)`);
  const pl = (await req("/api/mc-players")).j?.players || [];
  ok(pl.some((x) => x.name === "Nils") && pl.some((x) => x.name === "Seller"), "Spielerliste enthält verknüpfte Spieler", JSON.stringify(pl));
  ok(!pl.some((x) => x.name === "Versteckt"), "Unbestätigte Verknüpfung nicht öffentlich");
  ok((await req("/api/mc-players?q=nls")).j.players[0]?.name === "Nils", "Fuzzy: 'nls' → Nils");
  ok((await req("/api/mc-players?q=Selr")).j.players[0]?.name === "Seller", "Fuzzy: Tippfehler 'Selr' → Seller");
  ok((await req("/api/mc-players?q=zzzzqq")).j.players.length === 0, "Fuzzy: kein Treffer → leer");
  const pn = (await req("/api/mc-players/nils")).j;
  ok(pn?.name === "Nils" && pn.stats && !pn.details && pn.viewer.logged_in === false, "Spielerseite öffentlich ohne Details", JSON.stringify(pn));
  const pd = (await req("/api/mc-players/Nils", { cookie: c1 })).j;
  ok(pd?.details && pd.viewer.logged_in === true, "Details nur mit Discord-Login", JSON.stringify(pd));
  ok(pd?.details?.extra?.killed?.zombie === 12 && pd.details.extra.distance_m?.walk === 15300, "Details enthalten Mob-Kills + Distanzen", JSON.stringify(pd?.details));
  ok((await req("/spieler/Nils", { cookie: c1 })).t.includes("Gefischt"), "Spieler-Details: Zähler nur in kvl (z. B. Gefischt)");
  ok((await req("/api/mc-players/Versteckt")).s === 404, "Unbestätigter Spieler → 404");
  sql(`UPDATE mc_player_stats SET stats = json_set(stats, '$.inventory', json('[{"item":"diamond_sword","count":1}]'), '$.pickup', json('[{"item":"diamond","count":2}]'), '$.secret_note', 'x') WHERE mc_uuid = '${U1}'`);
  sql(`INSERT INTO sessions (id, discord_id, username, global_name, expires_at) VALUES ('s3','100000000000000009','versteckt','Versteckt',datetime('now','+1 day'))`);
  const c3 = await cookieFor("s3");
  const fo = await req("/api/mc-players/Nils", { cookie: c2 });
  ok(fo.j?.details && fo.j.viewer.can_details === true && !/inventory|pickup|diamond_sword|secret_note/.test(fo.t), "eingeloggt, fremdes Profil: Details ohne Inventar/Pickup", fo.t.slice(0, 300));
  ok(fo.j?.details?.all && Object.values(fo.j.details.all).every((v) => typeof v === "number"), "details.all nur numerische Whitelist-Stats");
  const nr = (await req("/api/mc-players/Nils", { cookie: c3 })).j;
  ok(nr && !nr.details && nr.viewer.logged_in === true && nr.viewer.can_details === false, "eingeloggt ohne Rolle/Verifizierung → keine Details", JSON.stringify(nr));
  ok((await req("/spieler/bad%3Cname")).s === 404, "Ungültiger Name → 404");
  ok((await req("/spieler/Nils")).t.includes("/api/mc-players/") && !(await req("/spieler/Nils")).t.includes("<script>alert"), "Spielerseite lädt API");

  console.log("6d) Feedback");
  const fb = (body, o = {}) => req("/api/feedback", { method: "POST", body, cookie: c1, origin: O, ...o });
  const good = { category: "bug", text: "Beschreibung mit genug Text c0de", location: "Spawn", token: "XXXX.DUMMY.TOKEN.XXXX" };
  for (const h of [HOST, "nwebnotfound.dev"]) { const pg = await req("/feedback", { testHost: h }); ok(pg.s === 200 && pg.t.includes("/api/feedback") && pg.t.includes("challenges.cloudflare.com/turnstile") && /mc\/ds\.css|ds\.css\?v=/.test(pg.t), "GET /feedback auf " + h + " → 200 (MC-Design)", pg.s); }
  ok((await req("/feedback", { testHost: "nwebnotfound.dev" })).t.includes('href="https://mc.nwebnotfound.dev/markt"'), "Hauptdomain: MC-Navigation absolut");
  // Login-Gate
  ok((await req("/api/feedback")).j.logged_in === false, "Login-Gate: GET ohne Login → logged_in false (Seite zeigt Login-Button)");
  ok((await req("/feedback")).t.includes("/auth/discord/login"), "Seite enthält Discord-Login-Button");
  ok((await fb(good, { cookie: undefined })).s === 401, "Login-Gate: POST ohne Login → 401");
  // Rollen-Gate (s3 = eingeloggt, aber kein verifizierter Link/keine Rolle)
  ok((await fb(good, { cookie: c3 })).s === 403, "Rollen-Gate: ohne Link/Rolle → 403");
  const g3 = (await req("/api/feedback", { cookie: c3 })).j; ok(g3.logged_in && g3.can === false, "Rollen-Gate: GET can=false", JSON.stringify(g3));
  sql(`UPDATE mc_links SET has_role = 0 WHERE discord_id = '${D2}'`);
  ok((await fb(good, { cookie: c2 })).s === 403, "Rollen-Gate: verknüpft, Rolle entzogen → 403");
  sql(`UPDATE mc_links SET has_role = 1 WHERE discord_id = '${D2}'`);
  ok((await fb(good, { origin: "https://evil.example" })).s === 403, "Falscher Origin → 403");
  ok((await fb({ ...good, category: "x" })).s === 400 && (await fb({ ...good, text: "kurz" })).s === 400, "Validierung Kategorie/Text → 400");
  // Turnstile
  ok((await fb({ ...good, token: "" })).s === 403, "Turnstile: ohne Token → 403");
  for (let i = 0; i < 2; i++) { const r2 = await fb({ ...good, category: ["bug", "other"][i], text: good.text + " " + i }); ok(r2.s === 201, "Feedback " + (i + 1) + " → 201 (Turnstile ok)", r2.t); }
  ok((await fb({ ...good, text: "x".repeat(2500) })).s === 201, "Feedback 3 mit Überlänge → 201 (wird gekürzt)");
  // Rate-Limit (3/Tag): der lange Text war Nr. 3 → gekürzt gespeichert
  ok((await fb(good)).s === 429, "Rate-Limit: 4. Feedback am Tag → 429");
  ok((await fb(good, { cookie: c2, ip: "10.9.9.9" })).s === 201, "Rate-Limit pro Discord-ID (anderer Account ok)");
  const fm = (await req("/api/feedback", { cookie: c1 })).j; ok(fm.can && fm.remaining === 0 && fm.mine.length === 3, "GET: eigene Einreichungen + Rest 0", JSON.stringify(fm));
  const row = sqlRows(`SELECT * FROM feedback WHERE discord_id = '${D1}' ORDER BY id`);
  ok(row.length === 3 && row[0].mc_name === "Nils" && row[0].mc_uuid && row[0].category === "bug" && row[1].category === "other" && row[2].text.length === 2000, "D1: Felder gespeichert, Text auf 2000 gekürzt", JSON.stringify(row[0]));
  ok(!JSON.stringify(sqlRows("SELECT * FROM feedback")).includes("10.0.0") && !Object.keys(row[0]).some((k) => /ip/i.test(k)), "Keine IP gespeichert");
  // Admin
  ok((await req("/api/feedback/admin")).s === 401 && (await req("/api/feedback/admin", { headers: { authorization: "Bearer falsch" } })).s === 401, "Admin ohne/mit falschem Bearer → 401");
  ok((await req("/api/feedback/admin/1", { method: "PATCH", body: { status: "done" } })).s === 401, "Admin PATCH ohne Bearer → 401");
  ok((await req("/api/feedback/admin", { cookie: c1 })).s === 401, "Admin mit Session statt Bearer → 401");
  const AH = { authorization: "Bearer e2e-admin" };
  const al = await req("/api/feedback/admin?status=open", { headers: AH }); ok(al.s === 200 && al.j.items.length === 4 && al.j.items.some((x) => x.mc_name === "Nils") && !("discord_id" in al.j.items[0]), "Admin GET → 200, Liste ohne Discord-ID", al.t.slice(0, 200));
  ok((await req("/api/feedback/admin?category=other", { headers: AH })).j.items.length === 1, "Admin GET Filter Kategorie");
  const fid = al.j.items[0].id;
  ok((await req("/api/feedback/admin/" + fid, { method: "PATCH", body: { status: "done" }, headers: AH })).s === 200, "Admin PATCH status done → 200");
  ok((await req("/api/feedback/admin/" + fid, { method: "PATCH", body: { status: "kaputt" }, headers: AH })).s === 400, "Admin PATCH ungültiger Status → 400");
  ok((await req("/api/feedback/admin/99999", { method: "PATCH", body: { status: "done" }, headers: AH })).s === 404, "Admin PATCH unbekannt → 404");
  ok((await req("/api/feedback/admin?status=done", { headers: AH })).j.items.length === 1, "Admin GET Filter done");
  console.log("9) UX-Batch: Bank-Direktkauf, Bestellungen, Icons, Navigation");
  const U9 = "33333333-4444-5555-6666-777777777777", D9 = "100000000000000033";
  sql(`INSERT INTO sessions (id, discord_id, username, global_name, expires_at) VALUES ('s9','${D9}','buyer','Buyer',datetime('now','+1 day'))`); const c9 = await cookieFor("s9");
  ok((await req("/api/mc-ingest", { method: "POST", token: TOK, body: { links: [{ discord_id: D9, mc_name: "Buyer", mc_uuid: U9, has_role: true, verified: true }] } })).s === 200, "Link für Käufer");
  const pend0 = (await req("/api/mc-shop-orders/pending", { token: TOK })).j.items;
  ok(pend0.every((x) => x.type === "shop"), "pending (alt, ohne ?types) liefert nur type=shop", JSON.stringify(pend0.map((x) => x.type)));
  const BB = (body, o = {}) => req("/api/mc-shop-order", { method: "POST", body: { type: "bank_buy", ...body }, cookie: c9, origin: O, ip: "10.0.0.33", ...o });
  ok((await BB({ item: "diamond", amount: 1 }, { cookie: undefined })).s === 401, "bank_buy ohne Login → 401");
  ok((await BB({ item: "diamond", amount: 1 }, { origin: "https://evil.example" })).s === 403, "bank_buy fremde Origin → 403");
  ok((await BB({ item: "diamond", amount: 0 })).s === 400, "bank_buy Menge 0 → 400");
  ok((await BB({ item: "diamond", amount: 2305 })).s === 400, "bank_buy Menge 2305 → 400");
  ok((await BB({ item: "diamond", amount: 1.5 })).s === 400, "bank_buy Menge 1,5 → 400");
  ok((await BB({ item: "DIA MOND", amount: 1 })).s === 400, "bank_buy ungültiges Item → 400");
  ok((await BB({ item: "unobtainium", amount: 1 })).s === 404, "bank_buy unbekanntes Item → 404");
  ok((await BB({ item: "elytra", amount: 1 })).s === 409, "bank_buy gesperrtes Item → 409");
  ok((await BB({ item: "diamond", amount: 1, mc_uuid: U1 })).s === 403, "bank_buy fremde mc_uuid → 403");
  ok((await req("/api/mc-shop-order", { method: "POST", body: { type: "kaputt", item: "diamond", qty: 1 }, cookie: c9, origin: O, ip: "10.0.0.33" })).s === 400, "unbekannter type → 400");
  const RID1 = "web-" + "a".repeat(20);
  r = await BB({ item: "diamond", amount: 3, mc_uuid: U9, request_id: RID1 }); ok(r.s === 202 && r.j.request_id === RID1 && r.j.unit_price === 1100 && r.j.total === 3300 && r.j.type === "bank_buy", "bank_buy Website → 202, Preis aus Markt (11 CP = 1100 Cent)", r.t);
  r = await BB({ item: "diamond", amount: 3, request_id: RID1 }); ok(r.s === 200 && r.j.duplicate === true, "gleiche request_id → idempotent 200, keine zweite Zeile", r.t);
  ok((await BB({ item: "diamond", amount: 4, request_id: RID1 })).s === 409, "gleiche request_id, andere Menge → 409");
  ok((await BB({ item: "diamond", amount: 1, request_id: "x" })).s === 400, "zu kurze request_id → 400");
  ok(sqlRows(`SELECT COUNT(*) AS n FROM mc_shop_orders_pending WHERE id='${RID1}'`)[0].n === 1, "genau 1 Zeile für request_id");
  const RID2 = "bot-" + "b".repeat(20);
  r = await req("/api/mc-shop-order", { method: "POST", token: TOK, body: { type: "bank_buy", item: "diamond", amount: 2, mc_uuid: U9, request_id: RID2, discord_id: D9 } }); ok(r.s === 202 && r.j.request_id === RID2, "bank_buy Bot (Ingest-Token + discord_id) → 202", r.t);
  ok((await req("/api/mc-shop-order", { method: "POST", token: TOK, body: { type: "bank_buy", item: "diamond", amount: 2, mc_uuid: U1, request_id: "bot-" + "c".repeat(20), discord_id: D9 } })).s === 403, "Bot: mc_uuid passt nicht zu discord_id → 403");
  ok((await req("/api/mc-shop-order", { method: "POST", token: "falsch", body: { type: "bank_buy", item: "diamond", amount: 2, discord_id: D9 } })).s === 401, "Bot falscher Token → 401");
  const rowB = sqlRows(`SELECT shop_id, listing_id, type, buyer_uuid, source FROM mc_shop_orders_pending WHERE id='${RID2}'`)[0];
  ok(rowB.shop_id === null && rowB.listing_id === null && rowB.type === "bank_buy" && rowB.buyer_uuid === U9 && rowB.source === "discord", "DB: shop_id/listing_id NULL, type bank_buy, UUID aus mc_links", JSON.stringify(rowB));
  ok(!(await req("/api/mc-shop-orders/pending", { token: TOK })).j.items.some((x) => x.type === "bank_buy"), "pending ohne ?types: bank_buy unsichtbar für alte Konsumenten");
  const pbb = (await req("/api/mc-shop-orders/pending?types=shop,bank_buy", { token: TOK })).j.items.filter((x) => x.type === "bank_buy");
  ok(pbb.length === 2 && pbb[0].amount === 3 && pbb[0].mc_uuid === U9 && pbb[0].request_id === RID1 && pbb[0].item === "diamond", "pending ?types=shop,bank_buy liefert bank_buy {item, amount, mc_uuid, request_id, type}", JSON.stringify(pbb[0]));
  ok((await req("/api/mc-shop-orders/ack", { method: "POST", token: TOK, body: { acks: [{ id: RID1, status: "collected" }, { id: RID2, status: "rejected", reason: "LIMIT" }] } })).j.updated === 2, "ack bank_buy über dieselbe Ack-Route");
  let bo = (await req("/api/mc-bestellungen", { cookie: c9 })).j;
  ok(bo.can === true && bo.orders.length === 2 && bo.orders.every((o) => o.type === "bank_buy" && o.hideable), "Bestellungen: zusammengelegte Liste mit type + hideable", JSON.stringify(bo).slice(0, 300));
  ok(Array.isArray((await req("/api/mc-abholungen", { cookie: c9 })).j.pickup), "alte Route /api/mc-abholungen liefert weiter pickup");
  ok((await req("/api/mc-orders/hide", { method: "POST", body: { id: RID1 }, cookie: c9 })).s === 403, "Ausblenden ohne Origin → 403");
  ok((await req("/api/mc-orders/hide", { method: "POST", body: { id: RID1 }, origin: O })).s === 401, "Ausblenden ohne Login → 401");
  ok((await req("/api/mc-orders/hide", { method: "POST", body: { id: RID1 }, cookie: c1, origin: O })).j.hidden === 0, "fremde Bestellung ausblenden → 0");
  const openD1 = sqlRows(`SELECT id FROM mc_shop_orders_pending WHERE discord_id='${D1}' AND status='pending' LIMIT 1`)[0];
  if (openD1) ok((await req("/api/mc-orders/hide", { method: "POST", body: { id: openD1.id }, cookie: c1, origin: O })).j.hidden === 0, "offene Bestellung nicht ausblendbar");
  ok((await req("/api/mc-orders/hide", { method: "POST", body: { ids: [RID1, RID2] }, cookie: c9, origin: O })).j.hidden === 2, "erledigt + abgelehnt ausblenden → 2");
  bo = (await req("/api/mc-bestellungen", { cookie: c9 })).j; ok(bo.orders.length === 0, "ausgeblendete fehlen in der Liste");
  ok(sqlRows(`SELECT COUNT(*) AS n FROM mc_shop_orders_pending WHERE id IN ('${RID1}','${RID2}')`)[0].n === 2, "nichts gelöscht (Soft-Hide)");
  console.log("9b) Icons (1.21.11)");
  { const r = await fetch(BASE + "/mc-icon/v2/cinnabar", { headers: { host: HOST } }); ok(r.status === 200 && /image\/png/.test(r.headers.get("content-type") || ""), "Icon v2/cinnabar: 200 image/png (selbst gehostet)"); }
  ok((await fetch(BASE + "/mc-icon/v2/%E0%A4%A", { headers: { host: HOST }, redirect: "manual" })).status === 404, "Icon: kaputtes %-Encoding → 404 statt 500");

  const IC = async (id) => (await fetch(BASE + "/mc-icon/v2/" + id, { headers: { host: HOST }, redirect: "manual" })).headers.get("location") || "";
  ok(/@1\.21\.11\/.*item\/diamond_spear\.png$/.test(await IC("diamond_spear")), "diamond_spear → echte Speer-Textur (kein Dreizack)");
  ok(/item\/acacia_hanging_sign\.png$/.test(await IC("acacia_hanging_sign")), "acacia_hanging_sign → eigene Textur");
  ok(/item\/creeper_spawn_egg\.png$/.test(await IC("creeper_spawn_egg")), "Spawn-Ei → eigenes Ei");
  { const w = 64, h = 32, d = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) d.set([0, 0, 0, 255], i * 4); for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) d.set([200, 150, 100, 255], (y * w + x) * 4);
    ok(faceRgba({ w, h, data: d }, 8)[0] === 200, "Legacy-Skin 64x32: deckende Hut-Fläche wird ignoriert (Notch-Hack)");
  { // Skins: Mojang 502 einmal → Retry; mc-heads-Ersatz nur kurz cachen (Joni81/Nani_San123 bekamen 6 h Steve)
    const px = async (v) => encodePng(64, 64, new Uint8Array(64 * 64 * 4).fill(v)), REAL = await px(200), MH = await px(50);
    const TX = "https://textures.minecraft.net/texture/abc123", tex = btoa(JSON.stringify({ textures: { SKIN: { url: TX.replace("https", "http"), metadata: { model: "slim" } } } }));
    const mk = (fail) => { const n = {}; return [n, async (u) => { n[u] = (n[u] || 0) + 1; const J = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
      if (/lookup\/name|users\/profiles/.test(u)) return n[u] <= fail ? new Response("bad gateway", { status: 502 }) : J({ id: "5629bc24db844c65b73d40b038fa5906", name: "Nani_San123" });
      if (/sessionserver/.test(u)) return J({ properties: [{ name: "textures", value: tex }] });
      if (u === TX) return new Response(REAL); if (/mc-heads\.net/.test(u)) return new Response(MH); return new Response(null, { status: 404 }); }]; };
    const rq = new Request("https://mc.nwebnotfound.dev/mc-skin/Nani_San123");
    let [n, f] = mk(1); let r = await skinResponse(rq, "/mc-skin/Nani_San123", null, null, f); let b = new Uint8Array(await r.arrayBuffer());
    ok(r.status === 200 && b.length === REAL.length && b.every((x, k) => x === REAL[k]) && /max-age=21600/.test(r.headers.get("cache-control")) && !Object.keys(n).some((u) => /mc-heads/.test(u)), "Skin: Mojang-502 → Retry → echter Mojang-Skin (6 h)");
    [n, f] = mk(9); r = await skinResponse(rq, "/mc-skin/Nani_San123", null, null, f); b = new Uint8Array(await r.arrayBuffer());
    ok(r.status === 200 && b.every((x, k) => x === MH[k]) && /max-age=600/.test(r.headers.get("cache-control")), "Skin: Mojang down → mc-heads-Ersatz nur 10 min gecacht");
    [n, f] = mk(9); const h = await renderHead("Joni81", 64, f); ok(h && h.fallback === true, "Kopf: mc-heads-Ersatz gilt als Fallback (kurzer Cache)");
    [n, f] = mk(0); const h2 = await renderHead("Joni81", 64, f); ok(h2 && h2.fallback === false, "Kopf: Mojang-Skin → langer Cache"); }
  { // Quellen-Reihenfolge: ingest skin_url > Mojang per UUID > minotar (nur wenn Mojang nichts) > mc-heads > Steve
    const px = async (v) => encodePng(64, 64, new Uint8Array(64 * 64 * 4).fill(v)), ING = await px(10), MJ = await px(20), MT = await px(30), MH = await px(40), DEF = await px(60);
    const UID = "5629bc24-db84-4c65-b73d-40b038fa5906", U = UID.replace(/-/g, ""), ITX = "https://textures.minecraft.net/texture/feedbeef00112233", MTX = "https://textures.minecraft.net/texture/abc123abc123abc1";
    const tex = btoa(JSON.stringify({ textures: { SKIN: { url: MTX } } }));
    const db = (stats, links = {}) => ({ prepare: () => ({ bind: (...a) => ({ first: async () => (a.includes("nani_san123") || a.includes(U) ? { mc_name: "Nani_San123", mc_uuid: UID, stats: stats == null ? null : JSON.stringify(stats), ...links } : null) }) }) });
    const up = (o = {}) => { const n = []; return [n, async (u) => { n.push(u); const J = (x) => new Response(JSON.stringify(x));
      if (u === ITX) return new Response(ING); if (/lookup\/name|users\/profiles/.test(u)) return J({ id: U });
      if (/sessionserver/.test(u)) return o.mj === "down" ? new Response("", { status: 502 }) : o.mj === "none" ? new Response(null, { status: 204 }) : J({ properties: [{ name: "textures", value: tex }] });
      if (u === MTX) return o.mtx404 ? new Response("", { status: 404 }) : new Response(MJ); if (/minotar\.net/.test(u)) return new Response(o.mt || MT); if (/mc-heads\.net\/skin\/MHF_Steve/.test(u)) return new Response(DEF); if (/mc-heads/.test(u)) return o.mh === false ? new Response("", { status: 404 }) : new Response(MH); return new Response("", { status: 404 }); }]; };
    const same = (x, y) => x && x.b && new Uint8Array(x.b).length === y.length && new Uint8Array(x.b).every((v, i) => v === y[i]);
    RETRY_MS.v = 0;
    let [n, f] = up(); let k = await resolveSkin("Nani_San123", { DB: db({ skin_url: ITX }) }, f);
    ok(same(k, ING) && k.real && k.src === "ingest" && !n.some((u) => /mojang|minotar|mc-heads/.test(u)), "Skin a) skin_url aus Ingest → echt, ohne Mojang", n);
    [n, f] = up(); k = await resolveSkin("Nani_San123", { DB: db({ skin_url: "https://evil.example/texture/abc" }, { skin_url: "http://textures.minecraft.net/texture/zz" }) }, f);
    ok(same(k, MJ) && k.src === "mojang" && !validSkinUrl("https://textures.minecraft.net.evil/texture/aa") && validSkinUrl("http://textures.minecraft.net/texture/abcdef0123456789") === "https://textures.minecraft.net/texture/abcdef0123456789", "Skin: ungültige skin_url ignoriert, nur textures.minecraft.net");
    [n, f] = up(); k = await resolveSkin("Nani_San123", { DB: db(null) }, f);
    ok(same(k, MJ) && k.real && n.some((u) => u.endsWith("/profile/" + U)) && !n.some((u) => /lookup\/name|users\/profiles|minotar/.test(u)), "Skin b) Mojang per UUID aus mc_links, kein Name-Lookup, kein minotar", n);
    [n, f] = up({ mj: "down" }); k = await resolveSkin("Nani_San123", { DB: db(null) }, f);
    ok(same(k, MT) && k.real && k.src === "minotar" && n.some((u) => u === "https://minotar.net/skin/" + U), "Skin c) Mojang 502 → minotar per UUID, echt", n);
    [n, f] = up({ mtx404: true }); k = await resolveSkin("Nani_San123", { DB: db(null) }, f);
    ok(same(k, MT) && k.real && k.src === "minotar" && n.includes(MTX) && n.some((u) => u === "https://minotar.net/skin/" + U), "Skin c) Mojang-Textur-URL 404 → minotar trotzdem probiert, echt", n);
    { const H = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new Uint8Array(64 * 64 * 4).fill(30)))].map((x) => x.toString(16).padStart(2, "0")).join(""); DEFAULT_SKINS.add(H);
      [n, f] = up({ mj: "none" }); k = await resolveSkin("Nani_San123", { DB: db(null) }, f); DEFAULT_SKINS.delete(H);
      ok(same(k, MH) && !k.real && k.src === "mc-heads", "Skin c) minotar-Default-Skin zählt nicht als echt → mc-heads-Fallback"); }
    { // Ingest → D1 → Resolver: lange skin_url (>40 Zeichen) wird vollständig gespeichert und als Quelle a) genutzt
      const IU = "0f0f0f0f-1111-4222-8333-444444444444", LTX = "https://textures.minecraft.net/texture/" + "ab".repeat(32), BAD = "https://evil.example/texture/" + "cd".repeat(20);
      const r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { players_stats: { [IU]: { skin_url: LTX, kills: 1 }, "0f0f0f0f-1111-4222-8333-555555555555": { skin_url: BAD } } } });
      const st = JSON.parse(sqlRows(`SELECT stats FROM mc_player_stats WHERE mc_uuid='${IU}'`)[0]?.stats || "{}"), st2 = JSON.parse(sqlRows("SELECT stats FROM mc_player_stats WHERE mc_uuid='0f0f0f0f-1111-4222-8333-555555555555'")[0]?.stats || "{}");
      ok(r.s === 200 && st.skin_url === LTX && st2.skin_url === undefined, "Ingest: skin_url vollständig gespeichert, ungültige verworfen", JSON.stringify([st, st2]));
      const idb = { prepare: () => ({ bind: () => ({ first: async () => ({ mc_name: "Ingest1", mc_uuid: IU, stats: JSON.stringify(st) }) }) }) };
      const nn = []; const kk = await resolveSkin("Ingest1", idb && { DB: idb }, async (u) => { nn.push(u); return u === LTX ? new Response(ING) : new Response("", { status: 404 }); });
      ok(same(kk, ING) && kk.src === "ingest" && kk.real && nn[0] === LTX, "Ingest→Resolver: gespeicherte skin_url ist Quelle a)", nn); }
    [n, f] = up({ mj: "down", mt: new Uint8Array([1, 2, 3]), mh: false }); k = await resolveSkin("Nani_San123", { DB: db(null) }, f);
    ok(same(k, DEF) && !k.real && k.src === "steve", "Skin e) alles kaputt → Steve, kein echter Skin");
    [n, f] = up({ mj: "down", mt: new Uint8Array([1]) }); let r = await skinResponse(new Request("https://mc.nwebnotfound.dev/mc-skin/Nani_San123"), "/mc-skin/Nani_San123", null, { DB: db(null) }, f);
    ok(r.headers.get("cache-control") === "public, max-age=600" && r.headers.get("x-skin-source") === "mc-heads", "Skin d) mc-heads-Fallback → max-age=600");
    [n, f] = up(); r = await skinResponse(new Request("https://mc.nwebnotfound.dev/mc-skin/Nani_San123"), "/mc-skin/Nani_San123", null, { DB: db({ skin_url: ITX }) }, f);
    ok(r.headers.get("cache-control") === "public, max-age=21600" && r.headers.get("x-skin-source") === "ingest", "Skin a) echt → max-age=21600");
    [n, f] = up(); k = await resolveSkin("Joni81", { DB: { prepare: () => { throw new Error("no such column: skin_url"); } } }, f);
    ok(same(k, MJ) && k.src === "mojang", "Skin: D1-Fehler/fehlende Spalte wird toleriert (Name-Lookup)");
    [n, f] = up(); const hd = await renderHead("Nani_San123", 64, f, { DB: db({ skin_url: ITX }) }); ok(hd && !hd.fallback && hd.src === "ingest", "Kopf nutzt dieselbe Quellen-Reihenfolge");
    RETRY_MS.v = 250; }
  { // Retry begrenzt: 5xx → genau 2 Calls mit Backoff, 429+Retry-After → 1 Call (Mojang und mc-heads)
    for (const u of ["https://api.mojang.com/users/profiles/minecraft/x", "https://mc-heads.net/skin/x"]) {
      let c = 0; const t0 = Date.now(); let r = await fetchRetry(async () => { c++; return new Response("", { status: 503 }); }, u);
      ok(c === 2 && r.status === 503 && Date.now() - t0 >= 200, "Retry " + new URL(u).host + ": 5xx → 2 Calls mit Backoff");
      c = 0; r = await fetchRetry(async () => { c++; return new Response("", { status: 429, headers: { "retry-after": "30" } }); }, u);
      ok(c === 1 && r.status === 429, "Retry " + new URL(u).host + ": 429 + Retry-After → 1 Call"); }
    const per = {}; let c = 0; RETRY_MS.v = 0; await skinResponse(new Request("https://mc.nwebnotfound.dev/mc-skin/Joni81"), "/mc-skin/Joni81", null, null, async (u) => { c++; per[u] = (per[u] || 0) + 1; return new Response("", { status: 500 }); }); RETRY_MS.v = 250;
    ok(Object.values(per).every((x) => x === 2), "Skin: alle Upstreams 5xx → höchstens 2 Calls pro URL (" + c + ")"); }
  { const P = (f) => fs.readFileSync(ROOT + f, "utf8"); // Client-URLs versioniert, damit Browser-Caches mit altem Steve-Ersatz umgangen werden
    ok(P("public/mc/player3d.js").includes("+'?v=3'") && !/\/mc-head\/[^"'\n]{0,60}'\/'\+\(head\|\|64\)\+'"/.test(P("public/mc/player3d.js")) && ["src/mc-players.js", "src/mc-parkour.js", "public/mc/home.js", "public/mc/shops.js", "public/mc/shop.js", "public/mc/auction.js"].every((f) => P(f).includes("?v=5")), "Skin/Kopf-URLs im Client versioniert (?v=3 / ?v=5)"); }
    ok(skinOk({ w: 64, h: 64 }) && skinOk({ w: 64, h: 32 }) && skinOk({ w: 256, h: 256 }) && !skinOk({ w: 100, h: 100 }) && !skinOk({ w: 64, h: 48 }), "Skin-Formate inkl. HD erkannt"); }
  ok(/mc-heads\.net\/head\/MHF_Zombie/.test(await IC("zombie_head")) && /MHF_WSkeleton/.test(await IC("wither_skeleton_skull")) && /MHF_Creeper/.test(await IC("creeper_wall_head")), "Mob-Köpfe → Kopf statt Block/Papier");
  const iau = JSON.parse(execSync("node scripts/icon-audit.mjs --json", { cwd: ROOT }).toString());
  ok(iau.placeholder.length === 0 && iau.approx.length === 0, "icon-audit: 0 Platzhalter, 0 falsche Icons", JSON.stringify({ p: iau.placeholder, a: iau.approx }).slice(0, 300));
  console.log("9c) Navigation, Theme, Seiten");
  const home = (await req("/")).t; ok(!/<nav class="nl"[^]*?href="\/profile">Profil<\/a>[^]*?<\/nav>/.test(home), "kein doppelter Profil-Tab in der Nav");
  ok(home.includes('/bestellungen">Bestellungen</a>'), "Dropdown verlinkt zusammengelegte Bestellungen");
  for (const p of ["/bestellungen", "/abholungen"]) { const x = await req(p); ok(x.s === 200 && x.t.includes("/mc/orders.js"), p + " → 200, gemeinsame Liste"); }
  ok((await req("/markt/diamond")).t.includes('id="bbuy"'), "Item-Seite hat Bank-Kauf");
  const css = fs.readFileSync(ROOT + "public/mc/ds.css", "utf8");
  ok(/--hl-bg:/.test(css) && /--hl-ring:/.test(css), "ds.css: gemeinsames Hover-Token");
  ok(!/\.menu[^{]*\{[^}]*#(120d1f|2d1d5a)/.test(css.slice(css.indexOf("Profil-Dropdown im MC-Theme"))), "Dropdown ohne Lila");
  console.log("6c) Todesursachen");
  {
    const U3 = "33333333-4444-4555-8666-777777777777";
    const r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { v_player_stats_ext: [{ uuid: U3, name: "Tod1", deaths: 3, deaths_by: { fall: 1, "minecraft:player": 1, some_unknown_cause: 1, ENTITY_EXPLOSION: 2, "bad key!": 5 } }] } });
    const row = sqlRows(`SELECT details FROM mc_player_stats WHERE mc_uuid='${U3}'`)[0], db = row && JSON.parse(row.details || "{}").deaths_by;
    ok(r.s === 200 && db && db.fall === 1 && db.player === 1 && db.some_unknown_cause === 1 && db.entity_explosion === 2 && !("bad key!" in db), "deaths_by: unbekannte/DamageCause-Keys gespeichert, nur ungültige verworfen", row && row.details);
  }
  {
    const U4 = "44444444-4444-4555-8666-777777777777";
    const r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { v_player_stats_ext: [{ uuid: U4, name: "Tod2", deaths: 4, deaths_entity: { "minecraft:zombie": 2 }, deaths_by: { fall: 1, zombie: 1 } }] } });
    const row = sqlRows(`SELECT details FROM mc_player_stats WHERE mc_uuid='${U4}'`)[0], d = row && JSON.parse(row.details || "{}");
    ok(r.s === 200 && d && d.deaths_entity && d.deaths_entity.zombie === 2 && d.deaths_by && d.deaths_by.zombie === 1 && d.deaths_by.fall === 1, "deaths_entity und deaths_by bleiben getrennte Keys", row && row.details);
  }
  console.log("6d) Todesursachen zusammenfassen");
  {
    const dbIn = { explosion: 1, block_explosion: 2, entity_explosion: 3, fire: 4, fire_tick: 1, fall: 2 };
    for (const [path, mapName, lab] of [["/spieler/Nils", "MN", "k=>MN[k]||k"], ["/profile", "DB", "k=>DB[k]||k"]]) {
      const h = (await req(path, { cookie: c1 })).t || "";
      const mg = (h.match(/const MG=\(o,L\)=>\{.*?return r\};/) || [])[0], mp = (h.match(new RegExp("const " + mapName + "=\\{[^}]*\\};")) || [])[0];
      let out = null; try { out = new Function(mp + mg + "return MG(" + JSON.stringify(dbIn) + "," + lab + ")")(); } catch (e) { out = String(e); }
      ok(out && out.explosion === 6 && out.fire === 5 && out.fall === 2 && Object.keys(out).length === 3, "deaths_by gleiche Namen zusammengefasst (" + path + ")", JSON.stringify(out) + " mg=" + !!mg + " map=" + !!mp);
    }
  }
  console.log("6b) Parkour");
  {
    const PU = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ing = (parkour) => req("/api/mc-ingest", { method: "POST", token: TOK, body: { parkour } });
    const e0 = (o = {}) => ({ course: "test", mc_uuid: PU(1), mc_name: "Nils", time_ms: 42123, set_at: "2026-10-30T11:00:00.000Z", ...o });
    ok((await req("/api/mc-ingest", { method: "POST", body: { parkour: [e0()] } })).s === 401, "Parkour-Ingest ohne Token → 401");
    let r = await ing([e0(), e0({ course: "tést" }), e0({ course: "a/b" }), e0({ course: "x".repeat(33) }), e0({ time_ms: 0 }), e0({ time_ms: -5 }), e0({ time_ms: 1.5 }), e0({ time_ms: "100" }), e0({ time_ms: 86400001 }), e0({ mc_uuid: "kaputt" }), e0({ mc_name: "<b>x</b>" }), e0({ set_at: "gestern" }), e0({ set_at: "2099-01-01T00:00:00Z" })]);
    ok(r.s === 200 && r.j.parkour === 1 && r.j.parkour_rejected === 12, "Validierung: 1 gültig, 12 abgelehnt", r.t);
    ok(sqlRows("SELECT COUNT(*) n FROM mc_parkour")[0].n === 1, "Nur gültiger Eintrag gespeichert");
    r = await ing([e0({ mc_uuid: PU(1).replace(/-/g, "").toUpperCase(), time_ms: 50000, set_at: "2026-10-30T12:00:00Z" })]);
    let row = sqlRows(`SELECT * FROM mc_parkour WHERE mc_uuid='${PU(1)}'`); ok(r.s === 200 && row.length === 1 && row[0].time_ms === 42123 && row[0].set_at === "2026-10-30T11:00:00.000Z", "Schlechtere Zeit überschreibt nicht (UUID normalisiert)", JSON.stringify(row));
    await ing([e0({ time_ms: 40000, set_at: "2026-10-30T12:30:00Z" })]); row = sqlRows(`SELECT * FROM mc_parkour WHERE mc_uuid='${PU(1)}'`); ok(row[0].time_ms === 40000 && row[0].set_at === "2026-10-30T12:30:00.000Z", "Bessere Zeit ersetzt", JSON.stringify(row));
    await ing([e0({ time_ms: 39000 }), e0({ time_ms: 45000 })]); ok(sqlRows(`SELECT time_ms FROM mc_parkour WHERE mc_uuid='${PU(1)}'`)[0].time_ms === 39000, "Duplikat im Payload: beste zählt");
    ok((await req("/api/mc-ingest", { method: "POST", token: TOK, body: { servers: {} } })).j.parkour === undefined && sqlRows("SELECT COUNT(*) n FROM mc_parkour")[0].n === 1, "Feld fehlt → keine Änderung");
    ok((await ing("kaputt")).j.parkour_rejected === 1, "parkour kein Array → abgelehnt, kein Fehler");
    const many = Array.from({ length: 12 }, (_, i) => e0({ mc_uuid: PU(10 + i), mc_name: "Spieler" + i, time_ms: 60000 + ((i * 7919) % 12) * 1000 + i }));
    many.push(e0({ course: "nether_run", mc_uuid: PU(2), mc_name: "Seller", time_ms: 61234, set_at: undefined }));
    r = await ing(many); ok(r.j.parkour === 13, "13 Einträge (Spieler ohne set_at ok)", r.t);
    const api = (await req("/api/mc-parkour")).j, L = api.courses.test;
    ok(L.length === 10 && L.every((x, i) => x.rank === i + 1 && (i === 0 || L[i - 1].time_ms <= x.time_ms)) && L[0].mc_name === "Nils" && L[0].time_ms === 39000, "Top 10 aufsteigend sortiert, max 10", JSON.stringify(L.map((x) => x.time_ms)));
    ok(api.courses.nether_run?.length === 1 && api.courses.nether_run[0].mc_uuid === PU(2), "Zweiter Kurs separat");
    const pg = await req("/parkour"); ok(pg.s === 200 && /ds\.css\?v=/.test(pg.t) && pg.t.includes('href="/parkour"'), "GET /parkour → 200, im MC-Nav");
    ok(api.course_names?.test === "Test" && L[0].course_name === "Test" && api.course_icons?.test === "paper" && L[0].course_icon === "paper", "Ohne course_name/icon → Fallback hübsche Kurs-ID + paper", JSON.stringify(api.course_names));
    r = await ing([e0({ course: "cave_rush", mc_uuid: PU(3), mc_name: "Cave", time_ms: 30000, course_name: "  Cave\u0000  Rush  " }), e0({ course: "kurs1", mc_uuid: PU(4), time_ms: 31000, course_name: "<img src=x onerror=alert(1)>" }), e0({ course: "lang", mc_uuid: PU(5), time_ms: 32000, course_name: "x".repeat(60) }), e0({ course: "leer", mc_uuid: PU(6), time_ms: 33000, course_name: "   " }), e0({ course: "zahl", mc_uuid: PU(7), time_ms: 34000, course_name: 5 })]);
    ok(r.j.parkour === 5 && r.j.parkour_rejected === 0 && r.j.parkour_course_names === 3, "course_name optional, ungültig → Zeit zählt trotzdem", r.t);
    let cn = Object.fromEntries(sqlRows("SELECT course, course_name FROM mc_parkour_courses").map((x) => [x.course, x.course_name]));
    ok(cn.cave_rush === "Cave Rush" && cn.lang === "x".repeat(48) && !("leer" in cn) && !("zahl" in cn), "course_name getrimmt, Steuerzeichen raus, max 48", JSON.stringify(cn));
    await ing([e0({ course: "cave_rush", mc_uuid: PU(3), time_ms: 35000, course_name: "Cave Rush II" })]);
    let a2 = (await req("/api/mc-parkour")).j;
    ok(a2.course_names.cave_rush === "Cave Rush II" && a2.courses.cave_rush[0].course_name === "Cave Rush II" && a2.courses.cave_rush[0].time_ms === 30000 && a2.course_names.kurs1 === "<img src=x onerror=alert(1)>" && a2.course_names.leer === "Leer", "API: course_name aktualisierbar, Fallback hübsche ID, Rohtext (Escape erst beim Rendern)", JSON.stringify(a2.course_names));
    r = await ing([e0({ course: "Cave Rush", mc_uuid: PU(8), time_ms: 29000 }), e0({ course: " cave-rush ", mc_uuid: PU(9), time_ms: 28000 }), e0({ course: "CAVE_RUSH", mc_uuid: PU(8), time_ms: 27000 })]);
    a2 = (await req("/api/mc-parkour")).j;
    ok(r.j.parkour === 2 && Object.keys(a2.courses).filter((k) => k.includes("cave")).join() === "cave_rush" && a2.courses.cave_rush[0].time_ms === 27000 && a2.courses.cave_rush.length === 3, "Kurs-ID normalisiert: 'Cave Rush'/'cave-rush'/'CAVE_RUSH' → cave_rush", JSON.stringify(Object.keys(a2.courses)));
    r = await ing([e0({ course: "cave  rush", mc_uuid: PU(30), time_ms: 50000 }), e0({ course: "_cave_rush_", mc_uuid: PU(31), time_ms: 51000 })]);
    a2 = (await req("/api/mc-parkour")).j;
    ok(r.j.parkour === 2 && r.j.parkour_rejected === 0 && Object.keys(a2.courses).filter((k) => k.includes("cave")).join() === "cave_rush" && a2.courses.cave_rush.length === 5, "'cave  rush' und '_cave_rush_' → cave_rush", JSON.stringify(Object.keys(a2.courses)));
    ok(a2.courses.kurs1?.length === 1 && a2.courses.test.length === 10, "Alte IDs (kurs1, test) funktionieren weiter");
    // course_icon
    r = await ing([e0({ course: "icon_ok", mc_uuid: PU(40), time_ms: 60000, course_icon: "golden_boots" }), e0({ course: "icon_mc", mc_uuid: PU(41), time_ms: 60000, course_icon: " minecraft:GOLDEN_BOOTS " }), e0({ course: "icon_bad", mc_uuid: PU(42), time_ms: 60000, course_icon: "bad icon!" }), e0({ course: "icon_none", mc_uuid: PU(43), time_ms: 60000 })]);
    let ic = Object.fromEntries(sqlRows("SELECT course, course_icon, course_name FROM mc_parkour_courses WHERE course LIKE 'icon_%'").map((x) => [x.course, x]));
    ok(r.j.parkour === 4 && r.j.parkour_rejected === 0, "course_icon optional, Zeiten zählen", r.t);
    ok(ic.icon_ok?.course_icon === "golden_boots", "course_icon gültig gespeichert", JSON.stringify(ic));
    ok(ic.icon_mc?.course_icon === "golden_boots", "minecraft:GOLDEN_BOOTS → golden_boots", JSON.stringify(ic));
    ok(ic.icon_bad?.course_icon == null, "Ungültiges Icon 'bad icon!' bei neuem Kurs → nichts gespeichert (Anzeige paper)", JSON.stringify(ic));
    ok(!("icon_none" in ic), "Ohne Icon/Name → kein Kurs-Eintrag", JSON.stringify(ic));
    a2 = (await req("/api/mc-parkour")).j;
    ok(a2.course_icons.icon_ok === "golden_boots" && a2.course_icons.icon_bad === "paper" && a2.course_icons.icon_none === "paper" && a2.courses.icon_mc[0].course_icon === "golden_boots" && a2.course_names.icon_ok === "Icon Ok" && !Object.values(a2.course_names).some((n) => n.includes("_")), "API: course_icons + Fallback-Namen ohne Unterstrich", JSON.stringify(a2.course_names));
    await ing([e0({ course: "icon_ok", mc_uuid: PU(40), time_ms: 59000, course_name: "Icon Kurs" })]);
    ic = sqlRows("SELECT course_icon, course_name FROM mc_parkour_courses WHERE course='icon_ok'")[0];
    ok(ic.course_icon === "golden_boots" && ic.course_name === "Icon Kurs", "Nur Name gesendet → Icon bleibt", JSON.stringify(ic));
    r = await ing([e0({ course: "icon_ok", mc_uuid: PU(40), time_ms: 59000, course_icon: "bad icon!" })]);
    ic = sqlRows("SELECT course_icon FROM mc_parkour_courses WHERE course='icon_ok'")[0];
    ok(r.j?.parkour === 1 && ic.course_icon === "golden_boots", "Ungültiges Icon 'bad icon!' → gespeichertes golden_boots bleibt", JSON.stringify(ic) + r.t);
    await ing([e0({ course: "cave_rush", mc_uuid: PU(3), time_ms: 35000, course_icon: "feather" })]);
    ok((await req("/api/mc-parkour")).j.course_names.cave_rush === "Cave Rush II", "Nur Icon gesendet → Name bleibt");
    { const q = await req("/parkour?course=cave_rush"); ok(q.s === 200 && q.t.includes("/api/mc-parkour") && !q.t.includes("onerror=alert"), "GET /parkour?course=… → 200, Name nicht im Server-HTML"); }
    { const m = await req("/parkour", { testHost: "nwebnotfound.dev" }); ok(!(m.s === 200 && m.t.includes("/api/mc-parkour")), "/parkour nur auf mc-Domain", m.s); }
  }
  console.log("7) Seiten");
  for (const p of ["/", "/markt", "/markt/diamond", "/markt/elytra", "/markt/copper_ingot", "/shops", "/shops/s1", "/auktionen", "/auktionen/a1", "/leaderboards", "/spieler", "/spieler/Nils", "/profile", "/wiki", "/wiki/befehle", "/parkour", "/vip"]) { const x = await req(p); ok(x.s === 200 && /ds\.css\?v=/.test(x.t), "GET " + p + " → 200", x.s); }
  ok((await req("/bestenlisten")).s === 301, "/bestenlisten → 301 /leaderboards");
  ok((await req("/markt")).t.includes('autocomplete="off"'), "Suchfeld ohne Autofill");
  console.log("8) UI (Chromium 390/1440)");
  { // Live-Ticks: erster Ingest legt je Item einen Tick an; gleicher Preis → kein neuer; Preisänderung → neuer Tick
    const t0 = (await req("/api/mc-market/diamond")).j; ok(Array.isArray(t0.ticks) && t0.ticks.length >= 1, "Item-API: Live-Ticks vorhanden", JSON.stringify(t0.ticks));
    const cur = t0.item; await new Promise((r) => setTimeout(r, 1100));
    const all = (await req("/api/mc-market")).j.items; const mk = (bp) => ({ market: all.map((x) => ({ item: x.item, buy_price: x.item === "diamond" ? bp : (x.buy_locked ? 0 : x.buy_price), sell_price: x.sell_locked ? 0 : x.sell_price, base_price: x.base_price, volume_24h_qty: x.volume_24h_qty, volume_24h_cp: x.volume_24h_cp, trades_24h: x.trades_24h, change_24h_pct: x.change_24h_pct })) });
    await req("/api/mc-ingest", { method: "POST", body: mk(cur.buy_price), token: TOK });
    ok(sqlRows("SELECT COUNT(*) AS n FROM mc_price_ticks WHERE item='diamond'")[0]?.n === t0.ticks.length, "unveränderter Preis → kein neuer Tick");
    await req("/api/mc-ingest", { method: "POST", body: mk(cur.buy_price + 1), token: TOK });
    const t1 = (await req("/api/mc-market/diamond")).j; ok(t1.ticks.length === t0.ticks.length + 1 && t1.ticks.at(-1)[1] === cur.buy_price + 1 && t1.item.buy_price === cur.buy_price + 1, "Preisänderung → neuer Tick + Live-Preis", JSON.stringify(t1.ticks));
    const ch = (await req("/api/mc-market/diamond")); ok(/max-age=5\b/.test(ch.h?.get?.("cache-control") || "max-age=5"), "Item-API Cache 5 s");
    const mob = async (k) => (await fetch(BASE + "/mc-mob/" + k, { headers: { host: HOST }, redirect: "manual" })).headers.get("location") || "";
    ok((await mob("creeper")) === "/mc/heads/creeper.png" && (await mob("minecraft:zombie")) === "/mc/heads/zombie.png", "Mob-Icon: Creeper/Zombie → eigener Kopf");
    ok((await mob("phantom")) === "/mc-icon/v2/phantom_spawn_egg" && (await mob("fall")) === "/mc-icon/v2/feather" && (await mob("..%2Fx")) === "/mc-icon/v2/bone", "Mob-Icon: Spawn-Ei / Ursache / ungültig → Fallback");
    const hp = await fetch(BASE + "/mc/heads/creeper.png", { headers: { host: HOST } }); ok(hp.status === 200 && /image\/png/.test(hp.headers.get("content-type") || ""), "Kopf-PNG selbst gehostet");
  }
  { const r = await fetch(BASE + "/", { headers: { host: HOST } }); const c = r.headers.get("content-security-policy-report-only") || ""; ok(/challenges\.cloudflare\.com/.test(c) && /mc-heads\.net/.test(c) && /cdn\.discordapp\.com/.test(c) && !r.headers.get("content-security-policy"), "CSP Report-Only gesetzt (nicht erzwingend)", c); }
  console.log("E) economy_daily");
  { const ED = (rows) => req("/api/mc-ingest", { method: "POST", token: TOK, body: { economy_daily: rows } });
    const e0 = await req("/api/mc-economy"); ok(e0.s === 200 && Array.isArray(e0.j?.days) && e0.j.days.length === 0, "Economy-API leer → days []", e0.t);
    ok((await req("/api/mc-ingest", { method: "POST", body: { economy_daily: [] } })).s === 401, "economy_daily ohne Token → 401");
    const bad = [
      ["kein Array", { day: "2026-10-01", money_supply_cp: 1 }],
      ["Datum falsch", [{ day: "2026-13-01", money_supply_cp: 1 }]],
      ["Datum 30.02.", [{ day: "2026-02-30", money_supply_cp: 1 }]],
      ["Datum-Format", [{ day: "2026-1-01", money_supply_cp: 1 }]],
      ["Supply Float", [{ day: "2026-10-01", money_supply_cp: 1.5 }]],
      ["Supply null", [{ day: "2026-10-01", money_supply_cp: null }]],
      ["Supply String", [{ day: "2026-10-01", money_supply_cp: "5" }]],
      ["minted String", [{ day: "2026-10-01", money_supply_cp: 1, minted_cp: "1" }]],
      ["net Float", [{ day: "2026-10-01", money_supply_cp: 1, net_cp: 0.5 }]],
      ["nicht aufsteigend", [{ day: "2026-10-02", money_supply_cp: 1 }, { day: "2026-10-01", money_supply_cp: 1 }]],
      ["doppelter Tag", [{ day: "2026-10-01", money_supply_cp: 1 }, { day: "2026-10-01", money_supply_cp: 2 }]],
      ["91 Zeilen", Array.from({ length: 91 }, (_, i) => ({ day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), money_supply_cp: i }))],
    ];
    for (const [m, rows] of bad) { const r = await ED(rows); ok(r.s === 400 && r.j?.error, "economy_daily " + m + " → 400", r.s + " " + r.t); }
    ok(sqlRows("SELECT COUNT(*) AS n FROM mc_economy_daily")[0].n === 0, "economy_daily: nach 400 nichts geschrieben");
    { const r = await ED([{ day: "2026-01-01", money_supply_cp: 5, foo: "x", extra: { a: 1 } }]); ok(r.s === 200 && r.j?.economy_daily === 1, "economy_daily unbekannte Felder ignoriert → 200", r.t);
      ok(JSON.stringify(sqlRows("SELECT * FROM mc_economy_daily WHERE day='2026-01-01'").map(({ updated_at, ...x }) => x)) === JSON.stringify([{ day: "2026-01-01", money_supply_cp: 5, minted_cp: null, burned_cp: null, net_cp: null }]), "economy_daily: nur bekannte Felder gespeichert");
      sql("DELETE FROM mc_economy_daily"); }
    const rows = Array.from({ length: 90 }, (_, i) => ({ day: new Date(Date.UTC(2026, 7, 3 + i)).toISOString().slice(0, 10), money_supply_cp: 100000 + Math.floor(i / 7) * 5000, minted_cp: null, burned_cp: null, net_cp: null }));
    const r1 = await ED(rows); ok(r1.s === 200 && r1.j?.economy_daily === 90, "economy_daily 90 Zeilen → 200", r1.t);
    const r2 = await ED([{ day: rows[89].day, money_supply_cp: 777777, minted_cp: 1200, burned_cp: 300, net_cp: -900 }]); ok(r2.s === 200 && r2.j?.economy_daily === 1, "economy_daily Upsert letzter Tag → 200", r2.t);
    ok(sqlRows("SELECT COUNT(*) AS n FROM mc_economy_daily")[0].n === 90, "economy_daily: Upsert ohne Duplikat");
    const e1 = await req("/api/mc-economy"), dd = e1.j?.days || [];
    ok(e1.s === 200 && dd.length === 90 && dd[0].day === rows[0].day && dd[89].day === rows[89].day, "Economy-API: 90 Tage, älteste zuerst", e1.t.slice(0, 200));
    ok(dd[89].money_supply_cp === 777777 && dd[89].net_cp === -900 && dd[0].minted_cp === null && dd[0].burned_cp === null && dd[0].net_cp === null, "Economy-API: Upsert-Werte und null erhalten");
    const pg = await req("/markt"); ok(pg.s === 200 && pg.t.includes('id="econ"') && pg.t.includes("/mc/economy.js") && pg.t.includes("/mc/economy.css"), "GET /markt bindet Economy-Block extern ein");
    const js = await req("/mc/economy.js"); ok(js.s === 200 && !/style=|\.style\./.test(js.t), "economy.js ohne Inline-Styles");
  }
  console.log("F) player_ranks");
  { const PR = (rows, extra = {}) => req("/api/mc-ingest", { method: "POST", token: TOK, body: { player_ranks: rows, ...extra } });
    const R1 = { uuid: U1, name: "Nils", rank: "admin", color: "&c", weight: 100 }, R2 = { uuid: U2.replace(/-/g, "").toUpperCase(), name: "Seller", rank: "vip", color: "&6", weight: 40 };
    ok((await req("/api/mc-ingest", { method: "POST", body: { player_ranks: [] } })).s === 401, "player_ranks ohne Token → 401");
    const bad = [["kein Array", { a: 1 }], ["Rang unbekannt", [{ ...R1, rank: "owner" }]], ["Farbe ungültig", [{ ...R1, color: "#ff0000" }]], ["Farbe Format-Code", [{ ...R1, color: "&l" }]], ["Weight kein Int", [{ ...R1, weight: 1.5 }]], ["Weight String", [{ ...R1, weight: "100" }]], ["UUID ungültig", [{ ...R1, uuid: "xyz" }]], ["Name ungültig", [{ ...R1, name: "<b>" }]], ["UUID doppelt", [R1, { ...R1, name: "Nils2" }]], ["kein Objekt", [5]]];
    for (const [m, rows] of bad) { const r = await PR(rows); ok(r.s === 200 && r.j?.player_ranks === 0 && r.j?.player_ranks_dropped === true, "player_ranks " + m + " → verworfen, 200", r.s + " " + r.t); }
    ok(sqlRows("SELECT COUNT(*) AS n FROM mc_player_ranks")[0].n === 0, "player_ranks: ungültig → nichts geschrieben");
    { const r = await PR([{ ...R1, rank: "owner" }], { economy_daily: [{ day: "2026-02-01", money_supply_cp: 42 }] });
      ok(r.s === 200 && r.j?.economy_daily === 1 && sqlRows("SELECT money_supply_cp AS m FROM mc_economy_daily WHERE day='2026-02-01'")[0]?.m === 42, "ungültige player_ranks: Rest (economy) wird trotzdem gespeichert", r.t);
      sql("DELETE FROM mc_economy_daily WHERE day='2026-02-01'"); }
    const r1 = await PR([R1, R2, { uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Gast", rank: "player", color: "&7", weight: 0, secret: "x" }]);
    ok(r1.s === 200 && r1.j?.player_ranks === 3, "player_ranks 3 Zeilen (inkl. unbekanntes Feld) → 200", r1.t);
    ok(sqlRows("SELECT rank FROM mc_player_ranks WHERE name='Gast'")[0]?.rank === "default", "player_ranks: player → default");
    ok(sqlRows("SELECT uuid FROM mc_player_ranks WHERE name='Seller'")[0]?.uuid === U2.replace(/-/g, ""), "player_ranks: UUID normalisiert");
    const r2 = await PR([{ ...R1 }, { ...R2, rank: "mvp", color: "&d", weight: 60 }]);
    ok(r2.s === 200 && sqlRows("SELECT COUNT(*) AS n FROM mc_player_ranks")[0].n === 2, "player_ranks Snapshot entfernt fehlende UUIDs", r2.t);
    ok(sqlRows("SELECT rank FROM mc_player_ranks WHERE name='Seller'")[0]?.rank === "mvp", "player_ranks Upsert ändert Rang");
    { const r = await PR([]); ok(r.s === 200 && sqlRows("SELECT COUNT(*) AS n FROM mc_player_ranks")[0].n === 2, "player_ranks [] ignoriert, nichts gelöscht", r.t); }
    { const r = await PR([{ ...R1, weight: "x" }]); ok(r.s === 200 && sqlRows("SELECT COUNT(*) AS n FROM mc_player_ranks")[0].n === 2, "ungültige player_ranks löschen nichts", r.t); }
    const L = (await req("/api/mc-players")).j?.players || [], n = L.find((x) => x.name === "Nils"), s = L.find((x) => x.name === "Seller");
    ok(n?.rank?.rank === "admin" && n.rank.color === "c" && s?.rank?.rank === "mvp" && s.rank.color === "d", "Spieler-API liefert Rang + Farbe", JSON.stringify(L).slice(0, 300));
    ok(!JSON.stringify(L).includes("weight"), "Spieler-API ohne weight/interne Felder");
    const one = await req("/api/mc-players/Seller"); ok(one.s === 200 && one.j?.rank?.rank === "mvp", "Spieler-Detail-API liefert Rang", one.t.slice(0, 200));
    await PR([{ ...R2, rank: "default", color: "&7", weight: 0 }]);
    ok((await req("/api/mc-players/Seller")).j?.rank === null && (await req("/api/mc-players/Nils")).j?.rank === null, "default/kein Eintrag → kein Badge");
    for (const pth of ["/spieler", "/spieler/Nils"]) { const pg = await req(pth); ok(pg.s === 200 && pg.t.includes("/mc/ranks.css") && pg.t.includes("rk rk-"), pth + " bindet Rang-Badges extern ein", String(pg.s)); }
    const css = await req("/mc/ranks.css"); ok(css.s === 200 && css.t.includes(".rk-c") && css.t.includes(".rk-a") && css.t.includes(".rk-d") && css.t.includes(".rk-6"), "ranks.css mit Rangfarben");
    sql("DELETE FROM mc_player_ranks"); }
  console.log("G) pvp_stats");
  { const PV = (rows, extra = {}) => req("/api/mc-ingest", { method: "POST", token: TOK, body: { pvp_stats: rows, ...extra } });
    const A = { uuid: U1, name: "Nils", wins: 10, losses: 2, draws: 1, matches: 13, winrate_pct: 77, favorite_kit: "<img src=x onerror=alert(1)>" };
    const B = { uuid: U2, name: "Seller", wins: 10, losses: 1, draws: 0, matches: 11, winrate_pct: 91, favorite_kit: null };
    const C = { uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Gast", wins: 1, losses: 0, draws: 0, matches: 1, winrate_pct: 100, extra: "x" };
    ok((await req("/api/mc-ingest", { method: "POST", body: { pvp_stats: [] } })).s === 401, "pvp_stats ohne Token → 401");
    { const r = await req("/api/mc-pvp"); ok(r.s === 200 && Array.isArray(r.j?.players) && r.j.players.length === 0, "PvP-API leer → []", r.t); }
    const bad = [["kein Array", { a: 1 }], ["wins negativ", [{ ...A, wins: -1 }]], ["matches kein Int", [{ ...A, matches: 1.5 }]], ["winrate > 100", [{ ...A, winrate_pct: 101 }]], ["winrate 100.1", [{ ...A, winrate_pct: 100.1 }]], ["winrate -1", [{ ...A, winrate_pct: -1 }]], ["winrate String", [{ ...A, winrate_pct: "50" }]], ["Kit zu lang", [{ ...A, favorite_kit: "x".repeat(33) }]], ["Kit Zahl", [{ ...A, favorite_kit: 5 }]], ["UUID doppelt", [A, { ...A, name: "X" }]], ["Name ungültig", [{ ...A, name: "a b" }]]];
    for (const [m, rows] of bad) { const r = await PV(rows); ok(r.s === 200 && r.j?.pvp_stats === 0 && r.j?.pvp_stats_dropped === true, "pvp_stats " + m + " → verworfen, 200", r.s + " " + r.t); }
    ok(sqlRows("SELECT COUNT(*) AS n FROM mc_pvp_stats")[0].n === 0, "pvp_stats: ungültig → nichts geschrieben");
    { const r = await PV([{ ...A, wins: -5 }], { economy_daily: [{ day: "2026-03-01", money_supply_cp: 7 }] }); ok(r.s === 200 && r.j?.economy_daily === 1, "ungültige pvp_stats: Rest wird gespeichert", r.t); sql("DELETE FROM mc_economy_daily WHERE day='2026-03-01'"); }
    const r1 = await PV([A, B, C]); ok(r1.s === 200 && r1.j?.pvp_stats === 3, "pvp_stats 3 Zeilen (unbekanntes Feld ignoriert) → 200", r1.t);
    { const r = await PV([]); ok(r.s === 200 && sqlRows("SELECT COUNT(*) AS n FROM mc_pvp_stats")[0].n === 3, "pvp_stats [] ignoriert, nichts gelöscht", r.t); }
    await req("/api/mc-ingest", { method: "POST", token: TOK, body: { player_ranks: [{ uuid: U2, name: "Seller", rank: "vip", color: "&6", weight: 40 }] } });
    const a = await req("/api/mc-pvp"), L = a.j?.players || [];
    ok(a.s === 200 && L.map((x) => x.name).join() === "Seller,Nils,Gast", "PvP-API sortiert nach Siegen, dann Quote", a.t.slice(0, 300));
    ok(JSON.stringify(Object.keys(L[0]).sort()) === JSON.stringify(["draws", "favorite_kit", "losses", "matches", "name", "rank", "uuid", "winrate_pct", "wins"]), "PvP-API nur öffentliche Felder (kein weight/updated_at)", Object.keys(L[0] || {}).join());
    ok(L[0].rank?.rank === "vip" && L[0].rank.color === "6" && L[1].rank === null, "PvP-API mit Rang-Badge aus mc_player_ranks");
    ok(L[1].favorite_kit === A.favorite_kit && L[0].favorite_kit === null && L[2].favorite_kit === null, "favorite_kit gespeichert / null");
    { const r = await req("/api/mc-pvp/nils"); ok(r.s === 200 && r.j?.wins === 10 && r.j?.name === "Nils", "PvP-Spieler-API → 200"); ok((await req("/api/mc-pvp/Niemand")).s === 404, "PvP-Spieler-API unbekannt → 404"); }
    { const r = await PV([{ ...A, winrate_pct: 71.4 }, { ...B, winrate_pct: 99.5 }, C]); const w = Object.fromEntries(sqlRows("SELECT name, winrate_pct FROM mc_pvp_stats").map((x) => [x.name, x.winrate_pct]));
      ok(r.s === 200 && r.j?.pvp_stats === 3 && w.Nils === 71 && w.Seller === 100, "winrate_pct Float gerundet (71.4→71, 99.5→100)", r.t + " " + JSON.stringify(w)); }
    await PV([B]); ok(sqlRows("SELECT COUNT(*) AS n FROM mc_pvp_stats")[0].n === 1, "pvp_stats Snapshot entfernt fehlende UUIDs");
    await PV([A, B, C]);
    { const pg = await req("/pvp"); const sec = pg.t.slice(pg.t.indexOf('id="pvp"'));
      ok(pg.s === 200 && pg.t.includes("/mc/pvp.js") && pg.t.includes("/mc/pvp.css") && pg.t.includes("/mc/ranks.css"), "GET /pvp bindet JS/CSS extern ein", String(pg.s));
      ok(!/<script>|<style| style=/.test(sec.slice(0, sec.indexOf("</section>"))), "/pvp-Inhalt ohne Inline-Script/-Style");
      ok(pg.t.includes('href="/pvp"'), "PvP in der MC-Navigation"); }
    { const pg = await req("/spieler/Nils"); ok(pg.s === 200 && pg.t.includes('id="pvp-pl"') && pg.t.includes('data-name="Nils"') && pg.t.includes("/mc/pvp.js"), "Spielerseite hat PvP-Block (extern)"); }
    { const js = await req("/mc/pvp.js"); ok(js.s === 200 && js.t.includes("E(p.favorite_kit)") && js.t.includes("p.matches<5") && !/style=|\.style\./.test(js.t), "pvp.js: Kit escaped, Quote erst ab 5 Kämpfen, keine Inline-Styles"); }
    sql("DELETE FROM mc_pvp_stats"); sql("DELETE FROM mc_player_ranks"); }
  console.log("H) VIP-Panel");
  { const noPriv = (j) => j && j.access === false && !("stats" in j) && !("worlds" in j) && !("player" in j) && !JSON.stringify(j).includes("diamond_sword") && !JSON.stringify(j).includes("weight");
    const anon = await req("/api/mc-vip"); ok(anon.s === 200 && anon.j?.reason === "login" && noPriv(anon.j) && anon.j.catalog?.length === 2, "VIP-API ohne Session → Übersicht, keine Stats", anon.t.slice(0, 180));
    ok((await req("/api/mc-vip", { method: "POST", body: {}, cookie: c1 })).s === 405, "POST /api/mc-vip → 405");
    const raw = await fetch(BASE + "/api/mc-vip", { headers: { host: HOST, cookie: c1 } });
    ok(/private/.test(raw.headers.get("cache-control") || "") && /no-store/.test(raw.headers.get("cache-control") || ""), "VIP-API Cache private, no-store", raw.headers.get("cache-control"));
    const none = await req("/api/mc-vip", { cookie: c1 }); ok(none.j?.reason === "rank" && noPriv(none.j) && !none.j.own_rank, "verknüpft ohne Rangzeile → kein Panel", none.t.slice(0, 160));
    sql(`UPDATE mc_links SET verified = 0 WHERE discord_id = '${D1}'`);
    ok((await req("/api/mc-vip", { cookie: c1 })).j?.reason === "link" && noPriv((await req("/api/mc-vip", { cookie: c1 })).j), "VIP-API: unverified → link, keine Stats");
    sql(`UPDATE mc_links SET verified = 1, has_role = 0 WHERE discord_id = '${D1}'`);
    ok((await req("/api/mc-vip", { cookie: c1 })).j?.reason === "link", "VIP-API: ohne Server-Rolle → link");
    sql(`UPDATE mc_links SET has_role = 1 WHERE discord_id = '${D1}'`);
    await req("/api/mc-ingest", { method: "POST", token: TOK, body: { player_ranks: [{ uuid: U1, name: "Nils", rank: "admin", color: "&c", weight: 100 }, { uuid: U2, name: "Seller", rank: "builder", color: "&a", weight: 80 }] } });
    const adm = await req("/api/mc-vip", { cookie: c1 }); ok(adm.j?.reason === "rank" && adm.j?.own_rank?.rank === "admin" && adm.j.own_rank.color === "c" && noPriv(adm.j), "Admin sieht die Übersicht, nicht das Panel", adm.t.slice(0, 200));
    ok((await req("/api/mc-vip", { cookie: c2 })).j?.own_rank?.rank === "builder" && (await req("/api/mc-vip", { cookie: c2 })).j?.access === false, "Builder kein Panel");
    sql(`UPDATE mc_player_stats SET stats = json_set(stats, '$.skin_url', 'https://textures.minecraft.net/texture/secretvip') WHERE mc_uuid = '${U1}'`);
    await req("/api/mc-ingest", { method: "POST", token: TOK, body: { player_ranks: [{ uuid: U1, name: "Nils", rank: "vip", color: "&6", weight: 40 }, { uuid: U2, name: "Seller", rank: "mvp", color: "&d", weight: 60 }] } });
    const vip = await req("/api/mc-vip", { cookie: c1 });
    ok(vip.j?.access === true && vip.j.player?.name === "Nils" && vip.j.player.rank === "vip" && vip.j.player.color === "6" && !("uuid" in (vip.j.player || {})) && vip.j.profile === "/profile", "VIP: eigener Rang, kein uuid", JSON.stringify(vip.j?.player));
    ok(vip.j?.stats?.money === 900 && vip.j.stats.playtime === 7200 && vip.j.stats.deaths === 3 && vip.j.stats.money !== 1200 && !("inventory" in (vip.j.stats || {})) && !JSON.stringify(vip.j).includes("diamond_sword") && !JSON.stringify(vip.j).includes("secretvip") && !JSON.stringify(vip.j).includes("weight"), "VIP-Stats kurz, ohne Inventar/Skin/weight", JSON.stringify(vip.j?.stats));
    ok(vip.j?.catalog?.[0]?.yours === true && vip.j.catalog[1].yours === false && vip.j.catalog[1].perks.some((p) => p.id === "higher") && vip.j.worlds?.placeholder === true, "VIP-Katalog markiert den eigenen Rang, Welten noch Platzhalter");
    const mvp = await req("/api/mc-vip", { cookie: c2 });
    ok(mvp.j?.access === true && mvp.j.player?.rank === "mvp" && mvp.j.player.color === "d" && mvp.j.stats?.money === 1200 && mvp.j.stats.money !== 900 && mvp.j.catalog?.[1]?.yours === true, "MVP sieht nur eigene Stats", JSON.stringify(mvp.j?.stats));
    const up = U2.toUpperCase();
    const ingU = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { player_ranks: [{ uuid: up, name: "Seller", rank: "mvp", color: "&d", weight: 60 }, { uuid: U1, name: "Nils", rank: "vip", color: "&6", weight: 40 }] } });
    ok(ingU.s === 200 && ingU.j?.player_ranks === 2 && sqlRows("SELECT uuid FROM mc_player_ranks WHERE name='Seller'")[0]?.uuid === U2.replace(/-/g, ""), "Ranks-Ingest: UUID mit Bindestrichen und Großbuchstaben wird kleingeschrieben ohne Bindestriche gespeichert", ingU.t);
    sql(`UPDATE mc_player_ranks SET uuid = '${up}', color = '&z' WHERE name = 'Seller'`);
    sql(`UPDATE mc_links SET mc_uuid = '${up}' WHERE discord_id = '${D2}'`);
    const mix = await req("/api/mc-vip", { cookie: c2 });
    ok(mix.j?.access === true && mix.j.player?.rank === "mvp" && mix.j.player.color === "d" && mix.j.stats?.money === 1200, "normU trifft Rang trotz Bindestrichen/Großbuchstaben, ungültige Farbe → &d", JSON.stringify({ p: mix.j?.player, s: mix.j?.stats }));
    sql(`UPDATE mc_links SET mc_uuid = '${U2}' WHERE discord_id = '${D2}'`);
    await req("/api/mc-ingest", { method: "POST", token: TOK, body: { servers: { lobby: { online: true, players: ["Nils"], max: 20, tps: 20 }, survival: { online: true, players: ["A"], max: 40, tps: 19 }, vipwelt: { online: true, players: ["Seller", "<script>"], max: 4, tps: 19.96 }, vip_1: { online: true, players: ["Nils", "not a name"], max: 8, tps: 20 }, "vip-2": { online: false, players: [], max: 8, tps: 18.2 }, vip_4: { online: true, players: ["Gast"], max: 4, tps: 20 } } } });
    const live = await req("/api/mc-vip", { cookie: c1 });
    const ids = (live.j?.worlds?.slots || []).map((s) => s.id);
    ok(live.j?.worlds?.placeholder === false && ids.join() === "vipwelt,vip_1,vip-2" && live.j.worlds.slots[0].players === 1 && live.j.worlds.slots[1].online === true && live.j.worlds.slots[2].online === false && !JSON.stringify(live.j.worlds).includes("<script>") && !JSON.stringify(live.j.worlds).includes("lobby") && !JSON.stringify(live.j.worlds).includes("survival") && !ids.includes("vip_4"), "VIP-Welten: max 3, Lobby/Survival raus, Namen gefiltert", JSON.stringify(live.j?.worlds));
    await req("/api/mc-ingest", { method: "POST", token: TOK, body: { servers: {} } });
    sql("DELETE FROM mc_player_ranks");
    sql(`UPDATE mc_player_stats SET stats = json_remove(stats, '$.skin_url') WHERE mc_uuid = '${U1}'`);
    const pg = await req("/vip"); const sec = pg.t.slice(pg.t.indexOf('id="vip"'));
    ok(pg.s === 200 && pg.t.includes("/mc/vip.js") && pg.t.includes("/mc/vip.css") && pg.t.includes("/mc/ranks.css") && /data-g="community"[\s\S]*?href="\/vip"/.test(pg.t), "GET /vip bindet Panel ein, Link im Community-Menü", String(pg.s));
    ok(!/<script|<style| style=/.test(sec.slice(0, sec.indexOf("</section>"))), "/vip-Inhalt ohne Inline-Script/-Style");
    { const m = await req("/vip", { testHost: "nwebnotfound.dev" }); ok(!(m.s === 200 && m.t.includes('id="vip"')), "/vip nur auf mc-Domain", String(m.s)); }
    { const js = await req("/mc/vip.js"); ok(js.s === 200 && js.t.includes("E(p.title)") && js.t.includes("E(s.label)") && js.t.includes('href="/profile"') && js.t.includes("encodeURIComponent(rel)") && !js.t.includes("location.href") && !/style=|\.style\./.test(js.t), "vip.js escaped, Login-next relativ, keine Inline-Styles"); }
    { const bye = async (next) => { const r = await fetch(BASE + "/auth/discord/logout?next=" + encodeURIComponent(next), { headers: { host: HOST, "x-nnf-test-host": "nwebnotfound.dev" }, redirect: "manual" }); return r.headers.get("location") || ""; };
      const evil = await bye("https://evil.com"), proto = await bye("//evil.com"), bs = await bye("/\\evil.com"), info = await bye("https://evil.com@mc.nwebnotfound.dev/vip");
      ok(evil === "https://nwebnotfound.dev/" && proto === "https://nwebnotfound.dev/" && !bs.includes("evil.com") && info === "https://nwebnotfound.dev/", "next=https://evil.com, //evil.com, Backslash und Userinfo bleiben auf der Seite", JSON.stringify({ evil, proto, bs, info }));
      const name = await bye("/spieler/Nils"), under = await bye("/spieler/a_b");
      ok(name === "https://nwebnotfound.dev/spieler/Nils" && under === "https://nwebnotfound.dev/spieler/a_b", "next /spieler/Nils und /spieler/a_b bleiben erhalten", JSON.stringify({ name, under }));
      const rel = await bye("/vip"), abs = await bye("https://mc.nwebnotfound.dev/vip");
      const vipLoc = (loc) => { try { const u = new URL(loc); return u.pathname === "/vip" && (u.hostname === "mc.nwebnotfound.dev" || u.hostname === "127.0.0.1") && !loc.includes("evil"); } catch { return false; } };
      ok(vipLoc(rel) && vipLoc(abs), "relativer und absoluter next auf /vip ist erlaubt", JSON.stringify({ rel, abs }));
      ok((await bye("https://nwebnotfound.dev.evil.com/vip")) === "https://nwebnotfound.dev/", "Host muss nwebnotfound.dev oder Subdomain davon sein"); }
  }
  // Ingest: null bleibt NULL (nicht 0), online pro Spieler wird gespeichert (Dict- und View-Form)
  { const nm = sqlRows(`SELECT mc_name FROM mc_links WHERE mc_uuid = '${U1}'`)[0]?.mc_name, bak = sqlRows(`SELECT stats, updated_at FROM mc_player_stats WHERE mc_uuid = '${U1}'`)[0];
    const pad = Object.fromEntries(Array.from({ length: 30 }, (_, i) => ["s" + i, i]));
    let r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { players_stats: { [U1]: { playtime: 5, ...pad, team: null, team_color: null, last_seen: null, online: true } } } });
    let s = JSON.parse(sqlRows(`SELECT stats FROM mc_player_stats WHERE mc_uuid = '${U1}'`)[0].stats);
    ok(r.s === 200 && s.team === null && s.team_color === null && s.last_seen === null && s.online === true && s.playtime === 5, "Ingest: null → null statt 0, online=true gespeichert (auch bei >24 Feldern)", JSON.stringify(s));
    const a = await req("/api/mc-players/" + nm); ok(a.j?.online === true && a.j?.team === undefined && a.j?.last_seen === undefined, "API: online=true, kein Team/last_seen aus null", a.t.slice(0, 300));
    r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { v_player_stats_ext: [{ uuid: U1, name: nm, playtime: 6, team: null, team_color: null, last_seen: null, online: false }] } });
    s = JSON.parse(sqlRows(`SELECT stats FROM mc_player_stats WHERE mc_uuid = '${U1}'`)[0].stats);
    ok(r.s === 200 && s.team === null && s.last_seen === null && s.online === false && s.playtime === 6, "Ingest (View-Form): null bleibt null, online=false gespeichert", JSON.stringify(s));
    r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { players_stats: { [U1]: { playtime: 7, online: "1", team: "" } } } });
    s = JSON.parse(sqlRows(`SELECT stats FROM mc_player_stats WHERE mc_uuid = '${U1}'`)[0].stats);
    ok(s.online === true && s.team === null, "Ingest: online '1' → true, leerer String → null", JSON.stringify(s));
    // null-Stats: nicht als 0 in Leaderboards, keine 'null'/NaN, Sortierung stimmt
    const lbBak = sqlRows("SELECT kind, data, updated_at FROM mc_leaderboards"), snBak = sqlRows("SELECT data, updated_at FROM mc_snapshot WHERE id = 1")[0];
    r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { leaderboards: { kills: [{ name: "A", value: null }, { name: "B", value: 3 }, { name: "C", value: "" }, { name: "D", value: 9 }] } } });
    let lb = await req("/api/mc-leaderboards"); const kl = lb.j?.total?.lists?.kills;
    ok(r.s === 200 && JSON.stringify(kl) === JSON.stringify([{ name: "D", value: 9 }, { name: "B", value: 3 }]) && !/null|NaN/.test(JSON.stringify(kl)), "Leaderboard (Dict): null/leer verworfen, Sortierung ok", JSON.stringify(kl));
    r = await req("/api/mc-ingest", { method: "POST", token: TOK, body: { v_leaderboards: [{ category: "deaths", name: "A", value: null }, { category: "deaths", name: "B", value: 2 }, { category: "deaths", name: "D", value: 5 }] } });
    lb = await req("/api/mc-leaderboards"); const dl = lb.j?.total?.lists?.deaths;
    ok(r.s === 200 && JSON.stringify(dl) === JSON.stringify([{ name: "D", value: 5 }, { name: "B", value: 2 }]), "Leaderboard (View): null-Zeile verworfen statt 0", JSON.stringify(dl));
    const pa = await req("/api/mc-players"); ok(pa.s === 200 && !/NaN|"null"/.test(pa.t), "Spielerliste ohne NaN/'null' bei null-Stats");
    sql("DELETE FROM mc_leaderboards"); for (const x of lbBak) sql(`INSERT INTO mc_leaderboards (kind, data, updated_at) VALUES ('${x.kind}', '${x.data.replace(/'/g, "''")}', ${x.updated_at})`);
    if (snBak) sql(`UPDATE mc_snapshot SET data = '${snBak.data.replace(/'/g, "''")}', updated_at = ${snBak.updated_at} WHERE id = 1`);
    if (bak) sql(`UPDATE mc_player_stats SET stats = '${bak.stats.replace(/'/g, "''")}', updated_at = ${bak.updated_at} WHERE mc_uuid = '${U1}'`); }
  sql(`UPDATE mc_player_stats SET stats = json_set(stats, '$.team', 'Rot', '$.team_color', '#FF5555', '$.team_color_code', '&c', '$.last_seen', '2026-10-31T23:05:00Z', '$.online', json('false')) WHERE mc_uuid = '${U1}'`);
  sql(`UPDATE mc_player_stats SET stats = json_set(stats, '$.team', 'Grün', '$.team_color', 'red;x', '$.team_color_hex', '#55ff55', '$.online', 1) WHERE mc_uuid = '${U2}'`);
  try { execSync(`python3 scripts/e2e_ui.py ${BASE} '${c1}'`, { cwd: ROOT, stdio: "inherit" }); pass++; } catch { fail++; console.log("  ✗ UI-Prüfung fehlgeschlagen"); }

} catch (e) { fail++; console.log("Fehler:", e.stack); console.log(log.slice(-2000)); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
