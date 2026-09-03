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

from PIL import Image, ImageEnhance


def key_background(img, tol=60):
    """Make the flat background colour transparent, judged from the corners."""
    rgb = img.convert("RGB")
    corners = [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]
    bg = tuple(sum(c) // len(c) for c in zip(*(rgb.getpixel(p) for p in corners)))

    out = img.copy()
    px, op = rgb.load(), out.load()
    keyed, kept = [], [0, 0, 0, 0]
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < tol:
                keyed.append((x, y))
            else:
                kept[0] += r; kept[1] += g; kept[2] += b; kept[3] += 1

    # Zeroing alpha is not enough. The downscale still averages the background's
    # COLOUR into every edge pixel, so a sprite keyed off magenta comes back
    # wearing a purple fringe. Repaint the keyed pixels in the sprite's own mean
    # colour first: the fringe then blends into the palette instead of fighting
    # it, and a strongly contrasting key colour becomes safe to ask for.
    fill = tuple(c // kept[3] for c in kept[:3]) if kept[3] else bg
    for x, y in keyed:
        op[x, y] = (*fill, 0)
    return out


def square_pad(img):
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def pixelate(src, dst, size=32, colors=5, preview=None, transparent=False, trim=False, tol=60,
             saturate=1.0):
    img = Image.open(src).convert("RGBA")

    if transparent:
        img = key_background(img, tol)
    # A median-cut palette is voted on by area, so a small hot accent — a bed of
    # coals, a furnace mouth — loses every time to the acres of grey stone
    # around it and comes back the colour of the stone. Pushing the saturation
    # up first moves the accent far enough from the grey cluster to survive
    # being cut down to five or six colours.
    if saturate != 1.0:
        alpha = img.getchannel("A")
        img = ImageEnhance.Color(img.convert("RGB")).enhance(saturate).convert("RGBA")
        img.putalpha(alpha)
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
    ap.add_argument("--tol", type=int, default=60)
    ap.add_argument("--saturate", type=float, default=1.0,
                    help="boost colour before quantizing, so small hot accents survive")
    a = ap.parse_args()
    print("wrote", pixelate(a.input, a.output, a.size, a.colors,
                            a.preview, a.transparent, a.trim, a.tol, a.saturate))
