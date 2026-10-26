// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// People, trees, and the furniture of a life: all built from primitives at
// load, the way the first Forester built its sounds instead of loading them.

import { loadPose, rodEnds, ROD_GEO } from "./reload.js";
import { THREE, mat, MAT, Builder, prismGeo, makeFlame, rng, TAU, addDetail, addHook, noSnow, ownGrainAll, shine, inheritHooks } from "./core.js";
import { mergeVertices } from "../lib/utils/BufferGeometryUtils.js";
import { attachCloth, clothMerged, clothSrcOf, clothSimOf } from "./cloth.js";

// ---------------------------------------------------------------------------
//  people
// ---------------------------------------------------------------------------
// A person faces +Z. `update(dt, speed)` animates the walk; `pose` switches
// the arms into holding a torch, swinging an axe, reading a writ, sitting.
const SKIN = [0xe8c4a0, 0xd9ab84, 0xc99672, 0xf0d2b4];
const HAIR = [0x3b2a1e, 0x5a3d25, 0x8a6a3c, 0x1f1a17, 0xa88a5a, 0x6b6b6b];

// Every person is built from the same few dozen shapes; they are made once.
const _geo = {};
function GEO(k, f) { if (!_geo[k]) { _geo[k] = f(); _geo[k]._shared = true; } return _geo[k]; }
function shade(hex, l) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, l); return c.getHex(); }

// ---------------------------------------------------------------------------
//  a hat from another outfit: every townsperson is the one rig, so the hat made for one head fits any — taken from
//  that model, bound to this one's bones, in this one's hat colour (and this one's own hat taken off)
// ---------------------------------------------------------------------------
function borrowHat(P, scene, from, colour) {
  const src = MODELS[from]; if (!src) return false;
  let sm = null; src.scene.traverse(o => { if (!sm && o.isSkinnedMesh && /_hat$/i.test(o.name)) sm = o; });
  if (!sm) return false;
  const byName = {}; scene.traverse(o => { if (o.isBone) byName[o.name] = o; });
  const bones = sm.skeleton.bones.map(b => byName[b.name]); if (bones.some(b => !b)) return false;
  const m = sm.material.clone(); if (colour != null) m.color.set(colour);
  addDetail(m, { scale: 2, amount: 0.22, grain: 0.6, surface: "cloth" });
  const h = new THREE.SkinnedMesh(sm.geometry, m); h.name = "worn_hat";
  const parent = (sm.parent && scene.getObjectByName(sm.parent.name)) || scene;
  parent.add(h); h.position.copy(sm.position); h.quaternion.copy(sm.quaternion); h.scale.copy(sm.scale);
  h.bind(new THREE.Skeleton(bones, sm.skeleton.boneInverses.map(x => x.clone())), sm.bindMatrix.clone());
  h.castShadow = true; h.frustumCulled = false;
  scene.traverse(o => { if (o.isMesh && o !== h && /_hat$/i.test(o.name)) o.visible = false; });
  P.hat = h;
  return true;
}
// the stroke on a rigged body, over whatever its clip has the bones doing: each bone turned about the body's own axes
// (taken into the bone's frame), so the rig's own bone rolls don't matter
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _ax = new THREE.Vector3();
function turnBone(b, root, ax, ang) {
  if (!b || !ang) return;
  // the axis, from the body's frame into the bone's parent's frame, then applied on top of the bone's own turn
  b.parent.getWorldQuaternion(_qi); root.getWorldQuaternion(_q); _qi.invert().multiply(_q);
  _ax.copy(ax).applyQuaternion(_qi).normalize();
  b.quaternion.premultiply(_q.setFromAxisAngle(_ax, ang));
}
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
function swimBones(P, dt) {
  const B = P.bones || {}, k = P.swimK, c = ((P.poseT || 0) * 0.55) % 1;
  const out = c < 0.3 ? c / 0.3 : c < 0.65 ? 1 : 1 - (c - 0.65) / 0.35, wide = c < 0.3 ? 0 : c < 0.65 ? (c - 0.3) / 0.35 : 1 - (c - 0.65) / 0.35;
  const kick = Math.sin(c * Math.PI * 2);
  P.root.updateMatrixWorld(true);
  P._swimBack = ["upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R", "thigh.L", "thigh.R", "shin.L", "shin.R", "neck"].filter(n => B[n]).map(n => [B[n], B[n].quaternion.clone()]);
  for (const [side, s] of [["L", 1], ["R", -1]]) {
    // (arms: raised forward over the head, swept out to the side, drawn back in)
    turnBone(B["upper_arm." + side], P.body, AX.x, -(1.2 + out * 1.4) * k);
    turnBone(B["upper_arm." + side], P.body, AX.z, s * wide * 0.9 * k);
    turnBone(B["forearm." + side], P.body, AX.x, -(1 - out) * 0.9 * k);
    // (legs: a frog kick)
    turnBone(B["thigh." + side], P.body, AX.x, kick * 0.35 * k);
    turnBone(B["thigh." + side], P.body, AX.z, s * Math.max(0, kick) * 0.3 * k);
    turnBone(B["shin." + side], P.body, AX.x, Math.max(0, -kick) * 0.8 * k);
  }
  // (the head held up out of the water)
  turnBone(B.neck, P.body, AX.x, -0.9 * k);
}
function swimLay(P, dt) {
  P.swimK = (P.swimK || 0) + ((P.pose === "swim" ? 1 : 0) - (P.swimK || 0)) * Math.min(1, dt * 4);
  const k = P.swimK;
  P.body.rotation.x = (P.body.rotation.x || 0) * (1 - k) + 1.3 * k;
  P.body.position.y = 0.86 * k; P.body.position.z = -0.75 * k;
}
// ---- a long arm held in both hands ----
// The weapon is set at the right shoulder — at the cheek when aiming, slanted across the chest at the ready — and each
// hand brought onto its grip by bending the arm at the shoulder and the elbow (a two-bone reach: the elbow kept down
// and out, as a man's is when he shoulders a gun). P.aimHold(obj, {base, grips, aim, ready}) sets it; null lets go.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
function swing(bone, fromW, toW) {
  // turn a bone so that a direction (world) on it points along another
  _qa.setFromUnitVectors(fromW.clone().normalize(), toW.clone().normalize());
  bone.getWorldQuaternion(_qb); bone.parent.getWorldQuaternion(_qc);
  bone.quaternion.copy(_qc.invert().multiply(_qa.multiply(_qb)));
  bone.updateMatrixWorld(true);
}
function reach(up, fore, hand, T, pole) {
  if (!up || !fore || !hand) return;
  const u = up.getWorldPosition(_a), e0 = fore.getWorldPosition(_b), h0 = hand.getWorldPosition(_c);
  const palm = _d.copy(h0).sub(e0).normalize().multiplyScalar(0.07).add(h0);
  const A = u.distanceTo(e0), Bl = e0.distanceTo(palm), toT = _e.copy(T).sub(u), dist = toT.length();
  const d = Math.max(Math.abs(A - Bl) + 1e-3, Math.min(A + Bl - 1e-3, dist)), dir = toT.normalize();
  const pl = _f.copy(pole).sub(u); pl.addScaledVector(dir, -pl.dot(dir)); if (pl.lengthSq() < 1e-8) pl.set(0, -1, 0); pl.normalize();
  const x = (A * A - Bl * Bl + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, A * A - x * x));
  const elbow = u.clone().addScaledVector(dir, x).addScaledVector(pl, hh);
  swing(up, e0.clone().sub(u), elbow.clone().sub(u));
  const e1 = fore.getWorldPosition(new THREE.Vector3()), h1 = hand.getWorldPosition(new THREE.Vector3());
  const palm1 = h1.clone().sub(e1).normalize().multiplyScalar(0.07).add(h1);
  swing(fore, palm1.sub(e1), T.clone().sub(e1));
}
function aimPlace(P, dt) {
  const H = P.aimH; if (!H) return;
  const B = P.bones || {}, root = P.root, obj = H.obj;
  P.aimK = (P.aimK ?? 0) + ((P.aimWant ? 1 : 0) - (P.aimK ?? 0)) * Math.min(1, dt * 7);
  const k = P.aimK * P.aimK * (3 - 2 * P.aimK);
  root.updateMatrixWorld(true);
  const shR = B["upper_arm.R"] || P.armR, shL = B["upper_arm.L"] || P.armL;
  const sR = root.worldToLocal(shR.getWorldPosition(new THREE.Vector3())), sL = root.worldToLocal(shL.getWorldPosition(new THREE.Vector3()));
  const inw = Math.sign(sL.x - sR.x) || 1;
  // loading (reload.js): stood up before the chest, muzzle up, the free hand going to the lock, the muzzle, the rod
  // a pike's hold (a spear, a bayonet): low in both hands, the point up before the face; the thrust drawn back a hand's
  // breadth, then driven straight out along its line, held a moment, and recovered
  if (H.pike) {
    const t = P.thrustT ?? 9, e = x => x * x * (3 - 2 * x);
    const th = t < 0.12 ? -0.35 * e(t / 0.12) : t < 0.24 ? -0.35 + 1.35 * e((t - 0.12) / 0.12) : t < 0.36 ? 1 : t < 0.7 ? 1 - e((t - 0.36) / 0.34) : 0;
    const L = (a, b) => a + (b - a) * th, at = H.ready.map((v, i) => L(v, H.lunge[i]));
    obj.position.set(sR.x + inw * at[0], sR.y + at[1], sR.z + at[2]);
    obj.quaternion.setFromEuler(new THREE.Euler(-L(H.lift, H.lunge[3]), 0, -inw * L(H.across, H.lunge[4]), "ZYX")).multiply(H.base);
    obj.updateMatrixWorld(true);
  }
  if (H.bow) { bowPlace(P, H, obj, k, sR, sL, inw, root); return; }
  const LP = !H.pike && P.load && obj.userData.muzzle ? loadPose(P.load.kind, P.load.e) : null, up = LP ? LP.up : 0, pr = LP ? LP.prime : 0;
  const LOADAT = P.load && P.load.kind === "pistol" ? [0.16, -0.3, 0.3] : [0.2, -0.62, 0.32];
  if (!H.pike) {
  const at = H.ready.map((v, i) => { const a0 = v + (H.aim[i] - v) * k; return a0 + (LOADAT[i] - a0) * up + (H.ready[i] - a0) * pr; });
  obj.position.set(sR.x + inw * at[0], sR.y + at[1], sR.z + at[2]);
  // (at the ready the muzzle up and across the body; aimed, level and straight ahead; loading, straight up)
  const xr = -(H.lift ?? 0.95) * (1 - k), zr = -inw * (H.across ?? 0.55) * (1 - k);
  obj.quaternion.setFromEuler(new THREE.Euler(xr * (1 - up) - 1.45 * up, 0, zr * (1 - up) + inw * 0.6 * pr, "ZYX")).multiply(H.base);
  obj.updateMatrixWorld(true);
  }
  // (the ramrod, out of its pipes and down the bore)
  if (obj.userData.muzzle) {
    let rod = obj.userData.rod;
    const kind = P.load ? P.load.kind : "musket", RE = P.load ? rodEnds(kind, P.load.e) : { show: false }, rodL = ROD_GEO[kind].L;
    if (RE.show && !rod) { rod = obj.userData.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.6 })); obj.add(rod); }
    if (rod) {
      rod.visible = !!RE.show;
      if (RE.show) { const a = new THREE.Vector3(0, RE.R[0], RE.R[1]), b = new THREE.Vector3(0, RE.T[0], RE.T[1]); rod.position.copy(a).add(b).multiplyScalar(0.5); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); rod.scale.set(1, rodL, 1); }
    }
    if (obj.userData.rodMesh) obj.userData.rodMesh.visible = !RE.show;
    obj.userData.rodTop = RE.show ? (RE.R[0] > RE.T[0] ? RE.R : RE.T) : null;
  }
  obj.visible = !P.aimHidden;
  if (!P.bones || P.aimHidden) return;
  P._aimBack = ["upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R"].filter(n => B[n]).map(n => [B[n], B[n].quaternion.clone()]);
  const down = new THREE.Vector3(0, -1, 0).transformDirection(root.matrixWorld);
  const grips = H.grips.slice();
  // (the free hand's place while loading — at the lock, at the muzzle, on top of the rod)
  if (LP && LP.hand && obj.userData.muzzle) {
    const mz = obj.userData.muzzle.position, rod = obj.userData.rod;
    const tp = obj.userData.rodTop;
    grips[1] = LP.hand === "lock" ? new THREE.Vector3(0.06, mz.y * 0.05, 0.05) : LP.hand === "muzzle" || !tp ? new THREE.Vector3(mz.x, mz.y + 0.04, mz.z) : new THREE.Vector3(0, tp[0] - 0.05, tp[1]);
  }
  grips.forEach((gp, i) => {
    if (!gp) return;
    const s = i === 0 ? "R" : "L", T = obj.localToWorld(gp.clone());
    const sh = (i === 0 ? shR : shL).getWorldPosition(new THREE.Vector3());
    const outw = new THREE.Vector3(i === 0 ? -inw : inw, 0, 0).transformDirection(root.matrixWorld);
    const pole = sh.clone().addScaledVector(down, 0.5).addScaledVector(outw, 0.35);
    reach(B["upper_arm." + s], B["forearm." + s], B["hand." + s], T, pole);
  });
}
// ---- a bow, held as an archer holds one ----
// Carried: hanging in the left hand at the side, upright, the string toward the leg. Drawn (P.aimWant): the left arm
// out straight before the left shoulder with the bow upright in the fist, a little canted, and the right hand bringing
// the string back to the cheek. It used to be hung off the left hand like any tool: lying flat at the hip like a stick,
// and drawn with both arms held straight out and the right hand nowhere near the string.
const _bq0 = new THREE.Quaternion(), _bq1 = new THREE.Quaternion(), _bm = new THREE.Matrix4();
function bowPlace(P, H, obj, k, sR, sL, inw, root) {
  const B = P.bones || {};
  const L = (a, b) => a + (b - a) * k;
  // the grip: down at the side, or out at arm's length; the nock: on the string at rest, or at the cheek
  const G = new THREE.Vector3(L(sL.x + inw * 0.1, sL.x - inw * 0.04), L(sL.y - 0.6, sL.y + 0.03), L(sL.z + 0.08, sL.z + 0.6));
  const cheek = new THREE.Vector3(sR.x + inw * 0.13, sR.y + 0.12, sR.z + 0.07);
  // (the bow's own frame: up along the limbs, +z from the grip toward the string and the archer)
  const zD = cheek.clone().sub(G); const draw = zD.length(); zD.normalize();
  const yD = new THREE.Vector3(Math.sin(-inw * 0.12), 1, 0).normalize(); yD.addScaledVector(zD, -yD.dot(zD)).normalize();
  _bm.makeBasis(new THREE.Vector3().crossVectors(yD, zD), yD, zD); _bq1.setFromRotationMatrix(_bm);
  // (carried: upright, a little forward at the top, the string toward the leg)
  const zC = new THREE.Vector3(inw, 0, 0), yC = new THREE.Vector3(0, 1, 0.2).normalize(); yC.addScaledVector(zC, -yC.dot(zC)).normalize();
  _bm.makeBasis(new THREE.Vector3().crossVectors(yC, zC), yC, zC); _bq0.setFromRotationMatrix(_bm);
  obj.position.copy(G); obj.quaternion.copy(_bq0).slerp(_bq1, k); obj.updateMatrixWorld(true);
  // the string: from tip to tip, through the nock — drawn back as far as the cheek
  const st = obj.userData.string, back = obj.userData.back, tip = obj.userData.tip;
  const nz = back + 0.02 + Math.max(0, draw - back - 0.02) * k;
  if (st) { const a = st.geometry.attributes.position; a.setXYZ(0, 0, tip, back); a.setXYZ(1, 0, 0.012, nz); a.setXYZ(2, 0, -tip, back); a.needsUpdate = true; st.geometry.computeBoundingSphere(); }
  if (obj.userData.arrow) { obj.userData.arrow.visible = k > 0.6; obj.userData.arrow.position.z = nz - 0.37; }
  obj.visible = !P.aimHidden;
  if (!P.bones || P.aimHidden) return;
  P._aimBack = ["upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R"].filter(n => B[n]).map(n => [B[n], B[n].quaternion.clone()]);
  const down = new THREE.Vector3(0, -1, 0).transformDirection(root.matrixWorld);
  const shR = B["upper_arm.R"], shL = B["upper_arm.L"];
  // the left hand on the grip, always; the right on the string only as it's drawn
  const hands = [["L", new THREE.Vector3(0, 0, 0.01), shL, inw]];
  if (k > 0.05) hands.push(["R", new THREE.Vector3(0, 0.012, nz), shR, -inw]);
  for (const [s, gp, sh, out] of hands) {
    const T = obj.localToWorld(gp.clone()), sw = sh.getWorldPosition(new THREE.Vector3());
    const outw = new THREE.Vector3(out, 0, 0).transformDirection(root.matrixWorld);
    // (the drawing elbow up and out behind, level with the shoulder; the bow arm's straight)
    const pole = s === "R" ? sw.clone().addScaledVector(outw, 0.5).addScaledVector(down, -0.05) : sw.clone().addScaledVector(down, 0.5).addScaledVector(outw, 0.35);
    reach(B["upper_arm." + s], B["forearm." + s], B["hand." + s], T, pole);
  }
}
// a bow for a body to hold (P.aimWant: drawn): `limbs` the bow itself, upright along y, its belly toward -z
export function bowHold(P, limbs) {
  if (!P.aimHold) return null;
  const g = new THREE.Group();
  limbs.rotation.set(0, Math.PI, 0); limbs.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(limbs);
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xd8d0b8 })); g.add(string);
  // (an arrow on the string while it's drawn)
  const am = modelCopy("arrow"); let arrow = null;
  if (am) { arrow = am.scene; arrow.rotation.y = Math.PI; arrow.position.z = 0.2; arrow.visible = false; g.add(arrow); }
  g.userData = { string, back: 0.15, tip: 0.66, arrow };
  P.aimHold(g, { bow: true, grips: [] });
  return g;
}
// a long arm for a body to hold (see aimPlace): the musket, the pistol or the crossbow, with where it sits and how it's
// turned — its barrel brought round to point the way the body faces, its top up. P.aimWant: aiming, or at the ready.
const GUN_BASE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
const XBOW_BASE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
export function shoulderArm(P, kind) {
  const m = kind === "crossbow" ? makeCrossbow() : kind === "pistol" ? makePistol() : makeMusket();
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const grips = m.userData.grips || [];
  // [inward, up, forward] from the right shoulder: aimed, and at the ready
  const how = kind === "pistol"
    ? { base: GUN_BASE, grips, aim: [0.08, 0.04, 0.56], ready: [-0.02, -0.42, 0.2], lift: -0.7, across: 0 }
    : kind === "crossbow"
      ? { base: XBOW_BASE, grips, aim: [0.12, 0.04, 0.24], ready: [0.14, -0.3, 0.26], lift: 0.5, across: 0.4 }
      : { base: GUN_BASE, grips, aim: [0.15, 0.05, 0.22], ready: [0.12, -0.3, 0.24], lift: 0.95, across: 0.55 };
  P.aimHold(m, how);
  return m;
}
// a spear, or a musket with its bayonet fixed, held as a pike was for the push: low, in both hands, the right at the
// butt end by the hip and the left a forearm's length ahead of it, the point up before the face (see aimPlace)
export function pikeHold(P, obj, kind) {
  if (!P.aimHold) return false;
  let g0 = null;
  if (kind === "spear") g0 = -0.3;
  else { const c = [obj, ...obj.children].find(o => o.userData && o.userData.grips && o.userData.grips.length); g0 = c ? c.userData.grips[0].y + (c === obj ? 0 : c.position.y) : 0.25; }
  const grips = [new THREE.Vector3(0, g0, 0), new THREE.Vector3(0, g0 + 0.4, 0)];
  const back = kind === "spear" ? 0.3 : 0;   // (the spear's own middle is where it's held: the musket's, its butt)
  P.aimHold(obj, { base: GUN_BASE, grips, pike: true, ready: [0.0, -0.52, -0.08 + back], lunge: [0.08, -0.4, 0.26 + back, 0.08, 0.1], lift: 0.42, across: 0.28 });
  P.aimWant = false;
  return true;
}
const CROWD_MODELS = new Set(["townsman", "townswoman", "musketeer", "janissary", "strelets", "haiduk", "watchman", "watchman_tricorn", "watchwoman", "watchwoman_tricorn", "raider", "warrior", "warrior_braids"]);
export function makePerson(o = {}) {
  const r = rng(o.seed ?? Math.floor(Math.random() * 1e9));
  const skin = o.skin ?? r.pick(SKIN), hair = o.hair ?? r.pick(HAIR);
  const coat = o.coat ?? r.pick([0x5b4a3a, 0x3e4a5c, 0x6a3b32, 0x4d5a3c, 0x7a6a55, 0x3b3b40]);
  const legs = o.legs ?? r.pick([0x3a3028, 0x2e2e33, 0x4a4035, 0x5a5048]);
  const skirt = !!o.skirt;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  // (no two of a crowd the same size: the townsfolk, the soldiers, the watch, the men of the woods each their own height —
  //  most of them near the middle, now and then a short one or a tall — and their own build, slight to heavy. Named
  //  people, and you, are as they were made)
  if (o.scale == null && o.build == null && CROWD_MODELS.has(o.model)) {
    const v = rng((o.seed ?? Math.floor(Math.random() * 1e9)) * 7 + 13), g = () => (v() + v() + v() - 1.5) / 1.5;   // (≈ −1…1, most near 0)
    o = { ...o, scale: Math.max(0.9, Math.min(1.1, 1 + g() * 0.06)), build: [0.9, 0.96, 1, 1, 1.04, 1.1, 1.16][Math.floor(v() * 7)] };
  }
  const s = o.scale ?? 1;
  body.scale.setScalar(s);
  // (broader or slighter about the shoulders and middle, the height as it was)
  if (o.build && o.build !== 1) { body.scale.x = s * o.build; body.scale.z = s * o.build; }

  const M = c => mat(c, { roughness: 0.95, surface: "cloth" });
  const skinM = mat(skin, { roughness: 0.62, surface: "none" });
  const add = (parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  const brass = mat(0xb8913a, { metalness: 0.8, roughness: 0.35 });
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  // skirts and coat-tails: each person's own copy of the shape, so it can be pushed about by the legs
  const cloth = [];
  const addCloth = (geo, material, y) => {
    const m = add(hips, geo, material, 0, y);
    cloth.push({ m, base: Float32Array.from(geo.attributes.position.array), y });
    return m;
  };

  // legs: breeches to the knee, stockings, buckled shoes
  const mkLeg = side => {
    const p = new THREE.Group(); p.position.set(side * 0.095, 0, 0); hips.add(p);
    add(p, GEO("thigh", () => new THREE.CylinderGeometry(0.078, 0.062, 0.48, 10)), M(legs), 0, -0.24);
    add(p, GEO("knee", () => new THREE.SphereGeometry(0.062, 10, 8)), M(legs), 0, -0.48);
    add(p, GEO("shin", () => new THREE.CylinderGeometry(0.056, 0.042, 0.38, 10)), M(o.stockings ?? 0xd8d0c0), 0, -0.67);
    const shoe = add(p, GEO("shoe", () => { const g = new THREE.CapsuleGeometry(0.052, 0.14, 4, 8); g.rotateX(Math.PI / 2); g.scale(1.05, 0.8, 1); return g; }), M(0x1c1612), 0, -0.875, 0.04);
    add(shoe, GEO("buckle", () => new THREE.BoxGeometry(0.06, 0.03, 0.012)), brass, 0, 0.035, 0.07);
    return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // the body: tapered to the waist, flattened front to back
  const torso = add(hips, GEO("torso", () => { const g = new THREE.CylinderGeometry(0.2, 0.165, 0.56, 14); g.scale(1, 1, 0.66); return g; }), M(coat), 0, 0.3);
  void torso;
  add(hips, GEO("shoulders", () => { const g = new THREE.SphereGeometry(0.2, 14, 8, 0, TAU, 0, Math.PI / 2); g.scale(1, 0.42, 0.66); return g; }), M(coat), 0, 0.575);
  if (o.vest) add(hips, GEO("vest", () => new THREE.BoxGeometry(0.2, 0.4, 0.02)), M(o.vest), 0, 0.3, 0.128);
  if (!skirt) {
    // coat buttons down the front, and the turned-back facings either side
    for (let i = 0; i < 5; i++) add(hips, GEO("button", () => new THREE.SphereGeometry(0.013, 6, 4)), brass, o.vest ? 0.105 : 0, 0.48 - i * 0.085, 0.132);
    for (const sd of [-1, 1]) add(hips, GEO("facing", () => new THREE.BoxGeometry(0.045, 0.5, 0.012)), M(o.cuff ?? 0xd9d2c3), sd * 0.125, 0.3, 0.128, 0, 0, sd * 0.06);
  }
  if (skirt) {
    // bodice laced, a full skirt with a darker hem, an apron tied at the waist
    add(hips, GEO("lace", () => new THREE.BoxGeometry(0.04, 0.3, 0.012)), M(o.apron ?? 0xe6dcc8), 0, 0.34, 0.13);
    addCloth(new THREE.CylinderGeometry(0.19, 0.37, 0.86, 18, 6), M(o.skirtColor ?? coat), -0.4);
    addCloth(new THREE.CylinderGeometry(0.372, 0.378, 0.08, 18), M(shade(o.skirtColor ?? coat, -0.08)), -0.8);
    if (o.apron) {
      const ap = addCloth(new THREE.CylinderGeometry(0.2, 0.37, 0.72, 12, 5, true, -0.75, 1.5), mat(o.apron, { roughness: 0.95, side: THREE.DoubleSide }), -0.33); ap.position.z = 0.012;
      add(hips, GEO("waistband", () => new THREE.CylinderGeometry(0.172, 0.172, 0.05, 14)), mat(o.apron), 0, 0.03);
    }
    add(hips, GEO("shawl", () => { const g = new THREE.CylinderGeometry(0.13, 0.23, 0.14, 14, 1, true); return g; }), mat(o.shawl ?? shade(coat, 0.12), { roughness: 1, side: THREE.DoubleSide }), 0, 0.56);
  } else if (o.longCoat !== false) {
    // the skirts of the coat, open at the front
    addCloth(new THREE.CylinderGeometry(0.17, 0.25, 0.46, 14, 4, true, 0.55, TAU - 1.1), mat(coat, { roughness: 0.95, side: THREE.DoubleSide }), -0.2);
  }
  add(hips, GEO("belt", () => { const g = new THREE.CylinderGeometry(0.172, 0.172, 0.05, 14); g.scale(1, 1, 0.7); return g; }), M(0x2a1f16), 0, 0.04);

  // arms: shoulder, sleeve, forearm, a deep cuff, a hand
  const mkArm = side => {
    const p = new THREE.Group(); p.position.set(side * 0.235, 0.53, 0); hips.add(p);
    add(p, GEO("shoulderBall", () => new THREE.SphereGeometry(0.066, 10, 8)), M(coat), 0, 0);
    add(p, GEO("upperArm", () => new THREE.CylinderGeometry(0.058, 0.05, 0.28, 10)), M(coat), 0, -0.15);
    add(p, GEO("forearm", () => new THREE.CylinderGeometry(0.05, 0.043, 0.24, 10)), M(coat), 0, -0.38);
    add(p, GEO("cuff", () => new THREE.CylinderGeometry(0.064, 0.058, 0.08, 10)), M(o.cuff ?? 0xd9d2c3), 0, -0.47);
    const h = add(p, GEO("hand", () => { const g = new THREE.SphereGeometry(0.046, 10, 8); g.scale(0.8, 1.15, 0.55); return g; }), skinM, 0, -0.56);
    p.userData.hand = h;
    return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // the head
  const neck = new THREE.Group(); neck.position.y = 0.6; hips.add(neck);
  add(neck, GEO("neck", () => new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10)), skinM, 0, 0.03);
  add(neck, GEO("stock", () => new THREE.CylinderGeometry(0.058, 0.07, 0.05, 12)), M(o.collar ?? 0xe6e0d4), 0, 0.01);
  if (o.collar === 0xffffff || o.bands) add(neck, GEO("bands", () => new THREE.BoxGeometry(0.07, 0.1, 0.01)), M(0xffffff), 0, -0.04, 0.09);
  const head = add(neck, GEO("head", () => { const g = new THREE.SphereGeometry(0.118, 18, 14); g.scale(0.9, 1.08, 0.98); return g; }), skinM, 0, 0.17);
  // (no separate jaw: the head is one smooth shape, with no chin standing out)
  for (const sx of [-1, 1]) {
    add(neck, GEO("ear", () => { const g = new THREE.SphereGeometry(0.026, 8, 6); g.scale(0.5, 1, 0.8); return g; }), skinM, sx * 0.105, 0.165, -0.005);
    add(neck, GEO("eyeWhite", () => { const g = new THREE.SphereGeometry(0.014, 8, 6); g.scale(1.2, 0.75, 0.6); return g; }), mat(0xe8e2d8, { roughness: 0.3 }), sx * 0.04, 0.185, 0.103);
    add(neck, GEO("pupil", () => new THREE.SphereGeometry(0.009, 6, 4)), mat(o.eyes ?? r.pick([0x3a2a1a, 0x2e4a6a, 0x3e5a3a, 0x4a3a2a]), { roughness: 0.2 }), sx * 0.04, 0.185, 0.111);
    if (skirt) add(neck, GEO("brow", () => new THREE.BoxGeometry(0.042, 0.009, 0.012)), M(shade(hair, -0.05)), sx * 0.041, 0.212, 0.108, 0, 0, sx * -0.12);
    else add(neck, GEO("browM", () => new THREE.BoxGeometry(0.048, 0.015, 0.016)), M(shade(hair, -0.1)), sx * 0.041, 0.209, 0.108, 0, 0, sx * -0.05);
  }
  add(neck, GEO("nose", () => { const g = new THREE.ConeGeometry(0.018, 0.05, 6); g.rotateX(Math.PI / 2 + 0.35); return g; }), skinM, 0, 0.16, 0.115);
  add(neck, GEO("mouth", () => new THREE.BoxGeometry(0.038, 0.008, 0.01)), mat(0x8a4a42), 0, 0.118, 0.1);
  // hair
  const hairM = mat(hair, { roughness: 0.85, surface: "none" });
  add(neck, GEO("hairCap", () => { const g = new THREE.SphereGeometry(0.126, 16, 10, 0, TAU, 0, Math.PI * 0.5); g.scale(0.94, 1.08, 1.02); return g; }), hairM, 0, 0.182, -0.012, -0.25);
  add(neck, GEO("hairBack", () => { const g = new THREE.SphereGeometry(0.12, 12, 8); g.scale(0.92, 0.9, 0.7); return g; }), hairM, 0, 0.15, -0.04);
  if (o.longHair === "short") add(neck, GEO("queue", () => new THREE.CapsuleGeometry(0.035, 0.08, 4, 6)), hairM, 0, 0.06, -0.1, 0.25);
  else if (o.longHair || skirt) {
    add(neck, GEO("longHair", () => { const g = new THREE.CylinderGeometry(0.1, 0.08, 0.26, 12, 1, true, Math.PI * 0.62, Math.PI * 0.76); return g; }), mat(hair, { roughness: 0.85, side: THREE.DoubleSide }), 0, 0.07, 0);
    if (skirt && !o.hat) add(neck, GEO("bun", () => new THREE.SphereGeometry(0.055, 10, 8)), hairM, 0, 0.2, -0.12);
  }
  if (o.beard) {
    const bm = M(o.beard === true ? hair : o.beard);
    add(neck, GEO("beard", () => { const g = new THREE.SphereGeometry(0.075, 10, 8, 0, TAU, Math.PI * 0.4, Math.PI * 0.6); g.scale(1.05, 1.15, 0.9); return g; }), bm, 0, 0.13, 0.035);
    add(neck, GEO("moustache", () => new THREE.BoxGeometry(0.07, 0.018, 0.02)), bm, 0, 0.135, 0.108);
  }

  const hat = o.hat;
  const hatM = M(o.hatColor ?? 0x1e1a18);
  if (hat === "tricorn") {
    add(neck, GEO("tricornCrown", () => new THREE.CylinderGeometry(0.11, 0.125, 0.1, 14)), hatM, 0, 0.3);
    // three brims turned up
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU;
      add(neck, GEO("tricornSide", () => new THREE.BoxGeometry(0.28, 0.1, 0.03)), hatM, Math.sin(a) * 0.13, 0.3, Math.cos(a) * 0.13, 0, a, 0);
    }
    add(neck, GEO("tricornTrim", () => new THREE.TorusGeometry(0.125, 0.006, 4, 16)), brass, 0, 0.255, 0, Math.PI / 2);
  } else if (hat === "hat") {
    add(neck, GEO("brimFlat", () => new THREE.CylinderGeometry(0.22, 0.22, 0.018, 20)), hatM, 0, 0.27);
    add(neck, GEO("crownTall", () => new THREE.CylinderGeometry(0.105, 0.12, 0.17, 16)), hatM, 0, 0.36);
    add(neck, GEO("hatband", () => new THREE.CylinderGeometry(0.122, 0.122, 0.03, 16)), M(0x3a2e24), 0, 0.29);
  } else if (hat === "cap") {
    add(neck, GEO("capDome", () => { const g = new THREE.SphereGeometry(0.135, 14, 8, 0, TAU, 0, Math.PI * 0.5); g.scale(1, 0.75, 1.05); return g; }), hatM, 0, 0.215, -0.01);
    add(neck, GEO("capRoll", () => new THREE.TorusGeometry(0.13, 0.018, 6, 18)), hatM, 0, 0.215, -0.01, Math.PI / 2);
  } else if (hat === "bonnet") {
    const bM = mat(o.hatColor ?? 0xf0ebe0, { roughness: 0.9, side: THREE.DoubleSide });
    add(neck, GEO("bonnet", () => { const g = new THREE.SphereGeometry(0.142, 14, 10, 0, TAU, 0, Math.PI * 0.62); g.scale(1, 1.02, 1.08); return g; }), bM, 0, 0.19, -0.02, -0.35);
    add(neck, GEO("bonnetRuffle", () => new THREE.TorusGeometry(0.128, 0.014, 5, 20, Math.PI * 1.2)), bM, 0, 0.18, 0.04, 0.2, 0, -Math.PI * 0.1 + Math.PI);
  } else if (hat === "helmet") {
    const steel = mat(0x9a9da2, { metalness: 0.75, roughness: 0.35 });
    add(neck, GEO("morionDome", () => { const g = new THREE.SphereGeometry(0.14, 16, 8, 0, TAU, 0, Math.PI * 0.5); g.scale(1, 1.2, 1.1); return g; }), steel, 0, 0.215);
    add(neck, GEO("morionBrim", () => { const g = new THREE.TorusGeometry(0.17, 0.035, 4, 20); g.rotateX(Math.PI / 2); g.scale(1, 1, 1.3); return g; }), steel, 0, 0.215);
    add(neck, GEO("morionComb", () => { const g = new THREE.CylinderGeometry(0.13, 0.13, 0.015, 16, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); return g; }), steel, 0, 0.3, 0);
  }
  if (o.sash) {
    // a baldric, shoulder to hip, front and back
    add(hips, GEO("sashF", () => new THREE.BoxGeometry(0.07, 0.62, 0.015)), M(o.sash), 0, 0.3, 0.135, 0, 0, 0.62);
    add(hips, GEO("sashB", () => new THREE.BoxGeometry(0.07, 0.62, 0.015)), M(o.sash), 0, 0.3, -0.135, 0, 0, -0.62);
  }
  if (o.chain) add(hips, GEO("chain", () => new THREE.TorusGeometry(0.1, 0.012, 6, 16)), mat(0xd4af37, { metalness: 0.9, roughness: 0.3 }), 0, 0.46, 0.08, 1.15);

  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });

  // held things hang off the right hand
  const held = new THREE.Group(); held.position.y = -0.58; armR.add(held);
  const heldL = new THREE.Group(); heldL.position.y = -0.58; armL.add(heldL);

  const P = {
    colors: { skin: o.skinColor ?? skin, coat: o.coat ?? coat, linen: o.linenColor ?? 0xd9d2c3 },   // (what your own hands and sleeves are, first person)
    root, body, hips, legL, legR, armL, armR, neck, head, held, heldL,
    // (a long arm in both hands: see aimPlace)
    aimHold(obj, how) {
      if (this.aimH && this.aimH.obj !== obj) this.root.remove(this.aimH.obj);
      this.aimH = obj ? { obj, ...how } : null;
      if (obj) { this.root.add(obj); this.aimK = this.aimWant ? 1 : 0; }
    },
    phase: r() * TAU, walkAmt: 0, pose: "idle", poseT: 0, look: 0, sitting: 0,
    update(dt, speed = 0) {
      this.poseT += dt; if (this.thrustT != null) this.thrustT += dt;
      const moving = speed > 0.15;
      this.walkAmt += ((moving ? Math.min(1, speed / 1.6) : 0) - this.walkAmt) * Math.min(1, dt * 8);
      this.phase += dt * (2.2 + speed * 2.4) * (moving ? 1 : 0.3);
      const w = this.walkAmt, sw = Math.sin(this.phase);
      const run = Math.min(1, Math.max(0, (speed - 2.5) / 2));
      legL.rotation.x = sw * (0.55 + run * 0.35) * w;
      legR.rotation.x = -sw * (0.55 + run * 0.35) * w;
      hips.position.y = 0.92 + Math.abs(Math.cos(this.phase)) * 0.04 * w - this.sitting * 0.42;
      body.rotation.x = run * 0.18;
      body.rotation.y = 0;
      const breathe = Math.sin(this.poseT * 1.6) * 0.02;
      let aL = -sw * 0.45 * w * (1 + run * 0.6), aR = sw * 0.45 * w * (1 + run * 0.6), zL = 0.06, zR = -0.06;
      armL.rotation.set(aL + breathe, 0, zL);
      armR.rotation.set(aR - breathe, 0, zR);
      const t = this.poseT;
      switch (this.pose) {
        case "torch": armR.rotation.set(-1.25, 0, -0.15); break;
        case "lantern": armR.rotation.set(-0.35, 0, -0.1); break;
        case "writ": armR.rotation.set(-1.15, 0.25, 0.1); armL.rotation.set(-1.15, -0.25, -0.1); break;
        case "point": armR.rotation.set(-1.5, 0, -0.1); break;
        case "hold": armR.rotation.set(-0.9, 0.3, 0.1); armL.rotation.set(-0.9, -0.3, -0.1); break;
        case "armsCrossed": armR.rotation.set(-1.1, -0.9, 0); armL.rotation.set(-1.1, 0.9, 0); break;
        case "reach": armR.rotation.set(-1.4, 0, 0); armL.rotation.set(-1.4, 0, 0); break;
        case "chop": {
          // a felling swing: wind back to the right, sweep through level, follow round to the left
          const c = (t * 1.25) % 1;
          const e = x => x * x * (3 - 2 * x);
          const twist = c < 0.45 ? -0.95 * e(c / 0.45) : c < 0.62 ? -0.95 + 1.75 * e((c - 0.45) / 0.17) : 0.8 - 0.8 * e(Math.min(1, (c - 0.62) / 0.38));
          body.rotation.y = twist * 0.25;   // (the stroke from the shoulders: the trunk turns a little, not wrung round)
          armR.rotation.set(-1.35, 0, -0.35 + twist * 0.3); armL.rotation.set(-1.3, 0, 0.45 + twist * 0.3);
          body.rotation.x = 0.08;
          break;
        }
        case "hammer": { const c = (t * 2.2) % 1; armR.rotation.set(-1.0 - Math.sin(c * Math.PI) * 1.2, 0, -0.1); armL.rotation.set(-0.8, 0, 0.1); body.rotation.x = 0.35; break; }
        case "sit": armR.rotation.set(-0.7, 0.2, 0); armL.rotation.set(-0.7, -0.2, 0); break;
        case "grieve": armR.rotation.set(-1.9, -0.6, 0); armL.rotation.set(-1.9, 0.6, 0); neck.rotation.x = 0.4; break;
        case "bound": armR.rotation.set(0.35, -0.5, 0.2); armL.rotation.set(0.35, 0.5, -0.2); break;
        case "swim": {
          // a breaststroke, laid out along the water: arms out in front, a wide sweep, drawn in; the legs a frog kick
          const c = (t * 0.55) % 1, out = c < 0.3 ? c / 0.3 : c < 0.65 ? 1 : 1 - (c - 0.65) / 0.35, wide = c < 0.3 ? 0 : c < 0.65 ? (c - 0.3) / 0.35 : 1 - (c - 0.65) / 0.35;
          armR.rotation.set(-1.4 - out * 1.5, 0, -0.2 - wide * 1.0); armL.rotation.set(-1.4 - out * 1.5, 0, 0.2 + wide * 1.0);
          const kick = Math.sin(c * Math.PI * 2);
          legL.rotation.set(kick * 0.35, 0, 0.15 + Math.max(0, kick) * 0.3); legR.rotation.set(kick * 0.35, 0, -0.15 - Math.max(0, kick) * 0.3);
          break;
        }
      }
      // (in the water, the whole body laid along it, its back at the surface)
      swimLay(this, dt);
      if (this.pose !== "grieve") neck.rotation.x += ((this.pose === "sit" ? 0.1 : 0) - neck.rotation.x) * Math.min(1, dt * 6);
      // the cloth follows the legs: each point swings with the leg on its side, more the lower it hangs
      if (cloth.length && root.visible) {
        const aL = legL.rotation.x, aR = legR.rotation.x;
        for (const c of cloth) {
          const pos = c.m.geometry.attributes.position, b = c.base;
          for (let i = 0; i < pos.count; i++) {
            const x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2];
            const depth = Math.max(0, -(y + c.y) - 0.05);
            if (depth <= 0) { pos.setXYZ(i, x, y, z); continue; }
            // left of the middle follows the left leg, right the right, blended across the front and back
            const k = Math.min(1, Math.max(0, (x / 0.16 + 1) / 2));
            const a = (aL * (1 - k) + aR * k) * 0.8;
            pos.setXYZ(i, x, y + depth * (1 - Math.cos(a)), z - depth * Math.sin(a));
          }
          pos.needsUpdate = true;
          c.m.geometry.computeVertexNormals();
        }
      }
      neck.rotation.y += (this.look - neck.rotation.y) * Math.min(1, dt * 5);
      if (this.sitting > 0.01) { legL.rotation.x = -1.45 * this.sitting; legR.rotation.x = -1.45 * this.sitting; }
      // (a long arm, placed at the shoulder; a body of the model's own bends its arms to it after its clip, below)
      if (!this.bones && this.aimH) aimPlace(this, dt);
    },
    setPose(p) { if (p === "armsCrossed") p = "idle";   // (the arms-crossed stance came out as both hands raised: retired, they stand at ease)
      if (p !== this.pose) { this.pose = p; this.poseT = 0; if (p === "punch") this.thrustT = 0; } },
    // a child's head is big for the body; it evens out as they grow
    setHeadScale(k) { this.headK = k; neck.scale.setScalar(k); if (this.headBone) this.headBone.scale.setScalar(k); },
  };
  if (o.model && MODELS[o.model]) useModel(P, o.model, { coat, legs, vest: o.vest, cuff: o.cuff ?? o.vest, skirt: skirt ? (o.skirtColor ?? coat) : undefined, apron: o.apron, hat: o.hatColor, sash: o.sash, hide: o.hide, skin: o.skinColor, hair: o.hairColor, iris: o.eyeColor, stockings: o.stockingsColor, linen: o.linenColor });
  // a hat of another outfit's than this one's own
  if (o.hatStyle && o.hatStyle !== o.model && P.modelScene) borrowHat(P, P.modelScene, o.hatStyle, o.hatColor);
  if (o.headScale && o.headScale !== 1) P.setHeadScale(o.headScale);
  noSnow(P.root);
  return P;
}

