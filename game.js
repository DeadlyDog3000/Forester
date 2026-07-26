"use strict";

// ===== Forester alpha 0.4 — raiders, soldiers, and the long ledger =====

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; ctx.imageSmoothingEnabled = false; }
addEventListener("resize", resize); resize();

const $ = id => document.getElementById(id);
const msgEl = $("msg");

// --- tuning ---
const CHAR_SIZE = 64, BLDG_SIZE = 96, FARM_SIZE = 64, TREE_SIZE = 64, NODE_SIZE = 48, TILE = 128;
const BASE_WALK = 110, CAM_SPEED = 420;
const CHUNK = 512;
const BASE_CHOP = 3, CRAFT_TIME = 4, REPAIR_TIME = 6, BASE_FARM_BUILD = 5;
const HARVEST_TIME = 3, PATCH_TIME = 2, QUARRY_TIME = 4, SMITH_TIME = 8;
const BASE_LOGS_PER_TREE = 5;
const HUNGER_DECAY = 0.35, STARVE_DPS = 2;
const SAPLING_GROW = 60, BASE_FARM_RIPEN = 25;
const TAX_PERIOD = 240, POLICE_COST = 40, SOLDIER_COST = 30, ARCHER_COST = 25, CAV_COST = 50, TOOL_PRICE_GOV = 10, TOOL_PRICE_SELF = 8;
const ARCHER_RANGE = 190, ARCHER_INTERVAL = 1.6;
const TORCH_TIME = 6, FIRE_TIME = 10, ATK_INTERVAL = 0.9, FIST_DMG = 8, DODGE_CHANCE = 0.15;
const EAT_HEAL = 15;
const RAID_MIN = 240, RAID_MAX = 420, MAX_RAIDERS = 4, MAX_CAMPS = 6;

const REPAIR_COST = { logs: 20, doors: 1, dm: 5 };
const STATIC_COSTS = {
  recruit: { logs: 30, dm: 10 }, market: { logs: 25, dm: 8 }, sapling: { logs: 1, dm: 1 },
  watchtower: { logs: 15, stone: 5, dm: 6 }, bakery: { logs: 20, stone: 3, dm: 8 }, well: { logs: 10, stone: 8, dm: 4 },
  forge: { logs: 20, stone: 6, iron: 2, dm: 12 },
  wall: { logs: 6, stone: 2, dm: 1 }, gate: { logs: 10, stone: 4, dm: 2 },
  townhall: { logs: 40, stone: 10, dm: 20 },
  stonewall: { stone: 8, logs: 2, dm: 2 }, stonegate: { stone: 12, logs: 4, dm: 4 },
  moat: { stone: 4, logs: 2, dm: 3 }, ditch: { logs: 2, dm: 1 },
};
const BLDG_NAMES = { cabin: "Log Cabin", recruit: "Recruitment Center", market: "Market Center",
  burned: "Burned Ruin", watchtower: "Watchtower", bakery: "Bakery", well: "Well", forge: "Forge", wall: "Town Wall", gate: "Town Gate", townhall: "Town Hall",
  stonewall: "Stone Wall", stonegate: "Stone Gate", moat: "Moat", ditch: "Ditch" };
const WALLLIKE = new Set(["wall", "gate", "stonewall", "stonegate", "moat", "ditch"]);
const forgeBuilt = () => buildings.some(b => b.type === "forge" && !b.fire && !b.site);

// --- tech tree ---
const TECH = {};
function T(id, name, tree, req, depth, desc) { TECH[id] = { id, name, tree, req, depth, desc, done: false }; }
T("foraging", "Foraging", "growth", [], 0, "Grass patches give +1 seed, gathered twice as fast");
T("treecutting", "Tree Cutting", "growth", ["foraging"], 1, "Chopping 20% faster");
T("axing", "Axing", "growth", ["treecutting"], 2, "Chopping 35% faster in total");
T("sawing", "Sawing", "growth", ["axing"], 3, "+2 logs per tree");
T("sawmills", "Sawmills", "growth", ["sawing"], 4, "+3 more logs per tree; doors cost 3 logs");
T("replanting", "Replanting", "growth", ["foraging"], 1, "Saplings grow twice as fast");
T("seeding", "Seeding", "growth", ["replanting"], 2, "Farms need only 4 seeds");
T("agriculture", "Agriculture", "growth", ["seeding"], 3, "Crops ripen 30% faster");
T("taming", "Taming", "growth", ["agriculture"], 4, "Beasts of the forest; +3 colony happiness");
T("pets", "Pets", "growth", ["taming"], 5, "+4 colony happiness");
T("pettoys", "Pet Toys", "growth", ["pets"], 6, "+4 colony happiness");
T("pettraining", "Pet Training", "growth", ["pets"], 6, "Guard animals: torching 25% slower");
T("petarmour", "Pet Armour", "growth", ["pettraining"], 7, "Police +25 health");
T("guarddogs", "Guard Dogs", "growth", ["pettraining"], 7, "Police spot enemies much farther away");
T("wardogs", "War Dogs", "growth", ["guarddogs"], 8, "Police +5 damage");
T("horses", "Horses", "growth", ["taming"], 5, "Everyone walks 15% faster");
T("horsebreeding", "Horse Breeding", "growth", ["horses"], 6, "+10% more walking speed");
T("horsefeed", "Horse Feed", "growth", ["horses"], 6, "Hunger fades 20% slower");
T("stables", "Stables", "growth", ["horses"], 6, "Building & farm work 20% faster");
T("saddling", "Saddling", "growth", ["horses"], 6, "+10% more walking speed");
T("warhorse", "War Horse", "growth", ["saddling", "stables"], 7, "Police & soldiers move 35% faster");
T("cavalry", "Cavalry", "growth", ["warhorse"], 8, "Unlocks Cavalry riders — fast mounted force; police & soldiers +50 health");
T("hussars", "Hussars", "growth", ["cavalry"], 9, "Better cavalry: +40 health when recruited; all forces +15 damage");
T("trading", "Trading", "military", [], 0, "Market prices +1 DM");
T("currencies", "Currencies", "military", ["trading"], 1, "Taxes collect +1 DM");
T("marketing", "Marketing", "military", ["currencies"], 2, "Market prices +1 more DM");
T("policing", "Policing", "military", ["marketing"], 3, "Unlocks recruiting police");
T("court", "Court", "military", ["policing"], 4, "Half of beaten rebels are subdued alive");
T("landownership", "Land Ownership", "military", ["currencies"], 2, "Cabins house 3");
T("ownership", "Ownership", "military", ["landownership"], 3, "Dismantling refunds 75%");
T("township", "Township", "military", ["landownership"], 3, "Unlocks the Town Hall — civilians deposit their goods there on their own");
T("lordship", "Lordship", "military", ["ownership"], 4, "Lords underwrite the treasury: it may borrow to -50 DM");
T("slavery", "Slavery", "military", ["lordship"], 5, "Forced labour edict: work +25% faster, happiness plummets");
T("slavemarket", "Slave Market", "military", ["slavery"], 6, "+2 DM each tax collection; happiness suffers");
T("forging", "Forging", "military", ["policing"], 4, "Unlocks blacksmiths");
T("spears", "Spears", "military", ["forging"], 5, "Blacksmiths may forge spears (14 dmg)");
T("hilts", "Hilts", "military", ["spears"], 6, "Weapons cost 1 less iron");
T("blades", "Blades", "military", ["hilts"], 7, "All weapons +5 damage; the secret of true sword-forging");
T("swords", "Swords", "military", ["blades"], 8, "Blacksmiths may forge swords (20 dmg)");
T("battleaxes", "Battle Axes", "military", ["swords"], 9, "Blacksmiths may forge battle axes (28 dmg)");
T("lances", "Lances", "military", ["swords"], 9, "Distance cavalry: riders strike from lance reach; all forces +10 damage (requires War Horse)");
T("archery", "Archery", "military", ["defending"], 5, "Unlocks Archers — they loose arrows at enemies from afar");
T("defending", "Defending", "military", ["policing"], 4, "Unlocks Town Walls & Gates; police take weapons from the armoury; torching 30% slower — but the camps take notice");
T("raiding", "Raiding", "military", ["defending"], 5, "Unlocks Soldiers who can sack thief & raid camps; +10 damage");
T("defplus", "Defending II", "military", ["defending"], 5, "Stone walls & gates, and moats & ditches that mire attackers");
T("occupation", "Occupation", "military", ["raiding"], 6, "Taxes collect +1 more DM");
TECH.lances.req.push("warhorse");
TECH.foraging.done = TECH.ownership.done = TECH.forging.done = true;   // starting knowledge

const has = id => TECH[id].done;
const techCost = t => 15 + t.depth * 12;
const techTime = t => 45 + t.depth * 40;
let research = null;

// --- derived stats ---
const isForce = c => c.profession === "police" || c.profession === "soldier" || c.profession === "archer" || c.profession === "cavalry";
const walkSpeed = c => BASE_WALK * (1 + (has("horses") ? 0.15 : 0) + (has("horsebreeding") ? 0.10 : 0) + (has("saddling") ? 0.10 : 0)) * (c && isForce(c) ? (has("warhorse") ? 1.35 : 1.15) : 1) * (c && c.profession === "cavalry" ? 1.45 : 1);
const workMul = c => (c && c.tool ? 0.65 : 1) * (has("stables") ? 0.8 : 1) * (laws.forced ? 0.75 : 1);
const chopTime = c => BASE_CHOP * (has("axing") ? 0.65 : has("treecutting") ? 0.8 : 1) * workMul(c);
const logsPerTree = () => BASE_LOGS_PER_TREE + (has("sawing") ? 2 : 0) + (has("sawmills") ? 3 : 0);
const doorCost = () => has("sawmills") ? 3 : 5;
const farmSeedCost = () => has("seeding") ? 4 : 6;
const farmRipen = () => BASE_FARM_RIPEN * (has("agriculture") ? 0.7 : 1);
const sellPrice = () => 3 + (has("trading") ? 1 : 0) + (has("marketing") ? 1 : 0);
const taxBonus = () => (has("currencies") ? 1 : 0) + (has("occupation") ? 1 : 0) + (has("slavemarket") ? 2 : 0);
const forceDmg = c => (c.profession === "soldier" ? 15 : c.profession === "cavalry" ? 20 : 12) + (has("wardogs") ? 5 : 0) + (has("hussars") ? 15 : 0) + (has("lances") ? 10 : 0) + (has("raiding") ? 10 : 0) + (c.armed ? weaponDmg() : 0);
const archerDmg = () => 12 + (has("blades") ? 5 : 0) + (has("hussars") ? 5 : 0);
const torchTime = () => TORCH_TIME / ((has("defending") ? 0.7 : 1) * (has("pettraining") ? 0.75 : 1));
const weaponDmg = () => (has("battleaxes") ? 28 : has("swords") ? 20 : has("spears") ? 14 : 8) + (has("blades") ? 5 : 0);
const weaponIron = () => Math.max(1, 2 - (has("hilts") ? 1 : 0));
const canForgeWeapons = () => has("spears") || has("swords") || has("battleaxes");
const treasuryFloor = () => has("lordship") ? -50 : 0;
const cabinCapacity = () => has("landownership") ? 3 : 2;
const dismantleRefund = () => has("ownership") ? 0.75 : 0.5;
const nearWatchtower = (x, y) => buildings.some(b => b.type === "watchtower" && !b.fire && !b.site && Math.hypot(b.x - x, b.y - y) < 400);

function cabinCost() {
  const built = buildings.filter(b => b.type === "cabin" && b.placed).length;
  return { logs: 20, doors: 1, dm: 5 + (built >= 2 ? 2 : 0) };
}
function costOf(type) {
  if (type === "cabin") return cabinCost();
  if (type === "farm") return { logs: 3, seeds: farmSeedCost(), dm: 2 };
  return STATIC_COSTS[type];
}

// --- assets ---
const IMAGES = {
  tree: "assets/sprites/env/spruce_tree_32.png", grass: "assets/sprites/env/grass_64.png",
  stone: "assets/sprites/env/stone_32.png", patch: "assets/sprites/env/grasspatch_32.png",
  burned: "assets/sprites/buildings/burned_house_32.png", cabin: "assets/sprites/buildings/log_cabin_32.png",
  recruit: "assets/sprites/buildings/recruitment_center_32.png", market: "assets/sprites/buildings/market_32.png",
  farm: "assets/sprites/buildings/farm_32.png",
  townhall: "assets/sprites/buildings/townhall_32.png",
  stonewall: "assets/sprites/buildings/stonewall_32.png",
  stonewallv: "assets/sprites/buildings/stonewallv_32.png",
  stonegate: "assets/sprites/buildings/stonegate_32.png",
  moat: "assets/sprites/buildings/moat_32.png",
  ditch: "assets/sprites/buildings/ditch_32.png",
  gravestone: "assets/sprites/env/gravestone_32.png",
  grass_w: "assets/sprites/env/grass_w_64.png",
  tree_w: "assets/sprites/env/tree_w_32.png",
  stone_w: "assets/sprites/env/stone_w_32.png",
  patch_w: "assets/sprites/env/patch_w_32.png",
  burned_w: "assets/sprites/buildings/burned_w_32.png",
  cabin_w: "assets/sprites/buildings/cabin_w_32.png",
  recruit_w: "assets/sprites/buildings/recruit_w_32.png",
  market_w: "assets/sprites/buildings/market_w_32.png",
  farm_w: "assets/sprites/buildings/farm_w_32.png",
  watchtower_w: "assets/sprites/buildings/watchtower_w_32.png",
  bakery_w: "assets/sprites/buildings/bakery_w_32.png",
  well_w: "assets/sprites/buildings/well_w_32.png",
  forge_w: "assets/sprites/buildings/forge_w_32.png",
  wall_w: "assets/sprites/buildings/wall_w_32.png",
  wallv_w: "assets/sprites/buildings/wallv_w_32.png",
  gate_w: "assets/sprites/buildings/gate_w_32.png",
  townhall_w: "assets/sprites/buildings/townhall_w_32.png",
  watchtower: "assets/sprites/buildings/watchtower_32.png", bakery: "assets/sprites/buildings/bakery_32.png",
  well: "assets/sprites/buildings/well_32.png",
  forge: "assets/sprites/buildings/forge_32.png",
  wall: "assets/sprites/buildings/wall_32.png",
  wallv: "assets/sprites/buildings/wall_v_32.png",
  gate: "assets/sprites/buildings/gate_32.png",
  thiefcamp: "assets/sprites/buildings/thief_camp_32.png", raidcamp: "assets/sprites/buildings/raid_camp_32.png",
};
for (const who of ["sister", "brother", "hunter"]) for (let i = 0; i < 4; i++) IMAGES[`${who}${i}`] = `assets/sprites/characters/${who}_walk_${i}.png`;
for (let i = 0; i < 4; i++) IMAGES[`cavalry${i}`] = `assets/sprites/characters/cavalry_walk_${i % 2}.png`;   // 2-frame ride cycle
for (let i = 0; i < 4; i++) {
  IMAGES[`ragged${i}`] = `assets/sprites/characters/ragged_walk_${i}.png`;
  IMAGES[`atksword${i}`] = `assets/sprites/characters/attack_sword_${i}.png`;
  IMAGES[`atkfist${i}`] = `assets/sprites/characters/attack_fist_${i}.png`;
  IMAGES[`fire${i}`] = `assets/sprites/env/fire_${i}.png`;
}

const img = {};
let loaded = 0;
const imageNames = Object.keys(IMAGES);
for (const key of imageNames) {
  img[key] = new Image();
  img[key].onload = img[key].onerror = () => { if (++loaded === imageNames.length) assetsReady(); };
  img[key].src = IMAGES[key];
}

// --- state ---
let gameState = "boot"; // boot -> menu | loading -> playing -> over
const res = { logs: 0, seeds: 0, stone: 0, iron: 0, doors: 0, wheat: 0, bread: 0, meat: 0, dm: 60, weapons: 0, tools: 0 };
let taxRate = 2, policeCount = 0, taxTimer = TAX_PERIOD;
let settlementName = "Neu Hamburg";
let empireName = "";
let territoryColor = "#7da083", borderColor = "#c9a86a";
const territory = new Set();          // "cx,cy" world cells, 96px each
const TCELL = 96;
let sackedCamps = 0, playT = 0, nextSettleAt = 1200, settlePending = false;
let lastTier = 1;
// the woods grow bolder as your colony grows older and larger
function difficulty() { return Math.min(6, 1 + Math.floor(playT / 1000) + Math.floor(civs.length / 10)); }
const settlements = [];               // {name, pop, mx, my} on the Europe map
const laws = { civWeapons: false, hunterWeapons: true, forced: false, freeRoam: false };

const cam = { x: 0, y: 0 };
let zoom = 1;
const settings = Object.assign(
  { master: 0.5, music: true, battle: true, sfx: true, ambient: true,
    floaters: true, labels: true, smoke: true, night: true, camSpeed: 1 },
  JSON.parse(localStorage.getItem("forester_settings") || "{}"));
window.FSET = settings;
function saveSettings() { localStorage.setItem("forester_settings", JSON.stringify(settings)); }
const keys = {};
const mouse = { x: 0, y: 0, wx: 0, wy: 0 };

const buildings = [], farms = [], civs = [], visitors = [], raiders = [], camps = [], floaters = [], smokes = [], corpses = [], graves = [];
const arrows = [];   // archer shots in flight
const chunks = new Map();

let selected = null, selectedBldg = null, selectedCamp = null, selectedGrave = null, buildMode = null;
let selGroup = [];   // soldier multi-select: click several soldiers, order them as one
const groupable = c => c.profession === "soldier" || c.profession === "cavalry" || c.profession === "archer";
const soldierGroup = () =>
  (selected && groupable(selected) && selGroup.includes(selected))
    ? selGroup.filter(s => civs.includes(s) && groupable(s))
    : (selected ? [selected] : []);
let toastTimer = 0, hunterTimer = 40, visitorSeq = 0, paused = false;
let worldT = 80;   // clock of the world; night falls late in each cycle
const YEAR = 640, WINTER_AT = 400;   // 240s winters — long enough to kill
function season() { return (worldT % YEAR) >= WINTER_AT ? "winter" : "summer"; }
let lastSeason = "summer";
let colonyYear = 1683;
function wimg(key) {
  if (season() !== "winter") return img[key];
  const w = img[key + "_w"];
  return (w && w.complete && w.naturalWidth) ? w : img[key];
}
function nightAmt() {
  const ph = worldT % 300;
  return ph < 180 ? 0 : ph < 210 ? (ph - 180) / 30 : ph < 275 ? 1 : Math.max(0, 1 - (ph - 275) / 25);
}
let raidTimer = 60, campRespawnTimer = 300, patrolT = 5, ambushT = 30;
let techTab = "growth";

const NAME_POOL = ["Falk", "Jorg", "Matthias", "Anselm", "Dietrich", "Lorenz", "Veit", "Kaspar",
  "Otto", "Bruno", "Conrad", "Ludwig", "Gunther", "Wilhelm", "Albrecht", "Erwin"];
const FEMALE_NAMES = ["Greta", "Ilse", "Marta", "Anneke", "Liesl", "Hedwig", "Frieda", "Adelheid"];
const usedNames = new Set(["Brother", "Sister"]);
function nextName(gender) {
  const pool = gender === "f" ? FEMALE_NAMES : NAME_POOL;
  const free = pool.filter(n => !usedNames.has(n));
  let name;
  if (free.length) name = free[Math.floor(Math.random() * free.length)];
  else {
    const base = pool[Math.floor(Math.random() * pool.length)];
    const suffixes = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    let k = 0;
    do { name = base + " " + (suffixes[k] || "XX" + k); k++; } while (usedNames.has(name));
  }
  usedNames.add(name);
  return name;
}

buildings.push({ type: "burned", x: 0, y: 0, progress: -1, occupants: [], fire: 0, torchP: -1, placed: false });
civs.push(mkCiv("Brother", "brother", -70, 110, "m"));
civs.push(mkCiv("Sister", "sister", 70, 130, "f"));
civs[0].age = 22; civs[1].age = 19;

function mkCiv(name, who, x, y, gender) {
  return { name, who, nativeWho: who, gender: gender || "m", x, y, tx: x, ty: y, state: "idle", anim: 0, facing: 1,
           task: null, workT: 0, home: null, profession: null,
           hunger: 100, hp: 100, maxHp: 100, happiness: 75, rebel: false, armed: false, tool: false,
           inv: { logs: 0, seeds: 0, stone: 0, iron: 0, wheat: 0, bread: 0, meat: 0, dm: 0 },
           age: 20 + Math.floor(Math.random() * 26),
           autoT: 3 + Math.random() * 4, atkT: 0, stuckT: 0, coldT: 0, coldWarned: false, isCiv: true };
}

function float(x, y, text, color) { floaters.push({ x, y, text, color, t: 1.4 }); }
// hunters keep their own look; everyone else wears the family's spare clothes
function refreshAvatar(c) {
  c.who = c.profession === "hunter" ? c.nativeWho :
          c.profession === "archer" ? "hunter" :
          c.profession === "cavalry" ? "cavalry" : (c.gender === "f" ? "sister" : "brother");
}
function onScreen(x, y) {
  return x > cam.x && x < cam.x + canvas.width / zoom && y > cam.y && y < cam.y + canvas.height / zoom;
}

// --- terrain ---
function chunkKey(cx, cy) { return cx + "," + cy; }
function chunkOf(wx, wy) { return [Math.floor(wx / CHUNK), Math.floor(wy / CHUNK)]; }

function markChunkDirty(wx, wy) {
  const ch = chunks.get(chunkKey(...chunkOf(wx, wy)));
  if (ch) ch.dirty = true;
}
function getChunk(cx, cy) {
  const key = chunkKey(cx, cy);
  let ch = chunks.get(key);
  if (ch) return ch;
  ch = { trees: [], stones: [], patches: [] };
  let seed = ((cx * 73856093) ^ (cy * 19349663) ^ 0x5f3759df) >>> 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 21; i++) {
    const x = cx * CHUNK + rnd() * CHUNK, y = cy * CHUNK + rnd() * CHUNK;
    const d = Math.hypot(x, y);
    if (d < 190) continue;
    if (!(d < 430) && i >= 7) continue;
    if (ch.trees.some(t => Math.hypot(t.x - x, t.y - y) < 46)) continue;
    ch.trees.push({ x, y, alive: true, progress: -1, growth: 1 });
  }
  for (let i = 0; i < 2; i++) {
    const x = cx * CHUNK + rnd() * CHUNK, y = cy * CHUNK + rnd() * CHUNK;
    if (Math.hypot(x, y) < 210 || rnd() < 0.45) continue;
    ch.stones.push({ x, y, alive: true, progress: -1 });
  }
  for (let i = 0; i < 3; i++) {
    const x = cx * CHUNK + rnd() * CHUNK, y = cy * CHUNK + rnd() * CHUNK;
    if (Math.hypot(x, y) < 150 || rnd() < 0.3) continue;
    ch.patches.push({ x, y, alive: true, progress: -1 });
  }
  chunks.set(key, ch);
  return ch;
}

function visibleChunks(pad = CHUNK) {
  const vw = canvas.width / zoom, vh = canvas.height / zoom;
  const [x0, y0] = chunkOf(cam.x - pad, cam.y - pad);
  const [x1, y1] = chunkOf(cam.x + vw + pad, cam.y + vh + pad);
  const out = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) out.push(getChunk(cx, cy));
  return out;
}

function nearThings(kind, wx, wy, r) {
  const [cx, cy] = chunkOf(wx, wy);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    for (const t of getChunk(cx + dx, cy + dy)[kind])
      if (Math.hypot(t.x - wx, t.y - wy) < r) out.push(t);
  return out;
}

// --- camps & raids ---
function spawnCamps(n) {
  const tier = difficulty();
  for (let i = 0; i < n && camps.length < 1; i++) {   // one camp in the world at a time
    const a = Math.random() * Math.PI * 2, d = 1100 + Math.random() * 1100;
    const type = Math.random() < 0.55 ? "thief" : "raid";
    const hp = Math.round((type === "thief" ? 120 : 180) * (1 + 0.15 * (tier - 1)));
    camps.push({ type, x: Math.cos(a) * d, y: Math.sin(a) * d, hp, maxHp: hp,
                 dm: 25 + Math.floor(Math.random() * 40) + tier * 8,
                 weapons: 1 + Math.floor(Math.random() * 2) + Math.floor(tier / 3) });
  }
}

function mkRaider(camp, state) {
  const tier = difficulty();
  const hp = 60 + (tier - 1) * 12;
  return { x: camp.x + Math.random() * 60 - 30, y: camp.y + 20 + Math.random() * 30, hp, maxHp: hp,
           dmg: (camp.type === "raid" ? 14 : 10) + (tier - 1) * 2, camp, target: null,
           state, anim: 0, facing: 1, atkT: 0, foe: null, carry: 0, wpx: camp.x, wpy: camp.y };
}
function spawnRaid() {
  if (res.dm < 5) return;   // an empty treasury is not worth the walk
  const attackers = raiders.filter(r => r.state !== "patrol").length;
  if (!camps.length || attackers >= MAX_RAIDERS) return;
  const camp = camps[Math.floor(Math.random() * camps.length)];
  let n = camp.type === "raid" ? 3 : 2;
  const targets = buildings.filter(b => b.type !== "burned");
  if (!targets.length) return;
  // the patrol decides it is a good time to strike
  for (const pr of raiders.filter(r => r.camp === camp && r.state === "patrol")) {
    if (n <= 0) break;
    pr.state = "approach";
    pr.target = targets[Math.floor(Math.random() * targets.length)];
    n--;
  }
  for (let i = 0; i < n && raiders.filter(r => r.state !== "patrol").length < MAX_RAIDERS; i++) {
    const r = mkRaider(camp, "approach");
    r.target = targets[Math.floor(Math.random() * targets.length)];
    raiders.push(r);
  }
  if (buildings.some(b => b.type === "watchtower" && !b.fire)) {
    const dir = Math.abs(camp.x) > Math.abs(camp.y) ? (camp.x > 0 ? "east" : "west") : (camp.y > 0 ? "south" : "north");
    toast(`⚠ The watchtower sounds the alarm — raiders approach from the ${dir}!`);
  } else toast("⚠ Raiders have been sighted near the colony!");
}

