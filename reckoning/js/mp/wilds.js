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
import { fillPaper, tree as mapTree, INK, TOWN, label, relief } from "../map.js";
import { makeTerrain, CHUNK, WATER } from "./terrain.js";
import { REALMS_1683, SEAS_1683 } from "./earth-1683.js";
import { BUILD } from "./rules.js";
import { ryeStrip } from "../town.js";

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SEG = 24;                                  // ground facets along a piece's side (four metres each)
const PAL = {
  grass: new THREE.Color(0x6c7f38), meadow: new THREE.Color(0x7d8c44), litter: new THREE.Color(0x53463a), moss: new THREE.Color(0x4a5d2a),
  earth: new THREE.Color(0x3d3126), dry: new THREE.Color(0x8c8248), stone: new THREE.Color(0x6e6b62), sand: new THREE.Color(0xb8a77a),
  wetSand: new THREE.Color(0x8a7a58), desert: new THREE.Color(0xc8b07a), bed: new THREE.Color(0x5e5640), snow: new THREE.Color(0xe8ecf0), rock: new THREE.Color(0x7a7870),
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
    if (this.land.kind === "earth") { const cl = this.land.climate(x, z); if (cl.dry > 0.5 || cl.cold > 0.6) return 0; }
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
    // (the Earth: desert sand where it's dry, tundra and snow toward the poles)
    if (L.kind === "earth") { const cl = L.climate(x, z); if (cl.dry > 0.05) c.lerp(PAL.desert, Math.min(1, cl.dry * 1.15)); if (cl.cold > 0.05) c.lerp(PAL.snow, cl.cold * 0.85); }
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
    } else if (b.type === "field") {
      // dug earth in three strips, and the rye in them as far as it has grown
      const bl = new Builder();
      for (const o of [-2.2, 0, 2.2]) { bl.box(1.9, 0.12, 6.9, o, 0.02, 0, 0x4a3a28); for (let k = -1; k <= 1; k++) bl.box(0.08, 0.06, 6.7, o + k * 0.6, 0.1, 0, 0x3a2c1e); }
      g.add(bl.build(MAT.rough, { shadow: false }));
      g.userData.rye = new THREE.Group(); g.add(g.userData.rye);
      this.setGrowth(b, g, b.growth || 0);
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
  // a field's rye: shoots, green stalks, then gold
  setGrowth(b, g = this.blds.get(b.id) && this.blds.get(b.id).g, growth = 0) {
    if (!g || !g.userData.rye) return;
    const stage = growth < 0.05 ? 0 : growth < 0.34 ? 1 : growth < 0.67 ? 2 : 3;
    if (g.userData.stage === stage) return;
    g.userData.stage = stage;
    const R = g.userData.rye; for (const m of [...R.children]) { R.remove(m); m.geometry.dispose(); }
    if (!stage) return;
    for (const o of [-2.2, 0, 2.2]) R.add(ryeStrip(b, o, stage, () => 0.06, g.position.y));
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
  get mapBounds() {
    if (this.land.kind === "earth") return { x0: -this.half, x1: this.half, z0: -78 / 180 * this.half, z1: 60 / 180 * this.half };
    return { x0: -this.half, x1: this.half, z0: -this.half, z1: this.half };
  }
  // the whole land drawn once, at a size to suit it, then only copied out
  mapSheet() {
    if (this._sheet) return this._sheet;
    const N = this.land.kind === "earth" ? 1000 : this.half > 1500 ? 1500 : 1100, cv = document.createElement("canvas"); cv.width = cv.height = N;
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
        if (L.kind === "earth") { const cl = L.climate(x, z); r = r * (1 - cl.dry) + 214 * cl.dry; g = g * (1 - cl.dry) + 190 * cl.dry; b = b * (1 - cl.dry) + 130 * cl.dry; r = r * (1 - cl.cold) + 236 * cl.cold; g = g * (1 - cl.cold) + 236 * cl.cold; b = b * (1 - cl.cold) + 236 * cl.cold; }
        if (h > this.snowLine - 4) { r = g = b = 236; }
        // (a hint of the hills: lighter on the slopes facing the north-west light)
        const sh = clamp((L.heightAt(x - 6, z - 6) - h) * 0.6, -18, 18); r -= sh; g -= sh; b -= sh;
        a = 0.85;
      }
      d[o] = d[o] * (1 - a) + r * a; d[o + 1] = d[o + 1] * (1 - a) + g * a; d[o + 2] = d[o + 2] * (1 - a) + b * a;
    }
    c.putImageData(img, 0, 0);
    // the contours over it (a line every few metres on an island; every ten in the mountains of the wide world)
    { const K = N / (2 * this.half), b = { x0: -this.half, x1: this.half, z0: -this.half, z1: this.half };
      const XX = x => (x + this.half) * K, ZZ = z => (z + this.half) * K, st = Math.max(4, 2 * this.half / 380);
      relief(c, (x, z) => L.heightAt(x, z), b, XX, ZZ, { step: st, every: this.land.big ? 10 : 4, water: 0, shade: 0 });
      // the woods, stamped as a map of the time stamps them: a little tree to every few paces of forest
      c.fillStyle = "rgba(60,74,44,0.6)";
      const gap = Math.max(7, 2 * this.half / N * 7);
      for (let z = -this.half; z < this.half; z += gap) for (let x = -this.half; x < this.half; x += gap) {
        const jx = x + (hash(x, z) - 0.5) * gap * 0.8, jz = z + (hash(z, x) - 0.5) * gap * 0.8;
        const f = L.forestAt(jx, jz), h = L.heightAt(jx, jz);
        if (h < 1.6 || h > this.snowLine - 4 || f < 0.45 || hash(jx * 0.3, jz * 0.7) > f) continue;
        mapTree(c, XX(jx), ZZ(jz), Math.max(1.8, gap * K * 0.32), hash(jx, jz) < 0.65 ? "spruce" : "birch");
      }
      // and the coast, inked
      relief(c, (x, z) => L.heightAt(x, z), b, XX, ZZ, { step: st, shade: 0, levels: [0.05], ink: "rgba(59,42,26,0.75)" }); }
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
        const war = G.mp && G.mp.wars && G.mp.wars.some(w => w.hearth === e.b.id);
        c.save(); c.strokeStyle = war ? "#c0392b" : e.mapColour || INK; c.setLineDash(war ? [6, 2] : [4, 3]); c.lineWidth = war ? 3 : 1.6;
        c.beginPath(); c.arc(X(e.b.x), Z(e.b.z), d.claim * S, 0, Math.PI * 2); c.stroke(); c.restore();
      }
      const r = Math.max(2.5, (d.r || 1) * S * 0.8);
      c.fillStyle = e.mine ? "#2e6a40" : e.friendly ? "#3a5a8a" : TOWN;
      c.fillRect(X(e.b.x) - r, Z(e.b.z) - r, r * 2, r * 2); c.strokeStyle = INK; c.lineWidth = 0.8; c.strokeRect(X(e.b.x) - r, Z(e.b.z) - r, r * 2, r * 2);
    }
    void big;
  }
  // the names of the land: its hills, lakes, woods and bays, the same for everyone (from the seed)
  get places() {
    if (this._places) return this._places;
    if (this.land.kind === "earth") {
      const at = (lon, lat) => ({ x: lon / 180 * this.half, z: -lat / 180 * this.half });
      // (the world of 1683: its realms and seas by the names of the day)
      const out = REALMS_1683.map(([name, lon, lat, size]) => ({ kind: "land", name, size, ...at(lon, lat) }));
      for (const [name, lon, lat] of SEAS_1683) out.push({ kind: "sea", name, ...at(lon, lat) });
      return this._places = out;
    }
    const L = this.land, n = 72, step = 2 * this.half / n, out = [];
    let s = (L.seed ^ 0x51a7e) | 1; const rnd = () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s >>> 0) % 1e6) / 1e6);
    const ROOT = ["Eller", "Birken", "Föhren", "Hirsch", "Raben", "Wolfs", "Eichen", "Mönchs", "Grauen", "Stein", "Linden", "Heide", "Kranich", "Fuchs", "Tannen", "Otter", "Bären", "Elben", "Schwarz", "Weiden", "Hagen", "Moor", "Falken", "Erlen"];
    const used = new Set(), name = suf => { for (let k = 0; k < 20; k++) { const r = ROOT[Math.floor(rnd() * ROOT.length)]; if (!used.has(r)) { used.add(r); return r + suf; } } return ROOT[0] + suf; };
    const H = [], at = (i, j) => H[Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H.push(L.heightAt(-this.half + (i + 0.5) * step, -this.half + (j + 0.5) * step));
    const xy = (i, j) => ({ x: -this.half + (i + 0.5) * step, z: -this.half + (j + 0.5) * step });
    // hills: the highest points, each the top of its own neighbourhood
    const peaks = [];
    for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
      const h = at(i, j); if (h < (this.land.big ? 40 : 14)) continue;
      let top = true; for (let dj = -3; dj <= 3 && top; dj++) for (let di = -3; di <= 3; di++) if ((di || dj) && at(i + di, j + dj) > h) { top = false; break; }
      if (top) peaks.push({ h, ...xy(i, j) });
    }
    peaks.sort((a, b) => b.h - a.h);
    const tops = [];
    for (const p of peaks) { if (tops.length >= (this.land.big ? 7 : 3)) break; if (tops.some(q => Math.hypot(q.x - p.x, q.z - p.z) < this.half * 0.25)) continue; tops.push(p); }
    for (const p of tops) out.push({ kind: "hill", name: name("berg"), x: p.x, z: p.z, h: p.h });
    // lakes: water inside the land, each body of it once
    const seen = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; if (seen[k] || H[k] >= 0) continue;
      const q = [[i, j]], cells = []; seen[k] = 1; let edge = false;
      while (q.length) { const [a, b] = q.pop(); cells.push([a, b]); if (a === 0 || b === 0 || a === n - 1 || b === n - 1) edge = true;
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const A = a + da, B = b + db; if (A < 0 || B < 0 || A >= n || B >= n) continue; const kk = B * n + A; if (seen[kk] || H[kk] >= 0) continue; seen[kk] = 1; q.push([A, B]); } }
      if (edge || cells.length < 3) continue;
      const ci = cells.reduce((s2, c) => s2 + c[0], 0) / cells.length, cj = cells.reduce((s2, c) => s2 + c[1], 0) / cells.length;
      out.push({ kind: "lake", name: name("see"), ...xy(ci, cj), size: cells.length });
    }
    // the deepest woods, and a bay or two on the coast
    const woods = [];
    for (let j = 4; j < n - 4; j += 6) for (let i = 4; i < n - 4; i += 6) { const p = xy(i, j); if (at(i, j) > 2 && L.forestAt(p.x, p.z) > 0.85) woods.push(p); }
    for (const p of woods.sort(() => rnd() - 0.5).slice(0, this.land.big ? 6 : 2)) out.push({ kind: "wood", name: name("wald"), ...p });
    if (this.kind !== "continent") out.push({ kind: "sea", name: this.kind === "archipelago" ? "the Sounds" : "the Sea", x: 0, z: this.half * 0.93 });
    return this._places = out;
  }
  mapLabels(c, X, Z) {
    const used = [], hits = bx => used.some(q => q.x0 < bx.x1 && bx.x0 < q.x1 && q.y0 < bx.y1 && bx.y0 < q.y1);
    // (the great lands are lettered first; a smaller one that would crowd them shifts a little, or is left off)
    const land = this.places.filter(p => p.kind === "land").sort((a, b) => (b.size || 0) - (a.size || 0));
    for (const p of land) {
      const size = Math.max(9, Math.min(16, 7 + Math.sqrt(p.size) * 0.45));
      c.font = `italic ${size}px "IM Fell English", Georgia, serif`;
      const w = c.measureText(p.name).width;
      for (const [ox, oy] of [[0, 0], [0, -size], [0, size], [-w / 3, 0], [w / 3, 0], [0, -size * 2], [0, size * 2]]) {
        const x = X(p.x) + ox, y = Z(p.z) + oy, bx = { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y - size / 2 - 1, y1: y + size / 2 + 1 };
        if (hits(bx)) continue;
        used.push(bx); label(c, p.name, x, y, size, INK); break;
      }
    }
    for (const p of this.places) {
      if (p.kind === "land") continue;
      if (p.kind === "sea") { c.font = `italic 18px "IM Fell English", Georgia, serif`; const w = c.measureText(p.name).width, bx = { x0: X(p.x) - w / 2, x1: X(p.x) + w / 2, y0: Z(p.z) - 9, y1: Z(p.z) + 9 }; if (hits(bx)) continue; used.push(bx); }
      const size = p.kind === "sea" ? 18 : p.kind === "hill" ? 13 : p.kind === "lake" ? 12 + Math.min(4, (p.size || 3) / 6) : 13;
      if (p.kind === "hill") { c.fillStyle = INK; c.beginPath(); c.moveTo(X(p.x), Z(p.z) - 5); c.lineTo(X(p.x) + 4, Z(p.z) + 2); c.lineTo(X(p.x) - 4, Z(p.z) + 2); c.closePath(); c.fill(); }
      label(c, p.name, X(p.x), Z(p.z) + (p.kind === "hill" ? 14 : 0), size, p.kind === "lake" || p.kind === "sea" ? "#3e5a62" : INK);
    }
    for (const e of this.blds.values()) if (e.b.type === "hearth" && e.ownerName) label(c, e.mine ? "your homestead" : `${e.ownerName}'s`, X(e.b.x), Z(e.b.z) + 18, 12);
  }
  dispose() {
    for (const ch of [...this.chunks.values()]) this.dropChunk(ch);
    if (this.birds && this.birds.dispose) this.birds.dispose();
    super.dispose();
  }
}
