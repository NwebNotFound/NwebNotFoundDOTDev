#!/usr/bin/env python3
"""Fünf word check in a real browser (Planner: fix/fuenf-word-check, lists from #121): the word list of a language loads
only when Fünf needs it; only listed words count; a word that is not in the list uses no row, shakes it and says
"Kein gültiges Wort" / "Not in word list"; Ä Ö Ü keys in German (screen and keyboard); DE/EN switch starts a new word.
1280 and 375. Args: BASE [SHOTS_DIR]."""
import os
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
SHOTS = (sys.argv[2] if len(sys.argv) > 2 and "=" not in sys.argv[2] else "") or os.environ.get("E2E_SCREENS_DIR", "")
H = "nwebnotfound.dev"


def ctx_for(br, width, seen):
    phone = width < 700
    c = br.new_context(viewport={"width": width, "height": 812 if phone else 800}, device_scale_factor=2 if phone else 1, has_touch=phone, is_mobile=phone)
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','gast')}catch(e){}")

    def route(r):
        u = urlsplit(r.request.url)
        if u.netloc != H:
            r.abort(); return
        if u.path.startswith("/design/fuenf-words-"):
            seen.append(u.path)
        h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}
        h["host"] = "mc.nwebnotfound.dev"; h["x-nnf-test-host"] = H
        r.fulfill(response=r.fetch(url=BASE + u.path + ("?" + u.query if u.query else ""), headers=h, max_redirects=0))

    c.route("**/*", route)
    return c


def shot(pg, name):
    if SHOTS:
        pg.screenshot(path=os.path.join(SHOTS, name))


def row(pg, i):
    return pg.locator(".g-five .fr").nth(i)


def enter_word(pg, w):
    pg.locator(".win.focus").focus()
    for ch in w:
        pg.keyboard.press("Backspace") if ch == "<" else pg.keyboard.type(ch)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(150)


