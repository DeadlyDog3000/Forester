"""Real furniture and goods for the world, from Poly Haven's scanned models (CC0, polyhaven.com): prop_barrel.glb,
prop_table.glb, prop_bench.glb, prop_stool.glb, prop_bucket.glb, prop_basket.glb, prop_lantern.glb, prop_chest.glb,
prop_bowl.glb.

Each is stood on the ground at the origin, centred on its footprint, and sized to the game's built one it stands in
for — by its height, the same all round, so a barrel stays a barrel's shape. Its material is "<name>_pbr", which the
game leaves as photographed.

    blender -b --factory-startup -P reckoning/tools/blender/props_ph.py [-- barrel table ...]
"""
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "ph")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# name: (Poly Haven asset, height in metres, turn about z in degrees so its long side runs along x)
PROPS = {
    "barrel": ("wine_barrel_01", 0.95, 0),
    "table": ("WoodenTable_01", 0.78, 0),
    "bench": ("painted_wooden_bench", 0.9, 0),
    "stool": ("wooden_stool_01", 0.5, 0),
    "bucket": ("wooden_bucket_01", 0.42, 0),
    "basket": ("wicker_basket_01", 0.24, 0),
    "lantern": ("wooden_lantern_01", 0.36, 0),
    "chest": ("treasure_chest", 0.6, 0),
    "candlestick": ("wooden_candlestick", 0.24, 0),
    "bowl": ("wooden_bowl_01", 0.05, 0),
    "crate": ("wooden_crate_02", 0.46, 0),
    "crate_s": ("wooden_crate_01", 0.35, 0),
    "plate": ("carved_wooden_plate", 0.03, 0),
    "goblet": ("brass_goblets", 0.2, 0),
    "bed": ("GothicBed_01", 1.45, 0),
}


CUT = {"candlestick": 1500, "chest": 3500, "basket": 4000, "stool": 3000, "barrel": 4000, "lantern": 3000, "crate": 2500, "crate_s": 2500, "plate": 1200, "goblet": 1500, "bed": 6000}
# (a file of several, one of them taken alone: its object's name)
ONLY = {"goblet": "brass_goblet_01"}


def build(name):
    asset, height, rz = PROPS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = next(os.path.join(SRC, asset, f) for f in os.listdir(os.path.join(SRC, asset)) if f.endswith(".gltf"))
    bpy.ops.import_scene.gltf(filepath=src)
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    if name in ONLY:
        for o in list(bpy.data.objects):
            if o.name != ONLY[name]: bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    R = Matrix.Rotation(rz * 3.14159265 / 180, 4, "Z")
    for o in meshes:
        o.data.transform(R @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        o.parent = None
    # (a scan too fine for a game — the chest is a hundred thousand triangles — cut down to its budget)
    want = CUT.get(name)
    if want:
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        if len(meshes) > 1: bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active; meshes = [ob]
        for _ in range(3):
            now = sum(len(p.vertices) - 2 for p in ob.data.polygons)
            if now <= want * 1.1: break
            md = ob.modifiers.new("cut", "DECIMATE"); md.ratio = want / now; bpy.ops.object.modifier_apply(modifier=md.name)
        print(name, "cut to", sum(len(p.vertices) - 2 for p in ob.data.polygons), "triangles")
    pts = [v.co for o in meshes for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    k = height / (hi.z - lo.z)
    M = Matrix.Scale(k, 4) @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in meshes:
        o.data.transform(M)
        for m in o.data.materials:
            if m:
                m.name = f"prop{name}_glass" if "glass" in m.name.lower() else f"prop{name}_pbr"
    d = (hi - lo) * k
    print(name, "from", asset, "size", tuple(round(v, 2) for v in d))
    # (textures no bigger than a thing this size wants)
    for im in bpy.data.images:
        if max(im.size) > 512:
            s = 512 / max(im.size)
            im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), f"prop_{name}.glb")
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_image_format="JPEG",
                              export_jpeg_quality=85)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(PROPS)
    for n in argv:
        build(n)


if __name__ == "__main__":
    main()
