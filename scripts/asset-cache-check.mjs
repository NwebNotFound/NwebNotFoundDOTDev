#!/usr/bin/env node
// public/_headers caches /design, /mc and /vendor CSS/JS as immutable for a year. That is only safe
// while (1) every link to such a file carries ?v=${AV} (or a version in the file name) and
// (2) AV in scripts/deploy.sh hashes every directory those rules cover. This check fails on any
// unversioned link, so a new <script src="/mc/x.js"> can never pin stale code in browsers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "public/mc")), ...walk(path.join(ROOT, "public/design"))]
  .filter((f) => /\.(m?js|css)$/.test(f));
let fail = 0;
const ok = (c, m) => { if (!c) fail++; console.log((c ? "  ✓ " : "  ✗ ") + m); };

const REF = /(?:src|href)\s*=\s*\\?["'](\/(?:design|mc|vendor|bundle)\/[^"'\\?#]+\.(?:css|js))(\?[^"'\\]*)?\\?["']|\.src\s*=\s*["'](\/(?:design|mc|vendor)\/[^"'?#]+\.(?:css|js))(\?[^"']*)?["']/g;
const bad = [];
let refs = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(REF)) {
    refs++;
    const p = m[1] || m[3], q = m[2] || m[4] || "";
    const versionedName = /-\d+\.\d+\.\d+(\.min)?\.(js|css)$/.test(p);
    if (!versionedName && !/[?&]v=/.test(q)) bad.push(`${path.relative(ROOT, f)}: ${p}`);
  }
}
ok(refs > 20, `found ${refs} CSS/JS links to scan`);

// Static HTML in public/ cannot carry ${AV}. Each such page must be stamped by the Worker
// (src/bundle.js STAMPED_HTML) and routed to it first (wrangler.jsonc run_worker_first).
const { STAMPED_HTML, stampVersion } = await import("../src/bundle.js");
const wrangler = fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8");
const workerFirst = JSON.parse((wrangler.match(/"run_worker_first"\s*:\s*(\[[^\]]*\])/) || [, "[]"])[1]);
const covered = (url) => workerFirst.some((p) => (p.endsWith("*") ? url.startsWith(p.slice(0, -1)) : url === p));
const htmlBad = [];
let htmlRefs = 0;
for (const f of walk(path.join(ROOT, "public")).filter((f) => f.endsWith(".html"))) {
  const url = "/" + path.relative(path.join(ROOT, "public"), f).split(path.sep).join("/");
  const raw = fs.readFileSync(f, "utf8");
  const stamped = STAMPED_HTML.includes(url) && covered(url);
  const served = stamped ? stampVersion(raw) : raw;
  for (const m of served.matchAll(REF)) {
    htmlRefs++;
    const p = m[1] || m[3], q = m[2] || m[4] || "";
    if (!/-\d+\.\d+\.\d+(\.min)?\.(js|css)$/.test(p) && !/[?&]v=/.test(q)) htmlBad.push(`${url}: ${p}`);
  }
}
ok(htmlRefs > 0, `found ${htmlRefs} CSS/JS links in static HTML`);
ok(htmlBad.length === 0, "static HTML is served with versioned CSS/JS links" + (htmlBad.length ? "\n      " + htmlBad.join("\n      ") : ""));
ok(bad.length === 0, "every /design, /mc, /vendor CSS/JS link is versioned" + (bad.length ? "\n      " + bad.join("\n      ") : ""));

const deploy = fs.readFileSync(path.join(ROOT, "scripts/deploy.sh"), "utf8");
const hashed = (deploy.match(/^AV=\$\(find ([^-]+?) -type f/m) || [, ""])[1].split(/\s+/).filter(Boolean);
const headers = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8");
const immutableDirs = [...headers.matchAll(/^\/([a-z]+)\/\*\.(?:css|js)\s*\n\s*Cache-Control:[^\n]*immutable/gm)].map((m) => "public/" + m[1]);
ok(immutableDirs.length >= 3, `immutable rules for ${immutableDirs.join(", ")}`);
ok(immutableDirs.every((d) => hashed.includes(d)), `deploy.sh AV hashes every immutable directory (${hashed.join(", ")})`);
const lines = headers.split(/\r?\n/);
const immutableRules = lines.filter((l, i) => /immutable/.test(lines[i + 1] || ""));
ok(immutableRules.every((r) => /\.(css|js)\s*$/.test(r)), "immutable only on CSS/JS rules, never on HTML or a catch-all");

console.log(fail ? `\n${fail} failed` : "\nall asset cache checks passed");
process.exit(fail ? 1 : 0);
