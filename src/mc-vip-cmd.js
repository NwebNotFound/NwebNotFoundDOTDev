// VIP-Queue und Sync. Vertrag: docs/vip-api.md (mc-stack 956683c).
// Browser sendet op über den Pfad. Gespeichert und an mc-stack ausgeliefert wird action.
// expired setzt nur mc-stack, frühestens 600000 ms nach created_at.
import { normU } from "./mc-vip.js";

export const ACTIONS = ["start", "set_visibility", "invite", "uninvite"];
export const ROLES = ["member", "trusted"];
export const VIS = ["friends", "private"];
const OWNER_RANKS = new Set(["vip", "mvp", "admin"]);
const ACK_OK = new Set(["accepted", "rejected", "failed", "confirmed", "denied", "expired"]);
const EXPIRE_MS = 600000;
const HOUR = 3600000;
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const RID = /^[A-Za-z0-9_.:-]{8,64}$/;

export function sanitizeInfo(v) {
  let t = typeof v === "string" ? v : "";
  t = t.replace(/\p{Cc}|\p{Cf}/gu, "").replace(/§[0-9a-fk-or]?/gi, "");
  return t.slice(0, 120);
}

const tokenOk = (req, env, safeEq) => { const t = req.headers.get("x-ingest-token") || ""; return !!env.MC_INGEST_TOKEN && t.length > 0 && safeEq(t, env.MC_INGEST_TOKEN); };
const originOk = (req, MAIN, MCD) => { const o = req.headers.get("origin"); if (!o) return false; try { const h = new URL(o).hostname; return h === MAIN || h === MCD; } catch { return false; } };

async function blob(env, kind) {
  const r = await env.DB.prepare("SELECT data, updated_at FROM mc_blobs WHERE kind = ?").bind(kind).first().catch(() => null);
  if (!r) return null;
  try { const list = JSON.parse(r.data); return { list: Array.isArray(list) ? list : [], updated_at: r.updated_at }; } catch { return { list: [], updated_at: r.updated_at }; }
}
async function writeBlob(env, kind, list, now) {
  await env.DB.prepare("INSERT INTO mc_blobs (kind, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(kind, JSON.stringify(list), now).run();
}

function cleanInvites(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out = [], seen = new Set();
  for (const x of raw) {
    const name = typeof x?.name === "string" ? x.name : "";
    const role = x?.role === "trusted" ? "trusted" : x?.role === "member" ? "member" : "";
    if (!NAME.test(name) || !role || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, role });
    if (out.length === 12) break;
  }
  return out;
}
function num(v) { return v == null || v === "" || typeof v === "boolean" || !Number.isFinite(+v) ? null : +v; }
function playersOf(v) {
  if (Array.isArray(v?.players)) return v.players.filter((n) => typeof n === "string" && NAME.test(n)).length;
  const n = num(v?.players);
  return n != null && n >= 0 ? Math.min(100, Math.floor(n)) : 0;
}
export function cleanWorlds(raw) {
  if (!Array.isArray(raw)) return { error: "vip_worlds muss ein Array sein" };
  if (raw.length > 30) return { error: "höchstens 30 Welten" };
  const out = [], seen = new Set();
  for (const w of raw) {
    const id = normU(w?.id ?? w?.world_id);
    const owner = normU(w?.owner_uuid ?? w?.owner);
    if (!id || !owner || seen.has(id)) continue;
    if (w?.visibility != null && w.visibility !== "friends" && w.visibility !== "private") continue;
    const invites = cleanInvites(w?.invites);
    if (invites == null) continue;
    seen.add(id);
    const max = num(w?.max), tps = num(w?.tps);
    out.push({
      id, owner_uuid: owner, owner_name: NAME.test(w?.owner_name || "") ? w.owner_name : null,
      label: sanitizeInfo(w?.label || "") || "VIP-Welt",
      visibility: w?.visibility === "private" ? "private" : "friends",
      online: !!w?.online, players: playersOf(w),
      max: max == null ? null : Math.max(0, Math.floor(max)),
      tps: tps == null ? null : Math.round(tps * 10) / 10,
      info: sanitizeInfo(w?.info),
      invites: invites.filter((i) => i.name.toLowerCase() !== String(w?.owner_name || "").toLowerCase()),
    });
  }
  return { worlds: out };
}
export function cleanLog(raw) {
  if (!Array.isArray(raw)) return { error: "vip_admin_log muss ein Array sein" };
  const out = [];
  for (const x of raw.slice(0, 200)) {
    const world_id = normU(x?.world_id);
    const owner = normU(x?.owner);
    const admin = String(x?.admin ?? "");
    const action = ACTIONS.includes(x?.action) ? x.action : "";
    const created_at = Number(x?.created_at);
    if (!world_id || !owner || !/^\d{15,21}$/.test(admin) || !action || !Number.isFinite(created_at)) continue;
    out.push({ world_id, admin, owner, action, created_at: created_at < 1e12 ? Math.round(created_at * 1000) : Math.round(created_at) });
  }
  return { log: out };
}

