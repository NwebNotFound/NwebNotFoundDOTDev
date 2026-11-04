#!/usr/bin/env python3
"""Generate ONLY a cow head from the Minecraft Java 1.21.11 texture.

Source © Mojang: https://github.com/InventivetalentDev/minecraft-assets/blob/1.21.11/assets/minecraft/textures/entity/cow/temperate_cow.png
Source SHA-256: 5106c2676c70d64b2af4bc0792cb4adfa75cf587d05cc370ee7c6ca01465efdc
CowModel UV boxes: head (0,0) 8x8x6, muzzle (1,33) 6x3x1,
 horns (22,0) 1x3x1. Front faces are composited at model positions.
Requires Pillow. Run: python scripts/gen-cow-head.py temperate-cow.png public/mc/heads/cow.png
The output path is explicit and this script does not touch other assets.
"""
import hashlib
import sys
from pathlib import Path
from PIL import Image

EXPECTED = '5106c2676c70d64b2af4bc0792cb4adfa75cf587d05cc370ee7c6ca01465efdc'
if len(sys.argv) != 3:
    raise SystemExit('Usage: python scripts/gen-cow-head.py SOURCE.png OUTPUT.png')
source, target = map(Path, sys.argv[1:])
if hashlib.sha256(source.read_bytes()).hexdigest() != EXPECTED:
    raise SystemExit('Unexpected source texture SHA-256')
im = Image.open(source).convert('RGBA')
if im.size != (64, 64):
    raise SystemExit('Expected a 64x64 texture')
canvas = Image.new('RGBA', (10, 10))
canvas.alpha_composite(im.crop((6, 6, 14, 14)), (1, 1))
canvas.alpha_composite(im.crop((2, 34, 8, 37)), (2, 6))
horn = im.crop((23, 1, 24, 4))
canvas.alpha_composite(horn, (0, 0))
canvas.alpha_composite(horn, (9, 0))
canvas.resize((64, 64), Image.Resampling.NEAREST).save(target, optimize=True)
