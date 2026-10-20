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
import { NATIONS, CITIES, RIVERS, LAKES, buildGrid, cityOwner, HOME, GW, GH, BOUNDS, SHEET, PEOPLES, fwd, inv, SEAS } from "./europe.js";
import { hash, vnoise, fbm, RANGES, PLATEAUS, segDist } from "./relief.js";
import { ensureModel, modelCopy, mergeRig, makeMusket } from "./models.js";

const K = Math.cos(49 * Math.PI / 180);
export const U = 10;                                       // units per degree of latitude
// (the sheet's size, from the one in use — Europe's for the story, the world's for a campaign: taken up afresh whenever
//  the land's built or drawn)
let MAP_W = 1, MAP_H = 1, CELL = 1;
// (the companies and the ships kept the same size on the view however near or far: a man about a thirtieth of the view's
//  height, a ship's length about a fifteenth; and a company at a town drawn up clear in front of its houses, this far
//  out on the land and off to the south-east, never among the roofs or under the town's name where it can't be seen)
const ARMY_K = 0.03, FLEET_K = 0.005, TOWN_CLEAR = 0.38;
// (…but only close in: from high over a country they'd be the size of a county, a ship astride London and the coast —
//  so above a ten-unit height they grow more slowly than the view does, and shrink on the view as you go up)
const unitDist = d => d <= 10 ? d : d * Math.pow(10 / d, 0.45);
// a ship's wake: a pale vee of foam opening out astern, fading as it goes
let _wakeTex = null, _wakeGeo = null;
const wakeTex = () => {
  if (_wakeTex) return _wakeTex;
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 128; const c = cv.getContext("2d");
  for (let y = 0; y < 128; y++) {
    const k = y / 127, half = 6 + k * 26, a = (1 - k) * 0.9;
    const g = c.createLinearGradient(32 - half, 0, 32 + half, 0);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.12, `rgba(255,255,255,${a})`); g.addColorStop(0.3, `rgba(255,255,255,${a * 0.25})`);
    g.addColorStop(0.7, `rgba(255,255,255,${a * 0.25})`); g.addColorStop(0.88, `rgba(255,255,255,${a})`); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(32 - half, y, half * 2, 1);
  }
  _wakeTex = new THREE.CanvasTexture(cv); _wakeTex.colorSpace = THREE.SRGBColorSpace; return _wakeTex;
};
let _smokeTex = null;
const smokeTex = () => {
  if (_smokeTex) return _smokeTex;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d"), g = c.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.5, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  _smokeTex = new THREE.CanvasTexture(cv); return _smokeTex;
};
const wakeGeo = () => { if (!_wakeGeo) { _wakeGeo = new THREE.PlaneGeometry(16, 44); _wakeGeo.translate(0, 22, 0); } return _wakeGeo; };
const sync = () => { MAP_W = (BOUNDS.lon1 - BOUNDS.lon0) * K * U; MAP_H = (BOUNDS.lat1 - BOUNDS.lat0) * U; CELL = MAP_W / GW; };
// (the land laid out as the sheet is: in its effective degrees — North America larger, as on the map)
export const toWorld = (lon, lat) => { const [ex, ey] = fwd(lon, lat); return [(ex - BOUNDS.lon0) * K * U, (BOUNDS.lat1 - ey) * U]; };
export const toLL = (x, z) => inv(BOUNDS.lon0 + x / (K * U), BOUNDS.lat1 - z / U);


// ---- the land: which ground is land, from the map's grid, softened into a coast ----
let landGrid = null;
function landAt(g, lon, lat) {
  // bilinear over the grid's land and sea, so the coast is a line and not steps
  const [ex, ey] = fwd(lon, lat);
  return landG(g, (ex - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0) * GW - 0.5, (BOUNDS.lat1 - ey) / (BOUNDS.lat1 - BOUNDS.lat0) * GH - 0.5);
}
function landG(g, gx, gy) {
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  // (off the sheet, the cell at its edge goes on)
  const L = (x, y) => { y = y < 0 ? 0 : y >= GH ? GH - 1 : y; x = x < 0 ? 0 : x >= GW ? GW - 1 : x; return g[y] && g[y][x] ? 1 : 0; };
  return L(x0, y0) * (1 - fx) * (1 - fy) + L(x0 + 1, y0) * fx * (1 - fy) + L(x0, y0 + 1) * (1 - fx) * fy + L(x0 + 1, y0 + 1) * fx * fy;
}
// (each range's reach, a box round it: as far out as it lifts the ground at all)
const RBOX = RANGES.map(([pts, , w]) => { const xs = pts.map(p => p[0] * K), ys = pts.map(p => p[1]), m = w * 3; return [Math.min(...xs) - m, Math.max(...xs) + m, Math.min(...ys) - m, Math.max(...ys) + m]; });
// (the towns: the mountains ease round each, so a town stands on a shelf of gentler ground at the hills' foot and not
//  on the face of a slope — the way towns were built. Binned by degree, so each height asks only the towns near it)
const TBIN = new Map();
for (const ct of CITIES) { const k = Math.floor(ct[1]) * 1000 + Math.floor(ct[2]); (TBIN.get(k) || TBIN.set(k, []).get(k)).push([ct[1] * K, ct[2], 0.07 + ct[3] * 0.025]); }
function townCalm(lon, lat) {
  const px = lon * K, bx = Math.floor(lon), by = Math.floor(lat); let m = 1;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const L = TBIN.get((bx + i) * 1000 + by + j); if (!L) continue;
    for (const [tx, ty, r] of L) { const d = Math.hypot(px - tx, lat - ty); if (d < r * 3.6) { const t = Math.max(0, Math.min(1, d / (r * 3.6))), k = 0.4 + 0.6 * t * t * (3 - 2 * t); if (k < m) m = k; } }
  }
  return m;
}
// (the waters too fine for the map's grid: the Bosporus, the Dardanelles, the Sound, Messina's strait, the Zuiderzee, the lakes — cut through the land as
//  channels, so Constantinople stands on its strait and not on an isthmus) [lon, lat, lon, lat, half-width in degrees]
const STRAITS = [[28.98, 40.99, 29.06, 41.1, 0.009], [29.06, 41.1, 29.13, 41.23, 0.011], [26.15, 40.03, 26.45, 40.2, 0.045], [26.45, 40.2, 26.75, 40.42, 0.045], [12.6, 56.05, 12.72, 55.65, 0.05],
  // (the Firth of Forth running in past Edinburgh, not ending there with a pond beyond)
  [-3.1, 56.03, -3.45, 56.02, 0.035], [-3.45, 56.02, -3.75, 56.06, 0.025],
  // (the New World's: the Chesapeake and the James up to Jamestown; Long Island Sound — drawn by the grid as
  //  strings of ponds)
  [-76.0, 36.95, -76.25, 37.6, 0.06], [-76.25, 37.6, -76.35, 38.3, 0.06], [-76.35, 38.3, -76.4, 39.2, 0.045], [-76.25, 36.98, -76.78, 37.21, 0.025],
  [-73.8, 40.83, -72.9, 41.07, 0.05], [-72.9, 41.07, -72.0, 41.18, 0.06],
  // (and the great lakes the grid hasn't, as the map draws them)
  ...LAKES,
  // (the Strait of Messina, Sicily from Calabria)
  [15.63, 38.32, 15.63, 38.17, 0.02], [15.63, 38.17, 15.6, 37.92, 0.025],
  // (and the Zuiderzee, with the IJ running in from it to Amsterdam)
  [5.0, 53.1, 5.35, 52.62, 0.16], [5.35, 52.62, 5.45, 52.42, 0.11], [5.4, 52.42, 5.1, 52.4, 0.04], [5.1, 52.4, 4.88, 52.385, 0.018]];
