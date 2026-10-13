// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// What a ball, a blade and a burst do to a man, and what they leave: the spray and the fine red mist of a wound, the
// blood on the ground where he stood and the pool that spreads under him where he fell, his coat darkening with it,
// and — a cannonball or a grenade — an arm or a leg torn away, flung, and the stump pumping.

import { THREE } from "./core.js";
import { G } from "./engine.js";
import { burst } from "./fight.js";

const MAX = 160;                 // (marks on the ground, the oldest going first)
const marks = [];
const rnd = (a, b) => a + Math.random() * (b - a);
const off = f => { const i = G.onFrame.indexOf(f); if (i >= 0) G.onFrame.splice(i, 1); };
const groundY = (x, z) => (G.world && G.world.heightAt ? G.world.heightAt(x, z) : 0);

// ---- the stains: a few irregular blots, drawn once ----
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = [];
  for (let v = 0; v < 4; v++) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    const blot = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.7, `rgba(255,255,255,${a * 0.85})`); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
    // (a main splash, lobes round it, and droplets thrown out further)
    blot(64, 64, 26 + Math.random() * 10, 0.95);
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, d = rnd(10, 30); blot(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rnd(8, 18), 0.9); }
    for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, d = rnd(30, 58); blot(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rnd(1.5, 5), 0.9); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; TEX.push(t);
  }
  return TEX;
}
const MATS = [];
function stainMat(dark) {
  const i = Math.floor(Math.random() * 4) + (dark ? 4 : 0);
  if (!MATS[i]) MATS[i] = new THREE.MeshStandardMaterial({ map: textures()[i % 4], color: dark ? 0x3e0403 : 0x4a0604, roughness: dark ? 0.2 : 0.5, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return MATS[i];
}
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
// (a mark let go of: a stain's own shape freed; a torn-off limb is a group of them — a stain-shaped dispose on it threw,
//  every frame, the moment a limb was the oldest mark kept, and the battle stopped dead)
function free(o) {
  if (o.parent) o.parent.remove(o);
  o.traverse(c => { if (c.geometry && c.geometry !== PLANE && c.geometry !== DRAPE) c.geometry.dispose(); });
}
function keep(m) {
  G.scene.add(m); marks.push(m);
  while (marks.length > MAX) free(marks.shift());
}
// blood on the ground at (x, z), size across; dark: a pool's, wet and deep
// (a stain bigger than a hand is laid over the ground's rises and dips, not flat across them: a flat one sank into the
//  ground where it rose, cut off along a straight line)
const DRAPE = new THREE.PlaneGeometry(1, 1, 8, 8).rotateX(-Math.PI / 2), _dv = new THREE.Vector3();
function drape(m) {
  if (m.geometry === PLANE) m.geometry = DRAPE.clone();
  const pos = m.geometry.attributes.position, base = DRAPE.attributes.position;
  m.updateMatrixWorld(true);
  for (let i = 0; i < pos.count; i++) {
    _dv.set(base.getX(i), 0, base.getZ(i)).applyMatrix4(m.matrixWorld);
    pos.setY(i, (groundY(_dv.x, _dv.z) + 0.02 - m.position.y) / (m.scale.y || 1));
  }
  pos.needsUpdate = true; m.geometry.computeBoundingSphere();
}
export function splat(x, z, size, dark = false) {
  if (!G.scene || (G.settings && G.settings.gore === false)) return null;
  const m = new THREE.Mesh(PLANE, stainMat(dark));
  m.position.set(x, groundY(x, z) + 0.015 + Math.random() * 0.006, z); m.rotation.y = Math.random() * 6.28; m.scale.set(size, 1, size * rnd(0.75, 1.25));
  if (size > 0.35) drape(m);
  m.renderOrder = 1; keep(m); return m;
}

// a drop landed: a small spot, kept (more of these than of the big stains, and dropped sooner)
const drops = [];
export function drop(x, z, k = 1) {
  if (!G.scene || (G.settings && G.settings.gore === false)) return;
  const m = new THREE.Mesh(PLANE, stainMat(false));
  m.position.set(x, groundY(x, z) + 0.012 + Math.random() * 0.004, z); m.rotation.y = Math.random() * 6.28; m.scale.setScalar(rnd(0.05, 0.11) * k);
  m.renderOrder = 1; G.scene.add(m); drops.push(m);
  while (drops.length > 160) { const o = drops.shift(); if (o.parent) o.parent.remove(o); }
}

// ---- the mist: a puff of fine red spray off the wound, the way the blow went ----
let mistTex = null;
function mist(at, dir, k) {
  if (!G.scene) return;
  if (!mistTex) { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(140,10,8,0.85)"); g.addColorStop(0.5, "rgba(110,6,4,0.4)"); g.addColorStop(1, "rgba(90,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); mistTex = new THREE.CanvasTexture(c); }
  const n = Math.round(2 + 3 * k), parts = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    s.position.copy(at); s.scale.setScalar(0.15); G.scene.add(s);
    parts.push({ s, v: dir.clone().multiplyScalar(rnd(1.2, 3.2) * k).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(0.1, 0.8), rnd(-0.5, 0.5))), g: rnd(0.5, 0.9) });
  }
  let t = 0;
  const tick = dt => {
    t += dt;
    for (const p of parts) { p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - 3 * dt); p.v.y -= 0.6 * dt; p.s.scale.setScalar(0.15 + t * 1.3 * p.g); p.s.material.opacity = Math.max(0, 0.8 * (1 - t / 0.7)); }
    if (t > 0.7) { for (const p of parts) { G.scene.remove(p.s); p.s.material.dispose(); } off(tick); }
  };
  G.onFrame.push(tick);
}

