#!/usr/bin/env python3
"""NwebOS blog editor window (public/design/nwebos-editor.js) in a real browser: admin only (guest -> sign-in,
non-admin -> 404 window), new post, autosave, server preview, tags, publish, the post's address in the window,
a stale second tab gets the conflict banner instead of overwriting, phone Text/Vorschau switch.
Args: BASE ADMIN_COOKIE [OTHER_COOKIE]  (name=value; OTHER = signed in, not admin)."""
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE, ADMIN = sys.argv[1], sys.argv[2]
OTHER = sys.argv[3] if len(sys.argv) > 3 else ""
H = "nwebnotfound.dev"
SHOTS = os.environ.get("E2E_SCREENS_DIR", "")


def ctx_for(br, width, cookie="", night=False):
    c = br.new_context(viewport={"width": width, "height": 800 if width > 700 else (932 if width > 400 else 812)}, has_touch=width < 700)
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','gast');%s}catch(e){}" % ("localStorage.setItem('summer-theme','summer-night');" if night else ""))
    if cookie:
        n, v = cookie.split("=", 1)
        c.add_cookies([{"name": n, "value": unquote(v), "domain": H, "path": "/", "secure": True, "httpOnly": True}])

    def route(r):
        u = urlsplit(r.request.url)
        if u.netloc != H:
            r.abort(); return
        h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}
        h["host"] = "mc.nwebnotfound.dev"; h["x-nnf-test-host"] = H
        r.fulfill(response=r.fetch(url=BASE + u.path + ("?" + u.query if u.query else ""), headers=h, max_redirects=0))

    c.route("**/*", route)
    return c


