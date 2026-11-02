# AI-Panel: Cloudflare Tunnel setup

Everything here is done by **Nils**. The agent does not run `cloudflared login`, does not create
DNS records and does not deploy. Ports stay on `127.0.0.1`; there is no port forwarding.

## Why a proxy in front of Hermes

The panel Worker must reach the Hermes gateway (`127.0.0.1:8642`) and the dashboard
(`127.0.0.1:9119`) without either of them being public. The tunnel terminates at
`origin-proxy` on `127.0.0.1:8650`, which

- rejects any request whose `X-Hermes-Panel-Secret` header does not match (constant-time),
- injects the credential for the destination:
  - `/dash/*` → `X-Hermes-Session-Token: <HERMES_DASHBOARD_SESSION_TOKEN>` (the dashboard
    answers 401 without it),
  - `/gw/p/<bot>/…` → `Authorization: Bearer <API_SERVER_KEY>`, read from that profile's own
    env file at request time (cached ~30 s); a profile without a key, or an invalid bot name,
    is refused with 404,
  - `/gw/…` without a profile → `Authorization: Bearer <API_SERVER_KEY>`,
- strips any `authorization`, `x-hermes-session-token` or `cookie` header the caller sent, so a
  client cannot smuggle its own credential through,
- rewrites `Host` to `127.0.0.1:9119` for dashboard routes (the dashboard's loopback bind only
  accepts loopback `Host` values),
- maps `/gw/*` → `127.0.0.1:8642` and `/dash/*` → `127.0.0.1:9119`.

Without that header the tunnel hostname is useless to anyone who finds it.

## 1. Tunnel (Nils)

```powershell
# once, interactive — the agent must not do this
cloudflared tunnel login

cloudflared tunnel create ai-panel
# note the tunnel UUID printed here
```

`%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: C:\Users\nilsw\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: hermes.nwebnotfound.dev
    service: http://127.0.0.1:8650
    originRequest:
      httpHostHeader: 127.0.0.1:8650
      noTLSVerify: false
  - service: http_status:404
```

```powershell
cloudflared tunnel route dns ai-panel hermes.nwebnotfound.dev
cloudflared tunnel run ai-panel      # test in the foreground first
```

Then, if it works, install it as a service (`cloudflared service install`) so it survives reboot.

Notes:

- `hermes.nwebnotfound.dev` is a **proxied** CNAME to `<UUID>.cfargotunnel.com` — that is how
  Cloudflare creates it; do not switch it to DNS-only.
- The tunnel carries only the panel's upstream traffic. The site Worker and `mc.` are unaffected.
- Free plan is enough: one tunnel, one hostname.

## 2. Origin proxy (Nils)

```powershell
cd C:\Users\nilsw\mc-stack\ai-panel\origin-proxy   # or wherever this repo is checked out
copy .env.example .env
# edit .env: PANEL_SECRET, HERMES_DASHBOARD_SESSION_TOKEN, one HERMES_KEY_<BOT> per profile
node proxy.mjs
```

`.env` values:

| Key | Meaning |
|---|---|
| `PANEL_SECRET` | shared secret, identical to the Worker's `HERMES_PANEL_SECRET` |
| `HERMES_DASHBOARD_SESSION_TOKEN` | the dashboard's session token (the value the dashboard runs with); sent as `X-Hermes-Session-Token` on `/dash/*` |
| `HERMES_KEY_<BOT>` | optional override for one profile; `my-bot` → `HERMES_KEY_MY_BOT` |
| `API_SERVER_KEY` | optional, for `/gw/…` routes without a profile prefix (and the `default` bot fallback) |
| `HERMES_HOME` | optional, the Hermes data dir if not `%LOCALAPPDATA%\hermes` |
| `PORT` | listen port, default `8650` |
| `GATEWAY` | default `http://127.0.0.1:8642` |
| `DASHBOARD` | default `http://127.0.0.1:9119` |

Gateway keys are not configured here any more: on each `/gw/p/<bot>/…` the proxy reads
`API_SERVER_KEY` from the Hermes profile's own env file — `%LOCALAPPDATA%\hermes\.env` for
`default`, `%LOCALAPPDATA%\hermes\profiles\<bot>\.env` for every other bot — and caches the
result for ~30 s (misses included). So a bot created in the panel works without touching this
`.env` and without a restart, and a rotated key is picked up within half a minute. Only
`[a-z0-9][a-z0-9_-]{0,31}` is a valid bot name; anything else is a hard 404 `unknown_bot`, and
the resolved file must stay inside the profiles directory. `HERMES_KEY_<BOT>`, when set, still
wins. The proxy prints the profiles it discovered at startup (names only, never key values).

The proxy binds `127.0.0.1` only. `.env` is gitignored; never commit it.

### Health, keep-alive and autostart

- `GET /health` on the proxy (shared secret required) answers `{ok, uptime_s, gateway, bots}`.
  `gateway` is a TCP-level probe of the Hermes gateway; `bots` is the same profiles-directory
  list the key resolution uses, names only. The Worker's public `/api/health` caches it for 10 s
  and reports `origin: {reachable, gateway}`; the SPA shows that as the topbar dot
  (`online` / `Gateway aus` / `Tunnel aus`).
