"""Capture the real mock-backed panel without relaxing its CSP, for compare.py."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('/work/out')
out.mkdir(exist_ok=True)
base = 'http://127.0.0.1:8788'
views = os.environ.get('AI_CAPTURE_VIEWS', 'chat,bots,crew,cron,usage,log').split(',')
with sync_playwright() as p:
    browser = p.chromium.launch()
    for name in views:
        for width in (1280, 390):
            height = 900 if width == 1280 else 844
            ctx = browser.new_context(viewport={'width': width, 'height': height}, color_scheme='dark', reduced_motion='no-preference')
            ctx.request.get(base + '/__dev/login')
            page = ctx.new_page()
            response = page.goto(base, wait_until='networkidle')
            assert "style-src 'self'" in response.headers.get('content-security-policy', '')
            page.wait_for_selector('html[data-auth="in"]')
            page.wait_for_timeout(500)
            if name == 'chat':
                page.fill('#input', 'Deploy check')
                page.click('#btn-send')
                page.wait_for_selector('.approval', timeout=10000)
            else:
                if width == 390:
                    page.click('#btn-menu')
                page.click(f'#side-nav [data-view="{name}"]')
                page.wait_for_selector(f'#view-{name}.active')
            page.wait_for_timeout(1500)
            metrics = page.evaluate('''() => ({doc:document.documentElement.scrollWidth, width:innerWidth,
              view:document.querySelector('.view.active').scrollWidth,
              client:document.querySelector('.view.active').clientWidth,
              buttons:[...document.querySelectorAll('.approval .actions button')].map(b => b.getBoundingClientRect().height)})''')
            assert metrics['doc'] <= metrics['width'], (name, width, metrics)
            assert metrics['view'] <= metrics['client'], (name, width, metrics)
            if name == 'chat' and width == 390:
                assert len(metrics['buttons']) == 4 and min(metrics['buttons']) >= 44, metrics
            # The app's strict CSP forbids injected style tags. CSSOM is the same
            # non-weakening approach as the checked-in screenshot harness.
            page.evaluate("document.styleSheets[0].insertRule('*{animation-play-state:paused!important;caret-color:transparent!important}', document.styleSheets[0].cssRules.length)")
            page.screenshot(path=str(out / f'source-{name}-{width}.png'), full_page=True)
            print(name, width, 'view=', page.locator('.view.active').get_attribute('id'), 'auth=', page.locator('html').get_attribute('data-auth'), flush=True)
            ctx.close()
        (out / f'wrapper-{name}.html').write_text(f'''<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{{margin:0}}img{{display:block;width:100%;height:auto}}</style><picture><source media="(max-width:600px)" srcset="source-{name}-390.png"><img src="source-{name}-1280.png" alt="actual panel capture"></picture>''')
    browser.close()
