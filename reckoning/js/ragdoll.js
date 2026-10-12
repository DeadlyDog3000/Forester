// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// FALLING DOWN DEAD, as a body does: no animation, but the body let go — a point at every joint, held to its
// neighbours by the bones between them (and across the trunk, so the chest keeps its shape), pulled down, pushed by
// whatever struck it, stopped by the ground and dragged by it. Each frame the skeleton's bones are turned to lie along
// those points, from the hips outward. What was in the hands drops and tumbles to the ground on its own.

import { THREE } from "./core.js";
import { G } from "./engine.js";

const GRAV = 9.8, ITER = 10, FRICTION = 0.82, DAMP = 0.995;
const live = new Set();
let ticking = false;
function tick(dt) {
  dt = Math.min(dt, 1 / 30);
  for (const r of live) r.step(dt);
  for (const t of things) stepThing(t, dt);
}
function ensureTick() {
  if (ticking) return; ticking = true;
  const f = dt => tick(dt);
  // (the frame loop's own list is cleared between scenes: put back whenever it's gone)
  setInterval(() => { if (!G.onFrame.includes(f)) G.onFrame.push(f); }, 250);
  G.onFrame.push(f);
}

// the joints: a name, the bone whose head it is (or "tip" of a bone: a little past its end), and its weight
const SIDES = ["L", "R"];
const JOINTS = [["pelvis", "hips"], ["spine", "spine"], ["chest", "chest"], ["neck", "neck"], ["head", "head"], ["crown", "head", 0.2]];
for (const s of SIDES) JOINTS.push([`sh${s}`, `upper_arm.${s}`], [`el${s}`, `forearm.${s}`], [`wr${s}`, `hand.${s}`], [`hd${s}`, `hand.${s}`, 0.09],
  [`hp${s}`, `thigh.${s}`], [`kn${s}`, `shin.${s}`], [`an${s}`, `foot.${s}`], [`to${s}`, `foot.${s}`, 0.13]);
// the sticks between them (the bones), and braces across the trunk; [a, b, slack]: slack lets a brace give a little
const STICKS = [["pelvis", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"], ["head", "crown"], ["shL", "shR"], ["hpL", "hpR"],
  ["chest", "shL"], ["chest", "shR"], ["neck", "shL"], ["neck", "shR"], ["pelvis", "hpL"], ["pelvis", "hpR"],
  ["shL", "hpL", 0.04], ["shR", "hpR", 0.04], ["shL", "hpR", 0.04], ["shR", "hpL", 0.04], ["spine", "shL", 0.03], ["spine", "shR", 0.03], ["crown", "chest", 0.03], ["head", "shL", 0.05], ["head", "shR", 0.05]];
for (const s of SIDES) STICKS.push([`sh${s}`, `el${s}`], [`el${s}`, `wr${s}`], [`wr${s}`, `hd${s}`], [`hp${s}`, `kn${s}`], [`kn${s}`, `an${s}`], [`an${s}`, `to${s}`],
  // (a knee and an elbow bend one way only, near enough: kept from folding flat back on themselves)
  [`hp${s}`, `an${s}`, -1], [`sh${s}`, `wr${s}`, -1], [`kn${s}`, `to${s}`, 0.02]);
// the bones turned to lie along the points: [bone, from joint, to joint], parents before children
const DRIVE = [["spine", "spine", "chest"], ["chest", "chest", "neck"], ["neck", "neck", "head"], ["head", "head", "crown"]];
for (const s of SIDES) DRIVE.push([`upper_arm.${s}`, `sh${s}`, `el${s}`], [`forearm.${s}`, `el${s}`, `wr${s}`], [`hand.${s}`, `wr${s}`, `hd${s}`],
  [`thigh.${s}`, `hp${s}`, `kn${s}`], [`shin.${s}`, `kn${s}`, `an${s}`], [`foot.${s}`, `an${s}`, `to${s}`]);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
function turn(bone, fromW, toW) {
  if (fromW.lengthSq() < 1e-10 || toW.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(_a.copy(fromW).normalize(), _b.copy(toW).normalize());
  bone.getWorldQuaternion(_qw); bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_q.multiply(_qw)));
  bone.updateMatrixWorld(true);
}

