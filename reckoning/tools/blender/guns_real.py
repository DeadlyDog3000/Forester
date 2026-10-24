"""The pistol in your hand as a real one: pistol.glb from djonvincent's flintlock pistol (CC0, opengameart.org/content/
flintlock), modelled for a first-person game — walnut stock, browned barrel, a brass butt cap and furniture, and the lock
with its flint in the cock's jaws.

Laid as the game's built one was (models.js makePistol): the barrel along +y, the muzzle at y 0.334 with the bore 2.2 cm
above the origin, the lock on the right (+x), the butt dropping down and back to -y, -z; and its materials named
pistol_pbr (the walnut, as photographed), pistol_iron, pistol_brass, pistol_steel. Written z-up as it stands (the game reads it
so).

And the musket, which no one has made free to use as well as that: the game's own (arms.py, models/musket.glb) given
the real thing's surfaces — its walnut stock from a photograph of walnut, the grain running along it as a gunsmith
lays it; the barrel browned iron and the furniture brass, from photographs of worn metal (Poly Haven, CC0).

    blender -b --factory-startup -P reckoning/tools/blender/guns_real.py [-- pistol musket]

The sources are fetched once into tools/blender/assets/oga_flint and assets/ph_tex (not kept in the repository); run
arms.py before this, for the musket, since this lays its surfaces over the built one.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "oga_flint", "FlintlockPistolWithFlint.blend")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))
MUZZLE_Y, BUTT_Y, BORE_Z = 0.334, -0.124, 0.022
TEX = 512

# each of the source's materials: the game's name for it, and how the photograph's colour is lit
KIND = {"Wood": ("pistol_pbr", 0.0, 0.55), "Metal": ("pistol_iron", 0.85, 0.42), "Copper": ("pistol_brass", 0.9, 0.35),
        "Flint": ("pistol_steel", 0.0, 0.7)}  # (the stock "_pbr": its photograph, no grain laid over it)


def material(name, metal, rough, diffuse, normal):
    m = bpy.data.materials.new(name)
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Metallic"].default_value = metal; bsdf.inputs["Roughness"].default_value = rough
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = diffuse; nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if normal:
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = normal; tn.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def pistol():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        for md in list(o.modifiers):
            o.modifiers.remove(md)
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4); o.parent = None
    diffuse = next(im for im in bpy.data.images if im.filepath.endswith("Flintlock.png"))
    normal = next((im for im in bpy.data.images if "NRM" in im.name), None)
    for im in (diffuse, normal):
        if im and max(im.size) > TEX:
            im.scale(TEX, TEX)
    mats = {k: material(n, mt, r, diffuse, normal) for k, (n, mt, r) in KIND.items()}
    for o in meshes:
        for i, s in enumerate(o.material_slots):
            if s.material and s.material.name in mats:
                o.material_slots[i].material = mats[s.material.name]
    # (the barrel along +y, the lock — on the source's -y — to the right, +x)
    R = Matrix.Rotation(math.pi / 2, 4, "Z")
    for o in meshes:
        o.data.transform(R)
    P = [v.co for o in meshes for v in o.data.vertices]
    y0, y1 = min(p.y for p in P), max(p.y for p in P)
    k = (MUZZLE_Y - BUTT_Y) / (y1 - y0)
    # (the bore: the middle of the barrel a little back from the muzzle, where nothing but the barrel is)
    bar = bpy.data.objects["Cylinder.003"].data
    band = [v.co for v in bar.vertices if y1 - (y1 - y0) * 0.2 < v.co.y < y1 - (y1 - y0) * 0.12]
    zb = (min(p.z for p in band) + max(p.z for p in band)) / 2
    xb = (min(p.x for p in band) + max(p.x for p in band)) / 2
    M = Matrix.Translation((0, BUTT_Y, BORE_Z)) @ Matrix.Scale(k, 4) @ Matrix.Translation((-xb, -y0, -zb))
    for o in meshes:
        o.data.transform(M)
    print("pistol scale", round(k, 4), "bore z", round(zb, 3), "x", round(xb, 3))
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), "pistol.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_yup=False,
                              export_image_format="JPEG", export_jpeg_quality=85, export_animations=False)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


PH = os.path.join(HERE, "assets", "ph_tex")
# each stuff of the musket: the photograph, how it's tinted (multiplied, 0..1), metal, roughness, and how many times it
# repeats along a metre
SKIN = {"wood": ("european_walnut_veneer_04", (0.78, 0.6, 0.5), 0.0, 0.5, 3.0),
        "iron": ("rusty_metal_02", (0.34, 0.3, 0.27), 0.7, 0.5, 6.0),
        "brass": ("metal_plate", (2.3, 1.75, 0.8), 0.85, 0.35, 8.0),
        "steel": ("metal_plate", (1.5, 1.6, 1.85), 0.85, 0.3, 8.0)}


def tinted(asset, tint, name):
    """the photograph multiplied by its tint, an image of its own (the exporter keeps one image per map)"""
    import numpy as np
    im = bpy.data.images.load(os.path.join(PH, f"{asset}_Diffuse.jpg")); im.scale(512, 512)
    px = np.array(im.pixels[:]).reshape(-1, 4); px[:, :3] *= np.array(tint)
    out = bpy.data.images.new(name, 512, 512); out.pixels[:] = px.ravel()
    path = os.path.join(PH, f"{name}.png"); out.filepath_raw = path; out.file_format = "PNG"; out.save()
    bpy.data.images.remove(out); bpy.data.images.remove(im)
    return bpy.data.images.load(path)


def box_uv(ob, per_m):
    """UVs laid so the grain runs along the gun (Blender z, the barrel's line after the import): each face projected
    from the side it faces"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            c = lp.vert.co
            lp[uv].uv = ((c.z, c.y) if ax == 0 else (c.z, c.x) if ax == 1 else (c.x, c.y))
            lp[uv].uv = (lp[uv].uv[0] * per_m, lp[uv].uv[1] * per_m)
    bm.to_mesh(ob.data); bm.free()


def musket():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = os.path.join(MODELS, "musket.glb")
    bpy.ops.import_scene.gltf(filepath=src)
    made = {}
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        for a in list(o.data.color_attributes):
            o.data.color_attributes.remove(a)
        for i, slot in enumerate(o.material_slots):
            part = (slot.material.name if slot.material else "").split("_")[-1].split(".")[0]
            if part not in SKIN:
                continue
            asset, tint, metal, rough, per_m = SKIN[part]
            name = "musket_pbr" if part == "wood" else f"musket_{part}"
            if part not in made:
                old = bpy.data.materials.get(name)
                if old:
                    old.name = name + "_built"
                made[part] = material(name, metal, rough, tinted(asset, tint, f"musket_{part}"), load_normal(asset))
            m = made[part]
            o.material_slots[i].material = m
            box_uv(o, per_m)
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), "musket.glb")
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "MESH")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_image_format="JPEG",
                              export_jpeg_quality=85)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


def load_normal(asset):
    im = bpy.data.images.get(f"{asset}_nor") or bpy.data.images.load(os.path.join(PH, f"{asset}_nor_gl.jpg"))
    im.name = f"{asset}_nor"; im.scale(512, 512)
    return im


if __name__ == "__main__":
    for n in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["pistol", "musket"]):
        {"pistol": pistol, "musket": musket}[n]()
