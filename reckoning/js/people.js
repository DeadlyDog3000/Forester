// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// What a settler is: what they have learned (skills), what they were born as
// (a temperament), what life here has done to them (a mark), and so how they
// feel (a mood of their own, on top of the settlement's). All of it as the
// first Forester has it — the same eleven skills climbing from one to a
// hundred, the same six pairs of temperaments, the same marks — fitted to the
// few systems Reckoning has. Every one bends a number that was already there.

import { rng } from "./core.js";
import { FAITHS, faithOf, rollFaith, faithReasons } from "./faith.js";

// ---- what a pair of hands has learned ----
export const SKILLS = [
  { id: "woodcutting", name: "Woodcutting", desc: "Fells trees faster" },
  { id: "quarrying", name: "Quarrying", desc: "Breaks stone and ore faster" },
  { id: "foraging", name: "Foraging", desc: "Gathers wild seed faster" },
  { id: "farming", name: "Farming", desc: "Raises and reaps crops faster" },
  { id: "hunting", name: "Hunting", desc: "Takes game faster" },
  { id: "building", name: "Building", desc: "Raises and carries faster" },
  { id: "smithing", name: "Smithing", desc: "Works the forge and the furnace faster" },
  { id: "crafting", name: "Crafting", desc: "Saws, bakes and fires brick faster" },
  { id: "physicking", name: "Physicking", desc: "Mends and cures faster" },
  { id: "fighting", name: "Fighting", desc: "Strikes harder hand to hand" },
  { id: "marksmanship", name: "Marksmanship", desc: "Shoots harder" },
];
export const SKILL_NAME = Object.fromEntries(SKILLS.map(s => [s.id, s.name]));
export const SKILL_MAX = 100;
// what each work teaches, and is done with
export const JOB_SKILL = { woodcutter: "woodcutting", hauler: "building", farmer: "farming", baker: "crafting", quarryman: "quarrying", sawyer: "crafting", brickmaker: "crafting", miner: "quarrying", smelter: "smithing", smith: "smithing", watch: "fighting", doctor: "physicking" };
export const skillLvl = (p, id) => Math.max(1, Math.min(SKILL_MAX, (p && p.sk && p.sk[id]) || 1));
// a master works in a little under half the time, and strikes half again as hard
export const workSkill = (p, id) => 1 - 0.55 * (skillLvl(p, id) - 1) / (SKILL_MAX - 1);
export const armSkill = (p, id) => 1 + 0.55 * (skillLvl(p, id) - 1) / (SKILL_MAX - 1);
// the climb steepens: cheap to make a passable hand, dear to make a master
export const skillXpNeeded = lvl => Math.round(6 + lvl * 2.6);
export const trainCost = lvl => 3 + Math.floor(lvl * 0.8);
export const MASTER_AT = 40;

// ---- what a soul is like: one of six opposed pairs, for life ----
export const TEMPERS = [
  { id: "industrious", name: "Industrious", blurb: "Works unwatched, and rests badly.", does: "An eighth quicker at every kind of work." },
  { id: "idle", name: "Idle", blurb: "Works when watched, and wanders when not.", does: "A seventh slower at every job." },
  { id: "hot", name: "Hot-tempered", blurb: "Takes offence quickly, and keeps it warm.", does: "Five off their mood whenever the settlement is doing badly (under 40)." },
  { id: "even", name: "Even-tempered", blurb: "Slow to quarrel, and quick to let it go.", does: "Bad days cost them half as much." },
  { id: "gregarious", name: "Gregarious", blurb: "Thrives in company, and pines without it.", does: "Five to their mood among six or more, seven against it in a settlement of fewer." },
  { id: "solitary", name: "Solitary", blurb: "Wants elbow room, and sours in a crowd.", does: "Six off their mood among ten or more, four added while the settlement is small." },
  { id: "stout", name: "Stout-hearted", blurb: "Stands when others run, and strikes the harder for it.", does: "Strikes a seventh harder, and a raid costs them nothing in nerve." },
  { id: "timid", name: "Timid", blurb: "Unnerved by trouble, and slower to answer it.", does: "Strikes a seventh softer, and twelve off their mood while raiders are about. Surviving a fight ends it." },
  { id: "generous", name: "Generous", blurb: "Shares what they have, and is thought well of for it.", does: "Two to everyone's mood while they live here." },
  { id: "grasping", name: "Grasping", blurb: "Keeps what they have, and is known for that too.", does: "Two off everyone's mood while they live here." },
  { id: "hardy", name: "Hardy", blurb: "Shrugs off the cold and the fever both.", does: "The winter's cold costs them half as much." },
  { id: "sickly", name: "Sickly", blurb: "Takes the cold before anybody else.", does: "The winter costs them six more, and the cold half again." },
];
export const TEMPER = Object.fromEntries(TEMPERS.map(t => [t.id, t]));
// what life here did to them: earned by something that happened, and shown at once
export const MARKS = {
  hardened: { name: "Hardened", blurb: "Has stood in a fight, and is less afraid of the next.", does: "Strikes a seventh harder, and never feels the dread of a raid again." },
  contented: { name: "Contented", blurb: "Has been warm, fed and unbothered a long while.", does: "Six to their mood, as long as nothing goes badly wrong." },
  disgraced: { name: "Disgraced", blurb: "Has been in the jail, and it is remembered.", does: "Seven off their mood." },
  bitter: { name: "Bitter", blurb: "Was beaten down in a raid and left lying.", does: "Five off their mood." },
};
export const temperWork = p => p.temper === "industrious" ? 0.88 : p.temper === "idle" ? 1.15 : 1;
export const temperArm = p => p.temper === "stout" || p.mark === "hardened" ? 1.15 : p.temper === "timid" ? 0.85 : 1;

