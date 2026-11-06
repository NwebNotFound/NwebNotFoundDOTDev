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
    await DB.prepare("INSERT INTO mc_blobs (kind, data, updated_at) VALUES ('auctions', ?, ?)").bind(JSON.stringify([{ id: "a1", status: "active", seller_uuid: OWNER, min_price: 100, bid_count: 0, current_bid: null, ends_at: null }]), now).run();
    await DB.prepare("INSERT INTO mc_market (item, buy_price, sell_price, base_price, updated_at) VALUES ('diamond', 11, 5, 10, 1)").run();
    return { DB, IP_HASH_PEPPER: "p" };
  };

  // Race-Simulation: Vorabprüfungen (Zählungen vor dem INSERT) sehen immer den alten, leeren Stand –
  // genau das passiert, wenn viele parallele Anfragen zählen, bevor die erste Zeile geschrieben ist.
  // Dann muss die Bedingung im INSERT selbst das Limit halten.
  const PRECHECK = [[/SUM\(c1\)/, { m: 0, h: 0 }], [/SELECT COUNT\(\*\) AS n, MIN\(created_at\)/, { n: 0, t: null }], [/SELECT 1 AS n FROM mc_vip_commands/, null], [/SELECT COUNT\(\*\) AS n FROM mc_vip_commands WHERE action = 'create'/, { n: 0 }]];
  const raced = (env) => ({ ...env, DB: { ...env.DB, prepare: (sql) => { const hit = PRECHECK.find(([re]) => re.test(sql)); if (!hit) return env.DB.prepare(sql); const st = { bind: () => st, first: async () => hit[1] }; return st; } } });

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
  // ---- #81: Rate-Limit atomar – 20 parallele Gebote, nur 5 kommen durch ----
  {
    const env0 = await fresh(), env = raced(env0), p = "/api/mc-bid";
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => trade.route(p, web(p, { auction_id: "a1", amount: 1000 + i }), env, U(p))));
    const ok = rs.filter((r) => r.status === 202).length;
    assert.equal(ok, 5, "genau 5 von 20 parallelen Geboten angenommen: " + rs.map((r) => r.status));
    // (409 = "Mindestgebot", weil ein eigenes offenes Gebot das Minimum hebt – je nach Reihenfolge)
    assert.ok(rs.every((r) => [202, 409, 429].includes(r.status)) && rs.some((r) => r.status === 429), "Rest abgelehnt (429)");
    assert.equal((await env0.DB.prepare("SELECT COUNT(*) AS n FROM mc_bids_pending").first()).n, 5);
    // Shop-Order zählt in denselben Topf
    const o = await trade.route("/api/mc-shop-order", web("/api/mc-shop-order", { listing_id: "L1", qty: 1, request_id: "rid-after-limit-1" }), env, U("/api/mc-shop-order"));
    assert.equal(o.status, 429, "Shop-Order nach 5 Geboten → 429");
    assert.equal((await env0.DB.prepare("SELECT COUNT(*) AS n FROM mc_shop_orders_pending").first()).n, 0);
  }
  // ---- #81: Pro-IP-Limit greift atomar über mehrere Accounts ----
  {
    const env = await fresh(); const DB = env.DB;
    for (let i = 0; i < 12; i++) await DB.prepare("INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES (?, ?, ?, 1, 1, 1)").bind(String(200000000000000000n + BigInt(i)), "P" + i, "00000000-0000-4000-8000-" + String(i).padStart(12, "0")).run();
    let n = 0; const ids = Array.from({ length: 12 }, (_, i) => String(200000000000000000n + BigInt(i)));
    const t2 = makeTrade({ ...deps, getUser: async () => ({ id: ids[n++ % 12] }) });
    const rs = await Promise.all(ids.map((_, i) => t2.route("/api/mc-bid", web("/api/mc-bid", { auction_id: "a1", amount: 2000 + i }, "198.51.100.77"), raced(env), U("/api/mc-bid"))));
    assert.equal(rs.filter((r) => r.status === 202).length, 10, "pro IP 10/min auch parallel: " + rs.map((r) => r.status));
  }
  // ---- #81: zwei parallele VIP-creates bekommen nicht denselben freien Platz ----
  {
    const env = raced(await fresh()), p = "/api/mc-vip/worlds"; // MVP: 3 Plätze, eine eigene Welt existiert → 2 frei
    const rs = await Promise.all(["Alpha", "Bravo", "Charlie", "Delta"].map((name, i) => vip.route(p, web(p, { name, type: "normal", request_id: "create-" + i }), env, U(p))));
    assert.equal(rs.filter((r) => r.status === 202).length, 2, "nur 2 von 4 parallelen creates: " + rs.map((r) => r.status));
    const same = await Promise.all([0, 1].map((i) => vip.route(p, web(p, { name: "Echo", request_id: "echo-" + i }), env, U(p))));
    assert.ok(same.every((r) => r.status === 409 || r.status === 429), "kein freier Platz mehr → abgelehnt");
    const env2 = raced(await fresh());
    const nm = await Promise.all([0, 1, 2].map((i) => vip.route(p, web(p, { name: "Gleich", request_id: "gleich-" + i }), env2, U(p))));
    assert.equal(nm.filter((r) => r.status === 202).length, 1, "gleicher Name parallel nur einmal");
    // start: "busy" atomar
    const ps = "/api/mc-vip/worlds/" + U1 + "/start", env3 = raced(await fresh());
    const st = await Promise.all([0, 1, 2].map((i) => vip.route(ps, web(ps, { request_id: "start-" + i }), env3, U(ps))));
    assert.equal(st.filter((r) => r.status === 202).length, 1, "parallele starts: nur einer: " + st.map((r) => r.status));
  }
  // ---- #81: Turnstile ----
  {
    const realFetch = globalThis.fetch; let host = "mc.nwebnotfound.dev";
    globalThis.fetch = async (u, init) => (String(u).includes("siteverify") ? new Response(JSON.stringify({ success: init.body.get("response") === "good", hostname: host })) : realFetch(u, init));
    try {
      const env = { ...(await fresh()), TURNSTILE_SECRET: "real-secret" }, p = "/api/mc-shop-order";
      const bb = (extra) => trade.route(p, web(p, { type: "bank_buy", item: "diamond", amount: 1, request_id: crypto.randomUUID(), ...extra }), env, U(p));
      assert.equal((await bb({})).status, 403, "bank_buy (Website) ohne Token → 403");
      assert.equal((await bb({ turnstile: "bad" })).status, 403, "falscher Token → 403");
      assert.equal((await bb({ turnstile: "good" })).status, 202, "gültiger Token → 202");
      host = "evil.example"; assert.equal((await bb({ turnstile: "good" })).status, 403, "Token für fremden Hostnamen → 403"); host = "nwebnotfound.dev";
      const so = (extra) => trade.route(p, web(p, { listing_id: "L1", qty: 1, request_id: crypto.randomUUID(), ...extra }), env, U(p));
      assert.equal((await so({})).status, 202, "Shop-Kauf ohne Widget: Token weiter optional");
      assert.equal((await so({ turnstile: "bad" })).status, 403, "mitgeschickter falscher Token wird geprüft");
      // Bot-Weg (Ingest-Token) braucht kein Captcha
      const bot = new Request("https://mc.nwebnotfound.dev" + p, { method: "POST", headers: { "x-ingest-token": "tok", "content-type": "application/json" }, body: JSON.stringify({ type: "bank_buy", item: "diamond", amount: 1, discord_id: DID }) });
      assert.equal((await trade.route(p, bot, { ...env, MC_INGEST_TOKEN: "tok" }, U(p))).status, 202, "Bot ohne Captcha → 202");
    } finally { globalThis.fetch = realFetch; }
  }
  // ---- #81: Pepper fehlt → abgeleiteter Ersatz statt still abgeschalteter IP-Limits ----
  {
    const { hashIp } = await import("../src/ip-hash.js");
    const a1 = await hashIp({ SESSION_SECRET: "s1" }, "203.0.113.1"), a2 = await hashIp({ SESSION_SECRET: "s2" }, "203.0.113.1");
    assert.ok(/^[0-9a-f]{64}$/.test(a1) && a1 !== a2, "Ersatz-Pepper aus SESSION_SECRET");
    assert.notEqual(a1, await hashIp({ IP_HASH_PEPPER: "s1" }, "203.0.113.1"), "Ersatz ist nicht SESSION_SECRET selbst");
  }
  console.log("queue-unit: alle Tests grün");
}