// ---------------------------------------------------------------------------
//  models from Blender
// ---------------------------------------------------------------------------
// Anything listed in models/manifest.json is loaded at start, and replaces the
// shape built in code with the same name. See models/README.md.
export const MODELS = {};
const CLOTH_PARTS = new Set(["coat", "cuff", "legs", "stockings", "linen", "vest", "skirt", "apron", "hat", "sash", "cloth", "rope", "sail", "flag"]);
const BARE_PARTS = new Set(["skin", "eyes", "iris", "hair", "beard", "tash", "metal", "leather", "belt"]);
export async function loadModels(base = "models/") {
  let list;
  try { const r = await fetch(base + "manifest.json", { cache: "no-cache" }); if (!r.ok) return; list = await r.json(); } catch (e) { return; }
  const keys = Object.keys(list).filter(k => !k.startsWith("_") && list[k]);
  if (!keys.length) return;
  await loaderReady();
  await Promise.all(keys.map(k => fetchModel(k, base + list[k])));
}
// the loader, fetched once
let _loader = null, _loaderP = null;
function loaderReady() {
  return _loaderP || (_loaderP = Promise.all([import("../lib/loaders/GLTFLoader.js"), import("../lib/utils/SkeletonUtils.js")]).then(([{ GLTFLoader }, SU]) => { _clone = SU.clone; _loader = new GLTFLoader(); }));
}
// what a model's material is named for decides its grain: a building's plaster, brick and tiles get their own
const SURF_BY_NAME = { steel: "none", brass: "none", rod: "wood", fur: "none", hide: "none", plaster: "plaster", brick: "brick", stone: "stone", tiles: "tiles", roof: "log", wood: "wood", log: "log", glass: "none", iron: "none", soot: "none", horn: "none",
  // (a tree's bark and needles; a ship's hull; the oven's clay; a candle's wax; a burned house's char and ash; the far city's water and roofs)
  bark: "bark", needles: "needles", pbr: "none", hull: "wood", clay: "plaster", wax: "none", char: "wood", ash: "none", water: "none", copper: "none", earth: "none", house: "plaster" };
const _loading = {};
const BUILDING = k => /^town\//.test(k) || ["home_2", "cabin", "cabin_burned", "woodshed", "well"].includes(k);
// ---- the logs of a log wall: round, and their ends sawn ----
// (as the files have them each log is a ten-sided prism with its ends smoothed into its sides, so a wall's corners
//  showed rows of soft tan blobs. Each log's length gets true round normals, out from its own axis, and each end a flat
//  face and its place on a sawn round — drawn in roundLogMat with the photographed end of a log)
function roundLogs(geo) {
  if (!geo || geo.userData.roundLogs || !geo.index || !geo.attributes.normal) return;
  geo.userData.roundLogs = true;
  const P = geo.attributes.position, N = geo.attributes.normal, I = geo.index, n = P.count;
  const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
  const f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < I.count; t += 3) { const a = f(I.getX(t)), b = f(I.getX(t + 1)), c = f(I.getX(t + 2)); par[a] = c; par[b] = c; }
  const comps = new Map(); for (let i = 0; i < n; i++) { const r = f(i); let L = comps.get(r); if (!L) comps.set(r, (L = [])); L.push(i); }
  const end = new Float32Array(n * 3);
  for (const v of comps.values()) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const i of v) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    if (Math.min(ex, ez) < 0.02 && Math.max(ex, ez) < 0.7 && ey < 0.7 && ey > 0.05) {
      // (an end: flat across the log, facing out along it)
      const ax = ex < ez ? 0 : 2; let sum = 0; for (const i of v) sum += ax === 0 ? N.getX(i) : N.getZ(i);
      const sg = sum >= 0 ? 1 : -1, r = Math.max(ey, ax === 0 ? ez : ex) / 2;
      for (const i of v) { N.setXYZ(i, ax === 0 ? sg : 0, 0, ax === 2 ? sg : 0); end[i * 3] = (ax === 0 ? P.getZ(i) - cz : P.getX(i) - cx) / r * sg; end[i * 3 + 1] = (P.getY(i) - cy) / r; end[i * 3 + 2] = 1; }
    } else if (Math.max(ex, ez) > 4 * ey && ey > 0.05) {
      // (a log's length: round, out from its axis)
      const ax = ex > ez ? 0 : 2;
      for (const i of v) { const dy = P.getY(i) - cy, dh = ax === 0 ? P.getZ(i) - cz : P.getX(i) - cx, l = Math.hypot(dy, dh) || 1; N.setXYZ(i, ax === 2 ? dh / l : 0, dy / l, ax === 0 ? dh / l : 0); }
    }
  }
  N.needsUpdate = true; geo.setAttribute("aLogEnd", new THREE.BufferAttribute(end, 3));
}
// (the logs peeled and weathered: the files' orange pine greyed toward the silver-brown of a wall some winters old;
//  the ends, a sawn round's rings and checks)
function roundLogMat(m) {
  const tex = logTex("log_end_a");
  return addHook(m, sh => {
    sh.uniforms.uLogEnd = { value: tex };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aLogEnd; varying vec3 vLogEnd;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLogEnd = aLogEnd;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vLogEnd; uniform sampler2D uLogEnd;").replace("#include <color_fragment>", `#include <color_fragment>
      if (vLogEnd.z > 0.5) { diffuseColor.rgb = texture2D(uLogEnd, vLogEnd.xy * 0.46 + 0.5).rgb * vec3(0.86, 0.8, 0.74); }
      else { float lw = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lw) * vec3(1.0, 0.9, 0.78), 0.38) * 0.9; }`);
  }, "roundlog");
}
// (the bought animals' clips, mended. The bear's standing clip reared it up on its hind legs to graze, and its run stood
//  it on end; its walk and run carried it forward from where it was and snapped it back each stride; and on all fours its
//  paws were a foot deep in the ground — so it stands as it looks about, runs on its walk (quickened), keeps its place,
//  and is set on the ground. The wolf's look about (the maker's demo clip) dropped it fifty metres into the ground, or laid it on
//  its side in the air: it stands as it does standing)
function mendBeast(k, gltf) {
  const clips = gltf.animations || [], clip = n => clips.find(c => c.name === n);
  const same = (to, from) => { if (to && from) { to.tracks = from.tracks.map(t => t.clone()); to.duration = from.duration; } };
  if (k === "bear") {
    for (const c of clips) c.tracks = c.tracks.filter(t => !/^Root_\d+\.position$/.test(t.name));
    same(clip("Idle"), clip("Look")); same(clip("Run"), clip("Walk"));
    gltf.scene.position.y += 0.54;
  }
  if (k === "wolf") same(clip("Look"), clip("Idle"));
}
// (the spruce's needles as needles: the model's clumps of facets — the trees round the clearing, the ones you fell —
//  stood near to like cut green glass, and a picture laid over them didn't save them. Each clump is found (its own piece
//  of the mesh), and in its place three cards of the photographed spray, crossed along the line of its branch from the
//  trunk out, its size and its shade: the tree keeps the shape it was built with, every whorl and droop, and is needles)
function spruceCards(mesh) {
  const g = mesh.geometry, P = g.attributes.position, C = g.attributes.color, I = g.index, n = P.count;
  // (its pieces: the corners that stand in the same place are one, and a triangle joins its three)
  const key = new Map(), id = new Int32Array(n), par = [];
  for (let i = 0; i < n; i++) { const k = Math.round(P.getX(i) * 1e3) + "," + Math.round(P.getY(i) * 1e3) + "," + Math.round(P.getZ(i) * 1e3); let v = key.get(k); if (v === undefined) { v = par.length; par.push(v); key.set(k, v); } id[i] = v; }
  const find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < I.count; t += 3) { const a = find(id[I.getX(t)]), b = find(id[I.getX(t + 1)]), c = find(id[I.getX(t + 2)]); par[b] = a; par[find(c)] = a; }
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = find(id[i]); let q = comps.get(r); if (!q) comps.set(r, q = []); q.push(i); }
  const pos = [], uv = [], col = [], nrm = [], idx = [], V = THREE.Vector3, up = new V(0, 1, 0), rnd = rng(77);
  // (the model's middle green, as a grey of 1: each clump as much darker or lighter as it was painted)
  let ref = 0; if (C) { for (let i = 0; i < n; i++) ref += 0.299 * C.getX(i) + 0.587 * C.getY(i) + 0.114 * C.getZ(i); ref /= n; } else ref = 1;
  for (const q of comps.values()) {
    if (q.length < 6) continue;
    const c = new V(), cc = [0, 0, 0];
    for (const i of q) { c.x += P.getX(i); c.y += P.getY(i); c.z += P.getZ(i); if (C) { cc[0] += C.getX(i); cc[1] += C.getY(i); cc[2] += C.getZ(i); } }
    c.multiplyScalar(1 / q.length);
    // (out from the trunk; a clump on the trunk itself — the leader — points up)
    const d = new V(c.x, 0, c.z); const onTrunk = d.length() < 0.12; if (onTrunk) d.set(0, 1, 0); else d.normalize();
    const t = onTrunk ? new V(1, 0, 0) : new V().crossVectors(up, d).normalize(), u = new V().crossVectors(d, t).normalize();
    let d0 = 1e9, d1 = -1e9, t0 = 1e9, t1 = -1e9, u0 = 1e9, u1 = -1e9; const w = new V();
    for (const i of q) { w.set(P.getX(i), P.getY(i), P.getZ(i)).sub(c); const a = w.dot(d), b = w.dot(t), e = w.dot(u); d0 = Math.min(d0, a); d1 = Math.max(d1, a); t0 = Math.min(t0, b); t1 = Math.max(t1, b); u0 = Math.min(u0, e); u1 = Math.max(u1, e); }
    const L = (d1 - d0) * 1.3 + 0.15, W = Math.max(t1 - t0, u1 - u0) * 1.25 + 0.1, mid = c.clone().addScaledVector(d, (d0 + d1) / 2);
    const lum = C ? (0.299 * cc[0] + 0.587 * cc[1] + 0.114 * cc[2]) / q.length : ref, k = Math.min(1.3, Math.max(0.5, lum / ref)) * 1.0;
    // (a little droop to each card, the tip lower than where it leaves the branch)
    const droop = onTrunk ? 0 : 0.12 + rnd() * 0.18;
    for (const ang of [0, 1.05, -1.05]) {
      const ax = new V().copy(t).multiplyScalar(Math.cos(ang + (rnd() - 0.5) * 0.3)).addScaledVector(u, Math.sin(ang + (rnd() - 0.5) * 0.3)).multiplyScalar(W / 2);
      const base = pos.length / 3;
      const a0 = mid.clone().addScaledVector(d, -L / 2).addScaledVector(u, L * droop * 0.5), a1 = mid.clone().addScaledVector(d, L / 2).addScaledVector(u, -L * droop * 0.5);
      for (const [p, uu, vv, kk] of [[a0.clone().sub(ax), 0, 0, 0.78], [a1.clone().sub(ax), 1, 0, 1.06], [a1.clone().add(ax), 1, 1, 1.06], [a0.clone().add(ax), 0, 1, 0.78]]) {
        pos.push(p.x, p.y, p.z); uv.push(uu, vv); col.push(k * kk, k * kk, k * kk);
        const nn = new V(p.x, 0, p.z).normalize().multiplyScalar(0.6).add(new V(0, 0.55, 0)).normalize(); nrm.push(nn.x, nn.y, nn.z);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3)); out.setIndex(idx);
  out.computeBoundingSphere(); out.computeBoundingBox();
  mesh.geometry = out;
  mesh.material = TREE.spruceMat;
}
async function fetchModel(k, url) {
  try {
    MODELS[k] = await _loader.loadAsync(url);
    if (k === "bear" || k === "wolf") mendBeast(k, MODELS[k]);
    if (k === "spruce") MODELS[k].scene.traverse(o => { if (o.isMesh && /needles/.test(o.material.name || "")) spruceCards(o); });
    // the same grain and weathering as everything built in code; a person's materials are named for
    // what they are, so cloth gets the weave and skin gets nothing
    MODELS[k].scene.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial || o.material.userData.detail) return;
      // (the stuff it's made of is the last word of its name; Blender's ".001" on a copy is no part of it)
      const m = o.material, n = (m.name || "").split("_").pop().replace(/\.\d+$/, "");
      m.userData.detail = true;
      m.userData.part = n;
      m.userData.surface = CLOTH_PARTS.has(n) ? "cloth" : BARE_PARTS.has(n) ? "none" : SURF_BY_NAME[n] || "auto";
      // (a quarry's and a mine's stone is the rock of the hill, broken — not a mason's wall)
      if (n === "stone" && /quarry|mine/.test(k)) m.userData.surface = "rock";
      // (a real animal's fur and eyes are painted in its own textures: no grain laid over them)
      // (the real ships' hulls and rigging as photographed: no grain over them; their sails, cloth)
      if (/^ship_(dutch|pinnace)/.test(k)) { m.userData.surface = n === "sail" ? "cloth" : "none"; if (n === "sail") m.side = THREE.DoubleSide; }
      if (/^(deer|doe|hare|bear|boar|wolf|fox|horse|elephant|giraffe|camel|polarbear)$/.test(k)) {
        m.userData.surface = "none";
        // (never left out for being "off screen": the wolf's skin hangs under a node fifty metres from where its bones
        //  put it, and three judged it from there — it was culled wherever it stood, and no wolf was ever seen)
        if (o.isSkinnedMesh) o.frustumCulled = false;
        // (fur and hide are matte: a soft sheen at most, never the gloss of wet paint the files came with)
        m.roughness = Math.max(m.roughness ?? 1, 0.88); m.metalness = 0; if (m.roughnessMap) m.roughnessMap = null; if (m.metalnessMap) m.metalnessMap = null;
        // (and no baked shadow map: the horse's, laid over the game's own light and shadow, all but blacked it out)
        if (m.aoMap) m.aoMap = null;
        if (m.specularIntensity != null) m.specularIntensity = 0.3;
        // (the wolf's and the bear's files say their fur bends light a thousand times as glass does, with a black sheen:
        //  the bear was drawn as a black hole in the shape of a bear, and the wolf not at all)
        if (m.ior != null && m.ior > 3) m.ior = 1.45;
        if (m.specularColor && m.specularColor.getHex() === 0) m.specularColor.set(0xffffff);
        // (and the coats as they are in a northern wood, not as painted: the red deer's had come out a bright copper-pink
        //  and the fox's a flame orange, louder than anything else in the world; and the brown bear's painted all but black)
        // (drawn part way toward the brown of the coat's own lightness, not toward grey: greyed, the deer's went mauve)
        const coat = { deer: [0.5, "1.22, 0.96, 0.7"], doe: [0.5, "1.22, 0.96, 0.7"], fox: [0.7, "1.3, 0.92, 0.6"], bear: [0.15, "2.9, 1.65, 1.2"] }[k];
        if (coat && !/eye/i.test(m.name || "")) addHook(m, sh => {
          sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
            { float fl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(fl * vec3(${coat[1]}), diffuseColor.rgb, ${coat[0].toFixed(2)}); }`);
        }, "coat" + k);
      }
      if (n === "glass") { m.roughness = 0.15; m.metalness = 0.4; }
      // (bright metal — a gun's furniture, a blade — with no reflection to show goes black: kept only a little metal)
      if (n === "steel" || n === "brass" || n === "iron") m.metalness = Math.min(m.metalness, n === "iron" ? 0.3 : 0.4);
      // (a hat of steel — the watch's morion — is polished metal, not felt: no weave on it, and bright, since with no
      // reflection to show a metal goes dark)
      // (a steel helmet: dark polished iron with the sun's sheen on it — it was a pale grey that read as white in daylight)
      if (n === "hat" && m.metalness > 0.2) { m.userData.part = "helmet"; m.userData.surface = "none"; m.metalness = 0.4; m.roughness = 0.28; m.color.set(0x80848a); m.emissive.set(0x07080a); }
      // a building is solid, closed shapes: drawn from the outside only (both sides drawn, the back of one face fights
      // the face behind it — a gable built of two, a frame against its wall — and flickers); and its trim — timber,
      // iron, glass — always drawn in front of the plaster or brick it lies on
      if (BUILDING(k)) {
        if (n === "log" && o.geometry && !/burned/.test(k)) { roundLogs(o.geometry); if (o.geometry.attributes.aLogEnd) roundLogMat(m); }
        m.side = THREE.FrontSide;
        if (/^(wood|iron|glass|metal|log|roof)$/.test(n)) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
      }
      // (a tree's needles and leaves thin away when you stand inside it, so you can see out)
      addDetail(m, { scale: 2, amount: 0.22, grain: 0.6, surface: m.userData.surface, seeThrough: /needle|lea[fv]|foliage|canopy/i.test(m.name || "") ? 3.6 : 0 });
      shine(m);
    });
  }
  catch (e) { console.warn("Reckoning: could not load model", k, url, e); }
}
// ---- a ship's canvas ----
// (the model's sails lie furled on their yards, as a ship's do at anchor: at sea each yard's sail is let fall from it,
//  full of the wind — [mast's z, the yard's height, half the sail's breadth at its head and at its foot, its drop, a course?]
//  in the model's own measures; the courses, the lowest, are the first taken in when she shortens sail)
const RIG = [[5.6, 8.9, 2.76, 3.0, 4.3, 1], [5.6, 15.36, 1.8, 2.6, 6.0, 0], [-0.6, 10.1, 2.76, 3.0, 5.4, 1], [-0.6, 17.7, 1.8, 2.6, 7.2, 0], [-6.4, 7.35, 2.76, 2.9, 2.0, 1], [-6.4, 12.1, 1.8, 2.6, 4.3, 0]];
// (one sail of unit drop and unit belly, its breadth its own: drawn to its drop and filled by scaling)
function sailGeo(h0, h1, col) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 8), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const u = P.getX(i) + 0.5, v = 0.5 - P.getY(i), x = (2 * u - 1) * (h0 + (h1 - h0) * v);
    P.setXYZ(i, x, -v, Math.sin(Math.PI * Math.pow(v, 0.85)) * (1 - 0.45 * (2 * u - 1) ** 2));
  }
  if (col) g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(P.count).fill(col).flat(), 3));
  g.computeVertexNormals(); return g;
}

