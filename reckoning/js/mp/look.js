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
};
const pick = (a, r) => a[Math.floor(r() * a.length)];
export function randomLook(seed = Math.floor(Math.random() * 1e9)) {
  let s = seed | 0 || 1; const r = () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0, ((s >>> 0) % 1e6) / 1e6);
  const body = pick(BODIES, r).id;
  return { body, skin: pick(SWATCH.skin, r), hair: pick(SWATCH.hair, r), coat: pick(SWATCH.coat, r), legs: pick(SWATCH.legs, r), vest: pick(SWATCH.vest, r),
    apron: pick(SWATCH.apron.slice(1), r), hatColor: pick(SWATCH.hat.slice(1), r), hat: r() < 0.75 ? "hat" : "none", height: 0.96 + r() * 0.08, seed };
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
    skinColor: l.skin, hairColor: l.hair, scale: l.height || 1, hide: hide.length ? hide : undefined };
}
