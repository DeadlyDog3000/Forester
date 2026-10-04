"""The settlement's buildings, each in the four styles a town grows through.

    log     — the clearing's first years: horizontal logs, a board roof
    timber  — Hamburg in 1683: plaster between dark oak framing, a steep red roof
    brick   — the Hanseatic town: red brick, white string courses, a stepped gable
    modern  — a European city street: stucco, tall windows, balconies, a shopfront

A building is a shell (walls, windows, door, roof, chimney) in one of the four
styles, and, for a trade, a few things of its own: the bakery's oven, the
forge's anvil, a sign over the door. Every one is written to
models/town/<type>_<tier>.glb, where tier 1..4 follows the list above.

Front is -Y, origin at the base centre, 1 unit = 1 m.

    blender -b --factory-startup -P reckoning/tools/blender/town.py [type ...]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import common
importlib.reload(common)
from common import Kit, rgb, mat_tr, fresh_scene, export

PI = math.pi
STYLES = {1: "log", 2: "timber", 3: "brick", 4: "modern"}


# ---------------------------------------------------------------------------
#  placing things on a wall: u runs along the wall (centred), z is the centre height
# ---------------------------------------------------------------------------
def on_wall(W, D, side, u, z, off):
    if side == "front":
        return (u, -D / 2 - off, z), (0, 0, 0)
    if side == "back":
        return (-u, D / 2 + off, z), (0, 0, PI)
    if side == "left":
        return (-W / 2 - off, -u, z), (0, 0, -PI / 2)
    return (W / 2 + off, u, z), (0, 0, PI / 2)


def wall_len(W, D, side):
    return W if side in ("front", "back") else D


def plate(k, key, W, D, side, u, z, w, h, off, color, th=0.04):
    loc, rot = on_wall(W, D, side, u, z, off)
    k.box(key, (w, th, h), mat_tr(loc, rot), color)


def window(k, W, D, side, u, z, w, h, frame, glass, off=0.0, cross=None, sill=None):
    """A framed window on the wall's face; the glass stands proud of the frame so the frame shows as a border."""
    plate(k, "wood", W, D, side, u, z, w + 0.14, h + 0.14, off + 0.02, frame, th=0.05)
    plate(k, "glass", W, D, side, u, z, w, h, off + 0.05, glass, th=0.03)
    if cross is not None:
        plate(k, "wood", W, D, side, u, z, 0.05, h, off + 0.075, cross, th=0.02)
        plate(k, "wood", W, D, side, u, z + h * 0.12, w, 0.05, off + 0.075, cross, th=0.02)
    if sill is not None:
        plate(k, "stone", W, D, side, u, z - h / 2 - 0.08, w + 0.3, 0.08, off + 0.08, sill, th=0.14)


def gable_roof(k, key, W, D, base, rise, color, over=0.45, rnd=None, boards=0):
    """Two slopes meeting in a ridge that runs front to back, so the gables face the street."""
    slope = math.atan2(rise, W / 2)
    drop = over * math.tan(slope)
    run = math.hypot(W / 2 + over, rise + drop)
    for sd in (-1, 1):
        cx = sd * (W / 2 + over) / 2
        cz = base + rise - (rise + drop) / 2 + 0.06
        if boards:
            for i in range(boards):
                y = -D / 2 - over + (D + 2 * over) * (i + 0.5) / boards
                k.box(key, (run, (D + 2 * over) / boards - 0.02, 0.06), mat_tr((cx, y, cz), (0, sd * slope, 0)), rgb(color, 0.12, rnd))
        else:
            k.box(key, (run, D + 2 * over, 0.1), mat_tr((cx, 0, cz), (0, sd * slope, 0)), rgb(color, 0.05, rnd))
    return slope


def gable_end(k, key, W, D, y, base, rise, color):
    """The triangle of wall under a gable, as a solid wedge (both faces)."""
    t = 0.3
    for yy in (y - t / 2, y + t / 2):
        pts = [(-W / 2, yy, base), (W / 2, yy, base), (0, yy, base + rise)]
        k.poly(key, pts, color)
        k.poly(key, list(reversed(pts)), color)


def chimney(k, x, y, top, color, rnd, key="stone"):
    k.box(key, (0.7, 0.7, top), mat_tr((x, y, top / 2)), rgb(color, 0.06, rnd), bevel=0.02)
    k.box(key, (0.82, 0.82, 0.14), mat_tr((x, y, top)), rgb(color, 0.1, rnd))