// a ship's sails set (the ship model's lie furled on their yards, as at anchor): one let fall from each yard, hidden
// and furled till its owner gives it k (0 furled, 1 set) and scales it — or all set at once with full
export function shipSails(scene, full = false) {
  let furl = null; scene.traverse(o => { if (o.isMesh && o.material && /sail/.test(o.material.name || "")) furl = o; });
  if (!furl) return [];
  const C = furl.geometry.attributes.color, col = C ? [0.97, 0.95, 0.9].map((w, j) => { let t = 0; for (let i = 0; i < C.count; i++) t += [C.getX(i), C.getY(i), C.getZ(i)][j]; return t / C.count * w; }) : null;   // (the furled canvas's own colour, weathered a shade)
  // (cut: how far her rigging must be shot away before this sail is lost — each its own, the main topsail never)
  return RIG.map(([z, y, h0, h1, drop, course], i) => {
    const sl = new THREE.Mesh(sailGeo(h0, h1, col), furl.material); sl.position.set(0, y - 0.15, z + 0.3); sl.castShadow = true; sl.receiveShadow = true;
    if (full) sl.scale.set(1, drop, 0.9); else { sl.scale.set(1, 0.001, 0.001); sl.visible = false; }
    scene.add(sl); return { m: sl, drop, course: !!course, k: full ? 1 : 0, ph: Math.random() * 6, cut: i === 3 ? 0 : 0.2 + Math.random() * 0.55 };
  });
}
// a model that is only fetched when first wanted (the town's buildings, in every style):
// resolves once it is there; until then modelCopy(key) is null
export function ensureModel(key) {
  if (MODELS[key]) return Promise.resolve(true);
  return _loading[key] || (_loading[key] = loaderReady().then(() => fetchModel(key, `models/${key}.glb`)).then(() => !!MODELS[key]));
}
let _clone = null;
// a fresh copy of a loaded model, shadows on, or null if there is none
let SACK = null, SACK_CORD = null;
export function modelCopy(key) {
  const g = MODELS[key]; if (!g) return null;
  const scene = _clone ? _clone(g.scene) : g.scene.clone(true);
  scene.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { scene, animations: g.animations || [] };
}
// Swap a built person for a Blender one. The code-built skeleton keeps working
// underneath, unseen, so held things and poses still have somewhere to hang;
// the model plays its own Idle / Walk / Run / Sit / Chop animations if it has them.
// the mean of a mesh's painted colours (once per geometry)
function paintedMean(geo) {
  if (geo.userData.mean) return geo.userData.mean;
  const c = geo.attributes.color, n = c.count, m = [0, 0, 0];
  for (let i = 0; i < n; i++) { m[0] += c.getX(i); m[1] += c.getY(i); m[2] += c.getZ(i); }
  return geo.userData.mean = m.map(v => v / (n || 1));
}
// ---- clothes as they were worn: no dye stayed bright for long, nothing was white for long. Every colour faded and
// dulled; a linen apron or shirt the grey-cream of unbleached cloth that's been washed in cold water; and on all of it
// the dirt — mud splashed up from the ground, heaviest at the hems, the shoes and stockings, blotches and stains, and
// grime worked into the creases ----
const WORN_PARTS = new Set(["coat", "cuff", "legs", "stockings", "linen", "vest", "skirt", "apron", "hat", "sash", "cloth"]);
export function wornColour(c) {
  // (worked in sRGB, as the eye sees it: in three's linear space a white's "lightness" was already low, and halving it
  //  left an apron that still read as white)
  const S = THREE.SRGBColorSpace, h = {}; c.getHSL(h, S);
  // (dye fades with wear and sun, greyer and if anything lighter, not darker — the dirt is laid on by wornCloth's mud and
  //  grime: darkened as well, every coat in the game went to a black silhouette)
  let l = h.l * 0.86 + 0.035, sat = h.s * 0.45;
  // (white and near-white: unbleached, greyed, a little yellow-brown)
  if (h.l > 0.7) { l = 0.5 + (h.l - 0.7) * 0.3; sat = Math.min(Math.max(sat, 0.1), 0.18); c.setHSL(0.09, sat, l, S); return c; }
  c.setHSL(h.h, sat, l, S); return c;
}
function wornCloth(m, part) {
  m.userData.worn = true;
  if (m.color) {
    // (a colour painted in the model's vertices was divided out of the tint, see above: worn as it stands, the tint's
    //  own brightness kept relative)
    const vc = m.userData.vcMean; if (vc) m.color.multiply(new THREE.Color(vc[0], vc[1], vc[2]));
    wornColour(m.color);
    if (vc) { m.color.r /= Math.max(0.04, vc[0]); m.color.g /= Math.max(0.04, vc[1]); m.color.b /= Math.max(0.04, vc[2]); }
  }
  m.roughness = Math.max(m.roughness ?? 0.9, 0.9);
  addHook(m, sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWornP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWornP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vWornP;
      float wH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float wN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(wH(i), wH(i + vec3(1,0,0)), f.x), mix(wH(i + vec3(0,1,0)), wH(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(wH(i + vec3(0,0,1)), wH(i + vec3(1,0,1)), f.x), mix(wH(i + vec3(0,1,1)), wH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec3 wp = vWornP;
          float n1 = wN(wp * 7.0), n2 = wN(wp * 23.0 + 4.0), n3 = wN(wp * 2.3 + 9.0);
          // (mud from the ground: up the hem and the stockings, ragged at its upper edge)
          float mud = 1.0 - smoothstep(0.1, 0.75 + (n1 - 0.5) * 0.35, wp.y);
          vec3 mudC = vec3(0.24, 0.19, 0.13);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45 + mudC * 0.45, clamp(mud * (0.7 + n2 * 0.6), 0.0, 0.92));
          // (stains: broad blotches, darker and browner)
          float st = smoothstep(0.5, 0.75, n3 * 0.7 + n1 * 0.3);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.56, 0.47), st);
          // (and the fine grime ground into the weave, never even)
          diffuseColor.rgb *= 0.8 + n2 * 0.2;
        }`);
  }, "worn");
}
// ---- skin as it was lived in: weathered by sun and wind, a little tanned, ruddy in the cheeks, the nose and the ears,
// never one even colour; its pores and fine creases catching the light; less shine than a doll's, an oily sheen only on
// the nose and brow; and the day's grime on it, smudged on the face and worked into the hands ----
function weatheredSkin(m) {
  m.userData.weathered = true;
  m.roughness = 0.68;
  addHook(m, sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSkP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSkP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vSkP;
      float skH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float skN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(skH(i), skH(i + vec3(1,0,0)), f.x), mix(skH(i + vec3(0,1,0)), skH(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(skH(i + vec3(0,0,1)), skH(i + vec3(1,0,1)), f.x), mix(skH(i + vec3(0,1,1)), skH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float skFace = 0.0;
        {
          vec3 p = vSkP;
          // (sun and wind: a touch darker and warmer all over)
          diffuseColor.rgb *= vec3(0.93, 0.86, 0.8);
          // (the face: ruddy cheeks, nose and ears, by where they lie on the head)
          float head = smoothstep(1.4, 1.46, p.y);
          float cheek = exp(-pow((abs(p.x) - 0.042) / 0.022, 2.0) - pow((p.y - 1.585) / 0.03, 2.0)) * smoothstep(0.03, 0.08, p.z);
          float nose = exp(-pow(p.x / 0.016, 2.0) - pow((p.y - 1.6) / 0.03, 2.0)) * smoothstep(0.08, 0.11, p.z);
          float ear = exp(-pow((abs(p.x) - 0.075) / 0.012, 2.0) - pow((p.y - 1.6) / 0.03, 2.0));
          float red = clamp(cheek * 0.8 + nose * 0.9 + ear * 0.7, 0.0, 1.0) * head;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.78, 0.74), red * 0.75);
          // (blotchy, uneven: no skin is one colour)
          float bl = skN(p * 30.0), bl2 = skN(p * 55.0 + 3.0);
          diffuseColor.rgb *= 0.93 + bl * 0.1;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.88, 0.85), smoothstep(0.62, 0.85, bl2) * 0.25);
          // (grime: smudges on the face, worked into the hands)
          float hands = 1.0 - head;
          float sm = smoothstep(0.55, 0.85, skN(p * 24.0 + 7.0)) * (0.45 + hands * 0.4);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.55, 0.48), sm);
          skFace = head;
        }`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        // (the shine of the nose and brow, matt elsewhere; rough and dry on hands)
        { vec3 p = vSkP; float tz = exp(-pow(p.x / 0.03, 2.0) - pow((p.y - 1.64) / 0.06, 2.0)) * skFace;
          roughnessFactor = mix(0.74, 0.52, tz) + (skN(p * 40.0) - 0.5) * 0.08 + (1.0 - skFace) * 0.08; }`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        // (pores and fine creases: a fine bump in the light)
        { float hgt = skN(vSkP * 140.0); vec2 dh = vec2(dFdx(hgt), dFdy(hgt));
          float fw = abs(dh.x) + abs(dh.y);
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1); vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad * 0.0025 * (1.0 - smoothstep(0.04, 0.12, fw))); }`);
  }, "skin");
}
// ---- hair, not a painted cap: fine strands running down it, darker toward the roots, a greasy sheen caught along them
// here and there (nobody washed it much), and never quite even ----
// ---- a wound in the cloth (and the skin): blood soaking out from where the blow went in, spreading for some seconds,
// running further down than up, near black and wet at the middle. Up to four on a man; their places in the model's own
// space, so they move with him ----
const WOUND_T = { get value() { return performance.now() / 1000; } };
function woundHook(P) {
  return sh => {
    sh.uniforms.uWound = P.woundU; sh.uniforms.uWoundR = P.woundR; sh.uniforms.uWT = WOUND_T;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWdP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWdP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWdP; uniform vec4 uWound[4]; uniform float uWoundR[4]; uniform float uWT;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float wB = 0.0;
        for (int i = 0; i < 4; i++) {
          float R = uWoundR[i]; if (R <= 0.0) continue;
          vec4 w = uWound[i]; float age = max(0.0, uWT - w.w), r = min(R, 0.02 + age * 0.03);
          vec3 dv = vWdP - w.xyz; dv.y *= dv.y < 0.0 ? 0.45 : 1.6;
          float n = fract(sin(dot(floor(vWdP * 140.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          wB = max(wB, smoothstep(r, r * 0.35, length(dv) + (n - 0.5) * 0.025));
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.012, 0.01) * (0.7 + 0.3 * wB), wB * 0.92);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, wB * 0.75);");
  };
}
function strandHair(m) {
  m.userData.strands = true;
  m.roughness = 0.62;
  addHook(m, sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vHrP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvHrP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vHrP;
      float hrH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float hrN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hrH(i), hrH(i + vec3(1,0,0)), f.x), mix(hrH(i + vec3(0,1,0)), hrH(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hrH(i + vec3(0,0,1)), hrH(i + vec3(1,0,1)), f.x), mix(hrH(i + vec3(0,1,1)), hrH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float hrS;
        { vec3 p = vHrP;
          // (strands: fine across, long down)
          hrS = hrN(vec3(p.x * 520.0, p.y * 22.0, p.z * 520.0)) * 0.6 + hrN(vec3(p.x * 180.0, p.y * 9.0, p.z * 180.0)) * 0.4;
          diffuseColor.rgb *= 0.72 + hrS * 0.5;
          // (the lighter strands catching the light, lifting even black hair off a solid cap)
          diffuseColor.rgb += (diffuseColor.rgb * 1.4 + vec3(0.025, 0.02, 0.015)) * smoothstep(0.62, 0.95, hrS);
          // (darker toward the crown and the roots, uneven in clumps)
          diffuseColor.rgb *= 0.85 + hrN(p * 18.0) * 0.25;
        }`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(0.85, 0.42, smoothstep(0.55, 0.85, hrS)), 0.3, 1.0);`);
  }, "hair");
}
function useModel(P, key, colors = {}) {
  const m = modelCopy(key); if (!m) return;
  P.root.traverse(o => { if (o.isMesh) o.visible = false; });
  P.body.add(m.scene); P.modelScene = m.scene;
  // (each hand twice in the model — at rest, and closed to hold: shown as the hand needs, see P.update — found by name
  //  before the colours below rename their materials)
  { const H = { L: { rest: [], grip: [] }, R: { rest: [], grip: [] } }; let any = false;
    m.scene.traverse(o => { if (!o.isMesh) return; const t = /hand(rest|grip)([LR])_skin/i.exec(`${o.name} ${o.parent ? o.parent.name : ""} ${o.material && o.material.name || ""}`); if (t) { H[t[2].toUpperCase()][t[1].toLowerCase()].push(o); any = true; } });
    if (any) {
      P.handParts = H;
      // (grip: each hand closed or at rest; a battle's men are set closed before their pieces are merged into one)
      P.setGrip = (l, r) => { for (const [s, on] of [["L", l], ["R", r]]) { for (const o of H[s].grip) o.visible = !!on; for (const o of H[s].rest) o.visible = !on; } P._gripL = !!l; P._gripR = !!r; };
      P.setGrip(false, false);
    } }
  // this person's own colours on the parts that vary: one model, a varied crowd
  const own = {};
  m.scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const part = o.material.userData.part, want = colors[part === "beard" || part === "tash" ? "hair" : part];
    // (a part left off altogether: the watch's sash, when the uniform has none)
    if (colors.hide && colors.hide.includes(part)) { o.visible = false; return; }
    if (want === undefined || want === null) return;
    if (!own[part]) {
      own[part] = o.material.clone(); own[part].color.set(want);
      // (a part painted in the model — skin, hair — has its colours in its vertices, and the tint multiplied them: a
      //  dark-haired model could only ever be darker. Divided by what's painted there, the colour asked for is the
      //  colour seen, its shading kept)
      const vc = o.material.vertexColors && o.geometry.attributes.color;
      // (the iris tinted as it's painted, light to dark: brightened to its mean, a brown eye lit up amber)
      if (vc && part !== "iris") { const mean = paintedMean(o.geometry); own[part].userData.vcMean = mean; own[part].color.r /= Math.max(0.04, mean[0]); own[part].color.g /= Math.max(0.04, mean[1]); own[part].color.b /= Math.max(0.04, mean[2]); }
      addDetail(own[part], { scale: 2, amount: 0.22, grain: 0.6, surface: o.material.userData.surface });
    }
    o.material = own[part];
  });
  // (the clothes as worn, not as dyed: see wornCloth)
  m.scene.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const part = o.material.userData.part;
    if (!WORN_PARTS.has(part)) return;
    if (!own[part]) { own[part] = o.material.clone(); addDetail(own[part], { scale: 2, amount: 0.22, grain: 0.6, surface: o.material.userData.surface }); own[part].userData.part = part; }
    if (!own[part].userData.worn) wornCloth(own[part], part);
    o.material = own[part];
  });
  // (skin as it was in the 1680s, out of doors: see weatheredSkin)
  m.scene.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.userData.part !== "skin") return;
    if (!own.skin) { own.skin = o.material.clone(); own.skin.userData.part = "skin"; }
    if (!own.skin.userData.weathered) weatheredSkin(own.skin);
    o.material = own.skin;
  });
  // (blood where he's hit, soaking out from the wound: see woundHook and gore.js)
  P.woundU = { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -10, 0, 0)) }; P.woundR = { value: [0, 0, 0, 0] }; P.woundN = 0;
  { const done = new Set(); m.scene.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || done.has(o.material)) return;
    const part = o.material.userData.part; if (!(WORN_PARTS.has(part) || part === "skin")) return;
    if (!own[part] || own[part] !== o.material) return;
    done.add(o.material); addHook(o.material, woundHook(P), "wound");
  }); }
  // (eyes as eyes: the whites never white — a little yellowed, veined at the corners — and wet, catching the light)
  m.scene.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const part = o.material.userData.part; if (part !== "eyes" && part !== "iris") return;
    if (!own[part]) { own[part] = o.material.clone(); own[part].userData.part = part; if (o.material.userData.detail) addDetail(own[part], o.material.userData.detail); }
    const e = own[part]; if (e.userData.wet) { o.material = e; return; }
    e.userData.wet = true;
    if (e.color) e.color.multiply(part === "eyes" ? new THREE.Color(0.8, 0.74, 0.66) : new THREE.Color(0.75, 0.72, 0.7));
    e.roughness = 0.12; if ("metalness" in e) e.metalness = 0;
    o.material = e;
  });
  // (hair as hair: see strandHair)
  m.scene.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const part = o.material.userData.part; if (part !== "hair" && part !== "beard" && part !== "tash") return;
    if (!own[part]) { own[part] = o.material.clone(); own[part].userData.part = part; if (o.material.userData.detail) addDetail(own[part], o.material.userData.detail); }
    if (!own[part].userData.strands) strandHair(own[part]);
    o.material = own[part];
  });
  // (skirts, aprons and coat-tails that swing: see cloth.js)
  try { attachCloth(P, m.scene); } catch (e) { console.error("cloth", e); }
  const mixer = new THREE.AnimationMixer(m.scene);
  const clip0 = name => m.animations.find(a => a.name.toLowerCase() === name) || m.animations.find(a => a.name.toLowerCase().includes(name));
  // (a felling stroke from the arms and shoulders: the trunk turned only a little with it, not wrung round at the waist)
  const steady = {};
  const clip = name => {
    const c = clip0(name); if (!c || name !== "chop") return c;
    if (steady[name]) return steady[name];
    const k = c.clone(), rest = new THREE.Quaternion(), q = new THREE.Quaternion();
    for (const t of k.tracks) {
      const [bone, prop] = t.name.split("."); if (prop !== "quaternion" || !/^(root|hips|spine|chest)$/i.test(bone)) continue;
      const b = m.scene.getObjectByName(bone); if (!b) continue;
      rest.copy(b.quaternion); t.values = t.values.slice();
      for (let i = 0; i < t.values.length; i += 4) { q.fromArray(t.values, i); rest.clone().slerp(q, 0.2).toArray(t.values, i); }
    }
    return steady[name] = k;
  };
  const acts = {};
  for (const n of ["idle", "walk", "run", "sit", "chop", "torch", "lantern", "hold", "writ", "point", "armscrossed", "bound", "grieve", "reach", "hammer", "punch", "eat", "stir", "talk", "guard", "strafe", "overhead", "hit", "dig", "reap", "sow", "gather", "saw", "whittle", "slash", "ready", "hitchest", "hithead", "crouch", "crouchwalk"]) { const c = clip(n); if (c && (c.name.toLowerCase() === n || !["hit", "crouch"].includes(n))) acts[n] = mixer.clipAction(c); }
  // (the blows and the flinch play once and hold their last frame till the pose moves on)
  for (const n of ["overhead", "hit", "slash", "hitchest", "hithead"]) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce, 1); acts[n].clampWhenFinished = true; }
  // (a model made before the sword-work came: the old felling stroke for the cut, and its guard)
  if (!acts.slash && acts.chop) acts.slash = acts.chop;
  P.has = n => !!acts[n];
  // the legs of a walk without its arms, and the arms of a held pose without its legs, so a man can
  // carry a lantern and walk at the same time
  const ARM = /shoulder|arm|elbow|wrist|hand|finger|thumb/i;
  const part = (c, arms) => { if (!c) return null; const k = c.clone(); k.tracks = k.tracks.filter(t => ARM.test(t.name.split(".")[0]) === arms); k.name = c.name + (arms ? "·arms" : "·legs"); return mixer.clipAction(k); };
  for (const n of ["walk", "run"]) if (acts[n]) acts[n + "Legs"] = part(clip(n), false);
  for (const n of ["torch", "lantern", "writ", "bound", "hold", "guard"]) if (acts[n]) acts[n + "Arms"] = part(clip(n), true);
  // (and for a man in the saddle: the seat from the waist down, and from the waist up the cut, the thrust, the guard or
  //  the sabre held out at the point for the charge — so a trooper fights from his horse, not sits on it like a sack)
  const UP = /shoulder|arm|elbow|wrist|hand|finger|thumb|spine|chest|neck|head/i;
  const upper = (c, up) => { if (!c) return null; const k = c.clone(); k.tracks = k.tracks.filter(t => UP.test(t.name.split(".")[0]) === up); k.name = c.name + (up ? "·up" : "·low"); return mixer.clipAction(k); };
  if (acts.sit) acts.sitLow = upper(clip("sit"), false);
  for (const n of ["overhead", "slash", "punch", "guard", "point"]) if (acts[n]) { acts[n + "Up"] = upper(acts[n].getClip(), true); if (n === "overhead" || n === "slash") { acts[n + "Up"].setLoop(THREE.LoopOnce, 1); acts[n + "Up"].clampWhenFinished = true; } }
  let cur = null, curArms = null;
  // (each person their own tempo, a touch quicker or slower; and a standing clip — breathing, talking, a held pose —
  // starts anywhere in its loop, so a crowd doesn't breathe and shift its weight all together, like clockwork)
  const tempo = 0.93 + Math.random() * 0.14;
  const LOOSE = new Set(["idle", "talk", "guard", "sit", "eat", "stir", "gather", "saw", "whittle", "dig", "reap", "sow", "torch", "lantern", "hold", "writ", "point", "armscrossed", "bound", "grieve", "reach"]);
  const play = (n, fade = 0.25) => {
    const a = acts[n] || acts.idle; if (!a || a === cur) return;
    a.reset().fadeIn(fade).play();
    if (LOOSE.has(n) || (!acts[n] && a === acts.idle)) { a.time = Math.random() * a.getClip().duration; a.timeScale = tempo; }
    if (cur) cur.fadeOut(fade); cur = a;
  };
  const playA = (a, fade) => { if (!a || a === cur) return; a.reset().fadeIn(fade).play(); if (cur) cur.fadeOut(fade); cur = a; };
  P.clipNow = () => cur && cur.getClip().name;                 // (for the tests, and for the sound of work)
  P.clipPhase = () => { if (!cur) return 0; const d = cur.getClip().duration || 1; return ((cur.time % d) + d) % d / d; };
  // a blow landing on them: a flinch over whatever they're doing, for a moment
  // (to the body or the head, as it comes: a flinch of its own each time)
  P.flinch = (head) => {
    const opts = [acts.hitchest, acts.hithead, acts.hit].filter(Boolean); if (!opts.length) return;
    P.flinchA = head && acts.hithead ? acts.hithead : opts[Math.floor(Math.random() * opts.length)];
    P.flinchT = 0.5; P.flinchA.reset(); if (cur === P.flinchA) P.flinchA.play();
  };
  const playArms = n => { const a = n ? acts[n] : null; if (a === curArms) return; if (a) a.reset().fadeIn(0.25).play(); if (curArms) curArms.fadeOut(0.25); curArms = a; };
  let headB = null, neckB = null;
  m.scene.traverse(o => { if (!o.isBone) return; if (!headB && /^head$/i.test(o.name)) headB = o; if (!neckB && /^neck$/i.test(o.name)) neckB = o; });
  P.headBone = headB;
  // (by the rig's names, as Blender wrote them: the loader takes the dots out — upper_arm.L comes in as upper_armL)
  P.bones = {}; m.scene.traverse(o => { if (o.isBone) { P.bones[o.name] = o; P.bones[o.name.replace(/([LR])$/, ".$1")] ??= o; } });
  // held things follow the model's right hand, if it has a bone by that name
  // (the rig's own names: handR / handL, or hand.R, hand_R, RightHand)
  let hand = null, handL = null;
  m.scene.traverse(o => {
    if (!o.isBone) return;
    if (!hand && /^hand[._]?r$|(hand.*(\.r|_r|right))|(right.*hand)/i.test(o.name)) hand = o;
    if (!handL && /^hand[._]?l$|(hand.*(\.l|_l|left))|(left.*hand)/i.test(o.name)) handL = o;
  });
  // (a bone runs out along the fingers; what is held stands up out of the fist, square to them — a quarter turn —
  // and sits in the palm, a little past the wrist)
  //  (where the model marks it — grip_R, grip_L, the hole through its closed hand — exactly there, so what is held goes
  //  through the fist and not beside it)
  const gR = m.scene.getObjectByName("grip_R"), gL = m.scene.getObjectByName("grip_L");
  if (hand) { hand.add(P.held); if (gR && gR.parent === hand) P.held.position.copy(gR.position); else P.held.position.set(0, 0.07, 0); P.held.rotation.set(-Math.PI / 2, 0, 0); }
  if (handL) { handL.add(P.heldL); if (gL && gL.parent === handL) P.heldL.position.copy(gL.position); else P.heldL.position.set(0, 0.07, 0); P.heldL.rotation.set(-Math.PI / 2, 0, 0); }
  const base = P.update.bind(P);
  P.update = function (dt, speed = 0) {
    base(dt, speed);
    // (a hand closes when there's something in it, and opens again when there isn't)
    //  (a paper is held open-handed, by its side, between the thumb and the fingers: no fist for that)
    if (this.setGrip && !this.gripFixed) { const fist = h => h.children.some(c => !c.userData.pinch), r = fist(this.held), l = fist(this.heldL); if (r !== this._gripR || l !== this._gripL) this.setGrip(l, r); }
    // (let go — a ragdoll, ragdoll.js — the clips leave it alone)
    if (this.rag) return;
    // the model does its own moving, so the code-built body stands straight
    P.body.rotation.x = 0; P.hips.position.y = 0.92;
    let pose = (this.pose || "idle").toLowerCase();
    if (pose === "swim") pose = "idle";
    // in a fight and doing nothing else: the guard, not standing about
    // (the guard: never the library's crouched sword-stance, which looked like nothing a soldier does after a blow)
    if (this.fight && (pose === "idle" || pose === "reach" && !acts.reach) && acts.guard) pose = "guard";
    // walking and running win over a held pose, except for what the hands must keep doing (a load carried, a light held)
    const keepsHands = ["torch", "lantern", "writ", "bound", "hold", "guard"].includes(pose);
    const moving = speed > 0.15 && this.sitting <= 0.5;
    const ONCE = pose === "chop" || pose === "hammer" || pose === "punch" || pose === "overhead" || pose === "slash";
    const lat = this.strafe || 0, fwd = this.fwd || 0;
    if (this.flinchT > 0 && this.flinchA && this.sitting <= 0.5) {
      // hit: the flinch, whatever else
      this.flinchT -= dt; playArms(null); playA(this.flinchA, 0.08);
    } else if (this.crouching && acts.crouch && !ONCE && this.sitting <= 0.5) {
      // down low — behind cover, or creeping: crouched, still or on the move
      playArms(null); play(moving && acts.crouchwalk ? "crouchwalk" : "crouch", 0.25);
      if (cur === acts.crouchwalk) cur.timeScale = Math.max(0.5, Math.min(1.6, speed / 1.2));
    } else if (this.fight && moving && acts.strafe && Math.abs(lat) > Math.abs(fwd) * 0.8 && !ONCE) {
      // stepping round them sideways, guard up: the sidestep, played the way they're going
      playArms(null); play("strafe", 0.15); cur.timeScale = Math.sign(lat || 1) * Math.min(1.6, Math.max(0.6, Math.abs(lat) / 1.2));
    } else if (keepsHands && moving && acts[pose + "Arms"] && acts.walkLegs) {
      // walking with something held: the legs walk, the arms keep hold
      play(speed > 2.1 && acts.runLegs ? "runLegs" : "walkLegs"); playArms(pose + "Arms");
    } else if (this.sitting > 0.5 && acts.sitLow && acts[pose + "Up"] && (ONCE || pose === "guard" || pose === "point")) {
      // in the saddle with a blade: sat, and fighting from the waist up
      play("sitLow", 0.2); playArms(pose + "Up"); this.wasSeated = true;
    } else {
      playArms(null);
      // (sitting down or getting up takes a moment, not a blink: the blend into the seat and out of it is slow)
      const seated = this.sitting > 0.5, rising = seated !== !!this.wasSeated; this.wasSeated = seated;
      play(seated ? (pose === "eat" && acts.eat ? "eat" : "sit") : ONCE ? pose : speed > 2.1 && !keepsHands ? "run" : speed > 0.15 && !keepsHands ? "walk" : acts[pose] ? pose : "idle", rising ? 0.7 : ONCE ? 0.12 : 0.25);
    }
    // (played as fast as the feet carry them, so a planted foot stays planted: the clips go 1.1 and 4.3 m/s at full
    // speed, measured with tools/blender/footspeed.py)
    if (cur && (cur === acts.walk || cur === acts.run || cur === acts.walkLegs || cur === acts.runLegs)) cur.timeScale = Math.max(cur === acts.run || cur === acts.runLegs ? 0.6 : 0.5, speed / (cur === acts.run || cur === acts.runLegs ? 4.3 : 1.1)) * (fwd < -0.2 && this.fight ? -1 : 1);
    // (last frame's turn of the head taken off first: the mixer only writes a bone when its clip changes it, so a turn
    // left on would be added to again and again, and the head would wind round)
    if (this.lookApplied) { if (headB) headB.rotateY(-this.lookApplied * 0.65); if (neckB) neckB.rotateY(-this.lookApplied * 0.3); this.lookApplied = 0; }
    // (last frame's stroke taken off first, as the head's turn is: a bone the clip doesn't move would keep it, and add to it)
    if (this._swimBack) { for (const [b, q] of this._swimBack) b.quaternion.copy(q); this._swimBack = null; }
    if (this._aimBack) { for (const [b, q] of this._aimBack) b.quaternion.copy(q); this._aimBack = null; }
    if (this._handBack) { for (const [b, q] of this._handBack) b.quaternion.copy(q); this._handBack = null; }
    mixer.update(dt);
    aimPlace(this, dt);
    // swimming: laid along the water (as the code-built body is), the arms and legs in their stroke over the clip
    swimLay(this, dt);
    if (this.swimK > 0.02) swimBones(this, dt);
    // the head turned toward whoever they're watching, over what the clip is doing: most of it in the head, some in
    // the neck, eased in and out
    this.lookS = (this.lookS || 0) + ((this.look || 0) - (this.lookS || 0)) * Math.min(1, dt * 5);
    if (Math.abs(this.lookS) > 0.002) { if (headB) headB.rotateY(this.lookS * 0.65); if (neckB) neckB.rotateY(this.lookS * 0.3); this.lookApplied = this.lookS; }
    // (an empty hand hangs as a hand does, in line with the forearm and turned a little in toward the thigh: the clips
    //  had the wrists cocked outward, the fingers pointing away from the body)
    if (cur === acts.idle || cur === acts.walk || cur === acts.run || cur === acts.talk || cur === acts.walkLegs || cur === acts.runLegs) relaxHands(this);
  };
}
// the empty hands straightened (see above): each turned so it carries on the line of its forearm, a touch in toward the
// body, and put back next frame before the clip moves it again
const _rhF = new THREE.Vector3(), _rhH = new THREE.Vector3(), _rhC = new THREE.Vector3(), _rhV = new THREE.Vector3(), _rhQ = new THREE.Quaternion(), _rhW = new THREE.Quaternion(), _rhP = new THREE.Quaternion(), _rhI = new THREE.Quaternion();
function relaxHands(P) {
  if (P.rag || (P.swimK || 0) > 0.02 || !P.bones) return;
  const hips = P.bones.hips; if (!hips) return;
  hips.getWorldPosition(_rhC);
  for (const s of ["L", "R"]) {
    if (s === "L" ? P._gripL : P._gripR) continue;
    const f = P.bones["forearm." + s], h = P.bones["hand." + s]; if (!f || !h) continue;
    h.updateWorldMatrix(true, false);
    f.getWorldPosition(_rhF); h.getWorldPosition(_rhH);
    const dir = _rhV.subVectors(_rhH, _rhF).normalize();
    // (a touch in toward the thigh, across the body's own line)
    const inw = new THREE.Vector3(_rhC.x - _rhH.x, 0, _rhC.z - _rhH.z); if (inw.lengthSq() > 1e-6) dir.addScaledVector(inw.normalize(), 0.12).normalize();
    h.getWorldQuaternion(_rhW);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(_rhW);
    _rhQ.setFromUnitVectors(axis, dir); _rhQ.slerp(_rhI, 0.15);
    (P._handBack ||= []).push([h, h.quaternion.clone()]);
    f.getWorldQuaternion(_rhP);
    h.quaternion.copy(_rhP.invert().multiply(_rhQ.multiply(_rhW)));
    h.updateMatrixWorld(true);
  }
}

// things for hands
export function makeTorch(light = true) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 6), mat(0x4a3322));
  stick.position.y = 0.05; stick.rotation.x = 0; g.add(stick);
  const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 6), mat(0x2a2018)); rag.position.y = 0.36; g.add(rag);
  const L = light ? new THREE.PointLight(0xff8a3a, 6, 14, 1.6) : null;
  const f = makeFlame(1.5, L); f.position.y = 0.38; g.add(f);
  g.userData.flameObj = f;
  g.rotation.x = Math.PI / 2 - 0.3;
  return g;
}
export function makeLantern(light = true) {
  const g = new THREE.Group();
  // (a real one, scanned: a wooden lantern, its horn panes and its ring — hung from its top, as it's carried)
  { const m = modelCopy("prop_lantern"); if (m) {
    m.scene.position.y = -0.37; g.add(m.scene);
    m.scene.traverse(o => { if (o.isMesh && /glass/.test((o.material && o.material.name) || "")) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xffb060); o.material.emissiveIntensity = 1.2; } });
    if (light) { const L = new THREE.PointLight(0xffc27a, 5, 12, 1.6); L.position.y = -0.2; g.add(L); g.userData.light = L; }
    return g; } }
  const frame = mat(0x2b2622, { metalness: 0.5, roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 4), frame); top.position.y = 0.02; top.rotation.y = Math.PI / 4; g.add(top);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.11), new THREE.MeshBasicMaterial({ color: 0xffd08a }));
  glass.position.y = -0.1; g.add(glass);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.13), frame); base.position.y = -0.18; g.add(base);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 8, Math.PI), frame); handle.position.y = 0.06; g.add(handle);
  g.position.y = -0.1;
  if (light) { const L = new THREE.PointLight(0xffc27a, 5, 12, 1.6); L.position.y = -0.1; g.add(L); g.userData.light = L; }
  return g;
}
// ---------------------------------------------------------------------------
//  tools and arms
// ---------------------------------------------------------------------------
// Every tool is made the way the rest of the forest is: a few honest shapes, faceted, in the colours of what they're made
// of — and what they're made of is their making: 1 wood, 2 stone, 3 copper, 4 bronze, 5 iron (the old felling axe and
// Henning's spade are worn iron too). Each is held by the grip at the origin and points up +Y.
// (for the furniture: a log, a ball, and a box with its edges rounded off — a straw tick, a quilt)
const CYL8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const BALL = new THREE.SphereGeometry(0.5, 12, 8);
const RBOX = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 4, 8), p = g.attributes.position, R = [0.08, 0.4, 0.04];
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)], inn = v.map((a, k) => Math.max(-0.5 + R[k], Math.min(0.5 - R[k], a)));
    const n = v.map((a, k) => (a - inn[k]) / R[k]), l = Math.hypot(...n) || 1;
    p.setXYZ(i, ...inn.map((a, k) => a + n[k] / l * R[k] * Math.min(1, l)));
  }
  g.computeVertexNormals(); return g;
})();
const _tm = {};
const tmat = (k, f) => _tm[k] || (_tm[k] = f());
const STUFF = t => tmat("s" + t, () => t === 1 ? mat(0x9a7448, { surface: "wood", flatShading: true }) : t === 2 ? mat(0x8e897d, { surface: "rock", flatShading: true })
  : t === 3 ? mat(0xb8703e, { metalness: 0.35, roughness: 0.5, flatShading: true }) : t === 4 ? mat(0xa8843e, { metalness: 0.35, roughness: 0.5, flatShading: true })
  : t === 0 ? mat(0x55585e, { metalness: 0.35, roughness: 0.6, flatShading: true }) : mat(0x6e737a, { metalness: 0.4, roughness: 0.5, flatShading: true }));
// the bright, ground edge of a metal blade
const EDGE = t => tmat("e" + t, () => mat(t === 3 ? 0xe0a070 : t === 4 ? 0xe0c27a : 0xc4c8ce, { metalness: 0.45, roughness: 0.32, flatShading: true }));
const WOOD = () => tmat("wood", () => mat(0x8a6440, { surface: "wood", flatShading: true }));
const WOOD_DARK = () => tmat("wooddark", () => mat(0x5a3e26, { surface: "wood", flatShading: true }));
const LEATHER = () => tmat("leather", () => mat(0x3a2818, { surface: "none", flatShading: true }));
const CORD = () => tmat("cord", () => mat(0x8a7450, { surface: "cloth", roughness: 1, flatShading: true }));
const _tg = {};
const tgeo = (k, f) => _tg[k] || (_tg[k] = f());
// a haft: a little faceted, tapered, from `from` to `from + len` up the grip
function haftGeo(len, r0, r1, segs = 7, from = -0.1, bow = 0) {
  return tgeo(`haft${len}|${r0}|${r1}|${segs}|${from}|${bow}`, () => {
    const g = new THREE.CylinderGeometry(r1, r0, len, segs, 8);
    if (bow) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const h = p.getY(i) / len + 0.5; p.setZ(i, p.getZ(i) + bow * Math.sin(h * Math.PI) * (1 - h)); } }
    g.translate(0, from + len / 2, 0); g.computeVertexNormals(); return g;
  });
}
// a flat shape (in forward z, up y), cut from a plate `depth` thick lying across the grip
function plateGeo(key, pts, depth, bevel = 0.003, taper = null) {
  return tgeo(key, () => {
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) q.length === 4 ? sh.quadraticCurveTo(q[0], q[1], q[2], q[3]) : sh.lineTo(q[0], q[1]);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 5, steps: 1 });
    g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2);
    if (taper) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * taper(p.getZ(i), p.getY(i))); }
    g.computeVertexNormals(); return g;
  });
}
const mesh = (g, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; };
// a few turns of cord or leather round a haft
const wrap = (g, y, h, r, m = CORD()) => mesh(tgeo(`wrap${h}|${r}`, () => new THREE.CylinderGeometry(r, r, h, 7)), m, g, 0, y);

