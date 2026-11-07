#!/usr/bin/env python3
"""NwebOS shell in a real browser (src/nwebos.js + public/design/nwebos.js), the default on the main site.
Boot only on the first desktop visit, login, desktop, windows on real paths with Back/Forward, windows
restored from localStorage, Esc, phone home screen, no-JS reading, guestbook with Discord session and a
mocked Turnstile widget. Args: BASE COOKIE(name=value, a signed-in session) [SHOTS_DIR]."""
import json
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE, COOKIE = sys.argv[1], sys.argv[2]
SHOTS = sys.argv[3] if len(sys.argv) > 3 else ""
H = "nwebnotfound.dev"
GIF = bytes.fromhex("47494638396101000100800000ffd23f00000021f90401000000002c000000000100010000020144003b")
TS = "window.turnstile={render(h){const i=document.createElement('input');i.type='hidden';i.name='cf-turnstile-response';i.value='mock-token';h.append(i);return 'w'},reset(){}};"


def ctx_for(br, width, cookie=False, js=True):
    c = br.new_context(viewport={"width": width, "height": 800 if width > 700 else 760}, java_script_enabled=js)
    # no nnf_os cookie: NwebOS is the default
    if cookie:
        n, v = (cookie if isinstance(cookie, str) else COOKIE).split("=", 1)
        c.add_cookies([{"name": n, "value": unquote(v), "domain": H, "path": "/", "secure": True, "httpOnly": True}])

    def route(r):
        u = urlsplit(r.request.url)
        if u.netloc == "challenges.cloudflare.com":
            r.fulfill(content_type="application/javascript", body=TS)
            return
        if u.netloc == "cdn.discordapp.com":
            r.fulfill(content_type="image/gif", body=GIF)
            return
        if u.netloc != H:
            r.abort()
            return
        h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}
        h["host"] = "mc.nwebnotfound.dev"  # wrangler dev rewrites Origin unless Host is the --local-upstream host
        h["x-nnf-test-host"] = H
        resp = r.fetch(url=BASE + u.path + ("?" + u.query if u.query else ""), headers=h, max_redirects=0)
        loc = resp.headers.get("location", "")
        if r.request.is_navigation_request() and 300 <= resp.status < 400 and loc:
            # Chromium follows a redirect of a fulfilled response WITHOUT routing it (it went to the live site, behind
            # Cloudflare's challenge, on CI): answer with a page that navigates itself, so the next request is routed.
            hd = {k: v for k, v in resp.headers.items() if k.lower() == "set-cookie"}
            hd["content-type"] = "text/html"
            r.fulfill(status=200, headers=hd, body="<script>location.replace(%s)</script>" % json.dumps(loc))
            return
        r.fulfill(response=resp)

    c.route("**/*", route)
    return c


def shot(pg, name):
    if SHOTS:
        pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(SHOTS, name))


