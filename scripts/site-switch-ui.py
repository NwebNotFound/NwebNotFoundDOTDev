#!/usr/bin/env python3
"""Logo site switcher "Wohin?" on both sites at 375/1280: click and keyboard open it, the current
site is marked, Esc closes it with focus back on the logo, a click outside closes it.
Optional second argument: a folder for screenshots of the open switcher."""
import os
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else ""
SITES = {
    "main": ("nwebnotfound.dev", "/portfolio", "Hauptseite", "https://mc.nwebnotfound.dev/"),
    "mc": ("mc.nwebnotfound.dev", "/markt", "Minecraft-Server", "https://nwebnotfound.dev/"),
}

with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"  # CI container; elsewhere Playwright's own Chromium
    browser = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    for width in (375, 1280):
        for site, (host, path, here, other) in SITES.items():
            context = browser.new_context(viewport={"width": width, "height": 800})
            page = context.new_page()

            def intercept(route):
                url = urlsplit(route.request.url)
                if url.netloc != host:
                    route.abort()
                    return
                headers = {k: v for k, v in route.request.all_headers().items() if not k.startswith(":")}
                headers["host"] = host
                headers["x-nnf-test-host"] = host
                route.fulfill(response=route.fetch(url=BASE + url.path + ("?" + url.query if url.query else ""), headers=headers))

            page.route("**/*", intercept)
            page.goto(f"https://{host}{path}", wait_until="domcontentloaded")
            btn, pop = page.locator(".u-site > .u-brand"), page.locator("#u-sites")
            page.wait_for_load_state("load")  # unav.js is deferred
            tag = f"{width}px {site}"
            assert page.locator(".u-switch, .u-chip").count() == 0, f"{tag}: no site chips"
            assert btn.get_attribute("aria-expanded") == "false" and not pop.is_visible(), f"{tag}: closed on load"
            # Click opens; current site marked, the other site links out.
            btn.click()
            pop.wait_for(state="visible")
            assert btn.get_attribute("aria-expanded") == "true", tag
            cur = page.locator("#u-sites a[aria-current]")
            assert cur.count() == 1 and here in cur.inner_text(), f"{tag}: current site marked"
            assert page.locator(f'#u-sites a[href="{other}"]').count() == 1, f"{tag}: link to the other site"
            box = pop.bounding_box()
            assert box["x"] >= 0 and box["x"] + box["width"] <= width, f"{tag}: switcher fits the screen {box}"
            if SHOTS:
                page.wait_for_timeout(350)
                page.screenshot(path=os.path.join(SHOTS, f"switch-{site}-{width}.png"))
            # Esc closes, focus back on the logo.
            page.keyboard.press("Escape")
            page.wait_for_timeout(350)
            assert btn.get_attribute("aria-expanded") == "false" and not pop.is_visible(), f"{tag}: Esc closes"
            assert page.evaluate("document.activeElement.matches('.u-site > .u-brand')"), f"{tag}: focus back on the logo"
            # Keyboard: Enter opens, ArrowDown walks the list, Esc closes again.
            page.keyboard.press("Enter")
            assert btn.get_attribute("aria-expanded") == "true", f"{tag}: Enter opens"
            page.keyboard.press("ArrowDown")
            assert page.evaluate("document.activeElement.matches('#u-sites a.u-site-o')"), f"{tag}: ArrowDown focuses the first site"
            page.keyboard.press("ArrowDown")
            assert page.evaluate("document.activeElement.getAttribute('href')") in (other, "/", "/en", "/de") and page.evaluate("document.activeElement.matches('#u-sites a.u-site-o:last-of-type')"), f"{tag}: ArrowDown to the second site"
            page.keyboard.press("Escape")
            assert btn.get_attribute("aria-expanded") == "false" and page.evaluate("document.activeElement.matches('.u-site > .u-brand')"), f"{tag}: Esc from a link closes"
            # A click outside closes it.
            btn.click()
            page.mouse.click(3, 420)  # page margin, no link there
            assert btn.get_attribute("aria-expanded") == "false" and page.url == f"https://{host}{path}", f"{tag}: click outside closes"
            # Phone: opening the drawer closes the switcher, and vice versa.
            if width < 900:
                btn.click()
                page.click(".u-burger")
                assert btn.get_attribute("aria-expanded") == "false" and page.get_attribute(".u-burger", "aria-expanded") == "true", f"{tag}: drawer closes the switcher"
                btn.click()
                assert page.get_attribute(".u-burger", "aria-expanded") == "false" and btn.get_attribute("aria-expanded") == "true", f"{tag}: switcher closes the drawer"
            print(f"PASS {tag}")
            page.unroute_all(behavior="ignoreErrors")
            context.close()
    browser.close()
