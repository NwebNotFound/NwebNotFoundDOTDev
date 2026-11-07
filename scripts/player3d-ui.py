#!/usr/bin/env python3
"""3D player viewer on a seeded profile: renders the mocked skin, pauses off-screen, resumes, max 30 fps.

Runs against the local worker after e2e.mjs has seeded the player "Nils". Only the skin PNG and
external hosts are mocked; the profile page, its APIs and player3d.js are the real local ones.
"""
import os
import struct
import sys
import zlib
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE, HOST, NAME = sys.argv[1], "mc.nwebnotfound.dev", "Nils"


def skin_png():
    # 64x64 RGBA skin, opaque in every pixel so all body parts render.
    row = b"\x00" + bytes((40 + x * 3, 90, 160 - x * 2, 255)[i] for x in range(64) for i in range(4))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 64, 64, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(row * 64)) + chunk(b"IEND", b""))


SKIN = skin_png()
# Counts animation frames with at least one WebGL draw call (the viewer is the only WebGL user here).
COUNT = """
window.__draws=0;let tick=0,last=-1;(function t(){tick++;requestAnimationFrame(t)})();
for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
  if (!C) continue;
  for (const m of ['drawElements','drawArrays']) { const f=C.prototype[m]; C.prototype[m]=function(){if(last!==tick){last=tick;window.__draws++}return f.apply(this,arguments)}; }
}
"""

with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"  # CI container; elsewhere Playwright's own Chromium
    browser = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    for width in (375, 1280):
        context = browser.new_context(viewport={"width": width, "height": 800})
        context.add_init_script(COUNT)
        page = context.new_page()
        skins = []

        def intercept(route):
            url = urlsplit(route.request.url)
            if url.netloc != HOST:
                route.abort()
            elif url.path.startswith("/mc-skin/"):
                skins.append(url.path)
                route.fulfill(content_type="image/png", body=SKIN)
            else:
                headers = {k: v for k, v in route.request.all_headers().items() if not k.startswith(":")}
                headers["host"] = HOST
                route.fulfill(response=route.fetch(url=BASE + url.path + ("?" + url.query if url.query else ""), headers=headers))

        page.route("**/*", intercept)
        page.goto(f"https://{HOST}/spieler/{NAME}", wait_until="domcontentloaded")
        page.locator(".pf-hd .m3d.ready").wait_for(timeout=30000)
        assert skins and skins[0] == f"/mc-skin/{NAME}", skins
        if width == 375:
            # Phone: one static frame as <img>, no live WebGL loop.
            assert page.locator(".pf-hd .m3d img.m3d-still").count() == 1
            assert page.locator(".pf-hd .m3d canvas").count() == 0
            page.evaluate("__draws=0"); page.wait_for_timeout(1000)
            assert page.evaluate("__draws") == 0, "static viewer keeps drawing"
            print(f"PASS {width}px static frame, no draw loop")
        else:
            assert page.locator(".pf-hd .m3d canvas").count() == 1
            page.evaluate("__draws=0"); page.wait_for_timeout(1000)
            on = page.evaluate("__draws")
            assert 5 <= on <= 40, f"visible viewer draws {on}/s, expected live and capped at 30 fps"
            # Off-screen: the viewer stops drawing.
            page.evaluate("document.body.insertAdjacentHTML('beforeend','<div style=\"height:4000px\"></div>');scrollTo(0,document.body.scrollHeight)")
            page.wait_for_function("() => document.querySelector('.pf-hd .m3d').getBoundingClientRect().bottom < 0")
            page.wait_for_timeout(300); page.evaluate("__draws=0"); page.wait_for_timeout(1000)
            off = page.evaluate("__draws")
            assert off == 0, f"off-screen viewer still draws {off}/s"
            # Back on screen: it resumes.
            page.evaluate("scrollTo(0,0)"); page.wait_for_timeout(300); page.evaluate("__draws=0"); page.wait_for_timeout(1000)
            back = page.evaluate("__draws")
            assert 5 <= back <= 40, f"viewer did not resume ({back}/s)"
            print(f"PASS {width}px live viewer {on}/s, off-screen {off}/s, resumed {back}/s")
        page.unroute_all(behavior="ignoreErrors")
        context.close()
    browser.close()
