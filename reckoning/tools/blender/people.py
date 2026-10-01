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
    "albers": dict(sex="f", age="old", coat=0x5a4a3a, skirt=0x3e4a5c, apron=0xf0ebe0, hair=0x8a8078, skin=0xe0b898, hat="bonnet", wide=0.1),
    "townsman": dict(sex="m", age="mid", coat=0x5b4a3a, legs=0x3a3028, hair=0x4a3a2a, skin=0xdcb08a, hat="tricorn"),
    "townswoman": dict(sex="f", age="mid", coat=0x6a5a48, skirt=0x4a4038, apron=0xf0ebe0, hair=0x6a4a30, skin=0xe2b894, hat="bonnet"),
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
    if o.get("hat"): mat("hat", rgb(o.get("hatColor", 0x1e1a18 if o["hat"] != "bonnet" else 0xf0ebe0) if o["hat"] != "helmet" else 0x8a8e94), 0.5 if o["hat"] == "helmet" else 0.9, 0.8 if o["hat"] == "helmet" else 0.0)
    if o.get("sash"): mat("sash", rgb(o["sash"]))

    skin = rgb(o["skin"])
    hair = rgb(o["hair"])

    # ---- the skeleton of joints the body grows on (names = bones later) ----
    sh = 0.17 if f else 0.195                 # shoulder half width
    hp = 0.125 if f else 0.105                # hip half width
    stoop = o.get("stoop", 0.0)
    J = {
        "pelvis": (0, 0, 0.93), "spine": (0, 0.0, 1.10), "chest": (0, stoop * 0.3, 1.30), "neck": (0, stoop * 0.6, 1.49), "head": (0, stoop * 0.8, 1.56),
        # the yoke: the breadth across the top of the chest that the shoulders grow out of, so the arms don't hang off a
        # narrow neck like a doll's
        "yoke": (0, stoop * 0.45, 1.405),
        "shoulder.L": (sh, stoop * 0.4, 1.42), "elbow.L": (sh + 0.03, 0.02, 1.16), "wrist.L": (sh + 0.045, -0.01, 0.93), "hand.L": (sh + 0.05, -0.02, 0.84),
        "shoulder.R": (-sh, stoop * 0.4, 1.42), "elbow.R": (-sh - 0.03, 0.02, 1.16), "wrist.R": (-sh - 0.045, -0.01, 0.93), "hand.R": (-sh - 0.05, -0.02, 0.84),
        "hip.L": (hp, 0, 0.90), "knee.L": (hp + 0.005, -0.015, 0.50), "ankle.L": (hp + 0.01, 0.02, 0.085), "toe.L": (hp + 0.01, -0.13, 0.035),
        "hip.R": (-hp, 0, 0.90), "knee.R": (-hp - 0.005, -0.015, 0.50), "ankle.R": (-hp - 0.01, 0.02, 0.085), "toe.R": (-hp - 0.01, -0.13, 0.035),
    }
    # radii: (across, front-to-back)
    wide = o.get("wide", 0.0)
    R = {
        "pelvis": ((0.17 if f else 0.155) + wide, 0.115 + wide * 0.6), "spine": (0.15 + wide * 0.8, 0.1 + wide * 0.6), "chest": ((0.16 if f else 0.18) + wide * 0.5, 0.11),
        "yoke": ((0.15 if f else 0.175) + wide * 0.4, 0.1),
        "neck": (0.052, 0.055), "head": (0.058, 0.06),
        "shoulder": (0.07, 0.068), "elbow": (0.048, 0.048), "wrist": (0.034, 0.03), "hand": (0.042, 0.02),
        "hip": (0.088 if f else 0.085, 0.09), "knee": (0.056, 0.058), "ankle": (0.04, 0.042), "toe": (0.045, 0.03),
    }
    edges = [("pelvis", "spine"), ("spine", "chest"), ("chest", "yoke"), ("yoke", "neck"), ("neck", "head")]
    for s in "LR":
        edges += [("yoke", f"shoulder.{s}"), (f"shoulder.{s}", f"elbow.{s}"), (f"elbow.{s}", f"wrist.{s}"), (f"wrist.{s}", f"hand.{s}"),
                  ("pelvis", f"hip.{s}"), (f"hip.{s}", f"knee.{s}"), (f"knee.{s}", f"ankle.{s}"), (f"ankle.{s}", f"toe.{s}")]
    names = list(J)
    me = bpy.data.meshes.new(f"{key}_body")
    me.from_pydata([J[n] for n in names], [(names.index(a), names.index(b)) for a, b in edges], [])
    body = bpy.data.objects.new(f"{key}_body", me)
    sc.collection.objects.link(body)
    skin_mod = body.modifiers.new("Skin", "SKIN")
    skin_mod.use_smooth_shade = True
    for i, n in enumerate(names):
        base = n.split(".")[0]
        rx, ry = R[base]
        me.skin_vertices[0].data[i].radius = (rx, ry)
    me.skin_vertices[0].data[names.index("pelvis")].use_root = True
    sub = body.modifiers.new("Sub", "SUBSURF")
    sub.levels = 2
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.modifier_apply(modifier="Skin")
    bpy.ops.object.modifier_apply(modifier="Sub")
    body.select_set(False)

    # ---- dress the body: each face gets a material by where it is ----
    bm = bmesh.new()
    bm.from_mesh(me)
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
        if z < 0.13:
            m = "leather"                                   # shoes
        elif arm and z < 0.9:
            m = "skin"                                      # hands
        elif arm and z < 0.97:
            m = "linen"                                     # shirt cuffs
        elif arm:
            m = "coat"
        elif z > 1.49:
            m = "skin"                                      # neck
        elif z > 0.88:
            m = "coat"                                      # body
        elif f:
            m = "stockings" if z < 0.5 else "skin"          # under the skirt nobody looks
        elif z > 0.5:
            m = "legs"                                      # breeches to the knee
        else:
            m = "stockings"
        fc.material_index = idx[m]
        col = skin if m == "skin" else WHITE
        for l in fc.loops:
            l[layer] = col
    bm.to_mesh(me)
    bm.free()
    me.color_attributes.active_color_name = "Col"
    me.color_attributes.render_color_index = 0

    P = Parts(key)
    hz = 1.56 + stoop * 0.0                              # the base of the skull
    hy = stoop * 0.8
    head_h = 0.23
    hc = Vector((0, hy - 0.005, hz + 0.105))             # centre of the head
    # ---- the head: one smooth ellipsoid (no separate jaw, so no chin standing out), every feature set on its surface ----
    SK = (hc, Vector((0.088, 0.1, 0.112)))
    def front(x, z):
        """how far forward (most negative y) the face is at (x, z)"""
        best = 1.0
        for c, r in (SK,):
            u = 1 - ((x - c.x) / r.x) ** 2 - ((z - c.z) / r.z) ** 2
            if u > 0:
                best = min(best, c.y - r.y * math.sqrt(u))
        return best
    P.sphere("skin", skin, SK[0], SK[1], segs=28, rings=18)
    # a slight brow over the eyes (no cheek bumps: faces are smooth there)
    P.sphere("skin", skin, Vector((0, front(0, hc.z + 0.03) + 0.011, hc.z + 0.03)), (0.062, 0.013, 0.011), segs=16, rings=8)
    # the nose: a bridge and a tip
    ny = front(0, hc.z + 0.01)
    P.cyl("skin", skin, (0, ny + 0.004, hc.z + 0.016), (0, ny - 0.018, hc.z - 0.028), 0.008, 0.012 if not f else 0.01, segs=10)
    P.sphere("skin", skin, (0, ny - 0.016, hc.z - 0.031), (0.013, 0.012, 0.01), segs=12, rings=8)
    for s_ in (-1, 1):
        P.sphere("skin", skin, (s_ * 0.01, ny - 0.008, hc.z - 0.035), (0.007, 0.008, 0.006), segs=8, rings=6)
    # lips
    lip = rgb(0xb06e60) if f else rgb(0x9c6452)
    ly = front(0, hc.z - 0.066)
    P.sphere("skin", lip, (0, ly - 0.002, hc.z - 0.062), (0.024 if not f else 0.022, 0.008, 0.0065), segs=14, rings=6)
    P.sphere("skin", lip, (0, ly - 0.001, hc.z - 0.072), (0.021, 0.009, 0.0075), segs=14, rings=6)
    for s_ in (-1, 1):
        ex, ez = s_ * 0.034, hc.z + 0.008
        ey = front(ex, ez)
        P.sphere("skin", skin, (s_ * 0.089, 0.005 + hc.y, hc.z - 0.005), (0.012, 0.022, 0.03), segs=12, rings=8)        # ear
        # the eye in its socket: white, iris, pupil; a lid above and a brow
        P.sphere("eyes", rgb(0xeee8dc), (ex, ey + 0.004, ez), (0.0145, 0.009, 0.0095), segs=14, rings=10)
        iris = rgb(0x5a3a22 if key not in ("brother", "sister") else 0x3e5a7a)
        P.sphere("eyes", iris, (ex, ey - 0.0045, ez), (0.0072, 0.0025, 0.0072), segs=12, rings=8)
        P.sphere("eyes", rgb(0x0c0806), (ex, ey - 0.0062, ez), (0.0034, 0.0012, 0.0034), segs=10, rings=6)
        P.sphere("skin", skin, (ex, ey + 0.001, ez + 0.0085), (0.0165, 0.0095, 0.0055), segs=12, rings=6)             # upper lid
        bz = ez + (0.024 if f else 0.021)
        P.box("hair", hair if not old else rgb(0xc8c4bc), (s_ * 0.036, front(s_ * 0.036, bz) - 0.012, bz), (0.036, 0.007, 0.006 if f else 0.009), (0.2, s_ * (0.12 if f else 0.04), 0))
    # hair: a cap over the crown and back, cut to a hairline at the forehead and in front of the ears
    hcol = hair
    b = P.bm("hair")
    v = bmesh.ops.create_uvsphere(b, u_segments=28, v_segments=18, radius=1)["verts"]
    bmesh.ops.transform(b, matrix=Matrix.LocRotScale(hc + Vector((0, 0.006, 0.01)), Euler((0, 0, 0)), Vector((0.094, 0.106, 0.116))), verts=v)
    face = [fc for fc in {fc for vv in v for fc in vv.link_faces}
            if (fc.calc_center_median().y < hc.y - 0.035 and fc.calc_center_median().z < hc.z + 0.055)
            or (fc.calc_center_median().y < hc.y + 0.02 and fc.calc_center_median().z < hc.z - 0.02)]
    bmesh.ops.delete(b, geom=face, context="FACES")
    v = [vv for vv in v if vv.is_valid]
    P.paint(b, v, hcol)
    if f or o.get("longHair"):
        # it hangs behind the neck and over the shoulders at the back, never round the jaw
        P.sphere("hair", hcol, hc + Vector((0, 0.07, -0.085)), (0.082, 0.048, 0.12), segs=20, rings=12)
        if f and o.get("hat") != "bonnet":
            P.sphere("hair", hcol, hc + Vector((0, 0.1, 0.02)), (0.05, 0.045, 0.05), segs=14, rings=10)             # a bun
    else:
        P.sphere("hair", hcol, hc + Vector((0, 0.045, -0.045)), (0.084, 0.062, 0.074), segs=20, rings=12)
    if o.get("beard"):
        bc = rgb(o["beard"])
        by = front(0, hc.z - 0.09)
        if o.get("beardShort"):
            P.sphere("hair", bc, (0, by + 0.028, hc.z - 0.085), (0.07, 0.04, 0.042), segs=18, rings=10)
        else:
            P.sphere("hair", bc, (0, by + 0.03, hc.z - 0.092), (0.072, 0.042, 0.056), segs=18, rings=10)
            P.sphere("hair", bc, (0, by + 0.004, hc.z - 0.125), (0.04, 0.026, 0.034), segs=14, rings=8)
        P.sphere("hair", bc, (0, ly - 0.004, hc.z - 0.054), (0.034, 0.011, 0.009), segs=14, rings=6)                  # moustache

    # ---- clothes over the body ----
    coatc = WHITE
    if not f:
        # collar and cravat
        P.cyl("linen", WHITE, (0, hy, 1.46), (0, hy, 1.52), 0.068, 0.058, segs=16)
        if o.get("bands"):
            P.box("linen", WHITE, (0, -0.1, 1.42), (0.07, 0.01, 0.12))
        else:
            P.sphere("linen", WHITE, (0, -0.085, 1.43), (0.045, 0.028, 0.06), segs=12, rings=8)
        # the coat's skirts, open at the front, to the knee
        b = P.bm("coat")
        v = bmesh.ops.create_cone(b, cap_ends=False, segments=24, radius1=0.25 + wide, radius2=0.168 + wide, depth=0.5)["verts"]
        bmesh.ops.transform(b, matrix=Matrix.Translation((0, 0.005, 0.66)), verts=v)
        gone = [fc for fc in {fc for vv in v for fc in vv.link_faces} if fc.calc_center_median().y < -0.12 and abs(fc.calc_center_median().x) < 0.07]
        bmesh.ops.delete(b, geom=gone, context="FACES")
        v = [vv for vv in v if vv.is_valid]
        P.paint(b, v, WHITE)
        # a waistcoat showing at the front, buttoned
        if o.get("vest"):
            P.box("vest", WHITE, (0, -0.104, 1.18), (0.15, 0.03, 0.42))
            for i in range(6):
                P.sphere("metal", WHITE, (0, -0.121, 1.36 - i * 0.055), (0.009, 0.006, 0.009), segs=8, rings=6)
        # coat facings and buttons
        for s in (-1, 1):
            P.box("coat", WHITE, (s * 0.1, -0.108, 1.15), (0.05, 0.02, 0.5), (0, s * -0.25, 0))
            for i in range(5):
                P.sphere("metal", WHITE, (s * 0.075, -0.118, 1.34 - i * 0.07), (0.01, 0.007, 0.01), segs=8, rings=6)
        # deep turned-back cuffs
        for s in (-1, 1):
            x0 = s * (sh + 0.04)
            P.cyl("coat", WHITE, (x0, 0.0, 0.97), (x0, -0.005, 1.07), 0.052, 0.058, segs=14)
        # a belt of leather under the coat's waist? (the sash, for the watch)
        if o.get("sash"):
            P.cyl("sash", WHITE, (0, 0, 1.12), (0, 0, 1.18), 0.162, 0.166, segs=20)
            P.box("sash", WHITE, (0.0, -0.02, 1.2), (0.06, 0.24, 0.62), (0.2, 0.62, 0))
        if o.get("chain"):
            b = P.bm("metal")
            v = bmesh.ops.create_circle(b, cap_ends=False, segments=20, radius=0.12)["verts"]
            bmesh.ops.transform(b, matrix=Matrix.LocRotScale(Vector((0, -0.05, 1.34)), Euler((1.15, 0, 0)), Vector((1, 1, 1))), verts=v)
            for i in range(20):
                a = i / 20 * 2 * PI
                P.sphere("metal", WHITE, (math.cos(a) * 0.12, -0.05 - math.sin(a) * 0.12 * math.cos(1.15) * 0.3, 1.34 - math.sin(a) * 0.12 * math.sin(1.15)), (0.012, 0.012, 0.012), segs=6, rings=4)
        # shoes: square toes and a buckle
        for s in (-1, 1):
            P.box("metal", WHITE, (s * (hp + 0.01), -0.12, 0.07), (0.05, 0.01, 0.03))
    else:
        # a laced bodice, a shawl, the full skirt with a darker hem, an apron
        P.cyl("linen", WHITE, (0, hy, 1.45), (0, hy, 1.5), 0.066, 0.058, segs=16)
        b = P.bm("coat")
        v = bmesh.ops.create_cone(b, cap_ends=False, segments=24, radius1=0.24 + wide, radius2=0.14, depth=0.14)["verts"]
        bmesh.ops.transform(b, matrix=Matrix.Translation((0, 0.01, 1.43)), verts=v)
        P.paint(b, v, WHITE)                                                                         # shawl
        for i in range(6):
            P.box("linen", WHITE, (0, -0.118, 1.36 - i * 0.05), (0.05, 0.004, 0.005), (0, 0, 0.5 * (-1) ** i))   # lacing
        b = P.bm("skirt")
        v = bmesh.ops.create_cone(b, cap_ends=False, segments=32, radius1=0.4 + wide, radius2=0.18 + wide, depth=0.88)["verts"]
        for vv in v:                           # folds in the hem
            if vv.co.z < 0:
                a = math.atan2(vv.co.y, vv.co.x)
                k = 1 + 0.045 * math.sin(a * 12)
                vv.co.x *= k; vv.co.y *= k
        bmesh.ops.transform(b, matrix=Matrix.Translation((0, 0.01, 0.5)), verts=v)
        P.paint(b, v, WHITE)
        v = P.cyl("skirt", rgb(0x9a9a9a), (0, 0.01, 0.06), (0, 0.01, 0.12), 0.405 + wide, 0.395 + wide, segs=32, caps=False)
        if o.get("apron"):
            b = P.bm("apron")
            v = bmesh.ops.create_cone(b, cap_ends=False, segments=12, radius1=0.405 + wide, radius2=0.19 + wide, depth=0.72)["verts"]
            bmesh.ops.transform(b, matrix=Matrix.Translation((0, 0.005, 0.58)), verts=v)
            gone = [fc for fc in {fc for vv in v for fc in vv.link_faces} if fc.calc_center_median().y > -0.08]
            bmesh.ops.delete(b, geom=gone, context="FACES")
            v = [vv for vv in v if vv.is_valid]
            P.paint(b, v, WHITE)
            P.cyl("apron", WHITE, (0, 0, 0.93), (0, 0, 0.97), 0.172 + wide, 0.172 + wide, segs=20)

    # ---- hats ----
    hat = o.get("hat")
    top = hc.z + 0.105
    if hat == "tricorn":
        P.cyl("hat", WHITE, (0, hy, top - 0.03), (0, hy, top + 0.06), 0.1, 0.09, segs=18)
        for i in range(3):
            a = i / 3 * 2 * PI - PI / 2
            P.box("hat", WHITE, (math.cos(a) * 0.095, hy + math.sin(a) * 0.095, top - 0.0), (0.2, 0.012, 0.075), (0.25, 0, a + PI / 2))
    elif hat == "hat":
        P.cyl("hat", WHITE, (0, hy, top - 0.03), (0, hy, top - 0.018), 0.19, 0.19, segs=24)
        P.cyl("hat", WHITE, (0, hy, top - 0.02), (0, hy, top + 0.13), 0.1, 0.09, segs=20)
        P.cyl("leather", WHITE, (0, hy, top - 0.015), (0, hy, top + 0.01), 0.102, 0.101, segs=20)
    elif hat == "cap":
        P.sphere("hat", WHITE, (0, hy, top - 0.025), (0.1, 0.11, 0.06), segs=18, rings=10)
        P.box("hat", WHITE, (0, hy - 0.1, top - 0.05), (0.13, 0.07, 0.012), (-0.2, 0, 0))
    elif hat == "bonnet":
        P.sphere("hat", WHITE, (0, hy + 0.012, top - 0.03), (0.105, 0.115, 0.1), segs=20, rings=12)
        P.cyl("hat", WHITE, (0, hy - 0.06, top - 0.02), (0, hy - 0.085, top - 0.03), 0.112, 0.118, segs=20, caps=False)
    elif hat == "helmet":
        P.sphere("hat", WHITE, (0, hy, top - 0.02), (0.11, 0.12, 0.09), segs=20, rings=10)
        P.cyl("hat", WHITE, (0, hy, top - 0.055), (0, hy, top - 0.045), 0.2, 0.2, segs=24)
        P.box("hat", WHITE, (0, hy, top + 0.07), (0.012, 0.2, 0.05))          # the morion's comb

    extra = P.build(sc, M)

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
    for ob in extra:
        vg_assign(ob, rig, hc, J, f, body)

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


