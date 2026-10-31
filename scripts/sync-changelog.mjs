#!/usr/bin/env node
// Build-Zeit: CHANGELOG.md aus NwebNotFound/mc-stack holen und als Modul bündeln (src/generated/changelog.js).
// Aufruf: node scripts/sync-changelog.mjs [ref]   (Standard: main; braucht `gh` mit Lesezugriff)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const ref = process.argv[2] || "main", repo = "NwebNotFound/mc-stack";
const sha = execFileSync("gh", ["api", `repos/${repo}/commits/${ref}`, "--jq", ".sha"]).toString().trim();
const full = execFileSync("gh", ["api", `repos/${repo}/contents/CHANGELOG.md?ref=${sha}`, "-H", "Accept: application/vnd.github.raw"]).toString();
// Nur den Abschnitt „## Für Spieler“ bündeln (bis zur nächsten ##-Überschrift); Admin-Teil kommt nie ins Repo.
export function playerOnly(src) {
  const L = src.split(/\r?\n/), i = L.findIndex((l) => /^##\s+.*spieler/i.test(l) && !/^###/.test(l));
  if (i < 0) throw new Error("Abschnitt 'Für Spieler' nicht gefunden");
  let j = L.findIndex((l, k) => k > i && /^##\s/.test(l)); if (j < 0) j = L.length;
  return L.slice(i, j).join("\n").trim() + "\n";
}
const md = playerOnly(full);
const out = `// AUTOMATISCH ERZEUGT von scripts/sync-changelog.mjs – nicht von Hand bearbeiten.\nexport const CHANGELOG_SRC = ${JSON.stringify({ repo, sha })};\nexport const CHANGELOG_MD = ${JSON.stringify(md)};\n`;
fs.writeFileSync(new URL("../src/generated/changelog.js", import.meta.url), out);
console.log(`Changelog ${repo}@${sha.slice(0, 7)} (${md.length} Zeichen) gebündelt`);
