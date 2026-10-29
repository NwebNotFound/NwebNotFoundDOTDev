#!/usr/bin/env python3
# UI-Prüfung gegen das lokale wrangler dev aus e2e.mjs (wird von dort aufgerufen). argv: BASE COOKIE
import sys, re
from playwright.sync_api import sync_playwright
BASE, COOKIE = sys.argv[1], sys.argv[2]
H = "mc.nwebnotfound.dev"; fails = 0
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
        ok("Nicht bei der Bank kaufbar" in t, f"{w}px Markt: Sperr-Badge sichtbar")
        ok(re.search(r"\+10,00\s?%", t) is not None, f"{w}px Markt: +10,00 % aus Historie", t[:200])
        t = go("/markt/elytra"); ok("Nicht bei der Bank kaufbar" in t and "—" in t, f"{w}px Item gesperrt: Badge + —")
        t = go("/auktionen/a1"); ok("50,00" in t and pg.locator("form, input[type=number]").count() > 0, f"{w}px Auktion a1: Mindestgebot 50,00 + Formular")
        ok("angenommen" in t.lower() or "accepted" in t.lower() or "Deine Gebote" in t, f"{w}px Auktion a1: eigenes Gebot sichtbar", t[-300:])
        t = go("/auktionen/a2"); ok("215,00" in t and "Seller" in t and "99999999…" in t, f"{w}px Auktion a2: min_next_bid + Gebotsverlauf")
        t = go("/auktionen/a4"); ok("deine Auktion" in t, f"{w}px eigene Auktion: kein Bieten", t[:300])
        t = go("/leaderboards"); ok("Nils" in t and "Seller" in t, f"{w}px Bestenlisten mit Namen")
        t = go("/profile"); ok("Nils" in t, f"{w}px Profil zeigt verknüpften Account")
        t = go("/shops/s1"); ok("15,00" in t, f"{w}px Shop: Preis 15,00 CP")
        ok(not errs, f"{w}px keine Konsolen-/JS-Fehler", errs[:3])
        ctx.close()
    br.close()
sys.exit(1 if fails else 0)
