// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// People, trees, and the furniture of a life: all built from primitives at
// load, the way the first Forester built its sounds instead of loading them.

import { THREE, mat, MAT, Builder, prismGeo, makeFlame, rng, TAU, addDetail, noSnow } from "./core.js";
import { mergeVertices } from "../lib/utils/BufferGeometryUtils.js";

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

// a swimmer lies along the water: the body turned face-down and lifted, so the back is at the surface and the head up
// out of it (eased in and out as they go into deep water and come out)
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
export function makePerson(o = {}) {
  const r = rng(o.seed ?? Math.floor(Math.random() * 1e9));
  const skin = o.skin ?? r.pick(SKIN), hair = o.hair ?? r.pick(HAIR);
  const coat = o.coat ?? r.pick([0x5b4a3a, 0x3e4a5c, 0x6a3b32, 0x4d5a3c, 0x7a6a55, 0x3b3b40]);
  const legs = o.legs ?? r.pick([0x3a3028, 0x2e2e33, 0x4a4035, 0x5a5048]);
  const skirt = !!o.skirt;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
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
    phase: r() * TAU, walkAmt: 0, pose: "idle", poseT: 0, look: 0, sitting: 0,
    update(dt, speed = 0) {
      this.poseT += dt;
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
    },
    setPose(p) { if (p !== this.pose) { this.pose = p; this.poseT = 0; } },
    // a child's head is big for the body; it evens out as they grow
    setHeadScale(k) { this.headK = k; neck.scale.setScalar(k); if (this.headBone) this.headBone.scale.setScalar(k); },
  };
  if (o.model && MODELS[o.model]) useModel(P, o.model, { coat, legs, vest: o.vest, skirt: skirt ? (o.skirtColor ?? coat) : undefined, apron: o.apron, hat: o.hatColor, sash: o.sash, hide: o.hide, skin: o.skinColor, hair: o.hairColor, eyes: o.eyeColor, stockings: o.stockingsColor, linen: o.linenColor });
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
const CLOTH_PARTS = new Set(["coat", "legs", "stockings", "linen", "vest", "skirt", "apron", "hat", "sash", "cloth", "rope", "sail", "flag"]);
const BARE_PARTS = new Set(["skin", "eyes", "hair", "metal", "leather"]);
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
const SURF_BY_NAME = { fur: "none", hide: "none", plaster: "plaster", brick: "brick", stone: "stone", tiles: "tiles", roof: "wood", wood: "wood", log: "wood", glass: "none", iron: "none", soot: "none", horn: "none",
  // (a tree's bark and needles; a ship's hull; the oven's clay; a candle's wax; a burned house's char and ash; the far city's water and roofs)
  bark: "bark", needles: "needles", hull: "wood", clay: "plaster", wax: "none", char: "wood", ash: "none", water: "none", copper: "none", earth: "none", house: "plaster" };
