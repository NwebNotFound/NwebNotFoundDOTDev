# KI-Panel

Eigenes Cloudflare-Worker-Projekt `nwebnotfound-ai` unter `ai-panel/`. Die Seite ist `https://ai.nwebnotfound.dev`. Sie spricht nicht mit teuren Modellen: der Chat erzwingt `hermes-agent` und lehnt jeden anderen `model`-Wert ab. OpenRouter wird nur gelesen (Guthaben und der Preis von `hermes-agent`), der Schlüssel bleibt auf dem Server.

## Was läuft wo

- **Worker** (`ai-panel/src/worker.js`): Discord-Login, Session, Proxy zu Hermes, Rate-Limit, D1-Log, Usage.
- **Helfer** (`ai-panel/helper/server.mjs`): nur auf dem PC, nur `127.0.0.1`. Legt Hermes-Profile an. Keine Shell, nur argv-Listen.
- **Hermes** hinter einem Cloudflare-Tunnel. Der Worker holt sich den Host aus der Var `HERMES_ORIGIN`.

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
npx wrangler secret put HELPER_KEY
npx wrangler secret put OPENROUTER_KEY
```

Die vier `HERMES_KEY_*` sind die Bot-Schlüssel für `cloudflare`, `minecraft`, `discord` und `homelab`. Der Browser schickt keinen Schlüssel. Der Worker setzt `Authorization` selbst und entfernt diese Werte aus der durchgereichten Antwort.

Zusätzliche Bots aus dem Helfer: der Schlüssel kommt einmal über den Helfer zurück, wird mit `AI_SESSION_SECRET` (AES-GCM) in D1 gelegt und nie an den Browser gegeben. Liegt für einen der vier Namen ein Secret, gewinnt das Secret.

## Vars

In `ai-panel/wrangler.jsonc` vor dem Deploy eintragen (echte Hostnamen, nicht committen, wenn der Tunnel privat bleiben soll):

```jsonc
"vars": {
  "HERMES_ORIGIN": "https://hermes.nwebnotfound.dev",
  "HELPER_ORIGIN": "https://ai-helper.nwebnotfound.dev"
}
```

Beide Werte sind `https`-URLs ohne Benutzer oder Passwort im URL. Leer oder fehlend: der jeweilige Weg antwortet mit 503.

## Tunnel auf PC-Nils

Hermes und der Helfer bleiben auf localhost. `cloudflared` auf demselben PC macht sie für den Worker erreichbar. Beispiel `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/nils/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: hermes.nwebnotfound.dev
    service: http://127.0.0.1:8787
  - hostname: ai-helper.nwebnotfound.dev
    service: http://127.0.0.1:8765
  - service: http_status:404
```

`8787` ist der Port von Hermes auf dem PC, `8765` der Helfer. Beide Prozesse binden `127.0.0.1`, nicht `0.0.0.0`.

Cloudflare Access vor beide Hostnamen, Service Token. Dieselbe Client-ID und dasselbe Secret liegen in `CF_ACCESS_CLIENT_ID` und `CF_ACCESS_CLIENT_SECRET`. Der Worker schickt sie als `CF-Access-Client-Id` und `CF-Access-Client-Secret` an Hermes und an den Helfer. Den Token nicht in den Tunnel schreiben.

Tunnel starten, falls er nicht als Dienst läuft:

```bash
cloudflared tunnel run
```

## Helfer starten

Im Verzeichnis `ai-panel`, auf PC-Nils:

```bash
HELPER_KEY='derselbe Wert wie das Worker-Secret' node helper/server.mjs
```

Optional `PORT` (Standard 8765) und `HERMES_HOME` (Standard `~/.hermes`). Der Prozess hört nur auf `127.0.0.1`.

Er ruft, jeweils als argv-Liste und mit `shell: false`:

- `hermes profile list`
- `hermes profile create <name> --clone`
- schreibt `SOUL.md` und `api_key` unter `$HERMES_HOME/profiles/<name>/` (Modus 0600)
- `hermes gateway restart`

Namen müssen `^[a-z0-9-]{1,32}$` sein. Alles andere ist 400, und `hermes` wird nicht gestartet. Der Helfer verlangt `Authorization: Bearer <HELPER_KEY>`.

## D1

Einmalig, danach die ausgegebene `database_id` in `ai-panel/wrangler.jsonc` einsetzen (der Platzhalter `00000000-0000-0000-0000-000000000000` gilt nur lokal):

```bash
npx wrangler d1 create nwebnotfound-ai --config ai-panel/wrangler.jsonc
npx wrangler d1 migrations apply nwebnotfound-ai --remote --config ai-panel/wrangler.jsonc
```

Die Migration `migrations/0001_init.sql` ist additiv (`IF NOT EXISTS`). Geloggt wird Zeit, Session, Bot, Pfad, Status, und falls die Antwort das hergibt Tokenzahlen und Kosten. Keine Prompts, keine Schlüssel.

Pro Session gelten 30 Proxy-Aufrufe (`/p/…`) je 60000 ms. Darüber `429` mit `retry_after_ms`.

## Routen

| Weg | Wer |
| --- | --- |
| `GET /` | Panel, mobil zuerst, derselbe Apple-Stil wie die Hauptseite |
| `GET /auth/login`, `GET /auth/callback`, `GET /auth/logout` | Discord, Scope `identify` |
| `GET /api/me`, `GET /api/bots`, `POST /api/bots`, `GET /api/usage` | Session |
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

Der e2e-Lauf startet wrangler und einen Mock für Discord, Hermes, OpenRouter und den Helfer. Er prüft die 403 für eine fremde Discord-ID, die Namensregeln, und dass Schlüssel weder in der Antwort noch im D1-Log stehen. In CI hängt dasselbe am Workflow `e2e`.

`AI_OAUTH_BASE` und `OPENROUTER_ORIGIN` sind nur für diesen lokalen Lauf. Der Worker benutzt sie ausschließlich, wenn die URL auf `127.0.0.1` zeigt und der Request ein Loopback-Host ist oder den Header `x-ai-local: 1` trägt. In Produktion beide weglassen.