# ---------------------------------------------------------------------------
#  the four shells
# ---------------------------------------------------------------------------
def shell_log(k, W, D, floors, rnd, door=True, windows=True):
    r, course = 0.17, 0.33
    H = 2.7
    n = int(H / course)
    logc = lambda: rgb(rnd.choice([0x8a6440, 0x7c5a38, 0x94704a, 0x806040]), 0.06, rnd)
    endc = rgb(0xc9a878, 0.1, rnd)
    for i in range(n):
        z = r + i * course
        zs = z + course / 2
        over = 0.36
        # back, whole
        k.cylinder("log", r, r * 0.95, W + 2 * over, mat_tr((0, D / 2, z), (0, PI / 2, 0)), logc(), segs=9, end_color=endc, wobble=0.05)
        # front, split by the door
        if door and z + r < 2.1:
            L = (W / 2 + over) - 0.6
            for sd in (-1, 1):
                k.cylinder("log", r, r * 0.95, L, mat_tr((sd * (0.6 + L / 2), -D / 2, z), (0, PI / 2, 0)), logc(), segs=9, end_color=endc, wobble=0.05)
        else:
            k.cylinder("log", r, r * 0.95, W + 2 * over, mat_tr((0, -D / 2, z), (0, PI / 2, 0)), logc(), segs=9, end_color=endc, wobble=0.05)
        for sd in (-1, 1):
            k.cylinder("log", r, r * 0.95, D + 2 * over, mat_tr((sd * W / 2, 0, zs), (PI / 2, 0, 0)), logc(), segs=9, end_color=endc, wobble=0.05)
    top = r + n * course
    # the inside of the walls, so the gaps between logs don't show daylight
    for side, (sx, sy, w) in {"front": (0, -D / 2 + 0.1, W), "back": (0, D / 2 - 0.1, W)}.items():
        k.box("wood", (w - 0.2, 0.04, top - 0.1), mat_tr((sx, sy, top / 2)), rgb(0x5a4028, 0.05, rnd))
    for sd in (-1, 1):
        k.box("wood", (0.04, D - 0.2, top - 0.1), mat_tr((sd * (W / 2 - 0.1), 0, top / 2)), rgb(0x5a4028, 0.05, rnd))
    if door:
        for i in range(4):
            x = -0.55 + 1.1 * (i + 0.5) / 4
            k.box("wood", (1.1 / 4 - 0.01, 0.06, 2.05), mat_tr((x, -D / 2 + 0.02, 1.03)), rgb(0x6a4a2c, 0.1, rnd))
        for x in (-0.62, 0.62):
            k.box("wood", (0.12, 0.36, 2.2), mat_tr((x, -D / 2, 1.1)), rgb(0x5e422a, 0.05, rnd))
        k.box("wood", (1.5, 0.38, 0.16), mat_tr((0, -D / 2, 2.2)), rgb(0x5e422a, 0.05, rnd))
    if windows:
        for side in ("left", "right"):
            window(k, W, D, side, 0, 1.45, 0.7, 0.6, rgb(0x5e422a), rgb(0x1e2224), off=0.16)
            for sd in (-1, 1):
                plate(k, "wood", W, D, side, sd * 0.62, 1.45, 0.4, 0.7, 0.2, rgb(0x4f6a4a, 0.08, rnd), th=0.05)
    rise = W * 0.45
    for y in (-D / 2, D / 2):
        m = 8
        for i in range(m):
            z0 = top + i * rise / m
            half = (W / 2 + 0.1) * (1 - (i + 0.5) / m)
            k.box("wood", (half * 2, 0.06, rise / m - 0.015), mat_tr((0, y + (-0.02 if y < 0 else 0.02), z0 + rise / m / 2)), rgb(0x6a4a2e, 0.12, rnd))
    gable_roof(k, "roof", W, D, top, rise, 0x4e3e30, over=0.5, rnd=rnd, boards=12)
    k.cylinder("log", 0.12, 0.12, D + 1.1, mat_tr((0, 0, top + rise + 0.12), (PI / 2, 0, 0)), logc(), segs=9, end_color=endc)
    chimney(k, -W / 2 + 1.1, D / 2 - 0.2, top + rise + 0.6, 0x6e6860, rnd)
    return top + rise


def shell_timber(k, W, D, floors, rnd, door=True, windows=True):
    FH = 2.8
    H = floors * FH
    plaster = rgb(rnd.choice([0xe6dcc4, 0xeae2cc, 0xe0d4b8]), 0.03, rnd)
    oak = lambda: rgb(0x3a2a1e, 0.08, rnd)
    t = 0.3
    # stone plinth, plaster walls
    k.box("stone", (W + 0.02, D + 0.02, 0.45), mat_tr((0, 0, 0.2)), rgb(0x7a746a, 0.06, rnd))
    k.box("plaster", (W, t, H), mat_tr((0, -D / 2, H / 2)), plaster)
    k.box("plaster", (W, t, H), mat_tr((0, D / 2, H / 2)), plaster)
    for sd in (-1, 1):
        k.box("plaster", (t, D, H), mat_tr((sd * W / 2, 0, H / 2)), plaster)
    # the frame: posts, a rail at every floor and under every window, braces in the end bays
    for side in ("front", "back", "left", "right"):
        L = wall_len(W, D, side)
        bays = max(2, round(L / 1.25))
        for i in range(bays + 1):
            u = -L / 2 + L * i / bays
            plate(k, "wood", W, D, side, u, H / 2, 0.16, H, 0.16, oak(), th=0.05)
        for f in range(floors + 1):
            plate(k, "wood", W, D, side, 0, min(H - 0.08, max(0.5, f * FH)), L + 0.1, 0.16, 0.17, oak(), th=0.05)
        for f in range(floors):
            plate(k, "wood", W, D, side, 0, f * FH + 1.0, L, 0.1, 0.175, oak(), th=0.04)
            # braces in the end bays, like the Hamburg houses on the Deichstraße
            bw = L / bays
            for sd in (-1, 1):
                u0 = sd * (L / 2 - bw / 2)
                ang = math.atan2(FH - 0.3, bw) * (1 if sd > 0 else -1)
                loc, rot = on_wall(W, D, side, u0, f * FH + FH / 2, 0.15)
                # (tilted in the wall's own plane first, then turned with the wall)
                k.box("wood", (math.hypot(bw, FH - 0.3) - 0.1, 0.04, 0.12), mat_tr(loc, (0, ang, rot[2])), oak())
        # windows in the middle bays, small and leaded
        if windows:
            for f in range(floors):
                for i in range(1, bays - 1):
                    u = -L / 2 + L * (i + 0.5) / bays
                    if side == "front" and f == 0 and door and abs(u) < 0.8:
                        continue
                    window(k, W, D, side, u, f * FH + 1.65, 0.62, 0.9, oak(), rgb(0x28323a), off=0.16, cross=rgb(0x2a2018))
    if door:
        plate(k, "wood", W, D, "front", 0, 1.1, 1.2, 2.2, 0.17, oak(), th=0.06)
        plate(k, "wood", W, D, "front", 0, 1.05, 1.0, 2.05, 0.2, rgb(0x5a3a22, 0.08, rnd), th=0.05)
        plate(k, "stone", W, D, "front", 0, 0.08, 1.6, 0.16, 0.45, rgb(0x7a746a), th=0.5)
    # a steep roof of red tiles, the gable plastered and framed
    rise = W * 0.85
    for y in (-D / 2, D / 2):
        gable_end(k, "plaster", W, D, y, H, rise, plaster)
    for side_y in (-1, 1):
        y = side_y * (D / 2 + 0.16)
        k.box("wood", (0.14, 0.05, rise - 0.2), mat_tr((0, y, H + (rise - 0.2) / 2)), oak())
        for i in (1, 2):
            zz = H + rise * i / 3
            half = W / 2 * (1 - i / 3)
            k.box("wood", (half * 2, 0.05, 0.12), mat_tr((0, y, zz)), oak())
    gable_roof(k, "tiles", W, D, H, rise, 0x8e4a34, over=0.4, rnd=rnd, boards=16)
    k.box("tiles", (0.24, D + 0.9, 0.2), mat_tr((0, 0, H + rise + 0.06)), rgb(0x7a3e2c))
    chimney(k, W / 4, D / 4, H + rise * 0.8 + 0.6, 0x8a4a3a, rnd, key="brick")
    return H + rise


