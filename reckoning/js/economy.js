// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE PEOPLE'S OWN MONEY: what the settlers earn selling their wares to the pedlar, what you take of it in
// taxes (a tenth of which is yours), and the companies they start — shops of their own, beside the paths,
// with a banner over the counter. You make the laws: how high the taxes, whether they may trade at all,
// and whether they must ask you first.
import { THREE, Builder, MAT, mat } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { CLEARING, FIRE, HUNT } from "./woods.js";
import { makeFood } from "./models.js";
import { starText } from "./cook.js";
import { AUDIO } from "./audio.js";

// what the settlers make of each trade when it is their own business: its name, its colours, what it sells you
export const KINDS = {
  bread:  { name: "Bread",   colour: 0xc8962e, jobs: ["farmer", "baker"],             sells: [["bread", "a loaf", 1, 1]] },
  meats:  { name: "Meats",   colour: 0x8a2a1a, jobs: ["hunter"],                      sells: [["cookedmeat", "roast meat", 1, 1], ["hide", "a hide", 1, 2]] },
  lumber: { name: "Lumber",  colour: 0x4a6a30, jobs: ["woodcutter", "hauler", "sawyer"], sells: [["logs", "three logs", 3, 1]] },
  stone:  { name: "Stone",   colour: 0x6a6a72, jobs: ["quarryman", "brickmaker"],     sells: [["stone", "two stone", 2, 1]] },
  iron:   { name: "Ironmongers", colour: 0x2a3440, jobs: ["smith", "smelter", "miner"], sells: [["iron", "a bar of iron", 1, 3], ["copperore", "copper ore", 1, 1]] },
  goods:  { name: "Goods",   colour: 0x3a4a8a, jobs: [],                              sells: [["hide", "a hide", 1, 2], ["bread", "a loaf", 1, 1]] },
  // an eatery: tables outside, a pot on the fire, and meals as good as whoever cooks them
  eatery: { name: "Eatery",  colour: 0x9a4a2a, jobs: [],                              sells: [] },
};
export const MEAL_PRICE = 1.5;
export const kindFor = job => Object.keys(KINDS).find(k => KINDS[k].jobs.includes(job)) || "goods";
// what a day's work earns a settler, sold to the pedlar
const WAGE = { hunter: 3, smith: 3, miner: 3, quarryman: 2, sawyer: 2, brickmaker: 2, baker: 2, farmer: 2, woodcutter: 2, smelter: 3, doctor: 3, watch: 2, hauler: 1, carter: 2 };
// your cut of what the taxes bring in
export const YOUR_SHARE = 0.1;

export function lawsOf(S) {
  S.laws ??= { business: true, approval: false };
  S.tax ??= 0.1; S.bizTax ??= 0.1; S.companies ??= [];
  return S.laws;
}

// ---- the day's reckoning: wages, taxes, and the companies' trade ----
export function economyDay(town) {
  const S = town.S; lawsOf(S);
  let taxed = 0, biz = 0;
  for (const p of S.people) {
    if (p.child) continue;
    const owner = S.companies.find(c => c.owner === p.name && c.built);
    // (someone half at their own shop does half the settlement's work, but earns more)
    const wage = (WAGE[p.job] || 1) * (owner ? 0.6 : 1) + (p.sick > 0 ? -1 : 0);
    const tax = Math.round(Math.max(0, wage) * S.tax * 10) / 10;
    p.purse = Math.round(((p.purse || 0) + Math.max(0, wage) - tax) * 10) / 10;
    taxed += tax;
  }
  // the town hall's clerk: nothing slips through the ledger — 15% more for each step it has been rebuilt
  const hall = town.hallTier || 0, clerk = Math.round(taxed * 0.15 * hall * 10) / 10;
  taxed += clerk;
  // the companies: what they sold today, and the business tax on it
  for (const c of S.companies) {
    if (!c.built) continue;
    // an eatery's takings are the meals it served today
    if (c.kind === "eatery") {
      const takings = c.till || 0; c.till = 0;
      const t = Math.round(takings * S.bizTax * 10) / 10, owner = S.people.find(p => p.name === c.owner);
      if (owner) owner.purse = Math.round(((owner.purse || 0) + takings - t) * 10) / 10;
      c.earned = Math.round(((c.earned || 0) + takings) * 10) / 10; biz += t;
      continue;
    }
    const sold = Math.min(c.stock || 0, 2 + Math.floor(S.people.length / 4));
    c.stock = (c.stock || 0) - sold; const takings = sold * 1.5;
    const t = Math.round(takings * S.bizTax * 10) / 10;
    const owner = S.people.find(p => p.name === c.owner);
    if (owner) owner.purse = Math.round(((owner.purse || 0) + takings - t) * 10) / 10;
    c.earned = Math.round(((c.earned || 0) + takings) * 10) / 10;
    biz += t;
  }
  const all = taxed + biz;
  if (all > 0) {
    const yours = Math.round(all * YOUR_SHARE * 10) / 10;
    S.coin = Math.round(((S.coin || 0) + all - yours) * 10) / 10;
    if (G.body) { G.body.purse = Math.round(((G.body.purse || 0) + yours) * 10) / 10; G.body.dirty = true; }
    S.taxToday = { taxed: Math.round(taxed * 10) / 10, biz: Math.round(biz * 10) / 10, yours, clerk };
  }
  // someone who has saved a little, and is doing well, starts a business of their own
  if (S.laws.business && town.techGates !== false) {
    const cand = S.people.filter(p => !p.child && (p.purse || 0) >= 12 && !S.companies.some(c => c.owner === p.name) && town.mood(p).value >= 55);
    if (cand.length && Math.random() < 0.35) {
      const p = cand[Math.floor(Math.random() * cand.length)];
      const spot = shopSpot(town);
      if (spot) {
        const eats = S.companies.filter(c => c.kind === "eatery").length, cookSk = (p.sk && p.sk.cooking) || 1;
        const kind = eats < 1 + Math.floor(S.people.length / 12) && S.people.length >= 5 && (cookSk >= 6 || Math.random() < 0.35) ? "eatery" : kindFor(p.job);
        const brand = makeBrand(kind, p.name, Math.floor(Math.random() * 1e9));
        const c = { owner: p.name, kind, name: brand.name, brand, x: spot.x, z: spot.z, ry: spot.ry, logs: 0, built: false, stock: 0, asked: false, day: town.day };
        G.guide && G.guide(kind === "eatery" ? "eatery" : "business");
        if (S.laws.approval) { c.waiting = true; S.companies.push(c); G.tell("trade", p.home, `${p.name} wants to open a shop — ${c.name}. They'll come and ask you.`, 6); }
        else { S.companies.push(c); p.purse -= 10; town.startShop(c); G.tell("trade", p.home, `${p.name} has started a business: ${c.name}. They're gathering the timber for a shop.`, 6); }
      }
    }
  }
  town.persist();
}

