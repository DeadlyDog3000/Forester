// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Europe, close to. Zoom far enough into the map of 1683 and the parchment
// gives way to the ground itself: the true coasts, mountains where the ranges
// run (their heights sketched from the ranges, not surveyed), and the country
// as it grows — tundra in the far north, taiga and pine through Scandinavia and
// Muscovy, oak and beech woods between the fields of the middle, olive and
// cypress round the Mediterranean, grass steppe on the Pontic and Hungarian
// plains, desert beyond the Atlas, bare rock and snow on the high peaks. The
// cities stand on it, named, in their masters' colours; the borders are drawn
// on the ground.
//
// One degree of latitude is ten units; heights are ten times the truth, or the
// Alps would be a wrinkle.

import { THREE, rng } from "./core.js";
import { NATIONS, CITIES, buildGrid, cityOwner, HOME, GW, GH, BOUNDS, SHEET, PEOPLES, fwd, inv } from "./europe.js";
import { hash, vnoise, fbm, RANGES, PLATEAUS, segDist } from "./relief.js";
import { ensureModel, modelCopy } from "./models.js";

const K = Math.cos(49 * Math.PI / 180);
export const U = 10;                                       // units per degree of latitude
// (the sheet's size, from the one in use — Europe's for the story, the world's for a campaign: taken up afresh whenever
//  the land's built or drawn)
let MAP_W = 1, MAP_H = 1, CELL = 1;
const sync = () => { MAP_W = (BOUNDS.lon1 - BOUNDS.lon0) * K * U; MAP_H = (BOUNDS.lat1 - BOUNDS.lat0) * U; CELL = MAP_W / GW; };
// (the land laid out as the sheet is: in its effective degrees — North America larger, as on the map)
export const toWorld = (lon, lat) => { const [ex, ey] = fwd(lon, lat); return [(ex - BOUNDS.lon0) * K * U, (BOUNDS.lat1 - ey) * U]; };
export const toLL = (x, z) => inv(BOUNDS.lon0 + x / (K * U), BOUNDS.lat1 - z / U);


