"use strict";

// ===== Forester alpha 0.3 — tech, unrest, and iron =====

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
const TAX_INTERVAL = 45, POLICE_COST = 40, TOOL_PRICE_GOV = 10, TOOL_PRICE_SELF = 8;
const TORCH_TIME = 6, FIRE_TIME = 10, ATK_INTERVAL = 0.9, FIST_DMG = 8;

const REPAIR_COST = { logs: 20, doors: 1 };
const STATIC_COSTS = {
  recruit: { logs: 30 }, market: { logs: 25 }, sapling: { logs: 1 },
};

// --- tech tree (from the hand-drawn trees) ---
const TECH = {};
function T(id, name, tree, req, depth, desc) { TECH[id] = { id, name, tree, req, depth, desc, done: false }; }
// GROWTH
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
T("guarddogs", "Guard Dogs", "growth", ["pettraining"], 7, "Police spot rebels much farther away");
T("wardogs", "War Dogs", "growth", ["guarddogs"], 8, "Police +5 damage");
T("horses", "Horses", "growth", ["taming"], 5, "Everyone walks 15% faster");
T("horsebreeding", "Horse Breeding", "growth", ["horses"], 6, "+10% more walking speed");
T("horsefeed", "Horse Feed", "growth", ["horses"], 6, "Hunger fades 20% slower");
T("stables", "Stables", "growth", ["horses"], 6, "Building & farm work 20% faster");
T("saddling", "Saddling", "growth", ["horses"], 6, "+10% more walking speed");
T("warhorse", "War Horse", "growth", ["saddling", "stables"], 7, "Police move 35% faster");
T("cavalry", "Cavalry", "growth", ["warhorse"], 8, "Police +50 health");
T("hussars", "Hussars", "growth", ["cavalry"], 9, "Police +15 damage");
// MILITARY PHILOSOPHY
T("trading", "Trading", "military", [], 0, "Market prices +1 DM");
T("currencies", "Currencies", "military", ["trading"], 1, "Taxes collect +1 DM");
T("marketing", "Marketing", "military", ["currencies"], 2, "Market prices +1 more DM");
T("policing", "Policing", "military", ["marketing"], 3, "Unlocks recruiting police");
T("court", "Court", "military", ["policing"], 4, "Half of beaten rebels are subdued alive");
T("landownership", "Land Ownership", "military", ["currencies"], 2, "Cabins house 3");
T("ownership", "Ownership", "military", ["landownership"], 3, "Dismantling refunds 75%");
T("loanship", "Loanship", "military", ["ownership"], 4, "Treasury may borrow to -50 DM");
T("slavery", "Slavery", "military", ["ownership"], 4, "Forced labour edict: work +25% faster, happiness plummets");
T("slavemarket", "Slave Market", "military", ["slavery"], 5, "+2 DM each tax collection; happiness suffers");
T("forging", "Forging", "military", ["policing"], 4, "Unlocks blacksmiths");
T("spears", "Spears", "military", ["forging"], 5, "Blacksmiths may forge spears (14 dmg)");
T("blades", "Blades", "military", ["forging"], 5, "All weapons +5 damage");
T("hilts", "Hilts", "military", ["blades"], 6, "Weapons cost 1 less iron");
T("swords", "Swords", "military", ["hilts"], 7, "Blacksmiths may forge swords (20 dmg)");
T("battleaxes", "Battle Axes", "military", ["swords"], 8, "Blacksmiths may forge battle axes (28 dmg)");
T("lances", "Lances", "military", ["swords"], 8, "Police +10 damage (requires War Horse)");
T("defending", "Defending", "military", ["policing"], 4, "Buildings torched 30% slower");
T("raiding", "Raiding", "military", ["defending"], 5, "Police +10 damage");
T("occupation", "Occupation", "military", ["raiding"], 6, "Taxes collect +1 more DM");
TECH.lances.req.push("warhorse");

const has = id => TECH[id].done;
const techCost = t => 15 + t.depth * 12;
const techTime = t => 45 + t.depth * 40;
let research = null; // {id, t}

// --- derived stats ---
const walkSpeed = c => BASE_WALK * (1 + (has("horses") ? 0.15 : 0) + (has("horsebreeding") ? 0.10 : 0) + (has("saddling") ? 0.10 : 0)) * (c && c.profession === "police" ? (has("warhorse") ? 1.35 : 1.15) : 1);
const workMul = c => (c && c.tool ? 0.65 : 1) * (has("stables") ? 0.8 : 1) * (laws.forced ? 0.75 : 1);
const chopTime = c => BASE_CHOP * (has("axing") ? 0.65 : has("treecutting") ? 0.8 : 1) * workMul(c);
const logsPerTree = () => BASE_LOGS_PER_TREE + (has("sawing") ? 2 : 0) + (has("sawmills") ? 3 : 0);
const doorCost = () => has("sawmills") ? 3 : 5;
const farmSeedCost = () => has("seeding") ? 4 : 6;
const farmRipen = () => BASE_FARM_RIPEN * (has("agriculture") ? 0.7 : 1);
const sellPrice = () => 3 + (has("trading") ? 1 : 0) + (has("marketing") ? 1 : 0);
const taxBonus = () => (has("currencies") ? 1 : 0) + (has("occupation") ? 1 : 0) + (has("slavemarket") ? 2 : 0);
const policeDmg = () => 12 + (has("wardogs") ? 5 : 0) + (has("hussars") ? 15 : 0) + (has("lances") ? 10 : 0) + (has("raiding") ? 10 : 0);
const policeMaxHp = () => 100 + (has("petarmour") ? 25 : 0) + (has("cavalry") ? 50 : 0);
const torchTime = () => TORCH_TIME / ((has("defending") ? 0.7 : 1) * (has("pettraining") ? 0.75 : 1));
const weaponDmg = () => (has("battleaxes") ? 28 : has("swords") ? 20 : has("spears") ? 14 : 0) + (has("blades") ? 5 : 0);
const weaponIron = () => Math.max(1, 2 - (has("hilts") ? 1 : 0));
const canForgeWeapons = () => has("spears") || has("swords") || has("battleaxes");
const treasuryFloor = () => has("loanship") ? -50 : 0;
const cabinCapacity = () => has("landownership") ? 3 : 2;
const dismantleRefund = () => has("ownership") ? 0.75 : 0.5;

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
  tree: "assets/sprites/env/spruce_tree_32.png",
  grass: "assets/sprites/env/grass_64.png",
  stone: "assets/sprites/env/stone_32.png",
  patch: "assets/sprites/env/grasspatch_32.png",
  burned: "assets/sprites/buildings/burned_house_32.png",
  cabin: "assets/sprites/buildings/log_cabin_32.png",
  recruit: "assets/sprites/buildings/recruitment_center_32.png",
  market: "assets/sprites/buildings/market_32.png",
  farm: "assets/sprites/buildings/farm_32.png",
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
  img[key].onload = () => { if (++loaded === imageNames.length) start(); };
  img[key].src = IMAGES[key];
}