def shell_brick(k, W, D, floors, rnd, door=True, windows=True):
    FH = 3.0
    H = floors * FH
    brick = rgb(rnd.choice([0x8c3c2c, 0x7e3a2a, 0x94442e]), 0.04, rnd)
    white = rgb(0xdcd4c4, 0.03, rnd)
    t = 0.34
    k.box("stone", (W + 0.02, D + 0.02, 0.5), mat_tr((0, 0, 0.22)), rgb(0x6e6a64, 0.05, rnd))
    k.box("brick", (W, t, H), mat_tr((0, -D / 2, H / 2)), brick)
    k.box("brick", (W, t, H), mat_tr((0, D / 2, H / 2)), brick)
    for sd in (-1, 1):
        k.box("brick", (t, D, H), mat_tr((sd * W / 2, 0, H / 2)), brick)
    for side in ("front", "back", "left", "right"):
        L = wall_len(W, D, side)
        for f in range(1, floors + 1):
            plate(k, "stone", W, D, side, 0, f * FH - 0.05, L + 0.1, 0.14, 0.18, white, th=0.08)
        if windows:
            n = max(2, int(L / 1.45))
            for f in range(floors):
                for i in range(n):
                    u = -L / 2 + L * (i + 0.5) / n
                    if side == "front" and f == 0 and door and abs(u) < 0.9:
                        continue
                    window(k, W, D, side, u, f * FH + 1.75, 0.8, 1.45, white, rgb(0x26303a), off=0.17, cross=white, sill=white)
    if door:
        plate(k, "stone", W, D, "front", 0, 1.3, 1.6, 2.6, 0.17, white, th=0.08)
        plate(k, "wood", W, D, "front", 0, 1.15, 1.1, 2.3, 0.2, rgb(0x2e4a3a, 0.06, rnd), th=0.06)
        plate(k, "stone", W, D, "front", 0, 0.1, 2.0, 0.2, 0.5, rgb(0x6e6a64), th=0.6)
    # the stepped gable, in front of a roof that runs back from it
    rise = W * 0.8
    steps = 6
    for y, sgn in ((-D / 2, -1), (D / 2, 1)):
        for i in range(steps):
            w = W * (1 - i / steps)
            z0 = H + i * rise / steps
            k.box("brick", (w, t + 0.04, rise / steps), mat_tr((0, y, z0 + rise / steps / 2)), brick)
            k.box("stone", (w + 0.08, t + 0.12, 0.08), mat_tr((0, y, z0 + rise / steps)), white)
        # a round window high in the front gable, a hoist beam above
        if sgn < 0:
            k.cylinder("wood", 0.36, 0.36, 0.06, mat_tr((0, y - 0.2, H + rise * 0.35), (PI / 2, 0, 0)), white, segs=16)
            k.cylinder("glass", 0.28, 0.28, 0.06, mat_tr((0, y - 0.23, H + rise * 0.35), (PI / 2, 0, 0)), rgb(0x26303a), segs=16)
            k.box("wood", (0.16, 0.9, 0.16), mat_tr((0, y - 0.35, H + rise * 0.72)), rgb(0x3a2a1e))
    gable_roof(k, "tiles", W - 0.1, D - 0.2, H, rise * 0.96, 0x4a3632, over=0.05, rnd=rnd, boards=14)
    chimney(k, -W / 4, D / 5, H + rise * 0.85 + 0.6, 0x7e3a2a, rnd, key="brick")
    return H + rise


MODERN_WALLS = [0xe8d8b0, 0xd9ac92, 0xc9d2c2, 0xe2caa2, 0xd6d0c8, 0xb8c4cc]
AWNING = [0x7a2a2a, 0x2a4a6a, 0x2a5a3a, 0x6a5a2a]


