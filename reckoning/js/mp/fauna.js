// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE BEASTS OF THE WORLD: what lives where, and what each is like. Shared by the server (which keeps them, moves them
// and knows when one is brought down) and the game (which draws them, and hunts them). On the Earth, each where it
// really lives: the beaver in the northern rivers, the lion on the African savanna, the kangaroo in New Holland; on the
// other maps, by the kind of country alone.

// how each moves and takes a blow. r: body radius, h: the body's height off the ground, len: half its length, leg: leg
// length, walk/run: speeds (m/s), hp, meat (food for the store, each), hear*: how far it hears you running, walking,
// creeping; stride: metres a stride. fierce: comes for you when you're close (and how hard it bites); herd: comes in
// groups of so many
export const SPECIES = {
  deer:       { name: "roe deer",      r: 0.34, h: 0.8,  len: 0.42, leg: 0.75, walk: 0.9, run: 8.5,  hp: 2, meat: 3,  hearRun: 30, hearWalk: 15, hearCreep: 5.5, stride: 1.6, herd: 3 },
  hare:       { name: "hare",          r: 0.16, h: 0.2,  len: 0.12, leg: 0.15, walk: 0.6, run: 7.5,  hp: 1, meat: 1,  hearRun: 22, hearWalk: 10, hearCreep: 3.5, stride: 0.7 },
  boar:       { name: "wild boar",     r: 0.42, h: 0.55, len: 0.5,  leg: 0.38, walk: 0.7, run: 6.8,  hp: 4, meat: 4,  hearRun: 22, hearWalk: 10, hearCreep: 3.5, stride: 1.2, fierce: 0.12, herd: 2 },
  moose:      { name: "moose",         r: 0.6,  h: 1.45, len: 0.85, leg: 1.2,  walk: 1.0, run: 9,    hp: 6, meat: 8,  hearRun: 30, hearWalk: 14, hearCreep: 5,   stride: 2.4 },
  reindeer:   { name: "reindeer",      r: 0.42, h: 0.95, len: 0.6,  leg: 0.85, walk: 1.0, run: 9.5,  hp: 3, meat: 4,  hearRun: 32, hearWalk: 15, hearCreep: 5.5, stride: 1.9, herd: 5 },
  beaver:     { name: "beaver",        r: 0.2,  h: 0.2,  len: 0.3,  leg: 0.12, walk: 0.5, run: 2.6,  hp: 1, meat: 2,  hearRun: 16, hearWalk: 8,  hearCreep: 3,   stride: 0.5, water: true },
  wolf:       { name: "wolf",          r: 0.26, h: 0.62, len: 0.5,  leg: 0.55, walk: 1.1, run: 10,   hp: 3, meat: 2,  hearRun: 34, hearWalk: 18, hearCreep: 7,   stride: 1.6, fierce: 0.1, herd: 3 },
  bear:       { name: "brown bear",    r: 0.6,  h: 0.85, len: 0.75, leg: 0.6,  walk: 0.9, run: 9,    hp: 8, meat: 7,  hearRun: 24, hearWalk: 11, hearCreep: 4,   stride: 1.5, fierce: 0.22 },
  polarbear:  { name: "polar bear",    r: 0.65, h: 0.95, len: 0.85, leg: 0.65, walk: 0.9, run: 9,    hp: 9, meat: 8,  hearRun: 30, hearWalk: 14, hearCreep: 5,   stride: 1.6, fierce: 0.25 },
  fox:        { name: "fox",           r: 0.15, h: 0.32, len: 0.3,  leg: 0.3,  walk: 0.9, run: 8,    hp: 1, meat: 1,  hearRun: 26, hearWalk: 13, hearCreep: 5,   stride: 0.9 },
  bison:      { name: "bison",         r: 0.75, h: 1.2,  len: 1.0,  leg: 0.8,  walk: 0.8, run: 9,    hp: 8, meat: 10, hearRun: 26, hearWalk: 12, hearCreep: 4,   stride: 2.0, herd: 6 },
  horse:      { name: "wild horse",    r: 0.45, h: 1.1,  len: 0.8,  leg: 0.95, walk: 1.1, run: 12,   hp: 4, meat: 5,  hearRun: 34, hearWalk: 16, hearCreep: 6,   stride: 2.4, herd: 5 },
  lion:       { name: "lion",          r: 0.4,  h: 0.75, len: 0.75, leg: 0.65, walk: 1.0, run: 11,   hp: 6, meat: 4,  hearRun: 30, hearWalk: 15, hearCreep: 6,   stride: 1.8, fierce: 0.28, herd: 3 },
  zebra:      { name: "zebra",         r: 0.42, h: 1.0,  len: 0.75, leg: 0.85, walk: 1.0, run: 11,   hp: 4, meat: 5,  hearRun: 34, hearWalk: 16, hearCreep: 6,   stride: 2.2, herd: 6 },
  antelope:   { name: "antelope",      r: 0.3,  h: 0.8,  len: 0.5,  leg: 0.75, walk: 1.0, run: 13,   hp: 2, meat: 3,  hearRun: 36, hearWalk: 18, hearCreep: 7,   stride: 2.0, herd: 6 },
  elephant:   { name: "elephant",      r: 1.3,  h: 2.2,  len: 1.6,  leg: 1.6,  walk: 1.0, run: 6,    hp: 20, meat: 30, hearRun: 30, hearWalk: 14, hearCreep: 6,  stride: 2.4, herd: 4, fierce: 0.35 },
  giraffe:    { name: "giraffe",       r: 0.5,  h: 2.0,  len: 0.75, leg: 1.8,  walk: 1.0, run: 9,    hp: 6, meat: 10, hearRun: 36, hearWalk: 18, hearCreep: 8,   stride: 3.0, herd: 3 },
  camel:      { name: "camel",         r: 0.55, h: 1.6,  len: 0.8,  leg: 1.3,  walk: 1.0, run: 7,    hp: 5, meat: 8,  hearRun: 24, hearWalk: 11, hearCreep: 4,   stride: 2.2, herd: 3 },
  kangaroo:   { name: "kangaroo",      r: 0.3,  h: 0.8,  len: 0.4,  leg: 0.7,  walk: 1.0, run: 11,   hp: 2, meat: 3,  hearRun: 32, hearWalk: 16, hearCreep: 6,   stride: 2.6, herd: 4, hops: true },
  tiger:      { name: "tiger",         r: 0.42, h: 0.75, len: 0.85, leg: 0.65, walk: 1.0, run: 11,   hp: 6, meat: 4,  hearRun: 28, hearWalk: 13, hearCreep: 5,   stride: 1.9, fierce: 0.3 },
  jaguar:     { name: "jaguar",        r: 0.34, h: 0.6,  len: 0.65, leg: 0.5,  walk: 1.0, run: 10,   hp: 4, meat: 3,  hearRun: 26, hearWalk: 12, hearCreep: 5,   stride: 1.6, fierce: 0.24 },
  monkey:     { name: "monkey",        r: 0.18, h: 0.4,  len: 0.22, leg: 0.35, walk: 0.9, run: 6,    hp: 1, meat: 1,  hearRun: 24, hearWalk: 12, hearCreep: 5,   stride: 0.8, herd: 5 },
  capybara:   { name: "capybara",      r: 0.3,  h: 0.42, len: 0.45, leg: 0.3,  walk: 0.6, run: 5,    hp: 2, meat: 3,  hearRun: 20, hearWalk: 9,  hearCreep: 3,   stride: 0.9, herd: 4, water: true },
  goat:       { name: "ibex",          r: 0.3,  h: 0.7,  len: 0.45, leg: 0.6,  walk: 0.9, run: 8,    hp: 2, meat: 3,  hearRun: 30, hearWalk: 15, hearCreep: 6,   stride: 1.4, herd: 4 },
  penguin:    { name: "penguin",       r: 0.22, h: 0.4,  len: 0.18, leg: 0.12, walk: 0.5, run: 1.6,  hp: 1, meat: 1,  hearRun: 14, hearWalk: 7,  hearCreep: 3,   stride: 0.3, herd: 8, upright: true },
  muskox:     { name: "musk ox",       r: 0.6,  h: 0.95, len: 0.7,  leg: 0.6,  walk: 0.7, run: 7,    hp: 6, meat: 7,  hearRun: 24, hearWalk: 11, hearCreep: 4,   stride: 1.4, herd: 5 },
};

