# nwebnotfound-site

Website für [nwebnotfound.dev](https://nwebnotfound.dev) – ein einzelner Cloudflare Worker (Startseite, Gästebuch, Minecraft-Status).

## Struktur
- `src/worker.js` – gesamte Logik + HTML (Routen `/`, `/guestbook`, `/minecraft`, `/api/guestbook`)
- `wrangler.jsonc` – Worker-Konfiguration (Routen, D1-Binding)
- `schema.sql` – D1-Datenbankschema für das Gästebuch

## Lokal entwickeln
```bash
npx wrangler dev
```
Für das Captcha lokal eine `.dev.vars` anlegen (wird nicht committet): `TURNSTILE_SECRET=...`

## Deployen
```bash
npx wrangler deploy
```

## D1-Schema
```bash
npx wrangler d1 execute <DB-NAME> --remote --file=schema.sql
```

## Secrets
Das Turnstile-Secret liegt **nicht** im Repo. Setzen mit:
```bash
npx wrangler secret put TURNSTILE_SECRET
```
Der Sitekey in `worker.js` ist öffentlich und darf im Code stehen.

## Phase 1 (Redesign, mc.nwebnotfound.dev, Discord-Login)
- Hosts: `nwebnotfound.dev` (Portfolio, Gästebuch), `mc.nwebnotfound.dev` (Minecraft-Bereich, Worker Custom Domain; SRV `_minecraft._tcp.mc` bleibt unberührt). `/minecraft` → 301 auf mc.
- Auth: `/auth/discord/login|callback|logout`, `/api/me`. Secrets: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`. Redirect-URI: `https://nwebnotfound.dev/auth/discord/callback`.
- MC-Daten: `POST /api/mc-ingest` (Header `x-ingest-token: <MC_INGEST_TOKEN>`), `GET /api/mc-data` (nur frisch < 5 Min).
