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

import { ambitionsTick } from "./ambitions.js";
import { axeBonus, skillK, ITEM, digMul, buildMul } from "./body.js";
import { THREE, Builder, MAT, mat, clamp, TAU, groundTexture, prismGeo, rng } from "./core.js";
import { G, Actor, sfxEngine } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { modelCopy, makeAxe, makeArm, makeLogs, ensureModel, makeHorse, makeSpade } from "./models.js";
import { wallVis, wallEnds, WALL_H } from "./walls.js";
import { ARMS, ARM_KINDS } from "./raid.js";
import { FAITHS, faithOf, dedication, dailyConversion } from "./faith.js";
import { NATIONS, NEAR, ensureEurope, europeDay, strengthOf, the, The } from "./europe.js";
import { ensurePerson, gainSkill, workSkill, armSkill, temperWork, temperArm, JOB_SKILL, SKILL_NAME, MARKS, moodOf, skillLvl, MASTER_AT, trainCost } from "./people.js";
import { CLEARING, CABIN, STACK, BLOCK, FIRE, RING, HUNT, inPoly } from "./woods.js";
import { FURNITURE, ROOM, halfSize, fitsRoom, ghostOf } from "./furnish.js";
import { TECH, START_TECH, BUILD_GATES, JOB_GATES, CIVIC, CIVIC_UPKEEP, techCost, techTime } from "./gov.js";
import { economyDay, shopVisual, shopOffers, lawsOf, KINDS } from "./economy.js";
import { openKitchen, cooking, isRawMeat } from "./cook.js";
import { feudTick, feudShift, peaceOffer, ensureFamilies, kinFor, fullName } from "./feud.js";
import { dineShift, eateryShift, eaterySolids } from "./economy.js";
import { revoltCheck, revoltShift, revoltSwing, checkEnd } from "./rebellion.js";
import { colonyCheck, lay as layColony } from "./colony.js";

