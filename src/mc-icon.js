import { TEX_BLOCK, TEX_ITEM } from "./mc-textures.js";
import { NEW_BASE, NEW_BLOCK, NEW_ITEM } from "./mc-textures-new.js";
export const TEX_BASE = "https://cdn.jsdelivr.net/gh/InventivetalentDev/minecraft-assets@1.21.11/assets/minecraft/textures/";
// IDs, deren Texturname abweicht
const ALIAS = {
  grass_block: "block/grass_block_side", water: "block/water_still", lava: "block/lava_still", water_bucket: "item/water_bucket",
  short_grass: "block/short_grass", tall_grass: "block/tall_grass_top", sunflower: "block/sunflower_front", lilac: "block/lilac_top",
  rose_bush: "block/rose_bush_top", peony: "block/peony_top", large_fern: "block/large_fern_top", fire: "block/fire_0", soul_fire: "block/soul_fire_0",
  crafting_table: "block/crafting_table_front", furnace: "block/furnace_front", blast_furnace: "block/blast_furnace_front", smoker: "block/smoker_front",
  tnt: "block/tnt_side", bookshelf: "block/bookshelf", chest: "block/barrel_side", trapped_chest: "block/barrel_side", ender_chest: "block/obsidian",
  snow_block: "block/snow", snow: "item/snowball", podzol: "block/podzol_side", mycelium: "block/mycelium_side", dirt_path: "block/dirt_path_side",
  farmland: "block/farmland", melon: "block/melon_side", pumpkin: "block/pumpkin_side", carved_pumpkin: "block/carved_pumpkin", jack_o_lantern: "block/jack_o_lantern",
  hay_block: "block/hay_block_side", bone_block: "block/bone_block_side", quartz_block: "block/quartz_block_side", smooth_quartz: "block/quartz_block_bottom",
  smooth_stone: "block/smooth_stone", smooth_sandstone: "block/sandstone_top", smooth_red_sandstone: "block/red_sandstone_top",
  sandstone: "block/sandstone", red_sandstone: "block/red_sandstone", cut_sandstone: "block/cut_sandstone", magma_block: "block/magma",
  wheat: "item/wheat", carrots: "item/carrot", potatoes: "item/potato", beetroots: "item/beetroot", sweet_berry_bush: "item/sweet_berries", cocoa: "item/cocoa_beans",
  redstone_wire: "item/redstone", tripwire: "item/string", bamboo_block: "block/bamboo_block", cave_vines: "item/glow_berries", cave_vines_plant: "item/glow_berries",
  kelp_plant: "item/kelp", seagrass: "block/seagrass", tall_seagrass: "block/tall_seagrass_top", nether_portal: "block/nether_portal", end_portal_frame: "block/end_portal_frame_side",
  enchanting_table: "block/enchanting_table_top", anvil: "block/anvil_top", chipped_anvil: "block/chipped_anvil_top", damaged_anvil: "block/damaged_anvil_top",
  barrel: "block/barrel_side", composter: "block/composter_side", beehive: "block/beehive_front", bee_nest: "block/bee_nest_front", target: "block/target_side",
  observer: "block/observer_front", dispenser: "block/dispenser_front", dropper: "block/dropper_front", piston: "block/piston_side", sticky_piston: "block/piston_side",
  loom: "block/loom_front", cartography_table: "block/cartography_table_side3", fletching_table: "block/fletching_table_front", smithing_table: "block/smithing_table_front",
  stonecutter: "block/stonecutter_saw", grindstone: "block/grindstone_side", lectern: "block/lectern_front", jukebox: "block/jukebox_side", note_block: "block/note_block",
  respawn_anchor: "block/respawn_anchor_side4", lodestone: "block/lodestone_side", beacon: "block/beacon", conduit: "block/conduit", spawner: "block/spawner",
  deepslate: "block/deepslate", basalt: "block/basalt_side", polished_basalt: "block/polished_basalt_side", ancient_debris: "block/ancient_debris_side",
  crimson_nylium: "block/crimson_nylium_side", warped_nylium: "block/warped_nylium_side", sculk_sensor: "block/sculk_sensor_side", sculk_catalyst: "block/sculk_catalyst_side",
  sculk_shrieker: "block/sculk_shrieker_side", reinforced_deepslate: "block/reinforced_deepslate_side", dried_kelp_block: "block/dried_kelp_side",
  crossbow: "item/crossbow_standby", decorated_pot: "item/brick", dried_ghast: "block/dried_ghast_hydration_0_north", moss_carpet: "block/moss_block", pale_moss_carpet: "block/pale_moss_block",
  heavy_weighted_pressure_plate: "block/iron_block", light_weighted_pressure_plate: "block/gold_block", shield: "block/spruce_planks", test_block: "block/test_block_start",
  copper_chest: "block/copper_block", exposed_copper_chest: "block/exposed_copper", weathered_copper_chest: "block/weathered_copper", oxidized_copper_chest: "block/oxidized_copper",
  air: null, cave_air: null, void_air: null,
};
const MAT = { brick: "bricks", stone_brick: "stone_bricks", nether_brick: "nether_bricks", red_nether_brick: "red_nether_bricks", mud_brick: "mud_bricks",
  end_stone_brick: "end_stone_bricks", deepslate_brick: "deepslate_bricks", deepslate_tile: "deepslate_tiles", polished_blackstone_brick: "polished_blackstone_bricks",
  prismarine_brick: "prismarine_bricks", tuff_brick: "tuff_bricks", quartz: "quartz_block_side", purpur: "purpur_block", smooth_quartz: "quartz_block_bottom",
  smooth_sandstone: "sandstone_top", smooth_red_sandstone: "red_sandstone_top", petrified_oak: "oak_planks", bamboo_mosaic: "bamboo_mosaic", cut_copper: "cut_copper" };
