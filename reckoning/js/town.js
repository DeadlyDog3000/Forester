// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The settlement: what can be built in the clearing, how it is planned and
// raised, the forest that pays for it, and the people who come to live there.
// The later chapters teach it a piece at a time; free play is all of it.
//
//   planning   B opens the plans; a building follows your eye as a ghost, R turns
//              it, click or F sets it down (red where it will not fit)
//   raising    carry logs to the site (F), then hold F to raise it
//   forestry   fell a tree and it drops logs; carry them to the stack or a site.
//              Stumps grow back, slowly, so the forest is never used up
//   people     settlers take jobs: woodcutters fell and stack, haulers carry from
//              the stack to building sites, farmers keep the fields

import { THREE, Builder, MAT, mat, clamp, TAU, groundTexture } from "./core.js";
import { G, Actor } from "./engine.js";
import { UI } from "./ui.js";
import { modelCopy, makeAxe, ensureModel } from "./models.js";
import { CLEARING, CABIN, STACK, BLOCK, FIRE } from "./woods.js";
import { FURNITURE, ROOM, halfSize, fitsRoom, ghostOf } from "./furnish.js";
import { TECH, START_TECH, BUILD_GATES, JOB_GATES, techCost, techTime } from "./gov.js";

export const BUILDINGS = {
  cabin:    { name: "Cabin", cost: 20, model: "cabin", w: 5.8, d: 6.8, beds: 2, icon: "cabin", note: "A home for two more people." },
  woodshed: { name: "Woodshed", cost: 8, model: "woodshed", w: 4.0, d: 2.6, store: 30, icon: "logs", note: "Keeps thirty more logs dry." },
  well:     { name: "Well", cost: 6, model: "well", w: 2.4, d: 2.4, icon: "key", note: "Water close by: the fields yield more." },
  field:    { name: "Field", cost: 0, w: 6.6, d: 7.4, dig: 3, icon: "seeds", note: "Three strips of rye. Dug, not built." },
  bakery:   { name: "Bakery", cost: 14, model: "town/bakery", tiers: true, w: 7.6, d: 5.8, icon: "bread", note: "A baker turns rye into bread — a loaf goes twice as far as the grain." },
  quarry:   { name: "Quarry", cost: 16, model: "town/quarry_1", w: 9, d: 8, icon: "stone", note: "A quarryman cuts stone — for chimneys, footings, and better houses." },
  sawmill:  { name: "Sawmill", cost: 18, mats: { stone: 4 }, model: "town/sawmill", tiers: true, w: 9.4, d: 6, icon: "planks", note: "A sawyer turns four logs into two planks. Timber frames want planks." },
  brickworks: { name: "Brickworks", cost: 14, mats: { stone: 8 }, model: "town/brickworks", tiers: true, w: 8.6, d: 5.4, icon: "bricks", note: "Clay dug and fired with logs: bricks, for building as the Hanse builds." },
  mine:     { name: "Mine", cost: 20, mats: { stone: 6 }, model: "town/mine_1", w: 7, d: 8, icon: "ore", note: "A miner brings up iron ore from under the hill." },
  smelter:  { name: "Smelter", cost: 12, mats: { stone: 16, bricks: 6 }, model: "town/smelter", tiers: true, w: 8.4, d: 5.2, icon: "iron", note: "Ore and charcoal in, iron out." },
  forge:    { name: "Forge", cost: 14, mats: { stone: 10 }, model: "town/forge", tiers: true, w: 8, d: 6, icon: "tools", note: "A smith makes iron tools: everyone who has one works a quarter faster." },
  market:   { name: "Market", cost: 20, mats: { planks: 6 }, model: "town/market", tiers: true, w: 8.6, d: 10, icon: "coin", note: "Sells what you have too much of, every day, for Marks." },
  townhall: { name: "Town hall", cost: 30, mats: { stone: 12, planks: 10 }, model: "town/townhall", tiers: true, w: 9.6, d: 10, icon: "cabin", note: "A seat for the town, and a charter: without one, no town builds as a city does." },
  church:   { name: "Church", cost: 24, mats: { stone: 10 }, model: "town/church", tiers: true, w: 7, d: 13, icon: "cabin", note: "Somewhere to pray, and to bury, and to be married. People are happier with one." },
};
// what each work does with a shift: where, how long, what it takes from the stores and what it puts back
export const WORKS = {
  quarryman: { at: "quarry", time: 9, need: {}, give: { stone: 3 }, pose: "chop" },
  sawyer: { at: "sawmill", time: 9, need: { store: 4 }, give: { planks: 2 }, pose: "hammer" },
  brickmaker: { at: "brickworks", time: 10, need: { store: 3 }, give: { bricks: 5 }, pose: "hammer" },
  miner: { at: "mine", time: 12, need: {}, give: { ore: 2 }, pose: "chop" },
  smelter: { at: "smelter", time: 12, need: { ore: 3, store: 2 }, give: { iron: 1 }, pose: "hammer" },
  smith: { at: "forge", time: 14, need: { iron: 2, store: 1 }, give: { tools: 1 }, pose: "hammer" },
};
// what the materials are called, for the board and the labels
export const MAT_NAME = { store: "logs", stone: "stone", planks: "planks", bricks: "bricks", ore: "iron ore", iron: "iron", tools: "tools", coin: "Mark" };
// rebuilding a building in the next style: what it costs, what it's called, and what it needs first
export const UPGRADES = {
  2: { style: "timber and plaster, as Hamburg builds", mats: { planks: 8, stone: 6, coin: 4 } },
  3: { style: "red brick, as the Hanse builds", mats: { bricks: 24, stone: 10, coin: 12 } },
  4: { style: "stucco and glass, as a city builds now", mats: { bricks: 30, iron: 10, coin: 40 }, needs: t => t.S.buildings.some(b => b.done && b.type === "townhall" && (b.tier || 1) >= 3) ? null : "a town hall in brick first (the city's charter)" },
};
// the model a building wears: a tiered one by its tier (1 the log original, 4 a city street), the cabin as the first house
export function modelKey(b) {
  const def = BUILDINGS[b.type];
  if (b.type === "cabin") return (b.tier || 1) > 1 ? `town/house_${b.tier}` : "cabin";
  // the well grows into a fountain in the square
  if (b.type === "well") return (b.tier || 1) >= 3 ? `town/fountain_${b.tier}` : "well";
  return def.tiers ? `${def.model}_${b.tier || 1}` : def.model;
}
// the year: eight days, and the last two of them winter
export const YEAR = 8, SEASONS = ["spring", "spring", "summer", "summer", "autumn", "autumn", "winter", "winter"];
export const LOGS_PER_TREE = 3, CARRY_MAX = 6;
// the work a settler can be set to; talking to them (F) moves them on to the next
export const JOBS = {
  woodcutter: { name: "woodcutter", ask: "fell trees", reply: "Trees it is. Mind your heads." },
  hauler: { name: "hauler", ask: "carry logs to the sites", reply: "I'll carry. Somebody has to." },
  farmer: { name: "farmer", ask: "work the fields", reply: "The fields, then. Good." },
  baker: { name: "baker", ask: "bake bread", reply: "Bread it is. Somebody keep that oven fed." },
  quarryman: { name: "quarryman", ask: "cut stone", reply: "Stone. My back will thank you." },
  sawyer: { name: "sawyer", ask: "saw planks", reply: "Planks it is." },
  brickmaker: { name: "brickmaker", ask: "make bricks", reply: "Clay and fire. I'll smell of it for a week." },
  miner: { name: "miner", ask: "work the mine", reply: "Down the hole, then." },
  smelter: { name: "smelter", ask: "work the smelter", reply: "I'll keep the furnace hot." },
  smith: { name: "smith", ask: "work the forge", reply: "Tools, then. Good ones." },
};
const JOB_ORDER = ["woodcutter", "hauler", "farmer", "baker", "quarryman", "sawyer", "brickmaker", "miner", "smelter", "smith"];
// which building a job needs, if any
const JOB_AT = { baker: "bakery", ...Object.fromEntries(Object.entries(WORKS).map(([j, w]) => [j, w.at])) };
const SFX = () => window.SFX || { chop() {}, build() {}, pickup() {}, hammer() {}, treeFall() {}, timberCrack() {} };

