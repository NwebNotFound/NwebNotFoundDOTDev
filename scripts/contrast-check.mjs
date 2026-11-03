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
const summerCss = read("public/design/summer.css");
const siteDarkAt = siteCss.indexOf("@media (prefers-color-scheme: dark)");

const SITE_BASE = tokens(block(siteCss, ":root", 0));
const PANEL_BASE = tokens(block(panelCss, ":root {"));
// The hub block carries the metric tokens too, so it is the base for the summer surfaces.
const SUMMER_BASE = tokens(block(summerCss, ".sm-root {", 0), "sm");
const SUMMER_NIGHT_ATTR = tokens(block(summerCss, '.sm-root[data-theme="summer-night"] {'), "sm");
const SUMMER_NIGHT_SYS = tokens(block(summerCss, ".sm-root:not([data-theme]) {"), "sm");

const SURFACES = {
  "site light": SITE_BASE,
  "site dark": tokens(block(siteCss, ":root", siteDarkAt)),
  "mc theme": tokens(block(mcCss, "html.mc {"), "mc"),
  "panel dark": PANEL_BASE,
  "panel light": tokens(block(panelCss, '[data-theme="light"] {')),
  "summer day": SUMMER_BASE,
  "summer night": { ...SUMMER_BASE, ...SUMMER_NIGHT_ATTR },
  "summer night (system)": { ...SUMMER_BASE, ...SUMMER_NIGHT_SYS },
};

// The two dark paths must not drift: a user with an explicit choice and a user following the
// system have to see the same theme. Collected here, evaluated with the counters below.
const NIGHT_KEYS = [...new Set([...Object.keys(SUMMER_NIGHT_ATTR), ...Object.keys(SUMMER_NIGHT_SYS)])];
const NIGHT_DRIFT = NIGHT_KEYS
  .filter((name) => SUMMER_NIGHT_ATTR[name] !== SUMMER_NIGHT_SYS[name])
  .map((name) => `${name}: ${SUMMER_NIGHT_ATTR[name]} (data-theme) vs ${SUMMER_NIGHT_SYS[name]} (system)`);

// ---- pairs that carry text: [fg, bg, minimum] ------------------------------------------------
const AA_TEXT = 4.5;
const AA_LARGE = 3;
const AA_UI = 3; // non-text: borders, form outlines, focus ring, icon vs its background
// The hub surfaces share the same colour *roles*, so the pair list is written once per theme.
const SUMMER_TEXT_PAIRS = [
  ["--sm-foreground", "--sm-background", AA_TEXT],
  ["--sm-foreground", "--sm-surface", AA_TEXT],
  ["--sm-foreground", "--sm-surface-2", AA_TEXT],
  ["--sm-foreground", "--sm-surface-3", AA_TEXT],
  ["--sm-muted-foreground", "--sm-background", AA_TEXT],
  ["--sm-muted-foreground", "--sm-surface", AA_TEXT],
  ["--sm-muted-foreground", "--sm-surface-2", AA_TEXT],
  ["--sm-muted-foreground", "--sm-surface-3", AA_TEXT],
  ["--sm-link", "--sm-background", AA_TEXT],
  ["--sm-link", "--sm-surface", AA_TEXT],
  ["--sm-link", "--sm-surface-3", AA_TEXT],
  ["--sm-primary-foreground", "--sm-primary", AA_TEXT],
  ["--sm-on-pastel", "--sm-accent-sun", AA_TEXT],
  ["--sm-on-pastel", "--sm-accent-sakura", AA_TEXT],
  ["--sm-on-pastel", "--sm-accent-ramune", AA_TEXT],
  ["--sm-on-pastel", "--sm-accent-lavender", AA_TEXT],
  ["--sm-on-pastel", "--sm-accent-peach", AA_TEXT],
  ["--sm-sakura-ink", "--sm-background", AA_TEXT],
  ["--sm-ramune-ink", "--sm-background", AA_TEXT],
  ["--sm-lavender-ink", "--sm-background", AA_TEXT],
  ["--sm-peach-ink", "--sm-background", AA_TEXT],
  ["--sm-danger", "--sm-background", AA_TEXT],
  ["--sm-danger", "--sm-surface", AA_TEXT],
  ["--sm-success", "--sm-background", AA_TEXT],
  ["--sm-warning", "--sm-background", AA_TEXT],
  ["--sm-border-strong", "--sm-surface", AA_UI],
  ["--sm-border-strong", "--sm-background", AA_UI],
  ["--sm-border-strong", "--sm-surface-3", AA_UI],
  ["--sm-focus-ring", "--sm-surface", AA_UI],
  ["--sm-focus-ring", "--sm-surface-3", AA_UI],
  ["--sm-frame", "--sm-surface", AA_UI],
  ["--sm-star", "--sm-surface", AA_UI],
  ["--sm-star-empty", "--sm-surface", AA_UI],
  ["--sm-primary-deep", "--sm-primary", AA_UI],
];
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
  "summer day": SUMMER_TEXT_PAIRS,
  "summer night": SUMMER_TEXT_PAIRS,
  "summer night (system)": SUMMER_TEXT_PAIRS,
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
// The hub restates the shared scale plus its own pixel/z-order/touch tokens; every hub surface
// inherits them from the day block, so a missing name means the component layer would fall back.
const SUMMER_REQUIRED = [
  "--sm-space-1", "--sm-space-4", "--sm-radius-lg", "--sm-text-base", "--sm-duration",
  "--sm-font-pixel", "--sm-font-body", "--sm-tap", "--sm-tap-dense", "--sm-pixel",
  "--sm-pixel-notch", "--sm-pixel-step", "--sm-dither", "--sm-z-nav", "--sm-z-popover",
  "--sm-on-pastel", "--sm-star", "--sm-star-empty", "--sm-sky-1", "--sm-sky-2",
];
for (const [surface, table] of Object.entries(SURFACES)) {
  const isSummer = surface.startsWith("summer");
  const base = surface === "mc theme" || isSummer
    ? surface === "mc theme" ? table : SUMMER_BASE
    : surface.startsWith("panel")
      ? PANEL_BASE
      : SITE_BASE;
  const scope = { ...base, ...table };
  const names = isSummer ? SUMMER_REQUIRED : REQUIRED[surface] || required;
  for (const name of names) {
    if (!(name in scope)) {
      fail++;
      console.error(`  ✗ ${surface} is missing ${name}`);
    }
  }
}