// ---- the land: which ground is land, from the map's grid, softened into a coast ----
let landGrid = null;
function landAt(g, lon, lat) {
  // bilinear over the grid's land and sea, so the coast is a line and not steps
  const [ex, ey] = fwd(lon, lat), gx = (ex - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0) * GW - 0.5, gy = (BOUNDS.lat1 - ey) / (BOUNDS.lat1 - BOUNDS.lat0) * GH - 0.5;
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const L = (x, y) => (g[y] && g[y][x] ? 1 : 0);
  return L(x0, y0) * (1 - fx) * (1 - fy) + L(x0 + 1, y0) * fx * (1 - fy) + L(x0, y0 + 1) * (1 - fx) * fy + L(x0 + 1, y0 + 1) * fx * fy;
}
// height in km (below 0: sea)
export function heightAt(g, lon, lat) {
  const land = landAt(g, lon, lat) + (fbm(lon * 3.1, lat * 3.1, 7) - 0.5) * 0.45;
  if (land < 0.5) return -0.18 + land * 0.3;
  // (the land comes down to the water gently: everything is eased toward nought at the shore)
  const shore = Math.min(1, (land - 0.5) / 0.3), ease = shore * shore * (3 - 2 * shore);
  let h = 0.02 + ease * (0.04 + fbm(lon * 1.3, lat * 1.3, 3) * 0.28);
  for (const [pts, km, w] of RANGES) {
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(lon * K, lat, pts[i - 1][0] * K, pts[i - 1][1], pts[i][0] * K, pts[i][1]));
    if (d < w * 3) h += ease * km * Math.exp(-(d * d) / (2 * w * w)) * (0.6 + fbm(lon * 4, lat * 4, 11) * 0.7);
  }
  for (const [x0, y0, x1, y1, km] of PLATEAUS) {
    const ex = Math.min(lon - x0, x1 - lon), ey = Math.min(lat - y0, y1 - lat);
    if (ex > 0 && ey > 0) h += ease * km * Math.min(1, Math.min(ex, ey) / 0.8);
  }
  return h;
}
// what grows there
export function biomeAt(lon, lat, h) {
  // (the edges between them wander, as they do)
  lat += (fbm(lon * 1.7, lat * 1.7, 21) - 0.5) * 1.6; lon += (fbm(lon * 1.7, lat * 1.7, 23) - 0.5) * 1.6;
  const snowline = 2.6 - Math.max(0, lat - 45) * 0.06;
  if (h > snowline) return "snow";
  if (h > snowline - 0.3) return "rock";
  if (lat > 64 || (lat > 61 && lon > 35)) return "tundra";
  // (the New World: the north's forest and barrens, the prairie past the Mississippi, the broad woods of the east)
  if (lon < -45) return lat > 58 ? "tundra" : lat > 46.5 ? "taiga" : lon < -94.5 && lat < 47 ? "steppe" : lat < 30.5 ? "med" : "temperate";
  if (lat < 34.5 && lon < 36) return h > 1.2 ? "rock" : "desert";
  if ((lon > 29 && lat < 51 && lat > 44.5 && lon < 44) || (lon > 18.5 && lon < 22.2 && lat > 45.4 && lat < 48.2) || (lon > 31 && lon < 40 && lat > 37.6 && lat < 40.6)) return "steppe";
  if (lat > 57.5 || (lat > 53 && lon > 28) || h > 1.3) return "taiga";
  if (lat < 43.6 || (lat < 45.5 && lon > -2 && lon < 9) || (lon > 26 && lat < 41.2)) return "med";
  return "temperate";
}
const BIOME_COL = { snow: 0xf1f3f5, rock: 0x8c877e, tundra: 0x8c8a66, desert: 0xd8b77a, steppe: 0xb8b068, taiga: 0x4f6b40, med: 0x9a9a60, temperate: 0x6f9448, beach: 0xd9c89a };
const _c = new THREE.Color(), _c2 = new THREE.Color();
function groundColour(lon, lat, h, out) {
  const b = biomeAt(lon, lat, h);
  out.setHex(h < 0.07 && b !== "snow" && b !== "rock" ? BIOME_COL.beach : BIOME_COL[b]);
  // fields: a patchwork of greens and golds through the settled country
  if (b === "temperate" || b === "med") {
    const f = vnoise(lon * 22, lat * 34, 5);
    if (fbm(lon * 2.2, lat * 2.2, 9) < 0.47) out.lerp(_c2.setHex(f < 0.33 ? 0xc0b25a : f < 0.66 ? 0x9cb050 : 0x7f9a44), 0.65);
  }
  // snow lies lower in the north
  const sl = 2.4 - Math.max(0, lat - 45) * 0.06;
  if (h > sl && b !== "desert") out.lerp(_c2.setHex(0xeef1f4), Math.min(1, (h - sl) * 2.5));
  out.offsetHSL(0, 0, (vnoise(lon * 40, lat * 40, 2) - 0.5) * 0.05);
  return out;
}
const EXAG = 10 / 111 * U;                                  // km to units, ten times over

// ---- trees and bushes: each kind one instanced mesh ----
function treeKinds() {
  const trunk = new THREE.CylinderGeometry(0.004, 0.006, 0.03, 5).translate(0, 0.015, 0);
  const cone = new THREE.ConeGeometry(0.022, 0.07, 6).translate(0, 0.055, 0);
  const merge = (a, b) => { const g = new THREE.BufferGeometry(), pa = a.index ? a.toNonIndexed() : a, pb = b.index ? b.toNonIndexed() : b; const pos = new Float32Array([...pa.attributes.position.array, ...pb.attributes.position.array]); const col = new Float32Array(pos.length); const n1 = pa.attributes.position.count; for (let i = 0; i < pos.length / 3; i++) { const c = i < n1 ? [0.35, 0.24, 0.14] : [1, 1, 1]; col.set(c, i * 3); } g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g; };
  const m = col => new THREE.MeshStandardMaterial({ color: col, vertexColors: true, roughness: 0.9, flatShading: true });
  return {
    conifer: { geo: merge(trunk, cone), mat: m(0x2f5a30) },
    broad: { geo: merge(trunk, new THREE.IcosahedronGeometry(0.026, 0).translate(0, 0.045, 0)), mat: m(0x4f8a34) },
    olive: { geo: merge(trunk, new THREE.IcosahedronGeometry(0.018, 0).scale(1.2, 0.8, 1.2).translate(0, 0.035, 0)), mat: m(0x7d8a52) },
    cypress: { geo: merge(trunk, new THREE.ConeGeometry(0.01, 0.075, 5).translate(0, 0.055, 0)), mat: m(0x2e4a2a) },
    bush: { geo: (() => { const g = new THREE.IcosahedronGeometry(0.012, 0).translate(0, 0.008, 0); g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); return g; })(), mat: m(0x7a8a4a) },
    palm: { geo: merge(new THREE.CylinderGeometry(0.003, 0.004, 0.06, 5).translate(0, 0.03, 0), new THREE.ConeGeometry(0.025, 0.012, 6).translate(0, 0.064, 0)), mat: m(0x5f8a3a) },
  };
}
// what stands in a patch of ground, per biome: [kind, how many to a square unit at most]
const FLORA = { taiga: [["conifer", 520]], temperate: [["broad", 380], ["conifer", 90]], med: [["olive", 150], ["cypress", 40]], steppe: [["bush", 60], ["broad", 8]], tundra: [["bush", 50], ["conifer", 20]], desert: [["palm", 3]], rock: [["conifer", 30]], snow: [] };

