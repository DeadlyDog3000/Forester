// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE LAY OF THE LAND, FROM A NUMBER. A multiplayer map is never sent: every computer in the game, and the server,
// grows the same island from the same seed — its hills and lakes, every tree and every rock, where they stand and
// what they are. Nothing here draws anything (the server reads it too); see wilds.js for the drawing.

export const CHUNK = 96;              // a piece of the map, drawn or not as a whole
export const CELL = 4.6;              // one tree to a cell at most, jittered inside it
export const ROCK_CELL = 26;          // one rock to a cell at most
export const WATER = 0;               // the level of the sea and the lakes

// a number from 0 to 1 that is always the same for the same three integers
export function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// gradient noise, seeded: a shuffled table of 256 and eight directions
function noise2(seed) {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(hash3(seed, i, 7) * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0], GZ = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
  const g = (h, x, z) => GX[h & 7] * x + GZ[h & 7] * z;
  return (x, z) => {
    const X = Math.floor(x), Z = Math.floor(z), fx = x - X, fz = z - Z;
    const xi = X & 255, zi = Z & 255;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const a = p[p[xi] + zi], b = p[p[xi + 1] + zi], c = p[p[xi] + zi + 1], d = p[p[xi + 1] + zi + 1];
    const x1 = g(a, fx, fz) + u * (g(b, fx - 1, fz) - g(a, fx, fz));
    const x2 = g(c, fx, fz - 1) + u * (g(d, fx - 1, fz - 1) - g(c, fx, fz - 1));
    return (x1 + v * (x2 - x1)) * 0.7;
  };
}

import { EW, EH, LAT0, RES, EARTH_RLE } from "./earth-data.js";

// the world's land, unpacked once when first wanted (the Earth map)
let EARTH = null;
function earthGrid() {
  if (EARTH) return EARTH;
  EARTH = new Uint8Array(EW * EH);
  EARTH_RLE.split(";").forEach((row, j) => { let i = 0, v = 0; for (const n of row.split(",")) { const k = +n; if (v) EARTH.fill(1, j * EW + i, j * EW + i + k); i += k; v ^= 1; } });
  return EARTH;
}
// the great mountain chains, roughly where they are: [longitude, latitude, how far they spread in degrees, how high]
const RANGES = [[86, 28.5, 5, 1], [78, 33, 5, 0.9], [72, 36, 4, 0.8], [95, 31, 6, 0.7], [-70, -18, 4, 0.9], [-70, -30, 3.5, 0.9], [-72, -42, 3, 0.6], [-76, -5, 4, 0.7], [-74, 4, 3.5, 0.6],
  [-110, 42, 7, 0.6], [-118, 50, 6, 0.55], [-106, 37, 5, 0.6], [10, 46.3, 3, 0.65], [44, 42.5, 2.5, 0.55], [39, 9, 4, 0.45], [-5, 32, 3, 0.4], [60, 60, 4, 0.3], [13, 64, 5, 0.4], [70, 39, 4, 0.6], [104, 37, 6, 0.4], [146, -36, 3, 0.3], [170, -44, 2.5, 0.5]];
const gauss = (d, r) => Math.exp(-(d * d) / (r * r));
const DESERTS = [[-17, 33, 15, 32, 1], [33, 60, 13, 32, 1], [44, 62, 25, 38, 0.8], [62, 72, 24, 42, 0.7], [68, 76, 24, 30, 0.6], [85, 118, 36, 46, 0.8], [76, 92, 34, 40, 0.6],
  [-118, -102, 22, 37, 0.7], [-72, -68, -30, -16, 0.8], [12, 26, -28, -18, 0.75], [114, 142, -32, -19, 0.9], [-70, -64, -48, -38, 0.5]];

