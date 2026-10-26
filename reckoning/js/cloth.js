// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// CLOTH. Skirts, aprons and the skirts of a coat are cloth: a net of points from the waist to the hem — six rings of
// twelve — the top ring sewn to the waist and the rest free, falling under their own weight, carried on by their own
// momentum, each held to its neighbours so the cloth can't stretch (though it can bunch and fold), kept out of the legs,
// the body and the ground. Standing, a little of the garment's own hang draws it back toward how it was cut; once its
// wearer goes over, that lets go, and it falls, crumples and spreads like the cloth it is.
//
// Worked out once a frame for each person that is drawn (just before it is), from where the hips and the legs are; laid
// on the mesh in its shader after the skin has been bent by the bones, each vertex carried by the four points of the net
// around it. Each person's own: its clothes' materials are its own copies.

import { THREE, addDetail, addHook, inheritHooks } from "./core.js";
import { SWAY } from "./models.js";

const R = 5, S = 12, N = (R + 1) * S;      // (rings below the waist; points round each ring)
const PARTS = /_(skirt|apron|coat)$/;
const _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const id = (r, s) => r * S + ((s % S) + S) % S;

// where each vertex lies on the net: round the body (0..1) and down it (0 the waist, 1 the hem of the longest piece)
function prepare(geo, top, lo, hipX, hipZ) {
  if (geo.userData.cloth) return geo.userData.cloth;
  const p = geo.attributes.position, n = p.count, span = Math.max(0.15, top - lo);
  const at = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i) - hipX, z = p.getZ(i) - hipZ;
    let a = Math.atan2(z, x) / (Math.PI * 2); if (a < 0) a += 1;
    at[i * 2] = a; at[i * 2 + 1] = Math.max(0, Math.min(1, (top - p.getY(i)) / span));
  }
  geo.setAttribute("aCloth", new THREE.BufferAttribute(at, 2));
  return (geo.userData.cloth = { si: geo.attributes.skinIndex, sw: geo.attributes.skinWeight, at, reweighted: false });
}
// (hung from the hips, not the legs: the net moves the cloth, and the legs push the net. Tied to the thighs as the
//  model had it, it went where the thigh went, stiff as a board)
function reweight(info, hip, legs) {
  if (info.reweighted) return; info.reweighted = true;
  const { si, sw, at } = info;
  for (let v = 0; v < si.count; v++) {
    const f = at[v * 2 + 1]; if (f <= 0) continue;
    const fall = Math.min(1, f * 2.5);
    let moved = 0; const w = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], ix = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)];
    for (let k = 0; k < 4; k++) if (legs.has(ix[k]) && w[k] > 0) { const m = w[k] * fall; w[k] -= m; moved += m; }
    if (!moved) continue;
    let h = ix.indexOf(hip); if (h < 0) { h = w.indexOf(Math.min(...w)); moved += w[h]; ix[h] = hip; w[h] = 0; }
    w[h] += moved; si.setXYZW(v, ...ix); sw.setXYZW(v, ...w);
  }
  si.needsUpdate = true; sw.needsUpdate = true;
}
// the net at rest, in the shape's own space: each ring's height, and how far out the cloth hangs there, point by point,
// measured from the garment itself
function restNet(pieces, top, lo, hipX, hipZ) {
  const sum = new Float32Array(N), cnt = new Float32Array(N);
  for (const g of pieces) {
    const p = g.attributes.position, at = g.attributes.aCloth.array;
    for (let i = 0; i < p.count; i++) {
      const rr = at[i * 2 + 1] * R, r = Math.round(rr); if (Math.abs(rr - r) > 0.35 || r === 0) continue;
      const s = Math.round(at[i * 2] * S) % S;
      sum[id(r, s)] += Math.hypot(p.getX(i) - hipX, p.getZ(i) - hipZ); cnt[id(r, s)]++;
    }
  }
  const rad = new Float32Array(N);
  for (let s = 0; s < S; s++) rad[id(0, s)] = 0.16;
  for (let r = 1; r <= R; r++) for (let s = 0; s < S; s++) {
    let v = cnt[id(r, s)] ? sum[id(r, s)] / cnt[id(r, s)] : 0;
    // (a gap — the front of an open coat — filled from either side, else from the ring above)
    if (!v) { const a = cnt[id(r, s - 1)] ? sum[id(r, s - 1)] / cnt[id(r, s - 1)] : 0, b = cnt[id(r, s + 1)] ? sum[id(r, s + 1)] / cnt[id(r, s + 1)] : 0; v = a && b ? (a + b) / 2 : a || b || rad[id(r - 1, s)] + 0.02; }
    rad[id(r, s)] = Math.max(v, rad[id(r - 1, s)] * 0.95);
  }
  const span = top - lo, pts = [];
  for (let r = 0; r <= R; r++) for (let s = 0; s < S; s++) {
    const a = s / S * Math.PI * 2, k = rad[id(r, s)];
    pts.push(new THREE.Vector3(hipX + Math.cos(a) * k, top - r / R * span, hipZ + Math.sin(a) * k));
  }
  return pts;
}