// The felling axe: a bearded head forged round its eye, thick at the poll and drawn thin to its ground edge, a wedge in
// the eye and cord whipped under it, on a hickory haft with a swell and a knob for the hand.
const AXE_SHAPE = [[-0.032, 0.668], [-0.034, 0.588], [0.0, 0.578, 0.045, 0.584], [0.098, 0.588, 0.128, 0.506], [0.188, 0.548, 0.19, 0.612], [0.188, 0.676, 0.158, 0.712], [0.1, 0.672, 0.04, 0.672], [0.004, 0.676, -0.032, 0.668]];
const AXE_EDGE = [[0.124, 0.512], [0.186, 0.55, 0.19, 0.612], [0.188, 0.676, 0.156, 0.708], [0.16, 0.68, 0.17, 0.612], [0.168, 0.556, 0.124, 0.512]];
const axeTaper = (z) => 1 - 0.8 * Math.max(0, Math.min(1, (z - 0.03) / 0.15));
// (a real one in your hands where there is one — scanned worn wood and forged iron, from Poly Haven — for the iron and
//  the steel; the copper and the bronze heads are the built ones, their own colour)
const realTool = k => { const m = modelCopy(k); if (!m) return null; const g = new THREE.Group(); g.add(m.scene); return g; };
export function makeAxe(tier) {
  const t = tier >= 3 && tier <= 5 ? tier : 0;
  if (t === 0 || t === 5) { const r = realTool("axe"); if (r) return r; }
  const g = new THREE.Group();
  mesh(haftGeo(0.8, 0.0175, 0.016, 8, -0.1, 0.03), WOOD(), g);
  mesh(tgeo("axeKnob", () => new THREE.CylinderGeometry(0.02, 0.024, 0.04, 8)), WOOD(), g, 0, -0.085);
  mesh(plateGeo("axeHead", AXE_SHAPE, 0.034, 0.004, axeTaper), STUFF(t), g);
  mesh(plateGeo("axeEdge", AXE_EDGE, 0.009, 0.001), EDGE(t), g);
  mesh(tgeo("axeWedge", () => new THREE.BoxGeometry(0.008, 0.012, 0.03)), WOOD_DARK(), g, 0, 0.676, -0.003);
  wrap(g, 0.53, 0.04, 0.0205);
  return g;
}
// the arms, held by the grip
const BLADE_SHAPE = len => [[0.026, 0], [0.024, len * 0.8], [0.0, len, 0, len], [-0.024, len * 0.8], [-0.026, 0]];
export function makeSword(tier) {
  const t = tier === 1 ? 1 : tier === 3 || tier === 4 ? tier : 5;
  if (t === 5) { const m = modelCopy("sword"); if (m) { const g = new THREE.Group(); g.add(m.scene); return g; } }
  const g = new THREE.Group(), fitting = tmat("brass", () => mat(0x8a7040, { metalness: 0.5, roughness: 0.45, flatShading: true }));
  if (t === 1) {
    // a wooden sword: a cudgel cut flat, a crosspiece lashed on
    mesh(plateGeo("woodBlade", [[0.03, 0], [0.028, 0.7], [0, 0.82], [-0.028, 0.7], [-0.03, 0]], 0.024, 0.004), WOOD(), g, 0, 0.24);
    mesh(tgeo("woodGuard", () => new THREE.BoxGeometry(0.03, 0.035, 0.18)), WOOD_DARK(), g, 0, 0.23);
    wrap(g, 0.23, 0.05, 0.02);
    mesh(haftGeo(0.24, 0.018, 0.017, 7, -0.03), WOOD_DARK(), g);
    return g;
  }
  // a plain blade of the age: chamfered edges, a fuller down the middle, a guard with its ends turned, a wire-bound grip
  mesh(plateGeo("blade", BLADE_SHAPE(0.86), 0.01, 0.003), STUFF(t), g, 0, 0.24);
  mesh(tgeo("fuller", () => new THREE.BoxGeometry(0.015, 0.6, 0.008)), tmat("fuller", () => mat(0x3a3c40, { metalness: 0.4, roughness: 0.6 })), g, 0, 0.56);
  mesh(tgeo("guard", () => new THREE.BoxGeometry(0.026, 0.026, 0.16)), fitting, g, 0, 0.23);
  for (const sd of [-1, 1]) mesh(tgeo("quillon", () => new THREE.BoxGeometry(0.022, 0.022, 0.05)), fitting, g, 0, 0.245, sd * 0.095, sd * -0.5, 0, 0);
  mesh(haftGeo(0.24, 0.016, 0.018, 7, -0.01), LEATHER(), g);
  for (let i = 0; i < 4; i++) wrap(g, 0.02 + i * 0.05, 0.008, 0.0185, fitting);
  mesh(tgeo("pommel", () => new THREE.OctahedronGeometry(0.03, 0)), fitting, g, 0, -0.03);
  return g;
}
export function makeSpear() {
  { const m = modelCopy("spear"); if (m) { const g = new THREE.Group(); g.add(m.scene); return g; } }
  const g = new THREE.Group();
  mesh(haftGeo(1.9, 0.02, 0.017, 7, -0.45), WOOD(), g);
  mesh(tgeo("spearSocket", () => new THREE.CylinderGeometry(0.016, 0.022, 0.1, 7)), STUFF(5), g, 0, 1.48);
  mesh(plateGeo("spearHead", [[0, 0], [0.04, 0.05, 0.035, 0.12], [0.02, 0.2, 0, 0.26], [-0.02, 0.2, -0.035, 0.12], [-0.04, 0.05, 0, 0]], 0.012, 0.004), STUFF(5), g, 0, 1.52);
  return g;
}
export function makeBattleAxe() {
  { const m = modelCopy("battleaxe"); if (m) { const g = new THREE.Group(); g.add(m.scene); return g; } }
  const g = makeAxe(5); g.scale.set(1.15, 1.2, 1.15);
  mesh(tgeo("bAxeSpike", () => { const c = new THREE.ConeGeometry(0.02, 0.1, 4); c.rotateX(-Math.PI / 2); return c; }), STUFF(5), g, 0, 0.63, -0.08);
  return g;
}
// a war club of the Eastern Woodlands: a curved haft of maple ending in a carved ball, a little spike set in it
export function makeWarClub() {
  const g = new THREE.Group();
  mesh(tgeo("warclubHaft", () => {
    const c = new THREE.CylinderGeometry(0.016, 0.022, 0.62, 7, 8), p = c.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) - 0.06 * Math.pow((y + 0.31) / 0.62, 2)); }
    c.translate(0, 0.24, 0); c.computeVertexNormals(); return c;
  }), WOOD(), g);
  mesh(tgeo("warclubBall", () => new THREE.SphereGeometry(0.055, 10, 8)), WOOD_DARK(), g, 0, 0.58, -0.075);
  mesh(tgeo("warclubSpike", () => { const c = new THREE.ConeGeometry(0.012, 0.06, 5); c.rotateX(-Math.PI / 2); return c; }), STUFF(5), g, 0, 0.58, -0.14);
  for (let i = 0; i < 3; i++) mesh(tgeo("warclubWrap" + i, () => new THREE.TorusGeometry(0.021, 0.004, 4, 10).rotateX(Math.PI / 2)), LEATHER(), g, 0, 0.0 + i * 0.03, 0);
  return g;
}
// a club: a cudgel of root-wood, gnarled and knotted
export function makeClub() {
  const g = new THREE.Group();
  mesh(tgeo("club", () => {
    const c = new THREE.CylinderGeometry(0.055, 0.02, 0.72, 7, 6), p = c.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.18 * Math.sin(y * 31 + i) * Math.max(0, y / 0.36 + 0.3); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    c.translate(0, 0.28, 0); c.computeVertexNormals(); return c;
  }), WOOD_DARK(), g);
  for (let i = 0; i < 4; i++) mesh(tgeo("knot", () => new THREE.DodecahedronGeometry(0.018, 0)), LEATHER(), g, Math.sin(i * 1.7) * 0.05, 0.42 + i * 0.06, Math.cos(i * 1.7) * 0.05);
  return g;
}
// a dagger: a long knife with a cross and a pommel (the Blender one; a knife's shape till it loads)
export function makeDagger() {
  const M = mergedModel("dagger"), m = M ? { scene: M.clone() } : modelCopy("dagger"); if (m) { const g = new THREE.Group(); g.add(m.scene); return g; }
  const g = makeKnife(); g.scale.set(1, 1.5, 1); return g;
}
// a bayonet fixed on a musket: its socket — a short iron sleeve with a crooked neck — slid over the muzzle and
// turned, the blade standing out beside and below the barrel, so the musket still loads and fires
const BAYONETS = {};
export function addBayonet(m) {
  if (!m || m.userData.bayonet) return m && m.userData.bayonet;
  const muzY = m.userData.muzzle ? m.userData.muzzle.position.y : 1.13, key = `bayonet_${muzY.toFixed(3)}`;
  // (made once for each length of barrel, as a piece or two, and copied: a company's bayonets are many)
  let b = BAYONETS[key] && BAYONETS[key].clone();
  if (!b) {
    b = new THREE.Group();
    const iron = mat(0x55595f, { metalness: 0.4, roughness: 0.45 });
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.085, 10, 1, true), iron); sock.position.set(0, muzY - 0.05, 0.032); b.add(sock);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.045), iron); neck.position.set(0, muzY - 0.03, 0.006); b.add(neck);
    const d = makeDagger(); d.position.set(0, muzY - 0.06, -0.014); b.add(d);
    b.traverse(o => { if (o.isMesh) o.castShadow = true; });
    // (kept, made one, once the dagger's model is in to make it from)
    const mg = MODELS.dagger && mergeMeshes(b, key); if (mg) { BAYONETS[key] = mg; b = mg.clone(); }
  }
  m.add(b); m.userData.bayonet = b; return b;
}
// the musket with its bayonet fixed, held as a pike is (for the steel, close in): the right hand at the wrist of the
// stock (here, where a haft's grip is), the left on the fore-end
export function makeBayonetMusket() {
  const g = new THREE.Group(), m = makeMusket();
  m.position.y = 0.07; g.add(m); addBayonet(m);
  if (m.userData.rodMesh) g.userData.rodMesh = m.userData.rodMesh;
  return g;
}
export function makeKnife() {
  const g = new THREE.Group();
  mesh(plateGeo("knifeBlade", [[-0.014, 0], [0.016, 0], [0.018, 0.12, 0, 0.2], [-0.012, 0.1, -0.014, 0]], 0.006, 0.0015), STUFF(5), g, 0, 0.11);
  mesh(tgeo("knifeBolster", () => new THREE.BoxGeometry(0.014, 0.012, 0.036)), STUFF(4), g, 0, 0.105);
  mesh(haftGeo(0.11, 0.015, 0.016, 7, 0), WOOD_DARK(), g);
  return g;
}
// a sickle: a short handle with an iron ferrule, and the blade curving out and round from the top of it, its inner
// edge bright where it is whetted
export function makeSickle() {
  const g = new THREE.Group();
  mesh(haftGeo(0.15, 0.017, 0.019, 7, -0.03), WOOD(), g);
  wrap(g, 0.115, 0.022, 0.021, STUFF(5));
  const arc = (r0, r1, a0, a1, n = 12) => { const o = [], ins = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([Math.cos(a) * r1, Math.sin(a) * r1]); ins.push([Math.cos(a) * (r0 + (r1 - r0) * 0.15 * (i / n)), Math.sin(a) * r0]); } return [...o, ...ins.reverse()]; };
  mesh(plateGeo("sickleBlade", arc(0.115, 0.145, -0.25, Math.PI * 1.05), 0.006, 0.0015), STUFF(5), g, 0, 0.14, -0.13);
  mesh(plateGeo("sickleEdge", arc(0.11, 0.122, -0.15, Math.PI * 0.98), 0.008, 0), EDGE(5), g, 0, 0.14, -0.13);
  return g;
}
// a saw: a tapered blade with its teeth along the edge, and a handle with a grip cut through it
export function makeSaw() {
  { const r = realTool("saw"); if (r) return r; }
  const g = new THREE.Group(), teeth = [];
  for (let i = 0; i <= 24; i++) teeth.push([-0.055 - (i % 2 ? 0.012 : 0), 0.06 + 0.6 * i / 24]);
  mesh(plateGeo("sawBlade", [[0.05, 0.06], [0.03, 0.68], ...teeth.reverse().map(([z, y]) => [z * (1 - 0.35 * (y - 0.06) / 0.62), y])], 0.003, 0), STUFF(5), g, 0, 0, 0.005);
  mesh(tgeo("sawHandle", () => {
    const sh = new THREE.Shape(); sh.moveTo(-0.05, -0.06); sh.lineTo(0.07, -0.06); sh.quadraticCurveTo(0.09, 0.04, 0.06, 0.1); sh.lineTo(-0.065, 0.1); sh.quadraticCurveTo(-0.08, 0.02, -0.05, -0.06);
    const h = new THREE.Path(); h.moveTo(-0.025, -0.03); h.lineTo(0.035, -0.03); h.quadraticCurveTo(0.045, 0.03, 0.03, 0.06); h.lineTo(-0.025, 0.06); h.lineTo(-0.025, -0.03); sh.holes.push(h);
    const e = new THREE.ExtrudeGeometry(sh, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1, curveSegments: 4 }); e.translate(0, 0, -0.013); e.rotateY(-Math.PI / 2); e.computeVertexNormals(); return e;
  }), WOOD(), g, 0, 0.02, 0);
  return g;
}
// a hammer by its making: a wooden mallet, a stone lashed to a haft, or a forged head with a face and a peen
export function makeHammer(tier = (G_TOOLS() || {}).hammer || 5) {
  if (tier >= 3) { const r = realTool("hammer"); if (r) return r; }
  const g = new THREE.Group();
  mesh(haftGeo(0.38, 0.016, 0.014, 7, -0.05), WOOD(), g);
  if (tier <= 1) mesh(tgeo("mallet", () => { const c = new THREE.CylinderGeometry(0.045, 0.045, 0.15, 8); c.rotateX(Math.PI / 2); return c; }), WOOD_DARK(), g, 0, 0.3);
  else if (tier === 2) { mesh(tgeo("stoneHammer", () => { const d = new THREE.DodecahedronGeometry(0.05, 0); d.scale(0.9, 0.8, 1.5); return d; }), STUFF(2), g, 0, 0.3); wrap(g, 0.3, 0.06, 0.02, LEATHER()); }
  else {
    mesh(tgeo("hammerHead", () => { const c = new THREE.CylinderGeometry(0.023, 0.026, 0.13, 8); c.rotateX(Math.PI / 2); return c; }), STUFF(tier), g, 0, 0.3, 0.015);
    mesh(tgeo("hammerFace", () => { const c = new THREE.CylinderGeometry(0.029, 0.026, 0.022, 8); c.rotateX(Math.PI / 2); return c; }), EDGE(tier), g, 0, 0.3, 0.09);
    mesh(tgeo("hammerPeen", () => new THREE.BoxGeometry(0.03, 0.012, 0.05)), STUFF(tier), g, 0, 0.3, -0.07);
  }
  return g;
}
// kitchen tools, gripped at the origin, pointing +Y: a wooden ladle, and a flat wooden spatula for turning
export function makeLadle() {
  { const r = realTool("spoon"); if (r) return r; }
  const g = new THREE.Group(), wood = mat(0x9a7448, { surface: "wood" });
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.36, 6), wood); h.position.y = 0.16; g.add(h);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood); b.position.y = 0.34; b.rotation.x = Math.PI / 2; g.add(b);
  return g;
}
export function makeSpatula() {
  const g = new THREE.Group(), wood = mat(0x9a7448, { surface: "wood" });
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.26, 6), wood); h.position.y = 0.11; g.add(h);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.07), wood); b.position.y = 0.29; g.add(b);
  return g;
}
// a spade, gripped at the origin, pointing +Y: a long haft with a T at the end, an iron socket, and the blade: square at
// the shoulders where the foot goes, rounded to the cutting edge
export function makeSpade(tier = (G_TOOLS() || {}).spade || 2) {
  const t = tier >= 3 ? tier : 0;
  if (t === 0 || t === 5) { const r = realTool("spade"); if (r) return r; }
  const g = new THREE.Group();
  mesh(haftGeo(0.86, 0.019, 0.017, 7, -0.12), WOOD(), g);
  mesh(tgeo("spadeT", () => { const c = new THREE.CylinderGeometry(0.016, 0.016, 0.13, 6); c.rotateX(Math.PI / 2); return c; }), WOOD(), g, 0, -0.12);
  mesh(tgeo("spadeSocket", () => new THREE.CylinderGeometry(0.02, 0.028, 0.1, 7)), STUFF(t), g, 0, 0.76);
  mesh(plateGeo("spadeBlade", [[-0.09, 0], [0.09, 0], [0.092, 0.14], [0.085, 0.22, 0, 0.25], [-0.085, 0.22, -0.092, 0.14], [-0.09, 0]], 0.01, 0.002), STUFF(t), g, 0, 0.8);
  mesh(plateGeo("spadeEdge", [[-0.06, 0.215], [0, 0.248, 0.06, 0.215], [0, 0.236, -0.06, 0.215]], 0.012, 0), EDGE(t), g, 0, 0.8);
  for (const sd of [-1, 1]) mesh(tgeo("spadeTread", () => new THREE.BoxGeometry(0.03, 0.012, 0.07)), STUFF(t), g, 0, 0.806, sd * 0.055);
  return g;
}
// something to eat, held at the origin: a heel of bread, a joint of meat, a few berries in the palm
export function makeFood(kind) {
  const g = new THREE.Group();
  if (kind === "canteen") {
    // the costrel: a little keg on its side, bound with iron, a stopper in its top
    const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 12).rotateZ(Math.PI / 2), mat(0x8a6038, { surface: "wood" })); keg.position.y = 0.05; g.add(keg);
    for (const dx of [-0.022, 0.022]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.004, 4, 14), mat(0x3a3c40, { metalness: 0.6 })); hoop.rotation.y = Math.PI / 2; hoop.position.set(dx, 0.05, 0); g.add(hoop); }
    const stop = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.02, 6), mat(0xc8a878)); stop.position.y = 0.11; g.add(stop);
    return g;
  }
  if (kind === "dish") {
    // a wooden bowl with something hot in it (the bowl a real one, turned and worn: Poly Haven's)
    const rb = modelCopy("prop_bowl");
    if (rb) { g.add(rb.scene); const stew = new THREE.Mesh(new THREE.CircleGeometry(0.068, 16), mat(0x6a3a22, { surface: "none", roughness: 0.35 })); stew.rotation.x = -Math.PI / 2; stew.position.y = 0.036; g.add(stew); return g; }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.045, 10), mat(0x8a6440, { surface: "wood" })); bowl.position.y = 0.02; g.add(bowl);
    const stew = new THREE.Mesh(new THREE.CircleGeometry(0.062, 10), mat(0x6a3a22, { surface: "none", roughness: 0.35 })); stew.rotation.x = -Math.PI / 2; stew.position.y = 0.04; g.add(stew);
    return g;
  }
  if (kind === "mushrooms") {
    for (const [x, z, s] of [[0, 0, 1], [0.05, 0.03, 0.7]]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * s, 0.018 * s, 0.05 * s, 6), mat(0xe8dec4, { surface: "none" })); st.position.set(x, 0.025 * s, z); g.add(st);
      const cp = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a5634, { surface: "none" })); cp.position.set(x, 0.045 * s, z); g.add(cp);
    }
    return g;
  }
  if (kind === "fish") {
    // a perch: olive-backed, barred, a pale belly and an orange tail
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0x6a7a3e, { surface: "none", roughness: 0.4 })); b.scale.set(2.2, 0.9, 0.55); b.position.y = 0.04; g.add(b);
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.05, 4), mat(0xc8642e, { surface: "none" })); t.rotation.z = -Math.PI / 2; t.position.set(-0.13, 0.04, 0); t.scale.set(1, 1, 0.3); g.add(t);
    return g;
  }
  if (kind === "meat" || kind === "venison" || kind === "hare" || kind === "boar") {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), mat(kind === "boar" ? 0xb06a5a : kind === "hare" ? 0xa04a3a : 0x8a3a2a, { surface: "none" })); m.scale.set(1.3, 0.8, 1); m.position.y = 0.05; g.add(m);
    const fat = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03, 0), mat(0xe8d0b0, { surface: "none" })); fat.position.set(0.03, 0.07, 0.02); g.add(fat);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.09, 5), mat(0xe8e0cc, { surface: "none" })); bone.position.set(-0.05, 0.02, 0); bone.rotation.z = 1.2; g.add(bone);
  } else if (kind === "blackberries") {
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.013, 0), mat(0x2a1430, { surface: "none", roughness: 0.4 })); b.position.set(Math.sin(i * 2.1) * 0.02, 0.03 + (i % 2) * 0.012, Math.cos(i * 2.1) * 0.02); g.add(b); }
  } else if (modelCopy("food_bread")) {
    // a country loaf, its crust as photographed (ambientCG's, CC0)
    g.add(modelCopy("food_bread").scene);
  } else {
    const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0xb07a3a, { surface: "none" })); loaf.scale.set(1.2, 0.8, 0.9); loaf.position.y = 0.02; g.add(loaf);
    const crumb = new THREE.Mesh(new THREE.CircleGeometry(0.05, 7), mat(0xe8d8b0, { surface: "none" })); crumb.rotation.y = Math.PI / 2; crumb.position.set(0.066, 0.035, 0); crumb.scale.set(0.9, 0.7, 1); g.add(crumb);
  }
  return g;
}
// a sheaf of rye, bound round the middle, the ears at the top (carried in the arms, from the field to the stores)
export function makeSheaf() {
  const g = new THREE.Group(), straw = mat(0xc9a85a, { surface: "none" }), ear = mat(0xa8823e, { surface: "none" });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = 0.012 + (i % 3) * 0.012, x = Math.sin(a) * r, z = Math.cos(a) * r;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4), straw); s.position.set(x, 0.25, z); s.rotation.set(z * 2, 0, -x * 2); g.add(s);
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.05, 2, 4), ear); e.position.set(x * 1.8, 0.53, z * 1.8); e.rotation.set(z * 4, 0, -x * 4); g.add(e);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), mat(0x8a6a34, { surface: "none" })); band.rotation.x = Math.PI / 2; band.position.y = 0.24; g.add(band);
  g.rotation.z = 0.5;
  return g;
}
// a sack of grain, tied at the neck
export function makeSack() {
  const g = new THREE.Group(), cloth = mat(0xb39a72, { surface: "none", roughness: 1 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), cloth); b.scale.set(1, 1.15, 0.85); b.position.y = 0.13; g.add(b);
  const n = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.07, 6), cloth); n.position.y = 0.29; g.add(n);
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 4, 8), mat(0x6a5030, { surface: "none" })); t.rotation.x = Math.PI / 2; t.position.y = 0.28; g.add(t);
  return g;
}
// a pickaxe by its making: a wooden point (fire-hardened), two wedges of stone lashed either side, or a forged crescent
const PICK_SHAPE = [[-0.27, -0.075], [-0.13, 0.045, 0, 0.05], [0.13, 0.045, 0.27, -0.075], [0.12, -0.005, 0, -0.012], [-0.12, -0.005, -0.27, -0.075]];
export function makePick(tier = 1) {
  // (the real one for every pick: the built wooden and stone ones were crude beside it)
  { const r = realTool("pick"); if (r) return r; }
  const g = new THREE.Group();
  mesh(haftGeo(0.78, 0.023, 0.019, 7, -0.08), WOOD(), g);
  wrap(g, 0.04, 0.16, 0.026, LEATHER());
  if (tier <= 1) {
    mesh(plateGeo("pickWood", [[-0.22, -0.06], [-0.1, 0.04, 0, 0.055], [0.1, 0.04, 0.22, -0.06], [0.1, 0.0, 0, -0.005], [-0.1, 0.0, -0.22, -0.06]], 0.05, 0.006), WOOD_DARK(), g, 0, 0.655);
    wrap(g, 0.66, 0.07, 0.03);
  } else if (tier === 2) {
    for (const sd of [-1, 1]) mesh(tgeo("pickStone", () => { const c = new THREE.ConeGeometry(0.05, 0.22, 5); c.rotateX(Math.PI / 2); c.scale(0.9, 0.8, 1); return c; }), STUFF(2), g, 0, 0.66, sd * 0.13, sd < 0 ? Math.PI : 0, 0, 0);
    wrap(g, 0.66, 0.08, 0.032); mesh(tgeo("pickCross", () => new THREE.BoxGeometry(0.03, 0.03, 0.06)), CORD(), g, 0, 0.66);
  } else {
    mesh(tgeo("pickEye", () => new THREE.BoxGeometry(0.055, 0.075, 0.07)), STUFF(tier), g, 0, 0.66);
    mesh(plateGeo("pickHead", PICK_SHAPE, 0.032, 0.006), STUFF(tier), g, 0, 0.655);
    for (const sd of [-1, 1]) mesh(tgeo("pickTip", () => { const c = new THREE.ConeGeometry(0.01, 0.04, 4); c.rotateX(Math.PI / 2); return c; }), EDGE(tier), g, 0, 0.585, sd * 0.262, sd < 0 ? Math.PI - 0.5 : 0.5, 0, 0);
  }
  return g;
}
// what is in your own hands: your own sword and axe by their making, the rest as anyone's
export function makeOwnArm(kind, smithSword = false) {
  const t = G_TOOLS();
  // (a wooden sword of your own gives way to the smith's steel one, as on the hotbar)
  if (kind === "sword" && t && t.sword > 0 && (!smithSword || t.sword >= 3)) return makeSword(t.sword);
  if ((kind || "axe") === "axe" && t && t.axe >= 3) return makeAxe(t.axe);
  return makeArm(kind);
}
// ---- firearms, as the gunsmiths of Suhl and Liège made them in the 1680s ----
// A side view of the stock drawn as a line round its edge — (along the barrel, up from it) pairs — and given its
// thickness, rounded at the edges; laid so the barrel runs up +Y and the top of the gun faces +Z.
function stockFrom(P, thick, m) {
  const sh = new THREE.Shape(); sh.moveTo(P[0][0], P[0][1]); for (const [a, b] of P.slice(1)) sh.lineTo(a, b);
  const bev = Math.min(0.008, thick * 0.3);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -(thick - bev * 2) / 2);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, m);
}
// a part along the barrel (from y0 to y1, its axis at z), round or eight-sided
function along(r0, r1, y0, y1, z, m, sides = 12) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, sides), m); c.position.set(0, (y0 + y1) / 2, z); if (sides === 8) c.rotation.y = Math.PI / 8; return c; }
// a flintlock on the right of the stock (x = side): the lock plate, the cock with its flint held in its jaws, the
// steel (frizzen) standing over the pan, and its spring; k sizes it (1 a musket's, smaller a pistol's)
function flintlock(g, side, y, z, k, iron, steel) {
  const add = (m, x, yy, zz, rx = 0) => { m.position.set(x, yy, zz); m.rotation.x = rx; g.add(m); return m; };
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.15 * k, 0.03 * k), iron); add(plate, side, y + 0.06 * k, z);
  plate.scale.set(1, 1, 1);
  // (the plate's ends pointed, as they were)
  for (const e of [-1, 1]) { const tip = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.015 * k, 0.03 * k, 4), iron); tip.scale.z = 0.25; tip.rotation.z = e > 0 ? 0 : Math.PI; add(tip, side, y + 0.06 * k + e * 0.09 * k, z); tip.rotation.y = Math.PI / 4; }
  // the cock: a swan neck rising from its tumbler, the jaws at the top gripping the flint, the screw through them
  const cg = new THREE.Group(); cg.position.set(side + 0.006, y + 0.015 * k, z + 0.004); g.add(cg);
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.018 * k, 0.0045 * k, 5, 10, Math.PI * 0.9), steel); neck.rotation.y = Math.PI / 2; neck.position.set(0, 0.014 * k, 0.014 * k); cg.add(neck);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.008 * k, 0.012 * k, 0.018 * k), steel); jaw.position.set(0, 0.032 * k, 0.03 * k); cg.add(jaw);
  const flint = new THREE.Mesh(new THREE.BoxGeometry(0.009 * k, 0.014 * k, 0.005 * k), new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.6 })); flint.position.set(0, 0.044 * k, 0.03 * k); cg.add(flint);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0025 * k, 0.0025 * k, 0.022 * k, 6), steel); screw.position.set(0, 0.034 * k, 0.04 * k); cg.add(screw);
  cg.rotation.x = -0.15;
  // the steel over the pan, and the pan
  const friz = new THREE.Mesh(new THREE.BoxGeometry(0.008 * k, 0.006 * k, 0.03 * k), steel); add(friz, side + 0.002, y + 0.07 * k, z + 0.03 * k, -0.25);
  const pan = new THREE.Mesh(new THREE.BoxGeometry(0.012 * k, 0.018 * k, 0.006 * k), iron); add(pan, side + 0.001, y + 0.068 * k, z + 0.014 * k);
  const spring = new THREE.Mesh(new THREE.BoxGeometry(0.004 * k, 0.04 * k, 0.005 * k), steel); add(spring, side + 0.003, y + 0.105 * k, z + 0.002 * k, 0.15);
  return cg;
}
const GUNM = () => ({ wood: mat(0x4e2f19, { surface: "wood" }), iron: mat(0x2c2e33, { metalness: 0.75, roughness: 0.42 }), steel: mat(0x6e737a, { metalness: 0.85, roughness: 0.3 }), brass: mat(0xb48c3c, { metalness: 0.7, roughness: 0.32 }) });
// a musket: a flintlock of the Dutch pattern — a walnut stock with a dropped butt and a slim wrist, the lock on its
// right, brass at the butt, the trigger guard and the ramrod pipes, a long iron barrel octagonal at the breech and
// round to the muzzle, a blade sight at the end. Held at the wrist of the stock, pointing +Y along the barrel.
// (the model made in Blender — tools/blender/arms.py — once it has loaded; the one built here till then)
// (a held thing made of many pieces — a musket is seven: stock, horn, soot, brass, iron, steel, rod — drawn as few: the
//  pieces of one finish made one shape, their colours already in their vertices, once for every copy; a battle's
//  hundred muskets were seven hundred draws and their shadows. The ramrod stays a piece of its own: it's drawn out to load)
const MERGED = {};
function mergedModel(key) {
  if (MERGED[key] !== undefined) return MERGED[key];
  const src = MODELS[key]; if (!src) return null;
  return MERGED[key] = mergeMeshes(src.scene, key);
}
// (any still thing of plain-coloured pieces made into a piece or two by finish, metal and not; null if it can't be)
function mergeMeshes(root, key) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), keep = [];
  let ok = true;
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, g = o.geometry;
    if (Array.isArray(m) || o.isSkinnedMesh || m.map || !g.attributes.position || !g.attributes.normal) { ok = false; return; }
    if (/_rod(\.\d+)?$/.test(m.name || "")) { keep.push(o); return; }
    const k = (m.metalness || 0) > 0.2 ? "metal" : "plain";
    (buckets.get(k) || buckets.set(k, []).get(k)).push(o);
  });
  if (!ok || buckets.size === 0) return null;
  const out = new THREE.Group(); out.name = root.name;
  const c = new THREE.Color();
  for (const [k, list] of buckets) {
    const geos = list.map(o => {
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      // (the piece's own colour, if it has one, worked into its vertices)
      const n = g.attributes.position.count, col = new Float32Array(n * 3), C = g.attributes.color, mc = o.material.color || c.set(0xffffff), vc = o.material.vertexColors && C;
      for (let i = 0; i < n; i++) { col[i * 3] = (vc ? C.getX(i) : 1) * mc.r; col[i * 3 + 1] = (vc ? C.getY(i) : 1) * mc.g; col[i * 3 + 2] = (vc ? C.getZ(i) : 1) * mc.b; }
      for (const a of Object.keys(g.attributes)) if (!["position", "normal"].includes(a)) g.deleteAttribute(a);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    });
    let nv = 0, ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), I = new Uint32Array(ni); let at = 0, ii = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      // (read a value at a time: a model's attributes may be interleaved, or packed small)
      for (const [A, out] of [[g.attributes.position, P], [g.attributes.normal, N], [g.attributes.color, Cc]]) for (let k = 0; k < n; k++) { out[(at + k) * 3] = A.getX(k); out[(at + k) * 3 + 1] = A.getY(k); out[(at + k) * 3 + 2] = A.getZ(k); }
      if (g.index) for (let k = 0; k < g.index.count; k++) I[ii++] = g.index.getX(k) + at; else for (let k = 0; k < n; k++) I[ii++] = k + at;
      at += n; g.dispose();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(N, 3)); geo.setAttribute("color", new THREE.BufferAttribute(Cc, 3)); geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.computeBoundingSphere(); geo._shared = true;
    const m0 = list[0].material, mat = m0.clone(); mat.color = new THREE.Color(0xffffff); mat.vertexColors = true; mat.name = `${key}_${k}`;
    // (and its grain and finish, which a copy of a material doesn't carry)
    mat.onBeforeCompile = m0.onBeforeCompile; if (m0.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) mat.customProgramCacheKey = m0.customProgramCacheKey;
    const mesh = new THREE.Mesh(geo, mat); mesh.name = `${key}_${k}`; mesh.castShadow = true; mesh.receiveShadow = true; out.add(mesh);
  }
  for (const o of keep) { const r = o.clone(); r.position.set(0, 0, 0); r.quaternion.identity(); r.scale.set(1, 1, 1); r.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); r.castShadow = true; r.receiveShadow = true; out.add(r); }
  return out;
}
function fromModel(key, muzzle, grips) {
  const M = mergedModel(key), m = M ? { scene: M.clone() } : modelCopy(key); if (!m) return null;
  const g = new THREE.Group(); g.add(m.scene);
  // (the ramrod lying in its pipes: a piece of its own, hidden while it's drawn)
  m.scene.traverse(o => { if (o.isMesh && o.material && /_rod(\.\d+)?$/.test(o.material.name || "")) g.userData.rodMesh = o; });
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(...muzzle); g.add(g.userData.muzzle);
  g.userData.grips = grips.map(p => new THREE.Vector3(...p));
  return g;
}
export function makeMusket() {
  const fm = fromModel("musket", [0, 1.13, 0.032], [[0, -0.07, -0.02], [0, 0.3, -0.016]]); if (fm) return fm;
  const g = new THREE.Group(), M = GUNM();
  // the stock, in side view: the butt (dropped, its toe down), the narrow wrist, the lock's flat, and the long fore-end
  g.add(stockFrom([[-0.42, 0.006], [-0.42, -0.128], [-0.33, -0.112], [-0.2, -0.082], [-0.1, -0.052], [-0.03, -0.046], [0.05, -0.04], [0.2, -0.03], [0.6, -0.022], [0.94, -0.016], [0.95, 0.012], [0.6, 0.014], [0.2, 0.017], [0.04, 0.02], [-0.04, 0.012], [-0.12, 0.004], [-0.3, 0.006]], 0.042, M.wood));
  // the comb, a little raised where the cheek lies
  { const comb = stockFrom([[-0.4, 0.004], [-0.4, 0.016], [-0.18, 0.012], [-0.14, 0.004]], 0.03, M.wood); g.add(comb); }
  // the barrel: eight-sided at the breech, round on to the muzzle, a ring there, a blade sight; the tang along the wrist
  g.add(along(0.0165, 0.0165, 0.03, 0.3, 0.03, M.iron, 8));
  g.add(along(0.015, 0.0125, 0.3, 1.12, 0.03, M.iron, 14));
  g.add(along(0.0145, 0.0145, 1.1, 1.125, 0.03, M.iron, 14));
  { const sight = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.008), M.brass); sight.position.set(0, 1.1, 0.047); g.add(sight); }
  { const tang = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.004), M.iron); tang.position.set(0, -0.03, 0.017); tang.rotation.x = 0.08; g.add(tang); }
  // the ramrod under the barrel, its brass-tipped end at the muzzle, and the pipes that hold it
  g.add(along(0.0045, 0.0045, 0.12, 1.1, 0.002, mat(0x6a4a2a, { surface: "wood" }), 6));
  g.add(along(0.0055, 0.0055, 1.09, 1.105, 0.002, M.brass, 8));
  for (const y of [0.42, 0.7, 0.98]) { const pipe = along(0.0075, 0.0075, y, y + 0.03, 0.002, M.brass, 8); g.add(pipe); }
  // the barrel bands (brass) round barrel and fore-end together
  for (const y of [0.55, 0.85]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0035, 5, 14), M.brass); b.rotation.x = Math.PI / 2; b.position.set(0, y, 0.008); b.scale.set(0.85, 1, 1.35); g.add(b); }
  // the lock, on the right
  flintlock(g, 0.023, -0.005, 0.004, 1, M.iron, M.steel);
  // and the side plate opposite it, brass
  { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.13, 0.016), M.brass); sp.position.set(-0.022, 0.05, -0.004); g.add(sp); }
  // the trigger and its guard, the butt plate, the sling swivels
  { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.008, 0.026), M.steel); tr.position.set(0, 0.0, -0.058); tr.rotation.x = -0.35; g.add(tr); }
  { const gd = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0035, 5, 14, Math.PI), M.brass); gd.rotation.y = Math.PI / 2; gd.rotation.z = Math.PI; gd.position.set(0, 0.0, -0.045); gd.scale.set(1, 1.6, 1); g.add(gd); }
  { const bp = stockFrom([[-0.428, 0.008], [-0.428, -0.13], [-0.418, -0.13], [-0.418, 0.008]], 0.046, M.brass); g.add(bp); }
  for (const y of [-0.24, 0.62]) { const sw = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, 4, 10), M.iron); sw.rotation.y = Math.PI / 2; sw.position.set(0, y, y < 0 ? -0.105 : -0.03); g.add(sw); }
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 1.13, 0.03); g.add(g.userData.muzzle);
  // where two hands hold it: the right round the wrist, the left under the fore-end
  g.userData.grips = [new THREE.Vector3(0, -0.07, -0.02), new THREE.Vector3(0, 0.3, -0.014)];
  return g;
}
// a horseman's pistol: a flintlock with a walnut stock running nearly to the muzzle, the butt dropped steeply to a
// brass-capped pommel, a long barrel octagonal at the breech, a brass muzzle cap and the ramrod beneath. Built like
// the musket: the barrel up +Y, its top to +Z, held at the grip.
export function makePistol() {
  const fm = fromModel("pistol", [0, 0.336, 0.022], [[0, -0.08, -0.05]]); if (fm) return fm;
  const g = new THREE.Group(), M = GUNM();
  g.add(stockFrom([[0.3, 0.012], [0.04, 0.016], [-0.01, 0.01], [-0.05, -0.02], [-0.085, -0.06], [-0.11, -0.095], [-0.12, -0.112], [-0.095, -0.128], [-0.06, -0.11], [-0.03, -0.07], [0.0, -0.045], [0.04, -0.03], [0.3, -0.012]], 0.03, M.wood));
  g.add(along(0.0118, 0.0118, 0.02, 0.12, 0.022, M.iron, 8));
  g.add(along(0.011, 0.0095, 0.12, 0.33, 0.022, M.iron, 12));
  { const cap = along(0.0125, 0.0125, 0.29, 0.31, 0.012, M.brass, 10); g.add(cap); }
  g.add(along(0.0035, 0.0035, 0.06, 0.32, 0.0, mat(0x6a4a2a, { surface: "wood" }), 6));
  g.add(along(0.0045, 0.0045, 0.315, 0.327, 0.0, M.brass, 8));
  flintlock(g, 0.016, -0.012, 0.004, 0.72, M.iron, M.steel);
  // the pommel cap, brass, with its spurs up the sides of the grip
  { const pm = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), M.brass); pm.position.set(0, -0.112, -0.118); pm.scale.set(0.8, 0.9, 1.1); g.add(pm); }
  for (const sd of [-1, 1]) { const spur = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.05, 0.008), M.brass); spur.position.set(sd * 0.0155, -0.09, -0.095); spur.rotation.x = 0.85; g.add(spur); }
  { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.02), M.steel); tr.position.set(0, -0.005, -0.045); tr.rotation.x = -0.4; g.add(tr); }
  { const gd = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0028, 5, 12, Math.PI), M.brass); gd.rotation.y = Math.PI / 2; gd.rotation.z = Math.PI; gd.position.set(0, -0.004, -0.032); gd.scale.set(1, 1.5, 1); g.add(gd); }
  { const sight = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.008, 0.005), M.brass); sight.position.set(0, 0.315, 0.034); g.add(sight); }
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 0.335, 0.022); g.add(g.userData.muzzle);
  g.userData.grips = [new THREE.Vector3(0, -0.06, -0.07)];
  return g;
}
// a crossbow of the time, as a German hunter would carry one: a walnut tiller, its butt dropped for the cheek and set
// with bone; a steel prod, swept back, lashed to the front with cord; a horn nut that holds the string; a long
// trigger lever under the stock; a stirrup; sights to look down; and a windlass on the side to span it. Built
// pointing away down -z. userData.span(k) bends the prod and draws the string back (0 loosed, 1 spanned at the nut).
export function makeCrossbow() {
  const g = new THREE.Group();
  const wood = mat(0x5a3820, { surface: "wood" }), dark = mat(0x3e2614, { surface: "wood" }), bone = mat(0xe6dcc4, { roughness: 0.55 });
  const steel = mat(0x8c9198, { metalness: 0.75, roughness: 0.32 }), blued = mat(0x3a3e46, { metalness: 0.7, roughness: 0.38 });
  const cord = mat(0x3a2c1e, { roughness: 0.95 }), horn = mat(0xd6c49a, { roughness: 0.5 }), str = mat(0xd8cfb4, { roughness: 0.9 });
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
  // the tiller: its side drawn (forward is -z), and given its thickness
  const sh = new THREE.Shape(), P = [[-0.25, 0.012], [-0.24, -0.1], [-0.2, -0.108], [-0.12, -0.07], [-0.04, -0.045], [0.02, -0.05], [0.16, -0.045], [0.3, -0.034], [0.47, -0.022], [0.47, 0.026], [0.06, 0.03], [-0.03, 0.03], [-0.14, 0.026], [-0.25, 0.012]];
  sh.moveTo(P[0][0], P[0][1]); for (const [a, b] of P.slice(1)) sh.lineTo(a, b);
  const tg = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
  tg.translate(0, 0, -0.02); tg.rotateY(Math.PI / 2);       // (the drawing's x becomes forward, -z)
  add(new THREE.Mesh(tg, wood));
  // bone set into the butt's sides, and a stripe along its comb
  for (const sd of [-1, 1]) {
    const pl = add(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.05, 0.12), bone), sd * 0.0265, -0.045, 0.18); pl.rotation.x = 0.28;
    for (let i = 0; i < 3; i++) add(new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), bone), sd * 0.0262, -0.012, 0.06 - i * 0.045);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, 0.3), bone), 0, 0.0335, 0.02);
  // the groove the bolt lies in, darker, and its spring clip
  add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.003, 0.34), dark), 0, 0.0345, -0.27);
  const clip = add(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.002, 0.06), steel), 0, 0.042, -0.15); clip.rotation.x = 0.12;
  // the lock: plates either side, and the horn nut that the string catches on
  for (const sd of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.032, 0.07), steel), sd * 0.027, 0.006, -0.12);
  const nut = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 12).rotateZ(Math.PI / 2), horn), 0, 0.034, -0.12);
  // the long trigger lever under the stock, and its pivot
  const trig = new THREE.Group(); trig.position.set(0, -0.045, -0.1); g.add(trig);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.2), steel); lever.position.set(0, -0.012, 0.1); lever.rotation.x = -0.12; trig.add(lever);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8).rotateZ(Math.PI / 2), blued), 0, -0.04, -0.1);
  // sights: a notched leaf behind, a bead in front
  for (const sd of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.004), blued), sd * 0.005, 0.046, -0.03);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.004), blued), 0, 0.037, -0.03);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), steel), 0, 0.044, -0.445);
  // the steel prod: each half swept back from the root, flat-sectioned, with a nock at the tip
  const root = new THREE.Vector3(0, 0.022, -0.42), halves = [];
  for (const sd of [-1, 1]) {
    const h = new THREE.Group(); h.position.copy(root); g.add(h);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(sd * 0.1, 0, 0.004), new THREE.Vector3(sd * 0.2, -0.001, 0.016), new THREE.Vector3(sd * 0.3, -0.002, 0.04)]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.014, 8, false), steel); tube.scale.set(1, 0.68, 1); h.add(tube);
    const nock = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), steel); nock.position.set(sd * 0.3, -0.001, 0.04); h.add(nock);
    halves.push({ h, sd });
  }
  // the bridle: cord bound round prod and stock where they meet, and the iron that keeps them
  for (const dx of [-0.026, 0.026]) { const w = add(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 5, 12), cord), dx, 0.012, -0.42); w.rotation.y = Math.PI / 2; }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.012, 0.03), blued), 0, 0.036, -0.42);
  // the stirrup, for a foot when it's spanned by hand
  const stir = add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 16, Math.PI), steel), 0, -0.004, -0.49); stir.rotation.set(0, 0, Math.PI);
  stir.scale.set(1, 1.2, 1);
  // the windlass on the right of the stock: its drum, and the crank that winds it
  const drum = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 14).rotateZ(Math.PI / 2), blued), 0.04, -0.01, -0.03);
  const crank = new THREE.Group(); crank.position.set(0.054, -0.01, -0.03); g.add(crank);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.075, 0.01), steel); arm.position.y = 0.035; crank.add(arm);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 8).rotateZ(Math.PI / 2), dark); knob.position.set(0.017, 0.07, 0); crank.add(knob);
  void drum; void nut;
  // the string: two lengths of cord from the nocks to where it's held
  const strand = () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 1, 5).translate(0, 0.5, 0), str); g.add(m); return m; };
  const S1 = strand(), S2 = strand(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const lay = (m, a, b) => { tmp.subVectors(b, a); const L = tmp.length(); m.position.copy(a); m.quaternion.setFromUnitVectors(up, tmp.normalize()); m.scale.set(1, L, 1); };
  // a bolt in the groove: stout, a squared iron head, two vanes
  const bolt = new THREE.Group();
  bolt.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0065, 0.3, 6).rotateX(Math.PI / 2), mat(0xa88458, { surface: "wood" })));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.045, 4).rotateX(-Math.PI / 2), steel); head.position.z = -0.17; bolt.add(head);
  for (const sd of [-1, 1]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.016, 0.05), mat(0x7a2e22)); v.position.set(sd * 0.006, 0.006, 0.13); v.rotation.z = sd * 0.5; bolt.add(v); }
  bolt.position.set(0, 0.043, -0.26); g.add(bolt);
  g.userData = { bolt, crank, trig, span(k) {
    k = Math.max(0, Math.min(1, k));
    const bend = 0.05 + 0.2 * k, tips = [];
    for (const { h, sd } of halves) {
      h.rotation.y = sd > 0 ? -bend : bend;
      // (where the nock is, now)
      const x = sd * (0.3 * Math.cos(bend) - 0.04 * Math.sin(bend)), z = 0.3 * Math.sin(bend) + 0.04 * Math.cos(bend);
      tips.push(new THREE.Vector3(root.x + x, root.y - 0.002, root.z + z));
    }
    const mid = new THREE.Vector3(0, 0.034, tips[0].z + (-0.12 - tips[0].z) * k);
    lay(S1, tips[0], mid); lay(S2, tips[1], mid);
  } };
  g.userData.span(1);
  // where two hands hold it: the right round the wrist of the tiller at the trigger, the left under the fore-end
  g.userData.grips = [new THREE.Vector3(0.012, -0.06, 0.02), new THREE.Vector3(-0.006, -0.05, -0.2)];
  return g;
}
export const makeArm = kind => ({ bayonet: makeBayonetMusket, sword: makeSword, spear: makeSpear, battleaxe: makeBattleAxe, warclub: makeWarClub, club: makeClub, knife: makeKnife, musket: makeMusket, pistol: makePistol, dagger: makeDagger, pick: () => makePick((G_TOOLS() || {}).pick || 1) })[kind]?.() || makeAxe();
// (the pick's making is the player's, read from the game at the moment it is made)
let _toolsOf = () => null;
export const setToolSource = f => { _toolsOf = f; };
const G_TOOLS = () => _toolsOf();

