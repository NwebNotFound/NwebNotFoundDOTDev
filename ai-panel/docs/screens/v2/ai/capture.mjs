// Dev-only screenshot harness for the Summer Theme v2 screens. Never shipped: it lives under
// docs/ and is not imported by the Worker or the SPA.
//
//   node docs/screens/v2/ai/capture.mjs     (inside a Playwright image, see README.md)
//
// It boots the mock Hermes from test/helpers.mjs, runs scripts/dev-server.mjs against it and
// drives headless Chromium over the six AI views at 1280x900 and 390x844. The mockups are
// rendered next to the result so a human can compare them side by side. A final "stress" pass
// pushes long names, big numbers, a long log path and a wide markdown table through the same UI,
// and one frame is grabbed in the middle of a view transition. Every value in the screenshots is
// mock data — no profile names, keys or host paths beyond the loopback server.

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

// ---- stress fixtures: long names, big numbers, an unbreakable word, a wide table -------------
const LONG_BOT = "stress-bot-mit-sehr-langem-namen"; // the panel's API caps bot names at 32 chars
const LONG_WORD = "Donaudampfschifffahrtsgesellschaftsdampfschifffahrtskapitän";
const mdCode = [
  "```js",
  'const x = "ein sehr langer code-string, der im Kasten horizontal scrollen soll".repeat(2);',
  "```",
].join("\n");
const STRESS_ANSWER = [
  "## Stress-Test: Zahlen, Namen und Umbrüche",
  "",
  `Ein Absatz mit Umlauten (äöüß ÄÖÜ €) und einem ununterbrochenen Wort: ${LONG_WORD}.`,
  "",
  "- Erster Punkt mit **fettem** Text und `inlineCode`",
  "- Zweiter Punkt mit 1.234.567,89 Tokens und 9.876,54 $",
  "",
  "> Ein Zitat, das im 390-px-Layout sauber umbrechen soll.",
  "",
  "| Modell | Tokens | Kosten |",
  "| --- | --- | --- |",
  "| vendor/very-long-model-identifier-2027 | 1.234.567 | 1.234.567,89 $ |",
  "| deepseek/deepseek-v4.1-flash-1017 | 987.654 | 9.876,54 $ |",
  "| modellname-ohne-leerzeichen-und-sehr-lang-2027 | 12.345 | 123,45 $ |",
  "",
  mdCode,
].join("\n");

const mock = await startMockHermes();
mock.state.approvalInStream = true;
mock.state.runOutput = STRESS_ANSWER;
mock.state.profiles.push({
  name: LONG_BOT,
  description: "Ein sehr langer Beschreibungstext für den Umbruchtest mit Umlauten: äöüß ÄÖÜ",
  model: "vendor/very-long-model-identifier-2027",
  provider: "openrouter",
  gateway_running: true,
});
const nowS = Math.floor(Date.now() / 1000);
mock.state.sessions.unshift({
  id: "stress-run-0001",
  title: `Sehr langer Titel mit Umlauten äöüß und ohne Leerzeichen ${LONG_WORD}${LONG_WORD}`,
  status: "running",
  source: "panel",
  model: "vendor/very-long-model-identifier-2027",
  input_tokens: 1234567,
  output_tokens: 987654,
  estimated_cost_usd: 1234567.8912,
  api_call_count: 3,
  started_at: nowS - 300,
  last_active: nowS - 60,
  message_count: 12345,
});

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
    PANEL_BOTS: ["cloudflare", "minecraft", "discord", "homelab", LONG_BOT].join(","),
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
  await page.screenshot({ path: path.join(outDir, file), timeout: 15000 });
};

async function signIn(w, h, scheme) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    colorScheme: scheme,
  });
  await ctx.request.get(`${BASE}/__dev/login`); // 302: mints the session + CSRF cookies
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000); // never wait forever on a missing selector
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".view.active", { timeout: 15000 });
  return { ctx, page };
}