const _loading = {};
const BUILDING = k => /^town\//.test(k) || ["home_2", "cabin", "cabin_burned", "woodshed", "well"].includes(k);
async function fetchModel(k, url) {
  try {
    MODELS[k] = await _loader.loadAsync(url);
    // the same grain and weathering as everything built in code; a person's materials are named for
    // what they are, so cloth gets the weave and skin gets nothing
    MODELS[k].scene.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial || o.material.userData.detail) return;
      // (the stuff it's made of is the last word of its name; Blender's ".001" on a copy is no part of it)
      const m = o.material, n = (m.name || "").split("_").pop().replace(/\.\d+$/, "");
      m.userData.detail = true;
      m.userData.part = n;
      m.userData.surface = CLOTH_PARTS.has(n) ? "cloth" : BARE_PARTS.has(n) ? "none" : SURF_BY_NAME[n] || "auto";
      if (n === "glass") { m.roughness = 0.15; m.metalness = 0.4; }
      // (a hat of steel — the watch's morion — is polished metal, not felt: no weave on it, and bright, since with no
      // reflection to show a metal goes dark)
      // (a steel helmet: dark polished iron with the sun's sheen on it — it was a pale grey that read as white in daylight)
      if (n === "hat" && m.metalness > 0.2) { m.userData.part = "helmet"; m.userData.surface = "none"; m.metalness = 0.4; m.roughness = 0.28; m.color.set(0x80848a); m.emissive.set(0x07080a); }
      // a building is solid, closed shapes: drawn from the outside only (both sides drawn, the back of one face fights
      // the face behind it — a gable built of two, a frame against its wall — and flickers); and its trim — timber,
      // iron, glass — always drawn in front of the plaster or brick it lies on
      if (BUILDING(k)) {
        m.side = THREE.FrontSide;
        if (/^(wood|iron|glass|metal|log|roof)$/.test(n)) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
      }
      // (a tree's needles and leaves thin away when you stand inside it, so you can see out)
      addDetail(m, { scale: 2, amount: 0.22, grain: 0.6, surface: m.userData.surface, seeThrough: /needle|lea[fv]|foliage|canopy/i.test(m.name || "") ? 3.6 : 0 });
    });
  }
  catch (e) { console.warn("Reckoning: could not load model", k, url, e); }
}
// a model that is only fetched when first wanted (the town's buildings, in every style):
// resolves once it is there; until then modelCopy(key) is null
export function ensureModel(key) {
  if (MODELS[key]) return Promise.resolve(true);
  return _loading[key] || (_loading[key] = loaderReady().then(() => fetchModel(key, `models/${key}.glb`)).then(() => !!MODELS[key]));
}
let _clone = null;
// a fresh copy of a loaded model, shadows on, or null if there is none
export function modelCopy(key) {
  const g = MODELS[key]; if (!g) return null;
  const scene = _clone ? _clone(g.scene) : g.scene.clone(true);
  scene.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { scene, animations: g.animations || [] };
}
// Swap a built person for a Blender one. The code-built skeleton keeps working
// underneath, unseen, so held things and poses still have somewhere to hang;
// the model plays its own Idle / Walk / Run / Sit / Chop animations if it has them.
function useModel(P, key, colors = {}) {
  const m = modelCopy(key); if (!m) return;
  P.root.traverse(o => { if (o.isMesh) o.visible = false; });
  P.body.add(m.scene);
  // this person's own colours on the parts that vary: one model, a varied crowd
  const own = {};
  m.scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const part = o.material.userData.part, want = colors[part];
    // (a part left off altogether: the watch's sash, when the uniform has none)
    if (colors.hide && colors.hide.includes(part)) { o.visible = false; return; }
    if (want === undefined || want === null) return;
    if (!own[part]) { own[part] = o.material.clone(); own[part].color.set(want); addDetail(own[part], { scale: 2, amount: 0.22, grain: 0.6, surface: o.material.userData.surface }); }
    o.material = own[part];
  });
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
  for (const n of ["idle", "walk", "run", "sit", "chop", "torch", "lantern", "hold", "writ", "point", "armscrossed", "bound", "grieve", "reach", "hammer", "punch", "eat", "stir", "talk", "guard", "strafe", "overhead", "hit", "dig", "reap", "sow", "gather", "saw", "whittle"]) { const c = clip(n); if (c) acts[n] = mixer.clipAction(c); }
  // (the blows and the flinch play once and hold their last frame till the pose moves on)
  for (const n of ["overhead", "hit"]) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce, 1); acts[n].clampWhenFinished = true; }
  // the legs of a walk without its arms, and the arms of a held pose without its legs, so a man can
  // carry a lantern and walk at the same time
  const ARM = /shoulder|arm|elbow|wrist|hand|finger|thumb/i;
  const part = (c, arms) => { if (!c) return null; const k = c.clone(); k.tracks = k.tracks.filter(t => ARM.test(t.name.split(".")[0]) === arms); k.name = c.name + (arms ? "·arms" : "·legs"); return mixer.clipAction(k); };
  for (const n of ["walk", "run"]) if (acts[n]) acts[n + "Legs"] = part(clip(n), false);
  for (const n of ["torch", "lantern", "writ", "bound", "hold", "guard"]) if (acts[n]) acts[n + "Arms"] = part(clip(n), true);
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
  P.clipNow = () => cur && cur.getClip().name;                 // (for the tests, and for the sound of work)
  P.clipPhase = () => { if (!cur) return 0; const d = cur.getClip().duration || 1; return ((cur.time % d) + d) % d / d; };
  // a blow landing on them: a flinch over whatever they're doing, for a moment
  P.flinch = () => { if (!acts.hit) return; P.flinchT = 0.5; acts.hit.reset(); if (cur === acts.hit) acts.hit.play(); };
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
  if (hand) { hand.add(P.held); P.held.position.set(0, 0.07, 0); P.held.rotation.set(-Math.PI / 2, 0, 0); }
  if (handL) { handL.add(P.heldL); P.heldL.position.set(0, 0.07, 0); P.heldL.rotation.set(-Math.PI / 2, 0, 0); }
  const base = P.update.bind(P);
  P.update = function (dt, speed = 0) {
    base(dt, speed);
    // the model does its own moving, so the code-built body stands straight
    P.body.rotation.x = 0; P.hips.position.y = 0.92;
    let pose = (this.pose || "idle").toLowerCase();
    if (pose === "swim") pose = "idle";
    // in a fight and doing nothing else: the guard, not standing about
    if (this.fight && (pose === "idle" || pose === "reach" && !acts.reach) && acts.guard) pose = "guard";
    // walking and running win over a held pose, except for what the hands must keep doing (a load carried, a light held)
    const keepsHands = ["torch", "lantern", "writ", "bound", "hold", "guard"].includes(pose);
    const moving = speed > 0.15 && this.sitting <= 0.5;
    const ONCE = pose === "chop" || pose === "hammer" || pose === "punch" || pose === "overhead";
    const lat = this.strafe || 0, fwd = this.fwd || 0;
    if (this.flinchT > 0 && acts.hit && this.sitting <= 0.5) {
      // hit: the flinch, whatever else
      this.flinchT -= dt; playArms(null); play("hit", 0.08);
    } else if (this.fight && moving && acts.strafe && Math.abs(lat) > Math.abs(fwd) * 0.8 && !ONCE) {
      // stepping round them sideways, guard up: the sidestep, played the way they're going
      playArms(null); play("strafe", 0.15); cur.timeScale = Math.sign(lat || 1) * Math.min(1.6, Math.max(0.6, Math.abs(lat) / 1.2));
    } else if (keepsHands && moving && acts[pose + "Arms"] && acts.walkLegs) {
      // walking with something held: the legs walk, the arms keep hold
      play(speed > 2.1 && acts.runLegs ? "runLegs" : "walkLegs"); playArms(pose + "Arms");
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
    mixer.update(dt);
    // swimming: laid along the water (as the code-built body is), the arms and legs in their stroke over the clip
    swimLay(this, dt);
    if (this.swimK > 0.02) swimBones(this, dt);
    // the head turned toward whoever they're watching, over what the clip is doing: most of it in the head, some in
    // the neck, eased in and out
    this.lookS = (this.lookS || 0) + ((this.look || 0) - (this.lookS || 0)) * Math.min(1, dt * 5);
    if (Math.abs(this.lookS) > 0.002) { if (headB) headB.rotateY(this.lookS * 0.65); if (neckB) neckB.rotateY(this.lookS * 0.3); this.lookApplied = this.lookS; }
  };
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
const STUFF = t => tmat("s" + t, () => t === 1 ? mat(0x9a7448, { surface: "wood", flatShading: true }) : t === 2 ? mat(0x8e897d, { surface: "stone", flatShading: true })
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
export function makeAxe(tier) {
  const t = tier >= 3 && tier <= 5 ? tier : 0, g = new THREE.Group();
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
  const t = tier === 1 ? 1 : tier === 3 || tier === 4 ? tier : 5, g = new THREE.Group(), fitting = tmat("brass", () => mat(0x8a7040, { metalness: 0.5, roughness: 0.45, flatShading: true }));
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
  const g = new THREE.Group();
  mesh(haftGeo(1.9, 0.02, 0.017, 7, -0.45), WOOD(), g);
  mesh(tgeo("spearSocket", () => new THREE.CylinderGeometry(0.016, 0.022, 0.1, 7)), STUFF(5), g, 0, 1.48);
  mesh(plateGeo("spearHead", [[0, 0], [0.04, 0.05, 0.035, 0.12], [0.02, 0.2, 0, 0.26], [-0.02, 0.2, -0.035, 0.12], [-0.04, 0.05, 0, 0]], 0.012, 0.004), STUFF(5), g, 0, 1.52);
  return g;
}
export function makeBattleAxe() {
  const g = makeAxe(5); g.scale.set(1.15, 1.2, 1.15);
  mesh(tgeo("bAxeSpike", () => { const c = new THREE.ConeGeometry(0.02, 0.1, 4); c.rotateX(-Math.PI / 2); return c; }), STUFF(5), g, 0, 0.63, -0.08);
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
  const t = tier >= 3 ? tier : 0, g = new THREE.Group();
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
    // a wooden bowl with something hot in it
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
// a musket: the walnut stock and the long barrel, the lock and its flint, the ramrod under the barrel; held at the
// wrist of the stock, pointing +Y along the barrel
export function makeMusket() {
  const g = new THREE.Group(), wood = mat(0x5a3820, { surface: "wood" }), iron = mat(0x3a3c40, { metalness: 0.7, roughness: 0.4 }), brass = mat(0xb08a3a, { metalness: 0.6, roughness: 0.35 });
  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.11), wood); butt.position.set(0, -0.22, -0.035); butt.rotation.x = 0.12; g.add(butt);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.05), wood); stock.position.y = 0.36; g.add(stock);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 1.0, 8), iron); barrel.position.set(0, 0.62, 0.03); g.add(barrel);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.85, 5), wood); rod.position.set(0, 0.55, -0.02); g.add(rod);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.035), iron); lock.position.set(0.025, 0.06, 0.02); g.add(lock);
  const cock = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), iron); cock.position.set(0.03, 0.12, 0.035); cock.rotation.x = -0.5; g.add(cock);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10), brass); band.rotation.x = Math.PI / 2; band.position.set(0, 0.7, 0.01); g.add(band);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.12), brass); plate.position.set(0, -0.38, -0.035); g.add(plate);
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 1.13, 0.03); g.add(g.userData.muzzle);
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
  return g;
}
export const makeArm = kind => ({ sword: makeSword, spear: makeSpear, battleaxe: makeBattleAxe, club: makeClub, knife: makeKnife, musket: makeMusket, pick: () => makePick((G_TOOLS() || {}).pick || 1) })[kind]?.() || makeAxe();
// (the pick's making is the player's, read from the game at the moment it is made)
let _toolsOf = () => null;
export const setToolSource = f => { _toolsOf = f; };
const G_TOOLS = () => _toolsOf();

