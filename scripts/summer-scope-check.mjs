#!/usr/bin/env node
// Regression guard for the Creative Hub theme (DESIGN.md §11).
//
// The hub stylesheet must never be able to move the Minecraft surface (public/mc/*, html.mc), the
// AI panel (ai-panel/) or the portfolio pages: it only owns the `.sm-root` landmark and the `--sm-*`
// token namespace. This script is the cheap, browserless half of that promise — it fails the run
// when a rule escapes the scope, when a token leaves the namespace, when something pulls a remote
// resource, or when the preview page would trip a strict CSP.
//
//   node scripts/summer-scope-check.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = "public/design/summer.css";
const SPRITES_PATH = "public/design/summer-sprites.svg";
const PREVIEW_PATH = "public/design/summer-preview.html";
const THEME_JS_PATH = "public/design/summer-theme.js";

const fail = [];
const note = (msg) => fail.push(msg);
// Messages from the CSS walker are prefixed with the file they came from.
let currentCssFile = "public/design/summer.css";
const cssNote = (msg) => fail.push(`${currentCssFile}: ${msg}`);
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => {
  try {
    read(p);
    return true;
  } catch {
    return false;
  }
};

/* ---------------------------------------------------------------------------------------------
   Minimal CSS block parser: enough to know which selector owns which declarations.
   --------------------------------------------------------------------------------------------- */
function parseBlocks(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const root = { prelude: "", rules: [], decls: null, atRoot: true };
  const stack = [root];
  let prelude = "";
  let quote = null;
  let parens = 0;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      prelude += ch;
      if (ch === "\\") {
        prelude += src[++i] ?? "";
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      prelude += ch;
      continue;
    }
    if (ch === "(") parens++;
    else if (ch === ")") parens--;
    if (parens === 0 && ch === "{") {
      const node = { prelude: prelude.trim(), rules: [], decls: null };
      stack[stack.length - 1].rules.push(node);
      stack.push(node);
      prelude = "";
      continue;
    }
    if (parens === 0 && ch === "}") {
      const node = stack.pop();
      if (node && node.decls === null) node.decls = prelude.trim();
      prelude = "";
      continue;
    }
    if (parens === 0 && ch === ";") {
      // Only a *statement* at-rule (@import, @charset, @layer a;) ends here — inside a rule body a
      // semicolon just separates declarations, so it must stay in the accumulated text.
      const current = stack[stack.length - 1];
      const statementContext = current.atRoot === true || CONTAINER.test(current.prelude);
      if (statementContext) {
        const statement = prelude.trim();
        if (statement) current.rules.push({ prelude: statement, rules: [], decls: "", statement: true });
        prelude = "";
        continue;
      }
    }
    prelude += ch;
  }
  return root;
}

/** Split "a, b, c" on top-level commas (a selector list). */
const selectorList = (prelude) => {
  const out = [];
  let cur = "";
  let depth = 0;
  let quote = null;
  for (const ch of prelude) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

/** Declarations that actually paint something (custom properties do not). */
const realDeclarations = (decls) =>
  (decls || "")
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !d.startsWith("--") && !d.startsWith("/*"));

const REAL_PROPS_IN = (decls) => realDeclarations(decls).filter((d) => /^[a-z-]+\s*:/i.test(d));

const CONTAINER = /^@(media|supports|layer|container|scope)\b/i;
const KEYFRAMES = /^@(-webkit-)?keyframes\b/i;
const FONT_FACE = /^@font-face\b/i;
// `@view-transition` is a document-level at-rule by definition (it cannot be scoped to `.sm-root`)
// and carries no selector, so it is allowed by name — the same way @font-face and @keyframes are.
const VIEW_TRANSITION = /^@view-transition\b/i;

/* ---------------------------------------------------------------------------------------------
   1. hub stylesheets — scope, namespace, no remote resources
   --------------------------------------------------------------------------------------------- */
const css = read(CSS_PATH);
const PREVIEW_CSS = "public/design/summer-preview.css";

