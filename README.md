# nwebnotfound-site

Website für [nwebnotfound.dev](https://nwebnotfound.dev) – ein einzelner Cloudflare Worker (Startseite, Gästebuch, Minecraft-Status).

## Struktur
- `src/worker.js` – Routing + HTML der Portfolio- und Minecraft-Seiten (Routen `/portfolio`, `/guestbook`, `/minecraft`, `/api/…`)
- `src/hub.js` – Creative-Hub-Shell und Hub-Seiten (`/`, `/about`, `/music`, `/writing`, `/reviews`)
- `src/i18n/` – Oberflächentexte (`de.js`, `en.js`) plus Sprachwahl, `/de/…`–`/en/…`-Präfixe und `t()`
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

## Creative Hub Phase 2 (Shell, `/about`, DE/EN)
- Neues Theme nur auf dem Hub: `public/design/summer.css` (`.sm-root`, §11 in `DESIGN.md`), Theme-Umschalter über `public/design/summer-theme.js`, Platzhalter-Maskottchen aus `public/design/summer-sprites.svg`. Minecraft- und Portfolio-Seiten laden dieses Stylesheet nicht.
- Routen auf `nwebnotfound.dev`: `/` (neue Startseite mit Hero und Bereichskacheln), `/about`, die noch leeren Bereiche `/music`, `/writing`, `/reviews` (Leerzustand mit Maskottchen-Platzhalter) sowie `/de/…` und `/en/…` als kanonische Sprach-URLs (`hreflang`, `<html lang>`).
- Die frühere Startseite bleibt unverändert unter **`/portfolio`**; `/guestbook`, `/profile`, `/feedback`, alle `/api/…`- und `/auth/…`-Routen sowie `mc.nwebnotfound.dev` sind unverändert.
- Sprache: `Accept-Language`, gemerkt in der Cookie `nnf_lang`; `/` leitet nie um (kein Redirect-Loop). Ein Sprachpräfix vor einer Hub-fremden Route antwortet mit 301 auf den Pfad ohne Präfix.
- Gates vor jedem Push: `node scripts/icon-check.mjs && node scripts/contrast-check.mjs && node scripts/summer-scope-check.mjs && node scripts/i18n-check.mjs && node scripts/hub-unit.mjs` (laufen auch in der CI), danach `node scripts/e2e.mjs`.
