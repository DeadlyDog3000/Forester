"""A contact sheet of a person's animations: each clip, a row of frames through it, from the side and the front.
To check how they move, before they go in the game.

    blender -b --factory-startup -P reckoning/tools/blender/animsheet.py -- models/townsman.glb outdir [Walk,Run,...] [frames]

Writes outdir/<Clip>_<n>.png for each frame; tools/blender/sheet.py lays them out in one picture.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
only = argv[2].split(",") if len(argv) > 2 and argv[2] else None
N = int(argv[3]) if len(argv) > 3 else 8
os.makedirs(out, exist_ok=True)

sc = bpy.context.scene
for ob in list(sc.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=src)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf and not bsdf.inputs["Base Color"].is_linked:
        vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        m.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
rig = next(o for o in sc.objects if o.type == "ARMATURE")

# a floor, to see the feet meet it
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
floor = bpy.context.active_object
fm = bpy.data.materials.new("floor"); fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.33, 0.3, 1)
floor.data.materials.append(fm)
# a line on the floor every 25 cm, to see a foot slide
for i in range(-8, 9):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, i * 0.25, 0.002))
    c = bpy.context.active_object; c.scale = (2.0, 0.006, 0.001)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.3
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.65, 0.7, 1)
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 260, 380

acts = [a for a in bpy.data.actions if not only or a.name in only]
for a in acts:
    rig.animation_data_create()
    rig.animation_data.action = a
    try:
        if a.slots: rig.animation_data.action_slot = a.slots[0]
    except AttributeError:
        pass
    f0, f1 = a.frame_range
    for view, (dx, dy) in (("side", (1, 0)), ("front", (0, -1))):
        cam.location = Vector((dx * 6, dy * 6, 0.95))
        cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        for i in range(N):
            fr = f0 + (f1 - f0) * i / N
            sc.frame_set(int(fr), subframe=fr - int(fr))
            sc.render.filepath = os.path.join(out, f"{a.name}_{view}_{i}.png")
            bpy.ops.render.render(write_still=True)
    print("clip", a.name, f0, f1)