function updateRaider(r, dt) {
  let speed = BASE_WALK * 0.9;
  // moats and ditches mire attackers
  for (const b of buildings) {
    if (b.site) continue;
    if (b.type === "moat" && pointInRect(r.x, r.y, inflate(bldgRect(b), 4))) { speed *= 0.35; break; }
    if (b.type === "ditch" && pointInRect(r.x, r.y, inflate(bldgRect(b), 4))) { speed *= 0.6; break; }
  }
  // fight anyone who is fighting us, or any force unit close by
  if (!r.foe || (!civs.includes(r.foe))) {
    r.foe = null;
    for (const c of civs) if (isForce(c) && c.state !== "sleeping" && c.state !== "warming" && Math.hypot(c.x - r.x, c.y - r.y) < 90) { r.foe = c; break; }
  }
  if (r.foe) {
    const d = Math.hypot(r.foe.x - r.x, r.foe.y - r.y);
    if (d > 260) r.foe = null;
    else {
      if (d > 30) { r.x += (r.foe.x - r.x) / d * speed * dt; r.y += (r.foe.y - r.y) / d * speed * dt; }
      r.facing = r.foe.x < r.x ? -1 : 1;
      r.anim += dt * 9;
      r.atkT -= dt;
      if (r.atkT <= 0 && d < 48) { r.atkT = ATK_INTERVAL; SFX.swing(); strikeUnit(r, r.foe, r.dmg); }
      return;
    }
  }
  r.stepT = (r.stepT || 0) - dt;
  if ((r.state === "approach" || r.state === "flee") && r.stepT <= 0 && onScreen(r.x, r.y)) { SFX.step(true); r.stepT = 0.3; }
  if (r.state === "patrol") {
    // circle the camp, watchful, until the strike
    const d = Math.hypot(r.wpx - r.x, r.wpy - r.y);
    if (d < 8 || !camps.includes(r.camp)) {
      if (!camps.includes(r.camp)) {   // camp sacked: vengeance
        const targets = buildings.filter(b => b.type !== "burned");
        if (targets.length) { r.state = "approach"; r.target = targets[Math.floor(Math.random() * targets.length)]; }
        else { raiders.splice(raiders.indexOf(r), 1); }
        return;
      }
      const a = Math.random() * Math.PI * 2, rad = 70 + Math.random() * 110;
      r.wpx = r.camp.x + Math.cos(a) * rad; r.wpy = r.camp.y + Math.sin(a) * rad;
    } else {
      r.x += (r.wpx - r.x) / d * speed * 0.45 * dt;
      r.y += (r.wpy - r.y) / d * speed * 0.45 * dt;
      r.facing = r.wpx < r.x ? -1 : 1;
      r.anim += dt * 5;
    }
    return;
  }
  if (r.state === "axeWall") {
    const w = r.wallTarget;
    if (!buildings.includes(w) || w.fire) { r.state = "approach"; r.wallTarget = null; return; }
    r.facing = w.x < r.x ? -1 : 1;
    r.anim += dt * 9;
    r.atkT -= dt;
    if (r.atkT <= 0) {
      r.atkT = ATK_INTERVAL;
      SFX.chop();
      w.hp -= 9;
      float(w.x, w.y - 74, "-9", "#d86a5a");
      if (w.hp <= 0) {
        buildings.splice(buildings.indexOf(w), 1);
        if (selectedBldg === w) selectedBldg = null;
        toast(`⚠ Raiders have hacked the ${BLDG_NAMES[w.type]} to splinters!`);
        r.state = "approach"; r.wallTarget = null;
      }
    }
    return;
  }
  if (r.state === "torchWall") {
    const w = r.wallTarget;
    if (!buildings.includes(w) || w.fire) { r.state = "approach"; r.wallTarget = null; return; }
    if (w.type === "stonewall" || w.type === "stonegate") { r.state = "axeWall"; r.atkT = ATK_INTERVAL; return; }   // stone doesn't burn
    r.workT += dt; w.torchP = r.workT / (torchTime() * 0.8); r.anim += dt * 9;
    if (r.workT >= torchTime() * 0.8) {
      w.torchP = -1; w.fire = FIRE_TIME * 0.7;
      toast(`⚠ Raiders put the ${BLDG_NAMES[w.type]} to the torch!`);
      r.state = "approach"; r.wallTarget = null;
    }
    return;
  }
  if (r.state === "approach") {
    const t = r.target;
    if (!buildings.includes(t)) { r.state = "flee"; return; }
    const dx = t.x - r.x, dy = t.y + 20 - r.y, d = Math.hypot(dx, dy);
    if (d < 30) {
      if (r.arsonist && t.type !== "stonewall" && t.type !== "stonegate") { r.state = "torchWall"; r.wallTarget = t; r.workT = 0; }
      else { r.state = "steal"; r.workT = 0; }
    }
    else {
      const nx = r.x + dx / d * speed * dt, ny = r.y + dy / d * speed * dt;
      // town walls bar the way — find the weakest nearby segment and break THAT
      const barrier = buildings.find(b => ["wall", "gate", "stonewall", "stonegate"].includes(b.type) && !b.fire && !b.site &&
                                          pointInRect(nx, ny, inflate(bldgRect(b), 8)));
      if (barrier) {
        let weakest = barrier;
        for (const b of buildings)
          if (["wall", "gate", "stonewall", "stonegate"].includes(b.type) && !b.fire && !b.site && (b.hp || 0) < (weakest.hp || 0) &&
              Math.hypot(b.x - barrier.x, b.y - barrier.y) < 320) weakest = b;
        if (weakest !== barrier) {
          // walk along to the weak point first
          r.x += (weakest.x - r.x) / Math.max(1, Math.hypot(weakest.x - r.x, weakest.y - r.y)) * speed * dt;
          r.y += (weakest.y + 26 - r.y) / Math.max(1, Math.hypot(weakest.x - r.x, weakest.y + 26 - r.y)) * speed * dt;
          if (Math.hypot(weakest.x - r.x, weakest.y - r.y) > 40) { r.anim += dt * 8; return; }
        }
        r.state = (weakest.type === "stonewall" || weakest.type === "stonegate") ? "axeWall" : (Math.random() < 0.5 ? "torchWall" : "axeWall");
        r.wallTarget = weakest; r.workT = 0;
        return;
      }
      r.x = nx; r.y = ny; r.facing = dx < 0 ? -1 : 1; r.anim += dt * 8;
    }
  } else if (r.state === "steal") {
    r.anim = 1;
    r.workT += dt;
    if (r.workT > 2) {
      const take = Math.min(15, Math.max(0, res.dm - treasuryFloor()));
      res.dm -= take; r.carry = take;
      SFX.coinLoss();
      float(r.x, r.y - 70, "-" + take + " DM", "#d86a5a");
      toast(`⚠ A raider makes off with ${take} DM!`);
      r.state = "flee";
    }
  } else if (r.state === "flee") {
    const dx = r.camp.x - r.x, dy = r.camp.y - r.y, d = Math.hypot(dx, dy);
    if (d < 40 || (!r.nation && !camps.includes(r.camp))) { raiders.splice(raiders.indexOf(r), 1); return; }
    r.x += dx / d * speed * dt; r.y += dy / d * speed * dt; r.facing = dx < 0 ? -1 : 1; r.anim += dt * 8;
  }
}

// generic strike between any two units (civ or raider)
function strikeUnit(a, b, dmg) {
  if (Math.random() < DODGE_CHANCE) { float(b.x, b.y - 70, "Dodged!", "#cfd8d3"); SFX.dodge(); return; }
  b.hp -= dmg;
  float(b.x, b.y - 70, "-" + dmg, "#d86a5a");
  SFX.hit();
  if (b.hp <= 0) {
    if (raiders.includes(b)) {
      raiders.splice(raiders.indexOf(b), 1);
      SFX.death();
      if (b.carry) { res.dm += b.carry; float(b.x, b.y - 50, "+" + b.carry + " DM", "#7da083"); }
      toast("A raider has been cut down.");
    } else if (civs.includes(b)) {
      if (b.rebel && has("court") && Math.random() < 0.5) {
        b.rebel = false; b.armed = false; b.hp = 30; b.happiness = 60;
        toast(`${b.name} is beaten down, subdued, and hauled before the court.`);
      } else killCiv(b, b.rebel ? "died resisting the law" : "was slain");
    }
    if (a.task && a.task.target === b) { a.state = "idle"; a.task = null; }
    if (a.foe === b) a.foe = null;
  } else if (civs.includes(b)) {
    if (!b.rebel && !isForce(b) && (!b.task || b.task.kind !== "attack"))
      order(b, { kind: "walk", x: b.x + (b.x - a.x) * 4, y: b.y + (b.y - a.y) * 4 });
    else if ((b.rebel || isForce(b)) && (!b.task || !b.task.target)) {
      if (civs.includes(a)) order(b, { kind: "attack", target: a, x: a.x, y: a.y });
      // raider attackers are handled by force auto-targeting
    }
  }
}

// --- geometry ---
const SMALL_BLDG = { farm: FARM_SIZE, wall: 64, gate: 72, stonewall: 64, stonegate: 76, moat: 64, ditch: 64 };
function bldgRect(b) {
  if (WALLLIKE.has(b.type)) {
    const L = SMALL_BLDG[b.type];
    return b.rot ? { x: b.x - 11, y: b.y - L, w: 22, h: L }
                 : { x: b.x - L / 2, y: b.y - 22, w: L, h: 22 };
  }
  const s = SMALL_BLDG[b.type] || BLDG_SIZE;
  return { x: b.x - s / 2, y: b.y - s, w: s, h: s };
}
let wallRot = 0;
const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pointInRect = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
const allStructures = () => buildings.concat(farms.map(f => ({ type: "farm", x: f.x, y: f.y })));

const tkey = (cx, cy) => cx + "," + cy;
function tcellOf(wx, wy) { return [Math.floor(wx / TCELL), Math.floor(wy / TCELL)]; }
function inTerritory(wx, wy) { return territory.has(tkey(...tcellOf(wx, wy))); }
function nearTerritory(wx, wy) {
  const [cx, cy] = tcellOf(wx, wy);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
    if (territory.has(tkey(cx + dx, cy + dy))) return true;
  return false;
}
function expandAround(wx, wy, r) {
  const [cx, cy] = tcellOf(wx, wy);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) territory.add(tkey(cx + dx, cy + dy));
}
function expandFrontier(n) {
  // claim n random cells adjacent to existing territory — keeps the shape organic but cubic
  const frontier = [];
  for (const key of territory) {
    const [cx, cy] = key.split(",").map(Number);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
      if (!territory.has(tkey(cx + dx, cy + dy))) frontier.push([cx + dx, cy + dy]);
  }
  for (let i = 0; i < n && frontier.length; i++)
    territory.add(tkey(...frontier.splice(Math.floor(Math.random() * frontier.length), 1)[0]));
}
expandAround(0, -40, 2);   // the family clearing starts claimed

function nearTerritoryWide(wx, wy, pad) {
  const [cx, cy] = tcellOf(wx, wy);
  for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++)
    if (territory.has(tkey(cx + dx, cy + dy))) return true;
  return false;
}
function legalToBuild(type, wx, wy, rot) {
  if (WALLLIKE.has(type)) {
    if (!nearTerritoryWide(wx, wy, 5)) return false;                       // not too far from home
    for (const cp of camps) if (Math.hypot(cp.x - wx, cp.y - wy) < 520) return false;   // not at their door
  } else if (type !== "sapling" && !inTerritory(wx, wy)) return false;
  const s = type === "sapling" ? 20 : (SMALL_BLDG[type] || BLDG_SIZE);
  const cand = (type === "wall" || type === "gate")
    ? bldgRect({ type, x: wx, y: wy, rot: rot === undefined ? wallRot : rot })
    : { x: wx - s / 2, y: wy - s, w: s, h: s };
  const placingWall = WALLLIKE.has(type);
  for (const b of allStructures()) {
    const bWall = WALLLIKE.has(b.type);
    const margin = placingWall && bWall ? -10 : placingWall || bWall || b.type === "farm" ? 2 : 12;
    const r = inflate(bldgRect(b), margin);
    if (!bWall && b.type !== "farm" && !placingWall) r.h += 26;
    if (rectsOverlap(cand, r)) return false;
  }
  for (const c of camps) if (Math.hypot(c.x - wx, c.y - wy) < 200) return false;
  for (const t of nearThings("trees", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  for (const t of nearThings("stones", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  return true;
}

const PATH_CELL = 44;
function cellBlocked(px, py) {
  return allStructures().some(b => (b.type === "wall" || b.type === "stonewall") && !b.site &&
                                   pointInRect(px, py, inflate(bldgRect(b), 10)));
}
function lineBlocked(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.max(1, Math.ceil(d / 22));
  for (let i = 1; i <= steps; i++)
    if (cellBlocked(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps)) return true;
  return false;
}
function findPath(sx, sy, gx, gy) {
  // bounded A* over a coarse grid; gates are open cells, walls are not
  const minX = Math.floor(Math.min(sx, gx) / PATH_CELL) - 12, maxX = Math.floor(Math.max(sx, gx) / PATH_CELL) + 12;
  const minY = Math.floor(Math.min(sy, gy) / PATH_CELL) - 12, maxY = Math.floor(Math.max(sy, gy) / PATH_CELL) + 12;
  if ((maxX - minX) * (maxY - minY) > 4600) return null;   // too far to bother — walk straight
  const key = (x, y) => x + "," + y;
  const start = [Math.floor(sx / PATH_CELL), Math.floor(sy / PATH_CELL)];
  const goal = [Math.floor(gx / PATH_CELL), Math.floor(gy / PATH_CELL)];
  const open = [{ x: start[0], y: start[1], g: 0, f: 0, from: null }];
  const seen = new Map([[key(start[0], start[1]), open[0]]]);
  let goalNode = null, guard = 0;
  while (open.length && guard++ < 4000) {
    open.sort((a, b) => a.f - b.f);
    const n = open.shift();
    if (n.x === goal[0] && n.y === goal[1]) { goalNode = n; break; }
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx2 = n.x + dx, ny2 = n.y + dy;
      if (nx2 < minX || ny2 < minY || nx2 > maxX || ny2 > maxY) continue;
      const k = key(nx2, ny2);
      if (seen.has(k)) continue;
      const cx2 = nx2 * PATH_CELL + PATH_CELL / 2, cy2 = ny2 * PATH_CELL + PATH_CELL / 2;
      if (cellBlocked(cx2, cy2)) { seen.set(k, null); continue; }
      if (dx && dy && (cellBlocked(n.x * PATH_CELL + PATH_CELL / 2 + dx * PATH_CELL, n.y * PATH_CELL + PATH_CELL / 2) &&
                       cellBlocked(n.x * PATH_CELL + PATH_CELL / 2, n.y * PATH_CELL + PATH_CELL / 2 + dy * PATH_CELL))) continue;
      const g = n.g + (dx && dy ? 1.4 : 1);
      const node = { x: nx2, y: ny2, g, f: g + Math.hypot(goal[0] - nx2, goal[1] - ny2), from: n };
      seen.set(k, node);
      open.push(node);
    }
  }
  if (!goalNode) return null;
  const pts = [];
  for (let n = goalNode; n; n = n.from) pts.unshift([n.x * PATH_CELL + PATH_CELL / 2, n.y * PATH_CELL + PATH_CELL / 2]);
  pts.shift();                       // drop the cell we stand in
  if (pts.length) pts.pop();         // final leg goes to the true target
  // smooth: drop waypoints the walker can already see past
  const out = [];
  let ax = sx, ay = sy;
  for (let i = 0; i < pts.length; i++) {
    const last = i === pts.length - 1;
    if (!last && !lineBlocked(ax, ay, pts[i + 1][0], pts[i + 1][1])) continue;
    out.push(pts[i]); ax = pts[i][0]; ay = pts[i][1];
  }
  return out;
}
function collideMove(c, nx, ny) {
  const blocked = (x, y) => allStructures().some(b => (b.type === "wall" || b.type === "stonewall") && !b.site && pointInRect(x, y, inflate(bldgRect(b), 6)));
  const ox = c.x, oy = c.y;
  const stepLen = Math.hypot(nx - c.x, ny - c.y);
  // a slide only counts if it makes real progress — micro-corrections must not
  // suppress the sidestep, or civs oscillate against flat faces forever
  const canX = !blocked(nx, c.y) && Math.abs(nx - c.x) > stepLen * 0.4;
  const canY = !blocked(c.x, ny) && Math.abs(ny - c.y) > stepLen * 0.4;
  if (!blocked(nx, ny)) { c.x = nx; c.y = ny; }
  else if (canX) c.x = nx;
  else if (canY) c.y = ny;
  else {
    // sidestep perpendicular to the way we wanted to go — shimmy around the corner
    const dx = nx - c.x, dy = ny - c.y, d = Math.max(0.001, Math.hypot(dx, dy));
    const step = Math.hypot(dx, dy) * 1.4;
    const side = c.sideBias || (c.sideBias = Math.random() < 0.5 ? 1 : -1);
    const px = -dy / d * step * side, py = dx / d * step * side;
    // snap to the dominant axis: a diagonal sidestep grazes back into the wall
    const ax = Math.abs(px) >= Math.abs(py) ? Math.sign(px) * step : 0;
    const ay = ax ? 0 : Math.sign(py) * step;
    if (!blocked(c.x + ax, c.y + ay)) { c.x += ax; c.y += ay; }
    else if (!blocked(c.x - ax, c.y - ay)) { c.x -= ax; c.y -= ay; c.sideBias = -side; }
  }
  if (Math.hypot(c.x - ox, c.y - oy) < 0.5) {
    c.stuckT += 1 / 60;
    if (c.stuckT > 1.2) {
      c.stuckT = 0;
      // replan the route from here before cruder measures
      if (c.task && c.task.kind !== "attack" && !c.replanned) {
        c.replanned = true;
        const route = findPath(c.x, c.y, c.task.x, c.task.y);
        if (route && route.length) { c.path = route; c.tx = route[0][0]; c.ty = route[0][1]; return; }
      }
      // walled in? take the gate like a sensible person
      if (!c.viaGate && (!c.task || c.task.kind !== "attack")) {
        let gate = null, gd = 800;
        for (const b of buildings) {
          if ((b.type !== "gate" && b.type !== "stonegate") || b.fire || b.site) continue;
          const d = Math.hypot(b.x - c.x, b.y - c.y);
          if (d < gd) { gd = d; gate = b; }
        }
        if (gate) {
          c.viaGate = true;
          c.tx = gate.x; c.ty = gate.y + 26;
          return;
        }
      }
      if (c.task && c.task.kind !== "walk" && Math.hypot(c.tx - c.x, c.ty - c.y) < 110) arrive(c);
      else { c.state = "idle"; c.task = null; }
    }
  } else c.stuckT = 0;
}

// --- helpers ---
function toast(text) { msgEl.textContent = text; toastTimer = 5; }
function canPay(cost) {
  return res.logs >= (cost.logs || 0) && res.doors >= (cost.doors || 0) && res.stone >= (cost.stone || 0) &&
         res.iron >= (cost.iron || 0) && res.seeds >= (cost.seeds || 0) && res.dm - (cost.dm || 0) >= treasuryFloor();
}
function pay(cost) {
  res.logs -= cost.logs || 0; res.doors -= cost.doors || 0; res.stone -= cost.stone || 0;
  res.iron -= cost.iron || 0; res.seeds -= cost.seeds || 0; res.dm -= cost.dm || 0;
}
const costText = c => [c.logs && `${c.logs} logs`, c.doors && `${c.doors} door`, c.stone && `${c.stone} stone`, c.iron && `${c.iron} iron`, c.seeds && `${c.seeds} seeds`, c.dm && `${c.dm} DM`].filter(Boolean).join(", ");

function freeHome() { return buildings.find(b => b.type === "cabin" && !b.site && b.occupants.length < cabinCapacity()) || null; }
function houseCiv(c) {
  const home = freeHome();
  if (!home) return false;
  home.occupants.push(c); c.home = home;
  const partner = home.occupants.find(o => o !== c);
  const provided = partner && (partner.profession === "farmer" || partner.profession === "hunter");
  if (!c.profession && !provided) c.profession = Math.random() < 0.6 ? "farmer" : "hunter";
  return true;
}

function killCiv(c, why) {
  if (!civs.includes(c)) return;
  if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
  corpses.push({ x: c.x, y: c.y, who: c.who, bearer: null,
                 deceased: { name: c.name, age: c.age || 20, profession: c.profession || "no trade",
                             cause: why, year: colonyYear } });
  if (c.profession === "police") policeCount--;
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  if (selected === c) selected = null;
  selGroup = selGroup.filter(s => s !== c);
  civs.splice(civs.indexOf(c), 1);
  SFX.death();
  toast(`${c.name} ${why}. The colony numbers ${civs.length}.`);
  if (civs.length === 0) gameOver();
  syncUI();
}

function eat(c, kind) {
  SFX.eat();
  const heal = Math.min(EAT_HEAL, c.maxHp - c.hp);
  c.hunger = Math.min(100, c.hunger + (kind === "wheat" ? 15 : 35));
  if (heal > 0) { c.hp += heal; float(c.x, c.y - 70, "+" + Math.round(heal), "#7da083"); }
}

// --- input ---
let pauseOpen = false;
function setPause(open) {
  pauseOpen = open;
  $("pauseMenu").style.display = open ? "block" : "none";
  paused = pauseOpen || dlg.open || $("mapOverlay").style.display === "block" ||
           $("settleModal").style.display === "block" || $("empireModal").style.display === "block";
  try { SFX.pauseAll(pauseOpen); } catch (e) {}
}
addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === "r" && WALLLIKE.has(buildMode)) {
    wallRot = wallRot ? 0 : 1;
    toast(`Wall turned ${wallRot ? "upright (north-south)" : "flat (east-west)"}.`);
  }
  if (e.key === "Escape") {
    if ($("settingsPanel").style.display === "block") { $("settingsPanel").style.display = "none"; saveSettings(); }
    else if (buildMode) { buildMode = null; syncUI(); }
    else if (gameState === "playing" || pauseOpen) setPause(!pauseOpen);
  }
});
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const wx = cam.x + mouse.x / zoom, wy = cam.y + mouse.y / zoom;
  zoom = Math.max(0.45, Math.min(2.4, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  cam.x = wx - mouse.x / zoom;
  cam.y = wy - mouse.y / zoom;
}, { passive: false });
canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  buildMode = null; selected = null; selectedBldg = null; selectedCamp = null; selectedGrave = null;
  selGroup = [];
  syncUI();
});

canvas.addEventListener("click", e => {
  if (gameState !== "playing") return;
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.wx = cam.x + mouse.x / zoom; mouse.wy = cam.y + mouse.y / zoom;
  if (paused) return;

  if (buildMode) { tryPlace(buildMode, mouse.wx, mouse.wy); return; }

  for (const v of visitors)
    if (Math.abs(mouse.wx - v.x) < 26 && mouse.wy < v.y && mouse.wy > v.y - CHAR_SIZE) return openDialogue(v);

  // raiders: force units can be ordered onto them
  for (const r of raiders)
    if (Math.abs(mouse.wx - r.x) < 26 && mouse.wy < r.y && mouse.wy > r.y - CHAR_SIZE) {
      if (selected && isForce(selected)) {
        const grp = soldierGroup().filter(isForce);
        for (const s of grp) order(s, { kind: "attack", target: r, x: r.x, y: r.y });
        toast(grp.length > 1 ? `${grp.length} soldiers move to intercept the raider.` : `${selected.name} moves to intercept the raider.`);
      } else toast("Only police or soldiers can be ordered against raiders.");
      return;
    }

  // camps: soldiers can be ordered to sack them
  for (const cp of camps)
    if (Math.abs(mouse.wx - cp.x) < BLDG_SIZE / 2 && mouse.wy < cp.y && mouse.wy > cp.y - BLDG_SIZE) {
      if (selected && (selected.profession === "soldier" || selected.profession === "cavalry") && has("raiding")) {
        const grp = soldierGroup().filter(s => s.profession !== "archer");
        grp.forEach((s, i) => order(s, { kind: "siege", target: cp, x: cp.x + 40 + (i % 3) * 16, y: cp.y + 14 + Math.floor(i / 3) * 14 }));
        toast(grp.length > 1 ? `${grp.length} fighters march on the ${cp.type} camp.` : `${selected.name} marches on the ${cp.type} camp.`);
      } else {
        selectedCamp = cp; selectedBldg = null; selected = null;
        toast(cp.type === "thief" ? "A thief camp. Soldiers could sack it." : "A raider war-camp. Soldiers could sack it — carefully.");
        syncUI();
      }
      return;
    }

  for (const c of civs) {
    if (Math.abs(mouse.wx - c.x) < 24 && mouse.wy < c.y && mouse.wy > c.y - CHAR_SIZE) {
      if (selected && selected !== c && isForce(selected) && c.rebel) {
        const grp = soldierGroup().filter(isForce);
        for (const s of grp) order(s, { kind: "attack", target: c, x: c.x, y: c.y });
        toast(grp.length > 1 ? `${grp.length} soldiers move to put down ${c.name}.` : `${selected.name} moves to put down ${c.name}.`);
        return;
      }
      if (selected === c) {
        selGroup = selGroup.filter(s => s !== c && civs.includes(s));
        selected = selGroup.length ? selGroup[selGroup.length - 1] : null;
        toast(selected ? `${c.name} deselected — ${selGroup.length} soldier(s) still selected.` : `${c.name} deselected.`);
      } else if (groupable(c) && selected && groupable(selected)) {
        // clicking more fighters grows the band
        if (!selGroup.includes(selected)) selGroup = [selected];
        if (!selGroup.includes(c)) selGroup.push(c);
        selected = c; selectedBldg = null; selectedCamp = null;
        toast(`${c.name} joins the selection — ${selGroup.length} soldiers selected.`);
      } else {
        selected = c; selGroup = groupable(c) ? [c] : [];
        selectedBldg = null; selectedCamp = null;
        toast(`${c.name} selected.`);
      }
      syncUI();
      return;
    }
  }

  if (selected) {
    for (const t of nearThings("trees", mouse.wx, mouse.wy, 80))
      if (t.alive && t.growth >= 1 && Math.abs(mouse.wx - t.x) < 26 && mouse.wy < t.y && mouse.wy > t.y - TREE_SIZE) {
        order(selected, { kind: "chop", target: t, x: t.x + 26, y: t.y + 6 });
        toast(`${selected.name} heads out to fell a spruce.`);
        return;
      }
    for (const s of nearThings("stones", mouse.wx, mouse.wy, 80))
      if (s.alive && Math.abs(mouse.wx - s.x) < 26 && mouse.wy < s.y && mouse.wy > s.y - NODE_SIZE) {
        order(selected, { kind: "quarry", target: s, x: s.x + 26, y: s.y + 6 });
        toast(`${selected.name} goes to break stone.`);
        return;
      }
    for (const p of nearThings("patches", mouse.wx, mouse.wy, 60))
      if (p.alive && Math.abs(mouse.wx - p.x) < 20 && mouse.wy < p.y && mouse.wy > p.y - NODE_SIZE) {
        order(selected, { kind: "gather", target: p, x: p.x + 16, y: p.y + 4 });
        toast(`${selected.name} gathers seeds from the wild grass.`);
        return;
      }
    for (const f of farms)
      if (pointInRect(mouse.wx, mouse.wy, bldgRect({ type: "farm", x: f.x, y: f.y }))) {
        if (selected.profession === "farmer") {
          if (f.workers.includes(selected)) {
            f.workers = f.workers.filter(w => w !== selected);
            toast(`${selected.name} no longer tends this farm.`);
          } else {
            f.workers.push(selected);
            toast(`${selected.name} assigned to this farm (${f.workers.length} farmer(s) on it).`);
          }
          syncUI();
        } else if (f.ready) {
          order(selected, { kind: "harvest", target: f, x: f.x, y: f.y + 10 });
          toast(`${selected.name} goes to bring in the crop.`);
        } else { selectedBldg = f; f.type = "farm"; selected = null; syncUI(); }
        return;
      }
    for (const b of buildings)
      if (b.type === "burned" && pointInRect(mouse.wx, mouse.wy, bldgRect(b))) {
        if (!canPay(REPAIR_COST)) {
          toast(`Repair needs ${costText(REPAIR_COST)} in town storage. Stored: ${res.logs} logs, ${res.doors} door(s).`);
          return;
        }
        order(selected, { kind: "repair", target: b, x: b.x, y: b.y + 16 });
        toast(`${selected.name} goes to rebuild the ruin.`);
        return;
      }
  }

  for (const gv of graves)
    if (Math.abs(mouse.wx - gv.x) < 20 && mouse.wy < gv.y + 6 && mouse.wy > gv.y - 40) {
      selectedGrave = selectedGrave === gv ? null : gv;   // click again to lay the panel to rest
      selectedBldg = null; selected = null; selectedCamp = null;
      syncUI();
      return;
    }
  for (const b of buildings)
    if (pointInRect(mouse.wx, mouse.wy, bldgRect(b))) { selectedBldg = b; selected = null; selectedCamp = null; selectedGrave = null; syncUI(); return; }
  for (const f of farms)
    if (pointInRect(mouse.wx, mouse.wy, bldgRect({ type: "farm", x: f.x, y: f.y }))) { selectedBldg = f; f.type = "farm"; selected = null; selectedCamp = null; syncUI(); return; }

  if (selectedGrave) { selectedGrave = null; syncUI(); }
  if (selected) {
    const grp = soldierGroup();
    grp.forEach((s, i) => {
      const ox = grp.length > 1 ? ((i % 3) - 1) * 26 : 0, oy = grp.length > 1 ? Math.floor(i / 3) * 24 : 0;
      order(s, { kind: "walk", x: mouse.wx + ox, y: mouse.wy + oy });
    });
  }
});

