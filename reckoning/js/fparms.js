// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// YOUR ARMS, FIRST PERSON: one skinned arm each side (models/fparms.glb, tools/blender/fparms.py) — the coat's sleeve,
// the shirt's cuff, the wrist and the hand all one skin over one skeleton, so there's no seam between them to come
// apart. Each frame a hand is put where it holds something, turned to it, and the arm reaches for it: the elbow bent
// as far as it must (two bones, the elbow dropping down and out), the forearm turned with the hand, as your own is;
// and the fingers closed round what's held — a haft, a pistol's grip, under a musket's fore-end — or loose.
//
// Everything's worked in the arms' own frame (their root, set in the view model before you); a grip is given there as
// a point, the line of what's held through it (toward the thumb's side of the fist), and how thick it is.

import { THREE } from "./core.js";
import { modelCopy, ensureModel } from "./models.js";

ensureModel("fparms");

const FINGERS = ["index", "middle", "ring", "pinky"];
// how far each joint of each finger closes (radians, knuckle to tip), for each way of holding
const D = Math.PI / 180;
export const GRIPS = {
  // round a haft or a hilt: the fingers wrapped right round it, the thumb over them
  haft: { f: [72, 88, 50], fi: [66, 80, 45], th: [10, 30, 35], r: 0.017 },
  // a thicker thing — a musket's wrist, a ramrod's tail: less closed
  stock: { f: [58, 70, 40], fi: [52, 64, 36], th: [5, 20, 25], r: 0.022 },
  // a pistol's grip: the fingers round it, the forefinger out along the guard to the trigger
  pistol: { f: [72, 86, 48], fi: [28, 38, 18], th: [8, 28, 30], r: 0.016 },
  // the fore-end of a musket lying in the open hand: the fingers up its side, the thumb along the other
  fore: { f: [40, 45, 25], fi: [36, 42, 22], th: [-5, 12, 15], r: 0.02 },
  // nothing held: the hand easy, a little curled
  open: { f: [15, 20, 12], fi: [10, 14, 8], th: [0, 8, 6], r: 0.02 },
};

let _tmpQ = new THREE.Quaternion(), _tmpQ2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// rest quaternion and position of a bone in the root's frame (the model straight out of its file)
function restInRoot(root, b) {
  const q = new THREE.Quaternion(), p = new THREE.Vector3();
  const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(b.matrixWorld);
  m.decompose(p, q, new THREE.Vector3());
  return { q, p };
}

export function makeFPArms(mats = {}) {
  const src = modelCopy("fparms"); if (!src) return null;
  const root = new THREE.Group(), model = src.scene;
  root.add(model);
  // (the model faces +z, a person standing; you look down -z: turned about to face the way you do)
  model.rotation.y = Math.PI;
  const bones = {};
  model.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.frustumCulled = false; o.castShadow = false;
      const n = (o.material && o.material.name || "").replace(/^fparms_/, "");
      if (mats[n]) o.material = mats[n];
    }
  });
  root.updateMatrixWorld(true);
  const side = s => {
    const B = n => bones[`${n}_${s}`];
    const upper = B("upperarm"), lower = B("lowerarm"), hand = B("hand");
    const R = b => restInRoot(root, b);
    const ru = R(upper), rl = R(lower), rh = R(hand);
    const A = { s, upper, lower, hand, rest: { u: ru, l: rl, h: rh }, a: ru.p.distanceTo(rl.p), b: rl.p.distanceTo(rh.p),
      q0: [upper, lower, hand].map(b => b.quaternion.clone()) };
    // the hand's own frame: Y along it to the knuckles; the palm's side, Z (the fingers close toward it — checked by
    // where its finger bones bend); and the thumb's side, from where the thumb starts
    const hq = rh.q, hqi = hq.clone().invert();
    const thumbP = R(B("thumb_01")).p, midP = R(B("middle_01")).p, idxP = R(B("index_01")).p, pinP = R(B("pinky_01")).p;
    const yL = new THREE.Vector3(0, 1, 0);
    // (thumb side: from the little finger's knuckle to the forefinger's, in the hand's frame, square to Y)
    const tL = idxP.clone().sub(pinP).applyQuaternion(hqi); tL.addScaledVector(yL, -tL.dot(yL)).normalize();
    // (the palm: square to both; which way, from where the thumb sits — below the knuckles' line, toward the palm)
    let pL = new THREE.Vector3().crossVectors(tL, yL).normalize();
    const thL = thumbP.clone().sub(rh.p).applyQuaternion(hqi);
    if (thL.dot(pL) < 0) pL.negate();
    A.frame = { yL, tL, pL };
    // each finger's joints, with the axis (in its own frame) that turns it toward the palm
    const palmRS = pL.clone().applyQuaternion(hq);
    A.fingers = {};
    for (const f of [...FINGERS, "thumb"]) {
      A.fingers[f] = [1, 2, 3].map(i => {
        const b = B(`${f}_0${i}`); const r = R(b);
        const yRS = new THREE.Vector3(0, 1, 0).applyQuaternion(r.q);
        // (the thumb closes across the palm, toward the little finger; the fingers down into it)
        const toward = f === "thumb" ? palmRS.clone().addScaledVector(tL.clone().applyQuaternion(hq), -0.8).normalize() : palmRS;
        const axRS = new THREE.Vector3().crossVectors(yRS, toward).normalize();
        return { b, q0: b.quaternion.clone(), ax: axRS.applyQuaternion(r.q.clone().invert()) };
      });
    }
    return A;
  };
  const arms = { root, model, R: side("r"), L: side("l") };
  return arms;
}

