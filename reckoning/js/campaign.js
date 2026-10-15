// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE CAMPAIGN: a crown of 1683 is yours, and Europe is the board. Season by season you raise regiments from your
// treasury, march on the towns of the crowns you're at war with — the battles fought by your own hand on the ground
// where the town stands, or left to your generals — and keep your neighbours sweet with envoys, gifts, trade and
// alliances, or not. They have their own minds: they war on each other and the borders move; the ones who fear or
// hate you declare war on you, march on your towns, and take them if you can't hold them. Lose every town and it's
// over; hold forty and Europe is yours (and you can go on).
//
// The map is the story's own (europe.js): the real coasts and the crowns' borders of 1683, every conquest laid over
// them. A town is a province: taking one takes the country round it.

import { NATIONS, NATION_FAITH, CITIES, buildGrid, cityOwner, gridOf, drawEurope, cityAt, nationAt, relWord, the, The, MAP_ASPECT, MG_W, MG_H } from "./europe.js";

const KEY = "reckoning.campaign.v1";
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
const WIN_CITIES = 40, REACH = 13, REGIMENT = 30;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const R = () => Math.random();
const pick = a => a[Math.floor(R() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// each crown's coats on the field, and how its army's made up
export const UNI_OF = {
  scotland: "english", england: "english", ireland: "irish", france: "french", castile: "spanish", aragon: "spanish", portugal: "spanish", hre: "imperial",
  brandenburg: "brandenburg", saxony: "saxon", bavaria: "bavarian", austria: "imperial", milan: "spanish", savoy: "french", venice: "imperial", tuscany: "imperial",
  papal: "imperial", naples: "spanish", sicily: "spanish", sweden: "swedish", denmark: "danish", poland: "polish", russia: "muscovite", cossacks: "muscovite",
  crimea: "ottoman", hungary: "imperial", transylvania: "polish", moldavia: "polish", wallachia: "polish", ottoman: "ottoman", algiers: "ottoman", tunis: "ottoman",
  tripoli: "ottoman", dutch: "dutch", morocco: "ottoman",
};
const STYLE = {
  west: [["musketeer", 0.58], ["pike", 0.15], ["grenadier", 0.1], ["cavalry", 0.1], ["sword", 0.07]],
  east: [["musketeer", 0.42], ["bow", 0.22], ["sword", 0.2], ["cavalry", 0.16]],
  steppe: [["musketeer", 0.42], ["cavalry", 0.22], ["sword", 0.16], ["bow", 0.1], ["pike", 0.1]],
  tsar: [["musketeer", 0.66], ["pike", 0.18], ["cavalry", 0.08], ["axe", 0.08]],
};
const styleOf = id => ({ ottoman: "east", crimea: "east", algiers: "east", tunis: "east", tripoli: "east", morocco: "east", poland: "steppe", cossacks: "steppe", moldavia: "steppe", wallachia: "steppe", transylvania: "steppe", russia: "tsar" }[id] || "west");
function muster(id, men) {
  const out = {}; let left = men;
  for (const [k, f] of STYLE[styleOf(id)]) { const n = Math.min(left, Math.round(men * f)); if (n > 0) { out[k] = n; left -= n; } }
  if (left > 0) out.musketeer = (out.musketeer || 0) + left;
  return out;
}

// ---- the state ----
let C = null, ctx = null, startBattle = null;
const save = () => { try { if (C) localStorage.setItem(KEY, JSON.stringify(C)); } catch (e) {} };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };

// the land as it stands: 1683's, and every town taken since (kept as a map of cells, handed to the map as E.conq)
let own = new Map();
function E() {
  if (!C.E.conq || C.E.conq.length !== own.size || C._dirty) { C.E.conq = [...own].map(([k, to]) => { const [c, r] = k.split(",").map(Number); return { c, r, to }; }); C._dirty = false; }
  return C.E;
}
const grid = () => buildGrid(E());
function citiesOfNow(g, id) { return CITIES.filter(ct => cityOwner(g, ct) === id); }
const cellOf = ct => { const [x, y] = gridOf(ct[1], ct[2]); return [Math.floor(x), Math.floor(y)]; };

// a new campaign, as a crown
function fresh(me) {
  const rel = {}, army = {};
  for (const id of Object.keys(NATIONS)) {
    rel[id] = Math.round((NATION_FAITH[id] === NATION_FAITH[me] ? 18 : 0) + (R() - 0.5) * 36);
    army[id] = NATIONS[id].strength * 10 + Math.floor(R() * 8);
  }
  delete rel[me];
  return { v: 1, me, year: 1683, s: 0, gold: 200 + NATIONS[me].strength * 60, army: NATIONS[me].strength * 10 + 6, moved: false, did: {},
    E: { rel, war: {}, wars: [], conq: [], pact: {}, plague: {}, famine: {}, beaten: {}, news: [], gridV: 2 },
    foes: army, ally: {}, truce: {}, warT: {}, took: {}, lost: {}, events: [], log: [], pending: null, over: null, won: false, own: [] };
}
function begin(me) { C = fresh(me); own = new Map(); say(`${The(me)} — ${SEASONS[0]} ${C.year}`, `You take the crown. ${citiesOfNow(grid(), me).length} towns, ${C.army} regiments, ${C.gold} thalers in the treasury.`); save(); }
function resume() { C = load(); if (!C) return false; own = new Map(C.own || []); C._dirty = true; return true; }
function persist() { C.own = [...own]; save(); }
function say(title, sub = "") { C.log.unshift({ t: `${SEASONS[C.s]} ${C.year}`, title, sub }); C.log.length = Math.min(C.log.length, 60); }

// ---- the ground: whose, and how far from whose ----
// (a town taken: its country with it — the loser's land round it, a day or two's march across)
function seize(ct, to) {
  const g = grid(), from = cityOwner(g, ct); if (!from || from === to) return 0;
  let [x0, y0] = cellOf(ct);
  // (its own cell may be the sea or the woods: the nearest of the loser's)
  if (g[y0] && g[y0][x0] !== from) { let best = null, bd = 99; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (g[y0 + dy] && g[y0 + dy][x0 + dx] === from && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); best = [x0 + dx, y0 + dy]; } if (!best) return 0; [x0, y0] = best; }
  const q = [[x0, y0]], seen = new Set([x0 + "," + y0]); let n = 0;
  // (no further than halfway to the loser's next town: the province is the town's own country)
  const others = CITIES.filter(o => o !== ct && cityOwner(g, o) === from).map(cellOf);
  while (q.length && n < 520) {
    const [c, r] = q.shift(); if (g[r][c] !== from) continue;
    if (others.some(([ox, oy]) => Math.hypot(c - ox, r - oy) < Math.hypot(c - x0, r - y0))) continue;
    own.set(c + "," + r, to); n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dx) + "," + (r + dy); if (!seen.has(k) && g[r + dy] && g[r + dy][c + dx] === from && Math.hypot(c + dx - x0, r + dy - y0) < 13) { seen.add(k); q.push([c + dx, r + dy]); } }
  }
  C._dirty = true;
  return n;
}
// how far a town lies from a crown's own land, in cells (up to REACH: further is out of reach)
function distFrom(g, id, ct) {
  const [x, y] = cellOf(ct); let best = 99;
  for (let dy = -REACH; dy <= REACH; dy++) { const row = g[y + dy]; if (!row) continue; for (let dx = -REACH; dx <= REACH; dx++) if (row[x + dx] === id) { const d = Math.hypot(dx, dy); if (d < best) best = d; } }
  return best;
}
function neighbours(g, id) {
  const out = new Set();
  for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++) {
    if (g[r][c] !== id) continue;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const n = g[r + dy] && g[r + dy][c + dx]; if (n && n !== id && NATIONS[n]) out.add(n); }
  }
  return out;
}
const atWar = id => !!C.E.war[id];
const alive = (g, id) => citiesOfNow(g, id).length > 0;

