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
    // (the coat's skirts: hung from the hips while he falls — tied to the thighs as they are for walking, the legs
    //  folding as he went down levered them up into the air like boards)
    this.skirts = [];
    P.root.traverse(o => {
      if (!o.isSkinnedMesh || !/_(coat|vest)$/.test((o.material && o.material.name) || "")) return;
      const bones = o.skeleton.bones, hip = bones.findIndex(b => b.name === "hips"), legs = new Set(bones.map((b, i) => /^(thigh|shin)/.test(b.name) ? i : -1).filter(i => i >= 0));
      if (hip < 0 || !legs.size) return;
      const g0 = o.geometry, g = g0.clone(), si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      for (let v = 0; v < si.count; v++) {
        let moved = 0; const w = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], ix = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)];
        for (let k = 0; k < 4; k++) if (legs.has(ix[k]) && w[k] > 0) { const m = w[k] * 0.5; w[k] -= m; moved += m; }
        if (!moved) continue;
        let h = ix.indexOf(hip); if (h < 0) { h = w.indexOf(Math.min(...w)); moved += w[h]; ix[h] = hip; w[h] = 0; }
        w[h] += moved; si.setXYZW(v, ...ix); sw.setXYZW(v, ...w);
      }
      o.geometry = g; this.skirts.push([o, g0, g]);
    });
    // (and the hat knocked off: always by a blow to the head, most often anyway — it goes flying, tumbles, and comes
    //  to rest on its brim, or upside down)
    this.hats = [];
    // (a battle's man made one mesh, see mergeRig: his hat's own piece is kept hidden — copied from that, and the hat
    //  taken out of the one mesh by folding its corners to a point, put back if he's set on his feet again)
    const merged = P.root.userData.merged, hidden = new Set(merged ? merged.hidden || [] : []);
    this.mergedHat = [];
    if (B.head && (at === "head" || Math.random() < 0.7)) P.root.traverse(o => {
      if (!o.isSkinnedMesh || !(o.visible || hidden.has(o)) || !(o.name === "worn_hat" || /_hat$/.test(o.name) || (o.material && o.material.userData && o.material.userData.part === "hat"))) return;
      if (hidden.has(o)) for (const mm of merged) for (const pt of mm.userData.parts || []) if (pt.part === "hat") {
        const pa = mm.geometry.attributes.position, keep = pa.array.slice(pt.start * 3, (pt.start + pt.count) * 3);
        for (let i = 0; i < pt.count; i++) pa.setXYZ(pt.start + i, keep[0], keep[1], keep[2]);
        pa.needsUpdate = true; this.mergedHat.push([pa, pt.start, keep]);
      }
      const sk = o.skeleton, hi = sk.bones.indexOf(B.head); if (hi < 0) return;
      const g = o.geometry.clone(); g.deleteAttribute("skinIndex"); g.deleteAttribute("skinWeight"); if (g.attributes.aCloth) g.deleteAttribute("aCloth");
      g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z);
      B.head.updateWorldMatrix(true, false);
      const M = new THREE.Matrix4().multiplyMatrices(B.head.matrixWorld, sk.boneInverses[hi]).multiply(o.bindMatrix);
      const h = new THREE.Mesh(g, o.material); h.castShadow = true; h.receiveShadow = true;
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); M.decompose(pos, q, sc);
      h.position.copy(c.clone().applyMatrix4(M)); h.quaternion.copy(q); h.scale.copy(sc);
      G.scene.add(h); if (!hidden.has(o)) o.visible = false;
      const v = (push ? push.clone().multiplyScalar(0.45) : new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2));
      dropThing(h, v, { flat: true, lift: (g.boundingBox.max.y - g.boundingBox.min.y) * sc.y * 0.5 });
      this.hats.push([o, h]);
    });
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
    // (a knee left standing up in an arch, heel and hip on the ground, goes over to one side as the leg goes slack —
    //  a body doesn't lie with its knees in the air)
    if (this.t > 0.45 && this.t < 3) {
      this.kneeDir ??= Math.random() < 0.5 ? 1 : -1;
      for (const s of ["L", "R"]) {
        const k = p[`kn${s}`], hp = p[`hp${s}`], an = p[`an${s}`]; if (!k || !hp || !an) continue;
        const up = k.y - Math.min(hp.y, an.y);
        if (up > 0.12) { const ax = an.x - hp.x, az = an.z - hp.z, L = Math.hypot(ax, az) || 1; k.x += -az / L * this.kneeDir * 0.6 * dt * up; k.z += ax / L * this.kneeDir * 0.6 * dt * up; k.y -= 0.4 * dt * up; }
      }
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
    for (const [o, g0, g] of this.skirts || []) { o.geometry = g0; g.dispose(); }
    this.skirts = [];
    for (const [o, h] of this.hats || []) { if (h.parent) h.parent.remove(h); h.geometry.dispose(); if (!(this.P.root.userData.merged || {}).hidden?.includes(o)) o.visible = true; }
    this.hats = [];
    for (const [pa, start, keep] of this.mergedHat || []) { pa.array.set(keep, start * 3); pa.needsUpdate = true; }
    this.mergedHat = [];
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
export function dropThing(obj, v, o = {}) {
  if (!obj || !obj.parent) return;
  G.scene.attach(obj);
  things.add({ flat: !!o.flat, lift: o.lift || 0, obj, v: v ? v.clone() : new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5), w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8), t: 0 });
  ensureTick();
}
function stepThing(t, dt) {
  t.t += dt;
  if (t.t > 6 || !t.obj.parent) { things.delete(t); return; }
  if (t.rest) return;
  t.v.y -= GRAV * dt;
  t.obj.position.addScaledVector(t.v, dt);
  t.obj.rotation.x += t.w.x * dt; t.obj.rotation.y += t.w.y * dt; t.obj.rotation.z += t.w.z * dt;
  const w = G.world, gy = (w && w.heightAt ? w.heightAt(t.obj.position.x, t.obj.position.z) : 0) + 0.03 + (t.lift || 0);
  if (t.obj.position.y < gy) {
    t.obj.position.y = gy;
    if (Math.abs(t.v.y) < 1.2) {
      t.rest = true;
      // (a hat comes to rest on its brim, or now and then upside down on its crown; anything else on its side)
      if (t.flat) { const up = new THREE.Vector3(0, 1, 0).applyQuaternion(t.obj.quaternion).y; const yaw = t.obj.rotation.y; t.obj.rotation.set(up >= -0.2 ? 0 : Math.PI, yaw, 0); }
      else t.obj.rotation.x = Math.PI / 2 * Math.sign(Math.sin(t.obj.rotation.x) || 1);
      return;
    }
    t.v.y = -t.v.y * 0.3; t.v.x *= 0.5; t.v.z *= 0.5; t.w.multiplyScalar(0.4);
  }
}
// gone (a new round): things lying about taken away
export function clearDropped() { for (const t of things) if (t.obj.parent) t.obj.parent.remove(t.obj); things.clear(); }
