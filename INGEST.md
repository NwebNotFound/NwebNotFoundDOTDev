# MC-Ingest API (`POST https://nwebnotfound.dev/api/mc-ingest`)

Header: `x-ingest-token: <token>` (unverändert), `content-type: application/json`. Max. 8 MB pro Request (wegen Markt-Backfill; normale Pushes bleiben klein).
Alle Felder sind optional; alte Payloads (`servers` + `leaderboards`) funktionieren unverändert.

## Bestehend
- `servers`: `{ <key>: {online, players[], max, version, mode, uptime_seconds, tps} }` – max. 8 Server.
- `leaderboards`: `{ money|playtime|kills|deaths|blocks_mined|…: [{name, value}] }` – max. 12 Listen à 10 Einträge, **sortiert senden**.
- Jede Minute pushen; die Seite zeigt nur Daten < 5 Min.
- **Teile werden unabhängig gemergt** (`servers`, `leaderboards`, `leaderboards_weekly`, `links`, `players_stats`): Ein Push mit nur `leaderboards` lässt `servers` unangetastet und umgekehrt. Jeder Teil hat einen eigenen Zeitstempel; `/api/mc-data` prüft die Frische (< 5 Min.) pro Teil (`servers_fresh`, `leaderboards_fresh`, `servers_at`, `leaderboards_at`).

## Neu (Phase 2: Profile)
### `links` – verknüpfte Accounts (vom Discord-Bot)
```json
"links": [
  {"discord_id": "123456789012345678", "mc_name": "Steve", "mc_uuid": "8667ba71-b85a-4004-af54-457a9734eed7", "has_role": true, "verified": true}
]
```
- `discord_id`: Snowflake als String (15–21 Ziffern). `mc_name`: 1–16 Zeichen `[A-Za-z0-9_]`. `mc_uuid`: mit oder ohne Bindestriche.
- `has_role` / `verified`: nur exakt `true` zählt.
- Upsert pro `discord_id`, max. 200 pro Request. Ungültige Einträge werden still verworfen.
- `"links_full": true` → Tabelle wird vorher geleert (komplette Liste senden, z. B. für Entlinken/Rollenverlust). Sonst: nur Upsert; zum Entziehen den Eintrag mit `has_role:false` bzw. `verified:false` senden.

### `players_stats` – Stats pro Spieler
```json
"players_stats": {
  "8667ba71-b85a-4004-af54-457a9734eed7": {
    "money": 12500, "playtime": 93600, "kills": 42, "deaths": 7, "blocks_mined": 18342,
    "inventory": [{"item": "minecraft:diamond_pickaxe", "count": 1}]
  }
}
```
- Key = MC-UUID. Max. 200 Spieler, max. 24 Felder pro Spieler, Feldnamen `[a-z0-9_]{1,24}`.
- Werte: Zahlen (oder Strings ≤ 40 Zeichen). `playtime` in Sekunden, `money` in CP.
- `inventory` (optional): max. 41 belegte Slots `{item (≤48), count 1–999, slot? (0–40)}`. Wird nur dem eingeloggten Besitzer angezeigt.
  - **Slots (Paper/Bukkit):** `0–8` Hotbar, `9–35` Hauptinventar (3×9), `36` Stiefel, `37` Hose, `38` Brust, `39` Helm, `40` Nebenhand. Fehlt `slot`, füllt die Website sequentiell ab Hotbar.
  - Beispiel vollständig: `"inventory": [{"item":"diamond_sword","count":1,"slot":0},{"item":"oak_log","count":32,"slot":9},{"item":"elytra","count":1,"slot":38},{"item":"shield","count":1,"slot":40}]`
- Pro Spieler wird der Datensatz komplett ersetzt (immer alle Felder senden). Push z. B. alle 5 Min. oder bei Logout.

### Antwort
`{"ok":true,"servers":0,"leaderboards":0,"links":1,"players_stats":1}`

## Anzeige
`/api/profile` (Session-Cookie) liefert MC-Stats **nur**, wenn `verified && has_role`. Sonst einen Hinweis
(„Verknüpfe deinen Account im Discord mit /link“ / Code bestätigen / Rolle fehlt).