export function makeScroll() {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.005), mat(0xe8dcc0)); g.add(p);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), mat(0x9a1b1b)); seal.rotation.x = Math.PI / 2; seal.position.set(0, -0.13, 0.008); g.add(seal);
  return g;
}
export function makeHalberd() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.1, 6), mat(0x5a4030)); shaft.position.y = 0.6; g.add(shaft);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.22), mat(0x9a9ea4, { metalness: 0.8, roughness: 0.4 })); blade.position.set(0, 1.5, 0.09); g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.28, 4), mat(0x9a9ea4, { metalness: 0.8, roughness: 0.4 })); tip.position.y = 1.78; g.add(tip);
  return g;
}

// ---------------------------------------------------------------------------
//  trees
// ---------------------------------------------------------------------------
// Geometries shared by the instanced forest and by the single choppable trees.
// Their vertex colours are shading, not colour: light where the sun finds the
// tips, dark in the hollows and undersides, multiplied by each material's hue.

// one tier of spruce boughs: a cone whose skirt is ragged and droops at the tips
function spruceTierGeo(N = 16) {
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
  const under = v(0, 0.3, 0, 0.35);
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
  cone: spruceTierGeo(),
  blob: leafClumpGeo(2, 0.22),
  // (far off, the same trees with fewer facets: nobody can count them at a hundred metres)
  coneFar: spruceTierGeo(8),
  blobFar: leafClumpGeo(1, 0.22),
  trunkMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x5a4332, roughness: 1, vertexColors: true }), { scale: 3, amount: 0.25, grain: 0.9, surface: "bark" }),
  birchMat: addDetail(new THREE.MeshStandardMaterial({ color: 0xe0dccf, roughness: 0.9, vertexColors: true }), { scale: 2.2, amount: 0.5, grain: 0.3, surface: "bark" }),
  spruceMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x2f5232, roughness: 0.95, vertexColors: true }), { scale: 2.5, amount: 0.2, grain: 0.6, surface: "needles", seeThrough: 3.6 }),
  pineMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x3f6334, roughness: 0.95, vertexColors: true }), { scale: 2.5, amount: 0.2, grain: 0.6, surface: "needles", seeThrough: 3.6 }),
  leafMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x6a8a40, roughness: 0.9, vertexColors: true }), { scale: 2.5, amount: 0.2, grain: 0.6, surface: "needles", seeThrough: 3.6 }),
  // (the trees of the other biomes: the broadleaf oak, the savanna's acacia, the rain forest's giants, the palm, desert scrub)
  frond: frondGeo(),
  oakMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x3d5e28, roughness: 0.9, vertexColors: true }), { scale: 2.5, amount: 0.22, grain: 0.6, surface: "needles", seeThrough: 3.6 }),
  acaciaMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x6b7a34, roughness: 0.9, vertexColors: true }), { scale: 2.5, amount: 0.22, grain: 0.6, surface: "needles", seeThrough: 3.6 }),
  jungleMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x2a5622, roughness: 0.85, vertexColors: true }), { scale: 2.5, amount: 0.22, grain: 0.6, surface: "needles", seeThrough: 3.6 }),
  scrubMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x6e7448, roughness: 0.95, vertexColors: true }), { scale: 2.5, amount: 0.25, grain: 0.6, surface: "needles" }),
  palmMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x4f8030, roughness: 0.8, side: THREE.DoubleSide }), { scale: 2.5, amount: 0.18, grain: 0.5, surface: "needles", seeThrough: 3.6 }),
  palmTrunkMat: addDetail(new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1, vertexColors: true }), { scale: 3, amount: 0.25, grain: 0.9, surface: "bark" }),
};
for (const k of ["trunk", "cone", "blob", "frond"]) TREE[k]._shared = true;
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
  let pi = 0;
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
    }
  }
  // birch: a pale trunk and a loose, many-clumped crown
  const leaves = new THREE.InstancedMesh(swayGeo(BLOB, kinds.birch.length * 6), TREE.leafMat, kinds.birch.length * 6);
  let li = 0, bi = 0;
  for (const t of kinds.birch) {
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(0.5, t.h * 0.78, 0.5); dummy.updateMatrix();
    sway(birchTr, bi, t); birchTr.setMatrixAt(bi++, dummy.matrix); (t.slots ??= []).push([birchTr, bi - 1]);
    const seed = t.x * 0.71 + t.z * 0.29;
    for (let i = 0; i < 6; i++) {
      const a = t.rot + i * 2.4, rad = i === 0 ? 0 : 0.5 + (i % 3) * 0.35;
      dummy.position.set(t.x + Math.cos(a) * rad, t.y + t.h * (0.56 + (i / 6) * 0.36), t.z + Math.sin(a) * rad);
      const w = t.h * (0.15 - i * 0.008); dummy.scale.set(w, w * 0.85, w); dummy.rotation.set(0, a, 0); dummy.updateMatrix();
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
  for (const m of [trunks, birchTr, spruceC, pineB, leaves, oakC, acaC, junC, scrC, palmTr, fronds]) { m.userData.far = far; m.castShadow = !far && m !== trunks && m !== birchTr && m !== palmTr; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); out.push(m); }
  return out;
}

