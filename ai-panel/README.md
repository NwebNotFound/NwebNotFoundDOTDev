# AI-Panel (ai.nwebnotfound.dev)

Control panel for Nils' Hermes crew. One Cloudflare Worker, no dependencies, no build step.
Chat with streamed thinking/tool events, approve/steer/stop, bots + SOUL, per-bot model
switching, cron jobs, usage/cost and sessions — in a ChatGPT-style shell with a sidebar,
markdown answers, highlighted code blocks and a phone drawer.

- Plan: [`docs/plan.md`](docs/plan.md)
- Tunnel + secrets setup: [`docs/ai-panel-tunnel.md`](docs/ai-panel-tunnel.md)
- Origin proxy: [`origin-proxy/`](origin-proxy/)

## Layout

```
src/index.js       router, API handlers, security headers
src/auth.js        Discord OAuth, signed session cookie, CSRF, session version
src/upstream.js    Hermes client (gateway + dashboard paths, SSE pass-through, bot allowlist)
src/store.js       PanelStore Durable Object: rate limits, request log, session revocation
src/ratelimit.js   in-memory fallback limiter
src/log.js         in-memory fallback request log
public/index.html  shell
public/app.js      SPA (chat, sidebar, panels)
public/markdown.js markdown -> data tree (no HTML strings)
public/highlight.js syntax highlighting -> tokens
origin-proxy/      loopback proxy that fronts gateway + dashboard for the tunnel
test/              node:test unit + e2e (mock Hermes, no network)
```

## Develop

```bash
npm test          # 84 tests: unit + e2e against a mock Hermes on 127.0.0.1
npm run check     # node --check on every module
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

`node scripts/dev-server.mjs` runs the same handler under plain Node and serves `public/`;
open `/__dev/login` to mint a session without Discord. It is a dev-only route and does not
exist in the Worker.

## Credentials, and where they live

| Secret | Lives in | Used for |
|---|---|---|
| `PANEL_SECRET` / `HERMES_PANEL_SECRET` | proxy `.env` / Worker secret | shared secret between Worker and proxy |
| `HERMES_DASHBOARD_SESSION_TOKEN` | proxy `.env` | `X-Hermes-Session-Token` on every `/dash/*` call |
| `HERMES_KEY_<BOT>` | proxy `.env` | optional override for one profile's gateway key (normally read from the profile's own env file) |
| `API_SERVER_KEY` | proxy `.env` | gateway routes without a profile prefix |
| `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_DISCORD_ID` | Worker secret | login |
| `OPENROUTER_API_KEY` | Worker secret | usage page |
| `SESSION_VERSION` | `wrangler.jsonc` var | bump to invalidate every session |

The browser never sees any of them. See `docs/ai-panel-tunnel.md` for the exact setup.

## Security model

- The browser holds only the signed `nnf_ai` session cookie and a CSRF token.
- Every upstream call carries `X-Hermes-Panel-Secret`; the loopback proxy verifies it before
  forwarding, then adds the credential for that destination (dashboard token or the bot's key).
  A `/gw/p/<bot>/` request for a profile without a key is a 404 — never another bot's key.
- Mutating requests need the double-submit CSRF token; risky actions need an explicit confirm.
  Logout is a POST with the token, so an `<img src>` cannot sign Nils out.
- Sessions carry a version and are checked against a revocation marker: `/api/logout-all` kills
  every issued cookie, and bumping `SESSION_VERSION` kills them without a store round-trip.
- Rate limits and the request log live in the `PanelStore` Durable Object, so they survive an
  isolate going away. No bodies, cookies or tokens are recorded.
- Every response carries a CSP (`default-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options:
  DENY`, `nosniff` and `Referrer-Policy: no-referrer`.
- Upstream errors are logged server-side; the browser only gets a generic code.
- The SPA never builds markup from strings: markdown and highlighting produce data, and the DOM
  is built with `textContent`/`createTextNode`. Links are limited to http(s), mailto and
  site-relative URLs.

## Not deployed by this branch

Nothing here is deployed automatically. `wrangler deploy` is a manual step after review.