export function makeScroll(read = false) {
  const g = new THREE.Group();
  // (held as a paper is: by its side, between the thumb and the fingers — the hand open, see setGrip — the fingers lying
  //  along it, the sheet running on past them. In the hand's frame its edge runs the way the fist's hole would, and the
  //  sheet out the way the fingers point)
  //  — read: held up by its side edge facing the one reading it, the fingers behind it and the thumb before; carried:
  //  hanging by its side edge along the fingers, which lie on it
  const p = new THREE.Mesh(read ? new THREE.BoxGeometry(0.28, 0.36, 0.004) : new THREE.BoxGeometry(0.004, 0.36, 0.28), mat(0xe8dcc0));
  p.position.set(read ? 0.12 : 0.006, -0.06, read ? 0.06 : 0.11); g.add(p);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), mat(0x9a1b1b));
  if (read) { seal.rotation.x = Math.PI / 2; seal.position.set(0.12, -0.19, 0.055); } else { seal.rotation.z = Math.PI / 2; seal.position.set(0.012, -0.19, 0.17); }
  g.add(seal);
  g.userData.pinch = true;
  return g;
}
// (held as a guard holds it: grounded and upright at his side, its point to the sky — kept so whatever the hand that
//  holds it is doing, its blade turned the way he faces)
const _hq = new THREE.Quaternion(), _hf = new THREE.Vector3(), _hy = new THREE.Vector3(0, 1, 0);
export function makeHalberd() {
  const g = new THREE.Group(), s = new THREE.Group(); g.add(s);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.1, 6), mat(0x5a4030)); shaft.position.y = 0.6; s.add(shaft);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.22), mat(0x9a9ea4, { metalness: 0.8, roughness: 0.4 })); blade.position.set(0, 1.5, 0.09); s.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.28, 4), mat(0x9a9ea4, { metalness: 0.8, roughness: 0.4 })); tip.position.y = 1.78; s.add(tip);
  shaft.onBeforeRender = () => {
    g.getWorldQuaternion(_hq);
    // (the way the holder faces: the hand's own forward, laid flat)
    _hf.set(0, 0, 1).applyQuaternion(_hq); _hf.y = 0; if (_hf.lengthSq() < 1e-6) _hf.set(0, 0, 1);
    const yaw = Math.atan2(_hf.x, _hf.z);
    s.quaternion.copy(_hq.invert()).multiply(new THREE.Quaternion().setFromAxisAngle(_hy, yaw));
    s.updateMatrixWorld(true);
  };
  return g;
}

// ---------------------------------------------------------------------------
//  trees
// ---------------------------------------------------------------------------
// Geometries shared by the instanced forest and by the single choppable trees.
// Their vertex colours are shading, not colour: light where the sun finds the
// tips, dark in the hollows and undersides, multiplied by each material's hue.

// one tier of spruce boughs: a cone whose skirt is ragged and droops at the tips
function spruceTierGeo(N = 16, underY = 0.3) {
  const r = rng(11);
  const pos = [], col = [], idx = [];
  const v = (x, y, z, c) => { pos.push(x, y, z); col.push(c, c, c); return pos.length / 3 - 1; };
  const apex = v(0, 1, 0, 1.15);
  const mid = [], rim = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, tip = i % 2 === 0;
    const rm = 0.5 + r() * 0.06;
    mid.push(v(Math.cos(a) * rm, 0.5 + r() * 0.05, Math.sin(a) * rm, 0.95));
    const rr = tip ? 1.0 + r() * 0.08 : 0.74 + r() * 0.06;
    rim.push(v(Math.cos(a) * rr, tip ? -0.04 - r() * 0.05 : 0.1, Math.sin(a) * rr, tip ? 1.05 : 0.6));
  }
  const under = v(0, underY, 0, 0.35);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    idx.push(apex, mid[j], mid[i]);
    idx.push(mid[i], mid[j], rim[j], mid[i], rim[j], rim[i]);
    idx.push(under, rim[i], rim[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// a clump of leaves: a lumpy ball, dark underneath
function leafClumpGeo(detail = 2, lump = 0.22) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("normal"); g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1 + v.y * 2.3) * 0.5 + Math.sin(v.z * 4.7 - v.x * 3.1) * 0.35 + Math.sin(v.y * 7.9 + v.z * 1.7) * 0.25;
    v.multiplyScalar(1 + n * lump);
    p.setXYZ(i, v.x, v.y, v.z);
    const k = 0.5 + (v.y * 0.5 + 0.5) * 0.6 + n * 0.12;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}
// ---- foliage as foliage: leaves and needles drawn on cards, cut out round their edges, in place of solid lumps ----
// (painted in greys, so each kind keeps its own green from its material and each tree its own tint; the corner square
//  is solid, for the dense heart of a crown, which has no edges)
const FOL_CORE = [0.03, 0.03];
function foliageTex(kind) {
  if (typeof document === "undefined") return null;
  const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d"), r = rng(kind === "needle" ? 7 : 13);
  c.fillStyle = "rgb(150,150,150)"; c.fillRect(0, S - 16, 16, 16);              // (the solid corner)
  const g = v => `rgb(${v},${v},${v})`;
  if (kind === "needle") {
    // a spruce spray: the twig along the middle from the trunk (left) to the tip (right), side twigs, needles all along
    const twig = (x0, y0, x1, y1, n, len) => {
      c.strokeStyle = g(70); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      for (let i = 0; i < n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, a = Math.atan2(y1 - y0, x1 - x0);
        for (const sd of [-1, 1]) { const b = a + sd * (0.9 + r() * 0.5) - 0.3, l = len * (0.7 + r() * 0.5) * (1 - t * 0.35);
          c.strokeStyle = g(110 + Math.floor(r() * 100)); c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); c.stroke(); }
      }
    };
    twig(4, S / 2, S - 6, S / 2 + 6, 70, 22);
    for (let k = 0; k < 7; k++) { const x = 30 + k * 30, sd = k % 2 ? 1 : -1; twig(x, S / 2, x + 40 + r() * 20, S / 2 + sd * (50 + r() * 30), 22, 15); }
  } else {
    // a spray of leaves: small pointed ovals every way, lighter and darker, on thin stalks
    for (let i = 0; i < 95; i++) {
      const x = 20 + r() * (S - 40), y = 20 + r() * (S - 52), a = r() * TAU, L = 14 + r() * 12, W = L * (0.42 + r() * 0.15);
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = g(105 + Math.floor(r() * 110));
      c.beginPath(); c.moveTo(-L / 2, 0); c.quadraticCurveTo(0, -W, L / 2, 0); c.quadraticCurveTo(0, W, -L / 2, 0); c.fill();
      c.strokeStyle = g(80); c.lineWidth = 1; c.beginPath(); c.moveTo(-L / 2, 0); c.lineTo(L / 2, 0); c.stroke();
      c.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// (photographed: art/tex/needle.png and leaf.png, from ambientCG's CC0 leaf atlases — see tools/make_foliage.py; the
//  drawn ones above are kept for anything that can't load them)
const FOL_LOADER = typeof document !== "undefined" ? new THREE.TextureLoader() : null;
const folPhoto = kind => {
  if (!FOL_LOADER) return foliageTex(kind);
  const t = FOL_LOADER.load(`art/tex/${kind}.png`, undefined, undefined, () => { const c = foliageTex(kind); if (c) { t.image = c.image; t.needsUpdate = true; } });
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};
export const FOL = { needle: folPhoto("needle"), leaf: folPhoto("leaf") };
// (cards and the solid heart in one geometry: positions, greys, uvs, and normals bent outward from the crown's middle so
//  the cards are lit as a rounded crown, not as so many flat boards)
function cardsGeo(core, cards) {
  const pos = [], col = [], uv = [], nrm = [], idx = [];
  if (core) {
    const p = core.attributes.position, cc = core.attributes.color, ix = core.index;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); const k = cc ? cc.getX(i) * 0.7 : 0.6; col.push(k, k, k); uv.push(FOL_CORE[0], FOL_CORE[1]); const n = new THREE.Vector3(p.getX(i), p.getY(i) - 0.4, p.getZ(i)).normalize(); nrm.push(n.x, n.y, n.z); }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i));
  }
  for (const q of cards) {
    const b = pos.length / 3;
    for (const [P, U, K] of q) { pos.push(P.x, P.y, P.z); uv.push(U[0], U[1]); col.push(K, K, K); const n = new THREE.Vector3(P.x, P.y - 0.35, P.z).normalize(); nrm.push(n.x * 0.6, n.y * 0.6 + 0.55, n.z * 0.6); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  g.normalizeNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
// a spruce's tier: a dark heart, and boughs drooping out all round it, each a spray of needles
function spruceTierCards(N = 16) {
  // (the solid heart of the tier narrower, and hollowed up underneath almost to its top: from below, standing under a
  //  spruce, you see its boughs against the sky and not the flat dark lid of a cone)
  const core = spruceTierGeo(Math.max(6, N / 2), 0.6); core.scale(0.3, 0.95, 0.3);
  const r = rng(23), cards = [], V = THREE.Vector3;
  for (let k = 0; k < N; k++) {
    const a = k / N * TAU + r() * 0.35, ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca;
    // (each bough out from the trunk at its own height, longer or shorter, so a tier's edge is ragged and the tiers run
    //  into one another — not a shelf with a lit rim, one over another)
    const y0 = 0.48 + r() * 0.32, r1 = 0.82 + r() * 0.28, y1 = -0.06 - r() * 0.22, w = 0.22 + r() * 0.08;
    // (drooping as a spruce's do: down from the trunk, sagging through the middle, the tip turned up a little)
    const tilt = (r() - 0.5) * 0.5, sag = 0.08 + r() * 0.1;
    const p0 = new V(ca * 0.05, y0, sa * 0.05), pm = new V(ca * r1 * 0.58, y0 + (y1 - y0) * 0.78 - sag, sa * r1 * 0.58), p1 = new V(ca * r1, y1 + 0.05, sa * r1);
    const side = new V(tx * w, tilt * w, tz * w), sideM = side.clone().multiplyScalar(1.08), sideT = side.clone().multiplyScalar(0.8);
    // (shaded darker toward the trunk, the tips only a little lighter, each bough its own — no bright rim all round)
    const kk = 0.9 + r() * 0.2, k0 = 0.68 * kk, km = 0.84 * kk, k1 = 0.94 * kk;
    cards.push([[p0.clone().sub(side), [0, 0], k0], [pm.clone().sub(sideM), [0.58, 0], km], [pm.clone().add(sideM), [0.58, 1], km], [p0.clone().add(side), [0, 1], k0]]);
    cards.push([[pm.clone().sub(sideM), [0.58, 0], km], [p1.clone().sub(sideT), [1, 0], k1], [p1.clone().add(sideT), [1, 1], k1], [pm.clone().add(sideM), [0.58, 1], km]]);
  }
  return cardsGeo(core, cards);
}
// a clump of leaves: a small dark heart and sprays of leaves set every way round it
function leafClumpCards(n = 22, detail = 1) {
  const core = leafClumpGeo(detail, 0.22); core.scale(0.62, 0.62, 0.62);
  const r = rng(31), cards = [], V = THREE.Vector3;
  for (let k = 0; k < n; k++) {
    const u = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - u * u), c0 = new V(s * Math.cos(a), u * 0.85, s * Math.sin(a)).multiplyScalar(0.62 + r() * 0.25);
    const out = c0.clone().normalize(), t1 = new V(0, 1, 0).cross(out); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); t1.normalize();
    const t2 = out.clone().cross(t1).normalize(), rot = r() * TAU, hs = 0.38 + r() * 0.14;
    const e1 = t1.clone().multiplyScalar(Math.cos(rot)).addScaledVector(t2, Math.sin(rot)).multiplyScalar(hs), e2 = t1.clone().multiplyScalar(-Math.sin(rot)).addScaledVector(t2, Math.cos(rot)).multiplyScalar(hs);
    const k0 = 0.75 + (out.y * 0.5 + 0.5) * 0.4;
    cards.push([[c0.clone().sub(e1).sub(e2), [0, 0], k0], [c0.clone().add(e1).sub(e2), [1, 0], k0], [c0.clone().add(e1).add(e2), [1, 1], k0], [c0.clone().sub(e1).add(e2), [0, 1], k0]]);
  }
  return cardsGeo(core, cards);
}
// a trunk, darker and damper at its foot
function trunkGeo() {
  const g = new THREE.CylinderGeometry(0.16, 0.3, 1, 9, 4).translate(0, 0.5, 0);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = 0.62 + p.getY(i) * 0.45; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}

