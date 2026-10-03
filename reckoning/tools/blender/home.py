"""Your own cabin, rebuilt as a house: home_2.glb.

    blender -b --factory-startup -P reckoning/tools/blender/home.py

The settlers' timber-and-plaster house (town.py, house_2), but one you can walk into: the same 5 x 6 m footprint and
door as the cabin it replaces, a real doorway in the front wall with the door hung on its hinge (an empty named "door"
at the hinge, as the cabin has), a plinth only round the walls so the floor inside is clear, and the chimney at the
back where the hearth is.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import common
importlib.reload(common)
from common import Kit, rgb, mat_tr, fresh_scene, export
import town
importlib.reload(town)
from town import plate, on_wall, wall_len, window, gable_end, gable_roof, chimney

import bpy

PI = math.pi
W, D = 5.0, 6.0
DOOR_W, DOOR_H = 1.3, 2.1
CHIMNEY = (-1.2, D / 2 + 0.3)


def build():
    sc = fresh_scene("Reckoning home 2")
    k = Kit("home2", seed=1683)
    rnd = k.rnd
    floors, FH = 2, 2.8
    H = floors * FH
    plaster = rgb(0xeae2cc, 0.03, rnd)
    oak = lambda: rgb(0x3a2a1e, 0.08, rnd)
    t = 0.3
    stone = rgb(0x7a746a, 0.06, rnd)
    # the plinth: a course of stone under each wall, and a step at the door
    k.box("stone", (W + 0.02, t + 0.04, 0.45), mat_tr((0, D / 2, 0.2)), stone)
    for sd in (-1, 1):
        k.box("stone", (t + 0.04, D + 0.02, 0.45), mat_tr((sd * W / 2, 0, 0.2)), stone)
        k.box("stone", ((W - DOOR_W) / 2 + 0.01, t + 0.04, 0.45), mat_tr((sd * (DOOR_W / 2 + (W - DOOR_W) / 4), -D / 2, 0.2)), stone)
    k.box("stone", (DOOR_W + 0.3, 0.5, 0.08), mat_tr((0, -D / 2 - 0.2, 0.0)), stone)
    # plaster walls; the front in three pieces round the doorway
    k.box("plaster", (W, t, H), mat_tr((0, D / 2, H / 2)), plaster)
    for sd in (-1, 1):
        k.box("plaster", (t, D, H), mat_tr((sd * W / 2, 0, H / 2)), plaster)
        side_w = (W - DOOR_W) / 2
        k.box("plaster", (side_w, t, H), mat_tr((sd * (DOOR_W / 2 + side_w / 2), -D / 2, H / 2)), plaster)
    k.box("plaster", (DOOR_W, t, H - DOOR_H), mat_tr((0, -D / 2, DOOR_H + (H - DOOR_H) / 2)), plaster)
    # the frame: posts, rails, braces, as the settlers' houses have — but none across the doorway
    for side in ("front", "back", "left", "right"):
        L = wall_len(W, D, side)
        bays = max(2, round(L / 1.25))
        for i in range(bays + 1):
            u = -L / 2 + L * i / bays
            if side == "front" and abs(u) < DOOR_W / 2 + 0.05:
                continue
            plate(k, "wood", W, D, side, u, H / 2, 0.16, H, 0.16, oak(), th=0.05)
        for f in range(floors + 1):
            z = min(H - 0.08, max(0.5, f * FH))
            if side == "front" and z < DOOR_H + 0.1:
                for sd in (-1, 1):
                    seg = (L - DOOR_W) / 2
                    plate(k, "wood", W, D, side, sd * (DOOR_W / 2 + seg / 2), z, seg + 0.05, 0.16, 0.17, oak(), th=0.05)
            else:
                plate(k, "wood", W, D, side, 0, z, L + 0.1, 0.16, 0.17, oak(), th=0.05)
        for f in range(floors):
            z = f * FH + 1.0
            if side == "front" and f == 0:
                for sd in (-1, 1):
                    seg = (L - DOOR_W) / 2
                    plate(k, "wood", W, D, side, sd * (DOOR_W / 2 + seg / 2), z, seg, 0.1, 0.165, oak(), th=0.04)
            else:
                plate(k, "wood", W, D, side, 0, z, L, 0.1, 0.165, oak(), th=0.04)
            bw = L / bays
            for sd in (-1, 1):
                u0 = sd * (L / 2 - bw / 2)
                ang = math.atan2(FH - 0.3, bw) * (1 if sd > 0 else -1)
                loc, rot = on_wall(W, D, side, u0, f * FH + FH / 2, 0.165)
                k.box("wood", (math.hypot(bw, FH - 0.3) - 0.1, 0.04, 0.12), mat_tr(loc, (0, ang, rot[2])), oak())
        for f in range(floors):
            for i in range(1, bays - 1):
                u = -L / 2 + L * (i + 0.5) / bays
                if side == "front" and f == 0 and abs(u) < 0.9:
                    continue
                if side == "back" and f == 0 and u > 0.4:
                    continue        # (the hearth is behind that wall)
                window(k, W, D, side, u, f * FH + 1.65, 0.62, 0.9, oak(), rgb(0x28323a), off=0.16, cross=rgb(0x2a2018))
    # the doorway's frame: two posts and a lintel, standing proud of the plaster
    for sd in (-1, 1):
        k.box("wood", (0.16, t + 0.1, DOOR_H + 0.1), mat_tr((sd * (DOOR_W / 2 + 0.08), -D / 2, DOOR_H / 2)), oak())
    k.box("wood", (DOOR_W + 0.48, t + 0.1, 0.2), mat_tr((0, -D / 2, DOOR_H + 0.1)), oak())
    # the roof of red tiles, gables plastered and framed (as town.py's timber houses)
    rise = W * 0.85
    for y in (-D / 2, D / 2):
        gable_end(k, "plaster", W, D, y, H, rise, plaster)
    for side_y in (-1, 1):
        y = side_y * (D / 2 + 0.16)
        k.box("wood", (0.14, 0.05, rise - 0.2), mat_tr((0, y, H + (rise - 0.2) / 2)), oak())
        for i in (1, 2):
            zz = H + rise * i / 3
            hw = W / 2 * (1 - i / 3)
            k.box("wood", (hw * 2, 0.05, 0.12), mat_tr((0, y, zz)), oak())
    gable_roof(k, "tiles", W, D, H, rise, 0x8e4a34, over=0.4, rnd=rnd, boards=16)
    k.box("tiles", (0.24, D + 0.9, 0.2), mat_tr((0, 0, H + rise + 0.06)), rgb(0x7a3e2c))
    # the chimney over the hearth, at the back
    cx = CHIMNEY[0]
    chimney(k, cx, D / 2 - 0.5, H + rise * (1 - abs(cx) / (W / 2)) + 0.9, 0x8a4a3a, rnd, key="brick")
    objs = k.build(sc, smooth=("clay",))

    # ---- the door, on its hinge ----
    dk = Kit("home2_door", seed=5)
    planks = 5
    pw = DOOR_W / planks
    iron = rgb(0x2a2724, 0.05, rnd)
    for i in range(planks):
        x = pw * (i + 0.5)
        dk.box("wood", (pw - 0.012, 0.07, DOOR_H - 0.04), mat_tr((x, 0, DOOR_H / 2)), rgb(0x5a3a22, 0.08, rnd))
    for z in (0.4, DOOR_H - 0.4):
        dk.box("wood", (DOOR_W - 0.08, 0.05, 0.14), mat_tr((DOOR_W / 2, -0.06, z)), rgb(0x4a3020, 0.06, rnd))
        dk.box("wood", (DOOR_W - 0.08, 0.05, 0.14), mat_tr((DOOR_W / 2, 0.06, z)), rgb(0x4a3020, 0.06, rnd))
        dk.box("iron", (DOOR_W * 0.7, 0.02, 0.05), mat_tr((DOOR_W * 0.35, -0.08, z)), iron)
    dk.box("iron", (0.05, 0.04, 0.18), mat_tr((DOOR_W - 0.16, -0.08, 1.05)), iron)
    door_parts = dk.build(sc)
    hinge = bpy.data.objects.new("door", None)
    sc.collection.objects.link(hinge)
    hinge.location = (-DOOR_W / 2, -D / 2 + 0.02, 0)
    for ob in door_parts:
        ob.parent = hinge
    return export(sc, "home_2.glb", objs + [hinge] + door_parts)


print("wrote", build())
