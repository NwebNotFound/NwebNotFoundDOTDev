# AI-Panel (ai.nwebnotfound.dev)

Mobile-first control panel for Nils' Hermes crew. One Cloudflare Worker, no database, no
dependencies. Chat with live thinking/tool events, approve/steer/stop, bots + SOUL, per-bot model
switching, cron jobs, usage/cost and sessions.

- Plan: [`docs/plan.md`](docs/plan.md)
- Tunnel + secrets setup: [`docs/ai-panel-tunnel.md`](docs/ai-panel-tunnel.md)
- Origin proxy: [`origin-proxy/`](origin-proxy/)

## Layout

```
src/index.js       router, API handlers, request log
src/auth.js        Discord OAuth, signed session cookie, CSRF
src/upstream.js    Hermes client (gateway + dashboard paths, SSE pass-through)
src/ratelimit.js   per-isolate sliding window
public/            mobile-first SPA (no build step)
origin-proxy/      loopback proxy that fronts gateway + dashboard for the tunnel
test/              node:test unit + e2e (mock Hermes, no network)
```

## Develop

```bash
npm test          # unit + e2e against a mock Hermes on 127.0.0.1
npx wrangler dev  # needs .dev.vars (never committed)
```

`.dev.vars` for local work:

```
DISCORD_CLIENT_SECRET=...
SESSION_SECRET=...
ALLOWED_DISCORD_ID=...
HERMES_PANEL_SECRET=...
HERMES_ORIGIN=http://127.0.0.1:8650
OPENROUTER_API_KEY=...
```

## Security model

- The browser holds only the signed `nnf_ai` session cookie and a CSRF token.
- Discord client secret, session secret, Hermes key, OpenRouter key: wrangler secrets only.
- Every upstream call carries `X-Hermes-Panel-Secret`; the loopback proxy verifies it before
  forwarding to `127.0.0.1:8642` / `127.0.0.1:9119`.
- Mutating requests need the double-submit CSRF token; risky actions need an explicit confirm.
- Rate limits per IP and per user; every request is logged without bodies or secrets.

## Not deployed by this branch

Nothing here is deployed automatically. `wrangler deploy` is a manual step after review.
