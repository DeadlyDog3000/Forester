// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A MULTIPLAYER MAP, DRAWN. The land comes from terrain.js (the same for everyone, from the seed); this draws the
// part of it round you, a piece at a time as you walk, and lets go of what falls far behind — so the wide world, six
// kilometres across, costs no more to walk than a small island. What people have done to it (trees down, rocks
// broken, things built) is told by the server and laid over the top.

import { THREE, Collision, addDetail, MAT, makeFlame, clamp, Builder, noSnow, mat } from "../core.js";
import { G, WorldBase } from "../engine.js";
import { forestInstances, modelCopy, ensureModel, makeSpruce, SWAY } from "../models.js";
import { Woods } from "../woods.js";
import { fillPaper, tree as mapTree, INK, TOWN, label } from "../map.js";
import { makeTerrain, CHUNK, WATER } from "./terrain.js";
import { BUILD } from "./rules.js";

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SEG = 24;                                  // ground facets along a piece's side (four metres each)
const PAL = {
  grass: new THREE.Color(0x6c7f38), meadow: new THREE.Color(0x7d8c44), litter: new THREE.Color(0x53463a), moss: new THREE.Color(0x4a5d2a),
  earth: new THREE.Color(0x3d3126), dry: new THREE.Color(0x8c8248), stone: new THREE.Color(0x6e6b62), sand: new THREE.Color(0xb8a77a),
  wetSand: new THREE.Color(0x8a7a58), bed: new THREE.Color(0x5e5640), snow: new THREE.Color(0xe8ecf0), rock: new THREE.Color(0x7a7870),
};
// (the same small hash as the ground's grain everywhere else)
const hash = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };

let rockGeo = null;
function rockShape() {
  if (rockGeo) return rockGeo;
  const g = new THREE.DodecahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.8 + hash(p.getX(i) * 3.1, p.getZ(i) * 2.7 + p.getY(i)) * 0.35; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.72, p.getZ(i) * k); }
  g.computeVertexNormals(); g._shared = true;
  return rockGeo = g;
}

