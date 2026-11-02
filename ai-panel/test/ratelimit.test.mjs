import test from "node:test";
import assert from "node:assert/strict";

import { take, reset, LIMITS } from "../src/ratelimit.js";

test("allows up to the limit and then blocks", () => {
  reset();
  const now = 1_000_000;
  for (let i = 0; i < LIMITS.chat.max; i++) {
    assert.equal(take("chat", "user", now).ok, true, `request ${i + 1}`);
  }
  const blocked = take("chat", "user", now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter >= 1);
});

test("buckets are per user", () => {
  reset();
  const now = 2_000_000;
  for (let i = 0; i < LIMITS.chat.max; i++) take("chat", "a", now);
  assert.equal(take("chat", "a", now).ok, false);
  assert.equal(take("chat", "b", now).ok, true);
});

test("window resets after the window elapses", () => {
  reset();
  const now = 3_000_000;
  for (let i = 0; i < LIMITS.api.max; i++) take("api", "u", now);
  assert.equal(take("api", "u", now).ok, false);
  assert.equal(take("api", "u", now + 61_000).ok, true);
});

test("unknown bucket falls back to the api limit", () => {
  reset();
  const r = take("nope", "u", 1);
  assert.equal(r.ok, true);
  assert.equal(r.limit, LIMITS.api.max);
});
