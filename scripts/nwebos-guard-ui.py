#!/usr/bin/env python3
"""NwebOS phone style guard (e2e-browser): every route at 375 and 430, signed in and out, day and night.
Fails on and lists every offender:
- horizontal overflow (scrollWidth > viewport);
- an input, select, textarea or button that still looks like the browser default: the same background, border and
  font as a fresh element of that kind in a blank document (measured, not guessed), or appearance:auto on a
  text field or select (iOS draws its own pill/box then);
- a visible tap target (button, a, input, select, textarea, [role=button], summary) smaller than MIN x MIN px;
- markup of the old site nav/header (.u-bar, .u-brand, #u-panel, …) inside NwebOS.
Args: BASE [COOKIE] ; env GUARD_MIN (default 44), GUARD_ROUTES (comma list, default all)."""
import os
import sys
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
COOKIE = sys.argv[2] if len(sys.argv) > 2 else ""
MIN = int(os.environ.get("GUARD_MIN", "44"))
# profile switches (.p3s): scrolled to the middle, the tappable height/width = how far from the centre a tap still
# lands on the switch (elementFromPoint), so clipping or overlap counts
SWITCHES = r"""() => [...document.querySelectorAll(".win.focus .p3s")].map((s) => { s.scrollIntoView({ block: "center" });
  const r = s.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const on = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === s || s.contains(e)); };
  const reach = (dx, dy) => { let n = 0; while (n < 60 && on(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
  return [s.dataset.p3Pref, reach(-1, 0) + reach(1, 0) + 1, reach(0, -1) + reach(0, 1) + 1]; })"""
H = "nwebnotfound.dev"
GIF = bytes.fromhex("47494638396101000100800000ffd23f00000021f90401000000002c000000000100010000020144003b")
ROUTES = ["/", "/about", "/portfolio", "/blog", "/blog/eine-navigation-fuer-zwei-seiten", "/music", "/writing", "/guestbook",
          "/trash", "/profile", "/changelog", "/pixelwand", "/sommerfest", "/blog/admin"]
if os.environ.get("GUARD_ROUTES"):
    ROUTES = os.environ["GUARD_ROUTES"].split(",")