// ---- a fight for a town: by your hand, or your generals' ----
// (strength: your field army against the town's garrison and the defending crown's army; walls make a big town
//  harder)
function garrison(ct) { return ct[3] * 4 + 2; }
// (the levy: a crown down to its last few towns, every man in them takes up arms — the fewer, the fiercer)
const levy = towns => Math.round(18 / Math.max(1, towns));
function odds(att, def, walls) { const a = Math.pow(att, 1.25), d = Math.pow(def * (walls ? 1.3 : 1), 1.25); return a / (a + d); }
// the outcome applied, however it was decided: casualties both ways; the town changes hands if the attacker won
function settle(o, won, myLossK, theirLossK) {
  const mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att;
  C.army = Math.max(0, Math.round(C.army - mine * myLossK));
  C.foes[o.foe] = Math.max(0, Math.round(C.foes[o.foe] - Math.max(0, theirs - garrison(o.ct)) * theirLossK));
  const name = o.ct[0];
  if (o.attack) {
    if (won) { seize(o.ct, C.me); C.took[o.foe] = (C.took[o.foe] || 0) + 1; for (const id of Object.keys(C.E.rel)) C.E.rel[id] -= id === o.foe ? 8 : 2; say(`${name} is yours`, `Taken from ${the(o.foe)}.`); }
    else say(`Beaten before ${name}`, `Your army falls back with what it has left: ${C.army} regiments.`);
  } else {
    if (won) say(`${name} holds`, `${The(o.foe)}'s army is thrown back.`);
    else { seize(o.ct, o.foe); C.lost[o.foe] = (C.lost[o.foe] || 0) + 1; say(`${name} has fallen`, `${The(o.foe)} takes it.`); }
  }
  checkEnd();
}
function auto(o) {
  const p = odds(o.att, o.def, o.walls), attWins = R() < p, won = o.attack ? attWins : !attWins;
  settle(o, won, won ? 0.08 + R() * 0.1 : 0.25 + R() * 0.2, won ? 0.3 + R() * 0.2 : 0.08 + R() * 0.1);
  return won;
}
// fought by your hand: the field at the town, your company and theirs as big as the armies are, the walls the
// defender's — on whichever side you are
function fight(o) {
  const g = grid(), mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att;
  const myMen = clamp(Math.round(10 + mine / 2.2), 10, 42), theirMen = clamp(Math.round(10 + theirs / 2.2), 10, 48);
  const ally = Object.keys(C.ally).find(id => C.ally[id] && C.E.wars.some(w => (w.a === id && w.b === o.foe) || (w.b === id && w.a === o.foe)));
  const s = C.s, hourR = R();
  const def = o.attack ? 1 : 0, ct = o.ct;
  const things = [];
  // (the town behind its defenders: its houses, its church; a great town's walls and towers further off)
  const bu = def === 1 ? 1 : -1;
  for (let i = 0; i < 3 + ct[3]; i++) things.push(["house", bu * (62 + (i % 3) * 9), (i - 2) * 16 + 34, (i * 0.7) % 1.5, 7, 5, i % 2 ? "tile" : "thatch"]);
  things.push(["church", bu * 90, -34, 0.2, 16 + ct[3] * 3, 9]);
  if (ct[3] >= 3) { things.push(["city", bu * 150, -90, 90, 11]); things.push(["spire", bu * 190, 10, 90]); }
  const b = {
    id: "cmp-" + ct[0], campaign: true, name: ct[0], date: `${SEASONS[s]} ${C.year}`, year: C.year, lon: ct[1], lat: ct[2],
    at: o.attack ? `You march on ${the(o.foe)}'s town` : `${The(o.foe)} marches on your town`,
    hour: hourR < 0.1 ? "night" : hourR < 0.35 ? "morning" : hourR < 0.8 ? "afternoon" : "evening",
    cloud: s === 3 ? 0.7 : s === 2 ? 0.5 : s === 0 ? 0.35 : 0.1, mist: s === 2 ? 0.3 : s === 3 ? 0.25 : 0,
    fort: o.walls ? def : null, won: undefined, you: 0,
    sides: [
      { name: NATIONS[C.me].name, lead: "you", hold: o.attack ? undefined : 999, cos: [{ uni: UNI_OF[C.me], muster: muster(C.me, myMen), guns: Math.min(3, Math.floor(mine / 22)) }, ...(ally && !o.walls ? [{ uni: UNI_OF[ally], muster: muster(ally, 14), guns: 1 }] : [])] },
      { name: NATIONS[o.foe].name, lead: "their officers", hold: o.attack ? 999 : undefined, cos: [{ uni: UNI_OF[o.foe] === UNI_OF[C.me] ? (UNI_OF[C.me] === "imperial" ? "bavarian" : "imperial") : UNI_OF[o.foe], muster: muster(o.foe, theirMen), guns: Math.min(3, Math.floor(theirs / 22)) }] },
    ],
    map: { snow: s === 3, things },
  };
  C.pending = { ...o, ct: o.ct[0] }; persist();
  b.onEnd = (won, killed, lost) => {
    const P = C.pending; if (!P) return; C.pending = null;
    const k = Math.min(0.9, (lost || 0) / myMen) * 0.8 + 0.05, t = Math.min(0.9, (killed || 0) / theirMen) * 0.8 + 0.05;
    settle({ ...P, ct: CITIES.find(c => c[0] === P.ct) }, won, k, t); persist();
  };
  startBattle(b);
}
// a battle fought by hand and never finished (left from the pause menu): the army withdrew from it — lost
function abandoned() {
  if (!C || !C.pending || (window.__G && window.__G.arena)) return;
  const P = C.pending; C.pending = null;
  settle({ ...P, ct: CITIES.find(c => c[0] === P.ct) }, false, 0.3, 0.05);
  C.log[0].sub += " (You left the field.)"; persist();
}