def shell_modern(k, W, D, floors, rnd, door=True, windows=True, shop=True):
    FH = 3.1
    H = floors * FH
    wallc = rgb(rnd.choice(MODERN_WALLS), 0.03, rnd)
    trim = rgb(0xf0ece4, 0.02, rnd)
    t = 0.34
    k.box("stone", (W + 0.02, D + 0.02, FH * 0.95), mat_tr((0, 0, FH * 0.95 / 2)), rgb(0x8a847a, 0.04, rnd))
    k.box("plaster", (W, t, H - FH * 0.95), mat_tr((0, -D / 2, FH * 0.95 + (H - FH * 0.95) / 2)), wallc)
    k.box("plaster", (W, t, H), mat_tr((0, D / 2, H / 2)), wallc)
    for sd in (-1, 1):
        k.box("plaster", (t, D, H), mat_tr((sd * W / 2, 0, H / 2)), wallc)
    glass = rgb(0x4a6478)
    for side in ("front", "back", "left", "right"):
        L = wall_len(W, D, side)
        for f in range(1, floors):
            plate(k, "stone", W, D, side, 0, f * FH, L + 0.12, 0.16, 0.18, trim, th=0.08)
        if windows:
            n = max(2, int(L / 1.6))
            for f in range(1, floors):
                for i in range(n):
                    u = -L / 2 + L * (i + 0.5) / n
                    window(k, W, D, side, u, f * FH + 1.5, 1.0, 1.75, trim, glass, off=0.17, cross=trim)
                    # balconies on the street side, above the shops
                    if side == "front" and f >= 1 and (i % 2 == (f % 2)):
                        loc, rot = on_wall(W, D, side, u, f * FH + 0.55, 0.55)
                        k.box("stone", (1.5, 0.8, 0.12), mat_tr(loc, rot), trim)
                        for dz, h in ((0.5, 0.05),):
                            loc2, _ = on_wall(W, D, side, u, f * FH + 0.6 + dz, 0.92)
                            k.box("iron", (1.5, 0.04, h), mat_tr(loc2, rot), rgb(0x26262a))
                        for j in range(8):
                            loc3, _ = on_wall(W, D, side, u - 0.7 + j * 0.2, f * FH + 0.85, 0.92)
                            k.box("iron", (0.025, 0.025, 0.55), mat_tr(loc3, rot), rgb(0x26262a))
    # the ground floor: a shop window and an awning, or a plain door
    if door:
        plate(k, "wood", W, D, "front", 0, 1.2, 1.2, 2.4, 0.17, rgb(0x2a2a2e), th=0.06)
        plate(k, "glass", W, D, "front", 0, 1.3, 0.8, 1.8, 0.2, glass, th=0.03)
    if shop:
        for sd in (-1, 1):
            u = sd * (W / 4 + 0.35)
            window(k, W, D, "front", u, 1.35, min(1.9, W / 2 - 1.2), 2.0, rgb(0x2a2a2e), rgb(0x5a7488), off=0.16)
        aw = rgb(rnd.choice(AWNING), 0.04, rnd)
        loc, rot = on_wall(W, D, "front", 0, 2.75, 0.75)
        k.box("cloth", (W - 0.4, 1.3, 0.06), mat_tr(loc, (0.35, 0, 0)), aw)
    # a cornice, a flat roof behind a parapet, and the things that stand on a roof
    k.box("stone", (W + 0.4, D + 0.4, 0.3), mat_tr((0, 0, H + 0.05)), trim)
    k.box("plaster", (W, D, 0.2), mat_tr((0, 0, H + 0.3)), rgb(0x6a6a6e, 0.04, rnd))
    for side in ("front", "back"):
        plate(k, "plaster", W, D, side, 0, H + 0.6, W + 0.3, 0.7, -0.05, wallc, th=0.25)
    for sd in (-1, 1):
        k.box("plaster", (0.25, D + 0.3, 0.7), mat_tr((sd * (W / 2 + 0.02), 0, H + 0.6)), wallc)
    k.box("iron", (0.9, 0.9, 0.7), mat_tr((W / 5, D / 5, H + 0.75)), rgb(0x8a8a8e, 0.05, rnd))
    chimney(k, -W / 4, D / 4, H + 1.4, 0x9a8a80, rnd, key="brick")
    return H + 1.0


SHELLS = {"log": shell_log, "timber": shell_timber, "brick": shell_brick, "modern": shell_modern}


# ---------------------------------------------------------------------------
#  what each trade adds to its building
# ---------------------------------------------------------------------------
def sign(k, W, D, color, rnd, emblem=None, z=2.9):
    """A board hung out over the street on an iron bracket."""
    x = W / 2 - 0.6
    k.box("iron", (0.05, 0.9, 0.05), mat_tr((x, -D / 2 - 0.45, z + 0.35)), rgb(0x26262a))
    k.box("wood", (0.06, 0.7, 0.55), mat_tr((x, -D / 2 - 0.6, z)), rgb(color, 0.05, rnd))
    if emblem == "pretzel":
        for a in (-0.5, 0.5):
            k.cylinder("wood", 0.14, 0.14, 0.04, mat_tr((x - 0.05, -D / 2 - 0.6 + a * 0.2, z), (0, PI / 2, 0)), rgb(0xc8903a), segs=12)
    if emblem == "cross":
        k.box("wood", (0.03, 0.44, 0.12), mat_tr((x - 0.04, -D / 2 - 0.6, z)), rgb(0xb8342c))
        k.box("wood", (0.03, 0.12, 0.38), mat_tr((x - 0.04, -D / 2 - 0.6, z)), rgb(0xb8342c))
    if emblem == "anvil":
        k.box("iron", (0.04, 0.4, 0.12), mat_tr((x - 0.05, -D / 2 - 0.6, z + 0.05)), rgb(0x2a2a2e))
        k.box("iron", (0.04, 0.16, 0.18), mat_tr((x - 0.05, -D / 2 - 0.6, z - 0.1)), rgb(0x2a2a2e))


def oven(k, W, D, style, rnd):
    """A domed clay bread oven built on to the side, with its own little roof."""
    x = W / 2 + 1.05
    clay = rgb(0xa8704a if style != "modern" else 0x8a6450, 0.05, rnd)
    k.box("stone", (1.9, 2.0, 0.8), mat_tr((x, 0.2, 0.4)), rgb(0x7a746a, 0.06, rnd), bevel=0.03)
    k.cylinder("clay", 0.85, 0.35, 1.0, mat_tr((x, 0.2, 1.3)), clay, segs=16)
    k.rock("clay", 0.45, mat_tr((x, 0.2, 1.75), (0, 0, 0), (1, 1, 0.5)), clay)
    k.box("soot", (0.5, 0.2, 0.45), mat_tr((x, -0.62, 1.1)), rgb(0x100c0a))
    k.cylinder("stone", 0.14, 0.12, 1.6, mat_tr((x + 0.35, 0.6, 2.3)), rgb(0x6e6860, 0.05, rnd), segs=8)
    # a stack of split wood for it
    for i in range(10):
        row, col = divmod(i, 5)
        k.cylinder("log", 0.08, 0.08, 0.9, mat_tr((x - 0.6 + col * 0.18, 1.45, 0.1 + row * 0.16), (PI / 2, 0, 0)), rgb(0x7a5634, 0.08, rnd), segs=6, end_color=rgb(0xc9a878))


