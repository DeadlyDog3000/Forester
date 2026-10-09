// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Footprints in the snow: yours, and everyone's who walks near you, left foot and
// right, each pressed in where the foot came down and pointing the way they went.
// They fill in again slowly, and quickly while it is still snowing.

import { THREE, SNOW } from "./core.js";
import { G } from "./engine.js";

const MAX = 700, STRIDE = 0.72, LIFE = 240;
const DENT = new THREE.Color(0.6, 0.65, 0.74), FILLED = new THREE.Color(0.92, 0.94, 0.98);

export class Tracks {
  constructor(w) {
    this.w = w;
    // a print: a sole and a heel, as one flat shape
    const s = new THREE.Shape();
    s.absellipse(0, 0.05, 0.055, 0.1, 0, Math.PI * 2);
    const h = new THREE.Path(); h.absellipse(0, -0.1, 0.045, 0.05, 0, Math.PI * 2);
    const g = new THREE.ShapeGeometry([s, new THREE.Shape(h.getPoints())], 10);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(g, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.count = 0;
    w.root.add(this.mesh);
    this.age = new Float32Array(MAX).fill(LIFE); this.next = 0; this.walkers = new WeakMap();
    this.d = new THREE.Object3D(); this.c = new THREE.Color();
  }
  // somebody's foot coming down at x, z, heading yaw (their facing as the actors have it: forward is sin, cos)
  print(x, z, yaw, side) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    const px = Math.cos(yaw) * side * 0.11, pz = -Math.sin(yaw) * side * 0.11;
    const d = this.d; d.position.set(x + px, this.w.heightAt(x + px, z + pz) + 0.015, z + pz); d.rotation.set(0, yaw + side * 0.08, 0); d.scale.setScalar(1);
    d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
    this.age[i] = 0; this.mesh.instanceColor.setXYZ(i, DENT.r, DENT.g, DENT.b);
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.dirty = true;
  }
  // a walker: how far they've come since their last print
  step(who, x, z, yaw) {
    let s = this.walkers.get(who);
    if (!s) { s = { x, z, side: 1 }; this.walkers.set(who, s); return; }
    const dd = Math.hypot(x - s.x, z - s.z);
    if (dd > 6) { s.x = x; s.z = z; return; }                 // (moved by the story, not walked)
    if (dd >= STRIDE) { s.side = -s.side; this.print(x, z, yaw, s.side); s.x = x; s.z = z; }
  }
  update(dt) {
    const snow = SNOW.value, fall = this.w.flakeFall || 0, w = this.w;
    this.mesh.visible = snow > 0.4 && !(w.cave && w.cave.inside);
    // ---- the prints made: yours, and theirs near you ----
    if (snow > 0.5) {
      const pl = G.player, town = G.town;
      const onSnow = (x, z) => !w.insideCabin(x, z);
      if (pl && pl.onGround !== false && !pl.horse && onSnow(pl.pos.x, pl.pos.z)) this.step(pl, pl.pos.x, pl.pos.z, pl.yaw + Math.PI);
      if (town) for (const a of town.actors) {
        if (a.inside || a.dead || a.lying || !a.root.visible) continue;
        if (Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) > 35) continue;
        if (onSnow(a.pos.x, a.pos.z)) this.step(a, a.pos.x, a.pos.z, a.yaw || 0);
      }
    }
    // ---- and filling in: slowly, quickly while it snows, all at once when the snow's gone ----
    const rate = dt * (1 + fall * 8);
    let changed = this.dirty; this.dirty = false;
    for (let i = 0; i < this.mesh.count; i++) {
      if (this.age[i] >= LIFE) continue;
      this.age[i] = snow < 0.4 ? LIFE : this.age[i] + rate;
      const k = Math.min(1, this.age[i] / LIFE) ** 1.5;
      this.c.copy(DENT).lerp(FILLED, k);
      this.mesh.instanceColor.setXYZ(i, this.c.r, this.c.g, this.c.b);
      if (this.age[i] >= LIFE) { this.mesh.getMatrixAt(i, M); M.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, M); }
      changed = true;
    }
    if (changed) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
}
const M = new THREE.Matrix4();