// the mood of it: taxes weigh on everyone (less on the contented), and shops cheer the place up
export function economyMood(town, p, base) {
  const S = town.S, out = []; lawsOf(S);
  if (p.child) return out;
  const tol = base >= 70 ? 0.55 : base >= 55 ? 0.75 : 1;
  const t = Math.round(S.tax * 100 * 0.45 * tol);
  if (t) out.push([-t, `taxes at ${Math.round(S.tax * 100)}%${tol < 1 ? " (borne more easily when life is good)" : ""}`]);
  if (S.tax === 0) out.push([4, "no taxes"]);
  const shops = S.companies.filter(c => c.built).length;
  if (shops) out.push([Math.min(8, 3 + shops), `${shops} shop${shops > 1 ? "s" : ""} in the settlement`]);
  const own = S.companies.find(c => c.owner === p.name);
  if (own && own.built) out.push([6, `their own business: ${own.name}`]);
  if (!S.laws.business && (p.purse || 0) >= 12) out.push([-6, "not allowed to trade on their own account"]);
  if (own && own.refused) out.push([-5, "refused leave to open a shop"]);
  if (own && own.built && S.bizTax >= 0.25) out.push([-4, `business tax at ${Math.round(S.bizTax * 100)}%`]);
  return out;
}

// a free spot for a shop: beside a path if there is one, otherwise anywhere open in the settlement
function shopSpot(town) {
  const paths = town.S.buildings.filter(b => b.type === "path");
  const tries = [];
  for (const p of paths) for (const s of [-1, 1]) tries.push({ x: p.x + Math.cos(p.ry) * 3.8 * s, z: p.z - Math.sin(p.ry) * 3.8 * s, ry: p.ry + (s > 0 ? -Math.PI / 2 : Math.PI / 2) });
  // (beside a path at either side, a little along it as well as square to it)
  for (const p of paths) for (const s of [-1, 1]) for (const k of [-1.6, 1.6]) for (const off of [3.4, 4.6]) tries.push({ x: p.x + Math.cos(p.ry) * off * s + Math.sin(p.ry) * k, z: p.z - Math.sin(p.ry) * off * s + Math.cos(p.ry) * k, ry: p.ry + (s > 0 ? -Math.PI / 2 : Math.PI / 2) });
  // anywhere on the settlement's ground: the old clearing, and all the ground marked out since
  const face = (x, z) => Math.atan2(FIRE.x - x, FIRE.z - z);
  for (let i = 0; i < 80; i++) { const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * (town.clearR - 2); const x = CLEARING.x + Math.cos(a) * r, z = CLEARING.z + Math.sin(a) * r; tries.push({ x, z, ry: face(x, z) }); }
  for (const l of town.S.lobes || []) {
    const xs = l.poly.map(p => p[0]), zs = l.poly.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    for (let i = 0; i < 50; i++) { const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0); tries.push({ x, z, ry: face(x, z) }); }
  }
  const taken = c => town.S.companies.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 6);
  for (const t of tries) if (!taken(t) && town.fits("shop", t.x, t.z, t.ry)) return t;
  return null;
}

// the shop itself: a timber booth with a counter under an awning in the company's colour, and a painted banner
export function shopVisual(c) {
  const g = new THREE.Group(), K = KINDS[c.kind];
  const b = new Builder();
  if (!c.built) {
    // staked out, the owner's logs piling beside it
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(0.1, 1.0, 0.1, sx * 1.8, 0.5, sz * 1.4, 0x8a6a45);
    const n = Math.min(c.logs || 0, 10);
    for (let i = 0; i < n; i++) b.box(1.8, 0.2, 0.2, 2.6, 0.1 + Math.floor(i / 3) * 0.2, -0.4 + (i % 3) * 0.22, 0x7a5634);
    g.add(b.build(MAT.rough));
    g.add(banner(c, 2.0));
    return g;
  }
  b.box(3.6, 2.2, 0.12, 0, 1.1, -1.3, 0x6a4a2e);
  for (const sx of [-1.8, 1.8]) b.box(0.12, 2.2, 2.6, sx, 1.1, 0, 0x6a4a2e);
  for (const sx of [-1.75, 1.75]) b.box(0.16, 2.6, 0.16, sx, 1.3, 1.3, 0x4e3a28);
  b.box(3.4, 0.9, 0.5, 0, 0.45, 1.05, 0x7a5634);           // the counter
  b.box(3.6, 0.1, 2.9, 0, 2.3, 0, 0x4e3a28);                 // the roof boards
  // the awning, striped in the company's own colours
  c.brand ??= makeBrand(c.kind, c.owner, 7);
  const Bt = toned(c.brand), h1 = parseInt(Bt.c1.slice(1), 16), h2 = parseInt(Bt.c2.slice(1), 16);
  b.box(3.8, 0.06, 1.2, 0, 2.05, 1.8, h1);
  for (let i = -3; i <= 3; i += 2) b.box(0.5, 0.065, 1.21, i * 0.5, 2.05, 1.8, h2);
  if (c.kind === "eatery") eateryParts(b, c);
  // wares on the counter
  const ware = { bread: 0xb08a4a, meats: 0x7a4234, lumber: 0x7a5634, stone: 0x8a8a90, iron: 0x5a6068, goods: 0x8a7a62, eatery: 0xd8d0bc }[c.kind];
  for (let i = 0; i < Math.min(5, Math.max(1, c.kind === "eatery" ? c.meals || 0 : c.stock || 0)); i++) b.box(0.3, 0.2, 0.25, -1.2 + i * 0.6, 1.0, 1.05, ware);
  g.add(b.build(MAT.rough));
  g.add(banner(c, 2.9));
  return g;
}
// ---- branding: every company its own name, colours, pattern, emblem and banner, made once when it is founded ----
// (the dyes a country trade of 1683 could get: madder, woad, weld, walnut, lichen, iron rust — and cloth left undyed;
//  none of them bright, and all of them faded by the weather)
const PALETTE = [["#8a3e2e", "madder"], ["#3e4c64", "woad"], ["#4e5e42", "green"], ["#a88a46", "weld"], ["#d8ccb0", "undyed"], ["#2e2418", "black"], ["#5a4652", "lichen"], ["#94603a", "rust"], ["#6a4e34", "brown"], ["#4a5a5c", "slate"]];
// any colour, faded toward the dun of old cloth and weathered wood (companies founded before the dyes were dulled too)
const DUN = [0x86, 0x76, 0x60];
function mute(hex, k = 0.32) {
  const v = parseInt(String(hex).slice(1), 16), c = [v >> 16 & 255, v >> 8 & 255, v & 255];
  const grey = (c[0] + c[1] + c[2]) / 3;
  const o = c.map((x, i) => Math.round((x + (grey - x) * 0.35) * (1 - k) + DUN[i] * k * 0.95));
  return "#" + o.map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}
