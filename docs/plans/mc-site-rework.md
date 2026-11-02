# Minecraft-Bereich: Rework-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Dieses Dokument ist der Plan. Es ändert keinen Worker, kein Schema und kein Frontend. Die Umsetzung sind drei Folge-PRs gegen `main` (Menüs und Layout, VIP-API, VIP-UI). Jeder davon hat seine eigenen e2e-Checks grün, bevor er mergt.

**Goal:** `mc.nwebnotfound.dev` so umbauen, dass Nils den Minecraft-Bereich bedienen kann: eine Navigation nach Aufgaben, ein einheitlicher Minecraft-Look, PvP nur auf der PvP-Seite, glatte Preislinien, 3D-Köpfe die der Maus folgen, und ein VIP-Panel mit Discord-Login, das eigene Welten verwaltet, ohne RCON oder Admin nach außen zu geben.

**Architecture:** Ein Cloudflare Worker (`nwebnotfound-site`, `src/worker.js`) rendert weiter HTML und spricht nur mit D1. Öffentliche Daten bleiben Ingest-Snapshots. Schreibaktionen der Website (heute Gebote, Shop-Orders, Bankkauf) sind Zeilen in einer Pending-Queue; Creepy bzw. `NwebNotFound/mc-stack` holt sie mit `x-ingest-token` ab, führt sie im privaten Netz aus und bestätigt per Ack. VIP-Befehle nutzen genau dieses Muster gegen eine abstrakte Schnittstelle. Der Browser spricht nie mit dem Spielserver.

**Tech Stack:** Cloudflare Worker, D1 (`binding` `DB`, Datenbank `nwebnotfound-guestbook`), bestehende Discord-Session (`nnf_session`, `Domain=.nwebnotfound.dev`), Vanilla-JS in `public/mc/`, Playwright über `node scripts/e2e.mjs` und `scripts/e2e_ui.py` (Chromium, 390 px und 1440 px), CI `.github/workflows/e2e.yml`.

## Global Constraints