def vg_assign(ob, rig, hc, J, f, body):
    """Weight a piece of clothing to the bones the body under it follows: each vertex takes the skin
    weights of the nearest point on the body, so a coat bends with the torso it covers and a cuff with
    its forearm. Above the neck everything rides the head; skirts hang from the hips and swing with
    the thighs rather than splitting between the legs."""
    from mathutils.bvhtree import BVHTree
    bm_ = body.data
    tree = BVHTree.FromPolygons([v.co.copy() for v in bm_.vertices], [tuple(p.vertices) for p in bm_.polygons])
    names = {g.index: g.name for g in body.vertex_groups}
    vw = [{names[x.group]: x.weight for x in v.groups if x.group in names} for v in bm_.vertices]
    me = ob.data
    piece = ob.name.split("_", 1)[1]
    groups = {}
    def g(n):
        if n not in groups:
            groups[n] = ob.vertex_groups.new(name=n)
        return groups[n]
    for v in me.vertices:
        x, y, z = v.co
        ax = abs(x)
        side = "L" if x > 0 else "R"
        if z > 1.52:
            g("head").add([v.index], 1.0, "REPLACE")
            continue
        if piece in ("skirt", "apron") or (piece == "coat" and z < 0.93 and ax < 0.3 and abs(y) < 0.3 and z > 0.35):
            k = max(0.0, min(1.0, (0.93 - z) / 0.5)) * min(1.0, ax / 0.12) * 0.75
            g("hips").add([v.index], 1 - k, "REPLACE")
            if k > 0:
                g(f"thigh.{side}").add([v.index], k, "REPLACE")
            continue
        loc, nrm, fi, dist = tree.find_nearest(v.co)
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
        for n, wv in acc.items():
            if wv / s_ > 0.02:
                g(n).add([v.index], wv / s_, "REPLACE")
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
            h.location = Vector(loc[fr]) if loc and fr in loc else Vector((0, 0, 0))
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

    # Idle: breathing, a little weight shift
    act("Idle", {1: P(chest=(0.02, 0, 0)), 30: P(chest=(-0.015, 0, 0), spine=(0, 0, 0.02)), 60: P(chest=(0.02, 0, 0))})
    # Walk: a stride of 32 frames; thighs swing, knees bend on the pass, arms counter
    def stride(amp, knee, arm, lift):
        a = {}
        for i, t in enumerate((0, 0.25, 0.5, 0.75, 1.0)):
            s = math.sin(t * 2 * PI)
            c = math.cos(t * 2 * PI)
            pose = P(thigh_L=(-amp * s, 0, 0), thigh_R=(amp * s, 0, 0),
                     shin_L=(knee * max(0, c) if s < 0 else knee * 0.2, 0, 0), shin_R=(knee * max(0, -c) if s > 0 else knee * 0.2, 0, 0),
                     upper_arm_L=(arm * s, 0, 0.08), upper_arm_R=(-arm * s, 0, -0.08),
                     forearm_L=(-0.25 - max(0, arm * s) * 0.6, 0, 0), forearm_R=(-0.25 - max(0, -arm * s) * 0.6, 0, 0),
                     spine=(0.04 * lift, 0, 0.06 * s), chest=(0, 0, -0.08 * s))
            a[1 + round(t * 32 / (1 if lift < 2 else 1.6))] = pose
        return a
    walk = stride(0.42, 0.55, 0.32, 1)
    act("Walk", walk, {k: (0, 0, 0.018 * abs(math.cos((k - 1) / 32 * 2 * PI))) for k in walk})
    run = {}
    for i, t in enumerate((0, 0.25, 0.5, 0.75, 1.0)):
        s = math.sin(t * 2 * PI); c = math.cos(t * 2 * PI)
        run[1 + round(t * 20)] = P(thigh_L=(-0.75 * s - 0.15, 0, 0), thigh_R=(0.75 * s - 0.15, 0, 0),
                                   shin_L=(1.0 * max(0, c) + 0.3, 0, 0), shin_R=(1.0 * max(0, -c) + 0.3, 0, 0),
                                   upper_arm_L=(0.6 * s, 0, 0.12), upper_arm_R=(-0.6 * s, 0, -0.12),
                                   forearm_L=(-1.2, 0, 0), forearm_R=(-1.2, 0, 0), spine=(0.18, 0, 0.08 * s), chest=(0.05, 0, -0.1 * s))
    act("Run", run, {k: (0, 0, 0.04 * abs(math.cos((k - 1) / 20 * 2 * PI))) for k in run})
    # Sit: on a bench, hands on the knees
    sit = P(thigh_L=(-1.5, 0, 0.05), thigh_R=(-1.5, 0, -0.05), shin_L=(1.5, 0, 0), shin_R=(1.5, 0, 0), upper_arm_L=(-0.5, 0, 0.1), upper_arm_R=(-0.5, 0, -0.1), forearm_L=(-0.6, 0, 0), forearm_R=(-0.6, 0, 0), spine=(0.08, 0, 0))
    act("Sit", {1: sit, 30: sit}, {1: (0, 0, -0.44), 30: (0, 0, -0.44)})
    # Chop: wind back to the right, sweep level, follow round to the left; 30 frames
    arms_up = dict(upper_arm_L=(-1.35, 0, -0.35), upper_arm_R=(-1.35, 0, 0.35), forearm_L=(-0.25, 0, 0), forearm_R=(-0.25, 0, 0))
    act("Chop", {
        1: P(**arms_up, spine=(0.08, 0, 0), chest=(0, 0, 0)),
        12: P(**arms_up, spine=(0.08, 0, -0.55), chest=(0, 0, -0.45)),
        18: P(**arms_up, spine=(0.12, 0, 0.45), chest=(0, 0, 0.35)),
        30: P(**arms_up, spine=(0.08, 0, 0), chest=(0, 0, 0)),
    })
    # the story's poses: held, so each is two identical keys
    def hold(name, **kw):
        p = P(**kw); act(name, {1: p, 20: p})
    hold("Torch", upper_arm_R=(-1.25, 0, -0.15), forearm_R=(-0.3, 0, 0))
    hold("Lantern", upper_arm_R=(-0.35, 0, -0.1), forearm_R=(-0.4, 0, 0))
    hold("Hold", upper_arm_L=(-0.5, 0, 0.15), upper_arm_R=(-0.5, 0, -0.15), forearm_L=(-1.0, 0, 0), forearm_R=(-1.0, 0, 0))
    hold("Writ", upper_arm_L=(-0.9, 0, 0.2), upper_arm_R=(-0.9, 0, -0.2), forearm_L=(-0.9, 0, 0), forearm_R=(-0.9, 0, 0), neck=(0.25, 0, 0))
    hold("Point", upper_arm_R=(-1.5, 0, -0.1), forearm_R=(0, 0, 0))
    hold("ArmsCrossed", upper_arm_L=(-0.5, 0, 0.35), upper_arm_R=(-0.5, 0, -0.35), forearm_L=(-1.6, 0, -0.9), forearm_R=(-1.6, 0, 0.9))
    hold("Bound", upper_arm_L=(0.45, 0, 0.2), upper_arm_R=(0.45, 0, -0.2), forearm_L=(-0.6, 0, 0.5), forearm_R=(-0.6, 0, -0.5), neck=(0.2, 0, 0))
    hold("Grieve", upper_arm_L=(-1.2, 0, 0.5), upper_arm_R=(-1.2, 0, -0.5), forearm_L=(-1.9, 0, 0), forearm_R=(-1.9, 0, 0), neck=(0.45, 0, 0), spine=(0.2, 0, 0))
    hold("Reach", upper_arm_L=(-1.4, 0, 0.1), upper_arm_R=(-1.4, 0, -0.1))
    act("Hammer", {1: P(upper_arm_R=(-1.0, 0, -0.1), forearm_R=(-1.2, 0, 0), spine=(0.35, 0, 0)),
                   7: P(upper_arm_R=(-2.1, 0, -0.1), forearm_R=(-0.6, 0, 0), spine=(0.35, 0, 0)),
                   13: P(upper_arm_R=(-1.0, 0, -0.1), forearm_R=(-1.2, 0, 0), spine=(0.35, 0, 0))})
    # stand in the rest pose when nothing plays
    for b in pb:
        b.rotation_euler = Euler((0, 0, 0))
        b.location = Vector((0, 0, 0))


which = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(CAST)
for k in which:
    print("wrote", build_person(k))
