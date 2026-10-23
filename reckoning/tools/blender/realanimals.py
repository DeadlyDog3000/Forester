"""The hunted animals as real animals: deer.glb (a roe buck), doe.glb, hare.glb, from CC0 models made for kelgar.org by
Čestmír Dammer (opengameart.org/users/cdmir) — sculpted, textured with painted fur and normal maps, rigged and animated.

Each comes as a .blend from 2013, its materials in the old Blender Internal form that Blender no longer reads: they are
rebuilt here from the textures packed in the file. Cameras, lamps and the ground plane go; the animal is scaled to life
size, turned to face the game's front (-Y here, +Z in the game, as the jointed models were), its root at the ground,
and exported with all its actions (Idle, LookAround, Eat, Run, Die; the hare's Sitting, Guarding, Jump, Running, Dying).

    blender -b --factory-startup --disable-autoexec -P reckoning/tools/blender/realanimals.py [-- deer doe hare]

The sources are fetched once into tools/blender/assets/animals-dl (not kept in the repository):
    opengameart.org/content/old-deer-male (deer1.blend), /deer-female (doe.blend), /rabbit-0 (rabbit.blend)
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "animals-dl")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# name: (file, length nose to tail in metres, {material: (colour image, normal image or None, alpha)})
ANIMALS = {
    # (red deer, as the models are: a stag near two metres long with his antlers, a hind a little smaller)
    "deer": ("deer1.blend", 1.9, {"Body": ("body", "deer-body-normal.png", False), "Head": ("head", "deer-head-normal.png", False),
                                   "Antlers": ("deer-antlers.png", "deer-antlers-normal.png", False), "Eye": (None, None, False)}),
    "doe": ("doe.blend", 1.7, {"body": ("doe-body", None, False), "head": ("doe-head", None, False), "Eye": (None, None, False)}),
    "hare": ("rabbit.blend", 0.55, {"Fur.001": ("rabbot-skinn", "rabbit-NORM", False), "Fur": ("Fur-skin", None, True)}),
}


def material(m, col, nrm, alpha):
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 0.85
    if col is None:
        # (an eye: dark and wet)
        bsdf.inputs["Base Color"].default_value = (0.02, 0.015, 0.01, 1)
        bsdf.inputs["Roughness"].default_value = 0.15
        return
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images[col]
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
        m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
    if nrm and nrm in bpy.data.images:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images[nrm]
        n.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])


def smooth(t):
    return t * t * (3 - 2 * t)


def walk(arm, k, cycle=24, speed=0.9):
    """A walk, which the models don't have: four beats, each foot down in turn — a hind, the fore on the same side, the
    other hind, the other fore — three feet on the ground most of the time. Each foot is put where it goes through its
    leg's IK target: down at the front of its reach, swept back under the body as fast as the body goes over it (so it
    doesn't slide), then lifted and swung forward. One cycle a second at a metre a second: the game sets the pace."""
    from mathutils import Matrix
    stand = bpy.data.actions.get("Stand") or bpy.data.actions.get("Idle")
    arm.animation_data.action = stand
    bpy.context.scene.frame_set(0)
    base = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.rotation_euler.copy(), pb.scale.copy()) for pb in arm.pose.bones}
    act = bpy.data.actions.new("Walk")
    arm.animation_data.action = act
    S = speed * cycle / 24 / k            # (a foot's travel in one stance, in the model's own units)
    lift = 0.12 / k
    duty = 0.65
    feet = {"IK-Backleg_L": 0.0, "IK-Frontleg_L": 0.25, "IK-Backleg_R": 0.5, "IK-Frontleg_R": 0.75}
    for f in range(cycle + 1):
        u0 = f / cycle
        for pb in arm.pose.bones:
            l, q, e, sc = base[pb.name]
            pb.location, pb.rotation_quaternion, pb.rotation_euler, pb.scale = l, q, e, sc
            if pb.name in feet:
                u = (u0 + feet[pb.name]) % 1
                if u < duty:
                    y, z = -S / 2 + S * (u / duty), 0.0
                else:
                    t = (u - duty) / (1 - duty)
                    y, z = S / 2 - S * smooth(t), lift * math.sin(math.pi * t)
                # (from the armature's frame — forward is -Y, up +Z — into the bone's own)
                d = pb.bone.matrix_local.to_3x3().inverted() @ Vector((0, y, z))
                pb.location = l + d
            # (the body rides a little higher as each pair of feet passes under it, and the head nods with the steps)
            if pb.name == "IK-Head":
                d = pb.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, 0.025 / k * math.sin(u0 * 4 * math.pi)))
                pb.location = l + d
            for path in ("location", "rotation_quaternion", "scale"):
                pb.keyframe_insert(path, frame=f)
    arm.animation_data.action = bpy.data.actions.get("Idle") or stand


def build(name):
    fn, length, mats = ANIMALS[name]
    bpy.ops.wm.open_mainfile(filepath=os.path.join(SRC, fn), load_ui=False)
    for o in list(bpy.data.objects):
        if o.type not in ("MESH", "ARMATURE") or (o.type == "MESH" and o.parent is None):
            bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for o in bpy.data.objects:
        if o.type == "MESH":
            # (only the painted UVs; the rest were for baking)
            for u in list(o.data.uv_layers):
                if u.name != "UVMap":
                    o.data.uv_layers.remove(u)
    for mname, (col, nrm, alpha) in mats.items():
        if mname in bpy.data.materials:
            material(bpy.data.materials[mname], col, nrm, alpha)
    # its rest pose measured (the first frame of Idle), to scale it to life and set its feet on the ground
    if arm.animation_data and "Stand" in bpy.data.actions:
        arm.animation_data.action = bpy.data.actions["Stand"]
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        me = o.evaluated_get(dg).to_mesh()
        for v in me.vertices:
            p = o.matrix_world @ v.co
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
        o.evaluated_get(dg).to_mesh_clear()
    dims = hi - lo
    # (its length is along whichever of x and y is longer; the game wants it facing -Y)
    along_y = dims.y >= dims.x
    k = length / (dims.y if along_y else dims.x)
    print(name, "dims", tuple(round(d, 3) for d in dims), "scale", round(k, 4), "along_y", along_y)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    arm.parent = root
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    root.scale = (k, k, k)
    root.location = (-cx * k, -cy * k, -lo.z * k)
    # (which way it faces: its head end is where the neck bone points; turned so the head is toward -Y)
    head = next((b for b in arm.data.bones if "head" in b.name.lower()), None)
    if head:
        hp = arm.matrix_world @ head.head_local
        face = Vector((hp.x - cx, hp.y - cy, 0))
        ang = math.atan2(face.x, -face.y)
        root.rotation_euler = (0, 0, ang)
        root.location = Vector(root.location)
        # (rotate the offset with it)
        c, s = math.cos(ang), math.sin(ang)
        x, y = -cx * k, -cy * k
        root.location = (c * x - s * y, s * x + c * y, -lo.z * k)
        print(name, "head bone", head.name, "turn", round(math.degrees(ang)))
    if name in ("deer", "doe"):
        walk(arm, k)
    for a in bpy.data.actions:
        a.use_fake_user = True
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), f"{name}.glb")
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_animations=True,
                              export_animation_mode="ACTIONS", export_force_sampling=True, export_image_format="JPEG",
                              export_jpeg_quality=85)
    print("wrote", out)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(ANIMALS)
    for n in argv:
        build(n)


if __name__ == "__main__":
    main()
