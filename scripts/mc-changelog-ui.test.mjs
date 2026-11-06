import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import worker from "../src/worker.js";
import { bundleCss } from "./fixtures/bundle-asset.mjs";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const response = await worker.fetch(new Request("https://mc.nwebnotfound.dev/changelog"), {}, {});
assert.equal(response.status, 200);
const html = await response.text();

for (const width of [390, 1280]) {
  test(`changelog timeline fits ${width}px and uses soft cards`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== "mc.nwebnotfound.dev") return route.abort();
        if (url.pathname === "/changelog") return route.fulfill({ contentType: "text/html", body: html });
        if (url.pathname === "/bundle/mc.css") return route.fulfill({ contentType: "text/css", body: await bundleCss(root, url.href) });
        const file = resolve(root, `.${url.pathname}`);
        if (!file.startsWith(resolve(root) + "\\") && !file.startsWith(resolve(root) + "/")) return route.abort();
        try {
          const body = await readFile(file);
          const contentType = url.pathname.endsWith(".css") ? "text/css" : url.pathname.endsWith(".js") ? "application/javascript" : "application/octet-stream";
          return route.fulfill({ contentType, body });
        } catch { return route.abort(); }
      });
      await page.goto("https://mc.nwebnotfound.dev/changelog");
      const result = await page.evaluate(() => {
        const card = document.querySelector(".clg"), timeline = document.querySelector(".cl-timeline");
        const cs = getComputedStyle(card), rail = getComputedStyle(timeline, "::before");
        return { scrollWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
          left: card.getBoundingClientRect().left, right: card.getBoundingClientRect().right,
          radius: cs.borderTopLeftRadius, padding: cs.paddingLeft, rail: rail.content,
          animation: cs.animationName, items: document.querySelectorAll(".cll li").length };
      });
      assert.equal(result.items, 4);
      assert.ok(result.scrollWidth <= result.viewport, JSON.stringify(result));
      assert.ok(result.left >= 0 && result.right <= width, JSON.stringify(result));
      assert.equal(result.radius, "22px");
      assert.ok(parseFloat(result.padding) >= 16, JSON.stringify(result));
      assert.notEqual(result.rail, "none", JSON.stringify(result));
      assert.equal(result.animation, "none");
    } finally { await browser.close(); }
  });
}
