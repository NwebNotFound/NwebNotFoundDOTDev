#!/usr/bin/env python3
"""NwebOS "Mein Profil" v3 (mockups/nwebos/apps/profile-v3/notes.md) in a real browser: tabs, stat tiles, the settings
list (switches, theme segment, RSS sheet, delete sheet), the guest-stats merge card, the signed-out tile and the entry
points (home icon, start-menu tile). 375/430 day+night and 1280; no horizontal scroll, stat contrast >= 7:1.
The signed-in settings it changes are put back at the end. Args: BASE COOKIE [SHOTS_DIR]."""
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE, COOKIE = sys.argv[1], sys.argv[2]
SHOTS = (sys.argv[3] if len(sys.argv) > 3 else "") or os.environ.get("E2E_SCREENS_DIR", "")
H = "nwebnotfound.dev"
GIF = bytes.fromhex("47494638396101000100800000ffd23f00000021f90401000000002c000000000100010000020144003b")
CONTRAST = r"""(sels) => { const L = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const a = (c.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number); if (c.startsWith("rgb(") || (a[3] || 0) > 0.5) return c; } return "rgb(255,255,255)"; };
  const out = []; for (const [s, min] of sels) for (const el of document.querySelectorAll(s)) { if (!el.offsetParent || !el.textContent.trim()) continue; const a = L(getComputedStyle(el).color), b = L(bg(el)); const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (r < min) out.push([s, el.textContent.trim().slice(0, 20), r.toFixed(2)]); } return out; }"""


def ctx_for(br, width, night=False, signed=True, extra=""):
    phone = width < 700
    c = br.new_context(viewport={"width": width, "height": 812 if phone else 800}, device_scale_factor=2 if phone else 1, has_touch=phone, is_mobile=phone)
    if signed:
        n, v = COOKIE.split("=", 1)
        c.add_cookies([{"name": n, "value": unquote(v), "domain": H, "path": "/", "secure": True, "httpOnly": True}])
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','%s');%s%s}catch(e){}" % ("me" if signed else "gast", "localStorage.setItem('summer-theme','summer-night');" if night else "", extra))

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


