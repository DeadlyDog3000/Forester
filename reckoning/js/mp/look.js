// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// YOUR LOOK IN A MULTIPLAYER GAME: what the character builder makes, kept on this computer and sent to the others,
// and how it becomes a body (the townsfolk's own models, in your colours).

export const BODIES = [
  { id: "townsman", name: "Townsman", f: false },
  { id: "townswoman", name: "Townswoman", f: true },
  { id: "brother", name: "Woodsman", f: false },
  { id: "sister", name: "Woodswoman", f: true },
];
export const SWATCH = {
  skin: [0xf1d3bc, 0xe2b896, 0xc99a74, 0xa87652, 0x7e5236, 0x5a3a26],
  hair: [0x2a1c12, 0x4a3020, 0x6e4a2a, 0x9a6a38, 0xc8a060, 0xd8c8a8, 0x8a8a88, 0x7a2e1a],
  coat: [0x5b4a3a, 0x3e4a5c, 0x6a3b32, 0x4d5a3c, 0x7a6a55, 0x3b3b40, 0x2e4a3a, 0x7a2a22, 0x2a3a5a, 0x8a7a5a],
  legs: [0x3a3028, 0x2e2e33, 0x4a4035, 0x5a5048, 0x3e4a5c, 0x5a3b32, 0x6a6048, 0x2a2a2a],
  vest: [0x8a6a3a, 0x6a3b32, 0x3e4a5c, 0xb89a6a, 0x4d5a3c, 0x2a2a2a],
  apron: [null, 0xf0ebe0, 0xe6dcc8, 0xb8a888, 0x6a7a8a],
  hat: [null, 0x2a2420, 0x4a3a2a, 0x3e4a5c, 0x6a3b32, 0x7a6a55],
  eyes: [0x3a2a1a, 0x5a3a20, 0x3a5a7a, 0x4a6a4a, 0x6a7a8a, 0x2a2a2a],
  linen: [0xf0ebe0, 0xe6dcc8, 0xd8ccb0, 0xc8d0d8, 0xb8a888],
  stockings: [0xd8d0c0, 0xf0ebe0, 0x3a3028, 0x5a5048, 0x6a3b32, 0x3e4a5c],
};
// starting points for the builder: a few of the people of the time
export const PRESETS = [
  { name: "Merchant's son", look: { body: "townsman", skin: 0xf1d3bc, hair: 0x6e4a2a, coat: 0x2a3a5a, legs: 0x2e2e33, vest: 0xb89a6a, hat: "hat", hatColor: 0x2a2420, linen: 0xf0ebe0, stockings: 0xf0ebe0, eyes: 0x3a5a7a, height: 1.02, build: 0.98, head: 1 } },
  { name: "Woodcutter", look: { body: "brother", skin: 0xc99a74, hair: 0x4a3020, coat: 0x4d5a3c, legs: 0x4a4035, vest: 0x6a3b32, hat: "hat", hatColor: 0x4a3a2a, linen: 0xd8ccb0, stockings: 0x5a5048, eyes: 0x5a3a20, height: 1.03, build: 1.08, head: 1 } },
  { name: "Farm girl", look: { body: "townswoman", skin: 0xe2b896, hair: 0xc8a060, coat: 0x6a3b32, legs: 0x4a4038, apron: 0xf0ebe0, hat: "hat", hatColor: 0xe6dcc8, linen: 0xf0ebe0, stockings: 0xd8d0c0, eyes: 0x3a5a7a, height: 0.97, build: 0.97, head: 1 } },
  { name: "Woodswoman", look: { body: "sister", skin: 0xa87652, hair: 0x2a1c12, coat: 0x2e4a3a, legs: 0x3e4a5c, apron: null, hat: "none", linen: 0xe6dcc8, stockings: 0x3a3028, eyes: 0x4a6a4a, height: 1.0, build: 1.0, head: 1 } },
  { name: "Old soldier", look: { body: "townsman", skin: 0xe2b896, hair: 0x8a8a88, coat: 0x7a2a22, legs: 0x2a2a2a, vest: null, hat: "hat", hatColor: 0x2a2420, linen: 0xc8d0d8, stockings: 0x2a2a2a, eyes: 0x6a7a8a, height: 1.04, build: 1.05, head: 1.02 } },
  { name: "Burgher's wife", look: { body: "townswoman", skin: 0xf1d3bc, hair: 0x4a3020, coat: 0x3b3b40, legs: 0x2a3a5a, apron: 0xc8d0d8, hat: "hat", hatColor: 0x3b3b40, linen: 0xf0ebe0, stockings: 0xf0ebe0, eyes: 0x5a3a20, height: 0.99, build: 1.0, head: 1 } },
];
const pick = (a, r) => a[Math.floor(r() * a.length)];
export function randomLook(seed = Math.floor(Math.random() * 1e9)) {
  let s = seed | 0 || 1; const r = () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s >>> 0) % 1e6) / 1e6);
  const body = pick(BODIES, r).id;
  return { body, skin: pick(SWATCH.skin, r), hair: pick(SWATCH.hair, r), coat: pick(SWATCH.coat, r), legs: pick(SWATCH.legs, r), vest: pick(SWATCH.vest, r),
    apron: pick(SWATCH.apron.slice(1), r), hatColor: pick(SWATCH.hat.slice(1), r), hat: r() < 0.75 ? "hat" : "none", height: 0.96 + r() * 0.08,
    build: 0.94 + r() * 0.12, head: 0.97 + r() * 0.06, eyes: pick(SWATCH.eyes, r), linen: pick(SWATCH.linen, r), stockings: pick(SWATCH.stockings, r), seed };
}
export const isF = l => (BODIES.find(b => b.id === (l && l.body)) || BODIES[0]).f;
const KEY = "reckoning.mp.look.v1";
export function savedLook() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.look && j.look.body) return j; } catch (e) {}
  return null;
}
export function saveLook(name, look) { try { localStorage.setItem(KEY, JSON.stringify({ name, look })); } catch (e) {} }
// the options a body is made from (makePerson)
export function lookOpts(l, name) {
  l = l || {};
  const body = BODIES.some(b => b.id === l.body) ? l.body : "townsman", f = isF(l);
  const hide = [];
  if (l.hat === "none") hide.push("hat");
  if (f && !l.apron) hide.push("apron");
  return { model: body, name, seed: l.seed, coat: l.coat, legs: f ? undefined : l.legs, skirt: f, skirtColor: f ? l.legs : undefined,
    vest: body === "brother" ? l.vest : undefined, apron: f ? l.apron || undefined : undefined, hatColor: l.hat === "none" ? undefined : l.hatColor,
    skinColor: l.skin, hairColor: l.hair, eyeColor: l.eyes ?? undefined, linenColor: l.linen ?? undefined, stockingsColor: l.stockings ?? undefined,
    scale: l.height || 1, build: l.build || 1, headScale: l.head && l.head !== 1 ? l.head : undefined, hide: hide.length ? hide : undefined };
}
