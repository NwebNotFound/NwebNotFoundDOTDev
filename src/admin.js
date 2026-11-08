// NwebOS Verwaltung (mockups/nwebos/apps/admin/notes.md), data side: the one admin check (blog editor, Verwaltung,
// pencils), the JSON router /api/admin/<section>[/<id>[/<action>]] and the public site data (texts, projects, news)
// read from D1 behind a 60 s cache. The windows keep today's texts in code as the fallback while a table is empty.

/** Admin = Discord session + verified mc link + rank "admin" on that uuid (same rule as /vip). */
export async function isAdmin(req, env, getUser) {
  const u = await getUser(req, env).catch(() => null);
  if (!u) return { err: 401 };
  try {
    const link = await env.DB.prepare("SELECT mc_uuid, verified FROM mc_links WHERE discord_id = ?").bind(String(u.id)).first();
    const uuid = String(link?.mc_uuid || "").toLowerCase().replace(/-/g, "");
    if (!link || !link.verified || !/^[0-9a-f]{32}$/.test(uuid)) return { err: 403 };
    const r = await env.DB.prepare("SELECT rank FROM mc_player_ranks WHERE lower(replace(uuid, '-', '')) = ?").bind(uuid).first();
    return String(r?.rank || "").toLowerCase() === "admin" ? { user: u } : { err: 403 };
  } catch { return { err: 403 }; }
}

// ---------------- validation (pure) ----------------
const str = (v, max, { req = false, nul = false } = {}) => {
  if (v == null || v === "") return req ? undefined : nul ? null : "";
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\r\n?/g, "\n").trim();
  if (req && !s) return undefined;
  return s.length <= max ? (s || (nul ? null : "")) : undefined;
};
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);

/** Text blocks: key -> languages it exists in + its shape. */
export const BLOCKS = {
  "home.hero": { langs: ["de", "en"], clean: (d) => { const o = { eyebrow: str(d.eyebrow, 80), name: str(d.name, 40, { req: true }), lead: str(d.lead, 600, { req: true }) }; return Object.values(o).includes(undefined) ? null : o; } },
  "home.facts": { langs: ["de", "en"], clean: (d) => {
    if (!Array.isArray(d.rows) || d.rows.length > 8) return null;
    const rows = d.rows.map((r) => r && typeof r === "object" ? { icon: /^[a-z0-9-]{1,24}$/.test(r.icon || "") ? r.icon : "heart", k: str(r.k, 24, { req: true }), v: str(r.v, 80, { req: true }) } : null);
    return rows.every((r) => r && r.k !== undefined && r.v !== undefined) ? { rows } : null;
  } },
  "home.xp": { langs: ["*"], clean: (d) => (typeof d.value === "number" && d.value >= 0 && d.value <= 1 ? { value: Math.round(d.value * 100) / 100 } : null) },
  "about.text": { langs: ["de", "en"], clean: (d) => { const md = str(d.md, 8000); return md === undefined ? null : { md }; } },
};
export function cleanBlock(key, lang, data) {
  const b = BLOCKS[key];
  if (!b || !b.langs.includes(lang) || !data || typeof data !== "object" || Array.isArray(data)) return null;
  return b.clean(data);
}

