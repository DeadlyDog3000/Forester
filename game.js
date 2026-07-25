"use strict";

// ===== Forester alpha 0.2 — fullscreen colony builder =====

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener("resize", resize);
resize();

const $ = id => document.getElementById(id);
const msgEl = $("msg");

// --- tuning ---
const CHAR_SIZE = 64, BLDG_SIZE = 96, FARM_SIZE = 64, TREE_SIZE = 64, TILE = 128;
const WALK_SPEED = 110, CAM_SPEED = 420;
const CHOP_TIME = 3, CRAFT_TIME = 4, REPAIR_TIME = 6, BUILD_FARM_TIME = 5;
const LOGS_PER_TREE = 5, DOOR_LOG_COST = 5;
const COSTS = {
  cabin:   { logs: 20, doors: 1 },
  recruit: { logs: 30, doors: 0 },
  market:  { logs: 25, doors: 0 },
  sapling: { logs: 1,  doors: 0 },
};
const REPAIR_COST = { logs: 20, doors: 1 };
const CABIN_CAPACITY = 2;
const CHUNK = 512;
const HUNGER_DECAY = 0.35;         // per second
const SAPLING_GROW_TIME = 60;
const FARM_YIELD_TIME = 25;        // seconds per harvest cycle
const SELL_PRICE = 3;              // DM per bread/meat
const TAX_INTERVAL = 45;           // seconds between tax collections
const POLICE_COST = 50;

// --- assets ---
const IMAGES = {
  tree: "assets/sprites/env/spruce_tree_32.png",
  grass: "assets/sprites/env/grass_64.png",
  burned: "assets/sprites/buildings/burned_house_32.png",
  cabin: "assets/sprites/buildings/log_cabin_32.png",
  recruit: "assets/sprites/buildings/recruitment_center_32.png",
  market: "assets/sprites/buildings/market_32.png",
  farm: "assets/sprites/buildings/farm_32.png",
};
for (const who of ["sister", "brother", "hunter"])
  for (let i = 0; i < 4; i++)
    IMAGES[`${who}${i}`] = `assets/sprites/characters/${who}_walk_${i}.png`;

const img = {};
let loaded = 0;
const imageNames = Object.keys(IMAGES);
for (const key of imageNames) {
  img[key] = new Image();
  img[key].onload = () => { if (++loaded === imageNames.length) start(); };
  img[key].src = IMAGES[key];
}

// --- world state ---
const res = { logs: 0, doors: 0, wheat: 0, bread: 0, meat: 0, dm: 60 };
let taxRate = 2;
let policeCount = 0;

const cam = { x: 0, y: 0 };
const keys = {};
const mouse = { x: 0, y: 0, wx: 0, wy: 0 };

const buildings = [];   // {type, x, y(feet), progress, occupants[], farms:0}
const farms = [];       // {x, y, cabin, ready, growT, builder}
const civs = [];
const visitors = [];    // wandering hunters, not yet civilians
const chunks = new Map();

let selected = null;
let buildMode = null;
let toastTimer = 0;
let hunterTimer = 25;
let visitorSeq = 0;
let paused = false;     // while dialogue is open

const HUNTER_NAMES = ["Falk", "Jorg", "Matthias", "Anselm", "Dietrich", "Lorenz", "Veit", "Kaspar"];

// family cabin (burned) at world origin; brother & sister beside it
buildings.push({ type: "burned", x: 0, y: 0, progress: -1, occupants: [], farms: 0 });
civs.push(mkCiv("Brother", "brother", -70, 110));
civs.push(mkCiv("Sister", "sister", 70, 130));

function mkCiv(name, who, x, y) {
  return { name, who, x, y, tx: x, ty: y, state: "idle", anim: 0, facing: 1,
           task: null, workT: 0, home: null, profession: null, hunger: 100,
           inv: { logs: 0, wheat: 0, bread: 0, meat: 0, dm: 0 },
           autoT: 3 + Math.random() * 4, taxT: TAX_INTERVAL, isCiv: true };
}