function hangNet(rest, hx, hz) {
  const pts = rest.map(p => p.clone());
  for (let s = 0; s < S; s++) {
    let m = 0;
    for (let r = 0; r <= R; r++) {
      const p = pts[id(r, s)], dx = p.x - hx, dz = p.z - hz, d = Math.hypot(dx, dz);
      if (r > 1 && d < m && d > 1e-4) { p.x = hx + dx / d * m; p.z = hz + dz / d * m; }
      m = Math.max(m, d);
    }
  }
  return pts;
}

// the shader: after the skin's bones have bent it, each vertex carried by the four points of the net around it
const CLOTH_GLSL = `
  { float rf = aCloth.y * ${R}.0; int r0 = min(int(floor(rf)), ${R}), r1 = min(r0 + 1, ${R}); float fr = rf - float(r0);
    float sf = aCloth.x * ${S}.0; int s0 = int(floor(sf)) % ${S}, s1 = (s0 + 1) % ${S}; float fs = fract(sf);
    vec3 d0 = mix(uClothD[r0 * ${S} + s0], uClothD[r0 * ${S} + s1], fs), d1 = mix(uClothD[r1 * ${S} + s0], uClothD[r1 * ${S} + s1], fs);
    transformed += mix(d0, d1, fr); }`;
const CLOTH_DECL = `attribute vec2 aCloth; uniform vec3 uClothD[${N}];`;
// (each cloth material's own original, without the cloth: kept apart from userData, which a copy turns to plain JSON)
const CLOTH_SRC = new WeakMap();
export const clothSrcOf = m => CLOTH_SRC.get(m);
// (and each cloth mesh's simulation: likewise kept out of userData — a loop in it would throw when copied)
const SIM_OF = new WeakMap();
export const clothSimOf = o => SIM_OF.get(o);
function clothMaterial(src, uni) {
  // (a copy: its grain laid on again — a copy keeps none of the shader — and whatever else was on it, then the cloth)
  const m = src.clone();
  CLOTH_SRC.set(m, src);
  if (src.userData.detail) addDetail(m, src.userData.detail);
  inheritHooks(src, m);
  addHook(m, sh => {
    sh.uniforms.uClothD = uni;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + CLOTH_DECL).replace("#include <skinning_vertex>", "#include <skinning_vertex>" + CLOTH_GLSL);
  }, "cloth");
  return m;
}
// its shadow: cast from the cloth where it has moved to, not where the bones alone would have left it
function clothDepth(uni) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = sh => {
    sh.uniforms.uClothD = uni;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + CLOTH_DECL).replace("#include <skinning_vertex>", "#include <skinning_vertex>" + CLOTH_GLSL);
  };
  d.customProgramCacheKey = () => "clothdepth" + N;
  return d;
}
const newUni = () => ({ value: Array.from({ length: N }, () => new THREE.Vector3()) });

