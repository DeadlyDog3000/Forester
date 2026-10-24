"""Food you can hold, scanned: food_bread.glb — ambientCG's 3D Bread 003, a country loaf (CC0, ambientcg.com), with its
own photographed crust.

Stood on the ground at the origin, centred on its footprint, its length along x, sized to a loaf you hold in one hand
(fifteen centimetres). Its material is "food_pbr", which the game leaves as photographed.

    blender -b --factory-startup -P reckoning/tools/blender/food_acg.py

The source is fetched once into tools/blender/assets/acg/3DBread003 (not kept in the repository).
"""
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))
FOOD = {"bread": ("3DBread003", 0.15)}
TEX = 512


def build(name):
    asset, length = FOOD[name]
    src = os.path.join(HERE, "assets", "acg", asset)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = next(f for f in os.listdir(src) if f.endswith(".obj"))
    bpy.ops.wm.obj_import(filepath=os.path.join(src, obj))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
    P = [v.co for o in meshes for v in o.data.vertices]
    lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    # (its length along x: turned a quarter if it lies along y)
    if hi.y - lo.y > hi.x - lo.x:
        for o in meshes:
            o.data.transform(Matrix.Rotation(1.5708, 4, "Z"))
        P = [v.co for o in meshes for v in o.data.vertices]
        lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    k = length / (hi.x - lo.x)
    M = Matrix.Scale(k, 4) @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    m = bpy.data.materials.new("food_pbr")
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.75
    def img(suffix, nonColor=False):
        f = next(x for x in os.listdir(src) if x.endswith(suffix))
        im = bpy.data.images.load(os.path.join(src, f)); im.scale(TEX, TEX)
        if nonColor: im.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = im; return t
    nt.links.new(img("_Color.jpg").outputs["Color"], bsdf.inputs["Base Color"])
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(img("_NormalGL.jpg", True).outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    for o in meshes:
        o.data.transform(M)
        o.data.materials.clear(); o.data.materials.append(m)
        for p in o.data.polygons:
            p.use_smooth = True
    d = (hi - lo) * k
    print(name, "from", asset, "size", tuple(round(v, 3) for v in d))
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), f"food_{name}.glb")
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "MESH")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_image_format="JPEG",
                              export_jpeg_quality=85)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


for n in FOOD:
    build(n)