// ---- his clothes: darkening with it, a little more with every wound ----
const SOAKS = new Set(["coat", "vest", "cuff", "linen", "legs", "stockings", "sash", "skirt", "apron"]);
const BLOOD = new THREE.Color(0x3a0503);
function stain(P, amt) {
  const sc = P && P.modelScene; if (!sc) return;
  sc.traverse(o => {
    const m = o.isMesh && o.material, part = m && m.userData && m.userData.part;
    if (!part || !SOAKS.has(part) || !m.color) return;
    const u = m.userData;
    if (!u.base0) { u.base0 = m.color.clone(); u.blood = 0; const mean = u.vcMean; u.target = BLOOD.clone(); if (mean) { u.target.r /= Math.max(0.04, mean[0]); u.target.g /= Math.max(0.04, mean[1]); u.target.b /= Math.max(0.04, mean[2]); } }
    // (the coat and the shirt take most of it; the breeches and stockings less)
    u.blood = Math.min(0.55, u.blood + amt * (part === "legs" || part === "stockings" ? 0.5 : 1));
    m.color.copy(u.base0).lerp(u.target, u.blood);
  });
}

// a blow landed on a man (an Actor: a.pos, a.person): kind "hit" or "down"; dir the way it went
export function wound(a, kind, dir, at) {
  if (G.settings && G.settings.gore === false) return;
  const down = kind === "down", d = dir || new THREE.Vector3(0, 0, 1);
  mist(at, d, down ? 1 : 0.7);
  burst(at, d, "blood", down ? 14 : 8);   // (more drops still, over the ones blowLands threw)
  stain(a.person, down ? 0.2 : 0.12);
  // (thrown out behind him the way the blow went, and spattered where he stands)
  const n = down ? 4 : 2;
  for (let i = 0; i < n; i++) { const r = rnd(0.5, down ? 2.4 : 1.6); splat(a.pos.x + d.x * r + rnd(-0.3, 0.3), a.pos.z + d.z * r + rnd(-0.3, 0.3), rnd(0.25, 0.6)); }
  splat(a.pos.x + rnd(-0.3, 0.3), a.pos.z + rnd(-0.3, 0.3), rnd(0.2, 0.4));
}

// where he lies: a pool, spreading out from under him over some seconds and then still
export function pool(a, big = 1) {
  if (G.settings && G.settings.gore === false) return;
  const P = a.person;
  setTimeout(() => {
    const B = P.bones || {}, b = B.chest || B.spine || B.hips, p = b ? b.getWorldPosition(new THREE.Vector3()) : a.pos.clone();
    const m = splat(p.x, p.z, 0.1, true); if (!m) return;
    const R = rnd(1.7, 2.5) * big, sx = rnd(0.8, 1.2); let t = 0;
    const tick = dt => {
      t += dt; const k = 1 - Math.pow(1 - Math.min(1, t / 9), 2); m.scale.set(0.1 + R * k * sx, 1, 0.1 + R * k);
      // (under him wherever he comes to rest: a body thrown by a blast is still going when it starts)
      if (t < 3 && b) { b.getWorldPosition(p); m.position.set(p.x, groundY(p.x, p.z) + 0.016, p.z); }
      drape(m); if (t > 9 || !m.parent) off(tick); };
    G.onFrame.push(tick);
  }, 900);
}

