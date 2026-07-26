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
const TAX_PERIOD = 240, POLICE_COST = 40, SOLDIER_COST = 30, TOOL_PRICE_GOV = 10, TOOL_PRICE_SELF = 8;
const TORCH_TIME = 6, FIRE_TIME = 10, ATK_INTERVAL = 0.9, FIST_DMG = 8, DODGE_CHANCE = 0.15;
const EAT_HEAL = 15;
const RAID_MIN = 100, RAID_MAX = 170, MAX_RAIDERS = 4, MAX_CAMPS = 6;

const REPAIR_COST = { logs: 20, doors: 1 };
const STATIC_COSTS = {
  recruit: { logs: 30 }, market: { logs: 25 }, sapling: { logs: 1 },
  watchtower: { logs: 15, stone: 5 }, bakery: { logs: 20, stone: 3 }, well: { logs: 10, stone: 8 },
  forge: { logs: 20, stone: 6, iron: 2 },
  wall: { logs: 6, stone: 2 }, gate: { logs: 10, stone: 4 },
};
const BLDG_NAMES = { cabin: "Log Cabin", recruit: "Recruitment Center", market: "Market Center",
  burned: "Burned Ruin", watchtower: "Watchtower", bakery: "Bakery", well: "Well", forge: "Forge", wall: "Town Wall", gate: "Town Gate" };
const forgeBuilt = () => buildings.some(b => b.type === "forge" && !b.fire);

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
T("cavalry", "Cavalry", "growth", ["warhorse"], 8, "Police & soldiers +50 health");
T("hussars", "Hussars", "growth", ["cavalry"], 9, "Police & soldiers +15 damage");
T("trading", "Trading", "military", [], 0, "Market prices +1 DM");
T("currencies", "Currencies", "military", ["trading"], 1, "Taxes collect +1 DM");
T("marketing", "Marketing", "military", ["currencies"], 2, "Market prices +1 more DM");
T("policing", "Policing", "military", ["marketing"], 3, "Unlocks recruiting police");
T("court", "Court", "military", ["policing"], 4, "Half of beaten rebels are subdued alive");
T("landownership", "Land Ownership", "military", ["currencies"], 2, "Cabins house 3");
T("ownership", "Ownership", "military", ["landownership"], 3, "Dismantling refunds 75%");
T("lordship", "Lordship", "military", ["ownership"], 4, "Lords underwrite the treasury: it may borrow to -50 DM");
T("slavery", "Slavery", "military", ["lordship"], 5, "Forced labour edict: work +25% faster, happiness plummets");
T("slavemarket", "Slave Market", "military", ["slavery"], 6, "+2 DM each tax collection; happiness suffers");
T("forging", "Forging", "military", ["policing"], 4, "Unlocks blacksmiths");
T("spears", "Spears", "military", ["forging"], 5, "Blacksmiths may forge spears (14 dmg)");
T("hilts", "Hilts", "military", ["spears"], 6, "Weapons cost 1 less iron");
T("blades", "Blades", "military", ["hilts"], 7, "All weapons +5 damage; the secret of true sword-forging");
T("swords", "Swords", "military", ["blades"], 8, "Blacksmiths may forge swords (20 dmg)");
T("battleaxes", "Battle Axes", "military", ["swords"], 9, "Blacksmiths may forge battle axes (28 dmg)");
T("lances", "Lances", "military", ["swords"], 9, "Police & soldiers +10 damage (requires War Horse)");
T("defending", "Defending", "military", ["policing"], 4, "Unlocks Town Walls & Gates; police take weapons from the armoury; torching 30% slower — but the camps take notice");
T("raiding", "Raiding", "military", ["defending"], 5, "Unlocks Soldiers who can sack thief & raid camps; +10 damage");
T("occupation", "Occupation", "military", ["raiding"], 6, "Taxes collect +1 more DM");
TECH.lances.req.push("warhorse");
TECH.foraging.done = TECH.ownership.done = TECH.forging.done = true;   // starting knowledge

const has = id => TECH[id].done;
const techCost = t => 15 + t.depth * 12;
const techTime = t => 45 + t.depth * 40;
let research = null;

// --- derived stats ---
const isForce = c => c.profession === "police" || c.profession === "soldier";
const walkSpeed = c => BASE_WALK * (1 + (has("horses") ? 0.15 : 0) + (has("horsebreeding") ? 0.10 : 0) + (has("saddling") ? 0.10 : 0)) * (c && isForce(c) ? (has("warhorse") ? 1.35 : 1.15) : 1);
const workMul = c => (c && c.tool ? 0.65 : 1) * (has("stables") ? 0.8 : 1) * (laws.forced ? 0.75 : 1);
const chopTime = c => BASE_CHOP * (has("axing") ? 0.65 : has("treecutting") ? 0.8 : 1) * workMul(c);
const logsPerTree = () => BASE_LOGS_PER_TREE + (has("sawing") ? 2 : 0) + (has("sawmills") ? 3 : 0);
const doorCost = () => has("sawmills") ? 3 : 5;
const farmSeedCost = () => has("seeding") ? 4 : 6;
const farmRipen = () => BASE_FARM_RIPEN * (has("agriculture") ? 0.7 : 1);
const sellPrice = () => 3 + (has("trading") ? 1 : 0) + (has("marketing") ? 1 : 0);
const taxBonus = () => (has("currencies") ? 1 : 0) + (has("occupation") ? 1 : 0) + (has("slavemarket") ? 2 : 0);
const forceDmg = c => (c.profession === "soldier" ? 15 : 12) + (has("wardogs") ? 5 : 0) + (has("hussars") ? 15 : 0) + (has("lances") ? 10 : 0) + (has("raiding") ? 10 : 0) + (c.armed ? weaponDmg() : 0);
const torchTime = () => TORCH_TIME / ((has("defending") ? 0.7 : 1) * (has("pettraining") ? 0.75 : 1));
const weaponDmg = () => (has("battleaxes") ? 28 : has("swords") ? 20 : has("spears") ? 14 : 8) + (has("blades") ? 5 : 0);
const weaponIron = () => Math.max(1, 2 - (has("hilts") ? 1 : 0));
const canForgeWeapons = () => has("spears") || has("swords") || has("battleaxes");
const treasuryFloor = () => has("lordship") ? -50 : 0;
const cabinCapacity = () => has("landownership") ? 3 : 2;
const dismantleRefund = () => has("ownership") ? 0.75 : 0.5;
const nearWatchtower = (x, y) => buildings.some(b => b.type === "watchtower" && !b.fire && Math.hypot(b.x - x, b.y - y) < 400);

function cabinCost() {
  const built = buildings.filter(b => b.type === "cabin" && b.placed).length;
  return { logs: 20, doors: 1, dm: built >= 2 ? 2 : 0 };
}
function costOf(type) {
  if (type === "cabin") return cabinCost();
  if (type === "farm") return { logs: 3, seeds: farmSeedCost() };
  return STATIC_COSTS[type];
}