// --- state ---
const res = { logs: 0, seeds: 0, stone: 0, iron: 0, doors: 0, wheat: 0, bread: 0, meat: 0, dm: 60, weapons: 0, tools: 0 };
let taxRate = 2, policeCount = 0;
const laws = { civWeapons: false, hunterWeapons: true, forced: false };

const cam = { x: 0, y: 0 };
const keys = {};
const mouse = { x: 0, y: 0, wx: 0, wy: 0 };

const buildings = [];   // {type, x, y, progress, occupants[], fire, torchP, placed}
const farms = [];       // {x, y, ready, growT, workers[], progress}
const civs = [];
const visitors = [];
const chunks = new Map();
const corpsesToRemove = [];

let selected = null, selectedBldg = null, buildMode = null;
let toastTimer = 0, hunterTimer = 40, visitorSeq = 0, paused = false;
let techTab = "growth";

const NAME_POOL = ["Falk", "Jorg", "Matthias", "Anselm", "Dietrich", "Lorenz", "Veit", "Kaspar",
  "Otto", "Bruno", "Conrad", "Ludwig", "Gunther", "Wilhelm", "Albrecht", "Erwin"];
const usedNames = new Set(["Brother", "Sister"]);
function nextName() {
  const free = NAME_POOL.filter(n => !usedNames.has(n));
  const name = free.length ? free[Math.floor(Math.random() * free.length)]
                           : NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)] + " II";
  usedNames.add(name);
  return name;
}

buildings.push({ type: "burned", x: 0, y: 0, progress: -1, occupants: [], fire: 0, torchP: -1, placed: false });
civs.push(mkCiv("Brother", "brother", -70, 110));
civs.push(mkCiv("Sister", "sister", 70, 130));

function mkCiv(name, who, x, y) {
  return { name, who, x, y, tx: x, ty: y, state: "idle", anim: 0, facing: 1,
           task: null, workT: 0, home: null, profession: null,
           hunger: 100, hp: 100, happiness: 75, rebel: false, armed: false, tool: false,
           inv: { logs: 0, seeds: 0, stone: 0, iron: 0, wheat: 0, bread: 0, meat: 0, dm: 0 },
           autoT: 3 + Math.random() * 4, taxT: TAX_INTERVAL, atkT: 0, stuckT: 0, isCiv: true };
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
  const [x0, y0] = chunkOf(cam.x - pad, cam.y - pad);
  const [x1, y1] = chunkOf(cam.x + canvas.width + pad, cam.y + canvas.height + pad);
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

// --- geometry ---
function bldgRect(b) {
  const s = b.type === "farm" ? FARM_SIZE : BLDG_SIZE;
  return { x: b.x - s / 2, y: b.y - s, w: s, h: s };
}
const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pointInRect = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
const allStructures = () => buildings.concat(farms.map(f => ({ type: "farm", x: f.x, y: f.y })));

function legalToBuild(type, wx, wy) {
  const s = type === "sapling" ? 20 : (type === "farm" ? FARM_SIZE : BLDG_SIZE);
  const cand = { x: wx - s / 2, y: wy - s, w: s, h: s };
  for (const b of allStructures()) {
    const r = inflate(bldgRect(b), 12);
    r.h += 26;
    if (rectsOverlap(cand, r)) return false;
  }
  for (const t of nearThings("trees", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  for (const t of nearThings("stones", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  return true;
}

function collideMove(c, nx, ny) {
  const blocked = (x, y) => allStructures().some(b => pointInRect(x, y, inflate(bldgRect(b), 6)));
  const ox = c.x, oy = c.y;
  if (!blocked(nx, ny)) { c.x = nx; c.y = ny; }
  else if (!blocked(nx, c.y)) c.x = nx;
  else if (!blocked(c.x, ny)) c.y = ny;
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
  return res.logs >= (cost.logs || 0) && res.doors >= (cost.doors || 0) &&
         res.seeds >= (cost.seeds || 0) && res.dm - (cost.dm || 0) >= treasuryFloor();
}
function pay(cost) {
  res.logs -= cost.logs || 0; res.doors -= cost.doors || 0;
  res.seeds -= cost.seeds || 0; res.dm -= cost.dm || 0;
}
const costText = c => [c.logs && `${c.logs} logs`, c.doors && `${c.doors} door`, c.seeds && `${c.seeds} seeds`, c.dm && `${c.dm} DM`].filter(Boolean).join(", ");

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
  if (!civs.includes(c)) return;   // already dead — never splice by -1
  if (c.profession === "police") policeCount--;
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  if (selected === c) { selected = null; }
  civs.splice(civs.indexOf(c), 1);
  toast(`${c.name} ${why}. The colony numbers ${civs.length}.`);
  syncUI();
}

// --- input ---
addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; if (e.key === "Escape") { buildMode = null; syncUI(); } });
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  buildMode = null; selected = null; selectedBldg = null;
  syncUI();
});