// --- infinite terrain ---
function chunkKey(cx, cy) { return cx + "," + cy; }
function chunkOf(wx, wy) { return [Math.floor(wx / CHUNK), Math.floor(wy / CHUNK)]; }

function getChunk(cx, cy) {
  const key = chunkKey(cx, cy);
  let ch = chunks.get(key);
  if (ch) return ch;
  ch = { trees: [] };
  let seed = (cx * 73856093) ^ (cy * 19349663) ^ 0x5f3759df;
  seed = seed >>> 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const base = 7;
  for (let i = 0; i < base * 3; i++) {
    const x = cx * CHUNK + rnd() * CHUNK;
    const y = cy * CHUNK + rnd() * CHUNK;
    const d = Math.hypot(x, y);
    if (d < 190) continue;                        // the family clearing
    const dense = d < 430;                        // thick ring around the burned cabin
    if (!dense && i >= base) continue;
    if (ch.trees.some(t => Math.hypot(t.x - x, t.y - y) < 46)) continue;
    ch.trees.push({ x, y, alive: true, progress: -1, growth: 1 });
  }
  chunks.set(key, ch);
  return ch;
}

function visibleChunks(pad = CHUNK) {
  const [x0, y0] = chunkOf(cam.x - pad, cam.y - pad);
  const [x1, y1] = chunkOf(cam.x + canvas.width + pad, cam.y + canvas.height + pad);
  const out = [];
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++)
      out.push(getChunk(cx, cy));
  return out;
}

function nearbyTrees(wx, wy, r) {
  const [cx, cy] = chunkOf(wx, wy);
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      for (const t of getChunk(cx + dx, cy + dy).trees)
        if (Math.hypot(t.x - wx, t.y - wy) < r) out.push(t);
  return out;
}

// --- geometry / collision ---
function bldgRect(b) {
  const s = b.type === "farm" ? FARM_SIZE : BLDG_SIZE;
  return { x: b.x - s / 2, y: b.y - s, w: s, h: s };
}
function inflate(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function pointInRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

const allStructures = () => buildings.concat(farms.map(f => ({ type: "farm", x: f.x, y: f.y })));

function legalToBuild(type, wx, wy) {
  const s = type === "sapling" ? 20 : (type === "farm" ? FARM_SIZE : BLDG_SIZE);
  const cand = { x: wx - s / 2, y: wy - s, w: s, h: s };
  for (const b of allStructures()) {
    // spacing margin, plus extra clearance below (in front of) buildings for doors
    const r = inflate(bldgRect(b), 12);
    r.h += 26;
    if (rectsOverlap(cand, r)) return false;
  }
  for (const t of nearbyTrees(wx, wy, 160))
    if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  return true;
}

function collideMove(c, nx, ny) {
  const blocked = (x, y) => allStructures().some(b => pointInRect(x, y, inflate(bldgRect(b), 6)));
  const ox = c.x, oy = c.y;
  if (!blocked(nx, ny)) { c.x = nx; c.y = ny; }
  else if (!blocked(nx, c.y)) c.x = nx;
  else if (!blocked(c.x, ny)) c.y = ny;
  // a slide that moves us nowhere is a wall-grind: count it as stuck
  if (Math.hypot(c.x - ox, c.y - oy) < 0.5) {
    c.stuckT = (c.stuckT || 0) + 1 / 60;
    if (c.stuckT > 1.2) {
      c.stuckT = 0;
      // close enough to work targets to start them; plain walks just give up
      if (c.task && c.task.kind !== "walk" && Math.hypot(c.tx - c.x, c.ty - c.y) < 100) arrive(c);
      else { c.state = "idle"; c.task = null; }
    }
  } else c.stuckT = 0;
}

// --- helpers ---
function toast(text) { msgEl.textContent = text; toastTimer = 5; }
function canAfford(cost) { return res.logs >= cost.logs && res.doors >= (cost.doors || 0); }
function pay(cost) { res.logs -= cost.logs; res.doors -= (cost.doors || 0); }

function freeHome() {
  return buildings.find(b => b.type === "cabin" && b.occupants.length < CABIN_CAPACITY) || null;
}

function houseCiv(c) {
  const home = freeHome();
  if (!home) return false;
  home.occupants.push(c);
  c.home = home;
  pickProfession(c);
  return true;
}

function pickProfession(c) {
  const partner = c.home.occupants.find(o => o !== c);
  const partnerProvides = partner && (partner.profession === "farmer" || partner.profession === "hunter");
  if (!c.profession && !partnerProvides)
    c.profession = Math.random() < 0.6 ? "farmer" : "hunter";
}

// --- input ---
window.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === "Escape") { buildMode = null; syncUI(); }
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener("mousemove", trackMouse);
function trackMouse(e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.wx = e.clientX + cam.x; mouse.wy = e.clientY + cam.y;
}

canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  buildMode = null;
  selected = null;
  syncUI();
});

canvas.addEventListener("click", e => {
  trackMouse(e);
  if (paused) return;

  if (buildMode) { tryPlace(buildMode, mouse.wx, mouse.wy); return; }

  // visitors first (dialogue)
  for (const v of visitors) {
    if (Math.abs(mouse.wx - v.x) < 26 && mouse.wy < v.y && mouse.wy > v.y - CHAR_SIZE) {
      openDialogue(v);
      return;
    }
  }
  // select civilian
  for (const c of civs) {
    if (Math.abs(mouse.wx - c.x) < 24 && mouse.wy < c.y && mouse.wy > c.y - CHAR_SIZE) {
      selected = c;
      toast(`${c.name} selected.`);
      syncUI();
      return;
    }
  }
  if (!selected) return;

  // order: chop tree
  for (const t of nearbyTrees(mouse.wx, mouse.wy, 80)) {
    if (t.alive && t.growth >= 1 &&
        Math.abs(mouse.wx - t.x) < 26 && mouse.wy < t.y && mouse.wy > t.y - TREE_SIZE) {
      order(selected, { kind: "chop", target: t, x: t.x + 26, y: t.y + 6 });
      toast(`${selected.name} heads out to fell a spruce.`);
      return;
    }
  }
  // order: repair burned cabin
  for (const b of buildings) {
    if (b.type === "burned" && pointInRect(mouse.wx, mouse.wy, bldgRect(b))) {
      if (!canAfford(REPAIR_COST)) {
        toast(`Repair needs ${REPAIR_COST.logs} logs + ${REPAIR_COST.doors} door in town storage. ` +
              `Stored: ${res.logs} logs, ${res.doors} door(s).`);
        return;
      }
      order(selected, { kind: "repair", target: b, x: b.x, y: b.y + 16 });
      toast(`${selected.name} goes to rebuild the family cabin.`);
      return;
    }
  }
  // plain walk
  order(selected, { kind: "walk", x: mouse.wx, y: mouse.wy });
});

function tryPlace(type, wx, wy) {
  const cost = COSTS[type];
  if (!canAfford(cost)) {
    toast(`Not enough materials: needs ${cost.logs} logs${cost.doors ? ` + ${cost.doors} door` : ""}.`);
    return;
  }
  if (!legalToBuild(type, wx, wy)) {
    toast("Cannot build there — too close to another building, its entrance, or a tree.");
    return;
  }
  pay(cost);
  if (type === "sapling") {
    const [cx, cy] = chunkOf(wx, wy);
    getChunk(cx, cy).trees.push({ x: wx, y: wy, alive: true, progress: -1, growth: 0 });
    toast("Spruce sapling planted. It will take a while to grow.");
  } else {
    buildings.push({ type, x: wx, y: wy, progress: -1, occupants: [], farms: 0 });
    toast(type === "cabin" ? "Log cabin built." :
          type === "recruit" ? "Civilian Recruitment Center built. Wanderers may come." :
          "Market Center built. Civilians can sell bread and meat here.");
    // homeless civilians move into a new cabin
    if (type === "cabin")
      for (const c of civs) if (!c.home && houseCiv(c))
        toast(`${c.name} moves into the new cabin.`);
  }
  buildMode = null;
  syncUI();
}

