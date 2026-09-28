"""Buildings for the settlement: well.glb and woodshed.glb.

The well: a ring of fieldstone to hip height, two posts and a crossbeam with a
windlass, a bucket on its rope, a little shingled roof over it.
The woodshed: an open-fronted shed of rough poles, a lean-to roof of boards,
and split firewood stacked to the eaves inside.

Front is -Y, origin at the base, 1 unit = 1 m.
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


def well():
    sc = fresh_scene("Reckoning well")
    k = Kit("well", seed=21)
    rnd = k.rnd
    # the ring: courses of stones round a dark shaft
    R, courses = 0.85, 5
    for c in range(courses):
        n = 14
        off = (c % 2) * PI / n
        for i in range(n):
            a = off + i / n * 2 * PI
            k.box("stone", (0.36, 0.3, 0.2), mat_tr((math.cos(a) * R, math.sin(a) * R, 0.1 + c * 0.19), (0, 0, a + PI / 2)),
                  rgb(rnd.choice([0x7a756c, 0x6a655d, 0x857e74, 0x5f5a53]), 0.08, rnd), bevel=0.03)
    k.cylinder("soot", 0.7, 0.7, 0.05, mat_tr((0, 0, 0.9)), rgb(0x0a0908))
    # posts, crossbeam, windlass, crank
    for s in (-1, 1):
        k.box("wood", (0.14, 0.14, 2.1), mat_tr((s * 1.0, 0, 1.05)), rgb(0x5e422a, 0.1, rnd))
    k.cylinder("wood", 0.09, 0.09, 2.1, mat_tr((0, 0, 1.55), (0, PI / 2, 0)), rgb(0x6e5034, 0.08, rnd), segs=10)
    k.box("wood", (0.05, 0.05, 0.3), mat_tr((1.12, -0.12, 1.45)), rgb(0x4a3422))
    # rope and bucket
    k.cylinder("rope", 0.012, 0.012, 0.75, mat_tr((0, 0, 1.15)), rgb(0x8a7a5a), segs=6)
    k.cylinder("wood", 0.16, 0.13, 0.26, mat_tr((0, 0, 0.72)), rgb(0x6a4a2e, 0.06, rnd), segs=12)
    k.cylinder("iron", 0.165, 0.165, 0.03, mat_tr((0, 0, 0.8)), rgb(0x2a2724), segs=12)
    # a small roof of shingles
    for s in (-1, 1):
        for i in range(6):
            k.box("roof", (0.62, 2.5, 0.035), mat_tr((s * 0.3, 0, 2.1 - i * 0.0 + 0.12), (0, s * 0.62, 0)), rgb(0x4e3e30, 0.14, rnd))
    objs = k.build(sc, smooth=("wood",))
    return export(sc, "well.glb", objs)


def woodshed():
    sc = fresh_scene("Reckoning woodshed")
    k = Kit("woodshed", seed=22)
    rnd = k.rnd
    W, D, Hf, Hb = 3.6, 2.2, 2.3, 1.7          # width, depth, front and back height
    for x in (-W / 2, 0, W / 2):
        k.cylinder("wood", 0.08, 0.09, Hf, mat_tr((x, -D / 2, Hf / 2)), rgb(0x5e422a, 0.1, rnd), segs=8, wobble=0.1)
        k.cylinder("wood", 0.08, 0.09, Hb, mat_tr((x, D / 2, Hb / 2)), rgb(0x5e422a, 0.1, rnd), segs=8, wobble=0.1)
    # back and side walls of boards, gaps between
    for i in range(10):
        x = -W / 2 + W * (i + 0.5) / 10
        k.box("wood", (W / 10 - 0.03, 0.04, Hb - 0.1), mat_tr((x, D / 2 + 0.04, (Hb - 0.1) / 2)), rgb(0x6a4a2e, 0.14, rnd))
    for s in (-1, 1):
        for i in range(6):
            y = -D / 2 + D * (i + 0.5) / 6
            h = Hf + (Hb - Hf) * (i + 0.5) / 6 - 0.1
            k.box("wood", (0.04, D / 6 - 0.03, h), mat_tr((s * (W / 2 + 0.04), y, h / 2)), rgb(0x6a4a2e, 0.14, rnd))
    # the lean-to roof, overhanging at the front
    slope = math.atan2(Hf - Hb, D)
    run = math.hypot(D + 0.6, Hf - Hb)
    for i in range(12):
        x = -W / 2 - 0.2 + (W + 0.4) * (i + 0.5) / 12
        k.box("roof", ((W + 0.4) / 12 - 0.02, run, 0.05), mat_tr((x, -0.3 / 2, (Hf + Hb) / 2 + 0.05), (-slope, 0, 0)), rgb(0x4e3e30, 0.14, rnd))
    # firewood: split logs stacked end-on, pale faces towards you
    for row in range(8):
        for i in range(16):
            x = -W / 2 + 0.2 + i * 0.205
            z = 0.12 + row * 0.19
            if z > Hb - 0.2:
                continue
            k.cylinder("log", 0.095, 0.095, D - 0.5, mat_tr((x + (row % 2) * 0.1, 0.1, z), (PI / 2, 0, 0)),
                       rgb(rnd.choice([0x7a5634, 0x6e4c2e, 0x856040]), 0.08, rnd), segs=6, end_color=rgb(0xc9a878, 0.1, rnd))
    objs = k.build(sc, smooth=())
    return export(sc, "woodshed.glb", objs)


print("wrote", well(), woodshed())
