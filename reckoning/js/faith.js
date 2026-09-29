// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Faith and law, as the first Forester has them, fitted to a clearing that
// grows into a town. Seven creeds walk out of a North German wood in 1683, in
// the proportions they walked out of it then; each changes what its people do
// and what they will bear. A state creed may be proclaimed; a church or a
// shrine is raised to one faith, not to faith in general; a dissenter under a
// proclaimed creed, with its church standing in sight, may in the end walk in.
//
// And the law: a miserable settler may steal in the night. A jail and a watch
// catch them, and the jail holds them a day; without either, it goes unpunished.
// The Edict of Expulsion puts every dissenter out on the road at once.

import { rng } from "./core.js";

export const FAITHS = {
  lutheran: { name: "Lutheran", one: "a Lutheran", house: "Lutheran Church", shrine: "Lutheran Prayer House", weight: 40, stubborn: 0.5,
    creed: "Faith alone, and the work in front of you is holy — a cobbler serves God by making good shoes.",
    rule: "Obedient to the magistrate: never steals from the stores, however miserable." , meek: true },
  catholic: { name: "Roman Catholic", one: "a Catholic", house: "Catholic Chapel", shrine: "Catholic Shrine", weight: 18, stubborn: 0.7, workMul: 1.08,
    creed: "The Church, the sacraments, and the corporal works of mercy: feed the hungry, and it is counted.",
    rule: "Keeps the holy days, and works 8% slower for them. Two to everyone's mood while there is bread to give." },
  reformed: { name: "Reformed", one: "a Calvinist", house: "Reformed Church", shrine: "Reformed Prayer House", weight: 14, stubborn: 0.7, workMul: 0.9,
    creed: "The plain preached Word, no image in the building, and diligence in a calling as the sign of election.",
    rule: "Works 10% faster than anyone." },
  anabaptist: { name: "Anabaptist", one: "a Mennonite", house: "Mennonite Meeting House", shrine: "Mennonite Meeting Room", weight: 10, stubborn: 0.9, pacifist: true, meek: true,
    creed: "Baptism on confession, the community of goods, and nonresistance — the sword is outside the perfection of Christ.",
    rule: "Will never take up a weapon: hides from raiders with the children. Never steals." },
  jewish: { name: "Jewish", one: "a Jew", house: "Synagogue", shrine: "Prayer Room", weight: 7, stubborn: 0.95, purse: 14,
    creed: "The Law and the covenant, kept whole in a foreign town under a charter that can be revoked at a month's notice.",
    rule: "Arrives with capital: 14 DM into the treasury." },
  orthodox: { name: "Orthodox", one: "an Orthodox", house: "Orthodox Church", shrine: "Orthodox Chapel", weight: 6, stubborn: 0.8, fast: true,
    creed: "The unchanged rite, the icons, and the fast — near two hundred days of the year kept off meat and oil.",
    rule: "Fasts: a hungry settlement costs them half as much." },
  muslim: { name: "Muslim", one: "a Muslim", house: "Mosque", shrine: "Prayer House", weight: 5, stubborn: 0.85,
    creed: "The one God, the five prayers, and zakat — a fixed share of what you own owed to the poor, not given as a favour.",
    rule: "Pays zakat: two to the mood of the unhappiest in the settlement." },
};
export const FAITH_IDS = Object.keys(FAITHS);
export const HOME_FAITH = "lutheran";          // Hamburg, and so your family
export const faithOf = p => (p && FAITHS[p.faith]) ? p.faith : HOME_FAITH;

// a wanderer's creed, weighted to where you are standing (the same every time for the same person)
export function rollFaith(seed) {
  const r = rng(seed * 7 + 3)();
  const total = FAITH_IDS.reduce((n, id) => n + FAITHS[id].weight, 0);
  let roll = r * total;
  for (const id of FAITH_IDS) { roll -= FAITHS[id].weight; if (roll <= 0) return id; }
  return HOME_FAITH;
}

// who believes what, and what stands for each: counted when asked (a clearing is small)
export function census(town) {
  const S = town.S, c = { house: {}, shrine: {}, flock: {}, dissent: 0 };
  for (const id of FAITH_IDS) c.house[id] = c.shrine[id] = c.flock[id] = 0;
  for (const b of S.buildings) {
    if (!b.done) continue;
    if (b.type === "church") c.house[b.faith || HOME_FAITH]++;
    else if (b.type === "shrine") c.shrine[b.faith || HOME_FAITH]++;
  }
  // (you and your brother or sister are of Hamburg's church, and count)
  c.flock[HOME_FAITH] += 2;
  for (const p of S.people) {
    if (p.child) continue;
    const f = faithOf(p); c.flock[f]++;
    if (S.stateFaith && f !== S.stateFaith) c.dissent++;
  }
  return c;
}
// what the next church or shrine is raised to: the state creed, or else the biggest congregation
export function dedication(town) {
  if (town.S.stateFaith) return town.S.stateFaith;
  const c = census(town);
  return FAITH_IDS.reduce((a, b) => c.flock[b] > c.flock[a] ? b : a, HOME_FAITH);
}

// the soul's share of a mood (as the first Forester weighs it)
export function faithReasons(town, p) {
  const r = [], S = town.S, f = faithOf(p), F = FAITHS[f], c = census(town);
  if (S.stateFaith === f) r.push([11, "the state professes their faith"]);
  else if (S.stateFaith) r.push([-13, `a state church not their own (${FAITHS[S.stateFaith].name})`]);
  const h = Math.min(2, c.house[f]), s = Math.min(2, c.shrine[f]);
  if (h) r.push([h * 13, h > 1 ? `two houses of their own faith` : `a ${F.house} of their own`]);
  else if (s) r.push([s * 6, "somewhere of their own to pray"]);
  // (a clearing of a handful doesn't miss a church yet; a village does)
  else if (S.people.length >= 4) r.push([-7, "nowhere of their own to pray"]);
  if (S.stateFaith === f && c.dissent === 0 && S.people.length >= 2) r.push([9, "one faith, one flock"]);
  if (S.people.filter(q => !q.child).length >= 4 && c.flock[f] === 1 && S.stateFaith !== f) r.push([-8, "alone in their faith here"]);
  return r;
}

// the slow road: a dissenter under a proclaimed creed, its church standing, may walk into it. Called once a day.
// Returns the people who came over.
export function dailyConversion(town) {
  const S = town.S, st = S.stateFaith; if (!st) return [];
  const c = census(town); if (!c.house[st]) return [];
  const out = [];
  for (const p of S.people) {
    if (p.child) continue;
    const f = faithOf(p); if (f === st) { p.doubt = 0; continue; }
    const anchor = c.house[f] ? 0.15 : c.shrine[f] ? 0.5 : 1;
    const alone = c.flock[f] <= 1 ? 1.6 : c.flock[f] <= 2 ? 1.15 : 0.7;
    p.doubt = (p.doubt || 0) + 0.22 * anchor * alone * (1 - FAITHS[f].stubborn);
    if (p.doubt >= 1) { p.doubt = 0; p.was = f; p.faith = st; out.push(p); }
  }
  return out;
}