// --- assets ---
const IMAGES = {
  tree: "assets/sprites/env/spruce_tree_32.png", grass: "assets/sprites/env/grass_64.png",
  stone: "assets/sprites/env/stone_32.png", patch: "assets/sprites/env/grasspatch_32.png",
  burned: "assets/sprites/buildings/burned_house_32.png", cabin: "assets/sprites/buildings/log_cabin_32.png",
  recruit: "assets/sprites/buildings/recruitment_center_32.png", market: "assets/sprites/buildings/market_32.png",
  farm: "assets/sprites/buildings/farm_32.png",
  watchtower: "assets/sprites/buildings/watchtower_32.png", bakery: "assets/sprites/buildings/bakery_32.png",
  well: "assets/sprites/buildings/well_32.png",
  forge: "assets/sprites/buildings/forge_32.png",
  wall: "assets/sprites/buildings/wall_32.png",
  wallv: "assets/sprites/buildings/wall_v_32.png",
  gate: "assets/sprites/buildings/gate_32.png",
  thiefcamp: "assets/sprites/buildings/thief_camp_32.png", raidcamp: "assets/sprites/buildings/raid_camp_32.png",
};
for (const who of ["sister", "brother", "hunter"]) for (let i = 0; i < 4; i++) IMAGES[`${who}${i}`] = `assets/sprites/characters/${who}_walk_${i}.png`;
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
function difficulty() { return Math.min(6, 1 + Math.floor(playT / 600) + Math.floor(civs.length / 8)); }
const settlements = [];               // {name, pop, mx, my} on the Europe map
const laws = { civWeapons: false, hunterWeapons: true, forced: false, freeRoam: false };

const cam = { x: 0, y: 0 };
let zoom = 1;
const keys = {};
const mouse = { x: 0, y: 0, wx: 0, wy: 0 };

const buildings = [], farms = [], civs = [], visitors = [], raiders = [], camps = [], floaters = [], smokes = [];
const chunks = new Map();

let selected = null, selectedBldg = null, selectedCamp = null, buildMode = null;
let toastTimer = 0, hunterTimer = 40, visitorSeq = 0, paused = false;
let worldT = 80;   // clock of the world; night falls late in each cycle
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
  const name = free.length ? free[Math.floor(Math.random() * free.length)]
                           : pool[Math.floor(Math.random() * pool.length)] + " II";
  usedNames.add(name);
  return name;
}

buildings.push({ type: "burned", x: 0, y: 0, progress: -1, occupants: [], fire: 0, torchP: -1, placed: false });
civs.push(mkCiv("Brother", "brother", -70, 110, "m"));
civs.push(mkCiv("Sister", "sister", 70, 130, "f"));

function mkCiv(name, who, x, y, gender) {
  return { name, who, nativeWho: who, gender: gender || "m", x, y, tx: x, ty: y, state: "idle", anim: 0, facing: 1,
           task: null, workT: 0, home: null, profession: null,
           hunger: 100, hp: 100, maxHp: 100, happiness: 75, rebel: false, armed: false, tool: false,
           inv: { logs: 0, seeds: 0, stone: 0, iron: 0, wheat: 0, bread: 0, meat: 0, dm: 0 },
           autoT: 3 + Math.random() * 4, atkT: 0, stuckT: 0, isCiv: true };
}

function float(x, y, text, color) { floaters.push({ x, y, text, color, t: 1.4 }); }
// hunters keep their own look; everyone else wears the family's spare clothes
function refreshAvatar(c) {
  c.who = c.profession === "hunter" ? c.nativeWho : (c.gender === "f" ? "sister" : "brother");
}
function onScreen(x, y) {
  return x > cam.x && x < cam.x + canvas.width / zoom && y > cam.y && y < cam.y + canvas.height / zoom;
}