const WOODS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "bamboo", "crimson", "warped", "pale_oak", "poplar"];
const inOld = (p) => (p.startsWith("block/") ? TEX_BLOCK : TEX_ITEM).has(p.slice(p.indexOf("/") + 1));
const isNew = (p) => (p.startsWith("block/") ? NEW_BLOCK : NEW_ITEM).has(p.slice(p.indexOf("/") + 1));
const has = (p) => (p.startsWith("block/") ? TEX_BLOCK : TEX_ITEM).has(p.slice(p.indexOf("/") + 1)) || isNew(p);
// Texturen, die nur in der neueren Version existieren (26.x): selbst gehostet unter /mc/icons/tex/ (aus misode/mcmeta)
const abs = (r) => (typeof r === "string" && !/^(https:|\/)/.test(r) && isNew(r) && !inOld(r) ? NEW_BASE + r + ".png" : r);
const first = (...c) => c.find((p) => p && has(p)) || null;
// Ergebnis-Cache pro Isolate, hart begrenzt: sonst wächst er mit jeder neuen (auch erfundenen) ID
// bis zum Speicherende des Isolates. Bei vollem Cache fliegt der älteste Eintrag (Map hält die
// Einfügereihenfolge, ein Treffer wird ans Ende umgehängt → LRU).
const cache = new Map(), CACHE_MAX = 4096;
export const iconCacheSize = () => cache.size;
export const ICON_ID_RE = /^[a-z0-9_]{1,48}$/;
// Mob-/Spielerköpfe haben keine Item-Textur (3D-Modell aus Entity-Skin) -> isometrischer Kopf über mc-heads (MHF_-Skins)
export const HEAD_URL = "https://mc-heads.net/head/";
const HEADS = { zombie: "MHF_Zombie", skeleton: "MHF_Skeleton", wither_skeleton: "MHF_WSkeleton", creeper: "MHF_Creeper", piglin: "MHF_Piglin", dragon: "MHF_Enderdragon", ender_dragon: "MHF_Enderdragon", player: "MHF_Steve" };
export function resolveIcon(raw) {
  const id = String(raw || "").toLowerCase().replace(/^minecraft:/, "").replace(/[^a-z0-9_]/g, "");
  if (!id) return null;
  if (id.length > 48) return abs(FALLBACK); // keine echte Item-ID; Regex-Kaskade und Cache nicht bemühen
  if (cache.has(id)) { const r = cache.get(id); cache.delete(id); cache.set(id, r); return r; }
  const r = /^(cave_|void_)?air$/.test(id) ? null : abs(resolve(id, 0) || FALLBACK);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(id, r); return r;
}
function resolve(id, depth) {
  if (depth > 3) return null;
  if (id in ALIAS) return ALIAS[id] && has(ALIAS[id]) ? ALIAS[id] : null;
  const direct = first(`item/${id}`, `block/${id}`, `block/${id}_front`, `block/${id}_side`, `block/${id}_top`, `block/${id}_0`, `block/${id}_stage0`, `block/${id}_still`, `item/${id}_00`);
  if (direct) return direct;
  let m;
  if ((m = id.match(/^(waxed_)(.+)$/))) return resolve(m[2], depth + 1);
  if ((m = id.match(/^(.+?)_?wall_(torch|sign|hanging_sign|banner|head|skull|fan)$/))) return resolve(`${m[1]}_${m[2]}`.replace(/^_/, ""), depth + 1);
  if ((m = id.match(/^(soul_|redstone_)?wall_torch$/))) return resolve(`${m[1] || ""}torch`, depth + 1);
  if ((m = id.match(/^potted_(.+)$/))) return resolve(m[1], depth + 1);
  if ((m = id.match(/^(.+)_(slab|stairs|wall|pressure_plate|button)$/))) {
    const b = m[1], w = WOODS.find((x) => b === x);
    return first(w && `block/${w}_planks`, MAT[b] && `block/${MAT[b]}`, `block/${b}`, `block/${b}s`, `block/${b}_block`, `block/${b}_planks`, `block/${b}_top`) || resolve(b.replace(/_(brick|tile)$/, ""), depth + 1);
  }
  if ((m = id.match(/^(.+)_(fence_gate|fence)$/))) { const w = WOODS.find((x) => m[1] === x); return first(w && `block/${w}_planks`, `block/${m[1]}`, `block/${m[1]}s`); }
  if ((m = id.match(/^(.+)_wood$/))) return first(`block/${m[1]}_log`);
  if ((m = id.match(/^(.+)_hyphae$/))) return first(`block/${m[1]}_stem`);
  if ((m = id.match(/^(.+)_(carpet)$/))) return first(`block/${m[1]}_wool`, `block/${m[1]}`);
  if ((m = id.match(/^(.+)_bed$/))) return first(`block/${m[1]}_wool`);
  if ((m = id.match(/^(.+)_(shulker_box)$/))) return first(`block/${m[1]}_shulker_box`, "block/shulker_box");
  if ((m = id.match(/^(.+)_(banner)$/))) return first(`block/${m[1]}_wool`);
  if ((m = id.match(/^(.+)_concrete_powder$/))) return first(`block/${m[1]}_concrete_powder`);
  if ((m = id.match(/^(.+?)_?(wall_)?(head|skull)$/)) && HEADS[m[1]]) return HEAD_URL + HEADS[m[1]] + "/64";
  if (id === "player_head" || id === "player_wall_head") return HEAD_URL + "MHF_Steve/64";
  if ((m = id.match(/^(.+)_(crop|stem|plant)$/))) return resolve(m[1], depth + 1);
  if ((m = id.match(/^(.+)_spawn_egg$/))) return first(`item/${id}`, "item/spawn_egg", "item/egg");
  if (id.endsWith("s") && depth < 2) { const r = resolve(id.slice(0, -1), depth + 1); if (r) return r; }
  return family(id) || (depth === 0 ? tokens(id) || FALLBACK : null);
}
// Item-Familien (neue/seltene IDs) auf ein passendes Vanilla-Icon abbilden
const FAM = [
  [/_map$|^map_/, ["item/filled_map", "item/map"]], [/_pottery_sherd$/, ["item/brick"]], [/_smithing_template$/, ["item/netherite_upgrade_smithing_template", "item/paper"]],
  [/_banner_pattern$/, ["item/flower_banner_pattern", "item/paper"]], [/^music_disc_/, ["item/music_disc_13", "item/music_disc_cat"]], [/^disc_fragment/, ["item/disc_fragment_5"]],
  [/_bundle$/, ["item/bundle"]], [/_harness$/, ["item/saddle", "item/lead"]], [/_egg$/, ["item/egg"]], [/_bucket$/, ["item/water_bucket", "item/bucket"]],
  [/_nautilus_armor$|_horse_armor$/, ["item/iron_horse_armor", "item/leather_horse_armor"]], [/_spear$/, ["item/iron_spear", "item/wooden_spear"]], [/_golem_statue$/, ["block/copper_block"]],
  [/_raft$/, ["item/bamboo_raft", "item/oak_boat"]], [/_boat$/, ["item/oak_boat"]], [/_shelf$/, ["block/oak_planks"]], [/_bars$/, ["block/iron_bars"]], [/_chain$/, ["item/chain", "block/chain"]],
  [/_lantern$/, ["item/lantern", "block/lantern"]], [/_torch$/, ["block/torch"]], [/_ore$/, ["block/stone"]], [/_coral(_block|_fan)?$/, ["block/tube_coral_block"]],
  [/potion|tipped_arrow/, ["item/potion", "item/glass_bottle"]], [/_sign$/, ["item/oak_sign"]], [/_door$/, ["item/oak_door"]], [/_trapdoor$/, ["block/oak_trapdoor"]],
  [/_leaves$/, ["block/oak_leaves"]], [/_sapling$/, ["block/oak_sapling"]], [/_candle$/, ["item/candle"]], [/_dye$/, ["item/white_dye"]], [/_glass(_pane)?$/, ["block/glass"]],
  [/_terracotta$/, ["block/terracotta"]], [/_concrete$/, ["block/white_concrete"]], [/_wool$/, ["block/white_wool"]], [/_cushion$/, ["block/white_wool"]], [/^chiseled_|^cut_|^polished_|^cracked_|^smooth_|^mossy_/, []],
];
function family(id) {
  for (const [re, c] of FAM) if (re.test(id)) { const r = first(...c); if (r) return r; }
  const m = id.match(/^(.+?)_(.+)$/); if (m && /_(axe|pickaxe|shovel|hoe|sword|helmet|chestplate|leggings|boots)$/.test(id)) return first(`item/iron_${id.split("_").pop()}`);
  return null;
}
// Letzter Ausweg: einzelne Wortteile (z. B. chiseled_cinnabar -> cinnabar -> stone)
function tokens(id) { const t = id.split("_"); for (let i = 1; i < t.length; i++) { const r = resolve(t.slice(i).join("_"), 2); if (r) return r; } for (let i = t.length - 1; i > 0; i--) { const r = resolve(t.slice(0, i).join("_"), 2); if (r) return r; } return null; }
const FALLBACK = "item/paper";
