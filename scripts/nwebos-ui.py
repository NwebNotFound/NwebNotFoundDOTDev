#!/usr/bin/env python3
"""NwebOS shell in a real browser (src/nwebos.js + public/design/nwebos.js), the default on the main site.
Boot only on the first desktop visit, login, desktop, windows on real paths with Back/Forward, windows
restored from localStorage, Esc, phone home screen, no-JS reading, guestbook with Discord session and a
mocked Turnstile widget. Args: BASE COOKIE(name=value, a signed-in session) [SHOTS_DIR]."""
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
        r.fulfill(response=r.fetch(url=BASE + u.path + ("?" + u.query if u.query else ""), headers=h, max_redirects=0))

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
    # Abmelden (guest): back to the login screen; a later visit shows the login again.
    pg.locator("#startb").click(); pg.locator("[data-egg=logout]").click()
    assert pg.locator("#login").is_visible()
    pg.reload(wait_until="load")
    assert pg.locator("#login").is_visible() and pg.locator("#boot").is_hidden(), "after Abmelden: login, no boot"
    assert not errs, errs
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 boot, login, windows on paths, back/forward, restore, esc, tray, logout")

    # Direct visit to an app path: no boot; signed in with Discord -> own tile; guestbook form with Turnstile.
    c = ctx_for(br, 1280, cookie=True)
    pg = c.new_page()
    pg.goto(f"https://{H}/guestbook", wait_until="load")
    assert pg.locator("#boot").is_hidden(), "a direct visit skips the boot"
    pg.locator("[data-login-me]").wait_for(state="visible")
    assert pg.locator("[data-login-discord]").is_hidden()
    pg.locator("[data-user=me]").click()
    win = pg.locator('.win[aria-label="Gästebuch"]')
    win.locator("textarea").wait_for()
    assert win.locator(".msgs .msg, .msgs .sys").count() >= 1, "server-rendered entries (or the empty state) in the window"
    assert pg.locator("#smav").get_attribute("src").startswith("https://cdn.discordapp.com/"), "rule 10: Discord avatar"
    win.locator("textarea").fill("Hallo aus NwebOS")
    win.locator("button[type=submit]").click()
    pg.wait_for_function("() => document.querySelector('.win .gb-st').textContent === 'Danke!'", timeout=15000)
    pg.wait_for_function("() => [...document.querySelectorAll('.win .msg p')].some(p => p.textContent === 'Hallo aus NwebOS')", timeout=10000)
    shot(pg, "guestbook-1280.png")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 direct visit, Discord tile, guestbook entry via Turnstile")

    # Abmelden with a real Discord session (throwaway session from e2e): one click, a same-origin POST, the session is
    # gone and NwebOS shows its login screen again (a GET would only show the "Abmelden?" confirmation page).
    LO = os.environ.get("NWEBOS_LOGOUT_COOKIE", "")
    if LO:
        c = ctx_for(br, 1280, cookie=LO)
        pg = c.new_page()
        pg.goto(f"https://{H}/guestbook", wait_until="load")
        pg.locator("[data-user=me]").click()
        posts = []
        pg.on("request", lambda r: posts.append(r.method) if "/auth/discord/logout" in r.url else None)
        pg.locator("#startb").click()
        with pg.expect_navigation(wait_until="load"):
            pg.locator("[data-egg=logout]").click()
        assert posts and posts[0] == "POST", posts
        assert urlsplit(pg.url).netloc == H and pg.locator("#login").is_visible() and pg.locator("[data-login-me]").is_hidden(), "one click: logged out, NwebOS login"
        assert pg.evaluate("fetch('/api/me', {credentials: 'include'}).then(r => r.json()).then(d => !d.user)"), "session ended"
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
