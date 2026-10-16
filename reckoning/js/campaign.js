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

import { FOLEY } from "./foley.js";
import { NATIONS, NATION_FAITH, CITIES, buildGrid, cityOwner, gridOf, llOf, drawEurope, cityAt, nationAt, relWord, the, The, MAP_ASPECT, MG_W, MG_H, useSheet, PEOPLES, peopleAt } from "./europe.js";
import { EuropeView3D } from "./europe3d.js";
import { TROOPS } from "./pvp.js";
import { CHAINS, CHAIN_ORDER, MARK, levelCost, capOf, TECHS, BRANCHES, canStudy, newMan, historicalOf, portOf, GSTATS, VSTATS, SERVICE, GEN_SERVICE } from "./realm.js";

const KEY = "reckoning.campaign.v1";
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
const WIN_CITIES = 40, REACH = 13, REGIMENT = 30;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const R = () => Math.random();
const pick = a => a[Math.floor(R() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// the sounds of the campaign table: the map's parchment, the quill and the seal, the drum, the bells, the guns far off
// (each real — foley.js — and a few strung together, a moment apart)
const sfx = (name, vol = 0.5, after = 0) => { const go = () => { try { name === "coin" ? FOLEY.play("coin", { vol }) : FOLEY.cmp(name, vol); } catch (e) {} }; after ? setTimeout(go, after) : go(); };

// each crown's coats on the field, and how its army's made up
export const UNI_OF = {
  scotland: "english", england: "english", ireland: "irish", france: "french", castile: "spanish", aragon: "spanish", portugal: "spanish", hre: "imperial",
  brandenburg: "brandenburg", saxony: "saxon", bavaria: "bavarian", austria: "imperial", milan: "spanish", savoy: "french", venice: "imperial", tuscany: "imperial",
  papal: "imperial", naples: "spanish", sicily: "spanish", sweden: "swedish", denmark: "danish", poland: "polish", russia: "muscovite", cossacks: "muscovite",
  crimea: "ottoman", hungary: "imperial", transylvania: "polish", moldavia: "polish", wallachia: "polish", ottoman: "ottoman", algiers: "ottoman", tunis: "ottoman",
  tripoli: "ottoman", dutch: "dutch", morocco: "ottoman",
  p_iroquois: "native", p_wabanaki: "native", p_cherokee: "native", p_creek: "native", p_choctaw: "native", p_shawnee: "native", p_illinois: "native", p_anishinaabe: "native", p_dakota: "native", p_cree: "native",
};
const STYLE = {
  west: [["musketeer", 0.58], ["pike", 0.15], ["grenadier", 0.1], ["cavalry", 0.1], ["sword", 0.07]],
  east: [["musketeer", 0.42], ["bow", 0.22], ["sword", 0.2], ["cavalry", 0.16]],
  steppe: [["musketeer", 0.42], ["cavalry", 0.22], ["sword", 0.16], ["bow", 0.1], ["pike", 0.1]],
  tsar: [["musketeer", 0.66], ["pike", 0.18], ["cavalry", 0.08], ["axe", 0.08]],
  // (the woods' nations: the bow and the war club for the most part; the trade musket in a few hands; no horse, no pike)
  woods: [["bow", 0.44], ["axe", 0.34], ["musketeer", 0.22]],
};
const styleOf = id => NATIONS[id] && NATIONS[id].nw ? "woods" : ({ ottoman: "east", crimea: "east", algiers: "east", tunis: "east", tripoli: "east", morocco: "east", poland: "steppe", cossacks: "steppe", moldavia: "steppe", wallachia: "steppe", transylvania: "steppe", russia: "tsar" }[id] || "west");
function muster(id, men) {
  const out = {}; let left = men;
  for (const [k, f] of STYLE[styleOf(id)]) { const n = Math.min(left, Math.round(men * f)); if (n > 0) { out[k] = n; left -= n; } }
  if (left > 0) out.musketeer = (out.musketeer || 0) + left;
  return out;
}

// ---- the state ----
let C = null, ctx = null, startBattle = null;
const MPKEY = "reckoning.campaign.mp.v1";
// (three campaigns kept side by side: a new one doesn't cost you the one you have)
const SLOTS = 3, SLOTKEY = "reckoning.campaign.slot", slotKey = i => i ? `${KEY}.${i + 1}` : KEY;
let slot = (() => { try { return Math.min(SLOTS - 1, Math.max(0, +localStorage.getItem(SLOTKEY) || 0)); } catch (e) { return 0; } })();
const campaigns = () => { const out = []; for (let i = 0; i < SLOTS; i++) { const c = load(i); if (c && c.me && NATIONS[c.me]) out.push({ i, c }); } return out.sort((a, b) => (b.c.at || 0) - (a.c.at || 0)); };
const save = () => { try { if (!C) return; if (C.mp) { if (mp && mp.host) localStorage.setItem(MPKEY, JSON.stringify({ partner: mp.foe.pid || "", partnerName: mp.foe.name || "", C })); return; } C.at = Date.now(); C.towns = citiesOfNow(grid(), C.me).length; localStorage.setItem(slotKey(slot), JSON.stringify(C)); localStorage.setItem(SLOTKEY, String(slot)); } catch (e) {} };
const load = (i = slot) => { try { return JSON.parse(localStorage.getItem(slotKey(i))); } catch (e) { return null; } };

// ---- a campaign of two: each player's crown its own treasury, army, dealings with the others, wars and news ----
// The campaign holds one crown "on top" (C.me, and these fields of C) and the other's put by in C.H; as(crown, fn)
// does a thing as that crown, and puts everything back. The shared things — the year, the map, the other crowns'
// armies and wars — are C's own.
const SLICE = ["gold", "army", "moved", "did", "ally", "truce", "warT", "took", "lost", "events", "log", "over", "won", "pending", "tech", "guns", "gen", "govs", "govCands", "levyQ", "rule", "morale", "siege", "supplied", "pos", "go"];
let mp = null;    // (the link to the other player: { net, side, host, foe, ... } — null playing alone)
const humans = () => (C && C.mp ? C.mp.humans : []);
const isHuman = id => humans().includes(id);
function stash(c) { const o = {}; for (const k of SLICE) o[k] = C[k]; o.rel = C.E.rel; o.war = C.E.war; o.pact = C.E.pact; (C.H ||= {})[c] = o; }
function unstash(c) { const o = C.H[c]; for (const k of SLICE) C[k] = o[k]; C.E.rel = o.rel; C.E.war = o.war; C.E.pact = o.pact; delete C.H[c]; C.me = c; }
function as(c, fn) { if (!C.mp || c === C.me || !C.H || !C.H[c]) return fn(); const was = C.me; stash(was); unstash(c); try { return fn(); } finally { stash(c); unstash(was); } }
const sliceOf = id => id === C.me ? C : (C.H && C.H[id]) || null;
// (a crown's army: a player's regiments, or the computer's)
const foeArmy = id => isHuman(id) ? (sliceOf(id) || {}).army || 0 : C.foes[id] || 0;
const setFoeArmy = (id, v) => { if (isHuman(id)) { const s2 = sliceOf(id); if (s2) s2.army = v; } else C.foes[id] = v; };
// (a verb after a crown's name: a people takes the plural — "the Cherokee march", not "marches")
const v3 = (id, v) => !(NATIONS[id] && NATIONS[id].people) || (C && C.mp && C.mp.names[id]) ? v : v === "has" ? "have" : v === "is" ? "are" : v === "marches" ? "march" : v.replace(/s$/, "");
const nameOf = id => (C.mp && C.mp.names[id]) || The(id);

// the land as it stands: 1683's, and every town taken since (kept as a map of cells, handed to the map as E.conq)
let own = new Map();
function E() {
  if (!C.E.conq || C.E.conq.length !== own.size || C._dirty) { C.E.conq = [...own].map(([k, to]) => { const [c, r] = k.split(",").map(Number); return { c, r, to }; }); C.E.rev = (C.E.rev | 0) + 1; C._dirty = false; }
  return C.E;
}
// (a campaign is played on the whole sheet — Europe and the New World across the Atlantic — the story on Europe's window
//  of it: every way into the map here takes up the world's first)
const W0 = () => useSheet("world");
const grid = () => (W0(), buildGrid(E()));
function citiesOfNow(g, id) { return CITIES.filter(ct => cityOwner(g, ct) === id); }
const cellOf = ct => { W0(); const [x, y] = gridOf(ct[1], ct[2]); return [Math.floor(x), Math.floor(y)]; };
// (how much wider the world's sheet is than Europe's: zooms are reckoned in Europe's)
//  — on screen: the map's canvas covers the window either way, so it's the squares' size on the screen that's compared)
const ZF = () => { W0(); const iw = innerWidth || 1280, ih = innerHeight || 768, was = Math.max(iw, ih / (370 / 400)) / 400, now = Math.max(iw, ih / MAP_ASPECT) / MG_W; return was / now; };
// a campaign saved on Europe's sheet alone (before 1.49): its squares carried west by the New World's width
const NEWW = 629;
function toWorldGrid() {
  if (!C || C.gridV === 3) return;
  const sh = p => p && isFinite(p.x) ? { ...p, x: p.x + NEWW } : p;
  own = new Map([...own].map(([k, to]) => { const [c, r] = k.split(",").map(Number); return [(c + NEWW) + "," + r, to]; }));
  C.pos = sh(C.pos); C.go = sh(C.go); if (C.foePos) for (const id of Object.keys(C.foePos)) C.foePos[id] = sh(C.foePos[id]);
  for (const h of Object.values(C.H || {})) { h.pos = sh(h.pos); h.go = sh(h.go); }
  C.gridV = 3; C._dirty = true; C.own = [...own];
}

// ---- 1683 as it stood: the leagues already sworn, and the wars already being fought ----
// (the Treaty of Warsaw that spring, the Emperor and Poland against the Turk, Venice and the Pope with them in the Holy
//  League; the Laxenburg Alliance of 1682 against France's reunions; the Hague Association of the Dutch and Sweden; the
//  French subsidy treaties with Denmark and Brandenburg; the Sultan's vassals and Thököly's Kuruc; Spain's crowns)
const LEAGUES_1683 = [
  { n: "the Holy League", ids: ["austria", "poland", "venice", "papal"] },
  { n: "the Laxenburg Alliance", ids: ["austria", "hre", "sweden", "bavaria", "saxony"] },
  { n: "the Hague Association", ids: ["dutch", "sweden"] },
  { n: "the French alliance", ids: ["france", "denmark", "brandenburg"] },
  { n: "the Sultan's camp", ids: ["ottoman", "crimea", "transylvania", "moldavia", "wallachia", "hungary"] },
  { n: "the Spanish crowns", ids: ["castile", "aragon", "milan", "naples", "sicily"] },
  // (the New World's: the Covenant Chain of the Five Nations with New York; New France's allies of the upper country
  //  and the east, against the Iroquois)
  { n: "the Covenant Chain", ids: ["england", "p_iroquois"] },
  { n: "the alliance of the Pays d'en Haut", ids: ["france", "p_anishinaabe", "p_wabanaki", "p_illinois"] },
];
// (the Turk's march on Vienna, the Tatars on Poland, Thököly's rising; and France and Spain, at war again that autumn)
const WARS_1683 = [["ottoman", "austria"], ["ottoman", "poland"], ["ottoman", "hre"], ["crimea", "poland"], ["crimea", "austria"], ["hungary", "austria"], ["france", "castile"], ["france", "aragon"], ["france", "milan"],
  // (the Beaver Wars: the Iroquois against the Illinois and the nations of the upper lakes; the Muscogee and the Choctaw)
  ["p_iroquois", "p_illinois"], ["p_iroquois", "p_anishinaabe"], ["p_creek", "p_choctaw"]];
const leagueOf = (a, b) => LEAGUES_1683.find(L => L.ids.includes(a) && L.ids.includes(b));
// (the leagues' word kept among the other crowns: allies of a crown that's attacked come in on its side)
const alliesOf = id => [...new Set(LEAGUES_1683.filter(L => L.ids.includes(id)).flatMap(L => L.ids))].filter(x => x !== id);
// a new campaign, as a crown
function fresh(me) {
  const rel = {}, army = {};
  for (const id of Object.keys(NATIONS)) {
    rel[id] = Math.round((NATION_FAITH[id] === NATION_FAITH[me] ? 18 : 0) + (R() - 0.5) * 36);
    // (the other crowns start at war footing: half again what you'd have in their place, and a margin besides —
    //  1683 was a year of great armies, and none of them is waiting for you)
    army[id] = NATIONS[id].strength * 15 + 8 + Math.floor(R() * 10);
  }
  delete rel[me];
  // the leagues and the wars of 1683: yours to begin with, and the other crowns' among themselves
  const ally = {}, war = {}, wars = [];
  for (const id of alliesOf(me)) { ally[id] = true; rel[id] = Math.max(rel[id], 60); }
  for (const [a, b] of WARS_1683) {
    if (a === me || b === me) { const f = a === me ? b : a; war[f] = true; ally[f] = false; rel[f] = Math.min(rel[f], -50); }
    else wars.push({ a, b, battles: 0, withYou: false, old: true });
  }
  // (your allies' wars against your enemies are fought with you)
  for (const w of wars) if ((ally[w.a] && war[w.b]) || (ally[w.b] && war[w.a])) w.withYou = true;
  return { v: 1, gridV: 3, me, year: 1683, s: 0, gold: 200 + NATIONS[me].strength * 60, army: NATIONS[me].strength * 10 + 6, moved: false, did: {},
    E: { rel, war, wars, conq: [], pact: {}, plague: {}, famine: {}, beaten: {}, news: [], gridV: 2 },
    foes: army, ally, truce: {}, warT: {}, took: {}, lost: {}, events: [], log: [], pending: null, over: null, won: false, own: [] };
}
function begin(me, into = slot) {
  slot = into; C = fresh(me); ensureRealm(); own = new Map();
  // (where you stand in 1683: your league, your wars)
  const al = Object.keys(C.ally).filter(id => C.ally[id]), wr = Object.keys(C.E.war).filter(id => C.E.war[id]);
  for (const L of LEAGUES_1683.filter(L => L.ids.includes(me))) say(`You are of ${L.n}`, `With ${L.ids.filter(x => x !== me).map(x => the(x)).join(", ")}.`);
  if (wr.length) say(`At war`, `${The(me)} ${v3(me, "is")} already at war with ${wr.length > 1 ? wr.slice(0, -1).map(x => the(x)).join(", ") + " and " + the(wr[wr.length - 1]) : the(wr[0])}.`);
  say(`${The(me)} — ${C.year}`, `You take the crown. ${citiesOfNow(grid(), me).length} towns, ${C.army} regiments, ${C.gold} thalers in the treasury.${al.length ? ` Allies: ${al.length}.` : ""}`);
  save();
}
function resume() {
  C = load(); if (!C) return false; own = new Map(C.own || []); C._dirty = true; toWorldGrid(); ensureRealm();
  // (a save from before 1.44.2: a crown that had towns in 1683, has none now, yet still holds land — its taker
  //  was never told so; the land goes to you if you fought it, else to its strongest neighbour)
  if (!C.lastBy) {
    const g0 = buildGrid({ conq: [] }), g = grid(); C.lastBy = {};
    for (const id of new Set(CITIES.map(ct => cityOwner(g0, ct)).filter(Boolean))) {
      if (alive(g, id) || !g.some(row => row.includes(id))) continue;
      C.lastBy[id] = C.E.war[id] !== undefined || (C.took && C.took[id]) ? C.me : [...neighbours(g, id)].sort((a, b) => citiesOfNow(g, b).length - citiesOfNow(g, a).length)[0] || C.me;
    }
    orphans(C.me); persist();
  }
  return true;
}
function persist() { C.own = [...own]; save(); }
function say(title, sub = "") { C.log.unshift({ t: `${C.year}`, title, sub }); C.log.length = Math.min(C.log.length, 60); }
// (news of the world: to every player of the campaign)
function sayAll(title, sub = "") { say(title, sub); for (const h of humans()) if (h !== C.me) as(h, () => say(title, sub)); }

// ---- the ground: whose, and how far from whose ----
// (a province's border wanders: a little smooth noise added to the distances, so the line between two towns' country
//  bends like an old border, following no ruler — and the same each time it's worked out)
const pnoise = (x, y) => { const h = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); }; const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf); return h(xi, yi) * (1 - u) * (1 - w) + h(xi + 1, yi) * u * (1 - w) + h(xi, yi + 1) * (1 - u) * w + h(xi + 1, yi + 1) * u * w; };
const pjit = (c, r, ox = 0, oy = 0) => (pnoise(c / 9 + ox * 0.37, r / 9 + oy * 0.53) - 0.5) * 9 + (pnoise(c / 3.5 + ox, r / 3.5 + oy) - 0.5) * 3;
// (a town taken: its country with it — the loser's land round it, a day or two's march across)
function seize(ct, to) {
  const g = grid(), from = cityOwner(g, ct); if (!from || from === to) return 0;
  C.lastBy = { ...(C.lastBy || {}), [from]: to };
  let [x0, y0] = cellOf(ct);
  // (its own cell may be the sea or the woods: the nearest of the loser's)
  if (g[y0] && g[y0][x0] !== from) { let best = null, bd = 99; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (g[y0 + dy] && g[y0 + dy][x0 + dx] === from && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); best = [x0 + dx, y0 + dy]; } if (!best) return 0; [x0, y0] = best; }
  // (the town's province: every square of the loser's that's nearer to this town than to any other of theirs — the
  //  way a country's land falls to the town it's governed from — reached across the loser's own land, the borders
  //  between provinces wandering as old ones did, not ruled: no circle about the town, but its whole country)
  const others = CITIES.filter(o => o !== ct && cityOwner(g, o) === from).map(cellOf), [tx, ty] = cellOf(ct), d0 = (c, r) => Math.hypot(c - x0, r - y0) + pjit(c, r, tx, ty);
  const q = [[x0, y0]], seen = new Set([x0 + "," + y0]); let n = 0;
  while (q.length) {
    const [c, r] = q.shift(); if (g[r][c] !== from) continue;
    const me = d0(c, r); if ((c !== x0 || r !== y0) && Math.hypot(c - x0, r - y0) > 2 && others.some(([ox, oy]) => Math.hypot(c - ox, r - oy) + pjit(c, r, ox, oy) < me)) continue;
    own.set(c + "," + r, to); n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dx) + "," + (r + dy); if (!seen.has(k) && g[r + dy] && g[r + dy][c + dx] === from) { seen.add(k); q.push([c + dx, r + dy]); } }
  }
  C._dirty = true;
  // (and the pockets the new border cut off from every town of the loser's: they go with the province, not left as
  //  islands of the old colour in the taker's country)
  const towns = new Set(others.map(([c, r]) => c + "," + r)), done = new Set();
  for (const k of seen) {
    const [c0, r0] = k.split(",").map(Number); if (done.has(k) || own.get(k) === to || g[r0][c0] !== from) continue;
    const bag = [k], pq = [[c0, r0]]; done.add(k); let home = false;
    while (pq.length && !home && bag.length < 900) {
      const [c, r] = pq.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (c + dx) + "," + (r + dy); if (done.has(kk) || !g[r + dy] || g[r + dy][c + dx] !== from || own.get(kk) === to) continue; if (towns.has(kk)) { home = true; break; } done.add(kk); bag.push(kk); pq.push([c + dx, r + dy]); }
    }
    if (!home && !pq.length) for (const kk of bag) { own.set(kk, to); n++; }
  }
  // (its last town gone: the whole crown is the taker's — every field and forest of it, to the last corner)
  if (!CITIES.some(o => o !== ct && cityOwner(g, o) === from)) n += annex(g, from, to);
  orphans(to);
  return n;
}
// (a crown left with land but not one town — its last one gone with the country round another's: all of it to
//  whoever last took from it, so no ghost of a kingdom lingers on the map)
function orphans(fallback) {
  const g = grid(), held = new Set();
  for (const row of g) for (const id of row) if (id && NATIONS[id]) held.add(id);
  let n = 0;
  // (only a crown that has lost a town: a little one with no town of its own from the start is left be)
  for (const id of held) if (C.lastBy && C.lastBy[id] && !alive(g, id)) n += annex(g, id, C.lastBy[id] || fallback);
  return n;
}
function annex(g, from, to) {
  let n = 0;
  for (let r = 0; r < MG_H; r++) { const row = g[r]; for (let c = 0; c < MG_W; c++) if (row[c] === from) { own.set(c + "," + r, to); n++; } }
  C._dirty = true; C.gone = { ...(C.gone || {}), [from]: to }; C.E.gone = C.gone;
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
// a town your army can march on: within its reach of your land — or, at war with a crown none of whose towns is that
// near, the nearest of them (a war can always be carried to the enemy; it only takes longer to get there)
function inReach(g, ct, by = C.me) {
  if (distFrom(g, by, ct) <= REACH) return true;
  const foe = cityOwner(g, ct); if (!foe || foe === by) return false;
  const mine = citiesOfNow(g, by).map(cellOf); if (!mine.length) return false;
  const far = t => { const [x, y] = cellOf(t); return Math.min(...mine.map(([a, b]) => Math.hypot(a - x, b - y))); };
  const theirs = citiesOfNow(g, foe); if (theirs.some(t => distFrom(g, by, t) <= REACH)) return false;
  const best = theirs.reduce((b, t) => far(t) < far(b) ? t : b, theirs[0]);
  return best === ct;
}
const alive = (g, id) => citiesOfNow(g, id).length > 0;
// ---- the armies on the map: where each stands, in squares of the map (some ten kilometres each), and how far it gets in
//  a year's campaigning. Yours goes where you send it; a town is only marched on from within a year's march of it ----
const MARCH = 35;
const cellXY = ct => { W0(); const [x, y] = gridOf(ct[1], ct[2]); return { x, y }; };
const dist2 = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
function homeOf(g, id) { const t = citiesOfNow(g, id).sort((a, b) => b[3] - a[3])[0]; return t ? cellXY(t) : null; }
function armyPos() { if (!C.pos || !isFinite(C.pos.x)) C.pos = homeOf(grid(), C.me) || { x: MG_W / 2, y: MG_H / 2 }; return C.pos; }
// (across the Atlantic it's no march: the army takes ship, and the crossing — some two months at sea, with the waiting
//  for a fleet and a wind — is the year's campaigning; it lands where it was sent)
const seaSide = p => llOf(p.x, p.y)[0] < -42;
const overSea = (p, t) => seaSide(p) !== seaSide(t);
const VOYAGE = 120;
function stepToward(p, t, d) { if (overSea(p, t)) return { x: t.x, y: t.y, arrived: true, sea: true }; const L = dist2(p, t); return L <= d ? { x: t.x, y: t.y, arrived: true } : { x: p.x + (t.x - p.x) / L * d, y: p.y + (t.y - p.y) / L * d, arrived: false }; }
const inMarch = ct => dist2(armyPos(), cellXY(ct)) <= MARCH + 0.5;
const yearsTo = t => overSea(armyPos(), t) ? 1 : Math.max(1, Math.ceil(dist2(armyPos(), t) / MARCH));
// (the other crowns' field armies: at their capital, or on the march toward a town of yours)
function foeArmyPos(id) { C.foePos ||= {}; if (!C.foePos[id] || !isFinite(C.foePos[id].x)) { const h = homeOf(grid(), id); if (h) C.foePos[id] = { x: h.x, y: h.y }; } return C.foePos[id] || null; }
// (your army near enough to a town of yours to come to its help: half a year's march)
const armyNear = ct => !C.siege && dist2(armyPos(), cellXY(ct)) <= MARCH * 0.5;

// ---- a fight for a town: by your hand, or your generals' ----
// (strength: your field army against the town's garrison and the defending crown's army; walls make a big town
//  harder)
// ---- a town's buildings, the realm's learning, its generals and governors (the data: realm.js) ----
const lvOf = (n, chain) => !C ? 0 : chain === "walls" ? ((C.walls && C.walls[n]) | 0) : ((C.B && C.B[n] && C.B[n][chain]) | 0);
const govOf = n => (C && C.govs && C.govs[n]) || null;
const knows = id => !!(C && C.tech && C.tech.done[id]);
// (a governor's hand on his town: his production adds, his corruption takes — a town with nobody over it, a clerk's
//  ordinary skimming)
function govMul(n) { const v = govOf(n), cor = v ? v.st[0] : 2, pro = v ? v.st[1] : 2; return (1 + (pro - 3) * 0.06) * (1 - cor * 0.04 * (knows("cameral") ? 0.5 : 1)); }
const prodMul = n => { const v = govOf(n); return v ? 1 - (v.st[1] - 3) * 0.05 : 1.05; };
const worth = ct => { const n = ct[0]; let inc = ct[3] * 22; for (const ch of ["farm", "trade", "works"]) inc += (CHAINS[ch].levels[lvOf(n, ch)].inc || 0) * (ch === "farm" && knows("enclosure") ? 1.15 : 1); return Math.round(inc * govMul(n)); };
function garrison(ct) { const n = ct[0], v = govOf(n); return ct[3] * 4 + 2 + (CHAINS.walls.levels[lvOf(n, "walls")].gar || 0) + (CHAINS.army.levels[lvOf(n, "army")].gar || 0) + (v ? v.st[2] - 2 : 0); }
// (walls only where they've been built — by you, or by the crown that holds the town — save a crown's last town,
//  which every man in it holds to the end behind whatever they can throw up)
function hasWalls(ct, owner, g = grid()) { return lvOf(ct[0], "walls") >= 1 || (!!owner && !NATIONS[owner].nw && citiesOfNow(g, owner).length === 1); }
// (a town of the woods' nations: a palisade round it, fought in as a village)
const isVillage = ct => { const o = cityOwner(grid(), ct); return !!o && !!NATIONS[o].nw && !lvOf(ct[0], "walls"); };
const research = g => 1 + citiesOfNow(g, C.me).reduce((t, ct) => t + (CHAINS.church.levels[lvOf(ct[0], "church")].rp || 0), 0);
const regCost = g => REGIMENT - Math.max(0, ...citiesOfNow(g, C.me).map(ct => CHAINS.works.levels[lvOf(ct[0], "works")].cheap || 0));
const GUN_COST = 140;
// (your army's nerve in a battle: the drill of your barracks, the bayonet, the general's hold on his men)
const braveMul = g => moraleK() * (1 + Math.max(0, ...citiesOfNow(g, C.me).map(ct => CHAINS.army.levels[lvOf(ct[0], "army")].morale || 0)) + (knows("bayonet") ? 0.05 : 0) + (C.gen ? (C.gen.st[1] - 3) * 0.06 : -0.06));
const cmdMul = gen => gen ? 1 + (gen.st[0] - 3) * 0.07 : 0.93;
// ---- the army's morale, 0 to 100: where its general's spirit and its barracks put it, raised by victories and broken by
//  defeats, by a general lost and by pay missed; drifting back a third of the way each year. It counts in every battle:
//  a broken army fights at 85%, a confident one at 115% ----
const moraleBase = () => clamp(30 + (C.gen ? C.gen.st[1] * 9 : 12) + (knows("bayonet") ? 4 : 0) + Math.round(Math.max(0, ...citiesOfNow(grid(), C.me).map(ct => CHAINS.army.levels[lvOf(ct[0], "army")].morale || 0)) * 100), 10, 95);
const moraleK = () => 0.85 + clamp(C.morale ?? 50, 0, 100) * 0.003;
const moraleMove = d => { C.morale = clamp(Math.round((C.morale ?? 50) + d), 0, 100); };
const moraleWord = v => v >= 85 ? "Eager for battle" : v >= 68 ? "Confident" : v >= 50 ? "Steady" : v >= 32 ? "Shaken" : v >= 15 ? "Wavering" : "Broken";
const genOf = id => id === C.me ? C.gen : isHuman(id) ? as(id, () => C.gen) : (C.foeGen && C.foeGen[id]) || null;
// what a town of yours can build next, chain by chain: the next level, its cost, and the learning it waits on
function buildable(ct) {
  const n = ct[0], out = [];
  for (const ch of CHAIN_ORDER) {
    const lv = lvOf(n, ch); if (lv >= capOf(ch, ct[3])) continue;
    const L = CHAINS[ch].levels[lv + 1]; if (L.rank && ct[3] < L.rank) continue;
    out.push({ chain: ch, lv: lv + 1, L, cost: Math.round(levelCost(ch, lv + 1, ct[3]) * prodMul(n)), tech: L.tech && !knows(L.tech) ? L.tech : null });
  }
  return out;
}
// (a man's term: ten years, and age takes him — two more for a general schooled at an academy)
const lifeOf = m => m.role === "general" ? GEN_SERVICE + (knows("academy") ? 2 : 0) : SERVICE;
function needGeneral() { if (!C.gen && !C.events.some(e => e.kind === "appoint" && !e.done)) C.events.push({ kind: "appoint", role: "general", cands: [0, 1, 2].map(() => newMan(C.me, "general")) }); }
// the realm made ready: a campaign begun, or one from before these things were (its old works carried over)
function ensureRealm() {
  if (!C) return;
  C.B ||= {}; C.Q ||= {}; C.walls ||= {}; C.foeGen ||= {}; C.fguns ||= {};
  if (C.dev) { for (const [n, v] of Object.entries(C.dev)) (C.B[n] ||= {}).farm = Math.max(C.B[n].farm | 0, v | 0); delete C.dev; }
  if (C.raising) { for (const n of Object.keys(C.raising)) C.Q[n] = { chain: "walls", by: C.me, cost: 0 }; delete C.raising; }
  delete C.work;
  const g = grid();
  for (const id of Object.keys(NATIONS)) {
    if (isHuman(id) || id === C.me) continue;
    if (C.fguns[id] == null) C.fguns[id] = NATIONS[id].nw ? 0 : NATIONS[id].strength >= 4 ? 2 : NATIONS[id].strength === 3 ? 1 : 0;
    if (!C.foeGen[id]) C.foeGen[id] = historicalOf(id, () => false).find(m => m.role === "general") || newMan(id, "general");
  }
  for (const h of C.mp ? humans() : [C.me]) as(h, () => {
    C.tech ||= { done: {}, cur: null, pts: 0 }; C.levyQ ||= 0; C.morale ??= 60; C.govCands ||= {}; C.rule ||= {};
    if (C.guns == null) C.guns = Math.min(3, Math.max(1, NATIONS[C.me].strength - 1));
    if (C.gen === undefined || C.govs === undefined) {
      const hs = historicalOf(C.me, n => { const ct = CITIES.find(c => c[0] === n); return !!ct && cityOwner(g, ct) === C.me; });
      if (C.gen === undefined) C.gen = hs.find(m => m.role === "general") || newMan(C.me, "general");
      if (C.govs === undefined) { C.govs = {}; for (const m of hs) if (m.role === "governor") C.govs[m.town] = m; }
    }
  });
}
// ---- the year's turn, for the realm: what was building, finished (shared: the towns' own works) ----
function realmWorld(g, ids) {
  for (const [n, q] of Object.entries(C.Q || {})) {
    const ct = CITIES.find(c => c[0] === n), owner = ct && cityOwner(g, ct); delete C.Q[n];
    if (!owner || owner !== q.by) continue;
    as(owner, () => {
      if (q.gun) { C.guns++; say(`A gun is cast at ${n}`, `Your artillery train: ${C.guns} gun${C.guns > 1 ? "s" : ""}.`); return; }
      const lv = lvOf(n, q.chain) + 1;
      if (q.chain === "walls") C.walls[n] = lv; else (C.B[n] ||= {})[q.chain] = lv;
      say(`${n}: ${CHAINS[q.chain].levels[lv].n}`, q.chain === "walls" && lv === 1 ? "The masons are done: its walls stand round it now." : "The work is finished.");
    });
  }
  // (the other crowns: guns cast, a few a decade; their generals ageing, and new men in their place)
  for (const id of ids) {
    if (!NATIONS[id].nw && (C.fguns[id] | 0) < NATIONS[id].strength && R() < 0.12 + NATIONS[id].strength * 0.03) C.fguns[id] = (C.fguns[id] | 0) + 1;
    const fg = C.foeGen[id]; if (fg) { fg.served = (fg.served | 0) + 1; if (fg.served >= GEN_SERVICE) { C.foeGen[id] = newMan(id, "general"); if ((C.mp ? humans() : [C.me]).some(h => as(h, () => atWar(id)))) sayAll(`${fg.name} dies`, `${The(id)}'s general, of old age. ${C.foeGen[id].name} takes his place.`); } }
  }
}
// ---- and for each player: the levies in, the learning done, the years told on their men ----
function realmMine(g) {
  if (C.levyQ) { C.army += C.levyQ; say(`${C.levyQ} new regiment${C.levyQ > 1 ? "s" : ""} join${C.levyQ > 1 ? "" : "s"} the army`, "Raised, armed and drilled over the year."); C.levyQ = 0; }
  const T = C.tech; T.pts += research(g);
  if (T.cur && T.pts >= TECHS[T.cur].cost) { T.pts -= TECHS[T.cur].cost; T.done[T.cur] = true; say(`Your scholars master ${TECHS[T.cur].n.replace(/^The /, "the ")}`, TECHS[T.cur].d); T.cur = null; }
  if (!T.cur) T.pts = Math.min(T.pts, 6);
  siegeYear(g);
  C.morale = Math.round((C.morale ?? moraleBase()) + (moraleBase() - (C.morale ?? moraleBase())) * 0.35);
  if (C.gen) { C.gen.served = (C.gen.served | 0) + 1; if (C.gen.served >= lifeOf(C.gen)) { say(`${C.gen.name} dies`, "Of old age, after long service. Choose who will lead your army now."); C.gen = null; } }
  needGeneral();
  for (const [n, v] of Object.entries(C.govs)) {
    const ct = CITIES.find(c => c[0] === n); if (!ct || cityOwner(g, ct) !== C.me) { delete C.govs[n]; continue; }
    v.served = (v.served | 0) + 1; if (v.served >= lifeOf(v)) { delete C.govs[n]; say(`${v.name}, governor of ${n}, dies`, "Of old age. The town needs a new governor."); }
  }
  // (governors who rule for you: the next year's work put in hand where they see fit, keeping something in the chest)
  for (const ct of citiesOfNow(g, C.me)) {
    const n = ct[0]; if (!govOf(n) || !C.rule[n] || C.Q[n]) continue;
    const opt = buildable(ct).filter(o => !o.tech && o.cost <= C.gold - 150).sort((a, b) => a.cost - b.cost)[0];
    if (opt) { C.gold -= opt.cost; C.Q[n] = { chain: opt.chain, by: C.me, cost: opt.cost }; say(`${govOf(n).short} begins ${CHAINS[opt.chain].levels[opt.lv].n.toLowerCase()} at ${n}`, `${opt.cost} thalers from the treasury.`); }
  }
}
// (the other crowns walling their own towns as they can afford it)
function raiseWalls(g, ids) {
  for (const id of ids) {
    // (the woods' nations raise no walls of stone: their towns stand behind palisades)
    if (NATIONS[id].nw || R() > 0.02 + NATIONS[id].strength * 0.012) continue;
    const open = citiesOfNow(g, id).filter(ct => !lvOf(ct[0], "walls")).sort((a, b) => b[3] - a[3]); if (!open.length) continue;
    const ct = R() < 0.7 ? open[0] : pick(open); C.walls[ct[0]] = 1;
    if ((C.mp ? humans() : [C.me]).some(h => as(h, () => atWar(id) || citiesOfNow(g, h).some(m => distFrom(g, h, ct) <= REACH)))) sayAll(`${The(id)} ${v3(id, "walls")} ${ct[0]}`, "Masons and labourers at work round the town: it will be harder to take.");
  }
}
// (the levy: a crown down to its last few towns, every man in them takes up arms — the fewer, the fiercer)
const levy = towns => Math.round(18 / Math.max(1, towns));
function odds(att, def, walls) { const a = Math.pow(att, 1.25), d = Math.pow(def * (walls ? 1.3 : 1), 1.25); return a / (a + d); }
// the outcome applied, however it was decided: casualties both ways; the town changes hands if the attacker won
function settle(o, won, myLossK, theirLossK) {
  const mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att;
  C.army = Math.max(0, Math.round(C.army - mine * myLossK));
  setFoeArmy(o.foe, Math.max(0, Math.round(foeArmy(o.foe) - Math.max(0, theirs - garrison(o.ct)) * theirLossK)));
  const name = o.ct[0];
  if (o.attack) {
    if (won) { seize(o.ct, C.me); C.took[o.foe] = (C.took[o.foe] || 0) + 1; for (const id of Object.keys(C.E.rel)) C.E.rel[id] -= id === o.foe ? 8 : 2; say(`${name} is yours`, `Taken from ${the(o.foe)}.`); }
    else say(`Beaten before ${name}`, `Your army falls back with what it has left: ${C.army} regiments.`);
  } else {
    if (won) { say(`${name} holds`, `${The(o.foe)}'s army is thrown back.`); if (!isHuman(o.foe) && C.foePos && C.foePos[o.foe]) { const h = homeOf(grid(), o.foe); if (h) { const b = stepToward(cellXY(o.ct), h, 8); C.foePos[o.foe] = { x: b.x, y: b.y }; } } strikeBack(o.foe); }
    else { seize(o.ct, o.foe); C.lost[o.foe] = (C.lost[o.foe] || 0) + 1; say(`${name} has fallen`, `${The(o.foe)} ${v3(o.foe, "takes")} it.`); if (C.govs) delete C.govs[name]; }
  }
  // (where your army ends up: in the town it took, or fallen back toward home from the one it couldn't)
  if (o.attack && !o.convoy) { const t = cellXY(o.ct); if (won) C.pos = { x: t.x, y: t.y }; else { const h = homeOf(grid(), C.me) || armyPos(); const b = stepToward(t, h, 6); C.pos = { x: b.x, y: b.y }; } }
  // (a storm through the breach: the siege over, won or lost)
  if (o.attack && siegeOf(o.ct)) C.siege = null;
  // (the army's spirit: up with a victory — more for a town taken — down hard with a defeat)
  moraleMove(won ? (o.attack ? 12 : 8) : -16);
  // (the generals' fate: in a lost battle one may fall; even in a won one, now and then)
  if (C.gen && R() < (won ? 0.05 : 0.25)) { moraleMove(-10); say(`${C.gen.name} falls at ${name}`, "Killed at the head of his men. Choose who will lead your army now."); C.gen = null; needGeneral(); }
  const fg = !isHuman(o.foe) && C.foeGen && C.foeGen[o.foe]; if (fg && R() < (won ? 0.2 : 0.04)) { say(`${fg.name} falls at ${name}`, `${The(o.foe)}'s general is dead. ${(C.foeGen[o.foe] = newMan(o.foe, "general")).name} takes his place.`); }
  // (and guns lost in a defeat, left on the field)
  if (!won && C.guns > 0 && R() < 0.6) C.guns--;
  checkEnd();
}
// (their army thrown back from your walls: their nearest town picked out on the map, to carry the war to them)
function strikeBack(foe) {
  const g = grid(), t = citiesOfNow(g, foe).filter(ct => inMarch(ct)).sort((a, b) => b[3] - a[3])[0];
  if (!t || C.moved || C.army < 5) return;
  selCity = t; sel = foe; note = `${The(foe)}'s army is beaten back and weakened. Strike back while it's down: ${t[0]} is within your reach.`;
}
function auto(o) {
  const mine = cmdMul(C.gen) * moraleK(), theirs = cmdMul(genOf(o.foe)), p = odds(o.att * (o.attack ? mine : theirs), o.def * (o.attack ? theirs : mine), o.walls && !o.breach), attWins = R() < p, won = o.attack ? attWins : !attWins;
  settle(o, won, won ? 0.08 + R() * 0.1 : 0.25 + R() * 0.2, won ? 0.3 + R() * 0.2 : 0.08 + R() * 0.1);
  return won;
}
// fought by your hand: the field at the town, your company and theirs as big as the armies are, the walls the
// defender's — on whichever side you are
// (how many of your army can take the field, and the guns it can bring — most of it, a great army)
const fieldMen = regs => clamp(Math.round(10 + regs / 1.6), 10, 70), fieldGuns = regs => Math.min(3, Math.floor(regs / 22));
function fight(o) {
  // (first the muster: how many go, and which arms — asked each time you fight it yourself)
  if (!o.pick) { musterFor(o); return; }
  const g = grid(), mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att;
  const myMen = Object.values(o.pick.men).reduce((t, n) => t + n, 0) || 10, theirMen = clamp(Math.round(10 + theirs / 2.2), 10, 48);
  const ally = Object.keys(C.ally).find(id => C.ally[id] && C.E.wars.some(w => (w.a === id && w.b === o.foe) || (w.b === id && w.a === o.foe)));
  const s = C.s, hourR = R();
  const def = o.attack ? 1 : 0, ct = o.ct;
  // (the battle fought in the town itself: its streets and square, and its wall with the way in, if it has one)
  const bu = def === 1 ? 1 : -1;
  // (a supply train on its way to the siege lines: fought on the open road, its wagons in your half of the field)
  const things = o.convoy ? [["convoy", -1, o.carts || 6, Math.round(ct[1] * 777 + C.year)]] : isVillage(ct) ? [["village", bu, ct[3], Math.round(ct[1] * 1000 + ct[2] * 100)]] : [["town", bu, ct[3], o.walls ? Math.max(1, lvOf(ct[0], "walls")) : 0, Math.round(ct[1] * 1000 + ct[2] * 100), o.battered || 0]];
  // (their raiders: horse, most of them — that's what's sent to fall on a convoy)
  const theirMuster = muster(o.foe, theirMen); if (o.convoy && !NATIONS[o.foe].nw) { const hk = Math.round(theirMen * 0.35); theirMuster.cavalry = (theirMuster.cavalry || 0) + hk; theirMuster.musketeer = Math.max(0, (theirMuster.musketeer || 0) - hk); }
  // (each side's nerve: your barracks, your learning, your general; theirs, their general's hold on them)
  const fg = genOf(o.foe), theirBrave = fg ? 1 + (fg.st[1] - 3) * 0.06 : 1, foeGuns = isHuman(o.foe) ? as(o.foe, () => C.guns | 0) : (C.fguns[o.foe] | 0);
  const b = {
    id: "cmp-" + ct[0], campaign: true, name: o.convoy ? `The road to ${ct[0]}` : ct[0], date: `${SEASONS[s]} ${C.year}`, year: C.year, lon: ct[1], lat: ct[2],
    at: o.convoy ? `${The(o.foe)} ${v3(o.foe, "falls")} on your supply train to ${ct[0]}` : o.attack ? `You march on ${the(o.foe)}'s town` : `${The(o.foe)} ${v3(o.foe, "marches")} on your town`,
    hour: hourR < 0.1 ? "night" : hourR < 0.35 ? "morning" : hourR < 0.8 ? "afternoon" : "evening",
    cloud: s === 3 ? 0.7 : s === 2 ? 0.5 : s === 0 ? 0.35 : 0.1, mist: s === 2 ? 0.3 : s === 3 ? 0.25 : 0,
    fort: null, won: undefined, you: 0,
    sides: [
      { name: NATIONS[C.me].name, lead: "you", hold: o.attack ? undefined : 999, cos: [{ uni: UNI_OF[C.me], muster: { ...o.pick.men }, guns: o.pick.guns | 0, brave: braveMul(g) }, ...(ally && !o.walls ? [{ uni: UNI_OF[ally], muster: muster(ally, 14), guns: 1 }] : [])] },
      { name: NATIONS[o.foe].name, lead: "their officers", hold: o.attack ? 999 : undefined, cos: [{ uni: UNI_OF[o.foe] === UNI_OF[C.me] ? (UNI_OF[C.me] === "imperial" ? "bavarian" : "imperial") : UNI_OF[o.foe], muster: theirMuster, guns: o.convoy ? 0 : Math.min(3, foeGuns, Math.ceil(theirs / 15)), brave: theirBrave }] },
    ],
    map: { snow: s === 3, things },
  };
  if (!C.mp || (mp && mp.host)) { C.pending = { ...o, ct: o.ct[0] }; persist(); }
  b.onEnd = (won, killed, lost) => doAct({ k: "result", won: !!won, killed: killed | 0, lost: lost | 0, myMen, theirMen });
  startBattle(b);
}
// ---- the muster before a battle you fight yourself: how many of your army take the field, and of which arms ----
const MUST_KINDS = ["musketeer", "grenadier", "pike", "sword", "axe", "bow", "crossbow", "cavalry"];
function musterFor(o) {
  const mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att, theirMen = clamp(Math.round(10 + theirs / 2.2), 10, 48);
  musterScreen({
    title: o.convoy ? `Escort the supply train to ${o.ct[0]}` : o.attack ? `March on ${o.ct[0]}` : `Hold ${o.ct[0]}`, regs: mine,
    foe: o.convoy ? `${The(o.foe)}'s raiders, about ${theirMen}, most of them horse, are out to take or burn your ${o.carts} wagons.` : `${The(o.foe)} can field about ${theirMen}${o.walls ? (o.attack ? ", behind their walls" : "; your walls are with you") : ""}.`,
    onGo: P => fight({ ...o, pick: P }), guns: C.guns | 0,
    // (a march you've ordered, called off before the battle: the army stays in camp, free to march again this year)
    onCancel: o.attack && !o.convoy ? () => doAct({ k: "calloff" }) : null,
    onAuto: C.mp ? null : () => {
      // (the generals fight it instead — as if you'd left it to them from the first)
      C.pending = null; if (o.convoy) { convoyEnd(o, R() < odds(o.def * cmdMul(C.gen) * moraleK(), o.att, false), 0.15, 0.2); persist(); drawMap(); return; } const won = auto(o); persist();
      note = won ? (o.attack ? `${o.ct[0]} is yours.` : `${o.ct[0]} holds.`) : (o.attack ? `The attack on ${o.ct[0]} failed.` : `${o.ct[0]} has fallen.`);
      sfx("guns", 0.5); if (won) sfx("bell", 0.4, 1600); drawMap();
    },
  });
}
// the muster itself: { title, regs (your regiments), foe (a line on the other side), onGo(pick), onAuto (or none) }
function musterScreen({ title, regs, foe, onGo, onAuto, onCancel = null, guns = null }) {
  const cap = fieldMen(regs), gunCap = Math.min(4, guns ?? fieldGuns(regs));
  const first = muster(C.me, clamp(Math.round(10 + regs / 2.2), 10, cap));
  const P = { men: Object.fromEntries(MUST_KINDS.map(k => [k, first[k] | 0])), guns: gunCap };
  let el = $("cmpMust"); if (!el) { el = document.createElement("div"); el.id = "cmpMust"; el.className = "cmp-must"; $("campaign").appendChild(el); }
  const total = () => MUST_KINDS.reduce((t, k) => t + P.men[k], 0);
  const draw = () => {
    const n = total();
    el.innerHTML = `<div class="cmp-mbox"><h2>${esc(title)}</h2>
      <p class="sub">Who takes the field? Your ${regs} regiments can put up to <b>${cap}</b> men in it and ${gunCap ? `${gunCap} gun${gunCap > 1 ? "s" : ""}` : "no guns"}. ${esc(foe)}</p>
      <div class="cmp-mrows">${MUST_KINDS.map(k => { const T = TROOPS[k]; return `<div class="cmp-mrow"><span><b>${T.name}</b><small>${esc(T.note)}</small></span><span class="cmp-step"><button data-mk="${k}" data-d="-5">−5</button><button data-mk="${k}" data-d="-1">−</button><em>${P.men[k]}</em><button data-mk="${k}" data-d="1"${n >= cap ? " disabled" : ""}>+</button><button data-mk="${k}" data-d="5"${n >= cap ? " disabled" : ""}>+5</button></span></div>`; }).join("")}
      ${gunCap ? `<div class="cmp-mrow"><span><b>Guns</b><small>Field gun, two crew</small></span><span class="cmp-step"><button data-mk="guns" data-d="-1">−</button><em>${P.guns}</em><button data-mk="guns" data-d="1"${P.guns >= gunCap ? " disabled" : ""}>+</button></span></div>` : ""}</div>
      <div class="cmp-mtot"><em><b>${n}</b> of ${cap} men${P.guns ? ` · ${P.guns} gun${P.guns > 1 ? "s" : ""}` : ""}</em><span><button class="tm-lnk" data-mp="army">As your army stands</button> · <button class="tm-lnk" data-mp="all">All you can</button> · <button class="tm-lnk" data-mp="none">Clear</button></span></div>
      <div class="pv-acts"><button class="btn primary" data-mgo="1"${n < 5 ? " disabled" : ""}>${n < 5 ? "Take at least 5 men" : "To the field"}</button>${onAuto ? `<button class="btn ghost" data-mauto="1">Leave it to your generals</button>` : ""}${onCancel ? `<button class="btn ghost" data-mcancel="1">Call off the march</button>` : ""}</div></div>`;
  };
  el.onclick = e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.mk) {
      const d = +b.dataset.d;
      if (b.dataset.mk === "guns") P.guns = clamp(P.guns + d, 0, gunCap);
      else { const k = b.dataset.mk; P.men[k] = Math.max(0, P.men[k] + Math.min(d, cap - total())); }
      sfx("parchment", 0.18); draw(); return;
    }
    if (b.dataset.mp) {
      const m = b.dataset.mp === "none" ? {} : muster(C.me, b.dataset.mp === "all" ? cap : clamp(Math.round(10 + regs / 2.2), 10, cap));
      for (const k of MUST_KINDS) P.men[k] = m[k] | 0; if (b.dataset.mp === "all") P.guns = gunCap; sfx("quill", 0.3); draw(); return;
    }
    if (b.dataset.mgo) { el.remove(); sfx("drum", 0.5); const men = {}; for (const k of MUST_KINDS) if (P.men[k]) men[k] = P.men[k]; onGo({ men, guns: P.guns }); return; }
    if (b.dataset.mauto && onAuto) { el.remove(); onAuto(); }
    if (b.dataset.mcancel && onCancel) { el.remove(); onCancel(); }
  };
  draw(); sfx("parchment", 0.4);
}
// (a muster sent from the other player's screen: held to what their army can field)
function fairPick(p, regs, crown) {
  const cap = fieldMen(regs), men = {}; let n = 0;
  for (const k of MUST_KINDS) { const v = clamp((p && p.men && p.men[k]) | 0, 0, cap - n); if (v) { men[k] = v; n += v; } }
  return { men: n >= 5 ? men : muster(crown, Math.min(cap, 20)), guns: clamp((p && p.guns) | 0, 0, Math.min(4, as(crown, () => C.guns | 0))) };
}
// a battle fought by hand and never finished (left from the pause menu): the army withdrew from it — lost
function abandoned() {
  if (!C || !C.pending || (window.__G && window.__G.arena)) return;
  doAct({ k: "result", won: false, left: true });
}

