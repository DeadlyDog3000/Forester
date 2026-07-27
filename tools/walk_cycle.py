#!/usr/bin/env python3
"""Rebuild every walk cycle into a gait that actually reads as walking.

The characters' own Nano Banana pixels are kept exactly — only the LEG rows are
rearranged. A proper 4-frame walk is contact / passing / contact(other leg) /
passing:

  contact  — legs apart, body sunk 1px (the stride's low point)
  passing  — legs gathered under the body, full height

The existing art has strides but no passing pose and never switches the leading
leg, so everyone glides. This script, per character:
  1. picks the widest-legged frame as the CONTACT pose,
  2. uses the narrowest frame as the PASSING pose if it is genuinely narrower,
     otherwise synthesizes one by gathering each leg under the body,
  3. mirrors only the leg rows of the contact pose for the opposite stride,
  4. bobs the torso of contact frames down one pixel.

    python3 tools/walk_cycle.py

Overwrites assets/sprites/characters/<who>_walk_0..3.png (originals in git).
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "assets" / "sprites" / "characters"
A = 40                            # alpha threshold: what counts as body


def runs_in_row(px, w, y):
    """Opaque runs in a row; a 2+ pixel gap separates the legs."""
    out, start, gap = [], None, 0
    for x in range(w):
        if px[x, y][3] > A:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= 2:
                out.append((start, x - gap))
                start, gap = None, 0
    if start is not None:
        out.append((start, w - 1 - gap))
    return out


def hip_row(img):
    """The crotch: the highest row of the zone where the silhouette splits in two."""
    px = img.load()
    w, h = img.size
    split = [y for y in range(h - 1, h - 14, -1) if len(runs_in_row(px, w, y)) >= 2]
    if split:
        return min(split)
    return h - 8                  # long coats and dresses: call the last rows the legs


def leg_width(img, hip):
    px = img.load()
    w, h = img.size
    xs = [x for y in range(hip, h) for x in range(w) if px[x, y][3] > A]
    return (max(xs) - min(xs) + 1) if xs else 0


def mirror_legs(img, hip):
    """The opposite stride: leg rows flipped about their own centre, torso untouched."""
    out = img.copy()
    px, po = img.load(), out.load()
    w, h = img.size
    xs = [x for y in range(hip, h) for x in range(w) if px[x, y][3] > A]
    if not xs:
        return out
    x0, x1 = min(xs), max(xs)
    for y in range(hip, h):
        for x in range(w):
            m = x0 + x1 - x
            po[x, y] = px[m, y] if 0 <= m < w else (0, 0, 0, 0)
    return out


def gather_legs(img, hip):
    """A passing pose from a stride: each leg drawn in toward the body's centre."""
    out = img.copy()
    px, po = img.load(), out.load()
    w, h = img.size
    xs = [x for y in range(hip, h) for x in range(w) if px[x, y][3] > A]
    cx = (min(xs) + max(xs)) / 2 if xs else w / 2
    for y in range(hip, h):
        for x in range(w):
            po[x, y] = (0, 0, 0, 0)
        # the deeper down the leg, the further it has swung — pull it back under
        k = (y - hip) / max(1, (h - 1 - hip))
        for (a, b) in runs_in_row(px, w, y):
            mid = (a + b) / 2
            shift = round((cx - mid) * 0.65 * k)
            for x in range(a, b + 1):
                nx = x + shift
                if 0 <= nx < w:
                    po[nx, y] = px[x, y]
    return out


def bob(img, hip):
    """Contact is the stride's low point: torso sinks one pixel onto the planted legs."""
    out = img.copy()
    px, po = img.load(), out.load()
    w, h = img.size
    for y in range(hip - 1, 0, -1):
        for x in range(w):
            po[x, y] = px[x, y - 1]
    for x in range(w):
        po[x, 0] = (0, 0, 0, 0)
    # legs (rows >= hip) keep their pixels: pasting the torso a row lower may
    # uncover nothing because row hip-1 was part of the torso already
    return out


def build(who, n_src):
    frames = [Image.open(DIR / f"{who}_walk_{i}.png").convert("RGBA") for i in range(n_src)]
    hips = [hip_row(f) for f in frames]
    widths = [leg_width(f, h) for f, h in zip(frames, hips)]
    wi = widths.index(max(widths))
    ni = widths.index(min(widths))
    contact, hip = frames[wi], hips[wi]
    if ni != wi and widths[wi] - widths[ni] >= 3:
        passing = frames[ni]              # the artist already drew the gathered pose
    else:
        passing = gather_legs(contact, hip)
    cycle = [bob(contact, hip), passing, bob(mirror_legs(contact, hip), hip), passing]
    for i, f in enumerate(cycle):
        f.save(DIR / f"{who}_walk_{i}.png")
    print(f"{who}: contact=f{wi} (legs {widths[wi]}px), passing="
          f"{'f%d' % ni if passing is frames[ni] else 'synthesized'}, hip row {hip}")


def main():
    for who, n in [("sister", 4), ("brother", 4), ("hunter", 4), ("ragged", 4),
                   ("musketeer", 2), ("soldier", 2)]:
        build(who, n)
    # the horse: keep both painted frames, add the gallop's rise for frames 2/3
    for i in (0, 1):
        src = Image.open(DIR / f"cavalry_walk_{i}.png").convert("RGBA")
        up = Image.new("RGBA", src.size, (0, 0, 0, 0))
        up.paste(src, (0, -1))
        up.save(DIR / f"cavalry_walk_{i + 2}.png")
    print("cavalry: frames 2/3 are the gallop's rise (1px up)")


if __name__ == "__main__":
    main()
