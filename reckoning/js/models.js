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

  const M = c => mat(c);
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);

  const mkLeg = side => {
    const p = new THREE.Group(); p.position.set(side * 0.1, 0, 0); hips.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.16), M(legs)); l.position.y = -0.26; p.add(l);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.13), M(o.stockings ?? 0xd8d0c0)); sh.position.y = -0.66; p.add(sh);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.24), M(0x221a14)); b.position.set(0, -0.87, 0.04); p.add(b);
    return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.56, 0.24), M(coat));
  torso.position.y = 0.3; hips.add(torso);
  if (o.vest) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.44, 0.02), M(o.vest)); v.position.set(0, 0.32, 0.125); hips.add(v); }
  if (skirt) {
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.86, 10), M(o.skirtColor ?? coat));
    sk.position.y = -0.4; hips.add(sk);
    if (o.apron) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.7, 0.02), M(o.apron)); a.position.set(0, -0.3, 0.28); a.rotation.x = -0.17; hips.add(a); }
  } else if (o.longCoat !== false) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.26), M(coat));
    tail.position.y = -0.1; hips.add(tail);
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.26), M(0x2a1f16)); belt.position.y = 0.04; hips.add(belt);

  const mkArm = side => {
    const p = new THREE.Group(); p.position.set(side * 0.26, 0.54, 0); hips.add(p);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.12), M(coat)); a.position.y = -0.25; p.add(a);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.14), M(o.cuff ?? 0xd9d2c3)); cuff.position.y = -0.49; p.add(cuff);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), M(skin)); h.position.y = -0.56; p.add(h);
    p.userData.hand = h;
    return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const neck = new THREE.Group(); neck.position.y = 0.6; hips.add(neck);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.16), M(o.collar ?? 0xe6e0d4)); collar.position.y = 0.02; neck.add(collar);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), M(skin)); head.position.y = 0.17; head.scale.set(0.95, 1.05, 1); neck.add(head);
  const eyeM = M(0x1a1410);
  for (const sx of [-0.045, 0.045]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.01), eyeM); e.position.set(sx, 0.19, 0.117); neck.add(e); }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.04), M(skin)); nose.position.set(0, 0.15, 0.125); neck.add(nose);
  // hair: a cap of sphere, longer for the women and the old men
  const hairG = new THREE.SphereGeometry(0.135, 12, 8, 0, TAU, 0, Math.PI * 0.55);
  const hm = new THREE.Mesh(hairG, M(hair)); hm.position.set(0, 0.19, -0.01); neck.add(hm);
  if (o.longHair || skirt) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.22, o.longHair === "short" ? 0.14 : 0.26, 0.08), M(hair));
    back.position.set(0, o.longHair === "short" ? 0.12 : 0.05, -0.1); neck.add(back);
  }
  if (o.beard) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), M(o.beard === true ? hair : o.beard)); b.position.set(0, 0.08, 0.1); neck.add(b); }

  const hat = o.hat;
  if (hat === "tricorn" || hat === "hat") {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, hat === "tricorn" ? 3 : 14), M(o.hatColor ?? 0x1e1a18));
    brim.position.y = 0.29; neck.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.14, 12), M(o.hatColor ?? 0x1e1a18));
    crown.position.y = 0.36; neck.add(crown);
    if (hat === "tricorn") brim.rotation.y = Math.PI / 6;
  } else if (hat === "cap") {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, TAU, 0, Math.PI * 0.5), M(o.hatColor ?? 0x6a5a45));
    c.position.y = 0.22; c.scale.y = 0.8; neck.add(c);
  } else if (hat === "bonnet") {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, 0, TAU, 0, Math.PI * 0.6), M(o.hatColor ?? 0xf0ebe0));
    c.position.set(0, 0.19, -0.015); neck.add(c);
  } else if (hat === "helmet") {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 6, 0, TAU, 0, Math.PI * 0.5), mat(0x8a8d92, { metalness: 0.7, roughness: 0.4 }));
    c.position.y = 0.22; neck.add(c);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), mat(0x8a8d92, { metalness: 0.7, roughness: 0.4 }));
    rim.position.y = 0.22; neck.add(rim);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.24), mat(0x8a8d92, { metalness: 0.7, roughness: 0.4 }));
    crest.position.y = 0.33; neck.add(crest);
  }
  if (o.sash) { const sa = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.26), M(o.sash)); sa.position.y = 0.3; sa.rotation.z = 0.7; hips.add(sa); }
  if (o.chain) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 14), mat(0xd4af37, { metalness: 0.9, roughness: 0.3 })); ch.position.set(0, 0.5, 0.1); ch.rotation.x = 1.2; hips.add(ch); }

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
  for (const m of [trunks, birchTr, spruceC, pineB, leaves]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); out.push(m); }
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
    for (let row = 0; k < n; row++) for (let i = 0; i < 4 - row && k < n; i++, k++) {
      const ox = (i - (3 - row) / 2) * 0.34;
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
