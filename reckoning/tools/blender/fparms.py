"""Your own arms, first person: models/fparms.glb — one skinned mesh for each arm, shoulder to fingertips, on a skeleton
with every finger's three joints, so the game can bend the elbow and close the hand round whatever it holds.

From MakeHuman's base body and its game-engine skeleton (both CC0), made with MPFB (makehumancommunity.org; GPL code,
CC0 assets — the code isn't shipped, only what it makes). Only the arms are kept; over them, in the same mesh and
moving with the same bones, the coat's sleeve to a hand's breadth above the wrist and the shirt's linen cuff showing
below it — so there's no seam anywhere between the shoulder and the hand.

    BLENDER_USER_RESOURCES=reckoning/tools/blender/assets/mpfb/bl_user \\
        blender -b -P reckoning/tools/blender/fparms.py

(MPFB is installed into that private Blender profile, not the user's own: see tools/blender/assets/mpfb.)
"""
import os

import bmesh
import bpy
from mathutils import Vector

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

ARM = ("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky")
HAND = ("hand", "thumb", "index", "middle", "ring", "pinky")
SLEEVE_END = 0.095      # (the coat's sleeve ends this far up the forearm from the wrist)
CUFF = (0.045, 0.1)     # (the shirt's cuff shows from here to just under the sleeve)


def build():
    bpy.ops.wm.read_homefile(use_empty=True)
    d = TargetService.get_default_macro_info_dict()
    d["gender"] = 1.0; d["muscle"] = 0.62; d["weight"] = 0.5
    d["race"] = {"asian": 0.1, "caucasian": 0.8, "african": 0.1}
    body = HumanService.create_human(macro_detail_dict=d)
    rig = HumanService.add_builtin_rig(body, "game_engine")
    bpy.context.view_layer.objects.active = body; body.select_set(True)
    # (its shape — a man's, a soldier's arms — baked in; and the helpers, the clothes-fitting scaffolds, gone)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for md in list(body.modifiers):
        if md.type == "MASK":
            body.modifiers.remove(md)
    gi = {g.name: g.index for g in body.vertex_groups}
    keep_body = gi.get("body")
    # materials first, so the faces' marks hold: skin, the coat's wool, the shirt's linen (the game lays its own over
    # each, by these names)
    body.data.materials.clear()
    for n in ("fparms_skin", "fparms_sleeve", "fparms_cuff"):
        body.data.materials.append(bpy.data.materials.new(n))
    bm = bmesh.new(); bm.from_mesh(body.data)
    dl = bm.verts.layers.deform.verify()
    def wv(bv, names):
        dv = bv[dl]
        return sum(x for k, x in dv.items() if body.vertex_groups[k].name.split("_")[0] in names)
    drop = [v for v in bm.verts if (keep_body is not None and v[dl].get(keep_body, 0) < 0.5) or wv(v, ARM) < 0.5]
    bmesh.ops.delete(bm, geom=drop, context="VERTS")
    # where each wrist is: the head of its hand bone
    wrist = {s: rig.data.bones[f"hand_{s}"].head_local.copy() for s in ("l", "r")}
    side = lambda co: "r" if co.x < 0 else "l"
    # each face's distance up the arm from its wrist (negative into the hand), along the forearm
    fore = {s: (rig.data.bones[f"lowerarm_{s}"].head_local - wrist[s]).normalized() for s in ("l", "r")}
    def up_arm(co):
        s = side(co); return (co - wrist[s]).dot(fore[s])
    # (how far up the arm a face is: along the forearm from the wrist — but anything the upper arm moves is above the
    #  elbow, whatever its line along the forearm says, and the cuff was being cut from it too)
    def up_v(v):
        return 9.0 if wv(v, ("upperarm",)) > 0.3 else up_arm(v.co)
    skin_n = len(body.data.materials)
    # (the sleeve and the cuff: copies of the arm's own faces, out a little from the skin, the same bones moving them)
    def layer(lo, hi, push, flare=0.0, mat=1):
        faces = [f for f in bm.faces if f.material_index == 0 and lo <= sum(up_v(v) for v in f.verts) / len(f.verts) <= hi
                 and all(wv(v, HAND) < 0.3 for v in f.verts)]
        ret = bmesh.ops.duplicate(bm, geom=faces)
        nf = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMFace)]
        for f in nf:
            f.material_index = mat     # (marked as it's made: skin 0, sleeve 1, cuff 2)
        nv = {v for f in nf for v in f.verts}
        bm.normal_update()
        for v in nv:
            t = up_arm(v.co)
            k = push + flare * max(0.0, 1 - (t - lo) / 0.03)
            v.co += v.normal * k
        return nf
    for f in bm.faces:
        f.material_index = 0
    sleeve = layer(SLEEVE_END, 9.0, 0.014, flare=0.006, mat=1)
    cuff = layer(CUFF[0], CUFF[1], 0.008, flare=0.006, mat=2)
    bm.to_mesh(body.data); bm.free()
    me = body.data
    nfaces = len(me.polygons)
    ns, nc = len(sleeve), len(cuff)
    # (smooth: a body, not facets)
    for p in me.polygons:
        p.use_smooth = True
    print("arms", len(me.vertices), "verts", nfaces, "faces; sleeve", ns, "cuff", nc)
    # (only the bones that move the arms are worth sending: the rest are dropped, and the arms' own kept parented)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in list(rig.data.edit_bones):
        if eb.name.split("_")[0] not in ARM + ("clavicle",) and eb.name not in ("Root", "pelvis", "spine_01", "spine_02", "spine_03"):
            rig.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode="OBJECT")
    for g in list(body.vertex_groups):
        if g.name not in rig.data.bones:
            body.vertex_groups.remove(g)
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), "fparms.glb")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True); rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_animations=False,
                              export_skins=True, export_morph=False)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


build()