// put cloth on a person: their model's scene, as made for them (see useModel)
export function attachCloth(P, scene) {
  const meshes = [];
  scene.traverse(o => { if (o.isSkinnedMesh && o.material && !Array.isArray(o.material) && PARTS.test(o.material.name || "")) meshes.push(o); });
  if (!meshes.length) return null;
  const bones = meshes[0].skeleton.bones, bi = n => bones.findIndex(b => b.name === n);
  const hipI = bi("hips"); if (hipI < 0) return null;
  const B = n => bones[bi(n)];
  const hips = bones[hipI], legs = [["thigh.L", "shin.L"], ["shin.L", "foot.L"], ["thigh.R", "shin.R"], ["shin.R", "foot.R"]].map(([a, b]) => [B(a), B(b)]).filter(([a, b]) => a && b);
  const legSet = new Set(bones.map((b, i) => /^(thigh|shin)/.test(b.name) ? i : -1).filter(i => i >= 0));
  // (where the hips are in the shape's own space at rest)
  const hipRest = new THREE.Vector3().setFromMatrixPosition(_m.copy(meshes[0].skeleton.boneInverses[hipI]).invert().premultiply(new THREE.Matrix4().copy(meshes[0].bindMatrix).invert()));
  // (only what hangs below the waist: a coat's body above it, sleeves and all, is left as it was)
  const hanging = meshes.filter(o => { o.geometry.computeBoundingBox(); return o.geometry.boundingBox.min.y < hipRest.y - 0.25; });
  if (!hanging.length) return null;
  const top = hipRest.y + 0.02, lo = Math.min(...hanging.map(o => o.geometry.boundingBox.min.y));
  const C = { P, hips, legs, spine: B("spine"), parts: [], frame: -1, t: 0, pts: null };
  const geos = [];
  for (const o of hanging) {
    // (the flowing shape a copy of the model's, made once and shared by everyone wearing it)
    const g0 = o.geometry;
    let g = g0.userData.clothGeo;
    if (!g) { g = g0.clone(); g.userData = { clothSrc: g0 }; g0.userData.clothGeo = g; }
    o.geometry = g; geos.push(g);
    const info = prepare(g, top, lo, hipRest.x, hipRest.z);
    reweight(info, hipI, legSet);
    const uni = newUni();
    o.material = clothMaterial(o.material, uni); o.customDepthMaterial = clothDepth(uni);
    C.parts.push({ o, uni }); SIM_OF.set(o, C);
    o.onBeforeRender = renderer => step(C, renderer.info.render.frame);
  }
  // (the net at rest: worked out once for each model, from all its hanging pieces together)
  C.rest = geos[0].userData.clothNet ??= restNet(geos, top, lo, hipRest.x, hipRest.z);
  C.hipRest = hipRest;
  // (how it hangs: as made, but never drawn in going down — the shapes as made bellied out over the knees and tucked in
  //  at the hem, so every skirt and apron stood like a jar; cloth falls straight from the widest of hips and knees, or
  //  flares)
  C.hang = geos[0].userData.clothHang ??= hangNet(C.rest, hipRest.x, hipRest.z);
  // (the cloth's own lengths between neighbouring points, as it hangs: down, and round)
  C.down = new Float32Array(N); C.round = new Float32Array(N);
  for (let r = 1; r <= R; r++) for (let s = 0; s < S; s++) C.down[id(r, s)] = C.hang[id(r, s)].distanceTo(C.hang[id(r - 1, s)]);
  for (let r = 0; r <= R; r++) for (let s = 0; s < S; s++) C.round[id(r, s)] = C.hang[id(r, s)].distanceTo(C.hang[id(r, s + 1)]);
  P.cloth = C;
  return C;
}

