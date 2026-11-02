#!/usr/bin/env python3
"""Mobiles Panel: Composer, kein horizontaler Überlauf, Bestätigungsklick."""
import os
import sys
from playwright.sync_api import sync_playwright

base, cookie = sys.argv[1], sys.argv[2]
exe = "/usr/bin/google-chrome"
shots = os.environ.get("AI_SHOTS", "/tmp")

with sync_playwright() as p:
    launch = {"executable_path": exe} if os.path.exists(exe) else {}
    br = p.chromium.launch(**launch)
    try:
        for width in (390, 1440):
            ctx = br.new_context(viewport={"width": width, "height": 844})
            ctx.add_cookies([{"name": "ai_session", "value": cookie, "url": base, "httpOnly": True, "secure": True, "sameSite": "Lax"}])
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: print("PAGEERROR", e))
            pg.goto(base + "/", wait_until="domcontentloaded")
            pg.locator("#composer").wait_for(timeout=15000)
            box = pg.locator("#msg")
            assert box.is_visible(), "Eingabe nicht sichtbar"
            sw = pg.evaluate("document.documentElement.scrollWidth")
            cw = pg.evaluate("document.documentElement.clientWidth")
            assert sw <= cw + 1, f"Überlauf {sw} > {cw} bei {width}px"
            pg.screenshot(path=f"{shots}/ai-panel-{width}.png", full_page=True)
            if width == 390:
                try:
                    pg.get_by_role("button", name="cloudflare").wait_for(timeout=8000)
                    pg.get_by_role("button", name="Bestätigen").click(timeout=8000)
                    pg.get_by_role("button", name="Löschen").click(timeout=8000)
                    pg.get_by_role("button", name="Wirklich löschen").click(timeout=8000)
                except Exception:
                    print("TEXT", pg.locator("body").inner_text())
                    raise
                pg.wait_for_timeout(300)
            ctx.close()
    finally:
        br.close()
print("ai-ui ok")
