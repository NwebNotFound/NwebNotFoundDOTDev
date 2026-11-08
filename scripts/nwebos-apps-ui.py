#!/usr/bin/env python3
"""NwebOS app windows in a real browser (src/nwebos-apps.js + public/design/nwebos-apps.js): every window opens on
its address at 375/1280, links inside windows open windows without a page load, the blog filters, a post opens
from the list, reactions need a session and count, reading progress is saved, the recycle bin dialog, the 404
window carries HTTP 404, the profile is private. Args: BASE COOKIE(name=value, signed in) [SHOTS_DIR]."""
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE, COOKIE = sys.argv[1], sys.argv[2]
SHOTS = sys.argv[3] if len(sys.argv) > 3 else ""
H = "nwebnotfound.dev"
GIF = bytes.fromhex("47494638396101000100800000ffd23f00000021f90401000000002c000000000100010000020144003b")


def ctx_for(br, width, signed=False, night=False):
    c = br.new_context(viewport={"width": width, "height": 800 if width > 700 else 760})
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','gast');%s}catch(e){}" % ("localStorage.setItem('summer-theme','summer-night');" if night else ""))
    if signed:
        n, v = COOKIE.split("=", 1)
        c.add_cookies([{"name": n, "value": unquote(v), "domain": H, "path": "/", "secure": True, "httpOnly": True}])

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
        pg.wait_for_timeout(450); pg.screenshot(path=os.path.join(SHOTS, name))


WINDOWS = [("/blog", "blog", ".bl"), ("/blog/eine-navigation-fuer-zwei-seiten", "post", ".rd .post"), ("/profile", "profile", ".pf"), ("/changelog", "changelog", ".cl2"),
           ("/music", "music", ".mp"), ("/writing", "writing", ".lib"), ("/trash", "trash", ".trw"), ("/pixelwand", "soon", ".soonw"), ("/sommerfest", "notfound", ".nf")]