canvas.addEventListener("click", e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.wx = mouse.x + cam.x; mouse.wy = mouse.y + cam.y;
  if (paused) return;

  if (buildMode) { tryPlace(buildMode, mouse.wx, mouse.wy); return; }

  for (const v of visitors)
    if (Math.abs(mouse.wx - v.x) < 26 && mouse.wy < v.y && mouse.wy > v.y - CHAR_SIZE) return openDialogue(v);

  // clicking a civilian: select — or order an attack on a rebel if police selected
  for (const c of civs) {
    if (Math.abs(mouse.wx - c.x) < 24 && mouse.wy < c.y && mouse.wy > c.y - CHAR_SIZE) {
      if (selected && selected !== c && selected.profession === "police" && c.rebel) {
        order(selected, { kind: "attack", target: c, x: c.x, y: c.y });
        toast(`${selected.name} moves to put down ${c.name}.`);
        return;
      }
      selected = c; selectedBldg = null;
      toast(`${c.name} selected.`);
      syncUI();
      return;
    }
  }

  if (selected) {
    // resource nodes
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
    // farms: assign farmer, or harvest if ripe
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
        } else toast("Only farmers can be assigned; others can harvest when the crop is ripe.");
        return;
      }
    // burned ruin: repair by order
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

  // building inspection panel
  for (const b of buildings)
    if (pointInRect(mouse.wx, mouse.wy, bldgRect(b))) { selectedBldg = b; selected = null; syncUI(); return; }
  for (const f of farms)
    if (pointInRect(mouse.wx, mouse.wy, bldgRect({ type: "farm", x: f.x, y: f.y }))) { selectedBldg = f; f.type = "farm"; selected = null; syncUI(); return; }

  if (selected) order(selected, { kind: "walk", x: mouse.wx, y: mouse.wy });
});

