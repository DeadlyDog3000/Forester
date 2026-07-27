#!/usr/bin/env python3
"""Close the seams between wall pieces.

The generated wall art sits in the middle of its 32px frame with three or four
transparent pixels either side. Drawn at 64px in the world that margin becomes a
twelve-pixel hole between one segment and the next, so a wall reads as a row of
fence posts rather than a wall.

Rather than redraw or stretch the art — which would blur the plank work — this
carries the outermost row or column of real pixels out to the frame edge along
the axis the piece tiles on. A plank meets its neighbour exactly, and nothing in
the middle of the sprite is touched.

    python3 tools/wall_seamless.py

Rewrites the wall, gate, moat and ditch sprites in place (originals in git).
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "assets" / "sprites" / "buildings"
A = 30                       # what counts as real paint

# file -> axis it tiles along: "h" pieces sit side by side, "v" pieces stack
PIECES = {
    "wall_32.png": "h", "wall_w_32.png": "h",
    "wall_v_32.png": "v", "wallv_w_32.png": "v",
    "stonewall_32.png": "h", "stonewallv_32.png": "v",
    "gate_32.png": "h", "gate_w_32.png": "h", "stonegate_32.png": "h",
    "moat_32.png": "h", "ditch_32.png": "h",
}


def solid_span(counts):
    """First and last line that is really part of the wall.

    A line with one or two stray pixels is the tip of a rail, not the body: carry
    THAT out to the edge and the seam stays open. Only lines carrying a good share
    of the wall's own height count.
    """
    peak = max(counts) if counts else 0
    if not peak:
        return None
    thresh = max(3, peak * 0.45)
    solid = [i for i, n in enumerate(counts) if n >= thresh]
    return (min(solid), max(solid)) if solid else None


def stretch_edges(img, axis):
    px = img.load()
    w, h = img.size
    if axis == "h":
        span = solid_span([sum(1 for y in range(h) if px[x, y][3] > A) for x in range(w)])
        if not span:
            return img, 0
        lo, hi = span
        for y in range(h):
            for x in range(0, lo):                      # carry the left edge out
                px[x, y] = px[lo, y]
            for x in range(hi + 1, w):                  # and the right
                px[x, y] = px[hi, y]
        return img, lo + (w - 1 - hi)
    span = solid_span([sum(1 for x in range(w) if px[x, y][3] > A) for y in range(h)])
    if not span:
        return img, 0
    lo, hi = span
    for x in range(w):
        for y in range(0, lo):
            px[x, y] = px[x, lo]
        for y in range(hi + 1, h):
            px[x, y] = px[x, hi]
    return img, lo + (h - 1 - hi)


def main():
    for name, axis in PIECES.items():
        p = DIR / name
        if not p.exists():
            print(f"{name}: missing, skipped")
            continue
        img = Image.open(p).convert("RGBA")
        img, closed = stretch_edges(img, axis)
        img.save(p)
        print(f"{name}: closed {closed}px of seam along {axis}")


if __name__ == "__main__":
    main()
