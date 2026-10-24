#!/usr/bin/env python3
"""The trees' needles and leaves, from photographs: art/tex/needle.png and art/tex/leaf.png.

    python3 reckoning/tools/make_foliage.py

From ambientCG's CC0 atlases (ambientcg.com), fetched once into tools/blender/assets/acg: LeafSet019, three sprays of
a conifer, for the spruces' and pines' boughs; LeafSet016 (oak) and LeafSet005 (beech), single leaves, scattered into
a spray for the broadleaves' crowns. Cut out by their own opacity, and made grey (the photograph's light and dark kept,
its green taken out) so each kind of tree, and each tree, keeps its own green from its material.

The layout is the game's (see foliageTex in js/models.js): a needle card runs from the trunk at the left to the tip at
the right along its middle; and in the bottom-left corner a small solid square, for the dense heart of a crown.
"""
import pathlib
import random

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ACG = HERE / "blender" / "assets" / "acg"
OUT = HERE.parent / "art" / "tex"
S = 512
CORNER = 32


def cut(name):
    c = Image.open(ACG / name / f"{name}_1K-JPG_Color.jpg").convert("RGB")
    a = Image.open(ACG / name / f"{name}_1K-JPG_Opacity.jpg").convert("L")
    return c, a


def grey(c, a, mean=0.62):
    """The photograph's luminance, scaled so the cut-out part averages `mean` (the old drawn textures' level)."""
    g = np.asarray(c.convert("L"), dtype=np.float32) / 255
    m = np.asarray(a, dtype=np.float32) / 255
    avg = (g * m).sum() / max(m.sum(), 1)
    g = np.clip(g * (mean / max(avg, 1e-3)), 0, 1)
    return Image.fromarray((g * 255).astype(np.uint8)), a


def blobs(alpha, min_px=400):
    """Each separate piece of the atlas (a spray, a leaf), as a box: its connected pieces of opacity."""
    a = np.asarray(alpha) > 100
    seen = np.zeros_like(a)
    H, W = a.shape
    out = []
    for y in range(0, H, 3):
        for x in range(0, W, 3):
            if a[y, x] and not seen[y, x]:
                st = [(y, x)]; seen[y, x] = True; x0 = x1 = x; y0 = y1 = y; n = 0
                while st:
                    cy, cx = st.pop(); n += 1
                    x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and a[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; st.append((ny, nx))
                if n >= min_px:
                    out.append((x0, y0, x1 + 1, y1 + 1, n))
    return out


def paste(dst, dst_a, g, a, box, at, size, angle=0):
    piece, mask = g.crop(box), a.crop(box)
    piece = piece.resize(size, Image.LANCZOS); mask = mask.resize(size, Image.LANCZOS)
    if angle:
        piece = piece.rotate(angle, Image.BICUBIC, expand=True); mask = mask.rotate(angle, Image.BICUBIC, expand=True)
    dst.paste(piece, at, mask)
    dst_a.paste(Image.new("L", mask.size, 255), at, mask)


def needle():
    c, a = cut("LeafSet019")
    g, a = grey(c, a, 0.6)
    sprays = sorted(blobs(a), key=lambda b: -b[4])
    img = Image.new("L", (S, S), 90); alpha = Image.new("L", (S, S), 0)
    big = sprays[0]
    # (the bough along the middle, trunk end at the left; a second, smaller, either side of it, angled out, for fullness)
    for i, (dy, h, ang) in enumerate([(-0.17, 0.26, 12), (0.17, 0.26, -12), (0, 0.42, 0)]):
        b = sprays[min(i + 1, len(sprays) - 1)] if i < 2 else big
        w = int(S * (0.78 if i < 2 else 1.0)); hh = int(S * h)
        paste(img, alpha, g, a, b[:4], (int(S * (0.18 if i < 2 else 0)), int(S * (0.5 + dy) - hh / 2)), (w, hh), ang)
    return img, alpha


def leaf():
    rng = random.Random(5)
    img = Image.new("L", (S, S), 90); alpha = Image.new("L", (S, S), 0)
    pieces = []
    for name in ("LeafSet016", "LeafSet005"):
        c, a = cut(name)
        g, a = grey(c, a, 0.62)
        pieces += [(g, a, b) for b in blobs(a, 1500)]
    # a spray of leaves every way, overlapping, as a twig's are (more at the middle, fewer at the edge)
    for _ in range(46):
        g, a, b = rng.choice(pieces)
        w, h = b[2] - b[0], b[3] - b[1]
        k = rng.uniform(70, 120) / max(w, h)
        size = (max(8, int(w * k)), max(8, int(h * k)))
        cx, cy = rng.gauss(S / 2, S / 5), rng.gauss(S / 2, S / 5)
        if not (40 < cx < S - 40 and 40 < cy < S - 70):
            continue
        paste(img, alpha, g, a, b[:4], (int(cx - size[0] / 2), int(cy - size[1] / 2)), size, rng.uniform(0, 360))
    return img, alpha


def save(name, img, alpha):
    # (the solid corner, for a crown's heart: the bottom-left, where the game's cards look for it)
    img.paste(150, (0, S - CORNER, CORNER, S)); alpha.paste(255, (0, S - CORNER, CORNER, S))
    rgba = Image.merge("RGBA", (img, img, img, alpha))
    rgba.save(OUT / name, optimize=True)
    print("wrote", OUT / name)


if __name__ == "__main__":
    save("needle.png", *needle())
    save("leaf.png", *leaf())
