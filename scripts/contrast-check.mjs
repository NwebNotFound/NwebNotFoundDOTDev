#!/usr/bin/env node
// WCAG 2.2 AA gate for the design tokens (DESIGN.md §2).
//
// Reads the real token blocks out of public/design/tokens.css and ai-panel/public/app.css, then
// checks every text pair the components actually use. A token that drops below its threshold fails
// the run — that is the point: it is cheaper than finding it in a screenshot.
//
//   node scripts/contrast-check.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

/** Grab `--ds-*: value;` declarations from the first block whose selector matches `selector`. */
function block(css, selector, from = 0) {
  const at = css.indexOf(selector, from);
  if (at < 0) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open, i);
  }
  throw new Error(`unterminated block: ${selector}`);
}

function tokens(cssBlock, prefix = "ds") {
  const out = {};
  for (const m of cssBlock.matchAll(new RegExp(`(--${prefix}-[a-z0-9-]+)\s*:\s*([^;]+);`, "g"))) out[m[1]] = m[2].trim();
  return out;
}

/** Resolve `var(--x)` indirection one level deep (token files map aliases, not values). */
function resolve(value, table) {
  const m = /^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/i.exec(value || "");
  if (!m) return value;
  return table[m[1]] ?? m[2] ?? value;
}

function parseColor(input) {
  const v = String(input).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgba) {
    const parts = rgba[1].split(/[,/]/).map((n) => n.trim());
    return parts.slice(0, 3).map((n) => (n.endsWith("%") ? Math.round((parseFloat(n) / 100) * 255) : Number(n)));
  }
  return null;
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---- token surfaces -------------------------------------------------------------------------
const siteCss = read("public/design/tokens.css");
const mcCss = read("public/design/minecraft.css");
const panelCss = read("ai-panel/public/app.css");
const siteDarkAt = siteCss.indexOf("@media (prefers-color-scheme: dark)");

const SITE_BASE = tokens(block(siteCss, ":root", 0));
const PANEL_BASE = tokens(block(panelCss, ":root {"));

const SURFACES = {
  "site light": SITE_BASE,
  "site dark": tokens(block(siteCss, ":root", siteDarkAt)),
  "mc theme": tokens(block(mcCss, "html.mc {"), "mc"),
  "panel dark": PANEL_BASE,
  "panel light": tokens(block(panelCss, '[data-theme="light"] {')),
};

