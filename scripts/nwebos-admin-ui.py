#!/usr/bin/env python3
"""NwebOS Verwaltung (mockups/nwebos/apps/admin) in a real browser, as the admin and as a non-admin:
overview tiles, projects (create, list, order, delete), news (draft autosave, publish, withdraw, 409 banner, delete),
Startseite form, guestbook moderation, the entry points (✎ Bearbeiten, desktop icon, start menu, quick sheet) and
that none of them exist for anyone else. Everything it creates is deleted again. Args: BASE ADMIN_COOKIE OTHER_COOKIE [SHOTS_DIR]."""
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE, ADMIN, OTHER = sys.argv[1], sys.argv[2], sys.argv[3]
SHOTS = (sys.argv[4] if len(sys.argv) > 4 else "") or os.environ.get("E2E_SCREENS_DIR", "")
H = "nwebnotfound.dev"
GIF = bytes.fromhex("47494638396101000100800000ffd23f00000021f90401000000002c000000000100010000020144003b")


def ctx_for(br, width, cookie, night=False):
    phone = width < 700
    c = br.new_context(viewport={"width": width, "height": 812 if phone else 800}, device_scale_factor=2 if phone else 1, has_touch=phone, is_mobile=phone)
    n, v = cookie.split("=", 1)
    c.add_cookies([{"name": n, "value": unquote(v), "domain": H, "path": "/", "secure": True, "httpOnly": True}])
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','me');%s}catch(e){}" % ("localStorage.setItem('summer-theme','summer-night');" if night else ""))

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