async function openView(page, view, mobile) {
  if (view === "chat") {
    await page.fill("#input", "Deploy check");
    await page.click("#btn-send", { timeout: 15000 });
    await page.waitForSelector(".approval", { timeout: 8000 }).catch(() => {});
    return;
  }
  if (mobile) {
    await page.click("#btn-menu", { timeout: 15000 }); // the rail is a drawer below 860px
    await page.waitForTimeout(300);
  }
  await page.click(`[data-view="${view}"]`, { timeout: 15000 });
  await page.waitForTimeout(600);
}

// 1) The mockups (the "Soll") at the reference viewport.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(`file://${path.join(mockupDir, p.mockup)}`);
    await shot(page, `mockup-${p.name}-1280.png`);
  }
  await ctx.close();
}

// 2) The real panel. The mockups are the night variant, so the primary shots run with
//    colorScheme "dark"; one light pass proves the day tokens (the panel's own toggle reads
//    prefers-color-scheme on first load).
for (const pass of [
  { w: 1280, h: 900, tag: "1280", scheme: "dark", prefix: "neu" },
  { w: 390, h: 844, tag: "390", scheme: "dark", prefix: "neu" },
  { w: 1280, h: 900, tag: "1280", scheme: "light", prefix: "day" },
]) {
  const { ctx, page } = await signIn(pass.w, pass.h, pass.scheme);
  const mobile = pass.w <= 860;
  for (const p of PAGES) {
    await openView(page, p.view, mobile);
    await shot(page, `${pass.prefix}-${p.name}-${pass.tag}.png`);
    if (p.view === "crew") {
      // The read-only transcript (mockup AiCrew shows it open below the list).
      await page.click("#crew-list .crew-card", { timeout: 15000 }).catch(() => {});
      await page.waitForSelector("#crew-transcript:not(.hidden)", { timeout: 8000 }).catch(() => {});
      await shot(page, `${pass.prefix}-crew-transcript-${pass.tag}.png`);
    }
  }
  if (pass.tag === "1280" && pass.scheme === "dark") {
    // Evidence for the view transition: the animation is slowed down for the still (a 240ms fade
    // is gone before the screenshot round-trip), then one frame is grabbed mid-transition. The
    // duration is a CSS token, so CSSOM can override it — an injected <style> would be blocked by
    // the page's own `style-src 'self'` CSP.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--vt-dur-out", "3s");
      document.documentElement.style.setProperty("--vt-dur-in", "3s");
    });
    await page.click('[data-view="cron"]', { timeout: 15000 });
    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(outDir, "transition-cron-1280.png") });
  }
  await ctx.close();
}

// 3) Stress pass: a long message, a wide markdown table, a long log path and big figures.
{
  const { ctx, page } = await signIn(1280, 900, "dark");
  // A path long enough that the log row has to clip it (the panel logs the pathname, so the
  // length has to come from the route, not from a query string).
  await ctx.request.get(`${BASE}/api/bots/cloudflare/conversations/${"z".repeat(64)}/messages`);
  await page.fill("#input", LONG_WORD.repeat(2));
  await page.click("#btn-send", { timeout: 15000 });
  await page.waitForSelector(".approval", { timeout: 8000 }).catch(() => {});
  await shot(page, "stress-chat-1280.png");
  await openView(page, "bots", false);
  await shot(page, "stress-bots-1280.png");
  await openView(page, "usage", false);
  await shot(page, "stress-usage-1280.png");
  await openView(page, "log", false);
  await shot(page, "stress-log-1280.png");
  await ctx.close();
}
{
  const { ctx, page } = await signIn(390, 844, "dark");
  // Send the long message here too, so the mobile thread is deterministic.
  await page.fill("#input", LONG_WORD.repeat(2));
  await page.click("#btn-send", { timeout: 15000 });
  await page.waitForSelector(".approval", { timeout: 8000 }).catch(() => {});
  await shot(page, "stress-chat-390.png");
  await ctx.close();
}

await browser.close();
server.kill();
await mock.close();
console.log("screens written to", outDir);
