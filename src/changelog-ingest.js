// Automatic changelogs (Nils 08.11.). Every PR body in both repos carries a "## Changelog" block (PR template):
//
//   ## Changelog
//   area: site | mc
//   de: <kurzer Titel> – <optionale Unterzeile>
//   en: <short title> – <optional subline>
//
// or "none" for internal changes. On merge to main a tiny GitHub Action (.github/workflows/changelog.yml, curl only)
// posts the pull_request event to POST /api/changelog/ingest with a bearer token; this module parses the block and
// writes one live row per PR into the D1 changelog table (migration 0022: source = "<repo>#<n>", idempotent). A row
// Nils edited in the Verwaltung (edited = 1) is never touched again. area site -> website, mc -> server.

export const REPOS = ["NwebNotFound/NwebNotFoundDOTDev", "NwebNotFound/NwebNotFound", "NwebNotFound/mc-stack"];
export const MAX_EVENT = 512 * 1024;
const PLACEHOLDER = /<[^>]*>|^\s*(?:kurzer titel|short title)\b/i;

const clean = (s) => String(s || "").replace(/<!--[\s\S]*?-->/g, "").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
/** "Title – subline" (en dash, em dash or " - "); the subline is optional. */
function titleSub(v) {
  const s = clean(v);
  const m = /^(.+?)\s+[–—-]\s+(.+)$/.exec(s);
  const title = (m ? m[1] : s).trim(), sub = (m ? m[2] : "").trim();
  if (!title || PLACEHOLDER.test(title) || title.length > 80 || sub.length > 300 || PLACEHOLDER.test(sub)) return null;
  return { title, sub };
}

/** The block of a PR body: { none: true } | { area, de: {title, sub}, en: {title, sub} | null } | { error } . */
export function parseChangelog(body) {
  const text = String(body || "").replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const m = /^##\s+Changelog\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(text);
  if (!m) return { error: "missing" };
  const lines = m[1].split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "empty" };
  if (/^none\b/i.test(lines[0]) || /^[-*]\s*none\b/i.test(lines[0])) return { none: true };
  const get = (k) => { const l = lines.find((x) => new RegExp(`^[-*]?\\s*${k}\\s*:`, "i").test(x)); return l ? l.replace(new RegExp(`^[-*]?\\s*${k}\\s*:`, "i"), "").trim() : null; };
  const areaRaw = String(get("area") || "").toLowerCase().replace(/[^a-z |]/g, "").trim();
  const area = { site: "website", website: "website", mc: "server", server: "server", blog: "blog" }[areaRaw] || null;
  if (!area) return { error: "area" };
  const de = titleSub(get("de"));
  if (!de) return { error: "de" };
  const enRaw = get("en");
  const en = enRaw ? titleSub(enRaw) : null;
  return { area, de, en };
}

/** Day of the merge in Berlin (the changelog groups by day). */
export const berlinDay = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(iso));

/** The row for a merged PR event, or { skip } with the reason. Pure. */
export function rowFromEvent(ev) {
  const pr = ev && ev.pull_request;
  const repo = ev && ev.repository && ev.repository.full_name;
  if (!pr || !repo) return { skip: "not_a_pull_request" };
  if (!REPOS.includes(repo)) return { skip: "repo" };
  if (!pr.merged || !pr.merged_at) return { skip: "not_merged" };
  if (pr.base && pr.base.ref && pr.base.ref !== "main") return { skip: "not_main" };
  const n = Number(pr.number);
  if (!Number.isInteger(n) || n < 1) return { skip: "number" };
  const c = parseChangelog(pr.body);
  if (c.none) return { skip: "none" };
  if (c.error) return { skip: "changelog_" + c.error };
  const real = repo === "NwebNotFound/NwebNotFound" ? "NwebNotFound/NwebNotFoundDOTDev" : repo;   // renamed 08.11.
  return { row: {
    source: `${real}#${n}`, day: berlinDay(pr.merged_at), area: c.area, title_de: c.de.title, text_de: c.de.sub,
    title_en: c.en ? c.en.title : null, text_en: c.en ? c.en.sub || null : null, pr_url: /^https:\/\/github\.com\//.test(pr.html_url || "") ? pr.html_url : null,
  } };
}

/** POST /api/changelog/ingest. Bearer CHANGELOG_TOKEN (Worker secret); without the secret the endpoint is off (404). */
export function makeChangelogIngest({ json, safeEq, onWrite = () => {}, logWrites = (s, r) => r }) {
  return async function ingest(req, env, now = Date.now()) {
    const token = env.CHANGELOG_TOKEN;
    if (!token) return json({ error: "not_found" }, 404);
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ") || !safeEq(auth.slice(7), token)) return json({ error: "unauthorized" }, 401);
    const t = await req.text();
    if (t.length > MAX_EVENT) return json({ error: "too_large" }, 413);
    let ev; try { ev = JSON.parse(t); } catch { return json({ error: "invalid_json" }, 400); }
    const r = rowFromEvent(ev);
    if (r.skip) return json({ ok: true, skipped: r.skip }, 202);
    const x = r.row;
    // one row per PR; an edited row (Verwaltung) is never overwritten; an identical re-send writes nothing
    const res = logWrites("changelog-ingest", await env.DB.prepare(`INSERT INTO changelog (day, area, title_de, title_en, text_de, text_en, status, sort, version, updated_at, source, pr_url)
      VALUES (?, ?, ?, ?, ?, ?, 'live', 0, 1, ?, ?, ?)
      ON CONFLICT(source) WHERE source IS NOT NULL DO UPDATE SET area = excluded.area, title_de = excluded.title_de, title_en = excluded.title_en,
        text_de = excluded.text_de, text_en = excluded.text_en, pr_url = excluded.pr_url, version = version + 1, updated_at = excluded.updated_at
      WHERE changelog.edited = 0 AND (changelog.area IS NOT excluded.area OR changelog.title_de IS NOT excluded.title_de OR changelog.title_en IS NOT excluded.title_en
        OR changelog.text_de IS NOT excluded.text_de OR changelog.text_en IS NOT excluded.text_en)`)
      .bind(x.day, x.area, x.title_de, x.title_en, x.text_de, x.text_en, now, x.source, x.pr_url).run());
    const changed = !!(res && res.meta && res.meta.changes);
    if (changed) onWrite();
    return json({ ok: true, source: x.source, changed }, changed ? 201 : 200);
  };
}