// --- terrain ---
function chunkKey(cx, cy) { return cx + "," + cy; }
function chunkOf(wx, wy) { return [Math.floor(wx / CHUNK), Math.floor(wy / CHUNK)]; }

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
  for (let i = 0; i < n && camps.length < Math.min(9, 4 + tier); i++) {
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
  const speed = BASE_WALK * 0.9;
  // fight anyone who is fighting us, or any force unit close by
  if (!r.foe || (!civs.includes(r.foe))) {
    r.foe = null;
    for (const c of civs) if (isForce(c) && Math.hypot(c.x - r.x, c.y - r.y) < 90) { r.foe = c; break; }
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
      if (r.arsonist) { r.state = "torchWall"; r.wallTarget = t; r.workT = 0; }
      else { r.state = "steal"; r.workT = 0; }
    }
    else {
      const nx = r.x + dx / d * speed * dt, ny = r.y + dy / d * speed * dt;
      // town walls bar the way — find the weakest nearby segment and break THAT
      const barrier = buildings.find(b => (b.type === "wall" || b.type === "gate") && !b.fire &&
                                          pointInRect(nx, ny, inflate(bldgRect(b), 8)));
      if (barrier) {
        let weakest = barrier;
        for (const b of buildings)
          if ((b.type === "wall" || b.type === "gate") && !b.fire && (b.hp || 0) < (weakest.hp || 0) &&
              Math.hypot(b.x - barrier.x, b.y - barrier.y) < 320) weakest = b;
        if (weakest !== barrier) {
          // walk along to the weak point first
          r.x += (weakest.x - r.x) / Math.max(1, Math.hypot(weakest.x - r.x, weakest.y - r.y)) * speed * dt;
          r.y += (weakest.y + 26 - r.y) / Math.max(1, Math.hypot(weakest.x - r.x, weakest.y + 26 - r.y)) * speed * dt;
          if (Math.hypot(weakest.x - r.x, weakest.y - r.y) > 40) { r.anim += dt * 8; return; }
        }
        r.state = Math.random() < 0.5 ? "torchWall" : "axeWall";
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
    if (d < 40 || !camps.includes(r.camp)) { raiders.splice(raiders.indexOf(r), 1); return; }
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
const SMALL_BLDG = { farm: FARM_SIZE, wall: 64, gate: 72 };
function bldgRect(b) {
  if (b.type === "wall" || b.type === "gate") {
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

function legalToBuild(type, wx, wy, rot) {
  if (type !== "sapling" && !inTerritory(wx, wy)) return false;
  const s = type === "sapling" ? 20 : (SMALL_BLDG[type] || BLDG_SIZE);
  const cand = (type === "wall" || type === "gate")
    ? bldgRect({ type, x: wx, y: wy, rot: rot === undefined ? wallRot : rot })
    : { x: wx - s / 2, y: wy - s, w: s, h: s };
  const placingWall = type === "wall" || type === "gate";
  for (const b of allStructures()) {
    const bWall = b.type === "wall" || b.type === "gate";
    const margin = placingWall && bWall ? -6 : placingWall || bWall || b.type === "farm" ? 2 : 12;
    const r = inflate(bldgRect(b), margin);
    if (!bWall && b.type !== "farm" && !placingWall) r.h += 26;
    if (rectsOverlap(cand, r)) return false;
  }
  for (const c of camps) if (Math.hypot(c.x - wx, c.y - wy) < 200) return false;
  for (const t of nearThings("trees", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  for (const t of nearThings("stones", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  return true;
}

function collideMove(c, nx, ny) {
  const blocked = (x, y) => allStructures().some(b => b.type !== "gate" && pointInRect(x, y, inflate(bldgRect(b), 6)));
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

function freeHome() { return buildings.find(b => b.type === "cabin" && b.occupants.length < cabinCapacity()) || null; }
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
  if (c.profession === "police") policeCount--;
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  if (selected === c) selected = null;
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
}
addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === "r" && (buildMode === "wall" || buildMode === "gate")) {
    wallRot = wallRot ? 0 : 1;
    toast(`Wall turned ${wallRot ? "upright (north-south)" : "flat (east-west)"}.`);
  }
  if (e.key === "Escape") {
    if (buildMode) { buildMode = null; syncUI(); }
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
  buildMode = null; selected = null; selectedBldg = null; selectedCamp = null;
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
        order(selected, { kind: "attack", target: r, x: r.x, y: r.y });
        toast(`${selected.name} moves to intercept the raider.`);
      } else toast("Only police or soldiers can be ordered against raiders.");
      return;
    }

  // camps: soldiers can be ordered to sack them
  for (const cp of camps)
    if (Math.abs(mouse.wx - cp.x) < BLDG_SIZE / 2 && mouse.wy < cp.y && mouse.wy > cp.y - BLDG_SIZE) {
      if (selected && selected.profession === "soldier" && has("raiding")) {
        order(selected, { kind: "siege", target: cp, x: cp.x + 40, y: cp.y + 14 });
        toast(`${selected.name} marches on the ${cp.type} camp.`);
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
        order(selected, { kind: "attack", target: c, x: c.x, y: c.y });
        toast(`${selected.name} moves to put down ${c.name}.`);
        return;
      }
      selected = c; selectedBldg = null; selectedCamp = null;
      toast(`${c.name} selected.`);
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

  for (const b of buildings)
    if (pointInRect(mouse.wx, mouse.wy, bldgRect(b))) { selectedBldg = b; selected = null; selectedCamp = null; syncUI(); return; }
  for (const f of farms)
    if (pointInRect(mouse.wx, mouse.wy, bldgRect({ type: "farm", x: f.x, y: f.y }))) { selectedBldg = f; f.type = "farm"; selected = null; selectedCamp = null; syncUI(); return; }

  if (selected) order(selected, { kind: "walk", x: mouse.wx, y: mouse.wy });
});

// heal anyone wedged inside a footprint — legacy saves, edge cases, anything
let rescueT = 2;
function rescueStuck(dt) {
  rescueT -= dt;
  if (rescueT > 0) return;
  rescueT = 4;
  for (const u of [...civs, ...visitors]) {
    const jail = allStructures().find(b => b.type !== "gate" && pointInRect(u.x, u.y, inflate(bldgRect(b), 4)));
    if (jail) {
      const r = bldgRect(jail);
      u.y = r.y + r.h + 16;
      u.x += (u.x < jail.x ? -20 : 20);
      if (u.state === "walking") u.stuckT = 0;
    }
  }
}
function evictFromFootprint(b) {
  const r = inflate(bldgRect(b), 10);
  for (const u of [...civs, ...visitors, ...raiders])
    if (pointInRect(u.x, u.y, r)) { u.y = r.y + r.h + 14; u.x += (u.x < b.x ? -18 : 18); }
}
function tryPlace(type, wx, wy) {
  if (type === "forge" && !has("forging")) { toast("A forge requires the Forging technology."); buildMode = null; syncUI(); return; }
  if ((type === "wall" || type === "gate") && !has("defending")) { toast("Walls and gates require the Defending technology."); buildMode = null; syncUI(); return; }
  const cost = costOf(type);
  if (!canPay(cost)) { toast(`Not enough materials: needs ${costText(cost)}.`); return; }
  if (!legalToBuild(type, wx, wy)) { toast(inTerritory(wx, wy) ? "Cannot build there — too close to another building, its entrance, or an obstacle."
                             : "That land is outside your territory. Build and grow to claim more."); return; }
  pay(cost);
  SFX.build();
  if (type === "sapling") {
    const [cx, cy] = chunkOf(wx, wy);
    getChunk(cx, cy).trees.push({ x: wx, y: wy, alive: true, progress: -1, growth: 0 });
    toast("Spruce sapling planted.");
  } else if (type === "farm") {
    farms.push({ x: wx, y: wy, ready: false, growT: 0, workers: [], progress: -1 });
    evictFromFootprint({ type: "farm", x: wx, y: wy });
    expandAround(wx, wy, 1);
    toast("Farm laid out. Assign farmers to it by selecting them and clicking the farm.");
  } else {
    const b = { type, x: wx, y: wy, progress: -1, occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0 };
    if (type === "wall") { b.hp = b.maxHp = 100; }
    if (type === "gate") { b.hp = b.maxHp = 60; }
    if (type === "wall" || type === "gate") b.rot = wallRot;
    buildings.push(b);
    evictFromFootprint(b);
    expandAround(wx, wy, 1);
    toast(`${BLDG_NAMES[type]} built. The territory grows.`);
    if (type === "cabin") for (const c of civs) if (!c.home && houseCiv(c)) toast(`${c.name} moves into the new cabin.`);
  }
  buildMode = null;
  syncUI();
}

// --- orders ---
function order(c, task) {
  if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
  c.task = task; c.tx = task.x; c.ty = task.y;
  c.state = "walking"; c.workT = 0;
}

function arrive(c) {
  const t = c.task;
  if (t && t.kind === "emigrate") { emigrate(c); return; }
  if (t && t.kind === "goHome") { c.state = "sleeping"; c.task = null; return; }
  if (!t || t.kind === "walk") { c.state = "idle"; c.task = null; return; }
  const simple = { chop: "chopping", quarry: "quarrying", gather: "gathering", craft: "crafting",
                   buildFarm: "buildingFarm", harvest: "harvesting", sell: "selling", hunt: "hunting", smith: "smithing" };
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

  if (!c.tool && res.tools > 0 && c.inv.dm >= TOOL_PRICE_SELF) {
    res.tools--; c.inv.dm -= TOOL_PRICE_SELF; res.dm += TOOL_PRICE_SELF; c.tool = true;
    SFX.coin();
    toast(`${c.name} buys a tool from the smithy with their own coin.`);
    return;
  }

  if (!c.home) return;

  if (c.profession === "blacksmith" && has("forging") && forgeBuilt()) {
    const iron = weaponIron();
    const wantTool = res.tools <= res.weapons || !canForgeWeapons();
    if (wantTool && res.iron >= 1 && res.stone >= 1 && res.logs >= 1 && res.tools < 5) {
      res.iron--; res.stone--; res.logs--;
      order(c, { kind: "smith", make: "tool", x: c.x, y: c.y });
      return;
    }
    if (canForgeWeapons() && res.iron >= iron && res.stone >= 1 && res.logs >= 1 && res.weapons < 5) {
      res.iron -= iron; res.stone--; res.logs--;
      order(c, { kind: "smith", make: "weapon", x: c.x, y: c.y });
      return;
    }
  }

  if (res.seeds < farmSeedCost() * 2) {
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
  const market = buildings.find(b => b.type === "market" && !b.fire);
  if (market && (c.inv.bread + c.inv.meat) > 1)
    order(c, { kind: "sell", target: market, x: market.x, y: market.y + 16 });
}

// --- happiness & rebellion ---
function happinessTarget(c) {
  let t = 78 - taxRate * 6
        - (laws.forced ? 20 : 0)
        - (has("slavemarket") ? 8 : 0)
        + (has("taming") ? 3 : 0) + (has("pets") ? 4 : 0) + (has("pettoys") ? 4 : 0)
        + Math.min(2, buildings.filter(b => b.type === "well" && !b.fire).length) * 3;
  if (c.hunger > 60) t += 4;
  if (c.hunger < 30) t -= 12;
  if (!c.home) t -= 8;
  return Math.max(0, Math.min(100, t));
}

function maybeRebel(c) {
  if (c.rebel || isForce(c) || civs.length < 2) return;
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
  const targets = buildings.filter(b => b.type !== "burned" && !b.fire);
  if (targets.length && Math.random() < 0.6) {
    let best = targets[0], bd = Infinity;
    for (const b of targets) { const d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } }
    order(c, { kind: "torch", target: best, x: best.x, y: best.y + 14 });
  } else {
    const prey = civs.filter(o => o !== c && !o.rebel && o.state !== "sleeping");
    if (prey.length) {
      const p = prey[Math.floor(Math.random() * prey.length)];
      order(c, { kind: "attack", target: p, x: p.x, y: p.y });
    }
  }
}

function forceAI(c) {
  if (c.state !== "idle") return;
  // arm up from the armoury once Defending is known
  if (!c.armed && has("defending") && forgeBuilt() && res.weapons > 0) {
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
  if (best) order(c, { kind: "attack", target: best, x: best.x, y: best.y });
}

// --- torching / fire ---
function igniteCheck(b, dt) {
  if (!b.fire) return;
  b.fire -= dt;
  if (b.fire <= 0) {
    b.fire = 0;
    for (const o of b.occupants) {
      o.home = null;
      if (o.state === "sleeping") { o.state = "idle"; o.x = b.x + (Math.random() * 40 - 20); o.y = b.y + 24; }
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
  const center = buildings.find(b => b.type === "recruit" && !b.fire);
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

const dlg = { open: false, visitor: null };
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

function openDialogue(v) {
  dlg.open = true; dlg.visitor = v; paused = true;
  if (v.meter === null) v.meter = Math.max(10, 55 - taxRate * 3.5);
  $("dlgFace").src = `assets/sprites/ui/${v.face}.png`;
  $("dlgName").textContent = `${v.name}, wandering ${v.gender === "f" ? "huntress" : "hunter"}`;
  $("dlgText").textContent = "The hunter eyes the barred window and the little slot beneath it. \"So. What is this place, then?\"";
  $("dialogue").style.display = "block";
  renderDialogueOptions();
}

function renderDialogueOptions() {
  const v = dlg.visitor;
  $("dlgMeter").style.width = v.meter + "%";
  const opts = $("dlgOpts");
  opts.innerHTML = "";
  const pool = DLG_OPTIONS.filter(o => !v.used.has(o.text) && (!o.needs || o.needs()));
  if (!pool.length) return v.meter >= 60 ? joinColony(v) : rejectColony(v);
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  for (const o of picks) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = o.text;
    b.addEventListener("click", () => {
      v.used.add(o.text);
      if (o.use) o.use();
      const delta = (o.dyn ? o.dyn() : o.d) + (Math.random() * 6 - 3);
      v.meter = Math.max(0, Math.min(100, v.meter + delta));
      $("dlgMeter").style.width = v.meter + "%";
      if (v.meter >= 100) return joinColony(v);
      if (v.meter <= 0) return rejectColony(v);
      $("dlgText").textContent = delta >= 8 ? "He nods slowly. You are getting through to him." :
                                 delta >= 0 ? "He grunts, noncommittal. But he has not left." :
                                 "His eyes narrow. That was the wrong thing to say.";
      renderDialogueOptions();
    });
    opts.appendChild(b);
  }
}

function closeDialogue() { dlg.open = false; dlg.visitor = null; paused = false; $("dialogue").style.display = "none"; }

function joinColony(v) {
  visitors.splice(visitors.indexOf(v), 1);
  closeDialogue();
  const c = mkCiv(v.name, "hunter", v.x, v.y, v.gender);
  c.profession = "hunter";
  refreshAvatar(c);
  civs.push(c);
  expandFrontier(3);
  const housed = houseCiv(c);
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
    toast(`Research complete: ${t.name} — ${t.desc}.`);
    research = null;
    if (TECH.slavery.done) $("lawForcedRow").style.display = "flex";
    if ((t.id === "defending" || t.id === "raiding") && camps.length === 0) {
      spawnCamps(4);
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
      dropPolice();
      selected.profession = "soldier";
      selected.maxHp = 130 + (has("cavalry") ? 50 : 0);
      selected.hp = Math.min(selected.hp + 30, selected.maxHp);
      toast(`${selected.name} takes the colony's coin as a soldier. Click a camp to send them raiding.`);
    } else if (prof === "blacksmith") {
      if (!has("forging")) return toast("Blacksmiths require the Forging technology.");
      dropPolice();
      selected.profession = "blacksmith";
      toast(`${selected.name} takes up the hammer as blacksmith.`);
    } else if (prof === "hunter") {
      dropPolice();
      selected.profession = "hunter";
      toast(`${selected.name} takes up the hunter's life.`);
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
$("pmResume").addEventListener("click", () => setPause(false));
$("pmSave").addEventListener("click", () => { setPause(false); saveGame(); toast("The colony ledger is written. Game saved."); });
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
  p.style.display = p.style.display === "block" ? "none" : "block";
  renderTech();
});
$("techClose").addEventListener("click", () => $("techPanel").style.display = "none");
$("tabGrowth").addEventListener("click", () => { techTab = "growth"; $("tabGrowth").classList.add("active"); $("tabMilitary").classList.remove("active"); renderTech(); });
$("tabMilitary").addEventListener("click", () => { techTab = "military"; $("tabMilitary").classList.add("active"); $("tabGrowth").classList.remove("active"); renderTech(); });

$("cpDeposit").addEventListener("click", () => {
  if (!selected) return;
  const inv = selected.inv;
  const moved = inv.logs + inv.seeds + inv.stone + inv.iron + inv.wheat + inv.bread + inv.meat;
  res.logs += inv.logs; res.seeds += inv.seeds; res.stone += inv.stone; res.iron += inv.iron;
  res.wheat += inv.wheat; res.bread += inv.bread; res.meat += inv.meat;
  inv.logs = inv.seeds = inv.stone = inv.iron = inv.wheat = inv.bread = inv.meat = 0;
  toast(moved ? `${selected.name} hands ${moved} item(s) to the town storage.` : `${selected.name} has nothing to hand over.`);
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
  if (res.tools < 1) return toast("The smithy has no tools in stock.");
  if (res.dm - TOOL_PRICE_GOV < treasuryFloor()) return toast(`Government purchase costs ${TOOL_PRICE_GOV} DM. Treasury: ${res.dm} DM.`);
  res.tools--; res.dm -= TOOL_PRICE_GOV; selected.tool = true;
  toast(`The government buys ${selected.name} a fine tool from the smithy.`);
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
      if (o.state === "sleeping") { o.state = "idle"; o.y = b.y + 24; }
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
  scotland:  { name: "Scotland", color: "#a0344a", strength: 2, blobs: [[19,2,6,3],[18,4,7,3]] },
  england:   { name: "Kingdom of England", color: "#b03a52", strength: 5, blobs: [[18,7,7,6],[17,11,3,3],[23,12,3,2]] },
  ireland:   { name: "Ireland", color: "#94505e", strength: 1, blobs: [[12,6,4,5]] },
  france:    { name: "Kingdom of France", color: "#2d4d8e", strength: 8, blobs: [[23,17,12,9],[20,18,5,3],[33,24,3,3]] },
  castile:   { name: "Castile", color: "#b5541e", strength: 6, blobs: [[14,26,10,10]] },
  aragon:    { name: "Aragon", color: "#c86a2e", strength: 3, blobs: [[24,27,5,5]] },
  portugal:  { name: "Portugal", color: "#8e6a4a", strength: 3, blobs: [[12,27,3,9]] },
  hre:       { name: "Holy Roman Empire", color: "#a98436", strength: 7, blobs: [[33,13,9,9],[31,16,3,4]] },
  brandenburg:{ name: "Brandenburg", color: "#8a6c2c", strength: 4, blobs: [[40,10,7,4]] },
  saxony:    { name: "Saxony", color: "#97762f", strength: 3, blobs: [[42,14,5,3]] },
  bavaria:   { name: "Bavaria", color: "#7d6228", strength: 3, blobs: [[39,18,5,4]] },
  austria:   { name: "Austrian Empire", color: "#6b4f1c", strength: 7, blobs: [[43,20,7,4],[45,18,4,2]] },
  milan:     { name: "Milan", color: "#a04a3a", strength: 2, blobs: [[36,23,3,2]] },
  savoy:     { name: "Savoy", color: "#8e2d4d", strength: 2, blobs: [[34,24,3,3]] },
  venice:    { name: "Venice", color: "#a03a6e", strength: 3, blobs: [[38,23,5,2],[43,25,3,2]] },
  tuscany:   { name: "Tuscany", color: "#b09a4a", strength: 2, blobs: [[37,26,3,2]] },
  papal:     { name: "Papal States", color: "#8e5a8e", strength: 2, blobs: [[39,27,3,3],[41,29,2,2]] },
  naples:    { name: "Kingdom of Naples", color: "#b5541e", strength: 3, blobs: [[42,31,3,3],[44,33,3,3]] },
  sicily:    { name: "Sicily", color: "#a04a1e", strength: 1, blobs: [[41,38,4,2]] },
  sweden:    { name: "Swedish Empire", color: "#4a6a8e", strength: 6, blobs: [[34,1,4,4],[37,0,4,4],[40,2,4,5],[43,4,3,4],[47,0,8,5],[53,2,4,4]] },
  denmark:   { name: "Denmark", color: "#6a4a8e", strength: 2, blobs: [[35,6,2,4],[38,7,3,2]] },
  poland:    { name: "Poland–Lithuania", color: "#8e2d8e", strength: 7, blobs: [[47,9,12,10],[52,7,8,3]] },
  russia:    { name: "Tsardom of Russia", color: "#7a7a2d", strength: 9, blobs: [[60,1,39,15],[64,15,34,10],[59,16,5,4]] },
  cossacks:  { name: "Cossacks", color: "#5a8e4a", strength: 3, blobs: [[59,20,8,4]] },
  crimea:    { name: "Crimean Khanate", color: "#6aa05a", strength: 4, blobs: [[61,24,7,3],[63,27,4,2]] },
  hungary:   { name: "Hungary", color: "#79a065", strength: 3, blobs: [[47,21,5,3]] },
  transylvania:{ name: "Transylvania", color: "#86a878", strength: 2, blobs: [[52,20,4,3]] },
  moldavia:  { name: "Moldavia", color: "#8fae7f", strength: 2, blobs: [[56,17,4,4]] },
  wallachia: { name: "Wallachia", color: "#7ba26b", strength: 2, blobs: [[52,24,7,2]] },
  ottoman:   { name: "Ottoman Empire", color: "#2d7a3a", strength: 10,
               blobs: [[46,26,8,6],[49,24,4,3],[48,32,4,3],[49,35,3,2],[54,30,3,2],[57,30,14,7],[70,28,9,7],
                       [74,33,4,9],[64,42,12,5],[62,40,4,3],[76,30,10,8]] },
  algiers:   { name: "Algiers", color: "#3a8e4a", strength: 3, blobs: [[24,37,9,3],[22,36,4,2]] },
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
}

document.getElementById("mapToggle").addEventListener("click", () => {
  if (!mapGrid) buildMapGrid();
  renderMap();
  document.getElementById("mapTitle").textContent = (empireName || "YOUR EMPIRE").toUpperCase() + " — EUROPE, 1683";
  document.getElementById("mapOverlay").style.display = "block";
  paused = true;
});
document.getElementById("mapClose").addEventListener("click", () => {
  document.getElementById("mapOverlay").style.display = "none";
  if (!dlg.open) paused = false;
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
  document.getElementById("miDetail").textContent =
    `Strength ${n.strength}/10. ` + (n.atWar ?
      `AT WAR with ${empireName || "your empire"}. Their war parties will keep coming. Assaulting a settlement needs 4 soldiers and 4 weapons — and even then the odds are grim. (You have ${soldiers} soldier(s), ${res.weapons} weapon(s).)` :
      "At peace. Declaring war will bring their war parties to your gates — and put their settlements within your soldiers' reach.");
  w.style.display = n.atWar ? "none" : "block";
  pc.style.display = n.atWar ? "block" : "none";
  as.style.display = n.atWar ? "block" : "none";
}
document.getElementById("miWar").addEventListener("click", () => {
  const n = NATIONS[mapSelNation];
  n.atWar = true; n.warT = 30;
  for (const c of civs) c.happiness = Math.max(0, c.happiness - 6);
  toast(`⚔ ${empireName || "The colony"} declares war on ${n.name}! The people brace themselves.`);
  mapInfoSync(); renderMap();
});
document.getElementById("miPeace").addEventListener("click", () => {
  const n = NATIONS[mapSelNation];
  if (res.dm - 60 < treasuryFloor()) return toast("Peace costs 60 DM in reparations. The treasury cannot bear it.");
  res.dm -= 60; n.atWar = false;
  toast(`Peace with ${n.name}, bought for 60 DM.`);
  mapInfoSync(); renderMap(); syncUI();
});
document.getElementById("miAssault").addEventListener("click", () => {
  const n = NATIONS[mapSelNation];
  const soldiers = civs.filter(c => c.profession === "soldier");
  if (soldiers.length < 4) return toast("An assault needs at least 4 soldiers.");
  if (res.weapons < 4) return toast("An assault needs 4 weapons in the armoury.");
  res.weapons -= 4;
  const odds = Math.max(0.05, Math.min(0.5, soldiers.length * 0.04 + (has("raiding") ? 0.06 : 0) + (has("hussars") ? 0.06 : 0) - n.strength * 0.03));
  if (Math.random() < odds) {
    n.lost++;
    n.captured = n.captured || [];
    const [bx, by] = n.blobs[0];
    for (let i = 0; i < 4; i++) n.captured.push((bx + i % 2 + n.lost) + "," + (by + Math.floor(i / 2)));
    res.dm += 200;
    toast(`⚔ Against all odds, your soldiers storm a settlement of ${n.name}! +200 DM plunder; their land is yours on the map.`);
    SFX.coin();
  } else {
    let lost = 0;
    for (const sd of soldiers) if (Math.random() < 0.5) { killCiv(sd, `fell before the walls of ${n.name}`); lost++; }
    toast(`The assault on ${n.name} is thrown back. ${lost} soldier(s) never came home.`);
  }
  mapInfoSync(); renderMap(); syncUI();
});

function updateWars(dt) {
  for (const [id, n] of Object.entries(NATIONS)) {
    if (!n.atWar) continue;
    n.warT -= dt;
    if (n.warT <= 0) {
      n.warT = 110 + Math.random() * 70;
      const targets = buildings.filter(b => b.type !== "burned");
      if (!targets.length || raiders.length >= MAX_RAIDERS + 2) continue;
      const a = Math.random() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const t = targets[Math.floor(Math.random() * targets.length)];
        const whp = 90 + (difficulty() - 1) * 12;
        raiders.push({ x: Math.cos(a) * 1300 + i * 30, y: Math.sin(a) * 1300 + i * 24, hp: whp, maxHp: whp,
                       dmg: 16 + (difficulty() - 1) * 2, camp: { x: Math.cos(a) * 1600, y: Math.sin(a) * 1600 }, target: t,
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
  if (playT >= nextSettleAt && sackedCamps >= 5 && civs.length >= 3) {
    settlePending = true;
    const list = document.getElementById("settleList");
    list.innerHTML = "";
    for (const c of civs) {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;gap:8px;align-items:center;margin:3px 0;cursor:pointer;font-size:12px";
      row.innerHTML = `<input type="checkbox" data-name="${c.name}"> ${c.name} — ${c.profession || "no trade"}${c.home ? "" : " (homeless)"}`;
      list.appendChild(row);
    }
    document.getElementById("settleName").value = SETTLE_NAMES[settlements.length % SETTLE_NAMES.length];
    document.getElementById("settleModal").style.display = "block";
    paused = true;
    toast("Scouts bring word of good land. The colony must decide.");
  }
}
document.getElementById("settleNo").addEventListener("click", () => {
  document.getElementById("settleModal").style.display = "none";
  settlePending = false; paused = false;
  nextSettleAt = playT + 600;   // they will ask again
  toast("The scouts are told to wait. They will ask again.");
});
document.getElementById("settleGo").addEventListener("click", () => {
  const chosen = [...document.querySelectorAll("#settleList input:checked")].map(i => i.dataset.name);
  if (!chosen.length) return toast("Someone has to go.");
  if (chosen.length >= civs.length) return toast("Someone has to stay behind, too.");
  const name = document.getElementById("settleName").value.trim() || "New Settlement";
  const angle = Math.random() * Math.PI * 2;
  const st = { name, pop: chosen.length,
               mx: EMPIRE_HOME.mx + Math.round(Math.cos(angle) * (3 + settlements.length)),
               my: EMPIRE_HOME.my + Math.round(Math.sin(angle) * 2 + 2 + settlements.length) };
  settlements.push(st);
  for (const nm of chosen) {
    const c = civs.find(x => x.name === nm);
    if (c) order(c, { kind: "emigrate", x: c.x + Math.cos(angle) * 1600, y: c.y + Math.sin(angle) * 1600 });
  }
  document.getElementById("settleModal").style.display = "none";
  settlePending = false; paused = false;
  nextSettleAt = playT + 1200;
  expandFrontier(6);
  toast(`${chosen.length} settler(s) depart to found ${name}. Your empire grows on the map of Europe.`);
});
function emigrate(c) {
  if (c.profession === "police") policeCount--;
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  if (selected === c) selected = null;
  civs.splice(civs.indexOf(c), 1);
  toast(`${c.name} has left for the new settlement.`);
  syncUI();
}

// settlements slowly grow
let stGrowT = 0;
function updateSettlements(dt) {
  stGrowT += dt;
  if (stGrowT > 120) {
    stGrowT = 0;
    for (const st of settlements) if (Math.random() < 0.5) st.pop++;
  }
}

// --- empire naming & colour pickers ---
document.getElementById("empireGo").addEventListener("click", () => {
  empireName = document.getElementById("empireInput").value.trim() || "The Forester Realm";
  document.getElementById("empireModal").style.display = "none";
  paused = false;
  toast(`Let it be written: this is ${empireName}.`);
});
document.getElementById("empireInput").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("empireGo").click(); e.stopPropagation(); });
document.getElementById("terrColor").addEventListener("input", e => { territoryColor = e.target.value; });
document.getElementById("bordColor").addEventListener("input", e => { borderColor = e.target.value; });

// --- save / load ---
const SAVE_KEY = "forester_save";
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
        name: c.name, who: c.who, nativeWho: c.nativeWho, gender: c.gender, x: c.x, y: c.y, home: bi(c.home),
        profession: c.profession, hunger: c.hunger, hp: c.hp, maxHp: c.maxHp,
        happiness: c.happiness, rebel: c.rebel, armed: c.armed, tool: c.tool,
        inv: { ...c.inv },
      })),
      buildings: buildings.map(b => ({
        type: b.type, x: b.x, y: b.y, fire: b.fire, placed: b.placed,
        hp: b.hp, maxHp: b.maxHp, rot: b.rot,
        occupants: b.occupants.map(ci),
      })),
      farms: farms.map(f => ({ x: f.x, y: f.y, ready: f.ready, growT: f.growT, workers: f.workers.map(ci) })),
      camps: camps.map(c => ({ ...c })),
      chunks: [...chunks.entries()],
      empireName, territoryColor, borderColor,
      territory: [...territory],
      sackedCamps, playT, nextSettleAt,
      settlements: settlements.map(st => ({ ...st })),
      wars: Object.fromEntries(Object.entries(NATIONS).map(([id, n]) => [id, { atWar: !!n.atWar, lost: n.lost || 0, captured: n.captured || [] }])),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage full or private mode — play on without saves */ }
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
        happiness: cd.happiness, rebel: cd.rebel, armed: cd.armed, tool: cd.tool });
      Object.assign(c.inv, cd.inv);
      civs.push(c);
    }
    buildings.length = 0;
    for (const bd of d.buildings)
      buildings.push({ type: bd.type, x: bd.x, y: bd.y, progress: -1, fire: bd.fire || 0,
                       torchP: -1, placed: bd.placed, bakeT: 0, occupants: [],
                       rot: bd.rot || 0,
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
    settlements.length = 0; for (const st of (d.settlements || [])) settlements.push(st);
    if (d.wars) { n_wars_init(); for (const [id, w] of Object.entries(d.wars)) if (NATIONS[id]) Object.assign(NATIONS[id], w); }
    if (TECH.slavery.done) $("lawForcedRow").style.display = "flex";
    $("taxSlider").value = taxRate; $("taxVal").textContent = taxRate;
    $("lawCivWeapons").checked = laws.civWeapons;
    $("lawHunterWeapons").checked = laws.hunterWeapons;
    $("lawFreeRoam").checked = !!laws.freeRoam;
    if ($("lawForced")) $("lawForced").checked = laws.forced;
    return true;
  } catch (e) {
    console.error("save corrupted, starting fresh", e);
    localStorage.removeItem(SAVE_KEY);
    return false;
  }
}

setInterval(saveGame, 10000);
addEventListener("pagehide", saveGame);

// --- menu / loading / game over ---
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
          document.getElementById("empireModal").style.display = "block";
          paused = true;
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
  $("rName").textContent = settlementName.toUpperCase();
  $("govTitle").textContent = "GOVERNMENT OF " + settlementName.toUpperCase();
  $("rLogs").textContent = res.logs; $("rSeeds").textContent = res.seeds;
  $("rStone").textContent = res.stone; $("rIron").textContent = res.iron;
  $("rDoors").textContent = res.doors; $("rBread").textContent = res.bread;
  $("rMeat").textContent = res.meat; $("rWeapons").textContent = res.weapons;
  $("rTools").textContent = res.tools; $("rDM").textContent = res.dm;
  $("rPop").textContent = civs.length; $("rPolice").textContent = policeCount;
  $("rTax").textContent = taxRate;
  const mm = Math.floor(taxTimer / 60), ss = Math.floor(taxTimer % 60);
  $("rTaxT").textContent = mm + ":" + String(ss).padStart(2, "0");
  const avg = civs.length ? Math.round(civs.reduce((s, c) => s + c.happiness, 0) / civs.length) : 0;
  $("rHappy").textContent = avg + "%";
  $("govHappy").textContent = avg + "%";
  $("govDM").textContent = res.dm + " DM";
  $("govPolice").textContent = policeCount + " officers";
  $("miCabin").textContent = `Log Cabin — ${costText(cabinCost())}`;
  $("miFarm").textContent = `Wheat Farm — ${costText(costOf("farm"))}`;
  $("miDoor").textContent = `Door — ${doorCost()} logs (selected civilian)`;
  $("miForge").textContent = has("forging") ? `Forge — ${costText(STATIC_COSTS.forge)}` : "Forge — needs Forging research";
  if ($("govPanel").style.display === "block" && $("civDrop").classList.contains("open")) {
    const list = $("civList");
    list.innerHTML = "";
    for (const c of civs) {
      const b = document.createElement("button");
      b.className = "btn menu-item";
      b.style.fontSize = "11px";
      b.textContent = `${c.name} — ${c.profession || "no trade"} — ${Math.round(c.happiness)}% happy` + (c.rebel ? " ⚠" : "");
      b.addEventListener("click", () => {
        selected = c; selectedBldg = null; selectedCamp = null;
        cam.x = c.x - canvas.width / 2 / zoom;
        cam.y = c.y - canvas.height / 2 / zoom;
        $("civDrop").classList.remove("open");
        syncUI();
      });
      list.appendChild(b);
    }
    if (!civs.length) list.innerHTML = '<div style="padding:6px;color:#5a6b60;font-size:11px">No one is left.</div>';
  }
  $("researchNow").textContent = research ?
    `Researching ${TECH[research.id].name}: ${Math.round(research.t / techTime(TECH[research.id]) * 100)}%` : "No research underway.";
  if (research && $("techPanel").style.display === "block") renderTech();

  const p = $("civPanel");
  if (!selected) p.style.display = "none";
  else {
    p.style.display = "block"; $("bldgPanel").style.display = "none";
    $("cpName").textContent = selected.name.toUpperCase() + (selected.rebel ? " — REBEL" : "");
    $("cpProf").textContent = selected.profession || "none";
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
  }

  const bp = $("bldgPanel");
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
      b.type === "forge" ? "Blacksmiths work here; weapons are handed out at its racks." :
      b.type === "wall" ? "Keeps raiders out — until they put a torch to it." :
      b.type === "gate" ? "Your people pass freely; raiders must burn it down." : "Standing.";
    $("bpOcc").textContent = isFarm ? "—" : (b.occupants.length ? b.occupants.map(o => o.name).join(", ") : "none");
  }
}

// --- simulation ---
function update(dt) {
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) msgEl.textContent = "";
  const fast = keys["shift"] ? 2.6 : 1;
  const up = keys["w"] || keys["arrowup"], dn = keys["s"] || keys["arrowdown"];
  const lf = keys["a"] || keys["arrowleft"], rt = keys["d"] || keys["arrowright"];
  if (up) cam.y -= CAM_SPEED * fast / zoom * dt;
  if (dn) cam.y += CAM_SPEED * fast / zoom * dt;
  if (lf) cam.x -= CAM_SPEED * fast / zoom * dt;
  if (rt) cam.x += CAM_SPEED * fast / zoom * dt;
  mouse.wx = cam.x + mouse.x / zoom;
  mouse.wy = cam.y + mouse.y / zoom;

  if (paused) return;

  worldT += dt;
  rescueStuck(dt);
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
  for (const f of farms) if (!f.ready && (f.growT += dt) >= farmRipen()) f.ready = true;
  SFX.fireLoop(buildings.some(b => b.fire > 0));
  for (const b of [...buildings]) {
    igniteCheck(b, dt);
    if (!b.fire && (b.type === "bakery" || (b.type === "cabin" && b.occupants.length))) {
      b.smokeT = (b.smokeT === undefined ? Math.random() * 8 : b.smokeT) - dt;
      if (b.smokeT <= 0) {
        b.smokeT = 8 + Math.random() * 14;
        const sx = b.x + (b.type === "bakery" ? 6 : -16), sy = b.y - BLDG_SIZE + 10;
        for (let i = 0; i < 4; i++)
          smokes.push({ x: sx + Math.random() * 4 - 2, y: sy, r: 3 + Math.random() * 2,
                        vx: 4 + Math.random() * 5, t: 2.6 + i * 0.5, max: 2.6 + i * 0.5 });
      }
    }
    if (b.type === "bakery" && !b.fire) {
      b.bakeT = (b.bakeT || 0) + dt;
      if (b.bakeT >= 20) {
        b.bakeT = 0;
        if (res.wheat >= 2) { res.wheat -= 2; res.bread++; float(b.x, b.y - 100, "+1 bread", "#c9a86a"); }
      }
    }
  }

  if (buildings.some(b => b.type === "recruit" && !b.fire)) {
    hunterTimer -= dt;
    if (hunterTimer <= 0) {
      hunterTimer = 100 + Math.random() * 80;
      if (visitors.length < 2) spawnVisitor();
    }
  }
  for (const v of [...visitors]) updateVisitor(v, dt);

  // raids
  if (camps.length) {
    raidTimer -= dt;
    if (raidTimer <= 0) { raidTimer = (RAID_MIN + Math.random() * (RAID_MAX - RAID_MIN)) * Math.pow(0.88, difficulty() - 1); spawnRaid(); }
    campRespawnTimer -= dt;
    if (campRespawnTimer <= 0) { campRespawnTimer = 300; spawnCamps(1); }
    patrolT = (patrolT || 0) - dt;
    if (patrolT <= 0) {
      patrolT = 20;
      for (const cp of camps) {
        const onWatch = raiders.filter(r => r.camp === cp && r.state === "patrol").length;
        if (onWatch < 2 && raiders.length < MAX_RAIDERS + 8) raiders.push(mkRaider(cp, "patrol"));
      }
    }
  }
  if (nightAmt() > 0.9 && camps.length && res.dm >= 5 &&
      !buildings.some(b => (b.type === "wall" || b.type === "gate") && !b.fire)) {
    ambushT -= dt;
    if (ambushT <= 0) {
      ambushT = (50 + Math.random() * 40) * Math.pow(0.88, difficulty() - 1);
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

  for (const c of [...civs]) {
    c.hunger = Math.max(0, c.hunger - HUNGER_DECAY * (has("horsefeed") ? 0.8 : 1) * dt);
    if (c.hunger <= 0) {
      c.hp -= STARVE_DPS * dt;
      if (c.hp <= 0) { killCiv(c, "starved to death"); continue; }
    }

    const target = happinessTarget(c);
    c.happiness += Math.sign(target - c.happiness) * Math.min(Math.abs(target - c.happiness), 2.5 * dt);
    maybeRebel(c);

    const nightNow = nightAmt();
    if (c.state === "sleeping") {
      if (nightNow < 0.05) { c.state = "idle"; c.x = c.home ? c.home.x : c.x; c.y = c.home ? c.home.y + 18 : c.y; }
      else continue;
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
      const reach = c.task && c.task.kind === "attack" ? 34 : 5;
      if (d < reach) { if (reach === 5) { c.x = c.tx; c.y = c.ty; } arrive(c); }
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
        if (c.task.make === "tool") { res.tools++; toast(`${c.name} finishes a sturdy tool.`); }
        else { res.weapons++; toast(`${c.name} finishes a weapon for the armoury.`); }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "repairing") {
      const b = c.task.target;
      c.workT += dt; b.progress = c.workT / (REPAIR_TIME * workMul(c)); c.anim += dt * 10;
      if ((c.workT % 0.55) < dt) SFX.hammer();
      if (c.workT >= REPAIR_TIME * workMul(c)) {
        b.type = "cabin"; b.progress = -1; b.placed = false;
        toast(`The ruin stands whole again. ${c.name} rebuilt it.`);
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
      if (d > 130) { c.state = "walking"; c.tx = foe.x; c.ty = foe.y; continue; }
      if (d > 30) collideMove(c, c.x + ((foe.x - c.x) / d) * speed * dt, c.y + ((foe.y - c.y) / d) * speed * dt);
      c.facing = foe.x < c.x ? -1 : 1;
      c.anim += dt * 9;
      c.atkT -= dt;
      if (c.atkT <= 0 && d < 48) {
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
          const ret = cp.type === "raid" ? 11 : 7;
          c.hp -= ret;
          float(c.x, c.y - 70, "-" + ret, "#d86a5a");
          if (c.hp <= 0) { killCiv(c, "fell storming the camp"); continue; }
        }
        if (cp.hp <= 0) {
          camps.splice(camps.indexOf(cp), 1);
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
      ctx.drawImage(img.grass, x, y, TILE, TILE);

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
        drawSprite(img.tree, t.x, t.y, s, false);
        if (t.progress >= 0) bar(t.x, t.y - s - 12, t.progress, "#c9a86a");
      }});
      else drawables.push({ y: t.y, draw: () => {
        ctx.fillStyle = "#3d2b1c"; ctx.fillRect(t.x - 5, t.y - 8, 10, 8);
        ctx.fillStyle = "#2a1d13"; ctx.fillRect(t.x - 5, t.y - 3, 10, 3);
      }});
    }
    for (const s of ch.stones) if (s.alive && inView(s.x, s.y)) drawables.push({ y: s.y, draw: () => {
      drawSprite(img.stone, s.x, s.y, NODE_SIZE, false);
      if (s.progress >= 0) bar(s.x, s.y - NODE_SIZE - 10, s.progress, "#c9a86a");
    }});
    for (const p of ch.patches) if (p.alive && inView(p.x, p.y)) drawables.push({ y: p.y, draw: () => {
      drawSprite(img.patch, p.x, p.y, 40, false);
      if (p.progress >= 0) bar(p.x, p.y - 46, p.progress, "#c9a86a");
    }});
  }
  for (const cp of camps) if (inView(cp.x, cp.y)) drawables.push({ y: cp.y, draw: () => {
    drawSprite(img[cp.type === "thief" ? "thiefcamp" : "raidcamp"], cp.x, cp.y, BLDG_SIZE, false);
    ctx.fillStyle = "#d86a5a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText(cp.type === "thief" ? "thief camp" : "raid camp", cp.x, cp.y - BLDG_SIZE - 4);
    if (cp.hp < cp.maxHp) bar(cp.x, cp.y - BLDG_SIZE - 14, cp.hp / cp.maxHp, "#a05252");
    if (selectedCamp === cp) {
      ctx.strokeStyle = "#d86a5a"; ctx.lineWidth = 1;
      ctx.strokeRect(cp.x - BLDG_SIZE / 2, cp.y - BLDG_SIZE, BLDG_SIZE, BLDG_SIZE);
    }
  }});
  for (const f of farms) if (inView(f.x, f.y)) drawables.push({ y: f.y, draw: () => {
    drawSprite(img.farm, f.x, f.y, FARM_SIZE, false);
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
    if (b.type === "wall" && b.rot) drawSprite(img.wallv, b.x, b.y, SMALL_BLDG.wall, false);
    else if (b.type === "gate" && b.rot) {
      const L = SMALL_BLDG.gate;
      ctx.save(); ctx.translate(b.x, b.y - L / 2); ctx.rotate(Math.PI / 2);
      ctx.drawImage(img.gate, -L / 2, -L / 2, L, L);
      ctx.restore();
    } else drawSprite(img[b.type], b.x, b.y, SMALL_BLDG[b.type] || BLDG_SIZE, false);
    if (b.fire > 0) {
      const f = img["fire" + (Math.floor(fireAnim) % 4)];
      drawSprite(f, b.x - 20, b.y - 8, 56, false);
      drawSprite(f, b.x + 18, b.y - 2, 64, true);
      drawSprite(f, b.x, b.y - 40, 48, false);
    }
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
    ctx.fillText(v.name + " (visitor)", v.x, v.y - CHAR_SIZE - 4);
  }});
  for (const r of raiders) if (inView(r.x, r.y)) drawables.push({ y: r.y, draw: () => {
    const frame = r.foe ? img["atksword" + (Math.floor(r.anim) % 4)] : img["hunter" + (Math.floor(r.anim) % 4)];
    drawSprite(frame, r.x, r.y, CHAR_SIZE, r.facing < 0);
    ctx.fillStyle = "#d86a5a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText(r.state === "patrol" ? "thief" : "RAIDER", r.x, r.y - CHAR_SIZE - 4);
    if (r.hp < r.maxHp) bar(r.x, r.y - CHAR_SIZE - 14, r.hp / r.maxHp, "#a05252", 34);
  }});
  for (const c of civs) if (c.state !== "sleeping" && inView(c.x, c.y)) drawables.push({ y: c.y, draw: () => {
    if (c === selected) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x, c.y - 2, 18, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    let frame;
    if (c.state === "fighting" || c.state === "sieging")
      frame = img[(isForce(c) || c.armed ? "atksword" : "atkfist") + (Math.floor(c.anim) % 4)];
    else frame = img[c.who + (Math.floor(c.anim) % 4)];
    drawSprite(frame, c.x, c.y, CHAR_SIZE, c.facing < 0);
    ctx.fillStyle = c.rebel ? "#d86a5a" : c === selected ? "#c9a86a" :
                    c.profession === "police" ? "#8aa0c9" : c.profession === "soldier" ? "#b58a5a" : "#7da083";
    ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tag = c.rebel ? " [REBEL]" : c.profession === "police" ? " [police]" : c.profession === "soldier" ? " [soldier]" : "";
    ctx.fillText(c.name + tag, c.x, c.y - CHAR_SIZE - 4);
    if (c.hp < c.maxHp) bar(c.x, c.y - CHAR_SIZE - 16, c.hp / c.maxHp, "#a05252", 34);
    if (c.state === "crafting" || c.state === "buildingFarm" || c.state === "smithing" || c.state === "hunting") {
      const tot = c.state === "crafting" ? CRAFT_TIME * workMul(c) : c.state === "smithing" ? SMITH_TIME * workMul(c) :
                  c.state === "buildingFarm" ? BASE_FARM_BUILD * workMul(c) : 6;
      bar(c.x, c.y - CHAR_SIZE - (c.hp < c.maxHp ? 26 : 16), c.workT / tot, "#c9a86a");
    }
  }});

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  for (const sm of smokes) {
    if (!inView(sm.x, sm.y)) continue;
    ctx.globalAlpha = 0.28 * Math.min(1, sm.t / sm.max);
    ctx.fillStyle = "#b8bcb8";
    ctx.beginPath(); ctx.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // night falls: darkness, and warm light spilling from the doorways
  const night = nightAmt();
  if (night > 0.01) {
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
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.t / 0.5);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  if (buildMode) {
    const ok = legalToBuild(buildMode, mouse.wx, mouse.wy) && canPay(costOf(buildMode));
    ctx.globalAlpha = 0.55;
    const ghost = buildMode === "sapling" ? img.tree : buildMode === "farm" ? img.farm : img[buildMode];
    const gs = buildMode === "sapling" ? TREE_SIZE * 0.4 : (SMALL_BLDG[buildMode] || (buildMode === "farm" ? FARM_SIZE : BLDG_SIZE));
    if (buildMode === "wall" && wallRot) drawSprite(img.wallv, mouse.wx, mouse.wy, gs, false);
    else if (buildMode === "gate" && wallRot) {
      ctx.save(); ctx.translate(mouse.wx, mouse.wy - gs / 2); ctx.rotate(Math.PI / 2);
      ctx.drawImage(ghost, -gs / 2, -gs / 2, gs, gs);
      ctx.restore();
    } else drawSprite(ghost, mouse.wx, mouse.wy, gs, false);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#7da083" : "#a05252"; ctx.lineWidth = 2;
    ctx.strokeRect(mouse.wx - gs / 2, mouse.wy - gs, gs, gs);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
