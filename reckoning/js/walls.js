// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Walls, as the first Forester's Defending gives them: a palisade of
// sharpened logs laid a length at a time, gates in it, and — with Defending II
// — stone. Each length is drawn along its own x axis (the building's width),
// in a group already placed and turned; broken, it is rubble and a way through.

import { THREE, mat, rng } from "./core.js";
import { makeLogs } from "./models.js";

export const WALL_H = 3.2;

// the two ends of a length, in the world
export function wallEnds(b, def) {
  const ux = Math.cos(b.ry), uz = -Math.sin(b.ry), h = def.w / 2;
  return [{ x: b.x - ux * h, z: b.z - uz * h }, { x: b.x + ux * h, z: b.z + uz * h }];
}

const TIP = new THREE.ConeGeometry(1, 1, 7);
export function wallVis(g, b, def) {
  const r = rng(Math.floor(b.x * 31 + b.z * 17));
  const W = def.w;
  if (b.broken) {
    // what's left: a few stumps of it, and the rest in the grass
    if (def.wall === "stone") for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + r() * 0.2, 0), mat(0x8a857c, { surface: "stone" }));
      m.position.set((r() - 0.5) * W, 0.2, (r() - 0.5) * 1.2); m.rotation.set(r() * 3, r() * 3, 0); m.castShadow = true; g.add(m);
    } else {
      g.add(makeLogs([0, 1, 2].map(i => ({ x: (i - 1) * 0.9 + (r() - 0.5) * 0.3, y: 0.18, z: (r() - 0.5) * 1.2, len: 2.2 + r(), r: 0.16, dir: "x", ry: (r() - 0.5) * 0.8 })), 5));
      g.add(makeLogs([-1, 1].map(s => ({ x: s * W * 0.42, y: 0.45, z: 0, len: 0.9, r: 0.17, dir: "y" })), 7));
    }
    return;
  }
  if (def.wall === "log") {
    // sharpened logs side by side, the tops at slightly different heights, and a rail behind at waist height
    const n = Math.round(W / 0.36), L = [], tips = new THREE.InstancedMesh(TIP, mat(0x6b4a30, { surface: "bark" }), n), o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * W / n, h = WALL_H - 0.3 + r() * 0.35;
      L.push({ x, y: h / 2, z: 0, len: h, r: 0.17, dir: "y" });
      o.position.set(x, h + 0.2, 0); o.scale.set(0.17, 0.4, 0.17); o.rotation.set(0, r() * 3, 0); o.updateMatrix(); tips.setMatrixAt(i, o.matrix);
    }
    tips.castShadow = true; g.add(tips);
    g.add(makeLogs(L, n * 3 + 1));
    g.add(makeLogs([{ x: 0, y: 1.1, z: 0.24, len: W, r: 0.08, dir: "x" }, { x: 0, y: 2.3, z: 0.24, len: W, r: 0.08, dir: "x" }], 2));
    damageMarks(g, b, def, r);
    return;
  }
  if (def.wall === "stone") {
    const stone = mat(0x8e887e, { surface: "stone" });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, WALL_H, def.d), stone); body.position.y = WALL_H / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.18, def.d + 0.14), mat(0x7a756c, { surface: "stone" })); cap.position.y = WALL_H + 0.09; cap.castShadow = true; g.add(cap);
    // crenels along the top
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, def.d), stone); c.position.set(-W / 2 + 0.4 + i * (W - 0.8) / 3, WALL_H + 0.43, 0); c.castShadow = true; g.add(c); }
    damageMarks(g, b, def, r);
    return;
  }
  // a gate: two stout posts, a beam over, and two leaves of planks that swing open
  g.add(makeLogs([-1, 1].map(s => ({ x: s * (W / 2 - 0.18), y: (WALL_H + 0.6) / 2, z: 0, len: WALL_H + 0.6, r: 0.24, dir: "y" })), 11));
  g.add(makeLogs([{ x: 0, y: WALL_H + 0.45, z: 0, len: W + 0.3, r: 0.18, dir: "x" }], 12));
  const wood = mat(0x6a4a2e, { surface: "wood" }), iron = mat(0x2a2a2e, { metalness: 0.5, roughness: 0.6 });
  const leafW = W / 2 - 0.4;
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(s * (W / 2 - 0.4), 0, 0);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, WALL_H - 0.3, 0.14), wood);
    leaf.position.set(-s * leafW / 2, (WALL_H - 0.3) / 2 + 0.05, 0); leaf.castShadow = true; hinge.add(leaf);
    for (const y of [0.6, 1.6, 2.5]) { const band = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.95, 0.1, 0.17), iron); band.position.set(-s * leafW / 2, y, 0); hinge.add(band); }
    // open: swung back, inward (the +z side is inside the settlement's side of the line it was laid on)
    hinge.rotation.y = b.open ? s * -1.35 : 0;
    g.add(hinge);
  }
  damageMarks(g, b, def, r);
}
// a length that has been hacked at shows it: pale gashes, more of them the worse it is
function damageMarks(g, b, def, r) {
  const hurt = b.hp != null ? 1 - b.hp / def.hp : 0;
  const n = Math.round(hurt * 8);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.05), mat(def.wall === "stone" ? 0xb8b2a6 : 0xd9b886));
    m.position.set((r() - 0.5) * def.w * 0.9, 0.6 + r() * 1.6, -def.d / 2 - 0.03); m.rotation.z = (r() - 0.5) * 1.2; g.add(m);
  }
}