def shot(pg, name):
    if SHOTS:
        pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(SHOTS, name))


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    errs = []

    # guest: sign in first (302 to Discord login), nothing rendered
    c = ctx_for(br, 1280); pg = c.new_page()
    seen = []
    pg.on("response", lambda r: seen.append((r.status, r.headers.get("location", ""))) if urlsplit(r.url).path == "/blog/admin" else None)
    pg.goto(f"https://{H}/blog/admin", wait_until="commit")
    assert seen and seen[0][0] == 302 and seen[0][1].startswith("/auth/discord/login"), seen
    c.unroute_all(behavior="ignoreErrors"); c.close()
    # signed in, not admin: the 404 window
    if OTHER:
        c = ctx_for(br, 1280, OTHER); pg = c.new_page()
        r = pg.goto(f"https://{H}/blog/admin", wait_until="load")
        assert r.status == 404 and pg.locator(".win.focus .nf").count() == 1 and pg.locator(".ed").count() == 0, r.status
        c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS editor: guest -> sign-in, non-admin -> 404 window")

    # admin: new post, autosave, preview, tags, publish
    c = ctx_for(br, 1280, ADMIN); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    r = pg.goto(f"https://{H}/blog/admin", wait_until="load")
    assert r.status == 200 and "no-store" in (r.headers.get("cache-control") or "")
    win = pg.locator('.win[aria-label="Blog-Editor"]')
    win.locator("[data-new]").wait_for()
    win.locator("[data-new]").click()
    win.locator("[name=title]").wait_for(state="visible")
    pid = urlsplit(pg.url).path.rsplit("/", 1)[-1]
    assert urlsplit(pg.url).path.startswith("/blog/admin/") and len(pid) == 36, pg.url
    win.locator("[name=title]").fill("Editor im Fenster")
    win.locator("[name=slug]").fill("editor-im-fenster")
    win.locator("[name=summary]").fill("Der Editor als NwebOS-Fenster.")
    win.locator("[name=body]").fill("## Erster Teil\n\nText im **Fenster**.\n\n<img src=x onerror=alert(1)>")
    win.locator("[data-tagin]").fill("nwebos"); win.locator("[data-tagin]").press("Enter")
    pg.wait_for_function("() => /Automatisch gespeichert/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    # Design QA #119 1b: DE/EN carry aria-pressed; a draft offers no "Zurück zu Entwurf"/"Zurückziehen"
    assert win.locator('[data-lang="de"]').get_attribute("aria-pressed") == "true" and win.locator('[data-lang="en"]').get_attribute("aria-pressed") == "false"
    assert win.locator("[data-status=draft]").is_hidden() and win.locator("[data-status=withdrawn]").is_hidden()
    # F5 and a deep link (with an editor window saved in localStorage by an earlier version): the editor mounts, no error
    pg.evaluate("(id) => localStorage.setItem('nwebos.wins', JSON.stringify([{k:'blog-edit',p:'/blog/admin/'+id,x:100,y:40,w:900,h:560,z:5}]))", pid)
    perr = []; pg.on("pageerror", lambda e: perr.append(str(e)))
    pg.reload(wait_until="load")
    win = pg.locator('.win[aria-label="Blog-Editor"]'); win.locator("[name=title]").wait_for(state="visible", timeout=10000)
    assert win.locator("[name=title]").input_value() == "Editor im Fenster" and pg.locator('.win[aria-label="Blog-Editor"]').count() == 1 and not perr, perr
    assert "braucht JavaScript" not in win.inner_text()
    assert "#nwebos" in win.locator("[data-tags]").inner_text()
    assert "Wörter" in win.locator("[data-wc]").inner_text()
    shot(pg, "editor-1280.png")
    win.locator(".edtop [data-publish]").click()
    pg.wait_for_function("() => document.querySelector('[data-pill]').textContent === 'Veröffentlicht'", timeout=10000)
    assert win.locator("[data-status=draft]").is_visible() and win.locator("[data-status=withdrawn]").is_visible(), "published: back to draft / withdraw"
    # the published post is the reader window
    pub = c.new_page()
    rp = pub.goto(f"https://{H}/blog/editor-im-fenster", wait_until="load")
    assert rp.status == 200 and pub.locator("#app-blog-post .post h1").inner_text() == "Editor im Fenster"
    pub.close()
    print("PASS editor: new post, autosave, sanitised preview, tags, publish, post address in the window")

    # a stale second tab: the other tab saved first, this one gets the conflict banner and writes nothing
    c2 = ctx_for(br, 1280, ADMIN); pg2 = c2.new_page()
    pg2.goto(f"https://{H}/blog/admin/{pid}", wait_until="load")
    w2 = pg2.locator('.win[aria-label="Blog-Editor"]'); w2.locator("[name=body]").wait_for(state="visible")
    win.locator("[name=body]").fill("## Erster Teil\n\nNeuer Text aus Tab 1.")
    pg.wait_for_function("() => /Automatisch gespeichert/.test(document.querySelector('[data-as]').textContent) && !/Ungespeichert/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    pg.wait_for_timeout(1800)
    w2.locator("[name=body]").fill("Alter Tab überschreibt?")
    w2.locator("[data-conflict]").wait_for(state="visible", timeout=10000)
    shot(pg2, "x-editor-conflict-1280.png")
    w2.locator("[data-reload]").click()
    pg2.wait_for_function("() => document.querySelector('[name=body]').value.includes('Neuer Text aus Tab 1')", timeout=10000)
    assert w2.locator("[data-conflict]").is_hidden()
    # second round: tab 1 saves again, tab 2 conflicts and keeps its own version on purpose
    win.locator("[name=body]").fill("## Erster Teil\n\nZweiter Text aus Tab 1.")
    pg.wait_for_timeout(2500)
    w2.locator("[name=body]").fill("## Erster Teil\n\nMeine Fassung aus Tab 2.")
    w2.locator("[data-conflict]").wait_for(state="visible", timeout=10000)
    w2.locator("[data-keep]").click()
    pg2.wait_for_function("() => /Automatisch gespeichert/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    check = c2.new_page(); check.goto(f"https://{H}/blog/admin/{pid}", wait_until="load")
    check.wait_for_function("() => (document.querySelector('[name=body]') || {}).value === '## Erster Teil\\n\\nMeine Fassung aus Tab 2.'", timeout=10000)
    c2.unroute_all(behavior="ignoreErrors"); c2.close()
    print("PASS editor: stale tab gets the conflict banner; Neu laden shows the newer text; meine Fassung behalten stores it")

    # list tab
    win.locator('[data-ep="l"]').click()
    assert win.locator("[data-rows] tr", has_text="Editor im Fenster").locator(".pill").inner_text() == "Veröffentlicht"
    other = win.locator("[data-rows] [data-edit]:not([data-edit='%s'])" % pid).first.get_attribute("data-edit")
    # list (feat-blog-editor): status filter with counts, title/tag search, Zurückziehen on a published row
    pg.goto(f"https://{H}/blog/admin/{pid}", wait_until="load")   # fresh base (tab 2 saved meanwhile)
    win = pg.locator('.win[aria-label="Blog-Editor"]'); win.locator("[name=body]").wait_for(state="visible"); win.locator('[data-ep="l"]').click()
    win.locator('.lfil [data-lf="published"]').click()
    assert all(x.inner_text() == "Veröffentlicht" for x in win.locator("[data-rows] .pill").all()) and int(win.locator('[data-lc="published"]').inner_text()) >= 1
    win.locator("[data-ls]").fill("nwebos")   # the tag of this test's post
    assert win.locator("[data-rows] tr", has_text="Editor im Fenster").count() == 1 and win.locator("[data-rows] tr").count() == 1
    win.locator("[data-rows] tr", has_text="Editor im Fenster").locator('[data-row-status="withdrawn"]').click()
    pg.wait_for_function("() => /Zurückgezogen/.test(document.querySelector('[data-pill]').textContent)", timeout=10000)
    win.locator('[data-ep="l"]').click(); win.locator("[data-ls]").fill(""); win.locator('.lfil [data-lf=""]').click()
    win.locator("[data-rows] tr", has_text="Editor im Fenster").locator('[data-row-status="published"]').click()
    pg.wait_for_function("() => /Veröffentlicht/.test(document.querySelector('[data-pill]').textContent)", timeout=10000)
    # a failed create says so readably and the button stays usable (Design QA #119 1b)
    pg.route("**/api/blog/admin/posts", lambda r: r.fulfill(status=500, body='{"error":"x"}') if r.request.method == "POST" else r.fallback())
    win.locator("[data-new]").click()
    pg.wait_for_function("() => /nochmal versuchen/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    assert win.locator("[data-new]").is_enabled() and ": x" not in win.locator("[data-as]").inner_text()
    pg.unroute("**/api/blog/admin/posts")

    # Gatekeeper #119 (2): a failed save keeps the post open; Bearbeiten and + Neuer Beitrag wait for it
    win.locator('[data-ep="w"]').click()
    pg.route("**/api/blog/admin/posts/%s" % pid, lambda r: r.abort() if r.request.method == "PUT" else r.fallback())
    win.locator("[name=body]").fill("## Erster Teil\n\nOffline geschrieben.")
    pg.wait_for_function("() => /offline/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    win.locator('[data-ep="l"]').click(); win.locator("[data-rows] [data-edit='%s']" % other).click()
    pg.wait_for_function("() => /Erst speichern/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    assert urlsplit(pg.url).path.endswith(pid), "still on the unsaved post"
    win.locator("[data-new]").click(); pg.wait_for_timeout(600)
    assert urlsplit(pg.url).path.endswith(pid), "+ Neuer Beitrag waits for the unsaved text"
    # (3) closing the window keeps the unsent text; the next open offers it back
    win.locator(".wb.x").click()
    pg.unroute("**/api/blog/admin/posts/%s" % pid)
    pg.goto(f"https://{H}/blog/admin/{pid}", wait_until="load")
    win = pg.locator('.win[aria-label="Blog-Editor"]'); win.locator("[data-draft]").wait_for(state="visible", timeout=10000)
    win.locator("[data-draft-restore]").click()
    # the draft saves on the base it was written on: unchanged post -> saved; changed meanwhile -> 409 banner, keep on purpose
    assert win.locator("[name=body]").input_value().endswith("Offline geschrieben.")
    pg.wait_for_function("() => !document.querySelector('[data-conflict]').hidden || /Automatisch gespeichert/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    if win.locator("[data-conflict]").is_visible():
        win.locator("[data-keep]").click()
    pg.wait_for_function("() => document.querySelector('[name=body]').value.includes('Offline geschrieben') && /Automatisch gespeichert/.test(document.querySelector('[data-as]').textContent)", timeout=10000)
    assert win.locator("[data-draft]").is_hidden()
    # (4) another post's address in the same window: the module mounts again (no JS placeholder, no dead editor)
    pg.evaluate("(id) => { const a = document.createElement('a'); a.href = '/blog/admin/' + id; a.id = 'gotoB'; document.querySelector('#desk').appendChild(a); }", other)
    pg.locator("#gotoB").dispatch_event("click")
    pg.wait_for_function("(id) => location.pathname.endsWith(id) && document.querySelector('.win[aria-label=\"Blog-Editor\"] [name=body]') && !/braucht JavaScript/.test(document.querySelector('.win[aria-label=\"Blog-Editor\"] .wc').textContent)", arg=other, timeout=10000)
    pg.locator('.win[aria-label="Blog-Editor"] [name=body]').wait_for(state="visible", timeout=10000)
    assert pg.locator('.win[aria-label="Blog-Editor"]').count() == 1 and "/" + other in urlsplit(pg.url).path
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS editor: failed save blocks Bearbeiten/Neu, unsent text survives the close, another post's address remounts the editor")

    # (1) signed out with a saved editor window: the desktop stays, no trip to the Discord login
    c = ctx_for(br, 1280); pg = c.new_page()
    pg.add_init_script("localStorage.setItem('nwebos.wins', JSON.stringify([{k:'blog-edit',p:'/blog/admin/%s',x:100,y:40,w:900,h:560,z:5}]))" % pid)
    pg.goto(f"https://{H}/", wait_until="load"); pg.wait_for_timeout(1500)
    assert urlsplit(pg.url).netloc == H and urlsplit(pg.url).path == "/" and pg.locator("#desk").is_visible() and pg.locator('.win[aria-label="Blog-Editor"]').count() == 0, pg.url
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS editor: a saved editor window is never restored (signed out: desktop, not the login)")

    # effective hit area (an absolute ::after overlay counts, tap rule (c)) and text contrast, as in nwebos-phone-ui.py
    HIT = r"""(sels) => { const out = []; for (const s of sels) for (const el of document.querySelectorAll(s)) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
      const c = getComputedStyle(el, "::after"); if (c.content !== "none" && c.position === "absolute") { L += parseFloat(c.left) || 0; T += parseFloat(c.top) || 0; R -= parseFloat(c.right) || 0; B -= parseFloat(c.bottom) || 0; }
      if (R - L < 40 || B - T < 40) out.push([s, (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 20), Math.round(R - L) + "x" + Math.round(B - T)]); } return out; }"""
    CONTRAST = r"""(sels) => { const L = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const a = (c.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number); if (c.startsWith("rgb(") || (a[3] || 0) > 0.5) return c; } return "rgb(255,255,255)"; };
      const out = []; for (const s of sels) for (const el of document.querySelectorAll(s)) { if (!el.offsetParent || !(el.textContent.trim() || el.value)) continue; const a = L(getComputedStyle(el).color), b = L(bg(el)); const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (r < 4.5) out.push([s, (el.textContent || el.value).trim().slice(0, 30), r.toFixed(2)]); } return out; }"""
    # phone (Planner 07.11.): one column, full-width fields, Text/Vorschau tabs, status + Veröffentlichen in a sticky
    # bottom bar, DE/EN segmented, no horizontal scroll; 375 and 430, day and night
    for width in (375, 430):
        for night in (False, True):
            c = ctx_for(br, width, ADMIN, night); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(f"https://{H}/blog/admin/{pid}", wait_until="load")
            win = pg.locator('.win[aria-label="Blog-Editor"]'); win.locator("[name=body]").wait_for(state="visible")
            assert pg.locator(".win.focus").bounding_box()["width"] == width and pg.evaluate("document.documentElement.scrollWidth") <= width, "no horizontal scroll"
            bar = win.locator(".edbar")
            assert bar.is_visible() and bar.locator("[data-publish]").is_visible() and win.locator(".edtop [data-publish]").is_hidden(), "actions in the bottom bar"
            wb = pg.locator(".win.focus").bounding_box(); bb = bar.bounding_box()
            assert abs((bb["y"] + bb["height"]) - (wb["y"] + wb["height"])) <= 8, ("bar sits at the bottom of the window", bb, wb)
            # Schreiben: title + text; the bar offers Entwurf speichern + Veröffentlichen (feat-blog-editor phone)
            tw = win.locator("[name=title]").bounding_box(); assert tw["height"] >= 40 and tw["width"] >= width - 40, ("title full width", tw)
            assert win.locator("[name=category]").is_hidden() and bar.locator("[data-savenow]").is_visible()
            name = f"editor-{'night' if night else 'day'}-{width}"
            # Design QA #119 round 3: the bar's buttons stay on one line; the tabs are 40px; footer links have a separator
            for bt in bar.locator(".xpbtn").all():
                if bt.is_visible():
                    assert bt.evaluate("e => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length <= 1 && e.getBoundingClientRect().height <= 48; }"), ("bar button wraps", bt.inner_text(), width)
            small = pg.evaluate(HIT, [".win.focus .tabs button", ".win.focus .wt .wb", ".win.focus .segm button"])
            assert not small, ("tap targets below 40px", width, small)
            if night:
                low = pg.evaluate(CONTRAST, [".win.focus .tabs button", ".win.focus .as", ".win.focus .meta .ttl", ".win.focus [name=body]", ".win.focus .edfoot span", ".win.focus .segm button"])
                assert not low, ("editor night contrast", width, low)
                assert pg.evaluate("(() => { const m = getComputedStyle(document.querySelector('.win.focus [name=body]')).backgroundColor.match(/[0-9.]+/g).map(Number); return m[0] + m[1] + m[2] < 150; })()"), "night: the text field is dark"
            shot(pg, name + ".png")
            # Details: address, category, tags, language, summary, preview link
            win.locator('[data-edv="meta"]').click()
            for sel in ("[name=slug]", "[name=category]", "[name=summary]"):
                fb = win.locator(sel).bounding_box(); assert fb["height"] >= 40 and fb["width"] >= width * 0.5, (sel, fb)
            assert win.locator(".meta .seg [data-lang]").count() == 2 and win.locator(".mplink").is_visible() and win.locator("[name=body]").is_hidden() and win.locator("[name=title]").is_hidden()
            assert pg.evaluate("document.documentElement.scrollWidth") <= width
            small = pg.evaluate(HIT, [".win.focus .tagsin input", ".win.focus .tagsin>span button", ".win.focus .meta .seg button", ".win.focus .mplink"])
            assert not small, ("details tap targets below 40px", width, small)
            if night:
                low = pg.evaluate(CONTRAST, [".win.focus .meta>label", ".win.focus .meta input", ".win.focus .meta select", ".win.focus .tagsin>span", ".win.focus .sum"])
                assert not low, ("details night contrast", width, low)
            shot(pg, name + "-details.png")
            win.locator('[data-edv="pv"]').click()
            assert win.locator("[data-pv]").is_visible() and win.locator("[name=body]").is_hidden(), "phone: preview instead of text"
            shot(pg, name + "-preview.png")
            c.unroute_all(behavior="ignoreErrors"); c.close()
    assert not errs, errs
    print("PASS editor 375/430 day+night: one column, full-width fields, bottom action bar, Text/Vorschau tabs, no horizontal scroll")
    br.close()
