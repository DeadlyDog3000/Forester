// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// People, trees, and the furniture of a life: all built from primitives at
// load, the way the first Forester built its sounds instead of loading them.

import { THREE, mat, MAT, Builder, prismGeo, makeFlame, rng, TAU } from "./core.js";

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

  const M = c => mat(c, { roughness: 0.95 });
  const skinM = mat(skin, { roughness: 0.62 });
  const add = (parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  const brass = mat(0xb8913a, { metalness: 0.8, roughness: 0.35 });
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);

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
    add(hips, GEO("skirt", () => new THREE.CylinderGeometry(0.19, 0.37, 0.86, 18, 3)), M(o.skirtColor ?? coat), 0, -0.4);
    add(hips, GEO("hem", () => new THREE.CylinderGeometry(0.372, 0.378, 0.08, 18)), M(shade(o.skirtColor ?? coat, -0.08)), 0, -0.8);
    if (o.apron) {
      add(hips, GEO("apron", () => { const g = new THREE.CylinderGeometry(0.2, 0.37, 0.72, 12, 1, true, -0.75, 1.5); return g; }), mat(o.apron, { roughness: 0.95, side: THREE.DoubleSide }), 0, -0.33, 0.012);
      add(hips, GEO("waistband", () => new THREE.CylinderGeometry(0.172, 0.172, 0.05, 14)), mat(o.apron), 0, 0.03);
    }
    add(hips, GEO("shawl", () => { const g = new THREE.CylinderGeometry(0.13, 0.23, 0.14, 14, 1, true); return g; }), mat(o.shawl ?? shade(coat, 0.12), { roughness: 1, side: THREE.DoubleSide }), 0, 0.56);
  } else if (o.longCoat !== false) {
    // the skirts of the coat, open at the front
    add(hips, GEO("coattail", () => new THREE.CylinderGeometry(0.17, 0.25, 0.46, 14, 1, true, 0.55, TAU - 1.1)), mat(coat, { roughness: 0.95, side: THREE.DoubleSide }), 0, -0.2);
  }
  add(hips, GEO("belt", () => { const g = new THREE.CylinderGeometry(0.172, 0.172, 0.05, 14); g.scale(1, 1, 0.7); return g; }), M(0x2a1f16), 0, 0.04);

  // arms: shoulder, sleeve, forearm, a deep cuff, a hand with a thumb
  const mkArm = side => {
    const p = new THREE.Group(); p.position.set(side * 0.235, 0.53, 0); hips.add(p);
    add(p, GEO("shoulderBall", () => new THREE.SphereGeometry(0.066, 10, 8)), M(coat), 0, 0);
    add(p, GEO("upperArm", () => new THREE.CylinderGeometry(0.058, 0.05, 0.28, 10)), M(coat), 0, -0.15);
    add(p, GEO("forearm", () => new THREE.CylinderGeometry(0.05, 0.043, 0.24, 10)), M(coat), 0, -0.38);
    add(p, GEO("cuff", () => new THREE.CylinderGeometry(0.064, 0.058, 0.08, 10)), M(o.cuff ?? 0xd9d2c3), 0, -0.47);
    const h = add(p, GEO("hand", () => { const g = new THREE.SphereGeometry(0.046, 10, 8); g.scale(0.8, 1.15, 0.55); return g; }), skinM, 0, -0.56);
    add(h, GEO("thumb", () => { const g = new THREE.CapsuleGeometry(0.014, 0.03, 3, 6); return g; }), skinM, side * -0.028, 0.01, 0.02, 0.3, 0, side * 0.5);
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
  add(neck, GEO("jaw", () => { const g = new THREE.SphereGeometry(0.085, 12, 8); g.scale(1, 0.8, 1); return g; }), skinM, 0, 0.11, 0.02);
  for (const sx of [-1, 1]) {
    add(neck, GEO("ear", () => { const g = new THREE.SphereGeometry(0.026, 8, 6); g.scale(0.5, 1, 0.8); return g; }), skinM, sx * 0.105, 0.165, -0.005);
    add(neck, GEO("eyeWhite", () => { const g = new THREE.SphereGeometry(0.014, 8, 6); g.scale(1.2, 0.75, 0.6); return g; }), mat(0xe8e2d8, { roughness: 0.3 }), sx * 0.04, 0.185, 0.103);
    add(neck, GEO("pupil", () => new THREE.SphereGeometry(0.009, 6, 4)), mat(o.eyes ?? r.pick([0x3a2a1a, 0x2e4a6a, 0x3e5a3a, 0x4a3a2a]), { roughness: 0.2 }), sx * 0.04, 0.185, 0.111);
    add(neck, GEO("brow", () => new THREE.BoxGeometry(0.042, 0.009, 0.012)), M(shade(hair, -0.05)), sx * 0.041, 0.212, 0.108, 0, 0, sx * -0.12);
    add(neck, GEO("cheek", () => new THREE.SphereGeometry(0.02, 6, 4)), mat(shade(skin, -0.03), { roughness: 0.7 }), sx * 0.055, 0.145, 0.088);
  }
  add(neck, GEO("nose", () => { const g = new THREE.ConeGeometry(0.018, 0.05, 6); g.rotateX(Math.PI / 2 + 0.35); return g; }), skinM, 0, 0.16, 0.115);
  add(neck, GEO("mouth", () => new THREE.BoxGeometry(0.038, 0.008, 0.01)), mat(0x8a4a42), 0, 0.118, 0.1);
  // hair
  const hairM = mat(hair, { roughness: 0.85 });
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
  if (o.sash) add(hips, GEO("sash", () => { const g = new THREE.TorusGeometry(0.2, 0.025, 6, 20); g.scale(1, 1, 0.66); return g; }), M(o.sash), 0, 0.3, 0, Math.PI / 2 - 0.1, 0, 0.75);
  if (o.chain) add(hips, GEO("chain", () => new THREE.TorusGeometry(0.1, 0.012, 6, 16)), mat(0xd4af37, { metalness: 0.9, roughness: 0.3 }), 0, 0.46, 0.08, 1.15);

  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });

  // held things hang off the right hand
  const held = new THREE.Group(); held.position.y = -0.58; armR.add(held);
  const heldL = new THREE.Group(); heldL.position.y = -0.58; armL.add(heldL);

  const P = {
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
          const c = (t * 1.25) % 1;
          const a = c < 0.55 ? -2.7 * (c / 0.55) : -2.7 + 2.7 * Math.min(1, (c - 0.55) / 0.15);
          armR.rotation.set(a, 0, -0.1); armL.rotation.set(a, 0, 0.1);
          body.rotation.x = c > 0.55 && c < 0.8 ? 0.25 : 0.05;
          break;
        }
        case "hammer": { const c = (t * 2.2) % 1; armR.rotation.set(-1.0 - Math.sin(c * Math.PI) * 1.2, 0, -0.1); armL.rotation.set(-0.8, 0, 0.1); body.rotation.x = 0.35; break; }
        case "sit": armR.rotation.set(-0.7, 0.2, 0); armL.rotation.set(-0.7, -0.2, 0); break;
        case "grieve": armR.rotation.set(-1.9, -0.6, 0); armL.rotation.set(-1.9, 0.6, 0); neck.rotation.x = 0.4; break;
        case "bound": armR.rotation.set(0.35, -0.5, 0.2); armL.rotation.set(0.35, 0.5, -0.2); break;
      }
      if (this.pose !== "grieve") neck.rotation.x += ((this.pose === "sit" ? 0.1 : 0) - neck.rotation.x) * Math.min(1, dt * 6);
      neck.rotation.y += (this.look - neck.rotation.y) * Math.min(1, dt * 5);
      if (this.sitting > 0.01) { legL.rotation.x = -1.45 * this.sitting; legR.rotation.x = -1.45 * this.sitting; }
    },
    setPose(p) { if (p !== this.pose) { this.pose = p; this.poseT = 0; } },
  };
  return P;
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
export function makeAxe() {
  const g = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.72, 6), mat(0x7a5a3a));
  haft.position.y = 0.3; g.add(haft);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.16), mat(0x5d6166, { metalness: 0.8, roughness: 0.45 }));
  head.position.set(0, 0.62, 0.06); g.add(head);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.14, 0.04), mat(0xb8bcc2, { metalness: 0.9, roughness: 0.3 }));
  edge.position.set(0, 0.62, 0.15); g.add(edge);
  return g;
}
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
export const TREE = {
  trunk: new THREE.CylinderGeometry(0.16, 0.28, 1, 7).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
  blob: new THREE.IcosahedronGeometry(1, 1),
  trunkMat: new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1 }),
  birchMat: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.9 }),
  spruceMat: new THREE.MeshStandardMaterial({ color: 0x2c4a2e, roughness: 1, flatShading: true }),
  pineMat: new THREE.MeshStandardMaterial({ color: 0x3b5a30, roughness: 1, flatShading: true }),
  leafMat: new THREE.MeshStandardMaterial({ color: 0x5d7a3a, roughness: 1, flatShading: true }),
};
for (const k of ["trunk", "cone", "blob"]) TREE[k]._shared = true;

