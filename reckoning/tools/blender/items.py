"""The things in your hands as real things: axe.glb, pick.glb, spade.glb, sword.glb, dagger.glb — from Poly Haven's
photographed, scanned models (CC0, polyhaven.com), with their own textures of worn wood and pitted iron.

Each is turned to the way the game holds it (the haft or grip up +Z here, +Y in the game; what cuts or digs forward,
-Y here, +Z in the game), sized to the game's own (the length along the haft), and set so the haft's foot is where the
game's built one began: the hands go on it at the same places. Its material is named "<item>_pbr", which the game
leaves as it is (no grain laid over a photograph).

    blender -b --factory-startup -P reckoning/tools/blender/items.py [-- axe pick ...]

The sources are fetched once into tools/blender/assets/ph (not kept in the repository).
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "ph")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# name: (Poly Haven asset, turn (degrees about x, then z) to haft-up/edge-forward, length along the haft, its foot at,
#        objects to leave out)
ITEMS = {
    "axe": ("wooden_axe_02", (0, 0), 0.86, -0.12, ()),
    "pick": ("picke_dirty_01", (0, 90), 0.92, -0.1, ()),
    "spade": ("rusted_spade_01", (180, 90), 1.12, -0.13, ()),
    "sword": ("antique_estoc", (0, 0), 1.1, -0.06, ()),
    "dagger": ("ornate_medieval_dagger", (0, 0), 0.38, -0.03, ("ornate_medieval_dagger_scabbard",)),
    "hammer": ("wooden_hammer_01", (0, 90), 0.34, -0.05, ()),
    "saw": ("handsaw_wood", (-90, 0), 0.66, -0.06, ()),
}

# where on each the hands close (fractions of its length from the foot): the two bands whose middles fix the haft's line
# (a sword's and a dagger's grip is short, below the guard)
GRIP_BANDS = {"sword": (0.02, 0.08), "dagger": (0.04, 0.12), "saw": (0.03, 0.1)}
GRIP_BANDS2 = {"sword": (0.10, 0.16), "dagger": (0.14, 0.22), "saw": (0.11, 0.17)}


def build(name):
    asset, (rx, rz), length, foot, drop = ITEMS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = next(os.path.join(SRC, asset, f) for f in os.listdir(os.path.join(SRC, asset)) if f.endswith(".gltf"))
    bpy.ops.import_scene.gltf(filepath=src)
    for o in list(bpy.data.objects):
        if o.type != "MESH" or o.name in drop:
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    # everything into one frame, turned to the game's holding
    R = Matrix.Rotation(math.radians(rz), 4, "Z") @ Matrix.Rotation(math.radians(rx), 4, "X")
    for o in meshes:
        o.data.transform(R @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        o.parent = None
    pts = [v.co.copy() for o in meshes for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    k = length / (hi.z - lo.z)
    # (the haft's line where the hands go on it — a fifth and a half of the way up: its middle at each, the line through
    #  them stood upright and through the origin. A curved haft's knob, or its swell, is off that line, and centred on
    #  them the hands closed round thin air beside the haft)
    L = hi.z - lo.z
    def mid(f0, f1):
        band = [p for p in pts if lo.z + L * f0 <= p.z <= lo.z + L * f1]
        return Vector((sum(p.x for p in band) / len(band), sum(p.y for p in band) / len(band), lo.z + L * (f0 + f1) / 2))
    a0, a1 = mid(*GRIP_BANDS.get(name, (0.18, 0.26))), mid(*GRIP_BANDS2.get(name, (0.42, 0.5)))
    d = (a1 - a0).normalized()
    T = d.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    # (stood upright about the first grip, then the line through the origin)
    for o in meshes:
        o.data.transform(Matrix.Translation(a0) @ T @ Matrix.Translation(-a0))
    pts = [v.co.copy() for o in meshes for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    k = length / (hi.z - lo.z)
    cx, cy = a0.x, a0.y
    M = Matrix.Translation((0, 0, foot)) @ Matrix.Scale(k, 4) @ Matrix.Translation((-cx, -cy, -lo.z))
    for o in meshes:
        o.data.transform(M)
        for m in o.data.materials:
            if m:
                m.name = f"{name}_pbr"
    print(name, "from", asset, "scale", round(k, 3), "haft at", round(cx, 3), round(cy, 3))
    # (textures no bigger than a thing in the hand wants)
    for im in bpy.data.images:
        if max(im.size) > 512:
            sc = 512 / max(im.size)
            im.scale(max(1, int(im.size[0] * sc)), max(1, int(im.size[1] * sc)))
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), f"{name}.glb")
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_image_format="JPEG",
                              export_jpeg_quality=85)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(ITEMS)
    for n in argv:
        build(n)


if __name__ == "__main__":
    main()