// heal anyone wedged inside a footprint — legacy saves, edge cases, anything
let rescueT = 2;
function rescueStuck(dt) {
  rescueT -= dt;
  if (rescueT > 0) return;
  rescueT = 4;
  for (const u of [...civs, ...visitors]) {
    const jail = allStructures().find(b => b.type === "wall" && pointInRect(u.x, u.y, inflate(bldgRect(b), 4)));
    if (jail) {
      const r = bldgRect(jail);
      u.y = r.y + r.h + 16;
      u.x += (u.x < jail.x ? -20 : 20);
      if (u.state === "walking") u.stuckT = 0;
    }
  }
}
const BUILD_TIMES = { cabin: 10, recruit: 12, market: 10, watchtower: 8, bakery: 10, well: 7, forge: 12, townhall: 16,
                      wall: 3, gate: 4, stonewall: 6, stonegate: 8, moat: 6, ditch: 4, farm: 5 };
function finishConstruction(b) {
  b.site = false; b.progress = -1;
  if (!WALLLIKE.has(b.type)) expandAround(b.x, b.y, 1);
  toast(`${BLDG_NAMES[b.type]} raised.${WALLLIKE.has(b.type) ? "" : " The territory grows."}`);
  SFX.build();
  if (b.type === "cabin") for (const c of civs) if (!c.home && houseCiv(c)) toast(`${c.name} moves into the new cabin.`);
}
function evictFromFootprint(b) {
  const r = inflate(bldgRect(b), 10);
  for (const u of [...civs, ...visitors, ...raiders])
    if (pointInRect(u.x, u.y, r)) { u.y = r.y + r.h + 14; u.x += (u.x < b.x ? -18 : 18); }
}
function snapWallPos(type, wx, wy) {
  if (!WALLLIKE.has(type)) return [wx, wy];
  let best = null, bd = 110;
  for (const b of buildings) {
    if (!WALLLIKE.has(b.type)) continue;
    if ((b.rot || 0) !== wallRot) continue;
    const d = Math.hypot(b.x - wx, b.y - wy);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) {
    const span = (SMALL_BLDG[best.type] + SMALL_BLDG[type]) / 2 - 12;   // deep overlap: sprite margins never show a gap
    if (wallRot) return [best.x, best.y + (wy > best.y ? span : -span)];
    return [best.x + (wx > best.x ? span : -span), best.y];
  }
  // no same-orientation neighbour: corner onto a perpendicular one
  let perp = null, pd = 96;
  for (const b of buildings) {
    if (!WALLLIKE.has(b.type)) continue;
    if ((b.rot || 0) === wallRot) continue;
    const d = Math.hypot(b.x - wx, b.y - wy);
    if (d < pd) { pd = d; perp = b; }
  }
  if (!perp) return [wx, wy];
  const Ln = SMALL_BLDG[perp.type], Ls = SMALL_BLDG[type];
  if (wallRot) {
    // placing upright against a flat run: hug its end, rising above or hanging below the line
    const x = perp.x + (wx > perp.x ? 1 : -1) * (Ln / 2 + 8);
    const y = wy < perp.y - 10 ? perp.y : perp.y + Ls - 20;
    return [x, y];
  }
  // placing flat against an upright column: butt against its side, at its foot or head
  const x = perp.x + (wx > perp.x ? 1 : -1) * (Ls / 2 + 8);
  const y = wy < perp.y - Ln / 2 ? perp.y - Ln + 20 : perp.y;
  return [x, y];
}
function tryPlace(type, wx, wy) {
  if (type === "forge" && !has("forging")) { toast("A forge requires the Forging technology."); buildMode = null; syncUI(); return; }
  if ((type === "wall" || type === "gate") && !has("defending")) { toast("Walls and gates require the Defending technology."); buildMode = null; syncUI(); return; }
  if (type === "townhall" && !has("township")) { toast("A town hall requires the Township technology."); buildMode = null; syncUI(); return; }
  if (["stonewall", "stonegate", "moat", "ditch"].includes(type) && !has("defplus")) { toast("Stoneworks and earthworks require Defending II."); buildMode = null; syncUI(); return; }
  if (type === "townhall" && buildings.some(b => b.type === "townhall")) { toast("The settlement has its town hall already."); buildMode = null; syncUI(); return; }
  [wx, wy] = snapWallPos(type, wx, wy);
  const cost = costOf(type);
  if (WALLLIKE.has(type)) {
    for (const cp of camps) if (Math.hypot(cp.x - wx, cp.y - wy) < 520) { toast("Too close to an enemy camp — the raiders would never let it stand."); return; }
  }
  if (!canPay(cost)) { toast(`Not enough materials: needs ${costText(cost)}.`); return; }
  if (!legalToBuild(type, wx, wy)) { toast(inTerritory(wx, wy) ? "Cannot build there — too close to another building, its entrance, or an obstacle."
                             : "That land is outside your territory. Build and grow to claim more."); return; }
  pay(cost);
  SFX.build();
  if (type === "sapling") {
    const [cx, cy] = chunkOf(wx, wy);
    getChunk(cx, cy).trees.push({ x: wx, y: wy, alive: true, progress: -1, growth: 0 });
    markChunkDirty(wx, wy);
    toast("Spruce sapling planted.");
  } else if (type === "farm") {
    farms.push({ x: wx, y: wy, ready: false, growT: 0, workers: [], progress: -1, site: true, buildP: 0 });
    evictFromFootprint({ type: "farm", x: wx, y: wy });
    expandAround(wx, wy, 1);
    toast("Farm staked out — a civilian will come and build it.");
  } else {
    const b = { type, x: wx, y: wy, progress: -1, occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0 };
    if (type === "wall") { b.hp = b.maxHp = 100; }
    if (type === "gate") { b.hp = b.maxHp = 60; }
    if (type === "stonewall") { b.hp = b.maxHp = 220; }
    if (type === "stonegate") { b.hp = b.maxHp = 140; }
    if (WALLLIKE.has(type)) b.rot = wallRot;
    b.site = true; b.buildP = 0;
    buildings.push(b);
    evictFromFootprint(b);
    toast(`${BLDG_NAMES[type]} staked out — a civilian will come and raise it.`);
  }
  buildMode = null;
  syncUI();
}

// --- orders ---
function order(c, task) {
  if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
  c.task = task; c.tx = task.x; c.ty = task.y;
  c.state = "walking"; c.workT = 0;
  c.path = null; c.viaGate = false; c.replanned = false;
  if (c.isCiv && task.kind !== "attack" && lineBlocked(c.x, c.y, task.x, task.y)) {
    const route = findPath(c.x, c.y, task.x, task.y);
    if (route && route.length) { c.path = route; c.tx = route[0][0]; c.ty = route[0][1]; }
  }
}

function arrive(c) {
  const t = c.task;
  if (t && t.kind === "emigrate") { emigrate(c); return; }
  if (t && t.kind === "goHome") { c.state = "sleeping"; c.task = null; return; }
  if (t && t.kind === "warmUp") { c.state = "warming"; c.workT = 0; c.task = null; return; }
  if (!t || t.kind === "walk") { c.state = "idle"; c.task = null; return; }
  const simple = { chop: "chopping", quarry: "quarrying", gather: "gathering", craft: "crafting",
                   buildFarm: "buildingFarm", harvest: "harvesting", sell: "selling", hunt: "hunting", smith: "smithing", trade: "trading", peddle: "peddling", hallDeposit: "depositing", shopBuy: "shopping", construct: "raising", gravestone: "masonry" };
  if (t.kind === "bury") {
    const cp = t.target;
    if (!corpses.includes(cp)) { c.state = "idle"; c.task = null; return; }
    if (!t.phase) {
      // shoulder the body, then walk it to open ground
      cp.carried = c;
      t.phase = 2;
      let gx, gy;
      // the colony buries its dead together: rows beside the first grave
      if (graves.length) {
        const a0 = graves[0];
        for (let i = graves.length; i < graves.length + 40 && gx === undefined; i++) {
          const x = a0.x + (i % 5) * 36, y = a0.y + Math.floor(i / 5) * 42;
          if (legalToBuild("sapling", x, y) && !graves.some(g2 => Math.hypot(g2.x - x, g2.y - y) < 24)) { gx = x; gy = y; }
        }
      }
      if (gx === undefined) {
        gx = cp.x; gy = cp.y;
        for (let r = 90; r < 500; r += 40) {
          let found = false;
          for (let a = 0; a < 6.28; a += 0.5) {
            const x = cp.x + Math.cos(a) * r, y = cp.y + Math.sin(a) * r;
            if (legalToBuild("sapling", x, y)) { gx = x; gy = y; found = true; break; }
          }
          if (found) break;
        }
      }
      t.gx = gx; t.gy = gy;
      c.tx = gx; c.ty = gy;
      c.state = "walking";
      return;
    }
    c.state = "digging"; c.workT = 0;
    return;
  }
  if (t.kind === "repair") {
    if (!canPay(REPAIR_COST)) { toast("Materials gone — repair cancelled."); c.state = "idle"; c.task = null; return; }
    pay(REPAIR_COST);
    c.state = "repairing"; c.workT = 0;
  } else if (t.kind === "attack") {
    c.state = "fighting"; c.workT = 0;
  } else if (t.kind === "siege") {
    if (!camps.includes(t.target)) { c.state = "idle"; c.task = null; return; }
    c.state = "sieging"; c.workT = 0;
  } else if (t.kind === "torch") {
    if (!buildings.includes(t.target) || t.target.fire) { c.state = "idle"; c.task = null; return; }
    c.state = "torching"; c.workT = 0;
  } else if (simple[t.kind]) {
    if ((t.kind === "chop" || t.kind === "quarry" || t.kind === "gather") && !t.target.alive) { c.state = "idle"; c.task = null; return; }
    c.state = simple[t.kind]; c.workT = 0;
    if (t.target && t.target.x !== undefined) c.facing = t.target.x < c.x ? -1 : 1;
  }
}

// --- autonomy ---
function wander(c, base, minD, maxD) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
    const x = base.x + Math.cos(a) * d, y = base.y + Math.sin(a) * d;
    if (inTerritory(x, y)) { order(c, { kind: "walk", x, y }); return true; }
  }
  return false;
}
function autonomy(c, dt) {
  c.autoT -= dt;
  if (c.autoT > 0 || c.state !== "idle" || c.rebel) return;
  c.autoT = 4 + Math.random() * 5;

  if (c.hunger < 60) {
    if (c.inv.bread > 0) { c.inv.bread--; eat(c, "bread"); return; }
    if (c.inv.meat > 0) { c.inv.meat--; eat(c, "meat"); return; }
    if (c.inv.wheat > 0) { c.inv.wheat--; eat(c, "wheat"); return; }
    if (res.bread > 0 && c.home) { res.bread--; eat(c, "bread"); return; }
    if (res.meat > 0 && c.home) { res.meat--; eat(c, "meat"); return; }
  }
  if (c.child) {
    if (Math.random() < 0.7) wander(c, c.home || c, 40, 130);   // children actually play
    return;
  }

  const shopF = buildings.find(b => b.type === "forge" && !b.fire && !b.site && (b.shop || []).length);
  if (shopF && c.profession !== "blacksmith") {
    const wantsTool = !c.tool && c.inv.dm >= TOOL_PRICE_SELF && shopF.shop.some(i => i.kind === "tool");
    const mayArm = laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter") || isForce(c);
    const wantsWeapon = mayArm && !c.armed && c.inv.dm >= 12 && shopF.shop.some(i => i.kind === "weapon");
    if (wantsTool || wantsWeapon) {
      order(c, { kind: "shopBuy", target: shopF, x: shopF.x + 30, y: shopF.y + 14 });
      return;
    }
  }

  if (!c.home) return;

  // construction first: staked-out sites need hands
  const site = buildings.find(b => b.site && (!b.builder || !civs.includes(b.builder))) ||
               farms.find(f => f.site && (!f.builder || !civs.includes(f.builder)));
  if (site && !isForce(c)) {
    site.builder = c;
    order(c, { kind: "construct", target: site, x: site.x + 20, y: site.y + 14 });
    return;
  }

  // the town hall takes deposits without being asked — unload before new work.
  // settlement folk stock their own town's stores at their cabin instead.
  const myTown = c.home && townOf(c.home);
  const hall = buildings.find(b => b.type === "townhall" && !b.fire && !b.site);
  if ((myTown || hall) && (c.inv.logs + c.inv.seeds + c.inv.stone + c.inv.iron + c.inv.wheat) >= 5) {
    const dst = myTown ? c.home : hall;
    order(c, { kind: "hallDeposit", target: dst, x: dst.x, y: dst.y + 16 });
    return;
  }

  if (c.profession === "blacksmith" && has("forging") && forgeBuilt()) {
    const shopForge = buildings.find(b => b.type === "forge" && !b.fire && !b.site);
    const stock = (shopForge && shopForge.shop) || [];
    const toolsOnSale = stock.filter(i => i.kind === "tool").length;
    const iron = weaponIron();
    const wantTool = toolsOnSale <= Math.min(3, res.weapons) || !canForgeWeapons();
    if (wantTool && res.iron >= 1 && res.stone >= 1 && res.logs >= 1 && toolsOnSale < 3) {
      res.iron--; res.stone--; res.logs--;
      order(c, { kind: "smith", make: "tool", x: c.x, y: c.y });
      return;
    }
    if (canForgeWeapons() && res.iron >= iron && res.stone >= 1 && res.logs >= 1 && res.weapons < 3) {
      res.iron -= iron; res.stone--; res.logs--;
      order(c, { kind: "smith", make: "weapon", x: c.x, y: c.y });
      return;
    }
  }

  if (res.seeds < farmSeedCost() * 2 && !["lumberjack", "quarryman", "forager"].includes(c.profession)) {
    const p = nearThings("patches", c.x, c.y, laws.freeRoam ? 800 : 450)
      .filter(p => p.alive && (laws.freeRoam || nearTerritory(p.x, p.y)))[0];
    if (p) { order(c, { kind: "gather", target: p, forColony: true, x: p.x + 16, y: p.y + 4 }); return; }
  }

  const home = c.home;
  const homeFarms = farms.filter(f => Math.hypot(f.x - home.x, f.y - home.y) < 220).length;
  const wantsFarm = homeFarms === 0 || (c.profession === "farmer" && homeFarms < 2);
  if (wantsFarm && canPay(costOf("farm"))) {
    for (const r of [90, 120, 150]) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const fx = home.x + Math.cos(a) * r, fy = home.y + Math.sin(a) * r * 0.8;
      if (legalToBuild("farm", fx, fy)) {
        pay(costOf("farm"));
        order(c, { kind: "buildFarm", x: fx, y: fy + 8, fx, fy });
        return;
      }
    }
  }

  if (c.profession === "farmer") {
    // a farmer tends only the farms they are assigned to — no one else's
    const mine = farms.find(f => f.ready && f.workers.includes(c));
    if (mine) { order(c, { kind: "harvest", target: mine, x: mine.x, y: mine.y + 10 }); return; }
  }
  // township trades keep the stores fed without orders
  if (c.profession === "lumberjack" && (c.inv.logs || 0) < 10) {
    const tr = nearThings("trees", c.x, c.y, laws.freeRoam ? 800 : 500)
      .filter(t2 => t2.alive && t2.growth >= 1 && (laws.freeRoam || nearTerritory(t2.x, t2.y)))[0];
    if (tr) { order(c, { kind: "chop", target: tr, x: tr.x + 26, y: tr.y + 6 }); return; }
  }
  if (c.profession === "quarryman" && (c.inv.stone || 0) < 9) {
    const rk = nearThings("stones", c.x, c.y, laws.freeRoam ? 900 : 600)
      .filter(st => st.alive && (laws.freeRoam || nearTerritory(st.x, st.y)))[0];
    if (rk) { order(c, { kind: "quarry", target: rk, x: rk.x + 26, y: rk.y + 6 }); return; }
  }
  if (c.profession === "forager" && (c.inv.seeds || 0) < 8) {
    const pt = nearThings("patches", c.x, c.y, laws.freeRoam ? 800 : 500)
      .filter(p2 => p2.alive && (laws.freeRoam || nearTerritory(p2.x, p2.y)))[0];
    if (pt) { order(c, { kind: "gather", target: pt, x: pt.x + 16, y: pt.y + 4 }); return; }
  }
  if (c.profession === "hunter" && c.inv.meat < 2) {
    if (laws.freeRoam) {
      const a = Math.random() * Math.PI * 2;
      order(c, { kind: "hunt", x: c.x + Math.cos(a) * 350, y: c.y + Math.sin(a) * 350 });
    } else {
      // keep to the town borders
      const cells = [...territory];
      const [cx2, cy2] = cells[Math.floor(Math.random() * cells.length)].split(",").map(Number);
      order(c, { kind: "hunt", x: cx2 * TCELL + TCELL / 2 + (Math.random() * 80 - 40), y: cy2 * TCELL + TCELL / 2 + (Math.random() * 80 - 40) });
    }
    return;
  }
  // a waiting traveller pays better than the market stall
  const v = visitors.find(v => v.state === "waiting" && !v.traded && Math.hypot(v.x - c.x, v.y - c.y) < 700);
  if (v && (c.inv.bread + c.inv.meat) > 1) {
    order(c, { kind: "trade", target: v, x: v.x + 22, y: v.y + 8 });
    return;
  }
  // neighbours trade among themselves: full larders sell to hungry purses
  const buyer = civs.find(o => o !== c && !o.rebel && o.state !== "sleeping" && o.inv.dm >= 2 &&
                               (o.inv.bread + o.inv.meat + o.inv.wheat) === 0 &&
                               Math.hypot(o.x - c.x, o.y - c.y) < 500);
  if (buyer && (c.inv.bread + c.inv.meat) > 1) {
    order(c, { kind: "peddle", target: buyer, x: buyer.x + 18, y: buyer.y + 6 });
    return;
  }
  const market = buildings.find(b => b.type === "market" && !b.fire && !b.site);
  if (market && (c.inv.bread + c.inv.meat) > 1) {
    order(c, { kind: "sell", target: market, x: market.x, y: market.y + 16 });
    return;
  }
  // work done — now the dead: a bearer carries the body, a mason raises the stone
  const corpse = corpses.find(cp => !cp.bearer || !civs.includes(cp.bearer));
  if (corpse && !isForce(c)) {
    corpse.bearer = c;
    order(c, { kind: "bury", target: corpse, x: corpse.x, y: corpse.y + 6 });
    return;
  }
  const bareGrave = graves.find(gv => !gv.stone && (!gv.mason || !civs.includes(gv.mason)) && gv.mason !== c);
  if (bareGrave && !isForce(c)) {
    if (c.inv.stone >= 1 || res.stone >= 1) {
      bareGrave.mason = c;
      order(c, { kind: "gravestone", target: bareGrave, x: bareGrave.x, y: bareGrave.y + 10 });
      return;
    }
    const rock = nearThings("stones", c.x, c.y, 800).filter(st => st.alive)[0];
    if (rock) { order(c, { kind: "quarry", target: rock, x: rock.x + 26, y: rock.y + 6 }); return; }
  }

  // nothing pressing: stretch the legs, visit a neighbour, look busy
  if (Math.random() < 0.55) wander(c, c.home || c, 60, 180);
}

// --- happiness & rebellion ---
function happinessTarget(c) {
  let t = 78 - taxRate * 6
        - (laws.forced ? 20 : 0)
        - (has("slavemarket") ? 8 : 0)
        + (has("taming") ? 3 : 0) + (has("pets") ? 4 : 0) + (has("pettoys") ? 4 : 0)
        + Math.min(2, buildings.filter(b => b.type === "well" && !b.fire && !b.site).length) * 3;
  if (c.hunger > 60) t += 4;
  if (c.hunger < 30) t -= 12;
  if (!c.home) t -= 8;
  return Math.max(0, Math.min(100, t));
}

function maybeRebel(c) {
  if (c.rebel || isForce(c) || c.child || civs.length < 2) return;
  if (c.happiness < 25 && Math.random() < 0.08) {
    c.rebel = true;
    const lawAllows = laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter");
    if (lawAllows && forgeBuilt() && res.weapons > 0) { res.weapons--; c.armed = true; }
    c.task = null; c.state = "idle";
    toast(`⚠ ${c.name} has turned against the colony${c.armed ? " — and took a weapon" : ""}!`);
  }
}

function rebelAI(c) {
  if (c.state !== "idle") return;
  const targets = buildings.filter(b => b.type !== "burned" && !b.fire &&
                                        b.type !== "stonewall" && b.type !== "stonegate");
  if (targets.length && Math.random() < 0.6) {
    let best = targets[0], bd = Infinity;
    for (const b of targets) { const d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } }
    order(c, { kind: "torch", target: best, x: best.x, y: best.y + 14 });
  } else {
    const prey = civs.filter(o => o !== c && !o.rebel && o.state !== "sleeping" && o.state !== "warming");
    if (prey.length) {
      const p = prey[Math.floor(Math.random() * prey.length)];
      order(c, { kind: "attack", target: p, x: p.x, y: p.y });
    }
  }
}

function forceAI(c) {
  if (c.state !== "idle") return;
  // arm up from the armoury once Defending is known (archers carry their own bows)
  if (c.profession !== "archer" && !c.armed && has("defending") && forgeBuilt() && res.weapons > 0) {
    res.weapons--; c.armed = true;
    toast(`${c.name} takes a weapon at the forge.`);
  }
  const range = 450 + (has("guarddogs") ? 250 : 0);
  let best = null, bd = range;
  for (const r of civs) if (r.rebel) {
    const d = Math.hypot(r.x - c.x, r.y - c.y);
    if (d < bd) { bd = d; best = r; }
  }
  for (const r of raiders) {
    const d = Math.hypot(r.x - c.x, r.y - c.y);
    if (d < bd) { bd = d; best = r; }
  }
  if (best) { order(c, { kind: "attack", target: best, x: best.x, y: best.y }); return; }
  // no threats: soldiers see the dead to their rest before walking the beat
  if (c.profession === "soldier") {
    const corpse = corpses.find(cp => !cp.bearer || !civs.includes(cp.bearer));
    if (corpse) {
      corpse.bearer = c;
      order(c, { kind: "bury", target: corpse, x: corpse.x, y: corpse.y + 6 });
      return;
    }
    const bareGrave = graves.find(gv => !gv.stone && (!gv.mason || !civs.includes(gv.mason)) && gv.mason !== c);
    if (bareGrave && (c.inv.stone >= 1 || res.stone >= 1)) {
      bareGrave.mason = c;
      order(c, { kind: "gravestone", target: bareGrave, x: bareGrave.x, y: bareGrave.y + 10 });
      return;
    }
  }
  // no trouble: walk the beat along the borders
  c.patrolT = (c.patrolT || 0) - 1 / 60;
  if (c.patrolT <= 0) {
    c.patrolT = 6 + Math.random() * 8;
    const cells = [...territory];
    if (cells.length) {
      const [cx2, cy2] = cells[Math.floor(Math.random() * cells.length)].split(",").map(Number);
      order(c, { kind: "walk", x: cx2 * TCELL + TCELL / 2, y: cy2 * TCELL + TCELL / 2 });
    }
  }
}

// --- torching / fire ---
function igniteCheck(b, dt) {
  if (!b.fire) return;
  b.fire -= dt;
  if (b.fire <= 0) {
    b.fire = 0;
    for (const o of b.occupants) {
      o.home = null;
      if (o.state === "sleeping" || o.state === "warming") { o.state = "idle"; o.x = b.x + (Math.random() * 40 - 20); o.y = b.y + 24; }
    }
    b.occupants = [];
    if (b.type === "cabin") { b.type = "burned"; toast("A cabin has burned to a charred ruin. It can be repaired by order."); }
    else { buildings.splice(buildings.indexOf(b), 1); toast(`The ${BLDG_NAMES[b.type] || b.type} has burned to the ground.`); }
    if (selectedBldg === b) selectedBldg = null;
    syncUI();
  }
}

// --- visitors & dialogue ---
function spawnVisitor() {
  const center = buildings.find(b => b.type === "recruit" && !b.fire && !b.site);
  if (!center) return;
  const a = Math.random() * Math.PI * 2;
  const gender = Math.random() < 0.35 ? "f" : "m";
  visitors.push({
    id: ++visitorSeq, name: nextName(gender), gender,
    face: gender === "f" ? "hunter_face_c" : (Math.random() < 0.5 ? "hunter_face_a" : "hunter_face_b"),
    x: center.x + Math.cos(a) * 700, y: center.y + Math.sin(a) * 700,
    tx: center.x + 60, ty: center.y + 20,
    state: "walking", anim: 0, facing: 1, waitT: 75, meter: null, leaving: false, used: new Set(),
  });
  toast("A hunter approaches the recruitment center. Click him to talk.");
}

function updateVisitor(v, dt) {
  if (v.state === "walking") {
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 5) {
      if (v.leaving) { visitors.splice(visitors.indexOf(v), 1); usedNames.delete(v.name); return; }
      v.state = "waiting";
    } else {
      v.x += (dx / d) * BASE_WALK * 0.8 * dt; v.y += (dy / d) * BASE_WALK * 0.8 * dt;
      v.facing = dx < 0 ? -1 : 1; v.anim += dt * 8;
    }
  } else if (v.state === "waiting") {
    v.anim = 1; v.waitT -= dt;
    if (v.waitT <= 0) sendAway(v, "The hunter grew tired of waiting and slipped back into the woods.");
  }
}

function sendAway(v, text) {
  v.leaving = true; v.state = "walking";
  v.tx = v.x + (Math.random() < 0.5 ? -900 : 900); v.ty = v.y + 200;
  if (text) toast(text);
}

const dlg = { open: false, visitor: null, talk: null };
const DLG_OPTIONS = [
  { text: "\"We fled Hamburg with nothing. Help us build something honest.\"", d: +14 },
  { text: "\"There is a warm cabin and a certificate with your name on it.\"", d: +12 },
  { text: "Offer him fresh bread from the town storage. (1 bread)", d: +18, needs: () => res.bread >= 1, use: () => res.bread-- },
  { text: "Offer him a cut of meat from the town storage. (1 meat)", d: +16, needs: () => res.meat >= 1, use: () => res.meat-- },
  { text: "\"Our taxes are fair. A man keeps what he earns here.\"", d: 0, dyn: () => (taxRate <= 2 ? +15 : -14) },
  { text: "\"The forest here is rich with game. A hunter would eat well.\"", d: +10 },
  { text: "\"Join us or starve alone out there. Your choice.\"", d: -20 },
  { text: "\"We could use another back to break for the colony.\"", d: -8 },
  { text: "Say nothing and slide a Deutsche Mark under the slot. (5 DM)", d: +9, needs: () => res.dm >= 5, use: () => res.dm -= 5 },
  { text: "\"Winter is coming. Alone, it will bury you.\"", d: +8 },
  { text: "\"We have a market — your pelts would fetch real coin.\"", d: 0, dyn: () => buildings.some(b => b.type === "market") ? +13 : -10 },
];

function openTalk(talk) {
  dlg.open = true; dlg.talk = talk; paused = true;
  $("dlgFace").src = `assets/sprites/ui/${talk.face}.png`;
  $("dlgName").textContent = talk.title;
  $("dlgText").textContent = talk.opening;
  $("dialogue").style.display = "block";
  renderDialogueOptions();
}
function openDialogue(v) {
  dlg.visitor = v;
  if (v.meter === null) v.meter = Math.max(10, 55 - taxRate * 3.5) + (v.goodwill || 0);
  openTalk({
    face: v.face,
    title: `${v.name}, wandering ${v.gender === "f" ? "huntress" : "hunter"}`,
    opening: "The hunter eyes the barred window and the little slot beneath it. \"So. What is this place, then?\"",
    pool: DLG_OPTIONS,
    used: v.used,
    get meter() { return v.meter; }, set meter(x) { v.meter = x; },
    onWin: () => joinColony(v),
    onLose: () => rejectColony(v),
  });
}