// someone lying down on a bed (from w.bedSpot): on their back, head on the pillow
export function lieOn(a, bed) {
  a.place(bed.x + Math.sin(bed.ry) * 0.85, bed.z + Math.cos(bed.ry) * 0.85, bed.ry);
  a.person.sitting = 0; a.person.setPose("idle");
  // (rolled on to the back about the feet, the back is ~0.13 below them: lift by that, and by the pallet)
  a.lying = true; a.yOff = Math.max(0.05, bed.y - G.world.heightAt(bed.x, bed.z)) + 0.13;
}
// a settler's look, from a seed: townsman or townswoman, in their own colours
function settlerLook(p) {
  const r = p.seed;
  const pick = (a, k) => a[(r * 7 + k * 13) % a.length];
  return p.sex === "f"
    ? { model: "townswoman", name: p.name, skirt: true, apron: pick([0xf0ebe0, 0xe6dcc8, undefined], 1), hat: "bonnet", seed: r, coat: pick([0x6a5a48, 0x5a3b32, 0x4a4a3a], 2), skirtColor: pick([0x4a4038, 0x3e4a5c, 0x5a4a3a], 3), scale: p.child ? 0.72 : 1 }
    : { model: "townsman", name: p.name, hat: pick(["tricorn", "cap", "hat"], 1), seed: r, coat: pick([0x5b4a3a, 0x4d5a3c, 0x3e4a5c, 0x6a4a32], 2), legs: pick([0x3a3028, 0x2e2e33, 0x4a4035], 3), scale: p.child ? 0.72 : 1 };
}

export class Town {
  // state: { store, rye, buildings: [{type,x,z,ry,logs,dug,done}], people: [{name,sex,seed,job,child}], felled: [], logs: [] }
  constructor(w, state, persist, opts = {}) {
    this.w = w; this.S = state; this.persist = persist;
    this.S.store ??= 0; this.S.rye ??= 0; this.S.buildings ??= []; this.S.people ??= []; this.S.felled ??= []; this.S.logs ??= [];
    this.S.bread ??= 0; this.S.coin ??= 0; this.S.upgrades ??= {};
    for (const k of ["stone", "planks", "bricks", "ore", "iron", "tools"]) this.S[k] ??= 0;
    // what the settlement knows: Forester's starting three, and whatever it has already built
    if (!this.S.tech) {
      const known = new Set(START_TECH);
      for (const b of this.S.buildings) if (b.done && BUILD_GATES[b.type]) known.add(BUILD_GATES[b.type]);
      this.S.tech = { done: [...known], research: null };
    }
    this.S.soldToday ??= 0;
    this.dayLen = 300; this.nightly = false;
    this.opts = opts;
    this.vis = new Map();         // building -> its group in the world
    this.actors = [];
    this.bundles = [];
    this.stumps = new Map();
    this.hooks = [];
    this.t = 0;
    this.day = 0;
    // the trees felled before stay down (stumps), until they grow back
    for (const f of this.S.felled) { const t = w.fellable[f.i]; if (t) this.fellNow(t, true); }
    w.setStack(Math.min(this.S.store, 24));
    for (const b of this.S.buildings) this.show(b);
    for (const l of this.S.logs) this.dropLogs(l.x, l.z, l.a, l.n, true);
    this.setupForestry();
    this.setupStack();
  }

  // ---- materials: logs are the stack, the rest are kept in the stores ----
  have(k) { return this.S[k] || 0; }
  afford(mats) { return Object.entries(mats || {}).every(([k, n]) => this.have(k) >= n); }
  pay(mats) { for (const [k, n] of Object.entries(mats || {})) this.S[k] -= n; if (mats && mats.store) this.w.setStack(Math.min(this.S.store, 24)); }
  short(mats) { return Object.entries(mats || {}).filter(([k, n]) => this.have(k) < n).map(([k, n]) => `${n - this.have(k)} ${MAT_NAME[k] || k}`).join(", "); }
  costText(mats) { return Object.entries(mats || {}).map(([k, n]) => `${n} ${MAT_NAME[k] || k}`).join(", "); }
  // what a site still wants, beyond its logs
  wants(b) { const def = BUILDINGS[b.type], got = b.got || {}; return Object.fromEntries(Object.entries(def.mats || {}).map(([k, n]) => [k, n - (got[k] || 0)]).filter(([, n]) => n > 0)); }
  ready(b) { return b.logs >= BUILDINGS[b.type].cost && !Object.keys(this.wants(b)).length; }
  // tools in hand make every job quicker, as far as they go round
  get toolFactor() { const workers = this.S.people.filter(p => !p.child).length || 1; return 1 - 0.25 * Math.min(1, this.S.tools / workers); }
  // the grandest style anything stands in: the streets follow it
  get tierLevel() { return Math.max(1, ...this.S.buildings.filter(b => b.done).map(b => b.tier || 1)); }

  // ---- the time of day and of year ----
  get frac() { return (this.t / this.dayLen) % 1; }
  get season() { return SEASONS[((this.day % YEAR) + YEAR) % YEAR]; }
  get winter() { return this.season === "winter"; }
  isNight() { return this.nightly && (this.frac > 0.74 || this.frac < 0.03); }
  // where someone sleeps: two to a cabin (three, with Land Ownership), in the order they came; the rest by the fire
  homeOf(a) {
    const cabins = this.S.buildings.filter(b => b.done && b.type === "cabin");
    const i = this.S.people.indexOf(a.settler);
    const b = i >= 0 ? cabins[Math.floor(i / this.perCabin)] : null;
    if (b) return { door: [b.x + Math.sin(b.ry) * (BUILDINGS.cabin.d / 2 + 0.6), b.z + Math.cos(b.ry) * (BUILDINGS.cabin.d / 2 + 0.6)], inside: true };
    const k = i < 0 ? 0 : i;
    return { door: [FIRE.x + Math.cos(k * 1.3) * 2.4, FIRE.z + Math.sin(k * 1.3) * 2.4], inside: false };
  }
  // the day's work ends at dark: home, and indoors, until the morning
  async nightFall(a, sleep, alive) {
    a.person.held.clear(); a.person.setPose("idle");
    if (a.homeBed) {
      // your brother or sister sleeps in your own cabin, on the second pallet
      const bed = this.w.bedSpot && this.w.bedSpot(1);
      if (bed) { await a.walkTo(bed.x, bed.z, 1.2); alive(); lieOn(a, bed); }
    } else {
      const h = this.homeOf(a);
      await a.walkTo(h.door[0], h.door[1], 1.2); alive();
      if (h.inside) { a.root.visible = false; a.inside = true; }
      else { a.faceTo(FIRE.x, FIRE.z); a.lying = true; a.yOff = 0.05; }
    }
    while (this.isNight()) { await sleep(1.5); alive(); }
    a.root.visible = true; a.inside = false; a.lying = false; a.yOff = 0;
  }

