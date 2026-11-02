# Minecraft-Bereich: Rework-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Dieses Dokument ist der Plan. Es ändert keinen Worker, kein Schema und kein Frontend. Jede Phase darunter ist ein eigener, reviewbarer PR gegen `main`. Nicht mergen, bevor die Phase ihre eigenen e2e-Checks grün hat.

**Goal:** `mc.nwebnotfound.dev` so umbauen, dass Nils den Minecraft-Bereich bedienen kann: eine Navigation nach Aufgaben, ein einheitlicher Minecraft-Look, PvP nur auf der PvP-Seite, glatte Preislinien, 3D-Köpfe die der Maus folgen, und ein VIP-Panel mit Discord-Login, das eigene Welten verwaltet, ohne RCON oder Admin nach außen zu geben.

**Architecture:** Ein Cloudflare Worker (`nwebnotfound-site`, `src/worker.js`) rendert weiter HTML und spricht nur mit D1. Öffentliche Daten bleiben Ingest-Snapshots. Schreibaktionen der Website (heute Gebote, Shop-Orders, Bankkauf) sind Zeilen in einer Pending-Queue; Creepy bzw. `NwebNotFound/mc-stack` holt sie mit `x-ingest-token` ab, führt sie im privaten Netz aus und bestätigt per Ack. VIP-Befehle nutzen genau dieses Muster gegen eine abstrakte Schnittstelle. Der Browser spricht nie mit dem Spielserver.

**Tech Stack:** Cloudflare Worker, D1 (`binding` `DB`, Datenbank `nwebnotfound-guestbook`), bestehende Discord-Session (`nnf_session`, `Domain=.nwebnotfound.dev`), Vanilla-JS in `public/mc/`, Playwright über `node scripts/e2e.mjs` und `scripts/e2e_ui.py` (Chromium, 390 px und 1440 px), CI `.github/workflows/e2e.yml`.

## Global Constraints

