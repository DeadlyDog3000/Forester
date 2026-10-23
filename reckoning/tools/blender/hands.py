"""Your own hands, first person, closed round a haft: hand_grip.glb.

The realistic hand from Blender Studio's Human Base Meshes (CC0), its forearm cut away at the wrist, each finger bent
round a haft as a strip is bent round a rod — the inside of the finger on a tighter curve than the back — and the thumb
brought across the other side. A right hand and a left (its mirror) in the one file, the haft through the origin along
the file's up axis, so the game can set either on whatever is held: the axe, the musket, the spear.

    blender -b --factory-startup -P reckoning/tools/blender/hands.py

Needs the bundle in tools/blender/assets/human-base-meshes (fetched once; not kept in the repository).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import MODELS, rgb

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "assets", "human-base-meshes", "human-base-meshes-bundle-v1.4.1", "human_base_meshes_bundle.blend")


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def grip_hand():
    with bpy.data.libraries.load(BLEND) as (src, dst):
        dst.objects = [n for n in src.objects if n == "Hand  - Realistic"]
    ob = dst.objects[0]
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.transform(ob.matrix_world)
    bpy.data.objects.remove(ob, do_unlink=True)
    cx = sum(v.co.x for v in bm.verts) / len(bm.verts)
    # (the forearm away, just above the wrist: the sleeve's cuff covers the cut)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.35], context="VERTS")
    # (the cut at the wrist closed over: seen from behind, as your own hands are, an open wrist showed the inside of the hand)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    # the hand's own measures (see the cross-sections in the history of this file): the knuckles across at z 0.262, the
    # fingers' middle at y 0.018 (the palm toward +y), the thumb out at +x from z 0.31 down
    zk, yf, R = 0.262, 0.018, 0.027
    yc = yf + R                                         # (the haft's axis, across the palm)
    for v in bm.verts:
        x, y, z = v.co.x - cx, v.co.y, v.co.z
        thumb = x > 0.05 and z > 0.2
        if thumb:
            # the thumb brought across: turned in about its root toward the palm, and down over the fingers
            piv = Vector((0.045, 0.03, 0.31))
            p = Vector((x, y, z)) - piv
            k = smooth((0.31 - z) / 0.06)
            p = Matrix.Rotation(-1.15 * k, 3, "Z") @ p
            p = Matrix.Rotation(0.5 * k, 3, "X") @ p
            v.co = piv + p + Vector((cx, 0, 0))
            continue
        if z >= zk:
            # (the palm below the knuckles cupped a little toward the haft)
            k = smooth((0.3 - z) / 0.04)
            v.co.y = y + 0.004 * k
            continue
        s = zk - z                                      # (how far along the finger past the knuckle)
        t = y - yf                                      # (and across its thickness: toward the palm +, the back −)
        rho = R - t
        th = s / R * 1.0
        v.co = Vector((x + cx, yc - rho * math.cos(th), zk - rho * math.sin(th)))
    # (faces turned outward: the bundle's hand is a mirrored object, and baking its transform in turned them inside out —
    #  the game draws only the outside, and saw the inside of a hand)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    # into the game's frame: the haft's axis (across the palm, along x) to the origin, and along the file's up
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((-cx, -yc, -zk)))
    return bm


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bm = grip_hand()
    skin = bpy.data.materials.new("hand_skin")
    skin.use_nodes = True
    skin.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb(0xe8c4a0)[:3], 1)
    skin.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
    made = []
    for side in ("R", "L"):
        b = bm.copy()
        if side == "L":
            bmesh.ops.scale(b, verts=b.verts, vec=(-1, 1, 1))
            bmesh.ops.reverse_faces(b, faces=b.faces)
        bmesh.ops.recalc_face_normals(b, faces=b.faces)
        # (haft along x here; the file's up is Blender's z: turned so the haft runs up)
        bmesh.ops.rotate(b, verts=b.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, "Y"))
        me = bpy.data.meshes.new(f"hand_{side}")
        b.to_mesh(me); b.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(skin)
        o = bpy.data.objects.new(f"hand_{side}", me)
        bpy.context.scene.collection.objects.link(o)
        made.append(o)
    bm.free()
    out = os.path.join(MODELS, "hand_grip.glb")
    for o in bpy.context.scene.objects:
        o.select_set(o in made)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=True)
    print("wrote", out)


if __name__ == "__main__":
    main()
