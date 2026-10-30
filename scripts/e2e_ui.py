#!/usr/bin/env python3
# UI-Prüfung gegen das lokale wrangler dev aus e2e.mjs (wird von dort aufgerufen). argv: BASE COOKIE
import sys, re
from playwright.sync_api import sync_playwright
BASE, COOKIE = sys.argv[1], sys.argv[2]
H = "mc.nwebnotfound.dev"; fails = 0; SH = "/workspace/screens/qa"
import os; os.makedirs(SH, exist_ok=True)
def ok(c, m, x=""):
    global fails
    print(("  ✓ " if c else "  ✗ ") + m + ("" if c else "  " + str(x)[:300])); fails += (not c)
def route(r):
    u = r.request.url
    if u.startswith("https://" + H):
        h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}; h["host"] = H
        r.fulfill(response=r.fetch(url=BASE + u[len("https://" + H):], headers=h, max_redirects=0))
    else: r.continue_()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for w in (390, 1440):
        ctx = br.new_context(viewport={"width": w, "height": 900})
        ctx.add_cookies([{"name": COOKIE.split("=")[0], "value": COOKIE.split("=", 1)[1], "domain": H, "path": "/", "secure": True, "httpOnly": True}])
        pg = ctx.new_page(); pg.route("**/*", route); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "mc-heads" not in m.text and "Failed to load resource" not in m.text else None)
        def go(path):
            pg.goto("https://" + H + path, wait_until="networkidle"); pg.wait_for_timeout(300)
            ok(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px {path}: kein horizontales Scrollen")
            return pg.inner_text("body")
        t = go("/markt")
        ok("nur Verkauf" in t and "Nicht bei der Bank kaufbar" not in t, f"{w}px Markt: dezentes 'nur Verkauf'")
        hs = pg.eval_on_selector_all(".nb:not(:empty)", "els=>els.map(e=>e.getBoundingClientRect().height)")
        ok(hs and max(hs) < 24, f"{w}px Markt: 'nur Verkauf' einzeilig", hs[:5])
        ok(pg.locator(".ir .tag.tl").count() == 0, f"{w}px Markt: kein Badge-Mix")
        ok(re.search(r"\+10,00\s?%", t) is not None, f"{w}px Markt: +10,00 % aus Historie", t[:200])
        t = go("/markt/elytra"); ok("nur Verkauf" in t, f"{w}px Item gesperrt: 'nur Verkauf'")
        t = go("/auktionen/a1"); ok("50,00" in t and pg.locator("form, input[type=number]").count() > 0, f"{w}px Auktion a1: Mindestgebot 50,00 + Formular")
        ok("angenommen" in t.lower() or "accepted" in t.lower() or "Deine Gebote" in t, f"{w}px Auktion a1: eigenes Gebot sichtbar", t[-300:])
        t = go("/auktionen/a2"); ok("215,00" in t and "Seller" in t and "99999999…" in t, f"{w}px Auktion a2: min_next_bid + Gebotsverlauf")
        t = go("/auktionen/a4"); ok("deine Auktion" in t, f"{w}px eigene Auktion: kein Bieten", t[:300])
        t = go("/leaderboards"); ok("Nils" in t and "Seller" in t, f"{w}px Bestenlisten mit Namen")
        t = go("/profile"); ok("Nils" in t, f"{w}px Profil zeigt verknüpften Account")
        ok(pg.locator(".inv .ivs img").count() == 3 and pg.locator(".inv .ivs").count() >= 36, f"{w}px Profil: Inventar im Slot-Look")
        ok("AB" not in pg.locator(".inv").inner_text(), f"{w}px Profil: keine Text-Platzhalter")
        pg.locator(".inv").scroll_into_view_if_needed(); pg.screenshot(path=f"{SH}/local-polish-profil-{w}.png", full_page=True)
        ok(pg.locator("#umm a[href$='/abholungen']").count() == 1, f"{w}px Dropdown: Abholungen")
        t = go("/abholungen"); ok("Abholfach" in t and "fehlgeschlagen" in t and "abgeholt" in t and "Diamond" in t, f"{w}px Abholungen: Stufen + Abholfach", t[:400])
        ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), f"{w}px Abholungen: kein Overflow")
        pg.screenshot(path=f"{SH}/local-polish-abholungen-{w}.png", full_page=True)
        t = go("/shops/s1"); ok("15,00" in t, f"{w}px Shop: Preis 15,00 CP")
        t = go("/spieler"); ok("Nils" in t and "Seller" in t, f"{w}px Spieler: Liste")
        pg.fill("#q", "nls"); pg.wait_for_timeout(600); ok(pg.locator("a.plc").first.inner_text().startswith("Nils"), f"{w}px Spieler: Fuzzy 'nls'")
        pg.screenshot(path=f"{SH}/local-spieler-{w}.png", full_page=True)
        t = go("/spieler/Nils"); ok("Öffentliche Stats" in t and "Details" in t and "nur für Mitspieler" not in t, f"{w}px Spielerseite eingeloggt: Details", t[:300])
        ok(all(x in t for x in ("Top-Blöcke", "Mob-Kills", "Distanzen", "Zombie", "Stone", "15,3 km", "Gefischt", "Spielzeit")) and "Playtime S" not in t, f"{w}px Details: Diagramme + deutsche Labels", t[-600:])
        ok("7.200" not in t.split("Details",1)[-1], f"{w}px Details: Spielzeit formatiert statt Sekunden")
        pg.screenshot(path=f"{SH}/local-spieler-nils-{w}.png", full_page=True)
        for nm, path in (("start", "/"), ("markt", "/markt"), ("bestenlisten", "/leaderboards")): go(path); pg.wait_for_timeout(400); pg.screenshot(path=f"{SH}/local-polish-{nm}-{w}.png", full_page=True)
        for path in ("/markt", "/wiki", "/wiki/befehle"): go(path); pg.screenshot(path=f"{SH}/local{path.replace('/','-')}-{w}.png", full_page=True)
        ok(not errs, f"{w}px keine Konsolen-/JS-Fehler", errs[:3])
        ctx.close()
        ctx = br.new_context(viewport={"width": w, "height": 900}); pg = ctx.new_page(); pg.route("**/*", route)
        pg.goto("https://" + H + "/spieler/Nils", wait_until="networkidle"); pg.wait_for_timeout(300); t = pg.inner_text("body")
        ok("Öffentliche Stats" in t and "nur für Mitspieler" in t, f"{w}px Spielerseite anonym: Details gesperrt", t[:300])
        ok(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px anonym: kein horizontales Scrollen")
        pg.screenshot(path=f"{SH}/local-spieler-nils-anon-{w}.png", full_page=True); ctx.close()
    br.close()
sys.exit(1 if fails else 0)
