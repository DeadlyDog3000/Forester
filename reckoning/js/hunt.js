// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Hunting: roe deer and hares in the woods, and arrows that fly as arrows do —
// they drop, they stick where they land, and you go and pull them out again.
//
// An animal grazes, lifts its head, walks a little way and grazes again. It
// hears you before it sees you: a runner a long way off, a walker at a stone's
// throw, a crouching hunter only close to. Startled, it bolts away from you and
// does not stop for a while. One good arrow brings a hare down; a deer wants a
// well-drawn one, or two.

import { THREE, clamp } from "./core.js";
import { G } from "./engine.js";
import { modelCopy } from "./models.js";
import { UI } from "./ui.js";

/* global SFX */

const KINDS = {
  deer: { name: "roe deer", r: 0.34, h: 0.8, len: 0.42, walk: 0.9, run: 8.5, hp: 2, meat: 3, hearRun: 30, hearWalk: 15, hearCreep: 5.5, stride: 1.6 },
  hare: { name: "hare", r: 0.16, h: 0.2, len: 0.12, walk: 0.6, run: 7.5, hp: 1, meat: 1, hearRun: 22, hearWalk: 10, hearCreep: 3.5, stride: 0.7 },
};
const GRAVITY = 9.8;

class Animal {
  constructor(hunt, kind, x, z) {
    this.hunt = hunt; this.kind = kind; this.K = KINDS[kind];
    const m = modelCopy(kind);
    this.root = new THREE.Group(); this.root.rotation.order = "YXZ";
    if (m) this.root.add(m.scene);
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(this.K.r * 1.2, this.K.r * 1.4, this.K.len * 2.4), new THREE.MeshStandardMaterial({ color: 0x8a5a3a })); b.position.y = this.K.h; this.root.add(b); }
    const find = n => this.root.getObjectByName(n);
    this.legs = ["legFL", "legFR", "legHL", "legHR"].map(find);
    this.neck = find("neck");
    this.neck0 = this.neck ? this.neck.rotation.x : 0;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.state = "graze"; this.t = 1 + Math.random() * 4;
    this.speed = 0; this.phase = Math.random() * 6; this.head = 1; this.hp = this.K.hp;
    this.target = null; this.fear = 0; this.fall = 0;
    hunt.w.root.add(this.root);
    this.sync();
  }
  get alive() { return this.state !== "dead"; }
  centre() { return new THREE.Vector3(this.pos.x, this.pos.y + this.K.h, this.pos.z); }
  sync() {
    const w = this.hunt.w;
    this.pos.y = w.heightAt(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
  // an arrow in it: power is how far the bow was drawn
  hit(power) {
    if (!this.alive) return;
    this.hp -= power > 0.7 ? 2 : 1;
    G.practise && G.practise("archery", 3);
    if (this.hp <= 0) { this.state = "dead"; this.fall = 0; this.speed = 0; this.hunt.onDown(this); SFX.treeFall && SFX.treeFall(0.3); return; }
    this.startle(G.player.pos, 1.5);
  }
  startle(from, k = 1) {
    if (!this.alive) return;
    // away from what frightened it, and a little to one side
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
    const a = Math.atan2(dx / l, dz / l) + (Math.random() - 0.5) * 0.8;
    this.target = { x: this.pos.x + Math.sin(a) * 40, z: this.pos.z + Math.cos(a) * 40 };
    this.state = "flee"; this.t = 5 + Math.random() * 3 * k; this.fear = 1;
    // the others see it go
    for (const o of this.hunt.animals) if (o !== this && o.alive && o.state !== "flee" && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 14) o.startle(from, 0.8);
  }
  update(dt) {
    const K = this.K, pl = G.player, home = this.hunt.home;
    if (this.state === "dead") {
      this.fall = Math.min(1, this.fall + dt * 2.2);
      const e = this.fall * this.fall;
      this.root.rotation.z = e * Math.PI / 2;
      this.root.position.y = this.pos.y + e * K.r * 0.55;
      for (const l of this.legs) if (l) l.rotation.x *= 0.9;
      return;
    }
    // what it hears of you
    const d = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    const loud = pl.speed > 4 ? K.hearRun : pl.speed > 0.4 ? (pl.crouched ? K.hearCreep : K.hearWalk) : 2.2;
    if (d < loud && this.state !== "flee") this.startle(pl.pos);
    this.t -= dt;
    let want = 0;
    if (this.state === "graze") {
      this.head += (0 - this.head) * Math.min(1, dt * 2);
      if (this.t <= 0) {
        // a few steps to fresh grass, never far from home
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
        let tx = this.pos.x + Math.sin(a) * r, tz = this.pos.z + Math.cos(a) * r;
        if (Math.hypot(tx - home.x, tz - home.z) > home.r) { tx = home.x + (Math.random() - 0.5) * home.r; tz = home.z + (Math.random() - 0.5) * home.r; }
        this.target = { x: tx, z: tz }; this.state = "walk"; this.t = 12;
      }
    } else if (this.state === "walk") {
      this.head += (1 - this.head) * Math.min(1, dt * 3);
      want = K.walk;
      if (!this.target || this.t <= 0 || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 0.6) { this.state = "graze"; this.t = 3 + Math.random() * 7; }
    } else if (this.state === "flee") {
      this.head = 1;
      want = K.run * (this.t > 1.5 ? 1 : 0.5);
      if (this.t <= 0) { this.state = "walk"; this.t = 6; this.target = { x: home.x + (Math.random() - 0.5) * home.r, z: home.z + (Math.random() - 0.5) * home.r }; }
    }
    this.speed += (want - this.speed) * Math.min(1, dt * (this.state === "flee" ? 4 : 2));
    if (this.target && this.speed > 0.05) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const turn = Math.atan2(dx, dz) - this.yaw;
      this.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * (this.state === "flee" ? 5 : 2));
      this.pos.x += Math.sin(this.yaw) * this.speed * dt; this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      // round the trunks, not through them
      const before = this.pos.clone();
      this.hunt.w.col.resolve(this.pos, K.r * 0.8, this.pos.y + 0.2, K.h);
      if (before.distanceTo(this.pos) > 0.001 && this.state !== "flee") this.yaw += dt * 2;
      // a fleeing animal that has run out of woods turns back into them
      if (Math.hypot(this.pos.x - home.x, this.pos.z - home.z) > home.r + 25) this.target = { x: home.x, z: home.z };
    }
    // the legs: a walk moves them in diagonal pairs, a bolt throws the fronts and the hinds together
    this.phase += dt * this.speed / K.stride * Math.PI * 2;
    const run = clamp((this.speed - K.walk) / (K.run - K.walk), 0, 1), amp = clamp(this.speed / K.walk, 0, 1) * (0.45 + run * 0.35);
    const off = run > 0.5 ? [0, 0, Math.PI, Math.PI] : [0, Math.PI, Math.PI, 0];
    this.legs.forEach((l, i) => { if (l) l.rotation.x = Math.sin(this.phase + off[i]) * amp; });
    if (this.neck) this.neck.rotation.x = this.neck0 + (1 - this.head) * (this.kind === "deer" ? 1.1 : 0.4) + Math.sin(G.time * 3 + this.phase) * 0.03 * (1 - this.head);
    // a hare bounds; a deer lifts at the gallop
    this.root.position.y = this.pos.y + Math.abs(Math.sin(this.phase)) * run * (this.kind === "hare" ? 0.12 : 0.08);
    this.root.position.x = this.pos.x; this.root.position.z = this.pos.z;
    this.root.rotation.y = this.yaw;
    this.pos.y = this.hunt.w.heightAt(this.pos.x, this.pos.z);
  }
}