## Neu (Phase 3: Detail-Stats + Bestenlisten)
### `leaderboards` / `leaderboards_weekly`
```json
"leaderboards":        {"money":[{"name":"Steve","value":12500}], "playtime":[...], "blocks_mined":[...], "kills":[...], "kd":[...], "distance":[...]},
"leaderboards_weekly": {"money":[...], "playtime":[...], "blocks_mined":[...], "kills":[...], "kd":[...], "distance":[...]}
```
- Keys für die Seite `mc.nwebnotfound.dev/leaderboards`: `money` (CP), `playtime` (Sekunden), `blocks_mined`, `kills`, `kd` (Dezimalzahl, z. B. 2.35), `distance` (**Meter**).
- Max. 12 Listen à 10 Einträge `{name (MC-Name), value}`; der Server sortiert absteigend nach. `leaderboards_weekly` = laufende Woche (Mo 00:00 Europe/Berlin), gleiche Form.
- Beide werden getrennt gespeichert (eigener Zeitstempel) und bleiben auch ohne frischen Push sichtbar (mit „Stand“). Lesen: `GET /api/mc-leaderboards` → `{total:{updated_at,lists}, weekly:{updated_at,lists}}`.

### `players_stats.<uuid>.details`
```json
"players_stats": { "<uuid>": { "money": 12500, "playtime": 93600, "kills": 42, "deaths": 7, "blocks_mined": 18342,
  "details": {
    "mined":   {"stone": 9000, "deepslate": 3100, "diamond_ore": 14},
    "placed":  {"cobblestone": 800},
    "killed":  {"zombie": 30, "creeper": 12},
    "deaths_by": {"fall": 3, "lava": 1, "creeper": 2},
    "crafted": {"torch": 256},
    "playtime_by_world": {"world": 80000, "world_nether": 12000, "world_the_end": 1600},
    "distance_m": {"walk": 120000, "sprint": 40000, "fly": 9000, "swim": 2000, "boat": 3000, "horse": 0},
    "fished": 12, "traded": 40, "jumps": 5021, "damage_dealt": 3400, "damage_taken": 1200, "cp_earned": 40000, "shop_sales": 18
  } } }
```
- Maps (`mined`, `placed`, `killed`, `deaths_by`, `crafted`, `playtime_by_world`): `id → Zahl`, IDs ohne `minecraft:` (wird sonst entfernt), `[a-z0-9_./-]{1,48}`, max. 25 Einträge (der Server behält die 25 größten).
- `distance_m`: Meter (Vanilla-Stats in cm ÷ 100). `playtime_by_world` in Sekunden.
- Zahlen ≥ 0; ungültige Werte werden verworfen. Max. 16 KB JSON pro Spieler, sonst wird `details` verworfen.
- Gespeichert als JSON-Spalte `mc_player_stats.details`. Ohne `details` im Push bleiben die alten Details erhalten.
- Antwort enthält zusätzlich `details` und `leaderboards_weekly` (Anzahl).

## Neu (Phase 4: Markt, `mc.nwebnotfound.dev/markt`)
Quelle: Crafts Views `v_market` und `v_market_history`, gepusht von Creepy. Preise in **CP**. Item-IDs ohne `minecraft:` (wird sonst entfernt), `[a-z0-9_]{1,48}`.

### `market` – aktuelle Preise (komplette Liste, **ersetzt** den Bestand)
```json
"market": [{"item":"diamond","buy_price":120.5,"sell_price":96.4,"base_price":100,"volume_24h_qty":340,"volume_24h_cp":38200,"trades_24h":57,"change_24h_pct":4.25,"updated_at":1793287200}]
```
- Max. 2000 Items. `buy_price`/`sell_price`/`base_price`: Zahl ≥ 0 (fehlt eine, wird die andere genommen). `change_24h_pct` in Prozent (4.25 = +4,25 %). `updated_at`: Unix-Sekunden (ms wird erkannt).
- Doppelte Items: der erste gewinnt. Ein Push **ohne** `market` lässt die Tabelle unangetastet; `"market": []` leert sie.