// an arm let hang, as it came (down at your side, out of sight)
export function restArm(A) { [A.upper, A.lower, A.hand].forEach((b, i) => b.quaternion.copy(A.q0[i])); if (A.p0) A.upper.position.copy(A.p0); closeHand(A, "open", 0.6); }

// world-in-root helpers: a bone's current quaternion in the root's frame
function qInRoot(root, b, out) {
  b.getWorldQuaternion(out); root.getWorldQuaternion(_tmpQ2); return out.premultiply(_tmpQ2.invert());
}

// close the fingers: a grip by name (or its numbers), k how far (0 open .. 1 as the grip has it)
export function closeHand(A, grip = "open", k = 1) {
  const G = typeof grip === "string" ? GRIPS[grip] || GRIPS.open : grip;
  for (const f of [...FINGERS, "thumb"]) {
    const ang = f === "thumb" ? G.th : f === "index" ? G.fi : G.f;
    // (the little finger closes a little more than the rest; the ring finger with the middle)
    const extra = f === "pinky" ? 1.08 : 1;
    A.fingers[f].forEach((j, i) => { j.b.quaternion.copy(j.q0).multiply(_tmpQ.setFromAxisAngle(j.ax, ang[i] * D * k * extra)); });
  }
}

// close the hand round a round thing — a haft, a stock, a grip — lying through it (`at`, `axis`, radius `r`, in the
// root's frame): each joint of each finger, knuckle first, bent in a little at a time until the next joint (or the
// finger's tip) comes to lie on its surface — never into it. The thumb comes round from outside the haft, over the
// fingers. `most` caps how far any joint goes (an open hand under a fore-end); `k` scales it all (letting go).
const _c = new THREE.Vector3(), _cp = new THREE.Vector3(), _cq = new THREE.Vector3();
function offAxis(root, b, at, axis, tip = 0) {
  b.getWorldPosition(_cp); if (tip) { _cq.set(0, 1, 0).transformDirection(b.matrixWorld); _cp.addScaledVector(_cq, tip); }
  root.worldToLocal(_cp); _cp.sub(at); return _cp.addScaledVector(axis, -_cp.dot(axis)).length();
}
export function wrapHand(arms, A, at, axis, r, { most = 110, k = 1, start = { thumb: -40 }, fixed = {}, aim = {} } = {}) {
  const root = arms.root;
  for (const f of [...FINGERS, "thumb"]) {
    const js = A.fingers[f], thick = f === "thumb" ? 0.011 : f === "pinky" ? 0.008 : 0.0095;
    js.forEach(j => j.b.quaternion.copy(j.q0));
    // (a finger kept off it — a pistol's forefinger out along the guard to the trigger)
    if (fixed[f]) { js.forEach((j, i) => j.b.quaternion.copy(j.q0).multiply(_tmpQ.setFromAxisAngle(j.ax, fixed[f][i] * D))); continue; }
    // (a finger to a point — the forefinger to a trigger: the outer joints hooked, and the knuckle turned — any way a
    //  knuckle turns, up to 70° — so the hooked tip comes onto the point)
    if (aim[f]) {
      const { to, hook = [40, 30] } = aim[f];
      js[0].b.quaternion.copy(js[0].q0);
      hook.forEach((a, i) => js[i + 1].b.quaternion.copy(js[i + 1].q0).multiply(_tmpQ.setFromAxisAngle(js[i + 1].ax, a * D)));
      js[0].b.updateMatrixWorld(true);
      // the tip, and the point, both as seen from the knuckle in its own frame
      const inv0 = new THREE.Matrix4().copy(js[0].b.matrixWorld).invert();
      js[2].b.getWorldPosition(_cp); _cq.set(0, 1, 0).transformDirection(js[2].b.matrixWorld); _cp.addScaledVector(_cq, 0.02);
      const tipL = _cp.applyMatrix4(inv0).clone().normalize();
      const toL = root.localToWorld(to.clone()).applyMatrix4(inv0).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(tipL, toL), ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      if (ang > 70 * D) q.slerp(_tmpQ.identity(), 1 - 70 * D / ang);
      js[0].b.quaternion.multiply(q); js[0].b.updateMatrixWorld(true);
      continue;
    }
    for (let i = 0; i < 3; i++) {
      const j = js[i], next = js[i + 1], set = a => { j.b.quaternion.copy(j.q0).multiply(_tmpQ.setFromAxisAngle(j.ax, a * D)); j.b.updateMatrixWorld(true); };
      const dist = () => next ? offAxis(root, next.b, at, axis) : offAxis(root, j.b, at, axis, f === "thumb" ? 0.026 : 0.022);
      let a = i === 0 && start[f] != null ? start[f] : 0, done = false;
      set(a);
      // (already in it from where it starts: turned back out till it's clear — the thumb's way round the haft)
      if (dist() <= r + thick) { while (a > -90 && dist() <= r + thick) { a -= 4; set(a); } done = true; }
      let cap = typeof most === "object" ? most[f] ?? most.all ?? 110 : most; if (Array.isArray(cap)) cap = cap[i];
      while (!done && a < cap) { a += 4; set(a); if (dist() <= r + thick) { done = true; a -= 2; set(a); } }
      if (k < 1) set(a * k);
    }
  }
}