// where each lives. On the Earth, by the biome and the region (degrees: west, east, south, north); elsewhere, by the
// biome. [kind, weight]
const R = (w, e, s, n) => (lon, lat) => lon > w && lon < e && lat > s && lat < n;
const AFRICA = R(-20, 52, -36, 20), AUSTRALIA = R(110, 156, -45, -9), AMERICAS = R(-170, -30, -60, 75), NAMERICA = R(-170, -50, 14, 75), SAMERICA = R(-85, -30, -60, 14);
const ASIA = R(60, 150, -12, 60), INDIA = R(66, 92, 6, 30), EURASIA = R(-12, 150, 35, 75), ARCTIC = (lon, lat) => lat > 66, SOUTHPOLE = (lon, lat) => lat < -55;
// by the biome alone (the other maps, and the Earth's own fallback)
const BY_BIOME = {
  ice: [["polarbear", 1], ["fox", 1]],
  tundra: [["reindeer", 4], ["fox", 2], ["wolf", 1], ["hare", 2], ["muskox", 2]],
  taiga: [["moose", 3], ["deer", 3], ["wolf", 2], ["bear", 1], ["hare", 3], ["fox", 1], ["beaver", 2]],
  heath: [["deer", 4], ["hare", 4], ["fox", 2], ["boar", 1]],
  temperate: [["deer", 5], ["boar", 3], ["hare", 3], ["fox", 2], ["bear", 1], ["wolf", 1]],
  grassland: [["horse", 3], ["deer", 2], ["hare", 4], ["wolf", 1], ["fox", 1]],
  mediterranean: [["deer", 3], ["boar", 3], ["hare", 3], ["goat", 2], ["fox", 1]],
  desert: [["camel", 3], ["antelope", 2], ["fox", 1]],
  savanna: [["antelope", 4], ["zebra", 3], ["lion", 1], ["elephant", 1], ["giraffe", 1]],
  rainforest: [["monkey", 4], ["capybara", 2], ["jaguar", 1], ["boar", 1]],
  wetland: [["beaver", 3], ["deer", 3], ["boar", 2], ["hare", 2], ["moose", 1]],
  alpine: [["goat", 5], ["bear", 1], ["hare", 2], ["fox", 1]],
};
// on the Earth: a region's own beasts over the biome's
const EARTH = [
  [SOUTHPOLE, { ice: [["penguin", 6]], tundra: [["penguin", 4]] }],
  [ARCTIC, { ice: [["polarbear", 3], ["fox", 1]], tundra: [["reindeer", 4], ["muskox", 2], ["fox", 2], ["polarbear", 1], ["wolf", 1]] }],
  [AFRICA, { savanna: [["zebra", 4], ["antelope", 4], ["lion", 2], ["elephant", 2], ["giraffe", 2]], desert: [["camel", 3], ["antelope", 3]], rainforest: [["monkey", 4], ["elephant", 1], ["antelope", 2]], grassland: [["zebra", 3], ["antelope", 3], ["lion", 1]], mediterranean: [["goat", 3], ["boar", 2], ["deer", 2]] }],
  [AUSTRALIA, { desert: [["kangaroo", 5]], savanna: [["kangaroo", 6]], grassland: [["kangaroo", 6]], temperate: [["kangaroo", 4]], rainforest: [["kangaroo", 2], ["monkey", 0]], mediterranean: [["kangaroo", 5]] }],
  [INDIA, { savanna: [["tiger", 1], ["antelope", 4], ["elephant", 2], ["deer", 3]], rainforest: [["tiger", 1], ["monkey", 4], ["elephant", 1]], grassland: [["antelope", 4], ["tiger", 1]] }],
  [ASIA, { rainforest: [["tiger", 1], ["monkey", 4], ["boar", 2], ["deer", 2]], grassland: [["horse", 4], ["wolf", 1], ["camel", 1], ["antelope", 2]], desert: [["camel", 4], ["horse", 1]] }],
  [SAMERICA, { rainforest: [["capybara", 3], ["monkey", 4], ["jaguar", 2]], savanna: [["capybara", 2], ["deer", 3], ["jaguar", 1]], grassland: [["deer", 3], ["capybara", 2], ["fox", 1]], alpine: [["goat", 3]] }],
  [NAMERICA, { taiga: [["moose", 4], ["beaver", 4], ["bear", 2], ["wolf", 2], ["deer", 2], ["hare", 2]], temperate: [["deer", 5], ["bear", 2], ["beaver", 2], ["wolf", 1], ["fox", 1]], grassland: [["bison", 6], ["deer", 2], ["wolf", 1], ["horse", 1]], wetland: [["beaver", 5], ["moose", 2], ["deer", 2]], desert: [["deer", 2], ["fox", 2]], savanna: [["bison", 3], ["deer", 2]], alpine: [["goat", 3], ["bear", 2]] }],
  [EURASIA, { taiga: [["moose", 3], ["reindeer", 2], ["bear", 2], ["wolf", 2], ["hare", 2], ["beaver", 1]], temperate: [["deer", 5], ["boar", 4], ["hare", 3], ["fox", 2], ["wolf", 1], ["bear", 1]], wetland: [["beaver", 3], ["boar", 2], ["deer", 2]] }],
];
export function faunaAt(land, x, z) {
  const b = land.biomeAt ? land.biomeAt(x, z) : "temperate";
  if (land.kind === "earth") {
    const lon = land.lonOf(x), lat = land.latOf(z);
    for (const [where, table] of EARTH) if (where(lon, lat) && table[b]) return table[b].filter(q => q[1] > 0);
  }
  return BY_BIOME[b] || BY_BIOME.temperate;
}
// one of them, by weight, for a number from 0 to 1
export function pickFauna(list, k) {
  const tot = list.reduce((a, q) => a + q[1], 0); let acc = 0;
  for (const [kind, w] of list) { acc += w / tot; if (k < acc) return kind; }
  return list.length ? list[list.length - 1][0] : "deer";
}
void AMERICAS;
