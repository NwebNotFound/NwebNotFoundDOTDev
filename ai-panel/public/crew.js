// Crew-Runs view model and DOM builders for the panel.
//
// Safety rule, same as app.js: this file never produces an HTML string. Every value that came
// from a bot (session title, status, transcript body, tool name) reaches the DOM through
// `text:` / a text child, never through markup. The builders take the shell's `el` helper as an
// argument so they stay testable without a browser.
//
// Read-only by construction: there is no approve, delete, steer or stop helper here, and the
// endpoints behind it are GET-only.

export const FILTERS = [
  { id: "all", label: "Alle" },
  { id: "run", label: "API-Runs" },
  { id: "cli", label: "CLI-Sessions" },
];

const KIND_LABEL = { run: "Run", cli: "CLI", other: "Session" };

export function kindLabel(kind) {
  return KIND_LABEL[kind] || KIND_LABEL.other;
}

/** A status string mapped to what the badge says. Unknown statuses are shown as-is (clipped). */
export function statusLabel(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "unbekannt";
  if (["completed", "finished", "success", "done", "ok"].includes(value)) return "abgeschlossen";
  if (["running", "started", "queued", "pending", "in_progress"].includes(value)) return "läuft";
  if (["failed", "error", "errored"].includes(value)) return "fehlgeschlagen";
  if (["cancelled", "canceled", "stopped", "aborted"].includes(value)) return "abgebrochen";
  return value.slice(0, 24);
}