// a person's pieces made one (a battle's crowd, see mergeRig): the one mesh moves with the same net as the pieces did
export function clothMerged(C, sk) {
  const uni = newUni();
  sk.material = clothMaterial(sk.material, uni); sk.customDepthMaterial = clothDepth(uni);
  const part = { o: sk, uni }; C.parts.push(part);
  sk.onBeforeRender = renderer => step(C, renderer.info.render.frame);
  return () => { const i = C.parts.indexOf(part); if (i >= 0) C.parts.splice(i, 1); };
}

// a point kept out of a capsule (a leg, the body): pushed out to its surface, along the shortest way
function outOf(p, a, b, rad) {
  _b.subVectors(b, a); const L2 = _b.lengthSq();
  const t = L2 ? Math.max(0, Math.min(1, _c.subVectors(p, a).dot(_b) / L2)) : 0;
  _c.copy(a).addScaledVector(_b, t);
  const d = p.distanceTo(_c);
  if (d >= rad) return false;
  if (d > 1e-5) p.sub(_c).multiplyScalar(rad / d).add(_c); else p.y += rad;
  return true;
}

// one step of the cloth, once a frame however many pieces of it are drawn
const G_ = new THREE.Vector3(0, -9.8, 0);
const _W = new THREE.Matrix4(), _T = new THREE.Matrix4();
function step(C, frame) {
  if (C.frame === frame) return; C.frame = frame;
  const now = performance.now() / 1000, dt = Math.min(1 / 30, C.last ? now - C.last : 1 / 60); C.last = now;
  if (dt <= 0) return;
  const hips = C.hips; hips.updateWorldMatrix(true, false);
  const HW = hips.matrixWorld, scale = _v.setFromMatrixScale(HW).y || 1;
  // (shape space to the world, through the hips as they stand now: a point hung wholly from the hips goes where the skin
  //  carries it — the hips now, times their inverse at rest, times where the shape was bound)
  const mesh = C.parts[0].o, sk = mesh.skeleton, hipI = sk.bones.indexOf(hips);
  _W.multiplyMatrices(HW, sk.boneInverses[hipI]).multiply(mesh.bindMatrix);
  if (!C.T) C.T = C.rest.map(() => new THREE.Vector3());
  const T = C.T; for (let i = 0; i < N; i++) T[i].copy(C.rest[i]).applyMatrix4(_W);
  // (and where it would hang, standing: the pull of the cut is toward that)
  if (!C.TT) C.TT = C.rest.map(() => new THREE.Vector3());
  const TT = C.TT; for (let i = 0; i < N; i++) TT[i].copy(C.hang[i]).applyMatrix4(_W);
  if (!C.pts || T[0].distanceTo(C.pts[0]) > 3) { C.pts = TT.map(p => p.clone()); C.prev = TT.map(p => p.clone()); }
  const P = C.pts, Q = C.prev;
  // (how upright the hips are: 1 standing, 0 lying — and how much of the garment's cut it keeps)
  const up = Math.max(0, _a.set(0, 1, 0).applyMatrix3(_n3.setFromMatrix4(HW)).normalize().y), keep = Math.max(0, (up - 0.55) / 0.45);
  const Gw = typeof window !== "undefined" && window.G, gy = Gw && Gw.world && Gw.world.heightAt ? (x, z) => Gw.world.heightAt(x, z) : null;
  const legs = C.legs.map(([a, b]) => [a.getWorldPosition(new THREE.Vector3()), b.getWorldPosition(new THREE.Vector3())]);
  const pelvis = hips.getWorldPosition(new THREE.Vector3()), chest = C.spine ? C.spine.getWorldPosition(new THREE.Vector3()) : pelvis.clone();
  const seat = C.P && C.P.sitting > 0.5 ? pelvis.y - 0.1 * scale : null;
  const LR = 0.095 * scale, BR = 0.13 * scale, pull = (1 - Math.pow(0.3, dt)) * keep * keep;
  const minR = (0.45 + 0.43 * keep) / 1.06;
  const wd = SWAY && SWAY.dir ? SWAY.dir.value : null, wt = SWAY ? SWAY.t.value : 0, wk = SWAY ? SWAY.k.value : 0;
  // move: momentum (a little lost to the air), weight, the wind, and while standing the garment's own hang
  for (let r = 1; r <= R; r++) for (let s = 0; s < S; s++) {
    const i = id(r, s), p = P[i], q = Q[i];
    _a.subVectors(p, q).multiplyScalar(0.97);
    q.copy(p); p.add(_a).addScaledVector(G_, dt * dt);
    if (wd) {
      const gust = 0.55 + 0.45 * Math.sin(wt * 0.55 - (p.x * wd.x + p.z * wd.y) * 0.07), w = (0.8 + 5 * wk) * gust * (1 + 0.45 * Math.sin(wt * 6.3 + s * 1.7 + r)) * dt * dt * (r / R);
      p.x += wd.x * w; p.z += wd.y * w;
    }
    if (pull > 0) p.lerp(TT[i], pull * (0.35 + 0.65 * r / R));
  }
  // hold it together: sewn to the waist; never longer than the cloth between neighbours (though free to bunch); out of
  // the legs, the body and the ground
  for (let s = 0; s < S; s++) P[id(0, s)].copy(T[id(0, s)]);
  for (let it = 0; it < 6; it++) {
    for (let r = 1; r <= R; r++) for (let s = 0; s < S; s++) {
      // (down from the point above: the one above pinned at the waist, else the two share the correction)
      const i = id(r, s), j = id(r - 1, s), L = C.down[i] * scale * 1.02;
      _a.subVectors(P[i], P[j]); const d = _a.length();
      if (d > L) { const k = (d - L) / d; if (r === 1) P[i].addScaledVector(_a, -k); else { P[i].addScaledVector(_a, -k * 0.5); P[j].addScaledVector(_a, k * 0.5); } }
      // (round, to the next along the ring)
      const n = id(r, s + 1), Ln = C.round[i] * scale * 1.06;
      _a.subVectors(P[n], P[i]); const dn = _a.length();
      if (dn > Ln) { const k = (dn - Ln) / dn * 0.5; P[i].addScaledVector(_a, k); P[n].addScaledVector(_a, -k); }
      // (and not much shorter, while standing: a skirt's hem is a ring of cloth that keeps its round — left free to
      //  shrink, gravity drew the hem in under the knees and every skirt stood like a jar; fallen, it bunches as it likes)
      else if (dn < Ln * minR && dn > 1e-6) { const k = (dn - Ln * minR) / dn * 0.5; P[i].addScaledVector(_a, k); P[n].addScaledVector(_a, -k); }
    }
    for (let r = 1; r <= R; r++) for (let s = 0; s < S; s++) {
      const p = P[id(r, s)];
      for (const [a, b] of legs) outOf(p, a, b, LR);
      outOf(p, pelvis, chest, BR);
      // (sitting — on a bench, a log, in the saddle — the seat under him: cloth over it rests on it and falls from its edge)
      if (seat && Math.hypot(p.x - pelvis.x, p.z - pelvis.z) < 0.3 * scale && p.y < seat) p.y = seat;
      if (gy) { const g = gy(p.x, p.z) + 0.02; if (p.y < g) { p.y = g; const q = Q[id(r, s)]; q.x = p.x * 0.6 + q.x * 0.4; q.z = p.z * 0.6 + q.z * 0.4; } }
    }
  }
  // (each piece: how far each point of the net is from where the bones alone would put it, in the piece's own space)
  for (const part of C.parts) {
    const o = part.o; o.updateWorldMatrix(true, false);
    _n3.setFromMatrix4(_T.copy(o.matrixWorld).invert());
    const U = part.uni.value;
    for (let i = 0; i < N; i++) { const d = U[i].subVectors(P[i], T[i]); if (d.lengthSq() > 1.44) d.setLength(1.2); d.applyMatrix3(_n3); }
  }
}