- Hosts bleiben: Portfolio `nwebnotfound.dev`, Minecraft `mc.nwebnotfound.dev`. `/auth/*` auf dem MC-Host leitet weiter auf den Apex um. Cookie bleibt `HttpOnly; Secure; SameSite=Lax; Domain=.nwebnotfound.dev`.
- Kein RCON, kein Admin-Port und keine Befehlszeichenkette im Browser oder in öffentlichem JSON. Der Client sendet nur ein festes `op` aus der Whitelist (`start`, `set_visibility`, `invite`, `uninvite`) plus typisierte Argumente. Das JSON-Feld heißt `op`.
- `MC_INGEST_TOKEN` liegt nur als Cloudflare-Worker-Secret (`wrangler secret`). Er steht nicht in `wrangler.jsonc`, nicht im Git, nicht im HTML und nicht in `public/mc/`. `GET /api/mc-vip-commands/pending`, `POST /api/mc-vip-commands/ack` und `POST /api/mc-vip-worlds` vergleichen ausschließlich `env.MC_INGEST_TOKEN` mit dem Header `x-ingest-token`. Query, Cookie oder Body reichen nicht. Alle Zeiten dieser drei Routen sind Millisekunden. Status `expired` setzt nur mc-stack, und erst nach 600000 ms.
- Geld bleibt ganzzahlige Cent. Die Website entscheidet keine Beträge; maßgeblich ist der Server (siehe `INGEST.md`).
- Neue MC-Oberflächen: keine Emojis, keine Inline-Styles, keine `<style>`-Blöcke im Seiteninhalt. Icons nur über `/mc-icon/v2/<id>` (pixelig). Überschriften Monocraft (`--f-px`), Fließtext die Systemschrift (`--f-body`). Tokens nur aus `public/mc/ds.css`.
- PvP-Stats (Siege, Niederlagen, Kämpfe, Quote, Lieblings-Kit, Arena-Tab) stehen nur auf `/pvp`. Nicht auf `/leaderboards`, `/profile`, `/spieler` oder `/spieler/<name>`.
- Preisgraphen sind glatte monotone Kubiken. Der bestehende Item-Chart in `public/mc/item.js` (`mono`) bleibt die Referenz und wird nicht wieder zur Polylinie. Die Geldmengen-Kurve auf `/markt` (`public/mc/economy.js`) bleibt eine Stufe pro Tag; das ist kein Preis.
- 3D-Köpfe folgen der Maus nur bei feinem Zeiger (`(hover:hover) and (pointer:fine)`). `prefers-reduced-motion`, grober Zeiger und schmale Viewports bleiben beim Standbild (`STATIC()` in `public/mc/player3d.js`). Der Loop pausiert außerhalb des Bildschirms und bei verstecktem Tab (Stand nach #34).
- Deutschsprachige UI. Freitext immer über die bestehende Escape-Funktion (`MC.E` bzw. `esc` im Worker).
- Portfolio (`/`, `/guestbook`, `/profile` auf dem Apex, `/api/guestbook`) ist nicht Teil dieses Reworks.
- `NwebNotFound/mc-stack` wird hier nicht implementiert. Verbindlich ist `docs/vip-api.md` dort ([PR #110](https://github.com/NwebNotFound/mc-stack/pull/110), Commit `956683c`). Dieser Plan übernimmt diese Begriffe 1:1. Folge-PR 1 ändert die VIP-API nicht.
- Jeder VIP-Aufruf prüft serverseitig die UUID aus `mc_links` der Session. Der Browser und der Request-Body entscheiden das nicht. Owner darf `start`, `set_visibility`, `invite` und `uninvite`. Ein Admin darf dasselbe verwalten; dafür gibt es keinen 403, und der Eintrag nennt Admin und Owner. Rolle `trusted` darf nur `start`, geprüft wird der Rang des Owners. Rolle `member` schreibt nicht. Rollen in `members` sind nur `member` und `trusted`. Ein e2e-Fall in Folge-PR 2 deckt Owner, `trusted`, `member`, Admin und Fremden ab.

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
| `GET /api/mc-vip` | Cookie, `private, no-store`, POST 405 | Folge-PR 2 erweitert die Leseform und filtert auf Owner, `member`, `trusted` oder Admin. Schreiben liegt auf eigenen Routen, nicht auf diesem GET. |
| `GET /api/mc-market`, `GET /api/mc-market/<item>`, `GET /api/mc-economy` | öffentlich | Charts. Economy-JSON bleibt Tageswerte. |
| `GET/POST /api/mc-shops*`, `/api/mc-auctions*`, `/api/mc-bid`, `/api/mc-shop-order`, Pending/Ack | wie `INGEST.md` | Vorbild für die VIP-Queue. Rate-Limit heute: 5/min und 30/h pro Discord, 10/min und 60/h pro IP, gemeinsam für Gebot und Bestellung. |
| `POST /api/mc-ingest` | `x-ingest-token`, max. 8 MB, kein Rate-Limit | Weg für den bisherigen Spielzustand. Alte Payloads bleiben gültig. `vip_worlds` ist hier kein Feld. |
| `GET /api/mc-vip-commands/pending`, `POST /api/mc-vip-commands/ack` | `x-ingest-token` | Queue. Ack über `request_id` und `discord_id`. Zeiten in ms. `expired` setzt nur mc-stack, nach 600000 ms. |
| `POST /api/mc-vip-worlds` | `x-ingest-token` | Synchronisiert `vip_worlds` und `vip_admin_log`. `world_id` ist eine UUID. |
| `/auth/discord/login\|callback\|logout` | nur Apex | Unverändert. MC-Host leitet `/auth/*` auf den Apex um. |
| `/mc-head/*`, `/mc-skin/*`, `/mc-icon/*`, `/mc-mob/*` | öffentlich | Bleiben die einzigen Bildquellen. |

Apex-only und damit außerhalb: `/`, `/guestbook`, `/profile`, `/api/guestbook`, `/minecraft` → 301 auf den MC-Host, `/feedback` als zweite Kopie.

---

## VIP: abstrakte Schnittstelle

Verbindlich ist [`docs/vip-api.md`](https://github.com/NwebNotFound/mc-stack/blob/956683c/docs/vip-api.md) in `NwebNotFound/mc-stack` ([PR #110](https://github.com/NwebNotFound/mc-stack/pull/110), Commit `956683c`). Die Website spricht nur die Formen aus diesem Vertrag. Pfade, Feldnamen, `world_id` und Zeiteinheit stehen hier 1:1 daneben, damit Folge-PR 2 sie nicht noch einmal erfindet. `mc-stack` selbst wird in diesem Repo nicht gebaut.

### Was der Browser darf

Alle Mutationen: `POST` oder `DELETE`, `content-type: application/json`, Cookie `nnf_session`, Header `Origin` ist genau `https://mc.nwebnotfound.dev` oder `https://nwebnotfound.dev`. Andere Origins: 403, analog zu Gebot/Bestellung. Das Befehlsfeld im JSON heißt `op`.

Zugang, in dieser Reihenfolge:

1. Session gültig, sonst 401 `{error, reason:"login"}`.
2. `mc_links` für diese `discord_id`: `verified = 1`, `has_role = 1`, Name `^[A-Za-z0-9_]{1,16}$`, UUID kanonisch. Sonst 403 `{reason:"link"}`. Das gilt auch für einen Admin: ohne Link gibt es keine Minecraft-UUID.
3. Rang. Ist der Aufrufer Owner der Welt, muss `mc_player_ranks.rank` `vip` oder `mvp` sein, sonst 403 `{reason:"rank"}`. Builder bleibt bei 403 `{reason:"rank"}` und sieht nur den öffentlichen Katalog. Ein Admin bekommt dafür keinen 403 und darf verwalten. Rolle `trusted` braucht selbst keinen VIP-Rang: bei `start` prüft der Worker den Rang des Owners (`vip` oder `mvp`). Fehlt der, ist die Antwort 403 `{reason:"rank"}` und es entsteht keine Zeile.
4. **Welt-Check, jeder VIP-Aufruf, nur auf dem Worker.** Nach Session und Link lädt der Worker die Welt aus `vip_worlds`. `world_id` ist eine UUID, kanonisch mit Bindestrichen (36 Zeichen). Die UUID aus `mc_links` ist `owner_uuid`, oder sie steht über den verknüpften Namen in `members`. In `members` gibt es nur die Rollen `member` und `trusted`. Sonst, bei einem Aufruf mit Welt-Id: `403 {reason:"not_member"}` und keine Zeile in `mc_vip_commands`. Ein Admin ist von diesem 403 ausgenommen und darf die Welt verwalten, auch ohne Eintrag in `members`. Der Protokolleintrag nennt dann Admin und Owner. `GET /api/mc-vip` bleibt 200. Eine fremde Welt fehlt in der Antwort, außer der Aufrufer ist Admin. `mc_uuid`, `owner`, `members` und `discord_id` aus dem Body werden ignoriert. Ein Fallback-Slot aus `servers` ohne `owner_uuid` hat keine Rolle und ist nicht aufrufbar.
5. Wer schreiben darf, steht an der Rolle. Owner und Admin dürfen `start`, `set_visibility`, `invite` und `uninvite`. `trusted` darf nur `start`; jedes andere `op` ist `403 {reason:"role"}`, ohne Zeile. `member` besteht den Welt-Check und bekommt auf jeden Schreibaufruf denselben 403 `{reason:"role"}`, ebenfalls ohne Zeile. Es gibt keine weitere Rolle.

**Leserechte, fest.** Owner, `member` und `trusted` dürfen die Welt lesen. Ein Admin darf die Welten lesen, die er verwalten darf. Ein Fremder darf sie nicht lesen. `GET /api/mc-vip` enthält für Owner, `member` und `trusted` denselben Slot, inklusive `info`, `visibility`, Status und `members` mit Rolle. Die Antwort eines Fremden enthält diese Welt nicht und keinen Namen aus ihrer Mitgliederliste. Auf `/` bleiben Mitglieder unsichtbar; dort steht nur online/offline und die Spielerzahl.

`visibility` ist `friends` oder `private`. Ohne gesetzten Wert gilt `friends`. `public` ist kein Wert: ein Schreibaufruf mit `public` antwortet 400 und schreibt keine Zeile.

Lese-URL bleibt `GET /api/mc-vip` (Cookie, `cache-control: private, no-store`). Ohne Zugang dieselbe Hülle wie heute: `{access:false, reason, catalog, note}` und keine Weltenliste. Mit Zugang zusätzlich:

```json
{
  "access": true,
  "player": {"name": "Nils", "rank": "vip", "color": "6", "label": "VIP"},
    "worlds": {
    "placeholder": false,
    "updated_at": 1793288000000,
    "slots": [{
      "id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      "label": "VIP-Welt 1",
      "visibility": "friends",
      "online": true,
      "players": 0,
      "max": 8,
      "tps": 20,
      "info": "Bauplatz",
      "owner_name": "Nils",
      "owner": true,
      "members": [{"name": "Steve", "role": "trusted"}],
      "pending": []
    }]
  }
}
```

`id` ist die `world_id` und eine UUID. `members` sind Minecraft-Namen mit Rolle `member` oder `trusted`, höchstens 12. Eine andere Rolle ist 400. `pending` sind nur die offenen Kommandos der eigenen `discord_id`: `{request_id, op, status}`. `stats` (Geld, Spielzeit, Kills, Tode, Blöcke) bleiben im Panel, **ohne** PvP-Felder. `updated_at` und jede andere Zeit dieser API sind Millisekunden seit der Unix-Epoche.

`info` ist Anzeigetext aus dem Sync, 0–120 Zeichen, nachdem der Worker gesäubert hat. Vor dem Speichern entfernt er Steuerzeichen (`\n`, `\r`, `\t` und die übrigen C0-Zeichen) und jeden `§`, zusammen mit einem direkt folgenden Farbcode `[0-9a-fk-or]`. `"Hallo\n§cWelt"` wird `HalloWelt`. Es gibt kein `op`, das `info` setzt, und kein Feld, das `info` in eine Befehlszeile setzt. mc-stack säubert vor Hologramm und MOTD noch einmal genauso und setzt den Text nie in eine Befehlszeile.

Solange noch kein `POST /api/mc-vip-worlds` angekommen ist, füllt `pickVipWorlds` die Slots weiter aus `servers`-Keys (`WORLD_RE` in `src/mc-vip.js`). Diese Fallback-Slots haben `owner:false` und keine Buttons. `placeholder:true`, wenn weder Sync noch Fallback Keys liefern.

### Mutationen (Browser → Worker → D1)

Jede erfolgreiche Mutation antwortet `202` mit `{ok:true, request_id, op, status:"pending"}`. Sie führt am Spiel nichts aus. `request_id` erzeugt der Worker (UUID), außer der Client schickt eine (8–64 Zeichen `[A-Za-z0-9_.:-]`).

Die Idempotenz gilt nur für dieselbe `discord_id`. Unique ist `(discord_id, request_id)`, nicht `request_id` allein. Dieselbe Id und derselbe Body desselben Nutzers: `200 {duplicate:true}` mit der eigenen Zeile. Dieselbe Id und ein anderer Body desselben Nutzers: `409`. Dieselbe Id eines anderen Nutzers ist ein neuer Auftrag, `202`, und ändert die fremde Zeile nicht. Die Antwort nennt weder die fremde `discord_id` noch deren Welt oder `info`. Ack trifft die Zeile über genau dieses Paar `request_id` und `discord_id`. Die Zeilen-`id` in D1 ist nur der Primary Key und ist keine Ack-Adresse.

`<world_id>` in den Pfaden ist dieselbe UUID.

| Aufruf | Body | `op` | Wer |
| --- | --- | --- | --- |
| `POST /api/mc-vip/worlds/<world_id>/start` | `{}` | `start` | Owner, Admin, `trusted` |
| `POST /api/mc-vip/worlds/<world_id>/visibility` | `{"visibility":"friends"}` oder `{"visibility":"private"}` | `set_visibility` | Owner, Admin |
| `POST /api/mc-vip/worlds/<world_id>/members` | `{"name":"Steve","role":"member"}` oder `"role":"trusted"` | `invite` | Owner, Admin |
| `DELETE /api/mc-vip/worlds/<world_id>/members/<name>` | leer | `uninvite` | Owner, Admin |

Abgelehnt:

- Unbekanntes `op`, freier Befehlstext, `visibility` außer `friends` und `private` (also auch `public`), `role` außer `member` und `trusted`: 400.
- `world_id` ist keine UUID, oder der Name passt nicht auf `^[A-Za-z0-9_]{1,16}$`: 400.
- Weder Owner noch `member` noch `trusted` noch Admin, oder der Sync kennt die Welt nicht: 403 `not_member`. Der Fallback aus `servers` ohne `owner_uuid` ist nicht schaltbar. `member`, das schreibt: 403 `role`. `trusted` mit einem anderen `op` als `start`: 403 `role`. Ein Admin erhält diesen 403 nicht.
- Einladen des Owners, Einladen eines Namens der schon in `members` steht, Entfernen eines Namens der nicht in `members` steht: 409.
- Mehr als 12 Mitglieder: 400.
- Zweites `start` für dieselbe Welt, solange eine Zeile dieser Welt `pending` ist: 409 `{reason:"busy"}`. Eine Zeile mit Status `expired` blockiert nicht. Der Worker setzt `expired` dabei nicht.

Rate-Limit, nur diese vier Routen, getrennt von Gebot/Shop. Fenster und `retry_after_ms` sind Millisekunden:

- `start`: 3 pro 3600000 ms pro Welt und 6 pro 3600000 ms pro `discord_id`.
- `set_visibility`, `invite` und `uninvite` zusammen: 10 pro 3600000 ms pro `discord_id`, 20 pro 3600000 ms pro IP.
- Darüber `429` mit `{error, retry_after_ms}`.

Die Website-Limits sind die Obergrenze, die der Worker immer erzwingt. Ein strengeres Limit im Spiel wird über Ack `rejected` sichtbar, nicht durch ein zweites Stillschweigen.

### `expired` setzt nur mc-stack, nach 600000 ms

Der Worker schreibt den Status `expired` nie: nicht beim Lesen, nicht vor dem `busy`-Check, nicht nach einer eigenen Uhr. `GET /api/mc-vip-commands/pending` liefert Zeilen mit Status `pending` weiter aus, auch wenn `created_at` älter als 600000 ms ist. mc-stack setzt `expired` über `POST /api/mc-vip-commands/ack`, und erst nachdem seit `created_at` mindestens 600000 ms vergangen sind. `accepted`, `confirmed`, `rejected`, `failed` und `denied` laufen nicht in `expired` um. Danach sieht der Client `expired` in seinem eigenen `pending`-Feld und kann neu senden. Bis dieses Ack da ist, bleibt ein zweites `start` derselben Welt `409 {reason:"busy"}`.

### Wie der Befehl zum Server kommt

```
Browser (Cookie, Origin)
  → Worker prüft Session und Link
  → Worker prüft serverseitig world_id (UUID) und die Rolle
  → Owner oder Admin: start, set_visibility, invite, uninvite
  → trusted: nur start, Rang des Owners ist vip oder mvp
  → member: kein Schreiben
  → Admin wird nicht mit 403 abgewiesen; der Eintrag nennt Admin und Owner
  → Rate-Limit, op-Whitelist
  → nur dann INSERT mc_vip_commands (status pending)
  → 202 request_id
mc-stack / Creepy, Header x-ingest-token = Worker-Secret MC_INGEST_TOKEN, nie aus dem Browser
  → GET /api/mc-vip-commands/pending?since=<ms>
  → prüft beim Ausführen erneut Rolle, Rang und Link
  → bei trusted start zählt der Rang des Owners
  → sonst Ack status denied, reason denied, und führt nichts aus
  → sonst mappt op auf die eigene, nicht öffentliche API
  → info nur als Datenfeld, nie in einer Befehlszeile
  → POST /api/mc-vip-commands/ack   (request_id und discord_id)
  → expired setzt nur mc-stack, nach 600000 ms
  → POST /api/mc-vip-worlds synchronisiert vip_worlds und vip_admin_log
Browser
  → GET /api/mc-vip sieht pending, danach den neuen Stand
```

Der Worker öffnet in diesem Plan keine Verbindung zum Spiel. Es gibt keinen Pfad, auf dem ein Besucher Host, Port, Passwort oder eine Rohzeile wie `op Nils` setzt. Das Ingest-Token ist nur das Worker-Secret `MC_INGEST_TOKEN`. Der Worker liest es aus `env`, legt es in keine Response und akzeptiert es nur als Header `x-ingest-token`. Die lokale e2e-Datei `.dev.vars` bleibt untracked; der dortige Testwert `e2e-token` darf in keiner ausgelieferten Seite vorkommen.

Es gilt ausschließlich Polling, wie bei Geboten und Shop-Orders (`GET /api/mc-bids/pending`, `POST /api/mc-bids/ack`). Der Worker ruft mc-stack nicht auf. Die VIP-Pfade sind `GET /api/mc-vip-commands/pending` und `POST /api/mc-vip-commands/ack`.

Pending-Antwort, nur mit gültigem `x-ingest-token`, sonst 401. `since` und alle Zeiten sind Millisekunden:

```json
{
  "now": 1793288000000,
  "items": [{
    "request_id": "…",
    "discord_id": "123456789012345678",
    "op": "invite",
    "world_id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "actor_uuid": "11111111-2222-3333-4444-555555555555",
    "actor_name": "Nils",
    "owner_uuid": "11111111-2222-3333-4444-555555555555",
    "name": "Steve",
    "role": "trusted",
    "visibility": null,
    "info": null,
    "created_at": 1793288000000
  }]
}
```

Bei einem Admin steht in `actor_uuid` / `actor_name` der Admin und in `owner_uuid` der Owner der Welt. Beides wird gespeichert. `world_id` ist eine UUID.

Ack-Body: `{"acks":[{"request_id":"<request_id>","discord_id":"<discord_id>","status":"accepted"|"rejected"|"failed"|"confirmed"|"denied"|"expired","reason":"…"}]}`. Getroffen wird die Zeile nur über `request_id` und `discord_id`. Ein Ack, das nur die D1-`id` schickt, ändert nichts. `reason` max. 120 Zeichen, wird gespeichert und auf Deutsch angezeigt, wenn er in der festen Liste steht (`busy`, `offline`, `full`, `unknown_player`, `denied`); sonst der generische Satz „Der Server hat den Auftrag abgelehnt.“ Roh-Grund aus dem Spiel wird nicht ungefiltert gerendert, wenn er nicht in der Liste ist. Erster Endstatus gewinnt, ein zweites Ack derselben Zeile ändert nichts (`updated: 0`), wie bei Shop-Orders. `denied` ist der Endstatus, wenn mc-stack beim Ausführen Rolle, Rang oder Link nicht mehr bestätigt. Die Prüfung auf der Website beim Einreihen ersetzt das nicht: zwischen Queue und Ausführung kann der Rang des Owners weg sein. `expired` kommt nur von mc-stack und nur, wenn `created_at` mindestens 600000 ms zurückliegt. Der Worker setzt diesen Status nicht von sich aus.

### Zustand vom Server (`POST /api/mc-vip-worlds`)

`POST /api/mc-vip-worlds` mit Header `x-ingest-token` synchronisiert `vip_worlds` und `vip_admin_log`. Das ist der einzige Weg, auf dem diese beiden Stände in D1 kommen. `POST /api/mc-ingest` nimmt sie nicht entgegen; ein `vip_worlds`-Feld dort ändert die VIP-Tabellen nicht, und der übrige Ingest bleibt gültig.

Beispiel, eine Welt und ein Admin-Eintrag. `id` / `world_id` sind UUIDs. Zeiten sind Millisekunden. `visibility` ist `friends` (Default) oder `private`.

```json
{
  "vip_worlds": [{
    "id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "label": "VIP-Welt 1",
    "owner_uuid": "11111111-2222-3333-4444-555555555555",
    "owner_name": "Nils",
    "visibility": "friends",
    "online": true,
    "players": ["Steve"],
    "max": 8,
    "tps": 20,
    "info": "Bauplatz",
    "members": [{"name": "Steve", "role": "trusted"}]
  }],
  "vip_admin_log": [{
    "world_id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "admin": "123456789012345678",
    "owner": "11111111-2222-3333-4444-555555555555",
    "op": "set_visibility",
    "created_at": 1793288000000
  }]
}
```

- Beide Schlüssel sind Arrays und ersetzen den jeweiligen Stand komplett.
- `vip_worlds: []` leert die Welten. `GET /api/mc-vip` hat danach keine Slots aus `vip_worlds` (`placeholder: true`, solange auch kein Fallback-Key da ist). Offene Kommandos bleiben in der Queue. Der Worker setzt sie nicht auf `expired`; das tut nur mc-stack, nach 600000 ms, oder sie kommen per Ack `denied` zurück.
- `vip_admin_log: []` leert das Protokoll. Ein Eintrag nennt Admin und Owner.
- Fehlt einer der beiden Schlüssel, oder ist ein Wert kein Array (Objekt, String, `null`): 400, beide Stände bleiben.
- Höchstens 30 Welten. Eine Zeile ohne UUID als `id`, mit `visibility: "public"` oder mit einer Rolle außer `member` und `trusted` fällt weg, der Rest wird geschrieben. Ohne `visibility` speichert der Worker `friends`.

`players` ist entweder eine Namensliste oder eine Zahl (wie `playerCount` heute). Der öffentliche Serverstatus auf `/` zeigt VIP-Welten nur als „online/offline + Spielerzahl“, ohne Mitgliedernamen. Owner, `member`, `trusted` und Admin sehen die Mitgliederliste über `GET /api/mc-vip`. Ein Fremder sieht sie nicht.

`world_id` ist die UUID aus diesem Sync, nicht ein Snapshot-Key (`vip`, `vip1`, `vip_world_3`). Ohne `owner_uuid` gibt es keine Buttons. Die Website sendet `start` und zeigt danach `online` aus diesem Sync. Sie sendet kein `stop` und rät nicht, was der Server beim Start entlädt. MOTD, Seed, Spielmodus und Gamerules sind keine Ops. Website-Obergrenze: 3 Welten sichtbar, 12 Mitglieder. Der Server darf weniger akzeptieren und per Ack ablehnen.

Scoreboard-Neuaufbau liegt außerhalb von `docs/vip-api.md`. Bis dafür ein eigenes Dokument da ist, bleibt `v_leaderboards` / `leaderboards` aus `INGEST.md` der Vertrag. Liegt es vor dem Merge von Folge-PR 2, mappt derselbe PR in `mc_leaderboards`. Es gibt dafür keinen vierten PR. PvP-Kategorien bekommen keinen Tab (Folge-PR 1). Die PvP-Seite liest weiter `pvp_stats` bzw. `GET /api/mc-pvp`.

### D1, in Folge-PR 2

Neue Tabelle in `schema.sql` (frische e2e-DB) und in `migrations/0013_vip_commands.sql` (bestehende Produktions-D1). Spalten: `id` (Worker-UUID, Primary Key, keine Ack-Adresse), `request_id`, `op`, `world_id` (UUID), `actor_uuid`, `actor_name`, `owner_uuid`, `discord_id`, `name`, `role`, `visibility`, `info`, `source` (`web`), `created_at` (ms), `status`, `reason`, `acked_at` (ms), `ip`. Unique auf `(discord_id, request_id)`. Weiterer Index auf `(status, created_at)`. Kein Passwort, kein Rohbefehl, keine Spalte für eine zusammengesetzte Befehlszeile. `info` liegt nur gesäubert in der eigenen Spalte. `vip_admin_log` kommt über `POST /api/mc-vip-worlds` und trägt Admin und Owner. Bei einem Admin-Auftrag füllt der Worker `actor_*` mit dem Admin und `owner_uuid` mit dem Owner.

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
| `src/mc-vip.js`, `public/mc/vip.js`, `public/mc/vip.css` | Folge-PR 2: Lese-API, `GET /api/mc-vip-commands/pending`, `POST /api/mc-vip-commands/ack`, `POST /api/mc-vip-worlds`. Folge-PR 3: Formulare für `start`, `set_visibility`, `invite`, `uninvite`. |
| `src/mc-trade.js` als Vorbild, neue Funktionen daneben in `src/mc-vip.js` | Pending, Ack, Rate-Limit. Nicht in die Shop-Routen mischen. |
| `schema.sql`, `migrations/0013_vip_commands.sql` | Queue-Tabelle. Ack-Schlüssel `(discord_id, request_id)`, `world_id` UUID, Zeiten in ms. |
| `INGEST.md` | `POST /api/mc-vip-worlds` (`vip_worlds`, `vip_admin_log`) und die Pfade `/api/mc-vip-commands/pending` und `/ack`, in Folge-PR 2. Nicht in diesem Plan-PR. |
| `scripts/e2e.mjs`, `scripts/e2e_ui.py` | Assertions des jeweiligen Folge-PRs. Aufruf bleibt `node scripts/e2e.mjs`. |

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

Der JSON-Vertrag steht in `docs/vip-api.md` ([mc-stack #110](https://github.com/NwebNotFound/mc-stack/pull/110), Commit `956683c`). Dieser PR baut genau diese Namen. Alte Pfade, Slug-Ids, Sekunden und ein 403 für Admins kommen nicht zurück.

**Dateien:** `src/mc-vip.js`, `src/worker.js` (Routen, `POST /api/mc-vip-worlds`), `schema.sql`, `migrations/0013_vip_commands.sql`, `INGEST.md`, `scripts/e2e.mjs`, `scripts/vip-unit.mjs`. **Keine** Verwaltungs-Formulare; die bleiben Folge-PR 3. `GET /api/mc-vip` darf die erweiterte JSON-Form schon liefern.

**Tut:** `start`, `set_visibility`, `invite`, `uninvite`, `GET /api/mc-vip-commands/pending`, `POST /api/mc-vip-commands/ack` über `request_id` und `discord_id`, Rate-Limits in Millisekunden, Idempotenz, op-Whitelist, `POST /api/mc-vip-worlds` für `vip_worlds` und `vip_admin_log`. Token-Fehler 401. Kein freies Feld `command`. Liegt Crafts Scoreboard-Dokument vor, mappt dieser PR es auf `money` / `playtime` / `blocks_mined` / `kills` / `distance`. PvP-Zahlen landen nur in `mc_pvp_stats`.

**Ingest-Token.** `MC_INGEST_TOKEN` ist ausschließlich ein Worker-Secret. Produktion setzt ihn mit `wrangler secret put MC_INGEST_TOKEN`, nicht als `var` in `wrangler.jsonc` und nicht in einer committeten Datei. Der Worker vergleicht nur den Header `x-ingest-token` mit `env.MC_INGEST_TOKEN`. Dieselbe Regel gilt für `GET /api/mc-vip-commands/pending`, `POST /api/mc-vip-commands/ack`, `POST /api/mc-vip-worlds` und für den bestehenden `POST /api/mc-ingest`. Ein Token in Query, Cookie oder JSON-Body ist 401. Die Response von `/`, `/vip` und `/mc/vip.js` enthält den Token nicht. Lokal schreibt `scripts/e2e.mjs` den Testwert in `.dev.vars` und löscht die Datei danach wieder; `.dev.vars` bleibt gitignored.

**Welt-Check.** Jede VIP-Route (Lesen einer Welt, `start`, `set_visibility`, `invite`, `uninvite`) macht das auf dem Server, nach dem Auflösen der Session:

1. UUID nur aus `mc_links` der `discord_id`. Body-Felder `mc_uuid`, `discord_id`, `owner`, `members` zählen nicht. `world_id` muss eine UUID sein.
2. Owner, wenn diese UUID `owner_uuid` der Welt ist. Sonst die Rolle aus `members`, und dort nur `member` oder `trusted`. Ein Admin darf verwalten, auch ohne Eintrag in `members`, und bekommt dafür keinen 403. Sonst `403 {reason:"not_member"}`.
3. Bei 403 wird nicht in `mc_vip_commands` geschrieben.
4. `trusted` darf nur `start`; dabei muss der Rang des Owners `vip` oder `mvp` sein. `member` bekommt auf jeden Schreibaufruf `403 {reason:"role"}`, wieder ohne Zeile. Owner ohne Rang `vip`/`mvp` bekommt `403 {reason:"rank"}`.
5. `GET /api/mc-vip` enthält die Welt für Owner, `member`, `trusted` und Admin, mit `info`, `visibility` und `members`. Ein Fremder bekommt diese Welt nicht, und die Antwort enthält keinen Namen aus `members`.

- [ ] Unit: kein VIP-Key → `placeholder: true`. Key `vip1` ohne Owner → Slot, nicht aufrufbar. Sync mit `owner_uuid` der Session → Owner. Name in `members` mit `role: "trusted"` → `trusted`. `role: "member"` → `member`. Weder noch, und kein Admin → die Welt fehlt.
- [ ] Sessions, alle verlinkt: Owner (Rang VIP), `trusted` (Rang beliebig, Name in `members`), `member`, Admin (Rang `admin`, nicht in `members`), Fremder (Rang VIP, nicht in `members`).
- [ ] Owner `POST …/start` mit UUID als `world_id` → 202, `op` ist `start`, genau eine Zeile `pending`, `actor_uuid` ist die UUID aus `mc_links`. Zweites `start` auf derselben Welt → 409 `busy`.
- [ ] `member` `POST …/start` → 403 `role`, Zeilenzahl bleibt 0. `member` `GET /api/mc-vip` → die Welt ist drin, `owner: false`, `members` enthält den Namen und die Rolle `member`.
- [ ] `trusted` `POST …/start` → 202, solange der Owner Rang `vip` oder `mvp` hat. Dieselbe Session `POST …/members` → 403 `role`, keine weitere Zeile. Owner-Rang `builder`: `trusted` `POST …/start` → 403 `rank`, keine Zeile.
- [ ] Admin `POST …/visibility {"visibility":"private"}` → 202, `op` ist `set_visibility`, kein 403. Die Zeile nennt Admin (`actor_uuid`) und Owner (`owner_uuid`). `vip_admin_log` aus dem anschließenden Sync nennt dieselben beiden.
- [ ] Fremder `POST …/start`, auch mit `mc_uuid` des Owners im Body → 403 `not_member`, Zeilenzahl bleibt 0. Fremder `GET /api/mc-vip` → diese Welt fehlt, und der Körper enthält den Mitgliedsnamen nicht.
- [ ] Owner einer anderen Welt, der dort weder Owner noch in `members` steht und kein Admin ist → 403 `not_member`.
- [ ] Ohne Cookie → 401. Builder oder ohne Rang VIP/MVP, als Owner → 403 `rank`. Dieselbe Lücke gilt nicht für den Admin.
- [ ] Gleicher `request_id` und gleicher Body derselben `discord_id` → 200 `duplicate`, ohne zweite Zeile. Gleicher `request_id` und andere `role` derselben `discord_id` → 409. Dieselbe `request_id` einer anderen `discord_id` → 202, zweite Zeile, die erste bleibt `pending`. Weder 200 noch 409 enthält die fremde `discord_id` oder deren `info`.
- [ ] Zeile `pending` mit `created_at` 600000 ms oder mehr zurück: `GET /api/mc-vip-commands/pending` lässt den Status `pending` und liefert die Zeile. Ein neues `start` ist 409 `busy`. Ack `{request_id, discord_id, status:"expired"}` setzt `expired`. Danach ist ein neues `start` 202. Eine `confirmed`-Zeile desselben Alters bleibt `confirmed`. Ein `expired`-Ack, bevor 600000 ms vergangen sind, ändert die Zeile nicht.
- [ ] `POST …/visibility` mit `"public"` → 400, keine Zeile. Ohne `visibility` im Sync speichert der Worker `friends`. `info` `"Hallo\n§cWelt"` im Sync wird `HalloWelt` und steht in keiner Befehlszeile.
- [ ] Ack `denied` mit `request_id` und `discord_id` und reason `denied` setzt die Zeile auf `denied`. Ein zweites Ack ändert sie nicht. Ein Ack nur mit der D1-`id` ändert sie nicht.
- [ ] Viertes `start` innerhalb von 3600000 ms für dieselbe Welt → 429, `retry_after_ms` ist eine Zahl in Millisekunden.
- [ ] `GET /api/mc-vip-commands/pending` ohne Header → 401. Mit Header `x-ingest-token` gleich dem Worker-Secret → das Item, `op` ist `start`, `world_id` ist eine UUID, kein Rohbefehl. Dieselbe URL mit `?token=` statt Header → 401. `GET /api/mc-vip/commands/pending` ist nicht die Route.
- [ ] `GET /vip` und `GET /mc/vip.js` enthalten den Test-Token nicht.
- [ ] Ack `confirmed` über `request_id` und `discord_id`, zweites Ack `failed` → Status bleibt `confirmed`. Body `{"command":"op Nils"}` oder `{"action":"start"}` → 400, keine Zeile.
- [ ] `POST /api/mc-vip-worlds` mit `vip_worlds` und `vip_admin_log` ersetzt beide Stände. `vip_worlds: []` bei mitgeschicktem `vip_admin_log` leert die Welten, der folgende `GET /api/mc-vip` hat diese Slots nicht. Ein Body ohne `vip_admin_log`, oder `vip_worlds: {}`, antwortet 400 und lässt beide Stände stehen. `POST /api/mc-ingest` mit `vip_worlds` ändert die VIP-Tabellen nicht.

### Folge-PR 3 — VIP-Verwaltungs-UI

**Nach Folge-PR 2.** **Dateien:** `public/mc/vip.js`, `public/mc/vip.css`, `scripts/e2e_ui.py`. Die API aus PR 2 bleibt die einzige Schreibstelle. Die Seite prüft die Rolle nicht selbst nach: sie zeigt, was `GET /api/mc-vip` hergibt, und der Worker lehnt falsche Posts ab.

**Tut:** Für Slots mit `owner: true` und für einen Admin: Schalter „Starten“, Sichtbarkeit `friends` oder `private` (kein `public`), Einladen mit Rolle `member` oder `trusted`, Entfernen. Nach 202 zeigt die Karte „wird bestätigt“, bis `pending` leer ist oder ein Ack-Grund aus der festen Liste als Satz daneben steht, einschließlich `denied` und `expired`. 403/409/429 als Satz, kein `alert`. Für `trusted`: nur „Starten“, dazu Status, Info, Sichtbarkeit und die Mitgliederliste. Für `member`: dieselben Texte, kein Schalter und kein Formular. Turnstile braucht es hier nicht. Origin-Prüfung bleibt serverseitig in PR 2.

**Tut nicht:** kein Stoppen, kein Info-Formular, keine Seed-, Modus- oder Gamerule-Felder, kein `public`. Kein zweiter Weg, der die Queue umgeht. Kein Ingest-Token im Frontend. Kein 403-Screen für einen verknüpften Admin.

- [ ] UI 1440 px und 390 px, Owner-Session: Starten trifft `POST …/start`, die Karte zeigt „wird bestätigt“. Sichtbarkeit bietet `friends` und `private` und kein `public`.
- [ ] Dieselbe Seite als `trusted`: Starten ist da, Einladen und Sichtbarkeit ändern sind nicht da.
- [ ] Dieselbe Seite als `member`: Status, Info, Sichtbarkeit und der Name sichtbar, `form`-Count 0, kein Starten.
- [ ] Dieselbe Seite als Admin: Starten, Sichtbarkeit, Einladen und Entfernen sind da. Die Seite zeigt keinen 403.
- [ ] Dieselbe Seite als Fremder mit VIP-Rang: diese Welt fehlt, der Mitgliedsname kommt im HTML nicht vor, kein Formular.
- [ ] Name `Bad Name!` und Rolle `admin` als Mitglieder-Rolle gehen nicht raus. Der Server lehnt dasselbe Muster noch einmal ab (PR 2).
- [ ] Builder oder ohne Rang, kein Admin: Katalog, Grund `rank`, `link` oder `login`, keine Slot-Buttons.
- [ ] Schalter und Entfernen sind per Tab erreichbar, Fokus sichtbar.
- [ ] Ein abgefangener `start` der `member`-Session kommt beim UI nicht vor, weil kein Button da ist. Der API-Fall „`member` schreibt → 403 `role`“ bleibt der Test aus PR 2 und wird hier nicht durch das Ausblenden ersetzt.

---

## Testplan

Lokal und in CI: `node scripts/e2e.mjs`. Das startet `wrangler dev` mit frischer D1 aus `schema.sql` unter `.wrangler/e2e` und ruft `scripts/e2e_ui.py` (Playwright 1.64.1, Chromium, 390 px und 1440 px, Host `mc.nwebnotfound.dev`). Keine Produktionsdaten. Der Test-Token liegt nur in der untracked `.dev.vars` dieses Laufs.

Jeder der drei PRs:

1. Bestehende API-Fälle bleiben (Ingest 401, Markt, Gebot, Ack, Parkour, Ränge).
2. Neue Fälle stehen in `scripts/e2e.mjs` bzw. `scripts/e2e_ui.py`, in der vorhandenen `ok()`-Form.
3. UI-Selektoren sind Ids (`#vip`, `#pvp`, `#econ-card`).
4. `node scripts/icon-check.mjs` bleibt davor. Neue Icons sind vorhandene Item-Ids.

Der Welt-Check wird in Folge-PR 2 gegen die API geprüft, mit Cookies für Owner, `trusted`, `member`, Admin und Fremden, nicht nur darüber, ob ein Button fehlt. Folge-PR 3 prüft zusätzlich, dass die Oberfläche dieselbe Aufteilung zeigt.

Manuell, einmal pro PR, weil WebGL und echtes Hover im Headless unzuverlässig sind: Menü mit Maus und Tastatur, Breite 390, Profil-Kopf folgt dem Zeiger und steht still bei „Bewegung reduzieren“.

---

## Reihenfolge

1. Folge-PR 1, Menüs und Layout, inklusive PvP-Schnitt, glatter Preislinien und Maus-Köpfe.
2. Folge-PR 2, VIP-API und D1-Queue, nach `docs/vip-api.md` in mc-stack #110 (`956683c`). Darin Pending/Ack, `POST /api/mc-vip-worlds`, der Rollen-Check und das Ingest-Token als Worker-Secret.
3. Folge-PR 3, VIP-Verwaltungs-UI, auf der API aus PR 2.

Nicht in diesem Rework: Portfolio, Gästebuch, MineRush spielbar machen, Wiki-Texte zu Ende schreiben, Economy-Regeln, Whitelist, ein öffentliches Admin-Portal. Die VIP-Verwaltung durch einen Admin bleibt in Folge-PR 2 und 3.

## Selbst-Check gegen den Auftrag

- Navigation, ein Look, Pixel-Schrift, Slots, MC-Buttons, Item-Icons: Folge-PR 1.
- PvP nur auf `/pvp`, glatte Preislinien, 3D-Köpfe folgen der Maus: ebenfalls Folge-PR 1. Die Geldmenge bleibt eine Stufe.
- VIP-API, D1-Warteschlange, Rate-Limits, kein öffentliches RCON: Folge-PR 2, 1:1 nach mc-stack #110. Pfade `GET /api/mc-vip-commands/pending` und `POST /api/mc-vip-commands/ack`. Ack über `request_id` und `discord_id`. `world_id` ist eine UUID. Alle Zeiten in Millisekunden. `expired` setzt nur mc-stack, nach 600000 ms. `POST /api/mc-vip-worlds` synchronisiert `vip_worlds` und `vip_admin_log`. `visibility` ist `friends` (Default) oder `private`. Ops sind `start`, `set_visibility`, `invite`, `uninvite`, Feldname `op`. Admins dürfen verwalten, protokolliert mit Admin und Owner, ohne 403. `trusted` darf nur `start`, geprüft wird der Rang des Owners. Rollen in `members` sind nur `member` und `trusted`.
- Verwaltungs-UI: Folge-PR 3. Sie verlässt sich nicht auf ausgeblendete Buttons als einzige Prüfung.
- Bestand mit Schwächen: Abschnitt „Bestandsaufnahme“. Der VIP-Vertrag sperrt Folge-PR 2 nicht mehr. Scoreboards bleiben bei `INGEST.md`, bis dafür ein eigenes Dokument da ist.
