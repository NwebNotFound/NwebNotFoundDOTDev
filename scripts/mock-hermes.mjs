// Mock Hermes backend for the design-review screenshots (scripts/screenshots.mjs).
//
// The panel SPA talks to the Worker, which talks to this server over HERMES_ORIGIN. The mock only
// answers what the screenshots need: the dashboard profile list, a session list, and two run
// flows — a normal answer with a tool call and a code block, and an approval flow whose stream
// stays open so the approval card is visible in the screenshot. No network, no keys, no data.

import { createServer } from "node:http";

const PROFILES = [
  ["cloudflare", "Website & Cloudflare"],
  ["minecraft", "Plugins & Stack"],
  ["discord", "Bot"],
  ["homelab", "Server"],
].map(([name, description]) => ({
  name,
  model: "deepseek/deepseek-v4.1-flash-1017",
  provider: "openrouter",
  description,
  gateway_running: true,
}));

const SESSIONS = [
  { id: "sess-design", title: "Design-System: Tokens und Panel-Politur", last_active: Math.floor(Date.now() / 1000) - 3600, messages: 24 },
  { id: "sess-deploy", title: "Worker-Deploy vorbereiten", last_active: Math.floor(Date.now() / 1000) - 86_400, messages: 12 },
  { id: "sess-guestbook", title: "Gästebuch: Rate-Limit prüfen", last_active: Math.floor(Date.now() / 1000) - 3 * 86_400, messages: 8 },
];

export async function startMockHermes() {
  const runs = new Map();
  const send = (res, body, status = 200) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
  const frame = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const server = createServer(async (req, res) => {
    const { pathname: p } = new URL(req.url, "http://127.0.0.1");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
    } catch {
      body = {};
    }

    if (p === "/dash/api/profiles") return send(res, { profiles: PROFILES });
    if (p === "/dash/api/model/options") {
      return send(res, {
        providers: [{ slug: "openrouter", models: ["deepseek/deepseek-v4.1-flash-1017", "claude-sonnet-5.5"] }],
        provider: "openrouter",
        model: "deepseek/deepseek-v4.1-flash-1017",
      });
    }
    if (/^\/dash\/api\/profiles\/[^/]+\/soul$/.test(p)) {
      return send(res, { content: "# SOUL\n\nDu bist der Cloudflare-Bot: Website, Worker, D1, Deployments.\n" });
    }
    if (/\/api\/sessions$/.test(p)) return send(res, { sessions: SESSIONS });
    if (/\/api\/sessions\/[^/]+\/messages$/.test(p)) {
      return send(res, {
        messages: [
          { role: "user", content: "Status der Website?" },
          { role: "assistant", content: "Alle Checks grün, Worker-Version unverändert." },
        ],
      });
    }
    if (/\/api\/jobs$/.test(p)) return send(res, { jobs: [] });
    if (/\/api\/usage/.test(p)) return send(res, { bots: [], daily: [], recent: [], prices: [] });

    if (/\/v1\/runs$/.test(p) && req.method === "POST") {
      const input = String(body.input || "");
      const runId = `run_${Math.random().toString(16).slice(2, 10)}`;
      runs.set(runId, { approval: /freigabe|deploy|approval/i.test(input) });
      return send(res, { run_id: runId, session_id: "sess-design" });
    }

    const runMatch = /\/v1\/runs\/([^/]+)\/events$/.exec(p);
    if (runMatch) {
      const run = runs.get(runMatch[1]) || { approval: false };
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const steps = [
        { event: "run.started" },
        { event: "thinking.delta", delta: "Ich sehe mir die Worker-Version an. " },
        { event: "thinking.delta", delta: "Danach prüfe ich die Checks." },
        { event: "tool.started", tool: "terminal", command: "npx wrangler deployments list --name nwebnotfound" },
        {
          event: "tool.completed",
          tool: "terminal",
          output: "Created: 2026-11-02T20:14:07Z  Version ID: 9f2c1ab4-6d0e-4c57-a3f9-2b41e0d7c8a5",
        },
      ];
      if (run.approval) {
        steps.push(
          { event: "tool.started", tool: "terminal", command: "npx wrangler deploy --name nwebnotfound" },
          {
            event: "approval.request",
            request_id: "req_1",
            command: "npx wrangler deploy --name nwebnotfound",
            choices: ["once", "session", "deny"],
          },
        );
      } else {
        steps.push(
          { event: "tool.started", tool: "file_read", command: "src/worker.js:142-158" },
          { event: "tool.completed", tool: "file_read", output: 'return `<!doctype html><html lang="de"…' },
          { event: "run.text", delta: "Die Website läuft auf der letzten Version, alle Checks sind grün.\n\n" },
          { event: "run.text", delta: "**Offen:** nur der bekannte Playwright-Runner-Fehler.\n\n" },
          { event: "run.text", delta: "```bash\nnpx wrangler deployments list --name nwebnotfound\n```\n" },
          { event: "run.completed" },
        );
      }
      let i = 0;
      const tick = setInterval(() => {
        if (i >= steps.length) {
          clearInterval(tick);
          if (!run.approval) res.end();
          return;
        }
        frame(res, steps[i++]);
      }, 40);
      req.on("close", () => clearInterval(tick));
      return;
    }
    if (/\/approval$/.test(p)) return send(res, { ok: true });
    if (/\/stop$/.test(p)) return send(res, { ok: true });
    return send(res, {}, 404);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, server };
}
