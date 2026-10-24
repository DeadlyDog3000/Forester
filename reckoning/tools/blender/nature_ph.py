"""The country's own things, scanned: rocks, stumps, fallen trunks, ferns, shrubs, nettles and the fire's ring of stones
— Poly Haven's photographed models (CC0, polyhaven.com), cut down to what a game can draw by the hundred.

Each is joined into one mesh with one material ("<name>_pbr": the game leaves it as photographed), its triangles
brought down to its budget (the scan's own normal map keeps the surface's detail), its textures to 512, and set down
on the ground at the origin, centred on its footprint. Sized as the game wants it:
    rocks and stumps  "unit": its largest width 1 (the game scales each one placed)
    the rest          as it is in the world, in metres

    blender -b --factory-startup -P reckoning/tools/blender/nature_ph.py [-- rock_a fern ...]
"""
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "ph")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# name: (Poly Haven asset, triangles wanted, size: "unit" or a scale, alpha cut-out (plants))
NATURE = {
    "rock_b": ("namaqualand_boulder_02", 1400, "unit", False),
    "rock_c": ("rock_07", 700, "unit", False),
    "stump_a": ("tree_stump_01", 1800, "unit", False),
    "stump_b": ("tree_stump_02", 1800, "unit", False),
    "log_a": ("dead_tree_trunk_02", 2400, 1.0, False),
    "fern": ("fern_02", 4000, 1.0, True),
    "nettle": ("nettle_plant", 6000, 1.0, True),
    "firepit": ("stone_fire_pit", 3900, 1.0, False),
}
TEX = 512


def build(name):
    asset, tris, size, cut = NATURE[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = next(os.path.join(SRC, asset, f) for f in os.listdir(os.path.join(SRC, asset)) if f.endswith(".gltf"))
    bpy.ops.import_scene.gltf(filepath=src)
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4); o.parent = None
    # (a plant's file is several of it laid out side by side, its variants: the biggest one kept)
    if cut and len(meshes) > 1:
        def vol(o):
            P = [v.co for v in o.data.vertices]
            return (max(p.x for p in P) - min(p.x for p in P)) * (max(p.y for p in P) - min(p.y for p in P)) * (max(p.z for p in P) - min(p.z for p in P) + 0.01)
        keep = max(meshes, key=vol)
        for o in meshes:
            if o is not keep: bpy.data.objects.remove(o, do_unlink=True)
        meshes = [keep]
    # one mesh
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    have = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    # (cut down — again, if a scan's mesh won't come down all the way at once)
    for _ in range(3):
        now = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if now <= tris * 1.1: break
        md = ob.modifiers.new("cut", "DECIMATE"); md.ratio = tris / now; md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=md.name)
        if sum(len(p.vertices) - 2 for p in ob.data.polygons) >= now * 0.95:
            # (a mesh in loose pieces that collapse won't merge: welded first)
            bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=0.002); bpy.ops.object.mode_set(mode="OBJECT")
    got = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    P = [v.co for v in ob.data.vertices]
    lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    k = 1 / max(hi.x - lo.x, hi.y - lo.y) if size == "unit" else size
    ob.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    for p in ob.data.polygons:
        p.use_smooth = True
    for m in ob.data.materials:
        if m:
            m.name = f"{name}_pbr"
            if cut:
                m.blend_method = "CLIP" if hasattr(m, "blend_method") else m.blend_method
    for im in bpy.data.images:
        if max(im.size) > TEX:
            s = TEX / max(im.size); im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
    d = (hi - lo) * k
    print(name, "from", asset, "tris", have, "->", got, "size", tuple(round(v, 2) for v in d))
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), f"{name}.glb")
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_image_format="JPEG",
                              export_jpeg_quality=85)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


def main():
    for n in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(NATURE)):
        build(n)


if __name__ == "__main__":
    main()