function tryPlace(type, wx, wy) {
  const cost = costOf(type);
  if (!canPay(cost)) { toast(`Not enough materials: needs ${costText(cost)}.`); return; }
  if (!legalToBuild(type, wx, wy)) { toast("Cannot build there — too close to another building, its entrance, or an obstacle."); return; }
  pay(cost);
  if (type === "sapling") {
    const [cx, cy] = chunkOf(wx, wy);
    getChunk(cx, cy).trees.push({ x: wx, y: wy, alive: true, progress: -1, growth: 0 });
    toast("Spruce sapling planted.");
  } else if (type === "farm") {
    farms.push({ x: wx, y: wy, ready: false, growT: 0, workers: [], progress: -1 });
    toast("Farm laid out. Assign farmers to it by selecting them and clicking the farm.");
  } else {
    buildings.push({ type, x: wx, y: wy, progress: -1, occupants: [], fire: 0, torchP: -1, placed: true });
    toast(type === "cabin" ? "Log cabin built." : type === "recruit" ? "Civilian Recruitment Center built." : "Market Center built.");
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
  if (!t || t.kind === "walk") { c.state = "idle"; c.task = null; return; }
  const simple = { chop: "chopping", quarry: "quarrying", gather: "gathering", craft: "crafting",
                   buildFarm: "buildingFarm", harvest: "harvesting", sell: "selling", hunt: "hunting", smith: "smithing" };
  if (t.kind === "repair") {
    if (!canPay(REPAIR_COST)) { toast("Materials gone — repair cancelled."); c.state = "idle"; c.task = null; return; }
    pay(REPAIR_COST);
    c.state = "repairing"; c.workT = 0;
  } else if (t.kind === "attack") {
    c.state = "fighting"; c.workT = 0;
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
    if (c.inv.bread > 0) { c.inv.bread--; c.hunger = Math.min(100, c.hunger + 35); return; }
    if (c.inv.meat > 0) { c.inv.meat--; c.hunger = Math.min(100, c.hunger + 35); return; }
    if (c.inv.wheat > 0) { c.inv.wheat--; c.hunger = Math.min(100, c.hunger + 15); return; }
    if (res.bread > 0 && c.home) { res.bread--; c.hunger = Math.min(100, c.hunger + 35); return; }
    if (res.meat > 0 && c.home) { res.meat--; c.hunger = Math.min(100, c.hunger + 35); return; }
  }

  // buy a tool with their own coin
  if (!c.tool && res.tools > 0 && c.inv.dm >= TOOL_PRICE_SELF) {
    res.tools--; c.inv.dm -= TOOL_PRICE_SELF; res.dm += TOOL_PRICE_SELF; c.tool = true;
    toast(`${c.name} buys a tool from the smithy with their own coin.`);
    return;
  }

  if (!c.home) return;

  // blacksmith work
  if (c.profession === "blacksmith" && has("forging")) {
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

  // gather seeds for the colony when stores run low
  if (res.seeds < farmSeedCost() * 2) {
    const p = nearThings("patches", c.x, c.y, 700).filter(p => p.alive)[0];
    if (p) { order(c, { kind: "gather", target: p, forColony: true, x: p.x + 16, y: p.y + 4 }); return; }
  }

  // build a farm beside the cabin of their own accord — needs materials and a legal spot
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
    const mine = farms.find(f => f.ready && f.workers.includes(c)) ||
                 farms.find(f => f.ready && Math.hypot(f.x - home.x, f.y - home.y) < 220) ||
                 farms.find(f => f.ready && f.workers.length === 0);
    if (mine) { order(c, { kind: "harvest", target: mine, x: mine.x, y: mine.y + 10 }); return; }
  }
  if (c.profession === "hunter" && c.inv.meat < 2) {
    const a = Math.random() * Math.PI * 2;
    order(c, { kind: "hunt", x: c.x + Math.cos(a) * 350, y: c.y + Math.sin(a) * 350 });
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
        + (has("taming") ? 3 : 0) + (has("pets") ? 4 : 0) + (has("pettoys") ? 4 : 0);
  if (c.hunger > 60) t += 4;
  if (c.hunger < 30) t -= 12;
  if (!c.home) t -= 8;
  return Math.max(0, Math.min(100, t));
}

function maybeRebel(c) {
  if (c.rebel || c.profession === "police" || civs.length < 2) return;
  if (c.happiness < 25 && Math.random() < 0.08) {
    c.rebel = true;
    const lawAllows = laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter");
    if (lawAllows && res.weapons > 0 && weaponDmg() > 0) { res.weapons--; c.armed = true; }
    c.task = null; c.state = "idle";
    toast(`⚠ ${c.name} has turned against the colony${c.armed ? " — and took a weapon" : ""}!`);
  }
}

function rebelAI(c, dt) {
  if (c.state === "fighting" || c.state === "torching" || c.state === "walking") return;
  const targets = buildings.filter(b => b.type !== "burned" && !b.fire);
  if (targets.length && Math.random() < 0.6) {
    let best = targets[0], bd = Infinity;
    for (const b of targets) { const d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } }
    order(c, { kind: "torch", target: best, x: best.x, y: best.y + 14 });
  } else {
    const prey = civs.filter(o => o !== c && !o.rebel);
    if (prey.length) {
      const p = prey[Math.floor(Math.random() * prey.length)];
      order(c, { kind: "attack", target: p, x: p.x, y: p.y });
    }
  }
}

function policeAI(c) {
  if (c.state !== "idle") return;
  const range = 450 + (has("guarddogs") ? 250 : 0);
  let best = null, bd = range;
  for (const r of civs) if (r.rebel) {
    const d = Math.hypot(r.x - c.x, r.y - c.y);
    if (d < bd) { bd = d; best = r; }
  }
  if (best) order(c, { kind: "attack", target: best, x: best.x, y: best.y });
}

function strike(a, b) {
  const dmg = a.profession === "police" ? policeDmg() : (a.armed ? weaponDmg() : FIST_DMG);
  b.hp -= dmg;
  if (b.hp <= 0) {
    if (b.rebel && has("court") && Math.random() < 0.5) {
      b.rebel = false; b.armed = false; b.hp = 30; b.happiness = 60;
      toast(`${b.name} is beaten down, subdued, and hauled before the court.`);
    } else killCiv(b, b.rebel ? "died resisting the law" : "was slain in the unrest");
    a.state = "idle"; a.task = null;
  } else if (!b.rebel && b.profession !== "police" && !b.task) {
    // victims flee
    order(b, { kind: "walk", x: b.x + (b.x - a.x) * 4, y: b.y + (b.y - a.y) * 4 });
  } else if (b.rebel && (!b.task || b.task.kind !== "attack")) {
    order(b, { kind: "attack", target: a, x: a.x, y: a.y }); // fight back
  }
}

// --- torching / fire ---
function igniteCheck(b, dt) {
  if (!b.fire) return;
  b.fire -= dt;
  if (b.fire <= 0) {
    b.fire = 0;
    for (const o of b.occupants) o.home = null;
    b.occupants = [];
    if (b.type === "cabin") { b.type = "burned"; toast("A cabin has burned to a charred ruin. It can be repaired by order."); }
    else { buildings.splice(buildings.indexOf(b), 1); toast(`The ${b.type === "market" ? "market" : "recruitment center"} has burned to the ground.`); }
    if (selectedBldg === b) selectedBldg = null;
    syncUI();
  }
}

// --- visitors & dialogue ---
function spawnVisitor() {
  const center = buildings.find(b => b.type === "recruit" && !b.fire);
  if (!center) return;
  const a = Math.random() * Math.PI * 2;
  visitors.push({
    id: ++visitorSeq, name: nextName(),
    face: Math.random() < 0.5 ? "hunter_face_a" : "hunter_face_b",
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
  $("dlgName").textContent = `${v.name}, wandering hunter`;
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
  if (!pool.length) {
    // nothing left to say — he decides on the spot
    return v.meter >= 60 ? joinColony(v) : rejectColony(v);
  }
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  for (const o of picks) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = o.text;
    b.addEventListener("click", () => {
      v.used.add(o.text);            // never the same line twice
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
  const c = mkCiv(v.name, "ragged", v.x, v.y);   // his hunter's leathers become colony rags
  c.profession = "hunter";
  civs.push(c);
  const housed = houseCiv(c);
  toast(`${v.name} signs on — a civilian certificate slides out through the slot. ` +
        (housed ? "He moves into a cabin and will pay taxes." : "Build him a cabin: no taxes until he has a roof."));
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
    renderTech(); syncUI();
  }
}
function renderTech() {
  const list = $("techList");
  list.innerHTML = "";
  for (const t of Object.values(TECH).filter(t => t.tree === techTab).sort((a, b) => a.depth - b.depth)) {
    const div = document.createElement("div");
    div.className = "tech " + (t.done ? "done" : techAvailable(t) ? "" : "locked");
    const researching = research && research.id === t.id;
    div.innerHTML = `<div><div class="nm">${t.name}${t.done ? " ✓" : ""}</div><div class="desc">${t.desc}` +
      (t.req.length ? ` — needs ${t.req.map(r => TECH[r].name).join(", ")}` : "") + `</div></div>`;
    if (researching) {
      const wrap = document.createElement("div");
      wrap.className = "barwrap";
      wrap.innerHTML = `<div class="barfill" style="width:${Math.round(research.t / techTime(t) * 100)}%"></div>`;
      div.appendChild(wrap);
    } else if (!t.done && techAvailable(t)) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = `${techCost(t)} DM / ${Math.round(techTime(t) / 6) / 10} min`;
      b.addEventListener("click", () => startResearch(t.id));
      div.appendChild(b);
    }
    list.appendChild(div);
  }
}

// --- UI wiring ---
$("buildToggle").addEventListener("click", () => $("buildDrop").classList.toggle("open"));
$("craftToggle").addEventListener("click", () => $("craftDrop").classList.toggle("open"));
$("recruitToggle").addEventListener("click", () => $("recruitDrop").classList.toggle("open"));
document.querySelectorAll("#buildMenu .menu-item").forEach(item =>
  item.addEventListener("click", () => {
    buildMode = item.dataset.build;
    $("buildDrop").classList.remove("open");
    toast("Click the map to place. Right-click or Esc to cancel.");
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
    if (prof === "police") {
      if (!has("policing")) return toast("Recruiting police requires the Policing technology.");
      if (res.dm - POLICE_COST < treasuryFloor()) return toast(`An officer costs ${POLICE_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may join the police.");
      if (selected.profession === "police") return toast(`${selected.name} already serves.`);
      res.dm -= POLICE_COST;
      selected.profession = "police"; policeCount++;
      toast(`${selected.name} joins the police force of the colony.`);
    } else if (prof === "blacksmith") {
      if (!has("forging")) return toast("Blacksmiths require the Forging technology.");
      if (selected.profession === "police") policeCount--;
      selected.profession = "blacksmith";
      toast(`${selected.name} takes up the hammer as blacksmith.`);
    } else {
      if (selected.profession === "police") policeCount--;
      selected.profession = "farmer";
      toast(`${selected.name} takes up farming. Assign them to a farm by clicking it.`);
    }
    syncUI();
  }));
document.addEventListener("click", e => {
  for (const id of ["buildDrop", "craftDrop", "recruitDrop"])
    if ($(id) && !$(id).contains(e.target)) $(id).classList.remove("open");
});

$("govToggle").addEventListener("click", () => {
  const p = $("govPanel");
  p.style.display = p.style.display === "block" ? "none" : "block";
});
$("taxSlider").addEventListener("input", e => { taxRate = +e.target.value; $("taxVal").textContent = taxRate; syncUI(); });
$("lawCivWeapons").addEventListener("change", e => { laws.civWeapons = e.target.checked; });
$("lawHunterWeapons").addEventListener("change", e => { laws.hunterWeapons = e.target.checked; });
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
    toast("The farm is dismantled.");
  } else {
    if (b.fire) return toast("It is on fire — no one is dismantling that.");
    const base = b.type === "burned" ? 10 : (costOf(b.type === "cabin" ? "cabin" : b.type) || { logs: 10 }).logs;
    const refund = Math.floor(base * dismantleRefund());
    for (const o of b.occupants) o.home = null;
    buildings.splice(buildings.indexOf(b), 1);
    res.logs += refund;
    toast(`Dismantled — ${refund} logs recovered.`);
  }
  selectedBldg = null;
  syncUI();
});

function syncUI() {
  $("buildToggle").classList.toggle("active", !!buildMode);
  $("rLogs").textContent = res.logs; $("rSeeds").textContent = res.seeds;
  $("rStone").textContent = res.stone; $("rIron").textContent = res.iron;
  $("rDoors").textContent = res.doors; $("rBread").textContent = res.bread;
  $("rMeat").textContent = res.meat; $("rWeapons").textContent = res.weapons;
  $("rTools").textContent = res.tools; $("rDM").textContent = res.dm;
  $("rPop").textContent = civs.length; $("rPolice").textContent = policeCount;
  $("rTax").textContent = taxRate;
  const avg = civs.length ? Math.round(civs.reduce((s, c) => s + c.happiness, 0) / civs.length) : 0;
  $("rHappy").textContent = avg + "%";
  $("govHappy").textContent = avg + "%";
  $("govDM").textContent = res.dm + " DM";
  $("govPolice").textContent = policeCount + " officers";
  $("miCabin").textContent = `Log Cabin — ${costText(cabinCost())}`;
  $("miFarm").textContent = `Wheat Farm — ${costText(costOf("farm"))}`;
  $("miDoor").textContent = `Door — ${doorCost()} logs (selected civilian)`;
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
    $("cpHpN").textContent = Math.round(selected.hp);
    $("cpHp").style.width = Math.max(0, selected.hp) + "%";
    $("cpHungerN").textContent = Math.round(selected.hunger);
    $("cpHunger").style.width = Math.max(0, selected.hunger) + "%";
    $("cpHappyN").textContent = Math.round(selected.happiness);
    $("cpHappy").style.width = Math.max(0, selected.happiness) + "%";
    $("cpTool").textContent = selected.tool ? "good tool" : "none";
    $("cpLogs").textContent = selected.inv.logs; $("cpSeeds").textContent = selected.inv.seeds;
    $("cpStone").textContent = selected.inv.stone; $("cpIron").textContent = selected.inv.iron;
    $("cpWheat").textContent = selected.inv.wheat; $("cpBread").textContent = selected.inv.bread;
    $("cpMeat").textContent = selected.inv.meat; $("cpDM").textContent = selected.inv.dm;
    const assigned = farms.filter(f => f.workers.includes(selected)).length;
    $("cpFarms").textContent = selected.profession === "farmer" ?
      `Tends ${assigned} farm(s). Click a farm to assign or unassign.` : "";
  }

  const bp = $("bldgPanel");
  if (!selectedBldg) bp.style.display = "none";
  else {
    bp.style.display = "block";
    const b = selectedBldg;
    const isFarm = farms.includes(b);
    $("bpName").textContent = isFarm ? "WHEAT FARM" :
      b.type === "burned" ? "BURNED RUIN" : b.type === "cabin" ? "LOG CABIN" :
      b.type === "recruit" ? "RECRUITMENT CENTER" : "MARKET CENTER";
    $("bpInfo").textContent = isFarm ? `${b.workers.length} farmer(s) assigned; ${b.ready ? "crop is ripe" : "crop growing"}.` :
      b.type === "burned" ? "Select a civilian and click the ruin to order its repair (20 logs + 1 door)." :
      b.fire ? "IT IS ON FIRE." : "Standing.";
    $("bpOcc").textContent = isFarm ? "—" : (b.occupants.length ? b.occupants.map(o => o.name).join(", ") : "none");
  }
}

// --- simulation ---
function update(dt) {
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) msgEl.textContent = "";
  const up = keys["w"] || keys["arrowup"], dn = keys["s"] || keys["arrowdown"];
  const lf = keys["a"] || keys["arrowleft"], rt = keys["d"] || keys["arrowright"];
  if (up) cam.y -= CAM_SPEED * dt;
  if (dn) cam.y += CAM_SPEED * dt;
  if (lf) cam.x -= CAM_SPEED * dt;
  if (rt) cam.x += CAM_SPEED * dt;
  mouse.wx = mouse.x + cam.x; mouse.wy = mouse.y + cam.y;

  if (paused) return;

  updateResearch(dt);

  for (const ch of visibleChunks(CHUNK * 2))
    for (const t of ch.trees)
      if (t.alive && t.growth < 1) t.growth = Math.min(1, t.growth + dt / (SAPLING_GROW * (has("replanting") ? 0.5 : 1)));
  for (const f of farms) if (!f.ready && (f.growT += dt) >= farmRipen()) f.ready = true;
  for (const b of [...buildings]) igniteCheck(b, dt);

  if (buildings.some(b => b.type === "recruit" && !b.fire)) {
    hunterTimer -= dt;
    if (hunterTimer <= 0) {
      hunterTimer = 100 + Math.random() * 80;    // hunters are an uncommon sight
      if (visitors.length < 2) spawnVisitor();
    }
  }
  for (const v of [...visitors]) updateVisitor(v, dt);

  for (const c of [...civs]) {
    c.hunger = Math.max(0, c.hunger - HUNGER_DECAY * (has("horsefeed") ? 0.8 : 1) * dt);
    if (c.hunger <= 0) {
      c.hp -= STARVE_DPS * dt;
      if (c.hp <= 0) { killCiv(c, "starved to death"); continue; }
    }

    const target = happinessTarget(c);
    c.happiness += Math.sign(target - c.happiness) * Math.min(Math.abs(target - c.happiness), 2.5 * dt);
    maybeRebel(c);

    if (c.home && !c.rebel) {
      c.taxT -= dt;
      if (c.taxT <= 0) {
        c.taxT = TAX_INTERVAL;
        const due = taxRate + taxBonus();
        const paid = Math.min(c.inv.dm, due);
        c.inv.dm -= paid; res.dm += paid;
      }
    }

    if (c.rebel) rebelAI(c, dt);
    if (c.profession === "police" && !c.rebel) policeAI(c);

    const speed = walkSpeed(c);
    if (c.state === "walking") {
      // chase moving targets
      if (c.task && c.task.kind === "attack" && c.task.target) {
        if (!civs.includes(c.task.target)) { c.state = "idle"; c.task = null; continue; }
        c.tx = c.task.target.x; c.ty = c.task.target.y;
      }
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      const reach = c.task && c.task.kind === "attack" ? 34 : 5;
      if (d < reach) { if (reach === 5) { c.x = c.tx; c.y = c.ty; } arrive(c); }
      else {
        collideMove(c, c.x + (dx / d) * speed * dt, c.y + (dy / d) * speed * dt);
        c.facing = dx < 0 ? -1 : 1;
        c.anim += dt * 8;
      }
    } else if (c.state === "chopping") {
      const t = c.task.target;
      if (!t.alive) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; t.progress = c.workT / chopTime(c); c.anim += dt * 10;
      if (c.workT >= chopTime(c)) {
        t.alive = false; t.progress = -1;
        c.inv.logs += logsPerTree();
        toast(`${c.name} felled a spruce: +${logsPerTree()} logs in their pack.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "quarrying") {
      const s = c.task.target;
      if (!s.alive) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; s.progress = c.workT / (QUARRY_TIME * workMul(c)); c.anim += dt * 10;
      if (c.workT >= QUARRY_TIME * workMul(c)) {
        s.alive = false; s.progress = -1;
        c.inv.stone += 3; c.inv.iron += 1;
        toast(`${c.name} breaks the outcrop: +3 stone, +1 iron.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "gathering") {
      const p = c.task.target;
      if (!p.alive) { c.state = "idle"; c.task = null; continue; }
      const need = PATCH_TIME * (has("foraging") ? 0.5 : 1) * workMul(c);
      c.workT += dt; p.progress = c.workT / need; c.anim += dt * 8;
      if (c.workT >= need) {
        p.alive = false; p.progress = -1;
        const got = 2 + (has("foraging") ? 1 : 0);
        if (c.task.forColony) { res.seeds += got; toast(`${c.name} gathers ${got} seeds for the colony stores.`); }
        else { c.inv.seeds += got; toast(`${c.name} gathers ${got} seeds.`); }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "crafting") {
      c.workT += dt; c.anim += dt * 6;
      if (c.workT >= CRAFT_TIME * workMul(c)) {
        res.doors++;
        toast(`${c.name} finished a rough plank door. Doors: ${res.doors}.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "smithing") {
      c.workT += dt; c.anim += dt * 6;
      if (c.workT >= SMITH_TIME * workMul(c)) {
        if (c.task.make === "tool") { res.tools++; toast(`${c.name} finishes a sturdy tool.`); }
        else { res.weapons++; toast(`${c.name} finishes a weapon for the armoury.`); }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "repairing") {
      const b = c.task.target;
      c.workT += dt; b.progress = c.workT / (REPAIR_TIME * workMul(c)); c.anim += dt * 10;
      if (c.workT >= REPAIR_TIME * workMul(c)) {
        b.type = "cabin"; b.progress = -1; b.placed = false;
        toast(`The ruin stands whole again. ${c.name} rebuilt it.`);
        c.state = "idle"; c.task = null;
        for (const cc of civs) if (!cc.home) houseCiv(cc);
      }
    } else if (c.state === "buildingFarm") {
      c.workT += dt; c.anim += dt * 8;
      if (c.workT >= BASE_FARM_BUILD * workMul(c)) {
        const t = c.task;
        if (legalToBuild("farm", t.fx, t.fy)) {
          const f = { x: t.fx, y: t.fy, ready: false, growT: 0, workers: [], progress: -1 };
          if (c.profession === "farmer") f.workers.push(c);
          farms.push(f);
          toast(`${c.name} finished a little wheat farm.`);
        }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "harvesting") {
      const f = c.task.target;
      if (!f.ready || !farms.includes(f)) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; f.progress = c.workT / (HARVEST_TIME * workMul(c)); c.anim += dt * 8;
      if (c.workT >= HARVEST_TIME * workMul(c)) {
        f.ready = false; f.growT = 0; f.progress = -1;
        c.inv.wheat += 2; c.inv.bread += 1;
        toast(`${c.name} brings in the wheat: +2 wheat, +1 bread.`);
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
        if (earned) toast(`${c.name} sells at the market for ${earned} DM.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "hunting") {
      c.workT += dt; c.anim = 1;
      if (c.workT >= 6) { c.inv.meat += 2; toast(`${c.name} returns from the hunt with meat.`); c.state = "idle"; c.task = null; }
    } else if (c.state === "fighting") {
      const foe = c.task && c.task.target;
      if (!foe || !civs.includes(foe)) { c.state = "idle"; c.task = null; continue; }
      const d = Math.hypot(foe.x - c.x, foe.y - c.y);
      if (d > 130) { c.state = "walking"; c.tx = foe.x; c.ty = foe.y; continue; }
      if (d > 30) {
        // press the attack: keep closing while in melee range band
        collideMove(c, c.x + ((foe.x - c.x) / d) * speed * dt, c.y + ((foe.y - c.y) / d) * speed * dt);
      }
      c.facing = foe.x < c.x ? -1 : 1;
      c.anim += dt * 9;
      c.atkT -= dt;
      if (c.atkT <= 0 && d < 48) { c.atkT = ATK_INTERVAL; strike(c, foe); }
    } else if (c.state === "torching") {
      const b = c.task.target;
      if (!buildings.includes(b) || b.fire) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; b.torchP = c.workT / torchTime(); c.anim += dt * 9;
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

// torch order arrives into "torching"
const _arrive = arrive;
arrive = function (c) {
  const t = c.task;
  if (t && t.kind === "torch") {
    if (!buildings.includes(t.target) || t.target.fire) { c.state = "idle"; c.task = null; return; }
    c.state = "torching"; c.workT = 0;
    return;
  }
  _arrive(c);
};

// --- rendering ---
function drawSprite(image, wx, wyFeet, size, flip) {
  const sx = wx - cam.x, sy = wyFeet - cam.y;
  ctx.save(); ctx.translate(sx, sy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, -size / 2, -size, size, size);
  ctx.restore();
}
function bar(wx, wyTop, frac, color, w = 44) {
  const sx = wx - cam.x, sy = wyTop - cam.y;
  ctx.fillStyle = "#0a0f0c"; ctx.fillRect(sx - w / 2 - 1, sy - 1, w + 2, 8);
  ctx.fillStyle = "#1c2a21"; ctx.fillRect(sx - w / 2, sy, w, 6);
  ctx.fillStyle = color; ctx.fillRect(sx - w / 2, sy, w * Math.min(1, Math.max(0, frac)), 6);
}

let fireAnim = 0;
function render(dt) {
  fireAnim += dt * 8;
  const x0 = Math.floor(cam.x / TILE) * TILE, y0 = Math.floor(cam.y / TILE) * TILE;
  for (let y = y0; y < cam.y + canvas.height; y += TILE)
    for (let x = x0; x < cam.x + canvas.width; x += TILE)
      ctx.drawImage(img.grass, x - cam.x, y - cam.y, TILE, TILE);

  const inView = (x, y) => x > cam.x - 120 && x < cam.x + canvas.width + 120 && y > cam.y - 140 && y < cam.y + canvas.height + 160;
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
        const sx = t.x - cam.x, sy = t.y - cam.y;
        ctx.fillStyle = "#3d2b1c"; ctx.fillRect(sx - 5, sy - 8, 10, 8);
        ctx.fillStyle = "#2a1d13"; ctx.fillRect(sx - 5, sy - 3, 10, 3);
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
  for (const f of farms) if (inView(f.x, f.y)) drawables.push({ y: f.y, draw: () => {
    drawSprite(img.farm, f.x, f.y, FARM_SIZE, false);
    if (f.progress >= 0) bar(f.x, f.y - FARM_SIZE - 12, f.progress, "#c9a86a");
    else if (f.ready) {
      ctx.fillStyle = "#d8c26a"; ctx.font = "12px monospace"; ctx.textAlign = "center";
      ctx.fillText("ripe", f.x - cam.x, f.y - cam.y - FARM_SIZE - 4);
    }
    if (selected && selected.profession === "farmer" && f.workers.includes(selected)) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1;
      const r = bldgRect({ type: "farm", x: f.x, y: f.y });
      ctx.strokeRect(r.x - cam.x, r.y - cam.y, r.w, r.h);
    }
  }});
  for (const b of buildings) if (inView(b.x, b.y)) drawables.push({ y: b.y, draw: () => {
    drawSprite(img[b.type], b.x, b.y, BLDG_SIZE, false);
    if (b.fire > 0) {
      const f = img["fire" + (Math.floor(fireAnim) % 4)];
      drawSprite(f, b.x - 20, b.y - 8, 56, false);
      drawSprite(f, b.x + 18, b.y - 2, 64, true);
      drawSprite(f, b.x, b.y - 40, 48, false);
    }
    if (b.progress >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.progress, "#7da083");
    if (b.torchP >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.torchP, "#d86a3a");
    if (selectedBldg === b) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1;
      const r = bldgRect(b);
      ctx.strokeRect(r.x - cam.x, r.y - cam.y, r.w, r.h);
    }
  }});
  for (const v of visitors) if (inView(v.x, v.y)) drawables.push({ y: v.y, draw: () => {
    drawSprite(img["hunter" + (Math.floor(v.anim) % 4)], v.x, v.y, CHAR_SIZE, v.facing < 0);
    ctx.fillStyle = "#c98a6a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText(v.name + " (visitor)", v.x - cam.x, v.y - cam.y - CHAR_SIZE - 4);
  }});
  for (const c of civs) if (inView(c.x, c.y)) drawables.push({ y: c.y, draw: () => {
    if (c === selected) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x - cam.x, c.y - cam.y - 2, 18, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    let frame;
    if (c.state === "fighting")
      frame = img[(c.profession === "police" || c.armed ? "atksword" : "atkfist") + (Math.floor(c.anim) % 4)];
    else
      frame = img[c.who + (Math.floor(c.anim) % 4)];
    drawSprite(frame, c.x, c.y, CHAR_SIZE, c.facing < 0);
    ctx.fillStyle = c.rebel ? "#d86a5a" : c === selected ? "#c9a86a" : (c.profession === "police" ? "#8aa0c9" : "#7da083");
    ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tag = c.rebel ? " [REBEL]" : c.profession === "police" ? " [police]" : "";
    ctx.fillText(c.name + tag, c.x - cam.x, c.y - cam.y - CHAR_SIZE - 4);
    if (c.hp < 100) bar(c.x, c.y - CHAR_SIZE - 16, c.hp / 100, "#a05252", 34);
    if (c.state === "crafting" || c.state === "buildingFarm" || c.state === "smithing" || c.state === "hunting") {
      const tot = c.state === "crafting" ? CRAFT_TIME * workMul(c) : c.state === "smithing" ? SMITH_TIME * workMul(c) :
                  c.state === "buildingFarm" ? BASE_FARM_BUILD * workMul(c) : 6;
      bar(c.x, c.y - CHAR_SIZE - (c.hp < 100 ? 26 : 16), c.workT / tot, "#c9a86a");
    }
  }});

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  if (buildMode) {
    const ok = legalToBuild(buildMode, mouse.wx, mouse.wy) && canPay(costOf(buildMode));
    ctx.globalAlpha = 0.55;
    const ghost = buildMode === "sapling" ? img.tree : buildMode === "farm" ? img.farm : img[buildMode];
    const gs = buildMode === "sapling" ? TREE_SIZE * 0.4 : buildMode === "farm" ? FARM_SIZE : BLDG_SIZE;
    drawSprite(ghost, mouse.wx, mouse.wy, gs, false);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#7da083" : "#a05252"; ctx.lineWidth = 2;
    ctx.strokeRect(mouse.wx - cam.x - gs / 2, mouse.wy - cam.y - gs, gs, gs);
  }
}

// --- loop ---
let last = 0, uiT = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  render(dt);
  uiT += dt;
  if (uiT > 0.25) { uiT = 0; syncUI(); }
  requestAnimationFrame(frame);
}
function start() {
  cam.x = -canvas.width / 2;
  cam.y = -canvas.height / 2 - 60;
  syncUI();
  requestAnimationFrame(frame);
}
