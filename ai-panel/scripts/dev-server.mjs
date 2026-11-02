// Local dev server: runs the Worker handler under Node with the static assets from public/.
// Useful when wrangler is not installed, and for browser smoke tests.
//
//   node scripts/dev-server.mjs        (reads ../.dev.vars, listens on 8788)

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { handle } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const publicDir = path.join(root, "public");
const PORT = Number(process.env.PORT || 8788);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function loadVars() {
  const out = {};
  try {
    const text = await readFile(path.join(root, ".dev.vars"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .dev.vars: env only
  }
  return out;
}

const fileVars = await loadVars();
const env = {
  DISCORD_CLIENT_ID: "1566865767029284884",
  PANEL_HOST: "localhost:8788",
  PANEL_BOTS: "cloudflare,minecraft,discord,homelab",
  ...fileVars,
  ...process.env,
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      let file = path.join(publicDir, decodeURIComponent(url.pathname));
      if (!file.startsWith(publicDir)) return new Response("forbidden", { status: 403 });
      try {
        if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
        const body = await readFile(file);
        return new Response(body, {
          status: 200,
          headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream" },
        });
      } catch {
        try {
          const body = await readFile(path.join(publicDir, "index.html"));
          return new Response(body, { status: 200, headers: { "content-type": TYPES[".html"] } });
        } catch {
          return new Response("not found", { status: 404 });
        }
      }
    },
  },
};

const server = http.createServer(async (req, res) => {
  // Dev-only login: mints a session for ALLOWED_DISCORD_ID so the UI can be opened without
  // Discord. This route exists only in this script, never in the Worker.
  if (req.url === "/__dev/login") {
    const { createSession, cookie, SESSION_COOKIE, CSRF_COOKIE, randomToken } = await import("../src/auth.js");
    if (!env.SESSION_SECRET || !env.ALLOWED_DISCORD_ID) {
      res.writeHead(500, { "content-type": "text/plain" });
      return res.end("SESSION_SECRET and ALLOWED_DISCORD_ID must be set in .dev.vars");
    }
    const session = await createSession(env, { id: env.ALLOWED_DISCORD_ID, name: "dev" });
    const csrf = randomToken(24);
    res.writeHead(302, {
      location: "/",
      "set-cookie": [cookie(SESSION_COOKIE, session, 3600), cookie(CSRF_COOKIE, csrf, 3600, { httpOnly: false })],
    });
    return res.end();
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const url = `http://${req.headers.host || `localhost:${PORT}`}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const request = new Request(url, { method: req.method, headers, body: req.method === "GET" ? undefined : body });
  try {
    const response = await handle(request, env);
    const out = {};
    response.headers.forEach((v, k) => {
      if (k === "set-cookie") return;
      out[k] = v;
    });
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (cookies.length) out["set-cookie"] = cookies;
    res.writeHead(response.status, out);
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "dev_server_error", detail: String(err.message || err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ai-panel dev server → http://127.0.0.1:${PORT}`);
  console.log(`  HERMES_ORIGIN: ${env.HERMES_ORIGIN || "(unset)"}`);
});
