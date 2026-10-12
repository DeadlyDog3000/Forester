# ===========================================================================
#  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
# ===========================================================================
# Item pictures in the game's own pixel style (32 x 32, as the sprites in assets/sprites/items are): each thing drawn
# as a few parts laid along its length on the slant — a polygon each, in (along, across) units of a pixel — filled
# with its stuff's three shades (lit along its top edge, dark along its bottom), a sharp highlight where metal catches
# the light, and the dark outline round the whole. Run it to remake art/item_musket.png, item_pistol.png and
# item_battleaxe.png.
import math, os
from PIL import Image

N = 32
STUFF = {
    "wood":  [(0x8e, 0x5c, 0x33), (0x6b, 0x42, 0x26), (0x48, 0x2b, 0x17)],
    "dwood": [(0x6a, 0x45, 0x28), (0x52, 0x33, 0x1d), (0x38, 0x22, 0x13)],
    "iron":  [(0x9a, 0xa0, 0xa8), (0x62, 0x67, 0x6f), (0x38, 0x3b, 0x41)],
    "gunmetal": [(0x7a, 0x80, 0x88), (0x4c, 0x51, 0x58), (0x2c, 0x2f, 0x34)],
    "steel": [(0xd8, 0xdc, 0xe0), (0xa4, 0xaa, 0xb2), (0x6c, 0x72, 0x7a)],
    "brass": [(0xec, 0xc8, 0x6c), (0xc0, 0x96, 0x44), (0x86, 0x64, 0x28)],
    "flint": [(0x9a, 0x94, 0x88), (0x76, 0x70, 0x66), (0x50, 0x4c, 0x44)],
    "leather": [(0x7a, 0x4a, 0x2a), (0x5c, 0x36, 0x1e), (0x40, 0x24, 0x12)],
}
OUTLINE = (0x1e, 0x16, 0x10)

def inside(poly, u, v):
    c = False
    for i in range(len(poly)):
        (u0, v0), (u1, v1) = poly[i], poly[i - 1]
        if (v0 > v) != (v1 > v) and u < (u1 - u0) * (v - v0) / (v1 - v0) + u0: c = not c
    return c

def draw(parts, origin, ang, out):
    """parts: [(stuff, polygon[(u, v)])] in order, later on top. origin: pixel where u = v = 0; ang: the slant, up from
    the right (radians). v is across, toward the top of the thing (up-left of the line along it)."""
    cu, su = math.cos(ang), -math.sin(ang)          # (along: right and up the picture)
    cv, sv = -math.sin(ang), -math.cos(ang)         # (across: up and to the left)
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0)); px = img.load()
    owner = {}
    for y in range(N):
        for x in range(N):
            dx, dy = x + 0.5 - origin[0], y + 0.5 - origin[1]
            u, v = dx * cu + dy * su, dx * cv + dy * sv
            for k, (stuff, poly) in enumerate(parts):
                if inside(poly, u, v): owner[(x, y)] = (k, stuff, u, v)
    for (x, y), (k, stuff, u, v) in owner.items():
        poly = parts[k][1]
        # (shade by where in its part across: the top third lit, the bottom third dark)
        vs = [p[1] for p in poly]; us = [p[0] for p in poly]
        lo, hi = min(vs), max(vs); t = (v - lo) / ((hi - lo) or 1)
        # (an edge of another part's pixel above it reads as the top of this one, too)
        above = (x - round(cv), y - round(sv))
        top = above not in owner or owner[above][0] != k
        # (a thin part — a barrel, a haft — is its middle tone with a dark underside; only a broad one gets the light)
        thin = hi - lo < 2.6
        shade = (1 if thin else 0) if (t > 0.66 or top) else 2 if t < 0.3 else 1
        px[x, y] = STUFF[stuff][shade] + (255,)
    # the outline: every empty pixel touching a drawn one
    for y in range(N):
        for x in range(N):
            if (x, y) in owner: continue
            if any((x + a, y + b) in owner for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): px[x, y] = OUTLINE + (255,)
    img.save(out)

def rect(u0, u1, v0, v1): return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]

HERE = os.path.dirname(os.path.abspath(__file__)); ART = os.path.join(HERE, "..", "art")

