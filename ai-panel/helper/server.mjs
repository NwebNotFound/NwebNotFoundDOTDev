#!/usr/bin/env node
// Lokaler Helfer für Hermes-Profile. Bindet ausschließlich 127.0.0.1.
// Aufrufe sind argv-Listen, nie eine Shell.
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { cleanSoul, isBotName } from "../src/names.js";

export const LIST_ARGV = ["hermes", "profile", "list"];
export const RESTART_ARGV = ["hermes", "gateway", "restart"];

export function profileArgv(name) {
  if (!isBotName(name)) return null;
  return ["hermes", "profile", "create", name, "--clone"];
}

export function run(argv) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", () => resolve({ code: 127, stdout, stderr }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function safeEq(a, b) {
  const aa = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  const n = Math.max(aa.length, bb.length);
  let r = aa.length ^ bb.length;
  for (let i = 0; i < n; i++) r |= (aa[i] || 0) ^ (bb[i] || 0);
  return r === 0;
}

function inside(dir, name, file) {
  const root = path.resolve(dir);
  const dest = path.resolve(root, name, file);
  if (dest !== path.join(root, name, file)) return null;
  return dest;
}

function writeFile(dest, text, mode) {
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.writeFileSync(dest, text, { mode });
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handle(req, ctx) {
  const auth = req.headers.get("authorization") || "";
  if (!ctx.key || !safeEq(auth, `Bearer ${ctx.key}`)) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/$/, "") || "/";
  if (req.method === "GET" && p === "/profiles") {
    const out = await ctx.run(LIST_ARGV);
    if (out.code !== 0) return json({ error: "profile list fehlgeschlagen" }, 502);
    const profiles = [...new Set(String(out.stdout || "").split(/[^a-z0-9-]+/).filter(isBotName))];
    return json({ profiles });
  }
  if (req.method === "POST" && p === "/profiles") {
    let body; try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const argv = profileArgv(body?.name);
    if (!argv) return json({ error: "Name ungültig" }, 400);
    const created = await ctx.run(argv);
    if (created.code !== 0) return json({ error: "profile create fehlgeschlagen" }, 502);
    const soul = cleanSoul(body?.soul) || `Du bist Nils' Assistent für ${body.name}. Riskante Aktionen wartest du ab, bis sie im Panel bestätigt werden. Du rufst keine teuren Modelle auf.`;
    const soulPath = inside(ctx.dir, body.name, "SOUL.md");
    const keyPath = inside(ctx.dir, body.name, "api_key");
    if (!soulPath || !keyPath) return json({ error: "Name ungültig" }, 400);
    writeFile(soulPath, soul + "\n", 0o600);
    const key = ctx.keygen();
    writeFile(keyPath, key + "\n", 0o600);
    const restarted = await ctx.run(RESTART_ARGV);
    if (restarted.code !== 0) return json({ error: "gateway restart fehlgeschlagen" }, 502);
    return json({ ok: true, name: body.name, key });
  }
  return json({ error: "not found" }, 404);
}

export function start({ port = 8765, key, dir, run: runFn, keygen } = {}) {
  const ctx = {
    key,
    dir: dir || path.join(os.homedir(), ".hermes", "profiles"),
    run: runFn || run,
    keygen: keygen || (() => crypto.randomBytes(32).toString("hex")),
  };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body });
    const out = await handle(request, ctx);
    res.writeHead(out.status, { "content-type": out.headers.get("content-type") || "application/json", "cache-control": "no-store" });
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  server.listen(port, "127.0.0.1");
  return server;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  if (!process.env.HELPER_KEY) { console.error("HELPER_KEY fehlt"); process.exit(1); }
  const port = Number(process.env.PORT || 8765);
  const server = start({ port, key: process.env.HELPER_KEY, dir: process.env.HERMES_HOME ? path.join(process.env.HERMES_HOME, "profiles") : undefined });
  server.on("listening", () => {
    const a = server.address();
    console.log(`helper auf ${a.address}:${a.port}`);
  });
}
