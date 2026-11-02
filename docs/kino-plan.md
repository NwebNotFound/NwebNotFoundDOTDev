# Online-Kino: Plan (Discord-Mitglieder only)

> **Dieses Dokument ist der Plan, nicht die Umsetzung.** Es ändert keinen Worker, kein Schema, keine Route und kein Frontend. Die Umsetzung sind die Folge-PRs in [Split](#8-split-in-folge-prs), jeder gegen `main` und jeder mit eigenen grünen Checks. Grundlage ist der Stand von `main` nach #44 (Design-System) und #45 (AI-Panel-Fixes).

**Goal:** Ein Online-Kino auf `nwebnotfound.dev/kino`, das nur Mitglieder des Discord-Servers betreten können, in dem alle im selben Raum denselben Film zur gleichen Sekunde sehen (synchron, ohne Play/Pause), mit einem Programmplan aus Staffeln (Halloween-Horror, Weihnachten), offiziellen Trailern als Vorprogramm und einem Admin auf `admin.nwebnotfound.dev`, in dem Nils Filme aus TMDB importiert und Sendungen plant.

**Architecture:** Weiterhin **ein** Cloudflare Worker (`nwebnotfound-site`, `src/worker.js`) plus D1 (`binding` `DB`). Neu: ein **Durable Object pro Raum** (`KinoRoom`) für die Synchronität, ein zweiter Host `admin.nwebnotfound.dev` als Custom Domain desselben Workers, und HLS-Dateien, die **nicht** bei Cloudflare liegen, sondern auf dem PC von Nils hinter einem `cloudflared`-Tunnel. Der Worker stellt die Segmente nur mit kurzlebigen, signierten URLs aus. Der Browser sieht den Origin-Host nie.

**Tech Stack:** Cloudflare Worker (Free), D1, Durable Objects (Free-Tier, SQLite-backed), WebSockets, Turnstile (bestehend), Discord OAuth (bestehend, `nnf_session`), Cloudflare Access (Free-Tier, bis 50 Seats), `cloudflared` auf dem PC, ffmpeg bei Rex, TMDB API v3/v4, Vanilla-JS in `public/kino/`, Tokens aus dem Design-System (#44).

## Global Constraints

- **Cloudflare Free only.** Kein Stream-Produkt, kein R2-Kostenpfad für Playback, keine bezahlten Pläne. Durable Objects laufen im Free-Tier nur als **SQLite-backed** Klassen (`new_sqlite_classes` in `wrangler.jsonc`); eine KV-backed DO-Klasse lässt sich hier nicht deployen.
- **Ein Deploy-Ziel.** Der Kino-Code kommt in den bestehenden Worker. `wrangler.jsonc` bekommt genau zwei neue Einträge: die Route `admin.nwebnotfound.dev` (Custom Domain) und das DO-Namespace-Binding `KINO_ROOMS`.
- **Kein Play/Pause, kein Seek.** Der Server entscheidet, was läuft. Ein Client kann nur die eigene Lautstärke ändern, lokal. Es gibt keinen Endpunkt, der eine Position setzt.
- **Keine öffentliche Video-URL.** Weder im HTML noch in `public/` noch in einer D1-Zeile steht ein Pfad, der ohne Signatur abrufbar ist. Der Origin-Host ist nur über den Tunnel plus Service-Token erreichbar.
- **Secrets nur per `wrangler secret put` bzw. `.dev.vars`.** Nie in `wrangler.jsonc`, nie im Repo, nie in PR-Text. `.dev.vars`, `.wrangler/`, `data/`, `backups/` bleiben uncommitted.
- **Deutschsprachige UI.** Freitext über die bestehende Escape-Funktion. Kein `alert()`/`confirm()`/`prompt()` — `<dialog>` nach DESIGN.md §8.
- **Mobile-first.** 390 px ist das Ziel, 1280 px dieselbe Fläche mit mehr Platz. Kein horizontales Scrollen, nichts abgeschnitten.
- **Löschen nur mit Nils.** Filme, Sendungen, Staffeln und Zuschauerzeilen werden deaktiviert (`archived_at`), nicht gelöscht.
- **Keine Fritzbox-Portfreigabe.** Der Origin hängt ausschließlich am ausgehenden `cloudflared`-Tunnel.

---

## 1. Architektur auf Cloudflare Free

### 1.1 Bausteine

| Baustein | Was | Wo |
| --- | --- | --- |
| Worker `nwebnotfound-site` | Seiten `/kino/*`, API `/api/kino/*`, Admin-Host, Manifest-Rewrite | `src/kino-*.js`, geroutet aus `src/worker.js` |
| D1 `DB` | Filme, Sendungen, Räume, Staffeln, Trailer, Einstellungen, Erinnerungen | `migrations/00xx_kino_*.sql` |
| Durable Object `KinoRoom` | eine Instanz pro Raum: Serveruhr, Startzeit, Anwesenheit, WebSocket-Fanout | `src/kino-room.js`, Binding `KINO_ROOMS` |
| `cloudflared` (PC Nils) | liefert `/hls/**` aus dem Ordner von Rex | nicht im Repo |
| Cloudflare Access | Schutz von `admin.nwebnotfound.dev` | Dashboard, Anwendung „Kino Admin“ |
| TMDB API | Import von Poster, Trailer, Beschreibung, Laufzeit, Bewertung | serverseitig im Worker |

Der Browser spricht nur mit `nwebnotfound.dev`. Er spricht nie mit dem Origin und nie mit TMDB.

### 1.2 Datenmodell (D1)

Alle Zeiten als **ganzzahlige Unix-Millisekunden** (`INTEGER`), wie bei `mc_vip_commands`. Kein `datetime('now')` in Kino-Tabellen, damit Client, DO und Bot dieselbe Einheit sehen.

```
kino_films        id TEXT PK (ULID), tmdb_id INTEGER UNIQUE, slug TEXT UNIQUE,
                  title TEXT, original_title TEXT, year INTEGER, runtime_min INTEGER,
                  overview TEXT, poster_path TEXT, backdrop_path TEXT,
                  vote_average REAL, release_date TEXT, genres TEXT (JSON),
                  hls_path TEXT, trailer_youtube_id TEXT, trailer_checked_at INTEGER,
                  created_at INTEGER, archived_at INTEGER NULL

kino_seasons      id TEXT PK, slug TEXT UNIQUE, name TEXT, starts_on TEXT, ends_on TEXT,
                  accent TEXT ('horror'|'christmas'|'neutral'), created_at INTEGER

kino_shows        id TEXT PK, film_id TEXT REFERENCES kino_films(id),
                  season_id TEXT NULL, starts_at INTEGER, ends_at INTEGER (berechnet),
                  status TEXT ('draft'|'published'|'live'|'ended'|'cancelled'),
                  room_id TEXT REFERENCES kino_rooms(id), note TEXT,
                  created_at INTEGER, updated_at INTEGER
                  INDEX (starts_at), INDEX (season_id), INDEX (film_id)

kino_rooms        id TEXT PK, slug TEXT UNIQUE, name TEXT, do_name TEXT UNIQUE,
                  capacity INTEGER, is_default INTEGER, created_at INTEGER

kino_trailers     film_id TEXT, youtube_id TEXT, language TEXT, name TEXT,
                  official INTEGER, position INTEGER, PRIMARY KEY (film_id, youtube_id)

kino_settings     key TEXT PK, value TEXT, updated_at INTEGER
                  -- u.a. kino.guild_id, kino.role_id, kino.role_mode, kino.access_cache_ttl_s

kino_access_cache discord_id TEXT PK, has_role INTEGER, checked_at INTEGER, source TEXT

kino_reminders    id TEXT PK, show_id TEXT, discord_id TEXT, created_at INTEGER,
                  state TEXT ('pending'|'claimed'|'sent_1h'|'sent_15m'|'cancelled'),
                  claimed_at INTEGER NULL, PRIMARY KEY (id), UNIQUE (show_id, discord_id)
```

`kino_trailers` ist die von Nils geforderte Trailerliste, getrennt von `kino_films`, damit ein Film mehrere Sprachen und mehrere Fassungen haben kann und die Prüfung (`official`, `type=Trailer`) nachvollziehbar bleibt.

### 1.3 Durable Object pro Raum

Ein `Durable Object` pro Raum (`idFromName(room.do_name)`), nicht pro Sendung: der Raum überlebt die Sendung und trägt die Anwesenheit.

Zustand (SQLite-Storage, klein gehalten):

```js
{ showId, startsAt,   // ms, Quelle: kino_shows.starts_at
  filmId, hlsManifest, // signierter Pfad ohne Host
  endsAt, revision }   // revision++ bei jedem Wechsel
```

Regeln:

- **Die Uhr ist der Server.** Der DO liefert bei jedem Verbindungsaufbau `serverNow`, `startsAt` und `endsAt`. Der Client rechnet den Offset aus drei Ping/Pong-Paaren (Median) und leitet die Position ausschließlich daraus ab: `position = clamp(serverNow + offset − startsAt, 0, dauer)`.
- **Kein Schreibbefehl aus dem Browser.** Akzeptierte Nachrichten sind genau: `join`, `ping`, `presence`. Alles andere wird verworfen und gezählt. Es gibt kein `play`, `pause`, `seek`, `muteOthers`.
- **Lautstärke ist lokal.** Der Slider schreibt in den Client, nicht in den DO. Kein Feld, kein Broadcast.
- **Driftkorrektur clientseitig.** Liegt die Abweichung über 2 s, springt der Player auf das nächste Keyframe (`hls.currentLevel` + `seek`). Zwischen 250 ms und 2 s wird `playbackRate` auf 0.98 bzw. 1.02 gesetzt, nach 5 s zurück auf 1.0. `prefers-reduced-motion` ändert daran nichts, weil es kein UI-Effekt ist.
- **Anwesenheit:** Der DO hält die Menge der offenen Sockets (Hibernation-API, `state.acceptWebSocket`), zählt je Socket die `discord_id` (aus dem signierten Ticket) und sendet bei Join/Leave ein `{type:"presence", viewers:n}` an alle. Live-Zahl ohne Polling.
- **Hibernation:** WebSocket-Hibernation ist Pflicht, damit ein Abend mit 20 Zuschauern nicht 20-mal Dauer in Rechnung stellt. Der DO darf zwischen zwei Events keinen Timer brauchen; Aufräumen passiert bei `alarm()` bzw. beim nächsten Event.
- **Raum leer:** Geht die letzte Verbindung, bleibt `startsAt` stehen. Der nächste Zuschauer kommt mitten in den Film — genau wie im echten Kino.

### 1.4 HLS vom PC über den Tunnel

- Rex baut pro Film das Transcoding und den Ordner: eine Leiter `1080p` (4.5 Mbps) und `720p` (2.5 Mbps), H.264 High + AAC-LC 128k, **4-Segment-GOP, 4 s Segmente, Keyframes auf jeder Segmentgrenze**, `master.m3u8` plus Varianten, alles mit `#EXT-X-INDEPENDENT-SEGMENTS`.
- Der Ordner liegt unter `<kino-root>/hls/<film_id>/` — die `film_id` ist die ULID aus `kino_films`, damit Ordner und Datenbank ohne Mapping zusammenpassen. `hls_path` in der DB ist relativ: `/hls/<film_id>/master.m3u8`.
- `cloudflared` veröffentlicht nur diesen Ordner (lokales `http`-Origin auf `127.0.0.1`), dazu Cloudflare Access mit **Service-Token** auf dem Origin-Hostnamen. Der Hostname hat keine öffentliche DNS-Auflösung ohne Access; `origin.kino.nwebnotfound.dev` existiert für Zuschauer nicht.
- Der Worker holt das Manifest mit `CF-Access-Client-Id`/`CF-Access-Client-Secret` (als Secrets), schreibt die Playlist um und liefert sie mit `Cache-Control: no-store`. Segmente liefert der Worker als 302 auf eine signierte URL **oder** streamt durch — Entscheidung in §1.4.
- Nils' Upload-Ablauf: Ordner ablegen, Admin sagt „Film ist bereit“ → `hls_path` gesetzt, `hls_ready=1`. Kein Upload über die Website.

### 1.5 Signierte, kurzlebige Segment-URLs

Signatur = HMAC-SHA256 über `film_id | pfad | exp | session_hash | room_id`, Schlüssel `KINO_SIGNING_KEY` (Secret, 32 Byte, rotierbar über eine zweite Key-ID im Pfad).

```
/hls/<film_id>/<pfad>?exp=<ms>&sid=<session-hash>&k=<key-id>&sig=<base64url>
```

- TTL: **120 s** auf Segmente, **30 s** auf Playlists. Ein kopierter Link läuft ab, bevor er sich lohnt.
- Bindung an Session und Raum: derselbe Link aus einem anderen Konto oder einem anderen Raum ist ungültig.
- Der Worker prüft Signatur, `exp`, Session und **die laufende Sendung** (`now` zwischen `starts_at` und `ends_at`). Nach dem Abspann ist auch ein gültig signiertes Segment tot.
- Kein CORS auf dem Origin. `Referer` wird nicht als Sicherheitsmerkmal benutzt.

---

## 2. Zugang

### 2.1 Discord OAuth plus Rollenprüfung

- Bestehender Login bleibt: `/auth/discord/login|callback|logout`, Cookie `nnf_session` (`HttpOnly; Secure; SameSite=Lax; Domain=.nwebnotfound.dev`), Session in `sessions`.
- **Rollenprüfung serverseitig im Worker**, nicht im Browser. Zwei zulässige Wege, konfigurierbar in `kino_settings`:

| `role_mode` | Prüfung | Bemerkung |
| --- | --- | --- |
| `bot` (Default) | `GET https://discord.com/api/v10/guilds/{guild_id}/members/{discord_id}` mit `Authorization: Bot <DISCORD_BOT_TOKEN>`, dann `roles[]` gegen `role_id` | kein zusätzlicher Consent, funktioniert auch wenn der Nutzer Rollen versteckt; Bot muss im Server sein |
| `user` | OAuth-Scope `guilds.members.read`, danach `GET /users/@me/guilds/{guild_id}/member` mit dem User-Token | braucht Re-Consent aller Nutzer, Token nicht speichern |

Empfehlung: `bot`. Der `guild_id` und `role_id` stehen in `kino_settings` (nicht im Code), damit Nils die Rolle in der Admin ändern kann, ohne zu deployen. Cache in `kino_access_cache` mit TTL aus `kino.access_cache_ttl_s` (Default 300 s), damit ein Abend nicht 200 Discord-Calls kostet. Ergebnis wird bei jedem Raum-Join frisch geprüft, wenn der Cache älter als die TTL ist.

- Ohne Rolle: Seite `/kino/zugang` mit Erklärung („Tritt dem Discord bei und lass dir die Kino-Rolle geben“), kein 403-Blank. API antwortet `403 {error:"no_role"}` — der Browser zeigt den Hinweis, er entscheidet nichts.
- Abmelden bleibt der bestehende Logout.

### 2.2 `admin.nwebnotfound.dev`

Zwei Schichten, beide Pflicht:

1. **Cloudflare Access** vor dem Host, Policy „Allow“ nur für `nils`' Discord-/Mail-Identität, Sitzungsdauer 24 h, kein Bypass-Pfad, kein `*.nwebnotfound.dev`-Wildcard in der Anwendung.
2. **Worker-Check** auf jedem Admin-Request: `CF-Access-JWT-Assertion` gegen die Access-JWKS prüfen (`aud` = Application Audience Tag aus `ACCESS_AUD`, `iss` = Team-Domain, `exp`), **und** die Discord-Session muss zur Allowlist passen (`ADMIN_DISCORD_ID` als Secret). Fehlt einer der beiden Beweise → 404, nicht 403 (kein Hinweis, dass es die Seite gibt).

Der Admin-Host ist eine eigene Route im selben Worker; `hostOk` (Zeile ~418 in `src/worker.js`) akzeptiert bereits Subdomains von `nwebnotfound.dev`, die Pfadprüfung muss aber explizit auf den Admin-Host zeigen statt auf den Apex. Kein Kino-Admin-Link auf der öffentlichen Seite.

---

## 3. Vorprogramm (Trailer)

- Gezeigt werden **nur offizielle Trailer angekündigter Filme**. Quelle: `GET https://api.themoviedb.org/3/movie/{tmdb_id}/videos?include_video_language=de,en,null`, Filter `site === "YouTube"`, `type === "Trailer"`, `official === true`. Alles andere (`Teaser`, `Clip`, `Featurette`, Fan-Uploads) wird verworfen, auch wenn es hübsch aussieht.
- Ablage in `kino_trailers` mit `position`; maximal drei pro Film, der erste ist der Standard.
- Einbettung über `https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1&playsinline=1`. Kein Autoplay mit Ton (`mute=1` beim Autoplay, Ton nach Klick wie im Kino).
- Vorprogramm läuft **bis `startsAt`**: Der Client startet die Trailerliste `T − X` Minuten vorher (X = Länge der Trailer, gedeckelt auf 10 Minuten) und blendet 30 s vor Start einen Countdown ein. Kein eigenes Intro, kein Werbeblock, keine „Wir sind gleich zurück“-Karte.
- **Ehrliche Grenze:** YouTube-Embeds können Werbung zeigen. Das ist mit Bordmitteln nicht abschaltbar, ohne den Trailer selbst zu hosten. Siehe Open Questions 1.
- CSP muss `frame-src https://www.youtube-nocookie.com` erlauben; sonst bleibt der Rahmen leer und es sieht wie ein Bug aus.

---

## 4. Admin

Vier Flächen, alle unter `admin.nwebnotfound.dev`, alle mobil bedienbar (`/kino`-Admin wird auf dem Handy benutzt, wenn Nils unterwegs etwas verschiebt).

**4.1 Filmauswahl und TMDB-Import.** Suche über `GET /3/search/movie?language=de-DE`, Trefferliste mit Poster, Jahr, Laufzeit. Ein Klick importiert `title`, `original_title`, `release_date`, `runtime`, `overview`, `poster_path`, `backdrop_path`, `vote_average`, `genres` sowie die Trailerliste nach §3. Poster über `https://image.tmdb.org/t/p/w500` (nicht `original`, das kostet nur Bytes). Der Import ist idempotent (`tmdb_id UNIQUE`, Upsert), ein zweiter Klick aktualisiert statt zu duplizieren. Angezeigt wird `poster_path`, nie eine lokal gespeicherte Kopie — TMDB-CDN ist erlaubt und Free.

**4.2 Programmplaner mit Staffeln.** Wochenansicht (Mo–So), Slots als Karten, Drag auf einen Abend. Eine Sendung ist `film_id + starts_at + room`. Beim Speichern prüft der Server: kein Overlap im selben Raum, Film ist `hls_ready`, Startzeit liegt in der Zukunft (oder Nils bestätigt „jetzt starten“, was `starts_at = now + 120 s` setzt). Staffeln (`kino_seasons`) sind Zeitfenster mit eigenem Akzent: **Halloween-Horror** (01.10.–02.11.) und **Weihnachten** (01.12.–06.01.). Eine Sendung in einer Staffel erbt deren Akzent im Programm. `status` steuert Sichtbarkeit: `draft` sieht nur die Admin, `published` steht im Programm.

**4.3 Neue Filme regelmäßig.** Filme mit `release_date` in den letzten 90 Tagen sind „neu“ und sollen einige Wochen regelmäßig laufen. Der Planer zeigt sie als Vorschlagsreihe („Neu und regelmäßig“) mit einem Klick für „3 Wochen, jeden Freitag 20:30“. Das ist eine Vorlage, keine Automatik — Nils bestätigt jeden Block.

**4.4 Vorschlagsalgorithmus (später, PR K9).** Nur Vorschläge, nie automatische Veröffentlichung. Score:

```
score = 0.40 * (vote_average / 10)
      + 0.25 * saison_passung(film.genres, aktive_staffel)
      + 0.20 * abwechslung(tage seit letzter ausstrahlung, gedeckelt bei 60)
      + 0.15 * (1 - bereits_geplant_in_den_naechsten_14_tagen)
```

Die Admin zeigt die Top 10 mit Begründung („Horror, Staffel Halloween, 71 Tage nicht gelaufen“). Nils nimmt einzeln oder als Block an. Kein Auto-Publish, kein Mailversand ohne Klick.

---

## 5. API-Verträge

Alle Kino-Zeiten sind **Millisekunden**. Fehlerformat wie bestehend: `{ "error": "<code>" }`, deutschsprachiger Text nur im HTML.

### 5.1 Öffentlich (Session + Rolle)

| Route | Zweck |
| --- | --- |
| `GET /api/kino/program?from=&to=` | veröffentlichte Sendungen im Fenster (`max 31 Tage`) |
| `GET /api/kino/film/<slug>` | Filmdetail inkl. Trailerliste (nur `youtube_id`, keine Streams) |
| `GET /api/kino/show/<id>` | eine Sendung, `starts_at`, `ends_at`, `room`, `viewers` (aus DO, best effort) |
| `POST /api/kino/room/<slug>/ticket` | kurzlebiges WS-Ticket (60 s) für den DO; nur mit Rolle und laufender/kommender Sendung |
| `GET /api/kino/reminders` / `POST` / `DELETE` | Erinnerungen des eingeloggten Nutzers (siehe 5.3) |

### 5.2 Mit Rex (Origin / Transcoding)

Vertrag, den Rex baut und der Worker konsumiert:

- **Ablage:** `<kino-root>/hls/<film_id>/master.m3u8`, Varianten `720p/index.m3u8`, `1080p/index.m3u8`, Segmente `seg_00001.ts`. `<film_id>` ist die ULID, die der Worker beim Anlegen des Films vergibt und die Nils/Rex im Admin sehen („Film-ID kopieren“).
- **Manifest:** absolute Pfade relativ zum Filmordner (`720p/index.m3u8`), `#EXT-X-VERSION:3`, `#EXT-X-INDEPENDENT-SEGMENTS`, `#EXT-X-TARGETDURATION:4`.
- **Auth zwischen Tunnel und Worker:** `cloudflared` veröffentlicht nur `origin.kino.nwebnotfound.dev` mit Access-Service-Token. Der Worker sendet `CF-Access-Client-Id` + `CF-Access-Client-Secret` (beide Secrets, nie im Repo). Zusätzlich `x-kino-origin: 1`; der Origin darf ohne diesen Header nichts ausliefern. Kein Query-Token im Pfad, kein Basic-Auth mit geteiltem Passwort in der URL.
- **Bereitschaft:** Rex legt nach dem Encode `<>/<film_id>/ready.json` mit `{ "segments": n, "duration_s": n, "ladder": ["720p","1080p"], "built_at": ms }` ab. Der Worker liest diese Datei einmalig beim „Film bereit“-Setzen in der Admin und speichert `duration_s` — daraus kommt `ends_at`.
- **Kein Rückkanal.** Der Origin schreibt nie in die D1. Alles, was der Worker wissen muss, steht in `ready.json` oder kommt von Nils.

### 5.3 Mit Dex (Bot „Moci“)

Zwei Wege, beide über denselben Token wie die bestehenden Ingest-Routen (`x-bot-token` als eigenes Secret `KINO_BOT_TOKEN`, **nicht** `MC_INGEST_TOKEN` wiederverwenden):

1. **Tagesplan (pull):** `GET /api/kino/bot/schedule?day=YYYY-MM-DD` (Europe/Berlin, `Accept: application/json`). Antwort:
   ```json
   { "day": "2026-11-07", "shows": [
     { "show_id": "...", "film": "Film", "starts_at": 1794000000000, "ends_at": 1794006000000,
       "room": "hauptsaal", "season": "halloween", "join_url": "https://nwebnotfound.dev/kino/raum/hauptsaal",
       "trailer_start_at": 1793999400000 } ] }
   ```
   Leerer Tag → `{ "day": "...", "shows": [] }`, nie 404. Der Bot pollt höchstens einmal pro 5 Minuten; der Worker cacht die Antwort 60 s.

2. **Erinnerungen (pull + ack):** Der Worker hält die Abos in `kino_reminders`, der Bot holt fällige Zeilen mit `GET /api/kino/bot/reminders/due?window=15m` (liefert `show_id, discord_id, kind` mit `kind ∈ {1h,15m}`), schickt die DM und bestätigt mit `POST /api/kino/bot/reminders/ack` (`[{id, state:"sent_1h"|"sent_15m"|"failed"}]`). Regeln wie beim bestehenden Ack: fehlt eine ID, bleibt die Zeile `claimed`; `claimed` läuft nach 10 Minuten zurück auf `pending`; DM-Text nennt Filmtitel, Uhrzeit, Raum und `join_url`. **Zustellung ist genau einmal je Art** — der Bot bestätigt erst nach erfolgreicher DM. Ein Abo ohne Rolle wird beim Ablaufzeitpunkt nicht bedient (`state:"cancelled"`, Grund `no_role`).
   Der Worker verschickt **keine** DMs selbst; er hat keinen Gateway-Zugang. Verantwortung für Zeitgenauigkeit liegt beim Bot (Poll alle 60 s im 15-Minuten-Fenster).

Nils' Zustimmung nötig, bevor Dex das umsetzt — der Vertrag steht hier, die Bot-Seite ist PR von Dex.

---

## 6. Design (nach `DESIGN.md` aus #44)

Grundlage: `DESIGN.md` im Repo-Root (kommt mit #44). Daraus gilt für Kino:

- Tokens nur `--ds-*`: `--ds-background`, `--ds-surface`, `--ds-foreground`, `--ds-muted-foreground`, `--ds-border`, `--ds-primary`, `--ds-radius`. Kein Raw-Farbwert, kein Raw-Radius in einer Komponente.
- **Ein Akzent** pro Fläche: `--ds-primary` (Blau). Staffel-Akzente (Halloween, Weihnachten) sind **Stimmungsfarbe als Flächen-Ton**, kein zweiter Interaktionsakzent: sie tönen nur Poster-Rahmen und Staffel-Chip, Buttons bleiben `--ds-primary`.
- Eine Systemschrift (`system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif`), kein Webfont. Filmtitel groß und eng (`-0.02em`), aber Systemschrift.
- 8-pt-Rhythmus, weiche Radien und Schatten, echte Dark-Mode-Palette (`prefers-color-scheme`), WCAG AA (Poster-Titel immer mit Textschatten-Fallback, nie Text auf unruhigem Poster ohne Scrim).
- Motion 150–250 ms, nur `opacity`/`transform`, alles aus unter `prefers-reduced-motion: reduce`.
- Player: Vollbild über `<dialog>` bzw. `requestFullscreen`, Steuerung nur **Lautstärke + Vollbild + Verlassen**. Keine Zeitleiste, kein Play/Pause-Knopf, weil es keinen Zustand gibt, den der Client setzen könnte. Eine dünne „läuft seit“-Anzeige ist erlaubt (rein informativ).
- Live-Zuschauerzahl als ruhiger Chip oben rechts, `aria-live="polite"`, keine Animation außer einem 200-ms-Fade bei Änderung.
- `screenshots/` mit 390/1280 × hell/dunkel je Seite, plus Checklisten-Notiz im PR (Regel aus dem Briefing).

### Seiten und Wireframes (Liste, keine Pixel)

**Öffentlich (`nwebnotfound.dev`)**

1. `/kino` — Programm. Kopf: nächstes Event mit Countdown und „Erinnern“-Button; darunter Tagesliste (Poster, Titel, Uhrzeit, Staffel-Chip, Zuschauerzahl), Staffel-Filter als Pills.
2. `/kino/film/<slug>` — Filmdetail: Backdrop mit Scrim, Titel, Jahr/Laufzeit/Bewertung, Beschreibung, Trailer-Karte (ein Klick, `nocookie`), Termine, „Erinnern“.
3. `/kino/raum/<slug>` — der Saal. Zustände: **Countdown** (Vorprogramm läuft / „Start in 12 Min“), **Live** (Player + Lautstärke + Vollbild + Zuschauer), **Beendet** (Abspann-Hinweis, nächste Sendung, Programm-Link), **Zugang** (keine Rolle, Discord-Hinweis).
4. `/kino/saison/<slug>` — Staffel-Übersicht: Hero mit Staffelfarbe, Filmliste, „läuft bis …“.
5. `/kino/zugang` — Erklärung Rolle + Discord-Button, ruhige Fehlerseite statt 403.
6. `/kino/verpasst` — zuletzt gelaufene Filme mit „nächster Termin folgt“ (kein Replay, kein On-Demand-Abruf).

**Admin (`admin.nwebnotfound.dev`)**

7. `/` — Dashboard: heute/ morgen geplant, Filme ohne `hls_ready`, offene Erinnerungen, Zuschauerzahlen von gestern.
8. `/filme` — Liste mit Suche, Filter „neu“, Status `hls_ready`, Aktion „Termin planen“.
9. `/filme/import` — TMDB-Suche, Treffer, Import-Vorschau (Poster, Laufzeit, Trailer, Bewertung), ein „Importieren“.
10. `/filme/<id>` — Detail: Metadaten, Trailerliste (mehrere, Reihenfolge), Film-ID zum Kopieren für Rex, `hls_ready` setzen.
11. `/planer` — Wochenansicht, Ziehen auf Abend, Konfliktprüfung inline, „veröffentlichen“.
12. `/saisons` — Staffeln anlegen (Zeitraum, Akzent), Filme zuordnen, Neu-Vorschläge.
13. `/vorschlaege` — Top 10 mit Begründung, einzeln/als Block annehmen (PR K9).
14. `/einstellungen` — Discord `guild_id`, `role_id`, `role_mode`, Cache-TTL, Raum-Namen, Default-Raum.
15. Zustände je Seite: leer, laden (Skeleton), Fehler mit Wiederholen — keine leere Fläche ohne Text.

---

## 7. Secrets und Sicherheit

### 7.1 Secrets (alle per `wrangler secret put`, lokal in `.dev.vars`)

| Name | Zweck |
| --- | --- |
| `TMDB_API_KEY` | TMDB Read Access Token (v4 Bearer) — serverseitig |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | bestehend, Login |
| `SESSION_SECRET` | bestehend, Session-Signatur |
| `DISCORD_BOT_TOKEN` | Rollenprüfung (§2.1) |
| `ADMIN_DISCORD_ID` | Allowlist für den Admin-Host |
| `ACCESS_AUD` | Audience Tag der Access-Anwendung |
| `ACCESS_TEAM_DOMAIN` | z. B. `nils.cloudflareaccess.com` (JWKS/Certs) |
| `KINO_SIGNING_KEY`, `KINO_SIGNING_KEY_ID` | Segment-Signatur, rotierbar |
| `KINO_ORIGIN_CF_ID`, `KINO_ORIGIN_CF_SECRET` | Access-Service-Token zum Origin |
| `KINO_BOT_TOKEN` | API für Dex/Moci |

Kein Schlüssel steht in `wrangler.jsonc` (dort nur Routen und Bindings), im HTML, in `public/`, in `screenshots/` oder in einem PR-Text. Der Import-Fehler „key in repo“ ist ein Review-Blocker, kein Nit.

### 7.2 Rate Limits (D1- oder DO-Zähler, Fenster 60 s)

| Fläche | Limit |
| --- | --- |
| `POST /api/kino/room/*/ticket` | 6 pro Discord-ID / 10 pro IP pro Minute |
| Manifest-/Playlist-Requests | 30 pro Session pro Minute (ein normaler Player braucht ~2) |
| Segment-Requests | 120 pro Session pro Minute |
| `GET /api/kino/program` | 60 pro IP pro Minute |
| Admin-Schreibaktionen | 30 pro Minute, 429 mit Retry-Hinweis |
| Bot-API | 60 pro Minute, zusätzlich `x-bot-token` |

Antwort bei Überschreitung: `429 { "error": "rate_limited", "retry_after_s": n }`, kein stilles Leerlaufen.

### 7.3 CSP und Header

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: https://image.tmdb.org;
  media-src 'self' blob:;
  frame-src https://www.youtube-nocookie.com;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'self';
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
```

Der Kino-Bereich bekommt diese CSP **enforcing** (nicht Report-Only wie im Altbestand), weil er neu ist und keine Altinline-Skripte trägt.

### 7.4 Keine exponierten Video-URLs

- Kein `hls_path` mit Host in HTML oder JSON; API liefert nur Signatur-Pfade mit `exp`, niemals den Origin.
- Keine CORS-Header auf dem Origin; kein `Access-Control-Allow-Origin: *` irgendwo.
- Segmente nur bei laufender Sendung, Signatur an Session und Raum gebunden, TTL 120 s.
- `ready.json` und der HLS-Ordner sind über den öffentlichen Host nicht erreichbar (Access-Policy auf dem Origin-Hostnamen, kein Wildcard).
- Admin-Host antwortet ohne beide Beweise mit 404.

---

## 8. Split in Folge-PRs

Reihenfolge nach Merge von **#44** (Design-System, liefert `DESIGN.md` und `--ds-*`) und **#45** (AI-Panel-Fixes). Jeder PR: Branch → PR → grüne Checks → Deploy durch Nils' Freigabe. Kein PR enthält einen zweiten Themenkreis.

| PR | Inhalt | Abhängig von | Deploy? |
| --- | --- | --- | --- |
| **docs/kino-plan** (dieser) | Nur dieses Dokument | – | nein |
| **K1** `feat/kino-schema` | Migrationen `kino_*`, `wrangler.jsonc` (Admin-Route, DO-Binding `new_sqlite_classes`), leere Routen, `kino_settings` mit Defaults | #44, #45 | Migration mit Export vorher |
| **K2** `feat/kino-access` | Rollenprüfung (`bot`/`user`), Cache, `/kino/zugang`, `/api/kino/me`, Admin-Host mit Access-JWT + Allowlist, CSP enforcing | K1 | ja, Secrets vorher setzen |
| **K3** `feat/kino-rooms` | `KinoRoom` DO, WS-Ticket, Hibernation, Presence, Uhr-Offset im Client, Saal-Seite mit Countdown/Live/Ende | K2 | ja |
| **K4** `feat/kino-hls` | Manifest-Rewrite, Segment-Signatur, Origin-Fetch über Access-Service-Token, Caps und Rate-Limits | K3 | ja, zusammen mit Rex' `ready.json` |
| **K5** `feat/kino-admin-films` | TMDB-Suche/Import, Trailerfilter, Filmliste, `hls_ready`, Film-ID-Anzeige | K2 | ja |
| **K6** `feat/kino-planner` | Wochenplaner, Konfliktprüfung, Veröffentlichen, Staffeln, „neu und regelmäßig“ | K5 | ja |
| **K7** `feat/kino-bot-api` | `/api/kino/bot/schedule` + `reminders/due` + `ack` (Verträge aus §5.3) | K6 | ja |
| **K8** `feat/kino-reminders` | Abo-UI auf Programm/Film, Erinnerungsverwaltung, Ablauf ohne Rolle | K7 | ja |
| **K9** `feat/kino-suggestions` | Scoring + `/vorschlaege`, Bestätigung durch Nils | K6 | ja |
| **K10** `feat/kino-polish` | Screenshots 390/1280 × hell/dunkel, AA-Gate, leere Zustände, Feinschliff | alle | nein (nur Doku/Bilder) |

**Merge-Reihenfolge:** #44 → #45 → K1 → K2 → K3 → K4 (parallel K5 nach K2 möglich) → K6 → K7 → K8 → K9 → K10. K4 darf erst mergen, wenn der Tunnel steht und `ready.json` für mindestens einen Film existiert; sonst ist die Saal-Seite ein schwarzer Kasten und der Deploy sieht wie ein Fehler aus.

**Bekannte Ausnahme bei Checks:** der Playwright-Runner-Fehler auf der Website (`ModuleNotFoundError: playwright`) ist kein Kino-Thema, muss aber je PR mit Begründung im Text stehen, wenn er als einziger rot ist.

## 9. Risiken (kurz)

- **Free-Tier-Grenzen der DO:** Requests pro Tag und SQLite-Storage sind begrenzt; ein Abend mit 20 Zuschauern ist unkritisch, ein Dauerbetrieb mit Presence-Pings nicht. Pings daher auf 10 s, Presence nur bei Änderung.
- **Uhr auf dem PC von Nils:** HLS-Segmente kommen mit Verzögerung, wenn die Leitung schwankt. Der Client puffert 6 s; die Position kommt aus der DO-Uhr, nicht aus dem Puffer.
- **Ein Origin, ein Flaschenhals.** Wenn Nils' PC schläft, ist der Saal leer. Das ist ein Betriebsrisiko, kein Codefehler — im Admin als Status „Origin offline“ sichtbar.

## 10. Open Questions

1. **Werbung vor YouTube-Trailern.** „Keine Werbung“ ist mit `youtube-nocookie`-Embeds nicht garantierbar; YouTube entscheidet. Optionen: (a) Werbung als Kino-Realität akzeptieren, (b) Rex schneidet die Trailer lokal und liefert sie als kleines HLS-Vorprogramm (lizenzrechtlich heikel), (c) Trailer nur als Poster-Karte ohne Abspielen. Empfehlung: (a) jetzt, (c) als Fallback, (b) nur mit Nils' Entscheidung.
2. **Rolle: `bot` oder `user`?** Hängt davon ab, ob Moci bereits im Discord-Server ist und `Manage Roles`/`View Members` hat. Ohne Bot-Token bleibt nur der User-Scope, der alle Nutzer zu einem neuen Consent zwingt.
3. **Wer darf senden?** Nur Nils, oder auch Mods? Der Plan geht von „nur Admin“ aus; eine zweite Rolle (`kino_host`) wäre ein Aufwasch in K2.
4. **Zuschauerzahl öffentlich?** Chip im Saal ja. Auf dem Programm erst ab einer Schwelle (z. B. ab 3), damit ein leerer Saal nicht traurig aussieht — Nils entscheidet.
5. **Ein Raum oder mehrere?** Der Plan sieht mehrere Räume (`kino_rooms`) mit einem Default „Hauptsaal“ vor. Kosten und Verwirrung steigen mit jedem Raum; Start mit einem ist legitim.
6. **Aufbewahrung.** Wie lange bleiben Sendungen und Erinnerungen? Vorschlag: Sendungen unbegrenzt (Archiv für `/kino/verpasst`), Erinnerungen 30 Tage nach `ends_at`, Access-Cache 5 Min. Löschen nur mit Nils.
7. **Trailer-Sprache.** Deutsch bevorzugt, Englisch als Fallback — oder nur Deutsch? Beeinflusst, welche Filme überhaupt importierbar sind.
8. **Rechtliches.** Öffentliches Vorführen von Filmen für einen geschlossenen Discord-Kreis ist dennoch ein Aufführungsrecht-Thema. Vor dem ersten echten Abend mit Nils klären; der Plan liefert die Technik, nicht die Lizenz.
9. **`ends_at` Genauigkeit.** Kommt aus `ready.json` (`duration_s`). Weicht die echte Wiedergabe ab, endet die Segment-Signatur zu früh oder zu spät. Vorschlag: `ends_at = starts_at + duration_s*1000 + 120000` Puffer.
10. **Backup.** Für das Kino relevant sind D1-Zeilen (klein) und `ready.json`/HLS-Ordner (groß, lokal). Reicht ein monatlicher D1-Export nach `backups/`, oder braucht Rex einen eigenen Ablageplan?