// ---------------------------------------------------------------------------
//  furniture and props, into a Builder
// ---------------------------------------------------------------------------
export const P = {
  crate(b, x, z, s = 1, y = 0, ry = 0) {
    b.box(1 * s, 1 * s, 1 * s, x, y + 0.5 * s, z, 0x8a6a45, ry, 0.08);
    b.box(1.02 * s, 0.1 * s, 1.02 * s, x, y + 0.9 * s, z, 0x6a4f32, ry);
    b.box(1.02 * s, 0.1 * s, 1.02 * s, x, y + 0.1 * s, z, 0x6a4f32, ry);
  },
  barrel(b, x, z, y = 0) {
    b.add(new THREE.CylinderGeometry(0.34, 0.3, 0.95, 10), 0x7a5634, x, y + 0.475, z, 0, 0, 0, 1, 1, 1, 0.08);
    b.add(new THREE.CylinderGeometry(0.355, 0.355, 0.05, 10), 0x3a3a3a, x, y + 0.2, z);
    b.add(new THREE.CylinderGeometry(0.355, 0.355, 0.05, 10), 0x3a3a3a, x, y + 0.75, z);
  },
  sack(b, x, z, y = 0, ry = 0) { b.add(new THREE.SphereGeometry(0.32, 8, 6), 0xc8b48a, x, y + 0.26, z, 0, ry, 0, 1, 0.8, 0.8, 0.1); },
  table(b, x, z, w = 2, d = 0.9, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    b.box(w, 0.08, d, x, 0.78, z, 0x6b4a2e, ry);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ox = lx * (w / 2 - 0.1), oz = lz * (d / 2 - 0.1);
      b.box(0.08, 0.76, 0.08, x + ox * c + oz * s, 0.38, z - ox * s + oz * c, 0x4f3620, ry);
    }
  },
  bench(b, x, z, w = 1.8, ry = 0) {
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
    { const [px, pz] = at(0, -0.24); cl.add(CYL8, 0xe9e1cc, px, 0.56, pz, 0, ry, Math.PI / 2, 0.11, 0.97, 0.09); }
    // the pillow, plump, against the headboard
    { const [px, pz] = at(0, -0.72); cl.add(BALL, 0xf1ebdc, px, 0.58, pz, 0, ry, 0, 0.62, 0.17, 0.34); }
  },
  // a straw pallet on the floor: a fat tick of straw, a grey-brown wool blanket with a stripe at its ends, a sack of a pillow
  pallet(b, x, z, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c], cl = b.cloth || b;
    { const [px, pz] = at(0, 0); cl.add(RBOX, 0xc2aa72, px, 0.09, pz, 0, ry, 0, 0.9, 0.18, 1.9); }
    // (a few straws sticking out of the ticking at the foot)
    for (const lx of [-0.3, -0.05, 0.22]) { const [px, pz] = at(lx, 0.94); b.add(CYL8, 0xd8c07a, px, 0.1, pz, 1.2, ry + lx, 0, 0.012, 0.16, 0.012); }
    { const [px, pz] = at(0, 0.32); cl.add(RBOX, 0x6e5e4c, px, 0.15, pz, 0, ry, 0, 0.94, 0.14, 1.22); }
    for (const lz of [-0.22, 0.86]) { const [px, pz] = at(0, lz); cl.box(0.86, 0.143, 0.08, px, 0.15, pz, 0x9a3a2c, ry); }
    { const [px, pz] = at(0, -0.68); cl.add(BALL, 0xe2d8c0, px, 0.22, pz, 0, ry, 0, 0.56, 0.14, 0.32); }
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
export function logMats(kind) {
  if (kind === "birch") return _logMatsK.birch || (_logMatsK.birch = birchLogMats());
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
const LOG_GEO = new THREE.CylinderGeometry(1, 1, 1, 12, 1); LOG_GEO._shared = true;
// many logs in one draw: [{x,y,z,len,r,dir:"x"|"z"}], each a touch uneven
// ---- a stump: no two alike, and each kind its own. A spruce's (the brown fir) dark red-brown and scaly, its roots
// spread shallow; a pine's thick-plated, grey at the foot and fox-orange above, the cut face warm and beaded with resin,
// a few stout roots going down; a birch's slim and low, white with black marks, its bark peeling in curls at the cut,
// the face pale and often gone dark at the heart. Each from a seed, so the same tree leaves the same stump ----
const RING_TEX = {}, BARK_TEX = {};
const STUMP_KIND = {
  spruce: { face: "#d8b884", ring: [120, 78, 40], rim: "#3e2a1c", r: 0.24, h: [0.22, 0.6], roots: [3, 6], rootK: 1.0 },
  pine:   { face: "#e2b676", ring: [150, 92, 40], rim: "#5a3a26", r: 0.26, h: [0.3, 0.7], roots: [2, 4], rootK: 1.25, resin: true },
  birch:  { face: "#efe2c4", ring: [180, 150, 110], rim: "#f2efe8", r: 0.17, h: [0.15, 0.42], roots: [2, 4], rootK: 0.8, curls: true, rot: 0.55 },
  oak:    { face: "#d4b07a", ring: [130, 90, 50], rim: "#4a4038", r: 0.34, h: [0.3, 0.6], roots: [4, 6], rootK: 1.35 },
  acacia: { face: "#caa070", ring: [140, 90, 50], rim: "#4a3a2e", r: 0.17, h: [0.2, 0.45], roots: [2, 3], rootK: 0.9 },
  jungle: { face: "#e0c290", ring: [150, 110, 70], rim: "#8a8478", r: 0.46, h: [0.4, 0.9], roots: [5, 7], rootK: 1.9 },
  palm:   { face: "#c8b28a", ring: [150, 130, 100], rim: "#7a6a52", r: 0.15, h: [0.3, 0.6], roots: [0, 0], rootK: 0.6 },
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
export function makeStump(t, kind = "spruce") {
  if (!STUMP_KIND[kind]) kind = "spruce";
  const K = STUMP_KIND[kind];
  let sd = Math.abs(Math.floor((t.x || 0) * 73.1 + (t.z || 0) * 191.7)) + 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const big = Math.max(0.6, Math.min(1.6, (t.h || 10) / 10));
  const r = K.r * big * (0.85 + rnd() * 0.3), h = K.h[0] + rnd() * (K.h[1] - K.h[0]), tilt = 0.08 + rnd() * 0.3, dirA = rnd() * Math.PI * 2;
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ map: barkTex(kind, Math.floor(rnd() * 4)), roughness: kind === "birch" ? 0.75 : 0.95 });
  const face = new THREE.MeshStandardMaterial({ map: ringTex(Math.floor(rnd() * 6), kind), roughness: 0.95 });
  const geo = new THREE.CylinderGeometry(r, r * (kind === "birch" ? 1.12 : 1.25), h, 12, 1);
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
  const rootM = new THREE.MeshStandardMaterial({ map: bark.map, roughness: 0.95 });
  for (let k = 0, n = K.roots[0] + Math.floor(rnd() * (K.roots[1] - K.roots[0] + 1)); k < n; k++) {
    const a = k / n * Math.PI * 2 + rnd() * 0.8, L = r * (0.8 + rnd() * 0.7) * K.rootK;
    const rt = new THREE.Mesh(new THREE.ConeGeometry(r * (0.42 + rnd() * 0.18) * K.rootK, L, 6), rootM);
    // (the cone's tip turned out along the ground and a little down into it, its thick end against the trunk)
    rt.rotation.order = "YXZ"; rt.rotation.y = -a; rt.rotation.z = -(Math.PI / 2 + 0.18 + rnd() * 0.15); rt.scale.set(1, 1, 0.75);
    rt.position.set(Math.cos(a) * (r * 0.75 + L * 0.45), 0.07, Math.sin(a) * (r * 0.75 + L * 0.45)); rt.castShadow = true; g.add(rt);
  }
  // (and, now and then, moss on the low side of a spruce or a pine)
  if (kind !== "birch" && rnd() < 0.4) { const ms = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4a6a2a, { surface: "needles" })); ms.scale.set(1.3, 0.35, 1); ms.position.set(-Math.cos(dirA) * r * 0.9, 0.04, -Math.sin(dirA) * r * 0.9); g.add(ms); }
  g.rotation.y = rnd() * 6.28;
  return g;
}
export function makeLogs(list, seed = 1, kind = null) {
  const r = rng(seed), m = new THREE.InstancedMesh(LOG_GEO, logMats(kind), list.length);
  const o = new THREE.Object3D();
  list.forEach((l, i) => {
    o.position.set(l.x, l.y, l.z);
    // (a log lies along x or z, or stands up: "y")
    o.rotation.set(l.dir === "z" ? Math.PI / 2 : 0, l.ry || 0, l.dir === "x" ? Math.PI / 2 : 0);
    o.rotateY(r() * Math.PI * 2);   // (each turned about its own length)
    const rr = l.r * (0.88 + r() * 0.24);
    o.scale.set(rr, l.len * (0.94 + r() * 0.1), rr);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
  });
  m.castShadow = true; m.receiveShadow = true;
  return m;
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

// ---- a horse, low-poly: body, neck and head, four legs that swing from the shoulder and hip, a mane and a tail ----
// facing +Z, standing on y = 0; { root, legs: [fl, fr, bl, br], neck, gait(t, k) } — gait swings the legs (k: 0 still, 1 gallop)
export function makeHorse(coat = 0x6a4428, seed = 1) {
  const root = new THREE.Group();
  // (a coat, not timber: no grain on it)
  const hide = mat(coat, { roughness: 0.9, surface: "none" }), dark = mat(0x2a1c12, { roughness: 0.9, surface: "none" }), hoof = mat(0x1a1410, { roughness: 0.8, surface: "none" });
  const bx = (w, h, d, x, y, z, m, p = root) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  // the barrel, a little rounder at the chest and the rump
  bx(0.5, 0.52, 1.5, 0, 1.18, 0, hide);
  bx(0.46, 0.5, 0.36, 0, 1.2, 0.72, hide);
  bx(0.48, 0.5, 0.34, 0, 1.22, -0.72, hide);
  // neck and head, from the withers forward and up
  const neck = new THREE.Group(); neck.position.set(0, 1.36, 0.82); neck.rotation.x = -0.75; root.add(neck);
  bx(0.26, 0.3, 0.75, 0, 0, 0.3, hide, neck);
  bx(0.06, 0.14, 0.7, 0, 0.19, 0.28, dark, neck);                   // the mane
  const head = new THREE.Group(); head.position.set(0, 0.02, 0.66); head.rotation.x = 1.25; neck.add(head);
  bx(0.22, 0.2, 0.55, 0, 0, 0.22, hide, head);
  bx(0.18, 0.16, 0.12, 0, -0.02, 0.5, dark, head);                  // the muzzle
  for (const s of [-1, 1]) bx(0.05, 0.12, 0.05, s * 0.08, 0.15, 0.02, hide, head);   // ears
  // the saddle and the blanket under it
  bx(0.56, 0.05, 0.62, 0, 1.46, 0.05, mat(0x6a2a20, { roughness: 0.9, surface: "cloth" }));
  bx(0.4, 0.1, 0.48, 0, 1.51, 0.05, mat(0x3a2414, { roughness: 0.7, surface: "none" }));
  // the tail
  const tail = new THREE.Group(); tail.position.set(0, 1.35, -0.9); tail.rotation.x = 0.5; root.add(tail);
  bx(0.1, 0.1, 0.62, 0, 0, -0.3, dark, tail);
  // the legs: an upper and a lower, hung from the shoulder or hip
  const legs = [];
  for (const [x, z] of [[-0.17, 0.62], [0.17, 0.62], [-0.17, -0.62], [0.17, -0.62]]) {
    const l = new THREE.Group(); l.position.set(x, 1.0, z); root.add(l);
    bx(0.13, 0.52, 0.15, 0, -0.26, 0, hide, l);
    const low = new THREE.Group(); low.position.y = -0.5; l.add(low);
    bx(0.09, 0.46, 0.1, 0, -0.23, 0, hide, low);
    bx(0.12, 0.06, 0.13, 0, -0.47, 0.01, hoof, low);
    l.userData.low = low; legs.push(l);
  }
  // its gaits as a horse has them: a four-beat walk, a trot on the diagonals, a gallop with the hinds and then the fores
  // (fore left, fore right, hind left, hind right: when each comes down, and for how much of the stride); the stride
  // lengthens with the pace, and a hoof on the ground sweeps back exactly as fast as the horse goes over it
  const GAITS = { walk: { off: [0.25, 0.75, 0, 0.5], duty: 0.62, stride: 1.7 }, trot: { off: [0, 0.5, 0.5, 0], duty: 0.42, stride: 2.7 }, gallop: { off: [0.55, 0.65, 0, 0.1], duty: 0.3, stride: 4.6 } };
  let ph = 0;
  const gait = (dt, speed) => {
    const g = speed < 2.6 ? GAITS.walk : speed < 6 ? GAITS.trot : GAITS.gallop, still = Math.min(1, speed / 0.8);
    ph = (ph + dt * speed / g.stride) % 1;
    const A = Math.min(0.62, g.duty * g.stride / 2.0) * still;
    legs.forEach((l, i) => {
      const u = (ph + g.off[i]) % 1, front = i < 2;
      let a, fold = 0;
      if (u < g.duty) a = -A + 2 * A * (u / g.duty);
      else { const q = (u - g.duty) / (1 - g.duty), e = q * q * (3 - 2 * q); a = A - 2 * A * e; fold = Math.sin(q * Math.PI) * (front ? 1.2 : 0.8) * still; }
      l.rotation.x = a;
      l.userData.low.rotation.x += ((front ? fold : -fold * 0.7) - l.userData.low.rotation.x) * Math.min(1, dt * 30);
    });
    const k = Math.min(1, speed / 8);
    // the head nods with each stride (twice at the walk), and the tail lifts with the pace
    neck.rotation.x = -0.75 + Math.sin(ph * Math.PI * 2 * (g === GAITS.walk ? 2 : 1)) * (0.05 + 0.05 * k) * still;
    tail.rotation.x = 0.5 + k * 0.4 + Math.sin(ph * Math.PI * 4) * 0.1 * k;
    return ph;
  };
  return { root, legs, neck, gait };
}

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
export function makeRowboat() {
  const g = new THREE.Group(), wood = mat(0x8a6440, { surface: "wood" }), dark = mat(0x5a3e26, { surface: "wood" }), tar = mat(0x2e2620, { surface: "none" });
  // (the hull: a shell, its sides each in four strakes, wider at the gunwale)
  const L = 3.6, W = 1.25, H = 0.62;
  const shape = (y, k) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, z = -L / 2 + t * L, w = W / 2 * k * (t < 0.75 ? Math.pow(Math.sin(Math.min(1, (t + 0.08) / 0.83) * Math.PI / 2), 0.6) : Math.cos((t - 0.75) / 0.25 * Math.PI / 2)); pts.push([w, y, z]); } return pts; };
  for (let s = 0; s < 4; s++) {
    const y0 = -0.18 + s * (H / 4), y1 = y0 + H / 4 + 0.02, k0 = 0.55 + s * 0.15, k1 = k0 + 0.15, a = shape(y0, k0), b = shape(y1, k1);
    for (const sx of [-1, 1]) {
      const P = [], I = [];
      for (let i = 0; i < a.length; i++) { P.push(a[i][0] * sx, a[i][1], a[i][2], b[i][0] * sx, b[i][1], b[i][2]); }
      for (let i = 0; i < a.length - 1; i++) { const q = i * 2; I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, s === 0 ? tar : s % 2 ? wood : dark); m.material.side = THREE.DoubleSide; m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
  }
  // (the bottom boards, the transom across the stern, the stem post at the bow, a rail along each gunwale)
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(W * 0.5, 0.04, L * 0.8), dark, 0, -0.15, -0.1);
  add(new THREE.BoxGeometry(W * 0.95, H * 0.9, 0.06), wood, 0, 0.1, -L / 2 + 0.02);
  add(new THREE.BoxGeometry(0.07, H + 0.15, 0.1), dark, 0, 0.12, L / 2 - 0.02, 0.25, 0, 0);
  for (const z of [-0.5, 0.45]) add(new THREE.BoxGeometry(W * 0.86, 0.05, 0.24), wood, 0, 0.22, z);
  // the oars, each from its thole out over the side to the blade
  const oars = [];
  for (const sx of [-1, 1]) {
    const o = new THREE.Group(); o.position.set(sx * W * 0.47, 0.42, 0.05); g.add(o);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.4, 6), wood); shaft.rotation.z = Math.PI / 2; shaft.position.x = sx * 0.75; o.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.15), wood); blade.position.x = sx * 1.85; o.add(blade);
    o.rotation.z = -sx * 0.32; oars.push(o);
  }
  g.userData.oars = oars;
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
