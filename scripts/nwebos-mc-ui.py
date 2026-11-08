#!/usr/bin/env python3
"""NwebOS Block Edition (mc.nwebnotfound.dev, BE-1) at 375/1280 day+night: each address opens its own app window holding
the old page body (moved, so its scripts still run), no horizontal scroll, the shell parts keep their own look next to
the mc CSS (taskbar, window title), page errors none; without JS the page body is a readable dark page.
Optional second argument: a folder for screenshots."""
import os
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else ""
H = "mc.nwebnotfound.dev"
PAGES = [("/", "status"), ("/markt", "markt"), ("/vip", "vip"), ("/wiki", "wiki"), ("/leaderboards", "leaderboards")]
CR = r"""(sel) => { const L = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const a = (c.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number); if (c.startsWith('rgb(') || (a[3] || 0) > 0.5) return c; } return 'rgb(255,255,255)'; };
  const e = document.querySelector(sel); if (!e) return 0; const a = L(getComputedStyle(e).color), b = L(bg(e)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }"""


def route_for(ctx):
    def intercept(route):
        u = urlsplit(route.request.url)
        if u.netloc != H:
            route.abort()
            return
        h = {k: v for k, v in route.request.all_headers().items() if not k.startswith(":")}
        h["host"] = H
        route.fulfill(response=route.fetch(url=BASE + u.path + ("?" + u.query if u.query else ""), headers=h, max_redirects=0))
    ctx.route("**/*", intercept)


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    for width, night in ((1280, False), (375, False), (375, True)):
        phone = width < 700
        ctx = br.new_context(viewport={"width": width, "height": 812 if phone else 800}, has_touch=phone, is_mobile=phone, color_scheme="dark" if night else "light")
        ctx.add_init_script("try{localStorage.setItem('nwebos-mc.booted','1');localStorage.setItem('nwebos-mc.user','gast')}catch(e){}")
        ctx.add_cookies([{"name": "nnf_os", "value": "1", "domain": H, "path": "/"}])
        route_for(ctx)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        tag = f"{width}-{'night' if night else 'day'}"
        for path, key in PAGES:
            pg.goto(f"https://{H}{path}", wait_until="load")
            pg.locator(".win.live").wait_for(timeout=10000)
            pg.wait_for_timeout(500)
            t = f"{tag} {path}"
            assert pg.locator(".win").count() == 1, f"{t}: one window"
            assert pg.locator(f'#app-{key}').count() == 1 and pg.locator(".win.live .wc > *").count() > 0, f"{t}: the page body is in the window"
            assert pg.locator("#apps [data-live] > *").count() == 0, f"{t}: moved, not cloned"
            assert pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0, f"{t}: no horizontal scroll"
            tt = pg.locator(".win .wt .tt")
            assert tt.evaluate("e => getComputedStyle(e).boxShadow") == "none", f"{t}: window title is the shell's, not an mc tooltip"
            task = pg.locator(".task")
            assert task.evaluate("e => getComputedStyle(e).position") in ("fixed", "absolute") and task.bounding_box()["y"] > 700, f"{t}: taskbar at the bottom"
            if phone:
                hb = pg.locator(".win .wt").bounding_box(); mb = pg.locator(".mbar").bounding_box()
                assert mb["y"] >= hb["y"] + hb["height"], f"{t}: phone bar does not cover the title bar"
            if SHOTS:
                os.makedirs(SHOTS, exist_ok=True)
                pg.screenshot(path=os.path.join(SHOTS, f"mc-{(path.strip('/') or 'home')}-{tag}.png"))
        # a page script still works in its window: the market search filters (markt.js)
        pg.goto(f"https://{H}/markt", wait_until="load"); pg.locator(".win").first.wait_for(timeout=10000)
        assert pg.locator(".win .wc input[type=search], .win .wc input").count() >= 1, f"{tag}: market search field in the window"
        assert not errors, f"{tag}: page errors {errors[:3]}"
        ctx.unroute_all(behavior="ignoreErrors"); ctx.close()   # in-flight requests (/api/mc-status) may still be routed
        print(f"PASS {tag}: Block Edition windows, shell look kept, no overflow")
    # no JS: the page body is a plain dark page, text readable
    ctx = br.new_context(viewport={"width": 375, "height": 812}, java_script_enabled=False)
    route_for(ctx)
    pg = ctx.new_page()
    pg.goto(f"https://{H}/vip", wait_until="load")
    assert pg.locator("#apps h1").first.is_visible(), "no-JS: the page body shows"
    c = pg.evaluate(CR, "#apps h1")
    assert c >= 4.5, f"no-JS: heading contrast {c:.2f}"
    assert pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0, "no-JS: no horizontal scroll"
    if SHOTS:
        pg.screenshot(path=os.path.join(SHOTS, "mc-vip-nojs-375.png"))
    ctx.unroute_all(behavior="ignoreErrors"); ctx.close()   # in-flight requests (/api/mc-status) may still be routed
    print(f"PASS no-JS: dark readable page (h1 {c:.1f}:1)")
    br.close()
print("nwebos-mc-ui ok")
