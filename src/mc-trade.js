// Spielershops + Auktionshaus + Warteschlangen (Website ist NICHT autoritativ fürs Geld; alle Beträge in Cent)
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/, ITEM_RE = /^[a-z0-9_]{1,48}$/, NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const normU = (x) => String(x).toLowerCase().replace(/-/g, "").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, n);
const cents = (v) => { if (v == null || v === "") return null; const n = Number(v); return Number.isSafeInteger(n) && n >= 0 && n <= 1e13 ? n : null; };
const int = (v, max = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
const ts = (v) => { if (v == null || v === "") return null; const n = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : Date.parse(v); return Number.isFinite(n) ? n : null; };
const item = (v) => { const s = String(v ?? "").toLowerCase().replace(/^minecraft:/, ""); return ITEM_RE.test(s) ? s : null; };
export const BID_INC = (cur) => Math.max(100, Math.ceil(cur * 0.05)); // TODO mit Craft abgleichen; Server entscheidet
export const minNext = (a) => a.min_next_bid != null ? a.min_next_bid : (a.bid_count > 0 && a.current_bid != null ? a.current_bid + BID_INC(a.current_bid) : a.min_price);

function cleanLoc(l) {
  if (typeof l === "string") return clip(l, 80) || null;
  if (l && typeof l === "object") { const o = { world: clip(l.world, 32) || null }; for (const k of ["x", "y", "z"]) if (Number.isFinite(+l[k])) o[k] = Math.round(+l[k]); return o; }
  return null;
}
export function cleanShops(a) {
  if (!Array.isArray(a)) return null; const out = [], seen = new Set();
  for (const s of a.slice(0, 500)) {
    const id = String(s?.id ?? ""); if (!ID_RE.test(id) || seen.has(id)) continue; seen.add(id);
    const items = (Array.isArray(s.items) ? s.items : []).slice(0, 200).map((x) => ({ listing_id: x?.listing_id != null && /^[A-Za-z0-9_:.-]{1,64}$/.test(String(x.listing_id)) ? String(x.listing_id) : null, item: item(x?.item), price: cents(x?.price), stock: int(x?.stock), mode: x?.mode === "buy" ? "buy" : "sell" })).filter((x) => x.item && x.price != null);
    out.push({ id, owner_uuid: UUID_RE.test(s.owner_uuid || "") ? normU(s.owner_uuid) : null, owner_name: NAME_RE.test(s.owner_name || "") ? s.owner_name : clip(s.owner_name, 16), name: clip(s.name, 48) || "Shop", location: cleanLoc(s.location), items, updated_at: ts(s.updated_at) });
  }
  return out;
}
const pick = (o, ...k) => { for (const x of k) if (o?.[x] != null && o[x] !== "") return o[x]; return null; };
const uu = (v) => (v != null && UUID_RE.test(String(v)) ? normU(v) : null);
const cleanBid = (b) => ({ id: b?.id != null ? clip(b.id, 64) : null, bidder_uuid: uu(pick(b, "bidder", "bidder_uuid", "uuid")), name: clip(pick(b, "bidder_name", "name"), 16) || null, amount: cents(b?.amount), at: ts(pick(b, "created_at", "at", "time")), source: clip(b?.source, 16) || null });
// Auktionen: v_auctions-Spalten (Craft) + ältere Aliase. bids: verschachtelt (x.bids) oder separat (v_auction_bids → bidsTop).
export function cleanAuctions(a, bidsTop) {
  if (!Array.isArray(a)) return null; const out = [], seen = new Set(), byA = new Map();
  for (const b of (Array.isArray(bidsTop) ? bidsTop : []).slice(0, 20000)) { const k = String(pick(b, "auction_id", "auction") ?? ""); if (!k) continue; (byA.get(k) || byA.set(k, []).get(k)).push(b); }
  for (const x of a.slice(0, 1000)) {
    const id = String(x?.id ?? ""); if (!ID_RE.test(id) || seen.has(id)) continue; seen.add(id);
    const min = cents(x.min_price) ?? 0, cur = cents(x.current_bid), mnb = cents(x.min_next_bid);
    const st = String(x.status ?? "active").toLowerCase(), status = ["ended", "sold", "expired", "finished", "closed"].includes(st) ? "ended" : ["cancelled", "canceled", "removed"].includes(st) ? "cancelled" : "active";
    const seenB = new Set(); const bids = [...(Array.isArray(x.bids) ? x.bids : []), ...(byA.get(id) || [])].slice(0, 500).map(cleanBid).filter((b) => b.amount != null && (b.bidder_uuid || b.name) && (!b.id || (seenB.has(b.id) ? false : seenB.add(b.id)))).sort((p, q) => (q.at || 0) - (p.at || 0) || q.amount - p.amount).slice(0, 200);
    const bc = int(x.bid_count, 1e6);
    out.push({ id, seller_uuid: uu(pick(x, "seller", "seller_uuid")), seller_name: clip(x.seller_name, 16) || null, item: item(x.item) || "barrier", amount: Math.max(1, int(pick(x, "menge", "qty", "amount"), 6400) || 1), nbt_summary: clip(x.nbt_summary, 300) || null,
      min_price: min, current_bid: cur, current_bidder_uuid: uu(pick(x, "current_bidder", "current_bidder_uuid")), current_bidder_name: clip(x.current_bidder_name, 16) || null, bid_count: bc || (cur != null ? Math.max(1, bids.length) : bids.length),
      min_next_bid: mnb, source_last_bid: clip(x.source_last_bid, 16) || null, created_at: ts(x.created_at), ends_at: ts(x.ends_at), status, bids });
  }
  return out;
}
// Namen zu UUIDs aus mc_links (falls bekannt)
export async function nameMap(env, uuids) {
  const ids = [...new Set(uuids.filter(Boolean))].slice(0, 500); if (!ids.length) return {};
  const m = {}; for (let i = 0; i < ids.length; i += 90) { const c = ids.slice(i, i + 90); const { results } = await env.DB.prepare(`SELECT mc_uuid, mc_name FROM mc_links WHERE mc_uuid IN (${c.map(() => "?").join(",")})`).bind(...c).all().catch(() => ({ results: [] })); for (const r of results) if (r.mc_name) m[r.mc_uuid] = r.mc_name; }
  return m;
}
const shortU = (u) => (u ? u.slice(0, 8) + "…" : null);
const named = (a, N) => ({ ...a, seller_name: a.seller_name || N[a.seller_uuid] || shortU(a.seller_uuid), current_bidder_name: a.current_bidder_name || N[a.current_bidder_uuid] || shortU(a.current_bidder_uuid) });
export const blobStatement = (env, kind, data, now) => env.DB.prepare("INSERT INTO mc_blobs (kind, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE data IS NOT excluded.data OR updated_at < excluded.updated_at - 240000").bind(kind, JSON.stringify(data), now);
const blob = async (env, kind) => { const r = await env.DB.prepare("SELECT data, updated_at FROM mc_blobs WHERE kind = ?").bind(kind).first().catch(() => null); return r ? { list: JSON.parse(r.data), updated_at: r.updated_at } : { list: [], updated_at: null }; };
const iso = (t) => (t ? new Date(t).toISOString() : null);

export function makeTrade({ json, getUser, safeEq, MAIN, MCD }) {
  const tokenOk = (req, env) => { const t = req.headers.get("x-ingest-token") || ""; return !!env.MC_INGEST_TOKEN && t.length > 0 && safeEq(t, env.MC_INGEST_TOKEN); };
  const originOk = (req) => { const o = req.headers.get("origin"); if (!o) return false; try { const h = new URL(o).hostname; return h === MAIN || h === MCD; } catch { return false; } };
  const linkFor = (env, discordId) => env.DB.prepare("SELECT mc_name, mc_uuid, has_role, verified FROM mc_links WHERE discord_id = ?").bind(discordId).first().catch(() => null);
  // Rate-Limit über beide Warteschlangen: pro Discord-ID 5/min, 30/h; pro IP 10/min, 60/h
  async function limited(env, discordId, ip) {
    const now = Date.now(), m = now - 60000, h = now - 3600000;
    const q = (col) => `SELECT SUM(c1) AS m, SUM(c2) AS h FROM (SELECT SUM(created_at > ?2) AS c1, COUNT(*) AS c2 FROM mc_bids_pending WHERE ${col} = ?1 AND created_at > ?3 UNION ALL SELECT SUM(created_at > ?2), COUNT(*) FROM mc_shop_orders_pending WHERE ${col} = ?1 AND created_at > ?3)`;
    const [d, i] = await Promise.all([env.DB.prepare(q("discord_id")).bind(discordId, m, h).first(), ip ? env.DB.prepare(q("ip")).bind(ip, m, h).first() : { m: 0, h: 0 }]);
    return (d?.m || 0) >= 5 || (d?.h || 0) >= 30 || (i?.m || 0) >= 10 || (i?.h || 0) >= 60;
  }
  async function turnstileOk(env, req, token) {
    if (!env.TURNSTILE_SECRET || !token) return true; // optional: nur geprüft, wenn mitgeschickt
    const fd = new FormData(); fd.append("secret", env.TURNSTILE_SECRET); fd.append("response", String(token)); fd.append("remoteip", req.headers.get("CF-Connecting-IP") || "");
    try { return !!(await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd })).json()).success; } catch { return false; }
  }
  // Wer handelt? Website: nur Discord-Session (+ Origin). Bot: nur Ingest-Token + discord_id. UUID immer aus mc_links.
  async function actor(req, env, b) {
    const viaBot = req.headers.has("x-ingest-token");
    if (viaBot) { if (!tokenOk(req, env)) return { err: [401, "unauthorized"] }; const did = String(b?.discord_id ?? ""); if (!/^\d{15,21}$/.test(did)) return { err: [400, "discord_id fehlt"] }; return { discordId: did, source: "discord" }; }
    if (!originOk(req)) return { err: [403, "Ungültige Herkunft"] };
    const u = await getUser(req, env); if (!u) return { err: [401, "Bitte mit Discord anmelden"] };
    if (!(await turnstileOk(env, req, b?.turnstile))) return { err: [403, "Captcha fehlgeschlagen"] };
    return { discordId: u.id, source: "web" };
  }
  async function prep(req, env) {
    if (req.method !== "POST") return { err: json({ error: "Method not allowed" }, 405) };
    const raw = await req.text(); if (raw.length > 4096) return { err: json({ error: "too large" }, 413) };
    let b; try { b = JSON.parse(raw); } catch { return { err: json({ error: "invalid json" }, 400) }; }
    const a = await actor(req, env, b); if (a.err) return { err: json({ error: a.err[1] }, a.err[0]) };
    const l = await linkFor(env, a.discordId);
    if (!l) return { err: json({ error: "Kein verknüpfter Minecraft-Account. Nutze /link im Discord." }, 403) };
    if (!l.verified || !l.has_role) return { err: json({ error: "Account nicht bestätigt oder Rolle fehlt" }, 403) };
    const ip = a.source === "web" ? req.headers.get("CF-Connecting-IP") || "" : null;
    if (await limited(env, a.discordId, ip)) return { err: json({ error: "Zu viele Aktionen, bitte kurz warten" }, 429, { "retry-after": "60" }) };
    return { b, a, l, ip };
  }

  async function bid(req, env) {
    const r = await prep(req, env); if (r.err) return r.err; const { b, a, l, ip } = r;
    const amount = cents(b.amount); if (amount == null || amount < 1) return json({ error: "Betrag in Cent (Ganzzahl) angeben" }, 400);
    const { list } = await blob(env, "auctions"); const au = list.find((x) => x.id === String(b.auction_id ?? ""));
    if (!au) return json({ error: "Auktion nicht gefunden" }, 404);
    if (au.status !== "active" || (au.ends_at && au.ends_at <= Date.now())) return json({ error: "Auktion ist beendet" }, 409);
    if (au.seller_uuid && au.seller_uuid === l.mc_uuid) return json({ error: "Du kannst nicht auf deine eigene Auktion bieten" }, 403);
    // Offene eigene Gebote zählen als Untergrenze, damit niemand sich selbst unterbietet
    const own = await env.DB.prepare("SELECT MAX(amount) AS m FROM mc_bids_pending WHERE auction_id = ? AND bidder_uuid = ? AND status = 'pending'").bind(au.id, l.mc_uuid).first();
    const need = Math.max(minNext(au), own?.m ? own.m + 1 : 0);
    if (amount < need) return json({ error: "Mindestgebot ist " + (need / 100).toFixed(2) + " CP", min_next: need }, 409);
    const id = crypto.randomUUID(), now = Date.now();
    await env.DB.prepare("INSERT INTO mc_bids_pending (id, auction_id, bidder_uuid, bidder_name, discord_id, amount, source, created_at, status, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)").bind(id, au.id, l.mc_uuid, l.mc_name, a.discordId, amount, a.source, now, ip).run();
    return json({ ok: true, request_id: id, status: "pending", amount }, 202);
  }
  async function order(req, env) {
    const r = await prep(req, env); if (r.err) return r.err; const { b, a, l, ip } = r;
    const qty = Math.floor(Number(b.qty)); if (!(qty >= 1 && qty <= 2304)) return json({ error: "Menge 1 bis 2304" }, 400);
    const { list } = await blob(env, "shops"); const lid = b.listing_id != null ? String(b.listing_id) : null; let sh, off;
    if (lid) { for (const x of list) { const o = x.items.find((y) => y.listing_id === lid); if (o) { sh = x; off = o; break; } } if (!sh) return json({ error: "Angebot nicht gefunden" }, 404); if (off.mode !== "sell") return json({ error: "Item wird hier nicht verkauft" }, 404); }
    else { sh = list.find((x) => x.id === String(b.shop_id ?? "")); }
    if (!sh) return json({ error: "Shop nicht gefunden" }, 404); const it = off ? off.item : item(b.item);
    if (sh.owner_uuid && sh.owner_uuid === l.mc_uuid) return json({ error: "Du kannst nicht in deinem eigenen Shop kaufen" }, 403);
    if (!off) off = sh.items.filter((x) => x.item === it && x.mode === "sell").sort((x, y) => y.stock - x.stock)[0]; if (!off) return json({ error: "Item wird hier nicht verkauft" }, 404);
    if (off.stock < qty) return json({ error: "Nur noch " + off.stock + " auf Lager" }, 409);
    const id = crypto.randomUUID(), now = Date.now();
    await env.DB.prepare("INSERT INTO mc_shop_orders_pending (id, listing_id, shop_id, item, qty, buyer_uuid, buyer_name, discord_id, unit_price, source, created_at, status, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)").bind(id, off.listing_id, sh.id, it, qty, l.mc_uuid, l.mc_name, a.discordId, off.price, a.source, now, ip).run();
    return json({ ok: true, request_id: id, status: "pending", qty, unit_price: off.price, total: off.price * qty }, 202);
  }
  // Pull + Ack für Server/Bot (nur Ingest-Token)
  const pending = (table, cols) => async (req, env, url) => {
    if (!tokenOk(req, env)) return json({ error: "unauthorized" }, 401);
    const since = Math.max(0, Number(url.searchParams.get("since")) || 0), limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
    const { results } = await env.DB.prepare(`SELECT ${cols} FROM ${table} WHERE status = 'pending' AND created_at > ? ORDER BY created_at ASC LIMIT ?`).bind(since, limit).all();
    return json({ now: Date.now(), items: results.map((x) => ({ ...x, request_id: x.id, idem_key: x.id })) });
  };
  const ack = (table) => async (req, env) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!tokenOk(req, env)) return json({ error: "unauthorized" }, 401);
    let b; try { b = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const acks = (Array.isArray(b?.acks) ? b.acks : []).slice(0, 200).filter((x) => typeof x?.id === "string" && ["accepted", "rejected"].includes(x.status));
    const now = Date.now();
    const res = acks.length ? await env.DB.batch(acks.map((x) => env.DB.prepare(`UPDATE ${table} SET status = ?, reason = ?, acked_at = ? WHERE id = ? AND status = 'pending'`).bind(x.status, clip(x.reason, 120) || null, now, x.id))) : [];
    return json({ ok: true, updated: res.reduce((s, r) => s + (r.meta?.changes || 0), 0) });
  };
  const BID_COLS = "id, auction_id, bidder_uuid, bidder_name, amount, source, created_at", ORD_COLS = "id, listing_id, shop_id, item, qty, buyer_uuid, buyer_uuid AS uuid, buyer_name, unit_price, unit_price AS max_unit_price_cent, source, created_at";

  async function me(req, env) { const u = await getUser(req, env); if (!u) return { user: null }; const l = await linkFor(env, u.id); return { user: u, link: l, can: !!(l && l.verified && l.has_role) }; }
  async function auctions(req, env) {
    const { list, updated_at } = await blob(env, "auctions"); const N = await nameMap(env, list.flatMap((a) => [a.seller_uuid, a.current_bidder_uuid]));
    return json({ updated_at: iso(updated_at), now: Date.now(), auctions: list.map(({ bids, ...a }) => ({ ...named(a, N), min_next: minNext(a) })) }, 200, { "cache-control": "public, max-age=15" });
  }
  async function auction(req, env, id) {
    const { list, updated_at } = await blob(env, "auctions"); let a = list.find((x) => x.id === id); if (!a) return json({ error: "not found" }, 404);
    { const N = await nameMap(env, [a.seller_uuid, a.current_bidder_uuid, ...(a.bids || []).map((b) => b.bidder_uuid)]); a = { ...named(a, N), bids: (a.bids || []).map((b) => ({ ...b, name: b.name || N[b.bidder_uuid] || shortU(b.bidder_uuid) })) }; }
    const m = await me(req, env); let mine = [];
    if (m.user && m.link) mine = (await env.DB.prepare("SELECT id, amount, status, reason, created_at FROM mc_bids_pending WHERE auction_id = ? AND discord_id = ? ORDER BY created_at DESC LIMIT 20").bind(id, m.user.id).all()).results;
    return json({ updated_at: iso(updated_at), now: Date.now(), auction: { ...a, min_next: minNext(a) }, viewer: m.user ? { logged_in: true, mc_name: m.link?.mc_name || null, can_bid: m.can && !(a.seller_uuid && m.link?.mc_uuid === a.seller_uuid), own: !!(a.seller_uuid && m.link?.mc_uuid === a.seller_uuid) } : { logged_in: false }, mine });
  }
  async function shops(req, env) { const { list, updated_at } = await blob(env, "shops"); return json({ updated_at: iso(updated_at), shops: list }, 200, { "cache-control": "public, max-age=30" }); }
  async function shop(req, env, id) {
    const { list, updated_at } = await blob(env, "shops"); const s = list.find((x) => x.id === id); if (!s) return json({ error: "not found" }, 404);
    const m = await me(req, env); let mine = [];
    if (m.user && m.link) mine = (await env.DB.prepare("SELECT id, item, qty, unit_price, status, reason, created_at FROM mc_shop_orders_pending WHERE shop_id = ? AND discord_id = ? ORDER BY created_at DESC LIMIT 20").bind(id, m.user.id).all()).results;
    return json({ updated_at: iso(updated_at), shop: s, viewer: m.user ? { logged_in: true, mc_name: m.link?.mc_name || null, can_buy: m.can && !(s.owner_uuid && m.link?.mc_uuid === s.owner_uuid), own: !!(s.owner_uuid && m.link?.mc_uuid === s.owner_uuid) } : { logged_in: false }, mine });
  }
  return {
    route(p, req, env, url) {
      if (p === "/api/mc-bid") return bid(req, env);
      if (p === "/api/mc-shop-order") return order(req, env);
      if (p === "/api/mc-bids/pending") return pending("mc_bids_pending", BID_COLS)(req, env, url);
      if (p === "/api/mc-bids/ack") return ack("mc_bids_pending")(req, env);
      if (p === "/api/mc-shop-orders/pending") return pending("mc_shop_orders_pending", ORD_COLS)(req, env, url);
      if (p === "/api/mc-shop-orders/ack") return ack("mc_shop_orders_pending")(req, env);
      if (p === "/api/mc-auctions") return auctions(req, env);
      if (p.startsWith("/api/mc-auctions/")) return auction(req, env, decodeURIComponent(p.slice(17)));
      if (p === "/api/mc-shops") return shops(req, env);
      if (p.startsWith("/api/mc-shops/")) return shop(req, env, decodeURIComponent(p.slice(14)));
      return null;
    },
  };
}
