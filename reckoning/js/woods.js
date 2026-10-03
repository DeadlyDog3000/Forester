// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The old woods, far from Hamburg: a road that goes on long enough to leave
// the bells behind, and at the end of it a clearing with a burned cabin.

import { THREE, Builder, Collision, MAT, mat, rng, prismGeo, makeFlame, TAU, clamp, addDetail, SNOW, ROOFED, ROOFSIZE } from "./core.js";
import { WorldBase, G } from "./engine.js";
import { P, forestInstances, makeSpruce, TREE, modelCopy, ensureModel } from "./models.js";
import { grassTexture } from "./hamburg.js";
import { INK, TREEC, TOWN, tree, road, label, seen, oreIcon, caveIcon } from "./map.js";
import { FURNITURE, DEFAULT_HOME, DEFAULT_CHEST, ROOM } from "./furnish.js";
import { ROCKS } from "./body.js";
import { AUDIO } from "./audio.js";
import { UI } from "./ui.js";

// the road out of the city winds: round hills, round bogs, round other people's land
const ROAD_PTS = [[0, 30], [0, 10], [9, -16], [24, -38], [18, -62], [-4, -78], [-24, -98], [-30, -124], [-14, -146], [10, -154], [28, -172],
  [24, -198], [4, -212], [-14, -230], [-12, -252], [4, -266], [20, -276], [30, -290]];
// where other tracks leave it: t is how far along the road, side is -1 left / 1 right (flipped if it would cross back)
export const FORKS = [
  { t: 0.07, side: 1, sign: ["Lübeck", "Altona"] },
  { t: 0.17, side: -1, sign: ["Lübeck", "Wandsbek"] },
  { t: 0.29, side: 1, sign: ["Lübeck", "Bergedorf"] },
  { t: 0.42, side: -1 },
  { t: 0.61, side: 1 },
  { t: 0.72, side: -1 },
  { t: 0.83, side: 1 },
];
export const CLEARING = { x: 34, z: -318, r: 23 };
export const CABIN = { x: 36, z: -325, ry: 0.35 };
// the deer ride: beech and spruce east of the clearing, where the roe graze and the hares sit out
export const HUNT = { x: 74, z: -332, r: 34 };
// how far into the forest round the clearing you may walk, once you live there
export const ROAM = 100;
// each ring of forest cleared as the settlement grows is this deep
export const RING = 14;
const MAP_K = 5;
// smooth value noise, 0..1: a lattice of fixed random heights, eased between
function hash2(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// is a point inside a polygon ([[x, z], ...])?
export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}                 // the map's sheet: pixels to the metre
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const STACK = { x: 28.5, z: -321.5 };
const BLOCK = { x: 41.5, z: -316 };
const FIRE = { x: 33.5, z: -311.5 };

export class Woods extends WorldBase {
  constructor() {
    super(Collision);
    this.col = new Collision(6);
    this.openTracks = new Set();       // forks you may walk down; the rest are barred
    this.name = "woods";
    const root = this.root, r = rng(3071);

    // the road, as a smooth curve sampled into points
    const curve = new THREE.CatmullRomCurve3(ROAD_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    this.road = curve.getSpacedPoints(700).map(v => ({ x: v.x, z: v.z }));
    this.roadLen = curve.getLength();
    // the forks: tracks that leave the road, bend away, and peter out in the trees
    this.branches = FORKS.map((f, n) => {
      const k = Math.floor(f.t * (this.road.length - 1));
      const a = this.road[k], b = this.road[Math.min(this.road.length - 1, k + 4)];
      const dl = Math.hypot(b.x - a.x, b.z - a.z) || 1, fx = (b.x - a.x) / dl, fz = (b.z - a.z) / dl;
      const make = side => {
        const rx = -fz * side, rz = fx * side;           // to that side
        const pts = [[a.x, a.z]];
        let dx = fx * 0.55 + rx * 0.84, dz = fz * 0.55 + rz * 0.84;
        let x = a.x, z = a.z;
        for (const [len, turn] of [[12, 0.15], [18, 0.2], [18, -0.1], [16, 0.12]]) {
          const c = Math.cos(turn * side), s = Math.sin(turn * side);
          [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
          x += dx * len; z += dz * len; pts.push([x, z]);
        }
        return pts;
      };
      // the track must not wander back to the road further on
      const far = pts => Math.min(...pts.slice(2).map(([x, z]) => Math.min(...this.road.filter((_, i) => Math.abs(i - k) > 30).map(p => Math.hypot(p.x - x, p.z - z)))));
      let pts = make(f.side);
      if (far(pts) < 22) { const o = make(-f.side); if (far(o) > far(pts)) { pts = o; f.side = -f.side; } }
      const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
      const sp = c.getSpacedPoints(60).map(v => ({ x: v.x, z: v.z }));
      return { fork: f, n, k, at: a, pts: sp, dir: { x: fx, z: fz } };
    });

    // ---- terrain ----
    const size = 760, seg = 190;
    const tg = new THREE.PlaneGeometry(size, size, seg, seg);
    tg.rotateX(-Math.PI / 2);
    tg.translate(10, 0, -150);
    const pos0 = tg.attributes.position;
    for (let i = 0; i < pos0.count; i++) pos0.setY(i, this.heightAt(pos0.getX(i), pos0.getZ(i)));
    // low-poly, like everything else: every facet flat and of one colour — needle-brown litter, moss,
    // dark bare earth and old leaves, laid in slow drifts, a little grassier out in the clearing
    const geo = tg.toNonIndexed(); tg.dispose();
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
    const PAL = { litter: new THREE.Color(0x5b4533), leaf: new THREE.Color(0x87603a), moss: new THREE.Color(0x4a5d2a), earth: new THREE.Color(0x3f3022), grass: new THREE.Color(0x6c7f38), road: new THREE.Color(0x7d6548),
      fern: new THREE.Color(0x3d5a28), dry: new THREE.Color(0x8c8248), stone: new THREE.Color(0x6e6b62) };
    const hash = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
    const vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
      return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v; };
    const c = new THREE.Color();
    // the colour of the ground at a point: litter, drifts of dry grass and leaves, moss, bracken, bare earth, stone on
    // the banks, grass in the clearing, the road's dust. (The road itself takes its edges from this, so it melts in.)
    const groundAt = (x, z, steep, c) => {
      const moss = vn(x * 0.09, z * 0.09), bare = vn(x * 0.12 + 31, z * 0.12 + 17), leaf = vn(x * 0.16 + 9, z * 0.16 + 4);
      const fern = vn(x * 0.07 + 51, z * 0.07 + 77), dry = vn(x * 0.05 + 13, z * 0.05 + 91);
      c.copy(PAL.litter);
      if (dry > 0.6) c.lerp(PAL.dry, Math.min(1, (dry - 0.6) * 3.5));          // sunny drifts of old dry grass
      if (leaf > 0.6) c.lerp(PAL.leaf, Math.min(0.8, (leaf - 0.6) * 4));       // beech leaves under the broadleaves
      if (moss > 0.55) c.lerp(PAL.moss, Math.min(1, (moss - 0.55) * 4));
      if (fern > 0.64) c.lerp(PAL.fern, Math.min(0.9, (fern - 0.64) * 4));     // bracken in the damp
      if (bare > 0.66) c.lerp(PAL.earth, Math.min(0.85, (bare - 0.66) * 4));
      if (steep > 0.12) c.lerp(PAL.stone, Math.min(0.9, (steep - 0.12) * 5));
      const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
      if (dc < CLEARING.r + 8) c.lerp(PAL.grass, clamp((CLEARING.r + 8 - dc) / 10, 0, 1) * 0.75);
      const d = this.anyRoadDist(x, z).d;
      if (d < 3) c.lerp(PAL.road, clamp((3 - d) / 2, 0, 1) * 0.7);
      return c;
    };
    this.groundColour = (x, z, out = new THREE.Color()) => {
      // (the slope from the ground either side)
      const e = 0.8, sx = this.heightAt(x + e, z) - this.heightAt(x - e, z), sz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
      return groundAt(x, z, 1 - 1 / Math.hypot(sx / (2 * e), 1, sz / (2 * e)), out);
    };
    for (let t = 0; t < pos.count; t += 3) {
      const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      // how steep this facet is: stone shows through on the banks
      const ax = pos.getX(t + 1) - pos.getX(t), ay = pos.getY(t + 1) - pos.getY(t), az = pos.getZ(t + 1) - pos.getZ(t);
      const bx = pos.getX(t + 2) - pos.getX(t), by = pos.getY(t + 2) - pos.getY(t), bz = pos.getZ(t + 2) - pos.getZ(t);
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, steep = 1 - Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
      groundAt(x, z, steep, c);
      c.multiplyScalar(0.84 + hash(x * 0.37, z * 0.53) * 0.32);       // each facet a shade apart from its neighbours
      for (let k = 0; k < 3; k++) { colors[(t + k) * 3] = c.r; colors[(t + k) * 3 + 1] = c.g; colors[(t + k) * 3 + 2] = c.b; }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tg2 = geo;
    this.terrainMat = addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), { scale: 1, amount: 0.06, grain: 0.15, surface: "none" });
    const terrain = this.terrain = new THREE.Mesh(tg2, this.terrainMat);
    SNOW.value = 0;
    terrain.receiveShadow = true;
    root.add(terrain);

    const bEnd = this.branches[3].pts, be = bEnd[bEnd.length - 1], bp = bEnd[bEnd.length - 6];
    const bl = Math.hypot(be.x - bp.x, be.z - bp.z) || 1;
    const burnerAt = { x: be.x + (be.x - bp.x) / bl * 6, z: be.z + (be.z - bp.z) / bl * 6 };
    // ---- the forest ----
    const list = [];
    const taken = new Map();
    const cellK = (x, z) => Math.floor(x / 3.4) + "," + Math.floor(z / 3.4);
    const tries = 6500;
    for (let i = 0; i < tries; i++) {
      const t = this.road[Math.floor(r() * this.road.length)];
      const a = r() * TAU, rad = 5 + Math.pow(r(), 0.9) * 70;
      const x = t.x + Math.cos(a) * rad, z = t.z + Math.sin(a) * rad;
      if (this.anyRoadDist(x, z).d < 4.5) continue;
      if (z > 16) continue;                            // the fields behind: open ground back to the city
      if (Math.hypot(x - burnerAt.x, z - burnerAt.z) < 17) continue;   // the charcoal burner's clearing
      const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
      if (dc < CLEARING.r + 14) continue;             // the clearing and the ring of choppable trees
      if (dc < CLEARING.r + 14 + 3 * RING && r() < 0.78) continue;   // (thinner where the settlement will grow)
      const k = cellK(x, z);
      if (taken.has(k)) continue;
      taken.set(k, 1);
      const kind = r() < 0.62 ? "spruce" : r() < 0.6 ? "pine" : "birch";
      const h = kind === "spruce" ? r.range(8, 16) : kind === "pine" ? r.range(10, 17) : r.range(7, 11);
      list.push({ x, z, y: this.heightAt(x, z), h, kind, rot: r() * TAU });
      if (this.roadDist(x, z).d < 40 || dc < 70) this.col.addCircle(x, z, kind === "birch" ? 0.2 : 0.3, 12);
    }
    // and the woods close round the charcoal burner's clearing too
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU, rad = 17 + Math.pow(r(), 0.8) * 45;
      const x = burnerAt.x + Math.cos(a) * rad, z = burnerAt.z + Math.sin(a) * rad;
      if (this.anyRoadDist(x, z).d < 4.5) continue;
      const k = cellK(x, z);
      if (taken.has(k)) continue;
      taken.set(k, 1);
      const kind = r() < 0.7 ? "spruce" : r() < 0.5 ? "pine" : "birch";
      const h = kind === "spruce" ? r.range(8, 16) : kind === "pine" ? r.range(10, 17) : r.range(7, 11);
      list.push({ x, z, y: this.heightAt(x, z), h, kind, rot: r() * TAU });
      if (rad < 30) this.col.addCircle(x, z, kind === "birch" ? 0.2 : 0.3, 12);
    }
    // and all the way round the clearing, deep, so it sits in a forest and not at the edge of the world;
    // the deer ride east of it is a glade in that forest, thinned rather than cleared
    for (let i = 0; i < 3200; i++) {
      const a = r() * TAU, rad = CLEARING.r + 14 + Math.pow(r(), 0.85) * 95;
      const x = CLEARING.x + Math.cos(a) * rad, z = CLEARING.z + Math.sin(a) * rad;
      if (this.anyRoadDist(x, z).d < 4.5) continue;
      if (Math.hypot(x - burnerAt.x, z - burnerAt.z) < 17) continue;
      const dh = Math.hypot(x - HUNT.x, z - HUNT.z);
      if (dh < HUNT.r * 0.9 && r() < (dh < HUNT.r * 0.5 ? 0.9 : 0.6)) continue;
      // the woods thin toward the clearing: that band is where the settlement will grow, a ring at a time
      if (rad < CLEARING.r + 14 + 3 * RING && r() < 0.78) continue;
      const k = cellK(x, z);
      if (taken.has(k)) continue;
      taken.set(k, 1);
      const kind = dh < HUNT.r * 1.4 ? (r() < 0.45 ? "birch" : r() < 0.5 ? "pine" : "spruce") : r() < 0.65 ? "spruce" : r() < 0.6 ? "pine" : "birch";
      const h = kind === "spruce" ? r.range(8, 16) : kind === "pine" ? r.range(10, 17) : r.range(7, 11);
      list.push({ x, z, y: this.heightAt(x, z), h, kind, rot: r() * TAU });
      const tree = list[list.length - 1];
      if (rad < CLEARING.r + 60 || dh < HUNT.r + 6) tree.col = this.col.addCircle(x, z, kind === "birch" ? 0.2 : 0.3, 12);
    }
    // the forest in tiles of eighty metres, so what is behind you or past the haze is never drawn
    // (as one piece, every tree was drawn every frame, and twice over for the shadows)
    this.forestTiles = [];
    { const TILE = 80, tiles = new Map();
      for (const t of list) { const k = Math.floor(t.x / TILE) + "," + Math.floor(t.z / TILE); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(t); }
      for (const [k, trees] of tiles) {
        const g = new THREE.Group(), gf = new THREE.Group();
        for (const m of forestInstances(trees)) g.add(m);
        for (const m of forestInstances(trees, true)) gf.add(m);
        const [i, j] = k.split(",").map(Number);
        this.forestTiles.push({ g, gf, x: (i + 0.5) * TILE, z: (j + 0.5) * TILE });
        root.add(g, gf); gf.visible = false;
      } }
    this.forest = list;
    this.mapTrees = list.map((t, i) => (t._mi = i, { x: t.x, z: t.z, k: t.kind }));
    this.treeCount = list.length;

