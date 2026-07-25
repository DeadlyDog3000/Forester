#!/usr/bin/env python3
"""Downscale generated art to a true low-res sprite with a locked palette.

Usage:
    python3 tools/pixelate.py <input.png> <output.png> [--size 32] [--colors 5]
                              [--preview big.png] [--transparent] [--trim]

The model paints a flat background around the sprite; --transparent keys that
colour out. Skip --trim when the model already composed the sprite on an
aligned grid, since cropping shifts the pixel grid and smears the downscale.
"""
import argparse
import pathlib

from PIL import Image


def key_background(img, tol=60):
    """Make the flat background colour transparent, judged from the corners."""
    rgb = img.convert("RGB")
    corners = [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]
    bg = tuple(sum(c) // len(c) for c in zip(*(rgb.getpixel(p) for p in corners)))

    out = img.copy()
    px, op = rgb.load(), out.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < tol:
                op[x, y] = (r, g, b, 0)
    return out


def square_pad(img):
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def pixelate(src, dst, size=32, colors=5, preview=None, transparent=False, trim=False):
    img = Image.open(src).convert("RGBA")

    if transparent:
        img = key_background(img)
    if trim:
        box = img.getchannel("A").getbbox() if transparent else img.convert("RGB").getbbox()
        if box:
            img = square_pad(img.crop(box))

    small = img.resize((size, size), Image.LANCZOS)
    alpha = small.getchannel("A")

    flat = small.convert("RGB").quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    out = flat.convert("RGBA")
    if transparent:
        out.putalpha(alpha.point(lambda a: 255 if a > 128 else 0))

    dst = pathlib.Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)

    if preview:
        out.resize((size * 16, size * 16), Image.NEAREST).save(preview)
    return dst


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--size", type=int, default=32)
    ap.add_argument("--colors", type=int, default=5)
    ap.add_argument("--preview")
    ap.add_argument("--transparent", action="store_true")
    ap.add_argument("--trim", action="store_true")
    a = ap.parse_args()
    print("wrote", pixelate(a.input, a.output, a.size, a.colors,
                            a.preview, a.transparent, a.trim))