const toned = B => ({ ...B, c1: mute(B.c1), c2: mute(B.c2) });
const PATTERNS = ["plain", "pale", "fess", "bend", "chevron", "quartered", "saltire", "border", "chequy", "stripes", "cross", "wavy"];
const SHAPES = ["square", "swallowtail", "pennant", "banneret", "gonfalon"];
const EMBLEMS = { bread: ["loaf", "sheaf", "mill", "pretzel"], meats: ["antler", "boar", "hare", "knife"], lumber: ["tree", "axe", "saw", "logs"], stone: ["hammer", "tower", "pick", "block"], iron: ["anvil", "hammer", "key", "horseshoe"], goods: ["star", "crown", "ship", "wheel", "key", "fish"], eatery: ["pot", "goose", "spoon", "boar"] };
const NAMEWORDS = {
  bread: [["Golden", "Sheaf"], ["White", "Loaf"], ["Morning", "Oven"], ["Honest", "Crust"], ["Three", "Pretzels"], ["Old", "Mill"]],
  meats: [["Red", "Hart"], ["Wild", "Boar"], ["Hunter's", "Horn"], ["Silver", "Hare"], ["Twelve", "Tines"]],
  lumber: [["Tall", "Spruce"], ["Sharp", "Axe"], ["Green", "Oak"], ["Straight", "Grain"], ["Long", "Saw"]],
  stone: [["Grey", "Tower"], ["True", "Mason"], ["Hard", "Rock"], ["Square", "Block"]],
  iron: [["Black", "Anvil"], ["Iron", "Key"], ["Lucky", "Shoe"], ["Hot", "Forge"]],
  goods: [["Blue", "Star"], ["Crowned", "Ship"], ["Wandering", "Wheel"], ["Golden", "Key"], ["Silver", "Fish"]],
  eatery: [["Golden", "Goose"], ["Boar's", "Head"], ["Merry", "Kettle"], ["Three", "Spoons"], ["Hungry", "Huntsman"], ["Smoking", "Pot"]],
};
const rngOf = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
export function makeBrand(kind, owner, seed) {
  const r = rngOf(seed), pick = a => a[Math.floor(r() * a.length)];
  let c1 = pick(PALETTE), c2 = pick(PALETTE); while (c2 === c1) c2 = pick(PALETTE);
  const words = pick(NAMEWORDS[kind]), style = Math.floor(r() * 4);
  const name = style === 0 ? `The ${words[0]} ${words[1]}` : style === 1 ? `${owner}'s ${KINDS[kind].name}` : style === 2 ? `${owner} & Sons, ${KINDS[kind].name}` : `${words[1]} & ${pick(["Co.", "Company", "Brothers", "Heirs"])}`;
  return { name, c1: c1[0], c2: c2[0], pattern: pick(PATTERNS), emblem: pick(EMBLEMS[kind]), shape: pick(SHAPES), seed };
}
// the field of the cloth, in two colours
function field(x, B, W, H) {
  x.fillStyle = B.c1; x.fillRect(0, 0, W, H); x.fillStyle = B.c2;
  const p = B.pattern;
  if (p === "pale") x.fillRect(W / 3, 0, W / 3, H);
  else if (p === "fess") x.fillRect(0, H / 3, W, H / 3);
  else if (p === "bend") { x.beginPath(); x.moveTo(0, 0); x.lineTo(W * 0.3, 0); x.lineTo(W, H * 0.7); x.lineTo(W, H); x.lineTo(W * 0.7, H); x.lineTo(0, H * 0.3); x.fill(); }
  else if (p === "chevron") { x.beginPath(); x.moveTo(0, H); x.lineTo(W / 2, H * 0.35); x.lineTo(W, H); x.lineTo(W, H * 0.75); x.lineTo(W / 2, H * 0.1); x.lineTo(0, H * 0.75); x.fill(); }
  else if (p === "quartered") { x.fillRect(W / 2, 0, W / 2, H / 2); x.fillRect(0, H / 2, W / 2, H / 2); }
  else if (p === "saltire") { x.lineWidth = Math.min(W, H) * 0.16; x.strokeStyle = B.c2; x.beginPath(); x.moveTo(0, 0); x.lineTo(W, H); x.moveTo(W, 0); x.lineTo(0, H); x.stroke(); }
  else if (p === "border") { x.lineWidth = Math.min(W, H) * 0.12; x.strokeStyle = B.c2; x.strokeRect(0, 0, W, H); }
  else if (p === "chequy") { const n = 6, cw = W / n, ch = H / Math.max(2, Math.round(n * H / W)); for (let i = 0; i < n; i++) for (let j = 0; j * ch < H; j++) if ((i + j) % 2) x.fillRect(i * cw, j * ch, cw, ch); }
  else if (p === "stripes") { for (let i = 0; i < 7; i += 2) x.fillRect(0, i * H / 7, W, H / 7); }
  else if (p === "cross") { x.fillRect(W * 0.42, 0, W * 0.16, H); x.fillRect(0, H * 0.42, W, H * 0.16); }
  else if (p === "wavy") { x.beginPath(); x.moveTo(0, H * 0.45); for (let i = 0; i <= 20; i++) x.lineTo(W * i / 20, H * 0.45 + Math.sin(i * 1.2) * H * 0.06); x.lineTo(W, H); x.lineTo(0, H); x.fill(); }
}
// the emblem, drawn as a sign-painter would: a flat shape, outlined
function emblem(x, B, cx, cy, s) {
  const pale = h => { const v = parseInt(String(h).slice(1), 16); return ((v >> 16 & 255) + (v >> 8 & 255) + (v & 255)) / 3 > 150; };
  const ink = pale(B.c1) || pale(B.c2) ? "#2a1a0c" : "#efe3c4";
  x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = ink; x.strokeStyle = ink; x.lineWidth = 0.08; x.lineJoin = "round"; x.lineCap = "round";
  const P = pts => { x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.fill(); };
  const C = (a, b, r) => { x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.fill(); };
  switch (B.emblem) {
    case "loaf": x.beginPath(); x.ellipse(0, 0.1, 0.7, 0.4, 0, Math.PI, 0); x.lineTo(0.7, 0.2); x.lineTo(-0.7, 0.2); x.fill(); break;
    case "sheaf": for (const a of [-0.4, -0.2, 0, 0.2, 0.4]) { x.beginPath(); x.moveTo(0, 0.6); x.lineTo(Math.sin(a) * 0.9, -0.5); x.stroke(); C(Math.sin(a) * 0.9, -0.55, 0.1); } x.fillRect(-0.25, 0.1, 0.5, 0.12); break;
    case "mill": P([[-0.3, 0.7], [-0.2, -0.2], [0.2, -0.2], [0.3, 0.7]]); for (let i = 0; i < 4; i++) { x.save(); x.translate(0, -0.25); x.rotate(i * Math.PI / 2 + 0.4); x.fillRect(-0.06, -0.7, 0.12, 0.6); x.restore(); } break;
    case "pretzel": x.lineWidth = 0.14; x.beginPath(); x.arc(-0.25, 0, 0.35, 0, Math.PI * 2); x.arc(0.25, 0, 0.35, Math.PI, Math.PI * 3); x.stroke(); break;
    case "antler": x.lineWidth = 0.12; for (const s2 of [-1, 1]) { x.beginPath(); x.moveTo(0, 0.6); x.quadraticCurveTo(s2 * 0.2, -0.1, s2 * 0.6, -0.6); x.moveTo(s2 * 0.2, 0.1); x.lineTo(s2 * 0.55, 0); x.moveTo(s2 * 0.35, -0.25); x.lineTo(s2 * 0.2, -0.6); x.stroke(); } break;
    case "boar": x.beginPath(); x.ellipse(0, 0.1, 0.65, 0.35, 0, 0, Math.PI * 2); x.fill(); P([[0.55, 0], [0.9, 0.1], [0.55, 0.3]]); for (const l of [-0.4, -0.15, 0.2, 0.4]) x.fillRect(l, 0.3, 0.1, 0.35); break;
    case "hare": x.beginPath(); x.ellipse(0, 0.2, 0.5, 0.3, 0, 0, Math.PI * 2); x.fill(); C(0.45, -0.05, 0.2); x.beginPath(); x.ellipse(0.45, -0.45, 0.07, 0.3, 0.2, 0, Math.PI * 2); x.fill(); break;
    case "knife": P([[-0.7, 0.1], [0.4, -0.1], [0.45, 0.1], [-0.7, 0.15]]); x.fillRect(0.45, -0.05, 0.35, 0.18); break;
    case "tree": P([[0, -0.8], [0.55, 0.3], [0.15, 0.3], [0.15, 0.7], [-0.15, 0.7], [-0.15, 0.3], [-0.55, 0.3]]); break;
    case "axe": x.fillRect(-0.05, -0.7, 0.1, 1.4); P([[0.05, -0.6], [0.55, -0.75], [0.55, -0.1], [0.05, -0.25]]); break;
    case "saw": P([[-0.8, -0.1], [0.6, -0.2], [0.6, 0.15], [-0.8, 0.15]]); for (let i = -0.75; i < 0.6; i += 0.15) P([[i, 0.15], [i + 0.075, 0.3], [i + 0.15, 0.15]]); x.fillRect(0.6, -0.3, 0.2, 0.5); break;
    case "logs": for (const [a, b2] of [[-0.3, 0.3], [0.3, 0.3], [0, -0.2]]) { C(a, b2, 0.28); } break;
    case "hammer": x.fillRect(-0.06, -0.3, 0.12, 1.0); x.fillRect(-0.45, -0.6, 0.9, 0.35); break;
    case "tower": P([[-0.4, 0.7], [-0.4, -0.4], [-0.25, -0.4], [-0.25, -0.6], [-0.08, -0.6], [-0.08, -0.4], [0.08, -0.4], [0.08, -0.6], [0.25, -0.6], [0.25, -0.4], [0.4, -0.4], [0.4, 0.7]]); break;
    case "pick": x.fillRect(-0.05, -0.4, 0.1, 1.1); x.beginPath(); x.moveTo(-0.7, -0.2); x.quadraticCurveTo(0, -0.75, 0.7, -0.2); x.lineWidth = 0.14; x.stroke(); break;
    case "block": x.fillRect(-0.55, -0.35, 1.1, 0.7); break;
    case "anvil": P([[-0.7, -0.3], [0.5, -0.3], [0.75, -0.15], [0.3, -0.05], [0.25, 0.3], [0.45, 0.55], [-0.45, 0.55], [-0.25, 0.3], [-0.3, -0.05], [-0.7, -0.1]]); break;
    case "key": x.lineWidth = 0.14; x.beginPath(); x.arc(-0.45, 0, 0.25, 0, Math.PI * 2); x.moveTo(-0.2, 0); x.lineTo(0.7, 0); x.moveTo(0.5, 0); x.lineTo(0.5, 0.25); x.moveTo(0.65, 0); x.lineTo(0.65, 0.2); x.stroke(); break;
    case "horseshoe": x.lineWidth = 0.18; x.beginPath(); x.arc(0, 0, 0.45, Math.PI * 0.15, Math.PI * 0.85, true); x.stroke(); break;
    case "star": { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.3 : 0.75, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); break; }
    case "crown": P([[-0.6, 0.4], [-0.6, -0.3], [-0.3, 0.05], [0, -0.45], [0.3, 0.05], [0.6, -0.3], [0.6, 0.4]]); break;
    case "ship": P([[-0.7, 0.2], [0.7, 0.2], [0.45, 0.55], [-0.45, 0.55]]); x.fillRect(-0.04, -0.7, 0.08, 0.9); P([[0.05, -0.65], [0.5, 0.1], [0.05, 0.1]]); break;
    case "wheel": x.lineWidth = 0.1; x.beginPath(); x.arc(0, 0, 0.55, 0, Math.PI * 2); x.stroke(); for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(i * Math.PI / 3) * 0.55, Math.sin(i * Math.PI / 3) * 0.55); x.stroke(); } C(0, 0, 0.12); break;
    case "pot": x.beginPath(); x.ellipse(0, 0.15, 0.6, 0.45, 0, 0, Math.PI); x.lineTo(-0.6, 0.15); x.fill(); x.fillRect(-0.7, 0.05, 1.4, 0.12); for (const l of [-0.4, 0.4]) x.fillRect(l - 0.05, 0.5, 0.1, 0.25); x.lineWidth = 0.07; for (const sx of [-0.25, 0, 0.25]) { x.beginPath(); x.moveTo(sx, -0.05); x.quadraticCurveTo(sx + 0.12, -0.3, sx, -0.5); x.quadraticCurveTo(sx - 0.12, -0.65, sx, -0.8); x.stroke(); } break;
    case "goose": x.beginPath(); x.ellipse(0.1, 0.25, 0.55, 0.3, 0, 0, Math.PI * 2); x.fill(); x.lineWidth = 0.16; x.beginPath(); x.moveTo(-0.3, 0.15); x.quadraticCurveTo(-0.55, -0.2, -0.35, -0.55); x.stroke(); C(-0.35, -0.6, 0.15); P([[-0.48, -0.62], [-0.78, -0.55], [-0.48, -0.5]]); break;
    case "spoon": x.save(); x.rotate(-0.6); x.beginPath(); x.ellipse(0, -0.45, 0.22, 0.3, 0, 0, Math.PI * 2); x.fill(); x.fillRect(-0.06, -0.2, 0.12, 0.95); x.restore(); break;
    case "fish": x.beginPath(); x.ellipse(-0.1, 0, 0.55, 0.28, 0, 0, Math.PI * 2); x.fill(); P([[0.4, 0], [0.8, -0.3], [0.8, 0.3]]); break;
  }
  x.restore();
}
const texOf = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
// the hanging banner, in its cut: square, swallow-tailed, a long pennant, a small banneret or a gonfalon with tails
function bannerCloth(B) {
  B = toned(B);
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 256;
  const x = cv.getContext("2d");
  x.save();
  x.beginPath();
  const W = 128, H = 256;
  if (B.shape === "swallowtail") { x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, H); x.lineTo(W / 2, H * 0.78); x.lineTo(0, H); }
  else if (B.shape === "pennant") { x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W / 2, H); }
  else if (B.shape === "banneret") { x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, H * 0.6); x.lineTo(0, H * 0.6); }
  else if (B.shape === "gonfalon") { x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, H * 0.8); x.lineTo(W * 0.83, H); x.lineTo(W * 0.66, H * 0.8); x.lineTo(W * 0.5, H); x.lineTo(W * 0.33, H * 0.8); x.lineTo(W * 0.17, H); x.lineTo(0, H * 0.8); }
  else { x.rect(0, 0, W, H * 0.85); }
  x.closePath(); x.clip();
  field(x, B, W, H);
  emblem(x, B, W / 2, H * (B.shape === "banneret" ? 0.3 : 0.38), 38);
  x.restore();
  return texOf(cv);
}
// the sign over the counter: the name, and the emblem either side, on a board in the company's colours
function signBoard(c) {
  const B = toned(c.brand), cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
  const x = cv.getContext("2d");
  x.fillStyle = "#efe3c4"; x.fillRect(0, 0, 512, 128);
  x.fillStyle = B.c1; x.fillRect(0, 0, 512, 14); x.fillRect(0, 114, 512, 14); x.fillStyle = B.c2; x.fillRect(0, 14, 512, 5); x.fillRect(0, 109, 512, 5);
  const Bi = { ...B, c1: "#efe3c4", c2: "#efe3c4" };
  x.save(); x.fillStyle = B.c1; x.beginPath(); x.arc(60, 64, 40, 0, Math.PI * 2); x.arc(452, 64, 40, 0, Math.PI * 2); x.fill(); x.restore();
  emblem(x, { ...Bi, c1: B.c1 }, 60, 64, 30); emblem(x, { ...Bi, c1: B.c1 }, 452, 64, 30);
  x.fillStyle = "#2a1a0c"; x.textAlign = "center"; x.textBaseline = "middle";
  let size = 40; x.font = `italic ${size}px Georgia, serif`; while (x.measureText(c.name).width > 320 && size > 18) { size -= 2; x.font = `italic ${size}px Georgia, serif`; }
  x.fillText(c.name, 256, 66);
  return texOf(cv);
}
function banner(c, y) {
  c.brand ??= makeBrand(c.kind, c.owner, Math.floor(Math.random() * 1e9));
  const g = new THREE.Group();
  // the sign across the front
  // (a board painted both sides: the name reads right from the front and from behind, and it's lit by the day like
  //  the house it hangs on, dim at dusk, not glowing in the dark)
  const sm = new THREE.MeshStandardMaterial({ map: signBoard(c), roughness: 0.85 });
  for (const back of [0, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), sm);
    sign.position.set(0, y, 1.95 + (back ? -0.012 : 0.012)); sign.rotation.y = back ? Math.PI : 0; g.add(sign);
  }
  const edge = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.74, 0.02), mat(0x4e3a28)); edge.position.set(0, y, 1.95); g.add(edge);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.06), mat(0x4e3a28)); rail.position.set(0, y + 0.38, 1.95); g.add(rail);
  // the banner on its own pole beside the shop, hanging from a crossbar
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6), mat(0x4e3a28)); pole.position.set(2.4, 2.1, 1.6); g.add(pole);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), mat(0x4e3a28)); bar.position.set(2.4 + 0.45, 3.95, 1.6); g.add(bar);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7), new THREE.MeshStandardMaterial({ map: bannerCloth(c.brand), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.95 }));
  cloth.position.set(2.4 + 0.45, 3.1, 1.6); cloth.rotation.y = Math.PI / 2; g.add(cloth);
  g.userData.cloth = cloth;
  return g;
}
// what the shop sells you, out of its stock, for your own purse
export function shopOffers(town, c) {
  const K = KINDS[c.kind], pl = G.player;
  if (c.kind === "eatery") {
    const q = c.quality || 2.5, dish = c.dish || "the pot of the day", cap = dish[0].toUpperCase() + dish.slice(1), cook = town.S.people.find(p => p.name === c.owner);
    return [{ icon: "dish", label: `Buy a meal: ${dish} ${starText(q)}`, note: `Cooked by ${c.owner}${cook ? ` (Cooking ${(cook.sk && cook.sk.cooking) || 1})` : ""}. ${c.meals || 0} left in the pot. Eat it, or put it in the stores for someone else.`, get: "2 DM",
      can: () => (G.body.purse || 0) >= 2 && (c.meals || 0) > 0,
      do: () => {
        G.pack.push({ icon: "dish", dish: "eatery", name: `${cap} ${starText(q)}`, base: cap, stars: q, fill: Math.round((0.3 + q * 0.04) * 100) / 100, uid: Math.floor(Math.random() * 1e9), n: 1, note: `Bought at ${c.name}, cooked by ${c.owner}` });
        G.body.purse -= 2; G.body.dirty = true; c.meals -= 1; c.till = (c.till || 0) + 2; town.persist();
      } }];
  }
  return K.sells.map(([icon, what, n, price]) => ({
    icon: icon === "logs" ? "logs" : icon, label: `Buy ${what}`, note: `${c.name} — cheaper than the pedlar. ${c.stock || 0} in stock.`, get: `${price} DM`,
    can: () => (G.body.purse || 0) >= price && (c.stock || 0) > 0 && (icon !== "logs" || pl.carryN + n <= 6),
    do: () => {
      if (icon === "logs") pl.carryN += n; else if (!G.packAdd(icon, n)) return;
      if (icon === "logs") UI.carry(`Carrying ${pl.carryN} logs`);
      G.body.purse -= price; G.body.dirty = true; c.stock -= 1;
      const o = town.S.people.find(p => p.name === c.owner); if (o) o.purse = (o.purse || 0) + price;
      town.persist();
    },
  }));
}