PROBE = r"""(min) => {
  const out = [];
  const frame = document.createElement("iframe"); frame.style.cssText = "position:absolute;width:0;height:0;border:0"; document.body.appendChild(frame);
  const fd = frame.contentDocument; fd.open(); fd.write("<!doctype html><body></body>"); fd.close();
  const ua = {};
  const key = (el) => el.tagName + ":" + (el.getAttribute("type") || "");
  const sig = (cs) => [cs.backgroundColor, cs.borderTopStyle, cs.borderTopWidth, cs.borderTopColor, cs.fontFamily].join("|");
  const uaSig = (el) => { const k = key(el); if (!(k in ua)) { const x = fd.createElement(el.tagName); if (el.getAttribute("type")) x.setAttribute("type", el.getAttribute("type")); fd.body.appendChild(x); ua[k] = sig(frame.contentWindow.getComputedStyle(x)); } return ua[k]; };
  const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("placeholder") || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && el.offsetParent !== null && r.bottom > 0 && r.top < innerHeight * 3; };
  for (const el of document.querySelectorAll("input:not([type=hidden]),select,textarea,button")) {
    if (!visible(el) || el.closest("#boot,#login[hidden],#off")) continue;
    const cs = getComputedStyle(el);
    if (sig(cs) === uaSig(el)) out.push(["ua-look", el.tagName.toLowerCase(), label(el)]);
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (el.tagName === "INPUT" && t === "search" && (cs.appearance || cs.webkitAppearance) !== "none") out.push(["ua-appearance", "input[search]", label(el)]);   // iOS draws its own grey pill
  }
  /* the effective hit area: the box, grown by an absolutely positioned ::after/::before overlay (rule (c): the look keeps
     Designer's size, the tap area is larger and invisible) */
  const hit = (el) => { const r = el.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (const ps of ["::after", "::before"]) { const c = getComputedStyle(el, ps); if (c.content === "none" || c.content === "normal" || c.position !== "absolute") continue;
      /* left/top/right/bottom of an absolute pseudo count from the padding box (inside the border) */
      const px = (v) => (v.endsWith("px") ? parseFloat(v) : 0), es = getComputedStyle(el), bl = px(es.borderLeftWidth), bt = px(es.borderTopWidth), br = px(es.borderRightWidth), bb = px(es.borderBottomWidth);
      L = Math.min(L, r.left + bl + px(c.left)); T = Math.min(T, r.top + bt + px(c.top)); R = Math.max(R, r.right - br - px(c.right)); B = Math.max(B, r.bottom - bb - px(c.bottom)); }
    /* verify each grown side with elementFromPoint (an overlay clipped by an overflow parent or covered by a neighbour
       does not count); only inside the viewport, elsewhere the computed box stands */
    /* only points inside the visible part of the element's window content (not under the title bar, the bottom bar or
       outside the scrolled area): elsewhere the computed box stands */
    const wc = el.closest(".wc"), vb = wc ? wc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const mx = (L + R) / 2, my = (T + B) / 2, inV = (x, y) => x >= Math.max(0, vb.left) && y >= Math.max(0, vb.top) && x < Math.min(innerWidth, vb.right) && y < Math.min(innerHeight, vb.bottom) && !(document.querySelector(".mbar") && y >= document.querySelector(".mbar").getBoundingClientRect().top && getComputedStyle(document.querySelector(".mbar")).display !== "none");
    const hits = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, onTop = inV(cx, cy) && hits(cx, cy);   // covered elements (a window behind) are not checked
    if (onTop && T < r.top && inV(mx, T + 1) && !hits(mx, T + 1)) T = r.top;
    if (onTop && B > r.bottom && inV(mx, B - 1) && !hits(mx, B - 1)) B = r.bottom;
    if (onTop && L < r.left && inV(L + 1, my) && !hits(L + 1, my)) L = r.left;
    if (onTop && R > r.right && inV(R - 1, my) && !hits(R - 1, my)) R = r.right;
    return { left: L, top: T, right: R, bottom: B, w: R - L, h: B - T }; };
  const targets = [];
  for (const el of document.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,[role=button],summary")) {
    if (!visible(el) || el.closest("#boot,#off,.nojs-h,.post p,.post li,.pft p,.rxn,.hint,.edfoot span,.tl ul li p,.crumb2")) continue;   // inline text links are not tap targets
    if (el.parentElement && el.parentElement.closest("button,a[href],summary")) continue;   // nested (a button inside a link row)
    targets.push([el, hit(el)]);
  }
  const gap = (a, b) => Math.max(0, Math.max(a.left - b.right, b.left - a.right)) + Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom)) === 0 ? 0 : Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom));
  for (const [el, h] of targets) {
    if (Math.round(h.w) >= min && Math.round(h.h) >= min) continue;
    // dense rows (chips, segmented controls): >= 40 if 8px or more from every other target's hit area
    if (Math.round(h.w) >= 40 && Math.round(h.h) >= 40 && targets.every(([o, oh]) => o === el || gap(h, oh) >= 8)) continue;
    const sel = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
    out.push(["tap", sel, label(el) + " " + Math.round(h.w) + "x" + Math.round(h.h)]);
  }
  for (const s of [".u-bar", ".u-brand", ".u-burger", "#u-panel", "#u-sites", ".u-seg", "header.site", "nav.site"]) if (document.querySelector(s)) out.push(["old-nav", s, ""]);
  if (document.documentElement.scrollWidth > innerWidth) out.push(["h-overflow", "page", document.documentElement.scrollWidth + " > " + innerWidth]);
  frame.remove();
  return out;
}"""


def ctx_for(br, width, night, cookie=""):
    c = br.new_context(viewport={"width": width, "height": 812 if width < 400 else 932}, device_scale_factor=2, has_touch=True, is_mobile=True)
    c.add_init_script("try{localStorage.setItem('nwebos.booted','1');localStorage.setItem('nwebos.user','gast');%s}catch(e){}" % ("localStorage.setItem('summer-theme','summer-night');" if night else ""))
    if cookie:
        n, v = cookie.split("=", 1)
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


