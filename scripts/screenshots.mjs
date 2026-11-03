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
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startMockHermes } from "./mock-hermes.mjs";

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
let panelEnv = {};

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
      // A hung connection must not stall the wait: without a timeout the readiness probe can sit in
      // the event loop forever while the Worker is already answering.
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
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

  // Only the servers whose group is requested are started (so `--only hub` needs neither the MC
  // Worker nor the panel, and a broken neighbour cannot block the run).
  const needSite = GROUPS.includes("site") || GROUPS.includes("hub");
  const needMc = GROUPS.includes("mc");
  const needPanel = GROUPS.includes("panel");

  // Fresh local D1 per run so the pages render their real (empty) states instead of a 500.
  for (const dir of [needSite ? "site" : null, needMc ? "mc" : null].filter(Boolean)) {
    const to = path.join(persist, dir).split(path.sep).join("/");
    try {
      execSync(`npx wrangler d1 execute DB --local --persist-to "${to}" --file schema.sql`, { cwd: ROOT, stdio: "ignore" });
    } catch {
      console.warn(`! could not apply schema.sql to ${path.relative(ROOT, to)} — the pages will show their error state`);
    }
  }

  if (needPanel) {
    // The panel needs a Hermes-shaped backend for the chat, drawer and approval screenshots.
    const { origin } = await startMockHermes();
    panelEnv = {
      HERMES_ORIGIN: origin,
      HERMES_PANEL_SECRET: "screens-panel-secret",
      SESSION_SECRET: "screens-session-secret-0123456789abcdef",
      ALLOWED_DISCORD_ID: "111111111111111111",
      PANEL_BOTS: "cloudflare,minecraft,discord,homelab",
    };
  }

  // Two Workers because the site is host-routed: the Worker decides the surface from the host name.
  // Ports follow the --site/--mc URLs so a stale local server can never be screenshotted by accident.
  const sitePort = new URL(SITE).port || "8790";
  const mcPort = new URL(MC).port || "8791";
  const started = [];
  if (needSite) {
    serve("npx", ["wrangler", "dev", "--port", sitePort, "--local", "--ip", "127.0.0.1", "--local-upstream", "nwebnotfound.dev", "--persist-to", path.join(persist, "site")]);
    started.push(`${SITE}/`);
  }
  if (needMc) {
    serve("npx", ["wrangler", "dev", "--port", mcPort, "--local", "--ip", "127.0.0.1", "--local-upstream", "mc.nwebnotfound.dev", "--persist-to", path.join(persist, "mc")]);
    started.push(`${MC}/`);
  }
  if (needPanel) {
    serve("node", [path.join("ai-panel", "scripts", "dev-server.mjs")], { PORT: new URL(PANEL).port || "8788", ...panelEnv });
    started.push(`${PANEL}/`);
  }

  await Promise.all(started.map((url) => reachable(url)));
}