def anvil_yard(k, W, D, style, rnd):
    x = W / 2 + 1.2
    k.box("stone", (1.2, 1.2, 1.0), mat_tr((x, -0.6, 0.5)), rgb(0x6e6860, 0.05, rnd), bevel=0.03)
    k.box("soot", (0.6, 0.2, 0.4), mat_tr((x, -1.22, 0.7)), rgb(0x100c0a))
    k.cylinder("stone", 0.18, 0.14, 2.6, mat_tr((x, -0.4, 2.2)), rgb(0x5a5450, 0.05, rnd), segs=8)
    k.cylinder("wood", 0.3, 0.34, 0.6, mat_tr((x, 0.8, 0.3)), rgb(0x5a4030, 0.05, rnd), segs=10)
    k.box("iron", (0.55, 0.18, 0.22), mat_tr((x, 0.8, 0.72)), rgb(0x2a2a2e))
    k.box("iron", (0.2, 0.14, 0.14), mat_tr((x + 0.33, 0.8, 0.76), (0, 0, 0)), rgb(0x2a2a2e))
    k.cylinder("wood", 0.35, 0.35, 0.5, mat_tr((x - 0.9, 0.9, 0.25)), rgb(0x5a4030, 0.05, rnd), segs=12)


def saw_yard(k, W, D, style, rnd):
    """Logs waiting, a saw-horse and a long frame saw; from the timber age on, a waterwheel turning it."""
    x = -W / 2 - 1.3
    for i in range(9):
        row, col = divmod(i, 3)
        k.cylinder("log", 0.17, 0.16, 3.2, mat_tr((x - 0.2 + (row % 2) * 0.17, -0.9 + col * 0.36, 0.17 + row * 0.3), (PI / 2, 0, 0)), rgb(0x7a5634, 0.08, rnd), segs=9, end_color=rgb(0xc9a878))
    for y in (1.0, 1.9):
        for sx in (-0.3, 0.3):
            k.box("wood", (0.08, 0.08, 0.9), mat_tr((x + sx, y, 0.45), (0, sx * 0.6, 0)), rgb(0x5a4030))
    k.box("wood", (0.9, 1.4, 0.06), mat_tr((x, 1.45, 1.4), (0, 0, 0)), rgb(0x6a4a2e, 0.05, rnd))
    if style in ("timber", "brick"):
        # the wheel, on the right-hand wall
        cx = W / 2 + 0.35
        k.cylinder("wood", 1.6, 1.6, 0.12, mat_tr((cx, 0, 1.7), (0, PI / 2, 0)), rgb(0x5a4030, 0.05, rnd), segs=20)
        k.cylinder("wood", 1.3, 1.3, 0.14, mat_tr((cx, 0, 1.7), (0, PI / 2, 0)), rgb(0x3a2a1e), segs=20)
        for i in range(12):
            a = i / 12 * 2 * PI
            k.box("wood", (0.5, 0.06, 0.34), mat_tr((cx + 0.1, math.cos(a) * 1.55, 1.7 + math.sin(a) * 1.55), (a, 0, 0)), rgb(0x6a4a2e, 0.05, rnd))
        k.cylinder("iron", 0.12, 0.12, 0.6, mat_tr((cx - 0.2, 0, 1.7), (0, PI / 2, 0)), rgb(0x2a2a2e), segs=8)


def kiln(k, W, D, style, rnd):
    """A beehive kiln with a tall chimney, and stacks of bricks drying."""
    x = W / 2 + 1.6
    brick = rgb(0x8a3a2a, 0.04, rnd)
    k.cylinder("brick", 1.25, 1.0, 1.8, mat_tr((x, 0.3, 0.9)), brick, segs=16)
    k.rock("brick", 1.0, mat_tr((x, 0.3, 1.8), (0, 0, 0), (1, 1, 0.55)), brick)
    k.box("soot", (0.6, 0.2, 0.7), mat_tr((x, -0.93, 0.5)), rgb(0x100c0a))
    k.cylinder("brick", 0.35, 0.28, 5.5, mat_tr((x + 0.6, 1.2, 2.75)), rgb(0x7e3626, 0.04, rnd), segs=10)
    for j in range(3):
        for i in range(12):
            row, col = divmod(i, 4)
            k.box("brick", (0.24, 0.11, 0.07), mat_tr((-W / 2 - 0.9 + col * 0.26, -1.2 + j * 0.9, 0.05 + row * 0.08)), rgb(0xa0503a, 0.08, rnd))


def furnace(k, W, D, style, rnd):
    """A stone blast furnace, taller than the shed, with the bellows beside it."""
    x = W / 2 + 1.5
    stone = rgb(0x6e6860, 0.05, rnd)
    for i in range(6):
        w = 2.0 - i * 0.2
        k.box("stone", (w, w, 0.7), mat_tr((x, 0, 0.35 + i * 0.7)), stone, bevel=0.03)
    k.box("soot", (0.6, 0.2, 0.6), mat_tr((x, -1.0, 0.6)), rgb(0x1a0c06))
    k.box("glass", (0.4, 0.16, 0.3), mat_tr((x, -1.02, 0.5)), rgb(0xd86a20))          # the glow of the tap hole
    k.box("wood", (1.0, 0.6, 0.35), mat_tr((x - 1.4, -0.8, 0.8), (0, 0.2, 0)), rgb(0x5a4030))   # the bellows
    k.box("cloth", (0.9, 0.55, 0.25), mat_tr((x - 1.4, -0.8, 1.05), (0, 0.35, 0)), rgb(0x5a3a26))


def stalls(k, W, D, style, rnd):
    """Stalls out in front: trestles, crates and bright awnings."""
    for i, u in enumerate((-W / 3, 0, W / 3)):
        y = -D / 2 - 2.0
        c = rgb(AWNING[(i + rnd.randint(0, 3)) % len(AWNING)], 0.05, rnd)
        k.box("wood", (1.8, 0.8, 0.08), mat_tr((u, y, 0.85)), rgb(0x6a4a2e, 0.05, rnd))
        for sx in (-0.8, 0.8):
            for sy in (-0.35, 0.35):
                k.box("wood", (0.06, 0.06, 0.85), mat_tr((u + sx, y + sy, 0.42)), rgb(0x4a3422))
            k.box("wood", (0.06, 0.06, 2.1), mat_tr((u + sx, y - 0.45, 1.05)), rgb(0x4a3422))
        k.box("cloth", (2.0, 1.4, 0.04), mat_tr((u, y - 0.1, 2.05), (0.2, 0, 0)), c)
        for j in range(3):
            k.box("wood", (0.4, 0.3, 0.25), mat_tr((u - 0.5 + j * 0.5, y, 1.02)), rgb(rnd.choice([0x8a6a45, 0xc8a050, 0x7a8a3a, 0xa04a30]), 0.08, rnd))