// ---- your season's doings ----
function march(ct) {
  const g = grid(), foe = cityOwner(g, ct), S = siegeOf(ct);
  // (an army sat down before one town can't march on another: the siege is lifted first)
  if (C.siege && !S) return null;
  if (C.moved || !foe || !atWar(foe) || C.army < 5 || !inMarch(ct)) return null;
  C.moved = true; C.go = null;
  return { attack: true, foe, ct, att: C.army, def: defOf(g, ct, foe), walls: hasWalls(ct, foe, g), breach: !!S && S.bat >= 1, battered: S ? S.bat : 0, siege: !!S };
}
// ---- a siege: the army sat down before a walled town, year after year — the garrison starving, the guns battering the
//  walls, sickness in the camp; until the town gives in, or is stormed through the breach, or a relief army comes ----
const siegeOf = ct => C.siege && C.siege.ct === (Array.isArray(ct) ? ct[0] : ct) ? C.siege : null;
// what holds a town: its garrison (starved by a siege), and the part of its crown's army that can be brought to it (a
//  besieged town's field army is outside the lines, not in it — half of it)
function defOf(g, ct, foe) {
  const S = siegeOf(ct), gar = Math.round(garrison(ct) * (1 - (S ? S.starve : 0)));
  return gar + Math.round(foeArmy(foe) * (isHuman(foe) ? 0.7 : 0.65) * (S ? 0.5 : 1)) + (isHuman(foe) ? levy(citiesOfNow(g, foe).length) : 0);
}
// ---- a supply train to the siege lines: powder and shot, bread and biscuit, and fresh men marching with it — bought, and
//  then fought for on the road, for the enemy's horse will try for it. Through: your army made up again; taken: lost ----
const SUPPLY_COST = 150;
function sendSupply(how) {
  const S = C.siege; if (!S || C.supplied || C.gold < SUPPLY_COST || C.army < 6) return null;
  const ct = CITIES.find(c => c[0] === S.ct); if (!ct) return null;
  C.gold -= SUPPLY_COST; C.supplied = true;
  const escort = Math.max(6, Math.round(C.army * 0.35)), raid = Math.max(6, Math.round(foeArmy(S.foe) * 0.35));
  return { convoy: true, attack: false, foe: S.foe, ct, att: raid, def: escort, carts: 4 + Math.min(4, Math.floor(C.army / 20)), walls: false };
}
function convoyEnd(o, won, myLossK) {
  const lost = Math.round(o.def * myLossK); C.army = Math.max(0, C.army - lost);
  const S = C.siege;
  if (won) {
    const fresh = 8 + Math.round((o.carts || 6) * 1.2);
    C.army += fresh; moraleMove(8);
    if (S) S.fed = true;
    setFoeArmy(o.foe, Math.max(0, foeArmy(o.foe) - Math.round(o.att * 0.3)));
    say(`The supply train reaches ${o.ct[0]}`, `Powder, bread and ${fresh} regiments of fresh men come into the siege lines.${lost ? ` ${lost} lost on the road.` : ""}`);
  } else {
    moraleMove(-6); setFoeArmy(o.foe, foeArmy(o.foe) + 3);
    say(`The supply train is taken`, `${The(o.foe)}'s raiders fall on it on the road to ${o.ct[0]}: the wagons burned or carried off, ${lost} regiments of the escort lost.`);
  }
}
function siegeYear(g) {
  const S = C.siege; if (!S) return;
  const ct = CITIES.find(c => c[0] === S.ct);
  if (!ct || cityOwner(g, ct) !== S.foe || !atWar(S.foe)) { C.siege = null; return; }
  S.years++;
  S.starve = Math.min(0.8, S.starve + 0.2 + (ct[3] <= 1 ? 0.08 : 0));
  // (a star fort takes twice the battering: its low, thick, angled walls shrug off shot)
  S.bat = Math.round((S.bat + (0.06 + (C.guns | 0) * 0.2 * (knows("trace") ? 1.2 : 1)) * (lvOf(S.ct, "walls") >= 2 ? 0.5 : 1)) * 100) / 100;
  // (sickness in the lines: the camp fever, dysentery — the price of every siege)
  const sick = S.fed ? 0 : Math.max(1, Math.round(C.army * 0.04)); C.army = Math.max(0, C.army - sick); if (!S.fed) moraleMove(-3); S.fed = false;
  // a relief army: the crown marches to lift it
  const fa = foeArmy(S.foe);
  if (fa >= 8 && R() < 0.4) {
    // (your army behind its lines of circumvallation: entrenched, and the better for it)
    const p = odds(fa * 0.8 * cmdMul(genOf(S.foe)), C.army * 1.3 * cmdMul(C.gen) * moraleK(), false);
    if (R() < p) { const l = Math.round(C.army * 0.25); C.army -= l; setFoeArmy(S.foe, Math.round(fa * 0.85)); moraleMove(-12); C.siege = null; say(`The siege of ${S.ct} is broken`, `${The(S.foe)} ${v3(S.foe, "marches")} to its relief and drives your army from its lines. ${l} regiments lost.`); return; }
    setFoeArmy(S.foe, Math.round(fa * 0.7)); moraleMove(6); say(`A relief army beaten off at ${S.ct}`, `${The(S.foe)} tried to lift the siege, and failed.`);
  }
  // the town gives in: starved, its walls open, no hope of relief
  const give = S.starve * 0.55 + Math.min(1, S.bat) * 0.2 + (S.years >= 4 ? 0.3 : 0) - ct[3] * 0.08;
  if (R() < give) {
    C.siege = null; seize(ct, C.me); C.took[S.foe] = (C.took[S.foe] || 0) + 1; moraleMove(10);
    say(`${S.ct} surrenders`, `After ${S.years} year${S.years > 1 ? "s" : ""} of siege the garrison marches out with the honours of war, and the town is yours.`);
    return;
  }
  say(`The siege of ${S.ct}: year ${S.years}`, `The garrison is ${S.starve >= 0.6 ? "starving" : S.starve >= 0.3 ? "on short rations" : "still well fed"}; ${S.bat >= 1 ? "the walls are breached — the town can be stormed" : S.bat >= 0.5 ? "the walls are badly battered" : "the guns are at work on the walls"}. ${sick ? `${sick} regiments lost to sickness in the lines.` : "The camp, well supplied, keeps its health."}`);
}
// (raised now, they join next year: a regiment takes a year to arm and drill)
function recruit(n) { const c = regCost(grid()), k = Math.min(n, Math.floor(C.gold / c)); if (k <= 0) return; C.gold -= k * c; C.levyQ = (C.levyQ | 0) + k; persist(); }
const income = g => 40 + citiesOfNow(g, C.me).reduce((t, ct) => t + worth(ct), 0) + Object.keys(C.E.pact).filter(id => C.E.pact[id]).reduce((t, id) => t + 10 + NATIONS[id].strength * 4, 0);
const upkeep = () => Math.round(C.army * 1.6 * (1 + (C.gen ? C.gen.st[2] : 2) * 0.04));
// diplomacy: what you can do with a crown this season
function diplo(id, what) {
  const r = C.E.rel, did = C.did[id] ||= {};
  const done = t => { did[what] = true; persist(); return t; };
  if (what === "envoy") { if (did.envoy || atWar(id) || C.gold < 40) return null; C.gold -= 40; r[id] = clamp(r[id] + 6 + Math.round(R() * 7), -100, 100); return done(`Your envoy is received at ${courtOf(id)}.`); }
  if (what === "gift") { if (did.gift || atWar(id) || C.gold < 150) return null; C.gold -= 150; r[id] = clamp(r[id] + 18 + Math.round(R() * 8), -100, 100); return done(`${The(id)} ${v3(id, "accepts")} your gift.`); }
  if (what === "pact") { if (atWar(id) || C.E.pact[id] || r[id] < 20) return null; C.E.pact[id] = true; r[id] += 5; return done(`A trade pact with ${the(id)}: their merchants in your towns, yours in theirs.`); }
  if (what === "unpact") { C.E.pact[id] = false; r[id] -= 10; return done(`The trade pact with ${the(id)} ${v3(id, "is")} ended.`); }
  if (what === "ally") { if (atWar(id) || C.ally[id] || r[id] < 55) return null; if (R() < 0.25 + (r[id] - 55) / 60) { C.ally[id] = true; r[id] += 5; return done(`${The(id)} ${v3(id, "is")} your ally: it will join your wars.`); } r[id] -= 3; return done(`${The(id)} won't bind itself to you — not yet.`); }
  if (what === "unally") { C.ally[id] = false; r[id] -= 20; return done(`You break the alliance with ${the(id)}.`); }
  if (what === "war") {
    if (atWar(id) || (C.truce[id] || 0) > 0) return null;
    declare(id, C.me);
    for (const o of Object.keys(r)) r[o] -= C.ally[o] ? 0 : 4;
    return done(`You declare war on ${the(id)}.`);
  }
  if (what === "peace") {
    if (!atWar(id) || did.peace) return null;
    const ratio = C.army / Math.max(1, foeArmy(id)), p = clamp(0.15 + ratio * 0.18 + (C.took[id] || 0) * 0.12 - (C.lost[id] || 0) * 0.06 + (C.warT[id] || 0) * 0.03 + r[id] / 300, 0.05, 0.9);
    did.peace = true;
    if (R() < p) { makePeace(id); return done(`${The(id)} ${v3(id, "agrees")} to peace.`); }
    persist(); return `${The(id)} ${v3(id, "refuses")} your peace — for now.`;
  }
  return null;
}
const courtOf = id => { const c = citiesOfNow(grid(), id).sort((a, b) => b[3] - a[3])[0]; return c ? c[0] : the(id); };
function declare(id, by) {
  C.E.war[id] = true; C.warT[id] = 0; C.E.pact[id] = false; C.ally[id] = false;
  C.E.rel[id] = Math.min(C.E.rel[id], -40);
  // (your allies: into it with you, against them)
  for (const a of Object.keys(C.ally)) if (C.ally[a] && a !== id && !isHuman(a) && C.E.rel[a] >= 30 && !C.E.wars.some(w => (w.a === a && w.b === id) || (w.a === id && w.b === a))) { C.E.wars.push({ a, b: id, battles: 0, withYou: true }); say(`${The(a)} ${v3(a, "joins")} your war`, `Your ally marches on ${the(id)}.`); }
  if (by !== C.me) say(`${The(id)} ${v3(id, "declares")} war on you!`, `Their army: some ${C.foes[id]} regiments.`);
}
function makePeace(id) { C.E.war[id] = false; C.truce[id] = 6; C.E.rel[id] = Math.max(C.E.rel[id] + 15, -20); C.E.wars = C.E.wars.filter(w => !(w.withYou && (w.a === id || w.b === id))); say(`Peace with ${the(id)}`, "A treaty is signed. Neither side may make war for six seasons."); }