### `market_history` – stündliche Preise (Upsert pro `item`+`hour_ts`)
```json
"market_history": [{"item":"diamond","hour_ts":1793286000,"avg_price":118.2,"min_price":110,"max_price":125,"volume_qty":40}]
```
- `hour_ts`: Unix-Sekunden, wird auf die volle Stunde abgerundet. Älter als 90 Tage oder > 1 h in der Zukunft wird verworfen; alles älter als 90 Tage wird bei jedem Push gelöscht.
- Max. 60 000 Zeilen pro Push (≈ 90 T × 24 h × 27 Items). Für den ersten Backfill bei mehr Items in mehrere Pushes aufteilen; danach reicht z. B. alle 5 Min. die letzten 2 Stunden.
- `min_price`/`max_price` fallen auf `avg_price` zurück, `volume_qty` auf 0.

### Antwort / Lesen
Antwort enthält zusätzlich `market` und `market_history` (Anzahl angenommener Einträge).
`GET /api/mc-market` → `{updated_at, items:[…], spark:{item:[avg…]}}` (Sparklines 7 T für die Top-Bewegungen). `GET /api/mc-market/<item>` → `{item, history:[[hour_ts, avg, min, max, volume_qty], …]}` (90 T).

## Item-Icons
`GET /mc-icon/v2/<id>` (alte Links `/mc-icon/<id>` gehen weiter; `v2/` ist nur Cache-Bust) leitet auf die passende Textur aus minecraft-assets 1.21.11 weiter, 26.x-Texturen (Pappel, Zinnober, Schwefel, Kissen, Karten …) selbst gehostet unter `/mc/icons/tex/` (aus misode/mcmeta @1902ac25) (Item- vor Block-Texturen, `_front/_side/_top`, `wall_*`, Stufen/Treppen/Mauern → Grundblock, `waxed_*`, `potted_*` …), sonst 404 → Textkürzel.

## Phase 5: Server-Status, Shops, Auktionshaus

**Geld:** immer ganze **Cent** (Integer). Die Website zeigt `CP` mit 2 Nachkommastellen, also `250000` = `2.500,00 CP`. Die Website ist **nicht** maßgeblich für Geld. Alles Geldrelevante entscheidet der Server.

### `servers` (Push jede Minute)
`{"lobby":{"online":true,"players":["Name"],"max":20,"tps":20,"uptime_seconds":3600,"version":"26.3","mode":"dev"}, "survival":{...}}`. Statt `uptime_seconds` ist auch `uptime` erlaubt. Unveränderte Zeilen schreibt D1 nicht neu, auch nicht für market, history, links, leaderboards und stats. Nach 4 Minuten wird ein Refresh erzwungen, damit die Daten als frisch gelten.

### `shops` (komplette Liste, **ersetzt** den Bestand)
```json
{"shops":[{"id":"s1","owner_uuid":"…","owner_name":"KaiDasEi","name":"Kais Erzladen",
  "location":{"world":"survival","x":120,"y":64,"z":-340},
  "items":[{"listing_id":"L123","item":"diamond","price":4500,"stock":32,"mode":"sell"}],"updated_at":1793288000000}]}
```
- `location` ist ein String oder `{world,x,y,z}`.
- `mode`: `sell` heißt, der Shop verkauft an Spieler. `buy` heißt, der Shop kauft an (Gesuch).
- `price` ist in Cent pro Stück.
- Pro Angebot wird eine `listing_id` mitgeschickt. Das ist der Standard, und die Website-Bestellung bezieht sich darauf. `qty` darf höchstens den Lagerbestand **dieses einen** Angebots haben, sonst lehnt die Website ab und der Bot meldet `NOT_FOUND`.
- Die Website gruppiert Shops nach `owner_uuid`, also nach Verkäufer.
- Ack-Gründe wie `PRICE_CHANGED` und `NOT_FOUND` zeigt die Website auf Deutsch an.

