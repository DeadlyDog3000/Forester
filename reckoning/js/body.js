// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Your own body: how hungry you are, and what you have grown good at. Skills
// run from 1 to 100 and grow by doing — strength by swinging, toughness by
// being hit, healing by mending, endurance by running, archery by the bow.
// Kept in the save; the chapters only ever top up your belly.

export const BODY_SKILLS = [
  { id: "strength", name: "Strength", icon: "💪", does: "Harder blows and quicker felling.", grows: "Swing the axe or a blade, and land it." },
  { id: "toughness", name: "Toughness", icon: "🛡", does: "Blows take less from you, and shake you less — the red and the gasping pass sooner.", grows: "Take blows, and stay on your feet." },
  { id: "healing", name: "Healing", icon: "✚", does: "Wounds close sooner after a fight.", grows: "Mend: every point of health that comes back." },
  { id: "endurance", name: "Endurance", icon: "🏃", does: "Longer sprints, and breath back sooner.", grows: "Run until you are winded." },
  { id: "archery", name: "Archery", icon: "🏹", does: "Steadier arms at full draw.", grows: "Loose arrows, and hit what you aim at." },
  { id: "cooking", name: "Cooking", icon: "🍲", does: "A truer eye for when a dish is done, a wider moment to take it off, better dishes — and new recipes.", grows: "Cook at the kitchen in your house. A good dish teaches more than a burnt one." },
];
export const SKILL_MAX = 100;
// what it takes to go from one level to the next: a little more every time
// (steep: the first few come in an afternoon, the last take a lifetime)
export const xpFor = lv => Math.round(12 + lv * 3 + lv * lv * 0.06);

// what can be eaten, and how much of your hunger each takes away
export const FOOD = {
  blackberries: { fill: 0.04, secs: 1.1, name: "a handful of blackberries" },
  bread: { fill: 0.2, secs: 2.2, name: "bread" },
  meat: { fill: 0.22, secs: 2.6, name: "raw meat", raw: true },
  cookedmeat: { fill: 0.28, secs: 2.6, name: "roast meat" },
  venison: { fill: 0.22, secs: 2.6, name: "raw venison", raw: true },
  hare: { fill: 0.14, secs: 2.2, name: "raw hare", raw: true },
  boar: { fill: 0.26, secs: 2.8, name: "raw boar", raw: true },
  fish: { fill: 0.12, secs: 2, name: "raw fish", raw: true },
  mushrooms: { fill: 0.05, secs: 1.4, name: "a handful of ceps" },
  dish: { fill: 0.4, secs: 3.2, name: "a dish" },
};

