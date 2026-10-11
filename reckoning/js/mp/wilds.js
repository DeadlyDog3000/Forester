// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A MULTIPLAYER MAP, DRAWN. The land comes from terrain.js (the same for everyone, from the seed); this draws the
// part of it round you, a piece at a time as you walk, and lets go of what falls far behind — so the wide world, six
// kilometres across, costs no more to walk than a small island. What people have done to it (trees down, rocks
// broken, things built) is told by the server and laid over the top.

import { THREE, Collision, addDetail, MAT, makeFlame, clamp, Builder, noSnow, mat, ownGrainAll } from "../core.js";
import { G, WorldBase } from "../engine.js";
import { forestInstances, modelCopy, ensureModel, makeSpruce, makeStump, makeShipyard, SWAY } from "../models.js";
import { Woods } from "../woods.js";
import { fillPaper, tree as mapTree, INK, TOWN, label, relief, caveIcon } from "../map.js";
import { makeTerrain, CHUNK, WATER, BIOMES } from "./terrain.js";
import { WaterMat } from "../water.js";
import { Caves } from "../cave.js";
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
// a rock's footing: how far it reaches out from its middle, all the way round, where it stands up out of the ground
// (its own shape as it's set down — sunk, turned, scaled — and the ground's slope under it), and the circles to walk
// against laid round that: the rock itself, not a circle round it
const _rv = new THREE.Vector3();
function rockCols(col, mx, x, z, s, ground, y0, y1) {
  const p = rockShape().attributes.position, N = 12, ext = new Array(N).fill(0);
  for (let i = 0; i < p.count; i++) {
    _rv.fromBufferAttribute(p, i).applyMatrix4(mx);
    if (_rv.y < ground(_rv.x, _rv.z) + 0.12) continue;
    const dx = _rv.x - x, dz = _rv.z - z, b = ((Math.round(Math.atan2(dz, dx) / (Math.PI * 2 / N)) % N) + N) % N;
    ext[b] = Math.max(ext[b], Math.hypot(dx, dz));
  }
  // (a sector nothing reached: as its neighbours do)
  for (let b = 0; b < N; b++) if (!ext[b]) ext[b] = Math.min(ext[(b + 1) % N] || s * 0.6, ext[(b + N - 1) % N] || s * 0.6);
  const r0 = Math.min(...ext) * 0.9, rs = Math.min(0.32 * s, r0), out = [col.addCircle(x, z, r0, y1)];
  ext.forEach((e, b) => { if (e > r0 + 0.05) { const a = b * Math.PI * 2 / N, d = Math.max(0, e - rs); out.push(col.addCircle(x + Math.cos(a) * d, z + Math.sin(a) * d, rs, y1)); } });
  for (const o of out) o.y0 = y0;
  return out;
}

