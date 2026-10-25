// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// CLOTH. Skirts, aprons and the skirts of a coat hang and swing as cloth does: a ring of points round the hem, each
// hung from the waist, falling under its own weight, carried on by its own momentum when the body under it starts,
// stops or turns, pulled gently back to how it hangs at rest, and pushed aside by the legs as they stride through it.
// The cloth between follows: fast to the body at the waist, free at the hem.
//
// Worked out once a frame for each person that is drawn (just before it is), from where the hips and the legs are;
// laid on the mesh in its shader after the skin has been bent by the bones. Each person's own: its clothes' materials
// are its own copies.

import { THREE } from "./core.js";

const K = 8;                       // (points round the hem)
const PARTS = /_(skirt|apron|coat)$/;
const _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// the hem, the waist and where each vertex is round the body and how far down it: worked out once for each shape
function prepare(geo, hipY, hipX, hipZ) {
  if (geo.userData.cloth) return geo.userData.cloth;
  const p = geo.attributes.position, n = p.count;
  let lo = Infinity; for (let i = 0; i < n; i++) lo = Math.min(lo, p.getY(i));
  const top = hipY + 0.02, span = Math.max(0.15, top - lo);
  const at = new Float32Array(n * 2);
  // (the hem's reach from the hips, sector by sector: how far out it hangs)
  const reach = new Float32Array(K), cnt = new Float32Array(K);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i) - hipX, z = p.getZ(i) - hipZ, y = p.getY(i);
    let a = Math.atan2(z, x) / (Math.PI * 2); if (a < 0) a += 1;
    const w = Math.max(0, Math.min(1, (top - y) / span));
    at[i * 2] = a; at[i * 2 + 1] = w * w * (3 - 2 * w);
    if (w > 0.85) { const s = Math.floor(a * K) % K; reach[s] += Math.hypot(x, z); cnt[s]++; }
  }
  for (let s = 0; s < K; s++) reach[s] = cnt[s] ? reach[s] / cnt[s] : 0.25;
  // (to the points, which stand at the sectors' edges: each the mean of the two sectors it parts)
  const edge = Array.from(reach, (r, s) => (r + reach[(s + K - 1) % K]) / 2); reach.set(edge);
  geo.setAttribute("aCloth", new THREE.BufferAttribute(at, 2));
  // (hung from the hips more than the legs: tied to the thighs, it went where the thigh went, stiff as a board)
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  return (geo.userData.cloth = { lo, top, reach, si, sw, reweighted: false });
}
function reweight(info, hip, legs) {
  if (info.reweighted) return; info.reweighted = true;
  const { si, sw } = info, at = info.at;
  for (let v = 0; v < si.count; v++) {
    const fall = at[v * 2 + 1];
    if (fall <= 0) continue;
    let moved = 0; const w = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], ix = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)];
    for (let k = 0; k < 4; k++) if (legs.has(ix[k]) && w[k] > 0) { const m = w[k] * 0.45 * fall; w[k] -= m; moved += m; }
    if (!moved) continue;
    let h = ix.indexOf(hip); if (h < 0) { h = w.indexOf(Math.min(...w)); moved += w[h]; ix[h] = hip; w[h] = 0; }
    w[h] += moved; si.setXYZW(v, ...ix); sw.setXYZW(v, ...w);
  }
  si.needsUpdate = true; sw.needsUpdate = true;
}

