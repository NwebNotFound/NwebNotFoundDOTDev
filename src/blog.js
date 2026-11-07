// Blog (roadmap Phase 4), back end: storage in D1 (migrations/0016_blog.sql), public posts API,
// admin-only editor API, server-side Markdown rendering and RSS. The pages are deliberately plain:
// the UI gets redone after the design-language reset (Nils, 07.11.).
//
// Safety:
//   - Markdown is rendered with src/markdown.js: raw HTML is escaped, links are limited to
//     http(s)/mailto/relative, images only from /content-assets/. Titles, summaries and tags are
//     always escaped on output.
//   - Every editor route checks the admin server-side (verified mc_links row + rank "admin", the
//     same rule as the VIP panel) and fails closed. Writes also need the site's own Origin and JSON.
//   - Drafts are only readable by the admin or with the post's secret preview token.
import { renderMarkdown, escapeHtml as esc, htmlToText } from "./markdown.js";
import { xmlEscape, cdata, rfc822 } from "./feed.js";
import { AV } from "./asset-version.js";

export const CATEGORIES = ["bauen", "server", "musik", "notizen"];
export const STATUSES = ["draft", "published", "withdrawn"];
export const LIMITS = { slug: 80, title: 140, summary: 400, body: 100_000, tags: 8, tag: 32, query: 60, request: 300_000 };
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
// Slugs that are routes of their own under /blog/ (editor, feed); a post may never take them.
export const RESERVED_SLUGS = ["admin", "feed", "feed-xml", "rss"];
const slugOk = (x) => SLUG.test(x) && !RESERVED_SLUGS.includes(x);
const ID = /^[0-9a-f-]{36}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const CAT_LABEL = { bauen: "Bauen", server: "Server", musik: "Musik", notizen: "Notizen" };
const CAT_LABEL_EN = { bauen: "Build", server: "Server", musik: "Music", notizen: "Notes" };

/** "Über Häuser & Bäume" -> "ueber-haeuser-baeume" (max 80 chars, may be empty). */
export function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug).replace(/-+$/g, "");
}

const str = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n") : v == null ? "" : null)?.slice(0, max + 1) ?? null;

/**
 * Validate an editor payload. Only known fields are taken; everything is length-checked.
 * Returns `{ post }` with the fields that were present, or `{ error }`.
 */
