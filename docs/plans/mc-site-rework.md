# Minecraft-Bereich: Rework-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Dieses Dokument ist der Plan. Es ändert keinen Worker, kein Schema und kein Frontend. Die Umsetzung sind drei Folge-PRs gegen `main` (Menüs und Layout, VIP-API, VIP-UI). Jeder davon hat seine eigenen e2e-Checks grün, bevor er mergt.

**Goal:** `mc.nwebnotfound.dev` so umbauen, dass Nils den Minecraft-Bereich bedienen kann: eine Navigation nach Aufgaben, ein einheitlicher Minecraft-Look, PvP nur auf der PvP-Seite, glatte Preislinien, 3D-Köpfe die der Maus folgen, und ein VIP-Panel mit Discord-Login, das eigene Welten verwaltet, ohne RCON oder Admin nach außen zu geben.

**Architecture:** Ein Cloudflare Worker (`nwebnotfound-site`, `src/worker.js`) rendert weiter HTML und spricht nur mit D1. Öffentliche Daten bleiben Ingest-Snapshots. Schreibaktionen der Website (heute Gebote, Shop-Orders, Bankkauf) sind Zeilen in einer Pending-Queue; Creepy bzw. `NwebNotFound/mc-stack` holt sie mit `x-ingest-token` ab, führt sie im privaten Netz aus und bestätigt per Ack. VIP-Befehle nutzen genau dieses Muster gegen eine abstrakte Schnittstelle. Der Browser spricht nie mit dem Spielserver.

**Tech Stack:** Cloudflare Worker, D1 (`binding` `DB`, Datenbank `nwebnotfound-guestbook`), bestehende Discord-Session (`nnf_session`, `Domain=.nwebnotfound.dev`), Vanilla-JS in `public/mc/`, Playwright über `node scripts/e2e.mjs` und `scripts/e2e_ui.py` (Chromium, 390 px und 1440 px), CI `.github/workflows/e2e.yml`.

## Global Constraints

