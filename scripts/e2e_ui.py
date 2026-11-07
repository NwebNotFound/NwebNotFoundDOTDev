#!/usr/bin/env python3
import os
# UI-Prüfung gegen das lokale wrangler dev aus e2e.mjs (wird von dort aufgerufen). argv: BASE COOKIE
import json
import sys, re, time
from urllib.parse import unquote
from playwright.sync_api import sync_playwright
BASE, COOKIE = sys.argv[1], sys.argv[2]
H = "mc.nwebnotfound.dev"; U1x = "11111111222233334444555555555555"; fails = 0; SH = os.environ.get("E2E_SCREENS_DIR", "/workspace/screens/qa")
os.makedirs(SH, exist_ok=True)
cookie_name, cookie_val = COOKIE.split("=", 1)
cookie_val = unquote(cookie_val)
def ok(c, m, x=""):
    global fails
    print(("  ✓ " if c else "  ✗ ") + m + ("" if c else "  " + str(x)[:300])); fails += (not c)
def route(r):
    u = r.request.url
    if u.startswith("https://" + H):
        h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}; h["host"] = H
        try: r.fulfill(response=r.fetch(url=BASE + u[len("https://" + H):], headers=h, max_redirects=0))
        except Exception:
            if not any(x in u for x in ("/mc-head/", "/mc-skin/", "/mc-icon/", "/vendor/")): raise  # Kopf-Requests dürfen beim Kontext-Schließen noch laufen
    else: r.continue_()
