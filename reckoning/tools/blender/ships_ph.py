"""Real ships of the age for the harbour: ship_dutch.glb and ship_dutch_m.glb — Poly Haven's Dutch ships (CC0,
polyhaven.com), a large and a middling one, scanned and modelled to the last block and rope, their sails half-set.

Laid as the game's own ship.glb is: her length along y, her bow toward -y (+z in the game), her keel just below z 0 at
the waterline, and sized to the same overall length, bowsprit to taffrail, so the harbour puts her where it put the
built one.

    blender -b --factory-startup -P reckoning/tools/blender/ships_ph.py
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "ph")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# name: (Poly Haven asset, overall length, how far of her hull's height is below the water)
SHIPS = {"ship_dutch": ("dutch_ship_large_01", 26.2, 0.33), "ship_dutch_m": ("dutch_ship_medium", 26.2, 0.33)}
TEX = 512


def build(name):
    asset, length, draught = SHIPS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = next(os.path.join(SRC, asset, f) for f in os.listdir(os.path.join(SRC, asset)) if f.endswith(".gltf"))
    bpy.ops.import_scene.gltf(filepath=src)
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4); o.parent = None
    hull = next(o for o in meshes if "hull" in o.name)
    allp = [v.co for o in meshes for v in o.data.vertices]
    hp = [v.co for v in hull.data.vertices]
    lo = Vector((min(p.x for p in allp), min(p.y for p in allp), min(p.z for p in allp)))
    hi = Vector((max(p.x for p in allp), max(p.y for p in allp), max(p.z for p in allp)))
    hlo = Vector((min(p.x for p in hp), min(p.y for p in hp), min(p.z for p in hp)))
    hhi = Vector((max(p.x for p in hp), max(p.y for p in hp), max(p.z for p in hp)))
    # (her length is along whichever of x and y is longer; her bow is the end the bowsprit and its rigging run out past
    #  the hull furthest)
    along_x = (hi.x - lo.x) >= (hi.y - lo.y)
    if along_x:
        bow = 1 if (hi.x - hhi.x) > (hlo.x - lo.x) else -1
        R = Matrix.Rotation(math.pi / 2 * bow, 4, "Z")          # (+x bow → -y: a quarter turn; -x bow → the other way)
    else:
        bow = 1 if (hi.y - hhi.y) > (hlo.y - lo.y) else -1
        R = Matrix.Rotation(math.pi if bow > 0 else 0, 4, "Z")
    for o in meshes:
        o.data.transform(R)
    allp = [v.co for o in meshes for v in o.data.vertices]
    hp = [v.co for v in hull.data.vertices]
    lo = Vector((min(p.x for p in allp), min(p.y for p in allp), min(p.z for p in allp)))
    hi = Vector((max(p.x for p in allp), max(p.y for p in allp), max(p.z for p in allp)))
    hz0, hz1 = min(p.z for p in hp), max(p.z for p in hp)
    k = length / (hi.y - lo.y)
    water = hz0 + (hz1 - hz0) * draught
    M = Matrix.Scale(k, 4) @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -water))
    for o in meshes:
        o.data.transform(M)
        for m in o.data.materials:
            if m:
                m.name = f"{name}_{'sail' if 'sail' in o.name else 'rope' if 'rigging' in o.name else 'pbr'}"
    print(name, "from", asset, "scale", round(k, 3), "bow", bow, "along_x", along_x)
    for im in bpy.data.images:
        if max(im.size) > TEX:
            s = TEX / max(im.size)
            im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), f"{name}.glb")
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_image_format="JPEG",
                              export_jpeg_quality=82)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(SHIPS)
    for n in argv:
        build(n)


if __name__ == "__main__":
    main()
