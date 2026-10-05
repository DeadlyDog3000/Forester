"""The cast of Forester: Reckoning, rigged and animated: brother.glb, sister.glb,
father.glb, jakob.glb, magistrate.glb, watchman.glb, albers.glb, townsman.glb,
townswoman.glb.

    blender -b --factory-startup -P reckoning/tools/blender/people.py [-- name ...]

Each person is one body — grown from a skeleton of joints with Blender's Skin
modifier and smoothed, so limbs and torso are one organic shape — dressed in
the clothes of Hamburg in 1683 (a long coat with deep cuffs and a cravat over
breeches and stockings; or a laced bodice, full skirt and apron), with a
modelled head: brow, eyes, nose, lips, ears, hair, and a beard where they have
one. A rig with the usual bone names moves it: the game finds `hand.R` for
whatever they carry.

Animations, named as the game looks for them: Idle, Walk, Run, Sit, Chop (a
level felling stroke), and the story's poses — Torch, Lantern, Hold, Writ,
Point, ArmsCrossed, Bound, Grieve, Reach, Hammer.

Materials are named for what they are (skin, hair, coat, legs, skirt, apron,
linen, hat, leather, metal...). The game lays cloth texture on the cloth, and
re-colours coat, legs, vest, skirt and hat for each townsperson, so one model
makes a varied crowd.

Front is -Y, up is +Z, 1 unit = 1 m, feet at the origin, about 1.78 m tall.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import common
importlib.reload(common)
from common import rgb, fresh_scene, MODELS

import bmesh
import bpy
from mathutils import Matrix, Vector, Euler

PI = math.pi

# who is who: the same choices the game's own people are made from
CAST = {
    "brother": dict(sex="m", age="young", coat=0x4d5a3c, legs=0x3a3028, vest=0x8a7a5a, hair=0x5a3d25, skin=0xe8c4a0, hat="cap", hatColor=0x5a4a38),
    "sister": dict(sex="f", age="young", coat=0x6a3b32, skirt=0x4a3a50, apron=0xe6dcc8, hair=0x5a3d25, skin=0xe8c4a0, longHair=True),
    "father": dict(sex="m", age="mid", coat=0x2e2a34, legs=0x2a2626, vest=0x7a3a2a, hair=0x5a4a3c, beard=0x5e5248, skin=0xd9ab84),
    "jakob": dict(sex="m", age="old", coat=0x5a4a3a, legs=0x3a3028, hair=0x9a9a9a, beard=0xa8a8a8, skin=0xd8a888, hat="cap", hatColor=0x3a3a40, stoop=0.12),
    "magistrate": dict(sex="m", age="old", coat=0x18181c, legs=0x18181c, hair=0xd8d4cc, beard=0xb8b4ac, skin=0xe0b898, hat="hat", bands=True, chain=True, longHair=True),
    "watchman": dict(sex="m", age="mid", coat=0x7a2a26, legs=0x2a2a30, vest=0xc8b890, hair=0x3a2a1e, skin=0xd4a07a, hat="helmet", sash=0xe0d8c0, beard=0x3a2a1e, beardShort=True),
    # the watch, as the government dresses it: a man or a woman, in a morion helmet or a tricorn — the game tints the
    # coat, breeches (or skirt), waistcoat, sash and hat to the uniform chosen
    "watchman_tricorn": dict(sex="m", age="mid", coat=0x7a2a26, legs=0x2a2a30, vest=0xc8b890, hair=0x3a2a1e, skin=0xd4a07a, hat="tricorn", sash=0xe0d8c0, beard=0x3a2a1e, beardShort=True),
    "watchwoman": dict(sex="f", age="mid", coat=0x7a2a26, skirt=0x2a2a30, hair=0x6a4a30, skin=0xe2b894, hat="helmet", sash=0xe0d8c0),
    "watchwoman_tricorn": dict(sex="f", age="mid", coat=0x7a2a26, skirt=0x2a2a30, hair=0x6a4a30, skin=0xe2b894, hat="tricorn", sash=0xe0d8c0),
    "albers": dict(sex="f", age="old", coat=0x5a4a3a, skirt=0x3e4a5c, apron=0xf0ebe0, hair=0x8a8078, skin=0xe0b898, hat="bonnet", wide=0.1),
    "townsman": dict(sex="m", age="mid", coat=0x5b4a3a, legs=0x3a3028, hair=0x4a3a2a, skin=0xdcb08a, hat="tricorn"),
    "townswoman": dict(sex="f", age="mid", coat=0x6a5a48, skirt=0x4a4038, apron=0xf0ebe0, hair=0x6a4a30, skin=0xe2b894, hat="bonnet"),
    # the men who come out of the forest: no coat or breeches, but skins and furs and rags, the legs bound in strips
    "raider": dict(sex="m", age="mid", coat=0x4a3424, legs=0x3a3226, hair=0x4a3624, beard=0x4a3624, skin=0xc8946c, hat="furhat", hatColor=0x5a4632, wild=True, longHair=True),
}

H = 1.78  # height to the crown


class Parts:
    """Meshes built piece by piece in bmesh, one bmesh per material."""

    def __init__(self, name):
        self.name = name
        self.bms = {}
        self.cols = {}

    def bm(self, mat):
        if mat not in self.bms:
            b = bmesh.new()
            b.loops.layers.float_color.new("Col")
            self.bms[mat] = b
        return self.bms[mat]

    def paint(self, b, verts, color):
        layer = b.loops.layers.float_color["Col"]
        for f in {f for v in verts for f in v.link_faces}:
            for l in f.loops:
                l[layer] = color

    def sphere(self, mat, color, loc, scale, rot=(0, 0, 0), segs=16, rings=10):
        b = self.bm(mat)
        v = bmesh.ops.create_uvsphere(b, u_segments=segs, v_segments=rings, radius=1)["verts"]
        bmesh.ops.transform(b, matrix=Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(scale)), verts=v)
        self.paint(b, v, color)
        return v

    def cyl(self, mat, color, a, bpt, r1, r2, segs=12, caps=True):
        b = self.bm(mat)
        a, bpt = Vector(a), Vector(bpt)
        d = bpt - a
        v = bmesh.ops.create_cone(b, cap_ends=caps, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=d.length)["verts"]
        q = d.to_track_quat("Z", "Y")
        bmesh.ops.transform(b, matrix=Matrix.LocRotScale((a + bpt) / 2, q, Vector((1, 1, 1))), verts=v)
        self.paint(b, v, color)
        return v

    def box(self, mat, color, loc, size, rot=(0, 0, 0)):
        b = self.bm(mat)
        v = bmesh.ops.create_cube(b, size=1)["verts"]
        bmesh.ops.transform(b, matrix=Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(size)), verts=v)
        self.paint(b, v, color)
        return v

    def build(self, scene, materials, smooth=True):
        objs = []
        for mat, b in self.bms.items():
            me = bpy.data.meshes.new(f"{self.name}_{mat}")
            bmesh.ops.recalc_face_normals(b, faces=b.faces)
            b.to_mesh(me)
            b.free()
            me.materials.append(materials[mat])
            me.color_attributes.active_color_name = "Col"
            me.color_attributes.render_color_index = 0
            if smooth:
                me.shade_smooth()
            ob = bpy.data.objects.new(f"{self.name}_{mat}", me)
            scene.collection.objects.link(ob)
            objs.append(ob)
        self.bms = {}
        return objs


def make_material(name, base, rough=0.9, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m


WHITE = (1, 1, 1, 1)


def smooth(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def gauss(x, s):
    return math.exp(-(x / s) ** 2)


def sheet(P, mat, rows, thick=0.006, closed=False, col=None):
    """A piece of cloth with a thickness to it: rows of points from its top edge to its bottom, all the same length
    (closed: each row runs round and joins itself). The thickness is laid on the outside, away from the body."""
    b = P.bm(mat)
    lay = b.loops.layers.float_color["Col"]
    R_, C_ = len(rows), len(rows[0])
    O, I, cols = [], [], {}
    for i in range(R_):
        cx = sum(p[0] for p in rows[i]) / C_; cy = sum(p[1] for p in rows[i]) / C_
        ro, ri = [], []
        for j in range(C_):
            p = Vector(rows[i][j])
            jp = (j + 1) % C_ if closed else min(C_ - 1, j + 1); jm = (j - 1) % C_ if closed else max(0, j - 1)
            ip, im = min(R_ - 1, i + 1), max(0, i - 1)
            n = (Vector(rows[i][jp]) - Vector(rows[i][jm])).cross(Vector(rows[ip][j]) - Vector(rows[im][j]))
            out = Vector((p.x - cx, p.y - cy, 0))
            if n.length < 1e-9: n = out
            if n.length < 1e-9: n = Vector((0, 0, 1))
            n.normalize()
            if n.dot(out) < 0: n = -n
            vo, vi = b.verts.new(p + n * thick), b.verts.new(p)
            c = col(i, j) if col else WHITE
            cols[vo] = c; cols[vi] = c
            ro.append(vo); ri.append(vi)
        O.append(ro); I.append(ri)
    def face(vs):
        try:
            fc = b.faces.new(vs)
            for l in fc.loops: l[lay] = cols[l.vert]
        except ValueError:
            pass
    span = range(C_) if closed else range(C_ - 1)
    for i in range(R_ - 1):
        for j in span:
            j2 = (j + 1) % C_
            face((O[i][j], O[i][j2], O[i + 1][j2], O[i + 1][j]))
            face((I[i][j], I[i + 1][j], I[i + 1][j2], I[i][j2]))
    for i in (0, R_ - 1):
        for j in span:
            j2 = (j + 1) % C_
            face((O[i][j], I[i][j], I[i][j2], O[i][j2]))
    if not closed:
        for i in range(R_ - 1):
            for j in (0, C_ - 1):
                face((O[i][j], O[i + 1][j], I[i + 1][j], I[i][j]))


def bake_ao(sc, objs):
    """The shade that gathers in the folds and corners — under the hat's brim, in the eye sockets, between the arm and
    the side — baked into the vertex colours, so the game shows it everywhere at no cost."""
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.device = "CPU"
    if not sc.world:
        sc.world = bpy.data.worlds.new("w")
    sc.world.light_settings.distance = 0.12
    sc.render.bake.target = "VERTEX_COLORS"
    for ob in objs:
        me = ob.data
        if "Col" not in me.color_attributes:
            continue
        dom = me.color_attributes["Col"].domain
        me.color_attributes.new("AO", "FLOAT_COLOR", dom)
        me.color_attributes.active_color = me.color_attributes["AO"]
        for o2 in sc.objects:
            o2.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        col, ao = me.color_attributes["Col"], me.color_attributes["AO"]
        n = len(col.data)
        cv = [0.0] * (n * 4); av = [0.0] * (n * 4)
        col.data.foreach_get("color", cv); ao.data.foreach_get("color", av)
        for i in range(n):
            k = 0.3 + 0.7 * av[i * 4]
            cv[i * 4] *= k; cv[i * 4 + 1] *= k; cv[i * 4 + 2] *= k
        col.data.foreach_set("color", cv)
        me.color_attributes.remove(me.color_attributes["AO"])
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.color_attributes.render_color_index = me.color_attributes.find("Col")
        ob.select_set(False)


def build_person(key):
    o = CAST[key]
    f = o["sex"] == "f"
    old = o["age"] == "old"
    young = o["age"] == "young"
    sc = fresh_scene(f"Reckoning {key}")

    # ---- materials: named, so the game knows cloth from skin; colour in the material for the ones it re-tints ----
    M = {}
    def mat(name, color, rough=0.92, metal=0.0):
        M[name] = make_material(f"{key}_{name}", color, rough, metal)
    mat("skin", WHITE, 0.6)
    mat("hair", WHITE, 0.8)
    mat("eyes", WHITE, 0.25)
    mat("coat", rgb(o["coat"]))
    mat("legs", rgb(o.get("legs", 0x3a3028)))
    mat("linen", WHITE, 0.95)
    mat("stockings", rgb(0xd8d0c0))
    mat("leather", rgb(0x241a14), 0.7)
    mat("metal", rgb(0xb8913a), 0.35, 0.85)
    if o.get("vest"): mat("vest", rgb(o["vest"]))
    if f:
        mat("skirt", rgb(o["skirt"]))
        if o.get("apron"): mat("apron", rgb(o["apron"]))
    if o.get("hat"): mat("hat", rgb(o.get("hatColor", 0x1e1a18 if o["hat"] != "bonnet" else 0xf0ebe0) if o["hat"] != "helmet" else 0xa4a8ae), 0.42 if o["hat"] == "helmet" else 0.9, 0.3 if o["hat"] == "helmet" else 0.0)
    if o.get("sash"): mat("sash", rgb(o["sash"]))

    skin = rgb(o["skin"])
    hair = rgb(o["hair"])
    wild = o.get("wild", False)
    if wild:
        mat("fur", rgb(0x6a5440), 1.0)
        M["stockings"] = make_material(f"{key}_stockings", rgb(0x7a6a52), 0.95)
    tint = lambda c, k: (c[0] * k[0], c[1] * k[1], c[2] * k[2], 1.0)
    mix = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1.0)
    rnd = random.Random(hash(key) & 0xffff)

    # ---- the skeleton of joints the body grows on (names = bones later) ----
    sh = 0.17 if f else 0.195                 # shoulder half width
    hp = 0.125 if f else 0.105                # hip half width
    stoop = o.get("stoop", 0.0)
    J = {
        "pelvis": (0, 0, 0.93), "spine": (0, 0.0, 1.10), "chest": (0, stoop * 0.3, 1.30), "neck": (0, stoop * 0.6, 1.49), "head": (0, stoop * 0.8, 1.56),
        # the yoke: the breadth across the top of the chest that the shoulders grow out of
        "yoke": (0, stoop * 0.45, 1.405),
        "shoulder.L": (sh, stoop * 0.4, 1.42), "elbow.L": (sh + 0.03, 0.02, 1.16), "wrist.L": (sh + 0.045, -0.01, 0.93), "hand.L": (sh + 0.05, -0.02, 0.84),
        "shoulder.R": (-sh, stoop * 0.4, 1.42), "elbow.R": (-sh - 0.03, 0.02, 1.16), "wrist.R": (-sh - 0.045, -0.01, 0.93), "hand.R": (-sh - 0.05, -0.02, 0.84),
        "hip.L": (hp, 0, 0.90), "knee.L": (hp + 0.005, -0.015, 0.50), "ankle.L": (hp + 0.01, 0.02, 0.085), "toe.L": (hp + 0.01, -0.13, 0.035),
        "hip.R": (-hp, 0, 0.90), "knee.R": (-hp - 0.005, -0.015, 0.50), "ankle.R": (-hp - 0.01, 0.02, 0.085), "toe.R": (-hp - 0.01, -0.13, 0.035),
    }
    wide = o.get("wide", 0.0)
    R = {
        "pelvis": ((0.17 if f else 0.155) + wide, 0.115 + wide * 0.6), "spine": ((0.14 if f else 0.15) + wide * 0.8, 0.1 + wide * 0.6), "chest": ((0.155 if f else 0.18) + wide * 0.5, 0.115 if f else 0.11),
        "yoke": ((0.15 if f else 0.175) + wide * 0.4, 0.1),
        "neck": (0.05 if f else 0.058, 0.054 if f else 0.062), "head": (0.056 if f else 0.064, 0.058 if f else 0.066),
        "shoulder": (0.066 if f else 0.07, 0.066 if f else 0.068), "elbow": (0.042 if f else 0.048, 0.044 if f else 0.048), "wrist": (0.03 if f else 0.034, 0.027 if f else 0.03), "hand": (0.036 if f else 0.04, 0.017),
        "hip": (0.088 if f else 0.085, 0.09), "knee": (0.052 if f else 0.056, 0.056 if f else 0.058), "ankle": (0.036 if f else 0.04, 0.04 if f else 0.042), "toe": (0.042 if f else 0.045, 0.028 if f else 0.03),
    }
    RAD = {n: R[n.split(".")[0]] for n in J}
    # where the flesh swells and narrows between the joints: the thigh, the calf, the biceps, the forearm
    def along(a, b, t, dy=0.0):
        pa, pb = Vector(J[a]), Vector(J[b]); p = pa.lerp(pb, t); return (p.x, p.y + dy, p.z)
    PTS = dict(J)
    chain = []
    for s in "LR":
        extra = {
            f"thighm.{s}": (along(f"hip.{s}", f"knee.{s}", 0.42, 0.004), (0.08 if f else 0.079, 0.086)),
            f"calf.{s}": (along(f"knee.{s}", f"ankle.{s}", 0.3, 0.012), (0.05 if f else 0.055, 0.058 if f else 0.064)),
            f"shinlo.{s}": (along(f"knee.{s}", f"ankle.{s}", 0.74), (0.037 if f else 0.04, 0.04 if f else 0.043)),
            f"bicep.{s}": (along(f"shoulder.{s}", f"elbow.{s}", 0.42), (0.046 if f else 0.055, 0.048 if f else 0.057)),
            f"forem.{s}": (along(f"elbow.{s}", f"wrist.{s}", 0.3), (0.039 if f else 0.046, 0.037 if f else 0.044)),
        }
        for n, (p, r) in extra.items():
            PTS[n] = p; RAD[n] = r
        chain += [("yoke", f"shoulder.{s}"), (f"shoulder.{s}", f"bicep.{s}"), (f"bicep.{s}", f"elbow.{s}"), (f"elbow.{s}", f"forem.{s}"), (f"forem.{s}", f"wrist.{s}"), (f"wrist.{s}", f"hand.{s}"),
                  ("pelvis", f"hip.{s}"), (f"hip.{s}", f"thighm.{s}"), (f"thighm.{s}", f"knee.{s}"), (f"knee.{s}", f"calf.{s}"), (f"calf.{s}", f"shinlo.{s}"), (f"shinlo.{s}", f"ankle.{s}"), (f"ankle.{s}", f"toe.{s}")]
    edges = [("pelvis", "spine"), ("spine", "chest"), ("chest", "yoke"), ("yoke", "neck"), ("neck", "head")] + chain
    # the trunk, legs and head grown as one skin, and the arms as skins of their own that sink into the shoulders —
    # so a hand hanging against the hip is never joined to it, and never pulls it along
    ARMS = {f"{b}.{s}" for s in "LR" for b in ("bicep", "elbow", "forem", "wrist", "hand")}
    arm_edges = [e for e in edges if e[0] in ARMS or e[1] in ARMS]
    body_edges = [e for e in edges if e not in arm_edges]
    def skin_obj(name, elist, roots):
        used = list(dict.fromkeys([n for e in elist for n in e]))
        m_ = bpy.data.meshes.new(name)
        m_.from_pydata([PTS[n] for n in used], [(used.index(a), used.index(b)) for a, b in elist], [])
        ob = bpy.data.objects.new(name, m_)
        sc.collection.objects.link(ob)
        sm = ob.modifiers.new("Skin", "SKIN"); sm.use_smooth_shade = True
        for i, n in enumerate(used):
            m_.skin_vertices[0].data[i].radius = RAD[n]
            if n in roots: m_.skin_vertices[0].data[i].use_root = True
        ob.modifiers.new("Sub", "SUBSURF").levels = 2
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier="Skin")
        bpy.ops.object.modifier_apply(modifier="Sub")
        ob.select_set(False)
        return ob
    body = skin_obj(f"{key}_body", body_edges, {"pelvis"})
    arms = skin_obj(f"{key}_arms", arm_edges, {"shoulder.L", "shoulder.R"})
    n_trunk = len(body.data.vertices)
    for o2 in sc.objects: o2.select_set(False)
    body.select_set(True); arms.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.select_set(False)
    me = body.data

    # ---- dress the body: each face gets a material by where it is ----
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    layer = bm.loops.layers.float_color.new("Col")
    slots = ["skin", "coat", "legs", "stockings", "leather", "linen"] + (["skirt"] if f else [])
    for sname in slots:
        me.materials.append(M[sname])
    idx = {n: i for i, n in enumerate(slots)}
    for fc in bm.faces:
        c = fc.calc_center_median()
        x, y, z = c
        ax = abs(x)
        arm = ax > sh - 0.02 and z > 0.78 and z < 1.5
        col = WHITE
        if z < 0.13:
            m = "leather"                                   # shoes
        elif arm and z < 0.9:
            m = "skin"                                      # hands
        elif arm and wild:
            m = "leather" if z < 1.03 else "skin"           # bare arms, leather bracers
        elif arm and f:
            m = "skin" if z < 1.06 else "linen" if z < 1.1 else "coat"   # sleeves to the elbow, the shift's frill
        elif arm and z < 0.97:
            m = "linen"                                     # shirt cuffs
        elif arm:
            m = "coat"
        elif z > 1.49:
            m = "skin"                                      # neck
        elif z > 0.88:
            m = "coat"                                      # body
        elif f:
            m = "stockings" if z < 0.5 else "skirt"         # under the skirt nobody looks (but a glimpse at the waist is the skirt)
        elif wild:
            # the legs bound in strips from the ankle to the knee, criss-crossed
            if z > 0.52: m = "legs"
            else:
                m = "stockings"
                a = math.atan2(y, x - math.copysign(hp, x))
                col = (0.6, 0.58, 0.54, 1) if math.sin(z * 70 + a * 2.0) > 0.45 else WHITE
        elif z > 0.5:
            m = "legs"                                      # breeches to the knee
        else:
            m = "stockings"
        fc.material_index = idx[m]
        if m == "skin":
            col = skin
        for l in fc.loops:
            l[layer] = col
    bm.to_mesh(me)
    bm.free()
    me.color_attributes.active_color_name = "Col"
    me.color_attributes.render_color_index = 0

    # the body as something to fit clothes over: a point pushed out of it to stand `off` clear of the skin
    from mathutils.bvhtree import BVHTree
    btree = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    def clear(p, off=0.008):
        p = Vector(p)
        loc, n, i, d = btree.find_nearest(p)
        if loc is None:
            return p
        if (p - loc).dot(n) < off:
            return loc + n * off
        return p

    P = Parts(key)
    hz = 1.56                                            # the base of the skull
    hy = stoop * 0.8
    hc = Vector((0, hy - 0.005, hz + 0.105))             # centre of the head
    RX, RY, RZ = 0.088, 0.1, 0.112

    def piecewise(knots, t):
        if t <= knots[0][0]: return knots[0][1]
        for (a, va), (b, vb) in zip(knots, knots[1:]):
            if t <= b:
                k = (t - a) / (b - a); return va + (vb - va) * k
        return knots[-1][1]

    def paint_verts(b, colfn):
        """each vertex its own colour, on all its corners"""
        lay = b.loops.layers.float_color["Col"]
        for v in b.verts:
            c = colfn(v)
            for l in v.link_loops:
                l[lay] = c

    def merge(b, mat):
        """a piece built in its own bmesh, added to the material's mesh"""
        tmp = bpy.data.meshes.new("tmp")
        b.to_mesh(tmp); b.free()
        P.bm(mat).from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    def newbm():
        b = bmesh.new(); b.loops.layers.float_color.new("Col"); return b

    # ---- hair: a shell over the head, sunk under the skin wherever there is no hair, so the hairline is a clean curve;
    # combed in fine ridges from the crown ----
    if f:
        HL = [(0, 0.52), (0.8, 0.46), (1.2, 0.12), (1.6, -0.12), (2.2, -0.4), (PI, -0.5)]
    elif wild:
        HL = [(0, 0.46), (0.8, 0.44), (1.1, 0.15), (1.35, -0.25), (1.62, 0.0), (2.0, -0.45), (PI, -0.65)]
    else:
        HL = [(0, 0.52), (0.75, 0.5 if not old else 0.6), (1.0, 0.32), (1.2, 0.02), (1.38, -0.1), (1.5, 0.1), (1.68, 0.14), (1.9, -0.2), (2.3, -0.45), (PI, -0.55)]
    # ---- the head: an ellipsoid sculpted into a face — skull, jaw and chin, the brow and sockets, cheekbones, the nose and lips
    # worked into the one surface — finer over the face, where the features are ----
    hb = newbm()
    bmesh.ops.create_uvsphere(hb, u_segments=32, v_segments=24, radius=1)
    face_edges = [e for e in hb.edges if all(v.co.y < -0.28 and -0.9 < v.co.z < 0.6 for v in e.verts)]
    bmesh.ops.subdivide_edges(hb, edges=face_edges, cuts=2, use_grid_fill=True, smooth=1.0)
    for v in hb.verts:
        v.co = v.co.normalized()
    jawK = 0.16 if f else 0.12
    noseH = 0.019 if f else 0.024
    def sculpt(X, Y, Z):
        fr = max(0.0, -Y)
        x, y, z = X * RX, Y * RY, Z * RZ
        if Y > 0: y *= 1 + 0.07 * Y * smooth((Z + 0.4) / 0.8)
        low = smooth((-Z - 0.02) / 0.85)
        x *= 1 - jawK * low * (0.35 + 0.65 * fr)
        if not f: x *= 1 + 0.05 * gauss(Z + 0.55, 0.18) * smooth((abs(X) - 0.4) / 0.3)          # a squarer jaw
        if Z < -0.85: z = -0.85 * RZ + (z + 0.85 * RZ) * 0.7
        dy = 0.0
        dy -= (0.003 if f else 0.0055) * gauss(Z - 0.27, 0.1) * gauss(X, 0.62)                       # the brow
        for sd in (-1, 1):
            dy += 0.0085 * gauss(X - sd * 0.39, 0.16) * gauss(Z - 0.07, 0.12)                           # the sockets
            k = gauss(X - sd * 0.58, 0.2) * gauss(Z + 0.1, 0.16)
            x += sd * 0.004 * k; dy -= 0.004 * k                                                       # cheekbones
            if old: dy += 0.004 * gauss(X - sd * 0.45, 0.15) * gauss(Z + 0.35, 0.14)                   # hollow cheeks
            dy += 0.0018 * gauss(X - sd * 0.26, 0.06) * gauss(Z + 0.5, 0.06)                            # the corners of the mouth
            dy -= 0.0055 * gauss(X - sd * 0.15, 0.065) * gauss(Z + 0.3, 0.055)                          # the wings of the nose
        # the nose: a bridge from between the eyes down to the tip, and in under it
        if Z > -0.27:
            t = max(0.0, min(1.0, (0.13 - Z) / 0.4)); h = 0.003 + (noseH - 0.003) * t ** 1.4; w = 0.065 + 0.07 * t
        else:
            h = noseH * smooth((Z + 0.37) / 0.1); w = 0.13
        dy -= h * gauss(X, w)
        dy -= 0.0035 * gauss(X, 0.3) * gauss(Z + 0.43, 0.07)                                           # the upper lip
        dy += 0.0028 * gauss(X, 0.24) * gauss(Z + 0.5, 0.03)                                           # where the lips meet
        dy -= 0.003 * gauss(X, 0.24) * gauss(Z + 0.56, 0.055)                                         # the lower lip
        dy -= (0.003 if f else 0.005) * gauss(X, 0.26) * gauss(Z + 0.78, 0.12)                        # the chin
        y += dy * smooth(fr / 0.5)
        return Vector((x, y, z))
    lipc = rgb(0xb8726a) if f else rgb(0xa47462)
    hv_unit = {}
    for v in hb.verts:
        hv_unit[v.index] = v.co.copy()
        v.co = hc + sculpt(*v.co)
    def hcol(v):
        X, Y, Z = hv_unit[v.index]
        fr = max(0.0, -Y)
        c = skin
        blush = 0.0
        for sd in (-1, 1):
            blush += gauss(X - sd * 0.5, 0.22) * gauss(Z + 0.18, 0.2)
        blush = min(1.0, blush) * fr * (0.45 if f else 0.3)
        c = mix(c, tint(skin, (1.06, 0.82, 0.8)), blush)
        c = mix(c, tint(skin, (1.04, 0.86, 0.84)), 0.35 * gauss(X, 0.12) * gauss(Z + 0.28, 0.07) * fr)    # the nose's tip
        for sd in (-1, 1):
            c = mix(c, tint(skin, (0.86, 0.8, 0.8)), 0.4 * gauss(X - sd * 0.39, 0.17) * gauss(Z - 0.05, 0.13) * fr)   # the sockets in shade
        lip = gauss(X, 0.27) * max(gauss(Z + 0.47, 0.045), gauss(Z + 0.55, 0.05)) * fr
        c = mix(c, lipc, min(1.0, lip * (1.1 if f else 0.8)))
        c = mix(c, tint(lipc, (0.55, 0.5, 0.5)), 0.6 * gauss(X, 0.22) * gauss(Z + 0.505, 0.018) * fr)  # the line between them
        # eyebrows, painted on: a soft arch over each eye
        for sd in (-1, 1):
            zc = 0.25 + 0.035 * gauss(abs(X) - 0.36, 0.2)
            m_ = gauss(Z - zc, 0.03 if f else 0.045) * smooth((abs(X) - 0.1) / 0.06) * smooth((0.66 - abs(X)) / 0.08) * (1 if X * sd > 0 else 0) * fr
            c = mix(c, rgb(o.get("beard", o["hair"])) if not old else rgb(0xa8a49c), min(1.0, m_ * (0.85 if f else 1.0)))
        # the hairline painted on, finer than the hair's own shell can draw it
        phi = math.atan2(X, -Y)
        mh = smooth((Z - piecewise(HL, abs(phi)) + 0.02) / 0.11)
        c = mix(c, tint(hair, (0.62, 0.62, 0.62)), mh)
        # a shadow of beard on the shaven
        if not f and not o.get("beard") and not young:
            c = mix(c, tint(skin, (0.78, 0.78, 0.8)), 0.35 * smooth((-Z - 0.35) / 0.25) * smooth(fr / 0.3) * (1 - gauss(X, 0.25) * gauss(Z + 0.5, 0.1)))
        return c
    paint_verts(hb, hcol)
    hb.normal_update()
    htree = BVHTree.FromBMesh(hb)
    merge(hb, "skin")
    def front(x, z):
        """the face's surface at (x, z): the nearest point coming in from the front"""
        hit = htree.ray_cast(Vector((x, hc.y - 0.4, z)), Vector((0, 1, 0)))
        return hit[0].y if hit[0] is not None else hc.y - RY

    # the eyes in their sockets: the iris and pupil painted in rings round the front of the ball, a lid over the top
    iris = rgb(0x5a3a22 if key not in ("brother", "sister") else 0x3e5a7a)
    for sd in (-1, 1):
        ex, ez = sd * 0.034, hc.z + 0.008
        ey = front(ex, ez)
        er = 0.0122
        ec = Vector((ex, ey + er - 0.0055, ez))
        b = newbm()
        bmesh.ops.create_uvsphere(b, u_segments=16, v_segments=12, radius=er)
        bmesh.ops.rotate(b, verts=b.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
        def ecol(v):
            a = math.acos(max(-1.0, min(1.0, -v.co.y / er)))
            return rgb(0x0a0706) if a < 0.2 else iris if a < 0.5 else rgb(0xe6ded2)
        paint_verts(b, ecol)
        bmesh.ops.translate(b, verts=b.verts, vec=ec)
        merge(b, "eyes")
        # the upper lid, its lashes dark along its edge
        b = newbm()
        bmesh.ops.create_uvsphere(b, u_segments=16, v_segments=10, radius=1)
        bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z < 0.12], context="VERTS")
        bmesh.ops.rotate(b, verts=b.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-0.25, 3, "X"))
        paint_verts(b, lambda v: tint(skin, (0.3, 0.25, 0.22)) if v.co.z < 0.26 else mix(skin, tint(skin, (0.9, 0.82, 0.8)), 0.5))
        bmesh.ops.transform(b, verts=b.verts, matrix=Matrix.LocRotScale(ec + Vector((0, -0.0006, 0.0006)), Euler((0, 0, 0)), Vector((er * 1.12, er * 1.1, er * 1.02))))
        merge(b, "skin")
        # the lower lid, a soft roll
        b = newbm()
        bmesh.ops.create_uvsphere(b, u_segments=16, v_segments=8, radius=1)
        bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z > 0.0 or v.co.y > 0.2], context="VERTS")
        paint_verts(b, lambda v: tint(skin, (0.92, 0.84, 0.82)))
        bmesh.ops.transform(b, verts=b.verts, matrix=Matrix.LocRotScale(ec + Vector((0, -0.0004, 0.0)), Euler((0.3, 0, 0)), Vector((er * 1.1, er * 1.08, er * 1.0))))
        merge(b, "skin")
        # the ear: a rim and the bowl inside it
        ecn = Vector((sd * 0.084, hc.y + 0.008, hc.z - 0.006))
        b = newbm()
        bmesh.ops.create_uvsphere(b, u_segments=12, v_segments=8, radius=1)
        paint_verts(b, lambda v: tint(skin, (0.98, 0.86, 0.84)))
        bmesh.ops.transform(b, verts=b.verts, matrix=Matrix.LocRotScale(ecn, Euler((0.2, 0, sd * -0.25)), Vector((0.008, 0.017, 0.027))))
        merge(b, "skin")
        b = newbm()
        bmesh.ops.create_circle(b, cap_ends=False, segments=18, radius=1)
        ring = [v.co.copy() for v in b.verts]
        b.free()
        b = newbm()
        verts_rows = []
        for i, c0 in enumerate(ring):
            a = i / len(ring) * 2 * PI
            cen = Vector((0, c0.x * 0.0155, c0.y * 0.0255))
            row = []
            for j in range(6):
                t = j / 6 * 2 * PI
                off = Vector((math.cos(t) * 0.0042, math.sin(t) * 0.0042 * c0.x, math.sin(t) * 0.0042 * c0.y))
                row.append(b.verts.new(cen + off))
            verts_rows.append(row)
        for i in range(len(ring)):
            r0, r1 = verts_rows[i], verts_rows[(i + 1) % len(ring)]
            for j in range(6):
                b.faces.new((r0[j], r0[(j + 1) % 6], r1[(j + 1) % 6], r1[j]))
        paint_verts(b, lambda v: tint(skin, (1.0, 0.86, 0.84)))
        bmesh.ops.transform(b, verts=b.verts, matrix=Matrix.LocRotScale(ecn + Vector((sd * 0.002, 0, 0)), Euler((0.2, 0, sd * -0.25)), Vector((1, 1, 1))))
        merge(b, "skin")

    hcol_ = hair
    def hair_shell(rx, ry, rz, segs, rings, mask, thick, ridge, col, groove=None):
        b = newbm()
        bmesh.ops.create_uvsphere(b, u_segments=segs, v_segments=rings, radius=1)
        uv = {}
        for v in b.verts:
            X, Y, Z = v.co.normalized()
            phi = math.atan2(X, -Y)
            m_ = mask(X, Y, Z, phi)
            r_ = ridge * abs(math.sin(phi * 24 + Z * 2.5)) * m_
            e = -0.007 + (0.007 + thick(X, Y, Z)) * m_ + r_
            if groove: e -= groove(X, Y, Z, phi) * m_
            n = Vector((X, Y, Z))
            p = sculpt(X, Y, Z) if Y < 0 else Vector((X * RX, Y * RY * (1 + 0.07 * Y * smooth((Z + 0.4) / 0.8)), Z * RZ))
            v.co = hc + p + n * e
            uv[v] = (r_, m_, Z)
        paint_verts(b, lambda v: col(*uv[v]))
        return b
    vol = 0.007 if young else 0.008
    b = hair_shell(RX, RY, RZ, 40, 28, lambda X, Y, Z, phi: smooth((Z - piecewise(HL, abs(phi)) - 0.1) / 0.09),
                   lambda X, Y, Z: vol + 0.007 * smooth(Z + 0.2), 0.0024,
                   lambda r_, m_, Z: tint(hcol_, (0.7 + 110 * r_, 0.7 + 110 * r_, 0.7 + 110 * r_)),
                   (lambda X, Y, Z, phi: 0.004 * gauss(phi, 0.07) * smooth((Z - 0.3) / 0.2)) if f else None)
    merge(b, "hair")
    if f or o.get("longHair"):
        # hair to the shoulders at the back: a fall of it from the back of the head, or gathered into a bun
        if f and o.get("hat") not in ("bonnet",):
            b = newbm()
            bmesh.ops.create_uvsphere(b, u_segments=16, v_segments=12, radius=1)
            for v in b.verts:
                a = math.atan2(v.co.x, v.co.z)
                v.co *= 1 + 0.08 * abs(math.sin(a * 6))
            paint_verts(b, lambda v: tint(hcol_, (0.85, 0.85, 0.85)))
            bmesh.ops.transform(b, verts=b.verts, matrix=Matrix.LocRotScale(hc + Vector((0, 0.1, 0.0)), Euler((0.6, 0, 0)), Vector((0.048, 0.04, 0.046))))
            merge(b, "hair")
        if o.get("longHair") and not f:
            rows = []
            cols = 20
            for i in range(7):
                t = i / 6
                row = []
                for j in range(cols + 1):
                    a = (1.7 if wild else 1.25) + (2 * PI - (3.4 if wild else 2.5)) * j / cols
                    rr = 1.02 + 0.25 * t
                    zz = hc.z - 0.02 - t * (0.2 if not wild else 0.24) - (rnd.random() * 0.03 * t if wild else 0)
                    x_ = math.sin(a) * RX * rr * (1 + 0.6 * t)
                    y_ = -math.cos(a) * RY * rr + 0.012 * t
                    p = clear(Vector((x_, hc.y + y_, zz)), 0.012) if zz < 1.52 else Vector((x_, hc.y + y_, zz))
                    p += Vector((math.sin(a), -math.cos(a), 0)) * 0.004 * abs(math.sin(j * 1.7 + i))
                    row.append(p)
                rows.append(row)
            sheet(P, "hair", rows, thick=0.012, col=lambda i, j: tint(hcol_, (0.78 + 0.2 * ((j % 2)), 0.78 + 0.2 * ((j % 2)), 0.78 + 0.2 * ((j % 2)))))
    if o.get("beard"):
        bc = rgb(o["beard"])
        short = o.get("beardShort")
        def bmask(X, Y, Z, phi):
            under = smooth((-0.3 - Z) / 0.09) * smooth((1.5 - abs(phi)) / 0.15)
            tash = gauss(Z + 0.39, 0.035) * gauss(X, 0.28) * smooth((0.6 - abs(phi)) / 0.2)
            hole = gauss(X, 0.24) * gauss(Z + 0.5, 0.075)
            return max(0.0, min(1.0, max(under * (1 - hole), tash * 1.2)))
        thickness = (lambda X, Y, Z: 0.004 + 0.003 * smooth((-Z - 0.5) / 0.3)) if short else (lambda X, Y, Z: 0.006 + (0.03 if wild else 0.018) * smooth((-Z - 0.55) / 0.4) * gauss(X, 0.6))
        b = hair_shell(RX, RY, RZ, 28, 20, bmask, thickness, 0.0016, lambda r_, m_, Z: tint(bc, (0.75 + 120 * r_, 0.75 + 120 * r_, 0.75 + 120 * r_)))
        merge(b, "hair")

    # (hands are the skin's own: a plain mitten of a hand, no fingers)

    # ---- clothes over the body ----
    def skirt_rows(z0, z1, n, a0, a1, cols, rad, fold, off=0.006, jag=0.0):
        """rows of points round the body from z0 down to z1, between angles a0 and a1 (0 at the front), each
        pushed clear of the body"""
        rows = []
        for i in range(n):
            t = i / (n - 1)
            z = z0 + (z1 - z0) * t
            row = []
            for j in range(cols + 1):
                a = a0 + (a1 - a0) * j / cols
                rx_, ry_ = rad(t)
                fo = fold(t, a)
                p = Vector((math.sin(a) * (rx_ + fo), -math.cos(a) * (ry_ + fo), z - (jag * rnd.random() * t if jag else 0)))
                row.append(clear(p, off))
            rows.append(row)
        return rows
    if not f and not wild:
        # collar and cravat
        P.cyl("linen", WHITE, (0, hy, 1.46), (0, hy, 1.52), 0.066, 0.056, segs=16)
        if o.get("bands"):
            P.box("linen", WHITE, (0, -0.1, 1.42), (0.07, 0.01, 0.12))
        else:
            P.sphere("linen", WHITE, (0, -0.086, 1.44), (0.034, 0.016, 0.028), segs=12, rings=8)
            for sd in (-1, 1):
                P.box("linen", WHITE, (sd * 0.012, -0.096, 1.385), (0.034, 0.008, 0.085), (0.12, 0, sd * 0.12))
        # the coat's collar, standing at the back of the neck
        rows = skirt_rows(1.5, 1.44, 3, 1.1, 2 * PI - 1.1, 18, lambda t: (0.072 + 0.02 * t, 0.07 + 0.02 * t), lambda t, a: 0.0, 0.006)
        sheet(P, "coat", rows, thick=0.006)
        # the skirts of the coat, flared to the knee, open at the front and split up the back, falling in folds
        ph = [rnd.random() * 6 for _ in range(4)]
        fold = lambda t, a: (0.002 + 0.014 * t) * (math.sin(a * 7 + ph[0]) * 0.7 + math.sin(a * 13 + ph[1]) * 0.3)
        rad = lambda t: (0.172 + wide + 0.1 * t, 0.13 + wide * 0.6 + 0.085 * t)
        for a0, a1 in ((0.3, PI - 0.03), (PI + 0.03, 2 * PI - 0.3)):
            rows = skirt_rows(0.97, 0.42, 9, a0, a1, 18, rad, fold, 0.01)
            sheet(P, "coat", rows, thick=0.007, col=lambda i, j: (0.86, 0.86, 0.86, 1) if i == 8 else WHITE)
        # pocket flaps, each with three buttons
        for sd in (-1, 1):
            a = sd * 0.8
            p = clear(Vector((math.sin(a) * 0.23, -math.cos(a) * 0.17, 0.77)), 0.02)
            P.box("coat", WHITE, p, (0.15, 0.012, 0.055), (0.05, 0, a))
            for k in (-1, 0, 1):
                P.sphere("metal", WHITE, p + Vector((math.cos(a) * 0.045 * k, math.sin(a) * 0.045 * k - 0.006, -0.012)), (0.008, 0.005, 0.008), segs=8, rings=5)
        # a waistcoat showing at the front, buttoned
        if o.get("vest"):
            P.box("vest", WHITE, (0, -0.104, 1.18), (0.15, 0.03, 0.42))
            for i in range(7):
                P.sphere("metal", WHITE, (0, -0.121, 1.36 - i * 0.048), (0.008, 0.005, 0.008), segs=8, rings=5)
        # coat facings and buttons
        for sd in (-1, 1):
            P.box("coat", WHITE, (sd * 0.1, -0.108, 1.15), (0.05, 0.02, 0.5), (0, sd * -0.25, 0))
            for i in range(6):
                P.sphere("metal", WHITE, (sd * 0.076, -0.119, 1.36 - i * 0.06), (0.0095, 0.006, 0.0095), segs=8, rings=5)
        # deep turned-back cuffs, buttoned
        for sd in (-1, 1):
            x0 = sd * (sh + 0.04)
            P.cyl("coat", WHITE, (x0, 0.0, 0.97), (x0, -0.005, 1.075), 0.05, 0.058, segs=16)
            for k in range(2):
                P.sphere("metal", WHITE, (x0 + sd * 0.052, -0.012, 1.0 + k * 0.04), (0.006, 0.006, 0.006), segs=6, rings=4)
        if o.get("sash"):
            P.cyl("sash", WHITE, (0, 0, 1.12), (0, 0, 1.18), 0.162, 0.166, segs=20)
            P.box("sash", WHITE, (0.0, -0.02, 1.2), (0.06, 0.24, 0.62), (0.2, 0.62, 0))
        if o.get("chain"):
            for i in range(20):
                a = i / 20 * 2 * PI
                P.sphere("metal", WHITE, (math.cos(a) * 0.12, -0.05 - math.sin(a) * 0.12 * math.cos(1.15) * 0.3, 1.34 - math.sin(a) * 0.12 * math.sin(1.15)), (0.012, 0.012, 0.012), segs=6, rings=4)
        # the breeches buckled below the knee
        for sd in (-1, 1):
            kx = sd * (hp + 0.005)
            P.cyl("legs", WHITE, (kx, -0.015, 0.49), (kx, -0.015, 0.53), 0.06, 0.062, segs=14)
            P.box("metal", WHITE, (kx + sd * 0.055, -0.02, 0.51), (0.008, 0.018, 0.022))
        # shoes: a heel, a tongue, a square buckle
        for sd in (-1, 1):
            fx = sd * (hp + 0.01)
            P.box("leather", WHITE, (fx, 0.035, 0.018), (0.056, 0.05, 0.036))
            P.box("leather", WHITE, (fx, -0.075, 0.105), (0.05, 0.012, 0.06), (-0.5, 0, 0))
            P.box("metal", WHITE, (fx, -0.096, 0.076), (0.042, 0.008, 0.03), (-0.5, 0, 0))
    elif f:
        P.cyl("linen", WHITE, (0, hy, 1.45), (0, hy, 1.5), 0.062, 0.054, segs=16)
        # a kerchief round the shoulders, crossed over the breast
        rows = []
        for i in range(4):
            t = i / 3
            row = []
            for j in range(41):
                a = j / 40 * 2 * PI
                rx_, ry_ = 0.07 + 0.11 * t, 0.068 + 0.06 * t
                z = 1.475 - 0.06 * t - (0.16 * gauss(math.atan2(math.sin(a), math.cos(a)), 0.5) + 0.08 * gauss(abs(math.atan2(math.sin(a), math.cos(a))) - PI, 0.6)) * t ** 1.5
                row.append(clear(Vector((math.sin(a) * rx_, -math.cos(a) * ry_ + hy * 0.5, z)), 0.009))
            rows.append(row)
        sheet(P, "linen", rows, thick=0.005, closed=True, col=lambda i, j: (0.93, 0.92, 0.9, 1))
        for i in range(6):
            P.box("linen", WHITE, (0, -0.122, 1.33 - i * 0.04), (0.05, 0.004, 0.005), (0, 0, 0.5 * (-1) ** i))   # lacing
        # the skirt: gathered at the waist, full to the ankle, in deep folds, a darker band at the hem
        ph = [rnd.random() * 6 for _ in range(3)]
        rad = lambda t: (0.17 + wide + 0.23 * (1 - (1 - t) ** 1.7), 0.135 + wide * 0.8 + 0.2 * (1 - (1 - t) ** 1.7))
        fold = lambda t, a: (0.004 + 0.016 * t) * (math.sin(a * 14 + ph[0]) * 0.6 + math.sin(a * 5 + ph[1]) * 0.4)
        rows = skirt_rows(0.97, 0.05, 13, 0, 2 * PI, 56, rad, fold, 0.008)
        for row in rows: row.pop()
        sheet(P, "skirt", rows, thick=0.006, closed=True, col=lambda i, j: (0.7, 0.7, 0.7, 1) if i >= 11 else WHITE)
        if o.get("apron"):
            rad2 = lambda t: (rad(t)[0] + 0.024, rad(t)[1] + 0.024)
            fold2 = lambda t, a: (0.002 + 0.006 * t) * math.sin(a * 6 + ph[2])
            rows = skirt_rows(0.95, 0.24, 9, -1.05, 1.05, 18, rad2, fold2, 0.012)
            sheet(P, "apron", rows, thick=0.004)
            P.cyl("apron", WHITE, (0, 0, 0.93), (0, 0, 0.975), 0.176 + wide, 0.174 + wide, segs=24)
            for sd in (-1, 1):
                P.box("apron", WHITE, (sd * 0.03, 0.16 + wide * 0.6, 0.84), (0.03, 0.006, 0.18), (0.08, 0, sd * 0.15))
        if o.get("sash"):
            # the watch's sash on a woman: a belt at the waist, and the band over the shoulder across the bodice
            P.cyl("sash", WHITE, (0, 0, 0.965), (0, 0, 1.02), 0.178 + wide, 0.172 + wide, segs=24)
            P.box("sash", WHITE, (0.0, -0.012, 1.2), (0.055, 0.29, 0.55), (0.16, 0.6, 0))
        for sd in (-1, 1):
            x0 = sd * (sh + 0.035)
            P.cyl("linen", WHITE, (x0, 0.01, 1.075), (x0, 0.012, 1.115), 0.05, 0.054, segs=14)
            fx = sd * (hp + 0.01)
            P.box("leather", WHITE, (fx, 0.035, 0.018), (0.05, 0.045, 0.036))
    else:
        # the forest men: a mantle of skins over the shoulders, ragged at its edge and shaggy; a leather jerkin and a
        # rough tunic under it to the thigh, belted with rope; the legs bound; furs round the ankles
        rows = []
        cols = 44
        for i in range(6):
            t = i / 5
            row = []
            for j in range(cols):
                a = j / cols * 2 * PI
                rx_, ry_ = 0.075 + 0.16 * min(1, t * 1.6), 0.07 + 0.07 * min(1, t * 1.6)
                z = 1.48 - 0.26 * t - (0.05 * rnd.random() * t if i == 5 else 0)
                p = clear(Vector((math.sin(a) * rx_, -math.cos(a) * ry_, z)), 0.016)
                if i > 0:
                    p += Vector((math.sin(a), -math.cos(a), 0)) * 0.006 * rnd.random()
                row.append(p)
            rows.append(row)
        sheet(P, "fur", rows, thick=0.014, closed=True, col=lambda i, j: tuple([0.7 + 0.35 * rnd.random()] * 3) + (1,))
        ph = [rnd.random() * 6 for _ in range(2)]
        rows = skirt_rows(0.95, 0.66, 6, 0, 2 * PI, 36, lambda t: (0.17 + 0.06 * t, 0.125 + 0.05 * t), lambda t, a: 0.008 * t * math.sin(a * 9 + ph[0]), 0.008, jag=0.05)
        for row in rows: row.pop()
        sheet(P, "coat", rows, thick=0.006, closed=True, col=lambda i, j: (0.85, 0.85, 0.85, 1) if i == 5 else WHITE)
        # the rope belt, a pouch, and the lacing up the jerkin
        for k in range(3):
            P.cyl("linen", rgb(0x8a7a5a), (0, 0.0, 0.925 + k * 0.012), (0, 0.0, 0.935 + k * 0.012), 0.168 + wide, 0.168 + wide, segs=24)
        P.sphere("leather", WHITE, (0.12, -0.11, 0.88), (0.04, 0.025, 0.05), segs=10, rings=8)
        for i in range(5):
            P.box("leather", WHITE, (0, -0.118, 1.36 - i * 0.06), (0.05, 0.004, 0.006), (0, 0, 0.5 * (-1) ** i))
        # furs round the ankles
        for sd in (-1, 1):
            fx = sd * (hp + 0.01)
            rows = []
            for i in range(3):
                row = []
                for j in range(16):
                    a = j / 16 * 2 * PI
                    rr = 0.055 + 0.012 * rnd.random() + 0.005 * i
                    row.append(Vector((fx + math.sin(a) * rr, 0.01 - math.cos(a) * rr, 0.17 - i * 0.05)))
                rows.append(row)
            sheet(P, "fur", rows, thick=0.008, closed=True, col=lambda i, j: tuple([0.75 + 0.3 * rnd.random()] * 3) + (1,))

    # ---- hats ----
    hat = o.get("hat")
    top = hc.z + 0.105
    def ring_rows(r0, r1, n, cols, zf, rf=None, cx=0.0, cy=0.0):
        rows = []
        for i in range(n):
            t = i / (n - 1)
            row = []
            for j in range(cols):
                a = j / cols * 2 * PI
                r = r0 + (r1 - r0) * t
                rh = rf(t, a, r) if rf else r
                row.append(Vector((cx + math.sin(a) * rh, cy - math.cos(a) * rh, zf(t, a, r))))
            rows.append(row)
        return rows
    def dome(mat, col, c, s, cut=0.0, segs=24, rings=12):
        b = newbm()
        bmesh.ops.create_uvsphere(b, u_segments=segs, v_segments=rings, radius=1)
        bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z < cut - 1e-4], context="VERTS")
        paint_verts(b, lambda v: col)
        bmesh.ops.transform(b, verts=b.verts, matrix=Matrix.LocRotScale(Vector(c), Euler((0, 0, 0)), Vector(s)))
        merge(b, mat)
    if hat == "tricorn":
        # a felt hat with its brim pinned up on three sides: the corners stand out, front and back two
        dome("hat", WHITE, (0, hy + 0.005, top - 0.03), (0.098, 0.108, 0.07), 0.0)
        P.cyl("hat", WHITE, (0, hy + 0.005, top - 0.06), (0, hy + 0.005, top - 0.025), 0.1, 0.098, segs=24)
        def lift(t, a):
            k = 0.25 + 0.75 * abs(math.sin(1.5 * a))
            return k
        rows = ring_rows(0.1, 0.205, 6, 48, lambda t, a, r: top - 0.06 + 0.1 * t ** 1.5 * lift(t, a),
                         lambda t, a, r: 0.1 + 0.105 * t * (1 - 0.55 * lift(t, a) * t), cy=hy + 0.005)
        sheet(P, "hat", rows, thick=0.005, closed=True, col=lambda i, j: (0.8, 0.8, 0.8, 1) if i == 5 else WHITE)
    elif hat == "hat":
        # broad-brimmed, the crown high and rounded, a band round it
        dome("hat", WHITE, (0, hy, top + 0.09), (0.098, 0.102, 0.04), 0.0)
        P.cyl("hat", WHITE, (0, hy, top - 0.04), (0, hy, top + 0.09), 0.105, 0.098, segs=24)
        rows = ring_rows(0.1, 0.21, 5, 40, lambda t, a, r: top - 0.04 - 0.012 * t * t * (0.5 + 0.5 * math.cos(2 * a)), cy=hy)
        sheet(P, "hat", rows, thick=0.006, closed=True)
        P.cyl("leather", WHITE, (0, hy, top - 0.035), (0, hy, top - 0.005), 0.107, 0.104, segs=24)
        P.box("metal", WHITE, (0, hy - 0.106, top - 0.02), (0.022, 0.006, 0.02))
    elif hat == "cap":
        # a knitted cap, soft, its crown slumped back, the edge rolled
        b = newbm()
        bmesh.ops.create_uvsphere(b, u_segments=24, v_segments=12, radius=1)
        bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z < -0.15], context="VERTS")
        for v in b.verts:
            X, Y, Z = v.co
            v.co = Vector((X * (RX + 0.014), Y * (RY + 0.014) + 0.025 * max(0, Z) ** 2, Z * (0.085) + 0.02 * max(0, Z) ** 3))
        paint_verts(b, lambda v: tuple([0.85 + 0.15 * abs(math.sin(math.atan2(v.co.x, v.co.y) * 20))] * 3) + (1,))
        bmesh.ops.transform(b, verts=b.verts, matrix=Matrix.LocRotScale(hc + Vector((0, 0.008, 0.045)), Euler((-0.25, 0, 0)), Vector((1, 1, 1))))
        merge(b, "hat")
        P.cyl("hat", WHITE, (0, hc.y + 0.005, hc.z + 0.03), (0, hc.y + 0.02, hc.z + 0.065), RX + 0.02, RX + 0.017, segs=24)
    elif hat == "bonnet":
        # a close linen coif over the hair, a frill round the face
        b = hair_shell(RX, RY, RZ, 32, 22, lambda X, Y, Z, phi: smooth((Z - piecewise([(0, 0.62), (1.0, 0.45), (1.4, -0.1), (2.0, -0.35), (PI, -0.45)], abs(phi))) / 0.04),
                       lambda X, Y, Z: 0.02 + 0.008 * smooth(-Y), 0.0, lambda r_, m_, Z: (0.95, 0.94, 0.92, 1))
        merge(b, "hat")
        COIF = [(0, 0.62), (1.0, 0.45), (1.4, -0.1), (2.0, -0.35), (PI, -0.45)]
        b = newbm()
        rows_v = []
        n = 40
        for i in range(n + 1):
            phi = -1.75 + 3.5 * i / n
            Z = piecewise(COIF, abs(phi)); h = math.sqrt(max(0.0, 1 - Z * Z))
            X, Y = math.sin(phi) * h, -math.cos(phi) * h
            nrm = Vector((X, Y, Z))
            cen = hc + Vector((X * RX, Y * RY, Z * RZ)) + nrm * 0.024
            w = 0.011 + 0.003 * abs(math.sin(i * 1.9))
            rows_v.append((cen, nrm, w))
        frame = []
        for i, (cen, nrm, w) in enumerate(rows_v):
            tg = (rows_v[min(n, i + 1)][0] - rows_v[max(0, i - 1)][0]).normalized()
            bn = tg.cross(nrm).normalized()
            frame.append([b.verts.new(cen + (nrm * math.cos(j / 6 * 2 * PI) + bn * math.sin(j / 6 * 2 * PI)) * w) for j in range(6)])
        rows_v = frame
        for i in range(n):
            for j in range(6):
                b.faces.new((rows_v[i][j], rows_v[i][(j + 1) % 6], rows_v[i + 1][(j + 1) % 6], rows_v[i + 1][j]))
        paint_verts(b, lambda v: (0.97, 0.96, 0.94, 1))
        merge(b, "hat")
    elif hat == "helmet":
        # a morion: the high crest, the brim swept up into points front and back
        dome("hat", WHITE, (0, hy, top - 0.05), (0.11, 0.128, 0.125), 0.0)
        dome("hat", WHITE, (0, hy, top - 0.03), (0.011, 0.116, 0.2), 0.0, 16, 10)
        rows = ring_rows(0.108, 0.168, 6, 48, lambda t, a, r: top - 0.055 + 0.17 * t ** 1.3 * math.cos(a) ** 2 + 0.03 * t * math.sin(a) ** 2, lambda t, a, r: r * (1 + 0.45 * math.cos(a) ** 2 * t), cy=hy)
        sheet(P, "hat", rows, thick=0.005, closed=True, col=lambda i, j: (0.82, 0.82, 0.84, 1) if i == 5 else WHITE)
        # (a rolled edge, and a row of brass rivets round the skull)
        for i in range(14):
            a = i / 14 * 2 * PI
            P.sphere("metal", WHITE, (math.sin(a) * 0.108, hy - math.cos(a) * 0.126, top - 0.045), (0.006, 0.006, 0.006), segs=6, rings=4)
    elif hat == "furhat":
        # a shapeless cap of fur, pulled down to the brows
        b = hair_shell(RX, RY, RZ, 32, 22, lambda X, Y, Z, phi: smooth((Z - piecewise([(0, 0.5), (1.2, 0.3), (1.6, 0.0), (PI, -0.25)], abs(phi))) / 0.05),
                       lambda X, Y, Z: 0.026 + 0.012 * smooth(Z), 0.0, lambda r_, m_, Z: tuple([0.7 + 0.35 * rnd.random()] * 3) + (1,))
        for v in b.verts:
            v.co += (v.co - hc).normalized() * 0.006 * rnd.random()
        merge(b, "hat")

    extra = P.build(sc, M)
    bake_ao(sc, [body] + extra)

    # ---- the rig ----
    arm = bpy.data.armatures.new(f"{key}_rig")
    rig = bpy.data.objects.new(f"{key}_rig", arm)
    sc.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    def bone(name, a, b, parent=None, conn=False):
        x = eb.new(name)
        x.head, x.tail = Vector(a), Vector(b)
        x.roll = 0
        if parent:
            x.parent = eb[parent]
            x.use_connect = conn
        return x
    bone("root", (0, 0, 0), (0, 0.2, 0))
    bone("hips", J["pelvis"], J["spine"], "root")
    bone("spine", J["spine"], J["chest"], "hips", True)
    bone("chest", J["chest"], J["neck"], "spine", True)
    bone("neck", J["neck"], J["head"], "chest", True)
    bone("head", J["head"], (0, hy, H), "neck", True)
    for s in "LR":
        bone(f"shoulder.{s}", J["chest"], J[f"shoulder.{s}"], "chest")
        bone(f"upper_arm.{s}", J[f"shoulder.{s}"], J[f"elbow.{s}"], f"shoulder.{s}", True)
        bone(f"forearm.{s}", J[f"elbow.{s}"], J[f"wrist.{s}"], f"upper_arm.{s}", True)
        bone(f"hand.{s}", J[f"wrist.{s}"], J[f"hand.{s}"], f"forearm.{s}", True)
        bone(f"thigh.{s}", J[f"hip.{s}"], J[f"knee.{s}"], "hips")
        bone(f"shin.{s}", J[f"knee.{s}"], J[f"ankle.{s}"], f"thigh.{s}", True)
        bone(f"foot.{s}", J[f"ankle.{s}"], J[f"toe.{s}"], f"shin.{s}", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)

    # the body is weighted by heat; head, hair, hat and the like ride the head bone rigidly
    for ob in [body]:
        ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    for ob in list(sc.objects):
        ob.select_set(False)
    clean_arms(body, J, n_trunk)
    for ob in extra:
        vg_assign(ob, rig, hc, J, f, body, n_trunk)

    animate(rig, key, f, J)
    objs = [rig, body] + extra
    path = os.path.join(MODELS, f"{key}.glb")
    for ob in sc.objects:
        ob.select_set(ob in objs)
    bpy.context.view_layer.objects.active = rig
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True,
              export_animations=True, export_materials="EXPORT", export_skins=True)
    for opt in (dict(export_animation_mode="NLA_TRACKS", export_vertex_color="ACTIVE", export_all_vertex_colors=False),
                dict(export_nla_strips=True, export_vertex_color="ACTIVE"), {}):
        try:
            bpy.ops.export_scene.gltf(**kw, **opt)
            break
        except TypeError:
            continue
    return path


