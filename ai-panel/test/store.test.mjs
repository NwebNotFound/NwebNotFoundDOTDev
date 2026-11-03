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
  fitValue,
  VALUE_BYTES_MAX,
  CONVERSATION_BYTES_MAX,
  messageAppend,
  messageList,
  conversationUpsert,
  resetConversations,
} from "../src/store.js";
import { LIMITS, reset as resetLocal } from "../src/ratelimit.js";

// What the KV-backed Durable Object enforces per stored value (and what no key may ever exceed).
const VALUE_LIMIT = 128 * 1024;
const valueBytes = (v) => Buffer.byteLength(JSON.stringify(v) ?? "", "utf8");

function fakeStorage() {
  const map = new Map();
  return {
    map,
    async get(k) {
      if (Array.isArray(k)) return new Map(k.map((x) => [x, map.get(x)]));
      return map.get(k);
    },
    async put(k, v) {
      const n = valueBytes(v);
      // The real DO rejects an oversized value. Throwing here is the point of the test: a single
      // key holding a whole transcript must fail loudly instead of silently losing history.
      if (n > VALUE_LIMIT) throw new Error(`value ${k} is ${n} bytes, over the ${VALUE_LIMIT} byte limit`);
      map.set(k, structuredClone(v));
    },
    async delete(k) {
      if (Array.isArray(k)) for (const x of k) map.delete(x);
      else map.delete(k);
    },
    async list({ prefix = "", start, end, reverse = false, limit } = {}) {
      let keys = [...map.keys()].sort();
      keys = keys.filter((k) => k.startsWith(prefix));
      if (start !== undefined) keys = keys.filter((k) => k > start);
      if (end !== undefined) keys = keys.filter((k) => k < end);
      if (reverse) keys.reverse();
      if (limit !== undefined) keys = keys.slice(0, limit);
      return new Map(keys.map((k) => [k, map.get(k)]));
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

// ---- chat history storage ---------------------------------------------------------------
//
// The old layout kept a whole transcript in one key (`msgs:<conv>`), which blows past the
// per-value limit after a handful of long answers and loses the history on the first failed
// put. These tests are the guard rail for that: one row per key, a byte budget per thread,
// cursor pagination and pruning that takes the rows with it.

const CONV = "c_test1234";
const longText = (n) => "ä".repeat(n); // 2 bytes per char in UTF-8, so it also exercises the cap

function assertAllValuesSmall(storage) {
  let biggest = 0;
  for (const [key, value] of storage.map) {
    const n = valueBytes(value);
    if (n > biggest) biggest = n;
    assert.ok(n <= 128 * 1024, `key ${key} holds ${n} bytes, over the Durable Object limit`);
  }
  return biggest;
}

test("a conversation bigger than one value is stored one row per key and still reads back", async () => {
  const { store, storage } = makeStore();
  const rows = 260;
  for (let i = 0; i < rows; i++) {
    const res = await post(store, "/messages", {
      conversation_id: CONV,
      role: i % 2 ? "assistant" : "user",
      content: longText(9_000) + `#${i}`,
      run_id: `run_${i}`,
    });
    assert.equal(res.status, 200, `row ${i} accepted`);
  }
  // No single key may ever carry the transcript: rows live in `msg:<conv>:<seq>`.
  const msgKeys = [...storage.map.keys()].filter((k) => k.startsWith(`msg:${CONV}:`));
  assert.ok(msgKeys.length > 1, "rows are spread over keys");
  for (const key of msgKeys) assert.match(key, new RegExp(`^msg:${CONV}:\\d{10}$`));
  const biggest = assertAllValuesSmall(storage);
  assert.ok(biggest < 128 * 1024, `largest value ${biggest} B stays under the limit`);

  const page = await (await store.fetch(new Request(`https://panel-store/messages?conversation_id=${CONV}&limit=50`))).json();
  assert.equal(page.messages.length, 50);
  assert.equal(page.has_more, true);
  assert.ok(page.next_before > 1, "a cursor for the older page");
  assert.ok(page.total >= 50);
  // newest page, oldest row first
  assert.ok(page.messages[0].seq < page.messages.at(-1).seq);
  assert.match(page.messages.at(-1).content, /#\d+$/);
});

test("cursor pagination walks backwards page by page without gaps or repeats", async () => {
  const { store } = makeStore();
  for (let i = 0; i < 120; i++) {
    await post(store, "/messages", { conversation_id: CONV, role: "user", content: `m${i}` });
  }
  const seen = [];
  let before = 0;
  for (let guard = 0; guard < 10; guard++) {
    const q = `conversation_id=${CONV}&limit=50${before ? `&before=${before}` : ""}`;
    const page = await (await store.fetch(new Request(`https://panel-store/messages?${q}`))).json();
    seen.unshift(...page.messages.map((m) => m.content));
    if (!page.has_more) break;
    before = page.next_before;
  }
  assert.equal(seen.length, 120, "every row is reachable");
  assert.deepEqual(seen, Array.from({ length: 120 }, (_, i) => `m${i}`), "order is oldest first, no duplicates");
});

test("the per-conversation byte budget drops the oldest rows and keeps the newest", async () => {
  const { store, storage } = makeStore();
  for (let i = 0; i < 300; i++) {
    await post(store, "/messages", { conversation_id: CONV, role: "user", content: longText(9_000) + `#${i}` });
  }
  const meta = await storage.get(`mmeta:${CONV}`);
  assert.ok(meta.bytes <= CONVERSATION_BYTES_MAX, `thread bytes ${meta.bytes} within the budget`);
  assert.ok(meta.dropped > 0, "old rows were pruned");
  assert.equal(meta.count, [...storage.map.keys()].filter((k) => k.startsWith(`msg:${CONV}:`)).length, "count matches the keys");

  const page = await (await store.fetch(new Request(`https://panel-store/messages?conversation_id=${CONV}&limit=5`))).json();
  assert.match(page.messages.at(-1).content, /#299$/, "the newest row survived");
  assert.ok(page.dropped > 0, "the API says the transcript was trimmed");
});

test("a run's final answer updates its row instead of appending a second one", async () => {
  const { store, storage } = makeStore();
  await post(store, "/messages", { conversation_id: CONV, role: "user", content: "frage", run_id: "run_X" });
  await post(store, "/messages", { conversation_id: CONV, role: "assistant", content: "teil 1", run_id: "run_X" });
  await post(store, "/messages", { conversation_id: CONV, role: "assistant", content: "ganz fertig", run_id: "run_X" });

  const keys = [...storage.map.keys()].filter((k) => k.startsWith(`msg:${CONV}:`));
  assert.equal(keys.length, 2, "user row + one assistant row");
  const page = await (await store.fetch(new Request(`https://panel-store/messages?conversation_id=${CONV}`))).json();
  assert.deepEqual(page.messages.map((m) => m.content), ["frage", "ganz fertig"]);
  assert.equal(page.messages[1].seq, 2, "the row keeps its seq");
});

test("fitValue trims an oversized row instead of failing the put", () => {
  const row = fitValue({ role: "tool", content: "x".repeat(400_000) });
  assert.equal(row.truncated, true);
  assert.ok(valueBytes(row) <= VALUE_BYTES_MAX + 1024, "fits the budget");
  assert.ok(row.content.length > 0, "keeps a usable prefix");
  assert.equal(fitValue({ role: "user", content: "kurz" }).truncated, undefined, "small rows are untouched");
});

test("pruning the conversation list takes the thread's message keys with it", async () => {
  const { store, storage } = makeStore();
  for (let i = 0; i < 105; i++) {
    const id = `c_old${String(i).padStart(4, "0")}`;
    await post(store, "/conversations", { id, bot: "cloudflare", title: `chat ${i}` });
    await post(store, "/messages", { conversation_id: id, role: "user", content: `hallo ${i}` });
    // keep updated_at increasing so the oldest thread is unambiguous
    const rows = await storage.get("conversations");
    const row = rows.find((r) => r.id === id);
    row.updated_at = 1_700_000_000_000 + i;
    await storage.put("conversations", rows);
  }
  const convs = await (await store.fetch(new Request("https://panel-store/conversations?limit=200"))).json();
  assert.equal(convs.conversations.length, 100, "list is bounded");
  assert.equal(convs.conversations.some((c) => c.id === "c_old0000"), false, "the oldest thread is gone");
  assert.equal(
    [...storage.map.keys()].some((k) => k.startsWith("msg:c_old0000:")),
    false,
    "its rows are gone too, not orphaned",
  );
  assert.equal(storage.map.has("mmeta:c_old0000"), false, "and its meta key");
  assert.ok(storage.map.has("msg:c_old0104:0000000001"), "the newest thread is intact");
});

test("helpers fall back to the same shape without a store binding", async () => {
  resetConversations();
  const env = {};
  await conversationUpsert(env, { id: CONV, bot: "cloudflare", title: "Fallback" });
  for (let i = 0; i < 70; i++) await messageAppend(env, { conversation_id: CONV, role: "user", content: `f${i}` });

  const newest = await messageList(env, { conversationId: CONV, limit: 50 });
  assert.equal(newest.messages.length, 50);
  assert.equal(newest.has_more, true);
  assert.equal(newest.next_before, newest.messages[0].seq);

  const older = await messageList(env, { conversationId: CONV, limit: 50, before: newest.next_before });
  assert.equal(older.messages.length, 20, "the remaining rows");
  assert.equal(older.has_more, false);
  assert.equal(older.messages[0].content, "f0");
  resetConversations();
});
