#!/usr/bin/env python3
"""Blood on the ground, drawn as it lies: art/tex/blood0..3.png (and blood_n.png, a shared wet normal map).

    python3 reckoning/tools/make_blood.py

Each a stain with a ragged, fractal edge (blood soaks into earth and grass unevenly), darker and drier at its rim
where it's thinnest and has begun to dry, deep red and nearly black where it's pooled thick; with droplets flung
out round it, some drawn into tails the way they flew. Made in greys and alpha — the game tints them, fresh or
old — the colour here only the darkness of it.
"""
import pathlib
import numpy as np
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / "art" / "tex"
S = 256
rng = np.random.default_rng(1683)


def fbm(n, octaves=5, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        k = 2 ** (o + 2)
        g = r.random((k + 1, k + 1)).astype(np.float32)
        # bilinear up to n
        x = np.linspace(0, k, n, endpoint=False); i = x.astype(int); f = x - i
        f = f * f * (3 - 2 * f)
        a = g[np.ix_(i, i)]; b = g[np.ix_(i, i + 1)]; c = g[np.ix_(i + 1, i)]; d = g[np.ix_(i + 1, i + 1)]
        fx = f[None, :]; fy = f[:, None]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy); tot += amp; amp *= 0.5
    return out / tot


def stain(seed):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S - 0.5
    r = np.hypot(xx, yy)
    n = fbm(S, 5, seed) - 0.5
    lob = fbm(S, 2, seed + 7) - 0.5
    # (the main pool: a blob whose edge wanders a long way in and out)
    fine = fbm(S, 7, seed + 11) - 0.5
    field = 0.28 + lob * 0.38 + n * 0.14 + fine * 0.07 - r
    alpha = np.clip(field * 70, 0, 1)
    # (thickness: how far in from the edge — thick dark in the middle, thin and redder at the rim)
    thick = np.clip(field * 5, 0, 1)
    # (flung droplets: round ones, and ones drawn out into tails the way they went)
    rr = np.random.default_rng(seed + 99)
    canvas = Image.new("L", (S * 2, S * 2), 0)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(canvas)
    for _ in range(int(rr.integers(20, 45))):
        a = rr.random() * 6.283; d = 0.33 + rr.random() * 0.14; rad = 1.5 + rr.random() ** 2 * 7
        cx, cy = (0.5 + np.cos(a) * d) * S * 2, (0.5 + np.sin(a) * d) * S * 2
        dr.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=255)
        if rr.random() < 0.5:
            L = rad * (2 + rr.random() * 4)
            dr.line([cx, cy, cx + np.cos(a) * L, cy + np.sin(a) * L], fill=230, width=max(1, int(rad * 0.7)))
    drops = np.asarray(canvas.resize((S, S), Image.LANCZOS), np.float32) / 255
    alpha = np.clip(np.maximum(alpha, drops * (r < 0.48)), 0, 1)
    thick = np.maximum(thick, drops * 0.35)
    # (the shade: near black where it's thick; a drying, darker rim at the very edge; a little mottling)
    rim = np.clip(1 - field * 25, 0, 1) * (alpha > 0)
    v = 0.55 - thick * 0.38 - rim * 0.12 + (fbm(S, 4, seed + 3) - 0.5) * 0.12
    v = np.clip(v, 0.05, 1)
    rgba = np.dstack([v, v, v, alpha])
    return Image.fromarray((rgba * 255).astype(np.uint8), "RGBA"), thick


def normal_from(h):
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1); gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.dstack([-gx * 3, -gy * 3, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), "RGB")


if __name__ == "__main__":
    hs = []
    for i in range(4):
        im, th = stain(i * 31 + 5); im.save(OUT / f"blood{i}.png", optimize=True); hs.append(th); print("wrote", OUT / f"blood{i}.png")
    # (the meniscus of a wet pool: its surface rising from the edge and flat across the middle)
    normal_from(np.mean(hs, axis=0) * 2).save(OUT / "blood_n.png", optimize=True); print("wrote blood_n.png")
