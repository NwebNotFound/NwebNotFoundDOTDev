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