- Hosts bleiben: Portfolio `nwebnotfound.dev`, Minecraft `mc.nwebnotfound.dev`. `/auth/*` auf dem MC-Host leitet weiter auf den Apex um. Cookie bleibt `HttpOnly; Secure; SameSite=Lax; Domain=.nwebnotfound.dev`.
- Kein RCON, kein Admin-Port, kein Shared Secret und keine Befehlszeichenkette im Browser oder in öffentlichem JSON. Der Client sendet nur ein festes `op` aus der Whitelist plus typisierte Argumente.
- Geld bleibt ganzzahlige Cent. Die Website entscheidet keine Beträge; maßgeblich ist der Server (siehe `INGEST.md`).
- Neue MC-Oberflächen: keine Emojis, keine Inline-Styles, keine `<style>`-Blöcke im Seiteninhalt. Icons nur über `/mc-icon/v2/<id>` (pixelig). Überschriften Monocraft (`--f-px`), Fließtext die Systemschrift (`--f-body`). Tokens nur aus `public/mc/ds.css`.
- PvP-Stats (Siege, Niederlagen, Kämpfe, Quote, Lieblings-Kit, Arena-Tab) stehen nur auf `/pvp`. Nicht auf `/leaderboards`, `/profile`, `/spieler` oder `/spieler/<name>`.
- Preisgraphen sind glatte monotone Kubiken. Der bestehende Item-Chart in `public/mc/item.js` (`mono`) bleibt die Referenz und wird nicht wieder zur Polylinie. Die Geldmengen-Kurve auf `/markt` (`public/mc/economy.js`) bleibt eine Stufe pro Tag; das ist kein Preis.
- 3D-Köpfe folgen der Maus nur bei feinem Zeiger (`(hover:hover) and (pointer:fine)`). `prefers-reduced-motion`, grober Zeiger und schmale Viewports bleiben beim Standbild (`STATIC()` in `public/mc/player3d.js`). Der Loop pausiert außerhalb des Bildschirms und bei verstecktem Tab (Stand nach #34).
- Deutschsprachige UI. Freitext immer über die bestehende Escape-Funktion (`MC.E` bzw. `esc` im Worker).
- Portfolio (`/`, `/guestbook`, `/profile` auf dem Apex, `/api/guestbook`) ist nicht Teil dieses Reworks.
- `NwebNotFound/mc-stack` wird hier nicht implementiert. Die Website plant gegen die Schnittstelle in diesem Dokument. Punkte mit der Markierung **Offen mit Craft** blockieren Phase 7 und 8, nicht Phase 1–6.

---

## Warum die Seite heute nicht bedienbar ist

Es gibt bereits ein Menü (`hubNav` in `src/mc-hub.js`) und ein Design-System (`public/mc/ds.css`). Beides reicht Nils nicht, weil die Gruppen nicht den Aufgaben entsprechen und zwei Bedienkonzepte nebeneinander liegen.

1. **Aufgaben fehlen im Menü.** Status gibt es nur als Hero auf `/`. VIP hängt unter Community neben öffentlichen Bestenlisten. Profil, Bestellungen und Abmelden sitzen in einem zweiten Menü (`#acct`, `ACCT_JS` in `src/worker.js`). Feedback nur im Footer. Changelog ist ein eigener Top-Level-Link.
2. **Zwei Menüs.** Burger/Dropdown und Account-Chip. Auf dem Handy erreicht man Bestellungen nicht aus dem Drawer.
3. **Dropdowns sind leicht wieder zu.** In `NAV_JS` öffnet Hover das Menü und merkt sich `data-hov`. Ein Klick innerhalb von 500 ms erzwingt „offen“, ein späterer Klick schließt. `mouseleave` schließt, sobald der Fokus nicht im Menü ist. Der Weg vom Button zum Eintrag ist damit ein Glücksspiel.
4. **Zwei Layouts für dieselbe Leiste.** `HUB_CSS` in `src/mc-hub.js` macht `.nl` bei ≤900 px zu einem horizontalen Scroller mit Maske. `public/mc/ds.css` versteckt `html.mc .nl`, bis `.nav.open`. Die höhere Spezifität gewinnt, die alte Regel liegt aber weiter im Inline-CSS und kann bei der nächsten Änderung zurückkommen.
5. **Die Startseite erzählt eine andere Karte als das Menü.** Die Kacheln sind Profil, Bestenlisten, Markt, Shops, Auktionen, Wiki. Parkour, PvP, VIP und Status fehlen.
6. **Der Look ist nicht eine Sache.** `ds.css` ist Chest-GUI (2 px Inset, Slots, Monocraft). Bestenlisten, Profil und der Item-Chart liefern eigene Radien, Pill-Tabs und ein `<style>` in `public/mc/item.js`. Wiki-Artikel tragen gelbe `TODO`-Badges (`T()` in `src/mc-hub.js`).
7. **VIP kann niemand benutzen.** `GET /api/mc-vip` ist absichtlich nur lesen (`src/mc-vip.js`: „Keine Schreibaktion, kein RCON“). Welten sind höchstens drei Keys aus dem `servers`-Snapshot (`vip`, `vip1`, `vip_world`, …). Ohne Key steht „bald verfügbar“. Einladen, Entfernen, An/Aus und eigene Infos gibt es nicht.
8. **PvP ist verteilt.** `/pvp` ist die Arena-Tabelle. Zusätzlich: PvP-Tab auf `/leaderboards` (seit #34, absichtlich getrennt von Survival-Kills), Winrate-Kachel und Arena-Karte im Profil (`PROFILE_BODY` in `src/worker.js`), Block `#pvp-pl` und Winrate-KPI auf `/spieler/<name>` (`src/mc-players.js`, `public/mc/pvp.js`). Das widerspricht der Regel „nur auf der PvP-Seite“.
9. **Preislinien sind nur auf der Item-Seite glatt.** `mono()` in `public/mc/item.js` zeichnet eine monotone Kubik und filtert eine einzelne volumenlose Zacke, ein echter Crash bleibt. Sparklines (`spark()` in `public/mc/common.js`) verbinden Punkte mit `L` (Knicke) auf `/markt` und auf der Startseite.
10. **Maus-Folge gilt nur für `.pf-model`.** `look()` in `public/mc/player3d.js` kehrt sofort zurück, wenn die Klasse fehlt. Profil und Spielerseite folgen der Maus. Podium auf `/leaderboards` (`.pod-model`) und die Online-Liste auf `/` (Klasse leer) nicht.

---

## Ziel-Navigation

Eine Leiste, eine Quelle (`NAV_GROUPS` plus Konto). Desktop und Handy benutzen dieselben Gruppen. Kein zweites Account-Menü.

| Gruppe | Icon | Einträge |
| --- | --- | --- |
| Server | `recovery_compass` | Status → `/` (`grass_block`), Changelog → `/changelog` (`writable_book`) |
| Wirtschaft | `emerald` | Markt → `/markt`, Shops → `/shops`, Auktionen → `/auktionen` |
| Minispiele | `iron_sword` | Parkour → `/parkour` (`golden_boots`), PvP → `/pvp` (`iron_sword`) |
| Community | `player_head` | Spieler → `/spieler` (`name_tag`), Bestenlisten → `/leaderboards` (`diamond`), Feedback → `/feedback` (`writable_book`) |
| Wiki | `bookshelf` | Übersicht → `/wiki`, danach die zehn Artikel mit ihrem bestehenden Icon (siehe Bestand) |
| Mein Konto | Kopf des verknüpften Spielers, sonst `player_head` | Profil → `/profile`, VIP → `/vip` (`nether_star`), Bestellungen → `/bestellungen` (`chest`). Eingeloggt zusätzlich Abmelden. Ausgeloggt ist die Gruppe genau ein Link: „Mit Discord anmelden“ auf `https://nwebnotfound.dev/auth/discord/login?next=<aktuelle URL>`. |

Regeln für die Bedienung:

- Aktuelle Seite: `aria-current="page"` am Link und sichtbare Markierung an der Gruppe. Unterseiten zählen mit: `/markt/diamond` markiert Markt, `/wiki/befehle` markiert den Wiki-Eintrag, `/shops/<id>` markiert Shops, `/spieler/<name>` markiert Spieler, `/auktionen/<id>` markiert Auktionen.
- Desktop (≥901 px): Klick öffnet und schließt zuverlässig. Hover bei feinem Zeiger öffnet; Schließen beim Verlassen erst nach 150 ms, damit der Zeiger die Lücke zum Panel schafft. Die 500-ms-Sonderregel in `NAV_JS` fällt weg. Escape und Klick außerhalb schließen. Pfeile bewegen innerhalb des offenen Panels, Focus bleibt sichtbar (`:focus-visible` aus `ds.css`).
- Handy (≤900 px): ein Burger, 44×44 px. Das Panel ist eine Spalte unter der Leiste, Gruppen sind Akkordeons, die Gruppe der aktuellen Seite ist offen. Konto steht in derselben Liste, nicht im separaten Chip. Escape schließt und setzt den Fokus auf den Burger. Hintergrund scrollt nicht, solange das Panel offen ist. Ziele mindestens 44 px hoch. `safe-area-inset` bleibt.
- Die Startseiten-Kacheln zeigen dieselben sechs Ziele in derselben Reihenfolge: Status (Anker `#srv-sec` auf `/`), Wirtschaft (`/markt`), Minispiele (`/pvp`, zweite Zeile Parkour), Community (`/spieler`), Wiki (`/wiki`), Mein Konto (`/vip` wenn die Session VIP/MVP ist, sonst `/profile`). Keine siebte Parallel-Karte.
- `/bestellungen` und `/abholungen` bleiben beide gültig (heute dasselbe HTML). Im Menü steht nur `/bestellungen`.

---

## Ziel-Look

Apple-ruhig in der Fläche, Minecraft in den Objekten. Nicht umgekehrt.

- Fläche: dunkles Deepslate aus `ds.css` (`--c-bg` bis `--c-s4`), viel Luft (`--s5`/`--s6`), eine Spaltenbreite `.hub-wrap` (1120 px), keine neuen Radien über `--r` (6 px) hinaus. Karten sind die bestehende Chest-Fläche (`.g`: 2 px Rand, Inset, kein Backdrop-Blur auf der Karte).
- Objekte: Monocraft nur für Titel, Zahlen und den Servernamen. Körpertext bleibt die Systemschrift. Buttons sind eine Klasse `.btn` im MC-Stil (angehobene Stein-Fläche, Press auf `:active` um 1 px), primär Grün (`--c-acc`), sekundär Stein. Kein Pill-Tab mehr auf Bestenlisten; Tabs werden Slots in einer Reihe.
- Slots: die bestehende Klasse `.slot` (40 px, `--mc-inset-slot`). Item-Icons 16×16 hochskaliert, `image-rendering: pixelated`, erstes Frame bei Animationsstreifen (Regel am Ende von `ds.css` bleibt).
- Keine Emojis, keine `TODO`-Pillen in der Navigation. Wiki-`TODO`s bleiben Inhalt, bis Nils die Texte liefert; sie wandern nicht ins Menü.
- Jede MC-Seite nutzt `mcPage` / `shell` mit `html class="mc"`. Seiten-CSS, das heute inline in `src/worker.js` (`LEADERBOARDS_MC`, `PROFILE_PB_CSS`, `DET_CSS`) oder als `<style>` in `public/mc/item.js` liegt, zieht nach `public/mc/ds.css` oder in die schon verlinkte Seitendatei (`profile.css`, `pvp.css`, `economy.css`). Der e2e-Check „kein `style=` im Inhalt“ gilt danach auch für Markt-Item, Bestenlisten und Profil, nicht nur für Changelog und VIP.

---

## Bestandsaufnahme

Stand `main` (`src/worker.js` Fetch, Host `mc.nwebnotfound.dev`). Schwäche ist der Grund, die Route in den Rework zu nehmen. „Bleibt“ heißt: Inhalt und URL bleiben, die Hülle (Navigation, Typo, Slots) zieht in Phase 1–3 mit.

### Seiten

| Route | Was sie zeigt | Schwäche |
| --- | --- | --- |
| `/` | Status, Adresse, Online-Köpfe, Kacheln, Welten, Top-Spieler, Markt-Auszug, Join-Schritte | Kacheln widersprechen dem Menü. Status ist kein Menüpunkt. Online-Köpfe folgen der Maus nicht. |
| `/profile` | Discord-Profil, verifizierte MC-Stats, Inventar, Bestellungen, Minispiele-Tab | PvP-Winrate und Arena-Karte. Profil ist nur im Account-Chip. Inline-CSS `#pb`. |
| `/leaderboards` | Survival-Tabs plus Arena-Tab, Podium mit 3D | PvP-Tab und Quote gehören auf `/pvp`. Podium (`.pod-model`) folgt der Maus nicht. Pill-Tabs, Inline-CSS. |
| `/pvp` | Arena-Tabelle: Siege, Niederlagen, Kämpfe, Quote, Kit | Einziger erlaubter Ort für diese Zahlen. Liegt unter Minispiele und ist von der Startseite aus unsichtbar. |
| `/parkour` | Top 10 pro Kurs | Inhalt brauchbar. Im Menü leicht zu übersehen, auf der Startseite fehlend. |
| `/vip` | Ränge-Katalog; mit Login+Link+Rang VIP/MVP ein Read-only-Panel | Keine eigenen Welten, kein An/Aus, keine Mitglieder, kein Info-Text. POST ist 405. Steht unter Community. |
| `/spieler` | Suche, Hover-Vorschau | Vorschau ist ein Ganzkörper-Popover, kein klickbares Menü-Ziel „Community“. |
| `/spieler/<name>` | Öffentliches Profil, Stats, Parkour, PvP-Block | PvP-Block `#pvp-pl` und Winrate-KPI. Name muss `^[A-Za-z0-9_]{1,16}$` sein, sonst 404. |
| `/markt` | Preise, Gewinner/Verlierer, Sparkline, Geldmenge | Sparkline ist eine Polylinie. Geldmenge ist bewusst eine Stufe und bleibt das. |
| `/markt/<item>` | Chart 1/7/30/90 T, Bankkauf | Chart ist bereits glatt (`mono`). `<style>` und Inline-Styles im Inhalt. |
| `/markt?item=` | 302 auf `/markt/<id>` oder `/markt?q=` | Bleibt. |
| `/shops`, `/shops/<id>` | Spielershops, Bestellung | Nur über Wirtschaft-Dropdown. Id `^[A-Za-z0-9_.:-]{1,64}$`. |
| `/auktionen`, `/auktionen/<id>` | Live-Auktionen, Gebot | Wie Shops. |
| `/bestellungen`, `/abholungen` | Eigene Orders und Abholfach | Nicht im Menü, nur im Account-Chip. Beide Pfade rendern dasselbe. |
| `/changelog` | Spieler-Changelog | Eigener Top-Level-Link, konkurriert mit den Gruppen. |
| `/feedback` | Bug/Idee, Turnstile | Nur Footer. Auf dem Apex existiert dieselbe Seite mit umgeschriebenen MC-Links; die bleibt, das Menü auf dem Apex ist Portfolio und wird nicht umgebaut. |
| `/wiki` | Index | Zehn Artikel, mehrere mit `TODO` und „im Aufbau“ (Regeln, VIP-Welten, MineRush, Go-Live). |
| `/wiki/<slug>` | Artikel | Slugs: `erste-schritte`, `server`, `economy`, `markt`, `auktionshaus-shops`, `voice-chat`, `befehle`, `plugins`, `regeln`, `faq`. Unbekannter Slug ist 404. |
| `/bestenlisten`, `/bestenliste` | 301 auf `/leaderboards` | Bleibt. |
| sonst | Asset oder 404 „Diesen Chunk gibt es nicht.“ | Bleibt. |

### APIs, die diese Seiten tragen

| Route | Zugriff | Rolle im Rework |
| --- | --- | --- |
| `GET /api/mc-status`, `GET /api/mc-data` | öffentlich, kurz gecacht | Status-Seite, unverändert lesen. |
| `GET /api/me` | Cookie | Konto-Menü. Antwort bleibt `{available, user:{id,name,username,avatar,mc_name}}`. |
| `GET /api/profile` | Cookie | Profil. Keine PvP-Felder hinzufügen. |
| `GET /api/mc-leaderboards` | öffentlich | UI ignoriert Kategorien `kd`, `kdr`, `k_d`, `kill_death`, `pvp` und alles, was mit `pvp` anfängt. Daten dürfen in D1 bleiben. |
| `GET /api/mc-pvp`, `GET /api/mc-pvp/<name>` | öffentlich | Nur `public/mc/pvp.js` auf `/pvp` ruft sie auf. |
| `GET /api/mc-parkour` | öffentlich | Parkour-Seite und die Parkour-Zeile im Profil/auf der Spielerseite. Die Spielerseite darf Parkour behalten. |
| `GET /api/mc-vip` | Cookie, `private, no-store`, POST 405 | Phase 6 erweitert die Leseform. Schreiben kommt nicht auf diese GET-Route. |
| `GET /api/mc-market`, `GET /api/mc-market/<item>`, `GET /api/mc-economy` | öffentlich | Charts. Economy-JSON bleibt Tageswerte. |
| `GET/POST /api/mc-shops*`, `/api/mc-auctions*`, `/api/mc-bid`, `/api/mc-shop-order`, Pending/Ack | wie `INGEST.md` | Vorbild für die VIP-Queue. Rate-Limit heute: 5/min und 30/h pro Discord, 10/min und 60/h pro IP, gemeinsam für Gebot und Bestellung. |
| `POST /api/mc-ingest` | `x-ingest-token`, max. 8 MB, kein Rate-Limit | Einziger Weg, auf dem Spielzustand in D1 kommt. VIP-Status später als weiteres optionales Feld, alte Payloads bleiben gültig. |
| `/auth/discord/login\|callback\|logout` | nur Apex | Unverändert. MC-Host leitet `/auth/*` auf den Apex um. |
| `/mc-head/*`, `/mc-skin/*`, `/mc-icon/*`, `/mc-mob/*` | öffentlich | Bleiben die einzigen Bildquellen. |

Apex-only und damit außerhalb: `/`, `/guestbook`, `/profile`, `/api/guestbook`, `/minecraft` → 301 auf den MC-Host, `/feedback` als zweite Kopie.

---

## VIP: abstrakte Schnittstelle

Craft baut in `NwebNotFound/mc-stack` VIP-Welten und Scoreboards neu und dokumentiert eine API. Die Website wartet nicht auf Klassennamen oder RCON. Sie spricht nur die folgenden Formen. Wo Craft anders heißt, ändert sich ein Mapper in einem PR, nicht die Seiten.

### Was der Browser darf

Alle Mutationen: `POST` oder `DELETE`, `content-type: application/json`, Cookie `nnf_session`, Header `Origin` ist genau `https://mc.nwebnotfound.dev` oder `https://nwebnotfound.dev`. Andere Origins: 403, analog zu Gebot/Bestellung.

Zugang zum Verwalten, alle Bedingungen:

1. Session gültig, sonst 401 `{error, reason:"login"}`.
2. `mc_links` für diese `discord_id`: `verified = 1`, `has_role = 1`, Name `^[A-Za-z0-9_]{1,16}$`, UUID kanonisch. Sonst 403 `{reason:"link"}`.
3. `mc_player_ranks.rank` ist `vip` oder `mvp`. Builder und Admin bekommen 403 `{reason:"rank"}` und sehen nur den öffentlichen Katalog. **Offen mit Craft:** ob Admin das Panel doch benutzen soll. Bis dahin: nein. Admins schalten Welten am Server, nicht in diesem Formular.
4. Die verlinkte UUID ist `owner_uuid` der Welt. Mitglieder dürfen lesen, was der Ingest über sie hergibt, aber nicht schalten oder einladen. **Offen mit Craft:** Co-Owner. Bis dahin: genau ein Owner.
5. `mc_uuid` aus dem Body wird ignoriert. Die UUID kommt aus `mc_links`, wie bei `bidder_uuid` heute.

Lese-URL bleibt `GET /api/mc-vip` (Cookie, `cache-control: private, no-store`). Ohne Zugang dieselbe Hülle wie heute: `{access:false, reason, catalog, note}` und keine Weltenliste. Mit Zugang zusätzlich:

```json
{
  "access": true,
  "player": {"name": "Nils", "rank": "vip", "color": "6", "label": "VIP"},
  "worlds": {
    "placeholder": false,
    "updated_at": "2026-11-02T12:00:00.000Z",
    "slots": [{
      "id": "vip_nils_1",
      "label": "VIP-Welt 1",
      "online": true,
      "players": 0,
      "max": 8,
      "tps": 20,
      "info": "Bauplatz",
      "owner_name": "Nils",
      "owner": true,
      "members": ["Steve"],
      "pending": []
    }]
  }
}
```

`id` ist `^[a-z0-9_]{1,32}$`. `info` ist Klartext, 0–120 Zeichen, ohne Steuerzeichen. `members` sind Minecraft-Namen, höchstens 12. `pending` sind eigene offene Kommandos `{request_id, op, status}` und nichts anderes. `stats` (Geld, Spielzeit, Kills, Tode, Blöcke) bleiben im Panel, **ohne** PvP-Felder.

Solange der Ingest noch keine `vip_worlds` schickt, füllt `pickVipWorlds` die Slots weiter aus `servers`-Keys (`WORLD_RE` in `src/mc-vip.js`). Diese Fallback-Slots haben `owner:false` und keine Buttons. `placeholder:true`, wenn weder Ingest noch Fallback Keys liefern.

### Mutationen (Browser → Worker → D1)

Jede erfolgreiche Mutation antwortet `202` mit `{ok:true, request_id, op, status:"pending"}`. Sie führt am Spiel nichts aus. `request_id` erzeugt der Worker (UUID), außer der Client schickt eine (8–64 Zeichen `[A-Za-z0-9_.:-]`). Gleiche Id und gleicher Body: `200 {duplicate:true}`. Gleiche Id, anderer Body: `409`.

| Aufruf | Body | `op` |
| --- | --- | --- |
| `POST /api/mc-vip/worlds/<id>/power` | `{"state":"start"}` oder `{"state":"stop"}` | `world.start` / `world.stop` |
| `POST /api/mc-vip/worlds/<id>/info` | `{"info":"Bauplatz"}` | `world.set_info` |
| `POST /api/mc-vip/worlds/<id>/members` | `{"name":"Steve"}` | `world.member.add` |
| `DELETE /api/mc-vip/worlds/<id>/members/<name>` | leer | `world.member.remove` |

Abgelehnt:

- Unbekanntes `op`, freier Befehlstext, `state` außer `start`/`stop`: 400.
- Welt-Id oder Name passt nicht auf das Muster: 400.
- Welt gehört dem Spieler nicht, oder der Ingest kennt sie nicht: 404. Der Fallback aus `servers` ohne `owner_uuid` ist nicht schaltbar.
- Einladen des Owners, Einladen eines Namens der schon Mitglied ist, Entfernen eines Namens der kein Mitglied ist: 409.
- Mehr als 12 Mitglieder, `info` länger als 120: 400.
- Zweites offenes Power-Kommando für dieselbe Welt (Status `pending`): 409 `{reason:"busy"}`.

Rate-Limit, nur diese vier Routen, getrennt von Gebot/Shop:

- Power: 3 pro Stunde pro Welt und 6 pro Stunde pro `discord_id`.
- Info und Mitglieder zusammen: 10 pro Stunde pro `discord_id`, 20 pro Stunde pro IP.
- Darüber `429` mit `{error, retry_after_s}`.

**Offen mit Craft:** ob der Server ein eigenes, engeres Limit für Welt-Starts hat. Die Website-Limits sind die Obergrenze, die der Worker immer erzwingt. Ein strengeres Limit im Spiel wird über Ack `rejected` sichtbar, nicht durch ein zweites Stillschweigen.

### Wie der Befehl zum Server kommt

```
Browser (Cookie, Origin)
  → Worker prüft Session, Link, Rang, Owner, Rate-Limit, op-Whitelist
  → INSERT mc_vip_commands (status pending)
  → 202 request_id
mc-stack / Creepy, nur mit x-ingest-token, nicht aus dem Browser
  → GET /api/mc-vip/commands/pending?since=<ms>
  → mappt op auf die eigene, nicht öffentliche API
  → POST /api/mc-vip/commands/ack
  → nächster POST /api/mc-ingest mit vip_worlds
Browser
  → GET /api/mc-vip sieht pending, danach den neuen Stand
```

Der Worker öffnet in diesem Plan keine Verbindung zum Spiel. Es gibt keinen Pfad, auf dem ein Besucher Host, Port, Passwort oder eine Rohzeile wie `op Nils` setzt.

**Offen mit Craft:** falls die API ein HTTP-Endpunkt ist, den der Worker aufrufen soll, statt zu pollen. Dann: Worker-Secrets `MC_STACK_URL` und `MC_STACK_TOKEN`, `fetch` nur serverseitig, Timeout 3 s, die Zeile bleibt `pending` bis das Ack da ist, die URL steht nie im HTML oder in `/api/me`. Bis Craft das festlegt, gilt ausschließlich Polling, weil Gebote und Shop-Orders schon so laufen (`GET /api/mc-bids/pending`, `POST /api/mc-bids/ack`).

Pending-Antwort, nur mit gültigem `x-ingest-token`, sonst 401:

```json
{
  "now": 1793288000000,
  "items": [{
    "id": "…",
    "request_id": "…",
    "op": "world.member.add",
    "world_id": "vip_nils_1",
    "actor_uuid": "11111111-2222-3333-4444-555555555555",
    "actor_name": "Nils",
    "name": "Steve",
    "info": null,
    "created_at": 1793288000000
  }]
}
```

Ack-Body: `{"acks":[{"id":"<request_id>","status":"accepted"|"rejected"|"failed"|"confirmed","reason":"…"}]}`. `reason` max. 120 Zeichen, wird gespeichert und auf Deutsch angezeigt, wenn er in der festen Liste steht (`busy`, `offline`, `full`, `unknown_player`, `denied`); sonst der generische Satz „Der Server hat den Auftrag abgelehnt.“ Roh-Grund aus dem Spiel wird nicht ungefiltert gerendert, wenn er nicht in der Liste ist. Erster Endstatus gewinnt, ein zweites Ack derselben Id ändert nichts (`updated: 0`), wie bei Shop-Orders.

### Zustand vom Server (Ingest)

Optionales Feld auf `POST /api/mc-ingest`, ersetzt die VIP-Liste komplett wenn es da ist; fehlt es, bleibt die letzte Liste:

```json
{
  "vip_worlds": [{
    "id": "vip_nils_1",
    "label": "VIP-Welt 1",
    "owner_uuid": "11111111-2222-3333-4444-555555555555",
    "owner_name": "Nils",
    "online": true,
    "players": ["Steve"],
    "max": 8,
    "tps": 20,
    "info": "Bauplatz",
    "members": ["Steve"]
  }]
}
```

Höchstens 30 Welten pro Push. Ungültige Zeilen fallen weg, der Rest wird geschrieben. `players` ist entweder eine Namensliste oder eine Zahl (wie `playerCount` heute). Der öffentliche Serverstatus auf `/` zeigt VIP-Welten nur als „online/offline + Spielerzahl“, ohne Mitgliederliste. Die Mitgliederliste steht nur im Panel des Owners.

**Offen mit Craft:**

- Stabile `id` gegen die heutigen Snapshot-Keys (`vip`, `vip1`, `vip_world_3`). Bis die Id festliegt, nimmt die Website beide: Ingest-`id` wenn vorhanden, sonst den Key.
- Wer eine Welt „besitzt“, wenn mc-stack Ränge statt `owner_uuid` schickt. Ohne `owner_uuid` gibt es keine Buttons.
- Inhalt von „Infos“ über das eine Feld `info` hinaus (MOTD, Seed, Spielmodus, Gamerules). Alles weitere ist draußen, bis es ein benanntes Feld gibt.
- Ob An/Aus die Welt entlädt, nur die Whitelist schließt oder den Proxy-Server abmeldet. Die Website sendet `start`/`stop` und zeigt danach das, was der Ingest unter `online` meldet. Sie rät nicht.
- Mitglieder-Obergrenze und Welten pro Owner. Website-Default: 3 Welten sichtbar, 12 Mitglieder. Der Server darf weniger akzeptieren und per Ack ablehnen.
- Scoreboard-Neuaufbau. Bis das Dokument da ist, bleibt `v_leaderboards` / `leaderboards` aus `INGEST.md` der Vertrag. Ein späterer Mapper schreibt in `mc_leaderboards`. Kategorien, die PvP sind, bekommen auf `/leaderboards` keinen Tab (Phase 3). Die PvP-Seite liest weiter `pvp_stats` bzw. `GET /api/mc-pvp`.

### D1, wenn Phase 7 soweit ist

Neue Tabelle in `schema.sql` (frische e2e-DB) und in `migrations/0013_vip_commands.sql` (bestehende Produktions-D1). Spalten in derselben Art wie `mc_bids_pending`: `id`, `op`, `world_id`, `actor_uuid`, `actor_name`, `discord_id`, `name`, `info`, `source` (`web`), `created_at`, `status`, `reason`, `acked_at`, `ip`. Index auf `(status, created_at)` und `(discord_id, created_at)`. Kein Passwort, kein Rohbefehl.

---

## Dateien, die spätere PRs anfassen

Keine dieser Dateien ändert dieser Plan-PR.

| Datei | Verantwortung |
| --- | --- |
| `src/mc-hub.js` | Einzige Nav-Daten, Startseiten-Kacheln, Wiki-Liste. `HUB_CSS`-Scroller bei ≤900 px entfernen, sobald `ds.css` die Leiste allein layoutet. |
| `public/mc/ds.css` | Tokens, Burger, Akkordeon, MC-Buttons, Tabs-als-Slots. Keine zweite Nav-Implementierung. |
| `src/worker.js` | Routen unverändert lassen, wo nicht genannt. `ACCT_JS` auf einen Einstieg reduzieren, der dieselbe Konto-Gruppe öffnet. PvP aus `LEADERBOARDS_MC` und `PROFILE_BODY` streichen. Inline-CSS der betroffenen Seiten auslagern. |
| `src/mc-players.js`, `public/mc/pvp.js` | PvP-Block und Winrate von der Spielerseite entfernen. `pvp.js` rendert nur noch `#pvp` auf `/pvp`. |
| `public/mc/player3d.js` | `look()` für jede Live-Büste, Pause aus #34 behalten. |
| `public/mc/common.js` | `spark()` zeichnet dieselbe monotone Kubik wie der Item-Chart. |
| `public/mc/item.js` | `mono` behalten, `<style>` nach CSS ziehen. |
| `public/mc/economy.js` | Stufen-Graph der Geldmenge behalten. |
| `src/mc-vip.js`, `public/mc/vip.js`, `public/mc/vip.css` | Lese-Panel, später Formulare, die nur die vier Mutationen aufrufen. |
| `src/mc-trade.js` als Vorbild, neue Funktionen daneben in `src/mc-vip.js` | Pending, Ack, Rate-Limit. Nicht in die Shop-Routen mischen. |
| `schema.sql`, `migrations/0013_vip_commands.sql` | Queue-Tabelle. |
| `INGEST.md` | `vip_worlds` und die Pending-Routen, sobald Phase 7 mergt. Nicht in diesem Plan-PR. |
| `scripts/e2e.mjs`, `scripts/e2e_ui.py` | Assertions der jeweiligen Phase. Aufruf bleibt `node scripts/e2e.mjs`. |

`MCP.games` in `public/mc/player3d.js` holt heute `/api/mc-pvp/<name>` für Profil und Spielerseite. Nach Phase 3 holt es nur noch Parkour. Die PvP-Seite hat einen eigenen Fetch.

---

## Phasen

Jede Phase ist ein PR. Sie baut auf der vorherigen auf, außer wo „parallel zu“ steht. Ein PR mischt nicht „Nav“ und „VIP-Schreiben“. Tests der Phase laufen in derselben CI wie heute (`e2e` Workflow). Bestehende Checks bleiben grün; Assertions, die PvP auf Profil oder Bestenliste erwarten, werden in Phase 3 umgeschrieben, nicht auskommentiert.

### Phase 1 — Navigation

**Dateien:** `src/mc-hub.js`, `public/mc/ds.css`, `src/worker.js` nur `ACCT_JS` und der Footer-Link auf Feedback (darf bleiben, zusätzlich zum Menü). **Test:** `scripts/e2e_ui.py`.

**Tut:** Gruppen und Ziele aus der Tabelle oben. Eine Quelle. Hover/Klick-Verhalten ohne die 500-ms-Regel. Handy-Drawer inklusive Konto. Startkacheln in derselben Reihenfolge. Aktuelle Seite markiert, auch auf Unterrouten. Horizontal-Scroller aus `HUB_CSS` löschen.

**Tut nicht:** keine neuen Daten, keine VIP-Buttons, kein Chart, kein Entfernen von PvP-Blöcken (das ist Phase 3, sonst reviewt ein PR zwei Themen).

- [ ] UI-Test 1440 px: Menübutton Community öffnet per Klick, zweiter Klick schließt, Eintrag „Spieler“ hat `href="/spieler"`, Escape schließt.
- [ ] UI-Test 1440 px: Maus verlässt das offene Panel, nach dem kurzen Delay ist es zu. Ein Klick auf den Gruppenbutton innerhalb des Delays schließt nicht „von selbst“ gegen den Klick.
- [ ] UI-Test 390 px: Burger öffnet die Liste, Konto enthält Profil, VIP und Bestellungen (eingeloggte Session wie die bestehenden e2e-Cookies), Wiki enthält `/wiki/befehle`, Fokus liegt nach Escape wieder auf dem Burger.
- [ ] UI-Test beide Breiten: auf `/pvp` ist Minispiele markiert und der PvP-Link `aria-current=page`. Auf `/markt/diamond` ist Markt markiert. Auf `/vip` ist Mein Konto markiert, nicht Community.
- [ ] Ausgeloggt: Konto ist ein Discord-Link auf `nwebnotfound.dev/auth/discord/login`, kein toter Button.
- [ ] `node scripts/e2e.mjs` grün, inklusive der bisherigen API-Checks.

### Phase 2 — Eine Oberfläche

**Dateien:** `public/mc/ds.css`, `public/mc/profile.css`, `public/mc/pvp.css`, `public/mc/economy.css`, Inline-Blöcke aus `src/worker.js` und `public/mc/item.js` dahin verschieben. **Test:** `scripts/e2e_ui.py`.

**Tut:** MC-Button, Tabs als Slot-Reihe, Bestenlisten-Podium und Profil-Karten auf die Chest-Tokens. Item-Chart ohne `<style>` im HTML. Kontrast der Rang-Badges (≥ 4.5:1 im hellen Sonderfall) bleibt, der bestehende Check in `scripts/e2e.mjs` bleibt.

**Tut nicht:** keine neuen Farben außerhalb der Tokens. Keine Funktion an PvP oder VIP ändern.

- [ ] Auf `/leaderboards`, `/profile`, `/markt/diamond`, `/vip`: kein `style=`-Attribut im `main`, kein `<style>` in `main`.
- [ ] Buttons auf diesen Seiten haben die gemeinsame Klasse und mindestens 44 px Höhe bei 390 px.
- [ ] Ein Icon im Menü und auf der Startkachel ist `/mc-icon/v2/…`, kein Emoji-Zeichen in der Nav.
- [ ] `prefers-reduced-motion`: kein Transform auf Karten-Hover (die Media-Query in `ds.css` bleibt wirksam).

### Phase 3 — PvP nur auf `/pvp`

**Dateien:** `src/worker.js` (`LEADERBOARDS_MC`, `PROFILE_BODY`), `src/mc-players.js`, `public/mc/pvp.js`, `public/mc/player3d.js` (`MCP.games`). **Test:** `scripts/e2e.mjs`, `scripts/e2e_ui.py`.

**Tut:** Arena-Tab, PvP-Fetch und Quote-Podium von `/leaderboards` entfernen. Winrate-KPI und `.pvp-arena` aus dem Profil entfernen. `#pvp-pl`, das Nachladen in `pvp.js` und die Winrate-Zeile von `/spieler/<name>` entfernen. Survival-Kills, Tode, Parkour-Bestzeit bleiben, wo sie sind. `GET /api/mc-pvp` bleibt und speist nur `/pvp`. Leaderboard-Kategorien `pvp*` und `kd`/`kdr`/`k_d`/`kill_death` erzeugen keinen Tab, auch wenn der Ingest sie schickt.

**Tut nicht:** die PvP-Tabelle auf `/pvp` nicht umbauen, Quote-Formel nicht ändern (Best of 3, Quote auch unter 5 Kämpfen, #34).

- [ ] `e2e.mjs`: Ingest mit `pvp_stats` und einem Leaderboard-Key `pvp`. `GET /leaderboards`-HTML enthält nicht `data-k="pvp"` und nicht „Siegquote“. `GET /pvp` enthält die Tabelle und den Spielernamen.
- [ ] UI 1440 px, eingeloggt: `/profile` und `/spieler/Nils` enthalten nicht „PvP-Winrate“, nicht „Lieblings-Kit“, nicht `#pvp-pl`. Parkour-Zeile ist noch da, wenn der Ingest eine Zeit hat.
- [ ] `/pvp` bei 390 px: Tabelle scrollbar, Kopfzeile Siege/Niederlagen/Quote sichtbar, Link auf `/spieler/<name>` bleibt (die Zielseite zeigt nur keine Arena-Zahlen).

### Phase 4 — Glatte Preislinien

**Dateien:** `mono` aus `public/mc/item.js` nach `public/mc/common.js` ziehen. `spark()` und der Item-Chart rufen beide `mono` auf. **Test:** `scripts/e2e_ui.py` und `scripts/e2e.mjs` lesen das SVG nach dem Markt-Ingest.

**Tut:** Jede Preis-Sparkline (Startseite, `/markt`) als monotone Kubik (`C`-Befehle), dieselbe Steigungslogik wie `mono`: Steigung 0 bei Vorzeichenwechsel, Klammern damit die Kurve nicht über den nächsten Punkt hinausschwingt. Fläche folgt der Kurve. Tooltip und Reset-Strich „neue Preise“ bleiben an echten Samples. Der Item-Chart bleibt inhaltlich der Chart aus #34 (Zacken-Filter: eine volumenlose Zacke zwischen ähnlichen Nachbarn fällt, ein Crash mit Folge oder Umsatz bleibt).

**Tut nicht:** `public/mc/economy.js` nicht glätten. Die Geldmenge ist ein Wert pro Kalendertag; eine Spline würde Tage erfinden.

- [ ] Nach Markt-Ingest enthält die Sparkline auf `/markt` einen Pfad mit `C` und nicht nur `M`/`L`.
- [ ] Der Item-Chart-Pfad für Diamond enthält `C`. Ein Testpunkt mit einem einzelnen Ausreißer ohne Volumen zwischen zwei nahen Nachbarn fehlt in der Serie; ein Ausreißer mit Volumen bleibt (die Regel steht schon in `series()`).
- [ ] `#econ-card` auf `/markt` enthält weiter den Stufenpfad (`H`/`V`) und die Tages-Tabelle.

### Phase 5 — 3D-Köpfe folgen der Maus

**Dateien:** `public/mc/player3d.js`, CSS nur wenn die Büste einen festen Rahmen braucht. **Test:** reine Funktion in `scripts/e2e.mjs` (ohne WebGL) und ein UI-Check, dass das Profil-Canvas bei 1440 px existiert.

**Tut:** `look()` an jede Live-Instanz hängen, die `live3d` erzeugt (Profil `.pf-model`, Podium `.pod-model`, Online-Liste auf `/`). Grenzen bleiben die heutigen: Kopf-Gier ±0.85 der normalisierten Zeigerposition, Nick ±0.55, Körper-Gier zusätzlich ±0.35 der X-Komponente, Nachziehen 0.08 pro Frame. Pause wenn der Tab versteckt ist oder die Büste den Viewport verlässt. Zoom und Pan bleiben aus.

**Tut nicht:** Standbild-Pfad nicht „reparieren“. Bei `max-width: 640px`, `hover: none` oder `prefers-reduced-motion` weiter ein Frame als `<img>`, kein `pointermove`.

- [ ] Reine Funktion: Zeiger in der Mitte → Ziel 0/0. Zeiger am rechten Rand der Formel → Gier gekappt bei 1, nicht darüber. Dieselbe Kappung für Nick.
- [ ] UI 1440 px auf `/profile` (Session mit verknüpftem Spieler): `.pf-model` ist da. UI 390 px: kein dauerhaftes Canvas-Loop-Attribut, das nur der Feinzeiger setzt (die Seite setzt `data-look` nur im Feinzeiger-Pfad; bei 390 px fehlt es).
- [ ] Code-Review-Check im PR: `look` wird nicht mehr von `classList.contains('pf-model')` abgebrochen.

Phase 4 und Phase 5 dürfen parallel zu Phase 2 liegen, nachdem Phase 1 mergt. Phase 3 vor Phase 2, damit Phase 2 keine PvP-Karten restylt, die Phase 3 löscht.

### Phase 6 — VIP lesen, gegen die abstrakte Form

**Dateien:** `src/mc-vip.js`, `public/mc/vip.js`, `public/mc/vip.css`, `scripts/vip-unit.mjs`. **Test:** Unit über den bestehenden Aufruf `import "./vip-unit.mjs"` in `e2e.mjs`, plus UI.

**Tut:** `GET /api/mc-vip` kann die erweiterte Slot-Form aus diesem Plan aus einem `vip_worlds`-Ingest füllen. Ohne das Feld bleibt `pickVipWorlds`. UI: Status, Info-Text, Mitglieder nur für den Owner, als Text. Buttons für An/Aus, Speichern und Einladen sind nicht im DOM, solange Phase 8 nicht mergt. Kein Formular (der heutige e2e-Check „VIP: kein Formular“ bleibt in dieser Phase wahr).

**Tut nicht:** keine Tabelle `mc_vip_commands`, kein POST außer dem bestehenden 405 auf `/api/mc-vip`.

- [ ] Unit: Snapshot ohne VIP-Key → `placeholder: true`. Snapshot `vip1` online → ein Slot, `owner: false`. Ingest `vip_worlds` mit `owner_uuid` der Session → `owner: true`, Mitgliederliste, Info.
- [ ] Fremde UUID sieht die Mitgliederliste nicht.
- [ ] UI eingeloggt als VIP: Welten-Status sichtbar, `form`-Count 0, PvP-Wörter nicht im Panel.
- [ ] UI ohne Rang: Katalog, Grund `rank` oder `link` oder `login`, keine Slot-Buttons.

Diese Phase darf parallel zu Phase 2–5 laufen, nachdem Phase 1 das VIP-Ziel unter Mein Konto gelegt hat.

### Phase 7 — Befehlswarteschlange

**Gesperrt, bis die Offen-Punkte mit der Markierung „ändert das JSON“ beantwortet sind** (`id`, `owner_uuid`, Polling vs. Worker-`fetch`). Ein Kommentar von Craft am Plan-PR oder ein Abschnitt in deren API-Dokument reicht. Danach die Namen 1:1 übernehmen, wenn sie von diesem Plan abweichen, und erst dann implementieren.

**Dateien:** `src/mc-vip.js`, `schema.sql`, `migrations/0013_vip_commands.sql`, `INGEST.md`, `scripts/e2e.mjs`. Kein UI-Umbau außer dem, was Phase 8 braucht; diese Phase kann die Routen ohne Buttons testen.

**Tut:** die vier Mutationen, Pending-GET, Ack-POST, Rate-Limits, Idempotenz, Whitelist. Ingest-Feld `vip_worlds` schreiben. Token-Fehler 401. Kein Feld `command` mit freiem Text.

- [ ] Ohne Cookie → 401. Mit Cookie, ohne Rang → 403. Mit Rang, fremde Welt → 404.
- [ ] Owner `POST …/power {"state":"start"}` → 202, Zeile `pending`. Zweites Power auf derselben Welt → 409 `busy`.
- [ ] Gleicher `request_id`, gleicher Body → 200 `duplicate`. Gleicher `request_id`, anderes `info` → 409.
- [ ] 4. Power innerhalb einer Stunde für dieselbe Welt → 429.
- [ ] `GET …/commands/pending` ohne Token → 401. Mit Token liegt das Item da, `op` ist `world.start`, kein weiteres String-Feld mit einem Rohbefehl.
- [ ] Ack `confirmed`, zweites Ack `failed` → Status bleibt `confirmed`.
- [ ] Body `{"op":"op","command":"op Nils"}` auf jeder VIP-Route → 400, keine Zeile.
- [ ] Ingest `vip_worlds` ersetzt die Liste; ein Ingest ohne das Feld lässt sie stehen.

### Phase 8 — VIP-Bedienung

**Nach Phase 7.** **Dateien:** `public/mc/vip.js`, `public/mc/vip.css`, `scripts/e2e_ui.py`.

**Tut:** Für Slots mit `owner: true`: Schalter An/Aus (beschriftet „Starten“ / „Stoppen“, nicht ein roher Befehl), Feld Info mit Speichern, Mitglied hinzufügen (Name) und Entfernen. Nach 202 zeigt die Karte „wird bestätigt“ bis `GET /api/mc-vip` die Zeile nicht mehr in `pending` hat oder der Ack einen Satz aus der festen Grund-Liste liefert. Fehler 403/409/429 als Satz neben der Karte, kein `alert`. Turnstile ist hier nicht nötig: die Aktion ist an die Discord-Session und den Rang gebunden, nicht an anonyme Posts. Origin-Prüfung bleibt serverseitig.

**Tut nicht:** keine Mitgliederverwaltung für `owner: false`. Keine Seed-, Modus- oder Gamerule-Felder.

- [ ] UI 1440 px und 390 px, VIP-Session: Stoppen sendet den Power-POST (Route abfangen), die Karte zeigt „wird bestätigt“, nach gemocktem erneutem GET mit `online: false` steht „offline“.
- [ ] Name `Bad Name!` wird nicht abgeschickt; der Client lässt nur `^[A-Za-z0-9_]{1,16}$` zu. Der Server lehnt dasselbe noch einmal ab (Phase 7).
- [ ] Spieler ohne Rang sieht weiterhin kein Formular.
- [ ] Tastatur: Schalter und Entfernen-Buttons per Tab erreichbar, sichtbarer Fokus.

### Phase 9 — Scoreboards, wenn Craft sie neu dokumentiert

**Gesperrt auf das API-Dokument.** **Dateien:** der Ingest-Mapper in `src/worker.js` (heute die `v_leaderboards`-Normalisierung), `INGEST.md`, Tests in `e2e.mjs`. Die Seiten bleiben.

**Tut:** neue Felder auf die bestehenden Listen `money`, `playtime`, `blocks_mined`, `kills`, `distance` abbilden. PvP-Zahlen nur in `mc_pvp_stats` und auf `/pvp`. Unbekannte Survival-Kategorien dürfen einen eigenen Tab behalten, PvP-Kategorien nicht.

**Tut nicht:** keine zweite Bestenliste und keine PvP-Quote auf dem Podium.

---

## Testplan (über alle Phasen)

Lokal und in CI derselbe Einstieg: `node scripts/e2e.mjs`. Der startet `wrangler dev` mit frischer D1 aus `schema.sql` unter `.wrangler/e2e`, Token `e2e-token`, und ruft `scripts/e2e_ui.py` (Playwright 1.64.1, Chromium, Breiten 390 und 1440, Host-Header `mc.nwebnotfound.dev`). Keine Produktionsdaten.

Jeder Phasen-PR:

1. Bestehende API-Fälle in `e2e.mjs` bleiben (Ingest 401, Markt, Gebot, Ack, Parkour, Ränge).
2. Neue Fälle der Phase stehen direkt unter dem vorhandenen Abschnitt, mit derselben `ok()`-Form, nicht in einem zweiten Runner.
3. UI-Fälle nutzen die vorhandenen Helfer `go()` und die Session-Cookies. Neue Selektoren sind stabile Ids (`#vip`, `#pvp`, `#econ-card`), keine Text-Fragmente aus dem Marketing.
4. Eine Phase, die eine alte Assertion falsch macht (PvP-Tab, VIP-Formular ab Phase 8), ersetzt die Assertion in demselben PR.
5. `node scripts/icon-check.mjs` bleibt im Workflow vor dem e2e. Neue Icons sind vorhandene Item-Ids, keine neuen PNG, außer ein späterer PR braucht ein Texture-Loch (nicht Teil dieses Plans).

Manuell, einmal pro Phasen-PR, weil WebGL und echtes Hover im Headless unzuverlässig sind: Desktop-Menü mit Maus und Tastatur, Handy-Breite 390 im Browser, Profil-Kopf folgt dem Zeiger und steht still bei „Bewegung reduzieren“. Das ersetzt nicht die Assertions oben.

---

## Reihenfolge

1. Phase 1 Navigation.
2. Phase 3 PvP-Schnitt, danach Phase 2 Oberfläche. Phase 4 und 5 parallel dazu, nach Phase 1.
3. Phase 6 VIP lesen, sobald Phase 1 das Menüziel gelegt hat. Parallel zu 2–5.
4. Phase 7 und 8 erst nach den offenen Craft-Punkten, die das JSON ändern.
5. Phase 9 wenn das Scoreboard-Dokument da ist. Unabhängig von VIP, abhängig von Phase 3 (damit neue PvP-Keys nicht wieder einen Tab erzeugen).

Nicht in diesem Rework: Portfolio, Gästebuch, MineRush spielbar machen, Wiki-Texte zu Ende schreiben, Economy-Regeln, Whitelist, ein öffentlicher Admin.

## Selbst-Check gegen den Auftrag

- Navigation nach Server, Wirtschaft, Minispiele, Community, Wiki, Konto: Phase 1, Tabelle oben.
- Mobil und Desktop, ein Stil, Pixel-Schrift, Slots, MC-Buttons, Item-Icons: Phase 1 und 2.
- VIP mit Discord-Login, eigene Welten, An/Aus, Infos, Mitglieder, Status: Phase 6 lesen, Phase 7 Queue, Phase 8 UI. Auth ist die bestehende Session plus Rang.
- Abstrakte API, Rate-Limits, kein öffentliches RCON: Abschnitt „VIP“. Offene Punkte sind dort markiert und sperren Phase 7/8.
- Bestand mit Schwächen: Abschnitt „Bestandsaufnahme“.
- Kleine PRs plus Playwright: Phasen 1–9 und der Testplan.
- PvP nur auf `/pvp`: Phase 3. Glatte Preislinien: Phase 4, Item-Chart bleibt, Geldmenge bleibt Stufe. 3D-Köpfe folgen der Maus: Phase 5, auf dem Profil ist es schon da und wird auf die anderen Büsten ausgeweitet.