export class Hunt {
  // home: {x, z, r} — where the herd lives. onDown(animal) when one falls; onDress(animal, meat) when you take the meat.
  constructor(w, home, { onDown, onDress } = {}) {
    this.w = w; this.home = home; this.animals = []; this.arrows = [];
    this._onDown = onDown; this._onDress = onDress;
    G.hunt = this;
    this._tick = dt => this.update(dt);
    G.onFrame.push(this._tick);
  }
  // somewhere in the herd's ground that isn't inside a tree
  spot() {
    const h = this.home;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * h.r;
      const x = h.x + Math.sin(a) * r, z = h.z + Math.cos(a) * r;
      // (never where you would see it appear: well away from you, when there is room)
      const p = G.player && G.player.pos;
      if (p && i < 30 && Math.hypot(p.x - x, p.z - z) < 28) continue;
      if (!this.w.col.solidAt(x, this.w.heightAt(x, z) + 0.5, z, 0.6)) return [x, z];
    }
    return [h.x, h.z];
  }
  spawn(kind, n = 1) { for (let i = 0; i < n; i++) { const [x, z] = this.spot(); this.animals.push(new Animal(this, kind, x, z)); } }
  onDown(a) {
    // a fallen beast can be dressed where it lies
    const it = this.w.addInteract({ get x() { return a.pos.x; }, get z() { return a.pos.z; }, get y() { return a.pos.y + 0.4; }, reach: 2.2, hold: 2.2,
      label: `Dress the ${a.K.name}`,
      onHoldTick: (dt, t) => { if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) SFX.pickup && SFX.pickup(); },
      use: () => {
        this.w.removeInteract(it);
        this.w.root.remove(a.root);
        this.animals.splice(this.animals.indexOf(a), 1);
        // the arrows that were in it come back to the quiver
        for (const ar of this.arrows.filter(r => r.in === a)) { G.player.arrows = (G.player.arrows || 0) + 1; this.arrows.splice(this.arrows.indexOf(ar), 1); }
        this._onDress && this._onDress(a, a.K.meat);
      } });
    this._onDown && this._onDown(a);
  }
  loose(from, dir, power) {
    const m = modelCopy("arrow");
    const mesh = m ? m.scene : new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.74).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb89a6a }));
    this.w.root.add(mesh);
    const ar = { mesh, pos: from.clone(), vel: dir.clone().multiplyScalar(14 + 32 * power), power, t: 0, stuck: false };
    this.arrows.push(ar);
    this.orient(ar);
  }
  orient(ar) { ar.mesh.position.copy(ar.pos); ar.mesh.lookAt(ar.pos.clone().add(ar.vel)); }
  // an arrow has come to rest; it can be pulled out and used again
  stick(ar, into = null) {
    ar.stuck = true; ar.in = into;
    if (into) {
      // carried along with the animal
      into.root.attach(ar.mesh);
      return;
    }
    ar.it = this.w.addInteract({ x: ar.pos.x, y: ar.pos.y, z: ar.pos.z, reach: 2.0, label: "Pull the arrow out",
      use: () => { this.w.removeInteract(ar.it); this.w.root.remove(ar.mesh); this.arrows.splice(this.arrows.indexOf(ar), 1); G.player.arrows = (G.player.arrows || 0) + 1; SFX.pickup && SFX.pickup(); } });
  }
  update(dt) {
    const w = this.w;
    for (const ar of this.arrows) {
      if (ar.stuck) continue;
      // a few small steps a frame, so a fast arrow can't pass through a hare
      const steps = 4, h = Math.min(dt, 0.05) / steps;
      for (let s = 0; s < steps && !ar.stuck; s++) {
        ar.vel.y -= GRAVITY * h;
        ar.pos.addScaledVector(ar.vel, h);
        ar.t += h;
        for (const a of this.animals) {
          if (!a.alive) continue;
          // the body is a short capsule along the animal's length
          const c = a.centre(), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
          const along = clamp((ar.pos.x - c.x) * fx + (ar.pos.z - c.z) * fz, -a.K.len, a.K.len);
          const px = c.x + fx * along, pz = c.z + fz * along;
          if (Math.hypot(ar.pos.x - px, ar.pos.y - c.y, ar.pos.z - pz) < a.K.r) { this.stick(ar, a); a.hit(ar.power); UI.hint && null; break; }
        }
        if (ar.stuck) break;
        const gy = w.heightAt(ar.pos.x, ar.pos.z);
        if (ar.pos.y <= gy + 0.02) { ar.pos.y = gy + 0.05; this.stick(ar); break; }
        if (w.col.solidAt(ar.pos.x, ar.pos.y, ar.pos.z, 0)) { this.stick(ar); break; }
        if (ar.t > 6) { this.stick(ar); break; }
      }
      if (!ar.stuck || !ar.in) this.orient(ar);
    }
    for (const a of this.animals) a.update(dt);
  }
  stop() {
    const i = G.onFrame.indexOf(this._tick); if (i >= 0) G.onFrame.splice(i, 1);
    for (const a of this.animals) this.w.root.remove(a.root);
    for (const ar of this.arrows) { if (ar.it) this.w.removeInteract(ar.it); if (ar.mesh.parent) ar.mesh.parent.remove(ar.mesh); }
    this.animals = []; this.arrows = [];
    if (G.hunt === this) G.hunt = null;
  }
}
