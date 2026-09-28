"""A Norway spruce, 10 m tall (the game rescales each one): spruce.glb.

A straight trunk tapering to a leader, and whorls of branches all the way up:
each branch droops from the trunk and lifts again at the tip, and carries a
hanging curtain of needled twigs. Long at the bottom, short at the top, so the
whole tree has the spruce's narrow church-spire outline.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import common
importlib.reload(common)
from common import Kit, rgb, mat_tr, fresh_scene, export
from mathutils import Vector, Matrix

H = 10.0
PI = math.pi


def build():
    sc = fresh_scene("Reckoning spruce")
    k = Kit("spruce", seed=5)
    rnd = k.rnd
    # trunk: a few tapering sections, rough
    z, r = 0.0, 0.26
    while z < H * 0.97:
        seg = 0.9
        r2 = max(0.02, 0.26 * (1 - (z + seg) / H) ** 1.1)
        k.cylinder("bark", r, r2, seg + 0.02, mat_tr((0, 0, z + seg / 2)), rgb(0x4e3a2a, 0.12, rnd), segs=9, wobble=0.08)
        z += seg; r = r2
    # root flare
    for i in range(5):
        a = i / 5 * 2 * PI + rnd.uniform(-0.2, 0.2)
        k.cylinder("bark", 0.12, 0.03, 0.8, mat_tr((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.08), (0, PI / 2 - 0.25, a), (1, 1, 1)), rgb(0x4a3626, 0.1, rnd), segs=6)

    # whorls of branches from 1.4 m to the top
    z = 1.4
    while z < H - 0.5:
        t = (z - 1.4) / (H - 1.9)                       # 0 at the bottom, 1 at the top
        reach = 2.9 * (1 - t) ** 0.95 + 0.35           # branch length
        n = 5 + int(rnd.random() * 3)
        a0 = rnd.uniform(0, 2 * PI)
        for i in range(n):
            a = a0 + i / n * 2 * PI + rnd.uniform(-0.25, 0.25)
            L = reach * rnd.uniform(0.8, 1.1)
            droop = 0.35 + 0.25 * (1 - t)               # low branches hang more
            d = Vector((math.cos(a), math.sin(a), 0))
            # the branch: two segments, down then up
            p0 = Vector((0, 0, z))
            p1 = p0 + d * (L * 0.6) + Vector((0, 0, -droop * L * 0.35))
            p2 = p1 + d * (L * 0.4) + Vector((0, 0, droop * L * 0.12))
            for pa, pb, rr in ((p0, p1, 0.05 * (1 - t) + 0.015), (p1, p2, 0.025 * (1 - t) + 0.01)):
                v = pb - pa
                rot = v.to_track_quat("Z", "Y").to_euler()
                k.cylinder("bark", rr, rr * 0.7, v.length, mat_tr((pa + pb) / 2, rot), rgb(0x4a3828, 0.1, rnd), segs=4)
            # needled foliage along the branch: flattened clumps, darker inside, lighter at the tip
            steps = max(2, int(L / 0.55))
            for s in range(1, steps + 1):
                f = s / steps
                p = (p0.lerp(p1, f / 0.6) if f < 0.6 else p1.lerp(p2, (f - 0.6) / 0.4))
                size = (0.68 * (1 - f * 0.4)) * (0.9 + 0.5 * (1 - t))
                shade = 0x223d24 if f < 0.4 else (0x2c4d2c if f < 0.8 else 0x3a5e34)
                k.rock("needles", size, mat_tr(p + Vector((0, 0, -size * 0.25)), (0, 0, a), (1.0, 0.8, 0.42)), rgb(shade, 0.12, rnd), lumps=0.5, subdiv=1)
                # the hanging curtain of twigs under a spruce branch
                if f > 0.3 and rnd.random() < 0.45:
                    k.rock("needles", size * 0.6, mat_tr(p + Vector((0, 0, -size * 0.7)), (0, 0, a), (0.55, 0.45, 0.9)), rgb(0x1f3822, 0.12, rnd), lumps=0.4, subdiv=0)
        z += 0.42 + rnd.uniform(-0.05, 0.08) + 0.1 * t
    # the leader at the very top
    k.cylinder("needles", 0.18, 0.0, 0.9, mat_tr((0, 0, H - 0.3)), rgb(0x3a5e34, 0.05, rnd), segs=6)
    objs = k.build(sc, smooth=("bark",))
    return export(sc, "spruce.glb", objs)


print("wrote", build())