// ---- pairs that carry text: [fg, bg, minimum] ------------------------------------------------
const AA_TEXT = 4.5;
const AA_LARGE = 3;
const PAIRS = {
  "site light": [
    ["--ds-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-surface", AA_TEXT],
    ["--ds-muted-foreground", "--ds-surface-2", AA_TEXT],
    ["--ds-link", "--ds-background", AA_TEXT],
    ["--ds-link", "--ds-surface-2", AA_TEXT],
    ["--ds-primary-foreground", "--ds-primary", AA_TEXT],
    ["--ds-accent-strong", "--ds-background", AA_TEXT],
  ],
  "site dark": [
    ["--ds-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-surface", AA_TEXT],
    ["--ds-muted-foreground", "--ds-surface-2", AA_TEXT],
    ["--ds-link", "--ds-background", AA_TEXT],
    ["--ds-link", "--ds-surface", AA_TEXT],
    ["--ds-primary-foreground", "--ds-primary", AA_TEXT],
    ["--ds-accent-strong", "--ds-surface-2", AA_TEXT],
  ],
  "mc theme": [
    ["--mc-text", "--mc-background", AA_TEXT],
    ["--mc-text", "--mc-surface-2", AA_TEXT],
    ["--mc-text-muted", "--mc-background", AA_TEXT],
    ["--mc-text-muted", "--mc-surface-1", AA_TEXT],
    ["--mc-text-muted", "--mc-surface-2", AA_TEXT],
    ["--mc-text-dim", "--mc-background", AA_TEXT],
    ["--mc-text-dim", "--mc-surface-2", AA_TEXT],
    ["--mc-grass", "--mc-background", AA_TEXT],
    ["--mc-grass", "--mc-surface-4", AA_TEXT],
    ["--mc-on-grass", "--mc-grass", AA_TEXT],
    ["--mc-gold", "--mc-surface-1", AA_TEXT],
    ["--mc-gold", "--mc-background", AA_TEXT],
    ["--mc-redstone", "--mc-background", AA_TEXT],
    ["--mc-diamond", "--mc-background", AA_TEXT],
    ["--mc-amethyst", "--mc-obsidian", AA_LARGE],
  ],
  "panel dark": [
    ["--ds-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-surface", AA_TEXT],
    ["--ds-faint-foreground", "--ds-background", AA_TEXT],
    ["--ds-faint-foreground", "--ds-surface", AA_TEXT],
    ["--ds-primary", "--ds-background", AA_TEXT],
    ["--ds-primary-foreground", "--ds-primary", AA_TEXT],
    ["--ds-danger", "--ds-background", AA_TEXT],
    ["--ds-success", "--ds-background", AA_TEXT],
    ["--ds-warning", "--ds-background", AA_TEXT],
  ],
  "panel light": [
    ["--ds-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-background", AA_TEXT],
    ["--ds-muted-foreground", "--ds-surface", AA_TEXT],
    ["--ds-faint-foreground", "--ds-background", AA_TEXT],
    ["--ds-faint-foreground", "--ds-hover", AA_TEXT],
    ["--ds-faint-foreground", "--ds-sidebar", AA_TEXT],
    ["--ds-primary", "--ds-background", AA_TEXT],
    ["--ds-primary-foreground", "--ds-primary", AA_TEXT],
    ["--ds-danger", "--ds-background", AA_TEXT],
    ["--ds-success", "--ds-background", AA_TEXT],
    ["--ds-warning", "--ds-background", AA_TEXT],
  ],
};

let fail = 0;
let pass = 0;
let lowest = { ratio: Infinity };

for (const [surface, table] of Object.entries(SURFACES)) {
  console.log(`\n${surface}`);
  for (const [fgName, bgName, min] of PAIRS[surface]) {
    const fg = parseColor(resolve(table[fgName], table));
    const bg = parseColor(resolve(table[bgName], table));
    if (!fg || !bg) {
      fail++;
      console.error(`  ✗ ${fgName} on ${bgName}: unreadable token value (${table[fgName]} / ${table[bgName]})`);
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= min;
    if (ok) pass++;
    else fail++;
    if (ratio < lowest.ratio) lowest = { ratio, label: `${surface}: ${fgName} on ${bgName}` };
    console.log(`  ${ok ? "✓" : "✗"} ${fgName} on ${bgName}: ${ratio.toFixed(2)} (min ${min})`);
  }
}

// Structural sanity: the scale must exist for every surface (colour-only blocks inherit it).
const REQUIRED = {
  "mc theme": ["--mc-space-1", "--mc-space-4", "--mc-radius", "--mc-text-base", "--mc-duration", "--mc-bevel-slot", "--mc-texture", "--mc-slot-bg"],
};
const required = ["--ds-space-1", "--ds-space-4", "--ds-radius-lg", "--ds-text-base", "--ds-duration"];
for (const [surface, table] of Object.entries(SURFACES)) {
  const base = surface === "mc theme" ? table : surface.startsWith("panel") ? PANEL_BASE : SITE_BASE;
  const scope = { ...base, ...table };
  const names = REQUIRED[surface] || required;
  for (const name of names) {
    if (!(name in scope)) {
      fail++;
      console.error(`  ✗ ${surface} is missing ${name}`);
    }
  }
}

console.log(`\n${pass} pairs pass, ${fail} fail. Lowest: ${lowest.label} = ${lowest.ratio.toFixed(2)}:1`);
if (fail) {
  console.error("Contrast gate failed — adjust the token or the pair, never the threshold.");
  process.exit(1);
}
