// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE SICKNESSES OF 1683, as a settlement in the woods would know them. Each has its season and its cause, how long
// it lasts, how often it kills (a day at a time), and how readily it passes from one to the next. A doctor in a
// hospital sees them through sooner and loses fewer, and keeping the sick apart there slows it spreading; the
// smallpox and the plague, once lived through, are never caught again.

// days: how long it lasts; die: the chance a day that it kills; spread: the chance a day that each sick one gives it
// to each of the others (shared rooms make it likelier); immune: lived through, never caught again
export const DISEASES = {
  fever:       { name: "a fever",        days: [3, 5],  die: 0.03,  spread: 0,     note: "A fever: a few days abed." },
  cough:       { name: "a winter cough", days: [2, 4],  die: 0.008, spread: 0.06,  note: "A cough that goes round in the cold." },
  flux:        { name: "the flux",       days: [3, 6],  die: 0.045, spread: 0.05,  note: "The bloody flux, from foul water: wells keep it off." },
  ague:        { name: "the ague",       days: [4, 8],  die: 0.012, spread: 0,     note: "The shaking ague, from the marshy ground by water." },
  smallpox:    { name: "the smallpox",   days: [6, 10], die: 0.08,  spread: 0.12,  immune: true, note: "The smallpox: very catching, often deadly; never caught twice." },
  consumption: { name: "consumption",    days: [10, 18], die: 0.025, spread: 0.015, note: "A wasting sickness of the lungs, long and slow." },
  plague:      { name: "the plague",     days: [4, 7],  die: 0.12,  spread: 0.16,  immune: true, note: "The plague. The worst there is." },
};
// what a newcomer might bring up the road with them (the 15% who bring anything)
export const CARRIED = [["smallpox", 3], ["flux", 3], ["cough", 2], ["consumption", 1], ["plague", 1]];
export const diseaseName = p => (p && p.disease && DISEASES[p.disease] ? DISEASES[p.disease].name : "a fever");
export function weighted(list, r = Math.random) { const tot = list.reduce((a, [, w]) => a + w, 0); let x = r() * tot; for (const [id, w] of list) if ((x -= w) <= 0) return id; return list[0][0]; }
// falling ill: what with, by the season and the place (and the plague in the country round about)
export function catchSomething(town, { near = false, winter = false, season = "", well = false } = {}) {
  const list = [["fever", 5], ["consumption", 0.6]];
  if (winter) list.push(["cough", 6]);
  if (season === "summer" || season === "autumn") list.push(["flux", well ? 1 : 4], ["ague", 2]);
  if (near) list.push(["plague", 5], ["smallpox", 2]); else list.push(["smallpox", 0.5]);
  return weighted(list);
}
export function sicken(p, id) {
  const D = DISEASES[id] || DISEASES.fever;
  p.disease = id; p.sick = D.days[0] + Math.floor(Math.random() * (D.days[1] - D.days[0] + 1));
}

// a newcomer taken in: about one in seven brings something up the road with them, and is told of when they've come
// (every way a settler arrives goes through here: up the road on their own, sent for, to a settlement in the forest,
//  the gunsmith from Suhl)
export function newcomerMayCarry(town, p, tell, where = null) {
  if (!town || !town.techGates || Math.random() >= 0.15) return false;
  sicken(p, weighted(CARRIED));
  setTimeout(() => tell && tell(p, where), 5000);
  return true;
}