// the material: after the skin's bones have bent it, each vertex carried by the hem's swing, as much as it hangs free
function clothMaterial(src, uni) {
  const m = src.clone(), prev = src.onBeforeCompile, key = src.customProgramCacheKey;
  m.userData = { ...src.userData, clothSrc: src };
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uClothD = uni; sh.uniforms.uClothU = uni.lie;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute vec2 aCloth; uniform vec3 uClothD[${K}]; uniform float uClothU;`)
      .replace("#include <skinning_vertex>", `#include <skinning_vertex>
        { float f = aCloth.x * ${K}.0; int i0 = int(floor(f)) % ${K}, i1 = (i0 + 1) % ${K};
          transformed += mix(uClothD[i0], uClothD[i1], fract(f)) * mix(aCloth.y, sqrt(aCloth.y), uClothU); }`);
  };
  m.customProgramCacheKey = () => (key ? key.call(src) : "") + "cloth";
  return m;
}

// its shadow: cast from the cloth where it has swung to, not where the bones alone would have left it
function clothDepth(uni) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = sh => {
    sh.uniforms.uClothD = uni; sh.uniforms.uClothU = uni.lie;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute vec2 aCloth; uniform vec3 uClothD[${K}]; uniform float uClothU;`)
      .replace("#include <skinning_vertex>", `#include <skinning_vertex>
        { float f = aCloth.x * ${K}.0; int i0 = int(floor(f)) % ${K}, i1 = (i0 + 1) % ${K};
          transformed += mix(uClothD[i0], uClothD[i1], fract(f)) * mix(aCloth.y, sqrt(aCloth.y), uClothU); }`);
  };
  d.customProgramCacheKey = () => "clothdepth";
  return d;
}
// put cloth on a person: their model's scene, as made for them (see useModel)
export function attachCloth(P, scene) {
  const meshes = [];
  scene.traverse(o => {
    if (!o.isSkinnedMesh || !o.material || Array.isArray(o.material)) return;
    if (!PARTS.test(o.material.name || "")) return;
    meshes.push(o);
  });
  if (!meshes.length) return null;
  const bones = meshes[0].skeleton.bones, bi = n => bones.findIndex(b => b.name === n);
  const hipI = bi("hips"); if (hipI < 0) return null;
  const hips = bones[hipI], legs = [["thigh.L", "shin.L"], ["shin.L", "foot.L"], ["thigh.R", "shin.R"], ["shin.R", "foot.R"]].map(([a, b]) => [bones[bi(a)], bones[bi(b)]]).filter(([a, b]) => a && b);
  const legSet = new Set(bones.map((b, i) => /^(thigh|shin)/.test(b.name) ? i : -1).filter(i => i >= 0));
  // (where the hips are in the shape's own space at rest)
  const hipRest = new THREE.Vector3().setFromMatrixPosition(_m.copy(meshes[0].skeleton.boneInverses[hipI]).invert().premultiply(new THREE.Matrix4().copy(meshes[0].bindMatrix).invert()));
  const C = { P, hips, legs, parts: [], frame: -1, t: 0, pts: null };
  for (const o of meshes) {
    // (only what hangs below the waist: a coat's body above it, sleeves and all, is left as it was)
    const g0 = o.geometry; g0.computeBoundingBox();
    if (g0.boundingBox.min.y > hipRest.y - 0.25) continue;
    // (the flowing shape a copy of the model's, made once and shared by everyone wearing it: the model's own, hung from
    //  the legs, stays for whatever has no cloth worked out — a battle's crowd, made one mesh, see mergeRig)
    let g = g0.userData.clothGeo;
    if (!g) { g = g0.clone(); g.userData = { clothSrc: g0 }; g0.userData.clothGeo = g; }
    o.geometry = g;
    const info = prepare(g, hipRest.y, hipRest.x, hipRest.z); info.at = g.attributes.aCloth.array;
    reweight(info, hipI, legSet);
    const uni = { value: Array.from({ length: K }, () => new THREE.Vector3()) };
    // (lying, more of the cloth goes with the hem, not just its lowest part: the skirt falls in over the legs)
    uni.lie = { value: 0 };
    o.material = clothMaterial(o.material, uni); o.customDepthMaterial = clothDepth(uni);
    C.parts.push({ o, info, uni }); o.userData.clothSim = C;
    o.onBeforeRender = renderer => step(C, renderer.info.render.frame);
  }
  if (!C.parts.length) return null;
  // (the hem: the longest of the pieces sets how far down and out it hangs, sector by sector)
  const deep = C.parts.reduce((a, b) => (b.info.lo < a.info.lo ? b : a));
  C.drop = deep.info.lo - hipRest.y; C.reach = deep.info.reach; C.hipRest = hipRest;
  P.cloth = C;
  return C;
}

