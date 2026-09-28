"""The cabin in the clearing: whole (cabin.glb) and burned (cabin_burned.glb).

A Nordic log cabin: round logs laid in alternate courses, their ends crossing
out past the corners; a boarded gable roof; a stone chimney at the back left;
a plank door in the front, a shuttered window on the right. The ruin is the
same cabin after the fire: walls burned down to uneven stubs, the roof fallen
in, the chimney still standing, because fire does not take stone.

Footprint as the game expects it: 5 m wide (X), 6 m deep (Y), door at the
front (-Y), origin at the centre of the floor.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.expanduser("~/Forester/reckoning/tools/blender"))
import importlib
import bpy
import common
importlib.reload(common)
from common import Kit, rgb, mat_tr, fresh_scene, export

W, D = 5.0, 6.0             # wall centre lines
R = 0.17                    # log radius
COURSE = 0.33               # rise per course
COURSES = 8
OVER = 0.38                 # how far log ends cross past the corners
DOOR_W, DOOR_H = 1.3, 2.1
WIN_Y, WIN_W, WIN_Z0, WIN_Z1 = 0.5, 0.8, 1.15, 1.85
CHIMNEY = (-1.2, D / 2 + 0.3)
ROOF_H = 2.1
PI = math.pi

LOG = [0x8a6440, 0x7c5a38, 0x94704a, 0x806040]
LOG_END = 0xc9a878
CHAR = [0x1c1714, 0x241c17, 0x2e241c, 0x15110f]
CHAR_END = 0x3a2c22


def build(burned):
    name = "cabin_burned" if burned else "cabin"
    sc = fresh_scene(f"Reckoning {name}")
    k = Kit(name, seed=7 if burned else 3)
    rnd = k.rnd
    logc = (lambda: rgb(rnd.choice(CHAR), 0.15, rnd)) if burned else (lambda: rgb(rnd.choice(LOG), 0.08, rnd))
    endc = rgb(CHAR_END if burned else LOG_END, 0.1, rnd)

    # how high the fire left each wall standing, by position along it
    def stub(x, y):
        if not burned:
            return 99
        # the front right burned lowest, the back left (by the chimney) highest
        return 0.6 + 2.3 * (0.5 + 0.5 * math.sin(x * 0.9 - y * 0.55 + 1.3)) * (0.55 + 0.45 * (y + D / 2) / D)

    def log_x(y, z, x0, x1):
        """a log running along X, from x0 to x1, at height z"""
        L = x1 - x0
        if burned:
            # charred logs break: keep only the part under the burn line
            segs, x = [], x0
            while x < x1 - 0.05:
                step = min(x1 - x, rnd.uniform(0.6, 1.6))
                if z < stub(x + step / 2, y):
                    segs.append((x, x + step))
                x += step
            for a, b in segs:
                k.cylinder("log", R * rnd.uniform(0.85, 1.0), R * rnd.uniform(0.8, 1.0), b - a - 0.02,
                           mat_tr(((a + b) / 2, y, z), (0, PI / 2, 0)), logc(), segs=9, end_color=endc, wobble=0.12)
            return
        k.cylinder("log", R * rnd.uniform(0.95, 1.05), R * rnd.uniform(0.9, 1.0), L,
                   mat_tr(((x0 + x1) / 2, y, z), (0, PI / 2, 0)), logc(), segs=10, end_color=endc, wobble=0.05)

    def log_y(x, z, y0, y1):
        L = y1 - y0
        if burned:
            segs, y = [], y0
            while y < y1 - 0.05:
                step = min(y1 - y, rnd.uniform(0.6, 1.6))
                if z < stub(x, y + step / 2):
                    segs.append((y, y + step))
                y += step
            for a, b in segs:
                k.cylinder("log", R * rnd.uniform(0.85, 1.0), R * rnd.uniform(0.8, 1.0), b - a - 0.02,
                           mat_tr((x, (a + b) / 2, z), (PI / 2, 0, 0)), logc(), segs=9, end_color=endc, wobble=0.12)
            return
        k.cylinder("log", R * rnd.uniform(0.95, 1.05), R * rnd.uniform(0.9, 1.0), L,
                   mat_tr((x, (y0 + y1) / 2, z), (PI / 2, 0, 0)), logc(), segs=10, end_color=endc, wobble=0.05)

    # ---- walls: front/back courses at whole steps, sides half a step up ----
    for i in range(COURSES):
        z = R + i * COURSE
        zs = z + COURSE / 2
        # back wall, whole
        log_x(D / 2, z, -W / 2 - OVER, W / 2 + OVER)
        # front wall, split by the door
        if z + R < DOOR_H:
            log_x(-D / 2, z, -W / 2 - OVER, -DOOR_W / 2)
            log_x(-D / 2, z, DOOR_W / 2, W / 2 + OVER)
        else:
            log_x(-D / 2, z, -W / 2 - OVER, W / 2 + OVER)
        if i < COURSES - 1 or True:
            # left wall, whole
            log_y(-W / 2, zs, -D / 2 - OVER, D / 2 + OVER)
            # right wall, split by the window
            if WIN_Z0 < zs < WIN_Z1 + R:
                log_y(W / 2, zs, -D / 2 - OVER, WIN_Y - WIN_W / 2)
                log_y(W / 2, zs, WIN_Y + WIN_W / 2, D / 2 + OVER)
            else:
                log_y(W / 2, zs, -D / 2 - OVER, D / 2 + OVER)
    top = R + (COURSES - 1) * COURSE + COURSE / 2 + R

    # (no stone sill round the foot: the logs sit on the ground, with nothing sticking out to stand on)

    wood = lambda h=0x6e4e30, j=0.1: rgb(h, j, rnd)
    iron = rgb(0x2a2724, 0.05, rnd)

    if not burned:
        # ---- door: its own piece, hung on a hinge at its left edge, so the game can swing it ----
        # (built around the hinge; an empty named "door" stands at the hinge and carries it)
        dk = Kit("cabin_door", seed=5)
        planks = 5
        pw = DOOR_W / planks
        for i in range(planks):
            x = pw * (i + 0.5)
            dk.box("wood", (pw - 0.012, 0.07, DOOR_H - 0.04 - rnd.uniform(0, 0.03)), mat_tr((x, 0, DOOR_H / 2)), wood(0x6a4a2c))
        for z in (0.4, DOOR_H - 0.4):
            dk.box("wood", (DOOR_W - 0.08, 0.05, 0.14), mat_tr((DOOR_W / 2, -0.06, z)), wood(0x5a3e24))
            dk.box("wood", (DOOR_W - 0.08, 0.05, 0.14), mat_tr((DOOR_W / 2, 0.06, z)), wood(0x5a3e24))
            dk.box("iron", (DOOR_W * 0.7, 0.02, 0.05), mat_tr((DOOR_W * 0.35, -0.08, z)), iron)
        dk.box("iron", (0.05, 0.04, 0.18), mat_tr((DOOR_W - 0.16, -0.08, 1.05)), iron)
        dk.box("iron", (0.05, 0.04, 0.18), mat_tr((DOOR_W - 0.16, 0.08, 1.05)), iron)
        door_parts = dk.build(sc)
        hinge = bpy.data.objects.new("door", None)
        sc.collection.objects.link(hinge)
        hinge.location = (-DOOR_W / 2, -D / 2 + 0.02, 0)
        for ob in door_parts:
            ob.parent = hinge

        # ---- inside: a floor of split planks, and a hearth of fieldstone against the chimney ----
        for i in range(14):
            y = -D / 2 + 0.2 + (D - 0.4) * (i + 0.5) / 14
            k.box("wood", (W - 0.3, (D - 0.4) / 14 - 0.015, 0.06), mat_tr((0, y, 0.04)), wood(rnd.choice([0x7a5a3a, 0x6e5034, 0x836142]), 0.08))
        hx, hy = CHIMNEY[0], D / 2 - 0.5
        for zz in range(5):
            for xx in range(4):
                k.box("stone", (0.36, 0.5, 0.2), mat_tr((hx - 0.54 + xx * 0.36 + (zz % 2) * 0.1, hy, 0.1 + zz * 0.21)), rgb(rnd.choice([0x78736a, 0x6a655d, 0x847e74]), 0.08, rnd), bevel=0.02)
        k.box("soot", (0.8, 0.3, 0.62), mat_tr((hx, hy - 0.12, 0.42)), rgb(0x100c0a))          # the firebox
        k.box("wood", (1.7, 0.36, 0.1), mat_tr((hx, hy - 0.05, 1.12)), wood(0x5a3e28))          # the mantle
        k.box("stone", (1.6, 0.7, 0.06), mat_tr((hx, hy - 0.6, 0.05)), rgb(0x6a655d, 0.05, rnd), bevel=0.02)   # hearthstone
        # door frame posts and lintel
        for x in (-DOOR_W / 2 - 0.07, DOOR_W / 2 + 0.07):
            k.box("wood", (0.14, 0.34, DOOR_H + 0.1), mat_tr((x, -D / 2, DOOR_H / 2)), wood(0x5e422a))
        k.box("wood", (DOOR_W + 0.4, 0.36, 0.16), mat_tr((0, -D / 2, DOOR_H + 0.06)), wood(0x5e422a))
        # a flat stone step
        k.box("stone", (1.5, 0.7, 0.14), mat_tr((0, -D / 2 - 0.55, 0.04), (0, 0, 0.03)), rgb(0x7a756c, 0.1, rnd), bevel=0.03)

        # ---- window: frame, shutters open, a glazing of dark horn panes ----
        wx = W / 2 + 0.02
        for y in (WIN_Y - WIN_W / 2 - 0.05, WIN_Y + WIN_W / 2 + 0.05):
            k.box("wood", (0.3, 0.1, WIN_Z1 - WIN_Z0 + 0.2), mat_tr((wx, y, (WIN_Z0 + WIN_Z1) / 2)), wood(0x5e422a))
        for z in (WIN_Z0 - 0.05, WIN_Z1 + 0.05):
            k.box("wood", (0.32, WIN_W + 0.2, 0.1), mat_tr((wx, WIN_Y, z)), wood(0x5e422a))
        for sd in (-1, 1):
            k.box("wood", (0.05, WIN_W / 2, WIN_Z1 - WIN_Z0), mat_tr((wx + 0.15, WIN_Y + sd * (WIN_W / 2 + WIN_W / 4 + 0.08), (WIN_Z0 + WIN_Z1) / 2), (0, 0, sd * 0.25)), wood(0x4f6a4a, 0.05))

        # ---- gables: horizontal boards filling the triangles ----
        for y in (-D / 2, D / 2):
            n = 9
            # the first board sits down on the top log, so no daylight shows between them
            k.box("wood", (W + 0.2, 0.06, 0.24), mat_tr((0, y + (-0.02 if y < 0 else 0.02), top - 0.1)), wood(0x6a4a2e, 0.12))
            for i in range(n):
                z0 = top + i * (ROOF_H / n)
                half = (W / 2 + 0.1) * (1 - (i + 0.5) / n)
                k.box("wood", (half * 2, 0.06, ROOF_H / n - 0.015), mat_tr((0, y + (-0.02 if y < 0 else 0.02), z0 + ROOF_H / n / 2)), wood(0x6a4a2e, 0.12))

        # ---- roof: rafters, then two slopes of long boards, a ridge board ----
        over_eave, over_gable = 0.55, 0.45
        slope = math.atan2(ROOF_H, W / 2)
        run = math.hypot(W / 2 + over_eave, ROOF_H + over_eave * math.tan(slope))
        for sd in (-1, 1):
            n = 14
            for i in range(n):
                y = -D / 2 - over_gable + (D + 2 * over_gable) * (i + 0.5) / n
                cx = sd * (W / 2 + over_eave) / 2
                cz = top + ROOF_H - (ROOF_H + over_eave * math.tan(slope)) / 2 + 0.08
                k.box("roof", (run, (D + 2 * over_gable) / n - 0.02, 0.05),
                      mat_tr((cx, y, cz + rnd.uniform(-0.01, 0.01)), (0, sd * slope, 0)), rgb(0x4e3e30, 0.14, rnd))
            # rafters showing under the eaves
            for i in range(6):
                y = -D / 2 + D * i / 5
                k.box("wood", (run, 0.12, 0.14), mat_tr((sd * (W / 2 + over_eave) / 2, y, top + ROOF_H - (ROOF_H + over_eave * math.tan(slope)) / 2 - 0.02), (0, sd * slope, 0)), wood(0x5a3e28))
            # barge boards on the gable ends
            for y in (-D / 2 - over_gable, D / 2 + over_gable):
                k.box("wood", (run, 0.06, 0.24), mat_tr((sd * (W / 2 + over_eave) / 2, y, top + ROOF_H - (ROOF_H + over_eave * math.tan(slope)) / 2 + 0.02), (0, sd * slope, 0)), wood(0x4a3422))
        k.cylinder("log", 0.13, 0.13, D + 2 * over_gable + 0.1, mat_tr((0, 0, top + ROOF_H + 0.12), (PI / 2, 0, 0)), logc(), segs=10, end_color=endc)

        # the charred beam they kept, at the front left corner
        k.box("char", (0.32, 0.32, top), mat_tr((-W / 2 - 0.05, -D / 2 - 0.05, top / 2), (0, 0, 0.04)), rgb(0x171210, 0.05, rnd), bevel=0.03)
    else:
        # ---- the fallen roof: charred rafters leaning into the ruin, and more on the floor ----
        for i in range(7):
            x = rnd.uniform(-1.8, 1.8); y = rnd.uniform(-2.3, 2.3)
            L = rnd.uniform(1.6, 3.4)
            k.box("log", (L, 0.14, 0.16), mat_tr((x, y, 0.12 + rnd.uniform(0, 0.4)), (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.35, 0.35), rnd.uniform(0, PI))), logc())
        for (x, y, lean, rz) in [(-1.6, 1.2, 0.9, 0.4), (1.2, -0.8, -0.8, 2.2), (0.3, 2.0, 0.7, 1.4)]:
            k.box("log", (3.2, 0.15, 0.17), mat_tr((x, y, 1.05), (0, lean, rz)), logc())
        # ash and char heaped where the roof came down
        for i in range(40):
            x = rnd.uniform(-2.2, 2.2); y = rnd.uniform(-2.7, 2.7)
            k.rock("ash", rnd.uniform(0.15, 0.4), mat_tr((x, y, 0.0), (0, 0, rnd.uniform(0, 6)), (1, 1, rnd.uniform(0.25, 0.5))), rgb(rnd.choice([0x3a3530, 0x4a443d, 0x2a2622, 0x57504a]), 0.1, rnd))
        # the door, fallen outward on the step
        for i in range(5):
            x = -DOOR_W / 2 + DOOR_W / 5 * (i + 0.5)
            k.box("log", (DOOR_W / 5 - 0.015, DOOR_H * rnd.uniform(0.55, 0.9), 0.06), mat_tr((x, -D / 2 - 1.0, 0.05), (0.06, 0, rnd.uniform(-0.04, 0.04))), logc())
        # burned stumps of the corner posts, the heights the game's colliders expect
        for (x, y, h) in [(-2.5, -3, 2.4), (2.5, -3, 1.4), (-2.5, 3, 1.9), (2.5, 3, 0.8)]:
            k.box("char", (0.28, 0.28, h), mat_tr((x, y, h / 2), (0, 0, rnd.uniform(-0.1, 0.1))), rgb(0x1a1614, 0.08, rnd), bevel=0.03)

    # ---- the chimney: dressed stones, stepping in as it rises ----
    cx, cy = CHIMNEY
    height = 5.6 if not burned else 4.2
    z = 0.0
    row = 0
    while z < height:
        h = rnd.uniform(0.2, 0.28)
        w = 1.25 if z < 2.2 else 0.9
        d = 0.95 if z < 2.2 else 0.8
        x = -w / 2
        while x < w / 2 - 0.05:
            sw = min(w / 2 - x, rnd.uniform(0.25, 0.45))
            shade = rgb(rnd.choice([0x78736a, 0x6a655d, 0x847e74, 0x5f5a53]), 0.08, rnd)
            if burned and rnd.random() < 0.25:
                shade = rgb(0x3a3632, 0.1, rnd)   # soot
            k.box("stone", (sw - 0.02, d - rnd.uniform(0, 0.05), h - 0.02), mat_tr((cx + x + sw / 2, cy + rnd.uniform(-0.02, 0.02), z + h / 2)), shade, bevel=0.025)
            x += sw
        z += h
        row += 1
    # a cap stone and the flue
    k.box("stone", (1.0, 0.9, 0.12), mat_tr((cx, cy, z + 0.06)), rgb(0x5a554e, 0.05, rnd), bevel=0.02)
    k.box("soot", (0.45, 0.4, 0.02), mat_tr((cx, cy, z + 0.13)), rgb(0x0e0c0b))

    objs = k.build(sc, smooth=("log",))
    if not burned:
        objs += [hinge] + door_parts
    return export(sc, f"{name}.glb", objs)


out = [build(False), build(True)]
print("wrote", *out)