// (and the land too fine for it: the Lido and Pellestrina, the long sand bars that close Venice's lagoon from the sea)
const BARS = [[12.24, 45.2, 12.31, 45.33, 0.009], [12.31, 45.34, 12.4, 45.43, 0.01], [12.41, 45.44, 12.55, 45.5, 0.01]];
function barLift(lon, lat) {
  let c = 0;
  for (const [x0, y0, x1, y1, w] of BARS) {
    if (lon < Math.min(x0, x1) - w * 3 || lon > Math.max(x0, x1) + w * 3 || lat < Math.min(y0, y1) - w * 3 || lat > Math.max(y0, y1) + w * 3) continue;
    const d = segDist(lon * K, lat, x0 * K, y0, x1 * K, y1) / w; if (d < 2) c = Math.max(c, d < 1 ? 1 : 2 - d);
  }
  return c;
}
// (and how near one is, out to a few of its widths: the ground sinks toward a lake, so a lake in the hills lies in a basin
//  and not at the foot of a cliff)
let straitNear = 0;
function straitCut(lon, lat) {
  let c = 0; straitNear = 0;
  for (const [x0, y0, x1, y1, w] of STRAITS) {
    if (lon < Math.min(x0, x1) - w * 7 || lon > Math.max(x0, x1) + w * 7 || lat < Math.min(y0, y1) - w * 7 || lat > Math.max(y0, y1) + w * 7) continue;
    // (its shore wandering a little, not the smooth side of a capsule)
    const d = segDist(lon * K, lat, x0 * K, y0, x1 * K, y1) / (w * (0.82 + fbm(lon * 9.1, lat * 9.1, 51, 2) * 0.36)); if (d < 2) c = Math.max(c, d < 1 ? 1 : 2 - d); if (d < 7) straitNear = Math.max(straitNear, 1 - d / 7);
  }
  return c;
}
// (the map's grid draws a river's lower course as a string of single-cell ponds — the Hudson, the St Lawrence above
//  Québec: where such a pond lies on a river's line, it's land again, and the river runs through it unbroken)
const RVBIN = new Map();
for (const rv of RIVERS) for (let i = 1; i < rv.length; i++) {
  const [a, b] = [rv[i - 1], rv[i]];
  for (let x = Math.floor(Math.min(a[0], b[0]) - 0.4); x <= Math.floor(Math.max(a[0], b[0]) + 0.4); x++) for (let y = Math.floor(Math.min(a[1], b[1]) - 0.4); y <= Math.floor(Math.max(a[1], b[1]) + 0.4); y++) { const k = x * 1000 + y; (RVBIN.get(k) || RVBIN.set(k, []).get(k)).push([a[0] * K, a[1], b[0] * K, b[1]]); }
}
// (but not at a river's mouth: an estuary — the Tagus below Lisbon — is the river's own water)
const MOUTHS = RIVERS.map(rv => rv[0]);
const nearRiver = (lon, lat, r) => { if (MOUTHS.some(([x, y]) => Math.abs(x - lon) * K < 0.45 && Math.abs(y - lat) < 0.45)) return false; const L = RVBIN.get(Math.floor(lon) * 1000 + Math.floor(lat)); return !!L && L.some(([x0, y0, x1, y1]) => segDist(lon * K, lat, x0, y0, x1, y1) < r); };
const RING2 = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4 + 0.39) * 2.2, Math.sin(i * Math.PI / 4 + 0.39) * 2.2]);
// ridged noise, 0..1: sharp crests where a smooth noise would be round hills (three octaves, each a little finer)
function ridged(x, y) { let v = 0, a = 0.55, f = 1; for (let i = 0; i < 3; i++) { const n = 1 - Math.abs(vnoise(x * f, y * f, 61 + i * 7) * 2 - 1); v += a * n * Math.sqrt(n); a *= 0.5; f *= 2.1; } return v / 0.9625; }
// height in km (below 0: sea)
const RING = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * 1.6, Math.sin(i * Math.PI / 4) * 1.6]);
export function heightAt(g, lon, lat) {
  const [ex, ey] = fwd(lon, lat), gx = (ex - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0) * GW - 0.5, gy = (BOUNDS.lat1 - ey) / (BOUNDS.lat1 - BOUNDS.lat0) * GH - 0.5;
  const l0 = landG(g, gx, gy), cut = straitCut(lon, lat); let bar = 0, land = l0 + (fbm(lon * 3.1, lat * 3.1, 7) - 0.5) * 0.45 - cut * 1.2 + (bar = barLift(lon, lat)) * 0.9;
  // (and along the coast a finer wander, so an island isn't an octagon cut round one cell of the grid, nor a headland its
  //  stairs: only where it's coast at all)
  if (l0 > 0.001 && l0 < 0.999) land += (fbm(lon * 8.3, lat * 8.3, 43, 2) - 0.5) * 2.4 * l0 * (1 - l0);
  if (land < 0.62 && l0 < 0.999 && !cut && nearRiver(lon, lat, 0.3)) { let w = 0; for (const [ox, oy] of RING2) w += landG(g, gx + ox, gy + oy); w /= 8; if (w > 0.78) land = Math.max(land, 0.72 + (w - 0.78) * 0.5); }
  if (land < 0.5) return -0.18 + land * 0.3;
  // (the land comes down to the water gently: everything is eased toward nought at the shore)
  const shore = Math.min(1, (land - 0.5) / 0.3), ease = shore * shore * (3 - 2 * shore);
  let h = 0.02 + ease * (0.04 + fbm(lon * 1.3, lat * 1.3, 3) * 0.28);
  // (the mountains rise from a coast more gently than the lowland does — a hillside behind a port, not a wall over it)
  //  (reckoned over the land round about, not just here: so the slope follows the lie of the coast, not the map grid's
  //  steps along it)
  let rise = -1;
  const px = lon * K;
  for (let ri = 0; ri < RANGES.length; ri++) {
    // (a range is reckoned with only where it could reach: outside its box, it adds nothing)
    const bb = RBOX[ri]; if (px < bb[0] || px > bb[1] || lat < bb[2] || lat > bb[3]) continue;
    if (rise < 0) { let w = l0; for (const [ox, oy] of RING) w += landG(g, gx + ox, gy + oy); w /= 9; const a = Math.max(0, Math.min(1, (land - 0.5) / 0.35)), b = Math.max(0, Math.min(1, (w - 0.45) / 0.5)), t = a * b; rise = t * t * (3 - 2 * t) * townCalm(lon, lat); }
    const [pts, km, w] = RANGES[ri];
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(lon * K, lat, pts[i - 1][0] * K, pts[i - 1][1], pts[i][0] * K, pts[i][1]));
    // (and over the broad swell of a range, ridges and the valleys between: sharp crests, where the rock shows on the
    //  sides and the snow keeps to the heights, not one smooth white back from end to end)
    if (d < w * 3) { const gk = rise * km * Math.exp(-(d * d) / (2 * w * w)); h += gk * (0.6 + fbm(lon * 4, lat * 4, 11) * 0.7) + (gk > 0.25 ? gk * (ridged(lon * K * 6.5, lat * 4.3) - 0.45) * 0.24 : 0); }
  }
  for (const [x0, y0, x1, y1, km] of PLATEAUS) {
    const ex = Math.min(lon - x0, x1 - lon), ey = Math.min(lat - y0, y1 - lat);
    if (ex > 0 && ey > 0) h += ease * km * Math.min(1, Math.min(ex, ey) / 0.8);
  }
  // (a sand bar lies low: a few feet over the sea, whatever the country behind it does)
  if (bar > 0) h = Math.min(h, 0.012 + (1 - bar) * h);
  // (sunk toward the lake, but kept a little over it: dry ground still, where trees grow and a road can run)
  if (straitNear > 0 && h > 0.065) h = Math.max(0.065, h * (1 - 0.95 * Math.pow(straitNear, 1.3)));
  return h;
}
// the snowline: lower in the north, and ragged — higher on one shoulder of a range than the next
const snowAt = (lon, lat) => 3.35 - Math.max(0, lat - 45) * 0.08 + (vnoise(lon * 6, lat * 6, 31) - 0.5) * 0.7;
const rbox = (x, y, x0, y0, x1, y1) => { const u = (2 * x - x0 - x1) / (x1 - x0), v = (2 * y - y0 - y1) / (y1 - y0); return u * u * u * u + v * v * v * v < 1; };
// what grows there
export function biomeAt(lon, lat, h) {
  // (the edges between them wander, as they do)
  //  (broadly, and finely too, so no edge runs ruler-straight for miles)
  const jy = (fbm(lon * 1.7, lat * 1.7, 21) - 0.5) * 1.6 + (fbm(lon * 7.3, lat * 7.3, 25, 2) - 0.5) * 0.6, jx = (fbm(lon * 1.7, lat * 1.7, 23) - 0.5) * 1.6 + (fbm(lon * 7.3, lat * 7.3, 27, 2) - 0.5) * 0.6;
  lat += jy; lon += jx;
  // (snow on the peaks, not a sheet over the whole range: the line high and ragged, bare rock in a broad band under it)
  const snowline = snowAt(lon, lat);
  if (h > snowline) return "snow";
  if (h > snowline - 0.6) return "rock";
  if (lat > 64 || (lat > 61 && lon > 35)) return "tundra";
  // (the New World: the north's forest and barrens, the prairie past the Mississippi, the broad woods of the east)
  if (lon < -45) return lat > 58 ? "tundra" : lat > 46.5 ? "taiga" : lon < -94.5 && lat < 47 ? "steppe" : lat < 30.5 ? "med" : "temperate";
  // (Africa: the Sahara's edge well south of the coast — Morocco's plains and Algeria's Tell are farmed, then a band of
  //  steppe, the high plateaus, before the sand; Libya's only a strip along the sea)
  if (lon < 36 && lat < 37.5) { const edge = lon < -1 ? 31.2 : lon < 9 ? 33.2 : lon < 11.5 ? 33.6 : 32.2; if (lat < edge) return h > 1.2 ? "rock" : "desert"; if (lat < edge + 1.1 && lon < 33) return h > 1.2 ? "rock" : "steppe"; if (lon > -10 && lon < 12 && lat < 37.3) return "med"; }
  // (the steppes: the Pontic, the Hungarian plain, the Anatolian plateau — each a rounded box, so no edge of one runs
  //  ruler-straight for a hundred miles)
  if (rbox(lon, lat, 29, 44.5, 44, 51) || rbox(lon, lat, 18.5, 45.4, 22.2, 48.2) || rbox(lon, lat, 30.6, 37.4, 40.4, 40.8)) return "steppe";
  if (lat > 57.5 || (lat > 53 && lon > 28) || h > 1.3 + (fbm(lon * 5.1, lat * 5.1, 29, 2) - 0.5) * 0.6) return "taiga";
  if (lat < 43.6 || (lat < 45.5 && lon > -2 && lon < 9) || (lon > 26 && lat < 41.2)) return "med";
  return "temperate";
}
const BIOME_COL = { snow: 0xf1f3f5, rock: 0x8c877e, tundra: 0x8c8a66, desert: 0xd8b77a, steppe: 0xb8b068, taiga: 0x4f6b40, med: 0x9a9a60, temperate: 0x6f9448, beach: 0xd9c89a };
const _c = new THREE.Color(), _c2 = new THREE.Color();
// (what the ground's colour is made of, beside the colour itself: how wooded, how much open ploughland, how far over
//  the snowline, the height, and whether sand may lie at the water's edge — handed on to the drawing as they are, so the
//  edges of a wood, a snowfield or a shore are drawn sharp across a pixel, not smeared between the mesh's corners)
const _t = [0, 0, 0, 0, 0, 0];
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
// (and the woods on the high ground — the hills and the mountains' flanks wooded, the valleys and the plains ploughed —
//  as the country was, and as it reads from on high: the land's own shape, not a mottle laid over it)
// (only in the farming country, though: the northern forest and the like stand as thick in the lowlands as on the hills)
const SWELL = 0.62, hillWood = (h, o) => (Math.min(1, Math.max(0, (h - 0.12) / 0.8)) - 0.35) * 0.3 * o + (1 - o) * 0.12;
// (how far a country is farming country, by its kind: the open fields of the middle and the south, the steppe's in part)
// (the New World of 1683 mostly forest still: the colonists' fields and the nations' own cleared from it here and there)
const openOf = (b, lon) => lon < -45 ? (b === "temperate" || b === "med" ? 0.18 : 0) : b === "temperate" || b === "med" ? 1 : b === "steppe" ? 0.45 : 0;
export function woodAt(x, z, h = 0.4, o = 1) { let v = (inoise(x * 0.16, z * 0.16, 7) - 0.5) * SWELL + hillWood(h, o), a = 0.5, f = WOOD_F; for (let i = 0; i < 4; i++) { v += a * inoise(x * f, z * f, 13 + i * 17); a *= 0.5; f *= 2.03; } return v; }
// the old tilled lowlands, long since cleared — the Low Countries, the Paris basin, the Po, England's south and east,
// Saxony, the Danish isles: the woods thinned there to copses (lon, lat, how far, in degrees)
const TILLED = [[4.6, 51.9, 1.9], [2.5, 49.1, 2.3], [0.2, 52.2, 2.3], [-1.6, 51.0, 1.4], [9.9, 45.2, 1.6], [12.0, 51.3, 1.4], [10.3, 55.6, 1.4], [7.0, 51.5, 1.0], [11.4, 44.6, 0.9]];
const WOOD_CUT = 0.26;
export function tilledAt(lon, lat) { let t = 0; for (const [x, y, r] of TILLED) { const d = Math.hypot((lon - x) * K, lat - y) / r; if (d < 1) t = Math.max(t, 1 - d * d); } return t; }
// (close in, one country runs into the next over a mile or two, not along a line: the ground's colour, its woods and its
//  fields reckoned at a few points round about and taken together)
const SOFT = [[0, 0, 0], [0.2, 0.07, 0.12], [-0.07, 0.2, -0.12], [-0.2, -0.07, 0.06], [0.07, -0.2, -0.06]], _cBio = new THREE.Color();
function groundColour(lon, lat, h, out, x, z, soft = false) {
  const b = biomeAt(lon, lat, h);
  let green = 0, openW = 0, n = 0; out.setRGB(0, 0, 0);
  for (const [ox, oy, oh] of soft ? SOFT : SOFT.slice(0, 1)) {
    let bb = ox || oy ? biomeAt(lon + ox, lat + oy, h + oh) : b;
    // (bare rock and snow are drawn by the snowline, sharp to the pixel: under them, the colour of the country round about)
    if (bb === "snow" || bb === "rock") bb = biomeAt(lon + ox, lat + oy, 0.5);
    _cBio.setHex(BIOME_COL[bb]); out.r += _cBio.r; out.g += _cBio.g; out.b += _cBio.b; n++;
    if (bb === "temperate" || bb === "taiga" || bb === "med") green++;
    openW += openOf(bb, lon);
  }
  out.r /= n; out.g /= n; out.b /= n; green /= n; openW /= n;
  const till = tilledAt(lon, lat), wood = green ? woodAt(x, z, h, openW) - till * WOOD_CUT : 0;
  _t[0] = green * (1 - till * WOOD_CUT / 0.6);
  // (the open country: fields wherever it's tilled land and not the woods)
  _t[1] = openW * (1 - Math.min(1, Math.max(0, (wood - 0.38) * 8)));
  _t[2] = b === "desert" ? -1 : Math.max(-1, Math.min(1, h - (snowAt(lon, lat) - 0.12)));
  _t[3] = h;
  _t[4] = b === "snow" || b === "rock" ? 0 : 1;
  _t[5] = openW;
  // (the steppe not one tan from end to end: greener where the grass grows long by the rivers and hollows, drier and
  //  paler on the rises; the desert the same, its sand redder in one place and paler in another)
  // (the northern forest's floor and the tundra the same: a brown bog here, a pale stand of birch there)
  if (b === "taiga" || b === "tundra") {
    const k = fbm(x * 0.29, z * 0.29, 47, 3), t = Math.max(-0.45, Math.min(0.45, (k - 0.5) * 3));
    if (t > 0) out.lerp(_cBio.setRGB(b === "taiga" ? 0.42 : 0.55, b === "taiga" ? 0.42 : 0.50, b === "taiga" ? 0.28 : 0.36), t * 0.8);
    else out.lerp(_cBio.setRGB(b === "taiga" ? 0.46 : 0.62, b === "taiga" ? 0.60 : 0.62, b === "taiga" ? 0.36 : 0.44), -t * 0.8);
  }
  if (b === "steppe" || b === "desert") {
    const k = fbm(x * 0.23, z * 0.23, 37, 3), q = fbm(x * 0.71, z * 0.71, 39, 2), t = Math.max(-0.55, Math.min(0.65, (k - 0.5) * 3.2 + (q - 0.5) * 1.0));
    if (b === "steppe") { if (t > 0) out.lerp(_cBio.setRGB(0.52, 0.60, 0.33), t); else out.lerp(_cBio.setRGB(0.80, 0.74, 0.50), -t * 0.8); }
    else out.lerp(_cBio.setRGB(t > 0 ? 0.80 : 0.90, t > 0 ? 0.60 : 0.80, t > 0 ? 0.40 : 0.58), Math.abs(t) * 0.6);
  }
  out.offsetHSL(0, 0, (vnoise(lon * 40, lat * 40, 2) - 0.5) * 0.03);
  return out;
}
// the ground's drawing: the standard material, and over its colour the detail no mesh could carry — the woods' dark
// with a canopy's dapple, the patchwork of fields with hedges between, sand at the shore, the sea floor going deep, the
// snowline ragged; and a grain over all of it, the finer grains faded out as they'd shimmer far off
const GROUND_VS = `
attribute vec4 aT; attribute float aB; attribute float aO;
varying vec4 vT; varying float vB; varying float vO; varying vec3 vWP;`;
const GN_GLSL = `
float gh(vec2 p) { p = mod(p, 512.0); vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`;
// (the shadows of clouds drifting over the land and the sea, slowly, on the wind from the west: broad and soft, a
//  darker patch here and there, never so dark the map can't be read under it)
const CLOUD_GLSL = `
float cloudShadow(vec2 p, float t) {
  vec2 q = p * 0.07 + vec2(t * 0.0016, t * 0.0005);
  float n = gn(q) * 0.55 + gn(q * 2.3 + 7.0) * 0.3 + gn(q * 5.1 + 3.0) * 0.15;
  return 1.0 - 0.24 * smoothstep(0.54, 0.68, n);
}`;
const GROUND_FS = `
uniform float uTime;
varying vec4 vT; varying float vB; varying float vO; varying vec3 vWP;
float ih(ivec2 c, int s) { uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u + uint(s) * 1442695041u; h = (h ^ (h >> 13)) * 1274126177u; return float(h ^ (h >> 16)) / 4294967296.0; }
float inz(vec2 p, int s) { vec2 i = floor(p), f = p - i; f = f * f * (3.0 - 2.0 * f); ivec2 c = ivec2(i);
  float a = ih(c, s), b = ih(c + ivec2(1, 0), s), d = ih(c + ivec2(0, 1), s), e = ih(c + ivec2(1, 1), s);
  return a + (b - a) * f.x + (d - a) * f.y + (a - b - d + e) * f.x * f.y; }
float woodN(vec2 p, float keep, float h, float o) { float v = (inz(p * 0.16, 7) - 0.5) * ${SWELL.toFixed(3)} + (clamp((h - 0.12) / 0.8, 0.0, 1.0) - 0.35) * 0.3 * o + (1.0 - o) * 0.12, a = 0.5, f = ${WOOD_F.toFixed(3)}; for (int i = 0; i < 4; i++) { float k = i < 2 ? 1.0 : i == 2 ? mix(0.25, 1.0, keep) : keep; v += a * mix(0.5, inz(p * f, 13 + i * 17), k); a *= 0.5; f *= 2.03; } return v; }
vec3 cropOf(float c) { return c < 0.26 ? vec3(0.76, 0.66, 0.34) : c < 0.46 ? vec3(0.52, 0.63, 0.30) : c < 0.64 ? vec3(0.58, 0.66, 0.34) : c < 0.8 ? vec3(0.70, 0.63, 0.37) : c < 0.92 ? vec3(0.62, 0.55, 0.36) : vec3(0.56, 0.50, 0.34); }
${GN_GLSL}`;
const GROUND_MIX = `
{
  vec2 wp = vWP.xz; float px = length(fwidth(wp));                 // the ground a pixel covers
  float fine = 1.0 - smoothstep(0.004, 0.011, px), mid = 1.0 - smoothstep(0.011, 0.03, px), far = 1.0 - smoothstep(0.03, 0.09, px);
  float n1 = gn(wp * 3.0) * 0.5 + gn(wp * 7.3) * 0.3 + gn(wp * 17.0) * 0.2;
  float n2 = mix(0.5, gn(wp * 41.0) * 0.6 + gn(wp * 97.0) * 0.4, fine);
  vec3 col = diffuseColor.rgb;
  // the fields: parcels and strips, their edges wandering, each its own crop; hedges dark between them
  // (parcels of no set shape or size — each the nearest of a scatter of points — longer one way than the other, and
  //  lying this way in one district, that way in the next)
  float dn = gn(wp * 0.45 + 4.0) * 0.6 + gn(wp * 1.1) * 0.4, fa = dn < 0.4 ? 0.45 : dn < 0.6 ? 2.0 : 1.2; mat2 fr = mat2(cos(fa), sin(fa), -sin(fa), cos(fa));
  vec2 q = (fr * wp) * vec2(7.0, 18.0) + fa * 37.0, qi = floor(q), qf = q - qi, fid = qi, fid2 = qi; float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), o = vec2(gh(qi + g + 31.0), gh(qi + g + 57.0)) * 0.85 + 0.075, rr = g + o - qf; float d = dot(rr, rr);
    if (d < d1) { d2 = d1; fid2 = fid; d1 = d; fid = qi + g; } else if (d < d2) { d2 = d; fid2 = qi + g; }
  }
  // (each its crop — the colours of a summer's fields, close kin, not paving stones — the edge between two blended,
  //  furrows drawn down its length close in, and a hedge along some edges, ragged, with gaps)
  vec3 c1 = cropOf(gh(fid + 17.0)) * (0.95 + 0.1 * gh(fid + 3.0)), c2 = cropOf(gh(fid2 + 17.0)) * (0.95 + 0.1 * gh(fid2 + 3.0));
  float edge = sqrt(d2) - sqrt(d1);
  vec3 crop = mix((c1 + c2) * 0.5, c1, smoothstep(0.0, 0.3, edge));
  float fur = sin(dot(fr * wp, gh(fid + 9.0) < 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0)) * 520.0) * 0.5 + 0.5;
  crop *= 1.0 - 0.07 * fur * fine * step(0.3, gh(fid + 5.0));
  // (far off, where a field is less than a pixel: the parishes' fields taken together — meadow green in one, ripe corn
  //  in the next, brown fallow beyond — a quilt, not one tan from end to end)
  float pq = gn(wp * 1.7 + 11.0) * 0.65 + gn(wp * 4.3) * 0.35;
  vec3 quilt = mix(mix(vec3(0.50, 0.58, 0.30), vec3(0.64, 0.61, 0.34), smoothstep(0.3, 0.55, pq)), vec3(0.58, 0.52, 0.35), smoothstep(0.62, 0.8, pq));
  // (and between the two, the fields in their blocks: a parish's worth sown alike, the next block another crop — big
  //  enough to see from well up, their edges softened by how much ground a pixel covers, so they never shimmer)
  {
    vec2 r2 = (fr * wp) * vec2(1.25, 2.9) + fa * 53.0, ri = floor(r2), rf = r2 - ri, b1 = ri, b2 = ri; float e1 = 9.0, e2 = 9.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), o = vec2(gh(ri + g + 71.0), gh(ri + g + 89.0)) * 0.8 + 0.1, rr = g + o - rf; float d = dot(rr, rr);
      if (d < e1) { e2 = e1; b2 = b1; e1 = d; b1 = ri + g; } else if (d < e2) { e2 = d; b2 = ri + g; }
    }
    vec3 k1 = cropOf(gh(b1 + 23.0)) * (0.93 + 0.14 * gh(b1 + 5.0)), k2 = cropOf(gh(b2 + 23.0)) * (0.93 + 0.14 * gh(b2 + 5.0));
    vec3 block = mix((k1 + k2) * 0.5, k1, smoothstep(0.0, max(0.05, px * 5.0), sqrt(e2) - sqrt(e1)));
    quilt = mix(quilt, mix(block, quilt, 0.15), 1.0 - smoothstep(0.06, 0.14, px));
  }
  crop = mix(quilt, crop, mid * 0.8 + 0.2);
  float hedge = (1.0 - smoothstep(0.0, 0.06, edge)) * fine * step(0.45, gh(fid + fid2 + 11.0)) * smoothstep(0.35, 0.6, gn(wp * 70.0));
  // (the finest of the woods' grain let go far off, where no tree stands to need it: the woods there whole woods, not a
  //  speckle of dark and light that reads, from on high, as a soldier's camouflage)
  float wood = woodN(wp, 1.0 - smoothstep(0.03, 0.07, px), vT.w, vO) - (1.0 - vT.x) * 0.6;
  float open = vT.y * (1.0 - clamp((wood - 0.38) * 8.0, 0.0, 1.0)) * (0.75 + 0.25 * smoothstep(0.3, 0.6, n1));
  col = mix(col, mix(crop, vec3(0.27, 0.36, 0.18), hedge * 0.75), open * 0.82);
  // the woods: dark where the trees stand, the edge crisp and a little ragged; a canopy's dapple close in
  float w = smoothstep(0.5, 0.515, wood + (n1 - 0.5) * 0.02);
  float crown = mix(0.5, mix(gn(wp * 13.0), gn(wp * 13.0) * 0.55 + gn(wp * 31.0) * 0.45, mid), far);
  // (the northern forest, far off, mostly one dark: its clearings and bogs softened, or it reads as a camouflage)
  float wk = mix(0.8, 0.45, (1.0 - vO) * smoothstep(0.02, 0.06, px));
  col = mix(col, col * vec3(0.5, 0.62, 0.55) * (0.78 + 0.3 * crown + 0.2 * (n2 - 0.5)), w * wk);
  col = mix(col, col * vec3(0.78, 0.86, 0.8), (1.0 - vO) * vT.x * smoothstep(0.02, 0.06, px) * 0.6);
  // sand at the water's edge, and the sea floor under the shallows going dark as it deepens
  float h = vT.w + (n1 - 0.5) * 0.012;
  col = mix(col, vec3(0.77, 0.72, 0.56) * (0.92 + 0.16 * n2), (1.0 - smoothstep(0.035, 0.06, h)) * vB);
  vec3 floor0 = mix(vec3(0.58, 0.63, 0.52), vec3(0.13, 0.25, 0.30), clamp((-vT.w - 0.028) / 0.07, 0.0, 1.0));
  col = mix(col, floor0, smoothstep(0.004, -0.004, vT.w));
  // bare rock in a broad band under the snowline, its lower edge ragged; then the snow, its line ragged and sharp
  col = mix(col, mix(vec3(0.42, 0.40, 0.36), vec3(0.50, 0.47, 0.41), n1) * (0.86 + 0.28 * n2), smoothstep(-0.4, -0.3, vT.z + (n1 - 0.5) * 0.3));
  float sn = smoothstep(0.0, 0.08, vT.z + (n1 - 0.5) * 0.22);
  col = mix(col, vec3(0.93, 0.95, 0.97) * (0.94 + 0.08 * n2), sn);
  // and a grain over all of it
  col *= 0.9 + 0.2 * mix(0.5, n1, 0.7) + (n2 - 0.5) * 0.12;
  col *= cloudShadow(wp, uTime);
  diffuseColor.rgb = col;
}`;
function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>" + GROUND_VS)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vT = aT; vB = aB; vO = aO; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.uniforms.uTime = { value: 0 }; m.userData.shader = sh;
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>" + GROUND_FS + CLOUD_GLSL)
      .replace("#include <color_fragment>", "#include <color_fragment>" + GROUND_MIX);
  };
  m.customProgramCacheKey = () => "ground21";
  return m;
}
const EXAG = 10 / 111 * U;
// a town's people when nobody's counting (the campaign's own reckoning of a town of its rank, as it starts)
const POP0 = [0, 8000, 24000, 70000];
const popEst = (name, rank) => { let h = 7; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return Math.round(POP0[rank] * (0.7 + (h % 600) / 1000) / 100) * 100; };
// a town's houses for its people (one for every hundred and seventy or so), and the widest water it will bridge
const CLEAR_CELL = 0.2, STONE = [0xcdc4b0, 0xc4baa5, 0xd6ccb8];
const houseCount = pop => Math.max(14, Math.min(1000, Math.round(pop / 170)));
const _lv = new THREE.Vector3();
const BRIDGE = 0.32, ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4();
// (how many of a town's things in order are built for so many houses: its bridges with them, as it reaches them)
const shownFor = (items, n) => { let h = 0, i = 0; for (; i < items.length; i++) { if (items[i].house) { if (h >= n) break; h++; } } return i; };
// how far a town spreads, by its rank (in units: a degree of latitude is ten)
const TOWN_R = { 1: 0.15, 2: 0.24, 3: 0.36 };
// a gable roof: unit wide, high and long, the ridge running along z, sitting on y = 0
function gable() {
  const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]);
  const n = g.toNonIndexed(); n.computeVertexNormals(); return n;
}                                  // km to units, ten times over

