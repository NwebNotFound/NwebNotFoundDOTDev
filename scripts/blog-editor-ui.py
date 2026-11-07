#!/usr/bin/env python3
"""Blog editor in a real browser as the admin (cookie from e2e.mjs): new post, type, autosave,
live preview (server-sanitised), publish, then the public page shows it. A second, stale tab gets
a conflict instead of overwriting. Args: BASE COOKIE (name=value)."""
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE, COOKIE = sys.argv[1], sys.argv[2]
H = "nwebnotfound.dev"
name, val = COOKIE.split("=", 1)

with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"  # CI container; elsewhere Playwright's own Chromium
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_cookies([{"name": name, "value": unquote(val), "domain": H, "path": "/", "secure": True, "httpOnly": True}])

    def route(r):
        u = urlsplit(r.request.url)
        if u.netloc != H:
            r.abort()
            return
        h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}
        h["host"] = "mc.nwebnotfound.dev"  # wrangler dev rewrites Origin unless Host is the --local-upstream host
        h["x-nnf-test-host"] = H
        r.fulfill(response=r.fetch(url=BASE + u.path + ("?" + u.query if u.query else ""), headers=h, max_redirects=0))

    ctx.route("**/*", route)
    pg = ctx.new_page()
    pg.goto(f"https://{H}/blog/admin", wait_until="load")
    # A rejected create request is announced in the status line and the same button retries (Design QA #106).
    fail = {"on": True}
    def flaky(r):
        if fail["on"] and r.request.method == "POST": r.abort()
        else: r.fallback()
    ctx.route("**/api/blog/admin/posts", flaky)
    nb = pg.get_by_role("button", name="Neuer Beitrag"); nb.click()
    pg.wait_for_function("() => document.querySelector('[data-blog-state]').textContent.includes('nochmal versuchen')")
    assert nb.is_enabled() and pg.url.rstrip("/").endswith("/blog/admin"), "failed create: error shown, button usable again"
    fail["on"] = False
    pg.get_by_role("button", name="Neuer Beitrag").click()
    pg.wait_for_url("**/blog/admin/*")
    pg.wait_for_function("() => document.querySelector('[data-blog-state]').textContent === 'Geladen'")
    edit_url = pg.url
    # The DE/EN switch is a plain toggle-button pair, not a half-built tab widget.
    assert pg.locator("[role=tab], [role=tablist]").count() == 0 and pg.locator("[data-tab=de]").get_attribute("aria-pressed") == "true"
    pg.locator("[data-tab=en]").click()
    assert pg.locator("[data-tab=en]").get_attribute("aria-pressed") == "true" and pg.locator("[data-tab=de]").get_attribute("aria-pressed") == "false"
    pg.locator("[data-tab=de]").click()
    pg.fill("[name=title_de]", "UI Testbeitrag")
    pg.fill("[name=slug]", "ui-testbeitrag")
    pg.fill("[name=tags]", "ui, test")
    pg.fill("[name=body_de]", "## Erster Teil\n\nText mit <img src=x onerror=alert(1)>\n\n## Zweiter Teil")
    pg.wait_for_function("() => document.querySelector('[data-blog-state]').textContent.startsWith('Gespeichert')", timeout=15000)
    pg.wait_for_function("() => document.querySelectorAll('[data-blog-toc] li').length === 2", timeout=10000)
    assert pg.locator("[data-blog-preview] h2#h-erster-teil").count() == 1
    assert pg.locator("[data-blog-preview] img").count() == 0, "preview must not render raw HTML"
    # A stale second tab: its save is refused with a conflict, the first tab's text survives.
    stale = ctx.new_page()
    stale.goto(edit_url, wait_until="load")
    stale.wait_for_function("() => document.querySelector('[data-blog-state]').textContent === 'Geladen'")
    pg.fill("[name=summary_de]", "Neuer als der zweite Tab")
    pg.wait_for_function("() => document.querySelector('[data-blog-state]').textContent.startsWith('Gespeichert')", timeout=15000)
    pg.wait_for_timeout(300)
    stale.fill("[name=summary_de]", "Alt")
    stale.wait_for_function("() => document.querySelector('[data-blog-state]').textContent.startsWith('Konflikt')", timeout=15000)
    # The stale tab can't publish after its save was rejected (Gatekeeper #106 review).
    stale.get_by_role("button", name="Veröffentlichen").click()
    stale.wait_for_function("() => document.querySelector('[data-blog-state]').textContent.startsWith('Status nicht geändert')", timeout=10000)
    anon = br.new_context()   # signed out: the admin would also see the draft
    anon.route("**/*", route)
    probe = anon.new_page()
    assert probe.goto(f"https://{H}/blog/ui-testbeitrag", wait_until="load").status == 404, "stale tab published the post"
    anon.unroute_all(behavior="ignoreErrors"); anon.close()
    stale.close()
    # Typing and publishing at once: the status waits for the save, so the latest text goes live.
    pg.fill("[name=body_de]", "## Erster Teil\n\nText mit <img src=x onerror=alert(1)>\n\n## Zweiter Teil\n\nLetzter Satz kurz vor dem Klick.")
    pg.get_by_role("button", name="Veröffentlichen").click()
    pg.wait_for_function("() => document.querySelector('[data-blog-status]').textContent === 'published'", timeout=10000)
    pub = ctx.new_page()
    pub.goto(f"https://{H}/blog/ui-testbeitrag", wait_until="load")
    # the public post is the NwebOS reader window (src/nwebos-apps.js)
    post = pub.locator("#app-blog-post")
    assert post.locator(".post h1").inner_text() == "UI Testbeitrag"
    assert post.locator(".toc li").count() == 2 and post.locator("img[src=x]").count() == 0
    assert "Letzter Satz kurz vor dem Klick." in post.inner_text(), "publish raced the pending save"
    # the blog window filters in place: the tag search keeps exactly this post (card or row) visible
    pub.goto(f"https://{H}/blog", wait_until="load")
    pub.locator(".win.focus [data-bq]").fill("test")
    hits = pub.locator(".win.focus [data-q]:visible")
    assert hits.count() == 1 and hits.locator('a[href="/blog/ui-testbeitrag"]').count() >= 1, "search by tag finds it"
    # A status request that fails on the network: message shown, buttons usable again (Gatekeeper #106).
    pg.route("**/status", lambda r: r.abort())
    pg.get_by_role("button", name="Zurückziehen").click()
    pg.wait_for_function("() => document.querySelector('[data-blog-state]').textContent.includes('offline')", timeout=10000)
    assert pg.evaluate("[...document.querySelectorAll('[data-set-status]')].every(b => !b.disabled)"), "status buttons stuck disabled"
    assert pg.locator("[data-blog-status]").inner_text() == "published"
    pg.unroute("**/status")
    # Withdraw again so later checks see an unchanged blog.
    pg.get_by_role("button", name="Zurückziehen").click()
    pg.wait_for_function("() => document.querySelector('[data-blog-status]').textContent === 'withdrawn'", timeout=10000)
    print("PASS blog editor: new, autosave, preview, conflict, publish, search, withdraw")
    ctx.unroute_all(behavior="ignoreErrors")
    ctx.close()
    br.close()
