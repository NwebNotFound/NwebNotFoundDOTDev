# KI-Panel

Eigenes Cloudflare-Worker-Projekt `nwebnotfound-ai` unter `ai-panel/`. Die Seite ist `https://ai.nwebnotfound.dev`. Sie spricht nicht mit teuren Modellen: der Chat erzwingt `hermes-agent` und lehnt jeden anderen `model`-Wert ab. OpenRouter wird nur gelesen (Guthaben und der Preis von `hermes-agent`), der Schlüssel bleibt auf dem Server.

## Was läuft wo

- **Worker** (`ai-panel/src/worker.js`): Discord-Login, Session, Proxy zu Hermes, Rate-Limit, D1-Log, Usage. Einziger Zugang von außen.
- **Gateway** hinter `HERMES_ORIGIN`: Chat, Läufe und Cron (`/api/jobs`). Der Worker setzt den Bot-Key.
- **Dashboard** hinter `HERMES_DASHBOARD_ORIGIN`: Profile und Modelle. Der Worker setzt `X-Hermes-Session-Token`.

## Discord

In der Discord-Anwendung:

- Scope nur `identify`
- Redirect `https://ai.nwebnotfound.dev/auth/callback`

Der Callback im Worker ist `GET /auth/callback`. Der `state`-Parameter liegt in einem signierten Cookie (`ai_oauth`, Path `/auth`, HttpOnly, Secure, SameSite=Lax, 10 Minuten). Stimmt er nicht, gibt es keine Session.

Danach vergleicht der Worker die Discord-ID mit dem Secret `ALLOWED_DISCORD_ID`. Jede andere ID bekommt `403` und kein Session-Cookie. Die Session heißt `ai_session`, ebenfalls HttpOnly, Secure, SameSite=Lax, signiert mit `AI_SESSION_SECRET`, 30 Tage, nur auf diesem Host.

## Secrets

Nicht ins Git, nicht ins HTML, nicht in `wrangler.jsonc`. Im Verzeichnis `ai-panel` setzen:

```bash
npx wrangler secret put AI_DISCORD_CLIENT_ID
npx wrangler secret put AI_DISCORD_CLIENT_SECRET
npx wrangler secret put AI_SESSION_SECRET
npx wrangler secret put ALLOWED_DISCORD_ID
npx wrangler secret put HERMES_KEY_CLOUDFLARE
npx wrangler secret put HERMES_KEY_MINECRAFT
npx wrangler secret put HERMES_KEY_DISCORD
npx wrangler secret put HERMES_KEY_HOMELAB
npx wrangler secret put CF_ACCESS_CLIENT_ID
npx wrangler secret put CF_ACCESS_CLIENT_SECRET
npx wrangler secret put HERMES_DASHBOARD_SESSION_TOKEN
npx wrangler secret put OPENROUTER_KEY
```

`HERMES_KEY_*` sind die Bot-Schlüssel. Der Name wird großgeschrieben, Bindestriche werden zu Unterstrichen: `cloudflare` ist `HERMES_KEY_CLOUDFLARE`, `side-bot` ist `HERMES_KEY_SIDE_BOT`. Der Browser schickt keinen Schlüssel. Der Worker setzt am Gateway `Authorization: Bearer` und am Dashboard den Header `X-Hermes-Session-Token` aus `HERMES_DASHBOARD_SESSION_TOKEN`. Beide Werte werden aus der Antwort an den Browser entfernt.

Ein neuer Bot im Panel legt nur das Profil an. Danach auf PC-Nils den `API_SERVER_KEY` dieses Profils als Worker-Secret `HERMES_KEY_<NAME>` setzen und `hermes gateway restart` ausführen. Ohne das Secret bleibt der Bot im Panel ohne Chat. Das Panel zeigt diesen Hinweis, es startet Hermes nicht selbst.

## Vars

In `ai-panel/wrangler.jsonc` vor dem Deploy eintragen (echte Hostnamen, nicht committen, wenn der Tunnel privat bleiben soll):

```jsonc
"vars": {
  "HERMES_ORIGIN": "https://hermes.nwebnotfound.dev",
  "HERMES_DASHBOARD_ORIGIN": "https://hermes-dashboard.nwebnotfound.dev"
}
```

Beide Werte sind `https`-URLs ohne Benutzer oder Passwort im URL. Leer oder fehlend: der jeweilige Weg antwortet mit 503.

## Tunnel auf PC-Nils

Gateway und Dashboard bleiben auf localhost. Nur `cloudflared` auf demselben PC macht sie für den Worker erreichbar. Beispiel `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/nils/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: hermes.nwebnotfound.dev
    service: http://127.0.0.1:8787
  - hostname: hermes-dashboard.nwebnotfound.dev
    service: http://127.0.0.1:<DASHBOARD_PORT>
  - service: http_status:404
```

`8787` ist der Gateway-Port, `<DASHBOARD_PORT>` der Port des Hermes-Dashboards. Beide Prozesse binden `127.0.0.1`, nicht `0.0.0.0`. Die Hostnamen sind nicht der öffentliche Zugang.

