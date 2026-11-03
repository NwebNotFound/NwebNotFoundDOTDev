// IP-Hashing fuer die Website-Warteschlangen (mc_bids_pending, mc_shop_orders_pending,
// mc_vip_commands). Klartext-IPs werden fuer neue Zeilen nicht mehr gespeichert; es bleibt
// nur ein HMAC-SHA-256-Hex-Digest ueber die IP mit serverseitigem Pepper.
//
// Der Pepper kommt aus dem Worker-Secret IP_HASH_PEPPER (siehe PR-Beschreibung).
// Fehlt das Secret, wird fail-closed null zurueckgegeben: es wird keine IP-Information
// gespeichert (weder Klartext noch Hash), die Anfrage laeuft aber weiter.
const enc = new TextEncoder();

/** Normalisierte Form der IP fuer eine stabile Hash-Eingabe (trim + lowercase). */
export function normalizeIp(ip) {
  return typeof ip === "string" ? ip.trim().toLowerCase() : "";
}

/**
 * HMAC-SHA-256 (WebCrypto) ueber die normalisierte IP, Hex-Digest (64 Zeichen).
 * Gibt null zurueck, wenn kein Pepper gesetzt ist oder die IP leer ist.
 * Es wird nie eine Klartext-IP zurueckgegeben.
 */
export async function hashIp(env, ip) {
  const pepper = env && env.IP_HASH_PEPPER;
  const value = normalizeIp(ip);
  if (!pepper || !value) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(pepper)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
