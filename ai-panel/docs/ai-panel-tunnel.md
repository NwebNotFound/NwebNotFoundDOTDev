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
  - `/gw/p/<bot>/…` → `Authorization: Bearer <HERMES_KEY_<BOT>>`, chosen from the profile in
    the path; a profile without a key is refused with 404,
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
| `HERMES_KEY_CLOUDFLARE` | `API_SERVER_KEY` of the `cloudflare` profile |
| `HERMES_KEY_MINECRAFT` | `API_SERVER_KEY` of the `minecraft` profile |
| `HERMES_KEY_<BOT>` | one per profile; `my-bot` → `HERMES_KEY_MY_BOT` |
| `API_SERVER_KEY` | optional, for `/gw/…` routes without a profile prefix |
| `PORT` | listen port, default `8650` |
| `GATEWAY` | default `http://127.0.0.1:8642` |
| `DASHBOARD` | default `http://127.0.0.1:9119` |

The proxy prints which keys it found at startup (`per-bot gateway keys: …`) and warns when the
dashboard token is missing. A bot created in the panel needs its `HERMES_KEY_<BOT>` added here
before its chat works — the panel itself picks it up without a redeploy.

The proxy binds `127.0.0.1` only. `.env` is gitignored; never commit it.

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