function renderDialogueOptions() {
  const talk = dlg.talk;
  $("dlgMeter").style.width = talk.meter + "%";
  const opts = $("dlgOpts");
  opts.innerHTML = "";
  const pool = talk.pool.filter(o => !talk.used.has(o.text) && (!o.needs || o.needs()));
  if (!pool.length) return talk.meter >= 60 ? talk.onWin() : talk.onLose();
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  for (const o of picks) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = o.text;
    b.addEventListener("click", () => {
      talk.used.add(o.text);
      if (o.use) o.use();
      const delta = (o.dyn ? o.dyn() : o.d) + (Math.random() * 6 - 3);
      talk.meter = Math.max(0, Math.min(100, talk.meter + delta));
      $("dlgMeter").style.width = talk.meter + "%";
      if (talk.meter >= 100) return talk.onWin();
      if (talk.meter <= 0) return talk.onLose();
      $("dlgText").textContent = delta >= 8 ? "A slow nod. You are getting through." :
                                 delta >= 0 ? "A grunt, noncommittal. But the door stays open." :
                                 "Eyes narrow. That was the wrong thing to say.";
      renderDialogueOptions();
    });
    opts.appendChild(b);
  }
}

function closeDialogue() { dlg.open = false; dlg.visitor = null; dlg.talk = null; setPause(pauseOpen); $("dialogue").style.display = "none"; }

function joinColony(v) {
  visitors.splice(visitors.indexOf(v), 1);
  closeDialogue();
  const c = mkCiv(v.name, "hunter", v.x, v.y, v.gender);
  c.inv.dm = 5 + Math.floor(Math.random() * 6);   // wanderers arrive with 5-10 DM
  c.profession = "hunter";
  refreshAvatar(c);
  civs.push(c);
  expandFrontier(3);
  const housed = houseCiv(c);
  vignette("firstRecruit");
  toast(`${v.name} signs on — a civilian certificate slides out through the slot. ` +
        (housed ? `${v.gender === "f" ? "She" : "He"} moves into a cabin and will pay taxes.` : `Build ${v.gender === "f" ? "her" : "him"} a cabin: no taxes until there is a roof.`));
  syncUI();
}
function rejectColony(v) { closeDialogue(); sendAway(v, `${v.name} shakes his head and returns to his hunting grounds.`); }

// --- tech research ---
function techAvailable(t) { return !t.done && t.req.every(r => TECH[r].done) && (!research || research.id !== t.id); }
function startResearch(id) {
  const t = TECH[id];
  if (research) return toast("The scholars are already busy.");
  if (!t.req.every(r => TECH[r].done)) return toast("Its prerequisites are not yet known.");
  const cost = techCost(t);
  if (res.dm - cost < treasuryFloor()) return toast(`Research costs ${cost} DM. Treasury: ${res.dm} DM.`);
  res.dm -= cost;
  research = { id, t: 0 };
  toast(`Research begun: ${t.name} (${Math.round(techTime(t) / 60 * 10) / 10} min).`);
  renderTech(); syncUI();
}
function updateResearch(dt) {
  if (!research) return;
  research.t += dt;
  const t = TECH[research.id];
  if (research.t >= techTime(t)) {
    t.done = true;
    SFX.research();
    toast(`Research complete: ${t.name} — ${t.desc}.`);
    research = null;
    if (TECH.slavery.done) $("lawForcedRow").style.display = "flex";
    if ((t.id === "defending" || t.id === "raiding") && camps.length === 0) {
      spawnCamps(1);
      toast(`Research complete: ${t.name}. Word spreads of your colony's strength — thief and raid camps stir in the deep woods.`);
    }
    renderTech(); syncUI();
  }
}
const NODE_W = 118, NODE_H = 42, COL_W = 148, ROW_H = 62;
function renderTech() {
  const list = $("techList");
  const nodes = Object.values(TECH).filter(t => t.tree === techTab);
  // layered layout: column = depth, row = order within depth (parents pull children toward them)
  const byDepth = new Map();
  for (const t of nodes) {
    if (!byDepth.has(t.depth)) byDepth.set(t.depth, []);
    byDepth.get(t.depth).push(t);
  }
  const pos = new Map();
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  for (const d of depths) {
    const col = byDepth.get(d);
    col.sort((a, b) => {
      const key = t => {
        const ps = t.req.map(r => pos.get(r)).filter(Boolean);
        return ps.length ? ps.reduce((s, p) => s + p.row, 0) / ps.length : 99;
      };
      return key(a) - key(b);
    });
    col.forEach((t, i) => pos.set(t.id, { col: d, row: i }));
  }
  const maxRow = Math.max(...[...pos.values()].map(p => p.row));
  const W = (depths[depths.length - 1] + 1) * COL_W + 30, H = (maxRow + 1) * ROW_H + 30;
  const cx = t => 20 + pos.get(t.id).col * COL_W;
  const cy = t => 20 + pos.get(t.id).row * ROW_H;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (const t of nodes) for (const r of t.req) {
    if (!pos.has(r)) continue;   // cross-tree requirement (e.g. War Horse): note it in the tooltip instead
    const p = TECH[r];
    const x1 = cx(p) + NODE_W, y1 = cy(p) + NODE_H / 2, x2 = cx(t), y2 = cy(t) + NODE_H / 2;
    svg += `<path class="tlink" d="M${x1},${y1} C${x1 + 24},${y1} ${x2 - 24},${y2} ${x2},${y2}"/>`;
  }
  for (const t of nodes) {
    const researching = research && research.id === t.id;
    const cls = t.done ? "done" : researching ? "researching" : techAvailable(t) ? "avail" : "locked";
    const sub = t.done ? "researched" : researching ? Math.round(research.t / techTime(t) * 100) + "%" :
                `${techCost(t)} DM · ${Math.round(techTime(t) / 6) / 10} min`;
    svg += `<g class="tnode ${cls}" data-tech="${t.id}">
      <rect x="${cx(t)}" y="${cy(t)}" width="${NODE_W}" height="${NODE_H}" rx="9"/>
      <text x="${cx(t) + NODE_W / 2}" y="${cy(t) + 17}" text-anchor="middle">${t.name}${t.done ? " ✓" : ""}</text>
      <text class="sub" x="${cx(t) + NODE_W / 2}" y="${cy(t) + 31}" text-anchor="middle">${sub}</text>
    </g>`;
  }
  svg += "</svg>";
  list.innerHTML = svg;
  list.querySelectorAll(".tnode").forEach(g => {
    const t = TECH[g.dataset.tech];
    g.addEventListener("click", () => { if (techAvailable(t)) startResearch(t.id); else describeTech(t); });
    g.addEventListener("mouseenter", () => describeTech(t));
  });
}
function describeTech(t) {
  const req = t.req.length ? ` — needs ${t.req.map(r => TECH[r].name + (TECH[r].done ? " ✓" : "")).join(", ")}` : "";
  $("techDesc").textContent = `${t.name}: ${t.desc}${req}`;
}

// --- UI wiring ---
$("buildToggle").addEventListener("click", () => $("buildDrop").classList.toggle("open"));
$("craftToggle").addEventListener("click", () => $("craftDrop").classList.toggle("open"));
$("recruitToggle").addEventListener("click", () => $("recruitDrop").classList.toggle("open"));
$("moveToggle").addEventListener("click", () => $("moveDrop").classList.toggle("open"));
// move a civilian to another town (or back to the capital) any time after founding
const cabinCap = () => has("landownership") ? 3 : 1;
function townOf(b) { return settlements.find(s => s.x !== undefined && Math.hypot(b.x - s.x, b.y - s.y) < 500) || null; }
function ledgerOf(c) {   // where this civ's goods belong: their town's stores, or the capital's
  const t = c.home && townOf(c.home);
  if (!t) return res;
  t.res = t.res || {};
  for (const k of ["logs", "seeds", "stone", "iron", "wheat", "bread", "meat", "dm", "doors", "weapons"]) t.res[k] = t.res[k] || 0;
  return t.res;
}
function sendToTown(c, target) {   // target: settlement object, or null for the capital
  const cab = buildings.find(b => b.type === "cabin" && !b.fire && !b.site &&
                                  b.occupants.length < cabinCap() &&
                                  (target ? Math.hypot(b.x - target.x, b.y - target.y) < 500 : !townOf(b)));
  if (!cab) return toast(`No roof free in ${target ? target.name : settlementName} — build a cabin there first.`);
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  c.home = cab; cab.occupants.push(c);
  order(c, { kind: "walk", x: cab.x - 30 + Math.random() * 60, y: cab.y + 34 });
  toast(`${c.name} sets out to live in ${target ? target.name : settlementName}.`);
  syncUI();
}
$("civToggle").addEventListener("click", () => $("civDrop").classList.toggle("open"));
document.querySelectorAll("#buildMenu .menu-item").forEach(item =>
  item.addEventListener("click", () => {
    buildMode = item.dataset.build;
    $("buildDrop").classList.remove("open");
    toast(buildMode === "wall" || buildMode === "gate"
      ? "Click to place. R rotates the segment. Right-click or Esc to cancel."
      : "Click the map to place. Right-click or Esc to cancel.");
    syncUI();
  }));
document.querySelectorAll("#craftMenu .menu-item").forEach(item =>
  item.addEventListener("click", () => {
    $("craftDrop").classList.remove("open");
    if (item.dataset.craft === "door") {
      if (!selected) return toast("Select a civilian first.");
      if (res.logs < doorCost()) return toast(`A door takes ${doorCost()} logs in storage. Stored: ${res.logs}.`);
      res.logs -= doorCost();
      order(selected, { kind: "craft", x: selected.x, y: selected.y });
      toast(`${selected.name} starts hewing a door.`);
    }
  }));
document.querySelectorAll("#recruitMenu .menu-item").forEach(item =>
  item.addEventListener("click", () => {
    $("recruitDrop").classList.remove("open");
    if (!selected) return;
    if (selected.child) return toast(`${selected.name} is a child — give them a few more springs.`);
    const prof = item.dataset.prof;
    const dropPolice = () => { if (selected.profession === "police") policeCount--; };
    if (prof === "police") {
      if (!has("policing")) return toast("Recruiting police requires the Policing technology.");
      if (res.dm - POLICE_COST < treasuryFloor()) return toast(`An officer costs ${POLICE_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may join the police.");
      if (selected.profession === "police") return toast(`${selected.name} already serves.`);
      res.dm -= POLICE_COST;
      selected.profession = "police"; policeCount++;
      selected.maxHp = 100 + (has("petarmour") ? 25 : 0) + (has("cavalry") ? 50 : 0);
      toast(`${selected.name} joins the police force of the colony.`);
    } else if (prof === "soldier") {
      if (!has("raiding")) return toast("Soldiers require the Raiding technology.");
      if (res.dm - SOLDIER_COST < treasuryFloor()) return toast(`A soldier costs ${SOLDIER_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may soldier.");
      if (selected.profession === "soldier") return toast(`${selected.name} already soldiers for the colony.`);
      res.dm -= SOLDIER_COST;
      dropPolice();
      selected.profession = "soldier";
      selected.maxHp = 130 + (has("cavalry") ? 50 : 0);
      selected.hp = Math.min(selected.hp + 30, selected.maxHp);
      toast(`${selected.name} takes the colony's coin as a soldier. Click a camp to send them raiding.`);
    } else if (prof === "archer") {
      if (!has("archery")) return toast("Archers require the Archery technology.");
      if (res.dm - ARCHER_COST < treasuryFloor()) return toast(`An archer costs ${ARCHER_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may take up the bow.");
      if (selected.profession === "archer") return toast(`${selected.name} already serves with the bow.`);
      res.dm -= ARCHER_COST;
      dropPolice();
      selected.profession = "archer";
      selected.maxHp = 90 + (has("cavalry") ? 50 : 0);
      toast(`${selected.name} takes up the bow for the colony. They loose arrows at raiders from afar.`);
    } else if (prof === "cavalry") {
      if (!has("cavalry")) return toast("Cavalry requires the Cavalry technology (through War Horse).");
      if (res.dm - CAV_COST < treasuryFloor()) return toast(`A cavalry mount and rider cost ${CAV_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may ride for the colony.");
      if (selected.profession === "cavalry") return toast(`${selected.name} already rides for the colony.`);
      res.dm -= CAV_COST;
      dropPolice();
      selected.profession = "cavalry";
      selected.maxHp = 160 + (has("hussars") ? 40 : 0);
      selected.hp = Math.min(selected.hp + 40, selected.maxHp);
      toast(`${selected.name} mounts up as cavalry${has("lances") ? " — lance in hand" : ""}. Fast, hard-hitting, and fearless.`);
    } else if (prof === "blacksmith") {
      if (!has("forging")) return toast("Blacksmiths require the Forging technology.");
      dropPolice();
      selected.profession = "blacksmith";
      toast(`${selected.name} takes up the hammer as blacksmith.`);
    } else if (prof === "hunter") {
      dropPolice();
      selected.profession = "hunter";
      toast(`${selected.name} takes up the hunter's life.`);
    } else if (prof === "lumberjack" || prof === "quarryman" || prof === "forager") {
      if (!has("township")) return toast("Organized town jobs require the Township technology.");
      dropPolice();
      selected.profession = prof;
      toast(`${selected.name} takes up the ${prof}'s work. They will keep at it on their own.`);
    } else {
      dropPolice();
      selected.profession = "farmer";
      toast(`${selected.name} takes up farming. Assign them to a farm by clicking it.`);
    }
    refreshAvatar(selected);
    syncUI();
  }));
document.addEventListener("click", e => {
  for (const id of ["buildDrop", "craftDrop", "recruitDrop", "civDrop"])
    if ($(id) && !$(id).contains(e.target)) $(id).classList.remove("open");
});

$("renameBtn").addEventListener("click", () => {
  const v = $("renameInput").value.trim();
  if (!v) return toast("A settlement needs a name.");
  settlementName = v;
  $("renameInput").value = "";
  toast(`The settlement is proclaimed: ${settlementName}.`);
  syncUI();
});
$("renameInput").addEventListener("keydown", e => { if (e.key === "Enter") $("renameBtn").click(); e.stopPropagation(); });
$("kingdomBtn").addEventListener("click", () => {
  const v = $("kingdomInput").value.trim();
  if (!v) return toast("A kingdom needs a name.");
  empireName = v;
  $("kingdomInput").value = "";
  toast(`The kingdom is proclaimed anew: ${empireName}.`);
  syncUI();
});
$("kingdomInput").addEventListener("keydown", e => { if (e.key === "Enter") $("kingdomBtn").click(); e.stopPropagation(); });
function openSettings() {
  $("setMaster").value = Math.round(settings.master * 100);
  $("setCam").value = Math.round(settings.camSpeed * 100);
  for (const [id, key] of [["setMusic","music"],["setBattle","battle"],["setSfx","sfx"],["setAmbient","ambient"],
                           ["setFloaters","floaters"],["setLabels","labels"],["setSmoke","smoke"],["setNight","night"]])
    $(id).checked = settings[key];
  $("settingsPanel").style.display = "block";
}
$("pmSettings").addEventListener("click", openSettings);
$("menuSettings").addEventListener("click", openSettings);
$("setClose").addEventListener("click", () => { $("settingsPanel").style.display = "none"; saveSettings(); });
$("setMaster").addEventListener("input", e => { settings.master = e.target.value / 100; SFX.setMaster(settings.master); saveSettings(); });
$("setCam").addEventListener("input", e => { settings.camSpeed = e.target.value / 100; saveSettings(); });
for (const [id, key] of [["setMusic","music"],["setBattle","battle"],["setSfx","sfx"],["setAmbient","ambient"],
                         ["setFloaters","floaters"],["setLabels","labels"],["setSmoke","smoke"],["setNight","night"]])
  $(id).addEventListener("change", e => {
    settings[key] = e.target.checked;
    if (key === "music" && !settings.music) MUSIC.stop();
    if (key === "music" && settings.music && (gameState === "menu" || gameState === "over")) MUSIC.play();
    if (key === "battle" && !settings.battle) MUSIC.battle(false);
    if (key === "ambient" && !settings.ambient) { SFX.windLoop(false); SFX.fireLoop(false); }
    saveSettings();
  });
$("pmResume").addEventListener("click", () => setPause(false));
$("pmSave").addEventListener("click", () => {
  setPause(false);
  toast(saveGame() ? "The colony ledger is written. Game saved." : "⚠ The save failed — the ledger is too heavy for this browser.");
});
$("pmMenu").addEventListener("click", () => { saveGame(); location.reload(); });
$("govToggle").addEventListener("click", () => {
  const p = $("govPanel");
  p.style.display = p.style.display === "block" ? "none" : "block";
});
$("taxSlider").addEventListener("input", e => { taxRate = +e.target.value; $("taxVal").textContent = taxRate; syncUI(); });
$("lawCivWeapons").addEventListener("change", e => { laws.civWeapons = e.target.checked; });
$("lawHunterWeapons").addEventListener("change", e => { laws.hunterWeapons = e.target.checked; });
$("lawFreeRoam").addEventListener("change", e => {
  laws.freeRoam = e.target.checked;
  toast(laws.freeRoam ? "The borders are opened: civilians may roam the deep woods on their own." :
                        "Civilians are ordered to keep close to the town borders.");
});
$("lawForced").addEventListener("change", e => {
  laws.forced = e.target.checked;
  toast(laws.forced ? "The forced labour edict is proclaimed. The people will not forgive this quickly." :
                      "The forced labour edict is repealed.");
});
$("techToggle").addEventListener("click", () => {
  const p = $("techPanel");
  const opening = p.style.display !== "block";
  p.style.display = opening ? "block" : "none";
  $("techToggle").textContent = opening ? "Close Tech Tree" : "Open Tech Tree";
  renderTech();
});
$("techClose").addEventListener("click", () => { $("techPanel").style.display = "none"; $("techToggle").textContent = "Open Tech Tree"; });
$("tabGrowth").addEventListener("click", () => { techTab = "growth"; $("tabGrowth").classList.add("active"); $("tabMilitary").classList.remove("active"); renderTech(); });
$("tabMilitary").addEventListener("click", () => { techTab = "military"; $("tabMilitary").classList.add("active"); $("tabGrowth").classList.remove("active"); renderTech(); });

$("cpDeposit").addEventListener("click", () => {
  if (!selected) return;
  const inv = selected.inv, led = ledgerOf(selected);
  const moved = inv.logs + inv.seeds + inv.stone + inv.iron + inv.wheat + inv.bread + inv.meat;
  led.logs += inv.logs; led.seeds += inv.seeds; led.stone += inv.stone; led.iron += inv.iron;
  led.wheat += inv.wheat; led.bread += inv.bread; led.meat += inv.meat;
  inv.logs = inv.seeds = inv.stone = inv.iron = inv.wheat = inv.bread = inv.meat = 0;
  const town = selected.home && townOf(selected.home);
  toast(moved ? `${selected.name} hands ${moved} item(s) to ${town ? town.name + "'s" : "the town"} storage.` : `${selected.name} has nothing to hand over.`);
  syncUI();
});
$("cpHeal").addEventListener("click", () => {
  const c = selected;
  if (!c) return;
  if (c.hp >= c.maxHp) return toast(`${c.name} is already hale and whole.`);
  if (c.inv.bread + c.inv.meat + c.inv.wheat + res.bread + res.meat <= 0)
    return toast("No food anywhere — bake bread or hunt before ordering a heal.");
  c.task = null; c.state = "healing"; c.workT = 0;
  toast(`${c.name} sits down to eat until their wounds mend.`);
  syncUI();
});
$("cpGiveWeapon").addEventListener("click", () => {
  const c = selected;
  if (!c) return;
  if (!forgeBuilt()) return toast("Weapons are handed out at the forge — build one first.");
  if (c.armed) return toast(`${c.name} is already armed.`);
  if (res.weapons < 1) return toast("The armoury is empty. Set a blacksmith to forging weapons.");
  const lawAllows = isForce(c) || laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter");
  if (!lawAllows) return toast(`The law forbids arming ${c.name}. Change the weapon laws in the government panel.`);
  res.weapons--; c.armed = true;
  toast(`${c.name} is handed a weapon at the forge.`);
  syncUI();
});
$("cpBuyTool").addEventListener("click", () => {
  if (!selected) return;
  if (selected.tool) return toast(`${selected.name} already carries a good tool.`);
  const f = buildings.find(b => b.type === "forge" && !b.fire && (b.shop || []).some(i => i.kind === "tool"));
  if (!f) return toast("No tool on the forge racks.");
  if (res.dm - TOOL_PRICE_GOV < treasuryFloor()) return toast(`Government purchase costs ${TOOL_PRICE_GOV} DM. Treasury: ${res.dm} DM.`);
  const item = f.shop.splice(f.shop.findIndex(i => i.kind === "tool"), 1)[0];
  res.dm -= TOOL_PRICE_GOV;
  const smith = civs.find(o => o.name === item.by && o.profession === "blacksmith");
  if (smith) smith.inv.dm += TOOL_PRICE_GOV;
  selected.tool = true;
  toast(`The government buys ${selected.name} a fine tool from ${item.by}'s racks.`);
  syncUI();
});
$("bpBuyWeapon").addEventListener("click", () => {
  const b = selectedBldg;
  if (!b || b.type !== "forge") return;
  const idx = (b.shop || []).findIndex(i => i.kind === "weapon");
  if (idx < 0) return toast("No weapon on the racks. The blacksmith is still at work.");
  if (res.dm - 12 < treasuryFloor()) return toast("The armoury purchase costs 12 DM. Treasury: " + res.dm + " DM.");
  const item = b.shop.splice(idx, 1)[0];
  res.dm -= 12;
  const smith = civs.find(o => o.name === item.by && o.profession === "blacksmith");
  if (smith) { smith.inv.dm += 12; float(smith.x, smith.y - 70, "+12 DM", "#c9a86a"); }
  res.weapons++;
  SFX.coin();
  toast(`A weapon is bought off ${item.by}'s racks for the armoury. Police and soldiers may now equip it.`);
  syncUI();
});
$("bpDismantle").addEventListener("click", () => {
  const b = selectedBldg;
  if (!b) return;
  if (farms.includes(b)) {
    farms.splice(farms.indexOf(b), 1);
    res.logs += 1;
    toast("The farm is dismantled — 1 log recovered.");
  } else {
    if (b.fire) return toast("It is on fire — no one is dismantling that.");
    const base = b.type === "burned" ? 10 : (costOf(b.type === "cabin" ? "cabin" : b.type) || { logs: 10 }).logs;
    const refund = Math.floor(base * dismantleRefund());
    for (const o of b.occupants) {
      o.home = null;
      if (o.state === "sleeping" || o.state === "warming") { o.state = "idle"; o.y = b.y + 24; }
    }
    buildings.splice(buildings.indexOf(b), 1);
    res.logs += refund;
    toast(`Dismantled — ${refund} logs recovered.`);
  }
  selectedBldg = null;
  syncUI();
});



// ===== Empire: Europe map, nations, war, settlements =====

const MG_W = 100, MG_H = 56, SCALE = 2, MPX = 6, FW = MG_W * SCALE, FH = MG_H * SCALE, CPX = SCALE * MPX;
// stylized 1683 Europe in English, painted as rect blobs on a grid
const NATIONS = {
  scotland:  { name: "Scotland", color: "#a0344a", strength: 1, blobs: [[19,2,6,3],[18,4,7,3]] },
  england:   { name: "Kingdom of England", color: "#b03a52", strength: 3, blobs: [[18,7,7,6],[17,11,3,3],[23,12,3,2]] },
  ireland:   { name: "Ireland", color: "#94505e", strength: 1, blobs: [[12,6,4,5]] },
  france:    { name: "Kingdom of France", color: "#2d4d8e", strength: 5, blobs: [[23,17,12,9],[20,18,5,3],[33,24,3,3]] },
  castile:   { name: "Castile", color: "#b5541e", strength: 4, blobs: [[14,26,10,10]] },
  aragon:    { name: "Aragon", color: "#c86a2e", strength: 2, blobs: [[24,27,5,5]] },
  portugal:  { name: "Portugal", color: "#8e6a4a", strength: 2, blobs: [[12,27,3,9]] },
  hre:       { name: "Holy Roman Empire", color: "#a98436", strength: 4, blobs: [[33,13,9,9],[31,16,3,4]] },
  brandenburg:{ name: "Brandenburg", color: "#8a6c2c", strength: 2, blobs: [[40,10,7,4]] },
  saxony:    { name: "Saxony", color: "#97762f", strength: 2, blobs: [[42,14,5,3]] },
  bavaria:   { name: "Bavaria", color: "#7d6228", strength: 2, blobs: [[39,18,5,4]] },
  austria:   { name: "Austrian Empire", color: "#6b4f1c", strength: 4, blobs: [[43,20,7,4],[45,18,4,2]] },
  milan:     { name: "Milan", color: "#a04a3a", strength: 2, blobs: [[36,23,3,2]] },
  savoy:     { name: "Savoy", color: "#8e2d4d", strength: 2, blobs: [[34,24,3,3]] },
  venice:    { name: "Venice", color: "#a03a6e", strength: 2, blobs: [[38,23,5,2],[43,25,3,2]] },
  tuscany:   { name: "Tuscany", color: "#b09a4a", strength: 2, blobs: [[37,26,3,2]] },
  papal:     { name: "Papal States", color: "#8e5a8e", strength: 2, blobs: [[39,27,3,3],[41,29,2,2]] },
  naples:    { name: "Kingdom of Naples", color: "#b5541e", strength: 2, blobs: [[42,31,3,3],[44,33,3,3]] },
  sicily:    { name: "Sicily", color: "#a04a1e", strength: 1, blobs: [[41,38,4,2]] },
  sweden:    { name: "Swedish Empire", color: "#4a6a8e", strength: 3, blobs: [[34,1,4,4],[37,0,4,4],[40,2,4,5],[43,4,3,4],[47,0,8,5],[53,2,4,4]] },
  denmark:   { name: "Denmark", color: "#6a4a8e", strength: 2, blobs: [[35,6,2,4],[38,7,3,2]] },
  poland:    { name: "Poland–Lithuania", color: "#8e2d8e", strength: 4, blobs: [[47,9,12,10],[52,7,8,3]] },
  russia:    { name: "Tsardom of Russia", color: "#7a7a2d", strength: 5, blobs: [[60,1,39,15],[64,15,34,10],[59,16,5,4]] },
  cossacks:  { name: "Cossacks", color: "#5a8e4a", strength: 2, blobs: [[59,20,8,4]] },
  crimea:    { name: "Crimean Khanate", color: "#6aa05a", strength: 2, blobs: [[61,24,7,3],[63,27,4,2]] },
  hungary:   { name: "Hungary", color: "#79a065", strength: 2, blobs: [[47,21,5,3]] },
  transylvania:{ name: "Transylvania", color: "#86a878", strength: 2, blobs: [[52,20,4,3]] },
  moldavia:  { name: "Moldavia", color: "#8fae7f", strength: 2, blobs: [[56,17,4,4]] },
  wallachia: { name: "Wallachia", color: "#7ba26b", strength: 2, blobs: [[52,24,7,2]] },
  ottoman:   { name: "Ottoman Empire", color: "#2d7a3a", strength: 6,
               blobs: [[46,26,8,6],[49,24,4,3],[48,32,4,3],[49,35,3,2],[54,30,3,2],[57,30,14,7],[70,28,9,7],
                       [74,33,4,9],[64,42,12,5],[62,40,4,3],[76,30,10,8]] },
  algiers:   { name: "Algiers", color: "#3a8e4a", strength: 2, blobs: [[24,37,9,3],[22,36,4,2]] },
  tunis:     { name: "Tunis", color: "#3a8e4a", strength: 2, blobs: [[33,36,4,4]] },
  tripoli:   { name: "Tripolitania", color: "#3a8e4a", strength: 2, blobs: [[38,39,9,3],[46,40,6,3]] },
};
const LABELS = [
  ["Scotland",21,4],["England",21,10],["Ireland",13,8],["France",28,21],["Castile",18,30],
  ["Aragon",26,29],["Portugal",13,32],["Holy Roman\nEmpire",37,15],["Brandenburg",44,11],
  ["Saxony",45,16],["Bavaria",41,20],["Austria",46,22],["Milan",36,23],["Savoy",35,26],
  ["Venice",41,24],["Tuscany",38,27],["Papal\nStates",40,29],["Naples",46,34],["Sicily",43,40],
  ["Swedish Empire",44,2],["Denmark",35,6],["Poland–Lithuania",52,12],["Tsardom of Russia",76,8],
  ["Cossacks",62,22],["Crimean\nKhanate",64,25],["Hungary",49,23],["Transylvania",54,20],
  ["Moldavia",58,17],["Wallachia",55,26],["Ottoman Empire",63,36],["Algiers",27,39],
  ["Tunis",35,38],["Tripolitania",42,41],
];
const EMPIRE_HOME = { mx: 37, my: 11 };   // the woods beyond Hamburg

let mapGrid = null;
const cellHash = (c, r) => ((c * 73856093) ^ (r * 19349663)) >>> 0;
function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// smooth value noise for organic coastlines (deterministic)
function vnoise(x, y, seed) {
  const L = 13;
  const xi = Math.floor(x / L), yi = Math.floor(y / L);
  let fx = x / L - xi, fy = y / L - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => ((((a + 1e5) * 73856093) ^ ((b + 1e5) * 19349663) ^ (seed * 83492791)) >>> 0) % 1024 / 1024;
  const a = h(xi, yi), b = h(xi + 1, yi), c2 = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * fx + (c2 - a + (a - b + d - c2) * fx) * fy;
}

let fineGrid = null, FID = null, FIDX = null, FID_RGB = null;
const SEA_RGB = hexRGB("#16303f");

function buildMapGrid() {
  mapGrid = Array.from({ length: MG_H }, () => Array(MG_W).fill(null));
  // the Free Lands: unclaimed forest around your home, yours to grow into
  const WILDS = [[33,7,7,6],[34,13,5,1]];
  for (const [x, y, w, h] of WILDS)
    for (let r = y; r < y + h && r < MG_H; r++) for (let c = x; c < x + w && c < MG_W; c++) mapGrid[r][c] = "wilds";
  for (const [id, n] of Object.entries(NATIONS))
    for (const [x, y, w, h] of n.blobs)
      for (let r = y; r < y + h && r < MG_H; r++) for (let c = x; c < x + w && c < MG_W; c++) mapGrid[r][c] = id;
  // hard water: the English Channel and the North Sea stay open no matter the warp
  const SEAS = [[16,15,14,2],[26,4,7,10],[43,9,4,4],[56,28,7,3],[52,32,4,4],[44,27,2,4]];
  for (const [x, y, w, h] of SEAS)
    for (let r = y; r < y + h && r < MG_H; r++) for (let c = x; c < x + w && c < MG_W; c++) mapGrid[r][c] = null;
  // land taken in the wars of Europe
  for (const cq of conquests) if (mapGrid[cq.r] && mapGrid[cq.r][cq.c]) mapGrid[cq.r][cq.c] = cq.to;

  // 1px fine grid: sample the coarse map through a noise warp so every
  // border becomes an organic pixel coastline
  FID = ["sea", "wilds", ...Object.keys(NATIONS)];
  FIDX = Object.fromEntries(FID.map((id, i) => [id, i]));
  FID_RGB = FID.map(id => id === "sea" ? SEA_RGB : id === "wilds" ? hexRGB("#55614e") : hexRGB(NATIONS[id].color));
  fineGrid = new Uint8Array(FW * FH);
  for (let r = 0; r < FH; r++) for (let c = 0; c < FW; c++) {
    const wx = c + (vnoise(c * 3, r * 3, 1) - 0.5) * 3.2;
    const wy = r + (vnoise(c * 3, r * 3, 2) - 0.5) * 3.2;
    const cc = Math.max(0, Math.min(MG_W - 1, Math.floor(wx / SCALE)));
    const rr = Math.max(0, Math.min(MG_H - 1, Math.floor(wy / SCALE)));
    fineGrid[r * FW + c] = FIDX[mapGrid[rr][cc] || "sea"];
  }
  n_wars_init();
}
function n_wars_init() { for (const n of Object.values(NATIONS)) { if (n.atWar === undefined) { n.atWar = false; n.warT = 0; n.lost = 0; } } }

function empireCells() {
  // main settlement + founded ones, sized by population
  const cells = new Set();
  const grow = (mx, my, pop) => {
    const r = Math.min(3, Math.floor(pop / 3));
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (Math.abs(dx) + Math.abs(dy) <= r) cells.add((mx + dx) + "," + (my + dy));
  };
  grow(EMPIRE_HOME.mx, EMPIRE_HOME.my, civs.length + 2);
  for (const st of settlements) grow(st.mx, st.my, st.pop);
  for (const n of Object.values(NATIONS)) if (n.captured) for (const key of n.captured) cells.add(key);
  return cells;
}

function natStrength(n) { return Math.min(10, n.strength + Math.floor(playT / 1800)); }

// --- the wars of Europe: rival nations fight each other, borders move ---
const conquests = [];        // {c, r, to} — persistent map overrides
let natWars = [];            // {a, b, t, battles}
let natWarSpawnT = 90;

function nationNeighbours(id) {
  if (!mapGrid) buildMapGrid();
  const out = new Set();
  for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++) {
    if (mapGrid[r][c] !== id) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nid = mapGrid[r + dy] && mapGrid[r + dy][c + dx];
      if (nid && nid !== id && nid !== "wilds" && NATIONS[nid]) out.add(nid);
    }
  }
  return [...out];
}

function startNatWar() {
  const ids = Object.keys(NATIONS).filter(id => !NATIONS[id].defeated);
  if (!ids.length) return;
  const a = ids[Math.floor(Math.random() * ids.length)];
  const nbs = nationNeighbours(a).filter(b =>
    !natWars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)));
  if (!nbs.length) return;
  const b = nbs[Math.floor(Math.random() * nbs.length)];
  natWars.push({ a, b, t: 30 + Math.random() * 20, battles: 0 });
  toast(`⚔ Word arrives from afar: ${NATIONS[a].name} and ${NATIONS[b].name} are at war!`);
}