- On a `text/event-stream` response the proxy writes `: ping` every 15 s (`SSE_PING_MS`).
  Cloudflare drops ~100 s of silence, which is exactly what a pending approval looks like; the
  Worker does the same on its side (`sseBody`). Both are comment frames, invisible to the UI.
- The SPA resumes a dropped stream (`?since=<seq>`, forwarded by the Worker), and when the stream
  ends without a terminal event it polls `GET /api/bots/<bot>/runs/<id>` — which also refreshes
  the persisted run status — before reconnecting with backoff.
- `watchdog.ps1` (this directory) runs one service in the foreground and installs the scheduled
  tasks that keep the three of them alive:

  ```powershell
  powershell -ExecutionPolicy Bypass -File watchdog.ps1 -Status    # what runs, which port answers
  powershell -ExecutionPolicy Bypass -File watchdog.ps1 -Check     # restart a dead task
  powershell -ExecutionPolicy Bypass -File watchdog.ps1 -Install   # register the tasks (once)
  ```

  It prefers an existing `run-proxy.ps1` / `run-dashboard.ps1` / `run-tunnel.ps1` in the origin
  directory and falls back to `node proxy.mjs`, the Hermes dashboard and `cloudflared tunnel run`.
  The tasks are named `AIPanel_proxy`, `AIPanel_dashboard`, `AIPanel_tunnel`, run at logon (20 s
  delay) and restart every minute after a non-zero exit. Logs: `%LOCALAPPDATA%\ai-panel\logs`.

### The approval contract
`POST /p/<bot>/v1/runs/<id>/approval` takes exactly `{request_id, execution_generation, choice}`;
a missing or extra key is rejected or, worse, silently ignored. The Worker builds that body and,
when the browser did not supply the two ids, reads them from `GET /v1/runs/<id>`
(`pending_controls`, id as `request_id` or `prompt_id`). If they cannot be resolved it answers
409 `approval_context_missing` instead of sending a body that would do nothing. Run status and
history live in `PanelStore` (`GET /api/runs?bot=&limit=`), so the "Runs" view survives an
isolate restart.

### Chat history

The transcript lives in `PanelStore`, not in the browser and not only in Hermes:

- `POST /api/bots/<bot>/runs` creates or reuses a conversation (`conversation_id` in the body,
  returned in the response), stores the user message, and writes the run row.
- The `/events` pass-through tees every SSE frame, so `tool.completed` and `approval.request`
  become transcript rows and `run.completed` stores the final answer — while the bytes reach the
  browser unchanged. When the stream dies early, the poll (`GET /runs/<id>`) stores the answer
  instead; both paths dedupe on `(conversation, run_id, assistant)`.
- The sidebar lists conversations (`GET /api/bots/<bot>/conversations`, title/bot/updated_at),
  and opening one reads `GET /api/bots/<bot>/conversations/<id>/messages`. The id is kept in
  `localStorage`, so a reload reopens the thread; after a re-login the sidebar still lists it.
- Quick mode (`/v1/chat/completions`) is not stored — it is a scratch path, not a conversation.

## 3. Worker secrets (Nils or Luna)

```powershell
cd ai-panel
npx wrangler secret put DISCORD_CLIENT_SECRET   # Discord app 1566865767029284884
npx wrangler secret put SESSION_SECRET          # openssl rand -hex 32
npx wrangler secret put ALLOWED_DISCORD_ID      # Nils' Discord user id
npx wrangler secret put HERMES_PANEL_SECRET     # same value as the proxy's PANEL_SECRET
npx wrangler secret put OPENROUTER_API_KEY      # usage page only
```

`HERMES_API_KEY` is **not** needed: the proxy injects the per-bot gateway key, so the Worker
never holds one.

Non-secret vars live in `wrangler.jsonc`: `DISCORD_CLIENT_ID`, `PANEL_HOST`, `HERMES_ORIGIN`
(point it at the tunnel hostname), `PANEL_BOTS` (fallback only — the live profile list from the
dashboard is the real allowlist) and `SESSION_VERSION` (bump it to invalidate every session).

The `PanelStore` Durable Object is declared in `wrangler.jsonc` with a `v1` migration; the first
deploy creates it, no extra provisioning and no D1/KV namespace to create by hand.

## 4. Discord app settings

- Redirect URI: `https://ai.nwebnotfound.dev/auth/callback` (exact match, no trailing slash).
- Scopes: `identify` only.
- The panel compares the returned user id against `ALLOWED_DISCORD_ID`; every other account gets
  a 403 page and no cookie.

## 5. Deploy

```powershell
cd ai-panel
npx wrangler deploy
```

`ai.nwebnotfound.dev` is a Worker custom domain; Cloudflare creates the DNS record. Do not add a
second A/AAAA record for that name.

## 6. Checks after deploy

```powershell
curl -s https://ai.nwebnotfound.dev/api/health
# {"ok":true,"upstream":true,...}
```

- Open the panel, log in with Discord, send one message to `cloudflare`, watch thinking/tool
  events stream, press Stop.
- `wrangler tail nwebnotfound-ai-panel` shows the structured request log.
- Wrong-account login must land on `/auth/denied` and set no cookie.
- `curl -sI https://ai.nwebnotfound.dev/ | grep -i content-security-policy` must show
  `frame-ancestors 'none'`.
- `/api/health` reports `"store":true` once the Durable Object binding is live.
- "Überall abmelden" in the sidebar must invalidate the cookie on a second device.
