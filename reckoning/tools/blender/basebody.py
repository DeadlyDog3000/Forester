"""A person's body from Blender Studio's realistic base bodies (Human Base Meshes, CC0), for people.py.

The bundle's bodies stand in an A-pose, 1.68 m (a man) or 1.64 m (a woman) to the crown, with modelled hands. Here one
is taken without its head (people.py puts the base head on it), its arms brought down to hang at the sides as ours do,
and fitted to a person's own joints: the heights of ankle, knee, hip, waist, shoulder and neck, the breadth of the
shoulders and hips. It is made lighter everywhere but the hands, which keep their fingers.

    from basebody import base_body
    verts, faces, is_arm = base_body(J, female, wide)   # or None when the bundle isn't there

The bundle lives in tools/blender/assets/human-base-meshes (fetched once; not kept in the repository).
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "assets", "human-base-meshes", "human-base-meshes-bundle-v1.4.1", "human_base_meshes_bundle.blend")
_RAW = {}


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def _raw(female):
    """The body as it is in the bundle, centred on x = 0, without its multires: (verts, faces)."""
    key = "f" if female else "m"
    if key in _RAW:
        return _RAW[key]
    if not os.path.exists(BLEND):
        _RAW[key] = None
        return None
    name = "GEO-body_female_realistic" if female else "GEO-body_male_realistic"
    with bpy.data.libraries.load(BLEND) as (src, dst):
        dst.objects = [n for n in src.objects if n == name]
    ob = dst.objects[0]
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    M = ob.matrix_world
    cx = ob.location.x
    verts = [M @ v.co - Vector((cx, 0, 0)) for v in ob.data.vertices]
    faces = [tuple(p.vertices) for p in ob.data.polygons]
    bpy.data.objects.remove(ob, do_unlink=True)
    _RAW[key] = (verts, faces)
    return _RAW[key]


def _landmarks(vs):
    """Heights and breadths of the bundle's body, found from its own shape."""
    top = max(v.z for v in vs)
    female = top < 1.66
    s = top / 1.684
    # (measured on the bundle's bodies: the shoulder joint, and where the arm runs from it in the A-pose — to the wrist)
    sho = Vector((0.16, 0.0, 1.29)) if female else Vector((0.185, 0.0, 1.33))
    wri = Vector((0.33, 0.0, 0.86)) if female else Vector((0.367, 0.0, 0.9))
    return dict(s=s, top=top, ankle=0.08 * s, knee=0.48 * s, hip=0.89 * s, waist=1.04 * s, chest=1.2 * s, sho=sho, neck=1.43 * s, wri=wri)