function remainingCells(id) {
  return cellCount(id) - ((NATIONS[id].captured || []).length);
}
function checkDefeated(id) {
  const n = NATIONS[id];
  if (n.defeated || remainingCells(id) > 0) return false;
  n.defeated = true;
  n.atWar = false;
  natWars = natWars.filter(w => w.a !== id && w.b !== id);
  toast(`⚔ ${n.name} has been DEFEATED — every league of its land is occupied. Its name passes into history.`);
  return true;
}
function cellCount(id) {
  let n = 0;
  for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++) if (mapGrid[r][c] === id) n++;
  return n;
}

function resolveBattle(war) {
  if (!mapGrid) buildMapGrid();
  const sa = natStrength(NATIONS[war.a]), sb = natStrength(NATIONS[war.b]);
  const aWins = Math.random() < sa / (sa + sb);
  const winner = aWins ? war.a : war.b, loser = aWins ? war.b : war.a;
  // find loser cells on the mutual border
  const frontier = [];
  for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++) {
    if (mapGrid[r][c] !== loser) continue;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
      if (mapGrid[r + dy] && mapGrid[r + dy][c + dx] === winner) { frontier.push([c, r]); break; }
  }
  const take = Math.min(frontier.length, 1 + Math.floor(Math.random() * 2));
  for (let i = 0; i < take; i++) {
    const [c, r] = frontier.splice(Math.floor(Math.random() * frontier.length), 1)[0];
    const prev = conquests.findIndex(q => q.c === c && q.r === r);
    if (prev >= 0) conquests.splice(prev, 1);
    conquests.push({ c, r, to: winner });
    mapGrid[r][c] = winner;
  }
  war.battles++;
  if (take > 0) toast(`⚔ ${NATIONS[winner].name} seizes borderland from ${NATIONS[loser].name}!`);
  // rebuild the pixel map so borders visibly move — live if the map is open
  buildMapGrid();
  if (document.getElementById("mapOverlay").style.display === "block") renderMap();
  if (checkDefeated(loser)) return;
  if ((war.battles >= 3 && Math.random() < 0.3) || (!frontier.length && take === 0)) {
    natWars.splice(natWars.indexOf(war), 1);
    toast(`The war between ${NATIONS[war.a].name} and ${NATIONS[war.b].name} ends in a weary peace.`);
  }
}

function updateNationTrade(dt) {
  for (const [id, n] of Object.entries(NATIONS)) {
    if (n.tradeCool > 0) n.tradeCool -= dt;
    if (!n.trade) continue;
    if (n.defeated || n.atWar) { n.trade = false; continue; }
    n.tradeT = (n.tradeT === undefined ? 60 : n.tradeT) - dt;
    if (n.tradeT <= 0) {
      n.tradeT = 60;
      const dm = 3 + Math.floor(natStrength(n) / 2);
      res.dm += dm;
      const goods = [["wheat", 2], ["iron", 1], ["stone", 2], ["bread", 1]][Math.floor(Math.random() * 4)];
      res[goods[0]] += goods[1];
      toast(`A caravan from ${n.name} arrives: +${dm} DM, +${goods[1]} ${goods[0]}.`);
      SFX.coin();
    }
  }
}
function updateNationWars(dt) {
  natWarSpawnT -= dt;
  if (natWarSpawnT <= 0) {
    natWarSpawnT = 100 + Math.random() * 80;
    if (natWars.length < 2) startNatWar();
  }
  for (const w of [...natWars]) {
    w.t -= dt;
    if (w.t <= 0) { w.t = 45 + Math.random() * 40; resolveBattle(w); }
  }
}
function nationAdjacent(id) {
  if (!mapGrid) buildMapGrid();
  const mine = empireCells();
  for (const key of mine) {
    const [c, r] = key.split(",").map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (mapGrid[r + dy] && mapGrid[r + dy][c + dx] === id) return true;
  }
  return false;
}

let mapSelNation = null;
function renderMap() {
  const mc = document.getElementById("euromap").getContext("2d");
  mc.imageSmoothingEnabled = false;
  const mine = empireCells();
  const img = mc.createImageData(FW, FH);
  const px = img.data;
  const myCol = hexRGB(territoryColor);
  const coarse = i => Math.floor(i / CPX);
  const eidAt = (cc, rr) => {
    if (cc < 0 || rr < 0 || cc >= FW || rr >= FH) return 0;
    const nid = fineGrid[rr * FW + cc];
    if (nid !== 0 && mine.has(coarse(cc) + "," + coarse(rr))) return 255;
    return nid;
  };
  for (let r = 0; r < FH; r++) for (let c = 0; c < FW; c++) {
    const i = r * FW + c;
    const eid = eidAt(c, r);
    const base = eid === 255 ? myCol : FID_RGB[fineGrid[i]];
    const n = vnoise(c * 1.4, r * 1.4, 7);
    let f = 0.92 + n * 0.12;
    if (eid !== 0 &&
        (eidAt(c - 1, r) !== eid || eidAt(c + 1, r) !== eid || eidAt(c, r - 1) !== eid || eidAt(c, r + 1) !== eid))
      f *= 0.42;   // openfront border: darker shade of the territory's own colour, one block wide
    px[i * 4] = base[0] * f; px[i * 4 + 1] = base[1] * f; px[i * 4 + 2] = base[2] * f; px[i * 4 + 3] = 255;
  }
  // blow the buffer up to crisp 6x6 blocks
  if (!window.__euroBuf) {
    window.__euroBuf = document.createElement("canvas");
    window.__euroBuf.width = FW; window.__euroBuf.height = FH;
  }
  window.__euroBuf.getContext("2d").putImageData(img, 0, 0);
  mc.imageSmoothingEnabled = false;
  mc.drawImage(window.__euroBuf, 0, 0, FW, FH, 0, 0, FW * MPX, FH * MPX);
  // war glow
  for (const [id, n] of Object.entries(NATIONS)) if (n.atWar) {
    mc.strokeStyle = "#d86a5a"; mc.lineWidth = 2;
    for (const [x, y, w, h] of n.blobs) mc.strokeRect(x * CPX, y * CPX, w * CPX, h * CPX);
  }
  // labels
  mc.textAlign = "center";
  for (const [name, x, y] of LABELS) {
    mc.font = "bold 11px 'Courier New', monospace";
    mc.fillStyle = "rgba(0,0,0,0.55)";
    name.split("\n").forEach((line, i) => mc.fillText(line, x * CPX + 1, y * CPX + 1 + i * 11));
    mc.fillStyle = "#e8ecea";
    name.split("\n").forEach((line, i) => mc.fillText(line, x * CPX, y * CPX + i * 11));
  }
  // empire label + settlement dots
  const home = EMPIRE_HOME;
  const dot = (mx, my, nm) => {
    mc.fillStyle = "#0a0f0c"; mc.fillRect(mx * CPX - 2, my * CPX - 2, 6, 6);
    mc.fillStyle = "#ffe9b0"; mc.fillRect(mx * CPX - 1, my * CPX - 1, 4, 4);
    mc.font = "10px 'Courier New', monospace";
    mc.fillStyle = "#0a0f0c"; mc.fillText(nm, mx * CPX + 1, my * CPX - 5 + 1);
    mc.fillStyle = "#ffe9b0"; mc.fillText(nm, mx * CPX, my * CPX - 5);
  };
  dot(home.mx, home.my, settlementName);
  for (const st of settlements) dot(st.mx, st.my, st.name);
  mc.font = "bold 13px 'Courier New', monospace";
  mc.fillStyle = "rgba(0,0,0,0.6)"; mc.fillText(empireName || "Your Empire", home.mx * CPX + 1, (home.my - 3) * CPX + 1);
  mc.fillStyle = "#ffe9b0"; mc.fillText(empireName || "Your Empire", home.mx * CPX, (home.my - 3) * CPX);
  // daughter settlements: a marker and name at each
  mc.font = "10px 'Courier New', monospace";
  for (const st of settlements) {
    const sx = st.mx * CPX, sy = st.my * CPX;
    mc.fillStyle = "#ffe9b0"; mc.fillRect(sx - 2, sy - 2, 5, 5);
    mc.fillStyle = "rgba(0,0,0,0.6)"; mc.fillText(`${st.name} (${st.pop})`, sx + 1, sy - 5);
    mc.fillStyle = "#ffe9b0"; mc.fillText(`${st.name} (${st.pop})`, sx, sy - 6);
  }
}

document.getElementById("mapToggle").addEventListener("click", () => {
  if (!mapGrid) buildMapGrid();
  renderMap();
  document.getElementById("mapTitle").textContent = (empireName || "YOUR EMPIRE").toUpperCase() + " — EUROPE, " + colonyYear;
  document.getElementById("mapOverlay").style.display = "block";
  paused = true;
});
document.getElementById("mapClose").addEventListener("click", () => {
  document.getElementById("mapOverlay").style.display = "none";
  setPause(pauseOpen);
});
document.getElementById("euromap").addEventListener("click", e => {
  const rect = e.target.getBoundingClientRect();
  const c = Math.floor((e.clientX - rect.left) / MPX), r = Math.floor((e.clientY - rect.top) / MPX);
  if (!fineGrid || c < 0 || r < 0 || c >= FW || r >= FH) return;
  const id = FID[fineGrid[r * FW + c]];
  if (!id || id === "sea" || id === "wilds") { mapSelNation = null; mapInfoSync(); return; }
  mapSelNation = id;
  mapInfoSync();
});
function mapInfoSync() {
  const w = document.getElementById("miWar"), pc = document.getElementById("miPeace"), as = document.getElementById("miAssault");
  if (!mapSelNation) {
    document.getElementById("miName").textContent = "—";
    document.getElementById("miDetail").textContent = "Click a nation on the map.";
    w.style.display = pc.style.display = as.style.display = "none";
    return;
  }
  const n = NATIONS[mapSelNation];
  document.getElementById("miName").textContent = n.name.toUpperCase();
  const soldiers = civs.filter(c => c.profession === "soldier").length;
  const adj = nationAdjacent(mapSelNation);
  if (n.defeated) {
    document.getElementById("miDetail").textContent =
      `DEFEATED. ${n.name} holds not one league of land — its territory is wholly occupied, its name a memory.`;
    w.style.display = pc.style.display = as.style.display = "none";
    return;
  }
  document.getElementById("miDetail").textContent =
    `Strength ${natStrength(n)}/10${natStrength(n) > n.strength ? " (grown with the years)" : ""}. ` + (n.atWar ?
      `AT WAR with ${empireName || "your empire"}. Their war parties will keep coming. Assaulting a settlement needs 4 soldiers and 4 weapons — and even then the odds are grim. (You have ${soldiers} soldier(s), ${res.weapons} weapon(s).)` :
      adj ? "At peace, and your borders touch theirs. Declaring war will bring their war parties to your gates — and put their settlements within your soldiers' reach." :
            "At peace — and far from your borders. No quarrel can reach a nation your territory does not touch. Expand toward them first.");
  w.style.display = n.atWar ? "none" : adj ? "block" : "none";
  pc.style.display = n.atWar ? "block" : "none";
  as.style.display = n.atWar ? "block" : "none";
  const tr = document.getElementById("miTrade");
  tr.style.display = (!n.atWar && adj && !n.trade) ? "block" : "none";
  if (n.trade) document.getElementById("miDetail").textContent += " A trade route is open — caravans arrive regularly.";
}
document.getElementById("miWar").addEventListener("click", () => {
  const n = NATIONS[mapSelNation];
  if (!nationAdjacent(mapSelNation)) return toast(`Your borders do not touch ${n.name}. Expand toward them first.`);
  if (n.trade) { n.trade = false; toast(`The caravans of ${n.name} turn back — trade is dead.`); }
  n.atWar = true; n.warT = 30;
  for (const c of civs) c.happiness = Math.max(0, c.happiness - 6);
  toast(`⚔ ${empireName || "The colony"} declares war on ${n.name}! The people brace themselves.`);
  document.getElementById("mapOverlay").style.display = "none"; setPause(pauseOpen);
  vignette("firstWar");
  mapInfoSync(); renderMap();
});
document.getElementById("miPeace").addEventListener("click", () => {
  const n = NATIONS[mapSelNation];
  if (res.dm - 60 < treasuryFloor()) return toast("Peace costs 60 DM in reparations. The treasury cannot bear it.");
  res.dm -= 60; n.atWar = false;
  toast(`Peace with ${n.name}, bought for 60 DM.`);
  mapInfoSync(); renderMap(); syncUI();
});
function leaderOf(id) {
  const n = NATIONS[id];
  if (["ottoman", "crimea", "algiers", "tunis", "tripoli"].includes(id))
    return { face: "leader_sultan", title: `The Sultan, for ${n.name}` };
  if (["russia", "cossacks"].includes(id))
    return { face: "leader_tsar", title: `The Tsar, for ${n.name}` };
  if (n.strength <= 3)
    return { face: "leader_chancellor", title: `The Chancellor of ${n.name}` };
  return { face: "leader_king", title: `The Crown of ${n.name}` };
}
const TRADE_OPTIONS = [
  { text: "Send a gift of 10 DM with our compliments.", d: +12, needs: () => res.dm >= 10, use: () => res.dm -= 10 },
  { text: "A wagon of fresh bread for the court. (3 bread)", d: +10, needs: () => res.bread >= 3, use: () => res.bread -= 3 },
  { text: "Iron from our quarries, freely given. (2 iron)", d: +9, needs: () => res.iron >= 2, use: () => res.iron -= 2 },
  { text: "\"Our roads are safe, our word is good, our scales are honest.\"", d: +7 },
  { text: "\"Your rivals already court our caravans.\"", d: 0, dyn: () => natWars.some(w => w.a === mapSelNation || w.b === mapSelNation) ? +11 : -9 },
  { text: "\"Low tariffs, full wagons — both our peoples profit.\"", d: +8 },
  { text: "\"Trade with us, or your merchants will regret it.\"", d: -18 },
  { text: "\"We are small, but hard winters breed honest traders.\"", d: +5 },
  { text: "Praise the court's splendour at some length.", d: +4 },
];
document.getElementById("miTrade").addEventListener("click", () => {
  const id = mapSelNation, n = NATIONS[id];
  if (n.trade) return;
  if (!nationAdjacent(id)) return toast("Caravans need a shared border.");
  if (n.tradeCool > 0) return toast(`${n.name}'s court is still offended. Give it time.`);
  const lead = leaderOf(id);
  n.tradeMeter = n.tradeMeter === undefined ? Math.max(10, 50 - natStrength(n) * 1.5) : n.tradeMeter;
  n.tradeUsed = n.tradeUsed || new Set();
  openTalk({
    face: lead.face,
    title: lead.title,
    opening: "The envoy is received coolly. \"A colony of exiles wishes to trade with us? Speak, then.\"",
    pool: TRADE_OPTIONS,
    used: n.tradeUsed,
    get meter() { return n.tradeMeter; }, set meter(x) { n.tradeMeter = x; },
    onWin: () => {
      closeDialogue();
      n.trade = true; n.tradeT = 30; n.tradeMeter = undefined; n.tradeUsed = new Set();
      toast(`The compact is sealed — a trade route opens with ${n.name}. The first caravan is on the road.`);
      SFX.coin();
      mapInfoSync(); syncUI();
    },
    onLose: () => {
      closeDialogue();
      n.tradeCool = 180; n.tradeMeter = undefined; n.tradeUsed = new Set();
      toast(`The court of ${n.name} dismisses your envoy. Try again when tempers cool.`);
      mapInfoSync();
    },
  });
});
document.getElementById("miAssault").addEventListener("click", () => {
  const n = NATIONS[mapSelNation];
  const soldiers = civs.filter(c => c.profession === "soldier");
  if (soldiers.length < 4) return toast("An assault needs at least 4 soldiers.");
  if (res.weapons < 4) return toast("An assault needs 4 weapons in the armoury.");
  res.weapons -= 4;
  const odds = Math.max(0.05, Math.min(0.5, soldiers.length * 0.04 + (has("raiding") ? 0.06 : 0) + (has("hussars") ? 0.06 : 0) - natStrength(n) * 0.03));
  if (Math.random() < odds) {
    n.lost++;
    n.captured = n.captured || [];
    const [bx, by] = n.blobs[0];
    for (let i = 0; i < 4; i++) n.captured.push((bx + i % 2 + n.lost) + "," + (by + Math.floor(i / 2)));
    res.dm += 200;
    toast(`⚔ Against all odds, your soldiers storm a settlement of ${n.name}! +200 DM plunder; their land is yours on the map.`);
    SFX.coin();
    checkDefeated(mapSelNation);
  } else {
    let lost = 0;
    for (const sd of soldiers) if (Math.random() < 0.5) { killCiv(sd, `fell before the walls of ${n.name}`); lost++; }
    toast(`The assault on ${n.name} is thrown back. ${lost} soldier(s) never came home.`);
  }
  mapInfoSync(); renderMap(); syncUI();
});

function updateWars(dt) {
  for (const [id, n] of Object.entries(NATIONS)) {
    if (!n.atWar || n.defeated) continue;
    n.warT -= dt;
    if (n.warT <= 0) {
      n.warT = 110 + Math.random() * 70;
      if (season() === "winter") continue;   // armies do not march in the snow
      const targets = buildings.filter(b => b.type !== "burned");
      if (!targets.length || raiders.length >= MAX_RAIDERS + 2) continue;
      const a = Math.random() * Math.PI * 2;
      const st = natStrength(n);
      const partySize = 3 + (st >= 8 ? 1 : 0);
      for (let i = 0; i < partySize; i++) {
        const t = targets[Math.floor(Math.random() * targets.length)];
        const whp = 90 + (difficulty() - 1) * 12 + st * 3;
        raiders.push({ x: Math.cos(a) * 1300 + i * 30, y: Math.sin(a) * 1300 + i * 24, hp: whp, maxHp: whp,
                       dmg: 16 + (difficulty() - 1) * 2 + Math.floor(st / 3), camp: { x: Math.cos(a) * 1600, y: Math.sin(a) * 1600 }, target: t,
                       state: "approach", anim: 0, facing: 1, atkT: 0, foe: null, carry: 0, nation: id });
      }
      toast(`⚔ A war party of ${n.name} marches on the colony!`);
    }
  }
}

// --- founding new settlements ---
const SETTLE_NAMES = ["Waldheim", "Neuland", "Tannenfeld", "Ostbruck", "Hirschtal"];
function maybeOfferSettlement() {
  if (settlePending || gameState !== "playing") return;
  // two roads to new land: conquest (5 camps sacked) or prosperity (a grown colony)
  const earned = sackedCamps >= 5 || civs.length >= 8;
  if (playT >= nextSettleAt && earned && civs.length >= 3) {
    settlePending = true;
    const list = document.getElementById("settleList");
    list.innerHTML = "";
    civs.forEach((c, i) => {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;gap:8px;align-items:center;margin:3px 0;cursor:pointer;font-size:12px";
      row.innerHTML = `<input type="checkbox" data-idx="${i}"> ${c.name} — ${c.profession || "no trade"}${c.home ? "" : " (homeless)"}`;
      list.appendChild(row);
    });
    document.getElementById("settleName").value = SETTLE_NAMES[settlements.length % SETTLE_NAMES.length];
    document.getElementById("settleModal").style.display = "block";
    paused = true;
    toast("Scouts bring word of good land. The colony must decide.");
  }
}
document.getElementById("settleNo").addEventListener("click", () => {
  document.getElementById("settleModal").style.display = "none";
  settlePending = false; setPause(pauseOpen);
  nextSettleAt = playT + 600;   // they will ask again
  toast("The scouts are told to wait. They will ask again.");
});
document.getElementById("settleGo").addEventListener("click", () => {
  const chosen = [...document.querySelectorAll("#settleList input:checked")].map(i => civs[+i.dataset.idx]).filter(Boolean);
  if (!chosen.length) return toast("Someone has to go.");
  if (chosen.length >= civs.length) return toast("Someone has to stay behind, too.");
  const name = document.getElementById("settleName").value.trim() || "New Settlement";
  // find a clear patch of woods a few screens out, away from camps and other towns
  let site = null, angle = Math.random() * Math.PI * 2;
  for (let tries = 0; tries < 24 && !site; tries++) {
    angle = Math.random() * Math.PI * 2;
    const dist = 1800 + Math.random() * 600;
    const x = Math.round(Math.cos(angle) * dist), y = Math.round(Math.sin(angle) * dist);
    if (camps.every(cp => Math.hypot(cp.x - x, cp.y - y) > 800) &&
        settlements.every(s => s.x === undefined || Math.hypot(s.x - x, s.y - y) > 1200)) site = { x, y };
  }
  if (!site) site = { x: Math.round(Math.cos(angle) * 2500), y: Math.round(Math.sin(angle) * 2500) };
  // raise the first cabins and claim the clearing
  const newCabins = [];
  for (let i = 0; i < Math.max(1, Math.ceil(chosen.length / 2)); i++) {
    const bx = site.x + (i % 3) * 150 - 150, by = site.y + Math.floor(i / 3) * 170;
    for (const t of nearThings("trees", bx, by, 130)) t.alive = false;
    for (const s of nearThings("stones", bx, by, 100)) s.alive = false;
    const b = { type: "cabin", x: bx, y: by, progress: -1, occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0 };
    buildings.push(b); newCabins.push(b);
  }
  expandAround(site.x, site.y, 3);
  const st = { name, pop: chosen.length, x: site.x, y: site.y,
               res: { logs: 10, stone: 4, bread: 4, meat: 2, dm: 10 },
               mx: EMPIRE_HOME.mx + Math.round(Math.cos(angle) * (3 + settlements.length)),
               my: EMPIRE_HOME.my + Math.round(Math.sin(angle) * 2 + 2 + settlements.length) };
  settlements.push(st);
  // the settlers keep their names and trades — they walk out and live there
  chosen.forEach((c, i) => {
    if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
    for (const f of farms) f.workers = f.workers.filter(w => w !== c);
    const cab = newCabins[i % newCabins.length];
    c.home = cab; cab.occupants.push(c);
    order(c, { kind: "walk", x: cab.x - 40 + (i % 2) * 80, y: cab.y + 34 });
  });
  document.getElementById("settleModal").style.display = "none";
  settlePending = false; setPause(pauseOpen);
  nextSettleAt = playT + 1200;
  expandFrontier(6);
  toast(`${chosen.length} settler(s) set out to found ${name} — follow them, or watch for its marker at the screen's edge.`);
  setTimeout(() => vignette("firstSettlement"), 400);
});
function emigrate(c) {
  if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
  if (c.profession === "police") policeCount--;
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  if (selected === c) selected = null;
  selGroup = selGroup.filter(s => s !== c);
  civs.splice(civs.indexOf(c), 1);
  toast(`${c.name} has left for the new settlement.`);
  syncUI();
}

