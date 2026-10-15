// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE FIELDS AS THEY WERE: a historical battle's ground shaped like its own — the Boyne running between the two
// armies, the Kahlenberg's slopes and vineyards falling towards Vienna's spires, the Bussex Rhine's ditch in front of
// the King's camp, the Tisza behind the bridgehead at Zenta with the bridge the Turks were crossing by — and the
// buildings that stood there: churches, cottages, a castle, a city's walls and towers far off, the Turkish tents.
//
// Laid out along the field's own line: u runs from the first side of history.js's battle (west) towards the second
// (east), v across; if you fight for the second side the field is turned about, so your side is always the west.
// What the battle's map lists:
//   low     the field's level a little over the water (a river's plain), not the country's own
//   ramp    [u0, h0, u1, h1]: the ground rising or falling across the field, between the two
//   hills   [{u, v, r, h}]: a rise
//   rivers  [{u | v, w, d}]: water across the field (at u) or along it (at v): w wide, d deep
//   marsh   {u0, u1}: low wet ground, pools in it
//   snow    the ground white
//   things  what stands on it: [kind, u, v, ...]

import { THREE, mat } from "./core.js";
import { WATER } from "./mp/terrain.js";

const ss = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const hsh = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// the ground reshaped: called before any of it is built (the terrain's chunks, its trees, the field's works)
export function shapeField(w, C, b, flip) {
  const M = b.map || {}, L = w.land; if (!L.setSculpt) return;
  L.setSculpt(null);
  const sg = flip ? -1 : 1, H0 = L.heightAt(C.x, C.z);
  const Hb = M.low ? WATER + Math.max(2.8, M.low === true ? 2.8 : M.low) : H0;
  const wet = (M.rivers && M.rivers.length) || M.marsh;
  const R1 = M.r1 || (wet ? 160 : 110), R2 = M.r2 || (wet ? 330 : 220);
  const ramp = u => { if (!M.ramp) return 0; const [u0, h0, u1, h1] = M.ramp; return h0 + (h1 - h0) * ss((u - u0) / (u1 - u0)); };
  L.setSculpt((h, x, z) => {
    const u = (x - C.x) * sg, v = z - C.z, r = Math.hypot(u, v);
    if (r > R2 + 40) return h;
    let base = Hb + ramp(u) + Math.sin(u * 0.031 + v * 0.017) * 0.35 + Math.sin(v * 0.043 - u * 0.012) * 0.3;
    for (const H of M.hills || []) { const d = Math.hypot(u - H.u, v - H.v) / H.r; if (d < 1.6) base += H.h * Math.exp(-d * d * 2.2); }
    if (M.marsh) { const k = ss((u - M.marsh.u0) / 25) * (1 - ss((u - M.marsh.u1) / 25)); if (k > 0) base = base + (WATER + 0.25 + (hsh(Math.floor(u / 9), Math.floor(v / 9)) - 0.55) * 1.1 - base) * k; }
    const k = r < R1 ? 1 : 1 - ss((r - R1) / (R2 - R1));
    let y = h + (base - h) * k;
    // (a river: its bed below the water, its banks drawn down to it — on across the whole of the reshaped country)
    for (const R of M.rivers || []) {
      // (never ruled straight: it winds a little, as a river does)
      const d = R.u != null ? Math.abs(u - R.u - Math.sin(v * 0.019 + R.u) * R.w * 0.35 - Math.sin(v * 0.047) * 2.5) : Math.abs(v - R.v - Math.sin(u * 0.017 + R.v) * R.w * 0.35 - Math.sin(u * 0.043) * 2.5), hw = R.w / 2, bank = R.bank || 5;
      if (d > hw + bank || r > R2 + 20) continue;
      const bed = WATER - R.d * (1 - ss((d - hw * 0.4) / (hw * 0.6 + 0.01)) * 0.75) - 0.05;
      const e = d < hw ? 0 : ss((d - hw) / bank);
      y = Math.min(y, bed + (Math.max(y, WATER + 0.3) - bed) * e);
    }
    return y;
  });
  if (M.snow) w.snowLine = Hb - 18;
}