// the sea's drawing: the water moving close in — swells running across it one way and a chop another, catching the sun —
// and stilled as the eye goes up, where the ripples would be smaller than a pixel and only shimmer
function seaMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x3e6f86, roughness: 0.28, metalness: 0.1, transparent: true, opacity: 0.72, depthWrite: false });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = { value: 0 }; m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSeaWP;").replace("#include <begin_vertex>", "#include <begin_vertex>\n vSeaWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSeaWP; uniform float uTime;" + GN_GLSL + CLOUD_GLSL)
      // (the waves worked out once: their slope for the light, their height for the water's own light and dark)
      .replace("#include <color_fragment>", `#include <color_fragment>
      vec2 sp = vSeaWP.xz; float spx = length(fwidth(sp)), sa = 1.0 - smoothstep(0.006, 0.05, spx);
      vec2 d1 = normalize(vec2(0.8, 0.6)), d2 = normalize(vec2(-0.35, 0.94)), d3 = normalize(vec2(0.97, -0.24));
      float p1 = dot(sp, d1) * 26.0 - uTime * 1.1, p2 = dot(sp, d2) * 47.0 - uTime * 1.6 + sin(sp.x * 9.0) * 1.5, p3 = dot(sp, d3) * 83.0 - uTime * 2.3 + sin(sp.y * 13.0) * 2.0;
      vec2 seaG = d1 * cos(p1) * 0.55 + d2 * cos(p2) * 0.3 + d3 * cos(p3) * 0.15;
      float seaH = sin(p1) * 0.55 + sin(p2) * 0.3 + sin(p3) * 0.15;
      diffuseColor.rgb *= (1.0 + seaH * 0.09 * sa) * cloudShadow(sp, uTime);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      normal = normalize(normal + (viewMatrix * vec4(seaG.x, 0.0, seaG.y, 0.0)).xyz * 0.45 * sa);`);
  };
  m.customProgramCacheKey = () => "sea5";
  return m;
}
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
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 1.6, MAP_H * 1.6).rotateX(-Math.PI / 2), this.seaMat = seaMaterial());
    // (see-through enough that the sandy shallows along a coast show under it, the deeps dark)
    sea.renderOrder = 1;
    sea.position.set(MAP_W / 2, 0, MAP_H / 2); this.scene.add(sea);
    // (and the deep under it, past the edges of the land, so the sky doesn't show through the water there)
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 1.6, MAP_H * 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d3540 }));
    deep.position.set(MAP_W / 2, -0.4, MAP_H / 2); this.scene.add(deep);
    this.seaNames();
    this.kinds = treeKinds();
    this.cells = new Map();          // patches of trees, by cell key
    this.labels = []; this.towns = new Map(); this.growing = []; this.clearings = new Map();
    this.target = new THREE.Vector3(); this.dist = 30;
    this.visible = false;
  }
  // the political map changed (a conquest) or first shown: rebuild what depends on it
  // (walls: a campaign's walled towns, { name: level } — a ring of stone round each)
  // (pops: a campaign's towns' people, { name: count } — a town as big as it has people to fill it)
  setMap(E, homePop = 2, homeName = "Forester's Clearing", walls = null, pops = null) {
    sync();
    const wk = walls ? Object.keys(walls).filter(n => walls[n] > 0).sort().map(n => n + walls[n]).join() : "";
    // (a house more or less in any town: built or pulled down, as it happens)
    let pk = 0; if (pops) for (const n in pops) pk = (pk * 31 + houseCount(pops[n]) + n.length) >>> 0;
    const cq = E.conq, last = cq.length ? cq[cq.length - 1] : null, key = SHEET + (E.rev | 0) + ":" + cq.length + ":" + (last ? last.c + "," + last.r + last.to : "") + "|" + homeName + "|" + wk + "|" + pk;
    const g = buildGrid(E);
    if (this.g && this.mapKey === key) return;
    // (only the towns' people changed: each town builds out to its new size where you can see it, or a house or two
    //  comes down — not the whole map laid out afresh)
    const base = key.slice(0, key.lastIndexOf("|"));
    if (this.g && this.mapKey && this.mapKey.slice(0, this.mapKey.lastIndexOf("|")) === base && pops && this.grow(pops)) { this.mapKey = key; this.pops = pops; return; }
    this.g = g; this.mapKey = key; this.E = E; this.homeName = homeName; this.walls = walls || {}; this.pops = pops;
    // (the ground itself doesn't change with a conquest — only who holds it: raised once for the sheet)
    // (nor do the close ground and its woods: they're land or water, whoever holds them — kept through a conquest, where
    //  once every town changing hands anywhere had them made again round the view, the trees popping back in)
    const fresh = !this.base || this.baseSheet !== SHEET;
    if (fresh) { this.buildBase(); this.buildRivers(); this.baseSheet = SHEET; }
    this.buildBorders(); this.buildCities(homePop);
    if (fresh) {
      this.detailJob = null; if (this.detail) { this.scene.remove(this.detail); this.detail.geometry.dispose(); this.detail = null; }
      for (const c of this.cells.values()) c.forEach(m => this.scene.remove(m)); this.cells.clear();
    }
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
    // (and past the sheet's edges, the country going on as it does at them — the steppe east of the Don, the Pacific
    //  shore — so the edge of the map isn't a ruler-straight coast with the sea beyond it)
    if (this.skirts) for (const m of this.skirts) { this.scene.remove(m); m.geometry.dispose(); }
    const E = 80, step = MAP_W / nx * 2;
    this.skirts = [[-E, 0, -E, MAP_H + E], [MAP_W, MAP_W + E, -E, MAP_H + E], [0, MAP_W, -E, 0], [0, MAP_W, MAP_H, MAP_H + E]].map(([x0, x1, z0, z1]) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.round((x1 - x0) / step)), Math.max(1, Math.round((z1 - z0) / step))).rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const m = this.terrainMesh(g, -0.03); this.scene.add(m); return m;
    });
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
  terrainMesh(geo, dy = 0, edge = null) { const it = this.terrainGen(geo, dy, edge); let r; do r = it.next(); while (!r.done); return r.value; }
  // (the same, a piece at a time: it yields every so many corners, so a big patch can be worked out over several frames)
  *terrainGen(geo, dy = 0, edge = null) {
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), at = new Float32Array(p.count * 4), ab = new Float32Array(p.count), ao = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      if ((i & 255) === 255) yield;
      const x = p.getX(i), z = p.getZ(i), [lon, lat] = toLL(x, z), h = heightAt(this.g, lon, lat);
      let y = Math.max(-0.16, h * EXAG) + dy;
      // a patch's rim eases down onto the coarse ground under it, so no cliff shows where one ends
      if (edge) { const d = Math.min(x - edge.x0, edge.x1 - x, z - edge.z0, edge.z1 - z), t = Math.max(0, Math.min(1, d / edge.band)), b = this.baseY(x, z) + 0.01; y = b + (y - b) * t * t * (3 - 2 * t); }
      p.setY(i, y);
      groundColour(lon, lat, h, _c, x, z, !!edge); col.set([_c.r, _c.g, _c.b], i * 3);
      // (round a town the woods give way to its fields)
      const tn = this.townNear(x, z); if (tn > 0) { _t[0] *= 1 - tn; if (_t[4]) _t[1] = Math.max(_t[1], tn); }
      at.set([_t[0], _t[1], _t[2], _t[3]], i * 4); ab[i] = _t[4]; ao[i] = _t[5];
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setAttribute("aT", new THREE.BufferAttribute(at, 4)); geo.setAttribute("aB", new THREE.BufferAttribute(ab, 1)); geo.setAttribute("aO", new THREE.BufferAttribute(ao, 1)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.groundMat || (this.groundMat = groundMaterial()));
    return m;
  }
  // the ground near where you look, finely
  buildDetail() {
    if (this.dist > 50) { this.detailJob = null; if (this.detail) { this.scene.remove(this.detail); this.detail.geometry.dispose(); this.detail = null; this.detailAt = ""; this.sinkBase(0, -1, 0, -1); } return; }
    // (close in, a small patch, very fine; further off, a wider one — so the land never shows the coarse ground's blur)
    const wide = this.dist > 16, step = wide ? 12 : 4, cx = Math.round(this.target.x / step) * step, cz = Math.round(this.target.z / step) * step;
    const key = cx + "," + cz + wide;
    if (this.detail && this.detailAt === key) { this.detailJob = null; return; }
    // (worked out a few thousand corners a frame, the old patch left where it is till the new one's ready — so moving
    //  across the map doesn't stop it dead for a fifth of a second each time the patch is laid afresh; the first, or one
    //  far from the last, is worked out at once)
    const size = wide ? 110 : 30;
    // (one under way for a spot near this one is let finish — the view moving on as it's worked out mustn't start it over
    //  again and again; the next is begun from where the view is then)
    const J = this.detailJob;
    if (!J || (J.key !== key && (J.wide !== wide || Math.hypot(J.cx - cx, J.cz - cz) > size * 0.3))) {
      // (the flat sheet itself kept, one for each size, and copied: laying out a hundred and sixty thousand corners afresh
      //  was a tenth of a second on its own)
      const tk = wide ? "w" : "n", T = (this.detailTpl ||= {}); T[tk] ||= new THREE.PlaneGeometry(size, size, wide ? 400 : 240, wide ? 400 : 240).rotateX(-Math.PI / 2);
      const geo = T[tk].clone(); geo.translate(cx, 0, cz);
      this.detailJob = { key, cx, cz, wide, gen: this.terrainGen(geo, 0, { x0: cx - size / 2, x1: cx + size / 2, z0: cz - size / 2, z1: cz + size / 2, band: 6 }) };
    }
    // (and the further the view has run ahead of the patch it's on, the more of each frame goes to the next one)
    const lag = this.detail ? Math.hypot(this.detailX - cx, this.detailZ - cz) / size : 1, far = !this.detail || this.detailWide !== wide || lag > 0.42, t0 = performance.now();
    const budget = 8 + 50 * Math.max(0, Math.min(1, (lag - 0.26) / 0.16));
    let r; do r = this.detailJob.gen.next(); while (!r.done && (far || performance.now() - t0 < budget));
    if (!r.done) return;
    const done = this.detailJob; this.detailJob = null; this.detailAt = done.key; this.detailX = done.cx; this.detailZ = done.cz; this.detailWide = done.wide;
    if (this.detail) { this.scene.remove(this.detail); this.detail.geometry.dispose(); }
    this.detail = r.value; this.scene.add(this.detail);
    // the coarse ground under the patch's middle goes under the water, so its rougher coast can't show through the fine one
    const S2 = done.wide ? 110 : 30; this.sinkBase(done.cx - S2 / 2 + 6.5, done.cx + S2 / 2 - 6.5, done.cz - S2 / 2 + 6.5, done.cz + S2 / 2 - 6.5);
  }
  // the towns' people counted afresh: what each has built since shown rising, what it's lost coming down — false if a
  // town has outgrown what was laid out for it, and the map wants laying out again
  grow(pops) {
    for (const [name, T] of this.towns) if (pops[name] && houseCount(pops[name]) > T.cap) return false;
    const now = performance.now();
    for (const [name, T] of this.towns) {
      if (!pops[name]) continue;
      const to = shownFor(T.items, houseCount(pops[name])); if (to === T.shown) continue;
      // (one after another, a little apart, the nearest the old town first as they're raised and the last raised first as they fall)
      const up = to > T.shown, n = Math.abs(to - T.shown), gap = Math.min(220, 4000 / n);
      for (let j = 0; j < n; j++) { const i = up ? T.shown + j : T.shown - 1 - j, it = T.items[i]; this.growing = this.growing.filter(g => g.it !== it); this.growing.push({ it, t0: now + j * gap, up }); }
      T.shown = to;
    }
    return true;
  }
  // (each frame: the houses going up, walls rising out of the ground and the roof on them; or coming down)
  raise() {
    if (!this.growing || !this.growing.length) return;
    const now = performance.now(), dirty = new Set();
    this.growing = this.growing.filter(g => {
      let p = Math.max(0, Math.min(1, (now - g.t0) / 1400)); p = p * p * (3 - 2 * p);
      const s = g.up ? p : 1 - p;
      for (const [b, k] of g.it.parts) {
        if (s <= 0.001) b.im.setMatrixAt(k, ZERO);
        else { _m4.makeTranslation(0, g.it.py, 0).multiply(_m5.makeScale(1, s, 1)).multiply(_m5.makeTranslation(0, -g.it.py, 0)).multiply(b.mats[k]); b.im.setMatrixAt(k, _m4); }
        dirty.add(b.im);
      }
      return now - g.t0 < 1400;
    });
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }
  // the trodden earth of a town's streets and yards: a disc laid over the ground, fading out at its rim
  townGround(x, z, R, out, rings = 5, seg = 28, a0 = 0.7, flatY = null, rgb = [0.50, 0.44, 0.35]) {
    const n0 = out.pos.length / 3;
    for (let i = 0; i <= rings; i++) for (let k = 0; k < (i ? seg : 1); k++) {
      const d = R * i / rings * (i === rings ? 1 : 1 + (hash(i, k, 5) - 0.5) * 0.12), a = k / seg * 6.283, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const gy = flatY ?? this.groundY(px, pz); out.pos.push(px, Math.max(0, gy) + 0.003, pz);
      // (none of it out on the water)
      const t = i / rings; out.col.push(rgb[0], rgb[1], rgb[2], gy < 0.004 ? 0 : a0 * (1 - t * t * t));
    }
    for (let k = 0; k < seg; k++) out.idx.push(n0, n0 + 1 + (k + 1) % seg, n0 + 1 + k);
    for (let i = 1; i < rings; i++) for (let k = 0; k < seg; k++) {
      const a = n0 + 1 + (i - 1) * seg + k, b = n0 + 1 + (i - 1) * seg + (k + 1) % seg, c = a + seg, d = b + seg;
      out.idx.push(a, b, c, b, d, c);
    }
  }
  // ground kept clear of trees (a town's, its fields close round it): circles, filed by the small square they touch
  clear(x, z, r) {
    const C = CLEAR_CELL; for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++) for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) { const k = gx * 65536 + gz; const M = this._clearNext || this.clearings; (M.get(k) || M.set(k, []).get(k)).push([x, z, r]); }
  }
  cleared(x, z) { const L = this.clearings && this.clearings.get(Math.floor(x / CLEAR_CELL) * 65536 + Math.floor(z / CLEAR_CELL)); return !!L && L.some(([cx, cz, cr]) => (x - cx) * (x - cx) + (z - cz) * (z - cz) < cr * cr); }
  // how near a town a point is, for its fields: 1 close round it, falling to nought a few of its widths out
  townNear(x, z) {
    if (!this.townSpots || this.townSheet !== SHEET) {
      this.townSheet = SHEET; this.townSpots = new Map();
      for (const ct of CITIES) { const [tx, tz] = toWorld(ct[1], ct[2]), k = Math.floor(tx / 4) * 4096 + Math.floor(tz / 4); (this.townSpots.get(k) || this.townSpots.set(k, []).get(k)).push([tx, tz, TOWN_R[ct[3]] || 0.2]); }
    }
    let best = 0, w = -1; const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const L = this.townSpots.get((bx + i) * 4096 + bz + j); if (!L) continue;
      for (const [tx, tz, R] of L) { const d = Math.hypot(x - tx, z - tz); if (d < R * 5) { if (w < 0) w = inoise(x * 1.4, z * 1.4, 61) * 0.65 + inoise(x * 4.1, z * 4.1, 67) * 0.35; const t = 1 - (d - R * (0.5 + w * 1.6)) / (R * (1.2 + w * 1.6)); if (t > best) best = Math.min(1, t); } }
    }
    // (the fields don't lie in a ring: they run out along the better ground and stop short where the woods hold)
    return best;
  }
  rawY(x, z) { const [lon, lat] = toLL(x, z); return Math.max(-0.16, heightAt(this.g, lon, lat) * EXAG); }
  // (the ground's height for what stands on it: a river counts as water, so a town bridges it and builds round it)
  groundY(x, z) { return this.riverAt(x, z) ? -0.01 : this.rawY(x, z); }
  // the rivers: each a ribbon of water laid along the land, wandering as a river does, broader toward its mouth, its
  // banks soft — and never thinner on the view than a fine line, so it reads from far off as it does on the map
  buildRivers() {
    if (this.rivers) { this.scene.remove(this.rivers); this.rivers.geometry.dispose(); }
    this.riverSeg = new Map();
    const pos = [], nrm = [], side = [], hwA = [], col = [], idx = [];
    RIVERS.forEach((rv, ri) => {
      let P = rv.map(([lo, la]) => toWorld(lo, la));
      for (let it = 0; it < 2; it++) { const Q = [P[0]]; for (let i = 0; i < P.length - 1; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1]; Q.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]); } Q.push(P[P.length - 1]); P = Q; }
      // (the smoothing cuts the corners, and a corner is often where a town stands on the river — Kiev, Warsaw, Buda: so
      //  where the engraver's line ran by a town, the smoothed one is drawn back to it)
      const R0 = rv.map(([lo, la]) => toWorld(lo, la));
      for (const ct of CITIES) {
        const [tx, tz] = toWorld(ct[1], ct[2]); let dr = Infinity;
        for (let i = 1; i < R0.length; i++) dr = Math.min(dr, segDist(tx, tz, R0[i - 1][0], R0[i - 1][1], R0[i][0], R0[i][1]));
        if (dr > 1.2) continue;
        let best = Infinity, bi = -1; P.forEach(([x, z], i) => { const d = Math.hypot(x - tx, z - tz); if (d < best) { best = d; bi = i; } });
        // (a town that near the line stands on the river: the line was only the engraver's hand)
        const want = Math.min(dr, 0.12); if (best <= want + 0.1) continue;
        const k = 1 - want / best, [cx, cz] = P[bi], ox = (tx - cx) * k, oz = (tz - cz) * k;
        let along = 0; for (let i = bi; i < P.length; i++) { if (i > bi) along += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); const w = Math.exp(-(along * along) / 2.5); if (w < 0.01) break; P[i] = [P[i][0] + ox * w, P[i][1] + oz * w]; }
        along = 0; for (let i = bi - 1; i >= 0; i--) { along += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); const w = Math.exp(-(along * along) / 2.5); if (w < 0.01) break; P[i] = [P[i][0] + ox * w, P[i][1] + oz * w]; }
      }
      // (walked along at a fine step, bending this way and that about the engraver's line)
      const W = []; let s = 0; const ph = ri * 1.7;
      for (let i = 0; i < P.length - 1; i++) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 0.06)), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
        for (let k = 0; k < n; k++) { const t = k / n, ss = s + L * t, off = 0.07 * Math.sin(ss * 2.3 + ph) + 0.035 * Math.sin(ss * 6.1 + ph * 2.3); W.push([x0 + (x1 - x0) * t - uz * off, z0 + (z1 - z0) * t + ux * off]); }
        s += L;
      }
      W.push(P[P.length - 1]);
      // (a great river broadens to its mouth; a short one, a tributary, stays narrow to where it joins)
      const big = Math.min(1, 0.35 + s / 120);
      const N = W.length, dir = W.map((_, i) => { const [xa, za] = W[Math.max(0, i - 1)], [xb, zb] = W[Math.min(N - 1, i + 1)], d = Math.hypot(xb - xa, zb - za) || 1; return [(xb - xa) / d, (zb - za) / d]; });
      // (and where the engraver's line runs along beside the sea or an estuary rather than in its own bed, let go over
      //  that stretch: the water there is the river)
      const side0 = W.map(([x, z], i) => { const [dx, dz] = dir[i]; return this.rawY(x - dz * 0.3, z + dx * 0.3) <= 0 || this.rawY(x + dz * 0.3, z - dx * 0.3) <= 0 ? 1 : 0; });
      const beside = side0.map((_, i) => { let t = 0, n = 0; for (let k = Math.max(0, i - 10); k <= Math.min(N - 1, i + 10); k++) { t += side0[k]; n++; } return t / n > 0.45; });
      for (let i = 0; i < N; i++) {
        const [x, z] = W[i], [dx, dz] = dir[i];
        const hw = 0.018 + 0.03 * (1 - i / N) * big, raw = this.rawY(x, z), dry = raw > 0.002 && !beside[i];
        // (a hair over the ground — and over the coarse ground's line where that runs higher, far off)
        const y = Math.max(0, raw) + 0.012 + Math.min(0.04, Math.max(0, this.baseY(x, z) - raw)), n0 = pos.length / 3;
        for (const [sd, a] of [[-1.7, 0], [-1, 1], [1, 1], [1.7, 0]]) { pos.push(x, y, z); nrm.push(-dz, dx); side.push(sd); hwA.push(hw); col.push(0.25, 0.43, 0.52, dry ? a * 0.95 : 0); }
        if (i) for (let k = 0; k < 3; k++) idx.push(n0 - 4 + k, n0 - 4 + k + 1, n0 + k, n0 - 4 + k + 1, n0 + k + 1, n0 + k);
        if (i && dry) { const [px, pz] = W[i - 1], e = hw + 0.08; for (let gx = Math.floor(Math.min(x, px) - e); gx <= Math.floor(Math.max(x, px) + e); gx++) for (let gz = Math.floor(Math.min(z, pz) - e); gz <= Math.floor(Math.max(z, pz) + e); gz++) { const k = gx * 65536 + gz; (this.riverSeg.get(k) || this.riverSeg.set(k, []).get(k)).push([px, pz, x, z, hw]); } }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setAttribute("aN", new THREE.Float32BufferAttribute(nrm, 2));
    g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1)); g.setAttribute("aHW", new THREE.Float32BufferAttribute(hwA, 1));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const uPix = { value: 0.01 }; this.riverPix = uPix;
    m.onBeforeCompile = sh => {
      sh.uniforms.uPix = uPix;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aN; attribute float aSide; attribute float aHW; uniform float uPix;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.xz += aN * aSide * max(aHW, uPix);");
    };
    m.customProgramCacheKey = () => "river2";
    this.rivers = new THREE.Mesh(g, m); this.rivers.renderOrder = 2; this.rivers.frustumCulled = false; this.scene.add(this.rivers);
  }
  riverAt(x, z, m = 0) {
    const L = this.riverSeg && this.riverSeg.get(Math.floor(x) * 65536 + Math.floor(z)); if (!L) return false;
    for (const [x0, z0, x1, z1, hw] of L) { const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1))), ex = x - x0 - dx * t, ez = z - z0 - dz * t; if (ex * ex + ez * ez < (hw + m) * (hw + m)) return true; }
    return false;
  }
  // trees, a unit square at a time, the same every time for the same square
  treesNear() {
    const R = this.dist < 6 ? 5.5 : this.dist < 14 ? 8 : 0, have = new Set();
    // (the planted ground round, not square, and its rim ragged a square or two either way — so where the trees end
    //  doesn't run straight as a ruler across the woods)
    if (R) for (let gx = Math.floor(this.target.x - R - 1); gx <= this.target.x + R + 1; gx++) for (let gz = Math.floor(this.target.z - R - 1); gz <= this.target.z + R + 1; gz++) {
      const rr = R - 1.5 + hash(gx, gz, 41) * 2.5; if ((gx + 0.5 - this.target.x) ** 2 + (gz + 0.5 - this.target.z) ** 2 > rr * rr) continue;
      const key = gx + "," + gz; have.add(key);
      if (!this.cells.has(key)) this.cells.set(key, this.plant(gx, gz));
    }
    for (const [key, ms] of this.cells) if (!have.has(key)) { ms.forEach(m => { this.scene.remove(m); m.dispose(); }); this.cells.delete(key); }
    const near = this.dist < 6.5; if (near !== this._hNear) { this._hNear = near; for (const ms of this.cells.values()) for (const m of ms) if (m.userData.small) m.visible = near; }
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
        const h = heightAt(this.g, lon, lat), wood = woodAt(x, z, h, openOf(biomeAt(lon, lat, h), lon)) - tilledAt(lon, lat) * WOOD_CUT;
        if (wood < (kind === "bush" || kind === "palm" ? 0.45 : 0.52) || r() > 0.85) continue;
        if (h < 0.03 || biomeAt(lon, lat, h) === "snow" || this.riverAt(x, z, 0.065)) continue;
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
    return out.concat(this.hamlets(gx, gz));
  }
  // the villages of the open country between the towns: a handful of houses round a green, the larger with a church —
  // thatch in the north and the middle, tile in the south; none in the woods, by a town, or on the water's edge
  hamlets(gx, gz) {
    const [lon0] = toLL(gx + 0.5, gz + 0.5); if (lon0 < -45) return [];   // (the New World: its own towns and the woods' nations', no villages of Europe's kind)
    const r = rng(gx * 4241 + gz * 92821 + 3), K = this._hk ||= { box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roof: gable(), spire: new THREE.ConeGeometry(0.5, 1, 4).translate(0, 0.5, 0), mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }) };
    // (the small ones apart from those with a church: from further up only the larger are shown, or the country's a speckle)
    const L = { box: [], roof: [], spire: [], "box.s": [], "roof.s": [] }, o = new THREE.Object3D(), c = new THREE.Color();
    let sm = "";
    const put = (k, x, y, z, ry, sx, sy, sz, col) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.set(sx, sy, sz); o.updateMatrix(); L[k + sm].push([o.matrix.clone(), col]); };
    const WALL = [0xe8dfca, 0xe2d6bc, 0xd9cdb4, 0xcfc4ae, 0xb8ab94], TILE = [0xa64a30, 0x9a3f2a, 0xb05a38, 0x8c4430], THATCH = [0x9c8455, 0x8a7448, 0xa08a5c], SLATE = [0x55605e, 0x4a5452];
    for (let i = 0; i < 6; i++) {
      const cx = gx + r(), cz = gz + r(), [lon, lat] = toLL(cx, cz), h = heightAt(this.g, lon, lat), n = 4 + ((r() * 7) | 0), ang0 = r() * 3.14, roll = r();
      if (h < 0.03 || h > 2.2) continue;
      const per = { temperate: 1, med: 0.75, steppe: 0.3, taiga: 0.2 }[biomeAt(lon, lat, h)] || 0; if (roll > per) continue;
      if (woodAt(cx, cz, h, openOf(biomeAt(lon, lat, h), lon)) - tilledAt(lon, lat) * WOOD_CUT > 0.42 || this.cleared(cx, cz) || this.riverAt(cx, cz, 0.07) || this.townNear(cx, cz) > 0.02) continue;
      const south = lat < 45, north = lat > 54, spread = 0.02 + n * 0.0045; sm = n >= 6 ? "" : ".s";
      for (let k = 0; k < n; k++) {
        const a = r() * 6.28, d = 0.008 + Math.sqrt(r()) * spread, hx = cx + Math.cos(a) * d, hz = cz + Math.sin(a) * d, hy = this.groundY(hx, hz);
        if (hy < 0.006 || this.riverAt(hx, hz, 0.03)) continue;
        const w = 0.017 + r() * 0.006, l = 0.024 + r() * 0.012, ht = 0.013 + r() * 0.006, ry = ang0 + (r() < 0.5 ? 0 : 1.571) + (r() - 0.5) * 0.4;
        const pal = south ? TILE : north ? (r() < 0.5 ? SLATE : THATCH) : r() < 0.65 ? THATCH : TILE;
        put("box", hx, hy - 0.004, hz, ry, w, ht + 0.004, l, WALL[(r() * WALL.length) | 0]);
        put("roof", hx, hy + ht, hz, ry, w * 1.2, (south ? 0.45 : 0.8) * w, l * 1.08, pal[(r() * pal.length) | 0]);
      }
      // (the church: its tower and spire over the roofs, at the green's edge)
      if (n >= 6) { const hy = this.groundY(cx, cz); if (hy >= 0.006) { put("box", cx, hy - 0.004, cz, ang0, 0.013, 0.05, 0.013, 0xd6ccb8); put("box", cx + Math.cos(ang0) * 0.016, hy - 0.004, cz - Math.sin(ang0) * 0.016, ang0, 0.016, 0.022, 0.03, 0xe2d6bc); put("spire", cx, hy + 0.046, cz, ang0 + 0.785, 0.016, 0.03, 0.016, south ? 0xa64a30 : 0x4a5a58); } }
    }
    const out = [];
    for (const [k, list] of Object.entries(L)) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(K[k.split(".")[0]], K.mat, list.length);
      list.forEach(([m, col], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(col)); });
      if (k.endsWith(".s")) { im.userData.small = true; im.visible = this.dist < 6.5; }
      this.scene.add(im); out.push(im);
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
    // (the ground under a border doesn't change when the border does: its heights kept from one drawing to the next, so
    //  a town changing hands redraws the borders in a few milliseconds, not fifty)
    if (!this.borderY || this.borderYSheet !== SHEET || this.borderY.size > 600000) { this.borderY = new Map(); this.borderYSheet = SHEET; }
    const BY = this.borderY, rawAt = (x, z) => { const k = Math.round(x * 4096) * 1e7 + Math.round(z * 4096); let v = BY.get(k); if (v === undefined) { v = this.rawY(x, z); BY.set(k, v); } return v; };
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
      let wasOn = true;
      for (let i = 0; i < P.length; i++) {
        const [x, z] = P[i], [xa, za] = P[Math.max(0, i - 1)], [xb, zb] = P[Math.min(P.length - 1, i + 1)];
        let dx = xb - xa, dz = zb - za; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        // (not drawn out over the water — a strait, an inlet the grid has as land — where it would stand in the sea)
        const raw = rawAt(x, z), y = Math.max(0.005, raw) + 0.025, n = pts.length / 3, on = raw > -0.004;
        pts.push(x - dz * HW, y, z + dx * HW, x + dz * HW, y, z - dx * HW);
        if (i && on && wasOn) idx.push(n - 2, n - 1, n, n - 1, n + 1, n);
        wasOn = on;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex(idx);
    this.borders = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a2416, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.borders.renderOrder = 2;
    this.scene.add(this.borders);
  }
  // the cities: houses and a church on the ground, and the name, in the colour of whoever holds it
  // (laid out a few towns a frame, so the land shows at once and the towns follow; the old ones stand till the new are
  //  ready — sync: all of it now)
  // where a town stands: its place on the map — or, a port whose spot falls on the water at this map's grain (an inlet,
  // a river mouth), the nearest dry ground round it, so the town stands on its shore, not out in the bay
  spotXZ(lon, lat) {
    let [x, z] = toWorld(lon, lat);
    if (this.groundY(x, z) < 0.02) { found: for (let d = 0.04; d <= 0.8; d += 0.04) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, nx = x + Math.cos(a) * d, nz = z + Math.sin(a) * d; if (this.groundY(nx, nz) >= 0.02) { x = nx; z = nz; break found; } } }
    return [x, z];
  }
  // the roads between the towns: each town joined to its near neighbours (to one, not past it to the next beyond), the
  // way laid round the sea and the worst of the hills — bent where it must be, or not made at all if there's no way
  // over land; a stretch of narrow water bridged. Worked out once for the sheet, a few at a time between frames
  *roadGen() {
    if (this.roadNet && this.roadNet.sheet === SHEET) return;
    const T = CITIES.map(ct => { const [x, z] = this.spotXZ(ct[1], ct[2]); return { name: ct[0], x, z, rank: ct[3] }; }).filter(t => this.groundY(t.x, t.z) > -0.1);
    yield;
    const D2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2, MAXD = 30, pairs = [];
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const d2 = D2(T[i], T[j]); if (d2 > MAXD * MAXD) continue;
      // (no road from one town to another past a third that lies between: that's two roads, through it)
      if (T.some((c, k) => k !== i && k !== j && D2(T[i], c) + D2(T[j], c) < d2 * 0.8)) continue;
      pairs.push([i, j, d2]);
    }
    yield;
    const bear = new Map(), edges = [], clears = [];
    const wy = (x, z) => this.rawY(x, z);
    for (const [i, j] of pairs.sort((p, q) => p[2] - q[2])) {
      const A = T[i], B = T[j], L = Math.sqrt(D2(A, B)), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
      if ((bear.get(A.name) || []).length >= 5 || (bear.get(B.name) || []).length >= 5) continue;
      // (the way tried straight, and bowed one way or the other: the shortest that keeps to the land and climbs least)
      let best = null;
      for (const o of [0, 0.18, -0.18, 0.36, -0.36]) {
        const cx = (A.x + B.x) / 2 - uz * o * L, cz = (A.z + B.z) / 2 + ux * o * L, n = Math.max(4, Math.ceil(L / 0.25));
        let cost = 0, wet = 0, ok = true, py = Math.max(0, wy(A.x, A.z)), px = A.x, pz = A.z;
        for (let k = 1; k <= n; k++) {
          const t = k / n, qx = (1 - t) * (1 - t) * A.x + 2 * t * (1 - t) * cx + t * t * B.x, qz = (1 - t) * (1 - t) * A.z + 2 * t * (1 - t) * cz + t * t * B.z, qy = wy(qx, qz);
          if (qy < 0.002) { if (++wet > 1) { ok = false; break; } } else wet = 0;
          const y = Math.max(0, qy); cost += Math.hypot(qx - px, qz - pz) + Math.abs(y - py) * 5; py = y; px = qx; pz = qz;
        }
        if (ok && cost < L * 1.9 && (!best || cost < best.cost)) best = { cost, cx, cz };
        // (straight and near enough level: no need to try it bowed)
        if (best && best.cost < L * 1.08) break;
      }
      yield;
      if (!best) continue;
      // (walked finely: a gentle wander about the line, none at the ends where it leaves a town by its main street)
      // (and over a long way, a slow swing or two, as a road goes round a farm, a wood, a rise)
      const n = Math.max(8, Math.ceil(L / 0.06)), ph = (i * 7 + j * 13) % 17, sw = Math.max(1, Math.round(L / 7));
      let P, fail;
      for (const amp of [1, 0.4, 0]) { P = []; fail = false; let wetRun = 0;
      for (let k = 0; k <= n; k++) {
        const t = k / n, bx = (1 - t) * (1 - t) * A.x + 2 * t * (1 - t) * best.cx + t * t * B.x, bz = (1 - t) * (1 - t) * A.z + 2 * t * (1 - t) * best.cz + t * t * B.z;
        const tx = 2 * (1 - t) * (best.cx - A.x) + 2 * t * (B.x - best.cx), tz = 2 * (1 - t) * (best.cz - A.z) + 2 * t * (B.z - best.cz), tl = Math.hypot(tx, tz) || 1;
        const s = t * L, off = Math.sin(Math.PI * t) ** 2 * (amp * (Math.min(1.0, L * 0.045) * Math.sin(t * sw * Math.PI + ph) + 0.22 * Math.sin(s * 0.33 + ph * 1.3)) + 0.1 * Math.sin(s * 0.9 + ph) + 0.04 * Math.sin(s * 2.7 + ph * 1.9));
        // (the ground looked at every other step: enough to find water too wide to bridge)
        const qx = bx - tz / tl * off, qz = bz + tx / tl * off;
        if (!(k & 1) || k === n) { if (wy(qx, qz) < 0.002) { wetRun += 2 * L / n; if (wetRun > BRIDGE) { fail = true; break; } } else wetRun = 0; }
        P.push([qx, qz]);
      }
      if (!fail) break; }
      yield;
      if (fail) continue;
      const major = A.rank >= 2 && B.rank >= 2;
      edges.push({ P, hw: major ? 0.008 : 0.0055 });
      (bear.get(A.name) || bear.set(A.name, []).get(A.name)).push(Math.atan2(best.cz - A.z, best.cx - A.x));
      (bear.get(B.name) || bear.set(B.name, []).get(B.name)).push(Math.atan2(best.cz - B.z, best.cx - B.x));
      for (let k = 0; k < P.length; k++) clears.push([P[k][0], P[k][1], (major ? 0.008 : 0.0055) * 2.4 + 0.055]);
    }
    // (the roads themselves laid after the towns: the towns want only which way each leaves, and are what's looked for first)
    this.roadNet = { sheet: SHEET, bear, clears }; this.roadEdges = edges;
  }
  // (laid an edge at a time, between frames: each point's height looked up again was most of a second at once)
  *buildRoads(edges) {
    if (this.roads) { this.scene.remove(this.roads); this.roads.geometry.dispose(); this.roads = null; }
    const pos = [], nrm = [], side = [], hwA = [], col = [], idx = [];
    for (const { P, hw } of edges) {
      const N = P.length;
      for (let i = 0; i < N; i++) {
        const [x, z] = P[i], [xa, za] = P[Math.max(0, i - 1)], [xb, zb] = P[Math.min(N - 1, i + 1)];
        let dx = xb - xa, dz = zb - za; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const raw = this.rawY(x, z), river = this.riverAt(x, z, 0.03), wet = raw < 0.002;
        // (on the ground, a hair over it — and over the coarse ground's line where that runs higher; up on a bridge over
        //  a river, or over a narrow water, its planks darker)
        const y = Math.max(0, raw) + (river || wet ? 0.018 : 0.004) + Math.min(0.04, Math.max(0, this.baseY(x, z) - raw)), n0 = pos.length / 3;
        // (pale dust down the middle, its verges darker — the ditch, the hedge — so it reads on the fields and in the woods alike)
        const c = river || wet ? [0.34, 0.26, 0.18] : [0.80, 0.73, 0.58], e = river || wet ? c : [0.30, 0.28, 0.18], v = 0.94 + 0.06 * Math.sin(i * 0.7);
        for (const [sd, a, q] of [[-2.4, 0, e], [-1.5, 0.55, e], [-0.8, 0.95, c], [0.8, 0.95, c], [1.5, 0.55, e], [2.4, 0, e]]) { pos.push(x, y, z); nrm.push(-dz, dx); side.push(sd); hwA.push(hw); col.push(q[0] * v, q[1] * v, q[2] * v, a); }
        if (i) for (let k = 0; k < 5; k++) idx.push(n0 - 6 + k, n0 - 6 + k + 1, n0 + k, n0 - 6 + k + 1, n0 + k + 1, n0 + k);
      }
      yield;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setAttribute("aN", new THREE.Float32BufferAttribute(nrm, 2));
    g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1)); g.setAttribute("aHW", new THREE.Float32BufferAttribute(hwA, 1));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // (and lifted a little more the further off it's seen from, where the ground under it is drawn more coarsely)
    const uPix = { value: 0.01 }, uLift = { value: 0 }; this.roadPix = uPix; this.roadLift = uLift;
    m.onBeforeCompile = sh => {
      sh.uniforms.uPix = uPix; sh.uniforms.uLift = uLift;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aN; attribute float aSide; attribute float aHW; uniform float uPix; uniform float uLift;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.xz += aN * aSide * max(aHW, uPix); transformed.y += uLift;");
    };
    m.customProgramCacheKey = () => "road2";
    this.roads = new THREE.Mesh(g, m); this.roads.renderOrder = 1; this.roads.frustumCulled = false; this.scene.add(this.roads);
  }
  buildCities(homePop, sync = false) {
    this.cityJob = this.cityGen(homePop);
    if (sync) { this.pumpCities(Infinity); return; }
    // (driven on its own, a slice at a time between frames — the view isn't always being drawn — and drawn once done)
    const job = this.cityJob, ch = new MessageChannel();
    ch.port1.onmessage = () => { if (this.cityJob !== job) return; this.pumpCities(10); if (this.cityJob) ch.port2.postMessage(0); else if (this.visible) this.frame(); };
    ch.port2.postMessage(0);
  }
  pumpCities(budget = 12) {
    const t = performance.now();
    while (this.cityJob && performance.now() - t < budget) if (this.cityJob.next().done) this.cityJob = null;
  }
  *cityGen(homePop) {
    const grp = new THREE.Group(), labels = [], towns = new Map();
    // (the thousands of houses, roofs, walls and stakes: one instanced draw for each kind, not a mesh apiece — the
    //  scene's thousands of objects were most of a frame's work)
    const kinds = new Map(), put = (m, col) => { m.updateMatrix(); const k = m.geometry.uuid + m.material.uuid; let b = kinds.get(k); if (!b) kinds.set(k, b = { geo: m.geometry, mat: m.material, mats: [], cols: [] }); b.mats.push(m.matrix.clone()); b.cols.push(col ?? 0xffffff); return [b, b.mats.length - 1]; };
    // (the same, with no mesh made for it: the hot path, thousands of times over)
    const _d = new THREE.Object3D(), putM = (geo, mat, x, y, z, ry, sx, sy, sz, col) => { _d.geometry = geo; _d.material = mat; _d.position.set(x, y, z); _d.rotation.set(0, ry, 0); _d.scale.set(sx, sy, sz); return put(_d, col); };
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
    yield* this.roadGen();
    this._clearNext = new Map(); const groundBits = { pos: [], col: [], idx: [] };
    for (const [cx, cz, cr] of this.roadNet.clears) this.clear(cx, cz, cr);
    const place = (name, lon, lat, rank, own, isHome) => {
      const [x, z] = this.spotXZ(lon, lat), r = rng(Math.round(lon * 100 + lat * 7));
      const y0 = this.groundY(x, z);
      if (y0 < -0.1) return;
      // (its people: the campaign's count, or what a town of its rank would have — and the houses as many as house them)
      const pop = isHome ? 0 : (this.pops && this.pops[name]) || popEst(name, rank);
      const NH = isHome ? 5 : houseCount(pop), NH0 = isHome ? 5 : houseCount(popEst(name, rank));
      // (as many again laid out as it has now, or twice what it started with, for it to grow into — hidden till it does)
      const CAP = isHome ? 5 : Math.min(1000, Math.max(Math.round(NH * 1.4) + 10, NH0 * 2));
      // (the old town, inside its walls if it has them: as it was at the start, however the town has grown since)
      const spread = isHome ? 0.07 : 0.025 + 0.0105 * Math.sqrt(NH0);
      // (a town of the woods' nations: longhouses of bark inside a ring of palisade, no church)
      const woods = own && NATIONS[own] && NATIONS[own].nw;
      if (woods) {
        const R = (0.16 + rank * 0.04) * Math.max(0.8, Math.min(1.4, Math.sqrt(pop / popEst(name, rank))));
        this.clear(x, z, R + 0.06);
        for (let i = 0; i < 6 + rank * 5; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * R * 0.8, hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d, hy = this.groundY(hx, hz); const lh = new THREE.Mesh(longGeo, barkMat); lh.position.set(hx, hy, hz); lh.rotation.y = r() * 3; lh.scale.setScalar(1.25); put(lh); }
        const N = 40 + rank * 14; for (let i = 0; i < N; i++) { const a = i / N * 6.28, sx = x + Math.cos(a) * R, sz = z + Math.sin(a) * R; if (Math.abs(Math.sin(a)) < 0.06 && Math.cos(a) > 0) continue; const st = new THREE.Mesh(stakeGeo, stakeMat); st.position.set(sx, this.groundY(sx, sz) + 0.018, sz); st.scale.setScalar(1.2); put(st); }
      } else {
        // the town laid out as a town grows: a market square, the old town's streets packed round it — and past it
        // the newer town, spreading as a town does, unevenly: further one way than another, in a lump or two where
        // it grew most, the streets running on out from the old ones and lanes round between; and least toward the
        // water and the steep ground, where it can't build
        const north = lat > 52 || lon < -45, south = lat < 44, R = spread, S = isHome ? 2 : 5 + rank, a0 = r() * 6.28;
        const sq = R * 0.13, slots = [], ok = (px, pz, py) => py >= 0.006;
        // (its outline: lumpy, a bulge or two in no set direction, drawn in toward bad ground)
        const p1 = r() * 6.28, p2 = r() * 6.28, lobes = Array.from({ length: 1 + ((r() * 3) | 0) }, () => [r() * 6.283, 0.9 + r() * 1.5, 0.35 + r() * 0.4]);
        const RMAX = isHome ? R : R * 5.2, land = [], reach = [], gaps = [], harb = [], RAYS = 16, RS = Math.max(0.05, RMAX / 18);
        // (out from the middle each way: how far there's ground to build on — over a river or a lake, if it's narrow enough
        //  to bridge, but not over the sea; nor up a cliff)
        // (and a town hemmed in by steep ground all round — Genoa on its mountainside — builds up it in terraces, each house
        //  on a footing stepped into the slope, rather than not at all)
        let steep = 1.25, terraced = false;
        const cast = () => { land.length = reach.length = gaps.length = harb.length = 0; let cliff = 0;
        for (let k = 0; k < RAYS; k++) {
          const a = k / RAYS * 6.283, ca = Math.cos(a), sa = Math.sin(a); let good = 0, n = 0, py = this.groundY(x, z), wet = -1, lastDry = 0, far = RMAX;
          for (let d = R * 0.15, st = 0.028; d < RMAX; st = d < R * 1.6 ? 0.028 : RS, d += st) {
            const qy = this.groundY(x + ca * d, z + sa * d); n++;
            if (qy < 0.004) { if (wet < 0) wet = lastDry; if (d - wet > BRIDGE) { far = wet; harb[k] = wet; break; } continue; }
            if (wet >= 0) { if (d - wet > 0.02) gaps.push([a, wet, d, d - wet]); wet = -1; py = qy; }
            if (Math.abs(qy - py) / st > steep) { far = d; cliff++; break; }
            good++; py = qy; lastDry = d;
          }
          if (wet >= 0) { far = Math.min(far, wet); harb[k] = wet; }
          reach.push(far); land.push(0.25 + 0.75 * good / Math.max(1, n));
        }
          return cliff; };
        if (cast() >= RAYS * 0.4 && !isHome && reach.reduce((t, v) => t + v, 0) / RAYS < R * 1.8) { steep = 4; terraced = true; cast(); }
        const at = (L, a) => { const f = ((a / 6.283 % 1 + 1) % 1) * RAYS, k = Math.floor(f) % RAYS, t = f - Math.floor(f); return L[k] * (1 - t) + L[(k + 1) % RAYS] * t; };
        const reachAt = a => at(reach, a);   // (between two rays, between their reaches: a coast's strip of land is followed along it)
        const shape = a => {
          let v = 0.45 + 0.25 * Math.sin(2 * a + p1) + 0.15 * Math.sin(3 * a + p2);
          for (const [la, ls, lw] of lobes) { let da = Math.abs(a - la) % 6.283; if (da > Math.PI) da = 6.283 - da; v += ls * Math.exp(-(da * da) / (lw * lw)); }
          return Math.max(0.2, v * at(land, a));
        };
        // (inside the old town, first; out past it, in the order the outline grows — so more people, the same shape larger)
        const lot = (hx, hz, ang, d, nx = 0, nz = 0) => {
          const a = Math.atan2(hz - z, hx - x); if (d > R && d > reachAt(a)) return;
          const score = d < R ? d * 0.5 : R * 0.5 + (d - R) / shape(a) * (0.94 + r() * 0.12);
          slots.push([hx, hz, ang, score, nx, nz, d / R]);
        };
        // (the streets themselves: paved a piece at a time, each piece laid as the houses along it go up — and filed, so no
        //  house is set down in the middle of one)
        const streetAt = new Map(), SC = 0.04;
        const street = (x0, z0, x1, z1, w) => {
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.hypot(cx - x, cz - z), a = Math.atan2(cz - z, cx - x);
          if (d > R && d > reachAt(a)) return;
          const score = (d < R ? d * 0.5 : R * 0.5 + (d - R) / shape(a)) - 0.002;
          slots.push([cx, cz, 0, score, 0, 0, d / R, null, [x0, z0, x1, z1, w]]);
          const k = Math.floor(cx / SC) * 65536 + Math.floor(cz / SC); (streetAt.get(k) || streetAt.set(k, []).get(k)).push([cx, cz, (w / 2 + 0.012) * (w / 2 + 0.012)]);
        };
        const onStreet = (px, pz) => { const gx = Math.floor(px / SC), gz = Math.floor(pz / SC); for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { const L = streetAt.get((gx + u) * 65536 + gz + v); if (L && L.some(([sx, sz, r2]) => (sx - px) * (sx - px) + (sz - pz) * (sz - pz) < r2)) return true; } return false; };
        // (the market square, paved, in the middle)
        if (!isHome) this.townGround(x, z, sq * 1.3, groundBits, 2, 16, 0.9, null, [0.70, 0.65, 0.55]);
        // (its main streets out from the square: first the roads that leave it, then as many more as it has, between)
        const ways = [...((this.roadNet && this.roadNet.bear.get(name)) || [])];
        for (let k = 0; k < S && ways.length < S; k++) { const a = a0 + k / S * 6.283 + (r() - 0.5) * 0.4; if (!ways.some(b => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.45)) ways.push(a); }
        for (const a of ways) {
          const ca = Math.cos(a), sa = Math.sin(a);
          for (let d = sq; d < RMAX; d += 0.04) street(x + ca * d, z + sa * d, x + ca * (d + 0.04), z + sa * (d + 0.04), d < R ? 0.022 : 0.017);
          for (let d = sq + 0.02; d < RMAX; d += 0.034 + Math.min(d, R) * 0.03) for (const side of [-1, 1]) {
            const off = 0.02 + r() * 0.004;
            lot(x + ca * d - sa * off * side, z + sa * d + ca * off * side, -a, d, -sa * side, ca * side);
          }
        }
        // (a bridge or two over the water it reaches: the narrowest crossings, well apart — each with its street on over it,
        //  built when the town reaches the far bank)
        const bridges = [];
        for (const g of gaps.sort((p, q) => p[3] - q[3])) {
          if (bridges.length >= 3 || bridges.some(b => { let da = Math.abs(b[0] - g[0]) % 6.283; if (da > Math.PI) da = 6.283 - da; return da < 1.1; })) continue;
          bridges.push(g); const [a, d1, d2] = g, ca = Math.cos(a), sa = Math.sin(a);
          slots.push([x + ca * d2, z + sa * d2, -a, (d2 < R ? d2 * 0.5 : R * 0.5 + (d2 - R) / shape(a)) - 0.001, 0, 0, d2 / R, g]);
          for (let d = d2; d < Math.min(RMAX, d2 + R * 2); d += 0.04) street(x + ca * d, z + sa * d, x + ca * (d + 0.04), z + sa * (d + 0.04), 0.017);
          for (let d = d2 + 0.03; d < Math.min(RMAX, d2 + R * 2); d += 0.036) for (const side of [-1, 1]) lot(x + ca * d - sa * 0.02 * side, z + sa * d + ca * 0.02 * side, -a, d, -sa * side, ca * side);
        }
        // (the lanes round: close in the old town, wider apart out past it, wandering a little)
        for (let rr = R * (NH0 > 60 ? 0.42 : 0.55); rr < RMAX; rr += rr < R ? R * 0.3 : 0.075 + r() * 0.03) {
          const N = Math.round(6.283 * rr / 0.034), wob = r() * 6.28, rp = i => { const a = i / N * 6.283, d = rr * (1 + Math.sin(a * 3 + wob) * 0.05); return [x + Math.cos(a) * d, z + Math.sin(a) * d]; };
          for (let i = 0; i < N; i++) { const [x0, z0] = rp(i), [x1, z1] = rp(i + 1); street(x0, z0, x1, z1, 0.013); }
          for (let i = 0; i < N; i++) for (const side of [-1, 1]) { const a = i / N * 6.283 + r() * 0.05, d = rr * (1 + Math.sin(a * 3 + wob) * 0.05) + side * 0.017, ca = Math.cos(a), sa = Math.sin(a); lot(x + ca * d, z + sa * d, -a + Math.PI / 2, d, ca * side, sa * side); }
        }
        // (and the blocks between filled in)
        for (let i = 0; i < (isHome ? 0 : CAP * 1.2); i++) { const a = r() * 6.283, d = sq + 0.03 + Math.sqrt(r()) * (RMAX - sq); lot(x + Math.cos(a) * d, z + Math.sin(a) * d, -a + (r() < 0.5 ? 0 : Math.PI / 2), d); }
        slots.sort((p, q) => p[3] - q[3]);
        const kept = [], keptAt = new Map(), items = []; let miss = 0;
        for (let [hx, hz, ang, , nx, nz, t, br, st] of slots) {
          if (kept.length >= CAP || miss > 500) break;
          if (st) {
            // (a piece of street: flat stones over the ground from one end to the other, sunk where the ground slopes)
            const [x0, z0, x1, z1, sw] = st, ym = this.groundY(hx, hz);
            if (ym < 0.006) continue;
            const lo = ym - 0.007, hi = ym + 0.0015;
            items.push({ parts: [putM(house, plaster, hx, lo, hz, -Math.atan2(z1 - z0, x1 - x0), Math.hypot(x1 - x0, z1 - z0) + 0.004, hi - lo, sw, STONE[(hash(Math.round(hx * 900), Math.round(hz * 900), 3) * 3) | 0])], py: lo, house: false });
            continue;
          }
          if (br) {
            // (a bridge: its deck from bank to bank, a little over the higher of them, on piers stood in the water)
            let [a, d1, d2] = br; const ca = Math.cos(a), sa = Math.sin(a);
            // (the banks found exactly: out from the near one till the water, back from the far one till the water)
            while (d1 < d2 && this.groundY(x + ca * (d1 + 0.004), z + sa * (d1 + 0.004)) >= 0.004) d1 += 0.004;
            while (d2 > d1 && this.groundY(x + ca * (d2 - 0.004), z + sa * (d2 - 0.004)) >= 0.004) d2 -= 0.004;
            const y1 = this.groundY(x + ca * d1, z + sa * d1), y2 = this.groundY(x + ca * d2, z + sa * d2);
            const dy = Math.max(y1, y2, 0.02) + 0.008, len = d2 - d1 + 0.04, mx = x + ca * (d1 + d2) / 2, mz = z + sa * (d1 + d2) / 2, parts = [];
            parts.push(putM(house, plaster, mx, dy - 0.006, mz, -a, len, 0.006, 0.024, 0xa89e8c));
            for (let d = d1 + 0.04; d < d2 - 0.02; d += 0.05) parts.push(putM(house, plaster, x + ca * d, -0.06, z + sa * d, -a, 0.009, dy + 0.054, 0.028, 0x958b7a));
            items.push({ parts, py: -0.06, house: false });
            continue;
          }
          const gk = (Math.floor(hx / 0.03) + 9999) * 99991 + Math.floor(hz / 0.03); let near = false;
          for (let u = -1; u <= 1 && !near; u++) for (let v = -1; v <= 1 && !near; v++) { const L = keptAt.get(gk + u * 99991 + v); if (L) near = L.some(([kx, kz]) => (kx - hx) * (kx - hx) + (kz - hz) * (kz - hz) < 0.00045); }
          if (near) continue;
          const core = Math.max(0, 1 - t * 1.4), w = 0.022 + r() * 0.008, l = 0.03 + r() * 0.016 + core * 0.01;
          hx += nx * l / 2; hz += nz * l / 2;
          if (onStreet(hx, hz)) continue;                                   // (the street kept clear)
          const hy = this.groundY(hx, hz), sx = nx || nz ? nx : 1, sz = nx || nz ? nz : 0; let hy2 = null;
          // (no house in the water, nor hung on a cliff)
          if (!ok(hx, hz, hy) || (t > 1 || terraced) && Math.abs(hy - (hy2 = this.groundY(hx + sx * 0.03, hz + sz * 0.03))) > (terraced ? 0.065 : 0.04)) { if (t > 1) miss++; continue; }
          // (on a slope, its footing goes down to the low side)
          const foot = terraced && hy2 != null ? Math.min(0.04, Math.max(0, hy - Math.min(hy2, this.groundY(hx - sx * 0.03, hz - sz * 0.03)))) : 0;
          miss = 0; kept.push([hx, hz]); (keptAt.get(gk) || keptAt.set(gk, []).get(gk)).push([hx, hz]);
          const ht = 0.018 + core * (0.016 + r() * 0.012) + r() * 0.005;
          const parts = [putM(house, plaster, hx, hy - 0.004 - foot, hz, ang, w, ht + 0.004 + foot, l, WALLS[(r() * WALLS.length) | 0])];
          const pal = north ? (r() < 0.55 ? SLATES : TILES) : t > 0.9 && r() < 0.35 ? THATCH : TILES;
          parts.push(putM(roof, roofing, hx, hy + ht, hz, ang, w * 1.18, (south ? 0.45 : 0.75) * w, l * 1.08, pal[(r() * pal.length) | 0]));
          items.push({ parts, py: hy - 0.004 - foot, house: true });
          // (out past the old town, a yard's trodden ground round each house — the fields kept clear for those to come)
          if (Math.hypot(hx - x, hz - z) > R) { this.clear(hx, hz, 0.09); if (kept.length <= NH) this.townGround(hx, hz, 0.05, groundBits, 1, 8, 0.45, hy); }
        }
        towns.set(name, { items, cap: CAP, shown: shownFor(items, NH) });
        this.clear(x, z, R * 1.15 + 0.04);
        // (and where a river runs through it: stone embankments along both banks, and boats tied up at them)
        if (!isHome && this.riverSeg) {
          const seen = new Set();
          for (let gx = Math.floor(x - R * 1.4); gx <= Math.floor(x + R * 1.4); gx++) for (let gz = Math.floor(z - R * 1.4); gz <= Math.floor(z + R * 1.4); gz++) {
            for (const sg of this.riverSeg.get(gx * 65536 + gz) || []) {
              if (seen.has(sg)) continue; seen.add(sg);
              const [x0, z0, x1, z1, hw] = sg, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0);
              if (Math.hypot(mx - x, mz - z) > R * 1.25 || L < 0.001) continue;
              const ux = (x1 - x0) / L, uz = (z1 - z0) / L, a = Math.atan2(uz, ux);
              for (const side of [-1, 1]) {
                const bx = mx - uz * (hw + 0.004) * side, bz = mz + ux * (hw + 0.004) * side, by = this.rawY(bx, bz);
                putM(house, plaster, bx, by - 0.012, bz, -a, L + 0.006, 0.02, 0.008, 0x9a917f);
                if (hash(Math.round(mx * 400), Math.round(mz * 400), side + 7) < 0.3) {
                  const wx = mx - uz * (hw - 0.011) * side, wz = mz + ux * (hw - 0.011) * side, wy = Math.max(0, this.rawY(mx, mz)) + 0.012;
                  putM(house, plaster, wx, wy - 0.003, wz, -a, 0.032, 0.008, 0.01, 0x4e3a2a);
                  putM(house, plaster, wx, wy + 0.004, wz, -a, 0.0025, 0.04, 0.0025, 0x3b2c20);
                }
              }
            }
          }
        }
        // the docks, where the town comes down to open water: a stone quay along the shore, wooden jetties run out from
        // it into the water, and boats tied up alongside them
        if (!isHome) {
          const shore = [];
          for (let k = 0; k < RAYS; k++) {
            if (harb[k] == null || harb[k] > R * 1.9) continue;
            const a = k / RAYS * 6.283, ca = Math.cos(a), sa = Math.sin(a); let d = Math.max(0.01, harb[k] - RS);
            while (d < harb[k] + RS * 2 && this.groundY(x + ca * d, z + sa * d) >= 0.004) d += 0.006;
            shore[k] = [x + ca * d, z + sa * d, a];
          }
          let jet = 0;
          for (let k = 0; k < RAYS; k++) {
            const p0 = shore[k]; if (!p0) continue;
            const p1 = shore[(k + 1) % RAYS];
            if (p1) { const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz); if (len < 0.18) putM(house, plaster, (p0[0] + p1[0]) / 2, -0.03, (p0[1] + p1[1]) / 2, -Math.atan2(dz, dx), len + 0.01, 0.042, 0.016, 0x8f877a); }
            if (k % 2 || jet >= 6) continue; jet++;
            const [sx, sz, a] = p0, ca = Math.cos(a), sa = Math.sin(a), L = 0.06 + r() * 0.06;
            putM(house, plaster, sx + ca * L / 2, -0.03, sz + sa * L / 2, -a, L, 0.038, 0.011, 0x6e5640);
            // (a boat or two at it: a hull, and its mast)
            for (const side of [-1, 1]) {
              if (r() < 0.35) continue;
              const t = L * (0.45 + r() * 0.4), bx = sx + ca * t - sa * 0.017 * side, bz = sz + sa * t + ca * 0.017 * side;
              putM(house, plaster, bx, -0.004, bz, -a, 0.034, 0.009, 0.011, 0x4e3a2a);
              putM(house, plaster, bx, 0.004, bz, -a, 0.0025, 0.045, 0.0025, 0x3b2c20);
            }
          }
        }
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
          if (this.groundY(sx, sz) < 0.004) continue;                    // (no wall out in the water: the harbour's open)
          m.scale.x = seg; m.position.set(sx, this.groundY(sx, sz) - 0.004, sz); m.rotation.y = -a - Math.PI / 2; put(m);
        }
        const B = wl >= 2 ? 8 : 6;
        for (let i = 0; i < B; i++) { const a = i / B * 6.283 + 0.3, bx = x + Math.cos(a) * (R + (wl >= 2 ? 0.012 : 0.004)), bz = z + Math.sin(a) * (R + (wl >= 2 ? 0.012 : 0.004)), m = new THREE.Mesh(bastion, masonry); if (this.groundY(bx, bz) < 0.004) continue; m.position.set(bx, this.groundY(bx, bz) - 0.004, bz); m.rotation.y = -a + Math.PI / 4; if (wl >= 2) m.scale.set(1.4, 1, 1.4); put(m); }
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
      sprite.userData = { rank, city: isHome ? null : name, y0, w: w / 256, pop: pop || 0, own };
      grp.add(sprite); labels.push(sprite);
    };
    // (nearest the eye first; and the first time the map is opened, those few shown as soon as they're laid out, rather
    //  than an empty country for the ten seconds the whole of Europe's towns take)
    const near = (ct => { const [x, z] = toWorld(ct[1], ct[2]); return (x - this.target.x) ** 2 + (z - this.target.z) ** 2; });
    const order = CITIES.map(ct => [near(ct), ct]).sort((a, b) => a[0] - b[0]).map(e => e[1]);
    let early = null;
    const showEarly = () => {
      const eg = new THREE.Group(), hide = new Map();
      for (const T of towns.values()) for (let i = T.shown; i < T.items.length; i++) for (const [b, k] of T.items[i].parts) (hide.get(b) || hide.set(b, new Set()).get(b)).add(k);
      for (const b of kinds.values()) { const H = hide.get(b), im = new THREE.InstancedMesh(b.geo, b.mat, b.mats.length); b.mats.forEach((m, i) => { im.setMatrixAt(i, H && H.has(i) ? ZERO : m); if (b.mat === plaster || b.mat === roofing) im.setColorAt(i, _c.setHex(b.cols[i])); }); im.computeBoundingSphere(); eg.add(im); }
      this.scene.add(eg); return eg;
    };
    // (the names, too, as each is placed: the group itself put up at once when there's none before it)
    if (!this.cityGroup) { this.scene.add(grp); this.labels = labels; }
    for (let n = 0; n < order.length; n++) { const ct = order[n]; place(ct[0], ct[1], ct[2], ct[3], cityOwner(this.g, ct), false); if (n === 7 && !this.cityGroup && !early) early = showEarly(); yield; }
    // (your own clearing — not on a campaign's map, which has none)
    if (this.homeName !== null) { const [hlon, hlat] = toLL((HOME.mx + 0.5) * CELL, (HOME.my + 0.5) * CELL); place(this.homeName || "Forester's Clearing", hlon, hlat, 1, null, true); }
    if (this.roadEdges) { yield* this.buildRoads(this.roadEdges); this.roadEdges = null; }
    for (const b of kinds.values()) { const im = b.im = new THREE.InstancedMesh(b.geo, b.mat, b.mats.length); b.mats.forEach((m, i) => { im.setMatrixAt(i, m); if (b.mat === plaster || b.mat === roofing) im.setColorAt(i, _c.setHex(b.cols[i])); }); im.computeBoundingSphere(); grp.add(im); }
    // (what a town hasn't built yet, out of sight till it does)
    for (const T of towns.values()) for (let i = T.shown; i < T.items.length; i++) for (const [b, k] of T.items[i].parts) b.im.setMatrixAt(k, ZERO);
    if (groundBits.pos.length) {
      const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(groundBits.pos, 3)); gg.setAttribute("color", new THREE.Float32BufferAttribute(groundBits.col, 4)); gg.setIndex(groundBits.idx); gg.computeVertexNormals();
      const gm = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      gm.renderOrder = 1; gm.isTownGround = true; grp.add(gm);
    }
    // (the new towns in place of the old)
    if (this.cityGroup) { this.scene.remove(this.cityGroup); this.cityGroup.traverse(o => { if (o.isInstancedMesh) { o.dispose(); o.geometry.dispose(); o.material.dispose(); } if (o.isTownGround) { o.geometry.dispose(); o.material.dispose(); } if (o.isSprite) { o.material.map && o.material.map.dispose(); o.material.dispose(); } }); }
    // (the woods round the towns planted again only if the clearings they leave for the towns have changed: a town that
    //  has only changed hands leaves its woods as they were)
    const sig = M => { if (!M) return null; let h = 0; for (const [k, L] of M) for (const [x, z, r] of L) h = (h + (((k % 1000003) * 31 + Math.round(x * 100) * 7 + Math.round(z * 100) * 13 + Math.round(r * 1000)) * 2654435761 % 4294967291)) % 9007199254740881; return h; };   // (order-free: the towns are laid nearest the view first)
    const sameClear = !!this.clearings && !!this._clearNext && this.clearings.size === this._clearNext.size && sig(this.clearings) === sig(this._clearNext);
    this.cityGroup = grp; this.labels = labels; this.towns = towns; this.growing = []; this.clearings = this._clearNext; this._clearNext = null;
    if (!sameClear) { for (const c of this.cells.values()) c.forEach(m => this.scene.remove(m)); this.cells.clear(); }
    this.scene.add(grp);
    if (early) { this.scene.remove(early); for (const im of early.children) im.dispose(); }
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
      if (arm || swords) sp.userData.over = { y0, stack: arm ? 1 : 0 };
      sp.userData.name = m.name;
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
    // (each ship kept from one year to the next: moved, she sails there by her course round the coasts and comes about
    //  as she goes — she once vanished and was made again where she'd got to)
    if (!this.fleetGroup) { this.fleetGroup = new THREE.Group(); this.scene.add(this.fleetGroup); }
    const M = (this.fleetMap ||= new Map()), seen = new Set(), now = performance.now(), grp = this.fleetGroup;
    const dropSp = F => { if (F.sp) { grp.remove(F.sp); F.sp.material.map.dispose(); F.sp.material.dispose(); F.sp = null; } };
    for (const f of list) {
      seen.add(f.name);
      // (a squadron, not a lone ship: one hull for every two in the fleet, up to three, the others astern in echelon)
      const hulls = Math.max(1, Math.min(3, Math.ceil((f.n | 0) / 2)));
      const look = f.color + "|" + !!f.mine + "|" + !!this.fleetModel + "|" + hulls, [x, z] = toWorld(f.lon, f.lat);
      let F = M.get(f.name);
      if (F && F.look !== look) { grp.remove(F.ship); dropSp(F); M.delete(f.name); F = null; }
      if (!F) {
        const ship = new THREE.Group(); ship.position.set(x, 0, z); ship.rotation.y = f.yaw || 0; ship.userData.fleet = true;
        const SLOTS = [[0, 0], [-9, -24], [9, -30]], hullsG = [];
        for (let h = 0; h < hulls; h++) {
          const hg = new THREE.Group(); hg.position.set(SLOTS[h][0], 0, SLOTS[h][1]);
          const m = modelCopy("ship");
          if (m) { m.scene.position.z = -2.4; m.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; if (o.material && /flag/.test(o.material.name || "")) { o.material = o.material.clone(); o.material.color.set(f.color); } } }); hg.add(m.scene); }
          else { const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 24), new THREE.MeshStandardMaterial({ color: 0x5a3e28 })); hull.position.y = 1; hg.add(hull); }
          // (her wake: a pale vee of foam spreading behind her, seen only while she's under way)
          const wk = new THREE.Mesh(wakeGeo(), new THREE.MeshBasicMaterial({ map: wakeTex(), transparent: true, opacity: 0, depthWrite: false })); wk.userData.wake = true; wk.renderOrder = 2;
          wk.rotation.x = -Math.PI / 2; wk.position.set(0, 0.6, -24); hg.add(wk);
          hg.userData.roll = h * 1.7; ship.add(hg); hullsG.push(hg);
        }
        ship.userData.hulls = hullsG;
        const pen = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.6), new THREE.MeshBasicMaterial({ color: f.color, side: THREE.DoubleSide })); pen.geometry.translate(3.5, 0, 0); pen.position.set(0, 25, 2.5); pen.rotation.y = Math.PI / 2; ship.add(pen);
        grp.add(ship); F = { ship, look, to: [x, z], face: f.yaw || 0, n: null, sp: null, glide: null }; M.set(f.name, F);
      } else if (Math.hypot(F.to[0] - x, F.to[1] - z) > 0.02) {
        const from = [F.ship.position.x, F.ship.position.z], via = (f.via || []).map(([lo, la]) => toWorld(lo, la));
        const pts = [from, ...via.slice(1, -1), [x, z]], segs = []; let L = 0;
        for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); segs.push(d); L += d; }
        F.glide = L > 0.01 && L < 400 ? { pts, segs, L, t0: now, dur: 1400 + Math.min(2600, L * 45) } : null;
        if (!F.glide) F.ship.position.set(x, 0, z);
      }
      // (bound somewhere: she heads that way; lying at anchor, she keeps the heading she came in on)
      F.to = [x, z]; if (f.bound || F.n == null) F.face = f.yaw || 0; F.bound = !!f.bound; this.chosenRing(F.ship, f.chosen, 18);
      if (F.n !== f.n) {
        F.n = f.n; dropSp(F);
        const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d"), ink = f.mine ? "#2a1c10" : "#7a2216";
        c.font = "italic bold 22px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 6; c.strokeText(String(f.n), 32, 32); c.fillStyle = ink; c.fillText(String(f.n), 32, 32);
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        const sp = F.sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true })); sp.scale.set(0.05, 0.05, 1); sp.renderOrder = 7; sp.userData.over = F.ship; grp.add(sp);
      }
    }
    for (const [k, F] of M) if (!seen.has(k)) { grp.remove(F.ship); dropSp(F); M.delete(k); }
  }
  // the towns under siege: the lines dug round them, the besiegers' tents along the lines, and the smoke drifting off the
  //  batteries — [{ name, lon, lat, rank, color, years, breach }]. (The tents and guns are kept the same size on the
  //  view as the companies are; the lines are dug in the land itself, so they're the town's size.)
  sieges(list) {
    const key = JSON.stringify(list); if (key === this.siegeKey) return; this.siegeKey = key;
    if (this.siegeGroup) { this.scene.remove(this.siegeGroup); this.siegeGroup.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }
    const grp = this.siegeGroup = new THREE.Group(); this.scene.add(grp); grp.userData.smoke = []; grp.userData.props = [];
    if (!list.length) return;
    const earth = new THREE.MeshStandardMaterial({ color: 0x5e4a30, roughness: 1 }), canvasM = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.95 });
    const tentG = new THREE.ConeGeometry(0.55, 0.9, 4); tentG.translate(0, 0.45, 0); tentG.rotateY(Math.PI / 4);
    const gunG = new THREE.BoxGeometry(0.9, 0.35, 0.5); gunG.translate(0, 0.18, 0);
    const smokeT = smokeTex();
    for (const S of list) {
      // (a battlefield of the year: only the smoke drifting off it, where the armies met)
      if (S.field) {
        const [fx, fz] = toWorld(S.lon, S.lat);
        for (let k = 0; k < 5; k++) {
          const ox = Math.cos(k * 2.4) * 0.12, oz = Math.sin(k * 2.4) * 0.08, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeT, transparent: true, depthWrite: false, opacity: 0, color: 0xd8d2c6 }));
          sp.userData.base = [fx + ox, this.groundY(fx + ox, fz + oz), fz + oz]; sp.userData.phase = k / 5; sp.renderOrder = 3; grp.add(sp); grp.userData.smoke.push(sp);
        }
        continue;
      }
      const [cx, cz] = toWorld(S.lon, S.lat), r = 0.34 + S.rank * 0.1, cm = new THREE.MeshStandardMaterial({ color: S.color, roughness: 0.9 });
      // (the lines: a bank of earth all the way round, a little outside the houses — not a ring but a line of
      //  redoubts, jogging out and back as the engineers dug it to the ground)
      const segs = 56, rad = a => r * (1 + 0.07 * Math.sin(a * 9) + 0.04 * Math.sin(a * 4 + S.rank));
      const pt = a => [cx + Math.cos(a) * rad(a), cz + Math.sin(a) * rad(a)];
      for (let i = 0; i < segs; i++) {
        const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2, [x0, z0] = pt(a0), [x1, z1] = pt(a1), len = Math.hypot(x1 - x0, z1 - z0) * 1.1, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.01, 0.022), earth); b.position.set(x, this.groundY(x, z) + 0.004, z); b.rotation.y = -Math.atan2(z1 - z0, x1 - x0); grp.add(b);
      }
      // (the camp: three of them behind the lines, tents crowded together, a few in the besieger's colours)
      for (let c = 0; c < 3; c++) {
        const ca = c / 3 * Math.PI * 2 + 1.3, n = 5 + S.rank;
        for (let i = 0; i < n; i++) {
          const a = ca + (i - n / 2) * 0.09, rr = rad(a) + 0.09 + (i % 3) * 0.045, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
          const t = new THREE.Mesh(tentG, i % 4 === 0 ? cm : canvasM); t.userData.shared = true; t.position.set(x, this.groundY(x, z), z); t.rotation.y = a; t.userData.unit = 1; grp.add(t); grp.userData.props.push(t);
        }
      }
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2 + 0.6, x = cx + Math.cos(a) * (r - 0.04), z = cz + Math.sin(a) * (r - 0.04);
        const g = new THREE.Mesh(gunG, new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.6, metalness: 0.3 })); g.position.set(x, this.groundY(x, z), z); g.rotation.y = -a; g.userData.unit = 1; grp.add(g); grp.userData.props.push(g);
        for (let k = 0; k < 4; k++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeT, transparent: true, depthWrite: false, opacity: 0, color: 0xdedad2 }));
          sp.userData.base = [x, this.groundY(x, z), z]; sp.userData.phase = (k / 4 + i * 0.37) % 1; sp.renderOrder = 3; grp.add(sp); grp.userData.smoke.push(sp);
        }
      }
    }
  }
  // the armies on the land: a company of its own men in its own coats, drawn up in two ranks under its colours —
  //  stepping out on the march, standing at ease when it's halted — kept the same size on the view, as the fleets are.
  //  [{ key, lon, lat, color, n, mine, body, colors, flag (a canvas, or null), march, glon, glat, nw, via ([[lon, lat]…],
  //  the road it came by when it has just moved) }]
  //  (each company is made once and kept: moved, it walks there along its road and turns as it goes, and only a new
  //  coat or a new count is made again — every order once cloned all their men afresh, and they jumped where they went)
  armies(list) {
    const key = JSON.stringify(list.map(a => ({ ...a, flag: !!a.flag }))); if (key === this.armyKey && this.armyReady) return; this.armyKey = key;
    const bodies = [...new Set(list.map(a => a.body))];
    if (!this.armyReady) Promise.all([...bodies, "musket"].map(b => ensureModel(b))).then(() => { if (!this.armyReady) { this.armyReady = true; this.armyKey = null; this.armies(list); } });
    if (!this.armyGroup) { this.armyGroup = new THREE.Group(); this.scene.add(this.armyGroup); }
    const M = (this.armyMap ||= new Map()), seen = new Set(), now = performance.now();
    for (const A of list) {
      seen.add(A.key);
      const look = JSON.stringify([A.body, A.colors, !!A.nw, !!A.flag, !!A.mine, !!this.armyReady]);
      let R = M.get(A.key);
      if (R && R.look !== look) { this.dropCompany(R); M.delete(A.key); R = null; }
      const [x, z] = toWorld(A.lon, A.lat);
      if (!R) { R = this.makeCompany(A); R.look = look; R.co.position.set(x, 0, z); M.set(A.key, R); }
      else if (Math.hypot(R.to[0] - x, R.to[1] - z) > 0.02) {
        // (on the march: from where it stands now — mid-way, if it was already going — along its road, or straight)
        const from = [R.co.position.x, R.co.position.z], via = (A.via || []).map(([lo, la]) => toWorld(lo, la));
        const pts = [from, ...via.slice(1, -1), [x, z]], segs = []; let L = 0;
        for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); segs.push(d); L += d; }
        R.glide = L > 0.01 && L < 200 ? { pts, segs, L, t0: now, dur: 1400 + Math.min(2200, L * 70) } : null;
        if (!R.glide) R.co.position.set(x, 0, z);
      }
      R.to = [x, z];
      // (standing in a town: drawn a little in front of it, toward the eye, so the town's name doesn't hide it)
      if (this.townXZSheet !== SHEET) { this.townXZSheet = SHEET; this.townXZ = CITIES.map(c => [...toWorld(c[1], c[2]), c[3] | 0]); }
      // (out past the houses: further for a great city, whose streets spread wider, than for a market town)
      { const t = this.townXZ.find(([tx, tz]) => Math.hypot(tx - x, tz - z) < 0.35); R.nudge = t ? TOWN_CLEAR + t[2] * 0.12 : 0; }
      // (which way it faces when it isn't walking: toward where it's bound, or as it last went)
      if (A.march && A.glon != null) { const [gx, gz] = toWorld(A.glon, A.glat); R.face = Math.atan2(gx - x, gz - z); }
      R.march = !!A.march; this.stride(R);
      this.routeLine(R, A); this.chosenRing(R.inner, A.chosen, A.nw ? 3.2 : 3.4);
      if (R.n !== A.n) { R.n = A.n; this.countSprite(R, A); }
    }
    for (const [k, R] of M) if (!seen.has(k)) { this.dropCompany(R); M.delete(k); }
  }
  // (the road a marching army is on, to where it's bound: dashed along the ground, in ink for yours and red for an
  //  enemy's, as the parchment map draws it)
  routeLine(R, A) {
    R.routeA = A.route ? A : null; if (this.routeDist == null) this.routeDist = this.dist;
    const rk = A.route ? JSON.stringify(A.route) : ""; if (rk === R.routeKey) return; R.routeKey = rk;
    if (R.line) { this.armyGroup.remove(R.line); R.line.geometry.dispose(); R.line.material.dispose(); R.line = null; }
    if (!A.route || A.route.length < 2) return;
    // (a ribbon of dashes laid on the ground — a line one pixel wide was lost on the land — and an arrowhead at its end;
    //  its width and its dashes in proportion to how far off the eye is, drawn again when that changes much)
    const W = A.route.map(([lo, la]) => toWorld(lo, la)), P = [], hw = Math.max(0.025, this.dist * 0.0028), step = hw * 2.2;
    for (let k = 1; k < W.length; k++) { const [ax, az] = W[k - 1], [bx, bz] = W[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step)); for (let i = k === 1 ? 0 : 1; i <= n; i++) P.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); }
    const pts = [], idx = [], yAt = (x, z) => Math.max(0.005, this.rawY(x, z)) + 0.035;
    for (let i = 0; i < P.length; i++) {
      const [x, z] = P[i], [xa, za] = P[Math.max(0, i - 1)], [xb, zb] = P[Math.min(P.length - 1, i + 1)]; let dx = xb - xa, dz = zb - za; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const y = yAt(x, z), n = pts.length / 3; pts.push(x - dz * hw, y, z + dx * hw, x + dz * hw, y, z - dx * hw);
      // (three steps drawn, two left out: the dashes)
      if (i && i % 5 < 3 && i < P.length - 4) idx.push(n - 2, n - 1, n, n - 1, n + 1, n);
    }
    // (the arrowhead: where it's bound)
    if (P.length > 2) { const [x, z] = P[P.length - 1], [xa, za] = P[Math.max(0, P.length - 4)]; let dx = x - xa, dz = z - za; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; const L = hw * 7, Wd = hw * 4, n = pts.length / 3, y = yAt(x, z);
      pts.push(x, y, z, x - dx * L - dz * Wd, y, z - dz * L + dx * Wd, x - dx * L + dz * Wd, y, z - dz * L - dx * Wd); idx.push(n, n + 1, n + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex(idx);
    const line = R.line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: A.mine ? 0x2a1c10 : 0x9a2a18, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.renderOrder = 3; line.userData.route = true; this.armyGroup.add(line);
  }
  // (the one in hand: a ring of gold on the ground about it, as the parchment marks it)
  chosenRing(holder, on, r) {
    if (!!holder.userData.ring === !!on) return;
    if (on) { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0cf6a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 })); m.position.y = r * 0.12; m.renderOrder = 4; m.userData.own = true; holder.add(m); holder.userData.ring = m; }
    else { const m = holder.userData.ring; holder.remove(m); m.geometry.dispose(); m.material.dispose(); holder.userData.ring = null; }
  }
  // (walking — on the march, or on its way across the view — or standing at ease: the step faded in or out, not cut)
  stride(R) {
    const walk = R.march || !!R.glide; if (R.walking === walk) return; R.walking = walk;
    for (const m of R.men) { const on = walk ? m.walk : m.idle, off = walk ? m.idle : m.walk; if (on) { on.enabled = true; on.setEffectiveWeight(1); on.fadeIn(0.35); on.play(); } if (off) off.fadeOut(0.35); }
  }
  countSprite(R, A) {
    if (R.sp) { this.armyGroup.remove(R.sp); R.sp.material.map && R.sp.material.map.dispose(); R.sp.material.dispose(); }
    // (how many regiments, written over them in italic: in ink for yours, red for an enemy's)
    const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d"), ink = A.mine ? "#2a1c10" : "#7a2216";
    c.font = "italic bold 22px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 6; c.strokeText(String(A.n), 32, 32); c.fillStyle = ink; c.fillText(String(A.n), 32, 32);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = R.sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true })); sp.scale.set(0.045, 0.045, 1); sp.renderOrder = 7; sp.userData.over = R.co; this.armyGroup.add(sp);
  }
  dropCompany(R) {
    if (R.line) { this.armyGroup.remove(R.line); R.line.geometry.dispose(); R.line.material.dispose(); R.line = null; }
    this.armyGroup.remove(R.co); if (R.sp) { this.armyGroup.remove(R.sp); R.sp.material.map && R.sp.material.map.dispose(); R.sp.material.dispose(); }
    for (const m of R.men) m.mixer.stopAllAction();
    R.co.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const mt of ms) if (o.userData.own || (mt.userData && mt.userData.own)) { mt.map && o.userData.own && mt.map.dispose(); mt.dispose(); } if (/^merged_/.test(o.name) || o.userData.own) { o.geometry && o.geometry.dispose(); if (o.skeleton) o.skeleton.dispose(); } });
  }
  makeCompany(A) {
    const co = new THREE.Group(); co.userData.army = true; const R = { co, men: [], to: [0, 0], face: 0, n: null, sp: null, glide: null, walking: null, inner: new THREE.Group(), nudge: 0 };
    co.add(R.inner); const coAdd = (...o) => R.inner.add(...o);
    // (its men: two ranks of five, or a war party in open order; each in the coats of its own crown)
    const mats = {}, men = A.nw ? 7 : 10;
    for (let i = 0; i < men; i++) {
      const m = this.armyReady && modelCopy(A.body); if (!m) break;
      m.scene.traverse(o => {
        if (!o.isMesh || !o.material) return; o.castShadow = false; o.frustumCulled = false;
        const part = o.material.userData.part, want = A.colors[part === "beard" || part === "tash" ? "hair" : part]; if (want == null) return;
        if (!mats[part]) {
          const Mt = mats[part] = o.material.clone(); Mt.userData = { ...o.material.userData, own: true }; Mt.color.set(want);
          // (a part painted in its vertices: the colour divided by what's painted, so it's the colour that shows)
          const vc = o.material.vertexColors && o.geometry.attributes.color; if (vc) { let r = 0, g = 0, b = 0; const C = o.geometry.attributes.color, n = C.count; for (let k = 0; k < n; k += 7) { r += C.getX(k); g += C.getY(k); b += C.getZ(k); } const c = Math.ceil(n / 7); Mt.color.r /= Math.max(0.04, r / c); Mt.color.g /= Math.max(0.04, g / c); Mt.color.b /= Math.max(0.04, b / c); }
        }
        o.material = mats[part];
      });
      try { mergeRig(m.scene); } catch (e) {}
      const file = i % 5, rank = Math.floor(i / 5);
      if (A.nw) m.scene.position.set(Math.sin(i * 2.39) * 1.9, 0, Math.cos(i * 1.71) * 1.1);
      else m.scene.position.set((file - 2) * 0.85, 0, -rank * 1.05);
      // (the musket shouldered, upright at his right side)
      if (!A.nw) { const g = makeMusket(); if (g) { g.position.set(-0.24, 0.86, 0.02); g.rotation.x = -0.12; g.traverse(o => { if (o.isMesh) o.castShadow = false; }); m.scene.add(g); } }
      coAdd(m.scene);
      const mixer = new THREE.AnimationMixer(m.scene), cw = m.animations.find(a => a.name === "Walk"), ci = m.animations.find(a => a.name === "Idle");
      const walk = cw && mixer.clipAction(cw), idle = ci && mixer.clipAction(ci);
      for (const a of [walk, idle]) if (a) { a.time = (i * 0.37) % a.getClip().duration; a.enabled = false; }
      R.men.push({ mixer, walk, idle });
    }
    // (its colours, carried at the right of the front rank)
    if (!A.nw) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 3.1, 6), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 })); pole.userData.own = true; pole.position.set(2.55, 1.55, 0.15); coAdd(pole);
      const tex = A.flag ? new THREE.CanvasTexture(A.flag) : null; if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.78), new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : A.color, side: THREE.DoubleSide, roughness: 0.95 })); cloth.userData.own = true;
      cloth.geometry.translate(0.575, 0, 0); cloth.position.set(2.57, 2.7, 0.15); cloth.rotation.y = -0.35; coAdd(cloth); co.userData.cloth = cloth;
    }
    this.armyGroup.add(co);
    return R;
  }
  // look at a place: lon, lat, and how far off
  look(lon, lat, dist) { const [x, z] = toWorld(lon, lat); this.target.set(x, 0, z); if (dist) this.dist = dist; }
  centreLL() { return toLL(this.target.x, this.target.z); }
  size(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.w = w; this.h = h; }
  frame() {
    sync();
    { const t = performance.now() / 1000; for (const m of [this.seaMat, this.groundMat]) if (m && m.userData.shader) m.userData.shader.uniforms.uTime.value = t; }
    // (the near plane drawn back as the eye goes up, so the sea and the low coast don't fight over the same depth)
    const nr = Math.max(0.01, this.dist * 0.004); if (Math.abs(this.camera.near - nr) > nr * 0.1) { this.camera.near = nr; this.camera.updateProjectionMatrix(); }
    if (!this.visible || !this.g) return;
    this.buildDetail(); this.treesNear(); this.raise();
    if (this.riverPix) this.riverPix.value = this.dist * 0.0011;
    // (the roads: never thinner on the view than a hair, and gone into the haze when you're high over all Europe)
    if (this.roads) { this.roadPix.value = this.dist * 0.0005; this.roadLift.value = this.dist * 0.0004; this.roads.material.opacity = Math.max(0, Math.min(1, (75 - this.dist) / 35)); this.roads.visible = this.dist < 75; }
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
    // (and no name written over another: where two would overlap on the view, the greater town's kept, the lesser's left
    //  off till the eye comes nearer)
    if (this.labels.length) {
      const P = this.camera.projectionMatrix.elements, sx = P[0], sy = P[5], kept = [];
      const mine = l => (this.me && l.userData.own === this.me ? 1 : 0), L = this.labels.filter(l => l.visible).sort((a, b) => b.userData.rank - a.userData.rank || mine(b) - mine(a) || b.userData.pop - a.userData.pop);
      for (const l of L) {
        _lv.copy(l.position).project(this.camera); if (_lv.z > 1) continue;
        const hw = l.scale.x * (l.userData.w || 1) * sx * 0.5, hh = l.scale.y * 0.62 * sy * 0.5;
        if (kept.some(k => Math.abs(k[0] - _lv.x) < k[2] + hw && Math.abs(k[1] - _lv.y) < k[3] + hh)) { l.visible = false; continue; }
        kept.push([_lv.x, _lv.y, hw, hh]);
      }
    }
    // (the marks over a town — swords where you can march, an army's count — kept just over its name however far off
    //  the eye is: a fixed height over the ground had them across the name once the view was drawn back)
    if (this.markGroup) for (const sp of this.markGroup.children) { const u = sp.userData.over; if (!u) continue; const d = this.camera.position.distanceTo(sp.position); sp.position.y = u.y0 + lift + (0.024 + sp.scale.y / 2 + u.stack * 0.036) * d; }
    // (the fleets kept the same size on the view however near or far: a ship's length about a twentieth of its height)
    // (the ships under way across the view, as the armies: along their course, easing off and coming to, turned as they go)
    if (this.fleetMap) { const now = performance.now(), dt = Math.min(0.1, (now - (this.fleetT || now)) / 1000); this.fleetT = now;
      for (const F of this.fleetMap.values()) {
        let want = F.face;
        if (F.glide) {
          const G = F.glide, q = Math.min(1, (now - G.t0) / G.dur), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
          let d = e * G.L, s = 0; while (s < G.segs.length - 1 && d > G.segs[s]) { d -= G.segs[s]; s++; }
          const [ax, az] = G.pts[s], [bx, bz] = G.pts[s + 1], f = G.segs[s] ? Math.min(1, d / G.segs[s]) : 1;
          F.ship.position.x = ax + (bx - ax) * f; F.ship.position.z = az + (bz - az) * f;
          if (q < 0.98) want = Math.atan2(bx - ax, bz - az);
          if (q >= 1) { F.glide = null; F.ship.position.x = F.to[0]; F.ship.position.z = F.to[1]; if (!F.bound) F.face = F.ship.rotation.y; }
        }
        const r0 = F.ship.rotation.y; F.ship.rotation.y = r0 + Math.atan2(Math.sin(want - r0), Math.cos(want - r0)) * Math.min(1, dt * 3);
        // (each hull rolling a little on the swell, and her wake showing as she makes way)
        const way = F.glide ? Math.min(1, Math.min((now - F.glide.t0) / 600, (F.glide.t0 + F.glide.dur - now) / 900)) : 0;
        for (const hg of F.ship.userData.hulls || []) {
          hg.rotation.z = Math.sin(now / 1100 + hg.userData.roll) * 0.05; hg.rotation.x = Math.sin(now / 1500 + hg.userData.roll * 0.7) * 0.025;
          for (const c of hg.children) if (c.userData.wake) { const o = c.material.opacity + (Math.max(0, way) * 0.75 - c.material.opacity) * Math.min(1, dt * 3); c.material.opacity = o; c.visible = o > 0.01; }
        }
      } }
    this.hearths(); this.anchorages();
    if (this.seaGroup) { const o = Math.max(0, Math.min(1, (this.dist - 13) / 12)); this.seaGroup.visible = o > 0.01; if (o !== this._seaO) { this._seaO = o; for (const m of this.seaGroup.children) m.material.opacity = o; } }
    if (this.siegeGroup && this.siegeGroup.children.length) {
      const k = unitDist(this.dist) * ARMY_K * 0.9, now = performance.now() / 1000;
      for (const o of this.siegeGroup.userData.props) o.scale.setScalar(k);
      for (const sp of this.siegeGroup.userData.smoke) {
        const ph = (now * 0.12 + sp.userData.phase) % 1, [x, y, z] = sp.userData.base;
        sp.position.set(x + ph * k * 2.5, y + k * (0.6 + ph * 3.2), z - ph * k * 1.2); sp.scale.setScalar(k * (1.6 + ph * 3.6)); sp.material.opacity = Math.sin(ph * Math.PI) * 0.8;
      }
    }
    if (this.fleetGroup) { const k = unitDist(this.dist) * FLEET_K; for (const o of this.fleetGroup.children) { if (o.userData.fleet) o.scale.setScalar(k); else if (o.userData.over) o.position.set(o.userData.over.position.x, k * 38, o.userData.over.position.z); } }
    // (the armies the same: a man about a fiftieth of the view's height, standing on the ground where he is; and their
    //  steps, their breathing, their colours stirring)
    if (this.armyGroup) {
      const now = performance.now(), dt = Math.min(0.1, (now - (this.armyT || now)) / 1000); this.armyT = now;
      const k = unitDist(this.dist) * ARMY_K;
      // (the companies on the march across the view: along their road, starting off and drawing up gently, turned the
      //  way they go — and the turn itself eased, not snapped)
      for (const R of (this.armyMap || new Map()).values()) {
        let want = R.face;
        if (R.glide) {
          const G = R.glide, q = Math.min(1, (now - G.t0) / G.dur), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
          let d = e * G.L, s = 0; while (s < G.segs.length - 1 && d > G.segs[s]) { d -= G.segs[s]; s++; }
          const [ax, az] = G.pts[s], [bx, bz] = G.pts[s + 1], f = G.segs[s] ? Math.min(1, d / G.segs[s]) : 1;
          R.co.position.x = ax + (bx - ax) * f; R.co.position.z = az + (bz - az) * f;
          if (q < 0.98) want = Math.atan2(bx - ax, bz - az);
          if (q >= 1) { R.glide = null; R.co.position.x = R.to[0]; R.co.position.z = R.to[1]; this.stride(R); }
        }
        const r0 = R.co.rotation.y; R.co.rotation.y = r0 + Math.atan2(Math.sin(want - r0), Math.cos(want - r0)) * Math.min(1, dt * 6);
        { const ry = R.co.rotation.y, d = R.glide ? 0 : R.nudge / k, cur = R.inner.userData.d || 0, nd = cur + (d - cur) * Math.min(1, dt * 4); R.inner.userData.d = nd; const wx = nd * 0.6, wz = nd * 0.8; R.inner.position.set(Math.cos(ry) * wx - Math.sin(ry) * wz, 0, Math.sin(ry) * wx + Math.cos(ry) * wz); }
      }
      for (const o of this.armyGroup.children) {
        if (o.userData.army) { o.scale.setScalar(k); o.position.y = Math.max(0, this.groundY(o.position.x, o.position.z)); const cl = o.userData.cloth; if (cl) cl.rotation.y = -0.35 + Math.sin(now / 700 + o.position.x) * 0.18; }
        else if (o.userData.over) {
          // (over a town, the number would be written across the town's name: set beside the name instead)
          const c = o.userData.over.position, lab = this.dist > 2.6 && this.labels && this.labels.find(l => l.visible && Math.abs(l.position.x - c.x) < 0.6 && Math.abs(l.position.z - c.z) < 0.6);
          // (far off, where the names crowd one another, over the name instead)
          if (lab) { const d = this.camera.position.distanceTo(lab.position); if (this.dist < 30) o.position.set(lab.position.x + (lab.scale.x * (lab.userData.w || 1) / 2 + 0.022) * d, lab.position.y, lab.position.z); else o.position.set(lab.position.x, lab.position.y + 0.046 * d, lab.position.z); }
          else o.position.set(c.x, c.y + k * 3.6, c.z);
        }
      }
      for (const R of (this.armyMap || new Map()).values()) for (const m of R.men) m.mixer.update(dt);
      // (the routes laid again for the new distance, when the eye has come much nearer or gone much further off)
      if (this.armyMap && Math.abs(Math.log((this.dist + 1) / ((this.routeDist || this.dist) + 1))) > 0.35) { this.routeDist = this.dist; for (const R of this.armyMap.values()) if (R.routeA) { R.routeKey = null; this.routeLine(R, R.routeA); } }
    }
    this.renderer.render(this.scene, this.camera);
  }
  // the company under a point on the view, by where it's drawn (stepped out in front of a town, walking): its key, or null
  armyAt(px, py, reach = 34) {
    if (!this.armyMap) return null; let best = null, bd = reach; const v = new THREE.Vector3(), lift = unitDist(this.dist) * ARMY_K * 0.9;
    for (const [k, R] of this.armyMap) { R.inner.getWorldPosition(v); v.y += lift; v.project(this.camera); if (v.z > 1) continue; const d = Math.hypot((v.x + 1) / 2 * this.w - px, (1 - v.y) / 2 * this.h - py); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  // the fleet under a point on the view, by where her ship is drawn: its name, or null
  fleetAt(px, py, reach = 30) {
    if (!this.fleetMap) return null; let best = null, bd = reach; const v = new THREE.Vector3(), lift = unitDist(this.dist) * FLEET_K * 10;
    // (any ship of the squadron, not only the one leading it)
    for (const [k, F] of this.fleetMap) for (const hg of F.ship.userData.hulls || [F.ship]) { hg.getWorldPosition(v); v.y += lift; v.project(this.camera); if (v.z > 1) continue; const d = Math.hypot((v.x + 1) / 2 * this.w - px, (1 - v.y) / 2 * this.h - py); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  // the towns' hearths, close in: thin smoke going up from the chimneys of the towns near the middle of the view and
  //  leaning away on the west wind — a few columns to a town, more to a city; a pool of them, moved from town to town
  //  as the view goes
  hearths() {
    const far = this.dist > 9.5 || !this.cityGroup;
    if (far) { if (this.hearthGrp) this.hearthGrp.visible = false; return; }
    if (!this.hearthGrp) {
      const g = this.hearthGrp = new THREE.Group(), t = smokeTex(); g.userData.sp = [];
      for (let i = 0; i < 54; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0, color: 0xd9d6d0 })); sp.renderOrder = 3; sp.visible = false; g.add(sp); g.userData.sp.push(sp); }
      this.scene.add(g);
    }
    const g = this.hearthGrp; g.visible = true;
    const key = Math.round(this.target.x * 2) + "," + Math.round(this.target.z * 2) + "|" + this.towns.size;
    if (key !== g.userData.key) {
      g.userData.key = key;
      const cols = [], near = CITIES.filter(ct => { const [x, z] = toWorld(ct[1], ct[2]); return Math.hypot(x - this.target.x, z - this.target.z) < 6.5 && this.towns.has(ct[0]); }).map(ct => { const [x, z] = this.spotXZ(ct[1], ct[2]); return { ct, x, z, d: Math.hypot(x - this.target.x, z - this.target.z) }; }).sort((a, b) => a.d - b.d);
      for (const o of near) {
        const n = 1 + o.ct[3] * 2, r = (TOWN_R[o.ct[3]] || 0.2) * 0.55;
        for (let i = 0; i < n && cols.length < 18; i++) { const a = hash(i, o.ct[1] * 100 | 0, 7) * 6.283, d = Math.sqrt(hash(i, o.ct[2] * 100 | 0, 9)) * r, x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d, y = this.groundY(x, z); if (y > 0.004) cols.push([x, y + 0.02, z]); }
        if (cols.length >= 18) break;
      }
      g.userData.sp.forEach((sp, i) => { const c = cols[Math.floor(i / 3)]; sp.visible = !!c; if (c) { sp.userData.base = c; sp.userData.phase = (i % 3) / 3 + hash(i, 3, 5) * 0.2; } });
    }
    const now = performance.now() / 1000, fade = Math.min(1, (9.5 - this.dist) / 3);
    for (const sp of g.userData.sp) {
      if (!sp.visible) continue;
      const ph = (now * 0.07 + sp.userData.phase) % 1, [x, y, z] = sp.userData.base;
      sp.position.set(x + ph * ph * 0.12, y + ph * 0.2, z - ph * 0.03); sp.scale.setScalar(0.045 + ph * 0.13); sp.material.opacity = Math.min(1, Math.sin(Math.min(1, ph * 1.6) * Math.PI * 0.5) * (1 - ph) * 1.5) * fade;
    }
  }
  // the seas' names, as the parchment letters them: laid on the water in a faded ink, the letters spaced wide — read from
  //  up high, and fading away as you come down to the coast, where they'd only lie across the ships
  seaNames() {
    sync();
    if (this.seaGroup) { this.scene.remove(this.seaGroup); for (const m of this.seaGroup.children) { m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); } this._seaO = null; }
    // (lettered again once the map's own face has loaded, if it hadn't yet)
    if (document.fonts && document.fonts.status !== "loaded" && !this._seaWait) { this._seaWait = true; document.fonts.ready.then(() => this.seaNames()); }
    const g = this.seaGroup = new THREE.Group(); this.scene.add(g);
    for (const [name, lon, lat, ang = 0] of SEAS) {
      const lines = name.split("\n"), cv = document.createElement("canvas"), W = 1024, LH = 120; cv.width = W; cv.height = LH * lines.length + 20;
      const c = cv.getContext("2d"); c.font = 'italic 92px "IM Fell English", "Cormorant Garamond", Georgia, serif'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "rgba(20,38,52,0.8)";
      const span = t => [...t].reduce((s, x) => s + c.measureText(x).width + 14, -14);
      // (the longest line kept inside the sheet: the lettering made smaller to fit, not cut off at the edge)
      const longest = Math.max(...lines.map(span)); if (longest > W - 40) c.font = `italic ${Math.floor(92 * (W - 40) / longest)}px "IM Fell English", "Cormorant Garamond", Georgia, serif`;
      const wide = (t, y) => { const ch = [...t], gap = 14, w = span(t); let x = W / 2 - w / 2; for (const k of ch) { const cw = c.measureText(k).width; c.fillText(k, x + cw / 2, y); x += cw + gap; } return w; };
      lines.forEach((t, i) => wide(t, 10 + LH * (i + 0.5)));
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      // (as wide as the sea will take: the oceans broad, the gulfs and the narrow seas less)
      const sw = /^OCEANUS/.test(name) ? 30 : /ADRIATICUM|AEGAEUM|BOTHNICUS/.test(name) ? 13 : 19, h = sw * cv.height / W;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 }));
      const [x, z] = toWorld(lon, lat); m.rotation.set(-Math.PI / 2, 0, -ang * Math.PI / 180); m.position.set(x, 0.01, z); m.renderOrder = 1.5; g.add(m);
    }
  }
  // ships lying at anchor off the port towns near the middle of the view, close in: merchantmen and coasters, a few to a
  //  port and more to a great one, their bows all into the west wind, riding the swell under their holder's colours —
  //  as big as ships are beside the houses, not the fleets' marks
  anchorages() {
    const far = this.dist > 8.5 || !this.cityGroup || !this.g;
    if (far) { if (this.anchorGrp) this.anchorGrp.visible = false; return; }
    if (!this.anchorGrp) { this.anchorGrp = new THREE.Group(); this.anchorGrp.userData.pool = []; this.scene.add(this.anchorGrp); ensureModel("ship"); }
    const g = this.anchorGrp; g.visible = true;
    const key = Math.round(this.target.x * 2) + "," + Math.round(this.target.z * 2) + "|" + this.towns.size;
    if (key !== g.userData.key) {
      const spots = [];
      const near = CITIES.filter(ct => { const [x, z] = toWorld(ct[1], ct[2]); return Math.hypot(x - this.target.x, z - this.target.z) < 6 && this.towns.has(ct[0]); });
      for (const ct of near) {
        const [tx, tz] = this.spotXZ(ct[1], ct[2]); let w = null;
        // (the open water off the town: the nearest sea with sea round it, not a river or a creek)
        for (let d = 0.18; d <= 0.7 && !w; d += 0.06) for (let k = 0; k < 16 && !w; k++) { const a = k / 16 * 6.283, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d; if (this.rawY(x, z) < -0.02 && this.rawY(x + 0.06, z) < 0 && this.rawY(x - 0.06, z) < 0 && this.rawY(x, z + 0.06) < 0 && this.rawY(x, z - 0.06) < 0) w = [x, z, a]; }
        if (!w) continue;
        const own = cityOwner(this.g, ct), col = own && NATIONS[own] ? NATIONS[own].color : "#e8e0d0", n = 1 + ct[3];
        for (let i = 0; i < n; i++) { const a = w[2] + (i - (n - 1) / 2) * 0.35, d = 0.05 + (i % 2) * 0.05; spots.push([w[0] + Math.cos(a) * d, w[1] + Math.sin(a) * d, col, hash(i, ct[1] * 100 | 0, 13)]); }
      }
      if (spots.length && !modelCopy("ship")) return;      // (the model not loaded yet: tried again next frame)
      g.userData.key = key;
      const pool = g.userData.pool;
      while (pool.length < Math.min(20, spots.length)) { const m = modelCopy("ship"); if (!m) break; const sh = new THREE.Group(); m.scene.position.z = -2.4; m.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; if (o.material && /flag/.test(o.material.name || "")) { o.material = o.material.clone(); sh.userData.flags = (sh.userData.flags || []).concat(o.material); } } }); sh.add(m.scene); sh.scale.setScalar(0.0034); g.add(sh); pool.push(sh); }
      pool.forEach((sh, i) => { const sp = spots[i]; sh.visible = !!sp; if (!sp) return; sh.position.set(sp[0], 0, sp[1]); sh.rotation.y = -Math.PI / 2 + (sp[3] - 0.5) * 0.3; sh.userData.roll = sp[3] * 6.28; for (const fm of sh.userData.flags || []) fm.color.set(sp[2]); });
    }
    const now = performance.now() / 1000;
    for (const sh of g.userData.pool) if (sh.visible) { sh.rotation.z = Math.sin(now * 0.9 + sh.userData.roll) * 0.06; sh.rotation.x = Math.sin(now * 0.7 + sh.userData.roll * 1.3) * 0.03; }
  }
  // the mark under a point on the view (its name), of those whose names match `rx`
  markAt(px, py, rx) {
    if (!this.markGroup) return null; const v = new THREE.Vector3(); let best = null, bd = 14;
    for (const sp of this.markGroup.children) { const n = sp.userData.name; if (!n || (rx && !rx.test(n))) continue; v.copy(sp.position).project(this.camera); if (v.z > 1) continue; const d = Math.hypot((v.x + 1) / 2 * this.w - px, (1 - v.y) / 2 * this.h - py); if (d < bd) { bd = d; best = n; } }
    return best;
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