class Ragdoll {
  // P: a person (makePerson) with a skeleton; push: a velocity (world) for the blow; at: where it landed (a joint
  // name: "chest", "head"...)
  constructor(P, push, at = "chest") {
    this.P = P; const B = this.B = P.bones;
    P.root.updateMatrixWorld(true);
    this.saved = Object.values(B).filter((b, i, a) => a.indexOf(b) === i).map(b => [b, b.quaternion.clone(), b.position.clone()]);
    this.p = {}; this.o = {}; this.tips = {};
    for (const [n, bone, tip] of JOINTS) {
      const b = B[bone]; if (!b) continue;
      const w = b.getWorldPosition(new THREE.Vector3());
      if (tip) {
        // (a little past the end of the bone, the way it points: the fingers, the toes, the top of the head)
        const par = b.parent && b.parent.isBone ? b.parent.getWorldPosition(new THREE.Vector3()) : w.clone().add(new THREE.Vector3(0, -0.1, 0));
        const dir = n === "crown" ? new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())) : w.clone().sub(par).normalize();
        if (n.startsWith("to")) { const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(P.root.getWorldQuaternion(new THREE.Quaternion())); dir.copy(fw).multiplyScalar(0.9).add(new THREE.Vector3(0, -0.2, 0)).normalize(); }
        w.addScaledVector(dir, tip);
      }
      this.p[n] = w; this.o[n] = w.clone();
    }
    this.ok = ["pelvis", "chest", "head", "shL", "shR", "hpL", "hpR"].every(n => this.p[n]);
    if (!this.ok) return;
    this.sticks = STICKS.filter(([a, b]) => this.p[a] && this.p[b]).map(([a, b, slack = 0]) => [a, b, this.p[a].distanceTo(this.p[b]), slack]);
    // the blow: the whole body given a little of it, the place struck most; and a sag at the knees to start the fall
    const v = push || new THREE.Vector3();
    for (const n in this.o) {
      const near = n === at ? 1 : (at === "head" && (n === "crown" || n === "neck")) || (at === "chest" && /^(sh|neck|spine)/.test(n)) ? 0.7 : 0.25;
      this.o[n].addScaledVector(v, -near / 60);
      if (/^kn/.test(n)) this.o[n].add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.01, (Math.random() - 0.5) * 0.02));
    }
    // (where each bone's own tip is, in its own frame: so it can be turned to point anywhere)
    for (const [bone, , to] of DRIVE) { const b = B[bone]; if (b && this.p[to]) this.tips[bone] = b.worldToLocal(this.p[to].clone()); }
    this.t = 0; P.rag = this; live.add(this); ensureTick();
  }
  step(dt) {
    this.t += dt;
    const w = G.world, p = this.p, o = this.o;
    // (after a while it's still: no more working out)
    if (this.t > 8) return;
    for (const n in p) {
      const c = p[n], prev = o[n], vx = (c.x - prev.x) * DAMP, vy = (c.y - prev.y) * DAMP, vz = (c.z - prev.z) * DAMP;
      prev.copy(c); c.x += vx; c.y += vy - GRAV * dt * dt; c.z += vz;
    }
    for (let k = 0; k < ITER; k++) {
      for (const [a, b, len, slack] of this.sticks) {
        const A = p[a], B2 = p[b], dx = B2.x - A.x, dy = B2.y - A.y, dz = B2.z - A.z, d = Math.hypot(dx, dy, dz) || 1e-6;
        let target = len;
        if (slack < 0) { if (d >= len * 0.55) continue; target = len * 0.55; }        // (only kept from folding too far)
        else if (slack > 0) { if (Math.abs(d - len) < slack) continue; target = d > len ? len + slack : len - slack; }
        const f = (d - target) / d * 0.5;
        A.x += dx * f; A.y += dy * f; A.z += dz * f; B2.x -= dx * f; B2.y -= dy * f; B2.z -= dz * f;
      }
      // the ground: nothing through it, and what touches it dragged
      for (const n in p) {
        const c = p[n], r = n === "head" || n === "crown" ? 0.09 : n === "pelvis" || n === "chest" ? 0.11 : 0.05;
        const gy = (w && w.heightAt ? w.heightAt(c.x, c.z) : 0) + r;
        if (c.y < gy) { c.y = gy; const pr = o[n]; pr.x = c.x - (c.x - pr.x) * FRICTION; pr.z = c.z - (c.z - pr.z) * FRICTION; }
      }
    }
    this.pose();
  }
  // the skeleton laid along the points
  pose() {
    const B = this.B, p = this.p, h = B.hips;
    if (h) {
      h.position.copy(h.parent.worldToLocal(p.pelvis.clone()));
      h.updateMatrixWorld(true);
      // (the hips: pointing up the spine, and turned so the hip joints lie across where they should)
      const sp = B.spine && B.spine.getWorldPosition(new THREE.Vector3()), hw = h.getWorldPosition(new THREE.Vector3());
      if (sp) turn(h, sp.sub(hw), p.spine.clone().sub(hw));
      const tl = B["thigh.L"], tr = B["thigh.R"];
      if (tl && tr) {
        const axis = p.spine.clone().sub(p.pelvis).normalize();
        const now = tr.getWorldPosition(new THREE.Vector3()).sub(tl.getWorldPosition(new THREE.Vector3())), want = p.hpR.clone().sub(p.hpL);
        now.addScaledVector(axis, -now.dot(axis)); want.addScaledVector(axis, -want.dot(axis));
        turn(h, now, want);
      }
    }
    for (const [bone, from, to] of DRIVE) {
      const b = B[bone], tip = this.tips[bone]; if (!b || !tip || !p[to]) continue;
      const head = b.getWorldPosition(new THREE.Vector3()), now = b.localToWorld(tip.clone()).sub(head);
      turn(b, now, p[to].clone().sub(head));
    }
  }
  stop() {
    live.delete(this);
    for (const [b, q, pos] of this.saved) { b.quaternion.copy(q); b.position.copy(pos); }
    if (this.P.rag === this) this.P.rag = null;
  }
}