// --- orders / tasks ---
function order(c, task) {
  if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
  c.task = task;
  c.tx = task.x; c.ty = task.y;
  c.state = "walking";
  c.workT = 0;
}

function arrive(c) {
  const t = c.task;
  if (!t || t.kind === "walk") { c.state = "idle"; c.task = null; return; }
  if (t.kind === "chop") {
    if (!t.target.alive) { c.state = "idle"; c.task = null; return; }
    c.state = "chopping"; c.workT = 0; c.facing = t.target.x < c.x ? -1 : 1;
  } else if (t.kind === "craft") {
    c.state = "crafting"; c.workT = 0;
  } else if (t.kind === "repair") {
    if (!canAfford(REPAIR_COST)) { toast("Materials gone — repair cancelled."); c.state = "idle"; c.task = null; return; }
    pay(REPAIR_COST);
    c.state = "repairing"; c.workT = 0;
  } else if (t.kind === "buildFarm") {
    c.state = "buildingFarm"; c.workT = 0;
  } else if (t.kind === "harvest") {
    c.state = "harvesting"; c.workT = 0;
  } else if (t.kind === "sell") {
    c.state = "selling"; c.workT = 0;
  } else if (t.kind === "hunt") {
    c.state = "hunting"; c.workT = 0;
  }
}

// --- civilian autonomy ---
function autonomy(c, dt) {
  c.autoT -= dt;
  if (c.autoT > 0 || c.state !== "idle") return;
  c.autoT = 4 + Math.random() * 5;

  // eat when hungry
  if (c.hunger < 60) {
    if (c.inv.bread > 0) { c.inv.bread--; c.hunger = Math.min(100, c.hunger + 35); return; }
    if (c.inv.meat > 0) { c.inv.meat--; c.hunger = Math.min(100, c.hunger + 35); return; }
    if (c.inv.wheat > 0) { c.inv.wheat--; c.hunger = Math.min(100, c.hunger + 15); return; }
  }

  if (!c.home) return;

  // build a farm beside the cabin, of their own accord — if the law allows it there
  const home = c.home;
  const wantsFarm = home.farms === 0 || (c.profession === "farmer" && home.farms < 2);
  if (wantsFarm && c.state === "idle") {
    // search a ring of spots around the cabin for anywhere legal
    for (const r of [90, 120, 150]) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const fx = home.x + Math.cos(a) * r, fy = home.y + Math.sin(a) * r * 0.8;
        if (legalToBuild("farm", fx, fy)) {
          order(c, { kind: "buildFarm", x: fx, y: fy + 8, fx, fy });
          return;
        }
      }
    }
    return; // nowhere legal to build — they give up for now
  }

  // farmers harvest ready farms
  if (c.profession === "farmer") {
    const f = farms.find(f => f.cabin === home && f.ready);
    if (f) { order(c, { kind: "harvest", target: f, x: f.x, y: f.y + 10 }); return; }
  }

  // hunters go hunting when food is short
  if (c.profession === "hunter" && c.inv.meat < 2) {
    const a = Math.random() * Math.PI * 2;
    order(c, { kind: "hunt", x: c.x + Math.cos(a) * 350, y: c.y + Math.sin(a) * 350 });
    return;
  }

  // sell surplus at the market
  const market = buildings.find(b => b.type === "market");
  const surplus = (c.inv.bread + c.inv.meat) - 1;
  if (market && surplus > 0) {
    order(c, { kind: "sell", target: market, x: market.x, y: market.y + 16 });
  }
}

