// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A NATION'S FLAG, FLOWN: a tall pole by the fire with the flag at its head, the cloth rippling in the wind. In
// Classic it's yours (made in the nations screen, N); marching on someone, it's theirs, over their settlement.

import { THREE, mat } from "./core.js";
import { G } from "./engine.js";
import { FIRE } from "./woods.js";
import { drawFlag, cleanFlag } from "./economy.js";

let flown = null;
export function flyFlag(w, f) {
  if (flown) { flown.w.root.remove(flown.g); const i = G.onFrame.indexOf(flown.tick); if (i >= 0) G.onFrame.splice(i, 1); flown = null; }
  f = cleanFlag(f); if (!w || !f || !w.heightAt) return;
  // (somewhere near the fire with room for it: not through a roof)
  let x = FIRE.x + 7.5, z = FIRE.z - 4.5;
  const town = G.town;
  if (town && town.fits) { found: for (let r = 6; r < 22; r += 1.5) for (let a = 0.4; a < 6.6; a += 0.45) { const px = FIRE.x + Math.cos(a) * r, pz = FIRE.z + Math.sin(a) * r; if (town.fits("well", px, pz, 0)) { x = px; z = pz; break found; } } }
  const y = w.heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 8, 8), mat(0x5a4230, { surface: "wood" })); pole.position.y = 4; pole.castShadow = true; g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xa88a46, { metalness: 0.6, roughness: 0.4 })); knob.position.y = 8.05; g.add(knob);
  // the stones round its foot
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), mat(0x7a7468, { roughness: 1 })); s.position.set(Math.cos(a) * 0.35, 0.08, Math.sin(a) * 0.35); g.add(s); }
  // the cloth: a plane in many strips, waved from the hoist out to the fly, more at the free end
  const cv = document.createElement("canvas"); cv.width = 192; cv.height = 128; drawFlag(cv, f);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.8, 1.2, 18, 4); geo.translate(0.9, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 }));
  cloth.position.set(0.06, 7.3, 0); cloth.castShadow = true; g.add(cloth);
  const base = Float32Array.from(geo.attributes.position.array);
  let t = Math.random() * 10;
  const tick = dt => {
    t += dt; const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const bx = base[i * 3], by = base[i * 3 + 1], k = bx / 1.8; p.setZ(i, Math.sin(t * 3.2 - bx * 3.4 + by * 0.6) * 0.13 * k + Math.sin(t * 5.1 - bx * 6) * 0.03 * k); p.setY(i, by - k * k * 0.06); }
    p.needsUpdate = true; geo.computeVertexNormals();
  };
  G.onFrame.push(tick);
  w.root.add(g); flown = { w, g, tick };
}
