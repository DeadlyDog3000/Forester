"""Lay out the frames animsheet.py rendered: one row per clip and view, frames left to right, labelled.

    python3 reckoning/tools/blender/sheet.py outdir sheet.png [Walk,Run,...]
"""
import os
import re
import sys

from PIL import Image, ImageDraw

d, out = sys.argv[1], sys.argv[2]
only = sys.argv[3].split(",") if len(sys.argv) > 3 else None
rows = {}
for f in os.listdir(d):
    m = re.match(r"(.+)_(side|front)_(\d+)\.png$", f)
    if not m or (only and m.group(1) not in only):
        continue
    rows.setdefault((m.group(1), m.group(2)), {})[int(m.group(3))] = os.path.join(d, f)
keys = sorted(rows)
if not keys:
    sys.exit("no frames")
w0, h0 = Image.open(next(iter(rows[keys[0]].values()))).size
s = 0.5
W, H = int(w0 * s), int(h0 * s)
n = max(len(v) for v in rows.values())
sheet = Image.new("RGB", (110 + n * W, len(keys) * H), (40, 40, 40))
dr = ImageDraw.Draw(sheet)
for r, k in enumerate(keys):
    dr.text((6, r * H + H // 2), f"{k[0]}\n{k[1]}", fill=(255, 255, 255))
    for i, p in sorted(rows[k].items()):
        sheet.paste(Image.open(p).convert("RGB").resize((W, H)), (110 + i * W, r * H))
sheet.save(out)
print("wrote", out, sheet.size)
