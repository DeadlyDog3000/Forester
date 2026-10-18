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
import { ensureModel, modelCopy, mergeRig, makeMusket } from "./models.js";

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
// the snowline: lower in the north, and ragged — higher on one shoulder of a range than the next
const snowAt = (lon, lat) => 3.0 - Math.max(0, lat - 45) * 0.08 + (vnoise(lon * 6, lat * 6, 31) - 0.5) * 0.7;
// what grows there
export function biomeAt(lon, lat, h) {
  // (the edges between them wander, as they do)
  lat += (fbm(lon * 1.7, lat * 1.7, 21) - 0.5) * 1.6; lon += (fbm(lon * 1.7, lat * 1.7, 23) - 0.5) * 1.6;
  // (snow on the peaks, not a sheet over the whole range: the line high and ragged, bare rock in a broad band under it)
  const snowline = snowAt(lon, lat);
  if (h > snowline) return "snow";
  if (h > snowline - 0.6) return "rock";
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
// (what the ground's colour is made of, beside the colour itself: how wooded, how much open ploughland, how far over
//  the snowline, the height, and whether sand may lie at the water's edge — handed on to the drawing as they are, so the
//  edges of a wood, a snowfield or a shore are drawn sharp across a pixel, not smeared between the mesh's corners)
const _t = [0, 0, 0, 0, 0];
// the woods' noise: in the ground's own units, and hashed in whole 32-bit numbers so the drawing works it out exactly as
// this does — the trees stand on the forest floor it darkens, however far off the view, at whatever grain the mesh is
const ihash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function inoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = ihash(xi, yi, s), b = ihash(xi + 1, yi, s), c = ihash(xi, yi + 1, s), d = ihash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const WOOD_F = 1.15;
// (and over it a broader swell: whole countries well wooded, others mostly fields, not the same mottle everywhere)
export function woodAt(x, z) { let v = (inoise(x * 0.16, z * 0.16, 7) - 0.5) * 0.4, a = 0.5, f = WOOD_F; for (let i = 0; i < 4; i++) { v += a * inoise(x * f, z * f, 13 + i * 17); a *= 0.5; f *= 2.03; } return v; }
// the old tilled lowlands, long since cleared — the Low Countries, the Paris basin, the Po, England's south and east,
// Saxony, the Danish isles: the woods thinned there to copses (lon, lat, how far, in degrees)
const TILLED = [[4.6, 51.9, 1.9], [2.5, 49.1, 2.3], [0.2, 52.2, 2.3], [-1.6, 51.0, 1.4], [9.9, 45.2, 1.6], [12.0, 51.3, 1.4], [10.3, 55.6, 1.4], [7.0, 51.5, 1.0], [11.4, 44.6, 0.9]];
const WOOD_CUT = 0.26;
export function tilledAt(lon, lat) { let t = 0; for (const [x, y, r] of TILLED) { const d = Math.hypot((lon - x) * K, lat - y) / r; if (d < 1) t = Math.max(t, 1 - d * d); } return t; }
function groundColour(lon, lat, h, out, x, z) {
  const b = biomeAt(lon, lat, h);
  out.setHex(BIOME_COL[b]);
  const green = b === "temperate" || b === "taiga" || b === "med";
  const till = tilledAt(lon, lat), wood = green ? woodAt(x, z) - till * WOOD_CUT : 0;
  _t[0] = green ? 1 - till * WOOD_CUT / 0.6 : 0;
  // (the open country: fields wherever it's tilled land and not the woods)
  _t[1] = (b === "temperate" || b === "med" || b === "steppe" && lon > -45) ? (1 - Math.min(1, Math.max(0, (wood - 0.38) * 8))) * (b === "steppe" ? 0.45 : 1) : 0;
  _t[2] = b === "desert" ? -1 : Math.max(-1, Math.min(1, h - (snowAt(lon, lat) - 0.12)));
  _t[3] = h;
  _t[4] = b === "snow" || b === "rock" ? 0 : 1;
  out.offsetHSL(0, 0, (vnoise(lon * 40, lat * 40, 2) - 0.5) * 0.03);
  return out;
}
// the ground's drawing: the standard material, and over its colour the detail no mesh could carry — the woods' dark
// with a canopy's dapple, the patchwork of fields with hedges between, sand at the shore, the sea floor going deep, the
// snowline ragged; and a grain over all of it, the finer grains faded out as they'd shimmer far off
const GROUND_VS = `
attribute vec4 aT; attribute float aB;
varying vec4 vT; varying float vB; varying vec3 vWP;`;
const GROUND_FS = `
varying vec4 vT; varying float vB; varying vec3 vWP;
float ih(ivec2 c, int s) { uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u + uint(s) * 1442695041u; h = (h ^ (h >> 13)) * 1274126177u; return float(h ^ (h >> 16)) / 4294967296.0; }
float inz(vec2 p, int s) { vec2 i = floor(p), f = p - i; f = f * f * (3.0 - 2.0 * f); ivec2 c = ivec2(i);
  float a = ih(c, s), b = ih(c + ivec2(1, 0), s), d = ih(c + ivec2(0, 1), s), e = ih(c + ivec2(1, 1), s);
  return a + (b - a) * f.x + (d - a) * f.y + (a - b - d + e) * f.x * f.y; }
float woodN(vec2 p) { float v = (inz(p * 0.16, 7) - 0.5) * 0.4, a = 0.5, f = ${WOOD_F.toFixed(3)}; for (int i = 0; i < 4; i++) { v += a * inz(p * f, 13 + i * 17); a *= 0.5; f *= 2.03; } return v; }
float gh(vec2 p) { p = mod(p, 512.0); vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`;
const GROUND_MIX = `
{
  vec2 wp = vWP.xz; float px = length(fwidth(wp));                 // the ground a pixel covers
  float fine = 1.0 - smoothstep(0.004, 0.011, px), mid = 1.0 - smoothstep(0.011, 0.03, px), far = 1.0 - smoothstep(0.03, 0.09, px);
  float n1 = gn(wp * 3.0) * 0.5 + gn(wp * 7.3) * 0.3 + gn(wp * 17.0) * 0.2;
  float n2 = mix(0.5, gn(wp * 41.0) * 0.6 + gn(wp * 97.0) * 0.4, fine);
  vec3 col = diffuseColor.rgb;
  // the fields: parcels and strips, their edges wandering, each its own crop; hedges dark between them
  vec2 fw = wp + (vec2(gn(wp * 2.3), gn(wp * 2.3 + 9.0)) - 0.5) * 0.22;
  vec2 fu = vec2(dot(fw, vec2(17.0, 3.6)), dot(fw, vec2(-2.8, 11.0)));
  float cell = gh(floor(fu) + 17.0);
  vec3 crop = cell < 0.24 ? vec3(0.82, 0.68, 0.30) : cell < 0.42 ? vec3(0.44, 0.60, 0.24) : cell < 0.6 ? vec3(0.55, 0.67, 0.32) : cell < 0.72 ? vec3(0.72, 0.62, 0.34) : cell < 0.86 ? vec3(0.54, 0.42, 0.27) : vec3(0.40, 0.31, 0.22);
  crop *= 0.93 + 0.14 * gh(floor(fu) + 3.0);
  crop = mix(vec3(0.60, 0.58, 0.31), crop, mid);
  vec2 fe = min(fract(fu), 1.0 - fract(fu)); float hedge = (1.0 - smoothstep(0.0, 0.05, min(fe.x, fe.y * 1.5))) * fine;
  float wood = woodN(wp) - (1.0 - vT.x) * 0.6;
  float open = vT.y * (1.0 - clamp((wood - 0.38) * 8.0, 0.0, 1.0)) * (0.75 + 0.25 * smoothstep(0.3, 0.6, n1));
  col = mix(col, mix(crop, vec3(0.30, 0.38, 0.20), hedge * 0.6), open * 0.72);
  // the woods: dark where the trees stand, the edge crisp and a little ragged; a canopy's dapple close in
  float w = smoothstep(0.5, 0.515, wood + (n1 - 0.5) * 0.02);
  float crown = mix(0.5, mix(gn(wp * 13.0), gn(wp * 13.0) * 0.55 + gn(wp * 31.0) * 0.45, mid), far);
  col = mix(col, col * vec3(0.5, 0.62, 0.55) * (0.78 + 0.3 * crown + 0.2 * (n2 - 0.5)), w * 0.8);
  // sand at the water's edge, and the sea floor under the shallows going dark as it deepens
  float h = vT.w + (n1 - 0.5) * 0.012;
  col = mix(col, vec3(0.77, 0.72, 0.56) * (0.92 + 0.16 * n2), (1.0 - smoothstep(0.035, 0.06, h)) * vB);
  vec3 floor0 = mix(vec3(0.58, 0.63, 0.52), vec3(0.13, 0.25, 0.30), clamp((-vT.w - 0.028) / 0.07, 0.0, 1.0));
  col = mix(col, floor0, smoothstep(0.004, -0.004, vT.w));
  // the snow, its line ragged and sharp; the rock under it streaked
  float sn = smoothstep(0.0, 0.08, vT.z + (n1 - 0.5) * 0.22);
  col = mix(col, vec3(0.93, 0.95, 0.97) * (0.94 + 0.08 * n2), sn);
  // and a grain over all of it
  col *= 0.9 + 0.2 * mix(0.5, n1, 0.7) + (n2 - 0.5) * 0.12;
  diffuseColor.rgb = col;
}`;
function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>" + GROUND_VS)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vT = aT; vB = aB; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>" + GROUND_FS)
      .replace("#include <color_fragment>", "#include <color_fragment>" + GROUND_MIX);
  };
  m.customProgramCacheKey = () => "ground6";
  return m;
}
const EXAG = 10 / 111 * U;
// a town's people when nobody's counting (the campaign's own reckoning of a town of its rank, as it starts)
const POP0 = [0, 8000, 24000, 70000];
const popEst = (name, rank) => { let h = 7; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return Math.round(POP0[rank] * (0.7 + (h % 600) / 1000) / 100) * 100; };
// how far a town spreads, by its rank (in units: a degree of latitude is ten)
const TOWN_R = { 1: 0.15, 2: 0.24, 3: 0.36 };
// a gable roof: unit wide, high and long, the ridge running along z, sitting on y = 0
function gable() {
  const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]);
  const n = g.toNonIndexed(); n.computeVertexNormals(); return n;
}                                  // km to units, ten times over

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
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 1.6, MAP_H * 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3e6f86, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.72, depthWrite: false }));
    // (see-through enough that the sandy shallows along a coast show under it, the deeps dark)
    sea.renderOrder = 1;
    sea.position.set(MAP_W / 2, 0, MAP_H / 2); this.scene.add(sea);
    // (and the deep under it, past the edges of the land, so the sky doesn't show through the water there)
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 1.6, MAP_H * 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d3540 }));
    deep.position.set(MAP_W / 2, -0.4, MAP_H / 2); this.scene.add(deep);
    this.kinds = treeKinds();
    this.cells = new Map();          // patches of trees, by cell key
    this.target = new THREE.Vector3(); this.dist = 30;
    this.visible = false;
  }
  // the political map changed (a conquest) or first shown: rebuild what depends on it
  // (walls: a campaign's walled towns, { name: level } — a ring of stone round each)
  // (pops: a campaign's towns' people, { name: count } — a town as big as it has people to fill it)
  setMap(E, homePop = 2, homeName = "Forester's Clearing", walls = null, pops = null) {
    sync();
    const wk = walls ? Object.keys(walls).filter(n => walls[n] > 0).sort().map(n => n + walls[n]).join() : "";
    // (rebuilt when a town has grown or shrunk by a quarter or so, not at every head counted)
    let pk = 0; if (pops) for (const n in pops) pk = (pk * 31 + Math.round(Math.log2(Math.max(1, pops[n])) * 4) + n.length) >>> 0;
    const cq = E.conq, last = cq.length ? cq[cq.length - 1] : null, key = SHEET + (E.rev | 0) + ":" + cq.length + ":" + (last ? last.c + "," + last.r + last.to : "") + "|" + homeName + "|" + wk + "|" + pk;
    const g = buildGrid(E);
    if (this.g && this.mapKey === key) return;
    this.g = g; this.mapKey = key; this.E = E; this.homeName = homeName; this.walls = walls || {}; this.pops = pops;
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
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), at = new Float32Array(p.count * 4), ab = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), [lon, lat] = toLL(x, z), h = heightAt(this.g, lon, lat);
      let y = Math.max(-0.16, h * EXAG) + dy;
      // a patch's rim eases down onto the coarse ground under it, so no cliff shows where one ends
      if (edge) { const d = Math.min(x - edge.x0, edge.x1 - x, z - edge.z0, edge.z1 - z), t = Math.max(0, Math.min(1, d / edge.band)), b = this.baseY(x, z) + 0.01; y = b + (y - b) * t * t * (3 - 2 * t); }
      p.setY(i, y);
      groundColour(lon, lat, h, _c, x, z); col.set([_c.r, _c.g, _c.b], i * 3);
      // (round a town the woods give way to its fields)
      const tn = this.townNear(x, z); if (tn > 0) { _t[0] *= 1 - tn; if (_t[4]) _t[1] = Math.max(_t[1], tn); }
      at.set([_t[0], _t[1], _t[2], _t[3]], i * 4); ab[i] = _t[4];
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setAttribute("aT", new THREE.BufferAttribute(at, 4)); geo.setAttribute("aB", new THREE.BufferAttribute(ab, 1)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.groundMat || (this.groundMat = groundMaterial()));
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
  // the trodden earth of a town's streets and yards: a disc laid over the ground, fading out at its rim
  townGround(x, z, R, out, rings = 5, seg = 28, a0 = 0.7) {
    const n0 = out.pos.length / 3;
    for (let i = 0; i <= rings; i++) for (let k = 0; k < (i ? seg : 1); k++) {
      const d = R * i / rings * (i === rings ? 1 : 1 + (hash(i, k, 5) - 0.5) * 0.12), a = k / seg * 6.283, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      out.pos.push(px, this.groundY(px, pz) + 0.003, pz);
      const t = i / rings; out.col.push(0.50, 0.44, 0.35, a0 * (1 - t * t * t));
    }
    for (let k = 0; k < seg; k++) out.idx.push(n0, n0 + 1 + (k + 1) % seg, n0 + 1 + k);
    for (let i = 1; i < rings; i++) for (let k = 0; k < seg; k++) {
      const a = n0 + 1 + (i - 1) * seg + k, b = n0 + 1 + (i - 1) * seg + (k + 1) % seg, c = a + seg, d = b + seg;
      out.idx.push(a, b, c, b, d, c);
    }
  }
  // ground kept clear of trees (a town's, its fields close round it): circles, filed by the unit square they touch
  clear(x, z, r) {
    for (let gx = Math.floor(x - r); gx <= Math.floor(x + r); gx++) for (let gz = Math.floor(z - r); gz <= Math.floor(z + r); gz++) { const k = gx + "," + gz; (this.clearings.get(k) || this.clearings.set(k, []).get(k)).push([x, z, r]); }
  }
  cleared(x, z) { const L = this.clearings && this.clearings.get(Math.floor(x) + "," + Math.floor(z)); return !!L && L.some(([cx, cz, cr]) => (x - cx) * (x - cx) + (z - cz) * (z - cz) < cr * cr); }
  // how near a town a point is, for its fields: 1 close round it, falling to nought a few of its widths out
  townNear(x, z) {
    if (!this.townSpots || this.townSheet !== SHEET) {
      this.townSheet = SHEET; this.townSpots = new Map();
      for (const ct of CITIES) { const [tx, tz] = toWorld(ct[1], ct[2]), k = Math.floor(tx / 4) + "," + Math.floor(tz / 4); (this.townSpots.get(k) || this.townSpots.set(k, []).get(k)).push([tx, tz, TOWN_R[ct[3]] || 0.2]); }
    }
    let best = 0; const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const L = this.townSpots.get((bx + i) + "," + (bz + j)); if (!L) continue;
      for (const [tx, tz, R] of L) { const d = Math.hypot(x - tx, z - tz), t = 1 - (d - R * 1.2) / (R * 2.2); if (t > best) best = Math.min(1, t); }
    }
    return best;
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
        const wood = woodAt(x, z) - tilledAt(lon, lat) * WOOD_CUT;
        if (wood < (kind === "bush" || kind === "palm" ? 0.45 : 0.52) || r() > 0.85) continue;
        const h = heightAt(this.g, lon, lat); if (h < 0.03 || biomeAt(lon, lat, h) === "snow") continue;
        // (no wood growing in a town, nor in the fields close round it)
        if (this.cleared(x, z)) continue;
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
  // borders: a red-brown band laid on the ground where one crown's land meets another's — the grid's square steps
  // traced into lines and smoothed, so a border runs as a border does, not as a staircase a pixel wide
  buildBorders() {
    if (this.borders) { this.scene.remove(this.borders); this.borders.geometry.dispose(); }
    const g = this.g, adj = new Map(), key = (c, r) => r * (GW + 2) + c;
    const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const id = g[r][c]; if (!id || !NATIONS[id]) continue;
      const e = g[r][c + 1], s2 = g[r + 1] && g[r + 1][c];
      if (e && e !== id && NATIONS[e]) link(key(c + 1, r), key(c + 1, r + 1));
      if (s2 && s2 !== id && NATIONS[s2]) link(key(c, r + 1), key(c + 1, r + 1));
    }
    // (walked into lines: from each end or fork, and then round whatever loops are left)
    const used = new Set(), ek = (a, b) => a < b ? a + "|" + b : b + "|" + a, lines = [];
    const walk = (start, next) => { const L = [start]; let prev = start, cur = next; used.add(ek(start, next));
      for (;;) { L.push(cur); const nb = adj.get(cur); if (nb.length !== 2) break; const nx = nb[0] === prev ? nb[1] : nb[0]; if (used.has(ek(cur, nx))) break; used.add(ek(cur, nx)); prev = cur; cur = nx; }
      return L; };
    for (const [v, nb] of adj) if (nb.length !== 2) for (const n of nb) if (!used.has(ek(v, n))) lines.push(walk(v, n));
    for (const [v, nb] of adj) for (const n of nb) if (!used.has(ek(v, n))) lines.push(walk(v, n));
    // (smoothed: the corners cut, twice over — the ends kept where they are, where lines meet)
    const W = GW + 2, pts = [], idx = [], HW = 0.03;
    for (const L of lines) {
      let P = L.map(k => [(k % W) * CELL, Math.floor(k / W) * CELL]);
      const closed = L.length > 3 && L[0] === L[L.length - 1];
      for (let it = 0; it < 3; it++) {
        const Q = closed ? [] : [P[0]];
        for (let i = 0; i < P.length - 1; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1]; Q.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]); }
        if (closed) Q.push(Q[0]); else Q.push(P[P.length - 1]);
        P = Q;
      }
      // (a ribbon along it, flat on the ground and a little over it)
      for (let i = 0; i < P.length; i++) {
        const [x, z] = P[i], [xa, za] = P[Math.max(0, i - 1)], [xb, zb] = P[Math.min(P.length - 1, i + 1)];
        let dx = xb - xa, dz = zb - za; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const y = Math.max(0.005, this.groundY(x, z)) + 0.025, n = pts.length / 3;
        pts.push(x - dz * HW, y, z + dx * HW, x + dz * HW, y, z - dx * HW);
        if (i) idx.push(n - 2, n - 1, n, n - 1, n + 1, n);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex(idx);
    this.borders = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a2416, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.borders.renderOrder = 2;
    this.scene.add(this.borders);
  }
  // the cities: houses and a church on the ground, and the name, in the colour of whoever holds it
  buildCities(homePop) {
    if (this.cityGroup) { this.scene.remove(this.cityGroup); this.cityGroup.traverse(o => { if (o.isInstancedMesh) { o.dispose(); o.geometry.dispose(); o.material.dispose(); } if (o.isTownGround) { o.geometry.dispose(); o.material.dispose(); } if (o.isSprite) { o.material.map && o.material.map.dispose(); o.material.dispose(); } }); }
    const grp = this.cityGroup = new THREE.Group();
    // (the thousands of houses, roofs, walls and stakes: one instanced draw for each kind, not a mesh apiece — the
    //  scene's thousands of objects were most of a frame's work)
    const kinds = new Map(), put = (m, col) => { m.updateMatrix(); const k = m.geometry.uuid + m.material.uuid; let b = kinds.get(k); if (!b) kinds.set(k, b = { geo: m.geometry, mat: m.material, mats: [], cols: [] }); b.mats.push(m.matrix.clone()); b.cols.push(col ?? 0xffffff); };
    // (a house a unit box, sized each its own; its roof a gable, the ridge along its length, the eaves a little over the walls)
    const house = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roof = gable();
    const plaster = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), roofing = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const WALLS = [0xe8dfca, 0xe2d6bc, 0xd9cdb4, 0xcfc4ae, 0xb8ab94, 0xeae4d6], TILES = [0xa64a30, 0x9a3f2a, 0xb05a38, 0x8c4430, 0x7e5a44], SLATES = [0x55605e, 0x4a5452, 0x646a66], THATCH = [0x9c8455, 0x8a7448];
    // (the woods' nations' towns: a longhouse, round-roofed, and the stakes of a palisade)
    const longGeo = new THREE.CapsuleGeometry(0.014, 0.05, 3, 6).rotateZ(Math.PI / 2).scale(1, 1.2, 1).translate(0, 0.012, 0), barkMat = new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 0.95 });
    const stakeGeo = new THREE.CylinderGeometry(0.003, 0.004, 0.036, 4), stakeMat = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.9 });
    const wall = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.9 }), tile = new THREE.MeshStandardMaterial({ color: 0xa04a30, roughness: 0.8 }), stone = new THREE.MeshStandardMaterial({ color: 0xb8b0a0 });
    const curtain = new THREE.BoxGeometry(1, 0.022, 0.009).translate(0, 0.011, 0), bastion = new THREE.CylinderGeometry(0.012, 0.016, 0.026, 4).translate(0, 0.013, 0), masonry = new THREE.MeshStandardMaterial({ color: 0x9c9384, roughness: 0.95 });
    const towerGeo = new THREE.BoxGeometry(0.036, 1, 0.036), spireGeo = new THREE.ConeGeometry(0.028, 0.1, 4), slate = new THREE.MeshStandardMaterial({ color: 0x4a5a58 });
    this.labels = [];
    this.clearings = new Map(); const groundBits = { pos: [], col: [], idx: [] };
    const place = (name, lon, lat, rank, own, isHome) => {
      let [x, z] = toWorld(lon, lat); const r = rng(Math.round(lon * 100 + lat * 7));
      // (a port whose spot falls on the water at this map's grain — an inlet, a river mouth: the nearest dry ground
      //  round it, so the town stands on its shore, not out in the bay)
      if (this.groundY(x, z) < 0.02) { found: for (let d = 0.04; d <= 0.8; d += 0.04) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, nx = x + Math.cos(a) * d, nz = z + Math.sin(a) * d; if (this.groundY(nx, nz) >= 0.02) { x = nx; z = nz; break found; } } }
      const y0 = this.groundY(x, z);
      if (y0 < -0.1) return;
      // (its people: the campaign's count, or what a town of its rank would have — and the houses as many as house them)
      const pop = isHome ? 0 : (this.pops && this.pops[name]) || popEst(name, rank);
      const NH = isHome ? 5 : Math.max(14, Math.min(700, Math.round(pop / 170)));
      // (the old town, inside its walls if it has them: about half the houses, packed close)
      const spread = isHome ? 0.07 : 0.03 + 0.016 * Math.sqrt(NH);
      // (a town of the woods' nations: longhouses of bark inside a ring of palisade, no church)
      const woods = own && NATIONS[own] && NATIONS[own].nw;
      if (woods) {
        const R = (0.16 + rank * 0.04) * Math.max(0.8, Math.min(1.4, Math.sqrt(pop / popEst(name, rank))));
        this.clear(x, z, R + 0.06);
        for (let i = 0; i < 6 + rank * 5; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * R * 0.8, hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d, hy = this.groundY(hx, hz); const lh = new THREE.Mesh(longGeo, barkMat); lh.position.set(hx, hy, hz); lh.rotation.y = r() * 3; lh.scale.setScalar(1.25); put(lh); }
        const N = 40 + rank * 14; for (let i = 0; i < N; i++) { const a = i / N * 6.28, sx = x + Math.cos(a) * R, sz = z + Math.sin(a) * R; if (Math.abs(Math.sin(a)) < 0.06 && Math.cos(a) > 0) continue; const st = new THREE.Mesh(stakeGeo, stakeMat); st.position.set(sx, this.groundY(sx, sz) + 0.018, sz); st.scale.setScalar(1.2); put(st); }
      } else {
        // the town laid out as a town grows: a market square, the old town's streets packed round it — and out past
        // it the roads, a few, in no set directions, the houses strung along them, the longest where it grew most;
        // each road bending round water and steep ground, and stopping where it can't go on
        const north = lat > 52 || lon < -45, south = lat < 44, R = spread, S = isHome ? 2 : 4 + rank, a0 = r() * 6.28;
        const sq = R * 0.13, slots = [], ok = (px, pz, py) => py >= 0.025;
        const lot = (hx, hz, ang, score, nx = 0, nz = 0, t = 1) => slots.push([hx, hz, ang, score, nx, nz, t]);
        for (let k = 0; k < S; k++) {
          const a = a0 + k / S * 6.283 + (r() - 0.5) * 0.4, len = R * (0.85 + r() * 0.25), ca = Math.cos(a), sa = Math.sin(a);
          for (let d = sq + 0.02; d < len; d += 0.034 + d * 0.03) for (const side of [-1, 1]) {
            const off = 0.013 + r() * 0.004;
            lot(x + ca * d - sa * off * side, z + sa * d + ca * off * side, -a, d * 0.8, -sa * side, ca * side, d / R);
          }
        }
        for (const f of NH > 60 ? [0.42, 0.72] : !isHome ? [0.55] : []) {
          const rr = R * f, N = Math.round(6.283 * rr / 0.034);
          for (let i = 0; i < N; i++) for (const side of [-1, 1]) { const a = i / N * 6.283 + r() * 0.05, d = rr + side * 0.013, ca = Math.cos(a), sa = Math.sin(a); lot(x + ca * d, z + sa * d, -a + Math.PI / 2, d * 0.8 + r() * 0.02, ca * side, sa * side, d / R); }
        }
        for (let i = 0; i < (isHome ? 0 : NH * 0.4); i++) { const a = r() * 6.283, d = sq + 0.03 + Math.sqrt(r()) * R * 0.8; lot(x + Math.cos(a) * d, z + Math.sin(a) * d, -a + (r() < 0.5 ? 0 : Math.PI / 2), d * 0.85 + r() * 0.03, 0, 0, d / R); }
        // (the roads out, and the houses along them)
        const arms = isHome ? 0 : 2 + ((r() * 3) | 0) + (NH > 250 ? 1 : 0), STEP = 0.034;
        for (let k = 0; k < arms; k++) {
          let a = r() * 6.283, px = x + Math.cos(a) * R * 0.9, pz = z + Math.sin(a) * R * 0.9, py = this.groundY(px, pz), along = 0;
          const pull = 0.35 + r() * r() * 1.6, len = R * (1.2 + pull * 2.6);
          if (!ok(px, pz, py)) continue;
          while (along < len) {
            // (on, a little this way or that; round the water or a steep side if it must — or no further)
            let moved = false;
            for (const turn of [0, 0.45, -0.45, 0.9, -0.9]) {
              const b = a + turn + (r() - 0.5) * 0.5, qx = px + Math.cos(b) * STEP, qz = pz + Math.sin(b) * STEP, qy = this.groundY(qx, qz);
              if (!ok(qx, qz, qy) || Math.abs(qy - py) / STEP > 0.55) continue;
              a = b; px = qx; pz = qz; py = qy; moved = true; break;
            }
            if (!moved) break;
            along += STEP;
            const ca = Math.cos(a), sa = Math.sin(a), score = (R * 0.9 + along / pull) * (0.9 + r() * 0.2);
            for (const side of [-1, 1]) {
              if (r() < 0.9 - along / len * 0.45) lot(px - sa * 0.015 * side, pz + ca * 0.015 * side, -a, score, -sa * side, ca * side, 1 + along / len);
              // (and close in, a row behind, and another: the suburb broad where it meets the old town, a thread at its far end)
              for (const [off, f] of [[0.062, 0.6], [0.11, 0.3]]) if (r() < 1 - along / (len * f)) lot(px - sa * off * side, pz + ca * off * side, -a, score + off, -sa * side, ca * side, 1 + along / len);
            }
            // (a lane off it, now and then)
            if (r() < 0.08) { const b = a + (r() < 0.5 ? 1.57 : -1.57), cb = Math.cos(b), sb = Math.sin(b); for (let d = 0.04; d < 0.04 + r() * 0.12; d += STEP) for (const side of [-1, 1]) lot(px + cb * d - sb * 0.015 * side, pz + sb * d + cb * 0.015 * side, -b, score + d * 2, -sb * side, cb * side, 1.2); }
          }
        }
        slots.sort((p, q) => p[3] - q[3]);
        const kept = [];
        for (let [hx, hz, ang, , nx, nz, t] of slots) {
          if (kept.length >= NH) break;
          if (kept.some(([kx, kz]) => (kx - hx) * (kx - hx) + (kz - hz) * (kz - hz) < 0.00045)) continue;
          const core = Math.max(0, 1 - t * 1.4), w = 0.022 + r() * 0.008, l = 0.03 + r() * 0.016 + core * 0.01;
          hx += nx * l / 2; hz += nz * l / 2; const hy = this.groundY(hx, hz);
          // (no house in the water, nor hung on a cliff)
          if (!ok(hx, hz, hy) || Math.abs(hy - this.groundY(hx + nx * 0.03, hz + nz * 0.03)) > 0.02) continue;
          kept.push([hx, hz]);
          const ht = 0.018 + core * (0.016 + r() * 0.012) + r() * 0.005;
          const hm = new THREE.Mesh(house, plaster); hm.position.set(hx, hy - 0.004, hz); hm.rotation.y = ang; hm.scale.set(w, ht + 0.004, l);
          put(hm, WALLS[(r() * WALLS.length) | 0]);
          const pal = north ? (r() < 0.55 ? SLATES : TILES) : t > 0.9 && r() < 0.35 ? THATCH : TILES;
          const rm = new THREE.Mesh(roof, roofing); rm.position.set(hx, hy + ht, hz); rm.rotation.y = ang; rm.scale.set(w * 1.18, (south ? 0.45 : 0.75) * w, l * 1.08);
          put(rm, pal[(r() * pal.length) | 0]);
                    // (out past the old town, a yard's trodden ground round each house)
          if (Math.hypot(hx - x, hz - z) > R) { this.clear(hx, hz, 0.09); this.townGround(hx, hz, 0.05, groundBits, 1, 8, 0.45); }
        }
        this.clear(x, z, R * 1.15 + 0.04);
        // the trodden ground of the streets and yards under it all
        this.townGround(x, z, R * 1.1, groundBits);
      }
      // (a walled town: a ring of stone round it, its bastions at the angles — more of them, and further out, for a
      //  fortress of the new kind)
      const wl = !woods && this.walls[name] | 0;
      if (wl) {
        const R = spread + 0.035, N = 28 + rank * 6, seg = 2 * Math.PI * R / N * 1.08;
        for (let i = 0; i < N; i++) {
          const a = (i + 0.5) / N * 6.283; if (Math.abs(Math.sin(a)) < 0.05 && Math.cos(a) > 0) continue;
          const sx = x + Math.cos(a) * R, sz = z + Math.sin(a) * R, m = new THREE.Mesh(curtain, masonry);
          m.scale.x = seg; m.position.set(sx, this.groundY(sx, sz) - 0.004, sz); m.rotation.y = -a - Math.PI / 2; put(m);
        }
        const B = wl >= 2 ? 8 : 6;
        for (let i = 0; i < B; i++) { const a = i / B * 6.283 + 0.3, bx = x + Math.cos(a) * (R + (wl >= 2 ? 0.012 : 0.004)), bz = z + Math.sin(a) * (R + (wl >= 2 ? 0.012 : 0.004)), m = new THREE.Mesh(bastion, masonry); m.position.set(bx, this.groundY(bx, bz) - 0.004, bz); m.rotation.y = -a + Math.PI / 4; if (wl >= 2) m.scale.set(1.4, 1, 1.4); put(m); }
      }
      // a church, or a cathedral
      // (on the square: its nave, long under its roof, and the tower at the west end — a cathedral's twice the size)
      const th = isHome ? 0.06 : 0.07 + rank * 0.025, cs = isHome ? 0.6 : rank === 3 ? 1.5 : rank === 2 ? 1.15 : 0.9;
      if (!woods) {
        const nx0 = x + 0.03 * cs, nv = new THREE.Mesh(house, plaster); nv.position.set(nx0, y0 - 0.004, z); nv.rotation.y = Math.PI / 2; nv.scale.set(0.034 * cs, 0.036 * cs, 0.09 * cs); put(nv, 0xcfc6b2);
        const nr = new THREE.Mesh(roof, roofing); nr.position.set(nx0, y0 + 0.032 * cs, z); nr.rotation.y = Math.PI / 2; nr.scale.set(0.04 * cs, 0.03 * cs, 0.094 * cs); put(nr, 0x56605c);
        const tw = new THREE.Mesh(towerGeo, stone); tw.scale.set(cs * 0.75, th, cs * 0.75); tw.position.set(x - 0.02 * cs, y0 + th / 2, z); put(tw);
        const sp = new THREE.Mesh(spireGeo, slate); sp.scale.setScalar(cs * 0.75); sp.position.set(x - 0.02 * cs, y0 + th + 0.037 * cs, z); put(sp);
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
      sprite.userData = { rank, city: isHome ? null : name, y0 };
      grp.add(sprite); this.labels.push(sprite);
    };
    for (const ct of CITIES) place(ct[0], ct[1], ct[2], ct[3], cityOwner(this.g, ct), false);
    // (your own clearing — not on a campaign's map, which has none)
    if (this.homeName !== null) { const [hlon, hlat] = toLL((HOME.mx + 0.5) * CELL, (HOME.my + 0.5) * CELL); place(this.homeName || "Forester's Clearing", hlon, hlat, 1, null, true); }
    for (const b of kinds.values()) { const im = new THREE.InstancedMesh(b.geo, b.mat, b.mats.length); b.mats.forEach((m, i) => { im.setMatrixAt(i, m); if (b.mat === plaster || b.mat === roofing) im.setColorAt(i, _c.setHex(b.cols[i])); }); im.computeBoundingSphere(); grp.add(im); }
    if (groundBits.pos.length) {
      const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(groundBits.pos, 3)); gg.setAttribute("color", new THREE.Float32BufferAttribute(groundBits.col, 4)); gg.setIndex(groundBits.idx); gg.computeVertexNormals();
      const gm = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      gm.renderOrder = 1; gm.isTownGround = true; grp.add(gm);
    }
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
  // the armies on the land: a company of its own men in its own coats, drawn up in two ranks under its colours —
  //  stepping out on the march, standing at ease when it's halted — kept the same size on the view, as the fleets are.
  //  [{ key, lon, lat, color, n, mine, body, colors, flag (a canvas, or null), march, glon, glat, nw }]
  armies(list) {
    const key = JSON.stringify(list.map(a => ({ ...a, flag: !!a.flag }))); if (key === this.armyKey && this.armyReady) return; this.armyKey = key;
    const bodies = [...new Set(list.map(a => a.body))];
    if (!this.armyReady) Promise.all([...bodies, "musket"].map(b => ensureModel(b))).then(() => { if (!this.armyReady) { this.armyReady = true; this.armyKey = null; this.armies(list); } });
    if (this.armyGroup) { this.armyGroup.traverse(o => { if (o.isSprite || o.userData.own) { o.material.map && o.material.map.dispose(); o.material.dispose(); } if (/^merged_/.test(o.name)) { o.geometry.dispose(); if (o.skeleton) o.skeleton.dispose(); } }); this.scene.remove(this.armyGroup); }
    const grp = this.armyGroup = new THREE.Group(); this.mixers = [];
    for (const A of list) {
      const [x, z] = toWorld(A.lon, A.lat), co = new THREE.Group(); co.position.set(x, 0, z); co.userData.army = true;
      if (A.march && A.glon != null) { const [gx, gz] = toWorld(A.glon, A.glat); co.rotation.y = Math.atan2(gx - x, gz - z); }
      // (its men: two ranks of five, or a war party in open order; each in the coats of its own crown)
      const mats = {}, men = A.nw ? 7 : 10;
      for (let i = 0; i < men; i++) {
        const m = this.armyReady && modelCopy(A.body); if (!m) break;
        m.scene.traverse(o => {
          if (!o.isMesh || !o.material) return; o.castShadow = false; o.frustumCulled = false;
          const part = o.material.userData.part, want = A.colors[part === "beard" || part === "tash" ? "hair" : part]; if (want == null) return;
          if (!mats[part]) {
            const M = mats[part] = o.material.clone(); M.userData = { ...o.material.userData, own: true }; M.color.set(want);
            // (a part painted in its vertices: the colour divided by what's painted, so it's the colour that shows)
            const vc = o.material.vertexColors && o.geometry.attributes.color; if (vc) { let r = 0, g = 0, b = 0; const C = o.geometry.attributes.color, n = C.count; for (let k = 0; k < n; k += 7) { r += C.getX(k); g += C.getY(k); b += C.getZ(k); } const c = Math.ceil(n / 7); M.color.r /= Math.max(0.04, r / c); M.color.g /= Math.max(0.04, g / c); M.color.b /= Math.max(0.04, b / c); }
          }
          o.material = mats[part];
        });
        try { mergeRig(m.scene); } catch (e) {}
        const file = i % 5, rank = Math.floor(i / 5);
        if (A.nw) m.scene.position.set(Math.sin(i * 2.39) * 1.9, 0, Math.cos(i * 1.71) * 1.1);
        else m.scene.position.set((file - 2) * 0.85, 0, -rank * 1.05);
        // (the musket shouldered, upright at his right side)
        if (!A.nw) { const g = makeMusket(); if (g) { g.position.set(-0.24, 0.86, 0.02); g.rotation.x = -0.12; g.traverse(o => { if (o.isMesh) o.castShadow = false; }); m.scene.add(g); } }
        co.add(m.scene);
        const mixer = new THREE.AnimationMixer(m.scene), clip = m.animations.find(a => a.name === (A.march ? "Walk" : "Idle"));
        if (clip) { const act = mixer.clipAction(clip); act.time = (i * 0.37) % clip.duration; act.play(); }
        this.mixers.push(mixer);
      }
      // (its colours, carried at the right of the front rank)
      if (!A.nw) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 3.1, 6), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 })); pole.userData.own = true; pole.position.set(2.55, 1.55, 0.15); co.add(pole);
        const tex = A.flag ? new THREE.CanvasTexture(A.flag) : null; if (tex) tex.colorSpace = THREE.SRGBColorSpace;
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.78), new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : A.color, side: THREE.DoubleSide, roughness: 0.95 })); cloth.userData.own = true;
        cloth.geometry.translate(0.575, 0, 0); cloth.position.set(2.57, 2.7, 0.15); cloth.rotation.y = -0.35; co.add(cloth); co.userData.cloth = cloth;
      }
      grp.add(co);
      // (how many regiments, written over them in italic: in ink for yours, red for an enemy's)
      const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d"), ink = A.mine ? "#2a1c10" : "#7a2216";
      c.font = "italic bold 22px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 6; c.strokeText(String(A.n), 32, 32); c.fillStyle = ink; c.fillText(String(A.n), 32, 32);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true })); sp.scale.set(0.045, 0.045, 1); sp.renderOrder = 7; sp.userData.over = co; grp.add(sp);
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
    // (the names: the great ones always, the rest only close in; and nearer the roofs as it comes down, or they'd float out of the view)
    const lift = Math.min(0.3, 0.07 + this.dist * 0.1);
    for (const s of this.labels) { s.visible = this.dist < 14 || s.userData.rank >= (this.dist < 45 ? 2 : 3); s.position.y = s.userData.y0 + lift; }
    // (the fleets kept the same size on the view however near or far: a ship's length about a twentieth of its height)
    if (this.fleetGroup) { const k = this.dist * 0.0036; for (const o of this.fleetGroup.children) { if (o.userData.fleet) o.scale.setScalar(k); else if (o.userData.over) o.position.set(o.userData.over.position.x, k * 38, o.userData.over.position.z); } }
    // (the armies the same: a man about a fiftieth of the view's height, standing on the ground where he is; and their
    //  steps, their breathing, their colours stirring)
    if (this.armyGroup) {
      const now = performance.now(), dt = Math.min(0.1, (now - (this.armyT || now)) / 1000); this.armyT = now;
      const k = this.dist * 0.022;
      for (const o of this.armyGroup.children) {
        if (o.userData.army) { o.scale.setScalar(k); o.position.y = Math.max(0, this.groundY(o.position.x, o.position.z)); const cl = o.userData.cloth; if (cl) cl.rotation.y = -0.35 + Math.sin(now / 700 + o.position.x) * 0.18; }
        else if (o.userData.over) o.position.set(o.userData.over.position.x, o.userData.over.position.y + k * 3.6, o.userData.over.position.z);
      }
      for (const m of this.mixers || []) m.update(dt);
    }
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
