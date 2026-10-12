// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// BATTLE: two companies in the field, in their colours. The ground between them worked as armies worked it in the
// 1680s — a battery of gabions with the guns behind it on each side, an earth bank, palisades and chevaux-de-frise
// before them, and between the lines whatever the country left: field walls, a broken cart, barrels, felled trees.
// Each side's guns fire round shot that ploughs through whoever stands in its way and skips on along the ground.
// Your company is yours to command (F): where to stand and in what order, when to fire and at whom, when to charge.
// The other side has its own officer.

import { THREE, mat } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeCannon, cloud, segDist } from "./cannon.js";
import { powderSmoke, muzzleFlash, panPuff } from "./powder.js";
import { shake } from "./fight.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- the uniforms of 1683: the armies that came to Vienna, and their neighbours ----
export const UNIFORMS = {
  imperial: { name: "Imperial", note: "The Emperor's foot: pearl grey, faced red", coat: 0xb8b2a2, vest: 0x9a2a22, legs: 0x8a8478, sash: 0x9a2a22, hat: 0x1e1c1a },
  saxon: { name: "Saxon", note: "The Elector of Saxony's: red coats, yellow facings", coat: 0x9a2a22, vest: 0xd8b84a, legs: 0x5a4a36, sash: 0xd8b84a, hat: 0x1e1c1a },
  bavarian: { name: "Bavarian", note: "Max Emanuel's blue, faced white", coat: 0x34507e, vest: 0xe2dcca, legs: 0x3a3a3e, sash: 0xe2dcca, hat: 0x1e1c1a },
  swedish: { name: "Swedish", note: "Blue and yellow, the King's colours", coat: 0x2c4a86, vest: 0xd4ac3a, legs: 0x2e2e33, sash: 0xd4ac3a, hat: 0x22201c },
  brandenburg: { name: "Brandenburg", note: "Prussian blue, faced red", coat: 0x1e2c4a, vest: 0x9a2222, legs: 0x2a2a2a, sash: 0x9a2222, hat: 0x161412 },
  french: { name: "French", note: "Undyed grey-white, faced blue", coat: 0xd6d0be, vest: 0x2a3a7a, legs: 0xc8c2b0, sash: 0x2a3a7a, hat: 0x1e1c1a },
  english: { name: "English", note: "Red coats, faced blue", coat: 0xa02a22, vest: 0x2a3a6a, legs: 0x8a2a22, sash: 0x2a3a6a, hat: 0x1e1c1a },
  hamburg: { name: "Hamburg", note: "The city's own militia: brown, faced green", coat: 0x5a4632, vest: 0x3a5a3a, legs: 0x4a4035, sash: 0x8a2a22, hat: 0x2a2420 },
};
// a soldier of a company: its uniform, his own face and build
export function soldierLook(u, seed, base = {}) {
  // (the seeds of a company's men run one after another: stirred first, so neighbours in the line don't come out alike)
  let s = Math.imul((seed | 0) || 1, 2654435761) ^ 0x5bd1e995; const r = () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s >>> 0) % 1e6) / 1e6);
  r(); r();
  const pick = a => a[Math.floor(r() * a.length)];
  // (the faces of a German or northern company of the 1680s: fair for the most part, weathered or sallow in many, and a
  //  few darker — men from the south of Europe, from the Turkish wars, from the ports)
  const weighed = l => { let x = r() * l.reduce((t, [, w]) => t + w, 0); for (const [v, w] of l) if ((x -= w) <= 0) return v; return l[0][0]; };
  const skin = weighed([[0xf3d8c4, 30], [0xf1d3bc, 26], [0xeac6aa, 18], [0xe2b896, 11], [0xd4a882, 6], [0xc99a74, 4], [0xa87652, 2.5], [0x7e5236, 1.5], [0x5a3a26, 1]]);
  return { body: "watchman", skin, hair: pick([0x2a1c12, 0x4a3020, 0x6e4a2a, 0x9a6a38, 0x8a8a88]),
    eyes: pick([0x3a2a1a, 0x5a3a20, 0x3a5a7a, 0x4a6a4a]), linen: 0xe6dcc8, stockings: pick([0xd8d0c0, 0x5a5048]),
    height: 0.96 + r() * 0.08, build: 0.95 + r() * 0.1, head: 0.97 + r() * 0.06, seed, ...base,
    coat: u.coat, vest: u.vest, legs: u.legs, sash: u.sash, hat: "hat", hatColor: u.hat };
}
// your own body in your company's colours (your outfit and face as they are)
export function inUniform(look, u) { return { ...look, coat: u.coat, vest: u.vest, sash: u.sash, legs: look && /^(townswoman|sister|albers|watchwoman)$/.test(look.body) ? look.legs : u.legs, hatColor: u.hat }; }