// ---- your season's doings ----
function march(ct) {
  const g = grid(), foe = cityOwner(g, ct);
  if (C.moved || !foe || !atWar(foe) || C.army < 5 || distFrom(g, C.me, ct) > REACH) return null;
  C.moved = true;
  return { attack: true, foe, ct, att: C.army, def: garrison(ct) + Math.round((C.foes[foe] || 0) * 0.55), walls: ct[3] >= 3 || (ct[3] === 2 && R() < 0.5) };
}
function recruit(n) { const k = Math.min(n, Math.floor(C.gold / REGIMENT)); if (k <= 0) return; C.gold -= k * REGIMENT; C.army += k; persist(); }
const income = g => 40 + citiesOfNow(g, C.me).reduce((t, ct) => t + ct[3] * 22, 0) + Object.keys(C.E.pact).filter(id => C.E.pact[id]).reduce((t, id) => t + 10 + NATIONS[id].strength * 4, 0);
const upkeep = () => Math.round(C.army * 1.6);
// diplomacy: what you can do with a crown this season
function diplo(id, what) {
  const r = C.E.rel, did = C.did[id] ||= {};
  const done = t => { did[what] = true; persist(); return t; };
  if (what === "envoy") { if (did.envoy || atWar(id) || C.gold < 40) return null; C.gold -= 40; r[id] = clamp(r[id] + 6 + Math.round(R() * 7), -100, 100); return done(`Your envoy is received at ${courtOf(id)}.`); }
  if (what === "gift") { if (did.gift || atWar(id) || C.gold < 150) return null; C.gold -= 150; r[id] = clamp(r[id] + 18 + Math.round(R() * 8), -100, 100); return done(`${The(id)} accepts your gift.`); }
  if (what === "pact") { if (atWar(id) || C.E.pact[id] || r[id] < 20) return null; C.E.pact[id] = true; r[id] += 5; return done(`A trade pact with ${the(id)}: their merchants in your towns, yours in theirs.`); }
  if (what === "unpact") { C.E.pact[id] = false; r[id] -= 10; return done(`The trade pact with ${the(id)} is ended.`); }
  if (what === "ally") { if (atWar(id) || C.ally[id] || r[id] < 55) return null; if (R() < 0.25 + (r[id] - 55) / 60) { C.ally[id] = true; r[id] += 5; return done(`${The(id)} is your ally: it will join your wars.`); } r[id] -= 3; return done(`${The(id)} won't bind itself to you — not yet.`); }
  if (what === "unally") { C.ally[id] = false; r[id] -= 20; return done(`You break the alliance with ${the(id)}.`); }
  if (what === "war") {
    if (atWar(id) || (C.truce[id] || 0) > 0) return null;
    declare(id, C.me);
    for (const o of Object.keys(r)) r[o] -= C.ally[o] ? 0 : 4;
    return done(`You declare war on ${the(id)}.`);
  }
  if (what === "peace") {
    if (!atWar(id) || did.peace) return null;
    const ratio = C.army / Math.max(1, C.foes[id]), p = clamp(0.15 + ratio * 0.18 + (C.took[id] || 0) * 0.12 - (C.lost[id] || 0) * 0.06 + (C.warT[id] || 0) * 0.03 + r[id] / 300, 0.05, 0.9);
    did.peace = true;
    if (R() < p) { makePeace(id); return done(`${The(id)} agrees to peace.`); }
    persist(); return `${The(id)} refuses your peace — for now.`;
  }
  return null;
}
const courtOf = id => { const c = citiesOfNow(grid(), id).sort((a, b) => b[3] - a[3])[0]; return c ? c[0] : the(id); };
function declare(id, by) {
  C.E.war[id] = true; C.warT[id] = 0; C.E.pact[id] = false; C.ally[id] = false;
  C.E.rel[id] = Math.min(C.E.rel[id], -40);
  // (your allies: into it with you, against them)
  for (const a of Object.keys(C.ally)) if (C.ally[a] && a !== id && C.E.rel[a] >= 30 && !C.E.wars.some(w => (w.a === a && w.b === id) || (w.a === id && w.b === a))) { C.E.wars.push({ a, b: id, battles: 0, withYou: true }); say(`${The(a)} joins your war`, `Your ally marches on ${the(id)}.`); }
  if (by !== C.me) say(`${The(id)} declares war on you!`, `Their army: some ${C.foes[id]} regiments.`);
}
function makePeace(id) { C.E.war[id] = false; C.truce[id] = 6; C.E.rel[id] = Math.max(C.E.rel[id] + 15, -20); C.E.wars = C.E.wars.filter(w => !(w.withYou && (w.a === id || w.b === id))); say(`Peace with ${the(id)}`, "A treaty is signed. Neither side may make war for six seasons."); }

