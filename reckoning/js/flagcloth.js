// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A FLAG IN THE WIND: the cloth itself, worked out as cloth. A net of points, held all down the hoist where the sleeve
// goes over the staff, and everywhere else free: its own weight drawing it down, the wind pressing on each little face
// of it as that face is turned to the wind (edge-on, nothing; flat to it, all), and the threads holding each point to
// its neighbours, across, down, corner to corner, and one over (so it bends as cloth does, not as paper or as jelly).
// What it does then — stream out in a stiff breeze and ripple from the staff to the fly, hang and stir in a light one,
// fold over itself and shake out again as a gust comes and goes — it does of itself; nothing of it is drawn as a wave.
//
// Worked in the flag's own frame, in metres of real cloth, a few small steps a frame: the wind and the fall turned
// into that frame from wherever the flag stands. The same few lines for the settlement's flag, a battle's colours,
// the colours of a company on the map and a ship's pennant.

import { THREE } from "./core.js";

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _g = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3();

export class FlagCloth {
  // w, h: the cloth's size in the mesh's own units; metres: how wide it really is (a regiment's colours about two);
  // nx, ny: the net's points along and down; material: as drawn (a map, both sides); taper: a pennant's fly narrowed
  constructor({ w = 1.8, h = 1.2, metres = w, nx = 14, ny = 9, material, taper = 0, seed = Math.random() * 100 } = {}) {
    this.w = w; this.h = h; this.nx = nx; this.ny = ny; this.k = metres / w; this.t = seed; this.seed = seed;
    const n = nx * ny, P = this.P = new Float32Array(n * 3), Q = this.Q = new Float32Array(n * 3), R = this.R = new Float32Array(n * 3);
    // (at rest: hanging flat from the hoist, in metres; the hoist the line x = 0, the cloth out along +x)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const u = i / (nx - 1), v = j / (ny - 1), k = (j * nx + i) * 3, half = (1 - taper * u) * 0.5;
      P[k] = u * w * this.k; P[k + 1] = (half - v * half * 2) * h * this.k; P[k + 2] = 0;
    }
    Q.set(P); R.set(P);
    // the threads: [a, b, rest length, stiffness]
    const C = [], link = (a, b, s) => { const ax = a * 3, bx = b * 3; C.push(a, b, Math.hypot(P[ax] - P[bx], P[ax + 1] - P[bx + 1], P[ax + 2] - P[bx + 2]), s); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * nx + i;
      if (i + 1 < nx) link(a, a + 1, 1);
      if (j + 1 < ny) link(a, a + nx, 1);
      if (i + 1 < nx && j + 1 < ny) { link(a, a + nx + 1, 0.6); link(a + 1, a + nx, 0.6); }
      if (i + 2 < nx) link(a, a + 2, 0.4);
      if (j + 2 < ny) link(a, a + nx * 2, 0.4);
    }
    // (kept apart: the ends as whole numbers, three to a point, and what each end takes of the pull — none on the hoist)
    const m = C.length / 4; this.CI = new Int32Array(m * 2); this.CR = new Float64Array(m); this.CS = new Float64Array(m); this.CW = new Float64Array(m * 2);
    for (let c = 0; c < m; c++) {
      const a = C[c * 4], b = C[c * 4 + 1], ai = a % nx === 0 ? 0 : 1, bi = b % nx === 0 ? 0 : 1, sum = ai + bi || 1;
      this.CI[c * 2] = a * 3; this.CI[c * 2 + 1] = b * 3; this.CR[c] = C[c * 4 + 2]; this.CS[c] = C[c * 4 + 3]; this.CW[c * 2] = ai * 2 / sum; this.CW[c * 2 + 1] = bi * 2 / sum;
    }
    // the drawn cloth: the same net, in the mesh's units
    const geo = this.geo = new THREE.BufferGeometry(), uv = new Float32Array(n * 2), idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 2; uv[k] = i / (nx - 1); uv[k + 1] = 1 - j / (ny - 1); }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.write();
    this.acc = 0;
  }
  // the wind where the flag is (world, metres a second) and the fall, turned into the flag's own frame
  frame(windWorld) {
    const m = this.mesh; m.updateWorldMatrix(true, false); m.matrixWorld.decompose(_v, _q, _s); _q.invert();
    _g.set(0, -9.8, 0).applyQuaternion(_q);
    _w.copy(windWorld).applyQuaternion(_q);
  }
  // (or the wind given in the flag's own frame, upright: a cloth shared by many flags, each turned to the wind itself)
  local(wind) { _g.set(0, -9.8, 0); _w.copy(wind); }
  // dt in seconds; wind: a THREE.Vector3 in world space, metres a second (local: already in the flag's own frame)
  step(dt, wind, local = false) {
    dt = Math.min(dt, 0.1); if (dt <= 0) return;
    if (local) this.local(wind); else this.frame(wind);
    this.acc += dt; let n = 0;
    while (this.acc >= 1 / 90 && n++ < 9) { this.acc -= 1 / 90; this.sub(1 / 90); }
    this.write();
  }
  // a little time let go by unseen: hung out a while before anyone looks at it, never caught flat and new
  settle(secs, wind, local = false) { if (local) this.local(wind); else this.frame(wind); for (let i = 0; i < Math.round(secs * 90); i++) this.sub(1 / 90); this.write(); }
  sub(h) {
    const { P, Q, R, CI, CR, CS, CW, nx, ny } = this, gx = _g.x, gy = _g.y, gz = _g.z, ws = Math.hypot(_w.x, _w.y, _w.z) || 1;
    this.t += h; const t = this.t;
    // the wind's force on each face: as much as the face is turned to it, along the face's own normal, gusting and
    // eddying — stronger and weaker by turns, and a wobble across it that runs down the cloth with the air
    R.fill(0);
    const gust = 0.88 + 0.17 * Math.sin(t * 0.9 + this.seed) + 0.1 * Math.sin(t * 2.3 + this.seed * 1.7);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = (j * nx + i) * 3, b = a + 3, c = a + nx * 3, d = c + 3;
      const e1x = P[d] - P[a], e1y = P[d + 1] - P[a + 1], e1z = P[d + 2] - P[a + 2], e2x = P[c] - P[b], e2y = P[c + 1] - P[b + 1], e2z = P[c + 2] - P[b + 2];
      let nxv = e1y * e2z - e1z * e2y, nyv = e1z * e2x - e1x * e2z, nzv = e1x * e2y - e1y * e2x; const area = Math.sqrt(nxv * nxv + nyv * nyv + nzv * nzv) * 0.5 || 1e-6;
      nxv /= area * 2; nyv /= area * 2; nzv /= area * 2;
      // (the air past this face: the wind, eddying, less the face's own going)
      const ph = t * 6.5 - i * 0.55 + j * 0.2 + this.seed, eddy = Math.sin(ph) * 0.32 + Math.sin(ph * 1.7 + 1.3) * 0.16;
      const vx = _w.x * gust + eddy * ws * 0.4 - (P[a] - Q[a]) / h, vy = _w.y * gust + eddy * ws * 0.25 - (P[a + 1] - Q[a + 1]) / h, vz = _w.z * gust + eddy * ws * 0.6 - (P[a + 2] - Q[a + 2]) / h;
      const dn = vx * nxv + vy * nyv + vz * nzv, f = 0.95 * dn * Math.abs(dn) * area * 0.25;
      const fx = nxv * f, fy = nyv * f, fz = nzv * f;
      R[a] += fx; R[a + 1] += fy; R[a + 2] += fz; R[b] += fx; R[b + 1] += fy; R[b + 2] += fz;
      R[c] += fx; R[c + 1] += fy; R[c + 2] += fz; R[d] += fx; R[d + 1] += fy; R[d + 2] += fz;
    }
    // (each point's share of the cloth: a light wool bunting, a quarter of a kilo to the square metre)
    const mass = 0.25 * this.w * this.h * this.k * this.k / (nx * ny), h2 = h * h, damp = 0.992;
    const im = 1 / mass;
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const k = (j * nx + i) * 3;
      let p = P[k], q = Q[k]; P[k] = p + (p - q) * damp + (gx + R[k] * im) * h2; Q[k] = p;
      p = P[k + 1]; q = Q[k + 1]; P[k + 1] = p + (p - q) * damp + (gy + R[k + 1] * im) * h2; Q[k + 1] = p;
      p = P[k + 2]; q = Q[k + 2]; P[k + 2] = p + (p - q) * damp + (gz + R[k + 2] * im) * h2; Q[k + 2] = p;
    }
    // the threads pulled back to length, a few times over; the hoist held where the staff is
    const m = CR.length;
    for (let it = 0; it < 5; it++) {
      for (let c = 0; c < m; c++) {
        const a = CI[c * 2], b = CI[c * 2 + 1], rest = CR[c], st = CS[c];
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        // (cloth stretches hardly at all, but gives freely the other way: a thread pushed shorter just goes slack)
        if (d < rest && st < 1) continue;
        const k = (d - rest) / d * st * 0.5, ka = k * CW[c * 2], kb = k * CW[c * 2 + 1];
        P[a] += dx * ka; P[a + 1] += dy * ka; P[a + 2] += dz * ka;
        P[b] -= dx * kb; P[b + 1] -= dy * kb; P[b + 2] -= dz * kb;
      }
    }
  }
  write() {
    const p = this.geo.attributes.position.array, P = this.P, k = 1 / this.k;
    for (let i = 0; i < P.length; i++) p[i] = P[i] * k;
    this.geo.attributes.position.needsUpdate = true; this.geo.computeVertexNormals();
  }
  dispose() { this.geo.dispose(); }
}

// the wind a flag feels from the game's own (G.windV, a breeze's way and strength), in metres a second
export function flagWind(windV, out = new THREE.Vector3()) {
  const x = windV ? windV.x : 0.5, z = windV ? windV.z : 0.2, s = Math.hypot(x, z) || 1;
  return out.set(x / s, 0, z / s).multiplyScalar(5 + Math.min(3, s) * 1.8);
}