/** Epoch seconds (or ms) → short local date/time. Deterministic for a given TZ. */
export function formatTime(epoch) {
  const n = Number(epoch);
  if (!Number.isFinite(n) || n <= 0) return "";
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function messageCountLabel(count) {
  const n = Number(count) || 0;
  return n === 1 ? "1 Nachricht" : `${n} Nachrichten`;
}

/** One row of the list, as a button so it is keyboard- and touch-reachable. */
export function crewCard(el, row, onOpen) {
  const title = String(row?.title || "").trim() || String(row?.id || "(ohne Titel)");
  const meta = [statusLabel(row?.status), formatTime(row?.started_at), messageCountLabel(row?.message_count)]
    .filter(Boolean)
    .join(" · ");
  return el(
    "button",
    {
      class: "crew-card",
      type: "button",
      "aria-label": `${kindLabel(row?.kind)} ${title}, ${meta}`,
      onclick: () => {
        if (typeof onOpen === "function") onOpen(row);
      },
    },
    el(
      "span",
      { class: "crew-card-head" },
      el("span", { class: `crew-badge kind-${row?.kind || "other"}`, text: kindLabel(row?.kind) }),
      el("span", { class: "crew-title", text: title }),
    ),
    el("span", { class: "crew-meta", text: meta }),
    el("span", { class: "crew-id", text: String(row?.id || "") }),
  );
}

/** One transcript row. Tool rows get a monospace body; everything else is prose. */
export function crewMessageRow(el, msg) {
  const role = String(msg?.role || "?").toLowerCase();
  const tool = msg?.tool_name ? String(msg.tool_name) : "";
  const when = formatTime(msg?.timestamp);
  const head = [role === "tool" ? "tool" : role, tool, when].filter(Boolean).join(" · ");
  const body = String(msg?.content ?? "");
  return el(
    "article",
    { class: `crew-msg role-${role}` },
    el("div", { class: "crew-msg-head", text: head }),
    el("pre", { class: "crew-msg-body", text: body }),
  );
}

/** "Zeige 1–30 von 84" — the count line above the list. */
export function rangeLabel({ shown, total, offset }) {
  const start = total ? offset + 1 : 0;
  const end = offset + shown;
  if (!shown) return "keine Einträge";
  return `Zeige ${start}–${end} von ${total || end}${total > end ? "" : " (Ende)"}`;
}

/**
 * The Crew-Runs view. It is built with the shell's helpers and owns its own state, so app.js
 * only calls open() and wire(): the whole tab lives in this file.
 *
 * Read-only by construction: every handler here loads or filters, none of them writes.
 */
export function createCrewView({ $, el, clear, api, describeError, state }) {
  const crew = {
    bot: "",
    filter: "all",
    rows: [],
    total: 0,
    hasMore: false,
    session: null,
    sessionMeta: "",
    msgOffset: 0,
    msgTotal: 0,
    msgHasMore: false,
  };


const CREW_PAGE = 30;
const CREW_MSG_PAGE = 100;

/** Bot picker for the crew view: the same allowlist the sidebar shows. */
function fillCrewBots() {
  const sel = $("#crew-bot");
  if (!sel) return;
  const names = (state.bots || [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter(Boolean);
  const wanted = crew.bot || state.bot || names[0] || "";
  clear(sel);
  for (const name of names) sel.append(el("option", { value: name, text: name }));
  if (names.includes(wanted)) sel.value = wanted;
  crew.bot = sel.value || wanted;
}

async function loadCrew({ reset = true } = {}) {
  const list = $("#crew-list");
  const range = $("#crew-range");
  const more = $("#btn-crew-more");
  if (!crew.bot) fillCrewBots();
  if (!crew.bot) {
    clear(list).append(el("div", { class: "crew-empty mut", text: "Kein Bot verfügbar." }));
    return;
  }
  if (reset) {
    crew.rows = [];
    crew.total = 0;
    crew.hasMore = false;
    more.classList.add("hidden");
    range.textContent = "";
    clear(list).append(el("div", { class: "crew-empty mut", text: "lade…" }));
  }
  const params = new URLSearchParams({
    bot: crew.bot,
    filter: crew.filter,
    limit: String(CREW_PAGE),
    offset: String(crew.rows.length),
  });
  let data;
  try {
    data = await api(`/api/crew/sessions?${params.toString()}`);
  } catch (err) {
    clear(list).append(el("div", { class: "crew-empty mut", text: `Crew-Runs: ${describeError(err).text}` }));
    return;
  }
  if (reset) clear(list);
  const rows = Array.isArray(data.sessions) ? data.sessions : [];
  crew.rows = crew.rows.concat(rows);
  crew.total = Number(data.total) || crew.rows.length;
  crew.hasMore = Boolean(data.has_more);
  for (const row of rows) list.append(crewCard(el, row, openCrewSession));
  if (!crew.rows.length) list.append(el("div", { class: "crew-empty mut", text: "Keine Sessions für diesen Filter." }));
  range.textContent = rangeLabel({ shown: crew.rows.length, total: crew.total, offset: 0 });
  if (data.truncated) range.textContent += " · Fenster begrenzt";
  more.classList.toggle("hidden", !crew.hasMore);
}

function closeCrewSession() {
  crew.session = null;
  $("#crew-transcript").classList.add("hidden");
  clear($("#crew-messages"));
  clear($("#crew-transcript-title"));
  $("#crew-transcript-meta").textContent = "";
  $("#btn-crew-msgs-more").classList.add("hidden");
}

async function openCrewSession(row) {
  if (!row || !row.id) return;
  crew.session = row;
  crew.msgOffset = 0;
  crew.msgTotal = 0;
  crew.msgHasMore = false;
  crew.sessionMeta = [kindLabel(row.kind), statusLabel(row.status), formatTime(row.started_at), messageCountLabel(row.message_count)]
    .filter(Boolean)
    .join(" · ");

  // Title and meta are text nodes: a session title is untrusted input.
  const title = clear($("#crew-transcript-title"));
  title.append(el("span", { text: String(row.title || row.id) }));
  $("#crew-transcript-meta").textContent = crew.sessionMeta;
  $("#crew-transcript").classList.remove("hidden");
  $("#btn-crew-msgs-more").classList.add("hidden");
  clear($("#crew-messages")).append(el("div", { class: "crew-empty mut", text: "lade…" }));
  $("#crew-transcript").scrollIntoView({ block: "nearest", behavior: "smooth" });
  await loadCrewMessages({ reset: true });
}

async function loadCrewMessages({ reset = false } = {}) {
  const row = crew.session;
  if (!row) return;
  const box = $("#crew-messages");
  const more = $("#btn-crew-msgs-more");
  const meta = $("#crew-transcript-meta");
  if (reset) {
    crew.msgOffset = 0;
    more.classList.add("hidden");
    clear(box).append(el("div", { class: "crew-empty mut", text: "lade…" }));
  }
  const params = new URLSearchParams({ limit: String(CREW_MSG_PAGE), offset: String(crew.msgOffset) });
  const path = `/api/crew/sessions/${encodeURIComponent(crew.bot)}/${encodeURIComponent(row.id)}/messages?${params.toString()}`;
  let data;
  try {
    data = await api(path);
  } catch (err) {
    clear(box).append(el("div", { class: "crew-empty mut", text: `Transkript: ${describeError(err).text}` }));
    return;
  }
  if (reset) clear(box);
  const messages = Array.isArray(data.messages) ? data.messages : [];
  crew.msgOffset += messages.length;
  crew.msgTotal = Number(data.total) || crew.msgOffset;
  crew.msgHasMore = Boolean(data.has_more);
  for (const msg of messages) box.append(crewMessageRow(el, msg));
  if (!crew.msgOffset) box.append(el("div", { class: "crew-empty mut", text: "Keine Nachrichten." }));
  more.classList.toggle("hidden", !crew.msgHasMore);
  meta.textContent = [crew.sessionMeta, rangeLabel({ shown: crew.msgOffset, total: crew.msgTotal, offset: 0 })]
    .filter(Boolean)
    .join(" · ");
}

  /** Every handler is a load or a filter — none of them write. */
  function wire() {
    $("#btn-crew-refresh").onclick = () => loadCrew({ reset: true });
    $("#btn-crew-more").onclick = () => loadCrew({ reset: false });
    $("#btn-crew-msgs-more").onclick = () => loadCrewMessages({ reset: false });
    $("#crew-transcript-close").onclick = closeCrewSession;
    $("#crew-bot").onchange = (e) => {
      crew.bot = e.target.value;
      closeCrewSession();
      loadCrew({ reset: true });
    };
    $("#crew-filters").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-crew-filter]");
      if (!btn) return;
      crew.filter = btn.dataset.crewFilter;
      for (const chip of $("#crew-filters").querySelectorAll(".chip")) {
        const on = chip === btn;
        chip.classList.toggle("active", on);
        chip.setAttribute("aria-pressed", on ? "true" : "false");
      }
      closeCrewSession();
      loadCrew({ reset: true });
    });
  }

  /** Open the tab: fill the bot picker and load the first page. */
  function open() {
    fillCrewBots();
    loadCrew({ reset: true });
  }

  return { open, wire, fillCrewBots, loadCrew, openCrewSession, closeCrewSession, loadCrewMessages };
}
