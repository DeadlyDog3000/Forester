// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// YOUR LOOK IN A MULTIPLAYER GAME: what the character builder makes, kept on this computer and sent to the others,
// and how it becomes a body (the townsfolk's own models, in your colours).

// the outfits: each a body of the townsfolk's own, in its own clothes (the colours of them yours to choose)
export const BODIES = [
  { id: "townsman", common: true, name: "Burgher", f: false, note: "Coat, breeches and buckled shoes" },
  { id: "brother", common: true, name: "Woodsman", f: false, note: "A woodsman's coat and waistcoat" },
  { id: "father", common: true, name: "Craftsman", f: false, note: "Waistcoat and shirtsleeves, ready for work" },
  { id: "jakob", common: true, name: "Apprentice", f: false, note: "A plain short coat, a boy's first good one" },
  { id: "magistrate", name: "Gentleman", f: false, note: "The long coat of a man of standing" },
  { id: "watchman", name: "Watchman", f: false, note: "The city's coat, a sash across it" },
  { id: "raider", name: "Rover", f: false, note: "Fur and leather, rough-made for the road" },
  { id: "townswoman", common: true, name: "Burgher's wife", f: true, note: "Bodice, skirt and apron" },
  { id: "sister", common: true, name: "Woodswoman", f: true, note: "A working dress, sleeves rolled" },
  { id: "albers", common: true, name: "Goodwife", f: true, note: "A housewife's dress and apron, a cap to it" },
  { id: "watchwoman", name: "Watchwoman", f: true, note: "The city's colours, a sash across them" },
];
// the hats, besides the one an outfit comes with (and none): each another outfit's own hat, by that outfit's model
export const HAT_STYLES = [
  { id: "hat", name: "The outfit's own" }, { id: "none", name: "None" },
  { id: "townsman", name: "Burgher's hat" }, { id: "brother", name: "Woodsman's hat" }, { id: "magistrate", name: "Gentleman's hat" },
  { id: "jakob", name: "Apprentice's cap" }, { id: "watchman", name: "Watchman's hat" }, { id: "watchman_tricorn", name: "Tricorn" },
  { id: "raider", name: "Fur hat" }, { id: "townswoman", name: "Bonnet" }, { id: "albers", name: "Goodwife's cap" }, { id: "watchwoman", name: "Watchwoman's hat" },
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
  sash: [0x8a2a22, 0xb8a060, 0x2a3a5a, 0x2e4a3a, 0xe6dcc8, 0x3b3b40],
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
  const body = pick(BODIES.filter(b => b.common), r).id;   // (a settler dresses as working folk do: no watchmen's sashes or rovers' furs)
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
  const hide = [], style = HAT_STYLES.some(h => h.id === l.hat) ? l.hat : "hat";
  if (style !== "hat") hide.push("hat");
  if (f && !l.apron) hide.push("apron");
  // (the face: a beard and a moustache, either, or neither — where the outfit's man has them)
  if (l.face === "clean") hide.push("beard", "tash"); else if (l.face === "tash") hide.push("beard");
  return { model: body, name, seed: l.seed, coat: l.coat, legs: f ? undefined : l.legs, skirt: f, skirtColor: f ? l.legs : undefined,
    vest: l.vest ?? undefined, apron: f ? l.apron || undefined : undefined, hatColor: style === "none" ? undefined : l.hatColor, hatStyle: style === "hat" || style === "none" ? undefined : style, sash: l.sash ?? undefined,
    skinColor: l.skin, hairColor: l.hair, eyeColor: l.eyes ?? undefined, linenColor: l.linen ?? undefined, stockingsColor: l.stockings ?? undefined,
    scale: l.height || 1, build: l.build || 1, headScale: l.head && l.head !== 1 ? l.head : undefined, hide: hide.length ? hide : undefined };
}