def base_body(J, female, wide=0.0):
    raw = _raw(female)
    if not raw:
        return None
    vs0, faces0 = raw
    L = _landmarks(vs0)
    s = L["s"]
    sho = L["sho"]
    # ---- the arms brought down: each side turned about its shoulder, the turn blended in over the deltoid so the
    # shoulder rounds over instead of breaking ----
    arm_dir = (L["wri"] - sho).normalized()
    want = (Vector(J["wrist.L"]) - Vector(J["shoulder.L"])).normalized()
    ang = math.atan2(arm_dir.x, -arm_dir.z) - math.atan2(abs(want.x), -want.z)
    vs, is_arm, aw = [], [], []
    # (which is arm: below the armpit the A-pose holds the arm clear of the body, so whatever lies out beyond the side of
    #  the torso at its height — measured on the bundle's bodies — is arm; over the shoulder the turn fades out)
    edge = [(0.6, 0.2), (0.7, 0.2), (0.8, 0.185), (0.9, 0.168), (1.0, 0.14), (1.1, 0.162), (1.2, 0.205), (1.3, 0.2)] if not female else \
           [(0.6, 0.2), (0.7, 0.2), (0.8, 0.183), (0.9, 0.163), (1.0, 0.133), (1.1, 0.148), (1.2, 0.185), (1.3, 0.18)]
    def edge_at(z):
        if z <= edge[0][0]: return edge[0][1]
        for (a, ea), (b, eb) in zip(edge, edge[1:]):
            if z <= b: return ea + (eb - ea) * (z - a) / (b - a)
        return edge[-1][1]
    zs = sho.z - 0.1                                   # (below this the arm hangs free)
    for v in vs0:
        sd = 1 if v.x >= 0 else -1
        p = Vector((v.x * sd, v.y, v.z))
        if p.z < zs:
            w = smooth((p.x - edge_at(p.z) - 0.004) / 0.012)
        else:
            w = smooth((p.x - (0.115 if female else 0.13)) / 0.07) * (1 - smooth((p.z - zs) / 0.16))
        if p.z < 0.55: w = 0.0                         # (the legs are never arm)
        if w > 0:
            R = Matrix.Rotation(ang * w, 3, "Y")
            p = sho + R @ (p - sho)
        vs.append(Vector((p.x * sd, p.y, p.z)))
        is_arm.append(w > 0.5); aw.append(w)
    # ---- fitted to this person's joints: heights by stretches between landmarks, breadths by the shoulders and hips ----
    zb = [0.0, L["ankle"], L["knee"], L["hip"], L["waist"], L["chest"], sho.z, L["neck"], L["top"]]
    zt = [0.0, J["ankle.L"][2], J["knee.L"][2], J["hip.L"][2], (J["hip.L"][2] + J["chest"][2]) / 2 + 0.03, J["chest"][2] - 0.08, J["shoulder.L"][2], J["neck"][2] - 0.03, J["neck"][2] + 0.25]
    def zmap(z):
        for (a, b), (c, d_) in zip(zip(zb, zb[1:]), zip(zt, zt[1:])):
            if z <= b:
                return c + (d_ - c) * (z - a) / max(1e-6, b - a)
        return zt[-1] + (z - zb[-1])
    kx_sho = abs(J["shoulder.L"][0]) / sho.x
    kx_hip = 1.0
    # (the arm, now hanging, set on this person's shoulder joint and its length made theirs — the wrist on their wrist —
    #  as a whole, not stretched with the trunk's heights; the shoulder's flesh blended between the two)
    tsho, twri = Vector(J["shoulder.L"]), Vector(J["wrist.L"])
    bwri = sho + Matrix.Rotation(ang, 3, "Y") @ (L["wri"] - sho)
    ka = (twri - tsho).length / (bwri - sho).length
    bdir = (bwri - sho).normalized(); tdir = (twri - tsho).normalized()
    Rarm = bdir.rotation_difference(tdir).to_matrix()
    out = []
    for v, w in zip(vs, aw):
        z = zmap(v.z)
        t = smooth((v.z - L["hip"]) / (sho.z - L["hip"]))
        kx = (kx_hip + (kx_sho - kx_hip) * t) * (1 + wide * 0.9)
        ky = 1 + wide * 0.7
        trunk = Vector((v.x * kx, v.y * ky, z))
        if w <= 0:
            out.append(trunk); continue
        sd = 1 if v.x >= 0 else -1
        d = Vector((v.x * sd, v.y, v.z)) - sho
        along = d.dot(bdir); perp = d - bdir * along
        hand = smooth((along - (bwri - sho).length * 0.97) / 0.03)     # (the hand made the arm's size as well as length)
        q = Rarm @ (bdir * along * ka + perp * (1 + (ka - 1) * hand))
        arm = Vector(((tsho.x + q.x) * sd, tsho.y + q.y, tsho.z + q.z))
        out.append(trunk.lerp(arm, w))
    return out, faces0, is_arm


def base_hands(J, female):
    """Just the hands of the base body, hanging at this person's wrists as base_body() would set them: (verts, faces),
    each face wholly beyond the wrist, the cut edge reaching a little up into the forearm so the join is covered."""
    BB = base_body(J, female)
    if not BB:
        return None
    vs, fs, isarm = BB
    raw = _raw(female)[0]
    L = _landmarks(raw)
    sho, wri = L["sho"], L["wri"]
    ad = (wri - sho).normalized(); ln = (wri - sho).length
    def in_hand(i):
        q = raw[i]; p = Vector((abs(q.x), q.y, q.z)) - sho
        return isarm[i] and p.dot(ad) > ln * 0.93 and q.z > 0.55
    keep = [fc for fc in fs if all(in_hand(i) for i in fc)]
    used = sorted({i for fc in keep for i in fc})
    remap = {i: k for k, i in enumerate(used)}
    return [vs[i] for i in used], [tuple(remap[i] for i in fc) for fc in keep]
