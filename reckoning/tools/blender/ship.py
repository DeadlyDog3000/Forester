"""A Hanseatic fluyt moored in the harbour: ship.glb. 20 m long, bow to -Y.

The cargo ship of the 1600s North Sea: a round-bellied hull that narrows
towards the deck (tumblehome, to pay less in Sound dues on deck width), a high
narrow stern, three masts with their sails furled on the yards, a bowsprit,
shrouds down to the channels. The waterline is at z = 0.2; the game sets the
ship's origin just under the water's surface.
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
import bmesh

L = 20.0
BEAM = 5.4
PI = math.pi
WATER = 0.2
KEEL = -1.6


def half_beam(u):
    """u from 0 (bow) to 1 (stern): the hull's half width at its widest"""
    bow = math.sin(min(1, u / 0.35) * PI / 2) ** 0.8
    stern = math.sin(min(1, (1 - u) / 0.28) * PI / 2) ** 0.55
    return BEAM / 2 * bow * stern


def deck_z(u):
    """the sheer: the deck rises to the bow and much more to the stern"""
    return 2.0 + 0.9 * (1 - u / 0.3) ** 2 * (u < 0.3) + 2.2 * max(0, (u - 0.72) / 0.28) ** 1.6


def hull(k):
    rnd = k.rnd
    bm = k._bm("hull")
    layer = bm.loops.layers.float_color["Col"]
    N, M = 40, 14                      # stations along, points around each half-section
    rows = []
    for i in range(N + 1):
        u = i / N
        y = -L / 2 + u * L
        hb = max(0.02, half_beam(u))
        top = deck_z(u)
        keel = KEEL * (0.25 + 0.75 * math.sin(min(1, u / 0.12, (1 - u) / 0.1) * PI / 2)) + 0.3 * (1 - math.sin(min(1, u / 0.12, (1 - u) / 0.1) * PI / 2))
        pts = []
        for j in range(M + 1):
            t = j / M                   # 0 at the keel, 1 at the deck edge
            z = keel + (top - keel) * t
            # round belly out to full beam a little above the waterline, then tumble home
            if z < WATER + 0.4:
                f = (z - keel) / max(0.01, WATER + 0.4 - keel)
                w = hb * math.sin(f * PI / 2) ** 0.6
            else:
                f = (z - (WATER + 0.4)) / max(0.01, top - (WATER + 0.4))
                w = hb * (1 - 0.22 * f ** 1.4)
            pts.append((w, y, z))
        rows.append(pts)
    grid = []
    for pts in rows:
        grid.append([bm.verts.new((-x, y, z)) for (x, y, z) in reversed(pts)] + [bm.verts.new((x, y, z)) for (x, y, z) in pts[1:]])
    # each strake (row of planks) one colour, end to end
    strake = [rnd.choice([0x6a4a30, 0x5e422a, 0x714f33, 0x664630]) for _ in range(2 * M + 1)]
    def col(z, j):
        if z < WATER - 0.05:
            return rgb(0x2a241e, 0.03, rnd)          # tarred bottom
        for zb in (1.0, 1.8):
            if abs(z - zb) < 0.12:
                return rgb(0x1a1612, 0.02, rnd)      # the black wales
        return rgb(strake[j], 0.025, rnd)
    for i in range(N):
        a, b = grid[i], grid[i + 1]
        for j in range(len(a) - 1):
            f = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            zc = (a[j].co.z + b[j + 1].co.z) / 2
            c = col(zc, j)
            for l in f.loops:
                l[layer] = c
    # bow and stern closed
    for row, flip in ((grid[0], False), (grid[-1], True)):
        f = bm.faces.new(list(reversed(row)) if flip else row)
        for l in f.loops:
            l[layer] = rgb(0x5e422a, 0.05, rnd)
    # the deck, planked
    for i in range(N):
        u0, u1 = i / N, (i + 1) / N
        y0, y1 = -L / 2 + u0 * L, -L / 2 + u1 * L
        w0 = half_beam(u0) * 0.78; w1 = half_beam(u1) * 0.78
        z0, z1 = deck_z(u0) - 0.05, deck_z(u1) - 0.05
        f = bm.faces.new((bm.verts.new((-w0, y0, z0)), bm.verts.new((-w1, y1, z1)), bm.verts.new((w1, y1, z1)), bm.verts.new((w0, y0, z0))))
        c = rgb(0x9a7c56, 0.08, rnd)
        for l in f.loops:
            l[layer] = c
    # a rail along the deck edge
    for i in range(N):
        u = (i + 0.5) / N
        y = -L / 2 + u * L
        for sd in (-1, 1):
            slope = math.atan2(deck_z(min(1, u + 0.5 / N)) - deck_z(max(0, u - 0.5 / N)), L / N)
            k.box("wood", (0.12, L / N + 0.06, 0.5), mat_tr((sd * half_beam(u) * 0.78, y, deck_z(u) + 0.2), (slope, 0, 0)), rgb(0x4a3422, 0.02, rnd))