const PAGES = [
  { group: "site", name: "home", url: `${SITE}/`, fullPage: true },
  { group: "site", name: "portfolio", url: `${SITE}/portfolio`, fullPage: true },
  { group: "site", name: "guestbook", url: `${SITE}/guestbook`, fullPage: true },
  // Hub shell (Phase 2): reference shots for design review, committed under docs/screens/ (own out
  // directory so the site group keeps writing into screenshots/).
  { group: "hub", name: "hub-home", url: `${SITE}/`, fullPage: true, out: "docs/screens" },
  { group: "hub", name: "hub-about", url: `${SITE}/about`, fullPage: true, out: "docs/screens" },
  { group: "hub", name: "hub-soon", url: `${SITE}/writing`, fullPage: true, out: "docs/screens" },
  { group: "hub", name: "hub-home-en", url: `${SITE}/en`, fullPage: true, out: "docs/screens", schemes: ["light"], only: (vp) => vp.w === 390 },
  { group: "mc", name: "mc-home", url: `${MC}/`, fullPage: false, waitUntil: "domcontentloaded", schemes: ["dark"] },
  { group: "mc", name: "mc-wiki", url: `${MC}/wiki`, fullPage: true, waitUntil: "domcontentloaded", schemes: ["dark"] },
  // Panel: signed out (login), chat with tool output, approval card, drawer open, new-bot dialog.
  { group: "panel", name: "panel-login", url: `${PANEL}/`, fullPage: false, waitUntil: "domcontentloaded", async script(tab) {
      await tab.waitForSelector("#login-screen:not([hidden])", { timeout: 20_000 });
      await tab.waitForTimeout(250);
    } },
  {
    group: "panel",
    name: "panel-chat",
    url: `${PANEL}/`,
    fullPage: false,
    waitUntil: "domcontentloaded",
    login: true,
    async script(tab) {
      await tab.waitForSelector("#bot-list .bot-item", { timeout: 20_000 });
      await tab.fill("#input", "Status der Website, bitte kurz.");
      await tab.click("#btn-send");
      await tab.waitForSelector(".msg.assistant .code-block", { timeout: 20_000 });
      await tab.waitForTimeout(400);
    },
  },
  {
    group: "panel",
    name: "panel-approval",
    url: `${PANEL}/`,
    fullPage: false,
    waitUntil: "domcontentloaded",
    login: true,
    async script(tab) {
      await tab.waitForSelector("#bot-list .bot-item", { timeout: 20_000 });
      await tab.fill("#input", "Bitte Deploy freigeben: wrangler deploy auf nwebnotfound.");
      await tab.click("#btn-send");
      await tab.waitForSelector(".approval", { timeout: 20_000 });
      await tab.waitForTimeout(350);
      await tab.evaluate(() => {
        const t = document.querySelector("#messages");
        if (t) t.scrollTop = t.scrollHeight;
      });
    },
  },
  {
    group: "panel",
    name: "panel-drawer",
    url: `${PANEL}/`,
    fullPage: false,
    waitUntil: "domcontentloaded",
    login: true,
    only: (vp) => vp.w === 390,
    async script(tab) {
      await tab.waitForSelector("#bot-list .bot-item", { timeout: 20_000 });
      await tab.click("#btn-menu");
      await tab.waitForSelector("body.drawer-open", { timeout: 5_000 });
      await tab.waitForTimeout(300);
    },
  },
  {
    group: "panel",
    name: "panel-newbot",
    url: `${PANEL}/`,
    fullPage: false,
    waitUntil: "domcontentloaded",
    login: true,
    async script(tab, page) {
      await tab.waitForSelector("#bot-list .bot-item", { timeout: 20_000 });
      if (page.w <= 860) {
        await tab.click("#btn-menu");
        await tab.waitForSelector("body.drawer-open", { timeout: 5_000 });
      }
      await tab.click('button[data-view="bots"]');
      await tab.waitForSelector("#btn-new-bot", { state: "visible" });
      await tab.click("#btn-new-bot");
      await tab.waitForSelector("#bot-dialog[open]", { timeout: 5_000 });
      await tab.waitForTimeout(300);
    },
  },
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
  if (page.login) {
    // Mint the dev session through the request context so its cookies land in this context's jar
    // before the first navigation (a redirect-following goto raced the app's /api/me call).
    const login = await context.request.get(`${PANEL}/__dev/login`, { maxRedirects: 0 });
    if (![302, 200].includes(login.status())) throw new Error(`dev login → HTTP ${login.status()}`);
  }
  const res = await tab.goto(page.url, { waitUntil: page.waitUntil || "networkidle", timeout: 45_000 });
  if (!res || res.status() >= 400) throw new Error(`${page.url} → HTTP ${res ? res.status() : "no response"}`);
  await tab.evaluate(() => document.fonts.ready);
  if (page.script) {
    try {
      await page.script(tab, page);
    } catch (err) {
      // One reload+retry: the first paint after /__dev/login occasionally loses the session race.
      if (!page.login) throw err;
      const state = await tab.evaluate(() => ({
        auth: document.documentElement.dataset.auth,
        bots: document.querySelectorAll("#bot-list .bot-item").length,
        text: document.body.innerText.slice(0, 120),
      }));
      console.error(`  ! retry ${page.name} (${page.w}px): ${JSON.stringify(state)}`);
      await tab.screenshot({ path: path.join(OUT, `_retry-${page.name}-${page.w}.png`) });
      await tab.goto(`${PANEL}/__dev/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await tab.goto(page.url, { waitUntil: page.waitUntil || "networkidle", timeout: 45_000 });
      await page.script(tab, page);
    }
  }
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
    if (GROUPS.includes("site") || GROUPS.includes("hub")) wanted.push(`${SITE}/`);
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
        for (const scheme of page.schemes || SCHEMES) {
          for (const vp of VIEWPORTS) {
            if (page.only && !page.only(vp)) continue;
            const outDir = page.out ? path.resolve(ROOT, page.out) : OUT;
            await mkdir(outDir, { recursive: true });
            const file = path.join(outDir, `${page.name}-${vp.tag}-${scheme}.png`);
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
