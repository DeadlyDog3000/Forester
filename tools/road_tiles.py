#!/usr/bin/env python3
"""Cut the generated road art into a 16-piece auto-tiling set.

Nano Banana paints the dirt itself (art/raw/road_h.png, road_v.png); this script
only decides which pixels of that dirt belong to which junction, so every tile
meets its neighbours on exactly the same pixels and the path snaps together.

    python3 tools/road_tiles.py

Writes assets/sprites/env/road_0.png ... road_15.png, where the index is a
bitmask of connected neighbours: 1=north, 2=east, 4=south, 8=west.
"""
import pathlib
import random

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "raw"
OUT = ROOT / "assets" / "sprites" / "env"
SIZE = 32
LO, HI = 6, 26          # the band of dirt: 20 of 32 pixels, centred
COLORS = 5


def band_texture(src, vertical):
    """The dirt alone, stretched to fill the frame, at sprite resolution."""
    img = Image.open(src).convert("RGB")
    px = img.load()
    w, h = img.size

    def is_dirt(x, y):
        r, g, b = px[x, y]
        return not (r > 180 and b > 180 and g < 120)      # not the magenta key

    if vertical:
        cols = [x for x in range(w) if is_dirt(x, h // 2)]
        a, b = min(cols), max(cols) + 1
        side = b - a
        mid = h // 2
        crop = img.crop((a, mid - side // 2, b, mid - side // 2 + side))
    else:
        rows = [y for y in range(h) if is_dirt(w // 2, y)]
        a, b = min(rows), max(rows) + 1
        side = b - a
        mid = w // 2
        crop = img.crop((mid - side // 2, a, mid - side // 2 + side, b))
    # one road's width of dirt, at sprite scale: the ruts keep their proportions
    return crop.resize((SIZE, SIZE), Image.LANCZOS)


def quantize(img):
    return img.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")


def forest_tone(img, k=0.78):
    """Cool the dirt down so it belongs in a dark spruce wood."""
    out = img.copy()
    p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b = p[x, y]
            p[x, y] = (int(r * k), int(g * k * 0.98), int(b * k * 0.94))
    return out


def ragged(mask, rng):
    """Rough the free edges of the dirt so it does not read as a ruler-drawn box."""
    out = [row[:] for row in mask]
    for y in range(SIZE):
        for x in range(SIZE):
            if not mask[y][x]:
                continue
            edge = any(0 <= x + dx < SIZE and 0 <= y + dy < SIZE and not mask[y + dy][x + dx]
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge and rng.random() < 0.28:
                out[y][x] = False
    return out


def build(bits, rng):
    n, e, s, w = bits & 1, bits & 2, bits & 4, bits & 8
    mask = [[False] * SIZE for _ in range(SIZE)]
    hot = [[False] * SIZE for _ in range(SIZE)]           # pixels that belong to a vertical arm

    def rect(x0, y0, x1, y1, vertical=False):
        for y in range(max(0, y0), min(SIZE, y1)):
            for x in range(max(0, x0), min(SIZE, x1)):
                mask[y][x] = True
                if vertical:
                    hot[y][x] = True

    if bits:
        rect(LO, LO, HI, HI)                              # the crossing itself
        if n: rect(LO, 0, HI, LO + 1, True)
        if s: rect(LO, HI - 1, HI, SIZE, True)
        if w: rect(0, LO, LO + 1, HI)
        if e: rect(HI - 1, LO, SIZE, HI)
    else:                                                  # a lone trodden patch
        cx = (SIZE - 1) / 2
        for y in range(SIZE):
            for x in range(SIZE):
                if ((x - cx) ** 2 + (y - cx) ** 2) ** 0.5 < 8.5:
                    mask[y][x] = True

    # only the ends that touch the frame must stay square — the rest may fray
    frayed = ragged(mask, rng)
    for y in range(SIZE):
        for x in range(SIZE):
            onedge = (y == 0 and n) or (y == SIZE - 1 and s) or (x == 0 and w) or (x == SIZE - 1 and e)
            if onedge and mask[y][x]:
                frayed[y][x] = True
    return frayed, hot


def main():
    # one piece of dirt for the whole set — turned on its side for the north/south
    # arms — so a corner never shows two different browns meeting
    texH = forest_tone(quantize(band_texture(RAW / "road_h.png", vertical=False)))
    texV = texH.rotate(90)
    ph, pv = texH.load(), texV.load()
    OUT.mkdir(parents=True, exist_ok=True)

    for bits in range(16):
        rng = random.Random(1000 + bits)                   # same art every build
        mask, hot = build(bits, rng)
        tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        tp = tile.load()
        vertical_only = bits in (1, 4, 5)
        for y in range(SIZE):
            for x in range(SIZE):
                if not mask[y][x]:
                    continue
                src = pv if (hot[y][x] or vertical_only) else ph
                r, g, b = src[x, y]
                tp[x, y] = (r, g, b, 255)
        tile.save(OUT / f"road_{bits}.png")
        # the same lane under snow: trodden slush, the ruts still showing through
        snow = tile.copy()
        sp = snow.load()
        for y in range(SIZE):
            for x in range(SIZE):
                r, g, b, a = sp[x, y]
                if not a:
                    continue
                sp[x, y] = (int(r * 0.34 + 185 * 0.66), int(g * 0.34 + 195 * 0.66),
                            int(b * 0.34 + 200 * 0.66), 255)
        snow.save(OUT / f"road_w_{bits}.png")
    print(f"wrote 16 tiles (and their winter twins) to {OUT}")


if __name__ == "__main__":
    main()
