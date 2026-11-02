// Server-side secret redaction for anything the panel forwards to a browser.
//
// Pure module: no node: imports, no fetch, no globals beyond RegExp/String, so the Worker,
// the origin proxy and the tests all share one implementation. That is deliberate — a second
// copy of these rules is how one surface starts leaking what the other redacts.
//
// It runs on *text that came from Hermes* (session titles, message bodies, tool output, error
// strings). It is not a substitute for never putting a key in a response: it is the second
// line of defence for text the panel does not author itself.

export const MASK = "[redacted]";

// Order matters: the specific shapes go first so the generic base64 pass cannot chew a JWT
// into something a later rule would half-match.
const RULES = [
  // Private keys, whole blocks.
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, `${MASK} key`],

  // Authorization header values: "Bearer abc…", "Basic …", "Token …".
  [/\b(Bearer|Basic|Token|Bot)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MASK}`],

  // JWTs (header.payload.signature, all base64url).
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, MASK],

  // Vendor key prefixes: OpenAI/OpenRouter sk-/rk-, GitHub, Slack, AWS, GitLab, npm, Stripe.
  [/\b(?:sk|rk)-[A-Za-z0-9_-]{12,}\b/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{16,}\b/g, MASK],
  [/\bnpm_[A-Za-z0-9]{30,}\b/g, MASK],
  [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, MASK],

  // .env style assignments whose name says it is a credential: KEY=…, API_TOKEN=…,
  // DB_PASSWORD=…, CLIENT_SECRET=… Only the value is replaced, so the line stays readable.
  [
    /^([ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASS|PWD|CREDENTIAL|DSN|AUTH|SESSION)[A-Z0-9_]*[ \t]*[=:][ \t]*).*$/gim,
    `$1${MASK}`,
  ],

  // A connection string carrying credentials: scheme://user:pass@host
  [/\b([a-z][a-z0-9+.-]{1,15}:\/\/)[^\s/:@]+:[^\s/@]+@/gi, `$1${MASK}@`],
];

/**
 * Redact one string. Cheap enough for a page of transcript: every rule is a single linear pass,
 * and the base64 pass only inspects runs that are already 32+ characters long.
 */
export function redactText(value) {
  if (typeof value !== "string" || !value) return value;
  let out = value;
  for (const [re, replacement] of RULES) out = out.replace(re, replacement);
  return redactLongTokens(out);
}

/**
 * Long opaque tokens: 32+ chars of a base64-ish alphabet that mixes upper, lower and digits.
 * Reported separately from RULES because it needs the character-class check, not just a regex:
 * a 40-char lowercase word or a path segment should survive.
 */
function redactLongTokens(text) {
  return text.replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9])/g, (run) => {
    const mixed = /[a-z]/.test(run) && /[A-Z]/.test(run) && /[0-9]/.test(run);
    const hex = /^[0-9a-fA-F]{32,}$/.test(run);
    return mixed || hex ? MASK : run;
  });
}

/** Depth-limited deep redaction for parsed JSON. Arrays and plain objects only. */
export function redactValue(value, depth = 0) {
  if (depth > 8) return null;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactValue(v, depth + 1);
    return out;
  }
  return value;
}

/** Clamp a query parameter to an integer inside [min, max], falling back to `dflt`. */
export function clampInt(raw, { min = 0, max = 200, dflt = 50 } = {}) {
  // An absent or empty parameter means "use the default": Number("") is 0, which would
  // otherwise silently become min and page 0 rows.
  if (raw === null || raw === undefined || String(raw).trim() === "") return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n)) return dflt;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/**
 * Which kind of session a row is, from its id. `run_*` are runs started through the gateway API
 * (the panel's own chat, cron jobs), `local-*` are CLI sessions picked up from the host. Anything
 * else is `other` and is shown, but under neither filter.
 */
export function sessionKind(id) {
  const value = String(id || "");
  if (value.startsWith("run_")) return "run";
  if (value.startsWith("local-")) return "cli";
  return "other";
}