    // undergrowth: bushes, ferns, stones. The bushes and the clumps of fern are each their own, so a stroke of the
    // axe (or a blade) cuts one down — and it stays down; the stones are fixed
    const ub = new Builder(), shrubs = [];
    for (let i = 0; i < 900; i++) {
      const t = this.road[Math.floor(r() * this.road.length)];
      const a = r() * TAU, rad = 3.5 + r() * 45;
      const x = t.x + Math.cos(a) * rad, z = t.z + Math.sin(a) * rad;
      if (this.anyRoadDist(x, z).d < 3) continue;
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r - 4) continue;
      if (Math.hypot(x - burnerAt.x, z - burnerAt.z) < 13) continue;
      const y = this.heightAt(x, z);
      const k = r();
      if (k < 0.45) shrubs.push({ kind: "bush", x, z, y, col: r.pick([0x3e5a2e, 0x4a6a34, 0x55703a]), ry: r() * 3, sx: r.range(0.6, 1.3), sy: r.range(0.4, 0.8), sz: r.range(0.6, 1.3) });
      else if (k < 0.8) { const f = { kind: "fern", x, z, y, fronds: [] }; for (let j = 0; j < 5; j++) f.fronds.push([x + r.range(-0.4, 0.4), z + r.range(-0.4, 0.4), r.range(-0.5, 0.5), r.range(-0.5, 0.5)]); shrubs.push(f); }
      else ub.add(new THREE.DodecahedronGeometry(0.5, 0), 0x7a7870, x, y + 0.1, z, r(), r(), r(), r.range(0.5, 1.4), r.range(0.3, 0.7), r.range(0.5, 1.2), 0.08);
    }
    root.add(ub.build(MAT.rough, { shadow: false }));
    {
      const leafM = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }); addDetail(leafM, { scale: 2, amount: 0.18, grain: 0.5 });
      const bushes = shrubs.filter(q => q.kind === "bush"), ferns = shrubs.filter(q => q.kind === "fern");
      const bm = new THREE.InstancedMesh(TREE.blob, leafM, bushes.length), fm = new THREE.InstancedMesh(TREE.cone, leafM, ferns.length * 5);
      const d = new THREE.Object3D(), c = new THREE.Color();
      bushes.forEach((q, n) => { d.position.set(q.x, q.y + 0.3, q.z); d.rotation.set(0, q.ry, 0); d.scale.set(q.sx, q.sy, q.sz); d.updateMatrix(); bm.setMatrixAt(n, d.matrix); bm.setColorAt(n, c.set(q.col)); q.slots = [[bm, n]]; });
      let fi = 0;
      for (const q of ferns) { q.slots = []; for (const [fx, fz, rx, rz] of q.fronds) { d.position.set(fx, q.y, fz); d.rotation.set(rx, 0, rz); d.scale.set(0.12, 0.7, 0.12); d.updateMatrix(); fm.setMatrixAt(fi, d.matrix); fm.setColorAt(fi, c.set(0x5a7a3a)); q.slots.push([fm, fi++]); } }
      for (const m of [bm, fm]) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; root.add(m); }
      this.shrubs = shrubs;
      // (those already cut, in this save)
      const gone = new Set(G.loadCut ? G.loadCut() : []);
      shrubs.forEach((q, n) => { q.id = n; if (gone.has(n)) this.hideShrub(q); });
    }
    this.makeBerryBushes();

    // ---- the road: a narrow cart track, two ruts and grass up the middle; the forks fainter still ----
    const rPos = [], rCol = [], rIdx = [];
    const C = h => new THREE.Color(h);
    const GRASS = C(0x7c8a5c), EDGE = C(0x8a7a5a), DIRT = C(0x7a6848), RUT = C(0x4e4232), MID = C(0x6c7448);
    // across the track, from the grass on one side to the grass on the other: [offset in half-widths, colour, height]
    // [offset, colour, height, how much of the ground's own colour shows]: the edges fade out into whatever the ground is
    // there — litter, moss, dry grass, stone — and the grass up the middle is that ground's own green, not one green everywhere
    const XS = [[-1.85, EDGE, 0.006, 1], [-1.4, EDGE, 0.016, 0.7], [-1.0, EDGE, 0.03, 0.35], [-0.66, RUT, 0.0, 0.12], [-0.4, DIRT, 0.03, 0.15], [0, MID, 0.05, 0.6],
      [0.4, DIRT, 0.03, 0.15], [0.66, RUT, 0.0, 0.12], [1.0, EDGE, 0.03, 0.35], [1.4, EDGE, 0.016, 0.7], [1.85, EDGE, 0.006, 1]];
    const tc = new THREE.Color(), gc = new THREE.Color();
    const track = (R, W0, W1, seed) => {
      const base = rPos.length / 3, n = XS.length;
      for (let i = 0; i < R.length; i++) {
        const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l, nz = dx / l;
        const f = i / (R.length - 1);
        // the width wanders, as a track worn by carts and weather does
        const W = (W0 + (W1 - W0) * f) * (1 + 0.2 * Math.sin(i * 0.31 + seed) + 0.1 * Math.sin(i * 1.7 + seed * 3));
        for (let j = 0; j < n; j++) {
          const [o, c, h, mix] = XS[j];
          const edge = Math.abs(o) >= 1;
          const jit = edge ? (r() - 0.5) * 0.3 : (r() - 0.5) * 0.06;
          const x = R[i].x + nx * (o * W + jit), z = R[i].z + nz * (o * W + jit);
          rPos.push(x, this.heightAt(x, z) + h + (r() - 0.5) * (mix >= 1 ? 0 : 0.02), z);
          this.groundColour(x, z, gc);
          tc.copy(c).offsetHSL(0, 0, (r() - 0.5) * 0.06).lerp(gc, mix);
          // fainter towards the end of a fork: the ground takes it back
          if (W1 < W0) tc.lerp(gc, f * f * 0.8);
          rCol.push(tc.r, tc.g, tc.b);
        }
        if (i > 0) for (let j = 0; j < n - 1; j++) {
          const p0 = base + (i - 1) * n + j, p1 = p0 + 1, q0 = base + i * n + j, q1 = q0 + 1;
          rIdx.push(p0, q0, p1, p1, q0, q1);
        }
      }
    };
    track(this.road, 0.95, 0.95, 1.3);
    this.branches.forEach((br, n) => track(br.pts, 0.75, 0.3, n * 2.7));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rPos, 3));
    rg.setAttribute("color", new THREE.Float32BufferAttribute(rCol, 3));
    rg.setIndex(rIdx);
    rg.computeVertexNormals();
    // wound the other way round: flip if it faces down
    if (rg.attributes.normal.getY(0) < 0) { const ix = rg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } rg.computeVertexNormals(); }
    const roadMesh = new THREE.Mesh(rg, addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { scale: 2, amount: 0.12, grain: 0.4, surface: "none" }));
    roadMesh.receiveShadow = true;
    root.add(roadMesh);
    // stones kicked to the sides, tufts in the middle
    const sb2 = new Builder();
    const strew = (R, W, every) => {
      for (let i = 0; i < R.length; i += every) {
        const a = R[i], b = R[Math.min(R.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        if (r() < 0.7) { const o = (r() < 0.5 ? -1 : 1) * W * (0.9 + r() * 0.5); const x = a.x + nx * o, z = a.z + nz * o; sb2.add(new THREE.DodecahedronGeometry(0.12, 0), r.pick([0x7a7870, 0x8a857a, 0x6a665e]), x, this.heightAt(x, z) + 0.04, z, r(), r(), r(), r.range(0.6, 1.8), r.range(0.4, 0.8), r.range(0.6, 1.5), 0.08); }
        if (r() < 0.5) { const x = a.x + nx * (r() - 0.5) * 0.3, z = a.z + nz * (r() - 0.5) * 0.3; for (let k = 0; k < 3; k++) sb2.add(TREE.cone, 0x6a7a3a, x + (r() - 0.5) * 0.2, this.heightAt(x, z) + 0.02, z + (r() - 0.5) * 0.2, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6, 0.05, 0.22, 0.05); }
      }
    };
    strew(this.road, 0.95, 3);
    for (const br of this.branches) strew(br.pts, 0.6, 2);
    root.add(sb2.build(MAT.rough, { shadow: false }));

    // ---- at the forks: signposts near the city, and every track ends at a fallen tree ----
    const sb = new Builder();
    for (const br of this.branches) {
      const { at, dir, fork } = br;
      const side = fork.side, rx = -dir.z * side, rz = dir.x * side;
      if (fork.sign) {
        // on the far side of the junction from the fork, arms pointing down each way
        const px = at.x - rx * 2.6, pz = at.z - rz * 2.6, py = this.heightAt(px, pz);
        sb.box(0.14, 2.6, 0.14, px, py + 1.3, pz, 0x5a4432);
        const arm = (ax, az, y, len) => { const ry = Math.atan2(ax, az) + Math.PI / 2; sb.box(len, 0.24, 0.05, px + ax * len * 0.5, py + y, pz + az * len * 0.5, 0xb09a78, ry, 0.05); sb.box(len * 0.08, 0.24, 0.07, px + ax * len * 0.96, py + y, pz + az * len * 0.96, 0x3a2a1e, ry); };
        arm(dir.x, dir.z, 2.25, 1.1);
        const bd = br.pts[6], bl = Math.hypot(bd.x - at.x, bd.z - at.z) || 1;
        arm((bd.x - at.x) / bl, (bd.z - at.z) / bl, 1.85, 1.0);
      }
      if (br.n === 3) { this.buildBurner(br); continue; }
      // (the track to the cave runs on to its mouth: nothing fallen across it)
      if (br.n === this.caveBranch().n) continue;
      // the dead end: a spruce fallen across the track
      const e = br.pts[br.pts.length - 4], e2 = br.pts[br.pts.length - 1];
      const ey = this.heightAt(e.x, e.z), ang = Math.atan2(e2.x - e.x, e2.z - e.z);
      sb.add(new THREE.CylinderGeometry(0.22, 0.3, 9, 8), 0x4e3a2a, e.x, ey + 0.28, e.z, Math.PI / 2, ang + Math.PI / 2, 0.05);
      for (let j = 0; j < 4; j++) sb.add(TREE.blob, 0x2f4a2c, e.x + Math.sin(ang + Math.PI / 2) * (2 + j * 1.2), ey + 0.7, e.z + Math.cos(ang + Math.PI / 2) * (2 + j * 1.2), 0, j, 0, 1.1, 0.8, 1.1, 0.08);
      this.col.addCircle(e.x, e.z, 1.6, this.heightAt(e.x, e.z) + 2);
    }
    root.add(sb.build(MAT.rough));

    // ---- far behind: the city, a row of spires on the skyline ----
    const city = new THREE.Group();
    const cm = new THREE.MeshBasicMaterial({ color: 0x5a6070, fog: false, transparent: true, opacity: 0.55 });
    for (const [x, h, w] of [[-60, 40, 6], [-30, 55, 5], [0, 70, 6], [20, 48, 5], [45, 38, 7], [70, 30, 10], [-80, 22, 20], [100, 18, 30]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, w), cm); b.position.set(x, h * 0.27, 0); city.add(b);
      const s = new THREE.Mesh(new THREE.ConeGeometry(w * 0.6, h * 0.45, 8), cm); s.position.set(x, h * 0.55 + h * 0.22, 0); city.add(s);
    }
    const wallM = new THREE.Mesh(new THREE.BoxGeometry(300, 12, 4), cm); wallM.position.set(0, 6, 0); city.add(wallM);
    city.position.set(0, -4, 520);
    // Hamburg across the fields, made in Blender, if it is there
    const sky = modelCopy("hamburg_skyline");
    if (sky) {
      city.clear();
      // distance takes the light out of it: flat, pale, a little see-through against the sky
      sky.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xc8ccd4, fog: false, transparent: true, opacity: 0.72, depthWrite: false }); } });
      sky.scene.rotation.y = Math.PI;
      city.add(sky.scene);
      city.position.set(0, this.rawAt(0, 205) - 1, 205);
    }
    root.add(city);
    this.city = city;

    // ---- the clearing ----
    this.buildClearing();
    this.buildRocks(r);

    this.lightPool = [];
    for (let i = 0; i < 2; i++) { const L = new THREE.PointLight(0xff8a3a, 0, 16, 1.6); root.add(L); this.lightPool.push(L); }
    this.t = 0;
  }

  // ---- rocks to break with a pick: grey stone near the clearing, copper farther out, iron deep in ----
  buildRocks(r) {
    this.rocks = [];
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    // a boulder: a rough ball of facets, each a slightly different grey
    const boulder = (size, pale = false) => {
      let geo = new THREE.IcosahedronGeometry(size, 1); if (geo.index) geo = geo.toNonIndexed(); const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const seen = new Map();
      for (let i = 0; i < pos.count; i++) {
        const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
        if (!seen.has(key)) seen.set(key, 0.82 + r() * 0.3);
        const k = seen.get(key); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.72, pos.getZ(i) * k);
      }
      for (let t = 0; t < pos.count; t += 3) { const g = (pale ? 0.6 : 0.44) + r() * 0.12; for (let j = 0; j < 3; j++) col.set([g, g * 0.99, g * (pale ? 1.02 : 0.95)], (t + j) * 3); }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
      return geo;
    };
    const FLECK = { copper: [mat(0x3aa878, { surface: "none" }), mat(0xc87a3e, { surface: "none" })], tin: [mat(0x3c4048, { surface: "none" }), mat(0xc8ccd6, { surface: "none", metalness: 0.4, roughness: 0.4 })], iron: [mat(0xa0442a, { surface: "none" }), mat(0x7a3420, { surface: "none" })] };
    // a rock of a kind, at a spot (the caves put theirs down with this too)
    const makeAt = (kind, x, z) => {
        const y = this.heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
        const big = 0.7 + r() * 0.35;
        for (let j = 0; j < 3; j++) {
          const m = new THREE.Mesh(boulder(big * (j ? 0.5 : 1), kind === "tin"), rockMat);
          m.position.set(j ? (r() - 0.5) * 1.3 : 0, big * (j ? 0.18 : 0.4), j ? (r() - 0.5) * 1.3 : 0); m.rotation.y = r() * 3;
          m.castShadow = m.receiveShadow = true; g.add(m);
        }
        // the ore shows in the rock: flecks set into its faces all round
        if (FLECK[kind]) for (let j = 0; j < 14; j++) {
          const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + r() * 0.05, 0), FLECK[kind][j % 2]);
          const u = r() * TAU, v = r() * 1.1;
          f.position.set(Math.cos(u) * Math.cos(v) * big * 0.92, big * 0.4 + Math.sin(v) * big * 0.62, Math.sin(u) * Math.cos(v) * big * 0.92); g.add(f);
        }
        this.root.add(g);
        const rock = { kind, x, z, y, g, hp: ROCKS[kind].hp, gone: 0, col: this.col.addCircle(x, z, big * 0.9, y + 1.4) };
        rock.col.y0 = Math.min(rock.col.y0, y - 5);
        this.rocks.push(rock);
        return rock;
    };
    this.makeRock = makeAt;
    const place = (kind, n, r0, r1, a0 = 0, a1 = TAU) => {
      for (let tries = 0, k = 0; k < n && tries < n * 40; tries++) {
        const a = a0 + r() * (a1 - a0), rad = r0 + r() * (r1 - r0);
        const x = CLEARING.x + Math.cos(a) * rad, z = CLEARING.z + Math.sin(a) * rad;
        if (this.anyRoadDist(x, z).d < 4 || Math.hypot(x - HUNT.x, z - HUNT.z) < HUNT.r * 0.6) continue;
        if (this.rocks.some(o => Math.hypot(o.x - x, o.z - z) < 7)) continue;
        makeAt(kind, x, z); k++;
      }
    };
    place("stone", 12, CLEARING.r + 6, CLEARING.r + 34);
    place("copper", 6, 70, 115, Math.PI * 0.6, Math.PI * 1.3);       // off to the west, past the clearing
    place("tin", 5, 60, 105, Math.PI * 1.0, Math.PI * 1.45);        // pale rock, south-west, not far from the copper
    place("iron", 5, 95, CLEARING.r + ROAM - 6, Math.PI * 1.35, Math.PI * 1.9);   // deep in the forest to the south, as far as you may go
  }
  // the rock in front of you, within reach of a pick
  rockAhead(p, fwd) {
    let best = null, bd = 2.6;
    for (const k of this.rocks || []) {
      if (k.gone > 0) continue;
      const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fwd.x + dz * fwd.z) / (d || 1) > 0.35) { bd = d; best = k; }
    }
    return best;
  }
  // a broken rock lies as rubble, and is whole again after a while, when no one is looking
  breakRock(k) { k.gone = 240; k.g.visible = false; k.col.disabled = true; }
  tickRocks(dt) {
    for (const k of this.rocks || []) if (k.gone > 0 && (k.gone -= dt) <= 0) {
      const p = G.player && G.player.pos;
      if (p && Math.hypot(p.x - k.x, p.z - k.z) < 25) { k.gone = 20; continue; }
      k.gone = 0; k.hp = ROCKS[k.kind].hp; k.g.visible = true; k.col.disabled = false;
    }
  }

  // on the map: stamped forest, the road and its forks, the clearing, and the city behind
  minimap(c, X, Z, S, big) {
    const W = c.canvas.width, H = c.canvas.height, pad = 12;
    // down in the cave: the cave's own map, and its ore
    if (this.cave && this.cave.inside) {
      this.cave.drawMap(c, X, Z, S);
      for (const k of this.cave.rocks) if (!k.gone && this.cave.seen.some(i => { const h = this.cave.halls[i]; return Math.hypot(k.x - h.x, k.z - h.z) < h.r + 1; })) oreIcon(c, X(k.x), Z(k.z), k.kind, Math.max(3.6, S * 1.2));
      return;
    }
    const vis = (x, z) => { const px = X(x), pz = Z(z); return px > -pad && px < W + pad && pz > -pad && pz < H + pad; };
    const ts = Math.max(2.2, Math.min(4.2, S * 1.6));
    // the wash, the forest, the clearing and the road never change: drawn once onto a sheet the size of the country,
    // and only the piece in view copied out (looked at closer than the sheet holds, the trees in view are drawn as before)
    const dev = S * (c.getTransform ? Math.abs(c.getTransform().a) || 1 : 1);
    if (dev <= MAP_K * 1.35) {
      const L = this.mapLayer(), lb = L.b;
      c.drawImage(L.cv, X(lb.x0), Z(lb.z0), (lb.x1 - lb.x0) * S, (lb.z1 - lb.z0) * S);
    } else {
      const fz = Z(16);
      if (fz < H) { c.fillStyle = "rgba(200,190,120,0.35)"; c.fillRect(0, Math.max(0, fz), W, H); }
      c.fillStyle = TREEC;
      // (only the cells in view)
      const g = this.mapTreeGrid(), x0 = Math.floor((CLEARING.x + (0 - pad - X(CLEARING.x)) / S) / 20), x1 = Math.floor((CLEARING.x + (W + pad - X(CLEARING.x)) / S) / 20);
      const z0 = Math.floor((CLEARING.z + (0 - pad - Z(CLEARING.z)) / S) / 20), z1 = Math.floor((CLEARING.z + (H + pad - Z(CLEARING.z)) / S) / 20);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) for (const t of g.get(i + "," + j) || []) tree(c, X(t.x), Z(t.z), ts, t.k);
      this.mapClearing(c, X, Z, S);
      const rw = Math.max(2.2, Math.min(4.5, S * 1.9));
      for (const br of this.branches) road(c, br.pts, X, Z, rw * 0.6);
      road(c, this.road, X, Z, rw);
    }
    // the cave's mouth, once found: a dark arch in the hillside
    const cv = this.cave;
    if (cv && cv.found && cv.mouthAt && vis(cv.mouthAt.x, cv.mouthAt.z)) caveIcon(c, X(cv.mouthAt.x), Z(cv.mouthAt.z), Math.max(5.5, S * 2.2));
    // the other settlements, and their roads
    for (const col of this.colonies || []) {
      road(c, col.road.map(([x, z]) => ({ x, z })), X, Z, Math.max(2.2, Math.min(4.5, S * 1.9)) * 0.8);
      c.fillStyle = "rgba(214,200,150,0.9)"; c.beginPath(); c.arc(X(col.x), Z(col.z), col.r * S, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    }
    // the ground won from the forest beyond the old edge
    if (this.lobes && this.lobes.length) {
      c.fillStyle = "rgba(214,200,150,0.9)"; c.strokeStyle = INK; c.lineWidth = 1; c.setLineDash([3, 3]);
      for (const l of this.lobes) { c.beginPath(); l.poly.forEach(([x, z], i) => i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.closePath(); c.fill(); }
      for (const l of this.lobes) { c.beginPath(); for (let i = 1; i < l.poly.length - 1; i++) { const [ax, az] = l.poly[i - 1], [bx, bz] = l.poly[i]; if (i === 1) c.moveTo(X(ax), Z(az)); c.lineTo(X(bx), Z(bz)); } c.lineTo(X(l.poly[l.poly.length - 1][0]), Z(l.poly[l.poly.length - 1][1])); c.stroke(); }
      c.setLineDash([]);
    }
    c.fillStyle = TREEC;
    for (const t of this.fellable) if (t.state === "up" || t.state === "shake") tree(c, X(t.x), Z(t.z), ts * 1.1, "spruce");
    // rocks you can break: grey stone, copper green, iron red
    for (const k of this.rocks || []) if (!k.gone && vis(k.x, k.z)) oreIcon(c, X(k.x), Z(k.z), k.kind, Math.max(4.4, S * 1.2));
    // the cabin
    c.fillStyle = this.cabin && this.cabin.visible ? TOWN : "#3a3530";
    c.save(); c.translate(X(CABIN.x), Z(CABIN.z)); c.rotate(-CABIN.ry); c.fillRect(-2.5 * S, -3 * S, 5 * S, 6 * S); c.strokeStyle = INK; c.strokeRect(-2.5 * S, -3 * S, 5 * S, 6 * S); c.restore();
  }
  // the clearing on the map: the old ground, and what has been won from the forest since
  mapClearing(c, X, Z, S) {
    c.fillStyle = "rgba(214,200,150,0.9)"; c.beginPath(); c.arc(X(CLEARING.x), Z(CLEARING.z), CLEARING.r * S, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK; c.lineWidth = 1; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
  }
  // the sheet: MAP_K pixels to the metre, over the map and a margin round it; drawn again only when told to
  mapLayer() {
    if (this._mapLayer && !this._mapDirty) return this._mapLayer;
    const mb = this.mapBounds, b = { x0: mb.x0 - 60, x1: mb.x1 + 60, z0: mb.z0 - 60, z1: mb.z1 + 60 }, K = MAP_K;
    const cv = (this._mapLayer && this._mapLayer.cv) || document.createElement("canvas");
    cv.width = Math.round((b.x1 - b.x0) * K); cv.height = Math.round((b.z1 - b.z0) * K);
    const c = cv.getContext("2d"), X = x => (x - b.x0) * K, Z = z => (z - b.z0) * K;
    c.clearRect(0, 0, cv.width, cv.height);
    const fz = Z(16);
    if (fz < cv.height) { c.fillStyle = "rgba(200,190,120,0.35)"; c.fillRect(0, Math.max(0, fz), cv.width, cv.height); }
    // (a tree a metre and a half across, as the minimap has always shown them)
    c.fillStyle = TREEC;
    for (const t of this.mapTrees) if (!t.gone) tree(c, X(t.x), Z(t.z), 1.6 * K, t.k);
    this.mapClearing(c, X, Z, K);
    const rw = 1.9 * K;
    for (const br of this.branches) road(c, br.pts, X, Z, rw * 0.6);
    road(c, this.road, X, Z, rw);
    this._mapLayer = { cv, b }; this._mapDirty = false;
    return this._mapLayer;
  }
  mapTreeGrid() {
    if (this._treeGrid && !this._gridDirty) return this._treeGrid;
    this._gridDirty = false;
    const g = new Map();
    for (const t of this.mapTrees) { if (t.gone) continue; const k = Math.floor(t.x / 20) + "," + Math.floor(t.z / 20); let l = g.get(k); if (!l) g.set(k, l = []); l.push(t); }
    return this._treeGrid = g;
  }
  mapLabels(c, X, Z, S, set) {
    const L = (text, wx, wz, dy, size) => { if (seen(set, wx, wz)) label(c, text, X(wx), Z(wz) + dy, size); };
    L("The Clearing", CLEARING.x, CLEARING.z, CLEARING.r * S + 14, 15);
    for (const col of this.colonies || []) label(c, col.name, X(col.x), Z(col.z) + col.r * S + 12, 14);
    if (this.cave && this.cave.found && this.cave.mouthAt && !this.cave.inside) label(c, "the cave", X(this.cave.mouthAt.x), Z(this.cave.mouthAt.z) + 16, 12);
    L("the road north-east", -40, -120, 0, 13);
    L("The old woods", 70, -200, 0, 18);
    L("to Hamburg", 0, 40, 0, 14);
    for (const br of this.branches) { const e = br.pts[br.pts.length - 1]; if (br.fork.sign) L("to " + br.fork.sign[1], e.x, e.z, 11, 11); }
    if (this.burner) L("the charcoal burner", this.burner.camp.x, this.burner.camp.z, 14, 12);
    if (this.huntOpen) L("the deer ride", HUNT.x, HUNT.z, 0, 12);
  }
  get mapTitle() { return this.cave && this.cave.inside ? "The Cave" : "The Road North-East"; }
  get mapBounds() { if (this.cave && this.cave.inside) { const b = this.cave.b; return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }; } return { x0: -90, x1: 110, z0: -350, z1: 60 }; }
  // gentle hills, flattened where the road runs and in the clearing
  // the ground, and the pads dug level into it for buildings: inside a pad its own height, and round it a bank
  // sloping back up (or down) to the ground as it was
  heightAt(x, z) {
    const h = this.groundAt(x, z);
    const P = this.pads; if (!P || !P.length) return h;
    let out = h;
    for (const p of P) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const dx = x - p.x, dz = z - p.z, lx = Math.abs(dx * p.c - dz * p.s), lz = Math.abs(dx * p.s + dz * p.c);
      const d = Math.max(lx - p.hw, lz - p.hd);
      if (d <= 0) return p.y;
      if (d < p.bank) { const k = d / p.bank, e = k * k * (3 - 2 * k); out = p.y + (out - p.y) * e; }
    }
    return out;
  }
  // a building's pad: the ground under it cut (or made up) to one level, y, with a bank a couple of metres wide round it
  addPad(key, x, z, ry, w, d, y, bank = 2.2) {
    this.pads ??= []; this.padKeys ??= new Map();
    if (this.padKeys.has(key)) { const o = this.padKeys.get(key); if (Math.abs(o.y - y) < 0.01 && o.x === x && o.z === z && o.ry === ry && o.hw === w / 2) return; this.pads.splice(this.pads.indexOf(o), 1); }
    const hw = w / 2, hd = d / 2, r = Math.hypot(hw, hd) + bank;
    const p = { key, x, z, ry, c: Math.cos(ry), s: Math.sin(ry), hw, hd, y, bank, x0: x - r, x1: x + r, z0: z - r, z1: z + r };
    this.pads.push(p); this.padKeys.set(key, p);
    this.dirtyGround = this.dirtyGround ? { x0: Math.min(this.dirtyGround.x0, p.x0), x1: Math.max(this.dirtyGround.x1, p.x1), z0: Math.min(this.dirtyGround.z0, p.z0), z1: Math.max(this.dirtyGround.z1, p.z1) } : { x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 };
  }
  // the terrain made again where pads have been dug: its points lowered (or raised) to them, the cut faces bare earth
  reshapeGround() {
    const D = this.dirtyGround; if (!D || !this.terrain) return; this.dirtyGround = null;
    const geo = this.terrain.geometry, pos = geo.attributes.position, col = geo.attributes.color;
    const earth = new THREE.Color(0x4a3a2a), c = new THREE.Color();
    for (let t = 0; t < pos.count; t += 3) {
      let inside = false;
      for (let k = 0; k < 3; k++) { const x = pos.getX(t + k), z = pos.getZ(t + k); if (x >= D.x0 && x <= D.x1 && z >= D.z0 && z <= D.z1) { inside = true; break; } }
      if (!inside) continue;
      let moved = 0;
      for (let k = 0; k < 3; k++) {
        const x = pos.getX(t + k), z = pos.getZ(t + k), y0 = pos.getY(t + k), y = this.heightAt(x, z);
        if (Math.abs(y - y0) > 0.01) { pos.setY(t + k, y); moved = Math.max(moved, Math.abs(y - this.groundAt(x, z))); }
      }
      // (a face dug more than a hand's depth shows the earth)
      if (moved > 0.15) for (let k = 0; k < 3; k++) { c.setRGB(col.getX(t + k), col.getY(t + k), col.getZ(t + k)).lerp(earth, Math.min(0.75, moved * 0.5)); col.setXYZ(t + k, c.r, c.g, c.b); }
    }
    pos.needsUpdate = true; col.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  // the ground as it lies, before anyone dug into it
  groundAt(x, z) {
    if (this.cave && this.cave.holds(x, z)) return this.cave.floorAt(x, z);
    let h = this.rawAt(x, z);
    const rd = this.road ? (this.branches ? this.anyRoadDist(x, z) : this.roadDist(x, z)) : null;
    const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
    const flatC = clamp((dc - CLEARING.r + 4) / 14, 0, 1);
    const clearingH = this._ch ?? (this._ch = this.rawAt(CLEARING.x, CLEARING.z));
    if (rd) {
      const k = clamp((rd.d - 2) / 8, 0, 1);
      const roadH = this.rawAt(rd.x, rd.z);
      h = roadH + (h - roadH) * k;
    }
    return clearingH + (h - clearingH) * flatC;
  }
  // the lie of the land: the long swells, and over them rounded hills, a few sharp ridges and hollows, and small humps
  rawAt(x, z) {
    const swell = Math.sin(x * 0.021) * 2.2 + Math.cos(z * 0.017) * 2.6 + Math.sin((x + z) * 0.043) * 0.9 + Math.cos(x * 0.09 - z * 0.07) * 0.35;
    const hills = (vnoise(x / 55, z / 55) - 0.5) * 7.5;
    const ridge = (1 - Math.abs(vnoise(x / 38 + 11, z / 38 - 7) * 2 - 1)) ** 2 * 3.2 - 1.2;
    const bumps = (vnoise(x / 12 - 3, z / 12 + 5) - 0.5) * 1.1;
    return swell + hills + ridge + bumps;
  }
  roadDist(x, z) {
    let best = Infinity, bi = 0;
    const R = this.road;
    // coarse then fine
    for (let i = 0; i < R.length; i += 8) { const d = (R[i].x - x) ** 2 + (R[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    for (let i = Math.max(0, bi - 8); i < Math.min(R.length, bi + 9); i++) { const d = (R[i].x - x) ** 2 + (R[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    return { d: Math.sqrt(best), i: bi, t: bi / (R.length - 1), x: R[bi].x, z: R[bi].z };
  }
  // the nearest of the road and its forks: {d, x, z, branch} (branch is null on the road itself)
  // which fork leads to the cave, and where its mouth is: at the end of the track nearest the clearing that isn't the
  // charcoal burner's, well off the main road and clear of the deer ride
  caveBranch() {
    if (this._caveBr !== undefined) return this._caveBr;
    let best = null;
    for (const br of this.branches || []) {
      if (br.n === 3) continue;
      const pts = br.pts, e = pts[pts.length - 1], p = pts[pts.length - 7], l = Math.hypot(e.x - p.x, e.z - p.z) || 1, dx = (e.x - p.x) / l, dz = (e.z - p.z) / l;
      const x = e.x + dx * 6, z = e.z + dz * 6;
      if (Math.hypot(x - HUNT.x, z - HUNT.z) < HUNT.r + 6 || Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + 14 || this.roadDist(x, z).d < 14) continue;
      const score = Math.hypot(br.at.x - CLEARING.x, br.at.z - CLEARING.z);
      if (!best || score < best.score) best = { x, z, ry: Math.atan2(-dx, -dz), n: br.n, score };
    }
    return (this._caveBr = best || { x: CLEARING.x + 70, z: CLEARING.z, ry: -Math.PI / 2, n: -1 });
  }
  anyRoadDist(x, z) {
    const m = this.roadDist(x, z);
    let best = { d: m.d, x: m.x, z: m.z, branch: null, i: m.i };
    for (const b of this.branches || []) {
      for (let i = 0; i < b.pts.length; i++) {
        const p = b.pts[i], d = Math.hypot(p.x - x, p.z - z);
        if (d < best.d) best = { d, x: p.x, z: p.z, branch: b, i };
      }
    }
    return best;
  }
  // how far along the road you are, 0 to 1
  progress(x = G.player.pos.x, z = G.player.pos.z) { return this.roadDist(x, z).t; }
  constrain(p) {
    if (this.cave && this.cave.holds(p.x, p.z)) return;
    const dc = Math.hypot(p.x - CLEARING.x, p.z - CLEARING.z);
    const rd = this.anyRoadDist(p.x, p.z);
    // inside the clearing you go where you like; its edge holds you, except where the road leaves it
    if (dc < CLEARING.r + 10) return;
    // and once you live here (a bow, or a settlement), the whole forest round it is yours to walk, a long way out
    if (this.huntOpen || this.settled) {
      const R = CLEARING.r + ROAM;
      if (dc < R) return;
      if (dc < R + 6 && rd.d > 14) { const k = R / dc; p.x = CLEARING.x + (p.x - CLEARING.x) * k; p.z = CLEARING.z + (p.z - CLEARING.z) * k; return; }
    }
    if (dc < CLEARING.r + 12 && rd.d > 14) { const k = (CLEARING.r + 10) / dc; p.x = CLEARING.x + (p.x - CLEARING.x) * k; p.z = CLEARING.z + (p.z - CLEARING.z) * k; return; }
    const lim = 14;
    if (rd.d > lim) { const k = lim / rd.d; p.x = rd.x + (p.x - rd.x) * k; p.z = rd.z + (p.z - rd.z) * k; if (!this._warned || G.time - this._warned > 8) { this._warned = G.time; this.onTooFar && this.onTooFar(); } }
    if (!rd.branch && rd.i < 3 && p.z > this.road[0].z) p.z = this.road[0].z;
    // a wrong track is barred a few steps in, unseen; only the ones the story opens can be walked
    if (rd.branch && !this.openTracks.has(rd.branch.n) && rd.i > 5) {
      const q = rd.branch.pts[5];
      p.x = q.x + (p.x - rd.x); p.z = q.z + (p.z - rd.z);
      if (!this._barred || G.time - this._barred > 6) { this._barred = G.time; this.onBarred && this.onBarred(rd.branch.n); }
    }
  }

  buildClearing() {
    const root = this.root, C = CLEARING, r = rng(88);
    const y0 = this.heightAt(C.x, C.z);
    this.cy = y0;
    // a patch of ash where the cabin burned
    const ash = new THREE.Mesh(new THREE.CircleGeometry(5.5, 20), mat(0x3a3530, { surface: "none" }));
    ash.rotation.x = -Math.PI / 2; ash.position.set(CABIN.x, y0 + 0.03, CABIN.z); ash.receiveShadow = true;
    root.add(ash); this.ash = ash;

    // ---- the burned cabin ----
    this.burned = new THREE.Group();
    const bb = new Builder();
    const charred = [0x1e1a17, 0x2a2420, 0x332b25, 0x241f1b];
    const logs = (len, n, x, z, ry, burntTo) => {
      for (let i = 0; i < n; i++) {
        const l = len * (i < burntTo ? 1 : r.range(0.3, 0.9));
        const off = (len - l) / 2 * (r() < 0.5 ? -1 : 1);
        bb.add(new THREE.CylinderGeometry(0.17, 0.17, l, 7), r.pick(charred), x + Math.cos(ry) * off, 0.17 + i * 0.3, z - Math.sin(ry) * off, Math.PI / 2, ry + Math.PI / 2, 0);
      }
    };
    // cabin local frame: 5 wide (x), 6 deep (z), front at +z
    const cw = 5, cd = 6;
    const place = (lx, lz) => { const c = Math.cos(CABIN.ry), s = Math.sin(CABIN.ry); return [CABIN.x + lx * c + lz * s, CABIN.z - lx * s + lz * c]; };
    let [x, z] = place(0, -cd / 2); logs(cw, 6, x, z, CABIN.ry, 3);
    [x, z] = place(-cw / 2, 0); logs(cd, 5, x, z, CABIN.ry + Math.PI / 2, 2);
    [x, z] = place(cw / 2, 0); logs(cd, 3, x, z, CABIN.ry + Math.PI / 2, 1);
    [x, z] = place(-1.6, cd / 2); logs(1.8, 4, x, z, CABIN.ry, 2);
    [x, z] = place(1.6, cd / 2); logs(1.8, 2, x, z, CABIN.ry, 1);
    // fallen roof beams, leaning in
    for (let i = 0; i < 5; i++) {
      const [bx, bz] = place(r.range(-1.8, 1.8), r.range(-2, 2));
      bb.add(new THREE.CylinderGeometry(0.12, 0.14, r.range(2.5, 4.5), 6), r.pick(charred), bx, 0.6, bz, r.range(0.8, 1.3), r() * TAU, r.range(-0.3, 0.3));
    }
    // corner posts
    for (const [lx, lz, h] of [[-2.5, -3, 2.4], [2.5, -3, 1.4], [-2.5, 3, 1.9], [2.5, 3, 0.8]]) { const [px, pz] = place(lx, lz); bb.box(0.26, h, 0.26, px, h / 2, pz, 0x1a1614); }
    // the stone chimney, which fire does not take
    const [chx, chz] = place(-1.2, -3.3); bb.box(1.2, 4.2, 0.9, chx, 2.1, chz, 0x6a6660, CABIN.ry, 0.06);
    const bm = bb.build(); bm.position.y = y0; this.burned.add(bm);
    const ruinModel = modelCopy("cabin_burned");
    if (ruinModel) { bm.visible = false; ruinModel.scene.position.set(CABIN.x, y0, CABIN.z); ruinModel.scene.rotation.y = CABIN.ry; this.burned.add(ruinModel.scene); }
    root.add(this.burned);
    this.burnedCols = [];
    {
      const c = Math.cos(CABIN.ry), s = Math.sin(CABIN.ry);
      const wall = (lx0, lz0, lx1, lz1, h) => {
        const n = Math.ceil(Math.hypot(lx1 - lx0, lz1 - lz0) / 0.5);
        for (let i = 0; i <= n; i++) {
          const lx = lx0 + (lx1 - lx0) * i / n, lz = lz0 + (lz1 - lz0) * i / n;
          this.burnedCols.push(this.col.addCircle(CABIN.x + lx * c + lz * s, CABIN.z - lx * s + lz * c, 0.28, y0 + h));
        }
      };
      wall(-2.5, -3, 2.5, -3, 3); wall(-2.5, -3, -2.5, 3, 3); wall(2.5, -3, 2.5, 3, 3); wall(-2.5, 3, -0.7, 3, 3); wall(0.7, 3, 2.5, 3, 3);
      this.cabinFrame = { c, s };
    }

    // ---- the rebuilt cabin (hidden until it is) ----
    this.cabin = new THREE.Group();
    const cb = new Builder();
    const logC = [0x8a6440, 0x7a5634, 0x946a44];
    const wallLogs = (len, n, lx, lz, along, skip) => {
      for (let i = 0; i < n; i++) {
        if (skip && skip(i)) continue;
        const [px, pz] = place(lx, lz);
        cb.add(new THREE.CylinderGeometry(0.18, 0.18, len, 8), r.pick(logC), px, 0.18 + i * 0.33, pz, Math.PI / 2, CABIN.ry + (along ? Math.PI / 2 : 0), 0, 1, 1, 1, 0.05);
      }
    };
    wallLogs(cw + 0.5, 8, 0, -cd / 2, true);
    wallLogs(cd + 0.5, 8, -cw / 2, 0, false);
    wallLogs(cd + 0.5, 8, cw / 2, 0, false);
    wallLogs(1.9, 8, -1.55, cd / 2, true); wallLogs(1.9, 8, 1.55, cd / 2, true);
    const [lx, lz] = place(0, cd / 2); cb.add(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8), 0x8a6440, lx, 2.35, lz, Math.PI / 2, CABIN.ry + Math.PI / 2, 0);
    cb.add(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8), 0x8a6440, lx, 2.68, lz, Math.PI / 2, CABIN.ry + Math.PI / 2, 0);
    // roof
    const roof = prismGeo(cw + 0.2, 2.2, cd + 0.2, 0.55);
    cb.add(roof, 0x5a4636, CABIN.x, 2.72, CABIN.z, 0, CABIN.ry, 0);
    // gables filled with planks
    const [chx2, chz2] = place(-1.2, -3.3); cb.box(1.2, 5.6, 0.9, chx2, 2.8, chz2, 0x6a6660, CABIN.ry, 0.06);
    // the door they hewed
    const [dx, dz] = place(0, cd / 2 + 0.05);
    cb.box(1.1, 2.1, 0.12, dx, 1.05, dz, 0x6a4a2e, CABIN.ry);
    for (const yy of [0.4, 1.7]) cb.box(1.1, 0.12, 0.05, dx + Math.sin(CABIN.ry) * 0.07, yy, dz + Math.cos(CABIN.ry) * 0.07, 0x4a3420, CABIN.ry);
    const cm = cb.build(); cm.position.y = y0; this.cabin.add(cm);
    // a cabin made in Blender, if there is one, stands in for this one
    const cabinModel = modelCopy("cabin");
    if (cabinModel) { cm.visible = false; cabinModel.scene.position.set(CABIN.x, y0, CABIN.z); cabinModel.scene.rotation.y = CABIN.ry; this.cabin.add(cabinModel.scene); }
    // the door hangs on its own hinge in the model, so it can be swung
    this.cabinY = y0;
    this.doorNode = cabinModel ? cabinModel.scene.getObjectByName("door") : null;
    this.doorBase = this.doorNode ? this.doorNode.rotation.y : 0;
    this.doorA = 0; this.doorOpen = false;
    // a window with light in it, for the last evening
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.06), MAT.lit);
    const [wx, wz] = place(cw / 2 + 0.2, 0.5); win.position.set(wx, y0 + 1.5, wz); win.rotation.y = CABIN.ry + Math.PI / 2;
    this.cabin.add(win);
    this.cabin.visible = false;
    root.add(this.cabin);

    // ---- the chopping block, with an axe left in it ----
    const blk = new Builder();
    blk.add(new THREE.CylinderGeometry(0.42, 0.48, 0.6, 10), 0x6a4a30, BLOCK.x, 0.3, BLOCK.z);
    blk.add(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 10), 0xb89a70, BLOCK.x, 0.61, BLOCK.z);
    // a sawhorse beside it
    for (const s of [-0.7, 0.7]) { blk.box(0.08, 0.9, 0.08, BLOCK.x + 1.3 + s, 0.45, BLOCK.z + 0.35, 0x5a4030); blk.box(0.08, 0.9, 0.08, BLOCK.x + 1.3 + s, 0.45, BLOCK.z - 0.35, 0x5a4030); }
    blk.box(1.8, 0.1, 0.12, BLOCK.x + 1.3, 0.9, BLOCK.z, 0x6a4a30);
    const bm2 = blk.build(); bm2.position.y = y0; root.add(bm2);
    // (collider tops are heights in the world, and the clearing stands well above nought)
    this.col.addCircle(BLOCK.x, BLOCK.z, 0.5, this.heightAt(BLOCK.x, BLOCK.z) + 0.6);
    this.col.addRect(BLOCK.x + 1.3, BLOCK.z, 1.8, 0.8, this.heightAt(BLOCK.x + 1.3, BLOCK.z) + 0.9);
    this.blockAxe = new THREE.Group();
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.75, 6), mat(0x6a4a30)); haft.position.y = 0.3; this.blockAxe.add(haft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.17), mat(0x4d4f52, { metalness: 0.7, roughness: 0.6 })); head.position.set(0, -0.05, 0.05); this.blockAxe.add(head);
    this.blockAxe.position.set(BLOCK.x, y0 + 0.72, BLOCK.z); this.blockAxe.rotation.set(0.5, 0.8, 0.15);
    root.add(this.blockAxe);
    // a door, once one is hewn, leans on the sawhorse
    this.doorProp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), mat(0x7a5634));
    this.doorProp.position.set(BLOCK.x + 1.3, y0 + 1.0, BLOCK.z - 0.55); this.doorProp.rotation.x = 0.25; this.doorProp.visible = false;
    root.add(this.doorProp);

    // ---- the stack, which grows as logs are carried to it ----
    this.stack = new THREE.Group(); root.add(this.stack);
    this.stackN = -1; this.setStack(0);
    this.stackCol = this.col.addRect(STACK.x, STACK.z, 1.6, 2.6, this.heightAt(STACK.x, STACK.z) + 0.5);

    // ---- a fire ring ----
    const fr = new Builder();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; fr.add(new THREE.DodecahedronGeometry(0.2, 0), 0x6a6660, FIRE.x + Math.cos(a) * 0.65, 0.1, FIRE.z + Math.sin(a) * 0.65, i, i, 0, 1, 0.8, 1, 0.1); }
    for (let i = 0; i < 4; i++) fr.add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), 0x3a2a20, FIRE.x, 0.12, FIRE.z, Math.PI / 2, i * 0.8, 0.2);
    // logs to sit on
    fr.add(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8), 0x7a5634, FIRE.x - 1.9, 0.2, FIRE.z + 0.3, Math.PI / 2, 0.3, 0);
    fr.add(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8), 0x7a5634, FIRE.x + 1.9, 0.2, FIRE.z + 0.4, Math.PI / 2, -0.3, 0);
    const fm = fr.build(); fm.position.y = y0; root.add(fm);
    this.col.addCircle(FIRE.x, FIRE.z, 0.7, this.heightAt(FIRE.x, FIRE.z) + 0.4);
    this.fire = null;

    // ---- the ring of trees you can fell ----
    this.fellable = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + r.range(-0.05, 0.05);
      const d = C.r + r.range(2, 12);
      const tx = C.x + Math.cos(a) * d, tz = C.z + Math.sin(a) * d;
      // leave the road's mouth open
      if (this.roadDist(tx, tz).d < 5) continue;
      const h = r.range(8, 12);
      const sm = modelCopy("spruce");
      let g;
      if (sm) { g = new THREE.Group(); sm.scene.scale.setScalar(h / 10); sm.scene.rotation.y = r() * TAU; g.add(sm.scene); }
      else g = makeSpruce(h, i * 7 + 1);
      const ty = this.heightAt(tx, tz);
      g.position.set(tx, ty - 0.1, tz);
      root.add(g);
      const t = { g, x: tx, z: tz, y: ty, h, hp: 4, state: "up", angle: a, col: this.col.addCircle(tx, tz, 0.32, 12), fall: 0, claimed: null };
      this.fellable.push(t);
    }
  }
  // ---- the settlement grows: a ring of the forest past the edge becomes trees to fell ----
  // ring k runs from CLEARING.r + 14 + (k - 1) * RING to CLEARING.r + 14 + k * RING. The same trees every time, in the same order,
  // so a saved list of felled trees still means the same ones.
  clearRing(k) {
    this.ringsDone ??= new Set();
    if (this.ringsDone.has(k)) return this.fellable.filter(t => t.ring === k);
    this.ringsDone.add(k);
    const r0 = CLEARING.r + 14 + (k - 1) * RING, r1 = r0 + RING, out = [];
    const touched = new Set();
    for (const s of this.forest) {
      const d = Math.hypot(s.x - CLEARING.x, s.z - CLEARING.z);
      if (d < r0 || d >= r1) continue;
      // one already taken for felling by hand: it belongs to the ring now
      if (s.adopted) { if (s.adopted.state !== "gone") { s.adopted.ring = k; out.push(s.adopted); } continue; }
      if (s.gone) continue;
      if (this.anyRoadDist(s.x, s.z).d < 5) continue;
      const t = this.adopt(s, touched); t.ring = k; out.push(t);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    return out;
  }
  // ground marked out beyond the edge (a polygon, [[x, z], ...]): every tree on it becomes one to fell, tagged with the claim
  clearArea(poly, tag) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const out = [], touched = new Set();
    for (const s of this.forest) {
      if (s.x < x0 || s.x > x1 || s.z < z0 || s.z > z1 || !inPoly(poly, s.x, s.z)) continue;
      if (s.adopted) { if (s.adopted.state !== "gone") { s.adopted.lobe = tag; out.push(s.adopted); } continue; }
      if (s.gone) continue;
      if (this.anyRoadDist(s.x, s.z).d < 5) continue;
      const t = this.adopt(s, touched); t.lobe = tag; out.push(t);
    }
    // (and the trees already standing in the clearing's own ring that fall inside it)
    for (const t of this.fellable) if (!t.lobe && !t.wild && (t.state === "up" || t.state === "shake") && inPoly(poly, t.x, t.z) && !out.includes(t)) { t.lobe = tag; out.push(t); }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    return out;
  }
  // the forest taken away round a spot, for good (a cave's mouth, a new clearing): no trees, no stumps
  clearScenery(x, z, r, road = null) {
    const touched = new Set();
    for (const s of this.forest) {
      if (s.gone) continue;
      if (Math.hypot(s.x - x, s.z - z) > r && !(road && road(s.x, s.z))) continue;
      s.gone = true;
      for (const [m, i] of s.slots || []) { m.setMatrixAt(i, ZERO); touched.add(m); }
      if (s.col) s.col.disabled = true;
      if (s._mi != null && this.mapTrees[s._mi]) this.mapTrees[s._mi].gone = true;
    }
    for (const t of this.fellable) if ((t.state === "up" || t.state === "shake") && (Math.hypot(t.x - x, t.z - z) <= r || (road && road(t.x, t.z)))) { t.g.visible = false; t.state = "gone"; t.col.disabled = true; t.dug = true; }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    this._mapDirty = this._gridDirty = true;
  }
  // a scenery tree, as a group of its own: each of its pieces in the forest (the near, full ones) copied out as a
  // one-tree instance of the same shape, stuff and tint — so when it becomes a tree you can fell, it doesn't change
  pieces(s) {
    const near = (s.slots || []).filter(([m]) => !m.userData.far);
    if (!near.length) return null;
    const g = new THREE.Group(), M = new THREE.Matrix4(), C = new THREE.Color();
    const inv = new THREE.Matrix4().makeTranslation(-s.x, -(s.y - 0.1), -s.z);
    for (const [m, i] of near) {
      m.getMatrixAt(i, M);
      if (M.elements[0] === 0 && M.elements[5] === 0) continue;       // (already gone)
      const one = new THREE.InstancedMesh(m.geometry, m.material, 1);
      one.setMatrixAt(0, M.clone().premultiply(inv));
      if (m.instanceColor) { m.getColorAt(i, C); one.setColorAt(0, C); }
      one.castShadow = true; one.receiveShadow = true; one.frustumCulled = false;
      g.add(one);
    }
    return g.children.length ? g : null;
  }
  // a scenery tree becomes one you can fell: the instance goes, and a tree of its own stands where it stood
  adopt(s, touched) {
    // (read the tree out of the forest before it goes: its own pieces, placed and tinted as they were)
    const same = this.pieces(s);
    s.gone = true;
    // (on the map it's drawn as a tree of its own now, while it stands)
    if (s._mi != null && this.mapTrees[s._mi]) { this.mapTrees[s._mi].gone = true; this._mapDirty = this._gridDirty = true; }
    for (const [m, i] of s.slots || []) { m.setMatrixAt(i, ZERO); if (touched) touched.add(m); else m.instanceMatrix.needsUpdate = true; }
    if (s.col) s.col.disabled = true;
    let g = same;
    if (!g) {
      const model = modelCopy(s.kind) || modelCopy("spruce");
      if (model) { g = new THREE.Group(); model.scene.scale.setScalar(s.h / 10); model.scene.rotation.y = s.rot; g.add(model.scene); }
      else g = makeSpruce(s.h, Math.floor(s.x * 7));
    }
    g.position.set(s.x, s.y - 0.1, s.z);
    this.root.add(g);
    const t = { g, x: s.x, z: s.z, y: s.y, h: s.h, hp: s.kind === "birch" ? 3 : 4, state: "up", angle: Math.atan2(s.z - CLEARING.z, s.x - CLEARING.x), col: this.col.addCircle(s.x, s.z, s.kind === "birch" ? 0.24 : 0.32, 12), fall: 0, claimed: null, src: s };
    s.adopted = t;
    this.fellable.push(t);
    return t;
  }
  // any tree in the forest can be felled: the one in front of you, within an axe's reach, is taken up
  // for felling as you swing at it (it isn't saved as felled — it grows back in time, out of sight)
  adoptNear(pl, reach = 2.4) {
    if (!this.forest) return null;
    const f = pl.forward();
    let best = null, bd = reach;
    for (const t of this.fellable) {
      if (t.state !== "up" && t.state !== "shake") continue;
      const dx = t.x - pl.pos.x, dz = t.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * f.x + dz * f.z) / d > 0.45) bd = d;
    }
    for (const s of this.forest) {
      if (s.gone) continue;
      const dx = s.x - pl.pos.x, dz = s.z - pl.pos.z;
      if (Math.abs(dx) > bd || Math.abs(dz) > bd) continue;
      const d = Math.hypot(dx, dz);
      if (d < bd && (dx * f.x + dz * f.z) / d > 0.45) { bd = d; best = s; }
    }
    if (!best) return null;
    const t = this.adopt(best); t.wild = true;
    return t;
  }
  // a felled tree grows back after a while, out of sight (the town keeps its own count; this is for the chapters before it)
  regrowTick(dt) {
    if (!this.fellable) return;
    const pl = G.player;
    for (const t of this.fellable) {
      // (the town keeps its own count of its trees; a wild one grows back the same everywhere)
      if (t.state !== "gone" || t.ring || (G.town && !t.wild)) { t.goneFor = 0; continue; }
      t.goneFor = (t.goneFor || 0) + dt;
      if (t.goneFor < 240 || Math.hypot(pl.pos.x - t.x, pl.pos.z - t.z) < 18) continue;
      if (t.stump) { this.root.remove(t.stump); t.stump = null; }
      if (G.town && G.town.dropStump) G.town.dropStump(t);
      t.g.visible = true; t.g.rotation.set(0, 0, 0); t.state = "up"; t.hp = 4; t.col.disabled = false; t.claimed = null; t.goneFor = 0;
      if (!t.wild) this.onRegrow && this.onRegrow(this.fellable.indexOf(t));
    }
  }
  // the charcoal burner's camp, where his track ends: a kiln smoking under its turf, his hut, his wood
  buildBurner(br) {
    const r = rng(417), root = this.root;
    const e = br.pts[br.pts.length - 1], e2 = br.pts[br.pts.length - 6];
    const ang = Math.atan2(e.x - e2.x, e.z - e2.z);             // the way the track was going
    const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
    const at = (a, b) => [e.x + fx * a + rx * b, e.z + fz * a + rz * b];
    const H = (x, z) => this.heightAt(x, z);
    const b = new Builder();
    // (a turn that points a thing's +Y along n, as the builder takes it; and a rod from one point to another)
    const BOXG = new THREE.BoxGeometry(1, 1, 1);
    const _qq = new THREE.Quaternion(), _ee = new THREE.Euler(), UPV = new THREE.Vector3(0, 1, 0), _nn = new THREE.Vector3();
    const along = (nx, ny, nz) => { _qq.setFromUnitVectors(UPV, _nn.set(nx, ny, nz).normalize()); _ee.setFromQuaternion(_qq, "YXZ"); return [_ee.x, _ee.y, _ee.z]; };
    const rod = (x0, y0, z0, x1, y1, z1, r0, r1, color) => { const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0); b.add(new THREE.CylinderGeometry(r1, r0, L, 6), color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, ...along(x1 - x0, y1 - y0, z1 - z0)); };
    // the ground: soot and ash trodden in, in blotches, fading out into the forest floor at the edges
    const [px, pz] = at(5, 0);
    {
      const cv = document.createElement("canvas"); cv.width = cv.height = 256;
      const x = cv.getContext("2d");
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 100, cx = 128 + Math.cos(a) * d, cy = 128 + Math.sin(a) * d, rr = 18 + r() * 40;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
        const k = 0.55 * (1 - d / 125);
        g.addColorStop(0, `rgba(${r() < 0.3 ? "70,64,58" : "28,24,22"},${k})`); g.addColorStop(1, "rgba(28,24,22,0)");
        x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      }
      const geo = new THREE.PlaneGeometry(24, 24, 24, 24); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, H(px + p.getX(i), pz + p.getZ(i)) + 0.04);
      geo.computeVertexNormals();
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const soot = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      soot.position.set(px, 0, pz); soot.receiveShadow = true; root.add(soot);
    }
    // the clamp: a beehive of stacked billets under a skin of turf and earth, a smoke-hole at its crown and vents
    // round its flanks glowing where the fire inside shows through
    const [kx, kz] = at(6, 3.5), ky = H(kx, kz);
    // one mound, a squat dome of earth and turf: its skin lumpy where the sods lie, green turf in patches over brown earth,
    // and its foot following the ground wherever the ground slopes
    const RD = 2.7, HD = 2.15;
    const domeR = y => RD * Math.sqrt(Math.max(0, 1 - (y / HD) ** 2));
    const domeN = (a, y) => { const rr = domeR(y); return [Math.cos(a) * rr / (RD * RD), y / (HD * HD), Math.sin(a) * rr / (RD * RD)]; };
    const onSkin = (a, y, out = 0) => { const n = domeN(a, y), l = Math.hypot(...n), rr = domeR(y); return { x: kx + Math.cos(a) * rr + n[0] / l * out, y: H(kx + Math.cos(a) * rr, kz + Math.sin(a) * rr) + y + n[1] / l * out, z: kz + Math.sin(a) * rr + n[2] / l * out, n: [n[0] / l, n[1] / l, n[2] / l] }; };
    {
      const geo = new THREE.SphereGeometry(1, 36, 14, 0, TAU, 0, Math.PI / 2), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const earth = new THREE.Color(0x4a3e2e), turf = [new THREE.Color(0x46502e), new THREE.Color(0x3a4628), new THREE.Color(0x55573a)], c = new THREE.Color();
      const noise = (x, z) => Math.sin(x * 3.1 + z * 1.7) * 0.5 + Math.sin(x * 1.3 - z * 2.9 + 1.2) * 0.5;
      for (let k = 0; k < pos.count; k++) {
        const ux = pos.getX(k), uy = pos.getY(k), uz = pos.getZ(k);
        const wx = kx + ux * RD, wz = kz + uz * RD, lump = (noise(wx * 2.2, wz * 2.2) * 0.09 + noise(wz * 4.1, wx * 3.3) * 0.04) * Math.min(1, uy * 6);
        // (the foot of it rests on the ground where it is, not on a level floor)
        const g = H(wx, wz);
        pos.setXYZ(k, ux * (RD + lump), g + uy * HD + lump * uy - 0.04, uz * (RD + lump));
        const pk = (noise(wx * 1.6 + 7, wz * 1.6) + 1) / 2;
        c.copy(pk > 0.42 ? turf[k % 3] : earth); if (uy > 0.93) c.copy(earth).multiplyScalar(0.7);   // (bare and sooty round the smoke-hole)
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
      m.position.set(kx, 0, kz); m.castShadow = true; m.receiveShadow = true; root.add(m);
    }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, p0 = onSkin(a, HD - 0.08, -0.05); rod(p0.x, p0.y, p0.z, p0.x + Math.cos(a) * 0.15, p0.y + 0.45, p0.z + Math.sin(a) * 0.15, 0.035, 0.025, 0x3a2c20); }   // sticks round the smoke-hole
    // vents round its flanks: dark holes in the turf, the fire's glow just showing in each
    const glowM = new THREE.MeshBasicMaterial({ color: 0xff6a20 });
    this.burnerGlow = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + 0.3, y = 0.4 + (i % 2) * 0.3, q = onSkin(a, y, 0.01);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), new THREE.MeshBasicMaterial({ color: 0x0c0806 }));
      hole.position.set(q.x, q.y, q.z); hole.lookAt(q.x + q.n[0], q.y + q.n[1], q.z + q.n[2]); root.add(hole);
      const g = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), glowM.clone()); const o = onSkin(a, y, 0.02);
      g.position.set(o.x, o.y, o.z); g.lookAt(o.x + q.n[0], o.y + q.n[1], o.z + q.n[2]); root.add(g); this.burnerGlow.push(g);
    }
    // a ladder leant up its side: two rails from the ground to the shoulder of it, and the rungs between them
    { const la = Math.atan2(fx, fz) + 0.6 + Math.PI, ca = Math.cos(la), sa = Math.sin(la);
      const foot = { x: kx + ca * (RD + 0.8), z: kz + sa * (RD + 0.8) }, fy = H(foot.x, foot.z), top = onSkin(la, 1.6, 0.08);
      const side = [-sa, ca];
      for (const s2 of [-0.22, 0.22]) rod(foot.x + side[0] * s2, fy, foot.z + side[1] * s2, top.x + side[0] * s2, top.y + 0.3, top.z + side[1] * s2, 0.035, 0.03, 0x7a6248);
      for (let i = 1; i <= 7; i++) { const t = i / 8, x = foot.x + (top.x - foot.x) * t, y = fy + (top.y + 0.3 - fy) * t, z = foot.z + (top.z - foot.z) * t;
        rod(x - side[0] * 0.22, y, z - side[1] * 0.22, x + side[0] * 0.22, y, z + side[1] * 0.22, 0.022, 0.022, 0x8a7258); } }
    { const [wx0, wz0] = at(9.5, 5.5), wy0 = H(wx0, wz0);
      for (let i = 0; i < 6; i++) b.add(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 5), 0x5a4432, wx0 + fx * (i - 2.5) * 0.7, wy0 + 0.8, wz0 + fz * (i - 2.5) * 0.7);
      for (let j = 0; j < 7; j++) b.box(4.0, 0.07, 0.07, wx0, wy0 + 0.25 + j * 0.19, wz0, j % 2 ? 0x7a6650 : 0x6a5640, ang + Math.PI / 2, 0.05); }
    // the next clamp, half built: a ring of billets standing on end, leaning in round a centre pole
    { const [cx, cz] = at(13, 0.5), cy = H(cx, cz);
      b.add(new THREE.CylinderGeometry(0.07, 0.08, 2.6, 6), 0x6a5440, cx, cy + 1.3, cz);
      for (let ring = 0; ring < 3; ring++) for (let i = 0, n = 10 + ring * 7; i < n; i++) {
        const a = i / n * TAU + ring * 0.2, d = 0.35 + ring * 0.42;
        b.add(new THREE.CylinderGeometry(0.075, 0.085, 1.25, 6), r.pick([0x8a6a48, 0x7a5c3e, 0x9a7a52]), cx + Math.cos(a) * d, cy + 0.6, cz + Math.sin(a) * d, Math.sin(a) * 0.18 * (ring + 1) * 0.5, 0, -Math.cos(a) * 0.18 * (ring + 1) * 0.5);
      }
      this.col.addCircle(cx, cz, 1.4, cy + 1.5); }
    // his hut: a forest hut of the kind charcoal burners kept here — a ridge pole on crossed poles at either end, two
    // roofs of bark slabs coming down to the ground, a gable of upright split logs at each end and the door in the one
    // toward the fire, and sods heaped along the eaves against the draught
    const [hx, hz] = at(9, -3.5), hy = H(hx, hz);
    { const da = Math.atan2(px - hx, pz - hz), dx = Math.sin(da), dz = Math.cos(da), sx = Math.cos(da), sz = -Math.sin(da);
      const L = 3.4, Wd = 1.7, Hr = 2.5, slope = Math.hypot(Wd, Hr), tilt = Math.atan2(Hr, Wd);
      const P2 = (a, w, y = 0) => [hx + dx * a + sx * w, hy + y, hz + dz * a + sz * w];     // (along, across, up)
      // the roofs: strips of bark, each a little different, overlapping down the length
      for (const side of [-1, 1]) for (let k = 0; k < 7; k++) {
        const a = -L / 2 + (k + 0.5) * L / 7, [x, y, z] = P2(a, side * Wd / 2, Hr / 2);
        b.add(BOXG, r.pick([0x5a4632, 0x4e3c2c, 0x64503a]), x, y, z, 0, da, -side * tilt, slope + 0.12, 0.07, L / 7 + 0.04, 0.06);
      }
      // the ridge pole, and the crossed poles at each end standing up past it
      { const [x0, y0, z0] = P2(-L / 2 - 0.35, 0, Hr + 0.04), [x1, y1, z1] = P2(L / 2 + 0.35, 0, Hr + 0.04); rod(x0, y0, z0, x1, y1, z1, 0.07, 0.07, 0x6a5440); }
      for (const a of [-L / 2 - 0.05, L / 2 + 0.05]) for (const side of [-1, 1]) {
        const [x0, y0, z0] = P2(a, side * Wd * 1.04, 0), [x1, y1, z1] = P2(a, -side * 0.32, Hr + 0.45); rod(x0, y0, z0, x1, y1, z1, 0.06, 0.045, 0x5e4a38);
      }
      // the gables: upright split logs, cut to the slope of the roof; a doorway in the front one
      for (const [a, door] of [[L / 2 - 0.04, true], [-L / 2 + 0.04, false]]) {
        for (let w = -Wd + 0.16; w <= Wd - 0.15; w += 0.21) {
          if (door && Math.abs(w) < 0.42) continue;
          const h = Hr * (1 - Math.abs(w) / Wd) - 0.05, [x, , z] = P2(a, w);
          b.add(new THREE.CylinderGeometry(0.1, 0.11, h, 6), r.pick([0x6a5440, 0x5e4a38, 0x735a42]), x, hy + h / 2, z, 0, 0, 0, 1, 1, 0.6, 0.06);
        }
      }
      { const [x, y, z] = P2(L / 2 - 0.1, 0, 0.78); b.box(0.84, 1.56, 0.06, x, y, z, 0x120d0a, da); }                  // (the dark of the doorway)
      { const [x, y, z] = P2(L / 2, 0, 1.62); b.box(0.98, 0.1, 0.16, x, y, z, 0x5e4a38, da); }                           // (the lintel)
      // sods along the eaves
      for (const side of [-1, 1]) for (let k = 0; k < 6; k++) { const [x, y, z] = P2(-L / 2 + (k + 0.5) * L / 6, side * (Wd + 0.12), 0.16); b.add(new THREE.DodecahedronGeometry(0.3, 0), r.pick([0x4a5230, 0x3e3a2c, 0x46502e]), x, y, z, r(), r(), r(), 1.4, 0.55, 1.0, 0.08); }
    }
    // his fire, a log to sit on, and a kettle on a crane over it
    const [ox, oz] = at(3.2, 1.8), oy = H(ox, oz);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.add(new THREE.DodecahedronGeometry(0.16, 0), 0x6a665e, ox + Math.cos(a) * 0.55, oy + 0.08, oz + Math.sin(a) * 0.55, r(), r(), r(), 1, 0.7, 1, 0.08); }
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), 0x4a3828, ox + 0.6, oy + 0.65, oz);
    b.box(0.9, 0.04, 0.04, ox + 0.15, oy + 1.25, oz, 0x3a3028);
    b.add(new THREE.CylinderGeometry(0.13, 0.11, 0.22, 10), 0x2a2a2c, ox, oy + 0.62, oz);
    rod(ox, oy + 0.73, oz, ox, oy + 1.24, oz, 0.008, 0.008, 0x2a2a2c);          // (the pot-hook)
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; rod(ox + Math.cos(a) * 0.35, oy + 0.06, oz + Math.sin(a) * 0.35, ox - Math.cos(a) * 0.05, oy + 0.16, oz - Math.sin(a) * 0.05, 0.045, 0.04, 0x3a2a1e); }   // (the burning sticks)
    { const em = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), new THREE.MeshBasicMaterial({ color: 0x8a2a0c })); em.rotation.x = -Math.PI / 2; em.position.set(ox, oy + 0.05, oz); root.add(em); this.burnerGlow.push(em);
      const fl = makeFlame(2.4); fl.position.set(ox, oy + 0.08, oz); root.add(fl); this.flames.push(fl); }
    const [sx2, sz2] = at(2.2, 3.4); b.add(new THREE.CylinderGeometry(0.22, 0.24, 1.8, 8), 0x6a5038, sx2, H(sx2, sz2) + 0.22, sz2, 0, ang, Math.PI / 2);
    // the charcoal: a black heap of it raked out, baskets and sacks of it ready for the buyer
    const [cx3, cz3] = at(5.5, -0.8), cy3 = H(cx3, cz3);
    for (let i = 0; i < 40; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 1.1; b.add(new THREE.DodecahedronGeometry(0.12, 0), r.pick([0x141210, 0x1e1a18, 0x262220]), cx3 + Math.cos(a) * d, cy3 + (1.1 - d) * 0.35 + 0.05, cz3 + Math.sin(a) * d, r(), r(), r(), 1, 0.7, 1, 0.1); }
    for (let i = 0; i < 3; i++) { const [bx2, bz2] = at(2.4 + i * 0.7, -2.6), by2 = H(bx2, bz2);
      b.add(new THREE.CylinderGeometry(0.3, 0.24, 0.42, 12, 1, true), 0xa08454, bx2, by2 + 0.21, bz2); b.add(new THREE.TorusGeometry(0.3, 0.025, 4, 14), 0x8a6e44, bx2, by2 + 0.42, bz2, Math.PI / 2, 0, 0);
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; b.add(new THREE.DodecahedronGeometry(0.09, 0), 0x18140f, bx2 + Math.cos(a) * 0.15, by2 + 0.42, bz2 + Math.sin(a) * 0.15, r(), r(), r()); }
      b.add(new THREE.DodecahedronGeometry(0.12, 0), 0x18140f, bx2, by2 + 0.48, bz2); }
    // (sacks of it, in coarse cloth, tied at the neck: not wood)
    { const cloth = new Builder();
      for (let i = 0; i < 3; i++) { const [sx, sz] = at(1.4, -3.4 - i * 0.65), sy = H(sx, sz), sr = r() * 3;
        cloth.add(new THREE.SphereGeometry(0.3, 10, 8), r.pick([0x8a7a5a, 0x7a6c4e, 0x938466]), sx, sy + 0.3, sz, 0, sr, 0, 0.95, 1.15, 0.8, 0.05);
        cloth.add(new THREE.CylinderGeometry(0.06, 0.1, 0.14, 8), 0x7a6c4e, sx, sy + 0.66, sz);
        cloth.add(new THREE.TorusGeometry(0.065, 0.016, 4, 10), 0x4a3a28, sx, sy + 0.64, sz, Math.PI / 2, 0, 0); }
      root.add(cloth.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }))); }
    // a stack of split wood waiting to be burned, a chopping block with an axe in it, a rake and a shovel
    const [wx, wz] = at(3, -5.5), wy = H(wx, wz);
    root.add(P.logPile(wx, wz, 11, ang, wy));
    const [wx2, wz2] = at(12.5, -2.8);
    root.add(P.logPile(wx2, wz2, 8, ang + 0.4, H(wx2, wz2)));
    const [cx2, cz2] = at(4.5, -1.2), cy2 = H(cx2, cz2);
    b.add(new THREE.CylinderGeometry(0.34, 0.38, 0.55, 10), 0x6a5038, cx2, cy2 + 0.27, cz2);
    b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), 0x7a5a3a, cx2 + 0.1, cy2 + 0.75, cz2, 0.5, 0, 0.3); b.box(0.04, 0.16, 0.2, cx2 + 0.24, cy2 + 0.58, cz2 + 0.1, 0x55595e, 0.3);
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), 0x5a4432, kx - rx * 2.9, ky + 0.9, kz - rz * 2.9, 0.3, 0, 0.2);
    b.box(0.5, 0.05, 0.1, kx - rx * 2.9 + 0.2, ky + 1.95, kz - rz * 2.9, 0x3a3a3c, 0.3);
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), 0x5a4432, kx - rx * 2.7 + fx * 0.9, ky + 0.75, kz - rz * 2.7 + fz * 0.9, -0.35, 0, 0.1);
    b.box(0.26, 0.32, 0.03, kx - rx * 2.7 + fx * 0.9, ky + 0.12, kz - rz * 2.7 + fz * 0.9 - 0.25, 0x55595e, 0.1);
    root.add(b.build(MAT.rough));
    this.col.addCircle(kx, kz, 2.6, ky + 2); this.col.addCircle(hx, hz, 2.0, hy + 3); this.col.addCircle(wx, wz, 1.2, wy + 1.5); this.col.addCircle(cx2, cz2, 0.4, cy2 + 0.6); this.col.addCircle(wx2, wz2, 1.1, H(wx2, wz2) + 1.4);
    // smoke from the clamp, thin and endless: soft puffs that drift and spread, not balls
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    { const x = cv.getContext("2d"), g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "rgba(255,255,255,0.8)"); g.addColorStop(0.5, "rgba(255,255,255,0.3)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
    const ptex = new THREE.CanvasTexture(cv), smoke = [];
    for (let i = 0; i < 22; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ptex, color: 0xbcb6ac, transparent: true, opacity: 0.25, depthWrite: false })); m.userData.t = i / 22; root.add(m); smoke.push(m); }
    this.burner = { x: hx - fx * 1.6, z: hz - fz * 1.6, kiln: { x: kx, y: ky + 2.1, z: kz }, smoke, face: ang + Math.PI, camp: { x: px, z: pz } };
  }
  setStack(n) {
    if (n === this.stackN) return;
    this.stackN = n;
    this.stack.clear();
    // (straight on the ground, with no boards under it)
    if (n > 0) { const p = P.logPile(STACK.x, STACK.z, Math.min(n, 24), 0, 0); p.position.y = this.cy; this.stack.add(p); }
  }
  // let it snow: k is how much lies on the ground, fall is how hard it is still coming down
  setSnow(k, fall = 0) {
    SNOW.value = k;
    if (this.terrainMat) this.terrainMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(1.7, 1.75, 1.85), k);
    if (fall > 0 && !this.flakes) {
      const n = 4000, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 60; p[i * 3 + 1] = Math.random() * 30; p[i * 3 + 2] = (Math.random() - 0.5) * 60; }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      this.flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
      this.flakes.frustumCulled = false;
      this.root.add(this.flakes);
    }
    if (this.flakes) { this.flakes.visible = fall > 0; this.flakeFall = fall; }
  }
  // the fire's strength, 0 (out) to 1 (roaring)
  setFire(k) {
    if (!this.fire) return;
    this.fire.scale.setScalar(0.25 + k * 0.85);
    this.fire.userData.flame.base = 9 * k;
    this.fire.visible = k > 0.02;
  }
  lightFire(on = true) {
    if (!on && this.fire) { this.root.remove(this.fire); this.flames.splice(this.flames.indexOf(this.fire), 1); this.lightPool[0].intensity = 0; this.fire = null; return; }
    if (on && !this.fire) {
      const L = this.lightPool[0]; L.intensity = 9; L.distance = 18;
      this.fire = makeFlame(5, L); this.fire.position.set(FIRE.x, this.cy + 0.05, FIRE.z);
      this.fire.userData.flame.base = 9;
      this.root.add(this.fire); this.flames.push(this.fire);
    }
  }
  // the cabin's own frame: across (x) and back-to-door (z), to the world and back
  cabinToWorld(lx, lz) { const { c, s } = this.cabinFrame; return [CABIN.x + lx * c + lz * s, CABIN.z - lx * s + lz * c]; }
  worldToCabin(x, z) { const { c, s } = this.cabinFrame, dx = x - CABIN.x, dz = z - CABIN.z; return [dx * c - dz * s, dx * s + dz * c]; }
  // what is underfoot, for the sound of it
  surfaceAt(x, z) {
    if (this.insideCabin(x, z)) return "wood";
    if (G.town && G.town.pathAt && G.town.pathAt(x, z)) return G.town.tierLevel >= 3 ? "stone" : "dirt";
    if (SNOW.value > 0.4) return "snow";
    if (this.anyRoadDist(x, z).d < 1.6) return "dirt";
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + 3) return "grass";
    return "leaves";
  }
  insideCabin(x, z) { if (!this.cabinUp) return false; const [lx, lz] = this.worldToCabin(x, z); return Math.abs(lx) < 2.35 && Math.abs(lz) < 2.9; }
  showCabin() {
    this.burned.visible = false; this.cabin.visible = true;
    // a dark board under the floor, so no grass shows between the planks or at the foot of the walls
    if (!this.underFloor) {
      this.underFloor = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.05, 6.8), mat(0x1c1510, { surface: "none" }));
      this.underFloor.position.set(CABIN.x, this.cabinY - 0.01, CABIN.z); this.underFloor.rotation.y = CABIN.ry; this.root.add(this.underFloor);
    }
    this.underFloor.visible = true;
    // the door they hewed is hung on the cabin now, not lying by the block
    if (this.doorProp) this.doorProp.visible = false;
    // the ash is swept and trodden in; the forest floor shows through again
    this.ash.visible = false;
    for (const c of this.burnedCols) c.disabled = true;
    if (this.cabinUp) return;
    this.cabinUp = true;
    // no snow under the roof
    ROOFED.value.set(CABIN.x, CABIN.z, CABIN.ry, 1); ROOFSIZE.value.z = this.cabinY + 2.7;
    // walls of logs you can walk between: the doorway is the only way in
    const circle = (lx, lz, r, h = 3) => { const [x, z] = this.cabinToWorld(lx, lz); return this.col.addCircle(x, z, r, this.cabinY + h); };
    const wall = (lx0, lz0, lx1, lz1) => {
      const n = Math.ceil(Math.hypot(lx1 - lx0, lz1 - lz0) / 0.45);
      for (let i = 0; i <= n; i++) circle(lx0 + (lx1 - lx0) * i / n, lz0 + (lz1 - lz0) * i / n, 0.28);
    };
    wall(-2.55, -3.05, 2.55, -3.05); wall(-2.55, -3.05, -2.55, 3.05); wall(2.55, -3.05, 2.55, 3.05);
    wall(-2.55, 3.05, -0.95, 3.05); wall(0.95, 3.05, 2.55, 3.05);
    circle(-1.2, -3.6, 0.6);                                                  // the chimney, outside
    for (const lx of [-1.65, -1.2, -0.75]) circle(lx, -2.6, 0.32, 1.3);        // the hearth, in
    // the door itself, when it is shut
    this.doorCols = [-0.45, 0, 0.45].map(lx => circle(lx, 3.05, 0.26));
    const [dx, dz] = this.cabinToWorld(0, 3.05);
    this.addInteract({ x: dx, y: this.cabinY + 1.2, z: dz, reach: 2.1, label: () => this.doorOpen ? "Close the door" : "Open the door", use: () => this.setCabinDoor(!this.doorOpen) });
    // a lamp's worth of light inside, and a fire in the hearth when it is lit
    const [lx, lz] = this.cabinToWorld(0.3, -0.2);
    this.homeLight = new THREE.PointLight(0xffc48a, 0, 7.5, 1.4); this.homeLight.position.set(lx, this.cabinY + 2.3, lz); this.root.add(this.homeLight);
    this.setFurniture(null);
  }
  setCabinDoor(open, silent = false) {
    if (open === this.doorOpen) return;
    this.doorOpen = open;
    for (const c of this.doorCols || []) c.disabled = open;
    if (!silent) AUDIO.door(open);
    if (silent) this.doorA = open ? 1 : 0;
  }
  lightHearth(on = true) {
    if (!on && this.hearth) { this.root.remove(this.hearth, this.hearthLogs); this.flames.splice(this.flames.indexOf(this.hearth), 1); this.hearth = null; return; }
    if (on && !this.hearth) {
      const L = new THREE.PointLight(0xff8a3a, 5, 9, 1.6);
      this.hearth = makeFlame(2.6, L);
      const [x, z] = this.cabinToWorld(-1.2, -2.2);                 // in the mouth of the firebox
      this.hearth.position.set(x, this.cabinY + 0.14, z);
      // two split logs under it, crossed
      const b = new Builder();
      for (const a of [0.5, -0.5]) b.add(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 6), 0x3a2618, x, this.cabinY + 0.13, z, Math.PI / 2, CABIN.ry + Math.PI / 2 + a, 0);
      this.hearthLogs = b.build(MAT.rough); this.root.add(this.hearthLogs);
      this.hearth.userData.flame.base = 5;
      this.root.add(this.hearth); this.flames.push(this.hearth);
    }
  }
  setHearth(k) {
    if (!this.hearth) return;
    this.hearth.scale.setScalar(0.3 + k * 0.8);
    this.hearth.userData.flame.base = 5 * k;
    this.hearth.visible = k > 0.02;
  }
  // the cabin rebuilt as a house, inside: whitewashed plaster between dark timbers, a boarded floor, a beam overhead
  setHomeTier(tier) {
    if (this.homeRemodel) { this.root.remove(this.homeRemodel); this.homeRemodel = null; }
    if (!this.cabinUp || (tier || 1) < 2) return;
    this.homeTier = tier;
    const b = new Builder(), PL = 0xe8e0cc, TB = 0x3e2a1a, FL = 0x8a6440;
    const box = (w, h, d, lx, y, lz, col) => { const [x, z] = this.cabinToWorld(lx, lz); b.box(w, h, d, x, y, z, col, CABIN.ry); };
    const H = 2.35, X = 2.28, Zb = -2.82, Zf = 2.82;
    // the floor: boards, lengthwise, a little apart
    for (let i = 0; i < 9; i++) box(0.5, 0.03, 5.5, -2.0 + i * 0.5, 0.02, 0, i % 2 ? FL : 0x7e5a38);
    // plaster on the side walls, and the back (round the hearth) and the front (round the door)
    box(0.04, H, 5.5, -X, H / 2, 0, PL); box(0.04, H, 5.5, X, H / 2, 0, PL);
    box(1.9, H, 0.04, 1.3, H / 2, Zb, PL); box(0.28, H, 0.04, -2.1, H / 2, Zb, PL); box(1.6, H - 1.3, 0.04, -1.2, 1.3 + (H - 1.3) / 2, Zb, PL);
    box(1.35, H, 0.04, -1.62, H / 2, Zf, PL); box(1.35, H, 0.04, 1.62, H / 2, Zf, PL);
    // the timbers: posts along the walls, a rail at the middle, a plate at the top, braces in the corners
    for (const lz of [-2.7, -1.35, 0, 1.35, 2.7]) for (const s of [-1, 1]) box(0.12, H, 0.12, s * (X - 0.05), H / 2, lz, TB);
    for (const s of [-1, 1]) { box(0.1, 0.12, 5.5, s * (X - 0.05), 1.15, 0, TB); box(0.12, 0.14, 5.6, s * (X - 0.05), H, 0, TB); }
    for (const lx of [-2.2, 0.35, 2.2]) box(0.12, H, 0.12, lx, H / 2, Zb + 0.05, TB);
    for (const lx of [-2.2, -1.0, 1.0, 2.2]) box(0.12, H, 0.12, lx, H / 2, Zf - 0.05, TB);
    box(4.6, 0.12, 0.1, 0, 1.15, Zf - 0.05, TB); box(4.6, 0.14, 0.12, 0, H, Zb + 0.05, TB); box(4.6, 0.14, 0.12, 0, H, Zf - 0.05, TB);
    // a tie-beam across, and a lantern hung from it
    box(4.6, 0.18, 0.18, 0, H + 0.05, 0, TB);
    box(0.02, 0.4, 0.02, 0.3, H - 0.2, 0, 0x2a2420); box(0.2, 0.26, 0.2, 0.3, H - 0.5, 0, 0xd9a24a);
    // the kitchen, along the wall beside the hearth: a brick range with an iron top and its fire in the front, a hood
    // up to the chimney, a work table with a board and a knife, a shelf of crocks, a pan on the wall, herbs drying
    const BR = 0x8a4a3a, IR = 0x2a2a2c, WD = 0x8a6440;
    box(0.55, 0.8, 1.05, -1.98, 0.4, -1.5, BR);
    for (const y of [0.2, 0.4, 0.6]) box(0.56, 0.015, 1.06, -1.98, y, -1.5, 0x6a3a2c);
    box(0.6, 0.045, 1.1, -1.98, 0.82, -1.5, IR);
    box(0.03, 0.3, 0.55, -1.7, 0.25, -1.5, 0x120a06);                          // the firebox mouth
    box(0.03, 0.05, 0.6, -1.69, 0.42, -1.5, IR);
    box(0.45, 0.85, 1.0, -2.04, 1.88, -1.5, PL); box(0.08, 0.08, 1.05, -1.8, 1.45, -1.5, TB);
    box(0.55, 0.06, 0.85, -1.98, 0.82, -0.45, WD);
    for (const [ax, az] of [[-1.75, -0.82], [-1.75, -0.08], [-2.2, -0.82], [-2.2, -0.08]]) box(0.06, 0.8, 0.06, ax, 0.4, az, 0x6a4a2e);
    box(0.5, 0.03, 0.8, -1.98, 0.2, -0.45, WD);
    box(0.3, 0.03, 0.4, -1.95, 0.865, -0.6, 0xb08a5a);                         // the board
    box(0.02, 0.012, 0.16, -1.88, 0.885, -0.62, 0xb8b8bc); box(0.025, 0.02, 0.08, -1.88, 0.885, -0.48, 0x3a2a1c);   // the knife
    box(0.24, 0.03, 0.85, -2.13, 1.5, -0.45, WD);                               // a shelf, and crocks on it
    for (const [cz, h, col] of [[-0.75, 0.16, 0xa07a50], [-0.55, 0.12, 0x6a5a48], [-0.32, 0.2, 0xb88a5a], [-0.12, 0.1, 0x8a6a4a]]) box(0.13, h, 0.13, -2.12, 1.515 + h / 2, cz, col);
    box(0.12, 0.12, 0.12, -1.98, 0.29, -0.6, 0x9a7a4a); box(0.14, 0.1, 0.14, -1.98, 0.27, -0.3, 0xc8a878);   // sacks and a crock below
    for (const cz of [-0.85, -0.6, -0.35, -0.1]) box(0.04, 0.2, 0.06, -2.22, 1.9, cz, 0x5a7a3a);              // herbs hung to dry
    box(0.02, 0.26, 0.26, -2.25, 1.15, -0.98, IR); box(0.02, 0.2, 0.03, -2.25, 1.38, -0.98, IR);               // a pan on its nail
    this.homeRemodel = b.build(MAT.rough);
    this.homeRemodel.position.y = this.cabinY + 0.07;
    this.root.add(this.homeRemodel);
    // a ceiling of boards over it: there's a loft above now
    const ceil = new Builder();
    for (let i = 0; i < 10; i++) { const [x, z] = this.cabinToWorld(-2.25 + i * 0.5, 0); ceil.box(0.48, 0.04, 5.7, x, 2.78, z, i % 2 ? 0x6a4a2e : 0x5e4028, CABIN.ry); }
    const cm = ceil.build(MAT.rough); this.homeRemodel.add(cm); cm.position.y = 0;
    if (this.homeLight) this.homeLight.distance = 9;
    this.makeKitchen();
    this.setHomeOutside(tier);
  }
  // and outside: the log cabin gives way to a house like the settlers' own — timber and plaster, two storeys, a tiled
  // roof — with the same doorway, so the door still swings
  setHomeOutside(tier) {
    if ((tier || 1) < 2 || this.homeOutside) return;
    ensureModel("home_2").then(ok => {
      if (!ok || this.homeOutside) return;
      const m = modelCopy("home_2"); if (!m) return;
      m.scene.position.set(CABIN.x, this.cabinY, CABIN.z); m.scene.rotation.y = CABIN.ry;
      for (const c of this.cabin.children) c.visible = false;
      this.cabin.add(m.scene); this.homeOutside = m.scene;
      const d = m.scene.getObjectByName("door");
      if (d) { this.doorNode = d; this.doorBase = d.rotation.y; d.rotation.y = this.doorBase + this.doorA * 1.5; }
    });
  }
  // Brambles round the clearing and along the road, heavy with blackberries: hold F to pick a handful. They fruit
  // again in a few days' time, and stand bare through the winter.
  // a bush or a clump of fern gone: its pieces shrunk to nothing where they stood
  hideShrub(q) {
    q.gone = true;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [m, n] of q.slots) { m.setMatrixAt(n, z); m.instanceMatrix.needsUpdate = true; }
  }
  // a stroke of the axe or a blade at a bush in front of you: down it comes, with a rustle and a scatter of leaves
  cutShrub(pl) {
    if (!this.shrubs) return false;
    const f = pl.forward();
    let best = null, bd = 1.9;
    for (const q of this.shrubs) {
      if (q.gone) continue;
      const dx = q.x - pl.pos.x, dz = q.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * f.x + dz * f.z) / (d || 1) > 0.35) { bd = d; best = q; }
    }
    if (!best) return false;
    this.hideShrub(best);
    AUDIO.whoosh && AUDIO.whoosh(0.3, false); window.SFX && window.SFX.chop && window.SFX.chop();
    leafBurst(this.root, best.x, best.y + 0.4, best.z, best.kind === "fern" ? 0x5a7a3a : 0x4a6a34);
    const cut = this.shrubs.filter(q => q.gone).map(q => q.id);
    G.saveCut && G.saveCut(cut);
    return true;
  }
  makeBerryBushes() {
    // (bare in the winter: the settlement's winter, or snow lying in a chapter that has no settlement to say so)
    const bare = () => !!(G.town && G.town.winter) || SNOW.value > 0.15;
    const r = rng(733), leafB = new Builder();
    this.bushes = [];
    for (let i = 0, tries = 0; i < 30 && tries < 400; tries++) {
      let x, z;
      if (r() < 0.6) { const a = r() * TAU, d = CLEARING.r + 3 + r() * 30; x = CLEARING.x + Math.cos(a) * d; z = CLEARING.z + Math.sin(a) * d; }
      else { const t = this.road[Math.floor(r() * this.road.length)], a = r() * TAU, d = 4 + r() * 10; x = t.x + Math.cos(a) * d; z = t.z + Math.sin(a) * d; }
      if (this.anyRoadDist(x, z).d < 3.2 || Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + 1) continue;
      const y = this.heightAt(x, z);
      if (this.col.solidAt(x, y + 0.5, z, 0.9) || this.bushes.some(b => Math.hypot(b.x - x, b.z - z) < 4)) continue;
      // the bramble: a low tangle of dark leaves
      for (let j = 0; j < 4; j++) leafB.add(TREE.blob, r.pick([0x2e4a24, 0x35522a, 0x3a5a2c]), x + r.range(-0.45, 0.45), y + 0.25 + r() * 0.2, z + r.range(-0.45, 0.45), 0, r() * 3, 0, r.range(0.45, 0.75), r.range(0.35, 0.55), r.range(0.45, 0.75), 0.08);
      // and the fruit on it: ripe black, a few still red
      const fb = new Builder();
      for (let j = 0; j < 16; j++) { const a = r() * TAU, d = 0.3 + r() * 0.45; fb.add(new THREE.IcosahedronGeometry(0.035, 0), r() < 0.8 ? 0x241030 : 0x9a2a2a, x + Math.cos(a) * d, y + 0.3 + r() * 0.45, z + Math.sin(a) * d, 0, 0, 0, 1, 1, 1, 0); }
      const fruit = fb.build(MAT.rough, { shadow: false }); this.root.add(fruit);
      const bush = { x, z, fruit, ripeAt: 0 };
      const ripe = () => G.time >= bush.ripeAt && !bare();
      bush.it = this.addInteract({ x, y: y + 0.6, z, reach: 2, hold: 1.4, anim: "sow",
        label: () => { fruit.visible = ripe(); return bare() ? "A bramble, bare for the winter" : ripe() ? "Pick blackberries" : "A bramble — picked clean; it'll fruit again in a few days"; },
        can: () => ripe(),
        use: () => {
          const n = 3 + Math.floor(Math.random() * 3), got = G.packAdd ? G.packAdd("blackberries", n, "Blackberries", "Picked off the brambles. A mouthful each — eat them (their number), or cook them into a dish.") : 0;
          if (!got) return;
          bush.ripeAt = G.time + 300 + Math.random() * 120; fruit.visible = false;
          UI.hint(`${got} blackberries${got < n ? " (your pack is full)" : ""}. Your fingers are purple.`, 2.5);
          window.SFX && window.SFX.pickup && window.SFX.pickup();
        } });
      this.bushes.push(bush); i++;
    }
    this.root.add(leafB.build(MAT.rough, { shadow: false }));
    // (the fruit comes back on its own time, and goes in the winter)
    this.bushTick = () => { const off = bare(); for (const b of this.bushes) b.fruit.visible = G.time >= b.ripeAt && !off; };
    G.onFrame.push(dt => { if (G.world === this && (this._bushT = (this._bushT || 0) - dt) <= 0) { this._bushT = 2; this.bushTick(); } });
  }
  makeKitchen() {
    for (const c of this.kitchenCols || []) this.col.remove(c);
    if (this.kitchenIt) this.removeInteract(this.kitchenIt);
    if (this.kitchen && this.kitchen.rig) this.root.remove(this.kitchen.rig.g);
    this.kitchenCols = []; this.kitchenIt = null; this.kitchen = null;
    // (the kitchen comes with the house: a cabin that hasn't been rebuilt has only its hearth)
    if ((this.homeTier || 1) < 2) return;
    const y0 = this.cabinY + 0.07, at = (lx, y, lz) => { const [x, z] = this.cabinToWorld(lx, lz); return new THREE.Vector3(x, y0 + y, z); };
    const top = this.cabinY + 0.9;
    this.kitchenCols = [[-1.98, -1.78, 0.32], [-1.98, -1.22, 0.32], [-1.98, -0.7, 0.3], [-1.98, -0.2, 0.3]].map(([lx, lz, r]) => { const [x, z] = this.cabinToWorld(lx, lz); return this.col.addCircle(x, z, r, top); });
    const [sx, sz] = this.cabinToWorld(-0.95, -1.5), [tx, tz] = this.cabinToWorld(-1.98, -1.5);
    this.kitchen = { at, ry: CABIN.ry, stand: [sx, sz], yaw: Math.atan2(-(tx - sx), -(tz - sz)),
      pot: [-1.98, 0.85, -1.78], pan: [-1.98, 0.85, -1.22], plate: [-1.93, 0.87, -0.22], embers: [-1.8, 0.14, -1.5] };
    this.kitchenIt = this.addInteract({ x: tx, y: this.cabinY + 1.0, z: tz, reach: 1.9, label: "Cook at the kitchen",
      can: () => !!G.openKitchen && !(G.cooking && G.cooking()), use: () => G.openKitchen() });
  }
  // what stands in the cabin: [{type, lx, lz, ry}]; null for the pallets they started with
  setFurniture(list) {
    this.furniture = list || DEFAULT_HOME();
    // every cabin has its chest, even one furnished before there was such a thing
    if (!this.furniture.some(f => f.type === "chest")) this.furniture = [...this.furniture, { ...DEFAULT_CHEST }];
    if (this.furnGroup) this.root.remove(this.furnGroup);
    for (const c of this.furnCols || []) this.col.remove(c);
    for (const it of this.bedIts || []) this.removeInteract(it);
    this.furnCols = []; this.bedIts = [];
    const b = new Builder();
    for (const f of this.furniture) {
      const d = FURNITURE[f.type]; if (!d) continue;
      const [x, z] = this.cabinToWorld(f.lx, f.lz), ry = CABIN.ry + f.ry;
      d.build(b, x, z, ry);
      // solid along its length, as a row of posts
      const lng = Math.max(d.w, d.d), sh = Math.min(d.w, d.d), n = Math.max(1, Math.round(lng / sh));
      const along = d.w >= d.d ? [Math.cos(ry), -Math.sin(ry)] : [Math.sin(ry), Math.cos(ry)];
      for (let i = 0; i < n; i++) {
        const o = (i + 0.5) / n * lng - lng / 2;
        this.furnCols.push(this.col.addCircle(x + along[0] * o, z + along[1] * o, sh / 2 * 0.9, this.cabinY + d.h));
      }
      if (f.type === "chest") this.bedIts.push(this.addInteract({ x, y: this.cabinY + 0.6, z, reach: 2, label: "Open the chest", use: () => G.openChest && G.openChest() }));
      if (d.bed) this.bedIts.push(this.addInteract({ x, y: this.cabinY + 0.5, z, reach: 2.2, label: () => (this.onSleep && this.onSleep.label) || "Go to bed",
        can: () => !!this.onSleep && (!this.onSleep.can || this.onSleep.can()), use: () => this.onSleep.use(f) }));
    }
    this.furnGroup = b.build(MAT.rough);
    this.furnGroup.position.y = this.cabinY + 0.07;
    this.root.add(this.furnGroup);
  }
  // the bed nearest a spot, in world coordinates, and how it lies
  bedSpot(i = 0) {
    const beds = this.furniture.filter(f => FURNITURE[f.type] && FURNITURE[f.type].bed);
    const f = beds[i % Math.max(1, beds.length)]; if (!f) return null;
    const [x, z] = this.cabinToWorld(f.lx, f.lz);
    return { x, z, ry: CABIN.ry + f.ry, y: this.cabinY + 0.07 + FURNITURE[f.type].h * 0.55 };
  }
  update(dt) {
    this.tickRocks(dt);
    if (this.dirtyGround) this.reshapeGround();
    // tiles of forest past the haze are not drawn at all
    if ((this.tileT = (this.tileT || 0) - dt) <= 0 && this.forestTiles && G.player) {
      this.tileT = 0.4;
      const p = G.player.pos, far = (G.scene && G.scene.fog && G.scene.fog.far ? G.scene.fog.far : 220) + 70;
      // near: every facet, and shadows; further: the plainer trees; past the haze: nothing
      for (const t of this.forestTiles) { const d = Math.hypot(t.x - p.x, t.z - p.z); t.g.visible = d < 95; t.gf.visible = d >= 95 && d < far; }
    }
    this.regrowTick(dt);
    this.t += dt;
    // the door swings to where it was sent; the lamp is lit while you are in
    if (this.doorNode) {
      this.doorA += ((this.doorOpen ? 1 : 0) - this.doorA) * Math.min(1, dt * 4);
      this.doorNode.rotation.y = this.doorBase + this.doorA * 1.5;
    }
    if (this.homeLight) {
      const want = this.insideCabin(G.player.pos.x, G.player.pos.z) ? 2.2 : 0;
      this.homeLight.intensity += (want - this.homeLight.intensity) * Math.min(1, dt * 3);
    }
    // nor does it fall there
    if (this.flakes) this.flakes.visible = this.flakeFall > 0 && !this.insideCabin(G.player.pos.x, G.player.pos.z);
    if (this.flakes && this.flakes.visible) {
      const p = this.flakes.geometry.attributes.position, c = G.player.pos, sp = 2 + this.flakeFall * 5;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i) + Math.sin(this.t * 0.7 + i) * dt * (0.3 + this.flakeFall * 2.5) + this.flakeFall * dt * 3, y = p.getY(i) - dt * sp, z = p.getZ(i);
        if (y < 0) y += 30;
        if (x - c.x > 30) x -= 60; else if (x - c.x < -30) x += 60;
        if (z - c.z > 30) z -= 60; else if (z - c.z < -30) z += 60;
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
      this.flakes.position.y = c.y - 4;
    }
    if (this.burner) for (const m of this.burner.smoke) {
      const u = (m.userData.t = (m.userData.t + dt * 0.06) % 1), k = this.burner.kiln;
      m.position.set(k.x + Math.sin(u * 9 + this.t * 0.3) * u * 1.4 + u * 3, k.y + u * 14, k.z + Math.cos(u * 7) * u * 1.2);
      m.scale.setScalar(1.0 + u * 5.5); m.material.opacity = 0.32 * (1 - u) * Math.min(1, u * 8);
    }
    // the clamp's vents and the fire's embers, breathing
    if (this.burnerGlow) this.burnerGlow.forEach((g, i) => g.material.color.setRGB(1, 0.32 + 0.12 * Math.sin(this.t * 2.3 + i * 1.7), 0.08 + 0.04 * Math.sin(this.t * 3.1 + i)));
    for (const t of this.fellable) {
      if (t.state === "falling" || t.state === "settle") {
        // every tree its own fall: a tall one slower, a birch quicker; a twist as it goes, a roll to one side,
        // where it comes to rest, and a little bounce when it hits the ground
        const F = t.fx || (t.fx = fallOf(t));
        if (t.state === "falling") {
          t.fall = Math.min(1, t.fall + dt * (0.25 + t.fall * 2.2) * F.speed);
          if (t.fall >= 1) { t.state = "settle"; t.settle = 0; t.onDown && t.onDown(); }
        } else if ((t.settle += dt * 2.2) >= 1) t.state = "down";
        const bounce = t.state === "settle" ? Math.sin(Math.min(1, t.settle) * Math.PI) * F.bounce * (1 - Math.min(1, t.settle)) : 0;
        const k = t.fall * t.fall, a = k * F.rest - bounce;
        t.g.rotation.set(0, 0, 0);
        t.g.rotateOnWorldAxis(t.axis, a);
        t.g.rotateOnWorldAxis(UP_AXIS, F.twist * k);
        if (F.roll) t.g.rotateOnWorldAxis(t.dir ? new THREE.Vector3(t.dir.x, 0, t.dir.z) : UP_AXIS, F.roll * k);
      } else if (t.state === "shake") {
        t.shake -= dt;
        t.g.rotation.z = Math.sin(t.shake * 60) * 0.01 * Math.max(0, t.shake) * 8;
        if (t.shake <= 0) { t.state = "up"; t.g.rotation.z = 0; }
      }
    }
  }
}
// leaves thrown up as a bush comes down, falling and fading
function leafBurst(root, x, y, z, color) {
  const geo = new THREE.PlaneGeometry(0.09, 0.06), m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true });
  const bits = [];
  for (let i = 0; i < 16; i++) { const b = new THREE.Mesh(geo, m); b.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6); b.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2); b.rotation.set(Math.random() * 3, Math.random() * 3, 0); root.add(b); bits.push(b); }
  let t = 0;
  const tick = dt => {
    t += dt;
    for (const b of bits) { b.userData.v.y -= 4 * dt; b.userData.v.multiplyScalar(Math.pow(0.4, dt)); b.position.addScaledVector(b.userData.v, dt); b.rotation.x += dt * 4; b.rotation.y += dt * 3; }
    m.opacity = Math.max(0, 1 - t / 1.6);
    if (t > 1.6) { for (const b of bits) root.remove(b); geo.dispose(); m.dispose(); const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); }
  };
  G.onFrame.push(tick);
}
export { STACK, BLOCK, FIRE };
const UP_AXIS = new THREE.Vector3(0, 1, 0);
// how a tree falls, from where it stands (the same tree always falls the same way)
function fallOf(t) {
  const h = (x => x - Math.floor(x))(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453), h2 = (x => x - Math.floor(x))(Math.sin(t.x * 39.3468 + t.z * 11.135) * 24634.634);
  const kind = t.src && t.src.kind, tall = Math.max(5, t.h || 9);
  return {
    speed: (0.8 + h * 0.45) * Math.pow(9 / tall, 0.35) * (kind === "birch" ? 1.2 : 1),
    rest: Math.PI / 2 - 0.05 - h2 * 0.16,
    twist: (h - 0.5) * 0.7,
    roll: (h2 - 0.5) * 0.25,
    bounce: 0.035 + h * 0.05,
  };
}
void prismGeo;
