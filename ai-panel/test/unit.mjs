import assert from "node:assert/strict";
import { cleanSoul, isBotName, keyEnvName } from "../src/names.js";
import { createRedactor } from "../src/redact.js";

for (const bad of ["", "A", "a/b", "a;rm", "a$(id)", "a b", "../a", "a".repeat(33), "Bot", "a\nb", "a|b", "a&&b", "a`id`"]) {
  assert.equal(isBotName(bad), false, JSON.stringify(bad));
  assert.equal(keyEnvName(bad), null, JSON.stringify(bad));
}
assert.equal(isBotName("cloudflare"), true);
assert.equal(isBotName("ok-bot-1"), true);
assert.equal(keyEnvName("cloudflare"), "HERMES_KEY_CLOUDFLARE");
assert.equal(keyEnvName("side-bot"), "HERMES_KEY_SIDE_BOT");
assert.equal(cleanSoul("A\u0000B\u200bC"), "ABC");

const red = createRedactor(["hermes-key-cloudflare-SECRET", "dashboard-session-SECRET"]);
assert.equal(red.push("key was hermes-key-cloud") + red.push("flare-SECRET end") + red.end(), "key was [redacted] end");
const token = createRedactor(["dashboard-session-SECRET"]);
assert.equal(token.push("X-Hermes-Session-Token: dashboard-session-SECRET") + token.end(), "X-Hermes-Session-Token: [redacted]");
console.log("ai-unit ok");
