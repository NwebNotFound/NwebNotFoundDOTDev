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
assert.equal(sanitizeInfo("§xRot§"), "Rot", "§ plus jedes folgende Zeichen, auch am Ende");
assert.equal(sanitizeInfo("  Insel  "), "Insel", "trim");
assert.equal(sanitizeInfo("A\u200bB\u202eC"), "ABC");
assert.equal(sanitizeInfo("x".repeat(200)).length, 120);
assert.equal(sanitizeInfo("x".repeat(200) + "  ").length, 120, "erst trim, dann kürzen");
// Payloads wörtlich aus docs/vip-api.md (mc-stack 956683c).
const CW = {
  id: "7f1e0000-0000-4000-8000-000000000010", owner_uuid: "1b2c3d4e-0000-4000-8000-000000000001", owner_name: "Nils",
  name: "Insel", type: "normal", status: "running", visibility: "friends", slot: "vipworld-2", player_limit: 10, players: 2,
  invites: [{ uuid: "aaaaaaaa-0000-4000-8000-0000000000aa", name: "Steve", role: "trusted", added_at: 1793503000000 }, { uuid: "bbbbbbbb-0000-4000-8000-0000000000bb", name: null, role: "member", added_at: 1793503000001 }],
  addons: ["keep-inventory"], created_at: 1793500000000, last_started_at: 1793501000000,
};
const CL = { at: 1793504000000, admin_uuid: "cccccccc-0000-4000-8000-0000000000cc", admin_name: "Nils", owner_uuid: "1b2c3d4e-0000-4000-8000-000000000001", owner_name: "Ada", world_id: "7f1e0000-0000-4000-8000-000000000010", action: "set_visibility", detail: "private" };
assert.equal(cleanWorlds({ id: "nope" }).error.includes("Array"), true);
assert.equal(cleanWorlds([{ ...CW, visibility: "public" }]).worlds.length, 0, "visibility public raus");
const cw = cleanWorlds([CW]).worlds[0];
assert.equal(cw.name, "Insel");
assert.equal(cw.status, "running");
assert.equal(cw.slot, "vipworld-2");
assert.equal(cw.player_limit, 10);
assert.equal(cw.players, 2);
assert.equal(cw.type, "normal");
assert.deepEqual(cw.addons, ["keep-inventory"]);
assert.equal(cw.created_at, 1793500000000);
assert.equal(cw.last_started_at, 1793501000000);
assert.equal(cw.visibility, "friends");
assert.equal(cw.invites.length, 2, "Invite mit name null und uuid bleibt");
assert.equal(cw.invites[0].uuid, "aaaaaaaa-0000-4000-8000-0000000000aa");
assert.equal(cw.invites[0].role, "trusted");
assert.equal(cw.invites[0].added_at, 1793503000000);
assert.equal(cw.invites[1].name, null);
assert.equal(cw.invites[1].role, "member");
assert.equal(cleanWorlds([{ ...CW, status: "quatsch" }]).worlds[0].status, "stopped", "unbekannter Status → stopped");
assert.equal(cleanWorlds([{ ...CW, invites: [{ name: "Steve" }] }]).worlds[0].invites[0].role, "member", "role Default member");
assert.equal(cleanWorlds([{ ...CW, invites: [{ name: "Steve", role: "mod" }] }]).worlds[0].invites[0].role, "member", "unbekannte Rolle → member");
assert.equal(cleanWorlds([{ ...CW, invites: [{ name: "Steve" }, { name: "Steve" }] }]).worlds[0].invites.length, 1, "Dedupe per Name");
assert.equal(cleanWorlds([{ ...CW, invites: [{ uuid: "aaaaaaaa-0000-4000-8000-0000000000aa" }, { uuid: "aaaaaaaa-0000-4000-8000-0000000000aa" }] }]).worlds[0].invites.length, 1, "Dedupe per UUID");
assert.equal(cleanWorlds([{ ...CW, invites: [{ name: "Nils", role: "trusted" }] }]).worlds[0].invites.length, 0, "Owner steht nicht in invites");
assert.equal(cleanWorlds([{ ...CW, name: "  §xInsel §" }]).worlds[0].name, "Insel");
assert.equal(cleanWorlds([{ ...CW, info: "Hallo\n§cWelt" }]).worlds[0].info, "HalloWelt");
assert.equal(cleanWorlds([{ ...CW, owner_uuid: "11111111-2222-3333-4444-555555555555" }]).worlds[0].visibility, "friends", "Default friends");
assert.equal(cleanLog({ action: "start" }).error.includes("Array"), true);
const cl = cleanLog([CL]).log[0];
assert.equal(cl.at, 1793504000000);
assert.equal(cl.admin_uuid, "cccccccc-0000-4000-8000-0000000000cc");
assert.equal(cl.admin_name, "Nils");
assert.equal(cl.owner_uuid, "1b2c3d4e-0000-4000-8000-000000000001");
assert.equal(cl.owner_name, "Ada");
assert.equal(cl.action, "set_visibility");
assert.equal(cl.detail, "private");
assert.equal(cleanLog([{ ...CL, action: "delete" }]).log.length, 1, "delete ist eine Vertrags-Aktion");
assert.equal(cleanLog([{ ...CL, action: "explode" }]).log.length, 0, "unbekannte Aktion raus");
assert.equal(cleanLog([{ world_id: CL.world_id, admin: "100000000000000001", owner: CL.owner_uuid, action: "start", created_at: 1793504000000 }]).log.length, 0, "alte Felder admin/owner/created_at werden verworfen");
assert.deepEqual(vipRankView("vip", "&6"), { rank: "vip", color: "6", label: "VIP" });
assert.deepEqual(vipRankView("MVP", "&d"), { rank: "mvp", color: "d", label: "MVP" });
assert.equal(vipRankView("admin", "&c"), null);
assert.deepEqual(vipRankView("vip", "&z"), { rank: "vip", color: "6", label: "VIP" }, "ungültige Farbe → Standard &6");
assert.deepEqual(vipRankView("mvp", ""), { rank: "mvp", color: "d", label: "MVP" }, "fehlende Farbe → Standard &d");
assert.equal(vipRankView("player", "&7"), null);

console.log("vip-unit ok");