def tower(k, W, D, style, rnd, top=8.0):
    """A clock tower at the front of the town hall, rising above the roof."""
    th = top + 4.5
    y = -D / 2 - 0.2
    col = {"log": 0x7a5634, "timber": 0xe6dcc4, "brick": 0x8c3c2c, "modern": 0xe8e0d0}[style]
    key = {"log": "wood", "timber": "plaster", "brick": "brick", "modern": "plaster"}[style]
    k.box(key, (2.4, 2.4, th), mat_tr((0, y, th / 2)), rgb(col, 0.03, rnd))
    for side_y in (y - 1.22,):
        k.cylinder("stone", 0.6, 0.6, 0.08, mat_tr((0, side_y, th - 1.4), (PI / 2, 0, 0)), rgb(0xf0ece0), segs=20)   # the clock face
        k.box("iron", (0.05, 0.03, 0.45), mat_tr((0, side_y - 0.06, th - 1.25)), rgb(0x1a1a1e))
        k.box("iron", (0.32, 0.03, 0.05), mat_tr((0.12, side_y - 0.06, th - 1.4)), rgb(0x1a1a1e))
    spire = {"log": 0x4e3e30, "timber": 0x8e4a34, "brick": 0x5a8a78, "modern": 0x5a8a78}[style]
    k.cylinder("tiles", 1.8, 0.02, 3.2, mat_tr((0, y, th + 1.6)), rgb(spire, 0.03, rnd), segs=4)
    k.cylinder("iron", 0.03, 0.03, 0.8, mat_tr((0, y, th + 3.4)), rgb(0xc8a040), segs=6)


def church(k, style, rnd):
    """A nave and a west tower with its spire — St. Nikolai in little, when it is brick."""
    W, D = 6.0, 11.0
    wall = {"log": 0x8a6440, "timber": 0xe6dcc4, "brick": 0x8c3c2c, "modern": 0xe8e2d6}[style]
    key = {"log": "wood", "timber": "plaster", "brick": "brick", "modern": "plaster"}[style]
    H = 5.5 if style != "log" else 4.0
    k.box(key, (W, D, H), mat_tr((0, 1.0, H / 2)), rgb(wall, 0.03, rnd))
    # tall pointed windows along the nave
    for sd in (-1, 1):
        for i in range(4):
            y = -2.5 + i * 2.6
            k.box("glass", (0.06, 0.9, 2.4), mat_tr((sd * (W / 2 + 0.02), y, H * 0.55)), rgb(0x3a4a6a))
            k.cylinder("glass", 0.45, 0.02, 0.6, mat_tr((sd * (W / 2 + 0.02), y, H * 0.55 + 1.5), (0, 0, 0), (0.12, 1, 1)), rgb(0x3a4a6a), segs=4)
    rise = W * 0.75
    gable_roof(k, "tiles", W, D, H, rise, {"log": 0x4e3e30, "timber": 0x8e4a34, "brick": 0x4a3632, "modern": 0x4a4a52}[style], over=0.3, rnd=rnd, boards=18)
    for y in (1.0 - D / 2, 1.0 + D / 2):
        gable_end(k, key, W, D, y - 1.0, H, rise, rgb(wall, 0.03, rnd))
    # the tower, at the west end, and its spire
    T = H + rise + (3 if style == "log" else 6)
    k.box(key, (3.0, 3.0, T), mat_tr((0, -D / 2 + 0.5, T / 2)), rgb(wall, 0.03, rnd))
    k.box("wood", (1.3, 0.1, 2.4), mat_tr((0, -D / 2 - 1.02, 1.2)), rgb(0x3a2a1e))
    k.cylinder("glass", 0.5, 0.5, 0.08, mat_tr((0, -D / 2 - 1.02, T - 2.0), (PI / 2, 0, 0)), rgb(0x2a2a30), segs=16)
    spire = {"log": 0x4e3e30, "timber": 0x3a2a1e, "brick": 0x5a8a78, "modern": 0x5a8a78}[style]
    sh = 3.5 if style == "log" else 8.0
    k.cylinder("tiles", 2.2, 0.03, sh, mat_tr((0, -D / 2 + 0.5, T + sh / 2), (0, 0, PI / 4)), rgb(spire, 0.03, rnd), segs=8)
    k.cylinder("iron", 0.03, 0.03, 1.0, mat_tr((0, -D / 2 + 0.5, T + sh + 0.4)), rgb(0xc8a040), segs=6)
    k.box("iron", (0.5, 0.03, 0.03), mat_tr((0, -D / 2 + 0.5, T + sh + 0.6)), rgb(0xc8a040))


def shrine(k, style, rnd):
    """A wayside shrine: a stone plinth, a little gabled house of timber over a niche, a cross on the ridge."""
    k.box("stone", (1.8, 1.4, 0.5), mat_tr((0, 0, 0.25)), rgb(0x8a857c, 0.05, rnd), bevel=0.04)
    k.box("stone", (1.3, 1.0, 1.6), mat_tr((0, 0.1, 1.3)), rgb(0x9a948a, 0.05, rnd), bevel=0.03)
    # the niche, dark, with a candle in it
    k.box("soot", (0.7, 0.1, 0.9), mat_tr((0, -0.42, 1.35)), rgb(0x1a1612))
    k.cylinder("wax", 0.04, 0.04, 0.2, mat_tr((0, -0.42, 1.0)), rgb(0xeee4c8), segs=6)
    k.rock("glass", 0.05, mat_tr((0, -0.42, 1.14)), rgb(0xffc060))
    # a little roof, boards over it
    for sd in (-1, 1):
        k.box("wood", (0.95, 1.5, 0.06), mat_tr((sd * 0.38, 0.1, 2.35), (0, sd * 0.72, 0)), rgb(0x4e3e30, 0.05, rnd))
    k.box("wood", (0.08, 0.08, 0.9), mat_tr((0, 0.1, 3.0)), rgb(0x3a2a1e))
    k.box("wood", (0.45, 0.08, 0.08), mat_tr((0, 0.1, 3.18)), rgb(0x3a2a1e))
    # flowers someone left
    for i in range(5):
        k.rock("cloth", 0.06, mat_tr((rnd.uniform(-0.5, 0.5), -0.62, 0.55)), rgb(rnd.choice([0xc83a3a, 0xe8d04a, 0xe8e8f0])))


