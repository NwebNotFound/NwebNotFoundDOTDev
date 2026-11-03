// Dev-only screenshot harness for the Summer Theme v2 screens. Never shipped: it lives under
// docs/ and is not imported by the Worker or the SPA.
//
//   node docs/screens/v2/ai/capture.mjs     (inside a Playwright image, see README.md)
//
// It boots the mock Hermes from test/helpers.mjs, runs scripts/dev-server.mjs against it and
// drives headless Chromium over the six AI views at 1280x900 and 390x844. The mockups are
// rendered next to the result so a human can compare them side by side. Every value in the
// screenshots is mock data — no profile names, keys or host paths beyond the loopback server.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { startMockHermes, PANEL_SECRET } from "../../../../test/helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../.."); // ai-panel/
const outDir = process.env.OUT_DIR || here;
const mockupDir = process.env.MOCKUP_DIR || "/work/mockups";
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;

const PAGES = [
  { name: "chat", view: "chat", mockup: "AiChat.html" },
  { name: "bots", view: "bots", mockup: "AiBots.html" },
  { name: "crew", view: "crew", mockup: "AiCrew.html" },
  { name: "cron", view: "cron", mockup: "AiCron.html" },
  { name: "usage", view: "usage", mockup: "AiUsage.html" },
  { name: "log", view: "log", mockup: "AiLog.html" },
];

const mock = await startMockHermes();
mock.state.approvalInStream = true;

const server = spawn(process.execPath, ["scripts/dev-server.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(PORT),
    SESSION_SECRET: "dev-only-session-secret-0000000000000000",
    ALLOWED_DISCORD_ID: "111111111111111111",
    DISCORD_CLIENT_ID: "1566865767029284884",
    PANEL_HOST: `localhost:${PORT}`,
    PANEL_BOTS: "cloudflare,minecraft,discord,homelab",
    HERMES_ORIGIN: mock.url,
    HERMES_PANEL_SECRET: PANEL_SECRET,
  },
});

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.status) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("dev server did not come up");
}
await waitForServer();
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const shot = async (page, file) => {
  await page.waitForTimeout(900); // let the rise/bars animations and the webfonts settle
  await page.screenshot({ path: path.join(outDir, file) });
};

// 1) The mockups (the "Soll") at the reference viewport.
const mockCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const mockPage = await mockCtx.newPage();
for (const p of PAGES) {
  await mockPage.goto(`file://${path.join(mockupDir, p.mockup)}`);
  await shot(mockPage, `mockup-${p.name}-1280.png`);
}
await mockCtx.close();

// 2) The real panel, signed in through the dev-only login route. The mockups are the night
//    variant, so the primary shots run with colorScheme "dark"; one light pass proves the day
//    tokens (the panel's own toggle reads prefers-color-scheme on first load).
for (const pass of [
  { w: 1280, h: 900, tag: "1280", scheme: "dark", prefix: "neu" },
  { w: 390, h: 844, tag: "390", scheme: "dark", prefix: "neu" },
  { w: 1280, h: 900, tag: "1280", scheme: "light", prefix: "day" },
]) {
  const size = pass;
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
    colorScheme: size.scheme,
  });
  await ctx.request.get(`${BASE}/__dev/login`); // 302: mints the session + CSRF cookies
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".view.active", { timeout: 15000 });

  const mobile = size.w <= 860;
  for (const p of PAGES) {
    if (p.view === "chat") {
      await page.fill("#input", "Deploy check");
      await page.click("#btn-send", { timeout: 15000 });
      await page.waitForSelector(".approval", { timeout: 8000 }).catch(() => {});
    } else {
      if (mobile) {
        // The rail is a drawer below 860px; the nav buttons live inside it.
        await page.click("#btn-menu", { timeout: 15000 });
        await page.waitForTimeout(300);
      }
      await page.click(`[data-view="${p.view}"]`, { timeout: 15000 });
      await page.waitForTimeout(600);
    }
    await shot(page, `${size.prefix}-${p.name}-${size.tag}.png`);
    if (p.view === "crew") {
      // The read-only transcript (mockup AiCrew shows it open below the list).
      await page.click("#crew-list .crew-card", { timeout: 15000 }).catch(() => {});
      await page.waitForSelector("#crew-transcript:not(.hidden)", { timeout: 8000 }).catch(() => {});
      await shot(page, `${size.prefix}-crew-transcript-${size.tag}.png`);
    }
  }
  await ctx.close();
}

await browser.close();
server.kill();
await mock.close();
console.log("screens written to", outDir);
