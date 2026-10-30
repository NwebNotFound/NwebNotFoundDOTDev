// Sicherheits-Helfer: Turnstile-Siteverify mit Hostname-Prüfung, gesalzene IP-Hashes, Security-Header.
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// Cloudflares öffentlicher Test-Secret (immer success, hostname "example.com") – nur für lokale Tests
const TEST_SECRET = "1x0000000000000000000000000000000AA";

// Prüft ein Turnstile-Token serverseitig. ok nur bei success === true UND erwartetem Hostname.
// hosts: erlaubte Hostnames (z. B. [MAIN, MCD]); "example.com" nur mit dem öffentlichen Test-Secret (wie im Feedback).
export async function verifyTurnstile(env, req, token, hosts, fetchImpl = fetch) {
  if (!env.TURNSTILE_SECRET) return { ok: false, reason: "not-configured" };
  token = String(token ?? "");
  if (!token || token.length > 2048) return { ok: false, reason: "missing-token" };
  const fd = new FormData(); fd.append("secret", env.TURNSTILE_SECRET); fd.append("response", token);
  const ip = req.headers.get("CF-Connecting-IP"); if (ip) fd.append("remoteip", ip);
  let v; try { const r = await fetchImpl(SITEVERIFY, { method: "POST", body: fd }); v = await r.json(); } catch { return { ok: false, reason: "verify-error" }; }
  if (!v || v.success !== true) return { ok: false, reason: "not-success" };
  const allowed = new Set(hosts.map((h) => String(h).toLowerCase()));
  if (env.TURNSTILE_SECRET === TEST_SECRET) allowed.add("example.com");
  if (!allowed.has(String(v.hostname || "").toLowerCase())) return { ok: false, reason: "hostname-mismatch" };
  return { ok: true };
}

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
// SHA-256(Salt des Tages | IP). Salt = geheimes Material (IP_HASH_SALT, sonst SESSION_SECRET) + Datum (UTC).
// Klartext-IPs werden nie gespeichert; ohne Geheimnis kein Hash (dann wird nur pro Discord-ID limitiert).
export async function ipHash(env, ip, day = utcDay()) {
  const secret = env.IP_HASH_SALT || env.SESSION_SECRET;
  if (!ip || !secret) return null;
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}|${day}|${ip}`)));
}
// Hash von heute + gestern (für 24h-Fenster über den Tageswechsel).
export async function ipHashes(env, ip, t = Date.now()) {
  const a = await ipHash(env, ip, utcDay(t)), b = await ipHash(env, ip, utcDay(t - 86400000));
  return a ? [a, b] : [];
}

// CSP zunächst nur Report-Only. Erlaubt: eigene Assets, Inline-Skripte/-Styles (werden aktuell genutzt),
// Turnstile, Discord-Avatare, Minecraft-Köpfe/Texturen, Cross-Origin-API zwischen Haupt- und MC-Domain.
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://mc-heads.net https://cdn.jsdelivr.net",
  "font-src 'self' data:",
  "connect-src 'self' https://nwebnotfound.dev https://mc.nwebnotfound.dev https://mc-heads.net https://cdn.jsdelivr.net https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://discord.com",
  "frame-ancestors 'none'",
].join("; ");
export const SEC_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
};
// Setzt Security-Header auf HTML-Antworten, ohne vorhandene Werte zu überschreiben.
export function withSecurityHeaders(res) {
  const ct = res.headers.get("content-type") || "";
  if (!/^text\/html/i.test(ct)) return res;
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SEC_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
  if (!r.headers.has("content-security-policy-report-only") && !r.headers.has("content-security-policy")) r.headers.set("content-security-policy-report-only", CSP_REPORT_ONLY);
  return r;
}
