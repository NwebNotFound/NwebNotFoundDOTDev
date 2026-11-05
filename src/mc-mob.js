import { resolveIcon } from "./mc-icon.js";
// Mob-Köpfe: Gesichter aus den Vanilla-Entity-Texturen (scripts/gen-heads.py), selbst gehostet unter /mc/heads/.
// Ohne eigenen Kopf: Spawn-Ei; Nicht-Mob-Todesursachen: passendes Item.
const HEADS = new Set("blaze cave_spider chicken cow creeper drowned enderman ghast husk iron_golem pig piglin piglin_brute pillager sheep skeleton slime spider stray villager vindicator witch wither_skeleton wolf zombie zombie_villager zombified_piglin".split(" "));
const CAUSE_ICON = { fall: "feather", lava: "lava_bucket", fire: "flint_and_steel", fire_tick: "flint_and_steel", on_fire: "flint_and_steel", drowning: "water_bucket", drown: "water_bucket", starve: "rotten_flesh", starvation: "rotten_flesh", void: "ender_eye", suffocation: "gravel", explosion: "tnt", block_explosion: "tnt", entity_explosion: "tnt", projectile: "arrow", magic: "splash_potion", freeze: "powder_snow_bucket", lightning: "lightning_rod", contact: "cactus", player: "iron_sword", wither: "wither_skeleton_skull", ender_dragon: "dragon_head", sonstige: "bone", poison: "spider_eye", hot_floor: "magma_block", cramming: "piston", fly_into_wall: "elytra", thorns: "rose_bush", sonic_boom: "echo_shard", falling_block: "anvil", dragon_breath: "dragon_breath" };
export function mobIcon(k) {
  k = String(k || "").toLowerCase().replace(/^minecraft:/, "");
  if (!/^[a-z0-9_]{1,48}$/.test(k)) return "/mc-icon/v2/bone";
  if (HEADS.has(k)) return "/mc/heads/" + k + ".png";
  if (CAUSE_ICON[k]) return "/mc-icon/v2/" + CAUSE_ICON[k];
  if (resolveIcon(k + "_spawn_egg")) return "/mc-icon/v2/" + k + "_spawn_egg";
  return "/mc-icon/v2/bone";
}