// ---- the season ends: the treasury, the other crowns' doings, and what comes at you ----
function endSeason() {
  if (C.over || C.events.some(e => !e.done)) return;
  const g = grid(), ids = Object.keys(NATIONS).filter(id => id !== C.me && alive(g, id));
  C.gold += income(g) - upkeep();
  if (C.gold < 0) { const lose = Math.ceil(-C.gold / REGIMENT); C.army = Math.max(0, C.army - lose); C.gold = 0; say("The pay chest is empty", `${lose} regiments desert for want of pay.`); }
  // (the other crowns: their armies made up again; their tempers going back to where their faith puts them)
  for (const id of ids) {
    const cap = NATIONS[id].strength * 14 + citiesOfNow(g, id).length * 2;
    C.foes[id] = Math.min(cap, (C.foes[id] || 0) + Math.max(1, Math.round(NATIONS[id].strength * 1.2 + (C.E.plague[id] ? -2 : 0))));
    const home = (NATION_FAITH[id] === NATION_FAITH[C.me] ? 18 : 0) + (C.E.pact[id] ? 15 : 0) + (C.ally[id] ? 25 : 0) - (atWar(id) ? 40 : 0);
    C.E.rel[id] += Math.sign(home - C.E.rel[id]) * Math.min(2, Math.abs(home - C.E.rel[id]));
    if (C.E.pact[id] && (C.E.rel[id] < 0 || atWar(id))) { C.E.pact[id] = false; say(`${The(id)} ends your trade pact`); }
    if (C.ally[id] && C.E.rel[id] < 20) { C.ally[id] = false; say(`${The(id)} leaves your alliance`); }
    if (C.truce[id] > 0) C.truce[id]--;
    if (atWar(id)) C.warT[id] = (C.warT[id] || 0) + 1;
  }
  // (and they at each other: their wars begun, fought and ended, and the borders moving)
  crownsWar(g, ids);
  const g2 = grid(), mine = citiesOfNow(g2, C.me), nb = neighbours(g2, C.me), big = mine.length;
  // who'll make war on you: a neighbour that hates you, or fears you as you grow — and thinks itself able
  // (a new crown is watched for its first two years before anyone tries it)
  const seasons = (C.year - 1683) * 4 + C.s;
  for (const id of ids) {
    if (seasons < 8 || atWar(id) || C.ally[id] || (C.truce[id] || 0) > 0 || !nb.has(id) || !alive(g2, id)) continue;
    const p = 0.015 + Math.max(0, -C.E.rel[id]) / 500 + (big > 12 ? 0.03 : 0) + (big > 25 ? 0.05 : 0), able = C.foes[id] > C.army * 0.6 ? 1 : 0.3;
    // (fewer piling on when you've already enemies enough — a crown waits to see how those wars go)
    const already = Object.keys(C.E.war).filter(k => C.E.war[k]).length;
    if (R() < p * able * Math.pow(0.45, already)) declare(id, id);
  }
  // who'll make peace: worn out, or beaten
  for (const id of ids) if (atWar(id) && (C.warT[id] || 0) >= 3 && R() < 0.12 + (C.foes[id] < C.army * 0.5 ? 0.2 : 0) + (C.took[id] || 0) * 0.04)
    C.events.push({ kind: "peace", foe: id, gold: C.foes[id] < C.army * 0.4 ? 60 + NATIONS[id].strength * 30 : 0 });
  // who marches on your towns: each crown at war with you, now and then, at a town of yours within its reach
  for (const id of ids) {
    if (!atWar(id) || C.foes[id] < 8 || R() > (C.s === 3 ? 0.2 : 0.5)) continue;
    const near = mine.filter(ct => distFrom(g2, id, ct) <= REACH); if (!near.length) continue;
    const ct = pick(near), att = Math.round(C.foes[id] * (0.45 + R() * 0.25));
    C.events.push({ kind: "attack", foe: id, ct: ct[0], att, def: garrison(ct) + levy(mine.length) + Math.round(C.army * 0.7), walls: ct[3] >= 2 });
  }
  // a plague or a bad harvest, now and then
  if (R() < 0.08) { const id = pick(ids); C.E.plague[id] = 3; say(`Plague in ${the(id)}`, "Their armies thin."); C.foes[id] = Math.round(C.foes[id] * 0.8); }
  for (const id of Object.keys(C.E.plague)) if (--C.E.plague[id] <= 0) delete C.E.plague[id];
  // the season turns
  C.s = (C.s + 1) % 4; if (C.s === 0) C.year++;
  C.moved = false; C.did = {};
  say(`${SEASONS[C.s]} ${C.year}`, `${income(grid()) - upkeep() >= 0 ? "+" : ""}${income(grid()) - upkeep()} thalers a season. ${C.events.filter(e => !e.done).length ? "Things need your word." : ""}`);
  checkEnd(); persist();
}
function crownsWar(g, ids) {
  const W = C.E.wars;
  if (W.filter(w => !w.withYou).length < 4 && R() < 0.35) {
    const a = pick(ids), nb = [...neighbours(g, a)].filter(b => b !== C.me && !W.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)));
    if (nb.length) { const b = pick(nb); W.push({ a, b, battles: 0 }); say(`${The(a)} and ${the(b)} are at war`); }
  }
  for (const w of W.slice()) {
    if (!alive(grid(), w.a) || !alive(grid(), w.b)) { W.splice(W.indexOf(w), 1); continue; }
    if (R() > 0.45) continue;
    const sa = C.foes[w.a] + NATIONS[w.a].strength * 4, sb = C.foes[w.b] + NATIONS[w.b].strength * 4, aWins = R() < sa / (sa + sb);
    const win = aWins ? w.a : w.b, lose = aWins ? w.b : w.a, gg = grid();
    const target = citiesOfNow(gg, lose).filter(ct => distFrom(gg, win, ct) <= REACH);
    C.foes[lose] = Math.max(0, C.foes[lose] - 3 - Math.floor(R() * 4)); C.foes[win] = Math.max(0, C.foes[win] - 1 - Math.floor(R() * 2));
    if (target.length) { const ct = pick(target); seize(ct, win); if (ct[3] >= 2 || w.withYou) say(`${The(win)} takes ${ct[0]} from ${the(lose)}`); }
    w.battles++;
    if (!w.withYou && w.battles >= 3 && R() < 0.3) { W.splice(W.indexOf(w), 1); say(`${The(w.a)} and ${the(w.b)} make peace`); }
  }
}
function checkEnd() {
  const g = grid(), n = citiesOfNow(g, C.me).length;
  if (!n && !C.over) { C.over = "lost"; say("Your crown is lost", "The last of your towns has fallen."); }
  if (n >= WIN_CITIES && !C.won) { C.won = true; say("Europe is yours", `${n} towns under your crown. Play on, if you like.`); }
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !alive(g, id)) { C.E.war[id] = false; say(`${The(id)} is no more`, "Its last town is yours or another's."); }
}

