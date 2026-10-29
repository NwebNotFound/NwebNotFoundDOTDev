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
- `inventory` (optional): max. 41 Slots `{item (≤48), count 0–999}`. Wird nur dem eingeloggten Besitzer angezeigt.
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
`GET /mc-icon/<id>` leitet auf die passende Textur aus minecraft-assets 1.21.1 weiter (Item- vor Block-Texturen, `_front/_side/_top`, `wall_*`, Stufen/Treppen/Mauern → Grundblock, `waxed_*`, `potted_*` …), sonst 404 → Textkürzel.