def seg_dist(p, a, b):
    a, b = Vector(a), Vector(b); ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


ARM_BONES = ("shoulder", "upper_arm", "forearm", "hand")


def limb_of(p, J):
    """Which the point belongs to: ("arm", side) if it lies on an arm or hand; ("trunk", None) if it is the body, the
    legs or something worn on them, which must never be pulled along by a hand hanging beside it; or None round the
    shoulders, where the arm and the chest blend."""
    p = Vector(p)
    s = "L" if p.x > 0 else "R"
    if (p - Vector(J[f"shoulder.{s}"])).length < 0.1:
        return None
    chain = [J[f"shoulder.{s}"], J[f"elbow.{s}"], J[f"wrist.{s}"], J[f"hand.{s}"], tuple(Vector(J[f"hand.{s}"]) + Vector((0, 0, -0.11)))]
    d_arm = min(seg_dist(p, a, b) for a, b in zip(chain, chain[1:]))
    d_leg = seg_dist(p, J[f"hip.{s}"], J[f"knee.{s}"]) / 0.09
    d_trunk = seg_dist(p, J["pelvis"], J["neck"]) / 0.17
    if d_arm < 0.085 and d_arm / 0.06 < min(d_leg, d_trunk):
        return ("arm", s)
    return ("trunk", None)