// settlements slowly grow — physical towns count their real residents and work their stores
let stGrowT = 0;
function updateSettlements(dt) {
  stGrowT += dt;
  if (stGrowT > 120) {
    stGrowT = 0;
    for (const st of settlements) {
      if (st.x !== undefined) {
        st.pop = civs.filter(c => c.home && Math.hypot(c.home.x - st.x, c.home.y - st.y) < 500).length;
        st.res = st.res || { logs: 0, stone: 0, bread: 0, meat: 0, dm: 0 };
        if (st.pop > 0 && season() !== "winter") {
          st.res.logs += Math.floor(Math.random() * st.pop) + 1;
          st.res.bread += Math.random() < 0.6 ? 1 : 0;
          st.res.meat += Math.random() < 0.4 ? 1 : 0;
          st.res.dm += Math.floor(Math.random() * 3);
          st.res.stone += Math.random() < 0.3 ? 1 : 0;
        }
      } else if (Math.random() < 0.5) st.pop++;   // legacy map-only settlements
    }
  }
}

// --- empire naming & colour pickers ---
document.getElementById("empireGo").addEventListener("click", () => {
  empireName = document.getElementById("empireInput").value.trim() || "The Forester Realm";
  document.getElementById("empireModal").style.display = "none";
  setPause(pauseOpen);
  toast(`Let it be written: this is ${empireName}.`);
});
document.getElementById("empireInput").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("empireGo").click(); e.stopPropagation(); });
document.getElementById("terrColor").addEventListener("input", e => { territoryColor = e.target.value; });
document.getElementById("bordColor").addEventListener("input", e => { borderColor = e.target.value; });

// --- save / load ---
const SAVE_KEY = "forester_save";

// founder's tools: one-shot save surgery via URL params, then the URL is scrubbed
// ?scout=now — the scouts offer a new settlement immediately on Continue
// ?disband=Name — remove a settlement by name (case-insensitive)
try {
  const qp = new URLSearchParams(location.search);
  if (qp.has("scout") || qp.has("disband")) {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw && raw !== "null") {
      const d = JSON.parse(raw);
      if (qp.has("disband")) {
        const name = (qp.get("disband") || "").toLowerCase();
        const before = (d.settlements || []).length;
        d.settlements = (d.settlements || []).filter(s => (s.name || "").toLowerCase() !== name);
        if (d.settlements.length < before) console.log(`Disbanded settlement "${qp.get("disband")}".`);
      }
      if (qp.has("scout")) { d.sackedCamps = Math.max(5, d.sackedCamps || 0); d.nextSettleAt = 1; }   // 1, not 0: the loader treats 0 as unset
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    }
    history.replaceState(null, "", location.pathname);
  }
} catch (e) { console.error("save surgery failed", e); }
function saveGame() {
  if (gameState !== "playing") return;
  const bi = b => buildings.indexOf(b), ci = c => civs.indexOf(c), cpi = c => camps.indexOf(c);
  try {
    const data = {
      v: 1,
      res: { ...res }, taxRate, taxTimer, policeCount, laws: { ...laws }, zoom, settlementName,
      cam: { x: cam.x, y: cam.y },
      hunterTimer, raidTimer, campRespawnTimer, worldT,
      tech: Object.fromEntries(Object.values(TECH).map(t => [t.id, t.done])),
      research: research ? { ...research } : null,
      usedNames: [...usedNames],
      civs: civs.map(c => ({
        name: c.name, who: c.who, nativeWho: c.nativeWho, gender: c.gender, child: !!c.child, growT: c.growT || 0, age: c.age || 20, x: c.x, y: c.y, home: bi(c.home),
        profession: c.profession, hunger: c.hunger, hp: c.hp, maxHp: c.maxHp,
        happiness: c.happiness, rebel: c.rebel, armed: c.armed, tool: c.tool,
        inv: { ...c.inv },
      })),
      buildings: buildings.map(b => ({
        type: b.type, x: b.x, y: b.y, fire: b.fire, placed: b.placed,
        hp: b.hp, maxHp: b.maxHp, rot: b.rot, shop: b.shop || [], site: !!b.site,
        occupants: b.occupants.map(ci),
      })),
      farms: farms.map(f => ({ x: f.x, y: f.y, ready: f.ready, growT: f.growT, workers: f.workers.map(ci) })),
      camps: camps.map(c => ({ ...c })),
      chunks: [...chunks.entries()].filter(([k, ch]) => ch.dirty).map(([k, ch]) => [k, {
        dirty: true,
        trees: ch.trees.map(t => ({ ...t, progress: -1 })),
        stones: ch.stones.map(t => ({ ...t, progress: -1 })),
        patches: ch.patches.map(t => ({ ...t, progress: -1 })),
      }]),
      empireName, territoryColor, borderColor,
      territory: [...territory],
      sackedCamps, playT, nextSettleAt, tutStep, colonyYear, vigSeen,
      corpses: corpses.map(cp => ({ x: cp.x, y: cp.y, who: cp.who, deceased: cp.deceased })),
      graves: graves.map(gv => ({ x: gv.x, y: gv.y, stone: gv.stone, deceased: gv.deceased })),
      settlements: settlements.map(st => ({ ...st })),
      conquests: conquests.map(cq => ({ ...cq })),
      natWars: natWars.map(w => ({ ...w })),
      wars: Object.fromEntries(Object.entries(NATIONS).map(([id, n]) => [id, { atWar: !!n.atWar, warT: n.warT || 0, lost: n.lost || 0, captured: n.captured || [], defeated: !!n.defeated, trade: !!n.trade }])),
    };
    // keep the previous good save as a rolling backup before overwriting
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev && prev !== "null") localStorage.setItem(SAVE_KEY + "_backup", prev);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    Object.assign(res, d.res);
    taxRate = d.taxRate; taxTimer = d.taxTimer; policeCount = d.policeCount;
    settlementName = d.settlementName || "Neu Hamburg";
    Object.assign(laws, d.laws);
    zoom = d.zoom || 1;
    cam.x = d.cam.x; cam.y = d.cam.y;
    hunterTimer = d.hunterTimer; raidTimer = d.raidTimer; campRespawnTimer = d.campRespawnTimer;
    worldT = d.worldT || 80;
    for (const [id, done] of Object.entries(d.tech)) if (TECH[id]) TECH[id].done = done;
    TECH.foraging.done = TECH.ownership.done = TECH.forging.done = true;
    research = d.research;
    usedNames.clear(); for (const n of d.usedNames) usedNames.add(n);
    civs.length = 0;
    for (const cd of d.civs) {
      const c = mkCiv(cd.name, cd.nativeWho || cd.who, cd.x, cd.y, cd.gender || (cd.name === "Sister" ? "f" : "m"));
      c.who = cd.who;
      Object.assign(c, { profession: cd.profession, hunger: cd.hunger, hp: cd.hp, maxHp: cd.maxHp,
        happiness: cd.happiness, rebel: cd.rebel, armed: cd.armed, tool: cd.tool,
        child: !!cd.child, growT: cd.growT || 0, age: cd.age || 20 });
      Object.assign(c.inv, cd.inv);
      civs.push(c);
    }
    buildings.length = 0;
    for (const bd of d.buildings)
      buildings.push({ type: bd.type, x: bd.x, y: bd.y, progress: -1, fire: bd.fire || 0,
                       torchP: -1, placed: bd.placed, bakeT: 0, occupants: [],
                       rot: bd.rot || 0, shop: bd.shop || [], site: !!bd.site, buildP: 0,
                       hp: bd.type === "wall" ? Math.min(bd.hp ?? 100, 100) : bd.type === "gate" ? Math.min(bd.hp ?? 60, 60) : bd.hp,
                       maxHp: bd.type === "wall" ? 100 : bd.type === "gate" ? 60 : bd.maxHp });
    d.buildings.forEach((bd, i) => {
      for (const cidx of bd.occupants) if (civs[cidx]) {
        buildings[i].occupants.push(civs[cidx]);
        civs[cidx].home = buildings[i];
      }
    });
    farms.length = 0;
    for (const fd of d.farms)
      farms.push({ x: fd.x, y: fd.y, ready: fd.ready, growT: fd.growT, progress: -1,
                   workers: fd.workers.map(i => civs[i]).filter(Boolean) });
    camps.length = 0;
    for (const cd of d.camps) camps.push({ ...cd });
    raiders.length = 0; visitors.length = 0; floaters.length = 0;
    chunks.clear();
    for (const [k, ch] of d.chunks) chunks.set(k, ch);
    empireName = d.empireName || "";
    territoryColor = d.territoryColor || "#7da083";
    borderColor = d.borderColor || "#c9a86a";
    $("terrColor").value = territoryColor; $("bordColor").value = borderColor;
    territory.clear(); for (const k of (d.territory || [])) territory.add(k);
    if (!territory.size) { expandAround(0, -40, 2); for (const b of buildings) expandAround(b.x, b.y, 1); }
    sackedCamps = d.sackedCamps || 0; playT = d.playT || 0; nextSettleAt = d.nextSettleAt || 1200;
    tutStep = d.tutStep === undefined ? -1 : d.tutStep;
    colonyYear = d.colonyYear || 1683;
    vigSeen = d.vigSeen || {};
    corpses.length = 0; for (const cp of (d.corpses || [])) corpses.push({ ...cp, bearer: null, carried: null });
    graves.length = 0; for (const gv of (d.graves || [])) graves.push({ ...gv, mason: null });
    settlements.length = 0; for (const st of (d.settlements || [])) settlements.push(st);
    conquests.length = 0; for (const cq of (d.conquests || [])) conquests.push(cq);
    natWars = d.natWars || [];
    mapGrid = null;   // rebuilt with conquests on next use
    if (d.wars) {
      n_wars_init();
      for (const [id, w] of Object.entries(d.wars)) if (NATIONS[id]) {
        Object.assign(NATIONS[id], w);
        if (NATIONS[id].atWar && !NATIONS[id].warT) NATIONS[id].warT = 60 + Math.random() * 60;
      }
    }
    if (TECH.slavery.done) $("lawForcedRow").style.display = "flex";
    $("taxSlider").value = taxRate; $("taxVal").textContent = taxRate;
    $("lawCivWeapons").checked = laws.civWeapons;
    $("lawHunterWeapons").checked = laws.hunterWeapons;
    $("lawFreeRoam").checked = !!laws.freeRoam;
    if ($("lawForced")) $("lawForced").checked = laws.forced;
    return true;
  } catch (e) {
    console.error("save corrupted", e);
    // never load half a colony: stash the broken save, fall back to the
    // rolling backup if there is one, and restart clean either way
    try { if (raw && raw !== "null") localStorage.setItem(SAVE_KEY + "_broken", raw); } catch (e2) {}
    const bak = localStorage.getItem(SAVE_KEY + "_backup");
    if (bak && bak !== "null" && bak !== raw) {
      localStorage.setItem(SAVE_KEY, bak);
      localStorage.removeItem(SAVE_KEY + "_backup");
    } else localStorage.removeItem(SAVE_KEY);
    location.reload();
    return false;
  }
}

setInterval(saveGame, 10000);
addEventListener("pagehide", saveGame);

// --- milestone vignettes: the story writes itself as the colony grows ---
const VIGNETTES = {
  firstWinter: { img: "vig_firstwinter", lines: [
    "The first snow came in the night, quiet as a thief, and by morning the whole world was white.",
    "Sister said nothing, but banked the fire high. We both remembered who kept the hearth in Hamburg." ] },
  cabinDone: { img: "vig_cabindone", lines: [
    "The cabin stands again. We kept one charred beam at the corner — Sister insisted.",
    "\"So we remember what they took,\" she said, \"and what we took back.\"" ] },
  firstRecruit: { img: "vig_firstrecruit", lines: [
    "A stranger signed our book today and took a certificate through the slot in the wall.",
    "We are no longer just a family hiding in the woods. We are a place people come to." ] },
  firstChild: { img: "vig_firstchild", lines: [
    "A child was born in the colony last night — the first soul who will never know Hamburg's bells.",
    "Father, wherever you are: your name goes on. It was never theirs to take." ] },
  firstSettlement: { img: "vig_settlement", lines: [
    "This morning a wagon left our gate carrying friends, tools, and half our bread — to raise a new settlement over the ridge.",
    "One clearing was survival. Two is a nation being born." ] },
  firstWar: { img: "vig_firstwar", lines: [
    "Tonight we planted a banner pin on the map of Europe and said the word aloud: war.",
    "They executed a merchant on a lie. Let them learn what his children built in the dark of the woods." ] },
  village: { img: "vig_village", lines: [
    "Ten souls now wake to our bell. Smoke from a dozen chimneys, wheat in the rows, iron on the anvil.",
    "They cast us out to die. Instead, we built this." ] },
};
let vigSeen = {};
let vigLine = 0, vigKey = null;
function vignette(key) {
  if (vigSeen[key] || gameState !== "playing" || dlg.open) return;
  vigSeen[key] = true;
  vigKey = key; vigLine = 0;
  const v = VIGNETTES[key];
  $("cutImg").src = `assets/sprites/ui/${v.img}.png`;
  $("cutText").textContent = v.lines[0];
  $("cutscene").style.display = "block";
  gameState = "vignette";
  SFX.pickup();
}
function advanceVignette() {
  vigLine++;
  const v = VIGNETTES[vigKey];
  if (vigLine >= v.lines.length) {
    $("cutscene").style.display = "none";
    gameState = "playing";
    vigKey = null;
    saveGame();
    return;
  }
  $("cutText").textContent = v.lines[vigLine];
}

// --- opening cutscene ---
const CUTSCENE = [
  { img: "cut1_hamburg", lines: [
    "Hamburg, 1683. Our family had a name once — a house near the harbour, a trade, a future.",
    "Father said the city was good to those it loved. It loved us, until it didn't." ] },
  { img: "cut2_accusation", lines: [
    "They came with papers and torches. \"Malicious affairs,\" the magistrate read, and would not meet our eyes.",
    "They took Father to the square at dawn. The crowd that had bought our bread watched in silence." ] },
  { img: "cut3_flight", lines: [
    "We ran — my sister and I — through the marsh gate before they could take us too.",
    "Far, far away, the old woods swallowed the road, and the city's bells faded behind us." ] },
  { img: "cut4_clearing", lines: [
    "Deep in the forest we found a clearing, and in it a cabin — burned, empty, forgotten. Like us.",
    "Father is gone. The name is gone. But hands remain, and timber, and morning. We begin." ] },
];
let cutScene = 0, cutLine = 0, birdTimer = null;

function startCutscene() {
  gameState = "cutscene";
  cutScene = 0; cutLine = 0;
  showCutLine();
  $("cutscene").style.display = "block";
  birdTimer = setInterval(() => { if (Math.random() < 0.8) SFX.bird(); }, 1700);
}
function showCutLine() {
  const sc = CUTSCENE[cutScene];
  $("cutImg").src = `assets/sprites/ui/${sc.img}.png`;
  $("cutText").textContent = sc.lines[cutLine];
}
function advanceCutscene() {
  cutLine++;
  if (cutLine >= CUTSCENE[cutScene].lines.length) { cutScene++; cutLine = 0; }
  if (cutScene >= CUTSCENE.length) return endCutscene();
  showCutLine();
}
function endCutscene() {
  clearInterval(birdTimer);
  $("cutscene").style.display = "none";
  gameState = "playing";
  tutStep = 0;
  $("empireModal").style.display = "block";
  paused = true;
  syncUI();
}
addEventListener("keydown", e => {
  if (gameState === "cutscene" && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); advanceCutscene(); }
  if (gameState === "vignette" && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); advanceVignette(); }
});
$("cutscene").addEventListener("click", () => {
  if (gameState === "cutscene") advanceCutscene();
  else if (gameState === "vignette") advanceVignette();
});

// --- tutorial: from ash to a roof, then the woods are theirs ---
let tutStep = -1;
const TUT_STEPS = [
  { text: () => "The cabin in the clearing was your family's once. First: click your Brother or Sister to select them.",
    done: () => !!selected },
  { text: () => "Wood rebuilds the world. With them selected, click a spruce tree to fell it.",
    done: () => civs.some(c => c.inv.logs > 0) || res.logs > 0 },
  { text: () => "Felled logs ride in their pack — the town can't use them there. Select the woodcutter and press \"Deposit goods to town storage\" in their panel.",
    done: () => res.logs > 0 },
  { text: () => `Keep the storage fed: fell and deposit until 5 logs are stored. (${Math.min(5, res.logs)}/5)`,
    done: () => res.logs >= 5 },
  { text: () => "A cabin needs a door. Open CRAFT ▾ and order a Door (5 logs) — your civilian will hew it.",
    done: () => res.doors >= 1 },
  { text: () => `The repair takes 20 stored logs. Fell more spruces and deposit them. (${res.logs}/20)`,
    done: () => res.logs >= 20 },
  { text: () => "Now — with a civilian selected, click the burned cabin to order its repair.",
    done: () => !buildings.some(b => b.type === "burned") },
  { text: () => "A home needs bread. Click a wild grass patch (the seeded tufts) with a civilian selected to gather seeds, deposit them, then open BUILD ▾ and lay out a Wheat Farm (3 logs, 6 seeds).",
    done: () => farms.length > 0 },
  { text: () => "Fields need hands. Select a resident, use Recruit ▾ to make them a Farmer, then click the farm to assign them. They'll tend it on their own.",
    done: () => farms.some(f => f.workers.length > 0) },
  { text: () => "Knowledge is power. Open GOVERNMENT → Open Tech Tree and start any research — two trees, from axes to battle steel, paid in DM and time.",
    done: () => !!research || Object.values(TECH).filter(t => t.done).length > 3 },
  { text: () => "Coin: housed residents pay taxes on the countdown in the top bar. The GOVERNMENT panel sets the rate — fair taxes fill bellies and hearts, greedy ones breed rebels. (Open it to continue.)",
    done: () => $("govPanel").style.display === "block" },
  { text: () => "One more thing: press the MAP button. That is Europe, 1683 — your empire in your colour, nations that strengthen with the years and war among themselves. Expand toward a neighbour to earn the right to fight them.",
    done: () => $("mapOverlay").style.display === "block" },
  { text: () => "And where there is a border, there is business: on the map, send an envoy to a peaceful neighbour and convince their leader to open a trade route — gifts loosen crowns. Caravans then bring DM and goods. At home, your civilians already peddle bread and meat among themselves.",
    timed: 16 },
  { text: () => "❄ One warning: every year winter comes. The fields sleep, and the cold kills — anyone outside too long freezes. Housed folk duck into their cabins to warm up on their own; the homeless just sit in the snow and die. Roofs before riches.",
    timed: 16 },
  { text: () => "So that's the game: gather and build by day, keep bellies full and taxes fair, wall the town before nightfall, research toward steel, and grow the empire cell by cell. Wanderers, raiders, wars, and new settlements will find you on their own. The woods are yours now.",
    done: () => false },
];
let tutDoneT = 0;
function updateTutorial(dt) {
  const banner = $("tutBanner");
  if (tutStep >= TUT_STEPS.length) tutStep = TUT_STEPS.length - 1;
  if (tutStep < 0 || gameState !== "playing") { banner.style.display = "none"; return; }
  banner.style.display = "block";
  $("tutText").textContent = TUT_STEPS[tutStep].text();
  if (tutStep === TUT_STEPS.length - 1) {
    tutDoneT += dt;
    if (tutDoneT > 18) { tutStep = -1; banner.style.display = "none"; }
    return;
  }
  const st = TUT_STEPS[tutStep];
  if (st.timed) {
    st._t = (st._t || 0) + dt;
    if (st._t >= st.timed || Object.values(NATIONS).some(n => n.trade)) { tutStep++; SFX.pickup(); }
    return;
  }
  if (st.done()) { tutStep++; SFX.pickup(); }
}
$("tutSkip").addEventListener("click", () => { tutStep = -1; $("tutBanner").style.display = "none"; toast("The woods will teach you the rest."); });

// --- menu / loading / game over ---
addEventListener("pointerdown", () => { try { SFX.setMaster(settings.master); } catch (e) {} }, { once: true });
function assetsReady() {
  const mode = sessionStorage.getItem("forester_skip");
  sessionStorage.removeItem("forester_skip");
  if (mode === "new") { localStorage.removeItem(SAVE_KEY); doLoading(false); }
  else if (mode === "continue") doLoading(true);
  else {
    gameState = "menu";
    $("menu").style.display = "block";
    if (localStorage.getItem(SAVE_KEY)) $("menuContinue").style.display = "inline-block";
    MUSIC.play();
  }
}
$("menuNew").addEventListener("click", () => { localStorage.removeItem(SAVE_KEY); doLoading(false); });
$("menuContinue").addEventListener("click", () => doLoading(true));
$("goNew").addEventListener("click", () => { localStorage.removeItem(SAVE_KEY); sessionStorage.setItem("forester_skip", "new"); location.reload(); });
$("goMenu").addEventListener("click", () => { localStorage.removeItem(SAVE_KEY); location.reload(); });

const LOAD_LINES = ["Felling trees…", "Warming the hearth…", "Counting Deutsche Marks…", "Waking the chickens…", "Sharpening axes…"];
function doLoading(fromSave) {
  gameState = "loading";
  $("menu").style.display = "none";
  $("loading").style.display = "flex";
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(100, p + 4 + Math.random() * 9);
    $("loadBar").style.width = p + "%";
    $("loadText").textContent = fromSave && p > 60 ? "Reading the colony ledger…" :
      LOAD_LINES[Math.floor(p / 100 * (LOAD_LINES.length - 0.01))];
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        $("loading").style.display = "none";
        MUSIC.stop();
        const restored = fromSave && loadGame();
        gameState = "playing";
        if (!restored) {
          cam.x = -canvas.width / 2; cam.y = -canvas.height / 2 - 60;
          startCutscene();
        }
        toast(restored ? "The colony wakes where you left it." : "");
        syncUI();
      }, 250);
    }
  }, 90);
}
function gameOver() {
  if (gameState === "over") return;
  gameState = "over";
  localStorage.removeItem(SAVE_KEY);
  MUSIC.battle(false);
  SFX.fireLoop(false);
  SFX.gameOver();
  setTimeout(() => { if (gameState === "over") MUSIC.play(); }, 4200);
  const go = $("gameover");
  go.style.display = "block";
  go.getBoundingClientRect();          // force reflow so the transition runs
  go.style.opacity = "1";
}

