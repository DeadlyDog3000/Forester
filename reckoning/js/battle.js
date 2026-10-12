// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// BATTLE: two companies in the field, in their colours. The ground between them worked as armies worked it in the
// 1680s — a battery of gabions with the guns behind it on each side, an earth bank, palisades and chevaux-de-frise
// before them, and between the lines whatever the country left: field walls, a broken cart, barrels, felled trees.
// Each side's guns fire round shot that ploughs through whoever stands in its way and skips on along the ground.
// Your company is yours to command (F): where to stand and in what order, when to fire and at whom, when to charge.
// The other side has its own officer.

import { THREE, mat, makeFlame, flicker, FLAMES } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeCannon, cloud, segDist } from "./cannon.js";
import { powderSmoke, muzzleFlash, panPuff } from "./powder.js";
import { shake } from "./fight.js";
import { P, makeLogs, makeStump, makeSheaf, makeSack } from "./models.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0);
// the drill's steps, and where each ends in the loading (0 just fired, 1 loaded)
const DRILL = [["back", 0, 0.05], ["sponge", 0.05, 0.3], ["load", 0.3, 0.42], ["ram", 0.42, 0.62], ["prime", 0.62, 0.72], ["lay", 0.72, 0.86], ["run", 0.86, 1]];

// a thing built of many pieces made into one mesh to each material it's made of (hundreds of stones in a wall drawn as
// one): every plain mesh in it, in its place, merged; anything else — several materials on one mesh, instanced — left
// as it is
function merged(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), by = new Map(), keep = [];
  g.traverse(o => {
    if (o === g || !o.isMesh) return;
    for (let p = o.parent; p && p !== g; p = p.parent) if (keep.includes(p)) return;
    if (o.isInstancedMesh || Array.isArray(o.material) || o.children.some(c => c.isMesh)) { keep.push(o); return; }
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    (by.get(o.material) || by.set(o.material, []).get(o.material)).push(geo);
  });
  if (!by.size) return g;
  const out = new THREE.Group();
  for (const [m, list] of by) {
    let n = 0; for (const geo of list) n += geo.attributes.position.count;
    const Pa = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    let k = 0;
    for (const geo of list) {
      const c = geo.attributes.position.count;
      Pa.set(geo.attributes.position.array, k * 3);
      if (geo.attributes.normal) N.set(geo.attributes.normal.array, k * 3);
      if (geo.attributes.uv) U.set(geo.attributes.uv.array, k * 2);
      k += c; geo.dispose();
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(Pa, 3)); bg.setAttribute("normal", new THREE.BufferAttribute(N, 3)); bg.setAttribute("uv", new THREE.BufferAttribute(U, 2));
    bg.computeBoundingSphere();
    out.add(new THREE.Mesh(bg, m));
  }
  // (what couldn't be merged, kept in its place)
  for (const o of keep) { const w = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); o.parent.remove(o); w.decompose(o.position, o.quaternion, o.scale); out.add(o); }
  return out;
}

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
  // (the hair: dark for the most part, brown and fair a good many, the odd red or grey; and the face shaven, as most
  //  soldiers' were, or a moustache — the fashion — or, here and there, a beard)
  const hair = weighed([[0x2a1c12, 20], [0x4a3020, 24], [0x6e4a2a, 20], [0x9a6a38, 12], [0xc8a060, 9], [0x7a2e1a, 4], [0x8a8a88, 5]]);
  const face = weighed([["clean", 45], ["tash", 38], ["full", 17]]);
  return { body: "watchman", skin, hair, face,
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
    this.pieces = []; this.spots = [[], []]; this.guns = []; this.balls = []; this.cols = []; this.used = []; this.battle = !!battle;
    let s = seed | 0 || 7; this.r = () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s >>> 0) % 1e6) / 1e6);
    const M = this.M = {
      earth: mat(0x6a5236, { surface: "ground" }), wicker: mat(0x7a5c36, { surface: "bark" }), wood: mat(0x6a4a2e, { surface: "wood" }), log: mat(0x5a4028, { surface: "log" }),
      stone: mat(0x8a8478, { surface: "rock" }), iron: mat(0x2a2b2e, { metalness: 0.4, roughness: 0.55 }), stave: mat(0x7a5634, { surface: "wood" }),
      leaf: mat(0x3e5626, { surface: "needles" }), leaf2: mat(0x4a5e2c, { surface: "needles" }), rail: mat(0x7e6a50, { surface: "wood" }),
      soot: mat(0x231d18, { surface: "wood" }), ash: mat(0x3a342e, { surface: "ground" }), boulder: mat(0x8e897f, { surface: "rock", weather: false }),
      hay: mat(0xb0924e, { surface: "none" }), tarp: mat(0x6e6650, { surface: "cloth" }),
      fleece: mat(0x8a7a62, { surface: "cloth" }), flannel: mat(0xc8b890, { surface: "cloth" }),
    };
    void M;
    this.fortSide = battle ? fort : null;
    if (battle) for (const side of [0, 1]) side === this.fortSide ? this.fort(side) : this.works(side);
    this.between(battle ? 13 : 5);
  }
  y(x, z) { return this.w.heightAt(x, z); }
  // set down on the ground there; its pieces merged, one mesh to each material (bake: false for what moves)
  put(m, x, z, ry = 0, dy = 0, bake = true) { if (bake) m = merged(m); m.position.set(x, this.y(x, z) + dy, z); m.rotation.y = ry; m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); this.root.add(m); return m; }
  // something solid, and a place behind it to crouch: (x, z) its middle, len along it at angle ry, high
  // (side false: no place to crouch behind it; collide false: the place, but what's solid is given on its own)
  solid(x, z, len, depth, ry, high, side, inward = null, collide = true) {
    const c = collide ? this.w.col.addOBox(x, z, len / 2, depth / 2, ry, this.y(x, z) + high) : null;
    this.pieces.push({ x, z, len, depth, ry, high, c });
    if (side === false) return;
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
  // ---- room on the field: each thing claims a circle of ground, and nothing else goes down inside it ----
  // free: nothing of the field's there already (with a gap to walk through between), none of the trees left standing,
  // and the ground level enough for it
  free(x, z, rad, gap = 1.6) {
    if (this.used.some(u => Math.hypot(u.x - x, u.z - z) < u.rad + rad + gap)) return false;
    for (let i = 0; i < 9; i++) {
      const a = i / 8 * Math.PI * 2, k = i ? rad : 0, px = x + Math.cos(a) * k, pz = z + Math.sin(a) * k;
      if (this.w.col.solidAt(px, this.y(px, pz) + 0.8, pz, 0.8)) return false;
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, h = this.y(x + Math.cos(a) * rad, z + Math.sin(a) * rad); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    return hi - lo < 0.7 + rad * 0.2;
  }
  claim(x, z, rad) { this.used.push({ x, z, rad }); }
  // somewhere gen() offers that's free, claimed (or null, if nowhere was)
  find(gen, rad, tries = 40, gap) {
    for (let i = 0; i < tries; i++) { const p = gen(i); if (this.free(p.x, p.z, rad, gap)) { this.claim(p.x, p.z, rad); return p; } }
    return null;
  }
  // a point (lx along, lz across) of something set down at (x, z) turned ry
  at(x, z, ry, lx, lz) { const c = Math.cos(ry), s = Math.sin(ry); return { x: x + lx * c + lz * s, z: z - lx * s + lz * c }; }

  // a side's works: a battery of gabions in an arc with its guns behind, an earth bank on a flank, and obstacles out
  // before them — each set clear of the others, so there's a way through between them, and none of it in the line
  works(side) {
    const r = this.r, C = this.C, sx = side === 0 ? -1 : 1, lineX = C.x + sx * (this.dx - 4);
    // (where the line stands, and its guns: kept clear)
    for (let z = -12; z <= 12; z += 4) this.claim(C.x + sx * this.dx, C.z + z, 2.5);
    // the battery: gabions — wicker baskets as high as a man's chest, packed with earth — in a shallow arc, each solid
    // on its own, so the gaps the guns look out through are open
    const n = 9 + Math.floor(r() * 4), gaps = [Math.floor(n * 0.3), Math.floor(n * 0.7)];
    for (let i = 0; i < n; i++) {
      if (gaps.includes(i)) continue;
      const t = i / (n - 1) - 0.5, z = C.z + t * 18, x = lineX - sx * Math.cos(t * 1.4) * 1.5;
      this.gabion(x, z, side); this.claim(x, z, 0.5);
    }
    const ng = 1 + Math.floor(r() * 2.4);
    for (let g = 0; g < Math.min(ng, gaps.length + 1); g++) {
      const t = (g === 0 ? gaps[0] : g === 1 ? gaps[1] : Math.floor(n / 2)) / (n - 1) - 0.5, z = C.z + t * 18, x = lineX + sx * 1.6;
      this.gun(side, x, z, sx); this.claim(x, z, 1.4);
      // (the gun's line of fire out through its gap: nothing set down in it for a good way)
      for (let k = 4; k <= 16; k += 4) this.claim(x - sx * k, z, 1.2);
    }
    // an earth bank on one flank, swung back a little, as a shoulder to the battery
    const bs = r() < 0.5 ? -1 : 1, bl = 7 + r() * 4;
    const bp = this.find(() => ({ x: lineX - sx * (1 + r() * 3), z: C.z + bs * (13 + r() * 5) }), bl / 2);
    if (bp) this.bank(bp.x, bp.z, bl, Math.PI / 2 + bs * sx * (0.2 + r() * 0.3), side);
    // chevaux-de-frise out in front, staggered so their gaps don't line up; a palisade on the other flank
    for (let i = 0; i < 3; i++) {
      const p = this.find(() => ({ x: lineX - sx * (6.5 + r() * 4), z: C.z + (r() - 0.5) * 28 }), 1.8, 40, 1.0);
      if (p) this.cheval(p.x, p.z, Math.PI / 2 + (r() - 0.5) * 0.35, side);
    }
    const pl = 5 + r() * 4, pp = this.find(() => ({ x: lineX - sx * (3.5 + r() * 2.5), z: C.z - bs * (11 + r() * 5) }), pl / 2);
    if (pp) this.palisade(pp.x, pp.z, pl, Math.PI / 2 + (r() - 0.5) * 0.3, side);
    // the powder for the guns, back behind them under a tarpaulin
    const ap = this.find(() => ({ x: lineX + sx * (9 + r() * 3), z: C.z + (r() - 0.5) * 14 }), 1.2);
    if (ap) this.powder(ap.x, ap.z, r() * 3);
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
    for (const zs of [-1, 1]) {
      const leaf = new THREE.Group(); for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.2, 0.1), this.M.log); st.position.set(i * 0.27 + 0.13, 1.1, 0); leaf.add(st); } const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.06), this.M.wood); bar.position.set(0.8, 1.4, 0.07); leaf.add(bar);
      const lz = C.z + zs * gw / 2, lry = zs > 0 ? Math.PI / 2 + sx * 1.1 : -Math.PI / 2 - sx * 1.1; this.put(leaf, bx, lz, lry);
      const c = this.at(bx, lz, lry, 0.8, 0); this.cols.push(this.w.col.addOBox(c.x, c.z, 0.8, 0.07, lry, this.y(c.x, c.z) + 2.2));
    }
    // inside: a powder store of barrels, and the flag on its staff
    this.barrels(mx + sx * 3, C.z + (r() < 0.5 ? -7 : 7));
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 6), this.M.wood); this.put(staff, mx, C.z, 0, 3);
    this.cols.push(this.w.col.addCircle(mx, C.z, 0.1, this.y(mx, C.z) + 6));
    // (the fort and the ground round it kept for it)
    this.claim(mx, C.z, Math.hypot(W, D / 2) + 1);
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
  gabion(x, z, side = null) {
    const g = new THREE.Group(), h = 1.15, R = 0.42;
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.96, h, 12, 4, true), this.M.wicker); basket.position.y = h / 2; g.add(basket);
    // (the weave: bands round it)
    for (let k = 1; k < 5; k++) { const b = new THREE.Mesh(new THREE.TorusGeometry(R + 0.008, 0.012, 4, 14), this.M.wicker); b.rotation.x = Math.PI / 2; b.position.y = k * h / 5; g.add(b); }
    const top = new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.M.earth); top.scale.y = 0.35; top.position.y = h - 0.02; g.add(top);
    this.put(g, x, z, this.r() * 6);
    // (solid round, as a basket is; a place to crouch behind it, for the side whose it is)
    this.cols.push(this.w.col.addCircle(x, z, 0.42, this.y(x, z) + 1.18));
    if (side != null) this.solid(x, z, 0.9, 0.9, Math.PI / 2, 1.15, side, null, false);
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
  // ---- between the lines: what the country left lying about ----
  // farms, field walls and hedges, a woodcutter's felling, rocks, haystacks, a wagon broken down — set down by turns on
  // either half, so neither side has it all; walls and hedges mostly across the field, to get down behind
  between(n) {
    const r = this.r, C = this.C, ix = this.battle ? this.dx - 15 : this.dx - 7, iz = this.battle ? 30 : 22;
    const across = () => r() < 0.8 ? Math.PI / 2 + (r() - 0.5) * 0.7 : r() * Math.PI;
    const KINDS = this.battle
      ? [["wall", 3], ["hedge", 2], ["farm", 1], ["felled", 2], ["rocks", 2], ["hay", 2], ["wagon", 2], ["fence", 2], ["barrels", 1]]
      : [["wall", 3], ["felled", 2], ["rocks", 2], ["wagon", 1], ["fence", 1], ["barrels", 1]];
    const total = KINDS.reduce((s, k) => s + k[1], 0), had = {};
    const pick = () => { let v = r() * total; for (const [k, w] of KINDS) if ((v -= w) < 0) return k; return KINDS[0][0]; };
    for (let i = 0; i < n; i++) {
      let kind = pick();
      if (kind === "farm" && had.farm) kind = "wall";
      had[kind] = (had[kind] || 0) + 1;
      // (on the near half or the far one by turns; the very middle left open, mostly)
      const half = i % 2 ? 1 : -1, ry = across();
      const len = kind === "wall" ? 6 + r() * 7 : kind === "hedge" ? 8 + r() * 7 : kind === "fence" ? 9 + r() * 8 : 0;
      const rad = len ? len / 2 : { farm: 6.5, felled: 4.5, rocks: 2.6, hay: 3.2, wagon: 3, barrels: 1.2 }[kind];
      const p = this.find(() => ({ x: C.x + half * (2 + r() * Math.max(1, ix - 2 - rad * 0.4)), z: C.z + (r() * 2 - 1) * (iz - rad * 0.5) }), rad);
      if (!p) continue;
      if (kind === "wall") {
        // (a long one, now and then, with a gap where a gate stood or the stones came down)
        if (len > 9 && r() < 0.6) { const g = 1.6 + r(), a = (len - g) * (0.3 + r() * 0.4), b = len - g - a; const A = this.at(p.x, p.z, ry, -len / 2 + a / 2, 0), B = this.at(p.x, p.z, ry, len / 2 - b / 2, 0); this.wall(A.x, A.z, a, ry); this.wall(B.x, B.z, b, ry); }
        else this.wall(p.x, p.z, len, ry);
      }
      else if (kind === "hedge") this.hedge(p.x, p.z, len, ry);
      else if (kind === "fence") this.fence(p.x, p.z, len, ry);
      else if (kind === "farm") this.farm(p.x, p.z, across());
      else if (kind === "felled") this.felled(p.x, p.z, r() * Math.PI);
      else if (kind === "rocks") this.rocks(p.x, p.z);
      else if (kind === "hay") this.hay(p.x, p.z);
      else if (kind === "wagon") this.wagon(p.x, p.z, r() * Math.PI);
      else this.barrels(p.x, p.z);
    }
  }
  wall(x, z, len, ry) {
    // a field wall of rough stones, dry-laid, waist high, a few fallen from its top and lying at its foot
    const g = new THREE.Group(), r = this.r;
    for (let i = 0; i < len / 0.4; i++) for (let row = 0; row < 3; row++) {
      if (row === 2 && r() < 0.3) continue;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + r() * 0.08, 0), this.M.stone);
      st.position.set(-len / 2 + 0.2 + i * 0.4 + (row % 2) * 0.2 - 0.1, 0.2 + row * 0.3, (r() - 0.5) * 0.15); st.scale.set(1.1, 0.75, 0.9); st.rotation.set(r() * 3, r() * 3, r() * 3); g.add(st);
    }
    for (let i = 0; i < len / 2; i++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + r() * 0.08, 0), this.M.stone); st.position.set((r() - 0.5) * len, 0.08, (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.4)); st.scale.y = 0.6; g.add(st); }
    this.put(g, x, z, ry);
    this.solid(x, z, len, 0.6, ry, 0.95, null);
  }
  // a hedge: hawthorn and blackthorn grown thick along a field's edge, higher than a man's head, its stems at the foot
  hedge(x, z, len, ry) {
    const g = new THREE.Group(), r = this.r;
    for (let i = 0; i < len / 0.6; i++) for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + r() * 0.3, 1), r() < 0.5 ? this.M.leaf : this.M.leaf2);
      b.position.set(-len / 2 + 0.3 + i * 0.6 + (r() - 0.5) * 0.3, 0.55 + k * 0.55 + r() * 0.2, (r() - 0.5) * 0.45); b.scale.set(1.1, 0.85 + r() * 0.3, 0.9); b.rotation.set(r() * 3, r() * 3, 0); g.add(b);
    }
    for (let i = 0; i < len / 0.9; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 5), this.M.log); st.position.set(-len / 2 + 0.4 + i * 0.9, 0.3, (r() - 0.5) * 0.3); st.rotation.z = (r() - 0.5) * 0.5; g.add(st); }
    this.put(g, x, z, ry);
    this.solid(x, z, len, 1.2, ry, 1.9, null);
  }
  // a snake fence of split rails: lengths laid zig-zag, end on end, five high, no posts — it stops a man, not a ball
  fence(x, z, len, ry) {
    const g = new THREE.Group(), r = this.r, L = 3.2, n = Math.max(2, Math.round(len / (L * 0.9))), step = len / n;
    for (let i = 0; i < n; i++) {
      const a = (i % 2 ? 1 : -1) * 0.32, cx = -len / 2 + (i + 0.5) * step;
      for (let k = 0; k < 5; k++) { const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.09, 0.12), this.M.rail); rail.position.set(cx, 0.1 + k * 0.2, 0); rail.rotation.set((r() - 0.5) * 0.1, a, (r() - 0.5) * 0.04); g.add(rail); }
    }
    this.put(g, x, z, ry);
    const c = this.w.col.addOBox(x, z, len / 2, 0.5, ry, this.y(x, z) + 0.95); c.noSight = true; this.cols.push(c);
  }
  // a farm burnt out and abandoned: the stone walls of the house standing roofless to different heights, a door gone
  // from its front and a window from a side, the chimney stack still up at one end, its roof-beams lying charred across
  // the floor; a log pile and barrels by it
  farm(x, z, ry) {
    const r = this.r, W = 6.5, D = 4.6, T = 0.5;
    // (each wall: along from a to b, in the house's own frame; its height, ragged; a gap in it)
    const walls = [
      { a: [-W / 2, -D / 2], b: [W / 2, -D / 2], h: 1.9, gap: null },
      { a: [-W / 2, D / 2], b: [W / 2, D / 2], h: 1.5, gap: [0.4, 1.1] },
      { a: [-W / 2, -D / 2], b: [-W / 2, D / 2], h: 2.2, gap: null },
      { a: [W / 2, -D / 2], b: [W / 2, D / 2], h: 1.2, gap: [-0.2, 1.0, 0.7] },
    ];
    for (const wl of walls) {
      const dx = wl.b[0] - wl.a[0], dz = wl.b[1] - wl.a[1], L = Math.hypot(dx, dz), wry = ry + Math.atan2(-dz, dx);
      // (the gap: [where along, how wide, and how high the sill below it — 0 for a door])
      const parts = wl.gap ? [[-L / 2, wl.gap[0] - wl.gap[1] / 2], [wl.gap[0] + wl.gap[1] / 2, L / 2]] : [[-L / 2, L / 2]];
      const mid = this.at(x, z, ry, (wl.a[0] + wl.b[0]) / 2, (wl.a[1] + wl.b[1]) / 2);
      const g = new THREE.Group();
      for (const [p0, p1] of parts) {
        const len = p1 - p0; if (len < 0.3) continue;
        const cols = Math.max(1, Math.round(len / 0.5)), cw = len / cols;
        let hmax = 0;
        for (let i = 0; i < cols; i++) {
          // (ragged at the top: lower toward the open end of a broken wall)
          const hh = wl.h * (0.55 + 0.45 * r()) + (i === 0 || i === cols - 1 ? -0.2 : 0), rows = Math.max(1, Math.round(hh / 0.3));
          hmax = Math.max(hmax, rows * 0.3);
          for (let k = 0; k < rows; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(cw * (0.9 + r() * 0.12), 0.27 + r() * 0.04, T * (0.9 + r() * 0.15)), this.M.stone); st.position.set(p0 + (i + 0.5) * cw + (k % 2 ? 0.08 : -0.08), 0.15 + k * 0.3, (r() - 0.5) * 0.05); st.rotation.y = (r() - 0.5) * 0.06; g.add(st); }
        }
        const pm = (p0 + p1) / 2, pc = this.at(mid.x, mid.z, wry, pm, 0);
        this.solid(pc.x, pc.z, len, T + 0.1, wry, Math.min(hmax, 1.9), null);
      }
      // (under a window: the sill and the wall below it)
      if (wl.gap && wl.gap[2]) { const rows = Math.round(wl.gap[2] / 0.3); for (let k = 0; k < rows; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(wl.gap[1], 0.28, T), this.M.stone); st.position.set(wl.gap[0], 0.15 + k * 0.3, 0); g.add(st); } const pc = this.at(mid.x, mid.z, wry, wl.gap[0], 0); this.solid(pc.x, pc.z, wl.gap[1], T + 0.1, wry, wl.gap[2], false); }
      this.put(g, mid.x, mid.z, wry);
    }
    // the chimney stack, at the west end, up above the rest
    { const c = this.at(x, z, ry, -W / 2 + 0.6, 0), g = new THREE.Group(); const st = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.6, 0.9), this.M.stone); st.position.y = 1.8; g.add(st); const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.0), this.M.soot); cap.position.y = 3.62; g.add(cap); this.put(g, c.x, c.z, ry); const cc = this.w.col.addOBox(c.x, c.z, 0.5, 0.45, ry, this.y(c.x, c.z) + 3.6); this.cols.push(cc); }
    // the roof-beams, fallen in and burnt black, one end up on the wall
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(D + 0.4, 0.2, 0.2), this.M.soot), c = this.at(x, z, ry, -1.6 + i * 1.6 + (r() - 0.5) * 0.6, 0), g = new THREE.Group(); b.rotation.set(0, Math.PI / 2 + (r() - 0.5) * 0.4, (r() - 0.5) * 0.5); b.position.y = 0.25 + r() * 0.3; g.add(b); this.put(g, c.x, c.z, ry); }
    // ash and char over the floor
    { const g = new THREE.Group(), f = new THREE.Mesh(new THREE.BoxGeometry(W - 0.8, 0.04, D - 0.8), this.M.ash); f.position.y = 0.02; g.add(f); this.put(g, x, z, ry); }
    // the log pile against the back wall, and barrels by the door
    { const c = this.at(x, z, ry, 0.5, -D / 2 - 0.9), lp = P.logPile(0, 0, 10, 0); lp.position.set(c.x, this.y(c.x, c.z), c.z); lp.rotation.y = ry + Math.PI / 2; this.root.add(lp); this.solid(c.x, c.z, 2.3, 1.4, ry, 0.9, null); }
    { const c = this.at(x, z, ry, -1.4, D / 2 + 1.3); this.barrels(c.x, c.z); }
  }
  // where a woodcutter was at work: the stumps of what he felled, two trunks lying limbed where they came down, and his
  // stack of cut logs
  felled(x, z, ry) {
    const r = this.r;
    for (let i = 0; i < 2; i++) {
      const L = 6 + r() * 3, R = 0.28 + r() * 0.1, c = this.at(x, z, ry, (r() - 0.5) * 1.5, (i ? 1 : -1) * (1.3 + r() * 0.8)), a = ry + (r() - 0.5) * 0.5;
      const m = makeLogs([{ x: 0, y: R, z: 0, len: L, r: R, dir: "x" }], (x * 7 + z * 3 + i) | 0); m.position.set(c.x, this.y(c.x, c.z), c.z); m.rotation.y = a; this.root.add(m);
      this.solid(c.x, c.z, L, R * 2 + 0.1, a, R * 2 + 0.05, null);
      // (its stump, where it stood: at the butt end)
      const s = this.at(c.x, c.z, a, -L / 2 - 0.6, 0), st = makeStump({ x: s.x, z: s.z, h: 12 }, "spruce"); st.position.set(s.x, this.y(s.x, s.z), s.z); st.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); this.root.add(st);
      this.cols.push(this.w.col.addCircle(s.x, s.z, 0.32, this.y(s.x, s.z) + 0.55));
    }
    { const c = this.at(x, z, ry, 2.4, 0), lp = P.logPile(0, 0, 13, 0); lp.position.set(c.x, this.y(c.x, c.z), c.z); lp.rotation.y = ry; this.root.add(lp); this.solid(c.x, c.z, 1.5, 2.3, ry, 1.05, null); }
  }
  // boulders, lying where the ice left them: a big one to get behind, and smaller round it
  rocks(x, z) {
    const r = this.r, n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const R = i ? 0.35 + r() * 0.35 : 0.9 + r() * 0.35, a = r() * Math.PI * 2, d = i ? 1.2 + r() * 1.2 : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const g = new THREE.Group(), m = new THREE.Mesh(new THREE.DodecahedronGeometry(R, 1), this.M.boulder);
      // (lumpy: its points pushed in and out a little)
      const p = m.geometry.attributes.position; for (let k = 0; k < p.count; k++) { const f = 0.85 + ((Math.sin(p.getX(k) * 7.1 + p.getY(k) * 3.3 + p.getZ(k) * 5.7 + i) + 1) / 2) * 0.3; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f, p.getZ(k) * f); } m.geometry.computeVertexNormals();
      const hy = 0.7 + r() * 0.2; m.scale.set(1.1, hy, 0.95); m.position.y = R * hy * 0.55; m.rotation.y = r() * 3; g.add(m);
      this.put(g, px, pz, 0);
      const top = R * hy * 1.5;
      if (i === 0) this.solid(px, pz, R * 1.7, R * 1.6, r() * 3, top, null);
      else this.cols.push(this.w.col.addCircle(px, pz, R * 0.95, this.y(px, pz) + top));
    }
  }
  // a haystack, built round a pole and thatched against the rain, and stooks of sheaves stood drying by it
  hay(x, z) {
    const r = this.r, g = new THREE.Group();
    const prof = [[0, 0], [1.75, 0], [1.9, 0.5], [1.85, 1.1], [1.5, 1.8], [0.95, 2.4], [0.35, 2.85], [0.05, 3.0]].map(([a, b]) => new THREE.Vector2(a, b));
    const stack = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), this.M.hay); g.add(stack);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6), this.M.log); pole.position.y = 3.2; g.add(pole);
    for (let k = 0; k < 2; k++) { const band = new THREE.Mesh(new THREE.TorusGeometry(1.2 - k * 0.45, 0.03, 4, 18), this.M.rail); band.rotation.x = Math.PI / 2; band.position.y = 1.95 + k * 0.55; band.scale.setScalar(1 + (1 - k) * 0.2); g.add(band); }
    this.put(g, x, z, r() * 3);
    this.solid(x, z, 3.0, 3.0, r() * 3, 2.8, null);
    for (let i = 0; i < 3 + Math.floor(r() * 3); i++) {
      const a = r() * Math.PI * 2, d = 2.6 + r() * 1.2, s = new THREE.Group();
      for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2, sh = makeSheaf(); sh.scale.setScalar(2.4); sh.rotation.set(0, t, -0.3); sh.position.set(-Math.cos(t) * 0.2, 0, Math.sin(t) * 0.2); s.add(sh); }
      this.put(s, x + Math.cos(a) * d, z + Math.sin(a) * d, r() * 3);
    }
  }
  // a wagon broken down and left: the farm cart over on its side, its load spilled — barrels rolled off, sacks split
  wagon(x, z, ry) {
    this.cart(x, z, ry);
    const r = this.r;
    for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
      const c = this.at(x, z, ry, (r() - 0.5) * 2.6, 1.0 + r() * 1.2), g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 12), this.M.stave); b.rotation.z = Math.PI / 2; b.position.y = 0.32; g.add(b);
      for (const h of [-0.3, 0.3]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.015, 4, 14), this.M.iron); hoop.rotation.y = Math.PI / 2; hoop.position.set(h, 0.32, 0); g.add(hoop); }
      const a = r() * 3; this.put(g, c.x, c.z, a);
      this.cols.push(this.w.col.addOBox(c.x, c.z, 0.45, 0.33, a, this.y(c.x, c.z) + 0.64));
    }
    for (let i = 0; i < 3; i++) { const c = this.at(x, z, ry, (r() - 0.5) * 3, -0.9 - r() * 0.8), sk = makeSack(); sk.scale.setScalar(2.2); sk.rotation.set(Math.PI / 2 * (r() < 0.6 ? 1 : 0), r() * 3, 0); this.put(sk, c.x, c.z, r() * 3, 0.1); }
  }
  // by night: a watch-fire behind each side's line, and a lantern on a pole by every gun — the only light on the field
  // but the moon's and the muzzles'
  nightFires() {
    const C = this.C; this.flames = [];
    for (const side of [0, 1]) {
      const sx = side === 0 ? -1 : 1, F = this.fortAt && this.fortAt.side === side ? this.fortAt : null;
      const p = F ? { x: F.mx + sx * 2, z: C.z + 5 } : this.find(() => ({ x: C.x + sx * (this.dx + 7 + this.r() * 4), z: C.z + (this.r() - 0.5) * 16 }), 1.4, 40, 1.0) || { x: C.x + sx * (this.dx + 9), z: C.z };
      this.watchFire(p.x, p.z);
    }
    for (const g of this.guns) { const c = this.at(g.x, g.z, g.ry, -1.7, 1.2); this.lantern(c.x, c.z); }
  }
  watchFire(x, z) {
    const g = new THREE.Group(), r = this.r;
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + r() * 0.06, 0), this.M.stone); st.position.set(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62); st.scale.y = 0.7; g.add(st); }
    for (let i = 0; i < 5; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6), this.M.soot); lg.position.y = 0.2; lg.rotation.set(0.9, i / 5 * Math.PI * 2, 0); lg.position.x = Math.cos(i / 5 * Math.PI * 2) * 0.15; g.add(lg); }
    this.put(g, x, z, r() * 3);
    const fl = makeFlame(2.4, new THREE.PointLight(0xff9a48, 14, 30, 1.5)); fl.position.set(x, this.y(x, z) + 0.15, z); this.root.add(fl); this.flames.push(fl);
    this.cols.push(this.w.col.addCircle(x, z, 0.75, this.y(x, z) + 0.6));
  }
  lantern(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.0, 6), this.M.wood); pole.position.y = 1.0; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), this.M.wood); arm.position.set(0, 1.95, 0.18); g.add(arm);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), this.M.iron); box.position.set(0, 1.72, 0.36); g.add(box);
    this.put(g, x, z, 0);
    const fl = makeFlame(0.5, new THREE.PointLight(0xffb060, 5, 13, 1.6)); fl.position.set(x, this.y(x, z) + 1.64, z + 0.36); this.root.add(fl); this.flames.push(fl);
    this.cols.push(this.w.col.addCircle(x, z, 0.08, this.y(x, z) + 2));
  }
  // a gun's powder, kept back from it: a few casks under a tarpaulin pegged down over a ridge-pole
  powder(x, z, ry) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.6, 10), this.M.stave); b.position.set((i % 2) * 0.55 - 0.27, 0.3, Math.floor(i / 2) * 0.55 - 0.27); g.add(b); }
    for (const sd of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.02, 1.15), this.M.tarp); t.position.set(0, 0.62, sd * 0.42); t.rotation.x = sd * 0.75; g.add(t); }
    for (const e of [-0.85, 0.85]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 5), this.M.wood); p.position.set(e, 0.52, 0); g.add(p); }
    this.put(g, x, z, ry);
    this.solid(x, z, 1.8, 1.7, ry, 0.95, null);
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
    const g = new THREE.Group(), n = 2 + Math.floor(this.r() * 3), ry = this.r() * 3, pos = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 12), this.M.stave); b.position.set((i % 2) * 0.66 - 0.33, 0.45, Math.floor(i / 2) * 0.66 - 0.33 * (n > 2 ? 1 : 0)); g.add(b); pos.push(b.position.clone());
      for (const h of [0.15, 0.75]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.015, 4, 14), this.M.iron); hoop.rotation.x = Math.PI / 2; hoop.position.set(b.position.x, h, b.position.z); g.add(hoop); }
    }
    this.put(g, x, z, ry);
    // (each cask solid as it stands; and a place to crouch behind the lot)
    for (const p of pos) { const c = this.at(x, z, ry, p.x, p.z); this.cols.push(this.w.col.addCircle(c.x, c.z, 0.33, this.y(c.x, c.z) + 0.9)); }
    const c = this.at(x, z, ry, 0, n > 2 ? 0 : -0.33);
    this.solid(c.x, c.z, 1.3, n > 2 ? 1.3 : 0.66, ry, 0.9, null, null, false);
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
    this.put(m, x, z, ry, 0, false);
    // (solid from the muzzle to the trail's end: the carriage and wheels a box, the barrel out before them a narrower one)
    { const c = this.at(x, z, ry, 0, -0.32); this.cols.push(this.w.col.addOBox(c.x, c.z, 0.6, 0.5, ry, this.y(x, z) + 1.05)); }
    { const c = this.at(x, z, ry, 0, 0.95); this.cols.push(this.w.col.addOBox(c.x, c.z, 0.24, 0.75, ry, this.y(x, z) + 0.9)); }
    { const c = this.at(x, z, ry, 0, -1.25); this.cols.push(this.w.col.addOBox(c.x, c.z, 0.22, 0.6, ry, this.y(x, z) + 1.1)); }
    this.guns.push({ side, x, z, ry, yaw: 0, pitch: 0.06, model: m, loaded: true, reload: 0, reloadT: 1, recoil: 0, back: 0, base: m.position.clone(), target: null, firing: true, next: 10 + this.r() * 8, crew: [], tools: this.gunTools() });
  }
  // where a gun's crew stand to work it: either side of the breech, clear of the wheels (i 0: the gunner, who lays and
  // fires it; 1: the loader, with the rammer and the sponge)
  station(g, i) { const w = this.crewWork(g, i); return { x: w.x, z: w.z }; }
  // ---- the drill: how a gun is served, step by step, as the loading goes ----
  // fired, it's thrown back on its wheels. The loader sponges the bore out (three strokes, the wet wool killing any
  // spark left), while the gunner stops the vent with his thumb; the gunner brings the cartridge and puts it in the
  // muzzle, and the loader turns his staff end for end and rams it home, a long push and two hard strokes; the gunner
  // pricks the cartridge through the vent and primes it from his horn, then crouches behind the trail and lays the gun;
  // both heave it back up to its place at the wheels; and the gunner stands by it with the burning linstock
  drill(g) {
    if (g.loaded) return { ph: "ready", k: 0 };
    const p = clamp(1 - g.reload / (g.reloadT || 1), 0, 1);
    for (const [ph, a, b] of DRILL) if (p < b) return { ph, k: (p - a) / (b - a), p };
    return { ph: "run", k: 1, p };
  }
  // where each of the crew is in it, which way he looks, and how he stands
  crewWork(g, i) {
    const { ph, k } = this.drill(g), ry = g.ry + g.yaw, back = g.back || 0;
    const L = (lx, lz) => { const c = Math.cos(ry), s = Math.sin(ry), z2 = lz + back; return { x: g.x + lx * c + z2 * s, z: g.z - lx * s + z2 * c }; };
    const muz = L(0, -1.7), vent = L(0, 0.3);
    let at, face, pose = "idle", crouch = false;
    if (i) {   // the loader: the sponge and the rammer
      if (ph === "sponge" || ph === "ram") { at = L(0.62, -2.5); face = muz; pose = "reach"; }
      else if (ph === "load") { at = L(0.7, -2.2); face = muz; pose = "hold"; }
      else if (ph === "run") { at = L(0.93, -0.3); face = L(0.93, -3); pose = "reach"; }
      else { at = L(0.95, 0.55); face = null; }
    } else {   // the gunner: the vent, the cartridge, the priming, the laying and the match
      if (ph === "back" || ph === "sponge" || ph === "ram") { at = L(-0.56, 0.3); face = vent; pose = "reach"; }
      else if (ph === "load") { at = k < 0.45 ? L(-0.95, 0.4) : L(-0.7, -2.1); face = k < 0.45 ? null : muz; pose = "hold"; }
      else if (ph === "prime") { at = L(-0.56, 0.3); face = vent; pose = "reach"; }
      else if (ph === "lay") { at = L(0, 2.1); face = muz; crouch = true; }
      else if (ph === "run") { at = L(-0.93, -0.3); face = L(-0.93, -3); pose = "reach"; }
      else { at = L(-1.0, 0.7); face = null; pose = "torch"; }
    }
    return { x: at.x, z: at.z, face, pose, crouch, ph, k };
  }
  // the gun's tools, out of their hooks: the staff (a sheepskin sponge one end, the rammer's head the other), the
  // cartridge (a flannel bag of powder with the ball strapped to it), and the linstock with its glowing match
  gunTools() {
    const staff = new THREE.Group();
    { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.2, 6).rotateX(Math.PI / 2), this.M.wood); staff.add(p);
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 10).rotateX(Math.PI / 2), this.M.fleece); sp.position.z = -1.1; staff.add(sp);
      const rh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.1, 10).rotateX(Math.PI / 2), this.M.wood); rh.position.z = 1.1; staff.add(rh); }
    const cart = new THREE.Group();
    { const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10).rotateX(Math.PI / 2), this.M.flannel); bag.position.z = 0.1; cart.add(bag);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), this.M.iron); ball.position.z = -0.03; cart.add(ball); }
    const lin = new THREE.Group();
    { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1.1, 6), this.M.wood); p.position.y = 0.55; lin.add(p);
      const fork = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 8, Math.PI), this.M.iron); fork.position.y = 1.12; lin.add(fork);
      const match = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff7a2a })); match.position.set(0.04, 1.13, 0); lin.add(match); lin.userData.match = match; }
    for (const o of [staff, cart, lin]) { o.visible = false; o.traverse(c => { if (c.isMesh) c.castShadow = true; }); this.root.add(o); }
    return { staff, cart, lin };
  }
  // each frame: the gun thrown back and run up again, the tools where the men's hands are, and the drill heard
  drillTick(g, dt) {
    const m = g.model, T = g.tools, D = this.drill(g), n = g.crewN, crew = g.crew.filter(u => u.alive);
    const loader = g.crew[1] && g.crew[1].alive ? g.crew[1] : null, gunner = g.crew[0] && g.crew[0].alive ? g.crew[0] : null;
    // (back on its wheels a pace when it fires; brought up again in the drill's last step)
    if (D.ph === "run" && n) g.back = Math.min(g.back, 0.75 * (1 - D.k));
    else if (D.ph === "ready") g.back = Math.max(0, g.back - dt * 0.8);
    const ry = g.ry + g.yaw;
    m.position.set(g.base.x + Math.sin(ry) * g.back, g.base.y, g.base.z + Math.cos(ry) * g.back);
    m.updateMatrixWorld(true);
    const ud = m.userData, muzzle = ud.muzzle.getWorldPosition(_v1), q = ud.barrel.getWorldQuaternion(_q1), out = _v2.set(0, 0, -1).applyQuaternion(q);
    const busy = n && (D.ph === "sponge" || D.ph === "ram" || D.ph === "load");
    for (const o of ud.stowed || []) o.visible = !busy;
    // the staff: sponge end in the bore, three strokes; held upright while the cartridge goes in; turned end for end
    // and the rammer driven home, a long push and two short hard ones
    T.staff.visible = !!(busy && loader);
    if (T.staff.visible) {
      let depth = 0, ramEnd = false;
      if (D.ph === "sponge") depth = 0.15 + 0.75 * (0.5 - 0.5 * Math.cos(D.k * Math.PI * 6));
      else if (D.ph === "ram") { ramEnd = true; depth = D.k < 0.45 ? 0.1 + D.k / 0.45 * 0.85 : D.k < 0.85 ? 0.82 + 0.13 * Math.abs(Math.sin((D.k - 0.45) / 0.4 * Math.PI * 2)) : 0.95 * (1 - (D.k - 0.85) / 0.15); }
      if (D.ph === "load") {
        T.staff.position.set(loader.pos.x, loader.pos.y + 1.1, loader.pos.z); T.staff.quaternion.setFromUnitVectors(_z, _up);
      } else {
        T.staff.quaternion.setFromUnitVectors(_z, ramEnd ? _v3.copy(out).negate() : out);
        T.staff.position.copy(muzzle).addScaledVector(out, 1.1 - depth);
        T.staff.rotateZ(D.k * 9);
      }
      // (heard: the sponge each stroke in, the rammer each time it strikes the charge)
      const stroke = D.ph === "sponge" ? Math.floor(D.k * 3) : D.ph === "ram" ? (D.k < 0.45 ? 0 : D.k < 0.65 ? 1 : D.k < 0.85 ? 2 : 3) : -1;
      if (stroke !== g.stroke && stroke >= 0) { const F = window.__foley; if (F && F.load) F.load(D.ph === "sponge" ? "sponge" : "gunRam", muzzle, 0.75); }
      g.stroke = stroke;
    } else g.stroke = -1;
    // the cartridge: in the gunner's hands, and into the muzzle
    T.cart.visible = !!(D.ph === "load" && gunner && D.k < 0.92);
    if (T.cart.visible) {
      if (D.k < 0.7) { const f = gunner.yaw; T.cart.position.set(gunner.pos.x + Math.sin(f) * 0.35, gunner.pos.y + 1.0, gunner.pos.z + Math.cos(f) * 0.35); T.cart.rotation.set(0, f, 0); }
      else { T.cart.quaternion.setFromUnitVectors(_z, out); T.cart.position.copy(muzzle).addScaledVector(out, 0.15 - (D.k - 0.7) / 0.22 * 0.35); }
    }
    // (the priming heard; the wheels as it's run up)
    if (D.ph !== g.lastPh) {
      const F = window.__foley, vent = ud.barrel.localToWorld(_v3.set(0, 0.17, 0.6));
      if (F && F.load && n) { if (D.ph === "prime") F.load("prick", vent, 0.7); if (D.ph === "run") F.load("runOut", m.position, 0.9); }
      g.lastPh = D.ph;
    }
    // the linstock: in the gunner's hand while it's loaded, the match glowing
    T.lin.visible = !!(D.ph === "ready" && gunner);
    if (T.lin.visible) { const f = gunner.yaw + Math.PI / 2; T.lin.position.set(gunner.pos.x + Math.sin(f) * 0.28, gunner.pos.y + 0.1, gunner.pos.z + Math.cos(f) * 0.28); T.lin.rotation.set(0, gunner.yaw, 0.12); T.lin.userData.match.scale.setScalar(0.8 + Math.random() * 0.5); }
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
    g.loaded = false; g.reload = g.reloadT = 9 + this.r() * 2.5; g.recoil = 1; g.back = 0.75;
    this.balls.push({ p: at.clone(), v: dir.multiplyScalar(140), hits: new Set(), bounces: 0, t: 0, side: g.side, mesh: (() => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(0x1c1c1e, { metalness: 0.4, roughness: 0.5 })); b.position.copy(at); root.add(b); return b; })() });
    muzzleFlash(root, at.clone().addScaledVector(dir, 0.2), dir, 3);
    powderSmoke(root, at.clone().addScaledVector(dir, 0.3), dir, { scale: 3, life: 32, n: 60, speed: 15, haze: true, hazeN: 18, hazeA: 0.36 });
    { const b = m.barrel; b.updateMatrixWorld(true); panPuff(root, b.localToWorld(new THREE.Vector3(0, 0.2, 0.6)), 1.4); }
    AUDIO.cannon ? AUDIO.cannon(1, at) : AUDIO.gunshot && AUDIO.gunshot(1.4, at);
    const pl = G.player, d = Math.hypot(at.x - pl.pos.x, at.z - pl.pos.z);
    if (d < 45) shake(Math.max(0.12, 1 - d / 45) * 0.8);
  }
  // each frame: the guns laid and fired, the balls flying; hit(u, from, v) is called for anyone a ball goes through
  update(dt, units, hit) {
    for (const f of this.flames || []) flicker(f, dt);
    // (the guns open only once the field's had a moment: a crew isn't cut down before it's even seen the enemy)
    if (this.active !== false) this.opened = (this.opened || 0) + dt;
    for (const g of this.guns) {
      // (a gun is only as good as its crew: two load it at the drill's pace, one at half, none not at all — nor fire it)
      const crewN = g.crew.length ? this.manned(g) : 2; g.crewN = crewN;
      if (!g.loaded && crewN) { g.reload -= dt * (crewN >= 2 ? 1 : 0.5); if (g.reload <= 0) g.loaded = true; }
      // (their side: laid on the thickest part of yours, now and then; yours: on where you said)
      // (never at nothing: laid afresh the moment the men it was laid on are down or gone, and with no one there, not fired)
      if (!g.target) {
        const foes = units.filter(u => u.team !== g.side && u.alive);
        const stale = !g.aim || !foes.some(u => Math.hypot(u.pos.x - g.aim.x, u.pos.z - g.aim.z) < 6);
        if ((g.next -= dt) <= 0 || (stale && g.loaded)) { g.next = 6; const t = this.thickest(foes); g.aim = t ? { x: t.x + (this.r() - 0.5) * 3.5, z: t.z + (this.r() - 0.5) * 3.5 } : null; }
      }
      else g.aim = g.target;
      if (g.aim) {
        const dx = g.aim.x - g.x, dz = g.aim.z - g.z, want = Math.atan2(-dx, -dz), d = Math.hypot(dx, dz);
        const dy = Math.atan2(Math.sin(want - g.ry), Math.cos(want - g.ry));
        g.yaw += (clamp(dy, -0.9, 0.9) - g.yaw) * Math.min(1, dt * 1.5);
        const need = 0.5 * Math.asin(clamp(d * 9.8 / (140 * 140), -1, 1)) + (this.y(g.aim.x, g.aim.z) - this.y(g.x, g.z) - 0.9) / Math.max(4, d);
        g.pitch += (need - g.pitch) * Math.min(1, dt * 1.5);
        if (g.loaded && g.firing && crewN && !g.byHand && this.active !== false && this.opened > 7 + g.side * 2 && Math.abs(clamp(dy, -0.9, 0.9) - g.yaw) < 0.04) this.fire(g);
      }
      g.recoil = Math.max(0, g.recoil - dt * 1.4);
      const m = g.model; m.rotation.y = g.ry + g.yaw; m.userData.barrel.rotation.x = g.pitch;
      this.drillTick(g, dt);
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
        if (b.p.y <= gy + 0.07 || (b.v.length() > 8 && b.t > 0.035 && this.w.col.solidAt(b.p.x, b.p.y, b.p.z, 0))) {
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
  dispose() { for (const f of this.flames || []) FLAMES.delete(f); this.w.root.remove(this.root); for (const b of this.balls) this.w.root.remove(b.mesh); for (const c of [...this.pieces.map(p => p.c), ...this.cols]) c && this.w.col.remove && this.w.col.remove(c); }
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