// ---------------------------------------------------------------------------
//  the field: the works, the cover they give, and the guns
// ---------------------------------------------------------------------------
export class Field {
  // C: the middle of the field; dx: how far either side's line stands from it (west is side 0, east side 1)
  // fort: the side whose fort it is (0 yours, 1 theirs), or null for the open field
  constructor(w, C, dx, battle, seed = Math.random() * 1e9, fort = null) {
    this.w = w; this.C = C; this.dx = dx; this.root = new THREE.Group(); w.root.add(this.root);
    this.pieces = []; this.spots = [[], []]; this.guns = []; this.balls = [];
    let s = seed | 0 || 7; this.r = () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s >>> 0) % 1e6) / 1e6);
    const M = this.M = {
      earth: mat(0x6a5236, { surface: "ground" }), wicker: mat(0x7a5c36, { surface: "bark" }), wood: mat(0x6a4a2e, { surface: "wood" }), log: mat(0x5a4028, { surface: "log" }),
      stone: mat(0x8a8478, { surface: "rock" }), iron: mat(0x2a2b2e, { metalness: 0.4, roughness: 0.55 }), stave: mat(0x7a5634, { surface: "wood" }),
    };
    void M;
    this.fortSide = battle ? fort : null;
    if (battle) for (const side of [0, 1]) side === this.fortSide ? this.fort(side) : this.works(side);
    this.between(battle ? 7 : 4);
  }
  y(x, z) { return this.w.heightAt(x, z); }
  put(m, x, z, ry = 0, dy = 0) { m.position.set(x, this.y(x, z) + dy, z); m.rotation.y = ry; m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); this.root.add(m); return m; }
  // something solid, and a place behind it to crouch: (x, z) its middle, len along it at angle ry, high
  solid(x, z, len, depth, ry, high, side, inward = null) {
    const c = this.w.col.addOBox(x, z, len / 2, depth / 2, ry, this.y(x, z) + high);
    this.pieces.push({ x, z, len, depth, ry, high, c });
    // (cover is behind it, from the side that's coming: for a side's own works the enemy's way; between the lines,
    //  both sides, whichever is the far side from the one shooting)
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5, px = x + Math.cos(ry) * len * t, pz = z - Math.sin(ry) * len * t;
      const nx = Math.sin(ry), nz = Math.cos(ry);
      for (const sd of side == null ? [0, 1] : [side]) {
        // (the face of it away from the enemy's line)
        // (a fort's walls: on the inside of them, whichever way they face)
        const toward = sd === 0 ? -1 : 1, k = inward ? Math.sign((inward.x - px) * nx + (inward.z - pz) * nz) || 1 : Math.sign(nx * toward) || 1;
        this.spots[sd].push({ x: px + nx * k * (depth / 2 + 0.7), z: pz + nz * k * (depth / 2 + 0.7), high, taken: null });
      }
    }
  }
  // a side's works: a battery of gabions in an arc with its guns behind, an earth bank, and obstacles before them
  works(side) {
    const r = this.r, C = this.C, sx = side === 0 ? -1 : 1, lineX = C.x + sx * (this.dx - 4);
    // the battery: gabions — wicker baskets as high as a man's chest, packed with earth — in a shallow arc
    const n = 9 + Math.floor(r() * 4), gaps = [Math.floor(n * 0.3), Math.floor(n * 0.7)];
    for (let i = 0; i < n; i++) {
      if (gaps.includes(i)) continue;
      const t = i / (n - 1) - 0.5, z = C.z + t * 18, x = lineX - sx * Math.cos(t * 1.4) * 1.5;
      this.gabion(x, z);
    }
    // (one piece of solid along them, for the cover it gives)
    this.solid(lineX - sx * 1.2, C.z, 18, 1.0, Math.PI / 2, 1.25, side);
    // the guns, in the gaps, behind the line and looking out over it
    const ng = 1 + Math.floor(r() * 2.4);
    for (let g = 0; g < Math.min(ng, gaps.length + 1); g++) {
      const t = (g === 0 ? gaps[0] : g === 1 ? gaps[1] : Math.floor(n / 2)) / (n - 1) - 0.5, z = C.z + t * 18, x = lineX + sx * 1.6;
      this.gun(side, x, z, sx);
    }
    // an earth bank to one flank
    const bz = C.z + (r() < 0.5 ? -1 : 1) * (12 + r() * 5), bx = lineX - sx * (2 + r() * 3);
    this.bank(bx, bz, 7 + r() * 4, Math.PI / 2 + (r() - 0.5) * 0.5, side);
    // obstacles out in front: chevaux-de-frise, and a palisade
    for (let i = 0; i < 2; i++) this.cheval(lineX - sx * (6 + r() * 3), C.z + (r() - 0.5) * 22, Math.PI / 2 + (r() - 0.5) * 0.4, side);
    this.palisade(lineX - sx * (3 + r() * 2), C.z + (r() < 0.5 ? -1 : 1) * (6 + r() * 6), 5 + r() * 4, Math.PI / 2 + (r() - 0.5) * 0.3, side);
  }
  // a fort: a square redoubt of earth, its front a rampart as high as a man's chest with embrasures cut for the guns,
  // its flanks and rear an earth bank with a palisade along it; the gate in the rear, and a breach the last siege left
  // in one flank. The defenders stand behind the front, firing over it; the guns look out through the embrasures
  fort(side) {
    const r = this.r, C = this.C, sx = side === 0 ? -1 : 1, W = 12, D = 16;
    const fx = C.x + sx * (this.dx - 6), bx = fx + sx * D, mx = (fx + bx) / 2, inside = { x: mx, z: C.z };
    this.fortAt = { side, front: fx, back: bx, mx, z: C.z, W, D, sx, anchor: { x: fx + sx * 2.2, z: C.z } };
    // the front: rampart in three pieces, the two embrasures between them, a gun behind each
    const emb = [-4.5, 4.5], gapW = 1.6;
    const cuts = [-W, ...emb.flatMap(e => [e - gapW / 2, e + gapW / 2]), W];
    for (let i = 0; i < cuts.length; i += 2) { const z0 = C.z + cuts[i], z1 = C.z + cuts[i + 1]; this.rampart(fx, (z0 + z1) / 2, z1 - z0, Math.PI / 2, side, inside); }
    for (const e of emb) { this.gabion(fx - sx * 0.2, C.z + e - gapW / 2 - 0.45); this.gabion(fx - sx * 0.2, C.z + e + gapW / 2 + 0.45); this.gun(side, fx + sx * 1.3, C.z + e, sx); }
    // the flanks: bank and palisade, one with its breach
    const breach = r() < 0.5 ? -1 : 1;
    for (const zs of [-1, 1]) {
      const z = C.z + zs * W;
      if (zs === breach) { const L1 = D * 0.45, L2 = D * 0.35; this.flankWall(fx + sx * L1 / 2, z, L1, side, inside); this.flankWall(bx - sx * L2 / 2, z, L2, side, inside); this.rubble(fx + sx * (L1 + (D - L1 - L2) / 2), z); }
      else this.flankWall(mx, z, D, side, inside);
    }
    // the rear: bank and palisade either side of the gate, the gate's two leaves stood open
    const gw = 3.2;
    for (const zs of [-1, 1]) { const L = W - gw / 2; this.flankWall(bx, C.z + zs * (gw / 2 + L / 2), L, side, inside, Math.PI / 2); }
    for (const zs of [-1, 1]) { const leaf = new THREE.Group(); for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.2, 0.1), this.M.log); st.position.set(i * 0.27 + 0.13, 1.1, 0); leaf.add(st); } const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.06), this.M.wood); bar.position.set(0.8, 1.4, 0.07); leaf.add(bar); this.put(leaf, bx, C.z + zs * gw / 2, zs > 0 ? Math.PI / 2 + sx * 1.1 : -Math.PI / 2 - sx * 1.1); }
    // inside: a powder store of barrels, and the flag on its staff
    this.barrels(mx + sx * 3, C.z + (r() < 0.5 ? -7 : 7));
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 6), this.M.wood); this.put(staff, mx, C.z, 0, 3);
  }
  // the front rampart: earth piled up behind a revetment of logs, chest high to the men behind it
  rampart(x, z, len, ry, side, inward) {
    const sh = new THREE.Shape(); sh.moveTo(-1.6, 0); sh.lineTo(-0.5, 1.3); sh.lineTo(0.55, 1.32); sh.lineTo(0.85, 0.8); sh.lineTo(1.0, 0); sh.lineTo(-1.6, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2);
    const g = new THREE.Group(), m = new THREE.Mesh(geo, this.M.earth); m.rotation.y = Math.PI / 2;
    // (which face is outward: the long slope toward the enemy, the steep revetted face inside)
    const sx = side === 0 ? -1 : 1; m.scale.z = -sx; g.add(m);
    for (let i = 0; i < Math.round(len / 0.32); i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 1.0, 6), this.M.log); lg.position.set(sx * 0.95, 0.5, -len / 2 + (i + 0.5) * 0.32); g.add(lg); }
    const gg = new THREE.Group(); gg.add(g); g.rotation.y = -Math.PI / 2;
    this.put(gg, x, z, ry - Math.PI / 2, -0.05);
    this.solid(x, z, len, 2.4, ry, 1.3, side, inward);
  }
  // a flank of the fort: a low bank with a palisade standing on it
  flankWall(x, z, len, side, inward, ry = 0) {
    this.bank(x, z, len, ry, side, inward);
    const g = new THREE.Group(), n = Math.round(len / 0.18);
    { const back = new THREE.Mesh(new THREE.BoxGeometry(len, 1.15, 0.05), this.M.wood); back.position.set(0, 0.9 + 0.6, 0.1); g.add(back); }
    for (let i = 0; i < n; i++) { const h = 1.3 + this.r() * 0.3, st = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, h, 7), this.M.log); st.position.set(-len / 2 + (i + 0.5) * len / n, 0.9 + h / 2, 0); g.add(st); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), this.M.stave); tip.position.set(st.position.x, 0.9 + h + 0.12, 0); g.add(tip); }
    this.put(g, x, z, ry);
    this.solid(x, z, len, 0.35, ry, 2.4, side, inward);
  }
  // a breach: the bank thrown down, its earth and broken stakes lying in the gap
  rubble(x, z) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + this.r() * 0.35, 0), this.M.earth); c.position.set((this.r() - 0.5) * 3, 0.1, (this.r() - 0.5) * 1.6); c.scale.y = 0.45; g.add(c); }
    for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), this.M.log); st.position.set((this.r() - 0.5) * 3, 0.25, (this.r() - 0.5) * 1.4); st.rotation.set(Math.PI / 2 + (this.r() - 0.5), this.r() * 3, 0); g.add(st); }
    this.put(g, x, z, this.r() * 3);
  }
  gabion(x, z) {
    const g = new THREE.Group(), h = 1.15, R = 0.42;
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.96, h, 12, 4, true), this.M.wicker); basket.position.y = h / 2; g.add(basket);
    // (the weave: bands round it)
    for (let k = 1; k < 5; k++) { const b = new THREE.Mesh(new THREE.TorusGeometry(R + 0.008, 0.012, 4, 14), this.M.wicker); b.rotation.x = Math.PI / 2; b.position.y = k * h / 5; g.add(b); }
    const top = new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.M.earth); top.scale.y = 0.35; top.position.y = h - 0.02; g.add(top);
    this.put(g, x, z, this.r() * 6);
  }
  bank(x, z, len, ry, side, inward = null) {
    // a long mound of earth, sloped both faces
    const sh = new THREE.Shape(); sh.moveTo(-1.3, 0); sh.lineTo(-0.35, 1.1); sh.lineTo(0.35, 1.15); sh.lineTo(1.3, 0); sh.lineTo(-1.3, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2);
    const m = new THREE.Mesh(geo, this.M.earth); const g = new THREE.Group(); m.rotation.y = Math.PI / 2; g.add(m);
    this.put(g, x, z, ry, -0.08);
    this.solid(x, z, len, 1.6, ry, 1.05, side, inward);
  }
  cheval(x, z, ry, side) {
    // a log with sharpened stakes through it, crossed both ways: no one walks through that
    const g = new THREE.Group(), L = 3.2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, L, 8).rotateZ(Math.PI / 2), this.M.log); beam.position.y = 0.6; g.add(beam);
    for (let i = 0; i < 7; i++) for (const a of [0.8, -0.8]) {
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.045, 1.5, 6), this.M.stave); st.position.set(-L / 2 + 0.2 + i * (L - 0.4) / 6, 0.6, 0); st.rotation.x = a; g.add(st);
    }
    this.put(g, x, z, ry);
    this.solid(x, z, L, 1.0, ry, 1.0, side);
  }
  // stakes driven in shoulder to shoulder (overlapping, so no light shows between them), and planks nailed across the
  // back of them
  palisade(x, z, len, ry, side) {
    const g = new THREE.Group(), n = Math.round(len / 0.18);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 1.35, 0.05), this.M.wood); back.position.set(0, 0.7, 0.1); g.add(back);
    for (let i = 0; i < n; i++) {
      const h = 1.5 + this.r() * 0.3, st = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, h, 7), this.M.log);
      st.position.set(-len / 2 + (i + 0.5) * len / n, h / 2, 0); g.add(st);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), this.M.stave); tip.position.set(st.position.x, h + 0.12, 0); g.add(tip);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.06), this.M.wood); rail.position.set(0, 0.9, 0.12); g.add(rail);
    this.put(g, x, z, ry);
    this.solid(x, z, len, 0.3, ry, 1.9, side);   // (to the stakes' points: nothing goes over the top of it below them)
  }
  // between the lines: what the country left lying about
  between(n) {
    const r = this.r, C = this.C;
    for (let i = 0; i < n; i++) {
      const x = C.x + (r() - 0.5) * (this.dx * 1.1), z = C.z + (r() - 0.5) * 30, ry = r() * Math.PI, kind = r();
      if (kind < 0.35) this.wall(x, z, 3 + r() * 4, ry);
      else if (kind < 0.55) this.cart(x, z, ry);
      else if (kind < 0.8) this.barrels(x, z);
      else this.fallen(x, z, ry);
    }
  }
  wall(x, z, len, ry) {
    // a field wall of rough stones, dry-laid, waist high, a few fallen from its top
    const g = new THREE.Group(), r = this.r;
    for (let i = 0; i < len / 0.4; i++) for (let row = 0; row < 3; row++) {
      if (row === 2 && r() < 0.3) continue;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + r() * 0.08, 0), this.M.stone);
      st.position.set(-len / 2 + i * 0.4 + (row % 2) * 0.2, 0.2 + row * 0.3, (r() - 0.5) * 0.15); st.scale.set(1.1, 0.75, 0.9); st.rotation.set(r() * 3, r() * 3, r() * 3); g.add(st);
    }
    this.put(g, x, z, ry);
    this.solid(x, z, len, 0.6, ry, 0.95, null);
  }
  cart(x, z, ry) {
    // a farm cart overturned on its side: a bed of planks, a wheel up in the air
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.12), this.M.wood); bed.position.y = 0.6; g.add(bed);
    const side2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.7), this.M.wood); side2.position.set(0, 0.12, 0.36); g.add(side2);
    for (const sx of [-0.8, 0.8]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), this.M.wood); wh.position.set(sx, 1.15, -0.1); wh.rotation.y = 0.2; g.add(wh); }
    this.put(g, x, z, ry);
    this.solid(x, z, 2.4, 0.8, ry, 1.1, null);
  }
  barrels(x, z) {
    const g = new THREE.Group(), n = 2 + Math.floor(this.r() * 3);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 12), this.M.stave); b.position.set((i % 2) * 0.66 - 0.3, 0.45, Math.floor(i / 2) * 0.66 - 0.3); g.add(b);
      for (const h of [0.15, 0.75]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.015, 4, 14), this.M.iron); hoop.rotation.x = Math.PI / 2; hoop.position.set(b.position.x, h, b.position.z); g.add(hoop); }
    }
    this.put(g, x, z, this.r() * 3);
    this.solid(x, z, 1.4, 1.4, 0, 0.9, null);
  }
  fallen(x, z, ry) {
    const g = new THREE.Group(), L = 5 + this.r() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, L, 9).rotateZ(Math.PI / 2), this.M.log); trunk.position.y = 0.35; g.add(trunk);
    this.put(g, x, z, ry);
    this.solid(x, z, L, 0.75, ry, 0.75, null);
  }

  // ---- the guns ----
  gun(side, x, z, sx) {
    const m = makeCannon(); const ry = sx < 0 ? -Math.PI / 2 : Math.PI / 2;   // (pointing at the other side: -z of the model, out east or west)
    this.put(m, x, z, ry);
    this.w.col.addCircle(x, z, 0.8, this.y(x, z) + 1.0);
    this.guns.push({ side, x, z, ry, yaw: 0, pitch: 0.06, model: m, loaded: true, reload: 0, recoil: 0, target: null, firing: true, next: 10 + this.r() * 8, crew: [] });
  }
  // where a gun's crew stand to work it: either side of the breech, clear of the wheels (i 0: the gunner, who lays and
  // fires it; 1: the loader, with the rammer and the sponge)
  station(g, i) {
    const lx = i ? 0.95 : -0.95, lz = 0.55, c = Math.cos(g.ry), s = Math.sin(g.ry);
    return { x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c };
  }
  // how many of its crew are at it
  manned(g) { return g.crew.filter(u => u.alive && Math.hypot(u.pos.x - g.x, u.pos.z - g.z) < 2.6).length; }
  // laid there, now, and fired (a gun you work yourself)
  layAndFire(g, at) {
    const dx = at.x - g.x, dz = at.z - g.z, want = Math.atan2(-dx, -dz), d = Math.hypot(dx, dz);
    g.yaw = clamp(Math.atan2(Math.sin(want - g.ry), Math.cos(want - g.ry)), -0.9, 0.9);
    g.pitch = 0.5 * Math.asin(clamp(d * 9.8 / (140 * 140), -1, 1)) + (this.y(at.x, at.z) - this.y(g.x, g.z) - 0.9) / Math.max(4, d);
    const m = g.model; m.rotation.y = g.ry + g.yaw; m.userData.barrel.rotation.x = g.pitch;
    this.fire(g);
  }
  // a gun's target, given (a point on the ground) or taken away
  // (taken away: they go back to laying on the thickest of the other side, as they see fit)
  order(side, at) { for (const g of this.guns) if (g.side === side) { g.target = at ? { x: at.x, z: at.z } : null; g.firing = true; } }
  fire(g) {
    const m = g.model.userData, root = this.w.root;
    g.model.updateMatrixWorld(true);
    const at = m.muzzle.getWorldPosition(new THREE.Vector3());
    const yaw = g.ry + g.yaw, dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(g.pitch), Math.sin(g.pitch), -Math.cos(yaw) * Math.cos(g.pitch));
    g.loaded = false; g.reload = 6.5 + this.r() * 2.5; g.recoil = 1;
    this.balls.push({ p: at.clone(), v: dir.multiplyScalar(140), hits: new Set(), bounces: 0, t: 0, side: g.side, mesh: (() => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(0x1c1c1e, { metalness: 0.4, roughness: 0.5 })); b.position.copy(at); root.add(b); return b; })() });
    muzzleFlash(root, at.clone().addScaledVector(dir, 0.2), dir, 3);
    powderSmoke(root, at.clone().addScaledVector(dir, 0.3), dir, { scale: 3, life: 26, n: 42, speed: 15, haze: true, hazeN: 12, hazeA: 0.3 });
    { const b = m.barrel; b.updateMatrixWorld(true); panPuff(root, b.localToWorld(new THREE.Vector3(0, 0.2, 0.6)), 1.4); }
    AUDIO.cannon ? AUDIO.cannon(1, at) : AUDIO.gunshot && AUDIO.gunshot(1.4, at);
    const pl = G.player, d = Math.hypot(at.x - pl.pos.x, at.z - pl.pos.z);
    if (d < 45) shake(Math.max(0.12, 1 - d / 45) * 0.8);
  }
  // each frame: the guns laid and fired, the balls flying; hit(u, from, v) is called for anyone a ball goes through
  update(dt, units, hit) {
    for (const g of this.guns) {
      // (a gun is only as good as its crew: two load it at the drill's pace, one at half, none not at all — nor fire it)
      const crewN = g.crew.length ? this.manned(g) : 2; g.crewN = crewN;
      if (!g.loaded && crewN) { g.reload -= dt * (crewN >= 2 ? 1 : 0.5); if (g.reload <= 0) g.loaded = true; }
      // (their side: laid on the thickest part of yours, now and then; yours: on where you said)
      if (!g.target) { if ((g.next -= dt) <= 0) { g.next = 6; const t = this.thickest(units.filter(u => u.team !== g.side && u.alive)); if (t) g.aim = { x: t.x + (this.r() - 0.5) * 3.5, z: t.z + (this.r() - 0.5) * 3.5 }; } }
      else if (g.target) g.aim = g.target;
      if (g.aim) {
        const dx = g.aim.x - g.x, dz = g.aim.z - g.z, want = Math.atan2(-dx, -dz), d = Math.hypot(dx, dz);
        const dy = Math.atan2(Math.sin(want - g.ry), Math.cos(want - g.ry));
        g.yaw += (clamp(dy, -0.9, 0.9) - g.yaw) * Math.min(1, dt * 1.5);
        const need = 0.5 * Math.asin(clamp(d * 9.8 / (140 * 140), -1, 1)) + (this.y(g.aim.x, g.aim.z) - this.y(g.x, g.z) - 0.9) / Math.max(4, d);
        g.pitch += (need - g.pitch) * Math.min(1, dt * 1.5);
        if (g.loaded && g.firing && crewN && !g.byHand && Math.abs(clamp(dy, -0.9, 0.9) - g.yaw) < 0.04) this.fire(g);
      }
      g.recoil = Math.max(0, g.recoil - dt * 1.4);
      const m = g.model; m.rotation.y = g.ry + g.yaw; m.userData.barrel.rotation.x = g.pitch;
    }
    const root = this.w.root;
    for (const b of this.balls) {
      if (b.done) { b.t += dt; continue; }
      const steps = 4, h = dt / steps;
      for (let s = 0; s < steps && !b.done; s++) {
        const from = b.p.clone();
        b.v.y -= 9.8 * h; b.p.addScaledVector(b.v, h); b.t += h;
        if (b.v.length() > 8) for (const u of units) {
          if (!u.alive || b.hits.has(u)) continue;
          // (a round shot takes a man and goes on through the file behind him, losing little)
          const c = u.pos; if (segDist(from, b.p, new THREE.Vector3(c.x, c.y + 0.9, c.z)) < 1.25) { b.hits.add(u); hit(u, from, b.v.clone()); b.v.multiplyScalar(0.9); cloud(root, new THREE.Vector3(c.x, c.y + 1.1, c.z), b.v.clone().normalize(), { n: 4, colour: 0x7a1a12, life: 1.2, speed: 2, size: 0.5, opacity: 0.45 }); }
        }
        const gy = this.y(b.p.x, b.p.z);
        if (b.p.y <= gy + 0.07 || (b.v.length() > 8 && this.w.col.solidAt(b.p.x, b.p.y, b.p.z, 0))) {
          b.p.y = Math.max(b.p.y, gy + 0.07);
          const sp = b.v.length();
          if (sp > 8) {
            cloud(root, b.p.clone(), new THREE.Vector3(0, 1, 0), { n: 10, colour: 0x6a5a44, life: 2.4, speed: 4, size: 1.1, opacity: 0.6 }); const F = window.__foley; F && F.thunk && F.thunk(b.p, 0.9);
            // (where it strikes: earth, stones and splinters flung about — the men close by cut down or knocked flat)
            for (const u of units) { if (!u.alive || b.hits.has(u)) continue; const dd = Math.hypot(u.pos.x - b.p.x, u.pos.z - b.p.z); if (dd < 2.0 * Math.min(1, sp / 60)) { b.hits.add(u); hit(u, b.p.clone(), b.v.clone()); } }
          }
          // (it grazes and bounds on, low, as round shot does — a ricochet as deadly as the first strike)
          if (sp > 12 && b.bounces < 5) { b.bounces++; b.v.y = Math.abs(b.v.y) * 0.25 + 1.5; b.v.x *= 0.72; b.v.z *= 0.72; }
          else { b.v.set(0, 0, 0); b.done = true; }
        }
      }
      b.mesh.position.copy(b.p);
    }
    for (const b of this.balls.slice()) if (b.done && b.t > 20) { root.remove(b.mesh); this.balls.splice(this.balls.indexOf(b), 1); }
  }
  // where a company stands thickest: the man with most of his fellows near him
  thickest(list) {
    let best = null, bn = -1;
    for (const u of list) { const n = list.filter(o => Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 6).length; if (n > bn) { bn = n; best = u.pos; } }
    return best;
  }
  // the best place near (x, z) to get down behind something from a man at (ex, ez): behind it from him, free, close
  coverNear(side, x, z, ex, ez, maxD = 12, who = null) {
    let best = null, bd = Infinity;
    for (const s of this.spots[side]) {
      if (s.taken && s.taken !== who && s.taken.alive) continue;
      const d = Math.hypot(s.x - x, s.z - z); if (d > maxD) continue;
      // (it has to be between you and him: the spot nearer you than the piece is, seen from him)
      const toE = Math.hypot(ex - s.x, ez - s.z); if (toE < 5) continue;
      const score = d + (this.w.col.lineOfSight && this.w.col.lineOfSight(new THREE.Vector3(s.x, this.y(s.x, s.z) + 0.9, s.z), new THREE.Vector3(ex, this.y(ex, ez) + 1.3, ez)) ? 8 : 0);
      if (score < bd) { bd = score; best = s; }
    }
    return best;
  }
  dispose() { this.w.root.remove(this.root); for (const b of this.balls) this.w.root.remove(b.mesh); for (const p of this.pieces) this.w.col.remove && this.w.col.remove(p.c); }
}

