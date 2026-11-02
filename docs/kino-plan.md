# Online-Kino: Plan (Discord-Mitglieder only)

> **Dieses Dokument ist der Plan, nicht die Umsetzung.** Es ändert keinen Worker, kein Schema, keine Route und kein Frontend. Die Umsetzung sind die Folge-PRs in [Split](#8-split-in-folge-prs), jeder gegen `main` und jeder mit eigenen grünen Checks. Grundlage ist der Stand von `main` nach #44 (Design-System) und #45 (AI-Panel-Fixes). Stand 03.11.2026: ergänzt um Nils' Vorgaben — nichts von Hand pflegen, Trailer nur aus dem TMDB-Videos-Endpunkt, Dateiabgleich gegen `kino\filme` mit Flag für Unzugeordnetes, TMDB-Token nur im Vault.

**Goal:** Ein Online-Kino auf `nwebnotfound.dev/kino`, das nur Mitglieder des Discord-Servers betreten können, in dem alle im selben Raum denselben Film zur gleichen Sekunde sehen (synchron, ohne Play/Pause), mit einem Programmplan aus Staffeln (Halloween-Horror, Weihnachten), offiziellen TMDB-Trailern als Vorprogramm und einem Admin auf `admin.nwebnotfound.dev`, in dem Nils **nichts von Hand pflegt**: Er tippt einen Filmtitel ein oder wählt eine Datei aus `C:\Users\nilsw\kino\filme`, und der Import holt Poster, Backdrop, Beschreibung, Laufzeit, Genre, Bewertung und Trailer aus TMDB und legt sie in D1 ab. Was nicht automatisch zuzuordnen ist, steht als offene Zeile im Admin — nachziehen, nicht eintippen.

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
- **Löschen nur mit Nils.** Filme, Sendungen, Staffeln, Dateizeilen und Zuschauerzeilen werden deaktiviert (`archived_at`), nicht gelöscht.
- **Nichts von Hand pflegen.** Der Admin kennt genau zwei Eingaben: einen Filmtitel tippen oder eine Datei aus `kino\filme` wählen. Poster, Backdrop, Beschreibung, Laufzeit, Genre, Bewertung und Trailer kommen ausschließlich aus TMDB. Ein Eingabefeld für `overview`, `runtime` oder `poster_path` ist ein Review-Blocker: es erzeugt eine zweite Wahrheit, die der nächste Import wieder überschreibt.
- **TMDB ist die einzige Metadatenquelle, YouTube nur als Einbettung.** Keine lokal gespeicherten Bilder, keine gerippten Trailer als Pflicht. Ein lokaler Trailer in `kino\trailer` ist ein optionaler Fallback (§3), nie Voraussetzung für einen Abend.
- **Der Ordner ist die Wahrheit für Dateien.** Was in `C:\Users\nilsw\kino\filme` liegt, ist der Katalog; D1 (`kino_files`) spiegelt den Scan. Der Worker liest den Datenträger nie selbst — der Abgleich läuft ausschließlich über den Origin-Agenten (§5.2).
- **Keine Fritzbox-Portfreigabe.** Der Origin hängt ausschließlich am ausgehenden `cloudflared`-Tunnel.

---

## 1. Architektur auf Cloudflare Free

### 1.1 Bausteine

| Baustein | Was | Wo |
| --- | --- | --- |
| Worker `nwebnotfound-site` | Seiten `/kino/*`, API `/api/kino/*`, Admin-Host, Manifest-Rewrite | `src/kino-*.js`, geroutet aus `src/worker.js` |
| D1 `DB` | Filme, Sendungen, Räume, Staffeln, Trailer, Einstellungen, Erinnerungen | `migrations/00xx_kino_*.sql` |
| Durable Object `KinoRoom` | eine Instanz pro Raum: Serveruhr, Startzeit, Anwesenheit, WebSocket-Fanout | `src/kino-room.js`, Binding `KINO_ROOMS` |
| `cloudflared` + Origin-Agent (Rex) | liefert `/hls/**`, listet den Filmordner (`GET /scan`) und nimmt Transcode-Aufträge an (`POST /jobs`) | nicht im Repo, läuft auf Nils' PC |
| Cloudflare Access | Schutz von `admin.nwebnotfound.dev` | Dashboard, Anwendung „Kino Admin“ |
| TMDB API | einzige Quelle für Metadaten und Trailer: Poster, Backdrop, Beschreibung, Laufzeit, Genre, Bewertung, YouTube-Keys | serverseitig im Worker, Ergebnis in D1 |

Der Browser spricht nur mit `nwebnotfound.dev`. Er spricht nie mit dem Origin und nie mit TMDB.

### 1.2 Datenmodell (D1)

Alle Zeiten als **ganzzahlige Unix-Millisekunden** (`INTEGER`), wie bei `mc_vip_commands`. Kein `datetime('now')` in Kino-Tabellen, damit Client, DO und Bot dieselbe Einheit sehen.

```
kino_films        id TEXT PK (ULID), tmdb_id INTEGER UNIQUE, slug TEXT UNIQUE,
                  title TEXT, original_title TEXT, year INTEGER, runtime_min INTEGER,
                  overview TEXT, poster_path TEXT, backdrop_path TEXT,
                  vote_average REAL, release_date TEXT, genres TEXT (JSON),
                  metadata_synced_at INTEGER,        -- letzter TMDB-Import (Refresh, §4.1)
                  hls_path TEXT, hls_ready INTEGER DEFAULT 0, duration_s INTEGER,
                  created_at INTEGER, archived_at INTEGER NULL

kino_files        path TEXT PK,                  -- relativ zu kino\filme, nie absolut
                  size_bytes INTEGER, mtime INTEGER,
                  parsed_title TEXT, parsed_year INTEGER,
                  film_id TEXT NULL REFERENCES kino_films(id),
                  state TEXT ('matched'|'ambiguous'|'unmatched'|'ignored'),
                  candidates TEXT (JSON, Top-3-Treffer nur bei 'ambiguous'),
                  first_seen_at INTEGER, last_seen_at INTEGER, archived_at INTEGER NULL
                  INDEX (state), INDEX (film_id)

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

`kino_files` ist der Katalog aus dem Scan: eine Zeile pro Datei in `kino\filme`, `path` relativ und stabil, `state` macht sichtbar, was der Abgleich nicht selbst entscheiden konnte (§4.2). Absolute Pfade stehen nie in der D1 — der Ordner kann umziehen, ohne dass Zeilen brechen.

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
- **Driftkorrektur clientseitig.** Liegt die Abweichung über 2 s, springt der Player auf das nächste Keyframe (`hls.currentLevel` + `seek`). Zwischen 250 ms und 2 s wird `playbackRate` auf 0.98 bzw. 1.02 gesetzt, nach 5 s zurück auf 1.0. `prefers-reduced-motion` ändert daran nichts, weil es kein UI-Effekt ist.
- **Anwesenheit:** Der DO hält die Menge der offenen Sockets (Hibernation-API, `state.acceptWebSocket`), zählt je Socket die `discord_id` (aus dem signierten Ticket) und sendet bei Join/Leave ein `{type:"presence", viewers:n}` an alle. Live-Zahl ohne Polling.
- **Hibernation:** WebSocket-Hibernation ist Pflicht, damit ein Abend mit 20 Zuschauern nicht 20-mal Dauer in Rechnung stellt. Der DO darf zwischen zwei Events keinen Timer brauchen; Aufräumen passiert bei `alarm()` bzw. beim nächsten Event.
- **Raum leer:** Geht die letzte Verbindung, bleibt `startsAt` stehen. Der nächste Zuschauer kommt mitten in den Film — genau wie im echten Kino.

### 1.4 HLS vom PC über den Tunnel

- Rex baut pro Film das Transcoding und den Ordner: eine Leiter `1080p` (4.5 Mbps) und `720p` (2.5 Mbps), H.264 High + AAC-LC 128k, **4-Segment-GOP, 4 s Segmente, Keyframes auf jeder Segmentgrenze**, `master.m3u8` plus Varianten, alles mit `#EXT-X-INDEPENDENT-SEGMENTS`.
- Die Wurzel ist `C:\Users\nilsw\kino` (`<kino-root>`) mit genau drei Unterordnern: `filme\` (Master, Nils legt ab), `hls\<film_id>\` (Ausgabe von Rex) und `trailer\` (optional). Die `film_id` ist die ULID aus `kino_films`, damit Ordner und Datenbank ohne Mapping zusammenpassen. `hls_path` in der DB ist relativ: `/hls/<film_id>/master.m3u8`. Die Dateiliste in `filme\` liest der Worker nur über den Origin-Agenten (§5.2), nie direkt.
- `cloudflared` veröffentlicht nur diesen Ordner (lokales `http`-Origin auf `127.0.0.1`), dazu Cloudflare Access mit **Service-Token** auf dem Origin-Hostnamen. Der Hostname hat keine öffentliche DNS-Auflösung ohne Access; `origin.kino.nwebnotfound.dev` existiert für Zuschauer nicht.
- Der Worker holt das Manifest mit `CF-Access-Client-Id`/`CF-Access-Client-Secret` (als Secrets), schreibt die Playlist um und liefert sie mit `Cache-Control: no-store`. Segmente liefert der Worker als 302 auf eine signierte URL **oder** streamt durch — Entscheidung in §1.4.
- **Kein Handgriff beim Bereitstellen:** Rex' Agent meldet im Scan, ob `hls/<film_id>/ready.json` existiert (und `duration_s`), der Worker setzt `hls_ready=1` daraus selbst. Es gibt keinen „Film ist bereit“-Knopf und keine zu kopierende Film-ID: die ULID entsteht beim Zuordnen der Datei (§4.2) und geht mit dem Transcode-Auftrag an Rex. Kein Upload über die Website.

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

## 3. Vorprogramm (nur TMDB-Trailer)

- **Eine einzige Quelle:** `GET https://api.themoviedb.org/3/movie/{tmdb_id}/videos?language=de-DE&include_video_language=de,en,null`. Behalten werden ausschließlich Einträge mit `site === "YouTube"`, `type === "Trailer"` und `official === true`; gespeichert wird nur der `key` (die YouTube-ID). Teaser, Clips, Featurettes und Fan-Uploads werden verworfen, auch wenn sie besser aussehen — nicht die offizielle Fassung, unklarer Rechte-Status.
- Ablage in `kino_trailers` mit `source='tmdb'`, `position` und `language`; maximal drei pro Film, der kleinste `position` ist der Standard. Kein zweites Trailerfeld in `kino_films`.
- Einbettung ausschließlich als `https://www.youtube-nocookie.com/embed/<key>` mit **fester** Parameterliste: `controls=0`, `disablekb=1`, `fs=0`, `rel=0`, `iv_load_policy=3`, `modestbranding=1`, `playsinline=1`, `mute=1` beim Start (Ton nach Klick). Grund: der YouTube-Player bringt sonst Play/Pause, Zeitleiste, Vollbild und „weitere Videos“ mit — im Saal darf nur der Server den Takt vorgeben (§1.3). `iframe` mit `allow="autoplay; encrypted-media"` und `referrerpolicy="strict-origin-when-cross-origin"`.
- **Werbung: entschieden, aber nicht garantierbar.** `youtube-nocookie` reduziert Cookies, es schaltet keine Anzeigen ab. Vor offiziellen Studio-Trailern ist Pre-Roll selten, technisch ausschließbar ist er nicht (siehe §10.1). Fallback ohne Nils' Eingriff: Kann der Player nicht innerhalb von 3 s starten oder wird Werbung erkannt, ersetzt die **Poster-Karte** den Clip — das Vorprogramm läuft als Kartenfolge weiter und endet pünktlich bei `startsAt`, es bleibt kein schwarzer Kasten.
- **Lokale Trailer sind optional, nie Voraussetzung.** Liegt in `C:\Users\nilsw\kino\trailer` eine Datei zum Film, darf sie als kleines HLS-Vorprogramm laufen (`source='local'`, §5.2). Das ist ein manueller Fallback gegen Werbung, kein Pflichtschritt: ein Abend mit null lokalen Trailern ist vollständig. Kein automatisches Rippen von YouTube — fremde Uploads sind lizenzrechtlich heikel, eigene Rips ebenso.
- Timing hängt an der **DO-Uhr**, nicht an einer Browser-Uhr: der Client startet die Trailerliste `T − X` Minuten vor `startsAt` (X = Summe der Trailerlängen, gedeckelt auf 10 Minuten) und blendet 30 s vor Start den Countdown ein — dieselbe `serverNow`-Quelle wie der Film, damit alle im Saal dasselbe Vorprogramm sehen. Kein eigenes Intro, kein Werbeblock, keine „Wir sind gleich zurück“-Karte.
- CSP muss `frame-src https://www.youtube-nocookie.com` erlauben; sonst bleibt der Rahmen leer und es sieht wie ein Bug aus. Die YouTube-IFrame-API wird nicht genutzt, deshalb kein `script-src https://www.youtube.com`.

---

## 4. Admin

Fünf Flächen, alle unter `admin.nwebnotfound.dev`, alle mobil bedienbar (`/kino`-Admin wird auf dem Handy benutzt, wenn Nils unterwegs etwas verschiebt).

**4.1 Zwei Eingaben, alles andere aus TMDB.** Der Admin kennt genau zwei Wege, einen Film anzulegen: (a) **Titel tippen** — `GET /3/search/movie?query=&year=&language=de-DE`, Trefferliste mit Poster, Jahr und Laufzeit; (b) **Datei wählen** — die gescannte Liste aus `kino\filme` (§4.2), der Rest läuft automatisch. Beide enden im selben Import: `title`, `original_title`, `release_date`, `runtime`, `overview`, `poster_path`, `backdrop_path`, `vote_average` und `genres` (Namen, nicht IDs) plus Trailerliste (§3) per `tmdb_id`-Upsert; alles landet in D1 (`kino_films`), `metadata_synced_at` wird gesetzt. **Es gibt kein Metadatenformular:** Beschreibung, Laufzeit, Genre, Poster und Backdrop werden nicht getippt und nicht hochgeladen. Ein zweiter Import desselben Films aktualisiert statt zu duplizieren — und überschreibt keine Handkorrektur, weil es keine gibt. Gespeichert statt live geholt, weil das die Seiten schnell hält, TMDB-Aufrufe spart (ein Abend mit 20 Zuschauern soll nicht 20 × dieselben Metadaten ziehen) und die Seite auch dann noch zeigt, wenn TMDB gerade nicht antwortet. Poster über `https://image.tmdb.org/t/p/w500` (nicht `original`, das kostet nur Bytes); angezeigt wird `poster_path`, keine lokale Kopie. Pflicht nach TMDB-Bedingungen: Attribution (Logo/Hinweis) im Footer und im Admin.

**4.2 Dateiordner `kino\filme` abgleichen (das ist der Regelfall).** Nils legt Filme nur ab und pflegt keine Liste; der Abgleich ist ein Scan, kein Formular:

1. Der Origin-Agent (Rex) listet `C:\Users\nilsw\kino\filme` über `GET /scan` (§5.2) — nur Dateiname, Größe, mtime. Der Worker kann den Datenträger nicht selbst lesen, ohne diesen Endpunkt gibt es keinen Abgleich.
2. Der Worker parst den Dateinamen (`Der.Film.2023.German.1080p.WEB.x264-GRP.mkv` → Titel `Der Film`, Jahr `2023`; Release-Tags wie `1080p`, `2160p`, `WEB`, `BluRay`, `x264`, `German`, `DL` und die `-GRP`-Endung fallen weg) und sucht TMDB mit Titel + Jahr.
3. Bewertung des Treffers: `0.6 × Titelsimilarity(normalisiert) + 0.4 × (Jahr exakt ? 1 : Jahr ±1 ? 0.5 : 0)`. Ab **0.85** wird automatisch zugeordnet (`state='matched'`), zwischen **0.55 und 0.85** wird die Datei `ambiguous` (Admin zeigt die Top 3 mit Poster zum Klicken), darunter `unmatched`.
4. Jede Datei bekommt eine Zeile in `kino_files`; der Scan ist idempotent (`path` als PK, `last_seen_at` wird aktualisiert, eine bestehende Zuordnung bleibt). Eine bereits zugeordnete Datei wird nicht erneut gesucht.
5. **Unzugeordnetes wird angezeigt, nicht verschluckt:** `/dateien` listet jede Datei mit `state='unmatched'` samt geparstem Titel und Jahr, dazu zwei Aktionen — „Suchbegriff korrigieren“ (nur der Suchtext) und „TMDB-Treffer wählen“. Bleibt es ohne Treffer, ist der Film planbar nur mit Warnung: die Metadaten bleiben leer, statt erfunden zu werden.
6. Nach der Zuordnung schickt „Transcodieren“ `film_id` + Quellpfad an den Origin (`POST /jobs`, §5.2); Rex encodiert nach `hls\<film_id>\`. Der nächste Scan sieht `hls\<film_id>\ready.json` und setzt `hls_ready=1` und `duration_s` selbst — kein „Film bereit“, keine kopierte ID.
7. Auslöser: Knopf „Jetzt scannen“ auf `/dateien` plus Cron alle 30 Minuten (Workers Cron Trigger). TMDB wird nur für neue oder unklare Dateien gefragt; bekannte Dateien kosten einen D1-Write. Ist der Agent offline, bleibt der letzte Stand stehen und `/dateien` zeigt „Origin offline, Stand <Zeit>“ — kein leerer Katalog.
8. `kino\trailer` wird im selben Scan gelesen, ist aber optional (§3): eine lokale Datei ersetzt nur den YouTube-Trailer, sie ist nie Bedingung für einen Abend.

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
| `GET /api/kino/reminders` / `POST` / `DELETE` | Erinnerungen des eingeloggten Nutzers (siehe 5.3) |

### 5.2 Mit Rex (Origin: Dateiordner, Transcoding, HLS)

Der Worker sieht kein Dateisystem. Alles, was mit `C:\Users\nilsw\kino` passiert, geht über den Origin-Agenten von Rex, erreichbar **nur** über den `cloudflared`-Tunnel mit Access-Service-Token.

- **Ablage, eine Wurzel und drei Unterordner.** `<kino-root>` = `C:\Users\nilsw\kino`:
  - `filme\` — Master (`.mkv`/`.mp4`), von Nils abgelegt, Dateiname frei. Das ist der Katalog; der Worker liest ihn über `GET /scan`.
  - `hls\<film_id>\` — Encode-Ausgabe: `master.m3u8`, `720p/index.m3u8`, `1080p/index.m3u8`, Segmente `seg_00001.ts`, `ready.json`.
  - `trailer\` — optional, lokale Trailerdateien (§3). Leer ist ein gültiger Zustand.

  `film_id` ist die ULID aus `kino_films`. Sie entsteht beim Zuordnen der Datei (§4.2) und geht mit dem Auftrag an Rex — Nils kopiert nie eine ID.
- **`GET /scan`** (JSON, Header `x-kino-origin: 1` plus Access-Service-Token) — die einzige Sicht auf den Ordner:

  ```json
  { "generated_at": 1794000000000,
    "films":  [ { "path": "Der.Film.2023.German.1080p.mkv", "size_bytes": 8123456789, "mtime": 1793900000000 } ],
    "hls":    [ { "film_id": "01J...", "has_master": true, "ready": true, "duration_s": 6420,
                  "ladder": ["720p","1080p"], "built_at": 1793950000000 } ],
    "trailers": [ { "path": "Der.Film.2023.trailer.mp4", "size_bytes": 41234567, "mtime": 1793900000000 } ] }
  ```

  Regeln: nur Dateiname, Größe und mtime — keine Inhalte, keine Hashes von Videodaten. Pfade relativ zur Wurzel, `..` und alles außerhalb der drei Ordner wird abgelehnt (Path-Traversal), Symlinks werden nicht verfolgt. Maximal 5.000 Einträge, darüber `413`. Antwort mit `Cache-Control: no-store`, kein Verzeichnislisting als HTML.
- **`POST /jobs`** (Transcode-Auftrag), Body `{ "film_id": "...", "source": "Der.Film.2023.German.1080p.mkv", "ladder": ["720p","1080p"] }`, Antwort `{ "job_id": "...", "queued_at": ms }`. Idempotent über `film_id`: solange kein `ready.json` für den Film existiert, ändert ein zweiter Auftrag nichts. Rex encodiert nach `hls\<film_id>\` mit der Leiter aus §1.4 und legt dort `ready.json` ab: `{ "segments": n, "duration_s": n, "ladder": [...], "built_at": ms }`.
- **Bereitschaft ohne Handgriff.** Der Worker liest `ready.json` beim Scan (`hls[].ready`, `duration_s`) und setzt `hls_ready=1` sowie `duration_s` selbst; daraus kommt `ends_at`. Der alte Ablauf „Nils klickt Film bereit“ entfällt ersatzlos.
- **Manifest:** Pfade **relativ** zum Filmordner (`720p/index.m3u8`), `#EXT-X-VERSION:3`, `#EXT-X-INDEPENDENT-SEGMENTS`, `#EXT-X-TARGETDURATION:4`.
- **Auth zwischen Tunnel und Worker:** `cloudflared` veröffentlicht nur `origin.kino.nwebnotfound.dev` mit Access-Service-Token. Der Worker sendet `CF-Access-Client-Id` + `CF-Access-Client-Secret` (beide Secrets, nie im Repo) und `x-kino-origin: 1`; der Agent liefert ohne diesen Header nichts. Kein Query-Token im Pfad, kein Basic-Auth mit geteiltem Passwort in der URL.
- **Kein Rückkanal.** Der Agent schreibt nie in die D1; er listet, encodiert und meldet. Die D1 ist die Sicht des Workers auf den Ordner, nicht umgekehrt. Ein fehlender Eintrag heißt „nicht mehr gesehen“, nicht „gelöscht“ (`archived_at`, §Global Constraints).

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

### 5.4 Admin (`admin.nwebnotfound.dev`)

Zusätzlich hinter Access-JWT + `ADMIN_DISCORD_ID` (§2.2); alle `POST` nur mit `Origin: https://admin.nwebnotfound.dev` bzw. `Sec-Fetch-Site: same-origin`.

| Route | Zweck |
| --- | --- |
| `GET /api/kino/admin/files?state=` | Katalog aus `kino_files` mit `parsed_title`, `parsed_year`, `candidates` |
| `POST /api/kino/admin/scan` | `GET /scan` beim Agenten auslösen, Abgleich fahren, Antwort `{added, matched, ambiguous, unmatched, ready}` |
| `POST /api/kino/admin/files/<path>/match` | `{tmdb_id}` zuordnen (für `ambiguous`/`unmatched`) — der einzige „das ist der richtige Film“-Klick |
| `POST /api/kino/admin/files/<path>/ignore` | Datei ausblenden (`state='ignored'`), nie löschen |
| `POST /api/kino/admin/films/import` | `{tmdb_id}` oder `{query}` → Import nach §4.1 (Upsert, `metadata_synced_at`) |
| `POST /api/kino/admin/films/<id>/transcode` | `POST /jobs` beim Agenten, Antwort `{job_id}` |

`<path>` ist immer relativ und URL-kodiert (nie absolut). Ein Pfad außerhalb von `kino\filme` ergibt 400, ein unbekannter 404 — nie 500.

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
9. `/dateien` — **neu:** der Ordner `kino\filme` wie gescannt, Zustand je Datei (`matched`/`ambiguous`/`unmatched`), „Jetzt scannen“, „Transcodieren“, „Suchbegriff korrigieren“. Alles, was der Abgleich nicht selbst entschieden hat, steht hier — die einzige Stelle, an der Nils nachzieht.
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

Kein Schlüssel steht in `wrangler.jsonc` (dort nur Routen und Bindings), im HTML, in `public/`, in `screenshots/` oder in einem PR-Text. Der Import-Fehler „key in repo“ ist ein Review-Blocker, kein Nit.

### 7.1.1 TMDB: Account und Token (macht Nils selbst)

1. Nils legt auf themoviedb.org einen **kostenlosen** Account an (kein bezahlter Plan, keine Zahlungsdaten) und erzeugt unter Settings → API einen **API Read Access Token (v4)**.
2. Der Token geht ausschließlich per `wrangler secret put TMDB_READ_TOKEN` in den Worker bzw. in den Vault; lokal nur in `.dev.vars` (uncommitted). Kein Fallback im Code: der Worker liest ihn aus `env.TMDB_READ_TOKEN`, fertig.
3. **Nie** in `wrangler.jsonc`, `public/`, `docs/`, `screenshots/`, PR-Text oder Chat. Tippt jemand den Wert in einen dieser Orte, ist das ein Review-Blocker und der Token wird sofort rotiert.
4. Der Worker schickt ihn serverseitig als `Authorization: Bearer <token>`; der Browser sieht ihn nie, es gibt keinen Proxy über Dritte.
5. Fehlt der Token, antwortet der Import `503 { "error": "tmdb_not_configured" }` und `/einstellungen` zeigt „TMDB-Token fehlt“ — kein stiller Fehlschlag, keine erfundenen Metadaten.
6. Attribution ist nach TMDB-Bedingungen Pflicht: Hinweis „Metadaten und Bilder von TMDB“ im Footer der Kinoseiten und im Admin, Bilder ausschließlich über `image.tmdb.org`.

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
| **K1** `feat/kino-schema` | Migrationen `kino_*` inkl. `kino_files`, `wrangler.jsonc` (Admin-Route, DO-Binding `new_sqlite_classes`, Cron Trigger), leere Routen, `kino_settings` mit Defaults | #44, #45 | Migration mit Export vorher |
| **K2** `feat/kino-access` | Rollenprüfung (`bot`/`user`), Cache, `/kino/zugang`, `/api/kino/me`, Admin-Host mit Access-JWT + Allowlist, CSP enforcing | K1 | ja, Secrets vorher setzen |
| **K3** `feat/kino-rooms` | `KinoRoom` DO, WS-Ticket, Hibernation, Presence, Uhr-Offset im Client, Saal-Seite mit Countdown/Live/Ende | K2 | ja |
| **K4** `feat/kino-hls` | Manifest-Rewrite, Segment-Signatur, Origin-Fetch über Access-Service-Token, `ready.json`-Erkennung (`hls_ready`, `duration_s`), Caps und Rate-Limits | K3 | ja, zusammen mit Rex' `ready.json` |
| **K5** `feat/kino-admin-films` | TMDB-Import (Titel tippen oder Datei wählen), `/scan`-Client, Dateiabgleich mit `matched`/`ambiguous`/`unmatched`, `/dateien`, Filmliste, Trailerimport aus dem Videos-Endpunkt | K2 + Rex' `/scan` | ja |
| **K6** `feat/kino-planner` | Wochenplaner, Konfliktprüfung, Veröffentlichen, Staffeln, „neu und regelmäßig“ | K5 | ja |
| **K7** `feat/kino-bot-api` | `/api/kino/bot/schedule` + `reminders/due` + `ack` (Verträge aus §5.3) | K6 | ja |
| **K8** `feat/kino-reminders` | Abo-UI auf Programm/Film, Erinnerungsverwaltung, Ablauf ohne Rolle | K7 | ja |
| **K9** `feat/kino-suggestions` | Scoring + `/vorschlaege`, Bestätigung durch Nils | K6 | ja |
| **K10** `feat/kino-polish` | Screenshots 390/1280 × hell/dunkel, AA-Gate, leere Zustände, Feinschliff | alle | nein (nur Doku/Bilder) |

**Merge-Reihenfolge:** #44 → #45 → K1 → K2 → K3 → K4 (parallel K5 nach K2 möglich) → K6 → K7 → K8 → K9 → K10. K4 und K5 dürfen erst mergen, wenn der Tunnel steht, der Agent `GET /scan` beantwortet und für mindestens einen Film ein `ready.json` existiert; sonst ist die Saal-Seite ein schwarzer Kasten und die Dateiliste leer — beides sieht wie ein Fehler aus.

**Bekannte Ausnahme bei Checks:** der Playwright-Runner-Fehler auf der Website (`ModuleNotFoundError: playwright`) ist kein Kino-Thema, muss aber je PR mit Begründung im Text stehen, wenn er als einziger rot ist.

## 9. Risiken (kurz)

- **Free-Tier-Grenzen der DO:** Requests pro Tag und SQLite-Storage sind begrenzt; ein Abend mit 20 Zuschauern ist unkritisch, ein Dauerbetrieb mit Presence-Pings nicht. Pings daher auf 10 s, Presence nur bei Änderung.
- **Uhr auf dem PC von Nils:** HLS-Segmente kommen mit Verzögerung, wenn die Leitung schwankt. Der Client puffert 6 s; die Position kommt aus der DO-Uhr, nicht aus dem Puffer.
- **Ein Origin, ein Flaschenhals.** Wenn Nils' PC schläft, ist der Saal leer. Das ist ein Betriebsrisiko, kein Codefehler — im Admin als Status „Origin offline“ sichtbar.

## 10. Open Questions

1. **Werbung vor TMDB-Trailern — entschieden (03.11.): Einbettung bleibt, Poster-Karte ist der Fallback.** `youtube-nocookie` reduziert nur Cookies, es schaltet keine Anzeigen ab; vor offiziellen Studio-Trailern ist Pre-Roll selten, aber technisch nicht ausschließbar. Entscheidung: Trailer laufen ausschließlich als `nocookie`-Embed aus dem TMDB-Videos-Endpunkt (§3). Kann ein Clip nicht starten, zeigt der Saal die Poster-Karte, das Vorprogramm läuft weiter. Lokale Dateien in `kino\trailer` bleiben optional, kein Pflichtweg. Kein Rippen von YouTube (lizenzrechtlich heikel). Restrisiko: ein kurzer Werbespot bleibt möglich — akzeptiert.
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
