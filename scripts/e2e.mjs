#!/usr/bin/env node
// End-to-End-Test gegen lokales `wrangler dev` + lokale D1 (frische DB unter .wrangler/e2e). Aufruf: node scripts/e2e.mjs
import { spawn, execSync } from "node:child_process";
import { webcrypto as C } from "node:crypto";
import fs from "node:fs";
const ROOT = new URL("..", import.meta.url).pathname, PORT = 8799, BASE = `http://127.0.0.1:${PORT}`, HOST = "mc.nwebnotfound.dev", TOK = "e2e-token", SECRET = "e2e-secret";
const PERSIST = ROOT + ".wrangler/e2e", DV = ROOT + ".dev.vars";
let pass = 0, fail = 0; const ok = (c, m, extra = "") => { if (c) pass++; else fail++; console.log((c ? "  ✓ " : "  ✗ ") + m + (c ? "" : "  " + extra)); };
const sql = (q) => execSync(`npx wrangler d1 execute DB --local --persist-to ${PERSIST} --json --command ${JSON.stringify(q)}`, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sqlRows = (q) => JSON.parse(sql(q))[0].results;
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function cookieFor(sid) { const k = await C.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return "nnf_session=" + encodeURIComponent(sid + "." + b64u(await C.subtle.sign("HMAC", k, new TextEncoder().encode(sid)))); }
const req = async (path, { method = "GET", body, token, cookie, origin, ip = "10.0.0.1" } = {}) => {
  const h = { host: HOST, "cf-connecting-ip": ip }; if (body) h["content-type"] = "application/json"; if (token) h["x-ingest-token"] = token; if (cookie) h.cookie = cookie; if (origin) h.origin = origin;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t };
};
const U1 = "11111111-2222-3333-4444-555555555555", U2 = "0f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f8", D1 = "100000000000000001", D2 = "100000000000000002", O = "https://" + HOST;
const now = Date.now(), H = 3600;

// --- Setup
fs.rmSync(PERSIST, { recursive: true, force: true });
const hadDV = fs.existsSync(DV); if (hadDV) fs.copyFileSync(DV, DV + ".e2e-bak");
fs.writeFileSync(DV, `MC_INGEST_TOKEN=${TOK}\nSESSION_SECRET=${SECRET}\nDISCORD_CLIENT_ID=1\nDISCORD_CLIENT_SECRET=x\n`);
console.log("Schema …"); execSync(`npx wrangler d1 execute DB --local --persist-to ${PERSIST} --file schema.sql`, { cwd: ROOT, stdio: "ignore" });
const wd = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--local-upstream", HOST, "--persist-to", PERSIST], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = ""; wd.stdout.on("data", (d) => (log += d)); wd.stderr.on("data", (d) => (log += d));
const cleanup = () => { try { process.kill(-wd.pid); } catch {} fs.rmSync(DV, { force: true }); if (hadDV) fs.renameSync(DV + ".e2e-bak", DV); };
process.on("exit", cleanup); process.on("SIGINT", () => process.exit(130));
for (let i = 0; i < 60; i++) { try { await fetch(BASE + "/", { headers: { host: HOST } }); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

try {
  sql(`INSERT INTO sessions (id, discord_id, username, global_name, expires_at) VALUES ('s1','${D1}','nils','Nils',datetime('now','+1 day')),('s2','${D2}','seller','Seller',datetime('now','+1 day'))`);
  const c1 = await cookieFor("s1"), c2 = await cookieFor("s2");

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
    ],
    v_market_history: [
      { item: "diamond", ts: hr - 26 * H, price: 10, volume: 4 }, { item: "diamond", hour_ts: (hr - 1 * H) * 1000, avg_price: 11, min: 10.5, max: 11.5, qty: 2 },
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
  ok(ing.j?.auctions === 5 && ing.j?.shops === 2 && ing.j?.market === 6, "Zählung auctions/shops/market", JSON.stringify(ing.j));
  ok(ing.j?.views?.leaderboards >= 3 && ing.j?.players_stats === 2, "Views: Leaderboards + Player-Stats erkannt", JSON.stringify(ing.j));
  ok(ing.j?.market_history === 2, "v_market_history: 2 Punkte", JSON.stringify(ing.j));

  console.log("2) Markt");
  const m = (await req("/api/mc-market")).j, by = Object.fromEntries(m.items.map((x) => [x.item, x]));
  ok(by.elytra.buy_locked === 1 && by.netherite_block.buy_locked === 1, "locked/buy_price 0 → buy_locked");
  ok(by.beacon.sell_locked === 1 && by.beacon.buy_locked === 0, "sell_enabled:false → sell_locked");
  ok(by.dragon_egg && by.dragon_egg.buy_locked === 1 && by.dragon_egg.sell_locked === 1, "beide Preise null → trotzdem übernommen, gesperrt");
  ok(by.diamond.hist_pct === 1 && Math.abs(by.diamond.change_24h_pct - 10) < 0.01, "%-Änderung aus Historie (10 → 11 = +10 %)", JSON.stringify(by.diamond));
  ok(!by.dirt.hist_pct && !by.dirt.has_hist, "ohne Historie: kein hist_pct (UI zeigt —)");
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

  console.log("7) Seiten");
  for (const p of ["/", "/markt", "/markt/diamond", "/markt/elytra", "/shops", "/shops/s1", "/auktionen", "/auktionen/a1", "/leaderboards", "/spieler", "/spieler/Nils", "/profile", "/wiki", "/wiki/befehle"]) { const x = await req(p); ok(x.s === 200 && /ds\.css\?v=/.test(x.t), "GET " + p + " → 200", x.s); }
  ok((await req("/bestenlisten")).s === 301, "/bestenlisten → 301 /leaderboards");
  ok((await req("/markt")).t.includes('autocomplete="off"'), "Suchfeld ohne Autofill");
  console.log("8) UI (Chromium 390/1440)");
  try { execSync(`python3 scripts/e2e_ui.py ${BASE} '${c1}'`, { cwd: ROOT, stdio: "inherit" }); pass++; } catch { fail++; console.log("  ✗ UI-Prüfung fehlgeschlagen"); }
} catch (e) { fail++; console.log("Fehler:", e.stack); console.log(log.slice(-2000)); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