with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"  # CI container; elsewhere Playwright's own Chromium
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    errs = []
    for width in (1280, 375):
        for night in (False, True):
            c = ctx_for(br, width, signed=True, night=night)
            pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            for path, name, sel in WINDOWS:
                r = pg.goto(f"https://{H}{path}", wait_until="load")
                assert r.status == (404 if name == "notfound" else 200), (path, r.status)
                pg.locator(f".win.focus {sel}").wait_for(timeout=10000)
                if width == 375:
                    box = pg.locator(".win.focus").bounding_box(); assert box["width"] == 375, (path, box)
                    assert pg.evaluate("document.documentElement.scrollWidth") <= 375, path
                shot(pg, f"{name}-{'night' if night else 'day'}-{width}.png")
            c.unroute_all(behavior="ignoreErrors"); c.close()
        print(f"PASS {width} every window on its address, day and night")

    # Links inside windows open windows (no page load), blog filter, post from the list, back to the list.
    c = ctx_for(br, 1280)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/blog", wait_until="load")
    pg.evaluate("window.__marker = 1")
    pg.locator(".win.focus [data-bq]").fill("vip")
    assert pg.locator(".win.focus [data-q]:visible").count() == 1, "title/tag search filters in place"
    pg.locator(".win.focus [data-bq]").fill("")
    pg.locator('.win.focus .cats [data-cat="server"]').click()
    assert pg.locator(".win.focus [data-q]:visible").count() == 1
    pg.locator('.win.focus .cats [data-cat=""]').click()
    mb = pg.locator(".win.focus .arch [data-month]").first
    n_m = int(mb.locator("em").inner_text()); mb.click()
    assert mb.get_attribute("aria-pressed") == "true" and pg.locator(".win.focus [data-q]:visible").count() == n_m, "archive month filters in place"
    mb.click(); assert pg.locator(".win.focus [data-q]:visible").count() == pg.locator(".win.focus [data-q]").count()
    pg.locator('.win.focus a[href="/blog/eine-navigation-fuer-zwei-seiten"]').first.click()
    pg.locator(".win.focus .rd .post h1").wait_for()
    assert urlsplit(pg.url).path == "/blog/eine-navigation-fuer-zwei-seiten" and pg.evaluate("window.__marker") == 1, "opened without a page load"
    assert pg.locator(".win.focus .toc li").count() >= 2 and pg.locator(".win.focus .post h2[id]").count() >= 2
    pg.evaluate("document.querySelector('.win.focus .rscroll').scrollTop = 1e6"); pg.wait_for_timeout(300)
    assert pg.evaluate("(() => { const l = [...document.querySelectorAll('.win.focus .toc a')]; return l[l.length - 1].classList.contains('on'); })()"), "TOC marks the last section at the end"
    # guest reaction: refused (needs Discord), count unchanged
    before = pg.locator('.win.focus [data-react="heart"] em').inner_text()
    pg.locator('.win.focus [data-react="heart"]').click(); pg.wait_for_timeout(500)
    assert pg.locator('.win.focus [data-react="heart"] em').inner_text() == before
    pg.go_back(); pg.wait_for_timeout(400)
    assert urlsplit(pg.url).path == "/blog" and pg.evaluate("window.__marker") == 1, "Back to the list window"
    # recycle bin dialog
    pg.goto(f"https://{H}/trash", wait_until="load")
    pg.locator(".win.focus [data-trash-empty]").click(); pg.locator(".shx.ask [data-yes]").click()   # phone audit A3: the confirm is a sheet (a card on desktop)
    assert pg.locator(".win.focus .tempty").is_visible()
    shot(pg, "x-trash-empty-1280.png")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 in-window links, blog filter, post from the list, Back, guest reaction refused, recycle bin")

    # Signed in: reaction toggles and counts, reading progress is saved and shows up in the profile.
    c = ctx_for(br, 1280, signed=True)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/blog/eine-navigation-fuer-zwei-seiten", wait_until="load")
    pg.locator(".win.focus .rd").wait_for()
    pg.wait_for_function("() => window.__me && window.__me.user")
    em = pg.locator('.win.focus [data-react="sun"] em'); n0 = int(em.inner_text())
    pg.locator('.win.focus [data-react="sun"]').click()
    pg.wait_for_function(f"() => document.querySelector('.win.focus [data-react=sun] em').textContent === '{n0 + 1}'", timeout=10000)
    assert pg.get_attribute('.win.focus [data-react="sun"]', "aria-pressed") == "true"
    pg.locator('.win.focus [data-react="sun"]').click()
    pg.wait_for_function(f"() => document.querySelector('.win.focus [data-react=sun] em').textContent === '{n0}'", timeout=10000)
    pg.evaluate("document.querySelector('.win.focus .rscroll').scrollTop = 1e6")
    pg.wait_for_timeout(3500)
    pg.goto(f"https://{H}/profile", wait_until="load")
    assert "Eine Navigation für zwei Seiten" in pg.locator(".win.focus .pf").inner_text(), "progress shows in the profile"
    assert pg.locator(".win.focus .pf .nm").inner_text().strip().endswith("Nils")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS signed in: reaction toggles, reading progress saved, profile Weiterlesen")

    # Start menu search: a blog post (from /api/blog) opens as a window, the wiki is a new-tab link; phone home search.
    c = ctx_for(br, 1280)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/", wait_until="load")
    pg.locator("#startb").click(); pg.locator("#smq").fill("vip welt")
    pg.locator("#smres button", has_text="VIP-Welten").wait_for(timeout=10000)
    assert pg.locator(".smmid").is_hidden(), "results replace the program list"
    pg.keyboard.press("Enter")
    pg.locator(".win.focus .rd .post h1").wait_for()
    assert urlsplit(pg.url).path == "/blog/vip-welten" and pg.locator("#startm").is_hidden()
    pg.locator("#startb").click(); pg.locator("#smq").fill("faq")
    assert pg.locator("#smres button", has_text="Wiki: FAQ").locator(".kind").inner_text() == "Wiki ↗"   # phone audit A1: kind chip
    pg.locator("#smq").fill("zzzqq"); assert "Nichts gefunden" in pg.locator("#smres").inner_text()
    shot(pg, "x-search-1280.png")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    c = ctx_for(br, 375)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/", wait_until="load")
    pg.locator("#hq").fill("gäste")
    pg.locator("#hres button", has_text="Gästebuch").click()
    pg.locator('.win.focus[aria-label="Gästebuch"]').wait_for()
    assert urlsplit(pg.url).path == "/guestbook"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS search: start menu (blog post opens, wiki new tab, no hit) and phone home")

    # #128 / #129: "Zum Desktop" on the 404 window leaves the plain desktop; the maximise button flips its label.
    c = ctx_for(br, 1280, signed=True)
    pg = c.new_page()
    pg.goto(f"https://{H}/nope-404", wait_until="load"); pg.locator(".win.focus .nf").wait_for(timeout=10000)
    pg.locator(".win.focus [data-close]").click(); pg.wait_for_timeout(500)
    assert pg.locator(".win").count() == 0, ("Zum Desktop opens no window", pg.locator(".win .tt").all_inner_texts())
    # openUrl("/") is the plain desktop: a desktop link to "/" opens no window (it used to fall through to the first app)
    pg.evaluate("document.querySelector('#desk').insertAdjacentHTML('beforeend', '<a id=\"t-root\" href=\"/\" style=\"position:absolute;left:300px;top:300px;z-index:9\">root</a>')")
    pg.locator("#t-root").click(); pg.wait_for_timeout(500)
    assert pg.locator(".win").count() == 0, "openUrl('/') opens no window"
    pg.locator('.dicon[data-open="about"]').dblclick(); pg.locator(".win.focus .mx").wait_for()
    assert pg.locator(".win.focus .mx").get_attribute("aria-label") == "Maximieren"
    pg.locator(".win.focus .mx").click()
    assert pg.locator(".win.focus .mx").get_attribute("aria-label") == "Wiederherstellen", "label flips when maximised"
    assert pg.locator(".win.focus .mx use").get_attribute("href").endswith("#i-c-restore") and not pg.locator(".win.focus .mx").inner_text().strip(), "restore icon is a sprite symbol, no text glyph"
    pg.locator(".win.focus .mx").click()
    assert pg.locator(".win.focus .mx").get_attribute("aria-label") == "Maximieren", "label flips back"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 404 Zum Desktop leaves no window; maximise label flips")

    # Deep links (Gatekeeper #115): /de/… opens its window; a draft's ?preview= token stays in the address after the boot.
    c = ctx_for(br, 1280)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    for p in ("/de/blog", "/de/blog/eine-navigation-fuer-zwei-seiten"):
        pg.goto(f"https://{H}{p}", wait_until="load")
        pg.locator(".win.focus .bl, .win.focus .rd .post h1").first.wait_for(timeout=10000)
    prev = os.environ.get("NWEBOS_PREVIEW", "")
    if prev:
        r = pg.goto(f"https://{H}{prev}", wait_until="load")
        pg.locator(".win.focus .rd .post h1").wait_for(timeout=10000)
        pg.wait_for_timeout(300)
        assert r.status == 200 and "preview=" in urlsplit(pg.url).query, ("preview token kept", pg.url)
        r = pg.reload(wait_until="load")
        assert r.status == 200 and pg.locator(".win.focus .rd .post h1").inner_text() == "NwebOS Entwurf", "reload of the preview address still shows the draft"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS deep links: /de/blog, /de/blog/<slug>" + (", draft preview keeps its token" if prev else " (no NWEBOS_PREVIEW: preview check skipped)"))

    # Guest profile: private, sign-in prompt, no data.
    c = ctx_for(br, 1280)
    pg = c.new_page()
    pg.goto(f"https://{H}/profile", wait_until="load")
    assert "Mit Discord anmelden" in pg.locator(".win.focus").inner_text() and pg.locator(".win.focus .bmk").count() == 0
    pg.goto(f"https://{H}/guestbook", wait_until="load")
    assert pg.locator(".win.focus .say input").count() == 0 and pg.locator(".win.focus .say a.xpbtn").get_attribute("href").startswith("/auth/discord/login"), "guest guestbook footer: one Discord button (phone polish 8)"
    shot(pg, "x-guestbook-guest-1280.png")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    assert not errs, errs
    print("PASS guest profile private, guest guestbook footer")
    br.close()
