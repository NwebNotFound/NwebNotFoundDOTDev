import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanSoul, isBotName } from "../src/names.js";
import { createRedactor } from "../src/redact.js";
import { LIST_ARGV, RESTART_ARGV, handle, profileArgv, run, start } from "../helper/server.mjs";

for (const bad of ["", "A", "a/b", "a;rm", "a$(id)", "a b", "../a", "a".repeat(33), "Bot", "a\nb", "a|b", "a&&b", "a`id`"]) {
  assert.equal(isBotName(bad), false, JSON.stringify(bad));
  assert.equal(profileArgv(bad), null, JSON.stringify(bad));
}
assert.equal(isBotName("a"), true);
assert.equal(isBotName("cloudflare"), true);
assert.equal(isBotName("a".repeat(32)), true);
assert.equal(isBotName("ok-bot-1"), true);
assert.deepEqual(profileArgv("ok-bot"), ["hermes", "profile", "create", "ok-bot", "--clone"]);
assert.deepEqual(LIST_ARGV, ["hermes", "profile", "list"]);
assert.equal(cleanSoul("A\u0000B\u200bC"), "ABC");

const red = createRedactor(["hermes-key-cloudflare-SECRET"]);
assert.equal(red.push("key was hermes-key-cloud") + red.push("flare-SECRET end") + red.end(), "key was [redacted] end");

const spawned = await run(["node", "-e", "console.log('a;echo injected')"]);
assert.equal(spawned.code, 0);
assert.equal(spawned.stdout.trim(), "a;echo injected");

const calls = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-helper-"));
const ctx = {
  key: "helper-key-test",
  dir,
  keygen: () => "generated-helper-key-SECRET",
  run: async (argv) => { calls.push(argv); return { code: 0, stdout: "cloudflare minecraft\n", stderr: "" }; },
};
assert.equal((await handle(new Request("http://127.0.0.1/profiles"), ctx)).status, 401);
assert.equal((await handle(new Request("http://127.0.0.1/profiles", { method: "POST", headers: { authorization: "Bearer helper-key-test", "content-type": "application/json" }, body: JSON.stringify({ name: "a;rm -rf /" }) }), ctx)).status, 400);
assert.equal(calls.length, 0);
const created = await handle(new Request("http://127.0.0.1/profiles", { method: "POST", headers: { authorization: "Bearer helper-key-test", "content-type": "application/json" }, body: JSON.stringify({ name: "ok-bot", soul: "Hallo\u0000" }) }), ctx);
assert.equal(created.status, 200);
const made = await created.json();
assert.equal(made.name, "ok-bot");
assert.equal(made.key, "generated-helper-key-SECRET");
assert.deepEqual(calls[0], profileArgv("ok-bot"));
assert.deepEqual(calls[1], RESTART_ARGV);
assert.ok(calls.every((argv) => Array.isArray(argv) && argv.every((part) => part !== made.key)));
const soul = fs.readFileSync(path.join(dir, "ok-bot", "SOUL.md"), "utf8");
assert.match(soul, /^Hallo/);
assert.equal(soul.includes("\u0000"), false);
assert.equal(fs.readFileSync(path.join(dir, "ok-bot", "api_key"), "utf8").trim(), made.key);
const listed = await handle(new Request("http://127.0.0.1/profiles", { headers: { authorization: "Bearer helper-key-test" } }), ctx);
assert.deepEqual((await listed.json()).profiles.sort(), ["cloudflare", "minecraft"]);

const server = start({ port: 0, key: "helper-key-test", dir, run: ctx.run, keygen: ctx.keygen });
await new Promise((resolve) => server.once("listening", resolve));
assert.equal(server.address().address, "127.0.0.1");
assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/profiles`)).status, 401);
await new Promise((resolve) => server.close(resolve));
console.log("ai-unit ok");