def save_text(pg):
    return pg.locator(".win.focus [data-save]").inner_text()


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    errs = []
    on_err = lambda e: errs.append(str(e))

    # ---- desktop, admin ----
    c = ctx_for(br, 1280, ADMIN); pg = c.new_page(); pg.on("pageerror", on_err)
    pg.goto(f"https://{H}/admin", wait_until="load"); pg.locator(".win.focus .ad-tiles").wait_for(timeout=10000); pg.wait_for_timeout(600)
    assert pg.locator(".win.focus .ad-tile").count() == 9 and pg.locator(".win.focus .wt .ad-tag-adm").count() == 1, "overview: 9 tiles, ADMIN tag in the title"
    assert pg.locator(".win.focus .ad-tile.soon").count() == 3, "Texte, Studio, Pixelwand say 'kommt'"
    shot(pg, "admin-1280-overview.png")

    # projects: create -> visible in the window -> delete -> fallback again
    pg.locator('.win.focus .ad-tile[data-go="projects"]').click(); pg.locator(".win.focus .ad-h").wait_for(); pg.wait_for_timeout(600)
    assert pg.url.endswith("/admin/projects")
    API = lambda m, path, body=None: pg.evaluate("([m, p, b]) => fetch(p, { method: m, credentials: 'include', headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }).then(r => r.json())", [m, path, body])
    seeded = []
    # Planner 08.11.: while the table is empty (site shows the code texts), the editor refuses new rows
    if pg.locator(".win.focus .ad-row").count() == 0:
        assert pg.locator(".win.focus [data-seed-missing]").is_visible() and pg.locator(".win.focus [data-new]").count() == 0, "empty projects table: 'Startdaten fehlen', no + Neu"
        shot(pg, "admin-1280-seed-missing.png")
        pg.goto(f"https://{H}/admin/projects/new", wait_until="load"); pg.locator(".win.focus [data-seed-missing]").wait_for(timeout=10000)
        assert pg.locator('.win.focus [name="title"]').count() == 0, "no form for a new row either"
        seeded.append(("projects", API("POST", "/api/admin/projects", {"title_de": "Seed-Projekt", "status": "live", "progress": 10, "href": "/about", "icon": "about"})["item"]["id"]))
        pg.goto(f"https://{H}/admin/projects", wait_until="load"); pg.locator(".win.focus [data-new]").wait_for(timeout=10000)
        print("PASS empty table: 'Startdaten fehlen', no + Neu, no new form")
    if API("GET", "/api/admin/changelog")["items"] == []:
        seeded.append(("changelog", API("POST", "/api/admin/changelog", {"day": "2026-11-01", "area": "website", "title_de": "Seed-Neuigkeit", "status": "live"})["item"]["id"]))
    n0 = pg.locator(".win.focus .ad-row").count()
    pg.locator(".win.focus [data-new]").click(); pg.locator('.win.focus [name="title"]').wait_for()
    pg.locator('.win.focus [name="title"]').fill("UI-Projekt"); pg.locator('.win.focus [data-seg="status"] [data-v="neu"]').click()
    pg.locator('.win.focus [name="href"]').fill("/blog"); pg.locator('.win.focus [name="text"]').fill("aus dem Browser-Test")
    assert "Nicht gespeichert" in save_text(pg), "typing a live item only keeps a local draft"
    shot(pg, "admin-1280-edit-project.png")
    with pg.expect_response(lambda r: "/api/admin/projects" in r.url and r.request.method == "POST") as rp:
        pg.locator(".win.focus [data-primary]").click()
    assert rp.value.status == 201, ("create", rp.value.status, rp.value.text())
    pg.wait_for_timeout(400)
    assert "/admin/projects/" in pg.url and "Gespeichert" in save_text(pg), ("created", pg.url, save_text(pg))
    pid = pg.url.rsplit("/", 1)[1]
    pg.goto(f"https://{H}/portfolio", wait_until="load"); pg.wait_for_timeout(300)
    assert "UI-Projekt" in pg.locator(".win.focus").inner_text(), "the projects window shows it at once"
    pg.goto(f"https://{H}/admin/projects/{pid}", wait_until="load"); pg.locator(".win.focus [data-del]").wait_for(timeout=10000); pg.wait_for_timeout(300)
    pg.locator(".win.focus [data-del]").click(); sh = pg.locator(".shx.ask"); sh.wait_for()
    assert "UI-Projekt" in sh.inner_text(); shot(pg, "admin-1280-delete-sheet.png")
    sh.locator("[data-yes]").click(); pg.wait_for_timeout(600)
    assert pg.url.endswith("/admin/projects") and pg.locator(".win.focus .ad-row").count() == n0
    print("PASS 1280 admin: overview, project created (window shows it), delete sheet, deleted")

    # news: draft autosaves after 1.5 s, publish -> window, a stale tab gets the banner, withdraw, delete
    pg.goto(f"https://{H}/admin/changelog/new", wait_until="load"); pg.locator('.win.focus [name="title"]').wait_for(timeout=10000)
    pg.locator('.win.focus [name="title"]').fill("UI-Neuigkeit"); pg.locator('.win.focus [name="text"]').fill("Ein Satz aus dem Test.")
    pg.wait_for_timeout(2600)
    assert "Automatisch gespeichert" in save_text(pg) and "/admin/changelog/" in pg.url and not pg.url.endswith("/new"), ("draft autosave", save_text(pg), pg.url)
    nid = pg.url.rsplit("/", 1)[1]
    pg.locator(".win.focus [data-primary]").click(); pg.wait_for_timeout(700)
    assert pg.locator(".win.focus [data-pill]").inner_text().strip() == "Live" and "Veröffentlicht" in pg.locator(".toast").inner_text()
    shot(pg, "admin-1280-news-published.png")
    pg.goto(f"https://{H}/changelog", wait_until="load"); pg.wait_for_timeout(300)
    assert "UI-Neuigkeit" in pg.locator(".win.focus").inner_text()
    pg.goto(f"https://{H}/admin/changelog/{nid}", wait_until="load"); pg.locator('.win.focus [name="title"]').wait_for(timeout=10000); pg.wait_for_timeout(300)
    ver = pg.evaluate(f"fetch('/api/admin/changelog/{nid}').then(r => r.json()).then(j => j.item.version)")
    pg.evaluate(f"fetch('/api/admin/changelog/{nid}', {{ method: 'PATCH', credentials: 'include', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify({{ text_de: 'aus einem anderen Tab', version: {ver} }}) }})")
    pg.locator('.win.focus [name="text"]').fill("Mein Text"); pg.keyboard.press("Control+s"); pg.wait_for_timeout(700)
    assert pg.locator(".win.focus .ad-banner").is_visible(), "409: changed in another tab"
    shot(pg, "admin-1280-news-conflict.png")
    pg.locator(".win.focus .ad-banner button").click(); pg.locator('.win.focus [name="title"]').wait_for(); pg.wait_for_timeout(500)
    assert pg.locator('.win.focus [name="text"]').input_value() == "aus einem anderen Tab"
    pg.locator(".win.focus [data-withdraw]").click(); pg.wait_for_timeout(700)
    assert pg.locator(".win.focus [data-pill]").inner_text().strip() == "Entwurf"
    pg.locator(".win.focus [data-del]").click(); pg.locator(".shx.ask [data-yes]").click(); pg.wait_for_timeout(600)
    assert pg.url.endswith("/admin/changelog")
    print("PASS 1280 news: draft autosave, publish (window), 409 banner + reload, withdraw, delete")
    for sec, sid in seeded:
        API("DELETE", f"/api/admin/{sec}/{sid}")   # back to the empty tables (code fallback) for the later checks

    # Startseite & Über mich: today's texts as the starting point; guestbook moderation hide/unhide
    pg.goto(f"https://{H}/admin/home", wait_until="load"); pg.locator('.win.focus [name="name"]').wait_for(timeout=10000); pg.wait_for_timeout(800)
    assert pg.locator('.win.focus [name="name"]').input_value() == "Nils" and pg.locator(".win.focus [data-fi]").count() == 4
    pg.locator('.win.focus [data-lt="en"]').click(); pg.wait_for_timeout(200)
    assert "Builds" == pg.locator(".win.focus [data-fk]").first.input_value(), "EN tab shows the EN facts"
    shot(pg, "admin-1280-edit-home.png")
    pg.goto(f"https://{H}/admin/guestbook", wait_until="load"); pg.locator('.win.focus [data-gf="all"]').wait_for(timeout=10000)
    pg.locator('.win.focus [data-gf="all"]').click(); pg.wait_for_timeout(500)
    n = pg.locator(".win.focus .ad-msg").count()
    if n:
        pg.locator('.win.focus .ad-msg [data-gh="hide"]').first.click(); pg.wait_for_timeout(600)
        assert pg.locator(".win.focus .ad-msg.hid").count() == 1, "hidden entry is dimmed"
        shot(pg, "admin-1280-guestbook.png")
        pg.locator('.win.focus .ad-msg [data-gh="unhide"]').first.click(); pg.wait_for_timeout(600)
        assert pg.locator(".win.focus .ad-msg.hid").count() == 0
    # ✎ Bearbeiten on About -> the Verwaltung at the texts; desktop icon + start menu entry
    pg.goto(f"https://{H}/about", wait_until="load"); pg.locator(".win.focus .wb.ed").wait_for(timeout=10000)
    assert pg.locator(".dicon.adm").count() == 1 and pg.locator("#startm .adm-sm").count() == 1
    shot(pg, "admin-1280-pencil.png")
    pg.locator(".win.focus .wb.ed").click(); pg.locator('.win.focus [name="name"]').wait_for(timeout=10000)
    assert "/admin/home" in pg.url
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print(f"PASS 1280 Startseite form (DE/EN), guestbook hide/unhide ({n} entries), ✎ About -> Verwaltung, icon + start menu")

    # ---- phones, admin: no horizontal scroll, quick sheet row, the main views ----
    for width, night in ((375, False), (375, True), (430, False)):
        c = ctx_for(br, width, ADMIN, night); pg = c.new_page(); pg.on("pageerror", on_err)
        tag = f"{width}-{'night' if night else 'day'}"
        for path, sel, name in (("/admin", ".ad-tiles", "overview"), ("/admin/home", '[name="name"]', "edit-home"), ("/admin/projects", ".ad-h", "projects"), ("/admin/changelog/new", ".ad-scroll", "edit-news"), ("/admin/guestbook", "[data-gf]", "guestbook")):
            pg.goto(f"https://{H}{path}", wait_until="load"); pg.locator(f".win.focus {sel}").first.wait_for(timeout=10000); pg.wait_for_timeout(500)
            assert pg.evaluate("document.documentElement.scrollWidth") <= width, (tag, path, "horizontal scroll")
            shot(pg, f"admin-{tag}-{name}.png")
        if not night:
            pg.goto(f"https://{H}/about", wait_until="load"); pg.wait_for_timeout(500)
            assert pg.locator(".win.focus .wb.ed").count() == 1
            pg.locator("[data-quick]").click(); pg.locator(".shx.qs").wait_for(); pg.wait_for_timeout(300)
            assert pg.locator(".shx.qs .rows li").first.get_attribute("class") == "adm-q", "quick sheet: Verwaltung first"
            shot(pg, f"admin-{tag}-quick-sheet.png")
        c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 375/430 admin: overview, Startseite, projects, news, guestbook without horizontal scroll; ✎ and quick-sheet row")

    # ---- anyone else: no window, no entry points, no admin CSS ----
    c = ctx_for(br, 1280, OTHER); pg = c.new_page(); pg.on("pageerror", on_err)
    pg.goto(f"https://{H}/admin", wait_until="load"); pg.locator(".win.focus .nf").wait_for(timeout=10000)
    pg.goto(f"https://{H}/about", wait_until="load"); pg.wait_for_timeout(500)
    assert pg.locator(".wb.ed, .dicon.adm, #startm .adm-sm, #adm-q, link[href*='nwebos-admin.css']").count() == 0, "no admin markup for a non-admin"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS non-admin: /admin is the 404 window; no ✎, icon, start-menu entry, quick-sheet row or admin CSS")
    assert not errs, errs
    br.close()