// ---- the eateries ----
// beside the booth: a trestle table each side with a bench along both its sides, and behind the counter a pot on a tripod
const SEATS = [[-2.3, 0.15], [-2.3, 0.85], [-3.5, 0.15], [-3.5, 0.85], [2.3, 0.15], [2.3, 0.85], [3.5, 0.15], [3.5, 0.85]];
function eateryParts(b, c) {
  for (const s of [-1, 1]) {
    b.box(0.75, 0.06, 1.7, s * 2.9, 0.75, 0.5, 0x8a6440);
    for (const dz of [-0.2, 1.2]) b.box(0.6, 0.72, 0.08, s * 2.9, 0.36, dz, 0x6a4a2e);
    for (const bx of [2.3, 3.5]) { b.box(0.3, 0.05, 1.7, s * bx, 0.45, 0.5, 0x7a5634); for (const dz of [-0.2, 1.2]) b.box(0.25, 0.42, 0.06, s * bx, 0.21, dz, 0x5a3e28); }
    for (const dz of [0.15, 0.85]) b.box(0.18, 0.04, 0.18, s * 2.9, 0.8, dz, 0xe8e0cc);              // trenchers laid out
  }
  // the pot on its tripod, over a little fire, inside the booth
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; b.box(0.05, 1.3, 0.05, 0.9 + Math.cos(a) * 0.3, 0.62, -0.4 + Math.sin(a) * 0.3, 0x4e3a28, a); }
  b.box(0.42, 0.32, 0.42, 0.9, 0.42, -0.4, 0x2a2a2c);
  b.box(0.36, 0.04, 0.36, 0.9, 0.6, -0.4, 0x6a4a32);
  b.box(0.5, 0.08, 0.5, 0.9, 0.04, -0.4, 0x3a1a0a);
}
const local = (c, lx, lz) => ({ x: c.x + lx * Math.cos(c.ry) + lz * Math.sin(c.ry), z: c.z - lx * Math.sin(c.ry) + lz * Math.cos(c.ry) });
export const eaterySolids = () => [[-2.9, 0.1, 0.42], [-2.9, 0.9, 0.42], [2.9, 0.1, 0.42], [2.9, 0.9, 0.42], [0.9, -0.4, 0.3]];