export const PROJECT_STATUS = ["live", "neu", "bald", "idee"];
export const NEWS_AREAS = ["website", "server", "blog"];
const HREF = /^(?:\/[a-z0-9/_-]*|https:\/\/[a-z0-9.-]+(?:\/[\w./%?=&#-]*)?)$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const okDay = (s) => DAY.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

/** One project (full row after merging a PATCH into the current one). */
export function cleanProject(b) {
  const o = {
    status: PROJECT_STATUS.includes(b.status) ? b.status : undefined,
    progress: int(b.progress, 0, 10),
    href: typeof b.href === "string" && (b.href === "" || (b.href.length <= 200 && HREF.test(b.href))) ? b.href : b.href == null ? "" : undefined,
    icon: typeof b.icon === "string" && /^[a-z0-9-]{1,24}$/.test(b.icon) ? b.icon : b.icon == null ? "about" : undefined,
    title_de: str(b.title_de, 60, { req: true }), title_en: str(b.title_en, 60, { nul: true }),
    text_de: str(b.text_de, 300), text_en: str(b.text_en, 300, { nul: true }),
    sort: b.sort == null ? 0 : int(b.sort, 0, 9999),
  };
  const bad = Object.keys(o).filter((k) => o[k] === undefined);
  return bad.length ? { err: bad } : { val: o };
}
/** One site news entry. */
export function cleanNews(b) {
  const o = {
    day: typeof b.day === "string" && okDay(b.day) ? b.day : undefined,
    area: NEWS_AREAS.includes(b.area) ? b.area : undefined,
    title_de: str(b.title_de, 80, { req: true }), title_en: str(b.title_en, 80, { nul: true }),
    text_de: str(b.text_de, 300), text_en: str(b.text_en, 300, { nul: true }),
    status: b.status == null ? "draft" : ["draft", "live"].includes(b.status) ? b.status : undefined,
    sort: b.sort == null ? 0 : int(b.sort, 0, 9999),
  };
  const bad = Object.keys(o).filter((k) => o[k] === undefined);
  return bad.length ? { err: bad } : { val: o };
}

// ---------------- public site data (60 s cache, purged by every admin write in this isolate) ----------------
let SITE = null;
export const SITE_TTL_MS = 60000;
export function purgeSite() { SITE = null; }
/** { blocks: { key: { lang: data } }, projects: rows | null, changelog: live rows | null }. null = no (live) rows or table
 *  missing (before migration 0019 / the seed): the windows use their code fallback. */
export function siteData(env, now = Date.now()) {
  if (SITE && now - SITE.at < SITE_TTL_MS) return SITE.p;
  const p = env.DB.batch([
    env.DB.prepare("SELECT key, lang, json FROM site_blocks"),
    env.DB.prepare("SELECT id, sort, status, progress, href, icon, title_de, title_en, text_de, text_en FROM projects ORDER BY sort, id LIMIT 100"),
    env.DB.prepare("SELECT id, day, area, title_de, title_en, text_de, text_en, status FROM changelog ORDER BY day DESC, sort, id LIMIT 200"),
  ]).then(([b, pr, cl]) => {
    const blocks = {};
    for (const r of b.results || []) { try { (blocks[r.key] ||= {})[r.lang] = JSON.parse(r.json); } catch { /* skip a broken row */ } }
    const news = cl.results || [];
    return { blocks, projects: (pr.results || []).length ? pr.results : null, changelog: news.some((r) => r.status === "live") ? news.filter((r) => r.status === "live") : null };
  }).catch(() => ({ blocks: {}, projects: null, changelog: null }));
  SITE = { at: now, p };
  return p;
}

// ---------------- the router ----------------
const SECTIONS = {
  projects: { table: "projects", cols: ["sort", "status", "progress", "href", "icon", "title_de", "title_en", "text_de", "text_en"], clean: cleanProject, order: "sort, id" },
  changelog: { publish: true, table: "changelog", cols: ["day", "area", "title_de", "title_en", "text_de", "text_en", "status", "sort"], clean: cleanNews, order: "day DESC, sort, id" },
};
const ROUTE = /^\/api\/admin\/(home|projects|changelog|guestbook)(?:\/([a-z0-9.]{1,40}))?(?:\/(publish|withdraw|hide|unhide))?$/;
export const ADMIN_RATE = { max: 120, windowMs: 60000 };
const MAX_BODY = 32000;

/* D1 budget (Planner 08.11.): saves write only their own row and only when the content changed; admin_log gets a row
   only for publish / withdraw / hide / unhide / delete (no autosave rows); every write goes through logWrites. */
export function makeAdmin({ json, getUser, MAIN, defaults = {}, logWrites = (src, r) => r }) {
  const hits = new Map();   // per admin, per isolate: a guard against runaway scripts, not a quota
  const limited = (id, now) => {
    const h = hits.get(id);
    if (!h || now - h.start >= ADMIN_RATE.windowMs) { hits.set(id, { start: now, n: 1 }); return false; }
    return ++h.n > ADMIN_RATE.max;
  };
  const priv = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
  const out = (o, s = 200) => json(o, s, priv);
  const originOk = (req) => { const o = req.headers.get("origin"); if (!o) return false; try { return new URL(o).hostname === MAIN; } catch { return false; } };
  async function body(req) {
    if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return { err: out({ error: "json_expected" }, 415) };
    const t = await req.text();
    if (t.length > MAX_BODY) return { err: out({ error: "too_large" }, 413) };
    try { const b = JSON.parse(t); return b && typeof b === "object" && !Array.isArray(b) ? { b } : { err: out({ error: "invalid_json" }, 400) }; } catch { return { err: out({ error: "invalid_json" }, 400) }; }
  }
  const log = (env, who, section, item, action, before, now) => env.DB.prepare("INSERT INTO admin_log (at, discord_id, section, item, action, before_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now, String(who.id), section, String(item), action, before == null ? null : JSON.stringify(before));

  async function home(req, env, who, key, now) {
    if (req.method === "GET" && !key) {
      const { results } = await env.DB.prepare("SELECT key, lang, json, version, updated_at FROM site_blocks").all();
      const blocks = {};
      for (const k of Object.keys(BLOCKS)) { blocks[k] = {}; for (const l of BLOCKS[k].langs) blocks[k][l] = null; }
      for (const r of results || []) if (blocks[r.key]) { try { blocks[r.key][r.lang] = { data: JSON.parse(r.json), version: r.version, updated_at: r.updated_at }; } catch { /* broken row: editor starts from the default */ } }
      return out({ blocks, defaults: defaults.blocks || {} });
    }
    if (req.method !== "PATCH" || !key) return out({ error: "method_not_allowed" }, 405);
    const r = await body(req); if (r.err) return r.err;
    const lang = String(r.b.lang || ""), version = r.b.version;
    const data = cleanBlock(key, lang, r.b.data);
    if (!data) return out({ error: "invalid", key, lang }, 400);
    if (!Number.isInteger(version) || version < 0) return out({ error: "version_required" }, 400);
    const cur = await env.DB.prepare("SELECT json, version FROM site_blocks WHERE key = ? AND lang = ?").bind(key, lang).first();
    if ((cur ? cur.version : 0) !== version) return out({ error: "conflict", version: cur ? cur.version : 0, data: cur ? JSON.parse(cur.json) : null }, 409);
    const j = JSON.stringify(data);
    if (cur && cur.json === j) return out({ ok: true, key, lang, version, unchanged: true });   // autosave of the same text: no write
    const w = cur
      ? env.DB.prepare("UPDATE site_blocks SET json = ?, version = version + 1, updated_at = ? WHERE key = ? AND lang = ? AND version = ?").bind(j, now, key, lang, version)
      : env.DB.prepare("INSERT OR IGNORE INTO site_blocks (key, lang, json, version, updated_at) VALUES (?, ?, ?, 1, ?)").bind(key, lang, j, now);
    const res = logWrites("admin-home", await w.run());
    if (!res.meta?.changes) return out({ error: "conflict" }, 409);   // lost a race between the read and the write
    purgeSite();
    return out({ ok: true, key, lang, version: version + 1, updated_at: now });
  }

  async function table(req, env, who, name, id, action, now) {
    const S = SECTIONS[name];
    const one = (x) => env.DB.prepare(`SELECT * FROM ${S.table} WHERE id = ?`).bind(x).first();
    if (id && !/^\d{1,9}$/.test(id)) return out({ error: "not_found" }, 404);
    if (req.method === "GET") {
      if (id) { const row = await one(+id); return row ? out({ item: row }) : out({ error: "not_found" }, 404); }
      const { results } = await env.DB.prepare(`SELECT * FROM ${S.table} ORDER BY ${S.order} LIMIT 500`).all();
      return out({ items: results || [] });
    }
    if (req.method === "POST" && !id) {   // create
      const r = await body(req); if (r.err) return r.err;
      const c = S.clean(r.b); if (c.err) return out({ error: "invalid", fields: c.err }, 400);
      if (name === "projects" && r.b.sort == null) c.val.sort = ((await env.DB.prepare("SELECT MAX(sort) AS m FROM projects").first())?.m ?? 0) + 1;
      const [ins] = logWrites("admin-" + name, await env.DB.batch([env.DB.prepare(`INSERT INTO ${S.table} (${S.cols.join(", ")}, version, updated_at) VALUES (${S.cols.map(() => "?").join(", ")}, 1, ?) RETURNING *`).bind(...S.cols.map((k) => c.val[k]), now)]));
      const row = ins.results[0];
      if (S.publish && row.status === "live") logWrites("admin-" + name, await log(env, who, name, row.id, "publish", null, now).run());   // created straight to live
      purgeSite();
      return out({ ok: true, item: row }, 201);
    }
    if (!id) return out({ error: "method_not_allowed" }, 405);
    const cur = await one(+id);
    if (!cur) return out({ error: "not_found" }, 404);
    if (req.method === "DELETE") {
      const [res] = logWrites("admin-" + name, await env.DB.batch([env.DB.prepare(`DELETE FROM ${S.table} WHERE id = ?`).bind(+id), log(env, who, name, id, "delete", cur, now)]));
      purgeSite();
      return out({ ok: true, deleted: res.meta?.changes || 0 });
    }
    let patch;
    if (req.method === "POST" && action && name === "changelog" && (action === "publish" || action === "withdraw")) {
      const r = await body(req); if (r.err) return r.err;
      patch = { status: action === "publish" ? "live" : "draft", version: r.b.version };
    } else if (req.method === "PATCH" && !action) {
      const r = await body(req); if (r.err) return r.err;
      patch = r.b;
    } else return out({ error: "method_not_allowed" }, 405);
    if (!Number.isInteger(patch.version)) return out({ error: "version_required" }, 400);
    if (patch.version !== cur.version) return out({ error: "conflict", item: cur }, 409);
    const merged = {}; for (const k of S.cols) merged[k] = Object.prototype.hasOwnProperty.call(patch, k) ? patch[k] : cur[k];
    const c = S.clean(merged); if (c.err) return out({ error: "invalid", fields: c.err }, 400);
    if (S.cols.every((k) => c.val[k] === cur[k])) return out({ ok: true, item: cur, unchanged: true });   // nothing to write
    const upd = env.DB.prepare(`UPDATE ${S.table} SET ${S.cols.map((k) => `${k} = ?`).join(", ")}, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`).bind(...S.cols.map((k) => c.val[k]), now, +id, cur.version);
    const vis = S.publish && c.val.status !== cur.status ? (c.val.status === "live" ? "publish" : "withdraw") : null;   // going live or offline is logged however it is sent
    const [res] = logWrites("admin-" + name, await env.DB.batch(vis ? [upd, log(env, who, name, id, vis, cur, now)] : [upd]));
    if (!res.meta?.changes) return out({ error: "conflict", item: await one(+id) }, 409);
    purgeSite();
    return out({ ok: true, item: { ...cur, ...c.val, version: cur.version + 1, updated_at: now } });
  }

  async function guestbook(req, env, who, id, action, url, now) {
    if (req.method === "GET" && !id) {
      const f = url.searchParams.get("filter") || "new";
      const where = { new: "hidden = 0 AND created_at >= datetime('now', '-7 days')", all: "1 = 1", reported: "reported = 1", hidden: "hidden = 1" }[f];
      if (!where) return out({ error: "invalid_filter" }, 400);
      const [list, cnt] = await env.DB.batch([
        env.DB.prepare(`SELECT id, name, message, created_at, discord_id, hidden, reported FROM entries WHERE ${where} ORDER BY id DESC LIMIT 200`),
        env.DB.prepare("SELECT SUM(hidden = 0 AND created_at >= datetime('now', '-7 days')) AS new, SUM(reported = 1) AS reported, SUM(hidden = 1) AS hidden, COUNT(*) AS all_ FROM entries"),
      ]);
      const c = cnt.results?.[0] || {};
      return out({ items: list.results || [], counts: { new: c.new || 0, reported: c.reported || 0, hidden: c.hidden || 0, all: c.all_ || 0 } });
    }
    if (!id || !/^\d{1,9}$/.test(id)) return out({ error: "not_found" }, 404);
    const cur = await env.DB.prepare("SELECT id, name, message, created_at, discord_id, avatar, hidden, reported FROM entries WHERE id = ?").bind(+id).first();
    if (!cur) return out({ error: "not_found" }, 404);
    if (req.method === "POST" && (action === "hide" || action === "unhide")) {
      const h = action === "hide" ? 1 : 0;
      if (cur.hidden === h) return out({ ok: true, unchanged: true });
      logWrites("admin-guestbook", await env.DB.batch([env.DB.prepare("UPDATE entries SET hidden = ?, reported = CASE WHEN ? = 1 THEN 0 ELSE reported END WHERE id = ?").bind(h, h, +id), log(env, who, "guestbook", id, action, { hidden: cur.hidden, reported: cur.reported }, now)]));
      return out({ ok: true, hidden: h });
    }
    if (req.method === "DELETE" && !action) {
      logWrites("admin-guestbook", await env.DB.batch([env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(+id), log(env, who, "guestbook", id, "delete", { id: cur.id, created_at: cur.created_at, hidden: cur.hidden, reported: cur.reported }, now)]));
      return out({ ok: true });
    }
    return out({ error: "method_not_allowed" }, 405);
  }

  return {
    isAdmin: (req, env) => isAdmin(req, env, getUser),
    /** /api/admin/*: null when the path is not ours. Anyone but an admin gets a 404 (the route doesn't reveal itself). */
    async api(p, req, env, url, now = Date.now()) {
      if (!p.startsWith("/api/admin/") && p !== "/api/admin") return null;
      const m = ROUTE.exec(p);
      const a = await isAdmin(req, env, getUser);
      if (a.err || !m) return out({ error: "not_found" }, 404);
      if (req.method !== "GET") {
        if (!originOk(req)) return out({ error: "bad_origin" }, 403);
        if (limited(String(a.user.id), now)) return out({ error: "rate_limited" }, 429);
      }
      const [, section, id, action] = m;
      try {
        if (section === "home") return action ? out({ error: "not_found" }, 404) : await home(req, env, a.user, id, now);
        if (section === "guestbook") return await guestbook(req, env, a.user, id, action, url, now);
        return await table(req, env, a.user, section, id, action, now);
      } catch (e) {
        if (/no such (table|column)/i.test(String(e?.message))) return out({ error: "migration_missing" }, 503);
        throw e;
      }
    },
  };
}
