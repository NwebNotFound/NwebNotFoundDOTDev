#!/usr/bin/env python3
"""NwebOS phone sweep (mockups/nwebos/phone-audit/notes.md) in a real browser at 375 (and 1280 for the card):
A1 home search states, A2 quick sheet, A3 confirms as sheets (trash, profile delete; cancel only), A4 ?login=failed
toast, A7 guestbook counter, A14 Abonnieren (pills, sheet, copy, feed links, changelog feed, autodiscovery).
Args: BASE [COOKIE] [SHOTS_DIR]."""
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
COOKIE = sys.argv[2] if len(sys.argv) > 2 and "=" in sys.argv[2] else ""
SHOTS = (sys.argv[3] if len(sys.argv) > 3 else "") or os.environ.get("E2E_SCREENS_DIR", "")
H = "nwebnotfound.dev"
GIF = bytes.fromhex("47494638396101000100800000ffd23f00000021f90401000000002c000000000100010000020144003b")


def ctx_for(br, width, night=False, cookie=""):
    phone = width < 700
    c = br.new_context(viewport={"width": width, "height": 812 if phone else 800}, device_scale_factor=2 if phone else 1, has_touch=phone, is_mobile=phone)
    c.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"https://{H}")
    if cookie:
        n, v = cookie.split("=", 1)
        c.add_cookies([{"name": n, "value": unquote(v), "domain": H, "path": "/", "secure": True, "httpOnly": True}])
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','%s');%s}catch(e){}" % ("me" if cookie else "gast", "localStorage.setItem('summer-theme','summer-night');" if night else ""))

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


def shot(pg, name):
    if SHOTS:
        pg.screenshot(path=os.path.join(SHOTS, name))


