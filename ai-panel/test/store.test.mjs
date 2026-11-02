// The Durable Object that makes the rate limiter and the request log survive an isolate
// going away. Exercised with a fake storage so it runs under plain node --test.

import test from "node:test";
import assert from "node:assert/strict";

import {
  PanelStore,
  rateTake,
  logAppend,
  logRecent,
  revokedBefore,
  revokeAll,
  invalidateRevokedCache,
  resetCache,
  REVOKED_CACHE_TTL_MS,
} from "../src/store.js";
import { LIMITS, reset as resetLocal } from "../src/ratelimit.js";

function fakeStorage() {
  const map = new Map();
  return {
    map,
    async get(k) {
      return map.get(k);
    },
    async put(k, v) {
      map.set(k, v);
    },
    async delete(k) {
      if (Array.isArray(k)) for (const x of k) map.delete(x);
      else map.delete(k);
    },
    async list({ prefix = "" } = {}) {
      return new Map([...map].filter(([k]) => k.startsWith(prefix)));
    },
  };
}

function makeStore() {
  const storage = fakeStorage();
  const store = new PanelStore({ storage }, {});
  return { store, storage };
}

const post = (store, path, body) =>
  store.fetch(new Request(`https://panel-store${path}`, { method: "POST", body: JSON.stringify(body) }));

test("rate: allows up to max, then blocks, per bucket+id", async () => {
  const { store } = makeStore();
  for (let i = 0; i < 3; i++) {
    const res = await post(store, "/rate", { bucket: "chat", id: "u1", max: 3, window: 60 });
    assert.equal((await res.json()).ok, true, `request ${i + 1}`);
  }
  const blocked = await (await post(store, "/rate", { bucket: "chat", id: "u1", max: 3, window: 60 })).json();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter >= 1);

  const other = await (await post(store, "/rate", { bucket: "chat", id: "u2", max: 3, window: 60 })).json();
  assert.equal(other.ok, true, "buckets are per id");
});

test("rate: the window resets", async () => {
  const { store, storage } = makeStore();
  await post(store, "/rate", { bucket: "api", id: "u", max: 1, window: 60 });
  const blocked = await (await post(store, "/rate", { bucket: "api", id: "u", max: 1, window: 60 })).json();
  assert.equal(blocked.ok, false);
  // age the bucket past its window
  const key = "rl:api:u";
  const entry = await storage.get(key);
  await storage.put(key, { ...entry, reset: Date.now() - 1 });
  const again = await (await post(store, "/rate", { bucket: "api", id: "u", max: 1, window: 60 })).json();
  assert.equal(again.ok, true);
});

test("log: keeps the newest 200 rows, newest first", async () => {
  const { store } = makeStore();
  for (let i = 0; i < 250; i++) await post(store, "/log", { path: `/api/x/${i}`, status: 200 });
  const res = await store.fetch(new Request("https://panel-store/log?limit=5"));
  const { entries } = await res.json();
  assert.equal(entries.length, 5);
  assert.equal(entries[0].path, "/api/x/249");
  assert.equal(entries[4].path, "/api/x/245");

  const all = await (await store.fetch(new Request("https://panel-store/log?limit=1000"))).json();
  assert.equal(all.entries.length, 200, "ring is bounded");
});

test("revoked: a marker round-trips", async () => {
  const { store } = makeStore();
  const empty = await (await store.fetch(new Request("https://panel-store/revoked"))).json();
  assert.equal(empty.before, 0);
  const set = await (await post(store, "/revoked", { before: 1700000000 })).json();
  assert.equal(set.before, 1700000000);
  const read = await (await store.fetch(new Request("https://panel-store/revoked"))).json();
  assert.equal(read.before, 1700000000);
});

test("unknown store route is 404", async () => {
  const { store } = makeStore();
  const res = await store.fetch(new Request("https://panel-store/nope"));
  assert.equal(res.status, 404);
});

// ---- client helpers -------------------------------------------------------------------