const SCOPE = ".sm-root";
// The hub owns exactly one namespace: classes starting with `sm-` (plus the `.sm-root` landmark).
// A selector is therefore only allowed if its first compound is such a class; a bare element
// selector (body, a, h1 …) or a selector rooted in another surface is a regression.
const FIRST_COMPOUND = /^[^\s>+~]+/;
const isScopedSelector = (selector) => {
  const first = selector.trim().match(FIRST_COMPOUND)?.[0] ?? "";
  if (!/^[.:]/.test(first)) return false; // starts with an element or `*`
  return /\.sm-/.test(first); // `.sm-…` class, or `:where(.sm-root)`-style wrapper
};

const walk = (node, { insideKeyframes = false, label = "" } = {}) => {
  const nm = (msg) => cssNote(label ? `${msg} [in ${label}]` : msg);
  for (const rule of node.rules) {
    if (rule.statement) {
      if (/^@import\b/i.test(rule.prelude)) nm(`@import is not allowed: ${rule.prelude}`);
      continue;
    }
    const kf = insideKeyframes || KEYFRAMES.test(rule.prelude);
    if (VIEW_TRANSITION.test(rule.prelude)) {
      // Only `navigation: auto` is acceptable here; anything else would change how the page loads.
      if (!/navigation\s*:\s*auto/.test(rule.decls)) nm("@view-transition must keep `navigation: auto`");
      continue;
    }
    if (CONTAINER.test(rule.prelude)) {
      walk(rule, { insideKeyframes: kf, label: rule.prelude.replace(/\s*\{$/, "") });
      continue;
    }
    if (FONT_FACE.test(rule.prelude)) {
      // Font faces are the one global at-rule a theme is allowed to add.
      if (!/font-display\s*:\s*swap/.test(rule.decls)) nm("@font-face without `font-display: swap`");
      for (const url of rule.decls.matchAll(/url\(\s*["']?([^"')]+)/g)) {
        if (!url[1].startsWith("/design/fonts/")) nm(`@font-face must use a local font: ${url[1]}`);
      }
      continue;
    }
    // Custom properties are allowed anywhere, but only inside the summer namespace.
    for (const decl of (rule.decls || "").split(";")) {
      const prop = decl.trim().split(":")[0].trim();
      if (prop.startsWith("--") && !prop.startsWith("--sm-")) {
        nm(`${rule.prelude || "<root>"} declares a foreign custom property: ${prop}`);
      }
    }
    if (kf) continue;
    const props = REAL_PROPS_IN(rule.decls);
    if (!props.length && !(rule.decls || "").trim()) continue;
    for (const selector of selectorList(rule.prelude)) {
      if (!isScopedSelector(selector)) {
        nm(
          `unscoped selector (${props[0] || "custom properties only"}) — needs an .sm-* class root: ${selector}`,
        );
      }
      if (/#[A-Za-z_-]/.test(selector)) nm(`id selector is not allowed: ${selector}`);
      if (/(html\.mc|\.mc-|--mc-|ai-panel|\.ds-)/.test(selector)) {
        nm(`rule reaches into another surface: ${selector}`);
      }
    }
  }
};

// Both hub stylesheets obey the same rules; the preview chrome is not allowed to escape either.
for (const file of [CSS_PATH, PREVIEW_CSS]) {
  currentCssFile = file;
  const text = read(file);
  walk(parseBlocks(text), {});
  for (const url of text.matchAll(/url\(\s*["']?(?:https?:)?\/\//g)) cssNote(`remote URL: ${url[0]}`);
}

currentCssFile = CSS_PATH;
if (!/\.sm-root\b/.test(css)) cssNote(`never mentions the ${SCOPE} landmark`);
if (!/@media \(prefers-color-scheme: dark\)/.test(css)) cssNote("summer night has no prefers-color-scheme path");
if (!/@media \(prefers-reduced-motion: reduce\)/.test(css)) cssNote("no prefers-reduced-motion block");

/* ---------------------------------------------------------------------------------------------
   2. hub scripts — no inline handlers, no eval, no network
   --------------------------------------------------------------------------------------------- */
const HUB_SCRIPTS = [THEME_JS_PATH, "public/design/summer-parallax.js"];
for (const file of HUB_SCRIPTS) {
  if (!exists(file)) {
    note(`${file} is missing`);
    continue;
  }
  const js = read(file);
  for (const bad of [/\beval\s*\(/, /new Function\s*\(/, /document\.write\s*\(/, /https?:\/\//, /\.innerHTML\s*=/]) {
    if (bad.test(js)) note(`${file} contains ${bad}`);
  }
}

/* ---------------------------------------------------------------------------------------------
   3. preview page — static, noindex, CSP-clean, uses the external theme script
   --------------------------------------------------------------------------------------------- */
if (!exists(PREVIEW_PATH)) {
  note(`${PREVIEW_PATH} is missing`);
} else {
  const html = read(PREVIEW_PATH);
  if (!/class="sm-root"/.test(html)) note(`${PREVIEW_PATH} does not put the ${SCOPE} class on <html>`);
  if (!/<link rel="stylesheet" href="\/design\/summer\.css"/.test(html)) note(`${PREVIEW_PATH} does not load summer.css`);
  if (!/<script src="\/design\/summer-theme\.js"><\/script>/.test(html)) {
    note(`${PREVIEW_PATH} must load /design/summer-theme.js as an external script`);
  }
  if (!/<meta name="robots" content="noindex/.test(html)) note(`${PREVIEW_PATH} should be noindex`);
  if (/<script(?![^>]*\ssrc=)</.test(html)) note(`${PREVIEW_PATH} contains an inline <script> without src`);
  if (/\son[a-z]+\s*=/i.test(html)) note(`${PREVIEW_PATH} contains an inline event handler`);
  if (/javascript:/i.test(html)) note(`${PREVIEW_PATH} contains a javascript: URL`);
  if (/(href|src)="https?:|\burl\(\s*https?:/.test(html)) note(`${PREVIEW_PATH} loads a remote resource`);
  if (!/summer-sprites\.svg#/.test(html)) note(`${PREVIEW_PATH} does not use the placeholder sprite sheet`);
  // The page ships a strict CSP, so it must prove it needs neither inline style nor inline script.
  if (!/http-equiv="Content-Security-Policy"/.test(html)) note(`${PREVIEW_PATH} has no CSP meta tag`);
  if (!/style-src 'self'/.test(html)) note(`${PREVIEW_PATH} CSP does not pin style-src to 'self'`);
  if (!/script-src 'self'/.test(html)) note(`${PREVIEW_PATH} CSP does not pin script-src to 'self'`);
  if (/\sstyle="/.test(html)) note(`${PREVIEW_PATH} uses an inline style attribute (blocked by its own CSP)`);
  if (!/summer-preview\.css/.test(html)) note(`${PREVIEW_PATH} does not load its own chrome stylesheet`);
}

/* ---------------------------------------------------------------------------------------------
   4. sprites — the placeholder set exists and is labelled as such
   --------------------------------------------------------------------------------------------- */
if (!exists(SPRITES_PATH)) {
  note(`${SPRITES_PATH} is missing`);
} else {
  const svg = read(SPRITES_PATH);
  for (const id of ["sm-sun", "sm-cloud", "sm-sparkle", "sm-heart", "sm-star", "sm-mascot-placeholder"]) {
    if (!new RegExp(`id="${id}"`).test(svg)) note(`sprite ${id} is missing`);
  }
  if (!/PLACEHOLDER/i.test(svg)) note("the sprite file must say that the art is a placeholder");
  if (/<script/i.test(svg)) note("the sprite file must not contain script");
}

/* --------------------------------------------------------------------------------------------- */
if (fail.length) {
  console.error(`summer scope check failed (${fail.length}):`);
  for (const msg of fail) console.error(`  ✗ ${msg}`);
  process.exit(1);
}
console.log("summer scope check: ok (scoped to .sm-root, tokens --sm-*, no remote resources, preview page CSP-clean)");