def build():
    sc = fresh_scene("Reckoning ship")
    k = Kit("ship", seed=9)
    rnd = k.rnd
    hull(k)
    wood = lambda h=0x6a4a30: rgb(h, 0.08, rnd)
    sail = lambda: rgb(0xd8ceb4, 0.06, rnd)

    # the stern: a narrow transom with windows and a lantern
    sy = L / 2 - 0.35
    k.box("wood", (2.4, 0.25, 2.0), mat_tr((0, sy, deck_z(1) - 1.0)), wood(0x5a3e28))
    for x in (-0.6, 0, 0.6):
        k.box("glass", (0.34, 0.05, 0.4), mat_tr((x, sy + 0.14, deck_z(1) - 0.8)), rgb(0x1b2330))
    k.cylinder("wood", 0.16, 0.22, 0.5, mat_tr((0, sy + 0.2, deck_z(1) + 0.6)), wood(0x2a2420), segs=8)
    k.cylinder("glass", 0.14, 0.14, 0.3, mat_tr((0, sy + 0.2, deck_z(1) + 0.95)), rgb(0xe8b060), segs=8)
    # rudder
    k.box("wood", (0.2, 0.9, 3.4), mat_tr((0, L / 2 + 0.05, -0.2), (-0.1, 0, 0)), wood(0x3a2a1e))
    # a small cabin house aft
    k.box("wood", (2.6, 3.0, 1.3), mat_tr((0, L / 2 - 3.2, deck_z(0.8) + 0.6)), wood(0x6e5034))
    k.box("wood", (2.8, 3.2, 0.12), mat_tr((0, L / 2 - 3.2, deck_z(0.8) + 1.3)), wood(0x4a3422))

    # masts: fore, main, mizzen — [y, height]
    masts = [(-5.6, 17.0), (0.6, 20.0), (6.4, 12.5)]
    for y, h in masts:
        u = (y + L / 2) / L
        z0 = deck_z(u) - 0.1
        k.cylinder("wood", 0.22, 0.12, h, mat_tr((0, y, z0 + h / 2)), wood(0x7a5a3a), segs=10)
        # the top: a platform a little over half way up
        k.cylinder("wood", 0.7, 0.7, 0.12, mat_tr((0, y, z0 + h * 0.58)), wood(0x4a3422), segs=10)
        for yf, span in ((0.42, 0.95), (0.8, 0.62)):
            zz = z0 + h * yf
            yard = BEAM * span * 1.25
            k.cylinder("wood", 0.1, 0.1, yard, mat_tr((0, y, zz), (0, PI / 2, 0)), wood(0x6a4a30), segs=8)
            # the sail furled along the yard: one lumpy roll, bound at intervals
            k.cylinder("sail", 0.2, 0.2, yard * 0.86, mat_tr((0, y, zz - 0.2), (0, PI / 2, 0)), sail(), segs=10, wobble=0.35)
            for s in range(6):
                x = -yard * 0.36 + yard * 0.72 * s / 5
                k.cylinder("rope", 0.215, 0.215, 0.05, mat_tr((x, y, zz - 0.2), (0, PI / 2, 0)), rgb(0x3a3024), segs=10)
        # shrouds: lines from below the top to the channels at the side
        for sd in (-1, 1):
            base_y = y
            for dy in (-0.5, 0, 0.5):
                a = Vector((sd * half_beam(u) * 0.95, base_y + dy, deck_z(u) + 0.15))
                b = Vector((sd * 0.25, y, z0 + h * 0.56))
                v = b - a
                k.cylinder("rope", 0.02, 0.02, v.length, mat_tr((a + b) / 2, v.to_track_quat("Z", "Y").to_euler()), rgb(0x2a2420), segs=4)
            # and the stays fore and aft
        if y != masts[0][0]:
            prev = masts[[m[0] for m in masts].index(y) - 1]
            pu = (prev[0] + L / 2) / L
            a = Vector((0, y, z0 + h * 0.95)); b = Vector((0, prev[0], deck_z(pu) + 0.3))
            v = b - a
            k.cylinder("rope", 0.025, 0.025, v.length, mat_tr((a + b) / 2, v.to_track_quat("Z", "Y").to_euler()), rgb(0x2a2420), segs=4)

    # bowsprit, and the forestay to it
    bz = deck_z(0) + 0.1
    a = Vector((0, -L / 2 + 1.0, bz)); b = Vector((0, -L / 2 - 5.5, bz + 2.6))
    v = b - a
    k.cylinder("wood", 0.16, 0.08, v.length, mat_tr((a + b) / 2, v.to_track_quat("Z", "Y").to_euler()), wood(0x7a5a3a), segs=8)
    fy, fh = masts[0]
    top = Vector((0, fy, deck_z((fy + L / 2) / L) + fh * 0.9))
    v = b - top
    k.cylinder("rope", 0.025, 0.025, v.length, mat_tr((b + top) / 2, v.to_track_quat("Z", "Y").to_euler()), rgb(0x2a2420), segs=4)
    # a flag at the main masthead, Hamburg red
    my, mh = masts[1]
    k.box("flag", (0.02, 1.4, 0.8), mat_tr((0, my + 0.75, deck_z((my + L / 2) / L) + mh + 0.2)), rgb(0xa8261e))
    # cargo on deck: barrels and a hatch
    k.box("wood", (2.2, 2.6, 0.3), mat_tr((0, -1.8, deck_z(0.41) + 0.12)), wood(0x5a3e28))
    for i in range(5):
        k.cylinder("wood", 0.3, 0.3, 0.8, mat_tr((rnd.uniform(-1.2, 1.2), rnd.uniform(2.2, 4.2), deck_z(0.65) + 0.4)), wood(0x7a5634), segs=10)

    objs = k.build(sc, smooth=("hull", "sail"))
    return export(sc, "ship.glb", objs)


print("wrote", build())