Cloudflare Access vor beide Hostnamen, Service Token, ist der empfohlene Schutz. Dieselbe Client-ID und dasselbe Secret liegen in `CF_ACCESS_CLIENT_ID` und `CF_ACCESS_CLIENT_SECRET`. Der Worker schickt sie als `CF-Access-Client-Id` und `CF-Access-Client-Secret` an Gateway und Dashboard. Den Token nicht in den Tunnel schreiben. Menschen kommen nur über `https://ai.nwebnotfound.dev` und den Discord-Login.

Tunnel starten, falls er nicht als Dienst läuft:

```bash
cloudflared tunnel run
```

## Neuer Bot

Im Panel ein Profil anlegen. Danach auf PC-Nils:

1. `API_SERVER_KEY` des neuen Profils kopieren.
2. `npx wrangler secret put HERMES_KEY_<NAME>` im Verzeichnis `ai-panel`. `<NAME>` ist der Profilname in Großbuchstaben, `-` wird `_`.
3. `hermes gateway restart`

Erst danach kann der Chat dieses Bots. Cron (`/api/jobs`, Pause, Fortsetzen, Ausführen, Löschen) benutzt denselben Key am Gateway. Löschen fragt im Panel noch einmal nach.

Profile, Soul und Modell laufen über das Dashboard. Antwortet es mit `confirm_required`, zeigt das Panel den Text und schickt die Änderung erst nach dem Klick erneut, mit `confirm_expensive_model: true`.

## D1

Einmalig, danach die ausgegebene `database_id` in `ai-panel/wrangler.jsonc` einsetzen (der Platzhalter `00000000-0000-0000-0000-000000000000` gilt nur lokal):

```bash
npx wrangler d1 create nwebnotfound-ai --config ai-panel/wrangler.jsonc
npx wrangler d1 migrations apply nwebnotfound-ai --remote --config ai-panel/wrangler.jsonc
```

Die Migration `migrations/0001_init.sql` ist additiv (`IF NOT EXISTS`). Geloggt wird Zeit, Session, Bot, Pfad, Status, und falls die Antwort das hergibt Tokenzahlen und Kosten. Keine Prompts, keine Schlüssel.

Pro Session gelten 30 Proxy-Aufrufe (`/p/…` und `/api/hermes/…`) je 60000 ms. Darüber `429` mit `retry_after_ms`.

## Routen

| Weg | Wer |
| --- | --- |
| `GET /` | Panel, mobil zuerst, derselbe Apple-Stil wie die Hauptseite |
| `GET /auth/login`, `GET /auth/callback`, `GET /auth/logout` | Discord, Scope `identify` |
| `GET /api/me`, `GET /api/bots`, `GET /api/usage` | Session. Die Botliste kommt aus `GET /api/profiles` |
| `GET/POST /api/hermes/profiles`, `PATCH/DELETE /api/hermes/profiles/<name>` | Dashboard-Profile |
| `PUT /api/hermes/profiles/<name>/model` und `…/soul` | Modell und Soul des Profils |
| `GET /api/hermes/model/options?profile=`, `POST /api/hermes/model/set?profile=` | Modellauswahl, `confirm_required` bleibt ein Dialog |
| `GET/POST /p/<name>/api/jobs`, `PATCH/DELETE …/jobs/<id>`, `POST …/pause`, `…/resume`, `…/run` | Cron am Gateway, mit dem Bot-Key |
| `POST /p/<name>/v1/chat/completions` | Chat, Modell immer `hermes-agent`, SSE wird durchgereicht |
| `GET/POST /p/<name>/v1/runs`, `GET …/runs/<id>`, `GET …/events` | Läufe |
| `POST /p/<name>/v1/approval` | Bestätigen im UI |
| `POST /p/<name>/v1/steer`, `POST /p/<name>/v1/stop` | Hinweis und Stopp |
| `GET /p/<name>/api/sessions` | Sitzungen von Hermes |

POST vom Browser braucht `Origin` `https://ai.nwebnotfound.dev` (lokal `127.0.0.1`).

## Deploy

Wenn Secrets, Vars, D1-ID und Tunnel stehen:

```bash
npx wrangler deploy --config ai-panel/wrangler.jsonc
```

Die Custom Domain ist `ai.nwebnotfound.dev`. `workers.dev` ist aus.

## Tests

```bash
node ai-panel/test/unit.mjs
node ai-panel/test/e2e.mjs
```

Der e2e-Lauf startet wrangler und einen Mock für Discord, Gateway, Dashboard und OpenRouter. Er prüft die 403 für eine fremde Discord-ID, die Namensregeln, Cron über den Bot-Key, `confirm_required` ohne zweiten Aufruf von allein, und dass weder Bot-Key noch Dashboard-Token in der Antwort oder im D1-Log stehen. In CI hängt dasselbe am Workflow `e2e`.

`AI_OAUTH_BASE` und `OPENROUTER_ORIGIN` sind nur für diesen lokalen Lauf. Der Worker benutzt sie ausschließlich, wenn die URL auf `127.0.0.1` zeigt und der Request ein Loopback-Host ist oder den Header `x-ai-local: 1` trägt. In Produktion beide weglassen.
