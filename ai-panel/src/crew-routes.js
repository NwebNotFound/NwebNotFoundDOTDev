// crew-routes.js — the two read-only Crew-Runs endpoints the panel serves.
//
// Kept out of index.js on purpose: the router is the one file every feature touches, so a
// feature keeps its own file and index.js delegates to it in a single line. The Worker re-clamps
// and re-redacts whatever the origin proxy already did — a second pass costs nothing and means
// neither side alone is trusted with what the browser sees.

import * as up from "./upstream.js";
import { clampInt, redactValue, sessionKind } from "./redact.js";

//
//   GET /api/crew/sessions?bot=<bot>&filter=all|run|cli&limit&offset
//   GET /api/crew/sessions/<bot>/<session_id>/messages?limit&offset
//
// Both are GET-only, behind the panel session, and forward to the origin proxy's crew routes,
// which own the paging caps and the redaction. The Worker re-clamps and re-redacts anyway: a
// second pass costs nothing and means neither side alone is trusted with the browser's view.

const CREW_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CREW_FILTERS = new Set(["all", "run", "cli"]);
const CREW_LIST_MAX = 100;
const CREW_MESSAGES_MAX = 200;
const CREW_OFFSET_MAX = 100_000;

function crewSessionRow(row) {
  const id = String(row?.id || "");
  if (!CREW_ID.test(id)) return null;
  return {
    id,
    title: String(row?.title || "").slice(0, 300),
    kind: CREW_FILTERS.has(row?.kind) ? row.kind : sessionKind(id),
    status: row?.status ? String(row.status).slice(0, 40) : null,
    source: row?.source ? String(row.source).slice(0, 40) : null,
    model: row?.model ? String(row.model).slice(0, 120) : null,
    started_at: Number(row?.started_at) || null,
    last_active: Number(row?.last_active) || null,
    message_count: Number(row?.message_count) || 0,
  };
}

function crewMessageRow(row) {
  const content = typeof row?.content === "string" ? row.content : row?.content == null ? "" : JSON.stringify(row.content);
  return {
    role: String(row?.role || "?").slice(0, 24),
    content: String(content ?? "").slice(0, 20_000),
    timestamp: Number(row?.timestamp) || null,
    tool_name: row?.tool_name ? String(row.tool_name).slice(0, 80) : null,
  };
}

async function sessions(env, url, { json, upstreamProblem }) {
  const bot = String(url.searchParams.get("bot") || "");
  if (!(await up.isBot(env, bot))) return json({ error: "unknown_bot" }, 404);
  const filter = String(url.searchParams.get("filter") || "all").toLowerCase();
  if (!CREW_FILTERS.has(filter)) return json({ error: "invalid_filter" }, 400);
  const limit = clampInt(url.searchParams.get("limit"), { min: 1, max: CREW_LIST_MAX, dflt: 30 });
  const offset = clampInt(url.searchParams.get("offset"), { min: 0, max: CREW_OFFSET_MAX, dflt: 0 });

  const { status, data } = await up.call(
    env,
    "gw",
    `/p/${bot}/api/sessions?limit=${limit}&offset=${offset}&filter=${filter}`,
  );
  if (status >= 400) {
    upstreamProblem("crew_sessions", status, data);
    return json({ error: "sessions_unavailable" }, 502);
  }
  const rows = Array.isArray(data?.sessions) ? data.sessions : [];
  return json(
    redactValue({
      bot,
      filter,
      sessions: rows.map(crewSessionRow).filter(Boolean),
      total: Number(data?.total) || 0,
      limit: Number(data?.limit) || limit,
      offset: Number(data?.offset) || offset,
      has_more: Boolean(data?.has_more),
      truncated: Boolean(data?.truncated),
    }),
  );
}

async function sessionMessages(env, bot, sessionId, url, { json, upstreamProblem }) {
  if (!CREW_ID.test(sessionId)) return json({ error: "invalid_session_id" }, 400);
  if (!(await up.isBot(env, bot))) return json({ error: "unknown_bot" }, 404);
  const limit = clampInt(url.searchParams.get("limit"), { min: 1, max: CREW_MESSAGES_MAX, dflt: 100 });
  const offset = clampInt(url.searchParams.get("offset"), { min: 0, max: CREW_OFFSET_MAX, dflt: 0 });

  const { status, data } = await up.call(
    env,
    "gw",
    `/p/${bot}/api/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`,
  );
  if (status === 404) return json({ error: "session_not_found" }, 404);
  if (status >= 400) {
    upstreamProblem("crew_messages", status, data);
    return json({ error: "messages_unavailable" }, 502);
  }
  const rows = Array.isArray(data?.messages) ? data.messages : [];
  return json(
    redactValue({
      bot,
      session_id: sessionId,
      messages: rows.map(crewMessageRow),
      total: Number(data?.total) || 0,
      limit: Number(data?.limit) || limit,
      offset: Number(data?.offset) || offset,
      has_more: Boolean(data?.has_more),
      truncated: Boolean(data?.truncated),
    }),
  );
}

const CREW_MESSAGES_PATH = /^\/api\/crew\/sessions\/([a-z0-9][a-z0-9_-]{0,31})\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/messages$/;

/**
 * Answer a /api/crew/* request, or return null so the router keeps looking. `json` and
 * `upstreamProblem` come from index.js so cache-control and the security headers stay defined in
 * exactly one place.
 */
export async function handle(request, env, url, method, { json, upstreamProblem }) {
  const path = url.pathname;
  if (path === "/api/crew/sessions") {
    if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return await sessions(env, url, { json, upstreamProblem });
  }
  const messages = path.match(CREW_MESSAGES_PATH);
  if (messages) {
    if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return await sessionMessages(env, messages[1], messages[2], url, { json, upstreamProblem });
  }
  if (path.startsWith("/api/crew/")) return json({ error: "not_found" }, 404);
  return null;
}
