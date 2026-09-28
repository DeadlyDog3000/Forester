"""Hamburg seen from the road north-east: hamburg_skyline.glb.

A vista, not a place: the city as a silhouette across the fields, built at a
reduced scale (about 280 m wide, spires up to 48 m) so that, stood a couple of
hundred metres behind the start of the road, it reads as the whole city a few
kilometres off. The 1683 city: a ring of earthen bastions with windmills on
them, brick walls and gates, a sea of steep gabled roofs, and the five great
spires — St. Petri, St. Nikolai, St. Katharinen, St. Jacobi, and old St.
Michaelis — with ships' masts in the harbour at the western end.

Its front (-Y) faces the road. Colours are already hazed by distance.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import common
importlib.reload(common)
from common import Kit, rgb, mat_tr, fresh_scene, export
from mathutils import Vector

PI = math.pi
WIDTH = 280.0


def build():
    sc = fresh_scene("Reckoning Hamburg skyline")
    k = Kit("hamburg_skyline", seed=1683)
    rnd = k.rnd
    haze = lambda h, j=0.06: rgb(h, j, rnd)

    # ---- the bastioned wall: a zig-zag earthwork along the front ----
    n = 9
    for i in range(n):
        x0 = -WIDTH / 2 + WIDTH * i / n
        x1 = x0 + WIDTH / n
        xm = (x0 + x1) / 2
        # curtain wall
        k.box("earth", (WIDTH / n, 6, 5), mat_tr((xm, 0, 2.5)), haze(0x5f6a58))
        k.box("brick", (WIDTH / n, 1.2, 2.2), mat_tr((xm, -2.8, 5.6)), haze(0x7a6a62))
        # a bastion jutting out: a pointed wedge
        if i < n - 1:
            bx = x1
            for sd in (-1, 1):
                k.box("earth", (16, 9, 6), mat_tr((bx + sd * 5.5, -8, 3), (0, 0, sd * 0.75)), haze(0x5a6654))
            # a windmill on every other bastion
            if i % 2 == 0:
                k.cylinder("wood", 2.0, 1.4, 9, mat_tr((bx, -8, 10.5)), haze(0x6e645c), segs=8)
                k.cylinder("roof", 2.3, 0.2, 3.0, mat_tr((bx, -8, 16.5)), haze(0x4e4a48), segs=8)
                a = rnd.uniform(0, PI / 2)
                for s in range(4):
                    ang = a + s * PI / 2
                    k.box("sail", (0.8, 0.3, 8.5), mat_tr((bx + math.cos(ang) * 4.3, -10.3, 15.5 + math.sin(ang) * 4.3), (0, PI / 2 - ang, 0)), haze(0x9a948a))
    # the moat in front, a strip of pale water
    k.box("water", (WIDTH + 30, 7, 0.3), mat_tr((0, -15, 0.1)), haze(0x8a9aa4, 0.02))
    # a gate with its tower where the road leaves the city
    k.box("brick", (12, 10, 14), mat_tr((0, -2, 7)), haze(0x7a6a62))
    k.cylinder("roof", 7.5, 0.4, 8, mat_tr((0, -2, 18), (0, 0, PI / 4)), haze(0x4c5a58), segs=4)

    # ---- the town: rows of tall gabled houses rising behind the wall ----
    for row in range(7):
        y = 8 + row * 11
        x = -WIDTH / 2 + 4
        while x < WIDTH / 2 - 4:
            w = rnd.uniform(5, 9)
            h = rnd.uniform(9, 15) + row * 0.6
            wall = haze(rnd.choice([0x8a7a70, 0x7e7068, 0x94847a, 0x86786c]))
            roof = haze(rnd.choice([0x6a5048, 0x5e4a44, 0x70564c, 0x56504e]))
            k.box("house", (w - 0.4, 9, h), mat_tr((x + w / 2, y, h / 2)), wall)
            # steep gable roof, ridge along the street, or a stepped gable facing it
            rh = w * rnd.uniform(0.7, 1.0)
            if rnd.random() < 0.5:
                k.cylinder("roof", w * 0.62, 0.05, rh, mat_tr((x + w / 2, y, h + rh / 2), (0, 0, PI / 4), (1, 1.55, 1)), roof, segs=4)
            else:
                for st in range(3):
                    sw = (w - 0.4) * (1 - st * 0.3)
                    k.box("house", (sw, 9, rh / 3), mat_tr((x + w / 2, y, h + rh / 3 * (st + 0.5))), wall)
            x += w

    # ---- the five spires: tall brick towers with green copper helms ----
    spires = [(-78, 30, 44, "Petri"), (-30, 48, 48, "Nikolai"), (18, 36, 41, "Katharinen"), (62, 22, 45, "Jacobi"), (108, 56, 34, "Michaelis")]
    for x, y, h, name in spires:
        tw = 7.5
        # the nave behind the tower
        k.box("brick", (12, 34, 20), mat_tr((x, y + 20, 10)), haze(0x7e6258))
        k.cylinder("copper", 9.5, 0.3, 9, mat_tr((x, y + 20, 24.5), (0, 0, PI / 4), (1, 2.6, 1)), haze(0x5d7a6e))
        # the tower
        k.box("brick", (tw, tw, h * 0.52), mat_tr((x, y, h * 0.26)), haze(0x806458))
        k.box("brick", (tw + 0.6, tw + 0.6, 1.0), mat_tr((x, y, h * 0.52)), haze(0x6e5850))
        # the helm: an octagonal spire, very tall and thin, copper gone green
        k.cylinder("copper", tw * 0.62, 0.15, h * 0.5, mat_tr((x, y, h * 0.52 + h * 0.25), (0, 0, PI / 8)), haze(0x628a7a), segs=8)
        # a lantern stage part way up on some
        if name in ("Nikolai", "Katharinen"):
            k.cylinder("copper", tw * 0.33, tw * 0.33, 3, mat_tr((x, y, h * 0.52 + h * 0.2)), haze(0x587e70), segs=8)
        k.cylinder("wood", 0.12, 0.12, 2.5, mat_tr((x, y, h + 1.2)), haze(0x3a3a38))

    # ---- the harbour at the west end: masts and bare yards ----
    for i in range(10):
        x = -WIDTH / 2 - 10 + rnd.uniform(-12, 22)
        y = rnd.uniform(10, 60)
        h = rnd.uniform(16, 26)
        k.cylinder("wood", 0.25, 0.12, h, mat_tr((x, y, h / 2)), haze(0x4a4644), segs=5)
        for yf in (0.5, 0.8):
            k.box("wood", (6 * (1.1 - yf), 0.2, 0.2), mat_tr((x, y, h * yf)), haze(0x4a4644))

    objs = k.build(sc)
    return export(sc, "hamburg_skyline.glb", objs)


print("wrote", build())