  // ---- what the settlement can hold ----
  get hearths() { return 1 + this.count("cabin"); }
  get beds() { return 2 + this.S.buildings.filter(b => b.done && b.type === "cabin").length * this.perCabin; }
  get logsPerTree() { return LOGS_PER_TREE + (this.S.upgrades.saw ? 1 : 0) + (this.knows("sawing") ? 2 : 0) + (this.knows("sawmills") ? 3 : 0); }
  get storeCap() { return 40 + this.S.buildings.filter(b => b.done && b.type === "woodshed").length * 30; }
  has(type) { return this.S.buildings.some(b => b.done && b.type === type); }
  count(type) { return this.S.buildings.filter(b => b.done && b.type === type).length; }

  // ---- knowledge: Forester's tech tree (gov.js), researched with Marks and time ----
  knows(id) { return this.S.tech.done.includes(id); }
  canResearch(id) { const t = TECH[id]; return !!t && !this.knows(id) && !this.S.tech.research && t.req.every(r => this.knows(r)); }
  research(id) {
    const t = TECH[id];
    if (!t || this.knows(id)) return false;
    if (this.S.tech.research) { UI.hint("The scholars are already busy.", 3); return false; }
    if (!t.req.every(r => this.knows(r))) { UI.hint("Its prerequisites are not yet known.", 3); return false; }
    const cost = techCost(t);
    if (this.S.coin < cost) { UI.hint(`Research costs ${cost} Mark. The purse holds ${this.S.coin}.`, 3.5); return false; }
    this.S.coin -= cost;
    this.S.tech.research = { id, t: 0 };
    UI.hint(`Research begun: ${t.name} (${Math.round(techTime(t) / 60 * 10) / 10} min).`, 3.5);
    this.persist(); this.emit("researching", id);
    return true;
  }
  // (in free play the plans and the trades wait on what is known, as in Forester; the story chapters teach their own)
  gated(type) { const g = this.techGates && BUILD_GATES[type]; return g && !this.knows(g) ? TECH[g] : null; }
  jobGated(job) { const g = this.techGates && JOB_GATES[job]; return g && !this.knows(g) ? TECH[g] : null; }
  // what the knowledge does here
  get chopMul() { return this.knows("axing") ? 0.65 : this.knows("treecutting") ? 0.8 : 1; }
  get walkMul() { return (this.knows("horses") ? 1.15 : 1) + (this.knows("horsebreeding") ? 0.1 : 0) + (this.knows("saddling") ? 0.1 : 0); }
  get workMul() { return this.knows("stables") ? 0.8 : 1; }
  get perCabin() { return this.knows("landownership") ? 3 : 2; }
  // how the people feel, and why: 0 to 100
  contentment() {
    const S = this.S, why = [];
    const add = (n, text) => { if (n) why.push([n, text]); return n; };
    let v = 50;
    v += add(S.hungry ? -20 : 10, S.hungry ? "hungry" : "fed");
    if (this.winter) v += add(S.cold ? -20 : 8, S.cold ? "cold" : "warm by the hearth");
    const homeless = Math.max(0, S.people.length - this.count("cabin") * this.perCabin);
    v += add(-Math.min(20, homeless * 3), `no bed for ${homeless}`);
    if (this.has("church")) v += add(10, "a church");
    if (this.has("well")) v += add(4, "a well");
    if (this.has("market")) v += add(4, "a market");
    if (S.bread > 0) v += add(5, "bread on the table");
    v += add((this.tierLevel - 1) * 4, "the town they live in");
    for (const [id, n] of [["taming", 3], ["pets", 4], ["pettoys", 4]]) if (this.knows(id)) v += add(n, TECH[id].name.toLowerCase());
    return { value: clamp(Math.round(v), 0, 100), why };
  }