// ---- the season ends: the treasury, the other crowns' doings, and what comes at you ----
function endSeason(part = {}) {
  const world = part.world !== false, mine = part.mine !== false, turn = part.turn !== false;
  if (mine && !C.mp && (C.over || C.events.some(e => !e.done))) return;
  ensureRealm();
  const g = grid(), ids = Object.keys(NATIONS).filter(id => id !== C.me && !isHuman(id) && alive(g, id));
  // (the year's works finished first: what was put in hand this year stands at its end)
  if (world) realmWorld(g, ids);
  if (mine && !C.over) { C.gold += income(g) - upkeep(); realmMine(g);
  if (C.gold < 0) { const lose = Math.ceil(-C.gold / REGIMENT); C.army = Math.max(0, C.army - lose); C.gold = 0; moraleMove(-15); say("The pay chest is empty", `${lose} regiments desert for want of pay.`); } }
  // (the other crowns: their armies made up again; their tempers going back to where their faith puts them)
  for (const id of ids) {
    const cap = NATIONS[id].strength * 17 + citiesOfNow(g, id).length * 3 + 8;
    if (world) C.foes[id] = Math.min(Math.max(cap, C.foes[id] || 0), (C.foes[id] || 0) + Math.max(1, Math.round(NATIONS[id].strength * 1.6 + (C.E.plague[id] ? -2 : 0))));
    if (!mine) continue;
    const home = (NATION_FAITH[id] === NATION_FAITH[C.me] ? 18 : 0) + (C.E.pact[id] ? 15 : 0) + (C.ally[id] ? 25 : 0) - (atWar(id) ? 40 : 0);
    C.E.rel[id] += Math.sign(home - C.E.rel[id]) * Math.min(2, Math.abs(home - C.E.rel[id]));
    if (C.E.pact[id] && (C.E.rel[id] < 0 || atWar(id))) { C.E.pact[id] = false; say(`${The(id)} ${v3(id, "ends")} your trade pact`); }
    if (C.ally[id] && C.E.rel[id] < 20) { C.ally[id] = false; say(`${The(id)} ${v3(id, "leaves")} your alliance`); }
    if (C.truce[id] > 0) C.truce[id]--;
    if (atWar(id)) C.warT[id] = (C.warT[id] || 0) + 1;
  }
  // (and they at each other: their wars begun, fought and ended, and the borders moving)
  if (world) crownsWar(g, ids);
  if (world) raiseWalls(g, ids);
  if (mine && !C.over) {
  const g2 = grid(), mine = citiesOfNow(g2, C.me), nb = neighbours(g2, C.me), big = mine.length;
  // who'll make war on you: a neighbour that hates you, or fears you as you grow — and thinks itself able
  // (a new crown is watched for its first two years before anyone tries it)
  const years = C.year - 1683;
  for (const id of ids) {
    if (years < 2 || atWar(id) || C.ally[id] || (C.truce[id] || 0) > 0 || !nb.has(id) || !alive(g2, id)) continue;
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
    if (!atWar(id) || C.foes[id] < 8 || R() > 0.5) continue;
    // (a walled town is only sat down before by a crown with guns to batter it)
    // (a town already marched toward: kept to; else one within its reach)
    C.foeGo ||= {};
    let ct = C.foeGo[id] && mine.find(c => c[0] === C.foeGo[id]);
    if (!ct) { const near = mine.filter(c => inReach(g2, c, id) && (!hasWalls(c, C.me, g2) || (C.fguns[id] | 0) > 0)); if (!near.length) continue; ct = pick(near); }
    // its army on the road: there this year if it's near enough, else a year's march nearer — seen coming
    const fp = foeArmyPos(id), tc = cellXY(ct);
    if (fp && overSea(fp, tc)) { C.foePos[id] = { x: tc.x, y: tc.y }; C.foeGo[id] = ct[0]; say(`${The(id)} ${v3(id, "ships")} an army over the Atlantic`, `Some ${C.foes[id]} regiments, bound for ${ct[0]}. They'll be at its walls next year.`); continue; }
    if (fp && dist2(fp, tc) > MARCH) { const st = stepToward(fp, tc, MARCH); C.foePos[id] = { x: st.x, y: st.y }; C.foeGo[id] = ct[0]; say(`${The(id)}'s army marches toward ${ct[0]}`, `Some ${C.foes[id]} regiments, a year's march off. They'll be at its walls next year.`); continue; }
    if (fp) C.foePos[id] = { x: tc.x, y: tc.y }; delete C.foeGo[id];
    const att = Math.round(C.foes[id] * (0.45 + R() * 0.25));
    // (your army comes to its help only if it's near)
    C.events.push({ kind: "attack", foe: id, ct: ct[0], att, def: garrison(ct) + levy(mine.length) + (armyNear(ct) ? Math.round(C.army * 0.7) : 0), walls: hasWalls(ct, C.me), army: armyNear(ct) });
  }
  }
  // a plague or a bad harvest, now and then
  if (world) {
    if (R() < 0.08 && ids.length) { const id = pick(ids); C.E.plague[id] = 3; sayAll(`Plague in ${the(id)}`, "Their armies thin."); C.foes[id] = Math.round(C.foes[id] * 0.8); }
    for (const id of Object.keys(C.E.plague)) if (--C.E.plague[id] <= 0) delete C.E.plague[id];
  }
  // the season turns
  // the year turns (a turn is a year; the season of its fighting, as it falls)
  if (turn) { C.year++; C.s = Math.floor(R() * 3); }
  if (!mine) { persist(); return; }
  C.moved = false; C.did = {}; C.supplied = false;
  // (an army still on its way: the year's march taken up with getting there)
  if (C.go && !C.siege) { const st = stepToward(armyPos(), C.go, MARCH); C.pos = { x: st.x, y: st.y }; if (st.arrived) { C.go = null; say("Your army arrives", "It's where you sent it, and can march again next year."); } C.moved = true; }
  say(`${C.year}`, `${income(grid()) - upkeep() >= 0 ? "+" : ""}${income(grid()) - upkeep()} thalers a year. ${C.events.filter(e => !e.done).length ? "Things need your word." : ""}`);
  checkEnd(); persist();
}
function crownsWar(g, ids) {
  const W = C.E.wars;
  if (W.filter(w => !w.withYou).length < 4 && R() < 0.35) {
    // (never on a crown of its own league)
    const a = pick(ids), nb = [...neighbours(g, a)].filter(b => b !== C.me && !isHuman(b) && !leagueOf(a, b) && !W.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)));
    if (nb.length) {
      const b = pick(nb); W.push({ a, b, battles: 0 }); sayAll(`${The(a)} and ${the(b)} are at war`);
      // (and the attacked crown's league comes in on its side — one or two of them, as treaties were kept)
      for (const x of alliesOf(b).filter(x => x !== a && x !== C.me && !isHuman(x) && alive(g, x) && !leagueOf(x, a) && !W.some(w => (w.a === x && w.b === a) || (w.a === a && w.b === x))).slice(0, 2)) if (R() < 0.6) { W.push({ a: x, b: a, battles: 0 }); sayAll(`${The(x)} ${v3(x, "comes")} in on ${the(b)}'s side`, `Against ${the(a)}, as its league binds it.`); }
    }
  }
  for (const w of W.slice()) {
    if (!alive(grid(), w.a) || !alive(grid(), w.b)) { W.splice(W.indexOf(w), 1); continue; }
    if (R() > 0.45) continue;
    const sa = C.foes[w.a] + NATIONS[w.a].strength * 4, sb = C.foes[w.b] + NATIONS[w.b].strength * 4, aWins = R() < sa / (sa + sb);
    const win = aWins ? w.a : w.b, lose = aWins ? w.b : w.a, gg = grid();
    const target = citiesOfNow(gg, lose).filter(ct => distFrom(gg, win, ct) <= REACH && (!hasWalls(ct, lose, gg) || (C.fguns[win] | 0) > 0));
    C.foes[lose] = Math.max(0, C.foes[lose] - 3 - Math.floor(R() * 4)); C.foes[win] = Math.max(0, C.foes[win] - 1 - Math.floor(R() * 2));
    if (target.length) { const ct = pick(target); seize(ct, win); if (ct[3] >= 2 || w.withYou) sayAll(`${The(win)} ${v3(win, "takes")} ${ct[0]} from ${the(lose)}`); }
    w.battles++;
    if (!w.withYou && w.battles >= 3 && R() < 0.3) { W.splice(W.indexOf(w), 1); sayAll(`${The(w.a)} and ${the(w.b)} make peace`); }
  }
}
function checkEnd() {
  orphans(C.me);
  const g = grid(), n = citiesOfNow(g, C.me).length;
  if (!n && !C.over) { C.over = "lost"; say("Your crown is lost", "The last of your towns has fallen."); }
  if (n >= WIN_CITIES && !C.won) { C.won = true; say("Europe is yours", `${n} towns under your crown. Play on, if you like.`); }
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !alive(g, id)) { C.E.war[id] = false; const by = C.gone && C.gone[id]; say(`${The(id)} ${v3(id, "is")} no more`, by === C.me ? "Its last town has fallen to you, and every acre of its land is yours." : by ? `${The(by)} ${v3(by, "has")} taken the last of it.` : "Its last town is yours or another's."); }
}