def tab(pg, k):
    pg.locator(f'.win.focus .p3-tabs [data-pane="p3-{k}"]').click(); pg.wait_for_timeout(150)


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    errs = []
    # every width/theme: layout, tabs, contrast, shots (read-only)
    for width, night in ((375, False), (375, True), (430, False), (430, True), (1280, False), (1280, True)):
        c = ctx_for(br, width, night); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"https://{H}/profile", wait_until="load"); pg.locator(".win.focus [data-p3]").wait_for(); pg.wait_for_timeout(500)
        nm = f"profile3-{width}-{'night' if night else 'day'}"
        assert pg.evaluate("document.documentElement.scrollWidth") <= width, (nm, "horizontal scroll")
        assert pg.locator(".win.focus .p3-stat").count() == 4 and pg.locator(".win.focus .p3-tabs [role=tab]").count() == 4, nm
        low = pg.evaluate(CONTRAST, [[".win.focus .p3-stat b", 7], [".win.focus .p3-stat", 4.5], [".win.focus .p3-card h3", 4.5], [".win.focus .p3-tabs button", 4.5], [".win.focus .p3-priv", 4.5]])
        assert not low, (nm, "contrast", low)
        shot(pg, nm + "-overview.png")
        for k in ("games", "badges", "set"):
            tab(pg, k)
            assert pg.locator(f'.win.focus .p3-tabs [data-pane="p3-{k}"]').get_attribute("aria-selected") == "true" and pg.locator(f".win.focus #p3-{k}").is_visible(), (nm, k)
            assert pg.evaluate("document.documentElement.scrollWidth") <= width, (nm, k, "horizontal scroll")
            if k == "badges":
                low = pg.evaluate(CONTRAST, [[".win.focus .p3-bdg b", 4.5], [".win.focus .p3-bdg small", 4.5]]); assert not low, (nm, "badge contrast", low)
            if k == "set":
                low = pg.evaluate(CONTRAST, [[".win.focus .p3-row b", 4.5], [".win.focus .p3-row small", 4.5], [".win.focus .p3-grp h4", 4.5]]); assert not low, (nm, "settings contrast", low)
            shot(pg, f"{nm}-{k}.png")
        c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 375/430/1280 day+night: 4 stats, 4 tabs, no horizontal scroll, stat contrast >= 7:1, labels >= 4.5:1")

    # interactions (375): "alle Werte" switches to Spiele; switches + theme save to the account; RSS + delete sheets
    c = ctx_for(br, 375); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/profile", wait_until="load"); pg.locator(".win.focus [data-p3]").wait_for(); pg.wait_for_function("() => window.__me && window.__me.user")
    pg.locator('.win.focus [data-p3-tab="games"]').click(); pg.wait_for_timeout(150)
    assert pg.locator(".win.focus #p3-games").is_visible(), "alle Werte -> Spiele"
    tab(pg, "set")
    sw = pg.locator('.win.focus [data-p3-pref="sound"]'); before = sw.get_attribute("aria-checked")
    sw.click(); pg.wait_for_timeout(400)
    assert sw.get_attribute("aria-checked") != before and pg.evaluate("NwebOS.prefs().sound") == (before != "true"), "the sound switch mutes/unmutes"
    pg.locator('.win.focus [data-p3-theme="night"]').click(); pg.wait_for_timeout(400)
    assert pg.evaluate("document.documentElement.dataset.theme") == "summer-night", "theme segment -> night"
    saved = pg.evaluate("fetch('/api/me').then(r => r.json()).then(j => j.user.prefs)")
    assert saved and saved["theme"] == "night" and saved["sound"] == (0 if before == "true" else 1), ("saved to the account", saved)
    hit = pg.evaluate("(() => { const s = document.querySelector('.win.focus [data-p3-pref=sound]'); const r = s.getBoundingClientRect(); const c = getComputedStyle(s, '::after'); return [r.width - parseFloat(c.left) - parseFloat(c.right), r.height - parseFloat(c.top) - parseFloat(c.bottom)]; })()")
    assert hit[0] >= 44 and hit[1] >= 44, ("switch hit area", hit)
    pg.locator('.win.focus .p3-row[data-sub="blog"]').click(); pg.locator(".shx.sub").wait_for()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    pg.locator(".win.focus button[data-pf-delete]").click(); ask = pg.locator(".shx.ask"); ask.wait_for()
    assert "Spiele" in ask.inner_text() and "Abzeichen" in ask.inner_text(), "delete sheet lists games and badges"
    shot(pg, "profile3-375-delete-sheet.png")
    ask.locator("[data-x]").click(); pg.wait_for_timeout(150)
    # put the account's settings back (the other browser tests use the same session)
    pg.evaluate("fetch('/api/profile/prefs', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: 'day', sound: true, boot: true, reduced_motion: false }) })"); pg.wait_for_timeout(300)
    # entry points: the first home icon and the start-menu tile
    pg.locator("[data-home]").click(); pg.wait_for_timeout(300)
    assert pg.locator("[data-p3i] span").last.inner_text() == "Mein Profil" and pg.locator("[data-p3i] img").count() == 1, "home icon: Mein Profil with the avatar"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 375 signed in: tab links, switches + theme saved to the account, switch hit area >= 44, RSS and delete sheets, home icon")

    # taskbar day/night + sound toggles (1280) save to the account: after a reload with local storage cleared they stay
    c = ctx_for(br, 1280); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/", wait_until="load"); pg.wait_for_function("() => window.__me && window.__me.user"); pg.wait_for_timeout(300)
    assert pg.evaluate("document.documentElement.dataset.theme") == "summer-day", "starts at day (put back above)"
    pg.locator("#thm").click(); pg.locator("#snd").click(); pg.wait_for_timeout(600)
    saved = pg.evaluate("fetch('/api/me').then(r => r.json()).then(j => j.user.prefs)")
    assert saved and saved["theme"] == "night" and saved["sound"] == 0, ("taskbar toggles saved to the account", saved)
    pg.evaluate("localStorage.removeItem('summer-theme'); localStorage.removeItem('nwebos.mute')")
    pg.reload(wait_until="load"); pg.wait_for_function("() => window.__me && window.__me.user"); pg.wait_for_timeout(400)
    assert pg.evaluate("document.documentElement.dataset.theme") == "summer-night" and pg.evaluate("NwebOS.prefs().sound") is False, "after reload: night and muted from the account"
    pg.evaluate("fetch('/api/profile/prefs', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: 'day', sound: true }) })"); pg.wait_for_timeout(300)
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 taskbar: day/night and sound toggles saved to the account and kept after a reload")

    # guest stats from before the sign-in: the merge card, "Verwerfen" removes them
    c = ctx_for(br, 375, extra="localStorage.setItem('nwebos.five.stats.guest', JSON.stringify({played:3,won:2,streak:1,best:2,variant:'de'}));")
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/profile", wait_until="load"); pg.locator(".win.focus [data-p3]").wait_for(); tab(pg, "games")
    card = pg.locator(".win.focus [data-p3-merge]"); card.wait_for()
    assert "3 Runden Fünf" in card.inner_text(), card.inner_text()
    shot(pg, "profile3-375-games-local-merge.png")
    card.locator("[data-p3-merge-no]").click(); pg.wait_for_timeout(150)
    assert card.is_hidden() and pg.evaluate("localStorage.getItem('nwebos.five.stats.guest')") is None, "discard removes the local stats"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    # "Übernehmen": 200 (first merge of the account) or 409 (already merged) — either way the local guest stats are
    # gone and the card does not come back after a reload
    c = ctx_for(br, 375); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/profile", wait_until="load"); pg.locator(".win.focus [data-p3]").wait_for()
    pg.evaluate("localStorage.setItem('nwebos.mines.stats.guest', JSON.stringify({played:2,won:1,best:70})); localStorage.setItem('nwebos.five.stats.guest', JSON.stringify({played:1,won:1,streak:1,best:1,variant:'de'}))")
    pg.reload(wait_until="load"); pg.locator(".win.focus [data-p3]").wait_for(); tab(pg, "games")
    card = pg.locator(".win.focus [data-p3-merge]"); card.wait_for()
    with pg.expect_response(lambda r: r.url.endswith("/api/profile/games/merge")) as resp:
        card.locator("[data-p3-merge-yes]").click()
    st = resp.value.status; pg.wait_for_timeout(1200)
    assert st in (200, 409), ("merge status", st)
    pg.reload(wait_until="load"); pg.locator(".win.focus [data-p3]").wait_for(); tab(pg, "games"); pg.wait_for_timeout(300)
    assert pg.locator(".win.focus [data-p3-merge]").is_hidden(), ("merge card back after reload", st)
    assert pg.evaluate("[localStorage.getItem('nwebos.mines.stats.guest'), localStorage.getItem('nwebos.five.stats.guest')]") == [None, None], ("guest stats kept", st)
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print(f"PASS guest stats: merge card with the count, Verwerfen removes them, Übernehmen ({st}) clears them and the card stays away after a reload")

    # the guestbook paper's date stamp never covers the message (short + long text, 375/390), ink >= 4.5:1
    for width in (375, 390):
        c = ctx_for(br, width); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"https://{H}/profile", wait_until="load"); pg.locator(".win.focus [data-p3]").wait_for()
        if pg.locator(".win.focus .p3-paper .stamp").count() == 0:   # no entry for this account: build the card's markup
            pg.evaluate("""(() => { const d = document.createElement('div'); d.className = 'p3-paper paper'; d.innerHTML = '<span class="stamp">07.11.2026</span><p>x</p><small>– Test</small>'; document.querySelector('.win.focus #p3-over').prepend(d); })()""")
        for msg in ("Hi!", "Hallo Nils, das ist ein Test, ein ziemlich langer Gästebucheintrag, damit man sieht, wo der Stempel landet."):
            hit = pg.evaluate("""(msg) => { const pp = document.querySelector('.win.focus .p3-paper'), p = pp.querySelector('p'), s = pp.querySelector('.stamp'); p.textContent = msg;
              const a = s.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(p);
              return [...rg.getClientRects()].filter((b) => b.width > 0 && b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top).length; }""", msg)
            assert hit == 0, (width, msg[:12], "stamp covers the text")
        low = pg.evaluate(CONTRAST, [[".win.focus .p3-paper .stamp", 4.5]]); assert not low, (width, "stamp contrast", low)
        shot(pg, f"profile3-{width}-paper-stamp.png") if width == 375 else None
        c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 375/390: the date stamp never covers the guestbook text (short + long), ink >= 4.5:1")

    # signed out: the Discord tile, the home icon says Anmelden, the start-menu tile too (1280)
    for width in (375, 1280):
        c = ctx_for(br, width, signed=False); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"https://{H}/profile", wait_until="load"); pg.locator(".win.focus .p3-out").wait_for()
        assert pg.locator(".win.focus .p3-out a.xpbtn").get_attribute("href").startswith("/auth/discord/login?next="), "sign-in button"
        shot(pg, f"profile3-{width}-signed-out.png")
        if width == 1280:
            pg.locator(".win.focus .x").click(); pg.wait_for_timeout(200); pg.locator("#startb").click()
            assert "Anmelden" in pg.locator("[data-p3sub]").inner_text()
        else:
            pg.locator("[data-home]").click(); pg.wait_for_timeout(300)
            assert pg.locator("[data-p3i] span").last.inner_text() == "Anmelden"
        c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS signed out: Discord tile, home icon and start-menu tile say Anmelden")
    assert not errs, errs
    br.close()