// --- visitors (wandering hunters) ---
function spawnVisitor() {
  const center = buildings.find(b => b.type === "recruit");
  if (!center) return;
  const a = Math.random() * Math.PI * 2;
  const v = {
    id: ++visitorSeq,
    name: HUNTER_NAMES[Math.floor(Math.random() * HUNTER_NAMES.length)],
    face: Math.random() < 0.5 ? "hunter_face_a" : "hunter_face_b",
    x: center.x + Math.cos(a) * 700,
    y: center.y + Math.sin(a) * 700,
    tx: center.x + 60, ty: center.y + 20,
    state: "walking", anim: 0, facing: 1,
    waitT: 75, meter: null, leaving: false,
  };
  visitors.push(v);
  toast(`A hunter has been spotted approaching the recruitment center. Click him to talk.`);
}

function updateVisitor(v, dt) {
  if (v.state === "walking") {
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 5) {
      if (v.leaving) { visitors.splice(visitors.indexOf(v), 1); return; }
      v.state = "waiting";
    } else {
      v.x += (dx / d) * WALK_SPEED * 0.8 * dt;
      v.y += (dy / d) * WALK_SPEED * 0.8 * dt;
      v.facing = dx < 0 ? -1 : 1;
      v.anim += dt * 8;
    }
  } else if (v.state === "waiting") {
    v.anim = 1;
    v.waitT -= dt;
    if (v.waitT <= 0) sendAway(v, "The hunter grew tired of waiting and slipped back into the woods.");
  }
}

function sendAway(v, text) {
  v.leaving = true;
  v.state = "walking";
  v.tx = v.x + (Math.random() < 0.5 ? -900 : 900);
  v.ty = v.y + 200;
  if (text) toast(text);
}

// --- dialogue ---
const dlg = { open: false, visitor: null };
const DLG_OPTIONS = [
  { text: "\"We fled Hamburg with nothing. Help us build something honest.\"", d: +14 },
  { text: "\"There is a warm cabin and a certificate with your name on it.\"", d: +12 },
  { text: "Offer him fresh bread from the town storage. (1 bread)", d: +18, needs: () => res.bread >= 1, use: () => res.bread-- },
  { text: "Offer him a cut of meat from the town storage. (1 meat)", d: +16, needs: () => res.meat >= 1, use: () => res.meat-- },
  { text: "\"Our taxes are low. A man keeps what he earns here.\"", d: 0, dyn: () => (taxRate <= 2 ? +15 : -12) },
  { text: "\"The forest here is rich with game. A hunter would eat well.\"", d: +10 },
  { text: "\"Join us or starve alone out there. Your choice.\"", d: -20 },
  { text: "\"We could use another back to break for the colony.\"", d: -8 },
  { text: "Say nothing and slide a Deutsche Mark under the slot. (5 DM)", d: +9, needs: () => res.dm >= 5, use: () => res.dm -= 5 },
];

function openDialogue(v) {
  dlg.open = true; dlg.visitor = v;
  paused = true;
  if (v.meter === null) v.meter = Math.max(15, 55 - taxRate * 2.5);
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
  const pool = DLG_OPTIONS.filter(o => !o.needs || o.needs());
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  for (const o of picks) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = o.text;
    b.addEventListener("click", () => {
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

function closeDialogue() {
  dlg.open = false; dlg.visitor = null; paused = false;
  $("dialogue").style.display = "none";
}

function joinColony(v) {
  visitors.splice(visitors.indexOf(v), 1);
  closeDialogue();
  const c = mkCiv(v.name, "hunter", v.x, v.y);
  c.profession = "hunter";
  civs.push(c);
  const housed = houseCiv(c);
  toast(`${v.name} signs on — a civilian certificate slides out through the slot. ` +
        (housed ? "He moves into a cabin and will pay taxes." : "Build him a cabin: no taxes until he has a roof."));
  syncUI();
}

function rejectColony(v) {
  closeDialogue();
  sendAway(v, `${v.name} shakes his head and returns to his hunting grounds.`);
}

// --- UI wiring ---
$("buildToggle").addEventListener("click", () => $("buildDrop").classList.toggle("open"));
$("craftToggle").addEventListener("click", () => $("craftDrop").classList.toggle("open"));
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
      if (res.logs < DOOR_LOG_COST) return toast(`A door takes ${DOOR_LOG_COST} logs in storage. Stored: ${res.logs}.`);
      res.logs -= DOOR_LOG_COST;
      order(selected, { kind: "craft", x: selected.x, y: selected.y });
      toast(`${selected.name} starts hewing a door.`);
    }
  }));