function syncUI() {
  $("buildToggle").classList.toggle("active", !!buildMode);
  // in a daughter town's clearing, the HUD shows that town's ledger instead of the capital's
  const hudCx = cam.x + canvas.width / 2 / zoom, hudCy = cam.y + canvas.height / 2 / zoom;
  const hudTown = settlements.find(s => s.x !== undefined && Math.hypot(s.x - hudCx, s.y - hudCy) < 700);
  const hr = hudTown ? (hudTown.res || {}) : res;
  $("rName").textContent = (hudTown ? hudTown.name : settlementName).toUpperCase();
  $("govTitle").textContent = "GOVERNMENT OF " + settlementName.toUpperCase();
  $("rLogs").textContent = hr.logs || 0; $("rSeeds").textContent = hr.seeds || 0;
  $("rStone").textContent = hr.stone || 0; $("rIron").textContent = hr.iron || 0;
  $("rDoors").textContent = hr.doors || 0; $("rBread").textContent = hr.bread || 0;
  $("rMeat").textContent = hr.meat || 0; $("rWeapons").textContent = hr.weapons || 0;
  $("rTools").textContent = hudTown ? 0 : buildings.filter(b => b.type === "forge").reduce((n, b) => n + ((b.shop || []).filter(i => i.kind === "tool").length), 0);
  $("rDM").textContent = hr.dm || 0;
  $("rPop").textContent = hudTown ? hudTown.pop : civs.length;
  $("rTax").textContent = taxRate;
  $("rSeason").textContent = (season() === "winter" ? "❄ WINTER " : "SUMMER ") + colonyYear;
  const mm = Math.floor(taxTimer / 60), ss = Math.floor(taxTimer % 60);
  $("rTaxT").textContent = mm + ":" + String(ss).padStart(2, "0");
  const avg = civs.length ? Math.round(civs.reduce((s, c) => s + c.happiness, 0) / civs.length) : 0;
  $("rHappy").textContent = avg + "%";
  $("govHappy").textContent = avg + "%";
  $("govDM").textContent = res.dm + " DM";
  {
    const counts = {};
    for (const c of civs) counts[c.child ? "child" : (c.profession || "no trade")] = (counts[c.child ? "child" : (c.profession || "no trade")] || 0) + 1;
    const orderProfs = ["farmer", "hunter", "lumberjack", "quarryman", "forager", "blacksmith", "police", "soldier", "archer", "cavalry", "child", "no trade"];
    const parts = orderProfs.filter(p => counts[p]).map(p => `${p.charAt(0).toUpperCase() + p.slice(1)}: <b style="color:#c9a86a">${counts[p]}</b>`);
    for (const p of Object.keys(counts)) if (!orderProfs.includes(p)) parts.push(`${p}: <b style="color:#c9a86a">${counts[p]}</b>`);
    $("govProfs").innerHTML = parts.join(" &middot; ") || '<span style="color:#5a6b60">No one is left.</span>';
  }
  $("miCabin").textContent = `Log Cabin — ${costText(cabinCost())}`;
  $("miFarm").textContent = `Wheat Farm — ${costText(costOf("farm"))}`;
  $("miDoor").textContent = `Door — ${doorCost()} logs (selected civilian)`;
  $("miForge").textContent = has("forging") ? `Forge — ${costText(STATIC_COSTS.forge)}` : "Forge — needs Forging research";
  $("miTownhall").textContent = has("township") ? `Town Hall — ${costText(STATIC_COSTS.townhall)}` : "Town Hall — needs Township research";
  if ($("govPanel").style.display === "block" && $("civDrop").classList.contains("open")) {
    const list = $("civList");
    list.innerHTML = "";
    for (const c of civs) {
      const b = document.createElement("button");
      b.className = "btn menu-item";
      b.style.fontSize = "11px";
      b.textContent = `${c.name} — ${c.child ? "child" : (c.profession || "no trade")}, ${c.age !== undefined ? c.age : "?"} yrs — ${Math.round(c.happiness)}% happy` + (c.rebel ? " ⚠" : "");
      b.addEventListener("click", () => {
        selected = c; selectedBldg = null; selectedCamp = null;
        selGroup = groupable(c) ? [c] : [];
        cam.x = c.x - canvas.width / 2 / zoom;
        cam.y = c.y - canvas.height / 2 / zoom;
        $("civDrop").classList.remove("open");
        syncUI();
      });
      list.appendChild(b);
    }
    if (!civs.length) list.innerHTML = '<div style="padding:6px;color:#5a6b60;font-size:11px">No one is left.</div>';
  }
  // wagon runs between towns: send a supply crate out, or bring a town's stores home
  {
    const phys = settlements.filter(s => s.x !== undefined);
    const rows = $("townRows");
    const sig = phys.map(s => `${s.name}:${s.pop}`).join("|");
    if (rows.dataset.sig !== sig) {
      rows.dataset.sig = sig;
      rows.innerHTML = "";
      for (const s of phys) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;align-items:center;margin:4px 0;font-size:11px";
        row.innerHTML = `<span style="flex:1">${s.name} (pop ${s.pop})</span>`;
        const send = document.createElement("button");
        send.className = "btn"; send.style.fontSize = "10px"; send.textContent = "Send crate ▶";
        send.title = "10 logs, 4 bread, 2 meat from the capital";
        send.addEventListener("click", () => {
          if (res.logs < 10 || res.bread < 4 || res.meat < 2) return toast("A supply crate takes 10 logs, 4 bread and 2 meat from the capital stores.");
          res.logs -= 10; res.bread -= 4; res.meat -= 2;
          s.res = s.res || {}; s.res.logs = (s.res.logs || 0) + 10; s.res.bread = (s.res.bread || 0) + 4; s.res.meat = (s.res.meat || 0) + 2;
          SFX.pickup(); toast(`A wagon sets out for ${s.name} with a supply crate.`);
          syncUI();
        });
        const take = document.createElement("button");
        take.className = "btn"; take.style.fontSize = "10px"; take.textContent = "◀ Fetch stores";
        take.title = "Bring everything in this town's storage back to the capital";
        take.addEventListener("click", () => {
          const r = s.res || {};
          const total = Object.values(r).reduce((a, b) => a + (b || 0), 0);
          if (!total) return toast(`${s.name}'s stores are empty.`);
          for (const k of Object.keys(r)) { res[k] = (res[k] || 0) + (r[k] || 0); r[k] = 0; }
          SFX.coin(); toast(`A wagon returns from ${s.name} with ${total} goods for the capital.`);
          syncUI();
        });
        row.appendChild(send); row.appendChild(take);
        rows.appendChild(row);
      }
    }
  }
  $("scoutLedger").textContent = settlements.length >= 5 ? "The scouts rest — your settlements dot the map." :
    `Scouts' ledger toward a new settlement: ${Math.min(5, sackedCamps)}/5 camps sacked OR population ${Math.min(8, civs.length)}/8 · ` +
    (playT >= nextSettleAt ? "the hour is ripe" : `ready in ${Math.ceil((nextSettleAt - playT) / 60)} min`);
  $("researchNow").textContent = research ?
    `Researching ${TECH[research.id].name}: ${Math.round(research.t / techTime(TECH[research.id]) * 100)}%` : "No research underway.";
  if (research && $("techPanel").style.display === "block") renderTech();

  const p = $("civPanel");
  if (!selected) p.style.display = "none";
  else {
    p.style.display = "block"; $("bldgPanel").style.display = "none";
    $("cpName").textContent = selected.name.toUpperCase() + (selected.rebel ? " — REBEL" : "") +
      (selGroup.length > 1 && selGroup.includes(selected) ? ` (+${selGroup.length - 1} MORE)` : "");
    $("cpProf").textContent = (selected.profession || "none") + (selected.age !== undefined ? ` · age ${selected.age}` : "");
    $("cpHome").textContent = selected.home ? "housed" : "homeless";
    $("cpHpN").textContent = Math.round(selected.hp) + "/" + selected.maxHp;
    $("cpHp").style.width = Math.max(0, selected.hp / selected.maxHp * 100) + "%";
    $("cpHungerN").textContent = Math.round(selected.hunger);
    $("cpHunger").style.width = Math.max(0, selected.hunger) + "%";
    $("cpHappyN").textContent = Math.round(selected.happiness);
    $("cpHappy").style.width = Math.max(0, selected.happiness) + "%";
    $("cpTool").textContent = (selected.tool ? "good tool" : "none") + (selected.armed ? " · armed" : "");
    $("cpLogs").textContent = selected.inv.logs; $("cpSeeds").textContent = selected.inv.seeds;
    $("cpStone").textContent = selected.inv.stone; $("cpIron").textContent = selected.inv.iron;
    $("cpWheat").textContent = selected.inv.wheat; $("cpBread").textContent = selected.inv.bread;
    $("cpMeat").textContent = selected.inv.meat; $("cpDM").textContent = selected.inv.dm;
    const assigned = farms.filter(f => f.workers.includes(selected)).length;
    $("cpFarms").textContent = selected.profession === "farmer" ?
      `Tends ${assigned} farm(s). Click a farm to assign or unassign.` :
      selected.profession === "soldier" ? "Click a thief or raid camp to send them to sack it." : "";
    // send-to-town menu: any civilian can be rehoused in another town, any time
    const phys = settlements.filter(s => s.x !== undefined);
    const md = $("moveDrop");
    if (phys.length && !selected.child) {
      md.style.display = "block";
      const cur = selected.home ? townOf(selected.home) : null;
      const options = [];
      if (cur) options.push({ label: `to ${settlementName} (capital)`, target: null });
      for (const s of phys) if (s !== cur) options.push({ label: `to ${s.name} (pop ${s.pop})`, target: s });
      const sig = options.map(o => o.label).join("|");
      const menu = $("moveMenu");
      if (menu.dataset.sig !== sig) {
        menu.dataset.sig = sig;
        menu.innerHTML = "";
        for (const o of options) {
          const b = document.createElement("button");
          b.className = "btn menu-item"; b.style.width = "100%"; b.textContent = o.label;
          b.addEventListener("click", () => { md.classList.remove("open"); sendToTown(selected, o.target); });
          menu.appendChild(b);
        }
      }
    } else md.style.display = "none";
  }

  const bp = $("bldgPanel");
  if (selectedGrave) {
    bp.style.display = "block";
    const d = selectedGrave.deceased;
    $("bpName").textContent = "GRAVE OF " + d.name.toUpperCase();
    $("bpInfo").textContent = `${d.name}, ${d.profession}, ${d.cause} in the year ${d.year}, aged ${d.age}.` +
      (selectedGrave.stone ? " The stone stands." : " Awaiting a gravestone.");
    $("bpOcc").textContent = "at rest";
    $("bpDismantle").style.display = "none";
    $("bpBuyWeapon").style.display = "none";
    return;
  }
  if (!selectedBldg && !selectedCamp) bp.style.display = "none";
  else if (selectedCamp) {
    bp.style.display = "block";
    const cp = selectedCamp;
    $("bpName").textContent = cp.type === "thief" ? "THIEF CAMP" : "RAID CAMP";
    $("bpInfo").textContent = `Hostile. Strength ${Math.round(cp.hp)}/${cp.maxHp}. Rumoured loot: DM and weapons. Send soldiers to sack it.`;
    $("bpOcc").textContent = "—";
    $("bpDismantle").style.display = "none";
  } else {
    bp.style.display = "block";
    $("bpDismantle").style.display = "block";
    const b = selectedBldg;
    const isFarm = farms.includes(b);
    $("bpName").textContent = isFarm ? "WHEAT FARM" : (BLDG_NAMES[b.type] || b.type).toUpperCase();
    $("bpInfo").textContent = isFarm ? `${b.workers.length} farmer(s) assigned; ${b.ready ? "crop is ripe" : "crop growing"}.` :
      b.type === "burned" ? "Select a civilian and click the ruin to order its repair (20 logs + 1 door)." :
      b.fire ? "IT IS ON FIRE." :
      b.type === "watchtower" ? "Warns of raids; nearby police & soldiers fight harder." :
      b.type === "bakery" ? "Bakes town wheat into bread over time." :
      b.type === "well" ? "Fresh water. The colony is happier for it." :
      b.type === "forge" ? `Blacksmith's shop. On the racks: ${(b.shop || []).filter(i => i.kind === "tool").length} tool(s). Civilians buy tools with their own coin; forged weapons go straight to the armoury.` :
      b.type === "townhall" ? "Civilians bring their goods here on their own — no more asking." :
      b.type === "wall" ? "Keeps raiders out — until they put a torch to it." :
      b.type === "gate" ? "Your people pass freely; raiders must burn it down." : "Standing.";
    $("bpOcc").textContent = isFarm ? "—" : (b.occupants.length ? b.occupants.map(o => o.name).join(", ") : "none");
    $("bpBuyWeapon").style.display = (!isFarm && b.type === "forge" && (b.shop || []).some(i => i.kind === "weapon")) ? "block" : "none";
  }
}