// Everyone from before there were skills gets them on first sight, the same every time (from their seed):
// all eleven at one, the skill of their work already a little way up, a temperament for life.
export function ensurePerson(p) {
  if (p.sk && p.temper && p.faith) return p;
  const r = rng((p.seed || p.name.length * 97) + 17);
  p.sk ??= {};
  if (!p.child) {
    const main = JOB_SKILL[p.job || "hauler"];
    if (main && !p.sk[main]) p.sk[main] = 6 + Math.floor(r() * 12);
    // and a second thing they are passable at
    const other = SKILLS[Math.floor(r() * SKILLS.length)].id;
    if (!p.sk[other]) p.sk[other] = 2 + Math.floor(r() * 6);
  }
  p.temper ??= TEMPERS[Math.floor(r() * TEMPERS.length)].id;
  p.faith ??= rollFaith(p.seed || 1);
  return p;
}

// Work teaches: called when a task is finished, never per frame. A master nearby (40 and up) teaches faster.
// Returns the new level when a tenth is reached (worth saying), else null.
export function gainSkill(p, id, amount = 1, masterNear = false) {
  if (!p || p.child || !id) return null;
  p.sk ??= {}; p.sx ??= {};
  const lvl = skillLvl(p, id);
  if (lvl >= SKILL_MAX) return null;
  if (masterNear && lvl < MASTER_AT) amount *= 1.6;
  p.sx[id] = (p.sx[id] || 0) + amount;
  let said = null;
  while (skillLvl(p, id) < SKILL_MAX && p.sx[id] >= skillXpNeeded(skillLvl(p, id))) {
    p.sx[id] -= skillXpNeeded(skillLvl(p, id));
    p.sk[id] = skillLvl(p, id) + 1;
    if (p.sk[id] % 10 === 0 || p.sk[id] === SKILL_MAX) said = p.sk[id];
  }
  return said;
}
// the three they are best at, best first
export function topSkills(p, n = 3) {
  return SKILLS.map(s => ({ id: s.id, name: s.name, lvl: skillLvl(p, s.id) })).filter(s => s.lvl > 1).sort((a, b) => b.lvl - a.lvl).slice(0, n);
}

// How one person feels: the settlement's contentment, and then their own. 0 to 100, with the reasons.
export function moodOf(town, p) {
  const c = town.contentment(), why = [];
  const add = (n, text) => { if (n) why.push([n, text]); return n; };
  let v = c.value;
  const pop = town.S.people.length + 2, t = p.temper, bad = c.value < 40;
  // a bad time, felt harder or softer
  if (t === "hot" && bad) v += add(-5, "hot-tempered, and things are going badly");
  if (t === "even" && bad) v += add(Math.round((40 - c.value) / 2), "even-tempered: takes it in their stride");
  if (t === "gregarious") v += add(pop >= 6 ? 5 : -7, pop >= 6 ? "gregarious: good company" : "gregarious: too few people");
  if (t === "solitary") v += add(pop >= 10 ? -6 : pop <= 5 ? 4 : 0, pop >= 10 ? "solitary: too crowded" : "solitary: room to breathe");
  if (t === "timid" && p.mark !== "hardened" && town.raids && town.raids.active) v += add(-12, "timid: raiders about");
  if (town.winter) {
    if (t === "sickly") v += add(town.S.cold ? -16 : -6, "sickly: the winter");
    if (t === "hardy" && town.S.cold) v += add(10, "hardy: the cold barely touches them");
  }
  // the others: a generous neighbour is a pleasure, a grasping one a trial
  for (const q of town.S.people) {
    if (q === p || q.child) continue;
    if (q.temper === "generous") v += add(2, `${q.name} is generous`);
    if (q.temper === "grasping") v += add(-2, `${q.name} is grasping`);
  }
  // faith: the state creed, a house or a shrine of their own, being alone in it
  for (const [n, w] of faithReasons(town, p)) v += add(n, w);
  const f = faithOf(p);
  if (FAITHS[f].fast && town.S.hungry) v += add(10, "fasting: hunger is nothing new");
  for (const q of town.S.people) {
    if (q === p || q.child) continue;
    if (faithOf(q) === "catholic" && town.S.bread > 0) { v += add(2, `alms from ${q.name}`); break; }
  }
  if (p.sick > 0) v += add(-10, "sick");
  if (p.mark === "disgraced") v += add(-7, "disgraced: the jail");
  if (p.mark === "contented") v += add(6, "contented");
  if (p.mark === "bitter") v += add(-5, "bitter");
  // their own bed, and work they are good at
  if (!p.child && town.bedOf && !town.bedOf(p)) v += add(-8, "no bed of their own");
  const main = JOB_SKILL[p.job || "hauler"];
  if (main && !p.child) { const best = topSkills(p, 1)[0]; if (best && best.id === main && best.lvl >= 10) v += add(3, "work they're good at"); }
  // zakat: the unhappiest are helped by the Muslim among them
  if (v < 40 && town.S.people.some(q => q !== p && !q.child && faithOf(q) === "muslim")) v += add(2, "zakat");
  return { value: Math.max(0, Math.min(100, Math.round(v))), why };
}
