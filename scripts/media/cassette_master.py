#!/usr/bin/env python3
"""Builds the ONE closing cassette image (single flattened artwork, no layers).

From portfolio page 95 (288ppi "Artboard 101.jpg"):
  1. crop the cassette;
  2. remove the outlined monogram stroke and the overlapping tagline. Both are the flat vector lime
     (#D7FF00 = 215,255,0); the photographed lime hubs are never that exact value, so the mask is exact;
  3. fill the stroke with OpenCV inpainting, and rebuild the bottom rail behind the old tagline by cloning
     the clean rail just to its left;
  4. draw ONE tape path: out of the bottom-right roller, down and under the cassette, ending on its centre;
  5. set the tagline once, small, below the tape: TAPE ENDS. / THE WORK DOESN'T. (Albertus);
  6. key the black ground to transparency and export AVIF + WebP.

Usage: python3 scripts/media/cassette_master.py "../288ppi/Artboard 101.jpg"
Requires Pillow (with AVIF), numpy, opencv-python, fonttools + brotli (to read the Albertus woff2).
"""
import sys, math, io
from pathlib import Path
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[2]
src = sys.argv[1] if len(sys.argv) > 1 else str(ROOT.parent / '288ppi' / 'Artboard 101.jpg')
out_dir = ROOT / 'public' / 'media' / 'img'
BOX = (2560, 250, 5050, 4100)          # 4x artboard px
LIME = (215, 255, 0)

c = np.asarray(Image.open(src).convert('RGB'))[BOX[1]:BOX[3], BOX[0]:BOX[2]].copy()
R, G, B = [c[..., i].astype(int) for i in range(3)]

# 2. exact-colour mask of the vector lime (monogram outline + tagline)
core = ((G >= 250) & (R >= 209) & (R <= 220) & (B <= 8)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(core, 8)
keep = np.zeros_like(core)
for i in range(1, n):
    if st[i, cv2.CC_STAT_AREA] > 150 or max(st[i, 2], st[i, 3]) > 40:
        keep[lab == i] = 1
mask = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))

# 3. inpaint, then clone the rail behind the old tagline
out = cv2.inpaint(np.ascontiguousarray(c[..., ::-1]), mask, 9, cv2.INPAINT_TELEA)[..., ::-1].astype(np.float32)
H0, W = keep.shape
m = np.zeros((H0, W), np.uint8)
m[3380:3540, 900:1640] = keep[3380:3540, 900:1640]
m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (35, 35)))
m[:3360] = 0
a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 5)[..., None]
xs = np.arange(W)
srcx = np.where((xs >= 900) & (xs < 1660), 590 + ((xs - 590) % 330), xs)
res = out * (1 - a) + c.astype(np.float32)[:, srcx] * a
res[3530:] = out[3530:]
res = np.clip(res, 0, 255).astype(np.uint8)

# 4 + 5. one tape path and one tagline
tmp = io.BytesIO()
f = TTFont(ROOT / 'public' / 'fonts' / 'albertus-medium.woff2'); f.flavor = None; f.save(tmp); tmp.seek(0)
font = ImageFont.truetype(tmp, 92)
cx = (167 + 2343) / 2                  # shell centre
x0, ytan, Rr = 1954, 3152, 110         # tangent point on the bottom-right roller, bend radius
yh = 3549 + 125                        # tape runs under the cassette
lead = int(92 * 1.14)
ttop = yh + 100
H = ttop + lead * 2 + 70
canvas = np.zeros((H, W, 3), np.uint8)
canvas[:min(H0, H)] = res[:min(H0, H)]
canvas[3600:] = 0
canvas = Image.fromarray(canvas)
S = 4
layer = Image.new('L', (W * S, H * S), 0)
d = ImageDraw.Draw(layer)
pts = [(x0, ytan), (x0, yh - Rr)] + [(x0 - Rr + Rr * math.cos(math.radians(k)), yh - Rr + Rr * math.sin(math.radians(k))) for k in range(0, 91, 3)] + [(cx, yh)]
P = [(x * S, y * S) for x, y in pts]
w = 15 * S
d.line(P, fill=255, width=w, joint='curve')
for x, y in (P[0], P[-1]):
    d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=255)
canvas.paste(Image.new('RGB', (W, H), LIME), (0, 0), layer.resize((W, H), Image.LANCZOS))
dt = ImageDraw.Draw(canvas)
for i, t in enumerate(['TAPE ENDS.', 'THE WORK DOESN’T.']):
    dt.text((cx - dt.textlength(t, font=font) / 2, ttop + i * lead), t, font=font, fill=LIME)

# 6. key the black ground, export
arr = np.asarray(canvas).astype(np.float32)
alpha = np.clip((arr.max(axis=2) - 3) / 22, 0, 1) * 255
rgba = Image.fromarray(np.dstack([arr, alpha]).astype(np.uint8), 'RGBA')
for wpx in (720, 1100):
    im = rgba.resize((wpx, round(wpx * H / W)), Image.LANCZOS)
    im.save(out_dir / f'closing-cassette-master-{wpx}.webp', quality=80, method=6)
    im.save(out_dir / f'closing-cassette-master-{wpx}.avif', quality=58)
print('closing-cassette-master', W, H, round(W / H, 4))