export class EuropeView3D {
  constructor(parent, { onPick } = {}) {
    this.onPick = onPick;
    this.el = document.createElement("canvas"); this.el.className = "eu3d";
    parent.appendChild(this.el);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.el, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); sync();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9cbd6);
    this.scene.fog = new THREE.Fog(0xb9cbd6, 30, 90);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1500);
    this.scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x5a5040, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6); sun.position.set(-40, 60, 30); this.scene.add(sun);
    // the sea: one sheet, at nought
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 1.6, MAP_H * 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3e6f86, roughness: 0.35, metalness: 0.1 }));
    sea.position.set(MAP_W / 2, 0, MAP_H / 2); this.scene.add(sea);
    this.kinds = treeKinds();
    this.cells = new Map();          // patches of trees, by cell key
    this.target = new THREE.Vector3(); this.dist = 30;
    this.visible = false;
  }
  // the political map changed (a conquest) or first shown: rebuild what depends on it
  setMap(E, homePop = 2, homeName = "Forester's Clearing") {
    sync();
    const cq = E.conq, last = cq.length ? cq[cq.length - 1] : null, key = SHEET + (E.rev | 0) + ":" + cq.length + ":" + (last ? last.c + "," + last.r + last.to : "") + "|" + homeName;
    const g = buildGrid(E);
    if (this.g && this.mapKey === key) return;
    this.g = g; this.mapKey = key; this.E = E; this.homeName = homeName;
    // (the ground itself doesn't change with a conquest — only who holds it: raised once for the sheet)
    if (!this.base || this.baseSheet !== SHEET) { this.buildBase(); this.baseSheet = SHEET; }
    this.buildBorders(); this.buildCities(homePop);
    if (this.detail) { this.scene.remove(this.detail); this.detail.geometry.dispose(); this.detail = null; }
    for (const c of this.cells.values()) c.forEach(m => this.scene.remove(m)); this.cells.clear();
  }
  // all of Europe, coarsely: what you see far off, and under the fine patch
  buildBase() {
    if (this.base) { this.scene.remove(this.base); this.base.geometry.dispose(); }
    const nx = Math.min(900, Math.round(360 * GW / 400)), nz = Math.round(nx * MAP_H / MAP_W), geo = new THREE.PlaneGeometry(MAP_W, MAP_H, nx, nz).rotateX(-Math.PI / 2);
    geo.translate(MAP_W / 2, 0, MAP_H / 2);
    // (a little under the fine ground, so where both are drawn the fine one's coast is the one you see)
    this.base = this.terrainMesh(geo, -0.02);
    // (its heights, row by row, for the fine patch to meet at its edges)
    const p = this.base.geometry.attributes.position;
    this.baseN = [nx, nz]; this.baseH = new Float32Array(p.count); for (let i = 0; i < p.count; i++) this.baseH[i] = p.getY(i);
    this.scene.add(this.base);
  }
  sinkBase(x0, x1, z0, z1) {
    const p = this.base.geometry.attributes.position, [nx, nz] = this.baseN;
    if (this.sunk) for (const i of this.sunk) p.setY(i, this.baseH[i]);
    this.sunk = [];
    const i0 = Math.max(0, Math.ceil(x0 / MAP_W * nx)), i1 = Math.min(nx, Math.floor(x1 / MAP_W * nx)), j0 = Math.max(0, Math.ceil(z0 / MAP_H * nz)), j1 = Math.min(nz, Math.floor(z1 / MAP_H * nz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * (nx + 1) + i; p.setY(k, -0.5); this.sunk.push(k); }
    p.needsUpdate = true;
  }
  // the coarse ground's height at a point, as its mesh draws it (between its vertices)
  baseY(x, z) {
    const [nx, nz] = this.baseN, gx = Math.max(0, Math.min(nx - 0.001, x / MAP_W * nx)), gz = Math.max(0, Math.min(nz - 0.001, z / MAP_H * nz));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, H = (a, b) => this.baseH[b * (nx + 1) + a];
    return H(i, j) * (1 - fx) * (1 - fz) + H(i + 1, j) * fx * (1 - fz) + H(i, j + 1) * (1 - fx) * fz + H(i + 1, j + 1) * fx * fz;
  }
  terrainMesh(geo, dy = 0, edge = null) {
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), [lon, lat] = toLL(x, z), h = heightAt(this.g, lon, lat);
      let y = Math.max(-0.16, h * EXAG) + dy;
      // a patch's rim eases down onto the coarse ground under it, so no cliff shows where one ends
      if (edge) { const d = Math.min(x - edge.x0, edge.x1 - x, z - edge.z0, edge.z1 - z), t = Math.max(0, Math.min(1, d / edge.band)), b = this.baseY(x, z) + 0.01; y = b + (y - b) * t * t * (3 - 2 * t); }
      p.setY(i, y);
      groundColour(lon, lat, h, _c); col.set([_c.r, _c.g, _c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    return m;
  }
  // the ground near where you look, finely
  buildDetail() {
    if (this.dist > 50) { if (this.detail) { this.scene.remove(this.detail); this.detail.geometry.dispose(); this.detail = null; this.detailAt = ""; this.sinkBase(0, -1, 0, -1); } return; }
    // (close in, a small patch, very fine; further off, a wider one — so the land never shows the coarse ground's blur)
    const wide = this.dist > 16, step = wide ? 12 : 4, cx = Math.round(this.target.x / step) * step, cz = Math.round(this.target.z / step) * step;
    if (this.detail && this.detailAt === cx + "," + cz + wide) return;
    this.detailAt = cx + "," + cz + wide;
    if (this.detail) { this.scene.remove(this.detail); this.detail.geometry.dispose(); }
    const size = wide ? 110 : 30, geo = new THREE.PlaneGeometry(size, size, wide ? 400 : 240, wide ? 400 : 240).rotateX(-Math.PI / 2);
    geo.translate(cx, 0, cz);
    this.detail = this.terrainMesh(geo, 0, { x0: cx - size / 2, x1: cx + size / 2, z0: cz - size / 2, z1: cz + size / 2, band: 6 }); this.scene.add(this.detail);
    // the coarse ground under the patch's middle goes under the water, so its rougher coast can't show through the fine one
    this.sinkBase(cx - size / 2 + 6.5, cx + size / 2 - 6.5, cz - size / 2 + 6.5, cz + size / 2 - 6.5);
  }
  groundY(x, z) { const [lon, lat] = toLL(x, z); return Math.max(-0.16, heightAt(this.g, lon, lat) * EXAG); }
  // trees, a unit square at a time, the same every time for the same square
  treesNear() {
    const R = this.dist < 6 ? 5 : this.dist < 14 ? 7 : 0, have = new Set();
    if (R) for (let gx = Math.floor(this.target.x - R); gx <= this.target.x + R; gx++) for (let gz = Math.floor(this.target.z - R); gz <= this.target.z + R; gz++) {
      const key = gx + "," + gz; have.add(key);
      if (!this.cells.has(key)) this.cells.set(key, this.plant(gx, gz));
    }
    for (const [key, ms] of this.cells) if (!have.has(key)) { ms.forEach(m => this.scene.remove(m)); this.cells.delete(key); }
  }
  plant(gx, gz) {
    const r = rng(gx * 7919 + gz * 104729 + 17), per = {}, o = new THREE.Object3D();
    const [lon0, lat0] = toLL(gx + 0.5, gz + 0.5), h0 = heightAt(this.g, lon0, lat0);
    if (h0 < 0.02) return [];
    const flora = FLORA[biomeAt(lon0, lat0, h0)] || [];
    for (const [kind, max] of flora) {
      // woods in clumps: the density follows the noise
      const list = per[kind] = [];
      for (let i = 0; i < max; i++) {
        const x = gx + r(), z = gz + r(), [lon, lat] = toLL(x, z);
        const wood = fbm(lon * 9, lat * 9, 13);
        if (wood < (kind === "bush" || kind === "palm" ? 0.45 : 0.52) || r() > 0.85) continue;
        const h = heightAt(this.g, lon, lat); if (h < 0.03 || biomeAt(lon, lat, h) === "snow") continue;
        // (no wood growing in a town, nor in the fields close round it)
        if (this.clearings && this.clearings.some(([cx, cz, cr]) => (x - cx) * (x - cx) + (z - cz) * (z - cz) < cr * cr)) continue;
        const s = 0.7 + r() * 0.7;
        o.position.set(x, h * EXAG, z); o.rotation.set(0, r() * 6.28, 0); o.scale.set(s, s * (0.85 + r() * 0.3), s); o.updateMatrix();
        list.push(o.matrix.clone());
      }
    }
    const out = [];
    for (const [kind, ms] of Object.entries(per)) {
      if (!ms.length) continue;
      const k = this.kinds[kind], im = new THREE.InstancedMesh(k.geo, k.mat, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m)); this.scene.add(im); out.push(im);
    }
    return out;
  }
  // borders: a red-brown line where one crown's ground meets another's
  buildBorders() {
    if (this.borders) { this.scene.remove(this.borders); this.borders.geometry.dispose(); }
    const g = this.g, pts = [], y = (x, z) => this.groundY(x, z) + 0.04;
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const id = g[r][c]; if (!id || !NATIONS[id]) continue;
      const e = g[r][c + 1], s = g[r + 1] && g[r + 1][c];
      if (e && e !== id && NATIONS[e]) { const x = (c + 1) * CELL, z0 = r * CELL, z1 = (r + 1) * CELL; pts.push(x, y(x, z0), z0, x, y(x, z1), z1); }
      if (s && s !== id && NATIONS[s]) { const z = (r + 1) * CELL, x0 = c * CELL, x1 = (c + 1) * CELL; pts.push(x0, y(x0, z), z, x1, y(x1, z), z); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.borders = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9a2a1a, transparent: true, opacity: 0.7 }));
    this.scene.add(this.borders);
  }
  // the cities: houses and a church on the ground, and the name, in the colour of whoever holds it
  buildCities(homePop) {
    if (this.cityGroup) this.scene.remove(this.cityGroup);
    const grp = this.cityGroup = new THREE.Group();
    const house = new THREE.BoxGeometry(0.04, 0.03, 0.05), roof = new THREE.ConeGeometry(0.037, 0.028, 4).rotateY(Math.PI / 4);
    // (the woods' nations' towns: a longhouse, round-roofed, and the stakes of a palisade)
    const longGeo = new THREE.CapsuleGeometry(0.014, 0.05, 3, 6).rotateZ(Math.PI / 2).scale(1, 1.2, 1).translate(0, 0.012, 0), barkMat = new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 0.95 });
    const stakeGeo = new THREE.CylinderGeometry(0.003, 0.004, 0.036, 4), stakeMat = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.9 });
    const wall = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.9 }), tile = new THREE.MeshStandardMaterial({ color: 0xa04a30, roughness: 0.8 }), stone = new THREE.MeshStandardMaterial({ color: 0xb8b0a0 });
    this.labels = [];
    this.clearings = [];
    const place = (name, lon, lat, rank, own, isHome) => {
      const [x, z] = toWorld(lon, lat), r = rng(Math.round(lon * 100 + lat * 7)), y0 = this.groundY(x, z);
      this.clearings.push([x, z, (rank === 3 ? 0.45 : rank === 2 ? 0.34 : 0.24) + (own && NATIONS[own] && NATIONS[own].nw ? 0.08 : 0)]);
      if (y0 < -0.1) return;
      const n = isHome ? 5 : rank === 3 ? 80 : rank === 2 ? 44 : 16, spread = rank === 3 ? 0.32 : rank === 2 ? 0.22 : 0.12;
      // (a town of the woods' nations: longhouses of bark inside a ring of palisade, no church)
      const woods = own && NATIONS[own] && NATIONS[own].nw;
      if (woods) {
        const R = 0.13 + rank * 0.03;
        for (let i = 0; i < 4 + rank * 3; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * R * 0.8, hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d, hy = this.groundY(hx, hz); const lh = new THREE.Mesh(longGeo, barkMat); lh.position.set(hx, hy, hz); lh.rotation.y = r() * 3; grp.add(lh); }
        const N = 28 + rank * 10; for (let i = 0; i < N; i++) { const a = i / N * 6.28, sx = x + Math.cos(a) * R, sz = z + Math.sin(a) * R; if (Math.abs(Math.sin(a)) < 0.06 && Math.cos(a) > 0) continue; const st = new THREE.Mesh(stakeGeo, stakeMat); st.position.set(sx, this.groundY(sx, sz) + 0.018, sz); grp.add(st); }
      }
      for (let i = 0; i < (woods ? 0 : n); i++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * spread, hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d, hy = this.groundY(hx, hz);
        const hm = new THREE.Mesh(house, wall); hm.position.set(hx, hy + 0.015, hz); hm.rotation.y = r() * 3; grp.add(hm);
        const rm = new THREE.Mesh(roof, tile); rm.position.set(hx, hy + 0.044, hz); rm.rotation.y = hm.rotation.y; grp.add(rm);
      }
      // a church, or a cathedral
      const th = 0.12 + rank * 0.03;
      if (!woods) {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(0.036, th, 0.036), stone); tw.position.set(x, y0 + th / 2, z); grp.add(tw);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x4a5a58 })); sp.position.set(x, y0 + th + 0.05, z); grp.add(sp);
      }
      // the name
      const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const c = cv.getContext("2d");
      c.font = `${rank === 3 ? "600 " : ""}30px "IM Fell English", Georgia, serif`; const w = Math.min(248, c.measureText(name).width + 22);
      c.fillStyle = "rgba(239,228,198,0.92)"; c.fillRect(128 - w / 2, 10, w, 40);
      c.fillStyle = isHome ? "#b0281a" : own ? NATIONS[own].color : "#888"; c.fillRect(128 - w / 2, 10, 7, 40);
      c.strokeStyle = "#3a2a1a"; c.lineWidth = 2; c.strokeRect(128 - w / 2, 10, w, 40);
      c.fillStyle = "#2a1c10"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(name, 128 + 3, 31);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true }));
      sprite.scale.set(0.16, 0.04, 1); sprite.position.set(x, y0 + 0.3, z); sprite.renderOrder = 5;
      sprite.userData = { rank, city: isHome ? null : name };
      grp.add(sprite); this.labels.push(sprite);
    };
    for (const ct of CITIES) place(ct[0], ct[1], ct[2], ct[3], cityOwner(this.g, ct), false);
    // (your own clearing — not on a campaign's map, which has none)
    if (this.homeName !== null) { const [hlon, hlat] = toLL((HOME.mx + 0.5) * CELL, (HOME.my + 0.5) * CELL); place(this.homeName || "Forester's Clearing", hlon, hlat, 1, null, true); }
    this.scene.add(grp);
  }
  // marks over towns (a campaign's): crossed swords where you can march, a ring round your own, red where they're
  // threatened — [{ name, lon, lat, kind: "swords" | "ring" | "dash", color, dim }]
  marks(list) {
    const key = JSON.stringify(list); if (key === this.markKey) return; this.markKey = key;
    if (this.markGroup) { this.markGroup.traverse(o => { if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); } }); this.scene.remove(this.markGroup); }
    const grp = this.markGroup = new THREE.Group(), tex = new Map();
    const texOf = (kind, color, dim, n = "", mine = false) => {
      const k = kind + color + dim + n + mine; if (tex.has(k)) return tex.get(k);
      const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d");
      c.globalAlpha = dim ? 0.45 : 1; c.strokeStyle = color; c.lineCap = "round";
      if (kind === "army") {
        // (an army as the engravers drew one: two lines of battalions in its colour, horse on the wings, the count
        //  of regiments in italic under it — flat and small, not a flag over the country)
        const ink = mine ? "#2a1c10" : "#7a2216";
        for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { const bx = 12 + i * 9.4 + r * 2.2, by = 18 + r * 7.5; c.globalAlpha = r ? 0.8 : 1; c.fillStyle = color; c.fillRect(bx, by, 7.4, 4.6); c.globalAlpha = 1; c.strokeStyle = ink; c.lineWidth = 1.3; c.strokeRect(bx, by, 7.4, 4.6); }
        for (const hx of [6, 58]) { c.fillStyle = color; c.strokeStyle = ink; c.beginPath(); c.moveTo(hx, 18); c.lineTo(hx + 3.6, 22); c.lineTo(hx, 26); c.lineTo(hx - 3.6, 22); c.closePath(); c.fill(); c.stroke(); }
        c.strokeStyle = ink; c.lineWidth = 1.6; c.beginPath(); c.moveTo(11, 15.5); c.lineTo(48, 15.5); c.stroke();
        c.font = "italic bold 16px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 5; c.strokeText(String(n), 32, 46); c.fillStyle = ink; c.fillText(String(n), 32, 46);
      } else if (kind === "party") {
        // (a war party: its men scattered in open order, the count under them)
        const ink = "#7a2216";
        for (let i = 0; i < 9; i++) { const sx = 32 + Math.sin(i * 2.39 + 1) * 20 + (i % 3 - 1) * 4, sy = 24 + Math.cos(i * 1.71) * 7; c.fillStyle = color; c.strokeStyle = ink; c.lineWidth = 1.4; c.beginPath(); c.moveTo(sx, sy - 5); c.lineTo(sx + 3, sy + 3); c.lineTo(sx - 3, sy + 3); c.closePath(); c.fill(); c.stroke(); }
        c.font = "italic bold 16px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 5; c.strokeText(String(n), 32, 48); c.fillStyle = ink; c.fillText(String(n), 32, 48);
      } else if (kind === "swords") {
        c.lineWidth = 5; c.beginPath(); c.moveTo(14, 14); c.lineTo(50, 50); c.moveTo(50, 14); c.lineTo(14, 50); c.stroke();
        c.lineWidth = 4.5; c.beginPath(); c.moveTo(15, 38); c.lineTo(26, 49); c.moveTo(49, 38); c.lineTo(38, 49); c.stroke();
      } else {
        // (a town's holder: its colours on a staff, as on the map — gold-edged for yours, the other player's dashed)
        c.strokeStyle = "#2a1c10"; c.lineWidth = 3; c.beginPath(); c.moveTo(22, 8); c.lineTo(22, 60); c.stroke();
        c.fillStyle = color; c.beginPath(); c.moveTo(22, 8); c.quadraticCurveTo(36, 4, 52, 10); c.lineTo(52, 30); c.quadraticCurveTo(36, 24, 22, 28); c.closePath(); c.fill();
        if (kind === "dash") c.setLineDash([5, 4]);
        c.strokeStyle = kind === "ring" ? "#b8862a" : "rgba(40,28,16,0.9)"; c.lineWidth = kind === "ring" ? 4 : 2.5; c.stroke(); c.setLineDash([]);
      }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; tex.set(k, t); return t;
    };
    for (const m of list) {
      const [x, z] = toWorld(m.lon, m.lat), y0 = Math.max(0, this.groundY(x, z)), swords = m.kind === "swords", arm = m.kind === "army" || m.kind === "party";
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(m.kind, m.color, !!m.dim, m.n, m.mine), depthTest: false, sizeAttenuation: false, transparent: true }));
      sp.scale.set(arm ? 0.05 : swords ? 0.034 : 0.05, arm ? 0.05 : swords ? 0.034 : 0.05, 1); sp.position.set(x, y0 + (arm ? 0.62 : swords ? 0.5 : 0.42), z); sp.renderOrder = arm ? 7 : swords ? 6 : 4;
      grp.add(sp);
    }
    this.scene.add(grp);
  }
  // the fleets at sea: a ship of the line herself on the water, her pennant in her crown's colours, heading the way
  //  she's bound, and how many ships are with her written beside — drawn the same size however far off the eye is
  //  [{ name, lon, lat, color, n, yaw, mine }]
  fleets(list) {
    const key = JSON.stringify(list); if (key === this.fleetKey && this.fleetModel) return; this.fleetKey = key;
    if (!this.fleetModel) ensureModel("ship").then(ok => { if (ok && !this.fleetModel) { this.fleetModel = true; this.fleetKey = null; this.fleets(list); } });
    if (this.fleetGroup) { this.fleetGroup.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); this.scene.remove(this.fleetGroup); }
    const grp = this.fleetGroup = new THREE.Group();
    for (const f of list) {
      const [x, z] = toWorld(f.lon, f.lat), ship = new THREE.Group(); ship.position.set(x, 0, z); ship.rotation.y = f.yaw || 0; ship.userData.fleet = true;
      const m = modelCopy("ship");
      if (m) { m.scene.position.z = -2.4; m.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; if (o.material && /flag/.test(o.material.name || "")) { o.material = o.material.clone(); o.material.color.set(f.color); } } }); ship.add(m.scene); }
      else { const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 24), new THREE.MeshStandardMaterial({ color: 0x5a3e28 })); hull.position.y = 1; ship.add(hull); }
      const pen = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.6), new THREE.MeshBasicMaterial({ color: f.color, side: THREE.DoubleSide })); pen.geometry.translate(3.5, 0, 0); pen.position.set(0, 25, 2.5); pen.rotation.y = Math.PI / 2; ship.add(pen);
      grp.add(ship);
      const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d"), ink = f.mine ? "#2a1c10" : "#7a2216";
      c.font = "italic bold 22px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 6; c.strokeText(String(f.n), 32, 32); c.fillStyle = ink; c.fillText(String(f.n), 32, 32);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true })); sp.scale.set(0.05, 0.05, 1); sp.renderOrder = 7; sp.userData.over = ship; grp.add(sp);
    }
    this.scene.add(grp);
  }
  // look at a place: lon, lat, and how far off
  look(lon, lat, dist) { const [x, z] = toWorld(lon, lat); this.target.set(x, 0, z); if (dist) this.dist = dist; }
  centreLL() { return toLL(this.target.x, this.target.z); }
  size(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.w = w; this.h = h; }
  frame() {
    sync();
    // (the near plane drawn back as the eye goes up, so the sea and the low coast don't fight over the same depth)
    const nr = Math.max(0.01, this.dist * 0.004); if (Math.abs(this.camera.near - nr) > nr * 0.1) { this.camera.near = nr; this.camera.updateProjectionMatrix(); }
    if (!this.visible || !this.g) return;
    this.buildDetail(); this.treesNear();
    const ty = Math.max(0, this.groundY(this.target.x, this.target.z));
    // from the south, looking north and down; lower and flatter as you come in close
    const pitch = 0.55 + Math.min(1, this.dist / 40) * 0.5;
    this.camera.position.set(this.target.x, ty + Math.sin(pitch) * this.dist, this.target.z + Math.cos(pitch) * this.dist);
    this.camera.lookAt(this.target.x, ty, this.target.z);
    // (the haze stays well back, so the next towns along are in sight even close in)
    this.scene.fog.near = this.dist * 2 + 10; this.scene.fog.far = this.dist * 6 + 60;
    // names: the great ones always; the rest only close in
    for (const s of this.labels) s.visible = this.dist < 14 || s.userData.rank >= (this.dist < 45 ? 2 : 3);
    // (the fleets kept the same size on the view however near or far: a ship's length about a twentieth of its height)
    if (this.fleetGroup) { const k = this.dist * 0.0036; for (const o of this.fleetGroup.children) { if (o.userData.fleet) o.scale.setScalar(k); else if (o.userData.over) o.position.set(o.userData.over.position.x, k * 38, o.userData.over.position.z); } }
    this.renderer.render(this.scene, this.camera);
  }
  // what is under a point on the view: a city's name, or the ground (lon, lat)
  pick(px, py) {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(px / this.w * 2 - 1, -(py / this.h) * 2 + 1);
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.labels.filter(l => l.visible), false);
    if (hits.length && hits[0].object.userData.city) return { city: hits[0].object.userData.city };
    const g = ray.intersectObjects([this.detail, this.base].filter(Boolean), false)[0];
    return g ? { ll: toLL(g.point.x, g.point.z) } : null;
  }
  // drag: move over the ground by pixels
  pan(dx, dy) { sync(); const k = this.dist / (this.h || 600) * 1.1; this.target.x = Math.max(0, Math.min(MAP_W, this.target.x - dx * k)); this.target.z = Math.max(0, Math.min(MAP_H, this.target.z - dy * k * 1.4)); }
  dispose() { this.renderer.dispose(); this.el.remove(); }
}