// tools you make yourself, in their makings: 0 none, 1 wood, 2 stone, 3 copper, 4 bronze, 5 iron.
// Bronze, as the first Forester has it, is copper and tin melted together — the middle rung.
// The old axe from the block counts as stone: it cuts, but a better head cuts quicker.
export const TIER_NAME = ["", "wooden", "stone", "copper", "bronze", "iron"];
export const TOP_TIER = 5;
export const TOOL_RECIPES = [
  { tool: "pick", tier: 1, name: "Wooden pickaxe", cost: { logs: 2 }, note: "Breaks the grey stone round the clearing." },
  { tool: "pick", tier: 2, name: "Stone pickaxe", cost: { logs: 2, stone: 3 }, note: "Hard enough for the green-flecked copper rock, out in the woods." },
  { tool: "pick", tier: 3, name: "Copper pickaxe", cost: { logs: 2, copper: 3 }, note: "Soft, as metals go — but quicker than stone. Melt copper with tin for bronze." },
  { tool: "pick", tier: 4, name: "Bronze pickaxe", cost: { logs: 2, bronze: 3 }, note: "Hard enough for the rust-red iron rock, deep in the forest." },
  { tool: "pick", tier: 5, name: "Iron pickaxe", cost: { logs: 2, iron: 3 }, note: "Breaks anything, and quickly." },
  { tool: "axe", tier: 3, name: "Copper axe", cost: { logs: 2, copper: 3 }, note: "Fells a tree in fewer strokes than the old axe." },
  { tool: "axe", tier: 4, name: "Bronze axe", cost: { logs: 2, bronze: 3 }, note: "Holds an edge the way copper never could." },
  { tool: "axe", tier: 5, name: "Iron axe", cost: { logs: 2, iron: 3 }, note: "The best felling axe there is." },
  { tool: "spade", tier: 3, name: "Copper spade", cost: { logs: 1, copper: 3 }, note: "Turns a field quicker than Henning's old one." },
  { tool: "spade", tier: 4, name: "Bronze spade", cost: { logs: 1, bronze: 3 }, note: "Quicker again." },
  { tool: "spade", tier: 5, name: "Iron spade", cost: { logs: 1, iron: 3 }, note: "Cuts through roots and all. Fields dug in half the time." },
  { tool: "hammer", tier: 1, name: "Wooden mallet", cost: { logs: 2 }, note: "Raising a building goes quicker with something to knock it together." },
  { tool: "hammer", tier: 2, name: "Stone hammer", cost: { logs: 1, stone: 3 }, note: "Quicker again — for raising buildings and hewing doors." },
  { tool: "hammer", tier: 3, name: "Copper hammer", cost: { logs: 1, copper: 3 }, note: "Quicker again." },
  { tool: "hammer", tier: 4, name: "Bronze hammer", cost: { logs: 1, bronze: 3 }, note: "Quicker again." },
  { tool: "hammer", tier: 5, name: "Iron hammer", cost: { logs: 1, iron: 3 }, note: "A building raised in half the time." },
  { tool: "pack", tier: 1, name: "Hide backpack", cost: { hide: 4 }, note: "Four hides, laced: a pack ten squares by five, instead of what a sack over your shoulder holds (ten by four)." },
  { tool: "pack", tier: 2, name: "Stitched pack", cost: { hide: 6, logs: 1 }, note: "Doubled hide on a bent-wood frame: ten squares by six." },
  { tool: "pack", tier: 3, name: "Pedlar's frame pack", cost: { hide: 8, logs: 2, iron: 1 }, note: "A wooden frame with an iron buckle, as the pedlars carry: twelve squares by six." },
  { tool: "sword", tier: 1, name: "Wooden sword", cost: { logs: 2 }, note: "Better than your fists when they come up the road. Not much better." },
  { tool: "sword", tier: 3, name: "Copper sword", cost: { logs: 1, copper: 4 }, note: "A real blade, of your own. It bends." },
  { tool: "sword", tier: 4, name: "Bronze sword", cost: { logs: 1, bronze: 4 }, note: "Cast bronze, ground to a point: the plain blade of the age." },
  { tool: "sword", tier: 5, name: "Iron sword", cost: { logs: 1, iron: 4 }, note: "The best blade in the settlement." },
  { tool: "bow", tier: 1, name: "Hunting bow", cost: { logs: 2 }, note: "A self bow of ash, cut from a stave and strung with sinew. Hold right-click to draw, let go to loose — for the deer ride, and for the road when they come up it. It wants arrows." },
  { tool: "arrows", item: 12, tier: 0, name: "Arrows (a dozen)", cost: { logs: 1, stone: 1 }, note: "Shafts of split ash, fletched, with knapped stone heads." },
  { tool: "crossbow", tier: 5, name: "Crossbow", cost: { planks: 2, iron: 2, hide: 1 }, note: "A steel-bowed crossbow, spanned with a crank. Slow to load, but a bolt flies flat and hits harder than any arrow. It wants bolts." },
  { tool: "rod", tier: 1, name: "Fishing rod", cost: { logs: 1 }, note: "A long hazel rod in four lengths whipped together, a horsehair line tied to its top, and a bent-pin hook with a worm on it. Take it out at the water, click to cast, and click again the moment the line is drawn away under." },
  { tool: "canteen", tier: 1, name: "Canteen", cost: { logs: 2 }, note: "A little wooden costrel on a cord: four drinks. Fill it at a well, the brook or the pond, and boil what's in it at the fire (press its number there) so it won't make you ill. Press its number anywhere else to drink." },
  { tool: "canteen", tier: 2, name: "Leather canteen", cost: { leather: 2 }, note: "A leather bottle, waxed inside and stitched: six drinks instead of four." },
  { tool: "coat", tier: 1, name: "Buff coat", cost: { leather: 5 }, note: "A thick coat of oiled leather, as the soldiers wear under their armour: every blow takes a fifth less off you." },
  { tool: "bolts", item: 8, tier: 0, name: "Crossbow bolts (eight)", cost: { planks: 1, iron: 1 }, note: "Short, heavy bolts with iron heads, for the crossbow." },
];
// how many strokes a tool's making stands before it wears out: a wooden one soon, iron a long while
export const TOOL_LIFE = [0, 60, 120, 200, 300, 450];
// worn out, the axe and the spade go back to the old ones from the block (reground, they never quite give out);
// anything else is gone, to make again
const WORN_TO = { axe: 2, spade: 2 };
const TOOL_WORD = { axe: "axe", pick: "pickaxe", spade: "spade", hammer: "hammer", sword: "sword" };
// what's left of a tool, 0..1 (1 for one that doesn't wear)
export function toolLeft(b, k) {
  const t = b && b.tools && b.tools[k]; if (!t || (WORN_TO[k] && t <= WORN_TO[k])) return 1;
  const w = b.wear && b.wear[k];
  return w && w.t === t ? Math.max(0, w.n / TOOL_LIFE[t]) : 1;
}
// a stroke's worth of use; returns "worn" (a warning), "broke" (and what it is now), or nothing
export function wearTool(b, k, n = 1) {
  const t = b && b.tools && b.tools[k];
  if (!t || (WORN_TO[k] && t <= WORN_TO[k])) return null;
  b.wear ??= {};
  let w = b.wear[k];
  if (!w || w.t !== t) w = b.wear[k] = { t, n: TOOL_LIFE[t] };
  const before = w.n / TOOL_LIFE[t];
  w.n -= n; b.dirty = true;
  if (w.n <= 0) {
    b.tools[k] = WORN_TO[k] || 0; delete b.wear[k];
    return { broke: true, text: `Your ${TIER_NAME[t]} ${TOOL_WORD[k]} has worn out${WORN_TO[k] ? ` — you're back to the old ${TOOL_WORD[k]} from the block` : ". Make another at the chopping block"}.` };
  }
  if (before > 0.15 && w.n / TOOL_LIFE[t] <= 0.15) return { worn: true, text: `Your ${TIER_NAME[t]} ${TOOL_WORD[k]} is nearly worn through.` };
  return null;
}
// the tool a making replaces: the lowest one above what you have
export const nextTier = (tools, tool) => Math.min(...TOOL_RECIPES.filter(r => r.tool === tool && r.tier > (tools[tool] || 0)).map(r => r.tier));
// what each kind of rock gives, and the pick it wants
export const ROCKS = {
  stone: { need: 1, hp: 4, gives: "stone", n: 2, name: "grey stone" },
  copper: { need: 2, hp: 6, gives: "copperore", n: 1, name: "copper rock" },
  tin: { need: 2, hp: 6, gives: "tinore", n: 1, name: "tin rock" },
  iron: { need: 4, hp: 8, gives: "ironore", n: 1, name: "iron rock" },
};
export const ITEM = {
  blackberries: { name: "Blackberries", note: "Picked off the brambles. A handful takes the edge off hunger." },
  meat: { name: "Raw meat", note: "Cook it at the fire first (hold F there): raw meat brings the plague." },
  cookedmeat: { name: "Roast meat", note: "Cooked at the fire. Good, filling food." },
  dish: { name: "A dish", note: "Something you cooked in the kitchen." },
  rye: { name: "Rye", note: "Threshed grain, in a sack. It feeds the settlement once it's in the store chest." },
  seed: { name: "Rye seed", note: "Seed corn for a new field. Put it in the store chest, and the next field you lay out is sown with it." },
  planks: { name: "Planks", note: "Sawn boards, for building." },
  bricks: { name: "Bricks", note: "Fired at the brickworks, for building as the Hanse builds." },
  bread: { name: "Bread", note: "A loaf from the settlement's bakery. Eat it (click, with it in your hand), or put it back in the store chest for everyone." },
  stone: { name: "Stone", note: "Broken from the grey rocks. For a stone pickaxe — and the settlement builds with it." },
  copperore: { name: "Copper ore", note: "Green-flecked rock. Smelt it at a forge (hold F beside it) to get copper." },
  tinore: { name: "Tin ore", note: "Pale rock with dark grains. Smelt it at a forge (hold F beside it) to get tin." },
  ironore: { name: "Iron ore", note: "Rust-red rock. Smelt it at a forge (hold F beside it) to get iron." },
  copper: { name: "Copper", note: "Smelted from the ore. For copper tools — or cast it with tin at a forge for bronze." },
  tin: { name: "Tin", note: "Smelted from the ore. Cast it with copper at a forge: one of each makes two of bronze." },
  bronze: { name: "Bronze", note: "Copper and tin melted together. For bronze tools and a bronze sword." },
  iron: { name: "Iron", note: "Smelted from the ore. For an iron pickaxe or axe." },
  venison: { name: "Venison", note: "From a roe deer. Lean, dark and rich: taste 4, tenderness 3/4, fills 30%. Dries out fast if overcooked. Cook it in the kitchen, or roast it at the fire." },
  hare: { name: "Hare", note: "Sweet and delicate: taste 3, tenderness 4/4, fills 18%. Quick to cook and quicker to ruin." },
  mushrooms: { name: "Ceps", note: "Fat brown mushrooms from under the trees, after rain. Eat them as they are, or stew them with rye in the kitchen." },
  fish: { name: "Fish", note: "A perch out of the pond, striped and spiny-finned: taste 3, tenderness 4/4, fills 16%. Fry it in the kitchen, or roast it at the fire." },
  boar: { name: "Boar", note: "Fat and strong: taste 4.5, tenderness 1/4, fills 36%. Forgiving if left on — dangerous if taken off too soon." },
  crossbow: { name: "Crossbow", note: "Right-click to aim down it; click to loose a bolt. It cranks itself back for the next." },
  bolts: { name: "Crossbow bolts", note: "For the crossbow. Made at the chopping block, eight at a time, once there's a forge." },
  hide: { name: "Hide", note: "A skin off something you hunted. Four make a backpack, at the chopping block; tanned at a tanning rack, it's leather." },
  leather: { name: "Leather", note: "A hide tanned on the rack. For a buff coat, a leather canteen — or the market." },
};

export function freshBody() {
  const skills = {};
  for (const s of BODY_SKILLS) skills[s.id] = { lv: 1, xp: 0 };
  return { hunger: 1, thirst: 1, water: { n: 0, kind: null }, ill: null, skills, tools: { pick: 0, axe: 2, spade: 2, hammer: 0, sword: 0, pack: 0, musket: 0, crossbow: 0, bolts: 0, canteen: 0, coat: 0, rod: 0 }, plague: 0, purse: 0 };
}
export function restoreBody(saved) {
  const b = freshBody();
  if (saved && typeof saved === "object") {
    if (typeof saved.hunger === "number") b.hunger = Math.min(1, Math.max(0, saved.hunger));
    if (saved.plague > 0) b.plague = Math.min(PLAGUE_SECS, saved.plague);
    if (typeof saved.thirst === "number") b.thirst = Math.min(1, Math.max(0, saved.thirst));
    if (saved.water && WATER_KINDS.includes(saved.water.kind)) b.water = { n: Math.max(0, Math.min(8, saved.water.n | 0)), kind: saved.water.kind };
    if (saved.ill && ILLS[saved.ill.id] && saved.ill.t > 0) b.ill = { id: saved.ill.id, t: Math.min(ILLS[saved.ill.id].secs, +saved.ill.t) };
    if (saved.purse > 0) b.purse = Math.floor(saved.purse);
    if (saved.gridPos && typeof saved.gridPos === "object") b.gridPos = saved.gridPos;
    // (before bronze there were four makings, and 4 was iron: those are 5 now)
    if (saved.tools) for (const k of Object.keys(b.tools)) if (saved.tools[k] != null) { let v = saved.tools[k] | 0; if (!saved.tools.v && v >= 4) v = 5; b.tools[k] = k === "bolts" ? Math.max(0, Math.min(999, saved.tools[k] | 0)) : Math.min(TOP_TIER, Math.max(b.tools[k], v)); }
    if (saved.wear && typeof saved.wear === "object") { b.wear = {}; for (const [k, w] of Object.entries(saved.wear)) if (w && b.tools[k] === w.t && w.n > 0) b.wear[k] = { t: w.t, n: +w.n }; }
    for (const s of BODY_SKILLS) {
      const v = saved.skills && saved.skills[s.id];
      if (v) b.skills[s.id] = { lv: Math.min(SKILL_MAX, Math.max(1, v.lv | 0)), xp: Math.max(0, +v.xp || 0) };
    }
  }
  return b;
}
export const bodyToSave = b => ({ gridPos: b.gridPos || undefined, hunger: +b.hunger.toFixed(3), thirst: +(b.thirst ?? 1).toFixed(3), water: b.water && b.water.n ? b.water : undefined, ill: b.ill || undefined, skills: b.skills, tools: { ...b.tools, v: 2 }, wear: b.wear || {}, plague: Math.round(b.plague || 0), purse: b.purse || 0 });
// what the traders give for what you have gathered yourself and put in your chest, a piece
export const SELL_PRICE = { leather: 4, hide: 1.5, meat: 2, venison: 3, hare: 2, boar: 4, fish: 1.5, mushrooms: 0.5, cookedmeat: 3, stone: 0.5, copperore: 1, tinore: 1, ironore: 1, copper: 2, tin: 2, bronze: 3, iron: 3, bread: 1, planks: 0.5, bricks: 0.5 };
// the plague, from meat eaten raw: how long it lasts if nobody tends you
export const PLAGUE_SECS = 300;

// a skill's level as a fraction of the way from nothing to the most there is (0 at 1, 1 at 100)
export function skillK(b, id) { return b ? (b.skills[id].lv - 1) / (SKILL_MAX - 1) : 0; }

// practice: xp into a skill; returns the new level when it rises, so the caller can say so
export function practise(b, id, xp) {
  if (!b) return 0;
  const s = b.skills[id];
  if (!s || s.lv >= SKILL_MAX) return 0;
  s.xp += xp; b.dirty = true;
  let up = 0;
  while (s.lv < SKILL_MAX && s.xp >= xpFor(s.lv)) { s.xp -= xpFor(s.lv); s.lv++; up = s.lv; }
  if (s.lv >= SKILL_MAX) s.xp = 0;
  return up;
}

// a better axe head: now and then a stroke that does the work of two (a copper head a quarter of the time, iron half)
export const axeBonus = b => { const t = (b && b.tools && b.tools.axe) || 2; return [0, 0, 0, 0.25, 0.38, 0.5][t] || 0; };
// how long the spade and the hammer take, as a share of the time with bare hands and the old spade
export const digMul = b => [1, 1, 1, 0.75, 0.65, 0.55][(b && b.tools && b.tools.spade) || 2];
export const buildMul = b => [1, 0.85, 0.75, 0.65, 0.57, 0.5][(b && b.tools && b.tools.hammer) || 0];
// your own sword: how hard it strikes against a smith's blade (wood a good deal less; iron more)
export const SWORD_MUL = [0, 0.55, 0.8, 0.9, 1.05, 1.3];
// dying: a share of every skill's points gone (all the points it took to reach its level, and those since)
export function loseSkills(b, frac = 0.15) {
  const lost = {};
  for (const sk of BODY_SKILLS) {
    const v = b.skills[sk.id];
    let total = v.xp; for (let l = 1; l < v.lv; l++) total += xpFor(l);
    let left = total * (1 - frac), lv = 1;
    while (lv < SKILL_MAX && left >= xpFor(lv)) { left -= xpFor(lv); lv++; }
    if (lv < v.lv) lost[sk.id] = v.lv - lv;
    v.lv = lv; v.xp = left;
  }
  b.dirty = true;
  return lost;
}
// ---- what the skills do ----
export const damageTaken = (b, dmg) => dmg * (1 - 0.5 * skillK(b, "toughness")) * (b && b.tools && b.tools.coat ? 0.8 : 1);   // (a buff coat turns a fifth of it)
// how hard a blow rattles you: the flash, the shake, the gasping (a hardened body hardly notices)
export const rattle = b => 1 - 0.8 * skillK(b, "toughness");
export const blowMul = b => 1 + 0.8 * skillK(b, "strength");
export const healDelay = b => 6 - 4 * skillK(b, "healing");
export const healRate = b => (1 + 3 * skillK(b, "healing")) / 70;
export const staminaDrain = b => 1 - 0.45 * skillK(b, "endurance");
export const aimSteady = b => 1 - 0.7 * skillK(b, "archery");

// thirst: like hunger, but quicker — full to dry in about eighteen minutes, sooner when you run or when you're ill
// with the flux. Water from the brook or the pond, drunk as it is, may make you ill; well water seldom; boiled, never.
export const WATER_KINDS = ["raw", "well", "boiled"];
export const WATER_NAME = { raw: "brook water, unboiled", well: "well water", boiled: "boiled water" };
export const WATER_RISK = { raw: 0.22, well: 0.03, boiled: 0 };
export const ILLS = { flux: { name: "the flux", secs: 240, drain: 1 / 520 } };
export const canteenSize = b => (b && b.tools && b.tools.canteen >= 2 ? 6 : b && b.tools && b.tools.canteen ? 4 : 0);
export function thirstTick(b, dt, running) {
  if (!b) return;
  const before = b.thirst ?? 1;
  b.thirst = Math.max(0, before - dt / 1100 * (running ? 1.6 : 1) * (b.ill ? 1.5 : 1));
  if (Math.floor(before * 50) !== Math.floor(b.thirst * 50)) b.dirty = true;
}
// hunger: full to empty over about twenty-five minutes of play, sooner when you run
export function hungerTick(b, dt, running) {
  if (!b) return;
  const before = b.hunger;
  b.hunger = Math.max(0, b.hunger - dt / 1500 * (running ? 1.8 : 1));
  if (Math.floor(before * 50) !== Math.floor(b.hunger * 50)) b.dirty = true;
}

// ---- what you can carry: a pack laid out as a grid, as a pedlar packs his: every thing takes the room it takes —
// an axe two squares by two, the bow a long one by four, a fish one by two, a handful of stone one square, a dozen of
// it to the square. Your tools and the bow ride in it too. A backpack gives a bigger grid. ----
export const GRID = [[10, 4], [10, 5], [10, 6], [12, 6]], STACK = 12;
// (kept for what still counts in slots: the number of squares)
export const PACK_SLOTS = GRID.map(([w, h]) => w * h);
// (a key, a map, a spade, a dish take a place of their own and don't pile up)
const LOOSE = new Set(["key", "map", "spade", "ledger", "door", "dish"]);
const SIZE = { axe: [2, 2], pick: [2, 2], spade: [1, 3], hammer: [1, 2], sword: [1, 3], weapon: [1, 3], bow: [1, 4], arrows: [1, 2], rod: [1, 4], canteen: [1, 2],
  musket: [1, 4], crossbow: [2, 2], bolts: [1, 2], map: [2, 2], ledger: [2, 2], door: [2, 2], fish: [1, 2], meat: [2, 2], venison: [2, 2], hare: [1, 2], boar: [2, 2],
  cookedmeat: [1, 2], hide: [2, 2], leather: [2, 2], rye: [2, 2], planks: [1, 3], tools: [1, 2] };
const STACK_OF = { hide: 4, leather: 4, meat: 4, venison: 3, boar: 3, hare: 4, fish: 4, cookedmeat: 6, planks: 6, rye: 25 };
export function itemSize(icon) { const k = String(icon || "").replace(/\d+$/, ""); return SIZE[icon] || SIZE[k] || [1, 1]; }
export function stackOf(it) { return it.n == null || LOOSE.has(it.icon) ? 1 : (STACK_OF[it.icon] || STACK); }
export function gridSize(body) { return GRID[Math.min(3, (body && body.tools && body.tools.pack) || 0)]; }
export function packSlots(body) { const [w, h] = gridSize(body); return w * h; }
// (your tools, as things in the grid: the game says which — see setToolItems)
let toolItems = () => [];
export function setToolItems(f) { toolItems = f; }
// where everything goes: what has a place of its own keeps it; the rest goes wherever there's room, down the columns
// from the left. Returns the pieces placed (each a pile of a thing, or a tool), what didn't fit, and the grid
export function packLayout(pack, body, tools = toolItems()) {
  const [W, H] = gridSize(body), occ = new Int16Array(W * H).fill(-1), all = [], over = [];
  const fits = (x, y, w, h) => { if (x < 0 || y < 0 || x + w > W || y + h > H) return false; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (occ[j * W + i] >= 0) return false; return true; };
  const mark = (p, x, y) => { p.x = x; p.y = y; p.placed = true; for (let j = y; j < y + p.h; j++) for (let i = x; i < x + p.w; i++) occ[j * W + i] = p.id; };
  for (const t of tools) { const [w, h] = itemSize(t.icon); all.push({ it: t, tool: true, k: 0, n: t.n, w, h }); }
  for (const it of pack) {
    const s = stackOf(it), cnt = Math.max(1, Math.ceil((it.n || 1) / s)), [w, h] = itemSize(it.icon);
    for (let k = 0; k < cnt; k++) all.push({ it, k, n: it.n == null ? null : Math.min(s, (it.n || 1) - k * s), w, h });
  }
  all.forEach((p, i) => { p.id = i; });
  const gp = body ? (body.gridPos || (body.gridPos = {})) : {};
  const posOf = p => p.tool ? gp[p.it.key] : (p.it.pos || [])[p.k];
  const keep = (p, x, y) => { if (p.tool) gp[p.it.key] = [x, y]; else { const a = p.it.pos || (p.it.pos = []); a[p.k] = [x, y]; } };
  for (const p of all) { const at = posOf(p); if (at && fits(at[0], at[1], p.w, p.h)) mark(p, at[0], at[1]); }
  for (const p of all) {
    if (p.placed) continue;
    let done = false;
    for (let x = 0; x < W && !done; x++) for (let y = 0; y < H && !done; y++) if (fits(x, y, p.w, p.h)) { mark(p, x, y); keep(p, x, y); done = true; }
    if (!done) over.push(p);
  }
  return { W, H, pieces: all.filter(p => p.placed), over, occ, fits };
}
export function slotsUsed(pack, body) { const L = packLayout(pack, body); return L.pieces.reduce((a, p) => a + p.w * p.h, 0); }
// how many more of a thing fit: the room left on its last pile, and as many new piles as there are places for
export function roomFor(pack, body, icon) {
  const L = packLayout(pack, body), s = stackOf({ icon, n: 1 }), [w, h] = itemSize(icon);
  const have = pack.find(i => i.icon === icon);
  let room = have && have.n != null && s > 1 ? (s - ((have.n || 1) % s)) % s : 0;
  // (a thing that didn't fit isn't room)
  if (have && L.over.some(p => p.it === have)) room = 0;
  const occ = L.occ.slice(), W = L.W, H = L.H;
  const fits = (x, y) => { if (x + w > W || y + h > H) return false; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (occ[j * W + i] >= 0) return false; return true; };
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (fits(x, y)) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) occ[j * W + i] = 9999; room += s; }
  return room;
}
