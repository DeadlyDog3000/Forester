"""Clips from Quaternius's Universal Animation Library (CC0), put onto our own people's rigs.

The library's skeleton has the same bones as ours, by the same names (with a DEF- in front) — but its proportions
are its own and it stands in a T-pose, where ours stand with their arms down. So nothing is copied as it is: each of
our bones is turned, frame by frame, to point where the library's bone points and to carry its twist, and the hips
move as the library's do, scaled to our height. The clip comes out as one of our own, keyed on our rig.

    from ual import add_ual_clips
    add_ual_clips(rig, [("Sword_Attack", "Slash"), ...])

The library itself is tools/blender/assets/ual-standard (fetched once; not kept in the repository).
"""
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
UAL = os.path.join(HERE, "assets", "ual-standard", "Animation Library[Standard]", "Godot", "AnimationLibrary_Godot_Standard.glb")

# our bone ← the library's
MAP = {"hips": "DEF-hips", "spine": "DEF-spine.001", "chest": "DEF-spine.003", "neck": "DEF-neck", "head": "DEF-head"}
for s in "LR":
    for b in ("shoulder", "upper_arm", "forearm", "hand", "thigh", "shin", "foot"):
        MAP[f"{b}.{s}"] = f"DEF-{b}.{s}"


def _depth(b):
    n = 0
    while b.parent:
        n += 1
        b = b.parent
    return n


def add_ual_clips(rig, wanted):
    """wanted: [(library clip, our name)]. Adds each as an action on an NLA track of that name. Returns the names made."""
    if not os.path.exists(UAL):
        print("ual: no library at", UAL)
        return []
    scene = bpy.context.scene
    objs0, acts0 = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=UAL)
    new = [o for o in bpy.data.objects if o not in objs0]
    src = next((o for o in new if o.type == "ARMATURE"), None)
    lib_acts = [a for a in bpy.data.actions if a not in acts0]
    made = []
    try:
        if not src:
            return []
        bpy.context.view_layer.update()
        Ws, Wt = src.matrix_world.copy(), rig.matrix_world.copy()
        Wt_q_inv = Wt.to_quaternion().inverted()
        names = [t for t in MAP if t in rig.pose.bones and MAP[t] in src.pose.bones]
        order = sorted(names, key=lambda t: _depth(rig.data.bones[t]))
        # each bone's offset: the library bone's rest frame, turned so it points along ours at rest
        off = {}
        for t in names:
            Ms = Ws @ src.data.bones[MAP[t]].matrix_local
            Mt = Wt @ rig.data.bones[t].matrix_local
            ds = (Ms.to_3x3() @ Vector((0, 1, 0))).normalized()
            dt = (Mt.to_3x3() @ Vector((0, 1, 0))).normalized()
            A = dt.rotation_difference(ds)
            off[t] = Ms.to_quaternion().inverted() @ A @ Mt.to_quaternion()
        hs_rest = Ws @ src.data.bones["DEF-hips"].head_local
        ht_rest = Wt @ rig.data.bones["hips"].head_local
        k = ht_rest.z / max(0.1, hs_rest.z)
        rig.animation_data_create()
        src.animation_data_create()
        # (nothing else playing on either while it's sampled: the rig's own clips, or the library's tracks)
        muted = [(tr, tr.mute) for o in (rig, src) for tr in o.animation_data.nla_tracks]
        for tr, _ in muted:
            tr.mute = True
        for b in rig.pose.bones:
            b.rotation_mode = "XYZ"
        for lib_name, ours in wanted:
            a0 = bpy.data.actions.get(lib_name)
            if not a0:
                print("ual: no clip", lib_name)
                continue
            src.animation_data.action = a0
            f0, f1 = int(a0.frame_range[0]), int(a0.frame_range[1])
            act = bpy.data.actions.new(ours)
            act.use_fake_user = True
            rig.animation_data.action = act
            prev = {}
            for f in range(f0, f1 + 1):
                scene.frame_set(f)
                # (from the rest pose each frame, so nothing left over from the last)
                for b in rig.pose.bones:
                    b.rotation_euler = (0, 0, 0)
                    b.location = (0, 0, 0)
                bpy.context.view_layer.update()
                for t in order:
                    pbs, pb = src.pose.bones[MAP[t]], rig.pose.bones[t]
                    q_world = (Ws @ pbs.matrix).to_quaternion() @ off[t]
                    rot = (Wt_q_inv @ q_world).to_matrix().to_4x4()
                    if t == "hips":
                        hs = Ws @ pbs.head
                        head_w = ht_rest + (hs - hs_rest) * k
                        head = Wt.inverted() @ head_w
                    else:
                        head = pb.head.copy()
                    pb.matrix = Matrix.Translation(head) @ rot
                    bpy.context.view_layer.update()
                    e = pb.rotation_euler.copy()
                    if t in prev:
                        e.make_compatible(prev[t])
                    pb.rotation_euler = e
                    prev[t] = e.copy()
                    pb.keyframe_insert("rotation_euler", frame=f - f0 + 1)
                    if t == "hips":
                        pb.keyframe_insert("location", frame=f - f0 + 1)
            tr = rig.animation_data.nla_tracks.new()
            tr.name = ours
            tr.strips.new(ours, 1, act)
            tr.mute = True; muted.append((tr, False))   # (quiet while the next is sampled; heard again after)
            rig.animation_data.action = None
            made.append(ours)
        for tr, m in muted:
            tr.mute = m
    finally:
        for b in rig.pose.bones:
            b.rotation_euler = (0, 0, 0)
            b.location = (0, 0, 0)
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        for a in lib_acts:
            bpy.data.actions.remove(a)
    return made