// ---- the wind in the trees: every tree bends from its foot, the crown most, each to its own slow beat, and the gusts
// roll across the forest in waves. aSway, per tree: [its foot's height, its height, its phase]
export const SWAY = { t: { value: 0 }, k: { value: 0.2 }, dir: { value: new THREE.Vector2(0.92, 0.38) } };
export function addSway(material) {
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uSwayT = SWAY.t; sh.uniforms.uSwayK = SWAY.k; sh.uniforms.uSwayDir = SWAY.dir;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aSway; uniform float uSwayT, uSwayK; uniform vec2 uSwayDir;")
      .replace("#include <project_vertex>", `
        vec4 swW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          swW = instanceMatrix * swW;
        #endif
        swW = modelMatrix * swW;
        if (aSway.y > 0.5) {
          float hk = clamp((swW.y - aSway.x) / aSway.y, 0.0, 1.2); hk *= hk;
          float T = uSwayT, gust = 0.55 + 0.45 * sin(T * 0.55 - dot(swW.xz, uSwayDir) * 0.07);
          float A = (aSway.y + 2.0) * (0.006 + 0.028 * uSwayK) * gust;
          float w = sin(T * (2.6 - aSway.y * 0.06) + aSway.z) + 0.35 * sin(T * 3.7 + aSway.z * 1.7);
          vec2 off = uSwayDir * (A * w + aSway.y * 0.012 * uSwayK * gust) + vec2(-uSwayDir.y, uSwayDir.x) * A * 0.35 * sin(T * 1.3 + aSway.z * 2.3);
          swW.xz += off * hk;
        }
        vec4 mvPosition = viewMatrix * swW;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  material.customProgramCacheKey = () => (key ? key.call(material) : "") + "sway";
  material.needsUpdate = true;
  return material;
}
// the same shape, with a sway for each of n instances (the shape's own buffers shared, not copied)
// a real model's one mesh, to be drawn many times over (an InstancedMesh): its shape and its material — swaying in the
// wind, if asked (a fern, a bush) — or null, if it isn't to be had
export function realPart(key, sway = false) {
  const M = MODELS[key]; if (!M) return null; let mesh = null; M.scene.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) return null;
  // (a plant: its leaves cut out of their cards by the texture's own alpha, both faces drawn, stirring in the wind)
  if (sway && !mesh.material.userData.swayed) { const m = mesh.material; m.userData.swayed = true; m.side = THREE.DoubleSide; m.alphaTest = 0.45; m.transparent = false; m.depthWrite = true; addSway(m); }
  return { geo: mesh.geometry, mat: mesh.material };
}
// many of one real thing, set down where `list` says ([{x, y, z, ry, s, sy?}]): one draw for all of them
export function realMany(key, list, { shadow = false } = {}) {
  const P = realPart(key); if (!P || !list.length) return null;
  const m = new THREE.InstancedMesh(P.geo, P.mat, list.length), d = new THREE.Object3D();
  list.forEach((q, i) => { d.position.set(q.x, q.y, q.z); d.rotation.set(q.rx || 0, q.ry || 0, q.rz || 0); d.scale.set(q.s, q.sy ?? q.s, q.sz ?? q.s); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  m.castShadow = shadow; m.receiveShadow = true; m.computeBoundingSphere();
  return m;
}
export function swayGeo(geo, n) {
  const g = new THREE.BufferGeometry();
  g.index = geo.index; for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
  g.setAttribute("aSway", new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3));
  g.userData.base = geo;
  return g;
}
export const TREE = {
  trunk: trunkGeo(),
  // (a pine's limb: a tapering pole from its foot at the origin up the y axis, a unit long, a little crooked)
  limb: (() => { const g = new THREE.CylinderGeometry(0.55, 1, 1, 6, 3).translate(0, 0.5, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 4) * 0.6); }
    g.computeVertexNormals(); const c = new Float32Array(p.count * 3).fill(0.9); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); return g; })(),
  cone: spruceTierCards(16),
  blob: leafClumpCards(22, 1),
  // (far off, the same trees with fewer boughs and sprays: nobody can count them at a hundred metres)
  coneFar: spruceTierCards(9),
  blobFar: leafClumpCards(10, 0),
  // (the old solid shapes, for what is drawn without a cut-out leaf — ferns' fronds and hedges built into one mesh)
  coneSolid: spruceTierGeo(),
  blobSolid: leafClumpGeo(2, 0.22),
  trunkMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x6a4e3a, roughness: 1, vertexColors: true }), { scale: 3, amount: 0.25, grain: 0.9, surface: "bark" }),
  birchMat: addDetail(new THREE.MeshStandardMaterial({ color: 0xe0dccf, roughness: 0.9, vertexColors: true }), { scale: 2.2, amount: 0.5, grain: 0.3, surface: "bark" }),
  spruceMat: addDetail(new THREE.MeshStandardMaterial({ map: FOL.needle, alphaTest: 0.42, side: THREE.DoubleSide, color: 0x33583a, roughness: 0.95, vertexColors: true }), { scale: 2.5, amount: 0.2, grain: 0.6, surface: "needles", seeThrough: 3.6, rim: false, cards: true }),
  pineMat: addDetail(new THREE.MeshStandardMaterial({ map: FOL.needle, alphaTest: 0.42, side: THREE.DoubleSide, color: 0x3f6334, roughness: 0.95, vertexColors: true }), { scale: 2.5, amount: 0.2, grain: 0.6, surface: "needles", seeThrough: 3.6, rim: false, cards: true }),
  leafMat: addDetail(new THREE.MeshStandardMaterial({ map: FOL.leaf, alphaTest: 0.42, side: THREE.DoubleSide, color: 0x6a8a40, roughness: 0.9, vertexColors: true }), { scale: 2.5, amount: 0.2, grain: 0.6, surface: "needles", seeThrough: 3.6, rim: false, cards: true }),
  // (the trees of the other biomes: the broadleaf oak, the savanna's acacia, the rain forest's giants, the palm, desert scrub)
  frond: frondGeo(),
  oakMat: addDetail(new THREE.MeshStandardMaterial({ map: FOL.leaf, alphaTest: 0.42, side: THREE.DoubleSide, color: 0x3d5e28, roughness: 0.9, vertexColors: true }), { scale: 2.5, amount: 0.22, grain: 0.6, surface: "needles", seeThrough: 3.6, rim: false, cards: true }),
  acaciaMat: addDetail(new THREE.MeshStandardMaterial({ map: FOL.leaf, alphaTest: 0.42, side: THREE.DoubleSide, color: 0x6b7a34, roughness: 0.9, vertexColors: true }), { scale: 2.5, amount: 0.22, grain: 0.6, surface: "needles", seeThrough: 3.6, rim: false, cards: true }),
  jungleMat: addDetail(new THREE.MeshStandardMaterial({ map: FOL.leaf, alphaTest: 0.42, side: THREE.DoubleSide, color: 0x2a5622, roughness: 0.85, vertexColors: true }), { scale: 2.5, amount: 0.22, grain: 0.6, surface: "needles", seeThrough: 3.6, rim: false, cards: true }),
  scrubMat: addDetail(new THREE.MeshStandardMaterial({ map: FOL.leaf, alphaTest: 0.42, side: THREE.DoubleSide, color: 0x6e7448, roughness: 0.95, vertexColors: true }), { scale: 2.5, amount: 0.25, grain: 0.6, surface: "needles", rim: false, cards: true }),
  palmMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x4f8030, roughness: 0.8, side: THREE.DoubleSide }), { scale: 2.5, amount: 0.18, grain: 0.5, surface: "needles", seeThrough: 3.6 }),
  palmTrunkMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1, vertexColors: true }), { scale: 3, amount: 0.25, grain: 0.9, surface: "bark" }),
};
for (const k of ["trunk", "limb", "cone", "blob", "frond"]) TREE[k]._shared = true;
// (a pine's and a spruce's trunk in its real bark — the same photographed pine bark as the logs, its colour and its
//  relief — wrapped round the trunk a whole number of times, so it meets itself, and laid on in metres up it, however
//  tall the tree; under the grain, the snow and the axe's notches as before)
let _barkTex = null;
// (a birch's: no photograph of one to be had free, so painted — white, its lenticels the short dark dashes running across
//  the trunk, here and there the black diamond scar of a branch long gone, and the bark's papery sheen uneven)
let _birchTex = null;
function birchBarkTex() {
  if (_birchTex) return _birchTex;
  const r = rng(131), t = paint(512, (g, S) => {
    g.fillStyle = "#f1eee6"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "200,195,182" : "255,255,252"},${0.2 + r() * 0.3})`; g.fillRect(r() * S, r() * S, 20 + r() * 80, 2 + r() * 6); }
    for (let i = 0; i < 480; i++) { const x = r() * S, y = r() * S, w = 8 + r() * (r() < 0.18 ? 70 : 26), h = 1.6 + r() * 3.4; g.fillStyle = `rgba(30,27,24,${0.55 + r() * 0.4})`; g.fillRect(x, y, w, h); if (x + w > S) g.fillRect(x - S, y, w, h); }
    for (let i = 0; i < 9; i++) { const x = r() * S, y = r() * S, w = 10 + r() * 18; g.fillStyle = "rgba(26,23,21,0.9)"; g.beginPath(); g.moveTo(x - w, y); g.lineTo(x, y - w * 0.45); g.lineTo(x + w, y); g.lineTo(x, y + w * 0.45); g.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.userData.shared = true;
  return (_birchTex = t);
}
export function addBark(material, birch = false) {
  if (typeof document === "undefined") return material;
  _barkTex ??= ["log_bark", "log_bark_n"].map((n, i) => { const t = new THREE.TextureLoader().load("art/tex/" + n + ".jpg"); if (!i) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.userData.shared = true; return t; });
  addHook(material, sh => {
    sh.uniforms.uBark = { value: birch ? birchBarkTex() : _barkTex[0] }; sh.uniforms.uBarkN = { value: _barkTex[1] };
    if (birch) sh.defines = { ...(sh.defines || {}), BARK_BIRCH: "" };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBLocal; varying vec2 vBS;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vBLocal = position; vBS = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        #ifdef USE_INSTANCING
          vBS *= vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBLocal; varying vec2 vBS; uniform sampler2D uBark, uBarkN;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        // (round it: as many times as its girth at the foot holds a hand-span of bark plates, at least twice)
        float bN = max(2.0, floor(6.2832 * 0.3 * vBS.x / 0.55 + 0.5));
        float bA = atan(vBLocal.z, vBLocal.x), bA2 = atan(-vBLocal.z, -vBLocal.x);
        vec2 bUv = vec2(bA / 6.2832 * bN, vBLocal.y * vBS.y / 0.75);
        // (the slope of the angle across the pixel, from whichever of two angles has no seam here: where the wrap meets
        //  itself, one jumps a whole turn and would blur the bark to a grey line)
        vec2 bD1 = vec2(dFdx(bA), dFdy(bA)), bD2 = vec2(dFdx(bA2), dFdy(bA2));
        vec2 bDa = (abs(bD1.x) + abs(bD1.y) < abs(bD2.x) + abs(bD2.y) ? bD1 : bD2) * bN / 6.2832;
        vec2 bGx = vec2(bDa.x, dFdx(bUv.y)), bGy = vec2(bDa.y, dFdy(bUv.y));
        vec3 bC = textureGrad(uBark, bUv, bGx, bGy).rgb;
        #ifdef BARK_BIRCH
          diffuseColor.rgb *= bC * 1.06;
          // (and at its foot the white gives way to the old tree's dark, cracked bark, ragged at its upper edge)
          float bH = vBLocal.y * vBS.y;
          diffuseColor.rgb *= mix(vec3(0.3, 0.27, 0.24), vec3(1.0), smoothstep(0.2, 0.9 + 0.35 * sin(bA * 3.0 + 1.0) + 0.2 * sin(bA * 7.0), bH));
        #else
          // (as a change about the bark's own mean — its linear mean, as the sample is: divided by the mean as stored, in
          //  sRGB, every trunk came out a third as bright as it should, and blue: navy-black pines and spruces)
          diffuseColor.rgb *= mix(vec3(1.0), bC / vec3(0.121, 0.088, 0.063), 0.9);
        #endif`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          vec3 bq0 = dFdx(-vViewPosition), bq1 = dFdy(-vViewPosition); vec2 bs0 = bGx, bs1 = bGy;
          vec3 bq1p = cross(bq1, normal), bq0p = cross(normal, bq0);
          vec3 bT = bq1p * bs0.x + bq0p * bs1.x, bB = bq1p * bs0.y + bq0p * bs1.y;
          float bDet = max(dot(bT, bT), dot(bB, bB)), bSc = bDet == 0.0 ? 0.0 : inversesqrt(bDet);
          vec3 bMap = textureGrad(uBarkN, bUv, bGx, bGy).xyz * 2.0 - 1.0; bMap.xy *= 1.3 * faceDirection;
          #ifdef BARK_BIRCH
            bMap.xy *= 0.25;   // (a birch's bark is smooth: only a little of the pine's relief, for its papery unevenness)
          #endif
          normal = normalize(mat3(bT * bSc, bB * bSc, normal) * bMap);
        }`);
  }, birch ? "birch" : "bark");
  material.needsUpdate = true;
  return material;
}
addBark(TREE.trunkMat); addBark(TREE.birchMat, true);
for (const k of ["trunkMat", "birchMat", "spruceMat", "pineMat", "leafMat", "oakMat", "acaciaMat", "jungleMat", "scrubMat", "palmMat", "palmTrunkMat"]) addSway(TREE[k]);
// a palm's frond: a long leaf arched up and over and drooping at its tip, its leaflets a narrow blade either side
function frondGeo() {
  const P = [], I = [], C = [], N = 9;
  for (let i = 0; i <= N; i++) {
    const k = i / N, x = k, y = Math.sin(k * Math.PI * 0.8) * 0.32 - k * k * 0.55, w = 0.17 * (1 - k * 0.85) + 0.015;
    P.push(x, y - 0.03, -w, x, y + 0.02, 0, x, y - 0.03, w);
    const sh = 0.75 + k * 0.25; C.push(sh, sh, sh, sh, sh, sh, sh, sh, sh);
  }
  for (let i = 0; i < N; i++) { const a = i * 3; I.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}

// a spruce's tiers, low and wide to high and narrow: [height fraction, width fraction, tier height]
const SPRUCE_TIERS = [[0.14, 1.0, 0.3], [0.26, 0.86, 0.28], [0.38, 0.72, 0.26], [0.5, 0.58, 0.24], [0.62, 0.44, 0.22], [0.73, 0.3, 0.2], [0.83, 0.17, 0.17]];

// A single tree as its own group, pivoted at the base so it can fall.
export function makeSpruce(h = 9, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(TREE.trunk, TREE.trunkMat); trunk.scale.set(1.1, h * 0.55, 1.1); g.add(trunk);
  for (const [y, wf, th] of SPRUCE_TIERS) {
    const c = new THREE.Mesh(TREE.cone, TREE.spruceMat);
    const w = wf * h * 0.26 * r.range(0.9, 1.1);
    c.scale.set(w, h * th, w);
    c.position.y = h * y;
    c.rotation.set(r.range(-0.05, 0.05), r() * TAU, r.range(-0.05, 0.05));
    g.add(c);
  }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// Instanced forest: returns meshes to add; `list` is [{x,y,z,h,kind,rot}]
export function forestInstances(list, far = false) {
  const CONE = far ? TREE.coneFar : TREE.cone, BLOB = far ? TREE.blobFar : TREE.blob;
  // (far off, a spruce is four tiers rather than seven, each a little deeper)
  const TIERS = far ? [0, 2, 4, 6].map(i => { const [y, w, th] = SPRUCE_TIERS[i]; return [y, w, th * 1.55]; }) : SPRUCE_TIERS;
  const dummy = new THREE.Object3D();
  const kinds = { spruce: [], pine: [], birch: [], oak: [], acacia: [], jungle: [], palm: [], scrub: [] };
  for (const t of list) (kinds[t.kind] || kinds.spruce).push(t);
  const out = [];
  const col = new THREE.Color();
  // no two trees quite the same green
  const tint = (m, i, hex, seed, dl = 0.07, dh = 0.02) => {
    const a = Math.sin(seed * 12.9898) * 43758.5453, f = a - Math.floor(a);
    const b = Math.sin(seed * 78.233) * 12543.123, g = b - Math.floor(b);
    col.set(0xffffff).offsetHSL((g - 0.5) * dh, 0, (f - 0.5) * dl * 2);
    m.setColorAt(i, col);
  };
  const nTr = kinds.spruce.length + kinds.pine.length + kinds.oak.length + kinds.acacia.length + kinds.jungle.length;
  const trunks = new THREE.InstancedMesh(swayGeo(TREE.trunk, nTr), TREE.trunkMat, nTr);
  const birchTr = new THREE.InstancedMesh(swayGeo(TREE.trunk, kinds.birch.length), TREE.birchMat, kinds.birch.length);
  // (each piece of a tree gets the tree's own sway: its foot, its height, its beat)
  const sway = (m, i, t) => { const a = m.geometry.attributes.aSway.array; a[i * 3] = t.y - 0.2; a[i * 3 + 1] = t.h; a[i * 3 + 2] = (t.x * 0.37 + t.z * 0.61) % 6.283; };
  let ti = 0;
  const NT = TIERS.length;
  const spruceC = new THREE.InstancedMesh(swayGeo(CONE, kinds.spruce.length * NT), TREE.spruceMat, kinds.spruce.length * NT);
  let si = 0;
  for (const t of kinds.spruce) {
    const lean = Math.sin(t.rot * 3.7) * 0.03;
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(lean, t.rot, 0); dummy.scale.set(1.1, t.h * 0.55, 1.1); dummy.updateMatrix();
    sway(trunks, ti, t); trunks.setMatrixAt(ti++, dummy.matrix); (t.slots ??= []).push([trunks, ti - 1]);
    const seed = t.x * 0.37 + t.z * 1.13;
    for (let i = 0; i < NT; i++) {
      const [y, wf, th] = TIERS[i];
      const w = wf * t.h * 0.26 * (1 + Math.sin(seed + i * 2.1) * 0.07);
      dummy.position.set(t.x + Math.sin(t.rot) * lean * t.h * y, t.y + t.h * y, t.z + Math.cos(t.rot) * lean * t.h * y);
      dummy.scale.set(w, t.h * th, w); dummy.rotation.set(0, t.rot + i * 1.7, 0); dummy.updateMatrix();
      sway(spruceC, si, t); spruceC.setMatrixAt(si, dummy.matrix); t.slots.push([spruceC, si]);
      tint(spruceC, si++, 0, seed);
    }
  }
  // Scots pine: a tall bare trunk and a flat, broken crown
  // (the crown the top third of it: a flat-topped head, and boughs standing out from the trunk under it, each its own
  //  flat cloud of needles — not one blob on a stick)
  const PN = 7, pineB = new THREE.InstancedMesh(swayGeo(BLOB, kinds.pine.length * PN), TREE.pineMat, Math.max(1, kinds.pine.length * PN));
  // (and each of those clouds borne on its own limb out of the trunk, in the trunk's bark: they hung in the air beside it)
  const pineL = new THREE.InstancedMesh(swayGeo(TREE.limb, kinds.pine.length * (PN - 1)), TREE.trunkMat, Math.max(1, kinds.pine.length * (PN - 1)));
  const _ld = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  let pi = 0, pl = 0;
  for (const t of kinds.pine) {
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(Math.sin(t.rot * 4.1) * 0.04, t.rot, 0); dummy.scale.set(1.0, t.h * 0.9, 1.0); dummy.updateMatrix();
    sway(trunks, ti, t); trunks.setMatrixAt(ti++, dummy.matrix); (t.slots ??= []).push([trunks, ti - 1]);
    const seed = t.x * 0.53 + t.z * 0.91;
    for (let i = 0; i < PN; i++) {
      const a = t.rot + i * 2.2 + Math.sin(seed + i) * 0.4, rad = i === 0 ? 0 : t.h * (0.09 + (i % 3) * 0.035);
      const w = t.h * (i === 0 ? 0.2 : 0.12 + (i % 2) * 0.03);
      const hy = i === 0 ? 0.9 : 0.66 + ((i * 0.37 + Math.sin(seed * 3 + i) * 0.1) % 0.24);
      dummy.position.set(t.x + Math.cos(a) * rad, t.y + t.h * hy, t.z + Math.sin(a) * rad);
      dummy.scale.set(w, w * 0.42, w * 0.85); dummy.rotation.set(0, a, 0); dummy.updateMatrix();
      sway(pineB, pi, t); pineB.setMatrixAt(pi, dummy.matrix); t.slots.push([pineB, pi]);
      tint(pineB, pi++, 0, seed);
      if (i > 0) {
        // (from the trunk a little below the cloud, rising out to its middle; thinner the higher up the tree)
        const y0 = t.y + t.h * hy - w * 0.35, ex = Math.cos(a) * rad * 0.92, ez = Math.sin(a) * rad * 0.92, ey = w * 0.3;
        _ld.set(ex, ey, ez); const L = _ld.length(); _ld.normalize();
        dummy.position.set(t.x, y0, t.z); dummy.quaternion.setFromUnitVectors(_up, _ld);
        const th = 0.09 + t.h * 0.006 * (1.1 - hy); dummy.scale.set(th, L, th); dummy.updateMatrix();
        sway(pineL, pl, t); pineL.setMatrixAt(pl, dummy.matrix); t.slots.push([pineL, pl++]);
      }
    }
  }
  // birch: a pale trunk and a loose, many-clumped crown
  // (nine smaller clumps up a tall oval, widest a little below the middle: six big balls round a trunk stood like a
  //  lollipop, or two of them like a pair of ears)
  const BN = 9, leaves = new THREE.InstancedMesh(swayGeo(BLOB, kinds.birch.length * BN), TREE.leafMat, Math.max(1, kinds.birch.length * BN));
  let li = 0, bi = 0;
  for (const t of kinds.birch) {
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(0.5, t.h * 0.78, 0.5); dummy.updateMatrix();
    sway(birchTr, bi, t); birchTr.setMatrixAt(bi++, dummy.matrix); (t.slots ??= []).push([birchTr, bi - 1]);
    const seed = t.x * 0.71 + t.z * 0.29;
    for (let i = 0; i < BN; i++) {
      const f = i / (BN - 1), bulge = Math.sin(Math.PI * (0.2 + 0.72 * f)), jit = (Math.sin(seed * 3.1 + i * 7.7) * 0.5 + 0.5);
      const a = t.rot + i * 2.4 + Math.sin(seed + i) * 0.5, rad = i === BN - 1 ? 0 : t.h * (0.025 + 0.065 * bulge) * (0.7 + 0.6 * jit);
      dummy.position.set(t.x + Math.cos(a) * rad, t.y + t.h * (0.5 + f * 0.46), t.z + Math.sin(a) * rad);
      const w = t.h * (0.065 + 0.05 * bulge) * (0.85 + 0.3 * jit); dummy.scale.set(w, w * 1.05, w); dummy.rotation.set(0, a, 0); dummy.updateMatrix();
      sway(leaves, li, t); leaves.setMatrixAt(li, dummy.matrix); t.slots.push([leaves, li]);
      tint(leaves, li++, 0, seed, 0.09, 0.03);
    }
  }
  // a crown of leaf clumps, of one kind, for each tree of it: each clump [height fraction, out from the trunk (fraction
  // of the height), width (fraction), flattening]
  const crown = (list, mat, clumps, trunk) => {
    const m = new THREE.InstancedMesh(swayGeo(BLOB, list.length * clumps(0).length), mat, Math.max(1, list.length * clumps(0).length)); let n = 0;
    for (const t of list) {
      if (trunk) { const [sx, sy] = trunk; dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(Math.sin(t.rot * 5) * 0.04, t.rot, 0); dummy.scale.set(sx, t.h * sy, sx); dummy.updateMatrix(); sway(trunks, ti, t); trunks.setMatrixAt(ti++, dummy.matrix); (t.slots ??= []).push([trunks, ti - 1]); }
      const seed = t.x * 0.47 + t.z * 0.83;
      clumps(t).forEach(([hy, out, wf, flat], i) => {
        const a = t.rot + i * 2.39, w = t.h * wf * (1 + Math.sin(seed + i * 1.3) * 0.1);
        dummy.position.set(t.x + Math.cos(a) * out * t.h, t.y + t.h * hy, t.z + Math.sin(a) * out * t.h);
        dummy.scale.set(w, w * flat, w); dummy.rotation.set(0, a, 0); dummy.updateMatrix();
        sway(m, n, t); m.setMatrixAt(n, dummy.matrix); (t.slots ??= []).push([m, n]); tint(m, n++, 0, seed, 0.08, 0.03);
      });
    }
    m.count = n; return m;
  };
  // the oak: a stout trunk and a broad, rounded crown
  // (as broad as it's high, the crown coming down low on a short thick bole)
  const OAK = () => [[0.74, 0, 0.3, 0.75], [0.58, 0.23, 0.24, 0.7], [0.63, 0.25, 0.22, 0.7], [0.55, 0.24, 0.23, 0.68], [0.68, 0.21, 0.22, 0.75], [0.86, 0.1, 0.22, 0.7], [0.5, 0.27, 0.18, 0.62], [0.76, 0.2, 0.2, 0.72]];
  const oakC = crown(kinds.oak, TREE.oakMat, OAK, [1.45, 0.46]);
  // the acacia: a thin trunk, and its crown flat as a table, wide over the grass
  const ACA = () => [[0.66, 0, 0.42, 0.2], [0.62, 0.26, 0.3, 0.2], [0.64, 0.28, 0.28, 0.18], [0.6, 0.24, 0.26, 0.22], [0.68, 0.14, 0.26, 0.18]];
  const acaC = crown(kinds.acacia, TREE.acaciaMat, ACA, [0.65, 0.62]);
  // the rain forest's giant: a tall straight bole, the crown spread high up, a lower storey of leaves under it
  const JUN = () => [[0.95, 0, 0.2, 0.55], [0.9, 0.13, 0.17, 0.5], [0.92, 0.14, 0.16, 0.5], [0.88, 0.12, 0.16, 0.55], [0.55, 0.12, 0.11, 0.7], [0.45, 0.1, 0.1, 0.7]];
  const junC = crown(kinds.jungle, TREE.jungleMat, JUN, [1.35, 0.88]);
  // desert scrub: no trunk to speak of, a low tangle of grey-green
  const SCR = () => [[0.35, 0, 0.6, 0.7], [0.3, 0.3, 0.45, 0.65], [0.25, 0.32, 0.4, 0.6]];
  const scrC = crown(kinds.scrub, TREE.scrubMat, SCR, null);
  // the palm: a slender, leaning, ringed trunk, and a head of fronds arching out from the top
  const palmTr = new THREE.InstancedMesh(swayGeo(TREE.trunk, kinds.palm.length), TREE.palmTrunkMat, Math.max(1, kinds.palm.length));
  const fronds = new THREE.InstancedMesh(swayGeo(TREE.frond, kinds.palm.length * 9), TREE.palmMat, Math.max(1, kinds.palm.length * 9));
  let pti = 0, fi = 0;
  for (const t of kinds.palm) {
    const lean = 0.12 + Math.sin(t.rot * 3.1) * 0.08;
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(lean, t.rot, 0); dummy.scale.set(0.62, t.h, 0.62); dummy.updateMatrix();
    sway(palmTr, pti, t); palmTr.setMatrixAt(pti++, dummy.matrix); (t.slots ??= []).push([palmTr, pti - 1]);
    // (the top of the leaning trunk)
    const tx = t.x + Math.sin(t.rot) * Math.sin(lean) * t.h, tz = t.z + Math.cos(t.rot) * Math.sin(lean) * t.h, ty = t.y - 0.2 + Math.cos(lean) * t.h;
    const seed = t.x * 0.61 + t.z * 0.37;
    for (let i = 0; i < 9; i++) {
      const a = t.rot + i * (Math.PI * 2 / 9) + Math.sin(seed + i) * 0.2, L = t.h * (0.42 + Math.sin(seed * 2 + i) * 0.06);
      dummy.position.set(tx, ty, tz); dummy.rotation.set(0, a, (Math.sin(seed + i * 1.7) - 0.3) * 0.25); dummy.scale.set(L, L, L); dummy.updateMatrix();
      sway(fronds, fi, t); fronds.setMatrixAt(fi, dummy.matrix); t.slots.push([fronds, fi]); tint(fronds, fi++, 0, seed, 0.08, 0.03);
    }
  }
  palmTr.count = pti; fronds.count = fi;
  for (const m of [trunks, birchTr, spruceC, pineB, pineL, leaves, oakC, acaC, junC, scrC, palmTr, fronds]) { m.userData.far = far; m.castShadow = !far && m !== trunks && m !== birchTr && m !== palmTr && m !== pineL; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); out.push(m); }
  return out;
}

// ---------------------------------------------------------------------------
//  furniture and props, into a Builder
// ---------------------------------------------------------------------------
export const P = {
  crate(b, x, z, s = 1, y = 0, ry = 0) {
    // (real ones, scanned: a cargo lot of two long crates side by side, two high — the size of the old box; a small one
    //  alone where it's small)
    if (b.object) {
      const big = s >= 0.75, g = new THREE.Group();
      const parts = big ? [[-0.265, 0, 0.02], [0.265, 0, -0.03], [-0.25, 0.46, -0.02], [0.27, 0.46, 0.03]] : [[0, 0, 0]];
      let ok = true, k = 0;
      for (const [px, py, pz] of parts) {
        const m = modelCopy(big ? "prop_crate" : "prop_crate_s"); if (!m) { ok = false; break; }
        m.scene.position.set(px, py, pz); m.scene.rotation.y = (((x * 13.7 + z * 5.3 + k++ * 2.9) % 1) - 0.5) * 0.08; g.add(m.scene);
      }
      if (ok) {
        b.object(g, x, y, z, ry, 1);
        if (big) g.scale.set(s / 1.06, s / 0.92, s / 1.16); else g.scale.setScalar(s / 0.83);
        return;
      }
    }
    b.box(1 * s, 1 * s, 1 * s, x, y + 0.5 * s, z, 0x8a6a45, ry, 0.08);
    b.box(1.02 * s, 0.1 * s, 1.02 * s, x, y + 0.9 * s, z, 0x6a4f32, ry);
    b.box(1.02 * s, 0.1 * s, 1.02 * s, x, y + 0.1 * s, z, 0x6a4f32, ry);
  },
  barrel(b, x, z, y = 0) {
    // (a real one, scanned — its staves and iron hoops — where it's loaded)
    { const m = b.object && modelCopy("prop_barrel"); if (m) { b.object(m.scene, x, y, z, (x * 7.3 + z * 3.1) % 6.283, 0.82); return; } }
    b.add(new THREE.CylinderGeometry(0.34, 0.3, 0.95, 10), 0x7a5634, x, y + 0.475, z, 0, 0, 0, 1, 1, 1, 0.08);
    b.add(new THREE.CylinderGeometry(0.355, 0.355, 0.05, 10), 0x3a3a3a, x, y + 0.2, z);
    b.add(new THREE.CylinderGeometry(0.355, 0.355, 0.05, 10), 0x3a3a3a, x, y + 0.75, z);
  },
  // (a chest bound with iron, scanned — the size asked for)
  chest(b, x, z, ry = 0, w = 0.9) { const m = b.object && modelCopy("prop_chest"); if (!m) return false; b.object(m.scene, x, 0, z, ry, w / 0.93); return true; },
  sack(b, x, z, y = 0, ry = 0) {
    // (a grain sack: full and sagging at the bottom, slumped a little to one side, gathered at the neck and tied with
    //  cord, the tuft of its mouth above — hemp, its colour by where it stands)
    if (!SACK) {
      const prof = [[0, 0], [0.2, 0.005], [0.27, 0.04], [0.3, 0.12], [0.29, 0.3], [0.26, 0.42], [0.18, 0.52], [0.075, 0.585], [0.06, 0.6], [0.07, 0.63], [0.1, 0.68], [0.06, 0.7], [0, 0.69]];
      const g = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 14), P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const px = P.getX(i), py = P.getY(i), pz = P.getZ(i), a = Math.atan2(pz, px), k = 1 + 0.07 * Math.sin(a * 3 + py * 7) + 0.04 * Math.sin(a * 5 - py * 11);
        P.setXYZ(i, px * k * 1.08 + py * py * 0.12, py * (1 - 0.05 * Math.cos(a)), pz * k * 0.9);
      }
      g.computeVertexNormals(); SACK = g;
      SACK_CORD = new THREE.TorusGeometry(0.068, 0.01, 4, 10).rotateX(Math.PI / 2);
    }
    // (old hemp, greyed and grubby from the quay and the cart: tan, it read in the low sun as a shining gold bag)
    const hue = (Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 0.16), c = new THREE.Color(0x7a6e5c).offsetHSL(0, 0, (hue - 0.08) * 0.6);
    const sc = 0.9 + hue;
    b.add(SACK, c.getHex(), x, y, z, 0, ry, 0, sc, sc * 0.92, sc, 0.04);
    const cx = Math.cos(ry), sx = Math.sin(ry), off = 0.6 * 0.6 * 0.12 * sc;
    b.add(SACK_CORD, 0x5a4a32, x + cx * off, y + 0.6 * sc * 0.92, z - sx * off, 0, ry, 0, sc, sc, sc);
  },
  table(b, x, z, w = 2, d = 0.9, ry = 0) {
    // (a real trestle table where a long one stands, the length asked for)
    { const m = w >= 1.6 && b.object && modelCopy("prop_table"); if (m) { b.object(m.scene, x, 0, z, ry, 1); m.scene.scale.set(w / 2.56, 1, d / 0.93); return; } }
    const c = Math.cos(ry), s = Math.sin(ry);
    b.box(w, 0.08, d, x, 0.78, z, 0x6b4a2e, ry);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ox = lx * (w / 2 - 0.1), oz = lz * (d / 2 - 0.1);
      b.box(0.08, 0.76, 0.08, x + ox * c + oz * s, 0.38, z - ox * s + oz * c, 0x4f3620, ry);
    }
  },
  bench(b, x, z, w = 1.8, ry = 0) {
    // (a real one, scanned: a settle of worn painted boards with its back, the length asked for)
    { const m = b.object && modelCopy("prop_bench"); if (m) { b.object(m.scene, x, 0, z, ry, 1); m.scene.scale.set(w / 1.18, 1, 1); return; } }
    b.box(w, 0.06, 0.32, x, 0.46, z, 0x6b4a2e, ry);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const lx of [-1, 1]) { const ox = lx * (w / 2 - 0.12); b.box(0.06, 0.44, 0.28, x + ox * c, 0.22, z - ox * s, 0x4f3620, ry); }
  },
  // a bed: a frame of peeled logs, posts at the corners, a headboard of three rails; on it a fat straw tick, a sheet
  // turned down over a thick wool quilt that hangs over the sides, and a plump pillow (the bedding goes on b.cloth, when
  // the builder has one, so it's drawn as cloth and not as more timber)
  bed(b, x, z, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const cl = b.cloth || b, LOG = 0x7a5534, END = 0x9a7048;
    const post = (lx, lz, h) => { const [px, pz] = at(lx, lz); b.add(CYL8, LOG, px, h / 2, pz, 0, ry, 0, 0.13, h, 0.13); b.add(CYL8, END, px, h + 0.005, pz, 0, ry, 0, 0.12, 0.012, 0.12); };
    const rail = (lz, y, len = 1.0, r = 0.1) => { const [px, pz] = at(0, lz); b.add(CYL8, LOG, px, y, pz, 0, ry, Math.PI / 2, r, len, r); };
    const side = (lx, y) => { const [px, pz] = at(lx, 0); b.add(CYL8, LOG, px, y, pz, Math.PI / 2, ry, 0, 0.1, 1.98, 0.1); };
    post(-0.47, -0.97, 0.95); post(0.47, -0.97, 0.95); post(-0.47, 0.97, 0.55); post(0.47, 0.97, 0.55);
    rail(-0.97, 0.42); rail(-0.97, 0.62); rail(-0.97, 0.82); rail(0.97, 0.42); rail(0.97, 0.5);
    side(-0.47, 0.3); side(0.47, 0.3);
    // (slats under the tick)
    { const [px, pz] = at(0, 0); b.box(0.86, 0.04, 1.86, px, 0.31, pz, 0x6a4a2c, ry); }
    // the straw tick, rounded at its edges
    { const [px, pz] = at(0, 0.02); cl.add(RBOX, 0xcbb683, px, 0.42, pz, 0, ry, 0, 0.9, 0.2, 1.86); }
    // the quilt over the lower part, hanging down the sides, a band at its top turned back, and a darker check woven in
    { const [px, pz] = at(0, 0.36); cl.add(RBOX, 0x8e3d32, px, 0.47, pz, 0, ry, 0, 0.98, 0.2, 1.22); }
    for (const lz of [0.06, 0.46, 0.86]) { const [px, pz] = at(0, lz); cl.box(0.86, 0.203, 0.07, px, 0.47, pz, 0x6e2c24, ry); }
    { const [px, pz] = at(0, -0.24); cl.add(CYL8, 0xb4aa94, px, 0.56, pz, 0, ry, Math.PI / 2, 0.11, 0.97, 0.09); }
    // the pillow, plump, against the headboard
    { const [px, pz] = at(0, -0.72); cl.add(BALL, 0xb8ae98, px, 0.58, pz, 0, ry, 0, 0.62, 0.17, 0.34); }
  },
  // a straw pallet on the floor: a fat tick of straw, a grey-brown wool blanket with a stripe at its ends, a sack of a pillow
  // (the linen greyed and yellowed, slept in a winter: bright white, it glowed in a dark cabin)
  pallet(b, x, z, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c], cl = b.cloth || b;
    { const [px, pz] = at(0, 0); cl.add(RBOX, 0xa8925e, px, 0.09, pz, 0, ry, 0, 0.9, 0.18, 1.9); }
    // (a few straws sticking out of the ticking at the foot)
    for (const lx of [-0.3, -0.05, 0.22]) { const [px, pz] = at(lx, 0.94); b.add(CYL8, 0xd8c07a, px, 0.1, pz, 1.2, ry + lx, 0, 0.012, 0.16, 0.012); }
    { const [px, pz] = at(0, 0.32); cl.add(RBOX, 0x6e5e4c, px, 0.15, pz, 0, ry, 0, 0.94, 0.14, 1.22); }
    for (const lz of [-0.22, 0.86]) { const [px, pz] = at(0, lz); cl.box(0.86, 0.143, 0.08, px, 0.15, pz, 0x9a3a2c, ry); }
    { const [px, pz] = at(0, -0.68); cl.add(BALL, 0xa89e88, px, 0.22, pz, 0, ry, 0, 0.56, 0.14, 0.32); }
  },
  shelf(b, x, z, w = 1.6, ry = 0) {
    // an open case: sides, a back, four boards, and on them books, ledgers and boxes, each its own size and colour
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const WOOD = 0x5a3e28, DARK = 0x3e2a1a;
    { const [px, pz] = at(0, -0.17); b.box(w, 2.2, 0.04, px, 1.1, pz, DARK, ry); }
    for (const sx of [-1, 1]) { const [px, pz] = at(sx * (w / 2 - 0.03), 0); b.box(0.06, 2.2, 0.4, px, 1.1, pz, WOOD, ry); }
    { const [px, pz] = at(0, 0); b.box(w, 0.06, 0.42, px, 2.22, pz, WOOD, ry); }
    const COLS = [0x5c3a30, 0x2e3e5a, 0x5a4a22, 0x3e4a32, 0x4a2e22, 0x7a6a4a, 0x2a2622];   // (no bright red: an upright red reads as brick)
    let seed = Math.abs(Math.floor(x * 73 + z * 31)) + 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4; i++) {
      const y = 0.08 + i * 0.52;
      { const [px, pz] = at(0, 0); b.box(w - 0.1, 0.04, 0.38, px, y, pz, WOOD, ry); }
      // (along the board: a run of books, now and then a gap, a box, or one lying flat)
      let lx = -w / 2 + 0.1;
      while (lx < w / 2 - 0.14) {
        const r = rnd();
        if (r < 0.08) { lx += 0.12; continue; }
        if (r < 0.16) { const bw = 0.22, [px, pz] = at(lx + bw / 2, 0.02); b.box(bw, 0.16, 0.26, px, y + 0.1, pz, 0x7a5a3a, ry); lx += bw + 0.03; continue; }
        if (r < 0.22) { const [px, pz] = at(lx + 0.14, 0.02); b.box(0.28, 0.05, 0.22, px, y + 0.045, pz, COLS[Math.floor(rnd() * COLS.length)], ry); b.box(0.26, 0.05, 0.2, px, y + 0.095, pz, COLS[Math.floor(rnd() * COLS.length)], ry); lx += 0.32; continue; }
        const bw = 0.04 + rnd() * 0.05, bh = 0.24 + rnd() * 0.16, [px, pz] = at(lx + bw / 2, 0.02 + rnd() * 0.03);
        b.box(bw, bh, 0.24 + rnd() * 0.06, px, y + 0.02 + bh / 2, pz, COLS[Math.floor(rnd() * COLS.length)], ry);
        lx += bw + 0.004;
      }
    }
  },

  hearth(b, x, z, ry = 0) {
    b.box(1.8, 1.2, 0.8, x, 0.6, z, 0x6e665e, ry, 0.05);
    b.box(1.2, 0.8, 0.6, x + Math.sin(ry) * 0.12, 0.4, z + Math.cos(ry) * 0.12, 0x1a1512, ry);
    b.box(2.0, 0.14, 0.95, x, 1.25, z, 0x5a4e44, ry);
    b.box(1.0, 1.9, 0.6, x - Math.sin(ry) * 0.1, 2.3, z - Math.cos(ry) * 0.1, 0x6e665e, ry, 0.05);
  },
  cart(b, x, z, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    b.box(1.5, 0.12, 2.6, x, 0.75, z, 0x7a5a3a, ry);
    b.box(1.5, 0.5, 0.08, x + 1.26 * s, 1.0, z + 1.26 * c, 0x6a4a2e, ry);
    b.box(1.5, 0.5, 0.08, x - 1.26 * s, 1.0, z - 1.26 * c, 0x6a4a2e, ry);
    b.box(0.08, 0.5, 2.6, x + 0.71 * c, 1.0, z - 0.71 * s, 0x6a4a2e, ry);
    b.box(0.08, 0.5, 2.6, x - 0.71 * c, 1.0, z + 0.71 * s, 0x6a4a2e, ry);
    for (const sd of [-1, 1]) b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), 0x4a3526, x + sd * 0.82 * c, 0.5, z - sd * 0.82 * s, 0, ry, Math.PI / 2);
    b.box(0.1, 0.1, 1.6, x + 1.9 * s + 0.3 * c, 0.6, z + 1.9 * c - 0.3 * s, 0x5a4030, ry);
    b.box(0.1, 0.1, 1.6, x + 1.9 * s - 0.3 * c, 0.6, z + 1.9 * c + 0.3 * s, 0x5a4030, ry);
  },
  // a pile of logs, rows of four and three laid alternately, as high as it takes — real logs, bark and sawn ends
  logPile(x, z, n = 6, ry = 0, y = 0) {
    const L = [];
    let k = 0;
    for (let row = 0; k < n; row++) for (let i = 0, per = row % 2 ? 3 : 4; i < per && k < n; i++, k++) {
      const ox = (i - (per - 1) / 2) * 0.34;
      L.push({ x: ox, y: y + 0.16 + row * 0.29, z: 0, len: 2.2, r: 0.16, dir: "z" });
    }
    const m = makeLogs(L, k * 7 + 3); m.position.set(x, 0, z); m.rotation.y = ry;
    return m;
  },
};

// ---------------------------------------------------------------------------
//  logs: bark round the sides, sawn ends with their growth rings
// ---------------------------------------------------------------------------
// Both painted once, in code. A log is a cylinder whose side takes the bark
// (the furrows run along its length) and whose two ends take the end grain.
let _logMats = null;
function paint(size, fn) { const c = document.createElement("canvas"); c.width = c.height = size; fn(c.getContext("2d"), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// (a birch's logs are white: their own bark and their own pale ends)
const _logMatsK = {};
// (the logs as photographed, CC0: Poly Haven's pine bark round the sides — its colour, its normal map and its roughness
//  — and ambientCG's sawn rounds for the ends, two of them, each with its ring of bark; see tools/make_logtex.py. A log's
//  ends are one round or the other, by the log)
let _logReal = null;
function logTex(name, srgb = true, wrap = false) {
  const t = new THREE.TextureLoader().load("art/tex/" + name + ".jpg");
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1.6); }
  t.userData.shared = true; return t;
}
function logReal() {
  if (_logReal) return _logReal;
  if (typeof document === "undefined") return null;
  const side = new THREE.MeshStandardMaterial({ map: logTex("log_bark", true, true), normalMap: logTex("log_bark_n", false, true), roughnessMap: logTex("log_bark_r", false, true), roughness: 1, normalScale: new THREE.Vector2(1.4, 1.4) });
  side.userData.surface = "none";
  const caps = ["a", "b"].map(k => { const m = new THREE.MeshStandardMaterial({ map: logTex("log_end_" + k), normalMap: logTex("log_end_" + k + "_n", false), roughness: 0.82 }); m.userData.surface = "none"; return [side, m, m]; });
  return (_logReal = caps);
}
export function logMats(kind, v = 0) {
  if (kind === "birch") return _logMatsK.birch || (_logMatsK.birch = birchLogMats());
  // (in the fire: the bark charred black, the cut ends glowing)
  if (kind === "char") { const R = logReal(); if (R) return _logMatsK.char || (_logMatsK.char = (() => {
    const side = R[0][0].clone(); side.color = new THREE.Color(0x2c2622); side.roughness = 1;
    // (the ends glowing unevenly, along their rings and cracks, as a burning end does — not a flat orange disc)
    const end = R[0][1].clone(); end.color = new THREE.Color(0x1e1612); end.emissive = new THREE.Color(0xe8581c); end.emissiveMap = end.map; end.emissiveIntensity = 0.6;
    return [side, end, end]; })()); }
  { const R = logReal(); if (R) return R[v & 1]; }
  if (_logMats) return _logMats;
  const r = rng(77);
  const bark = paint(256, (g, S) => {
    g.fillStyle = "#5e422c"; g.fillRect(0, 0, S, S);
    // furrows along the log, lighter ridges between, and here and there a crack across
    for (let i = 0; i < 70; i++) {
      const x = r() * S, w = 2 + r() * 7, l = r() < 0.5 ? 0.28 : 0.1;
      g.fillStyle = r() < 0.55 ? `rgba(30,18,10,${0.25 + r() * 0.35})` : `rgba(150,118,84,${l})`;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= S; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3 + (r() - 0.5) * 3, y);
      for (let y = S; y >= 0; y -= 16) g.lineTo(x + w + Math.sin(y * 0.05 + i) * 3, y);
      g.fill();
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(25,15,8,${0.3 + r() * 0.3})`; g.fillRect(r() * S, r() * S, 6 + r() * 16, 1.5 + r() * 1.5); }
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "200,170,130"},${r() * 0.12})`; g.fillRect(r() * S, r() * S, 1, 2 + r() * 3); }
  });
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.repeat.set(2, 2);
  const end = paint(256, (g, S) => {
    const c = S / 2;
    const grd = g.createRadialGradient(c, c, 4, c, c, c);
    grd.addColorStop(0, "#c49a64"); grd.addColorStop(0.75, "#d9b47e"); grd.addColorStop(0.88, "#c79a60"); grd.addColorStop(0.9, "#4a3322"); grd.addColorStop(1, "#3a281a");
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    // growth rings, a little off round, closer toward the bark
    for (let k = 1; k < 22; k++) {
      const rad = c * 0.86 * Math.pow(k / 22, 0.8);
      g.strokeStyle = `rgba(120,78,40,${0.25 + r() * 0.3})`; g.lineWidth = 1 + r() * 1.4;
      g.beginPath(); for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2, q = rad * (1 + Math.sin(t * 3 + k) * 0.02); a ? g.lineTo(c + Math.cos(t) * q, c + Math.sin(t) * q) : g.moveTo(c + Math.cos(t) * q, c + Math.sin(t) * q); } g.stroke();
    }
    // the pith, and a check or two splitting out from it
    g.fillStyle = "#7a5230"; g.beginPath(); g.arc(c, c, 3, 0, 7); g.fill();
    g.strokeStyle = "rgba(60,36,18,0.7)"; g.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) { const t = r() * 7; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(t) * c * 0.6, c + Math.sin(t) * c * 0.6); g.stroke(); }
  });
  const side = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 });
  const cap = new THREE.MeshStandardMaterial({ map: end, roughness: 0.85 });
  bark.userData.shared = end.userData.shared = true;
  return (_logMats = [side, cap, cap]);
}
function birchLogMats() {
  const r = rng(91);
  const bark = paint(256, (g, S) => {
    g.fillStyle = "#ece8de"; g.fillRect(0, 0, S, S);
    // the black marks across the white: lenticels in dashes, and a dark knot or two where branches were
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(28,26,24,${0.45 + r() * 0.45})`; g.fillRect(r() * S, r() * S, 1.5 + r() * 2.5, 6 + r() * 22); }
    for (let i = 0; i < 4; i++) { const x = r() * S, y = r() * S, w = 8 + r() * 12; g.fillStyle = "rgba(34,30,28,0.85)"; g.beginPath(); g.moveTo(x, y - w); g.lineTo(x + w * 0.6, y); g.lineTo(x, y + w); g.lineTo(x - w * 0.6, y); g.fill(); }
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "120,115,105" : "255,255,250"},${r() * 0.18})`; g.fillRect(r() * S, r() * S, 2 + r() * 3, 1); }
  });
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.repeat.set(2, 2);
  const end = paint(256, (g, S) => {
    const c = S / 2, grd = g.createRadialGradient(c, c, 4, c, c, c);
    grd.addColorStop(0, "#d8c49e"); grd.addColorStop(0.8, "#efe2c4"); grd.addColorStop(0.9, "#e6d8b8"); grd.addColorStop(0.93, "#f2efe8"); grd.addColorStop(1, "#d8d4ca");
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    for (let k = 1; k < 18; k++) { const rad = c * 0.86 * Math.pow(k / 18, 0.8); g.strokeStyle = `rgba(170,140,100,${0.15 + r() * 0.2})`; g.lineWidth = 1 + r(); g.beginPath(); g.arc(c, c, rad, 0, 7); g.stroke(); }
    g.fillStyle = "#a07a50"; g.beginPath(); g.arc(c, c, 3, 0, 7); g.fill();
  });
  bark.userData.shared = end.userData.shared = true;
  const side = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.8 }), cap = new THREE.MeshStandardMaterial({ map: end, roughness: 0.85 });
  return [side, cap, cap];
}
// (a log as a log is: not a turned post, but thicker at its butt end, uneven in its girth, swelling at a knot or two;
//  the cut ends follow its outline. The bark and end-grain textures lie on it as before)
const LOG_GEO = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 20, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    let k = 1 + 0.035 * Math.sin(3 * a + y * 4) + 0.022 * Math.sin(5 * a - y * 9 + 1) + 0.012 * Math.sin(9 * a + 2);
    k += 0.05 * Math.exp(-((y - 0.18) ** 2) * 160) * Math.max(0, Math.cos(a - 1.2)) + 0.04 * Math.exp(-((y + 0.27) ** 2) * 200) * Math.max(0, Math.cos(a + 2));
    k *= 1.05 - (y + 0.5) * 0.1;
    // (and no trunk grows quite straight: a gentle sweep along it, the sawn ends left square)
    p.setXYZ(i, x * k + 0.22 * (1 - 4 * y * y) + 0.06 * Math.sin(y * 9), y, z * k);
  }
  g.computeVertexNormals(); g._shared = true; return g;
})();
// many logs in one draw: [{x,y,z,len,r,dir:"x"|"z"}], each a touch uneven
// ---- a stump: no two alike, and each kind its own. A spruce's (the brown fir) dark red-brown and scaly, its roots
// spread shallow; a pine's thick-plated, grey at the foot and fox-orange above, the cut face warm and beaded with resin,
// a few stout roots going down; a birch's slim and low, white with black marks, its bark peeling in curls at the cut,
// the face pale and often gone dark at the heart. Each from a seed, so the same tree leaves the same stump ----
const RING_TEX = {}, BARK_TEX = {};
const STUMP_KIND = {
  spruce: { face: "#d8b884", ring: [120, 78, 40], rim: "#33251b", r: 0.24, h: [0.22, 0.6], roots: [3, 6], rootK: 1.0 },
  pine:   { face: "#e2b676", ring: [150, 92, 40], rim: "#33251b", r: 0.26, h: [0.3, 0.7], roots: [2, 4], rootK: 1.25, resin: true },
  birch:  { face: "#efe2c4", ring: [180, 150, 110], rim: "#f2efe8", r: 0.17, h: [0.15, 0.42], roots: [2, 4], rootK: 0.8, curls: true, rot: 0.55 },
  oak:    { face: "#d4b07a", ring: [130, 90, 50], rim: "#33251b", r: 0.34, h: [0.3, 0.6], roots: [4, 6], rootK: 1.35 },
  acacia: { face: "#caa070", ring: [140, 90, 50], rim: "#33251b", r: 0.17, h: [0.2, 0.45], roots: [2, 3], rootK: 0.9 },
  jungle: { face: "#e0c290", ring: [150, 110, 70], rim: "#33251b", r: 0.46, h: [0.4, 0.9], roots: [5, 7], rootK: 1.9 },
  palm:   { face: "#c8b28a", ring: [150, 130, 100], rim: "#4e4536", r: 0.15, h: [0.3, 0.6], roots: [0, 0], rootK: 0.6 },
  scrub:  { face: "#c0a274", ring: [130, 100, 70], rim: "#5a4a38", r: 0.07, h: [0.08, 0.16], roots: [0, 0], rootK: 0.5 },
};
function ringTex(v, kind) {
  const key = kind + v; if (RING_TEX[key]) return RING_TEX[key];
  const K = STUMP_KIND[kind] || STUMP_KIND.spruce;
  let sd = v * 9301 + 49297 + kind.length * 77; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
  const cx = 64 + (rnd() - 0.5) * 18, cy = 64 + (rnd() - 0.5) * 18;
  x.fillStyle = K.face; x.fillRect(0, 0, 128, 128);
  // the rings, each year its own width, dark latewood between pale
  let r = 2 + rnd() * 3; const n = 14 + Math.floor(rnd() * 16), [R, Gc, B] = K.ring;
  for (let i = 0; i < n && r < 92; i++) { x.strokeStyle = `rgba(${R + rnd() * 30},${Gc + rnd() * 20},${B + rnd() * 15},${(kind === "birch" ? 0.25 : 0.45) + rnd() * 0.35})`; x.lineWidth = 0.8 + rnd() * 1.4; x.beginPath(); x.ellipse(cx, cy, r, r * (0.92 + rnd() * 0.12), rnd(), 0, Math.PI * 2); x.stroke(); r += 2 + rnd() * 4.5; }
  // the heart: darker; in a birch, often rotten through
  const heart = kind === "birch" && rnd() < (K.rot || 0) ? 26 + rnd() * 14 : 14;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, heart); g.addColorStop(0, kind === "birch" && heart > 20 ? "rgba(70,44,26,0.9)" : "rgba(110,64,30,0.7)"); g.addColorStop(1, "rgba(110,64,30,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // a pine's resin, welling up in amber beads
  if (K.resin) for (let k = 0; k < 5 + rnd() * 6; k++) { const a = rnd() * 6.28, d = 20 + rnd() * 38; x.fillStyle = `rgba(${200 + rnd() * 40},${140 + rnd() * 40},40,0.85)`; x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + rnd() * 2.5, 0, 6.28); x.fill(); }
  x.strokeStyle = "rgba(50,30,15,0.8)"; x.lineWidth = 1.5;
  for (let k = 0, m = Math.floor(rnd() * 3); k < m; k++) { const a = rnd() * Math.PI * 2, l = 25 + rnd() * 35; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); }
  x.strokeStyle = "rgba(90,60,30,0.22)"; x.lineWidth = 2;
  for (let k = 0; k < 6; k++) { const yy = 20 + rnd() * 88; x.beginPath(); x.moveTo(0, yy); x.lineTo(128, yy + (rnd() - 0.5) * 20); x.stroke(); }
  // the bark round the edge: a pine's thick, a birch's thin and white
  x.strokeStyle = K.rim; x.lineWidth = kind === "pine" ? 10 : kind === "birch" ? 4 : 7; x.beginPath(); x.arc(64, 64, 61, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return RING_TEX[key] = t;
}
// the bark, wrapped round the stump
function barkTex(kind, v) {
  const key = kind + v; if (BARK_TEX[key]) return BARK_TEX[key];
  let sd = v * 7919 + 104729 + kind.length * 31; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const x = c.getContext("2d");
  if (kind === "birch") {
    x.fillStyle = "#ebe7dd"; x.fillRect(0, 0, 256, 128);
    // grey shading and the black marks across: the lenticels, and dark diamonds where branches were
    for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(30,28,26,${0.5 + rnd() * 0.4})`; x.fillRect(rnd() * 256, rnd() * 128, 4 + rnd() * 18, 1 + rnd() * 2); }
    for (let k = 0; k < 3; k++) { const px = rnd() * 256, py = 30 + rnd() * 98, w = 10 + rnd() * 16; x.fillStyle = "rgba(34,30,28,0.9)"; x.beginPath(); x.moveTo(px - w, py); x.lineTo(px, py - w * 0.6); x.lineTo(px + w, py); x.lineTo(px, py + w * 0.6); x.fill(); }
    // (darker and rougher at the very foot)
    const gr = x.createLinearGradient(0, 128, 0, 80); gr.addColorStop(0, "rgba(40,36,32,0.75)"); gr.addColorStop(1, "rgba(40,36,32,0)"); x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  } else if (kind === "pine") {
    // plates of bark between deep furrows: grey-brown at the foot, fox-orange higher up
    const gr = x.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, "#5e4a3c"); gr.addColorStop(0.6, "#7a5038"); gr.addColorStop(1, "#b0602e"); x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
    for (let k = 0; k < 40; k++) { const px = rnd() * 256, py = rnd() * 128, w = 12 + rnd() * 22, h = 8 + rnd() * 18; x.fillStyle = `rgba(${150 + rnd() * 60},${80 + rnd() * 40},${40 + rnd() * 20},${0.35 + rnd() * 0.3})`; x.fillRect(px, py, w, h); }
    x.strokeStyle = "rgba(30,18,10,0.85)"; x.lineWidth = 2.5;
    for (let k = 0; k < 18; k++) { let px = rnd() * 256; x.beginPath(); x.moveTo(px, 128); for (let y = 128; y > 0; y -= 12) { px += (rnd() - 0.5) * 8; x.lineTo(px, y); } x.stroke(); }
  } else if (kind === "palm") {
    // a palm's: grey-brown, ringed round where the old fronds fell
    x.fillStyle = "#8a7a62"; x.fillRect(0, 0, 256, 128);
    for (let y = 4; y < 128; y += 9 + rnd() * 4) { x.fillStyle = `rgba(60,50,38,${0.4 + rnd() * 0.3})`; x.fillRect(0, y, 256, 2 + rnd() * 2); }
  } else if (kind === "oak" || kind === "jungle" || kind === "acacia") {
    // grey and deep-ridged (an oak's), smoother and paler (the rain forest's), rough and dark (the acacia's)
    x.fillStyle = kind === "jungle" ? "#8a867a" : kind === "acacia" ? "#4e4034" : "#5a524a"; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = kind === "jungle" ? "rgba(60,58,50,0.35)" : "rgba(28,24,20,0.7)"; x.lineWidth = kind === "jungle" ? 1.5 : 3;
    for (let k = 0; k < 22; k++) { let px = rnd() * 256; x.beginPath(); x.moveTo(px, 128); for (let y = 128; y > 0; y -= 10) { px += (rnd() - 0.5) * 10; x.lineTo(px, y); } x.stroke(); }
  } else {
    // a spruce's: dark red-brown, in small round scales
    x.fillStyle = "#4e3626"; x.fillRect(0, 0, 256, 128);
    for (let k = 0; k < 220; k++) { const px = rnd() * 256, py = rnd() * 128; x.fillStyle = rnd() < 0.5 ? `rgba(110,70,46,${0.4 + rnd() * 0.4})` : `rgba(30,20,14,${0.35 + rnd() * 0.4})`; x.beginPath(); x.ellipse(px, py, 3 + rnd() * 5, 2 + rnd() * 3, rnd(), 0, 6.28); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return BARK_TEX[key] = t;
}
// what's left of the tree is the tree's own trunk: as thick as it was where the axe went through, the same nine
// facets turned the same way, and the same bark — the trunk's own material, not a stump's guess at one. (Each kind's
// trunk in the forest: the one trunk shape, widened by the first number and stood up by the second times its height)
const TRUNK_SHAPE = { spruce: [1.1, 0.55], pine: [1.0, 0.9], birch: [0.5, 0.78], oak: [1.45, 0.46], acacia: [0.65, 0.62], jungle: [1.35, 0.88], palm: [0.62, 1] };
const _stumpBark = {};
function stumpBark(kind) {
  const src = kind === "birch" ? TREE.birchMat : kind === "palm" ? TREE.palmTrunkMat : TREE.trunkMat;
  return _stumpBark[kind] ??= (m => src === TREE.trunkMat ? addBark(m) : src === TREE.birchMat ? addBark(m, true) : m)(addDetail(new THREE.MeshStandardMaterial({ color: src.color.clone(), roughness: src.roughness, vertexColors: true }), { ...src.userData.detail }));
}
// (the trunk's shading: darker at its foot, as the tree's own vertex colours have it)
function trunkShade(geo, y0, span) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = 0.62 + Math.max(0, Math.min(1, (p.getY(i) + y0) / span)) * 0.45; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geo;
}
export function makeStump(t, kind = "spruce") {
  if (!STUMP_KIND[kind]) kind = "spruce";
  const K = STUMP_KIND[kind], TS = TRUNK_SHAPE[kind];
  let sd = Math.abs(Math.floor((t.x || 0) * 73.1 + (t.z || 0) * 191.7)) + 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const big = Math.max(0.6, Math.min(1.6, (t.h || 10) / 10));
  const h = K.h[0] + rnd() * (K.h[1] - K.h[0]), tilt = 0.08 + rnd() * 0.3, dirA = rnd() * Math.PI * 2;
  // (the trunk's foot is 0.2 below the tree's point, the stump's 0.02: its radius where the stump stands and is cut)
  const span = TS ? (t.h || 10) * TS[1] : 1, at = y => TS ? TS[0] * (0.3 - 0.14 * Math.min(1, (y + 0.18) / span)) : K.r * big;
  const r = at(h), rb = at(0);
  const g = new THREE.Group();
  const bark = TS ? stumpBark(kind) : new THREE.MeshStandardMaterial({ map: barkTex(kind, Math.floor(rnd() * 4)), roughness: 0.95 });
  // (a pine's, a spruce's or an oak's cut face as photographed, the same sawn rounds as the logs' ends; the others painted)
  const fv = Math.floor(rnd() * 6), real = (kind === "spruce" || kind === "pine" || kind === "oak") && logReal();
  const face = real ? real[fv & 1][1] : new THREE.MeshStandardMaterial({ map: ringTex(fv, kind), roughness: 0.95 });
  const geo = new THREE.CylinderGeometry(r, rb * (TS ? 1.04 : 1.25), h, TS ? 9 : 12, 1);
  if (TS) trunkShade(geo, h / 2 + 0.18, span);
  // (the top cut on a slant, which way at random)
  const p = geo.attributes.position, cA = Math.cos(dirA), sA = Math.sin(dirA);
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + Math.tan(tilt) * (p.getX(i) * cA + p.getZ(i) * sA));
  geo.computeVertexNormals();
  const trunk = new THREE.Mesh(geo, [bark, face, bark]); trunk.position.y = h / 2; trunk.castShadow = trunk.receiveShadow = true; g.add(trunk);
  const topAt = (lx, lz) => h / 2 + Math.tan(tilt) * (lx * cA + lz * sA);
  // the hinge: torn fibres standing up along the high side, where it broke as it went over
  const pale = new THREE.MeshStandardMaterial({ color: kind === "birch" ? 0xece0c4 : kind === "pine" ? 0xe0b070 : 0xd2b07c, roughness: 0.9, flatShading: true });
  for (let k = 0, n = 3 + Math.floor(rnd() * 5); k < n; k++) {
    const a = dirA + (rnd() - 0.5) * 1.6, rr = r * (0.35 + rnd() * 0.55), sh = (kind === "birch" ? 0.04 : 0.05) + rnd() * 0.14;
    const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.01 + rnd() * 0.016, sh, 4), pale);
    sp.position.set(lx, topAt(lx, lz) + sh / 2 - 0.01, lz); sp.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4); trunk.add(sp);
  }
  // a birch's bark, peeling back in curls at the cut
  if (K.curls) {
    const white = new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.7, side: THREE.DoubleSide });
    for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) {
      const a = rnd() * 6.28, lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      const cu = new THREE.Mesh(new THREE.CylinderGeometry(0.018 + rnd() * 0.012, 0.018, 0.05 + rnd() * 0.05, 8, 1, true, 0, Math.PI * 1.4), white);
      cu.position.set(lx * 1.02, topAt(lx, lz) - 0.03, lz * 1.02); cu.rotation.set(Math.PI / 2, -a, 0); trunk.add(cu);
    }
  }
  // a pine's resin, run down the bark from the cut in a drip or two
  if (K.resin) {
    const amber = new THREE.MeshStandardMaterial({ color: 0xd8902a, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 });
    for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) {
      const a = rnd() * 6.28, lx = Math.cos(a) * r * 1.03, lz = Math.sin(a) * r * 1.03, len = 0.05 + rnd() * 0.1;
      const dr = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, len, 3, 6), amber); dr.position.set(lx, topAt(lx, lz) - len / 2 - 0.02, lz); trunk.add(dr);
    }
  }
  // the roots: swells running out and down into the ground — a spruce's many and shallow, a pine's few and stout
  const rootM = bark;
  for (let k = 0, n = K.roots[0] + Math.floor(rnd() * (K.roots[1] - K.roots[0] + 1)); k < n; k++) {
    const a = k / n * Math.PI * 2 + rnd() * 0.8, L = r * (0.8 + rnd() * 0.7) * K.rootK;
    // (rounded, not a spike: blunt where it dives into the ground, smooth-sided, drawn as the bark is)
    const rgeo = new THREE.CylinderGeometry(r * 0.07 * K.rootK, r * (0.42 + rnd() * 0.18) * K.rootK, L, 12, 3); if (TS) trunkShade(rgeo, -1, 1);
    { const rp = rgeo.attributes.position; for (let i = 0; i < rp.count; i++) { const y = rp.getY(i) / L + 0.5, k = 1 - 0.35 * y * (1 - y) * 4 * 0.5; rp.setX(i, rp.getX(i) * k); rp.setZ(i, rp.getZ(i) * k); } rgeo.computeVertexNormals(); }
    const rt = new THREE.Mesh(rgeo, rootM);
    // (the cone's tip turned out along the ground and a little down into it, its thick end against the trunk)
    rt.rotation.order = "YXZ"; rt.rotation.y = -a; rt.rotation.z = -(Math.PI / 2 + 0.18 + rnd() * 0.15); rt.scale.set(0.55, 1, 0.95);   // (flattened: a root spreads, it doesn't stand)
    rt.position.set(Math.cos(a) * (r * 0.7 + L * 0.45), 0.0, Math.sin(a) * (r * 0.7 + L * 0.45)); rt.castShadow = true; g.add(rt);
  }
  // (and, now and then, moss on the low side of a spruce or a pine)
  if (kind !== "birch" && rnd() < 0.4) { const ms = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4a6a2a, { surface: "needles" })); ms.scale.set(1.3, 0.35, 1); ms.position.set(-Math.cos(dirA) * r * 0.9, 0.04, -Math.sin(dirA) * r * 0.9); g.add(ms); }
  // (turned as the tree stood, so its facets carry on where the trunk's were)
  g.rotation.y = TS && t.rot != null ? t.rot : rnd() * 6.28;
  return g;
}
export function makeLogs(list, seed = 1, kind = null) {
  const r = rng(seed), o = new THREE.Object3D();
  // (each log's place worked out first, and which of the two sawn ends it has; then a draw for each)
  const M = list.map(l => {
    o.position.set(l.x, l.y, l.z);
    // (a log lies along x or z, or stands up: "y")
    o.rotation.set(l.dir === "z" ? Math.PI / 2 : 0, l.ry || 0, l.dir === "x" ? Math.PI / 2 : 0);
    o.rotateY(r() * Math.PI * 2);   // (each turned about its own length)
    const rr = l.r * (0.88 + r() * 0.24);
    o.scale.set(rr, l.len * (0.94 + r() * 0.1), rr);
    o.updateMatrix(); return { m: o.matrix.clone(), v: r() < 0.5 ? 0 : 1 };
  });
  const two = !kind && logReal();
  const draw = sub => {
    const m = new THREE.InstancedMesh(LOG_GEO, logMats(kind, sub.length ? sub[0].v : 0), sub.length);
    sub.forEach((q, i) => m.setMatrixAt(i, q.m)); m.castShadow = true; m.receiveShadow = true; return m;
  };
  if (!two) return draw(M);
  const g = new THREE.Group();
  for (const v of [0, 1]) { const sub = M.filter(q => q.v === v); if (sub.length) g.add(draw(sub)); }
  return g;
}