// put a hand: `at` where the middle of the grip is, `along` the line of what's held (to the thumb's side), `out` which
// way the knuckles point (square to `along`; the hand's back faces away from the thing), `r` its thickness — all in the
// root's frame. The arm reaches for it; returns how far short it fell (0: it's there).
const _W = new THREE.Vector3(), _F = new THREE.Vector3(), _P = new THREE.Vector3(), _T = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _qh = new THREE.Quaternion();
export function gripAt(arms, A, at, along, out, r = 0.017, pole = null) {
  const T = _T.copy(along).normalize(), F = _F.copy(out).addScaledVector(T, -out.dot(T)).normalize();
  // (the palm faces the thing held: from the hand's own frame, which side the palm is of thumb and knuckles)
  const { yL, tL, pL } = A.frame;
  const hand = new THREE.Vector3().crossVectors(tL, yL).dot(pL) > 0 ? 1 : -1;
  const P = _P.crossVectors(T, F).multiplyScalar(hand).normalize();
  // the hand's turn: its frame (thumb side, along, palm) onto (T, F, P)
  _m1.makeBasis(tL, yL, pL); _m2.makeBasis(T, F, P);
  _qh.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
  // the wrist: back from the grip along the knuckles' line, and out from it so the knuckles lie a finger's breadth off
  // the thing held — tried, measured, moved (the hand's own size, not a guess, puts it there)
  let off = r + (A.palmOff ?? 0.01), short = 0;
  for (let it = 0; it < 3; it++) {
    const W = _W.copy(at).addScaledVector(F, -0.07).addScaledVector(P, -off);
    short = reach(arms, A, W, _qh, pole);
    arms.root.updateMatrixWorld(true);
    let kn = 0; for (const f of FINGERS) kn += offAxis(arms.root, A.fingers[f][0].b, at, T) / FINGERS.length;
    const err = kn - (r + 0.019); if (short > 0.002) break;
    off = Math.max(r - 0.02, Math.min(r + 0.05, off - err)); if (Math.abs(err) < 0.002) break;
  }
  if (short <= 0.002) A.palmOff = off - r;
  return short;
}

