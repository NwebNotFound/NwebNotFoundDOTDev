#!/usr/bin/env node
// Screenshots for design review: website + Minecraft section + AI panel, at 390px and 1280px,
// in light and dark. Output goes to screenshots/ and is committed with the PR that changes a layout.
//
//   node scripts/screenshots.mjs --serve      # starts the local servers, captures, shuts them down
//   node scripts/screenshots.mjs              # expects the servers to run already
//
// Environment overrides:
//   --site  <url>  portfolio               (default http://127.0.0.1:8790)
//   --mc    <url>  mc.nwebnotfound.dev     (default http://127.0.0.1:8791)
//   --panel <url>  AI panel                (default http://127.0.0.1:8788)
//   --out   <dir>  output directory        (default screenshots)
//   --only  site|mc|panel                  (default all)
//
// --serve needs wrangler on PATH (`npm i -g wrangler`). The two site Workers run with
// --local-upstream so the Worker sees the real host names; the panel runs under the plain Node
// dev server, which serves public/ and the /login route without Discord.
//
// Screenshots use `prefers-reduced-motion: reduce` so scroll-reveal sections are never captured
// half faded — the layout, colours and spacing are the normal ones.

import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SERVE = args.includes("--serve");
const SITE = opt("site", "http://127.0.0.1:8790");
const MC = opt("mc", "http://127.0.0.1:8791");
const PANEL = opt("panel", "http://127.0.0.1:8788");
const OUT = path.resolve(ROOT, opt("out", "screenshots"));
const ONLY = opt("only", "");
const GROUPS = ONLY ? [ONLY] : ["site", "mc", "panel"];

const VIEWPORTS = [
  { w: 390, h: 844, tag: "390" },
  { w: 1280, h: 900, tag: "1280" },
];
const SCHEMES = ["light", "dark"];

const children = [];
let failures = 0;

function serve(cmd, cmdArgs, extraEnv = {}) {
  const child = spawn(cmd, cmdArgs, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  children.push(child);
  return child;
}

function stopServers() {
  for (const child of children) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

async function reachable(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function startServers() {
  const persist = path.join(ROOT, ".wrangler", "screens-" + process.pid);
  await rm(persist, { recursive: true, force: true });

  // Fresh local D1 per run so the pages render their real (empty) states instead of a 500.
  for (const dir of ["site", "mc"]) {
    const to = path.join(persist, dir).split(path.sep).join("/");
    try {
      execSync(`npx wrangler d1 execute DB --local --persist-to "${to}" --file schema.sql`, { cwd: ROOT, stdio: "ignore" });
    } catch {
      console.warn(`! could not apply schema.sql to ${path.relative(ROOT, to)} — the pages will show their error state`);
    }
  }

  // The panel is captured signed-out: the login screen is the state a visitor sees.

  // Two Workers because the site is host-routed: the Worker decides the surface from the host name.
  serve("npx", ["wrangler", "dev", "--port", "8790", "--local", "--ip", "127.0.0.1", "--local-upstream", "nwebnotfound.dev", "--persist-to", path.join(persist, "site")]);
  serve("npx", ["wrangler", "dev", "--port", "8791", "--local", "--ip", "127.0.0.1", "--local-upstream", "mc.nwebnotfound.dev", "--persist-to", path.join(persist, "mc")]);
  serve("node", [path.join("ai-panel", "scripts", "dev-server.mjs")], { PORT: "8788" });

  await Promise.all([reachable(`${SITE}/`), reachable(`${MC}/`), reachable(`${PANEL}/`)]);
}

const PAGES = [
  { group: "site", name: "home", url: `${SITE}/`, fullPage: true },
  { group: "site", name: "guestbook", url: `${SITE}/guestbook`, fullPage: true },
  { group: "mc", name: "mc-home", url: `${MC}/`, fullPage: true },
  { group: "mc", name: "mc-wiki", url: `${MC}/wiki`, fullPage: true },
  { group: "panel", name: "panel-login", url: `${PANEL}/`, fullPage: false },
];

async function shoot(browser, page, file) {
  const context = await browser.newContext({
    viewport: { width: page.w, height: page.h },
    colorScheme: page.scheme,
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    locale: "de-DE",
  });
  const tab = await context.newPage();
  const res = await tab.goto(page.url, { waitUntil: "networkidle", timeout: 45_000 });
  if (!res || res.status() >= 400) throw new Error(`${page.url} → HTTP ${res ? res.status() : "no response"}`);
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(250);

  const metrics = await tab.evaluate(() => {
    const el = document.documentElement;
    const wide = [...document.querySelectorAll("body *")]
      .filter((n) => n.getBoundingClientRect().right > el.clientWidth + 1)
      .slice(0, 5)
      .map((n) => `${n.tagName.toLowerCase()}.${(n.className || "").toString().split(" ")[0]}`);
    return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth, wide };
  });
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    failures++;
    console.error(
      `  ✗ horizontal scroll at ${page.w}px (${page.name}): scrollWidth ${metrics.scrollWidth} > ${metrics.innerWidth} ${JSON.stringify(metrics.wide)}`,
    );
  }

  await tab.screenshot({ path: file, fullPage: page.fullPage });
  await context.close();
  return metrics;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  if (SERVE) await startServers();
  else {
    const wanted = [];
    if (GROUPS.includes("site")) wanted.push(`${SITE}/`);
    if (GROUPS.includes("mc")) wanted.push(`${MC}/`);
    if (GROUPS.includes("panel")) wanted.push(`${PANEL}/login`);
    await Promise.all(wanted.map((url) => reachable(url, 20_000))).catch((err) => {
      throw new Error(`${err.message}\nStart the servers first or pass --serve.`);
    });
  }

  const browser = await chromium.launch();
  let count = 0;
  try {
    for (const group of GROUPS) {
      for (const page of PAGES.filter((p) => p.group === group)) {
        for (const scheme of SCHEMES) {
          for (const vp of VIEWPORTS) {
            const file = path.join(OUT, `${page.name}-${vp.tag}-${scheme}.png`);
            await shoot(browser, { ...page, ...vp, scheme }, file);
            const rel = path.relative(ROOT, file).replace(/\\/g, "/");
            console.log(`  ✓ ${rel}`);
            count++;
          }
        }
      }
    }
  } finally {
    await browser.close();
    if (SERVE) stopServers();
  }
  console.log(`\n${count} screenshots in ${path.relative(ROOT, OUT) || "."}/`);
  if (failures) {
    console.error(`${failures} layout problem(s): horizontal scrolling must not happen at 390px.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  if (SERVE) stopServers();
  process.exit(1);
});
