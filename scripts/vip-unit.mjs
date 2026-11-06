#!/usr/bin/env node
// Reine VIP-Helfer (ohne Worker). Wird von scripts/e2e.mjs importiert und kann allein laufen.
import assert from "node:assert/strict";
import { isVipWorldKey, pickVipWorlds, vipStats, vipWorldLabel, vipCatalog, vipRankView, normU, WORLD_LIMITS, worldLimit } from "../src/mc-vip.js";
import { sanitizeInfo, cleanWorlds, cleanLog, cleanSettings, ACTIONS, SYNC_MAX_BYTES } from "../src/mc-vip-cmd.js";
import { WORLD_DEFAULTS } from "../src/mc-vip.js";

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
assert.equal(pickVipWorlds(worlds, Infinity).length, 4, "Admin: alle VIP-Welten ohne 3er-Limit");
assert.deepEqual(pickVipWorlds(worlds, Infinity).map((s) => s.id), ["vipwelt", "vip_1", "vip-2", "vip_4"]);
assert.equal(pickVipWorlds(worlds, 1).length, 1, "Limit gilt weiter für die Übersicht");
assert.equal(pickVipWorlds(worlds, 0).length, 3, "0 fällt auf den Standard zurück");
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
assert.deepEqual(vipCatalog("admin").map((c) => c.rank), ["vip", "mvp", "admin"], "Admin-Katalog enthält alle Ränge");
assert.equal(vipCatalog("admin")[2].yours, true);
assert.equal(vipCatalog("admin")[2].label, "Admin");
assert.equal(vipCatalog("admin")[2].color, "c");
assert.equal(vipCatalog("vip").length, 2, "VIP sieht nur VIP und MVP");
assert.equal(vipCatalog("builder").length, 2, "Builder sieht die Übersicht ohne eigene Karte");
for (const c of vipCatalog("admin")) { const ids = [c.icon, ...c.perks.map((p) => p.icon)]; assert.equal(new Set(ids).size, ids.length, "Admin-Karte " + c.rank); }

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
{ // Sync-Grenze laut Vertrag 500 (vorher 30): 31 Welten kommen vollständig an, 501 werden abgelehnt.
  const many = (n) => Array.from({ length: n }, (_, i) => ({ ...CW, id: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}` }));
  assert.equal(cleanWorlds(many(31)).worlds.length, 31, "31 Welten vollständig");
  assert.equal(cleanWorlds(many(500)).worlds.length, 500, "500 Welten vollständig");
  assert.equal(cleanWorlds(many(501)).error, "höchstens 500 Welten", "501 abgelehnt statt gekürzt");
  // D1: ein Wert höchstens 2.000.000 Bytes. Gemessen in UTF-8-Bytes, mit den Vertragsgrenzen:
  // 32 Einladungen (cleanInvites), 120 Zeichen Name/Info (sanitizeInfo), Mehrbyte-Text.
  const bytesOf = (r) => new TextEncoder().encode(JSON.stringify(r.worlds)).length;
  const inv = (n) => Array.from({ length: n }, (_, i) => ({ uuid: `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`, name: "Player_Name_" + String(i).padStart(4, "0"), role: "trusted", added_at: 1793503000000 }));
  const big = (n, o) => many(n).map((w) => ({ ...w, owner_name: "NwebNotFound_123", slot: "vipworld-12", addons: ["keep-inventory", "peaceful", "creative"], ...o }));
  const full = cleanWorlds(big(500, { name: "世".repeat(120), info: "界".repeat(120), invites: inv(40) }));
  assert.ok(full.error && full.error.startsWith("vip_worlds zu groß"), "Vertrags-Maximum (≈2,5 MB) wird ganz abgelehnt, nicht gekürzt: " + (full.error || ""));
  const real = cleanWorlds(big(500, { name: "W".repeat(24), invites: inv(12) }));
  assert.equal(real.worlds?.length, 500, "500 Welten mit 12 Mitgliedern (Web-Limit) und Plugin-Namen passen");
  assert.ok(bytesOf(real) <= SYNC_MAX_BYTES && bytesOf(real) < 2_000_000, "unter der D1-Grenze: " + bytesOf(real));
  const mb = cleanWorlds(big(120, { name: "世".repeat(120), info: "界".repeat(120), invites: inv(32) }));
  assert.equal(mb.worlds?.length, 120, "Mehrbyte-Namen und 32 Einladungen: 120 Welten passen");
  assert.ok(bytesOf(mb) > JSON.stringify(mb.worlds).length * 1.1, "Mehrbyte-Text zählt als UTF-8-Bytes, nicht als Zeichen");
  assert.equal(mb.worlds[0].invites.length, 32, "32 Einladungen behalten");
}
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
assert.deepEqual(vipRankView("admin", "&c"), { rank: "admin", color: "c", label: "Admin" }, "Admin hat ein Panel");
assert.deepEqual(vipRankView("admin", ""), { rank: "admin", color: "c", label: "Admin" }, "Admin ohne Farbe → Standard &c");
assert.deepEqual(vipRankView("builder", "&a"), null, "Builder bleibt ohne Panel");
assert.deepEqual(vipRankView("vip", "&z"), { rank: "vip", color: "6", label: "VIP" }, "ungültige Farbe → Standard &6");
assert.deepEqual(vipRankView("mvp", ""), { rank: "mvp", color: "d", label: "MVP" }, "fehlende Farbe → Standard &d");
assert.equal(vipRankView("player", "&7"), null);

// Welt-Limits laut Nils, 04.11.2026: VIP 1 eigene Welt, MVP 3. Einzige Quelle ist WORLD_LIMITS.
// Der Fallback für einen unbekannten Rang ist der KLEINSTE Wert (VIP), nicht MVP: ein neuer oder
// umbenannter Rang im Plugin darf nicht stillschweigend zwei Welten zu viel bekommen. Deshalb steht
// der Admin (der alle Welten sieht, Zähler 3) ausdrücklich in der Tabelle statt im Fallback.
assert.deepEqual(WORLD_LIMITS, { vip: 1, mvp: 3, admin: 3 }, "Welt-Limits VIP 1 / MVP 3 / Admin 3");
assert.equal(worldLimit("vip"), 1);
assert.equal(worldLimit("MVP"), 3, "Rang-Schreibweise egal");
assert.equal(worldLimit("admin"), 3, "Admin sieht alle Welten, Zähler bleibt bei 3");
assert.equal(worldLimit(null), 1, "ohne Rang gilt das VIP-Limit");
assert.equal(worldLimit(""), 1, "leerer Rang gilt als unbekannt");
assert.equal(worldLimit("builder"), 1, "unbekannter Rang → VIP-Limit, nie MVP");
assert.equal(worldLimit("vip2"), 1, "neuer Rang → VIP-Limit");
assert.ok(cat[0].perks.find((p) => p.id === "worlds").title.includes("Eine eigene Welt"), "VIP-Karte nennt eine Welt");
assert.ok(cat[1].perks.find((p) => p.id === "worlds").title.includes("3 eigene Welten"), "MVP-Karte nennt drei Welten");
assert.ok(!JSON.stringify(cat).includes("Addon"), "keine Addon-Versprechen (Feature kommt später)");

// Panel v2: Weltregeln und neue Aktionen. Nur die sechs Regeln aus dem Vertrag, Teil-Updates erlaubt.
assert.deepEqual(ACTIONS, ["create", "rename", "start", "stop", "settings", "set_visibility", "invite", "uninvite", "trust", "delete"], "Panel v2 ops");
assert.deepEqual(cleanSettings({ pvp: true }), { settings: { pvp: true } }, "Teil-Update bleibt Teil-Update");
assert.deepEqual(cleanSettings({ gamemode: "creative", difficulty: "hard" }).settings, { gamemode: "creative", difficulty: "hard" });
assert.equal(cleanSettings({ weather: "rain" }).error.includes("weather"), true, "unbekannter Schlüssel ist ein Fehler");
assert.equal(cleanSettings({ pvp: "yes" }).error.includes("pvp"), true, "Bool muss Bool sein");
assert.equal(cleanSettings({ gamemode: "hardcore" }).error.includes("gamemode"), true, "nur erlaubte Spielmodi");
assert.equal(cleanSettings({ difficulty: "nightmare" }).error, "ungültiger Wert für difficulty");
assert.equal(cleanSettings(null).error.length > 0, true);
assert.equal(cleanSettings([[]]).error.length > 0, true, "Array ist kein Objekt");
assert.deepEqual(cleanSettings({}), { settings: {} }, "leer wird vom Aufrufer abgelehnt, nicht hier");
// Der Sync darf settings weglassen; dann gelten im Panel die Vertrags-Defaults.
assert.deepEqual(WORLD_DEFAULTS, { gamemode: "survival", difficulty: "normal", pvp: false, keepInventory: false, mobGriefing: true, doDaylightCycle: true });
assert.equal(cleanWorlds([{ ...CW, settings: { pvp: true } }]).worlds[0].settings.pvp, true);
assert.equal(cleanWorlds([{ ...CW, settings: { pvp: true } }]).worlds[0].settings.gamemode, undefined, "Sync speichert nur die gesendeten Regeln");
// Der Sync verwirft nur, was er nicht kennt; die Welt bleibt sichtbar (strenge Ablehnung nur im Browser-Pfad).
assert.equal(cleanWorlds([{ ...CW, settings: { weather: "rain" } }]).worlds.length, 1, "unbekannter Schlüssel wirft die Welt nicht raus");
assert.deepEqual(cleanWorlds([{ ...CW, settings: { weather: "rain", gamemode: "creative" } }]).worlds[0].settings, { gamemode: "creative" }, "nur die sechs Regeln bleiben");
assert.equal(cleanWorlds([{ ...CW, settings: { pvp: 1 } }]).worlds.length, 1, "falscher Wert wirft die Welt nicht raus");
assert.equal(cleanWorlds([{ ...CW, settings: { pvp: 1 } }]).worlds[0].settings.pvp, undefined, "falscher Wert fällt weg");
assert.equal(cleanWorlds([{ ...CW }]).worlds[0].settings, null, "ohne settings bleibt null (Defaults im Panel)");

// HTML pattern attributes compile with the regex v flag: an unescaped "-" in a class is an error and
// the browser then ignores the check. Every pattern in vip.js must compile with "v" (create, rename, member).
import { readFileSync } from "node:fs";
const vipJs = readFileSync(new URL("../public/mc/vip.js", import.meta.url), "utf8");
const pats = [...vipJs.matchAll(/pattern="([^"]+)"/g)].map((m) => new Function("return `" + m[1] + "`")());  // as the template literal renders it (\- -> \-)
assert.ok(pats.length >= 3, "vip.js pattern attributes found");
for (const p of pats) assert.doesNotThrow(() => new RegExp(`^(?:${p})$`, "v"), "pattern compiles with the v flag: " + p);
const nameRe = new RegExp(`^(?:${pats.find((p) => p.includes("{3,24}"))})$`, "v");
for (const ok of ["abc", "My-World_1", "a".repeat(24)]) assert.ok(nameRe.test(ok), "name accepted: " + ok);
for (const bad of ["ab", "bad name", "a".repeat(25), "wel!t"]) assert.ok(!nameRe.test(bad), "name rejected: " + bad);

console.log("vip-unit ok");
