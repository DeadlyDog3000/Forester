// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// What goes inside the cabin. Every piece stands in the cabin's own frame
// (x across, z from the back wall to the door), so it turns with the cabin.
// Two straw pallets are there from the first night; the rest is made from
// logs off the stack, or rye, once there is a settlement to spare them.

import { THREE } from "./core.js";
import { P } from "./models.js";

// the room inside the walls, and the places nothing may stand
export const ROOM = { x: 2.25, z: 2.75 };
const KEEP_CLEAR = [
  { x0: -2.3, x1: -0.1, z0: -2.9, z1: -1.55 },   // the hearth and its stone
  { x0: -0.95, x1: 0.95, z0: 1.45, z1: 3 },      // where the door swings
];
// (and the stair, once the cabin is a house)
export function furnishClear(r) { if (!KEEP_CLEAR.some(k => k.stair)) KEEP_CLEAR.push({ x0: r.x0 - 0.1, x1: r.x1 + 0.1, z0: r.z0 - 0.7, z1: r.z1 + 0.2, stair: true }); }

export const FURNITURE = {
  pallet: { name: "Straw pallet", note: "A tick of straw and a blanket. Somewhere to sleep.", rye: 6, w: 0.9, d: 1.9, h: 0.3, bed: true,
    build(b, x, z, ry) {
      b.box(0.9, 0.16, 1.9, x, 0.08, z, 0xb89a62, ry, 0.12);
      const c = Math.cos(ry), s = Math.sin(ry);
      b.box(0.86, 0.06, 1.15, x + 0.35 * s, 0.19, z + 0.35 * c, 0x6a4a3a, ry, 0.06);
      b.box(0.55, 0.1, 0.32, x - 0.7 * s, 0.2, z - 0.7 * c, 0xd8cfb8, ry);
    } },
  bed: { name: "Bed", note: "A frame of split logs off the floor, and the draught.", logs: 4, w: 1.0, d: 2.0, h: 0.9, bed: true,
    build(b, x, z, ry) { P.bed(b, x, z, ry); } },
  table: { name: "Table", note: "Somewhere to eat that isn't your knees.", logs: 3, w: 1.4, d: 0.8, h: 0.85,
    build(b, x, z, ry) { P.table(b, x, z, 1.4, 0.8, ry); } },
  bench: { name: "Bench", note: "Two can sit. Three, if one is Pieter.", logs: 2, w: 1.4, d: 0.34, h: 0.5,
    build(b, x, z, ry) { P.bench(b, x, z, 1.4, ry); } },
  chest: { name: "Chest", note: "For the key, and the things worth keeping.", logs: 3, w: 0.9, d: 0.5, h: 0.6,
    build(b, x, z, ry) {
      b.box(0.9, 0.5, 0.5, x, 0.25, z, 0x6a4a2e, ry, 0.08);
      b.box(0.94, 0.08, 0.54, x, 0.53, z, 0x5a3e24, ry);
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const o of [-0.3, 0.3]) b.box(0.06, 0.52, 0.52, x + o * c, 0.27, z - o * s, 0x2a2724, ry);
    } },
  shelf: { name: "Shelf", note: "Pots, a lamp, the ledger.", logs: 2, w: 1.2, d: 0.4, h: 2.2,
    build(b, x, z, ry) { P.shelf(b, x, z, 1.2, ry); } },
  barrel: { name: "Rye barrel", note: "Grain kept off the floor, away from the mice.", logs: 2, w: 0.7, d: 0.7, h: 1.2,
    build(b, x, z, ry) { P.barrel(b, x, z); P.sack(b, x + 0.05, z, 0.85, ry); } },
};

// the footprint of a piece in the room: [half across, half deep]
export function halfSize(f) {
  const d = FURNITURE[f.type], quarter = Math.round(f.ry / (Math.PI / 2)) % 2 !== 0;
  return quarter ? [d.d / 2, d.w / 2] : [d.w / 2, d.d / 2];
}
// can a piece stand here, clear of the walls, the hearth, the door and everything else?
export function fitsRoom(f, list) {
  const [hx, hz] = halfSize(f);
  if (Math.abs(f.lx) + hx > ROOM.x || Math.abs(f.lz) + hz > ROOM.z) return false;
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  const me = { x0: f.lx - hx, x1: f.lx + hx, z0: f.lz - hz, z1: f.lz + hz };
  for (const k of KEEP_CLEAR) if (hit(me, k)) return false;
  for (const o of list) {
    if (o === f) continue;
    const [ox, oz] = halfSize(o);
    if (hit(me, { x0: o.lx - ox + 0.05, x1: o.lx + ox - 0.05, z0: o.lz - oz + 0.05, z1: o.lz + oz - 0.05 })) return false;
  }
  return true;
}

// the cabin as it is after the first night: two pallets along the right-hand wall
export const DEFAULT_HOME = () => [
  { type: "pallet", lx: 1.7, lz: -1.75, ry: 0 },
  { type: "pallet", lx: 1.7, lz: 0.35, ry: 0 },
  { type: "chest", lx: -1.95, lz: 0.9, ry: Math.PI / 2 },
];
// where the chest stands in a cabin that was furnished before there was one
export const DEFAULT_CHEST = { type: "chest", lx: -1.95, lz: 0.9, ry: Math.PI / 2 };

// a ghost of a piece, for planning
export function ghostOf(type) {
  const b = new (class { constructor() { this.g = new THREE.Group(); }
    box(w, h, d, x, y, z, color, ry = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d)); m.position.set(x, y, z); m.rotation.y = ry; this.g.add(m); }
    add(geo, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(geo); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); this.g.add(m); }
  })();
  FURNITURE[type].build(b, 0, 0, 0);
  return b.g;
}
