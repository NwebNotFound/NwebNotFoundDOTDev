// Mock Hermes origin: an HTTP server that speaks the gateway (/gw) and dashboard (/dash)
// surfaces the panel uses. It also asserts the shared-secret header on every request.

import { createServer } from "node:http";

export const PANEL_SECRET = "test-panel-secret";

export function startMockHermes() {
  const state = {
    requests: [],
    jobs: [
      { id: "job_1", name: "morning", schedule: "0 8 * * *", prompt: "status", enabled: true, paused: false },
    ],
    sessions: [
      {
        id: "20260101_120000_aaaaaa",
        title: "Deploy check",
        model: "deepseek/deepseek-v4.1-flash-1017",
        input_tokens: 1200,
        output_tokens: 300,
        estimated_cost_usd: 0.00042,
        api_call_count: 2,
        last_active: Math.floor(Date.now() / 1000) - 3600,
        message_count: 4,
      },
    ],
    soul: "# SOUL\ncloudflare bot\n",
    // What GET /v1/runs/<id> reports as waiting for a decision (approval body needs both).
    pendingControls: { request_id: "req_1", execution_generation: 3 },
    profiles: [
      { name: "cloudflare", description: "website", model: "deepseek/x", provider: "openrouter", gateway_running: true },
      { name: "minecraft", description: "plugins", model: "deepseek/x", provider: "openrouter", gateway_running: false },
      { name: "discord", description: "bot", model: "deepseek/x", provider: "openrouter", gateway_running: false },
      { name: "homelab", description: "server", model: "deepseek/x", provider: "openrouter", gateway_running: false },
      { name: "default", description: "main", model: "deepseek/x", provider: "openrouter", gateway_running: false },
    ],
    runs: new Map(),
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? safeJson(raw) : null;
      state.requests.push({ method: req.method, path: url.pathname, search: url.search, headers: req.headers, body });

      const send = (status, data, headers = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(data));
      };

      if (req.headers["x-hermes-panel-secret"] !== PANEL_SECRET) {
        return send(401, { error: "panel secret missing" });
      }

      const p = url.pathname;

      // ---- origin health (the Worker's bot list + status dot) ----
      if (p === "/health" && req.method === "GET") {
        return send(200, { ok: true, uptime_s: 42, gateway: true, bots: ["cloudflare", "minecraft", "default"] });
      }

      // ---- dashboard ----
      if (p === "/dash/api/profiles" && req.method === "GET") return send(200, { profiles: state.profiles });
      if (p === "/dash/api/profiles" && req.method === "POST") {
        if (!body?.name) return send(400, { detail: "name required" });
        state.profiles.push({ name: body.name, description: body.description || "", model: null, provider: null });
        return send(200, { ok: true, name: body.name });
      }
      if (p.match(/^\/dash\/api\/profiles\/[a-z0-9_-]+\/soul$/)) {
        if (req.method === "GET") return send(200, { content: state.soul, exists: true });
        if (req.method === "PUT") {
          state.soul = body?.content ?? "";
          return send(200, { ok: true });
        }
      }
      if (p === "/dash/api/model/options") {
        return send(200, {
          provider: "openrouter",
          model: "deepseek/x",
          providers: [
            {
              slug: "openrouter",
              name: "OpenRouter",
              is_current: true,
              models: [{ id: "deepseek/x", name: "DeepSeek X" }, { id: "expensive/x", name: "Expensive X" }],
            },
          ],
        });
      }
      if (p === "/dash/api/model/set" && req.method === "POST") {
        if (body?.model === "expensive/x" && body?.confirm_expensive_model !== true) {
          return send(200, { ok: false, confirm_required: true, confirm_message: "This model is expensive." });
        }
        return send(200, { ok: true, provider: body.provider, model: body.model });
      }

      // ---- gateway ----
      const jobs = p.match(/^\/gw\/p\/([a-z0-9_-]+)\/api\/jobs(?:\/([A-Za-z0-9_-]+))?(?:\/(pause|resume|run))?$/);
      if (jobs) {
        const id = jobs[2];
        const action = jobs[3];
        if (!id && req.method === "GET") return send(200, { jobs: state.jobs });
        if (!id && req.method === "POST") {
          if (!body?.name || !body?.schedule) return send(400, { error: "name and schedule required" });
          const job = { id: `job_${state.jobs.length + 1}`, ...body, enabled: true, paused: false };
          state.jobs.push(job);
          return send(200, { job });
        }
        if (id && action) return send(200, { job: { id, paused: action === "pause" }, action });
        if (id && req.method === "PATCH") {
          const job = state.jobs.find((j) => j.id === id);
          if (!job) return send(404, { error: "not found" });
          Object.assign(job, body);
          return send(200, { job });
        }
        if (id && req.method === "DELETE") {
          state.jobs = state.jobs.filter((j) => j.id !== id);
          return send(200, { ok: true });
        }
      }

      const sessions = p.match(/^\/gw\/p\/([a-z0-9_-]+)\/api\/sessions(?:\/([A-Za-z0-9_-]+)\/messages)?$/);
      if (sessions && req.method === "GET") {
        if (sessions[2]) {
          return send(200, {
            messages: [
              { role: "user", content: "hallo", timestamp: 1767225600 },
              { role: "assistant", content: "hi", timestamp: 1767225660 },
            ],
          });
        }
        return send(200, { sessions: state.sessions });
      }

      if (p.match(/^\/gw\/p\/[a-z0-9_-]+\/v1\/runs$/) && req.method === "POST") {
        if (!body?.input) return send(400, { error: { message: "input required" } });
        const run_id = `run_${Math.random().toString(16).slice(2, 10)}`;
        state.runs.set(run_id, { input: body.input, model: body.model, status: "running" });
        return send(200, { run_id, object: "hermes.run", status: "queued" });
      }

      const runEvents = p.match(/^\/gw\/p\/[a-z0-9_-]+\/v1\/runs\/([A-Za-z0-9_-]+)\/events$/);
      if (runEvents) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const frames = state.streamDrops
          ? [{ event: "run.started", run_id: runEvents[1] }]
          : [
              { event: "run.started", run_id: runEvents[1] },
              { event: "thinking.delta", run_id: runEvents[1], delta: "überlege" },
              { event: "tool.started", run_id: runEvents[1], tool: "terminal" },
              { event: "tool.completed", run_id: runEvents[1], tool: "terminal", error: false, preview: "exit 0" },
              { event: "run.completed", run_id: runEvents[1], output: "fertig" },
            ];
        for (const [i, f] of frames.entries()) res.write(`id: ${i}\ndata: ${JSON.stringify(f)}\n\n`);
        return res.end();
      }

      const runGet = p.match(/^\/gw\/p\/[a-z0-9_-]+\/v1\/runs\/([A-Za-z0-9_-]+)$/);
      if (runGet && req.method === "GET") {
        const run = state.runs.get(runGet[1]) || { status: "running" };
        return send(200, {
          run_id: runGet[1],
          status: run.status || "running",
          output: run.output || "",
          pending_controls: state.pendingControls,
        });
      }

      const runAction = p.match(/^\/gw\/p\/[a-z0-9_-]+\/v1\/runs\/([A-Za-z0-9_-]+)\/(approval|steer|stop)$/);
      if (runAction && req.method === "POST") {
        if (runAction[2] === "approval" && !["once", "session", "always", "deny"].includes(body?.choice)) {
          return send(400, { error: { message: "bad choice" } });
        }
        return send(200, { ok: true, run_id: runAction[1], action: runAction[2] });
      }

      if (p.match(/^\/gw\/p\/[a-z0-9_-]+\/v1\/chat\/completions$/) && req.method === "POST") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"content":"hallo"}}]}\n\n');
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      return send(404, { error: "no mock route", path: p });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        state,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Fake Discord API for the OAuth tests. Returns a fetch replacement. */
export function discordFetch({ userId = "111111111111111111", fail = false } = {}) {
  const realFetch = globalThis.fetch;
  const impl = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://discord.com/api/oauth2/token")) {
      if (fail) return new Response("nope", { status: 400 });
      return new Response(JSON.stringify({ access_token: "tok", token_type: "Bearer" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://discord.com/api/users/@me")) {
      return new Response(JSON.stringify({ id: userId, username: "nils", global_name: "Nils" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  };
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = realFetch;
  };
}

/** Read a Set-Cookie header pair into {name: value}. */
export function cookiesFrom(res) {
  const out = {};
  for (const raw of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const first = raw.split(";")[0];
    const eq = first.indexOf("=");
    out[first.slice(0, eq)] = decodeURIComponent(first.slice(eq + 1));
  }
  return out;
}

export function cookieHeader(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
}