with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"
    br = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    found = []
    for who in (["guest", "signed-in"] if COOKIE else ["guest"]):
        for width in (375, 430):
            for night in (False, True):
                c = ctx_for(br, width, night, COOKIE if who == "signed-in" else ""); pg = c.new_page()
                for path in ROUTES:
                    if path == "/blog/admin" and who == "guest":
                        continue
                    pg.goto(f"https://{H}{path}", wait_until="load")
                    if path != "/":
                        pg.locator(".win.focus .wc").first.wait_for(timeout=10000)
                    pg.wait_for_timeout(500)
                    for kind, what, info in pg.evaluate(PROBE, MIN):
                        found.append((path, f"{who} {width} {'night' if night else 'day'}", kind, what, info))
                    if path == "/profile" and who == "signed-in":   # the settings pane is hidden until its tab is tapped
                        tb = pg.locator('.win.focus [data-pane="pf-s"], .win.focus [data-pane="p3-set"]').first
                        if tb.count():
                            tb.click(); pg.wait_for_timeout(250)
                            for kind, what, info in pg.evaluate(PROBE, MIN):
                                if kind == "tap": found.append(("/profile (Einstellungen)", f"{who} {width} {'night' if night else 'day'}", kind, what, info))
                            for key, hw, hh in pg.evaluate(SWITCHES):
                                if hw < MIN or hh < MIN: found.append(("/profile (Einstellungen)", f"{who} {width} {'night' if night else 'day'}", "tap", f"switch {key}", f"{hw}x{hh}"))
                    if path == "/guestbook":   # the error toast of a failed Discord sign-in (?login=failed)
                        pg.goto(f"https://{H}/guestbook?login=failed", wait_until="load"); pg.locator(".toast.err").wait_for(timeout=5000); pg.wait_for_timeout(200)
                        for kind, what, info in pg.evaluate(PROBE, MIN):
                            if kind == "tap" and ("xpbtn" in what or "Nochmal" in info): found.append(("/guestbook?login=failed", f"{who} {width} {'night' if night else 'day'}", kind, what, info))
                    if path == "/":   # states that only exist after a tap: the quick sheet, the search with text
                        where = f"{who} {width} {'night' if night else 'day'}"
                        pg.locator("[data-quick]").click(); pg.locator(".shx.qs").wait_for(); pg.wait_for_timeout(300)
                        for kind, what, info in pg.evaluate(PROBE, MIN):
                            if kind == "tap" or kind == "ua-look": found.append(("/ (quick sheet)", where, kind, what, info))
                        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
                        pg.locator("#hq").fill("bl"); pg.wait_for_timeout(300)
                        for kind, what, info in pg.evaluate(PROBE, MIN):
                            if kind == "tap" and ("clr" in what or "Suche leeren" in info): found.append(("/ (search)", where, kind, what, info))
                        pg.locator(".hsearch .cnl").click(); pg.wait_for_timeout(150)
                c.unroute_all(behavior="ignoreErrors"); c.close()
    br.close()
    # one line per offender (deduplicated over day/night and widths where identical)
    seen, sizes = {}, {}
    for path, where, kind, what, info in found:
        k = (path, kind, what, " ".join(info.split(" ")[:-1]) if kind == "tap" else info)
        seen.setdefault(k, []).append(where); sizes.setdefault(k, set()).add(info.split(" ")[-1] if kind == "tap" else "")
    for (path, kind, what, info), wheres in sorted(seen.items()):
        sz = "/".join(sorted(sizes[(path, kind, what, info)]))
        print(f"  OFFENDER {kind:14} {path:40} {what:9} {(info + ' ' + sz).strip()[:70]:70} [{', '.join(sorted(set(wheres)))}]")
    if seen:
        print(f"FAIL nwebos style guard: {len(seen)} offender(s)"); sys.exit(1)
    print(f"PASS nwebos style guard: {len(ROUTES)} routes at 375/430, day+night, no offenders (tap >= {MIN}px)")
