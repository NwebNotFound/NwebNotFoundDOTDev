#!/usr/bin/env python3
"""Switching between the two NwebOS editions at 375/1280 (Block Edition BE-1; the old logo switcher "Wohin?" went with
the old mc nav): on mc.nwebnotfound.dev the "Hauptseite" desktop icon shows the blue switch bar and then loads the main
site; on the main site the Minecraft-Server icon shows the green bar and loads mc. Reduced motion: no delay.
Optional second argument: a folder for screenshots of the switch bar."""
import os
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else ""
MC, MAIN = "mc.nwebnotfound.dev", "nwebnotfound.dev"
# (start host, start path, icon, bar colour, bar text, target host)
CASES = [
    (MC, "/markt", ".dicon.home", "rgb(31, 91, 216)", "Summer Edition", MAIN),
    (MAIN, "/", '.dicon[data-os-switch="mc"]', "rgb(63, 138, 42)", "Block Edition", MC),
]

with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"  # CI container; elsewhere Playwright's own Chromium
    browser = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    for width in (375, 1280):
        for host, path, icon, colour, text, target in CASES:
            phone = width < 700
            ctx = browser.new_context(viewport={"width": width, "height": 800}, has_touch=phone, is_mobile=phone)
            # boot and login seen (the shared nnf_os cookie), guest
            ctx.add_init_script("try{for(const s of ['nwebos','nwebos-mc']){localStorage.setItem(s+'.booted','1');localStorage.setItem(s+'.user','gast')}}catch(e){}")
            ctx.add_cookies([{"name": "nnf_os", "value": "1", "domain": h, "path": "/"} for h in (MC, MAIN)])
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))

            def intercept(route):
                url = urlsplit(route.request.url)
                if url.netloc not in (MC, MAIN):
                    route.abort()
                    return
                headers = {k: v for k, v in route.request.all_headers().items() if not k.startswith(":")}
                headers["host"] = url.netloc
                headers["x-nnf-test-host"] = url.netloc
                try:
                    route.fulfill(response=route.fetch(url=BASE + url.path + ("?" + url.query if url.query else ""), headers=headers, max_redirects=0))
                except Exception:  # the switch navigates away while the old page's /api/mc-status is still in flight
                    pass

            page.route("**/*", intercept)
            tag = f"{width}px {host}{path}"
            page.goto(f"https://{host}{path}", wait_until="load")
            page.wait_for_selector("#desk:not([hidden])", timeout=8000)
            if phone and page.locator(".win").count():
                page.locator("[data-home]").click()  # the open window goes down, the home screen shows the icons
                page.wait_for_timeout(400)
            a = page.locator(icon).first
            assert a.count() == 1 and a.is_visible(), f"{tag}: switch icon {icon} visible"
            box = a.bounding_box()
            assert box["width"] >= 44 and box["height"] >= 44, f"{tag}: switch icon is a 44 px tap target ({box})"
            a.click()
            bar = page.locator("#switch")
            bar.wait_for(state="visible", timeout=2000)
            assert bar.evaluate("e => getComputedStyle(e).backgroundColor") == colour, f"{tag}: bar in the target colour"
            assert text in bar.inner_text(), f"{tag}: bar names the target edition"
            if SHOTS:
                os.makedirs(SHOTS, exist_ok=True)
                page.wait_for_timeout(350); page.screenshot(path=os.path.join(SHOTS, f"switch-{'mc' if target == MC else 'main'}-{width}.png"))
            page.wait_for_url(f"https://{target}/", timeout=5000)
            page.wait_for_load_state("load")
            assert page.locator("html.nwebos").count() == 1, f"{tag}: the target edition loaded"
            assert (page.locator("html.edb").count() == 1) == (target == MC), f"{tag}: the right edition"
            assert not errors, f"{tag}: page errors {errors}"
            ctx.unroute_all(behavior="ignoreErrors"); ctx.close()   # in-flight requests (/api/mc-status) may still be routed
            print(f"PASS {tag}: switch bar ({text}) then {target}")
    # reduced motion: the target loads at once (no 0.7 s bar)
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
    ctx.add_init_script("try{localStorage.setItem('nwebos-mc.booted','1');localStorage.setItem('nwebos-mc.user','gast')}catch(e){}")
    ctx.add_cookies([{"name": "nnf_os", "value": "1", "domain": MC, "path": "/"}])
    page = ctx.new_page()
    def rm_route(r):
        u = urlsplit(r.request.url)
        if u.netloc not in (MC, MAIN):
            r.abort()
            return
        try:
            r.fulfill(response=r.fetch(url=BASE + u.path, headers={**{k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}, "host": u.netloc, "x-nnf-test-host": u.netloc}, max_redirects=0))
        except Exception:
            pass
    page.route("**/*", rm_route)
    page.goto(f"https://{MC}/wiki", wait_until="load")
    page.wait_for_selector("#desk:not([hidden])", timeout=8000)
    page.locator(".dicon.home").click()
    page.wait_for_url(f"https://{MAIN}/", timeout=600)
    ctx.unroute_all(behavior="ignoreErrors"); ctx.close()   # in-flight requests (/api/mc-status) may still be routed
    print("PASS reduced motion: switch without delay")
    browser.close()
print("site-switch-ui ok")