def path(pg):
    return urlsplit(pg.url).path


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"  # CI container; elsewhere Playwright's own Chromium
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()

    # 1280: first visit to the desktop -> boot -> login -> desktop -> window on its own path, Back/Forward.
    c = ctx_for(br, 1280)
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/", wait_until="load")
    assert pg.locator("#boot").is_visible(), "boot on the first visit"
    shot(pg, "boot-1280.png")
    pg.locator("#boot").click()
    assert pg.locator("#login").is_visible() and pg.locator("[data-login-discord]").is_visible(), "login after the boot"
    shot(pg, "login-1280.png")
    pg.locator("[data-user=gast]").click()
    assert pg.locator("#desk").is_visible() and pg.locator("#smname").inner_text() == "Gast"
    shot(pg, "desktop-1280.png")
    pg.locator('.dicon[data-open="about"]').dblclick()
    pg.wait_for_selector(".win.focus")
    assert path(pg) == "/about" and pg.title().startswith("Über mich"), pg.url
    pg.locator('.dicon[data-open="portfolio"]').dblclick()
    pg.wait_for_timeout(300)
    assert path(pg) == "/portfolio" and pg.locator(".win").count() == 2
    shot(pg, "windows-1280.png")
    pg.go_back(); pg.wait_for_timeout(300)
    assert path(pg) == "/about" and pg.locator(".win.focus .tt").inner_text() == "Über mich", "Back focuses the previous window"
    pg.go_forward(); pg.wait_for_timeout(300)
    assert pg.locator(".win.focus .tt").inner_text() == "Projekte", "Forward focuses it again"
    # Drag, then reload: open windows and their positions come back, no boot, no login.
    bar = pg.locator(".win.focus .wt")
    b = bar.bounding_box()
    pg.mouse.move(b["x"] + 80, b["y"] + 10); pg.mouse.down(); pg.mouse.move(b["x"] + 20, b["y"] + 110, steps=5); pg.mouse.up()
    before = pg.locator(".win.focus").evaluate("e=>e.style.getPropertyValue('--x')+','+e.style.getPropertyValue('--y')")
    pg.reload(wait_until="load"); pg.wait_for_timeout(300)
    assert pg.locator("#boot").is_hidden() and pg.locator("#login").is_hidden() and pg.locator(".win").count() == 2, "reload: windows restored, no boot/login"
    after = pg.locator('.win[aria-label="Projekte"]').evaluate("e=>e.style.getPropertyValue('--x')+','+e.style.getPropertyValue('--y')")
    assert before == after, (before, after)
    # Esc closes the top window and the address follows; start menu, day/night, sound toggle.
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    assert pg.locator(".win").count() == 1 and path(pg) == "/about", pg.url
    pg.locator("#startb").click()
    assert pg.locator("#startm").is_visible()
    shot(pg, "start-1280.png")
    pg.keyboard.press("Escape")
    pg.locator("#thm").click()
    assert pg.evaluate("document.documentElement.dataset.theme") in ("summer-night", "summer-day")
    if pg.evaluate("document.documentElement.dataset.theme") == "summer-day":
        pg.locator("#thm").click()
    shot(pg, "desktop-night-1280.png")
    pg.locator("#thm").click()
    pg.locator("#snd").click()
    assert pg.locator("#snd").get_attribute("aria-pressed") == "false" and pg.evaluate("localStorage.getItem('nwebos.mute')") == "1"
    # Abmelden (guest): back to the login screen; a later visit to the desktop shows the login again (a window's
    # address still opens that window directly).
    pg.locator("#startb").click(); pg.locator("[data-egg=logout]").click()
    assert pg.locator("#login").is_visible()
    pg.goto(f"https://{H}/", wait_until="load")
    assert pg.locator("#login").is_visible() and pg.locator("#boot").is_hidden(), "after Abmelden: login, no boot"
    assert not errs, errs
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 boot, login, windows on paths, back/forward, restore, esc, tray, logout")

    # First visit straight to a window's address (Planner 07.11.): no boot, no login, the window is readable at once
    # and the visit counts as seen; signed in with Discord -> own avatar; guestbook form with Turnstile.
    c = ctx_for(br, 1280, cookie=True)
    pg = c.new_page()
    pg.goto(f"https://{H}/guestbook", wait_until="load")
    win = pg.locator('.win[aria-label="Gästebuch"]')
    win.locator("textarea").wait_for()
    assert pg.locator("#boot").is_hidden() and pg.locator("#login").is_hidden() and pg.locator("#desk").is_visible(), "a deep link skips boot and login"
    assert pg.evaluate("localStorage.getItem('nwebos.booted')") == "1", "deep link counts as seen"
    pg.wait_for_function("() => (document.querySelector('#smav').getAttribute('src') || '').startsWith('https://cdn.discordapp.com/')")
    assert win.locator(".msgs .msg, .msgs .sys").count() >= 1, "server-rendered entries (or the empty state) in the window"
    assert pg.locator("#smav").get_attribute("src").startswith("https://cdn.discordapp.com/"), "rule 10: Discord avatar"
    win.locator("textarea").fill("Hallo aus NwebOS")
    win.locator("button[type=submit]").click()
    pg.wait_for_function("() => document.querySelector('.win .gb-st').textContent === 'Danke!'", timeout=15000)
    pg.wait_for_function("() => [...document.querySelectorAll('.win .msg p')].some(p => p.textContent === 'Hallo aus NwebOS')", timeout=10000)
    shot(pg, "guestbook-1280.png")
    pg.goto(f"https://{H}/", wait_until="load")
    assert pg.locator("#boot").is_hidden() and pg.locator("#login").is_hidden(), "after a deep link the desktop shows no boot later"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    c = ctx_for(br, 375)
    pg = c.new_page()
    pg.goto(f"https://{H}/blog/vip-welten", wait_until="load")
    pg.locator(".win.focus .rd .post h1").wait_for()
    assert pg.locator("#boot").is_hidden() and pg.locator("#login").is_hidden(), "phone: deep link to a post opens it directly"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 deep link without boot/login, seen afterwards, Discord avatar, guestbook entry via Turnstile; 375 post deep link")

    # Abmelden with a real Discord session (throwaway session from e2e): one click, a same-origin POST, the session is
    # gone and NwebOS shows its login screen again (a GET would only show the "Abmelden?" confirmation page).
    LO = os.environ.get("NWEBOS_LOGOUT_COOKIE", "")
    if LO:
        c = ctx_for(br, 1280, cookie=LO)
        pg = c.new_page()
        pg.goto(f"https://{H}/guestbook", wait_until="load")   # deep link: window directly, no login (#115)
        pg.locator("#desk").wait_for(state="visible")
        pg.wait_for_function("() => (document.querySelector('#smav').getAttribute('src') || '').startsWith('https://cdn.discordapp.com/')", timeout=10000)   # /api/me answered
        posts = []
        nexts = []
        pg.on("request", lambda r: (posts.append(r.method), nexts.append(r.url)) if "/auth/discord/logout" in r.url else None)
        pg.locator("#startb").click()
        with pg.expect_navigation(wait_until="load"):
            pg.locator("[data-egg=logout]").click()
        assert posts and posts[0] == "POST", posts
        diag = lambda: (pg.url, pg.title(), pg.evaluate("[!!document.querySelector('#login:not([hidden])'), !!document.querySelector('[data-login-me]:not([hidden])'), document.documentElement.className]"))
        # back to the desktop address (restored windows may then show their own address again)
        assert unquote(nexts[0]).endswith("next=https://nwebnotfound.dev/") and urlsplit(pg.url).netloc == H, ("logout goes to /", nexts, diag())
        try: pg.locator("#login").wait_for(state="visible", timeout=10000)
        except Exception: raise AssertionError(("login screen after Abmelden", diag()))
        me = pg.evaluate("fetch('/api/me', {credentials: 'include'}).then(r => r.json())")
        assert not me.get("user"), ("session ended", me)
        pg.wait_for_function("() => document.querySelector('[data-login-me]').hidden", timeout=10000)
        c.unroute_all(behavior="ignoreErrors"); c.close()
        print("PASS 1280 Abmelden with a real session: one POST, logged out, login screen")
    else:
        print("SKIP real-session logout (NWEBOS_LOGOUT_COOKIE not set)")

    # Phone: handheld home screen, an app opens full screen, the home button goes back.
    c = ctx_for(br, 375)
    pg = c.new_page()
    pg.goto(f"https://{H}/", wait_until="load")
    pg.locator("#boot").click(); pg.locator("[data-user=gast]").click()
    shot(pg, "phone-home-375.png")
    pg.locator('.dicon[data-open="portfolio"]').click()
    pg.wait_for_selector(".win.focus")
    box = pg.locator(".win.focus").bounding_box()
    assert box["width"] == 375 and path(pg) == "/portfolio", box
    assert pg.evaluate("document.documentElement.scrollWidth") <= 375
    shot(pg, "phone-projects-375.png")
    pg.locator("[data-home]").click(); pg.wait_for_timeout(300)
    assert pg.locator(".win.min").count() == 1 and path(pg) == "/"
    pg.goto(f"https://{H}/guestbook", wait_until="load"); pg.wait_for_timeout(300)
    shot(pg, "phone-guestbook-375.png")
    # Keyboard: while the app covers the home screen, Tab never lands on a covered home icon; Home stays reachable and restores them.
    pg.wait_for_selector(".win.focus")
    assert pg.evaluate("document.querySelector('.dicons').inert === true"), "home icons are inert behind the open app"
    seen = []
    for _ in range(25):
        pg.keyboard.press("Tab"); seen.append(pg.evaluate("document.activeElement.className + '|' + (document.activeElement.closest('.dicons') ? 'ICON' : '')"))
    assert not any("ICON" in x for x in seen), seen
    pg.focus("[data-home]"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    assert pg.evaluate("document.querySelector('.dicons').inert === false"), "icons are back after Home"
    pg.keyboard.press("Tab"); pg.focus(".dicon"); assert pg.evaluate("document.activeElement.classList.contains('dicon')"), "an icon takes focus again"
    # Closing the last visible app (Close button, then Escape) hands focus to a home icon, never to BODY.
    for how in ("close", "escape"):
        pg.locator(".win.min").evaluate_all("els => els.forEach(e => e.querySelector('.x').click())"); pg.wait_for_timeout(400)
        pg.locator('.dicon[data-open="portfolio"]').click(); pg.wait_for_selector(".win.focus")
        assert pg.evaluate("document.querySelector('.dicons').inert === true")
        if how == "close": pg.locator(".win.focus .x").click()
        else: pg.keyboard.press("Escape")
        pg.wait_for_timeout(400)
        assert pg.evaluate("document.querySelector('.dicons').inert === false and !!document.activeElement.closest('.dicons')".replace(" and ", " && ")), (how, pg.evaluate("document.activeElement.tagName + '.' + document.activeElement.className"))
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 375 home screen, full-screen app, home button")

    # Games (docs/nwebos-modules.md): both open from the desktop and the start menu, one move works, stats persist, no timer while minimised.
    c = ctx_for(br, 1280)
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/", wait_until="load")
    pg.locator("#boot").click(); pg.locator("[data-user=gast]").click()
    pg.locator('.dicon[data-open="mines"]').dblclick()
    pg.wait_for_selector(".g-mines .mngrid .c")
    assert pg.locator(".g-mines .mngrid .c").count() == 81 and path(pg) == "/", "mines mounted, no own address"
    pg.locator(".g-mines .c").nth(40).click()   # the first click is always safe
    assert pg.locator(".g-mines .c.o").count() >= 1 and pg.locator(".g-mines .face.dead").count() == 0 and pg.locator(".g-mines .c.m").count() == 0, "first click is safe"
    pg.locator(".g-mines .c").nth(0).click(button="right")
    assert pg.locator(".g-mines .c").nth(0).get_attribute("class").find("f") >= 0 and pg.locator("[data-m]").inner_text() in ("009", "010"), "flag"
    pg.wait_for_timeout(1300); t1 = pg.locator("[data-t]").inner_text(); assert t1 != "000", "timer runs while playing"
    pg.locator('.win.focus .mn').click(); pg.wait_for_timeout(2300)
    assert pg.locator("[data-t]").inner_text() == t1, "no timer tick while minimised"
    shot(pg, "games-mines-1280.png")
    pg.locator(".tbb").first.click(); pg.wait_for_timeout(300)
    # keyboard: arrows move, Enter reveals, F flags
    pg.locator(".g-mines .c[tabindex='0']").focus(); pg.keyboard.press("ArrowRight"); pg.keyboard.press("F")
    assert pg.locator(".g-mines .c.f").count() == 2, "keyboard flag"
    # play to the end (a loss or a win), then the stats are stored
    for i in range(81):
        if pg.locator(".g-mines .face.dead, .g-mines .face.cool").count(): break
        pg.locator(".g-mines .c").nth(i).click()
    assert pg.locator(".g-mines .face.dead, .g-mines .face.cool").count() == 1
    assert '"played":1' in (pg.evaluate("Object.keys(localStorage).filter(k => /mines[.]stats$/.test(k)).map(k => localStorage[k]).join()") or ""), "mines stats persisted"
    pg.locator(".g-mines .face").click(); assert pg.locator(".g-mines .c.o").count() == 0, "new game"
    pg.locator('.win.focus .x').click(); pg.wait_for_timeout(400)
    # Fünf from the start menu: type a word with the keyboard, the row is rated, Backspace works.
    pg.locator("#startb").click(); pg.locator('#startm [data-open="five"]').click()
    pg.wait_for_selector(".g-five .fvgrid .ft")
    pg.locator(".win.focus").focus()
    pg.keyboard.type("abcd"); pg.keyboard.press("Backspace"); pg.keyboard.type("de")
    assert pg.locator(".g-five .fr").first.inner_text().replace(chr(10), "") == "ABCDE", pg.locator(".g-five .fr").first.inner_text()
    pg.keyboard.press("Enter"); pg.wait_for_timeout(600)
    assert pg.locator(".g-five .fr").first.locator(".t, .o, .s").count() == 5, "row rated"
    shot(pg, "games-five-1280.png")
    pg.locator(".g-five [data-v=en]").click(); assert pg.locator(".g-five .kb [data-k=Y]").count() == 1 and pg.locator(".g-five .fvnew").inner_text() == "New word", "language switch"
    # Fit: Fünf's content stays inside its frame; an on-screen key tap keeps Enter on the window.
    assert pg.evaluate("(() => { const w = document.querySelector('.g-five'); return w.scrollHeight <= w.clientHeight + 1; })()"), "five content fits its frame"
    pg.locator(".g-five .kb [data-k=A]").click()
    assert pg.evaluate("document.activeElement === document.querySelector('.win.focus')"), "focus returns to the window after an on-screen key (Enter submits)"
    # Search finds both games (start menu), then opens them.
    pg.locator('.win.focus .x').click(); pg.wait_for_timeout(300)
    pg.locator("#startb").click()
    for q, k in (("pixel", "mines"), ("minen", "mines"), ("fünf", "five"), ("five", "five")):
        pg.fill("#smq", q); assert pg.locator("#smres button").count() >= 1, ("search finds", q)
    pg.fill("#smq", "pixelminen"); pg.keyboard.press("Enter"); pg.wait_for_selector(".g-mines .mngrid .c")
    assert pg.evaluate("(() => { const w = document.querySelector('.g-mines'); return w.scrollHeight <= w.clientHeight + 1; })()"), "mines content fits its frame"
    assert pg.locator(".win.focus").bounding_box()["x"] > 130, "mines opens clear of the icon column"
    assert not errs, errs
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 games: Pixelminen + Fünf open, play, keyboard, stats, no timer while minimised")

    # Phone: both games open from the home screen and fit.
    c = ctx_for(br, 375)
    pg = c.new_page()
    pg.goto(f"https://{H}/", wait_until="load")
    pg.locator("#boot").click(); pg.locator("[data-user=gast]").click()
    for k, sel in (("mines", ".g-mines .mngrid"), ("five", ".g-five .kb")):
        pg.locator(f'.dicon[data-open="{k}"]').click(); pg.wait_for_selector(sel)
        assert pg.evaluate("document.documentElement.scrollWidth") <= 375 and pg.locator(".win.focus").bounding_box()["width"] == 375, k
        assert pg.locator(sel).bounding_box()["x"] >= 0 and pg.locator(sel).bounding_box()["x"] + pg.locator(sel).bounding_box()["width"] <= 375, k + " fits"
        shot(pg, f"phone-{k}-375.png")
        pg.locator("[data-home]").click(); pg.wait_for_timeout(300)
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 375 games open from the home screen and fit")

    # Without JS: all content is a readable page, the current app first.
    c = ctx_for(br, 1280, js=False)
    pg = c.new_page()
    pg.goto(f"https://{H}/guestbook", wait_until="load")
    hs = pg.locator("main#apps h2").all_inner_texts()
    assert hs[0] == "Gästebuch" and "Über mich" in hs and "Hallo aus NwebOS" in pg.inner_text("main"), hs   # the entry posted above, server-rendered
    pg.goto(f"https://{H}/en/about", wait_until="load")
    assert pg.locator("main#apps h2").first.inner_text() == "About me" and "Hi, I'm Nils." in pg.inner_text("main")
    shot(pg, "nojs-1280.png")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS no-JS readable, current app first, English")
    br.close()
