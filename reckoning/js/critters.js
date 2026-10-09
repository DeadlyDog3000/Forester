// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Red squirrels: a few about the forest floor round you, bounding from tree to
// tree, sitting up now and then to look about with the tail curled over the back;
// come near and one is off to the nearest trunk and up it in a spiral, to sit on
// a branch out of reach until you've gone.

import { THREE } from "./core.js";
import { G } from "./engine.js";
import { CLEARING } from "./woods.js";

const COL = 0x9a4a22, BELLY = 0xe8d8c0;
function squirrelMesh() {
  const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const fur = M(COL), belly = M(BELLY), dark = M(0x1a1410);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), fur); body.scale.set(0.8, 0.85, 1.4); body.position.set(0, 0.07, 0); g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), belly); chest.position.set(0, 0.06, 0.05); g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), fur); head.scale.set(0.9, 0.9, 1.15); head.position.set(0, 0.11, 0.09); g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 4), fur); ear.position.set(s * 0.018, 0.15, 0.08); g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 4, 3), dark); eye.position.set(s * 0.022, 0.12, 0.115); g.add(eye);
  }
  // the tail: a big plume, curved up over the back
  const tail = new THREE.Group(); tail.position.set(0, 0.07, -0.08); g.add(tail);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.04 + i * 0.004, 6, 5), fur);
    const a = i / 3 * 1.6;
    p.position.set(0, Math.sin(a) * 0.1, -Math.cos(a) * 0.05 - 0.02); p.scale.set(0.8, 1.2, 0.9); tail.add(p);
  }
  g.userData.tail = tail; g.userData.body = body; g.userData.head = head;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Squirrels {
  constructor(w) { this.w = w; this.list = []; this.t = 0; this.spawnT = 1; }
  // a tree near x, z to make for (the forest's own trees, standing)
  treeNear(x, z, r = 12) {
    let best = null, bd = r * r;
    for (const t of this.w.forest) { if (t.gone) continue; const dx = t.x - x, dz = t.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = t; } }
    return best;
  }
  spawn(p) {
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 25, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + 6) return;
    const t = this.treeNear(x, z, 8); if (!t) return;
    const m = squirrelMesh(); this.w.root.add(m);
    this.list.push({ m, x: t.x + 0.6, z: t.z + 0.4, y: this.w.heightAt(t.x, t.z), state: "sit", t: 1 + Math.random() * 3, yaw: Math.random() * 6.28, tree: t, climb: 0 });
  }
  remove(s) { this.w.root.remove(s.m); this.list.splice(this.list.indexOf(s), 1); }
  update(dt) {
    const p = G.player && G.player.pos, T = G.town; if (!p) return;
    this.t += dt;
    const night = T && (T.frac > 0.74 || T.frac < 0.04), rain = (this.w.rainK || 0) > 0.5;
    // (a few about by day, none in the dark or a downpour; they go in when you're far off)
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 5; if (!night && !rain && this.list.length < 4) this.spawn(p); }
    for (const s of this.list.slice()) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 90 || ((night || rain) && s.state !== "up")) { this.remove(s); continue; }
      s.t -= dt;
      // seen: off to the tree and up it
      if (d < 9 && s.state !== "up" && s.state !== "climb" && s.state !== "flee") { s.state = "flee"; s.tree = this.treeNear(s.x, s.z, 15) || s.tree; }
      if (s.state === "sit") {
        if (s.t <= 0) { s.state = "hop"; s.t = 1.5 + Math.random() * 2; const a = Math.random() * 6.28, t2 = Math.random() < 0.5 && this.treeNear(s.x + Math.cos(a) * 6, s.z + Math.sin(a) * 6, 6); s.goal = t2 ? { x: t2.x + 0.5, z: t2.z + 0.5 } : { x: s.x + Math.cos(a) * 3, z: s.z + Math.sin(a) * 3 }; }
      } else if (s.state === "hop" || s.state === "flee") {
        const g = s.state === "flee" ? { x: s.tree.x + 0.25, z: s.tree.z + 0.25 } : s.goal, dx = g.x - s.x, dz = g.z - s.z, dd = Math.hypot(dx, dz);
        const sp = s.state === "flee" ? 4.5 : 1.6;
        if (dd < 0.15) { if (s.state === "flee") { s.state = "climb"; s.climb = 0; s.top = 2.5 + Math.random() * 3; } else { s.state = "sit"; s.t = 1.5 + Math.random() * 4; } }
        else { s.x += dx / dd * sp * dt; s.z += dz / dd * sp * dt; s.yaw = Math.atan2(dx, dz); }
      } else if (s.state === "climb") {
        s.climb = Math.min(s.top, s.climb + dt * 2.2);
        if (s.climb >= s.top) { s.state = "up"; s.t = 8 + Math.random() * 10; }
      } else if (s.state === "up") {
        // (down again once you've gone off a way)
        if (s.t <= 0 && d > 14) { s.state = "down"; }
      } else if (s.state === "down") {
        s.climb = Math.max(0, s.climb - dt * 1.6);
        if (s.climb <= 0) { s.state = "sit"; s.t = 2; s.x += 0.4; }
      }
      // ---- placing it: bounding along the ground, or round the trunk ----
      const m = s.m, gy = this.w.heightAt(s.x, s.z);
      if (s.state === "climb" || s.state === "up" || s.state === "down") {
        const t = s.tree, a = s.climb * 2.2 + (s.ph || (s.ph = Math.random() * 6));
        const r = 0.22 + (t.kind === "birch" ? 0 : 0.08);
        m.position.set(t.x + Math.cos(a) * r, gy + s.climb, t.z + Math.sin(a) * r);
        // (head up the trunk climbing, head down coming down, flat to the bark)
        m.rotation.set(s.state === "down" ? Math.PI / 2 : -Math.PI / 2, -a + Math.PI / 2, 0, "YXZ");
      } else {
        const hop = s.state === "hop" || s.state === "flee" ? Math.abs(Math.sin(this.t * (s.state === "flee" ? 14 : 9))) * (s.state === "flee" ? 0.12 : 0.08) : 0;
        m.position.set(s.x, gy + hop, s.z);
        m.rotation.set(s.state === "sit" ? -0.6 : 0, s.yaw, 0, "YXZ");
      }
      // (the tail: up and curled sitting, streaming out behind running)
      m.userData.tail.rotation.x = s.state === "sit" ? 0.2 + Math.sin(this.t * 3 + s.yaw) * 0.08 : -0.5;
    }
  }
}
