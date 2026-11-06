// Turnstile-Prüfung an einer Stelle: success UND hostname müssen passen (ein Token von einer fremden
// Seite mit unserem Sitekey zählt nicht). Cloudflares öffentlicher Test-Secret liefert immer
// hostname "example.com" – das gilt nur zusammen mit genau diesem Secret (lokale Tests).
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export async function verifyTurnstile(env, token, { ip = "", hosts = [] } = {}) {
  if (!env?.TURNSTILE_SECRET || !token) return false;
  const fd = new FormData(); fd.append("secret", env.TURNSTILE_SECRET); fd.append("response", String(token)); if (ip) fd.append("remoteip", ip);
  let v = {}; try { v = await (await fetch(SITEVERIFY_URL, { method: "POST", body: fd })).json(); } catch { return false; }
  const hostOk = hosts.includes(v?.hostname) || (env.TURNSTILE_SECRET === TURNSTILE_TEST_SECRET && v?.hostname === "example.com");
  return v?.success === true && hostOk;
}
