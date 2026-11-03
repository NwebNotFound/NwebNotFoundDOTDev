// Pure helpers for the chat stream: event naming, the approval body the Worker expects, what a
// tool result says, when a run is over, and how fast to reconnect.
//
// No DOM in here on purpose — app.js imports these and test/run-events.test.mjs exercises them
// directly under node --test. Keeping this logic out of the renderer is what makes the
// approval-takes-three-keys and "false is not an output" rules testable at all.

/** Run states that mean "nothing more will arrive". */
export const TERMINAL_STATES = new Set([
  "completed",
  "finished",
  "success",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "stopped",
  "aborted",
]);

export function eventName(event) {
  return String(event?.event || event?.type || event?.name || "").toLowerCase();
}

/** A run state from any of the shapes the gateway uses. */
export function runStatusOf(event) {
  const raw = event?.status ?? event?.state ?? event?.run?.status ?? "";
  return String(raw || "").toLowerCase();
}

export function isTerminalStatus(status) {
  return TERMINAL_STATES.has(String(status || "").toLowerCase());
}

export function isTerminalEvent(event) {
  const name = eventName(event);
  if (name === "run.completed" || name === "run.finished" || name === "run.failed" || name === "run.error") return true;
  if (name === "run.cancelled" || name === "run.canceled" || name === "run.stopped") return true;
  if (name === "run.status" || name === "run.updated") return isTerminalStatus(runStatusOf(event));
  return isTerminalStatus(runStatusOf(event));
}

/**
 * The approval request body. The gateway's session authority takes exactly
 * {request_id, execution_generation (int), choice} — a missing or extra field makes the
 * approval a no-op or a 400, which is why the panel sent a choice that "did nothing" before.
 */
export function approvalPayload(event, choice) {
  const pending = event?.pending && typeof event.pending === "object" ? event.pending : {};
  const requestId = String(event?.request_id || event?.prompt_id || pending.request_id || "");
  const rawGeneration = event?.execution_generation ?? event?.generation ?? pending.execution_generation;
  const generation = Number(rawGeneration);
  if (!requestId) return { ok: false, error: "approval_context_missing", body: null };
  if (!Number.isInteger(generation) || generation < 0) return { ok: false, error: "approval_context_missing", body: null };
  return { ok: true, body: { request_id: requestId, execution_generation: generation, choice: String(choice) } };
}

/** The command/description an approval card should show. */
export function approvalText(event) {
  const value = event?.command ?? event?.description ?? event?.message ?? event?.prompt ?? event?.pending?.command;
  if (value === undefined || value === null || value === "") return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function asText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length ? JSON.stringify(value, null, 2) : "";
  if (value && typeof value === "object") return Object.keys(value).length ? JSON.stringify(value, null, 2) : "";
  return "";
}

/**
 * What a `tool.completed` event actually returned. The old code printed `event.error`, which is
 * a boolean on success — that is where the literal "false" under every terminal call came from.
 * Only real payloads are returned here; a boolean never is.
 */
export function toolOutputText(event) {
  for (const key of ["output", "result", "stdout", "preview", "content", "text"]) {
    const text = asText(event?.[key]);
    if (text && text.trim()) return text;
  }
  const error = event?.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") return asText(error.message ?? error.detail) || asText(error);
  return "";
}

/** Did the tool fail? `error: false` (the normal success shape) is not a failure. */
export function toolFailed(event) {
  const name = eventName(event);
  if (name === "tool.failed" || name === "tool.error" || name === "tool.cancelled") return true;
  const error = event?.error;
  if (error === true) return true;
  if (typeof error === "string" && error.trim() !== "") return true;
  if (error && typeof error === "object" && Object.keys(error).length > 0) return true;
  if (event?.ok === false || event?.success === false) return true;
  return false;
}

/** Exponential backoff for a dropped stream: 0.5 s → 8 s, with a little jitter. */
export function reconnectDelay(attempt, { base = 500, max = 8000 } = {}) {
  const step = Math.min(max, base * 2 ** Math.max(0, Math.floor(attempt)));
  return step + Math.floor(Math.random() * 250);
}

/** Human-readable text for the error codes the Worker/API return. */
const ERROR_TEXT = {
  unauthorized: "Sitzung abgelaufen — bitte neu anmelden.",
  csrf_failed: "Sicherheits-Token abgelaufen — Seite neu laden.",
  rate_limited: "Zu viele Anfragen — kurz warten.",
  unknown_bot: "Diesen Bot gibt es nicht (mehr).",
  upstream_unreachable: "Hermes ist nicht erreichbar (Tunnel oder Gateway aus).",
  upstream_not_configured: "Das Panel hat keine Hermes-Adresse konfiguriert.",
  upstream_error: "Hermes hat die Anfrage abgelehnt.",
  upstream_auth_failed: "Der Gateway-Key passt nicht zu diesem Bot.",
  run_start_failed: "Der Run konnte nicht gestartet werden.",
  run_unavailable: "Den Run kennt das Gateway nicht mehr.",
  approval_context_missing: "Freigabe-Kontext fehlt — Run-Status neu laden und erneut bestätigen.",
  approval_failed: "Die Freigabe wurde nicht angenommen.",
  steer_failed: "Steuern fehlgeschlagen.",
  stop_failed: "Stoppen fehlgeschlagen.",
  profiles_unavailable: "Profil-Liste nicht erreichbar.",
  bot_unavailable: "Bot-Profil nicht erreichbar.",
  internal_error: "Interner Fehler im Panel.",
  invalid_json: "Ungültige Anfrage.",
  "Load failed": "Verbindung verloren — Tunnel oder Proxy antwortet nicht.",
  "Failed to fetch": "Verbindung verloren — Tunnel oder Proxy antwortet nicht.",
};

/**
 * Map an error (thrown by api() or a fetch) to something Nils can act on, plus a hint whether
 * a retry makes sense.
 */
export function describeError(err) {
  const code = String((err && (err.data?.error || err.message)) || "").trim();
  const retryable = !["unauthorized", "csrf_failed", "unknown_bot", "invalid_json"].includes(code);
  const text =
    (err && err.data && err.data.message) ||
    ERROR_TEXT[code] ||
    (code ? `Fehler: ${code}` : "Unbekannter Fehler.");
  return { code, text, retryable };
}