// what stood on it: built once the ground is, into the world's own scene (and gone with it)
export function buildThings(w, C, b, flip) {
  const M = b.map || {}; if (!M.things || !M.things.length) return null;
  const sg = flip ? -1 : 1, g = new THREE.Group(), cols = [];
  const at = (u, v) => ({ x: C.x + u * sg, z: C.z + v });
  const y = (x, z) => w.heightAt(x, z);
  const M_ = {
    wall: mat(0xb8ad96), whitewash: mat(0xd8d0bc), thatch: mat(0x8a7444), tile: mat(0x8a3a28), slate: mat(0x4a4c52), copper: mat(0x5a8a78), wood: mat(0x5a4632),
    stone: mat(0x8a8478), dark: mat(0x3a3430), canvas: mat(0xe2d8c0), red: mat(0xa8322a), green: mat(0x3e6a40), stake: mat(0x6a5238), vine: mat(0x4e6a2e),
  };
  const box = (m, x, yy, z, sx, sy, sz, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, yy, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const roof = (m, x, yy, z, sx, h, sz, ry = 0) => { const s = new THREE.Shape(); s.moveTo(-sx / 2 - 0.3, 0); s.lineTo(0, h); s.lineTo(sx / 2 + 0.3, 0); s.lineTo(-sx / 2 - 0.3, 0); const geo = new THREE.ExtrudeGeometry(s, { depth: sz + 0.6, bevelEnabled: false }); geo.translate(0, 0, -(sz + 0.6) / 2); const o = new THREE.Mesh(geo, m); o.position.set(x, yy, z); o.rotation.y = ry; o.castShadow = true; g.add(o); return o; };
  const cone = (m, x, yy, z, r, h, n = 8) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, n), m); o.position.set(x, yy + h / 2, z); o.castShadow = true; g.add(o); return o; };
  const solid = (x, z, hw, hd, ry, top) => { if (Math.hypot(x - C.x, z - C.z) < 200) cols.push(w.col.addOBox(x, z, hw, hd, ry, top)); };
  const B = {
    // a cottage: whitewashed or stone, a thatched or tiled roof
    house(u, v, ry = 0, sx = 7, sz = 5, kind = "thatch") {
      const p = at(u, v), y0 = Math.min(y(p.x - 3, p.z), y(p.x + 3, p.z), y(p.x, p.z - 3), y(p.x, p.z + 3)), r = ry * sg;
      box(kind === "tile" ? M_.whitewash : M_.wall, p.x, y0 + 1.4, p.z, sx, 3.6, sz, r);
      roof(M_[kind] || M_.thatch, p.x, y0 + 3.2, p.z, sx, 2.6, sz, r + Math.PI / 2 * 0);
      solid(p.x, p.z, sx / 2, sz / 2, r, y0 + 5);
    },
    // a village church: the nave, and its tower at the west end with a spire or a cap
    church(u, v, ry = 0, tower = 18, spire = 10) {
      const p = at(u, v), y0 = y(p.x, p.z) - 0.4, r = ry * sg, c = Math.cos(r), s = Math.sin(r);
      box(M_.stone, p.x, y0 + 3.5, p.z, 16, 7, 8, r); roof(M_.slate, p.x, y0 + 6.6, p.z, 8, 4, 16, r + Math.PI / 2);
      const tx = p.x - c * 9.5, tz = p.z + s * 9.5;
      box(M_.stone, tx, y0 + tower / 2, tz, 5, tower, 5, r); cone(M_.slate, tx, y0 + tower, tz, 3.4, spire, 4).rotation.y = r + Math.PI / 4;
      solid(p.x, p.z, 8, 4, r, y0 + 8); solid(tx, tz, 2.5, 2.5, r, y0 + tower);
    },
    // a great town church far off: a tall tower, its spire — the skyline of a city
    spire(u, v, h = 70, kind = "copper") {
      const p = at(u, v), y0 = y(p.x, p.z) - 1;
      box(M_.stone, p.x, y0 + h * 0.3, p.z, 9, h * 0.6, 9); box(M_.stone, p.x, y0 + h * 0.66, p.z, 7, h * 0.14, 7);
      cone(M_[kind] || M_.copper, p.x, y0 + h * 0.72, p.z, 4.6, h * 0.36, 8);
      box(M_.stone, p.x + 14, y0 + 6, p.z + 3, 30, 12, 13); roof(M_.slate, p.x + 14, y0 + 12, p.z + 3, 13, 7, 30, Math.PI / 2);
    },
    // a city's wall far off: a long rampart with houses' roofs over it, here and there a tower
    city(u, v0, v1, h = 9) {
      const n = Math.max(1, Math.round(Math.abs(v1 - v0) / 22));
      for (let i = 0; i <= n; i++) {
        const v = v0 + (v1 - v0) * i / n, p = at(u, v), y0 = y(p.x, p.z) - 1;
        if (i < n) { const q = at(u, v + (v1 - v0) / n / 2); box(M_.wall, q.x, y0 + h / 2, q.z, 6, h, Math.abs(v1 - v0) / n + 0.5); }
        box(M_.wall, p.x, y0 + h * 0.65, p.z, 9, h * 1.3, 9);
        for (let k = 0; k < 2; k++) { const r = at(u - (8 + k * 9), v + (hsh(v, k) - 0.5) * 10); const hh = 7 + hsh(k, v) * 5; box(M_.whitewash, r.x, y0 + hh / 2, r.z, 7, hh, 9); roof(M_.tile, r.x, y0 + hh, r.z, 9, 4, 7, Math.PI / 2); }
      }
    },
    // a castle: a squat keep and a curtain wall with round towers
    castle(u, v, s = 1) {
      const p = at(u, v), y0 = y(p.x, p.z) - 0.6;
      box(M_.stone, p.x, y0 + 4 * s, p.z, 40 * s, 8 * s, 32 * s);
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(4 * s, 4.4 * s, 13 * s, 10), M_.stone); t.position.set(p.x + a * 20 * s, y0 + 6.5 * s, p.z + c * 16 * s); t.castShadow = true; g.add(t); cone(M_.slate, p.x + a * 20 * s, y0 + 13 * s, p.z + c * 16 * s, 4.6 * s, 5 * s, 10); }
      box(M_.stone, p.x - 6 * s, y0 + 14 * s, p.z, 14 * s, 28 * s, 14 * s);
      solid(p.x, p.z, 21 * s, 17 * s, 0, y0 + 12 * s);
    },
    // a tent: the Turkish camp's, round and peaked — or a soldier's ridge tent
    tent(u, v, r = 3, col = "canvas") {
      const p = at(u, v), y0 = y(p.x, p.z) - 0.1;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.8, 12), M_[col] || M_.canvas); t.position.set(p.x, y0 + 0.9, p.z); t.castShadow = true; g.add(t);
      cone(M_[col] || M_.canvas, p.x, y0 + 1.8, p.z, r * 1.08, r * 0.9, 12);
      solid(p.x, p.z, r * 0.8, r * 0.8, 0, y0 + 2.5);
    },
    tents(u0, u1, v0, v1, n = 12, col = "canvas") {
      for (let i = 0; i < n; i++) { const u = u0 + (u1 - u0) * hsh(i, 3.1), v = v0 + (v1 - v0) * hsh(i, 7.7); B.tent(u, v, 2.4 + hsh(i, 1.3) * 2.2, i % 5 === 0 ? (col === "canvas" ? "red" : "green") : col); }
    },
    // a vineyard: rows of stakes, each with its vine (no more than a tangle at knee and hip height)
    vines(u0, u1, v0, v1, gap = 2.6) {
      const list = []; for (let u = u0; u <= u1; u += gap) for (let v = v0; v <= v1; v += 1.4) list.push(at(u + (hsh(u, v) - 0.5) * 0.3, v));
      const sg2 = new THREE.CylinderGeometry(0.035, 0.045, 1.5, 4), vg = new THREE.IcosahedronGeometry(0.42, 0);
      const st = new THREE.InstancedMesh(sg2, M_.stake, list.length), vi = new THREE.InstancedMesh(vg, M_.vine, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach((p, i) => { const yy = y(p.x, p.z); m4.makeTranslation(p.x, yy + 0.7, p.z); st.setMatrixAt(i, m4); e.set(0, hsh(p.x, p.z) * 6, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, yy + 0.75, p.z), q, new THREE.Vector3(1, 1.3 + hsh(p.z, p.x) * 0.5, 0.8)); vi.setMatrixAt(i, m4); });
      st.castShadow = vi.castShadow = true; g.add(st, vi);
    },
    // a bridge of boats: planks over a line of pontoons, from bank to bank
    bridge(u0, u1, v, wd = 4) {
      const n = Math.max(2, Math.round(Math.abs(u1 - u0) / 5));
      for (let i = 0; i <= n; i++) { const p = at(u0 + (u1 - u0) * i / n, v); box(M_.dark, p.x, WATER - 0.1, p.z, 2.4, 0.9, wd + 1.6); }
      const a = at(u0, v), c = at(u1, v); box(M_.wood, (a.x + c.x) / 2, WATER + 0.55, (a.z + c.z) / 2, Math.abs(c.x - a.x), 0.22, wd);
    },
    // a windmill, on its post
    mill(u, v) {
      const p = at(u, v), y0 = y(p.x, p.z);
      box(M_.wood, p.x, y0 + 4, p.z, 3.4, 5, 3.4); roof(M_.wood, p.x, y0 + 6.5, p.z, 3.4, 1.6, 3.4);
      const s = new THREE.Group(); for (let i = 0; i < 4; i++) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.1), M_.canvas); a.position.y = 3.5; const h = new THREE.Group(); h.rotation.z = i * Math.PI / 2 + 0.3; h.add(a); s.add(h); }
      s.position.set(p.x, y0 + 5, p.z + 1.9); g.add(s); box(M_.wood, p.x, y0 + 1, p.z, 0.5, 2, 0.5);
      solid(p.x, p.z, 1.8, 1.8, 0, y0 + 7);
    },
  };
  // (no wood growing where a town, a camp or a vineyard stands: the trees there cleared first)
  const CLEAR = { house: 9, church: 16, spire: 30, castle: 34, tent: 6, mill: 7 };
  for (const [k, ...a] of M.things) {
    if (CLEAR[k]) { const p = at(a[0], a[1]); w.clearScenery(p.x, p.z, CLEAR[k] * (k === "castle" ? a[2] || 1 : 1)); }
    else if (k === "city") for (let v = Math.min(a[1], a[2]); v <= Math.max(a[1], a[2]); v += 30) { const p = at(a[0] - 40, v); w.clearScenery(p.x, p.z, 55); }
    else if (k === "tents" || k === "vines") { const p = at((a[0] + a[1]) / 2, (a[2] + a[3]) / 2); w.clearScenery(p.x, p.z, Math.hypot(a[1] - a[0], a[3] - a[2]) / 2 + 6); }
  }
  for (const [k, ...a] of M.things) if (B[k]) B[k](...a);
  w.root.add(g);
  return { g, cols };
}
