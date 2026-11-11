"""Builds the small name-badge stills in src/assets/badges/small.

The masters are 128px. Next to a name a badge is drawn about 18px tall, and a
browser or phone shrinking 128px that far on the fly leaves ragged edges. These
are shrunk once, properly (premultiplied alpha, Lanczos, a light sharpen), at
32, 64 and 96px for 1x, 2x and 3x screens.

  python3 scripts/build-badge-small.py
"""
import glob
import os
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'badges')
OUT = os.path.join(ROOT, 'small')
SIZES = ((32, ''), (64, '@2x'), (96, '@3x'))


def shrink(image, size):
    scaled = image.convert('RGBA').convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')
    alpha = scaled.split()[3]
    colour = scaled.convert('RGB').filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=0))
    return Image.merge('RGBA', (*colour.split(), alpha))


os.makedirs(OUT, exist_ok=True)
sources = {os.path.basename(p)[:-4]: p for p in glob.glob(os.path.join(ROOT, 'hover', '*.png'))}
# Killer Whale is drawn from its original still, not the hover poster.
sources['killer-whale'] = os.path.join(ROOT, 'Killer Whale.webp')
for name, path in sorted(sources.items()):
    master = Image.open(path)
    for size, suffix in SIZES:
        shrink(master, size).save(os.path.join(OUT, f'{name}{suffix}.webp'), lossless=True, quality=100, method=6)
print(f'{len(sources) * len(SIZES)} small badge stills written')