// ---- their own trade: a break in the day to make something of their own, sold to Henning or Tobias for their own purse ----
// (nothing out of the settlement's stores: what they gather or make in their own time, and the DM is theirs, untaxed)
const SIDE = {
  woodcutter: ["a bundle of kindling", "gathering kindling", "gather"], hauler: ["a bundle of kindling", "gathering kindling", "gather"], sawyer: ["a bundle of kindling", "gathering kindling", "gather"],
  farmer: ["a basket of mushrooms", "picking mushrooms", "gather"], baker: ["a basket of mushrooms", "picking mushrooms", "gather"],
  hunter: ["a rabbit skin", "setting a snare", "gather"], doctor: ["a bunch of herbs", "gathering herbs", "gather"],
  quarryman: ["a whittled spoon", "whittling", "whittle"], miner: ["a whittled spoon", "whittling", "whittle"], brickmaker: ["a whittled spoon", "whittling", "whittle"],
  smelter: ["a carved peg", "carving pegs", "whittle"], smith: ["a carved peg", "carving pegs", "whittle"], watch: ["a carved peg", "carving pegs", "whittle"],
};
export const sideOf = p => SIDE[p.job] || SIDE.hauler;
export async function sideShift(town, a, sleep, alive) {
  const S = town.S, p = a.settler;
  if (!p || p.child || p.jailedDay != null || a.settler.follow || !p.name) return false;
  const f = town.frac; if (f < 0.2 || f > 0.66) return false;
  // (out in a settlement in the forest, only if the trader's cart is within a walk)
  const traders = [...(town.tradersHere || [])].filter(t => t.h && t.h.root && t.h.root.parent && (!town.colony || Math.hypot(t.h.pos.x - a.pos.x, t.h.pos.z - a.pos.z) < 160));
  const [what, doing, pose] = sideOf(p);
  // stolen goods, sold on the quiet to the first trader in — and someone may see it
  if (p.loot && traders.length && p.soldDay !== town.day && Math.random() < 0.6) {
    const t = traders[0], l = p.loot;
    p.soldDay = town.day;
    a.doing = `selling ${l.n} ${l.name} to ${t.name}, on the quiet`;
    await Promise.race([a.walkTo(t.h.pos.x - 1.1, t.h.pos.z + 0.8, 1.4), sleep(120)]); alive();
    if (!t.h.root.parent || Math.hypot(t.h.pos.x - a.pos.x, t.h.pos.z - a.pos.z) > 4) { p.soldDay = null; return true; }
    a.faceTo(t.h.pos.x, t.h.pos.z); a.person.setPose("reach"); await sleep(1.5); alive(); a.person.setPose("idle");
    const pay = Math.max(0.5, Math.round(l.worth * 10) / 10);
    p.loot = null;
    const watch = S.people.some(q => q.job === "watch" && q !== p) && town.has && town.has("jail");
    if (watch && Math.random() < 0.4) {
      // caught in the act: the money goes back to the treasury, and the thief to the jail
      S.coin = Math.round(((S.coin || 0) + pay) * 10) / 10; p.jailedDay = town.day; S.caught = (S.caught || 0) + 1;
      town.setMark && town.setMark(p, "disgraced", `caught selling stolen ${l.name} to ${t.name}`);
      G.tell("crime", p.home, `The watch caught ${p.name} selling ${l.n} ${l.name} to ${t.name} — the settlement's own, stolen. The ${pay} DM goes back to the treasury, and ${p.name} to the jail.`, 7);
    } else {
      p.purse = Math.round(((p.purse || 0) + pay) * 10) / 10;
      if (Math.random() < 0.6) G.tell("crime", p.home, `${p.name} was seen selling ${l.n} ${l.name} to ${t.name}. Where did they come by that?`, 6);
      else G.report && G.report(`${p.name} sold ${l.n} ${l.name} to ${t.name}, on the quiet.`, "crime", p.home);
    }
    town.persist();
    return true;
  }
  // the break: once a day, an hour or so of their own
  if (p.sideDay !== town.day && (p.wares || 0) < 4 && Math.random() < (f > 0.45 ? 1 : 0.3)) {
    p.sideDay = town.day;
    a.doing = `${doing} — their own time`;
    if (pose === "reach") {
      // out to the trees at the edge of things
      let best = null, bd = Infinity;
      for (const t of town.w.fellable || []) {
        if (t.state !== "up") continue;
        const d = Math.hypot(t.x - a.pos.x, t.z - a.pos.z);
        if (d > 6 && d < bd && d < 45) { bd = d; best = t; }
      }
      if (best) { const k = 1.1 / Math.max(0.1, bd); await Promise.race([a.walkTo(best.x + (a.pos.x - best.x) * k, best.z + (a.pos.z - best.z) * k, 1.3), sleep(25)]); alive(); a.faceTo(best.x, best.z); }
    }
    a.person.setPose(pose); await sleep(7 + Math.random() * 5); alive(); a.person.setPose("idle");
    p.wares = (p.wares || 0) + 1 + (Math.random() < 0.4 ? 1 : 0); p.waresOf = what;
    town.persist();
    return true;
  }
  // a trader in: what they've made goes to him, and the money into their own purse
  if ((p.wares || 0) > 0 && traders.length && p.soldDay !== town.day && Math.random() < (f > 0.4 ? 1 : 0.5)) {
    const t = traders.sort((x, y) => Math.hypot(x.h.pos.x - a.pos.x, x.h.pos.z - a.pos.z) - Math.hypot(y.h.pos.x - a.pos.x, y.h.pos.z - a.pos.z))[0];
    p.soldDay = town.day;
    a.doing = `selling ${p.waresOf || "what they made"} to ${t.name}`;
    await Promise.race([a.walkTo(t.h.pos.x + 1.2, t.h.pos.z + 0.6, 1.4), sleep(120)]); alive();
    if (!t.h.root.parent || Math.hypot(t.h.pos.x - a.pos.x, t.h.pos.z - a.pos.z) > 4) { p.soldDay = null; return true; }
    a.faceTo(t.h.pos.x, t.h.pos.z); a.person.setPose("reach"); await sleep(1.5); alive(); a.person.setPose("idle");
    const pay = Math.round(p.wares * (1 + Math.random() * 0.8) * 10) / 10;
    p.purse = Math.round(((p.purse || 0) + pay) * 10) / 10; p.earnedOwn = Math.round(((p.earnedOwn || 0) + pay) * 10) / 10; p.ownDay = town.day;
    G.report && G.report(`${p.name} sold ${p.waresOf || "what they made"} to ${t.name} for ${pay} DM, in their own time.`, "trade", p.home);
    if (Math.random() < 0.35) UI.bark && UI.bark(p.name, [`${pay} DM for ${p.waresOf}. Not bad.`, "That's mine, that is.", `${t.name} drives a hard bargain.`, "A little put by."][Math.floor(Math.random() * 4)], 2.5);
    p.wares = 0;
    town.persist();
    return true;
  }
  return false;
}

