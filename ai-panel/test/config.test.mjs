import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cfg = JSON.parse(
  (await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8")).replace(/^\s*\/\/.*$/gm, ""),
);

test("auth and api routes run the Worker before the SPA asset fallback", () => {
  assert.ok(cfg.assets.run_worker_first.includes("/auth/*"));
  assert.ok(cfg.assets.run_worker_first.includes("/api/*"));
});

test("no public workers.dev or preview URLs", () => {
  assert.equal(cfg.workers_dev, false);
  assert.equal(cfg.preview_urls, false);
});

test("static assets carry frame-ancestors 'none'", async () => {
  const h = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(h, /frame-ancestors 'none'/);
});
