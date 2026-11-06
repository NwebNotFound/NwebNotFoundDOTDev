#!/usr/bin/env node
// Warteschlangen gegen echtes SQLite (node:sqlite, Schema aus schema.sql):
//  #84 mc_snapshot ohne Lost Update, VIP-Doppel-Submit → duplicate statt 500, Shop-Order-Idempotenz.
// Läuft allein und wird von scripts/e2e.mjs importiert. Ohne node:sqlite (Node < 22.5) übersprungen.
import assert from "node:assert/strict";
import { makeD1, sqliteAvailable } from "./d1-sqlite.mjs";
import { snapshotStatement } from "../src/worker.js";
import { makeTrade } from "../src/mc-trade.js";
import { makeVip } from "../src/mc-vip-cmd.js";

if (!sqliteAvailable) { console.log("queue-unit: node:sqlite fehlt, übersprungen"); }
else {
  const json = (body, status = 200, h = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...h } });
  const DID = "123456789012345678", U1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", OWNER = "ffffffff-0000-4000-8000-000000000000";
  const getUser = async () => ({ id: DID, name: "Nils" });
  const deps = { json, getUser, safeEq: (a, b) => a === b, MAIN: "nwebnotfound.dev", MCD: "mc.nwebnotfound.dev" };
  const trade = makeTrade(deps), vip = makeVip(deps);
  const web = (path, body, ip = "203.0.113.5") => new Request("https://mc.nwebnotfound.dev" + path, { method: "POST", headers: { origin: "https://mc.nwebnotfound.dev", "cf-connecting-ip": ip, "content-type": "application/json" }, body: JSON.stringify(body) });
  const U = (p) => new URL("https://mc.nwebnotfound.dev" + p);
  const fresh = async () => {
    const DB = makeD1(), now = Date.now();
    await DB.prepare("INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES (?, 'Nils', ?, 1, 1, ?)").bind(DID, U1, now).run();
    await DB.prepare("INSERT INTO mc_player_ranks (uuid, name, rank, color, weight, updated_at) VALUES (?, 'Nils', 'mvp', '&d', 1, ?)").bind(U1.replace(/-/g, ""), now).run();
    await DB.prepare("INSERT INTO mc_blobs (kind, data, updated_at) VALUES ('shops', ?, ?)").bind(JSON.stringify([{ id: "s1", owner_uuid: OWNER, items: [{ listing_id: "L1", item: "diamond", price: 1500, stock: 10, mode: "sell" }] }]), now).run();
    await DB.prepare("INSERT INTO mc_blobs (kind, data, updated_at) VALUES ('vip_worlds', ?, ?)").bind(JSON.stringify([{ id: U1, owner_uuid: U1, owner_name: "Nils", name: "Insel", invites: [] }]), now).run();
    return { DB, IP_HASH_PEPPER: "p" };
  };

  // ---- mc_snapshot: parallele Teil-Pushes überschreiben sich nicht ----
  {
    const env = await fresh(), DB = env.DB;
    await snapshotStatement(env, { lobby: { online: true } }, { kills: [1] }, 1000).run();
    // zwei "parallele" Pushes: der eine nur servers, der andere nur leaderboards
    await DB.batch([snapshotStatement(env, { lobby: { online: false } }, undefined, 2000)]);
    await DB.batch([snapshotStatement(env, undefined, { kills: [2] }, 3000)]);
    const row = await DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first(), d = JSON.parse(row.data);
    assert.equal(d.servers.lobby.online, false, "servers-Push bleibt erhalten");
    assert.deepEqual(d.leaderboards.kills, [2], "leaderboards-Push bleibt erhalten");
    assert.equal(d.servers_at, 2000); assert.equal(d.leaderboards_at, 3000); assert.equal(row.updated_at, 3000);
    // Altdaten ohne *_at: der nicht gesendete Teil bekommt das alte updated_at, bevor es weiterspringt
    await DB.prepare("UPDATE mc_snapshot SET data = ?, updated_at = 500").bind(JSON.stringify({ servers: { a: 1 }, leaderboards: { b: 1 } })).run();
    await snapshotStatement(env, undefined, { b: 2 }, 4000).run();
    const d2 = JSON.parse((await DB.prepare("SELECT data FROM mc_snapshot").first()).data);
    assert.equal(d2.servers_at, 500, "Alt-servers_at aus updated_at nachgetragen"); assert.equal(d2.leaderboards_at, 4000); assert.deepEqual(d2.servers, { a: 1 });
  }

  // ---- VIP: zwei parallele Submits mit derselben request_id ----
  {
    const env = await fresh(), p = "/api/mc-vip/worlds/" + U1 + "/visibility", body = { visibility: "private", request_id: "dup-req-1" };
    const rs = await Promise.all([vip.route(p, web(p, body), env, U(p)), vip.route(p, web(p, body), env, U(p))]);
    const st = rs.map((r) => r.status).sort();
    assert.deepEqual(st, [200, 202], "einer 202, der andere duplicate 200 (kein 500): " + st);
    const dupBody = await rs.find((r) => r.status === 200).json(); assert.equal(dupBody.duplicate, true);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM mc_vip_commands").first()).n, 1, "nur eine Zeile");
    const other = await vip.route(p, web(p, { visibility: "friends", request_id: "dup-req-1" }), env, U(p));
    assert.equal(other.status, 409, "gleiche request_id, anderer Inhalt → 409");
  }

  // ---- Shop-Order: request_id macht Retry/Doppelklick idempotent ----
  {
    const env = await fresh(), p = "/api/mc-shop-order", body = { listing_id: "L1", qty: 2, request_id: "11111111-2222-4333-8444-555555555555" };
    const rs = await Promise.all([trade.route(p, web(p, body), env, U(p)), trade.route(p, web(p, body), env, U(p))]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 202], "paralleler Doppel-Submit → 202 + duplicate 200");
    const again = await trade.route(p, web(p, body), env, U(p)); assert.equal(again.status, 200); assert.equal((await again.json()).duplicate, true);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM mc_shop_orders_pending").first()).n, 1, "nur eine Bestellung");
    const diff = await trade.route(p, web(p, { ...body, qty: 3 }), env, U(p)); assert.equal(diff.status, 409, "gleiche request_id, andere Menge → 409");
    const bad = await trade.route(p, web(p, { ...body, request_id: "x" }), env, U(p)); assert.equal(bad.status, 400, "ungültige request_id → 400");
    const noRid = await trade.route(p, web(p, { listing_id: "L1", qty: 1 }), env, U(p)); assert.equal(noRid.status, 202, "ohne request_id (Bot/alte Clients) weiter 202");
  }
  console.log("queue-unit: alle Tests grün");
}