// the arm to a wrist at W with the hand turned to qh (both in the root's frame)
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _d = new THREE.Vector3(), _pl = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const _qu = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qa = new THREE.Quaternion();
export function reach(arms, A, W, qh, pole = null) {
  const root = arms.root, { a, b } = A, S = _S.copy(A.rest.u.p);
  let d = _d.subVectors(W, S), L = d.length();
  // (out of reach: the shoulder comes forward to it, as yours does when you reach — up to most of an arm's length, out of sight)
  const over = L - (a + b) * 0.97;
  if (over > 0) { const sh = Math.min(over, 0.42); S.addScaledVector(d, sh / L); d = _d.subVectors(W, S); L = d.length(); }
  shoulderTo(root, A, S);
  const short = Math.max(0, L - (a + b) * 0.999);
  L = Math.min(L, (a + b) * 0.999); d.normalize();
  // (the elbow down and out to its own side, as a man's is when his hands are before him)
  const pl = _pl.copy(pole || new THREE.Vector3(A.s === "r" ? -0.6 : 0.6, -1, 0.25)); pl.addScaledVector(d, -pl.dot(d)).normalize();
  const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
  const E = _E.copy(S).addScaledVector(d, x).addScaledVector(pl, h);
  // the upper arm: from its rest, the least turn that lays it along shoulder→elbow
  const uDir = E.clone().sub(S).normalize(), uRest = _y.clone().applyQuaternion(A.rest.u.q);
  _qu.setFromUnitVectors(uRest, uDir).multiply(A.rest.u.q);
  // the forearm: likewise along elbow→wrist, then turned about itself so its back follows the hand's (the forearm
  // turns with the hand — the wrist only bends)
  const W2 = E.clone().addScaledVector(W.clone().sub(E).normalize(), b);
  const lDir = W2.clone().sub(E).normalize();
  const lRestY = _y.clone().applyQuaternion(A.rest.l.q);
  // (carried along by the upper arm's turn first, as the bones are chained)
  const carry = _qa.setFromUnitVectors(uRest, uDir);
  const lq0 = A.rest.l.q.clone().premultiply(carry);
  _ql.setFromUnitVectors(_y.clone().applyQuaternion(lq0), lDir).multiply(lq0);
  // twist: the forearm's X toward the hand's X, about the forearm's line
  const fx = new THREE.Vector3(1, 0, 0).applyQuaternion(_ql);
  // (the hand's rest offset from the forearm, kept: what the forearm's X would be with the hand turned as wanted)
  const want = new THREE.Vector3(1, 0, 0).applyQuaternion(qh.clone().multiply(A.rest.h.q.clone().invert()).multiply(A.rest.l.q));
  want.addScaledVector(lDir, -want.dot(lDir)); fx.addScaledVector(lDir, -fx.dot(lDir));
  if (want.lengthSq() > 1e-6 && fx.lengthSq() > 1e-6) {
    want.normalize(); fx.normalize();
    let tw = Math.acos(Math.max(-1, Math.min(1, fx.dot(want)))); if (new THREE.Vector3().crossVectors(fx, want).dot(lDir) < 0) tw = -tw;
    // (a forearm turns only so far: past that, the wrist takes the rest)
    tw = Math.max(-1.6, Math.min(1.6, tw));
    _ql.premultiply(_qa.setFromAxisAngle(lDir, tw));
  }
  // set them, each in its parent's frame
  setRootQ(root, A.upper, _qu); setRootQ(root, A.lower, _ql); setRootQ(root, A.hand, qh);
  return short;
}
// the upper arm's root moved (in the root's frame) — from where it rests, by moving its bone in its parent's frame
const _sh = new THREE.Vector3(), _shq = new THREE.Quaternion();
function shoulderTo(root, A, S) {
  if (!A.p0) A.p0 = A.upper.position.clone();
  const dv = _sh.subVectors(S, A.rest.u.p);
  A.upper.parent.updateWorldMatrix(true, false); qInRoot(root, A.upper.parent, _shq);
  A.upper.position.copy(A.p0).add(dv.applyQuaternion(_shq.invert()));
  A.upper.updateMatrixWorld(true);
}
const _pq = new THREE.Quaternion();
function setRootQ(root, b, q) {
  b.parent.updateWorldMatrix(true, false);
  qInRoot(root, b.parent, _pq);
  b.quaternion.copy(_pq.invert().multiply(q));
  b.updateMatrixWorld(true);
}
