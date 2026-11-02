# AI-Panel — Plan (ai.nwebnotfound.dev)

Owner: Nils (NwebNotFound). This document is the plan that ships with the PR; the PR body
repeats it so the review can be read without opening the tree.

## Goal

One mobile-first web panel for Nils' Hermes crew (bots `cloudflare`, `minecraft`, `discord`,
`homelab`): chat with streaming thinking/tool calls, approve/steer/stop, bot + SOUL editing,
per-bot model switching, cron jobs, usage/cost, sessions. Reachable only through a Cloudflare
Tunnel; the home IP never appears in DNS or in the panel.

## Where the code lives

A **separate Worker in this repo** under `ai-panel/` (own `wrangler.jsonc`, own `package.json`,
own CI workflow `.github/workflows/ai-panel.yml`). Reasons:

- The site Worker (`src/worker.js`) is one file with D1 + assets and a live domain. A second
  deploy unit keeps `wrangler deploy` for the site and the panel independent — a panel change can
  never take nwebnotfound.dev down, and vice versa.
- The panel needs its own secrets, its own route (`ai.nwebnotfound.dev`) and its own test suite.
- A separate repo would work too, but the panel is Nils' own tooling for this stack and the
  tunnel docs belong next to the site docs. If a separate repo is preferred, moving `ai-panel/`
  is a `git filter-repo` away; nothing in it imports from `../src`.

## Architecture

```
browser ──https──> Worker ai.nwebnotfound.dev        (this PR)
                        │  session cookie + CSRF + rate limit
                        │  X-Hermes-Panel-Secret (wrangler secret)
                        ▼
              Cloudflare Tunnel hostname  (e.g. hermes.nwebnotfound.dev)
                        ▼
              origin-proxy 127.0.0.1:8650  (ai-panel/origin-proxy/proxy.mjs)
                        │  verifies the shared secret, injects the Hermes key,
                        │  rewrites Host for the dashboard
                        ├──> /gw/*   → 127.0.0.1:8642  (Hermes gateway, API_SERVER_KEY)
                        └──> /dash/* → 127.0.0.1:9119  (Hermes dashboard, loopback bind)
```

- The tunnel is **not** created in this PR. `docs/ai-panel-tunnel.md` has the exact steps;
  `cloudflared login` stays with Nils.
- The browser never sees `API_SERVER_KEY`, the OpenRouter key, the Discord client secret or the
  session secret. The Worker holds `HERMES_PANEL_SECRET` (and optionally `HERMES_API_KEY`); the
  proxy holds the gateway key. Both are wrangler/`.env` secrets, never committed.
- Ports 8642/9119/8650 stay on 127.0.0.1. No port forwarding, no 0.0.0.0 bind.

## Auth

- Discord OAuth2, scope `identify`, client ID `1566865767029284884`,
  redirect `https://ai.nwebnotfound.dev/auth/callback`.
- `/auth/login` sets a signed, 10-minute `state` cookie; `/auth/callback` verifies state,
  exchanges the code, reads `/users/@me`, and compares the id to `ALLOWED_DISCORD_ID`
  (constant-time). Anything else → 403 page, no session.
- Session: `nnf_ai` cookie, value `b64url(payload).b64url(HMAC-SHA256)`, `HttpOnly; Secure;
  SameSite=Lax; Path=/; Max-Age=7d`. Payload carries the Discord id, name, avatar hash, iat, exp.
- CSRF: double-submit. `nnf_ai_csrf` cookie (readable) must equal the `X-CSRF-Token` header on
  every mutating request; `Origin` must match the panel host when present.
- Rate limit: per-isolate sliding window — chat 20/min, general API 120/min, auth 10/min per IP.
- Request log: structured JSON to `console.log` (Workers Logs) plus a bounded in-memory ring
  exposed at `GET /api/log` for the UI. No secrets, no message bodies — method, path, status,
  duration, bot, user id suffix.

## Features → endpoints

| Feature | Panel route | Upstream |
|---|---|---|
| Chat (streamed) | `POST /api/bots/:bot/runs` | `POST /p/:bot/v1/runs` (`model: hermes-agent`) |
| Live events | `GET /api/bots/:bot/runs/:id/events` | `GET /p/:bot/v1/runs/:id/events` (SSE pass-through) |
| Approve / steer / stop | `POST /api/bots/:bot/runs/:id/{approval,steer,stop}` | same paths upstream |
| Quick chat | `POST /api/bots/:bot/quick` | `POST /p/:bot/v1/chat/completions` (stream) |
| Bots list/create | `GET/POST /api/bots` | dashboard `/api/profiles` |
| SOUL | `GET/PUT /api/bots/:bot/soul` | dashboard `/api/profiles/:bot/soul` |
| Models | `GET /api/bots/:bot/models` | dashboard `/api/model/options?profile=` |
| Switch model | `POST /api/bots/:bot/model` | dashboard `/api/model/set?profile=` |
| Cron | `/api/bots/:bot/jobs[...]` | gateway `/p/:bot/api/jobs` (list/create/patch/delete/pause/resume/run) |
| Sessions | `GET /api/bots/:bot/sessions[/:id/messages]` | gateway `/p/:bot/api/sessions` |
| Usage | `GET /api/usage` | OpenRouter `/api/v1/credits` + `/api/v1/key` + `/api/v1/models`, sessions per bot |

Confirm clicks: risky actions (model switch that returns `confirm_required`, cron delete, SOUL
overwrite) render a confirm dialog in the panel; the API refuses the action without the explicit
`confirm: true` field, so a stray click or a replayed request cannot do it.

## Tests / CI

- `node --test test/` — unit tests for session signing, CSRF, rate limit, bot-name validation,
  upstream path building; then an e2e-ish suite that boots the Worker's `fetch` handler against a
  real local mock Hermes (HTTP server on 127.0.0.1) and walks login → chat run → SSE events →
  approve → jobs → usage.
- `.github/workflows/ai-panel.yml`: node 22, `npm ci` (no deps beyond dev), `npm test`,
  path-filtered to `ai-panel/**`. The site's `e2e.yml` is untouched.

## Rollout (after merge, by Nils)

1. `wrangler d1`/KV not needed — the panel keeps no database.
2. Set secrets (list in the PR body), create the tunnel, run the origin proxy, deploy.
3. Nothing in this PR is deployed by the agent; no DNS record is created here.
