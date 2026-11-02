#!/usr/bin/env node
// Reine VIP-Helfer (ohne Worker). Wird von scripts/e2e.mjs importiert und kann allein laufen.
import assert from "node:assert/strict";
import { isVipWorldKey, pickVipWorlds, vipStats, vipWorldLabel, vipCatalog, vipRankView, normU } from "../src/mc-vip.js";
import { sanitizeInfo, cleanWorlds, cleanLog } from "../src/mc-vip-cmd.js";

const worlds = {
  lobby: { online: true, players: ["Nils"], max: 20, tps: 20 },
  survival: { online: true, players: ["A"], max: 40 },
  vipers: { online: true, players: ["X"], max: 1 },
  vip_lobby: { online: true, players: ["Y"], max: 1 },
  vipwelt: { online: true, players: ["Seller", "<script>"], max: 4, tps: 19.96 },
  vip_1: { online: true, players: ["Nils", "not a name"], max: 8, tps: 20 },
  "vip-2": { online: false, players: [], max: 8, tps: 18.24 },
  vip_4: { online: true, players: ["Gast"], max: 4, tps: 20 },
};
assert.equal(isVipWorldKey("survival"), false);
assert.equal(isVipWorldKey("vipers"), false);
assert.equal(isVipWorldKey("vip_lobby"), false);
assert.equal(isVipWorldKey("vip_1"), true);
assert.equal(isVipWorldKey("VIP-2"), true);
const slots = pickVipWorlds(worlds);
assert.deepEqual(slots.map((s) => s.id), ["vipwelt", "vip_1", "vip-2"], "höchstens 3, Lobby/Survival raus, nach Nummer");
assert.equal(slots[0].players, 1, "Spielernamen außerhalb [A-Za-z0-9_] zählen nicht");
assert.equal(slots[0].label, "VIP-Welt");
assert.equal(slots[1].label, "VIP-Welt 1");
assert.equal(slots[1].players, 1);
assert.equal(slots[2].online, false);
assert.equal(slots[2].tps, 18.2);
assert.equal(slots[0].tps, 20);
assert.deepEqual(pickVipWorlds(null), []);
assert.deepEqual(pickVipWorlds({}), []);
assert.equal(pickVipWorlds({ vip: { online: true, players: [], max: null, tps: null } })[0].max, null);
assert.equal(pickVipWorlds({ vip: { online: false, players: ["ok"], tps: null } })[0].tps, null);
assert.equal(vipWorldLabel("vip_world_3"), "VIP-Welt 3");

const stats = vipStats({ cp: 900, playtime_s: 7200, deaths: 3, inventory: [{ item: "diamond_sword" }], team: "<b>", money: "nope", skin_url: "https://textures.minecraft.net/texture/abc" });
assert.deepEqual(stats, { money: 900, playtime: 7200, deaths: 3 });
assert.equal("inventory" in stats, false);
assert.deepEqual(vipStats(null), {});
assert.deepEqual(vipStats({ kills: -1, blocks_mined: 4.5 }), { blocks_mined: 4.5 });

const cat = vipCatalog("mvp");
assert.deepEqual(cat.map((c) => c.rank), ["vip", "mvp"]);
assert.equal(cat[0].yours, false);
assert.equal(cat[1].yours, true);
assert.ok(cat[0].perks.every((p) => !/[<>]/.test(p.title + p.text)));
assert.ok(cat[1].perks.some((p) => p.id === "higher"));
assert.equal(cat[0].perks.some((p) => p.id === "higher"), false);
assert.equal(cat[0].perks.find((p) => p.id === "panel").icon, "book");
assert.equal(cat[1].perks.find((p) => p.id === "higher").icon, "golden_apple");
assert.ok(cat[1].perks.find((p) => p.id === "higher").text.includes("Weitere Ingame-Vorteile folgen."));
assert.ok(!JSON.stringify(cat).includes("LuckPerms") && !JSON.stringify(cat).includes("schickt keine Befehle"));
for (const c of cat) { const ids = [c.icon, ...c.perks.map((p) => p.icon)]; assert.equal(new Set(ids).size, ids.length, c.rank); }
assert.equal(vipCatalog(null)[1].yours, false);
assert.equal(vipCatalog("admin")[0].yours, false);

assert.equal(normU("0F3C2A1B-4D5E-6F70-8192-A3B4C5D6E7F8"), "0f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f8");
assert.equal(normU("0f3c2a1b4d5e6f708192a3b4c5d6e7f8"), "0f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f8");
assert.equal(normU("nicht-uuid"), null);
assert.equal(sanitizeInfo("Hallo\n§cWelt"), "HalloWelt");
assert.equal(sanitizeInfo("A\u200bB\u202eC"), "ABC");
assert.equal(sanitizeInfo("x".repeat(200)).length, 120);
assert.equal(cleanWorlds({ id: "nope" }).error.includes("Array"), true);
assert.equal(cleanWorlds([{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", owner_uuid: "11111111-2222-3333-4444-555555555555", visibility: "public", invites: [{ name: "Steve", role: "trusted" }] }]).worlds.length, 0);
assert.equal(cleanWorlds([{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", owner_uuid: "11111111-2222-3333-4444-555555555555", info: "Hallo\n§cWelt", invites: [{ name: "Steve", role: "mod" }, { name: "Alex", role: "member" }] }]).worlds[0].info, "HalloWelt");
assert.deepEqual(cleanWorlds([{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", owner_uuid: "11111111-2222-3333-4444-555555555555" }]).worlds[0].visibility, "friends");
assert.equal(cleanLog({ action: "start" }).error.includes("Array"), true);
assert.equal(cleanLog([{ world_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", admin: "100000000000000001", owner: "11111111-2222-3333-4444-555555555555", action: "set_visibility", created_at: 10 }]).log[0].action, "set_visibility");
assert.equal(cleanLog([{ world_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", admin: "1", owner: "11111111-2222-3333-4444-555555555555", action: "start", created_at: 10 }]).log.length, 0);
assert.deepEqual(vipRankView("vip", "&6"), { rank: "vip", color: "6", label: "VIP" });
assert.deepEqual(vipRankView("MVP", "&d"), { rank: "mvp", color: "d", label: "MVP" });
assert.equal(vipRankView("admin", "&c"), null);
assert.deepEqual(vipRankView("vip", "&z"), { rank: "vip", color: "6", label: "VIP" }, "ungültige Farbe → Standard &6");
assert.deepEqual(vipRankView("mvp", ""), { rank: "mvp", color: "d", label: "MVP" }, "fehlende Farbe → Standard &d");
assert.equal(vipRankView("player", "&7"), null);

console.log("vip-unit ok");
