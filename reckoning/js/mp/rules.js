// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE RULES OF A MULTIPLAYER GAME: what can be built and what it costs, how hard things are to break, how far an
// axe reaches. The server and every player read the same rules, so the server can check what it's told.

export const PROTOCOL = 1;

// what you can build: logs and stone; how much of a beating it takes; how much room it needs (a circle about it,
// or for walls a length); `claim`, the ground round it that becomes yours
export const BUILD = {
  hearth:    { name: "Hearth",      wood: 10, stone: 0,  hp: 260, r: 1.6, claim: 32, note: "Your homestead's fire. The ground round it is yours: no one else can build there, and you wake here after a fall." },
  cabin:     { name: "Cabin",       wood: 30, stone: 0,  hp: 420, r: 4.2, w: 5.2, d: 6.2, model: "cabin", note: "A log cabin with a roof over it." },
  shed:      { name: "Woodshed",    wood: 18, stone: 0,  hp: 300, r: 3.0, w: 4.4, d: 3.0, model: "woodshed", store: true, note: "Where your logs and stone are kept. Break someone's woodshed and half of what they have is yours." },
  house:     { name: "House",       wood: 45, stone: 10, hp: 600, r: 5.0, w: 7.0, d: 6.0, model: "town/house_2", note: "A timber house, plastered." },
  well:      { name: "Well",        wood: 4,  stone: 12, hp: 380, r: 1.8, model: "well", note: "Water for the homestead." },
  wall:      { name: "Palisade",    wood: 4,  stone: 0,  hp: 160, len: 4, r: 0.6, wall: true, note: "Four metres of sharpened stakes. R turns it." },
  gate:      { name: "Gate",        wood: 8,  stone: 0,  hp: 220, len: 4, r: 0.6, wall: true, gate: true, note: "A palisade with a gate in it: it opens for you and your allies." },
  tower:     { name: "Watchtower",  wood: 24, stone: 6,  hp: 420, r: 2.2, note: "A lookout over the trees. Climb it to see raiders coming." },
  forge:     { name: "Forge",       wood: 20, stone: 16, hp: 520, r: 4.4, w: 8, d: 6, model: "town/forge_1", note: "A smith's forge: with one, your axe bites deeper — trees fall and walls break a blow sooner." },
  market:    { name: "Market",      wood: 30, stone: 8,  hp: 480, r: 5.2, w: 8.6, d: 10, model: "town/market_1", note: "A market stall: trade logs for stone and stone for logs." },
};
export const BUILD_ORDER = ["hearth", "cabin", "shed", "wall", "gate", "tower", "well", "house", "forge", "market"];

export const START_STOCK = { wood: 12, stone: 0 };
export const TREE_HITS = { spruce: 4, pine: 4, birch: 3 };
export const LOGS_PER_TREE = { spruce: 5, pine: 5, birch: 3 };
export const ROCK_HITS = 5, STONE_PER_ROCK = 4;
export const REGROW_MS = 12 * 60 * 1000;          // a felled tree, a broken rock: back after this, out of sight
export const REACH = 3.6;                         // how far a blow reaches (with a little slack for the lag)
export const BLOW = { player: 17, building: 12 }; // what an axe does
export const MAX_HP = 100;
export const RESPAWN_MS = 6000;
export const SPAWN_SHIELD_MS = 45 * 1000;         // a fresh arrival can't be hurt for a while
export const DAY_MS = 24 * 60 * 1000;             // a whole day and night
export const SIZES = { s: 420, m: 650, l: 950 };  // half the width of a game's island, in metres
export const WORLD_HALF = 3000;                   // the wide world: six kilometres across
export const MODES = { coop: "Co-op", pvp: "Classic" };
export const MODE_NOTES = { coop: "One colony, built together: one store, one hearth, and no harm between you.", pvp: "A nation each: build your own, trade and make treaties — or make war on your neighbours." };
export const GROUP_MAX = 8;
