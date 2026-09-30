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
import { CLEARING, FIRE } from "./woods.js";

// what the settlers make of each trade when it is their own business: its name, its colours, what it sells you
export const KINDS = {
  bread:  { name: "Bread",   colour: 0xc8962e, jobs: ["farmer", "baker"],             sells: [["bread", "a loaf", 1, 1]] },
  meats:  { name: "Meats",   colour: 0x8a2a1a, jobs: ["hunter"],                      sells: [["cookedmeat", "roast meat", 1, 1], ["hide", "a hide", 1, 2]] },
  lumber: { name: "Lumber",  colour: 0x4a6a30, jobs: ["woodcutter", "hauler", "sawyer"], sells: [["logs", "three logs", 3, 1]] },
  stone:  { name: "Stone",   colour: 0x6a6a72, jobs: ["quarryman", "brickmaker"],     sells: [["stone", "two stone", 2, 1]] },
  iron:   { name: "Ironmongers", colour: 0x2a3440, jobs: ["smith", "smelter", "miner"], sells: [["iron", "a bar of iron", 1, 3], ["copperore", "copper ore", 1, 1]] },
  goods:  { name: "Goods",   colour: 0x3a4a8a, jobs: [],                              sells: [["hide", "a hide", 1, 2], ["bread", "a loaf", 1, 1]] },
};
export const kindFor = job => Object.keys(KINDS).find(k => KINDS[k].jobs.includes(job)) || "goods";
// what a day's work earns a settler, sold to the pedlar
const WAGE = { hunter: 3, smith: 3, miner: 3, quarryman: 2, sawyer: 2, brickmaker: 2, baker: 2, farmer: 2, woodcutter: 2, smelter: 3, doctor: 3, watch: 2, hauler: 1 };
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
  // the companies: what they sold today, and the business tax on it
  for (const c of S.companies) {
    if (!c.built) continue;
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
    S.taxToday = { taxed: Math.round(taxed * 10) / 10, biz: Math.round(biz * 10) / 10, yours };
  }
  // someone who has saved a little, and is doing well, starts a business of their own
  if (S.laws.business && town.techGates !== false) {
    const cand = S.people.filter(p => !p.child && (p.purse || 0) >= 12 && !S.companies.some(c => c.owner === p.name) && town.mood(p).value >= 55);
    if (cand.length && Math.random() < 0.35) {
      const p = cand[Math.floor(Math.random() * cand.length)];
      const spot = shopSpot(town);
      if (spot) {
        const kind = kindFor(p.job);
        const brand = makeBrand(kind, p.name, Math.floor(Math.random() * 1e9));
        const c = { owner: p.name, kind, name: brand.name, brand, x: spot.x, z: spot.z, ry: spot.ry, logs: 0, built: false, stock: 0, asked: false, day: town.day };
        G.guide && G.guide("business");
        if (S.laws.approval) { c.waiting = true; S.companies.push(c); UI.hint(`${p.name} wants to open a shop — ${c.name}. They'll come and ask you.`, 6); }
        else { S.companies.push(c); p.purse -= 10; town.startShop(c); UI.hint(`${p.name} has started a business: ${c.name}. They're gathering the timber for a shop.`, 6); }
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
  for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * (town.clearR - 4); tries.push({ x: CLEARING.x + Math.cos(a) * r, z: CLEARING.z + Math.sin(a) * r, ry: Math.atan2(FIRE.x - CLEARING.x - Math.cos(a) * r, FIRE.z - CLEARING.z - Math.sin(a) * r) }); }
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
  const h1 = parseInt(c.brand.c1.slice(1), 16), h2 = parseInt(c.brand.c2.slice(1), 16);
  b.box(3.8, 0.06, 1.2, 0, 2.05, 1.8, h1);
  for (let i = -3; i <= 3; i += 2) b.box(0.5, 0.065, 1.21, i * 0.5, 2.05, 1.8, h2);
  // wares on the counter
  const ware = { bread: 0xc8962e, meats: 0x8a3a2a, lumber: 0x7a5634, stone: 0x8a8a90, iron: 0x5a6068, goods: 0x9a7a5a }[c.kind];
  for (let i = 0; i < Math.min(5, Math.max(1, c.stock || 0)); i++) b.box(0.3, 0.2, 0.25, -1.2 + i * 0.6, 1.0, 1.05, ware);
  g.add(b.build(MAT.rough));
  g.add(banner(c, 2.9));
  return g;
}
// ---- branding: every company its own name, colours, pattern, emblem and banner, made once when it is founded ----
const PALETTE = [["#8a1e1e", "red"], ["#1e3a6a", "blue"], ["#2a5a2a", "green"], ["#c8962e", "gold"], ["#e8dcc0", "white"], ["#2a1a0c", "black"], ["#5a2a6a", "purple"], ["#b85a1a", "orange"], ["#6a4a2e", "brown"], ["#3a6a6a", "teal"]];
const PATTERNS = ["plain", "pale", "fess", "bend", "chevron", "quartered", "saltire", "border", "chequy", "stripes", "cross", "wavy"];
const SHAPES = ["square", "swallowtail", "pennant", "banneret", "gonfalon"];
const EMBLEMS = { bread: ["loaf", "sheaf", "mill", "pretzel"], meats: ["antler", "boar", "hare", "knife"], lumber: ["tree", "axe", "saw", "logs"], stone: ["hammer", "tower", "pick", "block"], iron: ["anvil", "hammer", "key", "horseshoe"], goods: ["star", "crown", "ship", "wheel", "key", "fish"] };
const NAMEWORDS = {
  bread: [["Golden", "Sheaf"], ["White", "Loaf"], ["Morning", "Oven"], ["Honest", "Crust"], ["Three", "Pretzels"], ["Old", "Mill"]],
  meats: [["Red", "Hart"], ["Wild", "Boar"], ["Hunter's", "Horn"], ["Silver", "Hare"], ["Twelve", "Tines"]],
  lumber: [["Tall", "Spruce"], ["Sharp", "Axe"], ["Green", "Oak"], ["Straight", "Grain"], ["Long", "Saw"]],
  stone: [["Grey", "Tower"], ["True", "Mason"], ["Hard", "Rock"], ["Square", "Block"]],
  iron: [["Black", "Anvil"], ["Iron", "Key"], ["Lucky", "Shoe"], ["Hot", "Forge"]],
  goods: [["Blue", "Star"], ["Crowned", "Ship"], ["Wandering", "Wheel"], ["Golden", "Key"], ["Silver", "Fish"]],
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
  const ink = B.c1 === "#e8dcc0" || B.c2 === "#e8dcc0" ? "#2a1a0c" : "#efe3c4";
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
    case "fish": x.beginPath(); x.ellipse(-0.1, 0, 0.55, 0.28, 0, 0, Math.PI * 2); x.fill(); P([[0.4, 0], [0.8, -0.3], [0.8, 0.3]]); break;
  }
  x.restore();
}
const texOf = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
// the hanging banner, in its cut: square, swallow-tailed, a long pennant, a small banneret or a gonfalon with tails
function bannerCloth(B) {
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
  const B = c.brand, cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
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
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: signBoard(c), side: THREE.DoubleSide }));
  sign.position.set(0, y, 1.95); g.add(sign);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.06), mat(0x4e3a28)); rail.position.set(0, y + 0.38, 1.95); g.add(rail);
  // the banner on its own pole beside the shop, hanging from a crossbar
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6), mat(0x4e3a28)); pole.position.set(2.4, 2.1, 1.6); g.add(pole);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), mat(0x4e3a28)); bar.position.set(2.4 + 0.45, 3.95, 1.6); g.add(bar);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7), new THREE.MeshBasicMaterial({ map: bannerCloth(c.brand), side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
  cloth.position.set(2.4 + 0.45, 3.1, 1.6); cloth.rotation.y = Math.PI / 2; g.add(cloth);
  g.userData.cloth = cloth;
  return g;
}
// what the shop sells you, out of its stock, for your own purse
export function shopOffers(town, c) {
  const K = KINDS[c.kind], pl = G.player;
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
