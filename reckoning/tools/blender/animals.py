"""The game in the woods, and what you hunt it with: deer.glb, hare.glb, bow.glb, arrow.glb.

The animals are jointed rather than rigged: the body is one piece, and the
neck (or head) and each leg hang from an empty at their joint — neck, legFL,
legFR, legHL, legHR — so the game can swing legs in a walk or a bound, dip the
head to graze, and lay the whole beast on its side when it falls.

Front is -Y, origin at the ground under the body, 1 unit = 1 m.

    blender -b --factory-startup -P reckoning/tools/blender/animals.py
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import common
importlib.reload(common)
from common import Kit, rgb, mat_tr, fresh_scene, export

PI = math.pi


def joint(sc, name, loc, parent, build, seed):
    """An empty at a joint, and the part built round it (in the joint's own coordinates)."""
    e = bpy.data.objects.new(name, None)
    sc.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    k = Kit(f"{name}", seed=seed)
    build(k)
    objs = k.build(sc, smooth=("fur", "horn"))
    for o in objs:
        o.parent = e
    return [e] + objs


def ellipsoid(k, key, centre, radii, color, rot=(0, 0, 0)):
    k.rock(key, 1.0, mat_tr(centre, rot, radii), color, lumps=0.0, subdiv=3)


def deer():
    sc = fresh_scene("Reckoning deer")
    root = bpy.data.objects.new("deer", None)
    sc.collection.objects.link(root)
    coat, belly, rump, dark = 0x7a5538, 0xc0a486, 0xeae2d2, 0x1c1714
    out = [root]
    k = Kit("deer", seed=31)
    rnd = k.rnd
    ellipsoid(k, "fur", (0, 0.02, 0.8), (0.16, 0.47, 0.19), rgb(coat, 0.02, rnd))
    ellipsoid(k, "fur", (0, 0.02, 0.7), (0.13, 0.36, 0.1), rgb(belly, 0.02, rnd))
    ellipsoid(k, "fur", (0, -0.3, 0.83), (0.15, 0.2, 0.19), rgb(coat, 0.02, rnd))        # the chest
    ellipsoid(k, "fur", (0, 0.33, 0.85), (0.16, 0.19, 0.19), rgb(coat, 0.02, rnd))       # the haunches
    ellipsoid(k, "fur", (0, 0.49, 0.84), (0.11, 0.06, 0.12), rgb(rump, 0.02, rnd))       # the white rump
    objs = k.build(sc, smooth=("fur",))
    for o in objs:
        o.parent = root
    out += objs

    def neck(k):
        a = 0.85
        d = (0, -math.sin(a), math.cos(a))
        k.cylinder("fur", 0.065, 0.09, 0.4, mat_tr((0, d[1] * 0.18, d[2] * 0.18), (a, 0, 0)), rgb(coat, 0.02, k.rnd), segs=12)
        hx, hz = d[1] * 0.38, d[2] * 0.38
        ellipsoid(k, "fur", (0, hx - 0.07, hz + 0.02), (0.07, 0.13, 0.075), rgb(coat, 0.02, k.rnd), rot=(0.45, 0, 0))
        ellipsoid(k, "fur", (0, hx - 0.18, hz - 0.03), (0.04, 0.07, 0.045), rgb(0x6a4228), rot=(0.45, 0, 0))   # the muzzle
        ellipsoid(k, "horn", (0, hx - 0.24, hz - 0.05), (0.028, 0.022, 0.022), rgb(dark))                   # the nose
        for s in (-1, 1):
            ellipsoid(k, "horn", (s * 0.055, hx - 0.1, hz + 0.05), (0.015, 0.015, 0.015), rgb(dark))           # an eye
            ellipsoid(k, "fur", (s * 0.07, hx + 0.02, hz + 0.12), (0.04, 0.014, 0.085), rgb(coat, 0.02, k.rnd), rot=(0.1, s * 0.6, 0))  # an ear
    out += joint(sc, "neck", (0, -0.34, 0.92), root, neck, 32)

    def leg(front):
        def b(k):
            c = rgb(coat, 0.03, k.rnd)
            if not front:
                ellipsoid(k, "fur", (0, 0.02, -0.06), (0.07, 0.12, 0.14), c)                   # the thigh
            k.cylinder("fur", 0.038, 0.03, 0.4, mat_tr((0, 0, -0.2)), c, segs=8)
            k.cylinder("fur", 0.02, 0.017, 0.34, mat_tr((0, 0, -0.55)), rgb(0x7a4a2a, 0.02, k.rnd), segs=6)
            k.box("horn", (0.035, 0.05, 0.04), mat_tr((0, -0.01, -0.73)), rgb(0x2a2420))       # the hoof
        return b
    for name, x, y, front in (("legFL", 0.11, -0.3, True), ("legFR", -0.11, -0.3, True), ("legHL", 0.11, 0.36, False), ("legHR", -0.11, 0.36, False)):
        out += joint(sc, name, (x * 0.85, y, 0.75), root, leg(front), 33)
    ellipsoid(k2 := Kit("tail", seed=34), "fur", (0, 0.56, 0.9), (0.03, 0.04, 0.05), rgb(rump))
    for o in k2.build(sc):
        o.parent = root; out.append(o)
    return export(sc, "deer.glb", out)


def hare():
    sc = fresh_scene("Reckoning hare")
    root = bpy.data.objects.new("hare", None)
    sc.collection.objects.link(root)
    coat, belly, dark = 0x8a7456, 0xd8ccb6, 0x1c1714
    out = [root]
    k = Kit("hare", seed=41)
    ellipsoid(k, "fur", (0, 0.02, 0.2), (0.11, 0.2, 0.12), rgb(coat, 0.03, k.rnd))
    ellipsoid(k, "fur", (0, 0.1, 0.19), (0.12, 0.12, 0.13), rgb(coat, 0.03, k.rnd))
    ellipsoid(k, "fur", (0, 0.0, 0.13), (0.08, 0.15, 0.06), rgb(belly, 0.03, k.rnd))
    ellipsoid(k, "fur", (0, 0.23, 0.25), (0.045, 0.04, 0.045), rgb(0xf0ece4))                 # the scut
    for o in k.build(sc, smooth=("fur",)):
        o.parent = root; out.append(o)

    def head(k):
        ellipsoid(k, "fur", (0, -0.06, 0.03), (0.065, 0.1, 0.07), rgb(coat, 0.03, k.rnd), rot=(0.2, 0, 0))
        for s in (-1, 1):
            ellipsoid(k, "horn", (s * 0.05, -0.08, 0.06), (0.014, 0.014, 0.014), rgb(dark))
            # the ear, leaning back; its black tip sits on the end of it
            a = -0.4
            ellipsoid(k, "fur", (s * 0.03, 0.02, 0.16), (0.022, 0.012, 0.11), rgb(coat, 0.03, k.rnd), rot=(a, 0, 0))
            tip = (s * 0.03, 0.02 - math.sin(a) * 0.09, 0.16 + math.cos(a) * 0.09)
            ellipsoid(k, "horn", tip, (0.02, 0.013, 0.03), rgb(dark), rot=(a, 0, 0))
        ellipsoid(k, "horn", (0, -0.155, 0.02), (0.014, 0.01, 0.012), rgb(0x3a2a24))
    out += joint(sc, "neck", (0, -0.17, 0.27), root, head, 42)

    def fore(k):
        k.cylinder("fur", 0.018, 0.015, 0.16, mat_tr((0, 0, -0.08)), rgb(coat, 0.03, k.rnd), segs=6)
        k.box("fur", (0.03, 0.05, 0.02), mat_tr((0, -0.015, -0.16)), rgb(belly))

    def hind(k):
        ellipsoid(k, "fur", (0, 0.02, -0.05), (0.05, 0.08, 0.11), rgb(coat, 0.03, k.rnd))          # the thigh, down to the foot
        ellipsoid(k, "fur", (0, -0.04, -0.14), (0.028, 0.1, 0.02), rgb(coat, 0.03, k.rnd))         # the long hind foot
    for name, x, y, f in (("legFL", 0.045, -0.12, fore), ("legFR", -0.045, -0.12, fore), ("legHL", 0.075, 0.12, hind), ("legHR", -0.075, 0.12, hind)):
        out += joint(sc, name, (x, y, 0.16), root, f, 43)
    return export(sc, "hare.glb", out)


def boar():
    """A wild boar: a heavy dark body high at the shoulder, a long wedge of a head carried low, tusks, short legs."""
    sc = fresh_scene("Reckoning boar")
    root = bpy.data.objects.new("boar", None)
    sc.collection.objects.link(root)
    coat, bristle, belly, snout, dark, tusk = 0x3e3128, 0x2a211c, 0x52443a, 0x5a4440, 0x15110e, 0xe8dcc0
    out = [root]
    k = Kit("boar", seed=61)
    ellipsoid(k, "fur", (0, 0.04, 0.55), (0.22, 0.5, 0.25), rgb(coat, 0.03, k.rnd))
    ellipsoid(k, "fur", (0, -0.24, 0.6), (0.24, 0.26, 0.28), rgb(coat, 0.03, k.rnd))          # the heavy shoulders
    ellipsoid(k, "fur", (0, 0.36, 0.53), (0.2, 0.2, 0.22), rgb(coat, 0.03, k.rnd))            # the haunches
    ellipsoid(k, "fur", (0, 0.02, 0.4), (0.17, 0.4, 0.1), rgb(belly, 0.03, k.rnd))
    for i in range(7):                                                                       # the bristled ridge down the back
        y = -0.36 + i * 0.12
        ellipsoid(k, "fur", (0, y, 0.82 - i * 0.025), (0.05, 0.07, 0.07), rgb(bristle, 0.03, k.rnd))
    for o in k.build(sc, smooth=("fur",)):
        o.parent = root; out.append(o)

    def head(k):
        ellipsoid(k, "fur", (0, -0.14, -0.04), (0.15, 0.2, 0.16), rgb(coat, 0.03, k.rnd), rot=(0.35, 0, 0))
        ellipsoid(k, "fur", (0, -0.32, -0.14), (0.09, 0.15, 0.09), rgb(coat, 0.03, k.rnd), rot=(0.45, 0, 0))
        k.cylinder("horn", 0.06, 0.06, 0.04, mat_tr((0, -0.45, -0.2), (PI / 2 - 0.4, 0, 0)), rgb(snout), segs=10)   # the disc of the snout
        for s in (-1, 1):
            ellipsoid(k, "horn", (s * 0.09, -0.2, 0.04), (0.016, 0.016, 0.016), rgb(dark))                          # an eye
            ellipsoid(k, "fur", (s * 0.1, -0.04, 0.12), (0.05, 0.02, 0.08), rgb(bristle, 0.03, k.rnd), rot=(-0.3, s * 0.5, 0))   # an ear
            k.cylinder("horn", 0.014, 0.004, 0.11, mat_tr((s * 0.07, -0.38, -0.16), (-0.9, 0, s * 0.5)), rgb(tusk), segs=6)       # a tusk, curling up
    out += joint(sc, "neck", (0, -0.42, 0.62), root, head, 62)

    def leg(front):
        def b(k):
            c = rgb(coat, 0.03, k.rnd)
            ellipsoid(k, "fur", (0, 0.0, -0.05), (0.08, 0.1, 0.13), c)
            k.cylinder("fur", 0.04, 0.032, 0.26, mat_tr((0, 0, -0.2)), c, segs=8)
            k.box("horn", (0.05, 0.06, 0.05), mat_tr((0, -0.01, -0.36)), rgb(dark))     # the cloven hoof
        return b
    for name, x, y, front in (("legFL", 0.13, -0.3, True), ("legFR", -0.13, -0.3, True), ("legHL", 0.12, 0.36, False), ("legHR", -0.12, 0.36, False)):
        out += joint(sc, name, (x, y, 0.38), root, leg(front), 63)
    k2 = Kit("tail", seed=64)
    k2.cylinder("fur", 0.012, 0.006, 0.16, mat_tr((0, 0.58, 0.5), (0.5, 0, 0)), rgb(bristle), segs=5)
    for o in k2.build(sc):
        o.parent = root; out.append(o)
    return export(sc, "boar.glb", out)


def bow():
    """A plain self bow of yew, strung: the grip at the origin, the tips drawn back toward the archer (+Y).
    The string is the game's to draw, from tip to tip through the nock."""
    sc = fresh_scene("Reckoning bow")
    k = Kit("bow", seed=51)
    n = 14
    L, back = 0.66, 0.15
    for i in range(n):
        t0, t1 = -1 + 2 * i / n, -1 + 2 * (i + 1) / n
        z0, z1 = t0 * L, t1 * L
        y0, y1 = back * t0 * t0, back * t1 * t1
        mid = ((y0 + y1) / 2, (z0 + z1) / 2)
        ln = math.hypot(y1 - y0, z1 - z0)
        ang = math.atan2(y1 - y0, z1 - z0)
        th = 0.016 + 0.01 * (1 - abs((t0 + t1) / 2))
        k.box("wood", (th * 1.3, th, ln + 0.004), mat_tr((0, mid[0], mid[1]), (-ang, 0, 0)), rgb(0x8a5a30 if abs(t0) > 0.15 else 0x7a4e2a, 0.04, k.rnd))
    k.cylinder("cloth", 0.024, 0.024, 0.14, mat_tr((0, 0.002, 0)), rgb(0x3a2a1c), segs=8)            # the leather grip
    for s in (-1, 1):
        k.box("horn", (0.022, 0.03, 0.03), mat_tr((0, back, s * L)), rgb(0xd8ccb0))                   # horn nocks at the tips
    return export(sc, "bow.glb", k.build(sc))


def arrow():
    sc = fresh_scene("Reckoning arrow")
    k = Kit("arrow", seed=52)
    k.cylinder("wood", 0.0045, 0.0045, 0.74, mat_tr((0, 0, 0), (PI / 2, 0, 0)), rgb(0xb89a6a), segs=6)
    k.cylinder("iron", 0.012, 0.0, 0.06, mat_tr((0, -0.4, 0), (PI / 2, 0, 0)), rgb(0x4a4a4e), segs=4)   # the point, forward
    for a in range(3):
        rot = a * 2 * PI / 3
        k.box("cloth", (0.0015, 0.11, 0.022), mat_tr((math.cos(rot) * 0.012, 0.3, math.sin(rot) * 0.012), (0, rot + PI / 2, 0)), rgb(0xd0ccc4))
    return export(sc, "arrow.glb", k.build(sc))


only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
makers = {"deer": deer, "hare": hare, "boar": boar, "bow": bow, "arrow": arrow}
print("wrote", *[f() for n, f in makers.items() if not only or n in only])
