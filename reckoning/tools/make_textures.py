#!/usr/bin/env python3
"""Turn the generated surface photos (art/raw/tex/*.png) into the game's textures.

    python3 reckoning/tools/make_textures.py

Surfaces (wood, plaster, stone, brick, bark, cloth, needles, roof tiles) become
detail maps: the photo's grain only — its colour and its broad light and dark
taken out, centred on mid grey — packed three to an image, one per channel.
The game lays them over each surface's own colour, so a red house stays red
but its bricks show. The ground textures (meadow, forest floor, cobbles, the
dirt track) are kept in full colour.

Every texture is made seamless first: blended with a copy of itself shifted by
half, so its edges meet.

The photos are generated with tools/gen_art.py from art/prompts/tex/*.txt.
"""
import pathlib

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / "art" / "raw" / "tex"
# (real ones where there are: Poly Haven's scanned surfaces, CC0 — their colour, and their displacement for the grain,
#  which is the surface's true height and not a guess at it from light and dark. See art/raw/tex_ph/SOURCES.json)
PH = ROOT / "art" / "raw" / "tex_ph"
OUT = ROOT / "reckoning" / "art" / "tex"

# which surface goes in which channel of which pack
PACKS = {
    "detail_a.png": ["wood", "plaster", "stone"],
    "detail_b.png": ["brick", "bark", "cloth"],
    "detail_c.png": ["needles", "tiles", "wood"],
}
GROUND = ["meadow", "forestfloor", "cobbles", "dirt"]
# the surfaces' own colour, in the order of SURFACE in core.js: each photo divided by its broad colour, so what's left
# is how each brick, stone, board and tile differs from the wall's own colour (the mortar paler, a stone bluer, a
# knot darker) — laid side by side in one strip, which the game cuts into the layers of one texture
# (and after them the ground's: the terrain picks one by its own colour)
COLOUR = ["wood", "plaster", "stone", "brick", "bark", "cloth", "needles", "tiles", "meadow", "forestfloor", "dirt", "cobbles"]


def seamless(img):
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    # weight of the original: 1 in the middle, falling to 0 at the edges, where the shifted copy takes over
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h / 2)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w / 2)
    m = np.clip(np.minimum.outer(y, x) * 2.2, 0, 1)
    m = m * m * (3 - 2 * m)
    if a.ndim == 3:
        m = m[..., None]
    return Image.fromarray(np.clip(a * m + b * (1 - m), 0, 255).astype(np.uint8))


def detail(img, size=512):
    g = img.convert("L").resize((size, size), Image.LANCZOS)
    a = np.asarray(g, dtype=np.float32) / 255
    # take out the broad light and dark, keep the grain
    blur = np.asarray(g.filter(ImageFilter.GaussianBlur(size / 10)), dtype=np.float32) / 255
    d = a - blur
    d = d / (d.std() + 1e-5) * 0.17 + 0.5
    return np.clip(d, 0, 1)


def colour(img, size=512):
    im = img.resize((size, size), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float32) / 255
    broad = np.asarray(im.filter(ImageFilter.GaussianBlur(size / 5)), dtype=np.float32) / 255
    r = a / np.maximum(broad, 0.04)
    # (a little gentler than the photo: a wall's own colour should still be its colour)
    r = 1 + (r - 1) * 0.9
    return np.clip(r * 0.5, 0, 1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cache = {}
    def load(n):
        if n not in cache:
            ph = PH / f"{n}_diff.jpg"
            cache[n] = Image.open(ph).convert("RGB") if ph.exists() else seamless(Image.open(RAW / f"{n}.png").convert("RGB"))
        return cache[n]
    def height(n):
        ph = PH / f"{n}_disp.png"
        return Image.open(ph).convert("RGB") if ph.exists() else load(n)
    for name, chans in PACKS.items():
        rgb = np.stack([detail(height(n)) for n in chans], axis=-1)
        Image.fromarray((rgb * 255).astype(np.uint8)).save(OUT / name)
        print("wrote", name, chans)
    strip = np.concatenate([colour(load(n)) for n in COLOUR], axis=1)
    Image.fromarray((strip * 255 + 0.5).astype(np.uint8)).save(OUT / "colour.jpg", quality=92)
    print("wrote colour.jpg", COLOUR)
    for n in GROUND:
        load(n).resize((1024, 1024), Image.LANCZOS).save(OUT / f"{n}.jpg", quality=88)
        print("wrote", f"{n}.jpg")


if __name__ == "__main__":
    main()