export function cleanPost(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { error: "invalid_body" };
  const out = {};
  for (const [k, max] of [["title_de", LIMITS.title], ["summary_de", LIMITS.summary], ["body_de", LIMITS.body], ["title_en", LIMITS.title], ["summary_en", LIMITS.summary], ["body_en", LIMITS.body]]) {
    if (!(k in b)) continue;
    const v = str(b[k], max);
    if (v === null) return { error: `${k}: text expected` };
    if (v.length > max) return { error: `${k}: max ${max} characters` };
    out[k] = k.startsWith("body") ? v : v.trim();
  }
  if ("slug" in b) {
    const s = String(b.slug ?? "").trim().toLowerCase();
    if (!SLUG.test(s)) return { error: "slug: a-z, 0-9 and -, 1-80 characters" };
    if (RESERVED_SLUGS.includes(s)) return { error: `slug: "${s}" is reserved` };
    out.slug = s;
  }
  if ("category" in b) {
    if (!CATEGORIES.includes(b.category)) return { error: `category: one of ${CATEGORIES.join("|")}` };
    out.category = b.category;
  }
  if ("tags" in b) {
    if (!Array.isArray(b.tags) || b.tags.length > LIMITS.tags) return { error: `tags: up to ${LIMITS.tags}` };
    const tags = [];
    for (const t of b.tags) {
      const v = typeof t === "string" ? t.trim().toLowerCase().replace(/\s+/g, " ") : "";
      if (!v || v.length > LIMITS.tag || /[<>"'&,]/.test(v)) return { error: `tags: 1-${LIMITS.tag} characters, no <>"'&,` };
      if (!tags.includes(v)) tags.push(v);
    }
    out.tags = tags;
  }
  return { post: out };
}

/** Why a post can't be published yet, or null. */
export function publishProblem(p) {
  if (!p.title_de) return "title_de missing";
  if (!p.body_de || !p.body_de.trim()) return "body_de missing";
  if (!slugOk(p.slug || "")) return "slug invalid";
  if (!CATEGORIES.includes(p.category)) return "category invalid";
  return null;
}

/** Render Markdown to safe HTML; h2-h4 get stable ids, collected as table of contents. */
export function renderBody(md) {
  const html = renderMarkdown(md);
  const toc = [], seen = new Map();
  const out = html.replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = htmlToText(inner);
    const base = "h-" + (slugify(text) || "abschnitt");
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    toc.push({ level: Number(level), id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, toc };
}

const parseTags = (s) => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** A post in the reader's language: EN only when it has an EN title and body, else DE. */
export function localized(row, lang) {
  const en = lang === "en" && !!row.title_en && !!(row.body_en || "").trim();
  return {
    slug: row.slug, category: row.category, tags: parseTags(row.tags), status: row.status,
    lang: en ? "en" : "de", has_en: !!row.title_en && !!(row.body_en || "").trim(),
    title: en ? row.title_en : row.title_de,
    summary: (en ? row.summary_en : row.summary_de) || "",
    body: en ? row.body_en : row.body_de,
    published_at: row.published_at || null, updated_at: row.updated_at,
  };
}

// body_en only as a flag (has an English body?), so the list never loads full texts.
const LIST_COLS = "id, length(body_de) AS body_len, slug, status, category, tags, title_de, summary_de, title_en, summary_en, CASE WHEN length(trim(coalesce(body_en, ''))) > 0 THEN 'x' ELSE '' END AS body_en, published_at, updated_at";
const fmtDate = (ms, lang) => (ms ? new Date(ms).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" }) : "");

/** Most reading-progress rows one user can have (every post and chapter they open; Gatekeeper #115). */
export const READS_CAP = 500;

export function makeBlog({ json, getUser, html, sitePage, rand, safeEq, MAIN, notFound, chapterExists = () => false }) {
  const SITE = `https://${MAIN}`;
  // ---- admin check (fails closed) ----
  async function admin(req, env) {
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
  const originOk = (req) => { const o = req.headers.get("origin"); if (!o) return false; try { return new URL(o).hostname === MAIN; } catch { return false; } };
  async function readJson(req) {
    if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return { err: [415, "json_expected"] };
    const t = await req.text();
    if (t.length > LIMITS.request) return { err: [413, "too_large"] };
    try { return { body: JSON.parse(t) }; } catch { return { err: [400, "invalid_json"] }; }
  }
  const deny = (s, e) => json({ error: e }, s);

  // ---- reads ----
  async function listPublished(env, { q = "", cat = "" } = {}) {
    let sql = `SELECT ${LIST_COLS} FROM blog_posts WHERE status = 'published'`;
    const args = [];
    if (CATEGORIES.includes(cat)) { sql += " AND category = ?"; args.push(cat); }
    const terms = String(q).trim().toLowerCase().slice(0, LIMITS.query).split(/\s+/).filter(Boolean).slice(0, 5);
    for (const t of terms) {
      const like = `%${likeEscape(t)}%`;
      sql += " AND (lower(title_de) LIKE ? ESCAPE '\\' OR lower(coalesce(title_en, '')) LIKE ? ESCAPE '\\' OR lower(tags) LIKE ? ESCAPE '\\')";
      args.push(like, like, like);
    }
    sql += " ORDER BY published_at DESC LIMIT 50";
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return results || [];
  }
  async function bySlug(env, slug) {
    if (!SLUG.test(slug)) return null;
    return env.DB.prepare("SELECT * FROM blog_posts WHERE slug = ?").bind(slug).first();
  }
  // Published posts for everyone; drafts/withdrawn only with the preview token or for the admin.
  async function readable(req, env, slug, preview) {
    const row = await bySlug(env, slug).catch(() => null);
    if (!row) return null;
    if (row.status === "published") return { row, priv: false };
    if (preview && TOKEN.test(preview) && row.preview_token && safeEq(preview, row.preview_token)) return { row, priv: true };
    if ((await admin(req, env)).user) return { row, priv: true };
    return null;
  }
  const postJson = (row, lang) => { const p = localized(row, lang); const r = renderBody(p.body); delete p.body; return { ...p, html: r.html, toc: r.toc }; };

  // ---- editor writes ----
  const now = () => Date.now();
  async function create(req, env, a) {
    const r = await readJson(req); if (r.err) return deny(...r.err);
    const c = cleanPost(r.body); if (c.error) return deny(400, c.error);
    const p = c.post;
    const title = p.title_de || "";
    let slug = p.slug || slugify(title) || "entwurf-" + now().toString(36);
    if (RESERVED_SLUGS.includes(slug)) slug = (slug + "-1").slice(0, LIMITS.slug);   // a post titled "Admin" gets admin-1
    const id = crypto.randomUUID(), t = now(), token = rand(24);
    try {
      await env.DB.prepare("INSERT INTO blog_posts (id, slug, status, category, tags, title_de, summary_de, body_de, title_en, summary_en, body_en, preview_token, author_id, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, slug, p.category || "notizen", JSON.stringify(p.tags || []), title, p.summary_de || "", p.body_de || "", p.title_en || null, p.summary_en || null, p.body_en || null, token, String(a.user.id), t, t).run();
    } catch (e) {
      if (/UNIQUE/i.test(String(e?.message || e))) return deny(409, "slug_taken");
      throw e;
    }
    return json({ id, slug, status: "draft", updated_at: t, preview_token: token }, 201);
  }
  // Save / autosave. `base` is the updated_at the editor loaded: a stale tab gets 409 instead of
  // silently overwriting newer text.
  async function save(req, env, id) {
    const r = await readJson(req); if (r.err) return deny(...r.err);
    const c = cleanPost(r.body); if (c.error) return deny(400, c.error);
    const base = Number(r.body.base);
    if (!Number.isSafeInteger(base)) return deny(400, "base: updated_at expected");
    const cur = await env.DB.prepare("SELECT status, updated_at, slug, category, title_de, body_de FROM blog_posts WHERE id = ?").bind(id).first();
    if (!cur) return deny(404, "not_found");
    if (cur.updated_at !== base) return json({ error: "conflict", updated_at: cur.updated_at }, 409);
    const p = c.post;
    if (cur.status === "published") { const prob = publishProblem({ ...cur, ...p }); if (prob) return deny(400, "published post: " + prob); }
    const keys = Object.keys(p);
    const t = Math.max(now(), base + 1);
    const sets = keys.map((k) => `${k} = ?`).concat("updated_at = ?").join(", ");
    const vals = keys.map((k) => (k === "tags" ? JSON.stringify(p[k]) : k.endsWith("_en") && p[k] === "" ? null : p[k]));
    try {
      const res = await env.DB.prepare(`UPDATE blog_posts SET ${sets} WHERE id = ? AND updated_at = ?`).bind(...vals, t, id, base).run();
      if (!res?.meta?.changes) { const now2 = await env.DB.prepare("SELECT updated_at FROM blog_posts WHERE id = ?").bind(id).first(); return json({ error: "conflict", updated_at: now2?.updated_at ?? null }, 409); }
    } catch (e) {
      if (/UNIQUE/i.test(String(e?.message || e))) return deny(409, "slug_taken");
      throw e;
    }
    return json({ ok: true, updated_at: t });
  }
  async function setStatus(req, env, id) {
    const r = await readJson(req); if (r.err) return deny(...r.err);
    const status = r.body?.status, base = Number(r.body?.base);
    if (!STATUSES.includes(status)) return deny(400, `status: one of ${STATUSES.join("|")}`);
    // Like save(): only against the version the editor has, so a stale tab can't publish or withdraw.
    if (!Number.isSafeInteger(base)) return deny(400, "base: updated_at expected");
    const cur = await env.DB.prepare("SELECT * FROM blog_posts WHERE id = ?").bind(id).first();
    if (!cur) return deny(404, "not_found");
    if (cur.updated_at !== base) return json({ error: "conflict", updated_at: cur.updated_at }, 409);
    if (status === "published") { const prob = publishProblem(cur); if (prob) return deny(400, prob); }
    const t = Math.max(now(), base + 1);
    const res = await env.DB.prepare("UPDATE blog_posts SET status = ?, published_at = CASE WHEN ? = 'published' THEN coalesce(published_at, ?) ELSE published_at END, updated_at = ? WHERE id = ? AND updated_at = ?").bind(status, status, t, t, id, base).run();
    if (!res?.meta?.changes) return json({ error: "conflict" }, 409);
    return json({ ok: true, status, updated_at: t });
  }
  async function rotateToken(env, id) {
    const token = rand(24);
    const res = await env.DB.prepare("UPDATE blog_posts SET preview_token = ? WHERE id = ?").bind(token, id).run();
    return res?.meta?.changes ? json({ preview_token: token }) : deny(404, "not_found");
  }

  // ---- API router: /api/blog… ----
  async function api(p, req, env, url) {
    if (p === "/api/blog/react" || p === "/api/blog/progress") return readerApi(p, req, env);
    if (p === "/api/blog" || p.startsWith("/api/blog/post/")) {
      if (req.method !== "GET") return deny(405, "method_not_allowed");
      const lang = url.searchParams.get("lang") === "en" ? "en" : "de";
      if (p === "/api/blog") {
        const rows = await listPublished(env, { q: url.searchParams.get("q") || "", cat: url.searchParams.get("cat") || "" });
        return json({ posts: rows.map((r) => localized({ ...r, body_de: "" }, lang)).map(({ body, ...x }) => x) });
      }
      const got = await readable(req, env, p.slice("/api/blog/post/".length), url.searchParams.get("preview"));
      if (!got) return deny(404, "not_found");
      return json(postJson(got.row, lang), 200, got.priv ? { "cache-control": "private, no-store" } : {});
    }
    if (!p.startsWith("/api/blog/admin")) return null;
    const a = await admin(req, env);
    if (a.err) return deny(a.err, a.err === 401 ? "login_required" : "admin_only");
    if (req.method !== "GET" && !originOk(req)) return deny(403, "bad_origin");
    const rest = p.slice("/api/blog/admin".length);
    if (rest === "/posts") {
      if (req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id, slug, status, category, title_de, title_en, published_at, updated_at FROM blog_posts ORDER BY updated_at DESC LIMIT 200").all();
        return json({ posts: results || [] });
      }
      if (req.method === "POST") return create(req, env, a);
      return deny(405, "method_not_allowed");
    }
    if (rest === "/render") {
      if (req.method !== "POST") return deny(405, "method_not_allowed");
      const r = await readJson(req); if (r.err) return deny(...r.err);
      const md = typeof r.body?.md === "string" ? r.body.md.slice(0, LIMITS.body) : "";
      return json(renderBody(md));
    }
    const m = /^\/posts\/([0-9a-f-]{36})(\/status|\/preview-token)?$/.exec(rest);
    if (!m || !ID.test(m[1])) return deny(404, "not_found");
    const [, id, sub] = m;
    if (!sub && req.method === "GET") {
      const row = await env.DB.prepare("SELECT * FROM blog_posts WHERE id = ?").bind(id).first();
      return row ? json({ ...row, tags: parseTags(row.tags) }) : deny(404, "not_found");
    }
    if (!sub && req.method === "PUT") return save(req, env, id);
    if (sub === "/status" && req.method === "POST") return setStatus(req, env, id);
    if (sub === "/preview-token" && req.method === "POST") return rotateToken(env, id);
    return deny(405, "method_not_allowed");
  }

  // ---- pages (minimal markup; restyled after the design reset) ----
  const href = (lang, path) => (lang === "en" ? "/en" + path : path);
  const T = (lang) => (lang === "en"
    ? { list: "Blog", search: "Search", searchLabel: "Search title or tags", all: "All", none: "No posts yet.", noHits: "No posts match.", cats: "Categories", toc: "Contents", reply: "Reply in the guestbook", back: "All posts", draft: "Preview (not published)", other: "Deutsch", rss: "RSS feed" }
    : { list: "Blog", search: "Suchen", searchLabel: "Titel oder Tags suchen", all: "Alle", none: "Noch keine Beiträge.", noHits: "Keine passenden Beiträge.", cats: "Kategorien", toc: "Inhalt", reply: "Im Gästebuch antworten", back: "Alle Beiträge", draft: "Vorschau (nicht veröffentlicht)", other: "English", rss: "RSS-Feed" });
  const catLabel = (c, lang) => (lang === "en" ? CAT_LABEL_EN : CAT_LABEL)[c] || c;
  // Self-referencing canonical per language; hreflang de/en/x-default only where both languages exist (x-default = the German URL).
  const langMeta = (bare, lang, both) => {
    const u = (l) => `${SITE}${l === "en" ? "/en" : ""}${bare}`;
    return { canonicalTo: u(lang), hreflangs: both ? [{ hreflang: "de", href: u("de") }, { hreflang: "en", href: u("en") }, { hreflang: "x-default", href: u("de") }] : [] };
  };
  const rssLink = `<link rel="alternate" type="application/rss+xml" title="Blog · NwebNotFound" href="/blog/feed.xml">`;

  async function listPage(req, env, url, lang) {
    const t = T(lang), q = String(url.searchParams.get("q") || "").slice(0, LIMITS.query), cat = url.searchParams.get("cat") || "";
    const rows = await listPublished(env, { q, cat }).catch(() => []);
    const cats = [["", t.all], ...CATEGORIES.map((c) => [c, catLabel(c, lang)])].map(([c, l]) => `<a href="${href(lang, "/blog")}${c ? "?cat=" + c : ""}"${c === cat || (!c && !CATEGORIES.includes(cat)) ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join(" · ");
    const items = rows.map((r) => localized({ ...r, body_de: "" }, lang)).map((p) => `<li><article><h2><a href="${href(lang, "/blog/" + p.slug)}">${esc(p.title)}</a></h2><p><small>${esc(catLabel(p.category, lang))} · <time datetime="${new Date(p.published_at).toISOString()}">${esc(fmtDate(p.published_at, lang))}</time>${p.tags.length ? " · " + p.tags.map(esc).join(", ") : ""}</small></p>${p.summary ? `<p>${esc(p.summary)}</p>` : ""}</article></li>`).join("");
    const body = `<div class="blog"><h1>${t.list}</h1><form role="search" method="get" action="${href(lang, "/blog")}"><label>${t.searchLabel} <input type="search" name="q" value="${esc(q)}" maxlength="${LIMITS.query}"></label>${CATEGORIES.includes(cat) ? `<input type="hidden" name="cat" value="${cat}">` : ""} <button type="submit">${t.search}</button></form><nav aria-label="${t.cats}"><p>${cats}</p></nav>${items ? `<ul class="blog-list">${items}</ul>` : `<p>${q || CATEGORIES.includes(cat) ? t.noHits : t.none}</p>`}<p><a href="/blog/feed.xml">${t.rss}</a></p></div>`;
    return html(sitePage({ lang, bare: "/blog", title: "Blog · NwebNotFound", desc: lang === "en" ? "Notes on building, the server and music." : "Notizen zu Bauen, Server und Musik.", body, head: rssLink, ...langMeta("/blog", lang, true) }));
  }

  async function postPage(req, env, url, lang, slug) {
    const got = await readable(req, env, slug, url.searchParams.get("preview"));
    if (!got) return notFound(false, req);
    const p = postJson(got.row, lang), t = T(p.lang);
    const toc = p.toc.length > 1 ? `<nav class="blog-toc" aria-label="${t.toc}"><h2>${t.toc}</h2><ol>${p.toc.map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join("")}</ol></nav>` : "";
    const keep = got.priv && url.searchParams.get("preview") ? "?preview=" + encodeURIComponent(url.searchParams.get("preview")) : "";
    const other = p.has_en ? `<p><a href="${p.lang === "en" ? "/blog/" + p.slug : "/en/blog/" + p.slug}${keep}" hreflang="${p.lang === "en" ? "de" : "en"}">${p.lang === "en" ? "Deutsch" : "English"}</a></p>` : "";
    const when = p.published_at ? `<time datetime="${new Date(p.published_at).toISOString()}">${esc(fmtDate(p.published_at, p.lang))}</time> · ` : "";
    const body = `<div class="blog"><article class="blog-post" lang="${p.lang}">${got.priv && p.status !== "published" ? `<p role="status"><strong>${t.draft}</strong></p>` : ""}<p><a href="${href(lang, "/blog")}">← ${t.back}</a></p><h1>${esc(p.title)}</h1><p><small>${when}${esc(catLabel(p.category, p.lang))}${p.tags.length ? " · " + p.tags.map(esc).join(", ") : ""}</small></p>${other}${toc}<div class="blog-body">${p.html}</div><p><a href="/guestbook">${t.reply}</a></p></article></div>`;
    const head = (got.priv ? `<meta name="robots" content="noindex">` : "") + rssLink;
    return html(sitePage({ lang: p.lang, bare: "/blog/" + p.slug, title: `${p.title} · Blog · NwebNotFound`, desc: p.summary || htmlToText(p.html).slice(0, 160), body, head, ...langMeta("/blog/" + p.slug, p.lang, p.has_en && !got.priv) }), 200, got.priv ? { "cache-control": "private, no-store" } : {});
  }

  async function feed(env) {
    const full = (await env.DB.prepare("SELECT slug, title_de, body_de, tags, category, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 30").all().catch(() => null))?.results || [];
    const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">', "<channel>",
      "<title>Blog · NwebNotFound</title>", `<link>${SITE}/blog</link>`, "<description>Notizen zu Bauen, Server und Musik.</description>", "<language>de</language>",
      `<atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>`];
    for (const r of full) {
      const u = `${SITE}/blog/${r.slug}`, iso = new Date(r.published_at).toISOString();
      lines.push("<item>", `<title>${xmlEscape(r.title_de)}</title>`, `<link>${xmlEscape(u)}</link>`, `<guid isPermaLink="true">${xmlEscape(u)}</guid>`, `<pubDate>${rfc822(iso)}</pubDate>`,
        `<description>${cdata(renderBody(r.body_de).html)}</description>`, `<category>${xmlEscape(CAT_LABEL[r.category] || r.category)}</category>`, ...parseTags(r.tags).map((x) => `<category>${xmlEscape(x)}</category>`), "</item>");
    }
    lines.push("</channel>", "</rss>");
    return new Response(lines.join("\n") + "\n", { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
  }

  async function editorPage(req, env, lang, rest) {
    const a = await admin(req, env);
    if (a.err === 401) return new Response(null, { status: 302, headers: { location: `/auth/discord/login?next=${encodeURIComponent(SITE + "/blog/admin" + rest)}`, "cache-control": "no-store" } });
    if (a.err) return notFound(false, req);
    const id = rest.slice(1);
    if (rest && !ID.test(id)) return notFound(false, req);
    const body = rest
      ? `<div class="blog blog-editor" data-blog-editor="${id}"><p><a href="/blog/admin">← Alle Beiträge</a></p><h1>Beitrag bearbeiten</h1><p role="status" data-blog-state>Lädt …</p>
<div class="blog-ed-meta"><label>Slug <input name="slug" maxlength="${LIMITS.slug}"></label> <label>Kategorie <select name="category">${CATEGORIES.map((c) => `<option value="${c}">${CAT_LABEL[c]}</option>`).join("")}</select></label> <label>Tags (Komma) <input name="tags" maxlength="300"></label></div>
<div class="blog-ed-tabs" role="group" aria-label="Sprache"><button type="button" aria-pressed="true" data-tab="de">Deutsch</button> <button type="button" aria-pressed="false" data-tab="en">English (optional)</button></div>
${["de", "en"].map((l) => `<fieldset data-lang="${l}"${l === "en" ? " hidden" : ""}><legend>${l === "de" ? "Deutsch" : "English"}</legend><label>Titel <input name="title_${l}" maxlength="${LIMITS.title}"></label><label>Kurzbeschreibung <textarea name="summary_${l}" rows="2" maxlength="${LIMITS.summary}"></textarea></label><label>Text (Markdown) <textarea name="body_${l}" rows="18" maxlength="${LIMITS.body}"></textarea></label></fieldset>`).join("")}
<section class="blog-ed-preview" aria-label="Vorschau"><h2>Vorschau</h2><nav class="blog-toc" data-blog-toc></nav><div class="blog-body" data-blog-preview></div></section>
<p class="blog-ed-actions"><span>Status: <b data-blog-status></b></span> <button type="button" data-set-status="published">Veröffentlichen</button> <button type="button" data-set-status="draft">Zurück zu Entwurf</button> <button type="button" data-set-status="withdrawn">Zurückziehen</button> <a data-blog-preview-link href="#">Geheimer Vorschau-Link</a> <button type="button" data-rotate>Neuen Vorschau-Link erzeugen</button></p></div>`
      : `<div class="blog blog-editor" data-blog-admin><h1>Blog-Editor</h1><p><button type="button" data-blog-new>Neuer Beitrag</button></p><p role="status" data-blog-state>Lädt …</p><ul data-blog-posts></ul></div>`;
    const head = `<meta name="robots" content="noindex"><script src="/design/blog-editor.js?v=${AV}" defer></script>`;
    return html(sitePage({ lang, bare: "/blog/admin", title: "Blog-Editor · NwebNotFound", desc: "Blog-Editor", body, head }), 200, { "cache-control": "private, no-store" });
  }

  /** Pages under /blog (bare path, language already split off). Returns null for other paths. */
  async function page(bare, req, env, url, lang) {
    if (bare === "/blog") return listPage(req, env, url, lang);
    if (bare === "/blog/feed.xml") return feed(env);
    if (bare === "/blog/admin" || bare.startsWith("/blog/admin/")) return editorPage(req, env, lang, bare.slice("/blog/admin".length));
    if (bare.startsWith("/blog/")) return postPage(req, env, url, lang, bare.slice(6));
    return null;
  }

  // ---- NwebOS windows (src/nwebos-apps.js): data, reactions, reading progress ----
  const KINDS = ["heart", "star", "sun"];
  async function hearts(env, ids) {
    if (!ids.length) return {};
    const { results } = await env.DB.prepare(`SELECT post_id, COUNT(*) AS n FROM blog_reactions WHERE kind = 'heart' AND post_id IN (${ids.map(() => "?").join(",")}) GROUP BY post_id`).bind(...ids).all();
    return Object.fromEntries((results || []).map((r) => [r.post_id, r.n]));
  }
  async function reactions(env, id, uid) {
    const { results } = await env.DB.prepare("SELECT kind, COUNT(*) AS n FROM blog_reactions WHERE post_id = ? GROUP BY kind").bind(id).all();
    const out = { heart: 0, star: 0, sun: 0, mine: new Set() };
    for (const r of results || []) out[r.kind] = r.n;
    if (uid) { const { results: m } = await env.DB.prepare("SELECT kind FROM blog_reactions WHERE post_id = ? AND discord_id = ?").bind(id, String(uid)).all(); for (const r of m || []) out.mine.add(r.kind); }
    return out;
  }
  const os = {
    /** Published posts for the Blog window: [{ slug, category, tags, title, summary, published_at, body_len, hearts }]. */
    async list(env, lang) {
      const rows = await listPublished(env).catch(() => []);
      const h = await hearts(env, rows.map((r) => r.id)).catch(() => ({}));
      return rows.map((r) => ({ ...localized({ ...r, body_de: "" }, lang), body_len: r.body_len, hearts: h[r.id] || 0 }));
    },
    /** One post for the reader window, or null (unknown, or a draft without the right token). */
    async post(req, env, slug, preview, lang) {
      const got = await readable(req, env, slug, preview);
      if (!got) return null;
      const u = await getUser(req, env).catch(() => null);
      const p = postJson(got.row, lang);
      const rx = got.priv ? { heart: 0, star: 0, sun: 0, mine: new Set() } : await reactions(env, got.row.id, u && u.id).catch(() => ({ heart: 0, star: 0, sun: 0, mine: new Set() }));
      let older = null, newer = null;
      if (!got.priv && got.row.published_at) {
        older = await env.DB.prepare("SELECT slug, title_de, title_en FROM blog_posts WHERE status='published' AND published_at < ? ORDER BY published_at DESC LIMIT 1").bind(got.row.published_at).first().catch(() => null);
        newer = await env.DB.prepare("SELECT slug, title_de, title_en FROM blog_posts WHERE status='published' AND published_at > ? ORDER BY published_at ASC LIMIT 1").bind(got.row.published_at).first().catch(() => null);
      }
      const t = (r) => r && { slug: r.slug, title: lang === "en" && r.title_en ? r.title_en : r.title_de };
      return { post: { ...p, body_len: (got.row.body_de || "").length }, rx, older: t(older), newer: t(newer), priv: got.priv, signedIn: !!u };
    },
    /** The signed-in reader's progress, newest first: [{ key, pct }]. */
    async reads(env, uid, limit = 6) {
      const { results } = await env.DB.prepare("SELECT post_id, pct FROM blog_reads WHERE discord_id = ? ORDER BY updated_at DESC LIMIT ?").bind(String(uid), limit).all();
      return results || [];
    },
    async titles(env, slugs) {
      if (!slugs.length) return {};
      const { results } = await env.DB.prepare(`SELECT slug, title_de, title_en FROM blog_posts WHERE status='published' AND slug IN (${slugs.map(() => "?").join(",")})`).bind(...slugs).all();
      return Object.fromEntries((results || []).map((r) => [r.slug, r]));
    },
  };
  // POST /api/blog/react { slug, kind }: toggle one reaction (signed in, one per kind and account). POST /api/blog/progress
  // { key, pct }: "blog:<slug>" or "writing:<series>:<n>", 0..100, highest value kept. Both need the site's Origin and JSON.
  async function readerApi(p, req, env) {
    if (req.method !== "POST") return deny(405, "method_not_allowed");
    if (!originOk(req)) return deny(403, "bad_origin");
    const u = await getUser(req, env).catch(() => null);
    if (!u) return deny(401, "login_required");
    const r = await readJson(req); if (r.err) return deny(...r.err);
    if (p === "/api/blog/react") {
      const slug = String(r.body?.slug || ""), kind = String(r.body?.kind || "");
      if (!KINDS.includes(kind)) return deny(400, "kind: heart|star|sun");
      const row = await bySlug(env, slug);
      if (!row || row.status !== "published") return deny(404, "not_found");
      const had = await env.DB.prepare("SELECT 1 FROM blog_reactions WHERE post_id=? AND discord_id=? AND kind=?").bind(row.id, String(u.id), kind).first();
      if (had) await env.DB.prepare("DELETE FROM blog_reactions WHERE post_id=? AND discord_id=? AND kind=?").bind(row.id, String(u.id), kind).run();
      else await env.DB.prepare("INSERT OR IGNORE INTO blog_reactions (post_id, discord_id, kind, created_at) VALUES (?, ?, ?, ?)").bind(row.id, String(u.id), kind, Date.now()).run();
      const rx = await reactions(env, row.id, u.id);
      // `on` from the stored state: before migration 0017 an INSERT OR IGNORE of "sun" is dropped by the CHECK
      return json({ ok: true, on: rx.mine.has(kind), counts: { heart: rx.heart, star: rx.star, sun: rx.sun } });
    }
    const key = String(r.body?.key || ""), pct = Math.round(Number(r.body?.pct));
    if (!/^(?:blog:[a-z0-9-]{1,80}|writing:[a-z0-9-]{1,80}:\d{1,3})$/.test(key) || !(pct >= 0 && pct <= 100)) return deny(400, "invalid");
    // only for something that exists: a published post or a chapter in content/ (no free-form keys)
    if (key.startsWith("blog:")) { const row = await bySlug(env, key.slice(5)); if (!row || row.status !== "published") return deny(404, "not_found"); }
    else { const [, s, n] = key.split(":"); if (!chapterExists(s, Number(n))) return deny(404, "not_found"); }
    const known = await env.DB.prepare("SELECT 1 FROM blog_reads WHERE discord_id = ? AND post_id = ?").bind(String(u.id), key).first();
    if (!known) {
      const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM blog_reads WHERE discord_id = ?").bind(String(u.id)).first();
      if ((c?.n || 0) >= READS_CAP) return deny(429, "too_many_reads");
    }
    await env.DB.prepare("INSERT INTO blog_reads (discord_id, post_id, pct, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(discord_id, post_id) DO UPDATE SET pct = MAX(pct, excluded.pct), updated_at = excluded.updated_at").bind(String(u.id), key, pct, Date.now()).run();
    return json({ ok: true });
  }

  return { api, page, admin, os, readerApi };
}