  // ---- showing a building: a frame and a heap of logs while it goes up, the thing itself when done ----
  show(b) {
    const w = this.w, def = BUILDINGS[b.type];
    let g = this.vis.get(b);
    if (g) { w.root.remove(g); if (g.userData.col) g.userData.col.disabled = true; }
    g = new THREE.Group(); g.position.set(b.x, w.heightAt(b.x, b.z), b.z); g.rotation.y = b.ry;
    if (b.type === "field") this.fieldVis(g, b);
    else if (b.done) {
      const key = modelKey(b), m = modelCopy(key);
      if (m) g.add(m.scene);
      else {
        const bb = new Builder(); bb.box(def.w * 0.8, 2.4, def.d * 0.8, 0, 1.2, 0, 0x7a5634); g.add(bb.build());
        // the real one is fetched, and put up in place of this when it comes
        ensureModel(key).then(ok => { if (ok && this.vis.get(b) === g && !this.stopped) this.show(b); });
      }
      // solid: an axis-aligned box round the turned footprint, a little inside it
      const c = Math.abs(Math.cos(b.ry)), s = Math.abs(Math.sin(b.ry));
      const hx = (def.w * c + def.d * s) / 2 - 0.5, hz = (def.w * s + def.d * c) / 2 - 0.5;
      g.userData.col = w.col.addBox(b.x - hx, b.z - hz, b.x + hx, b.z + hz, 4);
      this.upgradeSpot(b);
      if (this.streets !== undefined || b.tier > 2) this.updateStreets();
    } else {
      // stakes at the corners, a line between them, and the logs brought so far
      const bb = new Builder();
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bb.box(0.1, 1.1, 0.1, sx * def.w / 2, 0.55, sz * def.d / 2, 0x8a6a45);
      for (const [x0, z0, x1, z1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
        const ax = x0 * def.w / 2, az = z0 * def.d / 2, bx = x1 * def.w / 2, bz = z1 * def.d / 2;
        bb.box(Math.max(0.02, Math.abs(bx - ax)), 0.02, Math.max(0.02, Math.abs(bz - az)), (ax + bx) / 2, 0.9, (az + bz) / 2, 0xd8ceb4);
      }
      const n = Math.min(b.logs || 0, def.cost);
      for (let i = 0; i < n; i++) { const row = Math.floor(i / 5), col = i % 5; bb.add(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 7), 0x7a5634, (col - 2) * 0.32, 0.15 + row * 0.27, def.d / 2 + 1.2, Math.PI / 2, Math.PI / 2, 0, 1, 1, 1, 0.08); }
      g.add(bb.build(MAT.rough));
    }
    w.root.add(g); this.vis.set(b, g);
  }
  fieldVis(g, b) {
    const w = this.w, growth = b.growth ?? 0;
    const H = [0.12, 0.12, 0.45, 0.95][growth], C = [0x6a8a3a, 0x6a8a3a, 0x7a9a3e, 0xc8a850][growth];
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 2.2;
      if (k >= (b.dug || 0)) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.02, 7), new THREE.MeshBasicMaterial({ color: 0xc8962e, transparent: true, opacity: 0.18, depthWrite: false }));
        line.position.set(o, 0.04, 0); g.add(line); continue;
      }
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 7), mat(0x3e2e22, { surface: "stone" }));
      soil.position.set(o, 0.02, 0); soil.receiveShadow = true; g.add(soil);
      if (b.sown && growth > 0) for (const f of [-0.5, 0, 0.5]) for (let z = -3; z <= 3; z += growth > 1 ? 0.3 : 0.5) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(growth > 1 ? 0.05 : 0.03, H, 4), mat(C, { surface: "needles" }));
        m.position.set(o + f, 0.08 + H / 2, z); g.add(m);
      }
    }
  }

  // ---- can it go here? inside the clearing, clear of everything solid, trees and other plans ----
  fits(type, x, z, ry) {
    const def = BUILDINGS[type], w = this.w;
    const r = Math.hypot(def.w, def.d) / 2;
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) > CLEARING.r + 6 - r * 0.5) return false;
    for (const b of this.S.buildings) { const d2 = BUILDINGS[b.type]; if (Math.hypot(b.x - x, b.z - z) < (Math.hypot(d2.w, d2.d) / 2 + r) * 0.8) return false; }
    for (const t of w.fellable) if ((t.state === "up" || t.state === "shake") && Math.hypot(t.x - x, t.z - z) < r) return false;
    for (const [px, pz, pr] of [[CABIN.x, CABIN.z, 4.6], [STACK.x, STACK.z, 2], [BLOCK.x, BLOCK.z, 1.4], [FIRE.x, FIRE.z, 2.2]]) if (Math.hypot(px - x, pz - z) < pr + r * 0.8) return false;
    if (this.opts.keepClear) for (const [px, pz, pr] of this.opts.keepClear) if (Math.hypot(px - x, pz - z) < pr + r * 0.8) return false;
    return true;
  }

  // ---- planning: the ghost follows your eye; resolves with the new building, or null ----
  plan(type) {
    const gate = this.gated(type);
    if (gate) { UI.hint(`A ${BUILDINGS[type].name.toLowerCase()} requires the ${gate.name} technology (G).`, 4); return; }
    if (this.planning) this.planning.cancel();
    const def = BUILDINGS[type], w = this.w, pl = G.player;
    const ghost = new THREE.Group();
    const m = def.model ? modelCopy(def.model) : null;
    const tint = new THREE.MeshBasicMaterial({ color: 0x7fe07a, transparent: true, opacity: 0.35, depthWrite: false });
    if (m) { m.scene.traverse(o => { if (o.isMesh) { o.material = tint; o.castShadow = false; } }); ghost.add(m.scene); }
    else { const box = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.1, def.d), tint); box.position.y = 0.05; ghost.add(box); }
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(def.w, 0.05, def.d)), new THREE.LineBasicMaterial({ color: 0x7fe07a }));
    edge.position.y = 0.05; ghost.add(edge);
    w.root.add(ghost);
    let ry = CABIN.ry, x = 0, z = 0, ok = false;
    UI.keys([["Click", "set it here"], ["R", "turn it"], ["Esc", "put the plan away"]], 9);
    return new Promise(res => {
      const input = G.input;
      const tick = () => {
        const f = pl.forward(), d = 4 + Math.max(def.w, def.d) / 2;
        x = pl.pos.x + f.x * d; z = pl.pos.z + f.z * d;
        if (input.hit("KeyR")) ry += Math.PI / 4;
        ok = this.fits(type, x, z, ry);
        ghost.position.set(x, w.heightAt(x, z), z); ghost.rotation.y = ry;
        const col = ok ? 0x7fe07a : 0xe0503a; tint.color.setHex(col); edge.material.color.setHex(col);
        if ((input.click || input.hit("KeyF")) && ok) { done({ type, x, z, ry, logs: 0, dug: 0, done: type === "field" ? false : false }); }
        if (input.hit("Escape")) done(null);
      };
      const done = b => {
        const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1);
        w.root.remove(ghost); this.planning = null;
        if (b) { this.S.buildings.push(b); this.show(b); this.site(b); this.persist(); SFX().build(); }
        res(b);
      };
      this.planning = { cancel: () => done(null) };
      G.onFrame.push(tick);
    });
  }

  // ---- furnishing the cabin: a ghost of the piece stands where you look, inside the walls ----
  canAfford(type) { const d = FURNITURE[type]; return this.S.store >= (d.logs || 0) && this.S.rye >= (d.rye || 0); }
  furnish(type) {
    if (this.planning) this.planning.cancel();
    const d = FURNITURE[type], w = this.w, pl = G.player, input = G.input;
    const ghost = ghostOf(type);
    const tint = new THREE.MeshBasicMaterial({ color: 0x7fe07a, transparent: true, opacity: 0.4, depthWrite: false });
    ghost.traverse(o => { if (o.isMesh) o.material = tint; });
    w.root.add(ghost);
    let ry = 0;
    UI.keys([["Click", "set it here"], ["R", "turn it"], ["Esc", "put the plan away"]], 9);
    return new Promise(res => {
      const tick = () => {
        if (input.hit("KeyR")) ry = (ry + Math.PI / 2) % TAU;
        const f = pl.forward();
        const [lx, lz] = w.worldToCabin(pl.pos.x + f.x * 1.5, pl.pos.z + f.z * 1.5);
        const cand = { type, lx, lz, ry };
        const [hx, hz] = halfSize(cand);
        cand.lx = clamp(lx, -ROOM.x + hx, ROOM.x - hx); cand.lz = clamp(lz, -ROOM.z + hz, ROOM.z - hz);
        // not on your own feet
        const [px, pz] = w.worldToCabin(pl.pos.x, pl.pos.z);
        const onYou = Math.abs(px - cand.lx) < hx + 0.3 && Math.abs(pz - cand.lz) < hz + 0.3;
        const ok = fitsRoom(cand, w.furniture) && !onYou && this.canAfford(type);
        const [x, z] = w.cabinToWorld(cand.lx, cand.lz);
        ghost.position.set(x, w.cabinY + 0.07, z); ghost.rotation.y = CABIN.ry + ry;
        tint.color.setHex(ok ? 0x7fe07a : 0xe0503a);
        if ((input.click || input.hit("KeyF")) && ok) done(cand);
        else if (input.hit("Escape") || !w.insideCabin(pl.pos.x, pl.pos.z)) done(null);
      };
      const done = f => {
        const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1);
        w.root.remove(ghost); this.planning = null;
        if (f) {
          this.S.store -= d.logs || 0; this.S.rye -= d.rye || 0; w.setStack(Math.min(this.S.store, 24));
          this.S.furniture = [...w.furniture, f]; w.setFurniture(this.S.furniture);
          this.persist(); SFX().build(); this.emit("furnished", f);
        }
        res(f);
      };
      this.planning = { cancel: () => done(null) };
      G.onFrame.push(tick);
    });
  }

  // ---- a site to work at: bring logs, then raise it (or, for a field, dig it and sow it) ----
  site(b) {
    const def = BUILDINGS[b.type], w = this.w, pl = G.player;
    if (b.done && b.type !== "field") return;
    const at = () => ({ x: b.x, z: b.z });
    const along = b.type === "field" ? [b.x - Math.sin(b.ry) * 3.4, b.z - Math.cos(b.ry) * 3.4, b.x + Math.sin(b.ry) * 3.4, b.z + Math.cos(b.ry) * 3.4] : null;
    const it = w.addInteract({
      x: b.x, y: w.heightAt(b.x, b.z) + (along ? 0.3 : 0.9), z: b.z, reach: along ? 4.2 : Math.max(def.w, def.d) / 2 + 1.6, seg: along,
      hold: () => b.type === "field" || (b.logs >= def.cost) ? 3 : 0,
      label: () => {
        if (b.type === "field") return (b.dug || 0) < 3 ? `Dig the field — strip ${(b.dug || 0) + 1} of 3` : !b.sown ? "Sow the rye" : "The rye is growing";
        if (b.logs < def.cost) return pl.carryN > 0 ? `Add ${Math.min(pl.carryN, def.cost - b.logs)} logs (${b.logs} of ${def.cost})` : `Bring logs — ${b.logs} of ${def.cost}`;
        const want = this.wants(b);
        if (Object.keys(want).length) return this.afford(want) ? `Bring ${this.costText(want)} from the stores` : `Needs ${this.costText(want)} — ${this.short(want)} short`;
        return `Raise the ${def.name.toLowerCase()}`;
      },
      can: () => b.type === "field" ? !b.sown : (b.logs < def.cost ? pl.carryN > 0 : true),
      onHoldTick: (dt, t) => { if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) SFX().hammer(); },
      use: () => {
        if (b.type === "field") {
          if ((b.dug || 0) < 3) b.dug = (b.dug || 0) + 1;
          else { b.sown = true; b.growth = 1; b.done = true; w.removeInteract(it); }
          this.show(b); this.persist(); SFX().build(); this.emit("dug", b); return;
        }
        if (b.logs < def.cost) {
          const n = Math.min(pl.carryN, def.cost - b.logs);
          b.logs += n; pl.carryN -= n; UI.carry(pl.carryN ? `Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}` : null);
          this.show(b); this.persist(); SFX().pickup(); return;
        }
        // the stone, planks and bricks come from the stores, as much as there is
        const want = this.wants(b);
        if (Object.keys(want).length) {
          b.got = b.got || {};
          for (const [k, n] of Object.entries(want)) { const m = Math.min(n, this.have(k)); this.S[k] -= m; b.got[k] = (b.got[k] || 0) + m; }
          this.show(b); this.persist(); SFX().pickup(); return;
        }
        b.done = true; w.removeInteract(it); this.show(b); this.persist(); SFX().build(); this.emit("built", b);
      },
    });
    // the interact system wants hold as a number; keep it current
    Object.defineProperty(it, "hold", { get: () => (b.type === "field" ? 3 : (this.ready(b) ? 4 : 0)) * this.workMul });
    b._it = it;
  }
  sitesAll() { for (const b of this.S.buildings) { if (!b.done || (b.type === "field" && !b.sown)) this.site(b); else this.upgradeSpot(b); } }
  // ---- rebuilding in the next style: log, then Hamburg timber, then Hanseatic brick, then a city's stucco ----
  canUpgrade(b) { const def = BUILDINGS[b.type]; return b.done && (def.tiers || b.type === "cabin" || b.type === "well") && (b.tier || 1) < 4; }
  upgradeSpot(b) {
    this.ups ??= new Map();       // (kept here, not on the building: the building is saved, this is not)
    if (!this.canUpgrade(b) || this.ups.has(b)) return;
    const def = BUILDINGS[b.type], w = this.w;
    const fx = b.x + Math.sin(b.ry) * (def.d / 2 + 0.9), fz = b.z + Math.cos(b.ry) * (def.d / 2 + 0.9);
    this.ups.set(b, w.addInteract({ x: fx, y: w.heightAt(fx, fz) + 1.2, z: fz, reach: 2.4,
      can: () => this.canUpgrade(b) && !this.planning,
      label: () => {
        const u = UPGRADES[(b.tier || 1) + 1], need = u.needs && u.needs(this);
        return need ? `Rebuild in ${u.style.split(",")[0]} — needs ${need}` : `Rebuild the ${def.name.toLowerCase()} in ${u.style} — ${this.costText(u.mats)}`;
      },
      use: () => this.upgrade(b) }));
  }
  upgrade(b) {
    const def = BUILDINGS[b.type], u = UPGRADES[(b.tier || 1) + 1];
    const need = u.needs && u.needs(this);
    if (need) { UI.hint(`First: ${need}.`, 4); return false; }
    if (!this.afford(u.mats)) { UI.hint(`Not yet — ${this.short(u.mats)} short.`, 4); return false; }
    this.pay(u.mats);
    b.tier = (b.tier || 1) + 1;
    this.show(b); this.persist(); SFX().build();
    UI.hint(`The ${def.name.toLowerCase()} stands rebuilt in ${u.style.split(",")[0]}.`, 5);
    if (b.tier >= 4 && this.ups.has(b)) { this.w.removeInteract(this.ups.get(b)); this.ups.delete(b); }
    this.updateStreets();
    this.emit("upgraded", b);
    return true;
  }
  // ---- the ground between the houses: trodden earth, then cobbles, then paving and street lamps ----
  updateStreets() {
    const lvl = this.tierLevel, w = this.w;
    if (this.streetLvl === lvl) return;
    this.streetLvl = lvl;
    if (this.streets) { w.root.remove(this.streets); this.streets = null; }
    if (lvl < 3) return;
    const g = new THREE.Group(), R = CLEARING.r - 2;
    const geo = new THREE.RingGeometry(0.01, R, 72, 18);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, w.heightAt(pos.getX(i) + FIRE.x, pos.getZ(i) + FIRE.z) + 0.04);
    geo.computeVertexNormals();
    // the texture repeats every few metres, in world terms
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3.2, pos.getZ(i) / 3.2);
    const tex = groundTexture("cobbles", 1);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: lvl >= 4 ? 0.7 : 0.95, color: lvl >= 4 ? 0x8a8a8e : 0xcfc8bc, polygonOffset: true, polygonOffsetFactor: -2 });
    const disc = new THREE.Mesh(geo, m); disc.position.set(FIRE.x, 0, FIRE.z); disc.receiveShadow = true;
    g.add(disc);
    // street lamps round the square, once it is a city
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.2, x = FIRE.x + Math.cos(a) * (R - 1.5), z = FIRE.z + Math.sin(a) * (R - 1.5);
      if (w.col.solidAt(x, w.heightAt(x, z) + 1, z, 0.5)) continue;
      const lm = modelCopy(lvl >= 4 ? "town/lamp_4" : "town/lamp_1");
      if (!lm) { ensureModel(lvl >= 4 ? "town/lamp_4" : "town/lamp_1").then(() => { this.streetLvl = null; this.updateStreets(); }); break; }
      lm.scene.position.set(x, w.heightAt(x, z), z); lm.scene.rotation.y = -a + Math.PI / 2;
      g.add(lm.scene);
    }
    w.root.add(g); this.streets = g;
  }

  on(ev, f) { this.hooks.push([ev, f]); }
  emit(ev, x, y) { for (const [e, f] of this.hooks) if (e === ev) f(x, y); }

  // ---- the stack by the cabin: logs in, logs out ----
  setupStack() {
    const w = this.w, pl = G.player;
    this.stackIt = w.addInteract({ x: STACK.x, y: w.cy + 0.8, z: STACK.z, reach: 2.6,
      label: () => pl.carryN > 0 ? `Stack the logs (${pl.carryN})` : `Take logs from the stack (${this.S.store})`,
      can: () => pl.carryN > 0 ? this.S.store < this.storeCap : this.S.store > 0,
      use: () => {
        if (pl.carryN > 0) { const n = Math.min(pl.carryN, this.storeCap - this.S.store); this.S.store += n; pl.carryN -= n; }
        else { const n = Math.min(CARRY_MAX, this.S.store); this.S.store -= n; pl.carryN += n; }
        UI.carry(pl.carryN ? `Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}` : null);
        w.setStack(Math.min(this.S.store, 24)); this.persist(); SFX().build();
      } });
  }

  // ---- felling: swing at a standing tree, it falls, it leaves logs ----
  setupForestry() {
    const w = this.w, pl = G.player;
    G.onSwing = () => {
      const f = pl.forward();
      let best = null, bd = 2.4;
      for (const t of w.fellable) {
        if (t.state !== "up" && t.state !== "shake") continue;
        if (t.claimed) continue;
        const dx = t.x - pl.pos.x, dz = t.z - pl.pos.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * f.x + dz * f.z) / d > 0.45) { bd = d; best = t; }
      }
      if (!best) return;
      SFX().chop();
      // (Tree Cutting and Axing: a stroke that bites deeper, now and then — a fifth, then a third, quicker)
      best.hp = (best.hp ?? 4) - 1 - (Math.random() < 1 / this.chopMul - 1 ? 1 : 0);
      if (best.hp > 0) { best.state = "shake"; best.shake = 0.25; return; }
      this.fell(best, best.x - pl.pos.x, best.z - pl.pos.z, true);
    };
  }
  fell(t, dx, dz, dropLogs) {
    const l = Math.hypot(dx, dz) || 1;
    t.state = "falling"; t.fall = 0; t.col.disabled = true;
    t.dir = { x: dx / l, z: dz / l };
    t.axis = new THREE.Vector3(dz / l, 0, -dx / l);
    SFX().timberCrack();
    t.onDown = () => {
      SFX().treeFall();
      const i = this.w.fellable.indexOf(t);
      if (!this.S.felled.some(f => f.i === i)) this.S.felled.push({ i, day: this.day });
      if (dropLogs) this.dropLogs(t.x + t.dir.x * 1.6, t.z + t.dir.z * 1.6, Math.atan2(t.dir.x, t.dir.z), this.logsPerTree);
      this.persist();
      setTimeout(() => this.fellNow(t), 1500);
    };
  }
  fellNow(t, instant) {
    t.g.visible = false; t.state = "gone"; t.col.disabled = true;
    if (!this.stumps.has(t)) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.45, 8), mat(0x5a4030, { surface: "bark" }));
      m.position.set(t.x, t.y + 0.1, t.z); m.castShadow = true;
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.26, 8), mat(0xc8a878, { surface: "wood" }));
      top.rotation.x = -Math.PI / 2; top.position.y = 0.226; m.add(top);
      this.w.root.add(m); this.stumps.set(t, m);
    }
  }
  // a stump grows back into a young tree, then a tree
  regrow(t) {
    const m = this.stumps.get(t); if (m) { this.w.root.remove(m); this.stumps.delete(t); }
    t.g.visible = true; t.state = "up"; t.col.disabled = false; t.hp = 4; t.claimed = null;
    t.g.rotation.set(0, 0, 0);
    const i = this.w.fellable.indexOf(t);
    this.S.felled = this.S.felled.filter(f => f.i !== i);
  }
  dropLogs(x, z, a, n, restoring) {
    const w = this.w, pl = G.player;
    const reach = CLEARING.r + 7.5, dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
    if (dc > reach) { x = CLEARING.x + (x - CLEARING.x) * reach / dc; z = CLEARING.z + (z - CLEARING.z) * reach / dc; }
    const y = w.heightAt(x, z), dx = Math.sin(a), dz = Math.cos(a);
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 8), mat(0x7a5634, { surface: "bark" }));
      m.rotation.z = Math.PI / 2; m.rotation.y = a + Math.PI / 2;
      m.position.set((i - 1) * 0.3 * dz, 0.15 + (i === 1 ? 0.24 : 0), -(i - 1) * 0.3 * dx);
      m.castShadow = true; g.add(m);
    }
    g.position.set(x, y, z); w.root.add(g);
    const b = { g, x, z, a, n };
    b.it = w.addInteract({ x, y: y + 0.4, z, reach: 2.4, label: () => `Take the logs (${b.n})`,
      can: () => pl.carryN < CARRY_MAX,
      use: () => {
        const take = Math.min(b.n, CARRY_MAX - pl.carryN);
        pl.carryN += take; b.n -= take; SFX().pickup();
        UI.carry(`Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}`);
        if (b.n <= 0) this.pickUp(b);
        this.saveLogs();
      } });
    this.bundles.push(b);
    if (!restoring) this.saveLogs();
    return b;
  }
  pickUp(b) { this.w.removeInteract(b.it); this.w.root.remove(b.g); this.bundles.splice(this.bundles.indexOf(b), 1); }
  saveLogs() { this.S.logs = this.bundles.map(b => ({ x: b.x, z: b.z, a: b.a, n: b.n })); this.persist(); }

  // ---- people ----
  addPerson(p, x, z) {
    if (!this.S.people.includes(p)) this.S.people.push(p);
    const a = new Actor(settlerLook(p), x ?? CLEARING.x + 2, z ?? CLEARING.z + 6, 0);
    a.settler = p; this.actors.push(a);
    if (!p.child) {
      // (while a story is gathering people, it decides what talking does; otherwise it changes their work)
      a.talkIt = this.w.addInteract({ get x() { return a.pos.x; }, get z() { return a.pos.z; }, get y() { return a.pos.y + 1.4; }, reach: 2.4,
        can: () => !a.gone && !a.inside && (this.onTalk ? !!(this.talkLabel && this.talkLabel(p, a)) : !a.summoned),
        label: () => (this.talkLabel && this.talkLabel(p, a)) || `Talk to ${p.name} (${JOBS[p.job || "hauler"].name}) — set their work`,
        use: () => {
          if (this.onTalk && this.onTalk(p, a)) return;
          this.chooseJob(p);
        } });
    }
    this.work(a).catch(e => { if (e !== "stop") console.error(e); });
    this.persist();
    return a;
  }
  spawnPeople() { this.S.people.forEach((p, i) => this.addPerson(p, CLEARING.x - 6 + (i % 4) * 3, CLEARING.z + 8 + Math.floor(i / 4) * 2)); }
  stop() { this.stopped = true; for (const a of this.actors) { if (a.talkIt) this.w.removeInteract(a.talkIt); a.remove(); } this.actors = []; if (this.planning) this.planning.cancel(); G.onSwing = null; }
  // (baking only once there is a bakery)
  jobsOpen() { return JOB_ORDER.filter(j => (!JOB_AT[j] || this.has(JOB_AT[j])) && !this.jobGated(j)); }
  nextJob(p) { const jobs = this.jobsOpen(); return jobs[(jobs.indexOf(p.job) + 1) % jobs.length]; }
  // choosing someone's work from a list, rather than going round them all
  chooseJob(p) {
    if (!G.openTrade) { p.job = this.nextJob(p); this.persist(); return; }
    const count = j => this.S.people.filter(q => q.job === j).length;
    G.openTrade(`${p.name}'s work`, `now a ${JOBS[p.job || "hauler"].name}`, this.jobsOpen().map(j => ({
      icon: "axe", label: JOBS[j].name[0].toUpperCase() + JOBS[j].name.slice(1), note: `${JOBS[j].ask[0].toUpperCase() + JOBS[j].ask.slice(1)}${WORKS[j] ? ` — ${this.costText(WORKS[j].need) || "nothing"} in, ${this.costText(WORKS[j].give)} out` : ""}`,
      get: `${count(j)} at it`, can: () => p.job !== j, done: () => p.job === j, doneText: " — now",
      do: () => { p.job = j; this.persist(); UI.bark(p.name, JOBS[j].reply, 3); this.emit("job", p); G.closeTrade && G.closeTrade(); } })), null);
  }
  // called away from their work, to stand somewhere (the fire, for a gathering)
  summon(a, x, z) {
    a.summoned = true; a.person.held.clear(); a.person.setPose("idle");
    return a.walkTo(x, z, 1.3).then(() => { if (a.root.parent) a.faceTo(FIRE.x, FIRE.z); });
  }
  // the newest to come goes back down the road (hunger does this)
  leave(why = "hunger") {
    const p = [...this.S.people].reverse().find(q => !q.child); if (!p) return;
    this.S.people.splice(this.S.people.indexOf(p), 1);
    const a = this.actors.find(x => x.settler === p);
    if (a) {
      a.gone = true; if (a.talkIt) this.w.removeInteract(a.talkIt);
      const r0 = this.w.road[this.w.road.length - 30];
      a.walkTo(r0.x, r0.z, 1.2).then(() => { a.remove(); const i = this.actors.indexOf(a); if (i >= 0) this.actors.splice(i, 1); });
    }
    this.persist(); this.emit("left", p, why);
  }
  // what wants doing next, in a word to the player
  advice() {
    const S = this.S, pop = S.people.length + 2, need = Math.ceil(pop / 2);
    // (a building that waits on knowledge is advised as the research, not the building)
    const build = (type, text) => { const g = this.gated(type); return g ? `${text.split(" (B)")[0].replace(/^(Build|Open|Raise) an? [a-z ]+/, `Research ${g.name} (G) for a ${BUILDINGS[type].name.toLowerCase()}`)}` : text; };
    const site = S.buildings.find(b => !b.done && b.type !== "field");
    const field = S.buildings.find(b => b.type === "field" && !b.sown);
    const food = S.rye + S.bread * 2;
    if (this.winter && S.store < this.hearths * 2) return `Winter: every hearth burns a log a day — fell trees, the stack is at ${S.store}`;
    if (this.season === "autumn" && S.store < this.hearths * 4) return `Winter is coming — stack firewood: ${this.hearths * 4} logs will see you through`;
    if (food < need * 3) return this.harvestable().length ? "Food is low — reap the ripe field" : this.winter ? "Food is low, and nothing grows in winter — buy rye from Henning's cart" : "Food is low — dig and sow another field (B)";
    if (!this.has("bakery") && S.people.length >= 4) return build("bakery", "Build a bakery (B): a loaf goes twice as far as the grain");
    if (this.has("bakery") && !S.people.some(p => p.job === "baker")) return "The bakery stands idle — talk to someone (F) and set them to baking";
    if (site) return `Bring logs to the ${BUILDINGS[site.type].name.toLowerCase()} (${site.logs} of ${BUILDINGS[site.type].cost})`;
    if (field) return "Finish digging the new field";
    if (!S.people.some(p => p.job === "farmer")) return "No one is farming — talk to someone (F) and set them to the fields";
    // the works, each standing idle without a pair of hands
    for (const [j, wk] of Object.entries(WORKS)) if (this.has(wk.at) && !S.people.some(p => p.job === j)) return `The ${BUILDINGS[wk.at].name.toLowerCase()} stands idle — set someone to work as a ${JOBS[j].name} (F by them)`;
    if (!this.has("quarry")) return build("quarry", "Open a quarry (B): stone, for chimneys and better houses");
    if (!this.has("sawmill")) return build("sawmill", "Build a sawmill (B): planks, for rebuilding in timber as Hamburg does");
    const up = S.buildings.find(b => this.canUpgrade(b) && (b.tier || 1) === 1 && b.type !== "well");
    if (up && this.afford(UPGRADES[2].mats)) return `Rebuild a ${BUILDINGS[up.type].name.toLowerCase()} in timber and plaster — F at its front`;
    if (!this.has("brickworks") && S.buildings.some(b => (b.tier || 1) >= 2)) return "Build a brickworks (B): bricks, for building as the Hanse builds";
    if (!this.has("townhall") && S.people.length >= 8) return build("townhall", "Raise a town hall (B): a charter, and a seat for the town");
    if (this.beds + 2 <= pop) return "Every bed is taken — raise a cabin (B), and someone may come up the road";
    if (!this.has("woodshed") && S.store > this.storeCap - 8) return "The stack is nearly full — build a woodshed (B)";
    if (!this.has("well")) return "Dig a well (B): the fields will yield more";
    return "A bed is free: keep the rye up, and someone will come up the road";
  }

  // each settler's day: their job, over and over
  async work(a) {
    const sleep = s => new Promise(r => setTimeout(r, s * 1000));
    const alive = () => { if (this.stopped || a.gone || a.summoned || !G.world || G.world !== this.w) { a.root.visible = true; a.lying = false; throw "stop"; } };
    await sleep(Math.random() * 3);
    while (true) {
      alive();
      if (this.isNight()) { a.doing = "asleep"; await this.nightFall(a, sleep, alive); continue; }
      const job = a.settler.job || "hauler";
      const site = this.S.buildings.find(b => !b.done && b.type !== "field" && b.logs < BUILDINGS[b.type].cost);
      const matSite = !site && this.S.buildings.find(b => !b.done && b.type !== "field" && Object.entries(this.wants(b)).some(([k]) => this.have(k) > 0));
      const works = WORKS[job], workAt = works && this.S.buildings.find(b => b.done && b.type === works.at);
      if (job === "hauler" && matSite) {
        a.doing = `carrying stores to the ${BUILDINGS[matSite.type].name.toLowerCase()}`;
        // stone and planks and bricks from the stores, carried to the site
        await a.walkTo(STACK.x + 1.3, STACK.z + 0.8, 1.3); alive();
        a.person.setPose("hold");
        await a.walkTo(matSite.x + 1.6, matSite.z + BUILDINGS[matSite.type].d / 2 + 1.4, 1.1); alive();
        matSite.got = matSite.got || {};
        let left = 4;
        for (const [k, n] of Object.entries(this.wants(matSite))) { const m = Math.min(n, this.have(k), left); this.S[k] -= m; matSite.got[k] = (matSite.got[k] || 0) + m; left -= m; }
        a.person.setPose("idle"); this.show(matSite); this.persist(); SFX().pickup();
        await sleep(2);
      } else if (works && workAt) {
        a.doing = `at the ${BUILDINGS[workAt.type].name.toLowerCase()}`;
        // a shift at the works: walk there, work, and if the stores had what it takes, put back what it makes
        const def = BUILDINGS[workAt.type];
        const wx = workAt.x + Math.sin(workAt.ry) * (def.d / 2 + 0.8), wz = workAt.z + Math.cos(workAt.ry) * (def.d / 2 + 0.8);
        await a.walkTo(wx, wz, 1.2); alive();
        a.faceTo(workAt.x, workAt.z);
        if (!this.afford(works.need)) { a.doing = `waiting at the ${BUILDINGS[workAt.type].name.toLowerCase()} for ${this.short(works.need)}`; a.person.setPose("armsCrossed"); await sleep(6); alive(); a.person.setPose("idle"); continue; }
        a.person.setPose(works.pose);
        // (Deep Shafts: quarries and mines work 30% faster, and bring up more; Blast Furnace: twice the iron)
        const deep = this.knows("deepshafts") && (works.at === "quarry" || works.at === "mine");
        const time = works.time * this.toolFactor * (deep ? 0.7 : 1);
        if (works.pose === "chop") { const axe = a.hold(makeAxe()); await sleep(time); a.person.held.remove(axe); }
        else await sleep(time);
        alive();
        if (this.afford(works.need)) {
          this.pay(works.need);
          for (const [k, n] of Object.entries(works.give)) this.S[k] = (this.S[k] || 0) + n * (works.at === "smelter" && this.knows("blastfurnace") ? 2 : 1) + (deep ? 1 : 0);
          this.persist(); SFX().build();
        }
        a.person.setPose("idle");
        await sleep(1.5);
      } else if (job === "hauler" && site && this.S.store > 0) {
        a.doing = `carrying logs to the ${BUILDINGS[site.type].name.toLowerCase()}`;
        await a.walkTo(STACK.x + 1.3, STACK.z + 0.8, 1.3); alive();
        const n = Math.min(4, this.S.store, BUILDINGS[site.type].cost - site.logs); if (n <= 0) continue;
        this.S.store -= n; this.w.setStack(Math.min(this.S.store, 24)); a.person.setPose("hold");
        await a.walkTo(site.x + 1.6, site.z + BUILDINGS[site.type].d / 2 + 1.4, 1.1); alive();
        site.logs = Math.min(BUILDINGS[site.type].cost, site.logs + n); a.person.setPose("idle"); this.show(site); this.persist(); SFX().pickup();
        await sleep(2);
      } else if (job === "woodcutter" || (job === "hauler" && site)) {
        a.doing = "felling trees";
        const trees = this.w.fellable.filter(t => t.state === "up" && !t.claimed);
        if (!trees.length) { await sleep(5); continue; }
        trees.sort((p, q) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z) - Math.hypot(q.x - a.pos.x, q.z - a.pos.z));
        const t = trees[Math.floor(Math.random() * Math.min(5, trees.length))];
        t.claimed = "settler";
        const dx = CLEARING.x - t.x, dz = CLEARING.z - t.z, l = Math.hypot(dx, dz);
        await a.walkTo(t.x + dx / l * 1.1, t.z + dz / l * 1.1, 1.3); alive();
        a.faceTo(t.x, t.z); a.person.setPose("chop");
        const axe = a.hold(makeAxe());
        for (let i = 0; i < (this.S.upgrades.axes ? 4 : 6); i++) { await sleep(0.8 * this.chopMul); alive(); if (Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z) < 24) SFX().chop(); }
        a.person.setPose("idle"); a.person.held.remove(axe);
        this.fell(t, -dx, -dz, false);
        await sleep(2.6); alive();
        a.person.setPose("hold");
        await a.walkTo(STACK.x + 1.4, STACK.z + 0.6, 1.2); alive();
        a.person.setPose("idle");
        this.S.store = Math.min(this.storeCap, this.S.store + this.logsPerTree); this.w.setStack(Math.min(this.S.store, 24)); this.persist(); SFX().build();
        await sleep(3 + Math.random() * 3);
      } else if (job === "baker" && this.has("bakery") && this.S.rye >= 2) {
        a.doing = "baking";
        const bk = this.S.buildings.find(b => b.done && b.type === "bakery");
        // at the oven, on the bakery's right-hand side
        const ox = bk.x + Math.cos(bk.ry) * 3.2 - Math.sin(bk.ry) * 1.6, oz = bk.z - Math.sin(bk.ry) * 3.2 - Math.cos(bk.ry) * 1.6;
        await a.walkTo(ox, oz, 1.2); alive();
        a.faceTo(bk.x + Math.cos(bk.ry) * 3.6, bk.z - Math.sin(bk.ry) * 3.6); a.person.setPose("hammer");
        await sleep(9); alive();
        if (this.S.rye >= 2) { this.S.rye -= 2; this.S.bread += 3; this.persist(); SFX().pickup(); }
        a.person.setPose("idle");
        await sleep(2);
      } else if (job === "farmer") {
        a.doing = "working the fields";
        const fields = this.S.buildings.filter(b => b.type === "field" && b.done);
        const f = fields.length ? fields[Math.floor(Math.random() * fields.length)] : null;
        if (!f) { await a.walkTo(FIRE.x + (Math.random() - 0.5) * 6, FIRE.z + 3 + Math.random() * 2, 1); await sleep(6); continue; }
        await a.walkTo(f.x + (Math.random() - 0.5) * 4, f.z + (Math.random() - 0.5) * 5, 1.1); alive();
        a.person.setPose("hammer"); await sleep((6 + Math.random() * 4) * this.workMul); alive(); a.person.setPose("idle");
      } else {
        // nothing to do: idle about the fire and the cabins
        a.doing = "idle";
        await a.walkTo(FIRE.x + (Math.random() - 0.5) * 8, FIRE.z + (Math.random() - 0.5) * 8, 1.0); alive();
        await sleep(4 + Math.random() * 6);
      }
    }
  }

  // ---- time: days pass; the forest grows back, fields ripen, people eat ----
  update(dt, dayLength = 300) {
    this.t += dt; this.dayLen = dayLength;
    // the scholars at their desk
    const r = this.S.tech.research;
    if (r) {
      r.t += dt;
      const t = TECH[r.id];
      if (r.t >= techTime(t)) {
        this.S.tech.research = null; this.S.tech.done.push(t.id);
        UI.hint(`Research complete: ${t.name} — ${t.desc}.`, 6);
        SFX().build(); this.persist(); this.emit("researched", t.id);
      }
    }
    const day = Math.floor(this.t / dayLength);
    if (day !== this.day) {
      this.day = day;
      const winter = this.winter;
      // stumps from more than two days ago come back, a few a day
      // (Replanting: saplings grow twice as fast)
      const regrowDays = this.knows("replanting") ? 1 : 2, regrowOdds = this.knows("replanting") ? 0.7 : 0.35;
      for (const f of this.S.felled.slice()) if (this.day - (f.day ?? -9) >= regrowDays && Math.random() < regrowOdds) { const t = this.w.fellable[f.i]; if (t && t.state === "gone") this.regrow(t); }
      // fields grow a stage a day; ripe fields are harvested by the farmers, or by you
      // (nothing grows in winter)
      for (const b of this.S.buildings) if (b.type === "field" && b.sown && !winter) {
        // (Agriculture: crops ripen 30% faster)
        if ((b.growth ?? 1) < 3) { b.growth = Math.min(3, (b.growth ?? 1) + 1 + (this.knows("agriculture") && Math.random() < 0.3 ? 1 : 0)); this.show(b); }
        else if (this.S.people.some(p => p.job === "farmer")) { this.S.rye += 10 + (this.has("well") ? 5 : 0); b.growth = 1; this.show(b); }
      }
      // everyone eats, bread first (a loaf goes twice as far); two days with nothing, and the newest to come leaves
      // (Horse Feed: hunger fades 20% slower)
      let need = Math.ceil((this.S.people.length + 2) / 2 * (this.knows("horsefeed") ? 0.8 : 1));
      const loaves = Math.min(this.S.bread, Math.ceil(need / 2));
      this.S.bread -= loaves; need = Math.max(0, need - loaves * 2);
      if (this.S.rye >= need) { this.S.rye -= need; this.S.hungry = 0; }
      else {
        this.S.rye = 0; this.S.hungry = (this.S.hungry || 0) + 1;
        if (this.S.hungry >= 2) { this.S.hungry = 0; this.leave("hunger"); } else this.emit("hungry", this.day);
      }
      // the market sells what there is too much of
      if (this.has("market")) {
        const sell = [["bread", 20, 1, 2], ["planks", 16, 1, 1], ["bricks", 30, 2, 1], ["stone", 30, 3, 1], ["store", this.storeCap - 10, 3, 1]];
        let got = 0;
        // (Trading, then Marketing: market prices a Mark more, then another)
        const plus = (this.knows("trading") ? 1 : 0) + (this.knows("marketing") ? 1 : 0);
        for (const [k, keep, per, price] of sell) { const n = Math.min(10, Math.floor(Math.max(0, this.have(k) - keep) / per)); this.S[k] -= n * per; got += n * (price + (n ? plus : 0)); }
        this.S.soldToday = got;
        if (got) { this.S.coin += got; this.w.setStack(Math.min(this.S.store, 24)); this.emit("sold", got); }
      }
      // in winter every hearth burns a log a day; two cold days, and someone goes
      if (winter) {
        const fire = this.hearths;
        if (this.S.store >= fire) { this.S.store -= fire; this.S.cold = 0; this.w.setStack(Math.min(this.S.store, 24)); }
        else {
          this.S.store = 0; this.w.setStack(0); this.S.cold = (this.S.cold || 0) + 1;
          if (this.S.cold >= 2) { this.S.cold = 0; this.leave("cold"); } else this.emit("cold", this.day);
        }
      }
      this.persist();
      this.emit("day", this.day);
    }
  }

  // a ripe field can be reaped by hand
  harvestable() { return this.S.buildings.filter(b => b.type === "field" && b.sown && (b.growth ?? 1) >= 3); }
}
