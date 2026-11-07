#!/usr/bin/env python3
"""Builds public/nwebos/icons-32.png: the NwebOS icon set as a horizontal 32x32 sprite strip.

Each 16x16 pixel icon of the mockup (mockups/nwebos/src/art.py) is scaled 2x with nearest-neighbour
(crisp pixels, no smoothing). Cell n starts at x = 32 * n; the order is the ICONS order of art.py:
about, portfolio, blog, music, writing, guestbook, minecraft, trash, cat, mines, five.

Usage: python scripts/gen-nwebos-icons-32.py OUT.png MOCKUP_DIR   (MOCKUP_DIR = .../mockups/nwebos)
"""
import json
import sys
from pathlib import Path
from PIL import Image

out, src = Path(sys.argv[1]), Path(sys.argv[2])
lines = (src / "src" / "art.py").read_text(encoding="utf-8").split("\n")
start = next(i for i, l in enumerate(lines) if l.startswith("P = {"))
ns = {}
exec("\n".join(lines[start:]), ns)  # palette + icon grids only; skips the wallpaper writes above
P, ICONS = ns["P"], ns["ICONS"]
S = 32
order = list(ICONS)
sheet = Image.new("RGBA", (S * len(order), S), (0, 0, 0, 0))
for n, k in enumerate(order):
    if k == "minecraft":  # the 16x16 grass block image, not a pixel grid
        im = Image.open(src / "assets" / "img" / "grass_block.png").convert("RGBA")
    else:
        im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        for y, row in enumerate(ICONS[k]):
            for x, c in enumerate(row[:16]):
                if c in P:
                    h = P[c]
                    im.putpixel((x, y), tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    sheet.paste(im.resize((S, S), Image.NEAREST), (S * n, 0))
sheet.save(out, optimize=True)
print(json.dumps(order))