// what wants a door hewn for it before it can be raised, and what a door takes
const NEEDS_DOOR = new Set(["cabin"]), DOOR_LOGS = 2;
export const BUILDINGS = {
  cabin:    { name: "Cabin", cost: 20, model: "cabin", w: 5.8, d: 6.8, beds: 2, icon: "cabin", note: "A home for two more people." },
  woodshed: { name: "Woodshed", cost: 8, model: "woodshed", w: 4.0, d: 2.6, store: 30, icon: "logs", note: "Keeps thirty more logs dry. Look at it (V) to build on a second and a third bay: seventy, then a hundred and twenty." },
  well:     { name: "Well", cost: 6, model: "well", w: 2.4, d: 2.4, icon: "key", note: "Water close by: the fields yield more." },
  field:    { name: "Field", cost: 0, w: 6.6, d: 7.4, dig: 3, icon: "seeds", note: "Three strips of rye. Dug, not built." },
  bakery:   { name: "Bakery", cost: 14, model: "town/bakery", tiers: true, w: 7.6, d: 5.8, icon: "bread", note: "A baker turns rye into bread — a loaf goes twice as far as the grain." },
  quarry:   { name: "Quarry", cost: 16, model: "town/quarry_1", w: 9, d: 8, icon: "stone", note: "A quarryman cuts stone — for chimneys, footings, and better houses." },
  sawmill:  { name: "Sawmill", cost: 18, mats: { stone: 4 }, model: "town/sawmill", tiers: true, w: 9.4, d: 6, icon: "planks", note: "A sawyer turns four logs into two planks. Timber frames want planks." },
  brickworks: { name: "Brickworks", cost: 14, mats: { stone: 8 }, model: "town/brickworks", tiers: true, w: 8.6, d: 5.4, icon: "bricks", note: "Clay dug and fired with logs: bricks, for building as the Hanse builds." },
  mine:     { name: "Mine", cost: 20, mats: { stone: 6 }, model: "town/mine_1", w: 7, d: 8, icon: "ore", note: "A miner brings up iron ore from under the hill." },
  smelter:  { name: "Smelter", cost: 12, mats: { stone: 16, bricks: 6 }, model: "town/smelter", tiers: true, w: 8.4, d: 5.2, icon: "iron", note: "Ore and charcoal in, iron out." },
  forge:    { name: "Forge", cost: 14, mats: { stone: 10 }, model: "town/forge", tiers: true, w: 8, d: 6, icon: "tools", note: "A smith makes iron tools: everyone who has one works a quarter faster." },
  market:   { name: "Market", cost: 20, mats: { planks: 6 }, model: "town/market", tiers: true, w: 8.6, d: 10, icon: "coin", note: "Sells what you have too much of, every day, for DM (Deutsche Mark)." },
  townhall: { name: "Town hall", cost: 30, mats: { stone: 12, planks: 10 }, model: "town/townhall", tiers: true, w: 9.6, d: 10, icon: "cabin", note: "A seat for the town, and a charter: without one, no town builds as a city does." },
  shop:     { name: "Shop", cost: 10, w: 4.2, d: 3.4, icon: "cabin", settlers: true, note: "A settler's own business." },
  stable:   { name: "Stable", cost: 14, mats: { stone: 4 }, w: 6.4, d: 4.2, icon: "cabin", note: "Stalls for two horses. Take one out (F at the stable) and ride — more than twice as fast as walking. X gets you down, and it finds its own way home." },
  path:     { name: "Path", cost: 0, w: 2.2, d: 3.4, path: true, icon: "stone", note: "A trodden way between the houses, laid a strip at a time — free. Cobbled once the town is brick." },
  storehouse: { name: "Store chest", cost: 6, w: 2.4, d: 2.0, icon: "logs", note: "The settlement's stores kept in one place, a big chest under a little roof: take what the settlement has, or put things in. The chest in your cabin is your own." },
  palisade: { name: "Palisade", cost: 3, w: 3.2, d: 0.7, wall: "log", hp: 60, icon: "logs", note: "A length of sharpened logs, laid a length at a time and joined end to end. Raiders must hack through it. Three logs a length." },
  gate:     { name: "Gate", cost: 8, w: 3.6, d: 0.8, wall: "gate", hp: 90, icon: "logs", note: "A way through the palisade: it stands open, and is shut when raiders come." },
  stonewall: { name: "Stone wall", cost: 0, mats: { stone: 4 }, w: 3.2, d: 0.9, wall: "stone", hp: 150, icon: "stone", note: "A length of stone wall, laid like the palisade — and much harder to break." },
  church:   { name: "Church", cost: 24, mats: { stone: 10 }, model: "town/church", tiers: true, w: 7, d: 13, icon: "cabin", note: "Somewhere to pray, and to bury, and to be married. People are happier with one." },
  shrine:   { name: "Shrine", cost: 10, mats: { coin: 3 }, model: "town/shrine_1", w: 2.4, d: 2.2, icon: "cabin", note: "A wayside shrine, raised to one faith: somewhere of its own to pray, for those who hold it." },
  jail:     { name: "Jail", cost: 18, mats: { stone: 6 }, model: "town/jail", tiers: true, w: 5, d: 5, icon: "cabin", note: "With a watchman on the job, a thief is caught in the night and held here a day — and what they took comes back." },
  hospital: { name: "Hospital", cost: 20, mats: { stone: 6 }, model: "town/hospital", tiers: true, w: 7, d: 5.4, icon: "cabin", note: "Beds for the sick. With a doctor at work in it, the ill are up in a day or two instead of most of a week." },
};
// what each work does with a shift: where, how long, what it takes from the stores and what it puts back
export const WORKS = {
  quarryman: { at: "quarry", time: 11, need: {}, give: { stone: 2 }, pose: "chop" },
  sawyer: { at: "sawmill", time: 11, need: { store: 3 }, give: { planks: 1 }, pose: "hammer" },
  brickmaker: { at: "brickworks", time: 12, need: { store: 3 }, give: { bricks: 3 }, pose: "hammer" },
  miner: { at: "mine", time: 14, need: {}, give: { ore: 1 }, pose: "chop" },
  smelter: { at: "smelter", time: 12, need: { ore: 3, store: 2 }, give: { iron: 1 }, pose: "hammer" },
  smith: { at: "forge", time: 14, need: { iron: 2, store: 1 }, give: { tools: 1 }, pose: "hammer" },
};
// what the materials are called, for the board and the labels
export const MAT_NAME = { store: "logs", stone: "stone", planks: "planks", bricks: "bricks", ore: "iron ore", iron: "iron", copperore: "copper ore", tinore: "tin ore", copper: "copper", tin: "tin", bronze: "bronze", tools: "tools", coin: "DM", spears: "spears", swords: "swords", battleaxes: "battle axes" };
// the store key for each thing you can carry in your pack
const PACK_ICON = { stone: "stone", planks: "planks", bricks: "bricks", ore: "ironore", copperore: "copperore", tinore: "tinore", copper: "copper", tin: "tin", bronze: "bronze", iron: "iron" };
// buildings you can walk about in, solid only where something stands: the quarry is its rock face round the back
// (a horseshoe, open to the front) and the crane's post; the pit and the cut blocks in it are open ground
const SOLID = {
  quarry: [[-4.2, -4.4, 1.2], [-2.4, -4.9, 1.2], [-0.6, -5.2, 1.1], [1.2, -5.1, 1.2], [3, -4.8, 1.2], [4.3, -4.2, 1.1], [-4.4, -3.1, 0.9], [4.4, -3, 0.9], [2.6, 1.5, 0.6], [2.5, 3.2, 0.35]],
};
// a woodshed grows by bays: the same shed again, built on beside it; what each size holds, and what the next bay costs
export const SHED_BAYS = {
  1: { holds: 30 },
  2: { holds: 70, name: "a second bay", mats: { store: 14, stone: 6 } },
  3: { holds: 120, name: "a third bay", mats: { store: 20, stone: 10, planks: 6 } },
};
// rebuilding a building in the next style: what it costs, what it's called, and what it needs first
// rebuilding costs what it is built of — a great deal of it — and no money
export const UPGRADES = {
  2: { style: "timber and plaster, as Hamburg builds", mats: { store: 10, planks: 16, stone: 12 } },
  3: { style: "red brick, as the Hanse builds", mats: { planks: 12, bricks: 45, stone: 20 } },
  4: { style: "stucco and glass, as a city builds now", mats: { planks: 20, bricks: 60, stone: 25, iron: 18 }, needs: t => t.S.buildings.some(b => b.done && b.type === "townhall" && (b.tier || 1) >= 3) ? null : "a town hall in brick first (the city's charter)" },
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
export const LOGS_PER_TREE = 2, CARRY_MAX = 6;
// a harvest: four rye from a field, five with a well; a loaf takes two and a half rye (five make two), and feeds as three
const RYE_HARVEST = 4, LOAF_RYE = 2.5, LOAF_FEEDS = 3;
// the work a settler can be set to; talking to them (F) moves them on to the next
export const JOBS = {
  woodcutter: { name: "woodcutter", ask: "fell trees", reply: "Trees it is. Mind your heads." },
  hunter: { name: "hunter", ask: "hunt the deer ride for meat and hides", reply: "I'll bring back what I can carry." },
  hauler: { name: "hauler", ask: "carry logs and stone to the building sites (nobody else does)", reply: "I'll carry. Somebody has to." },
  farmer: { name: "farmer", ask: "work the fields", reply: "The fields, then. Good." },
  baker: { name: "baker", ask: "bake bread", reply: "Bread it is. Somebody keep that oven fed." },
  quarryman: { name: "quarryman", ask: "cut stone", reply: "Stone. My back will thank you." },
  sawyer: { name: "sawyer", ask: "saw planks", reply: "Planks it is." },
  brickmaker: { name: "brickmaker", ask: "make bricks", reply: "Clay and fire. I'll smell of it for a week." },
  miner: { name: "miner", ask: "work the mine", reply: "Down the hole, then." },
  smelter: { name: "smelter", ask: "work the smelter", reply: "I'll keep the furnace hot." },
  smith: { name: "smith", ask: "work the forge", reply: "Tools, then. Good ones." },
  doctor: { name: "doctor", ask: "tend the sick", reply: "Show me who's ailing." },
  watch: { name: "watchman", ask: "keep the watch against raiders", reply: "I'll keep my eyes on the road." },
};
// the settlement earns room to grow at these many people (you and yours counted), and a claim can't be bigger than this
const GROW_AT = [8, 13, 19, 26, 34];
const MAX_CLAIM = 1000;
// the distance from a point to a segment
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const JOB_ORDER = ["woodcutter", "hauler", "farmer", "hunter", "baker", "quarryman", "sawyer", "brickmaker", "miner", "smelter", "smith", "doctor", "watch"];
// which building a job needs, if any
const JOB_AT = { baker: "bakery", ...Object.fromEntries(Object.entries(WORKS).map(([j, w]) => [j, w.at])) };
// (the sound engine is a page global; with it missing, as in a test, everything is quiet rather than broken)
const QUIET = new Proxy({}, { get: () => () => {} });
const SFX = () => sfxEngine() || QUIET;

// the stuff of a path: trodden earth, then cobbles
const PATH_MAT = {};
// ---- the sign over a building site: what it still needs, in icons and numbers ----
const SITE_ICON = { store: "../assets/sprites/items/logs.png", stone: "../assets/sprites/items/stone.png", planks: "art/item_door.png",
  bricks: "../assets/sprites/items/stone.png", iron: "../assets/sprites/items/iron.png", tools: "../assets/sprites/items/tool_iron.png" };
const iconImg = {};
const loadIcon = src => iconImg[src] ??= new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
function siteSign(rows, ready) {
  const W = 256, H = 64 * Math.max(1, rows.length) + (ready ? 0 : 0);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(W / 110, H / 110, 1); sp.renderOrder = 10;
  (async () => {
    const c = cv.getContext("2d");
    c.fillStyle = "rgba(8,20,13,0.82)"; c.strokeStyle = ready ? "#8cc084" : "rgba(140,192,132,0.55)"; c.lineWidth = 3;
    c.beginPath(); c.roundRect(2, 2, W - 4, H - 4, 10); c.fill(); c.stroke();
    c.font = "600 30px 'Open Sans', system-ui, sans-serif"; c.textBaseline = "middle"; c.imageSmoothingEnabled = false;
    for (let i = 0; i < rows.length; i++) {
      const [k, text, done] = rows[i], y = 32 + i * 64;
      const im = SITE_ICON[k] ? await loadIcon(SITE_ICON[k]) : null;
      if (im) c.drawImage(im, 14, y - 22, 44, 44);
      c.fillStyle = done ? "#8cc084" : "#f1ead8"; c.fillText(text, im ? 70 : 18, y + 1);
    }
    tex.needsUpdate = true;
  })();
  return sp;
}

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
    // the ground won from the forest as the settlement grew: those rings are trees to fell again, in the same order
    this.S.expand ??= 0;
    for (let k = 1; k <= this.S.expand; k++) w.clearRing(k);
    // and the ground you marked out yourself, claim by claim, in the order you marked it
    this.S.lobes ??= [];
    this.S.lobes.forEach((l, i) => w.clearArea(l.poly, i + 1));
    w.lobes = this.S.lobes;
    // the other settlements you have founded, and the roads to them
    this.S.colonies ??= [];
    for (const c of this.S.colonies) layColony(this, c);
    if ((this.S.homeTier || 1) >= 2 && w.setHomeTier) w.setHomeTier(this.S.homeTier);
    w.settled = true;
    // the trees felled before stay down (stumps), until they grow back
    // (by where it stood, if the list has shifted since)
    for (const f of this.S.felled) {
      let t = w.fellable[f.i];
      if (f.x != null && (!t || Math.hypot(t.x - f.x, t.z - f.z) > 0.5)) { t = w.fellable.find(q => Math.hypot(q.x - f.x, q.z - f.z) < 0.5); if (t) f.i = w.fellable.indexOf(t); }
      if (t) this.fellNow(t, true);
    }
    this.showStore();
    for (const b of this.S.buildings) this.show(b);
    // the settlers' own shops
    lawsOf(this.S); this.shopVis = new Map();
    for (const c of this.S.companies) if (!c.waiting) this.showShop(c);
    for (const l of this.S.logs) this.dropLogs(l.x, l.z, l.a, l.n, true);
    this.setupForestry();
    this.setupStack();
    this.showGraves();
  }

  // ---- materials: logs are the stack, the rest are kept in the stores ----
  have(k) { return this.S[k] || 0; }
  // ---- arms ----
  // (Blades: every weapon strikes harder; fists stay fists)
  armDmg(kind) { return ARMS[kind].dmg + (kind !== "fists" && this.knows("blades") ? 5 : 0); }
  armsKnown() { return ARM_KINDS.filter(k => this.techGates || this.researchGates ? this.knows(ARMS[k].tech) : k === "sword"); }
  armsCount() { return ARM_KINDS.reduce((n, k) => n + (this.S[ARMS[k].key] || 0), 0); }
  // the best weapon in the stores for you (you choose first)
  playerArm() { return ARM_KINDS.find(k => this.S[ARMS[k].key] > 0) || null; }
  // who gets what, best first: you, then the watch, then everyone else in turn; woodcutters have their axes, the rest their fists
  armFor(p) {
    const pool = [];
    for (const k of ARM_KINDS) for (let i = 0; i < (this.S[ARMS[k].key] || 0); i++) pool.push(k);
    const pb = G.player && G.player.blade;
    if (pb && pb !== "axe" && G.player.axe) { const i = pool.indexOf(pb); if (i >= 0) pool.splice(i, 1); }
    const order = this.S.people.filter(q => !q.child).sort((x, y) => (y.job === "watch") - (x.job === "watch"));
    return pool[order.indexOf(p)] || (p.job === "woodcutter" ? "axe" : "fists");
  }
  // the smith: tools, and — once the settlement knows how, and while there are fewer arms than hands to hold them — arms, by turns
  // the miner: iron ore mostly, and copper and tin as the seams give them
  minerWork() { const r = Math.random(), W = WORKS.miner; return r < 0.55 ? W : r < 0.8 ? { ...W, give: { copperore: 1 } } : { ...W, give: { tinore: 1 } }; }
  // the smelter: copper and tin ore down to metal first (they are wanted for bronze), then iron
  smelterWork() {
    const S = this.S, W = WORKS.smelter;
    if ((S.copperore || 0) >= 2 && (S.copper || 0) < 10) return { ...W, need: { copperore: 2, store: 1 }, give: { copper: 1 } };
    if ((S.tinore || 0) >= 2 && (S.tin || 0) < 10) return { ...W, need: { tinore: 2, store: 1 }, give: { tin: 1 } };
    return W;
  }
  smithWork() {
    const W = WORKS.smith, adults = this.S.people.filter(p => !p.child).length;
    // bronze before anything, as the first Forester's smith does: copper and tin into the crucible, one of each for two
    if ((this.S.copper || 0) >= 1 && (this.S.tin || 0) >= 1 && (this.S.bronze || 0) < 8) return { ...W, time: 12, need: { copper: 1, tin: 1, store: 1 }, give: { bronze: 1 } };
    const known = this.armsKnown();
    if (!known.length || this.armsCount() >= adults + 1) return W;
    this._forgeArm = !this._forgeArm;
    if (!this._forgeArm && (this.S.tools || 0) < adults) return W;
    // (Hilts: a weapon takes an iron less)
    return { ...W, time: 18, need: { iron: this.knows("hilts") ? 2 : 3, store: 1 }, give: { [ARMS[known[0]].key]: 1 } };
  }
  // what you carry counts too, when it is you building: stone in your pack is as good as stone in the stores
  carried(k) { const icon = PACK_ICON[k]; return icon && G.pack ? G.pack.filter(i => i.icon === icon).reduce((a, i) => a + (i.n || 1), 0) : 0; }
  haveYou(k) { return this.have(k) + this.carried(k); }
  afford(mats, you) { return Object.entries(mats || {}).every(([k, n]) => (you ? this.haveYou(k) : this.have(k)) >= n); }
  // (the stores first, then your own pack)
  pay(mats, you) {
    for (const [k, n] of Object.entries(mats || {})) this.take(k, n, you);
    if (mats && mats.store) this.showStore();
  }
  take(k, n, you) {
    const fromS = Math.min(n, this.have(k)); this.S[k] = (this.S[k] || 0) - (you ? fromS : n); let left = you ? n - fromS : 0;
    const icon = PACK_ICON[k];
    while (left > 0 && icon) {
      const it = G.pack.find(i => i.icon === icon); if (!it) break;
      const m = Math.min(left, it.n || 1); it.n = (it.n || 1) - m; left -= m;
      if (it.n <= 0) G.pack.splice(G.pack.indexOf(it), 1);
    }
    return n - left;
  }
  short(mats, you) { const h = k => you ? this.haveYou(k) : this.have(k); return Object.entries(mats || {}).filter(([k, n]) => h(k) < n).map(([k, n]) => `${n - h(k)} ${MAT_NAME[k] || k}`).join(", "); }
  costText(mats) { return Object.entries(mats || {}).map(([k, n]) => `${n} ${MAT_NAME[k] || k}`).join(", "); }
  // what a site still wants, beyond its logs
  wants(b) { const def = BUILDINGS[b.type], got = b.got || {}; return Object.fromEntries(Object.entries(def.mats || {}).map(([k, n]) => [k, n - (got[k] || 0)]).filter(([, n]) => n > 0)); }
  ready(b) { return b.logs >= BUILDINGS[b.type].cost && !Object.keys(this.wants(b)).length && (!NEEDS_DOOR.has(b.type) || !!b.door); }
  // a cabin wants a door hewn for it at the sawhorse, as the first one did
  doorWanted() { return this.S.buildings.filter(b => NEEDS_DOOR.has(b.type) && !b.done && !b.door).length > (this.S.doors || 0); }
  // tools in hand make every job quicker, as far as they go round
  get toolFactor() { const workers = this.S.people.filter(p => !p.child).length || 1; return 1 - 0.25 * Math.min(1, this.S.tools / workers); }
  // the grandest style anything stands in: the streets follow it
  get tierLevel() { return Math.max(1, ...this.S.buildings.filter(b => b.done).map(b => b.tier || 1)); }

  // ---- the time of day and of year ----
  get frac() { return (this.t / this.dayLen) % 1; }
  get season() { return SEASONS[((this.day % YEAR) + YEAR) % YEAR]; }
  get winter() { return this.season === "winter"; }
  isNight() { return this.nightly && (this.frac > 0.74 || this.frac < 0.03); }
  // how many sleep in a cabin: two, three once it is a house in timber and plaster (and one more with Land Ownership)
  sleeps(b) { return ((b.tier || 1) >= 2 ? 3 : 2) + (this.knows("landownership") ? 1 : 0); }
  // your own cabin, rebuilt as a house: a settler for every bed in it past your own two (three at most)
  get ownBeds() {
    if ((this.S.homeTier || 1) < 2) return 0;
    const beds = (this.w.furniture || []).filter(f => FURNITURE[f.type] && FURNITURE[f.type].bed).length;
    return Math.min(3, Math.max(0, beds - 2));
  }
  // the bed for the i-th settler, in the order they came: the cabins first, then your own house; null, by the fire
  bedFor(i) {
    if (i < 0) return null;
    for (const b of this.S.buildings) {
      if (!b.done || b.type !== "cabin") continue;
      const n = this.sleeps(b); if (i < n) return { b }; i -= n;
    }
    return i < this.ownBeds ? { own: true } : null;
  }
  // where someone sleeps; the rest by the fire
  homeOf(a) {
    const i = this.S.people.indexOf(a.settler);
    const bed = this.bedFor(i), b = bed && bed.b;
    if (bed && bed.own) return { door: [CABIN.x + Math.sin(CABIN.ry) * 3.7, CABIN.z + Math.cos(CABIN.ry) * 3.7], inside: true };
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
    while (this.isNight() && !(this.raids && this.raids.active)) { await sleep(1.5); alive(); }
    a.root.visible = true; a.inside = false; a.lying = false; a.yOff = 0;
  }

  // ---- what the settlement can hold ----
  get hearths() { return 1 + this.count("cabin"); }
  get beds() { return 2 + this.ownBeds + this.S.buildings.filter(b => b.done && b.type === "cabin").reduce((a, b) => a + this.sleeps(b), 0); }
  // every tree gives two logs; a good saw and the sawing crafts make the felling quicker instead
  get logsPerTree() { return LOGS_PER_TREE; }
  get storeCap() { return 40 + this.S.buildings.filter(b => b.done && b.type === "woodshed").reduce((a, b) => a + SHED_BAYS[b.bays || 1].holds, 0); }
  has(type) { return this.S.buildings.some(b => b.done && b.type === type); }
  count(type) { return this.S.buildings.filter(b => b.done && b.type === type).length; }

  // on a path? (for footsteps)
  pathAt(x, z) {
    for (const b of this.S.buildings) {
      if (b.type !== "path") continue;
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.ry), s2 = Math.sin(b.ry);
      const lx = dx * c - dz * s2, lz = dx * s2 + dz * c;
      if (Math.abs(lx) < 1.15 && Math.abs(lz) < 1.9) return true;
    }
    return false;
  }
  // ---- room: the settlement's edge, and growing it ----
  get clearR() { return CLEARING.r + this.S.expand * RING; }
  // trees still standing on ground marked to be cleared
  toClear() { return this.w.fellable.filter(t => ((t.ring && t.ring <= this.S.expand) || t.lobe) && (t.state === "up" || t.state === "shake")); }
  // ---- growing: every so many people, room to push the forest back — where you mark it out on the map ----
  get pop() { return this.S.people.length + 2; }
  // how many claims the settlement has earned and not yet made
  roomDue() { return GROW_AT.filter(n => this.pop >= n).length - this.S.lobes.length - this.S.expand; }
  nextGrowAt() { return GROW_AT.find(n => n > this.pop) || null; }
  // where the trees stand now: the old edge of the forest
  get treeline() { return CLEARING.r + 14 + this.S.expand * RING; }
  // is a point on the settlement's ground, near enough? (the old clearing out to the trees, or a claim, or within `pad` of one)
  inTerritory(x, z, pad = 0) {
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) <= this.treeline + pad) return true;
    if ((this.S.colonies || []).some(c => Math.hypot(x - c.x, z - c.z) <= c.r + pad)) return true;
    return this.S.lobes.some(l => inPoly(l.poly, x, z) || (pad > 0 && l.poly.some((p, i) => segDist(x, z, p, l.poly[(i + 1) % l.poly.length]) < pad)));
  }
  // a line drawn by hand ([[x, z], ...]) out from the settlement's ground and back to it: the ground it rings is claimed
  claimFor(pts) {
    const C = CLEARING;
    if (!pts || pts.length < 2) return { poly: [], area: 0, trees: 0, len: 0, ok: false, why: "Hold the left button and draw from the edge of the settlement out into the trees, and back" };
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const poly = pts.map(p => [p[0], p[1]]);
    // the new ground: what the line rings that isn't already ours (counted a pace at a time)
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    let area = 0;
    for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) for (let z = Math.floor(Math.min(...zs)); z <= Math.max(...zs); z++)
      if (inPoly(poly, x + 0.5, z + 0.5) && !this.inTerritory(x + 0.5, z + 0.5)) area++;
    const fresh = (x, z) => inPoly(poly, x, z) && !this.inTerritory(x, z);
    const trees = this.w.fellable.filter(t => (t.state === "up" || t.state === "shake") && !t.lobe && fresh(t.x, t.z)).length
      + this.w.forest.filter(s => !s.gone && fresh(s.x, s.z)).length;
    const far = this.treeline + 30 + this.S.lobes.length * 10;
    const a = pts[0], b = pts[pts.length - 1];
    let why = null;
    if (this.roomDue() <= 0) why = this.nextGrowAt() ? `No room to grow until there are ${this.nextGrowAt()} of you` : "The settlement has grown as far as it can";
    else if (!this.inTerritory(a[0], a[1], 5)) why = "Start the line on the settlement's own ground, at its edge";
    else if (!this.inTerritory(b[0], b[1], 5)) why = "Bring the line back to the settlement's ground to close it";
    else if (area < 60) why = "That rings hardly any new ground — draw further out into the trees";
    else if (pts.some(p => Math.hypot(p[0] - C.x, p[1] - C.z) > far)) why = "Too far out — keep it closer to the settlement";
    else if (area > MAX_CLAIM) why = `Too much ground at once (${area} of ${MAX_CLAIM} square paces)`;
    return { poly, area, trees, len: Math.round(len), ok: !why, why };
  }
  claim(pts) {
    const c = this.claimFor(pts); if (!c.ok) return false;
    this.S.lobes.push({ poly: c.poly.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]), day: this.day });
    const trees = this.w.clearArea(this.S.lobes[this.S.lobes.length - 1].poly, this.S.lobes.length);
    this.w._mapDirty = true;
    this.persist();
    const sib = G.who === "sister" ? "Brother" : "Sister";
    UI.bark(sib, trees.length ? "Right — that ground's ours. Axes out, everyone: the trees on it come down." : "That ground's ours now.", 4.5);
    UI.hint(`The settlement is growing: ${trees.length} trees to fell on the new ground. Everyone but the farmers is felling them — you too. Build there once it's clear.`, 7);
    this.emit("expand", this.S.lobes.length);
    return true;
  }
  // is this spot on the settlement's ground? (the old circle, or a claim, with room for something r across)
  onGround(x, z, r) {
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) <= this.clearR + 6 - r * 0.5) return true;
    // (a settlement founded out in the forest)
    if ((this.S.colonies || []).some(c => Math.hypot(x - c.x, z - c.z) <= c.r + 2 - r * 0.5)) return true;
    for (const l of this.S.lobes) {
      if (!inPoly(l.poly, x, z)) continue;
      // (clear of the claim's outer edges by half its size: the edge on the circle is open to the old ground)
      let near = Infinity;
      for (let i = 0; i < l.poly.length; i++) {
        const p = l.poly[i], q = l.poly[(i + 1) % l.poly.length];
        // (an edge that runs through the old clearing is open to it)
        if (Math.hypot((p[0] + q[0]) / 2 - CLEARING.x, (p[1] + q[1]) / 2 - CLEARING.z) <= this.treeline) continue;
        near = Math.min(near, segDist(x, z, p, q));
      }
      if (near >= r * 0.45) return true;
    }
    return false;
  }

  // ---- knowledge: Forester's tech tree (gov.js), researched with DM and time ----
  knows(id) { return this.S.tech.done.includes(id); }
  // the way to a piece of knowledge: what must be learned first, in order (the first of them can be studied now)
  pathTo(id) {
    const out = [], seen = new Set();
    const walk = k => { if (seen.has(k) || this.knows(k) || !TECH[k]) return; seen.add(k); for (const r of TECH[k].req) walk(r); out.push(TECH[k]); };
    walk(id); return out;
  }
  // "Research X (G) — then Y, then Z — for a ..." : said so it can be done
  researchAdvice(id, forWhat) {
    const p = this.pathTo(id); if (!p.length) return null;
    const first = p[0], rest = p.slice(1).map(x => x.name);
    return `Research ${first.name} (G)${rest.length ? `, then ${rest.join(", then ")},` : ""} for ${forWhat}`;
  }
  canResearch(id) { const t = TECH[id]; return !!t && !this.knows(id) && !this.S.tech.research && t.req.every(r => this.knows(r)); }
  research(id) {
    const t = TECH[id];
    if (!t || this.knows(id)) return false;
    if (this.S.tech.research) { UI.hint("The scholars are already busy.", 3); return false; }
    if (!t.req.every(r => this.knows(r))) { UI.hint("Its prerequisites are not yet known.", 3); return false; }
    const cost = techCost(t);
    if (this.S.coin < cost) { UI.hint(`Research costs ${cost} DM. The treasury holds ${G.dm(this.S.coin)}.`, 3.5); return false; }
    this.S.coin -= cost;
    this.S.tech.research = { id, t: 0 };
    UI.hint(`Research begun: ${t.name} (${Math.round(techTime(t) / 60 * 10) / 10} min).`, 3.5);
    this.persist(); this.emit("researching", id);
    return true;
  }
  // (in free play the plans and the trades wait on what is known, as in Forester; the story chapters teach their own)
  // (research gates what can be built and worked in every chapter with a settlement, not only in free play)
  gated(type) { const g = (this.researchGates || this.techGates) && BUILD_GATES[type]; return g && !this.knows(g) ? TECH[g] : null; }
  // (a work done at a building needs only the building: whatever let you build it lets you staff it)
  jobGated(job) { const g = (this.researchGates || this.techGates) && JOB_GATES[job]; return g && !this.knows(g) && !(JOB_AT[job] && this.has(JOB_AT[job])) ? TECH[g] : null; }
  // what the knowledge does here
  get chopMul() { return (this.knows("axing") ? 0.65 : this.knows("treecutting") ? 0.8 : 1) * (this.S.upgrades.saw ? 0.9 : 1) * (this.knows("sawing") ? 0.85 : 1) * (this.knows("sawmills") ? 0.85 : 1); }
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
    const homeless = Math.max(0, S.people.length - (this.beds - 2));
    v += add(-Math.min(20, homeless * 3), `no bed for ${homeless}`);
    if (S.lootedDay != null && this.day - S.lootedDay < 3) v += add(-12, "raiders took from the stores");
    if (this.has("church")) v += add(10, "a church");
    if (this.has("well")) v += add(4, "a well");
    if (this.has("market")) v += add(4, "a market");
    if (S.bread > 0) v += add(5, "bread on the table");
    if ((S.mournUntil || 0) > this.day) v += add(-10, "mourning the dead");
    v += add((this.tierLevel - 1) * 4, "the town they live in");
    for (const [id, n] of [["taming", 3], ["pets", 4], ["pettoys", 4]]) if (this.knows(id)) v += add(n, TECH[id].name.toLowerCase());
    return { value: clamp(Math.round(v), 0, 100), why };
  }

  // a turned rectangle (w along the building's width, d its depth) as circles: rows of them along the longer side
  // a building whose solid parts are only some of it: circles where they stand, [x, z, r] in its own frame
  solidAt(b, parts, top) {
    const col = this.w.col, c = Math.cos(b.ry), s = Math.sin(b.ry);
    return parts.map(([lx, lz, r]) => { const o = col.addCircle(b.x + lx * c + lz * s, b.z - lx * s + lz * c, r, top); o.npcPad = 0.3; return o; });
  }
  footprint(b, w, d, top) {
    const col = this.w.col, c = Math.cos(b.ry), s = Math.sin(b.ry), out = [];
    const long = Math.max(w, d), short = Math.max(0.4, Math.min(w, d)), r = short / 2;
    const alongW = w >= d, n = Math.max(1, Math.ceil((long - short) / r) + 1);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : -((long - short) / 2) + i * (long - short) / (n - 1);
      const lx = alongW ? k : 0, lz = alongW ? 0 : k;
      // (people other than you keep 0.6 further off: the walls where they really are)
      const o = col.addCircle(b.x + lx * c + lz * s, b.z - lx * s + lz * c, r, top); o.npcPad = 0.6; out.push(o);
    }
    return out;
  }
  // ---- showing a building: a frame and a heap of logs while it goes up, the thing itself when done ----
  show(b) {
    const w = this.w, def = BUILDINGS[b.type];
    let g = this.vis.get(b);
    if (g) { w.root.remove(g); if (g.userData.col) w.col.remove(g.userData.col); for (const c of g.userData.cols || []) w.col.remove(c); }
    // (a building's ground is dug level for it: a pad cut into the slope, with a bank round it)
    if (!def.path && b.type !== "field" && !def.wall && w.addPad) {
      const bays = b.type === "woodshed" ? b.bays || 1 : 1;
      w.addPad(b, b.x, b.z, b.ry, def.w * bays + 0.8, def.d + 0.8, this.baseY(b) + 0.05);
    }
    g = new THREE.Group(); g.position.set(b.x, this.baseY(b), b.z); g.rotation.y = b.ry;
    if (def.wall && !b.done) {
      // a length not yet raised: stakes at its ends and a line between, the logs piling beside it
      const stake = mat(0x8a6a44, { surface: "wood" }), line = mat(0xe8dcc0, { surface: "none" });
      for (const sx of [-def.w / 2, def.w / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), stake); m.position.set(sx, 0.35, 0); g.add(m); }
      const cord = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.015, 0.015), line); cord.position.y = 0.55; g.add(cord);
      const n = Math.min(b.logs || 0, def.cost || 0);
      if (n) g.add(makeLogs(Array.from({ length: n }, (_, i) => ({ x: -def.w / 2 + 0.5 + (i % 4) * 0.15, y: 0.1 + Math.floor(i / 4) * 0.2, z: 0.6, len: 2.2, r: 0.1, dir: "x" })), n));
      g.userData.cols = [];
    } else if (def.wall) {
      // a length of wall (or its rubble), with colliders along it, since the boxes can only lie square to the map
      wallVis(g, b, def);
      g.userData.cols = [];
      if (!b.broken && !(def.wall === "gate" && b.open)) {
        const [e0, e1] = wallEnds(b, def), n = Math.ceil(def.w / 0.45);
        for (let i = 0; i <= n; i++) { const k = i / n, cx = e0.x + (e1.x - e0.x) * k, cz = e0.z + (e1.z - e0.z) * k; g.userData.cols.push(w.col.addCircle(cx, cz, def.d / 2 + 0.05, w.heightAt(cx, cz) + WALL_H + 0.5)); }   // (the height is the world's, not above the ground)
      }
    } else if (b.type === "field") this.fieldVis(g, b);
    else if (b.type === "path") {
      const cob = this.tierLevel >= 3;
      // low-poly, like the ground: a flat-shaded strip of trodden earth, or of cobbles in a brick town — a few facets, no photograph
      PATH_MAT.dirt ??= new THREE.MeshStandardMaterial({ color: 0x8a6e4e, roughness: 1, flatShading: true });
      PATH_MAT.cob ??= new THREE.MeshStandardMaterial({ color: 0x8c8880, roughness: 0.95, flatShading: true });
      // (laid on the ground as it is: down a slope it runs with the slope, and the next strip meets it)
      const pg = new THREE.PlaneGeometry(def.w, def.d + 0.4, 3, 8); pg.rotateX(-Math.PI / 2);
      this.drape(pg, b, 0.035, 0.03);
      const strip = new THREE.Mesh(pg, cob ? PATH_MAT.cob : PATH_MAT.dirt);
      strip.receiveShadow = true; g.add(strip);
      // (a rounded end at each, so strips laid end to end at an angle meet with no notch between them)
      for (const s of [-1, 1]) {
        const cg = new THREE.CircleGeometry(def.w / 2, 8); cg.rotateX(-Math.PI / 2); cg.translate(0, 0, s * def.d / 2);
        this.drape(cg, b, 0.05);
        const cap = new THREE.Mesh(cg, strip.material); cap.receiveShadow = true; g.add(cap);
      }
      g.userData.cob = cob;
    } else if (b.type === "stable" && b.done) {
      // a lean-to on posts, boarded at the back and the ends, two stalls, hay — and a horse in, when yours isn't out
      const bb = new Builder(), W = BUILDINGS.stable.w, D = BUILDINGS.stable.d;
      for (const px of [-W / 2, 0, W / 2]) for (const pz of [-D / 2, D / 2]) bb.box(0.18, pz < 0 ? 2.6 : 2.2, 0.18, px, (pz < 0 ? 2.6 : 2.2) / 2, pz, 0x5a4230);
      bb.box(W, 1.6, 0.08, 0, 0.8, -D / 2, 0x6a4a2e);
      for (const px of [-W / 2, W / 2]) bb.box(0.08, 1.4, D, px, 0.7, 0, 0x6a4a2e);
      bb.box(0.08, 1.2, D * 0.8, 0, 0.6, -D * 0.1, 0x7a5634);
      const roof = new THREE.BoxGeometry(W + 0.6, 0.12, D + 0.8); bb.add(roof, 0x4e3a28, 0, 2.45, 0, -0.1, 0, 0);
      bb.box(1.1, 0.5, 0.7, W / 2 - 0.8, 0.25, -D / 2 + 0.5, 0xc8a850);
      bb.box(0.9, 0.35, 0.3, -W / 2 + 0.7, 0.9, -D / 2 + 0.25, 0x7a5634);
      const vis = bb.build(MAT.rough); vis.castShadow = true; g.add(vis);
      if (!G.player || !G.player.horse) { const h = makeHorse(0x6a4428); h.root.scale.setScalar(0.92); h.root.position.set(-W / 4, 0, -0.2); h.root.rotation.y = Math.PI; g.add(h.root); g.userData.horse = h; }
      g.userData.cols = this.solidAt(b, [[-W / 2 + 0.6, -D / 2 + 0.3, 0.45], [-W / 4, -D / 2 + 0.3, 0.45], [0, -D / 2 + 0.3, 0.45], [W / 4, -D / 2 + 0.3, 0.45], [W / 2 - 0.6, -D / 2 + 0.3, 0.45], [-W / 2, 0.6, 0.3], [W / 2, 0.6, 0.3]], w.heightAt(b.x, b.z) + 3);
      this.stableIt(b);
    } else if (b.type === "storehouse" && b.done) {
      // a big iron-bound chest on the ground, under a lean little roof on four posts
      const bb = new Builder();
      bb.box(1.5, 0.72, 0.85, 0, 0.36, 0, 0x6a4a2e, 0, 0.06);
      bb.box(1.56, 0.12, 0.9, 0, 0.78, 0, 0x5a3e24);
      for (const o of [-0.45, 0.45]) bb.box(0.07, 0.8, 0.92, o, 0.4, 0, 0x2a2724);
      for (const [px, pz] of [[-1.05, -0.85], [1.05, -0.85], [-1.05, 0.85], [1.05, 0.85]]) bb.box(0.14, 1.9, 0.14, px, 0.95, pz, 0x5a4230);
      bb.add(prismGeo(2.3, 0.55, 1.9, 0.18), 0x4e3a28, 0, 1.9, 0);
      const vis = bb.build(MAT.rough); vis.castShadow = true; g.add(vis);
      g.userData.cols = this.footprint(b, 1.6, 0.9, w.heightAt(b.x, b.z) + 1.2);
    } else if (b.done) {
      const key = modelKey(b), m = modelCopy(key);
      if (m) {
        g.add(m.scene);
        // (the woodshed's own logs are drawn from the store, not always full; a bigger one is more bays of it, side by side)
        if (b.type === "woodshed") {
          const n = b.bays || 1, bays = [m.scene];
          for (let i = 1; i < n; i++) { const m2 = modelCopy(key); if (m2) { g.add(m2.scene); bays.push(m2.scene); } }
          bays.forEach((o, i) => { o.position.x += (i - (bays.length - 1) / 2) * def.w; o.traverse(q => { if (q.isMesh && /log/.test(q.name)) q.visible = false; }); });
        }
      } else {
        const bb = new Builder(); bb.box(def.w * 0.8, 2.4, def.d * 0.8, 0, 1.2, 0, 0x7a5634); g.add(bb.build());
        // the real one is fetched, and put up in place of this when it comes
        ensureModel(key).then(ok => { if (ok && this.vis.get(b) === g && !this.stopped) this.show(b); });
      }
      // solid: the building's own turned footprint, filled with a row of circles a little inside its walls —
      // a square box round a turned building stood out past its corners, and caught you walking round it
      g.userData.cols = SOLID[b.type] ? this.solidAt(b, SOLID[b.type], w.heightAt(b.x, b.z) + 8)
        : this.footprint(b, def.w * (b.type === "woodshed" ? b.bays || 1 : 1) - 1.2, def.d - 1.2, w.heightAt(b.x, b.z) + 8);   // (well inside the walls: you slip round a corner)
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
      // the sign: what it still wants, or that it's ready for your hands
      if (b.type !== "field") {
        const want = this.wants(b), rows = [];
        rows.push(["store", `${Math.min(b.logs || 0, def.cost)} / ${def.cost} logs`, (b.logs || 0) >= def.cost]);
        for (const [k, n2] of Object.entries(def.mats || {})) rows.push([k, `${n2 - (want[k] || 0)} / ${n2} ${MAT_NAME[k]}`, !want[k]]);
        const ready = this.ready(b);
        if (NEEDS_DOOR.has(b.type)) rows.push(["", b.door ? "Door hung" : (this.S.doors || 0) > 0 ? "A door is hewn — hang it (F)" : "Needs a door — hew one at the sawhorse", !!b.door]);
        if (ready) rows.push(["", "Raise it — hold F", true]);
        const sign = siteSign(rows, ready);
        sign.position.set(0, 3.4 + rows.length * 0.28, 0);
        g.add(sign);
      }
      const n = Math.min(b.logs || 0, def.cost);
      g.add(bb.build(MAT.rough));
      if (n) g.add(makeLogs(Array.from({ length: n }, (_, i) => ({ x: (i % 5 - 2) * 0.32, y: 0.15 + Math.floor(i / 5) * 0.27, z: def.d / 2 + 1.2, len: 2.4, r: 0.15, dir: "x" })), n + 5));
    }
    w.root.add(g); this.vis.set(b, g);
    if (b.type === "woodshed" && b.done) this.showStore();
  }
  fieldVis(g, b) {
    const w = this.w, growth = b.growth ?? 0;
    const H = [0.12, 0.12, 0.45, 0.95][growth], C = [0x6a8a3a, 0x6a8a3a, 0x7a9a3e, 0xc8a850][growth];
    // (the strips lie on the ground as it is: down a slope, they bend with it)
    const up = (lx, lz) => this.groundAt(b, lx, lz);
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 2.2;
      if (k >= (b.dug || 0)) {
        const lg = new THREE.PlaneGeometry(1.7, 7, 1, 10); lg.rotateX(-Math.PI / 2); lg.translate(o, 0, 0); this.drape(lg, b, 0.04);
        const line = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xc8962e, transparent: true, opacity: 0.18, depthWrite: false }));
        g.add(line); continue;
      }
      const sg = new THREE.PlaneGeometry(1.7, 7, 2, 12); sg.rotateX(-Math.PI / 2); sg.translate(o, 0, 0); this.drape(sg, b, 0.07, 0.03);
      const soil = new THREE.Mesh(sg, mat(0x3e2e22, { surface: "stone" }));
      soil.receiveShadow = true; g.add(soil);
      if (b.sown && growth > 0) for (const f of [-0.5, 0, 0.5]) for (let z = -3; z <= 3; z += growth > 1 ? 0.3 : 0.5) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(growth > 1 ? 0.05 : 0.03, H, 4), mat(C, { surface: "needles" }));
        m.position.set(o + f, up(o + f, z) + 0.08 + H / 2, z); g.add(m);
      }
    }
  }
  // where a building sits: at the lowest of its corners and middle, so on a slope it is dug into the hill, never
  // standing on air (a path or a field lies on the ground as it is, from its middle)
  baseY(b) {
    const w = this.w, def = BUILDINGS[b.type], h0 = w.heightAt(b.x, b.z);
    if (def.path || b.type === "field" || def.wall) return h0;
    const c = Math.cos(b.ry), s = Math.sin(b.ry), hw = def.w * (b.type === "woodshed" ? b.bays || 1 : 1) / 2 * 0.85, hd = def.d / 2 * 0.85;
    let lo = h0;
    for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, -hd], [0, hd], [-hw, 0], [hw, 0]]) lo = Math.min(lo, w.heightAt(b.x + lx * c + lz * s, b.z - lx * s + lz * c));
    return lo - 0.05;
  }
  // the ground under a point of a building's own frame, from where the building stands
  groundAt(b, lx, lz) {
    const c = Math.cos(b.ry), s = Math.sin(b.ry);
    return this.w.heightAt(b.x + lx * c + lz * s, b.z - lx * s + lz * c) - this.baseY(b);
  }
  // lay a flat geometry (in the building's frame) over the ground: each point raised to the ground under it
  drape(geo, b, lift = 0.03, jitter = 0, seed = 0) {
    const p = geo.attributes.position, base = this.baseY(b), c = Math.cos(b.ry), s = Math.sin(b.ry), rr = jitter ? rng(seed || Math.floor(b.x * 13 + b.z * 7)) : null;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getZ(i);
      p.setY(i, p.getY(i) + this.w.heightAt(b.x + lx * c + lz * s, b.z - lx * s + lz * c) - base + lift + (rr ? rr() * jitter : 0));
    }
    p.needsUpdate = true; geo.computeVertexNormals();
    return geo;
  }

  // ---- can it go here? inside the clearing, clear of everything solid, trees and other plans ----
  fits(type, x, z, ry) {
    const def = BUILDINGS[type], w = this.w;
    const r = Math.hypot(def.w, def.d) / 2;
    if (!def.wall && !this.onGround(x, z, r)) return false;
    if (def.wall) {
      // a length of wall: out to the edge of the ground won, not through a building, a tree, or the same place twice
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) > this.clearR + 10 && !this.S.lobes.some(l => inPoly(l.poly, x, z) || l.poly.some((p, i) => i < l.poly.length - 1 && segDist(x, z, p, l.poly[i + 1]) < 4))) return false;
      for (const b of this.S.buildings) {
        const d2 = BUILDINGS[b.type];
        if (b.type === "path" || b.type === "field") continue;
        if (d2.wall) { if (Math.hypot(b.x - x, b.z - z) < 1.2) return false; continue; }
        if (Math.hypot(b.x - x, b.z - z) < Math.hypot(d2.w, d2.d) / 2 * 0.8 + 0.6) return false;
      }
      for (const t of w.fellable) if ((t.state === "up" || t.state === "shake") && Math.hypot(t.x - x, t.z - z) < 1.3) return false;
      return Math.hypot(FIRE.x - x, FIRE.z - z) > 3 && Math.hypot(CABIN.x - x, CABIN.z - z) > 4.5 && Math.hypot(STACK.x - x, STACK.z - z) > 2.5;
    }
    if (def.path) {
      // a path strip: anywhere open — up to a door, beside a field, onto another strip — but not through a building or a tree
      for (const b of this.S.buildings) { if (b.type === "path" || b.type === "field") continue; const d2 = BUILDINGS[b.type]; if (Math.hypot(b.x - x, b.z - z) < Math.hypot(d2.w, d2.d) / 2 * 0.75) return false; }
      for (const t of w.fellable) if ((t.state === "up" || t.state === "shake") && Math.hypot(t.x - x, t.z - z) < 1.1) return false;
      return Math.hypot(FIRE.x - x, FIRE.z - z) > 1.8 && Math.hypot(CABIN.x - x, CABIN.z - z) > 3.2;
    }
    for (const b of this.S.buildings) { if (b.type === "path") continue; const d2 = BUILDINGS[b.type]; if (Math.hypot(b.x - x, b.z - z) < (d2.wall ? 1.4 + r * 0.8 : (Math.hypot(d2.w, d2.d) / 2 + r) * 0.8)) return false; }
    for (const t of w.fellable) if ((t.state === "up" || t.state === "shake") && Math.hypot(t.x - x, t.z - z) < r) return false;
    for (const [px, pz, pr] of [[CABIN.x, CABIN.z, 4.6], [STACK.x, STACK.z, 2], [BLOCK.x, BLOCK.z, 1.4], [FIRE.x, FIRE.z, 2.2]]) if (Math.hypot(px - x, pz - z) < pr + r * 0.8) return false;
    if (this.opts.keepClear) for (const [px, pz, pr] of this.opts.keepClear) if (Math.hypot(px - x, pz - z) < pr + r * 0.8) return false;
    for (const c of this.S.companies || []) if (!c.waiting && !c.refused && Math.hypot(c.x - x, c.z - z) < 2.8 + r * 0.8) return false;
    return true;
  }

  // ---- planning: the ghost follows your eye; resolves with the new building, or null ----
  plan(type) {
    const gate = this.gated(type);
    if (gate) { UI.hint(`${this.researchAdvice(gate.id, `a ${BUILDINGS[type].name.toLowerCase()}`)}.`, 5); return; }
    G.guide && G.guide("building");
    if (this.planning) this.planning.cancel();
    const def = BUILDINGS[type], w = this.w, pl = G.player;
    const ghost = new THREE.Group();
    const tint = new THREE.MeshStandardMaterial({ color: 0x7fe07a, transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.8, emissive: 0x2a5a26, emissiveIntensity: 0.5 });
    const dress = obj => { obj.traverse(o => { if (o.isMesh || o.isInstancedMesh) { o.material = tint; o.castShadow = false; o.receiveShadow = false; } }); return obj; };
    // what it will look like: the building itself, pale green — its model when it has come, a block and a roof till then
    const body = new THREE.Group(); ghost.add(body);
    const standIn = () => {
      body.clear();
      if (def.wall) { wallVis(body, { x: 0, z: 0, ry: 0, open: false }, def); dress(body); return; }
      if (def.path || type === "field") { const flat = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.08, def.d), tint); flat.position.y = 0.04; body.add(flat); return; }
      const h = Math.min(5, 2.4 + Math.max(def.w, def.d) * 0.25);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(def.w * 0.9, h, def.d * 0.9), tint); walls.position.y = h / 2; body.add(walls);
      const roof = new THREE.Mesh(prismGeo(def.w * 0.96, h * 0.55, def.d * 0.96, 0.5), tint); roof.position.y = h; body.add(roof);
    };
    standIn();
    const key = def.model ? modelKey({ type, tier: 1 }) : null;
    if (key) ensureModel(key).then(ok => { if (!ok || !ghost.parent) return; const m = modelCopy(key); if (m) { body.clear(); body.add(dress(m.scene)); } });
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(def.w, 0.05, def.d)), new THREE.LineBasicMaterial({ color: 0x7fe07a }));
    edge.position.y = 0.05; ghost.add(edge);
    w.root.add(ghost);
    let ry = CABIN.ry, x = 0, z = 0, ok = false;
    const strip = def.path || (def.wall && def.wall !== "gate");
    if (!strip || !this._pathKeys) UI.keys(strip ? [["Click", def.wall ? "lay a length" : "lay a strip"], ["Hold R", "turn it"], ["B", "done"]] : [["Click", "set it here"], ["Hold R", "turn it"], ["B", "put the plan away"]], 9);
    if (strip) this._pathKeys = true;
    if (def.wall && this._wallRy != null) ry = this._wallRy;
    return new Promise(res => {
      const input = G.input;
      const tick = (dt = 1 / 60) => {
        const f = pl.forward(), d = def.path ? 3 : def.wall ? 3.5 : 4 + Math.max(def.w, def.d) / 2;
        x = pl.pos.x + f.x * d; z = pl.pos.z + f.z * d;
        // turned smoothly while R is held (with Shift, the other way); nothing snaps
        if (input.down("KeyR")) ry += dt * 1.7 * (input.down("ShiftLeft") || input.down("ShiftRight") ? -1 : 1);
        // B puts the plan away, as Escape does
        if (input.hit("KeyB")) { done(null); return; }
        // (a path strip snaps onto the end of the last, so a path is laid in one piece)
        let px = x, pz = z, pry = ry;
        if (def.path) ({ x: px, z: pz, ry: pry } = this.snapPath(def, x, z, ry));
        ok = this.fits(type, px, pz, pry);
        ghost.position.set(px, w.heightAt(px, pz), pz); ghost.rotation.y = pry;
        const col = ok ? 0x7fe07a : 0xe0503a; tint.color.setHex(col); edge.material.color.setHex(col);
        if ((input.click || input.hit("KeyF")) && ok) {
          // (a wall is laid out a length at a time, each a site of its own: its logs brought, then raised)
          if (def.wall) { this._wallRy = ry; done({ type, x, z, ry, logs: 0, dug: 0, done: false }); }
          else done({ type, x: px, z: pz, ry: pry, logs: 0, dug: 0, done: !!def.path });
        }
        if (input.hit("Escape")) done(null);
      };
      const done = b => {
        const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1);
        w.root.remove(ghost); this.planning = null;
        if (b) { this.S.buildings.push(b); this.show(b); if (!def.path) this.site(b); this.clearStumps(b); this.persist(); SFX().build(); }
        res(b);
        // (a path or a wall goes on: the next length is ready to lay until you put the plan away)
        if (b && strip) setTimeout(() => { if (!this.planning && !this.stopped) this.plan(type); }, 0);
        if (!b) this._wallRy = null;
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
          this.S.store -= d.logs || 0; this.S.rye -= d.rye || 0; this.showStore();
          this.S.furniture = [...w.furniture, f]; w.setFurniture(this.S.furniture);
          this.persist(); SFX().build(); this.emit("furnished", f);
          // made on the spot: a moment's hammering
          pl.workFor && pl.workFor("hammer", 1.8);
          UI.hint(`${d.name} made: ${[d.logs ? `${d.logs} logs` : "", d.rye ? `${d.rye} rye` : ""].filter(Boolean).join(" and ")} from the ${this.has("woodshed") ? "woodshed" : "stack"} (${this.S.store} left).`, 4);
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
    if (b._it && w.interact.includes(b._it)) return;          // (already has one)
    const at = () => ({ x: b.x, z: b.z });
    const along = b.type === "field" ? [b.x - Math.sin(b.ry) * 3.4, b.z - Math.cos(b.ry) * 3.4, b.x + Math.sin(b.ry) * 3.4, b.z + Math.cos(b.ry) * 3.4] : null;
    const it = w.addInteract({
      x: b.x, y: w.heightAt(b.x, b.z) + (along ? 0.3 : 0.9), z: b.z, reach: along ? 4.2 : Math.max(def.w, def.d) / 2 + 1.6, seg: along,
      hold: () => b.type === "field" || (b.logs >= def.cost) ? 3 : 0,
      label: () => {
        if (b.type === "field") return (b.dug || 0) < 3 ? `Dig the field — strip ${(b.dug || 0) + 1} of 3` : this.winter && (!b.sown || (b.growth ?? 1) >= 3) ? "Frozen ground — nothing is reaped or sown till spring" : !b.sown ? "Sow the rye" : (b.growth ?? 1) >= 3 ? "Reap the rye" : "The rye is growing";
        if (b.logs < def.cost) return pl.carryN > 0 ? `Add ${Math.min(pl.carryN, def.cost - b.logs)} logs (${b.logs} of ${def.cost})` : `Bring logs — ${b.logs} of ${def.cost}${this.S.people.some(p => !p.child) && !this.S.people.some(p => p.job === "hauler") ? " · nobody is hauling: F beside a settler to make one a hauler" : ""}`;
        const want = this.wants(b);
        if (Object.keys(want).length && G.guide) G.guide("materials");
        if (Object.keys(want).length) return this.afford(want, true) ? `Put in ${this.costText(want)} (from the stores and your pack)` : `Needs ${this.costText(want)} — ${this.short(want, true)} short. Break stone at the grey rocks, or put it in the store chest`;
        if (NEEDS_DOOR.has(b.type) && !b.door) return (this.S.doors || 0) > 0 ? "Hang the door" : "Needs a door — hew one at the sawhorse";
        return `Raise the ${def.name.toLowerCase()}`;
      },
      can: () => b.type === "field" ? (!b.sown || ((b.growth ?? 1) >= 3 && !b._reap)) && !(this.winter && (b.dug || 0) >= 3) : (b.logs < def.cost ? pl.carryN > 0 : !(NEEDS_DOOR.has(b.type) && !b.door && !Object.keys(this.wants(b)).length && !(this.S.doors > 0))),
      onHoldTick: (dt, t) => { if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) SFX().hammer(); },
      use: () => {
        if (b.type === "field") {
          if ((b.dug || 0) < 3) b.dug = (b.dug || 0) + 1;
          else if (b.sown && (b.growth ?? 1) >= 3) { const got = RYE_HARVEST + (this.has("well") ? 1 : 0); this.S.rye += got; b.growth = 0; b.sown = false; UI.hint(`Reaped: ${got} rye to the stores.`, 3); }
          else { b.sown = true; b.growth = 1; b.done = true; }
          this.show(b); this.persist(); SFX().build(); this.emit("dug", b); G.guide && G.guide("field"); return;
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
          for (const [k, n] of Object.entries(want)) { const m = Math.min(n, this.haveYou(k)); this.take(k, m, true); b.got[k] = (b.got[k] || 0) + m; }
          this.show(b); this.persist(); SFX().pickup(); return;
        }
        if (NEEDS_DOOR.has(b.type) && !b.door) {
          if (!(this.S.doors > 0)) return;
          this.S.doors--; b.door = true; pl.workFor && pl.workFor("hammer", 1.2);
          this.show(b); this.persist(); SFX().build(); return;
        }
        b.done = true; w.removeInteract(it);
        // a church or a shrine is raised to one faith: the state creed, or the biggest congregation
        if ((b.type === "church" || b.type === "shrine") && !b.faith) { b.faith = dedication(this); UI.hint(`The ${b.type} is dedicated: ${b.type === "church" ? FAITHS[b.faith].house : FAITHS[b.faith].shrine}.`, 5); }
        this.show(b); this.persist(); SFX().build(); this.emit("built", b);
        if (G.guide) { if (b.type === "forge") G.guide("forge"); else if (b.type === "storehouse") G.guide("stores"); else if (b.type !== "path" && !BUILDINGS[b.type].wall) G.guide("inspect"); }
        if (b.type === "woodshed" && this.count("woodshed") === 1) UI.hint(`The woodshed is up: the logs from the stack go in under its roof (${this.S.store}), and the old stack is cleared away.`, 6);
      },
    });
    // the interact system wants hold as a number; keep it current
    Object.defineProperty(it, "hold", { get: () => (b.type === "field" ? 3 * digMul(G.body) : (this.ready(b) ? 4 * buildMul(G.body) : 0)) * this.workMul });
    b._it = it;
  }
  sitesAll() { for (const b of this.S.buildings) { if (!b.done || b.type === "field") this.site(b); else this.upgradeSpot(b); } }
  // ---- Europe: its day, word of it, and what it means for you ----
  europeTick() {
    const S = this.S, E = ensureEurope(S);
    // a fortnight's news at most: the biggest first
    for (const n of europeDay(S, this.day).slice(0, 2)) UI.news(n);
    // a crown that hates you, near enough to march, may declare war
    for (const id of NEAR) if (!E.war[id] && E.rel[id] <= -60 && Math.random() < 0.05) {
      E.war[id] = true; E.pact[id] = false;
      UI.news({ title: `${The(id)} declares war on ${S.name || "the settlement"}!`, sub: "Its soldiers will come up the road", img: "event_warparty" });
    }
    // trade pacts: customs, a DM a day each
    const pacts = Object.keys(E.pact).filter(id => E.pact[id] && !E.war[id]).length;
    if (pacts) { S.coin = (S.coin || 0) + pacts; this.showStore(); }
    this.persist();
  }
  // at war with one near enough to reach you? (its soldiers come instead of bandits)
  get enemy() { const E = this.S.europe; if (!E) return null; return [...NEAR].find(id => E.war[id]) || null; }
  makePeace(id, why) {
    const E = ensureEurope(this.S);
    E.war[id] = false; E.beaten[id] = 0; E.rel[id] = Math.max(E.rel[id], -20);
    UI.news({ title: `Peace with ${the(id)}.`, sub: why, img: "event_peace" }); this.persist();
  }
  // ---- sickness: some fall ill, day by day; the hospital and a doctor get them up again quickly ----
  sickness() {
    const S = this.S, E = S.europe, near = E ? [...NEAR].some(id => E.plague && E.plague[id]) : false;
    const cure = this.has("hospital") && S.people.some(p => p.job === "doctor" && !(p.sick > 0)) ? 3 : 1;
    for (const p of [...S.people]) {
      if (p.sick > 0) {
        // a fever can kill: rarely with a doctor, more often without, and most of all with the plague about
        const die = (cure > 1 ? 0.01 : 0.05) * (near ? 2 : 1) * (p.temper === "sickly" ? 1.5 : p.temper === "hardy" ? 0.5 : 1) * (p.child ? 1.5 : 1);
        if (Math.random() < die) { this.killSettler(p, "sick"); continue; }
        p.sick -= cure;
        if (p.sick <= 0) { p.sick = 0; UI.hint(`${p.name} is well again.`, 3); }
        continue;
      }
      let k = 0.02 * (near ? 4 : 1) * (this.winter && S.cold ? 2 : 1) * (p.temper === "sickly" ? 1.6 : p.temper === "hardy" ? 0.5 : 1) * (this.has("well") ? 0.8 : 1);
      if (Math.random() < k) {
        p.sick = 3 + Math.floor(Math.random() * 3);
        UI.hint(`${p.name} has fallen ill${near ? " — the plague is in the country round about" : ""}.${cure > 1 ? " The doctor will see to them." : this.has("hospital") ? " The hospital wants a doctor (F by someone)." : " A hospital and a doctor (Physick) would have them up sooner."}`, 6);
      }
    }
  }
  // ---- the law: in the night, a miserable settler may take from the stores ----
  // (Lutherans and Mennonites won't; a jail and a watchman catch the thief, who is held a day and disgraced)
  nightCrime() {
    const S = this.S;
    const thief = S.people.find(p => !p.child && p.jailedDay == null && !FAITHS[faithOf(p)].meek && this.mood(p).value < 30 && Math.random() < 0.35);
    if (!thief) return;
    const coin = Math.min(S.coin || 0, 3 + Math.floor(Math.random() * 4)), rye = coin ? 0 : Math.min(S.rye, 6);
    if (!coin && !rye) return;
    S.coin -= coin; S.rye -= rye; S.thefts = (S.thefts || 0) + 1;
    const what = coin ? `${coin} DM` : `${rye} rye`;
    const watch = S.people.some(p => p.job === "watch" && p !== thief), jail = this.has("jail");
    if (jail && watch && Math.random() < 0.85) {
      S.coin += coin; S.rye += rye; thief.jailedDay = this.day; S.caught = (S.caught || 0) + 1;
      this.setMark(thief, "disgraced", `caught taking ${what} from the stores, and held in the jail`);
      UI.hint(`In the night ${thief.name} took ${what} from the stores. The watch caught them: it's back, and they're in the jail for the day.`, 7);
    } else UI.hint(`In the night someone took ${what} from the stores. ${!jail ? "There's no jail" : "There's no watchman"} — nobody was caught. (Research Policing for a jail and the watch.)`, 7);
    this.persist(); this.showStore();
  }
  // a new strip of path: an end near another strip's end is moved onto it, and nearly in line it runs straight on
  snapPath(def, x, z, ry) {
    const h = def.d / 2, ux = Math.sin(ry), uz = Math.cos(ry);
    const strips = this.S.buildings.filter(b => b.type === "path");
    const ends = strips.flatMap(b => [-1, 1].map(e => ({ b, e, x: b.x + Math.sin(b.ry) * h * e, z: b.z + Math.cos(b.ry) * h * e })));
    let best = null, bd = 2.4;
    for (const b of strips) {
      for (const e of [-1, 1]) {
        const ex = b.x + Math.sin(b.ry) * h * e, ez = b.z + Math.cos(b.ry) * h * e;
        // (an end another strip already goes on from is taken)
        if (ends.some(o => o.b !== b && Math.hypot(o.x - ex, o.z - ez) < 0.5)) continue;
        for (const s of [-1, 1]) {
          const ax = x + ux * h * s, az = z + uz * h * s, d = Math.hypot(ax - ex, az - ez);
          if (d < bd) bd = d, best = { ex, ez, e, s, b };
        }
      }
    }
    if (!best) return { x, z, ry, snapped: false };
    // within 25 degrees of the old strip's line (either way along it), it carries straight on
    let r = ry;
    const diff = Math.atan2(Math.sin(ry - best.b.ry), Math.cos(ry - best.b.ry));
    if (Math.abs(diff) < 0.44) r = best.b.ry; else if (Math.abs(diff) > Math.PI - 0.44) r = best.b.ry + Math.PI;
    // this strip's near end goes onto the old end, and the strip lies away from it
    const out = best.e;   // (the old strip runs out of this end along +e)
    const bx = Math.sin(best.b.ry) * out, bz = Math.cos(best.b.ry) * out;
    let vx = Math.sin(r), vz = Math.cos(r);
    if (vx * bx + vz * bz < 0) { vx = -vx; vz = -vz; }       // (pointed on, not back over the old one)
    if (Math.abs(diff) >= 0.44 && Math.abs(diff) <= Math.PI - 0.44 && vx * bx + vz * bz < 0.05) {
      // a corner: it goes off to the side you are putting it
      if (vx * (x - best.ex) + vz * (z - best.ez) < 0) { vx = -vx; vz = -vz; }
    }
    return { x: best.ex + vx * h, z: best.ez + vz * h, ry: r, snapped: true };
  }
  // ---- walls ----
  // a new length's ends meet an old one's where they are near: the nearer end is moved onto it
  snapWall(def, x, z, ry) {
    const ux = Math.cos(ry), uz = -Math.sin(ry), h = def.w / 2;
    let best = null, bd = 1.4;
    for (const b of this.S.buildings) {
      const d2 = BUILDINGS[b.type]; if (!d2.wall) continue;
      for (const e of wallEnds(b, d2)) for (const s of [-1, 1]) {
        const ax = x + ux * h * s, az = z + uz * h * s, d = Math.hypot(ax - e.x, az - e.z);
        if (d < bd) { bd = d; best = { x: x + (e.x - ax), z: z + (e.z - az) }; }
      }
    }
    return best || { x, z };
  }
  // a blow at a length of wall; at nothing it's breached — rubble, and a way through, until it's mended
  hitWall(b, dmg) {
    const def = BUILDINGS[b.type];
    if (b.broken) return;
    b.hp = (b.hp ?? def.hp) - dmg;
    AUDIO.clang && Math.random() < 0.3 && AUDIO.clang(0.3, { x: b.x, z: b.z });
    SFX().chop();
    if (b.hp <= 0) { b.broken = true; b.hp = 0; this.show(b); this.persist(); SFX().treeFall(0.5); UI.hint(`The raiders have broken through the ${def.name.toLowerCase()}!`, 4); }
  }
  // the nearest standing length of wall (or a shut gate) to a point, and the nearest spot on it
  wallNear(p, within = 4) {
    let best = null, bd = within;
    for (const b of this.S.buildings) {
      const def = BUILDINGS[b.type]; if (!def.wall || !b.done || b.broken || (def.wall === "gate" && b.open)) continue;
      const [e0, e1] = wallEnds(b, def), ex = e1.x - e0.x, ez = e1.z - e0.z;
      const k = Math.max(0, Math.min(1, ((p.x - e0.x) * ex + (p.z - e0.z) * ez) / (ex * ex + ez * ez)));
      const x = e0.x + ex * k, z = e0.z + ez * k, d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = { b, x, z, d }; }
    }
    return best;
  }
  repairCost(b) { const def = BUILDINGS[b.type], k = b.broken ? 0.6 : 0.3; return { ...(def.cost ? { store: Math.max(1, Math.ceil(def.cost * k)) } : {}), ...Object.fromEntries(Object.entries(def.mats || {}).map(([m, n]) => [m, Math.max(1, Math.ceil(n * k))])) }; }
  repair(b) {
    const cost = this.repairCost(b);
    if (!this.afford(cost, true)) return `Mending it takes ${this.costText(cost)} — ${this.short(cost, true)} short.`;
    this.pay(cost, true); b.broken = false; b.hp = BUILDINGS[b.type].hp; this.show(b); this.showStore(); this.persist(); SFX().build();
    return null;
  }
  // gates stand open, and are shut while raiders are about
  updateGates() {
    const shut = !!(this.raids && this.raids.active);
    for (const b of this.S.buildings) {
      if (b.type !== "gate" || b.broken || !b.done) continue;
      const open = !shut;
      if (!!b.open !== open) { b.open = open; this.show(b); SFX().timberCrack && SFX().timberCrack(); }
    }
  }
  // ---- keeping and pulling down ----
  upkeepOf(b) { return b.done && CIVIC.has(b.type) ? CIVIC_UPKEEP : 0; }
  upkeepBill() { return this.S.buildings.reduce((n, b) => n + this.upkeepOf(b), 0); }
  get untended() { return this.techGates && this.S.unpaidDay === this.day; }
  // the building you are looking at: the nearest whose footprint the view points into, within a stone's throw
  buildingAt(pl = G.player, far = 16) {
    const f = pl.forward();
    let best = null, bs = Infinity;
    for (const b of this.S.buildings) {
      const def = BUILDINGS[b.type], dx = b.x - pl.pos.x, dz = b.z - pl.pos.z, d = Math.hypot(dx, dz);
      const r = Math.max(def.w, def.d) / 2;
      if (d > far + r) continue;
      // how far the line of sight passes from its middle, at its distance
      const along = dx * f.x + dz * f.z; if (along < -r) continue;
      const off = Math.abs(dx * f.z - dz * f.x);
      if (off > r + 0.5 && d > r) continue;
      const score = d + off * 2;
      if (score < bs) { bs = score; best = b; }
    }
    return best;
  }
  // what pulling it down gives back: half (three quarters, knowing Ownership); an unfinished site gives back all it was given
  refundOf(b) {
    const def = BUILDINGS[b.type];
    if (!b.done) return { store: b.logs || 0, ...(b.got || {}) };
    const k = this.knows("ownership") ? 0.75 : 0.5, out = {};
    if (def.cost) out.store = Math.floor(def.cost * k);
    for (const [m, n] of Object.entries(def.mats || {})) out[m] = Math.floor(n * k);
    return out;
  }
  dismantle(b) {
    const w = this.w, def = BUILDINGS[b.type];
    if (this.raids && this.raids.active) { UI.hint("Not with raiders in the settlement.", 3); return false; }
    const back = this.refundOf(b);
    const g = this.vis.get(b);
    if (g) { w.root.remove(g); if (g.userData.col) w.col.remove(g.userData.col); for (const c of g.userData.cols || []) w.col.remove(c); this.vis.delete(b); }
    if (b._it) { w.removeInteract(b._it); b._it = null; }
    this.S.buildings.splice(this.S.buildings.indexOf(b), 1);
    // what comes back goes in the stores (logs as far as there is room for them)
    for (const [k, n] of Object.entries(back)) this.S[k] = (this.S[k] || 0) + n;
    this.S.store = Math.min(this.S.store, this.storeCap);
    this.showStore(); this.updateStreets(); this.persist(); SFX().treeFall && SFX().treeFall(0.3);
    UI.hint(`The ${def.name.toLowerCase()} is pulled down${Object.keys(back).length ? ` — back in the stores: ${this.costText(back)}` : ""}.`, 5);
    this.emit("dismantled", b);
    return true;
  }

  // ---- rebuilding in the next style: log, then Hamburg timber, then Hanseatic brick, then a city's stucco ----
  // ---- a woodshed made bigger: a bay built on beside it, if there is room ----
  // at a stable's open front: take a horse out (or put yours back)
  stableIt(b) {
    if (b._horseIt) this.w.removeInteract(b._horseIt);
    const d = BUILDINGS.stable.d / 2 + 1.2, pl = G.player;
    b._horseIt = this.w.addInteract({ x: b.x + Math.sin(b.ry) * d, y: this.w.heightAt(b.x, b.z) + 1.2, z: b.z + Math.cos(b.ry) * d, reach: 2.6,
      label: () => pl.horse ? "Put the horse back in the stable" : "Take a horse out, and ride",
      can: () => this.S.buildings.includes(b) && b.done,
      use: () => {
        if (pl.horse) { pl.dismount(); this.show(b); UI.hint("The horse is back in its stall.", 2.5); return; }
        pl.mount(); this.show(b);
        G.guide && G.guide("horse");
        UI.hint("Up you go. Walk and run as ever — far quicker. X to get down (it finds its own way home).", 5);
      } });
  }
  // ---- the settlers' companies: a shop staked out, built from timber the owner fells, then kept ----
  startShop(c) { c.waiting = false; this.showShop(c); this.persist(); }
  showShop(c) {
    const w = this.w, old = this.shopVis.get(c);
    if (old) { w.root.remove(old.g); for (const o of old.cols) w.col.remove(o); if (old.it) w.removeInteract(old.it); }
    const g = shopVisual(c), fake = { x: c.x, z: c.z, ry: c.ry, type: "shop" };
    if (w.addPad) w.addPad(c, c.x, c.z, c.ry, BUILDINGS.shop.w + 0.8, BUILDINGS.shop.d + 0.8, this.baseY(fake) + 0.05);
    g.position.set(c.x, this.baseY(fake), c.z); g.rotation.y = c.ry; w.root.add(g);
    const cols = c.built ? this.solidAt(fake, [[-1.2, -1.2, 0.5], [0, -1.2, 0.5], [1.2, -1.2, 0.5], [-1.75, 0.1, 0.45], [1.75, 0.1, 0.45], [0, 1.05, 0.4], [-1.1, 1.05, 0.4], [1.1, 1.05, 0.4]].concat(c.kind === "eatery" ? eaterySolids() : []), w.heightAt(c.x, c.z) + 3) : [];
    const fx = c.x + Math.sin(c.ry) * 2.6, fz = c.z + Math.cos(c.ry) * 2.6;
    const it = w.addInteract({ x: fx, y: w.heightAt(fx, fz) + 1.2, z: fz, reach: 2.4,
      label: () => c.built ? `Buy at ${c.name} (${c.stock || 0} in stock)` : `${c.name} — ${c.owner} is building it (${Math.min(10, c.logs || 0)} of 10 logs)`,
      can: () => !!c.built,
      use: () => G.openTrade && G.openTrade(c.name, () => `Your purse ${G.dm(G.body.purse)} DM · ${c.owner}'s shop`, shopOffers(this, c), () => { this.persist(); this.showShop(c); }) });
    this.shopVis.set(c, { g, cols, it });
  }
  // a shift for a company's owner: asking leave, gathering timber, building, or keeping shop; false to do their usual work
  async companyShift(a, c, sleep, alive) {
    const pl = G.player, S = this.S;
    if (c.refused) return false;
    if (c.waiting) {
      // with the law, they come and ask you first — and show you where
      if (c.asking || !pl || Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) > 70) return false;
      a.doing = `looking for you, to ask leave to open ${c.name}`;
      await Promise.race([a.walkTo(pl.pos.x + 1.2, pl.pos.z + 1.2, 1.4), sleep(8)]); alive();
      if (Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) > 4 || UI.dialogOpen || G.mode !== "play") return true;
      c.asking = true; a.faceTo(pl.pos.x, pl.pos.z);
      const prev = G.marker; G.marker = { x: c.x, z: c.z, y: 2 };
      UI.bark(a.settler.name, `I've a mind to open a shop — ${c.name}. There, where the marker is. Will you allow it?`, 6);
      G.openTrade && G.openTrade(`${a.settler.name} asks leave`, `${c.name} · ${KINDS[c.kind].name.toLowerCase()}`, [
        { icon: "cabin", label: "Yes — build it there", note: "They gather the timber themselves, and pay the business tax on what they sell.", get: "", can: () => true, do: () => { c.waiting = false; a.settler.purse = (a.settler.purse || 0) - 10; this.startShop(c); UI.bark(a.settler.name, "Thank you. You'll not regret it.", 3); G.marker = prev; G.closeTrade && G.closeTrade(); } },
        { icon: "cabin", label: "No", note: "They'll take it hard.", get: "", can: () => true, do: () => { c.refused = true; c.waiting = false; this.persist(); UI.bark(a.settler.name, "...As you say.", 3); G.marker = prev; G.closeTrade && G.closeTrade(); } },
      ], null);
      await sleep(10); alive(); c.asking = false; if (G.marker && G.marker.x === c.x) G.marker = prev;
      return true;
    }
    // they give their own business half their time at most: the settlement's work is mainly up to you
    if (Math.random() < 0.5) return false;
    if (!c.built) {
      if ((c.logs || 0) >= 10) {
        a.doing = `raising the shop for ${c.name}`;
        await a.walkTo(c.x + Math.sin(c.ry) * 2.6, c.z + Math.cos(c.ry) * 2.6, 1.2); alive();
        a.faceTo(c.x, c.z); a.person.setPose("hammer"); await sleep(8); alive(); a.person.setPose("idle");
        c.built = true; c.stock = 3; this.showShop(c); this.persist(); this.sfxAt(a, "build");
        UI.hint(`${c.name} is open for trade. You can buy there for less than the pedlar asks.`, 5);
        return true;
      }
      // the timber for it, felled and carried by the owner
      const trees = this.w.fellable.filter(t => t.state === "up" && !t.claimed && Math.hypot(t.x - c.x, t.z - c.z) < 60);
      if (!trees.length) return false;
      trees.sort((p, q) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z) - Math.hypot(q.x - a.pos.x, q.z - a.pos.z));
      const t = trees[0]; t.claimed = "company";
      a.doing = `felling timber for ${c.name}`;
      await a.walkTo(t.x + 1.1, t.z + 0.4, 1.3); alive();
      a.faceTo(t.x, t.z); a.person.setPose("chop");
      const axe = a.hold(makeAxe()); axe.rotation.y = Math.PI / 2;
      await sleep(5 * this.chopMul); alive();
      a.person.setPose("idle"); a.person.held.remove(axe);
      this.fell(t, t.x - a.pos.x, t.z - a.pos.z, false);
      await sleep(2.5); alive();
      a.person.setPose("hold"); await a.walkTo(c.x + 2.4, c.z, 1.1); alive(); a.person.setPose("idle");
      c.logs = (c.logs || 0) + 3; this.showShop(c); this.persist();
      return true;
    }
    if (c.kind === "eatery") return eateryShift(this, a, c, sleep, alive);
    a.doing = `keeping shop at ${c.name}`;
    await a.walkTo(c.x + Math.sin(c.ry) * 0.2, c.z + Math.cos(c.ry) * 0.2 - 0.3 * Math.cos(c.ry), 1.2); alive();
    a.faceTo(c.x + Math.sin(c.ry) * 3, c.z + Math.cos(c.ry) * 3); a.person.setPose("armsCrossed");
    await sleep(12); alive(); a.person.setPose("idle");
    c.stock = Math.min(12, (c.stock || 0) + 2); this.showShop(c); this.persist();
    return true;
  }
  // a shift at your side
  async followShift(a, sleep, alive) {
    const pl = G.player, cave = this.w.cave;
    if (a.knocked && G.time < a.knocked) { a.doing = "knocked down"; a.lying = true; await sleep(1); alive(); return true; }
    if (a.knocked) { a.knocked = 0; a.lying = false; a.hp = 50; }
    a.root.visible = true; a.inside = false;
    // (down into the caves with you, and out again)
    if (cave) {
      const youIn = cave.inside, heIn = cave.holds(a.pos.x, a.pos.z);
      if (youIn !== heIn) { a.place(pl.pos.x + 1.4, pl.pos.z + 1.2); await sleep(0.3); return true; }
    }
    // a bandit awake and near: at him
    const foe = cave && cave.inside ? (cave.band || []).filter(b => !b.down && b.woke).sort((p, q) => Math.hypot(p.a.pos.x - a.pos.x, p.a.pos.z - a.pos.z) - Math.hypot(q.a.pos.x - a.pos.x, q.a.pos.z - a.pos.z))[0] : null;
    if (foe && Math.hypot(foe.a.pos.x - a.pos.x, foe.a.pos.z - a.pos.z) < 18) {
      const arm = this.armFor(a.settler);
      if (a.armKind !== arm) { a.person.held.clear(); if (arm !== "fists") a.hold(makeArm(arm)); a.armKind = arm; }
      a.doing = "fighting at your side";
      const d = Math.hypot(foe.a.pos.x - a.pos.x, foe.a.pos.z - a.pos.z);
      if (d > 1.6) { await Promise.race([a.walkTo(foe.a.pos.x, foe.a.pos.z, 3.2), sleep(0.7)]); alive(); return true; }
      a.faceTo(foe.a.pos.x, foe.a.pos.z); a.person.setPose("chop"); await sleep(0.45); alive(); a.person.setPose("idle");
      if (!foe.down && Math.hypot(foe.a.pos.x - a.pos.x, foe.a.pos.z - a.pos.z) < 2) { foe.hurt(this.armDmg(arm) * armSkill(a.settler, "fighting")); this.learn(a, "fighting", 0.5); AUDIO.clang(0.5, a.pos); }
      await sleep(0.8); return true;
    }
    // otherwise, close behind you
    a.doing = "following you";
    const d = Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z);
    if (d > 3.2) { await Promise.race([a.walkTo(pl.pos.x + 1.2, pl.pos.z + 1.0, d > 10 ? 4.2 : 3.0), sleep(0.6)]); alive(); }
    else { a.faceTo(pl.pos.x, pl.pos.z); await sleep(0.5); alive(); }
    return true;
  }
  canEnlarge(b) { return b.done && b.type === "woodshed" && (b.bays || 1) < 3; }
  enlargeRoom(b) {
    const n = (b.bays || 1) + 1, def = BUILDINGS.woodshed, hw = def.w * n / 2, hd = def.d / 2, c = Math.cos(b.ry), s = Math.sin(b.ry);
    for (const o of this.S.buildings) {
      if (o === b || o.type === "path" || o.type === "field") continue;
      const d2 = BUILDINGS[o.type], r = d2.wall ? 0.6 : Math.min(d2.w, d2.d) / 2;
      const dx = o.x - b.x, dz = o.z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < hw + r && Math.abs(lz) < hd + r) return `the ${d2.name.toLowerCase()} beside it is in the way`;
    }
    for (const [px, pz, pr, what] of [[CABIN.x, CABIN.z, 4, "the cabin"], [FIRE.x, FIRE.z, 1.5, "the fire"], [BLOCK.x, BLOCK.z, 1, "the chopping block"]]) {
      const dx = px - b.x, dz = pz - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < hw + pr && Math.abs(lz) < hd + pr) return `${what} is in the way`;
    }
    return null;
  }
  enlarge(b) {
    const u = SHED_BAYS[(b.bays || 1) + 1]; if (!u) return false;
    const blocked = this.enlargeRoom(b);
    if (blocked) { UI.hint(`No room for another bay: ${blocked}.`, 4); return false; }
    if (!this.afford(u.mats, true)) { UI.hint(`Not yet — ${this.short(u.mats, true)} short.`, 4); return false; }
    this.pay(u.mats, true);
    b.bays = (b.bays || 1) + 1;
    this.show(b); this.showStore(); this.persist(); SFX().build();
    UI.hint(`The woodshed has ${b.bays === 2 ? "a second" : "a third"} bay: the store holds ${this.storeCap} logs now.`, 5);
    this.emit("upgraded", b);
    return true;
  }
  // what a building is called: a cabin rebuilt is a house
  nameOf(b) { return b.type === "cabin" && (b.tier || 1) >= 2 ? "House" : BUILDINGS[b.type].name; }
  // your own cabin rebuilt as a house: plastered inside, room for settlers in the beds past your own
  upgradeHome() {
    if ((this.S.homeTier || 1) >= 2) return false;
    const u = UPGRADES[2];
    if (!this.afford(u.mats, true)) { UI.hint(`Not yet — ${this.short(u.mats, true)} short.`, 4); return false; }
    this.pay(u.mats, true);
    this.S.homeTier = 2; this.persist(); SFX().build();
    this.w.setHomeTier && this.w.setHomeTier(2);
    UI.hint("Your cabin is a house now: timber and plaster inside, boards on the floor, and a kitchen by the hearth (F at the range to cook). Every bed past your own two sleeps a settler — make more beds here (B).", 8);
    return true;
  }
  canUpgrade(b) { const def = BUILDINGS[b.type]; return b.done && (def.tiers || b.type === "cabin" || b.type === "well") && (b.tier || 1) < 4; }
  // (rebuilding is offered only when you inspect a building — V — not by walking up to it)
  upgradeSpot() {}
  upgrade(b) {
    const def = BUILDINGS[b.type], u = UPGRADES[(b.tier || 1) + 1];
    const need = u.needs && u.needs(this);
    if (need) { UI.hint(`First: ${need}.`, 4); return false; }
    if (!this.afford(u.mats, true)) { UI.hint(`Not yet — ${this.short(u.mats, true)} short.`, 4); return false; }
    this.pay(u.mats, true);
    b.tier = (b.tier || 1) + 1;
    this.show(b); this.persist(); SFX().build();
    UI.hint(b.type === "cabin" && b.tier === 2 ? `The cabin is a house now, in timber and plaster: it sleeps ${this.sleeps(b)}.` : `The ${this.nameOf(b).toLowerCase()} stands rebuilt in ${u.style.split(",")[0]}.`, 5);
    this.updateStreets();
    this.emit("upgraded", b);
    return true;
  }
  // ---- the ground between the houses: trodden earth, then cobbles, then paving and street lamps ----
  updateStreets() {
    const lvl = this.tierLevel, w = this.w;
    if (this.streetLvl === lvl) return;
    this.streetLvl = lvl;
    for (const b of this.S.buildings) if (b.type === "path" && this.vis.get(b) && this.vis.get(b).userData.cob !== (lvl >= 3)) this.show(b);
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
  // where the logs are kept: the stack by the cabin, or, once there is one, in front of the woodshed
  get stackAt() {
    const sh = this.S.buildings.find(b => b.done && b.type === "woodshed");
    if (!sh) return { x: STACK.x, z: STACK.z };
    const d = BUILDINGS.woodshed.d / 2 + 1.0;
    return { x: sh.x + Math.sin(sh.ry) * d, z: sh.z + Math.cos(sh.ry) * d };
  }
  // the logs, drawn as they are: the stack by the cabin fills as the store does; a woodshed takes them all in,
  // and the old stack and its platform are gone
  showStore() {
    const w = this.w, sheds = this.S.buildings.filter(b => b.done && b.type === "woodshed");
    const fill = this.storeCap ? clamp(this.S.store / this.storeCap, 0, 1) : 0;
    if (!sheds.length) { w.stack.visible = true; w.setStack(this.S.store > 0 ? Math.max(1, Math.round(fill * 24)) : 0); return; }
    w.stack.visible = false;
    for (const b of sheds) {
      const g = this.vis.get(b); if (!g) continue;
      const bays = b.bays || 1, n = this.S.store > 0 ? Math.max(1, Math.round(fill * 30)) : 0;
      if (g.userData.pileN === n && g.userData.pileBays === bays) continue;
      g.userData.pileN = n; g.userData.pileBays = bays;
      if (g.userData.pile) g.remove(g.userData.pile);
      // two stacks along the shed, five logs deep, as many rows as there are logs for
      const L = [];
      for (let k = 0; k < n; k++) {
        const side = k % 2, idx = Math.floor(k / 2), row = Math.floor(idx / 5), col = idx % 5;
        L.push({ x: side ? 0.8 : -0.8, y: 0.17 + row * 0.29, z: -0.1 + (col - 2) * 0.31 + (row % 2) * 0.05, len: 1.5, r: 0.15, dir: "x" });
      }
      // (each bay filled alike)
      const pile = new THREE.Group();
      if (n) for (let i = 0; i < bays; i++) { const p = makeLogs(L, n); p.position.x = (i - (bays - 1) / 2) * BUILDINGS.woodshed.w; pile.add(p); }
      g.userData.pile = pile; g.add(pile);
    }
  }
  setupStack() {
    const w = this.w, pl = G.player, at = () => this.stackAt;
    // the store chest: the settlement's stores, to take from and put into
    if (this.storeIt) w.removeInteract(this.storeIt);
    const store = () => { let best = null, bd = Infinity; for (const b of this.S.buildings) if (b.done && b.type === "storehouse") { const d = Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z); if (d < bd) { bd = d; best = b; } } return best; };
    this.storeIt = w.addInteract({ get x() { const b = store(); return b ? b.x : 1e6; }, get z() { const b = store(); return b ? b.z : 1e6; }, get y() { const b = store(); return b ? w.heightAt(b.x, b.z) + 0.8 : 0; }, reach: 2.4,
      label: "Open the settlement's store chest", can: () => !!store(), use: () => G.openChest && G.openChest("stores") });
    // the chopping block: make tools; the forge (once there is one): smelt ore, and cast bronze
    // (at the side of whichever forge is nearest you, out of the way of its door)
    const forge = () => { let best = null, bd = Infinity; for (const b of this.S.buildings) if (b.done && b.type === "forge") { const d = Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z); if (d < bd) { bd = d; best = b; } } return best; };
    const side = () => { const b = forge(); if (!b) return { x: 1e6, z: 1e6 }; const def = BUILDINGS.forge, o = def.w / 2 + 0.9; return { x: b.x + Math.cos(b.ry) * o, z: b.z - Math.sin(b.ry) * o }; };
    if (this.craftIt) w.removeInteract(this.craftIt);
    this.craftIt = w.addInteract({ x: BLOCK.x, y: w.cy + 0.8, z: BLOCK.z, reach: 2.0, label: "Make tools", use: () => G.openCraft && G.openCraft() });
    if (this.smeltIt) w.removeInteract(this.smeltIt);
    const METAL = { copperore: "copper", tinore: "tin", ironore: "iron" };
    const ore = () => G.pack.find(i => METAL[i.icon]);
    this.smeltIt = w.addInteract({ get x() { return side().x; }, get z() { return side().z; }, get y() { return w.heightAt(side().x, side().z) + 1; }, reach: 2.8, hold: 3, anim: "hammer",
      label: () => { const o = ore(); return o ? `Smelt the ${METAL[o.icon]} ore at the forge (${o.n})` : "Smelt ore"; },
      can: () => !!ore() && !!forge(),
      onHoldTick: (dt, t) => { if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) SFX().chop(); },
      use: () => {
        const o = ore(); if (!o) return;
        const to = METAL[o.icon], have = G.pack.find(i => i.icon === to);
        if (have) have.n = (have.n || 1) + o.n; else G.pack.push({ icon: to, name: ITEM[to].name, note: ITEM[to].note, n: o.n });
        G.pack.splice(G.pack.indexOf(o), 1);
        UI.hint(`${o.n} ${ITEM[to].name.toLowerCase()}, smelted.`, 3); SFX().build();
      } });
    // bronze, as the first Forester makes it: copper and tin melted together in the smith's crucible, one of each for two
    if (this.alloyIt) w.removeInteract(this.alloyIt);
    const packN = k => (G.pack.find(i => i.icon === k) || {}).n || 0;
    this.alloyIt = w.addInteract({ get x() { return side().x; }, get z() { return side().z; }, get y() { return w.heightAt(side().x, side().z) + 1.1; }, reach: 2.8, hold: 3, anim: "hammer",
      label: () => `Cast bronze at the forge: copper and tin (${Math.min(packN("copper"), packN("tin"))})`,
      can: () => !!forge() && !ore() && packN("copper") > 0 && packN("tin") > 0,
      onHoldTick: (dt, t) => { if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) SFX().chop(); },
      use: () => {
        const n = Math.min(packN("copper"), packN("tin"));
        for (const k of ["copper", "tin"]) { const it = G.pack.find(i => i.icon === k); it.n -= n; if (it.n <= 0) G.pack.splice(G.pack.indexOf(it), 1); }
        const have = G.pack.find(i => i.icon === "bronze");
        if (have) have.n = (have.n || 1) + n * 2; else G.pack.push({ icon: "bronze", name: ITEM.bronze.name, note: ITEM.bronze.note, n: n * 2 });
        UI.hint(`${n * 2} bronze, cast.`, 3); SFX().build();
      } });
    // the fire: meat roasted over it (raw, it brings the plague)
    if (this.cookIt) w.removeInteract(this.cookIt);
    this.cookIt = w.addInteract({ x: FIRE.x, y: w.cy + 0.4, z: FIRE.z, reach: 2.6, hold: 3, anim: "craft",
      label: () => `Roast your meat over the fire (${G.pack.filter(i => isRawMeat(i.icon)).reduce((s, i) => s + (i.n || 1), 0)})${(this.S.homeTier || 1) >= 2 ? " — or cook it properly in the kitchen" : ""}`,
      can: () => G.pack.some(i => isRawMeat(i.icon)),
      onHoldTick: (dt, t) => { if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) SFX().pickup && SFX().pickup(); },
      use: () => {
        const m = G.pack.find(i => isRawMeat(i.icon)); if (!m) return;
        const have = G.pack.find(i => i.icon === "cookedmeat");
        if (have) have.n = (have.n || 1) + (m.n || 1); else G.pack.push({ icon: "cookedmeat", name: "Roast meat", note: "Cooked over the fire. Safe to eat — and better for it.", n: m.n || 1 });
        G.pack.splice(G.pack.indexOf(m), 1);
        UI.hint("Roasted. It smells like a feast day.", 3); SFX().build();
      } });
    // the kitchen in your house (once it is a house): dishes, judged
    // (only once your cabin has been rebuilt as a house: until then there is only the fire)
    G.openKitchen = () => ((this.S.homeTier || 1) >= 2 ? openKitchen(this) : UI.hint("There's no kitchen yet — rebuild your cabin as a house first (B, inside).", 4)); G.cooking = cooking;
    // the hospital: the plague cured, if you go to it
    if (this.cureIt) w.removeInteract(this.cureIt);
    const hosp = () => { let best = null, bd = Infinity; for (const b of this.S.buildings) if (b.done && b.type === "hospital") { const d = Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z); if (d < bd) { bd = d; best = b; } } return best; };
    const hdoor = () => { const b = hosp(); if (!b) return { x: 1e6, z: 1e6 }; const o = BUILDINGS.hospital.d / 2 + 1; return { x: b.x + Math.sin(b.ry) * o, z: b.z + Math.cos(b.ry) * o }; };
    this.cureIt = w.addInteract({ get x() { return hdoor().x; }, get z() { return hdoor().z; }, get y() { return w.heightAt(hdoor().x, hdoor().z) + 1.2; }, reach: 3, hold: 2,
      label: "Be tended for the plague", can: () => !!hosp() && G.body && G.body.plague > 0,
      use: () => { G.body.plague = 0; G.body.dirty = true; UI.hint("They bled you, and fed you broth, and sat by you through the night. The fever's gone.", 5); } });
    // the sawhorse by the block: a door for each new cabin, hewn from logs off the stack
    if (this.sawIt) w.removeInteract(this.sawIt);
    this.sawIt = w.addInteract({ x: BLOCK.x + 1.3, y: w.cy + 0.9, z: BLOCK.z, reach: 2.4, anim: "saw",
      get hold() { return 4 * buildMul(G.body); },
      label: () => `Hew a door (${DOOR_LOGS} logs from the ${this.has("woodshed") ? "woodshed" : "stack"})`,
      can: () => this.doorWanted() && this.S.store >= DOOR_LOGS,
      onHoldTick: (dt, t) => { if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) SFX().hammer(); },
      use: () => { this.S.store -= DOOR_LOGS; this.S.doors = (this.S.doors || 0) + 1; this.showStore(); this.persist(); SFX().build(); UI.hint("A door, hewn. Hang it on the cabin — F at the site.", 4); } });
    this.stackIt = w.addInteract({ get x() { return at().x; }, y: w.cy + 0.8, get z() { return at().z; }, reach: 2.6,
      label: () => { const shed = this.has("woodshed"); return pl.carryN > 0 ? `${shed ? "Put the logs in the woodshed" : "Stack the logs"} (${pl.carryN})` : `Take logs from the ${shed ? "woodshed" : "stack"} (${this.S.store})`; },
      can: () => pl.carryN > 0 ? this.S.store < this.storeCap : this.S.store > 0,
      use: () => {
        if (pl.carryN > 0) { const n = Math.min(pl.carryN, this.storeCap - this.S.store); this.S.store += n; pl.carryN -= n; }
        else { const n = Math.min(CARRY_MAX, this.S.store); this.S.store -= n; pl.carryN += n; }
        UI.carry(pl.carryN ? `Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}` : null);
        this.showStore(); this.persist(); SFX().build();
      } });
  }

  // ---- felling: swing at a standing tree, it falls, it leaves logs ----
  setupForestry() {
    const w = this.w, pl = G.player;
    G.onSwing = () => {
      if (this.raids && this.raids.swing(pl)) return;
      if (revoltSwing(this, pl)) return;
      if (w.cave && w.cave.swing(pl)) return;
      if (!(pl.blade && pl.blade !== "axe")) w.adoptNear && w.adoptNear(pl);
      if (pl.blade && pl.blade !== "axe" && ARMS[pl.blade]) { if (!this._bladeTip) { this._bladeTip = true; UI.hint(`A ${ARMS[pl.blade].name.toLowerCase()} won't fell a tree. Take the axe for that.`, 3); } return; }
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
      best.hp = (best.hp ?? 4) - 1 - (Math.random() < 1 / this.chopMul - 1 + axeBonus(G.body) + skillK(G.body, "strength") * 0.6 ? 1 : 0);
      G.practise && G.practise("strength", 0.6);
      if (best.hp > 0) { best.state = "shake"; best.shake = 0.25; return; }
      this.fell(best, best.x - pl.pos.x, best.z - pl.pos.z, true);
    };
  }
  fell(t, dx, dz, dropLogs) {
    const l = Math.hypot(dx, dz) || 1;
    t.state = "falling"; t.fall = 0; t.col.disabled = true;
    t.dir = { x: dx / l, z: dz / l };
    t.axis = new THREE.Vector3(dz / l, 0, -dx / l);
    // (heard across the clearing, but not from the far side of the forest)
    const heard = () => !G.player || Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z) < 45;
    if (heard()) SFX().timberCrack();
    t.onDown = () => {
      if (heard()) SFX().treeFall();
      const i = this.w.fellable.indexOf(t);
      if (!t.wild && !this.S.felled.some(f => f.i === i)) this.S.felled.push({ i, day: this.day, x: Math.round(t.x * 10) / 10, z: Math.round(t.z * 10) / 10 });
      if (dropLogs) this.dropLogs(t.x + t.dir.x * 1.6, t.z + t.dir.z * 1.6, Math.atan2(t.dir.x, t.dir.z), this.logsPerTree);
      this.persist();
      setTimeout(() => this.fellNow(t), 1500);
    };
  }
  fellNow(t, instant) {
    t.g.visible = false; t.state = "gone"; t.col.disabled = true;
    const rec = () => this.S.felled.find(f => f.i === this.w.fellable.indexOf(t));
    if (t.dug || (rec() || {}).dug) { t.dug = true; return; }
    if (!this.stumps.has(t)) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.45, 8), mat(0x5a4030, { surface: "bark" }));
      m.position.set(t.x, t.y + 0.1, t.z); m.castShadow = true;
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.26, 8), mat(0xc8a878, { surface: "wood" }));
      top.rotation.x = -Math.PI / 2; top.position.y = 0.226; m.add(top);
      this.w.root.add(m); this.stumps.set(t, m);
      // a stump can be dug out, roots and all: then nothing grows there again
      m.userData.it = this.w.addInteract({ x: t.x, y: t.y + 0.4, z: t.z, reach: 1.9, hold: 3.5, anim: "dig",
        label: "Dig up the stump — nothing grows back", can: () => this.stumps.get(t) === m,
        onHoldTick: (dt, k) => { if (Math.floor(k * 1.6) !== Math.floor((k - dt) * 1.6)) SFX().dig ? SFX().dig() : SFX().chop(); },
        use: () => {
          this.w.root.remove(m); this.stumps.delete(t); this.w.removeInteract(m.userData.it);
          t.dug = true; const f = rec(); if (f) f.dug = true;
          G.practise && G.practise("strength", 0.4);
          this.persist(); SFX().pickup();
        } });
    }
  }
  // a stump grows back into a young tree, then a tree
  // is there anything of ours where a tree would come up? (buildings, paths, fields, walls, shops, the roads out)
  builtNear(x, z) {
    for (const b of this.S.buildings) {
      const d = BUILDINGS[b.type], r = d.path ? 2.6 : d.wall ? 1.6 : Math.hypot(d.w, d.d) / 2 + 2;
      if (Math.hypot(b.x - x, b.z - z) < r) return true;
    }
    for (const c of this.S.companies || []) if (Math.hypot(c.x - x, c.z - z) < 5) return true;
    for (const c of this.S.colonies || []) { if (Math.hypot(c.x - x, c.z - z) < c.r + 2) return true; if (c.road.some((p, i) => i < c.road.length - 1 && segDist(x, z, p, c.road[i + 1]) < 3.5)) return true; }
    if (Math.hypot(STACK.x - x, STACK.z - z) < 3 || Math.hypot(FIRE.x - x, FIRE.z - z) < 4 || Math.hypot(CABIN.x - x, CABIN.z - z) < 6) return true;
    return false;
  }
  // a stump on the settlement's own ground that nobody is at yet (out in the forest they're left to grow again)
  stumpToDig() {
    for (const t of this.stumps.keys()) if (!t.claimed && this.onGround(t.x, t.z, 0)) return t;
    return null;
  }
  // stumps under something newly laid out are grubbed up with it, and nothing grows there again
  clearStumps(b) {
    const d = BUILDINGS[b.type], r = d.path ? 2.4 : Math.hypot(d.w, d.d) / 2 + 0.5;
    for (const [t, m] of [...this.stumps]) {
      if (Math.hypot(t.x - b.x, t.z - b.z) > r) continue;
      this.w.root.remove(m); this.stumps.delete(t); if (m.userData.it) this.w.removeInteract(m.userData.it);
      t.dug = true; const f = this.S.felled.find(q => q.i === this.w.fellable.indexOf(t)); if (f) f.dug = true;
    }
  }
  regrow(t) {
    if (t.dug) return;
    // (nothing comes up through a path, or against a wall)
    if (this.builtNear(t.x, t.z)) return;
    const m = this.stumps.get(t); if (m) { this.w.root.remove(m); this.stumps.delete(t); if (m.userData.it) this.w.removeInteract(m.userData.it); }
    t.g.visible = true; t.state = "up"; t.col.disabled = false; t.hp = 4; t.claimed = null;
    t.g.rotation.set(0, 0, 0);
    const i = this.w.fellable.indexOf(t);
    this.S.felled = this.S.felled.filter(f => f.i !== i);
  }
  dropLogs(x, z, a, n, restoring) {
    const w = this.w, pl = G.player;
    // (they lie where the tree fell, however far out: carry them home, or leave them for a hauler)
    const y = w.heightAt(x, z), dx = Math.sin(a), dz = Math.cos(a);
    const g = new THREE.Group();
    // three logs, two side by side and one on top, across the line the tree fell along
    const pile = makeLogs([0, 1, 2].map(i => ({ x: (i - 1) * 0.3, y: 0.15 + (i === 1 ? 0.24 : 0), z: 0, len: 1.8, r: 0.15, dir: "z" })), Math.floor(x * 13 + z));
    pile.rotation.y = a; g.add(pile);
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
    ensurePerson(p);
    // a family name: someone new may be kin to a family already here
    if (!p.family && this.S.people.length && !this.S.people.includes(p)) { const k = kinFor(this.S, p); if (k) setTimeout(() => UI.hint(`${p.name} is kin to ${k.name} — another of the ${p.family}s.`, 5), 4000); }
    if (!this.S.people.includes(p)) this.S.people.push(p);
    if (!p.family) ensureFamilies(this.S);
    const a = new Actor(settlerLook(p), x ?? CLEARING.x + 2, z ?? CLEARING.z + 6, 0);
    a.settler = p; this.actors.push(a);
    if (!p.child) {
      // (while a story is gathering people, it decides what talking does; otherwise it changes their work)
      a.talkIt = this.w.addInteract({ get x() { return a.pos.x; }, get z() { return a.pos.z; }, get y() { return a.pos.y + 1.4; }, reach: 2.4, actor: a,
        can: () => !a.gone && !a.inside && (this.onTalk ? !!(this.talkLabel && this.talkLabel(p, a)) : !a.summoned),
        label: () => (this.talkLabel && this.talkLabel(p, a)) || `Talk to ${fullName(p)} (${JOBS[p.job || "hauler"].name}) — set their work`,
        use: () => {
          if (this.onTalk && this.onTalk(p, a)) return;
          this.chooseJob(p);
        } });
    }
    this.work(a).catch(e => { if (e !== "stop") console.error(e); });
    this.persist();
    return a;
  }
  spawnPeople() { ensureFamilies(this.S); this.S.people.forEach((p, i) => this.addPerson(p, CLEARING.x - 6 + (i % 4) * 3, CLEARING.z + 8 + Math.floor(i / 4) * 2)); }
  stop() { this.stopped = true; for (const a of this.actors) { if (a.talkIt) this.w.removeInteract(a.talkIt); a.remove(); } this.actors = []; if (this.planning) this.planning.cancel(); G.onSwing = null; }
  // (baking only once there is a bakery)
  jobsOpen() { return JOB_ORDER.filter(j => (!JOB_AT[j] || this.has(JOB_AT[j])) && !this.jobGated(j)); }
  nextJob(p) { const jobs = this.jobsOpen(); return jobs[(jobs.indexOf(p.job) + 1) % jobs.length]; }
  // choosing someone's work from a list, rather than going round them all
  chooseJob(p) {
    if (!G.openTrade) { p.job = this.nextJob(p); this.persist(); return; }
    const count = j => this.S.people.filter(q => q.job === j).length;
    // a watchman can be asked to come with you — into the woods, into the caves — and fight at your side
    const follow = p.job === "watch" ? [{ icon: "weapon", label: p.follow ? "Go back to your watch" : "Follow me", note: p.follow ? "Back to guarding the settlement." : "Stay at my side and fight with me — anywhere, even down in the caves.", get: "", can: () => true, done: () => false,
      do: () => { p.follow = !p.follow; this.persist(); UI.bark(p.name, p.follow ? "Lead on. I'm right behind you." : "Back to the road, then.", 3); G.closeTrade && G.closeTrade(); } }] : [];
    const peace = peaceOffer(this, p);
    G.openTrade(`${fullName(p)}'s work`, `now a ${JOBS[p.job || "hauler"].name}`, (peace ? [peace] : []).concat(follow).concat(this.jobsOpen().map(j => ({
      icon: "axe", label: JOBS[j].name[0].toUpperCase() + JOBS[j].name.slice(1), note: `${JOBS[j].ask[0].toUpperCase() + JOBS[j].ask.slice(1)}${WORKS[j] ? ` — ${this.costText(WORKS[j].need) || "nothing"} in, ${this.costText(WORKS[j].give)} out` : ""}`,
      get: `${count(j)} at it`, can: () => p.job !== j, done: () => p.job === j, doneText: " — now",
      do: () => { p.job = j; if (j !== "watch") p.follow = false; this.persist(); UI.bark(p.name, JOBS[j].reply, 3); this.emit("job", p); G.closeTrade && G.closeTrade(); } }))), null);
  }
  // called away from their work, to stand somewhere (the fire, for a gathering)
  summon(a, x, z) {
    a.summoned = true; a.person.held.clear(); a.person.setPose("idle");
    return a.walkTo(x, z, 1.3).then(() => { if (a.root.parent) a.faceTo(FIRE.x, FIRE.z); });
  }
  // ---- people: how quick they are at a thing, what they learn by it, where they sleep ----
  // (skill and temperament both: a master industrious hand is quick; an idle novice slow)
  pace(a, id) { const p = a.settler || {}, fm = (p.name && FAITHS[faithOf(p)].workMul) || 1; return (id ? workSkill(p, id) * temperWork(p) : temperWork(p)) * fm; }
  learn(a, id, amount = 1) {
    const p = a.settler; if (!p || !p.name || !id) return;
    // a master working nearby teaches faster
    const near = skillLvl(p, id) < MASTER_AT && this.actors.some(o => o !== a && o.settler && skillLvl(o.settler, id) >= MASTER_AT && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 14);
    const lvl = gainSkill(p, id, amount, near);
    if (lvl) UI.hint(`${p.name} reaches ${SKILL_NAME[id]} ${lvl}${lvl >= 100 ? " — a master of it" : ""}.`, 4);
  }
  // training out of the treasury: a level in the skill of their work, the dearer the better they are already
  train(p) {
    const id = JOB_SKILL[p.job || "hauler"], lvl = skillLvl(p, id), cost = trainCost(lvl);
    if (lvl >= 100) return `${p.name} is already a master.`;
    if ((this.S.coin || 0) < cost) return `Training ${p.name} costs ${cost} DM.`;
    this.S.coin -= cost; p.sk ??= {}; p.sk[id] = lvl + 1; p.sx && (p.sx[id] = 0);
    this.persist(); SFX().coin && SFX().coin();
    return null;
  }
  bedOf(p) { return !!this.bedFor(this.S.people.indexOf(p)); }
  mood(p) { return moodOf(this, p); }
  setMark(p, id, why) {
    if (!p || !p.name || p.child || p.mark === id) return;
    p.mark = id; this.persist();
    UI.hint(`${p.name} — ${MARKS[id].name.toLowerCase()}: ${why}`, 5);
  }
  // dead: cut down in a raid or in the streets, starved, frozen, or taken by a fever. They are buried at the edge
  // of the clearing, and everyone mourns a few days
  killSettler(a, why = "raid") {
    if (!a) return;
    if (a && !a.settler && !a.root) a = this.actors.find(x => x.settler === a) || { settler: a };
    const p = a.settler; if (!p || a.dead) return;
    a.dead = true;
    const i = this.S.people.indexOf(p); if (i >= 0) this.S.people.splice(i, 1);
    if (a.root) {
      if (a.talkIt) this.w.removeInteract(a.talkIt);
      a.lying = true; a.path = []; a.person.held.clear(); a.onUpdate = null; a.knocked = Infinity; a.yOff = 0.05;
      const violent = why === "raid" || why === "revolt" || why === "cave";
      if (violent) AUDIO.voice("fear", { at: a.pos, high: p.sex === "f" || !!p.child });
      // (a body cut down lies where it fell for a while; one that died abed is carried out quietly)
      setTimeout(() => { a.remove(); const j = this.actors.indexOf(a); if (j >= 0) this.actors.splice(j, 1); }, violent ? 30000 : 1500);
    }
    (this.S.graves ??= []).push({ name: p.name, day: this.day });
    this.S.mournUntil = this.day + 3;
    this.showGraves(); this.persist(); this.emit("died", p, why);
    const how = {
      raid: "Cut down in the raid.", revolt: "Killed in the fighting in the streets.", cave: "Killed down in the caves, in the dark.",
      hunger: "Starved: there was nothing left in the stores.", feud: "Beaten to death in the feud between the families.", cold: "Froze in the night, with no wood for the hearth.", sick: "The fever took them.",
    }[why] || "";
    UI.news({ title: `${p.name} is dead`, sub: `${how} Buried at the edge of the clearing, by the ones who were left.`, img: "event_war" });
  }
  // the graves: a row of wooden crosses at the north-west edge of the clearing, each with its name
  showGraves() {
    const w = this.w, list = this.S.graves || [];
    if (this.graveG) w.root.remove(this.graveG);
    if (!list.length) return;
    const g = this.graveG = new THREE.Group();
    const wood = mat(0x6a4a30, { surface: "wood" }), earth = mat(0x4a3a2a, { surface: "none" });
    list.forEach((gr, i) => {
      const x = CLEARING.x - 15 + (i % 6) * 1.6, z = CLEARING.z - 12 - Math.floor(i / 6) * 2.4, y = w.heightAt(x, z);
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), earth); mound.scale.set(0.9, 0.35, 1.8); mound.position.set(x, y, z + 0.6); g.add(mound);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), wood); post.position.set(x, y + 0.5, z); g.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.07, 0.07), wood); arm.position.set(x, y + 0.75, z); g.add(arm);
    });
    w.root.add(g);
  }
  // the newest to come goes back down the road (hunger does this) — or, named, someone who can't bear it here
  // the first to go when there isn't enough: the sick, the sickly and the children, then anyone
  weakest() {
    const P = this.S.people; if (!P.length) return null;
    const w = q => (q.sick > 0 ? 3 : 0) + (q.temper === "sickly" ? 2 : 0) + (q.child ? 1 : 0) - (q.temper === "hardy" ? 2 : 0) + Math.random();
    return P.reduce((b, q) => (w(q) > w(b) ? q : b));
  }
  leave(why = "hunger", who = null) {
    const p = who || [...this.S.people].reverse().find(q => !q.child); if (!p) return;
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
    const build = (type, text) => { const g = this.gated(type); return g ? this.researchAdvice(g.id, `a ${BUILDINGS[type].name.toLowerCase()}`) : text; };
    const site = S.buildings.find(b => !b.done && b.type !== "field");
    const field = S.buildings.find(b => b.type === "field" && !b.sown);
    const food = S.rye + S.bread * LOAF_FEEDS;
    if (this.raids && this.raids.active) return `Raiders! ${this.raids.band.filter(r => r.alive).length} in the settlement — drive them off with the axe or the bow before they carry off the stores`;
    const clear = this.toClear().length;
    if (clear) return `Clear the new ground: ${clear} tree${clear > 1 ? "s" : ""} left past the old edge — everyone is felling`;
    if (S.lobes && this.roomDue() > 0) return `Room to grow — ${this.pop} of you now: open the map (J) and mark out new ground beyond the edge`;
    if (this.winter && S.store < this.hearths * 2) return `Winter: every hearth burns a log a day — fell trees, the stack is at ${S.store}`;
    if (this.season === "autumn" && S.store < this.hearths * 4) return `Winter is coming — stack firewood: ${this.hearths * 4} logs will see you through`;
    if (food < need * 3) return this.harvestable().length ? "Food is low — reap the ripe field" : this.winter ? "Food is low, and nothing grows in winter — buy rye from Henning's cart" : "Food is low — dig and sow another field (B)";
    if (!this.has("bakery") && S.people.length >= 4) return build("bakery", "Build a bakery (B): a loaf goes twice as far as the grain");
    if (this.has("bakery") && !S.people.some(p => p.job === "baker")) return "The bakery stands idle — talk to someone (F) and set them to baking";
    if (site) return `Bring logs to the ${BUILDINGS[site.type].name.toLowerCase()} (${site.logs} of ${BUILDINGS[site.type].cost})`;
    if (field && !this.winter) return "Finish digging the new field";
    // nobody yet but the two of you: there is no one to ask, so the first thing is somewhere for people to live
    const hands = S.people.filter(p => !p.child).length;
    if (!hands) return this.beds + 2 > pop ? "It's only the two of you — keep the rye up, and settlers will come up the road to the free beds" : "It's only the two of you — raise a cabin (B), and settlers will come up the road";
    if (!this.winter && !S.people.some(p => p.job === "farmer")) return "No one is farming — talk to someone (F) and set them to the fields";
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
    if ((S.coin || 0) < 15 && !this.has("market")) return "Short of DM? Sell logs, bread and rye to the traders on the road — Henning comes every third day, Tobias the pedlar every fourth";
    return "A bed is free: keep the rye up, and someone will come up the road";
  }

  // each settler's day: their job, over and over
  // a settler's sound: only heard near them (the engine's sounds have no distance of their own)
  sfxAt(a, name) { const p = G.player && G.player.pos; if (!p || Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 22) SFX()[name](); }
  async work(a) {
    const sleep = s => new Promise(r => setTimeout(r, s * 1000));
    const alive = () => { if (a.dead) throw "stop"; if (this.stopped || a.gone || a.summoned || !G.world || G.world !== this.w) { a.root.visible = true; a.lying = false; throw "stop"; } };
    await sleep(Math.random() * 3);
    while (true) {
      alive();
      if (this.isNight() && !(this.raids && this.raids.active) && !(this.S.revolt && this.S.revolt.active) && !a.settler.follow) { a.doing = "asleep"; await this.nightFall(a, sleep, alive); continue; }
      const job = a.settler.job || "hauler";
      // raiders in the settlement: every grown settler fights — with what the smith has made, an axe, or their fists;
      // the children hide by the fire
      const raid = this.raids && this.raids.active;
      // the settlement risen against you: everyone takes a side
      if (this.S.revolt && this.S.revolt.active && await revoltShift(this, a, sleep, alive)) continue;
      // a watchman at your side: with you wherever you go, and at your enemies
      if (a.settler.follow && !raid && await this.followShift(a, sleep, alive)) continue;
      if (a.knocked) {
        if (raid && G.time < a.knocked) { a.doing = "knocked down"; await sleep(1); alive(); continue; }
        a.knocked = 0; a.lying = false; a.yOff = 0; a.hp = 50;
      }
      if (!raid && a.fighting) {
        a.fighting = false; if (a.armKind) { a.person.held.clear(); a.armKind = null; } a.hp = 50;
        // stood in the fight and came through: hardened; beaten down and left lying: bitter
        if (a.wasKnocked) { if (a.settler.mark !== "hardened") this.setMark(a.settler, "bitter", "beaten down in the raid, and hasn't forgotten it"); }
        else this.setMark(a.settler, "hardened", "stood up to the raiders, and is less afraid of the next");
        a.wasKnocked = false;
      }
      // sick: in bed — the hospital's, if there is one — until it passes
      if (a.settler.sick > 0) {
        const hos = this.S.buildings.find(b => b.done && b.type === "hospital");
        a.doing = hos ? "sick, in the hospital" : "sick in bed";
        if (hos) { await a.walkTo(hos.x + Math.sin(hos.ry) * 3.6, hos.z + Math.cos(hos.ry) * 3.6, 0.9); alive(); a.root.visible = false; a.inside = true; }
        else { const h = this.homeOf(a); await a.walkTo(h.door[0], h.door[1], 0.9); alive(); if (h.inside) { a.root.visible = false; a.inside = true; } }
        await sleep(8); alive();
        if (!(a.settler.sick > 0)) { a.root.visible = true; a.inside = false; }
        continue;
      }
      if (a.inside && !this.isNight()) { a.root.visible = true; a.inside = false; }
      // held in the jail until the next day
      if (a.settler.jailedDay != null) {
        if (a.settler.jailedDay === this.day && this.has("jail")) {
          const j = this.S.buildings.find(b => b.done && b.type === "jail");
          a.doing = "held in the jail";
          await a.walkTo(j.x + Math.sin(j.ry) * 4.2, j.z + Math.cos(j.ry) * 4.2, 1.0); alive();
          a.person.setPose("armsCrossed"); await sleep(8); alive(); a.person.setPose("idle");
          continue;
        }
        a.settler.jailedDay = null;
      }
      // (once there is Policing, the watch does the fighting and everyone else takes cover)
      if (raid && !a.settler.child && !(a.settler.name && FAITHS[faithOf(a.settler)].pacifist) && (!this.knows("policing") || job === "watch")) {
        const r = this.raids.nearest(a.pos);
        if (r) {
          const arm = this.armFor(a.settler);
          if (a.armKind !== arm) { a.person.held.clear(); if (arm !== "fists") a.hold(makeArm(arm)); a.armKind = arm; }
          a.fighting = true;
          a.doing = arm === "fists" ? "fighting the raiders with bare fists" : `fighting the raiders with ${arm === "axe" ? "an" : "a"} ${ARMS[arm].name.toLowerCase()}`;
          const d = Math.hypot(r.pos.x - a.pos.x, r.pos.z - a.pos.z);
          if (d > 1.5) { await Promise.race([a.walkTo(r.pos.x, r.pos.z, 3.0), sleep(0.8)]); alive(); continue; }
          // thrown off by a parry: a moment to find their feet
          if (a.stagger && G.time < a.stagger) { await sleep(a.stagger - G.time); alive(); continue; }
          a.faceTo(r.pos.x, r.pos.z); a.person.setPose("chop"); await sleep(0.45); alive(); a.person.setPose("idle");
          if (!a.knocked && r.alive && Math.hypot(r.pos.x - a.pos.x, r.pos.z - a.pos.z) < 1.9) { r.damage(this.armDmg(arm) * armSkill(a.settler, "fighting") * temperArm(a.settler), a); this.learn(a, "fighting", 0.5); arm === "fists" ? AUDIO.whoosh(0.3, false) : Math.random() < 0.35 ? AUDIO.clang(0.7, a.pos) : this.sfxAt(a, "chop"); if (Math.random() < 0.3) AUDIO.voice(Math.random() < 0.5 ? "war" : "grunt", { at: a.pos, high: a.settler.sex === "f" }); }
          await sleep(arm === "fists" ? 0.55 : 0.9); continue;
        }
      }
      if (raid) {
        a.doing = "taking cover from the raiders";
        await a.walkTo(FIRE.x + Math.cos(a.settler.seed || 0) * 3, FIRE.z + Math.sin(a.settler.seed || 0) * 3, 2.6); alive();
        a.person.setPose("armsCrossed"); await sleep(2); alive(); a.person.setPose("idle");
        continue;
      }
      // a feud: one of the other family about, and they go for them
      if (!raid && this.techGates && await feudShift(this, a, sleep, alive)) continue;
      // midday, with money in their purse: a meal at an eatery
      if (!raid && await dineShift(this, a, sleep, alive)) continue;
      // their own business, if they have one: part of their time goes to it
      const own = !raid && !a.settler.child && this.S.companies && this.S.companies.find(c => c.owner === a.settler.name);
      if (own && await this.companyShift(a, own, sleep, alive)) continue;
      // ground to clear: everyone who can swing an axe goes felling until it is done
      // (everyone clears ground for the settlement when it wants room — except the farmers, who have their fields)
      let loose = null, stump = null;
      const clearing = !a.settler.child && job !== "farmer" && this.toClear().some(t => !t.claimed);
      const site = this.S.buildings.find(b => !b.done && b.type !== "field" && b.logs < BUILDINGS[b.type].cost);
      const matSite = !site && this.S.buildings.find(b => !b.done && b.type !== "field" && Object.entries(this.wants(b)).some(([k]) => this.have(k) > 0));
      const works = job === "smith" ? this.smithWork() : job === "smelter" ? this.smelterWork() : job === "miner" ? this.minerWork() : WORKS[job], workAt = works && this.S.buildings.find(b => b.done && b.type === works.at);
      if (clearing) {
        // (falls through to the felling below)
      }
      if (!clearing && job === "hauler" && matSite) {
        a.doing = `carrying stores to the ${BUILDINGS[matSite.type].name.toLowerCase()}`;
        // stone and planks and bricks from the stores, carried to the site
        await a.walkTo(this.stackAt.x + 1.0, this.stackAt.z + 0.6, 1.3); alive();
        a.person.setPose("hold");
        await a.walkTo(matSite.x + 1.6, matSite.z + BUILDINGS[matSite.type].d / 2 + 1.4, 1.1); alive();
        matSite.got = matSite.got || {};
        let left = 4;
        for (const [k, n] of Object.entries(this.wants(matSite))) { const m = Math.min(n, this.have(k), left); this.S[k] -= m; matSite.got[k] = (matSite.got[k] || 0) + m; left -= m; }
        a.person.setPose("idle"); this.show(matSite); this.persist(); this.sfxAt(a, "pickup"); this.learn(a, "building", 0.6);
        await sleep(2);
      } else if (!clearing && works && workAt && this.untended) {
        a.doing = `waiting at the ${BUILDINGS[workAt.type].name.toLowerCase()} — the keep isn't paid`;
        a.person.setPose("armsCrossed"); await sleep(6); alive(); a.person.setPose("idle");
      } else if (!clearing && works && workAt) {
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
        const skill = JOB_SKILL[job];
        const time = works.time * this.toolFactor * (deep ? 0.7 : 1) * this.pace(a, skill);
        if (works.pose === "chop") { const axe = a.hold(makeAxe()); axe.rotation.y = Math.PI / 2; await sleep(time); a.person.held.remove(axe); }
        else await sleep(time);
        alive();
        if (this.afford(works.need)) {
          this.pay(works.need);
          for (const [k, n] of Object.entries(works.give)) this.S[k] = (this.S[k] || 0) + n * (works.at === "smelter" && this.knows("blastfurnace") ? 2 : 1) + (deep ? 1 : 0);
          this.persist(); this.sfxAt(a, "build"); this.learn(a, skill, 1);
        }
        a.person.setPose("idle");
        await sleep(1.5);
      } else if (!clearing && job === "hauler" && (loose = this.bundles.find(b => !b.claimed && Math.hypot(b.x - CLEARING.x, b.z - CLEARING.z) < this.clearR + 45))) {
        // logs lying about — by the woodshed, or where a tree was felled: carried in and stacked
        loose.claimed = a; a.doing = "carrying logs in to the woodshed";
        await a.walkTo(loose.x + 0.8, loose.z + 0.8, 1.3); alive();
        if (!this.bundles.includes(loose)) { continue; }
        const n = Math.min(loose.n, CARRY_MAX, Math.max(0, this.storeCap - this.S.store));
        if (n <= 0) { loose.claimed = null; a.doing = "waiting — the woodshed is full"; await sleep(8); continue; }
        loose.n -= n; if (loose.n <= 0) this.pickUp(loose); else loose.claimed = null; this.saveLogs();
        a.person.setPose("hold");
        await a.walkTo(this.stackAt.x + 1.0, this.stackAt.z + 0.6, 1.1); alive();
        a.person.setPose("idle");
        this.S.store = Math.min(this.storeCap, this.S.store + n); this.showStore(); this.persist(); this.sfxAt(a, "build");
        await sleep(2);
      } else if (!clearing && job === "hauler" && site && this.S.store > 0) {
        a.doing = `carrying logs to the ${BUILDINGS[site.type].name.toLowerCase()}`;
        await a.walkTo(this.stackAt.x + 1.0, this.stackAt.z + 0.6, 1.3); alive();
        const n = Math.min(4, this.S.store, BUILDINGS[site.type].cost - site.logs); if (n <= 0) continue;
        this.S.store -= n; this.showStore(); a.person.setPose("hold");
        await a.walkTo(site.x + 1.6, site.z + BUILDINGS[site.type].d / 2 + 1.4, 1.1); alive();
        site.logs = Math.min(BUILDINGS[site.type].cost, site.logs + n); a.person.setPose("idle"); this.show(site); this.persist(); this.sfxAt(a, "pickup"); this.learn(a, "building", 0.6);
        await sleep(2);
      } else if (!clearing && job === "hauler" && !site && (stump = this.stumpToDig())) {
        // nothing to carry: the stumps left in the settlement, grubbed out one by one
        stump.claimed = a; a.doing = "digging out an old stump";
        await a.walkTo(stump.x + 0.9, stump.z + 0.5, 1.2); alive();
        if (!this.stumps.has(stump)) { stump.claimed = null; continue; }
        a.faceTo(stump.x, stump.z); a.person.setPose("reach");
        const sp = a.hold(makeSpade());
        for (let i = 0; i < 5; i++) { await sleep(1.1 * this.pace(a, "building")); alive(); this.sfxAt(a, "chop"); }
        a.person.held.remove(sp); a.person.setPose("idle");
        const m = this.stumps.get(stump);
        if (m) { this.w.root.remove(m); this.stumps.delete(stump); if (m.userData.it) this.w.removeInteract(m.userData.it); }
        stump.dug = true; stump.claimed = null; const f = this.S.felled.find(q => q.i === this.w.fellable.indexOf(stump)); if (f) f.dug = true;
        this.persist(); this.learn(a, "building", 0.4);
        await sleep(1.5);
      } else if (clearing || job === "woodcutter" || (job === "hauler" && site)) {
        a.doing = clearing ? "clearing ground for the settlement" : "felling trees";
        const trees = clearing ? this.toClear().filter(t => t.state === "up" && !t.claimed) : this.w.fellable.filter(t => t.state === "up" && !t.claimed);
        if (!trees.length) { await sleep(5); continue; }
        trees.sort((p, q) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z) - Math.hypot(q.x - a.pos.x, q.z - a.pos.z));
        const t = trees[Math.floor(Math.random() * Math.min(5, trees.length))];
        t.claimed = "settler";
        const dx = CLEARING.x - t.x, dz = CLEARING.z - t.z, l = Math.hypot(dx, dz);
        await a.walkTo(t.x + dx / l * 1.1, t.z + dz / l * 1.1, 1.3); alive();
        a.faceTo(t.x, t.z); a.person.setPose("chop");
        const axe = a.hold(makeAxe()); axe.rotation.y = Math.PI / 2;   // (the blade sideways, into the trunk)
        for (let i = 0; i < (this.S.upgrades.axes ? 4 : 6); i++) { await sleep(0.8 * this.chopMul * this.pace(a, "woodcutting")); alive(); if (Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z) < 24) this.sfxAt(a, "chop"); }
        a.person.setPose("idle"); a.person.held.remove(axe);
        this.fell(t, -dx, -dz, false); this.learn(a, "woodcutting", 1);
        await sleep(2.6); alive();
        a.person.setPose("hold");
        await a.walkTo(this.stackAt.x + 1.1, this.stackAt.z + 0.4, 1.2); alive();
        a.person.setPose("idle");
        this.S.store = Math.min(this.storeCap, this.S.store + this.logsPerTree); this.showStore(); this.persist(); this.sfxAt(a, "build");
        await sleep(3 + Math.random() * 3);
      } else if (job === "hunter") {
        // out to the deer ride, a long wait in cover, and home with what they took: meat for the stores and a hide
        a.doing = "hunting in the deer ride";
        const ang = Math.random() * Math.PI * 2;
        await a.walkTo(HUNT.x + Math.cos(ang) * HUNT.r * 0.5, HUNT.z + Math.sin(ang) * HUNT.r * 0.5, 1.3); alive();
        a.person.setPose("armsCrossed"); await sleep(14 * this.pace(a, "hunting")); alive(); a.person.setPose("idle");
        const got = Math.random() < 0.55 + skillLvl(a.settler, "hunting") / 200;
        if (got) {
          a.person.setPose("hold"); await a.walkTo(this.stackAt.x + 1.4, this.stackAt.z - 0.6, 1.2); alive(); a.person.setPose("idle");
          this.S.meat = (this.S.meat || 0) + 2; this.S.hide = (this.S.hide || 0) + 1; this.persist(); this.sfxAt(a, "pickup"); this.learn(a, "hunting", 1);
        } else a.doing = "coming back from the hunt with nothing";
        await sleep(2);
      } else if (job === "doctor" && this.has("hospital")) {
        const hos = this.S.buildings.find(b => b.done && b.type === "hospital");
        const sick = this.S.people.filter(q => q.sick > 0);
        a.doing = sick.length ? `tending ${sick.map(q => q.name).join(", ")}` : "at the hospital, with nobody ill";
        await a.walkTo(hos.x + Math.sin(hos.ry) * 3.4 + 1, hos.z + Math.cos(hos.ry) * 3.4, 1.2); alive();
        a.faceTo(hos.x, hos.z); a.person.setPose(sick.length ? "hammer" : "armsCrossed");
        await sleep(8 * this.pace(a, "physicking")); alive(); a.person.setPose("idle");
        if (sick.length) { this.S.tended = this.day; this.learn(a, "physicking", 1); }
        await sleep(2);
      } else if (job === "baker" && this.has("bakery") && this.S.rye >= LOAF_RYE * 2) {
        a.doing = "baking";
        const bk = this.S.buildings.find(b => b.done && b.type === "bakery");
        // at the oven, on the bakery's right-hand side
        const ox = bk.x + Math.cos(bk.ry) * 3.2 - Math.sin(bk.ry) * 1.6, oz = bk.z - Math.sin(bk.ry) * 3.2 - Math.cos(bk.ry) * 1.6;
        await a.walkTo(ox, oz, 1.2); alive();
        a.faceTo(bk.x + Math.cos(bk.ry) * 3.6, bk.z - Math.sin(bk.ry) * 3.6); a.person.setPose("hammer");
        await sleep(9 * this.pace(a, "crafting")); alive();
        if (this.S.rye >= LOAF_RYE * 2) { this.S.rye -= LOAF_RYE * 2; this.S.bread += 2; this.persist(); this.sfxAt(a, "pickup"); this.learn(a, "crafting", 1); }
        a.person.setPose("idle");
        await sleep(2);
      } else if (job === "farmer") {
        // the fields as they need it: a ripe one reaped first, then bare ground sown, then the growing rye weeded —
        // a strip at a time, walked down its length, stooping at each stop
        const fields = this.S.buildings.filter(b => b.type === "field" && b.done);
        const free = f => !f._farm || f._farm === a || f._farm.gone || !f._farm.root.parent;
        const ripe = !this.winter && fields.find(f => f.sown && (f.growth ?? 1) >= 3 && free(f)), bare = !this.winter && fields.find(f => !f.sown && free(f));
        const growing = fields.filter(f => f.sown && (f.growth ?? 1) < 3);
        const f = ripe || bare || (growing.length ? growing[Math.floor(Math.random() * growing.length)] : null);
        if (!f) { a.doing = this.winter ? "waiting out the winter — nothing is reaped or sown till spring" : "waiting on the rye"; await a.walkTo(FIRE.x + (Math.random() - 0.5) * 6, FIRE.z + 3 + Math.random() * 2, 1); await sleep(6); continue; }
        const task = f === ripe ? "reap" : f === bare ? "sow" : "tend";
        if (task !== "tend") f._farm = a;
        a.doing = task === "reap" ? "reaping the rye" : task === "sow" ? "sowing the field" : "weeding the rye";
        const strip = task === "tend" ? Math.floor(Math.random() * 3) : (f.progress || 0) % 3, o = (strip - 1) * 2.2;
        const c = Math.cos(f.ry), sn = Math.sin(f.ry), at = lz => [f.x + o * c + lz * sn, f.z - o * sn + lz * c];
        for (const lz of [-2.8, -1, 0.9, 2.7]) {
          const [x, z] = at(lz);
          await a.walkTo(x, z, 1.0); alive();
          const [nx, nz] = at(lz + 1); a.faceTo(nx, nz);
          a.person.setPose(task === "reap" ? "chop" : "reach");
          await sleep(1.8 * this.workMul * this.pace(a, "farming")); alive();
          if (Math.random() < 0.5) this.sfxAt(a, task === "reap" ? "chop" : "pickup");
          a.person.setPose("idle");
        }
        this.learn(a, "farming", 0.7);
        if (task === "tend") { f.tended = this.day; }
        else if ((f.progress = (f.progress || 0) + 1) >= 3) {
          f.progress = 0; f._farm = null;
          if (task === "reap") { const got = RYE_HARVEST + (this.has("well") ? 1 : 0); this.S.rye += got; f.growth = 0; f.sown = false; this.emit("reaped", f, got); }
          else { f.sown = true; f.growth = 1; }
          this.show(f); this.persist(); this.sfxAt(a, "build");
        } else f._farm = null;
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
    // how long it has been played (free play): some things wait on it
    if (G.mode === "play" && this.techGates) this.S.playSecs = (this.S.playSecs || 0) + dt;
    if (this.S.revolt && this.S.revolt.active && (this._revT = (this._revT || 0) - dt) <= 0) { this._revT = 1; checkEnd(this); }
    if (this.techGates && (this._colT = (this._colT || 0) - dt) <= 0) { this._colT = 2; colonyCheck(this); }
    if (this.techGates) feudTick(this, dt);
    this.updateGates();
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
      for (const f of this.S.felled.slice()) if (this.day - (f.day ?? -9) >= regrowDays && Math.random() < regrowOdds) { const t = this.w.fellable[f.i]; if (t && t.state === "gone" && !t.ring && !t.lobe) this.regrow(t); }
      // fields grow a stage a day; a ripe field waits for someone to reap it — the farmers, or you
      // (nothing grows in winter)
      for (const b of this.S.buildings) if (b.type === "field" && b.sown && !winter) {
        // (Agriculture: crops ripen 30% faster)
        // (weeded yesterday: now and then a stage further)
        if ((b.growth ?? 1) < 3) { b.growth = Math.min(3, (b.growth ?? 1) + 1 + ((this.knows("agriculture") && Math.random() < 0.3) || (b.tended >= this.day - 1 && Math.random() < 0.25) ? 1 : 0)); this.show(b); }
      }
      // everyone eats, bread first (a loaf goes twice as far); two days with nothing, and the newest to come leaves
      // (Horse Feed: hunger fades 20% slower)
      let need = Math.ceil((this.S.people.length + 2) / 2 * (this.knows("horsefeed") ? 0.8 : 1));
      // first the dishes you cooked and put in the stores, the best first: whoever gets one is glad of it
      if (this.S.feast && this.S.feast.length) {
        const dishes = this.S.feast.sort((p, q) => q.stars - p.stars), eaters = this.S.people.filter(p => !p.child).sort(() => Math.random() - 0.5);
        let fed = 0;
        for (const p of eaters) { const d = dishes.shift(); if (!d) break; p.meal = { day: this.day, stars: d.stars, name: d.name, where: "from your kitchen" }; fed++; }
        need = Math.max(0, need - Math.floor(fed / 2));
        if (fed) UI.hint(`${fed} of your people ate your cooking today${fed > 1 ? "" : ""} — ${dishes.length ? `${dishes.length} dish${dishes.length > 1 ? "es" : ""} left in the stores` : "the dishes are all gone"}.`, 4);
      }
      const loaves = Math.min(this.S.bread, Math.ceil(need / LOAF_FEEDS));
      this.S.bread -= loaves; need = Math.max(0, need - loaves * LOAF_FEEDS);
      // (then the roast meat the hunters brought in, a mouthful each)
      const meats = Math.min(this.S.meat || 0, need); this.S.meat = (this.S.meat || 0) - meats; need -= meats;
      if (this.S.rye >= need) { this.S.rye -= need; this.S.hungry = 0; }
      else {
        this.S.rye = 0; this.S.hungry = (this.S.hungry || 0) + 1;
        if (this.S.hungry === 2) this.leave("hunger");
        else if (this.S.hungry > 2) this.killSettler(this.weakest(), "hunger");
        else this.emit("hungry", this.day);
      }
      // the market sells what there is too much of
      if (this.has("market")) {
        const sell = [["bread", 20, 1, 2], ["planks", 16, 1, 1], ["bricks", 30, 2, 1], ["stone", 30, 3, 1], ["store", this.storeCap - 10, 3, 1]];
        let got = 0;
        // (Trading, then Marketing: market prices a Mark more, then another)
        const plus = (this.knows("trading") ? 1 : 0) + (this.knows("marketing") ? 1 : 0);
        for (const [k, keep, per, price] of sell) { const n = Math.min(10, Math.floor(Math.max(0, this.have(k) - keep) / per)); this.S[k] -= n * per; got += n * (price + (n ? plus : 0)); }
        this.S.soldToday = got;
        if (got) { this.S.coin += got; this.showStore(); this.emit("sold", got); }
      }
      // in winter every hearth burns a log a day; two cold days, and someone goes
      if (winter) {
        if (G.guide) G.guide("winter");
        const fire = this.hearths;
        if (this.S.store >= fire) { this.S.store -= fire; this.S.cold = 0; this.showStore(); }
        else {
          this.S.store = 0; this.showStore(); this.S.cold = (this.S.cold || 0) + 1;
          if (this.S.cold === 2) this.leave("cold");
          else if (this.S.cold > 2) this.killSettler(this.weakest(), "cold");
          else this.emit("cold", this.day);
        }
      }
      // room to grow: said once for each claim earned
      const due = this.roomDue();
      if (due > 0 && this.S.growTold !== this.S.lobes.length + this.S.expand + due) {
        this.S.growTold = this.S.lobes.length + this.S.expand + due;
        const sib = G.who === "sister" ? "Brother" : "Sister";
        UI.bark(sib, `There's ${this.pop} of us now. We could push the forest back — open the map and mark out where.`, 5);
        UI.hint("Room to grow: open the map (J) and draw a line through the trees beyond the edge. The ground between it and the settlement is cleared for building.", 8);
        G.guide && G.guide("expand");
      }
      if (this.techGates) {
        // the slow road to the state church
        for (const p of dailyConversion(this)) UI.hint(`${p.name} is received into the ${FAITHS[p.faith].house} — ${FAITHS[p.was].name} no longer.`, 6);
        this.nightCrime();
        this.europeTick();
        ambitionsTick(this);
        this.sickness();
      }
      // each person's own mood, day by day: two miserable days and they go; four good ones and they settle in for good
      if (this.techGates) for (const p of this.S.people.slice()) {
        if (p.child) continue;
        const m = this.mood(p).value;
        p.low = m < 25 ? (p.low || 0) + 1 : 0;
        p.good = m >= 75 ? (p.good || 0) + 1 : 0;
        if (p.good >= 4 && !p.mark) this.setMark(p, "contented", "warm, fed and unbothered a good while now");
        if (p.low >= 2) { UI.hint(`${p.name} can't bear it here any longer, and goes back down the road. (G, People, shows how everyone feels.)`, 7); this.leave("unhappy", p); }
        else if (p.low === 1) UI.hint(`${p.name} is miserable (${m}). Another day like this and they'll leave — see G, People, for why.`, 6);
      }
      // the day's keep: a DM for every work that must be tended, out of the treasury; short, and they go untended
      if (this.techGates) {
        // (the halves are owed until they make a whole DM)
        const owe = (this.S.keepOwed || 0) + this.upkeepBill(), bill = Math.floor(owe);
        this.S.keepOwed = owe - bill;
        if (bill) {
          const paid = Math.min(bill, Math.max(0, this.S.coin || 0));
          this.S.coin = (this.S.coin || 0) - paid;
          this.S.unpaidDay = paid < bill ? this.day : null;
          if (paid < bill) UI.hint(`The treasury is ${bill - paid} DM short of the day's keep (${bill} DM): the works stand untended until it's paid. Sell to the traders, or pull something down (V).`, 7);
          this.showStore();
        }
      }
      // wages sold to the pedlar, taxes, and the companies' trade; and whether they will stand for it any longer
      if (this.techGates) { economyDay(this); revoltCheck(this); }
      this.persist();
      this.emit("day", this.day);
    }
  }

  // a ripe field can be reaped by hand
  harvestable() { return this.winter ? [] : this.S.buildings.filter(b => b.type === "field" && b.sown && (b.growth ?? 1) >= 3); }
}
