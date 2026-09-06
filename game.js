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
const TAX_PERIOD = 240, POLICE_COST = 40, SOLDIER_COST = 30, MUSKET_COST = 25, CAV_COST = 50;

// --- what a thing is made of ---
// One ladder of metals, and it runs through everything the forge turns out. Tech
// decides the FORM a blacksmith knows how to make — a spear, a sword, a battle
// axe — and the metal decides how well that form comes out. Stone is underfoot
// everywhere and barely helps; the metals are not. Iron, copper and tin come out
// of a mine and out of nothing else, so until the colony sinks one the smith has
// only fieldstone to work. Bronze is the middle rung: copper and tin melted
// together in a crucible, which a blacksmith can do at his own hearth the day he
// is shown how — where iron wants a furnace built for it and nothing else.
// `mats` is a function, not a table, because the iron recipe has to ask a tech
// (Hilts) what it costs — and that question cannot be answered this early in the file.
const MATERIALS = [
  { id: "stone",  name: "Stone",
    tool:   { bonus: 0.05, self: 4,  gov: 5,  mats: () => ({ stone: 2, logs: 1 }),
              desc: "A knapped fieldstone head lashed to a haft with leather cord. It is barely better than bare hands, but it is what a poor colony makes out of what lies underfoot. Work goes 5% faster." },
    weapon: { mult: 0.75, self: 8,  gov: 8,  mats: () => ({ stone: 3, logs: 1 }),
              desc: "An edge chipped out of fieldstone and bound to a shaft. It will open a man up once, perhaps twice, and after that it is a rock again. Three quarters the bite of a forged blade — but it is what there is." } },
  { id: "bronze", name: "Bronze",
    tool:   { bonus: 0.10, self: 8,  gov: 10, mats: () => ({ bronze: 1, stone: 1, logs: 1 }),
              desc: "A cast bronze head socketed clean onto the haft. It holds an edge the way stone never could, and it does not chip on the first hard knot. Work goes 10% faster." },
    weapon: { mult: 1.00, self: 14, gov: 14, mats: () => ({ bronze: 2, stone: 1, logs: 1 }),
              desc: "Cast bronze, poured and ground to a point. Soft enough to turn on a helmet, but it keeps its edge far longer than anything chipped from stone. This is the plain blade the colony has always made." } },
  { id: "iron",   name: "Iron",
    tool:   { bonus: 0.15, self: 12, gov: 15, mats: () => ({ iron: 1, stone: 1, logs: 1 }),
              desc: "Forged iron, keen and balanced, wedged tight at the eye — the best thing the colony knows how to make. A man who owns one keeps it all his life. Work goes 15% faster." },
    weapon: { mult: 1.25, self: 20, gov: 20, mats: () => ({ iron: weaponIron(), stone: 1, logs: 1 }),
              desc: "Forged iron, hammered out and ground keen. Half again the reach into a man that stone has, and a quarter more than bronze. Every soul in the colony knows it on sight." } },
];
const matRank   = id => MATERIALS.findIndex(m => m.id === id);    // -1 is bare hands
const matOf     = id => MATERIALS[matRank(id)] || null;
const matsFor   = (m, kind) => Object.entries(m[kind].mats());
const canMake   = (m, kind) => matsFor(m, kind).every(([k, q]) => (res[k] || 0) >= q);
const spendMats = (m, kind) => { for (const [k, q] of matsFor(m, kind)) res[k] -= q; };
const withArt   = s => (/^[aeiou]/i.test(s) ? "an " : "a ") + s;  // an iron tool, a stone one
// what a pair of hands is holding, of this kind. Both are material ids, and both
// are falsy when empty — so every `if (c.armed)` written before tiers still reads true.
const heldId    = (c, kind) => c && (kind === "tool" ? c.tool : c.armed);
// A tool saves a share of the time; a blade multiplies the damage its form does.
// Bronze is the plain weapon the colony used to make — stone is desperation, iron
// is the reward — so the old balance still sits in the middle of the new ladder.
const toolBonus  = c => { const m = matOf(c && c.tool);  return m ? m.tool.bonus : 0; };
const weaponMult = c => { const m = matOf(c && c.armed); return m ? m.weapon.mult : 1; };
// the best rung the colony's stores can actually pay for
const bestForgeable = kind => {
  for (let i = MATERIALS.length - 1; i >= 0; i--) if (canMake(MATERIALS[i], kind)) return MATERIALS[i];
  return null;
};
// the best thing of this kind on these racks that beats what the hands already hold
function bestOnRacks(f, c, kind) {
  const mine = matRank(heldId(c, kind));
  let best = null;
  for (const i of (f && f.shop) || []) {
    if (i.kind !== kind) continue;
    const r = matRank(i.tier);
    if (r <= mine) continue;
    if (!best || r > matRank(best.id)) best = MATERIALS[r];
  }
  return best;
}
// what could be bought for this man right now, anywhere in the colony
const bestOffer = (c, kind) => buildings.filter(b => b.type === "forge" && !b.fire && !b.site)
  .reduce((a, b) => { const t = bestOnRacks(b, c, kind); return t && (!a || matRank(t.id) > matRank(a.id)) ? t : a; }, null);
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
// Five minutes of quiet are owed between raids for as long as the colony is
// still making its name. That floor was also the reason the last hour of a long
// game was its quietest: past the cap, nothing else could tighten. Once the
// reckoning is open the owed quiet is bought back a little at a time, down to
// two minutes — enough to bury the dead and no more.
const RAID_FLOOR = 300, RAID_FLOOR_MIN = 120;

const REPAIR_COST = { logs: 20, doors: 1, dm: 5 };
const STATIC_COSTS = {
  recruit: { logs: 30, dm: 10 }, market: { logs: 25, dm: 8 }, sapling: { logs: 1, dm: 1 },
  watchtower: { logs: 15, stone: 5, dm: 6 }, bakery: { logs: 20, stone: 3, dm: 8 }, well: { logs: 10, stone: 8, dm: 4 },
  forge: { logs: 20, stone: 10, dm: 12 },
  quarry: { logs: 18, stone: 10, dm: 10 }, mine: { logs: 30, stone: 14, dm: 16 },
  sawmill: { logs: 35, stone: 8, dm: 14 }, smelter: { logs: 22, stone: 20, dm: 18 },
  wall: { stone: 2, dm: 1 }, gate: { logs: 6, stone: 2, dm: 1 },
  jail: { logs: 18, stone: 6, dm: 10 },
  hospital: { logs: 25, stone: 8, dm: 14 },
  lamp: { logs: 2, dm: 1 },
  townhall: { logs: 40, stone: 10, dm: 20 },
  stonewall: { stone: 4, dm: 1 }, stonegate: { stone: 7, logs: 2, dm: 2 },
  moat: { stone: 4, logs: 2, dm: 3 }, ditch: { logs: 2, dm: 1 },
  shrine: { logs: 10, dm: 3 }, temple: { logs: 30, stone: 8, dm: 15 },
};
const BLDG_NAMES = { cabin: "Log Cabin", recruit: "Recruitment Center", market: "Market Center",
  burned: "Burned Ruin", watchtower: "Watchtower", bakery: "Bakery", well: "Well", forge: "Forge", wall: "Town Wall", gate: "Town Gate", townhall: "Town Hall", jail: "Jail", hospital: "Hospital",
  stonewall: "Stone Wall", stonegate: "Stone Gate", moat: "Moat", ditch: "Ditch", lamp: "Lamppost",
  quarry: "Quarry", mine: "Mine", sawmill: "Sawmill", smelter: "Smelter",
  shrine: "Shrine", temple: "House of Worship" };
// A house of worship is named for the creed it was dedicated to, not for its
// type: nobody in 1683 called the building at the end of the lane a "temple".
function bldgLabel(b) {
  if (b && (b.type === "temple" || b.type === "shrine") && FAITHS[b.faith])
    return b.type === "temple" ? FAITHS[b.faith].house : FAITHS[b.faith].shrineName;
  return BLDG_NAMES[b.type] || b.type;
}
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
// ===== exploration =====
// The fourth tree, and the only one that buys you nothing you can hold. It buys
// distance: how far the camera may rise off your rooftops, how much of the
// continent is drawn in rather than blank, and the two kinds of man you can send
// out to fill in the rest. A colony with none of it is not blind — it simply
// cannot see past its own valley, which in 1683 was the ordinary condition of
// almost everybody.
T("cartography", "Cartography", "world", [], 0, "Raise the eye past your own valley, and buy in the charts for seven leagues around the capital");
T("couriers", "Couriers", "world", ["cartography"], 1, "Relays on every road: columns, scouts and agents travel a quarter faster");
T("surveying", "Surveying", "world", ["cartography"], 1, "The chain and the plane table: see the neighbouring crowns — and train Scouts, who chart what they ride through and count what they meet");
T("cipher", "Ciphers", "world", ["surveying"], 2, "A hand no foreign clerk can read: train Agents to take service in a rival city and send home its musters and its arts");
T("astrolabe", "Astrolabe", "world", ["surveying"], 2, "Latitude by the stars: half the continent comes within the eye");
T("fieldglass", "The Field Glass", "world", ["cipher"], 3, "Scouts see half again as far, and an agent is far harder to catch");
T("mercator", "Mercator's Projection", "world", ["astrolabe"], 3, "The whole of Europe on one sheet, and an eye to match it");
// ===== industry =====
// The third tree, and the one that decides whether the colony stoops or builds.
// Everything in the first two trees makes a man better at what he is already
// doing by hand; these replace the hand with a work. They are also the only road
// to metal: iron, copper and tin are in the ground, and nothing but a mine gets
// them out.
T("masonry", "Masonry", "industry", [], 1, "Unlocks the Quarry — a cut face of stone worked by a quarryman, instead of hunting boulders through the woods");
T("millwork", "Millwork", "industry", ["masonry"], 2, "Unlocks the Sawmill — a lumberjack saws 4 logs into 2 doors, far faster than a man with an adze");
T("mining", "Mining", "industry", ["masonry"], 2, "Unlocks the Mine and the miner's trade — iron, copper and tin ore out of the deep ground");
T("deepshafts", "Deep Shafts", "industry", ["mining"], 3, "Quarries and mines work 30% faster, and every shift brings up more");
T("smelting", "Smelting", "industry", ["mining"], 3, "Unlocks the Smelter — a blacksmith cooks ore down into iron or copper");
T("blastfurnace", "Blast Furnace", "industry", ["smelting"], 4, "Smelters draw twice the metal out of the same ore");
T("alloys", "Alloys", "industry", ["smelting"], 4, "The blacksmith melts copper and tin together into bronze, and forges it into tools and arms");
TECH.lances.req.push("warhorse");
TECH.foraging.done = TECH.ownership.done = TECH.forging.done = true;   // starting knowledge

const has = id => TECH[id].done;
const techCost = t => 15 + t.depth * 12;
const techTime = t => 45 + t.depth * 40;
let research = null;

// ===== the faiths =====
// Hamburg is a Lutheran city and your family left it as Lutherans. The woods
// are not: a Reformed weaver walking north out of the Palatinate, a Mennonite
// ploughman from the Altona side of the wall, a Catholic mason out of Bavaria,
// a Portuguese Jew who has been moved on from three towns already, an Orthodox
// deserter off the Polish frontier, a Turk who did not go home from Vienna.
//
// A faith is not a badge. It decides what a person believes their life is FOR,
// and so what they reach for when nobody is telling them what to do. It decides
// who they can bear to live beside. And it decides what they will take from you:
// a man whose creed you have proclaimed and whose church you have raised will
// pay a tithe that would put another man back on the road.
//
// Everything here is what these people actually did in 1683, not what is
// convenient. The Catholic keeps some fifty holy days and does not work them.
// The Reformed will not have an image in the building and works the harder for
// it. The Anabaptist will not take the weapon you hold out to him, and no order
// of yours changes that. The Orthodox keeps the better part of two hundred fast
// days and eats accordingly. The Jew pays a protection tax nobody asked him
// whether he wanted. Where a rule looks like a nuisance, it was one.
//
// `wants` is the work a faith turns to unbidden — read by faithErrand, which is
// offered the idle hour before any profession claims it.
const FAITHS = {
  lutheran: {
    name: "Lutheran", one: "a Lutheran", tint: "#3a63a8", weight: 40,
    house: "Lutheran Church", shrineName: "Lutheran Prayer House",
    creed: "Faith alone, and the work in front of you is holy — a cobbler serves God by making good shoes.",
    rule: "Obedient to the magistrate: will not rise against you, whatever the tithe.",
    wants: [], stubborn: 0.5, meek: true,
  },
  catholic: {
    name: "Roman Catholic", one: "a Catholic", tint: "#c9a03a", weight: 18,
    house: "Catholic Chapel", shrineName: "Catholic Shrine",
    creed: "The Church, the sacraments, and the corporal works of mercy: feed the hungry, and it is counted.",
    rule: "Turns to the fields, and gives bread away rather than sell it. Keeps the holy days, and works 8% fewer hours for them.",
    wants: ["farm"], stubborn: 0.7, alms: "food", workMul: 1.08,
  },
  reformed: {
    name: "Reformed", one: "a Calvinist", tint: "#5c6b58", weight: 14,
    house: "Reformed Church", shrineName: "Reformed Prayer House",
    creed: "The plain preached Word, no image in the building, and diligence in a calling as the sign of election.",
    rule: "Turns to the quarry and the market, and works 10% faster than anyone. Cannot abide a painted church.",
    wants: ["stone", "market"], stubborn: 0.7, workMul: 0.90,
  },
  anabaptist: {
    name: "Anabaptist", one: "a Mennonite", tint: "#6f8f5a", weight: 10,
    house: "Mennonite Meeting House", shrineName: "Mennonite Meeting Room",
    creed: "Baptism on confession, the community of goods, and nonresistance — the sword is outside the perfection of Christ.",
    rule: "Will never take a weapon nor bear arms for you, and never rebels. Farms and builds, and shares what it has.",
    wants: ["farm", "wood"], stubborn: 0.9, pacifist: true, meek: true, alms: "food",
  },
  jewish: {
    name: "Jewish", one: "a Jew", tint: "#c98a2e", weight: 7,
    house: "Synagogue", shrineName: "Prayer Room",
    creed: "The Law and the covenant, kept whole in a foreign town under a charter that can be revoked at a month's notice.",
    rule: "Turns to the market, and arrives with capital. Pays the Schutzgeld — 2 DM above the common tithe.",
    wants: ["market"], stubborn: 0.95, purse: 14, tribute: 2,
  },
  orthodox: {
    name: "Orthodox", one: "an Orthodox", tint: "#3f5fa8", weight: 6,
    house: "Orthodox Church", shrineName: "Orthodox Chapel",
    creed: "The unchanged rite, the icons, and the fast — near two hundred days of the year kept off meat and oil.",
    rule: "Fasts: grows hungry a third more slowly than anyone else. Turns to stone and to timber.",
    wants: ["stone", "wood"], stubborn: 0.8, fastMul: 0.66,
  },
  muslim: {
    name: "Muslim", one: "a Muslim", tint: "#3f8f5a", weight: 5,
    house: "Mosque", shrineName: "Prayer House",
    creed: "The one God, the five prayers, and zakat — a fixed share of what you own owed to the poor, not given as a favour.",
    rule: "Pays zakat: hands coin to the poorest in the colony unasked. Turns to stone, and to the market.",
    wants: ["stone", "market"], stubborn: 0.85, alms: "coin",
  },
};
const FAITH_IDS = Object.keys(FAITHS);
// What each crown on the map professed in 1683, so that a town you storm gives
// up people who believe what the people of that place actually believed. The
// awkward ones are deliberate: Brandenburg's Hohenzollerns were Calvinist over
// a Lutheran country and the country is what these folk are; Transylvania was
// the one Calvinist principality east of the Rhine; and the Crimean Khanate is
// Muslim, which is the whole reason it is drawn separately from Poland.
const NATION_FAITH = {
  scotland: "reformed", england: "reformed", ireland: "catholic", france: "catholic",
  castile: "catholic", aragon: "catholic", portugal: "catholic", hre: "catholic",
  brandenburg: "lutheran", saxony: "lutheran", bavaria: "catholic", austria: "catholic",
  milan: "catholic", savoy: "catholic", venice: "catholic", tuscany: "catholic",
  papal: "catholic", naples: "catholic", sicily: "catholic",
  sweden: "lutheran", denmark: "lutheran", poland: "catholic",
  russia: "orthodox", cossacks: "orthodox", crimea: "muslim",
  hungary: "catholic", transylvania: "reformed", moldavia: "orthodox", wallachia: "orthodox",
  ottoman: "muslim", algiers: "muslim", tunis: "muslim", tripoli: "muslim",
};
const faithOfNation = id => NATION_FAITH[id] || DEFAULT_FAITH;
const DEFAULT_FAITH = "lutheran";                  // Hamburg, and so your family
const faithOf = c => (c && FAITHS[c.faith]) ? c.faith : DEFAULT_FAITH;
const F = c => FAITHS[faithOf(c)];
const faithIcon = id => `assets/sprites/ui/faith_${id}.png`;
let stateFaith = null;                             // null until a creed is proclaimed
// Which creed the next shrine or house of worship is raised to. It follows the
// state creed when there is one and the largest congregation otherwise, so the
// common case needs no thought — and the picker in the build menu is there for
// the uncommon one, which is a ruler quietly building a chapel for a minority
// he has no intention of professing.
let dedicateTo = DEFAULT_FAITH;
function defaultDedication() {
  if (stateFaith) return stateFaith;
  let best = DEFAULT_FAITH, bn = -1;
  for (const id of FAITH_IDS) { const k = flockOf(id); if (k > bn) { bn = k; best = id; } }
  return best;
}

// ===== who hates whom, and how much =====
// Graded by what these people had actually done to each other by 1683, not by
// how different they look on paper. The Thirty Years' War was one generation
// back and everybody in the woods remembers whose army came through.
//
// Two asymmetries are deliberate. The Anabaptists were hunted by Lutherans,
// Reformed and Catholics alike — the one point all three agreed on — so they
// are widely disliked; but nonresistance is a doctrine about the heart as well
// as the hand, and a Mennonite returns none of it. And the Sephardim of Hamburg
// had lived under the Porte within living memory, so a Jew and a Turk in the
// same clearing find they have rather less to argue about than either has with
// the men who burnt them out.
const FAITH_HATE = {
  lutheran:   { catholic: 4, reformed: 2, anabaptist: 4, jewish: 5, orthodox: 2, muslim: 6 },
  catholic:   { lutheran: 4, reformed: 5, anabaptist: 4, jewish: 5, orthodox: 4, muslim: 6 },
  reformed:   { lutheran: 2, catholic: 5, anabaptist: 3, jewish: 4, orthodox: 4, muslim: 5 },
  anabaptist: {},                                   // commanded to love, and does
  jewish:     { lutheran: 3, catholic: 4, reformed: 3, anabaptist: 1, orthodox: 3, muslim: 1 },
  orthodox:   { lutheran: 2, catholic: 4, reformed: 4, anabaptist: 2, jewish: 3, muslim: 5 },
  muslim:     { lutheran: 4, catholic: 5, reformed: 4, anabaptist: 2, jewish: 1, orthodox: 5 },
};
const faithHate = (a, b) => (FAITH_HATE[faithOf(a)] || {})[faithOf(b)] || 0;

// ===== the census =====
// Every standing house of the faith, anywhere in the empire — a church in a
// daughter town still consoles a man in the capital, because it is HIS church.
//
// Counted ONCE a frame and cached, because the caller is happinessTarget and the
// caller of that is the per-civ loop. Written the obvious way — a filter over
// `buildings` per question — every soul re-counted the same seven congregations
// and their houses for themselves. Measured at sixty souls and 260 buildings it
// is 0.28ms a frame against 0.25ms, so this is tidiness rather than a rescue;
// but there is no reason to answer the same question sixty times, and the cost
// is the kind that grows with the colony while the frame budget does not.
// The cache is dropped at the top of each frame and each syncUI, so nothing can
// read a stale count after a church is raised, a soul converts, or a creed is
// proclaimed.
let faithTally = null;
const clearFaithCensus = () => { faithTally = null; };
function faithCensus() {
  if (faithTally) return faithTally;
  const t = { house: {}, shrine: {}, flock: {}, dissent: 0 };
  for (const id of FAITH_IDS) t.house[id] = t.shrine[id] = t.flock[id] = 0;
  for (const b of buildings) {
    if (b.fire || b.site) continue;
    if (b.type === "temple" && t.house[b.faith] !== undefined) t.house[b.faith]++;
    else if (b.type === "shrine" && t.shrine[b.faith] !== undefined) t.shrine[b.faith]++;
  }
  for (const c of civs) {
    if (c.child) continue;                        // a child is of no congregation yet
    const f = faithOf(c);
    t.flock[f]++;
    if (stateFaith && f !== stateFaith) t.dissent++;
  }
  return (faithTally = t);
}
const housesOfFaith = f => faithCensus().house[f] || 0;
const shrinesOfFaith = f => faithCensus().shrine[f] || 0;
const flockOf = f => faithCensus().flock[f] || 0;

// ===== what the colony does for a man's soul, 0 to 1 =====
// This is the input the tithe is judged against, and it is deliberately NOT
// happiness: happiness is the sum of moodReasons, and feeding it back into one
// of its own terms would be a loop that eats itself. Piety is measured from
// things the player builds and proclaims, and nothing else.
function faithComfort(c) {
  const f = faithOf(c);
  let m = 0;
  if (stateFaith === f) m += 0.42;
  else if (stateFaith) m -= 0.16;                   // another man's church on the hill
  m += Math.min(2, housesOfFaith(f)) * 0.22;
  m += Math.min(2, shrinesOfFaith(f)) * 0.08;
  if (oneFlock() && stateFaith === f) m += 0.16;    // one faith, one flock, no argument
  return Math.max(0, Math.min(1, m));
}
// True when every soul under your flag professes the state creed. Nothing is
// stored: it is simply asked of the roll, so it breaks the moment you shake a
// dissenter's hand at the gate — which is the whole bargain.
function oneFlock() {
  return !!stateFaith && civs.length > 1 && faithCensus().dissent === 0;
}

// The soul's share of moodReasons. Kept apart so the government panel can show
// the religious account on its own without unpicking the rest.
function faithReasons(c) {
  const r = [], f = faithOf(c), F0 = FAITHS[f];
  if (stateFaith === f) r.push(["the state professes their faith", 11]);
  else if (stateFaith) r.push([`a state church not their own (${FAITHS[stateFaith].name})`, -13]);
  const h = Math.min(2, housesOfFaith(f)), s = Math.min(2, shrinesOfFaith(f));
  // Named properly: "a Mennonite Meeting House of their own", not a lowercased
  // mangling of a proper noun. Churches take -es; everything else takes -s.
  if (h) r.push([h > 1 ? `two ${F0.house}${/ch$/.test(F0.house) ? "es" : "s"} of their own`
                       : `${withArt(F0.house)} of their own`, h * 13]);
  else if (s) r.push(["somewhere of their own to pray", s * 6]);
  else r.push(["nowhere of their own to pray", -7]);
  if (oneFlock() && stateFaith === f) r.push(["one faith, one flock", 9]);
  // Living as the only one of your creed in a strange town is its own weight,
  // and it is not the same thing as being disliked — that is the opinions.
  const mine = flockOf(f), grown = civs.filter(c2 => !c2.child).length;
  if (grown >= 4 && mine === 1 && stateFaith !== f) r.push(["alone in their faith here", -8]);
  return r;
}

// ===== the tithe a believer will bear =====
// The oldest bargain in Europe: a crown that keeps the altar gets to keep the
// purse. A man whose creed is proclaimed and whose church is built pays a tax
// of five as though it were a tax of two, and says grace over it. A man whose
// church you never raised feels every mark of it.
const TAX_FAITH_RELIEF = 0.55;                      // at most this much of the tithe forgiven
function taxMoodReason(c) {
  if (!taxRate) return null;
  const comfort = faithComfort(c);
  const bite = -taxRate * 6 * (1 - TAX_FAITH_RELIEF * comfort);
  const label = comfort >= 0.6 ? `taxes at ${taxRate} — borne for the faith`
              : comfort >= 0.3 ? `taxes at ${taxRate} — the church takes the edge off`
              : `taxes at ${taxRate}`;
  return [label, bite];
}

// ===== a wanderer's creed =====
// Weighted to where you are standing. Most of what walks out of a North German
// wood in 1683 is Lutheran; the rest is rarer the further from home it started.
function rollFaith() {
  const total = FAITH_IDS.reduce((n, id) => n + FAITHS[id].weight, 0);
  let roll = Math.random() * total;
  for (const id of FAITH_IDS) { roll -= FAITHS[id].weight; if (roll <= 0) return id; }
  return DEFAULT_FAITH;
}

// ===== conversion =====
// The slow road, and the only one that costs nobody their home. A dissenter
// living under a proclaimed creed, with that creed's great house standing where
// he can see it, may in the end walk into it. He is likelier to if he is the
// last of his own kind here and likelier still the longer it goes on — but
// every faith resists at its own rate, and two of them resist almost entirely.
// The Anabaptists and the Sephardim were pressed harder than anyone in Europe
// and did not break; it would be a lie to make them cheap.
// Tuned against the clock, not by feel: a lone Catholic with the state church in
// sight comes over in about twenty minutes, a large minority holds out for the
// better part of an hour, and the Anabaptists and the Sephardim never come over
// at all — at their stubbornness the sum needs two hours of unbroken pressure,
// which no colony sustains. That last is the honest answer and it is meant to be.
const CONVERT_BASE = 1 / 600;
function updateFaithDrift(c, dt) {
  if (c.child || c.rebel || !stateFaith) return;
  const f = faithOf(c);
  if (f === stateFaith) { c.doubt = 0; return; }
  if (!housesOfFaith(stateFaith)) { c.doubt = Math.max(0, (c.doubt || 0) - dt * CONVERT_BASE); return; }
  // his own church standing is what holds him; being the last of his kind is
  // what wears him down
  const anchor = housesOfFaith(f) ? 0.15 : shrinesOfFaith(f) ? 0.5 : 1;
  const alone = flockOf(f) <= 1 ? 1.6 : flockOf(f) <= 2 ? 1.15 : 0.7;
  c.doubt = (c.doubt || 0) + dt * CONVERT_BASE * anchor * alone * (1 - FAITHS[f].stubborn);
  if (c.doubt >= 1) {
    c.doubt = 0;
    const was = FAITHS[f].name;
    c.faith = stateFaith;
    tell("life", `${c.name} is received into the ${FAITHS[stateFaith].house} — ${was} no longer.`);
    tally.converted = (tally.converted || 0) + 1;
    // the ones he leaves behind do not all wish him well
    for (const o of civs) if (o !== c && faithOf(o) === f) nudgeOpinion(o, c, -18);
  }
}

// ===== driving a soul out =====
// There is no gentle word for this and the game does not offer one. They walk
// out of the territory and they do not come back; whatever they were carrying
// goes with them, and whatever they knew goes with them too.
//
// So they must be unpicked from the colony as thoroughly as a dead one is: the
// rota of a quarry, the stretcher of a doctor, the grudge in somebody's head.
// Half of that self-heals and half of it does not, and the half that does not
// leaves a phantom on a work crew, or a grudge inherited by the next stranger
// to be given the name.
function banish(c, quiet) {
  if (!civs.includes(c)) return;
  const f = faithOf(c);
  // a half-finished job does not keep its progress bar once the hands are gone
  if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  if (c.shelter) turnOut(c, true);
  unassignWork(c);
  if (selected === c) selected = null;
  if (skillCiv === c) closeSkills();
  selGroup = selGroup.filter(sg => sg !== c);
  // The name goes back in the pool, so the opinions filed under it must not stay
  // behind to be inherited by whoever is given it next.
  for (const o of civs) { if (o.op) delete o.op[c.name]; if (o.feudWith === c.name) endFeud(o); }
  if (c.bearing) { c.bearing.bearer = null; if (c.bearing.state === "borne") c.bearing.state = "idle"; c.bearing = null; }
  if (c.bearer) { c.bearer.bearing = null; c.bearer = null; }
  c.ward = null; c.post = null;
  civs.splice(civs.indexOf(c), 1);
  usedNames.delete(c.name);
  tally.banished = (tally.banished || 0) + 1;
  // Everyone left who shares the creed of the one you just put on the road draws
  // the obvious conclusion about their own prospects.
  for (const o of civs) if (faithOf(o) === f) o.happiness = Math.max(0, o.happiness - 14);
  if (!quiet) tell("law", `⚠ ${c.name}, ${FAITHS[f].one}, is driven out of the colony.`);
  if (civs.length === 0) return gameOver();
  syncUI();
}
// The edict: every dissenter at once, in an afternoon. It needs a proclaimed
// creed to be dissenting FROM, and it does not spare the useful.
function proclaimExpulsion() {
  if (!stateFaith) return toast("Proclaim a state creed first — there is nothing yet to dissent from.");
  const out = civs.filter(c => faithOf(c) !== stateFaith);
  if (!out.length) return toast("There is not a dissenter left in the colony.");
  const kids = out.filter(c => c.child).length;
  for (const c of [...out]) banish(c, true);
  tell("law", `⚠ THE EDICT OF EXPULSION: ${out.length} souls${kids ? ` (${kids} of them children)` : ""} are put out of the colony for refusing the ${FAITHS[stateFaith].name} creed.`);
  tally.expulsions = (tally.expulsions || 0) + 1;
  SFX.build();
  // A ruler may proclaim a creed nobody here holds and then enforce it, and the
  // colony walks out of the gate to a man. banish() has already ended the game;
  // do not go on to redraw a government for a place with nobody in it.
  if (!civs.length) return;
  syncUI();
}

// ===== what a faith sends a person to do =====
// Offered the idle hour before any profession claims it, so a creed shows in
// the streets rather than only in a panel. Returns true when it has given an
// order and autonomy should stand down.
function faithErrand(c) {
  const f = F(c);
  // ALMS. The rest of the colony peddles its surplus at two marks a loaf; these
  // three give it away — the works of mercy, the community of goods, and zakat.
  if (f.alms === "food" && (c.inv.bread + c.inv.meat) > 1) {
    const poor = civs.find(o => o !== c && !o.rebel && !INDOORS.has(o.state) && o.hunger < 45 &&
                                (o.inv.bread + o.inv.meat + o.inv.wheat) === 0 &&
                                Math.hypot(o.x - c.x, o.y - c.y) < 520);
    if (poor) { order(c, { kind: "peddle", target: poor, alms: true, x: poor.x + 18, y: poor.y + 6 }); return true; }
  }
  if (f.alms === "coin" && c.inv.dm >= 6) {
    const poor = civs.filter(o => o !== c && !o.rebel && !INDOORS.has(o.state) && o.inv.dm <= 1 &&
                                  Math.hypot(o.x - c.x, o.y - c.y) < 520)
                     .sort((a, b) => a.inv.dm - b.inv.dm)[0];
    if (poor) { order(c, { kind: "peddle", target: poor, alms: true, x: poor.x + 18, y: poor.y + 6 }); return true; }
  }
  // and now and then a soul simply goes to church
  const house = buildings.filter(b => (b.type === "temple" || b.type === "shrine") &&
                                      b.faith === faithOf(c) && !b.fire && !b.site)
                         .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
  if (house && Math.random() < 0.12) {
    order(c, { kind: "walk", x: house.x + (Math.random() * 40 - 20), y: house.y + 18 });
    return true;
  }
  return false;
}
// ===== the creed on the page =====
// Both pickers are filled from FAITH_IDS, so adding an eighth faith to the table
// adds it to the government and to the build menu without touching either.
function fillFaithPickers() {
  const opts = FAITH_IDS.map(id => `<option value="${id}">${esc(FAITHS[id].name)}</option>`).join("");
  const st = $("stateFaithSel");
  if (st) st.innerHTML = `<option value="">— none proclaimed —</option>` + opts;
  const dd = $("dedSelect");
  if (dd) dd.innerHTML = opts;
}
function renderFaithPanels() {
  const st = $("stateFaithSel");
  if (st && st.value !== (stateFaith || "")) st.value = stateFaith || "";
  const gi = $("govFaithIcon");
  if (gi) {
    gi.style.display = stateFaith ? "inline-block" : "none";
    if (stateFaith) gi.src = faithIcon(stateFaith);
  }
  const creed = $("govCreed");
  if (creed) creed.textContent = stateFaith
    ? FAITHS[stateFaith].creed
    : "No creed is proclaimed. Everyone believes what they came here believing, and nobody is comforted or galled by the state for it.";
  // the congregations, largest first, with what each one has to pray in
  const flocks = $("govFlocks");
  if (flocks) {
    const rows = FAITH_IDS.map(id => [id, flockOf(id)]).filter(([, k]) => k > 0).sort((a, b) => b[1] - a[1]);
    flocks.innerHTML = rows.length ? rows.map(([id, k]) => {
      const f = FAITHS[id], h = housesOfFaith(id), sh = shrinesOfFaith(id);
      const where = h ? `${h} ${h > 1 ? "houses" : "house"}` : sh ? `${sh} ${sh > 1 ? "shrines" : "shrine"}` : "nowhere to pray";
      // A hanging indent, not a flex row of three: the panel is narrow enough that
      // a row of separate spans breaks between the name and its own count.
      return `<div style="display:flex;align-items:flex-start;gap:6px">
        <img src="${faithIcon(id)}" alt="" style="width:16px;height:16px;flex:0 0 16px;margin-top:2px;image-rendering:pixelated">
        <span><span style="color:${id === stateFaith ? "#c9a86a" : "#9ab0a2"}">${esc(f.name)}</span><span style="color:#5a6b60"> &mdash; ${k} ${k > 1 ? "souls" : "soul"}, ${where}</span></span></div>`;
    }).join("") : '<span style="color:#5a6b60">Nobody left to believe anything.</span>';
  }
  // what the altar is buying you, said in the only currency a ruler counts
  const piety = $("govPiety");
  if (piety) {
    if (!civs.length) piety.textContent = "";
    else {
      const avg = civs.reduce((t, c) => t + faithComfort(c), 0) / civs.length;
      const forgiven = Math.round(taxRate * 6 * TAX_FAITH_RELIEF * avg);
      const pts = `${forgiven} point${forgiven === 1 ? "" : "s"}`;
      piety.textContent = oneFlock()
        ? `One flock, one creed — and it holds only until you admit a dissenter. The altar forgives about ${pts} of the tithe's sting.`
        : `The altar forgives about ${pts} of the tithe's sting, on average. ` +
          (civs.some(c => faithOf(c) !== stateFaith) && stateFaith
            ? `${civs.filter(c => faithOf(c) !== stateFaith).length} dissent.` : "");
    }
  }
  const ex = $("edictExpel");
  if (ex) {
    const out = stateFaith ? civs.filter(c => faithOf(c) !== stateFaith).length : 0;
    ex.disabled = !stateFaith || !out;
    ex.textContent = !stateFaith ? "Proclaim a creed first"
                   : !out ? "Not a dissenter left"
                   : `Proclaim the Edict of Expulsion — ${out} put out`;
  }
  const dd = $("dedSelect");
  if (dd) {
    if (!FAITHS[dedicateTo]) dedicateTo = defaultDedication();
    if (dd.value !== dedicateTo) dd.value = dedicateTo;
    const di = $("dedIcon"); if (di) di.src = faithIcon(dedicateTo);
  }
}

// ===== the work a creed turns to =====
// Only where no trade already claims the hour: a colony's blacksmith is its
// blacksmith whatever he believes, and this must never pull a specialist off
// the job he was recruited for. It is the unassigned hands — and the farmers
// and hunters, who have slack in their day — that a faith gets to direct.
//
// The Lutherans have an empty list and that is the doctrine, not an oversight:
// Beruf holds that the work already in front of you is the holy work, so a
// Lutheran takes whatever the colony hands him and this function has nothing
// to add.
function faithWork(c) {
  const wants = F(c).wants;
  if (!wants.length) return false;
  if (c.profession && !["farmer", "hunter"].includes(c.profession)) return false;
  for (const tag of wants) {
    if (tag === "farm") {
      const ripe = farms.find(f => f.ready && !f.workers.some(w => civs.includes(w)) &&
                                   Math.hypot(f.x - c.x, f.y - c.y) < 600);
      if (ripe) { order(c, { kind: "harvest", target: ripe, x: ripe.x, y: ripe.y + 10 }); return true; }
      if (res.seeds < farmSeedCost() * 4) {
        const pt = nearThings("patches", c.x, c.y, laws.freeRoam ? 800 : 500)
          .filter(p2 => p2.alive && (laws.freeRoam || nearTerritory(p2.x, p2.y)))[0];
        if (pt) { order(c, { kind: "gather", target: pt, forColony: true, x: pt.x + 16, y: pt.y + 4 }); return true; }
      }
    }
    if (tag === "stone" && (c.inv.stone || 0) < 8) {
      const rk = nearThings("stones", c.x, c.y, laws.freeRoam ? 900 : 600)
        .filter(st => st.alive && (laws.freeRoam || nearTerritory(st.x, st.y)))[0];
      if (rk) { order(c, { kind: "quarry", target: rk, x: rk.x + 26, y: rk.y + 6 }); return true; }
    }
    if (tag === "wood" && (c.inv.logs || 0) < 9) {
      const tr = nearThings("trees", c.x, c.y, laws.freeRoam ? 800 : 500)
        .filter(t2 => t2.alive && t2.growth >= 1 && (laws.freeRoam || nearTerritory(t2.x, t2.y)))[0];
      if (tr) { order(c, { kind: "chop", target: tr, x: tr.x + 26, y: tr.y + 6 }); return true; }
    }
    if (tag === "market" && (c.inv.bread + c.inv.meat) > 1) {
      let mk = null, md = Infinity;
      for (const b of buildings) if (b.type === "market" && !b.fire && !b.site) {
        const d = Math.hypot(b.x - c.x, b.y - c.y);
        if (d < md) { md = d; mk = b; }
      }
      if (mk) { order(c, { kind: "sell", target: mk, x: mk.x, y: mk.y + 16 }); return true; }
    }
  }
  return false;
}

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
  if (inside.length && reason) toast(`${inside.length} driven out of the ${bldgLabel(b)} — ${reason}.`);
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
                       "hospital", "quarry", "mine", "sawmill", "smelter", "shrine", "temple"]);
// A ruin keeps the footprint of what it was: burnt wall, wall-shaped rubble.
const baseType = b => (b.type === "burned" && b.was) ? b.was : b.type;
const ruinKey = b => {
  const was = b.was || "cabin";
  // A gutted church is a gutted church whatever was preached in it — one wreck
  // serves every creed, and the dedication is remembered in `faith` for the rebuild.
  if (was === "temple" || was === "shrine") return "burned_temple";
  const k = "burned_" + was + (b.rot && IMAGES["burned_" + was + "v"] ? "v" : "");
  return IMAGES[k] ? k : "burned";
};
// A ruin is named for what it was: "Burned Forge", not a nameless heap.
function bldgName(b) {
  if (b.type === "burned" && b.was) return "Burned " + bldgLabel({ type: b.was, faith: b.faith });
  return bldgLabel(b);
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
    tell("build", `The ${bldgLabel({ type: was, faith: b.faith })} has ${how}.`);
    return;
  }
  b.type = "burned"; b.was = was;   // `faith` rides along, so a rebuild is the same church
  b.workers = undefined; b.smelt = undefined;   // nobody is on the rota of a wreck
  b.maxHp = b.maxHp || 100; b.hp = b.maxHp;
  b.fire = 0; b.torchP = -1;
  tally.burned++;
  tell("build", `The ${bldgLabel({ type: was, faith: b.faith })} has ${how}. It can be repaired by order.`);
}
// deep snow slows every traveller by a fifth — the road's packed lane still helps
const snowPace = () => season() === "winter" ? 0.8 : 1;
const walkSpeed = c => BASE_WALK * snowPace() * (1 + (has("horses") ? 0.15 : 0) + (has("horsebreeding") ? 0.10 : 0) + (has("saddling") ? 0.10 : 0)) * (c && isForce(c) ? (has("warhorse") ? 1.35 : 1.15) : 1) * (c && c.profession === "cavalry" ? 1.45 : 1);
const workMul = c => (1 - toolBonus(c)) * (has("stables") ? 0.8 : 1) * (laws.forced ? 0.75 : 1)
                     * (c && c.sick > 0 ? 1.8 : 1)    // a man abed is slow at everything
                     * (c ? (F(c).workMul || 1) : 1)  // holy days kept, or a calling worked hard
                     * temperWork(c);                 // and an idle one is slow at everything else

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
// ===== what a soul is like =====
// A skill is what a person has learned. A temperament is what they were like
// before they had learned anything, and it does not change: a man does not stop
// being hot-blooded because the harvest came in well.
//
// Everyone carries exactly one, drawn from six opposed pairs, and it is a thumb
// on the scales of the systems already here — how fast the work goes, what
// lifts and grinds a mood, how deep a quarrel cuts, what a fight costs, what the
// winter takes. Not one of these is a new subsystem: every one is a multiplier
// on a number that existed already, and every one surfaces as a line in the mood
// panel or a figure on the sheet. A player who wonders why this man is slower,
// angrier or colder than the man beside him can always find out.
//
// The sim always uses the true temperament. Only the PANEL waits until the
// colony has seen enough to name it — a person acts like themselves from the
// hour they arrive, whether or not you have taken their measure yet.
const TEMPERS = [
  { id: "industrious", name: "Industrious", opp: "idle",
    blurb: "Works unwatched, and rests badly.",
    does: "An eighth quicker at every kind of work, and far less apt to wander when a job ends.",
    tell: "has not been caught standing still since the day they came" },
  { id: "idle", name: "Idle", opp: "industrious",
    blurb: "Works when watched, and wanders when not.",
    does: "A seventh slower at every job, and half again as apt to wander off when one ends.",
    tell: "is forever found leaning on something" },
  { id: "hot", name: "Hot-tempered", opp: "even",
    blurb: "Takes offence quickly, and keeps it warm.",
    does: "Quarrels near twice as often as most, and half again as bitterly. A short road to a feud.",
    tell: "has a short way with anyone who crosses them" },
  { id: "even", name: "Even-tempered", opp: "hot",
    blurb: "Slow to quarrel, and quick to let it go.",
    does: "Quarrels half as often, and half as bitterly. Feuds seldom begin with this one.",
    tell: "let an insult go by without turning round" },
  { id: "gregarious", name: "Gregarious", opp: "solitary",
    blurb: "Thrives in company, and pines without it.",
    does: "Five to their mood in company, seven against it alone. Warms and sours half again as fast.",
    tell: "is never to be found on their own" },
  { id: "solitary", name: "Solitary", opp: "gregarious",
    blurb: "Wants elbow room, and sours in a crowd.",
    does: "Six off their mood in a crowd of four, four added in an empty street. Slow to judge anyone.",
    tell: "walks the long way round to keep off the square" },
  { id: "stout", name: "Stout-hearted", opp: "timid",
    blurb: "Stands when others run, and strikes the harder for it.",
    does: "Strikes a seventh harder, and a raid at the gate costs them nothing in nerve.",
    tell: "stood their ground when there was every reason not to" },
  { id: "timid", name: "Timid", opp: "stout",
    blurb: "Unnerved by trouble, and slower to answer it.",
    does: "Strikes a seventh softer, and twelve off their mood while raiders are abroad. Surviving a fight ends it.",
    tell: "goes white at the sight of an armed stranger" },
  { id: "generous", name: "Generous", opp: "grasping",
    blurb: "Hands in everything they gather, and is thought well of for it.",
    does: "Hands goods in at three in the pack rather than five, and the neighbours think the better of them.",
    tell: "gives away a good deal more than they keep" },
  { id: "grasping", name: "Grasping", opp: "generous",
    blurb: "Keeps what they gather, and is known for that too.",
    does: "Sits on twelve before handing any in, so the stores stay thin — and the neighbours notice.",
    tell: "has never once handed in a full pack" },
  { id: "hardy", name: "Hardy", opp: "sickly",
    blurb: "Shrugs off the cold and the fever both.",
    does: "The winter takes half again as long to bite, and the plague passes them over more often than not.",
    tell: "works bare-armed in weather that lays other men up" },
  { id: "sickly", name: "Sickly", opp: "hardy",
    blurb: "Takes the cold and the fever before anybody else.",
    does: "Freezes near half again as fast, and is among the first the fever takes.",
    tell: "is first to the sickbed every time" },
];
// What life did to them, on top of what they were born as. A mark is earned by
// something that actually happened in this colony and is announced by the event
// that caused it — there is nothing to discover about a man's grief, you watched
// him bury her. One at a time: the latest thing to happen is the thing he is.
const MARKS = [
  { id: "bereaved",  name: "Bereaved",  blurb: "Lost someone they were fond of.",
    does: "Four off their mood for good, once the fresh grief wears off. Grief passes; this does not." },
  { id: "hardened",  name: "Hardened",  blurb: "Has been in a fight and is less afraid of the next.",
    does: "Strikes a seventh harder, like a stout heart, and never feels the dread of a raid again." },
  { id: "bitter",    name: "Bitter",    blurb: "Came out of a feud badly, and has not forgiven it.",
    does: "Five off their mood, and every view they take of anyone now moves a quarter faster." },
  { id: "contented", name: "Contented", blurb: "Has been warm, fed and unbothered a long while.",
    does: "Six added to their mood, and it holds as long as nothing goes wrong." },
  { id: "disgraced", name: "Disgraced", blurb: "Has been in the colony's jail, and it is remembered.",
    does: "Seven off their mood, and every neighbour thinks a little less of them." },
];
const TEMPER = Object.fromEntries(TEMPERS.map(t => [t.id, t]));
const MARK   = Object.fromEntries(MARKS.map(m => [m.id, m]));
// What a person IS, which the simulation always knows.
const isT = (c, id) => !!c && c.temper === id;
const isM = (c, id) => !!c && c.mark === id;
const rollTemper = () => TEMPERS[Math.floor(Math.random() * TEMPERS.length)].id;

// --- taking a person's measure ---
// A temperament is revealed by being exercised, not by a clock and not by a
// separate tally running quietly alongside. Every place below that bends a
// number also reports that it bent one, so the evidence the panel needs is
// produced by the very mechanism it describes: the two can never disagree.
//
// Nothing here may be called from a per-frame path. A frame is not evidence —
// at sixty of them a second any threshold is crossed instantly, which is the
// same mistake that once made every rebellion roll fire at once. Call it from
// finished work, from a quarrel, from a blow struck, from a night in the cold.
const TRAIT_REVEAL_AT = 8;
function noteTemper(c, by) {
  if (!c || !c.temper || c.temperSeen || c.child) return;
  c.temperO = (c.temperO || 0) + by;
  if (c.temperO < TRAIT_REVEAL_AT) return;
  c.temperSeen = true;
  const t = TEMPER[c.temper];
  // the chronicle, not a toast: sixty people taking each other's measure would
  // be sixty interruptions, and none of them urgent
  chron("life", `${c.name} ${t.tell} — ${t.name.toLowerCase()}, plainly.`);
}
// A mark is never hidden: the thing that earned it was public.
function setMark(c, id, why) {
  if (!c || c.child || c.mark === id) return;
  c.mark = id;
  chron("life", `${c.name} — ${MARK[id].name.toLowerCase()}: ${why}`);
}

// --- the thumb on the scales ---
// Work: the industrious lose little to the clock, the idle give a good deal back.
const temperWork = c => isT(c, "industrious") ? 0.88 : isT(c, "idle") ? 1.15 : 1;
// A blow struck. The stout-hearted hit harder for not flinching; the timid do
// not — unless they have been through a fight already and found it survivable.
const temperArm = c => isT(c, "stout") || isM(c, "hardened") ? 1.15
                     : isT(c, "timid") ? 0.85 : 1;
// How hard a quarrel bites, and how long the blood stays up afterwards.
const temperTemperament = c => isT(c, "hot") ? 1.6 : isT(c, "even") ? 0.5 : 1;
// How readily a view of somebody moves at all — good or bad.
const temperDrift = c => isT(c, "gregarious") ? 1.4 : isT(c, "solitary") ? 0.6
                       : isM(c, "bitter") ? 1.25 : 1;
// The winter and the fever.
const temperCold = c => isT(c, "hardy") ? 0.7 : isT(c, "sickly") ? 1.4 : 1;
// How much company this person is in, counted once every socialTick and cached
// on `nearN`. It is deliberately NOT measured where it is used: moodReasons runs
// for every soul on every frame, so a fresh distance scan there would be the
// whole colony measured against the whole colony sixty times a second. A mood
// reading a count that is a few seconds stale is worth exactly nothing less.
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
  // A finished piece of work is one observation of how this person works. This
  // is the only place it is counted, because this is the only place the game is
  // certain a task actually ended rather than merely being in progress.
  if (isT(c, "industrious") || isT(c, "idle")) noteTemper(c, 0.5);
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
const forceDmg = c => (c.profession === "soldier" ? 15 : c.profession === "cavalry" ? 20 : 12) + (has("wardogs") ? 5 : 0) + (has("hussars") ? 15 : 0) + (has("lances") ? 10 : 0) + (has("raiding") ? 10 : 0) + (c.armed ? weaponDmg(c) : 0);
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
// Tech says what form the smith knows how to make; the metal says how well it
// came out. A stone spear and an iron one are the same weapon, badly and well made.
const weaponForm = () => (has("battleaxes") ? 28 : has("swords") ? 20 : has("spears") ? 14 : 8) + (has("blades") ? 5 : 0);
const weaponDmg = c => Math.round(weaponForm() * weaponMult(c));
const weaponIron = () => Math.max(1, 2 - (has("hilts") ? 1 : 0));
const canForgeWeapons = () => has("spears") || has("swords") || has("battleaxes");
const treasuryFloor = () => has("lordship") ? -50 : 0;

// ===== the works =====
// Foraging is what a colony does before it has anything. A man walks out, finds
// a boulder, breaks it, and comes back with what his arms will hold — and when
// the boulders near the hearth are gone he walks further, and further, and the
// day is spent walking. A work does not run out and does not need finding: it is
// a face of rock with steps cut into it, a shaft with a windlass over it, a saw
// driven by a stream. What it makes goes straight into the town's store, because
// carrying is the part a work exists to abolish.
// Every one of them is a building with a trade attached. Put the right pair of
// hands on it and they keep at it without being asked again; put nobody on it
// and it stands idle and still costs its keep on tax day.
const INDUSTRY = {
  quarry:  { prof: "quarryman",  skill: "quarrying",   time: 5, doing: "cutting stone" },
  mine:    { prof: "miner",      skill: "quarrying",   time: 8, doing: "down the shaft" },
  sawmill: { prof: "lumberjack", skill: "woodcutting", time: 6, doing: "at the saw" },
  smelter: { prof: "blacksmith", skill: "smithing",    time: 9, doing: "at the furnace" },
};
const isWork = t => !!INDUSTRY[t];
const worksOf = b => (b.workers || [])
  .filter(w => civs.includes(w) && w.profession === INDUSTRY[b.type].prof);
const workTime = (b, c) => INDUSTRY[b.type].time *
  ((b.type === "quarry" || b.type === "mine") && has("deepshafts") ? 0.7 : 1) *
  workMul(c) * workSkill(c, INDUSTRY[b.type].skill);
// What a shift down the shaft turns up. Copper is common in these hills, iron is
// not, and the tin is washed out of the gravel in the bottom of the workings a
// handful at a time — which is why bronze is the metal a poor colony can afford
// and iron is the one it waits for.
const SEAMS = [
  { p: 0.40, key: "copperore", n: 3 },
  { p: 0.35, key: "ironore",   n: 2 },
  { p: 0.25, key: "tin",       n: 2 },
];
// what one shift takes out of the store, and what it puts back
function workNeeds(b) {
  if (b.type === "sawmill") return { logs: 4 };
  if (b.type === "smelter") return b.smelt === "copper" ? { copperore: 3 } : { ironore: 3 };
  return {};
}
function workYield(b) {
  const rich = has("deepshafts") ? 1 : 0, hot = has("blastfurnace") ? 2 : 1;
  if (b.type === "quarry") return { stone: 4 + rich };
  if (b.type === "sawmill") return { doors: 2 };
  if (b.type === "smelter") return b.smelt === "copper" ? { copper: 2 * hot } : { iron: hot };
  let r = Math.random(), seam = SEAMS[SEAMS.length - 1];
  for (const sm of SEAMS) { if (r < sm.p) { seam = sm; break; } r -= sm.p; }
  return { [seam.key]: seam.n + rich };
}
// A work draws on its own town's store first and the capital's after, the same
// way building does — a smelter in a daughter town is not stopped by ore sitting
// in the capital's shed.
const haveGoods = (led, need) => Object.entries(need)
  .every(([k, q]) => (led[k] || 0) + (led === res ? 0 : (res[k] || 0)) >= q);
function takeGoods(led, need) {
  for (const [k, q] of Object.entries(need)) {
    const local = Math.min(q, led[k] || 0);
    led[k] = (led[k] || 0) - local;
    if (q > local && led !== res) res[k] = (res[k] || 0) - (q - local);
  }
}
const workFed = b => haveGoods(ledgerAt(b.x, b.y), workNeeds(b));
const GOOD_NAME = { ironore: "iron ore", copperore: "copper ore" };
const goodName = k => GOOD_NAME[k] || k;
// ===== what a colony costs to keep =====
// Wages for the men under arms, upkeep for the works that need tending. Cabins,
// walls, lamps, farms and saplings are free — you built them, they stand. What
// costs is what employs somebody or must be maintained. Both bills fall on tax
// day, out of the same purse the taxes go into, so the ledger reads as one
// account: what came in, what went out, what is left.
const WAGE = 2;                 // a soldier, constable, musketeer or rider, per tax day
const CIVIC_UPKEEP = 1;         // per tended work, per tax day
const CIVIC = new Set(["hospital", "jail", "watchtower", "market", "townhall", "forge", "bakery", "recruit", "well",
                       "quarry", "mine", "sawmill", "smelter"]);
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
  quarry: "assets/sprites/buildings/quarry_32.png", quarry_w: "assets/sprites/buildings/quarry_w_32.png",
  mine: "assets/sprites/buildings/mine_32.png", mine_w: "assets/sprites/buildings/mine_w_32.png",
  sawmill: "assets/sprites/buildings/sawmill_32.png", sawmill_w: "assets/sprites/buildings/sawmill_w_32.png",
  smelter: "assets/sprites/buildings/smelter_32.png", smelter_w: "assets/sprites/buildings/smelter_w_32.png",
  shrine: "assets/sprites/buildings/shrine_32.png",
  burned_temple: "assets/sprites/buildings/burned_temple_32.png",
};
// one great house per creed, drawn the way that creed actually built
for (const f of FAITH_IDS) IMAGES["temple_" + f] = `assets/sprites/buildings/temple_${f}_32.png`;
// every structure a torch can reach, drawn once more as a cold wreck
for (const k of ["recruit", "market", "watchtower", "bakery", "well", "forge", "townhall", "jail", "hospital",
                 "farm", "wall", "wallv", "gate", "gatev", "stonewall", "stonewallv",
                 "stonegate", "stonegatev", "quarry", "mine", "sawmill", "smelter"])
  IMAGES["burned_" + k] = `assets/sprites/buildings/burned_${k}_32.png`;
IMAGES.burned_cabin = "assets/sprites/buildings/burned_house_32.png";   // the ruin that was always here
// Every building drawn a second time from its narrow end, for the ones that have
// been turned a quarter turn. A flat head-on elevation cannot be rotated in code
// — the roof would end up on its side — so the side view is its own sprite.
// Anything without one simply keeps facing front: bldgSprite falls back.
for (const k of ["cabin", "market", "bakery", "forge", "townhall",
                 "jail", "hospital", "recruit", "sawmill", "smelter"]) {
  IMAGES[k + "v"] = `assets/sprites/buildings/${k}v_32.png`;
  IMAGES[k + "v_w"] = `assets/sprites/buildings/${k}v_w_32.png`;   // under snow
}
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
const res = { logs: 0, seeds: 0, stone: 0, ironore: 0, copperore: 0, tin: 0, copper: 0,
              iron: 0, bronze: 0, doors: 0, wheat: 0, bread: 0, meat: 0, dm: 60, weapons: 0, tools: 0,
              armoury: { stone: 0, bronze: 0, iron: 0 } };
// res.weapons stays the count that raids, conquest and the war council already
// read. The breakdown beside it only says of what. Weapons still arrive with no
// provenance — an old save, a town taken by force — so before anything is drawn
// out, whatever the count says is treated as real and the strays are called stone.
function reconcileArmoury() {
  const a = res.armoury || (res.armoury = { stone: 0, bronze: 0, iron: 0 });
  for (const m of MATERIALS) a[m.id] = Math.max(0, Math.floor(a[m.id] || 0));
  let known = MATERIALS.reduce((t, m) => t + a[m.id], 0);
  if (res.weapons > known) { a.stone += res.weapons - known; known = res.weapons; }
  for (let i = 0; i < MATERIALS.length && known > res.weapons; i++) {
    const id = MATERIALS[i].id, drop = Math.min(a[id], known - res.weapons);
    a[id] -= drop; known -= drop;
  }
}
const armouryAdd = id => { reconcileArmoury(); res.armoury[id] = (res.armoury[id] || 0) + 1; res.weapons++; };
// The best blade in the rack is the one handed out. Returns the material, or null.
function armouryTake() {
  reconcileArmoury();
  for (let i = MATERIALS.length - 1; i >= 0; i--) {
    const id = MATERIALS[i].id;
    if (res.armoury[id] > 0) { res.armoury[id]--; res.weapons--; return id; }
  }
  return null;
}
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
// The middle of the game is not allowed to run away with itself: twenty is as
// far as this goes, and every absolute number in the game — a garrison's size,
// a camp's stakes — is measured against it.
function difficulty() { return Math.max(1, Math.min(20, Math.round(menace()))); }

// ===== the reckoning: the ceiling comes off =====
// The trouble with a cap is that a colony eventually reaches it and then never
// hears from the woods again — the last hour of a good game was the quietest.
// Once the ambitions are in hand the colony has proved it can take whatever the
// woods have, and from that hour the woods stop being bounded by anything but
// how long you insist on standing there.
//
// This decides how OFTEN they come and how well armed they are when they do.
// How MANY are in your street at once is still attackerCap()'s to say, and that
// has not moved: seven, and never more than two past your own strength. An
// endgame should be relentless, not a wall of bodies.
let reckoningOpenedAt = -1;
let blockade = null;          // {nation, t} — the routes closed by a crown at war
const invested = new Set();   // towns currently ringed by a besieging column
const reckoningOpen = () => reckoningOpenedAt >= 0;
function reckoning() {
  if (!reckoningOpen()) return difficulty();
  // menace goes on rising with the colony; the hours since the ledger opened are
  // added on top, so standing still is no longer a way to be left alone
  return menace() + Math.max(0, playT - reckoningOpenedAt) / 200;
}
// how far past the old ceiling we are, which is what the endgame dials read
const pastTheCap = () => Math.max(0, reckoning() - 20);
const raidFloor = () => Math.max(RAID_FLOOR_MIN, RAID_FLOOR - pastTheCap() * 9);
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

// ===== the world's own seed =====
// genChunk hashed the chunk's coordinates and a fixed constant, and nothing
// else. Every colony ever begun — every player, every slot, every restart —
// stood in the same forest, with the same spruces and the same stones in the
// same places. A colony builder with one map has one run in it.
//
// The seed now moves the trees AND rolls the country's character: how thick the
// woods are, how much stone lies under them, how much grows wild. A run in a
// stone-poor thicket asks different questions than one in an open valley, which
// is the point — a different map is a screenshot, a different country is a game.
// The ranges are bounded so that no seed is a colony that cannot be built.
//
// Labels are the source of truth, not the number: whatever you type is hashed,
// so a world can be handed to someone else as a word. A save from before all
// this carries no label, and gets the original constant and a flat character —
// an existing colony's woods must not rearrange themselves under its feet.
const LEGACY_SEED = 0x5f3759df;
const SEED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no I/O/0/1 to mistype
let worldLabel = "", worldSeed = LEGACY_SEED;
let WORLD = { trees: 1, stone: 1, forage: 1 };
function seedFrom(text) {                                // FNV-1a over the label
  let h = 2166136261 >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function randomSeedLabel() {
  let s = "";
  for (let i = 0; i < 6; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return s;
}
function worldCharacter(seed) {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const r = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const w = { trees: 0.70 + r() * 0.66, stone: 0.70 + r() * 0.80, forage: 0.72 + r() * 0.70 };
  // Stone gets the higher floor of the three because it is the one thing the
  // woods never grow back — a country thin on spruce recovers, a country with
  // no rock in it just means longer and longer walks for the rest of the game.
  //
  // And the three roll independently, so about one country in twenty-seven came
  // out poor in all of them at once. Poor in one thing is the interest of the
  // draw; poor in two is a hard country; poor in three is only a bad afternoon,
  // and it would land on someone's first game. The leanest is lifted until the
  // country as a whole can carry a colony.
  const FLOOR = 2.75;
  const total = w.trees + w.stone + w.forage;
  if (total < FLOOR) {
    const k = w.trees <= w.stone && w.trees <= w.forage ? "trees"
            : w.stone <= w.forage ? "stone" : "forage";
    w[k] += FLOOR - total;
  }
  return w;
}
function setWorld(label) {
  worldLabel = String(label || "").trim().toUpperCase();
  worldSeed = worldLabel ? seedFrom(worldLabel) : LEGACY_SEED;
  WORLD = worldLabel ? worldCharacter(worldSeed) : { trees: 1, stone: 1, forage: 1 };
  chunks.clear();                                        // the old forest is not this one
}
// how the country reads, for the player who wants to know what they drew
function worldTell() {
  const band = (v, lo, hi) => (v < lo ? 0 : v > hi ? 2 : 1);
  const woods = ["thin woods", "steady woods", "deep woods"][band(WORLD.trees, 0.85, 1.15)];
  const rock  = ["little stone", "some stone", "rich in stone"][band(WORLD.stone, 0.8, 1.2)];
  const wild  = ["poor forage", "fair forage", "good forage"][band(WORLD.forage, 0.9, 1.2)];
  return `${woods} · ${rock} · ${wild}`;
}

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
// Your own family are not strangers to be studied. You grew up with these two:
// their tempers are known from the first hour and shown on the sheet at once.
civs[0].temper = "stout";       civs[0].temperSeen = true;
civs[1].temper = "industrious"; civs[1].temperSeen = true;

function mkCiv(name, who, x, y, gender) {
  return { name, who, nativeWho: who, gender: gender || "m", x, y, tx: x, ty: y, state: "idle", anim: 0, facing: 1,
           task: null, workT: 0, home: null, profession: null,
           hunger: 100, hp: 100, maxHp: 100, happiness: 75, rebel: false, armed: false, tool: null,
           inv: { logs: 0, seeds: 0, stone: 0, iron: 0, wheat: 0, bread: 0, meat: 0, dm: 0 },
           age: 20 + Math.floor(Math.random() * 26),
           autoT: 3 + Math.random() * 4, atkT: 0, stuckT: 0, coldT: 0, coldWarned: false, isCiv: true,
           sick: 0, op: {}, feudWith: null, feudT: 0, socT: 2 + Math.random() * 6, jail: null, jailT: 0,
           temper: rollTemper(), temperSeen: false, temperO: 0, mark: null, calmT: 0, fought: 0,
           ward: null, wardT: 0, bearing: null, bearer: null, grief: null,
           faith: DEFAULT_FAITH, doubt: 0,
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
  let seed = ((cx * 73856093) ^ (cy * 19349663) ^ worldSeed) >>> 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  // The attempt counts and the near-clearing limit scale together, so thin
  // woods are thin everywhere rather than only out past the treeline.
  const nTree = Math.max(6, Math.round(21 * WORLD.trees));
  const nearCap = Math.max(3, Math.round(7 * WORLD.trees));
  for (let i = 0; i < nTree; i++) {
    const x = cx * CHUNK + rnd() * CHUNK, y = cy * CHUNK + rnd() * CHUNK;
    const d = Math.hypot(x, y);
    if (d < 190) continue;
    if (!(d < 430) && i >= nearCap) continue;
    if (ch.trees.some(t => Math.hypot(t.x - x, t.y - y) < 46)) continue;
    ch.trees.push({ x, y, alive: true, progress: -1, growth: 1 });
  }
  for (let i = 0; i < 2; i++) {
    const x = cx * CHUNK + rnd() * CHUNK, y = cy * CHUNK + rnd() * CHUNK;
    if (Math.hypot(x, y) < 210 || rnd() >= 0.55 * WORLD.stone) continue;
    ch.stones.push({ x, y, alive: true, progress: -1 });
  }
  for (let i = 0; i < 3; i++) {
    const x = cx * CHUNK + rnd() * CHUNK, y = cy * CHUNK + rnd() * CHUNK;
    if (Math.hypot(x, y) < 150 || rnd() >= 0.7 * WORLD.forage) continue;
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

// ===== what a tier buys them =====
// It used to buy hit points, and hit points are the least interesting thing a
// man can be given. A raider with three hundred of them is not frightening, he
// is tedious: the same fight, held for longer. So the bulk stops at a dozen
// tiers and everything past that is equipment — mail that turns a blow aside,
// and a better blade behind it.
//
// The point is that kit has an answer and bulk does not. Mail is beaten by a
// musket, by a wall he has to climb with both hands, by a smith's tools in your
// own men's hands. Standing there swinging for twice as long is beaten by
// nothing but patience.
const KIT_MAX = 3;
const KIT_SOAK = [0, 0.14, 0.26, 0.36];        // what the mail turns aside
const KIT_BITE = [0, 1.6, 3.2, 4.8];           // and what the better blade adds
const KIT_NAME = ["", "leather", "mail", "plate and mail"];
function kitFor(tier) {
  // The first threshold sits above difficulty()'s ceiling on purpose: nothing
  // wears mail until the reckoning is open, so the middle of the game is
  // exactly the game it was. After that it arrives a piece at a time and slowly
  // — the rungs were five tiers apart to begin with, which spent the whole
  // ladder inside twenty minutes and turned a progression into a light switch.
  return Math.max(0, Math.min(KIT_MAX, Math.floor((tier - 14) / 8)));
}
// bulk stops here; past it the tier is spent on kit instead
const raiderHp = tier => 60 + Math.min(tier, 12) * 8;

function mkRaider(camp, state) {
  const tier = reckoning();
  const hp = raiderHp(tier);
  const kit = kitFor(tier);
  return { x: camp.x + Math.random() * 60 - 30, y: camp.y + 20 + Math.random() * 30, hp, maxHp: hp,
           dmg: (camp.type === "raid" ? 14 : 10) + Math.min(tier, 12) * 1.2 + KIT_BITE[kit], kit,
           camp, target: null,
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
  // ===== the siege: a man whose whole job is to stand there =====
  // He walks to his place in the ring and stops. He does not burn anything, does
  // not go for the storehouse, does not come to you. He fights whatever comes
  // within reach of him — the block above has already seen to that — and
  // otherwise he waits, which is the entire weapon.
  if (r.state === "invest") {
    const dx = r.ringX - r.x, dy = r.ringY - r.y;
    const d = Math.hypot(dx, dy);
    if (d > 18) {
      r.x += dx / d * speed * dt; r.y += dy / d * speed * dt;
      r.facing = dx < 0 ? -1 : 1;
      r.anim += dt * 7;
    } else r.anim += dt * 1.2;             // shifting his weight, waiting
    return;
  }
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
          toast(`⚠ Enemy soldiers have wrecked a ${bldgLabel(b)}!`);
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
  // Mail is worn, not carried: whatever the blow was worth, this much of it
  // stays outside. Shown as it lands, so the player can see why an axe that
  // felled a raider last winter is now taking three swings.
  let turned = 0;
  if (b.kit) {
    const soak = KIT_SOAK[Math.min(KIT_MAX, b.kit)];
    turned = Math.round(dmg * soak);
    dmg = Math.max(1, dmg - turned);       // no armour is proof against everything
  }
  b.hp -= dmg;
  float(b.x, b.y - 70, "-" + dmg + (turned ? ` (${turned} turned)` : ""), turned ? "#c9a86a" : "#d86a5a");
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
const SMALL_BLDG = { farm: FARM_SIZE, wall: 64, gate: 72, stonewall: 64, stonegate: 76, moat: 64, ditch: 64, lamp: 26,
                    shrine: 64 };
// What a thing occupies and what it looks like are not the same measurement. A
// lamppost stands about as tall as the man beneath it but takes up almost no
// ground, so you can line a street with them without them refusing each other.
const DRAW_SIZE = { lamp: 58 };
const drawSizeOf = t => DRAW_SIZE[t] || SMALL_BLDG[t] || BLDG_SIZE;
// Most buildings are drawn as their type. A great house is drawn as its creed —
// the seven of them share a type and share nothing else.
const bldgSprite = b => {
  const base = (b.type === "temple" && IMAGES["temple_" + b.faith]) ? "temple_" + b.faith : b.type;
  // turned a quarter turn, if there is a sprite for it — and simply facing front
  // if there is not, which is how a new building type gets to exist before its
  // side view has been drawn
  return (b.rot && IMAGES[base + "v"]) ? base + "v" : base;
};
// which building types can actually be turned: the ones that have a side view
const CAN_TURN = t => !!IMAGES[t + "v"] || WALLLIKE.has(t);
// Off every rota — the farms and the works both. A man who dies, is sent to
// another town, or walks out as a settler must not be left on a roll he can no
// longer answer.
function unassignWork(c) {
  for (const f of farms) f.workers = f.workers.filter(w => w !== c);
  for (const b of buildings) if (b.workers) b.workers = b.workers.filter(w => w !== c);
}
function bldgRect(b) {
  const bt = baseType(b);
  if (WALLLIKE.has(bt)) {
    const L = SMALL_BLDG[bt];
    return b.rot ? { x: b.x - 11, y: b.y - L, w: 22, h: L }
                 : { x: b.x - L / 2, y: b.y - 22, w: L, h: 22 };
  }
  const s = SMALL_BLDG[bt] || BLDG_SIZE;
  // Seen end-on it is a narrower building, and it takes up correspondingly less
  // of the street — which is most of the reason to turn one in the first place.
  if (b.rot && IMAGES[bt + "v"]) {
    const w = Math.round(s * 0.66);
    return { x: b.x - w / 2, y: b.y - s, w, h: s };
  }
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
function legalToBuild(type, wx, wy, rot, ignore) {
  // A run already begun may always be continued: if the piece locked onto a wall
  // of yours, nothing but the cost may refuse it — the builders fell what is in
  // the way. (snapWallPos is always called immediately before this.)
  if (WALLLIKE.has(type) && wallSnapped) return true;
  if (WALLLIKE.has(type)) {
    if (!nearTerritoryWide(wx, wy, 5)) return false;                       // not too far from home
    for (const cp of camps) if (Math.hypot(cp.x - wx, cp.y - wy) < 520) return false;   // not at their door
  } else if (type !== "sapling" && !inTerritory(wx, wy)) return false;
  const s = type === "sapling" ? 20 : (SMALL_BLDG[type] || BLDG_SIZE);
  const r0 = rot === undefined ? wallRot : rot;
  // a building standing end-on takes a narrower piece of ground, exactly as
  // bldgRect gives it once it is up — the two must agree or a building can be
  // placed somewhere it then does not fit
  const turnedW = Math.round(s * 0.66);
  const cand = (type === "wall" || type === "gate")
    ? bldgRect({ type, x: wx, y: wy, rot: r0 })
    : (r0 && IMAGES[type + "v"])
      ? { x: wx - turnedW / 2, y: wy - s, w: turnedW, h: s }
      : { x: wx - s / 2, y: wy - s, w: s, h: s };
  const placingWall = WALLLIKE.has(type);
  // A lamppost keeps a wall's manners: it butts up close to whatever it lights,
  // and nothing has to leave room for its doorway, because it has not got one.
  const placingProp = isProp(type);
  for (const b of allStructures()) {
    if (ignore && b === ignore) continue;      // a building never blocks its own new site
    const bWall = WALLLIKE.has(b.type);
    // Nothing is built in a doorway. Wall pieces are allowed to overlap each
    // other by ten pixels so a run reads as one unbroken face — and that licence
    // was enough to let a segment come to rest on top of a gate and brick it up.
    // A sealed gate is invisible (it still draws as a gate) and permanent, and
    // it locks every civilian in the colony out of their own town.
    //
    // The test is centre-in-rect rather than any overlap at all: the two pieces
    // either side of a gate are SUPPOSED to touch it, and a plain overlap test
    // refuses the whole run.
    if (placingWall && (b.type === "gate" || b.type === "stonegate") && !b.site && inDoorway(cand, b)) return false;
    // Twelve pixels of air around every building, on top of the doorway apron,
    // meant a town could only ever be a scatter of huts in a field — you could
    // not put a bakery beside a market the way a street is actually built. Four
    // is enough to keep two roofs from sharing a wall, and the apron below is
    // what actually matters: it is the ground people walk in over.
    const margin = placingWall && bWall ? -10
                 : placingWall || placingProp || bWall || isProp(b.type) || b.type === "farm" ? 2 : 4;
    const r = inflate(bldgRect(b), margin);
    if (!bWall && !isProp(b.type) && b.type !== "farm" && !placingWall && !placingProp) r.h += 26;
    if (rectsOverlap(cand, r)) return false;
  }
  for (const c of camps) if (Math.hypot(c.x - wx, c.y - wy) < 200) return false;
  for (const t of nearThings("trees", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  for (const t of nearThings("stones", wx, wy, 160)) if (t.alive && pointInRect(t.x, t.y, inflate(cand, 10))) return false;
  return true;
}

// A wall piece is standing IN a gate — as against merely alongside it — when
// either one's middle falls inside the other's footprint.
function inDoorway(cand, gate) {
  const g = bldgRect(gate);
  const cx = cand.x + cand.w / 2, cy = cand.y + cand.h / 2;
  const gx = g.x + g.w / 2, gy = g.y + g.h / 2;
  return (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h) ||
         (gx >= cand.x && gx <= cand.x + cand.w && gy >= cand.y && gy <= cand.y + cand.h);
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

// ===== the gate is the way in =====
// A wall with a gate in it is a door, not a barrier, and people treat it as one:
// they set off toward the arch from wherever they are standing, rather than
// walking into the stone and working it out from there. The A* search finds the
// gap on its own when the journey is short enough to fit in its box, but it
// gives up on long ones, and a man who has to cross four screens to get home
// should still know where the door is. This is the answer for those: aim at the
// gate first, and at the destination through it.
const isGate = b => (b.type === "gate" || b.type === "stonegate") && !b.site && !b.fire;
// The gate that costs least for THIS journey — not the nearest one, which is
// regularly on the wrong side of the town and sends people the long way round.
// Both legs are tested, so a gate that only opens onto one end is not offered.
function bestGate(fx, fy, tx, ty) {
  let best = null, bd = Infinity;
  for (const g of buildings) {
    if (!isGate(g)) continue;
    const d = Math.hypot(g.x - fx, g.y - fy) + Math.hypot(tx - g.x, ty - g.y);
    if (d >= bd) continue;
    if (lineBlocked(fx, fy, g.x, g.y) || lineBlocked(g.x, g.y, tx, ty)) continue;
    bd = d; best = g;
  }
  return best;
}
// Squared up to the arch on both sides. Walking at the gate's own centre from an
// angle grazes the jamb and reads as being stuck; standing off it first, passing
// through, then carrying on, does not.
const GATE_STANDOFF = 36;
function gateRoute(fx, fy, tx, ty) {
  const g = bestGate(fx, fy, tx, ty);
  if (!g) return null;
  const upright = g.rot === 1;
  const side = upright ? (Math.sign(fx - g.x) || 1) : (Math.sign(fy - g.y) || 1);
  const outside = upright ? [g.x + side * GATE_STANDOFF, g.y] : [g.x, g.y + side * GATE_STANDOFF];
  const inside  = upright ? [g.x - side * GATE_STANDOFF, g.y] : [g.x, g.y - side * GATE_STANDOFF];
  return [outside, inside, [tx, ty]];
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
      // walled in? take the gate like a sensible person. The nearest one used to
      // do, which on a town with four gates was as often as not the one furthest
      // from where they were actually going.
      if (!c.viaGate && (!c.task || c.task.kind !== "attack")) {
        const via = gateRoute(c.x, c.y, c.task ? c.task.x : c.tx, c.task ? c.task.y : c.ty);
        if (via) {
          c.viaGate = true;
          c.path = via; c.tx = via[0][0]; c.ty = via[0][1];
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
                             winters: 0, taxDays: 0, billsPaid: 0, arrearDays: 0,
                             converted: 0, banished: 0, expulsions: 0 });
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
// One person's nature as the roll shows it: the temperament if it has been
// seen, and the mark beside it if they carry one. A child is not yet anything.
function folkTemperCell(c) {
  if (c.child) return `<span class="unknown">—</span>`;
  const t = c.temperSeen && TEMPER[c.temper], m = c.mark && MARK[c.mark];
  // The roll has room for a word, not a paragraph. The paragraph goes on hover.
  const say = x => esc(`${x.name} — ${x.blurb} ${x.does}`);
  const main = t ? `<span title="${say(t)}"><img src="assets/sprites/traits/${t.id}.png" alt="">${esc(t.name)}</span>`
                 : `<span class="unknown">not yet known</span>`;
  const mk = m ? `<img class="markIcon" src="assets/sprites/traits/${m.id}.png" alt="" title="${say(m)}">` : "";
  return main + mk;
}
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
  // with the world panel open, a message belongs beside the button that caused it
  const note = document.getElementById("miNote");
  if (note && isOpen("mapInfo")) { note.textContent = text; note.style.display = "block"; }
}
// Work is paid for out of the stores of whichever town you are standing in —
// the same ledger the HUD is showing you, so what you see is what you spend.
const LEDGER_KEYS = ["logs", "seeds", "stone", "ironore", "copperore", "tin", "copper",
                     "iron", "bronze", "wheat", "bread", "meat", "dm", "doors", "weapons"];
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
    // Grief passes; having lost somebody does not. Only a real attachment leaves
    // a mark — the whole colony is unsettled by a death, but it does not bereave
    // everyone who happened to be standing in the street.
    if (weight >= 0.6) setMark(o, "bereaved", `they were fond of ${c.name}, who is dead.`);
  }
  if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
  unassignWork(c);
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
  paused = pauseOpen || dlg.open || $("marchModal").style.display === "block" ||
           $("mayorModal").style.display === "block" || $("pactModal").style.display === "block" ||
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
  if (e.key.toLowerCase() === "r") {
    // R turns whatever you are holding — the thing you are about to build, or
    // the building you have picked up and are looking for a spot for
    if (buildMode && CAN_TURN(buildMode)) turnBuild();
    else if (moveBldg && CAN_TURN(baseType(moveBldg))) {
      moveBldg.rot = moveBldg.rot ? 0 : 1;
      toast(`${BLDG_NAMES[baseType(moveBldg)] || baseType(moveBldg)} turned ${moveBldg.rot ? "side-on" : "front-on"}.`);
    }
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
    if (isOpen("logPanel")) { closeLog(); }
    else if (isOpen("helpPanel")) { $("helpPanel").style.display = "none"; }
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
  worldTipSync(e.clientX, e.clientY);      // a city under the pointer says what it is
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
  // a city's label must not hang about over a panel the pointer has moved on to
  if (t !== canvas) { const tip = $("worldTip"); if (tip) tip.style.display = "none"; mapHover = null; }
});
// out of the window, or away to another tab: the map stops
document.addEventListener("mouseleave", () => {
  edge.on = false;
  const tip = $("worldTip"); if (tip) tip.style.display = "none"; mapHover = null;
});
addEventListener("blur", () => { edge.on = false; });
// How far back the camera may go is not a constant any more — it is the deepest
// chart your scholars have bought. Push against the ceiling and the game says
// which technology would lift it, once in a while, rather than silently refusing.
let zoomBlockedT = -999;
function zoomAt(sx, sy, factor) {
  const wx = cam.x + sx / zoom, wy = cam.y + sy / zoom;
  const floor = zoomFloor();
  // close enough to read a face; far enough out to see whatever you have charted
  const want = zoom * factor;
  zoom = Math.max(floor, Math.min(2.4, want));
  if (want < floor * 0.995 && zoom <= floor * 1.001) {
    const next = nextZoomTier();
    if (next && worldT - zoomBlockedT > 8) {
      zoomBlockedT = worldT;
      toast(`The eye can rise no further. Research ${TECH[next.tech].name} to see ${next.what}.`);
    }
  }
  cam.x = wx - sx / zoom;
  cam.y = wy - sy / zoom;
  cancelFlight();
  stratBarSync();
}
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  zoomAt(mouse.x, mouse.y, e.deltaY < 0 ? 1.12 : 0.89);
}, { passive: false });
function cancelAll() {
  cancelMove(true);
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
// 520ms was fine when a held finger only ever meant "cancel". Now a finger put
// down also raises the plaque that says what letting go will do, and the whole
// point of it is that you may take a moment to read — at 520ms, reading "Rebuild
// this ruin — needs 20 logs, 1 door, 5 DM" cost you your selection. The hold is
// longer than a glance now, and ✕ clears in one tap for anyone who wants it fast.
const TAP_SLOP = 14, HOLD_MS = 850;
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
// ?touch — one more founder's tool: forces the touchscreen build on a desktop,
// so the phone layout and the press-to-read plaque can be checked without a
// phone in hand. Nothing reads it but this line.
const IS_TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window ||
                 new URLSearchParams(location.search).has("touch");
if (IS_TOUCH) {
  document.body.classList.add("touch");
  $("cutHint").textContent = "TAP ▸";
  $("hint").textContent = "Drag to look about · pinch to zoom · hold to deselect";
}
// One turn, whatever is being placed. A wall swings between running east-west
// and running north-south; a building swings between showing you its front and
// showing you its gable end.
function turnBuild() {
  if (!buildMode || !CAN_TURN(buildMode)) return toast("Pick something from BUILD that can be turned.");
  wallRot = wallRot ? 0 : 1;
  toast(WALLLIKE.has(buildMode)
    ? `Wall turned ${wallRot ? "upright (north-south)" : "flat (east-west)"}.`
    : `${BLDG_NAMES[buildMode] || buildMode} turned ${wallRot ? "side-on" : "front-on"}.`);
  syncUI();
}
$("tbRotate").addEventListener("click", turnBuild);
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
    if (f.afield) continue;                       // he is a hundred leagues away
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
        toast(`${c.name} goes to raise the ${bldgLabel(b)}.`);
      }, "site", () => `Raise the ${bldgLabel(b)}`);
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
      // A work is signed on to the same way a farm is: pick the right trade and
      // tap it. Anyone else tapping it is only looking for a roof, so both live
      // in one branch — and when it IS an assignment it outranks the roof, or
      // ordering a quarryman onto his quarry would put him to bed in it instead.
      const rota = isWork(b.type) && !b.fire && c.profession === INDUSTRY[b.type].prof;
      add(bldgRect(b), () => {
        if (rota) {
          b.workers = b.workers || [];
          if (b.workers.includes(c)) {
            b.workers = b.workers.filter(w => w !== c);
            if (c.task && c.task.target === b) { c.task = null; c.state = "idle"; b.progress = -1; }
            toast(`${c.name} comes off the ${BLDG_NAMES[b.type].toLowerCase()}.`);
          } else {
            b.workers.push(c);
            toast(`${c.name} is put on the ${BLDG_NAMES[b.type].toLowerCase()} (${worksOf(b).length} working it).`);
          }
          return syncUI();
        }
        if (c.shelter === b) return turnOut(c);              // tap again to come back out
        if (sheltering(b).length >= SHELTER_CAP)
          return toast(`The ${bldgLabel(b)} is full — ${SHELTER_CAP} may shelter in it.`);
        order(c, { kind: "enter", target: b, x: b.x, y: b.y + 14 });
        toast(`${c.name} goes inside the ${bldgLabel(b)}.`);
      }, rota ? "farm" : "roof", () => rota
        ? ((b.workers || []).includes(c)
            ? `Take them off the ${BLDG_NAMES[b.type].toLowerCase()}`
            : `Set them to work the ${BLDG_NAMES[b.type].toLowerCase()}`)
        : c.shelter === b
          ? `Bring them out of the ${bldgLabel(b)}`
          : `Shelter inside the ${bldgLabel(b)}`);
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
  if (buildMode) return `Click to place the ${bldgLabel({ type: buildMode, faith: dedicateTo })}` +
                        (CAN_TURN(buildMode) ? " · R turns it" : "") + " · Esc to stop";
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
    if (pointInRect(wx, wy, bldgRect(b))) return `Look at the ${bldgLabel(b)}`;
  if (selected) return soldierGroup().length > 1 ? "March the band here" : `Send ${selected.name} here`;
  return null;
}
function worldClick(clientX, clientY) {
  if (gameState !== "playing") return;
  mouse.x = clientX; mouse.y = clientY;
  mouse.wx = cam.x + mouse.x / zoom; mouse.wy = cam.y + mouse.y / zoom;
  closeSiegeMenu();                        // a click anywhere else drops the choice
  if (paused) return;
  if (moveBldg) { finishMove(mouse.wx, mouse.wy); return; }   // carrying something: set it down
  if (roadMode) return;                    // the road builder works on press and release, not on click
  // Up at map height there is nobody to select and nothing to build on: a click
  // there is a click on the country, and belongs to the far map.
  if (onMap() && !buildMode && worldMapClick(clientX, clientY)) return;

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
                      hospital: 15, lamp: 2, quarry: 12, mine: 18, sawmill: 15, smelter: 15,
                      shrine: 6, temple: 20 };
function finishConstruction(b) {
  b.site = false; b.progress = -1;
  const claims = !WALLLIKE.has(b.type) && !isProp(b.type);   // a lamp claims no ground
  if (claims) expandAround(b.x, b.y, 1);
  tally.raised++;
  tell("build", `${bldgLabel(b)} raised.${claims ? " The territory grows." : ""}`);
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
function snapWallPos(type, wx, wy, ignore) {
  wallSnapped = false;
  if (!WALLLIKE.has(type)) return [wx, wy];
  let best = null, bd = 110;
  for (const b of buildings) {
    if (ignore && b === ignore) continue;      // a wall being carried does not snap to itself
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
// ===== picking a building up and putting it down again =====
// The only way to change your mind about where something stood was to dismantle
// it and raise it again — which loses the occupants, the stock on the shelves,
// the rota at the works, and three quarters of the materials. So nobody ever
// changed their mind, and every colony is laid out the way it was on the first
// afternoon, when there were four people and no idea what the place would become.
//
// A building can be carried to a new spot instead. Its people, its stores and
// its state come with it; what it costs is a quarter of what it cost to build,
// which is the labour of taking it down and putting it up, and nothing else.
let moveBldg = null;
const MOVE_SHARE = 0.25;
// walls are cheap and go up in a moment; a keep is not yours to shift, and a
// ruin has nothing left to carry
const CAN_MOVE = b => b && !b.site && !b.keep && !b.foreign && b.type !== "burned";
function moveCost(b) {
  const full = costOf(baseType(b)) || {};
  const out = {};
  for (const [k, v] of Object.entries(full)) {
    const n = Math.ceil(v * MOVE_SHARE);
    if (n > 0) out[k] = n;
  }
  return out;
}
function beginMove(b) {
  if (!CAN_MOVE(b)) return toast("That cannot be moved.");
  const cost = moveCost(b);
  if (!canPay(cost, ledgerAt(b.x, b.y)))
    return toast(`Moving it costs ${costText(cost)} in labour and materials.`);
  moveBldg = b;
  buildMode = null; roadMode = false;
  toast(`Carrying the ${BLDG_NAMES[baseType(b)] || baseType(b)} — click where it should stand. Right-click or Esc to set it back down.`);
  syncUI();
}
function cancelMove(quiet) {
  if (!moveBldg) return;
  moveBldg = null;
  if (!quiet) toast("It stays where it is.");
  syncUI();
}
// The same rules as raising one from nothing, minus the building itself.
function moveLegal(b, wx, wy) {
  return legalToBuild(baseType(b), wx, wy, b.rot, b);
}
function finishMove(wx, wy) {
  const b = moveBldg;
  if (!b || !buildings.includes(b)) { moveBldg = null; return; }
  if (WALLLIKE.has(baseType(b))) [wx, wy] = snapWallPos(baseType(b), wx, wy, b);
  if (!moveLegal(b, wx, wy))
    return toast(inTerritory(wx, wy) ? "Not there — too close to another building, its doorway, or an obstacle."
                                     : "That ground is not yours.");
  const cost = moveCost(b);
  const led = ledgerAt(b.x, b.y);
  if (!canPay(cost, led)) { cancelMove(true); return toast(`Moving it costs ${costText(cost)}.`); }
  pay(cost, led);
  const fromX = b.x, fromY = b.y;
  b.x = wx; b.y = wy;
  // Anyone walking to it was walking to where it used to be, and anyone standing
  // inside it is now standing in a field. Both are put right here rather than
  // left to work it out, which they cannot.
  for (const c of civs) {
    if (c.task && c.task.target === b) { c.task.x = wx; c.task.y = wy + 24; c.tx = wx; c.ty = wy + 24; c.path = null; }
    if (c.shelter === b || (c.home === b && INDOORS.has(c.state))) { c.x = wx; c.y = wy + 24; }
    if (c.post && Math.hypot(c.post.x - fromX, c.post.y - fromY) < 40) c.post = { x: wx, y: wy + 24 };
  }
  expandAround(wx, wy, 1);                       // the ground under it is yours
  markChunkDirty(fromX, fromY); markChunkDirty(wx, wy);
  moveBldg = null;
  SFX.build();
  toast(`The ${BLDG_NAMES[baseType(b)] || baseType(b)} now stands here.`);
  syncUI();
}

function tryPlace(type, wx, wy) {
  if (type === "forge" && !has("forging")) { toast("A forge requires the Forging technology."); buildMode = null; syncUI(); return; }
  if ((type === "wall" || type === "gate") && !has("defending")) { toast("Walls and gates require the Defending technology."); buildMode = null; syncUI(); return; }
  if (type === "townhall" && !has("township")) { toast("A town hall requires the Township technology."); buildMode = null; syncUI(); return; }
  if (["stonewall", "stonegate", "moat", "ditch"].includes(type) && !has("defplus")) { toast("Stoneworks and earthworks require Defending II."); buildMode = null; syncUI(); return; }
  if (isWork(type) && !has(BUILD_GATES[type])) {
    toast(`A ${BLDG_NAMES[type].toLowerCase()} requires the ${TECH[BUILD_GATES[type]].name} technology.`);
    buildMode = null; syncUI(); return;
  }
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
    // A house of worship is dedicated the day the ground is broken, not the day
    // it opens: the creed is what the masons are being paid to build.
    if (type === "temple" || type === "shrine") b.faith = FAITHS[dedicateTo] ? dedicateTo : defaultDedication();
    if (type === "wall") { b.hp = b.maxHp = 100; }
    if (type === "gate") { b.hp = b.maxHp = 60; }
    if (type === "stonewall") { b.hp = b.maxHp = 220; }
    if (type === "stonegate") { b.hp = b.maxHp = 140; }
    if (WALLLIKE.has(type) || CAN_TURN(type)) b.rot = wallRot;
    // a work is a building with a rota: nobody on it yet, and the furnace set to
    // iron until somebody says otherwise
    if (isWork(type)) { b.workers = []; if (type === "smelter") b.smelt = "iron"; }
    b.site = true; b.buildP = 0;
    buildings.push(b);
    evictFromFootprint(b);
    toast(`${bldgLabel({ type, faith: dedicateTo })} staked out — a civilian will come and raise it.`);
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
      // The search box could not hold the journey, or there is no way through at
      // all. Make for the gate anyway: it is what a person would do, and it beats
      // walking into the stone and discovering the wall a second at a time.
      if (!c.path && blocked) {
        const via = gateRoute(c.x, c.y, task.x, task.y);
        if (via) { c.path = via; c.tx = via[0][0]; c.ty = via[0][1]; c.viaGate = true; }
      }
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
  // safe behind the wall: stop there rather than wandering back out through it
  if (!t || t.kind === "walk" || t.kind === "toGate") { c.state = "idle"; c.task = null; return; }
  const simple = { chop: "chopping", quarry: "quarrying", gather: "gathering", craft: "crafting", work: "working",
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
    // the work may have been burned, dismantled or pulled down on the walk over
    if (t.kind === "work" && (!buildings.includes(t.target) || t.target.fire || t.target.site)) { c.state = "idle"; c.task = null; return; }
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

  // A roof that came free — because it was raised, or because whoever lived in it
  // died, or because the family it held was burned out and rehoused elsewhere —
  // used to go unnoticed by anyone standing homeless in the street. houseCiv was
  // called when a cabin was BUILT and at almost no other time, so a raid that
  // took three roofs left three people homeless for good, losing a little mood
  // every day and freezing in the winter, with empty cabins across the square.
  if (!c.home && houseCiv(c, c.x, c.y)) {
    toast(`${c.name} moves into an empty cabin.`);
    return;
  }
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
    // He goes for a better tool than the one in his hand, not just for his first:
    // a man with a stone axe will pay to trade up when iron reaches the racks.
    const upgrade = bestOnRacks(shopF, c, "tool");
    const wantsTool = !!upgrade && c.inv.dm >= upgrade.tool.self;
    // The racks are open to anyone with the coin. The weapon laws say what the
    // government may hand a man out of the armoury; they have never said what he
    // may do with his own money at the village blacksmith's.
    const better = bestOnRacks(shopF, c, "weapon");
    const wantsWeapon = !!better && c.inv.dm >= better.weapon.self;
    if (wantsTool || wantsWeapon) {
      order(c, { kind: "shopBuy", target: shopF, x: shopF.x + 30, y: shopF.y + 14 });
      return;
    }
  }

  // What a creed sends a person to do, before a profession sends them anywhere.
  // Alms are given by people who own nothing but a roof, so this sits above the
  // test for one — the works of mercy are not a privilege of the housed.
  if (faithErrand(c)) return;

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
  // Five is what an ordinary man thinks is worth the walk. The generous go at
  // three and the grasping sit on twelve — which is why a colony of hoarders can
  // have full packs and an empty hall, and why you can watch which is which.
  const load = isT(c, "generous") ? 3 : isT(c, "grasping") ? 12 : 5;
  if (drop && (c.inv.logs + c.inv.seeds + c.inv.stone + c.inv.iron + c.inv.wheat) >= load) {
    if (isT(c, "generous") || isT(c, "grasping")) noteTemper(c, 1);
    order(c, { kind: "hallDeposit", target: drop, x: drop.x, y: drop.y + 16 });
    return;
  }

  // A hand put on a work goes to it and stays on it. This sits above every trade
  // errand below, so a quarryman with a quarry stops wandering the treeline
  // looking for boulders, and a blacksmith set on the furnace tends the furnace
  // instead of drifting back to the anvil. A work with nothing to feed it — a
  // sawmill in a town out of logs — lets them go and do something else.
  {
    const mine = buildings.find(b => isWork(b.type) && !b.fire && !b.site &&
                                     c.profession === INDUSTRY[b.type].prof &&
                                     (b.workers || []).includes(c) && workFed(b));
    if (mine) { order(c, { kind: "work", target: mine, x: mine.x + 24, y: mine.y + 20 }); return; }
  }

  if (c.profession === "blacksmith" && has("forging") && forgeBuilt()) {
    const shopForge = buildings.find(b => b.type === "forge" && !b.fire && !b.site);
    const stock = (shopForge && shopForge.shop) || [];
    const toolsOnSale = stock.filter(i => i.kind === "tool").length;
    const armsOnSale = stock.filter(i => i.kind === "weapon").length;
    // Bronze before anything: it is made of two things the forge cannot otherwise
    // use, and every tool and blade above fieldstone wants it. He keeps a few bars
    // by him and no more — copper spent on bronze he will not need is copper the
    // colony cannot sell.
    if (has("alloys") && res.copper >= 1 && res.tin >= 1 && res.bronze < 4) {
      res.copper--; res.tin--;
      order(c, { kind: "smith", make: "alloy", x: c.x, y: c.y });
      return;
    }
    const wantTool = toolsOnSale <= Math.min(3, res.weapons) || !canForgeWeapons();
    const tier = bestForgeable("tool");
    if (wantTool && tier && toolsOnSale < 3) {
      spendMats(tier, "tool");
      order(c, { kind: "smith", make: "tool", tier: tier.id, x: c.x, y: c.y });
      return;
    }
    // The armoury is filled first — that is the colony's own iron, and no coin
    // changes hands for it. Once it has its three, he keeps hammering and puts
    // what he makes on the racks, where anyone with the money may buy it.
    const wt = canForgeWeapons() && bestForgeable("weapon");
    if (wt && (res.weapons < 3 || armsOnSale < 3)) {
      spendMats(wt, "weapon");
      order(c, { kind: "smith", make: "weapon", tier: wt.id,
                 forRacks: res.weapons >= 3, x: c.x, y: c.y });
      return;
    }
  }

  if (res.seeds < farmSeedCost() * 2 && !["lumberjack", "quarryman", "forager", "miner"].includes(c.profession)) {
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
  // no trade of their own to answer to: what does their creed say to do?
  if (faithWork(c)) return;

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
  // An idle man finds a reason to be elsewhere; an industrious one finds the
  // work. Same errand ladder above — this is only what happens once it runs out.
  const roam = isT(c, "idle") ? 0.78 : isT(c, "industrious") ? 0.34 : 0.55;
  if (!c.post && Math.random() < roam) wander(c, c.home || c, 60, 180);
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
  const tithe = taxMoodReason(c);
  if (tithe) r.push(tithe);
  for (const fr of faithReasons(c)) r.push(fr);
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
  // A child's nature moves nothing yet — the sheet says "no telling" of them and
  // this must agree. It is also a correctness matter and not only a tidy one:
  // socialTick returns on c.child BEFORE it counts the company, so a child's
  // nearN is never set, and a gregarious one read a permanent "nobody to talk
  // to" while standing in the middle of a crowded square.
  if (!c.child) {
    // Company is worth different things to different people. The gregarious need
    // it about them; the solitary want rather less than the square provides.
    const near = c.nearN || 0;
    if (isT(c, "gregarious")) r.push(near >= 2 ? ["good company", 5] : ["nobody to talk to", -7]);
    if (isT(c, "solitary")) {
      if (near >= 4) r.push(["too many people underfoot", -6]);
      else if (near === 0) r.push(["blessed quiet", 4]);
    }
    // The timid feel a raid the stout-hearted merely answer — until they have been
    // through one, after which it is a thing that has already happened to them.
    if (isT(c, "timid") && !isM(c, "hardened") && raiders.some(x => x.hp > 0))
      r.push(["frightened of the raiders", -12]);
  }
  if (isM(c, "contented")) r.push(["long used to peace", 6]);
  if (isM(c, "bitter")) r.push(["nursing an old grudge", -5]);
  if (isM(c, "disgraced")) r.push(["shamed by the jail", -7]);
  if (isM(c, "bereaved") && !(c.grief && c.grief.t > 0)) r.push(["an old loss", -4]);
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
  // Luther told them to obey the magistrate and the Anabaptists renounced the
  // sword outright. Neither will rise, however wretched you make them — which
  // means a colony built on those two creeds is quiet, and pays for the quiet
  // in everything else those creeds refuse you.
  if (F(c).meek) return;
  const bite = REBEL_RATE * (1 + (25 - c.happiness) / 25);
  if (c.happiness < 25 && Math.random() < bite * (dt || 0)) {
    c.rebel = true;
    const lawAllows = !F(c).pacifist && (laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter"));
    if (lawAllows && forgeBuilt() && res.weapons > 0) c.armed = armouryTake() || false;
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
  setMark(c, "disgraced", "they have been held in the colony's jail.");
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
// How near a raider has to be before a civilian outside the wall gives up on
// whatever they were doing and runs for the gate. Generous: the whole point is
// to start running while there is still time to get there.
const RUN_FOR_GATE = 1100;
let gateToldT = -999;
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
  // Taken before the early return below, or a man who is genuinely alone would
  // keep whatever count he had when he last had company — and the solitary would
  // never once get the quiet they are owed.
  c.nearN = near.length;
  if (isT(c, "gregarious") || isT(c, "solitary")) noteTemper(c, 0.4);
  if (!near.length) return;
  const o = near[Math.floor(Math.random() * near.length)];

  // A falling-out between two particular people, owing nothing to how the colony
  // is run. Without this a quarrel could only ever break out somewhere already
  // collapsing into rebellion, which made the whole thing invisible in a colony
  // worth playing — people fall out over nothing in the best-run places.
  // The hot-tempered quarrel oftener as well as worse. A man who takes offence
  // easily does not merely take it harder when it comes — it comes to him more.
  const spark = 0.035 * (isT(c, "hot") ? 1.7 : isT(c, "even") ? 0.55 : 1);
  if (Math.random() < spark) {
    const over = GRIEVANCES[Math.floor(Math.random() * GRIEVANCES.length)];
    // bad blood compounds: a quarrel between two who already dislike each
    // other cuts deeper than one between friends
    const bitter = opinionOf(c, o) < -25 ? 1.5 : 1;
    // and a quarrel is only ever as bad as the two tempers standing in it
    const heat = temperTemperament(c);
    if (isT(c, "hot") || isT(c, "even")) noteTemper(c, 3);
    nudgeOpinion(c, o, -(14 + Math.random() * 12) * bitter * heat);
    nudgeOpinion(o, c, -(4 + Math.random() * 8) * bitter * temperTemperament(o));
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
  // and what he is, which in 1683 is the first thing anyone knows about him.
  // A proclaimed state creed sharpens it: the dissenter is not merely wrong now,
  // he is wrong in the face of the law.
  const hate = faithHate(c, o);
  if (hate) by -= hate * (stateFaith === faithOf(c) ? 1.5 : 1) * 0.5;
  else if (faithOf(c) === faithOf(o) && faithOf(c) !== DEFAULT_FAITH) by += 1.5;   // a rarer creed binds tighter
  if (c.sick > 0 && !o.sick) by -= 1;
  // A reputation is a thing the OTHER man has. What is being judged here is o,
  // so it is o's nature that moves the needle, not c's.
  if (isT(o, "generous")) by += 2.5;
  if (isT(o, "grasping")) by -= 2.5;
  if (isM(o, "disgraced")) by -= 1.5;
  // How far any of it moves a given person is their own business, though.
  nudgeOpinion(c, o, by * temperDrift(c));
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
        // Settled for the man who won it. The one on the ground keeps it.
        setMark(foe, "bitter", `they were beaten bloody by ${c.name} and have not forgotten it.`);
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
    c.armed = armouryTake() || false;
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
    faith: rollFaith(),
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
  // The one line whose worth depends entirely on who is standing at the slot.
  // Said to a man of your own creed it is the best card in the deck; said to a
  // dissenter with no roof of his own to pray under, it is the worst.
  { text: "\"You may keep your own faith here, and we will not ask after it.\"", d: 0,
    dyn: () => {
      const v = dlg.visitor, f = v ? (v.faith || DEFAULT_FAITH) : DEFAULT_FAITH;
      if (!stateFaith) return +10;
      if (f === stateFaith) return +16;
      return housesOfFaith(f) ? +8 : -12;
    } },
];

function openTalk(talk) {
  dlg.open = true; dlg.talk = talk; paused = true;
  talk.lines = 0;                    // how much of their patience has been spent
  $("dlgFace").src = `assets/sprites/ui/${talk.face}.png`;
  $("dlgName").textContent = talk.title;
  // ===== what creed is standing at the slot =====
  // A player who has proclaimed a faith and cleared the colony of dissenters is
  // about to be asked to undo it, and must be able to see that before agreeing
  // rather than after. So the wanderer's creed is on the card, and it says
  // plainly whether letting this one in breaks what you built.
  const df = $("dlgFaith");
  if (talk.faith && FAITHS[talk.faith]) {
    const f = FAITHS[talk.faith], mine = stateFaith === talk.faith;
    df.style.display = "flex";
    df.innerHTML = `<img src="${faithIcon(talk.faith)}" alt="" style="width:15px;height:15px;image-rendering:pixelated">` +
      `<span style="color:${mine ? "#9ecf9a" : stateFaith ? "#c98a8a" : "#9ab0a2"}">${esc(f.name)}</span>` +
      (stateFaith
        ? `<span style="color:#5a6b60">&mdash; ${mine ? "of your own creed" : oneFlock() ? "admitting them breaks the flock" : "a dissenter"}</span>`
        : "");
  } else df.style.display = "none";
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
function gateStanding(v) {
  let m = 34;
  // A man at the gate can see what is preached here and whether there is any
  // room in it for him. A colony that has proclaimed his own creed is a colony
  // he was already walking toward; one that has proclaimed against him is a
  // town he has been turned out of before.
  if (v && stateFaith) {
    const mine = (v.faith || DEFAULT_FAITH) === stateFaith;
    m += mine ? 14 : (housesOfFaith(v.faith || DEFAULT_FAITH) ? -4 : -14);
  }
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
  if (v.meter === null) v.meter = gateStanding(v) + (v.goodwill || 0);
  openTalk({
    face: v.face,
    faith: v.faith || DEFAULT_FAITH,
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
  c.faith = v.faith || DEFAULT_FAITH;
  // A Sephardi merchant walking north out of Hamburg is not carrying a hunter's
  // pocket money, and the whole point of admitting him is that he is not.
  c.inv.dm = (F(c).purse || 5) + Math.floor(Math.random() * 6);
  c.profession = "hunter";
  refreshAvatar(c);
  civs.push(c);
  expandFrontier(3);
  const housed = houseCiv(c, v.x, v.y);
  vignette("firstRecruit");
  tally.arrived++;
  // Admitting one dissenter is what breaks a pure colony, so say so plainly at
  // the moment it happens rather than leaving the player to find the mood drop.
  if (stateFaith && c.faith !== stateFaith)
    tell("law", `⚠ ${v.name} is ${FAITHS[c.faith].one}, and the colony has professed the ${FAITHS[stateFaith].name} creed. The flock is no longer of one mind.`);
  tell("life", `${v.name} signs on — a civilian certificate slides out through the slot. ` +
        (housed ? `${v.gender === "f" ? "She" : "He"} moves into a cabin and will pay taxes.` : `Build ${v.gender === "f" ? "her" : "him"} a cabin: no taxes until there is a roof.`));
  syncUI();
}
function rejectColony(v) { closeDialogue(); sendAway(v, `${v.name} shakes his head and returns to his hunting grounds.`); }

// --- tech research ---
function techAvailable(t) { return !t.done && t.req.every(r => TECH[r].done) && (!research || research.id !== t.id); }
// which menu entries hide until their technology is researched
const BUILD_GATES = { forge: "forging", townhall: "township", wall: "defending", gate: "defending", jail: "policing",
                      stonewall: "defplus", stonegate: "defplus", moat: "defplus", ditch: "defplus",
                      quarry: "masonry", sawmill: "millwork", mine: "mining", smelter: "smelting" };
const PROF_GATES = { lumberjack: "township", quarryman: "township", forager: "township", miner: "mining",
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
    // a chart bought is country you have never walked and can nonetheless see
    if (ZOOM_TIERS.some(z => z.tech === t.id)) {
      const fresh = chartAround(EMPIRE_HOME.mx, EMPIRE_HOME.my, atlasR());
      const tier = ZOOM_TIERS.find(z => z.tech === t.id);
      tell("work", `${t.name}: ${fresh} league(s) of country come onto the paper. Pull the camera back to see ${tier.what}.`);
      stratBarSync();
    }
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
  unassignWork(c);
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
    // and no rank in your army is worth a Mennonite's conscience
    if (F(selected).pacifist && ["police", "soldier", "musketeer", "cavalry"].includes(prof))
      return toast(`${selected.name} refuses the muster. ${FAITHS[faithOf(selected)].name}s will not bear arms — not for you, not for anyone.`);
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
    } else if (prof === "miner") {
      if (!has("mining")) return toast("Miners require the Mining technology.");
      selected.profession = "miner";
      toast(`${selected.name} takes a lamp and goes down. Put them on a mine and they will keep at it.`);
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
// A phone has no click and no right-click. The panel carries both wordings and
// puts on the one that fits the hands holding it — once, the first time it opens.
let helpDressed = false;
function openHelp() {
  if (IS_TOUCH && !helpDressed) {
    helpDressed = true;
    for (const el of $("helpPanel").querySelectorAll("[data-touch]")) el.textContent = el.dataset.touch;
  }
  $("helpPanel").style.display = "block";
}
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
// The colony as a file the browser cannot lose. Saved first, so what reaches
// the disk is this moment rather than the last time they thought to press save.
$("pmExport").addEventListener("click", () => {
  setPause(false);
  saveTrimmed = false;
  if (!saveGame()) return toast("⚠ The save failed, so there is nothing new to write out.");
  const name = exportSlot(saveSlot);
  toast(name ? `Written out as ${name}. Keep the file — it will open on any browser, on any machine.`
             : "⚠ Nothing could be written out.");
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
// ===== proclaiming a creed =====
// Nothing is forced on anyone by this alone: it comforts those who already hold
// it, galls those who do not, and opens the door to the edict. What the ruler
// does next is the interesting part.
fillFaithPickers();
$("stateFaithSel").addEventListener("change", e => {
  const v = e.target.value;
  stateFaith = FAITHS[v] ? v : null;
  dedicateTo = stateFaith || dedicateTo;
  if (stateFaith) {
    const mine = flockOf(stateFaith), out = civs.filter(c => faithOf(c) !== stateFaith).length;
    tell("law", `The ${FAITHS[stateFaith].name} creed is proclaimed the faith of ${settlementName}. ` +
                `${mine} ${mine === 1 ? "soul is" : "souls are"} of it; ${out} ${out === 1 ? "is" : "are"} not.`);
  } else tell("law", "The state professes no creed. Everyone may believe as they came here believing.");
  syncUI();
});
$("dedSelect").addEventListener("change", e => {
  if (FAITHS[e.target.value]) dedicateTo = e.target.value;
  const di = $("dedIcon"); if (di) di.src = faithIcon(dedicateTo);
});
// The edict, and the banishment, are the two irreversible things in this panel.
// Both ask twice, because both take people off the map for good.
$("edictExpel").addEventListener("click", () => {
  if (!stateFaith) return toast("Proclaim a state creed first — there is nothing yet to dissent from.");
  const out = civs.filter(c => faithOf(c) !== stateFaith);
  if (!out.length) return toast("There is not a dissenter left in the colony.");
  const kids = out.filter(c => c.child).length;
  if (!confirm(`Put ${out.length} ${out.length === 1 ? "soul" : "souls"}${kids ? `, ${kids} of them children,` : ""} out of ${settlementName} for refusing the ${FAITHS[stateFaith].name} creed?\n\nThey walk out of the territory with what they carry, and they do not come back.`)) return;
  proclaimExpulsion();
});
$("cpBanish").addEventListener("click", () => {
  const c = selected;
  if (!c) return;
  if (c.child) return toast("A child is not put out of the gate alone.");
  if (!confirm(`Drive ${c.name}, ${FAITHS[faithOf(c)].one}, out of ${settlementName}?\n\nThey take what they carry and whatever they knew how to do, and they do not come back.`)) return;
  banish(c);
  selected = null;
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
const TECH_TABS = { tabGrowth: "growth", tabMilitary: "military", tabIndustry: "industry", tabWorld: "world" };
for (const [id, tree] of Object.entries(TECH_TABS))
  $(id).addEventListener("click", () => {
    techTab = tree;
    for (const other of Object.keys(TECH_TABS)) $(other).classList.toggle("active", other === id);
    renderTech();
  });

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
  // Nonresistance is not a preference and it is not the player's to overrule:
  // the Anabaptists went to the water rather than pick this up. Asked before the
  // stores are counted, because the refusal does not depend on what is in them.
  if (F(c).pacifist) return toast(`${c.name} will not take it. ${FAITHS[faithOf(c)].name}s hold the sword to be outside the perfection of Christ.`);
  if (res.weapons < 1) return toast("The armoury is empty. Set a blacksmith to forging weapons.");
  const lawAllows = isForce(c) || laws.civWeapons || (laws.hunterWeapons && c.profession === "hunter");
  if (!lawAllows) return toast(`The law forbids arming ${c.name}. Change the weapon laws in the government panel.`);
  const drawn = armouryTake();
  if (!drawn) return toast("The armoury is empty. Set a blacksmith to forging weapons.");
  c.armed = drawn;
  toast(`${c.name} is handed ${withArt(`${matOf(drawn).name.toLowerCase()} weapon`)} at the forge.`);
  syncUI();
});
$("cpBuyTool").addEventListener("click", () => {
  if (!selected) return;
  const f = buildings.find(b => b.type === "forge" && !b.fire && !b.site && bestOnRacks(b, selected, "tool"));
  if (!f) {
    const held = matOf(selected.tool);
    return toast(held ? `${selected.name} already carries the best tool on the racks — ${held.name.toLowerCase()}.`
                      : "No tool on the forge racks.");
  }
  const tier = bestOnRacks(f, selected, "tool");
  if (res.dm - tier.tool.gov < treasuryFloor()) {
    const p = withArt(`${tier.name.toLowerCase()} tool`);
    return toast(`${p[0].toUpperCase()}${p.slice(1)} costs the treasury ${tier.tool.gov} DM. Treasury: ${res.dm} DM.`);
  }
  const item = f.shop.splice(f.shop.findIndex(i => i.kind === "tool" && i.tier === tier.id), 1)[0];
  res.dm -= tier.tool.gov;
  const smith = civs.find(o => o.name === item.by && o.profession === "blacksmith");
  if (smith) smith.inv.dm += tier.tool.gov;
  const had = matOf(selected.tool);
  selected.tool = tier.id;
  toast(`The government buys ${selected.name} ${withArt(`${tier.name.toLowerCase()} tool`)} from ${item.by}'s racks` +
        (had ? `, and the old ${had.name.toLowerCase()} one is set aside.` : "."));
  syncUI();
});
$("bpSmelt").addEventListener("click", () => {
  const b = selectedBldg;
  if (!b || b.type !== "smelter") return;
  b.smelt = b.smelt === "copper" ? "iron" : "copper";
  // whoever is at it drops the half-cooked charge and starts the new one
  for (const c of civs) if (c.task && c.task.kind === "work" && c.task.target === b) { c.task = null; c.state = "idle"; }
  b.progress = -1;
  toast(`The furnace is banked and reset for ${b.smelt === "copper" ? "copper" : "iron"} ore.`);
  syncUI();
});
$("bpBuyWeapon").addEventListener("click", () => {
  const b = selectedBldg;
  if (!b || b.type !== "forge") return;
  // the best blade on the racks, since the armoury is what the forces draw from
  let idx = -1, best = -1;
  (b.shop || []).forEach((i, k) => { if (i.kind === "weapon" && matRank(i.tier) > best) { best = matRank(i.tier); idx = k; } });
  if (idx < 0) return toast("No weapon on the racks. The blacksmith is still at work.");
  const mat = MATERIALS[best];
  if (res.dm - mat.weapon.gov < treasuryFloor())
    return toast(`A ${mat.name.toLowerCase()} weapon costs the armoury ${mat.weapon.gov} DM. Treasury: ${res.dm} DM.`);
  const item = b.shop.splice(idx, 1)[0];
  res.dm -= mat.weapon.gov;
  const smith = civs.find(o => o.name === item.by && o.profession === "blacksmith");
  if (smith) { smith.inv.dm += mat.weapon.gov; float(smith.x, smith.y - 70, "+" + mat.weapon.gov + " DM", "#c9a86a"); }
  armouryAdd(mat.id);
  SFX.coin();
  toast(`${withArt(`${mat.name.toLowerCase()} weapon`)} is bought off ${item.by}'s racks for the armoury. Police and soldiers may now equip it.`.replace(/^./, ch => ch.toUpperCase()));
  syncUI();
});
// ===== what a civilian carries =====
// The pack is built once and only ever updated after. syncUI runs four times a
// second, and tearing the grid down that often would pull the slot out from
// under the pointer and wipe the description mid-sentence.
const PACK_GOODS = [
  { id: "logs",  name: "Logs",
    desc: "Pine felled in the woods and dragged back whole. Roofs, walls, doors, and the fire that gets a family through a winter night." },
  { id: "seeds", name: "Seed",
    desc: "Wild grain gathered a handful at a time off the grass patches. Nothing is sown without it, and nothing is reaped after." },
  { id: "stone", name: "Stone",
    desc: "Fieldstone broken out of the outcrops, or cut clean off a quarry face. It raises walls that fire cannot take, and it is the one thing this country never runs short of. There is no metal in it, whatever the old hands tell you." },
  { id: "iron",  name: "Iron",
    desc: "Cooked out of iron ore in a smelter, three of ore to the bar — and the ore comes out of a mine and out of nowhere else. Everything the forge makes worth having starts here. Until the colony sinks a shaft, the only iron it will ever see is what a traveller sells it." },
  { id: "wheat", name: "Wheat",
    desc: "Reaped from the farms and carried in. It feeds a man badly on its own — the bakery is what turns it into a meal." },
  { id: "bread", name: "Bread",
    desc: "Baked from the colony's own wheat. The best thing a hungry man can be handed, and the first thing a raid takes." },
  { id: "meat",  name: "Meat",
    desc: "Game taken in the woods by the hunters. It fills a stomach further than bread, and it does not keep." },
  { id: "dm",    name: "Purse",
    desc: "A drawstring sack of marks, and coin of their own — not the treasury's. It is what goes to the blacksmith's racks for a tool or a blade: the government cannot spend it, and cannot stop them spending it." },
];
const PACK_SLOTS = ["tool", "weapon", ...PACK_GOODS.map(g => g.id)];
let packHover = null, packHeld = null, packWho = null, packPtr = { x: 0, y: 0 };

function packSlot(c, id) {
  if (id === "tool" || id === "weapon") {
    const m = matOf(heldId(c, id));
    return { gear: true, have: !!m,
             count: !m ? "" : id === "tool" ? `+${Math.round(m.tool.bonus * 100)}%`
                                            : `${Math.round(weaponForm() * m.weapon.mult)}`,
             img: `assets/sprites/items/${id}_${(m || MATERIALS[0]).id}.png`,
             name: m ? `${m.name} ${id}` : (id === "tool" ? "No tool" : "Unarmed"),
             short: m ? m.name : (id === "tool" ? "Tool" : "Weapon"),
             desc: m ? m[id].desc : (id === "tool"
               ? "Bare hands. Every kind of work takes exactly as long as it takes, and it will go on doing so until there is coin enough for something off the blacksmith's racks."
               : "Nothing to fight with but bare hands. A few marks at the blacksmith's would change that: the weapon laws govern what the armoury hands out, not what a civilian buys.") };
  }
  const g = PACK_GOODS.find(x => x.id === id);
  const q = (c.inv && c.inv[id]) || 0;
  return { have: q > 0, count: q ? String(q) : "", img: `assets/sprites/items/${id}.png`, name: g.name, desc: g.desc };
}

function packTipEl() {
  let el = $("invTip");
  if (!el) { el = document.createElement("div"); el.id = "invTip"; document.body.appendChild(el); }
  return el;
}
function hidePackTip() { const el = $("invTip"); if (el) el.style.display = "none"; }

// Shown beside the pointer, or under the slot when a finger pinned it. It flips
// rather than runs off: a description clipped by the window edge is no use.
function drawPackTip() {
  const c = selected, id = packHeld || packHover;
  if (!c || !id) return hidePackTip();
  const s = packSlot(c, id);
  const el = packTipEl();
  // syncUI comes round four times a second. Only touch the DOM when the words
  // actually change, or the tip is torn down and re-laid-out under the pointer.
  const html = `<b>${s.name}</b> — ${s.desc}`;
  if (el._k !== html) { el.innerHTML = html; el._k = html; }
  el.style.display = "block";

  let x = packPtr.x, y = packPtr.y;
  if (packHeld && packHeld !== packHover) {          // pinned by a tap, no pointer on it
    const grid = $("cpInv");
    const cell = grid && [...grid.children].find(o => o.dataset.id === packHeld);
    if (cell) { const r = cell.getBoundingClientRect(); x = r.left + r.width / 2; y = r.bottom - 14; }
  }
  // offsetWidth forces the layout that a rect read alone may not have had yet on
  // the very first show — measuring zero there threw the tip into the wrong
  // corner for a frame before the next repaint quietly corrected it.
  const w = el.offsetWidth, h = el.offsetHeight, pad = 8, off = 14;
  let left = x + off, top = y + off;
  if (left + w > innerWidth  - pad) left = x - off - w;   // try the other side
  if (top  + h > innerHeight - pad) top  = y - off - h;
  // Flipping is not always enough — a slot at the lip of a phone sheet leaves no
  // room either way. Pin it inside the window rather than let it hang off.
  const fit = (v, size, limit) => Math.max(pad, Math.min(v, limit - size - pad));
  el.style.left = Math.round(fit(left, w, innerWidth)) + "px";
  el.style.top  = Math.round(fit(top, h, innerHeight)) + "px";
}

function buildPack() {
  const grid = $("cpInv");
  if (!grid || grid.childElementCount) return;
  for (const id of PACK_SLOTS) {
    const cell = document.createElement("div");
    cell.className = "invSlot"; cell.dataset.id = id;
    const pic = document.createElement("div"); pic.className = "pic";
    cell._img = pic.appendChild(document.createElement("img"));
    cell._n = document.createElement("span"); cell._n.className = "n";
    pic.appendChild(cell._n); cell.appendChild(pic);
    cell._nm = document.createElement("span"); cell._nm.className = "nm";
    cell.appendChild(cell._nm);
    cell.addEventListener("mouseenter", e => {
      packHover = id; packPtr = { x: e.clientX, y: e.clientY }; drawPackTip();
    });
    cell.addEventListener("mousemove", e => {
      if (packHover !== id) return;
      packPtr = { x: e.clientX, y: e.clientY }; drawPackTip();
    });
    cell.addEventListener("mouseleave", () => { if (packHover === id) packHover = null; drawPackTip(); });
    // A finger has no hover. Tapping pins the description; tapping again lets it go.
    // The highlight is set here rather than left to the next repaint — a quarter
    // second of nothing happening reads as a slot that did not take the tap.
    cell.addEventListener("click", e => {
      e.stopPropagation();
      packHeld = packHeld === id ? null : id;
      for (const o of grid.children) o.classList.toggle("on", packHeld === o.dataset.id);
      drawPackTip();
    });
    grid.appendChild(cell);
  }
}

function paintPackNote() {
  const el = $("cpInvNote"); if (!el) return;
  const c = selected;
  if (!c) return void (el.textContent = "");
  const carried = PACK_GOODS.reduce((t, g) => g.id === "dm" ? t : t + ((c.inv && c.inv[g.id]) || 0), 0);
  el.textContent = (carried ? `Carrying ${carried} thing${carried === 1 ? "" : "s"}. ` : "Carrying nothing. ") +
                   (IS_TOUCH ? "Tap a slot to read what it is." : "Hover a slot to read what it is.");
}

function syncPack(c) {
  buildPack();
  const grid = $("cpInv"); if (!grid) return;
  if (packWho !== c) { packWho = c; packHeld = null; packHover = null; }
  for (const cell of grid.children) {
    const id = cell.dataset.id;
    const s = packSlot(c, id);
    if (cell._img.getAttribute("src") !== s.img) cell._img.setAttribute("src", s.img);
    cell._n.textContent = s.count;
    cell._nm.textContent = s.short || s.name;
    // A hidden slot fires no mouseleave, so a purse spent while it was being
    // read would leave its description stranded in the strip below.
    if (!s.have) {
      if (packHeld === id) packHeld = null;
      if (packHover === id) packHover = null;
    }
    cell.classList.toggle("empty", !s.have);
    cell.classList.toggle("gear", !!s.gear);
    cell.classList.toggle("on", packHeld === id);
  }
  paintPackNote();
  drawPackTip();
}

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
$("bpMove").addEventListener("click", () => { if (selectedBldg) beginMove(selectedBldg); });
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
    b.workers = undefined;
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

// The coarse grid is the political map — one cell to a stretch of country. The
// fine grid is twice that in each direction, and is what the coastlines are
// drawn on: sampling the coarse map through a noise warp turns square borders
// into something a cartographer might have inked.
const MG_W = 100, MG_H = 56, SCALE = 2, FW = MG_W * SCALE, FH = MG_H * SCALE;
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

let mapGrid = null, baseGrid = null;
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
  // The map as it stood in 1683, before any war moved a border. The blobs
  // overlap each other and the seas cut holes in them, so "which cells does
  // Austria actually hold" is a question only the finished grid can answer —
  // and the cities have to be laid down on THAT, or Vienna ends up in Poland or
  // in the Baltic.
  baseGrid = mapGrid.map(row => row.slice());
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
  if (n.pact) o.pact = n.pact;              // the terms are the route; without them it is void
  return Object.keys(o).length ? o : null;
}
// A crown left at war in memory must not stay at war through a load that never
// mentions it — silence in the save means peace, not "leave it as you found it".
function warsReset() {
  for (const n of Object.values(NATIONS)) {
    Object.assign(n, WAR_DEFAULTS);
    n.captured = []; n.calName = undefined; n.pact = undefined;
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
  // Who it takes is still mostly chance — but a constitution counts for
  // something. Each soul draws a random ticket and the sickly draw a better one;
  // sorting on that keeps the outbreak's SIZE exactly as it was and changes only
  // which beds fill first.
  const pool = well.slice()
    .map(c => [c, Math.random() * (isT(c, "sickly") ? 0.55 : isT(c, "hardy") ? 1.7 : 1)])
    .sort((a, b) => a[1] - b[1]).map(([c]) => c);
  let struck = 0;
  for (const c of pool.slice(0, n)) { c.sick = PLAGUE_LEN * (0.7 + Math.random() * 0.6); struck++; }
  // Who took it and who walked through it are both evidence of a constitution.
  for (const c of well) if (isT(c, "hardy") || isT(c, "sickly")) noteTemper(c, 3);
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
  buildCities();                       // the towns follow their borders
  stratDirty = true;
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
      // A crown that cannot break your walls can still close the water. The
      // caravan is not late — it is not coming, and it will not come from
      // anyone else either while the blockade holds.
      if (blockade) {
        if (Math.random() < 0.4)
          toast(`The caravan from ${n.name} turns back — ${NATIONS[blockade.nation].name} holds the routes.`);
        continue;
      }
      // A caravan is a bargain being kept, in both directions. Yours goes out of
      // the capital's stores whether it is convenient or not; theirs comes back
      // only while you are keeping your half.
      // A colony saved before there were terms has routes but no bargain behind
      // them. Rather than voiding them silently, the court is given the deal it
      // would have opened with — and the player is told to go and look at it.
      let p = n.pact;
      if (!p) {
        p = n.pact = pactOpening(id);
        notify({ icon: "⚑", cls: "you", text: `${n.name} sets terms at last.`,
                 sub: `${pactLine(p)} — re-open them if they do not suit`,
                 x: CAPITAL_X, y: CAPITAL_Y, z: 0.5 });
      }
      const have = Math.floor(res[p.give.good] || 0);
      if (have < p.give.amt) {
        n.dues = (n.dues || 0) + 1;
        if (n.dues >= 3) {
          n.trade = false; n.dues = 0; n.tradeCool = 150;
          eventCard(`${n.name} tears up the agreement.`, "event_caravan",
                    `Three caravans went home empty — they will not send a fourth`);
        } else {
          notify({ icon: "!", cls: "bad", text: `The caravan to ${n.name} goes home empty.`,
                   sub: `${p.give.amt} ${p.give.good} was owed and the capital had ${have} — ` +
                        `${3 - n.dues} more and the agreement is void`,
                   x: CAPITAL_X, y: CAPITAL_Y, z: 0.5 });
        }
        continue;
      }
      res[p.give.good] -= p.give.amt;
      res[p.get.good] = (res[p.get.good] || 0) + p.get.amt;
      n.dues = 0;
      // No coin on top. The goods ARE the trade — paying a bonus for a bargain
      // that already favours you is the free pension this was built to remove.
      // What you profit by is selling a crown the one thing its lands cannot
      // grow and taking payment in the thing they are sick of the sight of.
      toast(`A caravan from ${n.name}: ${p.give.amt} ${p.give.good} out, ` +
            `${p.get.amt} ${p.get.good} back.`);
      SFX.coin();
    }
  }
}
// ===== the blockade =====
// The cheapest thing a crown can do to you and among the worst. It costs them
// nothing they can lose on your ground — there is no column to cut down, no
// camp to burn — and it takes away the one part of the colony you cannot
// replace by working harder. The answer is diplomacy or a dead enemy, which is
// the point: not every threat should have a military answer.
const BLOCKADE_MIN = 260, BLOCKADE_MAX = 420;
let blockadeT = 240;
function updateBlockade(dt) {
  if (blockade) {
    const n = NATIONS[blockade.nation];
    blockade.t -= dt;
    // peace, or their defeat, lifts it early — that is the lever the player has
    if (!n || n.defeated || !n.atWar) {
      toast(`The routes are open again — ${n ? n.name : "the enemy"} no longer holds them.`);
      blockade = null;
    } else if (blockade.t <= 0) {
      eventCard(`${n.name} lifts the blockade.`, "event_peace", "The caravans will come again");
      blockade = null;
    }
    return;
  }
  if (!reckoningOpen() || pastTheCap() < 1) return;
  blockadeT -= dt;
  if (blockadeT > 0) return;
  blockadeT = 200 + Math.random() * 160;
  // only a crown with a coast worth blockading, and only while the war is on
  const foes = Object.entries(NATIONS).filter(([, n]) => n.atWar && !n.defeated);
  if (!foes.length) return;
  // and only if there is trade to be worth cutting
  if (!Object.values(NATIONS).some(n => n.trade)) return;
  if (Math.random() > 0.5) return;
  const [id, n] = foes[Math.floor(Math.random() * foes.length)];
  blockade = { nation: id, t: BLOCKADE_MIN + Math.random() * (BLOCKADE_MAX - BLOCKADE_MIN) };
  eventCard(`${n.name} closes the routes.`, "event_warparty",
            "No caravan will reach you, and no shipment you ask for will be sent");
  SFX.warHorn();
}

function updateNationWars(dt) {
  natWarSpawnT -= dt;
  if (natWarSpawnT <= 0) {
    natWarSpawnT = 100 + Math.random() * 80;
    if (natWars.length < 2) startNatWar();
  }
  for (const w of [...natWars]) {
    w.t -= dt;
    // The wars of Europe used to be a dice roll every forty seconds, settled
    // out of sight. The dice are still there, but somebody has to walk to the
    // walls first — and you can watch him do it.
    if (w.t <= 0) { w.t = 60 + Math.random() * 50; dispatchNatColumn(w); }
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
// The old MAP button opened a fullscreen picture of Europe with the game paused
// behind it. There is nothing left to open: the map IS the world, and the button
// simply takes the camera up to the height where you can see it. Everything that
// used to call renderMap() now only needs to say that the country has changed.
function renderMap() { stratDirty = true; }

document.getElementById("mapToggle").addEventListener("click", () => {
  if (!mapGrid) buildMapGrid();
  if (!CITIES.length) buildCities();
  stratDirty = true;
  tutSeen.map = true;
  lesson("trade");                      // they are looking at the neighbours now
  const floor = zoomFloor();
  if (onMap() && zoom <= floor * 1.4) {
    // already up there: come back down to the town you came from
    flyTo(CAPITAL_X, CAPITAL_Y, 0.85, 1.0);
    worldPanelOpen(false);
    toast("Back among the roofs.");
  } else {
    const mid = cam.x + canvas.width / 2 / zoom, midY = cam.y + canvas.height / 2 / zoom;
    flyTo(mid, midY, floor, 1.15);
    const next = nextZoomTier();
    toast(next ? `The country, as far as your charts go. ${TECH[next.tech].name} would open ${next.what}.`
               : "The whole of Europe. Click a city to look at it, or a column to follow it.");
  }
});

function mapInfoSync() {
  const w = document.getElementById("miWar"), pc = document.getElementById("miPeace"), as = document.getElementById("miAssault");
  const note = document.getElementById("miNote");
  if (note) { note.textContent = ""; note.style.display = "none"; }   // a fresh nation, a fresh slate
  citySync();                                                        // the town half of the panel
  if (!mapSelNation) {
    document.getElementById("miName").textContent = "—";
    document.getElementById("miDetail").textContent = "Click a country or a city out on the map.";
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
  if (n.trade) document.getElementById("miDetail").textContent +=
    ` A trade route is open on these terms: ${pactLine(n.pact)}, every caravan.` +
    (n.dues ? ` ${n.dues} caravan(s) have gone home empty.` : "");
  const rt = $("miTerms");
  if (rt) {
    rt.style.display = n.trade ? "block" : "none";
    rt.textContent = `Re-open the terms with ${n.name}`;
  }
  // What a spy is actually for: the two numbers you would otherwise be guessing at
  if (knowsArmies(mapSelNation)) {
    const cs = nationCities(mapSelNation);
    const men = cs.reduce((t, c) => t + c.garrison, 0);
    document.getElementById("miDetail").textContent +=
      ` Your agent reports ${men} men under arms across ${cs.length} city/cities` +
      (knowsArts(mapSelNation) ? `, and these arts: ${nationArts(mapSelNation).join(", ")}.` : ".");
  }
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
  worldPanelOpen(false);
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
// ===== the terms of a trade route =====
// A trade route used to be a switch with a gift in front of it: win the audience,
// hand over a load of wheat once, and from then on a caravan turned up every
// minute with free silver and free goods forever. Nothing left your stores again.
// That is not trade, it is a pension.
//
// A route is a standing bargain now. You send them something every caravan and
// they send something back, and BOTH halves are yours to argue over before you
// sign. What a good is worth depends on who is holding it: a crown whose lands
// are thick with timber will not pay much for timber, and will pay handsomely
// for the one thing it cannot grow.
const GOOD_WORTH = { logs: 1, stone: 1.2, wheat: 1.4, bread: 2.2, meat: 2.4, iron: 3.4 };
const worthHere = good => GOOD_WORTH[good] || 1.5;
function worthTo(id, good) {
  const base = worthHere(good);
  if (goodsOf(id).includes(good)) return base * 0.55;      // their own lands are full of it
  if (wantsOf(id) === good) return base * 1.9;             // the one thing they are short of
  return base;
}
// How hard this particular court bargains. A great power drives a harder deal
// than a duchy; a country with plague or famine in it will take what it can get.
function pactAsk(id) {
  const n = NATIONS[id] || {};
  let ask = 1.12 + natStrength(n) * 0.045;
  if (n.calT) ask -= 0.28;                                  // stricken, and knows it
  if (n.hungry) ask -= 0.20;
  if (n.trade) ask -= 0.10;                                 // already dealing with you
  return Math.max(0.85, ask);
}
// Their side of the sum: what they gain against what it costs them to send.
function pactBalance(id, give, get) {
  const gain = give.amt * worthTo(id, give.good);
  const cost = Math.max(0.01, get.amt * worthTo(id, get.good));
  return gain / cost;
}
const PACT_WORDS = [
  { at: 1.30, ok: true,  word: "They would take that gladly — you are giving away more than you need to." },
  { at: 1.05, ok: true,  word: "The court finds it fair, and would sign." },
  { at: 0.92, ok: true,  word: "Grudging, but they would sign it." },
  { at: 0.78, ok: false, word: "They hesitate. A little more your side, and it would carry." },
  { at: 0.55, ok: false, word: "The envoy is told plainly that it is not enough." },
  { at: -99,  ok: false, word: "An insult. They will not hear it." },
];
function pactVerdict(id, give, get) {
  if (!give.amt || !get.amt) return { ok: false, word: "Both sides of a bargain have to have something in them." };
  const r = pactBalance(id, give, get) / pactAsk(id);
  return PACT_WORDS.find(w => r >= w.at);
}
// What a court would propose if left to itself — the opening position you argue
// against, rather than a blank table you have to guess at.
function pactOpening(id) {
  const want = wantsOf(id), rich = goodsOf(id);
  const give = { good: want, amt: 6 };
  // they offer whichever of their own plentiful goods you hold least of
  const good = rich.slice().sort((a, b) => (res[a] || 0) - (res[b] || 0))[0] || rich[0];
  const fair = give.amt * worthTo(id, want) / Math.max(0.01, worthTo(id, good) * pactAsk(id));
  return { give, get: { good, amt: Math.max(1, Math.round(fair)) } };
}
const pactLine = p => p ? `${p.give.amt} ${p.give.good} out, ${p.get.amt} ${p.get.good} back` : "no terms";

// --- arguing over them ---
let pactNation = null;
function openPactModal(id) {
  pactNation = id;
  const n = NATIONS[id];
  const start = n.pact ? { give: { ...n.pact.give }, get: { ...n.pact.get } } : pactOpening(id);
  $("pactTitle").textContent = "TERMS WITH " + n.name.toUpperCase();
  $("pactRead").textContent =
    `Their lands are rich in ${goodsOf(id).join(" and ")}, and short of ${wantsOf(id)}. ` +
    (n.calT ? `${n.calName} has them at a disadvantage, and they know it. `
            : `Strength ${natStrength(n)}/10 — they bargain accordingly. `) +
    `A caravan runs every minute, and takes your side of it out of the capital's stores.`;
  for (const side of ["Give", "Get"]) {
    const sel = $("pact" + side + "Good"), amt = $("pact" + side + "Amt");
    sel.innerHTML = TRADE_GOODS.map(g => `<option value="${g}">${g}</option>`).join("");
    sel.value = side === "Give" ? start.give.good : start.get.good;
    amt.value = side === "Give" ? start.give.amt : start.get.amt;
  }
  pactSync();
  $("pactModal").style.display = "block";
  paused = true;
}
function pactTerms() {
  return { give: { good: $("pactGiveGood").value, amt: Math.max(0, Math.min(60, Math.floor(+$("pactGiveAmt").value || 0))) },
           get:  { good: $("pactGetGood").value,  amt: Math.max(0, Math.min(60, Math.floor(+$("pactGetAmt").value  || 0))) } };
}
function pactSync() {
  const id = pactNation; if (!id) return;
  const t = pactTerms(), v = pactVerdict(id, t.give, t.get);
  $("pactVerdict").textContent = v.word;
  $("pactVerdict").className = v.ok ? "pactYes" : "pactNo";
  const hold = Math.floor(res[t.give.good] || 0);
  $("pactStock").textContent =
    `The capital holds ${hold} ${t.give.good}. At ${t.give.amt} a caravan that is ` +
    (t.give.amt > 0 ? `${Math.floor(hold / t.give.amt)} caravan(s)` : "no caravans") +
    ` before the store runs dry — a route you cannot pay is a route they tear up.`;
  $("pactPropose").disabled = !v.ok;
  $("pactPropose").textContent = v.ok ? "Sign it" : "They will not sign that";
}
function closePactModal() { $("pactModal").style.display = "none"; pactNation = null; setPause(pauseOpen); }

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
  // no cooldown is spent on a request that cannot leave harbour
  if (blockade)
    return toast(`${NATIONS[blockade.nation].name} holds the routes — nothing can be shipped to you until the blockade is lifted.`);
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
      n.tradeMeter = undefined; n.tradeUsed = new Set();
      // Winning the audience buys you the table, not the deal. What each side
      // sends the other is argued over now, and until it is agreed there is no
      // route — the envoy has been received, and that is all.
      toast(`${n.name} will hear terms. ${giftN} ${gift} given in tribute.`);
      SFX.coin();
      openPactModal(mapSelNation);
      syncUI();
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
    worldPanelOpen(false);
    flyTo(standing.x, standing.y, 0.55, 1.0);
    toast(`${standing.name} stands before you. Select your soldiers and click its walls, its buildings and its keep.`);
    return;
  }
  const party = civs.filter(c => ["soldier", "musketeer", "cavalry"].includes(c.profession));
  if (party.length < 4) return toast("An assault needs at least 4 fighting men — soldiers, line infantry or cavalry.");
  const town = landForeignTown(id);
  worldPanelOpen(false);
  flyTo(town.x, town.y, 0.55, 1.2);
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
// `where` lets the caller say exactly which town this is and where it stands —
// used when your own column arrives at a named city of Europe, so that the place
// you besiege is the place you marched to rather than a fresh outpost invented
// somewhere behind you.
function landForeignTown(id, where) {
  const n = NATIONS[id];
  const city = where && where.cityRef;
  // A named city of Europe builds itself out of its OWN books — how many souls
  // it holds, what its walls are made of, how many men are under arms in it,
  // what is in its treasury. A border outpost, which has no books, falls back on
  // the strength of the crown that planted it.
  const tier = city ? Math.max(1, Math.min(10, 1 + city.walls * 2 + Math.floor(city.pop / 14)))
                    : Math.max(1, natStrength(n));
  // set it down a real march away, clear of your ground, the camps and other towns
  let site = where && where.x !== undefined ? { x: Math.round(where.x), y: Math.round(where.y) } : null;
  for (let tries = 0; tries < 40 && !site; tries++) {
    const a = Math.random() * Math.PI * 2, d = 2600 + Math.random() * 700;
    const x = Math.round(Math.cos(a) * d), y = Math.round(Math.sin(a) * d);
    if (camps.every(cp => Math.hypot(cp.x - x, cp.y - y) > 900) &&
        settlements.every(s => s.x === undefined || Math.hypot(s.x - x, s.y - y) > 1500) &&
        foreignTowns.every(t => Math.hypot(t.x - x, t.y - y) > 1800) &&
        !inTerritory(x, y)) site = { x, y };
  }
  if (!site) { const a = Math.random() * Math.PI * 2; site = { x: Math.round(Math.cos(a) * 3000), y: Math.round(Math.sin(a) * 3000) }; }
  const town = { nation: id, name: (where && where.name) || foreignName(id, n), x: site.x, y: site.y, fallen: false,
                 city: where && where.city,
                 dm: city ? Math.round(city.wealth) : 150 + tier * 40,
                 weapons: city ? 2 + Math.floor(city.garrison / 3) : 2 + Math.floor(tier / 2) };
  foreignTowns.push(town);
  const put = (type, dx, dy, hp) => {
    const b = { type, x: site.x + dx, y: site.y + dy, hp, maxHp: hp, town, foreign: true,
                progress: -1, occupants: [], fire: 0, torchP: -1, placed: true, bakeT: 0 };
    foreign.push(b);
    for (const t of nearThings("trees", b.x, b.y, 90)) { t.alive = false; markChunkDirty(t.x, t.y); }
    for (const s of nearThings("stones", b.x, b.y, 80)) { s.alive = false; markChunkDirty(s.x, s.y); }
    return b;
  };
  // the keep at the heart, the town about it, a ring of wall with one gate.
  // A real city is as big as its population: Paris does not get four cabins
  // because a border outpost gets four cabins.
  town.keep = put("townhall", 0, 0, 260 + tier * 30);
  town.keep.keep = true;
  const houses = city ? Math.max(4, Math.min(16, Math.round(city.pop / 4))) : 4;
  town.houses = houses;                   // what it was raised with, for the reckoning after
  // the ring widens with the town, so the houses are not stacked on the keep
  const R = city ? Math.round(260 + houses * 16) : 300;
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + 0.4;
    const rr = R * (i % 2 ? 0.42 : 0.68);
    put("cabin", Math.round(Math.cos(a) * rr), Math.round(Math.sin(a) * rr * 0.8), 90);
  }
  put("market", 0, Math.round(R * 0.5), 110);
  if (tier >= 3) put("forge", -Math.round(R * 0.62), Math.round(R * 0.3), 110);
  if (tier >= 5) put("watchtower", Math.round(R * 0.62), Math.round(R * 0.3), 130);
  if (city && city.cap) put("temple", 0, -Math.round(R * 0.52), 140);
  // and its wall is whatever the books say it is: an open town has none at all
  const wallTier = city ? city.walls : (tier >= 4 ? 3 : 2);
  if (wallTier > 0) {
    const wallHp = 90 + tier * 14 + wallTier * 30, RING = Math.max(26, Math.round(R / 11.5));
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      const wx = Math.round(Math.cos(a) * R), wy = Math.round(Math.sin(a) * R * 0.82);
      const upright = Math.abs(Math.cos(a)) > 0.6 ? 1 : 0;
      // one gate on the near side, and a second on the far side of a great city
      if (i === 6 || (RING > 34 && i === 6 + (RING >> 1))) {
        const g = put(wallTier >= 3 ? "stonegate" : "gate", wx, wy, wallHp);
        g.rot = upright; continue;
      }
      const w = put(wallTier >= 3 ? "stonewall" : "wall", wx, wy, wallHp);
      w.rot = upright;
    }
  }
  // the townsfolk: no soldiers, only people, who scatter when your line comes on
  const FOLK_M = ["Anders", "Bertil", "Ewald", "Hark", "Joris", "Klaus", "Mikkel", "Peder", "Rutger", "Sten"];
  const FOLK_F = ["Birgit", "Dorothea", "Elke", "Gisela", "Karin", "Maren", "Sofie", "Trine"];
  const TRADES = ["farmer", "forager", "lumberjack", "quarryman", "blacksmith", null];
  const folkN = city ? Math.max(4, Math.min(18, Math.round(city.pop / 3)))
                     : 4 + Math.floor(tier / 2) + Math.floor(Math.random() * 3);
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
  // the garrison: they hold the town and do not march on your colony. For a real
  // city this is the number a spy would have reported to you — so what the panel
  // said before you marched is what you meet at the gate.
  const garrison = city ? Math.max(2, Math.min(20, Math.round(city.garrison)))
                        : 4 + Math.floor(tier / 2);
  town.garrisonRaised = garrison;         // how many actually stood, for the reckoning after
  for (let i = 0; i < garrison; i++) {
    const a = (i / garrison) * Math.PI * 2, rr = R * 0.38 + Math.random() * 90;
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

// ===== investment: the siege that never assaults =====
// Standing far enough out that the town's own walls are no use, and near enough
// that nothing gets past. Deliberately outside updateOccupation's 420 — a ring
// at this distance is not standing IN your town and will never capture it. The
// two are different threats and must not be mistaken for one another.
const INVEST_RADIUS = 560;
const INVEST_MIN = 2;                  // fewer than this is a patrol, not a siege
let investToldT = -999;
function besiegersOf(t) {
  const c = townCentre(t);
  return raiders.filter(r => r.state === "invest" && r.investTown === (t || null) &&
                             Math.hypot(r.x - c.x, r.y - c.y) < INVEST_RADIUS * 1.6);
}
function updateInvestment(dt) {
  const towns = [null, ...settlements.filter(s => s.x !== undefined)];
  for (const t of towns) {
    const key = t || null;
    const held = besiegersOf(t).length >= INVEST_MIN;
    if (held && !invested.has(key)) {
      invested.add(key);
      const name = t ? t.name : (settlementName || "the capital");
      toast(`⚠ ${name} is invested — nothing goes in or out, and the fields cannot be worked.`);
      SFX.warHorn();
    } else if (!held && invested.has(key)) {
      invested.delete(key);
      const name = t ? t.name : (settlementName || "the capital");
      toast(`The siege of ${name} is broken.`);
      SFX.coin();
    }
  }
  // a standing reminder, because a siege is quiet and quiet is easy to miss
  if (invested.size && playT - investToldT > 75) {
    investToldT = playT;
    const names = [...invested].map(t => t ? t.name : (settlementName || "the capital"));
    toast(`⚠ Still under siege: ${names.join(", ")}. Drive them off or the stores will run out.`);
  }
}
// a farm inside a ring is a field nobody dares walk into
const townInvested = t => invested.has(t || null);
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
  // and this does not wear off at all: he believes what the country he was
  // taken from believed, and now he lives under your steeple.
  c.faith = faithOfNation(f.town && f.town.nation);
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
  // Its flag goes exactly where the town stands. The two scales are one map now;
  // a town whose dot on the continent was in a different place from the town
  // itself would make every march to it a lie.
  settlements.push({ name: town.name, pop: 0, x: town.x, y: town.y,
                     res: { logs: 0, seeds: 0, stone: 0, iron: 0, wheat: 0, bread: 0, meat: 0, dm: 0, doors: 0, weapons: 0 },
                     ...worldCell(town.x, town.y) });
  // and if it was one of the named cities of Europe, that city has fallen
  if (town.city) { const cc = cityById(town.city); if (cc) { cc.fallen = true; cc.siege = 0; cc.town = null; } }
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
  mapGrid = null; buildMapGrid(); buildCities(); renderMap(); syncUI();
}
// How many of a crown's men may stand on your ground at once, all wars counted
// together. Four crowns at war used to mean four separate streams, each keeping
// its own time and none of them aware of the others — which is how a colony ends
// up facing hundreds. They share one field now.

// ===== the party arrives =====
// This is what used to happen the instant a crown's clock ran out. It happens at
// the end of a march now instead, so the men who appear at your treeline are the
// same men you may have watched crossing Brandenburg for the last two minutes.
function landWarParty(id, town, invest) {
  const n = NATIONS[id];
  if (!n || n.defeated || !n.atWar) return 0;
  const targets = raidTargetsIn(town);
  if (!targets.length || attackersAfield() >= attackerCap()) return 0;
  const cx = town ? town.x : 0, cy = town ? town.y : 0;
  const a = Math.random() * Math.PI * 2;
  const st = natStrength(n);
  const partySize = 3 + (st >= 8 ? 1 : 0) + Math.floor(menace() / 6);
  const ring = { x: cx, y: cy };
  let sent = 0;
  for (let i = 0; i < partySize; i++) {
    // the cap is a wall, not a suggestion: test it for every man sent
    if (attackersAfield() >= attackerCap()) break;
    const t = targets[Math.floor(Math.random() * targets.length)];
    const tier = reckoning();
    const kit = Math.min(KIT_MAX, kitFor(tier) + (st >= 8 ? 1 : 0));   // a strong crown outfits its men
    const whp = 90 + Math.min(tier, 12) * 6 + st * 3;
    const ra = (i / partySize) * Math.PI * 2;
    raiders.push({ x: cx + Math.cos(a) * 1300 + i * 30, y: cy + Math.sin(a) * 1300 + i * 24, hp: whp, maxHp: whp,
                   dmg: 16 + Math.min(tier, 12) * 1.2 + Math.floor(st / 3) + KIT_BITE[kit], kit,
                   target: invest ? null : t,
                   state: invest ? "invest" : "approach", anim: 0, facing: 1, atkT: 0, foe: null,
                   // where he will stand and wait, if this is a siege
                   ringX: ring.x + Math.cos(ra) * INVEST_RADIUS,
                   ringY: ring.y + Math.sin(ra) * INVEST_RADIUS * 0.85,
                   investTown: invest ? (town || null) : undefined,
                   camp: { x: cx + Math.cos(a) * 1600, y: cy + Math.sin(a) * 1600 }, carry: 0, nation: id });
    sent++;
  }
  if (!sent) return 0;   // no horn for an army that never came
  const winter = season() === "winter";
  const where = town ? town.name : (settlementName || "the colony");
  if (invest)
    eventCard(`${n.name} lays siege to ${where}.`, "event_warparty",
              winter ? "They will not assault it. They will wait, and it is winter"
                     : "They will not assault it. They mean to sit there until it starves");
  else
    eventCard(`A war party of ${n.name} marches on ${where}!`,
              "event_warparty", winter ? "In the dead of winter — arm yourselves" : "Arm yourselves");
  notify({ icon: "\u2694", cls: "war", text: `${n.name} is at ${where}.`,
           sub: invest ? "They mean to sit outside it until it starves" : "The party is at the treeline",
           x: cx, y: cy, z: 0.55 });
  return sent;
}

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
      // Winter was a truce, and a truce is a rest. It stays one while the colony
      // is still making its name — but a crown that has taken your measure waits
      // for exactly this: the fields dead, the stores going down, half your
      // people indoors warming themselves, and your soldiers wading. They come
      // sooner in the snow now, not later.
      const winter = season() === "winter";
      if (winter && !reckoningOpen()) continue;
      if (winter) n.warT *= 0.6;
      // a war party marches on ONE town — settlements are not spared the war
      const towns = townsWithBuildings();
      if (!towns.length || attackersAfield() >= attackerCap()) continue;
      const town = towns[Math.floor(Math.random() * towns.length)];
      if (!raidTargetsIn(town).length) continue;
      // Past the old ceiling a crown stops throwing itself at the walls and
      // starts sitting outside them instead. A siege is not a bigger battle —
      // it is the absence of one, which is the part that hurts.
      const invest = reckoningOpen() && pastTheCap() > 2 && Math.random() < 0.45 && !invested.has(town || null);
      // And they no longer appear a thousand pixels from your gate. The party
      // sets out from a named city of theirs and walks — which is your warning,
      // if you have anyone out there able to see it walking.
      dispatchWarColumn(id, town, invest);
    }
  }
}

// ===== mayors =====
// A daughter town used to be a warehouse with a name on it. You founded it, the
// settlers walked out to it, and then — unless you personally stood over the
// place — nothing whatever happened there. Raiders burned the roofs and nobody
// rebuilt them; the people who survived drifted back to the capital; the town
// kept two hundred logs and a chest of silver in a clearing no one visited
// again. The map made that worse rather than better: every city you take out of
// Europe becomes another of them.
//
// A mayor is one of your own people, given the town to run. The office is not a
// switch: it is a person, and a person can be bad at it. Who you appoint is the
// whole of the decision — an industrious mayor keeps the roofs full and the
// fields worked, an idle one lets it rot exactly as it rots now, and a grasping
// one sees to it that rather less silver reaches the chest than left the field.
const MAYOR_DUTIES = [
  { id: "care",   name: "Care",   what: "roofs over heads, and something in the larder" },
  { id: "works",  name: "Works",  what: "the burned rebuilt, and idle hands put to a trade" },
  { id: "order",  name: "Order",  what: "quarrels settled, and nerve when a raid comes" },
  { id: "thrift", name: "Thrift", what: "what reaches the town chest — and what sticks to their fingers" },
];
// Everything here is read off what the person already is. Nothing is rolled for
// the office itself, so the sheet you read before appointing them is the whole
// truth about how they will govern.
//
// Each temperament touches TWO duties rather than one. With a single trait to a
// person, a one-duty table left three of the four bars identical on everybody
// and every candidate in the colony came out "adequate" — which is no decision
// at all. A trait that reads on two duties, one strongly and one lightly, makes
// four bars that actually differ between two people standing side by side.
const TEMPER_OFFICE = {
  industrious: { works:  0.28, care:   0.10 },
  idle:        { works: -0.32, care:  -0.12 },
  hot:         { order: -0.26, care:  -0.08 },
  even:        { order:  0.24, thrift: 0.06 },
  gregarious:  { care:   0.24, order:  0.08 },
  solitary:    { care:  -0.18, works:  0.08 },
  stout:       { order:  0.26, works:  0.08 },
  timid:       { order: -0.24, care:   0.06 },
  generous:    { thrift: 0.16, care:   0.16 },
  grasping:    { thrift:-0.38, works:  0.06 },
  hardy:       { works:  0.16, order:  0.10 },
  sickly:      { works: -0.18, care:   0.08 },
};
function mayorGrade(c) {
  if (!c) return null;
  const sk = id => (skillLvl(c, id) - 1) / (SKILL_MAX - 1);
  const mood = clamp01((c.happiness || 50) / 100);
  const g = {
    care:   0.45 + sk("farming") * 0.22 + sk("physicking") * 0.16,
    works:  0.45 + sk("building") * 0.30,
    order:  0.45 + sk("fighting") * 0.18,
    thrift: 0.50,
  };
  const t = TEMPER_OFFICE[c.temper];
  if (t) for (const k of Object.keys(t)) g[k] += t[k];
  // what life has done to them weighs on the whole office, not on one duty
  const lift = c.mark === "contented" ? 0.07 : c.mark === "hardened" ? 0.04 : 0;
  const drag = c.mark === "disgraced" ? 0.13 : c.mark === "bitter" ? 0.10 : c.mark === "bereaved" ? 0.06 : 0;
  for (const d of MAYOR_DUTIES) g[d.id] = clamp01(g[d.id] + lift - drag + (mood - 0.5) * 0.18);
  g.score = MAYOR_DUTIES.reduce((n, d) => n + g[d.id], 0) / MAYOR_DUTIES.length;
  return g;
}
// Calibrated to what is actually reachable: a trait lifts two duties of four, so
// nobody scores near one, and thresholds set for a 0-to-1 scale would have called
// the whole colony adequate.
const mayorRank = s => s >= 0.62 ? "excellent" : s >= 0.55 ? "capable"
                     : s >= 0.47 ? "adequate"  : s >= 0.40 ? "poor" : "hopeless";
// Anyone grown, free, at home and not already governing somewhere else.
function mayorCandidates() {
  return civs.filter(c => !c.child && !c.rebel && !c.afield && !isJailed(c) &&
                          !settlements.some(s => s.mayor === c))
             .sort((a, b) => mayorGrade(b).score - mayorGrade(a).score);
}
function appointMayor(st, c) {
  if (!st || !c) return;
  for (const s of settlements) if (s.mayor === c) s.mayor = null;
  st.mayor = c; st.mayorT = 2;
  tell("work", `${c.name} is made mayor of ${st.name} — ${mayorRank(mayorGrade(c).score)}, by the look of them.`);
  syncUI();
}
function loseMayor(st, why) {
  if (!st.mayor) return;
  const name = st.mayor.name;
  st.mayor = null;
  notify({ icon: "⚑", cls: "bad", text: `${st.name} has no mayor.`,
           sub: why || `${name} can no longer hold the office`,
           x: st.x, y: st.y, z: 0.55 });
}

// --- what the office actually does, every few seconds, out of your sight ---
const MAYOR_TICK = 9;
function townFolk(st) { return civs.filter(u => !u.afield && townAt(u.x, u.y) === st); }
function runMayor(st) {
  const c = st.mayor, g = mayorGrade(c);
  const folk = townFolk(st);
  st.res = st.res || {};
  const roll = k => Math.random() < g[k];

  // CARE — a roof for anyone standing without one
  if (roll("care")) for (const u of folk) if (!u.home) houseCiv(u, st.x, st.y);

  // CARE — and hands to put under those roofs. This is the duty that actually
  // answers the thing wrong with daughter towns: settlers walk out, the town is
  // raided or simply dull, they drift back to the capital, and the place stands
  // empty with a chest of silver in it forever. A mayor worth the office sends
  // to the capital for somebody, gives them a roof, and they walk out to it.
  // Counted by distance rather than by townAt, and counted the same way as the
  // people are: a cabin whose occupant is still two thousand pixels away walking
  // to it is NOT spare. Mixing the two tests had one mayor send seven people to
  // fill one roof, because each of the first six was still on the road when the
  // next was chosen.
  const nearTown = (x, y) => Math.hypot(x - st.x, y - st.y) < 700;
  const roofs = buildings.filter(b => b.type === "cabin" && !b.site && !b.fire && nearTown(b.x, b.y));
  const spare = roofs.filter(b => b.occupants.length === 0).length;
  if (spare > 0 && roll("care")) {
    // never strip the capital: it keeps whoever it needs to feed itself
    // and never call somebody who already lives there, however far off they are
    const pool = civs.filter(u => !u.afield && !u.rebel && !u.child && !isForce(u) &&
                                  !settlements.some(x => x.mayor === u) &&
                                  !(u.home && nearTown(u.home.x, u.home.y)));
    if (pool.length > 4) {
      const hand = pool[Math.floor(Math.random() * pool.length)];
      if (hand.home) hand.home.occupants = hand.home.occupants.filter(o => o !== hand);
      hand.home = null;
      if (houseCiv(hand, st.x, st.y)) {
        order(hand, { kind: "walk", x: hand.home.x, y: hand.home.y + 30 });
        notify({ icon: "⚑", cls: "you", text: `${c.name} sends for hands.`,
                 sub: `${hand.name} goes out to ${st.name}`, x: st.x, y: st.y, z: 0.55 });
      } else houseCiv(hand, hand.x, hand.y);      // no room after all — put them back
    }
  }

  // CARE — and something to eat. A mayor who notices the larder is empty sends
  // to the capital for bread; one who does not, does not, and the town starves
  // exactly as it would have with nobody in the office.
  const fed = (st.res.bread || 0) + (st.res.meat || 0);
  if (folk.length && fed < folk.length * 2) {
    if (roll("care")) {
      const want = Math.min(folk.length * 4, Math.floor(res.bread));
      if (want > 0) {
        res.bread -= want; st.res.bread = (st.res.bread || 0) + want;
        st.mayorSaidT = worldT;
        notify({ icon: "⚑", cls: "you", text: `${c.name} sends to the capital for bread.`,
                 sub: `${want} loaves go out to ${st.name}`, x: st.x, y: st.y, z: 0.55 });
      } else if (worldT - (st.mayorSaidT || -999) > 120) {
        st.mayorSaidT = worldT;
        notify({ icon: "!", cls: "bad", text: `${st.name} is short of bread.`,
                 sub: `${c.name} sent for it and the capital had none`, x: st.x, y: st.y, z: 0.55 });
      }
    } else if (worldT - (st.mayorSaidT || -999) > 180) {
      st.mayorSaidT = worldT;
      notify({ icon: "!", cls: "bad", text: `${st.name} is going hungry.`,
               sub: `${c.name} has not thought to send for anything`, x: st.x, y: st.y, z: 0.55 });
    }
  }

  // WORKS — put idle hands to a trade the town is short of
  if (roll("works")) {
    const has = p => folk.some(u => u.profession === p);
    const need = ["farmer", "lumberjack", "forager", "quarryman"].find(p => !has(p));
    const spare = folk.find(u => !u.profession && !u.child);
    if (need && spare) {
      spare.profession = need; refreshAvatar(spare);
      chron("work", `${c.name} sets ${spare.name} to ${profLabel(need)} at ${st.name}.`);
    }
  }
  // WORKS — and get the burned cleared away, which nobody has ever done for you
  if (roll("works")) {
    const ruin = buildings.find(b => b.type === "burned" && townAt(b.x, b.y) === st);
    const cost = 6;
    if (ruin && (st.res.logs || 0) >= cost) {
      st.res.logs -= cost;
      Object.assign(ruin, { type: "cabin", hp: 90, maxHp: 90, occupants: [], fire: 0,
                            torchP: -1, site: false, buildP: 1, progress: -1 });
      chron("work", `${c.name} has a burned house at ${st.name} raised again.`);
    }
  }

  // ORDER — a mayor with any nerve steadies the place
  if (folk.length) {
    const lift = (g.order - 0.5) * 0.9;
    for (const u of folk) u.happiness = Math.max(0, Math.min(100, u.happiness + lift));
  }

  // and the roll says who LIVES there, not who happens to be standing in it this
  // second — the second number swings between one and seven as people walk about
  // their errands, which reads as a town dying and recovering every few seconds
  st.pop = civs.filter(u => u.home && nearTown(u.home.x, u.home.y)).length;

  // THRIFT — the town's own takings, and what reaches the chest
  const take = folk.length * 0.5;
  if (take > 0) {
    const kept = take * g.thrift;
    st.res.dm = (st.res.dm || 0) + Math.round(kept * 10) / 10;
    // A grasping mayor is not caught at once. He is caught eventually.
    if (g.thrift < 0.34 && Math.random() < 0.05) {
      st.mayorSkim = (st.mayorSkim || 0) + Math.round((take - kept) * 10) / 10;
      if (st.mayorSkim > 25) {
        notify({ icon: "☠", cls: "bad", text: `${c.name} has been robbing ${st.name}.`,
                 sub: `${Math.round(st.mayorSkim)} DM never reached the chest — dismiss them, or leave them to it`,
                 x: st.x, y: st.y, z: 0.55 });
        st.mayorSkim = 0;
      }
    }
  }
}
function updateMayors(dt) {
  for (const st of settlements) {
    if (st.x === undefined) continue;
    if (st.mayor && (!civs.includes(st.mayor) || st.mayor.afield || st.mayor.rebel)) {
      loseMayor(st, `${st.mayor.name} is no longer able to hold it`);
      continue;
    }
    if (!st.mayor) continue;
    st.mayorT = (st.mayorT || 0) - dt;
    if (st.mayorT > 0) continue;
    st.mayorT = MAYOR_TICK;
    runMayor(st);
  }
}

// --- choosing one: the sheet you read before you decide ---
let mayorTown = null;
function openMayorModal(st) {
  mayorTown = st;
  const list = $("mayorList");
  const cands = mayorCandidates();
  $("mayorTitle").textContent = "MAYOR OF " + st.name.toUpperCase();
  $("mayorWhere").textContent = st.mayor
    ? `${st.mayor.name} holds the office. Pick another to replace them.`
    : `${st.name} governs itself, which is to say it does not. Pick somebody to run it.`;
  list.innerHTML = "";
  if (!cands.length) {
    list.innerHTML = '<div style="padding:8px;color:#5a6b60;font-size:11px">Nobody is free to take it.</div>';
    return;
  }
  for (const c of cands) {
    const g = mayorGrade(c);
    const row = document.createElement("div");
    row.className = "mayorRow" + (st.mayor === c ? " sitting" : "");
    const bars = MAYOR_DUTIES.map(d =>
      `<span class="mDuty" title="${esc(d.name)}: ${esc(d.what)}"><i>${esc(d.name)}</i>` +
      `<b style="width:${Math.round(g[d.id] * 100)}%"></b></span>`).join("");
    const tags = [TEMPER[c.temper] && TEMPER[c.temper].name, c.mark && MARK[c.mark] && MARK[c.mark].name]
      .filter(Boolean).join(" · ");
    row.innerHTML =
      `<div class="mHead"><b>${esc(c.name)}</b>` +
      `<span class="mRank">${esc(mayorRank(g.score))}</span></div>` +
      `<div class="mTags">${esc(profTitle(c.profession))}${tags ? " · " + esc(tags) : ""}</div>` +
      `<div class="mBars">${bars}</div>`;
    row.addEventListener("click", () => { appointMayor(st, c); closeMayorModal(); });
    list.appendChild(row);
  }
}
function closeMayorModal() { $("mayorModal").style.display = "none"; mayorTown = null; setPause(pauseOpen); }

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
  // its dot on the continent is simply where it is — see the note at townFalls
  const flag = worldCell(site.x, site.y);
  const st = { name, pop: chosen.length, x: site.x, y: site.y,
               res: { logs: 10, stone: 4, bread: 4, meat: 2, dm: 10 },
               mx: flag.mx, my: flag.my };
  settlements.push(st);
  // the settlers keep their names and trades — they walk out and live there
  chosen.forEach((c, i) => {
    if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
    unassignWork(c);
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
// The country is drawn before the first word is spoken, and redrawn as often as
// the player likes — nothing has been built yet, so nothing is lost by it.
function showSeed() {
  setWorld($("seedInput").value);
  $("seedTell").textContent = worldLabel ? worldTell() : "";
}
$("seedInput").addEventListener("input", showSeed);
$("seedInput").addEventListener("keydown", e => { if (e.key === "Enter") $("empireGo").click(); e.stopPropagation(); });
$("seedRoll").addEventListener("click", () => { $("seedInput").value = randomSeedLabel(); showSeed(); });
document.getElementById("empireGo").addEventListener("click", () => {
  empireName = document.getElementById("empireInput").value.trim() || "The Forester Realm";
  // whatever is in the box is the country; an empty box still gets a real one
  setWorld($("seedInput").value.trim() || randomSeedLabel());
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
    what: "A blacksmith's shop. He works the best metal the colony can spare into tools that make every kind of work faster, and weapons for the armoury and for the racks. Once Alloys is known he also keeps a crucible: copper and tin go in, bronze comes out, two bars at a pouring. Any civilian may buy either out of their own pocket — the weapon laws govern only what the government hands out.",
    stats: b => {
      const onRacks = kind => MATERIALS.map(m => `${m.name.toLowerCase()} ${(b.shop || []).filter(i => i.kind === kind && i.tier === m.id).length}`).join(" · ");
      const rung = (m, kind, effect) => [`${m.name} ${kind}`,
        `${effect} · ${m[kind].self} DM to a civilian, ${m[kind].gov} from the treasury · ${matsFor(m, kind).map(([k, q]) => `${q} ${k}`).join(", ")}`];
      return [
        ["Tools on the racks", onRacks("tool")],
        ["Weapons on the racks", onRacks("weapon")],
        ["In the armoury", MATERIALS.map(m => `${m.name.toLowerCase()} ${(res.armoury && res.armoury[m.id]) || 0}`).join(" · ")],
        ["Bronze from the crucible", has("alloys") ? `1 copper + 1 tin → 2 bronze · ${Math.floor(res.copper)} copper, ${Math.floor(res.tin)} tin in store`
                                                  : "needs Alloys, and a mine and a smelter before it"],
        ...MATERIALS.map(m => rung(m, "tool", `work ${Math.round(m.tool.bonus * 100)}% faster`)),
        ...MATERIALS.map(m => rung(m, "weapon", `${Math.round(weaponForm() * m.weapon.mult)} damage`)),
        ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
      ];
    },
  },
  quarry: {
    what: "A face of rock with steps cut into it, worked by a quarryman you put on it. It never runs out and it never needs finding — and the stone goes straight into the town's store, so nobody spends the day carrying.",
    stats: b => [
      ["Quarrymen on it", `${worksOf(b).length}` + (worksOf(b).length ? "" : " — nobody, it stands idle")],
      ["A shift gives", `${workYield({ type: "quarry" }).stone} stone, into the town's store`],
      ["A shift takes", `${INDUSTRY.quarry.time}s` + (has("deepshafts") ? " × 0.7 (Deep Shafts)" : "") + ", less as the hand learns"],
      ["Needs", "nothing but the hands"],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  mine: {
    what: "A shaft with a windlass over it. Iron, copper and tin are in the ground and in nothing else — no boulder ever gave up a bar of anything. What comes up depends on the seam the miner is following that day.",
    stats: b => [
      ["Miners on it", `${worksOf(b).length}` + (worksOf(b).length ? "" : " — nobody, it stands idle")],
      ["A shift takes", `${INDUSTRY.mine.time}s` + (has("deepshafts") ? " × 0.7 (Deep Shafts)" : "") + ", less as the hand learns"],
      ...SEAMS.map(sm => [goodName(sm.key).replace(/^\w/, ch => ch.toUpperCase()),
                          `${Math.round(sm.p * 100)}% of shifts — ${sm.n + (has("deepshafts") ? 1 : 0)} at a time`]),
      ["Ore is not metal", "the smelter cooks it down; tin goes straight to the crucible"],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  sawmill: {
    what: "A saw driven by the stream, worked by a lumberjack you put on it. Doors by the pair out of whole logs — far better than the five logs a man with an adze spends on one.",
    stats: b => [
      ["Lumberjacks on it", `${worksOf(b).length}` + (worksOf(b).length ? "" : " — nobody, it stands idle")],
      ["A shift", `${workNeeds({ type: "sawmill" }).logs} logs in, ${workYield({ type: "sawmill" }).doors} doors out`],
      ["A shift takes", `${INDUSTRY.sawmill.time}s, less as the hand learns`],
      ["By hand, a door costs", `${doorCost()} logs`],
      ["Town logs", `${Math.floor(ledgerAt(b.x, b.y).logs || 0)}`],
      ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
    ],
  },
  smelter: {
    what: "A stone stack furnace with a bellows on it, worked by a blacksmith you put on it. Ore is rock with metal in it; this is what gets the metal out. Set it to the ore you want cooked — it will not guess.",
    stats: b => {
      return [
        ["Blacksmiths on it", `${worksOf(b).length}` + (worksOf(b).length ? "" : " — nobody, it stands idle")],
        ["Furnace", has("blastfurnace") ? "blast — twice the metal from the same ore" : "a plain stack"],
        ["Set to", (() => {
          const need = Object.entries(workNeeds(b))[0], out = Object.entries(workYield(b))[0];
          return `${b.smelt === "copper" ? "COPPER" : "IRON"} — ${need[1]} ${goodName(need[0])} in, ${out[1]} ${out[0]} out`;
        })()],
        ["A shift takes", `${INDUSTRY.smelter.time}s, less as the hand learns`],
        ["Town iron ore", `${Math.floor(ledgerAt(b.x, b.y).ironore || 0)}`],
        ["Town copper ore", `${Math.floor(ledgerAt(b.x, b.y).copperore || 0)}`],
        ["Bronze", has("alloys") ? "the blacksmith melts copper and tin at the forge" : "needs Alloys"],
        ["Upkeep", `${CIVIC_UPKEEP} DM a tax day`],
      ];
    },
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
  shrine: {
    what: "A plain unmarked hut with a lantern by the door, dedicated to one creed and deliberately anonymous from the outside — which is how a forbidden congregation met in 1683, and why it will do for any faith at all. Small comfort, and cheap.",
    stats: b => {
      const f = FAITHS[b.faith] || FAITHS[DEFAULT_FAITH];
      return [
        ["Dedicated to", f.name],
        ["Comforts", `+6 happiness to every ${f.name}, up to two shrines`],
        ["Its congregation", `${flockOf(b.faith || DEFAULT_FAITH)} in the colony`],
        ["Against the tithe", "eases it a little — a great house eases it far more"],
      ];
    },
  },
  temple: {
    what: "The great house of one creed, built the way that creed built: a brick tower, a baroque dome, a bare preaching box, a barn, a house of arches, an onion dome, a minaret. It is the largest comfort a ruler can offer a soul, and the thing that buys consent to a tithe nobody would otherwise pay.",
    stats: b => {
      const fid = b.faith || DEFAULT_FAITH, f = FAITHS[fid];
      const mine = flockOf(fid), h = housesOfFaith(fid);
      return [
        ["Dedicated to", f.name],
        ["Comforts", `+13 happiness to every ${f.name}, up to two houses`],
        ["Its congregation", `${mine} in the colony — ${h} ${h === 1 ? "house" : "houses"} standing`],
        ["Against the tithe", `forgives up to ${Math.round(TAX_FAITH_RELIEF * 100)}% of its sting for a well-served believer`],
        ["Draws dissenters over", stateFaith === fid ? "yes — this is the state creed" : "no — only the state creed converts"],
      ];
    },
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
    `A ruin of what was a ${b.was ? bldgLabel({ type: b.was, faith: b.faith }) : "building"}. Select a civilian and click it to order the repair — it comes back as exactly what it was.`,
    [["Repair costs", costText(REPAIR_COST)],
     ["Comes back as", b.was ? bldgLabel({ type: b.was, faith: b.faith }) : "a cabin"]]);
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
  // The hour the ledger opened is the hour the ceiling came off. Set here rather
  // than in the loop above, so a save from before this existed — or one whose
  // ambitions were earned under an older list — still starts its clock the
  // first time it is counted.
  if (reckoningOpenedAt < 0 && ambitionsDone() >= AMBITIONS_TO_END) {
    reckoningOpenedAt = playT;
    eventCard("The woods have taken your measure.", "event_warparty",
              "You are no longer a colony they can afford to leave alone");
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
    ["State creed", stateFaith ? FAITHS[stateFaith].name : "none proclaimed"],
    ["Won over to it", tally.converted || 0],
    ["Driven out for their faith", (tally.banished || 0) +
      (tally.expulsions ? ` — ${tally.expulsions} edict${tally.expulsions === 1 ? "" : "s"} of expulsion` : "")],
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
  if (c.state === "working" && c.task && c.task.target && INDUSTRY[c.task.target.type])
    return INDUSTRY[c.task.target.type].doing;
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
    (hurt ? ` · ${hurt} badly hurt` : "") + (feuding ? ` · ${feuding} at feud` : "") +
    (stateFaith
      ? (civs.some(c => faithOf(c) !== stateFaith)
          ? ` · ${civs.filter(c => faithOf(c) !== stateFaith).length} dissent from the ${FAITHS[stateFaith].name} creed`
          : ` · one flock, all ${FAITHS[stateFaith].name}`)
      : ` · ${new Set(civs.map(faithOf)).size} creeds under no state church`);
  const list = $("folkList");
  const scroll = list.scrollTop;          // the roll refreshes as the world turns; don't yank the reader back to the top
  list.innerHTML = "";
  for (const c of rows) {
    const row = document.createElement("div");
    row.className = "folkRow" + (c.hp < c.maxHp * 0.6 || isSick(c) ? " hurt" : "");
    // plain single characters only: the crossed-out house was a combining slash
    // that never composed, and rendered as a house followed by a stray mark
    const sole = soleMasteries(c);
    const dissents = stateFaith && faithOf(c) !== stateFaith;
    const tags = (isSick(c) ? "☠" : "") + (c.feudWith ? "⚔" : "") + (isJailed(c) ? "⚖" : "") +
                 (c.rebel ? "⚑" : "") + (!c.home ? "◇" : "") + (dissents ? "✚" : "") +
                 (c.grief && c.grief.t > 0 ? "†" : "") + (sole.length ? "✦" : "");
    const tagHelp = [isSick(c) && "☠ stricken", c.feudWith && "⚔ at feud",
                     isJailed(c) && "⚖ jailed", c.rebel && "⚑ in revolt",
                     !c.home && "◇ no roof",
                     dissents && `✚ ${FAITHS[faithOf(c)].name} — dissents from the state creed`,
                     c.grief && c.grief.t > 0 && `† grieving for ${c.grief.who}`,
                     sole.length && `✦ the colony's only ${sole[0].name.toLowerCase()} (${sole[0].lvl})`]
                    .filter(Boolean).join(" · ");
    row.innerHTML =
      `<span class="folkName">${esc(c.name)}</span>` +
      `<span class="folkTrade">${esc(c.child ? "child" : profLabel(c.profession))}</span>` +
      `<span class="folkFaith" title="${esc(FAITHS[faithOf(c)].name)}"><img src="${faithIcon(faithOf(c))}" alt="${esc(FAITHS[faithOf(c)].name)}"></span>` +
      `<span class="folkTemper">${folkTemperCell(c)}</span>` +
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
// ===== the update log =====
// What has changed in the game, newest first, told the way the rest of the game
// talks. This is the only account of its own history a player ever sees, so it
// lives here beside the code it describes rather than in a file that never ships.
//
// `v` is a plain counter, and it is the whole of the unread mechanism: the
// highest v the player has opened is kept in localStorage and anything above it
// is marked new. Bump it for a change worth a mark on the button and leave it
// alone for a typo. Dates are the real ones these things landed on.
const CHANGELOG = [
  { v: 12, date: "6 September 2026", title: "A colony can be kept as a file",
    lines: [
      "Your six colonies have always lived in the browser's own store, which sounds safe and is not. It belongs to one browser at one address: clear the site data, use a different browser, or pick the game up on a different machine, and the colonies are not corrupted — they were simply never there. Hours of a reign could go without anything having gone wrong.",
      "So a colony can be written out to a file you keep. Save to a File in the pause menu writes out the one you are playing, having saved it first; the small arrow beside any colony on the front door writes that one out without opening it. LOAD FROM A FILE brings one back into a free slot, on any browser, on any machine.",
      "What goes into the file is exactly what the slot holds, so a colony carried this way arrives with everything — the chronicle, the charts, the agents abroad, the felled trees. A file from a newer version of the game is refused rather than half-read, and a file that is not a save at all is told so plainly.",
    ] },
  { v: 11, date: "6 September 2026", title: "Buildings can be turned side-on",
    lines: [
      "Every building is a flat head-on elevation, so turning one a quarter turn is not something code can do — rotate the picture and the roof ends up on its side. It needs a second drawing. Ten of them have one now: the cabin, the market, the bakery, the forge, the town hall, the gaol, the infirmary, the recruiting post, the sawmill and the smelter, each drawn again from its narrow end, and each with its own coat of snow for the winter.",
      "Press R while placing one — the same key that has always turned a wall — and it swings between showing you its front and showing you its gable end. A building stood end-on is genuinely narrower on the ground as well as in the picture, so a turned row packs into a third less street than a facing one.",
      "R turns a building you have picked up and are carrying, too, so you can decide which way it should face on the way to its new spot.",
      "A building without a side view simply keeps facing front rather than breaking, which is how the next building type will get to exist before anyone has drawn it.",
    ] },
  { v: 10, date: "6 September 2026", title: "Buildings can be picked up and put down again",
    lines: [
      "Until now the only way to change your mind about where something stood was to dismantle it and raise it again somewhere else — which lost the occupants, the stock on the shelves, the rota at the works and three quarters of the materials. So nobody ever changed their mind, and every colony was laid out the way it had been on the first afternoon, when there were four people and no idea what the place would become.",
      "Select a building and press Move it. It rides the cursor with a thread back to where it stands, the frame goes green where it may be set down and red where it may not, and a right-click or Escape puts it back. Its people, its stores and its state come with it. The cost is a quarter of what it cost to build — the labour of taking it down and putting it up, and nothing else.",
      "And they stand closer together. Every building used to demand twelve pixels of air on every side on top of its doorway, which meant a town could only ever be a scatter of huts in a field — you could not put a bakery beside a market the way a street is actually built. Four is enough to stop two roofs sharing a wall. The apron in front of the door is untouched, because that is the ground people walk in over.",
    ] },
  { v: 9, date: "5 September 2026", title: "A trade route is a bargain, not a pension",
    lines: [
      "A route used to be a switch with a gift in front of it: win the audience, hand over one load of wheat, and from then on a caravan turned up every minute with free silver and free goods forever. Nothing ever left your stores again.",
      "Now both halves of it are yours to argue over. You send them something every caravan and they send something back, and you sit down at a table and haggle over what. Ask for too much and the envoy is told plainly that it is not enough; ask for far too much and it is an insult and they will not hear it; offer more than you need to and they will take it gladly and you will have given away the difference.",
      "What a good is worth depends on who is holding it. A crown whose forests run to the horizon will not pay much for timber and will pay handsomely for the one thing its lands cannot grow — so the money is in selling a country what it lacks and taking payment in whatever it is sick of the sight of. A great power drives a harder bargain than a duchy, and a country with plague in it will take what it can get.",
      "And the caravan collects. Your side goes out of the capital's stores whether it is convenient or not, and a route you cannot pay is a route they tear up — two empty caravans and a warning, and on the third the agreement is void. The terms can be re-opened at any time from the country's panel.",
    ] },
  { v: 8, date: "5 September 2026", title: "Towns can be given to somebody to run",
    lines: [
      "A daughter town used to be a warehouse with a name on it. You founded it, the settlers walked out, and unless you personally stood over the place nothing whatever happened there — raiders burned the roofs and nobody rebuilt them, the survivors drifted back to the capital, and the town kept two hundred logs and a chest of silver in a clearing nobody visited again.",
      "Appoint a mayor from your own people and the town runs itself. They rebuild what was burned, send to the capital for bread when the larder is empty, call for hands to fill the empty roofs, put idle people to a trade the town is short of, and pay the takings into the chest.",
      "The office is a person, not a switch, and a person can be bad at it. Four bars on the appointment sheet say what they will actually be like: Care, Works, Order and Thrift, all read off the temperament, the skills and the life they have had. An industrious mayor keeps the place standing; an idle one lets it rot exactly as it rots now; a hot-tempered one cannot keep the peace; and a grasping one sees to it that rather less silver reaches the chest than left the field — until somebody notices, which they eventually do.",
      "Alongside it, a fault that had been quietly costing you people: nobody ever rehoused the homeless. A raid that took three roofs left three people homeless for good, losing a little mood every day and freezing in the winter, with empty cabins standing across the square. They move in now.",
    ] },
  { v: 7, date: "5 September 2026", title: "Rival cities are real places now",
    lines: [
      "Every named city of Europe is built out of its own books when you come near enough to make out a building, and folded back into them when you leave. Its walls are what the map said its walls were; the garrison waiting at the gate is the number your agent reported. Fly to Copenhagen and there is a city there.",
      "Which means it can be sacked, and the sacking sticks. Burn half the roofs and half the souls are gone from its books afterwards; kill the men on the walls and the next crown that counts them counts fewer. A hundred and nine towns are not all standing at once — only the one you are looking at is.",
      "Columns are drawn as men when the camera is low enough to see a man. A scout goes as a hunter, an agent as an ordinary traveller, a crown's company in that crown's coat. Fly down to where your scout is and he is there, riding.",
      "And the wall finally works like a wall. A piece could be built across your own gate and brick it up — silently, permanently, with the gate still drawn as a gate. That is refused now and dug out of colonies that already have one. People make for the gate that suits the journey rather than the nearest one, they make for it from the outset instead of walking into the stone first, and anyone caught outside with a war party in sight drops what they are doing and runs for it.",
      "Fixed alongside: a colony came back from a save at the opening zoom however far it had charted, because the ceiling was read before the technologies that set it; a city left standing when two foreign crowns fought was orphaned and never struck again, so its garrison sat in the save for the rest of the reign; a town with one scratched wall could never be put away at all; and a sacking done either side of a save was not charged to the city it was done to.",
    ] },
  { v: 6, date: "4 September 2026", title: "One map, from the doorstep to the Danube",
    lines: [
      "Europe is no longer a picture behind a button. Pull the camera back off your rooftops and the ground gives way to the country, the country to the crowns — the same map, the same coordinates, the whole way out.",
      "How high the eye may rise is bought on a fourth technology tree, Exploration. Cartography, Surveying, the Astrolabe and Mercator's Projection each lift the ceiling and each buy in the charts to go with it. Without them you can see your own valley and no further, which in 1683 was the ordinary condition of almost everybody.",
      "Every crown keeps real cities now — a hundred and nine of them, named, placed on their own ground, growing and arming and being ground down by whatever the century is doing to their country. Rest the pointer on one to read it; click it and the camera goes there.",
      "Nothing crosses Europe instantly any more. A war party leaves a named city of theirs and walks; your own column leaves your gate and walks. Both are on the map the whole way, and when one arrives you are told, with the place attached — click the notice and you are taken to it.",
      "What you cannot see, you do not know. Train a Scout to ride out and set country down on paper, and to count what he meets on the road. Train an Agent, once you have Ciphers, to take service in a foreign city and send home its musters and its arts — and lose all of it the day he is caught.",
    ] },
  { v: 5, date: "3 September 2026", title: "Civilians have temperaments",
    lines: [
      "Everyone is born with one of twelve temperaments, drawn from six opposed pairs: Industrious or Idle, Hot or Even-tempered, Gregarious or Solitary, Stout-hearted or Timid, Generous or Grasping, Hardy or Sickly.",
      "A temperament is not a badge. It bends how fast the work goes, what lifts and grinds a mood, how deep a quarrel cuts, what a blow is worth, and what the winter and the fever take.",
      "You are not told what a person is. Watch them work, quarrel, fight or freeze long enough and the colony takes their measure — then it is written on their sheet and in the roll.",
      "On top of what they were born as, what life does to them: Bereaved, Hardened, Bitter, Contented, Disgraced. These are never hidden, because the thing that earned them was public.",
      "Your own brother and sister were never strangers. Stout-hearted and industrious, and said so from the first hour.",
    ] },
  { v: 4, date: "3 September 2026", title: "Tools and weapons get a material ladder",
    lines: [
      "Stone, bronze and iron, and a pack for a civilian to carry it all in.",
    ] },
  { v: 3, date: "12 August 2026", title: "Key art, and a thumbnail cut from it",
    lines: [
      "The game has a face at last.",
    ] },
  { v: 2, date: "3 August 2026", title: "The endgame loses its ceiling",
    lines: [
      "There is no longer a point past which the colony stops being able to grow.",
    ] },
  { v: 1, date: "3 August 2026", title: "The game learns to be played on a phone",
    lines: [
      "Eleven faults that only ever went wrong on a small screen, found by measuring the panels rather than by squinting at them.",
      "Any panel now goes away when you tap it.",
    ] },
];
const LOG_SEEN_KEY = "forester_log_seen";
const logNewest = () => CHANGELOG.length ? CHANGELOG[0].v : 0;
// localStorage throws outright in a few browsers rather than merely being empty,
// so every touch of it is guarded: an unreadable store means "seen nothing".
function logSeen() { try { return +localStorage.getItem(LOG_SEEN_KEY) || 0; } catch (e) { return 0; } }
function markLogSeen() { try { localStorage.setItem(LOG_SEEN_KEY, String(logNewest())); } catch (e) {} }
const logUnread = () => logNewest() > logSeen();
function renderLog() {
  const seen = logSeen();
  $("logList").innerHTML = CHANGELOG.map(e =>
    `<div class="logEntry"><div class="logHead">` +
    `<span class="logTitle">${esc(e.title)}</span>` +
    (e.v > seen ? `<span class="logNew">new</span>` : "") +
    `<span class="logDate">${esc(e.date)}</span></div>` +
    `<ul>${e.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>`).join("");
}
// Render BEFORE marking it seen, or the entry the player opened the panel to
// read would be the one entry never shown as new.
function openLog() {
  renderLog();
  markLogSeen();
  $("logPanel").style.display = "block";
  refreshLogBadges();
}
function closeLog() { $("logPanel").style.display = "none"; refreshLogBadges(); }
// The mark sits on whichever way in the player can actually see right now.
function refreshLogBadges() {
  const dot = logUnread() ? ` <span class="newDot">●</span>` : "";
  const pm = $("pmLog"), mn = $("menuLog");
  if (pm) pm.innerHTML = "What Has Changed" + dot;
  if (mn) mn.innerHTML = "WHAT HAS CHANGED" + dot;
}
$("logClose").addEventListener("click", closeLog);
$("pmLog").addEventListener("click", openLog);
$("menuLog").addEventListener("click", openLog);
refreshLogBadges();

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

// ---------------------------------------------------------------------------
// Tap a panel to be rid of it.
//
// Every panel used to have its own way out and no two were alike: a [close]
// link here, a "close" button there, Escape for some, and for the civilian and
// building sheets nothing at all — you had to know to click the man a second
// time. Now a tap anywhere on a panel's own surface puts it away. Only the
// things you can actually operate are spared, and a drag is not a tap, so
// sliders, scrolling lists and selecting text all still behave.
//
// Closing is not always a matter of hiding the element. The civilian sheet is
// drawn from `selected` and would be back on the next frame; the pause menu
// holds the clock; the Reckoning hands the clock back to the pause menu.
// ---------------------------------------------------------------------------

// A tap landing on any of these is a use of the panel, not a dismissal of it.
const PANEL_KEEP = "button,input,select,textarea,label,a,.dropdown-menu,.menu-item,.folkRow,.tnode";

const PANEL_CLOSE = {
  civPanel:  () => { selected = null; selGroup = []; syncUI(); },
  bldgPanel: () => { selectedBldg = null; selectedCamp = null; selectedGrave = null; syncUI(); },
  govPanel:  () => { $("govPanel").style.display = "none"; syncUI(); },
  folkPanel: () => { $("folkPanel").style.display = "none"; syncUI(); },
  chronPanel:() => { $("chronPanel").style.display = "none"; syncUI(); },
  reignPanel:() => { $("reignPanel").style.display = "none"; paused = pauseOpen; },
  helpPanel: () => { $("helpPanel").style.display = "none"; },
  settingsPanel: () => { $("settingsPanel").style.display = "none"; saveSettings(); },
  skillPanel: () => closeSkills(),
  techPanel: () => { $("techPanel").style.display = "none"; $("techToggle").textContent = "Open Tech Tree"; },
  militaryPanel: () => { MUSIC.march(false); $("militaryPanel").style.display = "none"; saveSettings(); },
  pauseMenu: () => setPause(false),
};

for (const id of Object.keys(PANEL_CLOSE)) {
  const el = $(id);
  if (!el) continue;
  let down = null;
  el.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: e.target }; });
  el.addEventListener("click", e => {
    const d = down; down = null;
    // a press that travelled is a scroll, a drag or a text selection
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    // judge the press where it started: a dropdown that closed under the finger
    // would otherwise leave the release landing on bare panel
    if (d.t.closest && d.t.closest(PANEL_KEEP)) return;
    if (e.target.closest && e.target.closest(PANEL_KEEP)) return;
    // A tap with a menu hanging open is a change of mind about the menu. Let it
    // shut that and nothing else — the panel goes on the next tap.
    if (el.querySelector(".dropdown.open")) return;
    PANEL_CLOSE[id]();
  });
}

// ---------------------------------------------------------------------------
// The bottom sheets are positioned against the height of the action bar, and
// that height was written into the stylesheet as a round 50px. The bar is
// really 57 on a phone — and taller again on a handset with a home indicator,
// where it grows by the safe-area inset — so the foot of every sheet sat behind
// it. Measure the bar and let the stylesheet read the answer.
// ---------------------------------------------------------------------------
// Measuring it once at load is no good: the bar is hidden behind the main menu
// until a game begins, so the only reading available then is zero. Watch it
// instead, and take the height whenever it has one.
let actionBarH = 0;
function sizeActionBar() {
  const h = Math.round($("actions").getBoundingClientRect().height);
  if (h > 0 && h !== actionBarH) {
    actionBarH = h;
    document.documentElement.style.setProperty("--fx-actions-h", h + "px");
  }
}
addEventListener("resize", sizeActionBar);
addEventListener("orientationchange", () => setTimeout(sizeActionBar, 250));

// A menu opened inside a bottom sheet unrolled below the fold — Recruit opened
// 246px past the bottom of a phone screen, and the only way to reach it was to
// scroll the sheet on faith, with nothing on screen to say a menu had opened at
// all. Bring it into view. The action bar's own menus are already fixed sheets
// and place themselves.
for (const d of document.querySelectorAll(".dropdown")) {
  new MutationObserver(() => {
    if (!d.classList.contains("open")) return;
    const menu = d.querySelector(".dropdown-menu");
    if (!menu || getComputedStyle(menu).position === "fixed") return;
    // a timer, not a frame: a menu must still find its way onto the screen in a
    // tab the browser has stopped painting
    setTimeout(() => {
      if (!d.classList.contains("open")) return;
      const r = menu.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= innerHeight) return;
      menu.scrollIntoView({ block: "nearest" });
    }, 0);
  }).observe(d, { attributes: true, attributeFilter: ["class"] });
}

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
             world: d.worldLabel || "",
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

// --- carrying a colony out of the browser ---------------------------------
// A save lives in localStorage, which belongs to one browser at one address.
// Clear the site data, switch browser, or move from the phone to the desk, and
// the colony is not damaged — it is simply somewhere you no longer are. So a
// slot can be written out to a file and read back in. What goes to the file is
// exactly what the slot holds, byte for byte: nothing added, nothing
// translated, so a file written by this build and a file written by the next
// one are the same kind of thing. A file the player keeps is the only copy of a
// colony that this browser cannot quietly throw away.
const SAVE_EXT = ".forester.json";
// a name they can still make sense of a year later, and a disk will accept
function saveFileName(info) {
  const part = s => String(s || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const d = new Date(), p2 = n => String(n).padStart(2, "0");
  return [part(info && info.name) || "colony", (info && info.year) || "",
          `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`]
         .filter(Boolean).join("-") + SAVE_EXT;
}
// Hand a slot's ledger to the browser as a download. Returns the file name, or
// "" if there was nothing in that slot to write. A colony this build is too old
// to read is written out like any other: copying it needs no understanding of
// it, and that is exactly the colony most worth having a file of.
function exportSlot(i) {
  let raw = null;
  try { raw = localStorage.getItem(slotKey(i)); } catch (e) {}
  if (!raw || raw === "null") return "";
  const name = saveFileName(slotInfo(i));
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  // the browser reads the blob after the click returns, so the handle cannot be
  // released on this tick — a minute is longer than any disk needs
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return name;
}
// Read a file back into a free slot. Every way this can go wrong is worth its
// own sentence, because "import failed" tells a player nothing they can act on.
// Nothing already in the slots is touched on any of the failing paths.
function importSave(text) {
  let d;
  try { d = JSON.parse(text); }
  catch (e) { return { err: "That is not a Forester save — there is nothing in it that can be read as one." }; }
  if (!d || typeof d !== "object" || !Array.isArray(d.civs) || !d.res)
    return { err: "That file can be read, but there is no colony in it." };
  // the same refusal loadGame makes, made before the file is anywhere it could
  // be autosaved over rather than after
  if ((d.v || 1) > SAVE_V)
    return { err: "That colony was saved by a NEWER version of Forester than the one you are running. Reload the page to get the new version, then bring it in." };
  const slot = firstFreeSlot();
  if (!slot) return { err: `All ${SAVE_SLOTS} slots are full. Burn one first, then bring this colony in.` };
  try {
    // a slot can be free of a save and still hold the spare copy of a colony
    // burned out of it; leave that lying there and the recovery path could
    // raise the wrong colony from the dead on some later load
    localStorage.removeItem(slotKey(slot) + "_backup");
    localStorage.removeItem(slotKey(slot) + "_broken");
    localStorage.setItem(slotKey(slot), text);
  } catch (e) {
    return { err: "This browser will not take another ledger — there is no room left in its store. Burn a colony you are done with." };
  }
  return { slot, name: d.settlementName || "Neu Hamburg" };
}
// One file picker, made once and kept. A fresh input per click leaks one per
// click, and the same element will not report the same file twice unless its
// value is cleared first — which it is, so a player who picks the wrong file
// can pick the right one straight afterwards.
let savePicker = null;
function pickSaveFile(then) {
  if (!savePicker) {
    savePicker = document.createElement("input");
    savePicker.type = "file";
    savePicker.accept = ".json,application/json";
    savePicker.style.display = "none";
    document.body.appendChild(savePicker);
  }
  savePicker.onchange = () => {
    const f = savePicker.files && savePicker.files[0];
    savePicker.value = "";
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => then(String(fr.result || ""));
    fr.onerror = () => then(null);
    fr.readAsText(f);
  };
  savePicker.click();
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
      stateFaith, dedicateTo,
      // which season the world was last seen in, and how bold the woods had grown.
      // A fresh page starts both at their opening values; without carrying them, a
      // colony saved in winter came back and was told winter had just fallen.
      lastSeason, lastTier, reckoningOpenedAt, blockade,
      // the reign's running totals and what it has set down
      tally, achieved,
      cam: { x: cam.x, y: cam.y },
      hunterTimer, raidTimer, campRespawnTimer, worldT,
      // the far map: what you have charted, how the cities of Europe stand, and
      // who of yours is out on the roads between them
      world: worldSave(ci),
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
        temper: c.temper, temperSeen: c.temperSeen || undefined,
        temperO: c.temperO ? r1(c.temperO) : undefined,
        mark: c.mark || undefined, fought: c.fought || undefined,
        op: (c.op && Object.keys(c.op).length) ? c.op : undefined,
        feudWith: c.feudWith || undefined, feudT: c.feudT ? r1(c.feudT) : undefined,
        jail: bi(c.jail), jailT: c.jailT ? r1(c.jailT) : undefined,
        sk: skSave(c), sx: sxSave(c),
        conquered: c.conquered ? Math.round(c.conquered * 100) / 100 : undefined,
        afield: c.afield || undefined,           // he is out on the far map

        // A colony saved before there were any creeds comes back Lutheran to a
        // soul, which is exactly what Hamburg exiles were, so the omission reads
        // as the right answer rather than as missing data.
        faith: c.faith && c.faith !== DEFAULT_FAITH ? c.faith : undefined,
        doubt: c.doubt ? Math.round(c.doubt * 1000) / 1000 : undefined,
        inv: { ...c.inv },
      })),
      buildings: buildings.map(b => ({
        type: b.type, was: b.was || undefined, faith: b.faith || undefined,
        x: r1(b.x), y: r1(b.y), fire: r1(b.fire), placed: b.placed,
        hp: r1(b.hp), maxHp: b.maxHp, rot: b.rot, shop: b.shop || [], site: !!b.site,
        occupants: b.occupants.map(ci),
        workers: b.workers ? b.workers.map(ci) : undefined, smelt: b.smelt,
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
      worldLabel,                   // the country itself; absent means the original forest
      plagueT: r1(plagueT), plagueActive: r1(plagueActive), fuelT: r1(fuelT),
      corpses: corpses.map(cp => ({ x: r1(cp.x), y: r1(cp.y), who: cp.who, deceased: cp.deceased })),
      graves: graves.map(gv => ({ x: r1(gv.x), y: r1(gv.y), stone: gv.stone, deceased: gv.deceased })),
      // The mayor is a live civilian. Spread as-is he would drag his cabin and
      // its occupant list into the JSON and throw on the cycle, so the office
      // goes down as an index like every other person-shaped field here.
      settlements: settlements.map(st => ({ ...st, mayor: st.mayor ? ci(st.mayor) : undefined })),
      conquests: conquests.map(cq => ({ ...cq })),
      natWars: natWars.map(w => ({ ...w })),
      // `city`, `houses` and `garrisonRaised` are what the reckoning is done
      // against when the town is folded back into its books. Without them a
      // colony saved with a city standing came back unable to charge anybody for
      // the sacking, and shaved men off a big garrison for nothing.
      foreignTowns: foreignTowns.map(t => ({ nation: t.nation, name: t.name, x: r1(t.x), y: r1(t.y),
                                             dm: t.dm, weapons: t.weapons, city: t.city,
                                             houses: t.houses, garrisonRaised: t.garrisonRaised })),
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
    // FIRST, before anything can touch a chunk: the deltas below are applied on
    // top of freshly generated ground, and ground generated under the wrong seed
    // is the wrong ground. A save with no label predates seeding and must get
    // the original forest back, exactly.
    setWorld(d.worldLabel || "");
    Object.assign(res, d.res);
    res.dm = Math.round((res.dm || 0) * 10) / 10;   // scrub float drift out of older saves
    // A save from before the metals knows a weapon count but not what any of them
    // are. Rebuild the breakdown from scratch and let reconcile call the rest stone.
    res.armoury = Object.assign({ stone: 0, bronze: 0, iron: 0 }, (d.res && d.res.armoury) || {});
    reconcileArmoury();
    taxRate = d.taxRate; taxTimer = d.taxTimer; arrears = d.arrears || 0;
    stateFaith = FAITHS[d.stateFaith] ? d.stateFaith : null;
    dedicateTo = FAITHS[d.dedicateTo] ? d.dedicateTo : defaultDedication();
    settlementName = d.settlementName || "Neu Hamburg";
    Object.assign(laws, d.laws);
    zoom = d.zoom || 1;
    cam.x = d.cam.x; cam.y = d.cam.y;
    hunterTimer = d.hunterTimer; raidTimer = d.raidTimer; campRespawnTimer = d.campRespawnTimer;
    worldT = d.worldT || 3 * HOUR;
    for (const [id, done] of Object.entries(d.tech)) if (TECH[id]) TECH[id].done = done;
    // The ceiling on the camera is a technology, so it can only be applied once
    // the technologies are back. Clamping four lines earlier read the PREVIOUS
    // game's tree — on a fresh page load, an empty one — and so quietly dragged
    // every save back down to the opening zoom however far it had been charted.
    zoom = Math.max(zoomFloor(), Math.min(2.4, zoom));
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
        happiness: cd.happiness, rebel: cd.rebel,
        armed: cd.armed === true ? "iron" : (cd.armed || false),
        tool: cd.tool === true ? "iron" : (cd.tool || null),
        child: !!cd.child, growT: cd.growT || 0, age: cd.age || 20, post: cd.post || null,
        conquered: cd.conquered || 0 });
      c.sick = cd.sick || 0;
      c.op = cd.op || {}; c.feudWith = cd.feudWith || null; c.feudT = cd.feudT || 0;
      c.jailT = cd.jailT || 0;
      c.grief = cd.grief || null;
      // A colony saved before temperaments existed keeps the fresh roll mkCiv
      // just gave it, unrevealed — so an old settlement is not suddenly full of
      // blanks, it is full of people you have simply never had the measure of.
      // Your own brother and sister are the exception, as they always were.
      if (cd.temper) c.temper = cd.temper;
      else if (civs.length < 2) c.temperSeen = true;
      if (cd.temperSeen) c.temperSeen = true;
      c.temperO = cd.temperO || 0;
      c.mark = cd.mark || null;
      c.fought = cd.fought || 0;
      c.faith = FAITHS[cd.faith] ? cd.faith : DEFAULT_FAITH;
      c.doubt = cd.doubt || 0;
      c.sk = Object.assign(freshSkills(), cd.sk || {});
      c.sx = Object.assign({}, cd.sx || {});
      if (c.profession === "musketeer") refreshAvatar(c);   // old archers pick up the new sprite
      Object.assign(c.inv, cd.inv);
      civs.push(c);
    }
    buildings.length = 0;
    for (const bd of d.buildings)
      buildings.push({ type: bd.type, was: bd.was || null, faith: bd.faith || undefined,
                       x: bd.x, y: bd.y, progress: -1, fire: bd.fire || 0,
                       torchP: -1, placed: bd.placed, bakeT: 0, occupants: [],
                       rot: bd.rot || 0, site: !!bd.site, buildP: 0,
                       shop: (bd.shop || []).map(i => i.kind === "tool" && !i.tier ? { ...i, tier: "iron" } : i),
                       // the rota comes back with the work; the civs are already loaded above
                       workers: isWork(bd.type) ? (bd.workers || []).map(i => civs[i]).filter(Boolean) : undefined,
                       smelt: bd.type === "smelter" ? (bd.smelt || "iron") : undefined,
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
    settlements.length = 0;
    for (const st of (d.settlements || []))
      settlements.push({ ...st, mayor: typeof st.mayor === "number" ? civs[st.mayor] || null : null });
    for (const st of settlements) if (st.res) st.res.dm = Math.round((st.res.dm || 0) * 10) / 10;
    // every daughter town owns the ground it stands on — repairs older saves whose
    // settlements were founded before their clearing was claimed
    for (const st of settlements) if (st.x !== undefined) expandAround(st.x, st.y, 5);
    // and any gate an older build let a wall settle on top of is dug out again:
    // the placement rule refuses it now, but a colony that already has one is
    // walled out of its own town and cannot tell, because it still draws a gate
    for (const g of buildings.filter(b => b.type === "gate" || b.type === "stonegate")) {
      for (let i = buildings.length - 1; i >= 0; i--) {
        const b = buildings[i];
        if (b === g || (b.type !== "wall" && b.type !== "stonewall")) continue;
        if (inDoorway(bldgRect(b), g)) buildings.splice(i, 1);
      }
    }
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
    // A save from before the ceiling came off carries no hour. If its ambitions
    // are already in hand the clock starts now rather than backdating an
    // escalation the player never lived through.
    reckoningOpenedAt = typeof d.reckoningOpenedAt === "number" ? d.reckoningOpenedAt : -1;
    blockade = d.blockade || null;
    // Besiegers are not saved — no raider is — so no town is under siege on the
    // hour a colony is read back in. Clearing this matters because a load does
    // not reload the page: a stale entry here would announce a siege breaking
    // that nobody in this world ever laid.
    invested.clear();
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
    // The far map goes back last, because it is built on top of everything else:
    // the borders (which the conquests have just moved), the towns, and the men
    // themselves — a column out on the roads is a list of civilians by index.
    buildMapGrid();
    worldLoad(d.world);
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
  // and for the same reason a fresh colony gets the ceiling back: without this
  // a new game begun after a long one inherits its predecessor's reckoning and
  // is set upon by a war it never provoked
  reckoningOpenedAt = -1; blockade = null; invested.clear();
  // and the far map starts blank again: no charts, no columns, no agent in
  // anybody's court. Without this a second colony begins with the first one's
  // atlas, which would give away half of Europe for nothing.
  worldNewGame();
  // a country is already drawn behind the modal, so the woods the player is
  // looking at are the woods they will get
  $("seedInput").value = randomSeedLabel();
  showSeed();
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
  { text: () => IS_TOUCH
      ? "That is how every order is given: pick someone, then tap the thing you want done. Press and hold a moment before letting go and a plaque tells you what the tap will do. With them still picked, tap a spruce tree to fell it."
      : "That is how every order is given: pick someone, then click the thing you want done. Right-click cancels. With them still selected, click a spruce tree to fell it.",
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
  { text: () => "In that panel, press Open Tech Tree and begin any research. Four trees run from sharper axes to battle steel, and out to the far edge of the map, paid for in DM and time.",
    done: () => tutSeen.tech || !!research || Object.values(TECH).filter(t => t.done).length > 3 },
  { text: () => "Press MAP, or simply scroll the wheel back. The ground gives way to the country: your land in your own colour, the crowns of Europe around it, and every column on every road between them. Cartography, on the Exploration tree, lifts the eye further.",
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
  upkeep: () => `⚖ Nothing you raise is free to keep. On every tax day the treasury pays ${WAGE} DM to each man under arms and ${CIVIC_UPKEEP} DM to each work that must be tended — the market, the bakery, the well, the forge, the recruitment center, the watchtower, the jail, the hospital, the town hall, and every quarry, mine, sawmill and smelter — whether or not anyone is working it. Cabins, walls, lamps and farms cost nothing once they stand. An army is a standing choice against a hospital. If the treasury cannot pay, unpaid men lose heart and the works go untended: disband someone, pull something down, or raise the tax. The GOVERNMENT panel shows the whole bill.`,
  trade: "On the map you can send an envoy to a peaceful neighbour and talk their court into a trade route — gifts help, threats do not. Caravans then bring coin and goods to your gate.",
  winter: "❄ Winter comes every year. The fields sleep and the cold kills: anyone left outside too long freezes. Housed folk duck indoors to warm themselves, but the homeless simply die in the snow. Build roofs before riches.",
  raid: "⚔ Raiders come for your stores, and they come at night. Research Defending for walls and gates, and keep a watchtower to see them coming.",
  plague: "☠ Plague walks the towns of Europe — and it does not check your borders. The stricken work badly, waste away, and some do not rise again; it passes on its own in time. Wells keep more of them standing, and the fed and the housed weather it best. A skilled hand lost to fever is not quickly replaced.",
  hospital: "☤ The answer to it is a Hospital (BUILD ▾ — 25 logs, 8 stone, 14 DM) and a Doctor (select a civilian, Recruit ▾ — 30 DM). Doctors go out on their own, carry the fever-struck and the badly hurt back on a stretcher, and lay them in a bed: the wasting stops, the fever burns out four times faster, and wounds close. Four beds to a hospital, and patients eat from your stores. To mend a wounded soldier, select them and press Heal and they will walk to a bed. A housed, fed man knits a little back together sleeping in his own bed, but it is slow, and it will not touch a fever.",
  soldiers: () => "⚔ You have men under arms. " +
    (IS_TOUCH ? "Tap one, then tap another" : "Click one, then click another") +
    ", and they gather into a band — keep going to raise a company. Send the band at bare ground and they march there in column and hold it; send them at a raider and they go for him." +
    (IS_TOUCH ? "" : " With two or more picked, DRAG across the ground instead of clicking and they form a line of battle, as long as you drag it, and they will keep that line."),
  closing: () => "That is the whole of it: gather and build by day, keep bellies full and taxes fair, wall the town before dark, research toward steel, and grow cell by cell. Wanderers, raiders and wars will find you on their own. " +
    (IS_TOUCH ? "How to Play is in the ☰ menu whenever you want it." : "Press ? at any time for every control.") +
    " The woods are yours.",
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
    // Anything unread puts itself in front of the player on the way in. A log
    // that waits behind a button is a log nobody reads, and the button was easy
    // to walk straight past. Only when there is genuinely something new, and
    // only after the menu has painted — opened any earlier it would be covered
    // by the title screen it is supposed to be sitting on top of.
    if (logUnread()) setTimeout(openLog, 700);
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
      (s.empire ? `<span style="color:#7a8f83"> · ${esc(s.empire)}</span>` : "") +
      (s.world ? `<span style="color:#5a6b60"> · ${esc(s.world)}</span>` : "") + `</span>` +
      `<span class="slotWhen">${when}</span>`;
    if (s.future) row.classList.add("stale");
    row.addEventListener("click", () => { useSlot(s.i); doLoading(true); });
    // A colony can be written out without being opened — the backup you take
    // before trying something reckless, and the way a colony crosses from one
    // browser to another.
    const out = document.createElement("button");
    out.className = "saveOut"; out.textContent = "↓";
    out.title = "Write this colony out to a file you keep";
    out.addEventListener("click", e => {
      e.stopPropagation();                        // the arrow is not the row
      const name = exportSlot(s.i);
      $("menuSlotNote").textContent = name
        ? `Written out as ${name}. Keep the file — LOAD FROM A FILE brings it back, on any browser.`
        : "There was nothing in that slot to write out.";
    });
    row.appendChild(out);
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
// The other half: a file off the disk becomes a colony in a free slot. It is
// not opened, only put where the player can see it and click it — so a file
// that turns out to be the wrong one has cost them nothing but a slot.
$("menuImport").addEventListener("click", () => {
  pickSaveFile(text => {
    const note = $("menuSlotNote");
    if (text === null) { note.textContent = "That file could not be read off the disk."; return; }
    const r = importSave(text);
    if (r.err) { note.textContent = r.err; return; }
    renderSaveList();                             // the new colony joins the list
    note.textContent = `${r.name} is in slot ${r.slot}. Click it to take up where you left off.`;
  });
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
  stratBarSync();                    // how high you are, and how high you may go

  clearFaithCensus();          // whatever just changed, the panels read it fresh
  renderFaithPanels();
  $("buildToggle").classList.toggle("active", !!buildMode);
  $("roadToggle").classList.toggle("active", roadMode);
  $("tbRotate").classList.toggle("hot", !!buildMode && CAN_TURN(buildMode));
  // in a daughter town's clearing, the HUD shows that town's ledger instead of the capital's
  const hudCx = cam.x + canvas.width / 2 / zoom, hudCy = cam.y + canvas.height / 2 / zoom;
  const hudTown = townAt(hudCx, hudCy);
  const hr = hudTown ? (hudTown.res || {}) : res;
  $("rName").textContent = (hudTown ? hudTown.name : settlementName).toUpperCase();
  $("rLogs").textContent = hr.logs || 0; $("rSeeds").textContent = hr.seeds || 0;
  $("rStone").textContent = hr.stone || 0; $("rIron").textContent = hr.iron || 0;
  // The metals only take up room on the bar once there are any. A colony with no
  // mine should not be reading four zeroes it can do nothing about.
  for (const [id, k] of [["rIronOre", "ironore"], ["rCopperOre", "copperore"],
                         ["rTin", "tin"], ["rCopper", "copper"], ["rBronze", "bronze"]]) {
    const q = Math.floor(hr[k] || 0);
    $(id).textContent = q;
    $(id + "Box").style.display = q > 0 ? "" : "none";
  }
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
    // the word that draws this forest, so a good one can be written down
    $("govWorldRow").style.display = worldLabel ? "" : "none";
    if (worldLabel) { $("govWorld").textContent = worldLabel; $("govWorldTell").textContent = worldTell(); }
    else $("govWorldTell").textContent = "";
    // A siege and a blockade are both quiet — nothing burns and no horn blows
    // twice — so the ledger says plainly what is being done to you and by whom.
    const woes = [];
    if (blockade && NATIONS[blockade.nation])
      woes.push(`<b style="color:#d86a5a">Routes closed by ${esc(NATIONS[blockade.nation].name)}</b> — no caravans, no shipments. Peace or their defeat lifts it.`);
    if (invested.size)
      woes.push(`<b style="color:#d86a5a">Under siege: ${esc([...invested].map(t => t ? t.name : (settlementName || "the capital")).join(", "))}</b> — the fields cannot be worked until they are driven off.`);
    $("govWoes").innerHTML = woes.join("<br>");
    $("govWoes").style.display = woes.length ? "block" : "none";
  }
  {
    const counts = {};
    for (const c of govFolk) counts[c.child ? "child" : (c.profession || "no trade")] = (counts[c.child ? "child" : (c.profession || "no trade")] || 0) + 1;
    const orderProfs = ["farmer", "hunter", "lumberjack", "quarryman", "miner", "forager", "blacksmith", "doctor", "police", "soldier", "musketeer", "cavalry", "child", "no trade"];
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
    const sig = phys.map(s => `${s.name}:${s.pop}:${s.mayor ? s.mayor.name : "-"}`).join("|");
    if (rows.dataset.sig !== sig) {
      rows.dataset.sig = sig;
      rows.innerHTML = "";
      for (const s of phys) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;align-items:center;margin:4px 0;font-size:11px;flex-wrap:wrap";
        const g = s.mayor ? mayorGrade(s.mayor) : null;
        row.innerHTML = `<span style="flex:1 1 100%">${esc(s.name)} (pop ${s.pop})` +
          (s.mayor ? `<span style="color:#7a8f83"> · ${esc(s.mayor.name)}, ${esc(mayorRank(g.score))}</span>`
                   : `<span style="color:#8e5a5a"> · no mayor</span>`) + `</span>`;
        const mayor = document.createElement("button");
        mayor.className = "btn"; mayor.style.fontSize = "10px";
        mayor.textContent = s.mayor ? "Mayor…" : "Appoint a mayor";
        mayor.title = "Give this town to one of your people to run";
        mayor.addEventListener("click", () => {
          openMayorModal(s);
          $("mayorModal").style.display = "block";
          paused = true;
        });
        const send = document.createElement("button");
        send.className = "btn"; send.style.fontSize = "10px"; send.textContent = "Load wagon ▶";
        send.title = "Choose exactly what the capital sends to this town";
        send.addEventListener("click", () => openCargo(s, 1));
        const take = document.createElement("button");
        take.className = "btn"; take.style.fontSize = "10px"; take.textContent = "◀ Fetch";
        take.title = "Choose what this town sends back to the capital";
        take.addEventListener("click", () => openCargo(s, -1));
        row.appendChild(mayor); row.appendChild(send); row.appendChild(take);
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
  if (!selected) { p.style.display = "none"; hidePackTip(); }
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
    {
      const f = F(selected), fid = faithOf(selected);
      $("cpFaith").innerHTML = `<img src="${faithIcon(fid)}" alt="" style="width:16px;height:16px;image-rendering:pixelated">` +
        `<span style="color:${fid === stateFaith ? "#c9a86a" : "#cfd8d3"}">${esc(f.name)}</span>` +
        (stateFaith && fid !== stateFaith ? '<span style="color:#c98a8a">· dissenter</span>' : "") +
        ((selected.doubt || 0) > 0.25 && stateFaith && fid !== stateFaith
          ? `<span style="color:#7a8f83">· wavering (${Math.round(selected.doubt * 100)}%)</span>` : "");
      $("cpCreed").textContent = f.rule;
      const bn = $("cpBanish");
      bn.style.display = selected.child ? "none" : "block";
      bn.textContent = `Banish ${selected.name} from the colony`;
    }
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
    // Who they are, before what they can do. A temperament the colony has not
    // yet had the measure of says so in as many words — an empty space here
    // would read as something broken rather than as something not yet known.
    {
      const t = TEMPER[selected.temper], m = selected.mark && MARK[selected.mark];
      const chip = (kind, t) =>
        `<span class="traitChip ${kind}"><img src="assets/sprites/traits/${t.id}.png" alt="">` +
        `<span class="tText"><span class="tName">${esc(t.name)}</span>` +
        `<span class="tWhy">${esc(t.blurb)}</span>` +
        `<span class="tDoes">${esc(t.does)}</span></span></span>`;
      const out = [];
      if (selected.child)
        out.push(`<span class="traitChip unknown"><span class="tName">a child yet — no telling</span></span>`);
      else if (selected.temperSeen && t) out.push(chip("", t));
      else out.push(`<span class="traitChip unknown"><span class="tName">you have not taken their measure</span></span>`);
      if (m) out.push(chip("mark", m));
      $("cpTemper").innerHTML = out.join("");
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
    const offer = bestOffer(selected, "tool");
    $("cpBuyTool").textContent = offer ? `Buy ${offer.name.toLowerCase()} tool from blacksmith (gov funds, ${offer.tool.gov} DM)`
                                       : "Buy tool from blacksmith (gov funds)";
    syncPack(selected);
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
    {
      const trade = Object.entries(INDUSTRY).find(([, w]) => w.prof === selected.profession);
      const onWorks = trade ? buildings.filter(b => b.type === trade[0] && (b.workers || []).includes(selected)).length : 0;
      $("cpFarms").textContent = selected.profession === "farmer"
        ? `Tends ${assigned} farm(s). Click a farm to assign or unassign.`
        : trade
          ? `Works ${onWorks} ${BLDG_NAMES[trade[0]].toLowerCase()}(s). Click one to put them on it or take them off.`
          : selected.profession === "soldier" ? "Click a thief or raid camp to send them to sack it." : "";
    }
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
    $("bpMove").style.display = "none";
    $("bpBuyWeapon").style.display = "none";
    $("bpSmelt").style.display = "none";
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
    $("bpMove").style.display = "none";
  } else {
    bp.style.display = "block";
    $("bpDismantle").style.display = "block";
    const b = selectedBldg;
    const isFarm = farms.includes(b);
    // A farm is a staked-out field, not a thing on legs; everything else can be
    // carried, and the button says what the carrying will cost.
    const mv = $("bpMove");
    if (isFarm || !CAN_MOVE(b)) mv.style.display = "none";
    else {
      mv.style.display = "block";
      const cost = moveCost(b);
      mv.textContent = "Move it" + (costText(cost) ? ` (${costText(cost)})` : "");
    }
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
    // a furnace is set to one ore or the other, and says which
    const furnace = !isFarm && b.type === "smelter" && !b.site && !b.fire;
    $("bpSmelt").style.display = furnace ? "block" : "none";
    if (furnace) $("bpSmelt").textContent = b.smelt === "copper" ? "Set the furnace to iron ore" : "Set the furnace to copper ore";
  }
  syncSkills();   // an open tree keeps pace with the work and the treasury
  // Last, once every panel above has been shown or hidden: on a phone these are
  // bottom sheets and the toast sits in the same strip of glass, so the two were
  // printed over each other and neither could be read. The stylesheet lifts the
  // toast clear whenever a sheet is up. Set here rather than at the top of this
  // function, or it reports the state of the frame before.
  document.body.classList.toggle("sheet-open",
    ["civPanel", "bldgPanel", "govPanel", "folkPanel", "chronPanel", "reignPanel"].some(isOpen));
  // The bar is hidden behind the main menu, so it cannot be measured until a
  // game is running. This is the one place guaranteed to run once it is; the
  // measurement is thrown away unless the height actually changed.
  sizeActionBar();
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
  clearFaithCensus();          // one census a frame, read by every soul in it
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
  // The camera's own journey runs whether or not the world does: clicking a
  // notification while the game is paused should still take you to the thing.
  updateFlight(dt);

  if (paused) return;

  volleySounds = 0;      // the frame's ration of musket reports
  worldT += dt;
  rescueStuck(dt);
  updateNationWars(dt);
  updateWorld(dt);
  updateMayors(dt);
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
  updateInvestment(dt);
  updateBlockade(dt);
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
      // The protection tax. A charter to live in the town was sold to the Jews of
      // Hamburg by the year and could be withdrawn by the year, and this is what
      // it cost them — which makes them the most profitable subjects you have,
      // and is exactly why every town in Europe kept taking them in and throwing
      // them out again.
      const due = taxRate + taxBonus() + (F(c).tribute || 0);
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
          kid.faith = faithOf(m);              // a child is raised in its mother's church
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
  // A crop under siege is not tended. The ring sits between the town and its
  // fields, so the corn stands where it is until somebody drives them off — the
  // growth is held, not lost, which is why a siege broken in time costs nothing
  // but the waiting.
  for (const f of farms)
    if (!f.ready && season() !== "winter" && !townInvested(townAt(f.x, f.y)) &&
        (f.growT += dt) >= farmRipen()) f.ready = true;
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
      campRespawnTimer = Math.max(90, 300 * Math.pow(0.93, reckoning() - 1));
      spawnCamps(camps.length + 1 < campCap() ? 2 : 1);
    }
  }
  if (camps.length) {
    raidTimer -= dt;
    if (raidTimer <= 0) {
      // The floor was the real ceiling: five minutes between raids no matter how
      // rich the colony grew, so the woods went quiet exactly when they should
      // have been at their worst. Past the old cap it comes down.
      raidTimer = Math.max(raidFloor(), (RAID_MIN + Math.random() * (RAID_MAX - RAID_MIN)) * Math.pow(0.95, reckoning() - 1));
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
      ambushT = Math.max(60, (140 + Math.random() * 90) * Math.pow(0.95, reckoning() - 1));
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
    // A man on campaign is not in the colony. He is a mark on the far map for as
    // long as the road takes, and none of what follows — hunger, cold, work,
    // grief, the hospital — reaches him out there. The column carries its own
    // provisions, which is the only reason an army can leave home at all.
    if (c.afield) { c.state = "idle"; c.task = null; continue; }
    // grief wears off; it does not have to be tended, only outlived
    if (c.grief) { c.grief.t -= dt; if (c.grief.t <= 0) c.grief = null; }
    // A faith that keeps two hundred fast days a year is a faith whose people
    // have learned to be hungry, and the larder feels it.
    c.hunger = Math.max(0, c.hunger - HUNGER_DECAY * (has("horsefeed") ? 0.8 : 1) * (F(c).fastMul || 1) * (season() === "winter" ? 1.15 : 1) * dt);
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
    updateFaithDrift(c, dt);
    // Contentment is not a good day; it is a long run of unremarkable ones. The
    // clock runs only while everything is genuinely well and resets the moment
    // it is not, so this cannot be farmed by a single good harvest.
    if (c.happiness > 70 && c.home && !c.sick && !c.feudWith && !raiders.length) {
      c.calmT = (c.calmT || 0) + dt;
      if (c.calmT > 420) setMark(c, "contented", "nothing has gone wrong for them in a long while.");
    } else c.calmT = 0;

    // winter cold: five minutes in the open kills (guards last seven)
    if (season() === "winter") {
      // A roof is only worth having with a fire under it. The colony burns one
      // log from the common store every thirty seconds of winter; when the last
      // one goes, the chimneys stop smoking and a house warms nobody — the folk
      // inside freeze exactly as if they were standing in the snow.
      if (INDOORS.has(c.state) && hearthsLit) {
        c.coldT = Math.max(0, c.coldT - dt * 8);
      } else {
        // The hardy stand it; the sickly are taken by it sooner. This runs per
        // frame, so it only ever SCALES the clock — nothing is revealed here.
        // The reveal is hung on the warning below, which fires once.
        c.coldT = (c.coldT || 0) + dt * temperCold(c);
        const limit = isForce(c) ? 210 : 150;
        if (c.coldT > limit - 60 && !c.coldWarned) {
          c.coldWarned = true;
          if (isT(c, "hardy") || isT(c, "sickly")) noteTemper(c, 4);
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

    // ===== when the horn goes, get behind the walls =====
    // A colony that has built a curtain wall has built somewhere to be during a
    // raid, and until now nobody used it: they carried on felling spruces in the
    // open while a war party walked past them. Anyone caught outside the wall
    // with trouble in sight now drops what they are doing and makes for the gate
    // — which the routing above will actually send them through.
    if (!c.rebel && !isForce(c) && !INDOORS.has(c.state) && c.state !== "borne" &&
        (!c.task || c.task.kind !== "toGate")) {
      // Is there anybody to run from? This is a handful of hypots over a short
      // array. The wall test below walks the line a cell at a time and rebuilds
      // the structure list at every step, so it must never be the first question
      // asked — it was costing a full pass over every wall in the colony, for
      // every civilian, on every frame of an ordinary peaceful afternoon.
      let near = null, nd = RUN_FOR_GATE;
      for (const r of raiders) {
        if (r.state === "flee") continue;
        const d = Math.hypot(r.x - c.x, r.y - c.y);
        if (d < nd) { nd = d; near = r; }
      }
      if (near) {
        const home = c.home ? { x: c.home.x, y: c.home.y + 14 } : townCentre(townAt(c.x, c.y));
        // "outside" is not a geometry question, it is a practical one: is there a
        // wall of ours between this person and the roofs they belong to?
        if (lineBlocked(c.x, c.y, home.x, home.y)) {
          if (c.task && c.task.target && c.task.target.progress !== undefined) c.task.target.progress = -1;
          order(c, { kind: "toGate", x: home.x, y: home.y });
          if (!c.gateToldT || worldT - c.gateToldT > 30) {
            c.gateToldT = worldT;
            if (!gateToldT || worldT - gateToldT > 12) {
              gateToldT = worldT;
              toast(`\u26a0 Folk caught outside the walls are running for the gate.`);
            }
          }
        }
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
        c.inv.stone += 4;
        float(c.x, c.y - 70, "+4 stone", "#7da083");
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "working") {
      // A shift at a work: the same loop whichever work it is. It eats out of the
      // town's store and puts back into the town's store, and nobody carries
      // anything anywhere — that is the whole point of having built it.
      const w = c.task.target;
      if (!buildings.includes(w) || w.fire || w.site || !isWork(w.type)) { c.state = "idle"; c.task = null; continue; }
      const led = ledgerAt(w.x, w.y), need = workNeeds(w);
      if (!haveGoods(led, need)) { w.progress = -1; c.state = "idle"; c.task = null; continue; }
      const span = workTime(w, c);
      c.workT += dt; w.progress = c.workT / span; c.anim += dt * 9;
      if ((c.workT % 0.55) < dt) (w.type === "sawmill" ? SFX.chop() : w.type === "smelter" ? SFX.hammer() : SFX.quarry());
      if (c.workT >= span) {
        gainSkill(c, INDUSTRY[w.type].skill, 3);
        takeGoods(led, need);
        const got = workYield(w);
        for (const [k, q] of Object.entries(got)) led[k] = (led[k] || 0) + q;
        float(w.x, w.y - 100, Object.entries(got).map(([k, q]) => `+${q} ${goodName(k)}`).join(" "), "#7da083");
        w.progress = -1;
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
        const made = matOf(c.task.tier);
        const what = withArt(`${made ? made.name.toLowerCase() + " " : ""}${c.task.make}`);
        if (c.task.make === "alloy") {
          res.bronze += 2;
          toast(`${c.name} pours copper and tin together — 2 bronze off the crucible. (${res.bronze} in store)`);
        } else if (c.task.make === "weapon" && !c.task.forRacks) {
          // the colony's own metal, forged at the colony's forge, for the colony's
          // armoury: no coin changes hands, and no civilian touches the treasury
          armouryAdd(c.task.tier);
          toast(`${c.name} forges ${what} for the armoury. (${res.weapons} in store)`);
        } else {
          const shopForge = buildings.find(b => b.type === "forge" && !b.fire && !b.site);
          if (shopForge) {
            shopForge.shop = shopForge.shop || [];
            shopForge.shop.push({ kind: c.task.make, by: c.name, tier: c.task.tier });
            toast(`${c.name} finishes ${what} and sets it for sale at the forge.`);
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
        tell("build", `The ${bldgLabel(b)} stands whole again. ${c.name} rebuilt it.`);
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
        // A tool he cannot afford must not crowd out the blade he can.
        const upTool = bestOnRacks(f, c, "tool"), upArm = bestOnRacks(f, c, "weapon");
        const kind = (upTool && c.inv.dm >= upTool.tool.self) ? "tool"
                   : (upArm && c.inv.dm >= upArm.weapon.self) ? "weapon" : null;
        if (kind) {
          const mat = kind === "tool" ? upTool : upArm;
          const price = mat[kind].self;
          const idx = f.shop.findIndex(i => i.kind === kind && i.tier === mat.id);
          const item = f.shop.splice(idx, 1)[0];
          c.inv.dm -= price;
          const smith = civs.find(o => o.name === item.by && o.profession === "blacksmith");
          if (smith) { smith.inv.dm += price; float(smith.x, smith.y - 70, "+" + price + " DM", "#c9a86a"); }
          else res.dm += price;
          if (kind === "tool") c.tool = mat.id; else c.armed = mat.id;
          float(c.x, c.y - 70, "+1 " + mat.name.toLowerCase(), "#7da083");
          SFX.coin();
          toast(`${c.name} buys ${withArt(`${mat.name.toLowerCase()} ${kind}`)} at the forge${smith ? ` — ${item.by} pockets ${price} DM` : ""}.`);
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
        // Alms: the works of mercy, the community of goods, and zakat. No coin
        // crosses, and the man who gives is thought better of for it.
        if (c.task.alms) {
          if (F(c).alms === "coin" && c.inv.dm >= 6) {
            const gift = Math.max(2, Math.round(c.inv.dm * 0.2));
            c.inv.dm -= gift; b2.inv.dm += gift;
            float(b2.x, b2.y - 70, "+" + gift + " DM", "#c9a86a");
          } else if (c.inv.bread > 0 || c.inv.meat > 0) {
            if (c.inv.bread > 0) { c.inv.bread--; b2.inv.bread++; } else { c.inv.meat--; b2.inv.meat++; }
            float(b2.x, b2.y - 70, "+1 food", "#7da083");
          }
          nudgeOpinion(b2, c, 9);
          c.state = "idle"; c.task = null;
          continue;
        }
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
            let dmg = Math.round(bayonetDmg() * armSkill(c, "fighting") * temperArm(c));
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
          let dmg = Math.round(musketDmg(d) * armSkill(c, "marksmanship") * temperArm(c));   // nearer the muzzle, and steadier the hand
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
        let dmg = Math.round((isForce(c) ? forceDmg(c) : (c.armed ? weaponDmg(c) : FIST_DMG)) * armSkill(c, "fighting") * temperArm(c));
        // A blow struck in earnest is the plainest evidence there is of whether a
        // man is stout-hearted or not, and it is a discrete event, not a frame.
        if (c.isCiv && (isT(c, "stout") || isT(c, "timid"))) noteTemper(c, 1.2);
        // Trading blows with a raider is the thing that hardens a person, and it
        // takes more than one exchange. Counted per blow struck, never per frame.
        if (c.isCiv && raiders.includes(foe) && (c.fought = (c.fought || 0) + 1) >= 4)
          setMark(c, "hardened", "they have stood in the line and traded blows with raiders.");
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

// ===== the world, at every distance =====
// Europe used to live behind a button. You pressed MAP, the game stopped, and a
// painted rectangle appeared with your colony marked on it as a dot — a picture
// of a world you were not standing in. Everything that happened out there was
// told to you in sentences: a war party marches on Waldheim, Sweden and Denmark
// are at war, a town has fallen. You never saw any of it.
//
// There is one map now, and the doorstep and the Danube are on it. Pull the
// camera back off your rooftops and the ground gives way to the country, the
// country to the marches, the marches to the crowns — the same coordinates the
// whole way out, so a column that leaves your gate is the same column you watch
// crawl toward Torun an hour later. How far you may rise is bought with
// cartography; what you may SEE from up there is bought with scouts and spies,
// and can be taken away again by whoever kills them.
//
// The two scales are stitched together by one number: CELL_W, the world-pixel
// width of a league-square of the old Europe grid. Your capital stands at the
// centre of EMPIRE_HOME, and everything else follows from that.

const CELL_W = 2200;                                   // world pixels to a map cell
const MAP_X0 = (-0.5 - EMPIRE_HOME.mx) * CELL_W;
const MAP_Y0 = (-0.5 - EMPIRE_HOME.my) * CELL_W;
const MAP_W = MG_W * CELL_W, MAP_H = MG_H * CELL_W;
const cellWorld = (mx, my) => ({ x: (mx - EMPIRE_HOME.mx) * CELL_W, y: (my - EMPIRE_HOME.my) * CELL_W });
const worldCell = (x, y) => ({ mx: Math.round(x / CELL_W) + EMPIRE_HOME.mx, my: Math.round(y / CELL_W) + EMPIRE_HOME.my });
const ckey = (mx, my) => mx + "," + my;

// ===== how far the eye may rise =====
// The first tier is free and is roughly what the camera could always do: your
// own valley and the woods it sits in. Everything past it is a technology,
// because a seventeenth-century colony genuinely could not picture the ground
// it had never walked — the chart had to be bought, drawn, or stolen.
const ZOOM_TIERS = [
  { tech: null,          z: 0.180,  chart: 3,  what: "your own country" },
  { tech: "cartography", z: 0.072,  chart: 7,  what: "the near marches" },
  { tech: "surveying",   z: 0.030,  chart: 13, what: "the neighbouring crowns" },
  { tech: "astrolabe",   z: 0.013,  chart: 22, what: "half the continent" },
  { tech: "mercator",    z: 0.0055, chart: 34, what: "the whole of Europe" },
];
const tierHeld = t => !t.tech || TECH[t.tech].done;
function zoomFloor() { let z = ZOOM_TIERS[0].z; for (const t of ZOOM_TIERS) if (tierHeld(t)) z = Math.min(z, t.z); return z; }
function nextZoomTier() { return ZOOM_TIERS.find(t => !tierHeld(t)) || null; }
// the atlas a technology brings with it: ground you have never walked, but that
// somebody has, and whose charts your money can now buy
function atlasR() { let r = 0; for (const t of ZOOM_TIERS) if (tierHeld(t)) r = Math.max(r, t.chart); return r; }

// ===== where the ground ends and the map begins =====
// Not a switch — a dissolve. The grass thins out, the country fades up through
// it, and for a moment you can see both, which is the moment that makes the two
// scales feel like one place instead of two screens.
const STRAT_IN = 0.22, STRAT_FULL = 0.15;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
function stratAmt() { return clamp01((STRAT_IN - zoom) / (STRAT_IN - STRAT_FULL)); }
const onMap = () => stratAmt() > 0.5;                  // the map has the floor

// ===== the cities of Europe =====
// A nation used to be a coloured blob with a name floating over it. You cannot
// march on a blob, spy on a blob, or watch a blob starve. Every crown keeps real
// towns now — named, placed on its own ground, with a population that grows and
// a garrison that can be counted if you can get someone close enough to count it.
const CITY_NAMES = {
  scotland: ["Edinburgh", "Glasgow", "Aberdeen", "Inverness"],
  england: ["London", "York", "Bristol", "Norwich", "Newcastle"],
  ireland: ["Dublin", "Cork", "Galway"],
  france: ["Paris", "Lyon", "Marseille", "Bordeaux", "Rouen", "Toulouse"],
  castile: ["Madrid", "Toledo", "Seville", "Valladolid", "Burgos"],
  aragon: ["Zaragoza", "Barcelona", "Valencia"],
  portugal: ["Lisbon", "Porto", "Coimbra"],
  hre: ["Frankfurt", "Cologne", "Nuremberg", "Mainz", "Augsburg"],
  brandenburg: ["Berlin", "Potsdam", "Küstrin"],
  saxony: ["Dresden", "Leipzig", "Meissen"],
  bavaria: ["Munich", "Regensburg", "Ingolstadt"],
  austria: ["Vienna", "Graz", "Innsbruck", "Linz"],
  milan: ["Milan", "Pavia", "Como"],
  savoy: ["Turin", "Chambéry", "Nice"],
  venice: ["Venice", "Padua", "Verona", "Brescia"],
  tuscany: ["Florence", "Pisa", "Siena", "Livorno"],
  papal: ["Rome", "Bologna", "Ancona"],
  naples: ["Naples", "Bari", "Salerno"],
  sicily: ["Palermo", "Messina", "Catania"],
  sweden: ["Stockholm", "Riga", "Gothenburg", "Åbo", "Narva"],
  denmark: ["Copenhagen", "Aarhus", "Odense"],
  poland: ["Warsaw", "Kraków", "Vilnius", "Danzig", "Lwów"],
  russia: ["Moscow", "Novgorod", "Arkhangelsk", "Kazan", "Astrakhan", "Smolensk"],
  cossacks: ["Chyhyryn", "Zaporizhia"],
  crimea: ["Bakhchysarai", "Kaffa"],
  hungary: ["Pressburg", "Kassa", "Sopron"],
  transylvania: ["Alba Iulia", "Kolozsvár", "Kronstadt"],
  moldavia: ["Iași", "Suceava"],
  wallachia: ["Bucharest", "Târgoviște"],
  ottoman: ["Constantinople", "Adrianople", "Salonica", "Smyrna", "Belgrade", "Sofia",
            "Buda", "Athens", "Aleppo", "Damascus"],
  algiers: ["Algiers", "Oran", "Constantine"],
  tunis: ["Tunis", "Kairouan"],
  tripoli: ["Tripoli", "Benghazi"],
};
// a deterministic little roll, so the same world lays its cities down the same
// way every time it is opened — a city that wandered between sessions would make
// every scouting report a lie
function srnd(seed) {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}
let CITIES = [];
// Their sites come from the crown's ORIGINAL blobs, never from the live map. A
// city that moved when a border moved would make every scouting report, every
// march and every spy a lie about where things are; when the ground under a city
// changes hands the city stays exactly where it is and changes hands with it.
function buildCities() {
  if (!mapGrid || !baseGrid) buildMapGrid();
  const keep = new Map(CITIES.map(c => [c.id, c]));    // whatever has already happened to them
  CITIES = [];
  for (const [id, n] of Object.entries(NATIONS)) {
    const names = CITY_NAMES[id] || [n.name];
    const own = [];
    for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++)
      if (baseGrid[r][c] === id) own.push([c, r]);
    if (!own.length) continue;
    const rnd = srnd(seedFrom(id) ^ 0x51ed27);
    const want = Math.min(names.length, Math.max(2, 1 + n.strength));
    // spread them out: the roomiest sites first, then relax until we have enough
    const picked = [];
    for (let apart = 8; apart >= 1 && picked.length < want; apart--) {
      const pool = own.slice().sort(() => rnd() - 0.5);
      for (const [c, r] of pool) {
        if (picked.length >= want) break;
        if (picked.some(p => Math.max(Math.abs(p[0] - c), Math.abs(p[1] - r)) < apart)) continue;
        picked.push([c, r]);
      }
    }
    picked.forEach(([mx, my], i) => {
      const cid = id + ":" + i, old = keep.get(cid), cap = i === 0;
      const base = {
        id: cid, nation: id, owner: id, name: names[i % names.length], mx, my, cap,
        pop: Math.round((cap ? 22 : 9) + n.strength * (cap ? 5 : 2) + rnd() * 8),
        garrison: Math.round((cap ? 8 : 3) + n.strength * 1.4 + rnd() * 4),
        walls: cap ? 3 : Math.min(3, Math.floor(n.strength / 2)),
        wealth: Math.round((cap ? 260 : 90) + n.strength * 40 + rnd() * 80),
        fallen: false, siege: 0,
      };
      CITIES.push(old ? Object.assign(base, {
        pop: old.pop, garrison: old.garrison, wealth: old.wealth, walls: old.walls,
        fallen: old.fallen, siege: old.siege,
      }) : base);
    });
  }
  cityIdx = new Map(CITIES.map(c => [c.id, c]));
  refreshCityOwners();
  // Every city object here is NEW — the run above rebuilt the list from scratch
  // — so any town standing in timber has just lost the city that owns it. An
  // orphan is never struck (nothing holds a reference to strike it), so it and
  // its garrison stay on the ground and in the save for the rest of the reign.
  // resolveBattle calls this every time any two crowns fight, which is often.
  relinkCityTowns();
}
// Whose flag actually flies over each one, which is a different question from
// who built it. The wars of Europe move cells about; this reads the answer off
// the map rather than keeping a second, disagreeing copy of it.
function refreshCityOwners() {
  if (!mapGrid) return;
  const mine = empireCells();
  for (const c of CITIES) {
    if (mine.has(ckey(c.mx, c.my))) { c.owner = "you"; continue; }
    const row = mapGrid[c.my];
    c.owner = (row && row[c.mx]) || c.nation;
  }
}
let cityIdx = new Map();
const cityWorld = c => cellWorld(c.mx, c.my);
const cityById = id => cityIdx.get(id) || null;
function nationCities(id) { return CITIES.filter(c => c.owner === id && !c.fallen); }
// what a city is worth in men — the number a spy brings home, and the number
// your own column is measured against when it arrives at the gates
const cityMight = c => Math.round(c.garrison * (1 + c.walls * 0.35));

// ===== what a crown knows how to do =====
// A spy in a foreign court comes home with two things worth having: how many men
// they can field, and what their smiths and scholars have learned. The arts are
// rolled from the crown's strength and the year, so a great power is genuinely
// further along than a duchy — and finding that out before you declare war is
// exactly what the spy is for.
const NAT_ARTS = [
  "Pike and Shot", "Bastion Forts", "Field Artillery", "Matchlock Drill",
  "Flintlock Muskets", "Bayonet Drill", "Line Infantry", "Cuirassiers",
  "Naval Stores", "Standing Army", "Siege Engineering", "Military Hospitals",
];
function nationArts(id) {
  const n = NATIONS[id];
  const rnd = srnd(seedFrom(id) ^ 0x7ea1);
  const era = Math.floor(playT / 900);                 // the century moves on for them too
  const many = Math.max(2, Math.min(NAT_ARTS.length, n.strength + 1 + era));
  const pool = NAT_ARTS.slice().sort(() => rnd() - 0.5);
  return pool.slice(0, many).sort();
}

// ===== the fog: the difference between a map and an atlas =====
// You are not given Europe. You are given the ground your own people stand on,
// plus whatever charts your technologies let you buy, plus whatever your scouts
// have actually walked. Everything else is a blank on the paper — no border, no
// name, no city — and a blank is not merely ugly: an army can cross it and you
// will not know until it is at your gate.
const charted = new Set();
let fogBuf = null, fogDirty = true;
const isCharted = (mx, my) => charted.has(ckey(mx, my));
function chartCell(mx, my) {
  if (mx < 0 || my < 0 || mx >= MG_W || my >= MG_H) return false;
  const k = ckey(mx, my);
  if (charted.has(k)) return false;
  charted.add(k); fogDirty = true;
  return true;
}
function chartAround(mx, my, rad) {
  let fresh = 0;
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++)
    if (dx * dx + dy * dy <= rad * rad + rad && chartCell(mx + dx, my + dy)) fresh++;
  return fresh;
}
// the ground you hold is charted by standing on it; the rest of the near country
// by the atlases your cartographers have bought
let chartT = 0;
function updateCharting(dt) {
  chartT -= dt;
  if (chartT > 0) return;
  chartT = 1.5;
  chartAround(EMPIRE_HOME.mx, EMPIRE_HOME.my, atlasR());
  for (const st of settlements) if (st.x !== undefined) {
    const cl = worldCell(st.x, st.y);
    chartAround(cl.mx, cl.my, 2);
  }
  for (const m of marches) if (m.side === "you") {
    const cl = worldCell(m.x, m.y);
    chartAround(cl.mx, cl.my, m.kind === "scout" ? Math.round(3 * glass()) : 1);
  }
}

// ===== what your eyes reach right now =====
// Charting is memory — this is eyesight. A column in the field is only drawn
// while something of yours is near enough to see it, which is the whole reason
// a scout is worth feeding: he is a pair of eyes you can put where you are not.
// Rebuilt at most once a frame. marchVisible() asks this question for every
// column every time anything is drawn or stepped, and rebuilding the list each
// time was several hundred throwaway arrays a second for an answer that cannot
// have changed between two of them.
let sightT = -1, sightCache = null;
function sightPosts() {
  if (sightCache && sightT === worldT) return sightCache;
  sightT = worldT;
  return sightCache = buildSightPosts();
}
function buildSightPosts() {
  const out = [{ x: CAPITAL_X, y: CAPITAL_Y, r: CELL_W * 1.6 }];
  for (const st of settlements) if (st.x !== undefined) out.push({ x: st.x, y: st.y, r: CELL_W * 1.3 });
  for (const m of marches) if (m.side === "you")
    out.push({ x: m.x, y: m.y, r: m.kind === "scout" ? CELL_W * 2.6 * glass() : CELL_W * 1.2 });
  return out;
}
function sighted(x, y) {
  for (const p of sightPosts()) if (Math.hypot(p.x - x, p.y - y) < p.r) return true;
  return false;
}

// ===== the intelligence you hold, and what it costs to keep =====
// A spy is not a purchase, he is a tenancy. While he lives in their capital you
// can read their strength and their arts off the panel like your own; the hour
// he is caught, the panel goes blank again. What he knew dies with him, because
// he was the only one who knew it.
const intel = {};                                       // nation id -> what its resident tells you
function knowsArmies(id) { const i = intel[id]; return !!(i && i.armies); }
function knowsArts(id) { const i = intel[id]; return !!(i && i.arts); }
function knowsCity(c) { return isCharted(c.mx, c.my) || knowsArmies(c.owner); }
function loseIntel(marchId) {
  for (const [id, i] of Object.entries(intel)) if (i.by === marchId) delete intel[id];
}

// ===== columns in the field =====
// Everything that used to happen instantly and off-screen now takes time and
// takes ground. A war party does not appear at your walls: it leaves a named
// city, crosses however many leagues lie between, and arrives. Your own army
// does the same in reverse. Both are on the map the whole way, and either can be
// intercepted, spotted, missed entirely, or watched the whole miserable distance.
let marches = [], marchSeq = 1;
const MARCH_SPEED = { army: 185, war: 215, field: 200, scout: 320, spy: 265 };
const glass = () => TECH.fieldglass.done ? 1.5 : 1;    // what a good lens is worth on a hilltop
function mkMarch(o) {
  const m = Object.assign({
    id: marchSeq++, side: "them", kind: "field", nation: null,
    x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0,
    men: null, str: 1, state: "march", t: 0, seen: false, told: false, name: "",
  }, o);
  m.sx = m.x; m.sy = m.y;
  marches.push(m);
  return m;
}
const marchById = id => marches.find(m => m.id === id) || null;
function marchSpeed(m) {
  let s = MARCH_SPEED[m.kind] || 200;
  if (m.side === "you" && TECH.couriers.done) s *= 1.25;   // relays on every road
  if (season() === "winter") s *= 0.72;                // the roads of Europe close too
  return s;
}
function marchProgress(m) {
  const total = Math.hypot(m.tx - m.sx, m.ty - m.sy);
  if (total < 1) return 1;
  return clamp01(Math.hypot(m.x - m.sx, m.y - m.sy) / total);
}
// whether this column is on your map at all: yours always, theirs only while
// something of yours can see it, or while a spy is reading their muster rolls
function marchVisible(m) {
  if (m.side === "you") return true;
  if (knowsArmies(m.nation)) return true;
  return sighted(m.x, m.y);
}

// A crown's column, sent at another crown. The wars of Europe used to be a
// dice roll every forty seconds; now the dice are still there but a column has
// to reach the walls before they are thrown.
function dispatchNatColumn(war) {
  const sa = natStrength(NATIONS[war.a]), sb = natStrength(NATIONS[war.b]);
  const atk = Math.random() < sa / (sa + sb) ? war.a : war.b;
  const def = atk === war.a ? war.b : war.a;
  const from = nationCities(atk), to = nationCities(def);
  if (!from.length || !to.length) { resolveBattle(war); return; }
  // the shortest quarrel it can pick: the enemy town nearest one of its own
  let best = null, bd = Infinity;
  for (const f of from) for (const t of to) {
    const a = cityWorld(f), b = cityWorld(t), d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < bd) { bd = d; best = [f, t]; }
  }
  const [src, dst] = best, p = cityWorld(src), q = cityWorld(dst);
  mkMarch({ kind: "field", side: "them", nation: atk, x: p.x, y: p.y, tx: q.x, ty: q.y,
            str: Math.round(natStrength(NATIONS[atk]) * 3 + 4), target: dst.id,
            name: `army of ${NATIONS[atk].name}` });
}
// and what happens when it gets there
function natColumnArrives(m) {
  const dst = cityById(m.target);
  if (!dst || dst.fallen) return;
  // the war is looked up rather than carried, so a column that survives a save
  // and a load still knows which quarrel it belongs to
  const war = natWars.find(w => (w.a === m.nation && w.b === dst.owner) ||
                                (w.b === m.nation && w.a === dst.owner)) || null;
  const win = Math.random() < m.str / (m.str + cityMight(dst));
  const seen = knowsCity(dst) || sighted(m.x, m.y);
  if (win) {
    dst.garrison = Math.max(1, Math.round(dst.garrison * 0.55));
    dst.pop = Math.max(2, Math.round(dst.pop * 0.88));
    dst.wealth = Math.round(dst.wealth * 0.7);
    dst.siege = 0;
    if (war) resolveBattle(war);
    if (seen) notify({ icon: "⚔", cls: "war",
      text: `${NATIONS[m.nation].name} storms ${dst.name}.`,
      sub: `${NATIONS[dst.owner] ? NATIONS[dst.owner].name : "The defender"} loses the field — the walls are breached`,
      x: m.x, y: m.y, z: zoomFloor() * 3 });
  } else {
    dst.garrison = Math.max(1, dst.garrison - 1);
    if (seen) notify({ icon: "⚔", cls: "war",
      text: `${dst.name} holds against ${NATIONS[m.nation].name}.`,
      sub: `The column is thrown back from the walls`,
      x: m.x, y: m.y, z: zoomFloor() * 3 });
  }
  stratDirty = true;
}

// A crown's column, sent at YOU. The war party that used to materialise a
// thousand pixels from your gate now leaves a real city with a real name, and
// the walk is the warning — if you have anyone out there to see it.
function dispatchWarColumn(id, town, invest) {
  const n = NATIONS[id];
  const cs = nationCities(id);
  const dc = { x: town ? town.x : CAPITAL_X, y: town ? town.y : CAPITAL_Y };
  let src = null, bd = Infinity;
  for (const c of cs) { const p = cityWorld(c); const d = Math.hypot(p.x - dc.x, p.y - dc.y); if (d < bd) { bd = d; src = c; } }
  const p = src ? cityWorld(src) : { x: dc.x + CELL_W * 2.5, y: dc.y - CELL_W * 1.5 };
  const m = mkMarch({ kind: "war", side: "them", nation: id, x: p.x, y: p.y, tx: dc.x, ty: dc.y,
                      str: Math.round(natStrength(n) * 2 + 3), town: town || null, invest,
                      from: src ? src.name : n.name,
                      name: `war party of ${n.name}` });
  // If it sets out where you can see it, that is your warning — and it is worth
  // more than the horn was, because it comes with a distance and a direction.
  if (marchVisible(m))
    notify({ icon: "⚑", cls: "war",
      text: `A column of ${n.name} marches out of ${m.from}.`,
      sub: `Bound for ${town ? town.name : settlementName || "the capital"} — ${leagues(m)} away`,
      x: m.x, y: m.y, z: zoomFloor() * 2 });
  return m;
}
const leagues = m => Math.max(1, Math.round(Math.hypot(m.tx - m.x, m.ty - m.y) / CELL_W)) + " league(s)";

// ===== your own operations =====
// The three things a colony can put on a road, in the order the tech tree hands
// them to you: an army that takes ground, a scout that finds it, and a spy who
// tells you what is standing on it.
// `where` is either a city, which stands still and waits to be besieged, or an
// enemy column, which does not — a chase is aimed at where the enemy is THIS
// second, and is re-aimed every second until contact or until he is lost.
function sendArmy(where, men) {
  if (!where || !men.length) return null;
  const city = where.mx !== undefined ? where : null;
  const foe = city ? null : where;
  const q = city ? cityWorld(city) : { x: foe.x, y: foe.y };
  for (const c of men) { c.afield = true; c.task = null; c.state = "idle"; c.post = null; }
  const m = mkMarch({ kind: "army", side: "you", nation: null, x: CAPITAL_X, y: CAPITAL_Y,
                      tx: q.x, ty: q.y, men, str: men.length * 4,
                      target: city ? city.id : undefined, chase: foe ? foe.id : undefined,
                      name: `your column, ${men.length} strong` });
  // they leave from wherever most of them were standing
  const ax = men.reduce((s, c) => s + c.x, 0) / men.length, ay = men.reduce((s, c) => s + c.y, 0) / men.length;
  m.x = m.sx = ax; m.y = m.sy = ay;
  notify({ icon: "⚔", cls: "you",
           text: city ? `Your column marches on ${city.name}.` : "Your column rides to cut them off.",
           sub: `${men.length} under arms — ${leagues(m)} of road ahead`, march: m.id,
           x: m.x, y: m.y, z: zoomFloor() * 2.5 });
  SFX.warHorn();
  return m;
}
function sendScout(tx, ty, label) {
  const m = mkMarch({ kind: "scout", side: "you", x: CAPITAL_X, y: CAPITAL_Y, tx, ty,
                      str: 1, name: "your scout", home: { x: CAPITAL_X, y: CAPITAL_Y } });
  notify({ icon: "◈", cls: "you", text: `A scout rides for ${label || "the far country"}.`,
           sub: "He charts what he crosses and counts what he meets", march: m.id,
           x: m.x, y: m.y, z: zoomFloor() * 2.5 });
  return m;
}
function sendSpy(city) {
  const q = cityWorld(city);
  const m = mkMarch({ kind: "spy", side: "you", x: CAPITAL_X, y: CAPITAL_Y, tx: q.x, ty: q.y,
                      str: 1, target: city.id, nation: city.owner, name: "your agent" });
  const court = NATIONS[city.owner] || NATIONS[city.nation];
  notify({ icon: "✧", cls: "you", text: `An agent sets out for ${city.name}.`,
           sub: `He will take service in ${court ? court.name : "their country"} and write home`, march: m.id,
           x: m.x, y: m.y, z: zoomFloor() * 2.5 });
  return m;
}
// the column turns for home: whoever of yours is standing near the given point
function recallColumn(wx, wy, r = 900) {
  const men = civs.filter(c => !c.afield && isForce(c) && Math.hypot(c.x - wx, c.y - wy) < r);
  if (!men.length) return null;
  for (const c of men) { c.afield = true; c.task = null; c.state = "idle"; c.post = null; }
  const m = mkMarch({ kind: "army", side: "you", x: wx, y: wy, tx: CAPITAL_X, ty: CAPITAL_Y,
                      men, str: men.length * 4, homeward: true,
                      name: `your column, ${men.length} strong` });
  notify({ icon: "⚑", cls: "you", text: `${men.length} turn for home.`,
           sub: `${leagues(m)} of road behind them`, march: m.id, x: wx, y: wy, z: zoomFloor() * 2.5 });
  return m;
}

// --- the road under them, one frame at a time ---
function landMen(m, x, y) {
  (m.men || []).forEach((c, i) => {
    if (!civs.includes(c)) return;
    const a = (i / Math.max(1, m.men.length)) * Math.PI * 2;
    c.afield = false; c.state = "idle"; c.task = null;
    c.x = x + Math.cos(a) * (40 + (i % 3) * 26);
    c.y = y + Math.sin(a) * (34 + (i % 3) * 22);
    c.wpx = c.x; c.wpy = c.y;
  });
  m.men = null;
}
function arriveArmy(m) {
  // a column that lost every man on the way is not an army arriving anywhere
  if (m.men && !m.men.some(c => civs.includes(c))) { m.men = null; return; }
  const city = m.target ? cityById(m.target) : null;
  if (m.homeward || !city) {
    landMen(m, m.tx, m.ty);
    notify({ icon: "⚑", cls: "you", text: m.homeward ? "The column is home." : "Your column has arrived.",
             sub: m.homeward ? "They fall out and go back to their work" : "They stand where you sent them",
             x: m.tx, y: m.ty, z: 0.6 });
    return;
  }
  // the city may already be standing because the camera is on it; if not, it is
  // raised out of its own books, the same as if you had flown there to look
  const town = city.town || materialiseCity(city);
  if (!town) { landMen(m, m.tx, m.ty); return; }
  landMen(m, town.x, town.y + 480);
  city.siege = 1;
  notify({ icon: "⚔", cls: "you", text: `Your army stands before ${town.name}.`,
           sub: "Burn the town hall and the town is yours — click its walls to give the order",
           x: town.x, y: town.y + 300, z: 0.55 });
  SFX.warHorn();
  stratDirty = true;
}
// ===== two columns meet on a road =====
// No walls, no gates, no ground worth holding — only which of them is still
// standing at the end of it. The loser's men are simply gone, which is why
// throwing a company at a war party is a real decision and not a free swing.
function fieldClash(m, foe) {
  const men = (m.men || []).filter(c => civs.includes(c));
  // No enemy here, or he was last seen here and has since moved on — and a
  // company with nobody left in it has no business fighting anybody.
  if (!foe || Math.hypot(foe.x - m.x, foe.y - m.y) > CELL_W * 0.5 || !men.length) {
    landMen(m, m.x, m.y);
    if (men.length)
      notify({ icon: "⚑", cls: "you", text: "The trail is cold.",
               sub: "Whoever you were chasing has gone on without them", x: m.x, y: m.y, z: 0.55 });
    return;
  }
  const mine = men.length * 4, theirs = foe.str;
  const win = Math.random() < mine / (mine + theirs);
  const nat = NATIONS[foe.nation];
  if (win) {
    // a third of the company falls even in a victory
    const lost = Math.floor(men.length * (0.15 + Math.random() * 0.25));
    for (let i = 0; i < lost; i++) { const c = men[i]; c.afield = false; killCiv(c, `fell fighting ${nat ? nat.name : "the enemy"} on the road`); }
    m.men = men.slice(lost);
    landMen(m, m.x, m.y);
    marches.splice(marches.indexOf(foe), 1);
    notify({ icon: "⚔", cls: "you", text: `The column of ${nat ? nat.name : "the enemy"} is broken.`,
             sub: lost ? `${lost} of yours fell; the rest hold the road` : "Not a man of yours lost",
             x: m.x, y: m.y, z: 0.5 });
    SFX.warHorn();
  } else {
    const lost = Math.max(1, Math.floor(men.length * (0.55 + Math.random() * 0.35)));
    for (let i = 0; i < lost; i++) { const c = men[i]; c.afield = false; killCiv(c, `fell fighting ${nat ? nat.name : "the enemy"} on the road`); }
    m.men = men.slice(lost);
    landMen(m, m.x, m.y);
    foe.str = Math.max(1, foe.str - Math.round(mine / 3));
    notify({ icon: "☠", cls: "bad", text: "Your column is thrown back.",
             sub: `${lost} dead on the road; ${nat ? nat.name : "the enemy"} marches on`,
             x: m.x, y: m.y, z: 0.5 });
  }
  stratDirty = true;
}
function scoutReport(m) {
  const seen = m.spotted || 0;
  notify({ icon: "◈", cls: "you", text: "The scout is home.",
           sub: `${m.chartedN || 0} league(s) of country set down on paper` +
                (seen ? `, and ${seen} column(s) counted` : ", and no army met on the road"),
           x: CAPITAL_X, y: CAPITAL_Y, z: zoomFloor() * 3 });
}
function killOperative(m, why) {
  loseIntel(m.id);
  const where = m.kind === "spy" && m.target ? (cityById(m.target) || {}).name : null;
  notify({ icon: "☠", cls: "bad",
           text: m.kind === "spy" ? `Your agent in ${where || "the field"} is taken.`
                                  : "Your scout does not come back.",
           sub: m.kind === "spy" ? "What he knew of their strength dies with him"
                                 : why || "Cut down somewhere on the road",
           x: m.x, y: m.y, z: zoomFloor() * 3 });
  marches.splice(marches.indexOf(m), 1);
  stratDirty = true;
}

function updateMarches(dt) {
  for (const m of [...marches]) {
    // --- the resident agent: no longer travelling, merely at risk ---
    if (m.state === "resident") {
      m.t += dt;
      const n = NATIONS[m.nation];
      if (!n || n.defeated) { killOperative(m, "The court he served no longer exists"); continue; }
      // a court at war with you searches its own servants far harder
      const heat = 0.0016 * (1 + m.t / 420) * (n.atWar ? 2.4 : 1) / (TECH.fieldglass.done ? 2.2 : 1);
      if (Math.random() < heat * dt * 60) { killOperative(m, null); continue; }
      continue;
    }
    // a column chasing a column steers at where the enemy is now, not at where
    // he was when the order was given — and loses the trail if he goes dark
    if (m.chase) {
      const foe = marchById(m.chase);
      if (foe && marchVisible(foe)) { m.tx = foe.x; m.ty = foe.y; m.lost = false; }
      else if (!foe) {
        landMen(m, m.x, m.y);
        notify({ icon: "⚑", cls: "you", text: "The column you were chasing is gone.",
                 sub: "Your men stand where the trail ended — order them home", x: m.x, y: m.y, z: 0.55 });
        marches.splice(marches.indexOf(m), 1); continue;
      } else if (!m.lost) { m.lost = true; }
    }
    const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
    const step = marchSpeed(m) * dt;
    if (d > step) { m.x += dx / d * step; m.y += dy / d * step; }
    else {
      m.x = m.tx; m.y = m.ty;
      if (m.kind === "field") { natColumnArrives(m); marches.splice(marches.indexOf(m), 1); continue; }
      if (m.kind === "war") {
        const party = landWarParty(m.nation, m.town, m.invest);
        if (party) SFX.warHorn();
        marches.splice(marches.indexOf(m), 1); continue;
      }
      if (m.kind === "army") {
        if (m.chase) { fieldClash(m, marchById(m.chase)); marches.splice(marches.indexOf(m), 1); continue; }
        arriveArmy(m); marches.splice(marches.indexOf(m), 1); continue;
      }
      if (m.kind === "scout") {
        if (m.state === "march") {
          const cl = worldCell(m.x, m.y);
          m.chartedN = (m.chartedN || 0) + chartAround(cl.mx, cl.my, 4);
          m.state = "return"; m.sx = m.x; m.sy = m.y;
          m.tx = m.home.x; m.ty = m.home.y;
        } else { scoutReport(m); marches.splice(marches.indexOf(m), 1); }
        continue;
      }
      if (m.kind === "spy") {
        const city = cityById(m.target);
        if (!city) { killOperative(m, "The city he was sent to no longer stands"); continue; }
        m.state = "resident"; m.t = 0; m.nation = city.owner;
        intel[city.owner] = { armies: true, arts: true, by: m.id, city: city.id };
        chartAround(city.mx, city.my, 3);
        notify({ icon: "✧", cls: "you", text: `Your agent is established in ${city.name}.`,
                 sub: `The musters and the arts of ${NATIONS[city.owner].name} are open to you — while he lives`,
                 x: m.x, y: m.y, z: zoomFloor() * 3 });
        continue;
      }
    }
    // --- what the men on the road can see, and what can see them ---
    if (m.side === "you") {
      const eye = m.kind === "scout" ? CELL_W * 2.6 * glass() : CELL_W * 1.2;
      for (const o of marches) {
        if (o.side !== "them" || o.spottedBy === m.id) continue;
        if (Math.hypot(o.x - m.x, o.y - m.y) > eye) continue;
        o.spottedBy = m.id; m.spotted = (m.spotted || 0) + 1;
        notify({ icon: "!", cls: "war", text: `A column of ${NATIONS[o.nation].name} is on the road.`,
                 sub: `${o.str} under arms, ${o.kind === "war" ? "bound for your country" : "marching to war"}`,
                 x: o.x, y: o.y, z: zoomFloor() * 2, march: o.id });
      }
      // and a lone rider who blunders into an army does not always ride out again
      if (m.kind === "scout" || m.kind === "spy") {
        for (const o of marches) {
          if (o.side !== "them" || Math.hypot(o.x - m.x, o.y - m.y) > 340) continue;
          if (Math.random() < 0.35 * dt) { killOperative(m, `Ridden down by a column of ${NATIONS[o.nation].name}`); break; }
        }
      }
    } else if (!m.seen && marchVisible(m)) {
      m.seen = true;
      if (m.kind === "war")
        notify({ icon: "⚑", cls: "war", text: `A column of ${NATIONS[m.nation].name} is sighted.`,
                 sub: `Making for ${m.town ? m.town.name : settlementName || "the capital"} — ${leagues(m)} off`,
                 x: m.x, y: m.y, z: zoomFloor() * 2, march: m.id });
    }
  }
}

// ===== the cities go on without you =====
// Rival towns grow, arm themselves, and are ground down by whatever the century
// is doing to their country that decade. Watch one long enough through a spy or
// a scout's charts and you can see which neighbour is becoming a problem.
let cityGrowT = 0;
function updateCities(dt) {
  cityGrowT -= dt;
  if (cityGrowT > 0) return;
  cityGrowT = 12;
  for (const c of CITIES) {
    if (c.fallen) continue;
    const n = NATIONS[c.owner] || NATIONS[c.nation];
    if (!n) continue;
    let g = 0.5 + n.strength * 0.09;
    if (n.calT) g -= 1.6;                      // plague, famine, fire: the town shrinks
    if (n.atWar) g -= 0.4;
    if (n.trade) g += 0.3;
    c.pop = Math.max(1, Math.round((c.pop + g) * 10) / 10);
    if (Math.random() < 0.22) c.garrison = Math.max(1, c.garrison + (g > 0 ? 1 : -1));
    c.wealth = Math.max(10, Math.round(c.wealth + g * 6));
    if (c.siege > 0) c.siege = Math.max(0, c.siege - 0.1);
  }
  refreshCityOwners();                  // borders move; flags follow
  stratDirty = true;
}

// ===== a city is a place, not a number =====
// Every crown's city has always had books — how many souls, how big a garrison,
// what its walls are made of, what is in its treasury — and until now that was
// all it had. Fly to Copenhagen and there was grass.
//
// A city is built out of its own books when something of yours comes near enough
// to make out a building, and folded back into them when nothing is. The numbers
// are the truth that persists; the timber is a view of them. So a spy's report
// of eleven men in the garrison is eleven men at the gate when you get there, and
// burning half the town down is half the town gone from the books afterwards —
// which is the whole point of modelling it rather than drawing a dot.
//
// The alternative was a hundred and nine towns standing at once: four thousand
// buildings, two thousand souls and a save file to match, nearly all of it in
// country no one will visit this reign.
const CITY_LOD_R = CELL_W * 1.4;          // near enough to be worth building
const CITY_LOD_KEEP = CELL_W * 2.2;       // and how far you must go before it is struck

function materialiseCity(c) {
  if (!c || c.fallen || c.town) return c && c.town;
  // Ground your empire has grown over is yours; raising its old garrison inside
  // your own territory would put an enemy company in your fields.
  if (c.owner === "you") return null;
  const q = cityWorld(c);
  // Something already standing on the spot is adopted, never doubled. A town can
  // get here without the city knowing about it — a column that arrived before
  // the camera did, or a save written by a build that did not keep the link —
  // and raising a second Copenhagen inside the first is not recoverable.
  const standing = foreignTowns.find(t => !t.fallen && Math.hypot(t.x - q.x, t.y - q.y) < 60);
  if (standing) { standing.city = c.id; c.town = standing; return standing; }
  const t = landForeignTown(c.owner, { x: q.x, y: q.y, name: c.name, city: c.id, cityRef: c });
  c.town = t;
  return t;
}
// Whoever is standing in it decides whether it may be struck: a town with your
// soldiers in it, or a fire burning, or a siege under way, stays where it is.
function cityBusy(c) {
  const t = c.town;
  if (!t) return false;
  if (t.fallen) return false;
  // A fire is happening now; damage merely happened once. Buildings never heal,
  // so testing hp meant that a single scratched wall pinned the whole town in
  // memory — and in the save — for the rest of the game.
  if (foreign.some(b => b.town === t && b.fire > 0)) return true;
  return civs.some(u => !u.afield && !INDOORS.has(u.state) && Math.hypot(u.x - t.x, u.y - t.y) < CITY_LOD_KEEP);
}
function dematerialiseCity(c) {
  const t = c.town;
  if (!t) return;
  // --- what happened while it stood goes back into the books ---
  // A burned house is not of type "cabin" any more — it is of type "burned" —
  // so the roofs have to be counted against the number the town was RAISED with,
  // which it wrote down at the time. Counting survivors against survivors made
  // every sacking look like nothing had happened.
  const raised = t.houses || 1;
  const standing = foreign.filter(b => b.town === t && b.type === "cabin" && !b.fire).length;
  c.pop = Math.max(1, Math.round(c.pop * (0.35 + 0.65 * Math.min(1, standing / raised)) * 10) / 10);
  // Losses, not survivors. A city of twenty-six men only ever puts twenty on the
  // ground (a hundred men standing in one square is a slideshow, not a siege), so
  // writing back the head count would quietly kill six of them every time the
  // camera passed by.
  const raisedMen = t.garrisonRaised === undefined ? c.garrison : t.garrisonRaised;
  const lost = Math.max(0, raisedMen - raiders.filter(r => r.garrison === t).length);
  c.garrison = Math.max(0, c.garrison - lost);
  c.wealth = Math.max(0, Math.round(t.dm));
  // a town whose walls came down does not have them back the next time you call
  const wallsLeft = foreign.filter(b => b.town === t && WALLLIKE.has(b.type)).length;
  if (c.walls > 0 && wallsLeft < 8) c.walls = Math.max(0, c.walls - 1);
  // --- and the timber comes down ---
  for (let i = foreign.length - 1; i >= 0; i--) if (foreign[i].town === t) foreign.splice(i, 1);
  for (let i = foreignFolk.length - 1; i >= 0; i--) if (foreignFolk[i].town === t) foreignFolk.splice(i, 1);
  for (let i = raiders.length - 1; i >= 0; i--) if (raiders[i].garrison === t) raiders.splice(i, 1);
  const ti = foreignTowns.indexOf(t);
  if (ti >= 0) foreignTowns.splice(ti, 1);
  c.town = null;
  stratDirty = true;
}
// The camera is the only thing that calls a city into being — your own towns and
// columns are on their own errands, and a city built behind a marching scout that
// nobody is looking at is a hundred buildings simulated for nothing.
let cityLodT = 0;
function updateCityLod(dt) {
  cityLodT -= dt;
  if (cityLodT > 0) return;
  cityLodT = 0.75;
  const looking = !onMap() && gameState === "playing";
  const cx = cam.x + canvas.width / 2 / zoom, cy = cam.y + canvas.height / 2 / zoom;
  for (const c of CITIES) {
    if (c.fallen) { if (c.town) dematerialiseCity(c); continue; }
    const q = cityWorld(c);
    const d = Math.hypot(q.x - cx, q.y - cy);
    if (!c.town) { if (looking && d < CITY_LOD_R) materialiseCity(c); continue; }
    if ((!looking || d > CITY_LOD_KEEP) && !cityBusy(c)) dematerialiseCity(c);
  }
}
// on the way back in, re-tie every standing town to the city whose books it keeps
function relinkCityTowns() {
  for (const c of CITIES) c.town = null;
  // First, throw away anything standing on top of something else. Older builds
  // could leave a second and a third town on one site; they are invisible on the
  // map (the markers coincide) and they double the garrison at the gate.
  for (let i = foreignTowns.length - 1; i >= 0; i--) {
    const t = foreignTowns[i];
    const twin = foreignTowns.find((o, j) => j < i && Math.hypot(o.x - t.x, o.y - t.y) < 60);
    if (!twin) continue;
    for (let k = foreign.length - 1; k >= 0; k--) if (foreign[k].town === t) foreign.splice(k, 1);
    for (let k = foreignFolk.length - 1; k >= 0; k--) if (foreignFolk[k].town === t) foreignFolk.splice(k, 1);
    for (let k = raiders.length - 1; k >= 0; k--) if (raiders[k].garrison === t) raiders.splice(k, 1);
    foreignTowns.splice(i, 1);
  }
  for (const t of foreignTowns) {
    let c = t.city ? cityById(t.city) : null;
    // a town with no link is matched to whatever city it is standing on
    if (!c) {
      const cl = worldCell(t.x, t.y);
      c = CITIES.find(x => !x.fallen && x.mx === cl.mx && x.my === cl.my);
      if (c) t.city = c.id;
    }
    if (c && !c.town) c.town = t;
  }
}

// ===== notifications: the world tells you, and takes you there =====
// Everything above happens whether or not you are looking at it. A line of text
// that vanishes in five seconds is not good enough for an army arriving twelve
// leagues away, so word from the field stacks up, waits, and — this is the part
// that matters — carries the coordinates of what it is about. Click it and the
// camera goes.
let notifs = [];
const NOTIF_LIFE = 60, NOTIF_MAX = 5;
function notify(o) {
  // Five war parties out of the same city in the same ten minutes is five
  // identical cards, and the fifth tells you nothing the first did not. The
  // standing one is refreshed and moved to the top instead.
  const twin = notifs.find(p => p.text === o.text && p.sub === o.sub);
  if (twin) {
    twin.t = NOTIF_LIFE;
    Object.assign(twin, { x: o.x, y: o.y, z: o.z, march: o.march });
    notifs = [twin, ...notifs.filter(p => p !== twin)];
    renderNotifs();
    return twin;
  }
  const n = Object.assign({ icon: "•", cls: "", sub: "", t: NOTIF_LIFE, key: notifSeq++ }, o);
  notifs.unshift(n);
  while (notifs.length > NOTIF_MAX) notifs.pop();
  chron(n.cls === "war" || n.cls === "bad" ? "war" : "work", n.sub ? `${n.text} ${n.sub}` : n.text);
  try { SFX.popup(); } catch (e) {}
  renderNotifs();
  return n;
}
let notifSeq = 1;
function renderNotifs() {
  const box = $("notifs");
  if (!box) return;
  box.innerHTML = "";
  for (const n of notifs) {
    const el = document.createElement("div");
    el.className = "notif " + (n.cls || "");
    el.innerHTML = `<span class="ni">${esc(n.icon)}</span><span class="nt"><b>${esc(n.text)}</b>` +
                   (n.sub ? `<i>${esc(n.sub)}</i>` : "") + `</span><span class="nx">&times;</span>`;
    el.querySelector(".nx").addEventListener("click", e => {
      e.stopPropagation();
      notifs = notifs.filter(o => o !== n); renderNotifs();
    });
    el.addEventListener("click", () => {
      const m = n.march ? marchById(n.march) : null;      // follow the column, not the memory
      const x = m ? m.x : n.x, y = m ? m.y : n.y;
      if (x === undefined) return;
      flyTo(x, y, n.z || zoomFloor() * 2);
      notifs = notifs.filter(o => o !== n); renderNotifs();
    });
    box.appendChild(el);
  }
  box.style.display = notifs.length ? "flex" : "none";
}
function updateNotifs(dt) {
  if (!notifs.length) return;
  let drop = false;
  for (const n of notifs) if ((n.t -= dt) <= 0) drop = true;
  if (drop) { notifs = notifs.filter(n => n.t > 0); renderNotifs(); }
}

// ===== the camera's own journey =====
// Auto-panning that snaps is disorienting: you arrive without knowing which way
// you came, which defeats the point of having one continuous map. It flies, and
// it flies through the zoom as well as across the ground, so the ascent and the
// descent read as one movement.
let flight = null;
function flyTo(x, y, z, secs = 1.0) {
  const z1 = Math.max(zoomFloor(), Math.min(2.4, z || zoom));
  flight = { x0: cam.x + canvas.width / 2 / zoom, y0: cam.y + canvas.height / 2 / zoom, z0: zoom,
             x1: x, y1: y, z1, t: 0, d: Math.max(0.2, secs) };
}
function updateFlight(dt) {
  if (!flight) return;
  flight.t += dt;
  const k = clamp01(flight.t / flight.d);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // ease in and out
  // interpolate the zoom in log space, or the middle of a long flight is a lurch
  const z = Math.exp(Math.log(flight.z0) + (Math.log(flight.z1) - Math.log(flight.z0)) * e);
  const cx = flight.x0 + (flight.x1 - flight.x0) * e;
  const cy = flight.y0 + (flight.y1 - flight.y0) * e;
  zoom = z;
  cam.x = cx - canvas.width / 2 / zoom;
  cam.y = cy - canvas.height / 2 / zoom;
  if (k >= 1) flight = null;
}
const cancelFlight = () => { flight = null; };

// ===== drawing the country =====
// The same raster the old MAP screen drew, only now it is laid down in world
// coordinates underneath the colony instead of in a window beside it. It is
// rebuilt only when something on it actually changes — a border moving, a town
// founded, a city sacked — because at two hundred by a hundred and twelve pixels
// it is cheap to make and ruinous to make every frame.
let stratBuf = null, stratDirty = true;
function buildStratBuf() {
  if (!fineGrid || !mapGrid) buildMapGrid();
  if (!stratBuf) { stratBuf = document.createElement("canvas"); stratBuf.width = FW; stratBuf.height = FH; }
  const g = stratBuf.getContext("2d");
  const mine = empireCells();
  const img = g.createImageData(FW, FH);
  const px = img.data, myCol = hexRGB(territoryColor);
  const coarse = i => Math.floor(i / SCALE);
  const eidAt = (cc, rr) => {
    if (cc < 0 || rr < 0 || cc >= FW || rr >= FH) return 0;
    const nid = fineGrid[rr * FW + cc];
    if (nid !== 0 && mine.has(coarse(cc) + "," + coarse(rr))) return 255;
    return nid;
  };
  for (let r = 0; r < FH; r++) for (let c = 0; c < FW; c++) {
    const i = r * FW + c, eid = eidAt(c, r);
    const base = eid === 255 ? myCol : FID_RGB[fineGrid[i]];
    let f = 0.92 + vnoise(c * 1.4, r * 1.4, 7) * 0.12;
    if (eid !== 0 && (eidAt(c - 1, r) !== eid || eidAt(c + 1, r) !== eid ||
                      eidAt(c, r - 1) !== eid || eidAt(c, r + 1) !== eid)) f *= 0.42;
    px[i * 4] = base[0] * f; px[i * 4 + 1] = base[1] * f; px[i * 4 + 2] = base[2] * f; px[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  stratDirty = false;
}
function buildFogBuf() {
  if (!fogBuf) { fogBuf = document.createElement("canvas"); fogBuf.width = MG_W; fogBuf.height = MG_H; }
  const g = fogBuf.getContext("2d");
  g.clearRect(0, 0, MG_W, MG_H);
  g.fillStyle = "#080c0a";
  for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++)
    if (!charted.has(ckey(c, r))) g.fillRect(c, r, 1, 1);
  fogDirty = false;
}
// the country itself, drawn in world space under everything
function drawStratGround(amt) {
  if (stratDirty) buildStratBuf();
  if (fogDirty) buildFogBuf();
  ctx.save();
  ctx.globalAlpha = amt;
  // the ocean, out past the edge of the paper
  ctx.fillStyle = "#16303f";
  ctx.fillRect(cam.x - 10, cam.y - 10, canvas.width / zoom + 20, canvas.height / zoom + 20);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stratBuf, 0, 0, FW, FH, MAP_X0, MAP_Y0, MAP_W, MAP_H);
  // the blanks on the paper: soft, because the edge of what you know is not a
  // straight line, and because a grid of hard black squares looks like a bug
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = amt * 0.96;
  ctx.drawImage(fogBuf, 0, 0, MG_W, MG_H, MAP_X0, MAP_Y0, MAP_W, MAP_H);
  ctx.imageSmoothingEnabled = false;
  ctx.restore();
}

// ===== the marks on it: names, towns, columns =====
// Drawn in screen space, not world space, so a city's name is the same size to
// read whether you are looking at one duchy or at the whole continent.
const SX = wx => (wx - cam.x) * zoom, SY = wy => (wy - cam.y) * zoom;
let mapSelCity = null, mapSelMarch = null, mapHover = null;
function cityDotR(c) { return Math.max(2.5, Math.min(9, 2.2 + Math.sqrt(c.pop) * 0.7)); }
function drawStratMarks(amt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.globalAlpha = amt;
  ctx.textAlign = "center";
  const W = canvas.width, H = canvas.height;
  const vis = (x, y, pad = 70) => x > -pad && x < W + pad && y > -pad && y < H + pad;
  const cellPx = CELL_W * zoom;                 // how many screen pixels a league-square is

  // --- the names of the crowns, while there is room for them ---
  if (cellPx < 42) {
    ctx.font = "bold 13px 'Courier New', monospace";
    for (const [name, mx, my] of LABELS) {
      if (!isCharted(Math.round(mx), Math.round(my))) continue;
      const p = cellWorld(mx, my), x = SX(p.x), y = SY(p.y);
      if (!vis(x, y)) continue;
      const lines = name.split("\n");
      lines.forEach((ln, i) => {
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(ln, x + 1, y + 1 + i * 12);
        ctx.fillStyle = "rgba(232,236,234,0.82)"; ctx.fillText(ln, x, y + i * 12);
      });
      // and, once there is room under it, what the crown is actually worth
      if (cellPx > 15) {
        const id = mapGrid[Math.round(my)] && mapGrid[Math.round(my)][Math.round(mx)];
        const n = id && NATIONS[id];
        if (n && !n.defeated) {
          const bits = [`str ${natStrength(n)}/10`];
          if (knowsArmies(id)) bits.push(nationCities(id).reduce((t, c) => t + c.garrison, 0) + " men");
          if (n.atWar) bits.push("AT WAR");
          else if (n.trade) bits.push("trading");
          if (n.calT) bits.push(String(n.calName || "stricken").toLowerCase());
          const sy2 = y + lines.length * 12;
          ctx.font = "9px 'Courier New', monospace";
          ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(bits.join(" · "), x + 1, sy2 + 1);
          ctx.fillStyle = n.atWar ? "rgba(216,106,90,0.9)" : "rgba(154,176,162,0.8)";
          ctx.fillText(bits.join(" · "), x, sy2);
          ctx.font = "bold 13px 'Courier New', monospace";
        }
      }
    }
  }

  // --- the cities of Europe ---
  // At continental height a hundred and nine names on top of each other is not
  // a map, it is a smear. The capitals keep their names all the way out; the
  // rest earn theirs back as you come down, and any city under the pointer or
  // picked out of the panel is named whatever the height.
  const NAME_ALL = 26, NAME_CAPS = 9;
  const dotK = Math.max(0.5, Math.min(1, cellPx / NAME_ALL));
  for (const c of CITIES) {
    if (c.fallen || !isCharted(c.mx, c.my)) continue;
    if (c.town) continue;               // it is standing in timber below; drawn as a town
    const p = cityWorld(c), x = SX(p.x), y = SY(p.y);
    if (!vis(x, y, 40)) continue;
    const showNames = cellPx > NAME_ALL || (c.cap && cellPx > NAME_CAPS);
    const n = NATIONS[c.owner];
    const r = cityDotR(c) * (c.cap ? 1.3 : 1) * dotK;
    const sel = mapSelCity === c.id, hov = mapHover && mapHover.kind === "city" && mapHover.ref === c;
    ctx.fillStyle = "#0a0f0c";
    ctx.beginPath(); ctx.arc(x, y, r + 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = c.owner === "you" ? territoryColor : c.siege > 0 ? "#d86a5a" : (n ? n.color : "#8a8a8a");
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (c.cap) { ctx.strokeStyle = "#e8d9b8"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r + 2.6, 0, 7); ctx.stroke(); }
    if (sel || hov) {
      ctx.strokeStyle = sel ? "#ffe9b0" : "#9ab0a2"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, r + 5.5, 0, 7); ctx.stroke();
    }
    if (showNames || sel || hov) {
      ctx.font = (c.cap ? "bold " : "") + "10px 'Courier New', monospace";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(4,7,5,0.9)";
      ctx.strokeText(c.name, x, y - r - 4);
      ctx.fillStyle = c.cap ? "#e8d9b8" : "#b9c7bd";
      ctx.fillText(c.name, x, y - r - 4);
      // Close enough in to read a town's books off the map itself: its size,
      // and — only if you have an agent in that country — its garrison.
      if (cellPx > 44 || sel || hov) {
        const stat = `${thousands(c.pop)}` +
          (c.owner === "you" ? " · yours" : knowsArmies(c.owner) ? ` · ${c.garrison} men` : " · ? men");
        ctx.font = "9px 'Courier New', monospace";
        ctx.strokeText(stat, x, y + r + 11);
        ctx.fillStyle = c.siege > 0 ? "#d86a5a" : "#8fa397";
        ctx.fillText(stat, x, y + r + 11);
      }
    }
  }

  // --- your own towns, always lit ---
  const mine = [{ x: CAPITAL_X, y: CAPITAL_Y, name: settlementName || "Neu Hamburg", cap: true }];
  for (const st of settlements) if (st.x !== undefined) mine.push({ x: st.x, y: st.y, name: st.name });
  for (const t of mine) {
    const x = SX(t.x), y = SY(t.y);
    if (!vis(x, y, 40)) continue;
    ctx.fillStyle = "#0a0f0c"; ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = "#ffe9b0"; ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(4,7,5,0.9)";
    ctx.strokeText(t.name, x, y - 8); ctx.fillStyle = "#ffe9b0"; ctx.fillText(t.name, x, y - 8);
  }
  // and the enemy border towns actually standing on your ground
  for (const ft of foreignTowns) {
    if (ft.fallen) continue;
    const x = SX(ft.x), y = SY(ft.y);
    if (!vis(x, y, 40)) continue;
    ctx.fillStyle = "#0a0f0c"; ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = "#d86a5a"; ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    ctx.font = "10px 'Courier New', monospace";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(4,7,5,0.9)";
    ctx.strokeText(ft.name, x, y - 8); ctx.fillStyle = "#d86a5a"; ctx.fillText(ft.name, x, y - 8);
  }

  // --- the columns on the road ---
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 320);
  for (const m of marches) {
    if (m.state === "resident") continue;
    if (!marchVisible(m)) continue;
    const x = SX(m.x), y = SY(m.y);
    const yours = m.side === "you";
    const col = yours ? (m.kind === "scout" ? "#8fd3c0" : m.kind === "spy" ? "#c6a0d8" : "#ffe9b0") : "#d86a5a";
    // the road still to walk
    const tx = SX(m.tx), ty = SY(m.ty);
    if (vis(x, y, 200) || vis(tx, ty, 200)) {
      ctx.save();
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
      ctx.strokeStyle = yours ? "rgba(255,233,176,0.5)" : "rgba(216,106,90,0.5)";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.restore();
    }
    if (!vis(x, y, 30)) continue;
    // a little pennant, leaning the way it is going
    const a = Math.atan2(m.ty - m.y, m.tx - m.x);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = "#0a0f0c"; ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(5.5, 0); ctx.lineTo(-3.6, -3.6); ctx.lineTo(-3.6, 3.6); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (!yours) { ctx.globalAlpha = amt * pulse; ctx.strokeStyle = "#d86a5a"; ctx.lineWidth = 1.2;
                  ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke(); ctx.globalAlpha = amt; }
    if (mapSelMarch === m.id) {
      ctx.strokeStyle = "#ffe9b0"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke();
    }
    if (cellPx > 14 || mapHover && mapHover.ref === m) {
      ctx.font = "9px 'Courier New', monospace";
      const lbl = yours ? (m.kind === "scout" ? "scout" : m.kind === "spy" ? "agent" : `${(m.men || []).length || m.str} men`)
                        : `${m.str} men`;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(4,7,5,0.9)";
      ctx.strokeText(lbl, x, y + 16); ctx.fillStyle = col; ctx.fillText(lbl, x, y + 16);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
// ===== a column, close to =====
// Out at map height a march is a pennant on a chart. Down among the trees it
// ought to be what it actually is: a rider picking his way across country, or a
// company of men on the road. The same object, drawn at the scale you happen to
// be looking at it from — which is the whole point of there being one map.
//
// The figures are arranged around the column's own point and walk in the
// direction it is travelling, so a company reads as a company and not as one man
// standing in for five.
const MARCH_LOOK = {
  scout: { who: "hunter", n: 1, spread: 0 },
  spy:   { who: "brother", n: 1, spread: 0 },
  army:  { who: "soldierU", n: 5, spread: 46 },
  war:   { who: "foe", n: 4, spread: 44 },
  field: { who: "foe", n: 4, spread: 44 },
};
// the same coat the crown's war parties wear on your own ground
function marchFrame(m, look, f) {
  if (look.who === "foe") {
    const crown = NATIONS[m.nation];
    return crown ? foeCoat(crown.color, "soldierU" + f) : img["hunter" + f];
  }
  if (look.who === "soldierU") return coatOf("soldierU" + f);
  return img[look.who + f];
}
function marchDrawables(out) {
  // render()'s own inView is a local, and this runs outside it: the same test,
  // written out, rather than reaching for something that is not in scope
  const vw = canvas.width / zoom, vh = canvas.height / zoom;
  const inSight = (x, y) => x > cam.x - 140 && x < cam.x + vw + 140 &&
                            y > cam.y - 160 && y < cam.y + vh + 180;
  for (const m of marches) {
    if (m.state === "resident") continue;             // he is indoors, in their capital
    if (!marchVisible(m)) continue;
    const look = MARCH_LOOK[m.kind] || MARCH_LOOK.army;
    // a column of yours is exactly as many men as are actually in it
    const n = m.kind === "army" ? Math.max(1, Math.min(8, (m.men || []).length)) : look.n;
    const ang = Math.atan2(m.ty - m.y, m.tx - m.x);
    const face = Math.cos(ang) < 0 ? -1 : 1;
    const step = (worldT * 6 + m.id * 1.7);
    for (let i = 0; i < n; i++) {
      // strung out along the line of march, two abreast
      const back = (i >> 1) * look.spread, side = (i % 2 ? 1 : -1) * (look.spread ? 15 : 0);
      const x = m.x - Math.cos(ang) * back - Math.sin(ang) * side;
      const y = m.y - Math.sin(ang) * back * 0.7 + Math.cos(ang) * side * 0.7;
      if (!inSight(x, y)) continue;
      out.push({ y, draw: () => {
        const f = Math.floor(step + i * 0.9) % 4;
        const im = marchFrame(m, look, f);
        if (im) drawSprite(im, x, y, CHAR_SIZE, face < 0);
        if (i === 0 && settings.labels) {
          ctx.font = "10px monospace"; ctx.textAlign = "center";
          ctx.fillStyle = m.side === "you" ? "#ffe9b0" : "#d86a5a";
          ctx.fillText(m.kind === "scout" ? "scout" : m.kind === "spy" ? "agent"
                       : m.side === "you" ? `${(m.men || []).length} of yours`
                       : `${NATIONS[m.nation] ? NATIONS[m.nation].name : "?"}`,
                       x, y - CHAR_SIZE * 0.9);
        }
      }});
    }
  }
}

function renderStrategicOnly() {
  ctx.setTransform(zoom, 0, 0, zoom, -cam.x * zoom, -cam.y * zoom);
  ctx.imageSmoothingEnabled = false;
  drawStratGround(1);
  drawStratMarks(1);
}

// ===== reading the map with the pointer =====
// A city is a five-pixel dot at continental zoom. Picking one has to be forgiving,
// and it has to say what it found before you commit to clicking it — you should
// never have to click a foreign capital to discover it is a foreign capital.
function worldPick(sx, sy) {
  let best = null, bd = 18;
  const test = (wx, wy, o) => { const d = Math.hypot(SX(wx) - sx, SY(wy) - sy); if (d < bd) { bd = d; best = o; } };
  for (const c of CITIES) {
    if (c.fallen || !isCharted(c.mx, c.my)) continue;
    const p = cityWorld(c); test(p.x, p.y, { kind: "city", ref: c });
  }
  for (const m of marches) {
    if (m.state === "resident" || !marchVisible(m)) continue;
    test(m.x, m.y, { kind: "march", ref: m });
  }
  test(CAPITAL_X, CAPITAL_Y, { kind: "town", ref: null, name: settlementName || "Neu Hamburg" });
  for (const st of settlements) if (st.x !== undefined) test(st.x, st.y, { kind: "town", ref: st, name: st.name });
  for (const ft of foreignTowns) if (!ft.fallen) test(ft.x, ft.y, { kind: "ftown", ref: ft, name: ft.name });
  return best;
}
const thousands = p => (p >= 1 ? Math.round(p) : 1) + ",000";
const WALL_WORD = ["open", "palisaded", "walled", "bastioned"];
// what a city will tell a stranger, and what it will only tell an agent
function cityLines(c) {
  const n = NATIONS[c.owner], out = [];
  out.push(c.owner === "you" ? `Yours${c.cap ? " · once their capital" : ""}`
                             : `${n ? n.name : "—"}${c.cap ? " · capital" : ""}`);
  if (c.owner !== c.nation && NATIONS[c.nation]) out.push(`Built by ${NATIONS[c.nation].name} — taken since`);
  out.push(`${thousands(c.pop)} souls · ${WALL_WORD[Math.min(3, c.walls)]}`);
  if (c.owner === "you") out.push("Its people pay your taxes now");
  else if (knowsArmies(c.owner)) out.push(`Garrison ${c.garrison} · ${c.wealth} DM in the treasury`);
  else out.push("Garrison unknown — no agent in their country");
  if (knowsArts(c.owner)) out.push("Arts: " + nationArts(c.owner).join(", "));
  if (n && n.atWar) out.push("AT WAR WITH YOU");
  else if (n && n.trade) out.push("A trade route is open");
  if (n && n.calT) out.push(`Stricken by ${n.calName}`);
  if (c.siege > 0) out.push("Under siege");
  return out;
}
function marchLines(m) {
  const out = [];
  if (m.side === "you") {
    out.push(m.kind === "scout" ? "Your scout" : m.kind === "spy" ? "Your agent" : `Your column — ${(m.men || []).length} under arms`);
    out.push(`${Math.round(marchProgress(m) * 100)}% of the way · ${leagues(m)} to go`);
    if (m.state === "return") out.push("Riding home");
  } else {
    out.push(`Column of ${NATIONS[m.nation] ? NATIONS[m.nation].name : "?"}`);
    out.push(knowsArmies(m.nation) ? `${m.str} under arms` : "Strength uncertain");
    out.push(m.kind === "war" ? `Bound for ${m.town ? m.town.name : settlementName || "the capital"}`
                              : "Marching to a war of their own");
  }
  return out;
}
function worldTipSync(sx, sy) {
  const tip = $("worldTip");
  if (!tip) return;
  if (!onMap() || buildMode || roadMode) { tip.style.display = "none"; mapHover = null; return; }
  const hit = worldPick(sx, sy);
  mapHover = hit;
  if (!hit) { tip.style.display = "none"; return; }
  let title = "", lines = [];
  if (hit.kind === "city") { title = hit.ref.name; lines = cityLines(hit.ref); }
  else if (hit.kind === "march") { title = "On the road"; lines = marchLines(hit.ref); }
  else if (hit.kind === "ftown") {
    title = hit.name;
    const n = NATIONS[hit.ref.nation];
    lines = [`Border town of ${n ? n.name : "?"}`, "Its town hall is the prize — burn it and the town is yours"];
  } else {
    const st = hit.ref;
    title = hit.name;
    const pop = st ? st.pop : civs.filter(c => !c.afield).length;
    lines = [st ? "A town of your empire" : "Your capital", `${pop} souls`];
  }
  tip.innerHTML = `<b>${esc(title)}</b>` + lines.map(l => `<i>${esc(l)}</i>`).join("");
  tip.style.display = "block";
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - r.width - 10, sx + 16) + "px";
  tip.style.top = Math.min(window.innerHeight - r.height - 10, Math.max(8, sy + 14)) + "px";
}

// ===== the world panel: diplomacy, and now the operations too =====
let scoutArmed = false;
function selectCity(c) {
  mapSelCity = c ? c.id : null; mapSelMarch = null;
  if (c) mapSelNation = c.owner === "you" ? null : c.owner;
  worldPanelOpen(!!c || !!mapSelNation);
  mapInfoSync();
}
function selectMarch(m) {
  mapSelMarch = m ? m.id : null; mapSelCity = null;
  mapSelNation = m && m.side === "them" ? m.nation : null;
  worldPanelOpen(!!m);
  mapInfoSync();
}
function worldPanelOpen(on) {
  const p = $("mapInfo");
  if (!p) return;
  p.style.display = on ? "block" : "none";
  if (!on) { mapSelCity = null; mapSelMarch = null; mapSelNation = null; }
}
// the extra half of the panel that the old overlay never had
function citySync() {
  const box = $("miCity");
  if (!box) return;
  const c = mapSelCity ? cityById(mapSelCity) : null;
  const march = $("miMarch"), agent = $("miAgent"), scout = $("miScout"),
        rec = $("miRecall"), cut = $("miIntercept");
  if (cut) cut.style.display = "none";
  // a column picked out of the map: the only thing to decide is whether to
  // stand in its way, and with how many
  const sel = mapSelMarch ? marchById(mapSelMarch) : null;
  if (!c && sel) {
    box.style.display = "block";
    box.innerHTML = `<div class="miCityName">${esc(sel.side === "you" ? "Your column" : "A column on the road")}</div>` +
                    marchLines(sel).map(l => `<div class="miCityLine">${esc(l)}</div>`).join("");
    for (const b of [march, agent, scout, rec]) if (b) b.style.display = "none";
    const n = sel.side === "them" ? NATIONS[sel.nation] : null;
    const force = civs.filter(cc => !cc.afield && isForce(cc) && cc.profession !== "police").length;
    if (cut && n && n.atWar) {
      cut.style.display = "block";
      cut.textContent = `Ride to cut them off (${force} ready)`;
    }
    return;
  }
  if (!c) {
    box.style.display = "none";
    for (const b of [march, agent, scout, rec]) if (b) b.style.display = "none";
    return;
  }
  box.style.display = "block";
  box.innerHTML = `<div class="miCityName">${esc(c.name)}</div>` +
                  cityLines(c).map(l => `<div class="miCityLine">${esc(l)}</div>`).join("");
  const n = NATIONS[c.owner];
  const force = civs.filter(cc => !cc.afield && isForce(cc) && cc.profession !== "police").length;
  if (march) {
    march.style.display = n && n.atWar ? "block" : "none";
    march.textContent = `March on ${c.name} (${force} ready)`;
  }
  if (agent) {
    agent.style.display = TECH.cipher.done && c.owner !== "you" && !knowsArmies(c.owner) ? "block" : "none";
    agent.textContent = `Send an agent to ${c.name} (${SPY_COST} DM)`;
  }
  if (scout) {
    scout.style.display = TECH.surveying.done ? "block" : "none";
    scout.textContent = `Send a scout toward ${c.name} (${SCOUT_COST} DM)`;
  }
  if (rec) {
    // an army left standing in a foreign town is an army you have mislaid
    const q = cityWorld(c);
    const there = civs.filter(cc => !cc.afield && isForce(cc) && Math.hypot(cc.x - q.x, cc.y - q.y) < 1200).length;
    rec.style.display = there ? "block" : "none";
    rec.textContent = `Order ${there} home from ${c.name}`;
  }
}
const SCOUT_COST = 10, SPY_COST = 30;

// the click that lands on the country rather than on the grass
function worldMapClick(sx, sy) {
  if (scoutArmed) {
    scoutArmed = false;
    stratBarSync();
    const wx = cam.x + sx / zoom, wy = cam.y + sy / zoom;
    if (res.dm - SCOUT_COST < treasuryFloor()) return toast(`A scout wants ${SCOUT_COST} DM for the road.`);
    res.dm -= SCOUT_COST;
    sendScout(wx, wy, null);
    syncUI();
    return true;
  }
  const hit = worldPick(sx, sy);
  if (!hit) {
    // Through the dissolve the town is still down there and still yours to
    // order about: a click on empty ground goes back to the world unless the
    // country has taken the screen over completely.
    if (stratAmt() < 0.8) return false;
    // bare ground: whose country is it?
    const cl = worldCell(cam.x + sx / zoom, cam.y + sy / zoom);
    if (!isCharted(cl.mx, cl.my)) { worldPanelOpen(false); return true; }
    const id = mapGrid && mapGrid[cl.my] ? mapGrid[cl.my][cl.mx] : null;
    if (!id || id === "wilds") { worldPanelOpen(false); return true; }
    mapSelCity = null; mapSelNation = id;
    worldPanelOpen(true); mapInfoSync();
    return true;
  }
  if (hit.kind === "city") {
    selectCity(hit.ref);
    const p = cityWorld(hit.ref);
    flyTo(p.x, p.y, Math.max(zoomFloor(), Math.min(zoom * 2.2, 0.09)), 0.8);
    return true;
  }
  if (hit.kind === "march") {
    const m = hit.ref;
    selectMarch(m);
    flyTo(m.x, m.y, Math.max(zoomFloor(), Math.min(zoom * 2, 0.12)), 0.7);
    return true;
  }
  // one of yours, or one of theirs standing on your ground: go and look at it
  const t = hit.kind === "ftown" ? hit.ref : (hit.ref || { x: CAPITAL_X, y: CAPITAL_Y });
  worldPanelOpen(false);
  flyTo(t.x, t.y, 0.55, 1.1);
  return true;
}

// ===== the bar along the bottom: how high you are, and how high you may go =====
function stratBarSync() {
  const bar = $("stratBar");
  if (!bar) return;
  if (!onMap()) { bar.style.display = "none"; scoutArmed = false; return; }
  bar.style.display = "flex";
  const cellPx = CELL_W * zoom;
  const across = Math.round(canvas.width / cellPx);
  const next = nextZoomTier();
  const atFloor = zoom <= zoomFloor() * 1.02;
  $("sbScale").textContent = `${across} league(s) across · ${charted.size} charted`;
  $("sbNext").textContent = next
    ? (atFloor ? `The eye can rise no further — research ${TECH[next.tech].name} to see ${next.what}.`
               : `${TECH[next.tech].name} would open ${next.what}.`)
    : "The whole of Europe lies open.";
  const sb = $("sbScout");
  if (sb) {
    sb.style.display = TECH.surveying.done ? "inline-block" : "none";
    sb.classList.toggle("armed", scoutArmed);
    sb.textContent = scoutArmed ? "◈ CLICK A PLACE" : `◈ SCOUT (${SCOUT_COST} DM)`;
  }
}

// ===== putting men on the road =====
let marchTarget = null, marchChase = null;
function openMarchModal(target) {
  const men = civs.filter(c => !c.afield && isForce(c) && c.profession !== "police" && !c.rebel);
  if (men.length < 4) return toast("A column needs at least 4 fighting men — soldiers, line infantry or cavalry.");
  const city = target.mx !== undefined ? target : null;
  marchTarget = city ? city.id : null;
  marchChase = city ? null : target.id;
  const list = $("marchList");
  list.innerHTML = "";
  men.forEach(c => {
    const i = civs.indexOf(c);
    const row = document.createElement("label");
    row.style.cssText = "display:flex;gap:8px;align-items:center;margin:3px 0;cursor:pointer;font-size:12px";
    row.innerHTML = `<input type="checkbox" checked data-idx="${i}"> ${esc(c.name)} — ${esc(profLabel(c.profession))}` +
                    (c.armed ? "" : " (unarmed)");
    list.appendChild(row);
  });
  const q = city ? cityWorld(city) : { x: target.x, y: target.y };
  const lg = Math.max(1, Math.round(Math.hypot(q.x - CAPITAL_X, q.y - CAPITAL_Y) / CELL_W));
  $("marchWhere").textContent = city
    ? `${city.name} lies ${lg} league(s) off. They will be on the road for a while, and you can watch them ` +
      `the whole way. Nothing defends the colony while they are gone.`
    : `They are ${lg} league(s) out and moving. Your column will steer at them as long as it can see them — ` +
      `and if they slip out of sight, the trail goes cold where it ends.`;
  $("marchTitle").textContent = city ? "MARCH ON " + city.name.toUpperCase() : "CUT THEM OFF";
  $("marchModal").style.display = "block";
  paused = true;
}
function closeMarchModal() {
  $("marchModal").style.display = "none";
  marchTarget = null; marchChase = null;
  setPause(pauseOpen);
}

// ===== the world's own tick =====
function updateWorld(dt) {
  if (!CITIES.length) buildCities();
  updateCharting(dt);
  updateMarches(dt);
  updateCities(dt);
  updateCityLod(dt);
  updateNotifs(dt);
}

// ===== what the world writes down =====
// The charted country is five and a half thousand cells; as a list of "12,7"
// strings it was thirty kilobytes of the save all by itself. It goes down as a
// bitmap instead — one bit a cell, seven hundred bytes, and the same answer.
// A bitmap of it is seven hundred bytes whether you have charted three cells or
// five thousand, and what is actually being described is a blot that grows
// outward from one point — which is to say, a handful of long runs. It goes down
// as run lengths instead, alternating blank and charted from the top-left
// corner: fourteen numbers for a new colony, four hundred for the whole of
// Europe, against a flat nine hundred and thirty-six either way.
const CHART_BITS = MG_W * MG_H;
function chartedPack() {
  const runs = [];
  let cur = 0, n = 0;
  for (let i = 0; i < CHART_BITS; i++) {
    const bit = charted.has(ckey(i % MG_W, Math.floor(i / MG_W))) ? 1 : 0;
    if (bit === cur) n++;
    else { runs.push(n); cur = bit; n = 1; }
  }
  runs.push(n);
  return runs;
}
function chartedUnpack(packed) {
  charted.clear(); fogDirty = true;
  if (!packed) return;
  if (Array.isArray(packed)) {
    let i = 0, cur = 0;
    for (const n of packed) {
      if (cur) for (let k = 0; k < n && i + k < CHART_BITS; k++) {
        const j = i + k;
        charted.add(ckey(j % MG_W, Math.floor(j / MG_W)));
      }
      i += n; cur ^= 1;
    }
    return;
  }
  // a save from the bitmap draft, kept readable rather than thrown away
  try {
    const s = atob(packed);
    for (let i = 0; i < CHART_BITS; i++)
      if (s.charCodeAt(i >> 3) & (1 << (i & 7))) charted.add(ckey(i % MG_W, Math.floor(i / MG_W)));
  } catch (e) {}
}
function worldSave(ci) {
  const si = t => (t ? settlements.indexOf(t) : -1);
  return {
    chart: chartedPack(),
    // A hundred and nine cities written out with their names came to a third of
    // the whole save. They go down as bare numbers in generation order, which is
    // deterministic, and the count is checked on the way back in: if it does not
    // match — a new city added to some crown in a later build — the lot is
    // discarded and Europe starts the run again rather than reading wrong.
    cities: CITIES.map(c => [Math.round(c.pop), c.garrison, c.wealth]),
    fallen: CITIES.map((c, i) => c.fallen ? i : -1).filter(i => i >= 0),
    marches: marches.map(m => ({
      id: m.id, side: m.side, kind: m.kind, nation: m.nation, state: m.state,
      x: r1(m.x), y: r1(m.y), sx: r1(m.sx), sy: r1(m.sy), tx: r1(m.tx), ty: r1(m.ty),
      str: m.str, t: r1(m.t || 0), target: m.target, name: m.name, seen: m.seen || undefined,
      invest: m.invest || undefined, homeward: m.homeward || undefined, chase: m.chase || undefined,
      town: si(m.town), home: m.home, chartedN: m.chartedN || undefined, spotted: m.spotted || undefined,
      men: m.men ? m.men.map(ci).filter(i => i >= 0) : undefined,
    })),
    intel: Object.fromEntries(Object.entries(intel).map(([k, v]) => [k, { armies: v.armies, arts: v.arts, by: v.by, city: v.city }])),
    seq: marchSeq,
  };
}
// a colony begun from nothing knows nothing: only the ground it can see, plus
// whatever atlas its technologies have already paid for (none, at the start)
function worldNewGame() {
  marches = []; notifs = []; flight = null; mapSelCity = null; mapSelMarch = null;
  mapSelNation = null; scoutArmed = false; marchSeq = 1;
  for (const k of Object.keys(intel)) delete intel[k];
  for (const c of civs) c.afield = false;
  CITIES = []; buildMapGrid(); buildCities(); relinkCityTowns();
  charted.clear(); fogDirty = true; stratDirty = true;
  chartAround(EMPIRE_HOME.mx, EMPIRE_HOME.my, atlasR());
  worldPanelOpen(false); renderNotifs(); stratBarSync();
}
function worldLoad(d) {
  marches = []; notifs = []; flight = null; mapSelCity = null; mapSelMarch = null; scoutArmed = false;
  for (const k of Object.keys(intel)) delete intel[k];
  buildCities();
  chartedUnpack(d && d.chart);
  if (!charted.size) chartAround(EMPIRE_HOME.mx, EMPIRE_HOME.my, atlasR());
  // the numbers are positional, so a save whose Europe had a different number of
  // cities in it — or one written before they were numbers at all — is not read
  if (d && d.cities && d.cities.length === CITIES.length && typeof d.cities[0][0] === "number") {
    d.cities.forEach(([pop, gar, wealth], i) => {
      const c = CITIES[i];
      c.pop = pop; c.garrison = gar; c.wealth = wealth; c.fallen = false;
    });
    for (const i of (d.fallen || [])) if (CITIES[i]) CITIES[i].fallen = true;
  }
  if (d && d.marches) for (const m of d.marches) {
    const men = (m.men || []).map(i => civs[i]).filter(Boolean);
    for (const c of men) c.afield = true;
    marches.push(Object.assign({}, m, {
      men: men.length ? men : null,
      town: m.town >= 0 ? settlements[m.town] : null,
      home: m.home || { x: CAPITAL_X, y: CAPITAL_Y },
    }));
  }
  if (d && d.intel) for (const [k, v] of Object.entries(d.intel)) intel[k] = { ...v };
  relinkCityTowns();
  marchSeq = (d && d.seq) || marches.reduce((n, m) => Math.max(n, m.id + 1), 1);
  // an agent whose march was lost in an old save has nobody keeping his secret
  for (const [k, v] of Object.entries(intel)) {
    const by = marchById(v.by);
    if (!by || by.kind !== "spy") delete intel[k];
  }
  stratDirty = true; fogDirty = true;
  renderNotifs(); stratBarSync();
}
// ===== the buttons that put men on the road =====
$("miClose").addEventListener("click", () => worldPanelOpen(false));
$("miMarch").addEventListener("click", () => {
  const c = cityById(mapSelCity);
  if (!c) return;
  const n = NATIONS[c.owner];
  if (!n || !n.atWar) return toast(`You are not at war with ${n ? n.name : "them"}.`);
  openMarchModal(c);
});
$("miAgent").addEventListener("click", () => {
  const c = cityById(mapSelCity);
  if (!c) return;
  if (!TECH.cipher.done) return toast("Research Ciphers before sending anyone into a foreign court.");
  if (marches.some(m => m.kind === "spy" && m.nation === c.owner))
    return toast(`You already have an agent bound for ${NATIONS[c.owner].name}.`);
  if (res.dm - SPY_COST < treasuryFloor()) return toast(`An agent wants ${SPY_COST} DM for the journey and a purse to spend.`);
  res.dm -= SPY_COST;
  sendSpy(c);
  worldPanelOpen(false); syncUI();
});
$("miScout").addEventListener("click", () => {
  const c = cityById(mapSelCity);
  if (!c) return;
  if (!TECH.surveying.done) return toast("Research Surveying before training scouts.");
  if (res.dm - SCOUT_COST < treasuryFloor()) return toast(`A scout wants ${SCOUT_COST} DM for the road.`);
  res.dm -= SCOUT_COST;
  const q = cityWorld(c);
  sendScout(q.x, q.y, c.name);
  worldPanelOpen(false); syncUI();
});
$("sbScout").addEventListener("click", () => {
  if (!TECH.surveying.done) return toast("Research Surveying before training scouts.");
  scoutArmed = !scoutArmed;
  stratBarSync();
  if (scoutArmed) toast("Click anywhere on the country and the scout rides for it.");
});
$("marchNo").addEventListener("click", closeMarchModal);
$("mayorNo").addEventListener("click", closeMayorModal);
for (const el of ["pactGiveGood", "pactGiveAmt", "pactGetGood", "pactGetAmt"])
  for (const ev of ["change", "input"]) $(el).addEventListener(ev, pactSync);
$("pactNo").addEventListener("click", closePactModal);
$("miTerms").addEventListener("click", () => { if (mapSelNation) openPactModal(mapSelNation); });
$("pactPropose").addEventListener("click", () => {
  const id = pactNation; if (!id) return;
  const n = NATIONS[id], t = pactTerms();
  if (!pactVerdict(id, t.give, t.get).ok) return toast(`${n.name} will not sign that.`);
  const fresh = !n.trade;
  n.pact = t; n.trade = true; n.dues = 0;
  if (fresh) n.tradeT = 30;
  closePactModal();
  eventCard(fresh ? `A trade route opens with ${n.name}.` : `New terms with ${n.name}.`,
            "event_caravan", `${pactLine(n.pact)}, every caravan`);
  SFX.coin();
  mapInfoSync(); syncUI();
});
$("mayorDismiss").addEventListener("click", () => {
  if (mayorTown && mayorTown.mayor) {
    const was = mayorTown.mayor.name;
    mayorTown.mayor = null;
    tell("work", `${was} is put out of the mayor's office at ${mayorTown.name}.`);
  }
  closeMayorModal();
});
$("marchGo").addEventListener("click", () => {
  const target = marchTarget ? cityById(marchTarget) : marchChase ? marchById(marchChase) : null;
  if (!target) return closeMarchModal();
  const men = [...document.querySelectorAll("#marchList input:checked")]
    .map(i => civs[+i.dataset.idx]).filter(c => c && !c.afield);
  if (men.length < 4) return toast("A column needs at least 4 fighting men.");
  closeMarchModal();
  sendArmy(target, men);
  worldPanelOpen(false);
  syncUI();
});
$("miIntercept").addEventListener("click", () => {
  const m = mapSelMarch ? marchById(mapSelMarch) : null;
  if (!m) return;
  const n = NATIONS[m.nation];
  if (!n || !n.atWar) return toast(`You are not at war with ${n ? n.name : "them"}.`);
  openMarchModal(m);
});
$("marchSearch").addEventListener("input", () => {
  const q = ($("marchSearch").value || "").trim().toLowerCase();
  for (const row of $("marchList").children)
    row.style.display = !q || row.textContent.toLowerCase().includes(q) ? "" : "none";
});
// bringing them home again: the other half of an expedition, and the half a
// player forgets exists until an army is standing in a burnt-out foreign town
$("miRecall").addEventListener("click", () => {
  const c = cityById(mapSelCity);
  const at = c ? cityWorld(c) : { x: CAPITAL_X, y: CAPITAL_Y };
  const m = recallColumn(at.x, at.y, 1200);
  if (!m) return toast("Nobody of yours is standing there.");
  worldPanelOpen(false); syncUI();
});

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
  // Past the dissolve there is no grass left to draw and no one small enough to
  // stand on it. Drawing three hundred chunks of forest at one pixel a tree is
  // exactly the wrong way to spend a frame, so out here the country is the only
  // thing there is.
  const sAmt = stratAmt();
  if (sAmt >= 0.999) { renderStrategicOnly(); return; }
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
  // the dissolve: the country fades up through the grass, and for a few notches
  // of the wheel you can see the town and the continent it stands in at once
  if (sAmt > 0) drawStratGround(sAmt);
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

  // Once the country has all but taken over, the forest is a haze of one-pixel
  // spruces nobody can see — and there are three hundred chunks of it out there
  // at this height. Buildings and people stay (a town is still a shape you want
  // to recognise as it fades); the wild growth stops being drawn.
  for (const ch of (sAmt > 0.75 ? [] : visibleChunks())) {
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
    } else drawSprite(wimg(bldgSprite(b)), b.x, b.y + wos / 2, drawSizeOf(b.type) + wos, false);
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
  // columns on the roads of Europe, drawn as the men they are whenever the camera
  // is low enough to make out a man at all
  marchDrawables(drawables);
  for (const r of raiders) if (inView(r.x, r.y)) drawables.push({ y: r.y, draw: () => {
    const i = Math.floor(r.anim) % 4;
    const crown = r.nation && NATIONS[r.nation];
    const frame = crown ? foeCoat(crown.color, r.foe ? "atkuni" + i : "soldierU" + i)
                        : img[(r.foe ? "atksword" : "hunter") + i];
    drawSprite(frame, r.x, r.y, CHAR_SIZE, r.facing < 0);
    // A man in mail has to look like one. The sprites are the sprites, so the
    // kit is worn as a ring of pale steel at his feet — one line for leather,
    // two for mail, three for plate — which reads at a glance and at any zoom.
    // Without it the only way to learn he is armoured is to watch your axeman
    // fail to kill him and not know why.
    if (r.kit) {
      ctx.strokeStyle = ["", "#8a7f6a", "#b9c2c8", "#e2e8ec"][Math.min(KIT_MAX, r.kit)];
      ctx.lineWidth = 1.5;
      for (let k = 0; k < r.kit; k++) {
        ctx.beginPath();
        ctx.ellipse(r.x, r.y - 2, 14 + k * 4, 5.5 + k * 1.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // A city garrison is twenty men standing still in one square, and twenty
    // copies of "Kingdom of Denmark Enemy Soldier" laid over each other is a
    // smear that hides the town underneath it. They are named as a body — the
    // garrison label goes on the town, not on each man — and only the ones
    // actually coming for you are called out individually.
    if (settings.labels && !(r.garrison && r.state === "patrol")) {
      ctx.fillStyle = "#d86a5a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
      const who = crown ? crown.name + " Enemy Soldier" : (r.state === "patrol" ? "thief" : "RAIDER");
      ctx.fillText(r.state === "invest" ? who + " — BESIEGING" : who, r.x, r.y - CHAR_SIZE - 4);
      if (r.kit) {
        ctx.fillStyle = "#c9a86a"; ctx.font = "9px monospace";
        ctx.fillText(KIT_NAME[Math.min(KIT_MAX, r.kit)], r.x, r.y - CHAR_SIZE - 14);
      }
    }
    if (r.hp < r.maxHp) bar(r.x, r.y - CHAR_SIZE - (r.kit && settings.labels ? 24 : 14), r.hp / r.maxHp, "#a05252", 34);
  }});
  // and the garrison's tally, once, over the town it is holding
  if (settings.labels) for (const t of foreignTowns) {
    if (t.fallen || !inView(t.x, t.y)) continue;
    const n = raiders.filter(r => r.garrison === t).length;
    if (!n) continue;
    drawables.push({ y: t.y + 1, draw: () => {
      ctx.fillStyle = "#d86a5a"; ctx.font = "10px monospace"; ctx.textAlign = "center";
      const crown = NATIONS[t.nation];
      ctx.fillText(`${n} of ${crown ? crown.name : "the enemy"} hold ${t.name}`, t.x, t.y - CHAR_SIZE - 30);
    }});
  }
  // A man on a stretcher is painted by whoever is carrying him, not by himself
  for (const c of civs) if (!c.afield && !INDOORS.has(c.state) && c.state !== "borne" && inView(c.x, c.y)) drawables.push({ y: c.y, draw: () => {
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
    const ok = legalToBuild(buildMode, gx, gy, wallRot) && canPay(costOf(buildMode), ledgerAt(gx, gy));
    ctx.globalAlpha = 0.55;
    const turned = wallRot && !WALLLIKE.has(buildMode) && img[buildMode + "v"];
    const ghost = buildMode === "sapling" ? img.tree : buildMode === "farm" ? img.farm
                : turned ? img[buildMode + "v"] : img[buildMode];
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
    else if (turned) ctx.strokeRect(gx - gs * 0.33, gy - gs, gs * 0.66, gs);
    else ctx.strokeRect(gx - gs / 2, gy - gs, gs, gs);
  }
  // a building being carried: it rides the cursor, and the frame says whether it
  // may be set down where you are pointing
  if (moveBldg && buildings.includes(moveBldg)) {
    const bt = baseType(moveBldg);
    const [gx, gy] = WALLLIKE.has(bt) ? snapWallPos(bt, mouse.wx, mouse.wy, moveBldg)
                                      : [mouse.wx, mouse.wy];
    const ok = moveLegal(moveBldg, gx, gy);
    const gs = drawSizeOf(bt);
    const vert = WALLLIKE.has(bt) && moveBldg.rot;
    ctx.globalAlpha = 0.5;
    const im = img[bt + (vert && img[bt + "v"] ? "v" : "")] || img[bt];
    if (im) drawSprite(im, gx, gy, gs, false);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#7da083" : "#a05252"; ctx.lineWidth = 2;
    if (vert) ctx.strokeRect(gx - 11, gy - gs, 22, gs);
    else ctx.strokeRect(gx - gs / 2, gy - gs, gs, gs);
    // and a thread back to where it is standing now, so you can see what moved
    ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(201,168,106,0.6)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(moveBldg.x, moveBldg.y); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.setLineDash([]);
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

  // the far country's own marks, over everything, in screen units so a city's
  // name is the same size to read at every height
  if (sAmt > 0) drawStratMarks(sAmt);

  drawCursorHint();
}

// The plaque that says what a click will do.
//
// With a mouse it follows the hover. A finger has no hover, but it has
// something a mouse does not: a moment between touching down and letting go.
// The plaque appears the instant a finger lands and says what lifting will do
// — so a tap becomes press, read, lift. Slide away and it turns into a pan and
// the plaque goes with it, having promised nothing; hold and it becomes the
// cancel. It shows only while the lift would still act, so it never claims an
// order that is not going to happen.
//
// Either way, anyone who finds it fussy can put it away in the settings.
function drawCursorHint() {
  if (!settings.hints) return;
  const touching = IS_TOUCH && tPan && !tHandled;
  if (IS_TOUCH ? !touching : !edge.on) return;
  const text = hintAt(cam.x + mouse.x / zoom, cam.y + mouse.y / zoom);
  if (!text) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = (IS_TOUCH ? "13px" : "11px") + " monospace";
  ctx.textAlign = "left";
  const pad = IS_TOUCH ? 8 : 6, w = ctx.measureText(text).width + pad * 2, h = IS_TOUCH ? 25 : 19;
  // A fingertip covers what it is pointing at, so the plaque stands well clear
  // above it; a cursor does not, so it sits just below-right. Never off-glass.
  let x = IS_TOUCH ? mouse.x - w / 2 : mouse.x + 16;
  let y = IS_TOUCH ? mouse.y - 52 : mouse.y + 20;
  x = Math.max(4, Math.min(canvas.width - w - 4, x));
  if (!IS_TOUCH && x + w > canvas.width - 4) x = mouse.x - 16 - w;
  if (y < 4) y = mouse.y + 40;
  if (y + h > canvas.height - 4) y = IS_TOUCH ? mouse.y - 52 : mouse.y - 12 - h;
  ctx.fillStyle = "rgba(13,18,16,0.90)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(201,168,106,0.65)"; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = "#e8d9b8";
  ctx.fillText(text, x + pad, y + h - (IS_TOUCH ? 8 : 6));
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
