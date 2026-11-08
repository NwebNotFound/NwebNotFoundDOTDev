#!/usr/bin/env node
// Robustheit des Worker-Routings (Issue #86): kaputte %-Folgen in Pfad/Cookie und ungefangene
// Fehler dürfen nie als Cloudflare-1101 enden. Läuft allein und wird von scripts/e2e.mjs importiert.
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { safeDecode } from "../src/safe-decode.js";

assert.equal(safeDecode("a%20b"), "a b");
assert.equal(safeDecode("%E0"), null);
assert.equal(safeDecode("%ZZ"), null);
assert.equal(safeDecode(undefined), "");

// D1-Attrappe: jede Abfrage liefert "nichts"; mit boom=true wirft jede Abfrage.
const mkEnv = (boom = false) => {
  const stmt = { bind: () => stmt, first: async () => { if (boom) throw new Error("db down"); return null; }, all: async () => { if (boom) throw new Error("db down"); return { results: [] }; }, run: async () => { if (boom) throw new Error("db down"); return { meta: { changes: 0 } }; } };
  return { DB: { prepare: () => stmt, batch: async () => [] }, SESSION_SECRET: "s", DISCORD_CLIENT_ID: "1", DISCORD_CLIENT_SECRET: "x" };
};
const go = (path, { host = "mc.nwebnotfound.dev", cookie, env = mkEnv(), method = "GET" } = {}) =>
  worker.fetch(new Request("https://" + host + path, { method, headers: { host, ...(cookie ? { cookie } : {}) } }), env, { waitUntil() {} });

for (const p of ["/spieler/%E0", "/shops/%ZZ", "/auktionen/%E0", "/markt/%E0", "/markt/null%"]) {
  const r = await go(p); assert.equal(r.status, 404, p + " → 404");
}
for (const p of ["/api/mc-players/%ZZ", "/api/mc-pvp/%E0", "/api/mc-auctions/%E0", "/api/mc-shops/%ZZ", "/mc-mob/%E0"]) {
  const r = await go(p); assert.equal(r.status, 404, p + " → 404");
}
assert.equal((await go("/api/mc-market/%E0")).status, 400, "/api/mc-market/%E0 → 400");
{ const r = await go("/api/mc-vip/worlds/%E0/start", { method: "POST" }); assert.equal(r.status, 404, "VIP-Pfad mit kaputter %-Folge → 404"); }
// Kaputte Cookie: Hub-Startseite rendert trotzdem, /api/me antwortet ohne User
{ const r = await go("/", { host: "nwebnotfound.dev", cookie: "nnf_lang=%E0; foo; nnf_session=%ZZ" }); assert.equal(r.status, 200, "Startseite mit kaputter Cookie → 200"); }
{ const r = await go("/api/me", { host: "nwebnotfound.dev", cookie: "nnf_session=%E0" }); assert.equal(r.status, 200); assert.equal((await r.json()).user, null); }
// Ungefangener Fehler (D1 wirft) → sauberes 500 statt Exception
{ const r = await go("/api/guestbook", { host: "nwebnotfound.dev", env: mkEnv(true) }); assert.equal(r.status, 500, "Fehler → 500"); assert.equal((await r.json()).error, "Interner Fehler"); }
// D1-Tageslimit (Free Tier, 08.11.2026): weiches 503 mit Retry-After bis Mitternacht UTC statt 500
{ const env = { DB: { prepare: () => { throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC)"); } } };
  const r = await go("/api/guestbook", { host: "nwebnotfound.dev", env });
  const ra = Number(r.headers.get("retry-after"));
  assert.equal(r.status, 503, "D1-Limit → 503"); assert.ok(ra >= 60 && ra <= 86400, "Retry-After bis zum Reset: " + ra); assert.equal((await r.json()).retry_after, ra); }
console.log("worker-robust-unit: alle Tests grün");