- Hosts bleiben: Portfolio `nwebnotfound.dev`, Minecraft `mc.nwebnotfound.dev`. `/auth/*` auf dem MC-Host leitet weiter auf den Apex um. Cookie bleibt `HttpOnly; Secure; SameSite=Lax; Domain=.nwebnotfound.dev`.
- Kein RCON, kein Admin-Port und keine Befehlszeichenkette im Browser oder in öffentlichem JSON. Der Client sendet nur ein festes `op` aus der Whitelist plus typisierte Argumente.
- `MC_INGEST_TOKEN` liegt nur als Cloudflare-Worker-Secret (`wrangler secret`). Er steht nicht in `wrangler.jsonc`, nicht im Git, nicht im HTML und nicht in `public/mc/`. Pending und Ack vergleichen ausschließlich `env.MC_INGEST_TOKEN` mit dem Header `x-ingest-token`. Query, Cookie oder Body reichen nicht.
- Geld bleibt ganzzahlige Cent. Die Website entscheidet keine Beträge; maßgeblich ist der Server (siehe `INGEST.md`).
- Neue MC-Oberflächen: keine Emojis, keine Inline-Styles, keine `<style>`-Blöcke im Seiteninhalt. Icons nur über `/mc-icon/v2/<id>` (pixelig). Überschriften Monocraft (`--f-px`), Fließtext die Systemschrift (`--f-body`). Tokens nur aus `public/mc/ds.css`.
- PvP-Stats (Siege, Niederlagen, Kämpfe, Quote, Lieblings-Kit, Arena-Tab) stehen nur auf `/pvp`. Nicht auf `/leaderboards`, `/profile`, `/spieler` oder `/spieler/<name>`.
- Preisgraphen sind glatte monotone Kubiken. Der bestehende Item-Chart in `public/mc/item.js` (`mono`) bleibt die Referenz und wird nicht wieder zur Polylinie. Die Geldmengen-Kurve auf `/markt` (`public/mc/economy.js`) bleibt eine Stufe pro Tag; das ist kein Preis.
- 3D-Köpfe folgen der Maus nur bei feinem Zeiger (`(hover:hover) and (pointer:fine)`). `prefers-reduced-motion`, grober Zeiger und schmale Viewports bleiben beim Standbild (`STATIC()` in `public/mc/player3d.js`). Der Loop pausiert außerhalb des Bildschirms und bei verstecktem Tab (Stand nach #34).
- Deutschsprachige UI. Freitext immer über die bestehende Escape-Funktion (`MC.E` bzw. `esc` im Worker).
- Portfolio (`/`, `/guestbook`, `/profile` auf dem Apex, `/api/guestbook`) ist nicht Teil dieses Reworks.
- `NwebNotFound/mc-stack` wird hier nicht implementiert. Die Website plant gegen die Schnittstelle in diesem Dokument. Punkte mit der Markierung **Offen mit Craft**, die das JSON ändern, blockieren Folge-PR 2, nicht Folge-PR 1.
- Jede VIP-Aktion prüft serverseitig, ob die UUID aus `mc_links` der Session Owner oder Mitglied der Welt ist. Der Browser und der Request-Body entscheiden das nicht. Ein e2e-Fall in Folge-PR 2 deckt Owner, Mitglied und Fremden ab.

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

Stand `main` (`src/worker.js` Fetch, Host `mc.nwebnotfound.dev`). Schwäche ist der Grund, die Route in den Rework zu nehmen. „Bleibt“ heißt: Inhalt und URL bleiben, die Hülle (Navigation, Typo, Slots) zieht in Folge-PR 1 mit.

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
| `GET /api/mc-vip` | Cookie, `private, no-store`, POST 405 | Folge-PR 2 erweitert die Leseform und filtert auf Owner oder Mitglied. Schreiben liegt auf eigenen Routen, nicht auf diesem GET. |
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
4. **Welt-Check, jede VIP-Aktion, nur auf dem Worker.** Nach Session, Link und Rang lädt der Worker die Welt aus dem letzten `vip_worlds`-Stand. Die UUID aus `mc_links` ist `owner_uuid` (Rolle `owner`) oder sie steht über den verknüpften Namen in `members` (Rolle `member`). Sonst `403 {reason:"not_member"}` und keine Zeile in `mc_vip_commands`. `mc_uuid`, `owner` oder `members` aus dem Body werden ignoriert. Ein Fallback-Slot aus `servers` ohne `owner_uuid` hat keine Rolle und ist nicht aufrufbar.
5. Schreiben (Power, Info, Einladen, Entfernen) verlangt zusätzlich Rolle `owner`. Ein Mitglied besteht den Welt-Check und bekommt danach `403 {reason:"owner"}`, ebenfalls ohne neue Zeile. Lesen liefert Owner und Mitglied nur die Welten, in denen sie eine der beiden Rollen haben. **Offen mit Craft:** Co-Owner. Bis dahin gibt es genau einen Owner, und nur der schreibt.

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
- Weder Owner noch Mitglied, oder der Ingest kennt die Welt nicht: 403 `not_member`. Der Fallback aus `servers` ohne `owner_uuid` ist nicht schaltbar. Ein Mitglied, das schreibt: 403 `owner`.
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
  → Worker prüft Session, Link, Rang
  → Worker prüft serverseitig: UUID der Session ist Owner oder Mitglied dieser Welt
  → beim Schreiben zusätzlich: Rolle ist Owner
  → Rate-Limit, op-Whitelist
  → nur dann INSERT mc_vip_commands (status pending)
  → 202 request_id
mc-stack / Creepy, Header x-ingest-token = Worker-Secret MC_INGEST_TOKEN, nie aus dem Browser
  → GET /api/mc-vip/commands/pending?since=<ms>
  → mappt op auf die eigene, nicht öffentliche API
  → POST /api/mc-vip/commands/ack
  → nächster POST /api/mc-ingest mit vip_worlds
Browser
  → GET /api/mc-vip sieht pending, danach den neuen Stand
```

Der Worker öffnet in diesem Plan keine Verbindung zum Spiel. Es gibt keinen Pfad, auf dem ein Besucher Host, Port, Passwort oder eine Rohzeile wie `op Nils` setzt. Das Ingest-Token ist nur das Worker-Secret `MC_INGEST_TOKEN`. Der Worker liest es aus `env`, legt es in keine Response und akzeptiert es nur als Header `x-ingest-token`. Die lokale e2e-Datei `.dev.vars` bleibt untracked; der dortige Testwert `e2e-token` darf in keiner ausgelieferten Seite vorkommen.

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

Höchstens 30 Welten pro Push. Ungültige Zeilen fallen weg, der Rest wird geschrieben. `players` ist entweder eine Namensliste oder eine Zahl (wie `playerCount` heute). Der öffentliche Serverstatus auf `/` zeigt VIP-Welten nur als „online/offline + Spielerzahl“, ohne Mitgliederliste. Die Mitgliederliste sehen nur Owner und Mitglieder dieser Welt, und nur über `GET /api/mc-vip`.

**Offen mit Craft:**

- Stabile `id` gegen die heutigen Snapshot-Keys (`vip`, `vip1`, `vip_world_3`). Bis die Id festliegt, nimmt die Website beide: Ingest-`id` wenn vorhanden, sonst den Key.
- Wer eine Welt „besitzt“, wenn mc-stack Ränge statt `owner_uuid` schickt. Ohne `owner_uuid` gibt es keine Buttons.
- Inhalt von „Infos“ über das eine Feld `info` hinaus (MOTD, Seed, Spielmodus, Gamerules). Alles weitere ist draußen, bis es ein benanntes Feld gibt.
- Ob An/Aus die Welt entlädt, nur die Whitelist schließt oder den Proxy-Server abmeldet. Die Website sendet `start`/`stop` und zeigt danach das, was der Ingest unter `online` meldet. Sie rät nicht.
- Mitglieder-Obergrenze und Welten pro Owner. Website-Default: 3 Welten sichtbar, 12 Mitglieder. Der Server darf weniger akzeptieren und per Ack ablehnen.
- Scoreboard-Neuaufbau. Bis das Dokument da ist, bleibt `v_leaderboards` / `leaderboards` aus `INGEST.md` der Vertrag. Liegt es vor dem Merge von Folge-PR 2, mappt derselbe PR in `mc_leaderboards`. Es gibt dafür keinen vierten PR. PvP-Kategorien bekommen keinen Tab (Folge-PR 1). Die PvP-Seite liest weiter `pvp_stats` bzw. `GET /api/mc-pvp`.

### D1, in Folge-PR 2

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
| `src/mc-vip.js`, `public/mc/vip.js`, `public/mc/vip.css` | Folge-PR 2: Lese-API und Queue. Folge-PR 3: Formulare, die nur die vier Mutationen aufrufen. |
| `src/mc-trade.js` als Vorbild, neue Funktionen daneben in `src/mc-vip.js` | Pending, Ack, Rate-Limit. Nicht in die Shop-Routen mischen. |
| `schema.sql`, `migrations/0013_vip_commands.sql` | Queue-Tabelle. |
| `INGEST.md` | `vip_worlds` und die Pending-Routen, in Folge-PR 2. Nicht in diesem Plan-PR. |
| `scripts/e2e.mjs`, `scripts/e2e_ui.py` | Assertions der jeweiligen Phase. Aufruf bleibt `node scripts/e2e.mjs`. |

`MCP.games` in `public/mc/player3d.js` holt heute `/api/mc-pvp/<name>` für Profil und Spielerseite. Nach Folge-PR 1 holt es nur noch Parkour. Die PvP-Seite hat einen eigenen Fetch.

---

## Drei Folge-PRs

Die Umsetzung sind drei PRs, in dieser Reihenfolge. Sie laufen in derselben CI wie heute (`.github/workflows/e2e.yml`). Bestehende Checks bleiben grün. Eine Assertion, die der PR falsch macht, wird in demselben PR ersetzt, nicht auskommentiert. Kein vierter PR für Scoreboards, PvP, Charts oder Köpfe: das liegt in PR 1 bzw. im Ingest von PR 2.

### Folge-PR 1 — Menüs und Layout

**Dateien:** `src/mc-hub.js`, `public/mc/ds.css`, `public/mc/profile.css`, `public/mc/pvp.css`, `public/mc/economy.css`, `public/mc/common.js`, `public/mc/item.js`, `public/mc/player3d.js`, `public/mc/pvp.js`, `src/mc-players.js`, `src/worker.js` (Nav, `ACCT_JS`, `LEADERBOARDS_MC`, `PROFILE_BODY`, ausgelagerte Inline-CSS). **Tests:** `scripts/e2e.mjs`, `scripts/e2e_ui.py`.

**Tut:**

- Gruppen und Ziele aus der Tabelle oben. Eine Quelle. Hover/Klick ohne die 500-ms-Regel. Handy-Drawer inklusive Konto. Startkacheln in derselben Reihenfolge. Aktuelle Seite markiert, auch auf Unterrouten. Den Horizontal-Scroller aus `HUB_CSS` löschen.
- MC-Button, Tabs als Slot-Reihe, Bestenlisten-Podium und Profil-Karten auf die Chest-Tokens. Item-Chart ohne `<style>` im HTML. Kontrast der Rang-Badges (≥ 4.5:1 im hellen Sonderfall) bleibt.
- PvP-Zahlen nur noch auf `/pvp`. Arena-Tab, PvP-Fetch und Quote-Podium von `/leaderboards` weg. Winrate-KPI und `.pvp-arena` aus dem Profil weg. `#pvp-pl` und die Winrate-Zeile von `/spieler/<name>` weg. Survival-Kills, Tode und Parkour-Bestzeit bleiben. `GET /api/mc-pvp` speist nur `/pvp`. Leaderboard-Keys `pvp*` und `kd`/`kdr`/`k_d`/`kill_death` erzeugen keinen Tab. Die Quote-Formel (Best of 3, auch unter 5 Kämpfen) bleibt.
- `mono` aus `public/mc/item.js` nach `public/mc/common.js`. Sparkline und Item-Chart benutzen sie (monotone Kubik, `C`-Befehle, Steigung 0 bei Vorzeichenwechsel). Der Zacken-Filter aus #34 bleibt. `public/mc/economy.js` bleibt eine Stufe pro Tag.
- `look()` an jeder Live-Büste (`.pf-model`, `.pod-model`, Online-Liste auf `/`). Grenzen und Pause wie nach #34. Unter 640 px, bei grobem Zeiger und bei `prefers-reduced-motion` bleibt das Standbild.

**Tut nicht:** keine VIP-Queue, keine VIP-Formulare, kein neuer Ingest-Vertrag. `/vip` bleibt das bisherige Read-only-Panel, nur in der Gruppe Mein Konto.

- [ ] UI 1440 px: Community öffnet per Klick und schließt beim zweiten Klick, „Spieler“ hat `href="/spieler"`, Escape schließt. Nach dem Verlassen des Panels schließt der kurze Delay. Ein Klick auf den Gruppenbutton schließt nicht gegen den Klick.
- [ ] UI 390 px: Burger öffnet die Liste, Konto enthält Profil, VIP und Bestellungen, Wiki enthält `/wiki/befehle`, Fokus liegt nach Escape auf dem Burger.
- [ ] Beide Breiten: `/pvp` markiert Minispiele, `/markt/diamond` markiert Markt, `/vip` markiert Mein Konto und nicht Community. Ausgeloggt ist Konto der Discord-Login-Link.
- [ ] `/leaderboards`, `/profile`, `/markt/diamond`, `/vip`: kein `style=` und kein `<style>` in `main`. Buttons mindestens 44 px hoch bei 390 px. Nav-Icons sind `/mc-icon/v2/…`.
- [ ] Ingest mit `pvp_stats` und Leaderboard-Key `pvp`: `/leaderboards` enthält nicht `data-k="pvp"` und nicht „Siegquote“. `/pvp` enthält die Tabelle. `/profile` und `/spieler/Nils` enthalten nicht „PvP-Winrate“, nicht „Lieblings-Kit“, nicht `#pvp-pl`. Parkour bleibt, wenn eine Zeit im Ingest liegt.
- [ ] Sparkline auf `/markt` enthält `C`. Der Diamond-Chart enthält `C`. Eine einzelne volumenlose Zacke zwischen nahen Nachbarn fehlt, ein Ausreißer mit Volumen bleibt. `#econ-card` behält `H`/`V` und die Tages-Tabelle.
- [ ] Reine Funktion: Zeiger in der Mitte ergibt 0/0, am Rand ist die Gier bei 1 gekappt, ebenso der Nick. `look` bricht nicht mehr an `pf-model` ab. UI 1440 px: `.pf-model` auf `/profile`. UI 390 px: das `data-look` des Feinzeiger-Pfads fehlt.

### Folge-PR 2 — VIP-API und D1-Warteschlange

**Gesperrt, bis die Offen-Punkte, die das JSON ändern, beantwortet sind** (`id`, `owner_uuid`, Polling gegen Worker-`fetch`). Ein Kommentar von Craft an PR #35 oder ein Abschnitt in deren API-Dokument reicht. Abweichende Namen werden 1:1 übernommen, dann erst gebaut.

**Dateien:** `src/mc-vip.js`, `src/worker.js` (Routen, Ingest-Feld), `schema.sql`, `migrations/0013_vip_commands.sql`, `INGEST.md`, `scripts/e2e.mjs`, `scripts/vip-unit.mjs`. **Keine** Verwaltungs-Formulare; die bleiben Folge-PR 3. `GET /api/mc-vip` darf die erweiterte JSON-Form schon liefern.

**Tut:** die vier Mutationen, Pending-GET, Ack-POST, Rate-Limits, Idempotenz, op-Whitelist, Ingest-Feld `vip_worlds`. Token-Fehler 401. Kein freies Feld `command`. Liegt Crafts Scoreboard-Dokument vor, mappt dieser PR es auf `money` / `playtime` / `blocks_mined` / `kills` / `distance`. PvP-Zahlen landen nur in `mc_pvp_stats`.

**Ingest-Token.** `MC_INGEST_TOKEN` ist ausschließlich ein Worker-Secret. Produktion setzt ihn mit `wrangler secret put MC_INGEST_TOKEN`, nicht als `var` in `wrangler.jsonc` und nicht in einer committeten Datei. Der Worker vergleicht nur den Header `x-ingest-token` mit `env.MC_INGEST_TOKEN`. Dieselbe Regel gilt für Pending und Ack der VIP-Queue und für den bestehenden `POST /api/mc-ingest`. Ein Token in Query, Cookie oder JSON-Body ist 401. Die Response von `/`, `/vip` und `/mc/vip.js` enthält den Token nicht. Lokal schreibt `scripts/e2e.mjs` den Testwert in `.dev.vars` und löscht die Datei danach wieder; `.dev.vars` bleibt gitignored.

**Welt-Check.** Jede VIP-Route (Lesen einer Welt, Power, Info, Mitglied hinzu, Mitglied weg) macht das auf dem Server, nach dem Auflösen der Session:

1. UUID nur aus `mc_links` der `discord_id`. Body-Felder `mc_uuid`, `discord_id`, `owner`, `members` zählen nicht.
2. Rolle `owner`, wenn diese UUID `owner_uuid` der Welt ist. Rolle `member`, wenn der verknüpfte Minecraft-Name in `members` steht. Sonst `403 {reason:"not_member"}`.
3. Bei 403 wird nicht in `mc_vip_commands` geschrieben.
4. Schreiben verlangt Rolle `owner`. Ein Mitglied bekommt `403 {reason:"owner"}`, wieder ohne Zeile.
5. `GET /api/mc-vip` enthält nur Welten mit Rolle `owner` oder `member`. Eine fremde Welt fehlt in der Liste, statt ihre Mitglieder zu zeigen.

- [ ] Unit: kein VIP-Key → `placeholder: true`. Key `vip1` ohne Owner → Slot, nicht aufrufbar. `vip_worlds` mit `owner_uuid` der Session → Rolle `owner`. Name in `members` → Rolle `member`. Weder noch → die Welt fehlt.
- [ ] Drei Sessions, alle Rang VIP, alle verlinkt: Owner, Mitglied (Name steht in `members`), Fremder (Rang VIP, nicht in `members`).
- [ ] Owner `POST …/power {"state":"start"}` → 202, genau eine Zeile `pending`, `actor_uuid` ist die UUID aus `mc_links`, nicht aus dem Body. Zweites Power auf derselben Welt → 409 `busy`.
- [ ] Mitglied `POST …/power` → 403 `owner`, Zeilenzahl bleibt 0. Mitglied `GET /api/mc-vip` → die Welt ist drin, `owner: false`.
- [ ] Fremder `POST …/power`, auch mit `mc_uuid` des Owners im Body → 403 `not_member`, Zeilenzahl bleibt 0. Fremder `GET /api/mc-vip` → diese Welt fehlt.
- [ ] Owner einer anderen Welt, der dort weder Owner noch Mitglied ist → derselbe 403 `not_member`.
- [ ] Ohne Cookie → 401. Mit Cookie, ohne Rang VIP/MVP → 403 `rank`.
- [ ] Gleicher `request_id`, gleicher Body → 200 `duplicate`. Gleicher `request_id`, anderes `info` → 409. Viertes Power in einer Stunde für dieselbe Welt → 429.
- [ ] `GET …/commands/pending` ohne Header → 401. Mit Header `x-ingest-token` gleich dem Worker-Secret → das Item, `op` ist `world.start`, kein Rohbefehl. Dieselbe URL mit `?token=` statt Header → 401.
- [ ] `GET /vip` und `GET /mc/vip.js` enthalten den Test-Token nicht.
- [ ] Ack `confirmed`, zweites Ack `failed` → Status bleibt `confirmed`. Body `{"command":"op Nils"}` → 400, keine Zeile.
- [ ] Ingest `vip_worlds` ersetzt die Liste. Ein Ingest ohne das Feld lässt sie stehen.

### Folge-PR 3 — VIP-Verwaltungs-UI

**Nach Folge-PR 2.** **Dateien:** `public/mc/vip.js`, `public/mc/vip.css`, `scripts/e2e_ui.py`. Die API aus PR 2 bleibt die einzige Schreibstelle. Die Seite prüft die Rolle nicht selbst nach: sie zeigt, was `GET /api/mc-vip` hergibt, und der Worker lehnt falsche Posts ab.

**Tut:** Für Slots mit `owner: true`: Schalter „Starten“ / „Stoppen“, Feld Info mit Speichern, Mitglied hinzufügen und Entfernen. Nach 202 zeigt die Karte „wird bestätigt“, bis `pending` leer ist oder ein Ack-Grund aus der festen Liste als Satz daneben steht. 403/409/429 als Satz, kein `alert`. Für `member: true` und `owner: false`: Status und Info-Text, keine Schalter und kein Mitglieder-Formular. Turnstile braucht es hier nicht. Origin-Prüfung bleibt serverseitig in PR 2.

**Tut nicht:** keine Seed-, Modus- oder Gamerule-Felder. Kein zweiter Weg, der die Queue umgeht. Kein Ingest-Token im Frontend.

- [ ] UI 1440 px und 390 px, Owner-Session: Stoppen trifft den Power-POST, die Karte zeigt „wird bestätigt“, nach erneutem GET mit `online: false` steht „offline“.
- [ ] Dieselbe Seite als Mitglied: Status sichtbar, `form`-Count 0, kein Starten/Stoppen.
- [ ] Dieselbe Seite als Fremder mit VIP-Rang: diese Welt fehlt, kein Formular.
- [ ] Name `Bad Name!` geht nicht raus. Der Server lehnt dasselbe Muster noch einmal ab (PR 2).
- [ ] Ohne Rang: Katalog, Grund `rank`, `link` oder `login`, keine Slot-Buttons.
- [ ] Schalter und Entfernen sind per Tab erreichbar, Fokus sichtbar.
- [ ] Ein abgefangener Power-POST der Mitglieder-Session kommt beim UI nicht vor, weil kein Button da ist. Der API-Fall „Mitglied schreibt → 403“ bleibt der Test aus PR 2 und wird hier nicht durch das Ausblenden ersetzt.

---

## Testplan

Lokal und in CI: `node scripts/e2e.mjs`. Das startet `wrangler dev` mit frischer D1 aus `schema.sql` unter `.wrangler/e2e` und ruft `scripts/e2e_ui.py` (Playwright 1.64.1, Chromium, 390 px und 1440 px, Host `mc.nwebnotfound.dev`). Keine Produktionsdaten. Der Test-Token liegt nur in der untracked `.dev.vars` dieses Laufs.

Jeder der drei PRs:

1. Bestehende API-Fälle bleiben (Ingest 401, Markt, Gebot, Ack, Parkour, Ränge).
2. Neue Fälle stehen in `scripts/e2e.mjs` bzw. `scripts/e2e_ui.py`, in der vorhandenen `ok()`-Form.
3. UI-Selektoren sind Ids (`#vip`, `#pvp`, `#econ-card`).
4. `node scripts/icon-check.mjs` bleibt davor. Neue Icons sind vorhandene Item-Ids.

Der Welt-Check wird in Folge-PR 2 gegen die API geprüft, mit drei Cookies (Owner, Mitglied, Fremder), nicht nur darüber, ob ein Button fehlt. Folge-PR 3 prüft zusätzlich, dass die Oberfläche dieselbe Aufteilung zeigt.

Manuell, einmal pro PR, weil WebGL und echtes Hover im Headless unzuverlässig sind: Menü mit Maus und Tastatur, Breite 390, Profil-Kopf folgt dem Zeiger und steht still bei „Bewegung reduzieren“.

---

## Reihenfolge

1. Folge-PR 1, Menüs und Layout, inklusive PvP-Schnitt, glatter Preislinien und Maus-Köpfe.
2. Folge-PR 2, VIP-API und D1-Queue, sobald die offenen JSON-Punkte mit Craft geklärt sind. Darin der serverseitige Owner-/Mitglieder-Check und das Ingest-Token als Worker-Secret.
3. Folge-PR 3, VIP-Verwaltungs-UI, auf der API aus PR 2.

Nicht in diesem Rework: Portfolio, Gästebuch, MineRush spielbar machen, Wiki-Texte zu Ende schreiben, Economy-Regeln, Whitelist, ein öffentlicher Admin.

## Selbst-Check gegen den Auftrag

- Navigation, ein Look, Pixel-Schrift, Slots, MC-Buttons, Item-Icons: Folge-PR 1.
- PvP nur auf `/pvp`, glatte Preislinien, 3D-Köpfe folgen der Maus: ebenfalls Folge-PR 1. Die Geldmenge bleibt eine Stufe.
- VIP-API, D1-Warteschlange, Rate-Limits, kein öffentliches RCON: Folge-PR 2. Ingest-Token nur als Worker-Secret. Jede VIP-Aktion prüft serverseitig Owner oder Mitglied, mit e2e für Owner, Mitglied und Fremden.
- Verwaltungs-UI: Folge-PR 3. Sie verlässt sich nicht auf ausgeblendete Buttons als einzige Prüfung.
- Bestand mit Schwächen: Abschnitt „Bestandsaufnahme“. Offene Craft-Punkte sperren Folge-PR 2.