// ---------------------------------------------------------------------------
//  the screens: choosing a crown, and the map
// ---------------------------------------------------------------------------
let view = { z: 1, ox: 0, oy: 0 }, sel = null, selCity = null, hov = null, hovCity = null, note = "", news = [];
// (close in, the land itself: hills, woods, the towns' roofs — the government's map, as in the story)
let ZOOM_3D = 4.2 * 2.5; const DIST_2D = 110;
let eu3d = null, on3d = false, raf3d = 0, fade3d = 0, enter3d = () => {}, leave3d = () => {};
// (drawn only while the campaign's map is in front of you)
const loop3d = () => { if (!on3d || !shown()) { if (eu3d) eu3d.visible = false; raf3d = 0; return; } eu3d.visible = true; if (innerWidth !== eu3d.w || innerHeight !== eu3d.h) eu3d.size(innerWidth, innerHeight); eu3d.frame(); raf3d = requestAnimationFrame(loop3d); };
const shown = () => !$("campaign").classList.contains("hidden") && !$("cmpPlay").classList.contains("hidden");
export function initCampaign(c, battle, withPlayer) {
  ctx = c; startBattle = battle; fieldWithPlayer = withPlayer || null;
  ZOOM_3D = 4.2 * ZF(); addEventListener("resize", () => { ZOOM_3D = 4.2 * ZF(); });
  // (leaving a campaign of two: the link closed — the host keeps it to take up again — and the one alone as it was)
  $("cmpBack").onclick = () => { if (mp) leaveMp(); ctx.screen("pvp"); };
  $("cmpNew").onclick = () => { if (!mp) drawPick(); };
  $("cmpPick").addEventListener("click", e => {
    const r = e.target.closest("[data-mpresume]"); if (r && mp && mp.host) { mp.net.send({ t: "cpick", crown: "" }); resumeMp(); return; }
    const b = e.target.closest("[data-crown]"); if (!b) return;
    if (mp) { if (b.dataset.crown === mp.theirs) return; mp.mine = b.dataset.crown; mp.net.send({ t: "cpick", crown: mp.mine }); sfx("parchment", 0.4); if (mp.host) maybeBegin(); if (!C) drawPick(); return; }
    // (into an empty place; all three taken, the one longest left alone makes way — asked first)
    const have = campaigns(); let into = [...Array(SLOTS).keys()].find(i => !have.some(h => h.i === i));
    if (into === undefined) { const old = have[have.length - 1]; if (!confirm(`You have ${SLOTS} campaigns. Begin a new one in place of ${NATIONS[old.c.me].name}, ${old.c.year}? That one will be lost.`)) return; into = old.i; }
    begin(b.dataset.crown, into); sel = null; selCity = null; drawMap(true); sfx("bell", 0.45); sfx("drum", 0.4, 900); });
  $("cmpPick").addEventListener("click", e => {
    const go = e.target.closest("[data-slot]"), drop = e.target.closest("[data-drop]");
    if (go) { slot = +go.dataset.slot; try { localStorage.setItem(SLOTKEY, String(slot)); } catch (er) {} if (resume()) { sel = null; selCity = null; note = ""; news = []; drawMap(true); sfx("parchment", 0.45); } return; }
    if (drop) { const i = +drop.dataset.drop, c = load(i); if (!c || !confirm(`Give up your campaign as ${NATIONS[c.me].name} (${c.year})? It can't be brought back.`)) return; try { localStorage.removeItem(slotKey(i)); } catch (er) {} if (i === slot) C = null; sfx("quill", 0.35); drawPick(); }
  });
  $("cmpEnd").onclick = () => {
    if (C && C.mp) { if (!mp || mp.gone) return; doAct({ k: "end" }); sfx("quill", 0.35); return; }
    const before = C.log.length ? C.log[0] : null; endSeason();
    sfx("parchment", 0.55);
    // (what happened while the season turned: the news of it, at the top)
    const fresh = []; for (const l of C.log) { if (l === before) break; fresh.push(l); }
    news = fresh.filter(l => !/^((Spring|Summer|Autumn|Winter) )?\d{4}$/.test(l.title)).reverse(); note = ""; drawMap();
    // (war on you, or an army on its way: the drum; a crown gone from the map: the bells)
    if (C.events.some(e => e.kind === "attack" && !e.done) || news.some(l => /declares war on you/.test(l.title))) sfx("drum", 0.5, 400);
    else if (news.some(l => /is no more|takes /.test(l.title))) sfx("guns", 0.4, 400);
  };
  $("cmpSide").addEventListener("click", sideClick);
  $("cmpSide").addEventListener("change", e => { const t = e.target.closest("[data-rule]"); if (t && C) doAct({ k: "rule", ct: t.dataset.rule, on: t.checked }); });
  $("cmpTechB").onclick = () => { if (C) { drawTech(); sfx("parchment", 0.4); } };
  $("cmpPanel").onclick = () => { $("cmpSide").classList.toggle("shut"); sfx("parchment", 0.5); };
  addEventListener("keydown", e => { if (e.code === "Tab" && !$("campaign").classList.contains("hidden") && !$("cmpPlay").classList.contains("hidden")) { e.preventDefault(); e.stopImmediatePropagation(); $("cmpPanel").click(); } }, true);
  addEventListener("resize", () => { if (C && !$("campaign").classList.contains("hidden") && !$("cmpPlay").classList.contains("hidden")) drawMap(); });
  const cv = $("cmpMap");
  let drag = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const toMap = ([x, y]) => [view.ox + x / view.z, view.oy + y / view.z];
  const clampV = () => { view.z = clamp(view.z, 1, 6 * ZF()); view.ox = clamp(view.ox, 0, cv.width - cv.width / view.z); view.oy = clamp(view.oy, 0, cv.height - cv.height / view.z); };
  const zoomAt = (px, py, f) => {
    const [bx, by] = toMap([px, py]); view.z *= f;
    if (view.z > ZOOM_3D) { view.z = ZOOM_3D; clampV(); view.ox = bx - px / view.z; view.oy = by - py / view.z; clampV(); return enter3d(); }
    clampV(); view.ox = bx - px / view.z; view.oy = by - py / view.z; clampV(); paint();
  };
  cv.addEventListener("wheel", e => { e.preventDefault(); const [px, py] = pos(e); zoomAt(px, py, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.onmousedown = e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; };
  cv.onmousemove = e => {
    if (drag && e.buttons & 1) { const r = cv.getBoundingClientRect(), dx = (e.clientX - drag.x) * cv.width / r.width, dy = (e.clientY - drag.y) * cv.height / r.height; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; if (drag.moved > 5) { view.ox -= dx / view.z; view.oy -= dy / view.z; clampV(); paint(); return; } }
    if (!C) return;
    const p = toMap(pos(e)), ct = cityAt(cv, ...p, view.z), id = nationAt(E(), cv, ...p);
    cv.style.cursor = ct || id ? "pointer" : "grab";
    if (ct !== hovCity || id !== hov) { hovCity = ct; hov = id; paint(); }
  };
  cv.onmouseleave = () => { drag = null; hov = null; hovCity = null; paint(); };
  // (right-click: your army sent there)
  cv.oncontextmenu = e => {
    e.preventDefault(); if (!C) return;
    const [mx, my] = toMap(pos(e)), S = cv.width / MG_W; doAct({ k: "move", x: mx / S, y: my / S }); armySel = false;
  };
  cv.onmouseup = e => {
    const moved = drag ? drag.moved : 0; drag = null; if (moved > 5 || !C || e.button !== 0) return;
    // (your army: picked up — the next right-click sends it)
    if (armyHit(cv, ...pos(e))) { armySel = !armySel; selCity = null; sel = null; note = armySel ? "Your army: right-click anywhere on the map to march there. A year's march takes it about 350 km; a town within that is in its reach." : ""; drawMap(); sfx("drum", 0.25); return; }
    armySel = false;
    const p = toMap(pos(e)), ct = cityAt(cv, ...p, view.z);
    selCity = ct || null; sel = ct ? cityOwner(grid(), ct) : nationAt(E(), cv, ...p); note = "";
    // (the peoples' country: whose it is, and that it isn't a crown's)
    if (!selCity && !sel) { const pp = peopleAt(cv, ...p, E()); if (pp) note = `This is the country of ${PEOPLES[pp].long}. It is their own, and no crown's to take: an army may cross it, but not seize it.`; }
    drawMap(); if (selCity || sel || note) sfx("parchment", 0.28);
  };
  // the middle of the window, on the canvas (which is bigger than the window, and centred on it)
  const mid = () => { const r = cv.getBoundingClientRect(); return [(innerWidth / 2 - r.left) * cv.width / r.width, (innerHeight / 2 - r.top) * cv.height / r.height]; };
  for (const b of document.querySelectorAll("#campaign .cmp-zoom button")) b.onclick = () => {
    if (on3d) { eu3d.dist = Math.max(2.2, eu3d.dist * (b.dataset.z === "in" ? 0.6 : 1.6)); if (eu3d.dist > DIST_2D) leave3d(); return; }
    zoomAt(...mid(), b.dataset.z === "in" ? 1.5 : 1 / 1.5);
  };
  // ---- into the land, and back out to the map ----
  const wrap = cv.parentElement;
  enter3d = () => {
    W0();
    if (!eu3d) {
      eu3d = new EuropeView3D(wrap);
      eu3d.el.addEventListener("wheel", e => { e.preventDefault(); eu3d.dist = Math.max(2.2, eu3d.dist * Math.exp(e.deltaY * 0.0015)); if (eu3d.dist > DIST_2D) leave3d(); }, { passive: false });
      let d3 = null;
      eu3d.el.addEventListener("mousedown", e => { d3 = { x: e.clientX, y: e.clientY, moved: 0 }; });
      // (right-click on the land: your army sent there)
      eu3d.el.addEventListener("contextmenu", e => { e.preventDefault(); if (!C) return; const r = eu3d.el.getBoundingClientRect(), hit = eu3d.pick(e.clientX - r.left, e.clientY - r.top); if (!hit || !hit.ll) return; const [gx, gy] = gridOf(...hit.ll); doAct({ k: "move", x: gx, y: gy }); });
      addEventListener("mousemove", e => {
        if (!on3d) return;
        if (d3 && e.buttons & 1) { const dx = e.clientX - d3.x, dy = e.clientY - d3.y; d3.moved += Math.abs(dx) + Math.abs(dy); d3.x = e.clientX; d3.y = e.clientY; eu3d.pan(dx, dy); eu3d.el.style.cursor = "grabbing"; return; }
        if (e.target !== eu3d.el) return;
        const r = eu3d.el.getBoundingClientRect(), hit = eu3d.pick(e.clientX - r.left, e.clientY - r.top);
        eu3d.el.style.cursor = hit && hit.city ? "pointer" : "grab";
      });
      addEventListener("mouseup", e => {
        if (!d3 || !on3d) { d3 = null; return; }
        const moved = d3.moved; d3 = null; eu3d.el.style.cursor = "grab"; if (moved > 5 || !C) return;
        const r = eu3d.el.getBoundingClientRect(), hit = eu3d.pick(e.clientX - r.left, e.clientY - r.top); if (!hit) return;
        if (hit.city) { selCity = CITIES.find(c => c[0] === hit.city) || null; sel = selCity ? cityOwner(grid(), selCity) : null; }
        else { const [gx, gy] = gridOf(...hit.ll), g = grid(), id = g[Math.floor(gy)] && g[Math.floor(gy)][Math.floor(gx)]; selCity = null; sel = id && NATIONS[id] ? id : null; }
        note = ""; drawMap(); if (selCity || sel) sfx("parchment", 0.28);
      });
    }
    // (the middle of the window's view, as a place)
    const S = cv.width / MG_W, [mx, my] = toMap(mid()), [lon, lat] = llOf(mx / S, my / S);
    eu3d.look(lon, lat, DIST_2D - 12);
    // (the land fades in over the map — the map hidden under it once it's there)
    on3d = true; eu3d.visible = true; clearTimeout(fade3d); eu3d.el.style.display = "block"; eu3d.el.classList.remove("on"); void eu3d.el.offsetWidth; eu3d.el.classList.add("on");
    fade3d = setTimeout(() => { if (on3d) cv.style.visibility = "hidden"; }, 420);
    eu3d.size(innerWidth, innerHeight); paint();
    cancelAnimationFrame(raf3d); raf3d = 0; loop3d();
  };
  leave3d = () => {
    W0();
    const [lon, lat] = eu3d.centreLL(), [gx, gy] = gridOf(lon, lat), S = cv.width / MG_W;
    // (the map drawn under the land, and the land faded off it — the last frame held while it goes)
    on3d = false; cv.style.visibility = "visible"; eu3d.el.classList.remove("on"); clearTimeout(fade3d);
    fade3d = setTimeout(() => { if (!on3d) { eu3d.visible = false; eu3d.el.style.display = "none"; } }, 520);
    view.z = ZOOM_3D - 0.4 * ZF(); const [cx, cy] = mid(); view.ox = gx * S - cx / view.z; view.oy = gy * S - cy / view.z; clampV(); paint();
  };
  // ---- WASD (or the arrows) to move over the map; Q and E to come in and go out; Shift, faster ----
  const keys = new Set();
  const typing = () => { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable); };
  const KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyQ: "in", KeyE: "out" };
  let last = 0, rafK = 0;
  const step = t => {
    if (!keys.size || !C || !shown()) { keys.clear(); rafK = 0; return; }
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    let dx = 0, dy = 0, zin = 0; const fast = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.4 : 1;
    for (const k of keys) { const v = KEYS[k]; if (!v) continue; if (v === "in") zin += 1; else if (v === "out") zin -= 1; else { dx += v[0]; dy += v[1]; } }
    if (on3d) {
      if (dx || dy) eu3d.pan(-dx * 700 * fast * dt, -dy * 500 * fast * dt);
      if (zin) { eu3d.dist = Math.max(2.2, eu3d.dist * Math.exp(-zin * 1.6 * dt)); if (eu3d.dist > DIST_2D) leave3d(); }
    } else {
      if (dx || dy) { const sp = 900 * fast * dt * cv.width / 1300; view.ox += dx * sp / view.z; view.oy += dy * sp / view.z; clampV(); paint(); }
      if (zin) zoomAt(...mid(), Math.exp(zin * 1.4 * dt));
    }
    rafK = requestAnimationFrame(step);
  };
  addEventListener("keydown", e => {
    if (!C || !shown() || typing() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!KEYS[e.code] && !/^Shift/.test(e.code)) return;
    if (KEYS[e.code]) { e.preventDefault(); e.stopImmediatePropagation(); }
    keys.add(e.code); if (!rafK) { last = 0; rafK = requestAnimationFrame(step); }
  }, true);
  addEventListener("keyup", e => { keys.delete(e.code); });
  addEventListener("blur", () => keys.clear());
}
// To Arms → Campaign: the one you have, or a crown to choose
export function openCampaign() {
  ctx.screen("campaign");
  if (mp) { if (C) { abandoned(); drawMap(); } else drawPick(); return; }
  if (C || resume()) { abandoned(); drawMap(true); } else drawPick();
}
function leaveMp() {
  const m = mp; mp = null; C = null; sel = null; selCity = null; note = ""; news = [];
  try { m.net.send({ t: "dleave" }); m.net.close(); } catch (e) {}
}
function drawPick() {
  $("cmpPick").classList.remove("hidden"); $("cmpPlay").classList.add("hidden");
  W0(); const g = buildGrid({ conq: [] });
  const list = Object.keys(NATIONS).map(id => ({ id, n: citiesOfNow(g, id).length, s: NATIONS[id].strength })).filter(x => x.n && !NATIONS[x.id].nw).sort((a, b) => b.s - a.s || b.n - a.n);
  const word = s => s >= 5 ? "A great power" : s >= 4 ? "A strong crown" : s >= 3 ? "A middling crown" : s >= 2 ? "A small state" : "A minnow";
  // (a campaign of two: each chooses, the other's choice shown and not to be had — and the host may take up the one
  //  these two left off)
  if (mp) {
    const them = esc(mp.foe.name || "Your friend"), saved = mp.host && savedMp();
    $("cmpPick").innerHTML = `<div class="cmp-ph"><h2>A campaign with ${them}</h2><p class="sub">${mp.gone ? esc(note) : `Each of you chooses a crown. The years turn when you're both ready; march on each other, or make common cause.${mp.mine ? ` <b>You've chosen ${esc(NATIONS[mp.mine].name)}.</b>` : ""} ${mp.theirs ? `${them} has chosen ${esc(NATIONS[mp.theirs].name)}.` : `${them} is choosing…`}`}</p></div>
      ${saved ? `<div class="pv-acts"><button class="btn primary" data-mpresume="1">Take up your campaign with ${esc(saved.partnerName || them)} (${esc(NATIONS[saved.C.mp.humans[0]].name)} and ${esc(NATIONS[saved.C.mp.humans[1]].name)}, ${saved.C.year})</button></div>` : ""}
      <div class="cmp-crowns">${list.map(x => `<button class="cmp-crown${mp.mine === x.id ? " on" : ""}${mp.theirs === x.id ? " taken" : ""}" data-crown="${x.id}"${mp.theirs === x.id ? " disabled" : ""}><i style="background:${NATIONS[x.id].color}"></i><b>${esc(NATIONS[x.id].name)}</b><small>${mp.theirs === x.id ? `${them}'s` : `${word(x.s)} · ${x.n} town${x.n > 1 ? "s" : ""} · ${"★".repeat(x.s)}`}</small></button>`).join("")}</div>
      <div class="pv-acts"><button class="btn ghost" id="cmpPickBack">Leave</button></div>`;
    $("cmpPickBack").onclick = () => { leaveMp(); ctx.screen("pvp"); };
    return;
  }
  const have = campaigns();
  $("cmpPick").innerHTML = `${have.length ? `<div class="cmp-ph"><h2>Your campaigns</h2></div><div class="cmp-saves">${have.map(({ i, c }) => `<div class="cmp-save${C && i === slot ? " on" : ""}"><button class="cmp-crown" data-slot="${i}"><i style="background:${NATIONS[c.me].color}"></i><b>${esc(NATIONS[c.me].name)}</b><small>${c.year} · ${c.towns != null ? `${c.towns} town${c.towns === 1 ? "" : "s"} · ` : ""}${c.over === "lost" ? "lost" : c.won ? "Europe won" : `${c.gold} thalers`}</small></button><button class="cmp-drop" data-drop="${i}" title="Give up this campaign">×</button></div>`).join("")}</div>` : ""}
    <div class="cmp-ph"><h2>${have.length ? "Or begin a new one" : "Choose your crown"}</h2><p class="sub">Europe in 1683. Raise armies, make friends and enemies, take towns and hold them. The great powers have the most to lose; the small states the most to win.${have.length >= SLOTS ? ` <b>You have ${SLOTS} campaigns: a new one takes the place of the one longest left alone.</b>` : ""}</p></div>
    <div class="cmp-crowns">${list.map(x => `<button class="cmp-crown" data-crown="${x.id}"><i style="background:${NATIONS[x.id].color}"></i><b>${esc(NATIONS[x.id].name)}</b><small>${word(x.s)} · ${x.n} town${x.n > 1 ? "s" : ""} · ${"★".repeat(x.s)}</small></button>`).join("")}</div>
    <div class="pv-acts"><button class="btn ghost" id="cmpPickBack">${C ? "Back to your campaign" : "Back"}</button></div>`;
  $("cmpPickBack").onclick = () => { if (C) drawMap(true); else ctx.screen("pvp"); };
}
// the marks over the towns, for the land seen close: your own ringed, the other player's dashed, the ones you can
// march on with crossed swords
function marks3d() {
  const g = grid(), threat = new Set(C.events.filter(e => e.kind === "attack" && !e.done).map(e => e.ct)), out = [];
  for (const ct of CITIES) {
    const own = cityOwner(g, ct); if (!own) continue;
    const at = { name: ct[0], lon: ct[1], lat: ct[2] };
    if (own === C.me) { out.push({ ...at, kind: "ring", color: threat.has(ct[0]) ? "#c0281a" : NATIONS[C.me].color }); if (threat.has(ct[0])) out.push({ ...at, kind: "swords", color: "#c0281a" }); }
    else { if (isHuman(own)) out.push({ ...at, kind: "dash", color: NATIONS[own].color }); if (atWar(own) && inMarch(ct)) out.push({ ...at, kind: "swords", color: "#b0281a", dim: !!C.moved }); }
  }
  // (the armies, standing on the land: a colour on its staff and the regiments' count)
  const flag = (p, id, n, mine) => { const [lon, lat] = llOf(p.x, p.y); out.push({ name: "army-" + id, lon, lat, kind: "army", color: NATIONS[id].color, n, mine: !!mine }); };
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !isHuman(id) && alive(g, id)) { const fp = foeArmyPos(id); if (fp) flag(fp, id, foeArmy(id), false); }
  flag(armyPos(), C.me, C.army, true);
  return out;
}
function paint() {
  const cv = $("cmpMap"); if (!cv || !C) return; W0();
  if (on3d && eu3d) { eu3d.setMap(E(), 2, null); eu3d.marks(marks3d()); if (!raf3d) loop3d(); return; }
  const g = drawEurope(cv, E(), { hover: hov || C.me, selected: sel, city: selCity, hoverCity: hovCity, view, home: false, sharp: () => { if (shown() && !on3d) paint(); } });
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
    // (a walled town: a little bastioned outline round it, as the engravers drew a fortress)
    if (C.walls && C.walls[ct[0]]) { const r = (11 + ct[3] * 1.5) * k; c.save(); c.strokeStyle = "rgba(40,28,16,0.85)"; c.lineWidth = 1.4 * k; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.78 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.stroke(); c.restore(); }
    if (own2 === C.me) {
      c.strokeStyle = threat.has(ct[0]) ? "#c0281a" : NATIONS[C.me].color; c.beginPath(); c.arc(x, y, (7 + ct[3] * 1.5) * k, 0, 7); c.stroke();
      c.strokeStyle = "rgba(40,28,16,0.8)"; c.lineWidth = 1 * k; c.beginPath(); c.arc(x, y, (8.6 + ct[3] * 1.5) * k, 0, 7); c.stroke(); c.lineWidth = 2.2 * k;
      if (threat.has(ct[0])) swords(x, y - 17 * k, 5 * k, "#c0281a");
    } else if (isHuman(own2)) {
      c.save(); c.setLineDash([4 * k, 3 * k]); c.strokeStyle = NATIONS[own2].color; c.beginPath(); c.arc(x, y, (7 + ct[3] * 1.5) * k, 0, 7); c.stroke(); c.restore();
      if (atWar(own2) && inMarch(ct)) swords(x, y - 14 * k, 4.5 * k, C.moved ? "rgba(120,40,30,0.45)" : "#b0281a");
    } else if (atWar(own2) && inMarch(ct)) {
      swords(x, y - 14 * k, 4.5 * k, C.moved ? "rgba(120,40,30,0.45)" : "#b0281a");
    }
  }
  // ---- the armies: a regiment's block under its colour, how many regiments, and where it's marching ----
  const scr = p => [(p.x * S - view.ox) * view.z, (p.y * S - view.oy) * view.z];
  const army = (p, id, n, mine, go) => {
    const [x, y] = scr(p); if (x < -60 || y < -60 || x > cv.width + 60 || y > cv.height + 60) return;
    const col = NATIONS[id].color, u = armyU(k);
    if (go) {
      // (the road it's on: dashed to where it's going, an arrowhead there)
      const [gx, gy] = scr(go), a = Math.atan2(gy - y, gx - x);
      c.save(); c.strokeStyle = mine ? "rgba(40,28,16,0.85)" : "rgba(150,30,20,0.9)"; c.lineWidth = 2.2 * u; c.setLineDash([7 * u, 5 * u]);
      c.beginPath(); c.moveTo(x, y); c.lineTo(gx, gy); c.stroke(); c.setLineDash([]);
      c.fillStyle = c.strokeStyle; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - Math.cos(a - 0.45) * 11 * u, gy - Math.sin(a - 0.45) * 11 * u); c.lineTo(gx - Math.cos(a + 0.45) * 11 * u, gy - Math.sin(a + 0.45) * 11 * u); c.fill(); c.restore();
    }
    c.save(); c.translate(x, y);
    // (drawn as the engravers of the day drew an army in the field, flat on the paper: its battalions in two lines
    //  in its colour, horse on the wings, the front turned the way it marches — and the count of regiments in
    //  small italic under it, haloed against the map, no flag or box to cover the country it's in)
    const face = go ? (() => { const [gx, gy] = scr(go); return Math.atan2(gy - y, gx - x) + Math.PI / 2; })() : 0;
    c.save(); c.rotate(face);
    c.fillStyle = "rgba(244,234,210,0.55)"; c.beginPath(); c.ellipse(0, 0, 15 * u, 6.5 * u, 0, 0, 7); c.fill(); c.fillStyle = "rgba(30,20,10,0.16)"; c.beginPath(); c.ellipse(0.8 * u, 1.6 * u, 13 * u, 5 * u, 0, 0, 7); c.fill();
    const ink = mine ? "#2a1c10" : "#7a2216";
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      const bx = (-8.6 + i * 4.6 + r * 1.1) * u, by = (-3.2 + r * 3.6) * u;
      c.globalAlpha = r ? 0.78 : 1; c.fillStyle = col; c.fillRect(bx, by, 3.6 * u, 2.2 * u);
      c.globalAlpha = 1; c.strokeStyle = ink; c.lineWidth = 0.9 * u; c.strokeRect(bx, by, 3.6 * u, 2.2 * u);
    }
    for (const sx of [-1, 1]) { c.fillStyle = col; c.strokeStyle = ink; c.beginPath(); const hx = sx * 12.2 * u, hy = -1.2 * u; c.moveTo(hx, hy - 2 * u); c.lineTo(hx + 1.8 * u, hy); c.lineTo(hx, hy + 2 * u); c.lineTo(hx - 1.8 * u, hy); c.closePath(); c.fill(); c.stroke(); }
    // (the front: a fine rule before the first line)
    c.strokeStyle = ink; c.lineWidth = 0.9 * u; c.beginPath(); c.moveTo(-9.2 * u, -4.4 * u); c.lineTo(8.4 * u, -4.4 * u); c.stroke();
    c.restore();
    if (mine && armySel) { c.save(); c.strokeStyle = "#c89a30"; c.lineWidth = 1.6 * u; c.setLineDash([3 * u, 2.4 * u]); c.beginPath(); c.ellipse(0, 0, 16 * u, 9 * u, face, 0, 7); c.stroke(); c.restore(); }
    const t = String(n); c.font = `italic bold ${Math.round(9.5 * u)}px ${'"IM Fell English", Georgia, serif'}`; c.textAlign = "center"; c.textBaseline = "top";
    c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 3 * u; c.strokeText(t, 0, 7 * u); c.fillStyle = ink; c.fillText(t, 0, 7 * u);
    c.restore();
  };
  // (the other crowns at war with you, and their marches on your towns; the other player's; then yours, on top)
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !isHuman(id) && alive(g, id)) { const fp = foeArmyPos(id); if (fp) { const tg = C.foeGo && C.foeGo[id] && CITIES.find(t => t[0] === C.foeGo[id]); army(fp, id, foeArmy(id), false, tg ? cellXY(tg) : null); } }
  if (C.mp) for (const h of humans()) if (h !== C.me) { const sl = sliceOf(h); if (sl && sl.pos) army(sl.pos, h, sl.army | 0, false, null); }
  army(armyPos(), C.me, C.army, true, C.go || null);
  c.restore();
}
let armySel = false;
const armyU = k => k * Math.min(2.7, 1.45 + view.z / ZF() * 0.26);
// (your army under the pointer: within a little of its block on the map)
function armyHit(cv, px, py) { if (!C) return false; const S = cv.width / MG_W, p = armyPos(), x = (p.x * S - view.ox) * view.z, y = (p.y * S - view.oy) * view.z; const u = armyU(cv.width / 1300); return Math.hypot(px - x, py - y - 3 * u) < 16 * u; }
function drawMap(fit = false) {
  $("cmpPick").classList.add("hidden"); $("cmpPlay").classList.remove("hidden");
  const cv = $("cmpMap"); W0();
  // (the whole window covered: the map as wide as it, or as tall, whichever covers it — its edges, the sea, past them)
  const cw = Math.max(innerWidth, innerHeight / MAP_ASPECT);
  cv.style.width = Math.round(cw) + "px"; cv.style.height = Math.round(cw * MAP_ASPECT) + "px";
  const W = Math.round(Math.min(2600, Math.max(1200, cw * Math.min(2, devicePixelRatio || 1)))); if (cv.width !== W) { cv.width = W; cv.height = Math.round(W * MAP_ASPECT); }
  // (a fresh look: from above, on the map)
  if (fit && on3d) { on3d = false; clearTimeout(fade3d); eu3d.visible = false; eu3d.el.classList.remove("on"); eu3d.el.style.display = "none"; cv.style.visibility = "visible"; }
  if (fit) {
    // (looking at your own crown, close enough to see its towns)
    // (where your army is — at home, or over the sea — and your towns about it, not the middle of the ocean between
    //  your crown's two halves)
    const g = grid(), ap = armyPos(), mine = citiesOfNow(g, C.me).map(cellOf).filter(([x, y]) => Math.hypot(x - ap.x, y - ap.y) < 90);
    if (!mine.length) mine.push([ap.x, ap.y]);
    if (mine.length) { const S = cv.width / MG_W, cx = mine.reduce((t, p) => t + p[0], 0) / mine.length * S, cy = mine.reduce((t, p) => t + p[1], 0) / mine.length * S; view.z = 2.2 * ZF(); view.ox = clamp(cx - cv.width / view.z / 2, 0, cv.width - cv.width / view.z); view.oy = clamp(cy - cv.height / view.z / 2, 0, cv.height - cv.height / view.z); }
  }
  paint(); drawTop(); drawSide();
}
function drawTop() {
  const g = grid(), n = citiesOfNow(g, C.me).length, net = income(g) - upkeep(), wars = Object.keys(C.E.war).filter(id => C.E.war[id]);
  $("cmpTop").innerHTML = `<span class="cmp-crownname"><i style="background:${NATIONS[C.me].color}"></i>${esc(NATIONS[C.me].name)}</span>
    <span><small>Year</small><b>${C.year}</b></span><span><small>Treasury</small><b>${C.gold}</b> <em class="${net >= 0 ? "up" : "down"}">${net >= 0 ? "+" : ""}${net}</em></span>
    <span><small>Army</small><b>${C.army}</b> regiments</span><span><small>Towns</small><b>${n}</b> of ${WIN_CITIES}</span><span><small>At war with</small><b>${wars.length ? wars.map(id => esc(NATIONS[id].name)).join(", ") : "nobody"}</b></span>${C.mp ? (() => { const o = humans().find(h => h !== C.me), ready = C.mp.ready[o]; return `<span class="cmp-mate"><small>${esc(nameOf(o))}</small><b><i style="background:${NATIONS[o].color}"></i>${esc(NATIONS[o].name)}</b><em class="${ready ? "up" : ""}">${mp && mp.gone ? "has left" : ready ? "ready to end the year" : "playing their year"}</em></span>`; })() : ""}`;
  const open = C.events.filter(e => !e.done).length, mine = C.mp && C.mp.ready[C.me], other = C.mp && humans().find(h => h !== C.me);
  $("cmpEnd").disabled = !!C.over || open > 0 || !!(mp && mp.gone); $("cmpEnd").textContent = C.over ? "The campaign is over" : open ? "Answer what's waiting first" : mine ? `Waiting for ${nameOf(other)}…` : "End the year";
  $("cmpEnd").classList.toggle("waiting", !!mine); $("cmpNew").classList.toggle("hidden", !!C.mp);
}
// ---- the men: a portrait (or, until one's painted, an engraved name), and their stats in pips ----
function face(m, cls = "") {
  const p = portOf(m), ini = (m.short || m.name).split(/\s+/).map(w => w[0]).join("").slice(0, 2);
  return p ? `<img class="cmp-face ${cls}" src="${p}" alt="" loading="lazy">` : `<span class="cmp-face none ${cls}">${esc(ini)}</span>`;
}
function statsOf(m) {
  return `<span class="cmp-stats">${(m.role === "general" ? GSTATS : VSTATS).map((s2, i) => `<span class="${s2 === "Corruption" ? "bad" : ""}"><small>${s2}</small><i>${"●".repeat(m.st[i])}${"○".repeat(5 - m.st[i])}</i></span>`).join("")}</span>`;
}
function manCard(m, extra = "") {
  return `<div class="cmp-man">${face(m)}<div><b>${esc(m.name)}</b>${m.hist ? `<em class="cmp-hist">Historical</em>` : ""}<small>${esc(m.d)}</small>${statsOf(m)}<small class="cmp-yrs">${m.served | 0} of ${lifeOf(m)} years' service</small>${extra}</div></div>`;
}
function candidates(list, attr, fee = null) {
  return `<div class="cmp-cands">${list.map((m, i) => { const f = fee ? fee(m) : 0; return `<div class="cmp-cand">${face(m)}<b>${esc(m.name)}</b><small>${esc(m.d)}</small>${statsOf(m)}<button class="btn" ${attr}="${i}"${f > C.gold ? " disabled" : ""}>Appoint${f ? ` · ${f}` : ""}</button></div>`; }).join("")}</div>`;
}
// (a governor's place is bought, as offices were: the bigger the town and the better the man, the dearer — an honest,
//  able one costs most; a corrupt one comes cheap, and makes it back out of the town)
const govFee = (m, ct) => Math.max(30, 40 + ct[3] * 35 + (m.st[1] + m.st[2] - m.st[0]) * 15);
// your own town: its worth and garrison, its governor, and its buildings a chain at a time — one piece of work a year
function townCard(g, ct) {
  const n = ct[0], q = C.Q && C.Q[n], v = govOf(n), last = citiesOfNow(g, C.me).length === 1, wl = lvOf(n, "walls");
  let h = `<p>Yours. Garrison ${garrison(ct)}; worth ${worth(ct)} thalers a year. ${wl ? CHAINS.walls.levels[wl].n + "." : last ? "No walls, but it's your last town: its people will hold it to the end." : "No walls."}</p>`;
  h += v ? manCard(v, `<label class="cmp-rule"><input type="checkbox" data-rule="${esc(n)}"${C.rule && C.rule[n] ? " checked" : ""}> Let him rule: he puts the town's works in hand himself</label>`)
    : C.govCands && C.govCands[n] ? `<div class="cmp-subh">Choose a governor for ${esc(n)}</div>${candidates(C.govCands[n], "data-gov", m => govFee(m, ct))}`
    : `<div class="cmp-nogov"><span>No governor: a clerk keeps the books, and some of the money goes missing.</span><button class="btn" data-act="govs">Appoint a governor</button></div>`;
  h += `<div class="cmp-subh">Buildings${q ? "" : " · one piece of work a year, finished at the year's end"}</div><div class="cmp-blds">`;
  const opts = new Map(buildable(ct).map(o => [o.chain, o]));
  for (const ch of CHAIN_ORDER) {
    const lv = lvOf(n, ch), cap = capOf(ch, ct[3]), o = opts.get(ch), here = q && q.chain === ch;
    if (ch === "foundry" && ct[3] < 2) continue;
    h += `<div class="cmp-bld${here ? " busy" : ""}"><span class="cmp-bi">${MARK[ch]}</span><span class="cmp-bn"><b>${esc(CHAINS[ch].levels[lv].n)}</b><small>${esc(CHAINS[ch].name)} · ${"▰".repeat(lv)}${"▱".repeat(cap - lv)}</small></span>`;
    if (here) h += `<span class="cmp-bq">Building ${esc(CHAINS[ch].levels[lv + 1].n)}<button class="tm-lnk" data-unbuild="1">Stop</button></span>`;
    else if (o) h += o.tech ? `<span class="cmp-bq lock" title="${esc(o.L.d)}">${esc(o.L.n)}: needs ${esc(TECHS[o.tech].n)}</span>` : `<button class="btn" data-build="${ch}" title="${esc(o.L.d)}"${q || C.gold < o.cost ? " disabled" : ""}>${esc(o.L.n)} · ${o.cost}</button>`;
    h += `</div>`;
  }
  if (lvOf(n, "foundry")) h += `<div class="cmp-bld${q && q.gun ? " busy" : ""}"><span class="cmp-bi">${MARK.gun}</span><span class="cmp-bn"><b>Cast a gun</b><small>For your artillery train: ${C.guns} now</small></span>${q && q.gun ? `<span class="cmp-bq">Casting<button class="tm-lnk" data-unbuild="1">Stop</button></span>` : `<button class="btn" data-gun="1"${q || C.gold < GUN_COST ? " disabled" : ""}>Cast · ${GUN_COST}</button>`}</div>`;
  return h + `</div>`;
}
// learning: the four branches, what's known, what's being studied, what can be
function drawTech() {
  let el = $("cmpTech"); if (!el) { el = document.createElement("div"); el.id = "cmpTech"; el.className = "cmp-must"; $("campaign").appendChild(el); el.onclick = e => { const b = e.target.closest("[data-study],[data-techx]"); if (!b) { if (e.target === el) el.remove(); return; } if (b.dataset.techx) { el.remove(); return; } doAct({ k: "study", id: b.dataset.study }); drawTech(); }; }
  const T = C.tech, rp = research(grid());
  el.innerHTML = `<div class="cmp-mbox cmp-techbox"><h2>Learning</h2><p class="sub">${T.cur ? `Your scholars study <b>${esc(TECHS[T.cur].n)}</b>: ${T.pts} of ${TECHS[T.cur].cost}, about ${Math.max(1, Math.ceil((TECHS[T.cur].cost - T.pts) / rp))} more year${Math.ceil((TECHS[T.cur].cost - T.pts) / rp) > 1 ? "s" : ""}.` : "Choose what your scholars study next."} ${rp} a year from your schools and colleges.</p>
    <div class="cmp-tree">${BRANCHES.map(([br, nm]) => `<div class="cmp-br"><div class="cmp-brh">${nm}</div>${Object.entries(TECHS).filter(([, t]) => t.br === br).map(([id, t]) => { const done = T.done[id], can = canStudy(T.done, id), cur = T.cur === id;
      return `<button class="cmp-tech${done ? " done" : cur ? " cur" : can ? " can" : " lock"}" data-study="${id}"${done || !can ? " disabled" : ""}><b>${esc(t.n)}</b><small>${esc(t.d)}</small><em>${done ? "Known" : cur ? `Studying · ${T.pts}/${t.cost}` : can ? `${t.cost} to learn` : `After ${(t.req || []).map(r => TECHS[r].n).join(", ")}`}</em></button>`; }).join("")}</div>`).join("")}</div>
    <div class="pv-acts"><button class="btn" data-techx="1">Close</button></div></div>`;
}
// ---- the side panel's cards folded down to a line when you don't need them (kept as you leave them) ----
const FOLDKEY = "reckoning.campaign.folds";
let folds = (() => { try { return JSON.parse(localStorage.getItem(FOLDKEY)) || {}; } catch (e) { return {}; } })();
const fold = (key, head, body, open0 = false) => `<details class="cmp-card cmp-fold" data-fold="${key}"${(folds[key] ?? open0) ? " open" : ""}><summary>${head}</summary>${body}</details>`;
function drawSide() {
  const g = grid(), el = $("cmpSide"), r = C.E.rel;
  let h = "";
  if (C.over) h += `<div class="cmp-over"><b>Your crown is lost.</b> Every town has fallen. <button class="btn" data-act="newgame">Begin again</button></div>`;
  else if (C.won) h += `<div class="cmp-won"><b>Europe is yours.</b> ${citiesOfNow(g, C.me).length} towns under your crown.</div>`;
  // what's waiting for your word: towns attacked, peace offered
  for (const [i, e] of C.events.entries()) {
    if (e.done) continue;
    if (e.kind === "appoint") { h += `<div class="cmp-ev"><b>Choose a general for your army</b><small>One of three men put forward. He serves fifty years, if the enemy doesn't end it first.</small>${candidates(e.cands, `data-ev="${i}" data-appg`)}</div>`; continue; }
    if (e.kind === "attack" && e.human) { h += `<div class="cmp-ev war"><b>${esc(nameOf(e.foe))} marches on ${esc(e.ct)}!</b><small>${e.att} regiments of ${esc(NATIONS[e.foe].name)} against your ${e.def} (garrison and army)${e.walls ? " · behind its walls" : ""}. Meet them on the field yourself, the two of you in one battle, or leave it to the garrison and let them fight it.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Meet them on the field</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to the garrison</button></span></div>`; continue; }
    if (e.kind === "ally" || e.kind === "pact" || (e.kind === "peace" && e.human)) { h += `<div class="cmp-ev"><b>${esc(nameOf(e.foe))} proposes ${e.kind === "peace" ? "peace" : e.kind === "ally" ? "an alliance" : "a trade pact"}</b><small>${e.kind === "peace" ? "Each side keeps what it holds." : e.kind === "ally" ? "Their wars yours, and yours theirs." : "Their merchants in your towns, and yours in theirs."}</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Agree</button><button class="btn" data-ev="${i}" data-how="no">Decline</button></span></div>`; continue; }
    if (e.kind === "attack") h += `<div class="cmp-ev war"><b>${esc(NATIONS[e.foe].name)} marches on ${esc(e.ct)}!</b><small>${e.att} regiments against your ${e.def} (garrison and army)${e.walls ? " · behind its walls" : ""}. Your odds: ${Math.round((1 - odds(e.att, e.def, e.walls)) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Fight it yourself</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to the garrison</button></span></div>`;
    if (e.kind === "peace") h += `<div class="cmp-ev"><b>${esc(NATIONS[e.foe].name)} offers peace</b><small>${e.gold ? `And ${e.gold} thalers to have it.` : "Each side keeps what it holds."}</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Make peace</button><button class="btn" data-ev="${i}" data-how="no">Fight on</button></span></div>`;
  }
  if (note) h += `<div class="cmp-note">${esc(note)}</div>`;
  if (news.length) h += `<div class="cmp-news"><b>The year's news</b>${news.slice(0, 8).map(l => `<div>${esc(l.title)}${l.sub ? ` <span>${esc(l.sub)}</span>` : ""}</div>`).join("")}<button class="tm-lnk" data-act="news">Close</button></div>`;
  // the town or the crown chosen on the map
  if (selCity) {
    const own2 = cityOwner(g, selCity), mineT = own2 === C.me, reach = !mineT && own2 && inMarch(selCity), can = !mineT && own2 && atWar(own2) && reach && !C.moved && C.army >= 5;
    const S = siegeOf(selCity), def = own2 && !mineT ? defOf(g, selCity, own2) : 0, walls = own2 ? hasWalls(selCity, own2, g) : false, open = walls && S && S.bat >= 1;
    const pp = own2 ? null : (() => { const [x, y] = cellOf(selCity); for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const v = g[y + dy] && g[y + dy][x + dx]; if (PEOPLES[v]) return v; } return null; })();
    h += `<div class="cmp-card"><div class="cmp-h"><b>${esc(selCity[0])}</b><small>${["", "A town", "A city", "A great city"][selCity[3]]} · ${own2 ? esc(NATIONS[own2].name) : pp ? esc(PEOPLES[pp].name) : "nobody's"}</small></div>
      ${pp ? `<p>A town of ${esc(PEOPLES[pp].long)}, in their own country. It isn't any crown's to take.</p>` : ""}
      ${mineT ? townCard(g, selCity) : own2 ? `<p>Held by ${garrison(selCity)} men of the garrison, and ${the(own2)} can bring some ${Math.round(foeArmy(own2) * (isHuman(own2) ? 0.7 : 0.65))} regiments to it${walls ? ", behind walls" : ""}. ${!reach ? `${overSea(armyPos(), cellXY(selCity)) ? "Your army is on the other side of the Atlantic: a year at sea." : `Your army is ${yearsTo(cellXY(selCity)) > 1 ? `${yearsTo(cellXY(selCity))} years'` : "a year's"} march away.`}` : !atWar(own2) ? `You're not at war with ${the(own2)}.` : C.moved ? "Your army has already marched this season." : `Your odds: ${Math.round(odds(C.army * cmdMul(C.gen) * moraleK(), def, walls && !open) * 100)}%.`}</p>` : ""}
      ${S ? `<div class="cmp-siege"><b>Under siege · year ${S.years}</b><span>Garrison ${S.starve >= 0.6 ? "starving" : S.starve >= 0.3 ? "on short rations" : "well fed"} (${Math.round(garrison(selCity) * (1 - S.starve))} of ${garrison(selCity)} men fit) · walls ${S.bat >= 1 ? "breached" : `${Math.round(S.bat * 100)}% battered`}</span><i><u style="width:${Math.min(100, Math.round(S.bat * 100))}%"></u></i>${!C.supplied && C.gold >= SUPPLY_COST ? `<div class="cmp-acts"><button class="btn" data-act="supply" title="Fresh men, powder and bread for the siege lines — if they get through the enemy's raiders">Send supplies · ${SUPPLY_COST} · you escort</button><button class="btn ghost" data-act="supplyauto">Supplies · escort alone</button></div>` : C.supplied ? `<small class="cmp-fine">This year's supply train has gone.</small>` : ""}</div>` : ""}
      ${can && S ? `<div class="cmp-acts"><button class="btn primary" data-act="fight">Storm · you lead</button><button class="btn" data-act="auto">Storm · generals lead</button><button class="btn ghost" data-act="lift">Lift the siege</button></div>` : can && !C.siege ? `<div class="cmp-acts"><button class="btn primary" data-act="fight">Attack · you lead</button><button class="btn" data-act="auto">Attack · generals lead</button>${walls && !isHuman(own2) && C.army >= 8 ? `<button class="btn" data-act="siege" title="Starve it out and batter its walls, a year at a time">Lay siege</button>` : ""}</div>` : C.siege && !S && !mineT && own2 ? `<p class="cmp-fine">Your army is besieging ${esc(C.siege.ct)}: lift that siege to march here.</p>` : !C.siege && !C.moved && (mineT || (own2 && !reach)) && dist2(armyPos(), cellXY(selCity)) > 1 ? `<div class="cmp-acts"><button class="btn" data-act="goto">${overSea(armyPos(), cellXY(selCity)) ? `Ship your army here · 1 yr · ${VOYAGE} thalers` : `${mineT ? "Move your army here" : "March toward it"} · ${yearsTo(cellXY(selCity))} yr`}</button></div>` : S && C.moved ? `<div class="cmp-acts"><button class="btn ghost" data-act="lift">Lift the siege</button></div>` : ""}</div>`;
  }
  const id = selCity ? cityOwner(g, selCity) : sel;
  if (id && isHuman(id) && id !== C.me) {
    const did = C.did[id] || {}, war = atWar(id), tr = C.truce[id] || 0;
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[id].color}"></i><b>${esc(NATIONS[id].name)}</b><small>${esc(nameOf(id))}'s crown · ${citiesOfNow(g, id).length} town${citiesOfNow(g, id).length === 1 ? "" : "s"} · army ${foeArmy(id)} · ${war ? "<em class='down'>at war with you</em>" : C.ally[id] ? "your ally" : C.E.pact[id] ? "trade pact" : "at peace"}</small></div>
      <div class="cmp-acts">${war ? `<button class="btn" data-dip="peace" ${did.peace ? "disabled" : ""}>Propose peace</button>` : `
        <button class="btn" data-dip="gift" ${did.gift || C.gold < 150 ? "disabled" : ""}>Send 150 thalers</button>
        ${C.E.pact[id] ? `<button class="btn" data-dip="unpact">End the trade pact</button>` : `<button class="btn" data-dip="pact" ${did.pact ? "disabled" : ""}>Propose a trade pact</button>`}
        ${C.ally[id] ? `<button class="btn" data-dip="unally">Break the alliance</button>` : `<button class="btn" data-dip="ally" ${did.ally ? "disabled" : ""}>Propose an alliance</button>`}
        <button class="btn danger" data-dip="war" ${tr ? `disabled title="A treaty: ${tr} more years"` : ""}>Declare war</button>`}</div></div>`;
  } else if (id && id !== C.me && NATIONS[id]) {
    const did = C.did[id] || {}, war = atWar(id), tr = C.truce[id] || 0;
    const head = `<span class="cmp-h"><i style="background:${NATIONS[id].color}"></i><b>${esc(NATIONS[id].name)}</b><small>${citiesOfNow(g, id).length} town${citiesOfNow(g, id).length === 1 ? "" : "s"} · army ${C.foes[id] || 0} · ${war ? "<em class='down'>at war with you</em>" : C.ally[id] ? "your ally" : C.E.pact[id] ? "trade pact" : relWord(r[id])}</small></span>`;
    h += (selCity ? (b2 => fold("crown", head, b2)) : (b2 => `<div class="cmp-card">${head}${b2}</div>`))(`
      <div class="cmp-rel"><i style="left:${(r[id] + 100) / 2}%"></i><span>Their view of you: ${r[id] > 0 ? "+" : ""}${Math.round(r[id])}</span></div>
      ${NATIONS[id].nw ? `<p class="cmp-help">A nation of the woods. Their towns stand behind wooden palisades, with no stone walls to besiege; a palisade can be set alight and burnt through. Their warriors fight with the bow and the war club, a few with trade muskets. They have no guns and no horse.</p>` : ""}
      ${C.foeGen && C.foeGen[id] ? `<div class="cmp-foegen">${face(C.foeGen[id], "sm")}<span><b>${esc(C.foeGen[id].name)}</b><small>Their general · command ${"●".repeat(C.foeGen[id].st[0])}${"○".repeat(5 - C.foeGen[id].st[0])} · ${(C.fguns[id] | 0) ? `${C.fguns[id]} gun${C.fguns[id] > 1 ? "s" : ""}: they can besiege walled towns` : "no guns: walled towns are safe from them"}</small></span></div>` : ""}
      <div class="cmp-acts">${war ? `<button class="btn" data-dip="peace" ${did.peace ? "disabled" : ""}>Offer peace</button>` : `
        <button class="btn" data-dip="envoy" ${did.envoy || C.gold < 40 ? "disabled" : ""}>Send an envoy · 40</button>
        <button class="btn" data-dip="gift" ${did.gift || C.gold < 150 ? "disabled" : ""}>A gift · 150</button>
        ${C.E.pact[id] ? `<button class="btn" data-dip="unpact">End the trade pact</button>` : `<button class="btn" data-dip="pact" ${r[id] < 20 ? "disabled title='They need to think well of you (20)'" : ""}>Trade pact</button>`}
        ${C.ally[id] ? `<button class="btn" data-dip="unally">Break the alliance</button>` : `<button class="btn" data-dip="ally" ${r[id] < 55 || did.ally ? "disabled title='They need to be friendly (55)'" : ""}>Propose an alliance</button>`}
        <button class="btn danger" data-dip="war" ${tr ? `disabled title="A treaty: ${tr} more years"` : ""}>Declare war</button>`}</div>`);
  } else if (!selCity && !armySel) h += `<div class="cmp-card cmp-help"><p><b>Click</b> a town or a crown · <b>click your army</b>, then <b>right-click</b> to march · <b>drag</b> or WASD to move · <b>wheel</b> to zoom</p></div>`;
  // your own: the treasury's use
  const rc = regCost(g);
  h += fold("army", `<span class="cmp-h"><b>Your army</b><small>${C.army} regiments${C.levyQ ? ` (+${C.levyQ})` : ""} · ${C.guns} gun${C.guns === 1 ? "" : "s"} · ${moraleWord(C.morale ?? 50).toLowerCase()} · ${C.siege ? `besieging ${esc(C.siege.ct)}` : C.go ? "on the march" : C.moved ? "marched this year" : "ready"}</small></span>`, `
    <div class="cmp-morale"><small>Morale</small><b>${moraleWord(C.morale ?? 50)}</b><i><u style="width:${C.morale ?? 50}%"></u></i><small>${C.morale ?? 50}</small></div>
    ${C.gen ? manCard(C.gen) : `<p class="cmp-fine">No general leads it: choose one.</p>`}
    <div class="cmp-acts"><button class="btn" data-act="r1" ${C.gold < rc ? "disabled" : ""}>Raise a regiment · ${rc}</button><button class="btn" data-act="r5" ${C.gold < rc * 5 ? "disabled" : ""}>Raise five · ${rc * 5}</button></div>
    <small class="cmp-fine">New regiments join next year · upkeep ${upkeep()} a year</small>`, armySel);
  // (the news: the last few lines; the rest folded away)
  const L = C.log.slice(0, 14), line = l => `<div><small>${esc(l.t)}</small><b>${esc(l.title)}</b>${l.sub ? ` <span>${esc(l.sub)}</span>` : ""}</div>`;
  h += `<div class="cmp-log">${L.slice(0, 4).map(line).join("")}${L.length > 4 ? `<details class="cmp-more" data-fold="log"${folds.log ? " open" : ""}><summary>Earlier</summary>${L.slice(4).map(line).join("")}</details>` : ""}</div>`;
  el.innerHTML = h;
  for (const d of el.querySelectorAll("details[data-fold]")) d.addEventListener("toggle", () => { folds[d.dataset.fold] = d.open; try { localStorage.setItem(FOLDKEY, JSON.stringify(folds)); } catch (e) {} });
}
function sideClick(e) {
  const b = e.target.closest("button"); if (!b || !C) return;
  window.__uisfx && window.__uisfx.click && window.__uisfx.click();
  if (mp && mp.gone && !b.dataset.act) return;
  if (b.dataset.appg != null && b.dataset.ev != null) { doAct({ k: "appoint", role: "general", ev: +b.dataset.ev, i: +b.dataset.appg }); return; }
  if (b.dataset.ev != null) { doAct({ k: "ev", i: +b.dataset.ev, how: b.dataset.how }); return; }
  if (b.dataset.build && selCity) { doAct({ k: "build", ct: selCity[0], chain: b.dataset.build }); return; }
  if (b.dataset.gun && selCity) { doAct({ k: "build", ct: selCity[0], gun: true }); return; }
  if (b.dataset.unbuild && selCity) { doAct({ k: "unbuild", ct: selCity[0] }); return; }
  if (b.dataset.gov != null && selCity) { doAct({ k: "appoint", role: "governor", town: selCity[0], i: +b.dataset.gov }); return; }
  const a = b.dataset.act;
  if (a === "fight" || a === "auto") { if (selCity) doAct({ k: "march", ct: selCity[0], how: a }); return; }
  if (a === "siege") { if (selCity) doAct({ k: "siege", ct: selCity[0] }); return; }
  if (a === "lift") { doAct({ k: "lift" }); return; }
  if (a === "goto") { if (selCity) { const t = cellXY(selCity); doAct({ k: "move", x: t.x, y: t.y }); } return; }
  if (a === "supply" || a === "supplyauto") { doAct({ k: "supply", how: a === "supply" ? "fight" : "auto" }); return; }
  if (a === "govs") { if (selCity) doAct({ k: "govs", ct: selCity[0] }); return; }
  if (a === "news") { news = []; drawMap(); return; }
  if (a === "r1" || a === "r5") { doAct({ k: "recruit", n: a === "r1" ? 1 : 5 }); return; }
  if (a === "newgame") { if (mp) return; drawPick(); return; }
  if (a === "resume") { if (mp && mp.host) resumeMp(); return; }
  if (b.dataset.dip) { const id = selCity ? cityOwner(grid(), selCity) : sel; doAct({ k: "dip", id, w: b.dataset.dip }); return; }
  drawMap();
}
// (after a battle fought by hand: straight back to the map)
export const campaignOn = () => !!C;
// (for the tests: the campaign's own doings, from the console)
window.__setView = v => { view = v; paint(); };
window.__cmp = { get C() { return C; }, doAct: a => doAct(a), get view() { return { ...view, on3d, dist: eu3d && eu3d.dist }; }, dist: distFrom, endSeason, diplo, march, auto, settle, grid, citiesOfNow, draw: () => drawMap(), select: (name) => { selCity = CITIES.find(c => c[0] === name) || null; sel = selCity ? cityOwner(grid(), selCity) : null; drawMap(); } };

// ---------------------------------------------------------------------------
//  what you do on the campaign's map, as an act: done here, playing alone — or, a campaign of two, done on the
//  host's game (the one the campaign lives on), as whichever of you did it, and the outcome sent back
// ---------------------------------------------------------------------------
function doAct(a) {
  if (C && C.mp && mp && !mp.host) { mp.net.send({ t: "cact", a }); return; }
  const r = apply(C.me, a) || {};
  react(r);
  if (C && C.mp) broadcast();
}
// (an act as a crown: what it changes, and what's to be said and heard and done about it on that player's screen)
function apply(actor, a) {
  if (!C || C.over && a.k !== "end") return null;
  return as(actor, () => {
    const g = grid(), city = n => CITIES.find(c => c[0] === n);
    if (a.k === "recruit") { recruit(a.n === 5 ? 5 : 1); return { sfx: [["coin", 0.45], ["drum", 0.3, 250]] }; }
    if (a.k === "dip") {
      if (isHuman(a.id)) return humanDip(actor, a.id, a.w);
      const t = diplo(a.id, a.w); if (!t) return null;
      if (!/^You|refuses|won't/.test(t)) say(t); persist();
      const w = a.w;
      return { note: t, sfx: w === "war" ? [["quill", 0.4], ["drum", 0.6, 600]] : w === "gift" ? [["coin", 0.5]] : w === "envoy" || w === "unpact" || w === "unally" || /refuses|won't/.test(t) ? [["quill", 0.5]] : [["quill", 0.5], ["seal", 0.6, 850]] };
    }
    if (a.k === "siege") {
      const ct = city(a.ct), foe = ct && cityOwner(g, ct);
      if (!ct || C.siege || C.moved || !foe || isHuman(foe) || !atWar(foe) || C.army < 8 || !inMarch(ct) || !hasWalls(ct, foe, g)) return { note: "Your army can't lay siege there now." };
      C.siege = { ct: ct[0], foe, years: 0, starve: 0, bat: 0 }; C.moved = true; C.go = null; { const t = cellXY(ct); C.pos = { x: t.x, y: t.y }; } persist();
      return { note: `Your army sits down before ${ct[0]}: trenches dug, the guns brought up, the roads closed. Each year the garrison grows hungrier and the walls weaker.`, sfx: [["drum", 0.55], ["guns", 0.5, 900]] };
    }
    if (a.k === "supply") {
      const o = sendSupply(); if (!o) return { note: `A supply train costs ${SUPPLY_COST} thalers, and only one goes a year.` };
      if (a.how === "fight") { C.pending = { ...o, ct: o.ct[0] }; persist(); return { sfx: [["drum", 0.5]], fight: { ...o, ct: o.ct[0] } }; }
      convoyEnd(o, R() < odds(o.def * cmdMul(C.gen) * moraleK(), o.att, false), 0.15); persist(); return { note: C.log[0].title + ".", sfx: [["drum", 0.5]] };
    }
    // the army sent somewhere: as far as a year's march takes it now, the rest of the way in the years after
    if (a.k === "move") {
      if (C.siege) return { note: `Your army is sitting down before ${C.siege.ct}: lift the siege first.` };
      if (C.moved) return { note: "Your army has already marched this year." };
      W0(); const t = { x: clamp(+a.x, 0, MG_W - 1), y: clamp(+a.y, 0, MG_H - 1) }; if (!isFinite(t.x) || !isFinite(t.y)) return null;
      // (over the sea: shipping for the regiments, paid for before they sail)
      if (overSea(armyPos(), t)) {
        if (C.gold < VOYAGE) return { note: `Shipping the army over the Atlantic costs ${VOYAGE} thalers. The treasury hasn't got it.` };
        C.gold -= VOYAGE; C.pos = { x: t.x, y: t.y }; C.go = null; C.moved = true; C.sailed = C.year; persist();
        return { note: `The army takes ship for the other side of the Atlantic: ${VOYAGE} thalers for the shipping. It lands where you sent it, and can march again next year.`, sfx: [["bell", 0.4]] };
      }
      const st = stepToward(armyPos(), t, MARCH); C.pos = { x: st.x, y: st.y }; C.go = st.arrived ? null : t; C.moved = true; persist();
      return { note: st.arrived ? "Your army marches, and is there by the year's end." : `Your army is on the march: ${yearsTo(t)} more year${yearsTo(t) > 1 ? "s" : ""} to get there.`, sfx: [["drum", 0.45]] };
    }
    if (a.k === "lift") { if (!C.siege) return null; const n = C.siege.ct; C.siege = null; persist(); return { note: `The siege of ${n} is lifted. The army is free to march.`, sfx: [["drum", 0.5]] }; }
    if (a.k === "march") {
      const ct = city(a.ct), o = ct && march(ct); if (!o) return { note: "Your army can't march there now." };
      if (isHuman(o.foe)) return humanMarch(actor, o, a.how);
      if (a.how === "fight") { C.pending = { ...o, ct: ct[0] }; persist(); return { sfx: [["drum", 0.55]], fight: { ...o, ct: ct[0] } }; }
      const w = auto(o); persist();
      return { note: w ? `${ct[0]} is yours.` : `The attack on ${ct[0]} failed.`, sfx: [["drum", 0.55], ["guns", 0.6, 900], ...(w ? [["bell", 0.45, 2300]] : [])] };
    }
    if (a.k === "ev") {
      const ev = C.events[a.i | 0]; if (!ev || ev.done) return null; ev.done = true;
      const done = r => { C.events = C.events.filter(x => !x.done); persist(); return r; };
      if (ev.kind === "peace") {
        if (a.how === "yes") { makePeace(ev.foe); if (ev.human) as(ev.foe, () => makePeace(actor)); C.gold += ev.gold || 0; return done({ sfx: [["quill", 0.5], ["seal", 0.6, 900], ...(ev.gold ? [["coin", 0.4, 1300]] : [])] }); }
        C.E.rel[ev.foe] -= 5; if (ev.human) tell(ev.foe, { note: `${nameOf(actor)} won't make peace.` }); return done({ sfx: [["drum", 0.45]] });
      }
      if (ev.kind === "ally" || ev.kind === "pact") {
        if (a.how === "yes") { const both = (x, y) => as(x, () => { if (ev.kind === "ally") C.ally[y] = true; else C.E.pact[y] = true; C.E.rel[y] = Math.max(C.E.rel[y], 40); say(ev.kind === "ally" ? `An alliance with ${nameOf(y)}` : `A trade pact with ${nameOf(y)}`); }); both(actor, ev.foe); both(ev.foe, actor); tell(ev.foe, { note: `${nameOf(actor)} ${v3(actor, "agrees")}.`, sfx: [["seal", 0.6]] }); return done({ sfx: [["quill", 0.5], ["seal", 0.6, 850]] }); }
        tell(ev.foe, { note: `${nameOf(actor)} ${v3(actor, "declines")}.` }); return done({});
      }
      if (ev.kind === "attack") {
        const ct = city(ev.ct);
        if (cityOwner(g, ct) !== actor) return done({ note: `${ev.ct} is no longer yours to defend.` });
        // (another player at your gates: meet them on the field yourself — or leave it to the garrison, and they fight it)
        if (ev.human) {
          const att = { attack: true, foe: actor, ct: ct[0], att: ev.att, def: ev.def, walls: ev.walls };
          if (a.how === "fight") { done(); return meet(ev.foe, actor, att); }
          as(ev.foe, () => { C.pending = { ...att }; });
          tell(ev.foe, { note: `${nameOf(actor)} ${v3(actor, "leaves")} ${ct[0]} to its garrison. Take it, if you can.`, sfx: [["drum", 0.5]], fight: att });
          return done({ note: `The garrison of ${ct[0]} stands to arms.` });
        }
        const o = { attack: false, foe: ev.foe, ct, att: ev.att, def: ev.def, walls: ev.walls };
        if (a.how === "fight") { C.pending = { ...o, ct: ct[0] }; return done({ fight: { ...o, ct: ct[0] } }); }
        const held = auto(o); return done({ sfx: [["guns", 0.6], ...(held ? [["bell", 0.4, 1600]] : [])] });
      }
      return done({});
    }
    if (a.k === "result") {
      const P = C.pending; if (!P) return null; C.pending = null;
      const ct = city(P.ct);
      if (P.convoy) { const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.6 + 0.03; convoyEnd({ ...P, ct }, !a.left && a.won, k, 0); persist(); return { sfx: a.won ? [["bell", 0.4, 1200]] : [] }; }
      if (a.left) { settle({ ...P, ct }, false, 0.3, 0.05); C.log[0].sub += " (You left the field.)"; persist(); return {}; }
      const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.8 + 0.05, t = Math.min(0.9, (a.killed || 0) / Math.max(1, a.theirMen || 20)) * 0.8 + 0.05;
      settle({ ...P, ct }, a.won, k, t);
      // (a player's town taken from their garrison: told to them)
      if (isHuman(P.foe) && P.attack) as(P.foe, () => say(a.won ? `${P.ct} has fallen` : `${P.ct} holds`, a.won ? `${nameOf(actor)} ${v3(actor, "takes")} it from its garrison.` : `${nameOf(actor)}'s attack is thrown back by the garrison.`));
      persist(); return { sfx: a.won ? [["bell", 0.45, 1800]] : [] };
    }
    // a town's work for the year: a building's next level, or a gun cast — paid now, done at the year's end
    if (a.k === "build") {
      const ct = city(a.ct); if (!ct || cityOwner(g, ct) !== C.me || (C.Q && C.Q[ct[0]])) return null;
      if (a.gun) { if (!lvOf(ct[0], "foundry") || C.gold < GUN_COST) return null; C.gold -= GUN_COST; C.Q[ct[0]] = { gun: true, by: C.me, cost: GUN_COST }; persist(); return { note: `The founders at ${ct[0]} begin casting a gun. It'll be ready at the year's end.`, sfx: [["coin", 0.45], ["guns", 0.25, 400]] }; }
      const o = buildable(ct).find(x => x.chain === a.chain); if (!o || o.tech || C.gold < o.cost) return null;
      C.gold -= o.cost; C.Q[ct[0]] = { chain: a.chain, by: C.me, cost: o.cost }; persist();
      return { note: `${ct[0]}: work begins on ${o.L.n.toLowerCase()}. It'll stand at the year's end.`, sfx: [["coin", 0.45], ["quill", 0.35, 300]] };
    }
    if (a.k === "unbuild") { const ct = city(a.ct), q = ct && C.Q[ct[0]]; if (!q || q.by !== C.me) return null; C.gold += q.cost | 0; delete C.Q[ct[0]]; persist(); return { note: `The work at ${ct[0]} is stopped, and the money back in the treasury.`, sfx: [["coin", 0.4]] }; }
    if (a.k === "study") { if (!TECHS[a.id] || !canStudy(C.tech.done, a.id)) return null; C.tech.cur = a.id; persist(); return { sfx: [["quill", 0.4]] }; }
    if (a.k === "govs") { const ct = city(a.ct); if (!ct || cityOwner(g, ct) !== C.me || govOf(ct[0])) return null; C.govCands[ct[0]] ||= [0, 1, 2].map(() => newMan(C.me, "governor")); persist(); return { sfx: [["parchment", 0.4]] }; }
    if (a.k === "appoint") {
      if (a.role === "general") { const ev = C.events[a.ev]; if (!ev || ev.kind !== "appoint" || ev.done || !ev.cands[a.i]) return null; C.gen = { ...ev.cands[a.i], served: 0 }; ev.done = true; persist(); return { note: `${C.gen.name} takes command of your army.`, sfx: [["seal", 0.45], ["drum", 0.35, 400]] }; }
      const ct = city(a.town), list = ct && C.govCands[ct[0]]; if (!list || !list[a.i] || cityOwner(g, ct) !== C.me) return null;
      const fee = govFee(list[a.i], ct); if (C.gold < fee) return { note: `The office costs ${fee} thalers, and the chest hasn't got it.` };
      C.gold -= fee; C.govs[ct[0]] = { ...list[a.i], served: 0, town: ct[0] }; delete C.govCands[ct[0]]; persist();
      return { note: `${C.govs[ct[0]].name} is made governor of ${ct[0]}, for ${fee} thalers.`, sfx: [["seal", 0.45], ["coin", 0.4]] };
    }
    if (a.k === "rule") { const ct = city(a.ct); if (!ct || cityOwner(g, ct) !== C.me) return null; C.rule[ct[0]] = !!a.on; persist(); return {}; }
    // (a march called off before the battle's fought: the army back in camp, free to march again this year)
    if (a.k === "calloff") { const P = C.pending; if (!P || !P.attack) return null; C.pending = null; C.moved = false; persist(); return { note: `The march on ${P.ct} is called off. The army is back in camp.`, sfx: [["drum", 0.3]] }; }
    if (a.k === "mustered") {
      const M = C.mp && C.mp.meet; if (!M || M.key !== a.key || (actor !== M.attacker && actor !== M.defender)) return null;
      M.pick[actor] = { men: a.men || {}, guns: a.guns | 0 };
      if (M.pick[M.attacker] && M.pick[M.defender]) { setTimeout(() => { if (C && C.mp && C.mp.meet === M) meetGo(); }, 0); return {}; }
      return { wait: `Waiting for ${nameOf(actor === M.attacker ? M.defender : M.attacker)} to choose their men…` };
    }
    if (a.k === "end") {
      if (!C.mp) { endSeason(); return null; }
      C.mp.ready[actor] = !C.mp.ready[actor]; persist();
      if (humans().every(h => C.mp.ready[h] && !(sliceOf(h).events || []).some(e => !e.done))) endAll();
      return {};
    }
    return null;
  });
}
// (a player's dealings with the other: war at once; peace, alliance and trade asked of them, and theirs to answer; a gift)
function humanDip(actor, id, w) {
  if (w === "war") {
    if (atWar(id) || (C.truce[id] || 0) > 0) return null;
    C.E.war[id] = true; C.warT[id] = 0; C.ally[id] = false; C.E.pact[id] = false; say(`You declare war on ${nameOf(id)}.`);
    as(id, () => { C.E.war[actor] = true; C.warT[actor] = 0; C.ally[actor] = false; C.E.pact[actor] = false; say(`${nameOf(actor)} ${v3(actor, "declares")} war on you!`, `Their army: some ${foeArmy(actor)} regiments.`); });
    tell(id, { note: `${nameOf(actor)} ${v3(actor, "has")} declared war on you!`, sfx: [["drum", 0.6]] });
    persist(); return { note: `You declare war on ${nameOf(id)}.`, sfx: [["quill", 0.4], ["drum", 0.6, 600]] };
  }
  if (w === "gift") {
    if (C.gold < 150 || (C.did[id] || {}).gift) return null; C.gold -= 150; (C.did[id] ||= {}).gift = true;
    as(id, () => { C.gold += 150; say(`${nameOf(actor)} ${v3(actor, "sends")} you 150 thalers`); });
    tell(id, { note: `${nameOf(actor)} ${v3(actor, "sends")} you 150 thalers.`, sfx: [["coin", 0.5]] }); persist();
    return { note: `150 thalers sent to ${nameOf(id)}.`, sfx: [["coin", 0.5]] };
  }
  const kind = w === "peace" ? "peace" : w === "ally" ? "ally" : w === "pact" ? "pact" : null;
  if (kind) {
    if ((kind === "peace") !== atWar(id) || (C.did[id] || {})[kind]) return null; (C.did[id] ||= {})[kind] = true;
    as(id, () => C.events.push({ kind, foe: actor, human: true, gold: 0 }));
    tell(id, { note: `${nameOf(actor)} ${v3(actor, "proposes")} ${kind === "peace" ? "peace" : kind === "ally" ? "an alliance" : "a trade pact"}.`, sfx: [["parchment", 0.5]] }); persist();
    return { note: `Your proposal goes to ${nameOf(id)}.`, sfx: [["quill", 0.5], ["seal", 0.6, 850]] };
  }
  if (w === "unpact" || w === "unally") {
    const k = w === "unpact" ? "pact" : "ally", off = (x, y) => as(x, () => { if (k === "ally") C.ally[y] = false; else C.E.pact[y] = false; });
    off(actor, id); off(id, actor); as(id, () => say(`${nameOf(actor)} ${v3(actor, "ends")} ${k === "ally" ? "your alliance" : "your trade pact"}`)); persist();
    return { note: "Done.", sfx: [["quill", 0.5]] };
  }
  return null;
}
// (a march on the other player's town: by your generals at once — or by your own hand, and they're asked how to meet it)
function humanMarch(actor, o, how) {
  const name = o.ct[0];
  if (how !== "fight") {
    const w = auto(o);
    as(o.foe, () => say(w ? `${name} has fallen` : `${name} holds`, w ? `${nameOf(actor)}'s generals take it.` : `${nameOf(actor)}'s army is thrown back.`));
    tell(o.foe, { note: w ? `${nameOf(actor)} ${v3(actor, "has")} taken ${name}!` : `${name} held against ${nameOf(actor)}.`, sfx: [["guns", 0.6]] }); persist();
    return { note: w ? `${name} is yours.` : `The attack on ${name} failed.`, sfx: [["drum", 0.55], ["guns", 0.6, 900], ...(w ? [["bell", 0.45, 2300]] : [])] };
  }
  as(o.foe, () => C.events.push({ kind: "attack", foe: actor, human: true, ct: name, att: o.att, def: o.def, walls: o.walls }));
  tell(o.foe, { note: `${nameOf(actor)} ${v3(actor, "marches")} on ${name}!`, sfx: [["drum", 0.6]] }); persist();
  return { note: `Your army marches on ${name}. ${nameOf(o.foe)} must answer: meet you on the field, or leave it to the garrison.`, sfx: [["drum", 0.55]] };
}
// the two players on one field: the battle hosted by the campaign's host, each company as big as their armies
function meet(attacker, defender, att) {
  const key = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  // (each chooses who takes the field first — the field met once both have)
  C.mp.meet = { key, att: { ...att }, attacker, defender, pick: {} };
  for (const crown of [attacker, defender]) {
    const regs = crown === attacker ? att.att : att.def, foe = crown === attacker ? defender : attacker;
    tell(crown, { muster: { key, regs, title: crown === attacker ? `March on ${att.ct}` : `Hold ${att.ct}`, foe: `${nameOf(foe)}, at the head of ${the(foe)}, has ${crown === attacker ? att.def : att.att} regiments, and is choosing their men as you choose yours.` } });
  }
  persist();
  return {};
}
// both mustered: the armies as each chose, and the field
function meetGo() {
  const M = C.mp.meet, att = M.att, attacker = M.attacker, defender = M.defender, key = M.key;
  const ct = CITIES.find(c => c[0] === att.ct);
  const armyFor = (crown, regs) => { const p = fairPick(M.pick[crown], regs, crown); return { muster: p.men, guns: p.guns, uniform: UNI_OF[crown], purse: 99999, allies: Object.values(p.men).reduce((t, n) => t + n, 0), ride: 0 }; };
  const A = armyFor(attacker, att.att), D = armyFor(defender, att.def);
  if (D.uniform === A.uniform) D.uniform = A.uniform === "imperial" ? "bavarian" : "imperial";
  M.menA = A.allies; M.menD = D.allies;
  const hostC = humans()[0];
  const at = { name: ct[0], lon: ct[1], lat: ct[2], date: `${SEASONS[C.s]} ${C.year}`, at: `${nameOf(attacker)} ${v3(attacker, "marches")} on ${nameOf(defender)}'s town` };
  for (const crown of [attacker, defender]) tell(crown, { meet: { key, side: crown === hostC ? 0 : 1, foe: crown === attacker ? defender : attacker, army: crown === attacker ? A : D, theirs: crown === attacker ? D : A, ct: att.ct, at } });
  persist();
}
// (the meeting's outcome, from the host's game: the town taken or held)
function meetEnd(wonHost, killed, lost, left) {
  const M = C.mp && C.mp.meet; if (!M) return; C.mp.meet = null;
  const hostC = humans()[0], aWon = (hostC === M.attacker) === !!wonHost;
  const lostA = hostC === M.attacker ? lost : killed, lostD = hostC === M.attacker ? killed : lost;
  const ct = CITIES.find(c => c[0] === M.att.ct);
  as(M.attacker, () => settle({ ...M.att, ct }, aWon, Math.min(0.9, lostA / Math.max(1, M.menA)) * 0.8 + 0.05, Math.min(0.9, lostD / Math.max(1, M.menD)) * 0.8 + 0.05));
  as(M.defender, () => say(aWon ? `${M.att.ct} has fallen` : `${M.att.ct} holds`, aWon ? `${nameOf(M.attacker)} beat you before its walls.` : `You threw ${nameOf(M.attacker)} back.`));
  persist(); broadcast();
}
// the season's end, both ready: the world turns once, then each player's own part — and each told their news
function endAll() {
  const before = {}; for (const h of humans()) before[h] = (sliceOf(h).log || [])[0];
  as(humans()[0], () => endSeason({ mine: false }));
  for (const h of humans()) as(h, () => endSeason({ world: false, turn: false }));
  for (const h of humans()) C.mp.ready[h] = false;
  for (const h of humans()) {
    const L = sliceOf(h).log || [], fresh = []; for (const l of L) { if (l === before[h]) break; fresh.push(l); }
    tell(h, { news: fresh.filter(l => !/^((Spring|Summer|Autumn|Winter) )?\d{4}$/.test(l.title)).reverse(), sfx: [["parchment", 0.55]] });
  }
}
// (said to a player: on this screen if it's this player, else sent)
function tell(crown, r) {
  if (!C.mp) return;
  const mine = mp && mp.host ? humans()[0] : humans()[1];
  if (crown === mine) setTimeout(() => react(r), 0);
  else if (mp && mp.net) mp.net.send({ t: "cres", r });
}
// what an act comes to on your screen: a word, the sounds, a battle to fight, a field to meet the other player on
function react(r) {
  if (!r) return;
  if (r.note) note = r.note;
  if (r.news) { news = r.news; note = ""; }
  for (const [n, v, after] of r.sfx || []) sfx(n, v, after);
  if (r.fight) { const o = { ...r.fight, ct: CITIES.find(c => c[0] === r.fight.ct) }; if (o.ct) { fight(o); return; } }
  if (r.muster && mp) {
    const M = r.muster; $("cmpMust") && $("cmpMust").remove();
    musterScreen({ title: M.title, regs: M.regs, foe: M.foe, guns: C.guns | 0, onGo: P => doAct({ k: "mustered", key: M.key, men: P.men, guns: P.guns }) });
    return;
  }
  if (r.wait) { let el = $("cmpMust"); if (!el) { el = document.createElement("div"); el.id = "cmpMust"; el.className = "cmp-must"; $("campaign").appendChild(el); } el.onclick = null; el.innerHTML = `<div class="cmp-mbox"><h2>Mustered</h2><p class="sub">${esc(r.wait)}</p></div>`; return; }
  if (r.meet && mp && fieldWithPlayer) {
    const M = r.meet; $("cmpMust") && $("cmpMust").remove();
    fieldWithPlayer({ key: M.key, side: M.side, foe: { name: nameOf(M.foe) }, army: M.army, theirs: M.theirs, at: M.at,
      onEnd: (won, killed, lost, left) => { if (mp && mp.host) meetEnd(won, killed, lost, left); },
      onFail: why => { note = why; if (mp && mp.host) { const Mt = C.mp.meet; if (Mt) { C.mp.meet = null; as(Mt.attacker, () => { const w = auto({ ...Mt.att, ct: CITIES.find(c => c[0] === Mt.att.ct) }); void w; }); broadcast(); } } openCampaign(); } });
    return;
  }
  if (ctx && !$("campaign").classList.contains("hidden")) drawMap();
}
// ---- the link between the two games ----
function broadcast() {
  if (!C || !C.mp || !mp || !mp.host || !mp.net) return;
  persist();
  const snap = { ...C }; delete snap._dirty;
  mp.net.send({ t: "cstate", C: snap });
  if (!$("campaign").classList.contains("hidden") && !$("cmpPlay").classList.contains("hidden")) drawMap();
}
// (on the other player's game: the campaign as the host has it, turned round to your own crown)
function takeState(S) {
  const sel0 = selCity && selCity[0], sel1 = sel;
  C = S; own = new Map(C.own || []); C._dirty = true; toWorldGrid();
  const me = humans()[1]; if (C.me !== me && C.H && C.H[me]) { stash(C.me); unstash(me); }
  selCity = sel0 ? CITIES.find(c => c[0] === sel0) || null : null; sel = sel1;
  const onMap = !$("campaign").classList.contains("hidden");
  if (onMap) drawMap(!mp.seen); mp.seen = true;
}
let fieldWithPlayer = null;
// a campaign of two begun: from the camp, a challenge to campaign accepted. Each chooses a crown; the host's game makes
// the campaign (or takes up the one these two left off), and keeps it.
export function openMpCampaign(net, side, foe) {
  mp = { net, side, host: side === 0, foe: foe || {}, mine: null, theirs: null, seen: false };
  C = null; sel = null; selCity = null; note = ""; news = [];
  net.on.cpick = m => { if (!mp || mp.net !== net) return; mp.theirs = NATIONS[m.crown] ? m.crown : null; if (mp.host) maybeBegin(); drawPick(); };
  net.on.cstate = m => { if (!mp || mp.net !== net || mp.host || !m.C) return; takeState(m.C); };
  net.on.cact = m => { if (!mp || mp.net !== net || !mp.host || !C || !C.mp) return; const r = apply(humans()[1], m.a || {}); if (r) mp.net.send({ t: "cres", r }); broadcast(); };
  net.on.cres = m => { if (!mp || mp.net !== net) return; react(m.r); };
  net.on.cresume = () => { if (!mp || mp.net !== net || !mp.host) return; resumeMp(); };
  net.on.dend = () => { if (!mp || mp.net !== net) return; mp.gone = true; note = `${mp.foe.name || "The other player"} has left the campaign.${mp.host ? " It's kept: challenge them to a campaign again to take it up." : ""}`; if (C) drawMap(); else drawPick(); };
  net.on.lost = net.on.dend;
  ctx.screen("campaign");
  drawPick();
}
// (the host's: both crowns chosen — the campaign made, or the saved one taken up — and sent)
function maybeBegin() {
  if (!mp || !mp.host || !mp.mine || !mp.theirs || C) return;
  const h = mp.mine, g = mp.theirs, me = ctx.identity ? ctx.identity() : { name: "You" };
  C = fresh(h); own = new Map();
  C.mp = { humans: [h, g], names: { [h]: me.name || "You", [g]: mp.foe.name || "Your friend" }, ready: {} };
  say(`${The(h)} — ${C.year}`, `You take the crown, beside ${C.mp.names[g]} at the head of ${the(g)}.`);
  const f = fresh(g);
  C.H = { [g]: { gold: f.gold, army: f.army, moved: false, did: {}, ally: {}, truce: {}, warT: {}, took: {}, lost: {}, events: [], log: [{ t: `${C.year}`, title: `${The(g)} — ${C.year}`, sub: `You take the crown, beside ${C.mp.names[h]} at the head of ${the(h)}.` }], over: null, won: false, pending: null, rel: f.E.rel, war: {}, pact: {} } };
  ensureRealm();
  sfx("bell", 0.45); sfx("drum", 0.4, 900);
  broadcast(); drawMap(true);
}
function savedMp() { try { const j = JSON.parse(localStorage.getItem(MPKEY)); return j && j.C && j.C.mp && j.partner && mp && j.partner === mp.foe.pid ? j : null; } catch (e) { return null; } }
function resumeMp() {
  const j = savedMp(); if (!j) return;
  C = j.C; own = new Map(C.own || []); C._dirty = true; toWorldGrid();
  if (C.me !== C.mp.humans[0] && C.H && C.H[C.mp.humans[0]]) { stash(C.me); unstash(C.mp.humans[0]); }
  C.mp.names[C.mp.humans[1]] = mp.foe.name || C.mp.names[C.mp.humans[1]]; C.mp.ready = {}; ensureRealm();
  sfx("drum", 0.4); broadcast(); drawMap(true);
}