def open_win(pg, path):
    pg.goto(f"https://{H}{path}", wait_until="load")
    if path.split("?")[0] not in ("/", "/en"):
        pg.locator(".win.focus .wc").first.wait_for(timeout=10000)
    pg.wait_for_timeout(300)


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    errs = []

    c = ctx_for(br, 375); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    # A1 home search: quick chips on focus, results with a count, an empty state, clear and cancel
    open_win(pg, "/")
    q = pg.locator("#hq")
    assert q.evaluate("e => getComputedStyle(e).appearance") == "none", "A1: no iOS search pill"
    q.focus(); pg.wait_for_timeout(150)
    assert pg.locator("#hres:not([hidden]) [data-sug]").count() >= 1, "A1: 'Schnell öffnen' chips on an empty focused search"
    q.fill("blog")
    pg.wait_for_function("() => /Treffer/.test((document.querySelector('#hres li.rh') || {}).textContent || '')", timeout=5000)   # A1: result header with a count
    q.fill("zzqxzz"); pg.wait_for_timeout(200)
    assert pg.locator("#hres li.none").is_visible(), "A1: empty state"
    shot(pg, "sweep-search-empty-375.png")
    pg.locator(".hsearch .clr").click(); assert q.input_value() == "", "A1: clear empties the field"
    pg.locator(".hsearch .cnl").click(); pg.wait_for_timeout(150)
    assert not pg.evaluate("document.activeElement && document.activeElement.id === 'hq'"), "A1: cancel leaves the search"
    print("PASS 375 A1 search: chips, count, empty state, clear, cancel")

    # A2 quick sheet: theme toggles in place, Esc closes, focus goes back to the pill
    qb = pg.locator("[data-quick]"); qb.click()
    qs = pg.locator(".shx.qs"); qs.wait_for()
    rows = qs.locator("ul.rows > li > a, ul.rows > li > button")
    assert rows.count() == 3 and all(rows.nth(i).bounding_box()["height"] >= 48 for i in range(3)), "quick-sheet rows are a styled list (>= 48px each)"
    t0 = pg.evaluate("document.documentElement.dataset.theme || ''")
    qs.locator("[data-qtheme]").click(); pg.wait_for_timeout(150)
    assert pg.evaluate("document.documentElement.dataset.theme || ''") != t0, "A2: Tag/Nacht switches the theme"
    qs.locator("[data-qtheme]").click(); pg.wait_for_timeout(100)
    shot(pg, "sweep-quick-375.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    assert pg.locator(".shx").count() == 0 and pg.locator(".shbd").count() == 0, "A2: Esc closes the sheet"
    assert pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-quick')"), "A2: focus returns to the opener"
    # row 56: the account card is the link; signed out it is "Anmelden" (Discord login back to the profile)
    qb.click(); qs.wait_for()
    card = qs.locator("a.acct")
    assert card.inner_text().startswith("Anmelden") and card.get_attribute("href").startswith("/auth/discord/login?next=") and "profile" in card.get_attribute("href"), card.get_attribute("href")
    pg.keyboard.press("Escape")
    print("PASS 375 A2 quick sheet: theme toggle, Esc, focus return, account card = Anmelden link")

    # A3 trash: a danger sheet, cancel keeps the items
    open_win(pg, "/trash")
    n0 = pg.locator(".win.focus .trt tbody tr").count()
    pg.locator(".win.focus [data-trash-empty]").click()
    ask = pg.locator(".shx.ask"); ask.wait_for()
    assert ask.locator("[data-yes]").evaluate("e => e.classList.contains('danger')"), "A3: the confirm button is red"
    shot(pg, "sweep-trash-ask-375.png")
    ask.locator("[data-x]").click(); pg.wait_for_timeout(150)
    assert pg.locator(".shx").count() == 0 and pg.locator(".win.focus .trt tbody tr").count() == n0, "A3: cancel keeps the recycle bin"
    print("PASS 375 A3 trash sheet: danger button, cancel keeps the items")

    # A4 ?login=failed: an error toast with "Nochmal", the parameter goes
    open_win(pg, "/guestbook?login=failed")
    t = pg.locator(".toast.err"); t.wait_for()
    assert "Anmeldung" in t.inner_text() and t.locator("a").get_attribute("href").startswith("/auth/discord/login?next="), "A4: toast with retry"
    assert "login=" not in pg.url, "A4: the parameter is removed"
    shot(pg, "sweep-login-failed-375.png")
    print("PASS 375 A4 login failed toast")

    # A14 Abonnieren: blog pill -> sheet with the URL, Feedly/Inoreader/feed:, copy -> "Kopiert" + toast
    open_win(pg, "/blog")
    pill = pg.locator('.win.focus .bl-h .subb[data-sub="blog"]')
    assert pill.is_visible() and pill.get_attribute("href") == "/blog/feed.xml", "A14: blog pill (a feed link without JS)"
    pill.click()
    s = pg.locator(".shx.sub"); s.wait_for()
    url = s.locator(".feedu input").input_value()
    assert url == f"https://{H}/blog/feed.xml", url
    hrefs = s.locator(".rows2 a").evaluate_all("l => l.map(a => a.getAttribute('href'))")
    assert hrefs[0] == "feed:" + url and hrefs[1].startswith("https://feedly.com/i/subscription/feed/https%3A%2F%2F") and hrefs[2].startswith("https://www.inoreader.com/?add_feed="), hrefs
    assert s.locator(".ios").is_visible(), "A14: iPhone hint on touch"
    shot(pg, "sweep-sub-blog-sheet-375.png")
    s.locator("[data-copyfeed]").click()
    pg.locator(".toast.ok").wait_for()
    assert "Kopiert" in s.locator("[data-copyfeed]").inner_text(), "A14: the copy button says so"
    assert pg.evaluate("navigator.clipboard.readText()") == url, "A14: the URL is on the clipboard"
    shot(pg, "sweep-sub-blog-copied-375.png")
    pg.keyboard.press("Escape")
    open_win(pg, "/changelog")
    cl = pg.locator('.win.focus .clh .subb[data-sub="changelog"]')
    assert cl.get_attribute("href") == "/changelog/feed.xml", "A14 row 52: the changelog pill is its own feed"
    open_win(pg, "/writing")
    assert pg.locator('.win.focus .lib .subb[data-sub="writing"]').get_attribute("href") == "/writing/feed.xml", "A14 row 53: Texte pill"
    alts = pg.evaluate("[...document.querySelectorAll('link[rel=alternate][type=\"application/rss+xml\"]')].map(l => l.getAttribute('href'))")
    assert alts == ["/blog/feed.xml", "/changelog/feed.xml", "/writing/feed.xml"], ("A14 autodiscovery", alts)
    feed = pg.evaluate("fetch('/en/changelog/feed.xml').then(async r => [r.status, r.headers.get('content-type'), await r.text()])")   # through the route, not pg.request
    assert feed[0] == 200 and feed[1].startswith("application/rss+xml") and "<item>" in feed[2] and "<language>en</language>" in feed[2], ("A14: /en/changelog/feed.xml", feed[:2])
    print("PASS 375 A14 subscribe: pills, sheet, copy + toast + clipboard, feed links, changelog feed, autodiscovery")
    c.unroute_all(behavior="ignoreErrors"); c.close()

    # desktop: the subscribe sheet is a centred card
    c = ctx_for(br, 1280); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    open_win(pg, "/changelog")
    pg.locator('.win.focus .clh .subb').click()
    s = pg.locator(".shx.sub"); s.wait_for(); pg.wait_for_timeout(300)
    r = s.bounding_box()
    assert abs(r["x"] + r["width"] / 2 - 640) < 4 and r["width"] == 440 and r["y"] > 20, ("A14 desktop card", r)
    assert not s.locator(".ios").is_visible(), "no iPhone hint with a mouse"
    shot(pg, "sweep-sub-changelog-1280.png")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 A14 subscribe sheet is a centred 440px card")

    if COOKIE:
        c = ctx_for(br, 375, cookie=COOKIE); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        # A7 guestbook counter
        open_win(pg, "/guestbook")
        ta = pg.locator(".win.focus .gb-form textarea"); ta.fill("Hallo")
        assert pg.locator(".win.focus .gb-form .cnt").inner_text() == "5 / 500", "A7: counter"
        # A3 profile delete: a stacked danger sheet; "Behalten" keeps everything (nothing is deleted here)
        open_win(pg, "/profile")
        tabs = pg.locator(".win.focus .p3-tabs button")
        for i in range(tabs.count()):
            if tabs.nth(i).inner_text().strip() == "Einstellungen":
                tabs.nth(i).click(); break
        d = pg.locator(".win.focus [data-pf-delete]"); d.wait_for()
        d.click()
        ask = pg.locator(".shx.ask"); ask.wait_for()
        assert "Alle deine Daten" in ask.inner_text() and ask.locator(".acts:not(.two)").count() == 1, "A3: stacked delete sheet"
        shot(pg, "sweep-profile-delete-375.png")
        ask.locator("[data-x]").click(); pg.wait_for_timeout(200)
        assert pg.locator(".shx").count() == 0 and urlsplit(pg.url).path == "/profile", "A3: Behalten keeps the profile"
        me = pg.evaluate("fetch('/api/me').then(r => r.json())")
        assert me.get("user"), "still signed in after Behalten"
        # row 56 signed in: a tap on the account card opens the profile window
        open_win(pg, "/")
        pg.locator("[data-quick]").click(); card = pg.locator(".shx.qs a.acct"); card.wait_for()
        assert card.inner_text().startswith("Mein Profil"), card.inner_text()
        card.click(); pg.locator(".win.focus .pf").first.wait_for(timeout=10000)
        assert urlsplit(pg.url).path == "/profile" and pg.locator(".shx").count() == 0, pg.url
        # A2 signed in: the quick sheet shows the account and Abmelden opens the logout sheet (cancel)
        pg.locator("[data-quick]").click(); pg.locator(".shx.qs [data-qlogout]").click()
        lo = pg.locator(".shx.ask"); lo.wait_for()
        assert "Abmelden?" in lo.inner_text(), "logout asks first"
        lo.locator("[data-x]").click()
        c.unroute_all(behavior="ignoreErrors"); c.close()
        print("PASS 375 signed in: guestbook counter, profile delete sheet (kept), logout sheet (cancelled)")

    # #123 review round 1
    # (2) short laptop screen: the bigger Fünf window fits above the taskbar, its keyboard reachable by scrolling
    c = ctx_for(br, 1280); pg = c.new_page(); pg.set_viewport_size({"width": 1280, "height": 720}); pg.on("pageerror", lambda e: errs.append(str(e)))
    open_win(pg, "/")
    pg.locator("#startb").click(); pg.locator('#startm [data-open="five"]').click(); pg.wait_for_selector(".g-five .kb button")
    wb = pg.locator(".win.focus").bounding_box()
    assert wb["y"] + wb["height"] <= 720 - 36 + 1, ("Fünf window under the taskbar at 1280x720", wb)
    pg.locator('.g-five .kb [data-k="↵"]').scroll_into_view_if_needed(); kb = pg.locator('.g-five .kb [data-k="↵"]').bounding_box()
    assert kb["y"] + kb["height"] <= 720 - 36 + 1, ("Enter key reachable", kb)
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280x720: Fünf fits above the taskbar, its keyboard is reachable")
    if COOKIE:
        # (1) a click on the sheet's text, then Esc: only the sheet closes, the window behind stays; Tab stays inside
        c = ctx_for(br, 1280, cookie=COOKIE); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        open_win(pg, "/profile")
        for i in range(pg.locator(".win.focus .p3-tabs button").count()):
            if pg.locator(".win.focus .p3-tabs button").nth(i).inner_text().strip() == "Einstellungen":
                pg.locator(".win.focus .p3-tabs button").nth(i).click(); break
        pg.locator(".win.focus [data-pf-delete]").click(); ask = pg.locator(".shx.ask"); ask.wait_for()
        ask.locator("h2").click(); pg.keyboard.press("Tab")
        assert pg.evaluate("document.querySelector('.shx').contains(document.activeElement)"), "Tab after a click on the text stays in the sheet"
        ask.locator("p").first.click(); pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        assert pg.locator(".shx").count() == 0 and pg.locator('.win:not(.min)[aria-label="Mein Profil"], .win:not(.min) .pf').count() >= 1, "Esc closes the sheet only, the Profil window stays"
        c.unroute_all(behavior="ignoreErrors"); c.close()
        # (3) phone: Back with the sheet open closes the sheet
        c = ctx_for(br, 375, cookie=COOKIE); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        open_win(pg, "/guestbook"); open_win(pg, "/profile")
        for i in range(pg.locator(".win.focus .p3-tabs button").count()):
            if pg.locator(".win.focus .p3-tabs button").nth(i).inner_text().strip() == "Einstellungen":
                pg.locator(".win.focus .p3-tabs button").nth(i).click(); break
        pg.locator(".win.focus [data-pf-delete]").click(); pg.locator(".shx.ask").wait_for()
        pg.go_back(); pg.wait_for_timeout(400)
        assert pg.locator(".shx").count() == 0 and pg.locator(".shbd").count() == 0, "Back closes the sheet"
        c.unroute_all(behavior="ignoreErrors"); c.close()
        print("PASS sheet: click on text + Esc closes only the sheet, Tab stays inside, Back closes it on the phone")
    assert not errs, errs
    br.close()