// ---------------------------------------------------------------------------
//  the screens: choosing a crown, and the map
// ---------------------------------------------------------------------------
let view = { z: 1, ox: 0, oy: 0 }, sel = null, selCity = null, hov = null, hovCity = null, note = "", news = [];
export function initCampaign(c, battle) {
  ctx = c; startBattle = battle;
  $("cmpBack").onclick = () => ctx.screen("pvp");
  $("cmpNew").onclick = () => drawPick();
  $("cmpPick").addEventListener("click", e => { const b = e.target.closest("[data-crown]"); if (!b) return; if (load() && !confirm("Start a new campaign? The one you have now will be lost.")) return; begin(b.dataset.crown); sel = null; selCity = null; drawMap(true); });
  $("cmpEnd").onclick = () => {
    const before = C.log.length ? C.log[0] : null; endSeason();
    // (what happened while the season turned: the news of it, at the top)
    const fresh = []; for (const l of C.log) { if (l === before) break; fresh.push(l); }
    news = fresh.filter(l => !/^(Spring|Summer|Autumn|Winter) \d+$/.test(l.title)).reverse(); note = ""; drawMap();
  };
  $("cmpSide").addEventListener("click", sideClick);
  const cv = $("cmpMap");
  let drag = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const toMap = ([x, y]) => [view.ox + x / view.z, view.oy + y / view.z];
  const clampV = () => { view.z = clamp(view.z, 1, 6); view.ox = clamp(view.ox, 0, cv.width - cv.width / view.z); view.oy = clamp(view.oy, 0, cv.height - cv.height / view.z); };
  cv.addEventListener("wheel", e => { e.preventDefault(); const [px, py] = pos(e), [bx, by] = toMap([px, py]); view.z *= Math.exp(-e.deltaY * 0.0015); clampV(); view.ox = bx - px / view.z; view.oy = by - py / view.z; clampV(); paint(); }, { passive: false });
  cv.onmousedown = e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; };
  cv.onmousemove = e => {
    if (drag && e.buttons & 1) { const r = cv.getBoundingClientRect(), dx = (e.clientX - drag.x) * cv.width / r.width, dy = (e.clientY - drag.y) * cv.height / r.height; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; if (drag.moved > 5) { view.ox -= dx / view.z; view.oy -= dy / view.z; clampV(); paint(); return; } }
    if (!C) return;
    const p = toMap(pos(e)), ct = cityAt(cv, ...p, view.z), id = nationAt(E(), cv, ...p);
    cv.style.cursor = ct || id ? "pointer" : "grab";
    if (ct !== hovCity || id !== hov) { hovCity = ct; hov = id; paint(); }
  };
  cv.onmouseleave = () => { drag = null; hov = null; hovCity = null; paint(); };
  cv.onmouseup = e => {
    const moved = drag ? drag.moved : 0; drag = null; if (moved > 5 || !C) return;
    const p = toMap(pos(e)), ct = cityAt(cv, ...p, view.z);
    selCity = ct || null; sel = ct ? cityOwner(grid(), ct) : nationAt(E(), cv, ...p); note = ""; drawMap();
  };
  for (const b of document.querySelectorAll("#campaign .cmp-zoom button")) b.onclick = () => { const cx = cv.width / 2, cy = cv.height / 2, [bx, by] = toMap([cx, cy]); view.z *= b.dataset.z === "in" ? 1.5 : 1 / 1.5; clampV(); view.ox = bx - cx / view.z; view.oy = by - cy / view.z; clampV(); paint(); };
}
// To Arms → Campaign: the one you have, or a crown to choose
export function openCampaign() {
  ctx.screen("campaign");
  if (C || resume()) { abandoned(); drawMap(true); } else drawPick();
}
function drawPick() {
  $("cmpPick").classList.remove("hidden"); $("cmpPlay").classList.add("hidden");
  const g = buildGrid({ conq: [] }), has = !!load();
  const list = Object.keys(NATIONS).map(id => ({ id, n: citiesOfNow(g, id).length, s: NATIONS[id].strength })).filter(x => x.n).sort((a, b) => b.s - a.s || b.n - a.n);
  const word = s => s >= 5 ? "A great power" : s >= 4 ? "A strong crown" : s >= 3 ? "A middling crown" : s >= 2 ? "A small state" : "A minnow";
  $("cmpPick").innerHTML = `<div class="cmp-ph"><h2>Choose your crown</h2><p class="sub">Europe in 1683. Raise armies, make friends and enemies, take towns and hold them. The great powers have the most to lose; the small states the most to win.</p></div>
    <div class="cmp-crowns">${list.map(x => `<button class="cmp-crown" data-crown="${x.id}"><i style="background:${NATIONS[x.id].color}"></i><b>${esc(NATIONS[x.id].name)}</b><small>${word(x.s)} · ${x.n} town${x.n > 1 ? "s" : ""} · ${"★".repeat(x.s)}</small></button>`).join("")}</div>
    <div class="pv-acts"><button class="btn ghost" id="cmpPickBack">${has ? "Back to your campaign" : "Back"}</button></div>`;
  $("cmpPickBack").onclick = () => { if (has && (C || resume())) drawMap(true); else ctx.screen("pvp"); };
}
function paint() {
  const cv = $("cmpMap"); if (!cv || !C) return;
  const g = drawEurope(cv, E(), { hover: hov || C.me, selected: sel, city: selCity, hoverCity: hovCity, view, home: false });
  // over the map: your towns ringed in your colour; the towns of your enemies within your army's reach marked with
  // crossed swords (dim once it's marched this season); a town an enemy marches on, red
  const c = cv.getContext("2d"), S = cv.width / MG_W, k = cv.width / 1300, at = ct => { const [x, y] = gridOf(ct[1], ct[2]); return [(x * S - view.ox) * view.z, (y * S - view.oy) * view.z]; };
  const threat = new Set(C.events.filter(e => e.kind === "attack" && !e.done).map(e => e.ct));
  // (crossed swords, drawn: two blades and their guards)
  const swords = (x, y, r, col) => { c.save(); c.strokeStyle = col; c.lineCap = "round"; c.lineWidth = 2.2 * k; c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); c.lineWidth = 2 * k; c.beginPath(); c.moveTo(x - r * 0.95, y + r * 0.35); c.lineTo(x - r * 0.35, y + r * 0.95); c.moveTo(x + r * 0.95, y + r * 0.35); c.lineTo(x + r * 0.35, y + r * 0.95); c.stroke(); c.restore(); };
  c.save(); c.lineWidth = 2.2 * k;
  for (const ct of CITIES) {
    const own2 = cityOwner(g, ct); if (!own2) continue;
    const [x, y] = at(ct); if (x < -20 || y < -20 || x > cv.width + 20 || y > cv.height + 20) continue;
    if (own2 === C.me) {
      c.strokeStyle = threat.has(ct[0]) ? "#c0281a" : NATIONS[C.me].color; c.beginPath(); c.arc(x, y, (7 + ct[3] * 1.5) * k, 0, 7); c.stroke();
      c.strokeStyle = "rgba(40,28,16,0.8)"; c.lineWidth = 1 * k; c.beginPath(); c.arc(x, y, (8.6 + ct[3] * 1.5) * k, 0, 7); c.stroke(); c.lineWidth = 2.2 * k;
      if (threat.has(ct[0])) swords(x, y - 17 * k, 5 * k, "#c0281a");
    } else if (atWar(own2) && distFrom(g, C.me, ct) <= REACH) {
      swords(x, y - 14 * k, 4.5 * k, C.moved ? "rgba(120,40,30,0.45)" : "#b0281a");
    }
  }
  c.restore();
}
function drawMap(fit = false) {
  $("cmpPick").classList.add("hidden"); $("cmpPlay").classList.remove("hidden");
  const cv = $("cmpMap"), wrap = cv.parentElement;
  const W = Math.round(Math.min(1600, Math.max(800, wrap.clientWidth || 1000)) * 1.5); if (cv.width !== W) { cv.width = W; cv.height = Math.round(W * MAP_ASPECT); }
  if (fit) {
    // (looking at your own crown, close enough to see its towns)
    const g = grid(), mine = citiesOfNow(g, C.me).map(cellOf);
    if (mine.length) { const S = cv.width / MG_W, cx = mine.reduce((t, p) => t + p[0], 0) / mine.length * S, cy = mine.reduce((t, p) => t + p[1], 0) / mine.length * S; view.z = 2.2; view.ox = clamp(cx - cv.width / view.z / 2, 0, cv.width - cv.width / view.z); view.oy = clamp(cy - cv.height / view.z / 2, 0, cv.height - cv.height / view.z); }
  }
  paint(); drawTop(); drawSide();
}
function drawTop() {
  const g = grid(), n = citiesOfNow(g, C.me).length, net = income(g) - upkeep(), wars = Object.keys(C.E.war).filter(id => C.E.war[id]);
  $("cmpTop").innerHTML = `<span class="cmp-crownname"><i style="background:${NATIONS[C.me].color}"></i>${esc(NATIONS[C.me].name)}</span>
    <span><small>Season</small><b>${SEASONS[C.s]} ${C.year}</b></span><span><small>Treasury</small><b>${C.gold}</b> <em class="${net >= 0 ? "up" : "down"}">${net >= 0 ? "+" : ""}${net}</em></span>
    <span><small>Army</small><b>${C.army}</b> regiments</span><span><small>Towns</small><b>${n}</b> of ${WIN_CITIES}</span><span><small>At war with</small><b>${wars.length ? wars.map(id => esc(NATIONS[id].name)).join(", ") : "nobody"}</b></span>`;
  const open = C.events.filter(e => !e.done).length;
  $("cmpEnd").disabled = !!C.over || open > 0; $("cmpEnd").textContent = C.over ? "The campaign is over" : open ? "Answer what's waiting first" : "End the season";
}
function drawSide() {
  const g = grid(), el = $("cmpSide"), r = C.E.rel;
  let h = "";
  if (C.over) h += `<div class="cmp-over"><b>Your crown is lost.</b> Every town has fallen. <button class="btn" data-act="newgame">Begin again</button></div>`;
  else if (C.won) h += `<div class="cmp-won"><b>Europe is yours.</b> ${citiesOfNow(g, C.me).length} towns under your crown.</div>`;
  // what's waiting for your word: towns attacked, peace offered
  for (const [i, e] of C.events.entries()) {
    if (e.done) continue;
    if (e.kind === "attack") h += `<div class="cmp-ev war"><b>${esc(NATIONS[e.foe].name)} marches on ${esc(e.ct)}!</b><small>${e.att} regiments against your ${e.def} (garrison and army)${e.walls ? " · behind its walls" : ""}. Your odds: ${Math.round((1 - odds(e.att, e.def, e.walls)) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Fight it yourself</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to the garrison</button></span></div>`;
    if (e.kind === "peace") h += `<div class="cmp-ev"><b>${esc(NATIONS[e.foe].name)} offers peace</b><small>${e.gold ? `And ${e.gold} thalers to have it.` : "Each side keeps what it holds."}</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Make peace</button><button class="btn" data-ev="${i}" data-how="no">Fight on</button></span></div>`;
  }
  if (note) h += `<div class="cmp-note">${esc(note)}</div>`;
  if (news.length) h += `<div class="cmp-news"><b>The season's news</b>${news.slice(0, 8).map(l => `<div>${esc(l.title)}${l.sub ? ` <span>${esc(l.sub)}</span>` : ""}</div>`).join("")}<button class="tm-lnk" data-act="news">Close</button></div>`;
  // the town or the crown chosen on the map
  if (selCity) {
    const own2 = cityOwner(g, selCity), mineT = own2 === C.me, d = distFrom(g, C.me, selCity), can = !mineT && own2 && atWar(own2) && d <= REACH && !C.moved && C.army >= 5;
    const def = own2 && !mineT ? garrison(selCity) + Math.round((C.foes[own2] || 0) * 0.55) : 0, walls = selCity[3] >= 3;
    h += `<div class="cmp-card"><div class="cmp-h"><b>${esc(selCity[0])}</b><small>${["", "A town", "A city", "A great city"][selCity[3]]} · ${own2 ? esc(NATIONS[own2].name) : "nobody's"}</small></div>
      ${mineT ? `<p>Yours. Garrison ${garrison(selCity)}; worth ${selCity[3] * 22} thalers a season.</p>` : own2 ? `<p>Held by ${garrison(selCity)} men of the garrison, and ${the(own2)} can bring some ${Math.round((C.foes[own2] || 0) * 0.55)} regiments to it${walls ? ", behind walls" : ""}. ${d > REACH ? "It's beyond your army's reach: take the towns between first." : !atWar(own2) ? `You're not at war with ${the(own2)}.` : C.moved ? "Your army has already marched this season." : `Your odds: ${Math.round(odds(C.army, def, walls) * 100)}%.`}</p>` : ""}
      ${can ? `<div class="cmp-acts"><button class="btn primary" data-act="fight">March, and fight it yourself</button><button class="btn" data-act="auto">March, and leave it to your generals</button></div>` : ""}</div>`;
  }
  const id = selCity ? cityOwner(g, selCity) : sel;
  if (id && id !== C.me && NATIONS[id]) {
    const did = C.did[id] || {}, war = atWar(id), tr = C.truce[id] || 0;
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[id].color}"></i><b>${esc(NATIONS[id].name)}</b><small>${citiesOfNow(g, id).length} towns · army ${C.foes[id] || 0} · ${war ? "<em class='down'>at war with you</em>" : C.ally[id] ? "your ally" : C.E.pact[id] ? "trade pact" : relWord(r[id])}</small></div>
      <div class="cmp-rel"><i style="left:${(r[id] + 100) / 2}%"></i><span>Their view of you: ${r[id] > 0 ? "+" : ""}${Math.round(r[id])}</span></div>
      <div class="cmp-acts">${war ? `<button class="btn" data-dip="peace" ${did.peace ? "disabled" : ""}>Offer peace</button>` : `
        <button class="btn" data-dip="envoy" ${did.envoy || C.gold < 40 ? "disabled" : ""}>Send an envoy · 40</button>
        <button class="btn" data-dip="gift" ${did.gift || C.gold < 150 ? "disabled" : ""}>A gift · 150</button>
        ${C.E.pact[id] ? `<button class="btn" data-dip="unpact">End the trade pact</button>` : `<button class="btn" data-dip="pact" ${r[id] < 20 ? "disabled title='They need to think well of you (20)'" : ""}>Trade pact</button>`}
        ${C.ally[id] ? `<button class="btn" data-dip="unally">Break the alliance</button>` : `<button class="btn" data-dip="ally" ${r[id] < 55 || did.ally ? "disabled title='They need to be friendly (55)'" : ""}>Propose an alliance</button>`}
        <button class="btn danger" data-dip="war" ${tr ? `disabled title="A treaty: ${tr} more seasons"` : ""}>Declare war</button>`}</div></div>`;
  } else if (!selCity) h += `<div class="cmp-card"><p>Click a town to march on it, or a crown to deal with it. Wheel or ± to zoom; drag to move.</p></div>`;
  // your own: the treasury's use
  h += `<div class="cmp-card"><div class="cmp-h"><b>Your army</b><small>${C.army} regiments · ${C.moved ? "has marched this season" : "ready to march"}</small></div>
    <div class="cmp-acts"><button class="btn" data-act="r1" ${C.gold < REGIMENT ? "disabled" : ""}>Raise a regiment · ${REGIMENT}</button><button class="btn" data-act="r5" ${C.gold < REGIMENT * 5 ? "disabled" : ""}>Raise five · ${REGIMENT * 5}</button></div>
    <small class="cmp-fine">Upkeep ${upkeep()} a season. Towns bring in money; trade pacts more.</small></div>`;
  h += `<div class="cmp-log">${C.log.slice(0, 14).map(l => `<div><small>${esc(l.t)}</small><b>${esc(l.title)}</b>${l.sub ? ` <span>${esc(l.sub)}</span>` : ""}</div>`).join("")}</div>`;
  h += `<div class="cmp-foot"><button class="tm-lnk" data-act="newgame">New campaign</button></div>`;
  el.innerHTML = h;
}
function sideClick(e) {
  const b = e.target.closest("button"); if (!b || !C) return;
  window.__uisfx && window.__uisfx.click && window.__uisfx.click();
  if (b.dataset.ev != null) {
    const ev = C.events[+b.dataset.ev]; if (!ev || ev.done) return; ev.done = true;
    const ct = CITIES.find(c => c[0] === ev.ct);
    if (ev.kind === "peace") { if (b.dataset.how === "yes") { makePeace(ev.foe); C.gold += ev.gold || 0; } else C.E.rel[ev.foe] -= 5; }
    else if (ev.kind === "attack") {
      // (the town may already have gone, to another's march this season)
      if (cityOwner(grid(), ct) !== C.me) { note = `${ev.ct} is no longer yours to defend.`; }
      else { const o = { attack: false, foe: ev.foe, ct, att: ev.att, def: ev.def, walls: ev.walls }; if (b.dataset.how === "fight") { C.events = C.events.filter(x => !x.done); persist(); fight(o); return; } auto(o); }
    }
    C.events = C.events.filter(x => !x.done); persist(); drawMap(); return;
  }
  const a = b.dataset.act;
  if (a === "fight" || a === "auto") { const o = march(selCity); if (!o) return; if (a === "fight") { persist(); fight(o); return; } const w = auto(o); note = w ? `${selCity[0]} is yours.` : `The attack on ${selCity[0]} failed.`; persist(); drawMap(); return; }
  if (a === "news") { news = []; drawMap(); return; }
  if (a === "r1") recruit(1); else if (a === "r5") recruit(5);
  else if (a === "newgame") { drawPick(); return; }
  if (b.dataset.dip) { const id = selCity ? cityOwner(grid(), selCity) : sel; const t = diplo(id, b.dataset.dip); if (t) { note = t; if (!/^You|refuses|won't/.test(t)) say(t); } persist(); }
  drawMap();
}
// (after a battle fought by hand: straight back to the map)
export const campaignOn = () => !!C;
// (for the tests: the campaign's own doings, from the console)
window.__setView = v => { view = v; paint(); };
window.__cmp = { get C() { return C; }, dist: distFrom, endSeason, diplo, march, auto, settle, grid, citiesOfNow, draw: () => drawMap(), select: (name) => { selCity = CITIES.find(c => c[0] === name) || null; sel = selCity ? cityOwner(grid(), selCity) : null; drawMap(); } };