// A single tree as its own group, pivoted at the base so it can fall.
export function makeSpruce(h = 9, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(TREE.trunk, TREE.trunkMat); trunk.scale.set(1.1, h * 0.45, 1.1); g.add(trunk);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const c = new THREE.Mesh(TREE.cone, TREE.spruceMat);
    const w = (1 - t * 0.75) * h * 0.24 * r.range(0.9, 1.1);
    c.scale.set(w, h * 0.34, w);
    c.position.y = h * (0.18 + t * 0.2);
    c.rotation.y = r() * TAU;
    g.add(c);
  }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// Instanced forest: returns meshes to add; `list` is [{x,y,z,h,kind,rot}]
export function forestInstances(list) {
  const dummy = new THREE.Object3D();
  const kinds = { spruce: [], pine: [], birch: [] };
  for (const t of list) kinds[t.kind].push(t);
  const out = [];
  const trunks = new THREE.InstancedMesh(TREE.trunk, TREE.trunkMat, kinds.spruce.length + kinds.pine.length);
  const birchTr = new THREE.InstancedMesh(TREE.trunk, TREE.birchMat, kinds.birch.length);
  let ti = 0;
  const spruceC = new THREE.InstancedMesh(TREE.cone, TREE.spruceMat, kinds.spruce.length * 4);
  let si = 0;
  for (const t of kinds.spruce) {
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(1.1, t.h * 0.45, 1.1); dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
    for (let i = 0; i < 4; i++) {
      const f = i / 4, w = (1 - f * 0.75) * t.h * 0.24;
      dummy.position.set(t.x, t.y + t.h * (0.18 + f * 0.2), t.z); dummy.scale.set(w, t.h * 0.34, w); dummy.rotation.y = t.rot + i; dummy.updateMatrix();
      spruceC.setMatrixAt(si++, dummy.matrix);
    }
  }
  const pineB = new THREE.InstancedMesh(TREE.blob, TREE.pineMat, kinds.pine.length * 2);
  let pi = 0;
  for (const t of kinds.pine) {
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(0.9, t.h * 0.8, 0.9); dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
    for (let i = 0; i < 2; i++) {
      dummy.position.set(t.x + (i ? 0.5 : -0.3), t.y + t.h * (0.78 + i * 0.12), t.z + (i ? -0.2 : 0.3));
      const w = t.h * (0.2 - i * 0.05);
      dummy.scale.set(w, w * 0.55, w); dummy.rotation.set(0, t.rot + i, 0); dummy.updateMatrix();
      pineB.setMatrixAt(pi++, dummy.matrix);
    }
  }
  const leaves = new THREE.InstancedMesh(TREE.blob, TREE.leafMat, kinds.birch.length * 3);
  let li = 0, bi = 0;
  for (const t of kinds.birch) {
    dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(0.55, t.h * 0.75, 0.55); dummy.updateMatrix();
    birchTr.setMatrixAt(bi++, dummy.matrix);
    for (let i = 0; i < 3; i++) {
      const a = t.rot + i * 2.1;
      dummy.position.set(t.x + Math.cos(a) * 0.6, t.y + t.h * (0.62 + i * 0.1), t.z + Math.sin(a) * 0.6);
      const w = t.h * 0.17; dummy.scale.set(w, w * 0.9, w); dummy.updateMatrix();
      leaves.setMatrixAt(li++, dummy.matrix);
    }
  }
  for (const m of [trunks, birchTr, spruceC, pineB, leaves]) { m.castShadow = m !== trunks && m !== birchTr; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); out.push(m); }
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
  bed(b, x, z, ry = 0) {
    b.box(1.0, 0.4, 2.0, x, 0.2, z, 0x5a3e28, ry);
    b.box(0.9, 0.14, 1.9, x, 0.45, z, 0xd9d0bc, ry);
    const c = Math.cos(ry), s = Math.sin(ry);
    b.box(0.92, 0.1, 1.2, x + 0.4 * s, 0.53, z + 0.4 * c, 0x7a3b33, ry);
    b.box(0.6, 0.12, 0.35, x - 0.75 * s, 0.56, z - 0.75 * c, 0xf0ebe0, ry);
    b.box(1.0, 0.8, 0.08, x - 1.0 * s, 0.4, z - 1.0 * c, 0x5a3e28, ry);
  },
  shelf(b, x, z, w = 1.6, ry = 0) {
    b.box(w, 2.2, 0.4, x, 1.1, z, 0x5a3e28, ry);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let i = 0; i < 4; i++) {
      const y = 0.3 + i * 0.52;
      b.box(w * 0.92, 0.3, 0.3, x + 0.06 * s, y + 0.16, z + 0.06 * c, [0x7a2e22, 0x2e4a6a, 0x6a5a2a, 0x3e5a3a][i], ry, 0.2);
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
  logPile(b, x, z, n = 6, ry = 0, y = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    let k = 0;
    // rows of four and three, laid alternately, as high as it takes
    for (let row = 0; k < n; row++) for (let i = 0, per = row % 2 ? 3 : 4; i < per && k < n; i++, k++) {
      const ox = (i - (per - 1) / 2) * 0.34;
      b.add(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 8), 0x7a5634, x + ox * c, y + 0.16 + row * 0.29, z - ox * s, Math.PI / 2, ry, 0, 1, 1, 1, 0.1);
    }
  },
};

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
