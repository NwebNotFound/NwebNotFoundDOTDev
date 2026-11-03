#!/usr/bin/env node
// Unit-Tests fuer das IP-Hashing der Website-Warteschlangen.
// Laeuft allein (node scripts/ip-hash-unit.mjs) und prueft:
//   1. hashIp ist deterministisch und pepper-/IP-abhaengig
//   2. ohne Pepper fail-closed (null), nie Klartext
//   3. die INSERT-Pfade von mc-trade/mc-vip-cmd binden keine Klartext-IP mehr,
//      sondern ein 64-stelliges ip_hash-Hex; Rate-Limit-Abfragen lesen ip_hash (+ Alt-ip).
import assert from "node:assert/strict";
import { hashIp, normalizeIp } from "../src/ip-hash.js";
import { makeTrade } from "../src/mc-trade.js";
import { makeVip } from "../src/mc-vip-cmd.js";

const PEPPER = "unit-test-pepper";
const IP = "203.0.113.45";
const U1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const HEX64 = /^[0-9a-f]{64}$/;

// ---- 1./2. hashIp direkt ----
const h1 = await hashIp({ IP_HASH_PEPPER: PEPPER }, IP);
assert.equal(h1, await hashIp({ IP_HASH_PEPPER: PEPPER }, IP), "gleicher Input → gleicher Hash");
assert.ok(HEX64.test(h1), "Hex-Digest mit 64 Zeichen");
assert.notEqual(h1, await hashIp({ IP_HASH_PEPPER: "anderer-pepper" }, IP), "anderer Pepper → anderer Hash");
assert.notEqual(h1, await hashIp({ IP_HASH_PEPPER: PEPPER }, "198.51.100.7"), "andere IP → anderer Hash");
assert.equal(await hashIp({}, IP), null, "fehlender Pepper → null (fail-closed)");
assert.equal(await hashIp({ IP_HASH_PEPPER: PEPPER }, ""), null, "leere IP → null");
assert.equal(await hashIp({ IP_HASH_PEPPER: PEPPER }, null), null, "keine IP → null");
assert.ok(!h1.includes(IP), "Hash enthaelt die Klartext-IP nicht");
assert.equal(normalizeIp(" 203.0.113.45 "), "203.0.113.45", "trim");

// ---- 3. Worker-INSERT-Pfade mit gemockter D1 ----
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const safeEq = (a, b) => a === b;
const getUser = async () => ({ id: "123456789012345678" });
const MAIN = "nwebnotfound.dev", MCD = "mc.nwebnotfound.dev";
const AUCTION = { id: "a1", status: "active", seller_uuid: "ffffffff-0000-4000-8000-000000000000", min_price: 100, bid_count: 0, current_bid: null, ends_at: null };
const SHOP = { id: "s1", owner_uuid: "ffffffff-0000-4000-8000-000000000000", items: [{ listing_id: "L1", item: "diamond", price: 1500, stock: 10, mode: "sell" }] };
const WORLD = { id: U1, owner_uuid: U1, owner_name: "Nils", invites: [] };

function mockDb() {
  const calls = [];
  const handler = (sql, params) => {
    if (/FROM mc_links/.test(sql)) return { mc_name: "Nils", mc_uuid: U1, has_role: 1, verified: 1 };
    if (/FROM mc_player_ranks/.test(sql)) return { rank: "admin" };
    if (/SUM\(c1\)/.test(sql)) return { m: 0, h: 0 };
    if (/FROM mc_blobs WHERE kind = \?/.test(sql)) {
      const k = params[0];
      if (k === "auctions") return { data: JSON.stringify([AUCTION]), updated_at: 1 };
      if (k === "shops") return { data: JSON.stringify([SHOP]), updated_at: 1 };
      if (k === "vip_worlds") return { data: JSON.stringify([WORLD]), updated_at: 1 };
      return null;
    }
    if (/MAX\(amount\)/.test(sql)) return { m: null };
    if (/FROM mc_shop_orders_pending WHERE id = \?/.test(sql)) return null;
    if (/FROM mc_market WHERE item/.test(sql)) return { buy_locked: 0, buy_price: 1.0 };
    if (/FROM mc_vip_commands WHERE discord_id = \? AND request_id/.test(sql)) return null;
    if (/SELECT 1 AS n FROM mc_vip_commands WHERE world_id/.test(sql)) return null;
    if (/SELECT COUNT\(\*\) AS n, MIN\(created_at\)/.test(sql)) return { n: 0, t: null };
    return null;
  };
  const DB = {
    prepare(sql) {
      const stmt = { params: [], bind(...p) { stmt.params = p; return stmt; } };
      stmt.first = async () => { calls.push({ sql, params: stmt.params }); return handler(sql, stmt.params); };
      stmt.run = async () => { calls.push({ sql, params: stmt.params }); return { meta: { changes: 1 } }; };
      stmt.all = async () => { calls.push({ sql, params: stmt.params }); return { results: [] }; };
      return stmt;
    },
  };
  return { calls, DB };
}