// where it rains most, the year round: the great rain forests, and the wet western coasts — [west, east, south, north, how wet]
const WETS = [[-80, -44, -16, 6, 1], [8, 32, -8, 6, 0.9], [92, 152, -11, 18, 0.95], [72, 92, 6, 26, 0.6], [-10, 20, 44, 60, 0.45], [-130, -118, 38, 60, 0.6], [-92, -72, 6, 20, 0.7], [140, 146, 34, 44, 0.5]];
// the savanna belts: rain enough for grass and scattered trees, not for forest — [west, east, south, north]
const SAVANNAS = [[33, 52, -12, 12], [-17, 40, 9, 17], [-55, -38, -22, -6], [118, 150, -20, -11], [70, 86, 11, 25], [12, 40, -20, -8]];
// how warm, by the latitude: [degrees, warmth]
const WARMTH = [[0, 1.0], [20, 0.86], [35, 0.68], [50, 0.53], [58, 0.41], [66, 0.27], [74, 0.12], [90, 0]];
// where the summers are dry and the winters wet: round the Middle Sea, California, Chile, the Cape, the south-west of New Holland
const MEDS = [[-10, 42, 30, 45], [-124, -116, 32, 40], [-74, -70, -38, -30], [17, 26, -35, -32], [114, 124, -36, -30]];

// THE BIOMES: what kind of country it is, from how warm and how wet, how high, how near the water. Each has its own
// ground, its own grass, and its own trees, in its own mix.
//   ground: the colour of the ground in the open; grass: how thick the grass grows (0..1); forest: how much of it is
//   wooded, at most; trees: [kind, weight] — the mix, and size: how tall they grow there
export const BIOMES = {
  ice:           { name: "ice",               ground: [0.9, 0.92, 0.95], grass: 0,    forest: 0,    trees: [] },
  tundra:        { name: "tundra",            ground: [0.52, 0.5, 0.4],  grass: 0.35, forest: 0.08, trees: [["birch", 3], ["spruce", 2]], size: 0.45 },
  taiga:         { name: "the taiga",         ground: [0.36, 0.42, 0.28], grass: 0.25, forest: 1,    trees: [["spruce", 7], ["pine", 2], ["birch", 2]] },
  heath:         { name: "heath",             ground: [0.5, 0.46, 0.32], grass: 0.55, forest: 0.45, trees: [["pine", 7], ["birch", 3]] },
  temperate:     { name: "broadleaf woods",   ground: [0.4, 0.5, 0.26],  grass: 0.6,  forest: 0.9,  trees: [["oak", 6], ["birch", 2], ["spruce", 1], ["pine", 1]] },
  grassland:     { name: "steppe",            ground: [0.58, 0.58, 0.32], grass: 1,    forest: 0.12, trees: [["oak", 2], ["birch", 2], ["scrub", 2]] },
  mediterranean: { name: "maquis",            ground: [0.6, 0.54, 0.36], grass: 0.45, forest: 0.4,  trees: [["pine", 4], ["oak", 3], ["scrub", 4]] },
  desert:        { name: "desert",            ground: [0.84, 0.72, 0.5], grass: 0,    forest: 0.05, trees: [["scrub", 6], ["palm", 1]] },
  savanna:       { name: "savanna",           ground: [0.74, 0.64, 0.36], grass: 1,    forest: 0.13,  trees: [["acacia", 7], ["scrub", 2]] },
  rainforest:    { name: "rain forest",       ground: [0.28, 0.4, 0.2],  grass: 0.45, forest: 0.75, trees: [["jungle", 5], ["palm", 3], ["oak", 2]], size: 1.4 },
  wetland:       { name: "marsh",             ground: [0.34, 0.4, 0.26], grass: 0.95, forest: 0.35, trees: [["birch", 3], ["oak", 2]] },
  alpine:        { name: "the high meadows",  ground: [0.5, 0.52, 0.42], grass: 0.45, forest: 0.12, trees: [["spruce", 4], ["pine", 1]], size: 0.6 },
};

// The kinds of country a game can be set in
export const TERRAINS = {
  island:      { name: "Island",       note: "One island, the sea all round it." },
  archipelago: { name: "Archipelago",  note: "A scatter of islands and islets, with shallows between to wade across." },
  continent:   { name: "Continent",    note: "Land from edge to edge, a coast down one side and mountains round the rest." },
  highlands:   { name: "Highlands",    note: "An island of mountains, snow on the peaks and the woods in the valleys." },
  lakeland:    { name: "Lake country", note: "An island full of lakes and the land between them." },
  earth:       { name: "The Earth",    note: "The whole world as it stood in 1683, made small: every continent and sea where it is, the mountains where they rise, and every kind of country where it lies: the ice and the tundra, the taiga, the broadleaf woods, the steppe and the maquis, desert, savanna and rain forest." },
};
export const TERRAIN_ORDER = ["island", "archipelago", "continent", "highlands", "lakeland", "earth"];

