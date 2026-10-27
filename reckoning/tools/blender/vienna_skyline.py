"""Vienna seen from the Kahlenberg, 12 September 1683: vienna_skyline.glb.

A vista, not a place, as hamburg_skyline is: the city as a silhouette below the
hills, built at a reduced scale (about 300 m wide, St. Stephen's tower 78 m) so
that, hung behind the field, it reads as the whole city some kilometres off.
The besieged city: its ring of stone-faced bastions on their pale glacis, the
houses packed inside (whitewash and ochre, hipped roofs of red-brown tile), the
Hofburg, the churches' towers, and over them all St. Stephen's — the long nave
under its steep roof, the great Gothic south tower and its needle, the north
tower left a stump with a small cap. Before the walls, the Turks' siege: a sea
of their tents in the plain, and the Danube's arm along the left.

Its front (-Y) faces the field. Colours are already hazed by distance.
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
WIDTH = 300.0


def build():
    sc = fresh_scene("Reckoning Vienna skyline")
    k = Kit("vienna_skyline", seed=1683)
    rnd = k.rnd
    haze = lambda h, j=0.06: rgb(h, j, rnd)

    def hip(w, d, h, x, y, z0, color):
        """A hipped roof over a w x d block (its ridge along X), its foot at z0."""
        rx = max(0.0, w / 2 - d / 2)
        A, B, C, D = (x - w / 2, y - d / 2, z0), (x + w / 2, y - d / 2, z0), (x + w / 2, y + d / 2, z0), (x - w / 2, y + d / 2, z0)
        R1, R2 = (x - rx, y, z0 + h), (x + rx, y, z0 + h)
        k.poly("roof", [A, B, R2, R1], color); k.poly("roof", [C, D, R1, R2], color)
        k.poly("roof", [B, C, R2], color); k.poly("roof", [D, A, R1], color)

    # ---- the walls: stone-faced curtains between arrowhead bastions, on a pale glacis ----
    n = 8
    for i in range(n):
        x0 = -WIDTH / 2 + WIDTH * i / n
        x1 = x0 + WIDTH / n
        xm = (x0 + x1) / 2
        k.box("wall", (WIDTH / n, 6, 9), mat_tr((xm, 0, 4.5)), haze(0x9a958a))
        k.box("wall", (WIDTH / n, 1.0, 1.2), mat_tr((xm, -2.6, 9.4)), haze(0x8a857c))
        if i < n - 1:
            bx = x1
            for sd in (-1, 1):
                k.box("wall", (17, 9, 9), mat_tr((bx + sd * 5.8, -8, 4.5), (0, 0, sd * 0.72)), haze(0x948f84))
    # the glacis sloping off in front, open ground kept clear for the guns
    k.box("glacis", (WIDTH + 40, 34, 1.2), mat_tr((0, -26, 0.2)), haze(0x8c9a76))
    # the Danube's arm along the left (the Leopoldstadt side), a pale strip of water
    k.box("water", (60, 160, 0.3), mat_tr((-WIDTH / 2 - 36, 30, 0.1), (0, 0, 0.25)), haze(0x9aa8b0, 0.02))

    # ---- the city: rows of houses behind the wall, hipped tile roofs ----
    for row in range(8):
        y = 9 + row * 12
        x = -WIDTH / 2 + 6
        while x < WIDTH / 2 - 6:
            w = rnd.uniform(9, 16)
            h = rnd.uniform(11, 16) + row * 0.4
            wall = haze(rnd.choice([0xb8b0a0, 0xc4b896, 0xaca596, 0xbcac8a]))
            roof = haze(rnd.choice([0x8a5a48, 0x7c5446, 0x946250, 0x6e5048]))
            k.box("house", (w - 0.5, 10, h), mat_tr((x + w / 2, y, h / 2)), wall)
            rh = rnd.uniform(4, 6)
            hip(w - 0.3, 10.4, rh, x + w / 2, y, h, roof)
            x += w
    # the Hofburg, the emperor's palace: a long, plain block at the south-west corner
    k.box("palace", (64, 26, 22), mat_tr((-92, 22, 11)), haze(0xc0b8a6))
    hip(65, 27, 8, -92, 22, 22, haze(0x6a5a52))

    # ---- the churches' towers: lesser spires and caps over the roofs ----
    towers = [(-120, 46, 32, "spire"), (-60, 34, 30, "spire"), (-18, 62, 28, "cap"), (40, 30, 30, "spire"), (54, 30, 30, "spire"), (96, 52, 26, "cap"), (128, 30, 27, "spire")]
    for x, y, h, kind in towers:
        k.box("church", (26, 14, 18), mat_tr((x + 9, y + 10, 9)), haze(0xb2aa98))
        hip(26, 14.4, 9, x + 9, y + 10, 18, haze(0x6c5a52))
        k.box("church", (6, 6, h * 0.62), mat_tr((x, y, h * 0.31)), haze(0xb6ae9c))
        if kind == "spire":
            k.cylinder("roof", 4.2, 0.1, h * 0.38, mat_tr((x, y, h * 0.62 + h * 0.19), (0, 0, PI / 8)), haze(0x5a5856), segs=8)
        else:
            k.cylinder("roof", 3.6, 0.6, 4, mat_tr((x, y, h * 0.62 + 2)), haze(0x5c6a64), segs=8)
            k.cylinder("roof", 0.6, 0.1, 5, mat_tr((x, y, h * 0.62 + 6.5)), haze(0x5c6a64), segs=8)

    # ---- St. Stephen's: the long nave under its steep roof, and the great south tower ----
    sx, sy = 10, 40
    k.box("stone", (64, 18, 22), mat_tr((sx, sy, 11)), haze(0xa49c8e))
    # the roof, very steep and high: its glazed tiles in their zig-zag, dark at this distance
    hip(64.6, 18.6, 22, sx, sy, 22, haze(0x5a5048))
    # the choir at the east end, a little lower, its apse
    k.cylinder("stone", 9, 9, 19, mat_tr((sx + 33, sy, 9.5)), haze(0xa0988a), segs=10)
    k.cylinder("roof", 9.5, 0.4, 10, mat_tr((sx + 33, sy, 24)), haze(0x5a5048), segs=10)
    # the south tower, on the city side of the nave: square stages, each narrower, then the long open needle
    tx, ty = sx + 6, sy - 13
    stages = [(13, 26), (11, 14), (9, 10)]
    z = 0
    for wd, hgt in stages:
        k.box("stone", (wd, wd, hgt), mat_tr((tx, ty, z + hgt / 2)), haze(0xa49c8c))
        # the pinnacles at each stage's corners
        for cx in (-1, 1):
            for cy in (-1, 1):
                k.cylinder("stone", 0.7, 0.05, 5, mat_tr((tx + cx * wd / 2, ty + cy * wd / 2, z + hgt + 2.5)), haze(0x9a9284), segs=4)
        z += hgt
    k.cylinder("stone", 5.6, 0.2, 30, mat_tr((tx, ty, z + 15), (0, 0, PI / 8)), haze(0x9c9486), segs=8)
    k.cylinder("wood", 0.15, 0.15, 3, mat_tr((tx, ty, z + 31)), haze(0x4a4644))
    # the north tower: built only to the height of the nave, and capped
    k.box("stone", (11, 11, 26), mat_tr((sx + 6, sy + 13, 13)), haze(0xa49c8c))
    k.cylinder("roof", 5.2, 1.4, 5, mat_tr((sx + 6, sy + 13, 28.5)), haze(0x5c6a64), segs=8)
    k.cylinder("roof", 1.2, 0.1, 4, mat_tr((sx + 6, sy + 13, 33)), haze(0x5c6a64), segs=8)
    # the west front's two little towers
    for sd in (-1, 1):
        k.box("stone", (5, 5, 30), mat_tr((sx - 34, sy + sd * 6, 15)), haze(0xa49c8e))
        k.cylinder("roof", 3.2, 0.1, 6, mat_tr((sx - 34, sy + sd * 6, 33)), haze(0x5a5048), segs=8)

    # ---- the siege: the Turks' tents spread over the plain before the walls ----
    for i in range(170):
        x = rnd.uniform(-WIDTH / 2 - 20, WIDTH / 2 + 30)
        y = rnd.uniform(-130, -46)
        r = rnd.uniform(1.8, 3.4)
        col = haze(rnd.choice([0xd8d2c2, 0xd0c8b4, 0xd8d2c2, 0xa85a48, 0x6e8a62]))
        k.cylinder("tent", r, r, 1.6, mat_tr((x, y, 0.8)), col, segs=8)
        k.cylinder("tent", r * 1.08, 0.05, r * 0.9, mat_tr((x, y, 1.6 + r * 0.45)), col, segs=8)
    # the Grand Vizier's own: a great red pavilion with its gilded finial
    k.cylinder("tent", 9, 9, 4, mat_tr((30, -120, 2)), haze(0xa84a3a))
    k.cylinder("tent", 9.6, 0.1, 7, mat_tr((30, -120, 7.5)), haze(0x9a4234))
    # the trenches zig-zagging up to the walls, dark lines of turned earth
    for sd in (-1, 1):
        x = sd * 30
        for j in range(5):
            k.box("earth", (26, 2.2, 1.4), mat_tr((x + sd * (j % 2) * 14, -44 - j * 9, 0.7), (0, 0, sd * (0.5 if j % 2 else -0.5))), haze(0x6a6050))

    objs = k.build(sc)
    return export(sc, "vienna_skyline.glb", objs)


print("wrote", build())