// let a body go: a ragdoll if it has a skeleton (null if not — lay it down some other way)
export function ragdoll(P, push, at) {
  if (!P || !P.bones || !P.bones.hips) return null;
  const r = new Ragdoll(P, push, at);
  return r.ok ? r : null;
}

// ---- what falls from the hands: tumbling, bouncing once or twice, lying still ----
const things = new Set();
export function dropThing(obj, v) {
  if (!obj || !obj.parent) return;
  G.scene.attach(obj);
  things.add({ obj, v: v ? v.clone() : new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5), w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8), t: 0 });
  ensureTick();
}
function stepThing(t, dt) {
  t.t += dt;
  if (t.t > 6 || !t.obj.parent) { things.delete(t); return; }
  if (t.rest) return;
  t.v.y -= GRAV * dt;
  t.obj.position.addScaledVector(t.v, dt);
  t.obj.rotation.x += t.w.x * dt; t.obj.rotation.y += t.w.y * dt; t.obj.rotation.z += t.w.z * dt;
  const w = G.world, gy = (w && w.heightAt ? w.heightAt(t.obj.position.x, t.obj.position.z) : 0) + 0.03;
  if (t.obj.position.y < gy) {
    t.obj.position.y = gy;
    if (Math.abs(t.v.y) < 1.2) { t.rest = true; t.obj.rotation.x = Math.PI / 2 * Math.sign(Math.sin(t.obj.rotation.x) || 1); return; }
    t.v.y = -t.v.y * 0.3; t.v.x *= 0.5; t.v.z *= 0.5; t.w.multiplyScalar(0.4);
  }
}
// gone (a new round): things lying about taken away
export function clearDropped() { for (const t of things) if (t.obj.parent) t.obj.parent.remove(t.obj); things.clear(); }