// the great features of the land, by the names they had then: deserts, mountains, plains, the great forests
const LANDFORMS = [
  ["the Sahara", 12, 23, 260], ["the Arabian Desert", 46, 23, 90], ["the Gobi", 104, 43, 110], ["the Himalaya", 84, 29, 120], ["the Alps", 10, 46.5, 40],
  ["the Caucasus", 44, 42.5, 40], ["the Urals", 59, 58, 60], ["the Steppe", 62, 48, 160], ["Siberia", 100, 62, 300], ["the Taiga", 125, 58, 140],
  ["the Andes", -70, -22, 120], ["the Amazon", -60, -5, 230], ["the Pampas", -63, -36, 80], ["Patagonia", -69, -46, 70],
  ["the Rocky Mountains", -110, 44, 120], ["the Great Plains", -100, 40, 120], ["the Appalachians", -79, 38, 50], ["the Great Lakes", -84, 46, 50],
  ["the Congo", 22, -1, 120], ["the Kalahari", 22, -23, 80], ["the Horn of Africa", 45, 8, 50], ["the Great Rift", 36, -2, 60],
  ["the Deccan", 77, 17, 80], ["Tartary", 75, 52, 200], ["the Tibetan Plateau", 88, 33, 110], ["Arabia Felix", 46, 15, 40],
  ["the Outback", 133, -25, 180], ["the Great Barrier Reef", 147, -17, 50], ["Greenland", -41, 72, 120], ["Lapland", 24, 68, 60],
  ["the Pyrenees", 1, 42.7, 30], ["the Carpathians", 24, 47.5, 40], ["Scandinavia", 15, 63, 80], ["Anatolia", 33, 39, 60], ["Mesopotamia", 44, 33, 50],
];
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
    this.rockMat = addDetail(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), { scale: 2, amount: 0.25, grain: 0.6, surface: "rock" });
    // the sea and the lakes: one sheet of water at one level, following you about under the haze
    // (fine near you and coarser out toward the haze, so the swell can move it where you can see it move)
    const wg = new THREE.PlaneGeometry(2, 2, 150, 150); wg.rotateX(-Math.PI / 2);
    { const p = wg.attributes.position; for (let i = 0; i < p.count; i++) { const f = v => Math.sign(v) * Math.pow(Math.abs(v), 2.2) * 800; p.setXYZ(i, f(p.getX(i)), 0, f(p.getZ(i))); } wg.computeVertexNormals(); }
    this.wm = new WaterMat({ deep: [0.02, 0.06, 0.075], round: [0.05, 0.08, 0.06], amp: 0.45, len: 24, swell: 1.4 });
    this.water = new THREE.Mesh(wg, this.wm.mat); this.water.frustumCulled = false;
    this.water.position.y = WATER - 0.05; noSnow(this.water);
    this.root.add(this.water);
    this.t = 0;
    this.buildNear(0, 0, 0);
  }
  // ---- the ground ----
  // (down a cave, the ground under you is the cave's floor, far beneath the hill)
  heightAt(x, z) { const c = this.cave; return c && c.inside && c.holds(x, z) ? c.floorAt(x, z) : this.land.heightAt(x, z); }
  // where your feet are: the ground, or out of your depth, swimming with your head above the water; or up a tower
  floorAt(x, z, y) {
    { const c = this.cave; if (c && c.inside && c.holds(x, z)) return c.floorAt(x, z); }
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
    const b = this.land.biomeAt(x, z);
    if (b === "ice" || b === "tundra") return "snow";
    if (b === "desert") return "dirt";
    return this.land.forestAt(x, z) > 0.5 ? "leaves" : "grass";
  }
  // where grass grows (for grass.js): thick in the open, thin under the trees, none on sand, rock or snow
  grassAt(x, z) {
    const h = this.land.heightAt(x, z);
    if (h < WATER + 1.5 || h > this.snowLine - 6) return 0;
    // (as thick as the biome grows it: none on the desert or the ice, thin on the tundra, a sea of it on the steppe)
    const gk = BIOMES[this.land.biomeAt(x, z)].grass; if (gk <= 0) return 0;
    if (this.land.slopeAt(x, z) > 0.5) return 0;
    const f = this.land.forestAt(x, z);
    return (f > 0.55 ? 0.12 : (1 - f) * 0.95) * gk;
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
    // (and the sites laid out: trodden ground inside the cord)
    for (const e of (this.sitesFor && this.sitesFor()) || []) {
      const b = e.q, d = BUILD[b.type]; if (!d || Math.hypot(b.x - cx, b.z - cz) > r) continue;
      out.push([b.x, b.z, Math.cos(b.ry || 0), Math.sin(b.ry || 0), d.wall ? d.len / 2 : (d.w || d.r * 2) / 2 + 0.2, d.wall ? 0.4 : (d.d || d.r * 2) / 2 + 0.2]);
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
    // the ground of the biome — blended with its neighbours', so one kind of country gives way to the next
    this.biomeGround(x, z, c);
    c.multiplyScalar(0.93 + (dry - 0.5) * 0.14);
    if (dry > 0.82) c.lerp(PAL.dry, 0.25);
    // under the trees: needle litter and moss
    if (f > 0.35) c.lerp(PAL.litter, clamp((f - 0.35) * 2.2, 0, 0.85)).lerp(PAL.moss, hash(x * 0.05, z * 0.05) > 0.6 ? 0.35 : 0);
    if (h < WATER + 2.4) c.lerp(PAL.sand, clamp((WATER + 2.4 - h) / 1, 0, 1) * 0.5);
    if (steep > 0.16) c.lerp(PAL.stone, clamp((steep - 0.16) * 4, 0, 0.9));
    if (h > this.snowLine - 6) c.lerp(PAL.snow, clamp((h - this.snowLine + 6) / 8, 0, 1) * (steep > 0.45 ? 0.4 : 1));
    return c;
  }
  // the colour of the ground in the open, for the kind of country it is: the biome here and those round about, mixed
  biomeGround(x, z, c) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dx = -16; dx <= 16; dx += 16) for (let dz = -16; dz <= 16; dz += 16) { const q = BIOMES[this.land.biomeAt(x + dx, z + dz)].ground, w = dx || dz ? 1 : 2; r += q[0] * w; g += q[1] * w; b += q[2] * w; n += w; }
    return c.setRGB(r / n, g / n, b / n);
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
      t.col = this.col.addCircle(t.x, t.z, { birch: 0.22, palm: 0.2, acacia: 0.24, oak: 0.45, jungle: 0.6, scrub: 0.35 }[t.kind] || 0.32, t.y + (t.kind === "scrub" ? 1.2 : 12)); cols2.push(t.col);   // (its top from the ground it stands on, not from the sea)
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
        k.cols = rockCols(this.col, d.matrix, k.x, k.z, k.s, (x, z) => L.heightAt(x, z), -5, k.y + k.s * 0.6); cols2.push(...k.cols);
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
    if (id[0] === "s") return (this.seams && this.seams.get(id)) || null;
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
    const s = makeStump(t, t.kind); s.position.set(t.x, t.y - 0.02, t.z); this.root.add(s); this.stumps.set(t.id, s);
  }
  showTree(id) {
    const t = this.thing(id); this.felled.delete(id);
    const s = this.stumps.get(id); if (s) { this.root.remove(s); this.stumps.delete(id); }
    if (!t || !t.slots) return;
    // (put back as it was: the chunk is built afresh, the cheapest way to have every piece of it right)
    const ch = this.chunkAt(t.x, t.z); if (ch) { this.dropChunk(ch); this.buildChunk(ch.ci, ch.cj); }
  }
  hideRock(k) { const [m, i] = k.slot || []; if (m) { m.setMatrixAt(i, ZERO); m.instanceMatrix.needsUpdate = true; } if (k.mesh) k.mesh.visible = false; for (const o of k.cols || []) o.disabled = true; k.gone = true; }
  showRock(id) { this.broken.delete(id); const k = this.thing(id); if (k && k.mesh) { k.mesh.visible = true; k.gone = false; for (const o of k.cols || []) o.disabled = false; } if (k && k.slot) { k.slot[0].setMatrixAt(k.slot[1], k.m); k.slot[0].instanceMatrix.needsUpdate = true; k.gone = false; for (const o of k.cols || []) o.disabled = false; } }
  setFelled(ids) { for (const id of ids) { this.felled.add(id); const t = this.thing(id); if (t && t.slots) this.hideTree(t, true); } }
  setBroken(ids) { for (const id of ids) { this.broken.add(id); const k = this.thing(id); if (k && k.slot) this.hideRock(k); } }
  // a tree comes down, away from whoever felled it
  fell(id, dx, dz) {
    this.felled.add(id);
    const t = this.thing(id); if (!t) return;
    let g = t.slots ? Woods.prototype.pieces.call(this, t) : null;
    if (!g) { const m = modelCopy(t.kind) || modelCopy("spruce"); if (m) { g = new THREE.Group(); m.scene.scale.setScalar(t.h / 10); m.scene.rotation.y = t.rot; g.add(m.scene); } else g = makeSpruce(t.h, Math.floor(t.x * 7)); }
    g.position.set(t.x, t.y - 0.1, t.z); this.root.add(g);
    ownGrainAll(g);   // (its grain in its own space as it falls, not sliding through the world's)
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
    const y = d.wall || b.type === "hearth" ? lo + 0.05 : b.type === "shipyard" ? Math.max(0.4, this.land.heightAt(b.x - Math.sin(b.ry || 0) * fd * 0.25, b.z - Math.cos(b.ry || 0) * fd * 0.25)) : hi, g = new THREE.Group(), cols = [];
    g.position.set(b.x, y, b.z); g.rotation.y = b.ry || 0;
    if (!d.wall && b.type !== "hearth" && b.type !== "shipyard" && hi - lo > 0.12) {
      const ft = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.25, hi - lo + 0.5, fd + 0.25), mat(0x6e675c, { surface: "stone" }));
      ft.position.y = -(hi - lo + 0.5) / 2 + 0.06; ft.receiveShadow = true; g.add(ft);
    }
    if (d.model) {
      // (solid where its walls are: the model's own footing, measured at a person's height in its own frame, so the
      //  box turns with it and sits on it however it was set down — not a guess at its size, nor a square to the map)
      let body = null;
      const fit = sc => {
        if (b.type === "cabin") return;
        sc.updateMatrixWorld(true); const v = new THREE.Vector3(), M = new THREE.Matrix4();
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        sc.traverse(o => { const p = o.isMesh && o.geometry && o.geometry.attributes.position; if (!p) return;
          M.multiplyMatrices(new THREE.Matrix4().copy(sc.matrixWorld).invert(), o.matrixWorld);
          for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).applyMatrix4(M); if (v.y < 0.25 || v.y > 1.9) continue; x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); } });
        if (!(x1 > x0)) return;
        const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (body) { this.col.remove(body); cols.splice(cols.indexOf(body), 1); }
        cols.push(body = this.col.addOBox(b.x + mx * c + mz * s, b.z - mx * s + mz * c, (x1 - x0) / 2 - 0.08, (z1 - z0) / 2 - 0.08, b.ry || 0, y + 5));
      };
      const put = () => { const m = modelCopy(d.model); if (m) { g.add(m.scene); g.userData.door = m.scene.getObjectByName("door") || null; fit(m.scene); return true; } return false; };
      if (!put()) {
        // (a stand-in until the model's there: a plain block of the right size)
        const ph = new THREE.Mesh(new THREE.BoxGeometry(d.w || 4, 2.6, d.d || 4), mat(0x7a5a3a)); ph.position.y = 1.3; g.add(ph);
        ensureModel(d.model).then(ok => { if (ok && this.blds.has(b.id)) { g.remove(ph); put(); } });
      }
      if (b.type === "cabin") {
        // (a cabin you can go into, as the one in the clearing: log walls all round, and the doorway in the front the only way in)
        const c0 = Math.cos(b.ry || 0), s0 = Math.sin(b.ry || 0);
        const circle = (lx, lz, r) => cols.push(this.col.addCircle(b.x + lx * c0 + lz * s0, b.z - lx * s0 + lz * c0, r, y + 3));
        const wall = (lx0, lz0, lx1, lz1) => { const n = Math.ceil(Math.hypot(lx1 - lx0, lz1 - lz0) / 0.45); for (let i = 0; i <= n; i++) circle(lx0 + (lx1 - lx0) * i / n, lz0 + (lz1 - lz0) * i / n, 0.28); };
        wall(-2.55, -3.05, 2.55, -3.05); wall(-2.55, -3.05, -2.55, 3.05); wall(2.55, -3.05, 2.55, 3.05);
        wall(-2.55, 3.05, -0.95, 3.05); wall(0.95, 3.05, 2.55, 3.05);
        circle(-1.2, -3.6, 0.6);
        // the door, while it's shut (F at it opens it, as the cabin's in the clearing)
        g.userData.doorCols = [-0.45, 0, 0.45].map(lx => { circle(lx, 3.05, 0.26); return cols[cols.length - 1]; });
      } else if (!body) cols.push(body = this.col.addOBox(b.x, b.z, (d.w || 4) * 0.45, (d.d || 4) * 0.45, b.ry || 0, y + 5));
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
    } else if (b.type === "shipyard") {
      // the slipway down into the water, the ribs of a ship on it, the shed and the crane (solid only where they stand)
      g.add(makeShipyard(d.w, d.d));
      const c0 = Math.cos(b.ry || 0), s0 = Math.sin(b.ry || 0), at = (lx, lz) => [b.x + lx * c0 + lz * s0, b.z - lx * s0 + lz * c0];
      for (const lz of [-0.35, -0.2, -0.05, 0.1].map(k => k * d.d)) for (const lx of [d.w * 0.25 - 2.6, d.w * 0.25 + 2.6]) { const [px, pz] = at(lx, lz); cols.push(this.col.addCircle(px, pz, 0.3, y + 5)); }
      { const [px, pz] = at(-d.w * 0.45, d.d * 0.1); cols.push(this.col.addCircle(px, pz, 0.4, y + 9)); }
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
    // (a door that swings in on its hinge, and lets you through when it's open)
    if (g.userData.doorCols) e.setDoor = open => {
      e.doorOpen = open; for (const c of g.userData.doorCols) c.disabled = open;
      const dr = g.userData.door; if (dr) dr.rotation.y = open ? 1.45 : 0;
    };
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
  // ---- the caves ----
  // the mouths near you made as you come near them (their halls beneath, ready and dark), and kept; the nearest one the
  // world's cave — the one walked into, whose dark the sky gives way to
  cavesNear(p) {
    const map = this.caves ??= new Map();
    if (!(this.cave && this.cave.inside)) {
      for (const c of this.land.cavesNear(p.x, p.z, 170)) if (!map.has(c.id)) {
        const cv = new Caves(this, c.seed, { at: { x: c.x - Math.sin(c.ry) * 14, z: c.z - Math.cos(c.ry) * 14 }, base: -150, quiet: true, seam: (cave, n, x, z) => this.makeSeam(c.id + ":" + n, x, z, cave) });
        cv.mouth(c.x, c.z, c.ry); map.set(c.id, cv); cv.site = c;
      }
      let best = null, bd = Infinity;
      for (const cv of map.values()) { const d = Math.hypot(cv.site.x - p.x, cv.site.z - p.z); if (d < bd) { bd = d; best = cv; } }
      this.cave = best;
    }
  }
  // a seam of good stone in a cave's wall: the pickaxe breaks it, as a rock up top
  makeSeam(id, x, z, cave) {
    const sid = "s" + id.slice(1), y = cave.floorAt(x, z), s = 1.1 + hash(x, z) * 0.6;
    const m = new THREE.Mesh(rockShape(), this.seamMat ??= addDetail(new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.9, flatShading: true }), { scale: 2, amount: 0.3, grain: 0.6, surface: "rock", snow: false, weather: false }));
    m.position.set(x, y - 0.2 * s, z); m.scale.setScalar(s); m.rotation.y = hash(z, x) * 6.28; m.castShadow = m.receiveShadow = true; cave.root.add(m);
    const k = { id: sid, x, y, z, s, mesh: m, cave, gone: false };
    m.updateMatrix(); k.cols = rockCols(this.col, m.matrix, x, z, s, (px, pz) => cave.floorAt(px, pz), y - 2, y + s * 0.6);
    (this.seams ??= new Map()).set(sid, k);
    if (this.broken.has(sid)) this.hideRock(k);
    return k;
  }
  hitBuilding(id, hp) { const e = this.blds.get(id); if (!e) return; e.hp = hp; e.shake = 0.3; }
  // ---- every frame ----
  update(dt) {
    this.t += dt;
    SWAY.t.value += dt;
    const p = G.player ? G.player.pos : { x: 0, z: 0 };
    this.water.position.x = Math.round(p.x / 50) * 50; this.water.position.z = Math.round(p.z / 50) * 50;
    this.wm.update(dt, { rain: this.rainK || 0 });
    if ((this.streamT = (this.streamT || 0) - dt) <= 0) { this.streamT = 0.25; this.buildNear(p.x, p.z, 1); this.cavesNear(p); }
    if (this.cave) this.cave.tick(dt);
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
  get mapTitle() { return this.cave && this.cave.inside ? "The Cave" : this.title || "The Island"; }
  get mapBounds() {
    if (this.cave && this.cave.inside) { const b = this.cave.b; return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }; }
    if (this.land.kind === "earth") return { x0: -this.half, x1: this.half, z0: -78 / 180 * this.half, z1: 60 / 180 * this.half };
    return { x0: -this.half, x1: this.half, z0: -this.half, z1: this.half };
  }
  // the whole land drawn once, at a size to suit it, then only copied out
  mapSheet() {
    if (this._sheet) return this._sheet;
    const N = this.land.kind === "earth" ? 1000 : this.half > 1500 ? 1500 : 1100, cv = document.createElement("canvas"); cv.width = cv.height = N;
    this.paintMap(cv.getContext("2d"), -this.half, -this.half, 2 * this.half, N);
    return this._sheet = { cv, N };
  }
  // a square of the land, `size` metres from (x0, z0), painted onto N pixels: the country's colour, the hills in
  // contour, the woods stamped, the coast inked (the whole sheet is one; so is each close-up piece of it)
  paintMap(c, x0, z0, size, N) {
    fillPaper(c, N, N);
    const img = c.getImageData(0, 0, N, N), d = img.data, S = size / N, L = this.land, e = Math.max(1.5, Math.min(6, S));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S, h = L.heightAt(x, z), o = (j * N + i) * 4;
      let r, g, b, a = 1;
      if (h < WATER) { const k = clamp(-h / 10, 0, 1); r = 120 - k * 50; g = 150 - k * 40; b = 160 - k * 20; }
      else if (h < WATER + 1.4) { r = 214; g = 196; b = 150; }
      else {
        const f = L.forestAt(x, z), hk = clamp(h / 60, 0, 1), q = BIOMES[L.biomeAt(x, z)].ground;
        // (the biomes, washed in as a map-maker would: the parchment tinted toward the country's own colour)
        r = 212 * 0.45 + q[0] * 255 * 0.55 - f * 40 - hk * 20; g = 198 * 0.45 + q[1] * 255 * 0.55 - f * 28 - hk * 20; b = 150 * 0.45 + q[2] * 255 * 0.55 - f * 22;
        if (h > this.snowLine - 4) { r = g = b = 236; }
        // (a hint of the hills: lighter on the slopes facing the north-west light)
        const sh = clamp((L.heightAt(x - e, z - e) - h) * 0.6 * 6 / e, -18, 18); r -= sh; g -= sh; b -= sh;
        a = 0.85;
      }
      d[o] = d[o] * (1 - a) + r * a; d[o + 1] = d[o + 1] * (1 - a) + g * a; d[o + 2] = d[o + 2] * (1 - a) + b * a;
    }
    c.putImageData(img, 0, 0);
    // the contours over it (a line every few metres on an island; every ten in the mountains of the wide world)
    const K = N / size, bb = { x0, x1: x0 + size, z0, z1: z0 + size }, whole = size >= 2 * this.half;
    const XX = x => (x - x0) * K, ZZ = z => (z - z0) * K, st = Math.max(whole ? 4 : 1, size / 380);
    relief(c, (x, z) => L.heightAt(x, z), bb, XX, ZZ, { step: st, every: this.land.big ? 10 : 4, water: 0, shade: 0 });
    // the woods, stamped as a map of the time stamps them: a little tree to every few paces of forest
    c.fillStyle = "rgba(60,74,44,0.6)";
    const gap = Math.max(whole ? 7 : 4.6, S * 7), gx0 = Math.floor(x0 / gap) * gap, gz0 = Math.floor(z0 / gap) * gap;
    for (let z = gz0; z < z0 + size; z += gap) for (let x = gx0; x < x0 + size; x += gap) {
      const jx = x + (hash(x, z) - 0.5) * gap * 0.8, jz = z + (hash(z, x) - 0.5) * gap * 0.8;
      const f = L.forestAt(jx, jz), h = L.heightAt(jx, jz);
      if (h < 1.6 || h > this.snowLine - 4 || f < 0.45 || hash(jx * 0.3, jz * 0.7) > f) continue;
      const bm = L.biomeAt(jx, jz);
      mapTree(c, XX(jx), ZZ(jz), Math.max(1.8, Math.min(7, gap * K * 0.32)), bm === "taiga" || bm === "alpine" || bm === "tundra" || (bm !== "temperate" && bm !== "rainforest" && bm !== "savanna" && hash(jx, jz) < 0.5) ? "spruce" : "birch");
    }
    // and the coast, inked
    relief(c, (x, z) => L.heightAt(x, z), bb, XX, ZZ, { step: st, shade: 0, levels: [0.05], ink: "rgba(59,42,26,0.75)" });
  }
  // close up on the big map, the land drawn again at the scale it's looked at: pieces of it, painted a few at a time
  // as they're wanted (and kept, the last hundred or so), over the whole sheet stretched beneath
  mapTiles(c, X, Z, S) {
    const sh = this.mapSheet(), dpr = Math.min(2, devicePixelRatio || 1), m0 = 2 * this.half / sh.N;
    const lvl = Math.min(Math.ceil(Math.log2(m0 * S * dpr / 1.2)), Math.floor(Math.log2(m0 / 0.35)));
    if (lvl < 1) return;
    const T = 192, mpp = m0 / 2 ** lvl, size = T * mpp, W = c.canvas.width, H = c.canvas.height;
    const tiles = this._tiles ??= new Map(), want = this._tileWant ??= [];
    const i0 = Math.floor((0 - X(-this.half)) / S / size), i1 = Math.floor((W - X(-this.half)) / S / size);
    const j0 = Math.floor(((0 - Z(-this.half)) / S) / size), j1 = Math.floor(((H - Z(-this.half)) / S) / size);
    const n = Math.ceil(2 * this.half / size);
    want.length = 0;
    c.save(); c.imageSmoothingEnabled = true;
    for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
      const key = lvl + ":" + i + ":" + j, t = tiles.get(key), x = -this.half + i * size, z = -this.half + j * size;
      if (t) { t.used = performance.now(); c.drawImage(t.cv, X(x), Z(z), size * S + 0.5, size * S + 0.5); }
      else want.push({ key, x, z, size });
    }
    c.restore();
    { const cx = (W / 2 - X(0)) / S, cz = (H / 2 - Z(0)) / S; want.sort((a, b) => Math.hypot(a.x + a.size / 2 - cx, a.z + a.size / 2 - cz) - Math.hypot(b.x + b.size / 2 - cx, b.z + b.size / 2 - cz)); }
    if (want.length && !this._tileBusy) {
      this._tileBusy = true;
      // (the pieces wanted now, nearest the middle of the view first: the list is the latest drawing's, so a sheet
      //  moved on from isn't painted for nothing)
      const step = () => {
        const t0 = performance.now(), job = this._tileWant;
        while (job.length && performance.now() - t0 < 14) {
          const q = job.shift(); if (tiles.has(q.key)) continue;
          const cv = document.createElement("canvas"); cv.width = cv.height = T;
          this.paintMap(cv.getContext("2d"), q.x, q.z, q.size, T); tiles.set(q.key, { cv, used: performance.now() });
        }
        if (tiles.size > 140) [...tiles.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, tiles.size - 140).forEach(([k]) => tiles.delete(k));
        G.mapRedraw && G.mapRedraw();
        if (job.length) setTimeout(step, 0); else this._tileBusy = false;
      };
      setTimeout(step, 0);
    }
  }
  minimap(c, X, Z, S, big) {
    // down a cave: the cave's own map, the halls you've stood in, and the seams of stone in them
    if (this.cave && this.cave.inside) {
      const cv = this.cave; cv.drawMap(c, X, Z, S);
      c.fillStyle = "#8a8478"; c.strokeStyle = INK; c.lineWidth = 1;
      for (const k of cv.rocks) if (!k.gone && cv.seen.some(i => { const h = cv.halls[i]; return Math.hypot(k.x - h.x, k.z - h.z) < h.r + 1; })) { c.beginPath(); c.arc(X(k.x), Z(k.z), Math.max(3, S * 0.9), 0, Math.PI * 2); c.fill(); c.stroke(); }
      return;
    }
    const sh = this.mapSheet();
    c.save(); c.imageSmoothingEnabled = true;
    c.drawImage(sh.cv, X(-this.half), Z(-this.half), 2 * this.half * S, 2 * this.half * S);
    c.restore();
    if (big) this.mapTiles(c, X, Z, S);
    // close up, the trees themselves
    if (S > 1.4) {
      const W = c.canvas.width, H = c.canvas.height, ts = Math.max(2.2, Math.min(4.2, S * 1.6));
      c.fillStyle = "#3d5a2e";
      for (const ch of this.chunks.values()) {
        if (X(ch.x + CHUNK) < 0 || X(ch.x - CHUNK) > W || Z(ch.z + CHUNK) < 0 || Z(ch.z - CHUNK) > H) continue;
        for (const t of ch.trees) if (!t.gone) mapTree(c, X(t.x), Z(t.z), ts, t.kind);
      }
    }
    // the caves you've come across: a dark arch in the hillside
    for (const cv of (this.caves || new Map()).values()) if (cv.found && cv.mouthAt) caveIcon(c, X(cv.mouthAt.x), Z(cv.mouthAt.z), Math.max(4, Math.min(9, S * 2.2)));
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
      // (no realms on it — there are no nations here: the land by its own great features, and the seas)
      const out = LANDFORMS.map(([name, lon, lat, size]) => ({ kind: "land", name, size, ...at(lon, lat) }));
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