// ---------------------------------------------------------------------------
//  a moored ship: a hull, two masts, furled sails
// ---------------------------------------------------------------------------
export function makeShip(len = 18, seed = 3) {
  const r = rng(seed);
  const b = new Builder();
  const w = len * 0.28, dark = 0x3a2a1e;
  b.box(w, 1.8, len * 0.8, 0, 1.2, 0, 0x5a3e28, 0, 0.05);
  // bow wedge
  b.box(w * 0.707, 1.8, w * 0.707, 0, 1.2, len * 0.4, 0x5a3e28, Math.PI / 4);
  b.box(w * 0.707, 0.25, w * 0.707, 0, 2.15, len * 0.4, dark, Math.PI / 4);
  b.box(w + 0.1, 0.25, len * 0.8, 0, 2.15, 0, dark);
  b.box(w * 0.9, 1.4, len * 0.2, 0, 2.9, -len * 0.3, 0x6a4a30); // stern castle
  b.box(w + 0.12, 0.3, len * 0.8, 0, 0.35, 0, 0x2a2622);
  for (const [mz, mh] of [[len * 0.1, len * 0.9], [-len * 0.14, len * 0.72]]) {
    b.add(new THREE.CylinderGeometry(0.12, 0.18, mh, 8), 0x6a4a30, 0, 2 + mh / 2, mz);
    for (const yf of [0.45, 0.8]) {
      b.add(new THREE.CylinderGeometry(0.07, 0.07, w * 1.8, 6), 0x6a4a30, 0, 2 + mh * yf, mz, 0, 0, Math.PI / 2);
      b.add(new THREE.CylinderGeometry(0.2, 0.2, w * 1.6, 8), 0xd8ceb4, 0, 2 + mh * yf - 0.18, mz, 0, 0, Math.PI / 2, 1, 1, 1, 0.1);
    }
  }
  b.add(new THREE.CylinderGeometry(0.08, 0.1, len * 0.5, 6), 0x6a4a30, 0, 3, len * 0.55, -1.2, 0, 0);
  const m = b.build();
  const g = new THREE.Group(); g.add(m);
  g.userData.bob = r() * 10;
  return g;
}