// The land: `half` metres from its middle to the edge of the map; `kind` one of TERRAINS.
export function makeTerrain(seed, half, kind = "island") {
  seed = seed | 0;
  if (!TERRAINS[kind]) kind = "island";
  const nA = noise2(seed), nB = noise2(seed + 101), nC = noise2(seed + 202), nD = noise2(seed + 303), nE = noise2(seed + 404);
  const big = half > 1500;                    // the wide world
  const mountains = (big && kind !== "earth") || kind === "highlands";
  const fbm = (n, x, z, oct) => { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += n(x * f, z * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };
  // which way the continent's coast faces (always the same for the same seed)
  const ca = hash3(seed, 77, 3) * Math.PI * 2, cx = Math.cos(ca), cz = Math.sin(ca);
  // the coast: under about 0.8 is land, over about 0.95 the sea. Bitten into by bays, so no two maps share an outline
  // (on the Earth: a metre east is a little longitude, a metre south a little latitude, the same either way)
  const lonOf = x => x / half * 180, latOf = z => -z / half * 180;
  const landK = (lon, lat) => {
    const G = earthGrid(), gi = (lon + 180) / RES - 0.5, gj = (LAT0 - lat) / RES - 0.5;
    const i = Math.floor(gi), j = Math.floor(gj), fx = gi - i, fy = gj - j;
    const at = (a, b) => (b < 0 || b >= EH) ? 0 : G[b * EW + (((a % EW) + EW) % EW)];
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  };
  const coast = (x, z) => {
    const r = Math.hypot(x, z) / half, u = x / half, v = z / half;
    // (the world's coasts are a half-degree grid: pushed about by a little noise, so the shore wanders in bays and points
    //  as a real one does, instead of running square along the grid's rows)
    if (kind === "earth") { const cell = half / 360, wx = x + nC(x / (cell * 3.1) + 5.3, z / (cell * 3.1) - 2.1) * cell * 1.7, wz = z + nD(x / (cell * 3.1) - 7.7, z / (cell * 3.1) + 3.9) * cell * 1.7;
      return 1.02 - landK(lonOf(wx), latOf(wz)) * 0.42 + fbm(nE, u * 14 + 9, v * 14 + 9, 3) * 0.07 + fbm(nB, x / (cell * 1.4) + 3, z / (cell * 1.4) - 8, 3) * 0.035; }
    if (kind === "archipelago") return 0.62 + r * 0.42 - fbm(nE, u * 3.4 + 9, v * 3.4 + 9, 4) * 1.25;
    if (kind === "continent") return 0.8 + ((u * cx + v * cz) - 0.42) * 1.1 + fbm(nE, u * 2.2 + 9, v * 2.2 + 9, 4) * 0.3;
    // (bays and headlands, big and small, out of the noise round the edge)
    return r + fbm(nE, u * 1.7 + 9, v * 1.7 + 9, 4) * 0.34;
  };
  const lakeK = Math.min(420, half * (kind === "lakeland" ? 0.22 : 0.38)), lakeAt = kind === "lakeland" ? 0.06 : kind === "earth" ? 9 : 0.24;
  // mountains, jagged: ridges sharpened to knife-edges (each octave's ridge squared, and the finer ones riding the
  // ridges of the coarser, so the crests break up into teeth and the valleys stay smooth), and crags on top
  const jag = (x, z, sc) => {
    let s = 0, a = 1, t = 0, wgt = 1, f = 1 / sc;
    for (let i = 0; i < 5; i++) { const r = 1 - Math.abs(nD(x * f + i * 17.3, z * f - i * 9.1)); const v = r * r * wgt; s += v * a; t += a; wgt = Math.min(1, v * 1.6); a *= 0.5; f *= 2.1; }
    const crag = 1 - Math.abs(nB(x / 23 + 40, z / 23 - 12));
    return s / t * 1.15 + crag * crag * crag * 0.12 * (s / t);
  };
  // (the sea stands a little higher up the shore than the land was first laid out for)
  const SEA_RISE = 0.9;
  function heightAt(x, z) { return height0(x, z) - SEA_RISE; }
  function height0(x, z) {
    const c = coast(x, z);
    if (c > 1.05) return -16;
    // rolling ground, then the hills, then (on the wide world, and in the highlands) the mountains
    let h = 7 + fbm(nA, x / 320, z / 320, 4) * 16 + fbm(nB, x / 70, z / 70, 3) * 2.2;
    const hills = smooth(-0.1, 0.5, nC(x / 900, z / 900));
    h += hills * Math.abs(fbm(nD, x / 240, z / 240, 3)) * 30;
    if (kind === "earth") {
      const lon = lonOf(x), lat = latOf(z);
      let m = 0; for (const [ox, oy, rr, hh] of RANGES) { const dx = Math.abs(lon - ox), d = Math.hypot(Math.min(dx, 360 - dx), lat - oy); if (d < rr * 3) m += gauss(d, rr) * hh; }
      if (m > 0.004) h += Math.min(1.2, m) * jag(x, z, 300) * 110;
    } else if (mountains) {
      const sc = big ? 1400 : half * 0.9, m = kind === "highlands" ? smooth(-0.12, 0.38, nC(x / sc + 71.3, z / sc - 23.9)) : smooth(0.05, 0.5, nC(x / sc + 71.3, z / sc - 23.9));
      if (m > 0.004) h += m * jag(x, z, 420) * (big ? 120 : 75);
    }
    // the continent runs on past the edge of the map: there it rises into mountains you can't cross
    if (kind === "continent") { const e = Math.max(Math.abs(x), Math.abs(z)) / half; h += smooth(0.86, 1, e) * 70; }
    // lakes: hollows pressed into the low ground
    const lake = nE(x / lakeK + 17, z / lakeK + 5) + nB(x / 60 + 3, z / 60 + 8) * 0.04;
    if (lake > lakeAt) h -= (lake - lakeAt) * 80;
    // down to the beach and the sea at the edge (an archipelago's straits shallow enough, here and there, to wade)
    const shore = smooth(0.68, 0.95, c);
    h = h * (1 - shore) + (kind === "archipelago" ? -2.5 - smooth(0.95, 1.05, c) * 8 : -6) * shore;
    return h;
  }
  const slopeAt = (x, z) => { const e = 1.5; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); };
  // the climate: how warm (0 the poles .. 1 the equator) and how wet (0 desert .. 1 rain forest). On the Earth, where
  // it really is: by the latitude, the height, the deserts and the rain belts as they lie. Elsewhere, a temperate land,
  // warmer and colder, wetter and drier across it, colder up high
  const WC = new Map();
  const warmWet = (x, z) => { const key = Math.floor(x / 8) * 65536 + Math.floor(z / 8); let v = WC.get(key); if (v === undefined) { if (WC.size > 400000) WC.clear(); v = warmWet0(Math.floor(x / 8) * 8 + 4, Math.floor(z / 8) * 8 + 4); WC.set(key, v); } return v; };
  const warmWet0 = (x, z) => {
    const h = heightAt(x, z), nT = fbm(nC, x / 900 + 31, z / 900 - 7, 3), nM = fbm(nA, x / 600 - 19, z / 600 + 44, 3);
    if (kind !== "earth") {
      const lake = nE(x / lakeK + 17, z / lakeK + 5);
      return { t: Math.max(0, 0.52 + nT * 0.28 - Math.max(0, h - 20) * 0.006), m: Math.min(1, Math.max(0, 0.55 + nM * 0.5 + smooth(lakeAt - 0.12, lakeAt, lake) * 0.3)) };
    }
    const lat = latOf(z), lon = lonOf(x), al = Math.abs(lat), soft = (v, lo, hi, e) => smooth(lo - e, lo + e, v) * (1 - smooth(hi - e, hi + e, v));
    let tl = 0; for (let k = 1; k < WARMTH.length; k++) if (al <= WARMTH[k][0]) { const [a0, w0] = WARMTH[k - 1], [a1, w1] = WARMTH[k]; tl = w0 + (w1 - w0) * (al - a0) / (a1 - a0); break; }
    const t = Math.max(0, tl - Math.max(0, h - 12) * 0.005 + nT * 0.05);
    // (the rain belts: wet at the equator, dry in the horse latitudes, wet again in the westerlies, dry at the poles)
    let m = al < 12 ? 0.8 : al < 34 ? 0.8 - (al - 12) / 22 * 0.45 : al < 60 ? 0.42 + Math.sin((al - 34) / 26 * Math.PI) * 0.2 : 0.4;
    for (const [w, e, sLat, nLat, k] of WETS) m = Math.max(m, soft(lon, w, e, 4) * soft(lat, sLat, nLat, 3) * k + m * (1 - k * soft(lon, w, e, 4) * soft(lat, sLat, nLat, 3)));
    for (const [w, e, sLat, nLat] of SAVANNAS) { const k = soft(lon, w, e, 3) * soft(lat, sLat, nLat, 2.5); m = m * (1 - k) + Math.min(m, 0.42) * k; }
    let dry = 0; for (const [w, e, sLat, nLat, k] of DESERTS) dry = Math.max(dry, soft(lon, w, e, 4) * soft(lat, sLat, nLat, 3) * k);
    m = m * (1 - dry * 0.95) + nM * 0.08;
    return { t, m: Math.min(1, Math.max(0, m)), med: MEDS.some(([w, e, sLat, nLat]) => lon > w && lon < e && lat > sLat && lat < nLat) };
  };
  // which biome, here (worked out once for each eight-metre square, and kept)
  const BC = new Map();
  const biomeAt = (x, z) => { const key = Math.floor(x / 8) * 65536 + Math.floor(z / 8); let b = BC.get(key); if (b === undefined) { if (BC.size > 400000) BC.clear(); b = biomeAt0(Math.floor(x / 8) * 8 + 4, Math.floor(z / 8) * 8 + 4); BC.set(key, b); } return b; };
  const biomeAt0 = (x, z) => {
    const h = heightAt(x, z), { t, m, med } = warmWet(x, z);
    if (t < 0.13) return "ice";
    if (h > (big || kind === "earth" ? 52 : 40) && t < 0.55) return "alpine";
    if (t < 0.24) return "tundra";
    if (t < 0.42) return m < 0.25 ? "grassland" : "taiga";
    if (t < 0.7) {
      if (m < 0.2) return "desert";
      if (med && m < 0.62) return "mediterranean";
      if (m < 0.4) return "grassland";
      if (m > 0.86 && h < 9) return "wetland";
      return kind !== "earth" && m < 0.5 ? "heath" : "temperate";
    }
    if (m < 0.22) return "desert";
    if (m < 0.58) return "savanna";
    return "rainforest";
  };
  // (what the rest of the game asked of the climate: how cold, how dry — from the biome now)
  const climate = (x, z) => { const b = biomeAt(x, z), { t, m } = warmWet(x, z); return { cold: b === "ice" ? 1 : b === "tundra" ? 0.6 : Math.max(0, 0.3 - t) * 2, dry: b === "desert" ? 1 : Math.max(0, 0.3 - m) * 2, t, m, biome: b }; };
  // how thick the forest stands: 0 open meadow .. 1 deep woods
  const forestAt = (x, z) => { const f = smooth(-0.25, 0.3, fbm(nB, x / 190 + 50, z / 190 + 50, 3) + 0.12); return f * BIOMES[biomeAt(x, z)].forest; };
  const meadowAt = (x, z) => 1 - forestAt(x, z);
  const sandAt = (x, z, h = heightAt(x, z)) => h < WATER + 1.4;
  // the caves: here and there a mouth in a hillside, its back to the slope and facing down it (no more than one to a
  // great square of the map, and not in every one), and the halls and tunnels in the rock far beneath it
  const CC = new Map(), CAVE_CELL = kind === "earth" || big ? 700 : 430;
  function caveIn(ci, cj) {
    const key = ci + ":" + cj; if (CC.has(key)) return CC.get(key);
    let out = null;
    if (hash3(seed + 31, ci, cj) < 0.72) for (let k = 0; k < 40 && !out; k++) {
      const x = (ci + 0.12 + hash3(seed + 32 + k, ci, cj) * 0.76) * CAVE_CELL, z = (cj + 0.12 + hash3(seed + 57 + k, ci, cj) * 0.76) * CAVE_CELL;
      if (Math.abs(x) > half - 60 || Math.abs(z) > half - 60) continue;
      const y = height0(x, z) - SEA_RISE, sl = slopeAt(x, z);
      if (y < 3 || y > 90 || sl < 0.09 || sl > 0.7) continue;
      // (facing down the hill: the ground falls away in front, and rises behind)
      const e = 3, gx = heightAt(x + e, z) - heightAt(x - e, z), gz = heightAt(x, z + e) - heightAt(x, z - e), ry = Math.atan2(-gx, -gz);
      if (heightAt(x - Math.sin(ry) * 8, z - Math.cos(ry) * 8) < y + 0.7) continue;
      out = { id: "c" + key, ci, cj, x, y, z, ry, seed: (seed * 7919 + ci * 104729 + cj * 1299709) | 0 };
    }
    CC.set(key, out); return out;
  }
  const caveById = id => { const [ci, cj] = String(id).slice(1).split(":").map(Number); return Number.isFinite(ci) && Number.isFinite(cj) ? caveIn(ci, cj) : null; };
  const cavesNear = (x, z, r) => { const out = []; for (let ci = Math.floor((x - r) / CAVE_CELL); ci <= Math.floor((x + r) / CAVE_CELL); ci++) for (let cj = Math.floor((z - r) / CAVE_CELL); cj <= Math.floor((z + r) / CAVE_CELL); cj++) { const c = caveIn(ci, cj); if (c && Math.hypot(c.x - x, c.z - z) < r) out.push(c); } return out; };
  // (nothing grows or lies in a cave's mouth, nor on the mound over it)
  const byCave = (x, z, r) => { const c = caveIn(Math.floor(x / CAVE_CELL), Math.floor(z / CAVE_CELL)); return !!c && Math.hypot(c.x - Math.sin(c.ry) * 5 - x, c.z - Math.cos(c.ry) * 5 - z) < r; };
  // the tree in a cell, if there is one: always the same tree
  function treeIn(i, j) {
    const r = hash3(seed, i, j);
    const x = (i + 0.15 + hash3(seed + 1, i, j) * 0.7) * CELL, z = (j + 0.15 + hash3(seed + 2, i, j) * 0.7) * CELL;
    const dens = forestAt(x, z);
    if (r > dens * 0.78 + 0.02) return null;
    const y = heightAt(x, z);
    if (y < WATER + 1.6 || y > (big || kind === "earth" ? 70 : 60)) return null;
    if (slopeAt(x, z) > 0.75 || byCave(x, z, 11)) return null;
    const k = hash3(seed + 3, i, j), hh = hash3(seed + 4, i, j);
    // (the kind of tree from the biome's own mix; a palm on a warm shore)
    const B = BIOMES[biomeAt(x, z)];
    let tk = "spruce";
    if (B.trees.length) { const tot = B.trees.reduce((a, q) => a + q[1], 0); let acc = 0; for (const [kk, w] of B.trees) { acc += w / tot; if (k < acc) { tk = kk; break; } } }
    // (a palm by warm water: on a shore, or round an oasis's pool — not out on the dry sand)
    if (y < WATER + 3.2 && warmWet(x, z).t > 0.72 && [[9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, -6]].some(([dx, dz]) => heightAt(x + dx, z + dz) < WATER)) tk = "palm";
    else if (tk === "palm" && B !== BIOMES.rainforest) tk = "scrub";
    const H0 = { spruce: [8, 8], pine: [10, 7], birch: [7, 4], oak: [9, 6], palm: [8, 7], acacia: [6, 4], jungle: [16, 12], scrub: [1.2, 1.4] }[tk];
    const h = (H0[0] + hh * H0[1]) * (tk === "scrub" ? 1 : B.size || 1);
    return { id: i + ":" + j, i, j, x, y, z, h, kind: tk, rot: hash3(seed + 5, i, j) * Math.PI * 2 };
  }
  function treeById(id) { const [i, j] = id.split(":").map(Number); return Number.isFinite(i) && Number.isFinite(j) ? treeIn(i, j) : null; }
  function rockIn(i, j) {
    if (hash3(seed + 9, i, j) > 0.34) return null;
    const x = (i + 0.2 + hash3(seed + 10, i, j) * 0.6) * ROCK_CELL, z = (j + 0.2 + hash3(seed + 11, i, j) * 0.6) * ROCK_CELL;
    const y = heightAt(x, z);
    if (y < WATER + 1.2 || byCave(x, z, 12)) return null;
    const s = 0.8 + hash3(seed + 12, i, j) * 1.1;
    return { id: "r" + i + ":" + j, i, j, x, y, z, s, rot: hash3(seed + 13, i, j) * 6.28 };
  }
  function rockById(id) { const [i, j] = id.slice(1).split(":").map(Number); return Number.isFinite(i) && Number.isFinite(j) ? rockIn(i, j) : null; }
  // everything in one piece of the map
  function chunkTrees(ci, cj) {
    const out = [], n = CHUNK / CELL;
    const i0 = Math.ceil(ci * CHUNK / CELL), i1 = Math.ceil((ci + 1) * CHUNK / CELL), j0 = Math.ceil(cj * CHUNK / CELL), j1 = Math.ceil((cj + 1) * CHUNK / CELL);
    void n;
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) { const t = treeIn(i, j); if (t) out.push(t); }
    return out;
  }
  function chunkRocks(ci, cj) {
    const out = [];
    const i0 = Math.ceil(ci * CHUNK / ROCK_CELL), i1 = Math.ceil((ci + 1) * CHUNK / ROCK_CELL), j0 = Math.ceil(cj * CHUNK / ROCK_CELL), j1 = Math.ceil((cj + 1) * CHUNK / ROCK_CELL);
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) { const r = rockIn(i, j); if (r) out.push(r); }
    return out;
  }
  // somewhere good to start a homestead: dry, level, open, and (if asked) well away from the others
  function findHome(r, avoid = [], minGap = 0, near = null, nearR = 0) {
    let best = null, bestS = -Infinity;
    for (let k = 0; k < 400; k++) {
      let x, z;
      if (near) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * nearR; x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d; }
      else { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * half * 0.62; x = Math.cos(a) * d; z = Math.sin(a) * d; }
      const y = heightAt(x, z);
      if (y < WATER + 2.5 || y > 40) continue;
      const sl = slopeAt(x, z); if (sl > 0.18) continue;
      let gap = Infinity; for (const o of avoid) gap = Math.min(gap, Math.hypot(o.x - x, o.z - z));
      if (gap < minGap) continue;
      const cl = kind === "earth" ? climate(x, z) : null;
      const s = meadowAt(x, z) * 2 - sl * 4 + Math.min(gap, 400) / 400 + r() * 0.3 - (cl ? cl.dry * 3 + cl.cold * 4 : 0);
      if (s > bestS) { bestS = s; best = { x, z }; }
    }
    return best || { x: 0, z: 0 };
  }
  return { seed, half, kind, big, lonOf, latOf, climate, biomeAt, warmWet, heightAt, slopeAt, forestAt, meadowAt, sandAt, treeIn, treeById, rockIn, rockById, chunkTrees, chunkRocks, findHome, coast, caveIn, caveById, cavesNear, CAVE_CELL };
}

// a seeded run of numbers from 0 to 1 (the same as core.js's, without needing it)
export function seq(seed) { let s = (seed | 0) || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0; s ^= s >>> 13; return ((s >>> 0) % 1e9) / 1e9; }; }
