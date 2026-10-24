// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The brook: out of the pond at the lowest of its bank, running east and down
// through the trees to a boggy pool in a hollow. Shallow enough to wade, with
// rushes along it and the sound of it as you come near.

import { THREE } from "./core.js";
import { G } from "./engine.js";
import { AUDIO } from "./audio.js";
import { WaterMat, trackWater } from "./water.js";
import { addSway, swayGeo } from "./models.js";
import { rushGeo } from "./pond.js";
import { pondK } from "./woods.js";

export class Brook {
  constructor(w) {
    this.w = w;
    const B = w.brook, pts = B.pts, g = new THREE.Group();
    this.wm = new WaterMat({ deep: [0.035, 0.05, 0.035], round: [0.05, 0.075, 0.045], flow: 1 });
    // ---- the water: a ribbon along the course, its level falling with it, a little wider than the bed ----
    // (the course drawn smooth — rounded twice, corner by corner — so a bend is a bend and not a fold, and run on a
    //  little way into the pond it leaves and the pool it ends in, so it's of a piece with both, with no cut end)
    const P = [], U = [], I = [];
    let C = pts.map(p => ({ x: p.x, z: p.z, w: p.w }));
    { const a = C[0], b = C[1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; C.unshift({ x: a.x - (b.x - a.x) / l * 2.5, z: a.z - (b.z - a.z) / l * 2.5, w: a.w * 1.3 }); }
    { const E = B.end, a = C[C.length - 1], l = Math.hypot(E.x - a.x, E.z - a.z); if (l > 0.5) C.push({ x: a.x + (E.x - a.x) * 0.6, z: a.z + (E.z - a.z) * 0.6, w: a.w * 1.2 }); }
    for (let k = 0; k < 2; k++) {
      const N = [C[0]];
      for (let i = 0; i < C.length - 1; i++) { const a = C[i], b = C[i + 1]; N.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25, w: a.w * 0.75 + b.w * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75, w: a.w * 0.25 + b.w * 0.75 }); }
      N.push(C[C.length - 1]); C = N;
    }
    let len = 0, yRun = w.pondLevel;
    for (let i = 0; i < C.length; i++) {
      const a = C[Math.max(0, i - 2)], b = C[Math.min(C.length - 1, i + 2)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l, p = C[i], hw = p.w * 1.15;
      if (i) len += Math.hypot(p.x - C[i - 1].x, p.z - C[i - 1].z);
      // (laid on the ground as it's drawn, a little proud of it — the ground here is drawn in facets four metres across,
      //  coarser than the channel, so a level held to the pond's sank out of sight under the bank, and the brook seemed to
      //  start out of nowhere: it follows what's drawn instead; out in the pond and the pool, at their own level)
      const ya = w.meshHeightAt(p.x + nx * hw, p.z + nz * hw) + 0.06, yb = w.meshHeightAt(p.x - nx * hw, p.z - nz * hw) + 0.06;
      const yc = w.meshHeightAt(p.x, p.z) + 0.06;
      let y = Math.max(ya, yb, yc);
      if (pondK(p.x, p.z) < 1) y = Math.min(y, w.pondLevel + 0.02);
      if (Math.hypot(p.x - B.end.x, p.z - B.end.z) < B.end.r + 0.4) y = Math.min(y, B.end.y + 0.04);
      yRun = y;
      P.push(p.x + nx * hw, Math.max(Math.min(ya, y), y - 0.1), p.z + nz * hw, p.x - nx * hw, Math.max(Math.min(yb, y), y - 0.1), p.z - nz * hw);
      U.push(0, len / 2.5, 1, len / 2.5);
      if (i) { const k = i * 2; I.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I); geo.computeVertexNormals();
    this.wm.mat.side = THREE.DoubleSide;
    this.water = new THREE.Mesh(geo, this.wm.mat); g.add(this.water);
    // ---- the boggy pool it ends in: still water (the same, but nothing running in it) ----
    this.wmPool = new WaterMat({ deep: [0.03, 0.04, 0.025], round: [0.05, 0.07, 0.04] });
    // (the pool it ended in is gone: the brook runs out into the hollow and soaks away)
    const E = B.end;
    // ---- rushes along the banks, thick round the pool ----
    const RN = 120, rm = new THREE.InstancedMesh(swayGeo(rushGeo(), RN), addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), RN);
    const d = new THREE.Object3D(), sw = rm.geometry.attributes.aSway.array;
    let n = 0;
    for (let i = 0; i < RN * 3 && n < RN; i++) {
      let x, z;
      if (Math.random() < 0.4) { const a = Math.random() * 6.28, r = E.r * (0.85 + Math.random() * 0.4); x = E.x + Math.cos(a) * r; z = E.z + Math.sin(a) * r; }
      else { const k = 1 + Math.floor(Math.random() * (pts.length - 2)), p = pts[k], q = pts[k + 1] || p, side = Math.random() < 0.5 ? 1 : -1, l = Math.hypot(q.x - p.x, q.z - p.z) || 1, off = p.w * (1.0 + Math.random() * 0.6); x = p.x - (q.z - p.z) / l * off * side; z = p.z + (q.x - p.x) / l * off * side; }
      if (Math.random() < 0.35) continue;
      const y = w.heightAt(x, z), s = 0.7 + Math.random() * 0.6;
      d.position.set(x, y, z); d.rotation.set(0, Math.random() * 6.28, 0); d.scale.set(s, s * (0.8 + Math.random() * 0.5), s); d.updateMatrix();
      rm.setMatrixAt(n, d.matrix); sw[n * 3] = y; sw[n * 3 + 1] = 1.4 * s; sw[n * 3 + 2] = x * 0.3; n++;
    }
    rm.count = n; rm.receiveShadow = true; g.add(rm); this.rushes = rm;
    w.root.add(g); this.g = g; this.t = 0;
  }
  update(dt) {
    const w = this.w, town = G.town, ice = !!(town && town.winter && (w.snowK || 0) > 0.5);
    this.wm.update(dt, { rain: w.rainK || 0, ice }); this.wmPool.update(dt, { rain: w.rainK || 0, ice });
    // (frozen in winter: the running stops)
    this.wm.uni.uFlow.value = ice ? 0 : 1;
    if (town && this._rs !== town.season) { this._rs = town.season; this.rushes.material.color.set(town.season === "winter" ? 0xb08a60 : town.season === "autumn" ? 0xd8c890 : 0xffffff); }
    // the sound of it, louder the nearer you are (and none when it's frozen, or you're far off)
    const p = G.player && G.player.pos; if (!p) return;
    const q = w.brookAt(p.x, p.z), k = !ice && q ? Math.max(0, 1 - q.d / 22) : 0;
    if (Math.abs(k - (this.k ?? -1)) > 0.03) { this.k = k; AUDIO.brook && AUDIO.brook(k); }
  }
}
