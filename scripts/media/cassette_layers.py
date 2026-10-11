#!/usr/bin/env python3
"""Builds the two aligned layers used by the closing cassette's 3D tilt, without retouching the artwork.
   cassette-base.webp = the full cassette artwork, unchanged, with the black ground keyed to transparency
   cassette-lime.webp = an exact copy of only the lime parts (hubs, pins, monogram stroke), soft alpha
At rest the lime layer sits exactly on top of the same pixels in the base; when the cassette tilts, the lime
layer is a few px closer to the viewer (translateZ), which reads as physical thickness.
The reels cannot rotate: the monogram stroke runs across both hubs, so the hubs cannot be cut out cleanly.
Input: the site's own closing-cassette-2048.webp (built by build_media.py from portfolio page 95).
Usage: python3 scripts/media/cassette_layers.py
Requires Pillow and numpy."""
import numpy as np
from pathlib import Path
from PIL import Image, ImageFilter

img_dir = Path(__file__).resolve().parents[2] / 'public' / 'media' / 'img'
W = 800

src = Image.open(img_dir / 'closing-cassette-2048.webp').convert('RGB')
src = src.resize((W, round(src.height * W / src.width)), Image.LANCZOS)
im = np.asarray(src).astype(np.float32)
R, G, B = im[..., 0], im[..., 1], im[..., 2]

# base: luminance key of the pure black ground (dark plastic stays, the ground disappears)
mx = im.max(axis=2)
a_base = np.clip((mx - 3) / 22, 0, 1)
base = np.dstack([im, a_base * 255]).astype(np.uint8)
Image.fromarray(base, 'RGBA').save(img_dir / 'cassette-base.webp', quality=86, method=6)

# lime: hue-keyed copy of the acid parts
lime = np.clip((G - B - 70) / 60, 0, 1) * np.clip((R - 70) / 60, 0, 1) * np.clip((G - 110) / 60, 0, 1)
a = Image.fromarray((lime * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(0.6))
top = np.dstack([im, np.asarray(a)]).astype(np.uint8)
Image.fromarray(top, 'RGBA').save(img_dir / 'cassette-lime.webp', quality=90, method=6)
print('cassette-base.webp', 'cassette-lime.webp', src.size)
