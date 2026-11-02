// Loopback origin proxy for the AI panel.
//
//   browser → Worker (ai.nwebnotfound.dev) → Cloudflare Tunnel → this proxy → Hermes
//
// It exists so the tunnel hostname is useless without the shared secret, and so no Hermes
// credential ever leaves the host. Binds 127.0.0.1 only. No dependencies.
//
//   node proxy.mjs            (reads ./.env when present)
//
// Credentials it injects (all from .env, never from the request):
//   /dash/*            → X-Hermes-Session-Token: $HERMES_DASHBOARD_SESSION_TOKEN
//   /gw/p/<bot>/…      → Authorization: Bearer ***   (API_SERVER_KEY from profiles/<bot>/.env)
//   /gw/… (no profile) → Authorization: Bearer ***   (API_SERVER_KEY of this .env)
//
// Gateway keys are read from the Hermes profile directories on each lookup (cached ~30 s), so a
// key rotated in a profile is picked up without restarting this process. HERMES_KEY_<BOT> is an
// optional override.
//
// A /gw/p/<bot>/ request for a bot without a configured key is refused with 404, so a typo
// in the profile name cannot silently fall back to another bot's credential.

import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  try {
    const text = readFileSync(path.join(here, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch {
    // no .env: rely on the real environment
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 8650);
const HOST = process.env.HOST || "127.0.0.1";
const GATEWAY = process.env.GATEWAY || "http://127.0.0.1:8642";
const DASHBOARD = process.env.DASHBOARD || "http://127.0.0.1:9119";
const PANEL_SECRET = process.env.PANEL_SECRET || "";
const API_SERVER_KEY = process.env.API_SERVER_KEY || "";
const DASHBOARD_TOKEN = process.env.HERMES_DASHBOARD_SESSION_TOKEN || process.env.DASHBOARD_TOKEN || "";

if (!PANEL_SECRET || PANEL_SECRET.length < 16) {
  console.error("refusing to start: PANEL_SECRET missing or shorter than 16 chars");
  process.exit(1);
}
if (!HOST.startsWith("127.") && HOST !== "::1" && HOST !== "localhost") {
  console.error(`refusing to start: HOST must be loopback, got ${HOST}`);
  process.exit(1);
}

const secretBuf = Buffer.from(PANEL_SECRET);
const HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
// Headers a client must never be able to set: they are credentials, and this proxy decides them.
const CREDENTIAL_HEADERS = new Set(["authorization", "x-hermes-session-token", "x-hermes-panel-secret", "cookie"]);

/** `cloudflare` → `HERMES_KEY_CLOUDFLARE`, `my-bot` → `HERMES_KEY_MY_BOT`. */
export function keyNameFor(bot) {
  return `HERMES_KEY_${bot.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

// Profile names the Worker and the gateway both accept; anything else is not a bot.
const BOT_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const KEY_TTL_MS = 30_000;

/** The Hermes data directory: %LOCALAPPDATA%\hermes unless HERMES_HOME says otherwise. */
function hermesHome() {
  if (process.env.HERMES_HOME) return path.resolve(process.env.HERMES_HOME);
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(local, "hermes");
}

/**
 * The .env holding this profile's API_SERVER_KEY. The default profile keeps it in the Hermes
 * home, every other profile in profiles/<bot>/.env. The resolved file must stay inside the
 * profiles directory — a bot name that escapes it gets no key at all.
 */
function envFileFor(bot) {
  const home = hermesHome();
  if (bot === "default") return path.join(home, ".env");
  const profilesDir = path.resolve(home, "profiles");
  const file = path.resolve(profilesDir, bot, ".env");
  if (!file.startsWith(profilesDir + path.sep)) return "";
  return file;
}

/** API_SERVER_KEY from an env file, or "". Tolerates quotes, `export ` and trailing comments. */
function readApiServerKey(file) {
  if (!file) return "";
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return "";
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?API_SERVER_KEY\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[1].trim();
    const quoted = value.match(/^(["'])(.*?)\1/);
    if (quoted) value = quoted[2].trim();
    else value = value.replace(/\s+#.*$/, "").trim();
    return value;
  }
  return "";
}

/** Read the key for one bot from disk. Never logs the value. */
function resolveGatewayKey(bot) {
  const override = process.env[keyNameFor(bot)];
  if (override) return override; // explicit env override wins
  const fromFile = readApiServerKey(envFileFor(bot));
  if (fromFile) return fromFile;
  if (bot === "default") return process.env.API_SERVER_KEY || "";
  return process.env[`API_SERVER_KEY_${bot.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`] || "";
}

// bot → { key, at }; misses are cached too, so a missing profile cannot cause a read per request.
const keyCache = new Map();

/**
 * The gateway key for a profile, or "" when none is configured. Resolved from the Hermes
 * profile .env on disk (cached ~30 s), so a key rotated in one profile needs no restart.
 */
export function gatewayKeyFor(bot) {
  if (typeof bot !== "string" || !BOT_NAME.test(bot)) return "";
  const now = Date.now();
  const hit = keyCache.get(bot);
  if (hit && now - hit.at < KEY_TTL_MS) return hit.key;
  const key = resolveGatewayKey(bot);
  keyCache.set(bot, { key, at: now });
  return key;
}

/** Profile directories under the Hermes home (names only, never contents). */
function discoverBots() {
  const bots = ["default"];
  try {
    for (const entry of readdirSync(path.join(hermesHome(), "profiles"), { withFileTypes: true })) {
      if (!entry.isDirectory() || !BOT_NAME.test(entry.name)) continue;
      bots.push(entry.name);
    }
  } catch {
    // no profiles directory: default only
    return bots;
  }
  return bots;
}

function secretOk(header) {
  if (typeof header !== "string" || !header) return false;
  const given = Buffer.from(header);
  if (given.length !== secretBuf.length) return false;
  return timingSafeEqual(given, secretBuf);
}

const PROFILE = /^\/p\/([a-z0-9][a-z0-9_-]{0,31})(?=\/|$)/;

function upstreamFor(pathname) {
  if (pathname.startsWith("/gw/")) {
    const rest = pathname.slice(3);
    const m = rest.match(PROFILE);
    return { kind: "gw", base: GATEWAY, path: rest, bot: m ? m[1] : null };
  }
  if (pathname.startsWith("/dash/")) return { kind: "dash", base: DASHBOARD, path: pathname.slice(5), bot: null };
  return null;
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (!secretOk(req.headers["x-hermes-panel-secret"])) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "panel secret missing or wrong" }));
    console.warn(`${req.method} ${url.pathname} 401 (secret)`);
    return;
  }

  const target = upstreamFor(url.pathname);
  if (!target) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown route, use /gw/* or /dash/*" }));
    return;
  }

  // Pick the credential for this exact destination. A profile route without its own key is a
  // hard 404: falling back to another bot's key would authenticate as the wrong bot.
  let bearer = "";
  if (target.kind === "gw") {
    if (target.bot) {
      bearer = gatewayKeyFor(target.bot);
      if (!bearer) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unknown_bot" }));
        console.warn(`${req.method} ${url.pathname} 404 (no key for profile ${target.bot})`);
        return;
      }
    } else if (target.path.startsWith("/p/")) {
      // A profile-shaped path whose name is not a valid bot must not fall back to the default key.
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unknown_bot" }));
      console.warn(`${req.method} ${url.pathname} 404 (invalid profile name)`);
      return;
    } else {
      bearer = API_SERVER_KEY;
    }
  }

  const base = new URL(target.base);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP.has(k) || CREDENTIAL_HEADERS.has(k) || k === "host") continue;
    headers[k] = v;
  }
  headers.host = base.host;

  if (target.kind === "gw" && bearer) headers.authorization = `Bearer ${bearer}`;
  if (target.kind === "dash" && DASHBOARD_TOKEN) headers["x-hermes-session-token"] = DASHBOARD_TOKEN;

  const upstream = http.request(
    {
      hostname: base.hostname,
      port: base.port,
      path: target.path + url.search,
      method: req.method,
      headers,
    },
    (up) => {
      const out = {};
      for (const [k, v] of Object.entries(up.headers)) {
        if (HOP.has(k)) continue;
        out[k] = v;
      }
      out["x-accel-buffering"] = "no";
      res.writeHead(up.statusCode || 502, out);
      up.pipe(res);
      up.on("end", () => {
        console.log(`${req.method} ${url.pathname} ${up.statusCode} ${Date.now() - started}ms`);
      });
    },
  );

  upstream.on("error", (err) => {
    // The browser gets a generic reason; the detail stays in the host log.
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream_unreachable" }));
    } else {
      res.end();
    }
    console.warn(`${req.method} ${url.pathname} 502 ${err.message}`);
  });

  req.pipe(upstream);
});

server.listen(PORT, HOST, () => {
  console.log(`ai-panel origin proxy on http://${HOST}:${PORT}`);
  console.log(`  /gw/*   → ${GATEWAY}`);
  console.log(`  /dash/* → ${DASHBOARD}`);
  console.log(`  shared secret: configured (${PANEL_SECRET.length} chars)`);
  console.log(`  dashboard session token: ${DASHBOARD_TOKEN ? "configured" : "MISSING (set HERMES_DASHBOARD_SESSION_TOKEN)"}`);
  console.log(`  hermes home: ${hermesHome()}`);
  // Names only: which profiles exist, never whether their key is set or what it looks like.
  console.log(`  gateway keys resolved from profile .env: ${discoverBots().join(", ")}`);
  const overrides = Object.keys(process.env)
    .filter((k) => /^HERMES_KEY_[A-Z0-9_]+$/.test(k))
    .map((k) => k.slice("HERMES_KEY_".length).toLowerCase());
  console.log(`  env overrides: ${overrides.length ? overrides.join(", ") : "none"}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