### `auctions` (komplette Liste, **ersetzt** den Bestand; Dex mappt `v_auctions` + `v_auction_bids`)
```json
{"auctions":[{"id":"a1","seller_uuid":"…","seller_name":"KaiDasEi","item":"elytra","amount":1,
  "nbt_summary":"Haltbarkeit III","min_price":200000,"current_bid":250000,"current_bidder_name":"hadzyc05",
  "bid_count":3,"ends_at":1793292168700,"status":"active",
  "bids":[{"name":"hadzyc05","amount":250000,"at":1793287968700}]}]}
```
- `status` ist `active`, `ended` oder `cancelled`.
- `ends_at` ist in ms. Die Website zeigt `ends_at` aus dem Ingest an und rechnet die Endzeit nie selbst aus. Anti-Snipe-Verlängerungen kommen deshalb über den nächsten Push.

### Lesen (öffentlich)
- `GET mc.nwebnotfound.dev/api/mc-shops` und `/api/mc-shops/<id>`
- `GET /api/mc-auctions` und `/api/mc-auctions/<id>`

Die Detail-Endpunkte liefern zusätzlich:
- `viewer`: `logged_in`, `can_bid` oder `can_buy`, `own`
- `mine`: eigene Gebote oder Bestellungen mit Status

### Gebote und Bestellungen von Website und Bot (Pending-Queue)
`POST /api/mc-bid`, Body `{"auction_id":"a1","amount":262500}`, Antwort `202 {"ok":true,"request_id":"<uuid>","status":"pending"}`.

`POST /api/mc-shop-order`, Body `{"listing_id":"L123","qty":2}` (bevorzugt). Legacy-Fallback: `{shop_id,item,qty}`. Dann wird das Angebot mit dem größten Lagerbestand für dieses Item gewählt, und dessen `listing_id` wird mitgegeben, falls vorhanden., Antwort `202 {request_id,unit_price,total}`. `unit_price` ist ein Snapshot des Preises beim Bestellen.

Sicherheitsregeln, alle serverseitig geprüft:
- **Website:** nur mit gültiger Discord-Session und nur, wenn der `Origin` `nwebnotfound.dev` oder `mc.nwebnotfound.dev` ist, sonst 403. Turnstile wird geprüft, falls ein Token mitgeschickt wird.
- **Bot im Auftrag eines Spielers:** Header `x-ingest-token` und zusätzlich `discord_id` im Body. Dann gibt es **keinen** Session-Zugriff. `source` ist `discord` statt `web`.
- `bidder_uuid` und `buyer_uuid` kommen **immer** aus `mc_links` für die `discord_id` und setzen `verified` und `has_role` voraus. Werte vom Client werden ignoriert.
- Rate-Limit über Gebote und Bestellungen zusammen:
  - pro `discord_id`: 5 pro Minute und 30 pro Stunde
  - pro IP: 10 pro Minute und 60 pro Stunde
  - darüber gibt es 429.
- Abgelehnt werden:
  - Gebote auf eigene Auktionen und Käufe im eigenen Shop
  - Gebote auf beendete Auktionen (409)
  - Gebote unter `max(min_price, current_bid + Inkrement)` oder unter dem eigenen höchsten offenen Gebot + 1
  - Bestellungen über dem Lagerbestand. `qty` muss zwischen 1 und 2304 liegen.
- Inkrement (final): `max(100, ceil(current_bid*0.05))` Cent.