// ---------------------------------------------------------------------------
//  orders: where a company stands, how, and what it does
// ---------------------------------------------------------------------------
export const FORMATIONS = { line: "Line", column: "Column", square: "Square", loose: "Loose order" };
export class Orders {
  constructor(team) { this.team = team; this.mode = team === 0 ? "follow" : "hold"; this.at = null; this.form = team === 0 ? "line" : "line"; this.fire = true; this.charge = false; this.cover = false; this.target = null; this.volleyAt = 0; this.facing = 0; }
  // a man's place, i of n in the company, given the anchor and the way it faces
  slot(i, n, anchor, face) {
    const fx = Math.sin(face), fz = Math.cos(face), rx = Math.cos(face), rz = -Math.sin(face);
    let a = 0, b = 0;                                     // (across, and forward)
    // (a line of more than fourteen is two ranks, the second a pace behind the first, covering its gaps)
    if (this.form === "line") { const per = n > 14 ? Math.ceil(n / 2) : n, rk = Math.floor(i / per), j = i % per, m = rk ? n - per : per; a = (j - (m - 1) / 2) * 1.6 + rk * 0.8; b = -rk * 1.4; }
    else if (this.form === "column") { a = (i % 2 - 0.5) * 1.2; b = -Math.floor(i / 2) * 1.5; }
    else if (this.form === "square") { const per = Math.max(1, Math.ceil(n / 4)), sideI = i % 4, k = Math.floor(i / 4), half = per * 0.8 + 0.8, t = (k - (per - 1) / 2) * 1.6; [a, b] = [[t, half], [half, -t], [-t, -half], [-half, t]][sideI]; }
    else { const h = Math.sin(i * 12.9898) * 43758.5453 % 1; a = (i - (n - 1) / 2) * 3.8; b = (h - 0.5) * 4; }
    return { x: anchor.x + rx * a + fx * b, z: anchor.z + rz * a + fz * b };
  }
}