def bars(k, W, D, style, rnd):
    """The jail: an iron grille over the front windows, a heavy door band, and a walled yard behind."""
    for u in (-W / 2 + 1.0, W / 2 - 1.0):
        for i in range(5):
            plate(k, "iron", W, D, "front", u - 0.3 + i * 0.15, 1.6, 0.03, 0.9, 0.09, rgb(0x26262a), th=0.03)
    plate(k, "iron", W, D, "front", 0, 1.1, 1.05, 0.08, 0.1, rgb(0x26262a), th=0.03)
    wall = rgb(0x8a857c, 0.05, rnd)
    for sx in (-1, 1):
        k.box("stone", (0.3, 3.0, 2.0), mat_tr((sx * (W / 2 - 0.15), D / 2 + 1.5, 1.0)), wall, bevel=0.02)
    k.box("stone", (W, 0.3, 2.0), mat_tr((0, D / 2 + 2.9, 1.0)), wall, bevel=0.02)


def quarry(k, rnd):
    """A face cut into a knoll of rock, blocks squared off, a wooden crane to lift them."""
    for i in range(14):
        a = PI * 0.15 + i / 13 * PI * 0.7
        r = 4.2 + rnd.uniform(-0.3, 0.4)
        k.rock("stone", rnd.uniform(1.1, 1.8), mat_tr((math.cos(a) * r, math.sin(a) * r * 0.8 + 1.5, rnd.uniform(0.6, 1.4)), (0, 0, rnd.uniform(0, 3)), (1, 1, 0.8)), rgb(rnd.choice([0x8a857c, 0x7a756c, 0x958e82]), 0.06, rnd), lumps=0.3)
    for i in range(8):
        x, y = rnd.uniform(-2.5, 2.5), rnd.uniform(-2.5, 0.5)
        k.box("stone", (0.8, 0.5, 0.45), mat_tr((x, y, 0.23), (0, 0, rnd.uniform(0, 1))), rgb(0x9a948a, 0.06, rnd), bevel=0.03)
    # the crane: an A-frame, a jib, a rope and a block on it
    for sx in (-0.9, 0.9):
        k.box("wood", (0.14, 0.14, 4.4), mat_tr((sx * 0.8 + 2.4, -1.4, 2.1), (0, sx * 0.2, 0)), rgb(0x5a4030))
    k.box("wood", (0.14, 3.2, 0.14), mat_tr((2.4, -2.6, 4.1), (0.35, 0, 0)), rgb(0x5a4030))
    k.cylinder("rope", 0.02, 0.02, 2.4, mat_tr((2.4, -3.9, 2.9)), rgb(0x8a7a5a), segs=5)
    k.box("stone", (0.7, 0.5, 0.45), mat_tr((2.4, -3.9, 1.5)), rgb(0x9a948a))


def mine(k, rnd):
    """A timbered adit into a hump of rock, a windlass, and an ore cart on its rails."""
    for i in range(12):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(1.0, 3.2)
        k.rock("stone", rnd.uniform(1.2, 2.2), mat_tr((math.cos(a) * r, math.sin(a) * r * 0.7 + 1.6, rnd.uniform(0.4, 1.8)), (0, 0, rnd.uniform(0, 3)), (1, 1, 0.75)), rgb(rnd.choice([0x6a655d, 0x5f5a53, 0x77706a]), 0.06, rnd), lumps=0.3)
    k.box("soot", (1.6, 1.0, 2.1), mat_tr((0, -0.8, 1.05)), rgb(0x0a0908))
    for sx in (-0.95, 0.95):
        k.box("wood", (0.2, 0.2, 2.4), mat_tr((sx, -1.4, 1.2)), rgb(0x5a4030))
    k.box("wood", (2.3, 0.25, 0.25), mat_tr((0, -1.4, 2.45)), rgb(0x5a4030))
    for sx in (-0.35, 0.35):
        k.box("iron", (0.06, 4.0, 0.06), mat_tr((sx, -3.2, 0.03)), rgb(0x3a3a3e))
    for i in range(8):
        k.box("wood", (1.0, 0.12, 0.06), mat_tr((0, -1.6 - i * 0.5, 0.02)), rgb(0x4a3422))
    k.box("wood", (0.8, 1.1, 0.55), mat_tr((0, -3.6, 0.5)), rgb(0x5a4030))
    for i in range(5):
        k.rock("stone", 0.18, mat_tr((rnd.uniform(-0.25, 0.25), -3.6 + rnd.uniform(-0.35, 0.35), 0.85)), rgb(0x6a4a3a, 0.1, rnd))
    for sx in (-0.4, 0.4):
        for sy in (-3.25, -3.95):
            k.cylinder("iron", 0.14, 0.14, 0.06, mat_tr((sx, sy, 0.16), (0, PI / 2, 0)), rgb(0x2a2a2e), segs=10)


