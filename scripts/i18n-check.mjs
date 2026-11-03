#!/usr/bin/env node
// Gate: the hub interface messages stay complete in both languages (docs/creative-hub-plan.md §8
// "Languages", DESIGN.md §11). Interface text only — content translation is a later phase.
//
//   node scripts/i18n-check.mjs
//
// Fails the run when
//   - a key exists in one message file but not in the other (a missing key would silently fall back
//     to the other language at render time, which is why this has to be caught here),
//   - a value is empty, equals its key or keeps surrounding whitespace,
//   - the `{placeholder}` set of a key differs between the two languages,
//   - a key used by src/hub.js is missing in either language (typos in `t("…")` are found here).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MESSAGES, LANGS, LANGS as ALL_LANGS, missingKeys, makeT } from "../src/i18n/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];
const note = (msg) => fail.push(msg);

/* ---- 1. key parity ---------------------------------------------------------------- */
const missing = missingKeys();
for (const lang of LANGS) for (const key of missing[lang]) note(`${lang}: key "${key}" is missing (exists in the other language)`);

/* ---- 2. value hygiene ------------------------------------------------------------- */
for (const lang of LANGS) {
  for (const [key, value] of Object.entries(MESSAGES[lang])) {
    if (typeof value !== "string") { note(`${lang}: "${key}" is not a string`); continue; }
    if (!value.trim()) note(`${lang}: "${key}" is empty`);
    if (value !== value.trim()) note(`${lang}: "${key}" has surrounding whitespace`);
    if (value === key) note(`${lang}: "${key}" only repeats its key`);
    if (value.length > 400) note(`${lang}: "${key}" is longer than a label should be (${value.length})`);
  }
}

/* ---- 3. placeholder parity -------------------------------------------------------- */
const placeholders = (value) => [...String(value).matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).sort().join(",");
for (const key of Object.keys(MESSAGES.de)) {
  if (!(key in MESSAGES.en)) continue;
  const a = placeholders(MESSAGES.de[key]), b = placeholders(MESSAGES.en[key]);
  if (a !== b) note(`"${key}": placeholders differ (de: {${a}} en: {${b}})`);
}

/* ---- 4. keys the shell actually uses ---------------------------------------------- */
const hubSrc = readFileSync(path.join(ROOT, "src/hub.js"), "utf8");
const used = new Set();
for (const m of hubSrc.matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(m[1]);
// Template keys: the shell asks per language and per still-empty section.
for (const lang of ALL_LANGS) { used.add(`lang.${lang}`); used.add(`lang.${lang}.short`); }
const SOON_SECTIONS = ["music", "writing", "reviews"];
for (const section of SOON_SECTIONS) { used.add(`nav.${section}`); used.add(`soon.${section}_text`); }
if (!used.size) note("src/hub.js uses no t() key at all — the extractor or the shell changed");
for (const key of [...used].sort()) {
  for (const lang of LANGS) if (!(key in MESSAGES[lang])) note(`${lang}: src/hub.js uses "${key}", which the message file does not define`);
}
// And the other direction: every key must be wanted by at least one of the two files' consumers
// (nav/footer/tiles/meta). Kept as a warning-only signal — unused keys are not an error.
const unused = Object.keys(MESSAGES.de).filter((k) => !used.has(k));
if (unused.length) console.log(`i18n: ${unused.length} key(s) not referenced literally in src/hub.js (fine if used elsewhere): ${unused.join(", ")}`);

/* ---- 5. t() really resolves ------------------------------------------------------- */
for (const lang of LANGS) {
  const t = makeT(lang);
  for (const key of used) {
    if (!(key in MESSAGES[lang])) continue; // already reported above
    const value = t(key);
    if (value === key) note(`${lang}: t("${key}") rendered the key itself`);
    if (!placeholders(MESSAGES[lang][key]) && /\{\w+\}/.test(value)) note(`${lang}: t("${key}") left a placeholder behind`);
  }
}

if (fail.length) {
  console.error(`i18n check failed (${fail.length}):`);
  for (const msg of fail) console.error(`  ✗ ${msg}`);
  process.exit(1);
}
console.log(`i18n check: ok (${Object.keys(MESSAGES.de).length} keys × ${LANGS.length} languages, identical key sets, ${used.size} keys referenced by the shell)`)