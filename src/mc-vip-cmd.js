// VIP-Queue und Sync. Vertrag: docs/vip-api.md (mc-stack 956683c).
// Browser sendet op über den Pfad. Gespeichert und an mc-stack ausgeliefert wird action.
// expired setzt nur mc-stack, frühestens 600000 ms nach created_at.
import { normU } from "./mc-vip.js";

// Vom Browser erlaubte ops (Pfad → action).
export const ACTIONS = ["start", "set_visibility", "invite", "uninvite"];
// Alle Aktionen des Vertrags. Nur diese dürfen im Admin-Log stehen.
export const CONTRACT_ACTIONS = ["create", "rename", "start", "stop", "settings", "set_visibility", "invite", "uninvite", "trust", "addons", "delete"];
export const ROLES = ["member", "trusted"];
export const VIS = ["friends", "private"];
const OWNER_RANKS = new Set(["vip", "mvp", "admin"]);
// Vertrag: nur done, denied, expired, failed. done/expired senden reason "".
const ACK_STATUS = new Set(["done", "denied", "expired", "failed"]);
const ACK_DENIED = new Set(["not_linked", "no_rank", "not_owner", "not_trusted", "already_member", "name_taken", "no_free_slot", "invalid_name", "invalid_type", "invalid_setting", "invalid_visibility", "invalid_addon", "invalid_role", "invalid_player", "invalid_timestamp", "is_owner", "player_not_found", "member_not_found", "world_not_found", "addon_limit"]);
const ACK_FAILED = new Set(["ram_budget", "host_unavailable", "audit_failed"]);
const WORLD_STATUS = new Set(["stopped", "starting", "running", "stopping", "error"]);
const WORLD_TYPES = new Set(["normal", "flat", "void"]);
const ADDONS = new Set(["keep-inventory", "peaceful", "creative", "day-lock", "pvp"]);
const EXPIRE_MS = 600000;
const HOUR = 3600000;
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const RID = /^[A-Za-z0-9_-]{1,64}$/;