document.addEventListener("click", e => {
  for (const id of ["buildDrop", "craftDrop"])
    if (!$(id).contains(e.target)) $(id).classList.remove("open");
});

$("govToggle").addEventListener("click", () => {
  const p = $("govPanel");
  p.style.display = p.style.display === "block" ? "none" : "block";
});
$("taxSlider").addEventListener("input", e => {
  taxRate = +e.target.value;
  $("taxVal").textContent = taxRate;
  syncUI();
});
$("recruitPolice").addEventListener("click", () => {
  if (res.dm < POLICE_COST) return toast(`Recruiting an officer costs ${POLICE_COST} DM. Treasury: ${res.dm} DM.`);
  const cand = civs.find(c => c.home && c.profession !== "police");
  if (!cand) return toast("No housed civilian is available to join the police force.");
  res.dm -= POLICE_COST;
  cand.profession = "police";
  policeCount++;
  toast(`${cand.name} joins the police force of the colony.`);
  syncUI();
});
$("cpDeposit").addEventListener("click", () => {
  if (!selected) return;
  const inv = selected.inv;
  const moved = inv.logs + inv.wheat + inv.bread + inv.meat;
  res.logs += inv.logs; res.wheat += inv.wheat; res.bread += inv.bread; res.meat += inv.meat;
  inv.logs = inv.wheat = inv.bread = inv.meat = 0;
  toast(moved ? `${selected.name} hands ${moved} item(s) over to the town storage.` :
                `${selected.name} has nothing to hand over.`);
  syncUI();
});

function syncUI() {
  $("buildToggle").classList.toggle("active", !!buildMode);
  $("rLogs").textContent = res.logs;
  $("rDoors").textContent = res.doors;
  $("rWheat").textContent = res.wheat;
  $("rBread").textContent = res.bread;
  $("rMeat").textContent = res.meat;
  $("rDM").textContent = res.dm;
  $("rPop").textContent = civs.length;
  $("rPolice").textContent = policeCount;
  $("rTax").textContent = taxRate;
  $("govDM").textContent = res.dm + " DM";
  $("govPolice").textContent = policeCount + " officers";

  const p = $("civPanel");
  if (!selected) { p.style.display = "none"; return; }
  p.style.display = "block";
  $("cpName").textContent = selected.name.toUpperCase();
  $("cpProf").textContent = selected.profession || "none";
  $("cpHome").textContent = selected.home ? "housed" : "homeless";
  $("cpHungerN").textContent = Math.round(selected.hunger);
  $("cpHunger").style.width = Math.max(0, selected.hunger) + "%";
  $("cpLogs").textContent = selected.inv.logs;
  $("cpWheat").textContent = selected.inv.wheat;
  $("cpBread").textContent = selected.inv.bread;
  $("cpMeat").textContent = selected.inv.meat;
  $("cpDM").textContent = selected.inv.dm;
}

