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
WW, WH = 0.62, 0.9
# the windows, by the game's own reckoning of the house (x across, z from the back to the door, as woods.js has it):
# (wall, where along it, the height of its middle). The same list is in woods.js, for the plaster inside.
WINDOWS = [("front", -1.875, 1.65), ("back", 0.625, 1.65), ("left", 1.2, 1.65), ("right", -1.2, 1.65), ("right", 0.0, 1.65),
           ("front", -0.625, 4.45), ("front", 0.625, 4.45), ("back", 0.625, 4.45), ("back", 1.875, 4.45),
           ("left", -1.2, 4.45), ("left", 1.2, 4.45), ("right", -1.2, 4.45), ("right", 0.0, 4.45)]


def wall_c(side, g):
    """the game's place along a wall to Blender's (the game's z runs the other way from Blender's y)"""
    return g if side in ("front", "back") else -g


def plate_u(side, c):
    """Blender's place along a wall to town.py's on_wall u"""
    return {"front": c, "back": -c, "left": -c, "right": c}[side]


def on_side(k, side, c, z, along, depth, height, key, color):
    if side in ("front", "back"):
        k.box(key, (along, depth, height), mat_tr((c, (-1 if side == "front" else 1) * D / 2, z)), color)
    else:
        k.box(key, (depth, along, height), mat_tr(((-1 if side == "left" else 1) * W / 2, c, z)), color)


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
    # the windows, real ones, glazed, that you can see out of — and the plaster walls built round them and the door
    ops = {"front": [(0.0, 0.0, DOOR_H, DOOR_W)], "back": [], "left": [], "right": []}
    for side, g, zc in WINDOWS:
        ops[side].append((wall_c(side, g), zc - WH / 2, zc + WH / 2, WW))
    for side, holes in ops.items():
        L = W if side in ("front", "back") else D
        cuts = sorted({-L / 2, L / 2} | {c + sd * w / 2 for c, z0, z1, w in holes for sd in (-1, 1)})
        for a0, a1 in zip(cuts, cuts[1:]):
            mid = (a0 + a1) / 2
            gaps = sorted((z0, z1) for c, z0, z1, w in holes if abs(mid - c) < w / 2)
            z = 0.0
            for z0, z1 in gaps + [(H, H)]:
                if z0 - z > 0.01:
                    on_side(k, side, mid, (z + z0) / 2, a1 - a0, t, z0 - z, "plaster", plaster)
                z = max(z, z1)
    for side, g, zc in WINDOWS:
        c = wall_c(side, g)
        fr = oak()
        on_side(k, side, c, zc + WH / 2 + 0.05, WW + 0.2, t + 0.08, 0.1, "wood", fr)               # head
        on_side(k, side, c, zc - WH / 2 - 0.05, WW + 0.24, t + 0.14, 0.1, "wood", fr)              # sill
        for sd in (-1, 1):
            on_side(k, side, c + sd * (WW / 2 + 0.05), zc, 0.1, t + 0.08, WH, "wood", fr)           # jambs
        on_side(k, side, c, zc, WW, 0.02, WH, "glass", rgb(0x9ab0b8))                              # the glass
        on_side(k, side, c, zc, 0.03, 0.05, WH, "wood", rgb(0x2a2018))                              # the leading
        on_side(k, side, c, zc + WH * 0.12, WW, 0.05, 0.03, "wood", rgb(0x2a2018))
    # the frame: posts, rails, braces, as the settlers' houses have — but none across the doorway
    for side in ("front", "back", "left", "right"):
        L = wall_len(W, D, side)
        bays = max(2, round(L / 1.25))
        for i in range(bays + 1):
            u = -L / 2 + L * i / bays
            if side == "front" and abs(u) < DOOR_W / 2 + 0.05:
                continue
            if any(abs(u - plate_u(sd_, wall_c(sd_, g))) < WW / 2 + 0.12 for sd_, g, zc in WINDOWS if sd_ == side):
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
                if any(sd_ == side and abs(plate_u(sd_, wall_c(sd_, g)) - u0) < bw / 2 and f * FH < zc < (f + 1) * FH for sd_, g, zc in WINDOWS):
                    continue
                ang = math.atan2(FH - 0.3, bw) * (1 if sd > 0 else -1)
                loc, rot = on_wall(W, D, side, u0, f * FH + FH / 2, 0.165)
                k.box("wood", (math.hypot(bw, FH - 0.3) - 0.1, 0.04, 0.12), mat_tr(loc, (0, ang, rot[2])), oak())
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
