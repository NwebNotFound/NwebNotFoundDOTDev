#!/usr/bin/env python3
"""Vergleicht ein Mockup-Artboard mit der Umsetzung: nebeneinander als Bild plus Messtabelle.

Beispiel (im Wegwerf-Container, nach dem Screenshot-Lauf):

    python3 scripts/compare.py --slug vip --widths 1280 390

Erwartet im Ordner --out die Paare, die scripts/screens-mc-v2.mjs schreibt:
  mockup-<slug>-<w>.png   (Soll, aus /opt/data/mockups/summer-v2)
  neu-<slug>-<w>.png      (Ist, die laufende Seite)
und legt daraus compare-<slug>-<w>.png (links Soll, rechts Ist, gleicher Maßstab) ab.
Zahlen kommen aus report.json desselben Laufs (pageHeight/scrollWidth je Seite).

Der Vergleich komponiert die Bilder in Chromium (Playwright), damit im Container nichts
zusätzlich installiert werden muss (kein PIL nötig). Fehlt ein Bild, sagt das Skript klar,
welcher Screenshot-Lauf fehlt, statt etwas zu erfinden.
"""
import argparse
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_OUT = os.path.join(ROOT, "docs", "screens", "v2", "mc")
DEFAULT_MOCKUPS = "/opt/data/mockups/summer-v2"


def read_report(out):
    p = os.path.join(out, "report.json")
    if not os.path.exists(p):
        return {}
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return {}


def impl_row(report, slug, w):
    for e in (report.get("impl") or []):
        if os.path.basename(str(e.get("file", ""))).startswith("neu-" + slug + "-") and e.get("w") == w:
            return e
    return {}


def png_size(path):
    """Breite/Höhe ohne Fremdbibliothek: PNG-IHDR lesen."""
    with open(path, "rb") as fh:
        head = fh.read(33)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None, None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def compose(pairs, out_dir, slug, w, browser):
    """Soll und Ist nebeneinander in eine HTML-Seite, dann als ein PNG speichern."""
    def url(p):
        return "data:image/png;base64," + base64.b64encode(open(p, "rb").read()).decode()

    cells = []
    for label, path, tone in pairs:
        bw, bh = png_size(path)
        cells.append(
            f'<figure><figcaption><b>{label}</b><span>{os.path.basename(path)} · {bw}×{bh}px</span></figcaption>'
            f'<div class="shot"><img src="{url(path)}" alt=""></div></figure>'
        )
    h = max(png_size(p)[1] or 0 for _, p, _ in pairs) + 120
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
      body{{margin:0;background:#0a0d10;color:#e8eef7;font:14px/1.4 system-ui,sans-serif}}
      header{{padding:14px 18px;border-bottom:1px solid #23303a}}
      header b{{font-size:16px}} header span{{color:#8fa3b8;margin-left:10px}}
      .row{{display:flex;gap:18px;padding:18px;align-items:flex-start}}
      figure{{margin:0;flex:0 0 auto;max-width:{w}px}}
      figcaption{{display:flex;justify-content:space-between;gap:10px;padding:6px 2px;color:#8fa3b8;font-size:12px}}
      figcaption b{{color:#e8eef7;font-size:13px}}
      .shot{{width:{w}px;height:{h - 120}px;overflow:hidden;border:1px solid #23303a;border-radius:8px;background:#0e1418}}
      .shot img{{display:block;width:{w}px}}
    </style></head><body>
      <header><b>compare · {slug} · {w}px</b><span>links Soll (Mockup), rechts Ist (Umsetzung) · gleicher Maßstab</span></header>
      <div class="row">{''.join(cells)}</div>
    </body></html>"""
    page = browser.new_page(viewport={"width": 2 * w + 60, "height": min(h, 2000)})
    page.set_content(html, wait_until="load")
    page.wait_for_timeout(400)
    dest = os.path.join(out_dir, f"compare-{slug}-{w}.png")
    page.screenshot(path=dest, full_page=True)
    page.close()
    return dest


def main():
    ap = argparse.ArgumentParser(description="Mockup vs. Umsetzung vergleichen (Bild + Zahlen).")
    ap.add_argument("--slug", required=True, help="z. B. vip, home, markt")
    ap.add_argument("--widths", nargs="+", type=int, default=[1280, 390])
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--mockups", default=DEFAULT_MOCKUPS, help="nur für die Fehlermeldung")
    a = ap.parse_args()

    report = read_report(a.out)
    missing = []
    plan = []
    for w in a.widths:
        mock = os.path.join(a.out, f"mockup-{a.slug}-{w}.png")
        impl = os.path.join(a.out, f"neu-{a.slug}-{w}.png")
        if not os.path.exists(mock):
            missing.append(mock)
        if not os.path.exists(impl):
            missing.append(impl)
        plan.append((w, mock, impl))
    if missing:
        print("Fehlende Screenshots:", file=sys.stderr)
        for m in missing:
            print("  " + m, file=sys.stderr)
        print("\nErst rendern:  node scripts/screens-mc-v2.mjs --serve --mockups " + a.mockups, file=sys.stderr)
        return 2

    from playwright.sync_api import sync_playwright

    rows = []
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for w, mock, impl in plan:
            dest = compose([("Soll · Mockup", mock, 0), ("Ist · Umsetzung", impl, 1)], a.out, a.slug, w, br)
            mw, mh = png_size(mock)
            iw, ih = png_size(impl)
            r = impl_row(report, a.slug, w)
            rows.append({
                "w": w, "mock": (mw, mh), "impl": (iw, ih), "file": dest,
                "pageHeight": r.get("pageHeight"), "scrollWidth": r.get("scrollWidth"),
                "overflow": (r.get("scrollWidth") or w) > w,
            })
        br.close()

    print(f"compare: {a.slug}")
    print(f"{'Viewport':>8} | {'Soll (px)':>14} | {'Ist (px)':>14} | {'Δ Höhe':>8} | {'Ist ScrollW':>11} | Overflow | Bild")
    for r in rows:
        mw, mh = r["mock"]
        iw, ih = r["impl"]
        sw = r["scrollWidth"]
        print(f"{r['w']:>8} | {mw:>6}×{mh:<7} | {iw:>6}×{ih:<7} | {ih - mh:>+8} | {(str(sw) if sw else '–'):>11} | "
              f"{'ja' if r['overflow'] else 'nein':>8} | {os.path.relpath(r['file'], ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