with sync_playwright() as p:
    # Im Container liegt Chrome unter /usr/bin/google-chrome; auf einem Windows-Entwicklungsrechner
    # gibt es den Pfad nicht, dort nimmt Playwright den eigenen Chromium-Build.
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    for w in (390, 1440):
        ctx = br.new_context(viewport={"width": w, "height": 900})
        ctx.add_cookies([{"name": cookie_name, "value": cookie_val, "domain": H, "path": "/", "secure": True, "httpOnly": True}])
        pg = ctx.new_page(); pg.route("**/*", route); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "mc-heads" not in m.text and "Failed to load resource" not in m.text and "challenges.cloudflare.com" not in (m.location or {}).get("url", "") and "challenges.cloudflare.com" not in m.text and "font-size:0;color:transparent" not in m.text and m.text.strip() != "Event" else None)
        def go(path):
            pg.goto("https://" + H + path, wait_until="domcontentloaded", timeout=45000); pg.wait_for_timeout(400)
            ok(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px {path}: kein horizontales Scrollen")
            return pg.inner_text("body")
        t = go("/markt")
        pg.wait_for_selector("#econ-card", timeout=10000)
        et = pg.inner_text("#econ")
        ok(pg.locator("#econ .econ-line").count() == 1, f"{w}px Markt: Economy-Stufengraph da")
        dpath = pg.get_attribute("#econ .econ-line", "d") or ""
        ok("V" in dpath and "H" in dpath and "L" not in dpath, f"{w}px Markt: Graph ist Stufen-Pfad (H/V)", dpath[:80])
        ok("777.777 CP" in et and "–" in et and "-900 CP" in et, f"{w}px Markt: Economy-Werte und '–' bei null", et[:300])
        ok(pg.locator("#econ [style]").count() == 0, f"{w}px Markt: Economy ohne style-Attribute")
        ok("nur Verkauf" in t and "Nicht bei der Bank kaufbar" not in t, f"{w}px Markt: dezentes 'nur Verkauf'")
        hs = pg.eval_on_selector_all(".nb:not(:empty)", "els=>els.map(e=>e.getBoundingClientRect().height)")
        ok(hs and max(hs) < 24, f"{w}px Markt: 'nur Verkauf' einzeilig", hs[:5])
        ok(pg.locator(".ir .tag.tl").count() == 0, f"{w}px Markt: kein Badge-Mix")
        ok(re.search(r"\+10,00\s?%", t) is not None, f"{w}px Markt: +10,00 % aus Historie", t[:200])
        ok(re.search(r"\+20,00\s?%", t) is not None and not re.search(r"97,60", t), f"{w}px Markt: Kupfer +20 % nach Reset statt Fake-Crash")
        ok(pg.locator("#rsn").count() == 1 and "neue Preise" in pg.inner_text("#rsn"), f"{w}px Markt: Hinweis 'neue Preise'")
        ok(pg.locator(".mrow .rmk").count() >= 1 and "neue Preise" in pg.locator(".mrow .rmk text").first.text_content(), f"{w}px Markt: Reset-Linie in Top/Flop-Sparkline")
        t = go("/markt/copper_ingot"); pg.locator("#cw svg").wait_for(timeout=10000)
        curve = pg.get_attribute("#cw path[fill='none']", "d") or ""
        ok("C" in curve and "H" not in curve and "V" not in curve, f"{w}px Item: glatte Kurve statt Stufe", curve[:90])
        mk = pg.locator("#cw .rmk")
        ok(mk.count() == 1 and mk.locator("text").text_content() == "neue Preise", f"{w}px Item: vertikale Linie 'neue Preise'")
        # Summer Theme v2: the MC surface renders pixel text in the self-hosted SmPixel
        # (Pixelify Sans) instead of Monocraft — the assertion keeps checking a pixel face.
        ok("SmPixel" in pg.eval_on_selector("#cw .rmk text", "e=>getComputedStyle(e).fontFamily"), f"{w}px Item: Marker in Pixel-Schrift", pg.eval_on_selector("#cw .rmk text", "e=>getComputedStyle(e).fontFamily"))
        bb = pg.eval_on_selector("#cw .rmk text", "e=>{const a=e.getBoundingClientRect(),b=e.closest('svg').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1}")
        ok(bb, f"{w}px Item: Marker-Label im Chart sichtbar")
        rc = pg.inner_text("#rc"); ok("+20,00" in rc and "seit Reset" in rc, f"{w}px Item: Änderung seit Reset", rc)
        pg.screenshot(path=f"{SH}/local-preisreset-item-{w}.png", full_page=True)
        go("/markt"); pg.screenshot(path=f"{SH}/local-preisreset-markt-{w}.png", full_page=True)
        t = go("/markt/diamond"); ok(pg.locator("#cw .rmk").count() == 0, f"{w}px Diamant: kein Marker (Daten nur nach Reset)")
        t = go("/markt/elytra"); ok("nur Verkauf" in t, f"{w}px Item gesperrt: 'nur Verkauf'")
        t = go("/auktionen/a1"); ok("50,00" in t and pg.locator("form, input[type=number]").count() > 0, f"{w}px Auktion a1: Mindestgebot 50,00 + Formular")
        ok("angenommen" in t.lower() or "accepted" in t.lower() or "Deine Gebote" in t, f"{w}px Auktion a1: eigenes Gebot sichtbar", t[-300:])
        t = go("/auktionen/a2"); ok("215,00" in t and "Seller" in t and "99999999…" in t, f"{w}px Auktion a2: min_next_bid + Gebotsverlauf")
        t = go("/auktionen/a4"); ok("deine Auktion" in t, f"{w}px eigene Auktion: kein Bieten", t[:300])
        t = go("/leaderboards"); ok("Nils" in t and "Seller" in t, f"{w}px Bestenlisten mit Namen")
        ok("Kontostand" in pg.locator("#tabs").inner_text(), f"{w}px Bestenliste gesamt: 'Kontostand'")
        pg.click("button[data-k=weekly]"); pg.wait_for_timeout(300); tb = pg.locator("#tabs").inner_text()
        ok("Kontostand ± diese Woche" in tb and "CP diese Woche" not in tb, f"{w}px Bestenliste Woche: Netto-Label", tb)
        ok("Netto seit Montag" in pg.locator("#lbh").inner_text() and pg.locator("#tabs [title^='Netto seit Montag']").count() >= 1, f"{w}px Bestenliste Woche: Hinweis + Tooltip 'Netto seit Montag'")
        t = go("/"); ok(pg.locator("a.g.q").count() == 6, f"{w}px Start: 6 Hub-Karten")
        qi_box = pg.eval_on_selector("a.g.q .qi", "el=>getComputedStyle(el).borderTopWidth")
        ok(qi_box in ("0px", "0"), f"{w}px Start: Hub-Icon ohne Rahmen-Box", qi_box)
        ok(pg.locator("a.g.q b").evaluate_all("els=>els.every(e=>getComputedStyle(e).textDecorationLine!=='underline')"), f"{w}px Start: Hub-Titel ohne Unterstreichung")
        pg.locator("a.g.q").first.screenshot(path=f"{SH}/local-hub-cards-{w}.png")
        go("/wiki/befehle"); pg.locator(".wiki-hero-meta").screenshot(path=f"{SH}/local-wiki-header-{w}.png")
        go("/markt"); pg.screenshot(path=f"{SH}/local-markt-{w}.png", full_page=False)
        go("/spieler/Nils"); pg.wait_for_timeout(400); pg.screenshot(path=f"{SH}/local-spieler-{w}.png", full_page=True)
        t = go("/wiki/befehle"); ok(pg.locator(".wiki-hero-meta .eyb").count() == 1, f"{w}px Wiki-Artikel: Meta-Zeile")
        t = go("/profile")
        pg.locator(".pf-hd .m3d").wait_for(timeout=20000)
        ok(pg.locator(".pf-hd .pf-name").count() > 0 and pg.locator(".pf-hd .m3d").count() == 1, f"{w}px Profil: Minecraft-Header mit 3D-Modell", pg.inner_text("#pb")[:260])
        pg.locator(".inv").wait_for(state="visible", timeout=20000)
        ok(pg.locator(".inv .iv-pane").count() >= 1 and pg.locator(".inv .ivs").count() >= 41, f"{w}px Profil: volles Inventar-Layout")
        ok("AB" not in pg.locator(".inv").inner_text(), f"{w}px Profil: keine Text-Platzhalter")
        pg.locator(".inv").scroll_into_view_if_needed(); pg.screenshot(path=f"{SH}/local-polish-profil-{w}.png", full_page=True)
        ok(pg.locator("#umm a[href='/bestellungen']").count() == 1, f"{w}px Dropdown: Bestellungen")
        # 1) Profil: kein doppelter Tab, klare Blöcke
        ok(pg.locator(".u-links a[href='/profile']").count() == 0 and pg.locator("#umm a[href='/profile']").count() == 1, f"{w}px Nav: Profil nur im Konto-Menü")
        hd = pg.inner_text(".pf-hd")
        ok("Rot" in hd and pg.eval_on_selector(".pf-hd .pf-team", "e=>getComputedStyle(e).color") == "rgb(255, 85, 85)", f"{w}px Profil: Team in team_color", hd[:200])
        ok("01.11.26, 00:05 Uhr" in hd and pg.locator(".pf-hd .pf-on").count() == 0, f"{w}px Profil: last_seen in Europe/Berlin", hd[:300])
        pg.goto("https://" + H + "/spieler/Seller", wait_until="domcontentloaded"); pg.locator(".pf-hd .pf-meta").wait_for(timeout=15000); hd = pg.inner_text(".pf-hd")
        ok(pg.locator(".pf-hd .pf-on").count() == 1 and "Zuletzt online" not in hd, f"{w}px Spieler: Online-Badge statt last_seen", hd[:300])
        ok(pg.eval_on_selector(".pf-hd .pf-team", "e=>getComputedStyle(e).color") == "rgb(85, 255, 85)", f"{w}px Spieler: ungültige team_color → team_color_hex")
        # XSS: spielergewählter Teamname / ungültige team_color im Header
        XT = "<img src=x onerror=alert(1)>"; dlg = []; pg.on("dialog", lambda d: (dlg.append(d.message), d.dismiss()))
        def evil(r):
            u = r.request.url; h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}; h["host"] = H; j = json.loads(r.fetch(url=BASE + u[len("https://" + H):], headers=h).text()); j["team"] = XT; j["team_color"] = 'red" onmouseover="alert(2)'; j["team_color_hex"] = "#12345G"
            r.fulfill(status=200, content_type="application/json", body=json.dumps(j))
        pg.route("**/api/mc-players/Seller", evil)
        pg.goto("https://" + H + "/spieler/Seller", wait_until="domcontentloaded"); pg.locator(".pf-hd .pf-meta").wait_for(timeout=15000); pg.wait_for_timeout(600)
        hd = pg.inner_text(".pf-hd"); hh = pg.inner_html(".pf-hd")
        ok(XT in hd and pg.locator(".pf-hd .pf-meta img:not([src^='/mc-icon/'])").count() == 0 and pg.locator("img[src='x']").count() == 0 and not dlg, f"{w}px Spieler: Team <img onerror> als Text, kein img/alert", hh[:400])
        ok("onmouseover" not in hh and pg.locator(".pf-hd .pf-team").count() == 0, f"{w}px Spieler: ungültige team_color nicht übernommen", hh[:400])
        r2 = pg.evaluate("""t=>{const d=document.createElement('div');d.innerHTML=MCP.header({name:'Nils',meta:[['Team',t,'white_banner',{color:'#fff;background:url(x)'}],['CP',t,'gold_ingot'],['Zuletzt online',t,'clock',{seen:true}]]});return [d.querySelectorAll('img[src="x"]').length,d.querySelectorAll('[style]').length,d.textContent.split(t).length-1]}""", XT)
        ok(r2 == [0, 0, 3], f"{w}px MCP.header escaped alle Meta-Felder, Farbe nur #RRGGBB", r2)
        pg.unroute("**/api/mc-players/Seller")
        # Parkour-Karte im Profil: Titel/Untertitel getrennt, Icon+Name+Zeit als Zeile, Rang als Badge mit Abstand
        PR = '{"rank":2,"mc_uuid":"' + U1x + '","mc_name":"Nils","time_ms":49530,"set_at":"2026-10-31T20:00:00Z"}'
        pg.route("**/api/mc-parkour", lambda r: r.fulfill(status=200, content_type="application/json", body='{"courses":{"cave_rush":[' + PR + ']},"course_names":{"cave_rush":"Cave Rush"},"course_icons":{"cave_rush":"lantern"}}'))
        pg.goto("https://" + H + "/profile", wait_until="domcontentloaded"); pg.locator("#t-minispiele").wait_for(timeout=20000); pg.click("#t-minispiele")
        pk = pg.locator(".pk-card").first; pk.wait_for(timeout=10000)
        L = pk.evaluate("""c=>{const R=e=>e.getBoundingClientRect(),h=c.querySelector('h3'),s=h.querySelector('small'),r=c.querySelector('.prow'),ic=R(r.querySelector('.ic')),n=R(r.querySelector('.n')),rk=r.querySelector('.pk-rk'),tm=R(r.querySelector('.pk-tm')||r.querySelector('b')),cs=getComputedStyle(c);
          const t=document.createRange();t.selectNodeContents(h.firstChild);const tr=t.getBoundingClientRect();
          return {title:h.firstChild.textContent,sep:(R(s).left-tr.right>=6)||(R(s).top>=tr.bottom-1),row:Math.abs((ic.top+ic.bottom)/2-(n.top+n.bottom)/2)<4&&n.left>=ic.right+8,rk:!!rk&&rk.textContent==='#2'&&tm.left-R(rk).right>=8&&Math.abs((R(rk).top+R(rk).bottom)/2-(tm.top+tm.bottom)/2)<4,pad:parseFloat(cs.paddingLeft)===(innerWidth>=640?24:16)&&parseFloat(cs.paddingTop)===(innerWidth>=640?24:16),fit:R(r).right<=R(c).right&&[...c.querySelectorAll('.prow')].every(x=>x.scrollWidth<=x.clientWidth)}}""")
        ok(L["title"] == "Parkour" and L["sep"] and "Cave Rush" in pk.inner_text() and "Beste Platzierung" in pk.inner_text() and "pk-one" in (pk.get_attribute("class") or ""), f"{w}px Profil-Parkour: einzelne Platzierung als Karte", L)
        ok(L["row"] and L["rk"] and L["pad"] and L["fit"], f"{w}px Profil-Parkour: Icon/Name/Rang/Zeit als Zeile mit Abständen", L)
        heads = pg.eval_on_selector_all("#pb .dcard h3", "hs=>hs.filter(h=>h.querySelector('small')).map(h=>{const s=h.querySelector('small').getBoundingClientRect(),t=document.createRange();t.selectNodeContents(h.firstChild);const r=t.getBoundingClientRect();return [h.firstChild.textContent,(s.left-r.right>=6)||(s.top>=r.bottom-1)]})")
        ok(heads and all(x[1] for x in heads), f"{w}px Profil: alle Karten-Titel vom Untertitel getrennt", heads)
        pk.scroll_into_view_if_needed(); pk.screenshot(path=f"{SH}/local-profil-parkour-{w}.png"); 
        pg.goto("https://" + H + "/spieler/Nils", wait_until="domcontentloaded"); pg.locator("#t-minispiele").wait_for(timeout=20000); pg.click("#t-minispiele")
        sp = pg.locator(".pk-card").first; sp.wait_for(timeout=10000)
        S = sp.evaluate("""c=>{const R=e=>e.getBoundingClientRect(),h=c.querySelector('h3'),s=R(h.querySelector('small')),t=document.createRange();t.selectNodeContents(h.firstChild);const tr=t.getBoundingClientRect(),rk=R(c.querySelector('.pk-rk')),tm=R(c.querySelector('.pk-tm'));return [getComputedStyle(h).display,(s.left-tr.right>=6)||(s.top>=tr.bottom-1),tm.left-rk.right>=8,document.querySelectorAll('link[href*="/mc/profile.css"]').length]}""")
        ok(S[0] == "flex" and S[1] and S[2] and S[3] == 1 and pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px /spieler: Karten-Styles aus profile.css, Parkour-Karte sauber", S)
        sp.scroll_into_view_if_needed(); sp.screenshot(path=f"{SH}/local-spieler-parkour-{w}.png"); pg.unroute("**/api/mc-parkour")
        pg.goto("https://" + H + "/profile", wait_until="domcontentloaded"); pg.locator(".inv").wait_for(state="visible", timeout=20000)
        # Nav-Gruppen: max. 6 Top-Level-Einträge, aktive Gruppe markiert
        ok(pg.locator(".u-links > .u-group").count() == 5 and pg.locator(".u-tools #umb").count() == 1, f"{w}px Nav: fünf Gruppen, Konto ganz rechts")
        # Inventar: animierte Texturen (Magma 16x48) nur quadratisch
        pg.evaluate("()=>{const i=document.querySelector('.inv .ivs img');if(i)i.src='/mc-icon/v2/magma_block'}"); pg.wait_for_timeout(800)
        bx = pg.eval_on_selector(".inv .ivs img", "e=>{const r=e.getBoundingClientRect();return [r.width,r.height]}")
        ok(abs(bx[0] - bx[1]) < 1.5, f"{w}px Inventar: animierte Textur quadratisch", bx)
        pg.locator("#pordl ul, #pordl p").first.wait_for(state="attached", timeout=10000)
        ok(pg.locator("#pbal").count() == 1 and pg.locator(".pf-kpi").count() == 1 and pg.locator("#pord").count() == 1, f"{w}px Profil: Kontostand, KPI-Leiste, Bestellungen da")
        tabs = pg.locator(".pf-tl [role=tab]").all_inner_texts()
        ok(tabs[:3] == ["Inventar", "Statistiken", "Markt"], f"{w}px Profil: Tabs Inventar → Statistiken → Markt", tabs)
        ok("Kontostand" not in pg.inner_text(".pf-kpi"), f"{w}px Profil: Kontostand nicht doppelt in KPI")
        pg.click(".pf-tl [data-k=markt]"); pg.wait_for_timeout(150)
        ok(pg.locator("#pbal").is_visible() and not pg.locator(".inv").is_visible(), f"{w}px Profil: Tab-Wechsel zeigt Markt")
        pg.screenshot(path=f"{SH}/local-profil-markt-{w}.png", full_page=True)
        # 2) Dropdown im MC-Theme
        if w < 900: pg.click(".u-burger")
        else: pg.locator("#umb").dispatch_event("click")
        pg.wait_for_timeout(300)
        st = pg.evaluate("(()=>{const c=getComputedStyle(document.querySelector(innerWidth<=860?'.u-panel':'#umm'));return [c.backgroundColor,c.borderTopColor]})()")
        ok("18, 13, 31" not in st[0] and "45, 29, 90" not in st[1], f"{w}px Dropdown: MC-Theme statt Lila", st)
        pg.screenshot(path=f"{SH}/ux-dropdown-{w}.png")
        # 4) einheitliches Hover
        hov = []
        for sel in ("#umm a[href='/bestellungen']" if w >= 900 else ".u-me__links a.u-out", "#pbal .acts .btn.sec"):
            el = pg.locator(sel).first; el.hover(); pg.wait_for_timeout(200)
            hov.append(el.evaluate("e=>{const c=getComputedStyle(e);return c.backgroundColor+'|'+c.boxShadow}"))
        pg.keyboard.press("Escape")
        ok(len(set(hov)) == 1, f"{w}px Hover: Menüeintrag = Button (gleiches Token)", hov)
        t = go("/abholungen"); ok("Abholfach" in t and "abgelehnt" in t and "erledigt" in t and "Diamant" in t, f"{w}px Bestellungen: Stufen + Abholfach in einer Liste", t[:400])
        ok(pg.locator("#olist").count() == 1 and pg.locator(".card").count() == 1, f"{w}px Bestellungen: genau eine Liste")
        if pg.locator("[data-hide]").count():
            a = pg.locator("[data-hide]").first.bounding_box(); ok(a and a["height"] >= 32, f"{w}px Ausblenden-Button tippbar")
        r1 = pg.locator("#olist .po").first; r1.hover(); pg.wait_for_timeout(200)
        ok(r1.evaluate("e=>getComputedStyle(e).backgroundColor") == hov[0].split("|")[0], f"{w}px Hover: Listenzeile nutzt dasselbe Token")
        # 6) Bank-Direktkauf auf der Item-Seite
        go("/markt/diamond"); pg.locator("#bbf").wait_for(timeout=10000)
        ok(pg.locator('.u-group[data-g=wirtschaft] .u-gbtn[data-cur]').count() == 1 and pg.locator('a[href="/markt"][aria-current=page]').count() == 1, f"{w}px Nav: /markt/diamond markiert Markt")
        ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), f"{w}px Item-Seite mit Bank-Kauf: kein Overflow")
        t0 = pg.inner_text("#bbt"); pg.fill("#bba", "2"); ok(pg.inner_text("#bbt") != t0, f"{w}px Bank-Kauf: Summe live", pg.inner_text("#bbt"))
        pg.click("#bbb"); pg.wait_for_function("document.getElementById('bbm').textContent.length>0", timeout=10000)
        ok("gesendet" in pg.inner_text("#bbm") or "Zu viele" in pg.inner_text("#bbm"), f"{w}px Bank-Kauf: Absenden", pg.inner_text("#bbm"))
        pg.locator("#bbuy").scroll_into_view_if_needed(); pg.screenshot(path=f"{SH}/ux-bankkauf-{w}.png")
        go("/markt/elytra"); pg.wait_for_timeout(600); ok("nicht kaufbar" in pg.inner_text("#bbuy"), f"{w}px Bank-Kauf: gesperrtes Item ohne Formular")
        ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), f"{w}px Abholungen: kein Overflow")
        pg.screenshot(path=f"{SH}/local-polish-abholungen-{w}.png", full_page=True)
        t = go("/shops/s1"); ok("15,00" in t, f"{w}px Shop: Preis 15,00 CP")
        t = go("/feedback"); ok("Feedback" in t and ("Limit" in t or "0 von 3" in t or "Deine Einreichungen" in t) and pg.locator("#fbf textarea").count() == 1, f"{w}px Feedback: Formular + eigene Einreichungen", t[:300])
        pg.screenshot(path=f"{SH}/local-feedback-{w}.png", full_page=True)
        t = go("/spieler"); ok("Nils" in t and "Seller" in t, f"{w}px Spieler: Liste")
        pg.fill("#q", "nls"); pg.wait_for_timeout(600); ok(pg.locator("a.plc").first.inner_text().startswith("Nils"), f"{w}px Spieler: Fuzzy 'nls'")
        pg.screenshot(path=f"{SH}/local-spieler-{w}.png", full_page=True)
        go("/spieler/Nils"); pg.locator(".pf-kpi").wait_for(timeout=10000); t = pg.inner_text("body"); ok(pg.locator(".pf-hd .m3d").count() == 1 and pg.locator(".pf-kpi .pf-tile").count() >= 1 and "Statistiken" in t and pg.locator("#det").count() == 1 and "nur für Mitspieler" not in t, f"{w}px Spielerseite eingeloggt: Details", t[:300])
        ok(all(x in t for x in ("Top-Blöcke", "Mob-Kills", "Distanzen", "Zombie", "Stein", "15,3 km")) and "Playtime S" not in t, f"{w}px Details: erweiterte Stats-Karten", t[-600:])
        ok("7.200" not in t.split("Details",1)[-1], f"{w}px Details: Spielzeit formatiert statt Sekunden")
        pg.screenshot(path=f"{SH}/local-spieler-nils-{w}.png", full_page=True)
        for nm, path in (("start", "/"), ("markt", "/markt"), ("bestenlisten", "/leaderboards")): go(path); pg.wait_for_timeout(400); pg.screenshot(path=f"{SH}/local-polish-{nm}-{w}.png", full_page=True)
        go("/"); ok(pg.locator(".qgrid .q").count() == 6 and pg.locator('.qgrid a[href="/#srv-sec"]').count() == 1 and pg.locator('.qgrid a[href="/pvp"]').count() == 1 and pg.locator('.qgrid a[href="/profile"]').count() == 1, f"{w}px Start: sechs Kacheln wie das Menü")
        ok(pg.locator('.u-group[data-g=server] a[href="/changelog"]').count() == 1 and pg.locator('.u-group[data-g=wiki] a[href="/wiki/befehle"]').count() == 1 and pg.locator('#umm a[href="/bestellungen"]').count() == 1 and pg.locator('#umm a[href="/vip"]').count() == 1, f"{w}px Nav: Server, Wiki, Konto")
        for path in ("/markt", "/wiki", "/wiki/befehle"): go(path); pg.screenshot(path=f"{SH}/local{path.replace('/','-')}-{w}.png", full_page=True)
        ok(pg.locator('.u-links a[href="/wiki/befehle"][aria-current=page]').count() == 1 and pg.locator('.u-group[data-g=wiki] .u-gbtn[data-cur]').count() == 1 and pg.locator('.u-links a[href="/wiki"][aria-current=page]').count() == 0, f"{w}px Nav: Wiki-Artikel markiert, nicht die Übersicht")
        if w < 900:
            # Wiki-Drawer: bei 375/390 liefen die Gruppen mit flex-wrap in eine zweite Spalte,
            # Wiki und Konto waren nicht erreichbar (Designer-Audit fix-unified-nav).
            pg.click(".u-burger"); pg.wait_for_timeout(250)
            dr = pg.evaluate("""() => { const n = document.querySelector('.u-panel'); const g = [...n.querySelectorAll('.u-group')]; const r = n.getBoundingClientRect(); return { sw: n.scrollWidth, cw: n.clientWidth, groups: g.length, labels: g.map(x => x.querySelector('.u-gbtn').textContent.trim()), acc: !!n.querySelector('.u-me__links a.u-out'), bottom: innerHeight - r.bottom, page: document.documentElement.scrollWidth - innerWidth }; }""")
            ok(dr["sw"] <= dr["cw"] + 1 and dr["groups"] == 5 and dr["acc"] and dr["bottom"] >= 8 and dr["page"] <= 0, f"{w}px Wiki-Drawer: kein Querscroll, alle Gruppen + Konto erreichbar, endet vor der Bildschirmkante", dr)
            if pg.locator(".u-panel .u-drow").count():  # the mc drawer has no language/theme rows
                th = pg.evaluate("""() => { const n = document.querySelector('.u-panel'); const hit = el => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, c = r.top + r.height / 2; return [c - 21, c + 21].every(y => { const e = document.elementFromPoint(x, y); return e === el || el.contains(e); }); }; const A = [...n.querySelectorAll('.u-drow .u-seg a')], T = n.querySelector('.u-drow .u-theme'); return { seg: A.length, segOk: A.every(hit), themeOk: hit(T), themeH: Math.round(T.getBoundingClientRect().height), page: document.documentElement.scrollWidth - innerWidth }; }""")
                ok(th["seg"] == 2 and th["segOk"] and th["themeOk"] and th["themeH"] >= 44 and th["page"] <= 0, f"{w}px Drawer: DE/EN + Theme-Schalter haben 44px Touch-Fläche, kein Überlauf", th)
            if pg.locator(".u-me__who").count():
                me = pg.evaluate("""() => { const n = document.querySelector('.u-panel'); const hit = el => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, c = r.top + r.height / 2; return [c - 21, c + 21].every(y => { const e = document.elementFromPoint(x, y); return e === el || el.contains(e); }); }; return { who: hit(n.querySelector('.u-me__who')), out: hit(n.querySelector('.u-me__links a.u-out')) }; }""")
                ok(me["who"] and me["out"], f"{w}px Drawer: Profil + Abmelden haben 44px Touch-Fläche", me)
            if pg.locator(".u-panel .u-drow").count(): pg.focus(".u-drow .u-theme"); pg.keyboard.press("Tab"); ok(pg.evaluate("!!document.activeElement.closest('.u-panel')"), f"{w}px Drawer: Tastatur erreicht die Schalter")
            y0 = pg.evaluate("document.querySelector('.u-nav').getBoundingClientRect().top"); pg.mouse.wheel(0, 400); pg.wait_for_timeout(150)
            ok(abs(pg.evaluate("document.querySelector('.u-nav').getBoundingClientRect().top") - y0) < 1, f"{w}px Drawer offen: Kopfleiste bleibt sticky (#69)")
            pg.keyboard.press("Escape")
        go("/parkour?course=test"); pg.locator(".pkr").first.wait_for(timeout=10000); t = pg.inner_text("body")
        ok(pg.locator(".pkg").count() == 1 and pg.locator(".pkr").count() == 10 and "00:39.000" in t, f"{w}px Parkour ?course=test: nur ein Board, Top 10, Zeit mm:ss.mmm", t[:300])
        ok(pg.locator(".pkr img[src^='/mc-head/']").count() == 10 and pg.locator(".pkh img[src*='/mc-icon/v2/']").count() == 1, f"{w}px Parkour: Köpfe + Item-Icon")
        ok(pg.locator('.u-group[data-g=minispiele] .u-gbtn[data-cur]').count() == 1, f"{w}px Nav: Gruppe Minispiele aktiv")
        if w < 900:
            ok(not pg.locator(".u-panel").is_visible(), f"{w}px Nav mobil: eingeklappt"); pg.click(".u-burger"); pg.wait_for_timeout(200)
            ok(pg.locator('.u-links a[href="/parkour"]').is_visible() and pg.get_attribute(".u-burger", "aria-expanded") == "true", f"{w}px Nav mobil: Drawer öffnet aktive Gruppe")
            ok(pg.evaluate("document.activeElement.closest('.u-panel') !== null"), f"{w}px Nav mobil: Fokus springt in den Drawer")
            for _ in range(40): pg.keyboard.press("Tab")
            ok(pg.evaluate("!!document.activeElement.closest('.u-nav')"), f"{w}px Nav mobil: Tab bleibt im Drawer")
            # nav v2: the drawer fades out (opacity), visibility switches after 0.35 s
            pg.keyboard.press("Escape"); pg.wait_for_timeout(450); ok(not pg.locator(".u-panel").is_visible() and pg.evaluate("document.activeElement.classList.contains('u-burger')"), f"{w}px Nav mobil: Escape schließt, Fokus zurück auf dem Menüknopf")
        else:
            pg.focus(".u-group[data-g=wirtschaft] .u-gbtn"); pg.keyboard.press("Enter"); pg.keyboard.press("ArrowDown")
            ok(pg.evaluate("document.activeElement.getAttribute('href')") == "/markt", f"{w}px Nav: Tastatur öffnet Dropdown")
            pg.keyboard.press("Escape"); ok(pg.get_attribute(".u-group[data-g=wirtschaft] .u-gbtn", "aria-expanded") == "false", f"{w}px Nav: Escape schließt Dropdown")
            pg.locator(".u-group[data-g=community] .u-gbtn").dispatch_event("click")
            ok(pg.get_attribute(".u-group[data-g=community] .u-gbtn", "aria-expanded") == "true" and pg.locator('.u-group[data-g=community] a[href="/spieler"]').count() == 1, f"{w}px Nav: Klick öffnet Community")
            pg.locator(".u-group[data-g=community] .u-gbtn").dispatch_event("click")
            ok(pg.get_attribute(".u-group[data-g=community] .u-gbtn", "aria-expanded") == "false", f"{w}px Nav: zweiter Klick schließt")
            # real mouse: hover opens, the click that follows keeps it open, a second click closes it (intentional close)
            gb = ".u-group[data-g=community] .u-gbtn"; pg.mouse.move(5, 400); pg.wait_for_timeout(250)
            bx = pg.locator(gb).bounding_box(); cx, cy = bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2
            pg.mouse.move(cx, cy); pg.wait_for_timeout(120); ok(pg.get_attribute(gb, "aria-expanded") == "true", f"{w}px Nav: Hover öffnet Community")
            pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(120); ok(pg.get_attribute(gb, "aria-expanded") == "true", f"{w}px Nav: echter Klick nach Hover lässt das Menü offen")
            pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(120); ok(pg.get_attribute(gb, "aria-expanded") == "false", f"{w}px Nav: zweiter echter Klick schließt absichtlich")
            pg.mouse.move(5, 400); pg.wait_for_timeout(300)
            pg.mouse.move(cx, cy); pg.wait_for_timeout(120); pg.focus(gb); pg.keyboard.press("Enter"); pg.wait_for_timeout(120)
            ok(pg.get_attribute(gb, "aria-expanded") == "false", f"{w}px Nav: Enter nach Hover schaltet um (Tastatur unverändert)")
            pg.mouse.move(5, 400); pg.wait_for_timeout(300); pg.keyboard.press("Escape")
            # Wiki has the longest dropdown: with space it must show every link (no 440px clip),
            # on a short viewport it scrolls while the scrollbar stays hidden (Nils' request).
            pg.locator(".u-group[data-g=wiki] .u-gbtn").dispatch_event("click")
            wd = pg.evaluate("""() => { const d = document.querySelector('.u-group[data-g=wiki] .u-drop'); const r = d.getBoundingClientRect(); const a = [...d.querySelectorAll('a')]; return { n: a.length, hidden: a.filter(x => x.getBoundingClientRect().bottom > r.bottom - 1).map(x => x.textContent.trim()), clipped: d.scrollHeight > d.clientHeight, bottom: Math.round(r.bottom), vh: innerHeight, bar: getComputedStyle(d).scrollbarWidth }; }""")
            ok(wd["n"] == 11 and not wd["hidden"] and not wd["clipped"] and wd["bottom"] < wd["vh"] and wd["bar"] == "none", f"{w}px Wiki-Dropdown: alle Links sichtbar ohne Beschnitt, Scrollbar bleibt versteckt", wd)
            pg.set_viewport_size({"width": w, "height": 520}); pg.wait_for_timeout(150)
            ws = pg.evaluate("""() => { const d = document.querySelector('.u-group[data-g=wiki] .u-drop'); const a = [...d.querySelectorAll('a')]; const last = a[a.length - 1]; const fits = () => last.getBoundingClientRect().bottom <= d.getBoundingClientRect().bottom + 1; const before = fits(); d.scrollTop = d.scrollHeight; const after = fits(); return { scrolls: d.scrollHeight > d.clientHeight, before, after, bar: getComputedStyle(d).scrollbarWidth, page: document.documentElement.scrollWidth - innerWidth }; }""")
            ok(ws["scrolls"] and not ws["before"] and ws["after"] and ws["bar"] == "none" and ws["page"] <= 0, f"{w}px Wiki-Dropdown kurz: scrollt bis zum letzten Link, Scrollbar bleibt versteckt", ws)
            pg.set_viewport_size({"width": w, "height": 900}); pg.wait_for_timeout(150)
            pg.keyboard.press("Escape")
        ok(pg.locator(".pkt .btn").count() >= 3 and pg.locator('.pkt .btn[aria-selected=true][data-k="test"]').count() == 1 and pg.locator('.u-links a[href="/parkour"][aria-current=page]').count() == 1, f"{w}px Parkour: Kurs-Auswahl + Nav aktiv")
        hs = pg.eval_on_selector_all(".pkr", "els=>els.map(e=>e.getBoundingClientRect().height)"); ok(max(hs) < 70, f"{w}px Parkour: Zeilen einzeilig", hs)
        pg.screenshot(path=f"{SH}/local-parkour-{w}.png", full_page=True)
        go("/parkour"); pg.locator(".pkg").first.wait_for(timeout=10000); n = pg.locator(".pkg").count(); hs = pg.locator(".pkh h2").all_inner_texts()
        ok(n >= 3 and "Cave Rush II" in hs and "House Climb" in hs and "kurs1" not in hs and "house_climb" not in hs and "<img src=x onerror=alert(1)>" in hs and "Nether Run" in hs and not any("_" in h for h in hs) and not any("_" in b for b in pg.locator(".pkt .btn").all_inner_texts()), f"{w}px Parkour: ein Board pro Kurs mit Anzeigenamen (escaped), Fallback hübsche ID, keine Unterstriche", hs)
        ok(pg.locator(".pkg[data-course=house_climb] .pkh img[src='/mc-icon/v2/ladder']").count() == 1, f"{w}px Parkour: house_climb Leiter statt grauem paper")
        ok(pg.locator(".pkg[data-course=icon_ok] .pkh img[src='/mc-icon/v2/golden_boots']").count() == 1 and pg.locator(".pkg[data-course=icon_bad] .pkh img[src='/mc-icon/v2/paper']").count() == 1, f"{w}px Parkour: Kurs-Icon (golden_boots / paper)")
        ok(pg.locator(".pkg img[onerror*=alert]").count() == 0, f"{w}px Parkour: course_name nicht als HTML gerendert")
        pg.screenshot(path=f"{SH}/local-parkour-alle-{w}.png", full_page=True)
        pg.click('.pkt .btn[data-k="nether_run"]'); pg.locator('#pk-nether_run').wait_for(timeout=10000); ok(pg.locator(".pkg").count() == 1 and pg.locator(".pkr").count() == 1 and "01:01.234" in pg.inner_text("#root") and "course=nether_run" in pg.url, f"{w}px Parkour: Kurs-Auswahl → ?course=")
        go("/parkour#kurs1"); pg.locator(".pkg").first.wait_for(timeout=10000); ok(pg.locator(".pkg").count() == 1 and pg.locator("#pk-kurs1").count() == 1, f"{w}px Parkour: alter #kurs1-Link geht weiter")
        go("/parkour?course=Cave%20Rush"); pg.locator("#pk-cave_rush").wait_for(timeout=10000); ok(pg.locator(".pkg").count() == 1, f"{w}px Parkour: ?course=Cave Rush → cave_rush")
        go("/parkour?course=cave-rush"); pg.locator("#pk-cave_rush").wait_for(timeout=10000); ok(pg.locator(".pkg").count() == 1, f"{w}px Parkour: ?course=cave-rush → cave_rush")
        go("/parkour?course=_cave%20%20rush_"); pg.locator("#pk-cave_rush").wait_for(timeout=10000); ok(pg.locator(".pkg").count() == 1, f"{w}px Parkour: ?course=_cave  rush_ → cave_rush")
        go("/parkour?course=gibtsnicht"); pg.locator("#pk-unknown").wait_for(timeout=10000); ok("Kurs nicht gefunden" in pg.inner_text("#root"), f"{w}px Parkour: unbekannter Kurs")
        for dby, exp in (({"fall": 1, "player": 1, "some_unknown_cause": 1}, {"Fallschaden": "1", "Spieler": "1", "Some Unknown Cause": "1"}), ({"player": 1}, {"Spieler": "1", "Sonstige": "2"})):
            body = json.dumps({"name": "Tod1", "uuid": "33333333-4444-4555-8666-777777777777", "stats": {"deaths": 3}, "viewer": {"logged_in": True, "can_details": True}, "details": {"all": {"deaths": 3}, "extra": {"deaths_by": dby}}})
            pg.route("**/api/mc-players/Tod1", (lambda b: lambda r: r.fulfill(status=200, content_type="application/json", body=b))(body))
            go("/spieler/Tod1"); pg.locator("#det").wait_for(timeout=10000)
            rows = pg.evaluate("""()=>{const c=[...document.querySelectorAll('.dcard')].find(x=>x.querySelector('h3')?.textContent.startsWith('Todesursachen'));return c?[...c.querySelectorAll('.prow')].map(r=>[r.querySelector('.n span').textContent,r.querySelector('b').textContent]):null}""")
            got = dict(rows or []); ok(got == exp and sum(int(v) for v in got.values()) == 3, f"{w}px Todesursachen {list(dby)} → {exp}", rows)
            pg.unroute("**/api/mc-players/Tod1")
        RW = '{"rank":1,"mc_uuid":"00000000-0000-4000-8000-000000000001","mc_name":"Cave","time_ms":30000,"set_at":"2026-10-30T11:00:00Z"}'
        pg.route("**/api/mc-parkour", lambda r: r.fulfill(status=200, content_type="application/json", body='{"courses":{"cave_rush":[' + RW + '],"xss_run":[' + RW + ']},"course_names":{"xss_run":"<script>window.pkx=1</script>X"},"course_icons":{"cave_rush":"golden_boots"}}'))
        go("/parkour"); pg.locator("#pk-cave_rush").wait_for(timeout=10000); hr = pg.inner_html("#root"); tx = pg.inner_text("#root")
        ok("Cave Rush" in tx and "_" not in tx, f"{w}px Parkour: ohne course_name → „Cave Rush“, kein Unterstrich", tx[:200])
        ok("&lt;script&gt;" in hr and pg.locator("#root script").count() == 0 and not pg.evaluate("window.pkx") and "<script>window.pkx=1</script>X" in tx, f"{w}px Parkour: course_name mit <script> escaped", hr[:300])
        pg.unroute("**/api/mc-parkour")
        pg.route("**/api/mc-parkour", lambda r: r.fulfill(status=200, content_type="application/json", body='{"courses":{}}'))
        t = go("/parkour"); pg.locator("#pk-empty").wait_for(timeout=10000); ok("Noch keine Zeiten" in t or "Noch keine Zeiten" in pg.inner_text("body"), f"{w}px Parkour: Leerzustand")
        pg.screenshot(path=f"{SH}/local-parkour-leer-{w}.png", full_page=True); pg.unroute("**/api/mc-parkour")
        go("/vip"); pg.locator("#vip .vip-ranks").wait_for(timeout=10000); vt = pg.inner_text("#vip")
        ok("Das Panel ist für die Ränge VIP, MVP und Admin." in vt and "Vorteile" in vt and "900" not in vt and pg.locator("#vip a.btn.discord").count() == 0 and pg.locator("#vip a[href='/profile']").count() == 1, f"{w}px VIP ohne Rang: Übersicht, kein Panel", vt[:240])
        ok(pg.locator("#vip [style]").count() == 0 and pg.locator("#vip form").count() == 0 and pg.locator('#umm a[href="/vip"]').count() == 1 and pg.locator('.u-group[data-g=community] a[href="/vip"]').count() == 0 and pg.locator('#umm a[href="/vip"][aria-current=page]').count() == 1 and pg.locator('#umb[data-cur]').count() == 1, f"{w}px VIP: Konto-Menü aktiv, kein Formular")
        # Summer Theme v2: page headings use the self-hosted SmPixel (Pixelify Sans); Monocraft
        # left the MC surface with the redesign.
        ok("SmPixel" in pg.eval_on_selector("h1.hub-h", "e=>getComputedStyle(e).fontFamily"), f"{w}px VIP: Pixel-Schrift", pg.eval_on_selector("h1.hub-h", "e=>getComputedStyle(e).fontFamily"))
        ok(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px VIP-Übersicht: kein horizontales Scrollen")
        lay = pg.evaluate("""() => {
          const R = e => e.getBoundingClientRect();
          const cards = [...document.querySelectorAll('#vip .vip-card')];
          const inset = (root) => [...root.querySelectorAll('.slot')].map(s => { const a = R(root), b = R(s); return [b.left - a.left, b.top - a.top, a.right - b.right]; });
          const soon = null;
          return { h: cards.map(c => R(c).height), tops: cards.map(c => R(c).top), bots: cards.map(c => R(c).bottom),
            inset: cards.flatMap(inset).concat(soon ? inset(soon) : []),
            icons: cards.map(c => [...c.querySelectorAll('img')].filter(i => !i.closest('.v2-slots')).map(i => (i.getAttribute('src')||'').split('/').pop())),
            text: document.querySelector('#vip').innerText };
        }""")
        if w >= 800:
            ok(abs(lay["h"][0] - lay["h"][1]) <= 2 and abs(lay["tops"][0] - lay["tops"][1]) <= 2, f"{w}px VIP-Karten gleich hoch", lay["h"])
        else:
            ok(lay["tops"][1] >= lay["bots"][0] - 1, f"{w}px VIP-Karten untereinander", lay["tops"])
        ok(lay["inset"] and all(x >= 12 and y >= 12 and r >= 12 for x, y, r in lay["inset"]), f"{w}px VIP-Slots eingerückt in der Karte", lay["inset"][:8])
        ok(all(len(xs) == len(set(xs)) for xs in lay["icons"]) and all("book" in xs for xs in lay["icons"]) and not any("ender_chest" in x or x == "obsidian" for xs in lay["icons"] for x in xs), f"{w}px VIP: Buch statt Obsidian, keine doppelten Icons", lay["icons"])
        ok("LuckPerms" not in lay["text"] and "schickt keine Befehle" not in lay["text"] and "Weitere Ingame-Vorteile folgen." in lay["text"], f"{w}px VIP: spielerfreundliche Vorteile", lay["text"][:280])
        pg.locator(".vip-ranks").screenshot(path=f"{SH}/local-vip-vorteile-{w}.png")
        pg.screenshot(path=f"{SH}/local-vip-gate-{w}.png", full_page=True)
        XSS = "<img src=x onerror=alert(1)>"
        vdlg0 = len(dlg)
        pg.route("**/api/mc-vip", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({
            "access": True, "reason": None, "note": "<script>window.vipx=1</script>",
            "player": {"name": "Nils", "rank": "mvp", "color": "d", "label": "MVP"},
            "catalog": [
                {"rank": "vip", "label": "VIP", "icon": "gold_ingot", "color": "6", "yours": False, "perks": [{"id": "badge", "icon": "name_tag", "title": XSS, "text": "sicher"}]},
                {"rank": "mvp", "label": "MVP", "icon": "nether_star", "color": "d", "yours": True, "perks": [{"id": "higher", "icon": "nether_star", "title": "Höherer Rang", "text": "ja"}]},
            ],
            "stats": {"money": 12, "playtime": 3660, "kills": 2, "deaths": 1, "blocks_mined": 40},
            "worlds": {"placeholder": False, "mine": 1, "slots": [
                {"id": "aaaaaaaa-1111-4111-8111-111111111111", "label": "VIP-Welt 1", "online": True, "players": 2, "max": 8, "tps": 20,
                 "owner": True, "type": "normal", "visibility": "friends", "can_manage": True, "can_start": True, "settings": {"gamemode": "survival", "difficulty": "normal", "pvp": True, "keepInventory": False, "mobGriefing": True, "doDaylightCycle": True},
                 "members": [{"name": "KaiDasEi", "role": "trusted"}]},
                {"id": "bbbbbbbb-2222-4222-8222-222222222222", "label": XSS, "online": False, "players": 0, "max": None, "tps": 18.2,
                 "owner": False, "invited": True, "role": "member", "owner_name": "Seller", "type": "flat", "visibility": "private",
                 "can_manage": False, "can_start": False, "settings": {"gamemode": "survival", "difficulty": "normal", "pvp": True, "keepInventory": False, "mobGriefing": True, "doDaylightCycle": True}, "members": []},
            ]},
            "profile": "javascript:alert(1)",
        })))
        go("/vip"); pg.locator(".v2-world").first.wait_for(timeout=10000); vh = pg.inner_html("#vip"); vx = pg.inner_text("#vip")
        ok(pg.locator(".vip-card.is-you.is-mvp").count() == 1 and pg.locator(".v2-kpi").count() == 3 and "12 CP" in vx and "1 Std 1 Min" in vx and "Zum Profil" in vx, f"{w}px VIP-Panel: Rang, Stats, Profil-Link", vx[:300])
        ok(pg.locator('#vip a[href="/profile"]').count() == 1 and pg.locator('#vip a[href^="javascript:"]').count() == 0, f"{w}px VIP: Profil-Link fest, nicht aus der API")
        ok(XSS in vx and "&lt;img" in vh and pg.locator("#vip img[src='x']").count() == 0 and pg.locator("#vip script").count() == 0 and not pg.evaluate("window.vipx") and len(dlg) == vdlg0, f"{w}px VIP: Titel und Weltname escaped", vh[:240])
        ok(pg.locator(".v2-world").count() == 2 and "online" in vx and "offline" in vx and "bald verfügbar" not in pg.inner_text("#v2-worlds"), f"{w}px VIP-Welten aus Daten, ohne Platzhalter")
        ok("Spieler-Kills" not in vx and "Tode" not in vx, f"{w}px VIP: Kills/Tode/Blöcke nicht im Panel", vx[:200])
        ok(pg.locator("#vip [style]").count() == 0 and pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px VIP-Panel: kein Overflow, keine Inline-Styles")
        pins = pg.evaluate("""() => { const R = e => e.getBoundingClientRect(); return [...document.querySelectorAll('#vip .g')].flatMap(card => [...card.querySelectorAll('.slot')].map(s => { const a = R(card), b = R(s); return [b.left-a.left, b.top-a.top, a.right-b.right]; })); }""")
        ok(pins and all(x >= 12 and y >= 12 and r >= 12 for x, y, r in pins), f"{w}px VIP-Panel: Slots in Karten, Welten und Stats eingerückt", pins[:6])
        pg.locator(".v2-me").scroll_into_view_if_needed(); pg.screenshot(path=f"{SH}/local-vip-panel-{w}.png", full_page=True); pg.unroute("**/api/mc-vip")
        WIDA, WIDB = "aaaaaaaa-1111-4111-8111-111111111111", "bbbbbbbb-2222-4222-8222-222222222222"
        pg.route("**/api/mc-vip", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({
            "access": True, "reason": None, "note": "", "admin": True,
            "player": {"name": "Nils", "rank": "admin", "color": "c", "label": "Admin"},
            "catalog": [
                {"rank": "vip", "label": "VIP", "icon": "gold_ingot", "color": "6", "yours": False, "perks": [{"id": "worlds", "icon": "grass_block", "title": "VIP-Welten", "text": "Zugang"}]},
                {"rank": "mvp", "label": "MVP", "icon": "nether_star", "color": "d", "yours": False, "perks": [{"id": "higher", "icon": "golden_apple", "title": "Höherer Rang", "text": "ja"}]},
                {"rank": "admin", "label": "Admin", "icon": "command_block", "color": "c", "yours": True, "perks": [
                    {"id": "all", "icon": "map", "title": "Alle VIP-Welten", "text": "Du siehst jede Welt."},
                    {"id": "manage", "icon": "redstone_torch", "title": "Verwaltung", "text": "Du startest fremde Welten."},
                    {"id": "log", "icon": "writable_book", "title": "Admin-Log", "text": "Eingriffe im Protokoll."}]},
            ],
            "stats": {"money": 900, "playtime": 7200, "kills": 12, "deaths": 3, "blocks_mined": 2048},
            "worlds": {"placeholder": False, "slots": [
                {"id": WIDA, "label": "Insel", "online": True, "players": 2, "max": 10, "tps": 20, "owner_name": "Nils", "owner": True, "visibility": "friends", "info": "Ruhige Insel", "type": "normal", "can_manage": True, "can_start": True, "settings": {"gamemode": "survival", "difficulty": "normal", "pvp": True, "keepInventory": False, "mobGriefing": True, "doDaylightCycle": True}, "members": []},
                {"id": WIDB, "label": XSS, "online": False, "players": 0, "max": 5, "tps": None, "owner_name": "Seller", "owner": False, "visibility": "private", "info": "", "type": "flat", "can_manage": True, "can_start": True, "settings": {"gamemode": "survival", "difficulty": "normal", "pvp": True, "keepInventory": False, "mobGriefing": True, "doDaylightCycle": True}, "members": []},
            ]},
            "admin_log": {"updated_at": "2026-11-01T20:00:00Z", "entries": [
                {"at": "2026-11-01T19:30:00Z", "action": "start", "action_label": "Welt gestartet", "admin_name": XSS, "owner_name": "Gast", "world_id": WIDB, "detail": XSS},
                {"at": "2026-11-01T18:00:00Z", "action": "set_visibility", "action_label": "Sichtbarkeit geändert", "admin_name": "Nils", "owner_name": "Seller", "world_id": WIDA, "detail": "private"},
            ]},
        })))
        MANYBASE = {"access": True, "reason": None, "note": "", "admin": True, "player": {"name": "Nils", "rank": "admin", "color": "c", "label": "Admin"}, "catalog": [], "stats": {}, "admin_log": {"updated_at": None, "entries": []}}
        adlg0 = len(dlg)
        go("/vip"); pg.locator("#vip-admin-worlds").wait_for(timeout=10000); ah = pg.inner_html("#vip"); at = pg.inner_text("#vip")
        ok(pg.locator(".vip-admin-tag").count() == 1 and "Admin-Ansicht" in at and pg.locator(".vip-card.is-you.is-admin").count() == 1, f"{w}px VIP-Admin: Badge und eigene Karte", at[:200])
        ok(pg.locator("#vip-admin-worlds .v2-world").count() == 1 and "Besitzer Seller" in at and "Alle VIP-Welten" in at, f"{w}px VIP-Admin: fremde Welten mit Besitzer", at[:240])
        # Nils, 06.11.: Admin hat eigene Welten wie VIP/MVP, oberhalb der Admin-Ansicht, mit freiem Platz.
        ok(pg.locator(f"#v2-worlds .v2-world[data-wid='{WIDA}']").count() == 1 and pg.locator(f"#vip-admin-worlds .v2-world[data-wid='{WIDA}']").count() == 0 and pg.locator("#v2-worlds .v2-free form").count() == 1 and "1 von 3 belegt" in pg.inner_text("#v2-worlds") and pg.evaluate("document.querySelector('#v2-worlds').compareDocumentPosition(document.querySelector('#vip-admin-worlds')) & 4") > 0, f"{w}px VIP-Admin: eigene Welten mit Anlegen über der Admin-Ansicht", pg.inner_text("#v2-worlds")[:200])
        ok(pg.locator("#vip-admin-worlds button[data-act=start]").count() == 1 and pg.locator("#vip button[data-set=visibility]").count() == 4 and pg.locator(f"#vip-admin-worlds .v2-world[data-wid='{WIDB}'] button[data-set=visibility][data-val=friends]").count() == 1, f"{w}px VIP-Admin: Start und Sichtbarkeit je Welt")
        ok(pg.locator("#vip-admin-log li").count() == 2 and pg.locator("#vip-admin-log li").first.inner_text().find("Welt gestartet") >= 0 and "Admin-Log" in at, f"{w}px VIP-Admin: Protokoll neueste zuerst", pg.locator("#vip-admin-log").inner_text()[:200])
        ok(XSS in at and "&lt;img" in ah and pg.locator("#vip img[src='x']").count() == 0 and pg.locator("#vip script").count() == 0 and not pg.evaluate("window.vipx") and len(dlg) == adlg0, f"{w}px VIP-Admin: Besitzer und Log escaped", ah[:240])
        ok(pg.locator("#vip [style]").count() == 0 and pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0 , f"{w}px VIP-Admin: kein Overflow, keine Inline-Styles")
        pins = pg.evaluate("""() => { const R = e => e.getBoundingClientRect(); return [...document.querySelectorAll('#vip .g')].flatMap(card => [...card.querySelectorAll('.slot')].map(s => { const a = R(card), b = R(s); return [b.left-a.left, b.top-a.top, a.right-b.right]; })); }""")
        ok(pins and all(x >= 12 and y >= 12 and r >= 12 for x, y, r in pins), f"{w}px VIP-Admin: Slots in allen Karten eingerückt", pins[:6])
        pg.screenshot(path=f"{SH}/local-vip-admin-{w}.png", full_page=True)
        pg.route("**/api/mc-vip/worlds/**", lambda r: r.fulfill(status=202, content_type="application/json", body='{"ok":true,"request_id":"r1","op":"visibility","status":"pending"}'))
        pg.route("**/api/mc-vip/requests/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"request_id":"r1","op":"set_visibility","status":"done","reason":""}'))
        pg.click(f"#vip-admin-worlds .v2-world[data-wid='{WIDB}'] button[data-set=visibility][data-val=friends]")
        pg.wait_for_function("() => (document.querySelector('#vip-say')||{}).textContent?.includes('Sichtbarkeit')", timeout=10000)
        ok(pg.locator("#vip-say").inner_text().find("Sichtbarkeit geändert") >= 0 and pg.locator("#vip-say").get_attribute("role") == "status", f"{w}px VIP-Admin: Verwaltung meldet Erfolg ohne alert", pg.locator("#vip-say").inner_text())
        INVIEW = "() => { const r = document.querySelector('#vip-say').getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; }"
        ok(pg.evaluate(INVIEW) and pg.evaluate("() => document.querySelector('#vip-say').classList.contains('is-on')"), f"{w}px VIP: Rückmeldung (erledigt) von einer unteren Karte im Sichtfeld")
        # done start: completion wording, distinct from the queued text
        pg.click(f"#vip-admin-worlds .v2-world[data-wid='{WIDB}'] button[data-act=start]")
        pg.wait_for_function("() => (document.querySelector('#vip-say')||{}).textContent?.includes('Welt gestartet')", timeout=10000)
        ok("gesendet" not in pg.locator("#vip-say").inner_text() and pg.evaluate(INVIEW), f"{w}px VIP: erledigter Start nennt Abschluss, nicht 'gesendet'", pg.locator("#vip-say").inner_text())
        pg.unroute("**/api/mc-vip/worlds/**")
        pg.route("**/api/mc-vip/worlds/**", lambda r: r.fulfill(status=403, content_type="application/json", body='{"error":"not_owner","reason":"not_owner"}'))
        pg.click(f"#v2-worlds .v2-world[data-wid='{WIDA}'] button[data-set=visibility][data-val=private]")
        pg.wait_for_function("() => (document.querySelector('#vip-say')||{}).textContent?.includes('nicht ändern')", timeout=10000)
        ok(len(dlg) == adlg0 and "Du darfst diese Welt nicht ändern." in pg.locator("#vip-say").inner_text(), f"{w}px VIP-Admin: Fehler als Meldung, kein Dialog", pg.locator("#vip-say").inner_text())
        ok(pg.evaluate(INVIEW) and pg.evaluate("() => document.querySelector('#vip-say').classList.contains('is-bad')"), f"{w}px VIP: Ablehnung im Sichtfeld")
        pg.unroute("**/api/mc-vip/worlds/**"); pg.unroute("**/api/mc-vip/requests/**")
        # Live test 06.11.: a create that mc-stack acked denied/not_linked was shown as "Welt angelegt".
        # Success only after the ack done; otherwise the server's reason. The name pattern compiles
        # under the browser's v flag (a bare "-" at the end of a class threw).
        ok(pg.evaluate("() => { const i = document.querySelector('#v2-nm'); i.value = 'Admin-Test_1'; return i.checkValidity() && (i.value = 'a b', !i.checkValidity()); }"), f"{w}px VIP: Namensmuster gültig (v-Flag), prüft Eingaben")
        # 202 exactly as mutate() sends it (e2e.mjs "Echte 202-Antwort"); a 202 without status is followed too.
        pg.route("**/api/mc-vip/worlds", lambda r: r.fulfill(status=202, content_type="application/json", body='{"ok":true,"request_id":"r2","op":"create"}'))
        seen = []
        def req_status(r):
            seen.append(1)
            body = '{"request_id":"r2","op":"create","status":"pending","reason":""}' if len(seen) < 2 else '{"request_id":"r2","op":"create","status":"denied","reason":"not_linked"}'
            r.fulfill(status=200, content_type="application/json", body=body)
        pg.route("**/api/mc-vip/requests/r2", req_status)
        pg.fill("#v2-nm", "AdminTest"); pg.click("#v2-worlds form.v2-create button[type=submit]")
        pg.wait_for_function("() => (document.querySelector('#vip-say')||{}).textContent?.includes('Warte')", timeout=10000)
        pg.wait_for_function("() => (document.querySelector('#vip-say')||{}).textContent?.includes('verknüpft')", timeout=15000)
        say = pg.locator("#vip-say").inner_text()
        ok("nicht verknüpft" in say and "angelegt" not in say and len(seen) >= 2, f"{w}px VIP: abgelehnter Auftrag zeigt den Grund statt Erfolg", say)
        pg.unroute("**/api/mc-vip/worlds"); pg.unroute("**/api/mc-vip/requests/r2"); pg.unroute("**/api/mc-vip")
        # Admin invited/trusted in a foreign world: exactly one card for it, unique input ids, still manageable.
        WIDC = "cccccccc-3333-4333-8333-333333333333"
        inv = dict(MANYBASE, worlds={"placeholder": False, "slots": [
            {"id": WIDA, "label": "Insel", "online": True, "players": 2, "max": 10, "tps": 20, "owner_name": "Nils", "owner": True, "visibility": "friends", "info": "", "type": "normal", "can_manage": True, "can_start": True},
            {"id": WIDC, "label": "Fremdwelt", "online": False, "players": 0, "max": 5, "tps": None, "owner_name": "Seller", "owner": False, "invited": True, "role": "trusted", "visibility": "friends", "info": "", "type": "flat", "can_manage": True, "can_start": True}]})
        pg.route("**/api/mc-vip", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(inv)))
        go("/vip"); pg.locator("#vip-admin-worlds").wait_for(timeout=10000)
        dup = pg.evaluate("() => { const ids = [...document.querySelectorAll('#vip [id]')].map(e => e.id); return ids.filter((x, i) => ids.indexOf(x) !== i); }")
        ok(pg.locator(f"#vip .v2-world[data-wid='{WIDC}']").count() == 1 and pg.locator(f"#vip-admin-worlds .v2-world[data-wid='{WIDC}']").count() == 1 and pg.locator("#v2-invited").count() == 0 and pg.locator(f"#vip .v2-world[data-wid='{WIDA}']").count() == 1 and not dup and pg.locator(f"#vip-admin-worlds .v2-world[data-wid='{WIDC}'] button[data-set=visibility]").count() >= 1, f"{w}px VIP-Admin: eingeladene Fremdwelt genau einmal, ids eindeutig", dup)
        pg.unroute("**/api/mc-vip")
        many = dict(MANYBASE, worlds={"placeholder": False, "slots": [{"id": "11111111-2222-4333-8444-%012d" % i, "label": "Welt %d" % i, "online": False, "players": 0, "max": 5, "tps": None, "owner_name": "Gast%d" % i, "owner": False, "visibility": "friends", "info": ""} for i in range(14)]})
        pg.route("**/api/mc-vip", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(many)))
        go("/vip"); pg.locator("#vip-admin-worlds").wait_for(timeout=10000); pg.wait_for_timeout(300)
        ok(pg.locator("#vip-admin-worlds .v2-world:visible").count() == 12 and pg.locator("#vip-admin-worlds button[data-more]").count() == 1, f"{w}px VIP-Admin: 12 Welten, Rest hinter 'Mehr anzeigen'", pg.locator("#vip-admin-worlds .v2-world:visible").count())
        pg.click("#vip-admin-worlds button[data-more]"); pg.wait_for_timeout(200)
        ok(pg.locator("#vip-admin-worlds .v2-world:visible").count() == 14 and pg.get_attribute("#vip-admin-worlds button[data-more]", "aria-expanded") == "true" and "Weniger anzeigen" in pg.inner_text("#vip-admin-worlds button[data-more]"), f"{w}px VIP-Admin: alle Welten nach Klick", pg.locator("#vip-admin-worlds .v2-world:visible").count())
        ok(pg.locator("#vip [style]").count() == 0 and pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px VIP-Admin: viele Welten ohne Overflow/Inline-Styles")
        pg.unroute("**/api/mc-vip")
        # 24-character world name: the name wraps, the rename button stays inside the card and visible (#97 review).
        long_ = dict(MANYBASE, worlds={"placeholder": False, "slots": [{"id": "22222222-3333-4444-8555-000000000001", "label": "abcdefghijklmnopqrstuvwx", "online": False, "players": 0, "max": 5, "tps": None, "owner_name": "Gast", "owner": False, "visibility": "friends", "info": "", "type": "flat", "can_manage": True, "can_start": True}]})
        pg.route("**/api/mc-vip", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(long_)))
        go("/vip"); pg.locator("#vip-admin-worlds .v2-world").first.wait_for(timeout=10000)
        geo = pg.evaluate("() => { const c = document.querySelector('#vip-admin-worlds .v2-world').getBoundingClientRect(); const b = document.querySelector('#vip-admin-worlds .v2-wname [data-rename]'); if (!b) return null; const r = b.getBoundingClientRect(); const n = document.querySelector('#vip-admin-worlds .v2-wn').getBoundingClientRect(); return [r.width, r.left - c.left, c.right - r.right, c.width, n.height]; }")
        ok(geo and geo[0] >= 24 and geo[1] >= 0 and geo[2] >= 0 and geo[3] >= min(w - 32, 288) and geo[4] < 30, f"{w}px VIP: 24-Zeichen-Name einzeilig (Ellipsis), Umbenennen-Button sichtbar, Karte nie schmal", geo)
        pg.unroute("**/api/mc-vip")
        now_s = int(time.time()); hour = 3600
        def bucket(back):
            return (now_s // hour - back) * hour
        hist, ticks = [], []
        for i, back in enumerate(range(48, 4, -3)):
            if i % 2 == 0: hist.append([bucket(back), 16.0 + (i % 4) * 0.05, 15.9, 16.3, 3])
            else: hist.append([bucket(back), 4.75, 4.75, 4.75, 0])
        for back in range(46, 5, -5):
            ticks.append([bucket(back) + 90, 16.14, 4.75, 0])
        flint = {"item": {"item": "flint", "buy_price": 16.2, "sell_price": 4.75, "base_price": 10, "buy_locked": 0, "sell_locked": 0, "volume_24h_qty": 8, "volume_24h_cp": 120, "trades_24h": 3, "change_24h_pct": 1, "updated_at": now_s, "has_hist": 1}, "price_reset_at": None, "history": hist, "ticks": ticks}
        def pvp_route(r):
            u = r.request.url.split("?")[0].rstrip("/")
            if u.endswith("/api/mc-pvp"):
                r.fulfill(status=200, content_type="application/json", body=json.dumps({"players": [
                    {"uuid": "u1", "name": "Nils", "wins": 2, "losses": 1, "draws": 0, "matches": 3, "winrate_pct": 67, "favorite_kit": None, "rank": None},
                    {"uuid": "u2", "name": "Gast", "wins": 1, "losses": 0, "draws": 0, "matches": 1, "winrate_pct": 100, "favorite_kit": "axe", "rank": None},
                ]}))
            elif u.endswith("/api/mc-pvp/Nils"):
                r.fulfill(status=200, content_type="application/json", body=json.dumps({"uuid": "u1", "name": "Nils", "wins": 1, "losses": 1, "draws": 0, "matches": 2, "winrate_pct": 50, "favorite_kit": "crystal", "rank": None}))
            else:
                r.fallback()
        pg.route("**/api/mc-pvp**", pvp_route)
        pg.route("**/api/mc-parkour", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"courses": {"house_climb": [{"rank": 1, "mc_uuid": U1x, "mc_name": "Nils", "time_ms": 7896, "set_at": "2026-11-01T17:54:04.541Z", "course_name": "House Climb", "course_icon": "ladder"}]}, "course_names": {"house_climb": "House Climb"}, "course_icons": {"house_climb": "ladder"}})))
        pg.route("**/api/mc-market/flint", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(flint)))
        go("/profile"); pg.locator("#t-minispiele").wait_for(timeout=20000); pg.click("#t-minispiele")
        pg.locator(".pk-card.pk-one").wait_for(timeout=10000)
        ptxt = pg.inner_text("#p-minispiele")
        ok("House Climb" in ptxt and "house_climb" not in ptxt and "Unentschieden" not in ptxt and "50 %" in ptxt, f"{w}px Profil: House Climb, Quote bei 2 Kämpfen, kein Unentschieden", ptxt[:420])
        ok(pg.locator(".pk-card.pk-one img[src='/mc-icon/v2/ladder']").count() == 1 and pg.locator(".pvp-arena .slotbox").count() == 3, f"{w}px Profil: Leiter-Icon, PvP-Karte ohne Unentschieden")
        pg.locator(".pk-card").screenshot(path=f"{SH}/local-house-climb-{w}.png")
        src3 = pg.evaluate("async () => await (await fetch('/mc/player3d.js')).text()")
        ok("pointermove" in src3 and "head.rotation.y" in src3 and "(tx-cx)*.08" in src3 and "visibilitychange" in src3, f"{w}px 3D-Kopf folgt der Maus und pausiert versteckt")
        go("/pvp"); pg.locator(".pvp-t").wait_for(timeout=10000)
        head, bodyp = pg.locator(".pvp-t thead").inner_text(), pg.inner_text(".pvp-t")
        ok("Unent" not in head and "Unentschieden" not in bodyp and "100 %" in bodyp and "Gast" in bodyp, f"{w}px PvP-Tabelle: Quote auch bei einem Kampf", head)
        go("/leaderboards"); pg.locator("#tabs [data-k=pvp]").wait_for(timeout=10000)
        tb = pg.locator("#tabs").inner_text()
        low = tb.casefold()
        ok("survival-kills" in low and "pvp" in low and "k/d" not in low and "arena" in low, f"{w}px Bestenlisten-Tabs nach Thema", tb)
        pg.click("#tabs [data-k=kills]"); pg.wait_for_timeout(200)
        ok("Survival" in pg.locator("#lbh").inner_text() and "Arena" in pg.locator("#lbh").inner_text(), f"{w}px Hinweis: Survival-Kills sind nicht die Arena", pg.locator("#lbh").inner_text())
        pg.click("#tabs [data-k=pvp]"); pg.locator("#out .pod").wait_for(timeout=10000)
        out = pg.inner_text("#out")
        ok("Gast" in out and "100 %" in out and "Siege" in out and pg.locator("#seg").is_hidden(), f"{w}px PvP-Tab: Siege und Quote, Woche/Gesamt ausgeblendet", out[:240])
        ok(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px PvP-Tab: kein horizontales Scrollen")
        go("/markt/flint"); pg.locator("#cw path[fill='none']").wait_for(timeout=10000)
        dln = pg.get_attribute("#cw path[fill='none']", "d") or ""
        ok("C" in dln and "H" not in dln and "V" not in dln, f"{w}px Flint: monotone Kurve", dln[:80])
        labels = pg.evaluate("""() => { const svg=document.querySelector('#cw svg'); const vb=svg.viewBox.baseVal.width; return [...svg.querySelectorAll('text')].filter(t => +t.getAttribute('x') > vb*0.72).map(t => t.textContent); }""")
        nums = []
        for lab in labels:
            try: nums.append(float(str(lab).replace(".", "").replace(",", ".")))
            except ValueError: pass
        ok(nums and min(nums) > 8, f"{w}px Flint: Flipflop-Snapshots nicht als Zacken in der Skala", labels)
        pg.locator("#cw").screenshot(path=f"{SH}/local-preis-glatt-{w}.png")
        crash = {"item": {"item": "nether_star", "buy_price": 2.4, "sell_price": 1, "base_price": 2, "buy_locked": 0, "sell_locked": 0, "volume_24h_qty": 4, "volume_24h_cp": 40, "trades_24h": 2, "change_24h_pct": -97, "updated_at": now_s, "has_hist": 1}, "price_reset_at": None, "ticks": [], "history": [[bucket(40), 100, 100, 100, 2], [bucket(30), 98, 96, 100, 1], [bucket(12), 2, 2, 2, 3], [bucket(6), 2.2, 2, 2.4, 2], [bucket(3), 2.4, 2.3, 2.5, 2]]}
        pg.route("**/api/mc-market/nether_star", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(crash)))
        go("/markt/nether_star"); pg.locator("#cw path[fill='none']").wait_for(timeout=10000)
        clab = pg.evaluate("""() => { const svg=document.querySelector('#cw svg'); const vb=svg.viewBox.baseVal.width; return [...svg.querySelectorAll('text')].filter(t => +t.getAttribute('x') > vb*0.72).map(t => t.textContent); }""")
        cnums = []
        for lab in clab:
            try: cnums.append(float(str(lab).replace(".", "").replace(",", ".")))
            except ValueError: pass
        ok(cnums and max(cnums) > 40 and min(cnums) < 20, f"{w}px Crash 100→2 bleibt in der Skala", clab)
        pg.unroute("**/api/mc-pvp**"); pg.unroute("**/api/mc-parkour"); pg.unroute("**/api/mc-market/flint"); pg.unroute("**/api/mc-market/nether_star")
        errs = [e for e in errs if e.strip() != "Event"]
        ok(not errs, f"{w}px keine Konsolen-/JS-Fehler", errs[:3])
        ctx.close()
        ctx = br.new_context(viewport={"width": w, "height": 900}); pg = ctx.new_page(); pg.route("**/*", route)
        pg.goto("https://" + H + "/vip", wait_until="domcontentloaded", timeout=45000); pg.locator("#vip .vip-ranks").wait_for(timeout=10000); vt = pg.inner_text("#vip")
        ok("Mit Discord anmelden" in vt and "Vorteile" in vt and "VIP" in vt and "MVP" in vt and "900" not in vt and pg.locator("#vip a.btn.discord").count() == 1, f"{w}px VIP anonym: Ränge und Login, kein Panel", vt[:240])
        ok(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px VIP anonym: kein horizontales Scrollen")
        pg.screenshot(path=f"{SH}/local-vip-anon-{w}.png", full_page=True)
        pg.goto("https://" + H + "/spieler/Nils", wait_until="domcontentloaded", timeout=45000); pg.wait_for_timeout(400); t = pg.inner_text("body")
        pg.locator(".pf-kpi").wait_for(timeout=10000); t = pg.inner_text("body"); ok(pg.locator(".pf-kpi .pf-tile").count() >= 1 and "nur für Mitspieler" in t, f"{w}px Spielerseite anonym: Details gesperrt", t[:300])
        ok(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px anonym: kein horizontales Scrollen")
        pg.screenshot(path=f"{SH}/local-spieler-nils-anon-{w}.png", full_page=True); ctx.close()
    P = "nwebnotfound.dev"; FB = "/mc-head/MHF_Steve/64?v=5"; FBP = "https://cdn.discordapp.com/embed/avatars/0.png"  # Hauptdomain: nur Discord, nie MC-Kopf
    GIF = bytes.fromhex("47494638396101000100800000ffffff00000021f90401000000002c000000000100010000020144003b")
    def chip(avatar, mc_name=None):
        def route_p(r):
            u = r.request.url
            if u.split("?", 1)[0].endswith("/api/me"):
                r.fulfill(status=200, content_type="application/json", body=json.dumps({"available": True, "user": {"id": "1", "name": "Nils<img>", "username": "ni'ls", "avatar": avatar, "mc_name": mc_name}}))
                return
            if "cdn.discordapp.com" in u:
                r.fulfill(status=200, content_type="image/gif", body=GIF)
                return
            if u.startswith("https://" + P):
                h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}; h["host"] = P; h["x-nnf-test-host"] = P
                try: r.fulfill(response=r.fetch(url=BASE + u[len("https://" + P):], headers=h, max_redirects=0))
                except Exception:
                    if "/mc-head/" not in u and "/mc-icon/" not in u: raise  # nav icons may still be in flight at close
                return
            r.continue_()
        ctx = br.new_context(viewport={"width": 1280, "height": 800}); ctx.add_cookies([{"name": "nnf_os", "value": "0", "domain": P, "path": "/", "secure": True}]); pg = ctx.new_page(); pg.route("**/*", route_p)
        pg.goto("https://" + P + "/portfolio", wait_until="domcontentloaded", timeout=45000); pg.locator("#umb img").wait_for(timeout=10000)
        info = pg.evaluate("""() => { const img = document.querySelector('#umb img'); const name = document.querySelector('#umb .u-name'); return { src: img ? img.src : '', attr: img ? img.getAttribute('onerror') : 'missing', xss: window.__xss || 0, name: name ? name.textContent : '', imgs: document.querySelectorAll('#umb img').length }; }""")
        ctx.close(); return info
    bad = chip('"><img src=x onerror=window.__xss=1>')
    ok(bad["xss"] == 0 and bad["attr"] is None and bad["src"].endswith(FBP) and bad["name"] == "Nils<img>" and bad["imgs"] == 1, "Portfolio-Chip: Avatar-Breakout bleibt Text, Fallback-Bild", bad)
    js = chip("javascript:alert(1)")
    ok(js["xss"] == 0 and js["attr"] is None and js["src"].endswith(FBP), "Portfolio-Chip: javascript-URL fällt auf Discord-Standard zurück", js)
    http = chip("http://cdn.discordapp.com/embed/avatars/0.png")
    ok(http["src"].endswith(FBP) and "http://cdn.discordapp.com" not in http["src"], "Portfolio-Chip: http-Avatar fällt auf Discord-Standard zurück", http)
    good = chip("https://cdn.discordapp.com/embed/avatars/0.png")
    ok(good["src"].startswith("https://cdn.discordapp.com/") and good["attr"] is None and good["xss"] == 0, "Portfolio-Chip: https-Avatar bleibt gesetzt", good)
    linked = chip("https://cdn.discordapp.com/embed/avatars/0.png", "Nils")
    ok(linked["src"].startswith("https://cdn.discordapp.com/") and "/mc-head/" not in linked["src"], "Portfolio-Chip: verknuepfter MC-Name zeigt auf der Hauptdomain trotzdem den Discord-Avatar", linked)
    me = {"avatar": "", "mc_name": None}
    def route_k(r):
        u = r.request.url
        if u.split("?", 1)[0].endswith("/api/me"):
            r.fulfill(status=200, content_type="application/json", body=json.dumps({"available": True, "user": {"id": "1", "name": "Nils", "username": "nils", "avatar": me["avatar"], "mc_name": me["mc_name"]}}))
            return
        if "cdn.discordapp.com" in u:
            r.fulfill(status=200, content_type="image/gif", body=GIF)
            return
        if u.startswith("https://" + H):
            h = {k: v for k, v in r.request.all_headers().items() if not k.startswith(":")}; h["host"] = H
            try: r.fulfill(response=r.fetch(url=BASE + u[len("https://" + H):], headers=h, max_redirects=0))
            except Exception:
                if "/mc-head/" not in u and "/mc-icon/" not in u: raise
            return
        r.continue_()
    kctx = br.new_context(viewport={"width": 1280, "height": 800}); kpg = kctx.new_page(); kpg.route("**/*", route_k)
    def konto(avatar, mc_name):
        me["avatar"], me["mc_name"] = avatar, mc_name
        kpg.goto("https://" + H + "/", wait_until="domcontentloaded", timeout=45000)
        kpg.wait_for_function("() => { const s = document.querySelector('#umb img') && document.querySelector('#umb img').src || ''; return s.includes('MHF_Steve') || s.includes('discordapp.com') || /\\/mc-head\\/[A-Za-z0-9_]+\\//.test(s) }", timeout=10000)
        src = kpg.locator("#umb img").get_attribute("src") or kpg.evaluate("document.querySelector('#umb img').src")
        # Vor dem Schließen auf ein Ende des Bild-Requests warten: der Route-Handler darf einen
        # noch laufenden Kopf-Request ignorieren (siehe oben), aber Playwright wirft beim
        # Browser.close() „Route.fulfill: Fetch response has been disposed", wenn genau dieser
        # Request noch fliegt. `complete` gilt für geladen UND für fehlgeschlagen.
        try: kpg.wait_for_function("() => { const i = document.querySelector('#umb img'); return !i || i.complete }", timeout=3000)
        except Exception: pass
        return {"src": src, "xss": kpg.evaluate("window.__xss || 0")}
    kb = konto('"><img src=x onerror=window.__xss=1>', None)
    ok(kb["xss"] == 0 and kb["src"].endswith(FB) and "onerror" not in kb["src"], "MC-Konto: Breakout-Avatar fällt auf Steve zurück", kb)
    kj = konto("javascript:alert(1)", None)
    ok(kj["xss"] == 0 and kj["src"].endswith(FB), "MC-Konto: javascript-URL fällt auf Steve zurück", kj)
    kg = konto("https://cdn.discordapp.com/embed/avatars/0.png", None)
    ok(kg["src"].endswith(FB) and kg["xss"] == 0, "MC-Konto: ohne MC-Verkn?pfung Steve", kg)
    kn = konto("javascript:alert(1)", "Nils")
    ok(kn["xss"] == 0 and "/mc-head/Nils/" in kn["src"], "MC-Konto: gültiger MC-Name schlägt den Avatar", kn)
    kctx.close()
    br.close()
sys.exit(1 if fails else 0)