const webHeaders = { origin: "https://nwebnotfound.dev", "cf-connecting-ip": IP, "content-type": "application/json" };
const mkReq = (path, body) => new Request("http://x" + path, { method: "POST", headers: webHeaders, body: JSON.stringify(body) });

const trade = makeTrade({ json, getUser, safeEq, MAIN, MCD });
const vip = makeVip({ json, getUser, safeEq, MAIN, MCD });

// Mit Pepper: bid + order + vip-invite
const a = mockDb(); const envA = { DB: a.DB, IP_HASH_PEPPER: PEPPER, MC_INGEST_TOKEN: "t" };
assert.equal((await trade.route("/api/mc-bid", mkReq("/api/mc-bid", { auction_id: "a1", amount: 500 }), envA, new URL("http://x/api/mc-bid"))).status, 202, "Bid akzeptiert");
assert.equal((await trade.route("/api/mc-shop-order", mkReq("/api/mc-shop-order", { listing_id: "L1", qty: 2 }), envA, new URL("http://x/api/mc-shop-order"))).status, 202, "Order akzeptiert");
assert.equal((await vip.route("/api/mc-vip/worlds/" + U1 + "/members", mkReq("/api/mc-vip/worlds/" + U1 + "/members", { name: "Friend1" }), envA, new URL("http://x/api/mc-vip/worlds/" + U1 + "/members"))).status, 202, "VIP-invite akzeptiert");

const inserts = a.calls.filter((c) => /INSERT INTO (mc_bids_pending|mc_shop_orders_pending|mc_vip_commands)/.test(c.sql));
assert.ok(inserts.length >= 3, "drei INSERTs erfasst (bid/order/vip): " + inserts.length);
for (const c of inserts) {
  assert.ok(!c.params.includes(IP), "Klartext-IP darf nicht als Parameter gebunden werden: " + c.sql);
  assert.ok(!c.sql.includes(IP), "Klartext-IP steht nicht im SQL: " + c.sql);
  assert.ok(/ip_hash/.test(c.sql), "INSERT nennt die Spalte ip_hash: " + c.sql);
  assert.ok(c.params.some((p) => typeof p === "string" && HEX64.test(p)), "INSERT bindet einen ip_hash-Hex: " + c.sql);
  assert.ok(/,\s*NULL\s*,/.test(c.sql), "INSERT schreibt ip als NULL: " + c.sql);
}
const ipRl = a.calls.filter((c) => /ip_hash = \?1 OR ip = \?4/.test(c.sql) || /ip_hash = \?1 OR ip = \?2/.test(c.sql));
assert.ok(ipRl.length >= 2, "IP-Rate-Limit-Abfragen lesen ip_hash und zusaetzlich Alt-ip: " + ipRl.length);

// Ohne Pepper: fail-closed, weder Klartext noch Hash
const b = mockDb(); const envB = { DB: b.DB, MC_INGEST_TOKEN: "t" };
assert.equal((await trade.route("/api/mc-bid", mkReq("/api/mc-bid", { auction_id: "a1", amount: 500 }), envB, new URL("http://x/api/mc-bid"))).status, 202, "Bid ohne Pepper laeuft weiter durch");
const insertsB = b.calls.filter((c) => /INSERT INTO mc_bids_pending/.test(c.sql));
assert.equal(insertsB.length, 1, "ein INSERT erfasst");
assert.ok(!insertsB[0].params.includes(IP), "ohne Pepper keine Klartext-IP");
assert.ok(!insertsB[0].params.some((p) => typeof p === "string" && HEX64.test(p)), "ohne Pepper kein ip_hash-Hex (NULL)");

console.log("ip-hash-unit: alle Tests grün");
