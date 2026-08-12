#!/usr/bin/env python3
"""Compose the Forester key art into a 1280x720 thumbnail with the wordmark.

The illustration comes from Nano Banana with no text in it at all — image
models set type badly, and a wordmark that is nearly right is worse than none.
The lettering is drawn here instead, in the same face and the same colours the
trailer's end card uses, so the two read as one piece of work.

Usage:
    python3 tools/make_thumb.py art/thumb_a.png art/thumbnail.png
"""
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

# straight out of the game's own design tokens
INK = (232, 217, 184)
GOLD = (201, 168, 106)
MUTED = (154, 176, 162)

FACE_BOLD = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"
OUT_W, OUT_H = 1280, 720


def trim_letterbox(im, tol=18):
    """Drop the flat black bars the generator leaves top and bottom."""
    g = im.convert("L")
    w, h = g.size
    def dark(row):
        return max(g.crop((0, row, w, row + 1)).getdata()) <= tol
    top = 0
    while top < h // 4 and dark(top):
        top += 1
    bot = h - 1
    while bot > h * 3 // 4 and dark(bot):
        bot -= 1
    return im.crop((0, top, w, bot + 1))


def cover(im, w, h):
    """Scale and centre-crop to exactly w x h without distorting."""
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x = (im.width - w) // 2
    y = (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def tracked(draw, xy, text, font, fill, track, anchor_centre=False):
    """PIL has no letter-spacing, and this title needs a lot of it."""
    widths = [draw.textlength(c, font=font) for c in text]
    total = sum(widths) + track * (len(text) - 1)
    x, y = xy
    if anchor_centre:
        x -= total / 2
    for c, cw in zip(text, widths):
        draw.text((x, y), c, font=font, fill=fill)
        x += cw + track
    return total


def main(src, out):
    im = cover(trim_letterbox(Image.open(src).convert("RGB")), OUT_W, OUT_H)

    # A scrim only where the type sits. The art earns the frame; darkening all
    # of it to make room for words would throw away the contrast that makes the
    # thing readable at thumbnail size in the first place.
    scrim = Image.new("L", (OUT_W, OUT_H), 0)
    sd = ImageDraw.Draw(scrim)
    for i in range(190):
        sd.rectangle([0, i, OUT_W, i + 1], fill=int(150 * (1 - i / 190) ** 1.5))
    im = Image.composite(Image.new("RGB", im.size, (6, 9, 8)), im, scrim)

    d = ImageDraw.Draw(im)
    title = ImageFont.truetype(FACE_BOLD, 104)
    sub = ImageFont.truetype(FACE_BOLD, 30)

    cx = OUT_W // 2
    tracked(d, (cx, 34), "FORESTER", title, INK, 16, anchor_centre=True)
    tracked(d, (cx, 156), "HAMBURG, 1683", sub, GOLD, 8, anchor_centre=True)

    # No hairline under the subtitle. The trailer's end card has one and it works
    # there because it sits on a black field; here it lands in the treeline and
    # reads as a scanline glitch rather than a rule.

    pathlib.Path(out).parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "PNG")
    print(f"wrote {out} {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
