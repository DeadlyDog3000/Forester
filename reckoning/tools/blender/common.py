"""Shared by every model script in this folder.

Each model is built in code, in its own Blender scene (so whatever else is open
in Blender is left alone), and exported as a .glb into reckoning/models/.

    blender -b --factory-startup -P reckoning/tools/blender/cabin.py

(in a throwaway Blender: each script empties the scene it runs in.)

Blender's axes: X is width, -Y is the front (the glTF exporter turns it into
the game's forward), Z is up, and 1 unit is a metre. Origins sit at the base.

Colour lives in a vertex colour layer, not in textures: the game multiplies it
by the material and lays its own grain over everything, so geometry and colour
are all a model needs.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))


def rgb(hexv, jitter=0.0, rnd=random):
    """0xRRGGBB to linear RGBA, with an optional lightness jitter."""
    r, g, b = ((hexv >> 16) & 255) / 255, ((hexv >> 8) & 255) / 255, (hexv & 255) / 255
    k = 1 + (rnd.random() - 0.5) * 2 * jitter
    lin = lambda c: (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (min(1, lin(r) * k), min(1, lin(g) * k), min(1, lin(b) * k), 1.0)


def mat_tr(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(loc), Euler(rot, "XYZ"), Vector(scale))


class Kit:
    """Many shapes, one mesh per material, each shape its own vertex colour."""

    def __init__(self, name, seed=1):
        self.name = name
        self.rnd = random.Random(seed)
        self.bms = {}
        self.mats = {}

    def material(self, key, roughness=0.9, metallic=0.0):
        if key not in self.mats:
            m = bpy.data.materials.new(f"{self.name}_{key}")
            m.use_nodes = True
            bsdf = m.node_tree.nodes.get("Principled BSDF")
            bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
            bsdf.inputs["Roughness"].default_value = roughness
            bsdf.inputs["Metallic"].default_value = metallic
            # show the vertex colour in Blender's own viewport too
            attr = m.node_tree.nodes.new("ShaderNodeVertexColor")
            attr.layer_name = "Col"
            m.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
            self.mats[key] = m
        return self.mats[key]

    def _bm(self, key):
        if key not in self.bms:
            bm = bmesh.new()
            bm.loops.layers.float_color.new("Col")
            self.bms[key] = bm
            self.material(key)
        return self.bms[key]

    def _paint(self, bm, faces, color, end_color=None, axis=None):
        layer = bm.loops.layers.float_color["Col"]
        for f in faces:
            c = color
            if end_color is not None and axis is not None and abs(f.normal.dot(axis)) > 0.85:
                c = end_color
            for l in f.loops:
                l[layer] = c

    def _finish_shape(self, bm, verts, matrix, color, end_color=None, local_axis=None):
        bmesh.ops.transform(bm, matrix=matrix, verts=verts)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.normal_update()
        axis = None
        if local_axis is not None:
            axis = (matrix.to_3x3() @ Vector(local_axis)).normalized()
        self._paint(bm, faces, color, end_color, axis)
        return verts

    def cylinder(self, key, r1, r2, depth, matrix, color, segs=10, end_color=None, wobble=0.0):
        """A cylinder along its local Z, centred."""
        bm = self._bm(key)
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
        verts = res["verts"]
        if wobble:
            for v in verts:
                if abs(v.co.z) < depth / 2 - 1e-4 or True:
                    k = 1 + (self.rnd.random() - 0.5) * wobble
                    v.co.x *= k; v.co.y *= k
        return self._finish_shape(bm, verts, matrix, color, end_color, (0, 0, 1))

    def box(self, key, size, matrix, color, bevel=0.0):
        bm = self._bm(key)
        res = bmesh.ops.create_cube(bm, size=1.0)
        verts = res["verts"]
        bmesh.ops.scale(bm, vec=Vector(size), verts=verts)
        if bevel:
            edges = list({e for v in verts for e in v.link_edges})
            got = bmesh.ops.bevel(bm, geom=verts + edges, offset=bevel, segments=1, affect="EDGES", profile=0.5)
            verts = list({v for v in verts if v.is_valid} | set(got.get("verts", [])))
        return self._finish_shape(bm, verts, matrix, color)

    def rock(self, key, radius, matrix, color, lumps=0.25, subdiv=1):
        bm = self._bm(key)
        res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
        verts = res["verts"]
        for v in verts:
            v.co *= 1 + (self.rnd.random() - 0.5) * lumps
        return self._finish_shape(bm, verts, matrix, color)

    def poly(self, key, pts, color):
        """One flat face from a list of points (already in place)."""
        bm = self._bm(key)
        verts = [bm.verts.new(p) for p in pts]
        f = bm.faces.new(verts)
        f.normal_update()
        self._paint(bm, [f], color)
        return verts

    def build(self, scene, smooth=()):
        objs = []
        for key, bm in self.bms.items():
            me = bpy.data.meshes.new(f"{self.name}_{key}")
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(self.mats[key])
            # the exporter writes the active colour layer as COLOR_0, the one the game reads
            me.color_attributes.active_color_name = "Col"
            me.color_attributes.render_color_index = 0
            if key in smooth:
                me.shade_smooth()
            ob = bpy.data.objects.new(f"{self.name}_{key}", me)
            scene.collection.objects.link(ob)
            objs.append(ob)
        self.bms = {}
        return objs


def fresh_scene(name):
    """The current scene, emptied, for this model. Run the scripts in a throwaway
    Blender (blender -b --factory-startup -P script.py) — they clear its scene."""
    sc = bpy.context.scene
    sc.name = name
    for ob in list(sc.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)
    sc.unit_settings.system = "METRIC"
    return sc


def export(scene, filename, objects=None, animations=False):
    """Write scene (or just `objects`) to reckoning/models/<filename>."""
    os.makedirs(MODELS, exist_ok=True)
    path = os.path.join(MODELS, filename)
    objs = objects or list(scene.objects)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_animations=animations, export_materials="EXPORT")
    for ob in scene.objects:
        ob.select_set(ob in objs)
    for opt in (dict(export_vertex_color="ACTIVE", export_all_vertex_colors=False), dict(export_vertex_color="ACTIVE"), dict(export_colors=True), {}):
        try:
            bpy.ops.export_scene.gltf(**kw, **opt)
            break
        except TypeError:
            continue
    return path