// ---- the order book: a captain's page of orders, kept at the side of the field, not a menu of the computer's — each
// numbered, and given by its number (1 to 0) while you fight on; the formation's number turns to a page of them ----
export const ORDER_LIST = [
  { id: "follow", label: "Follow me", sub: "Fall in on me, and keep up" },
  { id: "hold", label: "Hold here", sub: "Stand where you are" },
  { id: "advance", label: "Advance — there", sub: "To where I'm looking" },
  { id: "cover", label: "Take cover", sub: "Get down behind something" },
  { id: "fire", label: "Fire at will", alt: "Hold your fire", sub: "Each man as he sees fit" },
  { id: "volley", label: "Present — fire!", sub: "Every loaded piece together, at my word" },
  { id: "target", label: "Bring him down", sub: "The man I'm looking at" },
  { id: "charge", label: "Charge!", alt: "Halt — fall back in", sub: "Steel, and at them" },
  { id: "form", label: "Formation", sub: "Line, column, square, loose", more: true },
  { id: "guns", label: "Guns — fire there", alt: "Guns — at will", sub: "Round shot on where I'm looking", battle: true },
];
export class OrderBook {
  constructor(onGive) {
    this.onGive = onGive; this.open = false; this.page = "main"; this.lit = -1;
    let el = document.getElementById("orderBook");
    if (!el) { el = document.createElement("div"); el.id = "orderBook"; el.className = "hidden"; document.getElementById("hud").appendChild(el); }
    this.el = el;
  }
  items(state) {
    if (this.page === "form") return Object.entries(FORMATIONS).map(([id, label]) => ({ id: "form:" + id, label, on: state.form === id }));
    return ORDER_LIST.filter(o => !o.battle || state.battle).map(o => ({ ...o, label: (o.id === "fire" && state.fire) || (o.id === "charge" && state.charge) || (o.id === "guns" && state.guns) ? o.alt : o.label, on: o.id === state.mode || (o.id === "cover" && state.cover) }));
  }
  show(state) {
    this.state = state; this.open = true; this.draw();
    if (this.el.classList.contains("hidden")) { this.el.classList.remove("hidden"); void this.el.offsetWidth; this.el.classList.add("in"); }
  }
  hide() { this.open = false; this.el.classList.add("hidden"); }
  update(state) { this.state = state; if (this.open) this.draw(); }
  draw() {
    const list = this.items(this.state), roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    this.el.classList.toggle("form", this.page === "form");
    this.el.innerHTML = `<div class="ob-head"><span class="ob-seal"></span><div><div class="ob-t">${this.page === "form" ? "Formation" : "Orders"}</div><div class="ob-s">${this.state.count} under your command</div></div></div>
      <ol class="ob-list">${list.map((o, i) => `<li class="${i === this.lit ? "lit" : ""}${o.on ? " on" : ""}"><span class="ob-k">${(i + 1) % 10}</span><span class="ob-l">${o.label}${o.more ? " ›" : ""}</span><span class="ob-n">${roman[i]}</span></li>`).join("")}</ol>
      <div class="ob-foot">${this.page === "form" ? "A number for the formation · Esc: back" : "The number gives the order · the wheel, your weapons"}</div>`;
  }
  // a key: a number gives that order (or opens the formations); Esc puts the formations away. True if it was the book's
  key(e) {
    const list = this.items(this.state);
    if (e.code === "Escape" && this.page !== "main") { this.page = "main"; this.draw(); return true; }
    const m = /^Digit(\d)$/.exec(e.code); if (!m) return false;
    const i = (+m[1] || 10) - 1; if (!list[i]) return true;
    this.pick(list[i], i);
    return true;
  }
  pick(o, i) {
    if (o.more) { this.page = "form"; this.lit = -1; this.draw(); const F = window.__foley; F && F.packOut && F.packOut(0.15); return; }
    this.page = "main"; this.onGive(o.id);
    this.lit = this.items(this.state).findIndex(x => x.id === o.id || (o.id.startsWith("form:") && x.id === "form")); if (this.lit < 0) this.lit = i;
    this.draw(); clearTimeout(this.litT); this.litT = setTimeout(() => { this.lit = -1; if (this.open) this.draw(); }, 900);
  }
}
