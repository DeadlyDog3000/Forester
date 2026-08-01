"use strict";

// ===== Forester alpha 0.4 — raiders, soldiers, and the long ledger =====

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; ctx.imageSmoothingEnabled = false; }
addEventListener("resize", resize); resize();

const $ = id => document.getElementById(id);
// These panels are flex containers, and three places asked whether their display
// was "block" — which it never is. Escape did not close the chronicle or the
// roll, and the chronicle did not redraw when something happened while it was
// open. Ask whether it is hidden, not which way it is laid out.
const isOpen = id => { const el = $(id); return !!el && el.style.display !== "none" && el.style.display !== ""; };
// Names are typed by the player, and a few panels build their rows as HTML.
// Left raw, a town called "Jack & Jill <Home>" lost half its name the moment it
// was shown — the browser read <Home> as a tag and swallowed it — and a name
// made of markup was rendered as markup. Anything player-written goes through
// here before it is written into innerHTML.
const esc = s => String(s).replace(/[&<>"']/g,
  ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const msgEl = $("msg");

// --- tuning ---
const CHAR_SIZE = 64, BLDG_SIZE = 96, FARM_SIZE = 64, TREE_SIZE = 64, NODE_SIZE = 48, TILE = 128;
const BASE_WALK = 110, CAM_SPEED = 420;
const CHUNK = 512;
const BASE_CHOP = 3, CRAFT_TIME = 4, REPAIR_TIME = 6, BASE_FARM_BUILD = 5;
const HARVEST_TIME = 3, PATCH_TIME = 2, QUARRY_TIME = 4, SMITH_TIME = 8;
const BASE_LOGS_PER_TREE = 5;
// Hunger is an appetite for a day, not for a number of seconds. When the day was
// stretched from five real minutes to twenty-four, this rate was not — so a man
// who lay down at seven had eaten his last meal by ten and was dead by eleven,
// every night, because nobody eats in their sleep. It is stated per day now and
// divided into the day, so a night costs exactly the share of a belly it always
// did however long the light takes to come round.
const HOUR = 60;                              // one game hour, in real seconds
const DAY = 24 * HOUR;                        // 1440s — a full turn of the light
const HUNGER_PER_DAY = 105;                   // what 0.35 a second came to over the old 300s day
const HUNGER_DECAY = HUNGER_PER_DAY / DAY;
const STARVE_DPS = 2;
const SAPLING_GROW = 60, BASE_FARM_RIPEN = 25;
const TAX_PERIOD = 240, POLICE_COST = 40, SOLDIER_COST = 30, MUSKET_COST = 25, CAV_COST = 50, TOOL_PRICE_GOV = 10, TOOL_PRICE_SELF = 8;
// the musket's bargain: it outranges and outhits a bow, and takes an age to load
const MUSKET_RANGE = 250, MUSKET_FIRE_T = 0.55, BALL_SPEED = 900;
// ===== the volley =====
// Line infantry do not fire as they please. A man who is loaded and has his mark
// shoulders his piece and waits on the men beside him; the line lets go together,
// in one rolling crack, rather than in a scatter of pops down the field. He will
// not wait forever for a straggler, and a man on his own fires at will.
const VOLLEY_SPREAD = 190;     // how far along the line he looks for his neighbours
const VOLLEY_PATIENCE = 3.2;   // seconds shouldered before he gives up on the line
const VOLLEY_SOUNDS = 3;       // muskets voiced per frame — past this it is one crack
let volleySounds = 0;          // reset each frame
// the watch on the tower: further than a man on the ground, slower to load
const TOWER_RANGE = 340, TOWER_RELOAD = 3.2;
const MUSKET_KEEP_AWAY = 110;   // closer than this, an unbayoneted musketeer gives ground
// where the muzzle sits in world units: sprite row 4, column 28 of a 32px frame drawn at CHAR_SIZE
const MUZZLE_X = 24, MUZZLE_Y = 56;
const reloadTime = () => has("flintlock") ? 4.5 : 7.5;   // powder, ball, ramrod — it takes what it takes
// The loading drill, pinned to the four poses the sprite already cycles through
// (mload0..3 change at a quarter, a half and three quarters of the way through),
// so the man is heard doing the thing he is visibly doing.
const RELOAD_DRILL = [
  [0.01, () => SFX.powder()],   // cartridge torn, charge down the barrel
  [0.25, () => SFX.seat()],     // ball and wad thumbed in
  [0.50, () => SFX.ramrod()],   // the rod drawn and driven home
  [1.00, () => SFX.cock()],     // shouldered, lock drawn back — ready
];
const TORCH_TIME = 6, FIRE_TIME = 10, ATK_INTERVAL = 0.9, FIST_DMG = 8, DODGE_CHANCE = 0.15;
// ===== the sick and the hurt =====
// Food fills a belly; it does not close a wound. Bread used to mend a man where
// he stood, which turned every larder into an infirmary and left nothing for a
// hospital to be. The hurt and the fever-struck are carried to a bed now and
// physicked there — the food a colony spends on healing is spent at the bedside.
const HOSP_BEDS = 4;         // beds to a ward
const HOSP_HEAL = 5;         // health mended each second abed
const HOSP_CURE = 4;         // the fever burns out this much faster under care
const HOSP_MEAL = 8;         // seconds between the meals a patient is fed
const REST_HEAL = 0.35;      // health knit back each second asleep in your own bed
const STRETCHER = 0.78;      // a man on a stretcher is a man off your pace
const DOCTOR_COST = 30;
const DOCTOR_SIGHT = 900;    // how far a doctor will walk to a case
const DOCTOR_HASTE = 1.35;   // a doctor going to a case does not stroll — and the sick keep walking
const HURT_ENOUGH = 0.55;    // below this share of health, a doctor comes for you
const RAID_MIN = 240, RAID_MAX = 420, MAX_RAIDERS = 4, MAX_CAMPS = 6;
// The drum never beats faster than this, however grand the colony grows: five
// minutes of quiet are owed between raids. The reckoning is paid in the size of
// the wave that comes, not in the space between them.
const RAID_FLOOR = 300;

const REPAIR_COST = { logs: 20, doors: 1, dm: 5 };
const STATIC_COSTS = {
  recruit: { logs: 30, dm: 10 }, market: { logs: 25, dm: 8 }, sapling: { logs: 1, dm: 1 },
  watchtower: { logs: 15, stone: 5, dm: 6 }, bakery: { logs: 20, stone: 3, dm: 8 }, well: { logs: 10, stone: 8, dm: 4 },
  forge: { logs: 20, stone: 6, iron: 2, dm: 12 },
  wall: { stone: 2, dm: 1 }, gate: { logs: 6, stone: 2, dm: 1 },
  jail: { logs: 18, stone: 6, dm: 10 },
  hospital: { logs: 25, stone: 8, dm: 14 },
  lamp: { logs: 2, dm: 1 },
  townhall: { logs: 40, stone: 10, dm: 20 },
  stonewall: { stone: 4, dm: 1 }, stonegate: { stone: 7, logs: 2, dm: 2 },
  moat: { stone: 4, logs: 2, dm: 3 }, ditch: { logs: 2, dm: 1 },
};
const BLDG_NAMES = { cabin: "Log Cabin", recruit: "Recruitment Center", market: "Market Center",
  burned: "Burned Ruin", watchtower: "Watchtower", bakery: "Bakery", well: "Well", forge: "Forge", wall: "Town Wall", gate: "Town Gate", townhall: "Town Hall", jail: "Jail", hospital: "Hospital",
  stonewall: "Stone Wall", stonegate: "Stone Gate", moat: "Moat", ditch: "Ditch", lamp: "Lamppost" };
const WALLLIKE = new Set(["wall", "gate", "stonewall", "stonegate", "moat", "ditch"]);
// A lamppost is furniture, not a building: it takes no ground, claims no
// territory, has no inside, and is set down as close to its neighbours as you
// like. It costs almost nothing and it does exactly one thing after dark.
const isProp = t => t === "lamp";
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
T("matchlock", "Matchlock Muskets", "military", ["defending"], 5, "Unlocks Line Infantry — deadly (40 dmg far, 88 point-blank), but desperately slow to load");
T("bayonets", "Bayonets", "military", ["matchlock"], 6, "A blade at every muzzle: line infantry fight hand-to-hand as well as at range");
T("flintlock", "Flintlock Muskets", "military", ["bayonets"], 7, "No more smouldering cord: muskets load in 4.5s instead of 7.5, and hit harder still");
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
const isForce = c => c.profession === "police" || c.profession === "soldier" || c.profession === "musketeer" || c.profession === "cavalry";
// The rank is called Line Infantry. The save files still say "musketeer", and
// they will keep saying it — a colony loaded from last week must still muster.
const PROF_LABEL = { musketeer: "line infantry" };
const profLabel = p => (p ? (PROF_LABEL[p] || p) : "no trade");
const profTitle = p => profLabel(p).replace(/\b\w/g, ch => ch.toUpperCase());

// ===== going indoors =====
// Not a fortification and not a home: a roof, and the right to stand under it.
// A wall has no inside, a ruin has no roof left, and a staked-out plot is not
// a building yet — everything else can simply be walked into.
// The three ways of being under a roof: asleep in your own bed, warming yourself
// at your own hearth, and simply having gone indoors because you were told to.
// None of them can be seen, shot at, or snowed on.
// A man in a hospital bed is under a roof like any other: out of the weather,
// out of the fight, and not to be found standing in the street.
const INDOORS = new Set(["sleeping", "warming", "inside", "jailed", "abed"]);
const SHELTER_CAP = 4;
const canShelter = b => !b.site && b.type !== "burned" && !WALLLIKE.has(b.type) &&
                        b.type !== "farm" && !isProp(b.type);
const sheltering = b => civs.filter(c => c.shelter === b);
// Turned out: back into the open, wherever the building happens to be standing.
function turnOut(c, quiet) {
  const b = c.shelter;
  if (!b) return;
  c.shelter = null;
  if (c.state === "inside") {
    c.state = "idle";
    c.x = b.x + (Math.random() * 40 - 20); c.y = b.y + 24;
  }
  if (c.task && c.task.kind === "enter") c.task = null;
  if (!quiet) toast(`${c.name} comes back outside.`);
  syncUI();
}
function emptyShelter(b, reason) {
  const inside = sheltering(b);
  for (const c of inside) turnOut(c, true);
  if (inside.length && reason) toast(`${inside.length} driven out of the ${BLDG_NAMES[b.type] || b.type} — ${reason}.`);
}

// Is the line ready, or has this man waited long enough to stop caring?
function volleyReady(line, c) {
  if ((c.volleyT || 0) >= VOLLEY_PATIENCE) return true;
  for (const o of line) {
    if (o === c) continue;
    if (Math.hypot(o.x - c.x, o.y - c.y) > VOLLEY_SPREAD) continue;
    if (!o.loaded || o.fireT > 0) return false;   // a neighbour is still working the ramrod
  }
  return true;                                    // alone, or every piece is up
}
// The whole line's permission is settled before any man in it moves. Judge it
// inside the loop instead and the first man updated fires alone, then everyone
// else spends their patience waiting on the ramrod he is already working — which
// is a straggling shot followed by a volley of seven, over and over.
// A civilian's mark lives in c.task.target — `c.foe` is the raiders' field and no
// civ ever sets one. Matching on it here meant the line was always empty, nobody
// was ever given leave to fire, and the muskets fell silent altogether.
const inTheLine = c => c.profession === "musketeer" && !c.rebel &&
                       c.state === "fighting" && c.task && c.task.target;
function planVolleys() {
  const line = [];
  for (const c of civs) if (inTheLine(c)) line.push(c);
  for (const c of civs) c.mayFire = inTheLine(c) ? volleyReady(line, c) : true;
}

// Black powder makes a great deal of smoke and it is in no hurry to leave. A
// shot throws a bank of it off the muzzle that spreads, slows, and hangs.
function musketSmoke(mx, my, facing) {
  const n = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const along = i / n;                          // further from the muzzle, slower and fatter
    const life = 3.4 + Math.random() * 2.2;
    smokes.push({
      x: mx + facing * (3 + along * 30) + (Math.random() * 9 - 4.5),
      y: my + (Math.random() * 11 - 5.5),
      r: 6 + Math.random() * 6 + along * 6,
      vx: facing * (46 - along * 24) + (Math.random() * 14 - 7),
      vy: -7 - Math.random() * 9,
      grow: 5.5 + Math.random() * 4,
      dense: 0.34,
      t: life, max: life,
    });
  }
  if (smokes.length > 420) smokes.splice(0, smokes.length - 420);   // the field only holds so much
}

// ===== stone is climbed, not broken =====
// Timber can be hacked apart or set alight. Dressed stone can be neither, and a
// besieger who stands in front of it swinging is wasting his afternoon. He goes
// over it instead: slow, both hands occupied, and no use to anyone until he is
// down the far side — but the wall is still standing when he gets there.
const CLIMB_TIME = 6;
const STONE = new Set(["stonewall", "stonegate"]);
// set a climber down on the far side, on the line from the wall to what they want
function overTheWall(u, w, goal) {
  const gx = goal && goal.x !== undefined ? goal.x : w.x;
  const gy = goal && goal.y !== undefined ? goal.y : w.y + 60;
  let dx = gx - w.x, dy = gy - w.y;
  let d = Math.hypot(dx, dy);
  if (d < 1) { dx = 0; dy = 1; d = 1; }        // no goal worth the name: just drop inside
  const rect = bldgRect(w);
  const clear = Math.max(rect.w, rect.h) / 2 + 30;
  u.x = w.x + dx / d * clear;
  u.y = w.y + dy / d * clear;
  w.climbP = 0;
}

// ===== ruins =====
// What a fire leaves behind. Everything with a charred sprite drawn for it stays
// on the map as a wreck that can be rebuilt; earthworks are not burned down, so
// a moat or a ditch simply goes. A ruin remembers what it was in `was`, and a
// repair puts that back — losing a forge is a setback, not an erasure.
const RUINS = new Set(["cabin", "recruit", "market", "watchtower", "bakery", "well",
                       "forge", "townhall", "farm", "wall", "gate", "stonewall", "stonegate", "jail",
                       "hospital"]);
// A ruin keeps the footprint of what it was: burnt wall, wall-shaped rubble.
const baseType = b => (b.type === "burned" && b.was) ? b.was : b.type;
const ruinKey = b => {
  const was = b.was || "cabin";
  const k = "burned_" + was + (b.rot && IMAGES["burned_" + was + "v"] ? "v" : "");
  return IMAGES[k] ? k : "burned";
};
// A ruin is named for what it was: "Burned Forge", not a nameless heap.
function bldgName(b) {
  if (b.type === "burned" && b.was) return "Burned " + (BLDG_NAMES[b.was] || b.was);
  return BLDG_NAMES[b.type] || b.type;
}
function ruin(b, how) {
  const was = b.type;
  // A wreck cannot burn down twice. Left unguarded this was quietly destructive:
  // "burned" is not in RUINS, so a second call spliced the ruin off the map
  // altogether — and with it the player's right to rebuild what stood there.
  if (was === "burned") { b.fire = 0; b.torchP = -1; return; }
  if (!RUINS.has(was)) {
    buildings.splice(buildings.indexOf(b), 1);
    tally.burned++;
    tell("build", `The ${BLDG_NAMES[was] || was} has ${how}.`);
    return;
  }
  b.type = "burned"; b.was = was;
  b.maxHp = b.maxHp || 100; b.hp = b.maxHp;
  b.fire = 0; b.torchP = -1;
  tally.burned++;
  tell("build", `The ${BLDG_NAMES[was] || was} has ${how}. It can be repaired by order.`);
}
// deep snow slows every traveller by a fifth — the road's packed lane still helps
const snowPace = () => season() === "winter" ? 0.8 : 1;
const walkSpeed = c => BASE_WALK * snowPace() * (1 + (has("horses") ? 0.15 : 0) + (has("horsebreeding") ? 0.10 : 0) + (has("saddling") ? 0.10 : 0)) * (c && isForce(c) ? (has("warhorse") ? 1.35 : 1.15) : 1) * (c && c.profession === "cavalry" ? 1.45 : 1);
const workMul = c => (c && c.tool ? 0.65 : 1) * (has("stables") ? 0.8 : 1) * (laws.forced ? 0.75 : 1)
                     * (c && c.sick > 0 ? 1.8 : 1);   // a man abed is slow at everything

// ===== what a pair of hands has learned =====
// Technology is what the colony knows; a skill is what one man is good at. Every
// soul carries all ten from the day they arrive, at one, and climbs to a
// hundred — by doing the work, or by being trained out of the treasury.
const SKILLS = [
  { id: "woodcutting",  name: "Woodcutting",  branch: "Field",  desc: "Fells trees faster" },
  { id: "quarrying",    name: "Quarrying",    branch: "Field",  desc: "Breaks stone faster" },
  { id: "foraging",     name: "Foraging",     branch: "Field",  desc: "Gathers wild seed faster" },
  { id: "farming",      name: "Farming",      branch: "Field",  desc: "Raises and reaps crops faster" },
  { id: "hunting",      name: "Hunting",      branch: "Field",  desc: "Takes game faster" },
  { id: "building",     name: "Building",     branch: "Craft",  desc: "Raises and repairs faster" },
  { id: "smithing",     name: "Smithing",     branch: "Craft",  desc: "Works the forge faster" },
  { id: "crafting",     name: "Crafting",     branch: "Craft",  desc: "Makes doors faster" },
  { id: "physicking",   name: "Physicking",   branch: "Craft",  desc: "Mends and cures faster at the bedside" },
  { id: "fighting",     name: "Fighting",     branch: "Arms",   desc: "Strikes harder hand to hand" },
  { id: "marksmanship", name: "Marksmanship", branch: "Arms",   desc: "Shoots harder" },
];
const SKILL_BRANCHES = ["Field", "Craft", "Arms"];
const SKILL_MAX = 100;
const skillLvl = (c, id) => Math.max(1, Math.min(SKILL_MAX, (c && c.sk && c.sk[id]) || 1));
// A master works in a little under half the time, and hits half again as hard.
const workSkill = (c, id) => 1 - 0.55 * (skillLvl(c, id) - 1) / (SKILL_MAX - 1);
const armSkill  = (c, id) => 1 + 0.55 * (skillLvl(c, id) - 1) / (SKILL_MAX - 1);
// the climb steepens: cheap to make a passable hand, dear to make a master
const skillXpNeeded = lvl => Math.round(6 + lvl * 2.6);
const trainCost = lvl => 3 + Math.floor(lvl * 0.8);
function freshSkills() { const s = {}; for (const k of SKILLS) s[k.id] = 1; return s; }
// Write only what a man has actually learned. Every soul carries all ten, and
// most of them carry ten ones — writing those out cost better than a quarter of
// a typical colony's save for no information at all. The loader fills the rest
// back in from freshSkills(), so a partial record reads exactly the same.
function skSave(c) {
  if (!c.sk) return undefined;
  const o = {};
  for (const s of SKILLS) if (c.sk[s.id] > 1) o[s.id] = c.sk[s.id];
  return Object.keys(o).length ? o : undefined;
}
function sxSave(c) {
  if (!c.sx) return undefined;
  const o = {};
  for (const s of SKILLS) if (c.sx[s.id]) o[s.id] = Math.round(c.sx[s.id]);
  return Object.keys(o).length ? o : undefined;
}
// Work teaches. Called wherever a task is actually finished, never per frame.
// ===== the value of a life =====
// Everyone in this colony has a name, an age, eleven skills and opinions about
// their neighbours — and losing one cost you nothing that losing any other would
// not have cost. A master of a trade was thirty minutes of somebody's work and
// the game shrugged when they died. Three things change that: skill is now
// taught by the living rather than only ground out alone, the dead are named
// for what they knew, and the people who knew them feel it.
const MASTER_AT = 40;              // where a hand becomes worth learning from
const TEACH_RANGE = 190;           // near enough to watch and be corrected
const TEACH_BONUS = 1.6;
// The best in the colony at a thing, and whether anyone could take their place.
function bestAt(id, except) {
  let best = null, lvl = 0;
  for (const c of civs) {
    if (c === except || c.child) continue;
    const l = skillLvl(c, id);
    if (l > lvl) { lvl = l; best = c; }
  }
  return { who: best, lvl };
}
// A trade this person holds alone: they are a master of it, and the next best
// hand in the colony is not half of them.
function soleMasteries(c) {
  const out = [];
  for (const s of SKILLS) {
    const mine = skillLvl(c, s.id);
    if (mine < MASTER_AT) continue;
    const next = bestAt(s.id, c);
    if (next.lvl * 2 <= mine) out.push({ id: s.id, name: s.name, lvl: mine, next: next.lvl });
  }
  return out;
}
function gainSkill(c, id, amount) {
  if (!c || !c.sk) return;
  if (c.sk[id] >= SKILL_MAX) return;
  c.sx = c.sx || {};
  // A master at your elbow is worth more than an hour alone with the work. This
  // is the only way expertise spreads, so a master is not just a good worker —
  // they are the colony's ability to make more good workers.
  if (skillLvl(c, id) < MASTER_AT) {
    for (const o of civs) {
      if (o === c || o.child || skillLvl(o, id) < MASTER_AT) continue;
      if (Math.hypot(o.x - c.x, o.y - c.y) > TEACH_RANGE) continue;
      amount *= TEACH_BONUS;
      break;
    }
  }
  c.sx[id] = (c.sx[id] || 0) + amount;
  while (c.sk[id] < SKILL_MAX && c.sx[id] >= skillXpNeeded(c.sk[id])) {
    c.sx[id] -= skillXpNeeded(c.sk[id]);
    c.sk[id]++;
    if (c.sk[id] % 10 === 0 || c.sk[id] === SKILL_MAX) {
      const nm = (SKILLS.find(s => s.id === id) || {}).name || id;
      toast(`${c.name} reaches ${nm} ${c.sk[id]}${c.sk[id] === SKILL_MAX ? " — a master of it" : ""}.`);
    }
  }
  if (c.sk[id] >= SKILL_MAX) c.sx[id] = 0;
  if (selected === c) syncUI();
}
const chopTime = c => BASE_CHOP * (has("axing") ? 0.65 : has("treecutting") ? 0.8 : 1) * workMul(c) * workSkill(c, "woodcutting");
// One name per job, so the progress bar and the moment the work finishes can
// never drift apart — they were the same expression written twice before.
const quarryTime    = c => QUARRY_TIME * workMul(c) * workSkill(c, "quarrying");
const forageTime    = c => PATCH_TIME * (has("foraging") ? 0.5 : 1) * workMul(c) * workSkill(c, "foraging");
const craftTime     = c => CRAFT_TIME * workMul(c) * workSkill(c, "crafting");
const smithTime     = c => SMITH_TIME * workMul(c) * workSkill(c, "smithing");
const repairTime    = c => REPAIR_TIME * workMul(c) * workSkill(c, "building");
const farmBuildTime = c => BASE_FARM_BUILD * workMul(c) * workSkill(c, "farming");
const harvestTime   = c => HARVEST_TIME * workMul(c) * workSkill(c, "farming");
const raiseTime     = (c, t) => (BUILD_TIMES[t] || 8) * workMul(c) * workSkill(c, "building");
const huntTime      = c => 6 * workSkill(c, "hunting");
const logsPerTree = () => BASE_LOGS_PER_TREE + (has("sawing") ? 2 : 0) + (has("sawmills") ? 3 : 0);
const doorCost = () => has("sawmills") ? 3 : 5;
const farmSeedCost = () => has("seeding") ? 4 : 6;
const farmRipen = () => BASE_FARM_RIPEN * (has("agriculture") ? 0.7 : 1);
const sellPrice = () => 3 + (has("trading") ? 1 : 0) + (has("marketing") ? 1 : 0);
const taxBonus = () => (has("currencies") ? 1 : 0) + (has("occupation") ? 1 : 0) + (has("slavemarket") ? 2 : 0);
const forceDmg = c => (c.profession === "soldier" ? 15 : c.profession === "cavalry" ? 20 : 12) + (has("wardogs") ? 5 : 0) + (has("hussars") ? 15 : 0) + (has("lances") ? 10 : 0) + (has("raiding") ? 10 : 0) + (c.armed ? weaponDmg() : 0);
// A musket ball is lethal, and the closer it is fired the worse the wound:
// 40 at the far edge of its reach, better than double that at point-blank.
const musketDmg = (d) => {
  const far = has("flintlock") ? 52 : 40, near = has("flintlock") ? 110 : 88;
  const t = Math.max(0, Math.min(1, (d === undefined ? MUSKET_RANGE : d) / MUSKET_RANGE));
  return Math.round(near + (far - near) * t) + (has("hussars") ? 5 : 0);
};
// with a bayonet fixed, a line infantryman is a spear in the line as well as a gun
const bayonetDmg = () => 16 + (has("blades") ? 5 : 0) + (has("flintlock") ? 4 : 0);
const torchTime = () => TORCH_TIME / ((has("defending") ? 0.7 : 1) * (has("pettraining") ? 0.75 : 1));
const weaponDmg = () => (has("battleaxes") ? 28 : has("swords") ? 20 : has("spears") ? 14 : 8) + (has("blades") ? 5 : 0);
const weaponIron = () => Math.max(1, 2 - (has("hilts") ? 1 : 0));
const canForgeWeapons = () => has("spears") || has("swords") || has("battleaxes");
const treasuryFloor = () => has("lordship") ? -50 : 0;
// ===== what a colony costs to keep =====
// Wages for the men under arms, upkeep for the works that need tending. Cabins,
// walls, lamps, farms and saplings are free — you built them, they stand. What
// costs is what employs somebody or must be maintained. Both bills fall on tax
// day, out of the same purse the taxes go into, so the ledger reads as one
// account: what came in, what went out, what is left.
const WAGE = 2;                 // a soldier, constable, musketeer or rider, per tax day
const CIVIC_UPKEEP = 1;         // per tended work, per tax day
const CIVIC = new Set(["hospital", "jail", "watchtower", "market", "townhall", "forge", "bakery", "recruit", "well"]);
const wageBill = () => civs.filter(isForce).length * WAGE;
const upkeepBill = () => buildings.filter(b => !b.site && !b.fire && CIVIC.has(b.type)).length * CIVIC_UPKEEP;
const civicWorks = () => buildings.filter(b => !b.site && !b.fire && CIVIC.has(b.type)).length;
let arrears = 0;                // what last tax day could not pay, and who resents it
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
  stonegatev: "assets/sprites/buildings/stonegatev_32.png",
  gatev: "assets/sprites/buildings/gatev_32.png",
  gatev_w: "assets/sprites/buildings/gatev_w_32.png",
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
  jail: "assets/sprites/buildings/jail_32.png", jail_w: "assets/sprites/buildings/jail_w_32.png",
  hospital: "assets/sprites/buildings/hospital_32.png", hospital_w: "assets/sprites/buildings/hospital_w_32.png",
  lamp: "assets/sprites/buildings/lamp_32.png", lamp_w: "assets/sprites/buildings/lamp_w_32.png",
};
// every structure a torch can reach, drawn once more as a cold wreck
for (const k of ["recruit", "market", "watchtower", "bakery", "well", "forge", "townhall", "jail", "hospital",
                 "farm", "wall", "wallv", "gate", "gatev", "stonewall", "stonewallv",
                 "stonegate", "stonegatev"])
  IMAGES["burned_" + k] = `assets/sprites/buildings/burned_${k}_32.png`;
IMAGES.burned_cabin = "assets/sprites/buildings/burned_house_32.png";   // the ruin that was always here
// road pieces, indexed by which neighbours they join: 1 north, 2 east, 4 south, 8 west
for (let i = 0; i < 16; i++) {
  IMAGES[`road${i}`] = `assets/sprites/env/road_${i}.png`;
  IMAGES[`road_w${i}`] = `assets/sprites/env/road_w_${i}.png`;
}
for (const who of ["sister", "brother", "hunter"]) for (let i = 0; i < 4; i++) IMAGES[`${who}${i}`] = `assets/sprites/characters/${who}_walk_${i}.png`;
for (let i = 0; i < 4; i++) IMAGES[`cavalry${i}`] = `assets/sprites/characters/cavalry_walk_${i}.png`;   // 4-frame gallop: stride, gather, and the rise
for (let i = 0; i < 4; i++) IMAGES[`musketeer${i}`] = `assets/sprites/characters/musketeer_walk_${i}.png`;
for (let i = 0; i < 4; i++) IMAGES[`doctor${i}`] = `assets/sprites/characters/doctor_walk_${i}.png`;   // beak, brim and waxed coat
for (let i = 0; i < 4; i++) IMAGES[`soldierU${i}`] = `assets/sprites/characters/soldier_walk_${i}.png`;
for (let i = 0; i < 4; i++) IMAGES[`atkuni${i}`] = `assets/sprites/characters/soldier_atk_${i % 3}.png`;
for (let i = 0; i < 4; i++) {                       // aim, flash, smoke, lower — then powder, ball, ramrod, shoulder
  IMAGES[`mfire${i}`] = `assets/sprites/characters/musket_fire_${i}.png`;
  IMAGES[`mload${i}`] = `assets/sprites/characters/musket_load_${i}.png`;
}
// The regimental coat is painted a strong blue so it can be picked out and dyed
// to whatever colour the colony chooses; boots, hat, hands and musket are left alone.
const UNIFORM_KEYS = ["musketeer0", "musketeer1", "musketeer2", "musketeer3",
                      "mfire0", "mfire1", "mfire2", "mfire3", "mload0", "mload1", "mload2", "mload3",
                      "soldierU0", "soldierU1", "soldierU2", "soldierU3",
                      "atkuni0", "atkuni1", "atkuni2", "atkuni3",
                      "cavalry0", "cavalry1", "cavalry2", "cavalry3"];
let uniformColor = "#2f52a8";
// who wears the regimental coat — the rider's included, now that the coat is
// painted the same strong blue in both saddle frames
const UNIFORMED = new Set(["musketeer", "police", "soldier", "cavalry"]);
const dyed = {};                                    // recoloured copies, rebuilt when the dye changes
function isCoat(r, g, b) { return b > r + 28 && b > g + 18; }
function reDye() {
  const [tr, tg, tb] = [1, 3, 5].map(i => parseInt(uniformColor.slice(i, i + 2), 16));
  for (const key of UNIFORM_KEYS) {
    const src = img[key];
    if (!src || !src.naturalWidth) continue;
    const cv = document.createElement("canvas");
    cv.width = src.naturalWidth; cv.height = src.naturalHeight;
    const cx2 = cv.getContext("2d");
    cx2.imageSmoothingEnabled = false;
    cx2.drawImage(src, 0, 0);
    const d = cx2.getImageData(0, 0, cv.width, cv.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 128 || !isCoat(p[i], p[i + 1], p[i + 2])) continue;
      // keep the cloth's own light and shade: scale the new colour by this pixel's brightness
      const lum = (p[i] * 0.3 + p[i + 1] * 0.45 + p[i + 2] * 0.25) / 150;
      p[i]     = Math.max(0, Math.min(255, tr * lum));
      p[i + 1] = Math.max(0, Math.min(255, tg * lum));
      p[i + 2] = Math.max(0, Math.min(255, tb * lum));
    }
    cx2.putImageData(d, 0, 0);
    dyed[key] = cv;
  }
}
const coatOf = key => dyed[key] || img[key];
// The same dye, in any colour, for coats that are not yours: a foreign crown's
// soldiers wear their own regimentals. Cut once and kept.
const foeCoats = new Map();
function foeCoat(hex, key) {
  const ck = hex + "|" + key;
  if (foeCoats.has(ck)) return foeCoats.get(ck);
  const src = img[key];
  if (!src || !src.naturalWidth) return src;
  const [tr, tg, tb] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const cv = document.createElement("canvas");
  cv.width = src.naturalWidth; cv.height = src.naturalHeight;
  const cx2 = cv.getContext("2d");
  cx2.imageSmoothingEnabled = false;
  cx2.drawImage(src, 0, 0);
  const d = cx2.getImageData(0, 0, cv.width, cv.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 128 || !isCoat(p[i], p[i + 1], p[i + 2])) continue;
    const lum = (p[i] * 0.3 + p[i + 1] * 0.45 + p[i + 2] * 0.25) / 150;
    p[i]     = Math.max(0, Math.min(255, tr * lum));
    p[i + 1] = Math.max(0, Math.min(255, tg * lum));
    p[i + 2] = Math.max(0, Math.min(255, tb * lum));
  }
  cx2.putImageData(d, 0, 0);
  foeCoats.set(ck, cv);
  return cv;
}
const RAIDER_COAT = "#7a2b2b";        // the coat of a band with no crown behind it
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
let taxRate = 2, taxTimer = TAX_PERIOD;
let settlementName = "Neu Hamburg";
let empireName = "";
let territoryColor = "#7da083", borderColor = "#c9a86a";
const territory = new Set();          // "cx,cy" world cells, 96px each
const TCELL = 96;
const SETTLE_FIRST = 1500, SETTLE_AGAIN = 1500;   // 25 minutes to the first offer, and 25 more after each
let sackedCamps = 0, playT = 0, nextSettleAt = SETTLE_FIRST, settlePending = false;
let lastTier = 1, lastTierToldT = -999;
// the woods grow bolder as your colony grows older and larger
// ===== the reckoning: how much the woods and the crowns fear you =====
// A colony that grows strong does not grow safe. Every soldier you raise, every
// town you found, every camp you burn and every mark in the treasury is another
// reason for someone to come and take it. Nothing here is capped by the clock.
function menace() {
  const army = civs.filter(isForce).length;
  const built = buildings.filter(b => b.type !== "burned" && !b.site).length;
  const raw =
      playT / 2400                      // the years themselves
    + civs.length * 0.10                // mouths, hands, and rumours
    + army * 0.16                       // a standing army is a provocation
    + settlements.length * 0.5          // every town is another prize
    + Math.max(0, res.dm) / 1200        // a full treasury is a story that travels
    + built * 0.015
    + sackedCamps * 0.15                // they remember what you did to the last camp
    + conquests.length * 0.7;           // and a conqueror is everyone's problem
  // The woods can raise their fury, but they cannot raise men out of nothing.
  // A colony twice the size does not face twice the woods — it faces half again.
  return 1 + Math.pow(Math.max(0, raw), 0.72) * 2.2;
}
// No ceiling worth the name: the reckoning keeps climbing as long as you do —
// it simply stops doubling, so an empire is hard-pressed and not merely drowned.
function difficulty() { return Math.max(1, Math.min(20, Math.round(menace()))); }
// how many may come at once, and how many camps the woods can hold
// ===== how many may come for you at once =====
// A hard ceiling of seven, and never more than two more than you have men to
// answer with. The reckoning still decides how OFTEN they come, how big a camp
// grows and how hard each man hits — it no longer decides how many of them are
// standing in your street, because that was the number that made the game
// unplayable. Two soldiers means four attackers, not eighteen.
const HARD_ATTACKER_CAP = 7;
function attackerCap() {
  const army = civs.filter(isForce).length;
  return Math.max(1, Math.min(HARD_ATTACKER_CAP, army + 2));
}
// Everyone actually coming for you — camp raiders and crowns' men counted
// together, since two separate caps of seven is a street with fourteen men in
// it. Camp patrols and a foreign town's garrison never march on you, so they
// are not in this number.
const attackersAfield = () => raiders.filter(r => r.state !== "patrol" && !r.garrison).length;
function campCap() { return Math.max(1, Math.min(MAX_CAMPS, 1 + Math.floor(menace() / 4))); }
const settlements = [];               // {name, pop, mx, my} on the Europe map
const laws = { civWeapons: false, hunterWeapons: true, forced: false, freeRoam: false, civBuild: false };

const cam = { x: 0, y: 0 };
let zoom = 1;
const settings = Object.assign(
  { master: 0.5, music: true, battle: true, sfx: true, ambient: true, march: true,
    floaters: true, labels: true, smoke: true, night: true, camSpeed: 1, edgePan: true,
    hints: true, marchTune: "grenadier" },
  JSON.parse(localStorage.getItem("forester_settings") || "{}"));
window.FSET = settings;
function saveSettings() { localStorage.setItem("forester_settings", JSON.stringify(settings)); }
const keys = {};
const mouse = { x: 0, y: 0, wx: 0, wy: 0 };
// Edge scrolling needs its own idea of where the pointer is, because `mouse`
// only hears from the canvas and goes stale the moment the pointer crosses
// onto the chrome — and a stale position parked in the edge band would scroll
// the map forever. `on` is whether the map should take the shove at all.
const edge = { x: 0, y: 0, on: false };

const buildings = [], farms = [], civs = [], visitors = [], raiders = [], camps = [], floaters = [], smokes = [], corpses = [], graves = [];
// enemy ground: a foreign crown's border town, standing in the world to be stormed
const foreign = [], foreignTowns = [], foreignFolk = [];
const balls = [];   // musket shot in flight — it goes where it was pointed, and no further
// dirt paths: a set of small cells the colony has worn smooth, a fifth of a mark each
const ROAD = 32, ROAD_COST = 0.2;      // one dirt tile of lane, a fifth of a mark apiece
const roads = new Set();
const rkey = (rx, ry) => rx + "," + ry;
const roadCellOf = (wx, wy) => [Math.floor(wx / ROAD), Math.floor(wy / ROAD)];
const chunks = new Map();

let selected = null, selectedBldg = null, selectedCamp = null, selectedGrave = null, buildMode = null;
let selGroup = [];   // soldier multi-select: click several soldiers, order them as one
const groupable = c => c.profession === "soldier" || c.profession === "cavalry" || c.profession === "musketeer";
const soldierGroup = () =>
  (selected && groupable(selected) && selGroup.includes(selected))
    ? selGroup.filter(s => civs.includes(s) && groupable(s))
    : (selected ? [selected] : []);
let toastTimer = 0, hunterTimer = 40, visitorSeq = 0, paused = false;
// ===== the clock of the world =====
// An hour is a minute. The day is twenty-four of them: twelve hours of working
// light from six in the morning, the sun going down through six, full dark from
// seven until five, and an hour of grey to lift it. Everything about the light
// is stated in hours below, so the sky and the clock face can never disagree.
//
// This stretched the day from five real minutes to twenty-four, so the year was
// stretched with it by exactly the same factor: the colony still sees a winter
// every two days or so, and still spends the same share of its life in one. In
// real time that is a year of about fifty minutes with nineteen of winter in it.
let worldT = 3 * HOUR;               // the game opens at nine in the morning
const YEAR = Math.round(DAY * 2.133), WINTER_AT = Math.round(YEAR * 0.625);
function season() { return (worldT % YEAR) >= WINTER_AT ? "winter" : "summer"; }
let lastSeason = "summer";
let colonyYear = 1683;
function wimg(key) {
  if (season() !== "winter") return img[key];
  const w = img[key + "_w"];
  return (w && w.complete && w.naturalWidth) ? w : img[key];
}
// The hour of the day, 0 to 24. The world's second zero is six in the morning.
function clockHours() { return (6 + (worldT % DAY) / HOUR) % 24; }
// The light, read straight off that hour — no second timetable to drift from it.
// Dark from seven in the evening until four in the morning, grey for an hour
// after that, and a working day from five. An early dawn is worth an hour of
// labour a day: at first light at five the colony slept through nearly half its
// own clock, which is a long time to watch nothing happen.
const DUSK = 18, DARK = 19, FIRST_LIGHT = 4, SUNUP = 5;
function nightAmt() {
  const h = clockHours();
  if (h >= SUNUP && h < DUSK) return 0;                       // the working day
  if (h >= DUSK && h < DARK) return h - DUSK;                 // the sun going down
  if (h >= DARK || h < FIRST_LIGHT) return 1;                 // dark
  return Math.max(0, 1 - (h - FIRST_LIGHT));                  // five to six: grey, then day
}
// Read the way a person reads a clock, not the way an army does: 7:00 PM, not
// 19:00. Midnight and noon are twelve, never zero.
function clockText() {
  const t = clockHours();
  const h24 = Math.floor(t), m = Math.floor((t - h24) * 60);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
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
           autoT: 3 + Math.random() * 4, atkT: 0, stuckT: 0, coldT: 0, coldWarned: false, isCiv: true,
           sick: 0, op: {}, feudWith: null, feudT: 0, socT: 2 + Math.random() * 6, jail: null, jailT: 0,
           ward: null, wardT: 0, bearing: null, bearer: null, grief: null,
           sk: freshSkills(), sx: {},
           loaded: true, reloadT: 0, fireT: 0 };
}

function float(x, y, text, color) { floaters.push({ x, y, text, color, t: 1.4 }); }
// hunters keep their own look; everyone else wears the family's spare clothes
function refreshAvatar(c) {
  c.who = c.profession === "hunter" ? c.nativeWho :
          c.profession === "doctor" ? "doctor" :
          c.profession === "musketeer" ? "musketeer" :
          c.profession === "cavalry" ? "cavalry" :
          (c.profession === "police" || c.profession === "soldier") ? "soldierU" :
          (c.gender === "f" ? "sister" : "brother");
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
// terrain is a pure function of the chunk coordinates — never stored, always regrown
function genChunk(cx, cy) {
  const ch = { trees: [], stones: [], patches: [] };
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
  ch.wild = { t: ch.trees.length, s: ch.stones.length, p: ch.patches.length };   // where planted growth begins
  return ch;
}
function getChunk(cx, cy) {
  const key = chunkKey(cx, cy);
  let ch = chunks.get(key);
  if (ch) return ch;
  ch = genChunk(cx, cy);
  chunks.set(key, ch);
  return ch;
}

// --- chunk deltas: save only what the colony changed, not the whole forest ---
const r1 = n => Math.round(n * 10) / 10;   // one decimal is finer than a pixel at max zoom
function chunkDelta(key, ch) {
  const wild = ch.wild || { t: ch.trees.length, s: ch.stones.length, p: ch.patches.length };
  const d = {};
  const deadIdx = (arr, n) => { const out = []; for (let i = 0; i < Math.min(n, arr.length); i++) if (!arr[i].alive) out.push(i); return out; };
  const td = deadIdx(ch.trees, wild.t), sd = deadIdx(ch.stones, wild.s), pd = deadIdx(ch.patches, wild.p);
  if (td.length) d.td = td;
  if (sd.length) d.sd = sd;
  if (pd.length) d.pd = pd;
  const tg = [];
  for (let i = 0; i < Math.min(wild.t, ch.trees.length); i++)
    if (ch.trees[i].alive && ch.trees[i].growth < 1) tg.push([i, r1(ch.trees[i].growth)]);
  if (tg.length) d.tg = tg;
  // saplings the colony planted: these are not in the generated forest, so they must be kept
  const planted = ch.trees.slice(wild.t).filter(t => t.alive).map(t => [r1(t.x), r1(t.y), r1(t.growth)]);
  if (planted.length) d.tp = planted;
  return Object.keys(d).length ? [key, d] : null;
}
function applyChunkDelta(key, d) {
  const [cx, cy] = key.split(",").map(Number);
  const ch = genChunk(cx, cy);
  for (const i of d.td || []) if (ch.trees[i]) ch.trees[i].alive = false;
  for (const i of d.sd || []) if (ch.stones[i]) ch.stones[i].alive = false;
  for (const i of d.pd || []) if (ch.patches[i]) ch.patches[i].alive = false;
  for (const [i, g] of d.tg || []) if (ch.trees[i]) ch.trees[i].growth = g;
  for (const [x, y, g] of d.tp || []) ch.trees.push({ x, y, alive: true, progress: -1, growth: g });
  ch.dirty = true;
  chunks.set(key, ch);
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
// Every town is on the raiders' map. A raid picks ONE town — the capital and the
// settlements alike — and strikes it together, instead of scattering across the world.
function townsWithBuildings() {
  return [null, ...settlements.filter(s => s.x !== undefined)]        // null is the capital
    .filter(t => buildings.some(b => b.type !== "burned" && townAt(b.x, b.y) === t));
}
function townCoin(t) { return t ? (t.res && t.res.dm) || 0 : res.dm; }
function raidTargetsIn(town) { return buildings.filter(b => b.type !== "burned" && townAt(b.x, b.y) === town); }
function spawnCamps(n) {
  const tier = difficulty();
  for (let i = 0; i < n && camps.length < campCap(); i++) {   // the woods hold more camps the more you have to lose
    // the camp pitches its tents in the woods near ANY of your towns
    const towns = [null, ...settlements.filter(s => s.x !== undefined)];
    const anchor = towns[Math.floor(Math.random() * towns.length)];
    const ax = anchor ? anchor.x : 0, ay = anchor ? anchor.y : 0;
    const a = Math.random() * Math.PI * 2, d = 1100 + Math.random() * 1100;
    const type = Math.random() < 0.55 ? "thief" : "raid";
    const hp = Math.round((type === "thief" ? 120 : 180) * (1 + 0.15 * (tier - 1)));
    camps.push({ type, x: ax + Math.cos(a) * d, y: ay + Math.sin(a) * d, hp, maxHp: hp,
                 dm: 25 + Math.floor(Math.random() * 40) + tier * 8,
                 weapons: 1 + Math.floor(Math.random() * 2) + Math.floor(tier / 3) });
  }
}

function mkRaider(camp, state) {
  const tier = difficulty();
  const hp = 60 + (tier - 1) * 8;
  return { x: camp.x + Math.random() * 60 - 30, y: camp.y + 20 + Math.random() * 30, hp, maxHp: hp,
           dmg: (camp.type === "raid" ? 14 : 10) + (tier - 1) * 1.2, camp, target: null,
           state, anim: 0, facing: 1, atkT: 0, foe: null, carry: 0, wpx: camp.x, wpy: camp.y };
}
function spawnRaid() {
  if (!camps.length || attackersAfield() >= attackerCap()) return;
  // raiders go where the coin is — an empty chest is not worth the walk
  const towns = townsWithBuildings().filter(t => townCoin(t) >= 5);
  if (!towns.length) return;
  const town = towns[Math.floor(Math.random() * towns.length)];
  const camp = camps[Math.floor(Math.random() * camps.length)];
  let n = (camp.type === "raid" ? 3 : 2) + Math.floor(menace() / 5);
  const targets = raidTargetsIn(town);
  if (!targets.length) return;
  // the patrol decides it is a good time to strike — but a watchman who steps
  // off to attack is an attacker, and counts against the field like any other
  for (const pr of raiders.filter(r => r.camp === camp && r.state === "patrol")) {
    if (n <= 0 || attackersAfield() >= attackerCap()) break;
    pr.state = "approach";
    pr.target = targets[Math.floor(Math.random() * targets.length)];
    n--;
  }
  for (let i = 0; i < n && attackersAfield() < attackerCap(); i++) {
    const r = mkRaider(camp, "approach");
    r.target = targets[Math.floor(Math.random() * targets.length)];
    raiders.push(r);
  }
  lesson("raid");                       // the first horn is the moment to explain walls
  SFX.warHorn();
  if (buildings.some(b => b.type === "watchtower" && !b.fire)) {
    const dir = Math.abs(camp.x) > Math.abs(camp.y) ? (camp.x > 0 ? "east" : "west") : (camp.y > 0 ? "south" : "north");
    toast(`⚠ The watchtower sounds the alarm — raiders approach from the ${dir}${town ? ", making for " + town.name : ""}!`);
  } else toast(`⚠ Raiders have been sighted near ${town ? town.name : "the colony"}!`);
}

function updateRaider(r, dt) {
  let speed = BASE_WALK * 0.9 * snowPace();   // the snow does not part for raiders either
  // moats and ditches mire attackers
  for (const b of buildings) {
    if (b.site) continue;
    if (b.type === "moat" && pointInRect(r.x, r.y, inflate(bldgRect(b), 4))) { speed *= 0.35; break; }
    if (b.type === "ditch" && pointInRect(r.x, r.y, inflate(bldgRect(b), 4))) { speed *= 0.6; break; }
  }
  // fight anyone who is fighting us, or any force unit close by
  if (r.state === "climbWall") r.foe = null;      // both hands on the stone
  else if (!r.foe || (!civs.includes(r.foe))) {
    r.foe = null;
    for (const c of civs) if (isForce(c) && !INDOORS.has(c.state) && Math.hypot(c.x - r.x, c.y - r.y) < 90) { r.foe = c; break; }
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
    // a town's garrison holds its own ground — it never marches on your colony
    if (r.garrison) {
      const gd = Math.hypot(r.wpx - r.x, r.wpy - r.y);
      if (gd < 8) {
        const a = Math.random() * Math.PI * 2, rad = 90 + Math.random() * 150;
        r.wpx = r.garrison.x + Math.cos(a) * rad; r.wpy = r.garrison.y + Math.sin(a) * rad * 0.85;
      } else {
        r.x += (r.wpx - r.x) / gd * speed * 0.4 * dt;
        r.y += (r.wpy - r.y) / gd * speed * 0.4 * dt;
        r.facing = r.wpx < r.x ? -1 : 1;
        r.anim += dt * 5;
      }
      return;
    }
    // circle the camp, watchful, until the strike
    const d = Math.hypot(r.wpx - r.x, r.wpy - r.y);
    if (d < 8 || !camps.includes(r.camp)) {
      if (!camps.includes(r.camp)) {   // camp sacked: vengeance, if there is room for it
        const targets = buildings.filter(b => b.type !== "burned");
        // a watchman stepping off to avenge his camp is one more man coming for
        // you, and the field's ceiling counts him like any other. With no room,
        // he melts into the woods instead of making the street eight deep.
        if (targets.length && attackersAfield() < attackerCap()) {
          r.state = "approach"; r.target = targets[Math.floor(Math.random() * targets.length)];
        } else { raiders.splice(raiders.indexOf(r), 1); }
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
  // Stone is not hacked down and it is not burned. It is got over, and getting
  // over it takes both hands and a long moment with your back to the town — the
  // wall is not spent to let a man in, but the man is helpless while he is on it.
  if (r.state === "climbWall") {
    const w = r.wallTarget;
    if (!buildings.includes(w)) { r.state = "approach"; r.wallTarget = null; r.workT = 0; return; }
    r.workT += dt;
    w.climbP = Math.max(w.climbP || 0, r.workT / CLIMB_TIME);
    r.anim += dt * 3;
    r.facing = w.x < r.x ? -1 : 1;
    if (r.workT >= CLIMB_TIME) {
      overTheWall(r, w, r.target);
      r.state = "approach"; r.wallTarget = null; r.workT = 0;
    }
    return;
  }
  if (r.state === "torchWall") {
    const w = r.wallTarget;
    if (!buildings.includes(w) || w.fire) { r.state = "approach"; r.wallTarget = null; return; }
    if (STONE.has(w.type)) { r.state = "climbWall"; r.workT = 0; return; }   // stone neither burns nor splinters
    r.workT += dt; w.torchP = r.workT / (torchTime() * 0.8); r.anim += dt * 9;
    if (r.workT >= torchTime() * 0.8) {
      w.torchP = -1; w.fire = FIRE_TIME * 0.7;
      toast(`⚠ Raiders put the ${BLDG_NAMES[w.type]} to the torch!`);
      r.state = "approach"; r.wallTarget = null;
    }
    return;
  }
  if (r.state === "approach") {
    let t = r.target;
    // A raider whose mark is already a ruin, or already ablaze, walks back to it
    // and sets about it again. He is throwing a torch at a heap of charcoal —
    // and the second burning used to delete the heap. He looks for something
    // still standing instead, and goes home if there is nothing.
    if (t && (t.type === "burned" || t.fire > 0 || t.site)) {
      let best = null, bd = Infinity;
      for (const b of buildings) {
        if (b.type === "burned" || b.fire > 0 || b.site || WALLLIKE.has(b.type)) continue;
        const d = Math.hypot(b.x - r.x, b.y - r.y);
        if (d < bd) { bd = d; best = b; }
      }
      t = r.target = best;
    }
    if (!t || !buildings.includes(t)) { r.state = "flee"; return; }
    const dx = t.x - r.x, dy = t.y + 20 - r.y, d = Math.hypot(dx, dy);
    if (d < 30) {
      // a crown's soldiers are not thieves: they take the ground and hold it
      if (r.nation) { r.state = "occupy"; r.workT = 0; r.holdX = r.x; r.holdY = r.y; }
      else if (r.arsonist && !STONE.has(t.type)) { r.state = "torchWall"; r.wallTarget = t; r.workT = 0; }
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
        r.state = STONE.has(weakest.type) ? "climbWall" : (Math.random() < 0.5 ? "torchWall" : "axeWall");
        r.wallTarget = weakest; r.workT = 0;
        return;
      }
      r.x = nx; r.y = ny; r.facing = dx < 0 ? -1 : 1; r.anim += dt * 8;
    }
  } else if (r.state === "occupy") {
    // They stand in your streets, breaking what they please, and will not leave
    // until they are driven out — or the town is theirs, or the campaign season
    // ends under them. That last was missing: an occupation with no way out sat
    // there for the rest of the game, and every party that followed it stacked
    // on top, until the field was full of men who had nowhere to be but here.
    // OCCUPY_HOLD is comfortably longer than SIEGE_HOLD, so a company that is
    // genuinely taking the town still gets to finish.
    r.anim += dt * 4;
    r.holdT = (r.holdT || 0) + dt;
    if (r.holdT > OCCUPY_HOLD) {
      r.state = "flee";
      if (onScreen(r.x, r.y)) toast(`The ${NATIONS[r.nation] ? NATIONS[r.nation].name : "enemy"} company withdraws.`);
      return;
    }
    r.workT += dt;
    if (r.workT > 1.6) {
      r.workT = 0;
      const near = buildings.filter(b => b.type !== "burned" && !b.fire && !b.site &&
                                         Math.hypot(b.x - r.x, b.y - r.y) < 190);
      if (near.length) {
        const b = near[Math.floor(Math.random() * near.length)];
        r.facing = b.x < r.x ? -1 : 1;
        b.hp = (b.hp === undefined ? 100 : b.hp) - 7;
        b.maxHp = b.maxHp || 100;
        float(b.x, b.y - 74, "-7", "#d86a5a");
        SFX.chop();
        if (b.hp <= 0) {
          for (const o of b.occupants) o.home = null;
          b.occupants = [];
          emptyShelter(b, "enemy soldiers are pulling it down");
          toast(`⚠ Enemy soldiers have wrecked a ${BLDG_NAMES[b.type] || b.type}!`);
          ruin(b, "been wrecked");
        }
      } else {
        // nothing left standing here: mill about the ground they hold, but never
        // wander off it — an occupying company that strays is no occupation
        if (r.holdX === undefined) { r.holdX = r.x; r.holdY = r.y; }
        const a = Math.random() * Math.PI * 2, rr = Math.random() * 70;
        r.wpx = r.holdX + Math.cos(a) * rr; r.wpy = r.holdY + Math.sin(a) * rr;
      }
    }
    if (r.wpx !== undefined) {
      const wd = Math.hypot(r.wpx - r.x, r.wpy - r.y);
      if (wd > 6) { r.x += (r.wpx - r.x) / wd * speed * 0.3 * dt; r.y += (r.wpy - r.y) / wd * speed * 0.3 * dt; }
    }
  } else if (r.state === "steal") {
    r.anim = 1;
    r.workT += dt;
    if (r.workT > 2) {
      // rob the town they are standing in — not the capital's coffers from afar
      const led = ledgerAt(r.x, r.y), town = townAt(r.x, r.y);
      const take = Math.min(15, Math.max(0, (led.dm || 0) - (led === res ? treasuryFloor() : 0)));
      led.dm -= take; r.carry = take;
      SFX.coinLoss();
      float(r.x, r.y - 70, "-" + take + " DM", "#d86a5a");
      toast(`⚠ A raider makes off with ${take} DM${town ? " from " + town.name : ""}!`);
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
  // A blow between two of your own is remembered on both sides — but not when
  // they are already feuding. Counting the quarrel's own punches drove opinion
  // down without limit, which started fresh quarrels, which threw more punches:
  // a colony of two dozen wiped itself out inside a quarter of an hour.
  if (a && b && a.isCiv && b.isCiv && a.feudWith !== b.name && b.feudWith !== a.name)
    fallOut(b, a, -14);
  if (Math.random() < DODGE_CHANCE) { float(b.x, b.y - 70, "Dodged!", "#cfd8d3"); SFX.dodge(); return; }
  b.hp -= dmg;
  float(b.x, b.y - 70, "-" + dmg, "#d86a5a");
  SFX.hit();
  if (b.hp <= 0) {
    if (raiders.includes(b)) {
      raiders.splice(raiders.indexOf(b), 1);
      SFX.death();
      if (b.carry) { res.dm += b.carry; float(b.x, b.y - 50, "+" + b.carry + " DM", "#7da083"); }
      toast(b.nation && NATIONS[b.nation] ? `A soldier of ${NATIONS[b.nation].name} has been cut down.` : "A raider has been cut down.");
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
      order(b, { kind: "walk", flee: true, x: b.x + (b.x - a.x) * 4, y: b.y + (b.y - a.y) * 4 });
    else if ((b.rebel || isForce(b)) && (!b.task || !b.task.target)) {
      if (civs.includes(a)) order(b, { kind: "attack", target: a, x: a.x, y: a.y });
      // raider attackers are handled by force auto-targeting
    }
  }
}

// --- geometry ---
const SMALL_BLDG = { farm: FARM_SIZE, wall: 64, gate: 72, stonewall: 64, stonegate: 76, moat: 64, ditch: 64, lamp: 26 };
// What a thing occupies and what it looks like are not the same measurement. A
// lamppost stands about as tall as the man beneath it but takes up almost no
// ground, so you can line a street with them without them refusing each other.
const DRAW_SIZE = { lamp: 58 };
const drawSizeOf = t => DRAW_SIZE[t] || SMALL_BLDG[t] || BLDG_SIZE;
function bldgRect(b) {
  const bt = baseType(b);
  if (WALLLIKE.has(bt)) {
    const L = SMALL_BLDG[bt];
    return b.rot ? { x: b.x - 11, y: b.y - L, w: 22, h: L }
                 : { x: b.x - L / 2, y: b.y - 22, w: L, h: 22 };
  }
  const s = SMALL_BLDG[bt] || BLDG_SIZE;
  return { x: b.x - s / 2, y: b.y - s, w: s, h: s };
}
let wallRot = 0;
const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pointInRect = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
const allStructures = () => buildings.concat(farms.map(f => ({ type: "farm", x: f.x, y: f.y }))).concat(foreign);

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
  // A run already begun may always be continued: if the piece locked onto a wall
  // of yours, nothing but the cost may refuse it — the builders fell what is in
  // the way. (snapWallPos is always called immediately before this.)
  if (WALLLIKE.has(type) && wallSnapped) return true;
  if (WALLLIKE.has(type)) {
    if (!nearTerritoryWide(wx, wy, 5)) return false;                       // not too far from home
    for (const cp of camps) if (Math.hypot(cp.x - wx, cp.y - wy) < 520) return false;   // not at their door
  } else if (type !== "sapling" && !inTerritory(wx, wy)) return false;
  const s = type === "sapling" ? 20 : (SMALL_BLDG[type] || BLDG_SIZE);
  const cand = (type === "wall" || type === "gate")
    ? bldgRect({ type, x: wx, y: wy, rot: rot === undefined ? wallRot : rot })
    : { x: wx - s / 2, y: wy - s, w: s, h: s };
  const placingWall = WALLLIKE.has(type);
  // A lamppost keeps a wall's manners: it butts up close to whatever it lights,
  // and nothing has to leave room for its doorway, because it has not got one.
  const placingProp = isProp(type);
  for (const b of allStructures()) {
    const bWall = WALLLIKE.has(b.type);
    const margin = placingWall && bWall ? -10
                 : placingWall || placingProp || bWall || isProp(b.type) || b.type === "farm" ? 2 : 12;
    const r = inflate(bldgRect(b), margin);
    if (!bWall && !isProp(b.type) && b.type !== "farm" && !placingWall && !placingProp) r.h += 26;
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
// --- roads underfoot: a beaten path is quicker than the long grass ---
const ROAD_SPEED = 1.85;              // how much ground a road saves you
// What a road step costs the pathfinder. Well below the speed saving on purpose:
// folk should go out of their way to reach a lane, the way people really do,
// rather than only taking one that happens to lie dead ahead. At 0.32 a walker
// will accept roughly two thirds again as much ground to travel on dirt.
const ROAD_PATH_COST = 0.32;
// A* over open country needs a heap; re-sorting the frontier every step was
// costing more than the search itself.
function mkHeap() {
  const a = [];
  const swap = (i, j) => { const t = a[i]; a[i] = a[j]; a[j] = t; };
  return {
    size: () => a.length,
    push(n) {
      a.push(n);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; swap(p, i); i = p; }
    },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let s = i;
          if (l < a.length && a[l].f < a[s].f) s = l;
          if (r < a.length && a[r].f < a[s].f) s = r;
          if (s === i) break;
          swap(s, i); i = s;
        }
      }
      return top;
    },
  };
}
const onRoad = (wx, wy) => roads.has(rkey(Math.floor(wx / ROAD), Math.floor(wy / ROAD)));
function roadInCell(cx, cy) {         // any road dirt inside this pathfinding cell
  const h = PATH_CELL / 2;
  for (let x = cx - h; x <= cx + h; x += ROAD)
    for (let y = cy - h; y <= cy + h; y += ROAD)
      if (onRoad(x, y)) return true;
  return onRoad(cx, cy);
}
function findPath(sx, sy, gx, gy, roadAware) {
  // Bounded A* over a coarse grid; gates are open cells, walls are not.
  // With roads laid, a step on the dirt costs a third of open ground, so a walker
  // will leave the straight line, get onto the lane, run along it, and come off
  // again near the door — which is what a road is for.
  const roadMemo = new Map();
  const isRoadCell = (cx, cy) => {
    const k = cx + "," + cy;
    let v = roadMemo.get(k);
    if (v === undefined) { v = roadInCell(cx, cy); roadMemo.set(k, v); }
    return v;
  };
  // gather the walls ONCE. Rebuilding the structure list per cell test was the
  // real cost of this search, and why it used to give up on any long journey.
  const walls = [];
  for (const b of allStructures())
    if ((b.type === "wall" || b.type === "stonewall") && !b.site) walls.push(inflate(bldgRect(b), 10));
  const blockedAt = (px, py) => {
    for (let i = 0; i < walls.length; i++) {
      const r = walls[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true;
    }
    return false;
  };
  const seeThrough = (x1, y1, x2, y2) => {
    const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.max(1, Math.ceil(d / 22));
    for (let i = 1; i <= steps; i++)
      if (blockedAt(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps)) return false;
    return true;
  };
  // room to swing wide of the straight line — a road worth taking is often well
  // off the direct route
  const pad = roadAware && roads.size ? 22 : 12;
  const minX = Math.floor(Math.min(sx, gx) / PATH_CELL) - pad, maxX = Math.floor(Math.max(sx, gx) / PATH_CELL) + pad;
  const minY = Math.floor(Math.min(sy, gy) / PATH_CELL) - pad, maxY = Math.floor(Math.max(sy, gy) / PATH_CELL) + pad;
  if ((maxX - minX) * (maxY - minY) > 30000) return null;   // the other side of the world — walk straight
  const key = (x, y) => x + "," + y;
  const start = [Math.floor(sx / PATH_CELL), Math.floor(sy / PATH_CELL)];
  const goal = [Math.floor(gx / PATH_CELL), Math.floor(gy / PATH_CELL)];
  const hw = roadAware ? ROAD_PATH_COST : 1;               // admissible: no step is cheaper than this
  const heap = mkHeap();
  const startNode = { x: start[0], y: start[1], g: 0, f: 0, from: null, done: false };
  heap.push(startNode);
  const seen = new Map([[key(start[0], start[1]), startNode]]);
  const blockedCells = new Set();
  const isBlocked = (cx, cy, wx, wy) => {
    const k = key(cx, cy);
    let v = blockedCells.has(k);
    if (!v && !seen.has(k + "|b")) {
      v = blockedAt(wx, wy);
      if (v) blockedCells.add(k);
      seen.set(k + "|b", true);
    }
    return v;
  };
  let goalNode = null, guard = 0;
  while (heap.size() && guard++ < 20000) {
    const n = heap.pop();
    if (n.done) continue;                                  // a cheaper way here was already taken
    n.done = true;
    if (n.x === goal[0] && n.y === goal[1]) { goalNode = n; break; }
    const bx = n.x * PATH_CELL + PATH_CELL / 2, by = n.y * PATH_CELL + PATH_CELL / 2;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx2 = n.x + dx, ny2 = n.y + dy;
      if (nx2 < minX || ny2 < minY || nx2 > maxX || ny2 > maxY) continue;
      const cx2 = nx2 * PATH_CELL + PATH_CELL / 2, cy2 = ny2 * PATH_CELL + PATH_CELL / 2;
      if (isBlocked(nx2, ny2, cx2, cy2)) continue;
      // no cutting a diagonal through the corner of a wall
      if (dx && dy && isBlocked(n.x + dx, n.y, bx + dx * PATH_CELL, by) &&
                      isBlocked(n.x, n.y + dy, bx, by + dy * PATH_CELL)) continue;
      const step = (dx && dy ? 1.4 : 1) * (roadAware && isRoadCell(cx2, cy2) ? ROAD_PATH_COST : 1);
      const g = n.g + step;
      const k = key(nx2, ny2);
      const prev = seen.get(k);
      if (prev && prev.g <= g) continue;                   // already reached more cheaply
      const h = Math.hypot(goal[0] - nx2, goal[1] - ny2) * hw;
      const node = { x: nx2, y: ny2, g, f: g + h, from: n, done: false };
      if (prev) prev.done = true;                          // supersede the costlier entry
      seen.set(k, node);
      heap.push(node);
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
    // never straighten a corner off the road — that is the whole point of building one
    const keepForRoad = roadAware && (isRoadCell(pts[i][0], pts[i][1]) ||
                                      (!last && isRoadCell(pts[i + 1][0], pts[i + 1][1])));
    if (!last && !keepForRoad && seeThrough(ax, ay, pts[i + 1][0], pts[i + 1][1])) continue;
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
// ===== the chronicle =====
// This game keeps a great deal in its head — who is skilled at what, who cannot
// stand whom, who was arrested and why, which winter emptied the woodpile — and
// told the player none of it except through a line of text that lasted six
// seconds and was then gone for good. Four and a half of those a minute, for a
// dozen simulated systems. Nobody could answer "why did Anka kill Bo?" or
// "what happened while I was reading the map?", and a colonist who starved in a
// corner left no record that he had ever been hungry.
//
// Everything of consequence is written down here instead, with the year and the
// hour it happened, and the player can go back and read it.
// ===== what the colony has done, all told =====
// The chronicle remembers the last four hundred things that happened and forgets
// the rest, which is right for reading and useless for reckoning. These are the
// running totals of a whole reign — kept from the first day, carried in the save,
// and never trimmed. They are what the ambitions are judged against and what the
// final accounting is written from.
const FRESH_TALLY = () => ({ born: 0, arrived: 0, died: 0, raised: 0, burned: 0, rebuilt: 0,
                             cured: 0, plagues: 0, arrests: 0, feuds: 0, raids: 0, camps: 0, townsTaken: 0, mastersLost: 0,
                             winters: 0, taxDays: 0, billsPaid: 0, arrearDays: 0 });
let tally = FRESH_TALLY();
const CHRON_MAX = 400;                 // what the running game remembers
const CHRON_SAVED = 90;                // what survives a reload, to keep saves small
const CHRON_KINDS = {
  life:  { label: "Life",     icon: "☙" },   // births, arrivals, coming of age
  death: { label: "Deaths",   icon: "†" },
  build: { label: "Building", icon: "⌂" },
  war:   { label: "War",      icon: "⚔" },
  law:   { label: "Law",      icon: "⚖" },   // feuds, arrests, rebellion
  ill:   { label: "Sickness", icon: "☤" },
  land:  { label: "Land",     icon: "❄" },   // seasons, settlements, weather
  work:  { label: "Work",     icon: "⚒" },   // research, trade, taxes
};
let chronicle = [];
function chron(kind, text) {
  const e = { y: colonyYear, c: clockText(), k: kind, t: String(text) };
  chronicle.push(e);
  if (chronicle.length > CHRON_MAX) chronicle.splice(0, chronicle.length - CHRON_MAX);
  if (isOpen("chronPanel")) renderChronicle();
}
// Most things worth remembering are already announced. This says both at once,
// so the call sites stay honest: what the player is told is what is written down.
function tell(kind, text) { chron(kind, text); toast(text); }

function toast(text) {
  msgEl.textContent = text; toastTimer = 5;
  // with the map open, a message belongs beside the button that caused it
  const ov = document.getElementById("mapOverlay"), note = document.getElementById("miNote");
  if (ov && note && ov.style.display === "block") { note.textContent = text; note.style.display = "block"; }
}
// Work is paid for out of the stores of whichever town you are standing in —
// the same ledger the HUD is showing you, so what you see is what you spend.
const LEDGER_KEYS = ["logs", "seeds", "stone", "iron", "wheat", "bread", "meat", "dm", "doors", "weapons"];
// The capital's heart is the burned house you started beside. A daughter town only
// claims a spot if its own clearing is nearer than the capital's — otherwise goods
// dropped in the capital would be carted off to a town half the map away.
const CAPITAL_X = 0, CAPITAL_Y = 0;
function nearerTown(wx, wy, radius) {
  let best = null, bd = radius;
  for (const s of settlements) {
    if (s.x === undefined) continue;
    const d = Math.hypot(s.x - wx, s.y - wy);
    if (d < bd) { bd = d; best = s; }
  }
  if (best && Math.hypot(CAPITAL_X - wx, CAPITAL_Y - wy) <= bd) return null;   // the capital is closer
  return best;
}
function townAt(wx, wy) { return nearerTown(wx, wy, 700); }
function ledgerAt(wx, wy) {
  const t = townAt(wx, wy);
  if (!t) return res;
  t.res = t.res || {};
  for (const k of LEDGER_KEYS) t.res[k] = t.res[k] || 0;
  return t.res;
}
// One empire, one economy. A town spends what it has to hand, and the capital
// makes up any shortfall — so a young settlement with ten logs in its shed can
// still raise a cabin while the capital's barns are full.
const PAY_KINDS = ["logs", "doors", "stone", "iron", "seeds", "dm"];
function canPay(cost, led = res) {
  for (const k of PAY_KINDS) {
    const need = cost[k] || 0;
    if (!need) continue;
    let have = led[k] || 0;
    if (led !== res) have += (res[k] || 0) - (k === "dm" ? treasuryFloor() : 0);
    else have -= (k === "dm" ? treasuryFloor() : 0);
    if (have < need) return false;
  }
  return true;
}
function pay(cost, led = res) {
  for (const k of PAY_KINDS) {
    let need = cost[k] || 0;
    if (!need) continue;
    const local = Math.min(need, led[k] || 0);          // the town's own shed first
    led[k] = (led[k] || 0) - local;
    need -= local;
    if (need && led !== res) res[k] = (res[k] || 0) - need;   // the capital sends the rest
  }
}
const costText = c => [c.logs && `${c.logs} logs`, c.doors && `${c.doors} door`, c.stone && `${c.stone} stone`, c.iron && `${c.iron} iron`, c.seeds && `${c.seeds} seeds`, c.dm && `${c.dm} DM`].filter(Boolean).join(", ");

function freeHome(nearX, nearY) {
  const open = buildings.filter(b => b.type === "cabin" && !b.site && b.occupants.length < cabinCapacity());
  if (!open.length) return null;
  if (nearX === undefined) return open[0];
  // a roof close to where they are standing, so folk recruited in a settlement
  // do not find themselves quartered back at the capital
  return open.reduce((a, b) =>
    Math.hypot(b.x - nearX, b.y - nearY) < Math.hypot(a.x - nearX, a.y - nearY) ? b : a);
}
function houseCiv(c, nearX, nearY) {
  const home = freeHome(nearX, nearY);
  if (!home) return false;
  // Never leave them on the roll of a roof they are moving out of. Every caller
  // today hands in someone with nowhere to live, so this never fires — but one
  // that did not would make a phantom occupant, and a cabin carrying a phantom
  // looks full to the next family that needs it.
  if (c.home && c.home !== home) c.home.occupants = c.home.occupants.filter(o => o !== c);
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
  // What the colony has just lost, said plainly — read BEFORE they are taken off
  // the rolls, or they no longer count among the living for the comparison.
  const lost = soleMasteries(c).sort((a, b) => b.lvl - a.lvl)[0];
  // And who feels it. Everyone who had a view of them takes it to heart in
  // proportion to that view: a friend grieves, an enemy is merely unsettled.
  // Grief is the reason a name is worth something beyond the work it did.
  for (const o of civs) {
    if (o === c || o.child) continue;
    const view = (o.op && o.op[c.name]) || 0;
    const near = Math.hypot(o.x - c.x, o.y - c.y) < 420;
    if (view <= 5 && !near) continue;
    const weight = view > 5 ? Math.min(1, view / 60) : 0.35;   // strangers nearby still saw it
    o.grief = { who: c.name, t: Math.max(o.grief ? o.grief.t : 0, 90 + 130 * weight), w: weight };
  }
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  if (selected === c) selected = null;
  if (skillCiv === c) closeSkills();
  for (const o of civs) { if (o.op) delete o.op[c.name]; if (o.feudWith === c.name) endFeud(o); }
  // a doctor who goes drops his stretcher; a patient on it is let go of
  if (c.bearing) { c.bearing.bearer = null; if (c.bearing.state === "borne") c.bearing.state = "idle"; c.bearing = null; }
  if (c.bearer) { c.bearer.bearing = null; c.bearer = null; }
  c.ward = null;
  selGroup = selGroup.filter(s => s !== c);
  civs.splice(civs.indexOf(c), 1);
  SFX.death();
  tally.died++;
  tell("death", `${c.name}${c.age !== undefined ? `, ${c.age},` : ""} ${why}. The colony numbers ${civs.length}.`);
  // the eulogy: a trade nobody else can carry dies with the person who held it
  if (lost) {
    tally.mastersLost = (tally.mastersLost || 0) + 1;
    tell("death", `${c.name} was the colony's finest hand at ${lost.name.toLowerCase()} — ${lost.lvl} against the next hand's ${lost.next}. That knowledge goes into the ground.`);
  }
  if (civs.length === 0) gameOver();
  syncUI();
}

// A meal fills a belly and does nothing else. It used to close wounds as well,
// which meant a colony with bread never needed anything more — no bed, no
// doctor, no reason to build either. Mending happens in a hospital now.
function eat(c, kind) {
  SFX.eat();
  c.hunger = Math.min(100, c.hunger + (kind === "wheat" ? 15 : 35));
}

// --- input ---
let pauseOpen = false;
function setPause(open) {
  pauseOpen = open;
  $("pauseMenu").style.display = open ? "block" : "none";
  // which colony you are playing, so "Save Game" is never a guess
  if (open && $("pmSlot")) {
    const free = firstFreeSlot();
    $("pmSlot").textContent = `Slot ${saveSlot} of ${SAVE_SLOTS} — ${settlementName}` +
      (free ? "" : " · every slot is full");
    $("pmSaveAs").disabled = !free;
    // the way out is offered, never forced, and only once there is something to read
    $("pmReign").style.display = ambitionsDone() >= AMBITIONS_TO_END ? "block" : "none";
  }
  paused = pauseOpen || dlg.open || $("mapOverlay").style.display === "block" ||
           $("settleModal").style.display === "block" || $("empireModal").style.display === "block";
  try { SFX.pauseAll(pauseOpen); } catch (e) {}
}
// Typing is not driving. While the caret sits in a text field, the keyboard
// belongs to that field: naming a settlement "Waldheim" should not walk the
// camera halfway across the map on the W and the A. A handful of fields used to
// stop the event themselves, and every field added since forgot to.
const typingInto = e => {
  const t = e.target;
  if (!t || t === document.body) return false;
  return t.isContentEditable === true || t.tagName === "INPUT" ||
         t.tagName === "TEXTAREA" || t.tagName === "SELECT";
};
addEventListener("keydown", e => {
  if (typingInto(e)) {
    if (e.key === "Escape") e.target.blur();   // a way out that never traps the caret
    return;
  }
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === "r" && WALLLIKE.has(buildMode)) {
    wallRot = wallRot ? 0 : 1;
    toast(`Wall turned ${wallRot ? "upright (north-south)" : "flat (east-west)"}.`);
  }
  // ===== orders from the keyboard =====
  // The two orders you give oftenest, and both of them were four clicks deep:
  // pick the man, find the panel, find the button, press it. H sends the hurt to
  // a bed, G hands what they are carrying to the town. Both obey the same rule
  // as the buttons — a picked company is ordered as a company.
  if (gameState === "playing" && !paused) {
    const k = e.key.toLowerCase();
    if (k === "c") openChronicle();
    if (k === "p") openFolk();
    if (k === "?" || k === "/") openHelp();
    if (k === "h" || k === "g") {
      if (!selected) toast("Select a civilian first — then H to send them to the hospital, G to hand their goods over.");
      else $(k === "h" ? "cpHeal" : "cpDeposit").click();
    }
  }
  if (e.key === "Escape") {
    if (isOpen("helpPanel")) { $("helpPanel").style.display = "none"; }
    else if (isOpen("reignPanel")) { $("reignPanel").style.display = "none"; paused = pauseOpen; }
    else if (isOpen("chronPanel")) { $("chronPanel").style.display = "none"; syncUI(); }
    else if (isOpen("folkPanel")) { $("folkPanel").style.display = "none"; syncUI(); }
    else if ($("settingsPanel").style.display === "block") { $("settingsPanel").style.display = "none"; saveSettings(); }
    else if (buildMode) { buildMode = null; syncUI(); }
    else if (gameState === "playing" || pauseOpen) setPause(!pauseOpen);
  }
});
// A key is always released, wherever it was pressed — never leave one stuck down.
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
// and a key still held when the caret enters a field must not go on driving
addEventListener("focusin", e => { if (typingInto(e)) for (const k in keys) keys[k] = false; });
canvas.addEventListener("mousemove", e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (roadDrag) roadStretch(e.clientX, e.clientY);
  if (lineStart) {
    if (!lineDrag && Math.hypot(e.clientX - lineStart.sx, e.clientY - lineStart.sy) > 14) lineDrag = true;
    if (lineDrag) {
      const grp = soldierGroup();
      const ax = grp.reduce((s, c) => s + c.x, 0) / grp.length, ay = grp.reduce((s, c) => s + c.y, 0) / grp.length;
      lineGhost = lineSlots(grp.length, lineStart.wx, lineStart.wy,
                            cam.x + e.clientX / zoom, cam.y + e.clientY / zoom, ax, ay);
    }
  }
});
// The top bar and the action bar both lie across the edge band, so tracking
// the pointer on the canvas alone would leave the map unable to scroll up or
// down at all. Instead: the map takes the shove unless the pointer is over
// something a player can actually click. The top bar only reads out the
// ledger, so the scroll passes straight through it; the action bar's buttons
// stop it, though the bare strip beside them does not. Every other overlay —
// panels, menus, the pause screen — stops it outright.
const PAN_THROUGH = "#hud, #actions";
const PAN_BLOCKING = "button, input, select, textarea, a, label, [role=button]";
addEventListener("mousemove", e => {
  edge.x = e.clientX; edge.y = e.clientY;
  const t = e.target;
  edge.on = !!t && !!t.closest &&
    (t === canvas || (!!t.closest(PAN_THROUGH) && !t.closest(PAN_BLOCKING)));
});
// out of the window, or away to another tab: the map stops
document.addEventListener("mouseleave", () => { edge.on = false; });
addEventListener("blur", () => { edge.on = false; });
function zoomAt(sx, sy, factor) {
  const wx = cam.x + sx / zoom, wy = cam.y + sy / zoom;
  // far enough out to see a whole march of country, close enough to read a face
  zoom = Math.max(0.18, Math.min(2.4, zoom * factor));
  cam.x = wx - sx / zoom;
  cam.y = wy - sy / zoom;
}
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  zoomAt(mouse.x, mouse.y, e.deltaY < 0 ? 1.12 : 0.89);
}, { passive: false });
function cancelAll() {
  buildMode = null; selected = null; selectedBldg = null; selectedCamp = null; selectedGrave = null;
  selGroup = []; roadMode = false; roadDrag = false; roadGhost = []; roadStart = null;
  lineStart = null; lineDrag = false; lineGhost = null;
  closeSiegeMenu();
  syncUI();
}

// --- roads: drag a straight dirt lane across the grass, a fifth of a mark the cell ---
let roadMode = false, roadDrag = false, roadSpent = 0;
let roadStart = null, roadGhost = [];
function layRoad(rx, ry) {
  if (roads.has(rkey(rx, ry))) return false;
  const wx = rx * ROAD + ROAD / 2, wy = ry * ROAD + ROAD / 2;
  const led = ledgerAt(wx, wy);
  if ((led.dm || 0) + (led === res ? 0 : res.dm || 0) < ROAD_COST) return false;
  if (!nearTerritoryWide(wx, wy, 6)) return false;            // roads keep near your own country
  // kept to one decimal: 0.2 is not a clean binary fraction, and without the
  // rounding the treasury drifts into 0.6000000000000001 territory
  if ((led.dm || 0) >= ROAD_COST) led.dm = Math.round((led.dm - ROAD_COST) * 10) / 10;
  else res.dm = Math.round((res.dm - ROAD_COST) * 10) / 10;
  roads.add(rkey(rx, ry));
  roadSpent = Math.round((roadSpent + ROAD_COST) * 10) / 10;
  return true;
}
// which neighbours a piece joins: 1 north, 2 east, 4 south, 8 west
function roadBits(rx, ry, also) {
  const on = (x, y) => roads.has(rkey(x, y)) || (also && also.some(p => p[0] === x && p[1] === y));
  return (on(rx, ry - 1) ? 1 : 0) | (on(rx + 1, ry) ? 2 : 0) | (on(rx, ry + 1) ? 4 : 0) | (on(rx - 1, ry) ? 8 : 0);
}
// a dragged road snaps to the grid and runs in straight legs — along the longer
// axis first, then the turn — so a lane comes out tidy instead of scribbled
function roadLine(a, b) {
  const out = [];
  const [ax, ay] = a, [bx, by] = b;
  const horizFirst = Math.abs(bx - ax) >= Math.abs(by - ay);
  const stepTo = (from, to) => from === to ? 0 : (to > from ? 1 : -1);
  let x = ax, y = ay;
  out.push([x, y]);
  if (horizFirst) {
    while (x !== bx) { x += stepTo(x, bx); out.push([x, y]); }
    while (y !== by) { y += stepTo(y, by); out.push([x, y]); }
  } else {
    while (y !== by) { y += stepTo(y, by); out.push([x, y]); }
    while (x !== bx) { x += stepTo(x, bx); out.push([x, y]); }
  }
  return out;
}
$("roadToggle").addEventListener("click", () => {
  roadMode = !roadMode;
  if (roadMode) { buildMode = null; toast("Road builder: press and drag — the lane snaps to straight legs (0.2 DM a tile). Release to build it. Click ROADS again to stop."); }
  else if (roadSpent > 0) { toast(`Road laid — ${roadSpent % 1 ? roadSpent.toFixed(1) : roadSpent} DM spent.`); roadSpent = 0; }
  syncUI();
});
// press to set one end, drag to stretch the lane, release to build it
function roadBegin(clientX, clientY) {
  roadDrag = true;
  roadStart = roadCellOf(cam.x + clientX / zoom, cam.y + clientY / zoom);
  roadGhost = [roadStart];
}
function roadStretch(clientX, clientY) {
  if (!roadDrag || !roadStart) return;
  roadGhost = roadLine(roadStart, roadCellOf(cam.x + clientX / zoom, cam.y + clientY / zoom));
}
function roadCommit() {
  if (!roadDrag) return;
  roadDrag = false;
  const plan = roadGhost;
  roadGhost = []; roadStart = null;
  let laid = 0, blocked = 0;
  for (const [rx, ry] of plan) {
    if (roads.has(rkey(rx, ry))) continue;
    if (layRoad(rx, ry)) laid++; else blocked++;
  }
  if (laid) { SFX.step(false); syncUI(); }
  if (blocked) {
    const [rx, ry] = plan[plan.length - 1];
    toast(nearTerritoryWide(rx * ROAD + ROAD / 2, ry * ROAD + ROAD / 2, 6)
      ? `Not enough DM — ${blocked} stretch(es) of road went unbuilt.`
      : "Roads can only be laid on your own land.");
  }
}
// --- the battle line: with a group selected, press and DRAG to draw the front
// you want them to stand on — they spread along it, extra ranks forming behind,
// in the manner of the old line-battle games. A plain click still marches the
// column to a point.
let lineStart = null, lineDrag = false, lineGhost = null, lineJustLaid = false;
const LINE_SPACE = 26, RANK_DEPTH = 30;
function lineSlots(n, x1, y1, x2, y2, backX, backY) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 30 || n < 2) return null;
  const ux = dx / len, uy = dy / len;
  let px = -uy, py = ux;
  // extra ranks stack on the side the troops are coming from — behind the front
  if ((backX - x1) * px + (backY - y1) * py < 0) { px = -px; py = -py; }
  const perRank = Math.min(n, Math.max(2, Math.floor(len / LINE_SPACE) + 1));
  const ranks = Math.ceil(n / perRank);
  const slots = [];
  for (let r = 0; r < ranks; r++) {
    const inRank = Math.min(perRank, n - r * perRank);
    const gap = inRank > 1 ? (r === 0 ? len / (inRank - 1) : Math.min(LINE_SPACE, len / (inRank - 1))) : 0;
    const lead = r === 0 ? 0 : (len - gap * (inRank - 1)) / 2;   // rear ranks centre up behind the front
    for (let k = 0; k < inRank; k++) {
      const a = lead + k * gap;
      slots.push({ x: x1 + ux * a + px * r * RANK_DEPTH, y: y1 + uy * a + py * r * RANK_DEPTH });
    }
  }
  return { slots, ranks, ux, uy };
}
function lineCommit() {
  if (!lineStart) return;
  const laid = lineDrag && lineGhost && lineGhost.slots.length;
  const plan = lineGhost;
  lineStart = null; lineDrag = false; lineGhost = null;
  if (!laid) return;                            // no real drag: the click event will handle it
  const grp = soldierGroup();
  if (grp.length !== plan.slots.length) return; // the selection changed mid-drag
  // walk the line in drag order so files do not cross each other on the way
  const sorted = [...grp].sort((a, b) => (a.x * plan.ux + a.y * plan.uy) - (b.x * plan.ux + b.y * plan.uy));
  sorted.forEach((s, i) => {
    order(s, { kind: "walk", x: plan.slots[i].x, y: plan.slots[i].y });
    s.post = { x: plan.slots[i].x, y: plan.slots[i].y };
  });
  convoyT = 4;
  try { MUSIC.march(true); } catch (e) {}
  toast(`${grp.length} form line${plan.ranks > 1 ? ` in ${plan.ranks} ranks` : ""} — and will hold it.`);
  lineJustLaid = true;                          // swallow the click that follows this mouseup
}
canvas.addEventListener("mousedown", e => {
  if (e.button !== 0 || gameState !== "playing" || paused) return;
  if (roadMode) { roadBegin(e.clientX, e.clientY); e.preventDefault(); return; }
  if (!buildMode && soldierGroup().length > 1)
    lineStart = { sx: e.clientX, sy: e.clientY, wx: cam.x + e.clientX / zoom, wy: cam.y + e.clientY / zoom };
});
addEventListener("mouseup", () => { roadCommit(); lineCommit(); });
canvas.addEventListener("contextmenu", e => { e.preventDefault(); cancelAll(); });

// --- touch: drag to look about, pinch to zoom, tap to act, hold to cancel ---
const TAP_SLOP = 14, HOLD_MS = 520;
let tPan = null, tPinch = null, tHoldTimer = null, tMoved = 0, tHandled = false;
function touchXY(t) { return [t.clientX, t.clientY]; }
canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 1) {
    const [x, y] = touchXY(e.touches[0]);
    tPan = { x, y, sx: x, sy: y, t: performance.now() };
    tMoved = 0; tHandled = false;
    mouse.x = x; mouse.y = y;                    // no hover on a touchscreen: the finger is the cursor
    if (roadMode && gameState === "playing" && !paused) {   // a finger lays road instead of dragging the view
      tHandled = true;
      roadBegin(x, y);
      e.preventDefault();
      return;
    }
    clearTimeout(tHoldTimer);
    tHoldTimer = setTimeout(() => {              // press and hold stands in for a right-click
      if (tPan && tMoved < TAP_SLOP && gameState === "playing" && !paused) {
        tHandled = true;
        if (navigator.vibrate) navigator.vibrate(12);
        cancelAll();
        toast("Selection cleared.");
      }
    }, HOLD_MS);
  } else if (e.touches.length === 2) {
    clearTimeout(tHoldTimer);
    const [x1, y1] = touchXY(e.touches[0]), [x2, y2] = touchXY(e.touches[1]);
    tPinch = { d: Math.hypot(x2 - x1, y2 - y1), cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
    tPan = null; tHandled = true;
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2 && tPinch) {
    const [x1, y1] = touchXY(e.touches[0]), [x2, y2] = touchXY(e.touches[1]);
    const d = Math.hypot(x2 - x1, y2 - y1), cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    cam.x -= (cx - tPinch.cx) / zoom; cam.y -= (cy - tPinch.cy) / zoom;   // two fingers also carry the view
    if (tPinch.d > 0) zoomAt(cx, cy, Math.max(0.5, Math.min(2, d / tPinch.d)));
    tPinch = { d, cx, cy };
  } else if (e.touches.length === 1 && roadDrag) {
    const [x, y] = touchXY(e.touches[0]);
    roadStretch(x, y);
    mouse.x = x; mouse.y = y;
    if (tPan) { tPan.x = x; tPan.y = y; }
  } else if (e.touches.length === 1 && tPan) {
    const [x, y] = touchXY(e.touches[0]);
    const dx = x - tPan.x, dy = y - tPan.y;
    tMoved += Math.hypot(dx, dy);
    if (tMoved >= TAP_SLOP) {
      clearTimeout(tHoldTimer);
      // while building, the finger carries the ghost so you can see where it lands;
      // otherwise the world moves under the finger
      if (!buildMode) { cam.x -= dx / zoom; cam.y -= dy / zoom; tHandled = true; }
    }
    tPan.x = x; tPan.y = y;
    mouse.x = x; mouse.y = y;
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchend", e => {
  clearTimeout(tHoldTimer);
  if (roadDrag) { roadCommit(); tHandled = true; }
  if (tPan && !tHandled) {
    // in build mode, lifting the finger sets the stake wherever the ghost rests
    if (buildMode) worldClick(tPan.x, tPan.y);
    else if (tMoved < TAP_SLOP && performance.now() - tPan.t < HOLD_MS) worldClick(tPan.sx, tPan.sy);
  }
  if (!e.touches.length) { tPan = null; tPinch = null; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchcancel", () => { clearTimeout(tHoldTimer); tPan = null; tPinch = null; roadDrag = false; roadGhost = []; roadStart = null; });

// --- on-screen controls, for hands that have no keyboard ---
const IS_TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
if (IS_TOUCH) {
  document.body.classList.add("touch");
  $("cutHint").textContent = "TAP ▸";
  $("hint").textContent = "Drag to look about · pinch to zoom · hold to deselect";
}
$("tbRotate").addEventListener("click", () => {
  if (!WALLLIKE.has(buildMode)) return toast("Pick a wall, gate, moat or ditch from BUILD first.");
  wallRot = wallRot ? 0 : 1;
  toast(`Wall turned ${wallRot ? "upright (north-south)" : "flat (east-west)"}.`);
  syncUI();
});
$("tbCancel").addEventListener("click", () => { cancelAll(); toast("Selection cleared."); });
$("tbHome").addEventListener("click", () => {
  const h = buildings.find(b => b.type === "cabin") || buildings[0] || { x: 0, y: -40 };
  cam.x = h.x - canvas.width / 2 / zoom;
  cam.y = h.y - canvas.height / 2 / zoom;
});
$("tbMenu").addEventListener("click", () => { if (gameState === "playing" || pauseOpen) setPause(!pauseOpen); });

canvas.addEventListener("click", e => {
  if (lineJustLaid) { lineJustLaid = false; return; }   // the drag already gave the order
  worldClick(e.clientX, e.clientY);
});
// ===== picking a person out of a crowd =====
// A finger is not a mouse pointer. The old test asked whether the tap landed
// inside a box 48 world-pixels wide and stopped at the first man it found in
// list order — so a tap two pixels wide of someone fell straight through to the
// ground beneath him and was read as "walk over there". On a phone that is what
// usually happened: tapping the person you wanted to select sent the person you
// already had selected marching across the map at him.
//
// It is a radius now, it takes the NEAREST candidate rather than the first, and
// on a touchscreen it is as generous as a fingertip actually is.
// Distance to the figure's own body, not to a point at its middle: anywhere on
// the man counts as a direct hit, and the radius below is then a true margin
// around him rather than a guess at where his centre might be.
function figureDist(f, wx, wy) {
  const halfW = 15, top = f.y - CHAR_SIZE * 0.82, bot = f.y + 4;
  const dx = Math.max(0, Math.abs(wx - f.x) - halfW);
  const dy = wy < top ? top - wy : wy > bot ? wy - bot : 0;
  return Math.hypot(dx, dy);
}
// The margin is measured on the SCREEN and converted to world units, so a man is
// the same size to tap however far the camera is pulled back — a fixed world
// margin shrinks to nothing the moment you zoom out to look at the whole town.
const PICK_R = () => Math.min(90, (IS_TOUCH ? 30 : 16) / Math.max(0.2, zoom));
function nearestFigure(list, wx, wy, skipIndoors) {
  const r = PICK_R();
  let best = null, bd = Infinity;
  for (const f of list) {
    // whoever is under a roof is not on the map to be clicked: they stand at the
    // building's own coordinates, and would otherwise swallow every click on it
    if (skipIndoors && INDOORS.has(f.state)) continue;
    const d = figureDist(f, wx, wy);
    if (d < bd && d <= r) { bd = d; best = f; }
  }
  return best;
}
const pickCiv = (wx, wy) => nearestFigure(civs, wx, wy, true);
const pickFigure = (list, wx, wy) => nearestFigure(list, wx, wy, false);
// ===== pointing a worker at a thing =====
// Work orders were given by asking, target by target, whether the tap landed
// inside that target's own box, and taking the first that said yes. That is
// fine with a mouse on a spruce. With a finger it is miserable: a tree is
// twenty pixels of trunk, a stake in the ground is a few pixels of outline, and
// a miss does not fall back to the nearest thing — it falls through to the dirt
// and becomes "walk over there". Half the taps did nothing you asked for.
//
// Every candidate within reach is gathered now, measured to its own body, and
// the NEAREST one wins — with the same screen-sized margin the people-picking
// uses, so a target is as big to tap as it looks however far you are zoomed
// out. Where two overlap, the smaller wins: it is the harder one to hit, so it
// is the one you must have meant.
function rectDist(wx, wy, r) {
  const dx = wx < r.x ? r.x - wx : wx > r.x + r.w ? wx - (r.x + r.w) : 0;
  const dy = wy < r.y ? r.y - wy : wy > r.y + r.h ? wy - (r.y + r.h) : 0;
  return Math.hypot(dx, dy);
}
// Split in two: deciding what a click at this point WOULD do, and doing it.
// The deciding half is what lets the cursor say so before you commit.
function resolveOrder(wx, wy) {
  const c = selected;
  if (!c) return null;
  const reach = PICK_R();
  // The world is full of spruces. A stake driven in among them sat at the same
  // distance as the trees overlapping it, and the smaller body won — so ordering
  // a cabin raised in the woods chopped a tree instead, over and over. What the
  // player placed themselves outranks what merely grows there: a tap INSIDE a
  // body beats a tap merely near one, and among bodies you are standing in, the
  // stake and the ruin come first.
  const PRI = { site: 0, ruin: 0, farm: 1, roof: 2, scenery: 3 };
  const cands = [];
  const add = (rect, run, what, label) => {
    const d = rectDist(wx, wy, rect);
    if (d <= reach) cands.push({ d, pri: PRI[what], area: rect.w * rect.h, run, label });
  };
  for (const t of nearThings("trees", wx, wy, 200))
    if (t.alive && t.growth >= 1)
      add({ x: t.x - 17, y: t.y - TREE_SIZE * 0.72, w: 34, h: TREE_SIZE * 0.72 }, () => {
        order(c, { kind: "chop", target: t, x: t.x + 26, y: t.y + 6 });
        toast(`${c.name} heads out to fell a spruce.`);
      }, "scenery", () => "Fell this spruce");
  for (const s of nearThings("stones", wx, wy, 200))
    if (s.alive)
      add({ x: s.x - 19, y: s.y - NODE_SIZE * 0.62, w: 38, h: NODE_SIZE * 0.62 }, () => {
        order(c, { kind: "quarry", target: s, x: s.x + 26, y: s.y + 6 });
        toast(`${c.name} goes to break stone.`);
      }, "scenery", () => "Break this stone");
  for (const p of nearThings("patches", wx, wy, 160))
    if (p.alive)
      add({ x: p.x - 15, y: p.y - NODE_SIZE * 0.5, w: 30, h: NODE_SIZE * 0.5 }, () => {
        order(c, { kind: "gather", target: p, x: p.x + 16, y: p.y + 4 });
        toast(`${c.name} gathers seeds from the wild grass.`);
      }, "scenery", () => "Gather seeds");
  for (const f of farms)
    add(bldgRect({ type: "farm", x: f.x, y: f.y }), () => {
      // A staked farm is a building site like any other, and could not be
      // ordered raised — tapping it only opened its panel, and a farmer who
      // tapped it was signed on to tend a field that had not been dug yet. The
      // raising code has always known how to build one; nothing could ask it to.
      if (f.site) {
        if (c.child) return toast("Children do not raise buildings.");
        if (f.builder && f.builder !== c && civs.includes(f.builder)) {
          f.builder.task = null; f.builder.state = "idle";
        }
        f.builder = c;
        order(c, { kind: "construct", target: f, x: f.x + 20, y: f.y + 14 });
        return toast(`${c.name} goes to break ground for the farm.`);
      }
      if (c.profession === "farmer") {
        if (f.workers.includes(c)) {
          f.workers = f.workers.filter(w => w !== c);
          toast(`${c.name} no longer tends this farm.`);
        } else {
          f.workers.push(c);
          toast(`${c.name} assigned to this farm (${f.workers.length} farmer(s) on it).`);
        }
        syncUI();
      } else if (f.ready) {
        order(c, { kind: "harvest", target: f, x: f.x, y: f.y + 10 });
        toast(`${c.name} goes to bring in the crop.`);
      } else { selectedBldg = f; f.type = "farm"; selected = null; syncUI(); }
    }, "farm", () =>
      f.site ? "Break ground for the farm"
      : c.profession === "farmer" ? (f.workers.includes(c) ? "Take them off this farm" : "Set them to tend this farm")
      : f.ready ? "Bring in the crop"
      : "Look at this farm");
  for (const b of buildings) {
    // stakes in the ground are an invitation: point anyone at them and they go
    // and raise it, without waiting to be asked by their own town's rota
    if (b.site) {
      add(bldgRect(b), () => {
        if (c.child) return toast("Children do not raise buildings.");
        if (b.builder && b.builder !== c && civs.includes(b.builder)) {
          b.builder.task = null; b.builder.state = "idle";   // relieved of the work
        }
        b.builder = c;
        order(c, { kind: "construct", target: b, x: b.x + 20, y: b.y + 14 });
        toast(`${c.name} goes to raise the ${BLDG_NAMES[b.type] || b.type}.`);
      }, "site", () => `Raise the ${BLDG_NAMES[b.type] || b.type}`);
    } else if (b.type === "burned") {
      add(bldgRect(b), () => {
        if (!canPay(REPAIR_COST, ledgerAt(b.x, b.y))) {
          const rl = ledgerAt(b.x, b.y);
          return toast(`Repair needs ${costText(REPAIR_COST)} in town storage. Stored: ${rl.logs || 0} logs, ${rl.doors || 0} door(s).`);
        }
        order(c, { kind: "repair", target: b, x: b.x, y: b.y + 16 });
        toast(`${c.name} goes to rebuild the ruin.`);
      }, "ruin", () => canPay(REPAIR_COST, ledgerAt(b.x, b.y))
        ? "Rebuild this ruin" : `Rebuild this ruin — needs ${costText(REPAIR_COST)}`);
    } else if (canShelter(b)) {
      // and any roof still standing can simply be gone into — out of the snow,
      // out of the weather, out of sight of whoever is coming up the road
      add(bldgRect(b), () => {
        if (c.shelter === b) return turnOut(c);              // tap again to come back out
        if (sheltering(b).length >= SHELTER_CAP)
          return toast(`The ${BLDG_NAMES[b.type] || b.type} is full — ${SHELTER_CAP} may shelter in it.`);
        order(c, { kind: "enter", target: b, x: b.x, y: b.y + 14 });
        toast(`${c.name} goes inside the ${BLDG_NAMES[b.type] || b.type}.`);
      }, "roof", () => c.shelter === b
        ? `Bring them out of the ${BLDG_NAMES[b.type] || b.type}`
        : `Shelter inside the ${BLDG_NAMES[b.type] || b.type}`);
    }
  }
  if (!cands.length) return null;
  // inside beats near; among the bodies you are inside, intent beats scenery
  cands.sort((a, b) => (a.d === 0) !== (b.d === 0) ? (a.d === 0 ? -1 : 1)
                     : a.d === 0 ? (a.pri - b.pri || a.area - b.area)
                     : (a.d - b.d || a.pri - b.pri));
  return cands[0];
}
function orderAtPoint(wx, wy) {
  const best = resolveOrder(wx, wy);
  if (!best) return false;
  best.run();
  return true;
}

// ===== what this click will do, said before you make it =====
// Everything a civilian can be told to do is told the same way — pick them,
// then click the thing — and the game never once said so. A player had to
// click and find out. This reads the same rules the click does, in the same
// order, so what it promises is what happens.
function hintAt(wx, wy) {
  if (gameState !== "playing" || paused) return null;
  if (buildMode) return `Click to place the ${BLDG_NAMES[buildMode] || buildMode}` +
                        (WALLLIKE.has(buildMode) ? " · R turns it" : "") + " · Esc to stop";
  if (roadMode) return "Drag to lay a road";
  const v = pickFigure(visitors, wx, wy);
  if (v) return `Talk to ${v.name} — win them over and they stay`;
  const r = pickFigure(raiders, wx, wy);
  if (r) return selected && isForce(selected)
    ? (soldierGroup().filter(isForce).length > 1 ? "Send the band at this raider" : "Attack this raider")
    : "A raider — pick a soldier first";
  const c = pickCiv(wx, wy);
  if (c) {
    if (selected === c) return `Let go of ${c.name}`;
    if (c.rebel && selected && isForce(selected)) return `Put down ${c.name}`;
    if (groupable(c) && selected && groupable(selected)) return `Add ${c.name} to the band`;
    return `Pick ${c.name}${c.profession ? ` — ${c.profession}` : ""}`;
  }
  if (selected) {
    const best = resolveOrder(wx, wy);
    if (best && best.label) return best.label();
    for (const cp of corpses)
      if (!selected.child && Math.abs(wx - cp.x) < 24 && Math.abs(wy - cp.y) < 28) return "Bury the dead";
  }
  for (const b of buildings)
    if (pointInRect(wx, wy, bldgRect(b))) return `Look at the ${BLDG_NAMES[b.type] || b.type}`;
  if (selected) return soldierGroup().length > 1 ? "March the band here" : `Send ${selected.name} here`;
  return null;
}
function worldClick(clientX, clientY) {
  if (gameState !== "playing") return;
  mouse.x = clientX; mouse.y = clientY;
  mouse.wx = cam.x + mouse.x / zoom; mouse.wy = cam.y + mouse.y / zoom;
  closeSiegeMenu();                        // a click anywhere else drops the choice
  if (paused) return;
  if (roadMode) return;                    // the road builder works on press and release, not on click

  if (buildMode) { tryPlace(buildMode, mouse.wx, mouse.wy); return; }

  {
    const v = pickFigure(visitors, mouse.wx, mouse.wy);
    if (v) return openDialogue(v);
  }

  // raiders: force units can be ordered onto them
  {
    const r = pickFigure(raiders, mouse.wx, mouse.wy);
    if (r) {
      if (selected && isForce(selected)) {
        const grp = soldierGroup().filter(isForce);
        for (const s of grp) order(s, { kind: "attack", target: r, x: r.x, y: r.y });
        toast(grp.length > 1 ? `${grp.length} soldiers move to intercept the enemy.` : `${selected.name} moves to intercept the enemy.`);
      } else toast("Only police or soldiers can be ordered against raiders.");
      return;
    }
  }

  // their townsfolk: soldiers may run them down and take them
  {
    const f = pickFigure(foreignFolk, mouse.wx, mouse.wy);
    if (f) {
      const grp = soldierGroup().filter(isForce);
      if (grp.length) {
        grp.forEach(s => { s.post = null; order(s, { kind: "seize", target: f, x: f.x, y: f.y + 6 }); });
        toast(`${grp.length > 1 ? grp.length + " give" : grp[0].name + " gives"} chase to ${f.name} of ${f.town.name}.`);
      } else toast(`${f.name}, of ${f.town.name}. Send soldiers to take them.`);
      return;
    }
  }

  // enemy ground: any fighting man can be sent against a foreign wall or roof
  for (const fb of foreign)
    if (pointInRect(mouse.wx, mouse.wy, bldgRect(fb))) {
      const grp = soldierGroup().filter(isForce);
      if (grp.length) {
        // the hall is the prize and always goes to the torch; for everything else
        // the choice is the player's — axe it apart, or set it alight
        if (fb.keep) siegeOrder(fb, "torch");
        else openSiegeMenu(fb, clientX, clientY);
      } else if (selected) toast("Only soldiers, line infantry, cavalry or police can be sent against enemy ground.");
      else toast(`${fb.town.name} — a town of ${NATIONS[fb.town.nation].name}. Select your soldiers, then click here.`);
      return;
    }

  // camps: soldiers can be ordered to sack them
  for (const cp of camps)
    if (Math.abs(mouse.wx - cp.x) < BLDG_SIZE / 2 && mouse.wy < cp.y && mouse.wy > cp.y - BLDG_SIZE) {
      // any selection that CONTAINS fighting men marches them — muskets included:
      // a volley into a stockade is siege work as surely as an axe is
      const grp = has("raiding") ? soldierGroup().filter(s => ["soldier", "cavalry", "musketeer"].includes(s.profession)) : [];
      if (grp.length) {
        grp.forEach((s, i) => { s.post = null; order(s, { kind: "siege", target: cp, x: cp.x + 40 + (i % 3) * 16, y: cp.y + 14 + Math.floor(i / 3) * 14 }); });
        toast(grp.length > 1 ? `${grp.length} fighters march on the ${cp.type} camp.` : `${grp[0].name} marches on the ${cp.type} camp.`);
      } else if (selected && isForce(selected)) {
        // a force unit is selected but none of them can sack — say why, keep the selection
        toast(!has("raiding") ? "Sacking camps requires the Raiding technology."
              : "The police guard the town — soldiers, line infantry and cavalry march on camps.");
      } else {
        selectedCamp = cp; selectedBldg = null; selected = null;
        toast(cp.type === "thief" ? "A thief camp. Soldiers could sack it." : "A raider war-camp. Soldiers could sack it — carefully.");
        syncUI();
      }
      return;
    }

  {
    const c = pickCiv(mouse.wx, mouse.wy);
    if (c) {
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

  if (selected && orderAtPoint(mouse.wx, mouse.wy)) return;

  // a bury order: point a civilian at the fallen and they will see it done
  if (selected && !selected.child)
    for (const cp of corpses)
      if (Math.abs(mouse.wx - cp.x) < 24 && Math.abs(mouse.wy - cp.y) < 28) {
        if (cp.carried && cp.carried !== selected) break;   // already on someone's shoulder
        if (cp.bearer && civs.includes(cp.bearer) && cp.bearer !== selected && cp.bearer.task && cp.bearer.task.kind === "bury") {
          cp.bearer.task = null; cp.bearer.state = "idle";  // relieved of the duty
        }
        cp.bearer = selected;
        order(selected, { kind: "bury", target: cp, x: cp.x, y: cp.y + 6 });
        toast(`${selected.name} is ordered to bury the dead.`);
        return;
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
    if (grp.length > 1) marchColumn(grp, mouse.wx, mouse.wy);
    else grp.forEach(s => { s.post = null; order(s, { kind: "walk", x: mouse.wx, y: mouse.wy }); });
  }
}

// A band of soldiers sent somewhere forms a column and steps off together,
// two abreast, in the order they were picked — and the drums strike up.
let convoyT = 0;
function marchColumn(grp, tx, ty) {
  const lead = grp[0];
  const dx = tx - lead.x, dy = ty - lead.y, d = Math.max(1, Math.hypot(dx, dy));
  const fx = dx / d, fy = dy / d;                 // along the line of march
  const sx = -fy, sy = fx;                        // and across it
  grp.forEach((s, i) => {
    const rank = Math.floor(i / 2), file = (i % 2) ? 1 : -1;
    const ox = -fx * rank * 30 + sx * file * 17;
    const oy = -fy * rank * 30 + sy * file * 17;
    order(s, { kind: "walk", x: tx + ox, y: ty + oy });
    s.post = { x: tx + ox, y: ty + oy };          // the ground they take, they hold
  });
  convoyT = 4;                                    // kept alive while the column is on the road
  try { MUSIC.march(true); } catch (e) {}
  toast(`${grp.length} soldiers form column and march out. They will hold that ground.`);
}
function updateConvoy(dt) {
  const marching = selGroup.length > 1 &&
    selGroup.filter(s => civs.includes(s) && s.state === "walking" &&
                         s.task && s.task.kind === "walk").length > 1;
  if (marching) convoyT = 4; else convoyT = Math.max(0, convoyT - dt);
  try { MUSIC.march(convoyT > 0 && gameState === "playing"); } catch (e) {}
}

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
                      wall: 1.5, gate: 2.5, stonewall: 3, stonegate: 5, moat: 6, ditch: 4, farm: 5, jail: 13,
                      hospital: 15, lamp: 2 };
function finishConstruction(b) {
  b.site = false; b.progress = -1;
  const claims = !WALLLIKE.has(b.type) && !isProp(b.type);   // a lamp claims no ground
  if (claims) expandAround(b.x, b.y, 1);
  tally.raised++;
  tell("build", `${BLDG_NAMES[b.type]} raised.${claims ? " The territory grows." : ""}`);
  SFX.build();
  // once the market stands they have a colony rather than a camp, and the
  // comforts are worth mentioning
  if (b.type === "market") lesson("comfort");
  if (b.type === "cabin") for (const c of civs) if (!c.home && houseCiv(c)) toast(`${c.name} moves into the new cabin.`);
}
function evictFromFootprint(b) {
  const r = inflate(bldgRect(b), 10);
  for (const u of [...civs, ...visitors, ...raiders])
    if (pointInRect(u.x, u.y, r)) { u.y = r.y + r.h + 14; u.x += (u.x < b.x ? -18 : 18); }
}
// true when the piece just placed locked onto a wall already standing. A run you
// have started may always be continued — the builders clear whatever is in the way.
let wallSnapped = false;
function snapWallPos(type, wx, wy) {
  wallSnapped = false;
  if (!WALLLIKE.has(type)) return [wx, wy];
  let best = null, bd = 110;
  for (const b of buildings) {
    if (!WALLLIKE.has(b.type)) continue;
    if ((b.rot || 0) !== wallRot) continue;
    const d = Math.hypot(b.x - wx, b.y - wy);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) {
    wallSnapped = true;
    const span = (SMALL_BLDG[best.type] + SMALL_BLDG[type]) / 2 - 6;    // a hand's overlap: the run never shows daylight
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
  wallSnapped = true;
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
  if (type === "townhall") {
    // one hall per town — but every town, the capital included, may have its own
    const here = townAt(wx, wy);
    if (buildings.some(b => b.type === "townhall" && townAt(b.x, b.y) === here)) {
      toast(`${here ? here.name : "The capital"} has its town hall already.`); buildMode = null; syncUI(); return;
    }
  }
  [wx, wy] = snapWallPos(type, wx, wy);
  const cost = costOf(type);
  if (WALLLIKE.has(type)) {
    for (const cp of camps) if (Math.hypot(cp.x - wx, cp.y - wy) < 520) { toast("Too close to an enemy camp — the raiders would never let it stand."); return; }
  }
  const led = ledgerAt(wx, wy), town = townAt(wx, wy);
  if (!canPay(cost, led)) {
    toast(`Not enough materials: needs ${costText(cost)}` +
          (town ? ` — ${town.name}'s stores and the capital's together fall short.` : "."));
    return;
  }
  if (!legalToBuild(type, wx, wy)) { toast(inTerritory(wx, wy) ? "Cannot build there — too close to another building, its entrance, or an obstacle."
                             : "That land is outside your territory. Build and grow to claim more."); return; }
  pay(cost, led);
  SFX.build();
  // a wall continuing a run takes the ground it needs: saplings and boulders in
  // the line of the wall are cleared, and their timber and stone go to the stores
  if (WALLLIKE.has(type) && wallSnapped) {
    const foot = inflate(bldgRect({ type, x: wx, y: wy, rot: wallRot }), 8);
    let logs = 0, rock = 0;
    for (const t of nearThings("trees", wx, wy, 160))
      if (t.alive && pointInRect(t.x, t.y, foot)) { t.alive = false; markChunkDirty(t.x, t.y); logs++; }
    for (const st of nearThings("stones", wx, wy, 160))
      if (st.alive && pointInRect(st.x, st.y, foot)) { st.alive = false; markChunkDirty(st.x, st.y); rock++; }
    if (logs || rock) {
      led.logs = (led.logs || 0) + logs * 2;
      led.stone = (led.stone || 0) + rock * 2;
      if (logs) SFX.treeFall(); else SFX.quarry();
      float(wx, wy - 60, `cleared +${logs * 2} logs +${rock * 2} stone`, "#7da083");
    }
  }
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
  // a bearer shoulders the dead until the grave: only fleeing or the cold may interrupt — and then the body is set down
  const held = corpses.find(cp => cp.carried === c);
  if (held && task.target !== held) {
    // sent elsewhere while bearing someone: lay them down for the next pair of hands,
    // but only for burying another, fleeing, or the killing cold
    if (task.kind === "bury" || task.flee || task.kind === "warmUp") { held.carried = null; held.bearer = null; }
    else { toast(`${c.name} is bearing the dead — the burial comes first.`); return; }
  }
  if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
  c.task = task; c.tx = task.x; c.ty = task.y;
  c.state = "walking"; c.workT = 0;
  c.path = null; c.viaGate = false; c.replanned = false;
  if (c.isCiv && task.kind !== "attack") {
    const blocked = lineBlocked(c.x, c.y, task.x, task.y);
    // walls force a detour; roads invite one, so any walk worth the name goes
    // looking for the dirt first
    const seekRoad = !blocked && roads.size > 0 && Math.hypot(task.x - c.x, task.y - c.y) > 90;
    if (blocked || seekRoad) {
      const route = findPath(c.x, c.y, task.x, task.y, roads.size > 0);
      const usesRoad = route && route.some(p => onRoad(p[0], p[1]));
      if (route && route.length && (blocked || usesRoad)) { c.path = route; c.tx = route[0][0]; c.ty = route[0][1]; }
    }
  }
}

function arrive(c) {
  const t = c.task;
  if (t && t.kind === "goHome") { c.state = "sleeping"; c.task = null; return; }
  if (t && t.kind === "warmUp") { c.state = "warming"; c.workT = 0; c.task = null; return; }
  if (t && t.kind === "enter") {
    const b = t.target;
    c.task = null;
    // the roof may have burned or been pulled down while they were walking to it
    if (!buildings.includes(b) || !canShelter(b) || b.fire) { c.state = "idle"; return; }
    if (sheltering(b).length >= SHELTER_CAP) {
      c.state = "idle";
      toast(`No room left inside the ${BLDG_NAMES[b.type] || b.type} — ${c.name} waits outside.`);
      return;
    }
    c.shelter = b; c.state = "inside";
    syncUI();
    return;
  }
  // ===== the three ways into a hospital bed =====
  // A doctor reaching his case: the man goes onto the stretcher here, and the
  // doctor turns for the ward on his next idle tick.
  if (t && t.kind === "fetch") {
    const p = t.target;
    c.task = null; c.state = "idle";
    if (!civs.includes(p) || !needsBed(p) || spokenFor(p)) return;
    if (INDOORS.has(p.state) && !nightCall(p)) return;
    if (p.shelter) turnOut(p, true);              // fetched out of whatever roof they were under
    p.task = null; p.state = "borne"; p.bearer = c; c.bearing = p;
    toast(`☤ ${c.name} lifts ${p.name} onto the stretcher.`);
    return;
  }
  // the same doctor arriving at the ward with someone on his shoulders
  if (t && t.kind === "ward") {
    const b = t.target, p = c.bearing;
    c.task = null; c.state = "idle";
    if (p) {
      c.bearing = null; p.bearer = null;
      // the player may have pulled them off the stretcher on the way over
      if (!civs.includes(p) || p.state !== "borne") return;
      if (!buildings.includes(b) || b.fire || b.site || bedsFree(b) <= 0) {
        p.state = "idle";
        toast(`No bed free — ${p.name} is set down outside.`);
        return;
      }
      admit(p, b);
      toast(`☤ ${p.name} is laid in a bed at the hospital.`);
    }
    return;
  }
  // and a man who walked himself in, on the player's order
  if (t && t.kind === "hospital") {
    const b = t.target;
    c.task = null; c.state = "idle";
    if (!buildings.includes(b) || b.fire || b.site) return;
    if (bedsFree(b) <= 0) { toast(`The hospital is full — ${c.name} waits outside.`); return; }
    admit(c, b);
    return;
  }
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
  if (t.kind === "climb") {
    if (!t.target || !foreign.includes(t.target)) { c.state = "idle"; c.task = null; return; }
    c.state = "climbing"; c.workT = 0;
    return;
  }
  if (t.kind === "repair") {
    // `b` was never declared here: every repair order has thrown on arrival since
    // the day it was written, swallowed by the frame guard, and no ruin was ever
    // rebuilt. It matters now that every burnt building leaves one.
    const b = t.target;
    if (!buildings.includes(b)) { c.state = "idle"; c.task = null; return; }
    const rled = ledgerAt(b.x, b.y);
    if (!canPay(REPAIR_COST, rled)) { toast("Materials gone — repair cancelled."); c.state = "idle"; c.task = null; return; }
    pay(REPAIR_COST, rled);
    c.state = "repairing"; c.workT = 0;
  } else if (t.kind === "attack") {
    c.state = "fighting"; c.workT = 0;
  } else if (t.kind === "siege") {
    const standing = t.target && t.target.foreign ? foreign.includes(t.target) : camps.includes(t.target);
    if (!standing) { c.state = "idle"; c.task = null; return; }
    c.state = "sieging"; c.workT = 0;
  } else if (t.kind === "arrest") {
    // a man with blood up does not stand still to be arrested: run him down,
    // and the arrest only lands in hand's reach
    const p2 = t.target;
    if (!civs.includes(p2) || !p2.feudWith || isJailed(p2)) { c.state = "idle"; c.task = null; return; }
    const jail = jails().sort((a, b) =>
      Math.hypot(a.x - p2.x, a.y - p2.y) - Math.hypot(b.x - p2.x, b.y - p2.y))[0];
    if (!jail) { c.state = "idle"; c.task = null; return; }
    if (Math.hypot(p2.x - c.x, p2.y - c.y) > 34) { c.tx = p2.x; c.ty = p2.y + 6; c.state = "walking"; return; }
    jailCiv(p2, jail, c);
    SFX.pickup();
    c.state = "idle"; c.task = null;
  } else if (t.kind === "seize") {
    // run them down: the chase only ends in hand's reach
    const f = t.target;
    if (!foreignFolk.includes(f)) { c.state = "idle"; c.task = null; return; }
    if (Math.hypot(f.x - c.x, f.y - c.y) > 34) { c.tx = f.x; c.ty = f.y + 6; c.state = "walking"; return; }
    captureFolk(f);
    SFX.pickup();
    c.state = "idle"; c.task = null;
  } else if (t.kind === "torch") {
    const there = t.target && t.target.foreign ? foreign.includes(t.target) : buildings.includes(t.target);
    if (!there || t.target.fire) { c.state = "idle"; c.task = null; return; }
    c.state = "torching"; c.workT = 0;
  } else if (simple[t.kind]) {
    if ((t.kind === "chop" || t.kind === "quarry" || t.kind === "gather") && !t.target.alive) { c.state = "idle"; c.task = null; return; }
    c.state = simple[t.kind]; c.workT = 0;
    if (t.target && t.target.x !== undefined) c.facing = t.target.x < c.x ? -1 : 1;
  }
}

// Every larder in the empire, nearest first: the one underfoot, then the capital,
// then each daughter town by how far the wagons must come.
function ledgersNear(c) {
  const led = ledgerAt(c.x, c.y);
  const rest = settlements
    .filter(s => s.x !== undefined && s.res && s.res !== led)
    .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))
    .map(s => s.res);
  return [...new Set([led, res, ...rest])];
}
// A hungry soul eats from the larder they are standing beside, then the capital's.
// An army is fed by the whole empire — a column in the field is not left to starve
// because the village it happens to sleep in has run out of bread.
function eatFromStores(c) {
  const list = isForce(c) ? ledgersNear(c) : (() => {
    const led = ledgerAt(c.x, c.y);
    return led === res ? [res] : [led, res];
  })();
  for (const l of list)
    for (const k of ["bread", "meat"])
      if ((l[k] || 0) > 0) { l[k]--; eat(c, k); return true; }
  return false;
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
  // A doctor with a case waiting does not wander off to fell a tree. doctorAI
  // gets first refusal every frame, but the ordinary errands below run on a
  // timer — without this he would be halfway to the woods when the fever broke.
  if (isDoc(c) && c.bearing) return;
  if (isDoc(c) && hospitals().length &&
      civs.some(p => p !== c && needsBed(p) && !spokenFor(p) && !INDOORS.has(p.state))) return;

  if (c.hunger < 60) {
    if (c.inv.bread > 0) { c.inv.bread--; eat(c, "bread"); return; }
    if (c.inv.meat > 0) { c.inv.meat--; eat(c, "meat"); return; }
    if (c.inv.wheat > 0) { c.inv.wheat--; eat(c, "wheat"); return; }
    // The common store feeds whoever is standing in the colony, roof or no roof.
    // Gated on owning a home, a man burnt out of his cabin could not eat from a
    // larder twenty paces away and starved beside five hundred loaves — and a
    // raid that takes the roofs then quietly takes the people too. Homelessness
    // already costs happiness, and kills in the snow; it need not also starve.
    if (eatFromStores(c)) return;
  }
  // A man on post keeps it. He eats what he carries (above) and fights what
  // comes (forceAI), but runs no errands — no felling, no deposits, no market,
  // no wandering off the line.
  if (c.post) return;
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
  const myTown = townAt(c.home.x, c.home.y);            // null means the capital
  const inMyTown = b => townAt(b.x, b.y) === myTown;

  // construction first: staked-out sites need hands — from the same town, so a
  // settler never treks half the map to raise the capital's shed
  const site = buildings.find(b => b.site && inMyTown(b) && (!b.builder || !civs.includes(b.builder))) ||
               farms.find(f => f.site && inMyTown(f) && (!f.builder || !civs.includes(f.builder)));
  if (site && !isForce(c)) {
    site.builder = c;
    order(c, { kind: "construct", target: site, x: site.x + 20, y: site.y + 14 });
    return;
  }

  // the town hall takes deposits without being asked — unload before new work.
  // each town's folk use their own hall; a town without one stocks the cabins.
  const hall = buildings.find(b => b.type === "townhall" && !b.fire && !b.site && inMyTown(b));
  const drop = hall || (myTown ? c.home : null);
  if (drop && (c.inv.logs + c.inv.seeds + c.inv.stone + c.inv.iron + c.inv.wheat) >= 5) {
    order(c, { kind: "hallDeposit", target: drop, x: drop.x, y: drop.y + 16 });
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
  // Only by the colony's leave may they break ground themselves — and the coin
  // comes out of their own purse. The treasury is the government's alone.
  const fCost = costOf("farm"), fCoin = fCost.dm || 0;
  const materials = { ...fCost, dm: 0 };
  const fled = ledgerOf(c);
  if (laws.civBuild && wantsFarm && canPay(materials, fled) && c.inv.dm >= fCoin) {
    for (const r of [90, 120, 150]) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const fx = home.x + Math.cos(a) * r, fy = home.y + Math.sin(a) * r * 0.8;
      if (legalToBuild("farm", fx, fy)) {
        pay(materials, fled);
        c.inv.dm -= fCoin;                    // they pay their own way
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
      // Keep to the town borders — but a colony can hold no ground at all: burn
      // every roof and the territory empties. Picking a random cell out of an
      // empty set gave undefined, and calling .split on it threw. autonomy() is
      // called from inside the per-civ loop with no catch of its own, so that
      // one hungry hunter aborted the WHOLE remaining frame — every civ after
      // him, the raiders, the wars — on every frame, for as long as it held.
      // The colony simply stopped moving. He hunts around the hearth instead.
      const cells = [...territory];
      if (cells.length) {
        const [cx2, cy2] = cells[Math.floor(Math.random() * cells.length)].split(",").map(Number);
        order(c, { kind: "hunt", x: cx2 * TCELL + TCELL / 2 + (Math.random() * 80 - 40), y: cy2 * TCELL + TCELL / 2 + (Math.random() * 80 - 40) });
      } else {
        const a = Math.random() * Math.PI * 2, base = c.home || c;
        order(c, { kind: "hunt", x: base.x + Math.cos(a) * 260, y: base.y + Math.sin(a) * 260 });
      }
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
  // sell at the nearest market, not whichever town happened to build one first
  let market = null, mDist = Infinity;
  for (const b of buildings) if (b.type === "market" && !b.fire && !b.site) {
    const d = Math.hypot(b.x - c.x, b.y - c.y);
    if (d < mDist) { mDist = d; market = b; }
  }
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

  // nothing pressing: stretch the legs, visit a neighbour, look busy —
  // unless posted. A posted soldier stands his ground and looks like it.
  if (!c.post && Math.random() < 0.55) wander(c, c.home || c, 60, 180);
}

// --- happiness & rebellion ---
// ===== why a man is as content as he is =====
// Happiness was a number with no account behind it. A player watching the mood
// fall had nothing to act on: taxes? hunger? no roof? the plague two streets
// away? Every reason is itemised here, and happinessTarget is nothing but the
// sum of this list — so the panel cannot tell one story while the simulation
// runs on another. Change a rule and both change together.
function moodReasons(c) {
  const r = [["a roof, work and quiet", 78]];
  if (taxRate) r.push([`taxes at ${taxRate}`, -taxRate * 6]);
  // the conquered do not love a new flag on the day it is raised
  // the exact value, never a rounded one — happinessTarget is the sum of this
  // list, so rounding here for the sake of a tidy label would change the game
  if (c.conquered) r.push(["lately conquered", -(c.conquered || 0) * 34]);
  if (laws.forced) r.push(["the forced labour edict", -20]);
  if (has("slavemarket")) r.push(["the slave market", -8]);
  if (has("taming")) r.push(["beasts of the forest", 3]);
  if (has("pets")) r.push(["pets about the place", 4]);
  if (has("pettoys")) r.push(["pet toys", 4]);
  const nw = wells();
  if (nw) r.push(["clean water", Math.min(2, nw) * 3]);
  if (c.hunger > 60) r.push(["well fed", 4]);
  if (c.hunger < 30) r.push(["hungry", -12]);
  if (!c.home) r.push(["no roof of their own", -8]);
  if (c.sick > 0) r.push(["stricken with the plague", -18]);
  else if (plagueActive > 0) r.push(["plague in the streets", -7]);
  // a bill the colony could not meet is felt hardest by the man it was owed to
  if (arrears > 0) r.push(isForce(c) ? ["wages in arrears", -14] : ["the works go untended", -5]);
  if (c.grief && c.grief.t > 0) r.push([`grieving for ${c.grief.who}`, -Math.round(6 + 16 * (c.grief.w || 0.5))]);
  return r;
}
function happinessTarget(c) {
  return Math.max(0, Math.min(100, moodReasons(c).reduce((n, [, v]) => n + v, 0)));
}

// A wretched man turns against the colony now and then. He does not turn within
// a fifth of a second, and neither does everyone else he has ever met.
//
// This roll was a flat 8% and it ran once per FRAME, so at sixty frames a second
// it was better than a 99% chance every second: the instant colony happiness dipped
// under 25 the ENTIRE population went rebel at once, armed itself from the armoury
// and started burning the town. Sixty people is sixty hostiles, and the bigger the
// colony the bigger the mob — which is why it looked like an endless raider horde
// and why it got worse the better you were doing. It is a rate per second now, and
// the wretched turn sooner than the merely miserable.
//
// Nor does anyone turn before there is a state to turn against. A settlement of
// six people with no constable and no jail has quarrels, not rebellions — and a
// player who has not yet reached Policing has nothing whatever to answer one
// with, so an early rising was only a punishment for being early. Unrest waits
// on Policing: from the day you raise a police force, the discontented have
// something to rise against, and you have something to put them down with.
const REBEL_RATE = 0.015;                      // ~1 in 67 seconds at the very bottom
function maybeRebel(c, dt) {
  if (!has("policing")) return;
  if (c.rebel || isForce(c) || c.child || civs.length < 2) return;
  const bite = REBEL_RATE * (1 + (25 - c.happiness) / 25);
  if (c.happiness < 25 && Math.random() < bite * (dt || 0)) {
    c.rebel = true;
    const lawAllows = laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter");
    if (lawAllows && forgeBuilt() && res.weapons > 0) { res.weapons--; c.armed = true; }
    c.task = null; c.state = "idle";
    tell("law", `⚠ ${c.name} has turned against the colony${c.armed ? " — and took a weapon" : ""}!`);
  }
}

// ===== what they think of each other =====
// A colony is not a single mood. Everyone forms a view of the people they
// actually live and work beside, and it moves for reasons they could name: a
// crowded roof, a neighbour who has turned on the colony, a man who struck them.
// Let a view sour far enough and it stops being an opinion and becomes a feud —
// and a feud in a forest settlement is settled with an axe or a torch.
//
// Opinions are kept sparsely and by name, not by index: the roll shifts every
// time somebody dies, and a grudge that silently re-points at a stranger would
// be worse than no grudge at all.
const OP_MIN = -100, OP_MAX = 100;
const FEUD_AT = -70;              // where dislike becomes intent
const FEUD_LEN = 240;             // how long the blood stays up
const OP_KNOWN = 260;             // near enough to have a view of at all
// what people in a forest settlement actually fall out over
const GRIEVANCES = [
  "over a debt", "over a boundary stake", "over a woman", "over a borrowed axe",
  "over whose turn it was at the well", "over a share of the harvest",
  "over an insult at the fire", "over a dog", "over a place at the table",
  "over an old score from Hamburg", "over the price of a door", "over a lie told about them",
];
const MAX_FEUDS = 2;              // how many quarrels the colony can be running at once
const BEATEN = 25;                // hp at which a man has had the worst of it
const opinionOf = (c, o) => (c.op && c.op[o.name]) || 0;
function nudgeOpinion(c, o, by) {
  if (!c || !o || c === o) return;
  c.op = c.op || {};
  const was = c.op[o.name] || 0;
  const now = Math.max(OP_MIN, Math.min(OP_MAX, was + by));
  if (now === 0) delete c.op[o.name]; else c.op[o.name] = now;
  if (was > FEUD_AT && now <= FEUD_AT) startFeud(c, o);
}
// Whatever passes between two people, both of them remember it.
function fallOut(a, b, by) { nudgeOpinion(a, b, by); nudgeOpinion(b, a, by * 0.6); }

function startFeud(c, o) {
  if (c.rebel || c.child || !civs.includes(o) || o.child) return;
  if (c.feudWith) return;                       // one quarrel at a time
  // and the colony as a whole only carries so many before it is just a massacre
  if (civs.filter(x => x.feudWith).length >= MAX_FEUDS) return;
  c.feudWith = o.name; c.feudT = FEUD_LEN; c.feudLethal = undefined;
  c.task = null; c.state = "idle";
  tally.feuds++;
  tell("law", `⚠ ${c.name} has fallen out with ${o.name} for good — and means to settle it.`);
}
function endFeud(c, why) {
  if (!c.feudWith) return;
  const name = c.feudWith;
  c.feudWith = null; c.feudT = 0; c.feudLethal = undefined;
  if (c.task && (c.task.kind === "attack" || c.task.kind === "torch")) { c.task = null; c.state = "idle"; }
  if (why) toast(`${c.name} lets the quarrel with ${name} go.`);
}
// ===== the law =====
// A quarrel is the colony's business, not just the two men in it. Where there is
// a jail and someone to walk the beat, the constable takes the one who started
// it and locks him up until the blood goes out of him. No jail, or no police,
// and the feud runs its course the old way.
const SENTENCE = 220;
const ARREST_HASTE = 1.9;         // a constable answering a disturbance runs
const jails = () => buildings.filter(b => b.type === "jail" && !b.fire && !b.site);
const isJailed = c => (c.jailT || 0) > 0;
function jailCiv(c, jail, byWhom) {
  endFeud(c);
  c.jail = jail; c.jailT = SENTENCE;
  c.state = "jailed"; c.task = null;
  c.x = jail.x; c.y = jail.y + 18;
  c.happiness = Math.max(0, c.happiness - 12);
  tally.arrests++;
  tell("law", `⚖ ${byWhom ? byWhom.name + " takes " : ""}${c.name} is put in the jail to cool off.`);
  syncUI();
}
function updateJail(dt) {
  for (const c of civs) {
    if (!isJailed(c)) continue;
    // a jail that burns down or is pulled apart lets its prisoner walk
    if (!c.jail || !buildings.includes(c.jail) || c.jail.fire || c.jail.type !== "jail") {
      c.jailT = 0; c.jail = null; c.state = "idle";
      toast(`${c.name} walks out of the ruined jail.`);
      continue;
    }
    c.jailT -= dt;
    if (c.jailT <= 0) {
      c.jailT = 0; c.jail = null; c.state = "idle";
      c.x += Math.random() * 40 - 20; c.y += 24;
      tell("law", `${c.name} is let out of the jail.`);
    }
  }
}

// The law does not wait to be at leisure. forceAI only ever runs on a man who is
// already idle, so a constable halfway through an errand would walk past a
// killing happening across the street — half of all quarrels were settled before
// anyone in a uniform so much as turned round. A disturbance interrupts whatever
// he was doing, and he does not stop for a fight he is not already in.
function lawTick(c) {
  if (c.profession !== "police" || c.rebel || isJailed(c)) return;
  if (c.task && c.task.kind === "arrest") return;          // already on his way
  if (c.state === "fighting" || INDOORS.has(c.state)) return;
  if (!jails().length) return;
  let culprit = null, best = Infinity;
  for (const o of civs) {
    if (!o.feudWith || isJailed(o) || o === c) continue;
    // don't let two constables converge on the same man
    if (civs.some(p => p !== c && p.profession === "police" &&
                  p.task && p.task.kind === "arrest" && p.task.target === o)) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < best) { best = d; culprit = o; }
  }
  if (culprit) order(c, { kind: "arrest", target: culprit, x: culprit.x, y: culprit.y });
}

// A man with blood up still knows a constable when he sees one, and he runs.
// He breaks off whatever he was about — the victim, the torch — and puts ground
// between himself and the law. The constable is the faster of the two, so it
// ends in a hand on the shoulder sooner or later, but it is a chase and not a
// formality, and a long enough one that a quarrel can still finish first.
const FLEE_SIGHT = 260;              // how close the law gets before he bolts
const FLEE_HASTE = 1.45;             // fear is quick, but not as quick as duty
function runFromTheLaw(c, dt) {
  if (!c.feudWith || isJailed(c) || INDOORS.has(c.state)) return false;
  let cop = null, best = FLEE_SIGHT;
  for (const p of civs) {
    if (p.profession !== "police" || p.rebel || isJailed(p) || INDOORS.has(p.state)) continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < best) { best = d; cop = p; }
  }
  if (!cop) { if (c.task && c.task.kind === "bolt") { c.task = null; c.state = "idle"; } return false; }
  if (!c.task || c.task.kind !== "bolt") {
    if (c.task && c.task.kind !== "bolt") toast(`${c.name} bolts — the law is on him.`);
    c.task = { kind: "bolt" };
  }
  // straight away from the constable, and keep going as he closes
  const dx = c.x - cop.x, dy = c.y - cop.y, d = Math.max(1, Math.hypot(dx, dy));
  c.state = "walking";
  c.tx = c.x + (dx / d) * 300;
  c.ty = c.y + (dy / d) * 300;
  c.facing = dx < 0 ? -1 : 1;
  collideMove(c, c.x + (dx / d) * walkSpeed(c) * FLEE_HASTE * dt,
                 c.y + (dy / d) * walkSpeed(c) * FLEE_HASTE * dt);
  c.anim += dt * 11;
  return true;
}

// A man with blood up goes for the person, or for the roof over their head.
function feudAI(c) {
  const foe = civs.find(o => o.name === c.feudWith);
  if (!foe) return endFeud(c);
  if (c.state !== "idle") return;
  const home = foe.home && buildings.includes(foe.home) && !foe.home.fire ? foe.home : null;
  // fire is the coward's way and the likelier one when the man is out of reach
  const reachable = !INDOORS.has(foe.state);
  if (reachable && (c.feudLethal || !home || Math.random() < 0.6)) {
    order(c, { kind: "attack", target: foe, x: foe.x, y: foe.y });
  } else if (home) {
    order(c, { kind: "torch", target: home, x: home.x, y: home.y + 14 });
  }
}
// The slow drift: every so often a civilian takes stock of whoever is at hand.
function socialTick(c, dt) {
  c.socT = (c.socT || 2 + Math.random() * 6) - dt;
  if (c.socT > 0) return;
  c.socT = 6 + Math.random() * 8;
  if (c.child || c.rebel) return;
  const near = civs.filter(o => o !== c && !o.child && Math.hypot(o.x - c.x, o.y - c.y) < OP_KNOWN);
  if (!near.length) return;
  const o = near[Math.floor(Math.random() * near.length)];

  // A falling-out between two particular people, owing nothing to how the colony
  // is run. Without this a quarrel could only ever break out somewhere already
  // collapsing into rebellion, which made the whole thing invisible in a colony
  // worth playing — people fall out over nothing in the best-run places.
  if (Math.random() < 0.035) {
    const over = GRIEVANCES[Math.floor(Math.random() * GRIEVANCES.length)];
    // bad blood compounds: a quarrel between two who already dislike each
    // other cuts deeper than one between friends
    const bitter = opinionOf(c, o) < -25 ? 1.5 : 1;
    nudgeOpinion(c, o, -(14 + Math.random() * 12) * bitter);
    nudgeOpinion(o, c, -(4 + Math.random() * 8) * bitter);
    if (opinionOf(c, o) < -35 && Math.random() < 0.5)
      toast(`${c.name} and ${o.name} have words ${over}.`);
    return;
  }

  let by = 0;
  // living well together mends fences; misery looks for someone to blame
  by += c.happiness > 60 ? 3 : c.happiness < 30 ? -1.5 : 0;
  // and goodwill does not simply wash a real grudge away
  if (by > 0 && opinionOf(c, o) < -15) by *= 0.15;
  if (c.home && c.home === o.home) {
    const crowded = c.home.occupants.length >= cabinCapacity();
    by += crowded ? -1 : 4;                       // a shared roof is a friend or a grievance
  }
  if (o.rebel) by -= 3;                           // nobody loves a man who turned on the colony
  if (c.hunger < 30 && (o.inv.bread > 0 || o.inv.meat > 0)) by -= 2;   // he eats while I starve
  if (isForce(o) && laws.forced) by -= 2;         // the man who enforces the edict
  if (c.sick > 0 && !o.sick) by -= 1;
  nudgeOpinion(c, o, by);
}
function updateFeuds(dt) {
  for (const c of civs) {
    if (!c.feudWith) continue;
    c.feudT -= dt;
    const foe = civs.find(o => o.name === c.feudWith);
    if (!foe) { endFeud(c); continue; }
    if (c.feudT <= 0) { endFeud(c, true); nudgeOpinion(c, foe, 45); continue; }   // it burns itself out
    // Once a man is properly beaten, is that satisfaction or is it not enough?
    // Decide it ONCE and hold to it. Rolled fresh every frame — as this was — a
    // three-in-four chance of stopping becomes a certainty within a few frames,
    // and nobody was ever killed at all: forty feuds run to the end, forty
    // beatings, no graves. The same mistake as a per-frame rebellion roll.
    if (foe.hp <= BEATEN && c.feudLethal === undefined) {
      c.feudLethal = Math.random() < 0.3;
      if (!c.feudLethal) {
        endFeud(c);
        nudgeOpinion(c, foe, 55);
        toast(`${foe.name} is beaten bloody. ${c.name} considers the matter settled.`);
      } else {
        toast(`⚠ ${c.name} is not finished with ${foe.name}.`);
      }
    }
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
    const prey = civs.filter(o => o !== c && !o.rebel && !INDOORS.has(o.state));
    if (prey.length) {
      const p = prey[Math.floor(Math.random() * prey.length)];
      order(c, { kind: "attack", target: p, x: p.x, y: p.y });
    }
  }
}

function forceAI(c) {
  if (c.state !== "idle") return;
  // arm up from the armoury once Defending is known (line infantry bring their own gun)
  if (c.profession !== "musketeer" && !c.armed && has("defending") && forgeBuilt() && res.weapons > 0) {
    res.weapons--; c.armed = true;
    toast(`${c.name} takes a weapon at the forge.`);
  }
  // a posted soldier watches from where he was told to stand — threats are
  // measured from the post, and he neither buries the dead nor walks the beat
  const post = c.post;
  const range = post ? 380 : 450 + (has("guarddogs") ? 250 : 0);
  const fx = post ? post.x : c.x, fy = post ? post.y : c.y;
  let best = null, bd = range;
  for (const r of civs) if (r.rebel) {
    const d = Math.hypot(r.x - fx, r.y - fy);
    if (d < bd) { bd = d; best = r; }
  }
  for (const r of raiders) {
    const d = Math.hypot(r.x - fx, r.y - fy);
    if (d < bd) { bd = d; best = r; }
  }
  if (best) { order(c, { kind: "attack", target: best, x: best.x, y: best.y }); return; }
  // Before anything quieter: a constable near a quarrel goes and takes the man
  // who started it. This is the law's business and not a fight — he is seized,
  // not fought, and walked to the lock-up.
  // A quarrel carries. A constable answers one anywhere in the settlement, not
  // only inside his own eyeline — feuds are over in seconds, so a beat range
  // meant the law arrived after the funeral and never made a single arrest.
  if (c.profession === "police" && jails().length) {
    let culprit = null, cd = post ? range : 1600;
    for (const o of civs) {
      if (!o.feudWith || isJailed(o) || o === c) continue;
      const d = Math.hypot(o.x - fx, o.y - fy);
      if (d < cd) { cd = d; culprit = o; }
    }
    if (culprit) { order(c, { kind: "arrest", target: culprit, x: culprit.x, y: culprit.y }); return; }
  }
  if (post) {
    if (Math.hypot(post.x - c.x, post.y - c.y) > 26) order(c, { kind: "walk", x: post.x, y: post.y });
    return;
  }
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
  // Nothing near at hand — but a raid on ANY of your towns is the army's business.
  // Whoever is not standing a post marches, however far the trouble is.
  const call = raidAlarm(c.x, c.y);
  if (call) {
    if (alarmToldT <= 0) {
      alarmToldT = 12;
      const where = townAt(call.x, call.y);
      toast(`⚔ ${where ? where.name : settlementName || "The colony"} is under attack — the army marches!`);
    }
    order(c, { kind: "attack", target: call, x: call.x, y: call.y });
    return;
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
// The nearest raider actually at your roofs, anywhere in the empire. A garrison
// holding its own town is not the alarm — this is for bands come to burn and rob.
let alarmToldT = 0;
function raidAlarm(fromX, fromY) {
  let best = null, bd = Infinity;
  for (const r of raiders) {
    if (r.garrison || r.state === "patrol" || r.state === "flee") continue;
    const t = r.wallTarget || r.target;
    if (!t || !buildings.includes(t)) continue;          // only those set on your buildings
    const d = fromX === undefined ? 0 : Math.hypot(r.x - fromX, r.y - fromY);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// --- torching / fire ---
function igniteCheck(b, dt) {
  if (!b.fire) return;
  b.fire -= dt;
  if (b.fire <= 0) {
    b.fire = 0;
    for (const o of b.occupants) {
      o.home = null;
      if (INDOORS.has(o.state)) { o.state = "idle"; o.x = b.x + (Math.random() * 40 - 20); o.y = b.y + 24; }
    }
    b.occupants = [];
    emptyShelter(b, "the roof is burning");
    ruin(b, "burned to a charred ruin");
    if (selectedBldg === b) selectedBldg = null;
    syncUI();
  }
}

// --- visitors & dialogue ---
function spawnVisitor() {
  // every recruiting house draws its own wanderers — a settlement that builds one
  // is no longer passed over in favour of the capital
  const centers = buildings.filter(b => b.type === "recruit" && !b.fire && !b.site);
  if (!centers.length) return;
  const center = centers[Math.floor(Math.random() * centers.length)];
  const a = Math.random() * Math.PI * 2;
  const gender = Math.random() < 0.35 ? "f" : "m";
  visitors.push({
    id: ++visitorSeq, name: nextName(gender), gender,
    face: gender === "f" ? "hunter_face_c" : (Math.random() < 0.5 ? "hunter_face_a" : "hunter_face_b"),
    x: center.x + Math.cos(a) * 700, y: center.y + Math.sin(a) * 700,
    tx: center.x + 60, ty: center.y + 20,
    state: "walking", anim: 0, facing: 1, waitT: 75, meter: null, leaving: false, used: new Set(),
  });
  const ctown = townAt(center.x, center.y);
  toast(`A wanderer approaches the recruitment center${ctown ? " at " + ctown.name : ""}. Click them to talk.`);
}

function updateVisitor(v, dt) {
  if (v.state === "walking") {
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 5) {
      if (v.leaving) { visitors.splice(visitors.indexOf(v), 1); usedNames.delete(v.name); return; }
      v.state = "waiting";
    } else {
      v.x += (dx / d) * BASE_WALK * 0.8 * snowPace() * dt; v.y += (dy / d) * BASE_WALK * 0.8 * snowPace() * dt;
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
  // Graded, not a switch. As a straight +15/-14 this line swung twenty-nine
  // points on a single step of the tax dial, so a colony at tax 3 both lost its
  // best card and carried a landmine — recruiting at tax 3 came out harder than
  // recruiting with no bed to offer, which is nonsense.
  { text: "\"Our taxes are fair. A man keeps what he earns here.\"", d: 0,
    dyn: () => (taxRate <= 2 ? +15 : taxRate === 3 ? +4 : taxRate === 4 ? -6 : -16) },
  { text: "\"The forest here is rich with game. A hunter would eat well.\"", d: +10 },
  // ===== the two ways to lose a wanderer =====
  // The talk could not be lost. Two hundred of them played through with the
  // options picked at random ended two hundred to nil: the meter opens at 48,
  // the pool holds fifty-nine points of goodwill against twenty-eight of
  // offence, and nothing that shrinking pool can deal you reaches zero. The
  // tutorial has always promised that pressing too hard sends them back into
  // the trees, and it simply never happened.
  // A threat is now nearly fatal on its own — which is what it should be, said
  // to an armed free man standing outside your gate — and following it with
  // contempt for his labour finishes it. Both are plainly the wrong thing to
  // say, so a player who reads them will never see the inside of this rule.
  { text: "\"Join us or starve alone out there. Your choice.\"", d: -45 },
  { text: "\"We could use another back to break for the colony.\"", d: -16 },
  { text: "Say nothing and slide a Deutsche Mark under the slot. (5 DM)", d: +9, needs: () => res.dm >= 5, use: () => res.dm -= 5 },
  { text: "\"Winter is coming. Alone, it will bury you.\"", d: +8 },
  { text: "\"We have a market — your pelts would fetch real coin.\"", d: 0, dyn: () => buildings.some(b => b.type === "market") ? +13 : -10 },
];

function openTalk(talk) {
  dlg.open = true; dlg.talk = talk; paused = true;
  talk.lines = 0;                    // how much of their patience has been spent
  $("dlgFace").src = `assets/sprites/ui/${talk.face}.png`;
  $("dlgName").textContent = talk.title;
  $("dlgText").textContent = talk.opening;
  $("dialogue").style.display = "block";
  renderDialogueOptions();
}
// ===== what a stranger can see from the gate =====
// The opening meter was the tax rate and nothing else, which made recruiting a
// formality at tax 2 and near-impossible at tax 5 — a cliff, and one the rest
// of the colony had no say in. Played out four thousand times, a player picking
// the best of the three lines on offer won every single talk.
//
// A wanderer at the window can see rather more than the tithe: whether there is
// a roof going spare, whether the larder is full, how the people already inside
// carry themselves. Recruiting is now the reward for running the place well
// rather than for clicking well.
function gateStanding() {
  let m = 34;
  m += taxRate <= 2 ? 8 : taxRate <= 4 ? 0 : -16;
  const larder = (res.bread || 0) + (res.meat || 0);
  m += larder >= 25 ? 8 : larder >= 8 ? 3 : -9;
  m += freeHome() ? 6 : -18;        // nowhere to sleep is the loudest thing about a place
  const mood = civs.length ? civs.reduce((s, c) => s + c.happiness, 0) / civs.length : 60;
  m += mood >= 70 ? 8 : mood >= 45 ? 0 : -9;
  return Math.max(6, Math.min(70, m));
}
function openDialogue(v) {
  tutSeen.talked = true;   // they have met a wanderer, whether or not they keep them
  dlg.visitor = v;
  if (v.meter === null) v.meter = gateStanding() + (v.goodwill || 0);
  openTalk({
    face: v.face,
    title: `${v.name}, wandering ${v.gender === "f" ? "huntress" : "hunter"}`,
    opening: freeHome()
      ? "The hunter eyes the barred window and the little slot beneath it. \"So. What is this place, then?\""
      : "The hunter counts your cabins through the palings, and every chimney has smoke. \"No bed spare, by the look of it. Talk fast.\"",
    pool: DLG_OPTIONS,
    used: v.used,
    // A man at a gate does not stand through nine sales pitches. Four lines and
    // he makes up his mind — which is also what stops a player grinding down a
    // twelve-option pool until something sticks.
    patience: 4,
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
  const winAt = talk.winAt || 100, passAt = talk.passAt || 60;
  const pool = talk.pool.filter(o => !talk.used.has(o.text) && (!o.needs || o.needs()));
  if (!pool.length || (talk.patience && talk.lines >= talk.patience))
    return talk.meter >= passAt ? talk.onWin() : talk.onLose();
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  for (const o of picks) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = o.text;
    b.addEventListener("click", () => {
      talk.used.add(o.text);
      talk.lines++;
      if (o.use) o.use();
      const delta = (o.dyn ? o.dyn() : o.d) + (Math.random() * 6 - 3);
      talk.meter = Math.max(0, Math.min(100, talk.meter + delta));
      $("dlgMeter").style.width = talk.meter + "%";
      if (talk.meter >= winAt) return talk.onWin();
      if (talk.meter <= 0) return talk.onLose();
      const left = talk.patience ? talk.patience - talk.lines : 99;
      $("dlgText").textContent =
        (delta >= 8 ? "A slow nod. You are getting through." :
         delta >= 0 ? "A grunt, noncommittal. But the door stays open." :
         "Eyes narrow. That was the wrong thing to say.") +
        (left === 1 ? " He is half turned to go — one more word is all you get." : "");
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
  const housed = houseCiv(c, v.x, v.y);
  vignette("firstRecruit");
  tally.arrived++;
  tell("life", `${v.name} signs on — a civilian certificate slides out through the slot. ` +
        (housed ? `${v.gender === "f" ? "She" : "He"} moves into a cabin and will pay taxes.` : `Build ${v.gender === "f" ? "her" : "him"} a cabin: no taxes until there is a roof.`));
  syncUI();
}
function rejectColony(v) { closeDialogue(); sendAway(v, `${v.name} shakes his head and returns to his hunting grounds.`); }

// --- tech research ---
function techAvailable(t) { return !t.done && t.req.every(r => TECH[r].done) && (!research || research.id !== t.id); }
// which menu entries hide until their technology is researched
const BUILD_GATES = { forge: "forging", townhall: "township", wall: "defending", gate: "defending", jail: "policing",
                      stonewall: "defplus", stonegate: "defplus", moat: "defplus", ditch: "defplus" };
const PROF_GATES = { lumberjack: "township", quarryman: "township", forager: "township",
                     police: "policing", blacksmith: "forging", soldier: "raiding",
                     musketeer: "matchlock", cavalry: "cavalry" };
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
    tell("work", `Research complete: ${t.name} — ${t.desc}.`);
    research = null;
    if (TECH.slavery.done) $("lawForcedRow").style.display = "flex";
    if ((t.id === "defending" || t.id === "raiding") && camps.length === 0) {
      spawnCamps(1);
      tell("work", `Research complete: ${t.name}. Word spreads of your colony's strength — thief and raid camps stir in the deep woods.`);
    }
    renderTech(); syncUI();
  }
}
const NODE_W = 118, NODE_H = 42, COL_W = 148, ROW_H = 62;
function renderTech() {
  const list = $("techList");
  const q = ($("techSearch").value || "").trim().toLowerCase();
  // the tree stays lean: only what is researched or ready to be taken up next is
  // drawn. Deeper techs stay out of sight until their parents are done — or are
  // searched for by name.
  const frontier = t => !t.done && t.req.every(r => TECH[r].done);
  const nodes = Object.values(TECH).filter(t => t.tree === techTab)
    .filter(t => q ? (t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))
                   : (t.done || frontier(t)));
  if (!nodes.length) {
    list.innerHTML = '<div style="padding:10px;color:#5a6b60;font-size:11px">Nothing here matches.</div>';
    return;
  }
  // layered layout: column = depth, row = order within depth (parents pull children toward them)
  const byDepth = new Map();
  for (const t of nodes) {
    if (!byDepth.has(t.depth)) byDepth.set(t.depth, []);
    byDepth.get(t.depth).push(t);
  }
  const pos = new Map();
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const colOf = new Map(depths.map((d, i) => [d, i]));   // filtered-out columns close ranks
  for (const d of depths) {
    const col = byDepth.get(d);
    col.sort((a, b) => {
      const key = t => {
        const ps = t.req.map(r => pos.get(r)).filter(Boolean);
        return ps.length ? ps.reduce((s, p) => s + p.row, 0) / ps.length : 99;
      };
      return key(a) - key(b);
    });
    col.forEach((t, i) => pos.set(t.id, { col: colOf.get(d), row: i }));
  }
  const maxRow = Math.max(...[...pos.values()].map(p => p.row));
  const W = depths.length * COL_W + 30, H = (maxRow + 1) * ROW_H + 30;
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
function townOf(b) { return nearerTown(b.x, b.y, 500); }
// Goods belong to the storehouse they are set down in, not to whichever roof the
// carrier sleeps under — hand a crate over in the capital and the capital keeps it.
function ledgerOf(c) { return ledgerAt(c.x, c.y); }
function sendToTown(c, target) {   // target: settlement object, or null for the capital
  const cab = buildings.find(b => b.type === "cabin" && !b.fire && !b.site &&
                                  b.occupants.length < cabinCapacity() &&
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
      const dled = ledgerOf(selected);
      if ((dled.logs || 0) < doorCost()) return toast(`A door takes ${doorCost()} logs in storage. Stored: ${dled.logs || 0}.`);
      dled.logs -= doorCost();
      order(selected, { kind: "craft", x: selected.x, y: selected.y });
      toast(`${selected.name} starts hewing a door.`);
    }
  }));
// the whole recruiting rite for any civilian — used by the selected-civilian
// menu and by the MILITARY panel's roster. The parameter shadows the global
// `selected` on purpose so the rite reads the recruit, not the selection.
function recruitAs(selected, prof) {
    if (!selected) return;
    if (selected.child) return toast(`${selected.name} is a child — give them a few more springs.`);
    // A man who takes another trade puts the stretcher down. Without this the
    // patient stayed "borne" for good — carried about by a blacksmith, never
    // laid in a bed, never able to be picked up by anyone else.
    if (selected.bearing && prof !== "doctor") {
      const p = selected.bearing;
      selected.bearing = null; p.bearer = null;
      if (p.state === "borne") p.state = "idle";
      toast(`${selected.name} sets ${p.name} down.`);
    }
    if (prof === "police") {
      if (!has("policing")) return toast("Recruiting police requires the Policing technology.");
      if (res.dm - POLICE_COST < treasuryFloor()) return toast(`An officer costs ${POLICE_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may join the police.");
      if (selected.profession === "police") return toast(`${selected.name} already serves.`);
      res.dm -= POLICE_COST;
      selected.profession = "police";
      selected.maxHp = 100 + (has("petarmour") ? 25 : 0) + (has("cavalry") ? 50 : 0);
      toast(`${selected.name} joins the police force of the colony.`);
    } else if (prof === "soldier") {
      if (!has("raiding")) return toast("Soldiers require the Raiding technology.");
      if (res.dm - SOLDIER_COST < treasuryFloor()) return toast(`A soldier costs ${SOLDIER_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may soldier.");
      if (selected.profession === "soldier") return toast(`${selected.name} already soldiers for the colony.`);
      res.dm -= SOLDIER_COST;
      selected.profession = "soldier";
      selected.maxHp = 130 + (has("cavalry") ? 50 : 0);
      selected.hp = Math.min(selected.hp + 30, selected.maxHp);
      toast(`${selected.name} takes the colony's coin as a soldier. Click a camp to send them raiding.`);
    } else if (prof === "musketeer") {
      if (!has("matchlock")) return toast("Line Infantry require the Matchlock Muskets technology.");
      if (res.dm - MUSKET_COST < treasuryFloor()) return toast(`A line infantryman costs ${MUSKET_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may shoulder a musket.");
      if (selected.profession === "musketeer") return toast(`${selected.name} already carries a musket.`);
      res.dm -= MUSKET_COST;
      selected.profession = "musketeer";
      selected.loaded = true; selected.reloadT = 0; selected.fireT = 0;
      selected.maxHp = 90 + (has("cavalry") ? 50 : 0);
      toast(`${selected.name} shoulders a ${has("flintlock") ? "flintlock" : "matchlock"} musket for the colony` +
            (has("bayonets") ? ", bayonet fixed." : ". Slow to load — keep them behind the walls."));
    } else if (prof === "cavalry") {
      if (!has("cavalry")) return toast("Cavalry requires the Cavalry technology (through War Horse).");
      if (res.dm - CAV_COST < treasuryFloor()) return toast(`A cavalry mount and rider cost ${CAV_COST} DM. Treasury: ${res.dm} DM.`);
      if (!selected.home) return toast("Only housed civilians may ride for the colony.");
      if (selected.profession === "cavalry") return toast(`${selected.name} already rides for the colony.`);
      res.dm -= CAV_COST;
      selected.profession = "cavalry";
      selected.maxHp = 160 + (has("hussars") ? 40 : 0);
      selected.hp = Math.min(selected.hp + 40, selected.maxHp);
      toast(`${selected.name} mounts up as cavalry${has("lances") ? " — lance in hand" : ""}. Fast, hard-hitting, and fearless.`);
    } else if (prof === "doctor") {
      // No technology gates the trade — a hospital does. There is no such thing
      // as a doctor with nowhere to carry anyone.
      if (!hospitals().length) return toast("Raise a Hospital first — a doctor needs somewhere to carry the sick.");
      if (res.dm - DOCTOR_COST < treasuryFloor()) return toast(`A doctor costs ${DOCTOR_COST} DM. Treasury: ${res.dm} DM.`);
      if (selected.profession === "doctor") return toast(`${selected.name} already keeps the ward.`);
      res.dm -= DOCTOR_COST;
      selected.profession = "doctor";
      toast(`${selected.name} takes the beak and the cane. They will fetch the sick to the hospital on their own.`);
    } else if (prof === "blacksmith") {
      if (!has("forging")) return toast("Blacksmiths require the Forging technology.");
      selected.profession = "blacksmith";
      toast(`${selected.name} takes up the hammer as blacksmith.`);
    } else if (prof === "hunter") {
      selected.profession = "hunter";
      toast(`${selected.name} takes up the hunter's life.`);
    } else if (prof === "lumberjack" || prof === "quarryman" || prof === "forager") {
      if (!has("township")) return toast("Organized town jobs require the Township technology.");
      selected.profession = prof;
      toast(`${selected.name} takes up the ${prof}'s work. They will keep at it on their own.`);
    } else {
      selected.profession = "farmer";
      toast(`${selected.name} takes up farming. Assign them to a farm by clicking it.`);
    }
    refreshAvatar(selected);
    syncUI();
}
document.querySelectorAll("#recruitMenu .menu-item").forEach(item =>
  item.addEventListener("click", () => { $("recruitDrop").classList.remove("open"); recruitAs(selected, item.dataset.prof); }));
document.addEventListener("click", e => {
  for (const id of ["buildDrop", "craftDrop", "recruitDrop", "civDrop"])
    if ($(id) && !$(id).contains(e.target)) $(id).classList.remove("open");
});

// The government panel is the government of whichever town you are standing over
// — its title has always said so, and its ledger has always shown that town's
// stores. Only the rename box disagreed, and proclaimed the capital's name
// wherever you were standing. It renames what the panel says it is renaming now.
function govTown() {
  return townAt(cam.x + canvas.width / 2 / zoom, cam.y + canvas.height / 2 / zoom);
}
$("renameBtn").addEventListener("click", () => {
  const v = $("renameInput").value.trim();
  if (!v) return toast("A settlement needs a name.");
  const t = govTown();
  const was = t ? t.name : settlementName;
  if (t) t.name = v; else settlementName = v;
  $("renameInput").value = "";
  toast(`${was} is proclaimed anew: ${v}.`);
  renderMap(); syncUI();
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
                           ["setFloaters","floaters"],["setLabels","labels"],["setSmoke","smoke"],["setNight","night"],
                           ["setEdgePan","edgePan"],["setHints","hints"]])
    $(id).checked = settings[key];
  $("settingsPanel").style.display = "block";
}
$("pmSettings").addEventListener("click", openSettings);
$("menuSettings").addEventListener("click", openSettings);
function openHelp() { $("helpPanel").style.display = "block"; }
$("helpClose").addEventListener("click", () => { $("helpPanel").style.display = "none"; });
$("pmHelp").addEventListener("click", openHelp);
$("menuHelp").addEventListener("click", openHelp);
$("setClose").addEventListener("click", () => { $("settingsPanel").style.display = "none"; saveSettings(); });
$("setMaster").addEventListener("input", e => { settings.master = e.target.value / 100; SFX.setMaster(settings.master); saveSettings(); });
$("setCam").addEventListener("input", e => { settings.camSpeed = e.target.value / 100; saveSettings(); });
for (const [id, key] of [["setMusic","music"],["setBattle","battle"],["setSfx","sfx"],["setAmbient","ambient"],
                         ["setFloaters","floaters"],["setLabels","labels"],["setSmoke","smoke"],["setNight","night"],
                         ["setEdgePan","edgePan"],["setHints","hints"]])
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
  saveTrimmed = false;
  const ok = saveGame();
  toast(!ok ? "⚠ The save failed — this browser will not take the ledger. Try clearing site data for other games." :
        saveTrimmed ? `Game saved (${lastSaveKB} KB). Room was short, so the record of felled trees was let go — the colony itself is safe.` :
        `The colony ledger is written. Game saved (${lastSaveKB} KB).`);
});
// Branch a colony: copy this moment into a free slot and go on playing there,
// leaving the old slot exactly as it was. The way to keep a winter you are
// proud of while trying something reckless.
$("pmSaveAs").addEventListener("click", () => {
  const free = firstFreeSlot();
  if (!free) return toast(`All ${SAVE_SLOTS} slots are full. Return to the main menu to burn one.`);
  useSlot(free);
  saveTrimmed = false;
  const ok = saveGame();
  syncUI();
  toast(ok ? `Copied into slot ${free}. You are playing that one now — the other is untouched.`
           : "⚠ The save failed — this browser will not take another ledger.");
});
$("pmReign").addEventListener("click", openReckoning);
$("pmMenu").addEventListener("click", () => { saveGame(); location.reload(); });
// on a phone the panels are bottom sheets sharing one patch of glass: only one at a time
const NARROW = () => innerWidth <= 820 || (matchMedia("(pointer: coarse)").matches && innerWidth <= 1100);
$("govToggle").addEventListener("click", () => {
  const p = $("govPanel");
  const opening = p.style.display !== "block";
  p.style.display = opening ? "block" : "none";
  if (opening) tutSeen.gov = true;
  if (opening && NARROW()) {
    selected = null; selectedBldg = null; selectedCamp = null; selectedGrave = null; selGroup = [];
    $("civPanel").style.display = "none"; $("bldgPanel").style.display = "none";
    $("techPanel").style.display = "none";
    syncUI();
  }
});
$("taxSlider").addEventListener("input", e => { taxRate = +e.target.value; $("taxVal").textContent = taxRate; syncUI(); });
$("lawCivWeapons").addEventListener("change", e => { laws.civWeapons = e.target.checked; });
$("lawHunterWeapons").addEventListener("change", e => { laws.hunterWeapons = e.target.checked; });
$("lawFreeRoam").addEventListener("change", e => {
  laws.freeRoam = e.target.checked;
  toast(laws.freeRoam ? "The borders are opened: civilians may roam the deep woods on their own." :
                        "Civilians are ordered to keep close to the town borders.");
});
$("lawCivBuild").addEventListener("change", e => {
  laws.civBuild = e.target.checked;
  toast(laws.civBuild ? "Civilians may break ground themselves — farms will rise from the town stores unbidden." :
                        "Building is the government's business alone. Civilians will raise only what you order.");
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
  if (opening) tutSeen.tech = true;
  $("techToggle").textContent = opening ? "Close Tech Tree" : "Open Tech Tree";
  renderTech();
});
$("techClose").addEventListener("click", () => { $("techPanel").style.display = "none"; $("techToggle").textContent = "Open Tech Tree"; });
$("techSearch").addEventListener("input", renderTech);
$("civSearch").addEventListener("input", () => syncUI());
$("settleSearch").addEventListener("input", () => {
  const q = ($("settleSearch").value || "").trim().toLowerCase();
  for (const row of $("settleList").children)
    row.style.display = !q || row.textContent.toLowerCase().includes(q) ? "" : "none";
});
$("tabGrowth").addEventListener("click", () => { techTab = "growth"; $("tabGrowth").classList.add("active"); $("tabMilitary").classList.remove("active"); renderTech(); });
$("tabMilitary").addEventListener("click", () => { techTab = "military"; $("tabMilitary").classList.add("active"); $("tabGrowth").classList.remove("active"); renderTech(); });

// Like the heal order, this is given to whoever is picked: one man alone, or a
// whole company that has just come back loaded.
$("cpDeposit").addEventListener("click", () => {
  if (!selected) return;
  const band = soldierGroup();
  let moved = 0;
  for (const c of band) {
    const inv = c.inv, led = ledgerOf(c);
    moved += inv.logs + inv.seeds + inv.stone + inv.iron + inv.wheat + inv.bread + inv.meat;
    led.logs += inv.logs; led.seeds += inv.seeds; led.stone += inv.stone; led.iron += inv.iron;
    led.wheat += inv.wheat; led.bread += inv.bread; led.meat += inv.meat;
    inv.logs = inv.seeds = inv.stone = inv.iron = inv.wheat = inv.bread = inv.meat = 0;
  }
  const town = selected.home && townOf(selected.home);
  const who = band.length > 1 ? `${band.length} hand` : `${selected.name} hands`;
  toast(moved ? `${who} ${moved} item(s) to ${town ? town.name + "'s" : "the town"} storage.`
              : (band.length > 1 ? "They are carrying nothing to hand over." : `${selected.name} has nothing to hand over.`));
  syncUI();
});
// An order given to a picked army is given to the army: a company that has just
// come off a camp does not want its wounds mended one man at a time.
$("cpHeal").addEventListener("click", () => {
  if (!selected) return;
  const grp = soldierGroup();
  const band = grp.length > 1 ? grp : [selected];
  const hurt = band.filter(c => (c.hp < c.maxHp || isSick(c)) && c.state !== "abed");
  if (!hurt.length)
    return toast(band.length > 1 ? "They are all hale and whole." : `${selected.name} is already hale and whole.`);
  if (!hospitals().length)
    return toast("There is no hospital to carry them to — raise one (25 logs, 8 stone, 14 DM) and recruit a doctor.");
  // Beds are the constraint now, not bread. Whoever finds one walks there and
  // lies down; the rest are told plainly that they are waiting on a bed.
  let sent = 0, nobed = 0;
  for (const c of hurt) {
    const b = nearestWard(c.x, c.y, true);
    if (!b) { nobed++; continue; }
    if (c.bearer) { c.bearer.bearing = null; c.bearer = null; }
    order(c, { kind: "hospital", target: b, x: b.x, y: b.y + 22 });
    sent++;
  }
  if (!sent) return toast(`Every bed is full — ${HOSP_BEDS} to a hospital. Raise another, or wait for one to be discharged.`);
  toast(sent > 1
    ? `${sent} make for the hospital.${nobed ? ` ${nobed} wait — no bed free.` : ""}`
    : `${hurt[0].name} makes for the hospital.`);
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
// ===== the skill tree, one man at a time =====
// The tech panel is what the colony knows and never changes hands; this is what
// THIS pair of hands has learned, and it walks out of the gate with them.
let skillCiv = null;
function openSkills(c) {
  if (!c) return;
  skillCiv = c;
  $("skillPanel").style.display = "block";
  $("skTree").dataset.sig = "";   // a fresh open always paints, whatever was left behind
  SFX.popup();
  syncSkills();
}
function closeSkills() { skillCiv = null; $("skillPanel").style.display = "none"; }
function syncSkills() {
  if ($("skillPanel").style.display !== "block") return;
  const c = skillCiv;
  if (!c || !civs.includes(c)) return closeSkills();
  $("skName").textContent = c.name.toUpperCase() + " — SKILLS";
  const total = SKILLS.reduce((n, s) => n + skillLvl(c, s.id), 0);
  $("skSub").textContent =
    `${c.child ? "child" : profLabel(c.profession)}, ${c.age !== undefined ? c.age : "?"} yrs` +
    ` · ${total} levels in all of ${SKILLS.length * SKILL_MAX} · treasury ${Math.round(res.dm)} DM`;

  // Rebuild only when there is something new to show. syncUI runs four times a
  // second, and tearing the whole tree down that often is not just waste: a
  // button the player is pressing is destroyed under their finger, so the click
  // lands on nothing and the training silently fails. Hover and focus died with
  // it too. The signature is everything the tree actually draws.
  const sig = c.name + "|" + Math.round(res.dm) + "|" +
              SKILLS.map(s => skillLvl(c, s.id) + ":" + Math.floor((c.sx && c.sx[s.id]) || 0)).join(",");
  const tree = $("skTree");
  if (tree.dataset.sig === sig) return;
  tree.dataset.sig = sig;
  tree.innerHTML = "";
  for (const branch of SKILL_BRANCHES) {
    const col = document.createElement("div");
    col.style.cssText = "flex:1 1 200px;min-width:190px;border:1px solid #24352b;background:#0f1713;padding:8px";
    const head = document.createElement("div");
    head.style.cssText = "font-size:11px;color:#7da083;letter-spacing:2px;margin-bottom:6px";
    head.textContent = branch.toUpperCase();
    col.appendChild(head);

    for (const sk of SKILLS.filter(s => s.branch === branch)) {
      const lvl = skillLvl(c, sk.id);
      const maxed = lvl >= SKILL_MAX;
      const cost = trainCost(lvl);
      const xp = (c.sx && c.sx[sk.id]) || 0;
      const need = skillXpNeeded(lvl);

      const row = document.createElement("div");
      row.style.cssText = "border:1px solid " + (maxed ? "#7da083" : "#24352b") + ";padding:6px;margin-bottom:6px";
      const title = document.createElement("div");
      title.style.cssText = "display:flex;justify-content:space-between;font-size:11px;color:#cfd8d3";
      title.innerHTML = `<span>${sk.name}</span><b style="color:${maxed ? "#7da083" : "#c9a86a"}">${lvl}</b>`;
      row.appendChild(title);

      const bar = document.createElement("div");
      bar.className = "barwrap"; bar.style.cssText = "height:6px;margin:4px 0";
      const fill = document.createElement("div");
      fill.className = "barfill";
      fill.style.width = (maxed ? 100 : Math.round(100 * Math.min(1, xp / need))) + "%";
      bar.appendChild(fill); row.appendChild(bar);

      const note = document.createElement("div");
      note.style.cssText = "font-size:10px;color:#5a6b60";
      note.textContent = maxed ? sk.desc + " — mastered"
        : `${sk.desc} · ${Math.floor(xp)}/${need} xp`;
      row.appendChild(note);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.style.cssText = "width:100%;margin-top:5px;font-size:10px;padding:4px";
      btn.textContent = maxed ? "Mastered" : `Train to ${lvl + 1} — ${cost} DM`;
      btn.disabled = maxed || res.dm - cost < treasuryFloor();
      btn.addEventListener("click", () => trainSkill(c, sk.id));
      row.appendChild(btn);
      col.appendChild(row);
    }
    tree.appendChild(col);
  }
}
function trainSkill(c, id) {
  if (!c || !civs.includes(c)) return;
  const lvl = skillLvl(c, id);
  if (lvl >= SKILL_MAX) return toast(`${c.name} has nothing left to learn of it.`);
  const cost = trainCost(lvl);
  if (res.dm - cost < treasuryFloor())
    return toast(`Training costs ${cost} DM. The treasury holds ${Math.round(res.dm)} DM.`);
  res.dm -= cost;
  c.sk[id] = lvl + 1;
  if (c.sx) c.sx[id] = 0;                        // the lesson replaces the practice
  const nm = (SKILLS.find(s => s.id === id) || {}).name || id;
  SFX.coin();
  toast(`${c.name} is trained: ${nm} ${c.sk[id]}.`);
  syncSkills(); syncUI();
}
$("cpSkills").addEventListener("click", () => openSkills(selected));
$("skClose").addEventListener("click", closeSkills);

$("bpTurnOut").addEventListener("click", () => {
  if (!selectedBldg) return;
  const inside = sheltering(selectedBldg);
  if (!inside.length) return;
  for (const c of inside) turnOut(c, true);
  toast(inside.length > 1 ? `${inside.length} come back outside.` : `${inside[0].name} comes back outside.`);
});
$("bpDismantle").addEventListener("click", () => {
  const b = selectedBldg;
  if (!b) return;
  if (farms.includes(b)) {
    farms.splice(farms.indexOf(b), 1);
    ledgerAt(b.x, b.y).logs += 1;
    toast("The farm is dismantled — 1 log recovered.");
  } else {
    if (b.fire) return toast("It is on fire — no one is dismantling that.");
    // refund whatever it was actually built from — a stone wall gives back stone,
    // and a logs-only rule quietly paid nothing at all for anything stone-built
    const built = b.type === "burned" ? { logs: 10 } : (costOf(b.type === "cabin" ? "cabin" : b.type) || { logs: 10 });
    const rate = dismantleRefund();
    const back = {};
    for (const k of ["logs", "stone", "iron", "seeds"])
      if (built[k]) { const n = Math.floor(built[k] * rate); if (n > 0) back[k] = n; }
    const refund = back.logs || 0;
    for (const o of b.occupants) {
      o.home = null;
      if (INDOORS.has(o.state)) { o.state = "idle"; o.y = b.y + 24; }
    }
    emptyShelter(b, "it is being pulled down");
    const dl = ledgerAt(b.x, b.y);
    buildings.splice(buildings.indexOf(b), 1);
    for (const k in back) dl[k] = (dl[k] || 0) + back[k];
    const parts = Object.entries(back).map(([k, n]) => `${n} ${k}`);
    toast(parts.length ? `Dismantled — ${parts.join(", ")} recovered.` : "Dismantled — nothing worth keeping.");
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
// ===== what is worth writing down about a crown =====
// The save wrote all eleven war fields for all thirty-three nations whether or
// not anything had ever happened to them. On a fresh colony that is three
// hundred and sixty-three values, every one of them a default, and it came to
// two thirds of the entire save file — more than every civilian and every
// building put together. Only what actually befell a crown is written now; the
// rest is filled in from these defaults on the way back. The skills already
// worked this way, and for the same reason.
const WAR_DEFAULTS = { atWar: false, warT: 0, lost: 0, defeated: false, trade: false,
                       mod: 0, calT: 0, hungry: false, revolt: false, refugees: 0 };
function warSave(n) {
  const o = {};
  for (const k of Object.keys(WAR_DEFAULTS)) {
    const v = typeof WAR_DEFAULTS[k] === "boolean" ? !!n[k] : r1(n[k] || 0);
    if (v !== WAR_DEFAULTS[k]) o[k] = v;
  }
  if (n.captured && n.captured.length) o.captured = n.captured;
  if (n.calName) o.calName = n.calName;
  return Object.keys(o).length ? o : null;
}
// A crown left at war in memory must not stay at war through a load that never
// mentions it — silence in the save means peace, not "leave it as you found it".
function warsReset() {
  for (const n of Object.values(NATIONS)) {
    Object.assign(n, WAR_DEFAULTS);
    n.captured = []; n.calName = undefined;
  }
}

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

// A new town is raised on empty ground, not inside somebody else's kingdom and
// certainly not in the sea: find the nearest unclaimed cell to plant its flag on.
function freeMapCell() {
  if (!mapGrid) buildMapGrid();
  const ownerAt = (mx, my) => {
    const c = mx * 2, r = my * 2;
    if (c < 0 || r < 0 || c >= FW || r >= FH) return "off";
    return FID[fineGrid[r * FW + c]];
  };
  const taken = new Set(settlements.map(s => s.mx + "," + s.my));
  taken.add(EMPIRE_HOME.mx + "," + EMPIRE_HOME.my);
  for (let ring = 2; ring <= 14; ring++) {
    const spots = [];
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const mx = EMPIRE_HOME.mx + dx, my = EMPIRE_HOME.my + dy;
      if (taken.has(mx + "," + my)) continue;
      if (ownerAt(mx, my) !== "wilds") continue;                 // unclaimed land only
      // and elbow room from its neighbours
      if (settlements.some(s => Math.abs(s.mx - mx) <= 1 && Math.abs(s.my - my) <= 1)) continue;
      spots.push({ mx, my });
    }
    if (spots.length) return spots[Math.floor(Math.random() * spots.length)];
  }
  return { mx: EMPIRE_HOME.mx, my: EMPIRE_HOME.my + 1 };          // the woods will have to do
}

function natStrength(n) {
  return Math.max(1, Math.min(10, n.strength + Math.floor(playT / 1800) + (n.mod || 0)));
}

// ===== catastrophe: the seventeenth century is unkind to everyone but you =====
// Europe is not a painted backdrop. Plague, famine, fire and revolt fall on the
// crowns whether you are watching or not, and every one of them changes what that
// nation can do to you — or what you can do to it.
const CALAMITIES = [
  { id: "plague", name: "Plague",
    line: n => `Plague walks the towns of ${n.name}.`,
    sub: "Their strength fails, their caravans stop, and the roads fill with the fleeing",
    hit: 3, years: 480,
    fall: n => { n.trade = false; n.reqCool = 240; n.refugees = 3 + Math.floor(Math.random() * 3); } },
  { id: "famine", name: "Famine",
    line: n => `The harvest fails across ${n.name}.`,
    sub: "Grain is worth more than silver there — and they will pay for it",
    hit: 2, years: 420,
    fall: n => { n.hungry = true; n.refugees = 1 + Math.floor(Math.random() * 3); } },
  { id: "fire", name: "Great Fire",
    line: n => `Fire takes the capital of ${n.name}.`,
    sub: "Whole quarters are ash; it will be years before they rebuild",
    hit: 2, years: 360,
    fall: n => { n.reqCool = 150; } },
  { id: "revolt", name: "Revolt",
    line: n => `The peasantry of ${n.name} rises in revolt.`,
    sub: "Their armies are turned inward, and their borders lie open",
    hit: 4, years: 400,
    fall: n => { n.atWar = false; n.warT = 0; n.revolt = true; } },
  { id: "bankrupt", name: "Bankruptcy",
    line: n => `The treasury of ${n.name} is empty — the crown cannot pay its soldiers.`,
    sub: "Their war parties disband and go home",
    hit: 3, years: 330,
    fall: n => { n.atWar = false; n.warT = 0; for (let i = raiders.length - 1; i >= 0; i--) if (raiders[i].nation === n.id && !raiders[i].garrison) raiders.splice(i, 1); } },
  { id: "succession", name: "Succession",
    line: n => `The king of ${n.name} is dead, and the heir is disputed.`,
    sub: "Old friendships end and old grudges are remembered",
    hit: 1, years: 300,
    fall: n => {
      n.tradeCool = 200; n.trade = false;
      const others = Object.keys(NATIONS).filter(o => o !== n.id && !NATIONS[o].defeated);
      if (others.length && natWars.length < 3) {
        const foe = others[Math.floor(Math.random() * others.length)];
        natWars.push({ a: n.id, b: foe, t: 40 + Math.random() * 30, battles: 0 });
      }
    } },
];
// Those who flee a stricken country have to go somewhere, and your gate is as
// good as any. They arrive as wanderers do — but hungrier, and more of them.
let refugeeT = 30;
function updateRefugees(dt) {
  refugeeT -= dt;
  if (refugeeT > 0) return;
  refugeeT = 45 + Math.random() * 45;
  const from = Object.values(NATIONS).find(n => (n.refugees || 0) > 0 && !n.defeated);
  if (!from) return;
  if (!buildings.some(b => b.type === "recruit" && !b.fire && !b.site)) return;   // nowhere to receive them
  if (visitors.length > 3) return;
  from.refugees--;
  spawnVisitor();
  const v = visitors[visitors.length - 1];
  if (v) {
    v.refugee = from.name;
    toast(`A refugee of ${from.name} comes up the road, carrying what they could. Click them to talk.`);
  }
}
let calamityT = 240;

// ===== the plague does not check your borders =====
// Every crown in Europe can be laid low; there was no reason yours could not be,
// and a colony that watches its neighbours sicken while it never so much as
// coughs is only half a seventeenth century. It comes rarely, it takes a while
// to pass, and it is survivable: the sick work slowly and lose strength, and a
// few of them will not get up again. A well helps, as a well always did.
// ===== the woodpile =====
// A colony in winter burns wood simply to stay alive: one log every thirty
// seconds out of the common store. While the hearths are lit the cabins smoke
// without pause and a roof keeps the frost off whoever is under it. When the
// pile runs out the chimneys go quiet — you can see winter arrive at the
// woodpile before you feel it in the people.
const FUEL_INTERVAL = 30;
let fuelT = FUEL_INTERVAL, hearthsLit = true, fuelWarned = false;
function updateFuel(dt) {
  if (season() !== "winter") { fuelT = FUEL_INTERVAL; hearthsLit = true; fuelWarned = false; return; }
  hearthsLit = res.logs > 0;
  fuelT -= dt;
  if (fuelT > 0) return;
  fuelT = FUEL_INTERVAL;
  if (res.logs > 0) {
    res.logs--;
    fuelWarned = false;
    if (res.logs === 0) toast("❄ The last log goes on the fire.");
    else if (res.logs <= 5) toast(`❄ The woodpile is down to ${res.logs} log${res.logs === 1 ? "" : "s"}.`);
  } else if (!fuelWarned) {
    fuelWarned = true;
    tell("land", "❄ The woodpile is empty — the hearths are cold, and a roof alone will not keep the frost out.");
  }
}

const PLAGUE_MIN = 900, PLAGUE_MAX = 1500;   // 15 to 25 minutes between visitations
const PLAGUE_LEN = 200;                      // how long a stricken man is abed
let plagueT = 600 + Math.random() * 600;     // never in the first minutes of a new colony
let plagueActive = 0;                        // seconds left in the outbreak itself
const isSick = c => (c.sick || 0) > 0;
const wells = () => buildings.filter(b => b.type === "well" && !b.fire && !b.site).length;
function strikePlague() {
  const well = Object.values(civs).filter(c => !c.child);
  if (well.length < 3) return;                       // too few souls to call it an outbreak
  // clean water keeps some of them standing
  const share = Math.max(0.15, 0.42 - wells() * 0.07);
  const n = Math.max(1, Math.round(well.length * share));
  const pool = well.slice().sort(() => Math.random() - 0.5);
  let struck = 0;
  for (const c of pool.slice(0, n)) { c.sick = PLAGUE_LEN * (0.7 + Math.random() * 0.6); struck++; }
  plagueActive = PLAGUE_LEN * 1.4;
  eventCard(`Plague walks your own streets.`, "event_war",
            `${struck} have taken to their beds — they work poorly and sicken. It will pass.`);
  lesson("plague"); lesson("hospital");   // what it is, then what answers it
  tally.plagues++;
  tell("ill", `☠ Plague breaks out in the colony — ${struck} are stricken.`);
}
function updatePlague(dt) {
  if (plagueActive > 0) plagueActive -= dt;
  let anySick = false;
  for (const c of civs) {
    if (!isSick(c)) continue;
    anySick = true;
    c.sick -= dt;
    // it wastes a man slowly; the fed and the housed weather it better
    // Preparation should move the odds, not decide them. At a heavier drain this
    // was binary — the unprepared lost every stricken soul and the prepared lost
    // none, so neither outcome carried any suspense. Half that, and a fed man
    // under a roof usually rises again while a hungry homeless one often does
    // not. Ordering the sick to sit and eat is the lever that saves them.
    // A bed in a hospital stops the wasting outright — updateWards burns the
    // fever out from there. Everyone else takes it standing up.
    if (c.state !== "abed") {
      const care = (c.home ? 0.6 : 1) * (c.hunger > 50 ? 0.7 : 1.2);
      c.hp -= 0.45 * care * dt;
      if (Math.random() < dt * 0.35) float(c.x, c.y - 74, "☠", "#9a8fb0");
      if (c.hp <= 0) { killCiv(c, "was taken by the plague"); continue; }
    }
    if (c.sick <= 0) { c.sick = 0; tell("ill", `${c.name} rises from the sickbed.`); }
  }
  if (!anySick && plagueActive <= 0 && plagueT <= 0) plagueT = PLAGUE_MIN + Math.random() * (PLAGUE_MAX - PLAGUE_MIN);
  plagueT -= dt;
  if (plagueT <= 0 && plagueActive <= 0) {
    plagueT = PLAGUE_MIN + Math.random() * (PLAGUE_MAX - PLAGUE_MIN);
    if (civs.length >= 4) strikePlague();
  }
}
// ===== the hospital =====
// A plague you can only wait out is weather, not a crisis: nothing the player
// does between the first cough and the last grave changes the count of graves.
// The hospital is the answer to it. Raise one, put a doctor in it, and the
// fever-struck are fetched off the street, carried in on a stretcher and
// physicked in a bed: the sickness burns out four times faster under care, the
// wasting stops, and wounds close there too — which is where healing lives now
// that bread has stopped mending men where they stand.
const hospitals = () => buildings.filter(b => b.type === "hospital" && !b.fire && !b.site);
const isDoc = c => c.profession === "doctor";
const abed = b => civs.filter(c => c.state === "abed" && c.ward === b);
// A bed is taken the moment someone sets out for it. Counting only the people
// already lying in one meant a company of eight ordered to the hospital at once
// all saw four beds free, all walked over, and half of them were turned away at
// the door for a bed that had never been theirs.
const boundFor = b => civs.filter(c => c.task &&
                                  ((c.task.kind === "hospital" && c.task.target === b) ||
                                   (c.task.kind === "ward" && c.task.target === b && c.bearing))).length;
const bedsFree = b => HOSP_BEDS - abed(b).length - boundFor(b);
// laid on a stretcher, or already on the way to one on somebody else's orders
const spokenFor = p => p.state === "borne" || p.state === "abed" ||
                       civs.some(d => d !== p && d.bearing === p) ||
                       (p.task && p.task.kind === "hospital");
// Who a doctor comes for: the fevered first, then the badly hurt — but nobody
// is stretchered out of a fight they are still standing in. A man swinging at a
// raider has not asked to be carried off, and taking him off the line mid-melee
// would lose the wall while the ward gained a patient.
const needsBed = c => !c.child && !c.rebel &&
                      c.state !== "fighting" && c.state !== "sieging" &&
                      !(c.task && c.task.kind === "attack") &&
                      (isSick(c) || c.hp < c.maxHp * HURT_ENOUGH);
function nearestWard(x, y, needBed) {
  let best = null, bd = Infinity;
  for (const b of hospitals()) {
    if (needBed && bedsFree(b) <= 0) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
// A patient laid in a bed. Called from the doctor's arrival and from a man who
// walked himself in — both ways in go through here, so both ways out are alike.
function admit(p, b) {
  p.task = null; p.bearer = null;
  p.ward = b; p.state = "abed"; p.wardT = 0;
  p.x = b.x + (Math.random() * 26 - 13); p.y = b.y + 18;
  syncUI();
}
function discharge(p, why) {
  const b = p.ward;
  p.ward = null; p.wardT = 0;
  if (p.state === "abed") {
    p.state = "idle";
    if (b) { p.x = b.x + (Math.random() * 40 - 20); p.y = b.y + 26; }
  }
  if (why) toast(`${p.name} ${why}.`);
  syncUI();
}
// The ward's own hour: it mends, it feeds, and it empties when the roof goes.
let wardWarned = false;
function updateWards(dt) {
  let fedAny = false, starved = false;
  for (const p of civs) {
    if (p.state !== "abed") continue;
    const b = p.ward;
    if (!b || !buildings.includes(b) || b.fire || b.site || b.type !== "hospital") {
      discharge(p, "is turned out of the ruined hospital");
      continue;
    }
    // a doctor at the bedside works faster than an empty ward
    const doc = civs.find(d => isDoc(d) && !isJailed(d) && Math.hypot(d.x - b.x, d.y - b.y) < 90);
    const skill = doc ? armSkill(doc, "physicking") : 1;
    const rate = (doc ? 1 : 0.55) * skill;
    // the sick are fed at the bedside — this is what healing costs now
    p.wardT = (p.wardT || 0) + dt;
    if (p.wardT >= HOSP_MEAL) {
      p.wardT = 0;
      if (p.inv.bread > 0) { p.inv.bread--; eat(p, "bread"); fedAny = true; }
      else if (p.inv.meat > 0) { p.inv.meat--; eat(p, "meat"); fedAny = true; }
      else if (eatFromStores(p)) fedAny = true;
      else starved = true;
    }
    const cared = p.hunger > 30;                 // a ward with nothing to feed them heals badly
    if (isSick(p)) {
      p.sick -= dt * HOSP_CURE * rate * (cared ? 1 : 0.5);
      if (p.sick <= 0) { p.sick = 0; tally.cured++; tell("ill", `☤ ${p.name} is over the fever.`); }
    } else if (p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + HOSP_HEAL * rate * (cared ? 1 : 0.4) * dt);
      if (Math.random() < dt * 0.4) float(p.x, p.y - 70, "+", "#7da083");
    }
    if (doc && Math.random() < dt * 0.5) gainSkill(doc, "physicking", 1);
    if (!isSick(p) && p.hp >= p.maxHp) discharge(p, "is discharged, whole again");
  }
  if (starved && !wardWarned) { wardWarned = true; toast("☤ The hospital has nothing to feed its patients — they mend badly."); }
  if (fedAny) wardWarned = false;
}
// A doctor's round: find the worst case that nobody has claimed, walk to it,
// shoulder the stretcher, and carry them in. He does his own fetching — the
// player never has to drive him.
// A fever is worth knocking on a door for, and worth being got out of bed for.
// The night is ten hours long and an outbreak burns itself out in three, so with
// the doctor asleep and the sick tucked up indoors and out of his reach, a
// plague that broke after dark was slept straight through: it took its toll, the
// ward stood empty all night, and there was nothing whatever the player could do
// about it. Fevers reach through a closed door in both directions now — wounds
// still wait for morning.
const nightCall = p => isSick(p) && !isJailed(p) &&
                       (INDOORS.has(p.state) ? p.state !== "abed" : true);
function doctorAI(c) {
  const roused = (c.state === "sleeping" || c.state === "warming" || c.state === "inside") &&
                 !c.bearing && hospitals().length &&
                 civs.some(p => p !== c && nightCall(p) && needsBed(p) && !spokenFor(p));
  if (roused) { if (c.shelter) turnOut(c, true); c.state = "idle"; c.task = null; }
  if (c.state !== "idle" || isJailed(c) || c.feudWith) return false;
  // already bearing someone: the ward, and nothing else
  if (c.bearing) {
    const p = c.bearing;
    if (!civs.includes(p) || p.state !== "borne") { c.bearing = null; return false; }
    const b = nearestWard(c.x, c.y, true) || nearestWard(c.x, c.y, false);
    if (!b) { p.state = "idle"; p.bearer = null; c.bearing = null; return false; }
    order(c, { kind: "ward", target: b, x: b.x, y: b.y + 22 });
    return true;
  }
  if (!hospitals().length) return false;
  let worst = null, wd = Infinity;
  for (const p of civs) {
    if (p === c || !needsBed(p) || spokenFor(p) || p.rebel) continue;
    if (INDOORS.has(p.state) && !nightCall(p)) continue;      // a scratch may wait for morning
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d > DOCTOR_SIGHT) continue;
    // fever before wounds, then whoever is nearest
    const rank = (isSick(p) ? 0 : 100000) + d;
    if (rank < wd) { wd = rank; worst = p; }
  }
  if (!worst) return false;
  order(c, { kind: "fetch", target: worst, x: worst.x, y: worst.y });
  return true;
}
function updateCalamities(dt) {
  // wounds heal: a crown climbs back toward its old strength as the years pass
  for (const [id, n] of Object.entries(NATIONS)) {
    if (!n.calT) continue;
    n.calT -= dt;
    if (n.calT <= 0) {
      n.calT = 0; n.mod = 0; n.hungry = false; n.revolt = false;
      if (!n.defeated) toast(`${n.name} has recovered from the ${n.calName || "calamity"}.`);
    }
  }
  calamityT -= dt;
  if (calamityT > 0) return;
  calamityT = 300 + Math.random() * 300;
  const open = Object.entries(NATIONS).filter(([, n]) => !n.defeated && !n.calT);
  if (!open.length) return;
  const [id, n] = open[Math.floor(Math.random() * open.length)];
  const cal = CALAMITIES[Math.floor(Math.random() * CALAMITIES.length)];
  n.id = id;
  n.mod = -cal.hit;
  n.calT = cal.years;
  n.calName = cal.name.toLowerCase();
  cal.fall(n);
  // a nation on its knees loses ground to its neighbours
  if (cal.hit >= 3 && n.blobs && n.blobs.length) {
    n.captured = n.captured || [];
    const [bx, by] = n.blobs[0];
    n.captured.push((bx + n.captured.length) + "," + by);
    mapGrid = null;
  }
  eventCard(cal.line(n), "event_war", cal.sub);
  mapInfoSync(); renderMap();
}

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

// news from the wider world, shown as a card with a picture rather than a line of
// small text that scrolls past unread. Click it away, or let it go on its own.
let eventCardT = null;
function eventCard(title, image, sub) {
  // Word from afar is exactly the sort of thing a player wants to look up later:
  // which crown declared war, which winter starved which kingdom. Every card
  // writes itself into the chronicle, so nothing that got a picture is lost.
  chron("war", sub ? `${title} ${sub}` : title);
  const card = $("eventCard");
  $("eventImg").src = `assets/sprites/ui/${image}.png`;
  $("eventText").textContent = title;
  $("eventSub").textContent = (sub || "") + " — click to dismiss";
  card.classList.add("show");
  try { SFX.popup(); } catch (e) {}
  clearTimeout(eventCardT);
  eventCardT = setTimeout(() => card.classList.remove("show"), 8000);
}
$("eventCard").addEventListener("click", () => {
  clearTimeout(eventCardT);
  $("eventCard").classList.remove("show");
});

function startNatWar() {
  const ids = Object.keys(NATIONS).filter(id => !NATIONS[id].defeated);
  if (!ids.length) return;
  const a = ids[Math.floor(Math.random() * ids.length)];
  const nbs = nationNeighbours(a).filter(b =>
    !natWars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)));
  if (!nbs.length) return;
  const b = nbs[Math.floor(Math.random() * nbs.length)];
  natWars.push({ a, b, t: 30 + Math.random() * 20, battles: 0 });
  eventCard(`${NATIONS[a].name} and ${NATIONS[b].name} are at war!`, "event_war", "Word arrives from afar");
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
  eventCard(`${n.name} has been destroyed.`, "event_defeat", "Its name passes into history");
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
  if (take > 0) eventCard(`${NATIONS[winner].name} seizes land from ${NATIONS[loser].name}!`, "event_conquest", "The borders of Europe shift");
  // rebuild the pixel map so borders visibly move — live if the map is open
  buildMapGrid();
  if (document.getElementById("mapOverlay").style.display === "block") renderMap();
  if (checkDefeated(loser)) return;
  if ((war.battles >= 3 && Math.random() < 0.3) || (!frontier.length && take === 0)) {
    natWars.splice(natWars.indexOf(war), 1);
    eventCard(`${NATIONS[war.a].name} and ${NATIONS[war.b].name} make peace.`, "event_peace", "A weary truce is signed");
  }
}

function updateNationTrade(dt) {
  for (const [id, n] of Object.entries(NATIONS)) {
    if (n.tradeCool > 0) n.tradeCool -= dt;
    if (n.reqCool > 0) n.reqCool -= dt;
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
  // the map may never have been opened — build it before drawing it, or a
  // conquest anywhere would throw and take the whole game loop down with it
  if (!fineGrid || !mapGrid) buildMapGrid();
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
  tutSeen.map = true;
  lesson("trade");                      // they are looking at the neighbours now
  // on a phone the map is wider than the glass: open it looking at your own lands
  const frame = document.getElementById("euromap").parentElement;
  if (frame && frame.scrollWidth > frame.clientWidth) {
    const mapEl = document.getElementById("euromap");
    const scale = mapEl.getBoundingClientRect().width / mapEl.width;
    frame.scrollLeft = Math.max(0, EMPIRE_HOME.mx * CPX * scale - frame.clientWidth / 2);
    frame.scrollTop = Math.max(0, EMPIRE_HOME.my * CPX * scale - frame.clientHeight / 2);
  }
});
document.getElementById("mapClose").addEventListener("click", () => {
  document.getElementById("mapOverlay").style.display = "none";
  setPause(pauseOpen);
});
document.getElementById("euromap").addEventListener("click", e => {
  const rect = e.target.getBoundingClientRect();
  // the map may be drawn smaller than its canvas on a phone: read taps in canvas pixels
  const sx = e.target.width / rect.width, sy = e.target.height / rect.height;
  const c = Math.floor((e.clientX - rect.left) * sx / MPX), r = Math.floor((e.clientY - rect.top) * sy / MPX);
  if (!fineGrid || c < 0 || r < 0 || c >= FW || r >= FH) return;
  const id = FID[fineGrid[r * FW + c]];
  if (!id || id === "sea" || id === "wilds") { mapSelNation = null; mapInfoSync(); return; }
  mapSelNation = id;
  mapInfoSync();
});
function mapInfoSync() {
  const w = document.getElementById("miWar"), pc = document.getElementById("miPeace"), as = document.getElementById("miAssault");
  const note = document.getElementById("miNote");
  if (note) { note.textContent = ""; note.style.display = "none"; }   // a fresh nation, a fresh slate
  if (!mapSelNation) {
    document.getElementById("miName").textContent = "—";
    document.getElementById("miDetail").textContent = "Click a nation on the map.";
    w.style.display = pc.style.display = as.style.display = "none";
    return;
  }
  const n = NATIONS[mapSelNation];
  document.getElementById("miName").textContent = n.name.toUpperCase();
  const soldiers = civs.filter(c => ["soldier", "musketeer", "cavalry"].includes(c.profession)).length;
  const adj = nationAdjacent(mapSelNation);
  if (n.defeated) {
    document.getElementById("miDetail").textContent =
      `DEFEATED. ${n.name} holds not one league of land — its territory is wholly occupied, its name a memory.`;
    w.style.display = pc.style.display = as.style.display = "none";
    return;
  }
  const woe = n.calT ? ` Stricken by ${n.calName} — weakened, and slow to answer.` : "";
  document.getElementById("miDetail").textContent =
    `Strength ${natStrength(n)}/10${n.calT ? " (stricken)" : natStrength(n) > n.strength ? " (grown with the years)" : ""}.${woe} ` + (n.atWar ?
      `AT WAR with ${empireName || "your empire"}. Their war parties will keep coming. Assaulting a settlement needs 4 fighting men — soldiers, line infantry or cavalry; unarmed soldiers draw a weapon from the armoury. (You have ${soldiers} fighting man/men, ${res.weapons} weapon(s).)` :
      adj ? "At peace, and your borders touch theirs. Declaring war will bring their war parties to your gates — and put their settlements within your soldiers' reach." :
            "At peace — and far from your borders. No quarrel can reach a nation your territory does not touch. Expand toward them first.");
  w.style.display = n.atWar ? "none" : adj ? "block" : "none";
  pc.style.display = n.atWar ? "block" : "none";
  as.style.display = n.atWar ? "block" : "none";
  const tr = document.getElementById("miTrade");
  tr.style.display = (!n.atWar && adj && !n.trade) ? "block" : "none";
  if (n.trade) document.getElementById("miDetail").textContent += " A trade route is open — caravans arrive regularly.";
  $("miRequestWrap").style.display = n.trade ? "block" : "none";
  if (n.trade) requestOddsText();
}
document.getElementById("miWar").addEventListener("click", () => {
  const n = NATIONS[mapSelNation];
  if (!nationAdjacent(mapSelNation)) return toast(`Your borders do not touch ${n.name}. Expand toward them first.`);
  if (n.trade) { n.trade = false; toast(`The caravans of ${n.name} turn back — trade is dead.`); }
  n.atWar = true; n.warT = 30;
  for (const c of civs) c.happiness = Math.max(0, c.happiness - 6);
  eventCard(`${empireName || "The colony"} declares war on ${n.name}!`, "event_war", "The people brace themselves");
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
  { text: "\"Trade with us, or your merchants will regret it.\"", d: -16 },
  { text: "\"We are small, but hard winters breed honest traders.\"", d: +5 },
  { text: "Praise the court's splendour at some length.", d: +4 },
  // a court can be won round by argument alone — not every road runs through the treasury
  { text: "\"Timber, pitch and iron: everything a fleet is built from, and we are closer than the Baltic.\"", d: +9 },
  { text: "\"Name your tariff. We will meet it and keep our mouths shut about it.\"", d: +7 },
  { text: "\"One caravan. If it profits you, send a second. If not, we never spoke.\"", d: +6 },
  { text: "Let the envoy wait, and answer every question plainly and without flattery.", d: +5 },
];
// what each court has in plenty — ask for anything else and the odds drop hard
const NAT_GOODS = {
  scotland: ["stone", "meat"], england: ["bread", "iron"], ireland: ["meat", "wheat"],
  france: ["bread", "wheat"], castile: ["iron", "wheat"], aragon: ["stone", "bread"],
  portugal: ["meat", "stone"], hre: ["iron", "logs"], brandenburg: ["logs", "wheat"],
  saxony: ["iron", "stone"], bavaria: ["logs", "bread"], austria: ["iron", "bread"],
  milan: ["iron", "bread"], savoy: ["stone", "logs"], venice: ["bread", "meat"],
  tuscany: ["wheat", "bread"], papal: ["bread", "stone"], naples: ["wheat", "meat"],
  sicily: ["wheat", "meat"], sweden: ["logs", "iron"], denmark: ["meat", "logs"],
  poland: ["wheat", "logs"], russia: ["logs", "wheat"], cossacks: ["meat", "wheat"],
  crimea: ["meat", "stone"], hungary: ["wheat", "meat"], transylvania: ["logs", "stone"],
  moldavia: ["wheat", "meat"], wallachia: ["wheat", "logs"], ottoman: ["wheat", "stone"],
  algiers: ["meat", "iron"], tunis: ["wheat", "stone"], tripoli: ["meat", "stone"],
};
const goodsOf = id => NAT_GOODS[id] || ["wheat", "stone"];
// A caravan is a barter, not a gift: they take coin AND a load of whatever their
// own lands are poor in. What a court wants is the goods it does not already hold.
const TRADE_GOODS = ["logs", "stone", "iron", "wheat", "bread", "meat"];
function wantsOf(id) {
  const rich = goodsOf(id);
  const poor = TRADE_GOODS.filter(g => !rich.includes(g));
  // steady per nation, not a new demand every time you open the panel
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return poor[h % poor.length];
}
const barterFor = amt => Math.max(1, Math.round(amt * 0.6));
function requestOdds(id, good, amt) {
  const n = NATIONS[id] || {};
  const scarce = !goodsOf(id).includes(good);
  // a starving court sells nothing it can eat, and a plagued one has no carters
  const starving = n.hungry && ["wheat", "bread", "meat"].includes(good) ? 0.4 : 0;
  return Math.max(0.02, Math.min(0.95, 0.92 - amt * 0.02 - (scarce ? 0.35 : 0) - starving - (n.calT ? 0.15 : 0)));
}
function requestOddsText() {
  const id = mapSelNation; if (!id || !NATIONS[id]) return;
  const good = $("miGood").value, amt = +$("miAmt").value;
  const scarce = !goodsOf(id).includes(good);
  const odds = requestOdds(id, good, amt);
  const want = wantsOf(id), owe = barterFor(amt);
  $("miOdds").textContent = (scarce ? `They have little ${good} to spare themselves. ` : `Their lands are rich in ${good}. `) +
    `Cost: ${amt * 2} DM and ${owe} ${want} in trade (you hold ${Math.floor(res[want] || 0)}). ` +
    `The envoy rates the odds ${odds > 0.7 ? "good" : odds > 0.4 ? "uncertain" : "poor"}.`;
}
$("miGood").addEventListener("change", requestOddsText);
$("miAmt").addEventListener("change", requestOddsText);
$("miRequest").addEventListener("click", () => {
  const id = mapSelNation, n = NATIONS[id];
  if (!n || !n.trade) return;
  if (n.reqCool > 0) return toast(`${n.name}'s quartermasters are still weighing the last request.`);
  const good = $("miGood").value, amt = +$("miAmt").value, price = amt * 2;
  const want = wantsOf(id), owe = barterFor(amt);
  if (res.dm < price) return toast(`The shipment would cost ${price} DM on delivery. Treasury: ${res.dm} DM.`);
  if ((res[want] || 0) < owe)
    return toast(`${n.name} wants ${owe} ${want} in the bargain — the capital's stores hold ${Math.floor(res[want] || 0)}.`);
  n.reqCool = 90;
  if (Math.random() < requestOdds(id, good, amt)) {
    res.dm -= price; res[want] -= owe; res[good] += amt;
    SFX.coin();
    toast(`${n.name} agrees — a caravan delivers ${amt} ${good} for ${price} DM and ${owe} ${want}.`);
  } else {
    toast(`${n.name} declines: ${goodsOf(id).includes(good) ? "the asking price of so large a shipment offends the court" : `their own stores of ${good} run thin`}. Ask again later.`);
  }
  mapInfoSync(); syncUI();
});
document.getElementById("miTrade").addEventListener("click", () => {
  const id = mapSelNation, n = NATIONS[id];
  if (n.trade) return;
  if (!nationAdjacent(id)) return toast("Caravans need a shared border.");
  if (n.tradeCool > 0) return toast(`${n.name}'s court is still offended. Give it time.`);
  // no envoy goes to a foreign court empty-handed
  const gift = wantsOf(id), giftN = 10 + Math.floor(natStrength(n) * 1.5);
  if ((res[gift] || 0) < giftN)
    return toast(`An envoy to ${n.name} must carry a gift of ${giftN} ${gift} — the capital holds ${Math.floor(res[gift] || 0)}.`);
  const lead = leaderOf(id);
  n.tradeMeter = n.tradeMeter === undefined ? Math.max(28, 62 - natStrength(n) * 1.2) : n.tradeMeter;
  n.tradeUsed = n.tradeUsed || new Set();
  openTalk({
    face: lead.face,
    title: lead.title,
    opening: "The envoy is received coolly. \"A colony of exiles wishes to trade with us? Speak, then.\"",
    pool: TRADE_OPTIONS,
    used: n.tradeUsed,
    winAt: 80, passAt: 55,      // a court can be persuaded without emptying the treasury

    get meter() { return n.tradeMeter; }, set meter(x) { n.tradeMeter = x; },
    onWin: () => {
      closeDialogue();
      res[gift] = Math.max(0, (res[gift] || 0) - giftN);      // the gift is handed over
      n.trade = true; n.tradeT = 30; n.tradeMeter = undefined; n.tradeUsed = new Set();
      eventCard(`A trade route opens with ${n.name}.`, "event_caravan",
                `${giftN} ${gift} given in tribute — the first caravan is on the road`);
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
// Marching on a settlement is no longer a roll of dice: their border town is set
// down in the world, and you take it with your own soldiers or not at all.
document.getElementById("miAssault").addEventListener("click", () => {
  const id = mapSelNation, n = NATIONS[id];
  const standing = foreignTowns.find(t => t.nation === id);
  if (standing) {
    cam.x = standing.x - canvas.width / 2 / zoom;
    cam.y = standing.y - canvas.height / 2 / zoom;
    document.getElementById("mapOverlay").style.display = "none"; setPause(pauseOpen);
    toast(`${standing.name} stands before you. Select your soldiers and click its walls, its buildings and its keep.`);
    return;
  }
  const party = civs.filter(c => ["soldier", "musketeer", "cavalry"].includes(c.profession));
  if (party.length < 4) return toast("An assault needs at least 4 fighting men — soldiers, line infantry or cavalry.");
  const town = landForeignTown(id);
  cam.x = town.x - canvas.width / 2 / zoom;
  cam.y = town.y - canvas.height / 2 / zoom;
  document.getElementById("mapOverlay").style.display = "none"; setPause(pauseOpen);
  eventCard(`Scouts find ${town.name}, a border town of ${n.name}.`, "event_warparty",
            "March your army there and put its town hall to the torch");
  toast(`${town.name} lies to the ${Math.abs(town.x) > Math.abs(town.y) ? (town.x > 0 ? "east" : "west") : (town.y > 0 ? "south" : "north")} — burn its town hall and the town is yours, roofs and all. Watch for its marker at the screen's edge.`);
  mapInfoSync(); renderMap(); syncUI();
});

// --- axe or fire: how a wall, gate or roof of theirs is to come down ---
let siegeTarget = null;
function siegeOrder(fb, kind) {
  const grp = soldierGroup().filter(isForce);
  if (!grp.length || !foreign.includes(fb)) return;
  grp.forEach((s, i) => { s.post = null; order(s, { kind, target: fb,
    x: fb.x + (i % 3 - 1) * 30, y: fb.y + 22 + Math.floor(i / 3) * 16 }); });
  const what = fb.keep ? `the town hall of ${fb.town.name}` : (BLDG_NAMES[fb.type] || fb.type);
  toast(kind === "torch" ? `${grp.length} carry fire to ${what}!`
        : kind === "climb" ? `${grp.length} go up ${what} — it will not be broken, only crossed.`
        : `${grp.length} set about ${what} with axes.`);
  closeSiegeMenu();
}
function openSiegeMenu(fb, clientX, clientY) {
  siegeTarget = fb;
  const m = $("siegeMenu");
  $("siegeWhat").textContent = (BLDG_NAMES[fb.type] || fb.type).toUpperCase() + " — " + fb.town.name;
  // Stone neither burns nor splinters. It is crossed, and only crossed.
  const stone = STONE.has(fb.type);
  $("siegeTorch").style.display = stone ? "none" : "block";
  $("siegeChop").style.display = stone ? "none" : "block";
  $("siegeClimb").style.display = stone ? "block" : "none";
  m.style.display = "block";
  m.style.left = Math.min(window.innerWidth - 190, Math.max(8, clientX + 12)) + "px";
  m.style.top = Math.min(window.innerHeight - 110, Math.max(8, clientY - 20)) + "px";
  m.style.right = "auto"; m.style.bottom = "auto";
  SFX.popup();
}
function closeSiegeMenu() { siegeTarget = null; $("siegeMenu").style.display = "none"; }
$("siegeChop").addEventListener("click", () => { if (siegeTarget) siegeOrder(siegeTarget, "siege"); });
$("siegeTorch").addEventListener("click", () => { if (siegeTarget) siegeOrder(siegeTarget, "torch"); });
$("siegeClimb").addEventListener("click", () => { if (siegeTarget) siegeOrder(siegeTarget, "climb"); });

// ===== foreign border towns: real ground to be taken, not a roll of dice =====
// A crown at war plants a walled town within a march of your colony. Its keep is
// the prize: raze it and the settlement falls, its land passing to your empire.
const FOREIGN_NAMES = { denmark: ["Nyborg", "Aalborg", "Ribe"], sweden: ["Kalmar", "Falun", "Vaxjo"],
                        hre: ["Lindau", "Ansbach", "Weimar"], brandenburg: ["Kustrin", "Prenzlau", "Zossen"],
                        poland: ["Torun", "Plock", "Lomza"], france: ["Verdun", "Sedan", "Toul"] };
function foreignName(id, n) {
  const pool = FOREIGN_NAMES[id];
  if (pool) return pool[foreignTowns.filter(t => t.nation === id).length % pool.length];
  return n.name + " Outpost";
}
function landForeignTown(id) {
  const n = NATIONS[id];
  const tier = Math.max(1, natStrength(n));
  // set it down a real march away, clear of your ground, the camps and other towns
  let site = null;
  for (let tries = 0; tries < 40 && !site; tries++) {
    const a = Math.random() * Math.PI * 2, d = 2600 + Math.random() * 700;
    const x = Math.round(Math.cos(a) * d), y = Math.round(Math.sin(a) * d);
    if (camps.every(cp => Math.hypot(cp.x - x, cp.y - y) > 900) &&
        settlements.every(s => s.x === undefined || Math.hypot(s.x - x, s.y - y) > 1500) &&
        foreignTowns.every(t => Math.hypot(t.x - x, t.y - y) > 1800) &&
        !inTerritory(x, y)) site = { x, y };
  }
  if (!site) { const a = Math.random() * Math.PI * 2; site = { x: Math.round(Math.cos(a) * 3000), y: Math.round(Math.sin(a) * 3000) }; }
  const town = { nation: id, name: foreignName(id, n), x: site.x, y: site.y, fallen: false,
                 dm: 150 + tier * 40, weapons: 2 + Math.floor(tier / 2) };
  foreignTowns.push(town);
  const put = (type, dx, dy, hp) => {
    const b = { type, x: site.x + dx, y: site.y + dy, hp, maxHp: hp, town, foreign: true,
                progress: -1, occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0 };
    foreign.push(b);
    for (const t of nearThings("trees", b.x, b.y, 90)) { t.alive = false; markChunkDirty(t.x, t.y); }
    for (const s of nearThings("stones", b.x, b.y, 80)) { s.alive = false; markChunkDirty(s.x, s.y); }
    return b;
  };
  // the keep at the heart, the town about it, a ring of wall with one gate
  town.keep = put("townhall", 0, 0, 260 + tier * 30);
  town.keep.keep = true;
  put("cabin", -150, -40, 90); put("cabin", 150, -40, 90);
  put("cabin", -110, 120, 90); put("cabin", 120, 120, 90);
  put("market", 0, 150, 110);
  if (tier >= 3) put("forge", -190, 90, 110);
  if (tier >= 5) put("watchtower", 190, 90, 130);
  const R = 300, wallHp = 90 + tier * 14, RING = 26;
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2;
    const wx = Math.round(Math.cos(a) * R), wy = Math.round(Math.sin(a) * R * 0.82);
    if (i === 6) { const g = put("gate", wx, wy, wallHp); g.rot = Math.abs(Math.cos(a)) > 0.6 ? 1 : 0; continue; }
    const w = put(tier >= 4 ? "stonewall" : "wall", wx, wy, wallHp);
    w.rot = Math.abs(Math.cos(a)) > 0.6 ? 1 : 0;
  }
  // the townsfolk: no soldiers, only people, who scatter when your line comes on
  const FOLK_M = ["Anders", "Bertil", "Ewald", "Hark", "Joris", "Klaus", "Mikkel", "Peder", "Rutger", "Sten"];
  const FOLK_F = ["Birgit", "Dorothea", "Elke", "Gisela", "Karin", "Maren", "Sofie", "Trine"];
  const TRADES = ["farmer", "forager", "lumberjack", "quarryman", "blacksmith", null];
  const folkN = 4 + Math.floor(tier / 2) + Math.floor(Math.random() * 3);
  for (let i = 0; i < folkN; i++) {
    const female = Math.random() < 0.45;
    const pool = female ? FOLK_F : FOLK_M;
    const a = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 210;
    foreignFolk.push({
      name: pool[Math.floor(Math.random() * pool.length)], gender: female ? "f" : "m",
      who: female ? "sister" : "brother", trade: TRADES[Math.floor(Math.random() * TRADES.length)],
      age: 17 + Math.floor(Math.random() * 40), town,
      x: site.x + Math.cos(a) * rr, y: site.y + Math.sin(a) * rr * 0.8,
      wpx: site.x + Math.cos(a) * rr, wpy: site.y + Math.sin(a) * rr * 0.8,
      state: "idle", anim: 0, facing: 1, fleeT: 0,
    });
  }
  // the garrison: they hold the town and do not march on your colony
  const garrison = 4 + Math.floor(tier / 2);
  for (let i = 0; i < garrison; i++) {
    const a = (i / garrison) * Math.PI * 2, rr = 120 + Math.random() * 90;
    const hp = 80 + tier * 8;
    raiders.push({ x: site.x + Math.cos(a) * rr, y: site.y + Math.sin(a) * rr, hp, maxHp: hp,
                   dmg: 13 + tier, camp: { x: site.x, y: site.y }, target: null, state: "patrol",
                   anim: 0, facing: 1, atkT: 0, foe: null, carry: 0, nation: id, garrison: town,
                   wpx: site.x + Math.cos(a) * rr, wpy: site.y + Math.sin(a) * rr });
  }
  return town;
}
// ===== the other way round: a crown takes one of YOUR towns =====
// An enemy column left standing in a town of yours, with no one alive to contest
// it, holds that ground. Leave them there long enough and the town changes hands.
const SIEGE_HOLD = 45;                       // seconds of unopposed occupation
// and how long a company will stand on ground it has failed to take before it
// gives up and marches home. Longer than SIEGE_HOLD, so a real capture lands.
const OCCUPY_HOLD = 150;
function townCentre(t) { return t ? { x: t.x, y: t.y } : { x: CAPITAL_X, y: CAPITAL_Y }; }
function updateOccupation(dt) {
  const towns = [null, ...settlements.filter(s => s.x !== undefined)];
  for (const t of towns) {
    const c = townCentre(t);
    const foes = raiders.filter(r => r.nation && !r.garrison && r.state !== "flee" &&
                                     Math.hypot(r.x - c.x, r.y - c.y) < 420);
    const held = buildings.some(b => b.type !== "burned" && !b.fire && townAt(b.x, b.y) === t);
    // a momentary gap in their line does not undo a siege — it eases off
    if (!foes.length || !held) {
      const v = Math.max(0, ((t ? t.siegeT : capitalSiegeT) || 0) - dt * 3);
      if (t) t.siegeT = v; else capitalSiegeT = v;
      continue;
    }
    // Anyone of yours still fighting for it keeps the flag flying — but a man
    // under a roof is hiding, not holding. Indoor folk stand at the building's
    // own coordinates, so without this the whole town could shelter inside and
    // hold the ground forever without a soul in the street to contest it.
    const defended = civs.some(d => !d.rebel && d.hp > 0 && !INDOORS.has(d.state) &&
                                    Math.hypot(d.x - c.x, d.y - c.y) < 420);
    const cur = (t ? t.siegeT : capitalSiegeT) || 0;
    if (defended) { const v = Math.max(0, cur - dt * 2); if (t) t.siegeT = v; else capitalSiegeT = v; continue; }
    const next = cur + dt;
    if (t) t.siegeT = next; else capitalSiegeT = next;
    if (Math.floor(cur / 15) !== Math.floor(next / 15) && next < SIEGE_HOLD)
      toast(`⚠ ${t ? t.name : settlementName || "the capital"} is held by ${NATIONS[foes[0].nation].name} — retake it, or lose it!`);
    if (next >= SIEGE_HOLD) townLostTo(t, foes[0].nation);
  }
}
let capitalSiegeT = 0;
// the flag comes down: the town, its roofs and its people pass to the crown
function townLostTo(t, natId) {
  const n = NATIONS[natId];
  const c = townCentre(t);
  const name = t ? t.name : (settlementName || "the capital");
  if (!t) {                                   // the capital itself cannot be annexed — it is sacked
    for (const b of buildings.filter(b => b.type !== "burned" && townAt(b.x, b.y) === null &&
                                          Math.hypot(b.x - c.x, b.y - c.y) < 420))
      if (!b.fire && Math.random() < 0.5) b.fire = FIRE_TIME;
    capitalSiegeT = -60;
    res.dm = Math.max(0, Math.round(res.dm * 0.6));
    eventCard(`${n.name} sacks ${name}!`, "event_warparty", "Buildings burn and the treasury is plundered");
    return;
  }
  // a daughter town is annexed outright: it becomes one of theirs, to be retaken
  const town = { nation: natId, name: t.name, x: t.x, y: t.y, fallen: false,
                 dm: 60 + Math.round((t.res && t.res.dm) || 0), weapons: 2 };
  foreignTowns.push(town);
  let taken = 0;
  for (const b of [...buildings]) {
    if (townAt(b.x, b.y) !== t || b.type === "burned") continue;
    buildings.splice(buildings.indexOf(b), 1);
    for (const o of b.occupants || []) o.home = null;
    b.occupants = []; b.foreign = true; b.town = town; b.site = false;
    b.hp = b.hp || 100; b.maxHp = b.maxHp || b.hp;
    if (b.type === "townhall" || (!town.keep && b.type === "cabin")) { town.keep = b; b.keep = true; }
    foreign.push(b);
    taken++;
  }
  if (!town.keep && foreign.length) { town.keep = foreign[foreign.length - 1]; town.keep.keep = true; }
  // their soldiers stay as its garrison; your folk there are driven out
  for (const r of raiders) if (r.nation === natId && Math.hypot(r.x - c.x, r.y - c.y) < 500) {
    r.garrison = town; r.state = "patrol"; r.target = null; r.wallTarget = null;
    r.camp = { x: t.x, y: t.y }; r.wpx = r.x; r.wpy = r.y;
  }
  for (const d of civs) if (Math.hypot(d.x - c.x, d.y - c.y) < 420) {
    // Take them off the roll of whatever roof they had as well as clearing it.
    // Every other place a home is lost does both; this one only did half, and
    // the half it left behind was a phantom: the cabin still counted them among
    // its occupants, so it looked full to the next family that needed it, and a
    // save reloaded put them back under a roof they had been driven out of.
    if (d.home) d.home.occupants = d.home.occupants.filter(o => o !== d);
    if (d.shelter) turnOut(d, true);
    d.home = null; d.task = null; d.state = "idle";
    d.x = CAPITAL_X + (Math.random() * 120 - 60); d.y = CAPITAL_Y + 90 + Math.random() * 60;
    d.happiness = Math.max(0, d.happiness - 20);
  }
  settlements.splice(settlements.indexOf(t), 1);
  mapGrid = null; renderMap(); syncUI();
  eventCard(`${name} has fallen to ${n.name}!`, "event_conquest",
            `${taken} building(s) lost — march on it and burn their hall to take it back`);
}

// A taken townsman joins your people — but not gladly. The conquered carry their
// resentment for a long while, and it shows in the colony's mood.
function captureFolk(f, quiet) {
  const i = foreignFolk.indexOf(f);
  if (i >= 0) foreignFolk.splice(i, 1);
  const name = usedNames.has(f.name) ? nextName(f.gender) : f.name;
  usedNames.add(name);
  const c = mkCiv(name, f.who, f.x, f.y, f.gender);
  c.age = f.age;
  c.profession = f.trade;
  c.happiness = 28;
  c.conquered = 1;                 // wears off as the years pass under your flag
  c.hunger = 70;
  refreshAvatar(c);
  civs.push(c);
  houseCiv(c, f.x, f.y);
  float(c.x, c.y - 70, "captured", "#c9a86a");
  if (!quiet) toast(`${c.name} of ${f.town.name} is taken — they will serve your empire, sullenly at first.`);
  return c;
}
// the town falls when its hall burns — and what still stands becomes yours
function foreignTownFalls(town) {
  town.fallen = true;
  tally.townsTaken = (tally.townsTaken || 0) + 1;
  const n = NATIONS[town.nation];
  let taken = 0;
  for (let i = foreign.length - 1; i >= 0; i--) {
    const b = foreign[i];
    if (b.town !== town) continue;
    foreign.splice(i, 1);
    if (b.keep) {
      // The hall itself burns down to a charred ruin you may rebuild. It is a
      // town hall's ruin, and rebuilds into a town hall: without `was` it fell
      // back to the generic cabin wreck and a storming party's prize turned into
      // somebody's cottage.
      buildings.push({ type: "burned", was: "townhall", x: b.x, y: b.y, progress: -1,
                       occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0,
                       hp: 100, maxHp: 100 });
      continue;
    }
    // roofs, walls and workshops left standing change hands, damage and all
    delete b.foreign; delete b.town;
    b.site = false; b.progress = -1; b.occupants = []; b.builder = null;
    b.fire = b.fire || 0; b.torchP = -1; b.placed = true; b.bakeT = 0;
    b.shop = b.shop || [];
    buildings.push(b);
    taken++;
  }
  for (let i = raiders.length - 1; i >= 0; i--) if (raiders[i].garrison === town) raiders.splice(i, 1);
  // whoever did not flee the town is now yours
  let folk = 0;
  for (const f of [...foreignFolk]) if (f.town === town) { captureFolk(f, true); folk++; }
  for (let i = foreignTowns.length - 1; i >= 0; i--) if (foreignTowns[i] === town) foreignTowns.splice(i, 1);
  town.taken = taken; town.folk = folk;
  res.dm += town.dm; res.weapons += town.weapons;
  // the settlement joins your empire under its own name, and its roofs take your folk
  settlements.push({ name: town.name, pop: 0, x: town.x, y: town.y,
                     res: { logs: 0, seeds: 0, stone: 0, iron: 0, wheat: 0, bread: 0, meat: 0, dm: 0, doors: 0, weapons: 0 },
                     ...freeMapCell() });
  for (const c of civs) if (!c.home) houseCiv(c);
  n.lost = (n.lost || 0) + 1;
  n.captured = n.captured || [];
  const [bx, by] = n.blobs[0];
  for (let i = 0; i < 4; i++) n.captured.push((bx + i % 2 + n.lost) + "," + (by + Math.floor(i / 2)));
  expandAround(town.x, town.y, 5);            // the ground is yours now
  SFX.coin();
  float(town.x, town.y - 90, `+${town.dm} DM +${town.weapons} wpn`, "#7da083");
  eventCard(`${town.name} has fallen to ${empireName || "your empire"}!`,
            "event_conquest",
            `+${town.dm} DM plunder, ${town.taken} building(s) taken intact` +
            (town.folk ? `, ${town.folk} of its people now yours` : "") + ` — ${town.name} is yours`);
  checkDefeated(town.nation);
  mapGrid = null; renderMap(); syncUI();
}
// How many of a crown's men may stand on your ground at once, all wars counted
// together. Four crowns at war used to mean four separate streams, each keeping
// its own time and none of them aware of the others — which is how a colony ends
// up facing hundreds. They share one field now.

function updateWars(dt) {
  const atWar = Object.values(NATIONS).filter(n => n.atWar && !n.defeated).length;
  for (const [id, n] of Object.entries(NATIONS)) {
    if (!n.atWar || n.defeated) continue;
    n.warT -= dt;
    if (n.warT <= 0) {
      // Every crown that joins the war lengthens each crown's own turn, so a
      // second enemy makes the war wider rather than twice as fast. It is capped
      // now: with the field itself limited to attackerCap(), stretching this too
      // far bought nothing but silence — six crowns at war meant a quarter of an
      // hour between one crown's parties and no attack landing at all.
      n.warT = (330 + Math.random() * 210) * Math.min(1.8, Math.max(1, atWar * 0.5));
      if (season() === "winter") continue;   // armies do not march in the snow
      // a war party marches on ONE town — settlements are not spared the war
      const towns = townsWithBuildings();
      if (!towns.length || attackersAfield() >= attackerCap()) continue;
      const town = towns[Math.floor(Math.random() * towns.length)];
      const targets = raidTargetsIn(town);
      if (!targets.length) continue;
      const cx = town ? town.x : 0, cy = town ? town.y : 0;
      const a = Math.random() * Math.PI * 2;
      const st = natStrength(n);
      const partySize = 3 + (st >= 8 ? 1 : 0) + Math.floor(menace() / 6);
      let sent = 0;
      for (let i = 0; i < partySize; i++) {
        // the cap is a wall, not a suggestion: test it for every man sent
        if (attackersAfield() >= attackerCap()) break;
        const t = targets[Math.floor(Math.random() * targets.length)];
        const whp = 90 + (difficulty() - 1) * 6 + st * 3;
        raiders.push({ x: cx + Math.cos(a) * 1300 + i * 30, y: cy + Math.sin(a) * 1300 + i * 24, hp: whp, maxHp: whp,
                       dmg: 16 + (difficulty() - 1) * 1.2 + Math.floor(st / 3), target: t,
                       state: "approach", anim: 0, facing: 1, atkT: 0, foe: null,
                       camp: { x: cx + Math.cos(a) * 1600, y: cy + Math.sin(a) * 1600 }, carry: 0, nation: id });
        sent++;
      }
      if (!sent) continue;   // no horn for an army that never came
      SFX.warHorn();
      eventCard(`A war party of ${n.name} marches on ${town ? town.name : "the colony"}!`, "event_warparty", "Arm yourselves");
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
      row.innerHTML = `<input type="checkbox" data-idx="${i}"> ${esc(c.name)} — ${esc(profLabel(c.profession))}${c.home ? "" : " (homeless)"}`;
      list.appendChild(row);
    });
    document.getElementById("settleName").value = SETTLE_NAMES[settlements.length % SETTLE_NAMES.length];
    $("settleSearch").value = "";
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
        Math.hypot(x - CAPITAL_X, y - CAPITAL_Y) > 1400 &&           // never crowd the capital's own clearing
        settlements.every(s => s.x === undefined || Math.hypot(s.x - x, s.y - y) > 1200)) site = { x, y };
  }
  if (!site) site = { x: Math.round(Math.cos(angle) * 2500), y: Math.round(Math.sin(angle) * 2500) };
  // raise the first cabins and claim the clearing
  const newCabins = [];
  for (let i = 0; i < Math.max(1, Math.ceil(chosen.length / 2)); i++) {
    const bx = site.x + (i % 3) * 150 - 150, by = site.y + Math.floor(i / 3) * 170;
    for (const t of nearThings("trees", bx, by, 130)) { t.alive = false; markChunkDirty(t.x, t.y); }
    for (const s of nearThings("stones", bx, by, 100)) { s.alive = false; markChunkDirty(s.x, s.y); }
    const b = { type: "cabin", x: bx, y: by, progress: -1, occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0 };
    buildings.push(b); newCabins.push(b);
  }
  expandAround(site.x, site.y, 5);   // room enough to actually build a town there
  const flag = freeMapCell();
  const st = { name, pop: chosen.length, x: site.x, y: site.y,
               res: { logs: 10, stone: 4, bread: 4, meat: 2, dm: 10 },
               mx: flag.mx, my: flag.my };
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
  nextSettleAt = playT + SETTLE_AGAIN;   // the scouts rest 20 minutes before looking again
  expandFrontier(6);
  tell("land", `${chosen.length} settler(s) set out to found ${name} — follow them, or watch for its marker at the screen's edge.`);
  setTimeout(() => vignette("firstSettlement"), 400);
});
// --- the wagon: pick out exactly what travels between the capital and a town ---
const CARGO_KINDS = ["logs", "stone", "iron", "seeds", "wheat", "bread", "meat", "weapons", "doors", "dm"];
let cargoTown = null, cargoDir = 1;      // 1: capital -> town, -1: town -> capital
function cargoLedgers() {
  cargoTown.res = cargoTown.res || {};
  for (const k of CARGO_KINDS) cargoTown.res[k] = cargoTown.res[k] || 0;
  return cargoDir > 0 ? [res, cargoTown.res] : [cargoTown.res, res];
}
function openCargo(s, dir) {
  cargoTown = s; cargoDir = dir;
  renderCargo();
  $("cargoModal").style.display = "block";
  SFX.popup();
}
function renderCargo() {
  const [from, to] = cargoLedgers();
  const fromName = cargoDir > 0 ? settlementName : cargoTown.name;
  const toName = cargoDir > 0 ? cargoTown.name : settlementName;
  $("cargoRoute").innerHTML = `<b style="color:#c9a86a">${esc(fromName)}</b> &rarr; <b style="color:#c9a86a">${esc(toName)}</b> &mdash; set how much of each good rides along.`;
  const rows = $("cargoRows");
  rows.innerHTML = "";
  let any = false;
  for (const k of CARGO_KINDS) {
    const have = Math.floor(from[k] || 0);
    if (have <= 0) continue;
    any = true;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;align-items:center;margin:3px 0;font-size:11px";
    row.innerHTML = `<span style="flex:1;text-transform:capitalize">${k}</span><span style="color:#5a6b60">of ${have}</span>`;
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.max = String(have); inp.value = "0";
    inp.dataset.kind = k;
    inp.style.cssText = "width:62px;background:#101813;border:1px solid #3a5243;color:#cfd8d3;font-family:inherit;font-size:11px;padding:3px 4px";
    const max = document.createElement("button");
    max.className = "btn"; max.style.fontSize = "9px"; max.textContent = "All";
    max.addEventListener("click", () => { inp.value = String(have); });
    row.appendChild(inp); row.appendChild(max);
    rows.appendChild(row);
  }
  if (!any) rows.innerHTML = `<div style="padding:6px;color:#5a6b60;font-size:11px">${esc(fromName)}'s stores are empty.</div>`;
}
$("cargoSwap").addEventListener("click", () => { cargoDir = -cargoDir; renderCargo(); });
$("cargoNo").addEventListener("click", () => { $("cargoModal").style.display = "none"; cargoTown = null; });
$("cargoGo").addEventListener("click", () => {
  if (!cargoTown) return;
  const [from, to] = cargoLedgers();
  let moved = 0, parts = [];
  for (const inp of document.querySelectorAll("#cargoRows input")) {
    const k = inp.dataset.kind;
    const n = Math.max(0, Math.min(Math.floor(+inp.value || 0), Math.floor(from[k] || 0)));
    if (!n) continue;
    from[k] -= n; to[k] = (to[k] || 0) + n;
    moved += n; parts.push(`${n} ${k}`);
  }
  if (!moved) return toast("Nothing was loaded onto the wagon.");
  const toName = cargoDir > 0 ? cargoTown.name : settlementName;
  SFX.coin();
  toast(`The wagon leaves for ${toName} with ${parts.join(", ")}.`);
  $("cargoModal").style.display = "none"; cargoTown = null;
  syncUI();
});

// Settlers used to leave the world entirely — a daughter settlement was a name
// on the map, so anyone sent to one walked off the edge and was deleted. Towns
// have been real places on the ground since, with real cabins to walk to, and
// nothing has issued an "emigrate" order since the day that changed. The whole
// path — the order, the handler, and a movement branch that let an emigrant
// walk through walls — sat unreachable behind it. Removed.

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
  // now the map is theirs to look at, the first instruction can be seen
  if (tutStep < 0 && !lessonsOff && !Object.keys(lessonSeen).length) tutStep = 0;
  toast(`Let it be written: this is ${empireName}.`);
});
document.getElementById("empireInput").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("empireGo").click(); e.stopPropagation(); });
document.getElementById("terrColor").addEventListener("input", e => { territoryColor = e.target.value; });
document.getElementById("bordColor").addEventListener("input", e => { borderColor = e.target.value; });
document.getElementById("uniColor").addEventListener("input", e => { setUniform(e.target.value); });

// --- the Military office: uniform and march, reachable from the main menu ---
const COAT_SWATCHES = ["#2f52a8", "#8a2f2f", "#2f6b45", "#5a4a8a", "#8a6a2f", "#3a3f47", "#7a2f6b", "#2f7a8a"];
function setUniform(hex) {
  uniformColor = hex;
  $("uniColor").value = hex;
  $("milColor").value = hex;
  reDye();
}
function openMilitary() {
  const sel = $("milMarch");
  if (!sel.options.length) {
    for (const m of MUSIC.marches()) {
      const o = document.createElement("option");
      o.value = m.id; o.textContent = m.name;
      sel.appendChild(o);
    }
    const sw = $("milSwatches");
    for (const hex of COAT_SWATCHES) {
      const b = document.createElement("button");
      b.style.cssText = `flex:1;height:22px;border:1px solid #3a5243;background:${hex};cursor:pointer`;
      b.title = hex;
      b.addEventListener("click", () => setUniform(hex));
      sw.appendChild(b);
    }
  }
  sel.value = MUSIC.currentMarch();
  $("milColor").value = uniformColor;
  $("milEnabled").checked = settings.march !== false;
  renderMilitary();
  $("militaryPanel").style.display = "block";
  SFX.popup();
}
// the army roster and the recruiting table inside the MILITARY panel
function renderMilitary() {
  const forces = civs.filter(isForce);
  const counts = {};
  for (const f of forces) counts[f.profession] = (counts[f.profession] || 0) + 1;
  $("milRoster").innerHTML = forces.length
    ? ["soldier", "musketeer", "cavalry", "police"].filter(p => counts[p])
        .map(p => `${profTitle(p)}${counts[p] > 1 && p !== "musketeer" ? "s" : ""}: <b style="color:#c9a86a">${counts[p]}</b>`).join(" &middot; ")
    : '<span style="color:#5a6b60">The colony has no army yet.</span>';
  const list = $("milRecruits");
  list.innerHTML = "";
  const OPTS = [["police", "policing", "Pol", POLICE_COST], ["soldier", "raiding", "Sol", SOLDIER_COST],
                ["musketeer", "matchlock", "Line", MUSKET_COST], ["cavalry", "cavalry", "Cav", CAV_COST]];
  const open = OPTS.filter(([, t]) => has(t));
  if (!open.length) {
    list.innerHTML = '<div style="padding:4px;color:#5a6b60;font-size:11px">No military professions researched yet — Policing, Raiding, Matchlock Muskets or Cavalry open them.</div>';
    return;
  }
  const q = ($("milSearch").value || "").trim().toLowerCase();
  const folk = civs.filter(c => !c.child && !c.rebel &&
    (!q || `${c.name} ${c.profession || "no trade"}`.toLowerCase().includes(q)));
  for (const c of folk) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;margin:3px 0;font-size:11px";
    const nm = document.createElement("span");
    nm.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    nm.textContent = `${c.name} — ${profLabel(c.profession)}`;
    if (skillCiv && skillCiv !== c) closeSkills();   // the panel follows the selection
    row.appendChild(nm);
    for (const [p, , label, cost] of open) {
      if (c.profession === p) continue;
      const b = document.createElement("button");
      b.className = "btn";
      b.style.cssText = "font-size:10px;padding:3px 6px";
      b.textContent = label;
      b.title = `Recruit as ${p} — ${cost} DM`;
      b.addEventListener("click", () => { recruitAs(c, p); renderMilitary(); });
      row.appendChild(b);
    }
    list.appendChild(row);
  }
  if (!list.children.length)
    list.innerHTML = `<div style="padding:4px;color:#5a6b60;font-size:11px">${q ? "No one matches." : "No one is left to recruit."}</div>`;
}
$("milSearch").addEventListener("input", renderMilitary);
$("milSelectAll").addEventListener("click", () => {
  const army = civs.filter(groupable);
  if (!army.length) return toast("No soldiers, line infantry or cavalry to muster.");
  selGroup = [...army];
  selected = army[0];
  MUSIC.march(false);
  $("militaryPanel").style.display = "none";
  toast(`The army musters — ${army.length} under one order. Click the ground to march them out.`);
  syncUI();
});
// The lobby offers no muster: the army is a thing of the colony, not the title card.
// ===== what a building is for, and what it actually does =====
// Half the buildings said nothing but "Standing." A player had no way to learn
// what a Well is worth, how fast an oven bakes, or how far a watchtower shoots
// short of reading the source. Every structure now explains itself in a line,
// and then states its numbers — read live out of the same constants and
// technologies the simulation uses, so a figure here can never drift from the
// figure in play. Research that changes a rate changes this text with it.
const BLDG_ABOUT = {
  cabin: {
    what: "A roof, a bed and a hearth. Housed folk pay tax, sleep through the night, warm themselves in winter and mend a little while they sleep. The homeless do none of it, and freeze.",
    stats: b => [
      ["Houses", `${b.occupants.length} of ${cabinCapacity()}` + (has("landownership") ? " (Land Ownership)" : "")],
      ["Shelter on order", `up to ${SHELTER_CAP} may duck inside`],
      ["Mends while asleep", `${REST_HEAL}/s — fed and housed only`],
      ["Winter warmth", hearthsLit ? "hearth lit" : "hearth COLD — no logs"],
    ],
  },
  recruit: {
    what: "Wanderers come out of the woods to any colony that has one, and it is the only way your numbers grow beyond the children born here. Talk them round at the slot.",
    stats: () => [
      ["A wanderer every", "100–180s"],
      ["Waiting now", `${visitors.length}`],
      ["At once, at most", `${Math.max(2, buildings.filter(x => x.type === "recruit" && !x.fire && !x.site).length + 1)}`],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  market: {
    what: "Sells the colony's surplus bread and meat for coin. Civilians carry their own goods here and pocket the price themselves — that coin comes back to you as tax.",
    stats: () => [
      ["Price per bread or meat", `${sellPrice()} DM` +
        (has("marketing") ? " (Trading + Marketing)" : has("trading") ? " (Trading)" : "")],
      ["Tax day every", `${TAX_PERIOD}s — next in ${Math.ceil(taxTimer)}s`],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  bakery: {
    what: "Turns the town's wheat into bread on its own, without anyone being told to work it. Bread feeds better than raw wheat and sells for the same as meat.",
    stats: b => [
      ["Bakes", "1 bread from 2 wheat"],
      ["Every", "20s, endlessly"],
      ["Next loaf in", `${Math.max(0, Math.ceil(20 - (b.bakeT || 0)))}s`],
      ["Town wheat", `${Math.floor(ledgerAt(b.x, b.y).wheat || 0)}`],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  well: {
    what: "Clean water. The colony is happier for it, and when plague comes fewer of them take to their beds — the single cheapest thing you can do about an outbreak before it happens.",
    stats: () => {
      const n = wells();
      return [
        ["Wells standing", `${n}`],
        ["Happiness", `+${Math.min(2, n) * 3} (up to +6 from 2 wells)`],
        ["Struck by plague", `${Math.round(Math.max(0.15, 0.42 - n * 0.07) * 100)}% of adults (42% with none)`],
        ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
      ];
    },
  },
  forge: {
    what: "A blacksmith's shop. He forges tools that make every kind of work faster, and weapons that go to the armoury. Civilians buy tools out of their own pockets.",
    stats: b => [
      ["Tools on the racks", `${(b.shop || []).filter(i => i.kind === "tool").length}`],
      ["Weapons on the racks", `${(b.shop || []).filter(i => i.kind === "weapon").length}`],
      ["A tool makes work", "35% faster, for life"],
      ["Tool price", `${TOOL_PRICE_SELF} DM to a civilian · ${TOOL_PRICE_GOV} DM from the treasury`],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  townhall: {
    what: "Civilians carry what they gather here on their own instead of hoarding it in their pockets. One hall to a town; without one, goods sit in cabins until you ask for them.",
    stats: () => [["Serves", "its own town only"], ["Halls standing", `${buildings.filter(x => x.type === "townhall" && !x.fire && !x.site).length}`],
                  ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`]],
  },
  watchtower: {
    what: "Cries the alarm when raiders come, and shoots at whatever comes within range. Soldiers and police fighting in its shadow strike harder.",
    stats: () => [
      ["Shoots to", `${TOWER_RANGE} paces`],
      ["A shot every", `${TOWER_RELOAD}s`],
      ["Hits for", "80% of a musket ball"],
      ["Steadies your men within", "400 paces (+5 damage)"],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  jail: {
    what: "Where the constable puts the man who started a feud, until the blood goes out of him. No jail, or no police, and a quarrel simply runs its course.",
    stats: b => [
      ["Sentence", `${SENTENCE}s`],
      ["Held here now", `${civs.filter(o => isJailed(o) && o.jail === b).length}`],
      ["Constables", `${civs.filter(c => c.profession === "police").length}`],
      ["If it burns", "the prisoners walk"],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  hospital: {
    what: "Beds for the fever-struck and the badly hurt. Doctors fetch them off the street on a stretcher — even out of their own beds at night for a fever. This is the only place wounds close.",
    stats: b => {
      const doc = civs.filter(isDoc).length;
      return [
        ["Beds", `${abed(b).length} of ${HOSP_BEDS} taken`],
        ["Mends wounds", `${HOSP_HEAL}/s with a doctor at the bedside`],
        ["Burns out a fever", `${HOSP_CURE}× faster, and the wasting stops`],
        ["Without a doctor", "just over half as fast"],
        ["Doctors on the rolls", `${doc}${doc ? "" : " — recruit one"}`],
        ["Patients eat", `1 meal every ${HOSP_MEAL}s from the stores`],
        ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
      ];
    },
  },
  lamp: {
    what: "A lantern on a post, burning from dusk to dawn. It lights the ground around it and nothing else — two logs and a mark to line a street with.",
    stats: () => [
      ["Lights", "a pool twice a lit window's"],
      ["Burning", `${DUSK}:00 to ${String(FIRST_LIGHT).padStart(2, "0")}:00`],
      ["Standing", `${buildings.filter(x => x.type === "lamp" && !x.site).length}`],
      ["Claims territory", "no — it is furniture"],
    ],
  },
  wall: { what: "Timber. Keeps raiders out until they put a torch to it — and they will try.",
    stats: b => [["Strength", `${Math.round(b.hp)}/${b.maxHp}`], ["Burns", "yes — leaves a repairable ruin"]] },
  gate: { what: "Your people pass freely; raiders must burn it down or climb it.",
    stats: b => [["Strength", `${Math.round(b.hp)}/${b.maxHp}`], ["Weaker than wall", "60 against 100"]] },
  stonewall: { what: "Stone neither burns nor splinters. A raider must climb it, and he is helpless while he does.",
    stats: b => [["Strength", `${Math.round(b.hp)}/${b.maxHp}`], ["Fire", "no effect"], ["Climbing takes", `${CLIMB_TIME}s, back turned`]] },
  stonegate: { what: "A stone gate: your people through, theirs over the top and slowly.",
    stats: b => [["Strength", `${Math.round(b.hp)}/${b.maxHp}`], ["Fire", "no effect"]] },
  moat: { what: "Water in a ditch. Anything wading it crawls, and crawls under your muskets.",
    stats: () => [["Attackers move at", "35% speed"], ["Burns", "no — it is water"]] },
  ditch: { what: "A dry trench. Cheaper than a moat and slows them less, but it slows them.",
    stats: () => [["Attackers move at", "60% speed"], ["Burns", "no — it is earth"]] },
};
function renderBldgInfo(b, isFarm) {
  const info = $("bpInfo");
  const line = (what, rows) => {
    let html = `<div class="bpWhat">${esc(what)}</div>`;
    if (rows && rows.length) {
      html += `<div class="bpStats">`;
      for (const [k, v] of rows) html += `<div class="bpStat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
      html += `</div>`;
    }
    info.innerHTML = html;
  };
  if (isFarm) {
    return line("Wheat, grown by whoever you assign to it. A farmer works it through summer; the fields sleep all winter.",
      [["Farmers assigned", `${b.workers.length}`],
       ["Crop", b.ready ? "RIPE — ready to reap" : `growing (${Math.round(100 * Math.min(1, (b.growT || 0) / farmRipen()))}%)`],
       ["Ripens in", `${farmRipen()}s` + (has("agriculture") ? " (Agriculture)" : "")],
       ["A reaping gives", "2 wheat"],
       ["In winter", "nothing grows"]]);
  }
  if (b.fire) return line("IT IS ON FIRE. When the flames go out there will be a ruin here, and a ruin can be repaired.",
    [["Burns down in", `${Math.ceil(b.fire)}s`]]);
  if (b.type === "burned") return line(
    `A ruin of what was a ${BLDG_NAMES[b.was] || "building"}. Select a civilian and click it to order the repair — it comes back as exactly what it was.`,
    [["Repair costs", costText(REPAIR_COST)], ["Comes back as", BLDG_NAMES[b.was] || "a cabin"]]);
  const about = BLDG_ABOUT[b.type];
  if (!about) return line("Standing.", []);
  line(about.what, about.stats ? about.stats(b) : []);
}

// ===== ambitions =====
// The chronicle recorded a story with no last page. Nothing in the game was
// worth aiming at: you survived, and then you went on surviving, and the only
// thing that ever changed was the size of the pile. These are the things a
// colony can set out to do — plainly stated, checked against what actually
// happened, and stamped with the year they were achieved. Six of them opens the
// reckoning: the option to lay the ledger down and read what your reign was.
const AMBITIONS = [
  { id: "roots",    name: "Roots",              want: "Ten souls under your own roofs",
    test: () => civs.filter(c => c.home).length >= 10 },
  { id: "endure",   name: "Endure",             want: "Live through five winters",
    test: () => tally.winters >= 5 },
  { id: "village",  name: "A Village",          want: "Twenty-five souls in the colony",
    test: () => civs.length >= 25 },
  { id: "physic",   name: "The Physician's Art", want: "Twenty brought back from the fever",
    test: () => tally.cured >= 20 },
  { id: "master",   name: "A Master of a Trade", want: "Someone at the top of a skill",
    test: () => civs.some(c => SKILLS.some(s => skillLvl(c, s.id) >= SKILL_MAX)) },
  { id: "quiet",    name: "The Woods Are Quiet", want: "Eight camps burned out",
    test: () => tally.camps >= 8 },
  { id: "twotowns", name: "Two Towns",          want: "Found a second settlement",
    test: () => settlements.length >= 1 },
  { id: "learned",  name: "Learned",            want: "Twenty technologies known",
    test: () => Object.values(TECH).filter(t => t.done).length >= 20 },
  { id: "solvent",  name: "Well Kept",          want: "Meet the colony's bills ten tax days running",
    test: () => tally.billsPaid >= 10 && arrears === 0 },
  { id: "walled",   name: "Walled",             want: "Twenty lengths of wall or gate standing",
    test: () => buildings.filter(b => !b.site && !b.fire && WALLLIKE.has(b.type)).length >= 20 },
  { id: "kept",     name: "No One Left Behind", want: "Fifteen souls, all housed, none hungry, none sick",
    test: () => civs.length >= 15 && civs.every(c => c.home && c.hunger > 30 && !isSick(c)) },
  // `conquests` is the record of map cells changing hands BETWEEN the crowns of
  // Europe — Castile taking a province off Portugal, and nothing to do with you.
  // Testing it handed this out for free: forty-four of them inside half an hour
  // of wars the player never touched. It counts towns the player has taken.
  { id: "crowned",  name: "A Crown Humbled",    want: "Storm a foreign town and take it",
    test: () => (tally.townsTaken || 0) >= 1 },
];
const AMBITIONS_TO_END = 6;
let achieved = {};                 // id -> the year it was done
let ambT = 3;
function checkAmbitions(dt) {
  ambT -= dt;
  if (ambT > 0) return;
  ambT = 2.5;
  for (const a of AMBITIONS) {
    if (achieved[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(); } catch (e) { ok = false; }
    if (!ok) continue;
    achieved[a.id] = colonyYear;
    tell("work", `✦ Ambition achieved — ${a.name}: ${a.want.toLowerCase()}.`);
    try { SFX.popup(); } catch (e) {}
    if (Object.keys(achieved).length === AMBITIONS_TO_END)
      tell("work", "✦ Six ambitions stand achieved. You may lay the ledger down whenever you choose — the reckoning is in the pause menu.");
  }
}
// Count only ambitions that still exist. A save carrying an id from a list that
// has since changed would otherwise inflate the total, and could open the
// reckoning on the strength of something the game no longer knows how to earn.
const ambitionsDone = () => AMBITIONS.filter(a => achieved[a.id]).length;

// ===== the reckoning =====
// What a reign amounted to, in the colony's own terms. Reachable once six
// ambitions stand — never forced, and it does not end the game unless the
// player says so.
function reignReport() {
  const years = Math.max(0, colonyYear - 1683);
  const rows = [
    ["Years held", `${years} — ${1683} to ${colonyYear}`],
    ["Winters endured", tally.winters],
    ["Souls at the end", civs.length],
    ["Born here", tally.born],
    ["Came out of the woods", tally.arrived],
    ["Buried", tally.died],
    ["Masters lost with no equal", tally.mastersLost || 0],
    ["Raised", `${tally.raised} building${tally.raised === 1 ? "" : "s"}`],
    ["Lost to fire", tally.burned],
    ["Rebuilt from ruin", tally.rebuilt],
    ["Plagues weathered", tally.plagues],
    ["Brought back from fever", tally.cured],
    ["Raids answered", tally.raids],
    ["Camps burned out", tally.camps],
    ["Foreign towns taken", tally.townsTaken || 0],
    ["Quarrels come to blood", tally.feuds],
    ["Arrests made", tally.arrests],
    ["Tax days met in full", `${tally.billsPaid} of ${tally.taxDays}`],
    ["Technologies known", Object.values(TECH).filter(t => t.done).length],
    ["Towns founded", settlements.length],
    ["Ambitions achieved", `${ambitionsDone()} of ${AMBITIONS.length}`],
  ];
  return rows;
}
function openReckoning() {
  const p = $("reignPanel");
  const list = $("reignRows");
  list.innerHTML = "";
  for (const [k, v] of reignReport()) {
    const row = document.createElement("div");
    row.className = "bpStat";
    row.innerHTML = `<span>${esc(k)}</span><b>${esc(String(v))}</b>`;
    list.appendChild(row);
  }
  const got = AMBITIONS.filter(a => achieved[a.id]);
  $("reignAmb").innerHTML = got.length
    ? got.map(a => `<div class="ambRow done"><span class="ambName">✦ ${esc(a.name)}</span><span class="ambYear">${achieved[a.id]}</span></div>`).join("")
    : `<div style="color:#7a8f83;font-size:11px">Nothing yet set down.</div>`;
  $("reignName").textContent = `${(empireName || settlementName || "The colony").toUpperCase()}, ${1683}–${colonyYear}`;
  p.style.display = "flex";
  setPause(false);
  paused = true;
}
$("reignClose").addEventListener("click", () => { $("reignPanel").style.display = "none"; paused = pauseOpen; });
$("reignEnd").addEventListener("click", () => {
  // laying it down is a choice, and it is final for that slot
  tell("work", `The ledger of ${settlementName} is closed in the year ${colonyYear}.`);
  $("reignPanel").style.display = "none";   // no save: gameOver frees this slot on the next line
  gameOver(true);
});

// ===== reading the chronicle =====
// Filters are chips rather than a dropdown: the player wants "show me the
// deaths" in one press, and wants to see at a glance that a category exists at
// all. Newest first — the question is almost always "what just happened?".
let chronFilter = new Set();          // empty means everything
let chronShowing = "log";          // "log" or "ambitions"
function renderAmbitions() {
  const list = $("chronList");
  $("chronFilters").style.display = "none";
  list.innerHTML = "";
  const done = ambitionsDone();
  for (const a of AMBITIONS) {
    const year = achieved[a.id];
    const row = document.createElement("div");
    row.className = "ambRow " + (year ? "done" : "todo");
    row.innerHTML = `<span class="ambName">${year ? "✦" : "○"} ${esc(a.name)}</span>` +
                    `<span class="ambWant">${esc(a.want)}</span>` +
                    `<span class="ambYear">${year ? year : ""}</span>`;
    list.appendChild(row);
  }
  $("chronCount").textContent =
    `${done} of ${AMBITIONS.length} achieved` +
    (done >= AMBITIONS_TO_END
      ? " — the reckoning is open to you in the pause menu."
      : ` — ${AMBITIONS_TO_END - done} more opens the reckoning.`);
}
function renderChronicle() {
  if (chronShowing === "ambitions") return renderAmbitions();
  $("chronFilters").style.display = "";
  const filters = $("chronFilters");
  if (!filters.dataset.built) {
    filters.dataset.built = "1";
    const all = document.createElement("button");
    all.className = "chip on"; all.textContent = "all"; all.dataset.kind = "";
    filters.appendChild(all);
    for (const [k, v] of Object.entries(CHRON_KINDS)) {
      const b = document.createElement("button");
      b.className = "chip"; b.dataset.kind = k;
      b.textContent = `${v.icon} ${v.label}`;
      filters.appendChild(b);
    }
    filters.addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      const k = b.dataset.kind;
      if (!k) chronFilter.clear();
      else if (chronFilter.has(k)) chronFilter.delete(k);
      else chronFilter.add(k);
      renderChronicle();
    });
  }
  for (const b of filters.querySelectorAll(".chip"))
    b.classList.toggle("on", b.dataset.kind ? chronFilter.has(b.dataset.kind) : chronFilter.size === 0);

  const q = ($("chronSearch").value || "").trim().toLowerCase();
  const rows = chronicle.filter(e => (!chronFilter.size || chronFilter.has(e.k)) &&
                                     (!q || e.t.toLowerCase().includes(q) || String(e.y).includes(q)));
  const list = $("chronList");
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = `<div style="padding:10px;color:#5a6b60;font-size:11px">${
      chronicle.length ? "Nothing in the record answers to that." :
      "The record is empty — the colony's history begins the moment something happens."}</div>`;
  } else {
    let lastYear = null;
    for (let i = rows.length - 1; i >= 0; i--) {          // newest first
      const e = rows[i];
      if (e.y !== lastYear) {
        lastYear = e.y;
        const h = document.createElement("div");
        h.className = "chronYear"; h.textContent = `— ${e.y} —`;
        list.appendChild(h);
      }
      const kind = CHRON_KINDS[e.k] || { icon: "·" };
      const row = document.createElement("div");
      row.className = "chronRow " + e.k;
      row.innerHTML = `<span class="chronWhen">${esc(e.c)}</span>` +
                      `<span class="chronIcon">${kind.icon}</span>` +
                      `<span class="chronWhat">${esc(e.t)}</span>`;
      list.appendChild(row);
    }
  }
  $("chronCount").textContent = `${rows.length} of ${chronicle.length} entries` +
    (chronicle.length >= CHRON_MAX ? ` — the oldest are forgotten past ${CHRON_MAX}` : "");
}
function openChronicle() {
  const p = $("chronPanel");
  const show = p.style.display !== "block";
  p.style.display = show ? "flex" : "none";
  if (show) { $("folkPanel").style.display = "none"; renderChronicle(); }
  syncUI();
}
$("chronToggle").addEventListener("click", openChronicle);
$("chronClose").addEventListener("click", () => { $("chronPanel").style.display = "none"; syncUI(); });
$("chronView").addEventListener("click", () => {
  chronShowing = chronShowing === "log" ? "ambitions" : "log";
  $("chronView").textContent = chronShowing === "log" ? "✦ Ambitions" : "☰ The record";
  $("chronSearch").style.display = chronShowing === "log" ? "" : "none";
  renderChronicle();
});
$("chronSearch").addEventListener("input", renderChronicle);
$("chronSearch").addEventListener("keydown", e => e.stopPropagation());

// ===== the roll of the colony =====
// Everything the game knows about a person, for every person, on one screen —
// and clicking a row takes you to them. Without this the only way to find out
// who was sick or who was feuding was to click each figure in turn and hope.
const FOLK_SORTS = ["name", "health", "hunger", "mood", "trade"];
let folkSort = 0;
function doingWhat(c) {
  if (c.state === "abed") return "in a hospital bed";
  if (c.state === "borne") return "carried on a stretcher";
  if (c.state === "jailed") return `in the jail (${Math.ceil(c.jailT)}s)`;
  if (c.state === "sleeping") return "asleep";
  if (c.state === "warming") return "warming by the hearth";
  if (c.state === "inside") return "indoors";
  if (c.rebel) return "IN REVOLT";
  if (c.feudWith) return `hunting ${c.feudWith}`;
  if (c.bearing) return `bearing ${c.bearing.name} to the ward`;
  if (c.task && c.task.kind === "fetch") return `going to a case`;
  if (c.task && c.task.kind === "arrest") return "making an arrest";
  if (c.state === "fighting" || c.state === "sieging") return "fighting";
  const busy = { chopping: "felling a tree", quarrying: "breaking stone", gathering: "gathering seed",
                 harvesting: "reaping", buildingFarm: "raising a farm", raising: "raising a building",
                 repairing: "repairing", crafting: "hewing a door", smithing: "at the forge",
                 hunting: "hunting", selling: "at the market", trading: "trading", peddling: "peddling",
                 depositing: "carrying goods to store", shopping: "buying at the forge",
                 digging: "digging a grave", masonry: "cutting a headstone", walking: "on the move" };
  return busy[c.state] || "idle";
}
function renderFolk() {
  const q = ($("folkSearch").value || "").trim().toLowerCase();
  const key = FOLK_SORTS[folkSort];
  const rows = civs.filter(c => !q || c.name.toLowerCase().includes(q) ||
                                profLabel(c.profession).toLowerCase().includes(q));
  rows.sort((a, b) => key === "name" ? a.name.localeCompare(b.name)
                    : key === "health" ? a.hp / a.maxHp - b.hp / b.maxHp
                    : key === "hunger" ? a.hunger - b.hunger
                    : key === "mood" ? a.happiness - b.happiness
                    : profLabel(a.profession).localeCompare(profLabel(b.profession)));
  const sick = civs.filter(isSick).length, hurt = civs.filter(c => c.hp < c.maxHp * 0.6).length;
  const hungry = civs.filter(c => c.hunger < 30).length, homeless = civs.filter(c => !c.home).length;
  const feuding = civs.filter(c => c.feudWith).length;
  $("folkSum").textContent =
    `${civs.length} souls · ${civs.filter(c => c.child).length} children · ${homeless} without a roof` +
    (hungry ? ` · ${hungry} hungry` : "") + (sick ? ` · ${sick} stricken` : "") +
    (hurt ? ` · ${hurt} badly hurt` : "") + (feuding ? ` · ${feuding} at feud` : "");
  const list = $("folkList");
  const scroll = list.scrollTop;          // the roll refreshes as the world turns; don't yank the reader back to the top
  list.innerHTML = "";
  for (const c of rows) {
    const row = document.createElement("div");
    row.className = "folkRow" + (c.hp < c.maxHp * 0.6 || isSick(c) ? " hurt" : "");
    // plain single characters only: the crossed-out house was a combining slash
    // that never composed, and rendered as a house followed by a stray mark
    const sole = soleMasteries(c);
    const tags = (isSick(c) ? "☠" : "") + (c.feudWith ? "⚔" : "") + (isJailed(c) ? "⚖" : "") +
                 (c.rebel ? "⚑" : "") + (!c.home ? "◇" : "") +
                 (c.grief && c.grief.t > 0 ? "†" : "") + (sole.length ? "✦" : "");
    const tagHelp = [isSick(c) && "☠ stricken", c.feudWith && "⚔ at feud",
                     isJailed(c) && "⚖ jailed", c.rebel && "⚑ in revolt",
                     !c.home && "◇ no roof",
                     c.grief && c.grief.t > 0 && `† grieving for ${c.grief.who}`,
                     sole.length && `✦ the colony's only ${sole[0].name.toLowerCase()} (${sole[0].lvl})`]
                    .filter(Boolean).join(" · ");
    row.innerHTML =
      `<span class="folkName">${esc(c.name)}</span>` +
      `<span class="folkTrade">${esc(c.child ? "child" : profLabel(c.profession))}</span>` +
      `<span class="folkDoing">${esc(doingWhat(c))}</span>` +
      `<span class="folkBars">` +
        `<span class="barwrap"><span class="barfill red" style="width:${Math.round(100 * c.hp / c.maxHp)}%"></span></span>` +
        `<span class="barwrap"><span class="barfill" style="width:${Math.round(c.hunger)}%"></span></span>` +
      `</span>` +
      `<span class="folkTags" title="${esc(tagHelp)}">${tags}</span>`;
    row.addEventListener("click", () => {
      selected = c; selectedBldg = null; selectedCamp = null; selectedGrave = null;
      selGroup = groupable(c) ? [c] : [];
      cam.x = c.x - canvas.width / zoom / 2; cam.y = c.y - canvas.height / zoom / 2;
      syncUI();
    });
    list.appendChild(row);
  }
  list.scrollTop = scroll;
}
function openFolk() {
  const p = $("folkPanel");
  const show = p.style.display !== "block";
  p.style.display = show ? "flex" : "none";
  if (show) { $("chronPanel").style.display = "none"; renderFolk(); }
  syncUI();
}
$("folkToggle").addEventListener("click", openFolk);
$("folkClose").addEventListener("click", () => { $("folkPanel").style.display = "none"; syncUI(); });
$("folkSearch").addEventListener("input", renderFolk);
$("folkSearch").addEventListener("keydown", e => e.stopPropagation());
$("folkSort").addEventListener("click", () => {
  folkSort = (folkSort + 1) % FOLK_SORTS.length;
  $("folkSort").textContent = "sort: " + FOLK_SORTS[folkSort];
  renderFolk();
});

$("milToggle").addEventListener("click", openMilitary);
$("milClose").addEventListener("click", () => { MUSIC.march(false); $("militaryPanel").style.display = "none"; saveSettings(); });
$("milColor").addEventListener("input", e => setUniform(e.target.value));
$("milMarch").addEventListener("change", e => { MUSIC.setMarch(e.target.value); settings.marchTune = e.target.value; saveSettings(); });
$("milPreview").addEventListener("click", () => { MUSIC.setMarch($("milMarch").value); MUSIC.march(true); });
$("milStop").addEventListener("click", () => MUSIC.march(false));
$("milEnabled").addEventListener("change", e => {
  settings.march = e.target.checked;
  if (!settings.march) MUSIC.march(false);
  saveSettings();
});

// --- save / load ---
// ===== more than one colony at a time =====
// There was one save and one only: starting a new colony threw the old one
// away, and there was no way to keep a winter you were proud of while trying
// something reckless. Six slots now. The first is the original key, so anybody
// who was already playing finds their colony exactly where they left it, as
// slot one — nothing to migrate and nothing to lose.
//
// SAVE_KEY is not a constant any more: it names whichever slot is in hand.
// Everything else — the backup copy, the trimming, the surgery on the way in —
// hangs off it and needed no changing.
const SAVE_SLOTS = 6;
// The format's own number. A `v` was written into every save from the start and
// then never read and never raised, which is worse than none at all: it looks
// like the question has been asked. It is asked now.
//
// A save older than this build loads as it always did — every field added since
// is read through a default, so an old ledger simply lacks the new columns. A
// save NEWER than this build is refused outright and left untouched, because
// the alternative is the autosave writing over a colony this build cannot read.
// That happens when a browser serves a stale copy of the game to someone whose
// save is current, which is exactly when losing the colony would be least
// forgivable. Raise this only when a field CHANGES MEANING; adding one is free.
const SAVE_V = 2;
const FROM_FUTURE = "future";
const slotKey = i => (i === 1 ? "forester_save" : `forester_save${i}`);
const ACTIVE_SLOT_KEY = "forester_slot";
let saveSlot = Math.min(SAVE_SLOTS, Math.max(1, +(localStorage.getItem(ACTIVE_SLOT_KEY) || 1) || 1));
let SAVE_KEY = slotKey(saveSlot);
function useSlot(i) {
  saveSlot = Math.min(SAVE_SLOTS, Math.max(1, i | 0));
  SAVE_KEY = slotKey(saveSlot);
  try { localStorage.setItem(ACTIVE_SLOT_KEY, String(saveSlot)); } catch (e) {}
}
// What each slot holds, read cheaply enough to draw a menu from: the name of
// the place, the year it had reached, how many souls, and how long it was played.
function slotInfo(i) {
  try {
    const raw = localStorage.getItem(slotKey(i));
    if (!raw || raw === "null") return null;
    const d = JSON.parse(raw);
    return { i, name: d.settlementName || "Neu Hamburg", empire: d.empireName || "",
             year: d.colonyYear || 1683, pop: (d.civs || []).length,
             played: Math.round((d.playT || 0) / 60), savedAt: d.savedAt || 0,
             future: (d.v || 1) > SAVE_V,     // saved by a newer build than this one
             kb: Math.round(raw.length / 1024 * 10) / 10 };
  } catch (e) { return { i, name: "damaged save", year: 0, pop: 0, played: 0, savedAt: 0, broken: true }; }
}
const listSaves = () => Array.from({ length: SAVE_SLOTS }, (_, n) => slotInfo(n + 1)).filter(Boolean);
const firstFreeSlot = () => { for (let i = 1; i <= SAVE_SLOTS; i++) if (!slotInfo(i)) return i; return 0; };
function deleteSlot(i) {
  for (const suffix of ["", "_backup", "_broken"]) {
    try { localStorage.removeItem(slotKey(i) + suffix); } catch (e) {}
  }
}

// founder's tools: one-shot save surgery via URL params, then the URL is scrubbed
// ?scout=now — the scouts offer a new settlement immediately on Continue
// ?disband=Name — remove a settlement by name (case-insensitive)
// ?peace=denmark (or any nation id, or "all") — the war is called off: a white
//   peace, no more war parties. What the war already cost stays lost.
try {
  const qp = new URLSearchParams(location.search);
  if (qp.has("scout") || qp.has("disband") || qp.has("peace")) {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw && raw !== "null") {
      const d = JSON.parse(raw);
      // don't operate on a ledger this build cannot read
      if ((d.v || 1) > SAVE_V) throw new Error("save is from a newer build; surgery refused");
      if (qp.has("disband")) {
        const name = (qp.get("disband") || "").toLowerCase();
        const before = (d.settlements || []).length;
        d.settlements = (d.settlements || []).filter(s => (s.name || "").toLowerCase() !== name);
        if (d.settlements.length < before) console.log(`Disbanded settlement "${qp.get("disband")}".`);
      }
      if (qp.has("scout")) { d.sackedCamps = Math.max(5, d.sackedCamps || 0); d.nextSettleAt = 1; }   // 1, not 0: the loader treats 0 as unset
      if (qp.has("peace")) {
        const who = (qp.get("peace") || "").toLowerCase();
        for (const [id, w] of Object.entries(d.wars || {}))
          if ((who === "all" || id === who) && w.atWar) { w.atWar = false; w.warT = 0; console.log(`Peace with ${id}.`); }
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    }
    history.replaceState(null, "", location.pathname);
  }
} catch (e) { console.error("save surgery failed", e); }
let lastSaveKB = 0, saveTrimmed = false;
function saveGame() {
  if (gameState !== "playing") return;
  const bi = b => buildings.indexOf(b), ci = c => civs.indexOf(c), cpi = c => camps.indexOf(c);
  try {
    const data = {
      v: SAVE_V,
      savedAt: Date.now(),          // so the menu can say when you were last here
      // the recent tail only: a history worth reading, at a size worth keeping
      chron: chronicle.slice(-CHRON_SAVED),
      res: { ...res }, taxRate, taxTimer, laws: { ...laws }, zoom, settlementName, arrears,
      // which season the world was last seen in, and how bold the woods had grown.
      // A fresh page starts both at their opening values; without carrying them, a
      // colony saved in winter came back and was told winter had just fallen.
      lastSeason, lastTier,
      // the reign's running totals and what it has set down
      tally, achieved,
      cam: { x: cam.x, y: cam.y },
      hunterTimer, raidTimer, campRespawnTimer, worldT,
      tech: Object.fromEntries(Object.values(TECH).map(t => [t.id, t.done])),
      research: research ? { ...research } : null,
      usedNames: [...usedNames],
      civs: civs.map(c => ({
        name: c.name, who: c.who, nativeWho: c.nativeWho, gender: c.gender, child: !!c.child, growT: r1(c.growT || 0), age: c.age || 20, x: r1(c.x), y: r1(c.y), home: bi(c.home),
        profession: c.profession, hunger: r1(c.hunger), hp: r1(c.hp), maxHp: c.maxHp,
        happiness: r1(c.happiness), rebel: c.rebel, armed: c.armed, tool: c.tool,
        post: c.post ? { x: r1(c.post.x), y: r1(c.post.y) } : undefined,
        state: c.state === "inside" ? "inside" : c.state === "abed" ? "abed" : undefined,
        shelter: bi(c.shelter), ward: bi(c.ward),
        sick: c.sick ? r1(c.sick) : undefined,
        grief: (c.grief && c.grief.t > 0) ? { who: c.grief.who, t: r1(c.grief.t), w: r1(c.grief.w || 0.5) } : undefined,
        op: (c.op && Object.keys(c.op).length) ? c.op : undefined,
        feudWith: c.feudWith || undefined, feudT: c.feudT ? r1(c.feudT) : undefined,
        jail: bi(c.jail), jailT: c.jailT ? r1(c.jailT) : undefined,
        sk: skSave(c), sx: sxSave(c),
        conquered: c.conquered ? Math.round(c.conquered * 100) / 100 : undefined,
        inv: { ...c.inv },
      })),
      buildings: buildings.map(b => ({
        type: b.type, was: b.was || undefined, x: r1(b.x), y: r1(b.y), fire: r1(b.fire), placed: b.placed,
        hp: r1(b.hp), maxHp: b.maxHp, rot: b.rot, shop: b.shop || [], site: !!b.site,
        occupants: b.occupants.map(ci),
      })),
      // `site` has to travel with a farm. Left out, a staked-but-unbuilt farm
      // came back from a reload fully raised — three logs and six seeds bought a
      // finished field, and any half-dug one finished itself, if you saved.
      farms: farms.map(f => ({ x: r1(f.x), y: r1(f.y), ready: f.ready, growT: r1(f.growT),
                               site: !!f.site, workers: f.workers.map(ci) })),
      camps: camps.map(c => ({ ...c, x: r1(c.x), y: r1(c.y) })),
      chunks: [...chunks.entries()].filter(([k, ch]) => ch.dirty).map(([k, ch]) => chunkDelta(k, ch)).filter(Boolean),
      empireName, territoryColor, borderColor, uniformColor,
      territory: [...territory],
      roads: [...roads],
      sackedCamps, playT: r1(playT), nextSettleAt: r1(nextSettleAt), tutStep, colonyYear, vigSeen,
      // without these a reload re-teaches winter, plague and the rest from scratch
      lessonSeen, lessonQueue, lessonsOff,
      plagueT: r1(plagueT), plagueActive: r1(plagueActive), fuelT: r1(fuelT),
      corpses: corpses.map(cp => ({ x: r1(cp.x), y: r1(cp.y), who: cp.who, deceased: cp.deceased })),
      graves: graves.map(gv => ({ x: r1(gv.x), y: r1(gv.y), stone: gv.stone, deceased: gv.deceased })),
      settlements: settlements.map(st => ({ ...st })),
      conquests: conquests.map(cq => ({ ...cq })),
      natWars: natWars.map(w => ({ ...w })),
      foreignTowns: foreignTowns.map(t => ({ nation: t.nation, name: t.name, x: r1(t.x), y: r1(t.y),
                                             dm: t.dm, weapons: t.weapons })),
      foreign: foreign.map(b => ({ type: b.type, x: r1(b.x), y: r1(b.y), hp: r1(b.hp), maxHp: b.maxHp,
                                   rot: b.rot, keep: !!b.keep, town: foreignTowns.indexOf(b.town) })),
      garrisons: raiders.filter(r => r.garrison).map(r => ({ x: r1(r.x), y: r1(r.y), hp: r1(r.hp), maxHp: r.maxHp,
                                   dmg: r.dmg, nation: r.nation, town: foreignTowns.indexOf(r.garrison) })),
      foreignFolk: foreignFolk.map(f => ({ name: f.name, gender: f.gender, who: f.who, trade: f.trade,
                                   age: f.age, x: r1(f.x), y: r1(f.y), town: foreignTowns.indexOf(f.town) })),
      wars: Object.fromEntries(Object.entries(NATIONS)
                                     .map(([id, n]) => [id, warSave(n)]).filter(([, w]) => w)),
    };
    const json = JSON.stringify(data);
    lastSaveKB = Math.round(json.length / 1024);
    // The colony's ledger comes first: write it, and give up the luxuries if the
    // browser is short of room. Never let a full disk cost the player their game.
    const prev = localStorage.getItem(SAVE_KEY);
    try {
      localStorage.setItem(SAVE_KEY, json);
    } catch (e) {
      localStorage.removeItem(SAVE_KEY + "_backup");     // the spare copy is the first thing overboard
      localStorage.removeItem(SAVE_KEY + "_broken");
      try {
        localStorage.setItem(SAVE_KEY, json);
      } catch (e2) {
        // still no room: keep the colony, drop the forest's memory of felled trees
        data.chunks = [];
        const lean = JSON.stringify(data);
        lastSaveKB = Math.round(lean.length / 1024);
        localStorage.setItem(SAVE_KEY, lean);            // if this throws too, the outer catch reports honestly
        saveTrimmed = true;
      }
      return true;
    }
    // only once the real save is safe do we keep a spare, and never at its expense
    if (prev && prev !== "null" && prev !== json) {
      try { localStorage.setItem(SAVE_KEY + "_backup", prev); }
      catch (e) { localStorage.removeItem(SAVE_KEY + "_backup"); }
    }
    return true;
  } catch (e) { console.error("save failed", e); return false; }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  // Read the stamp before a single field is touched. A colony from a newer
  // build is left exactly as it lies — not stashed, not replaced by the spare,
  // not deleted. The caller must then refuse to start a game in this slot, or
  // the autosave would bury it ten seconds later.
  try {
    const stamp = JSON.parse(raw);
    if ((stamp.v || 1) > SAVE_V) { console.warn("save is from a newer build", stamp.v, ">", SAVE_V); return FROM_FUTURE; }
  } catch (e) { /* unparseable — the recovery path below is the right one */ }
  try {
    const d = JSON.parse(raw);
    Object.assign(res, d.res);
    res.dm = Math.round((res.dm || 0) * 10) / 10;   // scrub float drift out of older saves
    taxRate = d.taxRate; taxTimer = d.taxTimer; arrears = d.arrears || 0;
    settlementName = d.settlementName || "Neu Hamburg";
    Object.assign(laws, d.laws);
    zoom = d.zoom || 1;
    cam.x = d.cam.x; cam.y = d.cam.y;
    hunterTimer = d.hunterTimer; raidTimer = d.raidTimer; campRespawnTimer = d.campRespawnTimer;
    worldT = d.worldT || 3 * HOUR;
    for (const [id, done] of Object.entries(d.tech)) if (TECH[id]) TECH[id].done = done;
    if (d.tech.archery) TECH.matchlock.done = true;   // the bows of older colonies became muskets
    TECH.foraging.done = TECH.ownership.done = TECH.forging.done = true;
    research = d.research;
    usedNames.clear(); for (const n of d.usedNames) usedNames.add(n);
    civs.length = 0;
    for (const cd of d.civs) {
      const c = mkCiv(cd.name, cd.nativeWho || cd.who, cd.x, cd.y, cd.gender || (cd.name === "Sister" ? "f" : "m"));
      c.who = cd.who;
      Object.assign(c, { profession: cd.profession === "archer" ? "musketeer" : cd.profession,
        hunger: cd.hunger, hp: cd.hp, maxHp: cd.maxHp,
        happiness: cd.happiness, rebel: cd.rebel, armed: cd.armed, tool: cd.tool,
        child: !!cd.child, growT: cd.growT || 0, age: cd.age || 20, post: cd.post || null,
        conquered: cd.conquered || 0 });
      c.sick = cd.sick || 0;
      c.op = cd.op || {}; c.feudWith = cd.feudWith || null; c.feudT = cd.feudT || 0;
      c.jailT = cd.jailT || 0;
      c.grief = cd.grief || null;
      c.sk = Object.assign(freshSkills(), cd.sk || {});
      c.sx = Object.assign({}, cd.sx || {});
      if (c.profession === "musketeer") refreshAvatar(c);   // old archers pick up the new sprite
      Object.assign(c.inv, cd.inv);
      civs.push(c);
    }
    buildings.length = 0;
    for (const bd of d.buildings)
      buildings.push({ type: bd.type, was: bd.was || null, x: bd.x, y: bd.y, progress: -1, fire: bd.fire || 0,
                       torchP: -1, placed: bd.placed, bakeT: 0, occupants: [],
                       rot: bd.rot || 0, shop: bd.shop || [], site: !!bd.site, buildP: 0,
                       hp: bd.type === "wall" ? Math.min(bd.hp ?? 100, 100) : bd.type === "gate" ? Math.min(bd.hp ?? 60, 60) : bd.hp,
                       maxHp: bd.type === "wall" ? 100 : bd.type === "gate" ? 60 : bd.maxHp });
    d.civs.forEach((cd, i) => {
      if (cd.state === "inside" && cd.shelter !== undefined && buildings[cd.shelter] && civs[i]) {
        civs[i].shelter = buildings[cd.shelter];
        civs[i].state = "inside";
      }
      // a bed is a bed in a particular ward; if that ward is gone, they are up
      if (cd.state === "abed" && cd.ward !== undefined && buildings[cd.ward] &&
          buildings[cd.ward].type === "hospital" && civs[i]) {
        civs[i].ward = buildings[cd.ward];
        civs[i].state = "abed";
      } else if (civs[i]) { civs[i].ward = null; }
      // a sentence is served in a particular building, so point them back at it
      if (cd.jailT && cd.jail !== undefined && buildings[cd.jail] && civs[i]) {
        civs[i].jail = buildings[cd.jail];
        civs[i].state = "jailed";
      } else if (civs[i]) { civs[i].jailT = 0; civs[i].jail = null; }
    });
    d.buildings.forEach((bd, i) => {
      for (const cidx of bd.occupants) if (civs[cidx]) {
        buildings[i].occupants.push(civs[cidx]);
        civs[cidx].home = buildings[i];
      }
    });
    farms.length = 0;
    for (const fd of d.farms)
      farms.push({ x: fd.x, y: fd.y, ready: fd.ready, growT: fd.growT, progress: -1,
                   site: !!fd.site, buildP: 0,          // a save that predates this reads as built, as it always did
                   workers: fd.workers.map(i => civs[i]).filter(Boolean) });
    camps.length = 0;
    for (const cd of d.camps) camps.push({ ...cd });
    raiders.length = 0; visitors.length = 0; floaters.length = 0; balls.length = 0;
    selected = null; selectedBldg = null; selectedCamp = null; selectedGrave = null; selGroup = [];
    chunks.clear();
    for (const [k, ch] of (d.chunks || [])) {
      if (ch && ch.trees) {
        // legacy save: whole forests were written out. Keep them, but mark where
        // the wild growth ends so this chunk saves as a slim delta from now on.
        const base = genChunk(...k.split(",").map(Number));
        ch.wild = { t: Math.min(base.trees.length, ch.trees.length), s: ch.stones.length, p: ch.patches.length };
        ch.dirty = true;
        chunks.set(k, ch);
      } else if (ch) applyChunkDelta(k, ch);
    }
    empireName = d.empireName || "";
    territoryColor = d.territoryColor || "#7da083";
    borderColor = d.borderColor || "#c9a86a";
    uniformColor = d.uniformColor || "#2f52a8";
    $("terrColor").value = territoryColor; $("bordColor").value = borderColor;
    $("uniColor").value = uniformColor; reDye();
    territory.clear(); for (const k of (d.territory || [])) territory.add(k);
    roads.clear(); for (const k of (d.roads || [])) roads.add(k);
    if (!territory.size) { expandAround(0, -40, 2); for (const b of buildings) expandAround(b.x, b.y, 1); }
    sackedCamps = d.sackedCamps || 0; playT = d.playT || 0;
    nextSettleAt = d.nextSettleAt === undefined ? SETTLE_FIRST : d.nextSettleAt;
    tutStep = d.tutStep === undefined ? -1 : d.tutStep;
    colonyYear = d.colonyYear || 1683;
    plagueT = d.plagueT !== undefined ? d.plagueT : 600 + Math.random() * 600;
    plagueActive = d.plagueActive || 0;
    fuelT = d.fuelT !== undefined ? d.fuelT : FUEL_INTERVAL;
    vigSeen = d.vigSeen || {};
    lessonSeen = d.lessonSeen || {};
    lessonQueue = Array.isArray(d.lessonQueue) ? d.lessonQueue.filter(k => LESSONS[k]) : [];
    lessonsOff = !!d.lessonsOff;
    corpses.length = 0; for (const cp of (d.corpses || [])) corpses.push({ ...cp, bearer: null, carried: null });
    graves.length = 0; for (const gv of (d.graves || [])) graves.push({ ...gv, mason: null });
    settlements.length = 0; for (const st of (d.settlements || [])) settlements.push(st);
    for (const st of settlements) if (st.res) st.res.dm = Math.round((st.res.dm || 0) * 10) / 10;
    // every daughter town owns the ground it stands on — repairs older saves whose
    // settlements were founded before their clearing was claimed
    for (const st of settlements) if (st.x !== undefined) expandAround(st.x, st.y, 5);
    conquests.length = 0; for (const cq of (d.conquests || [])) conquests.push(cq);
    foreignTowns.length = 0; foreign.length = 0; foreignFolk.length = 0;
    for (const t of (d.foreignTowns || [])) foreignTowns.push({ ...t, fallen: false });
    for (const b of (d.foreign || [])) {
      const town = foreignTowns[b.town];
      if (!town) continue;
      const fb = { ...b, town, foreign: true, progress: -1, occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0 };
      foreign.push(fb);
      if (fb.keep) town.keep = fb;
    }
    for (const f of (d.foreignFolk || [])) {
      const town = foreignTowns[f.town];
      if (!town) continue;
      foreignFolk.push({ ...f, town, wpx: f.x, wpy: f.y, state: "idle", anim: 0, facing: 1, fleeT: 0 });
    }
    for (const g of (d.garrisons || [])) {
      const town = foreignTowns[g.town];
      if (!town) continue;
      raiders.push({ x: g.x, y: g.y, hp: g.hp, maxHp: g.maxHp, dmg: g.dmg, nation: g.nation, garrison: town,
                     camp: { x: town.x, y: town.y }, target: null, state: "patrol", anim: 0, facing: 1,
                     atkT: 0, foe: null, carry: 0, wpx: g.x, wpy: g.y });
    }
    // These two must be read AFTER the clock, the people and the buildings are in
    // place: the fallback for an older save computes them from the world itself,
    // and computing them from the world we are about to replace is worthless.
    tally = Object.assign(FRESH_TALLY(), d.tally || {});
    achieved = d.achieved || {};
    lastSeason = d.lastSeason || season();
    lastTier = d.lastTier || Math.max(1, difficulty());
    chronicle = Array.isArray(d.chron) ? d.chron.slice(-CHRON_MAX) : [];
    natWars = d.natWars || [];
    mapGrid = null;   // rebuilt with conquests on next use
    if (d.wars) {
      n_wars_init();
      warsReset();                       // silence in the save means peace
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
    $("lawCivBuild").checked = !!laws.civBuild;
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
  // The tutorial used to open here, so its first instruction — click your
  // Brother or Sister — was printed across a modal that covered them and
  // wanted a name first. It waits for the naming now.
  tutStep = -1;
  // a fresh colony is taught from scratch — these outlive a load otherwise,
  // since starting a new game does not reload the page
  lessonSeen = {}; lessonQueue = []; lessonsOff = false;
  $("empireModal").style.display = "block";
  paused = true;
  syncUI();
}
addEventListener("keydown", e => {
  if (typingInto(e)) return;   // a space in a settlement's name is not "skip"
  if (gameState === "cutscene" && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); advanceCutscene(); }
  if (gameState === "vignette" && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); advanceVignette(); }
});
$("cutscene").addEventListener("click", () => {
  if (gameState === "cutscene") advanceCutscene();
  else if (gameState === "vignette") advanceVignette();
});

// --- tutorial: from ash to a roof, then the woods are theirs ---
// Steps are either a TASK, which completes when the world says so, or a NOTE,
// which the player dismisses when they have read it. Notes never expire on a
// timer, and nothing here depends on an overlay being open at this instant —
// panels pause the game, and a paused game used to freeze the tutorial solid.
let tutStep = -1;
const tutSeen = { map: false, gov: false, tech: false, talked: false };
const TUT_STEPS = [
  { text: () => "That burnt cabin was here long before you were — whoever raised it is gone. Start by clicking your Brother or Sister to select them.",
    done: () => !!selected },
  { text: () => "That is how every order is given: pick someone, then click the thing you want done. Right-click cancels. With them still selected, click a spruce tree to fell it.",
    done: () => civs.some(c => c.inv.logs > 0) || res.logs > 0 },
  { text: () => "Logs ride in their pack, where the town cannot use them. Select the woodcutter and press \"Deposit goods to town storage\".",
    done: () => res.logs > 0 },
  { text: () => `Keep felling and depositing until the store holds 5 logs. (${Math.min(5, res.logs)}/5)`,
    done: () => res.logs >= 5 },
  { text: () => "A cabin needs a door. Open CRAFT ▾ and order one — 5 logs, and your civilian will hew it.",
    done: () => res.doors >= 1 },
  { text: () => `Rebuilding takes 20 logs in store. Fell and deposit until you have them. (${Math.min(20, res.logs)}/20)`,
    done: () => res.logs >= 20 },
  { text: () => "Now, with a civilian selected, click the burnt cabin to order the repair. That is your first roof.",
    done: () => !buildings.some(b => b.type === "burned") },
  { text: () => "Bread next. With a civilian selected, click a tuft of wild grass to gather seeds, deposit them, then open BUILD ▾ and lay out a Wheat Farm.",
    done: () => farms.length > 0 },
  { text: () => "Fields need hands. Select someone, use Recruit ▾ to make them a Farmer, then click the farm to assign them — they will tend it from then on.",
    done: () => farms.some(f => f.workers.length > 0) },
  { text: () => "Two hands will not build a colony. Open BUILD ▾ and lay out a Recruitment Center — wanderers come out of the woods to any colony that has one, and it is the only way your numbers grow beyond the children born here.",
    done: () => buildings.some(b => b.type === "recruit") },
  { text: () => "When a wanderer arrives, click them and talk. Win them over and they stay; press too hard and they walk back into the trees. Every soul you keep is another pair of hands.",
    done: () => civs.length > 2 || tutSeen.talked },
  { text: () => "Open BUILD ▾ again and raise a Market Center. It sells your surplus for DM, and DM pays for research, recruits and training.",
    done: () => buildings.some(b => b.type === "market") },
  { text: () => "Open the GOVERNMENT panel. Taxes are set there, and housed residents pay on the countdown in the top bar. Fair taxes keep people fed and loyal; greed breeds rebels.",
    done: () => tutSeen.gov },
  { text: () => "In that panel, press Open Tech Tree and begin any research. Two trees run from sharper axes to battle steel, paid for in DM and time.",
    done: () => tutSeen.tech || !!research || Object.values(TECH).filter(t => t.done).length > 3 },
  { text: () => "Press the MAP button to look at Europe, 1683. Your empire is drawn in your own colour; the nations around it grow stronger with the years and make war on each other.",
    done: () => tutSeen.map },
];

// ===== the manual, delivered when the thing happens =====
// Eight of these used to be tutorial steps: `note` entries with a Next button,
// stacked six-deep at the end of the opening sequence. A player who had just
// laid out a market was handed, in a row, the whole of winter, raiding, plague,
// hospitals, doctors and trade — every one of them describing something that
// had not happened yet and would not for another twenty minutes. Six essays is
// where a tutorial stops being read.
//
// Same words, held back until the world produces the thing they explain. The
// first frost teaches winter; the first fever teaches plague. Nothing is shown
// twice, and a player who skipped the tutorial is not taught at all.
const LESSONS = {
  comfort: "A Well is cheap and the colony is happier for it — and when plague comes, clean water keeps more of them on their feet. A Bakery turns your wheat into bread, and a Town Hall lets folk stock the stores without being told. Raise them when you can spare the logs.",
  upkeep: () => `⚖ Nothing you raise is free to keep. On every tax day the treasury pays ${WAGE} DM to each man under arms and ${CIVIC_UPKEEP} DM to each work that must be tended — the market, the bakery, the well, the forge, the recruitment center, the watchtower, the jail, the hospital, the town hall. Cabins, walls, lamps and farms cost nothing once they stand. An army is a standing choice against a hospital. If the treasury cannot pay, unpaid men lose heart and the works go untended: disband someone, pull something down, or raise the tax. The GOVERNMENT panel shows the whole bill.`,
  trade: "On the map you can send an envoy to a peaceful neighbour and talk their court into a trade route — gifts help, threats do not. Caravans then bring coin and goods to your gate.",
  winter: "❄ Winter comes every year. The fields sleep and the cold kills: anyone left outside too long freezes. Housed folk duck indoors to warm themselves, but the homeless simply die in the snow. Build roofs before riches.",
  raid: "⚔ Raiders come for your stores, and they come at night. Research Defending for walls and gates, and keep a watchtower to see them coming.",
  plague: "☠ Plague walks the towns of Europe — and it does not check your borders. The stricken work badly, waste away, and some do not rise again; it passes on its own in time. Wells keep more of them standing, and the fed and the housed weather it best. A skilled hand lost to fever is not quickly replaced.",
  hospital: "☤ The answer to it is a Hospital (BUILD ▾ — 25 logs, 8 stone, 14 DM) and a Doctor (select a civilian, Recruit ▾ — 30 DM). Doctors go out on their own, carry the fever-struck and the badly hurt back on a stretcher, and lay them in a bed: the wasting stops, the fever burns out four times faster, and wounds close. Four beds to a hospital, and patients eat from your stores. To mend a wounded soldier, select them and press Heal and they will walk to a bed. A housed, fed man knits a little back together sleeping in his own bed, but it is slow, and it will not touch a fever.",
  soldiers: "⚔ You have men under arms. Click one, then click another, and they gather into a band — keep clicking to raise a company. Send the band at bare ground and they march there in column and hold it; send them at a raider and they go for him. With two or more picked, DRAG across the ground instead of clicking and they form a line of battle, as long as you drag it, and they will keep that line.",
  closing: "That is the whole of it: gather and build by day, keep bellies full and taxes fair, wall the town before dark, research toward steel, and grow cell by cell. Wanderers, raiders and wars will find you on their own. Press ? at any time for every control. The woods are yours.",
};
let lessonSeen = {}, lessonQueue = [], lessonsOff = false;
// Raise a lesson the first time the world earns it. Queued rather than shown,
// so two at once (the first fever brings plague AND hospital) do not race.
function lesson(key) {
  if (lessonsOff || lessonSeen[key] || lessonQueue.includes(key) || !LESSONS[key]) return;
  lessonQueue.push(key);
}
const lessonText = key => (typeof LESSONS[key] === "function" ? LESSONS[key]() : LESSONS[key]);
function tutAdvance() {
  tutStep++;
  SFX.pickup();
  if (tutStep >= TUT_STEPS.length) { tutStep = -1; $("tutBanner").style.display = "none"; lesson("closing"); }
}
function updateTutorial(dt) {
  const banner = $("tutBanner");
  // the moment a band becomes possible is the moment to explain how to work one
  if (!lessonSeen.soldiers && civs.filter(groupable).length >= 2) lesson("soldiers");
  if (tutStep >= TUT_STEPS.length) tutStep = -1;
  if (gameState !== "playing") { banner.style.display = "none"; return; }
  // The opening sequence has the floor while it lasts; lessons wait behind it.
  if (tutStep < 0) {
    if (!lessonQueue.length) { banner.style.display = "none"; return; }
    banner.style.display = "block";
    $("tutHead").textContent = "THE WOODS TEACH YOU";
    $("tutText").textContent = lessonText(lessonQueue[0]);
    $("tutNext").style.display = "inline-block";
    return;
  }
  const st = TUT_STEPS[tutStep];
  banner.style.display = "block";
  $("tutHead").textContent = `STEP ${tutStep + 1} OF ${TUT_STEPS.length}`;
  $("tutText").textContent = st.text();
  $("tutNext").style.display = "none";
  if (st.done()) tutAdvance();
}
$("tutNext").addEventListener("click", () => {
  if (tutStep < 0 && lessonQueue.length) {
    lessonSeen[lessonQueue.shift()] = true;
    SFX.pickup();
  }
});
// Skipping means skipping: no opening steps, and no lessons later either.
$("tutSkip").addEventListener("click", () => {
  tutStep = -1; lessonsOff = true; lessonQueue.length = 0;
  $("tutBanner").style.display = "none";
  toast("The woods will teach you the rest.");
});

// --- menu / loading / game over ---
addEventListener("pointerdown", () => { try { SFX.setMaster(settings.master); } catch (e) {} }, { once: true });
// the regiment keeps the march you gave it
try { if (settings.marchTune) MUSIC.setMarch(settings.marchTune); } catch (e) {}
function assetsReady() {
  reDye();                                  // the coats are cut before anyone marches
  const mode = sessionStorage.getItem("forester_skip");
  sessionStorage.removeItem("forester_skip");
  if (mode === "new") { localStorage.removeItem(SAVE_KEY); doLoading(false); }
  else if (mode === "continue") doLoading(true);
  else {
    gameState = "menu";
    $("menu").style.display = "block";
    renderSaveList();
    MUSIC.play();
  }
}
// how long ago, in words a person would use
function agoText(ms) {
  if (!ms) return "";
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
// The front door lists the colonies you have going. Clicking one takes you back
// to it; the cross beside it burns it, and asks first.
function renderSaveList() {
  const box = $("menuSaves"), saves = listSaves();
  box.innerHTML = "";
  box.style.display = saves.length ? "block" : "none";
  $("menuContinue").style.display = "none";       // the list has replaced it
  for (const s of saves) {
    const row = document.createElement("div");
    row.className = "saveRow";
    const when = s.broken ? "cannot be read"
      : s.future ? "saved by a newer version —<br>reload the page"
      : `${s.year} · ${s.pop} soul${s.pop === 1 ? "" : "s"} · ${s.played} min<br>${esc(agoText(s.savedAt))}`;
    row.innerHTML =
      `<span class="slotNo">${s.i}</span>` +
      `<span class="slotName">${esc(s.broken ? "damaged save" : s.name)}` +
      (s.empire ? `<span style="color:#7a8f83"> · ${esc(s.empire)}</span>` : "") + `</span>` +
      `<span class="slotWhen">${when}</span>`;
    if (s.future) row.classList.add("stale");
    row.addEventListener("click", () => { useSlot(s.i); doLoading(true); });
    const del = document.createElement("button");
    del.className = "saveDel"; del.textContent = "✕";
    del.title = "Burn this colony's record";
    del.addEventListener("click", e => {
      e.stopPropagation();                        // the cross is not the row
      if (del.dataset.sure !== "1") {
        del.dataset.sure = "1"; del.textContent = "sure?";
        setTimeout(() => { if (del.dataset.sure === "1") { del.dataset.sure = ""; del.textContent = "✕"; } }, 3000);
        return;
      }
      deleteSlot(s.i);
      renderSaveList();
    });
    row.appendChild(del);
    box.appendChild(row);
  }
  const free = firstFreeSlot();
  $("menuSlotNote").textContent = free
    ? `${saves.length} of ${SAVE_SLOTS} slots used — a new colony takes slot ${free}.`
    : `All ${SAVE_SLOTS} slots are full. Burn one to begin another.`;
}
$("menuNew").addEventListener("click", () => {
  const free = firstFreeSlot();
  if (!free) return renderSaveList();             // the note already says why nothing happened
  useSlot(free);
  localStorage.removeItem(SAVE_KEY);              // a fresh slot starts empty
  doLoading(false);
});
$("menuContinue").addEventListener("click", () => doLoading(true));
// a colony that died frees its slot outright — spare copy and all, or the
// wreck could be resurrected by the recovery path on some later load
$("goNew").addEventListener("click", () => { deleteSlot(saveSlot); sessionStorage.setItem("forester_skip", "new"); location.reload(); });
$("goMenu").addEventListener("click", () => { deleteSlot(saveSlot); location.reload(); });

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
        // A colony this build is too old to read: go back to the front door and
        // say so. Never fall through to a new game — the slot is still theirs.
        if (restored === FROM_FUTURE) {
          gameState = "menu";
          $("menu").style.display = "block";
          renderSaveList();
          MUSIC.play();
          toast("That colony was saved by a newer version of Forester. Reload the page to get it.");
          return;
        }
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
// `chosen` is true when the player laid the ledger down themselves rather than
// losing everyone: the same ending, but it is theirs, and the screen says so.
function gameOver(chosen) {
  if (gameState === "over") return;
  gameState = "over";
  const head = $("goTitle"), sub = $("goSub");
  if (head && sub) {
    head.textContent = chosen ? "THE LEDGER IS CLOSED" : "THE COLONY IS GONE";
    sub.textContent = chosen
      ? `${settlementName} stood from 1683 to ${colonyYear} — ${tally.winters} winter${tally.winters === 1 ? "" : "s"}, ${ambitionsDone()} ambition${ambitionsDone() === 1 ? "" : "s"} achieved.`
      : "Every soul is dead. The woods take it back.";
  }
  deleteSlot(saveSlot);
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
  $("roadToggle").classList.toggle("active", roadMode);
  $("tbRotate").classList.toggle("hot", WALLLIKE.has(buildMode));
  // in a daughter town's clearing, the HUD shows that town's ledger instead of the capital's
  const hudCx = cam.x + canvas.width / 2 / zoom, hudCy = cam.y + canvas.height / 2 / zoom;
  const hudTown = townAt(hudCx, hudCy);
  const hr = hudTown ? (hudTown.res || {}) : res;
  $("rName").textContent = (hudTown ? hudTown.name : settlementName).toUpperCase();
  $("rLogs").textContent = hr.logs || 0; $("rSeeds").textContent = hr.seeds || 0;
  $("rStone").textContent = hr.stone || 0; $("rIron").textContent = hr.iron || 0;
  $("rDoors").textContent = hr.doors || 0; $("rBread").textContent = hr.bread || 0;
  $("rMeat").textContent = hr.meat || 0; $("rWeapons").textContent = hr.weapons || 0;
  $("rTools").textContent = hudTown ? 0 : buildings.filter(b => b.type === "forge").reduce((n, b) => n + ((b.shop || []).filter(i => i.kind === "tool").length), 0);
  $("rDM").textContent = Math.round((hr.dm || 0) * 10) / 10;
  $("rPop").textContent = hudTown ? hudTown.pop : civs.length;
  $("rTax").textContent = taxRate;
  $("rSeason").textContent = (season() === "winter" ? "❄ WINTER " : "SUMMER ") + colonyYear;
  $("rClock").textContent = (nightAmt() > 0.5 ? "☾ " : "☀ ") + clockText();
  const mm = Math.floor(taxTimer / 60), ss = Math.floor(taxTimer % 60);
  $("rTaxT").textContent = mm + ":" + String(ss).padStart(2, "0");
  const avg = civs.length ? Math.round(civs.reduce((s, c) => s + c.happiness, 0) / civs.length) : 0;
  $("rHappy").textContent = avg + "%";
  // Standing in a daughter town, the government panel speaks of THAT town:
  // its name, its stores, its people — not the capital's.
  const govFolk = hudTown ? civs.filter(c => c.home && townOf(c.home) === hudTown) : civs;
  const govAvg = govFolk.length ? Math.round(govFolk.reduce((s, c) => s + c.happiness, 0) / govFolk.length) : 0;
  $("govTitle").textContent = "GOVERNMENT OF " + (hudTown ? hudTown.name : settlementName).toUpperCase();
  $("govHappy").textContent = govAvg + "%";
  $("govDM").textContent = Math.round((hudTown ? (hr.dm || 0) : res.dm) * 10) / 10 + " DM";
  // the running cost of everything standing, before the next tax day asks for it
  {
    const men = civs.filter(isForce).length, works = civicWorks();
    const bill = wageBill() + upkeepBill();
    $("govBill").textContent = `${bill} DM a tax day` + (arrears > 0 ? ` · ${arrears} UNPAID` : "");
    $("govBill").style.color = arrears > 0 ? "#d8a0a0" : "";
    $("govLedger").innerHTML =
      `${men} under arms × ${WAGE} = ${wageBill()} DM · ${works} works × ${CIVIC_UPKEEP} = ${upkeepBill()} DM` +
      (arrears > 0 ? `<br><span style="color:#d8a0a0">Unpaid men lose heart. Disband, pull something down, or raise the tax.</span>` : "");
  }
  {
    const homeless = govFolk.filter(c => !c.home).length;
    const spare = buildings.filter(b => b.type === "cabin" && !b.site && !b.fire &&
                                        (!hudTown || townOf(b) === hudTown))
                           .reduce((n, b) => n + Math.max(0, cabinCapacity() - b.occupants.length), 0);
    $("govHomes").innerHTML = homeless
      ? `<b style="color:#d86a5a">${homeless} homeless</b> · ${spare} bed(s) free`
      : `all housed · ${spare} bed(s) free`;
  }
  {
    const counts = {};
    for (const c of govFolk) counts[c.child ? "child" : (c.profession || "no trade")] = (counts[c.child ? "child" : (c.profession || "no trade")] || 0) + 1;
    const orderProfs = ["farmer", "hunter", "lumberjack", "quarryman", "forager", "blacksmith", "doctor", "police", "soldier", "musketeer", "cavalry", "child", "no trade"];
    const parts = orderProfs.filter(p => counts[p]).map(p => `${p.charAt(0).toUpperCase() + p.slice(1)}: <b style="color:#c9a86a">${counts[p]}</b>`);
    for (const p of Object.keys(counts)) if (!orderProfs.includes(p)) parts.push(`${p}: <b style="color:#c9a86a">${counts[p]}</b>`);
    $("govProfs").innerHTML = parts.join(" &middot; ") || '<span style="color:#5a6b60">No one is left.</span>';
  }
  $("miCabin").textContent = `Log Cabin — ${costText(cabinCost())}`;
  $("miFarm").textContent = `Wheat Farm — ${costText(costOf("farm"))}`;
  $("miDoor").textContent = `Door — ${doorCost()} logs (selected civilian)`;
  $("miForge").textContent = `Forge — ${costText(STATIC_COSTS.forge)}`;
  $("miTownhall").textContent = `Town Hall — ${costText(STATIC_COSTS.townhall)}`;
  // menus stay lean: whatever is not yet researched simply is not shown
  for (const [b, t] of Object.entries(BUILD_GATES)) {
    const el = document.querySelector(`#buildMenu [data-build="${b}"]`);
    if (el) el.style.display = has(t) ? "" : "none";
  }
  for (const [p, t] of Object.entries(PROF_GATES)) {
    const el = document.querySelector(`#recruitMenu [data-prof="${p}"]`);
    if (el) el.style.display = has(t) ? "" : "none";
  }
  // The doctor is not gated on a technology but on a place to work: no ward, no
  // trade. Same rule as everything else — what you cannot do is not offered, and
  // the entry appears the moment the hospital is raised.
  const docItem = document.querySelector('#recruitMenu [data-prof="doctor"]');
  if (docItem) docItem.style.display = hospitals().length ? "" : "none";
  if (isOpen("folkPanel")) renderFolk();
  if ($("govPanel").style.display === "block" && $("civDrop").classList.contains("open")) {
    const list = $("civList");
    // only the rows are rebuilt — the search box (first child) keeps its focus
    [...list.querySelectorAll("button, .civNone")].forEach(el => el.remove());
    const cq = ($("civSearch").value || "").trim().toLowerCase();
    const shown = civs.filter(c =>
      !cq || `${c.name} ${c.child ? "child" : (c.profession || "no trade")}`.toLowerCase().includes(cq));
    for (const c of shown) {
      const b = document.createElement("button");
      b.className = "btn menu-item";
      b.style.fontSize = "11px";
      b.textContent = `${c.name} — ${c.child ? "child" : profLabel(c.profession)}, ${c.age !== undefined ? c.age : "?"} yrs — ${Math.round(c.happiness)}% happy` + (c.rebel ? " ⚠" : "");
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
    if (!shown.length) list.insertAdjacentHTML("beforeend",
      `<div class="civNone" style="padding:6px;color:#5a6b60;font-size:11px">${civs.length ? "No one matches." : "No one is left."}</div>`);
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
        row.innerHTML = `<span style="flex:1">${esc(s.name)} (pop ${s.pop})</span>`;
        const send = document.createElement("button");
        send.className = "btn"; send.style.fontSize = "10px"; send.textContent = "Load wagon ▶";
        send.title = "Choose exactly what the capital sends to this town";
        send.addEventListener("click", () => openCargo(s, 1));
        const take = document.createElement("button");
        take.className = "btn"; take.style.fontSize = "10px"; take.textContent = "◀ Fetch";
        take.title = "Choose what this town sends back to the capital";
        take.addEventListener("click", () => openCargo(s, -1));
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
    if (NARROW()) $("govPanel").style.display = "none";   // one sheet at a time on a phone
    $("cpName").textContent = selected.name.toUpperCase() + (selected.rebel ? " — REBEL" : "") +
      (selGroup.length > 1 && selGroup.includes(selected) ? ` (+${selGroup.length - 1} MORE)` : "");
    $("cpProf").textContent = (selected.profession || "none") + (selected.age !== undefined ? ` · age ${selected.age}` : "") +
                              (selected.sick > 0 ? " · ☠ PLAGUE-STRICKEN" : "") +
                              (selected.feudWith ? ` · ⚔ FEUDING WITH ${selected.feudWith.toUpperCase()}` : "") +
                              (isJailed(selected) ? ` · ⚖ JAILED (${Math.ceil(selected.jailT)}s)` : "");
    $("cpHome").textContent = selected.home ? "housed" : "homeless";
    $("cpHpN").textContent = Math.round(selected.hp) + "/" + selected.maxHp;
    $("cpHp").style.width = Math.max(0, selected.hp / selected.maxHp * 100) + "%";
    $("cpHungerN").textContent = Math.round(selected.hunger);
    $("cpHunger").style.width = Math.max(0, selected.hunger) + "%";
    $("cpHappyN").textContent = Math.round(selected.happiness);
    $("cpHappy").style.width = Math.max(0, selected.happiness) + "%";
    // the account behind the number: what is lifting them and what is grinding
    // them down, worst first, so the thing worth fixing is the thing on top
    {
      const rs = moodReasons(selected).slice(1).sort((a, b) => a[1] - b[1]);
      const bad = rs.filter(r => r[1] < 0), good = rs.filter(r => r[1] > 0);
      $("cpMood").innerHTML = (bad.length || good.length)
        ? bad.concat(good.reverse()).map(([why, n]) =>
            `<span class="moodBit ${n < 0 ? "down" : "up"}">${n > 0 ? "+" : ""}${Math.round(n)} ${esc(why)}</span>`).join("")
        : `<span class="moodBit up">nothing troubles them</span>`;
    }
    // what this person is doing at this moment, in words
    $("cpDoing").textContent = doingWhat(selected);
    // the trades they are actually good at
    {
      const best = SKILLS.map(s => [s.name, skillLvl(selected, s.id)])
                         .filter(([, l]) => l > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
      $("cpBest").textContent = best.length ? best.map(([n, l]) => `${n} ${l}`).join(" · ") : "no trade practised yet";
      // whether this is a person the colony cannot simply replace
      const sole = soleMasteries(selected);
      $("cpSole").textContent = sole.length
        ? `✦ the colony's only ${sole.map(m => m.name.toLowerCase()).join(" and ")} — next hand ${sole[0].next}`
        : "";
      $("cpSole").style.display = sole.length ? "block" : "none";
    }
    $("cpTool").textContent = (selected.tool ? "good tool" : "none") + (selected.armed ? " · armed" : "");
    $("cpLogs").textContent = selected.inv.logs; $("cpSeeds").textContent = selected.inv.seeds;
    $("cpStone").textContent = selected.inv.stone; $("cpIron").textContent = selected.inv.iron;
    $("cpWheat").textContent = selected.inv.wheat; $("cpBread").textContent = selected.inv.bread;
    $("cpMeat").textContent = selected.inv.meat; $("cpDM").textContent = selected.inv.dm;
    const assigned = farms.filter(f => f.workers.includes(selected)).length;
    // who they think well of, and who they cannot abide
    {
      const op = Object.entries(selected.op || {}).filter(([, v]) => Math.abs(v) >= 12)
        .sort((a, b) => a[1] - b[1]);
      const word = v => v <= FEUD_AT ? "hates" : v <= -40 ? "loathes" : v <= -12 ? "dislikes"
                      : v >= 60 ? "is devoted to" : v >= 40 ? "is fond of" : "likes";
      const worst = op.slice(0, 2), best = op.slice(-2).reverse().filter(e => e[1] > 0);
      const say = [...worst.filter(e => e[1] < 0), ...best]
        .map(([n, v]) => `${word(v)} ${n}`).slice(0, 3);
      $("cpOpinions").textContent = say.length ? say.join(" · ") : "";
    }
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
  if (NARROW() && (selectedGrave || selectedBldg || selectedCamp)) $("govPanel").style.display = "none";
  if (selectedGrave) {
    bp.style.display = "block";
    const d = selectedGrave.deceased;
    $("bpName").textContent = "GRAVE OF " + d.name.toUpperCase();
    $("bpInfo").textContent = `${d.name}, ${d.profession}, ${d.cause} in the year ${d.year}, aged ${d.age}.` +
      (selectedGrave.stone ? " The stone stands." : " Awaiting a gravestone.");
    $("bpOcc").textContent = "at rest";
    $("bpOccList").style.display = "none";
    $("bpTurnOut").style.display = "none";
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
    $("bpOccList").style.display = "none";
    $("bpTurnOut").style.display = "none";
    $("bpDismantle").style.display = "none";
  } else {
    bp.style.display = "block";
    $("bpDismantle").style.display = "block";
    const b = selectedBldg;
    const isFarm = farms.includes(b);
    $("bpName").textContent = isFarm ? "WHEAT FARM" : bldgName(b).toUpperCase();
    renderBldgInfo(b, isFarm);
    const inside = isFarm ? [] : sheltering(b);
    const held = (!isFarm && b.type === "jail") ? civs.filter(o => isJailed(o) && o.jail === b) : [];
    const lying = (!isFarm && b.type === "hospital") ? abed(b) : [];
    $("bpOcc").textContent = isFarm ? "—"
      : b.type === "jail" ? (held.length ? `${held.length} held` : "empty")
      : b.type === "hospital" ? `${lying.length}/${HOSP_BEDS} beds taken`
      : `${b.occupants.length} living here${inside.length ? `, ${inside.length} indoors` : ""}`;
    // Everyone under this roof, by name and pickable. Someone standing inside is
    // not on the map to be clicked, so without this there is no way to reach them.
    const roll = [];
    for (const o of held) roll.push({ c: o, note: `held, ${Math.ceil(o.jailT)}s left` });
    for (const o of lying) roll.push({ c: o, note: isSick(o) ? `abed, fever ${Math.ceil(o.sick)}s` : `abed, ${Math.round(o.hp)}/${o.maxHp} health` });
    for (const o of (isFarm ? [] : b.occupants)) roll.push({ c: o, note: "lives here" });
    for (const o of inside) if (!roll.some(r => r.c === o)) roll.push({ c: o, note: "sheltering" });
    for (const r of roll) if (inside.includes(r.c) && r.note === "lives here") r.note = "lives here, indoors";
    const list = $("bpOccList");
    list.innerHTML = "";
    list.style.display = roll.length ? "block" : "none";
    for (const { c, note } of roll) {
      const row = document.createElement("button");
      row.className = "btn menu-item";
      row.style.fontSize = "11px";
      row.textContent = `${c.name} — ${c.child ? "child" : profLabel(c.profession)} (${note})`;
      row.addEventListener("click", () => {
        selected = c; selectedBldg = null; selectedCamp = null; selectedGrave = null;
        selGroup = groupable(c) ? [c] : [];
        syncUI();
      });
      list.appendChild(row);
    }
    $("bpTurnOut").style.display = inside.length ? "block" : "none";
    $("bpTurnOut").textContent = inside.length > 1 ? `Turn out all ${inside.length}` : "Turn them out";
    $("bpBuyWeapon").style.display = (!isFarm && b.type === "forge" && (b.shop || []).some(i => i.kind === "weapon")) ? "block" : "none";
  }
  syncSkills();   // an open tree keeps pace with the work and the treasury
}

// ===== shoving the map with the pointer =====
// Put the cursor against the edge of the screen and the country slides that
// way, the way every RTS since Dune II has done it. The speed ramps with how
// far into the band the pointer has gone, so a glancing pass along the edge
// drifts and a cursor pinned to the very rim runs.
//
// A finger has no hover, so this is for a mouse only.
const EDGE_BAND = 24;          // px of screen edge that pushes
const EDGE_FLOOR = 0.35;       // the gentlest shove, at the inner lip of the band
function edgePan(dt, fast) {
  if (!settings.edgePan || IS_TOUCH || !edge.on) return;
  const w = canvas.width, h = canvas.height;
  // how hard each edge is pushing: 0 outside the band, 1 hard against the rim
  const push = d => (d >= EDGE_BAND ? 0 : EDGE_FLOOR + (1 - EDGE_FLOOR) * (1 - Math.max(0, d) / EDGE_BAND));
  const l = push(edge.x), r = push(w - edge.x), u = push(edge.y), d2 = push(h - edge.y);
  const v = CAM_SPEED * settings.camSpeed * fast / zoom * dt;
  if (l) cam.x -= v * l;
  if (r) cam.x += v * r;
  if (u) cam.y -= v * u;
  if (d2) cam.y += v * d2;
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
  edgePan(dt, fast);
  mouse.wx = cam.x + mouse.x / zoom;
  mouse.wy = cam.y + mouse.y / zoom;
  // The woods have a voice now, and it answers to the season, the hour, the
  // sickness and the fires. Wind used to be the only ambient sound, and only
  // while the camera was high enough to see the whole valley — down among the
  // cabins the world was silent.
  try {
    AMBIENCE.update(dt, {
      playing: gameState === "playing" && !paused,
      season: season(), night: nightAmt(), hour: clockHours(),
      high: zoom < 0.62,
      plague: plagueActive > 0 || civs.some(isSick),
      fire: buildings.some(b => b.fire > 0),
    });
  } catch (e) {}

  // the tutorial keeps its own time: several steps ask you to open a panel or
  // the map, and those pause the world. Ticking it here lets those steps finish.
  updateTutorial(dt);
  updateConvoy(dt);

  if (paused) return;

  volleySounds = 0;      // the frame's ration of musket reports
  worldT += dt;
  rescueStuck(dt);
  updateNationWars(dt);
  updateNationTrade(dt);
  updateCalamities(dt);
  updatePlague(dt);
  updateWards(dt);
  checkAmbitions(dt);
  updateFuel(dt);
  updateFeuds(dt);
  updateJail(dt);
  updateRefugees(dt);
  if (civs.length >= 10) vignette("village");
  // The reckoning climbs a step at a time and each step used to announce itself,
  // so a good afternoon at market — three tiers at once — meant the same warning
  // three times in a row, and a growing colony heard it every minute or so. It
  // is the most frequent line in the game by a distance and it says nothing new.
  // The tier still rises the moment it rises; the town crier is given a rest.
  if (difficulty() > lastTier) {
    lastTier = difficulty();
    if (playT - lastTierToldT > 240) {
      lastTierToldT = playT;
      toast("⚠ Word of your colony's wealth spreads. The woods grow bolder…");
    }
  }
  updateResearch(dt);
  playT += dt;
  updateWars(dt);
  updateOccupation(dt);
  updateSettlements(dt);
  maybeOfferSettlement();

  for (const f of floaters) { f.t -= dt; f.y -= 26 * dt; }
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t <= 0) floaters.splice(i, 1);
  for (const sm of smokes) {
    sm.t -= dt;
    if (sm.grow !== undefined) {          // powder smoke: it spreads, slows, and hangs
      sm.x += sm.vx * dt; sm.y += sm.vy * dt;
      const drag = Math.pow(0.3, dt);     // the bank loses its push almost at once
      sm.vx *= drag; sm.vy *= drag;
      sm.vy -= 4.5 * dt;                  // what is left of it lifts away
      sm.r += sm.grow * dt;
    } else {                              // hearths and housefires, as they always were
      sm.y -= 16 * dt; sm.x += sm.vx * dt * 0.4; sm.r += 2.4 * dt;
    }
  }
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
    // ===== and then the colony pays what it owes =====
    // Nothing the player built ever cost anything to keep. A soldier raised was
    // a soldier for life, free; a hospital raised was free forever after. So a
    // grown colony had no running costs at all, the treasury only climbed, and
    // by the fifteenth minute there was nothing left to decide. An army is a
    // standing choice against a hospital now, and sprawl is a bill.
    const wages = wageBill(), upkeep = upkeepBill(), owed = wages + upkeep;
    const canPayNow = Math.max(0, res.dm - treasuryFloor());
    const paidOut = Math.min(owed, canPayNow);
    res.dm -= paidOut;
    arrears = owed - paidOut;
    tally.taxDays++;
    if (owed > 0) lesson("upkeep");     // the first tax day that actually costs something
    if (arrears > 0) tally.arrearDays++; else if (owed > 0) tally.billsPaid++;
    const acct = [`${total} DM collected`];
    if (wages) acct.push(`${wages} in wages`);
    if (upkeep) acct.push(`${upkeep} in upkeep`);
    if (arrears > 0) acct.push(`${arrears} UNPAID`);
    tell("work", total > 0 || owed > 0
      ? `Tax day: ${acct.join(", ")} — ${Math.max(0, res.dm)} DM in the treasury.`
      : "Tax day — but the people's pockets are empty.");
    if (arrears > 0)
      tell("work", `⚠ The treasury cannot meet its bills: ${arrears} DM short. Men go unpaid and the works go untended.`);
    if (total > 0) SFX.coin();
  }

  for (const ch of visibleChunks(CHUNK * 2))
    for (const t of ch.trees)
      if (t.alive && t.growth < 1) t.growth = Math.min(1, t.growth + dt / (SAPLING_GROW * (has("replanting") ? 0.5 : 1)));
  if (season() !== lastSeason) {
    lastSeason = season();
    if (lastSeason === "winter") {
      colonyYear++;
      tally.winters++;
      tell("land", `❄ Winter falls over the woods — the year turns to ${colonyYear}. The fields sleep; keep the larders full.`);
      vignette("firstWinter");
      lesson("winter");                 // taught by the first frost, not in the first minute
      for (const c of [...civs]) {
        c.age = (c.age || 20) + 1;
        if (!c.child && c.age > 55 && Math.random() < (c.age - 55) * 0.05)
          killCiv(c, `died peacefully of old age, aged ${c.age}`);
      }
    } else {
      tell("land", "The thaw comes — the fields wake, and the woods turn green again.");
      // spring births: each woman has a 26% chance of a child after every winter
      for (const m of civs.filter(c => c.gender === "f" && !c.child)) {
        if (Math.random() < 0.26) {
          const g = Math.random() < 0.5 ? "f" : "m";
          const kid = mkCiv(nextName(g), g === "f" ? "sister" : "brother", m.x + 14, m.y + 10, g);
          kid.child = true; kid.growT = 0; kid.age = 0;
          kid.home = m.home;
          if (m.home) m.home.occupants.push(kid);
          civs.push(kid);
          tally.born++;
          tell("life", `A child is born to ${m.name}: a ${g === "f" ? "daughter" : "son"}, ${kid.name}.`);
          SFX.pickup();
          vignette("firstChild");
        }
      }
    }
  }
  for (const f of farms) if (!f.ready && season() !== "winter" && (f.growT += dt) >= farmRipen()) f.ready = true;
  if (alarmToldT > 0) alarmToldT -= dt;          // the alarm may be cried again in a while
  SFX.fireLoop(buildings.some(b => b.fire > 0) || foreign.some(b => b.fire > 0));
  // the townsfolk: about their business until soldiers come, then they run
  for (const f of foreignFolk) {
    const sp = BASE_WALK * snowPace();
    let flee = null, fd = 220;
    for (const c of civs) if (isForce(c)) {
      const d = Math.hypot(c.x - f.x, c.y - f.y);
      if (d < fd) { fd = d; flee = c; }
    }
    if (flee) {
      const d = Math.max(1, fd);
      f.x += (f.x - flee.x) / d * sp * 0.75 * dt;
      f.y += (f.y - flee.y) / d * sp * 0.75 * dt;
      f.facing = flee.x < f.x ? 1 : -1;
      f.anim += dt * 9;
      f.fleeT = 2;
      // driven far enough from home and they simply scatter into the woods
      if (Math.hypot(f.x - f.town.x, f.y - f.town.y) > 900) f.gone = true;
      continue;
    }
    f.fleeT = Math.max(0, (f.fleeT || 0) - dt);
    const wd = Math.hypot(f.wpx - f.x, f.wpy - f.y);
    if (wd < 8) {
      const a = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 200;
      f.wpx = f.town.x + Math.cos(a) * rr; f.wpy = f.town.y + Math.sin(a) * rr * 0.8;
      f.anim = 1;
    } else {
      f.x += (f.wpx - f.x) / wd * sp * 0.32 * dt;
      f.y += (f.wpy - f.y) / wd * sp * 0.32 * dt;
      f.facing = f.wpx < f.x ? -1 : 1;
      f.anim += dt * 5;
    }
  }
  for (let i = foreignFolk.length - 1; i >= 0; i--) if (foreignFolk[i].gone) foreignFolk.splice(i, 1);
  // enemy timber burns down to nothing — the town has no one left to rebuild it
  for (const fb of [...foreign]) {
    if (!fb.fire) continue;
    fb.fire -= dt;
    if (settings.smoke && Math.random() < dt * 3)
      smokes.push({ x: fb.x + (Math.random() * 30 - 15), y: fb.y - 30, r: 6 + Math.random() * 5, vx: 6, t: 2.2, max: 2.2 });
    if (fb.fire <= 0) {
      fb.fire = 0;
      const town = fb.town, wasKeep = fb.keep;
      foreign.splice(foreign.indexOf(fb), 1);
      if (wasKeep && !town.fallen) foreignTownFalls(town);
      else if (!wasKeep) toast(`The ${BLDG_NAMES[fb.type] || fb.type} of ${town.name} has burned to the ground.`);
    }
  }
  for (const b of [...buildings]) {
    igniteCheck(b, dt);
    // In winter every chimney in the colony draws on the same woodpile: while
    // there are logs in store they all smoke without pause, and when the last
    // one is burnt they all stop — an occupied cabin included. Out of winter,
    // a lived-in cabin and the bakery put up a puff now and then as they always did.
    const winterNow = season() === "winter";
    const hearth = !b.site && (winterNow ? hearthsLit
                                         : (b.type === "bakery" || (b.type === "cabin" && b.occupants.length)));
    if (settings.smoke && !b.fire && hearth && (b.type === "cabin" || b.type === "bakery")) {
      const steady = winterNow;
      b.smokeT = (b.smokeT === undefined ? Math.random() * 8 : b.smokeT) - dt;
      if (b.smokeT <= 0) {
        b.smokeT = steady ? 0.5 + Math.random() * 0.4 : 8 + Math.random() * 14;
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
        const bl = ledgerAt(b.x, b.y);      // an oven bakes with the wheat of its own town
        if ((bl.wheat || 0) >= 2) { bl.wheat -= 2; bl.bread = (bl.bread || 0) + 1; float(b.x, b.y - 100, "+1 bread", "#c9a86a"); }
      }
    }
  }

  if (buildings.some(b => b.type === "recruit" && !b.fire && !b.site)) {
    hunterTimer -= dt;
    if (hunterTimer <= 0) {
      hunterTimer = 100 + Math.random() * 80;
      const houses = buildings.filter(b => b.type === "recruit" && !b.fire && !b.site).length;
      if (visitors.length < Math.max(2, houses + 1)) spawnVisitor();
    }
  }
  for (const v of [...visitors]) updateVisitor(v, dt);

  // raids
  if (has("defending") || has("raiding")) {
    campRespawnTimer -= dt;
    if (campRespawnTimer <= 0) {
      // the woods fill in faster as the colony grows, and while they are far
      // below what your wealth warrants, more than one band moves in at once
      campRespawnTimer = Math.max(150, 300 * Math.pow(0.93, difficulty() - 1));
      spawnCamps(camps.length + 1 < campCap() ? 2 : 1);
    }
  }
  if (camps.length) {
    raidTimer -= dt;
    if (raidTimer <= 0) {
      raidTimer = Math.max(RAID_FLOOR, (RAID_MIN + Math.random() * (RAID_MAX - RAID_MIN)) * Math.pow(0.95, difficulty() - 1));
      if (season() !== "winter") { tally.raids++; spawnRaid(); }   // raiders overwinter in their camps
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
        if (onWatch < 2 && raiders.length < attackerCap() + 6) raiders.push(mkRaider(cp, "patrol"));
      }
    }
  }
  if (season() !== "winter" && nightAmt() > 0.9 && camps.length) {
    ambushT -= dt;
    if (ambushT <= 0) {
      ambushT = Math.max(90, (140 + Math.random() * 90) * Math.pow(0.95, difficulty() - 1));
      // the night ambush falls on any town left unwalled with coin in the chest —
      // the capital's walls do not shelter a settlement half the map away
      const openTowns = townsWithBuildings().filter(t => townCoin(t) >= 5 &&
        !buildings.some(b => (b.type === "wall" || b.type === "gate") && !b.fire && townAt(b.x, b.y) === t));
      const town = openTowns.length ? openTowns[Math.floor(Math.random() * openTowns.length)] : undefined;
      const guards = civs.filter(c => isForce(c) && c.state !== "sleeping" && townAt(c.x, c.y) === town);
      const targets = town === undefined ? [] : raidTargetsIn(town).filter(b => !b.fire);
      if (targets.length && attackersAfield() < attackerCap()) {
        const tx = town ? town.x : 0, ty = town ? town.y : 0;
        let camp = camps[0], bd = Infinity;
        for (const cp of camps) { const d = Math.hypot(cp.x - tx, cp.y - ty); if (d < bd) { bd = d; camp = cp; } }
        let sent = 0;
        // three come out of the dark — but never past the field's ceiling. Testing
        // it once and then pushing three was how a cap of two became three men.
        for (let i = 0; i < 3 && attackersAfield() < attackerCap(); i++) {
          const r = mkRaider(camp, "approach");
          r.target = targets[Math.floor(Math.random() * targets.length)];
          r.arsonist = Math.random() < 0.5;   // half come to burn, half to steal
          if (guards.length && i === 0) r.foe = guards[Math.floor(Math.random() * guards.length)];
          raiders.push(r);
          sent++;
        }
        if (sent) {
          SFX.warHorn();
          tell("war", "⚠ Raiders pour out of the dark — the town is unwalled and they know it!");
        }
      }
    }
  } else ambushT = Math.max(ambushT, 25);
  for (const b of buildings) if (b.climbP) b.climbP = 0;   // climbers re-assert it below
  for (const f of foreign) if (f.climbP) f.climbP = 0;
  for (const r of [...raiders]) updateRaider(r, dt);
  // a ball flies straight from the muzzle: it does not chase, and it can miss.
  // it moves faster than a frame is long, so test the whole path it swept, not
  // just where it landed — otherwise a point-blank shot passes clean through.
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    const x0 = b.x, y0 = b.y, step = BALL_SPEED * dt;
    b.x += b.vx * step; b.y += b.vy * step;
    b.travel = (b.travel || 0) + step;
    const t = b.target, live = t && (civs.includes(t) || raiders.includes(t));
    if (live) {
      const tx = t.x, ty = t.y - CHAR_SIZE * 0.45;          // chest height
      const sx = b.x - x0, sy = b.y - y0, len2 = sx * sx + sy * sy;
      let u = len2 ? ((tx - x0) * sx + (ty - y0) * sy) / len2 : 0;
      u = Math.max(0, Math.min(1, u));
      const near = Math.hypot(x0 + sx * u - tx, y0 + sy * u - ty);
      if (near < 17) {
        strikeUnit(b.from && civs.includes(b.from) ? b.from : { task: null }, t, b.dmg);
        balls.splice(i, 1);
        continue;
      }
    }
    if (b.travel > MUSKET_RANGE + 120) balls.splice(i, 1);   // spent
  }
  // the watchtower sounds the war-drums — until the raiders leave, or die
  const towers = buildings.filter(b => b.type === "watchtower" && !b.fire && !b.site);
  // and the watch does more than watch: a musket rests on the rail, and from that
  // height it reaches further than any man on the ground
  for (const tw of towers) {
    tw.reloadT = (tw.reloadT === undefined ? Math.random() * TOWER_RELOAD : tw.reloadT) - dt;
    if (tw.reloadT > 0) continue;
    let mark = null, md = TOWER_RANGE;
    for (const r of raiders) {
      if (r.garrison) continue;                       // a distant town's guard is not our quarrel
      const d = Math.hypot(r.x - tw.x, r.y - tw.y);
      if (d < md) { md = d; mark = r; }
    }
    if (!mark) { tw.reloadT = 0.4; continue; }        // nothing in the sights: look again shortly
    tw.reloadT = TOWER_RELOAD;
    const mx = tw.x + (mark.x < tw.x ? -10 : 10), my = tw.y - BLDG_SIZE * 0.72;
    const tx = mark.x, ty = mark.y - CHAR_SIZE * 0.45;
    const d2 = Math.max(1, Math.hypot(tx - mx, ty - my));
    balls.push({ x: mx, y: my, target: mark, from: tw, dmg: Math.round(musketDmg(md) * 0.8),
                 vx: (tx - mx) / d2, vy: (ty - my) / d2 });
    if (onScreen(tw.x, tw.y)) {
      SFX.musket();
      smokes.push({ x: mx + (mark.x < tw.x ? -6 : 6), y: my, r: 5 + Math.random() * 3,
                    vx: (mark.x < tw.x ? -22 : 22), t: 1.2, max: 1.2 });
    }
  }
  const threat = towers.length > 0 && raiders.some(r => r.state !== "patrol" &&
    towers.some(tw => Math.hypot(tw.x - r.x, tw.y - r.y) < 750));
  MUSIC.battle(threat && gameState === "playing");

  planVolleys();          // settle the line's volley before anyone in it moves
  for (const c of [...civs]) {
    // grief wears off; it does not have to be tended, only outlived
    if (c.grief) { c.grief.t -= dt; if (c.grief.t <= 0) c.grief = null; }
    c.hunger = Math.max(0, c.hunger - HUNGER_DECAY * (has("horsefeed") ? 0.8 : 1) * (season() === "winter" ? 1.15 : 1) * dt);
    // Nobody eats in their sleep, and nobody starves in it either. A man whose
    // belly is truly empty gets up, eats whatever is in the house or the stores,
    // and lies back down. Without this the only thing standing between the
    // colony and a night of quiet deaths is the exact length of the night.
    if (c.hunger < 20 && (c.state === "sleeping" || c.state === "warming")) {
      if (c.inv.bread > 0) { c.inv.bread--; eat(c, "bread"); }
      else if (c.inv.meat > 0) { c.inv.meat--; eat(c, "meat"); }
      else if (c.inv.wheat > 0) { c.inv.wheat--; eat(c, "wheat"); }
      else eatFromStores(c);
    }
    if (c.hunger <= 0) {
      c.hp -= STARVE_DPS * dt;
      if (c.hp <= 0) { killCiv(c, "starved to death"); continue; }
    }

    // the shot and the loading run wherever he is — leave the fight mid-reload and
    // the ramrod still comes out, so he is never frozen in a pose he has left behind
    if (c.fireT > 0) c.fireT = Math.max(0, c.fireT - dt);
    if (c.reloadT > 0) {
      const rt = reloadTime();
      const kWas = 1 - c.reloadT / rt;              // where his hands were last frame
      c.reloadT -= dt;
      const kNow = c.reloadT > 0 ? 1 - c.reloadT / rt : 1;
      const onScreen = c.x > cam.x - 100 && c.x < cam.x + canvas.width / zoom + 100 &&
                       c.y > cam.y - 100 && c.y < cam.y + canvas.height / zoom + 100;
      // the loading drill is heard where it is seen: each stage announces itself
      // as he reaches it, so a whole line reloading sounds like a line reloading
      if (onScreen) for (const [mark, snd] of RELOAD_DRILL) if (kWas < mark && kNow >= mark) snd();
      if (c.reloadT <= 0) { c.reloadT = 0; c.loaded = true; }
    }
    if (c.profession !== "musketeer" && (c.reloadT || c.fireT)) { c.reloadT = 0; c.fireT = 0; c.loaded = true; }

    if (c.age === undefined) c.age = 20 + Math.floor(Math.random() * 26);
    if (c.child) {
      c.growT = (c.growT || 0) + dt;
      if (c.growT >= 300) { c.child = false; toast(`${c.name} has come of age and joins the working colony.`); }
    }
    // a conquered soul makes its peace slowly — a quarter hour under your flag
    if (c.conquered) c.conquered = Math.max(0, c.conquered - dt / 900);
    const target = happinessTarget(c);
    c.happiness += Math.sign(target - c.happiness) * Math.min(Math.abs(target - c.happiness), 2.5 * dt);
    maybeRebel(c, dt);

    // winter cold: five minutes in the open kills (guards last seven)
    if (season() === "winter") {
      // A roof is only worth having with a fire under it. The colony burns one
      // log from the common store every thirty seconds of winter; when the last
      // one goes, the chimneys stop smoking and a house warms nobody — the folk
      // inside freeze exactly as if they were standing in the snow.
      if (INDOORS.has(c.state) && hearthsLit) {
        c.coldT = Math.max(0, c.coldT - dt * 8);
      } else {
        c.coldT = (c.coldT || 0) + dt;
        const limit = isForce(c) ? 210 : 150;
        if (c.coldT > limit - 60 && !c.coldWarned) {
          c.coldWarned = true;
          toast(!hearthsLit ? `❄ ${c.name} is freezing — the hearths are out. Fell wood, or they die indoors.` :
                c.home ? `❄ ${c.name} is freezing — they need to get indoors.` :
                         `❄ ${c.name} is freezing in the open — without a roof, the cold will take them.`);
        }
        if (c.coldT > limit) {
          c.hp -= 2 * dt;
          if (Math.random() < dt * 1.5) float(c.x, c.y - 74, "❄", "#bcd8e8");
          if (c.hp <= 0) { killCiv(c, hearthsLit ? "froze to death in the open" : "froze to death beside a cold hearth"); continue; }
        }
      }
    } else { c.coldT = 0; c.coldWarned = false; }

    // housed folk duck inside to warm up before the cold turns deadly —
    // dropping their work if the frost is close on their heels
    if (season() === "winter" && c.home && !c.rebel &&
        !["warming", "sleeping", "inside", "fighting", "sieging"].includes(c.state) &&
        (!c.task || c.task.kind !== "warmUp")) {
      const danger = c.coldT > (isForce(c) ? 210 : 150) - 70;   // freezing starts at 150/210: leave a real margin
      const idleChill = c.state === "idle" && c.coldT > 60;
      if (danger || idleChill) {
        if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
        order(c, { kind: "warmUp", x: c.home.x, y: c.home.y + 12 });
      }
    }

    const nightNow = nightAmt();
    // The doctor's night call is settled before the sleepers are skipped over —
    // a man asleep never reaches doctorAI further down, and a doctor who cannot
    // be woken is no use at all during the ten hours the colony spends in bed.
    if (isDoc(c) && !c.rebel && INDOORS.has(c.state) && c.state !== "abed") doctorAI(c);
    if (c.state === "sleeping") {
      // A night in your own bed knits a little back together — a fed man under
      // his own roof wakes better than he lay down. It is a fourteenth of what
      // a hospital does and it will not touch a fever, so a colony still needs
      // a ward; it only means a scratch does not follow a man to his grave for
      // want of one. The hungry get nothing: sleep is not supper.
      if (!isSick(c) && c.hp < c.maxHp && c.hunger > 30 && c.home && !c.home.fire)
        c.hp = Math.min(c.maxHp, c.hp + REST_HEAL * dt);
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
    // Someone sent indoors stays indoors. They do no work and take no orders
    // until they are turned out — or until the roof over them stops being one.
    if (c.state === "jailed") {
      if (isJailed(c) && c.jail) { c.x = c.jail.x; c.y = c.jail.y + 18; continue; }
      c.state = "idle";
    }
    if (c.state === "inside") {
      if (!c.shelter || !buildings.includes(c.shelter) || c.shelter.fire || !canShelter(c.shelter)) turnOut(c, true);
      else { c.x = c.shelter.x; c.y = c.shelter.y + 18; continue; }
    }
    // A man in a bed does nothing but mend — updateWards keeps him there and
    // lets him up when he is whole. He takes no orders and runs no errands.
    if (c.state === "abed") continue;
    // A man on a stretcher rides where his bearer goes. If the bearer is gone,
    // dead, or has been sent somewhere else, he is set down where he lies.
    if (c.state === "borne") {
      const d = c.bearer;
      // and if the bearer somehow ends up under a roof — asleep, jailed, driven
      // indoors — the man on the stretcher is set down rather than carried into
      // the furniture and left there until morning
      if (!d || !civs.includes(d) || d.bearing !== c || INDOORS.has(d.state)) {
        if (d) d.bearing = null;
        c.state = "idle"; c.bearer = null; continue;
      }
      c.x = d.x - d.facing * 30; c.y = d.y - 6;
      continue;
    }
    // "healing" was the old eat-until-mended state. Anyone still in it from an
    // older save simply stands up: there is a hospital for this now.
    if (c.state === "healing") c.state = "idle";
    // The doctor's round is settled BEFORE the colony is sent to its beds. Left
    // until after, a doctor who had just got a man onto the stretcher was idle
    // for exactly one frame — long enough for nightfall to send him home, where
    // he slept until morning with a fever case still lying on his shoulders. It
    // showed as four minutes of carrying and one admission all night.
    if (isDoc(c) && !c.rebel) doctorAI(c);
    if (nightNow > 0.5 && !isForce(c) && !c.rebel && c.home && c.state === "idle" && !c.bearing)
      order(c, { kind: "goHome", x: c.home.x, y: c.home.y + 12 });

    socialTick(c, dt);
    lawTick(c);
    // running from the law comes before the quarrel that started it
    if (c.feudWith && runFromTheLaw(c, dt)) continue;
    if (c.feudWith) feudAI(c);
    if (c.rebel) rebelAI(c);
    if (isForce(c) && !c.rebel) forceAI(c);

    // a constable answering a disturbance runs; he is not strolling to it,
    // and a man carrying another on a stretcher does not run at all
    const speed = walkSpeed(c) * (onRoad(c.x, c.y) ? ROAD_SPEED : 1)
                  * (c.task && c.task.kind === "arrest" ? ARREST_HASTE : 1)
                  * (c.task && c.task.kind === "fetch" ? DOCTOR_HASTE : 1)
                  * (c.bearing ? STRETCHER : 1);
    if (c.state === "walking") {
      if (c.task && c.task.kind === "attack" && c.task.target) {
        const t = c.task.target;
        if (!civs.includes(t) && !raiders.includes(t)) { c.state = "idle"; c.task = null; continue; }
        c.tx = t.x; c.ty = t.y;
      }
      if (c.task && c.task.kind === "seize" && c.task.target) {
        const t = c.task.target;
        if (!foreignFolk.includes(t)) { c.state = "idle"; c.task = null; continue; }
        c.tx = t.x; c.ty = t.y + 6;      // they are running: keep after them
      }
      // A man being arrested does not wait where he was standing. Without this
      // the constable sprinted to the spot the quarrel had been, stopped dead,
      // and watched his man walk away — he arrived every time and made an arrest
      // half the time.
      if (c.task && c.task.kind === "arrest" && c.task.target) {
        const t = c.task.target;
        if (!civs.includes(t) || !t.feudWith || isJailed(t)) { c.state = "idle"; c.task = null; continue; }
        c.tx = t.x; c.ty = t.y + 6;
      }
      // The sick keep walking about until someone stops them, so a doctor
      // follows his case the way a constable follows his man — an errand aimed
      // at where somebody used to be standing is an errand that never arrives.
      if (c.task && c.task.kind === "fetch" && c.task.target) {
        const t = c.task.target;
        if (!civs.includes(t) || !needsBed(t) || t.state === "borne" || t.state === "abed" ||
            (t.bearer && t.bearer !== c)) { c.state = "idle"; c.task = null; continue; }
        c.tx = t.x; c.ty = t.y + 6;
      }
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      // a musketeer closes only to firing range and lets the piece do the rest;
      // everyone else must get to arm's length
      const reach = c.task && c.task.kind === "attack"
        ? (c.profession === "musketeer" ? MUSKET_RANGE - 40 : 34)
        : c.task && c.task.kind === "seize" ? 30
        : c.task && c.task.kind === "fetch" ? 26      // near enough to get a shoulder under him
        : (c.path && c.path.length ? 10 : 5);
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
        gainSkill(c, "woodcutting", 3);
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
      c.workT += dt; s.progress = c.workT / quarryTime(c); c.anim += dt * 10;
      if ((c.workT % 0.55) < dt) SFX.quarry();
      if (c.workT >= quarryTime(c)) {
        gainSkill(c, "quarrying", 3);
        s.alive = false; s.progress = -1;
        markChunkDirty(s.x, s.y);
        c.inv.stone += 3; c.inv.iron += 1;
        float(c.x, c.y - 70, "+3 stone +1 iron", "#7da083");
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "gathering") {
      const p = c.task.target;
      if (!p.alive) { c.state = "idle"; c.task = null; continue; }
      const need = forageTime(c);
      c.workT += dt; p.progress = c.workT / need; c.anim += dt * 8;
      if ((c.workT % 0.4) < dt) SFX.rustle();
      if (c.workT >= need) {
        gainSkill(c, "foraging", 3);
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
      if (c.workT >= craftTime(c)) {
        gainSkill(c, "crafting", 3);
        res.doors++;
        toast(`${c.name} finished a rough plank door. Doors: ${res.doors}.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "smithing") {
      c.workT += dt; c.anim += dt * 6;
      if ((c.workT % 0.55) < dt) SFX.hammer();
      if (c.workT >= smithTime(c)) {
        gainSkill(c, "smithing", 4);
        if (c.task.make === "weapon") {
          // the colony's own iron, forged at the colony's forge, for the colony's
          // armoury: no coin changes hands, and no civilian touches the treasury
          res.weapons++;
          toast(`${c.name} forges a weapon for the armoury. (${res.weapons} in store)`);
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
      c.workT += dt; b.progress = c.workT / repairTime(c); c.anim += dt * 10;
      if ((c.workT % 0.55) < dt) SFX.hammer();
      if (c.workT >= repairTime(c)) {
        gainSkill(c, "building", 4);
        const back = b.was && RUINS.has(b.was) ? b.was : "cabin";
        b.type = back; b.was = null; b.progress = -1; b.placed = false;
        b.maxHp = b.maxHp || 100; b.hp = b.maxHp;
        tally.rebuilt++;
        tell("build", `The ${BLDG_NAMES[back] || back} stands whole again. ${c.name} rebuilt it.`);
        vignette("cabinDone");
        c.state = "idle"; c.task = null;
        for (const cc of civs) if (!cc.home) houseCiv(cc);
      }
    } else if (c.state === "buildingFarm") {
      c.workT += dt; c.anim += dt * 8;
      if ((c.workT % 0.6) < dt) SFX.hammer();
      if (c.workT >= farmBuildTime(c)) {
        gainSkill(c, "farming", 3);
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
      c.workT += dt; f.progress = c.workT / harvestTime(c); c.anim += dt * 8;
      if ((c.workT % 0.45) < dt) SFX.rustle();
      if (c.workT >= harvestTime(c)) {
        gainSkill(c, "farming", 3);
        f.ready = false; f.growT = 0; f.progress = -1;
        // the harvest feeds the whole colony: bread goes to the common store at once,
        // where any hungry soul can reach it, rather than sitting in one farmer's pack
        c.inv.wheat += 2;
        const led = ledgerOf(c);
        led.bread = (led.bread || 0) + 1;
        SFX.pickup();
        float(c.x, c.y - 70, "+2 wheat · +1 bread to the store", "#7da083");
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
      const need = raiseTime(c, isFarmSite ? "farm" : b.type);
      c.workT += dt; b.progress = c.workT / need; c.anim += dt * 8;
      if ((c.workT % 0.6) < dt) SFX.hammer();
      if (c.workT >= need) {
        gainSkill(c, "building", 5);
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
      if (c.workT >= huntTime(c)) { c.inv.meat += 2; float(c.x, c.y - 70, "+2 meat", "#7da083");
        gainSkill(c, "hunting", 3); c.state = "idle"; c.task = null; }
    } else if (c.state === "fighting") {
      const foe = c.task && c.task.target;
      const foeAlive = foe && (civs.includes(foe) || raiders.includes(foe));
      if (!foeAlive) { c.state = "idle"; c.task = null; continue; }
      const d = Math.hypot(foe.x - c.x, foe.y - c.y);
      if (c.profession === "musketeer") {
        c.facing = foe.x < c.x ? -1 : 1;
        // with a bayonet fixed they hold their ground and stab; without one they keep their distance
        const bayonet = has("bayonets");
        if (bayonet && d < 52) {
          c.anim += dt * 9;
          c.atkT -= dt;
          if (c.atkT <= 0) {
            c.atkT = ATK_INTERVAL;
            let dmg = Math.round(bayonetDmg() * armSkill(c, "fighting"));
            if (nearWatchtower(c.x, c.y)) dmg += 5;
            SFX.swing();
            strikeUnit(c, foe, dmg);
            gainSkill(c, "fighting", 1);
          }
          continue;
        }
        // without a bayonet the musket is no melee weapon: pressed too close, he
        // gives ground — back-pedalling, still facing the foe, the ramrod still
        // working — rather than letting the fight come to fists
        if (!bayonet && d < MUSKET_KEEP_AWAY) {
          collideMove(c, c.x - ((foe.x - c.x) / d) * speed * 0.85 * dt,
                         c.y - ((foe.y - c.y) / d) * speed * 0.85 * dt);
          c.anim += dt * 5;
        }
        if (c.reloadT > 0) continue;
        if (d > MUSKET_RANGE + 70) { c.state = "walking"; c.tx = foe.x; c.ty = foe.y; continue; }
        if (d > MUSKET_RANGE) collideMove(c, c.x + ((foe.x - c.x) / d) * speed * dt, c.y + ((foe.y - c.y) / d) * speed * dt);
        c.anim += dt * 2;
        if (c.loaded && c.fireT <= 0 && d <= MUSKET_RANGE + 10) {
          // shouldered, mark taken — now wait on the men beside him
          c.volleyT = (c.volleyT || 0) + dt;
          // fail open: only an explicit `false` holds a man back. If the planner
          // ever misses him, he shoots — a musket that will not fire is a worse
          // bug than a ragged volley, and that is exactly how this broke.
          if (c.mayFire === false) { c.anim += dt * 2; continue; }
          c.volleyT = 0;
          let dmg = Math.round(musketDmg(d) * armSkill(c, "marksmanship"));   // nearer the muzzle, and steadier the hand
          if (nearWatchtower(c.x, c.y)) dmg += 5;
          // a dozen muskets in one frame is one crack, not a dozen stacked reports
          if (volleySounds++ < VOLLEY_SOUNDS) SFX.musket();
          // the muzzle sits on the barrel line of the sprite, not at the man's waist
          const mx = c.x + c.facing * MUZZLE_X, my = c.y - MUZZLE_Y;
          const tx = foe.x, ty = foe.y - CHAR_SIZE * 0.45;
          const md = Math.max(1, Math.hypot(tx - mx, ty - my));
          balls.push({ x: mx, y: my, target: foe, from: c, dmg, vx: (tx - mx) / md, vy: (ty - my) / md });
          musketSmoke(mx, my, c.facing);
          gainSkill(c, "marksmanship", 2);
          c.loaded = false; c.fireT = MUSKET_FIRE_T; c.reloadT = reloadTime();
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
        let dmg = Math.round((isForce(c) ? forceDmg(c) : (c.armed ? weaponDmg() : FIST_DMG)) * armSkill(c, "fighting"));
        if (isForce(c) && nearWatchtower(c.x, c.y)) dmg += 5;
        if (isForce(c) || c.armed) SFX.swing(); else SFX.swingFist();
        strikeUnit(c, foe, dmg);
        gainSkill(c, "fighting", 1);
      }
    } else if (c.state === "climbing") {
      // over an enemy's stone, the same slow business: both hands on the wall,
      // no use to anyone until they are down inside it, and the wall unharmed
      const w = c.task && c.task.target;
      if (!w || !foreign.includes(w)) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; c.anim += dt * 3;
      w.climbP = Math.max(w.climbP || 0, c.workT / CLIMB_TIME);
      if (c.workT >= CLIMB_TIME) {
        const keep = foreign.find(f => f.keep && f.town === w.town) ||
                     foreign.find(f => f.town === w.town && !STONE.has(f.type));
        overTheWall(c, w, keep);
        toast(`${c.name} is over the wall.`);
        c.state = "idle"; c.task = null; c.workT = 0;
      }
    } else if (c.state === "sieging") {
      const cp = c.task.target;
      // enemy town: the same storming, but the walls and roofs of a foreign crown
      if (cp && cp.foreign) {
        if (!foreign.includes(cp)) { c.state = "idle"; c.task = null; continue; }
        c.facing = cp.x < c.x ? -1 : 1;
        c.anim += dt * 9;
        c.atkT -= dt;
        if (c.atkT <= 0) {
          c.atkT = ATK_INTERVAL;
          const dmg = forceDmg(c);
          SFX.swing();
          cp.hp -= dmg;
          float(cp.x, cp.y - 90, "-" + dmg, "#d86a5a");
          SFX.hit();
          // walls do not strike back; the keep and the garrison's roofs do
          if (cp.keep || cp.type === "watchtower") {
            if (Math.random() < DODGE_CHANCE) float(c.x, c.y - 70, "Dodged!", "#cfd8d3");
            else {
              const ret = cp.keep ? 9 : 6;
              c.hp -= ret;
              float(c.x, c.y - 70, "-" + ret, "#d86a5a");
              if (c.hp <= 0) { killCiv(c, `fell before the walls of ${cp.town.name}`); continue; }
            }
          }
          if (cp.hp <= 0) {
            const town = cp.town, wasKeep = cp.keep;
            foreign.splice(foreign.indexOf(cp), 1);
            if (wasKeep) foreignTownFalls(town, c);
            else { SFX.treeFall(); toast(`The ${BLDG_NAMES[cp.type] || cp.type} of ${town.name} is thrown down.`); }
            c.state = "idle"; c.task = null;
          }
        }
        continue;
      }
      if (!camps.includes(cp)) { c.state = "idle"; c.task = null; continue; }
      c.facing = cp.x < c.x ? -1 : 1;
      c.anim += dt * 9;
      c.atkT -= dt;
      if (c.atkT <= 0) {
        c.atkT = ATK_INTERVAL;
        const dmg = forceDmg(c);
        // a musket fires into the stockade rather than hacking at it
        if (c.profession === "musketeer") {
          SFX.musket();
          smokes.push({ x: c.x + c.facing * 14, y: c.y - 34, r: 6, vx: c.facing * 24, t: 1.1, max: 1.1 });
        } else SFX.swing();
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
          tally.camps++;
          tell("war", `${c.name} sacks the ${cp.type} camp — ${cp.dm} DM and ${cp.weapons} weapon(s) seized! (${sackedCamps} camps sacked)`);
          if (selectedCamp === cp) selectedCamp = null;
          c.state = "idle"; c.task = null;
        }
      }
    } else if (c.state === "torching") {
      const b = c.task.target;
      const there = b && b.foreign ? foreign.includes(b) : buildings.includes(b);
      if (!there || b.fire) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt; b.torchP = c.workT / torchTime(); c.anim += dt * 9;
      if ((c.workT % 0.35) < dt) SFX.crackle();
      if (c.workT >= torchTime()) {
        b.torchP = -1; b.fire = FIRE_TIME;
        if (b.foreign && b.keep) {
          // the hall burning is the signal: the town is taken
          toast(`⚠ ${c.name} puts the town hall of ${b.town.name} to the torch!`);
          foreignTownFalls(b.town);
        } else toast(`⚠ ${c.name} has set the ${b.type === "cabin" ? "cabin" : b.type} ablaze!`);
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

  // dirt paths worn into the grass, drawn under everything else
  {
    const r0 = roadCellOf(cam.x - ROAD, cam.y - ROAD), r1 = roadCellOf(cam.x + vw, cam.y + vh);
    const winter = season() === "winter";
    for (let ry = r0[1]; ry <= r1[1]; ry++) for (let rx = r0[0]; rx <= r1[0]; rx++) {
      if (!roads.has(rkey(rx, ry))) continue;
      const im = img[(winter ? "road_w" : "road") + roadBits(rx, ry)];
      if (im) ctx.drawImage(im, rx * ROAD, ry * ROAD, ROAD, ROAD);
    }
    if (roadMode && roadGhost.length) {                       // the stretch you are about to buy
      ctx.globalAlpha = 0.55;
      for (const [gx, gy] of roadGhost) {
        const im = img[(winter ? "road_w" : "road") + roadBits(gx, gy, roadGhost)];
        if (im) ctx.drawImage(im, gx * ROAD, gy * ROAD, ROAD, ROAD);
      }
      ctx.globalAlpha = 1;
    }
  }
  if (lineDrag && lineGhost) {                                // the battle line being drawn
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1.5 / zoom;
    for (const p of lineGhost.slots) {
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 10, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

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
  // their townsfolk, going about their lives until your line comes over the hill
  for (const f of foreignFolk) if (inView(f.x, f.y)) drawables.push({ y: f.y, draw: () => {
    drawSprite(img[f.who + (Math.floor(f.anim) % 4)], f.x, f.y, CHAR_SIZE, f.facing < 0);
    if (settings.labels) {
      ctx.fillStyle = f.fleeT > 0 ? "#d8b45a" : "#9ab0a2";
      ctx.font = "10px monospace"; ctx.textAlign = "center";
      ctx.fillText(f.name + (f.fleeT > 0 ? " !" : ""), f.x, f.y - CHAR_SIZE - 4);
    }
  }});
  // a foreign crown's town: their roofs and walls, drawn in their own colours
  for (const fb of foreign) if (inView(fb.x, fb.y)) drawables.push({ y: fb.y, draw: () => {
    const winter = season() === "winter";
    const key = (winter && img[fb.type + "_w"]) ? fb.type + "_w" : fb.type;
    const im = img[fb.rot && img[fb.type + "v"] ? fb.type + "v" : key] || img[fb.type];
    if (im) drawSprite(im, fb.x, fb.y, SMALL_BLDG[fb.type] || BLDG_SIZE, false);
    const col = (NATIONS[fb.town.nation] || {}).color || "#d86a5a";
    if (fb.keep) {
      ctx.fillStyle = col; ctx.font = "10px monospace"; ctx.textAlign = "center";
      ctx.fillText(fb.town.name.toUpperCase(), fb.x, fb.y - BLDG_SIZE - 6);
    }
    if (fb.hp < fb.maxHp) bar(fb.x, fb.y - (SMALL_BLDG[fb.type] || BLDG_SIZE) - 12, fb.hp / fb.maxHp, "#a05252", fb.keep ? 44 : 30);
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
    const bt = baseType(b);                      // a ruin is drawn at the size of what it was
    const wos = WALLLIKE.has(bt) ? 10 : 0;       // walls draw oversized so chained segments visually fuse
    if (b.type === "burned") drawSprite(wimg(ruinKey(b)), b.x, b.y + wos / 2, (SMALL_BLDG[bt] || BLDG_SIZE) + wos, false);
    else if (b.type === "wall" && b.rot) drawSprite(wimg("wallv"), b.x, b.y + wos / 2, SMALL_BLDG.wall + wos, false);
    else if (b.type === "stonewall" && b.rot) drawSprite(img.stonewallv, b.x, b.y + wos / 2, SMALL_BLDG.stonewall + wos, false);
    else if (b.type === "stonegate" && b.rot) drawSprite(img.stonegatev, b.x, b.y + wos / 2, SMALL_BLDG.stonegate + wos, false);
    else if (b.type === "gate" && b.rot) drawSprite(wimg("gatev"), b.x, b.y + wos / 2, SMALL_BLDG.gate + wos, false);
    else if ((b.type === "moat" || b.type === "ditch") && b.rot) {
      const L = SMALL_BLDG[b.type] + wos;
      ctx.save(); ctx.translate(b.x, b.y - SMALL_BLDG[b.type] / 2); ctx.rotate(Math.PI / 2);
      ctx.drawImage(img[b.type], -L / 2, -L / 2, L, L);
      ctx.restore();
    } else drawSprite(wimg(b.type), b.x, b.y + wos / 2, drawSizeOf(b.type) + wos, false);
    if (b.fire > 0) {
      const f = img["fire" + (Math.floor(fireAnim) % 4)];
      drawSprite(f, b.x - 20, b.y - 8, 56, false);
      drawSprite(f, b.x + 18, b.y - 2, 64, true);
      drawSprite(f, b.x, b.y - 40, 48, false);
    }
    ctx.globalAlpha = 1;
    if (b.progress >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.progress, "#7da083");
    if (b.torchP >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.torchP, "#d86a3a");
    if (b.climbP > 0) bar(b.x, b.y - BLDG_SIZE - 12, Math.min(1, b.climbP), "#9ab0a2");   // someone is on it
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
  // A crown's troops march in its regimentals and are named for what they are.
  // The woods' own thieves are no army: they come as they always did, in rags.
  for (const r of raiders) if (inView(r.x, r.y)) drawables.push({ y: r.y, draw: () => {
    const i = Math.floor(r.anim) % 4;
    const crown = r.nation && NATIONS[r.nation];
    const frame = crown ? foeCoat(crown.color, r.foe ? "atkuni" + i : "soldierU" + i)
                        : img[(r.foe ? "atksword" : "hunter") + i];
    drawSprite(frame, r.x, r.y, CHAR_SIZE, r.facing < 0);
    if (settings.labels) {
      ctx.fillStyle = "#d86a5a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
      ctx.fillText(crown ? crown.name + " Enemy Soldier" : (r.state === "patrol" ? "thief" : "RAIDER"),
                   r.x, r.y - CHAR_SIZE - 4);
    }
    if (r.hp < r.maxHp) bar(r.x, r.y - CHAR_SIZE - 14, r.hp / r.maxHp, "#a05252", 34);
  }});
  // A man on a stretcher is painted by whoever is carrying him, not by himself
  for (const c of civs) if (!INDOORS.has(c.state) && c.state !== "borne" && inView(c.x, c.y)) drawables.push({ y: c.y, draw: () => {
    const grouped = selGroup.length > 1 && selected && selGroup.includes(selected) && selGroup.includes(c);
    if (c === selected || grouped) {
      ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x, c.y - 2, 18, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    let frame;
    if (c.profession === "musketeer" && (c.fireT > 0 || c.reloadT > 0)) {
      // the shot, then the long business of loading again
      if (c.fireT > 0) {
        // the shot itself: flash, then the smoke hanging, then the musket coming down
        const k = 1 - c.fireT / MUSKET_FIRE_T;
        frame = coatOf("mfire" + (k < 0.30 ? 1 : k < 0.62 ? 2 : 3));
      } else {
        const k = 1 - c.reloadT / reloadTime();                // powder → ball → ramrod → shoulder
        frame = coatOf("mload" + Math.min(3, Math.floor(k * 4)));
      }
    }
    else if (c.profession === "musketeer" && c.state === "fighting") frame = coatOf("mfire0");   // levelled, waiting
    else if (c.profession === "musketeer" && c.state === "sieging")                              // volleying into the walls
      frame = coatOf("mfire" + (Math.floor(c.anim) % 4));
    else if ((c.state === "fighting" || c.state === "sieging") && c.profession !== "cavalry" && c.profession !== "musketeer")
      // uniformed troops swing in their coats; everyone else in what they own
      frame = (c.profession === "police" || c.profession === "soldier")
        ? coatOf("atkuni" + (Math.floor(c.anim) % 4))
        : img[(isForce(c) || c.armed ? "atksword" : "atkfist") + (Math.floor(c.anim) % 4)];
    else frame = UNIFORMED.has(c.profession) ? coatOf(c.who + (Math.floor(c.anim) % 4))
                                             : img[c.who + (Math.floor(c.anim) % 4)];
    // A man on a stretcher is drawn lying on two poles behind his bearer: the
    // poles first, then the body across them, so the load reads at a glance.
    if (c.bearing && civs.includes(c.bearing) && c.bearing.state === "borne") {
      const p = c.bearing, sx = c.x - c.facing * 30, sy = c.y - 6;
      ctx.strokeStyle = "#6b5636"; ctx.lineWidth = 3;          // the two poles
      for (const off of [0, 9]) {
        ctx.beginPath();
        ctx.moveTo(sx - 21, sy + off); ctx.lineTo(sx + 21, sy + off);
        ctx.stroke();
      }
      ctx.fillStyle = "#8e8778";                                // the body under a blanket
      ctx.fillRect(sx - 16, sy - 6, 32, 12);
      ctx.fillStyle = "#c2a98c";                                // and the head, at the bearer's end
      ctx.beginPath(); ctx.arc(sx + c.facing * 16, sy, 5, 0, Math.PI * 2); ctx.fill();
      if (p.hp < p.maxHp) bar(sx, sy - 16, p.hp / p.maxHp, "#a05252", 28);
      if (settings.labels) {
        ctx.fillStyle = isSick(p) ? "#a99ec4" : "#7da083";
        ctx.font = "10px monospace"; ctx.textAlign = "center";
        ctx.fillText((isSick(p) ? "☠ " : "") + p.name, sx, sy - 22);
      }
    }
    drawSprite(frame, c.x, c.y, CHAR_SIZE * (c.child ? 0.62 : 1), c.facing < 0);
    // the flash is painted into the firing sprite itself — nothing is drawn over it
    ctx.fillStyle = c.sick > 0 ? "#a99ec4" : c.rebel ? "#d86a5a" : c.feudWith ? "#d8a05a" : c === selected ? "#c9a86a" :
                    c.profession === "police" ? "#8aa0c9" : isForce(c) ? "#b58a5a" : "#7da083";
    ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tag = c.rebel ? " [REBEL]" : c.feudWith ? ` [feud: ${c.feudWith}]` : c.child ? " (child)" :
                ["police", "soldier", "musketeer", "cavalry"].includes(c.profession) ? ` [${c.profession}]` : "";
    if (settings.labels) ctx.fillText((c.sick > 0 ? "☠ " : "") + c.name + tag, c.x, c.y - CHAR_SIZE - 4);
    if (c.hp < c.maxHp) bar(c.x, c.y - CHAR_SIZE - 16, c.hp / c.maxHp, "#a05252", 34);
    if (c.state === "crafting" || c.state === "buildingFarm" || c.state === "smithing" || c.state === "hunting") {
      const tot = c.state === "crafting" ? craftTime(c) : c.state === "smithing" ? smithTime(c) :
                  c.state === "buildingFarm" ? farmBuildTime(c) : huntTime(c);
      bar(c.x, c.y - CHAR_SIZE - (c.hp < c.maxHp ? 26 : 16), c.workT / tot, "#c9a86a");
    }
  }});

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  for (const b of balls) {
    if (!inView(b.x, b.y)) continue;
    ctx.strokeStyle = "rgba(228,214,178,0.55)"; ctx.lineWidth = 1;      // the streak it leaves
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 16, b.y - b.vy * 16); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.fillStyle = "#f0e6c8";
    ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
  }

  for (const sm of smokes) {
    if (!inView(sm.x, sm.y)) continue;
    ctx.globalAlpha = (sm.dense || 0.28) * Math.min(1, sm.t / sm.max);
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
      const lamp = isProp(b.type);
      if (b.site) continue;                       // an unraised lamp is a hole in the ground
      const lit = b.type === "cabin" ? b.occupants.length > 0 : true;
      if (!lit) continue;
      // A lamppost is there for nothing else: it throws twice the pool a lit
      // window does, from the lantern at the top of the post rather than a door.
      // the light is added, not painted over, so a close-packed row must be
      // gentler per lamp than one standing alone or the street turns to milk
      const rad = lamp ? 100 : 46, up = lamp ? 46 : 14, str = lamp ? 0.42 : 0.34;
      const flick = 0.72 + 0.18 * Math.sin(worldT * 11 + b.x * 0.7) + 0.10 * Math.sin(worldT * 23 + b.y);
      const g = ctx.createRadialGradient(b.x, b.y - up, 2, b.x, b.y - up, rad);
      g.addColorStop(0, `rgba(255, 196, 92, ${str * night * flick})`);
      g.addColorStop(1, "rgba(255, 196, 92, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(b.x - rad - 2, b.y - up - rad - 2, rad * 2 + 4, rad * 2 + 4);
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
    const ok = legalToBuild(buildMode, gx, gy) && canPay(costOf(buildMode), ledgerAt(gx, gy));
    ctx.globalAlpha = 0.55;
    const ghost = buildMode === "sapling" ? img.tree : buildMode === "farm" ? img.farm : img[buildMode];
    const gs = buildMode === "sapling" ? TREE_SIZE * 0.4 : drawSizeOf(buildMode);
    if (buildMode === "wall" && wallRot) drawSprite(img.wallv, gx, gy, gs, false);
    else if (buildMode === "stonewall" && wallRot) drawSprite(img.stonewallv, gx, gy, gs, false);
    else if (buildMode === "stonegate" && wallRot) drawSprite(img.stonegatev, gx, gy, gs, false);
    else if (buildMode === "gate" && wallRot) drawSprite(img.gatev, gx, gy, gs, false);
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

  // a name floating over every town you hold, so you always know where you are
  {
    const named = settlements.filter(s => s.x !== undefined)
      .map(s => ({ x: s.x, y: s.y, name: s.name, cap: false }));
    named.push({ x: CAPITAL_X, y: CAPITAL_Y, name: settlementName || "Neu Hamburg", cap: true });
    for (const ft of foreignTowns) named.push({ x: ft.x, y: ft.y, name: ft.name, foe: true });
    ctx.textAlign = "center";
    for (const t of named) {
      const sx = (t.x - cam.x) * zoom, sy = (t.y - cam.y) * zoom - 40 * zoom;
      if (sx < -60 || sx > canvas.width + 60 || sy < 14 || sy > canvas.height + 40) continue;
      ctx.font = (t.cap ? "bold " : "") + Math.max(11, Math.round(13 * Math.min(1.3, zoom))) + "px monospace";
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(4,7,5,0.85)";
      ctx.strokeText(t.name, sx, sy);
      ctx.fillStyle = t.foe ? "#d86a5a" : t.cap ? "#e8d9b8" : "#c9a86a";
      ctx.fillText(t.name, sx, sy);
    }
  }

  // edge-of-screen markers for towns that are out of view
  const towns = settlements.filter(s => s.x !== undefined).map(s => ({ x: s.x, y: s.y, name: s.name }));
  if (towns.length || foreignTowns.length) towns.push({ x: 0, y: -40, name: settlementName || "Home" });
  for (const ft of foreignTowns) towns.push({ x: ft.x, y: ft.y, name: ft.name, foe: true });
  for (const t of towns) {
    const sx = (t.x - cam.x) * zoom, sy = (t.y - cam.y) * zoom;
    if (sx > -40 && sx < canvas.width + 40 && sy > -40 && sy < canvas.height + 40) continue;
    const mx2 = Math.max(30, Math.min(canvas.width - 30, sx));
    const my2 = Math.max(52, Math.min(canvas.height - 70, sy));
    const mcol = t.foe ? "#d86a5a" : "#c9a86a";
    ctx.save(); ctx.translate(mx2, my2); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(13,18,16,0.85)"; ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeStyle = mcol; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -8, 16, 16);
    ctx.restore();
    ctx.fillStyle = mcol; ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tx2 = Math.max(46, Math.min(canvas.width - 46, mx2));
    ctx.fillText(t.name, tx2, my2 + (sy > canvas.height - 70 ? -16 : 22));
  }

  // --- the alarm: where they are coming from, and what they are coming for ---
  // Every raider on the move — thieves out of the woods or a crown's war party —
  // is called out: an arrow at the edge pointing the way they come, and a ring
  // around the roof they mean to reach.
  const attackers = raiders.filter(r => !r.garrison && r.state !== "patrol");
  if (attackers.length) {
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);
    // the roofs they are making for
    const marks = new Map();
    for (const r of attackers) {
      const t = r.wallTarget || r.target;
      if (t && buildings.includes(t)) marks.set(t, (marks.get(t) || 0) + 1);
    }
    for (const [b, n] of marks) {
      const sx = (b.x - cam.x) * zoom, sy = (b.y - cam.y) * zoom;
      const war = attackers.some(r => r.nation && (r.wallTarget || r.target) === b);
      const col = war ? "#e08a4a" : "#d86a5a";
      if (sx > -60 && sx < canvas.width + 60 && sy > -60 && sy < canvas.height + 60) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.5 * pulse;
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 8 * zoom, (30 + 5 * pulse) * zoom, (14 + 3 * pulse) * zoom, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.font = "10px monospace"; ctx.textAlign = "center";
        ctx.fillText(n > 1 ? `▼ ${n} raiders` : "▼ raider", sx, sy - 30 * zoom - 12);
        ctx.restore();
      }
    }
    // and the arrows at the screen's edge, one for each band still out of sight
    const bands = [];
    for (const r of attackers) {
      const sx = (r.x - cam.x) * zoom, sy = (r.y - cam.y) * zoom;
      if (sx > 0 && sx < canvas.width && sy > 0 && sy < canvas.height) continue;   // already in plain view
      const band = bands.find(bd => Math.hypot(bd.x - r.x, bd.y - r.y) < 420 && bd.war === !!r.nation);
      if (band) { band.n++; band.x = (band.x * (band.n - 1) + r.x) / band.n; band.y = (band.y * (band.n - 1) + r.y) / band.n; }
      else bands.push({ x: r.x, y: r.y, n: 1, war: !!r.nation, target: r.wallTarget || r.target });
    }
    for (const bd of bands) {
      const cxs = canvas.width / 2, cys = canvas.height / 2;
      const sx = (bd.x - cam.x) * zoom, sy = (bd.y - cam.y) * zoom;
      const ang = Math.atan2(sy - cys, sx - cxs);
      const m = 46;
      // slide out from the middle until the arrow meets the edge of the screen
      const tX = Math.abs(Math.cos(ang)) < 1e-3 ? Infinity : (cxs - m) / Math.abs(Math.cos(ang));
      const tY = Math.abs(Math.sin(ang)) < 1e-3 ? Infinity : (cys - m) / Math.abs(Math.sin(ang));
      const t2 = Math.min(tX, tY);
      const ax = cxs + Math.cos(ang) * t2, ay = cys + Math.sin(ang) * t2;
      const col = bd.war ? "#e08a4a" : "#d86a5a";
      ctx.save();
      ctx.translate(ax, ay);
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath();                       // a chevron pointing the way they come
      ctx.moveTo(15, 0); ctx.lineTo(-9, -10); ctx.lineTo(-4, 0); ctx.lineTo(-9, 10);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.font = "10px monospace"; ctx.textAlign = "center";
      const label = (bd.war ? "WAR PARTY" : "RAIDERS") + (bd.n > 1 ? ` ×${bd.n}` : "");
      const ly = ay + (ay > canvas.height - 70 ? -22 : 26);
      ctx.fillText(label, Math.max(52, Math.min(canvas.width - 52, ax)), ly);
      // and what they are making for, so you know where to stand
      const t = bd.target;
      if (t && buildings.includes(t)) {
        ctx.fillStyle = "#9ab0a2"; ctx.font = "9px monospace";
        ctx.fillText("→ " + (BLDG_NAMES[t.type] || t.type),
                     Math.max(52, Math.min(canvas.width - 52, ax)), ly + 11);
      }
    }
  }

  drawCursorHint();
}

// The plaque at the cursor that says what a click will do. A finger has no
// hover, so this is for a mouse; and anyone who finds it fussy can put it away
// in the settings.
function drawCursorHint() {
  if (!settings.hints || IS_TOUCH || !edge.on) return;
  const text = hintAt(cam.x + mouse.x / zoom, cam.y + mouse.y / zoom);
  if (!text) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "11px monospace";
  ctx.textAlign = "left";
  const pad = 6, w = ctx.measureText(text).width + pad * 2, h = 19;
  // below-right of the cursor by default, but never off the glass
  let x = mouse.x + 16, y = mouse.y + 20;
  if (x + w > canvas.width - 4) x = mouse.x - 16 - w;
  if (y + h > canvas.height - 4) y = mouse.y - 12 - h;
  ctx.fillStyle = "rgba(13,18,16,0.90)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(201,168,106,0.65)"; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = "#e8d9b8";
  ctx.fillText(text, x + pad, y + 13);
}

// --- loop ---
let last = 0, uiT = 0;
let loopErrs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  // One bad frame must never end the world: report it and keep the clock running,
  // or a single slip anywhere freezes the colony until the page is reloaded.
  try {
    if (gameState === "playing") {
      update(dt);
      render(dt);
      uiT += dt;
      if (uiT > 0.25) { uiT = 0; syncUI(); }
    }
  } catch (e) {
    if (loopErrs++ < 5) console.error("frame error", e);
    if (loopErrs === 5) console.error("further frame errors will be swallowed silently");
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
