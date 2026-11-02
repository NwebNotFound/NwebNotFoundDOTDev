# Online-Kino: Plan (Discord-Mitglieder only)

> **Dieses Dokument ist der Plan, nicht die Umsetzung.** Es ändert keinen Worker, kein Schema, keine Route und kein Frontend. Die Umsetzung sind die Folge-PRs in [Split](#8-split-in-folge-prs), jeder gegen `main` und jeder mit eigenen grünen Checks. Grundlage ist der Stand von `main` nach #44 (Design-System) und #45 (AI-Panel-Fixes). Stand 03.11.2026, zweite Runde: zusammengeführt mit dem Review zu #48 und mit mc-stack#119 — Identität der Dateien ist der `file_hash`, der Watcher meldet über eine signierte Ingest-Schnittstelle (§5.3), Auslieferung ohne 302 mit rollendem Playlist-Fenster (§1.5), Werbung ist entschieden (keine, §3), R2 und Tunnel stehen nur als Optionen in §9.1. Nils' Vorgaben bleiben: nichts von Hand pflegen, Trailer nur aus dem TMDB-Videos-Endpunkt, Dateiabgleich gegen den Filmordner, TMDB-Token nur im Vault.

**Goal:** Ein Online-Kino auf `nwebnotfound.dev/kino`, das nur Mitglieder des Discord-Servers betreten können, in dem alle im selben Raum denselben Film zur gleichen Sekunde sehen (synchron, ohne Play/Pause), mit einem Programmplan aus Staffeln (Halloween-Horror, Weihnachten), offiziellen TMDB-Trailern als Vorprogramm und einem Admin auf `admin.nwebnotfound.dev`, in dem Nils **nichts von Hand pflegt**: Er tippt einen Filmtitel ein oder wählt eine Datei aus `C:\Users\nilsw\kino\filme`, und der Import holt Poster, Backdrop, Beschreibung, Laufzeit, Genre, Bewertung und Trailer aus TMDB und legt sie in D1 ab. Was nicht automatisch zuzuordnen ist, steht als offene Zeile im Admin — nachziehen, nicht eintippen.

**Architecture:** Weiterhin **ein** Cloudflare Worker (`nwebnotfound-site`, `src/worker.js`) plus D1 (`binding` `DB`). Neu: ein **Durable Object pro Raum** (`KinoRoom`) für die Synchronität, ein zweiter Host `admin.nwebnotfound.dev` als Custom Domain desselben Workers, und HLS-Dateien, die **nicht** bei Cloudflare liegen, sondern auf dem PC von Nils hinter einem `cloudflared`-Tunnel. Der Worker stellt die Segmente nur mit kurzlebigen, signierten URLs aus. Der Browser sieht den Origin-Host nie.

**Tech Stack:** Cloudflare Worker (Free), D1, Durable Objects (Free-Tier, SQLite-backed), WebSockets, Turnstile (bestehend), Discord OAuth (bestehend, `nnf_session`), Cloudflare Access (Free-Tier, bis 50 Seats), `cloudflared` auf dem PC, ffmpeg bei Rex, TMDB API v3/v4, Vanilla-JS in `public/kino/`, Tokens aus dem Design-System (#44).

## Global Constraints

- **Cloudflare Free only.** Kein Stream-Produkt, keine bezahlten Pläne. R2 ist **deaktiviert** und wird nicht angefasst, bis Nils selbst ein Zahlungsmittel hinterlegt und die Aktivierung ausdrücklich freigibt (§9.1 Plan A); bis dahin wird lokal bzw. gegen Mocks entwickelt. Durable Objects laufen im Free-Tier nur als **SQLite-backed** Klassen (`new_sqlite_classes` in `wrangler.jsonc`); eine KV-backed DO-Klasse lässt sich hier nicht deployen.
- **Der `file_hash` ist die Identität einer Datei, die `film_id` die eines Films.** Der Watcher und der Origin kennen nur den sha256 der Master-Datei und arbeiten mit `hls\<file_hash>\`; die ULID `film_id` vergibt ausschließlich der Worker (§5.3). Kein Ordnername, kein Kopieren einer ID von Hand — eine umbenannte Datei bleibt derselbe Datensatz, ein zweiter Encode derselben Bytes ist derselbe Job.
- **Ein Deploy-Ziel.** Der Kino-Code kommt in den bestehenden Worker. `wrangler.jsonc` bekommt genau zwei neue Pflicht-Einträge: die Route `admin.nwebnotfound.dev` (Custom Domain) und das DO-Namespace-Binding `KINO_ROOMS`; optional dazu das `ratelimits`-Binding, falls die Rate-Limits dort und nicht im DO gezählt werden (§7.2).
- **Kein Play/Pause, kein Seek.** Der Server entscheidet, was läuft. Ein Client kann nur die eigene Lautstärke ändern, lokal. Es gibt keinen Endpunkt, der eine Position setzt.
- **Keine öffentliche Video-URL.** Weder im HTML noch in `public/` noch in einer D1-Zeile steht ein Pfad, der ohne Signatur abrufbar ist. Der Origin-Host ist nur über den Tunnel plus Service-Token erreichbar.
- **Secrets nur per `wrangler secret put` bzw. `.dev.vars`.** Nie in `wrangler.jsonc`, nie im Repo, nie in PR-Text. `.dev.vars`, `.wrangler/`, `data/`, `backups/` bleiben uncommitted.
- **Deutschsprachige UI.** Freitext über die bestehende Escape-Funktion. Kein `alert()`/`confirm()`/`prompt()` — `<dialog>` nach DESIGN.md §8.
- **Mobile-first.** 390 px ist das Ziel, 1280 px dieselbe Fläche mit mehr Platz. Kein horizontales Scrollen, nichts abgeschnitten.
- **Löschen nur mit Nils.** Filme, Sendungen, Staffeln, Dateizeilen und Zuschauerzeilen werden deaktiviert (`archived_at`), nicht gelöscht.
- **Nichts von Hand pflegen.** Der Admin kennt genau zwei Eingaben: einen Filmtitel tippen oder eine Datei aus `kino\filme` wählen. Poster, Backdrop, Beschreibung, Laufzeit, Genre, Bewertung und Trailer kommen ausschließlich aus TMDB. Ein Eingabefeld für `overview`, `runtime` oder `poster_path` ist ein Review-Blocker: es erzeugt eine zweite Wahrheit, die der nächste Import wieder überschreibt.
- **TMDB ist die einzige Metadatenquelle, YouTube nur als Einbettung.** Keine lokal gespeicherten Bilder, keine gerippten Trailer als Pflicht. Ein lokaler Trailer in `kino\trailer` ist ein optionaler Fallback (§3), nie Voraussetzung für einen Abend.
- **Der Ordner ist die Wahrheit für Dateien.** Was in `C:\Users\nilsw\kino\filme` liegt, ist der Katalog; D1 (`kino_files`) spiegelt den Scan. Der Worker liest den Datenträger nie selbst — der Abgleich läuft ausschließlich über den Origin-Agenten (§5.2).
- **Keine Fritzbox-Portfreigabe.** Der Origin hängt ausschließlich am ausgehenden `cloudflared`-Tunnel.
- **Keine Werbung im Vorprogramm.** Das ist entschieden (Nils, 03.11.): keine Anzeigen, kein „Werbung akzeptieren“ als Option. Der YouTube-Player wird ohne eigene Steuerung eingebettet, und wenn ein Clip nicht sauber startet, läuft die Poster-Karte (§3).
- **Segmente kommen nie in den Cloudflare-Cache.** Jede Video-Antwort trägt `Cache-Control: private, no-store`, zusätzlich eine Cache-Rule „Bypass“ für den Origin-Hostnamen — sonst liegt urheberrechtlich geschütztes Material im Edge-Cache und die Signatur ist wertlos.

---

## 1. Architektur auf Cloudflare Free

### 1.1 Bausteine

| Baustein | Was | Wo |
| --- | --- | --- |
| Worker `nwebnotfound-site` | Seiten `/kino/*`, API `/api/kino/*`, Admin-Host, Manifest-Rewrite | `src/kino-*.js`, geroutet aus `src/worker.js` |
| D1 `DB` | Filme, Sendungen, Räume, Staffeln, Trailer, Einstellungen, Erinnerungen | `migrations/00xx_kino_*.sql` |
| Durable Object `KinoRoom` | eine Instanz pro Raum: Serveruhr, Startzeit, Anwesenheit, WebSocket-Fanout | `src/kino-room.js`, Binding `KINO_ROOMS` |
| `cloudflared` + Watcher (Rex) | encodiert nach `hls\<file_hash>\`, liefert `/hls/**`, listet den Filmordner (`GET /scan`), nimmt Aufträge an (`POST /jobs`) und meldet Status an `POST /api/kino/ingest` (§5.3) | nicht im Repo, läuft auf Nils' PC |
| Cloudflare Access | Schutz von `admin.nwebnotfound.dev` | Dashboard, Anwendung „Kino Admin“ |
| TMDB API | einzige Quelle für Metadaten und Trailer: Poster, Backdrop, Beschreibung, Laufzeit, Genre, Bewertung, YouTube-Keys | serverseitig im Worker, Ergebnis in D1 |

Der Browser spricht nur mit `nwebnotfound.dev`. Er spricht nie mit dem Origin und nie mit TMDB.

### 1.2 Datenmodell (D1)

Alle Zeiten als **ganzzahlige Unix-Millisekunden** (`INTEGER`), wie bei `mc_vip_commands`. Kein `datetime('now')` in Kino-Tabellen, damit Client, DO und Bot dieselbe Einheit sehen.

```
kino_films        id TEXT PK (ULID), tmdb_id INTEGER UNIQUE, slug TEXT UNIQUE,
                  file_hash TEXT NULL UNIQUE,        -- sha256 des Masters, sobald eine Datei zugeordnet ist
                  title TEXT, original_title TEXT, year INTEGER, runtime_min INTEGER,
                  overview TEXT, poster_path TEXT, backdrop_path TEXT,
                  vote_average REAL, release_date TEXT, genres TEXT (JSON),
                  metadata_synced_at INTEGER,        -- letzter TMDB-Import (Refresh, §4.1)
                  hls_path TEXT, hls_ready INTEGER DEFAULT 0, duration_s INTEGER,
                  created_at INTEGER, archived_at INTEGER NULL

kino_files        file_hash TEXT PK,             -- sha256 hex des Masters: die Identität der Datei
                  rel_path TEXT UNIQUE,          -- relativ zum Filmordner, nie absolut
                  size_bytes INTEGER, mtime INTEGER,
                  parsed_title TEXT, parsed_year INTEGER,
                  film_id TEXT NULL REFERENCES kino_films(id),
                  state TEXT ('matched'|'ambiguous'|'unmatched'|'ignored'),
                  candidates TEXT (JSON, Top-3-Treffer nur bei 'ambiguous'),
                  transcode_status TEXT ('none'|'queued'|'transcoding'|'ready'|'failed'),
                  transcode_error TEXT NULL,     -- nur bei 'failed', ohne Secret und ohne Pfad mit Host
                  first_seen_at INTEGER, last_seen_at INTEGER, archived_at INTEGER NULL
                  INDEX (state), INDEX (film_id), INDEX (transcode_status)

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

kino_trailers     id TEXT PK, film_id TEXT REFERENCES kino_films(id),
                  source TEXT ('tmdb'|'local'),       -- 'tmdb' ist der Regelfall (§3)
                  youtube_key TEXT NULL,               -- nur bei source='tmdb'
                  local_path TEXT NULL,                -- relativ zu kino\trailer, nur 'local'
                  language TEXT, name TEXT, official INTEGER, position INTEGER,
                  added_at INTEGER, UNIQUE (film_id, youtube_key)

kino_settings     key TEXT PK, value TEXT, updated_at INTEGER
                  -- u.a. kino.guild_id, kino.role_id, kino.role_mode, kino.access_cache_ttl_s

kino_access_cache discord_id TEXT PK, has_role INTEGER, checked_at INTEGER, source TEXT

kino_reminders    id TEXT PK, show_id TEXT, discord_id TEXT, created_at INTEGER,
                  state TEXT ('pending'|'claimed'|'sent_1h'|'sent_15m'|'cancelled'),
                  claimed_at INTEGER NULL, UNIQUE (show_id, discord_id)
```

`kino_files` ist der Katalog aus dem Scan: eine Zeile pro Datei im Filmordner, Schlüssel ist der **`file_hash`** (sha256 der Master-Datei), `rel_path` ist der relative Pfad (eindeutig) — dadurch bleibt eine umbenannte Datei derselbe Datensatz, und `state` macht sichtbar, was der Abgleich nicht selbst entscheiden konnte (§4.2). `transcode_status` spiegelt den letzten Ingest-Stand (§5.3). Absolute Pfade stehen nie in der D1 — der Ordner kann umziehen, ohne dass Zeilen brechen.

`kino_trailers` ist die von Nils geforderte Trailerliste, getrennt von `kino_films`, damit ein Film mehrere Sprachen und mehrere Fassungen haben kann und die Prüfung (`official`, `type=Trailer`) nachvollziehbar bleibt. Regelfall ist `source='tmdb'`; `source='local'` nur, wenn in `kino\trailer` eine Datei liegt (§3). Der Standardtrailer ist die Zeile mit dem kleinsten `position`, es gibt kein zweites Feld in `kino_films`.

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
- **Driftkorrektur clientseitig.** Liegt die Abweichung über 2 s, springt der Player auf die Segmentgrenze der Saal-Position: `video.currentTime = (Math.floor(position / 6) * 6)`. Das ist ein echter Keyframe-Sprung, weil der Encode Keyframes **exakt** auf jeder 6-s-Segmentgrenze hat (§1.4) — `hls.currentLevel` allein springt nicht auf einen Keyframe. Zwischen 250 ms und 2 s wird `playbackRate` auf 0.98 bzw. 1.02 gesetzt, nach 5 s zurück auf 1.0. `prefers-reduced-motion` ändert daran nichts, weil es kein UI-Effekt ist.
- **Anwesenheit:** Der DO hält die Menge der offenen Sockets (Hibernation-API, `state.acceptWebSocket`), zählt je Socket die `discord_id` (aus dem signierten Ticket) und sendet bei Join/Leave ein `{type:"presence", viewers:n}` an alle. Live-Zahl ohne Polling.
- **Hibernation:** WebSocket-Hibernation ist Pflicht, damit ein Abend mit 20 Zuschauern nicht 20-mal Dauer in Rechnung stellt. Der DO darf zwischen zwei Events keinen Timer brauchen; Aufräumen passiert bei `alarm()` bzw. beim nächsten Event.
- **Raum leer:** Geht die letzte Verbindung, bleibt `startsAt` stehen. Der nächste Zuschauer kommt mitten in den Film — genau wie im echten Kino.

### 1.4 HLS vom PC über den Tunnel

- **Der Watcher encodiert, der Ordner ist die Zustellung.** Pro Master-Datei entsteht `hls\<file_hash>\` — benannt nach dem **sha256** der Master-Datei, nicht nach der `film_id`: die ULID vergibt der Worker erst, wenn ein Encode fertig gemeldet ist (§5.3), der Watcher kann sie beim Start also nicht kennen. Geschrieben wird zuerst in `hls\<file_hash>.tmp\`, am Ende wird atomar umbenannt — ein abgebrochener Lauf hinterlässt keinen halben Ordner.
- **Leiter: 1080p, 720p, 480p.** H.264 High ist **immer** vorhanden und bleibt der Fallback für jeden Browser; HEVC und/oder AV1 kommen optional obendrauf, wo der Browser sie kann. `master.m3u8` signalisiert das pro Variante über `CODECS="avc1.640028,mp4a.40.2"` (bzw. `hvc1…`, `av01…`) plus `RESOLUTION`, `BANDWIDTH` und `FRAME-RATE`, damit hls.js die richtige Stufe wählt. Audio in allen Varianten identisch: AAC-LC 128k.
- **Segmente: 6 s, Keyframes exakt auf jeder Segmentgrenze** — das ersetzt den 4-s-GOP aus der ersten Fassung überall. `#EXT-X-TARGETDURATION:6`, `#EXT-X-INDEPENDENT-SEGMENTS`; x264 mit `-force_key_frames "expr:gte(t,n_forced*6)" -sc_threshold 0`, NVENC (`h264_nvenc`, `hevc_nvenc`) mit `-forced-idr 1 -g <fps*6>` plus denselben `force_key_frames`, dazu `-preset p5 -rc vbr` mit `-maxrate`/`-bufsize` je Stufe, damit `BANDWIDTH` im Master zur echten Bitrate passt (1080p 4,5 / 720p 2,5 / 480p 1,2 Mbps). 6 s sind auch Request-Budget: ein 2-h-Film sind ~1.200 Segmente statt ~1.800 (§9.1).
- **Untertitel nur als WebVTT.** Textspuren (SRT/ASS) werden zu `subs/<lang>.m3u8` plus `subs/<lang>/seg…vtt` konvertiert und im Master als `#EXT-X-MEDIA:TYPE=SUBTITLES` verlinkt (eine Media-Playlist pro Sprache). **Bild-Untertitel (PGS/VobSub) werden übersprungen** und im Ingest als `subtitles_skipped` gemeldet — sie lassen sich nicht sinnvoll in Text wandeln.
- **`ready.json` schreibt der Watcher selbst**, sobald der Ordner vollständig ist: `{ "duration_s": n, "variants": […], "subtitles": […], "built_at": ms }`. Der Worker liest sie beim nächsten Ingest (§5.3) und setzt `hls_ready=1`, `duration_s` und `hls_path = /hls/<file_hash>/master.m3u8`. Es gibt keinen „Film ist bereit“-Knopf und keine zu kopierende ID.
- **Wurzel und Tunnel.** `C:\Users\nilsw\kino` hat drei Unterordner: `filme\` (Master, Nils legt ab), `hls\<file_hash>\` (Ausgabe) und `trailer\` (optional, §3). `cloudflared` veröffentlicht nur diesen Ordner als `origin.kino.nwebnotfound.dev` (lokaler Origin `127.0.0.1`), mit Access-Service-Token; der Hostname löst ohne Access nicht öffentlich auf.
- **Auslieferung: kein 302.** Ein Redirect auf den Origin ist ausgeschlossen, weil der Browser dort keinen Service-Token hat und den Host nie sehen soll. Der Worker holt Playlist und Segment über den Tunnel und **streamt selbst durch** (§1.5). R2 als andere Auslieferung ist eine Option, keine Entscheidung (§9.1).

### 1.5 Signierte, kurzlebige URLs mit rollendem Playlist-Fenster

Signatur = HMAC-SHA256 über `file_hash | pfad | exp | sid | room_id`, Schlüssel `KINO_SIGNING_KEY` (Secret, 32 Byte, rotierbar über eine Key-ID im Pfad).

```
/hls/<file_hash>/<pfad>?exp=<ms>&sid=<hmac-session>&k=<key-id>&sig=<base64url>
```

- **`sid` ist ein HMAC über die Session-ID**, kein nackter Hash: `sid = HMAC-SHA256(KINO_SIGNING_KEY, "sid:" + session_id)`. Ein Hash der Session ließe sich mit bekannten Session-Formaten zurückrechnen; der HMAC bindet den Link an Konto und Raum, ohne die Session zu verraten.
- TTL **120 s** für Segmente und Playlists. Ein kopierter Link läuft ab, bevor er sich lohnt.
- **Die `.m3u8` auf Platte bleibt VOD, signiert wird beim Ausliefern.** Eine einmal signierte Playlist für einen 2-h-Film wäre nach 120 s komplett tot. Deshalb liefert der Worker jede Variant-Playlist als **rollendes Fenster** um die Saal-Position (live-artig: rund 30 s zurück, 60 s voraus, `#EXT-X-MEDIA-SEQUENCE` gesetzt, kein `#EXT-X-ENDLIST`): Der Player lädt alle paar Sekunden neu und bekommt frische Signaturen. Das passt zum Modell „kein Seek“ — der Server bestimmt das Fenster, ein Player kann nicht in die Vergangenheit springen.
- Bindung an Session und Raum: derselbe Link aus einem anderen Konto oder einem anderen Raum ist ungültig.
- Der Worker prüft Signatur, `exp`, `sid` und **die laufende Sendung** (`now` zwischen `starts_at` und `ends_at`). Nach dem Abspann ist auch ein gültig signiertes Segment tot.
- Alle Video-Antworten `Cache-Control: private, no-store`. Kein CORS auf dem Origin, `Referer` ist kein Sicherheitsmerkmal.

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

Der Admin-Host ist eine eigene Route im selben Worker; `hostOk` (Zeile ~418 in `src/worker.js`) akzeptiert bereits Subdomains von `nwebnotfound.dev`. Die Pfadprüfung muss deshalb **beidseitig** greifen: `/api/kino/admin/*` nur auf `admin.nwebnotfound.dev`, und auf dem Apex sowie jeder anderen Subdomain **hart 404** — sonst ist die Admin-API über `nwebnotfound.dev` erreichbar und die Access-Schicht davor ist umgangen. Kein Kino-Admin-Link auf der öffentlichen Seite.

Dazu drei Regeln, die nicht optional sind:

- **Schreibzugriffe prüfen den Absender.** `POST`/`PUT`/`DELETE` auf dem Admin-Host verlangen `Origin: https://admin.nwebnotfound.dev` **oder** `Sec-Fetch-Site: same-origin`; fehlt beides oder weicht es ab → 403. `SameSite=Lax` hilft hier nicht: `nnf_session` liegt auf `.nwebnotfound.dev`, Apex und `admin.` sind für den Browser same-site, ein Cross-Site-POST käme mit Cookie durch.
- **Eine Ausnahme, eng begrenzt:** `POST /api/kino/ingest` (§5.3) hat keinen Browser-JWT, weil der Watcher keinen hat. Genau dieser eine Pfad bekommt einen Access-Service-Token bzw. eine Bypass-Policy **nur für sich**, trägt die HMAC-Prüfung und kann nichts lesen — er meldet einen Status zu einem `file_hash`.
- **Immer 404, nie 403** für alles außerhalb dieses Pfads: ein 403 verrät, dass es den Admin gibt.

---

## 3. Vorprogramm (nur TMDB-Trailer)

- **Eine einzige Quelle:** `GET https://api.themoviedb.org/3/movie/{tmdb_id}/videos?language=de-DE&include_video_language=de,en,null`. Behalten werden ausschließlich Einträge mit `site === "YouTube"`, `type === "Trailer"` und `official === true`; gespeichert wird nur der `key` (die YouTube-ID). Teaser, Clips, Featurettes und Fan-Uploads werden verworfen, auch wenn sie besser aussehen — nicht die offizielle Fassung, unklarer Rechte-Status.
- Ablage in `kino_trailers` mit `source='tmdb'`, `position` und `language`; maximal drei pro Film, der kleinste `position` ist der Standard. Kein zweites Trailerfeld in `kino_films`.
- Einbettung ausschließlich als `https://www.youtube-nocookie.com/embed/<key>` mit **fester** Parameterliste: `controls=0&disablekb=1&fs=0&rel=0&iv_load_policy=3&playsinline=1`. Grund: der YouTube-Player bringt sonst Play/Pause, Zeitleiste, Vollbild und „weitere Videos“ mit — im Saal darf nur der Server den Takt vorgeben (§1.3). `modestbranding` ist abgekündigt und fällt weg; `mute=1` beim Start ist erlaubt (Ton schaltet jeder lokal frei). `iframe` mit `allow="autoplay; encrypted-media"` und `referrerpolicy="strict-origin-when-cross-origin"`.
- **Werbung: entschieden — es gibt keine.** Nils' Entscheidung (03.11.): keine Anzeigen im Saal, es gibt auch keine Option „kurze Werbung akzeptieren“. Ehrlich dazugesagt: `youtube-nocookie` blockt **keine** Pre-Rolls, es reduziert nur Cookies. Vor offiziellen Studio-Trailern sind Pre-Rolls selten, technisch ausschließen lassen sie sich nicht. Deshalb der feste Fallback: Kann der Player nicht innerhalb von 3 s starten oder wird ein Werbespot erkannt, ersetzt die **Poster-Karte** den Clip — das Vorprogramm läuft als Kartenfolge weiter und endet pünktlich bei `startsAt`, es bleibt kein schwarzer Kasten und kein Werbeblock.
- **Lokale Trailer sind optional, nie Voraussetzung.** Liegt in `C:\Users\nilsw\kino\trailer` eine Datei zum Film, darf sie als kleines HLS-Vorprogramm laufen (`source='local'`, §5.2). Das ist ein manueller Fallback gegen Werbung, kein Pflichtschritt: ein Abend mit null lokalen Trailern ist vollständig. Kein automatisches Rippen von YouTube — fremde Uploads sind lizenzrechtlich heikel, eigene Rips ebenso.
- **Timing hängt vollständig an der DO-Uhr**, nicht an einer Browser-Uhr: der Client startet die Trailerliste `T − X` Minuten vor `startsAt` (X = Summe der Trailerlängen, gedeckelt auf 10 Minuten) und blendet 30 s vor Start den Countdown ein — dieselbe `serverNow`-Quelle wie der Film, damit alle im Saal dasselbe Vorprogramm sehen und ein später Joiner an der richtigen Stelle einsteigt. Kein eigenes Intro, kein Werbeblock, keine „Wir sind gleich zurück“-Karte.
- CSP muss `frame-src https://www.youtube-nocookie.com` erlauben; sonst bleibt der Rahmen leer und es sieht wie ein Bug aus. Die YouTube-IFrame-API wird **nicht** genutzt, deshalb bleibt `script-src` bei `'self'` — `https://www.youtube.com` kommt nur dazu, falls die API (Playback-Steuerung von außen) doch gebraucht wird (§7.3).

---

## 4. Admin

Fünf Flächen, alle unter `admin.nwebnotfound.dev`, alle mobil bedienbar (`/kino`-Admin wird auf dem Handy benutzt, wenn Nils unterwegs etwas verschiebt).

**4.1 Zwei Eingaben, alles andere aus TMDB.** Der Admin kennt genau zwei Wege, einen Film anzulegen: (a) **Titel tippen** — `GET /3/search/movie?query=&year=&language=de-DE`, Trefferliste mit Poster, Jahr und Laufzeit; (b) **Datei wählen** — die gescannte Liste aus `kino\filme` (§4.2), der Rest läuft automatisch. Beide enden im selben Import: `title`, `original_title`, `release_date`, `runtime`, `overview`, `poster_path`, `backdrop_path`, `vote_average` und `genres` (Namen, nicht IDs) plus Trailerliste (§3) per `tmdb_id`-Upsert; alles landet in D1 (`kino_films`), `metadata_synced_at` wird gesetzt. **Es gibt kein Metadatenformular:** Beschreibung, Laufzeit, Genre, Poster und Backdrop werden nicht getippt und nicht hochgeladen. Ein zweiter Import desselben Films aktualisiert statt zu duplizieren — und überschreibt keine Handkorrektur, weil es keine gibt. Gespeichert statt live geholt, weil das die Seiten schnell hält, TMDB-Aufrufe spart (ein Abend mit 20 Zuschauern soll nicht 20 × dieselben Metadaten ziehen) und die Seite auch dann noch zeigt, wenn TMDB gerade nicht antwortet. Poster über `https://image.tmdb.org/t/p/w500` (nicht `original`, das kostet nur Bytes); angezeigt wird `poster_path`, keine lokale Kopie. Pflicht nach TMDB-Bedingungen: Attribution (Logo/Hinweis) im Footer und im Admin.

**4.2 Dateiordner `kino\filme` abgleichen (der Regelfall).** Nils legt Filme nur ab und pflegt keine Liste; der Abgleich ist ein Scan, kein Formular:

1. Der Origin-Agent (Rex) listet den Filmordner über `GET /scan` (§5.2): `rel_path`, `size_bytes`, `mtime` und den **`file_hash`** (sha256, einmal pro Datei berechnet und im Agenten zwischengespeichert, solange Größe und mtime gleich bleiben). Der Worker liest den Datenträger nie selbst — ohne diesen Endpunkt gibt es keinen Abgleich.
2. Der Worker parst den Dateinamen (`Der.Film.2023.German.1080p.WEB.x264-GRP.mkv` → Titel `Der Film`, Jahr `2023`; Release-Tags wie `1080p`, `2160p`, `WEB`, `BluRay`, `x264`, `German`, `DL` und die `-GRP`-Endung fallen weg) und sucht TMDB mit Titel + Jahr.
3. Bewertung des Treffers: `0.6 × Titelsimilarity(normalisiert) + 0.4 × (Jahr exakt ? 1 : Jahr ±1 ? 0.5 : 0)`. Ab **0.85** wird automatisch zugeordnet (`state='matched'`), zwischen **0.55 und 0.85** wird die Datei `ambiguous` (Admin zeigt die Top 3 mit Poster zum Klicken), darunter `unmatched`. Die beiden Schwellen bleiben gesetzt; nachjustiert wird erst nach echten Dateien (§10.13).
4. Die Zeile in `kino_files` hängt am `file_hash`, nicht am Namen: eine umbenannte Datei ist derselbe Datensatz (`rel_path` wird aktualisiert), eine neu kopierte identische Datei erbt eine bestehende Zuordnung. Der Scan ist idempotent, eine bereits zugeordnete Datei wird nicht erneut gesucht.
5. **Die drei Sonderfälle, die der Abgleich sauber beantworten muss:**
   - **schon zugeordnet** (`matched`): kein TMDB-Aufruf, nur `last_seen_at`; im Admin sichtbar als „zugeordnet“, ein Klick löst höchstens „neu suchen“ aus.
   - **mehrere Treffer** (`0.55`–`0.85`): Top 3 mit Poster, Jahr und Laufzeit; **ein Klick** wählt den Film, danach läuft der Import (§4.1) automatisch durch — keine Film-ID, kein Metadatenformular.
   - **kein Treffer** (`< 0.55`): `unmatched` mit geparstem Titel und Jahr, zwei Aktionen — „Suchbegriff korrigieren“ (nur der Suchtext) und „TMDB-Treffer wählen“. Bleibt es dabei, ist der Film nur mit Warnung planbar, die Metadaten bleiben leer statt erfunden (§10.12).
6. **Der Rest ist automatisch.** Nach dem Klick (bei `matched` ohne jeden Klick) holt der Worker Poster, Backdrop, Beschreibung, Laufzeit, Genre, Bewertung und die Trailerliste aus TMDB und legt sie in D1 ab; `metadata_synced_at` wird gesetzt.
7. **Transcode und Bereitschaft ohne Handgriff.** Der Watcher sieht eine neue Master-Datei selbst (oder Nils drückt „Transcodieren“, was nur `POST /jobs` auslöst, §5.2) und meldet über `POST /api/kino/ingest` (§5.3) `queued` → `transcoding` → `ready`. Bei `ready` vergibt der Worker die `film_id` (ULID) und setzt `hls_ready=1`, `duration_s` und `hls_path` aus `ready.json`. Nichts wird kopiert, nichts von Hand eingetragen.
8. Auslöser: Knopf „Jetzt scannen“ auf `/dateien` plus Cron alle 30 Minuten (Workers Cron Trigger). TMDB wird nur für neue oder unklare Dateien gefragt; bekannte Dateien kosten einen D1-Write. Ist der Agent offline, bleibt der letzte Stand stehen und `/dateien` zeigt „Origin offline, Stand <Zeit>“ — kein leerer Katalog.
9. Der Trailer-Ordner wird im selben Scan gelesen, ist aber optional (§3): eine lokale Datei ersetzt nur den YouTube-Trailer, sie ist nie Bedingung für einen Abend.

**4.3 Programmplaner mit Staffeln.** Wochenansicht (Mo–So), Slots als Karten, Drag auf einen Abend. Eine Sendung ist `film_id + starts_at + room`. Beim Speichern prüft der Server: kein Overlap im selben Raum, Film ist `hls_ready`, Startzeit liegt in der Zukunft (oder Nils bestätigt „jetzt starten“, was `starts_at = now + 120 s` setzt). Staffeln (`kino_seasons`) sind Zeitfenster mit eigenem Akzent: **Halloween-Horror** (01.10.–02.11.) und **Weihnachten** (01.12.–06.01.). Eine Sendung in einer Staffel erbt deren Akzent im Programm. `status` steuert Sichtbarkeit: `draft` sieht nur die Admin, `published` steht im Programm.

**4.4 Neue Filme regelmäßig.** Filme mit `release_date` in den letzten 90 Tagen sind „neu“ und sollen einige Wochen regelmäßig laufen. Der Planer zeigt sie als Vorschlagsreihe („Neu und regelmäßig“) mit einem Klick für „3 Wochen, jeden Freitag 20:30“. Das ist eine Vorlage, keine Automatik — Nils bestätigt jeden Block.

**4.5 Vorschlagsalgorithmus (später, PR K9).** Nur Vorschläge, nie automatische Veröffentlichung. Score:

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
| `GET /api/kino/film/<slug>` | Filmdetail inkl. Trailerliste (nur `youtube_key`, keine Streams) |
| `GET /api/kino/show/<id>` | eine Sendung, `starts_at`, `ends_at`, `room`, `viewers` (aus DO, best effort) |
| `POST /api/kino/room/<slug>/ticket` | kurzlebiges WS-Ticket (60 s) für den DO; nur mit Rolle und laufender/kommender Sendung |
| `GET /api/kino/reminders` / `POST` / `DELETE` | Erinnerungen des eingeloggten Nutzers (siehe 5.4) |

### 5.2 Mit Rex (Origin: Dateiordner, Transcoding, HLS)

Der Worker sieht kein Dateisystem. Alles, was im Kino-Ordner passiert, geht über den Origin-Agenten von Rex — den **Watcher** —, erreichbar **nur** über den `cloudflared`-Tunnel mit Access-Service-Token. Dieses Dokument beschreibt nur die Schnittstelle; ffmpeg/NVENC, Queue, Retries und die Leiter sind Rex' PR (§10.14).

- **Ablage, eine Wurzel und drei Unterordner.** `<kino-root>` = `C:\Users\nilsw\kino`:
  - `filme\` — Master (`.mkv`/`.mp4`), von Nils abgelegt, Dateiname frei. Das ist der Katalog; der Worker liest ihn über `GET /scan`.
  - `hls\<file_hash>\` — Encode-Ausgabe: `master.m3u8`, `1080p/index.m3u8`, `720p/index.m3u8`, `480p/index.m3u8`, `subs/<lang>.m3u8`, Segmente, `ready.json`. Der Ordnername ist der **sha256 der Master-Datei**; die `film_id` kommt erst beim Ingest dazu (§5.3).
  - `trailer\` — optional, lokale Trailerdateien (§3). Leer ist ein gültiger Zustand.
- **`GET /scan`** (JSON, Header `x-kino-origin: 1` plus Access-Service-Token) — die einzige Sicht auf den Ordner:

  ```json
  { "generated_at": 1794000000000,
    "films":    [ { "rel_path": "Der.Film.2023.German.1080p.mkv", "file_hash": "9f2c...e41b",
                    "size_bytes": 8123456789, "mtime": 1793900000000 } ],
    "hls":      [ { "file_hash": "9f2c...e41b", "has_master": true, "ready": true, "duration_s": 6420,
                    "variants": ["480p","720p","1080p"], "subtitles": ["de"], "built_at": 1793950000000 } ],
    "trailers": [ { "rel_path": "Der.Film.2023.trailer.mp4", "size_bytes": 41234567, "mtime": 1793900000000 } ] }
  ```

  Regeln: nur Dateiname, Größe, mtime und Hash — keine Inhalte, keine Videodaten im Body. Pfade **relativ** zur Wurzel; `..` und alles außerhalb der drei Ordner wird abgelehnt (Path-Traversal), Symlinks werden nicht verfolgt. Maximal 5.000 Einträge, darüber `413`. Antwort mit `Cache-Control: no-store`, kein Verzeichnislisting als HTML.
- **`POST /jobs`** (Transcode-Auftrag), Body `{ "file_hash": "9f2c...e41b", "rel_path": "Der.Film.2023.German.1080p.mkv", "ladder": ["480p","720p","1080p"] }`, Antwort `{ "job_id": "...", "queued_at": ms }`. Idempotent über `file_hash`: solange kein `ready.json` existiert und kein Job läuft, ändert ein zweiter Auftrag nichts. Der Watcher schreibt nach `hls\<file_hash>.tmp\`, benennt am Ende atomar um und legt `ready.json` ab.
- **Kein zweiter Schreibweg.** Der Agent liest die D1 nie und schreibt ausschließlich über `POST /api/kino/ingest` (§5.3) — mit HMAC, ohne Leserecht. Ein fehlender Eintrag heißt „nicht mehr gesehen“, nicht „gelöscht“ (`archived_at`, Global Constraints).
- **Auth zwischen Tunnel und Worker:** `cloudflared` veröffentlicht nur `origin.kino.nwebnotfound.dev` mit Access-Service-Token. Der Worker sendet `CF-Access-Client-Id` + `CF-Access-Client-Secret` (beide Secrets, nie im Repo) und `x-kino-origin: 1`; der Agent liefert ohne diesen Header nichts. Kein Query-Token im Pfad, kein Basic-Auth mit geteiltem Passwort in der URL.
- **Manifest auf Platte:** Pfade **relativ** zum Filmordner (`720p/index.m3u8`), `#EXT-X-VERSION:3`, `#EXT-X-INDEPENDENT-SEGMENTS`, `#EXT-X-TARGETDURATION:6`. Ausgeliefert wird das Manifest nie unverändert: der Worker schneidet daraus das rollende Fenster und signiert es (§1.5).

### 5.3 Ingest vom Watcher (`POST /api/kino/ingest`)

Der Watcher meldet jeden Statuswechsel selbst; es gibt keinen Rückkanal in die D1 (Vertrag aus mc-stack#119, Review 5744806663).

- **Adresse:** `POST https://admin.nwebnotfound.dev/api/kino/ingest`. Auf dem Admin-Host greift Access, deshalb bekommt der Watcher entweder einen **Access-Service-Token** (`CF-Access-Client-Id`/`-Secret`) oder eine **Bypass-Policy nur für genau diesen Pfad**; jede andere Route des Admin-Hosts bleibt ohne JWT 404 (§2.2).
- **Auth ohne Bearer:** Header `X-Kino-Timestamp` (unix-ms) und `X-Kino-Signature` = `hex(HMAC-SHA256(KINO_INGEST_SECRET, timestamp + "." + rawBody))`. `KINO_INGEST_SECRET` liegt als `wrangler secret` beim Worker und nur in der `.env` des Watchers. **Replay-Fenster 5 Minuten** (älter oder weiter in der Zukunft → `401`), Vergleich **in konstanter Zeit** (`crypto.subtle.verify` über Bytes). Kein Klartext-Token, keine Signatur in der URL, kein Secret im Body.
- **Body:**

  ```json
  { "file_name": "Der Film (2024).mkv",
    "file_hash": "<sha256 hex>",
    "rel_path": "filme/Der Film (2024).mkv",
    "status": "queued",
    "film_id": "<ULID, optional — vergibt der Worker>",
    "duration_s": 6840,
    "variants":  [ { "name": "1080p", "height": 1080, "bandwidth": 5000000,
                     "codecs": "avc1.640028,mp4a.40.2", "playlist": "1080p/index.m3u8" } ],
    "subtitles": [ { "lang": "de", "label": "Deutsch", "path": "subs/de.m3u8" } ],
    "error": "optional, nur bei failed" }
  ```

- **Antworten:** `202` für `queued`/`transcoding` und `failed` (Body `{ "file_hash": "...", "status": "..." }`), `200` für `ready` mit `{ "film_id": "<ULID>" }`, `409` bei Konflikt, `401` bei ungültiger Signatur oder Zeitstempel.
- **Idempotent über `file_hash`:** dieselbe Meldung ergibt dasselbe Ergebnis. **Status läuft nur vorwärts** (`queued → transcoding → ready`); die einzige Ausnahme ist `failed → queued` beim Retry. Alles andere — auch derselbe `file_hash` mit anderem `rel_path` oder anderer `film_id` — ist `409`.
- Bei `ready` übernimmt der Worker `duration_s`, `variants`, Untertitel und `hls_path`, startet den TMDB-Abgleich aus dem Dateinamen (§4.2) und **vergibt die `film_id` (ULID)**; die `kino_files`-Zeile verweist darauf. Pfade immer relativ, nie ein Host, nie die Heim-IP.

### 5.4 Mit Dex (Bot „Moci“)

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

### 5.5 Admin (`admin.nwebnotfound.dev`)

Zusätzlich hinter Access-JWT + `ADMIN_DISCORD_ID` (§2.2); alle `POST` nur mit `Origin: https://admin.nwebnotfound.dev` bzw. `Sec-Fetch-Site: same-origin`.

| Route | Zweck |
| --- | --- |
| `GET /api/kino/admin/files?state=` | Katalog aus `kino_files` mit `parsed_title`, `parsed_year`, `candidates` |
| `POST /api/kino/admin/scan` | `GET /scan` beim Agenten auslösen, Abgleich fahren, Antwort `{added, matched, ambiguous, unmatched, ready}` |
| `POST /api/kino/admin/files/<file_hash>/match` | `{tmdb_id}` zuordnen (für `ambiguous`/`unmatched`) — der einzige „das ist der richtige Film“-Klick |
| `POST /api/kino/admin/files/<file_hash>/ignore` | Datei ausblenden (`state='ignored'`), nie löschen |
| `POST /api/kino/admin/films/import` | `{tmdb_id}` oder `{query}` → Import nach §4.1 (Upsert, `metadata_synced_at`) |
| `POST /api/kino/admin/films/<id>/transcode` | `POST /jobs` beim Agenten, Antwort `{job_id}` |

`<file_hash>` ist der hex-sha256 der Datei, `<path>` in Antworten immer relativ (nie absolut). Ein `file_hash`, der nicht in `kino_files` steht, ergibt 404; ein Pfad außerhalb von `kino\filme` ergibt 400, ein unbekannter 404 — nie 500.

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
8. `/filme` — Liste mit Suche, Filter „neu“, Status `hls_ready` (kommt aus `ready.json`), Aktion „Termin planen“.
9. `/dateien` — **neu:** der Filmordner wie gescannt, eine Zeile je `file_hash` mit Dateiname, Zustand (`matched`/`ambiguous`/`unmatched`) und Transcode-Status (`queued`/`transcoding`/`ready`/`failed`, aus dem Ingest §5.3). Aktionen: „Jetzt scannen“, „Transcodieren“, „Suchbegriff korrigieren“, „TMDB-Treffer wählen“. Alles, was der Abgleich nicht selbst entschieden hat, steht hier — die einzige Stelle, an der Nils nachzieht; die `film_id` vergibt der Worker, sie wird nie eingetippt.
10. `/filme/import` — Titel tippen, TMDB-Treffer, Vorschau (Poster, Laufzeit, Genre, Bewertung, Trailer), ein „Importieren“. Kein Eingabefeld außer dem Suchbegriff.
11. `/filme/<id>` — Detail: Metadaten aus TMDB (read-only), Trailerliste mit Quelle (`tmdb`/`local`), Transcode-Status, `hls_ready` ohne Schalter.
12. `/planer` — Wochenansicht, Ziehen auf Abend, Konfliktprüfung inline, „veröffentlichen“.
13. `/saisons` — Staffeln anlegen (Zeitraum, Akzent), Filme zuordnen, Neu-Vorschläge.
14. `/vorschlaege` — Top 10 mit Begründung, einzeln/als Block annehmen (PR K9).
15. `/einstellungen` — Discord `guild_id`, `role_id`, `role_mode`, Cache-TTL, Raum-Namen, Default-Raum, Status des TMDB-Tokens („gesetzt“, nie der Wert).
16. Zustände je Seite: leer, laden (Skeleton), Fehler mit Wiederholen — keine leere Fläche ohne Text.

---

## 7. Secrets und Sicherheit

### 7.1 Secrets (alle per `wrangler secret put`, lokal in `.dev.vars`)

| Name | Zweck |
| --- | --- |
| `TMDB_READ_TOKEN` | TMDB Read Access Token (v4 Bearer) — Account und Token legt **Nils selbst** an, der Wert steht nur im Vault bzw. als `wrangler secret`; serverseitig |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | bestehend, Login |
| `SESSION_SECRET` | bestehend, Session-Signatur |
| `DISCORD_BOT_TOKEN` | Rollenprüfung (§2.1) |
| `ADMIN_DISCORD_ID` | Allowlist für den Admin-Host |
| `ACCESS_AUD` | Audience Tag der Access-Anwendung |
| `ACCESS_TEAM_DOMAIN` | z. B. `nils.cloudflareaccess.com` (JWKS/Certs) |
| `KINO_SIGNING_KEY`, `KINO_SIGNING_KEY_ID` | Segment-Signatur, rotierbar |
| `KINO_ORIGIN_CF_ID`, `KINO_ORIGIN_CF_SECRET` | Access-Service-Token zum Origin |
| `KINO_BOT_TOKEN` | API für Dex/Moci |
| `KINO_INGEST_SECRET` | HMAC-Schlüssel für den Watcher-Ingest (§5.3), 32 Byte |

Kein Schlüssel steht in `wrangler.jsonc` (dort nur Routen und Bindings), im HTML, in `public/`, in `screenshots/` oder in einem PR-Text. Der Import-Fehler „key in repo“ ist ein Review-Blocker, kein Nit.

### 7.1.1 TMDB: Account und Token (macht Nils selbst)

1. Nils legt auf themoviedb.org einen **kostenlosen** Account an (kein bezahlter Plan, keine Zahlungsdaten) und erzeugt unter Settings → API einen **API Read Access Token (v4)**.
2. Der Token geht ausschließlich per `wrangler secret put TMDB_READ_TOKEN` in den Worker bzw. in den Vault; lokal nur in `.dev.vars` (uncommitted). Kein Fallback im Code: der Worker liest ihn aus `env.TMDB_READ_TOKEN`, fertig.
3. **Nie** in `wrangler.jsonc`, `public/`, `docs/`, `screenshots/`, PR-Text oder Chat. Tippt jemand den Wert in einen dieser Orte, ist das ein Review-Blocker und der Token wird sofort rotiert.
4. Der Worker schickt ihn serverseitig als `Authorization: Bearer <token>`; der Browser sieht ihn nie, es gibt keinen Proxy über Dritte.
5. Fehlt der Token, antwortet der Import `503 { "error": "tmdb_not_configured" }` und `/einstellungen` zeigt „TMDB-Token fehlt“ — kein stiller Fehlschlag, keine erfundenen Metadaten.
6. Attribution ist nach TMDB-Bedingungen Pflicht: Hinweis „Metadaten und Bilder von TMDB“ im Footer der Kinoseiten und im Admin, Bilder ausschließlich über `image.tmdb.org`.

### 7.2 Rate Limits (DO-Zähler bzw. Workers Rate Limiting Binding, Fenster 60 s)

Gezählt wird **nicht in D1**: 120 Segment-Requests pro Minute als D1-Writes sprengen die Free-Grenze von rund 100k Writes pro Tag, und die Zählung wäre teurer als das Video. Zähler liegen im `KinoRoom`-DO (pro Raum und Session, inkrementell im SQLite-Storage, mit `alarm()` zum Zurücksetzen) oder im `ratelimits`-Binding der Workers (`wrangler.jsonc`). Die Tabelle nennt nur die Grenzen.

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
  worker-src 'self' blob:;
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

- `worker-src 'self' blob:` ist Pflicht, weil hls.js seinen Demuxer in einem Web Worker aus einem Blob startet — ohne den Eintrag bleibt der Player schwarz.
- `script-src https://www.youtube.com` **nur**, wenn die YouTube-IFrame-API benutzt wird. Ohne API reicht das reine `<iframe>` (§3) und `script-src` bleibt bei `'self'`.
- `Permissions-Policy` sperrt `camera`, `microphone` und `geolocation`, aber **nicht** `autoplay`: ein `autoplay=()` würde den Trailer-Embed und den Saal-Player stumm abschalten.

### 7.4 Keine exponierten Video-URLs

- Kein `hls_path` mit Host in HTML oder JSON; API liefert nur Signatur-Pfade mit `exp`, niemals den Origin.
- Keine CORS-Header auf dem Origin; kein `Access-Control-Allow-Origin: *` irgendwo.
- Segmente und Playlists nur bei laufender Sendung, Signatur an Session (HMAC) und Raum gebunden, TTL 120 s, Playlists als rollendes Fenster (§1.5) — kein Redirect auf den Origin, kein presigned Origin-Link im HTML.
- `ready.json` und der HLS-Ordner sind über den öffentlichen Host nicht erreichbar (Access-Policy auf dem Origin-Hostnamen, kein Wildcard).
- Admin-Host antwortet ohne beide Beweise mit 404.

---

## 8. Split in Folge-PRs

Reihenfolge nach Merge von **#44** (Design-System, liefert `DESIGN.md` und `--ds-*`) und **#45** (AI-Panel-Fixes). Jeder PR: Branch → PR → grüne Checks → Deploy durch Nils' Freigabe. Kein PR enthält einen zweiten Themenkreis.

| PR | Inhalt | Abhängig von | Deploy? |
| --- | --- | --- | --- |
| **docs/kino-plan** (dieser) | Nur dieses Dokument | – | nein |
| **K1** `feat/kino-schema` | Migrationen `kino_*` inkl. `kino_files`, `wrangler.jsonc` (Admin-Route, DO-Binding `new_sqlite_classes`, Cron Trigger), leere Routen, `kino_settings` mit Defaults | #44, #45 | Migration mit Export vorher |
| **K2** `feat/kino-access` | Rollenprüfung (`bot`/`user`), Cache, `/kino/zugang`, `/api/kino/me`, Admin-Host mit Access-JWT + Allowlist, CSP enforcing | K1 | ja, Secrets vorher setzen |
| **K3** `feat/kino-rooms` | `KinoRoom` DO, WS-Ticket, Hibernation, Presence, Uhr-Offset im Client, Saal-Seite mit Countdown/Live/Ende | K2 | ja |
| **K4** `feat/kino-hls` | Manifest-Rewrite, Segment-Signatur, Origin-Fetch über Access-Service-Token, `ready.json`-Erkennung (`hls_ready`, `duration_s`), Caps und Rate-Limits | K3 | ja, zusammen mit Rex' `ready.json` |
| **K5** `feat/kino-admin-films` | TMDB-Import (Titel tippen oder Datei wählen), `/scan`-Client, Dateiabgleich mit `matched`/`ambiguous`/`unmatched`, `/dateien`, Filmliste, Trailerimport aus dem Videos-Endpunkt | K2 + Rex' `/scan` | ja |
| **K5b** `feat/kino-ingest` | `POST /api/kino/ingest` (§5.3): HMAC-Prüfung, Replay-Fenster, Status nur vorwärts, `file_hash`/`rel_path` in `kino_files`, `hls_ready`/`duration_s` aus `ready.json`, `KINO_INGEST_SECRET` | K2 + Rex' Watcher | ja, Secret vorher setzen |
| **K6** `feat/kino-planner` | Wochenplaner, Konfliktprüfung, Veröffentlichen, Staffeln, „neu und regelmäßig“ | K5 | ja |
| **K7** `feat/kino-bot-api` | `/api/kino/bot/schedule` + `reminders/due` + `ack` (Verträge aus §5.4) | K6 | ja |
| **K8** `feat/kino-reminders` | Abo-UI auf Programm/Film, Erinnerungsverwaltung, Ablauf ohne Rolle | K7 | ja |
| **K9** `feat/kino-suggestions` | Scoring + `/vorschlaege`, Bestätigung durch Nils | K6 | ja |
| **K10** `feat/kino-polish` | Screenshots 390/1280 × hell/dunkel, AA-Gate, leere Zustände, Feinschliff | alle | nein (nur Doku/Bilder) |

**Merge-Reihenfolge:** #44 → #45 → K1 → K2 → K3 → K4 (parallel K5 nach K2 möglich) → K6 → K7 → K8 → K9 → K10. K4 und K5 dürfen erst mergen, wenn der Tunnel steht, der Agent `GET /scan` beantwortet und für mindestens einen Film ein `ready.json` existiert; sonst ist die Saal-Seite ein schwarzer Kasten und die Dateiliste leer — beides sieht wie ein Fehler aus. K5b kommt zwischen K2 und K5, weil K5 die Zuordnung schon über `file_hash` führt. Kein K-PR setzt R2 voraus: alle bauen auf dem Tunnel auf, Plan A (§9.1) wäre ein eigener PR nach Nils' Freigabe.

**Bekannte Ausnahme bei Checks:** der Playwright-Runner-Fehler auf der Website (`ModuleNotFoundError: playwright`) ist kein Kino-Thema, muss aber je PR mit Begründung im Text stehen, wenn er als einziger rot ist.

## 9. Risiken (kurz)

- **Free-Tier-Grenzen der DO:** Requests pro Tag und SQLite-Storage sind begrenzt; ein Abend mit 20 Zuschauern ist unkritisch, ein Dauerbetrieb mit Presence-Pings nicht. Pings daher auf 10 s, Presence nur bei Änderung.
- **Uhr auf dem PC von Nils:** HLS-Segmente kommen mit Verzögerung, wenn die Leitung schwankt. Der Client puffert 6 s; die Position kommt aus der DO-Uhr, nicht aus dem Puffer.
- **Ein Origin, ein Flaschenhals.** Wenn Nils' PC schläft, ist der Saal leer. Das ist ein Betriebsrisiko, kein Codefehler — im Admin als Status „Origin offline“ sichtbar.
- **Video über CDN/Tunnel ist im Free-Plan ein AGB-Risiko, keine Grauzone.** Die CDN-Bedingungen erlauben Video im Free-, Pro- oder Business-Plan nur über die dafür vorgesehenen bezahlten Dienste (Stream, Images, R2) und behalten sich vor, den Zugriff zu drosseln oder abzuschalten: <https://www.cloudflare.com/service-specific-terms-application-services/#content-delivery-network-terms>, erläutert unter <https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare>. Das ist eine Entscheidung für Nils, keine technische Frage — Optionen in §9.1.
- **Request-Budget pro Abend.** Ein 2-h-Film hat bei 6-s-Segmenten rund 1.200 Segmente plus ~40 Playlist-Aufrufe pro Zuschauer; bei 20 Zuschauern sind das etwa 25.000 Worker-Requests pro Abend. Das liegt unter 100k/Tag, trägt aber nur **einen** Abend pro Tag. 6-s-Segmente (§1.4) sind Teil der Antwort.
- **Upload ist der echte Flaschenhals.** 1080p mit 4,5 Mbps × 20 Zuschauer ≈ **90 Mbit/s Upload** aus Nils' Anschluss, dauerhaft für zwei Stunden. Das ist mehr, als ein normaler Kabelanschluss liefert; deshalb stehen Zuschauer- und Qualitäts-Cap als Option (§9.1), nicht als Automatik.

### 9.1 Auslieferung: Optionen (nichts entschieden — Nils entscheidet)

Beschrieben ist in §1.4/§1.5 die Variante „alles durch den Worker“ (Plan B, Tunnel). Die zweite Plan-B-Spielart (Origin prüft die Signatur selbst) und Plan A (R2) stehen hier nur als Optionen; kein PR setzt eine davon voraus.

**Plan A — R2 als Speicher, Auslieferung über Cloudflare.**

- Free-Tier laut aktueller Doku (<https://developers.cloudflare.com/r2/pricing/>, Stand 30.10.2026): **10 GB-Monat Speicher**, **1 Mio. Class-A-** und **10 Mio. Class-B-Operationen pro Monat**, **Egress frei**. Darüber: 0,015 USD/GB-Monat, 4,50 USD/Mio Class A, 0,36 USD/Mio Class B.
- Video aus R2 ist laut Cloudflare erlaubt — R2 ist einer der Dienste, mit denen Video über das CDN ausgeliefert werden darf (dieselben CDN-Bedingungen, Link oben).
- **R2 ist nicht „einfach da“:** Die Aktivierung läuft über einen Abo-Checkout im Dashboard, ein **Zahlungsmittel ist nötig**, auch wenn die Nutzung im Free-Tier bleibt (<https://developers.cloudflare.com/r2/get-started/>). Deshalb bleibt R2 **deaktiviert**, bis Nils selbst die Zahlungsdaten hinterlegt und das ausdrücklich freigibt; bis dahin wird lokal bzw. gegen Mocks entwickelt.
- Wenn R2 kommt: privater Bucket (nie public, nie Custom Domain ohne Signatur), laufende Filme werden automatisch hochgeladen, alte automatisch entfernt, und der Worker macht nur Login, Rollenprüfung und kurzlebige signierte bzw. presigned URLs — **Video geht nie durch den Worker**.
- Nachteil ehrlich benannt: der Upload passiert **einmal pro Film**, nicht pro Zuschauer; die Leitung leidet also beim Einspielen, nicht beim Abend.

**Plan B — Tunnel, so wie dieses Dokument sonst beschreibt.**

- Der Origin prüft die HMAC selbst: ein kleiner Proxy (Node/Go) vor dem Static-Server, weil nginx `secure_link` nur MD5 kann. Der Worker stellt dann nur den Link aus; Segmente bleiben `no-store`. Eine Access-Policy auf `/hls/*` ist dann unmöglich (der Browser hat keinen Service-Token), also Bypass genau für diesen Pfad plus eigene Signaturprüfung.
- Bleibt das AGB-Risiko aus §9 und die Upload-Last (~90 Mbit/s bei 20 × 1080p). Optionen dagegen: Cap „ab N Zuschauern nur 720p“, Cap auf Zuschauerzahl, oder Fallback auf `playit.gg`, wenn der Tunnel bricht.
- Segmente nie in den Cloudflare-Cache (`no-store` plus Cache-Rule Bypass), in keiner der beiden Varianten.

## 10. Open Questions

1. **Werbung vor TMDB-Trailern — entschieden (03.11.): Einbettung bleibt, Poster-Karte ist der Fallback.** `youtube-nocookie` reduziert nur Cookies, es schaltet keine Anzeigen ab; vor offiziellen Studio-Trailern ist Pre-Roll selten, aber technisch nicht ausschließbar. Entscheidung: Trailer laufen ausschließlich als `nocookie`-Embed aus dem TMDB-Videos-Endpunkt (§3). Kann ein Clip nicht starten, zeigt der Saal die Poster-Karte, das Vorprogramm läuft weiter. Lokale Dateien in `kino\trailer` bleiben optional, kein Pflichtweg. Kein Rippen von YouTube (lizenzrechtlich heikel). Restrisiko: Ein Pre-Roll ist nicht ausschließbar; dann greift der Poster-Karten-Fallback (§3) — „Werbung akzeptieren“ ist keine Option mehr.
2. **Rolle: `bot` oder `user`?** Hängt davon ab, ob Moci bereits im Discord-Server ist. Der Bot braucht nur Lesezugriff auf Mitglieder (Server Members Intent bzw. `View Members`), **kein** `Manage Roles`. Ohne Bot-Token bleibt nur der User-Scope `guilds.members.read`, der alle Nutzer zu einem neuen Consent zwingt.
3. **Wer darf senden?** Nur Nils, oder auch Mods? Der Plan geht von „nur Admin“ aus; eine zweite Rolle (`kino_host`) wäre ein Aufwasch in K2.
4. **Zuschauerzahl öffentlich?** Chip im Saal ja. Auf dem Programm erst ab einer Schwelle (z. B. ab 3), damit ein leerer Saal nicht traurig aussieht — Nils entscheidet.
5. **Ein Raum oder mehrere?** Der Plan sieht mehrere Räume (`kino_rooms`) mit einem Default „Hauptsaal“ vor. Kosten und Verwirrung steigen mit jedem Raum; Start mit einem ist legitim.
6. **Aufbewahrung.** Wie lange bleiben Sendungen und Erinnerungen? Vorschlag: Sendungen unbegrenzt (Archiv für `/kino/verpasst`), Erinnerungen 30 Tage nach `ends_at`, Access-Cache 5 Min. Löschen nur mit Nils.
7. **Trailer-Sprache.** `language=de-DE` plus `include_video_language=de,en,null`: Deutsch bevorzugt, Englisch als Fallback, sonst hat der Film kein Vorprogramm. Reicht das, oder nur Deutsch (dann fallen mehr Filme raus)?
8. **Rechtliches.** Öffentliches Vorführen von Filmen für einen geschlossenen Discord-Kreis ist dennoch ein Aufführungsrecht-Thema. Vor dem ersten echten Abend mit Nils klären; der Plan liefert die Technik, nicht die Lizenz.
9. **`ends_at` Genauigkeit.** Kommt aus `ready.json` (`duration_s`), das der Scan automatisch setzt. Weicht die echte Wiedergabe ab, endet die Segment-Signatur zu früh oder zu spät. Vorschlag: `ends_at = starts_at + duration_s*1000 + 120000` Puffer.
10. **Backup.** Für das Kino relevant sind D1-Zeilen (klein) und `ready.json`/HLS-Ordner (groß, lokal). Reicht ein monatlicher D1-Export nach `backups/`, oder braucht Rex einen eigenen Ablageplan?
11. **TMDB-Token: wer setzt ihn, und wie lange darf gecacht werden?** Nils legt den kostenlosen Account selbst an; der Read-Token geht per `wrangler secret put TMDB_READ_TOKEN` in den Worker bzw. in den Vault (§7.1.1), der Wert steht nie im Repo und nie im Chat. Offen bleibt: (a) Refresh-Intervall für `metadata_synced_at` — Empfehlung 90 Tage, deutlich unter dem 6-Monats-Cache-Limit der TMDB-Bedingungen; (b) wo genau die Attribution sitzt — Empfehlung Footer der Kinoseiten plus Fußzeile im Admin, weil die TMDB-Bedingungen sie verlangen.
12. **Was passiert mit Dateien ohne TMDB-Treffer?** Vorschlag: `unmatched` bleibt sichtbar in `/dateien`; Nils korrigiert den Suchbegriff oder wählt einen Treffer. Ein manuelles Metadatenformular gibt es nicht (Global Constraints). Bleibt eine Datei dauerhaft ohne Treffer, ist sie **nicht planbar** — Alternative wäre ein Film mit leerem Poster und leerer Beschreibung, was im Saal schlechter aussieht als ein fehlender Film. Empfehlung: nicht planbar.
13. **Schwelle des Dateiabgleichs.** 0.85 automatisch, 0.55–0.85 zum Auswählen ist eine Setzung, keine Messung. Vorschlag: nach den ersten 20 echten Dateien einmal nachjustieren; jede Fehlzuordnung wird in `/dateien` mit einem Klick gelöst, nicht im Code. Dazu offen: Umlaute und Sonderzeichen (`ä`, `ß`, `&`) vor dem TMDB-Query ASCII-folden — Vorschlag ja, sonst finden Filme mit Umlaut im Namen ihren Treffer nicht.
14. **Wer baut den Origin-Agenten?** `GET /scan` und `POST /jobs` (§5.2) sind ein Dienst auf Nils' PC. Zwei Wege: Rex erweitert seinen bestehenden Dienst, oder es wird ein separates kleines Skript mit eigenem `cloudflared`-Ingress. Empfehlung: Rex erweitert seinen Dienst, weil dann Tunnel, Access-Token und Ordnerpfade an einer Stelle liegen — aber das ist Rex' Entscheidung, nicht die des Workers.

15. **Auslieferung: Plan A (R2) oder Plan B (Tunnel)?** Beide sind in §9.1 nur beschrieben, nicht entschieden. Empfehlung: mit Plan B starten (kein Zahlungsmittel, kein zusätzlicher Dienst) und R2 erst aktivieren, wenn die Zuschauerzahl die Upload-Leitung wirklich sprengt. Die Aktivierung selbst macht **Nils** — Zahlungsmittel und Freigabe liegen bei ihm, bis dahin bleibt R2 aus und die Entwicklung läuft lokal bzw. gegen Mocks.
