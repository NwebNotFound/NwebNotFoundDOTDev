// Listet alle Item-IDs (1.21.11-Registry), die auf den Papier-Platzhalter oder ein ungenaues Icon fallen.
// Nutzung: node scripts/icon-audit.mjs [--json] [registry.json]
import { resolveIcon } from "../src/mc-icon.js";
import { readFileSync } from "node:fs";
const arg = process.argv.slice(2), json = arg.includes("--json"), file = arg.find((a) => !a.startsWith("--"));
const reg = file ? JSON.parse(readFileSync(file, "utf8"))
  : await (await fetch("https://raw.githubusercontent.com/misode/mcmeta/1.21.11-summary/registries/data.min.json")).json();
const ids = (reg.item || reg).filter((i) => i !== "air");
const base = (p) => p.slice(p.indexOf("/") + 1);
const out = { exact: [], mapped: [], approx: [], placeholder: [] };
for (const id of ids) {
  const r = resolveIcon(id);
  const p = typeof r === "string" ? r : r?.url || "";
  if (!p || (p === "item/paper" && id !== "paper")) out.placeholder.push(id);
  else if (/^https?:/.test(p) || base(p) === id || base(p).startsWith(id + "_")) out.exact.push(id);
  else if (WRONG(id, p)) out.approx.push(`${id} -> ${p}`);
  else out.mapped.push(`${id} -> ${p}`);
}
// "falsch": Familien-Ersatz (Dreizack für Speer, Ei für Spawn-Ei, Block für Kopf …)
function WRONG(id, p) {
  return /_spear$/.test(id) || /_spawn_egg$/.test(id) || /_(head|skull)$/.test(id) || p === "item/egg" && id !== "egg" || p === "block/stone" && !/stone/.test(id);
}
if (json) console.log(JSON.stringify(out, null, 1));
else { for (const k of Object.keys(out)) console.log(`${k}: ${out[k].length}`); console.log("\nPLATZHALTER:\n" + out.placeholder.join("\n") + "\n\nFALSCH:\n" + out.approx.join("\n")); }
process.exitCode = 0;