// Vertrag: Cc und Cf raus, dann jedes § mit dem folgenden Zeichen, dann trim, dann 120 Zeichen.
export function sanitizeInfo(v) {
  let t = typeof v === "string" ? v : "";
  t = t.replace(/\p{Cc}|\p{Cf}/gu, "").replace(/§[\s\S]/gu, "").replace(/§/gu, "").trim();
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

function num(v) { return v == null || v === "" || typeof v === "boolean" || !Number.isFinite(+v) ? null : +v; }
// Vertrag: alle Zeiten sind Millisekunden. Kleine Werte sind Sekunden und werden umgerechnet.
function ms(v) { const n = num(v); return n == null ? null : n < 1e12 ? Math.round(n * 1000) : Math.round(n); }
function cleanInvites(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out = [], seen = new Set();
  for (const x of raw) {
    const uuid = normU(x?.uuid);
    const name = typeof x?.name === "string" ? sanitizeInfo(x.name) : "";
    const okName = NAME.test(name) ? name : null;
    if (!uuid && !okName) continue;
    const key = uuid || "n:" + okName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ uuid: uuid || null, name: okName, role: x?.role === "trusted" ? "trusted" : "member", added_at: ms(x?.added_at) });
    if (out.length === 32) break;
  }
  return out;
}
function playersOf(v) {
  if (Array.isArray(v?.players)) return v.players.filter((n) => typeof n === "string" && NAME.test(n)).length;
  const n = num(v?.players);
  return n != null && n >= 0 ? Math.min(100, Math.floor(n)) : 0;
}
// Schema wie im Vertrag: name, status, slot, player_limit, invites[].uuid (name nullable).
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
    const limit = num(w?.player_limit);
    const slot = typeof w?.slot === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(w.slot) ? w.slot : null;
    const addons = Array.isArray(w?.addons) ? [...new Set(w.addons.filter((a) => ADDONS.has(a)))].slice(0, 3) : [];
    const name = sanitizeInfo(w?.name);
    const ownerName = NAME.test(w?.owner_name || "") ? w.owner_name : null;
    out.push({
      id, owner_uuid: owner, owner_name: ownerName,
      name: name || null,
      type: WORLD_TYPES.has(w?.type) ? w.type : "normal",
      status: WORLD_STATUS.has(w?.status) ? w.status : "stopped",
      slot,
      player_limit: limit == null ? null : Math.max(0, Math.floor(limit)),
      visibility: w?.visibility === "private" ? "private" : "friends",
      players: playersOf(w),
      info: sanitizeInfo(w?.info),
      invites: invites.filter((i) => !(i.name && ownerName && i.name.toLowerCase() === ownerName.toLowerCase()) && i.uuid !== owner),
      addons,
      created_at: ms(w?.created_at),
      last_started_at: ms(w?.last_started_at),
    });
  }
  return { worlds: out };
}
// Schema wie im Vertrag: at, admin_uuid, admin_name, owner_uuid, owner_name, world_id, action, detail.
export function cleanLog(raw) {
  if (!Array.isArray(raw)) return { error: "vip_admin_log muss ein Array sein" };
  const out = [];
  for (const x of raw.slice(0, 200)) {
    const world_id = normU(x?.world_id);
    const owner_uuid = normU(x?.owner_uuid);
    const admin_uuid = normU(x?.admin_uuid);
    const action = CONTRACT_ACTIONS.includes(x?.action) ? x.action : "";
    const at = ms(x?.at);
    if (!world_id || !owner_uuid || !admin_uuid || !action || at == null) continue;
    out.push({
      at, admin_uuid, admin_name: NAME.test(x?.admin_name || "") ? x.admin_name : null,
      owner_uuid, owner_name: NAME.test(x?.owner_name || "") ? x.owner_name : null,
      world_id, action, detail: sanitizeInfo(x?.detail),
    });
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
      role = body?.role == null ? "member" : body.role; // Vertrag: role optional, Default member
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
    // Vertrag: trusted wird bevorzugt über die UUID geprüft, der Name ist nur der Fallback.
    const invite = (world.invites || []).find((i) => (i.uuid && normU(i.uuid) === a.uuid) || (i.name && i.name.toLowerCase() === a.name.toLowerCase()));
    const isOwner = world.owner_uuid === a.uuid;
    const isAdmin = a.admin === true;
    // Admin darf jede Welt verwalten, der Owner seine eigene, trusted nur starten.
    const allowed = isAdmin || isOwner || (invite?.role === "trusted" && action === "start");
    if (!allowed) return deny(403, action === "start" ? "not_trusted" : "not_owner");
    // Die Rangprüfung gilt nur für Spieler: ein Admin braucht für fremde Welten keinen VIP-Rang,
    // ein Owner muss einen Panel-Rang haben und trusted startet nur Welten mit berechtigtem Owner.
    if (!isAdmin) {
      if (isOwner && !OWNER_RANKS.has(a.rank)) return deny(403, "no_rank");
      if (!isOwner && action === "start") {
        const ownerRank = await env.DB.prepare("SELECT rank FROM mc_player_ranks WHERE lower(replace(uuid, '-', '')) = ?").bind(world.owner_uuid.replace(/-/g, "")).first().catch(() => null);
        if (!OWNER_RANKS.has(String(ownerRank?.rank || "").toLowerCase())) return deny(403, "no_rank");
      }
    }
    if (action === "invite" || action === "uninvite") {
      const has = (world.invites || []).some((i) => i.name && i.name.toLowerCase() === name.toLowerCase());
      if (name.toLowerCase() === String(world.owner_name || "").toLowerCase()) return json({ error: "Owner ist schon auf der Welt", reason: "not_owner" }, 409);
      if (action === "invite" && has) return json({ error: "schon eingeladen" }, 409);
      if (action === "uninvite" && !has) return json({ error: "nicht eingeladen" }, 409);
      if (action === "invite" && (world.invites || []).length >= 12) return json({ error: "höchstens 12 Mitglieder" }, 400);
    }
    const spec = { action, world_id: id, name, role, visibility };
    const rid = body?.request_id != null ? String(body.request_id) : crypto.randomUUID();
    if (!RID.test(rid)) return json({ error: "request_id ungültig (1-64 Zeichen [A-Za-z0-9_-])" }, 400);
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
      if (!ACK_STATUS.has(x?.status) || typeof x?.request_id !== "string" || typeof x?.discord_id !== "string") continue;
      if (!RID.test(x.request_id)) continue;
      // Vertrag: reason ist je Status festgelegt, done und expired senden "".
      const reason = typeof x.reason === "string" ? x.reason.trim() : "";
      const allowed = x.status === "denied" ? ACK_DENIED : x.status === "failed" ? ACK_FAILED : null;
      if (allowed ? !allowed.has(reason) : reason !== "") continue;
      const row = await env.DB.prepare("SELECT request_id, discord_id, action, status, created_at FROM mc_vip_commands WHERE request_id = ? AND discord_id = ?").bind(x.request_id, x.discord_id).first();
      if (!row || row.status !== "pending") continue;
      if (x.action != null && x.action !== row.action) continue;
      if (x.status === "expired" && now - row.created_at < EXPIRE_MS) continue;
      // Die IP dient nur dem Rate-Limit und wird beim Ack gelöscht.
      const res = await env.DB.prepare("UPDATE mc_vip_commands SET status = ?, reason = ?, acked_at = ?, ip = NULL WHERE request_id = ? AND discord_id = ? AND status = 'pending'").bind(x.status, reason || null, now, x.request_id, x.discord_id).run();
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