def arm_only(weights, s, z):
    """an arm's weights, with anything from the trunk or the legs taken out"""
    keep = {n: w for n, w in weights.items() if n in tuple(f"{b}.{s}" for b in ARM_BONES)}
    if not keep:
        keep = {(f"hand.{s}" if z < 0.93 else f"forearm.{s}" if z < 1.16 else f"upper_arm.{s}"): 1.0}
    t = sum(keep.values())
    return {n: w / t for n, w in keep.items()}


def trunk_only(weights, z):
    """the body's weights, with the arms' taken out"""
    keep = {n: w for n, w in weights.items() if n.split(".")[0] not in ARM_BONES}
    if not keep:
        keep = {("hips" if z < 1.0 else "spine" if z < 1.25 else "chest"): 1.0}
    t = sum(keep.values())
    return {n: w / t for n, w in keep.items()}


def limb_weights(weights, p, J):
    k = limb_of(p, J)
    if not k:
        return weights
    return arm_only(weights, k[1], p[2]) if k[0] == "arm" else trunk_only(weights, p[2])


def clean_arms(body, J, n_trunk):
    """the body's own skin, after automatic weighting: the arms' skin follows the arm alone, and the trunk's nothing of
    the arms (but round the shoulders, where they blend)"""
    vg = {g.index: g for g in body.vertex_groups}
    byname = {g.name: g for g in body.vertex_groups}
    for v in body.data.vertices:
        w = {vg[x.group].name: x.weight for x in v.groups if x.group in vg}
        s = "L" if v.co.x > 0 else "R"
        if v.index >= n_trunk:
            new = arm_only(w, s, v.co.z)
        elif (v.co - Vector(J[f"shoulder.{s}"])).length < 0.1:
            continue
        else:
            new = trunk_only(w, v.co.z)
        if new is w:
            continue
        for n in w:
            if n not in new:
                byname[n].remove([v.index])
        for n, wt in new.items():
            if n not in byname:
                byname[n] = body.vertex_groups.new(name=n)
            byname[n].add([v.index], wt, "REPLACE")


