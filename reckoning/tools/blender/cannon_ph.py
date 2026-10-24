"""The gun's barrel, scanned: cannon_barrel.glb — the cast-iron barrel of Poly Haven's Cannon 01 (CC0, polyhaven.com),
its truck carriage left behind (the game's field carriage carries it).

Set with its trunnions at the origin, the bore along -z (the muzzle that way, as makeCannon builds its own), cut to a
game's triangles, its textures to 512. Its material is "cannon_pbr": left as photographed.

    blender -b --factory-startup -P reckoning/tools/blender/cannon_ph.py
"""
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "ph", "cannon_01", "cannon_01_1k.gltf")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))
TRIS, TEX = 3000, 512

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = bpy.data.objects["cannon_01_barrel"]
for o in list(bpy.data.objects):
    if o is not ob: bpy.data.objects.remove(o, do_unlink=True)
ob.data.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4); ob.parent = None
# (the trunnions: what stands out sideways, further than the barrel's own round)
side = [v.co for v in ob.data.vertices if abs(v.co.x) > 0.2]
t = sum(side, Vector()) / len(side); t.x = 0
# (turned about so the muzzle — the far end from the trunnions — lies along +y here, which is -z in the game)
P = [v.co for v in ob.data.vertices]
lo, hi = min(p.y for p in P), max(p.y for p in P)
turn = Matrix.Rotation(3.14159265, 4, "Z") if abs(lo - t.y) > abs(hi - t.y) else Matrix.Identity(4)
ob.data.transform(turn @ Matrix.Translation(-t))
now = len(ob.data.polygons)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
md = ob.modifiers.new("cut", "DECIMATE"); md.ratio = min(1, TRIS / sum(len(p.vertices) - 2 for p in ob.data.polygons))
bpy.ops.object.modifier_apply(modifier=md.name)
for p in ob.data.polygons: p.use_smooth = True
for m in ob.data.materials:
    if m: m.name = "cannon_pbr"
for im in bpy.data.images:
    if max(im.size) > TEX: s = TEX / max(im.size); im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
P = [v.co for v in ob.data.vertices]
print("barrel tris", now, "->", len(ob.data.polygons), "muzzle at", round(max(p.y for p in P), 3), "breech", round(min(p.y for p in P), 3),
      "radius", round(max(abs(p.z) for p in P), 3))
out = os.path.join(os.environ.get("REAL_OUT", MODELS), "cannon_barrel.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_image_format="JPEG", export_jpeg_quality=85)
print("wrote", out, os.path.getsize(out) // 1024, "KB")