// midday, with money in their purse and an eatery open: a meal, sat at its table
export async function dineShift(town, a, sleep, alive) {
  const S = town.S, p = a.settler; lawsOf(S);
  if (!p || p.child || p.jailedDay != null || p.dined === town.day || a.settler.follow) return false;
  const f = town.frac; if (f < 0.38 || f > 0.62) return false;
  const open = S.companies.filter(c => c.kind === "eatery" && c.built && (c.meals || 0) > 0);
  if (!open.length || (p.purse || 0) < MEAL_PRICE || Math.random() < 0.3) return false;
  const c = open.sort((x, y) => Math.hypot(x.x - a.pos.x, x.z - a.pos.z) - Math.hypot(y.x - a.pos.x, y.z - a.pos.z))[0];
  c._seat ??= {};
  const si = SEATS.findIndex((_, i) => !c._seat[i]); if (si < 0) return false;
  p.dined = town.day; c._seat[si] = p.name;
  try {
    a.doing = `going for a meal at ${c.name}`;
    const front = local(c, 0, 2.4);
    await a.walkTo(front.x, front.z, 1.3); alive();
    a.faceTo(c.x, c.z); a.person.setPose("reach"); await sleep(1.2); alive(); a.person.setPose("hold");
    if ((c.meals || 0) <= 0) return true;
    c.meals--; p.purse = Math.round((p.purse - MEAL_PRICE) * 10) / 10; c.till = (c.till || 0) + MEAL_PRICE;
    const [lx, lz] = SEATS[si], seat = local(c, lx, lz), side = lx < 0 ? -1 : 1, table = local(c, side * 2.9, lz);
    const near = local(c, lx, 1.8);
    await a.walkTo(near.x, near.z, 1.1); alive();
    a.place(seat.x, seat.z); a.faceTo(table.x, table.z);
    a.person.setPose("eat"); a.person.sitting = 1;
    const bowl = a.hold(makeFood("dish"));
    a.doing = `eating at ${c.name}`;
    for (let i = 0; i < 6; i++) {
      await sleep(1.2); alive();
      if (G.player && Math.hypot(G.player.pos.x - a.pos.x, G.player.pos.z - a.pos.z) < 7 && Math.random() < 0.6) AUDIO.chew && AUDIO.chew();
    }
    a.person.held.remove(bowl); a.person.sitting = 0; a.person.setPose("idle");
    p.meal = { day: town.day, stars: c.quality || 2.5, name: c.dish || "a hot meal", where: `at ${c.name}` };
    town.persist(); town.showShop && town.showShop(c);
    if (Math.random() < 0.3) UI.bark(p.name, (c.quality || 2.5) >= 4 ? "Now that's cooking." : (c.quality || 2.5) >= 2.5 ? "Not bad at all." : "Hm. I've had better.", 2.5);
    return true;
  } finally { delete c._seat[si]; if (a.person) a.person.sitting = 0; }
}

