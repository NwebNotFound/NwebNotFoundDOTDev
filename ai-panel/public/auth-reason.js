// Why the Worker sent the browser back to /auth/denied.
//
// The URL is attacker-controlled (`?reason=<anything>`), so the sentence shown to the user
// never comes from it: this module maps a closed list of codes — the ones `fail()` in
// src/index.js actually redirects with — onto German text, and every other value (unknown
// code, free text, missing parameter) collapses into one generic message. Keep the list in
// sync with the `fail("…")` call sites in src/index.js.

export const DENIED_MESSAGES = Object.freeze({
  bad_state: "Die Anmeldung ist abgelaufen. Bitte noch einmal mit Discord anmelden.",
  missing_code: "Discord hat keine Anmeldung zurückgegeben. Bitte noch einmal versuchen.",
  token_exchange: "Discord hat die Anmeldung nicht bestätigt. Bitte noch einmal versuchen.",
  user_fetch: "Das Discord-Profil ließ sich nicht laden. Bitte noch einmal versuchen.",
  not_allowed: "Dieses Discord-Konto ist für das Panel nicht freigegeben.",
});

// One sentence for everything that is not a known code — including a hand-edited URL.
export const DENIED_FALLBACK =
  "Die Anmeldung ist fehlgeschlagen. Bitte noch einmal mit Discord anmelden.";

/**
 * The notice for the `reason` query parameter of /auth/denied.
 * Returns "" when nothing should be shown (no parameter at all).
 * Unknown or non-string values return DENIED_FALLBACK, never the input itself.
 */
export function deniedNotice(raw) {
  if (raw === null || raw === undefined) return "";
  // Only a string can name a code; anything else is an unknown value, not a lookup key.
  if (typeof raw !== "string") return DENIED_FALLBACK;
  const code = raw.trim();
  if (!code) return "";
  // hasOwn, not `in`: a reason like "constructor" or "__proto__" must not reach Object.prototype.
  return Object.hasOwn(DENIED_MESSAGES, code) ? DENIED_MESSAGES[code] : DENIED_FALLBACK;
}
