// IP-Hashing fuer die Website-Warteschlangen (mc_bids_pending, mc_shop_orders_pending,
// mc_vip_commands). Klartext-IPs werden fuer neue Zeilen nicht mehr gespeichert; es bleibt
// nur ein HMAC-SHA-256-Hex-Digest ueber die IP mit serverseitigem Pepper.
//
// Der Pepper kommt aus dem Worker-Secret IP_HASH_PEPPER (siehe PR-Beschreibung).
// Fehlt das Secret, waeren die Pro-IP-Limits still abgeschaltet (ip_hash = NULL trifft nie).
// Deshalb: Ersatz-Pepper, abgeleitet aus SESSION_SECRET (HMAC mit eigenem Zweck-Label, also nie
// der Session-Schluessel selbst), plus lauter Log-Eintrag. Fehlen beide Secrets, wird weiterhin
// fail-closed null zurueckgegeben (keine IP-Information, weder Klartext noch Hash) und geloggt.
let warned = false;
const warnOnce = (msg) => { if (!warned) { warned = true; console.error(msg); } };
async function hmacHex(keyStr, value) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(keyStr)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function pepperOf(env) {
  if (env && env.IP_HASH_PEPPER) return env.IP_HASH_PEPPER;
  if (env && env.SESSION_SECRET) {
    warnOnce("SECURITY: IP_HASH_PEPPER is not set – using a pepper derived from SESSION_SECRET. Set it with `wrangler secret put IP_HASH_PEPPER`.");
    return "derived:" + (await hmacHex(env.SESSION_SECRET, "nnf-ip-hash-pepper-v1"));
  }
  warnOnce("SECURITY: IP_HASH_PEPPER and SESSION_SECRET are not set – per-IP rate limits are DISABLED.");
  return null;
}
const enc = new TextEncoder();

/** Normalisierte Form der IP fuer eine stabile Hash-Eingabe (trim + lowercase). */
export function normalizeIp(ip) {
  return typeof ip === "string" ? ip.trim().toLowerCase() : "";
}

/**
 * HMAC-SHA-256 (WebCrypto) ueber die normalisierte IP, Hex-Digest (64 Zeichen).
 * Gibt null zurueck, wenn weder IP_HASH_PEPPER noch SESSION_SECRET gesetzt ist oder die IP leer ist.
 * Es wird nie eine Klartext-IP zurueckgegeben.
 */
export async function hashIp(env, ip) {
  const value = normalizeIp(ip);
  if (!value) return null;
  const pepper = await pepperOf(env);
  if (!pepper) return null;
  return hmacHex(pepper, value);
}