// --- simulation ---
function update(dt) {
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) msgEl.textContent = "";

  // camera
  const up = keys["w"] || keys["arrowup"], dn = keys["s"] || keys["arrowdown"];
  const lf = keys["a"] || keys["arrowleft"], rt = keys["d"] || keys["arrowright"];
  if (up) cam.y -= CAM_SPEED * dt;
  if (dn) cam.y += CAM_SPEED * dt;
  if (lf) cam.x -= CAM_SPEED * dt;
  if (rt) cam.x += CAM_SPEED * dt;
  // keep world-space cursor honest while the camera moves under a still mouse
  mouse.wx = mouse.x + cam.x;
  mouse.wy = mouse.y + cam.y;

  if (paused) return;

  // saplings & farms grow
  for (const ch of visibleChunks(CHUNK * 2))
    for (const t of ch.trees)
      if (t.alive && t.growth < 1) t.growth = Math.min(1, t.growth + dt / SAPLING_GROW_TIME);
  for (const f of farms)
    if (!f.ready && (f.growT += dt) >= FARM_YIELD_TIME) f.ready = true;

  // hunters wander in
  if (buildings.some(b => b.type === "recruit")) {
    hunterTimer -= dt;
    if (hunterTimer <= 0) {
      hunterTimer = 50 + Math.random() * 40;
      if (visitors.length < 2) spawnVisitor();
    }
  }
  for (const v of [...visitors]) updateVisitor(v, dt);

  for (const c of civs) {
    c.hunger = Math.max(0, c.hunger - HUNGER_DECAY * dt);

    // taxes from housed civilians
    if (c.home) {
      c.taxT -= dt;
      if (c.taxT <= 0) {
        c.taxT = TAX_INTERVAL;
        const paid = Math.min(c.inv.dm, taxRate);
        c.inv.dm -= paid;
        res.dm += paid;
        if (paid > 0 && Math.random() < 0.3) toast(`${c.name} pays ${paid} DM in taxes.`);
      }
    }

    if (c.state === "walking") {
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      if (d < 5) { c.x = c.tx; c.y = c.ty; arrive(c); }
      else {
        collideMove(c, c.x + (dx / d) * WALK_SPEED * dt, c.y + (dy / d) * WALK_SPEED * dt);
        c.facing = dx < 0 ? -1 : 1;
        c.anim += dt * 8;
      }
    } else if (c.state === "chopping") {
      const t = c.task.target;
      if (!t.alive) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; t.progress = c.workT / CHOP_TIME; c.anim += dt * 10;
      if (c.workT >= CHOP_TIME) {
        t.alive = false; t.progress = -1;
        c.inv.logs += LOGS_PER_TREE;
        toast(`${c.name} felled a spruce: +${LOGS_PER_TREE} logs in their pack. Deposit them at the town storage.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "crafting") {
      c.workT += dt; c.anim += dt * 6;
      if (c.workT >= CRAFT_TIME) {
        res.doors++;
        toast(`${c.name} finished a rough plank door. Doors: ${res.doors}.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "repairing") {
      const b = c.task.target;
      c.workT += dt; b.progress = c.workT / REPAIR_TIME; c.anim += dt * 10;
      if (c.workT >= REPAIR_TIME) {
        b.type = "cabin"; b.progress = -1;
        toast(`The family cabin stands again. ${c.name} rebuilt it.`);
        c.state = "idle"; c.task = null;
        for (const cc of civs) if (!cc.home && houseCiv(cc)) {}
      }
    } else if (c.state === "buildingFarm") {
      c.workT += dt; c.anim += dt * 8;
      if (c.workT >= BUILD_FARM_TIME) {
        const t = c.task;
        if (legalToBuild("farm", t.fx, t.fy)) {
          farms.push({ x: t.fx, y: t.fy, cabin: c.home, ready: false, growT: 0 });
          if (c.home) c.home.farms++;
          toast(`${c.name} finished a little wheat farm beside the cabin.`);
        }
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "harvesting") {
      const f = c.task.target;
      c.workT += dt; c.anim += dt * 8;
      if (c.workT >= 3) {
        f.ready = false; f.growT = 0;
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
          c.inv.dm += SELL_PRICE; earned += SELL_PRICE;
        }
        if (earned) toast(`${c.name} sells at the market for ${earned} DM.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "hunting") {
      c.workT += dt; c.anim = 1;
      if (c.workT >= 6) {
        c.inv.meat += 2;
        toast(`${c.name} returns from the hunt with meat.`);
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
  const sx = wx - cam.x, sy = wyFeet - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, -size / 2, -size, size, size);
  ctx.restore();
}

function bar(wx, wyTop, frac, color) {
  const sx = wx - cam.x, sy = wyTop - cam.y;
  const w = 44, h = 6;
  ctx.fillStyle = "#0a0f0c"; ctx.fillRect(sx - w / 2 - 1, sy - 1, w + 2, h + 2);
  ctx.fillStyle = "#1c2a21"; ctx.fillRect(sx - w / 2, sy, w, h);
  ctx.fillStyle = color; ctx.fillRect(sx - w / 2, sy, w * Math.min(1, frac), h);
}

function render() {
  // tiled grass
  const x0 = Math.floor(cam.x / TILE) * TILE, y0 = Math.floor(cam.y / TILE) * TILE;
  for (let y = y0; y < cam.y + canvas.height; y += TILE)
    for (let x = x0; x < cam.x + canvas.width; x += TILE)
      ctx.drawImage(img.grass, x - cam.x, y - cam.y, TILE, TILE);

  const view = { x: cam.x - 100, y: cam.y - 140, w: canvas.width + 200, h: canvas.height + 280 };
  const inView = (x, y) => x > view.x && x < view.x + view.w && y > view.y && y < view.y + view.h;
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
  }
  for (const f of farms) if (inView(f.x, f.y)) drawables.push({ y: f.y, draw: () => {
    drawSprite(img.farm, f.x, f.y, FARM_SIZE, false);
    if (f.ready) {
      ctx.fillStyle = "#d8c26a";
      ctx.font = "12px monospace"; ctx.textAlign = "center";
      ctx.fillText("ripe", f.x - cam.x, f.y - cam.y - FARM_SIZE - 4);
    }
  }});
  for (const b of buildings) if (inView(b.x, b.y)) drawables.push({ y: b.y, draw: () => {
    drawSprite(img[b.type], b.x, b.y, BLDG_SIZE, false);
    if (b.progress >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.progress, "#7da083");
  }});
  for (const v of visitors) if (inView(v.x, v.y)) drawables.push({ y: v.y, draw: () => {
    drawSprite(img["hunter" + (Math.floor(v.anim) % 4)], v.x, v.y, CHAR_SIZE, v.facing < 0);
    ctx.fillStyle = "#c98a6a";
    ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText(v.name + " (visitor)", v.x - cam.x, v.y - cam.y - CHAR_SIZE - 4);
  }});
  for (const c of civs) if (inView(c.x, c.y)) drawables.push({ y: c.y, draw: () => {
    if (c === selected) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(c.x - cam.x, c.y - cam.y - 2, 18, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawSprite(img[c.who + (Math.floor(c.anim) % 4)], c.x, c.y, CHAR_SIZE, c.facing < 0);
    ctx.fillStyle = c === selected ? "#c9a86a" : (c.profession === "police" ? "#8aa0c9" : "#7da083");
    ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tag = c.profession === "police" ? " [police]" : "";
    ctx.fillText(c.name + tag, c.x - cam.x, c.y - cam.y - CHAR_SIZE - 4);
    if (c.state === "crafting" || c.state === "buildingFarm" || c.state === "hunting")
      bar(c.x, c.y - CHAR_SIZE - 16, c.workT / (c.state === "crafting" ? CRAFT_TIME : c.state === "buildingFarm" ? BUILD_FARM_TIME : 6), "#c9a86a");
  }});

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // build ghost
  if (buildMode) {
    const ok = legalToBuild(buildMode, mouse.wx, mouse.wy) && canAfford(COSTS[buildMode]);
    ctx.globalAlpha = 0.55;
    if (buildMode === "sapling") drawSprite(img.tree, mouse.wx, mouse.wy, TREE_SIZE * 0.4, false);
    else drawSprite(img[buildMode === "recruit" ? "recruit" : buildMode], mouse.wx, mouse.wy, BLDG_SIZE, false);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#7da083" : "#a05252";
    ctx.lineWidth = 2;
    const s = buildMode === "sapling" ? 24 : BLDG_SIZE;
    ctx.strokeRect(mouse.wx - cam.x - s / 2, mouse.wy - cam.y - s, s, s);
  }
}

// --- loop ---
let last = 0, uiT = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  render();
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