// The two dark paths must render identically (checked token by token, see NIGHT_DRIFT).
for (const drift of NIGHT_DRIFT) {
  fail++;
  console.error(`  ✗ summer night drift — ${drift}`);
}
if (!NIGHT_DRIFT.length) console.log("\nsummer night: [data-theme] and prefers-color-scheme define the same values");

// Behavior the hub promises and cannot express as a colour pair: touch targets and reduced motion.
const SUMMER_ASSERTIONS = [
  [/@media \(pointer: coarse\) \{[\s\S]*?--sm-tap-dense: 44px;[\s\S]*?\}/, "coarse pointers raise --sm-tap-dense to 44px"],
  [/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?--sm-duration-fast: 0ms;[\s\S]*?\}/, "prefers-reduced-motion zeroes the summer durations"],
  [/@media \(forced-colors: active\)/, "a forced-colors block keeps focus visible"],
  [/\.sm-skip-link/, "the skip link exists"],
  // Summer Theme v2: soft page transitions and the parallax layers.
  [/@view-transition \{\s*navigation:\s*auto;\s*\}/, "cross-document view transitions are on"],
  [/\.sm-nav \{\s*view-transition-name: sm-nav;\s*\}/, "the header is a named view-transition part"],
  [/\.sm-footer \{\s*view-transition-name: sm-footer;\s*\}/, "the footer is a named view-transition part"],
  [/::view-transition-new\(root\)/, "the incoming page has its own animation"],
  [/@supports \(animation-timeline: scroll\(\)\)/, "the parallax is guarded behind @supports"],
  [/animation-timeline: scroll\(root\)/, "the parallax uses a scroll-driven timeline on the root scroller"],
  [/@keyframes sm-parallax-(far|mid|close)/, "parallax layers exist"],
  [/--sm-mx, 0px/, "the mouse parallax writes custom properties, not transforms"],
];
for (const [re, label] of SUMMER_ASSERTIONS) {
  if (!re.test(summerCss)) {
    fail++;
    console.error(`  ✗ summer.css: ${label} is missing`);
  }
}
// Reduced motion must switch off both new motion features.
if (!/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?::view-transition-new\(root\)[\s\S]*?\}/.test(summerCss)) {
  fail++;
  console.error("  ✗ summer.css: reduced motion does not disable the page transition");
}
if (!/@media \(prefers-reduced-motion: no-preference\)/.test(summerCss)) {
  fail++;
  console.error("  ✗ summer.css: the parallax is not limited to no-preference");
}

console.log(`\n${pass} pairs pass, ${fail} fail. Lowest: ${lowest.label} = ${lowest.ratio.toFixed(2)}:1`);
if (fail) {
  console.error("Contrast gate failed — adjust the token or the pair, never the threshold.");
  process.exit(1);
}
