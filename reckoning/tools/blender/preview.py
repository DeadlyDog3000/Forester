"""Render a quick look at a model, to check it before it goes in the game.

    blender -b --factory-startup -P reckoning/tools/blender/preview.py -- models/cabin.glb out.png [azimuth] [elevation]
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
az = math.radians(float(argv[2])) if len(argv) > 2 else math.radians(-35)
el = math.radians(float(argv[3])) if len(argv) > 3 else math.radians(18)

sc = bpy.context.scene
for ob in list(sc.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=src)
# show the vertex colour, as the game does (it multiplies the material by it)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf and not bsdf.inputs["Base Color"].is_linked:
        vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        m.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])

pts = [ob.matrix_world @ Vector(c) for ob in sc.objects if ob.type == "MESH" for c in ob.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
centre, size = (lo + hi) / 2, (hi - lo).length
# optional: look closely at one height (a face, say) from a given distance
if len(argv) > 5:
    centre, size = Vector((0, 0, float(argv[4]))), float(argv[5])

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 50
dist = size * 1.5
# the front of a model is -Y
cam.location = centre + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4
sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.5, 0.55, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.8

sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 1000, 700
sc.render.filepath = out
sc.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
bpy.ops.render.render(write_still=True)
print("rendered", out)