// a person's pieces made one (a battle's crowd, see mergeRig): the one mesh swings with the same hem as the pieces did
export function clothMerged(C, sk) {
  const uni = { value: Array.from({ length: K }, () => new THREE.Vector3()) }; uni.lie = { value: 0 };
  sk.material = clothMaterial(sk.material, uni); sk.customDepthMaterial = clothDepth(uni);
  const part = { o: sk, uni }; C.parts.push(part);
  sk.onBeforeRender = renderer => step(C, renderer.info.render.frame);
  return () => { const i = C.parts.indexOf(part); if (i >= 0) C.parts.splice(i, 1); };
}
// the nearest points of two segments a→b and c→d: { p on the first, q on the second, s and t along them, d apart }
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3(), _P = new THREE.Vector3(), _Q = new THREE.Vector3();
function segSeg(a, b, c, d) {
  _u.subVectors(b, a); _w.subVectors(d, c); _r.subVectors(a, c);
  const A = _u.dot(_u), E = _w.dot(_w), F = _w.dot(_r), C = _u.dot(_r), B = _u.dot(_w), den = A * E - B * B;
  let s = den > 1e-9 ? Math.max(0, Math.min(1, (B * F - C * E) / den)) : 0;
  let t = E > 1e-9 ? (B * s + F) / E : 0;
  if (t < 0) { t = 0; s = A > 1e-9 ? Math.max(0, Math.min(1, -C / A)) : 0; } else if (t > 1) { t = 1; s = A > 1e-9 ? Math.max(0, Math.min(1, (B - C) / A)) : 0; }
  _P.copy(a).addScaledVector(_u, s); _Q.copy(c).addScaledVector(_w, t);
  return { p: _P, q: _Q, s, t, d: _P.distanceTo(_Q) };
}
// one step of the hem's swing, once a frame however many pieces of it are drawn
const G_ = new THREE.Vector3(0, -9.8, 0);
function step(C, frame) {
  if (C.frame === frame) return; C.frame = frame;
  const now = performance.now() / 1000, dt = Math.min(1 / 30, C.last ? now - C.last : 1 / 60); C.last = now;
  if (dt <= 0) return;
  const hips = C.hips; hips.updateWorldMatrix(true, false);
  const HW = hips.matrixWorld;
  // (the hips' own frame, in the world: where the hem would hang if it were stiff)
  const scale = _v.setFromMatrixScale(HW).y || 1;
  const rest = [], waist = [];
  for (let s = 0; s < K; s++) {
    const a = s / K * Math.PI * 2, r = C.reach[(s + K) % K];
    // (the bones' frame isn't the shape's: the hem's rest point found in the shape's space, then carried to the world
    //  the way the hips carry it)
    rest.push(new THREE.Vector3(Math.cos(a) * r, C.drop, Math.sin(a) * r));
    waist.push(new THREE.Vector3(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16));
  }
  // (shape space to world, through the hips as they stand now)
  // (a point of the shape hung wholly from the hips goes to the world as the skin carries it: the hips as they stand,
  //  times the hips' inverse at rest, times where the shape was bound; offset from the hips' own rest place)
  const mesh = C.parts[0].o, sk = mesh.skeleton, hipI = sk.bones.indexOf(hips);
  const W = _m.multiplyMatrices(HW, sk.boneInverses[hipI]).multiply(mesh.bindMatrix).multiply(new THREE.Matrix4().makeTranslation(C.hipRest.x, C.hipRest.y, C.hipRest.z));
  const T = rest.map(p => p.clone().applyMatrix4(W)), A = waist.map(p => p.clone().applyMatrix4(W));
  if (!C.pts || C.t > 0 && T[0].distanceTo(C.pts[0]) > 3) { C.pts = T.map(p => p.clone()); C.prev = T.map(p => p.clone()); }
  C.t += dt;
  // (how upright the hips are: 1 standing, 0 lying)
  const up = Math.max(0, _c.set(0, 1, 0).applyMatrix3(_n3.setFromMatrix4(HW)).normalize().y);
  const Gw = typeof window !== "undefined" && window.G, gy = Gw && Gw.world && Gw.world.heightAt ? (x, z) => Gw.world.heightAt(x, z) : null;
  const legs = C.legs.map(([a, b]) => [a.getWorldPosition(new THREE.Vector3()), b.getWorldPosition(new THREE.Vector3())]);
  const LR = 0.1 * scale;
  for (let s = 0; s < K; s++) {
    const p = C.pts[s], q = C.prev[s];
    _a.subVectors(p, q).multiplyScalar(0.9);            // (its momentum, some of it lost to the air: so it trails as he walks)
    q.copy(p); p.add(_a).addScaledVector(G_, dt * dt * 0.35);
    // (and drawn back toward how it hangs: cloth has a shape of its own, more so a coat's wool than a linen apron —
    //  while its wearer stands. Fallen, or bent far over, it has no shape but what its weight gives it: it drops and lies)
    if (up > 0.2) p.lerp(T[s], (1 - Math.pow(0.22, dt)) * up * up);
    p.addScaledVector(G_, dt * dt * 0.65 * (1 - up));
    // (and never through the ground)
    if (gy != null) { const gh = gy(p.x, p.z) + 0.03; if (p.y < gh) { p.y = gh; q.lerp(p, 0.5); } }
    // (pushed aside by the legs: the cloth from the waist down to this point of the hem kept outside each thigh and
    //  shin — where a knee or a calf presses into it partway down, the hem below is levered out the further)
    for (const [l0, l1] of legs) {
      const h = segSeg(A[s], p, l0, l1);
      if (h.d < LR && h.s > 0.3) {
        _c.subVectors(h.p, h.q); if (_c.lengthSq() < 1e-10) _c.subVectors(p, A[s]).setY(0);
        _c.normalize().multiplyScalar((LR - h.d) / h.s); p.add(_c);
      }
    }
    // (and no longer, from the waist, than the cloth is)
    const L = T[s].distanceTo(A[s]); _b.subVectors(p, A[s]); const dl = _b.length();
    if (dl > L * 1.02) p.copy(A[s]).addScaledVector(_b, L * 1.02 / dl);
  }
  // (each piece: how far its hem is from where the bones alone would put it, in the piece's own space)
  for (const part of C.parts) {
    const o = part.o; o.updateWorldMatrix(true, false); part.uni.lie.value = 1 - up;
    _n3.setFromMatrix4(_m.copy(o.matrixWorld).invert());
    for (let s = 0; s < K; s++) {
      // (the sectors are centred: shift to the vertex's 0..1 round so sector s sits at s/K)
      const d = part.uni.value[(s + K) % K].subVectors(C.pts[s], T[s]);
      if (d.length() > 0.45) d.setLength(0.45);
      d.applyMatrix3(_n3);
    }
  }
}