### Abholen und Bestätigen (Creepy/Server, Header `x-ingest-token`)
- `GET /api/mc-bids/pending?since=<ms>` liefert `{"now":…, "items":[{"id","request_id","auction_id","bidder_uuid","bidder_name","amount","source","created_at"}]}`.
- `GET /api/mc-shop-orders/pending?since=<ms>` liefert `{"now":…, "items":[{"id","request_id","idem_key","listing_id","uuid","qty","max_unit_price_cent","shop_id","item","buyer_uuid","buyer_name","unit_price","source","created_at"}]}`.
- `POST /api/mc-bids/ack` bzw. `/api/mc-shop-orders/ack` mit Body `{"acks":[{"id":"<request_id>","status":"accepted"|"rejected","reason":"…"}]}`.
  - Weitere Stati: `confirmed`, `bought`, `purchased`, `ready`, `ready_for_pickup`, `in_pickup`, `collected`, `picked_up`, `delivered`, `failed`, `refunded`, `cancelled`.
  - `reason` (max. 120 Zeichen) wird bei **jedem** Status gespeichert, auch bei `failed`, und auf der Website angezeigt.
  - `accepted`/`rejected` aktualisieren nur Zeilen, die noch `pending` sind. Bei Endstati (`rejected`, `failed`, `refunded`, `collected`, `picked_up`, `delivered`, `cancelled`) zählt nur der **erste** Ack; spätere Acks (auch mit anderem `reason`) ändern nichts. Ein doppelter Ack ist also harmlos (`updated:0`).
  - Die Website zeigt dann „bestätigt“ oder „abgelehnt“ mit Grund an.

Ausführung im Spiel, idempotent über `request_id`:
- `ah bid <auction_id> <bidder_uuid> <amount_cent> <request_id>` gibt `OK` oder `ERR <reason>` zurück. Dabei werden die CP reserviert und beim Überbieten zurückerstattet. Ein Gebot in den letzten 2 Minuten verlängert die Auktion (Anti-Snipe).
- `shop buy <uuid> <listing_id> <menge> <max_preis_cent> <idem_key> [source]` (genauso `ah buy`) gibt `OK…` oder `ERR <grund>` zurück. `idem_key` ist die `request_id`. Liegt der Preis über `max_preis_cent`, gibt es ERR.
- Auktionsdauer 1 bis 72 Stunden. Ein Gebot in den letzten 2 Minuten verlängert um 2 Minuten.
- Käufe von Website und Discord sowie gewonnene Auktionen landen in der Abholkiste im Spiel (`/abholen`), auch offline, nie direkt im Inventar.

### Redirect
`/markt?item=minecraft:diamond` leitet mit 302 auf `/markt/diamond` weiter. Bei einem unbekannten Item geht es auf `/markt?q=<item>`, die Suche ist dann vorausgefüllt.

## Bank-Sperre (seltene Items)
`POST /api/mc/ingest/market`: Ein Item gilt als **nicht bei der Bank kaufbar**, wenn `locked: true`, `buy_enabled: false` oder `buy_price` null/0 ist. Gespeichert als `mc_market.buy_locked = 1`. Website zeigt dann „Nicht bei der Bank kaufbar“, keinen Kaufpreis, und nimmt das Item aus preisbasierten Listen (Ticker, Gewinner/Verlierer).
Analog `sell_enabled: false` oder `sell_price` null/0 → `sell_locked = 1` („Nicht an die Bank verkaufbar“). Items mit beiden Preisen null werden trotzdem übernommen.

## Auktionen (Craft-Views) – `POST /api/mc-ingest`
Body-Keys: `v_auctions` (Alias `auctions`) = Liste aller aktuellen Auktionen (ersetzt den Stand komplett), `v_auction_bids` (Alias `auction_bids`) = Gebote, per `auction_id` zugeordnet. Alternativ weiterhin `bids` verschachtelt pro Auktion.
- v_auctions: `id`, `item`, `menge` (Alias `qty`/`amount`), `seller` (UUID, Alias `seller_uuid`), `min_price`, `current_bid` (null), `current_bidder` (UUID/null, Alias `current_bidder_uuid`), `bid_count`, `ends_at` (ms), `status` (active | ended/sold/expired | cancelled), `created_at` (s oder ms, wird an der Größe erkannt), `source_last_bid` (null), `min_next_bid` (null, Cent). Optional: `seller_name`, `current_bidder_name`, `nbt_summary`.
- v_auction_bids: `id`, `auction_id`, `bidder` (UUID, Alias `bidder_uuid`), `amount`, `created_at` (s/ms), `source`.
- Alle Beträge ganzzahlige Cent. Mindestgebot: `min_next_bid` ?? (keine Gebote ? `min_price` : höchstes + max(100, ceil 5 %)).
- Namen: aus `mc_links` per UUID, sonst gekürzte UUID. Doppelte Gebots-`id`s werden ignoriert. Max. 1000 Auktionen, 200 Gebote pro Auktion angezeigt.

