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
  { tool: "pack", tier: 1, name: "Hide backpack", cost: { hide: 4 }, note: "Four hides, laced. Twelve slots on your back instead of six." },
  { tool: "pack", tier: 2, name: "Stitched pack", cost: { hide: 6, logs: 1 }, note: "Doubled hide on a bent-wood frame: eighteen slots." },
  { tool: "pack", tier: 3, name: "Pedlar's frame pack", cost: { hide: 8, logs: 2, iron: 1 }, note: "A wooden frame with an iron buckle, as the pedlars carry: twenty-seven slots." },
  { tool: "sword", tier: 1, name: "Wooden sword", cost: { logs: 2 }, note: "Better than your fists when they come up the road. Not much better." },
  { tool: "sword", tier: 3, name: "Copper sword", cost: { logs: 1, copper: 4 }, note: "A real blade, of your own. It bends." },
  { tool: "sword", tier: 4, name: "Bronze sword", cost: { logs: 1, bronze: 4 }, note: "Cast bronze, ground to a point: the plain blade of the age." },
  { tool: "sword", tier: 5, name: "Iron sword", cost: { logs: 1, iron: 4 }, note: "The best blade in the settlement." },
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
  fish: { name: "Fish", note: "A perch out of the pond, striped and spiny-finned: taste 3, tenderness 4/4, fills 16%. Fry it in the kitchen, or roast it at the fire." },
  boar: { name: "Boar", note: "Fat and strong: taste 4.5, tenderness 1/4, fills 36%. Forgiving if left on — dangerous if taken off too soon." },
  hide: { name: "Hide", note: "A skin off something you hunted. Four make a backpack, at the chopping block." },
};

export function freshBody() {
  const skills = {};
  for (const s of BODY_SKILLS) skills[s.id] = { lv: 1, xp: 0 };
  return { hunger: 1, skills, tools: { pick: 0, axe: 2, spade: 2, hammer: 0, sword: 0, pack: 0, musket: 0 }, plague: 0, purse: 0 };
}
export function restoreBody(saved) {
  const b = freshBody();
  if (saved && typeof saved === "object") {
    if (typeof saved.hunger === "number") b.hunger = Math.min(1, Math.max(0, saved.hunger));
    if (saved.plague > 0) b.plague = Math.min(PLAGUE_SECS, saved.plague);
    if (saved.purse > 0) b.purse = Math.floor(saved.purse);
    // (before bronze there were four makings, and 4 was iron: those are 5 now)
    if (saved.tools) for (const k of Object.keys(b.tools)) if (saved.tools[k] != null) { let v = saved.tools[k] | 0; if (!saved.tools.v && v >= 4) v = 5; b.tools[k] = Math.min(TOP_TIER, Math.max(b.tools[k], v)); }
    if (saved.wear && typeof saved.wear === "object") { b.wear = {}; for (const [k, w] of Object.entries(saved.wear)) if (w && b.tools[k] === w.t && w.n > 0) b.wear[k] = { t: w.t, n: +w.n }; }
    for (const s of BODY_SKILLS) {
      const v = saved.skills && saved.skills[s.id];
      if (v) b.skills[s.id] = { lv: Math.min(SKILL_MAX, Math.max(1, v.lv | 0)), xp: Math.max(0, +v.xp || 0) };
    }
  }
  return b;
}
export const bodyToSave = b => ({ hunger: +b.hunger.toFixed(3), skills: b.skills, tools: { ...b.tools, v: 2 }, wear: b.wear || {}, plague: Math.round(b.plague || 0), purse: b.purse || 0 });
// what the traders give for what you have gathered yourself and put in your chest, a piece
export const SELL_PRICE = { meat: 2, venison: 3, hare: 2, boar: 4, fish: 1.5, cookedmeat: 3, stone: 0.5, copperore: 1, tinore: 1, ironore: 1, copper: 2, tin: 2, bronze: 3, iron: 3, bread: 1, planks: 0.5, bricks: 0.5 };
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
export const damageTaken = (b, dmg) => dmg * (1 - 0.5 * skillK(b, "toughness"));
// how hard a blow rattles you: the flash, the shake, the gasping (a hardened body hardly notices)
export const rattle = b => 1 - 0.8 * skillK(b, "toughness");
export const blowMul = b => 1 + 0.8 * skillK(b, "strength");
export const healDelay = b => 6 - 4 * skillK(b, "healing");
export const healRate = b => (1 + 3 * skillK(b, "healing")) / 70;
export const staminaDrain = b => 1 - 0.45 * skillK(b, "endurance");
export const aimSteady = b => 1 - 0.7 * skillK(b, "archery");

// hunger: full to empty over about twenty-five minutes of play, sooner when you run
export function hungerTick(b, dt, running) {
  if (!b) return;
  const before = b.hunger;
  b.hunger = Math.max(0, b.hunger - dt / 1500 * (running ? 1.8 : 1));
  if (Math.floor(before * 50) !== Math.floor(b.hunger * 50)) b.dirty = true;
}

// ---- what you can carry: slots on your back, a dozen of a thing to a slot; a backpack gives more ----
export const PACK_SLOTS = [6, 12, 18, 27], STACK = 12;
// (a key, a map, a spade take a slot of their own and don't stack)
const LOOSE = new Set(["key", "map", "spade", "ledger", "door"]);
export function packSlots(body) { return PACK_SLOTS[Math.min(3, (body && body.tools && body.tools.pack) || 0)]; }
export function slotsUsed(pack) { return pack.reduce((a, i) => a + (LOOSE.has(i.icon) || i.n == null ? 1 : Math.ceil((i.n || 1) / STACK)), 0); }
// how many more of a thing fit
export function roomFor(pack, body, icon) {
  const free = Math.max(0, packSlots(body) - slotsUsed(pack)) * STACK;
  const have = pack.find(i => i.icon === icon), part = have && have.n ? (STACK - (have.n % STACK)) % STACK : 0;
  return free + part;
}