// ---- a horse: a cavalry remount of the 1680s, shaped rather than boxed — the deep barrel and the rounded quarters,
// the shoulder and the thigh standing out of the side, a crested neck and a long, wedge-shaped head; legs that taper
// from forearm to cannon, with knee, fetlock and pastern; the hoof. Its coat by its seed: socks and a blaze or a star,
// as no two horses are marked alike. A trooper's saddle on it, the cloth under it bordered, pistol holsters at the
// pommel, the bridle and the bit, the stirrups hanging.
// facing +Z, standing on y = 0. { root, legs: [fl, fr, bl, br], neck, gait(dt, speed), strike(), rear(), lift, falls }
// — gait goes with the pace; falls is which hooves came down this frame (for the hoofbeats); strike() throws the head
// and surges forward under a rider's blow; rear() up on its hind legs (a pike in its chest); lift is how far the
// saddle rose with it (the rider goes up too)
const HSPH = new THREE.SphereGeometry(1, 14, 10), HTAPER = {}, HCONE = new THREE.ConeGeometry(1, 1, 6), HTOR = new THREE.TorusGeometry(1, 0.16, 5, 12);
const taper = (rt, rb, seg = 10) => HTAPER[rt + "," + rb] ??= new THREE.CylinderGeometry(rt, rb, 1, seg);
let HORSE_MAT = null;
const G_T = () => performance.now() / 1000;
// a horse: the real one (models/horse.glb, a draught horse sculpted and rigged by BlueMesh, CC BY 4.0) when it's loaded —
// its coat tinted to the colour asked for, walking and galloping on its own legs as fast as the horse goes — with the
// built one's workings kept underneath it (its gaits, its rearing, the lift of the saddle, the beat of its hooves for
// the sounds), unseen; else the built one, as it always was
// (the top of its back where the saddle goes, measured on the model: its height, and how far back of its middle)
const HORSE_BACK = 1.44, HORSE_SADDLE_Z = -0.12, HORSE_COLLAR_Z = 0.33;
const GREY_MAPS = new WeakMap();
function greyMap(t) {
  if (GREY_MAPS.has(t)) return GREY_MAPS.get(t);
  const im = t.image; if (!im || !im.width || typeof document === "undefined") return t;
  const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
  const c = cv.getContext("2d"); c.filter = "grayscale(1) contrast(0.85)"; c.drawImage(im, 0, 0);
  const g = new THREE.CanvasTexture(cv); g.colorSpace = t.colorSpace; g.flipY = t.flipY; g.wrapS = t.wrapS; g.wrapT = t.wrapT;
  GREY_MAPS.set(t, g); return g;
}
export function makeHorse(coat = 0x6a4428, seed = 1, opts = {}) {
  const H = makeBuiltHorse(coat, seed, opts), m = modelCopy("horse");
  if (!m || !m.animations.length) return H;
  H.root.traverse(o => { if (o.isMesh) o.visible = false; });
  const bod = H.root.children[0];
  bod.add(m.scene); H.model = m.scene;
  // (the coat: the sculpt is a chestnut; any other colour is that, tinted)
  // (a grey or a white is no tint of a chestnut: its coat is the same hair, the colour taken out, and then lightened)
  const want = new THREE.Color(coat), base = new THREE.Color(0x8a5232), hsl = want.getHSL({}), grey = hsl.s < 0.18;
  const tint = grey ? new THREE.Color(1, 1, 1).multiplyScalar(Math.min(2.2, 0.6 + hsl.l * 2.4)).multiply(want.clone().multiplyScalar(1 / Math.max(want.r, want.g, want.b, 0.01)))
    : (() => { const w = want.clone().convertLinearToSRGB(), b0 = base.clone().convertLinearToSRGB(), t = new THREE.Color(Math.min(1.5, w.r / b0.r), Math.min(1.5, w.g / b0.g), Math.min(1.5, w.b / b0.b)); return t.convertSRGBToLinear(); })();
  m.scene.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (grey && o.material.map) o.material.map = greyMap(o.material.map); o.material.color.multiply(tint); o.castShadow = true; o.receiveShadow = true; } });
  // (a riding horse's tack — the cloth and the saddle on its back; a draught horse's is its collar and traces, in the cart)
  if (!opts.draught) {
    const cloth = [0x7a2a22, 0x2a3a5a, 0x2a4a32, 0x6a5a2a][seed % 4];
    const tack = new THREE.Group(), cm = mat(cloth, { surface: "cloth", roughness: 0.95 }), lm = mat(0x3a2416, { surface: "none", roughness: 0.7 });
    // (the cloth a thin blanket over the back, just wider than the saddle; the saddle on it, high at the pommel and the
    //  cantle; the stirrup leathers down each side)
    const blanket = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), cm); blanket.scale.set(1.0, 0.45, 1.7); blanket.position.set(0, HORSE_BACK - 0.12, HORSE_SADDLE_Z); tack.add(blanket);
    const seat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), lm); seat.scale.set(0.95, 0.38, 1.35); seat.position.set(0, HORSE_BACK - 0.03, HORSE_SADDLE_Z); tack.add(seat);
    for (const z of [0.24, -0.25]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), lm); r.scale.set(1.6, 0.8, 0.6); r.position.set(0, HORSE_BACK + 0.04, HORSE_SADDLE_Z + z); tack.add(r); }
    for (const sd of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.4, 0.03), lm); st.position.set(sd * 0.27, HORSE_BACK - 0.27, HORSE_SADDLE_Z + 0.05); st.rotation.z = sd * 0.12; tack.add(st); }
    tack.traverse(o => { if (o.isMesh) o.castShadow = true; });
    bod.add(tack);
  } else {
    // (a cart horse's harness: the stuffed leather collar round the base of its neck, the wooden hames along it, and the
    //  traces from the hames back along its sides to the cart)
    const tack = new THREE.Group(), lm = mat(0x3a2416, { surface: "none", roughness: 0.75 }), wm = mat(0x6a4a2a, { surface: "wood" });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.065, 10, 22), lm); collar.scale.set(1, 1.35, 1); collar.position.set(0, HORSE_BACK - 0.02, HORSE_COLLAR_Z); collar.rotation.x = -0.8; tack.add(collar);
    for (const sd of [-1, 1]) {
      const hame = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.7, 6), wm); hame.position.set(sd * 0.27, HORSE_BACK - 0.02, HORSE_COLLAR_Z + 0.03); hame.rotation.x = -0.8; tack.add(hame);
      const trace = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 1.5), lm); trace.position.set(sd * 0.3, HORSE_BACK - 0.33, HORSE_COLLAR_Z - 0.78); trace.rotation.x = -0.05; tack.add(trace);
    }
    tack.traverse(o => { if (o.isMesh) o.castShadow = true; });
    bod.add(tack);
  }
  const mix = new THREE.AnimationMixer(m.scene), act = {};
  for (const c of m.animations) act[c.name] = mix.clipAction(c);
  let cur = null;
  const play = (n, ts) => { const a = act[n] || act.Walk; if (!a) return; if (a !== cur) { a.reset().play(); if (cur) a.crossFadeFrom(cur, 0.3, false); for (const o of Object.values(act)) if (o !== a && o !== cur) o.stop(); cur = a; } a.timeScale = ts; };
  const gait = H.gait;
  H.gait = (dt, speed) => {
    const ph = gait(dt, speed);
    // (its walk is made for a metre and a bit a second, its gallop for about eight)
    if (speed < 0.25) play("Idle", 1); else if (speed < 5) play("Walk", Math.max(0.5, Math.min(3, speed / 1.2))); else play("Run", Math.max(0.6, Math.min(1.8, speed / 8)));
    mix.update(dt);
    return ph;
  };
  return H;
}
function makeBuiltHorse(coat = 0x6a4428, seed = 1, { draught = false } = {}) {
  HORSE_MAT ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const rr = (() => { let s = (Math.imul(seed + 7, 2654435761) ^ 0x9e3779b9) >>> 0; const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; for (let i = 0; i < 4; i++) f(); return f; })();
  const c = new THREE.Color(coat), hide = coat;
  // (the mane, tail and lower legs: black on a bay, darker on the rest; a grey's go paler)
  const grey = c.r > 0.45 && Math.abs(c.r - c.b) < 0.08, bay = !grey && c.r > c.b * 1.3;
  const dark = grey ? 0xb8b4ac : bay ? 0x1c1612 : c.clone().multiplyScalar(0.55).getHex(), hoofC = 0x2a221c, white = 0xe8e2d6;
  const muz = c.clone().multiplyScalar(0.7).getHex(), leather = 0x3a2416, cloth = [0x7a2a22, 0x2a3a5a, 0x2a4a32, 0x6a5a2a][Math.floor(rr() * 4)], trim = 0xc8a050, iron = 0x6a6a68;
  const socks = [0, 1, 2, 3].map(() => rr() < 0.22), face = rr() < 0.3 ? "blaze" : rr() < 0.4 ? "star" : null;
  const parts = [];
  const B = () => { const b = new Builder(); parts.push(b); return b; };
  const e = (b, col, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => b.add(HSPH, col, x, y, z, rx, ry, rz, sx, sy, sz);
  const cyl = (b, col, rt, rb, len, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sz = 1) => b.add(taper(rt, rb), col, x, y, z, rx, ry, rz, sx, len, sz);
  const box = (b, col, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => b.add(BOXG, col, x, y, z, rx, ry, rz, w, h, d);
  const root = new THREE.Group(), bod = new THREE.Group(); root.add(bod);
  // ---- the body ----
  const body = B();
  e(body, hide, 0, 1.2, 0, 0.27, 0.32, 0.72);                       // the barrel
  e(body, hide, 0, 1.2, 0.54, 0.25, 0.33, 0.32);                    // the chest
  e(body, hide, 0, 1.02, 0.66, 0.19, 0.17, 0.14);                   // the breast
  e(body, hide, 0, 1.42, 0.46, 0.12, 0.12, 0.3);                    // the withers
  e(body, hide, 0, 1.26, -0.5, 0.29, 0.32, 0.38);                   // the quarters
  e(body, hide, 0, 1.42, -0.52, 0.2, 0.12, 0.32);                   // the croup
  e(body, hide, 0, 1.0, -0.02, 0.23, 0.16, 0.55);                   // the belly
  for (const s of [-1, 1]) {
    e(body, hide, s * 0.15, 1.17, 0.58, 0.11, 0.27, 0.18, -0.35);   // the shoulder
    e(body, hide, s * 0.155, 1.15, -0.56, 0.13, 0.3, 0.24, 0.25);   // the thigh
  }
  e(body, dark, 0, 1.38, -0.86, 0.06, 0.07, 0.1);                   // the dock
  if (draught) {
    // a draught horse's harness: the collar round its neck, the hames on it, the traces back along its sides to the
    //  cart, the saddle-pad and the breeching over its quarters
    b_ring(body, leather, 0, 1.34, 0.74, 0.27, 0, 1.25);
    for (const s of [-1, 1]) { box(body, iron, 0.03, 0.42, 0.04, s * 0.22, 1.34, 0.76, 0, 0, s * 0.15); box(body, leather, 0.03, 0.05, 1.5, s * 0.28, 1.12, -0.1); }
    box(body, leather, 0.42, 0.06, 0.3, 0, 1.53, 0.12);
    box(body, leather, 0.62, 0.05, 0.05, 0, 1.18, -0.82);
  } else {
    // the cloth, a soldier's shabraque: over the back and down each side, bordered
    box(body, cloth, 0.36, 0.025, 0.8, 0, 1.53, -0.03);
    for (const s of [-1, 1]) {
      box(body, cloth, 0.025, 0.42, 0.8, s * 0.262, 1.33, -0.03, 0, 0, s * 0.2);
      box(body, trim, 0.03, 0.035, 0.82, s * 0.302, 1.125, -0.03, 0, 0, s * 0.2);
      // the girth, the stirrup leather and its iron
      box(body, leather, 0.025, 0.36, 0.06, s * 0.27, 1.06, 0.2, 0, 0, s * 0.25);
      box(body, leather, 0.018, 0.4, 0.035, s * 0.33, 1.3, 0.06);
      b_ring(body, iron, s * 0.335, 1.08, 0.06, 0.055);
      // the pistol holsters, either side of the pommel, under their bearskin caps
      cyl(body, leather, 0.035, 0.05, 0.3, s * 0.2, 1.48, 0.42, 0.95, 0, s * 0.35);
      e(body, 0x1a1612, s * 0.22, 1.6, 0.34, 0.06, 0.05, 0.07);
    }
    box(body, leather, 0.42, 0.025, 0.06, 0, 0.88, 0.2);              // the girth under the belly
    // the saddle: the seat, the pommel before it and the cantle behind
    box(body, leather, 0.32, 0.05, 0.5, 0, 1.565, 0.0);
    e(body, leather, 0, 1.62, 0.25, 0.12, 0.07, 0.06);
    e(body, leather, 0, 1.635, -0.25, 0.16, 0.08, 0.05);
    box(body, leather, 0.44, 0.04, 0.035, 0, 1.24, 0.86, 0, 0, 0);   // the breastplate strap
  }
  bod.add(body.build(HORSE_MAT));
  // ---- the neck and the head ----
  const neck = new THREE.Group(); neck.position.set(0, 1.38, 0.76); neck.rotation.x = -0.75; bod.add(neck);
  const nb = B();
  cyl(nb, hide, 0.12, 0.21, 0.88, 0, 0, 0.36, Math.PI / 2, 0, 0, 0.7, 1.15);
  e(nb, hide, 0, 0.11, 0.34, 0.07, 0.08, 0.42);                     // the crest
  // the mane: falling to the off side in locks
  for (let i = 0; i < 9; i++) { const z = -0.02 + i * 0.09; box(nb, dark, 0.03, 0.13 + rr() * 0.05, 0.1, 0.06, 0.13 - i * 0.004, z, 0, 0, -0.5 - rr() * 0.2); }
  for (const s of [-1, 1]) box(nb, leather, 0.012, 0.012, 0.72, s * 0.105, -0.01, 0.44);   // the reins along the neck
  neck.add(nb.build(HORSE_MAT));
  const head = new THREE.Group(); head.position.set(0, 0.0, 0.8); head.rotation.x = 1.25; neck.add(head);
  const hb = B();
  e(hb, hide, 0, 0.03, 0.04, 0.11, 0.12, 0.14);                     // the poll and the brow
  e(hb, hide, 0, -0.06, 0.06, 0.1, 0.1, 0.12);                      // the jowl
  cyl(hb, hide, 0.07, 0.1, 0.44, 0, 0, 0.27, Math.PI / 2, 0, 0, 0.95, 1.12);   // the long face
  e(hb, muz, 0, -0.02, 0.5, 0.075, 0.08, 0.09);                     // the muzzle
  for (const s of [-1, 1]) {
    e(hb, 0x120c0a, s * 0.04, 0.0, 0.57, 0.018, 0.024, 0.016);      // the nostrils
    e(hb, 0x0c0808, s * 0.098, 0.06, 0.08, 0.024, 0.026, 0.026);    // the eyes
    b_cone(hb, hide, s * 0.055, 0.17, -0.03, 0.035, 0.14, -0.25, s * 0.15);   // the ears
    box(hb, leather, 0.012, 0.022, 0.34, s * 0.102, 0.02, 0.2);     // the cheekpieces
    b_ring(hb, iron, s * 0.082, -0.06, 0.47, 0.022, Math.PI / 2);   // the bit's rings
  }
  b_ring(hb, leather, 0, 0.0, 0.37, 0.088, 0, 1.15);                // the noseband
  e(hb, dark, 0, 0.13, 0.1, 0.045, 0.03, 0.1);                      // the forelock
  if (face === "blaze") e(hb, white, 0, 0.088, 0.26, 0.032, 0.02, 0.24);
  else if (face === "star") e(hb, white, 0, 0.11, 0.1, 0.035, 0.02, 0.04);
  head.add(hb.build(HORSE_MAT));
  // ---- the tail: the dock and the hair hanging from it, in two lengths so it swings ----
  const tail = new THREE.Group(); tail.position.set(0, 1.37, -0.9); tail.rotation.x = -1.2; bod.add(tail);
  const tb = B(); cyl(tb, dark, 0.05, 0.07, 0.4, 0, 0, -0.2, -Math.PI / 2, 0, 0, 0.8, 1); tail.add(tb.build(HORSE_MAT));
  const tail2 = new THREE.Group(); tail2.position.z = -0.38; tail.add(tail2);
  const t2 = B(); cyl(t2, dark, 0.075, 0.055, 0.5, 0, 0, -0.24, -Math.PI / 2, 0, 0, 0.55, 1);   // (the hair spreading as it falls) tail2.add(t2.build(HORSE_MAT));
  // ---- the legs: forearm or gaskin hung from the shoulder or hip; then the knee or hock, the cannon, the fetlock, the
  //  pastern and the hoof ----
  const legs = [];
  [[-0.14, 0.56], [0.14, 0.56], [-0.15, -0.56], [0.15, -0.56]].forEach(([x, z], i) => {
    const front = i < 2, l = new THREE.Group(); l.position.set(x, 1.02, z); bod.add(l);
    const ub = B();
    e(ub, hide, 0, -0.06, 0, 0.085, 0.15, 0.11);
    cyl(ub, hide, 0.075, 0.048, 0.5, 0, -0.25, 0);
    if (front) e(ub, hide, 0, -0.5, 0.005, 0.052, 0.06, 0.055);    // the knee
    else e(ub, hide, 0, -0.49, -0.03, 0.05, 0.065, 0.075);          // the hock, its point behind
    l.add(ub.build(HORSE_MAT));
    const low = new THREE.Group(); low.position.y = -0.5; l.add(low);
    const lb = B(), sk = socks[i] ? white : bay ? dark : hide;
    cyl(lb, socks[i] ? white : bay ? dark : hide, 0.04, 0.037, 0.34, 0, -0.17, 0);
    e(lb, sk, 0, -0.35, -0.005, 0.048, 0.05, 0.055);                // the fetlock
    cyl(lb, sk, 0.034, 0.04, 0.09, 0, -0.41, 0.018, -0.3);          // the pastern
    cyl(lb, hoofC, 0.048, 0.062, 0.085, 0, -0.475, 0.032);          // the hoof
    low.add(lb.build(HORSE_MAT));
    l.userData.low = low; legs.push(l);
  });
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // its gaits as a horse has them: a four-beat walk, a trot on the diagonals, a gallop with the hinds and then the fores
  // (fore left, fore right, hind left, hind right: when each comes down, and for how much of the stride); the stride
  // lengthens with the pace, and a hoof on the ground sweeps back exactly as fast as the horse goes over it
  const GAITS = { walk: { off: [0.25, 0.75, 0, 0.5], duty: 0.62, stride: 1.8 }, trot: { off: [0, 0.5, 0.5, 0], duty: 0.42, stride: 3.0 }, gallop: { off: [0.55, 0.65, 0, 0.1], duty: 0.3, stride: 5.6 } };
  let ph = 0, strikeT = 0, rearT = 0, ext = 0;
  const H = { root, legs, neck, lift: 0, falls: [] };
  H.strike = () => { strikeT = 0.6; };
  H.rear = () => { if (rearT <= 0) rearT = 1.4; };
  H.gait = (dt, speed) => {
    const g = speed < 2.6 ? GAITS.walk : speed < 6.2 ? GAITS.trot : GAITS.gallop, still = Math.min(1, speed / 0.8);
    const ph0 = ph; ph = (ph + dt * speed / g.stride) % 1;
    const A = Math.min(0.62, g.duty * g.stride / 2.0) * still;
    H.falls.length = 0;
    legs.forEach((l, i) => {
      const u = (ph + g.off[i]) % 1, u0 = (ph0 + g.off[i]) % 1, front = i < 2;
      // (a hoof down: the moment its stance begins — heard)
      if (speed > 0.5 && u < u0 && u0 > 0.5) H.falls.push(i);
      let a, fold = 0;
      if (u < g.duty) a = -A + 2 * A * (u / g.duty);
      else { const q = (u - g.duty) / (1 - g.duty), sm = q * q * (3 - 2 * q); a = A - 2 * A * sm; fold = Math.sin(q * Math.PI) * (front ? 1.2 : 0.8) * still; }
      l.rotation.x = a;
      l.userData.low.rotation.x += ((front ? fold : -fold * 0.7) - l.userData.low.rotation.x) * Math.min(1, dt * 30);
    });
    const k = Math.min(1, speed / 9);
    // (at the gallop the neck stretches out and the body rocks with each bound, rising as the fores push off)
    ext += ((g === GAITS.gallop ? 1 : 0) - ext) * Math.min(1, dt * 3);
    const beat = Math.sin(ph * Math.PI * 2 * (g === GAITS.walk ? 2 : 1));
    // a blow from the saddle: the horse surges into it, head thrown up and to the side
    strikeT = Math.max(0, strikeT - dt); const sk = Math.sin(Math.min(1, (0.6 - strikeT) / 0.6) * Math.PI) * (strikeT > 0 ? 1 : 0);
    // reared: up on the hinds and down again, the forelegs pawing
    rearT = Math.max(0, rearT - dt); const rk = rearT > 0 ? Math.sin((1 - rearT / 1.4) * Math.PI) : 0;
    bod.rotation.x = -(beat * 0.035 * ext * still) - rk * 0.42 - sk * 0.06;
    bod.position.y = Math.abs(beat) * 0.03 * k * still + rk * 0.12;
    // (rearing pivots on the hindquarters: the saddle goes up with it)
    H.lift = rk * (0.12 + 0.56 * Math.sin(0.42)) + sk * 0.02;
    if (rk > 0) { legs[0].rotation.x = -0.9 * rk + Math.sin(rearT * 14) * 0.3 * rk; legs[1].rotation.x = -0.9 * rk + Math.cos(rearT * 14) * 0.3 * rk; legs[0].userData.low.rotation.x = 1.4 * rk; legs[1].userData.low.rotation.x = 1.4 * rk; legs[2].rotation.x = legs[3].rotation.x = 0.42 * rk; }
    // the head nods with each stride (twice at the walk), the tail lifts and streams with the pace
    neck.rotation.x = -0.75 + ext * 0.28 * still + beat * (0.05 + 0.05 * k) * still - sk * 0.45 - rk * 0.3;
    neck.rotation.y = sk * 0.25;
    tail.rotation.x = -1.2 + k * 0.8 + Math.sin(ph * Math.PI * 4) * 0.08 * k;
    tail2.rotation.x = -0.32 * (1 - k) + k * 0.3 + Math.sin(ph * Math.PI * 2 + 1) * 0.12 * k;
    tail2.rotation.y = Math.sin(G_T() * 0.7 + seed) * 0.08 * (1 - k);   // (swishing at the flies, standing)
    return ph;
  };
  return H;
}
const BOXG = new THREE.BoxGeometry(1, 1, 1);
// ---- a scaling ladder: two rough poles and the rungs lashed across them, long enough to reach a town's parapet. Its
//  foot at the origin, running up +Y, the rails either side along Z ----
export function makeLadder(len = 7) {
  const b = new Builder(), wood = 0x6a5236, dark = 0x4a3826;
  for (const s of [-1, 1]) b.add(taper(0.045, 0.06, 6), wood, 0, len / 2, s * 0.26, 0, 0, s * 0.012, 1, len, 1);
  for (let y = 0.35; y < len - 0.2; y += 0.36) b.add(BOXG, dark, 0, y, 0, 0, 0, 0, 0.05, 0.05, 0.56);
  const m = b.build(MAT.solid); m.castShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}
function b_ring(b, col, x, y, z, r, ry = 0, sy = 1) { b.add(HTOR, col, x, y, z, 0, ry, 0, r, r * sy, r); }
function b_cone(b, col, x, y, z, r, h, rx = 0, rz = 0) { b.add(HCONE, col, x, y, z, rx, 0, rz, r, h, r); }

// ---------------------------------------------------------------------------
//  the beasts of the wider world, built here: a body, four legs that swing at the hip and bend at the knee (named as the
//  hunt's models are, so they walk and run and graze the same), a neck and a head with what each has on it — antlers,
//  horns, a mane, a trunk and tusks, a hump; its coat, striped or spotted, and a tail. Stats in mp/fauna.js
// ---------------------------------------------------------------------------
const BEAST = {
  moose:     { col: 0x4a3426, belly: 0x3a2a1e, leg: 0x2a201a, neck: [0.5, 0.55], head: [0.42, 0.15], snout: 0.22, ears: 0.1, antlers: "palm", tail: 0.08 },
  reindeer:  { col: 0x8a7a66, belly: 0xd8d0c0, leg: 0x5a4a3a, neck: [0.4, 0.75], head: [0.3, 0.11], snout: 0.12, ears: 0.08, antlers: "branch", tail: 0.08 },
  beaver:    { col: 0x5a3a24, belly: 0x4a3020, leg: 0x2a1e14, neck: [0.08, 0.3], head: [0.16, 0.11], snout: 0.06, ears: 0.03, tail: 0.32, flatTail: 0x2a2a2a },
  wolf:      { col: 0x7a7a74, belly: 0xc8c4b8, leg: 0x6a6a64, neck: [0.25, 0.5], head: [0.24, 0.1], snout: 0.16, ears: 0.09, pointy: true, tail: 0.45, bushy: true },
  bear:      { col: 0x5a3e28, belly: 0x4a3220, leg: 0x3a2a1c, neck: [0.2, 0.35], head: [0.3, 0.17], snout: 0.12, ears: 0.06, tail: 0.06 },
  polarbear: { col: 0xeee8da, belly: 0xe0d8c8, leg: 0xe0d8c8, neck: [0.32, 0.25], head: [0.3, 0.15], snout: 0.14, ears: 0.05, tail: 0.06 },
  fox:       { col: 0xc06a2a, belly: 0xf0e8dc, leg: 0x3a2a1e, neck: [0.14, 0.5], head: [0.14, 0.07], snout: 0.1, ears: 0.07, pointy: true, tail: 0.38, bushy: true, tip: 0xf4f0e8 },
  bison:     { col: 0x4a3220, belly: 0x3a2618, leg: 0x2a1c12, neck: [0.2, -0.2], head: [0.38, 0.22], snout: 0.12, ears: 0.06, horns: "short", hump: 0.55, shaggy: 0x2e1e12, tail: 0.3 },
  horse:     { col: 0x8a6a48, belly: 0x7a5a3a, leg: 0x3a2a1e, neck: [0.62, 0.85], head: [0.5, 0.13], snout: 0.22, ears: 0.09, pointy: true, mane: 0x2a1e14, tail: 0.6 },
  lion:      { col: 0xc8a060, belly: 0xe0c890, leg: 0xb89050, neck: [0.22, 0.5], head: [0.3, 0.16], snout: 0.12, ears: 0.06, lionMane: 0x7a4a22, tail: 0.65, tuft: 0x3a2a1a },
  zebra:     { col: 0xf0f0ea, belly: 0xf4f4ee, leg: 0xf0f0ea, neck: [0.5, 0.8], head: [0.45, 0.12], snout: 0.2, ears: 0.1, pointy: true, mane: 0x1a1a1a, tail: 0.45, coat: "stripes" },
  antelope:  { col: 0xb8844a, belly: 0xf0e8d8, leg: 0xa87a44, neck: [0.4, 0.8], head: [0.28, 0.1], snout: 0.12, ears: 0.09, pointy: true, horns: "straight", tail: 0.15 },
  elephant:  { col: 0x8a8680, belly: 0x7e7a74, leg: 0x7e7a74, neck: [0.25, 0.3], head: [0.6, 0.55], snout: 0, ears: 0.6, bigEars: true, trunk: 1.4, tusks: true, tail: 0.6 },
  giraffe:   { col: 0xe0b468, belly: 0xf0dcb0, leg: 0xe8c890, neck: [1.8, 1.15], head: [0.45, 0.12], snout: 0.18, ears: 0.1, horns: "ossicones", mane: 0x7a4a22, tail: 0.7, coat: "patches" },
  camel:     { col: 0xc8a070, belly: 0xd8b888, leg: 0xb89060, neck: [0.95, 0.75], head: [0.45, 0.13], snout: 0.18, ears: 0.06, hump: 0.6, tail: 0.4 },
  kangaroo:  { col: 0xa8784e, belly: 0xd8c0a0, leg: 0x8a6040, neck: [0.25, 1.2], head: [0.24, 0.1], snout: 0.12, ears: 0.14, pointy: true, tail: 1.0, thickTail: true, upPitch: 0.75 },
  tiger:     { col: 0xd87a2a, belly: 0xf0e8d8, leg: 0xd87a2a, neck: [0.24, 0.45], head: [0.3, 0.16], snout: 0.12, ears: 0.06, tail: 0.85, coat: "stripes" },
  jaguar:    { col: 0xd8a050, belly: 0xf0e0c0, leg: 0xd8a050, neck: [0.2, 0.45], head: [0.26, 0.14], snout: 0.1, ears: 0.05, tail: 0.65, coat: "spots" },
  monkey:    { col: 0x6a5038, belly: 0xa88a6a, leg: 0x5a4030, neck: [0.06, 0.8], head: [0.13, 0.11], snout: 0.05, ears: 0.05, tail: 0.6, upPitch: 0.5 },
  capybara:  { col: 0x7a5a3a, belly: 0x6a4a30, leg: 0x5a4028, neck: [0.1, 0.3], head: [0.3, 0.15], snout: 0.1, ears: 0.04, tail: 0 },
  goat:      { col: 0x9a8a72, belly: 0xc8bca8, leg: 0x6a5e4e, neck: [0.32, 0.8], head: [0.24, 0.1], snout: 0.12, ears: 0.07, pointy: true, horns: "curved", tail: 0.08 },
  penguin:   { col: 0x1e1e22, belly: 0xf4f4f0, leg: 0xe08a2a, neck: [0, 0], head: [0.13, 0.11], snout: 0.08, beak: 0xe08a2a, ears: 0, tail: 0, upright: true },
  muskox:    { col: 0x3a2a1e, belly: 0x2e2018, leg: 0x2a1e14, neck: [0.15, 0.1], head: [0.32, 0.18], snout: 0.1, ears: 0.05, horns: "muskox", shaggy: 0x2a1c12, tail: 0.1 },
};
const _coat = {};
function coatTex(kind, base) {
  if (_coat[kind]) return _coat[kind];
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const x = c.getContext("2d");
  x.fillStyle = "#" + base.toString(16).padStart(6, "0"); x.fillRect(0, 0, 256, 128);
  const pat = BEAST[kind].coat;
  if (pat === "stripes") { x.fillStyle = "#141414"; for (let i = 0; i < 26; i++) { const px = i * 10 + Math.sin(i) * 3; x.beginPath(); x.moveTo(px, 0); x.quadraticCurveTo(px + 8, 64, px - 2, 128); x.lineTo(px + 4, 128); x.quadraticCurveTo(px + 13, 64, px + 5, 0); x.fill(); } }
  if (pat === "spots") for (let i = 0; i < 90; i++) { const px = Math.random() * 256, py = Math.random() * 128; x.strokeStyle = "#2a1a10"; x.lineWidth = 2.5; x.beginPath(); x.arc(px, py, 3 + Math.random() * 3, 0, 5.5); x.stroke(); }
  if (pat === "patches") { x.fillStyle = "#e8d8b0"; x.fillRect(0, 0, 256, 128); for (let j = 0; j < 7; j++) for (let i = 0; i < 14; i++) { x.fillStyle = "#8a4a1e"; const px = i * 19 + (j % 2) * 9, py = j * 19; x.beginPath(); x.moveTo(px + 2, py + 2); x.lineTo(px + 16, py + 3); x.lineTo(px + 15, py + 16); x.lineTo(px + 3, py + 15); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return _coat[kind] = t;
}
export function makeBeast(kind, S) {
  const V = BEAST[kind]; if (!V || !S) return null;
  const root = new THREE.Group(), M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
  const coatM = V.coat ? M(0xffffff, { map: coatTex(kind, V.col) }) : M(V.col), bellyM = M(V.belly), legM = V.coat === "stripes" ? coatM : M(V.leg);
  const add = (geo, mat, parent, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const BALL = new THREE.SphereGeometry(1, 12, 9), CYL = new THREE.CylinderGeometry(1, 1, 1, 8), CONE = new THREE.ConeGeometry(1, 1, 7);
  const r = S.r, h = S.h, len = S.len, body = new THREE.Group(); root.add(body);
  if (V.upright) {
    // (a penguin: stood up on its feet, black back and white front, flippers at its sides)
    add(BALL, coatM, body, 0, h, 0, r, h * 0.95, r * 0.9); add(BALL, bellyM, body, 0, h * 0.95, r * 0.25, r * 0.85, h * 0.85, r * 0.75);
    for (const sx of [-1, 1]) add(BALL, coatM, body, sx * r * 0.95, h * 1.05, 0, r * 0.12, h * 0.5, r * 0.35, 0, 0, sx * 0.2);
    const legs = ["legFL", "legFR", "legHL", "legHR"].map((n, i) => { const g = new THREE.Group(); g.name = n; g.position.set((i % 2 ? 1 : -1) * r * 0.4, 0.06, i < 2 ? 0.04 : -0.04); add(BALL, legM, g, 0, -0.03, 0.04, 0.05, 0.02, 0.09); root.add(g); return g; });
    void legs;
    const neck = new THREE.Group(); neck.name = "neck"; neck.position.set(0, h * 1.75, 0); root.add(neck);
    add(BALL, coatM, neck, 0, 0.04, 0.02, V.head[1], V.head[1], V.head[1]); add(CONE, M(V.beak), neck, 0, 0.04, V.head[1] + 0.04, 0.025, 0.09, 0.025, Math.PI / 2);
    return root;
  }
  if (V.upPitch) body.rotation.x = -V.upPitch * 0.45;
  // the body: the barrel of it, a paler belly under, and a hump on some
  add(BALL, coatM, body, 0, h, 0, r, r * 1.02, len + r * 0.6);
  add(BALL, bellyM, body, 0, h - r * 0.35, 0, r * 0.85, r * 0.7, len + r * 0.3);
  if (V.hump) add(BALL, coatM, body, 0, h + r * 0.75, V.shaggy ? len * 0.4 : 0, r * 0.65, r * V.hump, len * 0.5);
  if (V.shaggy) add(BALL, M(V.shaggy), body, 0, h + r * 0.1, len * 0.45, r * 1.12, r * 1.15, len * 0.7);
  // the legs: from the hip and the shoulder, a thigh and a shank, the knee between (hind legs bigger on a kangaroo)
  const hipY = h - r * 0.35;
  ["legFL", "legFR", "legHL", "legHR"].forEach((n, i) => {
    const front = i < 2, sx = i % 2 ? 1 : -1, g = new THREE.Group(); g.name = n;
    const big = V.thickTail && !front ? 1.6 : V.thickTail && front ? 0.45 : 1;
    const L = (V.thickTail && front ? hipY * 0.55 : hipY), lr = Math.max(0.025, r * 0.17) * big;
    g.position.set(sx * r * 0.55, hipY, (front ? 1 : -1) * len * 0.78); root.add(g);
    add(CYL, legM, g, 0, -L * 0.25, 0, lr * 1.25, L * 0.5, lr * 1.25);
    const low = new THREE.Group(); low.name = n + "Low"; low.position.y = -L * 0.5; g.add(low);
    add(CYL, legM, low, 0, -L * 0.25, 0, lr * 0.8, L * 0.5, lr * 0.8);
    add(BALL, M(V.coat === "stripes" ? 0x1a1a1a : 0x2a221c), low, 0, -L * 0.5 + lr * 0.4, lr * (V.thickTail && !front ? 2.5 : 0.4), lr, lr * 0.6, lr * (V.thickTail && !front ? 3 : 1.3));
  });
  // the tail
  if (V.tail) {
    const tg = new THREE.Group(); tg.position.set(0, h + r * 0.2, -len - r * 0.5); tg.rotation.x = V.thickTail ? -0.55 : V.bushy ? -0.45 : -0.6; root.add(tg);   // (hanging back and down: a kangaroo's resting on the ground behind it)
    if (V.flatTail) add(BALL, M(V.flatTail), tg, 0, -0.05, -V.tail * 0.5, r * 0.6, 0.03, V.tail * 0.55, -0.9);
    else if (V.bushy) { add(BALL, coatM, tg, 0, 0, -V.tail * 0.5, r * 0.32, r * 0.32, V.tail * 0.55); if (V.tip) add(BALL, M(V.tip), tg, 0, 0, -V.tail * 0.95, r * 0.22, r * 0.22, V.tail * 0.15); }
    else { add(CYL, coatM, tg, 0, 0, -V.tail * 0.5, V.thickTail ? r * 0.28 : 0.025, V.tail, V.thickTail ? r * 0.28 : 0.025, Math.PI / 2); if (V.tuft) add(BALL, M(V.tuft), tg, 0, 0, -V.tail, 0.06, 0.06, 0.09); if (V.mane && kind === "horse" || kind === "zebra") add(BALL, M(V.mane), tg, 0, -0.1, -V.tail * 0.6, 0.06, V.tail * 0.5, 0.06); }
  }
  // the neck and the head on it
  const neck = new THREE.Group(); neck.name = "neck"; neck.position.set(0, h + r * 0.45, len + r * 0.35); root.add(neck);
  const [nl, na] = V.neck, nx = Math.cos(na) * nl, ny = Math.sin(na) * nl;
  if (nl > 0.05) add(CYL, coatM, neck, 0, ny / 2, nx / 2, r * 0.42 * (V.bigEars ? 1.3 : 1), Math.hypot(nx, ny) + 0.05, r * 0.42 * (V.bigEars ? 1.3 : 1), Math.atan2(nx, ny));
  if (V.mane && nl > 0.2) add(BALL, M(V.mane), neck, 0, ny / 2 + r * 0.25, nx / 2 - r * 0.15, 0.04, Math.hypot(nx, ny) * 0.55, r * 0.22, Math.atan2(nx, ny));
  if (V.lionMane) add(BALL, M(V.lionMane), neck, 0, ny, nx, V.head[1] * 1.9, V.head[1] * 2.0, V.head[1] * 1.6);
  const head = new THREE.Group(); head.position.set(0, ny, nx); neck.add(head);
  const [hl, hr] = V.head;
  add(BALL, coatM, head, 0, 0, hl * 0.3, hr, hr, hl * 0.6);
  if (V.snout) add(BALL, coatM, head, 0, -hr * 0.25, hl * 0.6 + V.snout * 0.4, hr * 0.6, hr * 0.55, V.snout * 0.7);
  add(BALL, M(0x141414), head, 0, -hr * 0.2, hl * 0.6 + V.snout * 1.05 + 0.01, hr * 0.22, hr * 0.18, 0.02);
  for (const sx of [-1, 1]) {
    add(BALL, M(0x101010, { roughness: 0.3 }), head, sx * hr * 0.75, hr * 0.25, hl * 0.55, 0.018, 0.018, 0.012);
    if (V.bigEars) add(BALL, coatM, head, sx * hr * 1.0, 0, hl * 0.1, 0.05, V.ears, V.ears * 0.8, 0, sx * 0.4);
    else if (V.ears) add(V.pointy ? CONE : BALL, coatM, head, sx * hr * 0.6, hr * 0.95, hl * 0.15, V.ears * 0.4, V.ears, V.ears * 0.25, 0, 0, -sx * 0.3);
    // what grows on the head
    if (V.antlers === "branch") { const a = new THREE.Group(); a.position.set(sx * hr * 0.4, hr * 0.8, hl * 0.2); a.rotation.set(-0.4, 0, -sx * 0.5); head.add(a); add(CYL, M(0xd8c8a8), a, 0, 0.25, 0, 0.018, 0.5, 0.018); for (let k = 0; k < 3; k++) add(CYL, M(0xd8c8a8), a, 0, 0.15 + k * 0.13, 0.08, 0.012, 0.18, 0.012, 0.9); }
    if (V.antlers === "palm") { const a = new THREE.Group(); a.position.set(sx * hr * 0.6, hr * 0.7, hl * 0.1); a.rotation.set(0, 0, -sx * 1.2); head.add(a); add(BALL, M(0xc8b898), a, 0, 0.3, 0, 0.32, 0.3, 0.06); add(CYL, M(0xc8b898), a, 0, 0.1, 0, 0.03, 0.2, 0.03); }
    if (V.horns === "short") add(CONE, M(0x2a2420), head, sx * hr * 0.85, hr * 0.5, hl * 0.2, 0.04, 0.16, 0.04, 0, 0, -sx * 1.2);
    if (V.horns === "straight") add(CONE, M(0x2a2420), head, sx * hr * 0.4, hr * 1.3, hl * 0.05, 0.02, 0.4, 0.02, -0.5);
    if (V.horns === "curved") add(new THREE.TorusGeometry(0.16, 0.025, 5, 10, Math.PI * 1.1), M(0x5a5248), head, sx * hr * 0.4, hr * 0.9, 0, 1, 1, 1, 0, Math.PI / 2, 0);
    if (V.horns === "ossicones") { add(CYL, coatM, head, sx * hr * 0.4, hr * 1.2, hl * 0.05, 0.02, 0.16, 0.02); add(BALL, M(0x3a2a1a), head, sx * hr * 0.4, hr * 1.3, hl * 0.05, 0.03, 0.03, 0.03); }
    if (V.horns === "muskox") add(new THREE.TorusGeometry(0.14, 0.03, 5, 10, Math.PI), M(0xd8ccb0), head, sx * hr * 0.75, hr * 0.5, hl * 0.1, 1, 1, 1, 0, Math.PI / 2, -sx * 0.6);
    if (V.tusks) add(CONE, M(0xf0ead8), head, sx * hr * 0.35, -hr * 0.6, hl * 0.75, 0.04, 0.5, 0.04, -1.2);
  }
  if (V.trunk) { const tr = new THREE.Group(); tr.position.set(0, -hr * 0.1, hl * 0.85); tr.rotation.x = 0.25; head.add(tr); add(CYL, coatM, tr, 0, -V.trunk * 0.5, 0, 0.09, V.trunk, 0.09); }
  return root;
}

// ---------------------------------------------------------------------------
//  a rowing boat: a clinker-built hull of overlapping planks, pointed at the bow and square at the stern, two thwarts
//  across it, and a pair of oars in their tholes (g.userData.oars, to be swung). Lies along z, bow toward +z; the
//  waterline at y 0
// ---------------------------------------------------------------------------
// A rowing boat, clinker-built as the boats of the Elbe and the Baltic were: five strakes each side, each plank
// lapped over the one below it (the step of every lap catches the light), a sheer that rises to a sharp stem at the
// bow and a broad transom at the stern; tarred below the waterline, a green top strake, oiled oak above and inside.
// Ribs inside, two thwarts and a stern seat, the bottom boards, a rail along each gunwale, and a pair of oars in their
// tholes. Its wood grain is its own (it moves; the world's grain would slide over it). Faces +z, the waterline at
// y = 0.1 as it floats (it's set 0.1 below the water). And a cover over its inside that the water can't be drawn
// through, so the sea doesn't seem to stand in it.
export function makeRowboat() {
  const g = new THREE.Group();
  const L = 3.7, W = 1.32, N = 28, STR = 5;
  const tar = mat(0x2a221c, { surface: "wood", roughness: 0.7 }), oak = mat(0x8c6a44, { surface: "wood" }), green = mat(0x34503e, { surface: "wood", roughness: 0.75 });
  const inside = mat(0x9a774e, { surface: "wood" }), dark = mat(0x5a3e28, { surface: "wood" }), iron = mat(0x3a3a3c, { metalness: 0.5, roughness: 0.5 });
  // the lines: half-beam, keel height and sheer height along the length (t: 0 the stern, 1 the bow)
  const half = t => W / 2 * (t < 0.55 ? 1 - Math.pow((0.55 - t) / 0.55, 2) * 0.38 : Math.pow(Math.cos((t - 0.55) / 0.45 * Math.PI / 2), 0.85));
  const keel = t => -0.12 + (t > 0.72 ? Math.pow((t - 0.72) / 0.28, 2) * 0.42 : 0) + (t < 0.12 ? (0.12 - t) / 0.12 * 0.1 : 0);
  const sheer = t => 0.42 + 0.17 * Math.pow(2 * t - 1, 2) + (t > 0.5 ? (t - 0.5) * 0.12 : 0);
  // a point of the hull: t along, s up the side (0 the keel, 1 the gunwale), side ±1
  const P = (t, s, sx) => { const hb = half(t), k = keel(t), sh = sheer(t); return [sx * hb * Math.pow(Math.sin(s * Math.PI / 2), 0.55), k + (sh - k) * (1 - Math.cos(s * Math.PI / 2)), -L / 2 + t * L]; };
  const sheet = (rows, cols, at, m, flip, off = 0) => {
    const pos = [], idx = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const v = at(i / cols, j / rows); pos.push(v[0], v[1], v[2]); }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
  };
  // the strakes, outside: each its band of the side, its lower edge standing proud of the plank below (the lap)
  for (const sx of [-1, 1]) for (let k = 0; k < STR; k++) {
    const s0 = k / STR, s1 = (k + 1) / STR, m = k < 2 ? tar : k === STR - 1 ? green : oak;
    sheet(2, N, (u, v) => { const t = 0.004 + u * 0.992, s = s0 + (s1 - s0) * v, p = P(t, s, sx), lap = (1 - v) * 0.016 * Math.sin(Math.PI * Math.min(1, t * 1.15)); return [p[0] + sx * lap, p[1] - lap * 0.4, p[2]]; }, m, sx > 0);
    // (and the same plank seen from inside, a hair in, the inside's own oiled colour)
    sheet(1, N, (u, v) => { const t = 0.01 + u * 0.98, s = s0 + (s1 - s0) * v, p = P(t, s, sx * 0.975); return [p[0], p[1] + 0.012, p[2]]; }, inside, sx < 0);
  }
  // the keel along the bottom, the stem rising at the bow
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  for (let i = 0; i < 10; i++) { const t0 = 0.02 + i * 0.07, t1 = t0 + 0.075, a = P(t0, 0, 0), b = P(t1, 0, 0), len = Math.hypot(b[1] - a[1], b[2] - a[2]); add(new THREE.BoxGeometry(0.07, 0.09, len + 0.02), tar, 0, (a[1] + b[1]) / 2 - 0.035, (a[2] + b[2]) / 2, -Math.atan2(b[1] - a[1], b[2] - a[2])); }
  { const a = P(0.72, 0, 0), b = P(1, 0, 0), top = sheer(1) + 0.12, pts = []; for (let i = 0; i <= 6; i++) { const t = 0.72 + i / 6 * 0.28; pts.push(P(t, 0, 0)); } pts.push([0, top, L / 2 + 0.02]);
    for (let i = 0; i < pts.length - 1; i++) { const a2 = pts[i], b2 = pts[i + 1], len = Math.hypot(b2[1] - a2[1], b2[2] - a2[2]); add(new THREE.BoxGeometry(0.08, 0.1, len + 0.03), dark, 0, (a2[1] + b2[1]) / 2, (a2[2] + b2[2]) / 2 + 0.01, -Math.atan2(b2[1] - a2[1], b2[2] - a2[2])); } void a; void b; }
  // the transom: the stern's flat board, filling the section at t = 0
  { const sh = new THREE.Shape(), M = 10; for (let i = 0; i <= M; i++) { const p = P(0.004, i / M, 1); i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]); } for (let i = M; i >= 0; i--) { const p = P(0.004, i / M, -1); sh.lineTo(p[0], p[1]); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); const o = add(geo, oak, 0, 0, -L / 2 - 0.03); void o; }
  // the gunwale rails, a rubbing strake, and the ribs inside
  for (const sx of [-1, 1]) for (let i = 0; i < N; i++) {
    const t0 = 0.01 + i / N * 0.97, t1 = t0 + 0.97 / N, a = P(t0, 1, sx), b = P(t1, 1, sx), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const o = add(new THREE.BoxGeometry(0.06, 0.05, len + 0.01), dark, (a[0] + b[0]) / 2 + sx * 0.012, (a[1] + b[1]) / 2 + 0.02, (a[2] + b[2]) / 2);
    o.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]); o.rotation.x = -Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])); o.rotation.order = "YXZ";
  }
  for (let r = 0; r < 9; r++) { const t = 0.1 + r * 0.085; for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const a = P(t, 0.06 + k * 0.235, sx * 0.94), b = P(t, 0.06 + (k + 1) * 0.235, sx * 0.94), len = Math.hypot(b[0] - a[0], b[1] - a[1]); const o = add(new THREE.BoxGeometry(0.035, len + 0.02, 0.045), inside, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.012, a[2]); o.rotation.z = -Math.atan2(b[0] - a[0], b[1] - a[1]); } }
  // the bottom boards, the thwarts and the stern seat
  { const p = P(0.45, 0.12, 1); add(new THREE.BoxGeometry(p[0] * 1.5, 0.03, L * 0.62), inside, 0, p[1] + 0.01, -0.12); }
  const thwart = (t, dy = 0.17) => { const p = P(t, 1, 1); add(new THREE.BoxGeometry(p[0] * 2 - 0.06, 0.045, 0.26), oak, 0, p[1] - dy, p[2]); add(new THREE.BoxGeometry(0.06, p[1] - dy - keel(t) - 0.04, 0.06), dark, 0, (p[1] - dy + keel(t)) / 2 + 0.02, p[2]); };
  thwart(0.5); thwart(0.72);
  { const p = P(0.1, 1, 1); add(new THREE.BoxGeometry(p[0] * 2 - 0.1, 0.045, 0.42), oak, 0, p[1] - 0.2, p[2] + 0.1); }
  // the tholes: a pair of pins either side, the oar between them
  const lock = P(0.5, 1, 1);
  for (const sx of [-1, 1]) for (const dz of [-0.06, 0.06]) add(new THREE.CylinderGeometry(0.014, 0.016, 0.13, 6), iron, sx * (lock[0] + 0.01), lock[1] + 0.09, lock[2] + 0.08 + dz);
  // the oars: a loom with its grip, out through the tholes to a long blade. (Each turns about its thole: rotation.y
  // swings it fore and aft, rotation.z lifts the blade out of the water and dips it in)
  const oars = [];
  for (const sx of [-1, 1]) {
    const o = new THREE.Group(); o.position.set(sx * (lock[0] + 0.01), lock[1] + 0.07, lock[2] + 0.08); g.add(o);
    const loom = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 2.5, 8), oak); loom.rotation.z = Math.PI / 2; loom.position.x = sx * 0.85; o.add(loom);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), dark); grip.rotation.z = Math.PI / 2; grip.position.x = -sx * 0.48; o.add(grip);
    const bs = new THREE.Shape(); bs.moveTo(0, -0.025); bs.lineTo(0.62, -0.075); bs.quadraticCurveTo(0.7, 0, 0.62, 0.075); bs.lineTo(0, 0.025); bs.lineTo(0, -0.025);
    const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.018, bevelEnabled: false }); bg.translate(0, 0, -0.009); if (sx < 0) bg.rotateY(Math.PI);
    const blade = new THREE.Mesh(bg, oak); blade.position.x = sx * 2.05; blade.rotation.x = Math.PI / 2; o.add(blade);
    for (const m of [loom, grip, blade]) m.castShadow = true;
    o.userData.side = sx; oars.push(o);
  }
  g.userData.oars = oars; g.userData.bladeR = 2.4;   // (from the thole to the middle of the blade)
  // the cover: the hull's inside at a hand above the waterline, drawn into the depth only and last of the solid
  // things, so the water (drawn after) can't show through inside the boat — but whatever's in the boat still shows
  { const pos = [], idx = [], Y = 0.2, M = 24;
    for (let i = 0; i <= M; i++) { const t = 0.01 + i / M * 0.98; let s = 0; for (let k = 0; k < 40; k++) { const sm = (k + 0.5) / 40; if (P(t, sm, 1)[1] < Y) s = sm; } const p = P(t, s, 1); pos.push(-p[0] * 0.98, Y, p[2], p[0] * 0.98, Y, p[2]); }
    for (let i = 0; i < M; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const cover = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })); cover.renderOrder = 50; cover.userData.noShadow = true; g.add(cover); }
  ownGrainAll(g);
  return g;
}

// a shipyard: a slipway of timbers running down into the water, a ship's ribs standing on it, a great open shed on
// posts beside it, a crane, and timber stacked. Faces +z (the slipway's foot in the water); w across, d deep
export function makeShipyard(w = 14, d = 24) {
  const b = new Builder(), WD = 0x7a5634, DK = 0x4e3624, PL = 0x9a7448;
  // the slipway: two long ways, and the cross-timbers between them, sloping down toward the water
  for (let i = 0; i < 12; i++) { const z = -d * 0.15 + i * (d * 0.9 / 12), y = 0.5 - i * 0.18; b.box(4.2, 0.18, 0.32, -w * 0.18, y, z, DK); }
  for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.3, 0.3, d * 0.95), WD, -w * 0.18 + sx * 1.7, -0.3, d * 0.3, -0.09, 0, 0);
  // a ship's ribs on the slipway, a keel along under them
  b.box(0.3, 0.35, d * 0.55, -w * 0.18, 0.9, d * 0.05, DK);
  for (let i = 0; i < 9; i++) { const z = -d * 0.18 + i * (d * 0.5 / 9), k = Math.sin((i + 0.5) / 9 * Math.PI); for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.1, 0.12, 3.2 * (0.7 + 0.3 * k), 6), PL, -w * 0.18 + sx * 1.4 * k, 2.2, z, 0, 0, sx * 0.45); }
  // the shed: posts and a long pitched roof, open at the sides
  const sx0 = w * 0.25;
  for (const px of [-2.6, 2.6]) for (let i = 0; i < 4; i++) b.box(0.3, 4.4, 0.3, sx0 + px, 2.2, -d * 0.35 + i * 4, DK);
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(3.4, 0.14, 14), 0x5a4232, sx0 + s * 1.5, 5.0, -d * 0.35 + 6, 0, 0, -s * 0.5);
  // timber stacked in the shed
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) b.add(new THREE.CylinderGeometry(0.2, 0.2, 5, 8), WD, sx0 - 1.6 + i * 0.42, 0.25 + r * 0.38, -d * 0.3 + 2, Math.PI / 2, 0, 0);
  // the crane: a mast, a jib out over the slipway, and its rope
  b.box(0.45, 9, 0.45, -w * 0.45, 4.5, d * 0.1, DK);
  b.add(new THREE.BoxGeometry(0.25, 0.25, 7), WD, -w * 0.45 + 1.8, 8.4, d * 0.1, 0, Math.PI / 2 - 0.4, 0);
  b.add(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), 0xd8ceb4, -w * 0.45 + 4.3, 6.4, d * 0.1 + 1.6);
  const m = b.build(MAT.solid);
  const g = new THREE.Group(); g.add(m);
  return g;
}

// ---- a soldier made one: for a battle's crowd ----
// A rigged person is a score of skinned pieces — coat, cuffs, hat, skin, hair, buttons — each with a skeleton of its
// own to work out every frame and a draw of its own. A hundred and fifty of them on a field was three thousand: too
// many. So for a battle's men the pieces showing are made into one or two (the cloth and skin; the metal), sharing one
// skeleton, each piece's tint baked into its colours. The pieces themselves are kept, hidden, for anything that asks
// for them.
// (a texture read back, small, to colour a merged crowd's vertices where the pieces had a picture — a face's skin, its
//  brows and lips — instead of the plain white under it: every soldier's face and hands came out chalk-white)
const SKIN_BAKE = [0.76, 0.62, 0.53], ONE = [1, 1, 1];   // (a shade deeper than weatheredSkin's, as a merged face has no blotch or grime to break it up, and under a low evening sun the paler ones blew out chalk-white)
const _texRead = new WeakMap();
function texReader(tex) {
  const img = tex && tex.image; if (!img || !img.width || typeof document === "undefined") return null;
  let R = _texRead.get(img);
  if (R === undefined) {
    R = null;
    try {
      const S = 128, cv = document.createElement("canvas"); cv.width = cv.height = S; const x = cv.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, S, S);
      const d = x.getImageData(0, 0, S, S).data, lin = new Float32Array(S * S * 3);
      for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) lin[i * 3 + k] = Math.pow(d[i * 4 + k] / 255, 2.2);
      R = { S, lin };
    } catch (e) {}
    _texRead.set(img, R);
  }
  if (!R) return null;
  const flip = tex.flipY;
  return (u, v, out) => { const S = R.S, X = Math.min(S - 1, Math.max(0, Math.floor((u - Math.floor(u)) * S))), vv = v - Math.floor(v), Y = Math.min(S - 1, Math.max(0, Math.floor((flip ? 1 - vv : vv) * S))), i = (Y * S + X) * 3; out[0] = R.lin[i]; out[1] = R.lin[i + 1]; out[2] = R.lin[i + 2]; return out; };
}
export function mergeRig(root) {
  const parts = [];
  root.traverse(o => { if (o.isSkinnedMesh && !Array.isArray(o.material) && o.geometry.attributes.skinIndex) { let v = true; for (let p = o; p && p !== root; p = p.parent) if (!p.visible) { v = false; break; } if (v) parts.push(o); } });
  if (parts.length < 3) return null;
  const bones = parts[0].skeleton.bones, bind = parts[0].bindMatrix;
  root.updateMatrixWorld(true);
  const W0 = parts[0].matrixWorld, near = (A, B) => A.elements.every((v, i) => Math.abs(v - B.elements[i]) < 1e-4);
  const same = o => o.skeleton.bones.length === bones.length && o.skeleton.bones.every((b, i) => b === bones[i]) && o.bindMatrix.equals(bind) && near(o.matrixWorld, W0);
  const buckets = new Map();
  for (const o of parts) { if (!same(o)) continue; const metal = (o.material.metalness || 0) > 0.3 ? 1 : 0; (buckets.get(metal) || buckets.set(metal, []).get(metal)).push(o); }
  const made = [];
  for (const [metal, list] of buckets) {
    if (list.length < 2) continue;
    let nv = 0, ni = 0; for (const o of list) { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni), acl = new Float32Array(nv * 2);
    let sim = null;
    let v0 = 0, i0 = 0;
    const c = new THREE.Color(), parts = [];
    for (const o of list) {
      // (where each piece's colours lie in the whole: so a wound can darken his coat without making him many again)
      parts.push({ part: o.material.userData && o.material.userData.part, start: v0, count: o.geometry.attributes.position.count });
      if (clothSimOf(o)) sim = clothSimOf(o);
      // (a piece made to flow — see cloth.js — merged as it flows: the merged mesh swings with the same hem)
      const g = o.geometry, AC = g.attributes.aCloth, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, m = o.material.color || c.set(0xffffff);
      const UV = g.attributes.uv, rd = UV && o.material.map ? texReader(o.material.map) : null, tc = [1, 1, 1];
      const skinPart = o.material.userData && o.material.userData.part === "skin";
      for (let k = 0; k < P.count; k++) {
        const j = v0 + k;
        pos[j * 3] = P.getX(k); pos[j * 3 + 1] = P.getY(k); pos[j * 3 + 2] = P.getZ(k);
        if (N) { nor[j * 3] = N.getX(k); nor[j * 3 + 1] = N.getY(k); nor[j * 3 + 2] = N.getZ(k); }
        const r = C && o.material.vertexColors ? C.getX(k) : 1, gg = C && o.material.vertexColors ? C.getY(k) : 1, b = C && o.material.vertexColors ? C.getZ(k) : 1;
        if (rd) rd(UV.getX(k), UV.getY(k), tc);
        // (skin: the sun and the weather's tan, and the grime, as weatheredSkin lays on one man's — without it a crowd's
        //  faces and hands were chalk-white beside his)
        const sk = skinPart ? SKIN_BAKE : ONE;
        col[j * 3] = r * m.r * tc[0] * sk[0]; col[j * 3 + 1] = gg * m.g * tc[1] * sk[1]; col[j * 3 + 2] = b * m.b * tc[2] * sk[2];
        // (the mud up a worn piece's hem baked in: a crowd's merged pieces have no shader of their own for it)
        if (o.material.userData && o.material.userData.worn) { const y = P.getY(k), u = Math.max(0, Math.min(1, (y - 0.08) / 0.54)), mud = 1 - u * u * (3 - 2 * u), k2 = 1 - mud * 0.45; col[j * 3] = col[j * 3] * k2 + mud * 0.07; col[j * 3 + 1] = col[j * 3 + 1] * k2 + mud * 0.055; col[j * 3 + 2] = col[j * 3 + 2] * k2 + mud * 0.035; }
        for (let q = 0; q < 4; q++) { si[j * 4 + q] = SI.getComponent(k, q); sw[j * 4 + q] = SW.getComponent(k, q); }
        if (AC) { acl[j * 2] = AC.getX(k); acl[j * 2 + 1] = AC.getY(k); }
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) idx[i0 + k] = g.index.getX(k) + v0;
      else for (let k = 0; k < P.count; k++) idx[i0 + k] = k + v0;
      i0 += g.index ? g.index.count : P.count; v0 += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    // (the material: the first piece's own — its finish and its grain — white, so the baked colours show as they were)
    const M0 = list.find(o => !/skin|eyes|iris/.test(o.name)) || list[0], mat = (clothSrcOf(M0.material) || M0.material).clone(); mat.color = new THREE.Color(0xffffff); mat.vertexColors = true; mat.map = null;
    if (!metal) { mat.metalness = 0; mat.roughness = Math.max(0.7, mat.roughness ?? 0.85); mat.envMap = null; }
    // (the steel of a crowd — pike heads, bayonets, locks — the sky in it as on one man's; its maps were the pieces' own)
    else { mat.metalnessMap = null; mat.roughnessMap = null; mat.metalness = Math.max(mat.metalness, 0.6); mat.roughness = Math.min(mat.roughness ?? 0.4, 0.45); mat.envMap = null;
      const src = clothSrcOf(M0.material) || M0.material; if (mat.userData.detail && typeof mat.userData.detail === "object") { addDetail(mat, mat.userData.detail); inheritHooks(src, mat); } shine(mat); }
    const sk = new THREE.SkinnedMesh(geo, mat); sk.name = "merged_" + (metal ? "metal" : "cloth");
    sk.userData.parts = parts; sk.userData.base = col.slice();
    sk.castShadow = true; sk.receiveShadow = true; sk.frustumCulled = false;
    list[0].parent.add(sk); sk.bind(list[0].skeleton, bind);
    if (sim) { geo.setAttribute("aCloth", new THREE.BufferAttribute(acl, 2)); sk.userData.unCloth = clothMerged(sim, sk); }
    for (const o of list) o.visible = false;
    made.push(sk); made.hidden = (made.hidden || []).concat(list);
  }
  if (!made.length) return null;
  root.userData.merged = made;
  // (and made many again, if anything ever needs the pieces themselves)
  return () => { root.userData.merged = null; for (const m of made) { if (m.userData.unCloth) m.userData.unCloth(); m.parent && m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); } for (const o of made.hidden) o.visible = true; };
}