## Craft-Views direkt (Bestenlisten, Spieler-Stats, Preishistorie) – `POST /api/mc-ingest`
Die Antwort enthält `views: {leaderboard_rows, player_stat_rows, history_rows, leaderboards}` zur Kontrolle.

**`v_leaderboards`** (Alias: `leaderboards` als Zeilen-Array; altes Objekt-Format `{kategorie:[{name,value}]}` geht weiter)
- Kategorie: `category` | `stat` | `key` | `board` | `leaderboard` | `kind` | `type` | `metric`
- Spieler: `uuid` | `player` | `player_uuid` | `mc_uuid`; Name optional: `name` | `player_name` | `mc_name` | `username` (sonst aus `mc_links`; ohne Namen wird die Zeile übersprungen)
- Wert: `value` | `score` | `amount` | `total` | `count`; Rang optional: `rank` (sonst nach Wert absteigend). Top 10 je Kategorie.
- Zeitraum optional: `period` | `scope` | `range` | `timeframe` – enthält „week“/„woche“/„7d“ → Wochenliste, sonst Gesamt.
- Kategorie-Aliase → Website-Tabs: cp/balance/coins/money → `money`; playtime/play_time/playtime_s/time_played → `playtime` (Sekunden); mined/blocks/blocks_mined/blocks_broken → `blocks_mined`; kills/player_kills/pvp_kills → `kills`; kd/kdr/k_d → `kd`; distance/distance_m/travelled → `distance` (Meter). Unbekannte Kategorien bekommen einen eigenen Tab.

**`v_player_stats_ext`** (Aliase: `player_stats_ext`, `player_stats`, `players_stats` als Array)
- Breit: eine Zeile pro Spieler, `uuid` | `player` | `player_uuid` | `mc_uuid` + beliebige Zahl-/Textspalten (max. 24).
- Lang: `uuid`/`player` + `stat` | `key` + `value`.
- JSON-Strings werden geparst. `mined`, `placed`, `killed`, `deaths_by`, `crafted`, `playtime_by_world` (Objekte), `distance_m` (Objekt) und `fished`, `traded`, `jumps`, `damage_dealt`, `damage_taken`, `cp_earned`, `shop_sales` landen in den Profil-Details.

**`v_market_history`** (alt: `market_history`)
- `item` | `material` | `item_id`; Zeit: `hour_ts` | `hour` | `bucket` | `ts` | `time` | `timestamp` | `created_at` (s, ms oder ISO; auf die Stunde gerundet, 90 Tage)
- Preis: `avg_price` | `avg` | `price` | `close` | `buy_price` | `value`; optional `min_price`|`min`|`low`, `max_price`|`max`|`high`, `volume_qty`|`volume`|`qty`|`amount`|`menge`.
- Sobald Historie da ist, berechnet die Website die 24h-Änderung selbst (letzter Stundenwert vs. letzter Wert ≥ 24 h davor) und zeichnet Charts daraus; ohne Historie und ohne Trades zeigt sie „—“.