// --- simulation ---
function update(dt) {
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) msgEl.textContent = "";
  const fast = keys["shift"] ? 2.6 : 1;
  const up = keys["w"] || keys["arrowup"], dn = keys["s"] || keys["arrowdown"];
  const lf = keys["a"] || keys["arrowleft"], rt = keys["d"] || keys["arrowright"];
  if (up) cam.y -= CAM_SPEED * settings.camSpeed * fast / zoom * dt;
  if (dn) cam.y += CAM_SPEED * settings.camSpeed * fast / zoom * dt;
  if (lf) cam.x -= CAM_SPEED * settings.camSpeed * fast / zoom * dt;
  if (rt) cam.x += CAM_SPEED * settings.camSpeed * fast / zoom * dt;
  mouse.wx = cam.x + mouse.x / zoom;
  mouse.wy = cam.y + mouse.y / zoom;
  SFX.windLoop(gameState === "playing" && zoom < 0.62);   // high in the sky, only wind

  if (paused) return;

  worldT += dt;
  updateTutorial(dt);
  rescueStuck(dt);
  updateNationWars(dt);
  updateNationTrade(dt);
  if (civs.length >= 10) vignette("village");
  if (difficulty() > lastTier) {
    lastTier = difficulty();
    toast("⚠ Word of your colony's wealth spreads. The woods grow bolder…");
  }
  updateResearch(dt);
  playT += dt;
  updateWars(dt);
  updateSettlements(dt);
  maybeOfferSettlement();

  for (const f of floaters) { f.t -= dt; f.y -= 26 * dt; }
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t <= 0) floaters.splice(i, 1);
  for (const sm of smokes) { sm.t -= dt; sm.y -= 16 * dt; sm.x += sm.vx * dt * 0.4; sm.r += 2.4 * dt; }
  for (let i = smokes.length - 1; i >= 0; i--) if (smokes[i].t <= 0) smokes.splice(i, 1);

  // global tax clock
  taxTimer -= dt;
  if (taxTimer <= 0) {
    taxTimer = TAX_PERIOD;
    let total = 0;
    for (const c of civs) if (c.home && !c.rebel) {
      const due = taxRate + taxBonus();
      const paid = Math.min(c.inv.dm, due);
      c.inv.dm -= paid; res.dm += paid; total += paid;
      if (paid > 0) float(c.x, c.y - 70, "-" + paid + " DM", "#c9a86a");
    }
    toast(total > 0 ? `Tax day: the colony collects ${total} DM.` : "Tax day — but the people's pockets are empty.");
    if (total > 0) SFX.coin();
  }

  for (const ch of visibleChunks(CHUNK * 2))
    for (const t of ch.trees)
      if (t.alive && t.growth < 1) t.growth = Math.min(1, t.growth + dt / (SAPLING_GROW * (has("replanting") ? 0.5 : 1)));
  if (season() !== lastSeason) {
    lastSeason = season();
    if (lastSeason === "winter") {
      colonyYear++;
      toast(`❄ Winter falls over the woods — the year turns to ${colonyYear}. The fields sleep; keep the larders full.`);
      vignette("firstWinter");
      for (const c of [...civs]) {
        c.age = (c.age || 20) + 1;
        if (!c.child && c.age > 55 && Math.random() < (c.age - 55) * 0.05)
          killCiv(c, `died peacefully of old age, aged ${c.age}`);
      }
    } else {
      toast("The thaw comes — the fields wake, and the woods turn green again.");
      // spring births: each woman has a 26% chance of a child after every winter
      for (const m of civs.filter(c => c.gender === "f" && !c.child)) {
        if (Math.random() < 0.26) {
          const g = Math.random() < 0.5 ? "f" : "m";
          const kid = mkCiv(nextName(g), g === "f" ? "sister" : "brother", m.x + 14, m.y + 10, g);
          kid.child = true; kid.growT = 0; kid.age = 0;
          kid.home = m.home;
          if (m.home) m.home.occupants.push(kid);
          civs.push(kid);
          toast(`A child is born to ${m.name}: a ${g === "f" ? "daughter" : "son"}, ${kid.name}.`);
          SFX.pickup();
          vignette("firstChild");
        }
      }
    }
  }
  for (const f of farms) if (!f.ready && season() !== "winter" && (f.growT += dt) >= farmRipen()) f.ready = true;
  SFX.fireLoop(buildings.some(b => b.fire > 0));
  for (const b of [...buildings]) {
    igniteCheck(b, dt);
    if (settings.smoke && !b.fire && (b.type === "bakery" || (b.type === "cabin" && b.occupants.length))) {
      b.smokeT = (b.smokeT === undefined ? Math.random() * 8 : b.smokeT) - dt;
      if (b.smokeT <= 0) {
        b.smokeT = 8 + Math.random() * 14;
        const sx = b.x + (b.type === "bakery" ? 6 : -16), sy = b.y - BLDG_SIZE + 10;
        for (let i = 0; i < 4; i++)
          smokes.push({ x: sx + Math.random() * 4 - 2, y: sy, r: 3 + Math.random() * 2,
                        vx: 4 + Math.random() * 5, t: 2.6 + i * 0.5, max: 2.6 + i * 0.5 });
      }
    }
    if (b.type === "bakery" && !b.fire && !b.site) {
      b.bakeT = (b.bakeT || 0) + dt;
      if (b.bakeT >= 20) {
        b.bakeT = 0;
        if (res.wheat >= 2) { res.wheat -= 2; res.bread++; float(b.x, b.y - 100, "+1 bread", "#c9a86a"); }
      }
    }
  }

  if (buildings.some(b => b.type === "recruit" && !b.fire && !b.site)) {
    hunterTimer -= dt;
    if (hunterTimer <= 0) {
      hunterTimer = 100 + Math.random() * 80;
      if (visitors.length < 2) spawnVisitor();
    }
  }
  for (const v of [...visitors]) updateVisitor(v, dt);

  // raids
  if (has("defending") || has("raiding")) {
    campRespawnTimer -= dt;
    if (campRespawnTimer <= 0) { campRespawnTimer = 300; spawnCamps(1); }
  }
  if (camps.length) {
    raidTimer -= dt;
    if (raidTimer <= 0) {
      raidTimer = (RAID_MIN + Math.random() * (RAID_MAX - RAID_MIN)) * Math.pow(0.88, difficulty() - 1);
      if (season() !== "winter") spawnRaid();   // raiders overwinter in their camps
    }
    for (const cp of camps) {
      cp.fortT = (cp.fortT === undefined ? 200 : cp.fortT) - dt;
      if (cp.fortT <= 0) {
        cp.fortT = 260;
        if ((cp.fort || 0) < 3) {
          cp.fort = (cp.fort || 0) + 1;
          cp.hp += 40; cp.maxHp += 40;
          if (Math.random() < 0.6) toast(`The ${cp.type} camp raises another ring of stakes.`);
        }
      }
    }
    patrolT = (patrolT || 0) - dt;
    if (patrolT <= 0) {
      patrolT = 20;
      for (const cp of camps) {
        const onWatch = raiders.filter(r => r.camp === cp && r.state === "patrol").length;
        if (onWatch < 2 && raiders.length < MAX_RAIDERS + 8) raiders.push(mkRaider(cp, "patrol"));
      }
    }
  }
  if (season() !== "winter" && nightAmt() > 0.9 && camps.length && res.dm >= 5 &&
      !buildings.some(b => (b.type === "wall" || b.type === "gate") && !b.fire)) {
    ambushT -= dt;
    if (ambushT <= 0) {
      ambushT = (140 + Math.random() * 90) * Math.pow(0.9, difficulty() - 1);
      const guards = civs.filter(c => isForce(c) && c.state !== "sleeping");
      const targets = buildings.filter(b => b.type !== "burned" && !b.fire);
      if (targets.length && raiders.filter(r => r.state !== "patrol").length < MAX_RAIDERS + 2) {
        let camp = camps[0], bd = Infinity;
        for (const cp of camps) { const d = Math.hypot(cp.x, cp.y); if (d < bd) { bd = d; camp = cp; } }
        for (let i = 0; i < 3; i++) {
          const r = mkRaider(camp, "approach");
          r.target = targets[Math.floor(Math.random() * targets.length)];
          r.arsonist = Math.random() < 0.5;   // half come to burn, half to steal
          if (guards.length && i === 0) r.foe = guards[Math.floor(Math.random() * guards.length)];
          raiders.push(r);
        }
        toast("⚠ Raiders pour out of the dark — the town is unwalled and they know it!");
      }
    }
  } else ambushT = Math.max(ambushT, 25);
  for (const r of [...raiders]) updateRaider(r, dt);
  // arrows fly true — they track their mark and strike home or fall
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    const alive = a.target && (civs.includes(a.target) || raiders.includes(a.target));
    if (!alive) { arrows.splice(i, 1); continue; }
    const dx = a.target.x - a.x, dy = (a.target.y - 24) - a.y, d = Math.hypot(dx, dy);
    if (d < 14) {
      strikeUnit(a.from && civs.includes(a.from) ? a.from : { task: null }, a.target, a.dmg);
      arrows.splice(i, 1);
      continue;
    }
    a.vx = dx / d; a.vy = dy / d;
    a.x += a.vx * 420 * dt; a.y += a.vy * 420 * dt;
  }
  // the watchtower sounds the war-drums — until the raiders leave, or die
  const towers = buildings.filter(b => b.type === "watchtower" && !b.fire && !b.site);
  const threat = towers.length > 0 && raiders.some(r => r.state !== "patrol" &&
    towers.some(tw => Math.hypot(tw.x - r.x, tw.y - r.y) < 750));
  MUSIC.battle(threat && gameState === "playing");

  for (const c of [...civs]) {
    c.hunger = Math.max(0, c.hunger - HUNGER_DECAY * (has("horsefeed") ? 0.8 : 1) * (season() === "winter" ? 1.15 : 1) * dt);
    if (c.hunger <= 0) {
      c.hp -= STARVE_DPS * dt;
      if (c.hp <= 0) { killCiv(c, "starved to death"); continue; }
    }

    if (c.age === undefined) c.age = 20 + Math.floor(Math.random() * 26);
    if (c.child) {
      c.growT = (c.growT || 0) + dt;
      if (c.growT >= 300) { c.child = false; toast(`${c.name} has come of age and joins the working colony.`); }
    }
    const target = happinessTarget(c);
    c.happiness += Math.sign(target - c.happiness) * Math.min(Math.abs(target - c.happiness), 2.5 * dt);
    maybeRebel(c);

    // winter cold: five minutes in the open kills (guards last seven)
    if (season() === "winter") {
      if (c.state === "sleeping" || c.state === "warming") {
        c.coldT = Math.max(0, c.coldT - dt * 8);
      } else {
        c.coldT = (c.coldT || 0) + dt;
        const limit = isForce(c) ? 210 : 150;
        if (c.coldT > limit - 60 && !c.coldWarned) {
          c.coldWarned = true;
          toast(c.home ? `❄ ${c.name} is freezing — they need to get indoors.` :
                         `❄ ${c.name} is freezing in the open — without a roof, the cold will take them.`);
        }
        if (c.coldT > limit) {
          c.hp -= 2 * dt;
          if (Math.random() < dt * 1.5) float(c.x, c.y - 74, "❄", "#bcd8e8");
          if (c.hp <= 0) { killCiv(c, "froze to death in the open"); continue; }
        }
      }
    } else { c.coldT = 0; c.coldWarned = false; }

    // housed folk duck inside to warm up before the cold turns deadly —
    // dropping their work if the frost is close on their heels
    if (season() === "winter" && c.home && !c.rebel &&
        !["warming", "sleeping", "fighting", "sieging"].includes(c.state) &&
        (!c.task || c.task.kind !== "warmUp")) {
      const danger = c.coldT > (isForce(c) ? 210 : 150) - 70;   // freezing starts at 150/210: leave a real margin
      const idleChill = c.state === "idle" && c.coldT > 60;
      if (danger || idleChill) {
        if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
        order(c, { kind: "warmUp", x: c.home.x, y: c.home.y + 12 });
      }
    }

    const nightNow = nightAmt();
    if (c.state === "sleeping") {
      if (nightNow < 0.05) { c.state = "idle"; c.x = c.home ? c.home.x : c.x; c.y = c.home ? c.home.y + 18 : c.y; }
      else continue;
    }
    if (c.state === "warming") {
      c.workT += dt;
      if (c.workT >= 18 || season() !== "winter") {
        c.state = "idle"; c.coldT = 0; c.coldWarned = false;
        c.x = c.home ? c.home.x : c.x; c.y = c.home ? c.home.y + 18 : c.y;
      } else continue;
    }
    if (c.state === "healing") {
      if (c.hp >= c.maxHp) { c.state = "idle"; toast(`${c.name} is eaten back to full health.`); }
      else {
        c.workT = (c.workT || 0) + dt;
        if (c.workT >= 1.4) {
          c.workT = 0;
          if (c.inv.bread > 0) { c.inv.bread--; eat(c, "bread"); }
          else if (c.inv.meat > 0) { c.inv.meat--; eat(c, "meat"); }
          else if (c.inv.wheat > 0) { c.inv.wheat--; eat(c, "wheat"); }
          else if (res.bread > 0) { res.bread--; eat(c, "bread"); }
          else if (res.meat > 0) { res.meat--; eat(c, "meat"); }
          else { c.state = "idle"; toast(`${c.name} has no food left to heal with — the larders are bare.`); }
          if (c.state === "healing" && c.hp >= c.maxHp) { c.state = "idle"; toast(`${c.name} is eaten back to full health.`); }
        }
        continue;
      }
    }
    if (nightNow > 0.5 && !isForce(c) && !c.rebel && c.home && c.state === "idle")
      order(c, { kind: "goHome", x: c.home.x, y: c.home.y + 12 });

    if (c.rebel) rebelAI(c);
    if (isForce(c) && !c.rebel) forceAI(c);

    const speed = walkSpeed(c);
    if (c.state === "walking") {
      if (c.task && c.task.kind === "attack" && c.task.target) {
        const t = c.task.target;
        if (!civs.includes(t) && !raiders.includes(t)) { c.state = "idle"; c.task = null; continue; }
        c.tx = t.x; c.ty = t.y;
      }
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      const reach = c.task && c.task.kind === "attack" ? 34 : (c.path && c.path.length ? 10 : 5);
      if (d < reach) {
        if (c.path && c.path.length) {
          c.path.shift();
          if (c.path.length) { c.tx = c.path[0][0]; c.ty = c.path[0][1]; }
          else if (c.task) { c.tx = c.task.x; c.ty = c.task.y; }
        } else if (c.viaGate && c.task) {
          // through the gate — now on to where we were actually going
          c.viaGate = false;
          c.tx = c.task.x; c.ty = c.task.y;
        } else {
          if (reach === 5) { c.x = c.tx; c.y = c.ty; }
          arrive(c);
        }
      }
      else if (c.task && c.task.kind === "emigrate") {
        // leaving the world: nothing on the map may hold them back
        c.x += (dx / d) * speed * dt; c.y += (dy / d) * speed * dt;
        c.facing = dx < 0 ? -1 : 1; c.anim += dt * 8;
      }
      else {
        collideMove(c, c.x + (dx / d) * speed * dt, c.y + (dy / d) * speed * dt);
        c.facing = dx < 0 ? -1 : 1;
        c.anim += dt * 8;
        c.stepT = (c.stepT || 0) - dt;
        if (c.stepT <= 0 && onScreen(c.x, c.y)) {
          const fast = isForce(c);
          SFX.step(fast);
          c.stepT = fast ? 0.26 : 0.36;
        }
      }
    } else if (c.state === "chopping") {
      const t = c.task.target;
      if (!t.alive) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; t.progress = c.workT / chopTime(c); c.anim += dt * 10;
      if ((c.workT % 0.5) < dt) SFX.chop();
      if (c.workT >= chopTime(c)) {
        t.alive = false; t.progress = -1;
        markChunkDirty(t.x, t.y);
        SFX.treeFall();
        c.inv.logs += logsPerTree();
        float(c.x, c.y - 70, "+" + logsPerTree() + " logs", "#7da083");
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "quarrying") {
      const s = c.task.target;
      if (!s.alive) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; s.progress = c.workT / (QUARRY_TIME * workMul(c)); c.anim += dt * 10;
      if ((c.workT % 0.55) < dt) SFX.quarry();
      if (c.workT >= QUARRY_TIME * workMul(c)) {
        s.alive = false; s.progress = -1;
        markChunkDirty(s.x, s.y);
        c.inv.stone += 3; c.inv.iron += 1;
        float(c.x, c.y - 70, "+3 stone +1 iron", "#7da083");
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "gathering") {
      const p = c.task.target;
      if (!p.alive) { c.state = "idle"; c.task = null; continue; }
      const need = PATCH_TIME * (has("foraging") ? 0.5 : 1) * workMul(c);
      c.workT += dt; p.progress = c.workT / need; c.anim += dt * 8;
      if ((c.workT % 0.4) < dt) SFX.rustle();
      if (c.workT >= need) {
        p.alive = false; p.progress = -1;
        markChunkDirty(p.x, p.y);
        const got = 2 + (has("foraging") ? 1 : 0);
        if (c.task.forColony) res.seeds += got; else c.inv.seeds += got;
        SFX.pickup();
        float(c.x, c.y - 70, "+" + got + " seeds", "#7da083");
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "crafting") {
      c.workT += dt; c.anim += dt * 6;
      if ((c.workT % 0.6) < dt) SFX.hammer();
      if (c.workT >= CRAFT_TIME * workMul(c)) {
        res.doors++;
        toast(`${c.name} finished a rough plank door. Doors: ${res.doors}.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "smithing") {
      c.workT += dt; c.anim += dt * 6;
      if ((c.workT % 0.55) < dt) SFX.hammer();
      if (c.workT >= SMITH_TIME * workMul(c)) {
        if (c.task.make === "weapon") {
          // weapons go straight to the armoury; the treasury pays the smith when it can
          res.weapons++;
          if (res.dm - 12 >= treasuryFloor()) {
            res.dm -= 12; c.inv.dm += 12; SFX.coin();
            float(c.x, c.y - 70, "+12 DM", "#c9a86a");
            toast(`${c.name} forges a weapon — bought for 12 DM and racked in the armoury.`);
          } else toast(`${c.name} forges a weapon for the armoury — the treasury too thin to pay the smithy.`);
        } else {
          const shopForge = buildings.find(b => b.type === "forge" && !b.fire && !b.site);
          if (shopForge) {
            shopForge.shop = shopForge.shop || [];
            shopForge.shop.push({ kind: c.task.make, by: c.name });
            toast(`${c.name} finishes a ${c.task.make} and sets it for sale at the forge.`);
          }
        }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "repairing") {
      const b = c.task.target;
      if (!buildings.includes(b)) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; b.progress = c.workT / (REPAIR_TIME * workMul(c)); c.anim += dt * 10;
      if ((c.workT % 0.55) < dt) SFX.hammer();
      if (c.workT >= REPAIR_TIME * workMul(c)) {
        b.type = "cabin"; b.progress = -1; b.placed = false;
        toast(`The ruin stands whole again. ${c.name} rebuilt it.`);
        vignette("cabinDone");
        c.state = "idle"; c.task = null;
        for (const cc of civs) if (!cc.home) houseCiv(cc);
      }
    } else if (c.state === "buildingFarm") {
      c.workT += dt; c.anim += dt * 8;
      if ((c.workT % 0.6) < dt) SFX.hammer();
      if (c.workT >= BASE_FARM_BUILD * workMul(c)) {
        const t = c.task;
        if (legalToBuild("farm", t.fx, t.fy)) {
          const f = { x: t.fx, y: t.fy, ready: false, growT: 0, workers: [], progress: -1 };
          if (c.profession === "farmer") f.workers.push(c);
          farms.push(f);
          evictFromFootprint({ type: "farm", x: t.fx, y: t.fy });
          toast(`${c.name} finished a little wheat farm.`);
        }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "harvesting") {
      const f = c.task.target;
      if (!f.ready || !farms.includes(f)) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; f.progress = c.workT / (HARVEST_TIME * workMul(c)); c.anim += dt * 8;
      if ((c.workT % 0.45) < dt) SFX.rustle();
      if (c.workT >= HARVEST_TIME * workMul(c)) {
        f.ready = false; f.growT = 0; f.progress = -1;
        c.inv.wheat += 2; c.inv.bread += 1;
        SFX.pickup();
        float(c.x, c.y - 70, "+2 wheat +1 bread", "#7da083");
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "digging") {
      const cp = c.task && c.task.target;
      if (!cp || !corpses.includes(cp)) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; c.anim += dt * 8;
      if ((c.workT % 0.6) < dt) SFX.chop();
      if (c.workT >= 3) {
        corpses.splice(corpses.indexOf(cp), 1);
        graves.push({ x: c.task.gx, y: c.task.gy, stone: false, mason: null, deceased: cp.deceased });
        toast(`${c.name} lays ${cp.deceased.name} to rest. A stone is owed.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "masonry") {
      const gv = c.task && c.task.target;
      if (!gv || !graves.includes(gv) || gv.stone) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; c.anim += dt * 8;
      if ((c.workT % 0.55) < dt) SFX.quarry();
      if (c.workT >= 2.5) {
        if (c.inv.stone >= 1) c.inv.stone--; else if (res.stone >= 1) res.stone--;
        gv.stone = true; gv.mason = null;
        toast(`${c.name} sets a gravestone for ${gv.deceased.name}. The colony remembers.`);
        SFX.build();
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "raising") {
      const b = c.task.target;
      const isFarmSite = farms.includes(b);
      if ((!buildings.includes(b) && !isFarmSite) || !b.site) { c.state = "idle"; c.task = null; continue; }
      const need = (BUILD_TIMES[isFarmSite ? "farm" : b.type] || 8) * workMul(c);
      c.workT += dt; b.progress = c.workT / need; c.anim += dt * 8;
      if ((c.workT % 0.6) < dt) SFX.hammer();
      if (c.workT >= need) {
        if (isFarmSite) {
          b.site = false; b.progress = -1;
          if (c.profession === "farmer" && !b.workers.includes(c)) b.workers.push(c);
          toast("The farm is built and ready for planting.");
          SFX.build();
        } else finishConstruction(b);
        b.builder = null;
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "shopping") {
      const f = c.task.target;
      if (!buildings.includes(f) || !(f.shop || []).length) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt;
      if (c.workT >= 1.5) {
        const mayArm = laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter") || isForce(c);
        const wantKind = (!c.tool && f.shop.some(i => i.kind === "tool")) ? "tool" :
                         (mayArm && !c.armed && f.shop.some(i => i.kind === "weapon")) ? "weapon" : null;
        if (wantKind) {
          const price = wantKind === "tool" ? TOOL_PRICE_SELF : 12;
          if (c.inv.dm >= price) {
            const idx = f.shop.findIndex(i => i.kind === wantKind);
            const item = f.shop.splice(idx, 1)[0];
            c.inv.dm -= price;
            const smith = civs.find(o => o.name === item.by && o.profession === "blacksmith");
            if (smith) { smith.inv.dm += price; float(smith.x, smith.y - 70, "+" + price + " DM", "#c9a86a"); }
            else res.dm += price;
            if (wantKind === "tool") c.tool = true; else c.armed = true;
            float(c.x, c.y - 70, "+1 " + wantKind, "#7da083");
            SFX.coin();
            toast(`${c.name} buys a ${wantKind} at the forge${smith ? ` — ${item.by} pockets ${price} DM` : ""}.`);
          }
        }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "depositing") {
      if (!buildings.includes(c.task.target)) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt;
      if (c.workT >= 1.2) {
        const inv = c.inv, led = ledgerOf(c);
        const moved = inv.logs + inv.seeds + inv.stone + inv.iron + inv.wheat + inv.bread + inv.meat;
        led.logs += inv.logs; led.seeds += inv.seeds; led.stone += inv.stone; led.iron += inv.iron;
        led.wheat += inv.wheat; led.bread += inv.bread; led.meat += inv.meat;
        inv.logs = inv.seeds = inv.stone = inv.iron = inv.wheat = inv.bread = inv.meat = 0;
        if (moved) { float(c.x, c.y - 70, "+" + moved + " stored", "#7da083"); SFX.pickup(); }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "peddling") {
      const b2 = c.task.target;
      if (!civs.includes(b2) || Math.hypot(b2.x - c.x, b2.y - c.y) > 90) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt;
      if (c.workT >= 1.5) {
        const price = Math.min(b2.inv.dm, Math.max(1, sellPrice() - 1));
        if (price > 0 && (c.inv.bread > 0 || c.inv.meat > 0)) {
          if (c.inv.bread > 0) { c.inv.bread--; b2.inv.bread++; } else { c.inv.meat--; b2.inv.meat++; }
          b2.inv.dm -= price; c.inv.dm += price;
          float(c.x, c.y - 70, "+" + price + " DM", "#c9a86a");
          float(b2.x, b2.y - 70, "+1 food", "#7da083");
        }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "trading") {
      const v = c.task.target;
      if (!visitors.includes(v) || v.state !== "waiting") { c.state = "idle"; c.task = null; continue; }
      c.workT += dt;
      if (c.workT >= 2) {
        if (c.inv.bread > 0) c.inv.bread--; else if (c.inv.meat > 0) c.inv.meat--;
        const price = sellPrice() + 2;
        c.inv.dm += price;
        v.traded = true;
        v.goodwill = (v.goodwill || 0) + 4;   // a full belly warms a wanderer to the colony
        float(c.x, c.y - 70, "+" + price + " DM", "#c9a86a");
        SFX.coin();
        toast(`${c.name} trades provisions to ${v.name} the traveller at a good price.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "selling") {
      c.workT += dt;
      if (c.workT >= 2) {
        let earned = 0;
        while (c.inv.bread + c.inv.meat > 1) {
          if (c.inv.bread > 0) c.inv.bread--; else c.inv.meat--;
          c.inv.dm += sellPrice(); earned += sellPrice();
        }
        if (earned) { float(c.x, c.y - 70, "+" + earned + " DM", "#c9a86a"); SFX.coin(); }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "hunting") {
      c.workT += dt; c.anim = 1;
      if (c.workT >= 6) { c.inv.meat += 2; float(c.x, c.y - 70, "+2 meat", "#7da083"); c.state = "idle"; c.task = null; }
    } else if (c.state === "fighting") {
      const foe = c.task && c.task.target;
      const foeAlive = foe && (civs.includes(foe) || raiders.includes(foe));
      if (!foeAlive) { c.state = "idle"; c.task = null; continue; }
      const d = Math.hypot(foe.x - c.x, foe.y - c.y);
      if (c.profession === "archer") {
        // archers stand off and loose arrows
        if (d > ARCHER_RANGE + 60) { c.state = "walking"; c.tx = foe.x; c.ty = foe.y; continue; }
        if (d > ARCHER_RANGE) collideMove(c, c.x + ((foe.x - c.x) / d) * speed * dt, c.y + ((foe.y - c.y) / d) * speed * dt);
        c.facing = foe.x < c.x ? -1 : 1;
        c.anim += dt * 3;
        c.atkT -= dt;
        if (c.atkT <= 0 && d <= ARCHER_RANGE + 10) {
          c.atkT = ARCHER_INTERVAL;
          let dmg = archerDmg();
          if (nearWatchtower(c.x, c.y)) dmg += 5;
          SFX.arrow();
          arrows.push({ x: c.x, y: c.y - 26, target: foe, from: c, dmg });
        }
        continue;
      }
      if (d > 130) { c.state = "walking"; c.tx = foe.x; c.ty = foe.y; continue; }
      const lance = c.profession === "cavalry" && has("lances");   // distance cavalry: strike from lance reach
      const stand = lance ? 74 : 30, reach = lance ? 92 : 48;
      if (d > stand) collideMove(c, c.x + ((foe.x - c.x) / d) * speed * dt, c.y + ((foe.y - c.y) / d) * speed * dt);
      c.facing = foe.x < c.x ? -1 : 1;
      c.anim += dt * 9;
      c.atkT -= dt;
      if (c.atkT <= 0 && d < reach) {
        c.atkT = ATK_INTERVAL;
        let dmg = isForce(c) ? forceDmg(c) : (c.armed ? weaponDmg() : FIST_DMG);
        if (isForce(c) && nearWatchtower(c.x, c.y)) dmg += 5;
        if (isForce(c) || c.armed) SFX.swing(); else SFX.swingFist();
        strikeUnit(c, foe, dmg);
      }
    } else if (c.state === "sieging") {
      const cp = c.task.target;
      if (!camps.includes(cp)) { c.state = "idle"; c.task = null; continue; }
      c.facing = cp.x < c.x ? -1 : 1;
      c.anim += dt * 9;
      c.atkT -= dt;
      if (c.atkT <= 0) {
        c.atkT = ATK_INTERVAL;
        const dmg = forceDmg(c);
        SFX.swing();
        cp.hp -= dmg;
        float(cp.x, cp.y - 100, "-" + dmg, "#d86a5a");
        SFX.hit();
        // the camp fights back
        if (Math.random() < DODGE_CHANCE) float(c.x, c.y - 70, "Dodged!", "#cfd8d3");
        else {
          const ret = (cp.type === "raid" ? 11 : 7) + (cp.fort || 0) * 2;
          c.hp -= ret;
          float(c.x, c.y - 70, "-" + ret, "#d86a5a");
          if (c.hp <= 0) { killCiv(c, "fell storming the camp"); continue; }
        }
        if (cp.hp <= 0) {
          camps.splice(camps.indexOf(cp), 1);
          campRespawnTimer = Math.max(campRespawnTimer, 240);   // the woods stay quiet a while after a sack
          res.dm += cp.dm; res.weapons += cp.weapons;
          SFX.coin();
          float(cp.x, cp.y - 80, `+${cp.dm} DM +${cp.weapons} wpn`, "#7da083");
          sackedCamps++;
          toast(`${c.name} sacks the ${cp.type} camp — ${cp.dm} DM and ${cp.weapons} weapon(s) seized! (${sackedCamps} camps sacked)`);
          if (selectedCamp === cp) selectedCamp = null;
          c.state = "idle"; c.task = null;
        }
      }
    } else if (c.state === "torching") {
      const b = c.task.target;
      if (!buildings.includes(b) || b.fire) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; b.torchP = c.workT / torchTime(); c.anim += dt * 9;
      if ((c.workT % 0.35) < dt) SFX.crackle();
      if (c.workT >= torchTime()) {
        b.torchP = -1; b.fire = FIRE_TIME;
        toast(`⚠ ${c.name} has set the ${b.type === "cabin" ? "cabin" : b.type} ablaze!`);
        c.state = "idle"; c.task = null;
      }
    } else {
      c.anim = 1;
      if (Math.random() < dt * 0.25) c.facing = -c.facing;
      autonomy(c, dt);
    }
  }
}

// --- rendering ---
function drawSprite(image, wx, wyFeet, size, flip) {
  ctx.save(); ctx.translate(wx, wyFeet);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, -size / 2, -size, size, size);
  ctx.restore();
}
function bar(wx, wyTop, frac, color, w = 44) {
  ctx.fillStyle = "#0a0f0c"; ctx.fillRect(wx - w / 2 - 1, wyTop - 1, w + 2, 8);
  ctx.fillStyle = "#1c2a21"; ctx.fillRect(wx - w / 2, wyTop, w, 6);
  ctx.fillStyle = color; ctx.fillRect(wx - w / 2, wyTop, w * Math.min(1, Math.max(0, frac)), 6);
}

let fireAnim = 0;
function render(dt) {
  fireAnim += dt * 8;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#17251c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoom, 0, 0, zoom, -cam.x * zoom, -cam.y * zoom);
  ctx.imageSmoothingEnabled = false;

  const vw = canvas.width / zoom, vh = canvas.height / zoom;
  const x0 = Math.floor(cam.x / TILE) * TILE, y0 = Math.floor(cam.y / TILE) * TILE;
  for (let y = y0; y < cam.y + vh; y += TILE)
    for (let x = x0; x < cam.x + vw; x += TILE)
      ctx.drawImage(wimg("grass"), x, y, TILE, TILE);

  // territory overlay: cubic cells, custom colours
  const tc0 = tcellOf(cam.x, cam.y), tc1 = tcellOf(cam.x + vw, cam.y + vh);
  ctx.fillStyle = territoryColor + "22";
  for (let cy = tc0[1]; cy <= tc1[1]; cy++) for (let cx = tc0[0]; cx <= tc1[0]; cx++)
    if (territory.has(tkey(cx, cy))) ctx.fillRect(cx * TCELL, cy * TCELL, TCELL, TCELL);
  ctx.beginPath();
  const CH = 22;  // chamfer size — cuts the corners so the border isn't purely cubic
  for (let cy = tc0[1] - 1; cy <= tc1[1] + 1; cy++) for (let cx = tc0[0] - 1; cx <= tc1[0] + 1; cx++) {
    if (!territory.has(tkey(cx, cy))) continue;
    const x = cx * TCELL, y = cy * TCELL;
    const N = !territory.has(tkey(cx, cy - 1)), S = !territory.has(tkey(cx, cy + 1));
    const W = !territory.has(tkey(cx - 1, cy)), E = !territory.has(tkey(cx + 1, cy));
    if (N) { ctx.moveTo(x + (W ? CH : 0), y); ctx.lineTo(x + TCELL - (E ? CH : 0), y); }
    if (S) { ctx.moveTo(x + (W ? CH : 0), y + TCELL); ctx.lineTo(x + TCELL - (E ? CH : 0), y + TCELL); }
    if (W) { ctx.moveTo(x, y + (N ? CH : 0)); ctx.lineTo(x, y + TCELL - (S ? CH : 0)); }
    if (E) { ctx.moveTo(x + TCELL, y + (N ? CH : 0)); ctx.lineTo(x + TCELL, y + TCELL - (S ? CH : 0)); }
    if (N && W) { ctx.moveTo(x + CH, y); ctx.lineTo(x, y + CH); }
    if (N && E) { ctx.moveTo(x + TCELL - CH, y); ctx.lineTo(x + TCELL, y + CH); }
    if (S && W) { ctx.moveTo(x + CH, y + TCELL); ctx.lineTo(x, y + TCELL - CH); }
    if (S && E) { ctx.moveTo(x + TCELL - CH, y + TCELL); ctx.lineTo(x + TCELL, y + TCELL - CH); }
  }
  // openfront look: wide soft band of the territory colour under a crisp border line
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = territoryColor + "55"; ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = borderColor; ctx.lineWidth = 2.5;
  ctx.stroke();

  const inView = (x, y) => x > cam.x - 140 && x < cam.x + vw + 140 && y > cam.y - 160 && y < cam.y + vh + 180;
  const drawables = [];

  for (const ch of visibleChunks()) {
    for (const t of ch.trees) {
      if (!inView(t.x, t.y)) continue;
      if (t.alive) drawables.push({ y: t.y, draw: () => {
        const s = TREE_SIZE * (0.35 + 0.65 * t.growth);
        drawSprite(wimg("tree"), t.x, t.y, s, false);
        if (t.progress >= 0) bar(t.x, t.y - s - 12, t.progress, "#c9a86a");
      }});
      // felled trees leave clean ground — no stumps
    }
    for (const s of ch.stones) if (s.alive && inView(s.x, s.y)) drawables.push({ y: s.y, draw: () => {
      drawSprite(wimg("stone"), s.x, s.y, NODE_SIZE, false);
      if (s.progress >= 0) bar(s.x, s.y - NODE_SIZE - 10, s.progress, "#c9a86a");
    }});
    for (const p of ch.patches) if (p.alive && inView(p.x, p.y)) drawables.push({ y: p.y, draw: () => {
      drawSprite(wimg("patch"), p.x, p.y, 40, false);
      if (p.progress >= 0) bar(p.x, p.y - 46, p.progress, "#c9a86a");
    }});
  }
  for (const cp of camps) if (inView(cp.x, cp.y)) drawables.push({ y: cp.y, draw: () => {
    // their own fortifications rise with time
    const fort = cp.fort || 0;
    if (fort >= 1) { drawSprite(img.wall, cp.x - 70, cp.y + 6, 52, false); drawSprite(img.wall, cp.x + 70, cp.y + 6, 52, false); }
    if (fort >= 2) { drawSprite(img.wall, cp.x - 24, cp.y + 26, 52, false); drawSprite(img.wall, cp.x + 24, cp.y + 26, 52, false); }
    if (fort >= 3) { drawSprite(img.wallv, cp.x - 78, cp.y - 30, 52, false); drawSprite(img.wallv, cp.x + 78, cp.y - 30, 52, false); }
    drawSprite(img[cp.type === "thief" ? "thiefcamp" : "raidcamp"], cp.x, cp.y, BLDG_SIZE, false);
    ctx.fillStyle = "#d86a5a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText(cp.type === "thief" ? "thief camp" : "raid camp", cp.x, cp.y - BLDG_SIZE - 4);
    if (cp.hp < cp.maxHp) bar(cp.x, cp.y - BLDG_SIZE - 14, cp.hp / cp.maxHp, "#a05252");
    if (selectedCamp === cp) {
      ctx.strokeStyle = "#d86a5a"; ctx.lineWidth = 1;
      ctx.strokeRect(cp.x - BLDG_SIZE / 2, cp.y - BLDG_SIZE, BLDG_SIZE, BLDG_SIZE);
    }
  }});
  for (const cp of corpses) {
    if (cp.carried && civs.includes(cp.carried)) { cp.x = cp.carried.x + 8; cp.y = cp.carried.y - 6; }
    if (!inView(cp.x, cp.y)) continue;
    drawables.push({ y: cp.y - 1, draw: () => {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(cp.x, cp.y - 8);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img[cp.who + "1"], -CHAR_SIZE / 2, -CHAR_SIZE / 2, CHAR_SIZE * 0.9, CHAR_SIZE * 0.9);
      ctx.restore();
      ctx.globalAlpha = 1;
    }});
  }
  for (const gv of graves) if (inView(gv.x, gv.y)) drawables.push({ y: gv.y, draw: () => {
    if (gv.stone) drawSprite(img.gravestone, gv.x, gv.y, 42, false);
    else { ctx.fillStyle = "#3a2c1e"; ctx.fillRect(gv.x - 12, gv.y - 8, 24, 10); }
    if (selectedGrave === gv) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1;
      ctx.strokeRect(gv.x - 16, gv.y - 34, 32, 40);
    }
  }});
  for (const f of farms) if (inView(f.x, f.y)) drawables.push({ y: f.y, draw: () => {
    drawSprite(wimg("farm"), f.x, f.y, FARM_SIZE, false);
    if (f.site) { ctx.globalAlpha = 0.45; drawSprite(wimg("farm"), f.x, f.y, FARM_SIZE, false); ctx.globalAlpha = 1; }
    if (f.progress >= 0) bar(f.x, f.y - FARM_SIZE - 12, f.progress, "#c9a86a");
    else if (f.ready) {
      ctx.fillStyle = "#d8c26a"; ctx.font = "12px monospace"; ctx.textAlign = "center";
      ctx.fillText("ripe", f.x, f.y - FARM_SIZE - 4);
    }
    if (selected && selected.profession === "farmer" && f.workers.includes(selected)) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1;
      const r = bldgRect({ type: "farm", x: f.x, y: f.y });
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    if (selectedBldg === f) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1;
      const r = bldgRect({ type: "farm", x: f.x, y: f.y });
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }});
  for (const b of buildings) if (inView(b.x, b.y)) drawables.push({ y: b.y, draw: () => {
    if (b.site) ctx.globalAlpha = 0.45;
    const wos = WALLLIKE.has(b.type) ? 10 : 0;   // walls draw oversized so chained segments visually fuse
    if (b.type === "wall" && b.rot) drawSprite(wimg("wallv"), b.x, b.y + wos / 2, SMALL_BLDG.wall + wos, false);
    else if (b.type === "stonewall" && b.rot) drawSprite(img.stonewallv, b.x, b.y + wos / 2, SMALL_BLDG.stonewall + wos, false);
    else if ((b.type === "stonegate" || b.type === "moat" || b.type === "ditch") && b.rot) {
      const L = SMALL_BLDG[b.type] + wos;
      ctx.save(); ctx.translate(b.x, b.y - SMALL_BLDG[b.type] / 2); ctx.rotate(Math.PI / 2);
      ctx.drawImage(img[b.type], -L / 2, -L / 2, L, L);
      ctx.restore();
    }
    else if (b.type === "gate" && b.rot) {
      const L = SMALL_BLDG.gate + wos;
      ctx.save(); ctx.translate(b.x, b.y - SMALL_BLDG.gate / 2); ctx.rotate(Math.PI / 2);
      ctx.drawImage(wimg("gate"), -L / 2, -L / 2, L, L);
      ctx.restore();
    } else drawSprite(wimg(b.type), b.x, b.y + wos / 2, (SMALL_BLDG[b.type] || BLDG_SIZE) + wos, false);
    if (b.fire > 0) {
      const f = img["fire" + (Math.floor(fireAnim) % 4)];
      drawSprite(f, b.x - 20, b.y - 8, 56, false);
      drawSprite(f, b.x + 18, b.y - 2, 64, true);
      drawSprite(f, b.x, b.y - 40, 48, false);
    }
    ctx.globalAlpha = 1;
    if (b.progress >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.progress, "#7da083");
    if (b.torchP >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.torchP, "#d86a3a");
    if (b.maxHp && b.hp < b.maxHp) bar(b.x, b.y - (SMALL_BLDG[b.type] || BLDG_SIZE) - 10, b.hp / b.maxHp, "#a05252");
    if (selectedBldg === b) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1;
      const r = bldgRect(b);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }});
  for (const v of visitors) if (inView(v.x, v.y)) drawables.push({ y: v.y, draw: () => {
    drawSprite(img["hunter" + (Math.floor(v.anim) % 4)], v.x, v.y, CHAR_SIZE, v.facing < 0);
    ctx.fillStyle = "#c98a6a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    if (settings.labels) ctx.fillText(v.name + " (visitor)", v.x, v.y - CHAR_SIZE - 4);
  }});
  for (const r of raiders) if (inView(r.x, r.y)) drawables.push({ y: r.y, draw: () => {
    const frame = r.foe ? img["atksword" + (Math.floor(r.anim) % 4)] : img["hunter" + (Math.floor(r.anim) % 4)];
    drawSprite(frame, r.x, r.y, CHAR_SIZE, r.facing < 0);
    ctx.fillStyle = "#d86a5a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    if (settings.labels) ctx.fillText(r.state === "patrol" ? "thief" : "RAIDER", r.x, r.y - CHAR_SIZE - 4);
    if (r.hp < r.maxHp) bar(r.x, r.y - CHAR_SIZE - 14, r.hp / r.maxHp, "#a05252", 34);
  }});
  for (const c of civs) if (c.state !== "sleeping" && c.state !== "warming" && inView(c.x, c.y)) drawables.push({ y: c.y, draw: () => {
    const grouped = selGroup.length > 1 && selected && selGroup.includes(selected) && selGroup.includes(c);
    if (c === selected || grouped) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x, c.y - 2, 18, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    let frame;
    if ((c.state === "fighting" || c.state === "sieging") && c.profession !== "cavalry" && c.profession !== "archer")
      frame = img[(isForce(c) || c.armed ? "atksword" : "atkfist") + (Math.floor(c.anim) % 4)];
    else frame = img[c.who + (Math.floor(c.anim) % 4)];
    drawSprite(frame, c.x, c.y, CHAR_SIZE * (c.child ? 0.62 : 1), c.facing < 0);
    ctx.fillStyle = c.rebel ? "#d86a5a" : c === selected ? "#c9a86a" :
                    c.profession === "police" ? "#8aa0c9" : isForce(c) ? "#b58a5a" : "#7da083";
    ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tag = c.rebel ? " [REBEL]" : c.child ? " (child)" :
                ["police", "soldier", "archer", "cavalry"].includes(c.profession) ? ` [${c.profession}]` : "";
    if (settings.labels) ctx.fillText(c.name + tag, c.x, c.y - CHAR_SIZE - 4);
    if (c.hp < c.maxHp) bar(c.x, c.y - CHAR_SIZE - 16, c.hp / c.maxHp, "#a05252", 34);
    if (c.state === "crafting" || c.state === "buildingFarm" || c.state === "smithing" || c.state === "hunting") {
      const tot = c.state === "crafting" ? CRAFT_TIME * workMul(c) : c.state === "smithing" ? SMITH_TIME * workMul(c) :
                  c.state === "buildingFarm" ? BASE_FARM_BUILD * workMul(c) : 6;
      bar(c.x, c.y - CHAR_SIZE - (c.hp < c.maxHp ? 26 : 16), c.workT / tot, "#c9a86a");
    }
  }});

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  for (const a of arrows) {
    if (!inView(a.x, a.y)) continue;
    const vx = a.vx || 1, vy = a.vy || 0;
    ctx.strokeStyle = "#d8cba0"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(a.x - vx * 7, a.y - vy * 7); ctx.lineTo(a.x + vx * 7, a.y + vy * 7); ctx.stroke();
  }

  for (const sm of smokes) {
    if (!inView(sm.x, sm.y)) continue;
    ctx.globalAlpha = 0.28 * Math.min(1, sm.t / sm.max);
    ctx.fillStyle = "#b8bcb8";
    ctx.beginPath(); ctx.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // night falls: darkness, and warm light spilling from the doorways
  const night = nightAmt();
  if (settings.night && night > 0.01) {
    ctx.fillStyle = `rgba(7, 10, 26, ${0.48 * night})`;
    ctx.fillRect(cam.x, cam.y, vw, vh);
    ctx.globalCompositeOperation = "lighter";
    for (const b of buildings) {
      if (b.fire || b.type === "burned" || b.type === "wall" || b.type === "gate" || b.type === "watchtower" || b.type === "well") continue;
      if (!inView(b.x, b.y)) continue;
      const lit = b.type === "cabin" ? b.occupants.length > 0 : true;
      if (!lit) continue;
      const flick = 0.72 + 0.18 * Math.sin(worldT * 11 + b.x * 0.7) + 0.10 * Math.sin(worldT * 23 + b.y);
      const g = ctx.createRadialGradient(b.x, b.y - 14, 2, b.x, b.y - 14, 46);
      g.addColorStop(0, `rgba(255, 196, 92, ${0.34 * night * flick})`);
      g.addColorStop(1, "rgba(255, 196, 92, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(b.x - 48, b.y - 62, 96, 72);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // floating combat text
  ctx.font = "12px monospace"; ctx.textAlign = "center";
  for (const f of settings.floaters ? floaters : []) {
    ctx.globalAlpha = Math.min(1, f.t / 0.5);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  if (buildMode) {
    const [gx, gy] = snapWallPos(buildMode, mouse.wx, mouse.wy);
    const ok = legalToBuild(buildMode, gx, gy) && canPay(costOf(buildMode));
    ctx.globalAlpha = 0.55;
    const ghost = buildMode === "sapling" ? img.tree : buildMode === "farm" ? img.farm : img[buildMode];
    const gs = buildMode === "sapling" ? TREE_SIZE * 0.4 : (SMALL_BLDG[buildMode] || (buildMode === "farm" ? FARM_SIZE : BLDG_SIZE));
    if (buildMode === "wall" && wallRot) drawSprite(img.wallv, gx, gy, gs, false);
    else if (buildMode === "stonewall" && wallRot) drawSprite(img.stonewallv, gx, gy, gs, false);
    else if (WALLLIKE.has(buildMode) && wallRot) {
      // gates, moats, ditches: same quarter-turn the placed building gets
      ctx.save(); ctx.translate(gx, gy - gs / 2); ctx.rotate(Math.PI / 2);
      ctx.drawImage(ghost, -gs / 2, -gs / 2, gs, gs);
      ctx.restore();
    } else drawSprite(ghost, gx, gy, gs, false);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#7da083" : "#a05252"; ctx.lineWidth = 2;
    if (WALLLIKE.has(buildMode) && wallRot) ctx.strokeRect(gx - 11, gy - gs, 22, gs);
    else ctx.strokeRect(gx - gs / 2, gy - gs, gs, gs);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // edge-of-screen markers for towns that are out of view
  const towns = settlements.filter(s => s.x !== undefined).map(s => ({ x: s.x, y: s.y, name: s.name }));
  if (towns.length) towns.push({ x: 0, y: -40, name: settlementName || "Home" });
  for (const t of towns) {
    const sx = (t.x - cam.x) * zoom, sy = (t.y - cam.y) * zoom;
    if (sx > -40 && sx < canvas.width + 40 && sy > -40 && sy < canvas.height + 40) continue;
    const mx2 = Math.max(30, Math.min(canvas.width - 30, sx));
    const my2 = Math.max(52, Math.min(canvas.height - 70, sy));
    ctx.save(); ctx.translate(mx2, my2); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(13,18,16,0.85)"; ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -8, 16, 16);
    ctx.restore();
    ctx.fillStyle = "#c9a86a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tx2 = Math.max(46, Math.min(canvas.width - 46, mx2));
    ctx.fillText(t.name, tx2, my2 + (sy > canvas.height - 70 ? -16 : 22));
  }

}

// --- loop ---
let last = 0, uiT = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (gameState === "playing") {
    update(dt);
    render(dt);
    uiT += dt;
    if (uiT > 0.25) { uiT = 0; syncUI(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
