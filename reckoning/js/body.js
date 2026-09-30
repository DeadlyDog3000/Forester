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
];
export const SKILL_MAX = 100;
// what it takes to go from one level to the next: a little more every time
export const xpFor = lv => Math.round(6 + lv * 1.4);

// what can be eaten, and how much of your hunger each takes away
export const FOOD = {
  blackberries: { fill: 0.06, secs: 1.1, name: "a handful of blackberries" },
  bread: { fill: 0.35, secs: 2.2, name: "bread" },
  meat: { fill: 0.45, secs: 2.6, name: "meat" },
};

// tools you make yourself, each in four makings: 0 none, 1 wood, 2 stone, 3 copper, 4 iron.
// The old axe from the block counts as stone: it cuts, but a better head cuts quicker.
export const TIER_NAME = ["", "wooden", "stone", "copper", "iron"];
export const TOOL_RECIPES = [
  { tool: "pick", tier: 1, name: "Wooden pickaxe", cost: { logs: 2 }, note: "Breaks the grey stone round the clearing." },
  { tool: "pick", tier: 2, name: "Stone pickaxe", cost: { logs: 2, stone: 3 }, note: "Hard enough for the green-flecked copper rock, out in the woods." },
  { tool: "pick", tier: 3, name: "Copper pickaxe", cost: { logs: 2, copper: 3 }, note: "Hard enough for the rust-red iron rock, deep in the forest." },
  { tool: "pick", tier: 4, name: "Iron pickaxe", cost: { logs: 2, iron: 3 }, note: "Breaks anything, and quickly." },
  { tool: "axe", tier: 3, name: "Copper axe", cost: { logs: 2, copper: 3 }, note: "Fells a tree in fewer strokes than the old axe." },
  { tool: "axe", tier: 4, name: "Iron axe", cost: { logs: 2, iron: 3 }, note: "The best felling axe there is." },
];
// what each kind of rock gives, and the pick it wants
export const ROCKS = {
  stone: { need: 1, hp: 4, gives: "stone", n: 2, name: "grey stone" },
  copper: { need: 2, hp: 6, gives: "copperore", n: 2, name: "copper rock" },
  iron: { need: 3, hp: 8, gives: "ironore", n: 2, name: "iron rock" },
};
export const ITEM = {
  stone: { name: "Stone", note: "Broken from the grey rocks. For a stone pickaxe — and the settlement builds with it." },
  copperore: { name: "Copper ore", note: "Green-flecked rock. Smelt it at the fire (hold F) to get copper." },
  ironore: { name: "Iron ore", note: "Rust-red rock. Smelt it at the fire (hold F) to get iron." },
  copper: { name: "Copper", note: "Smelted from the ore. For a copper pickaxe or axe." },
  iron: { name: "Iron", note: "Smelted from the ore. For an iron pickaxe or axe." },
};

export function freshBody() {
  const skills = {};
  for (const s of BODY_SKILLS) skills[s.id] = { lv: 1, xp: 0 };
  return { hunger: 1, skills, tools: { pick: 0, axe: 2 } };
}
export function restoreBody(saved) {
  const b = freshBody();
  if (saved && typeof saved === "object") {
    if (typeof saved.hunger === "number") b.hunger = Math.min(1, Math.max(0, saved.hunger));
    if (saved.tools) b.tools = { pick: Math.min(4, saved.tools.pick | 0), axe: Math.min(4, Math.max(2, saved.tools.axe | 0)) };
    for (const s of BODY_SKILLS) {
      const v = saved.skills && saved.skills[s.id];
      if (v) b.skills[s.id] = { lv: Math.min(SKILL_MAX, Math.max(1, v.lv | 0)), xp: Math.max(0, +v.xp || 0) };
    }
  }
  return b;
}
export const bodyToSave = b => ({ hunger: +b.hunger.toFixed(3), skills: b.skills, tools: b.tools });

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
export const axeBonus = b => { const t = (b && b.tools && b.tools.axe) || 2; return t >= 4 ? 0.5 : t >= 3 ? 0.25 : 0; };
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