## Parkour – `POST /api/mc-ingest`, Feld `parkour`
```json
{"parkour":[{"course":"cave_rush","course_name":"Cave Rush","course_icon":"golden_boots","mc_uuid":"…","mc_name":"NwebNotFound","time_ms":42123,"set_at":"2026-10-30T11:00:00Z"}]}
```
- `course` (Pflicht): Kurs-ID. Wird vor der Prüfung normalisiert: trimmen, klein schreiben, Leerzeichen und `-` → `_` (`"Cave Rush"`, `"cave-rush"`, `"cave_rush"` → `cave_rush`). Danach muss sie `^[a-z0-9_]{1,32}$` erfüllen. Alte IDs wie `kurs1` bleiben unverändert.
- `course_name` (optional, neu): Anzeigename des Kurses, z. B. „Cave Rush“. Klartext, wird getrimmt, Steuerzeichen entfernt, max. 48 Zeichen (Rest abgeschnitten). Gespeichert pro Kurs in `mc_parkour_courses` (Migration 0007); der zuletzt gesendete Name gewinnt. Fehlt er oder ist er leer/kein String, zählt die Zeit trotzdem und die Website zeigt die Kurs-ID hübsch formatiert (`cave_rush` → „Cave Rush“; Unterstriche werden nie angezeigt). Die Kurs-ID bleibt nur interne ID.
- `course_icon` (optional, neu): Minecraft-Item-ID als Kurs-Icon, z. B. `golden_boots`. Wird getrimmt, klein geschrieben und `minecraft:` entfernt (`minecraft:GOLDEN_BOOTS` → `golden_boots`), danach muss es `^[a-z0-9_]{1,48}$` erfüllen. Ungültig (z. B. `bad icon!`) wird wie fehlend behandelt: ein gespeichertes Icon bleibt erhalten, bei einem neuen Kurs ohne Icon zeigt die Website `paper`; die Zeit zählt trotzdem. Gespeichert in `mc_parkour_courses.course_icon` (Migration 0008); fehlt das Feld, bleibt ein vorhandenes Icon erhalten, ohne Icon zeigt die Website `paper`. Gerendert über `/mc-icon/v2/<id>` (wie Items), unbekannte Icons fallen im Browser auf `paper` zurück. Name und Icon sind unabhängig: nur eines zu senden lässt das andere unverändert.
- `mc_uuid`, `time_ms` (1 ms – 24 h), optional `mc_name`, `set_at` (ISO, UTC). Pro Kurs und Spieler zählt nur die Bestzeit. Max. 1000 Einträge pro Push.
- Antwort: `parkour`, `parkour_rejected`, `parkour_course_names` (Anzahl Kurse mit neuem Namen und/oder Icon).
- `GET /api/mc-parkour` → `{"courses":{"cave_rush":[{rank,course_name,mc_uuid,mc_name,time_ms,set_at}]},"course_names":{"cave_rush":"Cave Rush","kurs1":"Kurs1"},"course_icons":{"cave_rush":"golden_boots","kurs1":"paper"}}` (Top 10 pro Kurs, jeder Eintrag zusätzlich mit `course_icon`; `course_name` fällt auf die hübsch formatierte ID zurück, `course_icon` auf `paper`). `course_name` ist Rohtext und wird erst beim Rendern HTML-escaped.
- Seite `/parkour` zeigt ein Top-10-Board pro Kurs mit Anzeigenamen und Kurs-Icon (Buttons und Titel); `/parkour?course=cave_rush` (auch `Cave Rush`/`cave-rush`) zeigt nur diesen Kurs.

## Todesursachen (`deaths_by`)
- `deaths_by` (in `v_player_stats_ext`/Details) darf neben Entity-IDs (`zombie`, `player`, `minecraft:creeper` …) auch Bukkit-**DamageCause**-Keys in Kleinbuchstaben enthalten, z. B. `fall`, `lava`, `fire`, `fire_tick`, `drowning`, `void`, `suffocation`, `starvation`, `explosion`, `block_explosion`, `entity_explosion`, `projectile`, `magic`, `freeze`, `lightning`, `contact`, `wither`.
- Gespeichert wird jeder Key, der nach Kleinschreibung und Entfernen von `minecraft:` auf `^[a-z0-9_./-]{1,48}$` passt (auch unbekannte); Werte müssen Zahlen ≥ 0 sein. Pro Map werden die 25 größten Einträge behalten.
- Die Website zeigt bekannte Keys auf Deutsch (z. B. `fall` → Fallschaden), unbekannte als Klartext. Ist `deaths` größer als die Summe von `deaths_by`, erscheint der Rest als Zeile **Sonstige**, damit die Balken die Gesamtzahl ergeben.

## Push-Frequenz & Cache
- `POST /api/mc-ingest` hat **kein Rate-Limit** (nur Token und max. 8 MB). Pushes alle 3–10 s (Events) bzw. 30–60 s (Stats) sind ok; Pushes klein halten.
- Caching der Lese-APIs: `/api/mc-players` und `/api/mc-players/<name>` (Profil) `no-store`; `/api/mc-data` und `/api/mc-leaderboards` 5 s; `/api/mc-status` 15–20 s; `/api/mc-parkour` 30 s. Änderungen sind also nach spätestens ~5 s (Stats/Profil) sichtbar.

