// Redaction rules. These run on text the panel did not author (session titles, tool output,
// message bodies), so the tests are written as "a leak would look like this".

import test from "node:test";
import assert from "node:assert/strict";

import { MASK, clampInt, redactText, redactValue, sessionKind } from "../src/redact.js";

const cases = [
  ["openrouter key", "OPENROUTER_API_KEY=sk-or-v1-0123456789abcdef0123456789abcdef", "sk-or-v1-0123456789abcdef0123456789abcdef"],
  ["bare sk key", "nothing to see sk-proj-AbCdEf0123456789AbCdEf0123456789 done"],
  ["github classic", "token ghp_0123456789abcdefghijABCDEFGHIJ012345"],
  ["github fine grained", "pat github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ"],
  ["slack", "xoxb-123456789012-abcdefghijklmnop"],
  ["aws", "AKIAIOSFODNN7EXAMPLE"],
  ["gitlab", "glpat-AbCdEf0123456789AbCd"],
  ["bearer header", "Authorization: Bearer abcdefghijklmnop123456", "abcdefghijklmnop123456"],
  ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"],
  ["env line", "DB_PASSWORD=hunter2correcthorse", "hunter2correcthorse"],
  ["env line lower", "client_secret: s3cr3t-value", "s3cr3t-value"],
  ["db url", "postgres://nils:pw-in-the-url@127.0.0.1:5432/db", "pw-in-the-url"],
  ["hex blob", "sha 3f4b2c1d9e8a7b6c5d4e3f2a1b0c9d8e"],
  ["base64 blob", "blob Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbA=="],
];

for (const [name, input, explicit] of cases) {
  test(`redacts ${name}`, () => {
    const out = redactText(input);
    assert.ok(out.includes(MASK), `expected a mask in ${JSON.stringify(out)}`);
    // The value itself must be gone, not just decorated.
    const tokens = explicit ? [explicit] : input.split(/[\s=:"']+/).filter((t) => t.length >= 12);
    for (const token of tokens) assert.ok(!out.includes(token), `${token} survived: ${out}`);
  });
}

test("keeps ordinary text and short identifiers", () => {
  for (const text of [
    "Deploy check",
    "commit 2ae1d1f fix(ai-panel): login reload loop",
    "/api/bots/cloudflare/sessions",
    "run_9f2c1a4b",
    "exit code 0 after 12.4s",
    "Eine Nachricht mit Umlauten: äöü ß",
  ]) {
    assert.equal(redactText(text), text);
  }
});

test("redactValue walks objects and arrays depth-first", () => {
  const input = {
    bot: "cloudflare",
    sessions: [{ title: "KEY=sk-live-0123456789abcdef", message_count: 3 }],
    nested: { deeper: ["ok", "Bearer zzzzzzzzzzzzzzzz"] },
  };
  const out = redactValue(input);
  assert.equal(out.bot, "cloudflare");
  assert.equal(out.sessions[0].message_count, 3);
  assert.ok(out.sessions[0].title.includes(MASK));
  assert.ok(out.nested.deeper[1].includes(MASK));
  assert.equal(out.nested.deeper[0], "ok");
});

test("redactValue survives a pathological depth without throwing", () => {
  let deep = "leaf";
  for (let i = 0; i < 50; i += 1) deep = { next: deep };
  assert.doesNotThrow(() => redactValue(deep));
});

test("clampInt clamps instead of trusting the query string", () => {
  assert.equal(clampInt("999", { min: 1, max: 200, dflt: 50 }), 200);
  assert.equal(clampInt("-4", { min: 0, max: 100, dflt: 5 }), 0);
  assert.equal(clampInt("abc", { min: 1, max: 200, dflt: 50 }), 50);
  assert.equal(clampInt("", { min: 1, max: 200, dflt: 50 }), 50);
  assert.equal(clampInt("12.9", { min: 1, max: 200, dflt: 50 }), 12);
  assert.equal(clampInt("1e9", { min: 0, max: 100_000, dflt: 5 }), 100_000);
});

test("sessionKind classifies runs, CLI sessions and everything else", () => {
  assert.equal(sessionKind("run_9f2c1a4b"), "run");
  assert.equal(sessionKind("local-20261102-091400"), "cli");
  assert.equal(sessionKind("20260101_120000_aaaaaa"), "other");
  assert.equal(sessionKind(""), "other");
});