def vg_assign(ob, rig, hc, J, f, body, n_trunk):
    """Weight a piece of clothing to the bones the body under it follows: each vertex takes the skin
    weights of the nearest point on the body, so a coat bends with the torso it covers and a cuff with
    its forearm. Above the neck everything rides the head; skirts hang from the hips and swing with
    the thighs rather than splitting between the legs."""
    from mathutils.bvhtree import BVHTree
    bm_ = body.data
    verts = [v.co.copy() for v in bm_.vertices]
    polys_arm = [p.index for p in bm_.polygons if p.vertices[0] >= n_trunk]
    polys_trunk = [p.index for p in bm_.polygons if p.vertices[0] < n_trunk]
    tree_arm = BVHTree.FromPolygons(verts, [tuple(bm_.polygons[i].vertices) for i in polys_arm])
    tree_trunk = BVHTree.FromPolygons(verts, [tuple(bm_.polygons[i].vertices) for i in polys_trunk])
    names = {g.index: g.name for g in body.vertex_groups}
    vw = [{names[x.group]: x.weight for x in v.groups if x.group in names} for v in bm_.vertices]
    me = ob.data
    piece = ob.name.split("_", 1)[1]
    groups = {}
    def g(n):
        if n not in groups:
            groups[n] = ob.vertex_groups.new(name=n)
        return groups[n]
    # each separate piece (a finger, a cuff, a button, a flap) goes wholly with the arm or wholly with the body: with the
    # arm if most of it lies along an arm's bones
    import bmesh as _bm
    bmi = _bm.new(); bmi.from_mesh(me); bmi.verts.ensure_lookup_table()
    island = [-1] * len(bmi.verts); arm_island = {}
    for v0 in bmi.verts:
        if island[v0.index] >= 0: continue
        k = len(arm_island); stack = [v0]; island[v0.index] = k; members = []
        while stack:
            v1 = stack.pop(); members.append(v1.co.copy())
            for e in v1.link_edges:
                o = e.other_vert(v1)
                if island[o.index] < 0: island[o.index] = k; stack.append(o)
        cen = sum(members, Vector()) / len(members)
        s_ = "L" if cen.x > 0 else "R"
        chain = [J[f"shoulder.{s_}"], J[f"elbow.{s_}"], J[f"wrist.{s_}"], J[f"hand.{s_}"], tuple(Vector(J[f"hand.{s_}"]) + Vector((0, 0, -0.11)))]
        near = sum(1 for m in members if min(seg_dist(m, a, b) for a, b in zip(chain, chain[1:])) < 0.075 and (m - Vector(J[f"shoulder.{s_}"])).length > 0.1)
        arm_island[k] = s_ if near > 0.6 * len(members) else None
    bmi.free()
    for v in me.vertices:
        x, y, z = v.co
        ax = abs(x)
        side = "L" if x > 0 else "R"
        if z > 1.52:
            g("head").add([v.index], 1.0, "REPLACE")
            continue
        on_arm = arm_island[island[v.index]]
        if piece in ("skirt", "apron") or (piece == "coat" and z < 0.93 and ax < 0.3 and abs(y) < 0.3 and z > 0.35):
            k = max(0.0, min(1.0, (0.93 - z) / 0.5)) * min(1.0, ax / 0.12) * 0.75
            g("hips").add([v.index], 1 - k, "REPLACE")
            if k > 0:
                g(f"thigh.{side}").add([v.index], k, "REPLACE")
            continue
        # (what is worn on an arm — a cuff, a finger — goes with the arm; anything else with the body, though a hand hangs
        # beside it)
        la, na, fa, da = tree_arm.find_nearest(v.co)
        lt, nt, ft, dt = tree_trunk.find_nearest(v.co)
        if fa is not None and (on_arm or ft is None):
            loc, fi = la, polys_arm[fa]
        elif ft is not None:
            loc, fi = lt, polys_trunk[ft]
        else:
            fi = None
        if fi is None:
            g("hips").add([v.index], 1.0, "REPLACE")
            continue
        # blend the weights of the nearest face's corners by how close each corner is
        poly = bm_.polygons[fi]
        acc, tot = {}, 0.0
        for vi in poly.vertices:
            d = (bm_.vertices[vi].co - loc).length
            wgt = 1.0 / (d + 1e-4)
            tot += wgt
            for n, wv in vw[vi].items():
                acc[n] = acc.get(n, 0.0) + wv * wgt
        if not acc:
            g("hips").add([v.index], 1.0, "REPLACE")
            continue
        s_ = sum(acc.values())
        acc = {n: wv / s_ for n, wv in acc.items()}
        acc = arm_only(acc, on_arm, z) if on_arm else acc if (v.co - Vector(J[f"shoulder.{side}"])).length < 0.1 else trunk_only(acc, z)
        for n, wv in acc.items():
            if wv > 0.02:
                g(n).add([v.index], wv, "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    ob.parent = rig


# ---------------------------------------------------------------------------
#  animation: every action is a list of keys, each {frame: {bone: (x, y, z) radians}}
# ---------------------------------------------------------------------------
def animate(rig, key, f, J):
    rig.animation_data_create()
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = "XYZ"

    def act(name, frames, loc=None):
        a = bpy.data.actions.new(name)
        a.use_fake_user = True
        rig.animation_data.action = a
        for fr, pose in frames.items():
            for b in pb:
                r = pose.get(b.name, (0, 0, 0))
                b.rotation_euler = Euler(r, "XYZ")
                b.keyframe_insert("rotation_euler", frame=fr)
            h = pb["hips"]
            # (a frame without a hip position of its own is left to the curve between its neighbours)
            if loc and fr not in loc: continue
            h.location = Vector(loc[fr]) if loc else Vector((0, 0, 0))
            h.keyframe_insert("location", frame=fr)
        tr = rig.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, int(min(frames)), a)
        rig.animation_data.action = None
        return a

    def mirror(p):
        """left and right swapped, and swings reversed"""
        out = {}
        for k, (x, y, z) in p.items():
            if k.endswith(".L"): out[k[:-2] + ".R"] = (x, -y, -z)
            elif k.endswith(".R"): out[k[:-2] + ".L"] = (x, -y, -z)
            else: out[k] = (x, -y, -z)
        return out

    # arms hang a little away from the body
    rest = {"upper_arm.L": (0, 0, 0.08), "upper_arm.R": (0, 0, -0.08), "forearm.L": (-0.12, 0, 0), "forearm.R": (-0.12, 0, 0)}
    def P(**kw):
        d = dict(rest)
        for k, v in kw.items():
            d[k.replace("_L", ".L").replace("_R", ".R")] = v
        return d

    def linear(a):
        """cycles play at an even pace: no easing in and out at every key (it made the walk stop and start)"""
        bags = []
        try:
            bags = [a.fcurves]
        except AttributeError:
            pass
        try:
            for layer in a.layers:
                for st in layer.strips:
                    for cb in st.channelbags:
                        bags.append(cb.fcurves)
        except AttributeError:
            pass
        for fcs in bags:
            for fc in fcs:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"

    def cycle(name, n_frames, pose_at, bob, steps=16):
        frames, loc = {}, {}
        for i in range(steps + 1):
            t = i / steps
            fr = 1 + round(t * n_frames)
            frames[fr] = pose_at(t)
            loc[fr] = bob(t)
        a = act(name, frames, loc)
        linear(a)
        return a

    # Idle: four seconds of breathing — the chest and shoulders rise and settle — a slow shift of the weight from one
    # foot to the other, and a glance aside
    def idle_at(t):
        br = math.sin(t * 2 * PI * 3)               # three breaths
        sw = math.sin(t * 2 * PI)                   # one shift of weight
        return P(chest=(0.025 * br, 0, 0), spine=(0.01 * br, 0.015 * sw, 0.01 * sw), hips=(0, 0.02 * sw, 0),
                 neck=(-0.015 * br, 0.04 * math.sin(t * 2 * PI * 2 + 1), 0.06 * math.sin(t * 2 * PI + 2)),
                 shoulder_L=(0, 0, -0.02 * br), shoulder_R=(0, 0, 0.02 * br),
                 upper_arm_L=(0.03 * sw, 0, 0.08 + 0.01 * br), upper_arm_R=(-0.03 * sw, 0, -0.08 - 0.01 * br),
                 thigh_L=(0, 0, 0.02 * sw), thigh_R=(0, 0, 0.02 * sw), shin_L=(0.04 * max(0, sw), 0, 0), shin_R=(0.04 * max(0, -sw), 0, 0))
    a = cycle("Idle", 120, idle_at, lambda t: (0.006 * math.sin(t * 2 * PI), 0, -0.004 * abs(math.sin(t * 2 * PI))), 24)

    # Walk and run, sampled sixteen times a stride: the thigh swings; the knee folds while the leg comes through and
    # takes the weight as the foot lands; the foot pushes off and lifts its toe; the hips turn with the leg, the chest
    # turns against them, the head stays level; the arms swing with the forearm following a beat behind
    def gait(amp, knee, arm, lean, fore, foot, sway):
        def leg(p):
            s, c = math.sin(p * 2 * PI), math.cos(p * 2 * PI)
            th = -amp * s
            kn = knee * max(0.0, c) ** 1.3 + 0.12 * knee * max(0.0, math.sin(p * 2 * PI - 0.9)) ** 2 + 0.06
            ft = foot * (0.6 * max(0.0, -math.sin(p * 2 * PI + 0.9)) - 0.5 * max(0.0, c) ** 2)
            return th, kn, ft
        def at(t):
            s = math.sin(t * 2 * PI)
            thL, knL, ftL = leg(t)
            thR, knR, ftR = leg(t + 0.5)
            lagL = math.sin((t - 0.08) * 2 * PI); lagR = -lagL
            return P(thigh_L=(thL - lean * 0.5, 0, 0.02), thigh_R=(thR - lean * 0.5, 0, -0.02),
                     shin_L=(knL, 0, 0), shin_R=(knR, 0, 0), foot_L=(ftL, 0, 0), foot_R=(ftR, 0, 0),
                     upper_arm_L=(arm * s, 0, 0.08 + 0.02 * abs(s)), upper_arm_R=(-arm * s, 0, -0.08 - 0.02 * abs(s)),
                     forearm_L=(-fore - 0.45 * arm * max(0.0, lagL), 0, 0), forearm_R=(-fore - 0.45 * arm * max(0.0, lagR), 0, 0),
                     hips=(0, sway * math.cos(t * 2 * PI), 0.07 * s), spine=(lean, 0, 0.02 * s), chest=(0.02 * lean, 0, -0.11 * s),
                     neck=(-lean * 0.6, 0, 0.05 * s))
        return at
    walk_at = gait(amp=0.45, knee=0.75, arm=0.3, lean=0.03, fore=0.22, foot=0.35, sway=0.035)
    cycle("Walk", 32, walk_at, lambda t: (0, 0, 0.022 * abs(math.cos(t * 2 * PI)) - 0.008))
    run_at = gait(amp=0.8, knee=1.35, arm=0.62, lean=0.2, fore=1.15, foot=0.5, sway=0.02)
    cycle("Run", 20, run_at, lambda t: (0, 0, 0.055 * abs(math.cos(t * 2 * PI)) - 0.02))

    # Sit: on a bench, hands on the knees, still breathing
    def sit_at(t):
        br = math.sin(t * 2 * PI * 2)
        return P(thigh_L=(-1.5, 0, 0.05), thigh_R=(-1.5, 0, -0.05), shin_L=(1.5, 0, 0), shin_R=(1.5, 0, 0), upper_arm_L=(-0.5, 0, 0.1), upper_arm_R=(-0.5, 0, -0.1),
                 forearm_L=(-0.6, 0, 0), forearm_R=(-0.6, 0, 0), spine=(0.08 + 0.01 * br, 0, 0), chest=(0.02 * br, 0, 0), neck=(0, 0.05 * math.sin(t * 2 * PI + 1), 0))
    cycle("Sit", 100, sit_at, lambda t: (0, 0, -0.44), 8)

    # Chop: a slow wind-up to the right, the weight back on the back foot; a fast level sweep through; the follow-through
    # carrying round to the left; and back to the guard
    arms_up = dict(upper_arm_L=(-1.35, 0, -0.35), upper_arm_R=(-1.35, 0, 0.35), forearm_L=(-0.25, 0, 0), forearm_R=(-0.25, 0, 0))
    def chop(spz, chz, sx=0.08, kL=0.1, kR=0.1, up=0.0):
        a2 = dict(arms_up); a2["upper_arm_L"] = (-1.35 - up, 0, -0.35); a2["upper_arm_R"] = (-1.35 - up, 0, 0.35)
        return P(**a2, spine=(sx, 0, spz), chest=(0, 0, chz), shin_L=(kL, 0, 0), shin_R=(kR, 0, 0), thigh_L=(-kL * 0.5, 0, 0), thigh_R=(-kR * 0.5, 0, 0), neck=(0, 0, -chz * 0.4))
    # (anticipation and weight: the hips shift back as the axe goes up, it hangs a moment at the top, comes through
    # fast, jars on the wood, and the body follows it round before settling back to the guard)
    act("Chop", {1: chop(0, 0), 6: chop(-0.22, -0.15, kR=0.15, up=0.05), 12: chop(-0.6, -0.5, kR=0.32, up=0.22), 14: chop(-0.64, -0.54, kR=0.34, up=0.25),
                 16: chop(0.05, 0.02, sx=0.12, kL=0.2), 17: chop(0.4, 0.34, sx=0.16, kL=0.32), 18: chop(0.34, 0.28, sx=0.15, kL=0.3),
                 22: chop(0.58, 0.45, sx=0.12, kL=0.25), 27: chop(0.2, 0.15, sx=0.1), 32: chop(0, 0)},
        {1: (0, 0, 0), 12: (0, 0.035, -0.012), 14: (0, 0.04, -0.015), 17: (0, -0.03, -0.02), 22: (0, -0.02, -0.01), 32: (0, 0, 0)})

    # the story's poses: held, but breathing — never quite still
    def hold(name, **kw):
        base = P(**kw)
        def at(t):
            p = dict(base); br = math.sin(t * 2 * PI * 2)
            c = p.get("chest", (0, 0, 0)); p["chest"] = (c[0] + 0.02 * br, c[1], c[2])
            nk = p.get("neck", (0, 0, 0)); p["neck"] = (nk[0] - 0.012 * br, nk[1] + 0.03 * math.sin(t * 2 * PI + 0.5), nk[2])
            return p
        cycle(name, 90, at, lambda t: (0, 0, -0.003 * abs(math.sin(t * 2 * PI * 2))), 8)
    hold("Torch", upper_arm_R=(-1.25, 0, -0.15), forearm_R=(-0.3, 0, 0))
    hold("Lantern", upper_arm_R=(-0.35, 0, -0.1), forearm_R=(-0.4, 0, 0))
    hold("Hold", upper_arm_L=(-0.5, 0, 0.15), upper_arm_R=(-0.5, 0, -0.15), forearm_L=(-1.0, 0, 0), forearm_R=(-1.0, 0, 0))
    hold("Writ", upper_arm_L=(-0.9, 0, 0.2), upper_arm_R=(-0.9, 0, -0.2), forearm_L=(-0.9, 0, 0), forearm_R=(-0.9, 0, 0), neck=(0.25, 0, 0))
    hold("Point", upper_arm_R=(-1.5, 0, -0.1), forearm_R=(0, 0, 0))
    hold("ArmsCrossed", upper_arm_L=(-0.5, 0, 0.35), upper_arm_R=(-0.5, 0, -0.35), forearm_L=(-1.6, 0, -0.9), forearm_R=(-1.6, 0, 0.9))
    hold("Bound", upper_arm_L=(0.45, 0, 0.2), upper_arm_R=(0.45, 0, -0.2), forearm_L=(-0.6, 0, 0.5), forearm_R=(-0.6, 0, -0.5), neck=(0.2, 0, 0))
    hold("Grieve", upper_arm_L=(-1.2, 0, 0.5), upper_arm_R=(-1.2, 0, -0.5), forearm_L=(-1.9, 0, 0), forearm_R=(-1.9, 0, 0), neck=(0.45, 0, 0), spine=(0.2, 0, 0))
    hold("Reach", upper_arm_L=(-1.4, 0, 0.1), upper_arm_R=(-1.4, 0, -0.1))
    # Hammer: lift it slowly, bring it down fast, a little bounce off the work, and the body leaning into it
    def ham(ua, fa, sp=0.35, kn=0.08):
        return P(upper_arm_R=(ua, 0, -0.1), forearm_R=(fa, 0, 0), upper_arm_L=(-0.6, 0, 0.12), forearm_L=(-0.9, 0, 0), spine=(sp, 0, 0), shin_L=(kn, 0, 0), shin_R=(kn, 0, 0), thigh_L=(-kn * 0.5, 0, 0), thigh_R=(-kn * 0.5, 0, 0))
    act("Hammer", {1: ham(-1.0, -1.2), 8: ham(-2.15, -0.55, 0.3, 0.04), 10: ham(-0.95, -1.25, 0.42, 0.14), 11: ham(-1.08, -1.15, 0.4, 0.12), 16: ham(-1.0, -1.2)})
    # Punch: fists up in a guard, the weight rocking; a jab with the right that snaps out and back, a heavier cross with
    # the left that turns the shoulders into it, and back to the guard
    def guard(jR=0.0, jL=0.0, tw=0.0, bob=0.0):
        return P(upper_arm_R=(-0.95 - 0.55 * jR, 0, -0.28 + 0.2 * jR), forearm_R=(-1.75 + 1.6 * jR, 0, 0),
                 upper_arm_L=(-0.95 - 0.55 * jL, 0, 0.28 - 0.2 * jL), forearm_L=(-1.75 + 1.6 * jL, 0, 0),
                 spine=(0.12 + 0.04 * (jR + jL), 0, tw), chest=(0, 0, tw * 0.8), neck=(-0.1, 0, -tw * 0.5),
                 thigh_L=(-0.25, 0, 0.05), thigh_R=(0.15, 0, -0.05), shin_L=(0.3 + bob, 0, 0), shin_R=(0.2 + bob, 0, 0))
    act("Punch", {1: guard(), 4: guard(tw=0.12, bob=0.05), 6: guard(jR=1, tw=-0.25), 8: guard(jR=0.2, tw=-0.05), 11: guard(tw=-0.15, bob=0.06),
                  14: guard(jL=1, tw=0.4), 17: guard(jL=0.2, tw=0.1), 22: guard()},
        {1: (0, 0, -0.03), 6: (0, -0.04, -0.035), 11: (0, 0.02, -0.04), 14: (0, -0.06, -0.035), 22: (0, 0, -0.03)})

    # Eat: sat at a table, the spoon from the bowl to the mouth, a chew, and again
    def eat_at(t):
        k = max(0.0, math.sin(t * 2 * PI * 3)) ** 1.5           # three spoonfuls
        br = math.sin(t * 2 * PI * 2)
        return P(thigh_L=(-1.5, 0, 0.05), thigh_R=(-1.5, 0, -0.05), shin_L=(1.5, 0, 0), shin_R=(1.5, 0, 0),
                 upper_arm_L=(-0.55, 0, 0.12), forearm_L=(-1.0, 0, 0),
                 upper_arm_R=(-0.6 - 0.55 * k, 0, -0.12 - 0.15 * k), forearm_R=(-1.0 - 1.1 * k, 0, 0),
                 spine=(0.16 - 0.06 * k + 0.01 * br, 0, 0), chest=(0.02 * br, 0, 0), neck=(0.12 - 0.12 * k, 0, 0.02 * math.sin(t * 2 * PI * 9) * k))
    cycle("Eat", 108, eat_at, lambda t: (0, 0, -0.44), 24)

    # Stir: leaning over a pot, both hands on the ladle, going round and round
    def stir_at(t):
        a = t * 2 * PI * 2
        return P(upper_arm_R=(-0.75 + 0.14 * math.sin(a), 0, -0.12 + 0.16 * math.cos(a)), forearm_R=(-0.85 - 0.12 * math.cos(a), 0, 0),
                 upper_arm_L=(-0.6 + 0.1 * math.sin(a), 0, 0.2 + 0.1 * math.cos(a)), forearm_L=(-1.0, 0, 0),
                 spine=(0.22, 0, 0.04 * math.sin(a)), chest=(0.04, 0, 0.05 * math.sin(a)), neck=(0.25, 0, 0),
                 shin_L=(0.08, 0, 0), shin_R=(0.08, 0, 0), thigh_L=(-0.04, 0, 0), thigh_R=(-0.04, 0, 0))
    cycle("Stir", 64, stir_at, lambda t: (0, 0, -0.01), 24)

    # Talk: standing easy, a hand opening as they make a point, a nod, the weight shifting
    def talk_at(t):
        g = max(0.0, math.sin(t * 2 * PI * 2)) ** 1.2          # two gestures
        sw = math.sin(t * 2 * PI)
        return P(upper_arm_R=(-0.35 - 0.55 * g, 0, -0.1 - 0.2 * g), forearm_R=(-0.6 - 0.5 * g, 0, -0.3 * g),
                 upper_arm_L=(0.03 * sw, 0, 0.08), forearm_L=(-0.15, 0, 0),
                 spine=(0.02, 0.02 * sw, 0.03 * g), chest=(0.02 * math.sin(t * 2 * PI * 3), 0, 0.04 * g),
                 neck=(0.08 * math.sin(t * 2 * PI * 4) * (0.4 + g), 0.04 * sw, 0.1 * math.sin(t * 2 * PI + 1)),
                 thigh_L=(0, 0, 0.02 * sw), thigh_R=(0, 0, 0.02 * sw))
    cycle("Talk", 120, talk_at, lambda t: (0.005 * math.sin(t * 2 * PI), 0, 0), 24)

    # Guard: squared up to someone, the weapon (or the fists) up and ready, knees soft, the weight rocking from foot to
    # foot and the body never still: the stance between blows in a fight
    def guard_at(t):
        sw = math.sin(t * 2 * PI * 2); br = math.sin(t * 2 * PI * 3)
        return P(upper_arm_R=(-1.05 + 0.05 * sw, 0, -0.3), forearm_R=(-1.45, 0, 0), upper_arm_L=(-0.85 - 0.04 * sw, 0, 0.3), forearm_L=(-1.55, 0, 0),
                 spine=(0.16 + 0.015 * br, 0.03 * sw, 0.05), chest=(0.01 * br, 0, -0.06), neck=(-0.14, 0, 0.04 * sw),
                 thigh_L=(-0.32, 0, 0.12), thigh_R=(0.12, 0, -0.12), shin_L=(0.42 + 0.06 * sw, 0, 0), shin_R=(0.3 - 0.06 * sw, 0, 0),
                 foot_L=(-0.1, 0, 0), foot_R=(-0.12, 0, 0))
    cycle("Guard", 64, guard_at, lambda t: (0.012 * math.sin(t * 2 * PI * 2), 0, -0.05 + 0.008 * abs(math.sin(t * 2 * PI * 2))), 16)

    # Strafe: stepping sideways round someone with the guard up — the leading foot out, the other drawn in after it,
    # never crossing; played backwards it steps the other way
    def strafe_at(t):
        s1 = math.sin(t * 2 * PI); out = max(0.0, s1); draw = max(0.0, -s1)
        return P(upper_arm_R=(-1.05, 0, -0.3), forearm_R=(-1.45, 0, 0), upper_arm_L=(-0.85, 0, 0.3), forearm_L=(-1.55, 0, 0),
                 spine=(0.16, 0, 0.05 * s1), chest=(0, 0, -0.06), neck=(-0.14, 0, 0),
                 thigh_L=(-0.25 - 0.15 * out, 0, 0.12 + 0.32 * out), thigh_R=(0.05 - 0.15 * draw, 0, -0.12 - 0.12 * draw),
                 shin_L=(0.4 + 0.35 * out, 0, 0), shin_R=(0.32 + 0.35 * draw, 0, 0), foot_L=(-0.15 * out, 0, 0), foot_R=(-0.15 * draw, 0, 0),
                 hips=(0, 0, 0.06 * s1))
    a = cycle("Strafe", 24, strafe_at, lambda t: (0.03 * math.sin(t * 2 * PI), 0, -0.05 + 0.02 * abs(math.sin(t * 2 * PI))), 16)

    # Overhead: the weapon raised high behind the head, a breath at the top, brought straight down hard, and back up to guard
    def over(ua, fa, sp, kn=0.25):
        return P(upper_arm_R=(ua, 0, -0.12), upper_arm_L=(ua + 0.05, 0, 0.12), forearm_R=(fa, 0, 0), forearm_L=(fa, 0, 0),
                 spine=(sp, 0, 0), chest=(sp * 0.3, 0, 0), neck=(-sp * 0.4, 0, 0),
                 thigh_L=(-0.3 - kn * 0.3, 0, 0.1), thigh_R=(0.1, 0, -0.1), shin_L=(0.35 + kn * 0.4, 0, 0), shin_R=(0.3, 0, 0))
    act("Overhead", {1: over(-1.05, -1.45, 0.16), 7: over(-2.75, -0.9, -0.18, 0.15), 10: over(-2.85, -0.85, -0.22, 0.15), 13: over(-1.1, -0.15, 0.5, 0.55),
                     15: over(-0.95, -0.2, 0.55, 0.6), 22: over(-1.05, -1.45, 0.16)},
        {1: (0, 0, -0.05), 10: (0, 0.04, -0.03), 13: (0, -0.08, -0.12), 15: (0, -0.08, -0.13), 22: (0, 0, -0.05)})

    # Hit: a blow taken — the head snaps back, the body twists away, an arm flies out, a stagger and back
    def hit(k, tw):
        return P(neck=(-0.45 * k, 0, 0.2 * k), spine=(-0.25 * k, 0, tw), chest=(-0.1 * k, 0, tw * 0.8),
                 upper_arm_L=(-0.4 * k, 0, 0.08 + 0.6 * k), upper_arm_R=(-0.6 * k, 0, -0.08 - 0.35 * k), forearm_L=(-0.4 * k - 0.12, 0, 0), forearm_R=(-0.7 * k - 0.12, 0, 0),
                 thigh_L=(0.15 * k, 0, 0), thigh_R=(-0.3 * k, 0, 0), shin_R=(0.4 * k, 0, 0), shin_L=(0.1 * k, 0, 0))
    act("Hit", {1: hit(0, 0), 3: hit(1, -0.25), 6: hit(0.75, -0.15), 12: hit(0.2, 0.0), 16: hit(0, 0)},
        {1: (0, 0, 0), 3: (0, 0.05, -0.02), 8: (0, 0.06, -0.04), 16: (0, 0, 0)})

    # Dig: the spade driven down with the foot, levered back, the earth lifted and thrown aside
    def dig_at(t):
        drive = max(0.0, math.sin(t * 2 * PI)) ; lift = max(0.0, -math.sin(t * 2 * PI)); throw = max(0.0, math.sin(t * 2 * PI * 2 - 2.2)) * lift
        return P(upper_arm_R=(-0.7 - 0.4 * lift, 0, -0.15), forearm_R=(-0.9 + 0.3 * drive, 0, 0), upper_arm_L=(-0.9 - 0.2 * lift, 0, 0.25), forearm_L=(-0.7, 0, 0),
                 spine=(0.45 * drive + 0.2 * lift, 0, 0.35 * throw), chest=(0.1 * drive, 0, 0.2 * throw), neck=(0.2 * drive, 0, 0),
                 thigh_R=(-0.7 * drive, 0, -0.05), shin_R=(0.9 * drive, 0, 0), thigh_L=(-0.15 * lift, 0, 0.05), shin_L=(0.25 + 0.2 * lift, 0, 0))
    cycle("Dig", 56, dig_at, lambda t: (0, 0, -0.03 - 0.05 * max(0.0, math.sin(t * 2 * PI))), 16)

    # Reap: stooped, the sickle swept low from right to left through the stalks, the left hand gathering them
    def reap_at(t):
        s1 = math.sin(t * 2 * PI)
        return P(upper_arm_R=(-1.0, 0, -0.5 + 0.7 * s1), forearm_R=(-0.4, 0, 0), upper_arm_L=(-1.1 - 0.15 * s1, 0, 0.35), forearm_L=(-0.6 - 0.3 * max(0.0, -s1), 0, 0),
                 spine=(0.65, 0, 0.25 * s1), chest=(0.1, 0, 0.15 * s1), neck=(0.3, 0, 0),
                 thigh_L=(-0.45, 0, 0.1), thigh_R=(-0.3, 0, -0.1), shin_L=(0.65, 0, 0), shin_R=(0.55, 0, 0))
    cycle("Reap", 40, reap_at, lambda t: (0.02 * math.sin(t * 2 * PI), 0, -0.12), 16)

    # Sow: walking the strip, a hand into the bag at the hip and the seed cast out wide in an arc
    def sow_at(t):
        c = math.sin(t * 2 * PI); cast = max(0.0, c); dip = max(0.0, -c)
        return P(upper_arm_R=(-0.3 - 0.9 * cast, 0, -0.1 - 0.9 * cast), forearm_R=(-0.6 - 0.3 * dip + 0.4 * cast, 0, 0), upper_arm_L=(-0.4, 0, 0.15), forearm_L=(-1.1, 0, 0),
                 spine=(0.1, 0, -0.18 * cast), chest=(0, 0, -0.12 * cast), neck=(0.05, 0, 0.1 * cast))
    cycle("Sow", 36, sow_at, lambda t: (0, 0, -0.005), 16)

    # stand in the rest pose when nothing plays
    for b in pb:
        b.rotation_euler = Euler((0, 0, 0))
        b.location = Vector((0, 0, 0))


which = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(CAST)
for k in which:
    print("wrote", build_person(k))