export class Wilds extends WorldBase {
  // info: {seed, half, kind}
  constructor(info) {
    super(Collision);
    this.col = new Collision(6);
    this.name = "mp";
    this.noFog = true;                           // (the whole map is known: no parchment over the unseen)
    this.land = makeTerrain(info.seed, info.half, info.kind);
    this.half = info.half; this.kind = info.kind;
    this.chunks = new Map();
    this.felled = new Set(); this.broken = new Set();
    this.blds = new Map();                       // building id → {b, g, cols, it}
    this.falling = [];
    this.stumps = new Map();
    this.snowLine = this.land.big ? 62 : 48;
    this.mat = addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), { scale: 1, amount: 0.06, grain: 0.15, surface: "none" });
    this.rockMat = addDetail(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), { scale: 2, amount: 0.25, grain: 0.6, surface: "stone" });
    // the sea and the lakes: one sheet of water at one level, following you about under the haze
    const wg = new THREE.PlaneGeometry(1600, 1600, 1, 1); wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x3d5f6e, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.86 }));
    this.water.position.y = WATER - 0.05; this.water.receiveShadow = true; noSnow(this.water);
    this.root.add(this.water);
    this.t = 0;
    this.buildNear(0, 0, 0);
  }
  // ---- the ground ----
  heightAt(x, z) { return this.land.heightAt(x, z); }
  // where your feet are: the ground, or out of your depth, swimming with your head above the water; or up a tower
  floorAt(x, z, y) {
    const g = this.land.heightAt(x, z);
    for (const t of this.towers || []) if (Math.abs(x - t.x) < 1.5 && Math.abs(z - t.z) < 1.5 && y > t.top - 0.6) return t.top;
    return Math.max(g, WATER - 1.3);
  }
  waterDepth(x, z) { return Math.max(0, WATER - this.land.heightAt(x, z)); }
  surfaceAt(x, z) {
    const h = this.land.heightAt(x, z);
    if (h < WATER) return "water";
    if (h < WATER + 1.4) return "dirt";
    if (h > this.snowLine) return "snow";
    return this.land.forestAt(x, z) > 0.5 ? "leaves" : "grass";
  }
  // where grass grows (for grass.js): thick in the open, thin under the trees, none on sand, rock or snow
  grassAt(x, z) {
    const h = this.land.heightAt(x, z);
    if (h < WATER + 1.5 || h > this.snowLine - 6) return 0;
    if (this.land.slopeAt(x, z) > 0.5) return 0;
    const f = this.land.forestAt(x, z);
    return f > 0.55 ? 0.12 : (1 - f) * 0.95;
  }
  groundColour(x, z, c = new THREE.Color()) { return this.colourAt(x, z, this.land.heightAt(x, z), 0, c); }
  get season() { return "summer"; }
  // what stands on the ground, as turned rectangles (no grass inside them)
  grassRects(cx, cz, r) {
    const out = [];
    for (const e of this.blds.values()) {
      const b = e.b, d = BUILD[b.type]; if (!d || Math.hypot(b.x - cx, b.z - cz) > r) continue;
      const hw = d.wall ? d.len / 2 : (d.w || d.r * 1.6) / 2 + 0.3, hd = d.wall ? 0.4 : (d.d || d.r * 1.6) / 2 + 0.3;
      out.push([b.x, b.z, Math.cos(b.ry || 0), Math.sin(b.ry || 0), hw, hd]);
    }
    return out;
  }
  // the edge of the map: the sea runs out to it, and there you stop
  constrain(p) { const L = this.half - 4; p.x = clamp(p.x, -L, L); p.z = clamp(p.z, -L, L); }
  colourAt(x, z, h, steep, c) {
    const L = this.land;
    if (h < WATER - 0.3) return c.copy(PAL.bed).lerp(PAL.sand, clamp((h + 3) / 3, 0, 1) * 0.6);
    if (h < WATER + 1.4) return c.copy(PAL.sand).lerp(PAL.wetSand, clamp((WATER + 0.4 - h) / 0.8, 0, 1));
    const f = L.forestAt(x, z), dry = hash(Math.floor(x / 9), Math.floor(z / 9));
    c.copy(PAL.meadow).lerp(PAL.grass, 0.5 + (dry - 0.5) * 0.6);
    if (dry > 0.82) c.lerp(PAL.dry, 0.45);
    // under the trees: needle litter and moss
    if (f > 0.35) c.lerp(PAL.litter, clamp((f - 0.35) * 2.2, 0, 0.85)).lerp(PAL.moss, hash(x * 0.05, z * 0.05) > 0.6 ? 0.35 : 0);
    if (h < WATER + 2.4) c.lerp(PAL.sand, clamp((WATER + 2.4 - h) / 1, 0, 1) * 0.5);
    if (steep > 0.16) c.lerp(PAL.stone, clamp((steep - 0.16) * 4, 0, 0.9));
    if (h > this.snowLine - 6) c.lerp(PAL.snow, clamp((h - this.snowLine + 6) / 8, 0, 1) * (steep > 0.45 ? 0.4 : 1));
    return c;
  }
  // ---- the pieces of the map round you ----
  key(ci, cj) { return ci + "," + cj; }
  buildChunk(ci, cj) {
    const L = this.land, x0 = ci * CHUNK, z0 = cj * CHUNK, g = new THREE.Group();
    // the ground: one sheet of flat facets, each its own colour
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG); geo.rotateX(-Math.PI / 2); geo.translate(x0 + CHUNK / 2, 0, z0 + CHUNK / 2);
    const p0 = geo.attributes.position;
    for (let i = 0; i < p0.count; i++) p0.setY(i, L.heightAt(p0.getX(i), p0.getZ(i)));
    const ng = geo.toNonIndexed(); geo.dispose();
    const pos = ng.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let t = 0; t < pos.count; t += 3) {
      const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3, h = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      const ax = pos.getX(t + 1) - pos.getX(t), ay = pos.getY(t + 1) - pos.getY(t), az = pos.getZ(t + 1) - pos.getZ(t);
      const bx = pos.getX(t + 2) - pos.getX(t), by = pos.getY(t + 2) - pos.getY(t), bz = pos.getZ(t + 2) - pos.getZ(t);
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, steep = 1 - Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
      this.colourAt(x, z, h, steep, c);
      c.multiplyScalar(0.9 + hash(x * 0.37, z * 0.53) * 0.2);
      for (let k = 0; k < 3; k++) { cols[(t + k) * 3] = c.r; cols[(t + k) * 3 + 1] = c.g; cols[(t + k) * 3 + 2] = c.b; }
    }
    ng.setAttribute("color", new THREE.BufferAttribute(cols, 3)); ng.computeVertexNormals();
    const ground = new THREE.Mesh(ng, this.mat); ground.receiveShadow = true; g.add(ground);
    // the trees: near (every facet, shadows) and far (plainer), switched by distance as in the old woods
    const trees = L.chunkTrees(ci, cj);
    const near = new THREE.Group(), far = new THREE.Group();
    for (const m of forestInstances(trees)) near.add(m);
    for (const m of forestInstances(trees, true)) far.add(m);
    g.add(near, far); far.visible = false;
    const cols2 = [];
    for (const t of trees) {
      t.col = this.col.addCircle(t.x, t.z, t.kind === "birch" ? 0.22 : 0.32, 12); cols2.push(t.col);
      if (this.felled.has(t.id)) this.hideTree(t, true);
    }
    // the rocks
    const rocks = L.chunkRocks(ci, cj);
    let rm = null;
    if (rocks.length) {
      rm = new THREE.InstancedMesh(rockShape(), this.rockMat, rocks.length);
      const d = new THREE.Object3D(), rc = new THREE.Color();
      rocks.forEach((k, i) => {
        d.position.set(k.x, k.y - 0.25 * k.s, k.z); d.rotation.set(0, k.rot, 0); d.scale.setScalar(k.s); d.updateMatrix();
        rm.setMatrixAt(i, d.matrix); rm.setColorAt(i, rc.copy(PAL.rock).offsetHSL(0, 0, (hash(k.x, k.z) - 0.5) * 0.08));
        k.slot = [rm, i]; k.m = d.matrix.clone();
        k.col = this.col.addCircle(k.x, k.z, k.s * 0.85, k.y + k.s * 0.6); cols2.push(k.col);
        if (this.broken.has(k.id)) this.hideRock(k, true);
      });
      rm.castShadow = true; rm.receiveShadow = true; rm.instanceMatrix.needsUpdate = true; rm.computeBoundingSphere();
      g.add(rm);
    }
    this.root.add(g);
    const ch = { ci, cj, g, near, far, trees, rocks, cols: cols2, x: x0 + CHUNK / 2, z: z0 + CHUNK / 2, byId: new Map(trees.map(t => [t.id, t]).concat(rocks.map(k => [k.id, k]))) };
    this.chunks.set(this.key(ci, cj), ch);
    return ch;
  }
  dropChunk(ch) {
    this.root.remove(ch.g);
    ch.g.traverse(o => { if (o.geometry && !o.geometry._shared) o.geometry.dispose(); });
    for (const c of ch.cols) this.col.remove(c);
    this.chunks.delete(this.key(ch.ci, ch.cj));
  }
  // what's wanted round a point: everything to the edge of the haze and a bit; built nearest first, a few a frame
  buildNear(x, z, budget = 3) {
    const far = (G.scene && G.scene.fog ? G.scene.fog.far : 260) + 90, n = Math.ceil(far / CHUNK);
    const ci0 = Math.floor(x / CHUNK), cj0 = Math.floor(z / CHUNK), lim = Math.ceil(this.half / CHUNK) + 1;
    const want = [];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const ci = ci0 + i, cj = cj0 + j;
      if (Math.abs(ci) > lim || Math.abs(cj) > lim) continue;
      const cx = (ci + 0.5) * CHUNK, cz = (cj + 0.5) * CHUNK, e = Math.hypot(Math.max(0, Math.abs(cx - x) - CHUNK / 2), Math.max(0, Math.abs(cz - z) - CHUNK / 2));
      if (e > far) continue;
      if (!this.chunks.has(this.key(ci, cj))) want.push([e, ci, cj]);
    }
    want.sort((a, b) => a[0] - b[0]);
    // (the very nearest always at once, whatever the budget: you never stand on nothing)
    let built = 0;
    for (const [e, ci, cj] of want) { if (built >= budget && e > CHUNK * 0.75) break; this.buildChunk(ci, cj); built++; }
    for (const ch of [...this.chunks.values()]) if (Math.hypot(Math.max(0, Math.abs(ch.x - x) - CHUNK / 2), Math.max(0, Math.abs(ch.z - z) - CHUNK / 2)) > far + 140) this.dropChunk(ch);
    return want.length - built;
  }
  // ---- trees and rocks: found, felled, broken, grown back ----
  chunkAt(x, z) { return this.chunks.get(this.key(Math.floor(x / CHUNK), Math.floor(z / CHUNK))); }
  thing(id) {
    const t = id[0] === "r" ? this.land.rockById(id) : this.land.treeById(id); if (!t) return null;
    const ch = this.chunkAt(t.x, t.z);
    return (ch && ch.byId.get(id)) || t;
  }
  hideTree(t, quiet) {
    for (const [m, i] of t.slots || []) { m.setMatrixAt(i, ZERO); m.instanceMatrix.needsUpdate = true; }
    if (t.col) t.col.disabled = true;
    t.gone = true;
    if (!quiet || !this.stumps.has(t.id)) this.addStump(t);
  }
  addStump(t) {
    if (this.stumps.has(t.id)) return;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * (t.h / 10) + 0.1, 0.18 * (t.h / 10) + 0.12, 0.42, 8), mat(0x5a4030, { surface: "wood" }));
    s.position.set(t.x, t.y + 0.15, t.z); s.castShadow = true; this.root.add(s); this.stumps.set(t.id, s);
  }
  showTree(id) {
    const t = this.thing(id); this.felled.delete(id);
    const s = this.stumps.get(id); if (s) { this.root.remove(s); s.geometry.dispose(); this.stumps.delete(id); }
    if (!t || !t.slots) return;
    // (put back as it was: the chunk is built afresh, the cheapest way to have every piece of it right)
    const ch = this.chunkAt(t.x, t.z); if (ch) { this.dropChunk(ch); this.buildChunk(ch.ci, ch.cj); }
  }
  hideRock(k) { const [m, i] = k.slot || []; if (m) { m.setMatrixAt(i, ZERO); m.instanceMatrix.needsUpdate = true; } if (k.col) k.col.disabled = true; k.gone = true; }
  showRock(id) { this.broken.delete(id); const k = this.thing(id); if (k && k.slot) { k.slot[0].setMatrixAt(k.slot[1], k.m); k.slot[0].instanceMatrix.needsUpdate = true; k.gone = false; if (k.col) k.col.disabled = false; } }
  setFelled(ids) { for (const id of ids) { this.felled.add(id); const t = this.thing(id); if (t && t.slots) this.hideTree(t, true); } }
  setBroken(ids) { for (const id of ids) { this.broken.add(id); const k = this.thing(id); if (k && k.slot) this.hideRock(k); } }
  // a tree comes down, away from whoever felled it
  fell(id, dx, dz) {
    this.felled.add(id);
    const t = this.thing(id); if (!t) return;
    let g = t.slots ? Woods.prototype.pieces.call(this, t) : null;
    if (!g) { const m = modelCopy(t.kind) || modelCopy("spruce"); if (m) { g = new THREE.Group(); m.scene.scale.setScalar(t.h / 10); m.scene.rotation.y = t.rot; g.add(m.scene); } else g = makeSpruce(t.h, Math.floor(t.x * 7)); }
    g.position.set(t.x, t.y - 0.1, t.z); this.root.add(g);
    if (t.slots) this.hideTree(t); else this.addStump(t);
    const l = Math.hypot(dx, dz) || 1;
    const k = 1.5 * 9.8 / Math.max(5, t.h) * (t.kind === "birch" ? 1.25 : 1);
    this.falling.push({ g, t, axis: new THREE.Vector3(dz / l, 0, -dx / l), a: 0.03, w: 0, k, rest: Math.PI / 2 - 0.08, down: false, life: 0, dir: { x: dx / l, z: dz / l } });
    return t;
  }
  // ---- what is built ----
  addBuilding(b, mine, friendly) {
    if (this.blds.has(b.id)) return;
    const d = BUILD[b.type]; if (!d) return;
    // level on the slope: set at the high side of its footing, with a stone footing down to the low side
    const fw = d.wall ? d.len : d.w || d.r * 1.5, fd = d.wall ? 0.5 : d.d || d.r * 1.5, c0 = Math.cos(b.ry || 0), s0 = Math.sin(b.ry || 0);
    let lo = Infinity, hi = -Infinity;
    for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0]]) { const h = this.land.heightAt(b.x + u * fw * c0 + v * fd * s0, b.z - u * fw * s0 + v * fd * c0); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const y = d.wall || b.type === "hearth" ? lo + 0.05 : hi, g = new THREE.Group(), cols = [];
    g.position.set(b.x, y, b.z); g.rotation.y = b.ry || 0;
    if (!d.wall && b.type !== "hearth" && hi - lo > 0.12) {
      const ft = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.25, hi - lo + 0.5, fd + 0.25), mat(0x6e675c, { surface: "stone" }));
      ft.position.y = -(hi - lo + 0.5) / 2 + 0.06; ft.receiveShadow = true; g.add(ft);
    }
    const rect = (w, dd, h = 4) => { const sw = Math.abs(Math.sin(b.ry || 0)) > 0.5; cols.push(this.col.addRect(b.x, b.z, sw ? dd : w, sw ? w : dd, y + h)); };
    if (d.model) {
      const put = () => { const m = modelCopy(d.model); if (m) { g.add(m.scene); return true; } return false; };
      if (!put()) {
        // (a stand-in until the model's there: a plain block of the right size)
        const ph = new THREE.Mesh(new THREE.BoxGeometry(d.w || 4, 2.6, d.d || 4), mat(0x7a5a3a)); ph.position.y = 1.3; g.add(ph);
        ensureModel(d.model).then(ok => { if (ok && this.blds.has(b.id)) { g.remove(ph); put(); } });
      }
      rect((d.w || 4) * 0.9, (d.d || 4) * 0.9, 5);
    } else if (b.type === "hearth") {
      const bl = new Builder();
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; bl.add(new THREE.DodecahedronGeometry(0.2, 0), 0x6e6b62, Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62, i, i * 2, 0, 1.1, 0.8, 1.0, 0.1); }
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI + 0.3; bl.add(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6), 0x5a4030, Math.cos(a) * 0.12, 0.15, Math.sin(a) * 0.12, Math.PI / 2 - 0.25, a, 0); }
      g.add(bl.build(MAT.rough));
      const light = new THREE.PointLight(0xff8a3a, 1.6, 14, 1.6);
      const f = makeFlame(1.3, light); f.position.y = 0.12; g.add(f); this.flames.push(f);
      // the banner: the owner's own colour on a pole, so a homestead is known by it
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x4a3626 })); pole.position.set(1.6, 1.6, 0); g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: b.colour || 0x7a2a22, side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(2.06, 2.85, 0); g.add(flag);
      g.userData.flag = flag; g.userData.flame = f;
      cols.push(this.col.addCircle(b.x, b.z, 0.75, y + 0.6));
    } else if (d.wall) {
      // sharpened stakes, side by side, along the length (a gate: two stout posts and a door between them)
      const bl = new Builder(), n = 10, L = d.len;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * L / n;
        if (d.gate && i > 2 && i < 7) continue;
        const h = 2.4 + hash(b.x + i, b.z) * 0.4;
        bl.add(new THREE.CylinderGeometry(0.17, 0.19, h, 6), 0x6a4e34, x, h / 2, 0, 0, i, 0);
        bl.add(new THREE.ConeGeometry(0.17, 0.4, 6), 0x7a5a3a, x, h + 0.2, 0, 0, i, 0);
      }
      bl.box(L, 0.16, 0.12, 0, 0.6, 0.18, 0x5a4030); bl.box(L, 0.16, 0.12, 0, 1.9, 0.18, 0x5a4030);
      if (d.gate) { bl.box(0.32, 3.2, 0.32, -0.8, 1.6, 0, 0x4e3a28); bl.box(0.32, 3.2, 0.32, 0.8, 1.6, 0, 0x4e3a28); bl.box(1.9, 0.25, 0.3, 0, 3.0, 0, 0x4e3a28); }
      g.add(bl.build(MAT.rough));
      if (d.gate) {
        const door = new THREE.Group(), db = new Builder();
        for (let i = 0; i < 4; i++) db.box(0.36, 2.2, 0.1, 0.2 + i * 0.37, 1.15, 0, 0x7a5a3a);
        db.box(1.5, 0.12, 0.06, 0.75, 0.6, 0.07, 0x4e3a28); db.box(1.5, 0.12, 0.06, 0.75, 1.7, 0.07, 0x4e3a28);
        door.add(db.build(MAT.rough)); door.position.x = -0.75; g.add(door); g.userData.door = door; g.userData.doorA = 0;
      }
      // (along its line, a row of posts to bump into; a gate's middle only shuts out those it isn't yours to open)
      const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
      for (let i = 0; i <= 8; i++) {
        const u = -L / 2 + i * L / 8;
        const mid = d.gate && Math.abs(u) < 0.8;
        if (mid && friendly) continue;
        const o = this.col.addCircle(b.x + u * c, b.z - u * s, 0.3, y + 2.6); cols.push(o);
        if (mid) o.gateDoor = true;
      }
    } else if (b.type === "tower") {
      const bl = new Builder(), H = 5.2;
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bl.add(new THREE.CylinderGeometry(0.14, 0.17, H + 1.4, 6), 0x5a4030, x, (H + 1.4) / 2, z);
      bl.box(2.6, 0.18, 2.6, 0, H, 0, 0x7a5a3a);
      for (const [x, z, w, dd] of [[0, -1.25, 2.6, 0.1], [0, 1.25, 2.6, 0.1], [-1.25, 0, 0.1, 2.6], [1.25, 0, 0.1, 2.6]]) bl.box(w, 0.9, dd, x, H + 0.55, z, 0x6a4e34);
      for (let i = 0; i < 8; i++) bl.box(0.6, 0.07, 0.07, 0, 0.5 + i * 0.62, 1.32, 0x6a4e34);
      bl.box(0.07, H, 0.07, -0.3, H / 2, 1.32, 0x5a4030); bl.box(0.07, H, 0.07, 0.3, H / 2, 1.32, 0x5a4030);
      bl.add(new THREE.ConeGeometry(2.1, 1.2, 4), 0x5a4a3a, 0, H + 2.0, 0, 0, Math.PI / 4, 0);
      g.add(bl.build(MAT.rough));
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0); cols.push(this.col.addCircle(b.x + x * c + z * s, b.z - x * s + z * c, 0.22, y + H + 1.4)); }
      (this.towers ??= []).push({ id: b.id, x: b.x, z: b.z, top: y + H + 0.09 });
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(g);
    const e = { b, g, cols, hp: b.hp, shake: 0 };
    this.blds.set(b.id, e);
    return e;
  }
  // a gate: shut against those it isn't theirs to open (told again when alliances change)
  setGateFriendly(id, friendly) {
    const e = this.blds.get(id); if (!e) return;
    for (const o of e.cols) if (o.gateDoor) o.disabled = !!friendly;
    e.friendly = friendly;
    if (friendly && !e.cols.some(o => o.gateDoor)) return;
  }
  removeBuilding(id) {
    const e = this.blds.get(id); if (!e) return null;
    this.blds.delete(id);
    for (const c of e.cols) this.col.remove(c);
    if (this.towers) this.towers = this.towers.filter(t => t.id !== id);
    if (e.g.userData.flame) { const i = this.flames.indexOf(e.g.userData.flame); if (i >= 0) this.flames.splice(i, 1); }
    // it comes down: sinks and tips over in a moment, then is gone
    this.falling.push({ g: e.g, collapse: true, life: 0, tip: (hash(e.b.x, e.b.z) - 0.5) * 0.6 });
    return e;
  }
  hitBuilding(id, hp) { const e = this.blds.get(id); if (!e) return; e.hp = hp; e.shake = 0.3; }
  // ---- every frame ----
  update(dt) {
    this.t += dt;
    SWAY.t.value += dt;
    const p = G.player ? G.player.pos : { x: 0, z: 0 };
    this.water.position.x = Math.round(p.x / 50) * 50; this.water.position.z = Math.round(p.z / 50) * 50;
    if ((this.streamT = (this.streamT || 0) - dt) <= 0) { this.streamT = 0.25; this.buildNear(p.x, p.z, 1); }
    // near trees in full, the rest plainer, past the haze nothing
    if ((this.tileT = (this.tileT || 0) - dt) <= 0) {
      this.tileT = 0.4;
      const far = (G.scene && G.scene.fog ? G.scene.fog.far : 220) + 70, nearR = G.treeNear ?? 55;
      for (const ch of this.chunks.values()) {
        const d = Math.hypot(ch.x - p.x, ch.z - p.z), e = Math.hypot(Math.max(0, Math.abs(ch.x - p.x) - CHUNK / 2), Math.max(0, Math.abs(ch.z - p.z) - CHUNK / 2));
        ch.near.visible = e <= nearR; ch.far.visible = e > nearR && d < far + CHUNK;
      }
    }
    // trees coming down, and buildings
    for (const f of this.falling.slice()) {
      f.life += dt;
      if (f.collapse) {
        const k = Math.min(1, f.life / 1.6);
        f.g.position.y -= dt * 1.4 * k; f.g.rotation.z = f.tip * k; f.g.rotation.x = f.tip * 0.5 * k;
        if (f.life > 2.2) { this.root.remove(f.g); f.g.traverse(o => { if (o.geometry && !o.geometry._shared) o.geometry.dispose(); }); this.falling.splice(this.falling.indexOf(f), 1); }
        continue;
      }
      if (!f.down) {
        f.w += f.k * Math.sin(f.a + 0.05) * dt; f.a += f.w * dt;
        if (f.a >= f.rest) {
          f.a = f.rest; f.w = -f.w * 0.18;
          if (Math.abs(f.w) < 0.12) { f.down = true; f.downT = f.life; }
          if (!f.thud) { f.thud = true; f.onDown && f.onDown(f); }
        }
        f.g.quaternion.setFromAxisAngle(f.axis, f.a);
      } else if (f.life - f.downT > 1.6) {
        // (the trunk lies a moment, then it's logs on someone's stack: gone)
        f.g.position.y -= dt * 0.8;
        if (f.life - f.downT > 3) { this.root.remove(f.g); f.g.traverse(o => { if (o.geometry && !o.geometry._shared) o.geometry.dispose(); }); this.falling.splice(this.falling.indexOf(f), 1); }
      }
    }
    for (const e of this.blds.values()) {
      if (e.shake > 0) { e.shake = Math.max(0, e.shake - dt); e.g.position.x = e.b.x + Math.sin(this.t * 60) * e.shake * 0.12; }
      const fl = e.g.userData.flag; if (fl) fl.rotation.y = Math.sin(this.t * 2.3 + e.b.x) * 0.25;
      const door = e.g.userData.door;
      if (door) {
        // a gate swings open for the friendly near it
        let want = 0;
        if (e.friendly) { const near = [G.player, ...this.actors].some(a => a && a.pos && Math.hypot(a.pos.x - e.b.x, a.pos.z - e.b.z) < 3.2 && (a === G.player || a.friendly)); want = near ? 1 : 0; }
        e.g.userData.doorA += (want - e.g.userData.doorA) * Math.min(1, dt * 3);
        door.rotation.y = -e.g.userData.doorA * 1.6;
      }
    }
    if ((G.treeNear ?? 55) > 0) {
      if (!this.grass && !this._grassLoading) { this._grassLoading = true; import("../grass.js").then(m => { this.grass = new m.Grass(this); }).catch(() => {}); }
      if (this.grass) { if (this.blds.size !== this._bldN) { this._bldN = this.blds.size; this.grass.t = 99; } this.grass.update(dt); }
    } else if (this.grass) { this.grass.mesh.visible = false; this.grass.flowers.visible = false; }
    if (!this.birds && !this._birdsLoading) { this._birdsLoading = true; import("../birds.js").then(m => { this.birds = new m.Birds(this); }).catch(() => {}); }
    if (this.birds) this.birds.update(dt);
  }
  // ---- the map ----
  get mapTitle() { return this.title || "The Island"; }
  get mapBounds() { return { x0: -this.half, x1: this.half, z0: -this.half, z1: this.half }; }
  // the whole land drawn once, at a size to suit it, then only copied out
  mapSheet() {
    if (this._sheet) return this._sheet;
    const N = this.half > 1500 ? 1500 : 1100, cv = document.createElement("canvas"); cv.width = cv.height = N;
    const c = cv.getContext("2d"); fillPaper(c, N, N);
    const img = c.getImageData(0, 0, N, N), d = img.data, S = 2 * this.half / N, L = this.land;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -this.half + (i + 0.5) * S, z = -this.half + (j + 0.5) * S, h = L.heightAt(x, z), o = (j * N + i) * 4;
      let r, g, b, a = 1;
      if (h < WATER) { const k = clamp(-h / 10, 0, 1); r = 120 - k * 50; g = 150 - k * 40; b = 160 - k * 20; }
      else if (h < WATER + 1.4) { r = 214; g = 196; b = 150; }
      else {
        const f = L.forestAt(x, z), hk = clamp(h / 60, 0, 1);
        r = 200 - f * 70 - hk * 30; g = 190 - f * 50 - hk * 30; b = 130 - f * 40;
        if (h > this.snowLine - 4) { r = g = b = 236; }
        // (a hint of the hills: lighter on the slopes facing the north-west light)
        const sh = clamp((L.heightAt(x - 6, z - 6) - h) * 0.6, -18, 18); r -= sh; g -= sh; b -= sh;
        a = 0.85;
      }
      d[o] = d[o] * (1 - a) + r * a; d[o + 1] = d[o + 1] * (1 - a) + g * a; d[o + 2] = d[o + 2] * (1 - a) + b * a;
    }
    c.putImageData(img, 0, 0);
    // a coastline in ink
    c.strokeStyle = "rgba(59,42,26,0.55)"; c.lineWidth = 1;
    return this._sheet = { cv, N };
  }
  minimap(c, X, Z, S, big) {
    const sh = this.mapSheet();
    c.save(); c.imageSmoothingEnabled = true;
    c.drawImage(sh.cv, X(-this.half), Z(-this.half), 2 * this.half * S, 2 * this.half * S);
    c.restore();
    // close up, the trees themselves
    if (S > 1.4) {
      const W = c.canvas.width, H = c.canvas.height, ts = Math.max(2.2, Math.min(4.2, S * 1.6));
      c.fillStyle = "#3d5a2e";
      for (const ch of this.chunks.values()) {
        if (X(ch.x + CHUNK) < 0 || X(ch.x - CHUNK) > W || Z(ch.z + CHUNK) < 0 || Z(ch.z - CHUNK) > H) continue;
        for (const t of ch.trees) if (!t.gone) mapTree(c, X(t.x), Z(t.z), ts, t.kind);
      }
    }
    // claims: a dashed ring in the owner's colour
    for (const e of this.blds.values()) {
      const d = BUILD[e.b.type];
      if (d.claim) {
        c.save(); c.strokeStyle = e.mapColour || INK; c.setLineDash([4, 3]); c.lineWidth = 1.6;
        c.beginPath(); c.arc(X(e.b.x), Z(e.b.z), d.claim * S, 0, Math.PI * 2); c.stroke(); c.restore();
      }
      const r = Math.max(2.5, (d.r || 1) * S * 0.8);
      c.fillStyle = e.mine ? "#2e6a40" : e.friendly ? "#3a5a8a" : TOWN;
      c.fillRect(X(e.b.x) - r, Z(e.b.z) - r, r * 2, r * 2); c.strokeStyle = INK; c.lineWidth = 0.8; c.strokeRect(X(e.b.x) - r, Z(e.b.z) - r, r * 2, r * 2);
    }
    void big;
  }
  mapLabels(c, X, Z) {
    for (const e of this.blds.values()) if (e.b.type === "hearth" && e.ownerName) label(c, e.mine ? "your homestead" : `${e.ownerName}'s`, X(e.b.x), Z(e.b.z) + 18, 12);
  }
  dispose() {
    for (const ch of [...this.chunks.values()]) this.dropChunk(ch);
    if (this.birds && this.birds.dispose) this.birds.dispose();
    super.dispose();
  }
}
