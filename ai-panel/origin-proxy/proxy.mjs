// Loopback origin proxy for the AI panel.
//
//   browser → Worker (ai.nwebnotfound.dev) → Cloudflare Tunnel → this proxy → Hermes
//
// It exists so the tunnel hostname is useless without the shared secret, and so the gateway key
// never leaves the host. Binds 127.0.0.1 only. No dependencies.
//
//   node proxy.mjs            (reads ./.env when present)

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

function secretOk(header) {
  if (typeof header !== "string" || !header) return false;
  const given = Buffer.from(header);
  if (given.length !== secretBuf.length) return false;
  return timingSafeEqual(given, secretBuf);
}

function upstreamFor(pathname) {
  if (pathname.startsWith("/gw/")) return { base: GATEWAY, path: pathname.slice(3) };
  if (pathname.startsWith("/dash/")) return { base: DASHBOARD, path: pathname.slice(5) };
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

  const base = new URL(target.base);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP.has(k) || k === "x-hermes-panel-secret" || k === "host") continue;
    headers[k] = v;
  }
  headers.host = base.host;
  if (!headers.authorization && API_SERVER_KEY && base.origin === new URL(GATEWAY).origin) {
    headers.authorization = `Bearer ${API_SERVER_KEY}`;
  }

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
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream unreachable", detail: String(err.message || err) }));
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
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
