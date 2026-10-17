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
import { makeHorse } from "./models.js";
import { WATER } from "./mp/terrain.js";

const ss = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const hsh = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// a town's plan, shared by the ground (its rampart) and what's built on it
export function townPlan(rank) {
  return { wallU: 8, Hr: rank >= 3 ? 3.4 : 2.9, top: 6, inner: 8 + 6 + 7, gate: 3, W: rank >= 3 ? 66 : rank === 2 ? 58 : 48, tower: 30, guns: [-15, 15, -42, 42] };
}
// the ground reshaped: called before any of it is built (the terrain's chunks, its trees, the field's works)
export function shapeField(w, C, b, flip) {
  const M = b.map || {}, L = w.land; if (!L.setSculpt) return;
  L.setSculpt(null);
  const sg = flip ? -1 : 1, H0 = L.heightAt(C.x, C.z);
  const tw = (M.things || []).find(t => t[0] === "town" && t[3]), TW = tw ? { d: tw[1] || 1, L: townPlan(tw[2] || 2) } : null;
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
    // (a walled town's rampart: the earth piled behind its wall, the walk along its top, a slope down inside — cut
    //  through at the gate)
    // (inside a walled town: the ground graded level, as a town's was — no hills under its streets and houses; it
    //  meets the country again past its flank walls and its far end)
    if (TW) { const uu = TW.d * u, P = TW.L, av = Math.abs(v); const kin = ss((uu - P.wallU + 2) / 4) * (1 - ss((uu - 132) / 10)) * (1 - ss((av - P.W - 7) / 8)); if (kin > 0) y += (Hb + ramp(TW.d * (P.wallU + 40)) - y) * kin; }
    if (TW) { const uu = TW.d * u, P = TW.L, av = Math.abs(v); if (av < P.W + 6 && uu > P.wallU - 1.5 && uu < P.inner + 1) {
      const rise = uu < P.wallU ? ss((uu - P.wallU + 1.5) / 1.5) : uu < P.wallU + P.top ? 1 : 1 - ss((uu - P.wallU - P.top) / (P.inner - P.wallU - P.top));
      const cut = av < P.gate + 0.6 ? 0 : av < P.gate + 1.6 ? ss(av - P.gate - 0.6) : 1, ends = 1 - ss((av - P.W - 3) / 3);
      y += P.Hr * rise * cut * ends; } }
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
  const sg = flip ? -1 : 1, g = new THREE.Group(), cols = [], breaks = [], palisade = [], smokes = []; let tgt = g, siege = null;
  const at = (u, v) => ({ x: C.x + u * sg, z: C.z + v });
  const y = (x, z) => w.heightAt(x, z);
  const M_ = {
    wall: mat(0xb8ad96, { surface: "plaster" }), whitewash: mat(0xd8d0bc, { surface: "plaster" }), thatch: mat(0x8a7444), tile: mat(0x8a3a28, { surface: "tiles" }), slate: mat(0x4a4c52, { surface: "tiles" }), copper: mat(0x5a8a78), wood: mat(0x5a4632, { surface: "wood" }),
    stone: mat(0x8a8478, { surface: "stone" }), dark: mat(0x3a3430, { surface: "wood" }), plaster: mat(0xcfc0a0, { surface: "plaster" }), ochre: mat(0xc8a46a, { surface: "plaster" }), brick: mat(0x9a5a40, { surface: "brick" }), tile2: mat(0x9c5236, { surface: "tiles" }),
    ashlar: mat(0xa49a88, { surface: "stone" }), ashlar2: mat(0x938a7a, { surface: "stone" }), door: mat(0x4e3a26, { surface: "wood" }), iron: mat(0x26262a, { metalness: 0.4, roughness: 0.6 }), canvas: mat(0xe2d8c0), red: mat(0xa8322a), green: mat(0x3e6a40), stake: mat(0x6a5238), vine: mat(0x4e6a2e),
  };
  const box = (m, x, yy, z, sx, sy, sz, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, yy, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; tgt.add(o); return o; };
  const roof = (m, x, yy, z, sx, h, sz, ry = 0) => { const s = new THREE.Shape(); s.moveTo(-sx / 2 - 0.3, 0); s.lineTo(0, h); s.lineTo(sx / 2 + 0.3, 0); s.lineTo(-sx / 2 - 0.3, 0); const geo = new THREE.ExtrudeGeometry(s, { depth: sz + 0.6, bevelEnabled: false }); geo.translate(0, 0, -(sz + 0.6) / 2); const o = new THREE.Mesh(geo, m); o.position.set(x, yy, z); o.rotation.y = ry; o.castShadow = true; tgt.add(o); return o; };
  const cone = (m, x, yy, z, r, h, n = 8) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, n), m); o.position.set(x, yy + h / 2, z); o.castShadow = true; tgt.add(o); return o; };
  const solid = (x, z, hw, hd, ry, top) => { if (Math.hypot(x - C.x, z - C.z) < 200) { const c = w.col.addOBox(x, z, hw, hd, ry, top); cols.push(c); return c; } return null; };
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
      const sg2 = new THREE.CylinderGeometry(0.035, 0.045, 1.5, 4), vg = new THREE.IcosahedronGeometry(0.3, 0);
      const st = new THREE.InstancedMesh(sg2, M_.stake, list.length), vi = new THREE.InstancedMesh(vg, M_.vine, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach((p, i) => { const yy = y(p.x, p.z); m4.makeTranslation(p.x, yy + 0.7, p.z); st.setMatrixAt(i, m4); e.set(0, hsh(p.x, p.z) * 6, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, yy + 0.85, p.z), q, new THREE.Vector3(0.75, 1.5 + hsh(p.z, p.x) * 0.4, 0.45)); vi.setMatrixAt(i, m4); });
      st.castShadow = vi.castShadow = true; g.add(st, vi);
    },
    // a bridge of boats: planks over a line of pontoons, from bank to bank
    bridge(u0, u1, v, wd = 4) {
      const n = Math.max(2, Math.round(Math.abs(u1 - u0) / 5));
      for (let i = 0; i <= n; i++) { const p = at(u0 + (u1 - u0) * i / n, v); box(M_.dark, p.x, WATER - 0.1, p.z, 2.4, 0.9, wd + 1.6); }
      const a = at(u0, v), c = at(u1, v); box(M_.wood, (a.x + c.x) / 2, WATER + 0.55, (a.z + c.z) / 2, Math.abs(c.x - a.x), 0.22, wd);
    },
    // a town to fight in: you come at it from outside. A walled town stands behind its wall — an earth rampart faced
    // with stone, a parapet along its top that the defenders stand behind and fire over, towers along it, the gate
    // shut — and the guns can batter it down, a length at a time. Inside: a square behind the gate, the main street on
    // from it, lanes either side, houses shoulder to shoulder. An open town: its houses, and the way in. d: the
    // defenders' end of the field (1 east, -1 west); rank: 1 a town, 2 a great town, 3 a crown's seat
    town(d = 1, rank = 2, walls = 1, seed = 1) {
      let s0 = seed | 0 || 1; const rr = () => (s0 = Math.imul(s0 ^ (s0 >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s0 >>> 0) % 1e6) / 1e6);
      const T = (uu, v) => at(d * uu, v), L = townPlan(rank), W = L.W, wallU = L.wallU, end = 110;
      const fronts = [M_.whitewash, M_.wall, M_.plaster, M_.ochre, M_.brick, M_.whitewash, M_.plaster];
      const roofs = rank >= 2 ? [M_.tile, M_.tile, M_.slate, M_.tile2] : [M_.thatch, M_.tile, M_.thatch];
      const storeys = () => rank >= 3 ? 2 + Math.floor(rr() * 3) : rank === 2 ? 2 + Math.floor(rr() * 2) : 1 + Math.floor(rr() * 2);
      const house = (uu0, uu1, v0, v1) => {
        const a = T(uu0, v0), b = T(uu1, v1), x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, sx = Math.abs(b.x - a.x), sz = Math.abs(b.z - a.z);
        if (sx < 3 || sz < 3) return;
        const y0 = Math.min(y(a.x, a.z), y(b.x, b.z), y(a.x, b.z), y(b.x, a.z)) - 0.3, h = storeys() * 3.1 + 0.6, fm = fronts[Math.floor(rr() * fronts.length)];
        box(fm, x, y0 + h / 2, z, sx, h, sz);
        box(M_.dark, x, y0 + h - 0.15, z, sx + 0.08, 0.3, sz + 0.08);
        const rh = Math.min(sx, sz) * (0.45 + rr() * 0.2), rm = roofs[Math.floor(rr() * roofs.length)];
        if (sx >= sz) roof(rm, x, y0 + h, z, sz, rh, sx, Math.PI / 2); else roof(rm, x, y0 + h, z, sx, rh, sz, 0);
        if (rr() < 0.5) box(M_.brick, x + (rr() - 0.5) * sx * 0.5, y0 + h + rh * 0.7, z + (rr() - 0.5) * sz * 0.5, 0.7, rh * 1.1, 0.7);
        solid(x, z, sx / 2, sz / 2, 0, y0 + h + rh);
      };
      const row = (uu0, uu1, v0, v1) => { let u = uu0; while (u < uu1 - 3) { const wd = Math.min(uu1 - u, 5.5 + rr() * 3.5); house(u, u + wd, v0, v1); u += wd; } };
      const block = (uu0, uu1, v0, v1) => { if (Math.abs(v1 - v0) < 15) row(uu0, uu1, v0, v1); else { const m = v0 + (v1 - v0) / 2; row(uu0, uu1, v0, m); row(uu0, uu1, m, v1); } };
      // inside: the lane behind the rampart (u in, to in + 5), the square behind the gate (to sq), the main street on
      const inn = L.inner, sq = inn + 30;
      for (const sv of [-1, 1]) {
        const f = (v0, v1) => [sv * v0, sv * v1];
        block(inn + 5, sq, ...f(21, W)); row(inn + 12, sq, ...f(16, 21));
        block(sq, end, ...f(7, 21)); block(sq, end, ...f(27, W));
      }
      // the church, down the main street
      { const p = T(end + 10, 0), y0 = y(p.x, p.z) - 0.4, big = rank >= 2, Lc = big ? 18 : 14, Wd = big ? 9 : 7, th = big ? 26 + rank * 4 : 16;
        box(M_.ashlar, p.x, y0 + 4, p.z, Lc, 8, Wd); roof(M_.slate, p.x, y0 + 7.6, p.z, Wd, 4.5, Lc, Math.PI / 2);
        const t = T(end + 10 - Lc / 2 - 2.5, 0); box(M_.ashlar, t.x, y0 + th / 2, t.z, 5.5, th, 5.5);
        cone(rank >= 3 ? M_.copper : M_.slate, t.x, y0 + th, t.z, 3.8, th * 0.45, rank >= 3 ? 8 : 4);
        solid(p.x, p.z, Lc / 2, Wd / 2, 0, y0 + 9); solid(t.x, t.z, 2.75, 2.75, 0, y0 + th); }
      { const p = T(sq - 8, -10), y0 = y(p.x, p.z); const wl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 12), M_.stone); wl.position.set(p.x, y0 + 0.45, p.z); wl.castShadow = true; g.add(wl); solid(p.x, p.z, 1.1, 1.1, 0, y0 + 0.9); }
      if (!walls) return;
      // ---- the wall: its face a little out from the rampart's foot, the parapet a man's chest over the walk ----
      // (a star fort's low thick bastioned walls: twice the battering to bring down)
      const Hr = L.Hr, Th = 1.6, faceU = wallU - Th / 2, gate = L.gate, hk = walls >= 2 ? 2 : 1;
      // (the wall's foot: the ground outside it, which the rampart rises from)
      const foot = v => { const p = T(wallU - 2.5, v); return y(p.x, p.z); };
      // a length of it, va to vb: the face from below the ground to the parapet's top, a battered plinth at its foot, a
      // string course under the parapet, merlons along it (none at an embrasure, where a gun looks out low)
      const length = (va, vb, low = false, kind = "wall") => {
        const len = vb - va; if (len < 0.4) return;
        const grp = new THREE.Group(), rub = new THREE.Group(); tgt = grp;
        const vm = (va + vb) / 2, c = T(faceU, vm), y0 = Math.min(foot(va), foot(vb), foot(vm)) - 1.2, top = Math.min(foot(va), foot(vb), foot(vm)) + Hr + (low ? 0.3 : 1.25);
        box(M_.ashlar, c.x, (y0 + top) / 2, c.z, Th, top - y0, len);
        const pl = T(faceU - 0.35, vm); box(M_.ashlar2, pl.x, y0 + 1.6, pl.z, Th + 0.7, 2.4, len + 0.02);
        const sc = T(faceU - 0.1, vm); box(M_.ashlar2, sc.x, top - 0.55, sc.z, Th + 0.3, 0.22, len + 0.02);
        const merl = [];
        if (!low) for (let k = 0.6; k < len - 0.5; k += 2.2) { const m = T(faceU - 0.2, va + k + 0.55); merl.push(box(M_.ashlar, m.x, top + 0.42, m.z, Th - 0.3, 0.85, 1.1)); }
        tgt = rub;
        // (what's left when it comes down: the stones in a slope at its foot, up to where the rampart's earth shows)
        for (let i = 0; i < Math.max(4, len * 2.2); i++) { const p = T(faceU - 1.2 - rr() * 3.5, va + rr() * len), y1 = y(p.x, p.z), sz = 0.35 + rr() * 0.75; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), M_.ashlar); st.position.set(p.x, y1 + sz * 0.25, p.z); st.rotation.set(rr() * 3, rr() * 3, rr() * 3); st.castShadow = st.receiveShadow = true; rub.add(st); }
        tgt = g; rub.visible = false; g.add(grp, rub);
        const col = solid(c.x, c.z, Th / 2 + 0.35, len / 2, 0, top);
        if (col) breaks.push({ kind, hp: (low ? 90 : 150) * hk * len / 6, max: (low ? 90 : 150) * hk * len / 6, col, grp, rub, merl, x: c.x, z: c.z, hw: Th / 2 + 0.9, hd: len / 2 + 0.2, top });
      };
      // a tower: square, out before the wall, a little higher, crenellated
      const tower = v => {
        const grp = new THREE.Group(), rub = new THREE.Group(); tgt = grp;
        const c = T(faceU - 2.2, v), y0 = foot(v) - 1.2, top = foot(v) + Hr + 4.2, sz = 6.4;
        box(M_.ashlar, c.x, (y0 + top) / 2, c.z, sz, top - y0, sz);
        box(M_.ashlar2, c.x, y0 + 1.6, c.z, sz + 0.6, 2.4, sz + 0.6);
        box(M_.ashlar2, c.x, top - 0.5, c.z, sz + 0.3, 0.24, sz + 0.3);
        const merl = []; for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { const o = -sz / 2 + 0.6 + k * 2.6, side = [[o, -sz / 2 + 0.5], [o, sz / 2 - 0.5], [-sz / 2 + 0.5, o], [sz / 2 - 0.5, o]][i]; merl.push(box(M_.ashlar, c.x + side[0], top + 0.45, c.z + side[1], 1.1, 0.9, 1.1)); }
        tgt = rub; for (let i = 0; i < 16; i++) { const p = T(faceU - 2 - rr() * 6, v + (rr() - 0.5) * 7), y1 = y(p.x, p.z), s2 = 0.4 + rr() * 0.9; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(s2, 0), M_.ashlar); st.position.set(p.x, y1 + s2 * 0.25, p.z); st.rotation.set(rr() * 3, rr() * 3, rr() * 3); st.castShadow = true; rub.add(st); }
        tgt = g; rub.visible = false; g.add(grp, rub);
        const col = solid(c.x, c.z, sz / 2, sz / 2, 0, top);
        if (col) breaks.push({ kind: "tower", hp: 320 * hk, max: 320 * hk, col, grp, rub, merl, x: c.x, z: c.z, hw: sz / 2 + 0.5, hd: sz / 2 + 0.5, top });
      };
      // ---- along it: the towers, the gate between two of them, embrasures for the guns ----
      const towersAt = [-(W + 3), -L.tower, -(gate + 3.6), gate + 3.6, L.tower, W + 3], emb = L.guns;
      const stops = [...towersAt.map(v => [v - 3.2, v + 3.2]), [-gate, gate], ...emb.map(v => [v - 1.2, v + 1.2])].sort((a, b) => a[0] - b[0]);
      let v = -(W + 3) - 3.2;
      for (const [a, b] of stops) { if (a > v) { for (let s2 = v; s2 < a - 0.3; s2 += 6.5) length(s2, Math.min(a, s2 + 6.5)); } if (emb.some(e => Math.abs(e - (a + b) / 2) < 0.01)) length(a, b, true, "wall"); v = Math.max(v, b); }
      for (const tv of towersAt) tower(tv);
      // the gate: an arch of dressed stone over the way, and its doors — oak, banded with iron — shut
      { const c = T(faceU, 0), y0 = foot(0) - 1.2, top = foot(0) + Hr + 1.25;
        const archLo = foot(0) + 3.7, archHi = Math.max(top + 0.8, archLo + 1.2);
        box(M_.ashlar, c.x, (archLo + archHi) / 2, c.z, Th + 0.4, archHi - archLo, gate * 2 + 0.6);
        const grp = new THREE.Group(), rub = new THREE.Group(); tgt = grp;
        const dc = T(faceU + 0.2, 0), dh = 3.7;
        box(M_.door, dc.x, foot(0) + dh / 2, dc.z, 0.35, dh, gate * 2);
        for (const hy of [0.7, dh / 2, dh - 0.7]) box(M_.iron, dc.x - d * 0.2, foot(0) + hy, dc.z, 0.06, 0.12, gate * 2 + 0.02);
        box(M_.iron, dc.x - d * 0.2, foot(0) + dh / 2, dc.z, 0.06, dh, 0.1);
        tgt = rub; { const fp = T(faceU - 2.4, 0); box(M_.door, fp.x - d * 0.6, foot(0) + 0.2, fp.z - 1.4, dh * 0.9, 0.3, gate * 1.05, 0.2); box(M_.door, fp.x + d * 0.3, foot(0) + 0.25, fp.z + 1.6, dh * 0.85, 0.3, gate * 0.95, -0.25); }
        tgt = g; rub.visible = false; g.add(grp, rub);
        const col = solid(dc.x, dc.z, 0.4, gate, 0, foot(0) + dh);
        if (col) breaks.push({ kind: "gate", hp: 220 * hk, max: 220 * hk, col, grp, rub, merl: [], x: dc.x, z: dc.z, hw: 1.2, hd: gate + 0.3, top: foot(0) + dh, gate: true }); }
      // (its flanks: a plain wall back along either side of the town)
      // (in lengths of eight metres, each standing on its own ground, with a coping along its top)
      for (const sv of [-1, 1]) for (let u0 = wallU; u0 < end + 10; u0 += 8) {
        const u1 = Math.min(end + 10, u0 + 8.05), a = T(u0, sv * (W + 6)), b = T(u1, sv * (W + 6)), x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, len = Math.abs(b.x - a.x);
        const gs = [y(a.x, a.z), y(b.x, b.z), y(x, z)], y0 = Math.min(...gs) - 1.2, top = Math.max(...gs) + Hr + 1.3;
        box(M_.ashlar, x, (y0 + top) / 2, z, len, top - y0, Th);
        box(M_.ashlar2, x, top + 0.12, z, len + 0.02, 0.24, Th + 0.25);
        solid(x, z, len / 2, Th / 2 + 0.2, 0, top + 0.24); }
      // (for the field: where the defenders stand and their guns go — on the walk, behind the embrasures)
      const ap = T(wallU + 2.4, 0);
      siege = { d: d * sg, anchor: { x: ap.x, z: ap.z }, guns: emb.map(e => T(wallU + 2.6, e)) };
      // (where the storming parties set their ladders: along the plain lengths of wall, clear of the towers, the gate
      //  and the gun embrasures — the foot out from the wall, its head on the parapet, and the walk behind it)
      const lv = []; for (const sv of [-1, 1]) for (const v0 of [gate + 9, L.tower - 7, L.tower + 8, W - 5]) { const v1 = sv * v0; if (towersAt.some(t => Math.abs(t - v1) < 4.6) || emb.some(e => Math.abs(e - v1) < 2.6) || Math.abs(v1) < gate + 5) continue; lv.push(v1); }
      siege.ladders = lv.map(v1 => { const o = T(faceU - 2.1, v1), tp = T(faceU - 0.2, v1), i = T(wallU + 2.6, v1); return { v: v1, out: { x: o.x, z: o.z }, top: { x: tp.x, z: tp.z }, inn: { x: i.x, z: i.z }, footY: foot(v1), topY: foot(v1) + Hr + 1.25 }; });
      // (and the line of the wall: which side of it a man is)
      siege.wall = { ox: C.x, ux: d * sg, faceU, wallU, gateZ: T(faceU, 0).z };
    },
    // ---- a supply train on the road to a siege: the dirt road across the field, the wagons along it — covered carts
    //  with their canvas tilts on hoops, the casks and the sacks, two draught horses in each one's shafts — and the
    //  carters' things lying about. d: which side's half it's in; n: how many wagons ----
    convoy(d = -1, n = 6, seed = 1) {
      let s0 = seed | 0 || 1; const rr = () => (s0 = Math.imul(s0 ^ (s0 >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s0 >>> 0) % 1e6) / 1e6);
      const U = d * 12, dirt = mat(0x6e5a40, { surface: "stone" }), rut = mat(0x5a4a34, { surface: "stone" }), canvas = mat(0xd8ceb0, { surface: "plaster" }), plank = mat(0x6a5236, { surface: "wood" }), dark = mat(0x3a2c1e, { surface: "wood" }), cask = mat(0x7a5a38, { surface: "wood" }), sackM = mat(0xb8a882, { surface: "plaster" });
      // the road: its bed of beaten earth, two ruts worn in it
      for (let v = -95; v <= 95; v += 3.2) { const p = at(U + Math.sin(v * 0.02) * 3, v); box(dirt, p.x, y(p.x, p.z) + 0.02, p.z, 4.6, 0.06, 3.4); for (const o of [-0.8, 0.8]) box(rut, p.x + o, y(p.x, p.z) + 0.05, p.z, 0.32, 0.04, 3.4); }
      const wagon = (v, ry) => {
        const p = at(U + Math.sin(v * 0.02) * 3, v), y0 = y(p.x, p.z), r = ry * sg, c = Math.cos(r), sn = Math.sin(r);
        const off = (a, b) => ({ x: p.x + a * c + b * sn, z: p.z - a * sn + b * c });
        // (the bed and its sides; the tilt over it; four wheels, the hind pair bigger)
        const bed = off(0, 0); box(plank, bed.x, y0 + 1.05, bed.z, 1.5, 0.12, 3.4, r);
        for (const sx of [-0.72, 0.72]) { const q = off(sx, 0); box(plank, q.x, y0 + 1.35, q.z, 0.08, 0.55, 3.4, r); }
        const tilt = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 3.0, 12, 1, true, -Math.PI / 2, Math.PI), canvas);
        tilt.material.side = THREE.DoubleSide; tilt.rotation.set(-Math.PI / 2, 0, 0); const tg = new THREE.Group(); tg.add(tilt); tg.position.set(bed.x, y0 + 1.6, bed.z); tg.rotation.y = r; tilt.castShadow = true; tgt.add(tg);
        for (const [a, b, rad] of [[-0.82, 1.15, 0.5], [0.82, 1.15, 0.5], [-0.82, -1.15, 0.62], [0.82, -1.15, 0.62]]) {
          const q = off(a, b), wh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.1, 14), dark); wh.position.set(q.x, y0 + rad, q.z); wh.rotation.set(0, r, Math.PI / 2); wh.castShadow = true; tgt.add(wh);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), plank); hub.position.copy(wh.position); hub.rotation.copy(wh.rotation); tgt.add(hub);
        }
        // (the shafts, forward to the team)
        for (const sx of [-0.45, 0.45]) { const q = off(sx, 2.7); box(plank, q.x, y0 + 0.95, q.z, 0.08, 0.08, 2.4, r); }
        // the team: two draught horses, one before the other, in harness
        for (const [k, b] of [[0, 3.4], [1, 5.9]]) { const h = makeHorse([0x5a3a22, 0x6a4428, 0x3a2a1e, 0x8a8478][Math.floor(rr() * 4)], Math.floor(rr() * 1000), { draught: true }); const q = off(0, b); h.root.position.set(q.x, y(q.x, q.z), q.z); h.root.rotation.y = r; tgt.add(h.root); solid(q.x, q.z, 0.35, 1.1, r, y(q.x, q.z) + 1.7); }
        // the load spilling out of the back: casks of powder and biscuit, sacks of flour
        for (let i = 0; i < 3; i++) { const q = off((rr() - 0.5) * 1.6, -2.2 - rr() * 1.4); if (rr() < 0.5) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.75, 10), cask); k.position.set(q.x, y(q.x, q.z) + 0.37, q.z); k.castShadow = true; tgt.add(k); } else { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), sackM); sk.scale.set(1, 0.7, 1.3); sk.position.set(q.x, y(q.x, q.z) + 0.22, q.z); sk.rotation.y = rr() * 3; sk.castShadow = true; tgt.add(sk); } }
        solid(bed.x, bed.z, 0.85, 1.9, r, y0 + 2.4);
      };
      const n2 = Math.max(2, Math.min(9, n | 0)), gap = 11;
      for (let i = 0; i < n2; i++) wagon(-((n2 - 1) * gap) / 2 + i * gap + (rr() - 0.5) * 2, Math.PI * (rr() < 0.85 ? 0 : 1) + (rr() - 0.5) * 0.25);
    },
    // ---- a town of the Eastern Woodlands' nations: its longhouses of elm bark over bent poles, a few round wigwams, the
    //  cornfields about it, and round it all a palisade of sharpened logs — in lengths of six metres, each of which can
    //  be battered down or set alight and burnt through. d: the defenders' end of the field; rank: how big a town ----
    village(d = 1, rank = 1, seed = 1) {
      let s0 = seed | 0 || 1; const rr = () => (s0 = Math.imul(s0 ^ (s0 >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s0 >>> 0) % 1e6) / 1e6);
      const T = (uu, v) => at(d * uu, v), bark = mat(0x6e5a44, { surface: "wood" }), bark2 = mat(0x5e4c3a, { surface: "wood" }), log = mat(0x7a6248, { surface: "wood" }), char = mat(0x1e1a16, { surface: "wood" });
      const corn = mat(0x8a9a48), husk = mat(0xb8a868), mat2 = mat(0x8a7a5a, { surface: "plaster" });
      const U0 = 16, U1 = 16 + 58 + rank * 8, W = 32 + rank * 6, gate = 2.2;
      // the longhouses: long, round-roofed, a door at each end, laid along the town
      const longhouse = (uu, v, L, Wd) => {
        const p = T(uu, v), y0 = Math.min(y(p.x, p.z - L / 2), y(p.x, p.z + L / 2), y(p.x - Wd / 2, p.z), y(p.x + Wd / 2, p.z)) - 0.2, wallH = 2.3;
        box(bark, p.x, y0 + wallH / 2, p.z, Wd, wallH, L);
        const rf = new THREE.Mesh(new THREE.CylinderGeometry(Wd / 2 + 0.15, Wd / 2 + 0.15, L + 0.3, 14, 1, false, 0, Math.PI), bark2);
        rf.rotation.set(Math.PI / 2, Math.PI / 2, 0); rf.position.set(p.x, y0 + wallH, p.z); rf.castShadow = rf.receiveShadow = true; tgt.add(rf);
        // (the bark in strips: darker bands across the roof)
        for (let k = -L / 2 + 2; k < L / 2; k += 3.2) { const st = new THREE.Mesh(new THREE.CylinderGeometry(Wd / 2 + 0.2, Wd / 2 + 0.2, 0.18, 14, 1, true, 0, Math.PI), char); st.rotation.set(Math.PI / 2, Math.PI / 2, 0); st.position.set(p.x, y0 + wallH, p.z + k); tgt.add(st); }
        for (const e of [-1, 1]) { box(char, p.x, y0 + 0.95, p.z + e * (L / 2 + 0.02), 1.1, 1.9, 0.1); }
        // (the smoke holes along the ridge, where the fires inside draw)
        for (let k = -L / 2 + 4; k < L / 2 - 2; k += 6) smokes.push({ x: p.x, y: y0 + wallH + Wd / 2 + 0.2, z: p.z + k });
        solid(p.x, p.z, Wd / 2, L / 2, 0, y0 + wallH + Wd / 2);
      };
      const wigwam = (uu, v, r) => {
        const p = T(uu, v), y0 = y(p.x, p.z) - 0.15;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), rr() < 0.5 ? bark : mat2); m.scale.y = 0.85; m.position.set(p.x, y0, p.z); m.castShadow = m.receiveShadow = true; tgt.add(m);
        box(char, p.x + r * 0.95, y0 + 0.7, p.z, 0.1, 1.4, 0.9);
        solid(p.x, p.z, r * 0.8, r * 0.8, 0, y0 + r * 0.85);
      };
      // (the houses in two or three rows along the town, lanes between; round houses where there's room)
      const rows = rank >= 2 ? [-W * 0.55, 0, W * 0.55] : [-W * 0.4, W * 0.4];
      for (const v0 of rows) { let uu = U0 + 10; while (uu < U1 - 14) { const L = 16 + rr() * 10; if (uu + L > U1 - 6) break; longhouse(uu + L / 2, v0 + (rr() - 0.5) * 3, L, 6 + rr() * 1.2); uu += L + 5 + rr() * 4; } }
      for (let i = 0; i < 3 + rank * 2; i++) wigwam(U0 + 8 + rr() * (U1 - U0 - 16), (rr() < 0.5 ? -1 : 1) * (W * 0.78 + rr() * 2), 2.2 + rr() * 0.8);
      // the cornfields outside, beyond the palisade on either side: rows of tall stalks, hilled
      const stalks = [];
      for (const sv of [-1, 1]) for (let uu = U0 + 4; uu < U1 - 4; uu += 1.6) for (let v = W + 10; v < W + 34; v += 1.5) if (rr() < 0.85) stalks.push(T(uu + (rr() - 0.5) * 0.5, sv * v + (rr() - 0.5) * 0.4));
      if (stalks.length) {
        const sgeo = new THREE.CylinderGeometry(0.025, 0.04, 2.1, 4), lgeo = new THREE.ConeGeometry(0.28, 1.2, 4);
        const im = new THREE.InstancedMesh(sgeo, corn, stalks.length), il = new THREE.InstancedMesh(lgeo, husk, stalks.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        stalks.forEach((p, i) => { const yy = y(p.x, p.z); e.set((hsh(p.x, p.z) - 0.5) * 0.15, hsh(p.z, p.x) * 6, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, yy + 1.05, p.z), q, new THREE.Vector3(1, 0.9 + hsh(p.x, 1) * 0.25, 1)); im.setMatrixAt(i, m4); m4.compose(new THREE.Vector3(p.x, yy + 1.2, p.z), q, new THREE.Vector3(1, 1, 1)); il.setMatrixAt(i, m4); });
        im.castShadow = il.castShadow = true; g.add(im, il);
      }
      // ---- the palisade: a line of logs, sharpened, set in a trench shoulder to shoulder, a little over four metres
      //  high; round the town, with the way in at the front ----
      const sgeo = new THREE.CylinderGeometry(0.17, 0.2, 4.0, 6), tgeo = new THREE.ConeGeometry(0.17, 0.5, 6);
      const length = (a, b, front) => {
        // a, b: [uu, v] ends of a straight length
        const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.36)), grp = new THREE.Group(), rub = new THREE.Group(), pts = [];
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, uu = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t; pts.push(T(uu + (hsh(uu, v) - 0.5) * 0.08, v)); }
        const ims = new THREE.InstancedMesh(sgeo, log, n), imt = new THREE.InstancedMesh(tgeo, log, n), imr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 1, 6), char, n), m4 = new THREE.Matrix4(), one = new THREE.Quaternion();
        let lo = Infinity;
        pts.forEach((p, i) => { const yy = y(p.x, p.z), hh = 3.8 + hsh(p.x, p.z) * 0.5; lo = Math.min(lo, yy);
          m4.compose(new THREE.Vector3(p.x, yy + hh / 2 - 0.2, p.z), one, new THREE.Vector3(1, hh / 4, 1)); ims.setMatrixAt(i, m4);
          m4.compose(new THREE.Vector3(p.x, yy + hh - 0.2 + 0.25, p.z), one, new THREE.Vector3(1, 1, 1)); imt.setMatrixAt(i, m4);
          const st = 0.3 + hsh(p.z, p.x) * 0.9; m4.compose(new THREE.Vector3(p.x, yy + st / 2 - 0.1, p.z), one, new THREE.Vector3(1, st, 1)); imr.setMatrixAt(i, m4); });
        ims.castShadow = imt.castShadow = true; grp.add(ims, imt); rub.add(imr); rub.visible = false; g.add(grp, rub);
        const A = T(a[0], a[1]), Bq = T(b[0], b[1]), x = (A.x + Bq.x) / 2, z = (A.z + Bq.z) / 2, alongV = Math.abs(Bq.z - A.z) > Math.abs(Bq.x - A.x);
        const hw = alongV ? 0.35 : Math.abs(Bq.x - A.x) / 2, hd = alongV ? Math.abs(Bq.z - A.z) / 2 : 0.35, top = lo + 4.1;
        const col = solid(x, z, hw, hd, 0, top);
        if (col) palisade.push({ kind: "palisade", hp: 160, max: 160, col, grp, rub, merl: [], x, z, hw: hw + 0.5, hd: hd + 0.5, top, front, out: alongV ? { x: x + Math.sign(x - T((U0 + U1) / 2, 0).x) * 2.2, z } : { x, z: z + Math.sign(z - C.z || 1) * 2.2 }, pts });
      };
      const run = (a, b, front = false) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 6)); for (let i = 0; i < n; i++) length([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n], front); };
      palisade.side = d * sg > 0 ? 1 : 0;
      run([U0, -W], [U0, -gate], true); run([U0, gate], [U0, W], true);
      run([U0, W], [U1, W]); run([U1, W], [U1, -W]); run([U1, -W], [U0, -W]);
      // (a fire in the middle of the town, and racks of hides and fish drying)
      { const p = T((U0 + U1) / 2, 0), y0 = y(p.x, p.z); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(M_.stone, p.x + Math.cos(a) * 0.9, y0 + 0.1, p.z + Math.sin(a) * 0.9, 0.35, 0.25, 0.35); } }
      for (let i = 0; i < 4; i++) { const p = T(U0 + 12 + rr() * (U1 - U0 - 24), (rr() - 0.5) * W * 0.3), y0 = y(p.x, p.z); for (const e of [-1, 1]) box(M_.wood, p.x, y0 + 0.9, p.z + e * 1.2, 0.1, 1.8, 0.1); box(M_.wood, p.x, y0 + 1.75, p.z, 0.08, 0.08, 2.5); box(mat(0x9a7a5a), p.x, y0 + 1.3, p.z, 0.05, 0.8, 2.0); }
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
    else if (k === "convoy") { const d = a[0] || -1; for (let v = -100; v <= 100; v += 8) { const p = at(d * 12, v); w.clearScenery(p.x, p.z, 8); } }
    else if (k === "village") { const d = a[0] || 1; for (let uu = 0; uu <= 140; uu += 12) for (let v = -90; v <= 90; v += 12) { const p = at(d * uu, v); w.clearScenery(p.x, p.z, 9); } }
    else if (k === "town") { const d = a[0] || 1; for (let uu = -70; uu <= 95; uu += 12) for (let v = -80; v <= 80; v += 12) { const p = at(d * uu, v); w.clearScenery(p.x, p.z, 9); } }
    else if (k === "city") for (let v = Math.min(a[1], a[2]); v <= Math.max(a[1], a[2]); v += 30) { const p = at(a[0] - 40, v); w.clearScenery(p.x, p.z, 55); }
    else if (k === "tents" || k === "vines") { const p = at((a[0] + a[1]) / 2, (a[2] + a[3]) / 2); w.clearScenery(p.x, p.z, Math.hypot(a[1] - a[0], a[3] - a[2]) / 2 + 6); }
  }
  for (const [k, ...a] of M.things) if (B[k]) B[k](...a);
  w.root.add(g);
  // (a town besieged before the assault: how far its walls are already battered down, 0 to 1 and more)
  const twn = M.things.find(t => t[0] === "town");
  return { g, cols, breaks: [...breaks, ...palisade], palisade, smokes, siege, battered: (twn && twn[5]) || 0 };
}
