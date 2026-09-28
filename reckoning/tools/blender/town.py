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
            plate(k, "wood", W, D, side, 0, f * FH + 1.0, L, 0.1, 0.165, oak(), th=0.04)
            # braces in the end bays, like the Hamburg houses on the Deichstraße
            bw = L / bays
            for sd in (-1, 1):
                u0 = sd * (L / 2 - bw / 2)
                ang = math.atan2(FH - 0.3, bw) * (1 if sd > 0 else -1)
                loc, rot = on_wall(W, D, side, u0, f * FH + FH / 2, 0.165)
                k.box("wood", (math.hypot(bw, FH - 0.3) - 0.1, 0.04, 0.12), mat_tr(loc, (rot[0], ang if side in ("front", "back") else 0, rot[2])) if side in ("front", "back") else mat_tr(loc, rot), oak())
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


# type: (width, depth, floors per tier, what it adds, sign colour, emblem)
TYPES = {
    "house":  (5.0, 6.0, {1: 1, 2: 2, 3: 3, 4: 4}, None, None, None),
    "bakery": (5.0, 5.2, {1: 1, 2: 2, 3: 2, 4: 3}, oven, 0xc89a3a, "pretzel"),
    "forge":  (5.4, 5.0, {1: 1, 2: 1, 3: 2, 4: 3}, anvil_yard, 0x5a5a60, "anvil"),
}


def build(tp, tier):
    W, D, floors, extra, sign_c, emblem = TYPES[tp]
    style = STYLES[tier]
    sc = fresh_scene(f"Reckoning {tp} {tier}")
    k = Kit(f"{tp}{tier}", seed=hash((tp, tier)) & 0xffff)
    rnd = k.rnd
    if style == "modern":
        shell_modern(k, W, D, floors[tier], rnd, shop=tp != "house")
    else:
        SHELLS[style](k, W, D, floors[tier], rnd)
    if extra:
        extra(k, W, D, style, rnd)
    if sign_c is not None and style != "log":
        sign(k, W, D, sign_c, rnd, emblem, z=2.9 if style != "modern" else 3.6)
    objs = k.build(sc, smooth=("log", "clay"))
    return export(sc, os.path.join("town", f"{tp}_{tier}.glb"), objs)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    kinds = args or list(TYPES)
    for tp in kinds:
        for tier in (1, 2, 3, 4):
            if tp == "house" and tier == 1:
                continue        # the first house is the cabin itself
            print("wrote", build(tp, tier))
