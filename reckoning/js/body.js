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

export function freshBody() {
  const skills = {};
  for (const s of BODY_SKILLS) skills[s.id] = { lv: 1, xp: 0 };
  return { hunger: 1, skills };
}
export function restoreBody(saved) {
  const b = freshBody();
  if (saved && typeof saved === "object") {
    if (typeof saved.hunger === "number") b.hunger = Math.min(1, Math.max(0, saved.hunger));
    for (const s of BODY_SKILLS) {
      const v = saved.skills && saved.skills[s.id];
      if (v) b.skills[s.id] = { lv: Math.min(SKILL_MAX, Math.max(1, v.lv | 0)), xp: Math.max(0, +v.xp || 0) };
    }
  }
  return b;
}
export const bodyToSave = b => ({ hunger: +b.hunger.toFixed(3), skills: b.skills });

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