def rated(pg, i):
    return row(pg, i).locator(".t, .o, .s").count()


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    errs = []

    seen = []
    c = ctx_for(br, 1280, seen); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/", wait_until="load"); pg.wait_for_timeout(300)
    assert not seen, ("no word list before Fünf is opened", seen)
    pg.locator("#startb").click(); pg.locator('#startm [data-open="five"]').click()
    pg.wait_for_selector(".g-five .fvgrid .ft")
    pg.wait_for_function("() => performance.getEntriesByType('resource').some(e => e.name.includes('/design/fuenf-words-de.txt'))", timeout=10000)
    assert all("-de.txt" in x for x in seen), ("only the German list", seen)
    # not a word: no row used, the row shakes, the message says so; the letters stay to fix
    enter_word(pg, "qqqqq")
    msg = pg.locator(".g-five .fvmsg")
    assert msg.inner_text() == "Kein gültiges Wort" and "err" in msg.get_attribute("class"), msg.inner_text()
    assert rated(pg, 0) == 0 and row(pg, 0).inner_text().replace("\n", "") == "QQQQQ", "the row is not used up"
    assert "shake" in row(pg, 0).get_attribute("class"), "the row shakes"
    shot(pg, "fuenf-invalid-de-1280.png")
    # fix it into a real word: rated, the message goes, the next row is active
    enter_word(pg, "<<<<<haben")
    assert rated(pg, 0) == 5 and msg.inner_text() in ("", "Geschafft!"), (rated(pg, 0), msg.inner_text())
    # Ä Ö Ü: on the screen keyboard and from the physical keyboard
    for k in "ÄÖÜ":
        assert pg.locator(f'.g-five .kb [data-k="{k}"]').count() == 1, k
    pg.locator('.g-five .kb [data-k="Ä"]').click(); pg.evaluate("k => document.querySelector('.win.focus').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))", "ö")   # a German keyboard's ö key (Playwright would insert text, no keydown)
    assert row(pg, 1).inner_text().replace("\n", "") == "ÄÖ", row(pg, 1).inner_text()
    print("PASS 1280 DE: list loads with Fünf only, invalid word keeps the row + shakes + 'Kein gültiges Wort', valid word rated, Ä/Ö/Ü keys")
    # English: a new word, its own list, no umlauts
    pg.locator(".g-five [data-v=en]").click(); pg.wait_for_timeout(100)
    assert rated(pg, 0) == 0 and row(pg, 0).inner_text().strip() == "", "switching the language starts a new word"
    assert pg.locator('.g-five .kb [data-k="Ä"]').count() == 0 and pg.locator(".g-five .kb [data-k=Y]").count() == 1
    pg.wait_for_function("() => performance.getEntriesByType('resource').some(e => e.name.includes('/design/fuenf-words-en.txt'))", timeout=10000)
    pg.evaluate("k => document.querySelector('.win.focus').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))", "ä"); assert row(pg, 0).inner_text().strip() == "", "no umlauts in English"
    enter_word(pg, "zzzzz")
    assert msg.inner_text() == "Not in word list" and rated(pg, 0) == 0
    shot(pg, "fuenf-invalid-en-1280.png")
    enter_word(pg, "<<<<<about")
    assert rated(pg, 0) == 5, "valid English word rated"
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 1280 EN: new word on switch, English list, 'Not in word list', valid word rated")

    # phone: from the home screen; the German keyboard (11 keys a row) fits, the error shows
    seen = []
    c = ctx_for(br, 375, seen); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"https://{H}/", wait_until="load"); pg.wait_for_timeout(300)
    pg.locator('.dicon[data-open="five"]').click(); pg.wait_for_selector(".g-five .fvgrid .ft")
    pg.wait_for_function("() => performance.getEntriesByType('resource').some(e => e.name.includes('/design/fuenf-words-de.txt'))", timeout=10000)
    for ch in "QQQQQ":
        pg.locator(f'.g-five .kb [data-k="{ch}"]').click()
    pg.locator('.g-five .kb [data-k="↵"]').click(); pg.wait_for_timeout(150)
    assert pg.locator(".g-five .fvmsg").inner_text() == "Kein gültiges Wort" and rated(pg, 0) == 0
    w = pg.evaluate("(() => { const k = document.querySelector('.g-five .kb'); const rows = [...k.children].map(d => d.scrollWidth); return [Math.max(...rows), k.clientWidth, document.documentElement.scrollWidth]; })()")
    assert w[0] <= w[1] + 1 and w[2] <= 375, ("keyboard fits (1px sub-pixel rounding)", w)
    small = pg.evaluate("[...document.querySelectorAll('.g-five .kb button')].filter(b => b.getBoundingClientRect().width < 30 || b.getBoundingClientRect().height < 48).length")
    assert small == 0, ("keys stay tappable (>= 30x48, rows of 10 at most)", small)
    assert pg.evaluate("Math.max(...[...document.querySelectorAll('.g-five .kb div')].map(d => d.children.length))") <= 10, "phone: at most 10 keys a row (Ä Ö Ü in their own row)"
    # no dead zone: the point between two neighbouring keys hits one of them
    gapHit = pg.evaluate("(() => { const a = document.querySelector('.g-five .kb [data-k=Q]').getBoundingClientRect(), b = document.querySelector('.g-five .kb [data-k=W]').getBoundingClientRect(); const t = document.elementFromPoint((a.right + b.left) / 2, (a.top + a.bottom) / 2); return !!t && !!t.closest('.kb button'); })()")
    assert gapHit, "the gap between two keys still hits a key"
    err = pg.evaluate("(() => { const m = document.querySelector('.g-five .fvmsg'); const cs = getComputedStyle(m); return [cs.color, cs.backgroundColor]; })()")
    assert err == ["rgb(255, 255, 255)", "rgb(179, 38, 30)"], ("error chip white on dark red", err)
    shot(pg, "fuenf-invalid-de-375.png")
    c.unroute_all(behavior="ignoreErrors"); c.close()
    print("PASS 375 DE: invalid word from the screen keyboard, 11-key rows fit, keys tappable")
    assert not errs, errs
    br.close()