function fakeNamespace() {
  const storage = fakeStorage();
  const store = new PanelStore({ storage }, {});
  return {
    idFromName: (n) => n,
    get: () => ({ fetch: (url, init) => store.fetch(new Request(url, init)) }),
  };
}

test("helpers use the Durable Object when the binding is present", async () => {
  resetLocal();
  const env = { PANEL_STORE: fakeNamespace() };
  for (let i = 0; i < LIMITS.chat.max; i++) {
    assert.equal((await rateTake(env, "chat", "u")).ok, true);
  }
  const blocked = await rateTake(env, "chat", "u");
  assert.equal(blocked.ok, false);

  await logAppend(env, { method: "GET", path: "/api/me", status: 200, ms: 3 });
  const rows = await logRecent(env, 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, "/api/me");
});

test("helpers fall back to memory without a binding", async () => {
  resetLocal();
  resetCache();
  const env = {};
  assert.equal((await rateTake(env, "chat", "u")).ok, true);
  await logAppend(env, { method: "GET", path: "/api/fallback", status: 200 });
  const rows = await logRecent(env, 5);
  assert.ok(rows.some((r) => r.path === "/api/fallback"));
  assert.equal(await revokedBefore(env), 0);
});

test("a broken store falls back to memory instead of failing the request", async () => {
  resetLocal();
  const env = {
    PANEL_STORE: {
      idFromName: () => "x",
      get: () => ({
        fetch: async () => {
          throw new Error("store down");
        },
      }),
    },
  };
  const r = await rateTake(env, "api", "u");
  assert.equal(r.ok, true);
  const rows = await logRecent(env, 5);
  assert.ok(Array.isArray(rows));
});

test("revokeAll sets the marker the helpers read back", async () => {
  resetCache();
  const env = { PANEL_STORE: fakeNamespace() };
  const before = await revokeAll(env);
  assert.ok(before > 0);
  assert.equal(await revokedBefore(env), before);
  resetCache();
});

// The marker cache is a per-isolate shortcut for a value that changes on logout. A stale entry
// must die at the logout call, not at the TTL, and the TTL itself must stay short.

/** Write the marker behind the cache's back — what another isolate's revokeAll would do. */
async function writeMarker(env, before) {
  await env.PANEL_STORE.get("panel").fetch("https://panel-store/revoked", {
    method: "POST",
    body: JSON.stringify({ before }),
  });
}

test("the revocation cache lives at most five seconds", () => {
  assert.ok(REVOKED_CACHE_TTL_MS > 0, "the cache must have a TTL");
  assert.ok(REVOKED_CACHE_TTL_MS <= 5_000, `TTL ${REVOKED_CACHE_TTL_MS} ms exceeds the 5 s cap`);
});

test("a logout drops the cached marker immediately", async () => {
  resetCache();
  const env = { PANEL_STORE: fakeNamespace() };
  assert.equal(await revokedBefore(env), 0, "the empty marker is cached");

  await writeMarker(env, 1700000000);
  assert.equal(await revokedBefore(env), 0, "served from the cache until the logout");

  invalidateRevokedCache();
  assert.equal(await revokedBefore(env), 1700000000, "re-read right after the logout");
  resetCache();
});

test("sign out everywhere clears every cached marker and keeps the fresh one", async () => {
  resetCache();
  const env = { PANEL_STORE: fakeNamespace() };
  assert.equal(await revokedBefore(env), 0);
  await writeMarker(env, 1700000000);

  const before = await revokeAll(env);
  assert.ok(before > 1700000000, "the new marker is now");
  assert.equal(await revokedBefore(env), before, "no stale entry survives the call");
  resetCache();
});

test("without an explicit logout the marker still expires within the TTL", async (t) => {
  resetCache();
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const env = { PANEL_STORE: fakeNamespace() };
  assert.equal(await revokedBefore(env), 0);

  await writeMarker(env, 1700000000);
  assert.equal(await revokedBefore(env), 0, "still cached");

  t.mock.timers.tick(REVOKED_CACHE_TTL_MS + 1);
  assert.equal(await revokedBefore(env), 1700000000, "stale entry is gone after the TTL");
  resetCache();
});
