#!/usr/bin/env python3
"""Exercise real local pages with a mock challenge API and mocked submit endpoints."""
import os
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
TOKEN = "mock-successful-challenge"
MOCK = """
window.mockChallenge={renders:0,resets:0};
window.turnstile={render(host){
  if(!host.dataset.sitekey)throw Error('missing sitekey');
  mockChallenge.renders++;
  const input=document.createElement('input');input.type='hidden';input.name='cf-turnstile-response';host.append(input);
  const button=document.createElement('button');button.type='button';button.textContent='Complete mock challenge';
  button.onclick=()=>{input.value='mock-successful-challenge'};host.append(button);
  return 'mock-widget';
},reset(){mockChallenge.resets++;document.querySelector('[name="cf-turnstile-response"]').value=''}};
"""

with sync_playwright() as p:
    chrome = "/usr/bin/google-chrome"  # CI container; elsewhere Playwright's own Chromium
    browser = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
    for width in (375, 1280):
        for surface, eligible in (("guest", False), ("guest", True), ("bank", False), ("bank", True)):
            host = "nwebnotfound.dev" if surface == "guest" else "mc.nwebnotfound.dev"
            context = browser.new_context(viewport={"width": width, "height": 900})
            context.add_cookies([{"name": "nnf_os", "value": "0", "domain": "nwebnotfound.dev", "path": "/", "secure": True}])  # the current guestbook page (NwebOS has its own test)
            page = context.new_page()
            scripts, submissions = [], []

            def intercept(route):
                request = route.request
                url = urlsplit(request.url)
                if url.netloc == "challenges.cloudflare.com":
                    scripts.append(request.url)
                    route.fulfill(content_type="application/javascript", body=MOCK)
                    return
                if url.netloc != host:
                    route.abort()
                    return
                if url.path == "/api/me":
                    route.fulfill(json={"available": True, "user": {"name": "Test", "avatar": ""} if eligible else None})
                elif url.path == "/api/guestbook":
                    if request.method == "POST":
                        submissions.append(request.post_data_json)
                        route.fulfill(status=201, json={"ok": True})
                    else:
                        route.fulfill(json={"entries": []})
                elif url.path == "/api/mc-market/diamond":
                    route.fulfill(json={"item": {"item": "diamond", "buy_price": 1100, "buy_locked": False}, "history": []})
                elif url.path == "/api/mc-bestellungen":
                    route.fulfill(json={"logged_in": eligible, "can": eligible, "linked": eligible, "orders": []})
                elif url.path == "/api/mc-shop-order":
                    submissions.append(request.post_data_json)
                    route.fulfill(status=202, json={"ok": True, "status": "pending"})
                elif url.path.startswith("/api/"):
                    route.fulfill(json={})
                else:
                    headers = {k: v for k, v in request.all_headers().items() if not k.startswith(":")}
                    headers["host"] = host
                    headers["x-nnf-test-host"] = host
                    route.fulfill(response=route.fetch(url=BASE + url.path + ("?" + url.query if url.query else ""), headers=headers))

            page.route("**/*", intercept)
            page.goto("https://" + host + ("/guestbook" if surface == "guest" else "/markt/diamond"))
            if not eligible:
                page.wait_for_selector("#compose a.discord" if surface == "guest" else "#bbuy a.discord")
                assert not scripts, (width, surface, "challenge loaded without a form")
                assert page.locator(".cf-turnstile").count() == 0
            else:
                page.get_by_role("button", name="Complete mock challenge").wait_for()
                assert len(scripts) == 1 and "render=explicit" in scripts[0]
                assert page.evaluate("mockChallenge.renders") == 1
                page.get_by_role("button", name="Complete mock challenge").click()
                if surface == "guest":
                    page.locator("#m").fill("A mock challenge submission")
                    page.locator("#f button:not([type=button])").click()
                    page.wait_for_function("document.querySelector('#st').textContent==='Danke!'")
                    assert submissions == [{"message": "A mock challenge submission", "token": TOKEN}]
                else:
                    page.locator("#bba").fill("3")
                    page.locator("#bbb").click()
                    page.wait_for_function("document.querySelector('#bbm').textContent.includes('Kauf gesendet')")
                    assert len(submissions) == 1
                    body = submissions[0]
                    assert body["turnstile"] == TOKEN and body["type"] == "bank_buy" and body["item"] == "diamond" and body["amount"] == 3
                    assert body["request_id"]
                assert page.evaluate("mockChallenge.resets") == 1
                assert page.locator('[name="cf-turnstile-response"]').input_value() == ""
                assert len(scripts) == 1, "submission must not reload the API"
            print(f"PASS {width}px {surface} eligible={eligible}")
            page.unroute_all(behavior="ignoreErrors")
            context.close()
    browser.close()
