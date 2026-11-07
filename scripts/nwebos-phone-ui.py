#!/usr/bin/env python3
"""NwebOS phone polish (mockups/nwebos/phone-polish/notes.md) in a real browser, as a guest, day and night:
every window at 375 and 390 (Musik also 430) without horizontal scroll, controls at least 40x40, no text glyphs in
the player (iOS drew them as emoji), honest Musik empty state, one Discord button in the signed-out guestbook,
zero category counts hidden, the bottom-bar search goes home and focuses the search field.
Args: BASE [SHOTS_DIR]."""
import os
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("E2E_SCREENS_DIR", "")
H = "nwebnotfound.dev"
GIF = bytes.fromhex("47494638396101000100800000ffd23f00000021f90401000000002c000000000100010000020144003b")
PAGES = [("/music", "music"), ("/", "home"), ("/blog", "blog"), ("/profile", "profile"), ("/changelog", "changelog"), ("/writing", "writing"),
         ("/guestbook", "guestbook"), ("/about", "about"), ("/portfolio", "portfolio"), ("/trash", "trash"), ("/sommerfest", "404"), ("/pixelwand", "soon"), ("/blog/eine-navigation-fuer-zwei-seiten", "post")]


def ctx_for(br, width, night):
    c = br.new_context(viewport={"width": width, "height": 812 if width < 400 else 932}, device_scale_factor=2, has_touch=True, is_mobile=True)
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','gast');%s}catch(e){}" % ("localStorage.setItem('summer-theme','summer-night');" if night else ""))

    def route(r):
        u = urlsplit(r.request.url)
        if u.netloc == "cdn.discordapp.com":
            r.fulfill(content_type="image/gif", body=GIF); return
        if u.netloc != H:
            r.abort(); return
        h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}
        h["host"] = "mc.nwebnotfound.dev"; h["x-nnf-test-host"] = H
        r.fulfill(response=r.fetch(url=BASE + u.path + ("?" + u.query if u.query else ""), headers=h, max_redirects=0))

    c.route("**/*", route)
    return c


SMALL = """() => [...document.querySelectorAll('.win.focus .wt .wb, .mbar button, .win.focus .mctl button, .win.focus .xpbtn, .win.focus .cats button')]
  .filter((b) => b.offsetParent).map((b) => [b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20), Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)])
  .filter(([, w, h]) => w < 40 || h < 36)"""

with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    errs = []
    for width in (375, 390, 430):
        for night in (False, True):
            c = ctx_for(br, width, night); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            for path, name in PAGES:
                if width == 430 and name != "music":
                    continue
                pg.goto(f"https://{H}{path}", wait_until="load")
                if path != "/":
                    pg.locator(".win.focus .wc").wait_for(timeout=10000)
                pg.wait_for_timeout(250)
                assert pg.evaluate("document.documentElement.scrollWidth") <= width, (path, width, "horizontal scroll")
                small = pg.evaluate(SMALL)
                assert not small, (path, width, "touch targets below 40x36", small)
                if SHOTS:
                    pg.screenshot(path=os.path.join(SHOTS, f"phone-{name}-{'night' if night else 'day'}-{width}.png"))
            c.unroute_all(behavior="ignoreErrors"); c.close()
        print(f"PASS {width}: every window, day and night, no horizontal scroll, controls >= 40 px")

    c = ctx_for(br, 375, False); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    # Musik: pixel icons only, honest empty state, no example titles
    pg.goto(f"https://{H}/music", wait_until="load"); mp = pg.locator(".win.focus .mp"); mp.wait_for()
    txt = mp.locator(".mctl").inner_text()
    assert not any(ch in txt for ch in "◀▶⤮↻❚"), txt
    assert mp.locator(".mctl button .ic2").count() >= 5 and "NOCH KEIN TRACK" in mp.inner_text() and "Sommerloop" not in mp.inner_text()
    assert mp.locator(".seek").is_disabled() and mp.locator(".empty").is_visible() and mp.locator(".mctl .pp").get_attribute("aria-disabled") == "true"
    mp.locator(".mctl .pp").dispatch_event("click"); assert not mp.evaluate("e => e.classList.contains('on')"), "nothing plays without tracks"
    # title bar: icons, not glyphs, on the phone
    assert pg.locator(".win.focus .wt .wb.x .ic2").is_visible() and pg.locator(".win.focus .wt .wb.x .wbt").is_hidden()
    # guestbook signed out: no disabled fake input, one Discord button across the width
    pg.goto(f"https://{H}/guestbook", wait_until="load"); g = pg.locator(".win.focus .say"); g.wait_for()
    assert g.locator("input").count() == 0 and g.locator("a.xpbtn[href^='/auth/discord/login']").count() == 1
    bw = g.locator("a.xpbtn").bounding_box()["width"]; assert bw > 300, bw
    # blog: zero category counts hidden
    pg.goto(f"https://{H}/blog", wait_until="load"); pg.locator(".win.focus .cats").wait_for()
    assert all(not e.is_visible() for e in pg.locator(".win.focus .cats em.zero").all())
    # home search: no browser look (iOS drew a grey pill), white field in the family (Nils 07.11.)
    pg.goto(f"https://{H}/", wait_until="load")
    look = pg.evaluate("(() => { const cs = getComputedStyle(document.querySelector('#hq')); return [cs.appearance || cs.webkitAppearance, cs.backgroundColor, cs.borderTopWidth]; })()")
    assert look[0] == "none" and look[1] == "rgb(255, 255, 255)" and look[2] == "2px", look
    pg.goto(f"https://{H}/blog", wait_until="load")
    # bottom bar: search goes home and focuses the search field
    pg.locator("[data-msearch]").click(); pg.wait_for_timeout(200)
    assert pg.evaluate("document.activeElement && document.activeElement.id") == "hq" and pg.locator(".win:not(.min)").count() == 0
    c.unroute_all(behavior="ignoreErrors"); c.close()
    if SHOTS:   # night home with a search and its results (the screen of Nils' screenshot)
        c = ctx_for(br, 375, True); pg = c.new_page(); pg.goto(f"https://{H}/", wait_until="load")
        pg.locator("#hq").fill("gast"); pg.locator("#hres button").first.wait_for(); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SHOTS, "phone-search-night-375.png")); pg.locator("#hq").fill(""); pg.wait_for_timeout(200)
        pg.screenshot(path=os.path.join(SHOTS, "phone-home-icons-night-375.png"))
        c.unroute_all(behavior="ignoreErrors"); c.close()
    assert not errs, errs
    print("PASS 375: Musik icons + empty state, title-bar icons, guestbook Discord button, zero counts hidden, bottom-bar search")
    br.close()