export function makeVip({ json, getUser, safeEq, MAIN, MCD }) {
  async function worlds(env) {
    const b = await blob(env, "vip_worlds");
    return b ? b.list : null;
  }
  async function actor(req, env) {
    if (req.headers.has("x-ingest-token") && !req.headers.get("cookie")) return { err: [403, "Ungültige Herkunft"] };
    if (!originOk(req, MAIN, MCD)) return { err: [403, "Ungültige Herkunft", null] };
    const u = await getUser(req, env).catch(() => null);
    if (!u) return { err: [401, "Bitte mit Discord anmelden", "login"] };
    const link = await env.DB.prepare("SELECT mc_name, mc_uuid, has_role, verified FROM mc_links WHERE discord_id = ?").bind(String(u.id)).first().catch(() => null);
    const uuid = normU(link?.mc_uuid);
    if (!link || !link.verified || !link.has_role || !uuid || !NAME.test(String(link.mc_name || ""))) return { err: [403, "Account nicht verknüpft", "not_linked"] };
    const rankRow = await env.DB.prepare("SELECT rank FROM mc_player_ranks WHERE lower(replace(uuid, '-', '')) = ?").bind(uuid.replace(/-/g, "")).first().catch(() => null);
    const rank = String(rankRow?.rank || "").toLowerCase();
    return { user: u, uuid, name: link.mc_name, rank, admin: rank === "admin" };
  }
  function deny(status, reason) { return json({ error: reason, reason }, status); }

  async function mutate(req, env, worldId, action, body) {
    if (req.method !== "POST" && !(req.method === "DELETE" && action === "uninvite")) return json({ error: "Method not allowed" }, 405);
    const a = await actor(req, env); if (a.err) return deny(a.err[0], a.err[2] || a.err[1]);
    const id = normU(worldId); if (!id) return json({ error: "world_id ist keine UUID" }, 400);
    if (body && typeof body === "object" && "op" in body && body.op != null && body.op !== action) return json({ error: "op passt nicht zum Pfad" }, 400);
    let name = null, role = null, visibility = null;
    if (action === "set_visibility") {
      visibility = body?.visibility;
      if (visibility !== "friends" && visibility !== "private") return json({ error: "visibility nur friends oder private" }, 400);
    }
    if (action === "invite") {
      name = typeof body?.name === "string" ? body.name : "";
      role = body?.role;
      if (!NAME.test(name)) return json({ error: "Name ungültig" }, 400);
      if (role !== "member" && role !== "trusted") return json({ error: "role nur member oder trusted" }, 400);
    }
    if (action === "uninvite") {
      name = typeof body?.name === "string" ? body.name : "";
      if (!NAME.test(name)) return json({ error: "Name ungültig" }, 400);
    }
    const list = await worlds(env);
    const world = (list || []).find((w) => w.id === id);
    if (!world) return a.admin ? json({ error: "Welt nicht gefunden" }, 404) : deny(403, action === "start" ? "not_trusted" : "not_owner");
    const invite = (world.invites || []).find((i) => i.name.toLowerCase() === a.name.toLowerCase());
    const isOwner = world.owner_uuid === a.uuid;
    let allowed = false;
    if (a.admin || isOwner) allowed = true;
    else if (invite?.role === "trusted" && action === "start") allowed = true;
    if (!allowed) return deny(403, action === "start" ? "not_trusted" : "not_owner");
    if (isOwner && !a.admin && !OWNER_RANKS.has(a.rank)) return deny(403, "no_rank");
    if (!isOwner && !a.admin && action === "start") {
      const ownerRank = await env.DB.prepare("SELECT rank FROM mc_player_ranks WHERE lower(replace(uuid, '-', '')) = ?").bind(world.owner_uuid.replace(/-/g, "")).first().catch(() => null);
      if (!OWNER_RANKS.has(String(ownerRank?.rank || "").toLowerCase())) return deny(403, "no_rank");
    }
    if (action === "invite" || action === "uninvite") {
      const has = (world.invites || []).some((i) => i.name.toLowerCase() === name.toLowerCase());
      if (name.toLowerCase() === String(world.owner_name || "").toLowerCase()) return json({ error: "Owner ist schon auf der Welt", reason: "not_owner" }, 409);
      if (action === "invite" && has) return json({ error: "schon eingeladen" }, 409);
      if (action === "uninvite" && !has) return json({ error: "nicht eingeladen" }, 409);
      if (action === "invite" && (world.invites || []).length >= 12) return json({ error: "höchstens 12 Mitglieder" }, 400);
    }
    const spec = { action, world_id: id, name, role, visibility };
    const rid = body?.request_id != null ? String(body.request_id) : crypto.randomUUID();
    if (!RID.test(rid)) return json({ error: "request_id ungültig (8-64 Zeichen [A-Za-z0-9_.:-])" }, 400);
    const ex = await env.DB.prepare("SELECT request_id, discord_id, action, world_id, name, role, visibility, status FROM mc_vip_commands WHERE discord_id = ? AND request_id = ?").bind(a.user.id, rid).first();
    if (ex) {
      const same = ex.action === spec.action && ex.world_id === spec.world_id && (ex.name || null) === name && (ex.role || null) === role && (ex.visibility || null) === visibility;
      if (!same) return json({ error: "request_id schon benutzt" }, 409);
      return json({ ok: true, duplicate: true, request_id: rid, op: ex.action, status: ex.status }, 200);
    }
    const ip = req.headers.get("CF-Connecting-IP") || "";
    const now = Date.now(), since = now - HOUR;
    if (action === "start") {
      const busy = await env.DB.prepare("SELECT 1 AS n FROM mc_vip_commands WHERE world_id = ? AND status = 'pending' LIMIT 1").bind(id).first();
      if (busy) return json({ error: "Auftrag läuft schon", reason: "busy" }, 409);
      const [perW, perD] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS t FROM mc_vip_commands WHERE world_id = ? AND action = 'start' AND created_at > ?").bind(id, since).first(),
        env.DB.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS t FROM mc_vip_commands WHERE discord_id = ? AND action = 'start' AND created_at > ?").bind(a.user.id, since).first(),
      ]);
      if ((perW?.n || 0) >= 3 || (perD?.n || 0) >= 6) {
        const t = Math.min(perW?.n >= 3 ? perW.t : Infinity, perD?.n >= 6 ? perD.t : Infinity);
        return json({ error: "Zu viele Aktionen", retry_after_ms: Math.max(1, t + HOUR - now) }, 429);
      }
    } else {
      const [perD, perI] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS t FROM mc_vip_commands WHERE discord_id = ? AND action != 'start' AND created_at > ?").bind(a.user.id, since).first(),
        env.DB.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS t FROM mc_vip_commands WHERE ip = ? AND action != 'start' AND created_at > ?").bind(ip, since).first(),
      ]);
      if ((perD?.n || 0) >= 10 || (perI?.n || 0) >= 20) {
        const t = Math.min(perD?.n >= 10 ? perD.t : Infinity, perI?.n >= 20 ? perI.t : Infinity);
        return json({ error: "Zu viele Aktionen", retry_after_ms: Math.max(1, t + HOUR - now) }, 429);
      }
    }
    const rowId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO mc_vip_commands (id, request_id, action, world_id, actor_uuid, actor_name, owner_uuid, discord_id, name, role, visibility, info, source, created_at, status, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'web', ?, 'pending', ?)").bind(rowId, rid, action, id, a.uuid, a.name, world.owner_uuid, a.user.id, name, role, visibility, now, ip).run();
    return json({ ok: true, request_id: rid, op: action, status: "pending" }, 202);
  }

  async function pending(req, env, url) {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (!tokenOk(req, env, safeEq)) return json({ error: "unauthorized" }, 401);
    const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
    const { results } = await env.DB.prepare("SELECT request_id, discord_id, action, world_id, actor_uuid, actor_name, owner_uuid, name, role, visibility, info, created_at FROM mc_vip_commands WHERE status = 'pending' AND created_at > ? ORDER BY created_at ASC LIMIT ?").bind(since, limit).all();
    return json({ now: Date.now(), items: results });
  }
  async function ack(req, env) {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!tokenOk(req, env, safeEq)) return json({ error: "unauthorized" }, 401);
    let b; try { b = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const acks = (Array.isArray(b?.acks) ? b.acks : []).slice(0, 200);
    const now = Date.now();
    let updated = 0;
    for (const x of acks) {
      if (!ACK_OK.has(x?.status) || typeof x?.request_id !== "string" || typeof x?.discord_id !== "string") continue;
      const row = await env.DB.prepare("SELECT request_id, discord_id, action, status, created_at FROM mc_vip_commands WHERE request_id = ? AND discord_id = ?").bind(x.request_id, x.discord_id).first();
      if (!row || row.status !== "pending") continue;
      if (x.action != null && x.action !== row.action) continue;
      if (x.status === "expired" && now - row.created_at < EXPIRE_MS) continue;
      const reason = typeof x.reason === "string" ? x.reason.slice(0, 120) : null;
      const res = await env.DB.prepare("UPDATE mc_vip_commands SET status = ?, reason = ?, acked_at = ? WHERE request_id = ? AND discord_id = ? AND status = 'pending'").bind(x.status, reason, now, x.request_id, x.discord_id).run();
      updated += res.meta?.changes || 0;
    }
    return json({ ok: true, updated });
  }
  async function sync(req, env) {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!tokenOk(req, env, safeEq)) return json({ error: "unauthorized" }, 401);
    let b; try { b = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!b || typeof b !== "object" || Array.isArray(b)) return json({ error: "invalid json" }, 400);
    const hasW = "vip_worlds" in b, hasL = "vip_admin_log" in b;
    const worldsC = hasW ? cleanWorlds(b.vip_worlds) : null;
    const logC = hasL ? cleanLog(b.vip_admin_log) : null;
    if ((worldsC && worldsC.error) || (logC && logC.error)) return json({ error: worldsC?.error || logC?.error }, 400);
    const now = Date.now();
    if (worldsC) await writeBlob(env, "vip_worlds", worldsC.worlds, now);
    if (logC) await writeBlob(env, "vip_admin_log", logC.log, now);
    return json({ ok: true, vip_worlds: worldsC ? worldsC.worlds.length : null, vip_admin_log: logC ? logC.log.length : null });
  }

  return {
    async route(p, req, env, url) {
      if (p === "/api/mc-vip-commands/pending") return pending(req, env, url);
      if (p === "/api/mc-vip-commands/ack") return ack(req, env);
      if (p === "/api/mc-vip-worlds") return sync(req, env);
      const m = p.match(/^\/api\/mc-vip\/worlds\/([^/]+)\/(start|visibility|members)(?:\/([^/]+))?$/);
      if (!m) return null;
      const worldId = decodeURIComponent(m[1]);
      const body = m[2] === "members" && req.method === "DELETE" ? { name: decodeURIComponent(m[3] || "") } : await bodyOf(req);
      if (m[2] === "start") return mutate(req, env, worldId, "start", body);
      if (m[2] === "visibility") return mutate(req, env, worldId, "set_visibility", body);
      if (m[2] === "members" && req.method === "DELETE") return mutate(req, env, worldId, "uninvite", body);
      if (m[2] === "members") return mutate(req, env, worldId, "invite", body);
      return null;
    },
  };
}

function bodyOf(req) {
  if (req.method === "DELETE") return Promise.resolve({});
  return req.json().catch(() => ({}));
}
