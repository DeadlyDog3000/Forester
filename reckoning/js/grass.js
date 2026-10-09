// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Grass: tufts of it round about you, thick in the clearing and in the old dry
// drifts under the trees, thin on the moss, none on a path or the road, under a
// house, in a field of rye or round the fire where everyone walks. It stirs in
// the wind with the trees, and lies under the snow in winter. Only the ground
// near you has it; as you walk, it is laid again round where you are.

import { THREE, SNOW, clamp } from "./core.js";
import { addSway, swayGeo } from "./models.js";
import { G } from "./engine.js";
import { CLEARING, CABIN, FIRE, STACK, BLOCK } from "./woods.js";
import { BUILDINGS } from "./town.js";

const R = 26, STEP = 0.38, MAX = 16000;
// a tuft: five blades leaning out from the middle, dark at the foot and paler toward the tips
function tuftGeo() {
  const pos = [], col = [], idx = [];
  for (let b = 0; b < 7; b++) {
    const a = b / 7 * Math.PI * 2 + b * 0.7, lean = 0.1 + (b % 3) * 0.08, h = 0.6 + (b % 4) * 0.16;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.045, pz = dx * 0.045;
    const ox = dx * 0.04 * (b % 2), oz = dz * 0.04 * (b % 2);
    const i0 = pos.length / 3;
    // (a blade: two corners at the foot, a narrower pair halfway, and a point, bending outward as it rises)
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox - px * 0.6 + dx * lean * 0.4, h * 0.55, oz - pz * 0.6 + dz * lean * 0.4, ox + px * 0.6 + dx * lean * 0.4, h * 0.55, oz + pz * 0.6 + dz * lean * 0.4, ox + dx * lean, h, oz + dz * lean);
    for (const k of [0.78, 0.78, 0.95, 0.95, 1.12]) col.push(k, k, k);
    // (both faces, wound each way, both lit from above: a back face shaded as the underside came out black)
    idx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2, i0 + 2, i0 + 3, i0 + 4, i0, i0 + 3, i0 + 1, i0, i0 + 2, i0 + 3, i0 + 2, i0 + 4, i0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // (lit as if from above, like the ground it stands on, not edge-on to the sun)
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
const hash = (i, j, k) => { const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return h - Math.floor(h); };

export class Grass {
  constructor(w) {
    this.w = w;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    addSway(mat);
    this.mesh = new THREE.InstancedMesh(swayGeo(tuftGeo(), MAX), mat, MAX);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    w.root.add(this.mesh);
    this.cx = Infinity; this.cz = Infinity; this.t = 0; this.snowAt = -1;
  }
  update(dt) {
    const p = G.player && G.player.pos; if (!p) return;
    const snow = SNOW.value;
    // (under the snow there is none to see; and none down in the cave)
    this.mesh.visible = snow < 0.55 && !(this.w.cave && this.w.cave.inside);
    if (!this.mesh.visible) return;
    this.t += dt;
    // laid again when you've walked a few metres, and now and then anyway (a house may have gone up)
    if (Math.hypot(p.x - this.cx, p.z - this.cz) > 3 || this.t > 6 || Math.abs(snow - this.snowAt) > 0.1) this.rebuild(p.x, p.z, snow);
  }
  // what never changes about a spot of ground: whether grass grows there at all, where in the cell, how tall, its colour
  // (worked out once, the first time you come near, and kept)
  cell(i, j) {
    const k = i * 100003 + j, cache = this.cache || (this.cache = new Map());
    let q = cache.get(k);
    if (q !== undefined) return q;
    if (cache.size > 250000) cache.clear();
    q = null;
    const w = this.w, x = (i + hash(i, j, 1)) * STEP, z = (j + hash(i, j, 2)) * STEP;
    // how thick it grows here: the clearing's sward, the dry drifts, a little on the moss
    const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
    let dens = clamp((CLEARING.r + 6 - dc) / 8, 0, 1) * 0.95;
    if (dens < 0.3) dens = Math.max(dens, (Math.sin(x * 0.31 + z * 0.17) * Math.sin(x * 0.13 - z * 0.29) + 0.2) * 0.5);
    if (hash(i, j, 3) <= dens * 1.4) {
      // (the road's distance, from a coarser grid of its own: it is the slow part)
      const rk = Math.floor(x / 2) * 100003 + Math.floor(z / 2), rc = this.roadC || (this.roadC = new Map());
      let dr = rc.get(rk); if (dr === undefined) { dr = w.anyRoadDist ? w.anyRoadDist(Math.floor(x / 2) * 2 + 1, Math.floor(z / 2) * 2 + 1).d : 99; rc.set(rk, dr); }
      if (dr > 3.2 && hash(i, j, 3) <= dens * (dr < 6 ? 1.4 : 1)) {
        const c = new THREE.Color();
        w.groundColour ? w.groundColour(x, z, c) : c.set(0x6c7f38);
        c.multiplyScalar(1.05 + hash(i, j, 7) * 0.2);
        if (c.r > c.g * 0.95) c.lerp(new THREE.Color(0xb0a160), 0.4);
        q = { x, z, y: w.heightAt(x, z), sc: 0.22 + hash(i, j, 4) * 0.2, sy: 0.8 + hash(i, j, 6) * 0.6, ry: hash(i, j, 5) * 6.283, ph: (x * 0.9 + z * 0.7) % 6.283, c };
      }
    }
    cache.set(k, q);
    return q;
  }
  rebuild(cx, cz, snow) {
    this.t = 0; this.cx = cx; this.cz = cz; this.snowAt = snow;
    const w = this.w, town = G.town, m = this.mesh, sway = m.geometry.attributes.aSway.array, cols = m.instanceColor.array;
    // what stands on the ground near here, as turned rectangles: [x, z, cos, sin, half width, half depth]
    const rects = [];
    if (town && town.S) for (const b of town.S.buildings) {
      const def = BUILDINGS[b.type]; if (!def || Math.hypot(b.x - cx, b.z - cz) > R + 14) continue;
      const bw = (def.w || 4) * (b.type === "woodshed" ? b.bays || 1 : 1);
      rects.push([b.x, b.z, Math.cos(b.ry || 0), Math.sin(b.ry || 0), bw / 2 + (def.path ? -0.05 : 0.35), (def.d || 4) / 2 + (def.path ? -0.05 : 0.35)]);
    }
    if (w.cabinUp || w.cabin) rects.push([CABIN.x, CABIN.z, Math.cos(CABIN.ry), Math.sin(CABIN.ry), 3.3, 3.9]);
    const spots = [[FIRE.x, FIRE.z, 3.4], [STACK.x, STACK.z, 2.2], [BLOCK.x, BLOCK.z, 1.6]];
    const paved = town && town.streetLvl >= 3 ? CLEARING.r - 2 : 0;
    const c = new THREE.Color(), d = new THREE.Object3D(), dry = new THREE.Color(0xb0a160);
    let n = 0;
    const i0 = Math.floor((cx - R) / STEP), i1 = Math.ceil((cx + R) / STEP), j0 = Math.floor((cz - R) / STEP), j1 = Math.ceil((cz + R) / STEP);
    const autumn = town && town.season === "autumn" ? 0.15 : 0;
    for (let i = i0; i <= i1 && n < MAX; i++) for (let j = j0; j <= j1 && n < MAX; j++) {
      const q = this.cell(i, j); if (!q) continue;
      const x = q.x, z = q.z, dd = Math.hypot(x - cx, z - cz); if (dd > R) continue;
      if (paved && Math.hypot(x - FIRE.x, z - FIRE.z) < paved) continue;
      let hit = false;
      for (const [sx, sz, sr] of spots) if ((x - sx) ** 2 + (z - sz) ** 2 < sr * sr) { hit = true; break; }
      if (!hit) for (const [bx, bz, co, si, hw, hd] of rects) {
        const lx = (x - bx) * co - (z - bz) * si, lz = (x - bx) * si + (z - bz) * co;
        if (Math.abs(lx) < hw && Math.abs(lz) < hd) { hit = true; break; }
      }
      if (hit) continue;
      // (thinning out to nothing at the edge of what's laid, so there's no line where it stops)
      const edge = clamp((R - dd) / 6, 0, 1), sc = q.sc * (0.4 + edge * 0.6) * (1 - snow);
      d.position.set(x, q.y - 0.02, z); d.rotation.set(0, q.ry, 0); d.scale.set(sc * 1.4, sc * q.sy, sc * 1.4);
      d.updateMatrix(); m.setMatrixAt(n, d.matrix);
      sway[n * 3] = q.y; sway[n * 3 + 1] = Math.max(0.6, d.scale.y); sway[n * 3 + 2] = q.ph;
      // the ground's own green, a shade brighter, and straw-coloured in the dry drifts and late in the year
      c.copy(q.c); if (autumn) c.lerp(dry, autumn);
      cols[n * 3] = c.r; cols[n * 3 + 1] = c.g; cols[n * 3 + 2] = c.b;
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.geometry.attributes.aSway.needsUpdate = true;
  }
}
