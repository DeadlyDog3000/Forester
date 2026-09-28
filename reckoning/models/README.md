# Models for Forester: Reckoning

Everything in the game is built in code. Any piece listed here can be replaced
by a model made in Blender, without touching the code:

1. Model it in Blender (units in **metres**, 1 Blender unit = 1 m).
2. Put its **origin at the base** — the feet of a person, the bottom of a tree,
   the ground-floor centre of a cabin.
3. Make it **face Blender's −Y** (the direction the Front view looks from, i.e.
   towards you in Front view). The glTF exporter turns that into the game's
   forward.
4. `File → Export → glTF 2.0`, format **glTF Binary (.glb)**, with
   *Apply Modifiers* on. For characters also tick *Animation*.
5. Save the `.glb` in this folder, and put its file name against its key in
   `manifest.json`, e.g. `"cabin": "cabin.glb"`.
6. Reload the game. A key left empty keeps the built-in model.

| Key | What it replaces | Size to aim for |
|---|---|---|
| `cabin` | the rebuilt cabin in the clearing | 5 m wide (X), 6 m deep, door on the front |
| `cabin_burned` | the burned ruin you find | same footprint as the cabin |
| `spruce` | the trees you can fell | 10 m tall (the game rescales each one) |
| `ship` | the ships in the harbour | 20 m long, lying along the Z axis |
| `brother`, `sister` | you, and the one beside you | about 1.75 m / 1.65 m |
| `father`, `jakob`, `magistrate`, `watchman`, `albers` | the named characters | about 1.8 m |
| `townsman`, `townswoman` | everyone else in Hamburg | about 1.75 m |

## Characters

A character is a rigged mesh (an Armature with the mesh parented to it).
Name its actions so the game can find them — it looks for these words in the
action name: **Idle**, **Walk**, **Run**, **Sit**, **Chop**. Any it cannot find
fall back to Idle. Push each action to an NLA track (or keep them as actions
with *Fake User*) so the exporter includes all of them.

If the armature has a bone named like **hand.R** / **RightHand**, whatever the
character carries (a torch, a lantern, an axe, the magistrate's writ) is put
in that hand.

## Keep it light

It runs in a browser. Aim for under 5,000 triangles for a person, under 3,000
for a tree, and textures of 1024 px or less. Use *Decimate* if a sculpt is
heavier than that.