## Tests
`node scripts/e2e.mjs` – startet `wrangler dev` mit frischer lokaler D1 (`.wrangler/e2e`), spielt Ingest/Gebote/Bestellungen/Bot-Ack/Rate-Limits durch und prüft die UI (Chromium 390/1440, `scripts/e2e_ui.py`). Berührt keine Produktionsdaten.

## API-Vertrag: Bank-Direktkauf (`bank_buy`)

**POST `/api/mc-shop-order`** (gleiche Route, gleiche Prüfung wie Shop-Orders: Login/Ingest-Token, Rolle + verifizierter Link, Origin, optional Turnstile, Rate-Limit)

```json
{ "type": "bank_buy", "item": "diamond", "amount": 3, "mc_uuid": "<uuid>", "request_id": "<8-64 [A-Za-z0-9_.:-]>", "discord_id": "<nur Bot-Pfad>", "turnstile": "<optional, Website>" }
```
- Website: Session-Cookie + Origin; `discord_id` wird ignoriert. Bot (Dex): `Authorization: Bearer <INGEST_TOKEN>` + `discord_id`.
- `amount` Ganzzahl 1–2304; `item` muss im Markt existieren (404) und kaufbar sein (409 bei Sperre/kein Preis).
- `mc_uuid` optional; wenn gesetzt, muss sie zur UUID aus `mc_links` passen (403). Gespeichert wird immer die UUID aus `mc_links`.
- `request_id` = Idempotenz-Schlüssel (fehlt sie, erzeugt der Server eine). Gleiche ID + gleiche Daten → `200 {duplicate:true}`; gleiche ID, andere Daten → `409`.
- Erfolg: `202 {ok, request_id, type:"bank_buy", item, amount, unit_price (Cent, Schätzung), total}`. Der Preis ist nur eine Schätzung, maßgeblich ist der Server beim Ausführen.
- Sonst `400` unbekannter `type`. Ohne `type` (oder `type:"shop"`) verhält sich alles exakt wie bisher.

**GET `/api/mc-shop-orders/pending`** (Ingest-Token): Standard nur `type=shop` (alte Konsumenten unverändert, Feld `type` kommt neu dazu). Mit `?types=shop,bank_buy` zusätzlich bank_buy-Einträge mit `{id, request_id, type, item, amount, qty, mc_uuid, buyer_uuid, discord_id, unit_price, shop_id:null, listing_id:null}`.

**POST `/api/mc-shop-orders/ack`**: unverändert, gleiche Stati wie Shop-Orders; Status landet über `v_order_fulfillment` in der Liste `/bestellungen`.

**POST `/api/mc-orders/hide`** `{id}` oder `{ids:[]}` (Session): blendet eigene erledigte/abgelehnte Einträge nur für den User aus (`mc_order_hidden`), nichts wird gelöscht.

## economy_daily (eigener POST, Discord-Bot, alle 5 Min.)
`POST /api/mc-ingest` (Header `x-ingest-token`) mit `{"economy_daily":[{"day":"YYYY-MM-DD","money_supply_cp":int,"minted_cp":int|null,"burned_cp":int|null,"net_cp":int|null}]}`.
Höchstens 90 Zeilen, älteste zuerst (streng aufsteigend, kein Tag doppelt). Upsert pro Tag in `mc_economy_daily` (Migration `0010_economy_daily.sql`).
Strikt: ungültiges Datum, Nicht-Integer, unbekannte Felder oder mehr als 90 Zeilen → `400`, dann wird nichts geschrieben. Fehlende minted/burned/net zählen als `null`.
Lesen: `GET /api/mc-economy` → `{updated_at, days:[…]}` (letzte 90 Tage, älteste zuerst). Anzeige auf `/markt` (Stufen-Graph der Geldmenge, `–` bei null).