// ---- a limb torn off: by a cannonball, or a grenade bursting at his feet ----
const LIMBS = [["forearm.L", "arm"], ["forearm.R", "arm"], ["shin.L", "leg"], ["shin.R", "leg"], ["upper_arm.L", "arm"], ["thigh.R", "leg"]];
function partMat(P, part, fallback) {
  let found = null;
  P.modelScene && P.modelScene.traverse(o => { if (!found && o.isMesh && o.material && o.material.userData.part === part) found = o.material; });
  return found || new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.9 });
}
function limbMesh(P, kind, upper) {
  const g = new THREE.Group(), L = upper ? 0.3 : 0.27;
  const flesh = new THREE.MeshStandardMaterial({ color: 0x6a0a08, roughness: 0.35 }), bone = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.6 });
  if (kind === "arm") {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, L, 8), partMat(P, "coat", 0x6a3a2a)); sleeve.position.y = -L / 2; g.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), partMat(P, "skin", 0xd8a888)); hand.scale.set(0.8, 1.3, 0.55); hand.position.y = -L - 0.07; g.add(hand);
  } else {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, L + 0.12, 8), partMat(P, upper ? "legs" : "stockings", 0xc8c0ae)); leg.position.y = -(L + 0.12) / 2; g.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.24), partMat(P, "leather", 0x241a14)); shoe.position.set(0, -L - 0.16, 0.06); g.add(shoe);
  }
  // (the torn end: raw, and the bone standing out of it)
  const end = new THREE.Mesh(new THREE.CircleGeometry(0.052, 10).rotateX(-Math.PI / 2), flesh); end.position.y = 0.002; g.add(end);
  const bn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.06, 6), bone); bn.position.y = 0.025; g.add(bn);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// tear one or two off (from: where the blast was; push: its force, a vector)
export function sever(a, from, push) {
  if (G.settings && G.settings.gore === false) return;
  const P = a.person, B = P.bones; if (!B || !G.scene) return;
  const n = Math.random() < 0.35 ? 2 : 1, picks = LIMBS.slice().sort(() => Math.random() - 0.5).slice(0, n);
  for (const [name, kind] of picks) {
    const b = B[name]; if (!b || b.scale.x < 0.01) continue;
    P.root.updateMatrixWorld(true);
    const at = b.getWorldPosition(new THREE.Vector3()), q = b.getWorldQuaternion(new THREE.Quaternion());
    // (the limb from the joint down gone from him: the bone shrunk to nothing, and what hung from it with it)
    b.scale.setScalar(0.001);
    const m = limbMesh(P, kind, /upper|thigh/.test(name)); m.position.copy(at); m.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
    keep(m);
    const v = (push ? push.clone() : new THREE.Vector3()).multiplyScalar(rnd(1.2, 2.2)).add(new THREE.Vector3(rnd(-2, 2), rnd(3, 6), rnd(-2, 2)));
    const spin = new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
    let t = 0, rest = false, dripT = 0;
    const tick = dt => {
      t += dt;
      if (!rest) {
        v.y -= 9.8 * dt; m.position.addScaledVector(v, dt);
        m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
        const gy = groundY(m.position.x, m.position.z) + 0.05;
        if (m.position.y < gy) { m.position.y = gy; if (Math.abs(v.y) < 2.5) { rest = true; m.rotation.x = Math.PI / 2 + rnd(-0.2, 0.2); m.rotation.z = rnd(-0.4, 0.4); splat(m.position.x, m.position.z, rnd(0.35, 0.6), true); } else { v.y *= -0.3; v.x *= 0.5; v.z *= 0.5; spin.multiplyScalar(0.5); splat(m.position.x, m.position.z, rnd(0.2, 0.4)); } }
        // (a trail of drops as it flies)
        if ((dripT -= dt) <= 0) { dripT = 0.05; burst(m.position.clone(), v.clone().multiplyScalar(-0.1), "blood", 1); }
      }
      if (t > 4 || !m.parent) off(tick);
    };
    G.onFrame.push(tick);
    // the stump, pumping: spurts in time with what's left of his heart, weaker each one
    let st = 0, beat = 0;
    const pump = dt => {
      st += dt; beat -= dt;
      if (beat <= 0 && st < 4) {
        beat = 0.55 + st * 0.12;
        const p = b.parent ? b.parent.getWorldPosition(new THREE.Vector3()) : at, w = b.getWorldPosition(new THREE.Vector3());
        const dir = w.clone().sub(p); if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0); dir.normalize();
        burst(w, dir, "blood", Math.max(2, Math.round(9 - st * 2)));
        if (Math.random() < 0.6) splat(w.x + dir.x * rnd(0.3, 1), w.z + dir.z * rnd(0.3, 1), rnd(0.15, 0.3));
      }
      if (st >= 4) off(pump);
    };
    G.onFrame.push(pump);
  }
}

// whole again (a man stood up for another battle): his limbs back, his coat its own colour
export function heal(P) {
  if (P && P.bones) for (const b of Object.values(P.bones)) if (b.scale.x < 0.01) b.scale.setScalar(1);
  P && P.modelScene && P.modelScene.traverse(o => { const u = o.isMesh && o.material && o.material.userData; if (u && u.base0) { o.material.color.copy(u.base0); u.blood = 0; } });
}
// the setting turned off: nothing of it left anywhere — the marks gone, every fallen man whole and clean
export function goreOff() {
  clearGore();
  const A = G.arena; if (A) for (const u of [...(A.units || [])]) if (u.a && u.a.person) heal(u.a.person);
}
// the field cleared of it all (the battle over)
export function clearGore() {
  for (const m of [...marks, ...drops]) free(m);
  marks.length = 0; drops.length = 0;
}
