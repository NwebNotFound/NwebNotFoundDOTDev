# MC-Ingest API (`POST https://nwebnotfound.dev/api/mc-ingest`)

Header: `x-ingest-token: <token>` (unverändert), `content-type: application/json`. Max. 64 KB pro Request.
Alle Felder sind optional; alte Payloads (`servers` + `leaderboards`) funktionieren unverändert.

## Bestehend
- `servers`: `{ <key>: {online, players[], max, version, mode, uptime_seconds, tps} }` – max. 8 Server.
- `leaderboards`: `{ money|playtime|kills|deaths|blocks_mined|…: [{name, value}] }` – max. 12 Listen à 10 Einträge, **sortiert senden**.
- Jede Minute pushen; die Seite zeigt nur Daten < 5 Min.
- Der Snapshot (servers/leaderboards) wird nur überschrieben, wenn `servers` oder `leaderboards` im Request enthalten sind. Reine Link/Stats-Pushes lassen ihn in Ruhe.

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
