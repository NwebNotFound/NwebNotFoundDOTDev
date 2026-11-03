# Screenshots

Aufnahmen der Prüfläufe, die zu einem PR gehören. Sie werden nicht vom Worker ausgeliefert
(`wrangler.jsonc` liefert nur `public/`).

## Admin-Ansicht des VIP-Panels

`admin-vip-390.png`, `admin-vip-1280.png` — `/vip` als Admin (Rang `admin`), 390 px und 1280 px,
Chromium, `prefers-color-scheme: dark` (das MC-Design hat nur eine dunkle Palette), deviceScaleFactor 2.

Die Daten sind Mock-Daten für `GET /api/mc-vip` (`admin: true`, drei fremde/eigene Welten,
drei Protokollzeilen); HTML, CSS und JS kommen unverändert aus dem Worker-Lauf.
Aufgenommen mit Playwright gegen ein lokales `wrangler dev`: `page.route("**/api/mc-vip")`
mit den Mock-Daten abgefangen, danach `page.screenshot({ fullPage: true })`.
Dieselbe Ansicht mit Mock-Daten prüft `scripts/e2e_ui.py` im Abschnitt „VIP-Admin“ bei jedem CI-Lauf.

Geprüft im selben Lauf: kein horizontales Scrollen, keine `style`-Attribute, Slots mindestens
12 px eingerückt, Start-/Sichtbarkeits-Buttons je Welt, Protokoll neueste zuerst.
