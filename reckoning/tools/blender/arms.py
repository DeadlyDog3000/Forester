"""Arms: the musket, the pistol, the sword, the battle axe, the spear and the dagger, as glb files.

    blender -b --factory-startup -P reckoning/tools/blender/arms.py

Each is built as a gunsmith or a cutler would shape it, not from boxes: a stock drawn in side view and given its
thickness with its edges rounded off, the barrel sunk half into the fore-end; barrels, pommels and grips turned on a
lathe; blades forged to a lozenge section that runs out to the point and the edge; the knuckle bow bent round from
the guard to the pommel; and the flintlock itself — the plate, the swan-necked cock with its flint, the steel over
the pan, the spring.

How they're held, in the game's own terms (y up the thing from where the hand holds it, x across, z its top / the
flat of a blade): a gun's barrel runs up +y with its top to +z, held at the wrist of the stock; a blade or a haft up
+y from the grip, the edge (and an axe's head) out along +x. Blender's axes: game x = Blender X, game y = Blender Z,
game z = Blender -Y — the exporter does the turning.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import bmesh
import bpy
from mathutils import Vector
import common
importlib.reload(common)
from common import Kit, rgb, fresh_scene, export

PI = math.pi
SHARP = math.radians(38)       # (an edge sharper than this stays sharp; the rest is smoothed)

def V(x, y, z):
    """game (x across, y along, z top) to Blender"""
    return Vector((x, -z, y))

class Arms(Kit):
    def __init__(self, name, seed=1):
        super().__init__(name, seed)
        # metal shines and wood is oiled: each stuff its own finish
        for key, rough, metal in (("wood", 0.55, 0.0), ("iron", 0.42, 0.75), ("steel", 0.26, 0.9), ("brass", 0.32, 0.85),
                                  ("leather", 0.8, 0.0), ("horn", 0.45, 0.0), ("soot", 1.0, 0.0), ("rod", 0.6, 0.0)):
            self.material(key, rough, metal)

    def faces_paint(self, key, faces, color):
        self._paint(self._bm(key), faces, color)

    # a flat shape drawn in two of the axes and given its thickness in the third, its edges rounded off
    # plane: ("x","y") means the points are (game x, game y) and it's thick in game z; ("y","z") thick in x
    def slab(self, key, pts, plane, thick, color, at=0.0, round_=0.4, segs=2, taper=None):
        bm = self._bm(key)
        before = set(bm.faces)
        third = ({"x", "y", "z"} - set(plane)).pop()
        def place(a, b, c):
            d = {plane[0]: a, plane[1]: b, third: c}
            return V(d["x"], d["y"], d["z"])
        front, back = [], []
        for a, b in pts:
            t = thick * (taper(a, b) if taper else 1)
            front.append(bm.verts.new(place(a, b, at + t / 2)))
            back.append(bm.verts.new(place(a, b, at - t / 2)))
        n = len(pts)
        fa = bm.faces.new(front); fb = bm.faces.new(list(reversed(back)))
        sides = [bm.faces.new((front[i], front[(i + 1) % n], back[(i + 1) % n], back[i])) for i in range(n)]
        faces = [fa, fb] + sides
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        if round_ > 0:
            edges = [e for f in (fa, fb) for e in f.edges]
            off = min(thick * round_, 0.012)
            got = bmesh.ops.bevel(bm, geom=edges, offset=off, segments=segs, affect="EDGES", profile=0.5, clamp_overlap=True)
        faces = [f for f in bm.faces if f not in before]
        self._paint(bm, faces, color)
        return faces

    # a thing turned on a lathe: (along, radius) pairs up its axis; the axis runs along `axis` ("y" mostly) through
    # (cx, cz) — the other two coordinates
    def lathe(self, key, prof, color, segs=16, axis="y", c=(0.0, 0.0), oct_=False, phase=0.0):
        bm = self._bm(key)
        rings = []
        for along, r in prof:
            ring = []
            for i in range(segs):
                a = phase + 2 * PI * i / segs
                u, w = math.cos(a) * r, math.sin(a) * r
                if axis == "y": p = V(c[0] + u, along, c[1] + w)
                elif axis == "x": p = V(along, c[0] + u, c[1] + w)
                else: p = V(c[0] + u, c[1] + w, along)
                ring.append(bm.verts.new(p))
            rings.append(ring)
        faces = []
        for k in range(len(rings) - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(segs):
                j = (i + 1) % segs
                if prof[k][1] <= 1e-5 and prof[k + 1][1] <= 1e-5: continue
                faces.append(bm.faces.new((A[i], A[j], B[j], B[i])))
        if prof[0][1] > 1e-5: faces.append(bm.faces.new(list(reversed(rings[0]))))
        if prof[-1][1] > 1e-5: faces.append(bm.faces.new(rings[-1]))
        bmesh.ops.remove_doubles(bm, verts=[v for r in rings for v in r], dist=1e-6)
        faces = [f for f in faces if f.is_valid]
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        self._paint(bm, faces, color)
        return faces

    # a round bar bent along a path of points (game coordinates)
    def tube(self, key, pts, r, color, segs=8):
        bm = self._bm(key)
        P = [V(*p) for p in pts]
        rings = []
        for k, p in enumerate(P):
            t = (P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]).normalized()
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n1 = t.cross(up).normalized(); n2 = t.cross(n1).normalized()
            rings.append([bm.verts.new(p + (n1 * math.cos(2 * PI * i / segs) + n2 * math.sin(2 * PI * i / segs)) * r) for i in range(segs)])
        faces = []
        for k in range(len(rings) - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(segs):
                j = (i + 1) % segs
                faces.append(bm.faces.new((A[i], A[j], B[j], B[i])))
        faces.append(bm.faces.new(list(reversed(rings[0])))); faces.append(bm.faces.new(rings[-1]))
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        self._paint(bm, faces, color)
        return faces

    # a blade forged to a lozenge: stations (along, half width, half thickness, ridge) up it — the ridge the share of
    # the width that's the flat before the bevel runs to the edge; width across game x, thickness in game z
    def blade(self, key, st, color, x0=0.0):
        bm = self._bm(key)
        rings = []
        for along, w, t, ridge in st:
            rw = w * ridge
            pts = [(w, 0), (rw, t), (-rw, t), (-w, 0), (-rw, -t), (rw, -t)]
            rings.append([bm.verts.new(V(x0 + a, along, b)) for a, b in pts])
        faces = []
        for k in range(len(rings) - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(6):
                j = (i + 1) % 6
                faces.append(bm.faces.new((A[i], A[j], B[j], B[i])))
        faces.append(bm.faces.new(list(reversed(rings[0])))); faces.append(bm.faces.new(rings[-1]))
        bmesh.ops.remove_doubles(bm, verts=[v for r in rings for v in r], dist=1e-6)
        faces = [f for f in faces if f.is_valid]
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        self._paint(bm, faces, color)
        return faces

    def ring(self, key, centre, axis, R, r, color, segs=14, tsegs=6):
        """a torus: round `axis` ("x", "y" or "z", game), centred on a game point"""
        pts = []
        for i in range(segs + 1):
            a = 2 * PI * i / segs
            u, w = math.cos(a) * R, math.sin(a) * R
            if axis == "x": pts.append((centre[0], centre[1] + u, centre[2] + w))
            elif axis == "y": pts.append((centre[0] + u, centre[1], centre[2] + w))
            else: pts.append((centre[0] + u, centre[1] + w, centre[2]))
        return self.tube(key, pts, r, color, tsegs)

    def finish(self, sc):
        objs = self.build(sc, smooth=())
        # smooth everything, keeping sharp the edges that really are sharp (a lock plate's, a blade's edge)
        for ob in objs:
            bm = bmesh.new(); bm.from_mesh(ob.data)
            for f in bm.faces: f.smooth = True
            for e in bm.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > SHARP: e.smooth = False
            bm.to_mesh(ob.data); bm.free()
        return objs


WALNUT, DARKWOOD, ASH = 0x5a361d, 0x3e2414, 0x9a7a52
IRON, BLUED, STEEL, BRASS, LEATHER, FLINT, SOOT = 0x2c2e33, 0x23252a, 0x9ca2aa, 0xb88f3e, 0x4a2c18, 0x6e685e, 0x080706


def flintlock(k, side, y, z, s):
    """the lock, on the right of the stock (x = side), its plate centred at (y, z) along and up, s its size"""
    j = k.rnd
    k.slab("iron", [(y - 0.05 * s, z), (y - 0.036 * s, z + 0.012 * s), (y + 0.075 * s, z + 0.012 * s), (y + 0.1 * s, z + 0.002 * s),
                    (y + 0.078 * s, z - 0.011 * s), (y - 0.036 * s, z - 0.012 * s)], ("y", "z"), 0.004 * s, rgb(IRON, 0.05, j), at=side + 0.002 * s, round_=0.3)
    # the cock: a swan neck rising from the tumbler, jaws at its top with the flint between them, the screw through
    cy, cz = y - 0.008 * s, z + 0.004 * s
    neck = [(0.0, 0.0), (0.009, 0.0), (0.013, 0.012), (0.02, 0.025), (0.03, 0.033), (0.035, 0.041), (0.03, 0.047), (0.02, 0.041),
            (0.009, 0.03), (0.0, 0.016), (-0.006, 0.006)]
    k.slab("steel", [(cy + a * s, cz + b * s) for a, b in neck], ("y", "z"), 0.006 * s, rgb(STEEL, 0.04, j), at=side + 0.007 * s, round_=0.35)
    k.slab("steel", [(cy + 0.022 * s, cz + 0.047 * s), (cy + 0.042 * s, cz + 0.047 * s), (cy + 0.042 * s, cz + 0.053 * s), (cy + 0.022 * s, cz + 0.053 * s)], ("y", "z"), 0.008 * s, rgb(STEEL, 0.04, j), at=side + 0.007 * s)
    k.slab("horn", [(cy + 0.03 * s, cz + 0.053 * s), (cy + 0.046 * s, cz + 0.051 * s), (cy + 0.046 * s, cz + 0.058 * s), (cy + 0.03 * s, cz + 0.06 * s)], ("y", "z"), 0.009 * s, rgb(FLINT, 0.06, j), at=side + 0.007 * s, round_=0.2)
    k.slab("steel", [(cy + 0.024 * s, cz + 0.059 * s), (cy + 0.04 * s, cz + 0.059 * s), (cy + 0.04 * s, cz + 0.064 * s), (cy + 0.024 * s, cz + 0.064 * s)], ("y", "z"), 0.008 * s, rgb(STEEL, 0.04, j), at=side + 0.007 * s)
    k.lathe("steel", [(cz + 0.045 * s, 0.0022 * s), (cz + 0.072 * s, 0.0022 * s)], rgb(STEEL), segs=6, axis="z", c=(side + 0.007 * s, cy + 0.032 * s))
    # the steel standing over the pan, and the pan; the spring that holds the steel
    fy = y + 0.058 * s
    k.slab("steel", [(fy, z + 0.016 * s), (fy + 0.006 * s, z + 0.016 * s), (fy + 0.009 * s, z + 0.046 * s), (fy + 0.003 * s, z + 0.048 * s)], ("y", "z"), 0.012 * s, rgb(STEEL, 0.04, j), at=side + 0.006 * s, round_=0.25)
    k.slab("steel", [(fy - 0.018 * s, z + 0.014 * s), (fy + 0.004 * s, z + 0.014 * s), (fy + 0.004 * s, z + 0.019 * s), (fy - 0.018 * s, z + 0.019 * s)], ("y", "z"), 0.012 * s, rgb(STEEL, 0.04, j), at=side + 0.006 * s)
    k.slab("iron", [(fy - 0.02 * s, z + 0.006 * s), (fy + 0.004 * s, z + 0.006 * s), (fy + 0.004 * s, z + 0.014 * s), (fy - 0.02 * s, z + 0.014 * s)], ("y", "z"), 0.012 * s, rgb(IRON, 0.05, j), at=side + 0.006 * s)
    k.slab("steel", [(fy + 0.008 * s, z + 0.0), (fy + 0.04 * s, z - 0.004 * s), (fy + 0.04 * s, z - 0.001 * s), (fy + 0.008 * s, z + 0.004 * s)], ("y", "z"), 0.004 * s, rgb(STEEL, 0.04, j), at=side + 0.005 * s, round_=0.2)


def trigger_guard(k, y0, y1, z, drop, color, w=0.008):
    """the bow of brass under the wrist, round the trigger: from y0 to y1, dropping `drop` below z"""
    n, out, inn = 12, [], []
    for i in range(n + 1):
        t = i / n
        y = y0 + (y1 - y0) * t
        d = math.sin(t * PI) ** 0.8 * drop
        out.append((y, z - d - 0.004)); inn.append((y, z - d + 0.0))
    pts = out + list(reversed(inn))
    k.slab("brass", pts, ("y", "z"), w, color, round_=0.3)


def musket():
    sc = fresh_scene("Reckoning musket")
    k = Arms("musket", seed=31); j = k.rnd
    wood = rgb(WALNUT, 0.04, j)
    # the stock: the butt dropped, a slim wrist, the lock's flat, the fore-end running up under the barrel to its nose,
    # half the barrel sunk in it
    # (slim, as a Brown Bess or a Charleville is: a hand's width at the butt, two fingers' at the fore-end)
    butt = [(-0.43, 0.018), (-0.43, -0.12), (-0.37, -0.112), (-0.27, -0.094), (-0.17, -0.072), (-0.09, -0.05), (-0.03, -0.042),
            (0.03, -0.043), (0.09, -0.034), (0.16, -0.016), (0.2, -0.008), (0.2, 0.028), (0.1, 0.031), (0.03, 0.024), (-0.03, 0.014), (-0.09, 0.008),
            (-0.19, 0.014), (-0.3, 0.018)]
    k.slab("wood", butt, ("y", "z"), 0.038, wood, round_=0.36, segs=3,
           taper=lambda a, b: 0.82 if -0.11 < a < 0.0 else 1.0)
    fore = [(0.12, -0.012), (0.3, -0.002), (0.4, 0.002), (0.7, 0.005), (0.93, 0.0065), (0.95, 0.009), (0.95, 0.03), (0.4, 0.031), (0.12, 0.031)]
    k.slab("wood", fore, ("y", "z"), 0.026, wood, round_=0.4, segs=3)
    # the barrel: eight-sided at the breech, round and tapering to the muzzle, a ring there and the bore
    k.lathe("iron", [(0.0, 0.0148), (0.29, 0.0144)], rgb(BLUED, 0.03, j), segs=8, c=(0, 0.032), phase=PI / 8)
    k.lathe("iron", [(0.28, 0.0132), (0.31, 0.0128), (0.7, 0.0118), (1.105, 0.011)], rgb(BLUED, 0.03, j), segs=24, c=(0, 0.032))
    k.lathe("iron", [(1.1, 0.0122), (1.124, 0.0122)], rgb(IRON, 0.03, j), segs=24, c=(0, 0.032))
    k.lathe("soot", [(1.122, 0.0072), (1.1255, 0.0072)], rgb(SOOT), segs=16, c=(0, 0.032))
    k.slab("iron", [(-0.1, 0.01), (0.0, 0.026), (0.0, 0.032), (-0.1, 0.016)], ("y", "z"), 0.012, rgb(BLUED, 0.03, j), round_=0.3)  # the tang
    k.slab("brass", [(1.088, 0.046), (1.104, 0.046), (1.1, 0.052), (1.092, 0.052)], ("y", "z"), 0.003, rgb(BRASS, 0.03, j), round_=0.2)  # foresight
    k.slab("iron", [(0.26, 0.046), (0.285, 0.046), (0.285, 0.052), (0.26, 0.052)], ("y", "z"), 0.012, rgb(IRON, 0.03, j), round_=0.2)   # backsight
    # the ramrod under the barrel, its tip, the pipes holding it; the brass nose cap of the fore-end
    # (close under the barrel, as on the real thing — a few millimetres of wood between, the fore-end no deeper than
    #  barrel and rod together: set three centimetres down, the gun was as deep as a plank seen end on)
    ROD_Z = 0.0125
    k.lathe("rod", [(0.12, 0.0042), (1.09, 0.0042)], rgb(DARKWOOD, 0.04, j), segs=8, c=(0, ROD_Z))
    k.lathe("rod", [(1.088, 0.0052), (1.112, 0.0052)], rgb(BRASS, 0.03, j), segs=8, c=(0, ROD_Z))
    for y in (0.46, 0.74, 0.98):
        k.lathe("brass", [(y, 0.0072), (y + 0.032, 0.0072)], rgb(BRASS, 0.03, j), segs=12, c=(0, ROD_Z))
    k.slab("brass", [(0.938, 0.005), (0.952, 0.008), (0.952, 0.03), (0.938, 0.031)], ("y", "z"), 0.027, rgb(BRASS, 0.03, j), round_=0.3)
    # the lock, and the brass side plate opposite it
    flintlock(k, 0.02, 0.0, 0.006, 1.0)
    k.slab("brass", [(-0.04, 0.0), (0.0, 0.01), (0.06, 0.008), (0.09, 0.0), (0.06, -0.008), (0.0, -0.01)], ("y", "z"), 0.003, rgb(BRASS, 0.03, j), at=-0.02, round_=0.2)
    # the trigger and its guard; the butt plate; the sling swivels
    trigger_guard(k, -0.07, 0.07, -0.046, 0.028, rgb(BRASS, 0.03, j))
    k.slab("steel", [(-0.004, -0.046), (0.006, -0.046), (0.0, -0.066), (-0.006, -0.064)], ("y", "z"), 0.005, rgb(STEEL, 0.03, j), round_=0.3)
    k.slab("brass", [(-0.437, 0.02), (-0.426, 0.02), (-0.426, -0.122), (-0.437, -0.122)], ("y", "z"), 0.04, rgb(BRASS, 0.03, j), round_=0.3)
    k.ring("iron", (0, -0.25, -0.104), "x", 0.011, 0.0022, rgb(IRON))
    k.ring("iron", (0, 0.62, -0.006), "x", 0.011, 0.0022, rgb(IRON))
    return export(sc, "musket.glb", k.finish(sc))


def pistol():
    sc = fresh_scene("Reckoning pistol")
    k = Arms("pistol", seed=32); j = k.rnd
    wood = rgb(WALNUT, 0.04, j)
    stock = [(0.29, -0.009), (0.29, 0.024), (0.05, 0.025), (0.0, 0.02), (-0.03, 0.002), (-0.06, -0.028), (-0.088, -0.066), (-0.106, -0.098),
             (-0.112, -0.112), (-0.096, -0.128), (-0.07, -0.118), (-0.046, -0.086), (-0.022, -0.054), (0.006, -0.032), (0.05, -0.022), (0.15, -0.014)]
    k.slab("wood", stock, ("y", "z"), 0.03, wood, round_=0.4, segs=3, taper=lambda a, b: 1.12 if a < -0.06 else 1.0)
    k.lathe("iron", [(-0.004, 0.0124), (0.11, 0.0122)], rgb(BLUED, 0.03, j), segs=8, c=(0, 0.022), phase=PI / 8)
    k.lathe("iron", [(0.105, 0.011), (0.33, 0.0098)], rgb(BLUED, 0.03, j), segs=20, c=(0, 0.022))
    k.lathe("iron", [(0.318, 0.0108), (0.332, 0.0108)], rgb(IRON, 0.03, j), segs=20, c=(0, 0.022))
    k.lathe("soot", [(0.331, 0.0058), (0.3335, 0.0058)], rgb(SOOT), segs=12, c=(0, 0.022))
    k.slab("brass", [(0.276, -0.011), (0.294, -0.008), (0.294, 0.026), (0.276, 0.027)], ("y", "z"), 0.032, rgb(BRASS, 0.03, j), round_=0.3)
    k.lathe("rod", [(0.06, 0.0034), (0.326, 0.0034)], rgb(DARKWOOD, 0.04, j), segs=8, c=(0, -0.006))
    k.lathe("rod", [(0.32, 0.0045), (0.334, 0.0045)], rgb(BRASS), segs=8, c=(0, -0.006))
    flintlock(k, 0.0145, -0.012, 0.006, 0.72)
    # the pommel: a brass cap swelling over the butt
    k.lathe("brass", [(-0.142, 0.0), (-0.138, 0.016), (-0.128, 0.024), (-0.114, 0.023), (-0.104, 0.016), (-0.1, 0.0)], rgb(BRASS, 0.03, j), segs=16, axis="z", c=(0.0, -0.1))
    trigger_guard(k, -0.042, 0.042, -0.026, 0.02, rgb(BRASS, 0.03, j), w=0.006)
    k.slab("steel", [(-0.004, -0.024), (0.004, -0.024), (0.0, -0.04), (-0.005, -0.038)], ("y", "z"), 0.004, rgb(STEEL), round_=0.3)
    k.slab("brass", [(0.312, 0.034), (0.322, 0.034), (0.32, 0.038), (0.314, 0.038)], ("y", "z"), 0.0025, rgb(BRASS), round_=0.2)
    return export(sc, "pistol.glb", k.finish(sc))


def sword():
    sc = fresh_scene("Reckoning sword")
    k = Arms("sword", seed=33); j = k.rnd
    # the grip, bound in leather between two little ferrules; the pommel; the cross and its knuckle bow
    k.lathe("leather", [(0.0, 0.013), (0.04, 0.0155), (0.1, 0.0158), (0.17, 0.0138)], rgb(LEATHER, 0.05, j), segs=12)
    for y in (0.0, 0.17):
        k.lathe("steel", [(y - 0.006, 0.0165), (y + 0.006, 0.0165)], rgb(STEEL, 0.03, j), segs=12)
    k.lathe("steel", [(-0.052, 0.0), (-0.048, 0.012), (-0.038, 0.021), (-0.022, 0.023), (-0.01, 0.016), (-0.004, 0.01)], rgb(STEEL, 0.03, j), segs=16)
    k.lathe("steel", [(0.176, 0.014), (0.19, 0.02), (0.2, 0.014)], rgb(STEEL, 0.03, j), segs=12)
    # the quillons: a bar across, swelling to knobs at its ends
    k.lathe("steel", [(-0.125, 0.0), (-0.12, 0.009), (-0.105, 0.0075), (-0.03, 0.0062), (0.03, 0.0062), (0.105, 0.0075), (0.12, 0.009), (0.125, 0.0)], rgb(STEEL, 0.03, j), segs=10, axis="x", c=(0.188, 0.0))
    # the knuckle bow, bent from the front quillon down round the hand to the pommel
    bow = [(0.1, 0.19, 0.0), (0.112, 0.16, 0.0), (0.108, 0.1, 0.0), (0.085, 0.03, 0.0), (0.05, -0.02, 0.0), (0.02, -0.038, 0.0)]
    k.tube("steel", bow, 0.0052, rgb(STEEL, 0.03, j), segs=8)
    # a side ring off the cross, over the blade's flat
    k.ring("steel", (0.0, 0.205, 0.026), "x", 0.024, 0.0034, rgb(STEEL, 0.03, j))
    # the blade: a ricasso, then the lozenge running out to the point
    st = [(0.2, 0.017, 0.0055, 0.9), (0.24, 0.019, 0.0055, 0.55), (0.5, 0.017, 0.0046, 0.4), (0.8, 0.0135, 0.0036, 0.35), (0.98, 0.008, 0.0026, 0.3), (1.06, 0.0005, 0.0008, 0.3)]
    k.blade("steel", st, rgb(STEEL, 0.03, j))
    return export(sc, "sword.glb", k.finish(sc))


def dagger():
    sc = fresh_scene("Reckoning dagger")
    k = Arms("dagger", seed=34); j = k.rnd
    k.lathe("wood", [(0.0, 0.012), (0.05, 0.0148), (0.1, 0.0125)], rgb(DARKWOOD, 0.05, j), segs=12)
    for y in (0.004, 0.096):
        k.lathe("brass", [(y - 0.005, 0.0142), (y + 0.005, 0.0142)], rgb(BRASS), segs=12)
    k.lathe("brass", [(-0.03, 0.0), (-0.026, 0.011), (-0.014, 0.016), (-0.004, 0.01), (0.0, 0.006)], rgb(BRASS, 0.03, j), segs=14)
    k.lathe("brass", [(-0.058, 0.0), (-0.054, 0.0065), (-0.04, 0.0055), (0.04, 0.0055), (0.054, 0.0065), (0.058, 0.0)], rgb(BRASS, 0.03, j), segs=10, axis="x", c=(0.106, 0.0))
    st = [(0.11, 0.013, 0.0045, 0.5), (0.2, 0.011, 0.0042, 0.35), (0.3, 0.0065, 0.003, 0.3), (0.36, 0.0004, 0.0006, 0.3)]
    k.blade("steel", st, rgb(STEEL, 0.03, j))
    return export(sc, "dagger.glb", k.finish(sc))


def battleaxe():
    sc = fresh_scene("Reckoning battle axe")
    k = Arms("battleaxe", seed=35); j = k.rnd
    # the haft of ash, a leather grip at its foot, an iron cap
    k.lathe("wood", [(-0.06, 0.0165), (0.3, 0.017), (0.62, 0.0158), (0.8, 0.015)], rgb(ASH, 0.05, j), segs=10)
    k.lathe("leather", [(-0.02, 0.0185), (0.16, 0.0185)], rgb(LEATHER, 0.05, j), segs=10)
    k.lathe("iron", [(-0.072, 0.0), (-0.07, 0.017), (-0.05, 0.0178)], rgb(IRON), segs=10)
    # the head: the eye round the haft, the bearded blade out along +x thinning to its edge, a short spike behind,
    # and langets down the haft
    k.lathe("iron", [(0.62, 0.023), (0.75, 0.022)], rgb(IRON, 0.03, j), segs=12)
    head = [(0.02, 0.73), (0.08, 0.745), (0.15, 0.775), (0.205, 0.81), (0.222, 0.76), (0.226, 0.69), (0.218, 0.6), (0.198, 0.53),
            (0.165, 0.495), (0.14, 0.545), (0.1, 0.6), (0.05, 0.63), (0.02, 0.635)]
    k.slab("iron", head, ("x", "y"), 0.026, rgb(IRON, 0.03, j), round_=0.15, segs=2,
           taper=lambda x, y: max(0.12, 1 - max(0, x - 0.03) / 0.2))
    # (the edge, ground bright)
    edge = [(0.19, 0.8), (0.205, 0.81), (0.222, 0.76), (0.226, 0.69), (0.218, 0.6), (0.198, 0.53), (0.165, 0.495), (0.16, 0.51), (0.19, 0.545), (0.208, 0.6), (0.214, 0.69), (0.21, 0.76)]
    k.slab("steel", edge, ("x", "y"), 0.006, rgb(STEEL, 0.03, j), round_=0.2)
    k.slab("iron", [(-0.02, 0.66), (-0.02, 0.72), (-0.095, 0.695)], ("x", "y"), 0.02, rgb(IRON, 0.03, j), round_=0.25, taper=lambda x, y: max(0.2, 1 + (x + 0.02) / 0.09))
    for s in (-1, 1):
        k.slab("iron", [(-0.007, 0.5), (0.007, 0.5), (0.008, 0.625), (-0.008, 0.625)], ("x", "y"), 0.004, rgb(IRON), at=s * 0.018, round_=0.2)
    return export(sc, "battleaxe.glb", k.finish(sc))


def spear():
    sc = fresh_scene("Reckoning spear")
    k = Arms("spear", seed=36); j = k.rnd
    k.lathe("wood", [(-0.45, 0.019), (0.5, 0.02), (1.44, 0.0172)], rgb(ASH, 0.05, j), segs=10)
    k.lathe("iron", [(-0.47, 0.0), (-0.46, 0.019), (-0.42, 0.0195)], rgb(IRON), segs=10)
    k.lathe("iron", [(1.42, 0.0205), (1.52, 0.0168), (1.56, 0.012)], rgb(IRON, 0.03, j), segs=10)
    for y in (1.44, 1.5):
        k.lathe("steel", [(y, 0.0215), (y + 0.006, 0.0215)], rgb(STEEL), segs=10)
    st = [(1.555, 0.012, 0.007, 0.5), (1.62, 0.034, 0.0068, 0.25), (1.7, 0.03, 0.0056, 0.22), (1.79, 0.012, 0.0036, 0.25), (1.85, 0.0004, 0.0006, 0.3)]
    k.blade("steel", st, rgb(STEEL, 0.03, j))
    return export(sc, "spear.glb", k.finish(sc))


# (one or some of them: blender ... -P arms.py -- musket; the pistol is a real one now, guns_real.py, so it's left out
#  unless asked for by name)
_want = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["musket", "sword", "dagger", "battleaxe", "spear"]
print("wrote", *[globals()[n]() for n in _want])
