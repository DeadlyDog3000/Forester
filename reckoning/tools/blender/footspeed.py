"""How fast a walk or run carries a person, from the feet: while a foot is down it slides back under the body at the
speed the body must move over the ground for it not to skate. Also how low the feet go (below 0 is into the ground).

    blender -b --factory-startup -P reckoning/tools/blender/footspeed.py -- models/townsman.glb [Walk,Run]
"""
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
src = argv[0]
only = argv[1].split(",") if len(argv) > 1 else ["Walk", "Run"]
sc = bpy.context.scene
for ob in list(sc.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=src)
rig = next(o for o in sc.objects if o.type == "ARMATURE")
fps = sc.render.fps / sc.render.fps_base
foot = {s: next(b for b in rig.pose.bones if b.name.lower().replace("_", ".") in (f"foot.{s.lower()}",)) for s in ("L", "R")}
for a in bpy.data.actions:
    if a.name not in only:
        continue
    rig.animation_data_create(); rig.animation_data.action = a
    try:
        if a.slots: rig.animation_data.action_slot = a.slots[0]
    except AttributeError:
        pass
    f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    track = {s: [] for s in foot}
    for fr in range(f0, f1 + 1):
        sc.frame_set(fr)
        for s, b in foot.items():
            # (the ball of the foot: the bone's tail, in the world; the model faces -Y)
            p = rig.matrix_world @ b.tail
            h = rig.matrix_world @ b.head
            # (the ankle: the glTF importer makes up its own bone lengths, so the tail is no use)
            track[s].append((fr, h.y, h.z))
            if "-v" in argv and s == "L": print(f"  {a.name} {fr} L tail ({p.x:+.3f},{p.y:+.3f},{p.z:+.3f}) head ({h.x:+.3f},{h.y:+.3f},{h.z:+.3f})")
    lo = min(z for s in track for _, _, z in track[s])
    speeds = []
    for s, pts in track.items():
        for (fa, ya, za), (fb, yb, zb) in zip(pts, pts[1:]):
            if za < lo + 0.03 and zb < lo + 0.03:
                speeds.append((yb - ya) * fps / (fb - fa))
    v = sum(speeds) / len(speeds) if speeds else 0
    print(f"{a.name}: planted foot moves {v:+.2f} m/s (the body goes {abs(v):.2f} m/s at full speed); lowest ankle {lo:+.3f} m (0.085 at rest); cycle {(f1 - f0) / fps:.2f}s")

# a clip that stands still (Idle, Talk, Guard): how far the feet drift over the ground, which they shouldn't
for a in bpy.data.actions:
    if a.name not in ("Idle", "Talk", "Guard", "Chop", "Hammer", "Dig", "Reap", "Sow", "Stir", "Punch", "Overhead"):
        continue
    rig.animation_data.action = a
    try:
        if a.slots: rig.animation_data.action_slot = a.slots[0]
    except AttributeError:
        pass
    f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    out = []
    for s, b in foot.items():
        xs, ys, zs = [], [], []
        for fr in range(f0, f1 + 1):
            sc.frame_set(fr); h = rig.matrix_world @ b.head
            xs.append(h.x); ys.append(h.y); zs.append(h.z)
        out.append(f"{s}: drift x {max(xs) - min(xs):.3f} y {max(ys) - min(ys):.3f}, height {min(zs):+.3f}..{max(zs):+.3f}")
    print(f"{a.name}: " + " · ".join(out))