def fountain(k, style, rnd):
    """The well grown up: a stone basin and a column in the square, or a modern fountain."""
    if style == "brick":
        for i in range(16):
            a = i / 16 * 2 * PI
            k.box("stone", (0.9, 0.35, 0.6), mat_tr((math.cos(a) * 1.8, math.sin(a) * 1.8, 0.3), (0, 0, a + PI / 2)), rgb(0x9a948a, 0.05, rnd), bevel=0.03)
        k.cylinder("glass", 1.65, 1.65, 0.05, mat_tr((0, 0, 0.45)), rgb(0x3a5a6a), segs=24)
        k.cylinder("stone", 0.28, 0.35, 2.4, mat_tr((0, 0, 1.2)), rgb(0x9a948a, 0.04, rnd), segs=12)
        k.cylinder("stone", 0.6, 0.3, 0.3, mat_tr((0, 0, 2.5)), rgb(0x9a948a), segs=12)
        k.rock("stone", 0.35, mat_tr((0, 0, 2.9)), rgb(0xc8a040))
    else:
        k.cylinder("stone", 2.4, 2.4, 0.5, mat_tr((0, 0, 0.25)), rgb(0xd8d4cc, 0.02, rnd), segs=32)
        k.cylinder("glass", 2.2, 2.2, 0.05, mat_tr((0, 0, 0.47)), rgb(0x4a7a8a), segs=32)
        k.cylinder("stone", 0.9, 1.1, 0.5, mat_tr((0, 0, 0.75)), rgb(0xd8d4cc), segs=24)
        k.cylinder("glass", 0.8, 0.8, 0.05, mat_tr((0, 0, 1.0)), rgb(0x4a7a8a), segs=24)
        k.cylinder("iron", 0.08, 0.05, 1.8, mat_tr((0, 0, 1.9)), rgb(0x8a8a8e), segs=10)
        k.rock("glass", 0.25, mat_tr((0, 0, 2.8), (0, 0, 0), (1, 1, 1.4)), rgb(0xb8d8e8))


def lamp(k, style, rnd):
    if style == "modern":
        k.cylinder("iron", 0.08, 0.06, 4.2, mat_tr((0, 0, 2.1)), rgb(0x26262a), segs=10)
        k.box("iron", (0.1, 1.0, 0.08), mat_tr((0, -0.5, 4.2)), rgb(0x26262a))
        k.box("glass", (0.34, 0.5, 0.12), mat_tr((0, -0.95, 4.12)), rgb(0xfff0c0))
    else:
        k.box("wood", (0.14, 0.14, 2.8), mat_tr((0, 0, 1.4)), rgb(0x3a2a1e))
        k.box("iron", (0.05, 0.6, 0.05), mat_tr((0, -0.3, 2.7)), rgb(0x26262a))
        k.box("glass", (0.24, 0.24, 0.34), mat_tr((0, -0.55, 2.45)), rgb(0xffd88a))
        k.cylinder("iron", 0.2, 0.02, 0.18, mat_tr((0, -0.55, 2.7)), rgb(0x26262a), segs=4)


# type: (width, depth, floors per tier, what it adds, sign colour, emblem)
TYPES = {
    "house":    (5.0, 6.0, {1: 1, 2: 2, 3: 3, 4: 4}, None, None, None),
    "bakery":   (5.0, 5.2, {1: 1, 2: 2, 3: 2, 4: 3}, oven, 0xc89a3a, "pretzel"),
    "forge":    (5.4, 5.0, {1: 1, 2: 1, 3: 2, 4: 3}, anvil_yard, 0x5a5a60, "anvil"),
    "sawmill":  (6.0, 5.0, {1: 1, 2: 1, 3: 2, 4: 2}, saw_yard, 0x7a5634, None),
    "brickworks": (4.6, 4.0, {1: 1, 2: 1, 3: 1, 4: 2}, kiln, 0x8a3a2a, None),
    "smelter":  (5.0, 4.4, {1: 1, 2: 1, 3: 2, 4: 2}, furnace, 0x3a3a40, None),
    "market":   (8.0, 6.0, {1: 1, 2: 2, 3: 3, 4: 3}, stalls, 0x2a4a6a, None),
    "townhall": (9.0, 7.0, {1: 1, 2: 2, 3: 3, 4: 4}, "tower", 0x7a2a2a, None),
    "jail":     (5.0, 5.0, {1: 1, 2: 1, 3: 2, 4: 2}, bars, 0x3a3a40, None),
    "hospital": (7.0, 5.4, {1: 1, 2: 2, 3: 2, 4: 3}, None, 0xe8e0d0, "cross"),
}
# built whole, not as a shell: (builder, which tiers exist)
SPECIAL = {
    "church": (lambda k, st, rnd: church(k, st, rnd), (1, 2, 3, 4)),
    "quarry": (lambda k, st, rnd: quarry(k, rnd), (1,)),
    "shrine": (lambda k, st, rnd: shrine(k, st, rnd), (1,)),
    "mine": (lambda k, st, rnd: mine(k, rnd), (1,)),
    "fountain": (lambda k, st, rnd: fountain(k, st, rnd), (3, 4)),
    "lamp": (lambda k, st, rnd: lamp(k, st, rnd), (1, 4)),
}


def build_special(tp, tier):
    fn, _ = SPECIAL[tp]
    sc = fresh_scene(f"Reckoning {tp} {tier}")
    k = Kit(f"{tp}{tier}", seed=hash((tp, tier)) & 0xffff)
    fn(k, STYLES[tier], k.rnd)
    objs = k.build(sc, smooth=("clay",))
    return export(sc, os.path.join("town", f"{tp}_{tier}.glb"), objs)


def build(tp, tier):
    if tp in SPECIAL:
        return build_special(tp, tier)
    W, D, floors, extra, sign_c, emblem = TYPES[tp]
    style = STYLES[tier]
    sc = fresh_scene(f"Reckoning {tp} {tier}")
    k = Kit(f"{tp}{tier}", seed=hash((tp, tier)) & 0xffff)
    rnd = k.rnd
    if style == "modern":
        shell_modern(k, W, D, floors[tier], rnd, shop=tp != "house")
    else:
        SHELLS[style](k, W, D, floors[tier], rnd)
    if extra == "tower":
        top = {"log": 4.0, "timber": floors[tier] * 2.8, "brick": floors[tier] * 3.0, "modern": floors[tier] * 3.1}[style]
        tower(k, W, D, style, rnd, top)
    elif extra:
        extra(k, W, D, style, rnd)
    if sign_c is not None and style != "log":
        sign(k, W, D, sign_c, rnd, emblem, z=2.9 if style != "modern" else 3.6)
    objs = k.build(sc, smooth=("log", "clay"))
    return export(sc, os.path.join("town", f"{tp}_{tier}.glb"), objs)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    kinds = args or list(TYPES) + list(SPECIAL)
    for tp in kinds:
        for tier in (SPECIAL[tp][1] if tp in SPECIAL else (1, 2, 3, 4)):
            if tp == "house" and tier == 1:
                continue        # the first house is the cabin itself
            print("wrote", build(tp, tier))
