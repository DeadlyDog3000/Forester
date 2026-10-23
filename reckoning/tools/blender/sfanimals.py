"""The wild animals as real animals: bear.glb, boar.glb, wolf.glb, fox.glb (and more as they're found), from realistic,
sculpted, furred and rigged models their makers gave to everyone under CC BY 4.0 — credited in the game and in
art/ANIMALS.md. Fetched once into tools/blender/assets/sf (not kept in the repository).

For each: only the clips the game wants are kept, renamed for it — Idle, Look, Eat, Walk, Run, Die — the rest dropped
(the bear alone came with 136); textures brought down to 1024; the animal scaled to life, its feet on the ground,
facing -Y here (+Z in the game), as realanimals.py's deer and hare are. Where a model has no walk or no run of its own,
one is made here on its leg bones (gait()): a walk in four beats, a gallop in its pairs, each leg swinging at the hip
or shoulder and folding below as it comes through.

    blender -b --factory-startup -P reckoning/tools/blender/sfanimals.py [-- bear boar ...]
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "sf")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# name: (file, length nose to tail in metres, {game clip: source action (its name after any "Armature|")})
# (a clip given as REST is the animal standing still in its own bind pose; WALK and GALLOP are made on its legs here, from
#  LEGS: each leg's bones from the shoulder or hip down — front left, front right, back left, back right)
REST, WALK, GALLOP = "<rest>", "<walk>", "<gallop>"
ANIMALS = {
    "bear": ("bear/scene.gltf", 1.75, {
        "Idle": "A_StandStraight_SecondaryMoveCalm_1", "Look": "A_StandStraight",
        "Walk": "A_GrazingWalkMedium_F", "Run": "A_RunFast_F", "Die": "A_WalkSlowWounded2Lying"}),
    "boar": ("boar/boar_plain.glb", 1.4, {"Walk": "walk"}),
    "wolf": ("wolf/scene.gltf", 1.45, {"Idle": REST, "Look": "WOLF_DEMO", "Walk": WALK, "Run": GALLOP}),
    "fox": ("fox_b/scene.gltf", 0.95, {"Idle": REST, "Walk": WALK, "Run": GALLOP}),
    # (the draught horse: its rigged body only — the file also carries the unrigged sculpt it was made from, 350,000
    #  vertices, which goes)
    "horse": ("draft_horse/scene.gltf", 1.97, {"Idle": REST, "Walk": WALK, "Run": GALLOP}),
}
SKINNED_ONLY = {"horse"}
# (stray pieces some files carry, well away from the animal: gone)
DROP = {"horse": ["Sphere_0"]}
# (a carriage of the neck different from the model's own: the draught horse held its head bolt upright, and from the
#  saddle its head filled the view — the neck brought forward and down, as a riding horse goes)
NECK = {"horse": [("Bone.001_Armature", -0.32), ("Bone.003_Armature", -0.12), ("Bone.014_Armature", 0.25)]}
LEGS = {
    "wolf": {"FL": ["LegFL1_041", "LegFL2_042", "LegFL3_043"], "FR": ["LegFR1_035", "LegFR2_036", "LegFR3_037"],
             "BL": ["LegBL1_049", "LegBL2_050", "LegBL3_051"], "BR": ["LegBR1_054", "LegBR2_055", "LegBR3_056"], "head": "Head_09"},
    "horse": {"FL": ["Bone.044_Armature", "Bone.046_Armature", "Bone.048_Armature"], "FR": ["Bone.043_Armature", "Bone.045_Armature", "Bone.047_Armature"],
              "BL": ["Bone.034_Armature", "Bone.036_Armature", "Bone.038_Armature"], "BR": ["Bone.033_Armature", "Bone.035_Armature", "Bone.037_Armature"], "head": "Bone.016_Armature"},
    "fox": {"FL": ["Fox_ L UpperArm_00", "Fox_ L Forearm_019", "Fox_ L Hand_020"], "FR": ["Fox_ R UpperArm_023", "Fox_ R Forearm_024", "Fox_ R Hand_025"],
            "BL": ["Fox_ L Thigh_03", "Fox_ L Calf_04", "Fox_ L HorseLink_05"], "BR": ["Fox_ R Thigh_07", "Fox_ R Calf_08", "Fox_ R HorseLink_09"], "head": "Fox_ Head_016"},
}


def smooth(t):
    return t * t * (3 - 2 * t)


def key_all(arm, f):
    for pb in arm.pose.bones:
        pb.keyframe_insert("location", frame=f); pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("scale", frame=f)


def rest_action(arm, name):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    carriage(arm)
    key_all(arm, 0); key_all(arm, 24)
    return act


def carriage(arm):
    name = arm.get("animal")
    if name not in NECK or name not in LEGS:
        return
    lg, B = LEGS[name], arm.data.bones
    up = (B[lg["BL"][0]].head_local - B[lg["BL"][-1]].tail_local).normalized()
    fwd = B[lg["head"]].head_local - (B[lg["BL"][0]].head_local + B[lg["BR"][0]].head_local) / 2
    fwd = (fwd - up * fwd.dot(up)).normalized()
    L = fwd.cross(up).normalized()
    for bn, a in NECK[name]:
        pb = arm.pose.bones[bn]
        pb.rotation_quaternion = Quaternion((pb.bone.matrix_local.to_3x3().inverted() @ L).normalized(), a)


def gait_action(arm, name, legs, kind):
    """A gait on the legs: each upper bone swung about the body's side-to-side axis (forward as it reaches, back as the
    foot pushes the ground behind), the joints below folding as the foot is lifted through and straightening to land."""
    B = arm.data.bones
    hip, foot = B[legs["BL"][0]].head_local, B[legs["BL"][-1]].tail_local
    up = (hip - foot).normalized()
    fwd = (B[legs["head"]].head_local - (B[legs["BL"][0]].head_local + B[legs["BR"][0]].head_local) / 2)
    fwd = (fwd - up * fwd.dot(up)).normalized()
    L = fwd.cross(up).normalized()                     # (turning about this by +θ swings a hanging foot forward)
    walk = kind == WALK
    N = 24 if walk else 14
    off = {"BL": 0.0, "FL": 0.25, "BR": 0.5, "FR": 0.75} if walk else {"BL": 0.0, "BR": 0.1, "FL": 0.5, "FR": 0.62}
    duty, A, F = (0.64, 0.32, 0.75) if walk else (0.36, 0.62, 1.25)
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for f in range(N + 1):
        u0 = f / N
        for pb in arm.pose.bones:
            pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
        for leg, o in off.items():
            u = (u0 + o) % 1
            if u < duty:
                th, fold = A - 2 * A * (u / duty), 0.0
            else:
                q = (u - duty) / (1 - duty)
                th, fold = -A + 2 * A * smooth(q), math.sin(math.pi * q) * F
            front = leg[0] == "F"
            # (a fore leg folds at the knee, the foot tucked back; a hind at the stifle forward and the hock back)
            parts = [th, 0.35 * fold, -1.0 * fold] if front else [th + 0.15 * fold, -0.75 * fold, 0.95 * fold]
            for bn, a in zip(legs[leg], parts):
                pb = arm.pose.bones[bn]
                ax = (pb.bone.matrix_local.to_3x3().inverted() @ L).normalized()
                pb.rotation_quaternion = Quaternion(ax, a)
        carriage(arm)
        key_all(arm, f)
    return act
TEX = 1024


def kept(src_name, want):
    return src_name.split("|")[-1] == want


def descendants(o):
    out = [o]
    for c in o.children:
        out += descendants(c)
    return out


def build(name):
    fn, length, clips = ANIMALS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, fn))
    top = next(o for o in bpy.data.objects if o.parent is None and o.name.startswith("Sketchfab_model"))
    keep = set(descendants(top))
    for o in list(bpy.data.objects):
        if o not in keep or o.name in DROP.get(name, ()) or (name in SKINNED_ONLY and o.type == "MESH" and not any(m.type == "ARMATURE" for m in o.modifiers)):
            bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm["animal"] = name
    # (every face turned to face outward, and its shading worked out afresh: some of these files carry their normals
    #  pointing in, and lit, the animal went near black on its sunny side)
    import bmesh
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        me = o.data
        if me.has_custom_normals:
            bpy.context.view_layer.objects.active = o
            with bpy.context.temp_override(object=o, active_object=o):
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
    # the clips: those wanted, renamed for the game; every other one gone (and those made here, made)
    names = {}
    for game, want in clips.items():
        if want in (REST, WALK, GALLOP):
            continue
        a = next((a for a in bpy.data.actions if kept(a.name, want)), None)
        if not a:
            print("MISSING", name, want)
            continue
        names[a.name] = game
    for a in list(bpy.data.actions):
        if a.name in names:
            a.name = names[a.name]; a.use_fake_user = True
        else:
            bpy.data.actions.remove(a)
    for game, want in clips.items():
        if want == REST:
            rest_action(arm, game).use_fake_user = True
        elif want in (WALK, GALLOP):
            gait_action(arm, game, LEGS[name], want).use_fake_user = True
    # measured standing (its idle's first frame, or the walk's), to scale it to life and set it on the ground
    first = bpy.data.actions.get("Idle") or bpy.data.actions.get("Walk")
    if first:
        arm.animation_data_create(); arm.animation_data.action = first
        try:
            arm.animation_data.action_slot = first.slots[0]
        except Exception:
            pass
    bpy.context.scene.frame_set(int(first.frame_range[0]) if first else 0)
    bpy.context.view_layer.update()
    # which way is up and which forward, in the world as it came in: from its legs (hip over foot) and from the pelvis to
    # its head, where the legs are named — some come in on their sides or standing on their tails; else Z is up and the
    # head bone says forward
    W = arm.matrix_world.to_3x3()
    head = next((b for b in arm.pose.bones if "head" in b.name.lower()), None)
    if name in LEGS:
        lg = LEGS[name]; B = arm.data.bones
        up = (W @ (B[lg["BL"][0]].head_local - B[lg["BL"][-1]].tail_local)).normalized()
        fwd = W @ (B[lg["head"]].head_local - (B[lg["BL"][0]].head_local + B[lg["BR"][0]].head_local) / 2)
    else:
        up = Vector((0, 0, 1))
        fwd = (arm.matrix_world @ head.head) - (arm.matrix_world @ arm.pose.bones[0].head) if head else Vector((0, -1, 0))
    fwd = (fwd - up * fwd.dot(up)).normalized()
    side = fwd.cross(up)
    # (the turn that puts forward at -Y and up at +Z)
    src = Matrix((side, fwd, up)).transposed()           # columns: its side, its forward, its up
    # (its side goes where forward × up does when forward is −Y and up +Z: to −X — a turn, not a mirror; mirrored, every
    #  face was turned inside out, and the game, drawing only their outsides, lit the animal from within)
    dst = Matrix(((-1, 0, 0), (0, -1, 0), (0, 0, 1))).transposed()
    R3 = dst @ src.inverted()
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        me = o.evaluated_get(dg).to_mesh()
        for v in me.vertices:
            p = R3 @ (o.matrix_world @ v.co)
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
        o.evaluated_get(dg).to_mesh_clear()
    dims = hi - lo
    k = length / dims.y
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    print(name, "dims", tuple(round(d, 3) for d in dims), "scale", round(k, 5))
    # a new root over it all: turned upright and head to -Y, scaled, centred, feet on the ground
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    top.parent = root
    root.matrix_world = Matrix.Scale(k, 4) @ Matrix.Translation((-cx, -cy, -lo.z)) @ R3.to_4x4()
    # textures down to size, as JPEG on export
    for im in bpy.data.images:
        if im.size[0] > TEX or im.size[1] > TEX:
            s = TEX / max(im.size)
            im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
    out = os.path.join(os.environ.get("REAL_OUT", MODELS), f"{name}.glb")
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_animations=True,
                              export_animation_mode="ACTIONS", export_force_sampling=True, export_image_format="JPEG",
                              export_jpeg_quality=82)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(ANIMALS)
    for n in argv:
        build(n)


if __name__ == "__main__":
    main()
