#!/usr/bin/env python3
"""Draw the gates as they look from above when they run north-south.

The walls have proper overhead art for both directions; the gates never did, so
an upright gate was the side-on sprite turned on its edge — you saw the face of
the gate lying flat on the grass instead of the top of it.

This builds the missing pieces from the art already in hand: the upright wall of
the same make gives the stonework or the palisade that flanks the opening, and
the flat gate gives the timber of the leaves themselves. The result sits in the
same palette as everything around it, so nothing new had to be painted.

    python3 tools/gate_vertical.py

Writes assets/sprites/buildings/gatev_32.png, gatev_w_32.png, stonegatev_32.png.
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "assets" / "sprites" / "buildings"
S = 32
A = 30


def palette(name, n=4):
    """The commonest colours of a sprite, darkest last."""
    img = Image.open(DIR / name).convert("RGBA")
    px = img.load()
    counts = {}
    for y in range(S):
        for x in range(S):
            r, g, b, a = px[x, y]
            if a > A:
                counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: -kv[1])[:n]
    return [c for c, _ in ordered]


def build(wall_v, flat_gate, out_name):
    wall = Image.open(DIR / wall_v).convert("RGBA")
    wp = wall.load()
    cols = [x for x in range(S) if any(wp[x, y][3] > A for y in range(S))]
    lo, hi = min(cols), max(cols)
    mid = (lo + hi) // 2

    pal = palette(flat_gate)
    plank = pal[1] if len(pal) > 1 else pal[0]     # the lit face of the timber
    dark = min(pal, key=lambda c: sum(c))          # the shadowed joint
    iron = pal[0]

    out = wall.copy()
    op = out.load()

    # the leaves: two doors filling the middle of the run, hung either side of a
    # seam down the centre, with the iron banding across them
    GAP_LO, GAP_HI = 9, 22                          # the opening, in rows
    for y in range(GAP_LO, GAP_HI + 1):
        for x in range(lo, hi + 1):
            op[x, y] = (*plank, 255)
    for y in range(GAP_LO, GAP_HI + 1):             # the seam where the leaves meet
        op[mid, y] = (*dark, 255)
        if mid + 1 <= hi:
            op[mid + 1, y] = (*dark, 255)
    for y in (GAP_LO + 2, GAP_HI - 2):              # two iron bands, seen from above
        for x in range(lo, hi + 1):
            op[x, y] = (*iron, 255)
    for y in (GAP_LO, GAP_HI):                      # the jambs the leaves swing on
        for x in range(lo, hi + 1):
            op[x, y] = (*dark, 255)

    out.save(DIR / out_name)
    print(f"{out_name}: leaves rows {GAP_LO}-{GAP_HI}, width {lo}-{hi}, from {wall_v} + {flat_gate}")


def main():
    build("wall_v_32.png", "gate_32.png", "gatev_32.png")
    build("wallv_w_32.png", "gate_w_32.png", "gatev_w_32.png")
    build("stonewallv_32.png", "stonegate_32.png", "stonegatev_32.png")


if __name__ == "__main__":
    main()