# the musket: butt bottom-left, muzzle top-right, on the long diagonal
A = math.radians(45)
draw([
    ("wood", [(0, -3.4), (2, -3.3), (9, -1.6), (12, -1.3), (15, -1.5), (17, -1.1), (33, -0.7), (33, 0.5), (13, 0.6), (10, 0.4), (0, 0.9)]),
    ("brass", [(-0.6, -3.5), (0.7, -3.5), (0.7, 1.0), (-0.6, 1.0)]),                  # the butt plate
    ("gunmetal", rect(12, 39.6, 0.5, 1.7)),                                           # the barrel
    ("gunmetal", rect(12, 17.5, 0.6, 2.0)),                                           # (the breech, heavier)
    ("brass", rect(23, 24.1, -0.8, 1.9)), ("brass", rect(29.5, 30.6, -0.7, 1.9)),     # the bands
    ("brass", [(11.5, -1.4), (14.8, -1.6), (14.4, -2.6), (12, -2.6)]),                # the trigger guard
    ("steel", [(13.2, 1.9), (14.4, 1.9), (15.2, 3.1), (14.4, 3.6), (13.6, 2.8)]),     # the cock
    ("flint", rect(14.6, 15.6, 2.6, 3.4)),
    ("steel", rect(16.2, 17, 1.8, 2.9)),                                              # the steel over the pan
    ("brass", rect(38.6, 39.8, 1.6, 2.3)),                                            # the foresight
], (2.6, 29.4), A, os.path.join(ART, "item_musket.png"))

# the pistol: level-ish, the muzzle to the right, the grip dropping steeply to its brass pommel
A = math.radians(16)
draw([
    ("wood", [(25, 0.3), (8, 0.6), (4, 0.3), (1, -1.6), (-1.6, -5.6), (-4.4, -9.6), (-1, -9.2), (0.8, -6.2), (3.2, -2.4), (6, -1.5), (25, -1.0)]),
    ("brass", [(-1.6, -8.4), (-0.4, -9.6), (-1.2, -11.2), (-3.6, -11.6), (-5, -10.4), (-4.4, -8.8)]),   # the pommel
    ("gunmetal", rect(6.5, 29.5, 0.2, 1.8)),
    ("gunmetal", rect(6.5, 12, 0.2, 2.2)),
    ("brass", rect(24.5, 26, -1.0, 2.0)),                                             # the muzzle cap
    ("brass", [(5.6, -1.4), (9.6, -1.2), (9, -3.2), (6, -3.2)]),                      # the trigger guard
    ("steel", [(6.6, 2.1), (7.8, 2.1), (8.8, 3.6), (7.8, 4.1), (7, 3.1)]),            # the cock
    ("flint", rect(8.2, 9.2, 3.0, 3.9)),
    ("steel", rect(9.8, 10.6, 2.0, 3.3)),
], (5.0, 19.0), A, os.path.join(ART, "item_pistol.png"))

# the battle axe: a long haft on the diagonal, and at its top a broad bearded head — the edge a crescent, the beard
# sweeping back down toward the hand — its edge bright where it was ground
A = math.radians(45)
EDGE = [(31.0, 9.4), (30.3, 10.9), (28.2, 11.8), (25.0, 12.0), (21.8, 11.6), (19.2, 10.5), (17.2, 8.9)]
draw([
    ("wood", rect(0, 30.5, -0.85, 0.85)),
    ("leather", rect(1.6, 7.4, -1.15, 1.15)),                                         # the grip, wrapped
    ("iron", rect(-0.7, 0.7, -1.1, 1.1)),                                             # the butt cap
    ("iron", [(22.6, 1.1), (27.6, 1.1), (28.8, 3.6), (30.4, 7.0)] + EDGE + [(18.4, 7.4), (20.4, 5.8), (21.8, 4.0), (22.4, 2.4)]),
    ("steel", EDGE + [(18.3, 8.2), (20.0, 9.3), (22.2, 10.2), (25.0, 10.6), (27.9, 10.4), (29.7, 9.6), (30.2, 8.2)]),
    ("iron", rect(22.6, 28.4, -1.3, 1.3)),                                            # the socket
    ("iron", [(24.0, -1.3), (27.0, -1.3), (26.0, -3.6), (25.0, -3.6)]),               # the spike behind
    ("iron", rect(28.4, 30.8, -0.7, 0.7)),                                            # the top
], (5.0, 30.0), A, os.path.join(ART, "item_battleaxe.png"))
# the dagger: a short blade on the slant, a brass cross and pommel, a dark grip
A = math.radians(45)
draw([
    ("dwood", rect(0, 8, -1.3, 1.3)),
    ("brass", [(-2.2, 0), (-1.6, -1.6), (0, -2.0), (1.2, -1.2), (1.2, 1.2), (0, 2.0), (-1.6, 1.6)]),     # the pommel
    ("brass", rect(8, 9.6, -4.6, 4.6)),                                               # the cross
    ("brass", rect(7.6, 10, -5.2, -4.2)), ("brass", rect(7.6, 10, 4.2, 5.2)),          # (its knobs)
    ("steel", [(9.6, -1.6), (24, -0.9), (29.5, 0), (24, 0.9), (9.6, 1.6)]),           # the blade
    ("iron", [(9.6, -0.35), (24, -0.2), (24, 0.2), (9.6, 0.35)]),                    # (its ridge)
], (5.5, 26.5), A, os.path.join(ART, "item_dagger.png"))
print("made item_dagger.png and item_musket.png, item_pistol.png, item_battleaxe.png")