// the owner of an eatery: cooks when there is food in the larder, buys from the other businesses when there isn't
// (or goes out and gets it), and otherwise keeps the counter
export async function eateryShift(town, a, c, sleep, alive) {
  const S = town.S, owner = a.settler; c.larder ??= { meat: 1, grain: 1 };
  const L = c.larder, at = (lx, lz) => local(c, lx, lz), half = x => Math.round(x * 2) / 2;
  if ((c.meals || 0) < 6 && L.meat > 0) {
    a.doing = `cooking at ${c.name}`;
    const st = at(0.9, 0.35), pot = at(0.9, -0.4);
    await a.walkTo(st.x, st.z, 1.2); alive();
    a.faceTo(pot.x, pot.z); a.person.setPose("stir");
    for (let i = 0; i < 4; i++) { await sleep(2.2); alive(); if (G.player && Math.hypot(G.player.pos.x - a.pos.x, G.player.pos.z - a.pos.z) < 8) AUDIO.stir && AUDIO.stir(); }
    a.person.setPose("idle");
    L.meat--; const grain = L.grain > 0 ? (L.grain--, 1) : 0;
    const lv = (owner.sk && owner.sk.cooking) || 1;
    c.quality = Math.max(1, Math.min(5, half(1.5 + lv / 22 + grain * 0.5 + (Math.random() - 0.5) * 0.8)));
    c.dish = grain ? ["a thick stew", "pottage", "meat and dumplings", "a hotpot"][Math.floor(Math.random() * 4)] : ["roast meat", "a fry of meat", "chops"][Math.floor(Math.random() * 3)];
    c.meals = (c.meals || 0) + 4;
    town.learn ? town.learn(a, "cooking", 2) : null;
    town.showShop(c); town.persist();
    return true;
  }
  if (L.meat < 2 || L.grain < 2) {
    const want = L.meat < 2 ? "meats" : "bread";
    // from another business, if one has it to sell
    const sup = S.companies.find(o => o !== c && o.built && o.kind === want && (o.stock || 0) > 0);
    if (sup && (owner.purse || 0) >= 1.5) {
      a.doing = `buying ${want === "meats" ? "meat" : "bread"} for ${c.name} from ${sup.name}`;
      const fr = local(sup, 0, 2.4);
      await a.walkTo(fr.x, fr.z, 1.2); alive();
      a.faceTo(sup.x, sup.z); a.person.setPose("reach"); await sleep(2); alive(); a.person.setPose("hold");
      if ((sup.stock || 0) > 0) {
        sup.stock--; owner.purse = Math.round((owner.purse - 1.5) * 10) / 10;
        const so = S.people.find(p => p.name === sup.owner); if (so) so.purse = Math.round(((so.purse || 0) + 1.5) * 10) / 10;
        if (want === "meats") L.meat += 2; else L.grain += 2;
        town.showShop(sup);
      }
      const back = at(0.9, 0.6); await a.walkTo(back.x, back.z, 1.1); alive(); a.person.setPose("idle");
      town.persist(); return true;
    }
    // or they get it themselves: out to the deer ride for meat, or rye from the stores, paid for
    if (want === "meats") {
      a.doing = `out hunting for ${c.name}'s pot`;
      await a.walkTo(HUNT.x + (Math.random() - 0.5) * 10, HUNT.z + (Math.random() - 0.5) * 10, 1.3); alive();
      a.person.setPose("reach"); await sleep(9); alive(); a.person.setPose("hold");
      L.meat += 1;
      const back = at(0.9, 0.6); await a.walkTo(back.x, back.z, 1.1); alive(); a.person.setPose("idle");
      town.persist(); return true;
    }
    if ((S.rye || 0) > 8 && (owner.purse || 0) >= 1) {
      a.doing = `fetching rye for ${c.name}`;
      const st = town.stackAt || { x: FIRE.x + 3, z: FIRE.z };
      await a.walkTo(st.x + 1, st.z + 0.5, 1.2); alive();
      a.person.setPose("hold"); S.rye -= 2; owner.purse -= 1; S.coin = (S.coin || 0) + 1; L.grain += 2;
      const back = at(0.9, 0.6); await a.walkTo(back.x, back.z, 1.1); alive(); a.person.setPose("idle");
      town.persist(); town.showStore && town.showStore(); return true;
    }
  }
  a.doing = `serving at ${c.name}`;
  const ctr = at(0, 0.3);
  await a.walkTo(ctr.x, ctr.z, 1.2); alive();
  const out = at(0, 3); a.faceTo(out.x, out.z); a.person.setPose("armsCrossed");
  await sleep(10); alive(); a.person.setPose("idle");
  return true;
}
