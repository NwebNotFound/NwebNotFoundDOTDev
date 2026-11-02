// Discord OAuth2, signed session cookie and CSRF helpers.
// No dependencies: WebCrypto only, so this module also runs under `node --test`.

export const SESSION_COOKIE = "nnf_ai";
export const CSRF_COOKIE = "nnf_ai_csrf";
export const STATE_COOKIE = "nnf_ai_state";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const STATE_SECONDS = 10 * 60;

const enc = new TextEncoder();

export function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const raw = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Constant-time string compare (length differences still walk the full loop). */
export function safeEq(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function key(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmacB64(secret, data) {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/** `b64url(json).b64url(hmac)` — the session and OAuth-state token format. */
export async function sign(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmacB64(secret, body)}`;
}

/** Returns the payload, or null for a missing/tampered/expired token. */
export async function verify(secret, token, now = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  const mac = token.slice(i + 1);
  if (!safeEq(mac, await hmacB64(secret, body))) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.exp === "number" && payload.exp <= now) return null;
  return payload;
}

export function parseCookies(req) {
  const raw = req.headers.get("cookie") || "";
  const out = {};
  for (const part of raw.split(/;\s*/)) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    try {
      out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
    } catch {
      out[part.slice(0, eq)] = part.slice(eq + 1);
    }
  }
  return out;
}

export function cookie(name, value, maxAge, { httpOnly = true } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, "Path=/", `Max-Age=${maxAge}`, "Secure", "SameSite=Lax"];
  if (httpOnly) bits.push("HttpOnly");
  return bits.join("; ");
}

export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax; HttpOnly`;
}

/** The signed-in user, or null. Never throws on a malformed cookie.
 *
 * `revokedBefore` (epoch seconds, from the store) kills every session issued at or before it —
 * that is what /api/logout-all bumps. `env.SESSION_VERSION` is the manual hard reset: change
 * the var and every existing cookie stops validating.
 */
export async function currentUser(env, req, { revokedBefore = 0 } = {}) {
  if (!env.SESSION_SECRET) return null;
  const token = parseCookies(req)[SESSION_COOKIE];
  const payload = await verify(env.SESSION_SECRET, token);
  if (!payload || !payload.u) return null;
  if (!safeEq(payload.u, env.ALLOWED_DISCORD_ID || "")) return null; // belt and braces
  if (String(payload.v ?? "") !== sessionVersion(env)) return null; // revoked by version bump
  if (Number(payload.iat || 0) <= Number(revokedBefore || 0)) return null; // revoked by logout-all
  return { id: String(payload.u), name: String(payload.n || ""), avatar: payload.a || null, exp: payload.exp };
}

export function sessionVersion(env) {
  return String(env.SESSION_VERSION || "1");
}

export async function createSession(env, user) {
  const now = Math.floor(Date.now() / 1000);
  return sign(env.SESSION_SECRET, {
    u: user.id,
    n: user.name,
    a: user.avatar || null,
    v: sessionVersion(env),
    iat: now,
    exp: now + SESSION_SECONDS,
  });
}

export function authorizeUrl(env, state) {
  const q = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: callbackUrl(env),
    scope: "identify",
    state,
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

export function callbackUrl(env) {
  const host = env.PANEL_HOST || "ai.nwebnotfound.dev";
  return `https://${host}/auth/callback`;
}

export async function exchangeCode(env, code) {
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(env),
    }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body && body.access_token ? body : null;
}

export async function fetchDiscordUser(accessToken) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  if (!u || !u.id) return null;
  return { id: String(u.id), name: u.global_name || u.username || "user", avatar: u.avatar || null };
}

/** Double-submit CSRF + Origin check for every mutating request. */
export function csrfOk(req, url) {
  const cookies = parseCookies(req);
  const cookieToken = cookies[CSRF_COOKIE] || "";
  const headerToken = req.headers.get("x-csrf-token") || "";
  if (!cookieToken || !safeEq(cookieToken, headerToken)) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
