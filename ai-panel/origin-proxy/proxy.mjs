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
//   /gw/p/<bot>/…      → Authorization: Bearer $HERMES_KEY_<BOT>
//   /gw/… (no profile) → Authorization: Bearer $API_SERVER_KEY
//
// A /gw/p/<bot>/ request for a bot without a configured key is refused with 404, so a typo
// in the profile name cannot silently fall back to another bot's credential.

import http from "node:http";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
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

/** The gateway key for a profile, or "" when none is configured. */
function gatewayKeyFor(bot) {
  return process.env[keyNameFor(bot)] || process.env[`API_SERVER_KEY_${bot.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`] || "";
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
  const bots = Object.keys(process.env)
    .filter((k) => /^HERMES_KEY_[A-Z0-9_]+$/.test(k))
    .map((k) => k.slice("HERMES_KEY_".length).toLowerCase());
  console.log(`  per-bot gateway keys: ${bots.length ? bots.join(", ") : "none (set HERMES_KEY_<BOT>)"}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
