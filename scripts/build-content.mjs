#!/usr/bin/env node
// Build-Zeit: Markdown-Inhalte aus content/ lesen, validieren, zu HTML rendern und als Modul
// bündeln (src/generated/content.js). Muster wie scripts/sync-changelog.mjs – der Worker liest nur
// den vorgerenderten Index und parst zur Laufzeit kein Markdown.
//
// Derselbe Lauf schreibt die Feeds (Phase 3b) als src/generated/feeds.js: RSS 2.0 und Atom 1.0 für
// alle Texte, je Art und je Serie. Auch die Feeds sind vorgerendert und deterministisch (kein
// Laufzeit-Zeitstempel), der Worker sucht zur Laufzeit nur noch den passenden Eintrag heraus.
//
//   node scripts/build-content.mjs                 # content/writing → src/generated/content.js
//   node scripts/build-content.mjs --fixtures      # scripts/fixtures/content (nur Tests/e2e)
//   node scripts/build-content.mjs --from <dir> --out <file> --feeds-out <file>
//
// Bei Validierungsfehlern bricht das Skript mit Exit-Code 1 ab (scripts/deploy.sh ruft es vor dem
// Deploy auf, `set -e` stoppt dann den Deploy).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, toIndex } from "../src/content.js";
import { buildFeeds } from "../src/feed.js";
import { makeT } from "../src/i18n/index.js";
import { renderMarkdown } from "../src/markdown.js";

// Muss zu `SITE` in src/hub.js passen (die Feed-Links sind absolute URLs).
const SITE = "nwebnotfound.dev";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const USE_FIXTURES = args.includes("--fixtures");
const FROM = path.resolve(ROOT, USE_FIXTURES ? "scripts/fixtures/content" : arg("from", "content/writing"));
const OUT = path.resolve(ROOT, arg("out", "src/generated/content.js"));
const FEEDS_OUT = path.resolve(ROOT, arg("feeds-out", "src/generated/feeds.js"));

/** All *.md below `dir` (recursive), sorted; README.md and dot-directories are skipped. */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md") && entry.name.toLowerCase() !== "readme.md") out.push(full);
  }
  return out;
}

const files = walk(FROM).map((file) => ({ file: path.relative(ROOT, file), text: fs.readFileSync(file, "utf8") }));
const { entries, errors } = analyze(files);
if (errors.length) {
  console.error(`content build failed (${errors.length}):`);
  for (const msg of errors) console.error(`  \u2717 ${msg}`);
  process.exit(1);
}

const { writing, series } = toIndex(entries, renderMarkdown);
const json = JSON.stringify({ generator: "scripts/build-content.mjs", writing, series }, null, 2)
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
const source = path.relative(ROOT, FROM) || ".";
const header = `// AUTOMATISCH ERZEUGT von scripts/build-content.mjs \u2013 nicht von Hand bearbeiten.\n// Quelle: ${source} (${files.length} Datei(en))\n`;
fs.writeFileSync(OUT, `${header}export const CONTENT = ${json};\n`);

// Feeds (Phase 3b): Titel und Beschreibungen kommen aus src/i18n/{de,en}.js, damit Feed-Sprache und
// Oberfläche dieselben Texte benutzen.
const feeds = buildFeeds({ writing, series, site: SITE, t: makeT });
const feedsJson = JSON.stringify(feeds, null, 2).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
fs.writeFileSync(FEEDS_OUT, `${header}export const FEEDS = ${feedsJson};\n`);
const withEntries = feeds.filter((f) => f.count > 0).length;
console.log(
  `content: ${writing.length} Beitrag/Beitr\u00e4ge, ${series.length} Serie(n) aus ${source} \u2192 ${path.relative(ROOT, OUT)}; ` +
    `feeds: ${feeds.length} Feed(s) (${withEntries} mit Eintr\u00e4gen) \u2192 ${path.relative(ROOT, FEEDS_OUT)}`,
);
