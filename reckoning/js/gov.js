// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Government: the nation, what it knows, and who is in it. G opens the panel.
//
// The tech tree is Forester's own, word for word and node for node — the same
// four trees, the same prices and the same time at the desk — copied from
// ../game.js so a settlement here knows what a colony there knows. What each
// node does in Reckoning is in techFx below; a few name trades and forces
// (police, soldiers, pets, the map of Europe) that this game has not built yet,
// and those are learnt now and put to use when they come.

export const TECH = {};
function T(id, name, tree, req, depth, desc) { TECH[id] = { id, name, tree, req, depth, desc, done: false }; }
T("foraging", "Foraging", "growth", [], 0, "Grass patches give +1 seed, gathered twice as fast");
T("treecutting", "Tree Cutting", "growth", ["foraging"], 1, "Chopping 20% faster");
T("axing", "Axing", "growth", ["treecutting"], 2, "Chopping 35% faster in total");
T("sawing", "Sawing", "growth", ["axing"], 3, "trees felled quicker");
T("sawmills", "Sawmills", "growth", ["sawing"], 4, "trees felled quicker again; doors cost 3 logs");
T("replanting", "Replanting", "growth", ["foraging"], 1, "Saplings grow twice as fast");
// The care of the body: what a colony learns about feeding and mending itself.
// Both hang off Foraging and sit early and cheap on purpose — a farm growing
// wheat nobody can bake is a dead end, so the bakery has to be within reach of
// a colony that has only just laid its first field.
T("baking", "Baking", "growth", ["foraging"], 1, "Unlocks the Bakery — a baker turns your wheat into bread, and bread is what actually feeds them");
T("physick", "Physick", "growth", ["baking"], 2, "Unlocks the Hospital and the doctor's trade — four beds, a stretcher, and a fever that burns out four times faster");
T("seeding", "Seeding", "growth", ["replanting"], 2, "Farms need only 4 seeds");
T("agriculture", "Agriculture", "growth", ["seeding"], 3, "Crops ripen 30% faster");
T("taming", "Taming", "growth", ["agriculture"], 4, "Beasts of the forest; +3 colony happiness");
T("pets", "Pets", "growth", ["taming"], 5, "+4 colony happiness");
T("pettoys", "Pet Toys", "growth", ["pets"], 6, "+4 colony happiness");
T("pettraining", "Pet Training", "growth", ["pets"], 6, "Guard animals: torching 25% slower");
T("petarmour", "Pet Armour", "growth", ["pettraining"], 7, "Police +25 health");
T("guarddogs", "Guard Dogs", "growth", ["pettraining"], 7, "Police spot enemies much farther away");
T("wardogs", "War Dogs", "growth", ["guarddogs"], 8, "Police +5 damage");
T("horses", "Horses", "growth", ["taming"], 5, "Everyone walks 15% faster; unlocks the Stable, and a horse of your own to ride");
T("horsebreeding", "Horse Breeding", "growth", ["horses"], 6, "+10% more walking speed");
T("horsefeed", "Horse Feed", "growth", ["horses"], 6, "Hunger fades 20% slower");
T("stables", "Stables", "growth", ["horses"], 6, "Building & farm work 20% faster");
T("saddling", "Saddling", "growth", ["horses"], 6, "+10% more walking speed");
T("warhorse", "War Horse", "growth", ["saddling", "stables"], 7, "Police & soldiers move 35% faster");
T("cavalry", "Cavalry", "growth", ["warhorse"], 8, "Unlocks Cavalry riders — fast mounted force; police & soldiers +50 health");
T("hussars", "Hussars", "growth", ["cavalry"], 9, "Better cavalry: +40 health when recruited; all forces +15 damage");
T("trading", "Trading", "military", [], 0, "Unlocks the Market Center — it sells your surplus for DM, and market prices +1 DM");
// Faith is its own root: a colony can turn to it without first learning to
// trade, and this tab is Military PHILOSOPHY, which is where it belongs.
T("consecration", "Consecration", "military", [], 0, "Unlocks the Shrine — a small place to pray, and nowhere to pray costs every soul a little, every day");
T("ministry", "Ministry", "military", ["consecration"], 1, "Unlocks the House of Worship — a creed's own house, worth far more to its flock than anyone else's");
T("currencies", "Currencies", "military", ["trading"], 1, "Taxes collect +1 DM");
T("marketing", "Marketing", "military", ["currencies"], 2, "Market prices +1 more DM");
T("policing", "Policing", "military", [], 0, "Unlocks the Jail and the watch — a watchman catches thieves in the night and holds them a day");
T("court", "Court", "military", ["policing"], 4, "Half of beaten rebels are subdued alive");
T("landownership", "Land Ownership", "military", ["currencies"], 2, "Every cabin and house sleeps one more");
T("ownership", "Ownership", "military", ["landownership"], 3, "Dismantling refunds 75%");
T("township", "Township", "military", ["landownership"], 3, "Unlocks the Town Hall — its clerk collects more tax, its council settles feuds sooner, word sent from it brings people for less, settlers bring their goods to it, and a brick one is the charter to build as a city does — and the quarryman's trade");
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

// what a new settlement already knows (as in Forester)
export const START_TECH = ["foraging", "ownership", "forging"];
export const TECH_TREES = [["growth", "Growth"], ["military", "Military Philosophy"], ["industry", "Industry"], ["world", "Exploration"]];
// Forester's prices, in DM, and the same seconds at the desk
export const techCost = t => 15 + t.depth * 12;
export const techTime = t => 45 + t.depth * 40;
// which buildings wait on which knowledge (Forester's BUILD_GATES, for the buildings Reckoning has;
// the church is Forester's House of Worship)
// Reckoning's own few: the woodshed wants Tree Cutting, the well Replanting, the brickworks Masonry —
// so a new settlement starts with cabins, fields and paths, and learns the rest.)
export const BUILD_GATES = { stable: "horses", bakery: "baking", market: "trading", townhall: "township", forge: "forging",
  quarry: "masonry", sawmill: "millwork", mine: "mining", smelter: "smelting", church: "ministry",
  woodshed: "treecutting", well: "replanting", brickworks: "masonry", shrine: "consecration", jail: "policing",
  palisade: "defending", gate: "defending", stonewall: "defplus", hospital: "physick" };
// what costs DM to keep, every day (Forester's CIVIC: the works that must be tended; cabins, fields, paths, sheds are free)
export const CIVIC = new Set(["market", "townhall", "forge", "bakery", "well", "quarry", "mine", "sawmill", "smelter", "brickworks", "church", "jail", "hospital"]);
export const CIVIC_UPKEEP = 0.5;   // (low: half a DM a day for each; a settlement of a dozen works pays six)
// which jobs wait on which knowledge (Forester's PROF_GATES, for the jobs Reckoning has)
export const JOB_GATES = { quarryman: "township", miner: "mining", smith: "forging", watch: "policing", doctor: "physick" };
