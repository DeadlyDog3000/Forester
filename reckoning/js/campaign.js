// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE CAMPAIGN: a crown of 1683 is yours, and Europe is the board. Season by season you raise regiments from your
// treasury, march on the towns of the crowns you're at war with — the battles fought by your own hand on the ground
// where the town stands, or left to your generals — and keep your neighbours sweet with envoys, gifts, trade and
// alliances, or not. They have their own minds: they war on each other and the borders move; the ones who fear or
// hate you declare war on you, march on your towns, and take them if you can't hold them. Lose every town and it's
// over; hold forty and yours is the first crown of the world (and you can go on).
//
// The map is the story's own (europe.js): the real coasts and the crowns' borders of 1683, every conquest laid over
// them. A town is a province: taking one takes the country round it.

import { FOLEY } from "./foley.js";
import { NATIONS, NATION_FAITH, CITIES, buildGrid, cityOwner, gridOf, llOf, drawEurope, cityAt, nationAt, relWord, the, The, MAP_ASPECT, MG_W, MG_H, useSheet, PEOPLES, peopleAt } from "./europe.js";
import { EuropeView3D } from "./europe3d.js";
import { TROOPS } from "./pvp.js";
import { plateOf } from "./unitart.js";
import { SHIPS, SHIP_KINDS, navalBattle } from "./naval.js";
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
  p_iroquois: "native", p_wabanaki: "native", p_cherokee: "native", p_creek: "native", p_choctaw: "native", p_shawnee: "native", p_illinois: "native", p_anishinaabe: "native_north", p_dakota: "native_north", p_cree: "native_north", p_pawnee: "native_north", p_osage: "native", p_caddo: "native",
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
const SLICE = ["gold", "army", "moved", "did", "ally", "truce", "warT", "took", "lost", "events", "log", "over", "won", "pending", "tech", "guns", "gen", "govs", "govCands", "levyQ", "lq", "units", "tax", "armies", "ar", "fleets", "sq", "rule", "morale", "siege", "supplied", "pos", "go", "aslt"];
let mp = null;    // (the link to the other player: { net, side, host, foe, ... } — null playing alone)
const humans = () => (C && C.mp ? C.mp.humans : []);
const isHuman = id => humans().includes(id);
function stash(c) { const o = {}; for (const k of SLICE) o[k] = C[k]; o.rel = C.E.rel; o.war = C.E.war; o.pact = C.E.pact; (C.H ||= {})[c] = o; }
function unstash(c) { const o = C.H[c]; for (const k of SLICE) C[k] = o[k]; C.E.rel = o.rel; C.E.war = o.war; C.E.pact = o.pact; delete C.H[c]; C.me = c; }
function as(c, fn) { if (!C.mp || c === C.me || !C.H || !C.H[c]) return fn(); const was = C.me; stash(was); unstash(c); try { return fn(); } finally { stash(c); unstash(was); } }
const sliceOf = id => id === C.me ? C : (C.H && C.H[id]) || null;
// (a crown's army: a player's regiments, or the computer's)
const foeArmy = id => isHuman(id) ? (s2 => s2 ? (s2.army | 0) + (s2.armies || []).reduce((t, a) => t + (a.army | 0), 0) : 0)(sliceOf(id)) : C.foes[id] || 0;
// (for a player, the change falls on the army they have in hand — foeArmy counts all their armies together)
const setFoeArmy = (id, v) => { if (isHuman(id)) { const s2 = sliceOf(id); if (s2) s2.army = Math.max(0, Math.round((s2.army | 0) + v - foeArmy(id))); } else C.foes[id] = v; };
// (a verb after a crown's name: a people takes the plural — "the Cherokee march", not "marches")
// (a name's possessive: "the Papal States'", not "States's")
const poss = n => /s$/.test(n) ? n + "'" : n + "'s";
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
function toWorldGrid() {
  if (!C || C.gridV === 6) return;
  // (a square of an older sheet to this one's, by the place it stood for: Europe's alone, before 1.49 — squares of
  //  0.14° from 12°W; the world's of 1.49 and 1.50, even from 100.06°W; 1.50.1's, bent at 50°W; 1.50.2's, sinusoidal
  //  west of 50°W. The rows of all of those were the same, 66°N down)
  const v = C.gridV | 0, cr = (lat, ref = 49) => Math.cos(lat * Math.PI / 180) / Math.cos(ref * Math.PI / 180), BK = cr(41);
  const old = (x, y) => {
    const lat = 66 - y * 34 / 370;
    if (v === 5) { const e = -110 + x * 0.14; if (e >= -20) return [e, lat]; const c = cr(lat), xa = -80 + 30 * c; return [e <= xa ? -80 + (e + 80) / c : -50 + (e - xa) / (-20 - xa) * 30, lat]; }
    if (v === 4) { const e = -108.46 + x * 0.14; return [e >= -50 ? e : -50 + (e + 50) / BK, lat]; }
    return [v === 3 ? -100.06 + x * 0.14 : -12 + x * 0.14, lat];
  };
  W0(); const nw = (x, y) => gridOf(...old(x, y));
  const sh = p => p && isFinite(p.x) ? (([x, y]) => ({ ...p, x, y }))(nw(p.x, p.y)) : p;
  own = new Map([...own].map(([k, to]) => { const [c, r] = k.split(",").map(Number), [x, y] = nw(c + 0.5, r + 0.5); return [Math.floor(x) + "," + Math.floor(y), to]; }));
  C.pos = sh(C.pos); C.go = sh(C.go); if (C.foePos) for (const id of Object.keys(C.foePos)) C.foePos[id] = sh(C.foePos[id]);
  for (const h of Object.values(C.H || {})) { h.pos = sh(h.pos); h.go = sh(h.go); }
  C.gridV = 6; C._dirty = true; C.own = [...own];
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
    // (the woods' nations: their warriors fewer than a crown's regiments, a war party being a few hundred men)
    army[id] = NATIONS[id].nw ? NATIONS[id].strength * 10 + 6 + Math.floor(R() * 6) : NATIONS[id].strength * 15 + 8 + Math.floor(R() * 10);
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
  return { v: 1, gridV: 6, me, year: 1683, s: 0, gold: 200 + NATIONS[me].strength * 60, army: NATIONS[me].strength * 10 + 6, moved: false, did: {},
    E: { rel, war, wars, conq: [], pact: {}, plague: {}, famine: {}, beaten: {}, news: [], gridV: 2 },
    foes: army, ally, truce: {}, warT: {}, took: {}, lost: {}, events: [], log: [], pending: null, over: null, won: false, own: [] };
}
function begin(me, into = slot) {
  slot = into; spreadOf = ""; C = fresh(me); ensureRealm(); own = new Map();
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
function persist() { if (C && C.me) for (const h of C.mp ? humans() : [C.me]) as(h, reconcile); C.own = [...own]; save(); }
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
  // (a town taken: some of its people killed in the sack, or fled)
  if (C.pop) C.pop[ct[0]] = Math.round(popOf(ct) * 0.85);
  // (and the loser's regiments that held it: killed or taken)
  if (from === C.me || isHuman(from)) { const sl = sliceOf(from); if (sl && sl.units) { const lost = garUnits(ct[0], sl.units).length; if (lost) { sl.units = sl.units.filter(u => u.at !== ct[0]); as(from, () => say(`The garrison of ${ct[0]} is lost`, `${lost} regiment${lost > 1 ? "s" : ""} killed or taken with the town.`)); } } }
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
// (which side of the Atlantic a crown has towns on; an ally only comes into a war it can get to — Denmark doesn't
//  march on the Iroquois)
const sidesOf = id => new Set(citiesOfNow(grid(), id).map(ct => ct[1] < -42));
const sameSide = (a, b) => { const A = sidesOf(a); return [...sidesOf(b)].some(x => A.has(x)); };
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
// (the New World is drawn larger than Europe — 1.45 times, west of 50°W — so a year's march there covers more squares)
const magAt = p => { const lon = llOf(p.x, p.y)[0]; return lon <= -50 ? 1.45 : lon >= -20 ? 1 : 1 + 0.45 * (-20 - lon) / 30; };
const mdist = (p, q) => dist2(p, q) / magAt({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
function stepToward(p, t, d) { if (overSea(p, t)) return { x: t.x, y: t.y, arrived: true, sea: true }; d *= magAt({ x: (p.x + t.x) / 2, y: (p.y + t.y) / 2 }); const L = dist2(p, t); return L <= d ? { x: t.x, y: t.y, arrived: true } : { x: p.x + (t.x - p.x) / L * d, y: p.y + (t.y - p.y) / L * d, arrived: false }; }
const inMarch = ct => mdist(armyPos(), cellXY(ct)) <= MARCH + 0.5;
const yearsTo = t => overSea(armyPos(), t) ? 1 : Math.max(1, Math.ceil(mdist(armyPos(), t) / MARCH));
// (the other crowns' field armies: at their capital, or on the march toward a town of yours)
function foeArmyPos(id) { C.foePos ||= {}; if (!C.foePos[id] || !isFinite(C.foePos[id].x)) { const h = homeOf(grid(), id); if (h) C.foePos[id] = { x: h.x, y: h.y }; } return C.foePos[id] || null; }
// (your army near enough to a town of yours to come to its help: half a year's march)
const armyNear = ct => !C.siege && mdist(armyPos(), cellXY(ct)) <= MARCH * 0.5;
// (all your armies near enough to come to a town's help, together)
const helpNear = ct => eachArmy(() => armyNear(ct) ? Math.round(C.army * 0.7) : 0).reduce((t, v) => t + v, 0);

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
const worth = ct => { const n = ct[0]; let inc = ct[3] * 22 * clamp(Math.sqrt(popOf(ct) / popBase(ct)), 0.6, 1.6); for (const ch of ["farm", "trade", "works"]) inc += (CHAINS[ch].levels[lvOf(n, ch)].inc || 0) * (ch === "farm" && knows("enclosure") ? 1.15 : 1); return Math.round(inc * govMul(n)); };
function garrison(ct) { const n = ct[0], v = govOf(n), o = cityOwner(grid(), ct), sl = o === C.me ? C : o && isHuman(o) ? sliceOf(o) : null; return Math.round(garUnits(n, sl ? sl.units : null).reduce((t, u) => t + u.hp, 0)) + ct[3] * 4 + 2 + (CHAINS.walls.levels[lvOf(n, "walls")].gar || 0) + (CHAINS.army.levels[lvOf(n, "army")].gar || 0) + (v ? v.st[2] - 2 : 0); }
// (walls only where they've been built — by you, or by the crown that holds the town — save a crown's last town,
//  which every man in it holds to the end behind whatever they can throw up)
function hasWalls(ct, owner, g = grid()) { return lvOf(ct[0], "walls") >= 1 || (!!owner && !NATIONS[owner].nw && citiesOfNow(g, owner).length === 1); }
// (a town of the woods' nations: a palisade round it, fought in as a village)
const isVillage = ct => { const o = cityOwner(grid(), ct); return !!o && !!NATIONS[o].nw && !lvOf(ct[0], "walls"); };
const research = g => 1 + citiesOfNow(g, C.me).reduce((t, ct) => t + (CHAINS.church.levels[lvOf(ct[0], "church")].rp || 0), 0);
const regCost = g => REGIMENT - Math.max(0, ...citiesOfNow(g, C.me).map(ct => CHAINS.works.levels[lvOf(ct[0], "works")].cheap || 0));
const GUN_COST = 140;
// (your army's nerve in a battle: the drill of your barracks, the bayonet, the general's hold on his men)
const braveMul = g => moraleK() * (1 + Math.max(0, ...citiesOfNow(g, C.me).map(ct => CHAINS.army.levels[lvOf(ct[0], "army")].morale || 0)) + (knows("bayonet") ? 0.05 : 0) + (C.gen ? (C.gen.st[1] - 3) * 0.06 : -0.06) + vetK());
// (a general's victories: every third one, he grows in command, up to the most a man can have)
function genWin() {
  const G = C.gen; if (!G) return; G.wins = (G.wins | 0) + 1;
  if (G.wins % 3 === 0 && G.st[0] < 5) { G.st[0]++; say(`${G.name} grows in command`, `${G.wins} victories behind him: his command is now ${G.st[0]} of 5.`); }
}
// (the army's experience: its regiments' battles behind them, up to three chevrons each — a veteran army a tenth steadier)
const vetK = () => { const L = C.units || []; return L.length ? L.reduce((t, u) => t + (u.xp || 0), 0) / L.length * 0.033 : 0; };
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
function needGeneral() { if ((C.ar | 0) !== armyIds()[0]) { const was = C.ar | 0; useArmy(armyIds()[0]); needGeneral(); useArmy(was); return; } if (!C.gen && !C.events.some(e => e.kind === "appoint" && !e.done && (e.ar | 0) === (C.ar | 0))) C.events.push({ kind: "appoint", role: "general", ar: C.ar | 0, cands: [0, 1, 2].map(() => newMan(C.me, "general")) }); }
// (a general asked for, for the army in hand: three men put forward)
function askGeneral() { if (C.gen || C.events.some(e => e.kind === "appoint" && !e.done && (e.ar | 0) === (C.ar | 0))) return; C.events.push({ kind: "appoint", role: "general", ar: C.ar | 0, cands: [0, 1, 2].map(() => newMan(C.me, "general")) }); persist(); }
// the realm made ready: a campaign begun, or one from before these things were (its old works carried over)
function ensureRealm() {
  if (!C) return;
  C.B ||= {}; C.Q ||= {}; C.walls ||= {}; C.foeGen ||= {}; C.fguns ||= {};
  for (const ct of CITIES) popOf(ct);
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
    C.tech ||= { done: {}, cur: null, pts: 0 }; ensureUnits(); C.lq ||= []; C.levyQ = C.lq.length; C.morale ??= 60; C.govCands ||= {}; C.rule ||= {};
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
  peopleYear(g);
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
    const fg = C.foeGen[id]; if (fg) { fg.served = (fg.served | 0) + 1; if (fg.served >= GEN_SERVICE) { C.foeGen[id] = newMan(id, "general"); if ((C.mp ? humans() : [C.me]).some(h => as(h, () => atWar(id)))) sayAll(`${fg.name} dies`, `${poss(The(id))} general, of old age. ${C.foeGen[id].name} takes his place.`); } }
  }
}
// ---- and for each player: the levies in, the learning done, the years told on their men ----
function realmMine(g) {
  riots(g);
  reconcile(); { const men = eachArmy(id => replenish(g, id === armyIds()[0])).reduce((t, v) => t + (v | 0), 0); if (men >= 300) say(`The regiments fill their ranks`, `${fmtN(Math.round(men / 100) * 100)} men from your towns join the thin regiments.`); }
  if (C.lq && C.lq.length) {
    // (drilled where they were raised: a barracks sends its recruits out blooded, a military academy seasoned)
    let held = 0; const by = {}; for (const q of C.lq) { const lv = lvOf(q.t, "army"); const tc = CITIES.find(c => c[0] === q.t), na = tc && cityOwner(g, tc) === C.me ? nearestArmy(cellXY(tc)) : null, near = na != null; C.units.push({ k: q.k, hp: 1, ...(lv >= 2 ? { xp: lv >= 3 ? 2 : 1 } : {}), ...(near ? (na ? { ar: na } : {}) : tc ? { at: q.t } : {}) }); if (tc && !near) held++; if (near && na !== (C.ar | 0)) { const A = C.armies.find(a => a.id === na); if (A) A.army = (A.army | 0) + 1; } by[q.k] = (by[q.k] || 0) + 1; }
    const n = C.lq.length; C.army = Math.round(unitSum());
    say(`${n} new regiment${n > 1 ? "s" : ""} raised`, `${Object.entries(by).map(([k, c]) => `${c} of ${TROOPS[k].name.toLowerCase()}`).join(", ")}: armed and drilled over the year.${held ? ` ${held === n ? (n > 1 ? "Your army is too far off for them to join it: they hold their towns as garrisons until it comes for them." : "Your army is too far off for it to join: it holds its town as a garrison until the army comes for it.") : held === 1 ? "One is too far from your army to join it, and holds its town as a garrison until the army comes for it. The rest join the army." : `${held} are too far from your army to join it, and hold their towns as garrisons until the army comes for them. The rest join the army.`}` : (C.armies || []).length ? (n > 1 ? " They join the nearest of your armies." : " It joins the nearest of your armies.") : n > 1 ? " They join the army." : " It joins the army."}`);
  }
  C.lq = []; C.levyQ = 0;
  const T = C.tech; T.pts += research(g);
  if (T.cur && T.pts >= TECHS[T.cur].cost) { T.pts -= TECHS[T.cur].cost; T.done[T.cur] = true; say(`Your scholars master ${TECHS[T.cur].n.replace(/^The /, "the ")}`, TECHS[T.cur].d); T.cur = null; }
  if (!T.cur) T.pts = Math.min(T.pts, 6);
  // (thin regiments of one arm in one army made into one: their men together, their experience as the men bring it)
  { let merged = 0; const groups = {}; for (const u of C.units) if (u.hp < 0.6) (groups[`${u.at || "a" + (u.ar | 0)}|${u.k}`] ||= []).push(u);
    for (const L of Object.values(groups)) { L.sort((a, b) => a.hp - b.hp); while (L.length > 1 && L[0].hp + L[1].hp <= 1) { const [a, b] = L.splice(0, 2), hp = a.hp + b.hp; b.xp = ((a.xp || 0) * a.hp + (b.xp || 0) * b.hp) / hp; b.hp = hp; C.units.splice(C.units.indexOf(a), 1); merged++; if (hp < 0.6) { L.push(b); L.sort((x, y) => x.hp - y.hp); } } }
    if (merged) say(`${merged} thin regiment${merged > 1 ? "s" : ""} merged`, "Too few men left in them to stand alone: their men go into others of the same arm."); }
  eachArmy(id => {
    siegeYear(g);
    C.morale = Math.round((C.morale ?? moraleBase()) + (moraleBase() - (C.morale ?? moraleBase())) * 0.35);
    if (C.gen) { C.gen.served = (C.gen.served | 0) + 1; if (C.gen.served >= lifeOf(C.gen)) { say(`${C.gen.name} dies`, `Of old age, after long service. Choose who will lead ${id ? `the ${armyName(id).toLowerCase()}` : "your army"} now.`); C.gen = null; } }
  });
  // (an army of yours with no regiments left: gone from the roll)
  for (const a of [...(C.armies || [])]) if (!C.units.some(u => !u.at && (u.ar | 0) === a.id)) C.armies = C.armies.filter(b => b !== a);
  if ((C.ar | 0) && !field().length && (C.armies || []).length) useArmy(armyIds().find(i => i !== (C.ar | 0)));
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
  // (defending a town: its own regiments bear their share of the losses, beside the field army's)
  //  — and the field army only its own: the part of it that came to the town's help, not the whole of it far away
  let loss = mine * myLossK;
  // (a town held by its garrison alone, the army far off: the army's men, guns, spirit and general are not in it)
  const away = !o.attack && !o.field && o.army === false;
  if (!o.attack && C.units) {
    const G = garUnits(o.ct[0]), gs = G.reduce((t, u) => t + u.hp, 0), fieldPart = clamp(mine - garrison(o.ct), 0, mine);
    if (gs > 0) { const gl = Math.min(gs, loss * gs / Math.max(1, mine)), f = 1 - gl / gs; for (const u of G) u.hp *= f; C.units = C.units.filter(u => !u.at || u.hp >= 0.12); }
    loss = away ? 0 : mine * myLossK * fieldPart / Math.max(1, mine);
  }
  const broken = wearUnits(loss, o.pick) || {};
  // (the regiments that fought: the wiser for it — the more so for a victory)
  for (const u of C.units || []) if ((!away || u.at === o.ct[0]) && (!o.pick || (o.pick.men && o.pick.men[u.k]))) u.xp = Math.min(3, (u.xp || 0) + (won ? 0.6 : 0.3) * (o.pick ? 1 : 0.6));
  setFoeArmy(o.foe, Math.max(0, Math.round(foeArmy(o.foe) - Math.max(0, theirs - garrison(o.ct)) * theirLossK)));
  const name = o.ct[0];
  if (o.attack) {
    if (won) { seize(o.ct, C.me); C.took[o.foe] = (C.took[o.foe] || 0) + 1; for (const id of Object.keys(C.E.rel)) C.E.rel[id] -= id === o.foe ? 8 : 2; say(`${name} is yours`, `Taken from ${the(o.foe)}.`); }
    else say(`Beaten before ${name}`, `Your army falls back with what it has left: ${armyStr()}.`);
  } else {
    if (won) { say(`${name} holds`, `${poss(The(o.foe))} army is thrown back.`); if (!isHuman(o.foe) && C.foePos && C.foePos[o.foe]) { const h = homeOf(grid(), o.foe); if (h) { const b = stepToward(cellXY(o.ct), h, 8); C.foePos[o.foe] = { x: b.x, y: b.y }; } } strikeBack(o.foe); }
    else { seize(o.ct, o.foe); C.lost[o.foe] = (C.lost[o.foe] || 0) + 1; say(`${name} has fallen`, `${The(o.foe)} ${v3(o.foe, "takes")} it.`); if (C.govs) delete C.govs[name]; }
  }
  if (Object.keys(broken).length) say(`Regiments broken at ${name}`, `${Object.entries(broken).map(([k, c]) => `${c} of ${TROOPS[k].name.toLowerCase()}`).join(", ")}: too few men left to stand as regiments, they are struck off the roll.`);
  // (where your army ends up: in the town it took, or fallen back toward home from the one it couldn't)
  if (o.attack && !o.convoy) { const t = cellXY(o.ct); if (won) C.pos = { x: t.x, y: t.y }; else { const h = homeOf(grid(), C.me) || armyPos(); const b = stepToward(t, h, 6); C.pos = { x: b.x, y: b.y }; } }
  // (a storm through the breach: the siege over, won or lost)
  if (o.attack && siegeOf(o.ct)) C.siege = null;
  // (the army's spirit: up with a victory — more for a town taken — down hard with a defeat)
  if (!away) { moraleMove(won ? (o.attack ? 12 : 8) : -16); if (won && (o.attack || !o.walls)) genWin(); }
  // (the generals' fate: in a lost battle one may fall; even in a won one, now and then)
  if (C.gen && !away && R() < (won ? 0.05 : 0.25)) { moraleMove(-10); say(`${C.gen.name} falls at ${name}`, "Killed at the head of his men. Choose who will lead your army now."); C.gen = null; needGeneral(); }
  const fg = !isHuman(o.foe) && C.foeGen && C.foeGen[o.foe]; if (fg && R() < (won ? 0.2 : 0.04)) { say(`${fg.name} falls at ${name}`, `${poss(The(o.foe))} general is dead. ${(C.foeGen[o.foe] = newMan(o.foe, "general")).name} takes his place.`); }
  // (and guns lost in a defeat, left on the field)
  if (!won && !away && C.guns > 0 && R() < 0.6) C.guns--;
  checkEnd();
}
// (their army thrown back from your walls: their nearest town picked out on the map, to carry the war to them)
function strikeBack(foe) {
  const g = grid(), t = citiesOfNow(g, foe).filter(ct => inMarch(ct)).sort((a, b) => b[3] - a[3])[0];
  if (!t || C.moved || C.army < 5) return;
  selCity = t; sel = foe; note = `${poss(The(foe))} army is beaten back and weakened. Strike back while it's down: ${t[0]} is within your reach.`;
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
  const things = o.field ? [] : o.convoy ? [["convoy", -1, o.carts || 6, Math.round(ct[1] * 777 + C.year)]] : isVillage(ct) ? [["village", bu, ct[3], Math.round(ct[1] * 1000 + ct[2] * 100)]] : [["town", bu, ct[3], o.walls ? Math.max(1, lvOf(ct[0], "walls")) : 0, Math.round(ct[1] * 1000 + ct[2] * 100), o.battered || 0]];
  // (their raiders: horse, most of them — that's what's sent to fall on a convoy)
  const theirMuster = muster(o.foe, theirMen); if (o.convoy && !NATIONS[o.foe].nw) { const hk = Math.round(theirMen * 0.35); theirMuster.cavalry = (theirMuster.cavalry || 0) + hk; theirMuster.musketeer = Math.max(0, (theirMuster.musketeer || 0) - hk); }
  // (each side's nerve: your barracks, your learning, your general; theirs, their general's hold on them)
  const fg = genOf(o.foe), theirBrave = fg ? 1 + (fg.st[1] - 3) * 0.06 : 1, foeGuns = isHuman(o.foe) ? as(o.foe, () => C.guns | 0) : (C.fguns[o.foe] | 0);
  const b = {
    id: "cmp-" + ct[0], campaign: true, name: o.field ? `The field near ${ct[0]}` : o.convoy ? `The road to ${ct[0]}` : ct[0], date: `${SEASONS[s]} ${C.year}`, year: C.year, lon: ct[1], lat: ct[2],
    at: o.field ? (o.attack ? `You fall on ${poss(the(o.foe))} army on the march` : `${poss(The(o.foe))} army falls on yours in the open`) : o.convoy ? `${The(o.foe)} ${v3(o.foe, "falls")} on your supply train to ${ct[0]}` : o.attack ? `You march on ${poss(the(o.foe))} town` : `${The(o.foe)} ${v3(o.foe, "marches")} on your town`,
    hour: hourR < 0.1 ? "night" : hourR < 0.35 ? "morning" : hourR < 0.8 ? "afternoon" : "evening",
    cloud: s === 3 ? 0.7 : s === 2 ? 0.5 : s === 0 ? 0.35 : 0.1, mist: s === 2 ? 0.3 : s === 3 ? 0.25 : 0,
    fort: null, won: undefined, you: 0,
    sides: [
      { name: NATIONS[C.me].name, lead: "you", hold: o.attack ? undefined : 999, cos: [{ uni: UNI_OF[C.me], muster: { ...o.pick.men }, guns: o.pick.guns | 0, brave: braveMul(g) }, ...(ally && !o.walls ? [{ uni: UNI_OF[ally], muster: muster(ally, 14), guns: 1 }] : [])] },
      { name: NATIONS[o.foe].name, lead: "their officers", hold: o.attack ? 999 : undefined, cos: [{ uni: UNI_OF[o.foe] === UNI_OF[C.me] ? (UNI_OF[C.me] === "imperial" ? "bavarian" : "imperial") : UNI_OF[o.foe], muster: theirMuster, guns: o.convoy ? 0 : Math.min(3, foeGuns, Math.ceil(theirs / 15)), brave: theirBrave }] },
    ],
    map: { snow: s === 3, things },
  };
  if (!C.mp || (mp && mp.host)) { C.pending = { ...o, ct: o.ct[0], ar: C.ar | 0 }; persist(); }
  b.onEnd = (won, killed, lost) => doAct({ k: "result", won: !!won, killed: killed | 0, lost: lost | 0, myMen, theirMen });
  startBattle(b);
}
// ---------------------------------------------------------------------------
//  THE NAVY — ships built in your ports, fleets sailed over the sea a year's sailing at a time, armies carried in them,
//  and battles at sea (naval.js) against the other crowns' fleets
// ---------------------------------------------------------------------------
const SAIL = 450;
// (the crowns that keep a navy, and how many ships of war: the sea powers most)
const NAVY = { england: 6, dutch: 6, france: 5, castile: 4, portugal: 3, sweden: 4, denmark: 4, ottoman: 4, venice: 4, algiers: 2, tunis: 1, tripoli: 1, morocco: 1, naples: 1, scotland: 1, brandenburg: 1 };
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
// (the waters ships sail: all the water joined to the ocean, and the great lakes — each its own sea, the ships built on
//  one kept to it — but not a pond, nor an estuary the map has cut off from the sea)
//  (Huron joined to Michigan by the straits of Mackinac, and to Erie by the Detroit river, as La Salle's Griffon sailed
//  them; Niagara's falls and the rapids of the St Lawrence and St Mary's keep Ontario and Superior to themselves)
const STRAITS = [[[-84.95, 45.95], [-84.35, 45.75]], [[-82.45, 43.15], [-83.15, 41.9]]], LAKE_MIN = 300;
let OCEAN = null, OCEAN_W = 0, WATERS = null;
function oceanOf(g) {
  const W = g[0].length, H = g.length; if (OCEAN && OCEAN_W === W * H) return OCEAN;
  const lab = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H), size = [];
  const wet = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === null) wet[y * W + x] = 1;
  // (the straits cut through: a channel a square or two wide)
  for (const [[lo0, la0], [lo1, la1]] of STRAITS) { const [x0, y0] = gridOf(lo0, la0), [x1, y1] = gridOf(lo1, la1), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1; for (let i = 0; i <= n; i++) { const x = Math.floor(x0 + (x1 - x0) * i / n), y = Math.floor(y0 + (y1 - y0) * i / n); if (x >= 0 && y >= 0 && x < W && y < H) wet[y * W + x] = 2; } }
  for (let s = 0; s < W * H; s++) {
    if (!wet[s] || lab[s] >= 0) continue; const id = size.length; let h = 0, n = 0; q[n++] = s; lab[s] = id;
    while (h < n) { const i = q[h++], x = i % W, y = (i / W) | 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (lab[j] >= 0 || !wet[j]) continue; lab[j] = id; q[n++] = j; } }
    size.push(n);
  }
  // (the open Atlantic, and the other seas' widest waters)
  const sea = new Set(); for (const [lon, lat] of [[-35, 40], [-25, 55], [5, 56], [18, 35], [33, 43], [20, 58], [-85, 59], [-88, 25]]) { const [x, y] = gridOf(lon, lat).map(Math.floor); if (y >= 0 && y < H && x >= 0 && x < W && lab[y * W + x] >= 0) sea.add(lab[y * W + x]); }
  const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { const l = lab[i]; if (l >= 0 && (sea.has(l) || size[l] >= LAKE_MIN)) m[i] = sea.has(l) ? 1 : 2; }
  OCEAN = m; OCEAN_W = W * H; WATERS = lab; return m;
}
// (1 the sea, 2 a great lake, 0 not water a ship sails; and which water it is, to keep a lake's ships to their lake)
const isSea = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length && oceanOf(g)[y * g[0].length + x] > 0;
const waterOf = (g, p) => { oceanOf(g); const x = Math.floor(p.x), y = Math.floor(p.y); return WATERS[y * g[0].length + x]; };
const onLake = (g, p) => { const x = Math.floor(p.x), y = Math.floor(p.y); return oceanOf(g)[y * g[0].length + x] === 2; };
function nearCell(g, p, r, want, ocean) { const x0 = Math.floor(p.x), y0 = Math.floor(p.y); let best = null, bd = 1e9; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (y < 0 || y >= g.length || x < 0 || x >= g[0].length || (want ? !isSea(g, x, y) || (ocean && oceanOf(g)[y * g[0].length + x] !== 1) : g[y][x] === null)) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; } } return best; }
const seaNear = (g, p, r = 4, ocean = false) => nearCell(g, p, r, true, ocean), landNear = (g, p, r = 4) => nearCell(g, p, r, false);
// (a town on the sea or a great lake: its harbour, the nearest such water to it — the open sea first, where it has both)
//  (the river ports — London, Hamburg, Bordeaux, Seville — are ports too: the ships came up the river to their quays, the
//  water a little farther off on the map)
const UPRIVER = new Set(["London", "Hamburg", "Bremen", "Bordeaux", "Rouen", "Sevilla", "Antwerpen", "Nantes", "York", "Lübeck", "Königsberg", "Stettin"]);
const harbourR = ct => UPRIVER.has(ct[0]) ? 7 : 3;
const harbourOf = (ct, ocean = false) => { const g = grid(), r = harbourR(ct), p = cellXY(ct); return seaNear(g, p, r, true) || (ocean ? null : seaNear(g, p, Math.min(r, 4))); };
// the way over the sea from one place to another, square by square — none, if the water doesn't join
// (the ways found, kept: the same voyage asked for again is not worked out again)
const PATHS = new Map();
function seaPath(g, a, b) {
  const key = `${Math.floor(a.x)},${Math.floor(a.y)}|${Math.floor(b.x)},${Math.floor(b.y)}|${g.length}`;
  if (PATHS.has(key)) return PATHS.get(key);
  const p = seaPath0(g, a, b); if (PATHS.size > 400) PATHS.clear(); PATHS.set(key, p); return p;
}
function seaPath0(g, a, b) {
  const W = g[0].length, H = g.length, oc = oceanOf(g), s0 = seaNear(g, a, 3), t0 = seaNear(g, b, 5); if (!s0 || !t0) return null;
  const si = Math.floor(s0.y) * W + Math.floor(s0.x), ti = Math.floor(t0.y) * W + Math.floor(t0.x);
  const prev = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let h = 0, n = 0; q[n++] = si; prev[si] = si;
  while (h < n) { const i = q[h++]; if (i === ti) break; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (prev[j] !== -1 || !oc[j]) continue; prev[j] = i; q[n++] = j; } }
  if (prev[ti] === -1) return null;
  const path = []; for (let i = ti; ; i = prev[i]) { path.push({ x: i % W + 0.5, y: ((i / W) | 0) + 0.5 }); if (i === si) break; } return path.reverse();
}
// (as far along it as a year's sailing goes: the New World drawn larger, as for marches)
function sailAlong(path, range = SAIL) { let d = 0, i = 1; for (; i < path.length; i++) { const st = dist2(path[i - 1], path[i]) / magAt(path[i]); if (d + st > range) break; d += st; } return { at: path[i - 1], arrived: i >= path.length, len: path.reduce((t, p, j) => j ? t + dist2(path[j - 1], p) / magAt(p) : 0, 0) }; }
const fleetById = id => (C.fleets || []).find(f => f.id === id);
const fleetCap = f => f.ships.reduce((t, s) => t + SHIPS[s.k].cap, 0);
const gunsOf = ships => ships.reduce((t, s) => t + SHIPS[s.k].guns * (0.4 + 0.6 * s.hp), 0);
const fleetName = f => `${["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"][(f.id | 0) % 8]} fleet`;
// (the armies of yours aboard a fleet: their ids, and how many regiments they come to)
const aboardOf = fid => eachArmy(id => (C.emb === fid ? id : null)).filter(v => v != null);
const aboardRegs = fid => aboardOf(fid).reduce((t, id) => t + (C.units || []).filter(u => !u.at && (u.ar | 0) === id).length, 0);
const syncAboard = f => eachArmy(() => { if (C.emb === f.id) { C.pos = { x: f.pos.x, y: f.pos.y }; C.go = null; } });
const shipUp = () => (C.fleets || []).reduce((t, f) => t + f.ships.reduce((u, s) => u + SHIPS[s.k].up, 0), 0);
const raisingShips = n => (C.sq || []).filter(q => q.t === n);
const dockSlots = ct => ct[3] >= 3 ? 2 : 1;
const shipCost = k => SHIPS[k].cost;
// a ship laid down in one of your ports: paid for now, afloat at the year's end
function buildShip(n, k) {
  const ct = CITIES.find(c => c[0] === n); if (!ct || cityOwner(grid(), ct) !== C.me || !SHIPS[k]) return "You can't build that there.";
  if (!harbourOf(ct)) return `${n} isn't on the sea.`; if (k === "line" && ct[3] < 2) return "A ship of the line needs a city's dockyard."; if (k === "line" && onLake(grid(), harbourOf(ct))) return "A ship of the line is too great for the lakes: sloops and frigates only.";
  if (raisingShips(n).length >= dockSlots(ct)) return `${n}'s dockyard is busy this year.`; if (C.gold < shipCost(k)) return "The treasury hasn't the money.";
  C.gold -= shipCost(k); (C.sq ||= []).push({ t: n, k, c: shipCost(k) }); persist(); return null;
}
function unbuildShip(n) { const L = C.sq || [], i = L.map(q => q.t).lastIndexOf(n); if (i < 0) return; C.gold += L[i].c | 0; L.splice(i, 1); persist(); }
// the year's ships launched: each into a fleet of yours lying off its port, or a new fleet of its own
function launchShips(g) {
  if (!(C.sq || []).length) return; C.fleets ||= [];
  const by = {};
  for (const q of C.sq) {
    const ct = CITIES.find(c => c[0] === q.t), hb = ct && cityOwner(g, ct) === C.me ? harbourOf(ct) : null; if (!hb) continue;
    let f = C.fleets.find(x => dist2(x.pos, hb) <= 4);
    if (!f) { f = { id: Math.max(0, ...C.fleets.map(x => x.id + 1)), pos: { x: hb.x, y: hb.y }, ships: [], moved: false, go: null }; C.fleets.push(f); }
    f.ships.push({ k: q.k, hp: 1 }); by[q.k] = (by[q.k] || 0) + 1;
  }
  const n = C.sq.length; C.sq = [];
  say(`${n} ship${n > 1 ? "s" : ""} launched`, `${Object.entries(by).map(([k, c]) => `${c} ${(c > 1 ? SHIPS[k].name : SHIPS[k].one).toLowerCase()}`).join(", ")}: fitted out, manned and ready for sea.`);
}
// (the year at sea: ships in a port of yours repaired, ships at sea a little; a voyage begun taken up again)
function fleetsYear(g) {
  for (const f of C.fleets || []) {
    const home = citiesOfNow(g, C.me).some(ct => { const h = harbourOf(ct); return h && dist2(h, f.pos) <= 4; });
    for (const s of f.ships) s.hp = Math.min(1, s.hp + (home ? 0.35 : 0.05));
  }
}
function fleetsStart(g) {
  for (const f of C.fleets || []) {
    f.moved = false;
    if (f.go) { const p = seaPath(g, f.pos, f.go); if (!p) { f.go = null; continue; } const st = sailAlong(p); f.pos = { x: st.at.x, y: st.at.y }; if (st.arrived) { f.go = null; say(`The ${fleetName(f).toLowerCase()} arrives`, "It's where you sent it."); } f.moved = true; syncAboard(f); }
  }
}
// a fleet sent somewhere: as far as a year's sailing takes it now, the rest of the way in the years after
function sail(fid, t) {
  const g = grid(), f = fleetById(fid); if (!f) return "No such fleet."; if (f.moved) return "That fleet has already sailed this year.";
  const p = seaPath(g, f.pos, t); if (!p) return onLake(g, f.pos) ? "The fleet can't sail there: its lake doesn't reach it." : "The fleet can't sail there: the sea doesn't reach it.";
  const st = sailAlong(p); f.pos = { x: st.at.x, y: st.at.y }; f.go = st.arrived ? null : { x: p[p.length - 1].x, y: p[p.length - 1].y }; f.moved = true; syncAboard(f); persist();
  return null;
}
// the army in hand taken aboard a fleet of yours lying off the shore where it stands — if she has the room
function embark(fid) {
  const f = fleetById(fid); if (!f) return "No such fleet."; if (C.emb != null) return "Your army is already aboard.";
  if (C.siege) return "Not while it's besieging a town."; if (dist2(armyPos(), f.pos) > 5) return "The fleet must lie off the shore where your army stands.";
  const room = fleetCap(f) - aboardRegs(fid); if (room < field().length) return `The fleet has room for ${Math.max(0, room)} regiments; your army is ${field().length}. Build more ships, or split the army.`;
  C.emb = fid; C.pos = { x: f.pos.x, y: f.pos.y }; C.go = null; persist(); return null;
}
// and put ashore on the nearest beach — the landing takes the rest of the year
function land() {
  const f = fleetById(C.emb); if (!f) { C.emb = null; return null; }
  const p = landNear(grid(), f.pos, 4); if (!p) return "There's no shore near enough to land on. Sail in closer.";
  C.emb = null; C.pos = { x: p.x, y: p.y }; C.moved = true; persist(); return null;
}
// ---- the other crowns' fleets: one each for the sea powers, built up over the years, sent against yours in war ----
function navyMix(id, n) { const out = [], big = (NAVY[id] | 0) >= 4; for (let i = 0; i < n; i++) out.push({ k: big && i % 3 === 0 ? "line" : i % 3 === 2 ? "sloop" : "frigate", hp: 1 }); return out; }
// (the world's part, once a year however many players: the fleets built up and repaired, and those at war with no
//  player home to their own waters)
function foeNavies(g, ids) {
  C.foeFleets ||= {};
  const warAny = id => C.mp ? humans().some(h => { const sl = sliceOf(h); return !!(sl && (h === C.me ? C.E.war : sl.war || {})[id]); }) : atWar(id);
  for (const id of ids) {
    const n = NAVY[id] | 0; if (!n) continue; let F = C.foeFleets[id];
    const home = citiesOfNow(g, id).sort((a, b) => b[3] - a[3]).map(ct => harbourOf(ct, true)).find(Boolean); if (!home) { delete C.foeFleets[id]; continue; }
    if (!F) { if (R() < 0.25 || C.year <= 1684) C.foeFleets[id] = { pos: home, ships: navyMix(id, Math.max(1, Math.ceil(n * 0.7))) }; continue; }
    for (const s of F.ships) s.hp = Math.min(1, s.hp + 0.2);
    if (F.ships.length < n && R() < 0.3) F.ships.push(navyMix(id, 3)[F.ships.length % 3]);
    // (two players at war with it: it goes after the one whose fleet lies nearest)
    F.prey = C.mp ? humans().map(h => { const sl = sliceOf(h), w = sl && (h === C.me ? C.E.war : sl.war || {})[id], L = w ? (sl.fleets || []).filter(f => f.ships.length) : []; return [h, L.length ? Math.min(...L.map(f => dist2(f.pos, F.pos))) : Infinity]; }).filter(x => x[1] < Infinity).sort((a, b) => a[1] - b[1]).map(x => x[0])[0] || null : null;
    if (!warAny(id) && dist2(F.pos, home) > 6) { const p = seaPath(g, F.pos, home); if (p) { const st = sailAlong(p, SAIL * 0.6); F.pos = { x: st.at.x, y: st.at.y }; } }
  }
}
// (each player's part: a crown's fleet at war with this player after this player's nearest fleet — one hunt a year, so in
//  a campaign of two a fleet at war with both goes after one of them, not both)
function navyHunt(g, ids) {
  const mine = (C.fleets || []).filter(f => f.ships.length); if (!mine.length) return;
  for (const id of ids) {
    const F = C.foeFleets && C.foeFleets[id]; if (!F || !F.ships.length || !atWar(id) || F.hunt === C.year || (C.mp && F.prey !== C.me)) continue;
    const tg = mine.reduce((b, f) => (dist2(f.pos, F.pos) < dist2(b.pos, F.pos) ? f : b)), p = seaPath(g, F.pos, tg.pos); if (!p) continue;
    const st = sailAlong(p, SAIL * 0.8); F.pos = { x: st.at.x, y: st.at.y }; F.hunt = C.year;
    if (st.arrived && gunsOf(F.ships) > gunsOf(tg.ships) * 0.7 && R() < 0.6 && !C.events.some(e => !e.done && e.kind === "seabattle" && e.foe === id)) C.events.push({ kind: "seabattle", foe: id, fid: tg.id });
  }
}
// (an enemy fleet your fleet can fall on this year)
function canSeaFight(fid, foe) {
  const f = fleetById(fid), F = C.foeFleets && C.foeFleets[foe]; if (!f || !F || f.moved || !f.ships.length || !F.ships.length || !atWar(foe)) return false;
  if (dist2(f.pos, F.pos) > SAIL * 1.6) return false;
  const p = seaPath(grid(), f.pos, F.pos); return !!p && sailAlong(p).arrived;
}
// (the other player's fleet, at war: one of yours can fall on it if it's within a year's sailing)
function canSeaFightP(fid, h, hf) {
  const f = fleetById(fid), sl = C.mp && sliceOf(h), F = sl && (sl.fleets || []).find(x => x.id === hf);
  if (!f || !F || f.moved || !f.ships.length || !F.ships.length || !atWar(h)) return false;
  if (dist2(f.pos, F.pos) > SAIL * 1.6) return false;
  const p = seaPath(grid(), f.pos, F.pos); return !!p && sailAlong(p).arrived;
}
// a battle between two players' fleets, fought by their admirals: each side's losses, the prizes, and the regiments
//  aboard lost with their ships — told to both
function pvpSea(fid, h, hf) {
  const f = fleetById(fid), F = sliceOf(h).fleets.find(x => x.id === hf), me = C.me;
  f.pos = { x: F.pos.x + 0.6, y: F.pos.y + 0.6 }; f.moved = true; f.go = null; syncAboard(f);
  const won = R() < odds(gunsOf(f.ships) * 1.05, gunsOf(F.ships), false), res = autoSea(f.ships, F.ships, won);
  const keep = L => L.filter(s => !s.sunk && !s.struck).map(s => ({ k: s.k, hp: Math.max(0.1, s.hp) })), taken = L => L.filter(s => s.struck).map(s => ({ k: s.k, hp: Math.max(0.2, s.hp) }));
  const sunk = L => L.filter(s => s.sunk).length, line = (w, a, b, pa, pb) => !sunk(a) && !sunk(b) && !pa && !pb ? "neither side loses a ship, though both are badly knocked about." : `${sunk(b)} of theirs sunk${pa ? `, ${pa} taken as prize${pa > 1 ? "s" : ""}` : ""}; ${sunk(a)} of yours sunk${pb ? `, ${pb} taken` : ""}.`;
  const toMe = won ? taken(res.theirs) : [], toThem = won ? [] : taken(res.mine);
  const side = (fl, ships, title, body) => { const cap = fleetCap(fl); fl.ships = ships; say(title, body); drownAboard(fl, cap); if (!fl.ships.length) C.fleets = C.fleets.filter(x => x !== fl); moraleMove(title.startsWith("Victory") ? 6 : -6); };
  side(f, [...keep(res.mine), ...toMe], won ? "Victory at sea" : "Beaten at sea", `Against ${poss(nameOf(h))} ${fleetName(F).toLowerCase()}: ${line(won, res.mine, res.theirs, toMe.length, toThem.length)}`);
  as(h, () => side(F, [...keep(res.theirs), ...toThem], won ? "Beaten at sea" : "Victory at sea", `${poss(nameOf(me))} ${fleetName(f).toLowerCase()} fell on yours: ${line(!won, res.theirs, res.mine, toThem.length, toMe.length)}`));
  tell(h, { note: `${poss(nameOf(me))} fleet fell on yours: ${won ? "beaten at sea" : "a victory at sea"}. See the year's news.`, sfx: [["guns", 0.6]] });
  return won;
}
// a battle at sea decided by your admirals: the weight of each side's broadsides, and luck
function autoSea(mine, theirs, won) {
  const hurt = (L, lose) => L.map(s => { const hp = s.hp - (lose ? 0.25 + R() * 0.55 : 0.05 + R() * 0.25), r = R(); if (hp <= 0.05 || (lose && r < 0.55)) { const sunk = hp <= 0.05 || r < 0.2; return { k: s.k, hp: Math.max(0, hp), sunk, struck: !sunk }; } return { k: s.k, hp, sunk: false, struck: false }; });
  return { won, mine: hurt(mine, !won), theirs: hurt(theirs, won) };
}
// the battle's outcome on the campaign: ships lost, prizes taken, the armies aboard drowned with their ships
function seaEnd(fid, foe, res) {
  const f = fleetById(fid), F = C.foeFleets && C.foeFleets[foe]; if (!f || !F) return;
  const capBefore = fleetCap(f), keep = L => L.filter(s => !s.sunk && !s.struck).map(s => ({ k: s.k, hp: Math.max(0.1, s.hp) })), taken = L => L.filter(s => s.struck).map(s => ({ k: s.k, hp: Math.max(0.2, s.hp) }));
  f.ships = keep(res.mine); F.ships = keep(res.theirs);
  const prizes = res.won ? taken(res.theirs) : [], lostTo = res.won ? [] : taken(res.mine);
  f.ships.push(...prizes); F.ships.push(...lostTo);
  const sunkM = res.mine.filter(s => s.sunk).length, sunkT = res.theirs.filter(s => s.sunk).length;
  say(res.won ? `Victory at sea` : res.left ? `Your fleet breaks off the action` : `Beaten at sea`, `Against ${poss(the(foe))} fleet: ${!sunkT && !sunkM && !prizes.length && !lostTo.length ? "neither side loses a ship, though both are badly knocked about." : `${sunkT} of theirs sunk${prizes.length ? `, ${prizes.length} taken as prize${prizes.length > 1 ? "s" : ""}` : ""}; ${sunkM} of yours sunk${lostTo.length ? `, ${lostTo.length} taken` : ""}.`}`);
  // (the regiments aboard ships that went down or were taken: lost with them)
  drownAboard(f, capBefore);
  if (!f.ships.length) C.fleets = C.fleets.filter(x => x !== f);
  if (!F.ships.length) delete C.foeFleets[foe];
  else if (res.won) { const h = citiesOfNow(grid(), foe).map(ct => harbourOf(ct, true)).find(Boolean); if (h) { const p = seaPath(grid(), F.pos, h); if (p) { const st = sailAlong(p, 60); F.pos = { x: st.at.x, y: st.at.y }; } } }
  moraleMove(res.won ? 6 : -6);
}
// (the regiments aboard ships that went down or were taken: lost with them)
function drownAboard(f, capBefore) {
  const capAfter = fleetCap(f), fid = f.id;
  eachArmy(id => {
    if (C.emb !== fid) return;
    if (!f.ships.length) { const n = field().length; C.units = C.units.filter(u => u.at || (u.ar | 0) !== (C.ar | 0)); C.army = 0; C.emb = null; say(`${n} regiments lost at sea`, `Every ship that carried ${id ? `the ${armyName(id).toLowerCase()}` : "your army"} is sunk or taken.`); }
    else if (capAfter < capBefore) { const k = 1 - capAfter / capBefore, n0 = C.army; wearUnits(C.army * k * 0.8); say(`Regiments lost at sea`, `${n0 - C.army} regiments go down with their ships.`); }
  });
}
// (a battle at sea fought by your hand: the two fleets, and your colours and theirs)
function seaFight(fid, foe, attack, onDone) {
  const f = fleetById(fid), F = C.foeFleets[foe], ct = nearTown(f.pos);
  navalBattle({ title: `Off ${ct[0]}`, sub: attack ? `Your ${fleetName(f).toLowerCase()} falls on ${poss(the(foe))} fleet.` : `${poss(The(foe))} fleet falls on your ${fleetName(f).toLowerCase()}.`, mine: f.ships.map(s => ({ ...s })), theirs: F.ships.map(s => ({ ...s })), myColor: NATIONS[C.me].color, theirColor: NATIONS[foe].color, myName: NATIONS[C.me].name, theirName: NATIONS[foe].name, onEnd: r => onDone(r) });
}
// ---- a battle in the open field: your army falls on an enemy army on the march, wherever it stands ----
// (an enemy army you can fall on: at war, this side of the ocean, within a year's march of the army in hand)
function canField(id) {
  const fp = !isHuman(id) && atWar(id) && foeArmyPos(id); if (!fp || C.moved || C.siege || C.army < 5 || (C.foes[id] | 0) < 3) return false;
  return !overSea(armyPos(), fp) && yearsTo(fp) <= 1;
}
// (the town nearest the field, to name the battle after and give it its country)
const nearTown = p => CITIES.reduce((b, ct) => { const d = dist2(cellXY(ct), p); return !b || d < b[1] ? [ct, d] : b; }, null)[0];
function fieldOf(id) { const fp = foeArmyPos(id); return { attack: true, field: true, foe: id, ct: nearTown(fp), att: C.army, def: Math.max(3, Math.round((C.foes[id] | 0) * 0.85)), walls: false, at: { x: fp.x, y: fp.y } }; }
// the field battle decided: the losses both ways; the beaten army thrown back, its march broken
function fieldEnd(o, won, myLossK, theirLossK) {
  const mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att;
  const broken = wearUnits(mine * myLossK, o.pick) || {};
  for (const u of field()) if (!o.pick || (o.pick.men && o.pick.men[u.k])) u.xp = Math.min(3, (u.xp || 0) + (won ? 0.6 : 0.3) * (o.pick ? 1 : 0.6));
  C.foes[o.foe] = Math.max(0, Math.round((C.foes[o.foe] | 0) - theirs * theirLossK - (won ? theirs * 0.06 : 0)));
  const near = o.ct[0], h = homeOf(grid(), o.foe), fp = foeArmyPos(o.foe); C.moved = true; C.go = null;
  if (won) {
    if (h && fp) { const b = stepToward(fp, h, 8); C.foePos[o.foe] = { x: b.x, y: b.y }; } if (C.foeGo) delete C.foeGo[o.foe];
    moraleMove(10); genWin(); say(`Victory in the field near ${near}`, `${o.attack ? "" : "Your army stands its ground. "}${poss(The(o.foe))} army is broken and falls back toward home, ${C.foes[o.foe]} regiments left to it. Its march is stopped.`);
  } else {
    const mh = homeOf(grid(), C.me); if (mh) { const b = stepToward(armyPos(), mh, 4); C.pos = { x: b.x, y: b.y }; }
    moraleMove(-12); say(`Beaten in the field near ${near}`, `Your army falls back with what it has left: ${armyStr()}.`);
  }
  if (Object.keys(broken).length) say(`Regiments broken near ${near}`, `${Object.entries(broken).map(([k, c]) => `${c} of ${TROOPS[k].name.toLowerCase()}`).join(", ")}: too few men left to stand as regiments, they are struck off the roll.`);
  if (C.gen && R() < (won ? 0.04 : 0.2)) { moraleMove(-10); say(`${C.gen.name} falls near ${near}`, "Killed at the head of his men."); C.gen = null; needGeneral(); }
  if (!won && C.guns > 0 && R() < 0.5) C.guns--;
}
// ---- the muster before a battle you fight yourself: how many of your army take the field, and of which arms ----
const MUST_KINDS = ["musketeer", "grenadier", "pike", "sword", "axe", "bow", "crossbow", "cavalry"];
function musterFor(o) {
  const mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att, theirMen = clamp(Math.round(10 + theirs / 2.2), 10, 48);
  musterScreen({
    title: o.field ? (o.attack ? `Attack ${poss(the(o.foe))} army` : `Stand against ${poss(the(o.foe))} army`) : o.convoy ? `Escort the supply train to ${o.ct[0]}` : o.attack ? `March on ${o.ct[0]}` : `Hold ${o.ct[0]}`, regs: mine,
    foe: o.field ? `${poss(The(o.foe))} army can field about ${theirMen}, on open ground near ${o.ct[0]}.` : o.convoy ? `${poss(The(o.foe))} raiders, about ${theirMen}, most of them horse, are out to take or burn your ${o.carts} wagons.` : `${The(o.foe)} can field about ${theirMen}${o.walls ? (o.attack ? ", behind their walls" : "; your walls are with you") : ""}.${o.attack && isVillage(o.ct) ? " They'll hold their town behind its palisade: go in by the way in, or set a length of it alight and go through when it's burnt." : ""}`,
    onGo: P => fight({ ...o, pick: P }), guns: !o.attack && !o.field && o.army === false ? (o.walls ? 2 : 0) : C.guns | 0, town: o.attack || o.field ? null : o.ct[0],
    // (a march you've ordered, called off before the battle: the army stays in camp, free to march again this year)
    onCancel: o.attack && !o.convoy ? () => doAct({ k: "calloff" }) : null,
    onAuto: C.mp ? null : () => {
      // (the generals fight it instead — as if you'd left it to them from the first)
      C.pending = null; if (o.field) { const w = R() < odds((o.attack ? o.att : o.def) * cmdMul(C.gen) * moraleK() * (1 + vetK()), (o.attack ? o.def : o.att) * cmdMul(genOf(o.foe)), false); fieldEnd(o, w, w ? 0.12 : 0.3, w ? 0.35 : 0.12); persist(); note = C.log.find(l => /field/.test(l.title)).title + "."; sfx("guns", 0.5); drawMap(); return; } if (o.convoy) { convoyEnd(o, R() < odds(o.def * cmdMul(C.gen) * moraleK(), o.att, false), 0.15, 0.2); persist(); drawMap(); return; } const won = auto(o); persist();
      note = won ? (o.attack ? `${o.ct[0]} is yours.` : `${o.ct[0]} holds.`) : (o.attack ? `The attack on ${o.ct[0]} failed.` : `${o.ct[0]} has fallen.`);
      sfx("guns", 0.5); if (won) sfx("bell", 0.4, 1600); drawMap();
    },
  });
}
// the muster itself: { title, regs (your regiments), foe (a line on the other side), onGo(pick), onAuto (or none) }
function musterScreen({ title, regs, foe, onGo, onAuto, onCancel = null, guns = null, town = null }) {
  const cap = fieldMen(regs), gunCap = Math.min(4, guns ?? fieldGuns(regs)), kc = kindCaps(regs, town), kinds = MUST_KINDS.filter(k => kc[k]);
  const share = n => { const m = {}, tot = Object.values(kc).reduce((t, v) => t + v, 0) || 1; let left = n; for (const k of kinds) { m[k] = Math.min(kc[k], Math.round(n * kc[k] / tot)); left -= m[k]; } for (const k of kinds) { const d = Math.min(left, kc[k] - m[k]); if (d > 0) { m[k] += d; left -= d; } } return m; };
  const first = share(clamp(Math.round(10 + regs / 2.2), 10, cap));
  const P = { men: Object.fromEntries(MUST_KINDS.map(k => [k, first[k] | 0])), guns: gunCap };
  let el = $("cmpMust"); if (!el) { el = document.createElement("div"); el.id = "cmpMust"; el.className = "cmp-must"; $("campaign").appendChild(el); }
  const total = () => MUST_KINDS.reduce((t, k) => t + P.men[k], 0);
  const draw = () => {
    const n = total();
    el.innerHTML = `<div class="cmp-mbox"><h2>${esc(title)}</h2>
      <p class="sub">Who takes the field? Your ${regs} regiments can put up to <b>${cap}</b> men in it and ${gunCap ? `${gunCap} gun${gunCap > 1 ? "s" : ""}` : "no guns"}. ${esc(foe)}</p>
      <div class="cmp-mrows">${kinds.map(k => { const T = TROOPS[k], full = n >= cap || P.men[k] >= kc[k]; return `<div class="cmp-mrow">${unitImg(k, "sm")}<span><b>${T.name}</b><small>${esc(T.note)} · up to ${kc[k]}, from your regiments${(() => { const L = field().filter(u => u.k === k), x = L.length ? L.reduce((t, u) => t + (u.xp || 0), 0) / L.length : 0, ch = Math.floor(x + 0.25); return ch ? ` · <em class="cmp-chev">${"❯".repeat(ch)}</em>` : ""; })()}</small></span><span class="cmp-step"><button data-mk="${k}" data-d="-5">−5</button><button data-mk="${k}" data-d="-1">−</button><em>${P.men[k]}</em><button data-mk="${k}" data-d="1"${full ? " disabled" : ""}>+</button><button data-mk="${k}" data-d="5"${full ? " disabled" : ""}>+5</button></span></div>`; }).join("")}
      ${gunCap ? `<div class="cmp-mrow"><span><b>Guns</b><small>Field gun, two crew</small></span><span class="cmp-step"><button data-mk="guns" data-d="-1">−</button><em>${P.guns}</em><button data-mk="guns" data-d="1"${P.guns >= gunCap ? " disabled" : ""}>+</button></span></div>` : ""}</div>
      <div class="cmp-mtot"><em><b>${n}</b> of ${cap} men${P.guns ? ` · ${P.guns} gun${P.guns > 1 ? "s" : ""}` : ""}</em><span><button class="tm-lnk" data-mp="army">As your army stands</button> · <button class="tm-lnk" data-mp="all">All you can</button> · <button class="tm-lnk" data-mp="none">Clear</button></span></div>
      <div class="pv-acts"><button class="btn primary" data-mgo="1"${n < 5 ? " disabled" : ""}>${n < 5 ? "Take at least 5 men" : "To the field"}</button>${onAuto ? `<button class="btn ghost" data-mauto="1">Leave it to your generals</button>` : ""}${onCancel ? `<button class="btn ghost" data-mcancel="1">Call off the march</button>` : ""}</div></div>`;
  };
  el.onclick = e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.mk) {
      const d = +b.dataset.d;
      if (b.dataset.mk === "guns") P.guns = clamp(P.guns + d, 0, gunCap);
      else { const k = b.dataset.mk; P.men[k] = clamp(P.men[k] + Math.min(d, cap - total()), 0, kc[k] | 0); }
      sfx("parchment", 0.18); draw(); return;
    }
    if (b.dataset.mp) {
      const m = b.dataset.mp === "none" ? {} : share(b.dataset.mp === "all" ? cap : clamp(Math.round(10 + regs / 2.2), 10, cap));
      for (const k of MUST_KINDS) P.men[k] = m[k] | 0; if (b.dataset.mp === "all") P.guns = gunCap; sfx("quill", 0.3); draw(); return;
    }
    if (b.dataset.mgo) { el.remove(); sfx("drum", 0.5); const men = {}; for (const k of MUST_KINDS) if (P.men[k]) men[k] = P.men[k]; onGo({ men, guns: P.guns }); return; }
    if (b.dataset.mauto && onAuto) { el.remove(); onAuto(); }
    if (b.dataset.mcancel && onCancel) { el.remove(); onCancel(); }
  };
  draw(); sfx("parchment", 0.4);
}
// (how many of each arm can take the field: the army's men in proportion to its regiments of each — and a town's
//  garrison, when it's defended, standing with them as musketeers)
function kindCaps(regs, town = null) {
  reconcile(); const cap = fieldMen(regs), have = {};
  for (const u of [...field(), ...(town ? garUnits(town) : [])]) have[u.k] = (have[u.k] || 0) + u.hp;
  const gar = Math.max(0, regs - Object.values(have).reduce((t, v) => t + v, 0)); if (gar > 0.5) have.musketeer = (have.musketeer || 0) + gar;
  const tot = Object.values(have).reduce((t, v) => t + v, 0) || 1, out = {};
  for (const [k, v] of Object.entries(have)) if (v > 0.2) out[k] = Math.max(1, Math.round(cap * v / tot));
  if (!Object.keys(out).length) out.musketeer = cap;
  return out;
}
// (a muster sent from the other player's screen: held to what their army can field)
function fairPick(p, regs, crown) {
  const cap = fieldMen(regs), men = {}, kc = as(crown, () => kindCaps(regs)); let n = 0;
  for (const k of MUST_KINDS) { const v = clamp((p && p.men && p.men[k]) | 0, 0, Math.min(cap - n, kc[k] | 0)); if (v) { men[k] = v; n += v; } }
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
  if (!freeToStrike(ct) || !foe || !atWar(foe) || C.army < 5 || !inMarch(ct)) return null;
  const was = !!C.moved; C.moved = true; C.go = null; C.aslt = C.year;
  return { was, attack: true, foe, ct, att: C.army, def: defOf(g, ct, foe), walls: hasWalls(ct, foe, g), breach: !!S && S.bat >= 1, battered: S ? S.bat : 0, siege: !!S };
}
// ---- a siege: the army sat down before a walled town, year after year — the garrison starving, the guns battering the
//  walls, sickness in the camp; until the town gives in, or is stormed through the breach, or a relief army comes ----
const siegeOf = ct => C.siege && C.siege.ct === (Array.isArray(ct) ? ct[0] : ct) ? C.siege : null;
// what holds a town: its garrison (starved by a siege), and the part of its crown's army that can be brought to it (a
//  besieged town's field army is outside the lines, not in it — half of it)
// (how much of a crown's field army can come to a town's help: most of it — unless the army's on the other side of the
//  Atlantic, when only the colony's own few companies can)
function fieldHelp(foe, ct) {
  const at = isHuman(foe) ? (sliceOf(foe) || {}).pos : foeArmyPos(foe), far = at && isFinite(at.x) && overSea(at, cellXY(ct));
  return Math.round(foeArmy(foe) * (far ? 0.12 : isHuman(foe) ? 0.7 : 0.65));
}
function defOf(g, ct, foe) {
  const S = siegeOf(ct), gar = Math.round(garrison(ct) * (1 - (S ? S.starve : 0)));
  return gar + Math.round(fieldHelp(foe, ct) * (S ? 0.5 : 1)) + (isHuman(foe) ? levy(citiesOfNow(g, foe).length) : 0);
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
    say(`The supply train is taken`, `${poss(The(o.foe))} raiders fall on it on the road to ${o.ct[0]}: the wagons burned or carried off, ${lost} regiments of the escort lost.`);
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
// ---- the people and the regiments, as the great campaigns of the age were run: every town its souls, growing as its
//  land feeds them; and the army a roll of regiments, each raised in one town — musketeers anywhere, grenadiers where
//  there's a drill yard, horse where there are horses — from its men, for the treasury's thalers. A regiment takes a
//  year to arm and drill. Worn down in battle and by sickness, the regiments fill their ranks again from the towns,
//  fastest at home ----
const POP0 = [0, 8000, 24000, 70000];
const hashN = t => { let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const popBase = ct => Math.round(POP0[ct[3]] * (0.7 + (hashN(ct[0]) % 600) / 1000) / 100) * 100;
// (as many as its land can feed: more with its farms improved, a few more with trade)
const popCap = ct => Math.round(popBase(ct) * (1.3 + lvOf(ct[0], "farm") * 0.35 + lvOf(ct[0], "trade") * 0.1) / 100) * 100;
const popOf = ct => { C.pop ||= {}; return C.pop[ct[0]] ??= popBase(ct); };
// (the fewest a town can be left with by the recruiting sergeants: the men to bring the harvest in)
const popFloor = ct => Math.round(popBase(ct) * 0.3);
// (the crown's taxes: light, fair or heavy — more for the treasury the heavier, and the people slower to grow)
const TAX = [{ n: "Light", k: 0.75, g: 0.008 }, { n: "Fair", k: 1, g: 0 }, { n: "Heavy", k: 1.25, g: -0.01 }];
const taxOf = id => { const s2 = id && (id === C.me || isHuman(id)) ? sliceOf(id) : null; return TAX[s2 && s2.tax != null ? s2.tax : 1]; };
const popRate = (ct, o = cityOwner(grid(), ct)) => { const p = popOf(ct), cap = popCap(ct); if (p > cap) return -0.02; return (0.018 + lvOf(ct[0], "farm") * 0.01 + (lvOf(ct[0], "trade") ? 0.004 : 0)) * (1 - p / cap * 0.6) + taxOf(o).g; };
const fmtN = n => Math.round(n).toLocaleString("en-GB");
// what each kind of regiment costs, the men it takes from its town, its upkeep a year, and what it needs to be raised
const UNIT = {
  musketeer: { cost: 30, men: 600, up: 1.6 },
  pike: { cost: 22, men: 600, up: 1.2 },
  sword: { cost: 28, men: 450, up: 1.5 },
  grenadier: { cost: 44, men: 450, up: 2.2, need: ct => lvOf(ct[0], "army") >= 1, why: "a drill yard" },
  cavalry: { cost: 52, men: 350, up: 2.6, need: ct => ct[3] >= 2 || lvOf(ct[0], "farm") >= 1, why: "a city, or developed farms to breed the horses" },
  bow: { cost: 18, men: 600, up: 1.0 },
  axe: { cost: 20, men: 600, up: 1.1 },
  crossbow: { cost: 24, men: 600, up: 1.2 },
};
const kindsOf = id => STYLE[styleOf(id)].map(([k]) => k);
// (how each arm fights, out of five: its fire, its hand-to-hand, its pace, and how it stands against horse)
const RATE = { musketeer: [4, 2, 2, 2], grenadier: [4, 3, 2, 2], pike: [0, 3, 2, 5], sword: [1, 4, 3, 2], axe: [0, 4, 2, 1], bow: [3, 1, 3, 1], crossbow: [3, 2, 2, 1], cavalry: [1, 4, 5, 3] };
const RATE_N = ["Fire", "Melee", "Pace", "Against horse"];
// a regiment's card, large: its plate, its arms, what it costs and keeps, how it fights, and yours of it
function unitCard(k) {
  let el = $("cmpUnit"); if (!el) { el = document.createElement("div"); el.id = "cmpUnit"; el.className = "cmp-must"; $("campaign").appendChild(el); el.onclick = e => { if (e.target === el || e.target.closest("[data-ux]")) el.remove(); }; }
  const T = TROOPS[k], U = UNIT[k] || UNIT.musketeer, R = RATE[k] || [2, 2, 2, 2], mine = field().filter(u => u.k === k), gar = (C.units || []).filter(u => u.k === k && u.at);
  const xp = mine.length ? mine.reduce((t, u) => t + (u.xp || 0), 0) / mine.length : 0, full = mine.length ? Math.round(mine.reduce((t, u) => t + u.hp, 0) / mine.length * 100) : 0;
  el.innerHTML = `<div class="cmp-mbox cmp-ucard">${unitArt(k) ? `<img src="${unitArt(k)}" alt="">` : ""}<div><h2>${esc(T.name)}</h2><p class="sub">${esc(T.note)}</p>
    <div class="cmp-urates">${R.map((v, i) => `<span><small>${RATE_N[i]}</small><i>${"●".repeat(v)}${"○".repeat(5 - v)}</i></span>`).join("")}</div>
    <p>${U.men} men to a regiment, raised for ${unitCost(k)} thalers and kept for ${U.up} a year.${U.need ? ` Raised only in a town with ${esc(U.why)}.` : ""}</p>
    <p>${mine.length ? `In your army: ${mine.length} regiment${mine.length > 1 ? "s" : ""}, ${full}% of full strength${xp >= 0.75 ? `, ${["", "blooded", "seasoned", "veterans"][Math.min(3, Math.floor(xp + 0.25))]}` : ""}.` : "None in your army."}${gar.length ? ` ${gar.length} more holding your towns.` : ""}</p>
    <div class="pv-acts"><button class="btn" data-ux="1">Close</button></div></div></div>`;
}
// (each kind's picture, as its crown's way of war dresses it: a uniform plate of the time — unitart.js)
const unitArt = (k, id = C.me) => plateOf(styleOf(id), k);
const unitImg = (k, cls = "", id = C.me) => { const a = unitArt(k, id); return a ? `<img class="cmp-uimg ${cls}" src="${a}" alt="" loading="lazy">` : `<span class="cmp-uimg none ${cls}"></span>`; };
// (the regiments a town can raise in a year: one a town, two a city, three a great one; a barracks one more)
const slotsOf = ct => ct[3] + (lvOf(ct[0], "army") >= 2 ? 1 : 0);
const unitCost = (k, g = grid()) => Math.max(8, UNIT[k].cost - (REGIMENT - regCost(g)));
const raising = n => (C.lq || []).filter(q => q.t === n);
// (the roll, from what a save had before: its regiments as the crown's way of war made them up)
function ensureUnits() { if (C.units) return; const m = muster(C.me, C.army | 0); C.units = []; for (const [k, n] of Object.entries(m)) for (let i = 0; i < n; i++) C.units.push({ k, hp: 1 }); C.lq ||= []; }
// (the field army: the regiments not left in a town's garrison)
const field = () => (C.units || []).filter(u => !u.at && (u.ar | 0) === (C.ar | 0));
// ---- more than one army: each its own place, march, siege, general and spirit. The one you're giving orders to stands in
//  the campaign's own fields (C.pos, C.go, C.army…); the others wait in C.armies, and are swapped in when chosen ----
const AKEYS = ["pos", "go", "moved", "siege", "army", "gen", "morale", "supplied", "sailed", "emb", "aslt"];
const armyIds = () => [C.ar | 0, ...(C.armies || []).map(a => a.id)].sort((a, b) => a - b);
function useArmy(id) {
  id |= 0; if (id === (C.ar | 0)) return; const t = (C.armies || []).find(a => a.id === id); if (!t) return;
  const cur = { id: C.ar | 0 }; for (const k of AKEYS) cur[k] = C[k];
  C.armies = C.armies.filter(a => a.id !== id); C.armies.push(cur);
  for (const k of AKEYS) C[k] = t[k]; C.ar = id;
}
// (each of your armies in turn, as the one in hand — and back to the one you had)
function eachArmy(fn) { const was = C.ar | 0, out = []; for (const id of armyIds()) { useArmy(id); out.push(fn(id)); } useArmy(was); return out; }
const armyName = id => id ? `${["", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"][id] || `${id + 1}th`} army` : "Main army";
// (the whole of your field armies' strength, all of them together)
const allArmies = () => (C.army | 0) + (C.armies || []).reduce((t, a) => t + (a.army | 0), 0);
const allField = () => (C.units || []).filter(u => !u.at);
// (the nearest of your armies to a place, within a year's march and this side of the ocean: its id, or null)
function nearestArmy(t) { let best = null, bd = 1e9; eachArmy(id => { const p = armyPos(); if (C.siege || overSea(p, t) || yearsTo(t) > 1) return; const d = dist2(p, t); if (d < bd) { bd = d; best = id; } }); return best; }
// a new army formed at a town, out of its garrison: there, ready to march; no general until you choose one
function formArmy(n) {
  const ct = CITIES.find(c => c[0] === n); if (!ct || cityOwner(grid(), ct) !== C.me) return "That isn't your town.";
  const G = garUnits(n); if (!G.length) return "The town has no regiments to form an army from.";
  if ((C.armies || []).length >= 5) return "You have armies enough to command.";
  const id = Math.max(...armyIds()) + 1, t = cellXY(ct);
  for (const u of G) { delete u.at; u.ar = id; }
  // (beside the town, a little off any army of yours already standing in it)
  const crowd = dist2(armyPos(), t) < 1.5 || (C.armies || []).some(a => a.pos && dist2(a.pos, t) < 1.5);
  (C.armies ||= []).push({ id, pos: { x: t.x + (crowd ? 1.8 : 0), y: t.y + (crowd ? 0.8 : 0) }, go: null, moved: false, siege: null, army: Math.round(G.reduce((s2, u) => s2 + u.hp, 0)), gen: null, morale: 50, supplied: false, sailed: 0 });
  useArmy(id); persist(); return null;
}
// (the army in hand split in two where it stands: half of each arm marched off as an army of its own)
function splitArmy() {
  reconcile(); const F = field(); if (F.length < 4) return "Too few regiments to split.";
  if (C.siege) return "Not while it's besieging a town."; if ((C.armies || []).length >= 5) return "You have armies enough to command.";
  const id = Math.max(...armyIds()) + 1, by = {}; for (const u of F) (by[u.k] ||= []).push(u);
  let n = 0; for (const L of Object.values(by)) for (const u of L.slice(0, Math.floor(L.length / 2))) { u.ar = id; n++; }
  if (!n) return "Too few regiments to split."; const p = armyPos(), moved = C.moved;
  const str = Math.round(C.units.filter(u => !u.at && u.ar === id).reduce((t, u) => t + u.hp, 0)); C.army = Math.round(unitSum());
  (C.armies ||= []).push({ id, pos: { x: p.x + 1.8, y: p.y + 0.8 }, go: null, moved, siege: null, army: str, gen: null, morale: C.morale ?? 50, supplied: false, sailed: 0 });
  useArmy(id); persist(); return null;
}
// (two of your armies in one place: the one in hand marched into the other, and gone)
function joinArmy() {
  const here = armyPos(), o = (C.armies || []).find(a => a.pos && dist2(a.pos, here) <= 3 && !a.siege); if (!o) return "No other army of yours stands here.";
  const from = C.ar | 0; useArmy(o.id); for (const u of C.units) if (!u.at && (u.ar | 0) === from) u.ar = o.id;
  C.armies = C.armies.filter(a => a.id !== from); C.army = Math.round(unitSum()); persist(); return null;
}
const unitSum = () => field().reduce((t, u) => t + u.hp, 0);
// (the army said as the roll has it: its regiments, and — when their ranks are thin — what they come to at full strength)
const armyStr = () => { const n = field().length, s = Math.round(C.army); return n && n - s >= 1 ? `${n} regiments (${s} at full strength)` : `${s} regiments`; };
// (a town's own regiments, left there to hold it)
const garUnits = (n, units = C.units) => (units || []).filter(u => u.at === n);
// (the army's strength changed by the war — battles, sickness, desertion, fresh men — the roll brought into line with it:
//  losses through all the regiments; fresh men first into the thin ones' ranks, then new regiments of foot)
function reconcile() {
  if (!C || !C.me) return;
  if (!C.units) { ensureUnits(); return; }
  const F = field(), s = unitSum(); if (Math.abs((C.army | 0) - s) < 0.5) return;
  if (C.army < s) { const f = Math.max(0, C.army) / s; for (const u of F) u.hp *= f; C.units = C.units.filter(u => u.at || u.hp >= 0.12); }
  else { let add = C.army - s; for (const u of F) { const d = Math.min(1 - u.hp, add); u.hp += d; add -= d; } while (add >= 0.5) { C.units.push({ k: kindsOf(C.me)[0], hp: Math.min(1, add) }); add -= 1; } }
  C.army = Math.round(unitSum());
}
// (a battle's losses: borne by the arms that fought it — in proportion to how many of each went into the field)
function wearUnits(loss, pick) {
  reconcile(); const F = field(); if (!F.length || loss <= 0) { C.army = Math.max(0, Math.round(C.army - loss)); reconcile(); return; }
  const have = {}; for (const u of F) have[u.k] = (have[u.k] || 0) + u.hp;
  const w = u => pick && pick.men ? (pick.men[u.k] | 0) / have[u.k] * u.hp : u.hp;
  let left = loss;
  for (let pass = 0; pass < 3 && left > 0.01; pass++) {
    const tw = F.reduce((t, u) => t + (u.hp > 0 ? (pass ? u.hp : w(u)) : 0), 0); if (tw <= 0) continue;
    const L = left; for (const u of F) { if (u.hp <= 0) continue; const d = Math.min(u.hp, L * (pass ? u.hp : w(u)) / tw); u.hp -= d; left -= d; }
  }
  const broken = {}; for (const u of F) if (u.hp < 0.12) broken[u.k] = (broken[u.k] || 0) + 1;
  C.units = C.units.filter(u => u.at || u.hp >= 0.12); C.army = Math.round(unitSum());
  return broken;
}
// (the army near enough to a town of yours to take its garrison's regiments in, or leave some there: standing in it, or
//  a few days' march off)
const armyAt = ct => !C.siege && dist2(armyPos(), cellXY(ct)) <= 3;
// (free to fall on a town this year: the army hasn't marched — or it marched up to this town's walls, and hasn't yet
//  attacked anything this year)
// (why the army can't fall on a town now, said plainly)
function whyNot(ct) {
  const o = cityOwner(grid(), ct);
  if (C.emb != null) return "Your army is aboard ship: land it first.";
  if (C.siege && !siegeOf(ct)) return `Your army is besieging ${C.siege.ct}: lift that siege first.`;
  if (o === C.me) return `${ct[0]} is yours.`;
  if (!o || !atWar(o)) return `You're not at war with ${o ? the(o) : "anyone there"}.`;
  if (C.army < 5) return "Your army is too small to attack a town: five regiments at least.";
  if (!inMarch(ct)) return `${ct[0]} is beyond a year's march. March toward it first.`;
  if (C.aslt === C.year) return "Your army has already attacked this year. It can attack again next year.";
  if (!freeToStrike(ct)) return armyAt(ct) ? "Your army has already attacked this year." : "Your army has already marched this year. March up to the town's walls and you can still attack it the same year.";
  return "Your army can't march there now.";
}
const freeToStrike = ct => !C.moved || (armyAt(ct) && C.aslt !== C.year);
// a regiment left in the town: out of the field army, into the garrison — or taken back out again
function station(n, k, out) {
  const ct = CITIES.find(c => c[0] === n); if (!ct || cityOwner(grid(), ct) !== C.me || !armyAt(ct)) return "Your army must stand at the town.";
  reconcile();
  if (out) { const all = !k || k === "*", L = garUnits(n).filter(u => all || u.k === k); if (!L.length) return null; for (const u of all ? L : [L[0]]) { delete u.at; u.ar = C.ar | 0; } }
  else { const L = field().filter(u => u.k === k); if (!L.length) return null; L.reduce((a, b) => (b.hp > a.hp ? b : a)).at = n; }
  C.army = Math.round(unitSum()); persist(); return null;
}
// a regiment raised at one of your towns: the thalers and the men paid now; it joins the army next year
function recruitAt(n, k) {
  const g = grid(), ct = CITIES.find(c => c[0] === n);
  if (!ct || cityOwner(g, ct) !== C.me || !kindsOf(C.me).includes(k) || !UNIT[k]) return "You can't raise that there.";
  if (UNIT[k].need && !UNIT[k].need(ct)) return `${TROOPS[k].name} need ${UNIT[k].why}.`;
  if (raising(n).length >= slotsOf(ct)) return `${n} can raise no more regiments this year.`;
  const c = unitCost(k, g); if (C.gold < c) return "The treasury hasn't the money.";
  if (popOf(ct) - UNIT[k].men < popFloor(ct)) return `${n} hasn't the men to spare.`;
  C.gold -= c; C.pop[n] = popOf(ct) - UNIT[k].men; (C.lq ||= []).push({ t: n, k, c }); C.levyQ = C.lq.length; persist(); return null;
}
// (a regiment disbanded: the thinnest of its kind, its men sent home to the town with the fewest, the upkeep saved)
function disband(k) {
  reconcile(); const L = field().filter(u => u.k === k); if (!L.length) return null;
  const u = L.reduce((a, b) => (b.hp < a.hp ? b : a)); C.units.splice(C.units.indexOf(u), 1); C.army = Math.round(unitSum());
  const t = citiesOfNow(grid(), C.me).sort((a, b) => popOf(a) / popCap(a) - popOf(b) / popCap(b))[0];
  if (t) C.pop[t[0]] = popOf(t) + Math.round(u.hp * ((UNIT[k] || UNIT.musketeer).men));
  persist(); return t ? t[0] : "";
}
// (and called off before the year's out: the money back, the men home)
function unrecruit(n) {
  const L = C.lq || [], i = L.map(q => q.t).lastIndexOf(n); if (i < 0) return;
  const [q] = L.splice(i, 1), ct = CITIES.find(c => c[0] === n); C.gold += q.c | 0; if (ct) C.pop[n] = popOf(ct) + UNIT[q.k].men; C.levyQ = L.length; persist();
}
// the year's end for the people: every town growing (or, where the land's full, falling back); a plague cuts them down;
// a town under siege starves
function peopleYear(g) {
  C.pop ||= {};
  for (const ct of CITIES) {
    const o = cityOwner(g, ct); if (!o) continue;
    let p = popOf(ct); p *= 1 + popRate(ct, o);
    if (C.E.plague && C.E.plague[o]) p *= 0.94;
    if (siegeOf(ct)) p *= 0.95;
    C.pop[ct[0]] = Math.round(Math.max(popFloor(ct) * 0.6, p));
  }
}
// ---- public order: a town's temper — soured by heavy taxes and a great city's crowds, sweetened by light ones, held by
//  regiments in its garrison and by a school or church that keeps its people in hand; a corrupt governor makes it worse.
//  Below zero, it may riot: the year's taxes not paid, some of its people killed or fled ----
function orderOf(ct) {
  const n = ct[0], t = C.tax ?? 1, v = govOf(n);
  return (t === 2 ? -2 : t === 0 ? 1 : 0) - (ct[3] === 3 ? 1 : 0) + Math.min(2, garUnits(n).length) + (lvOf(n, "church") ? 1 : 0) + (v ? (v.st[0] >= 4 ? -1 : v.st[0] <= 1 ? 1 : 0) : 0) + 1;
}
const orderWord = o => o >= 2 ? "Content" : o >= 0 ? "Quiet" : o === -1 ? "Restless" : "Close to rising";
function riots(g) {
  C.riotN ||= {};
  for (const ct of citiesOfNow(g, C.me)) {
    const o = orderOf(ct); if (o >= 0 || R() > 0.2 * -o) { delete C.riotN[ct[0]]; continue; }
    // (a second year of riots in a row: the town rises)
    if ((C.riotN[ct[0]] = (C.riotN[ct[0]] || 0) + 1) >= 2 && !C.events.some(e => !e.done && e.kind === "rising" && e.ct === ct[0])) { C.riotN[ct[0]] = 0; C.events.push({ kind: "rising", ct: ct[0], att: Math.round(popOf(ct) / 4000) + 3 }); }
    const w = Math.round(worth(ct) * TAX[C.tax ?? 1].k); C.gold -= w; C.pop[ct[0]] = Math.round(popOf(ct) * 0.97);
    say(`Riots in ${ct[0]}`, `${C.tax === 2 ? "The heavy taxes" : "The crowds"} drive its people into the streets. The town pays none of its ${w} thalers this year${garUnits(ct[0]).length ? "" : "; a regiment in its garrison would keep order"}.`);
  }
}
// (the army's thin regiments filled up again from your towns: fast at home, slowly abroad, hardly at all in a siege)
function replenish(g, garrisons = true) {
  reconcile(); if (!C.units.length) return;
  const ap = armyPos(), row = g[Math.round(ap.y)], home = row && row[Math.round(ap.x)] === C.me;
  const rate = C.siege ? 0.06 : home ? 0.25 : 0.1, towns = citiesOfNow(g, C.me).sort((a, b) => (popOf(b) - popFloor(b)) - (popOf(a) - popFloor(a)));
  let filled = 0;
  for (const u of C.units) {
    if (u.hp >= 1 || (u.at ? !garrisons : (u.ar | 0) !== (C.ar | 0))) continue;
    const d = Math.min(1 - u.hp, u.at ? 0.25 : rate), men = d * UNIT[u.k].men, t = towns.find(ct => popOf(ct) - men >= popFloor(ct)); if (!t) break;
    C.pop[t[0]] -= Math.round(men); if (u.xp) u.xp = Math.max(0, u.xp * (1 - d / (u.hp + d) * 0.6)); u.hp += d; filled += men;
  }
  C.army = Math.round(unitSum());
  return filled;
}
const income = g => 40 + Math.round(citiesOfNow(g, C.me).reduce((t, ct) => t + worth(ct), 0) * TAX[C.tax ?? 1].k) + Object.keys(C.E.pact).filter(id => C.E.pact[id]).reduce((t, id) => t + 10 + NATIONS[id].strength * 4, 0);
const upkeep = () => shipUp() + Math.round((C.units ? C.units.reduce((t, u) => t + u.hp * (UNIT[u.k] || UNIT.musketeer).up, 0) : C.army * 1.6) * (1 + (C.gen ? C.gen.st[2] : 2) * 0.04));
// diplomacy: what you can do with a crown this season
function diplo(id, what) {
  const r = C.E.rel, did = C.did[id] ||= {};
  const done = t => { did[what] = true; persist(); return t; };
  if (what === "envoy") { if (did.envoy || atWar(id) || C.gold < 40) return null; C.gold -= 40; r[id] = clamp(r[id] + 6 + Math.round(R() * 7), -100, 100); return done(`Your envoy is received at ${courtOf(id)}.`); }
  if (what === "gift") { if (did.gift || atWar(id) || C.gold < 150) return null; C.gold -= 150; r[id] = clamp(r[id] + 18 + Math.round(R() * 8), -100, 100); return done(`${The(id)} ${v3(id, "accepts")} your gift.`); }
  if (what === "pact") { if (atWar(id) || C.E.pact[id] || r[id] < 20) return null; C.E.pact[id] = true; r[id] += 5; return done(NATIONS[id].nw ? `The fur trade with ${the(id)}: beaver pelts down to your posts, kettles, cloth and guns up to their towns.` : `A trade pact with ${the(id)}: their merchants in your towns, yours in theirs.`); }
  if (what === "unpact") { C.E.pact[id] = false; r[id] -= 10; return done(`The trade pact with ${the(id)} ${v3(id, "is")} ended.`); }
  if (what === "ally") { if (atWar(id) || C.ally[id] || r[id] < 55) return null; if (R() < 0.25 + (r[id] - 55) / 60) { C.ally[id] = true; r[id] += 5; return done(`${The(id)} ${v3(id, "is")} your ally: it will join your wars.`); } r[id] -= 3; return done(`${The(id)} won't bind itself to you — not yet.`); }
  if (what === "unally") { C.ally[id] = false; r[id] -= 20; return done(`You break the alliance with ${the(id)}.`); }
  if (what === "war") {
    if (atWar(id) || (C.truce[id] || 0) > 0) return null;
    declare(id, C.me);
    for (const o of Object.keys(r)) r[o] -= C.ally[o] ? 0 : 4;
    return done(`You declare war on ${the(id)}.`);
  }
  // (a town bought from a crown at peace with you, and friendly: its town nearest your lands, never its seat)
  if (what === "buy") {
    const t = buyable(id); if (!t || did.buy || atWar(id)) return null; const price = buyPrice(t);
    if (C.gold < price) return null; did.buy = true;
    if (r[id] >= 40 && R() < 0.2 + (r[id] - 40) / 120) { C.gold -= price; seize(t, C.me); r[id] -= 10; return done(`${The(id)} ${v3(id, "sells")} you ${t[0]} for ${price} thalers: the town and its country are yours.`); }
    r[id] -= 2; persist(); return `${The(id)} won't sell ${t[0]}.`;
  }
  // (peace bought with a town: theirs nearest your lands, given up — if the war has gone badly enough for them)
  if (what === "demand") {
    if (!atWar(id) || did.peace) return null;
    const g = grid(), theirs = citiesOfNow(g, id); if (theirs.length < 2) return null;
    const ratio = allArmies() / Math.max(1, foeArmy(id)), p = clamp(-0.1 + ratio * 0.15 + (C.took[id] || 0) * 0.1 - (C.lost[id] || 0) * 0.08 + (C.warT[id] || 0) * 0.02, 0.02, 0.75);
    did.peace = true;
    if (R() < p) {
      const near = theirs.filter(ct => ct[3] < 3).sort((a, b) => distFrom(g, C.me, a) - distFrom(g, C.me, b))[0] || theirs.sort((a, b) => a[3] - b[3])[0];
      seize(near, C.me); makePeace(id); C.E.rel[id] -= 15; return done(`${The(id)} ${v3(id, "buys")} peace with ${near[0]}: the town and its country are yours.`);
    }
    C.E.rel[id] -= 4; persist(); return `${The(id)} ${v3(id, "refuses")} to give up a town — the war isn't lost yet.`;
  }
  if (what === "peace") {
    if (!atWar(id) || did.peace) return null;
    const ratio = allArmies() / Math.max(1, foeArmy(id)), p = clamp(0.15 + ratio * 0.18 + (C.took[id] || 0) * 0.12 - (C.lost[id] || 0) * 0.06 + (C.warT[id] || 0) * 0.03 + r[id] / 300, 0.05, 0.9);
    did.peace = true;
    if (R() < p) { makePeace(id); return done(`${The(id)} ${v3(id, "agrees")} to peace.`); }
    persist(); return `${The(id)} ${v3(id, "refuses")} your peace — for now.`;
  }
  return null;
}
const buyable = id => { const g = grid(), L = citiesOfNow(g, id); if (L.length < 3) return null; return L.filter(ct => ct[3] < 3).sort((a, b) => distFrom(g, C.me, a) - distFrom(g, C.me, b))[0] || null; };
const buyPrice = ct => Math.round(worth(ct) * 14 / 10) * 10;
const courtOf = id => { const c = citiesOfNow(grid(), id).sort((a, b) => b[3] - a[3])[0]; return c ? c[0] : the(id); };
function declare(id, by) {
  C.E.war[id] = true; C.warT[id] = 0; C.E.pact[id] = false; C.ally[id] = false;
  C.E.rel[id] = Math.min(C.E.rel[id], -40);
  // (your allies: into it with you, against them)
  for (const a of Object.keys(C.ally)) if (C.ally[a] && a !== id && !isHuman(a) && C.E.rel[a] >= 30 && sameSide(a, id) && !C.E.wars.some(w => (w.a === a && w.b === id) || (w.a === id && w.b === a))) { C.E.wars.push({ a, b: id, battles: 0, withYou: true }); say(`${The(a)} ${v3(a, "joins")} your war`, `Your ally marches on ${the(id)}.`); }
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
  if (world) foeNavies(g, ids);
  if (mine && !C.over) { C.gold += income(g) - upkeep(); realmMine(g); launchShips(g); fleetsYear(g); navyHunt(g, ids);
  if (C.gold < 0) { const lose = Math.ceil(-C.gold / REGIMENT); C.army = Math.max(0, C.army - lose); C.gold = 0; moraleMove(-15); say("The pay chest is empty", `${lose} regiments desert for want of pay.`); } }
  // (the other crowns: their armies made up again; their tempers going back to where their faith puts them)
  for (const id of ids) {
    // (as many regiments as its people can keep: a crown that loses its great cities loses the men to fill its ranks)
    const folk = citiesOfNow(g, id).reduce((t, ct) => t + popOf(ct), 0), cap = NATIONS[id].nw ? NATIONS[id].strength * 11 + Math.round(folk / 5000) + 6 : NATIONS[id].strength * 17 + Math.round(folk / 9000) + 8;
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
    const p = 0.015 + Math.max(0, -C.E.rel[id]) / 500 + (big > 12 ? 0.03 : 0) + (big > 25 ? 0.05 : 0), able = C.foes[id] > allArmies() * 0.6 ? 1 : 0.3;
    // (fewer piling on when you've already enemies enough — a crown waits to see how those wars go)
    const already = Object.keys(C.E.war).filter(k => C.E.war[k]).length;
    if (R() < p * able * Math.pow(0.45, already)) declare(id, id);
  }
  // who'll make peace: worn out, or beaten
  for (const id of ids) if (atWar(id) && (C.warT[id] || 0) >= 3 && R() < 0.12 + (C.foes[id] < allArmies() * 0.5 ? 0.2 : 0) + (C.took[id] || 0) * 0.04)
    C.events.push({ kind: "peace", foe: id, gold: C.foes[id] < allArmies() * 0.4 ? 60 + NATIONS[id].strength * 30 : 0, ...(() => {
      // (winning, they want a town for it: yours nearest their lands)
      if (C.foes[id] < allArmies() * 1.5 || (C.lost[id] || 0) < 1 || mine.length < 3) return {};
      const t = mine.filter(ct => ct[3] < 3).sort((a, b) => distFrom(g2, id, a) - distFrom(g2, id, b))[0]; return t ? { cede: t[0] } : {};
    })() });
  // who falls on your armies in the field: an enemy army near one of yours, and the stronger, now and then
  for (const id of ids) {
    if (!atWar(id) || (C.foes[id] | 0) < 10 || R() > 0.3 || C.events.some(e => !e.done && e.foe === id)) continue;
    const fp = foeArmyPos(id); if (!fp) continue;
    const hit = eachArmy(aid => { const p = armyPos(); return !C.siege && C.army >= 3 && !overSea(p, fp) && mdist(p, fp) <= MARCH && !CITIES.some(ct => cityOwner(g2, ct) === C.me && dist2(cellXY(ct), p) < 2.5) && C.foes[id] > C.army * 1.1 ? { aid, army: C.army, at: { x: p.x, y: p.y } } : null; }).find(Boolean);
    if (!hit) continue;
    C.foePos[id] = { x: hit.at.x + (fp.x - hit.at.x) * 0.15, y: hit.at.y + (fp.y - hit.at.y) * 0.15 };
    C.events.push({ kind: "fieldatk", foe: id, ar: hit.aid, att: Math.round(C.foes[id] * 0.85), def: hit.army, ct: nearTown(hit.at)[0] });
  }
  // who marches on your towns: each crown at war with you, now and then, at a town of yours within its reach
  for (const id of ids) {
    if (C.events.some(e => !e.done && e.kind === "fieldatk" && e.foe === id)) continue;
    if (!atWar(id) || C.foes[id] < 8 || R() > 0.5) continue;
    // (a walled town is only sat down before by a crown with guns to batter it)
    // (a town already marched toward: kept to; else one within its reach)
    C.foeGo ||= {};
    let ct = C.foeGo[id] && mine.find(c => c[0] === C.foeGo[id]);
    if (!ct) { const near = mine.filter(c => inReach(g2, c, id) && (!hasWalls(c, C.me, g2) || (C.fguns[id] | 0) > 0)); if (!near.length) continue; ct = pick(near); }
    // its army on the road: there this year if it's near enough, else a year's march nearer — seen coming
    const fp = foeArmyPos(id), tc = cellXY(ct);
    if (fp && overSea(fp, tc)) { C.foePos[id] = { x: tc.x, y: tc.y }; C.foeGo[id] = ct[0]; say(`${The(id)} ${v3(id, "ships")} an army over the Atlantic`, `Some ${C.foes[id]} regiments, bound for ${ct[0]}. They'll be at its walls next year.`); continue; }
    if (fp && mdist(fp, tc) > MARCH) { const st = stepToward(fp, tc, MARCH); C.foePos[id] = { x: st.x, y: st.y }; C.foeGo[id] = ct[0]; say(`${poss(The(id))} ${NATIONS[id].nw ? "war party" : "army"} marches toward ${ct[0]}`, `Some ${C.foes[id]} ${NATIONS[id].nw ? "bands of warriors" : "regiments"}, a year's march off. They'll be at its walls next year.`); continue; }
    if (fp) C.foePos[id] = { x: tc.x, y: tc.y }; delete C.foeGo[id];
    const att = Math.round(C.foes[id] * (0.45 + R() * 0.25));
    // (your army comes to its help only if it's near)
    C.events.push({ kind: "attack", foe: id, ct: ct[0], att, of: C.foes[id], def: garrison(ct) + levy(mine.length) + helpNear(ct), walls: hasWalls(ct, C.me), army: helpNear(ct) > 0 });
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
  C.did = {};
  fleetsStart(grid());
  eachArmy(id => {
    C.moved = false; C.supplied = false;
    // (an army still on its way: the year's march taken up with getting there)
    if (C.go && !C.siege) { const st = stepToward(armyPos(), C.go, MARCH); C.pos = { x: st.x, y: st.y }; if (st.arrived) { C.go = null; say(id ? `The ${armyName(id).toLowerCase()} arrives` : "Your army arrives", "It's where you sent it, and can march again next year."); } C.moved = true; }
  });
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
      for (const x of alliesOf(b).filter(x => x !== a && x !== C.me && !isHuman(x) && alive(g, x) && !leagueOf(x, a) && sameSide(x, a) && !W.some(w => (w.a === x && w.b === a) || (w.a === a && w.b === x))).slice(0, 2)) if (R() < 0.6) { W.push({ a: x, b: a, battles: 0 }); sayAll(`${The(x)} ${v3(x, "comes")} in on ${poss(the(b))} side`, `Against ${the(a)}, as its league binds it.`); }
    }
  }
  for (const w of W.slice()) {
    if (!alive(grid(), w.a) || !alive(grid(), w.b)) { W.splice(W.indexOf(w), 1); continue; }
    if (R() > 0.45) continue;
    // (each side with the help of its allies fighting the same enemy — the Holy League's armies at Vienna, not the
    //  Emperor's alone — a part of their strength, as they can spare it)
    // (and a crown with several wars on its hands has its armies divided among them: the Sultan's can't be at Vienna,
    //  Kraków and Venice at once with the whole of them)
    const fronts = id => Math.max(1, W.filter(v => v.a === id || v.b === id).length);
    const pow = id => ((C.foes[id] || 0) + NATIONS[id].strength * 4) / Math.pow(fronts(id), 0.5);
    const help = (x, foe) => W.filter(v => v !== w && ((v.a === foe && v.b !== x) || (v.b === foe && v.a !== x))).map(v => v.a === foe ? v.b : v.a).filter(y => NATIONS[y] && !isHuman(y) && (leagueOf(x, y) || C.ally[y] && x === C.me)).reduce((t, y) => t + pow(y) * 0.4, 0);
    const sa = pow(w.a) + help(w.a, w.b), sb = pow(w.b) + help(w.b, w.a), aWins = R() < sa / (sa + sb);
    const win = aWins ? w.a : w.b, lose = aWins ? w.b : w.a, gg = grid();
    const target = citiesOfNow(gg, lose).filter(ct => distFrom(gg, win, ct) <= REACH && (!hasWalls(ct, lose, gg) || (C.fguns[win] | 0) > 0));
    C.foes[lose] = Math.max(0, C.foes[lose] - 3 - Math.floor(R() * 4)); C.foes[win] = Math.max(0, C.foes[win] - 1 - Math.floor(R() * 2));
    // (a crown's own seat holds out longest: taken only on a second good day, unless it's nearly all the crown has left)
    if (target.length) { const ct = pick(target); if (ct[3] === 3 && citiesOfNow(gg, lose).length > 3 && R() < 0.6) { w.battles++; continue; } seize(ct, win); if (ct[3] >= 2 || w.withYou) sayAll(`${The(win)} ${v3(win, "takes")} ${ct[0]} from ${the(lose)}`); }
    w.battles++;
    if (!w.withYou && w.battles >= 3 && R() < 0.3) { W.splice(W.indexOf(w), 1); sayAll(`${The(w.a)} and ${the(w.b)} make peace`); }
  }
}
function checkEnd() {
  orphans(C.me);
  const g = grid(), n = citiesOfNow(g, C.me).length;
  if (!n && !C.over) { C.over = "lost"; say("Your crown is lost", "The last of your towns has fallen."); }
  if (n >= WIN_CITIES && !C.won) { C.won = true; say("Yours is the first crown of the world", `${n} towns under your crown. Play on, if you like.`); }
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !alive(g, id)) { C.E.war[id] = false; const by = C.gone && C.gone[id]; say(`${The(id)} ${v3(id, "is")} no more`, by === C.me ? "Its last town has fallen to you, and every acre of its land is yours." : by ? `${The(by)} ${v3(by, "has")} taken the last of it.` : "Its last town is yours or another's."); }
}

// ---------------------------------------------------------------------------
//  the screens: choosing a crown, and the map
// ---------------------------------------------------------------------------
let selFoe = null, selFleet = null, selFoeFleet = null;
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
  cv.addEventListener("wheel", e => { e.preventDefault(); townTip(null); const [px, py] = pos(e); zoomAt(px, py, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.onmousedown = e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; };
  cv.onmousemove = e => {
    if (drag && e.buttons & 1) { const r = cv.getBoundingClientRect(), dx = (e.clientX - drag.x) * cv.width / r.width, dy = (e.clientY - drag.y) * cv.height / r.height; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; if (drag.moved > 5) { townTip(null); view.ox -= dx / view.z; view.oy -= dy / view.z; clampV(); paint(); return; } }
    if (!C) return;
    const p = toMap(pos(e)), ct = cityAt(cv, ...p, view.z), id = nationAt(E(), cv, ...p);
    cv.style.cursor = ct || id ? "pointer" : "grab";
    if (ct !== hovCity || id !== hov) { hovCity = ct; hov = id; paint(); }
    const px = pos(e), fh = foeHit(cv, ...px), ah = !fh && armyHit(cv, ...px);
    if (fh || ah) { cv.style.cursor = "pointer"; armyTip(fh, ah, e); } else townTip(ct, e);
  };
  cv.onmouseleave = () => { drag = null; hov = null; hovCity = null; townTip(null); paint(); };
  // (right-click: your army sent there)
  cv.oncontextmenu = e => {
    e.preventDefault(); if (!C) return;
    const [mx, my] = toMap(pos(e)), S = cv.width / MG_W;
    if (selFleet != null && fleetById(selFleet)) { doAct({ k: "sail", id: selFleet, x: mx / S, y: my / S }); return; }
    // (an enemy army within a year's march: the army falls on it in the field)
    const fh = foeHit(cv, ...pos(e)); if (fh && isHuman(fh) && canFieldP(fh)) { selFoe = fh; sel = fh; selCity = null; armySel = false; doAct({ k: "pfield", h: fh, how: "fight" }); return; }
    if (fh && canField(fh) && C.emb == null) { selFoe = fh; sel = fh; selCity = null; armySel = false; doAct({ k: "field", foe: fh, how: "fight" }); return; }
    // (an enemy town within reach: the army falls on it — the muster before the assault, where it can still be called off)
    const ct = cityAt(cv, mx, my, view.z), o = ct && cityOwner(grid(), ct);
    if (ct && o && o !== C.me && atWar(o) && C.emb == null && C.army >= 5 && inMarch(ct) && freeToStrike(ct) && (!C.siege || siegeOf(ct))) { selCity = ct; sel = o; armySel = false; doAct({ k: "march", ct: ct[0], how: "fight" }); return; }
    doAct({ k: "move", x: mx / S, y: my / S }); armySel = false;
  };
  cv.onmouseup = e => {
    const moved = drag ? drag.moved : 0; drag = null; if (moved > 5 || !C || e.button !== 0) return;
    // (your army: picked up — the next right-click sends it)
    const sh = fleetHit(cv, ...pos(e));
    if (sh) { if (sh.mine != null) { selFleet = selFleet === sh.mine ? null : sh.mine; selFoeFleet = null; } else { selFoeFleet = sh.foe; sel = pFleet(sh.foe) ? pFleet(sh.foe).h : sh.foe; } selCity = null; selFoe = null; armySel = false; note = selFleet != null && sh.mine != null ? "Your fleet: right-click on the sea to sail there." : ""; drawMap(); sfx("bell", 0.15); return; }
    if (selFleet != null) { selFleet = null; }
    selFoeFleet = null;
    const fh = foeHit(cv, ...pos(e));
    if (fh) { selFoe = fh; sel = fh; selCity = null; armySel = false; note = ""; drawMap(); sfx("drum", 0.2); return; }
    selFoe = null;
    const hit = armyHit(cv, ...pos(e));
    if (hit && hit.id !== (C.ar | 0)) { doAct({ k: "usearmy", id: hit.id }); armySel = false; }
    if (hit) { armySel = !armySel; selCity = null; sel = null; note = armySel ? `${(C.armies || []).length ? `The ${armyName(C.ar | 0).toLowerCase()}` : "Your army"}: right-click anywhere on the map to march there. A year's march takes it about 350 km; a town within that is in its reach.` : ""; drawMap(); sfx("drum", 0.25); return; }
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
        else {
          const [gx, gy] = gridOf(...hit.ll), g = grid(), q = { x: gx, y: gy }, id = g[Math.floor(gy)] && g[Math.floor(gy)][Math.floor(gx)];
          // (an army there, yours or an enemy's: chosen, as on the map)
          const mineA = [[C.ar | 0, armyPos()], ...(C.armies || []).filter(a => a.pos).map(a => [a.id, a.pos])].find(([, p]) => dist2(p, q) < 2.2);
          if (mineA) { if (mineA[0] !== (C.ar | 0)) doAct({ k: "usearmy", id: mineA[0] }); armySel = true; selCity = null; sel = null; selFoe = null; note = ""; drawMap(); sfx("drum", 0.25); return; }
          const foeA = Object.keys(C.E.war).find(f => C.E.war[f] && !isHuman(f) && foeArmyPos(f) && dist2(foeArmyPos(f), q) < 2.2);
          if (foeA) { selFoe = foeA; sel = foeA; selCity = null; armySel = false; note = ""; drawMap(); sfx("drum", 0.2); return; }
          selFoe = null; selCity = null; sel = id && NATIONS[id] ? id : null;
        }
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
    <div class="cmp-ph"><h2>${have.length ? "Or begin a new one" : "Choose your crown"}</h2><p class="sub">Europe and the New World in 1683. Raise armies, make friends and enemies, take towns and hold them. The great powers have the most to lose; the small states the most to win.${have.length >= SLOTS ? ` <b>You have ${SLOTS} campaigns: a new one takes the place of the one longest left alone.</b>` : ""}</p></div>
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
  const flag = (p, id, n, mine) => { const [lon, lat] = llOf(p.x, p.y); out.push({ name: "army-" + id, lon, lat, kind: NATIONS[id].nw ? "party" : "army", color: NATIONS[id].color, n, mine: !!mine }); };
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !isHuman(id) && alive(g, id)) { const fp = foeArmyPos(id); if (fp) flag(fp, id, foeArmy(id), false); }
  for (const a of C.armies || []) if (a.pos) { const [lon, lat] = llOf(a.pos.x, a.pos.y); out.push({ name: "army-" + C.me + "-" + a.id, lon, lat, kind: "army", color: NATIONS[C.me].color, n: C.units.filter(u => !u.at && (u.ar | 0) === a.id).length, mine: true }); }
  flag(armyPos(), C.me, field().length || C.army, true);
  return out;
}
// (the fleets at sea, for the land seen close: yours, the other player's, and the crowns' — each heading where she's bound)
function fleets3d() {
  const out = [], one = (p, id, n, mine, go, key) => { const [lon, lat] = llOf(p.x, p.y), yaw = go ? Math.atan2(go.x - p.x, go.y - p.y) : (hashStr(key) % 628) / 100; out.push({ name: key, lon, lat, color: NATIONS[id].color, n, yaw: Math.round(yaw * 100) / 100, mine }); };
  for (const [id, F] of Object.entries(C.foeFleets || {})) if (F.ships.length) one(F.pos, id, F.ships.length, false, null, "foe-" + id);
  for (const [h, f] of otherFleets()) one(f.pos, h, f.ships.length, false, f.go, `p-${h}-${f.id}`);
  for (const f of C.fleets || []) if (f.ships.length) one(f.pos, C.me, f.ships.length, true, f.go, "mine-" + f.id);
  return out;
}
const hashStr = t => { let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
// (the other player's fleets, in a campaign of two)
const otherFleets = () => C.mp ? humans().filter(h => h !== C.me).flatMap(h => ((sliceOf(h) || {}).fleets || []).filter(f => f.ships.length).map(f => [h, f])) : [];
// (an army under the pointer: whose, how strong, under whom, and what it's about)
function armyTip(foe, mine, e) {
  let el = $("cmpTip"); if (!el) { el = document.createElement("div"); el.id = "cmpTip"; el.className = "cmp-tip"; $("campaign").appendChild(el); }
  if (foe && isHuman(foe)) { const sl = sliceOf(foe) || {}; el.innerHTML = `<b>${esc(poss(nameOf(foe)))} army</b><small>${sl.army | 0} regiments${sl.gen ? ` · under ${esc(sl.gen.name)}` : ""}</small><span>${sl.siege ? `Besieging ${esc(sl.siege.ct)}` : "In the field"}${canFieldP(foe) ? " · within your reach" : ""}</span>`; }
  else if (foe) { const tg = C.foeGo && C.foeGo[foe], fg = C.foeGen && C.foeGen[foe]; el.innerHTML = `<b>${esc(poss(The(foe)))} army</b><small>${C.foes[foe] | 0} regiments${fg ? ` · under ${esc(fg.name)}` : ""}</small><span>${tg ? `Marching on ${esc(tg)}` : "In the field"}${canField(foe) ? " · within your reach" : ""}</span>`; }
  else { const id = mine.id, A = id === (C.ar | 0) ? C : (C.armies || []).find(a => a.id === id) || {}, n = (C.units || []).filter(u => !u.at && (u.ar | 0) === id).length; el.innerHTML = `<b>${(C.armies || []).length ? esc(armyName(id)) : "Your army"}</b><small>${n} regiments${A.gen ? ` · under ${esc(A.gen.name)}` : " · no general"}</small><span>${A.siege ? `Besieging ${esc(A.siege.ct)}` : A.go ? "On the march" : A.moved ? "Marched this year" : "Ready to march"}</span>`; }
  el.style.display = "block"; el.style.left = Math.min(innerWidth - 220, e.clientX + 16) + "px"; el.style.top = Math.min(innerHeight - 70, e.clientY + 14) + "px";
}
// (a town under the pointer: its name, how great it is, whose, and its people — beside the pointer)
function townTip(ct, e) {
  let el = $("cmpTip");
  if (!ct || !e) { if (el) el.style.display = "none"; return; }
  if (!el) { el = document.createElement("div"); el.id = "cmpTip"; el.className = "cmp-tip"; $("campaign").appendChild(el); }
  const o = cityOwner(grid(), ct), r = popRate(ct);
  el.innerHTML = `<b>${esc(ct[0])}</b><small>${["", "A town", "A city", "A great city"][ct[3]]}${o ? ` · ${o === C.me ? "yours" : esc(NATIONS[o].name)}` : ""}</small><span>${fmtN(popOf(ct))} people${o === C.me && r ? ` · ${r > 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}% a year` : ""}</span>${o === C.me ? `<span>${orderWord(orderOf(ct))}${garUnits(ct[0]).length ? ` · ${garUnits(ct[0]).length} regiment${garUnits(ct[0]).length > 1 ? "s" : ""} holding it` : ""}${raising(ct[0]).length ? ` · raising ${raising(ct[0]).length}` : ""}</span>` : ""}`;
  el.style.display = "block"; el.style.left = Math.min(innerWidth - 200, e.clientX + 16) + "px"; el.style.top = Math.min(innerHeight - 70, e.clientY + 14) + "px";
}
// ---- land changing hands, shown spreading: out from the taker's own border across the province, a square at a time,
//  rather than the whole of it changing colour at once ----
let lastG = null, lastRev = -1, spread = null, spreadRaf = 0, spreadOf = "";
const nh = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function spreadCheck() {
  const who = `${slot}|${C.me}|${C.mp ? "mp" : ""}`; if (who !== spreadOf) { spreadOf = who; lastG = null; spread = null; }
  const e = E(); if (((e.rev | 0) === lastRev && lastG) || !shown()) return;
  const g = grid(), was = lastG; lastG = g.map(r => r.slice()); lastRev = e.rev | 0;
  if (!was || was.length !== g.length) return;
  const ch = []; for (let y = 0; y < g.length; y++) { const a = g[y], b = was[y]; for (let x = 0; x < a.length; x++) if (a[x] !== b[x] && NATIONS[a[x]]) ch.push([x, y]); }
  if (!ch.length || ch.length > 80000) return;
  // (from the squares that touch the taker's old land; a province over the sea, or cut off, from its town)
  const W = g[0].length, at = new Map(), q = [], N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], inCh = new Set(ch.map(([x, y]) => y * W + x));
  for (const [x, y] of ch) { const to = g[y][x]; if (N4.some(([dx, dy]) => was[y + dy] && was[y + dy][x + dx] === to)) { at.set(y * W + x, 0); q.push([x, y]); } }
  for (const ct of CITIES) { const [x, y] = cellOf(ct); if (inCh.has(y * W + x) && !at.has(y * W + x)) { at.set(y * W + x, 0); q.push([x, y]); } }
  if (!q.length) { at.set(ch[0][1] * W + ch[0][0], 0); q.push(ch[0]); }
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i], d = at.get(y * W + x); for (const [dx, dy] of N4) { const k = (y + dy) * W + x + dx; if (inCh.has(k) && !at.has(k)) { at.set(k, d + 1); q.push([x + dx, y + dy]); } } }
  let max = 0; const cells = ch.map(([x, y]) => { const st = (at.get(y * W + x) ?? 0) + nh(x, y) * 3; max = Math.max(max, st); return [x, y, st]; });
  spread = { cells, max, t0: performance.now(), dur: clamp(max * 45, 1400, 3600) };
}
function spreadTick() {
  spreadRaf = 0; if (!spread || on3d || !shown()) { spread = null; return; }
  paint();
}
function paint() {
  const cv = $("cmpMap"); if (!cv || !C) return; W0();
  if (on3d && eu3d) { eu3d.setMap(E(), 2, null); eu3d.marks(marks3d()); eu3d.fleets(fleets3d()); if (!raf3d) loop3d(); return; }
  spreadCheck();
  let sp = null;
  if (spread) { const t = (performance.now() - spread.t0) / spread.dur; if (t >= 1) spread = null; else { const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; sp = { cells: spread.cells, p: e * (spread.max + 4) - 1 }; if (!spreadRaf) spreadRaf = requestAnimationFrame(spreadTick); } }
  const g = drawEurope(cv, E(), { spread: sp, pop: C.pop || null, hover: hov || C.me, selected: sel, city: selCity, hoverCity: hovCity, view, home: false, me: C.me, walled: C.walls || null, zf: ZF(), sharp: () => { if (shown() && !on3d) paint(); } });
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
    // (your towns, and the other player's, are told by the flag over each — gold-edged for yours; a town of yours an
    //  enemy marches on, and an enemy's within your reach, marked with crossed swords over it)
    const up = (ct[3] === 3 ? 13 : 10) * k;
    if (own2 === C.me) {
      if (threat.has(ct[0])) swords(x, y - up, 5 * k, "#c0281a");
      // (regiments being raised there: a little gold token with how many, beside the dot)
      const rq = raising(ct[0]).length, gu = garUnits(ct[0]).length;
      if (rq || gu) { const tx = x - 11 * k, ty = y - 8 * k; c.save(); c.fillStyle = rq ? "#c9a45a" : "rgba(239,228,198,0.95)"; c.strokeStyle = "#3a2a1a"; c.lineWidth = 1.1 * k; c.beginPath(); c.arc(tx, ty, 7 * k, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#2a1c10"; c.font = `bold ${Math.round(9.5 * k)}px Georgia, serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(rq ? `+${rq}` : String(gu), tx, ty + 0.5 * k); c.restore(); }
    }
    else if (atWar(own2) && inMarch(ct)) swords(x, y - up, 4.5 * k, C.moved ? "rgba(120,40,30,0.45)" : "#b0281a");
  }
  // ---- the armies: a regiment's block under its colour, how many regiments, and where it's marching ----
  const scr = p => [(p.x * S - view.ox) * view.z, (p.y * S - view.oy) * view.z];
  const army = (p, id, n, mine, go, act = true) => {
    const [x, y0] = scr(p), y = y0 + townNudge(p, armyU(k)); if (x < -60 || y < -60 || x > cv.width + 60 || y > cv.height + 60) return;
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
    // (a war party of the woods' nations: no battalions in line, but men in open order, scattered across the ground)
    if (NATIONS[id] && NATIONS[id].nw) {
      for (let i = 0; i < 9; i++) { const sx = (Math.sin(i * 2.39 + 1) * 9 + (i % 3 - 1) * 2.5) * u, sy = (Math.cos(i * 1.71) * 3.2) * u; c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = 0.8 * u; c.beginPath(); c.moveTo(sx, sy - 2.4 * u); c.lineTo(sx + 1.3 * u, sy + 1.2 * u); c.lineTo(sx - 1.3 * u, sy + 1.2 * u); c.closePath(); c.fill(); c.stroke(); }
      c.restore();
    } else {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      const bx = (-8.6 + i * 4.6 + r * 1.1) * u, by = (-3.2 + r * 3.6) * u;
      c.globalAlpha = r ? 0.78 : 1; c.fillStyle = col; c.fillRect(bx, by, 3.6 * u, 2.2 * u);
      c.globalAlpha = 1; c.strokeStyle = ink; c.lineWidth = 0.9 * u; c.strokeRect(bx, by, 3.6 * u, 2.2 * u);
    }
    for (const sx of [-1, 1]) { c.fillStyle = col; c.strokeStyle = ink; c.beginPath(); const hx = sx * 12.2 * u, hy = -1.2 * u; c.moveTo(hx, hy - 2 * u); c.lineTo(hx + 1.8 * u, hy); c.lineTo(hx, hy + 2 * u); c.lineTo(hx - 1.8 * u, hy); c.closePath(); c.fill(); c.stroke(); }
    // (the front: a fine rule before the first line)
    c.strokeStyle = ink; c.lineWidth = 0.9 * u; c.beginPath(); c.moveTo(-9.2 * u, -4.4 * u); c.lineTo(8.4 * u, -4.4 * u); c.stroke();
    c.restore();
    }
    if (mine && act && armySel) { c.save(); c.strokeStyle = "#c89a30"; c.lineWidth = 1.6 * u; c.setLineDash([3 * u, 2.4 * u]); c.beginPath(); c.ellipse(0, 0, 16 * u, 9 * u, face, 0, 7); c.stroke(); c.restore(); }
    const t = String(n); c.font = `italic bold ${Math.round(9.5 * u)}px ${'"IM Fell English", Georgia, serif'}`; c.textAlign = "center"; c.textBaseline = "top";
    c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 3 * u; c.strokeText(t, 0, 7 * u); c.fillStyle = ink; c.fillText(t, 0, 7 * u);
    c.restore();
  };
  // (the other crowns at war with you, and their marches on your towns; the other player's; then yours, on top)
  // (the straits that join the great lakes, too narrow for the map's coast to show: drawn in, so a lake's ships aren't
  //  seen sailing over the land)
  { const cell = Math.max(1.5, scr({ x: 1, y: 0 })[0] - scr({ x: 0, y: 0 })[0]); c.save(); c.lineCap = "round";
    for (const [[lo0, la0], [lo1, la1]] of STRAITS) { const [x0, y0] = scr({ x: gridOf(lo0, la0)[0], y: gridOf(lo0, la0)[1] }), [x1, y1] = scr({ x: gridOf(lo1, la1)[0], y: gridOf(lo1, la1)[1] });
      c.strokeStyle = "rgba(60,48,32,0.75)"; c.lineWidth = cell * 0.9 + 1.6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = "rgb(225,221,199)"; c.lineWidth = cell * 0.9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    c.restore(); }
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !isHuman(id) && alive(g, id)) { const fp = foeArmyPos(id); if (fp) { const tg = C.foeGo && C.foeGo[id] && CITIES.find(t => t[0] === C.foeGo[id]); army(fp, id, foeArmy(id), false, tg ? cellXY(tg) : null); } }
  if (C.mp) for (const h of humans()) if (h !== C.me) { const sl = sliceOf(h); if (sl && sl.pos) army(sl.pos, h, sl.army | 0, false, null); }
  // (your armies standing together fanned out a little on the screen, so each can be seen and clicked)
  armyOff = {}; { const placed = []; for (const [id, p] of [[C.ar | 0, armyPos()], ...(C.armies || []).filter(a => a.pos).map(a => [a.id, a.pos])]) { let [sx, sy] = scr(p), dx = 0; while (placed.some(([px2, py2]) => Math.hypot(px2 - sx - dx, py2 - sy) < 30 * armyU(k) / 1.6)) dx += 34 * armyU(k) / 1.6; placed.push([sx + dx, sy]); armyOff[id] = dx / (S * view.z); } }
  for (const a of C.armies || []) if (a.pos && a.emb == null) army({ x: a.pos.x + (armyOff[a.id] || 0), y: a.pos.y }, C.me, C.units.filter(u => !u.at && (u.ar | 0) === a.id).length, true, a.go || null, false);
  if (C.emb == null) army(armyPos(), C.me, field().length || C.army, true, C.go || null);
  // ---- the fleets: a ship under sail, engraved, in her crown's colour, how many ships under her, and where she's bound ----
  const shipMark = (p, col, n, mine, sel, go, cargo) => {
    const [x, y] = scr(p); if (x < -60 || y < -60 || x > cv.width + 60 || y > cv.height + 60) return; const u = armyU(k);
    if (go) { const [gx, gy] = scr(go); c.save(); c.strokeStyle = mine ? "rgba(30,50,70,0.8)" : "rgba(150,30,20,0.8)"; c.lineWidth = 1.8 * u; c.setLineDash([2 * u, 4 * u]); c.beginPath(); c.moveTo(x, y); c.lineTo(gx, gy); c.stroke(); c.restore(); }
    c.save(); c.translate(x, y); c.lineJoin = "round";
    c.fillStyle = "rgba(244,234,210,0.6)"; c.beginPath(); c.ellipse(0, 3 * u, 13 * u, 4.5 * u, 0, 0, 7); c.fill();
    c.strokeStyle = mine ? "#2a1c10" : "#7a2216"; c.lineWidth = 1 * u;
    c.fillStyle = "#5a3e28"; c.beginPath(); c.moveTo(-10 * u, -1 * u); c.lineTo(10 * u, -1 * u); c.quadraticCurveTo(8 * u, 4 * u, 5 * u, 4 * u); c.lineTo(-6 * u, 4 * u); c.quadraticCurveTo(-9 * u, 3 * u, -10 * u, -1 * u); c.fill(); c.stroke();
    for (const [mx, h] of [[-4, 11], [1, 13], [6, 10]]) { c.beginPath(); c.moveTo(mx * u, -1 * u); c.lineTo(mx * u, -h * u); c.stroke(); c.fillStyle = "#efe4c6"; c.beginPath(); c.moveTo((mx - 2.6) * u, (-h + 1.5) * u); c.quadraticCurveTo((mx + 0.6) * u, (-h + 4.5) * u, (mx - 2.6) * u, -3 * u); c.lineTo((mx + 2.6) * u, -3 * u); c.quadraticCurveTo((mx + 3.6) * u, (-h + 4.5) * u, (mx + 2.6) * u, (-h + 1.5) * u); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = col; c.beginPath(); c.moveTo(1 * u, -13 * u); c.lineTo(6 * u, -12 * u); c.lineTo(1 * u, -11 * u); c.closePath(); c.fill(); c.stroke();
    if (sel) { c.strokeStyle = "#c89a30"; c.lineWidth = 1.6 * u; c.setLineDash([3 * u, 2.4 * u]); c.beginPath(); c.ellipse(0, -2 * u, 16 * u, 13 * u, 0, 0, 7); c.stroke(); c.setLineDash([]); }
    c.font = `italic bold ${Math.round(9 * u)}px Georgia, serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 3 * u; const t = `${n}${cargo ? ` · ${cargo}` : ""}`; c.strokeText(t, 0, 10.5 * u); c.fillStyle = mine ? "#2a1c10" : "#7a2216"; c.fillText(t, 0, 10.5 * u);
    c.restore();
  };
  for (const [id, F] of Object.entries(C.foeFleets || {})) if (F.ships.length) shipMark(F.pos, NATIONS[id].color, F.ships.length, false, selFoeFleet === id, null, 0);
  for (const [h, f] of otherFleets()) shipMark(f.pos, NATIONS[h].color, f.ships.length, false, false, null, 0);
  for (const f of C.fleets || []) if (f.ships.length) shipMark(f.pos, NATIONS[C.me].color, f.ships.length, true, selFleet === f.id, f.go, aboardRegs(f.id));
  c.restore();
}
let armySel = false, armyOff = {};
// (an army standing in a town: drawn just below it, so the town's own mark isn't hidden under it)
const townNudge = (p, u) => CITIES.some(ct => { const t = cellXY(ct); return Math.hypot(t.x - p.x, t.y - p.y) < 2.5; }) ? 10 * u : 0;
const armyU = k => k * Math.min(2.7, 1.45 + view.z / ZF() * 0.26);
// (your army under the pointer: within a little of its block on the map)
// (a fleet under the pointer: one of yours, or another crown's)
function fleetHit(cv, px, py) {
  if (!C) return null; const S = cv.width / MG_W, u = armyU(cv.width / 1300), at = p => { const x = (p.x * S - view.ox) * view.z, y = (p.y * S - view.oy) * view.z; return Math.hypot(px - x, py - y + 4 * u) < 14 * u; };
  const f = (C.fleets || []).find(f => f.ships.length && at(f.pos)); if (f) return { mine: f.id };
  const o = otherFleets().find(([, f]) => at(f.pos)); if (o) return { foe: `p:${o[0]}:${o[1].id}` };
  const id = Object.keys(C.foeFleets || {}).find(id => C.foeFleets[id].ships.length && at(C.foeFleets[id].pos)); return id ? { foe: id } : null;
}
// (an enemy army under the pointer: one at war with you, on the map)
function foeHit(cv, px, py) {
  if (!C) return null; const S = cv.width / MG_W, u = armyU(cv.width / 1300), g = grid();
  for (const id of Object.keys(C.E.war)) {
    if (!C.E.war[id] || !alive(g, id)) continue; const p = isHuman(id) ? (sliceOf(id) || {}).pos : foeArmyPos(id); if (!p || !isFinite(p.x)) continue;
    const x = (p.x * S - view.ox) * view.z, y = (p.y * S - view.oy) * view.z + townNudge(p, u); if (Math.hypot(px - x, py - y - 3 * u) < 16 * u) return id;
  }
  return null;
}
function armyHit(cv, px, py) {
  if (!C) return false; const S = cv.width / MG_W, u = armyU(cv.width / 1300);
  const at = p => { const x = (p.x * S - view.ox) * view.z, y = (p.y * S - view.oy) * view.z + townNudge(p, u); return Math.hypot(px - x, py - y - 3 * u) < 16 * u; };
  if (at(armyPos())) return { id: C.ar | 0 };
  const o = (C.armies || []).find(a => a.pos && at({ x: a.pos.x + (armyOff[a.id] || 0), y: a.pos.y })); return o ? { id: o.id } : false;
}
// (once, for a campaign of before 1.52: what's new in it, where to find it)
const TIPKEY = "reckoning.campaign.tip.1-55";
function newsTip() { try { if (localStorage.getItem(TIPKEY)) return; localStorage.setItem(TIPKEY, "1"); } catch (e) { return; } if (!note) note = "New in the campaign: every town has its people, and regiments are raised in your towns, a kind at a time: choose a town to recruit, or use Your towns. Leave regiments to hold a town, form new armies from garrisons, and click an enemy army to fight it in the field."; }
function drawMap(fit = false) {
  $("cmpPick").classList.add("hidden"); $("cmpPlay").classList.remove("hidden");
  if (C) newsTip();
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
    <span><small>Year</small><b>${C.year}</b></span><span title="${esc(`A year: ${income(g)} thalers in — from your towns at ${TAX[C.tax ?? 1].n.toLowerCase()} taxes, and trade — and ${upkeep()} out on the upkeep of ${(C.units || []).length} regiments`)}"><small>Treasury</small><b>${C.gold}</b> <em class="${net >= 0 ? "up" : "down"}">${net >= 0 ? "+" : ""}${net}</em></span>
    <span><small>${(C.armies || []).length ? `Armies · ${armyIds().length}` : "Army"}</small><b>${allField().length}</b> regiments${(C.units || []).some(u => u.at) ? ` <em title="Regiments in your towns' garrisons">+${C.units.filter(u => u.at).length}</em>` : ""}</span><span><small>People</small><b>${fmtN(citiesOfNow(g, C.me).reduce((t, ct) => t + popOf(ct), 0))}</b></span><span><small>Towns</small><b>${n}</b> of ${WIN_CITIES}</span><span><small>At war with</small><b>${wars.length ? wars.map(id => esc(NATIONS[id].name)).join(", ") : "nobody"}</b></span>${C.mp ? (() => { const o = humans().find(h => h !== C.me), ready = C.mp.ready[o]; return `<span class="cmp-mate"><small>${esc(nameOf(o))}</small><b><i style="background:${NATIONS[o].color}"></i>${esc(NATIONS[o].name)}</b><em class="${ready ? "up" : ""}">${mp && mp.gone ? "has left" : ready ? "ready to end the year" : "playing their year"}</em></span>`; })() : ""}`;
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
  return `<div class="cmp-man">${face(m)}<div><b>${esc(m.name)}</b>${m.hist ? `<em class="cmp-hist">Historical</em>` : ""}<small>${esc(m.d)}</small>${statsOf(m)}<small class="cmp-yrs">${m.served | 0} of ${lifeOf(m)} years' service${m.wins ? ` · ${m.wins} victor${m.wins > 1 ? "ies" : "y"}` : ""}</small>${extra}</div></div>`;
}
function candidates(list, attr, fee = null) {
  return `<div class="cmp-cands">${list.map((m, i) => { const f = fee ? fee(m) : 0; return `<div class="cmp-cand">${face(m)}<b>${esc(m.name)}</b><small>${esc(m.d)}</small>${statsOf(m)}<button class="btn" ${attr}="${i}"${f > C.gold ? " disabled" : ""}>Appoint${f ? ` · ${f}` : ""}</button></div>`; }).join("")}</div>`;
}
// (a governor's place is bought, as offices were: the bigger the town and the better the man, the dearer — an honest,
//  able one costs most; a corrupt one comes cheap, and makes it back out of the town)
const govFee = (m, ct) => Math.max(30, 40 + ct[3] * 35 + (m.st[1] + m.st[2] - m.st[0]) * 15);
// (a fleet's ships by kind, each a bar for her hull)
const shipImg = (k, cls = "") => `<img class="cmp-uimg ${cls}" src="art/units/ship-${k}.jpg" alt="">`;
function shipRoll(ships) {
  const by = {}; for (const s of ships) (by[s.k] ||= []).push(s);
  return `<div class="cmp-roll">${SHIP_KINDS.filter(k => by[k]).map(k => `<div class="cmp-ru">${shipImg(k, "sm")}<b>${by[k].length}</b><span>${esc(SHIPS[k].name)}<small>${esc(SHIPS[k].note)}</small></span><i title="Their hulls"><u style="width:${Math.round(by[k].reduce((t, s) => t + s.hp, 0) / by[k].length * 100)}%"></u></i><em></em></div>`).join("")}</div>`;
}
// your fleet chosen on the map: its ships, the armies aboard, and what it can do this year
function fleetCard(f) {
  const room = fleetCap(f), aboard = aboardOf(f.id), regs = aboardRegs(f.id), canEmb = C.emb == null && !C.siege && dist2(armyPos(), f.pos) <= 5 && field().length && room - regs >= field().length;
  const fights = Object.keys(C.foeFleets || {}).filter(id => canSeaFight(f.id, id));
  return `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[C.me].color}"></i><b>${esc(fleetName(f))}</b><small>${f.ships.length} ship${f.ships.length > 1 ? "s" : ""} · ${f.go ? "under sail" : f.moved ? "sailed this year" : "ready to sail"} · off ${esc(nearTown(f.pos)[0])}</small></div>
    ${shipRoll(f.ships)}
    <p class="cmp-pop">Carries ${room} regiments${regs ? `: ${regs} aboard (${aboard.map(id => (C.armies || []).length ? armyName(id).toLowerCase() : "your army").join(", ")})` : ", none aboard"}.</p>
    <div class="cmp-acts">${canEmb ? `<button class="btn" data-embark="${f.id}">Take ${(C.armies || []).length ? `the ${esc(armyName(C.ar | 0).toLowerCase())}` : "your army"} aboard</button>` : ""}${C.emb === f.id ? `<button class="btn" data-land="1">Land ${(C.armies || []).length ? `the ${esc(armyName(C.ar | 0).toLowerCase())}` : "the army"}</button>` : ""}
      ${fights.map(id => `<button class="btn primary" data-seaf="${id}" data-how="fight">Attack ${esc(poss(the(id)))} fleet · you command</button><button class="btn" data-seaf="${id}" data-how="auto">Attack · your admirals</button>`).join("")}
      ${otherFleets().filter(([h, o]) => canSeaFightP(f.id, h, o.id)).map(([h, o]) => `<button class="btn primary" data-seap="${h}" data-hf="${o.id}" data-fid="${f.id}">Attack ${esc(poss(nameOf(h)))} ${esc(fleetName(o).toLowerCase())}</button>`).join("")}</div>
    <small class="cmp-fine">${f.moved ? "It can sail again next year." : "Right-click on the sea to sail there: a year's sailing takes it across the Atlantic, or the length of the Mediterranean."}${!canEmb && C.emb == null && dist2(armyPos(), f.pos) > 5 ? " To take an army aboard, bring the fleet to the shore where it stands." : ""}</small></div>`;
}
// another crown's fleet: how strong, and whether a fleet of yours can reach it this year
function foeFleetCard(id) {
  const F = C.foeFleets[id], mine = (C.fleets || []).filter(f => canSeaFight(f.id, id));
  return `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[id].color}"></i><b>${esc(poss(The(id)))} fleet</b><small>${F.ships.length} ships of war · ${atWar(id) ? "<em class='down'>at war with you</em>" : "at peace with you"}</small></div>
    ${shipRoll(F.ships)}
    ${mine.length ? `<div class="cmp-acts">${mine.map(f => `<button class="btn primary" data-seaf="${id}" data-fid="${f.id}" data-how="fight">Attack with the ${esc(fleetName(f).toLowerCase())} · you command</button><button class="btn" data-seaf="${id}" data-fid="${f.id}" data-how="auto">Admirals</button>`).join("")}</div>` : `<small class="cmp-fine">${atWar(id) ? "No fleet of yours can reach it this year." : "You're not at war with them."}</small>`}</div>`;
}
// (the other player's fleet, picked on the map: "p:crown:fleet")
function pFleet(key) { const m = /^p:([^:]+):(\d+)$/.exec(key || ""); if (!m || !C.mp) return null; const sl = sliceOf(m[1]), f = sl && (sl.fleets || []).find(x => x.id === +m[2]); return f && f.ships.length ? { h: m[1], f } : null; }
function pFleetCard(key) {
  const { h, f: F } = pFleet(key), mine = (C.fleets || []).filter(f => canSeaFightP(f.id, h, F.id));
  return `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[h].color}"></i><b>${esc(poss(nameOf(h)))} ${esc(fleetName(F).toLowerCase())}</b><small>${F.ships.length} ships of war · ${atWar(h) ? "<em class='down'>at war with you</em>" : "at peace with you"}</small></div>
    ${shipRoll(F.ships)}
    ${mine.length ? `<div class="cmp-acts">${mine.map(f => `<button class="btn primary" data-seap="${h}" data-hf="${F.id}" data-fid="${f.id}">Attack with the ${esc(fleetName(f).toLowerCase())}</button>`).join("")}</div><small class="cmp-fine">A battle between two players' fleets is fought by the admirals: the weight of each side's broadsides, and luck.</small>` : `<small class="cmp-fine">${atWar(h) ? "No fleet of yours can reach it this year." : "You're not at war with them."}</small>`}</div>`;
}
// (a port's dockyard: the ships it can lay down this year)
function dockHtml(ct) {
  if (!harbourOf(ct)) return "";
  const n = ct[0], q = raisingShips(n), sl = dockSlots(ct);
  let h = `<div class="cmp-subh">Dockyard · ${q.length} of ${sl} this year</div>`;
  if (q.length) h += `<div class="cmp-rq">${q.map(x => `<span>${shipImg(x.k, "xs")}${esc(SHIPS[x.k].one)}</span>`).join("")}<button class="tm-lnk" data-unship="1">Call off the last</button></div>`;
  h += `<div class="cmp-recs">${SHIP_KINDS.map(k => { const S = SHIPS[k], lake = k === "line" && onLake(grid(), harbourOf(ct)), lack = k === "line" && (ct[3] < 2 || lake), why = lake ? "Too great a ship for the lakes" : lack ? "Needs a city's dockyard" : q.length >= sl ? "The dockyard is busy" : C.gold < S.cost ? "Not enough money" : ""; return `<button class="cmp-rec" data-ship="${k}" title="${esc(`${S.one}: ${S.note}. ${S.cost} thalers, upkeep ${S.up} a year.${why ? ` ${why}.` : ""}`)}"${why ? " disabled" : ""}>${shipImg(k)}<b>${esc(S.one)}</b><em>${S.cost} · ${S.guns} guns</em>${lack ? `<em class="lock">${lake ? "Not on a lake" : "Needs a city"}</em>` : ""}</button>`; }).join("")}</div>`;
  return h;
}
// (the army's roll: its regiments by arm, each a bar for how full its ranks are)
function rollHtml() {
  const by = {}; for (const u of field()) (by[u.k] ||= []).push(u);
  const ks = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
  if (!ks.length) return `<p class="cmp-fine">Your army has no regiments left. Raise new ones in your towns.</p>`;
  return `<div class="cmp-roll">${ks.map(k => { const L = by[k].map(u => u.hp), full = Math.round(L.reduce((t, v) => t + v, 0) / L.length * 100), xp = by[k].reduce((t, u) => t + (u.xp || 0), 0) / L.length, ch = Math.floor(xp + 0.25); return `<div class="cmp-ru"><button class="cmp-uopen" data-ucard="${k}" title="About ${esc(TROOPS[k].name.toLowerCase())}">${unitImg(k, "sm")}</button><b>${L.length}</b><span>${esc(TROOPS[k].name)}${ch ? ` <em class="cmp-chev" title="Experience: ${["", "blooded", "seasoned", "veterans"][ch]}">${"❯".repeat(ch)}</em>` : ""}<small>${esc(TROOPS[k].note)} · upkeep ${UNIT[k] ? UNIT[k].up : 1.6} each</small></span><i title="${full}% of their full strength"><u style="width:${full}%"></u></i><button class="tm-lnk" data-disband="${k}" title="Disband one regiment of ${esc(TROOPS[k].name.toLowerCase())} — the thinnest — and send its men home">Disband</button></div>`; }).join("")}</div>`;
}
// (the town's own regiments, and — with your army standing at it — regiments to leave here, or take back into the army)
function garHtml(ct) {
  const n = ct[0], G = garUnits(n), here = armyAt(ct), by = {}; for (const u of G) by[u.k] = (by[u.k] || 0) + 1;
  const fk = {}; if (here) for (const u of field()) fk[u.k] = (fk[u.k] || 0) + 1;
  if (!G.length && !here) return "";
  let h = `<div class="cmp-subh">Garrison regiments${G.length ? ` · ${G.length}` : ""}</div>`;
  if (G.length) h += `<div class="cmp-gar">${Object.entries(by).map(([k, c]) => `<span title="${esc(TROOPS[k].name)}">${unitImg(k, "sm")}<b>${c}</b>${here ? `<button class="tm-lnk" data-unstation="${k}">To the army</button>` : ""}</span>`).join("")}${here && G.length > 1 ? `<button class="tm-lnk" data-unstation="*">All to the army</button>` : ""}</div>`;
  if (here && Object.keys(fk).length) h += `<div class="cmp-gar leave"><small>Leave in ${esc(n)}:</small>${Object.entries(fk).map(([k, c]) => `<button class="cmp-rmini" data-station="${k}" title="Leave a regiment of ${esc(TROOPS[k].name.toLowerCase())} to hold ${esc(n)} (${c} in the army)">${unitImg(k)}</button>`).join("")}</div>`;
  else if (G.length && !here) h += `<small class="cmp-fine">Bring an army here to take them into it.</small>`;
  if (G.length) h += `<div class="cmp-acts"><button class="btn" data-form="1" title="March the garrison out as an army of its own">Form a new army from the garrison</button></div>`;
  return h;
}
// (a town's people: how many, and which way they're going)
function popLine(ct) { const r = popRate(ct); return `Population ${fmtN(popOf(ct))}${r ? ` · ${r > 0 ? "growing" : "falling"} ${Math.abs(r * 100).toFixed(1)}% a year` : ""} · its land feeds ${fmtN(popCap(ct))}`; }
// (the regiments your town can raise this year: what each costs, in thalers and in men, and what it needs)
function recruitHtml(ct) {
  const n = ct[0], q = raising(n), slots = slotsOf(ct), g = grid();
  let h = `<div class="cmp-subh">Recruit · ${q.length} of ${slots} this year${q.length ? "" : `, ready at the year's end`}</div>`;
  if (lvOf(n, "army") >= 2) h += `<small class="cmp-fine">Its ${lvOf(n, "army") >= 3 ? "military academy sends its recruits out seasoned (two chevrons)" : "barracks send its recruits out blooded (a chevron)"}.</small>`;
  if (q.length) h += `<div class="cmp-rq">${q.map(x => `<span>${unitImg(x.k, "xs")}${esc(TROOPS[x.k].one)}</span>`).join("")}<button class="tm-lnk" data-unrec="1">Call off the last</button></div>`;
  h += `<div class="cmp-recs">`;
  for (const k of kindsOf(C.me)) {
    const U = UNIT[k], c = unitCost(k, g), lack = U.need && !U.need(ct), noMen = popOf(ct) - U.men < popFloor(ct);
    const why = lack ? `Needs ${U.why}` : noMen ? "Not enough men to spare" : q.length >= slots ? "No more this year" : C.gold < c ? "Not enough money" : "";
    h += `<button class="cmp-rec" data-rec="${k}" title="${esc(`${TROOPS[k].name}: ${TROOPS[k].note}. ${c} thalers, ${U.men} men from the town, upkeep ${U.up} a year.${why ? ` ${why}.` : ""}`)}"${why ? " disabled" : ""}>${unitImg(k)}<b>${esc(TROOPS[k].name)}</b><em>${c} · ${U.men} men</em>${lack ? `<em class="lock">Needs ${esc(U.why)}</em>` : ""}</button>`;
  }
  return h + `</div>`;
}
// your own town: its worth and garrison, its governor, and its buildings a chain at a time — one piece of work a year
function townCard(g, ct) {
  const n = ct[0], q = C.Q && C.Q[n], v = govOf(n), last = citiesOfNow(g, C.me).length === 1, wl = lvOf(n, "walls");
  let h = `<p>Yours. Garrison ${garrison(ct)}; worth ${worth(ct)} thalers a year. ${wl ? CHAINS.walls.levels[wl].n + "." : last ? "No walls, but it's your last town: its people will hold it to the end." : "No walls."}</p><p class="cmp-pop">${popLine(ct)}</p>${(h => h ? `<p class="cmp-pop">${onLake(grid(), h) ? "A port on the Great Lakes: its ships sail the lakes, never out to the sea." : "A port, on the sea."}</p>` : "")(harbourOf(ct))}<p class="cmp-pop">Public order: <b class="${orderOf(ct) < 0 ? "down" : ""}">${orderWord(orderOf(ct))}</b>${orderOf(ct) < 0 ? " · it may riot at the year's end. Lighter taxes, a regiment in its garrison or a school will calm it." : ""}</p>` + garHtml(ct) + recruitHtml(ct) + dockHtml(ct);
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
  else if (C.won) h += `<div class="cmp-won"><b>Yours is the first crown of the world.</b> ${citiesOfNow(g, C.me).length} towns under your crown.</div>`;
  // what's waiting for your word: towns attacked, peace offered
  for (const [i, e] of C.events.entries()) {
    if (e.done) continue;
    if (e.kind === "appoint") { h += `<div class="cmp-ev"><b>Choose a general for ${e.ar ? `the ${esc(armyName(e.ar).toLowerCase())}` : "your army"}</b><small>One of three men put forward. He serves fifty years, if the enemy doesn't end it first.</small>${candidates(e.cands, `data-ev="${i}" data-appg`)}</div>`; continue; }
    if (e.kind === "seabattle") { const f = fleetById(e.fid), F = C.foeFleets && C.foeFleets[e.foe]; if (!f || !F) { e.done = true; continue; } h += `<div class="cmp-ev war"><b>${esc(poss(The(e.foe)))} fleet falls on your ${esc(fleetName(f).toLowerCase())}!</b><small>${F.ships.length} ships of war against your ${f.ships.length}${aboardRegs(f.id) ? `, with ${aboardRegs(f.id)} regiments aboard yours` : ""}. Your odds: ${Math.round(odds(gunsOf(f.ships), gunsOf(F.ships), false) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Command the fleet</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to your admirals</button></span></div>`; continue; }
    if (e.kind === "rising") { const ct = CITIES.find(c => c[0] === e.ct); h += `<div class="cmp-ev war"><b>${esc(e.ct)} rises!</b><small>A second year of riots, and the town is up in arms: some ${e.att} companies of townsmen against its garrison of ${ct ? garrison(ct) : 0}. Put it down by force, or buy peace with concessions${ct ? ` (${worth(ct) * 2} thalers)` : ""}.</small><span><button class="btn primary" data-ev="${i}" data-how="crush">Put it down</button><button class="btn" data-ev="${i}" data-how="concede">Grant concessions</button></span></div>`; continue; }
    if (e.kind === "fieldatk" && e.human) { h += `<div class="cmp-ev war"><b>${esc(nameOf(e.foe))} ${v3(e.foe, "falls")} on ${e.ar ? `your ${esc(armyName(e.ar).toLowerCase())}` : "your army"}!</b><small>${e.att} regiments of ${esc(NATIONS[e.foe].name)} against your ${e.def}, in the open near ${esc(e.ct)}. Meet them in the field yourself, the two of you in one battle, or leave it to your general.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Meet them in the field</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to your general</button></span></div>`; continue; }
    if (e.kind === "fieldatk") { h += `<div class="cmp-ev war"><b>${esc(poss(The(e.foe)))} army falls on ${e.ar ? `your ${esc(armyName(e.ar).toLowerCase())}` : "your army"}!</b><small>${e.att} regiments against your ${e.def}, in the open near ${esc(e.ct)}. Your odds: ${Math.round(odds(e.def, e.att, false) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Fight it yourself</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to your general</button></span></div>`; continue; }
    if (e.kind === "attack" && e.human) { h += `<div class="cmp-ev war"><b>${esc(nameOf(e.foe))} marches on ${esc(e.ct)}!</b><small>${e.att} regiments of ${esc(NATIONS[e.foe].name)} against your ${e.def} (${e.army === false ? "the garrison: your army is too far off to come" : "garrison and army"})${e.walls ? " · behind its walls" : ""}. Meet them on the field yourself, the two of you in one battle, or leave it to the garrison and let them fight it.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Meet them on the field</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to the garrison</button></span></div>`; continue; }
    if (e.kind === "ally" || e.kind === "pact" || (e.kind === "peace" && e.human)) { h += `<div class="cmp-ev"><b>${esc(nameOf(e.foe) === NATIONS[e.foe].name ? The(e.foe) : nameOf(e.foe))} ${v3(e.foe, "proposes")} ${e.kind === "peace" ? "peace" : e.kind === "ally" ? "an alliance" : NATIONS[e.foe].nw ? "the fur trade" : "a trade pact"}</b><small>${e.kind === "peace" ? "Each side keeps what it holds." : e.kind === "ally" ? "Their wars yours, and yours theirs." : (NATIONS[e.foe].nw ? "Beaver pelts down to your posts; kettles, cloth and trade muskets up to their towns." : "Their merchants in your towns, and yours in theirs.")}</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Agree</button><button class="btn" data-ev="${i}" data-how="no">Decline</button></span></div>`; continue; }
    if (e.kind === "attack") h += `<div class="cmp-ev war"><b>${esc(The(e.foe))} ${v3(e.foe, "marches")} on ${esc(e.ct)}!</b><small>${e.att} regiments${e.of > e.att ? ` of its ${e.of}` : ""} against your ${e.def} (${e.army === false ? "the garrison: your army is too far off to come" : "garrison and army"})${e.walls ? " · behind its walls" : ""}. Your odds: ${Math.round((1 - odds(e.att, e.def, e.walls)) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Fight it yourself</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to the garrison</button></span></div>`;
    if (e.kind === "peace") h += `<div class="cmp-ev"><b>${esc(The(e.foe))} ${v3(e.foe, "offers")} peace</b><small>${e.cede ? `If you give up ${esc(e.cede)} and its country.` : e.gold ? `And ${e.gold} thalers to have it.` : "Each side keeps what it holds."}</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Make peace</button><button class="btn" data-ev="${i}" data-how="no">Fight on</button></span></div>`;
  }
  if (note) h += `<div class="cmp-note">${esc(note)}</div>`;
  if (news.length) h += `<div class="cmp-news"><b>The year's news</b>${news.slice(0, 8).map(l => `<div>${esc(l.title)}${l.sub ? ` <span>${esc(l.sub)}</span>` : ""}</div>`).join("")}<button class="tm-lnk" data-act="news">Close</button></div>`;
  // the town or the crown chosen on the map
  if (selCity) {
    const own2 = cityOwner(g, selCity), mineT = own2 === C.me, reach = !mineT && own2 && inMarch(selCity), can = !mineT && own2 && atWar(own2) && reach && freeToStrike(selCity) && C.army >= 5;
    const S = siegeOf(selCity), def = own2 && !mineT ? defOf(g, selCity, own2) : 0, walls = own2 ? hasWalls(selCity, own2, g) : false, open = walls && S && S.bat >= 1;
    const pp = own2 ? null : (() => { const [x, y] = cellOf(selCity); for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const v = g[y + dy] && g[y + dy][x + dx]; if (PEOPLES[v]) return v; } return null; })();
    h += `<div class="cmp-card"><div class="cmp-h"><b>${esc(selCity[0])}</b><small>${["", "A town", "A city", "A great city"][selCity[3]]} · ${own2 ? esc(NATIONS[own2].name) : pp ? esc(PEOPLES[pp].name) : "nobody's"}</small></div>
      ${pp ? `<p>A town of ${esc(PEOPLES[pp].long)}, in their own country. It isn't any crown's to take.</p>` : ""}
      ${!mineT && own2 ? `<p class="cmp-pop">Population ${fmtN(popOf(selCity))}</p>` : ""}
      ${mineT ? townCard(g, selCity) : own2 ? `<p>Held by ${garrison(selCity)} men of the garrison, and ${the(own2)} can bring some ${fieldHelp(own2, selCity)} regiments to it${walls ? ", behind walls" : isVillage(selCity) ? ", behind a palisade" : ""}. ${!reach ? `${overSea(armyPos(), cellXY(selCity)) ? "Your army is on the other side of the Atlantic: a year at sea." : `Your army is ${yearsTo(cellXY(selCity)) > 1 ? `${yearsTo(cellXY(selCity))} years'` : "a year's"} march away.`}` : !atWar(own2) ? `You're not at war with ${the(own2)}.` : !freeToStrike(selCity) ? whyNot(selCity) : `Your odds: ${Math.round(odds(C.army * cmdMul(C.gen) * moraleK(), def, walls && !open) * 100)}%.`}</p>` : ""}
      ${S ? `<div class="cmp-siege"><b>Under siege · year ${S.years}</b><span>Garrison ${S.starve >= 0.6 ? "starving" : S.starve >= 0.3 ? "on short rations" : "well fed"} (${Math.round(garrison(selCity) * (1 - S.starve))} of ${garrison(selCity)} men fit) · walls ${S.bat >= 1 ? "breached" : `${Math.round(S.bat * 100)}% battered`}</span><i><u style="width:${Math.min(100, Math.round(S.bat * 100))}%"></u></i>${!C.supplied && C.gold >= SUPPLY_COST ? `<div class="cmp-acts"><button class="btn" data-act="supply" title="Fresh men, powder and bread for the siege lines — if they get through the enemy's raiders">Send supplies · ${SUPPLY_COST} · you escort</button><button class="btn ghost" data-act="supplyauto">Supplies · escort alone</button></div>` : C.supplied ? `<small class="cmp-fine">This year's supply train has gone.</small>` : ""}</div>` : ""}
      ${can && S ? `<div class="cmp-acts"><button class="btn primary" data-act="fight">Storm · you lead</button><button class="btn" data-act="auto">Storm · generals lead</button><button class="btn ghost" data-act="lift">Lift the siege</button></div>` : can && !C.siege ? `<div class="cmp-acts"><button class="btn primary" data-act="fight">Attack · you lead</button><button class="btn" data-act="auto">Attack · generals lead</button>${walls && !isHuman(own2) && C.army >= 8 ? `<button class="btn" data-act="siege" title="Starve it out and batter its walls, a year at a time">Lay siege</button>` : ""}</div>` : C.siege && !S && !mineT && own2 ? `<p class="cmp-fine">Your army is besieging ${esc(C.siege.ct)}: lift that siege to march here.</p>` : !C.siege && !C.moved && (mineT || (own2 && !reach)) && dist2(armyPos(), cellXY(selCity)) > 1 ? `<div class="cmp-acts"><button class="btn" data-act="goto">${overSea(armyPos(), cellXY(selCity)) ? `Ship your army here · 1 yr · ${VOYAGE} thalers` : `${mineT ? "Move your army here" : "March toward it"} · ${yearsTo(cellXY(selCity))} yr`}</button></div>` : S && C.moved ? `<div class="cmp-acts"><button class="btn ghost" data-act="lift">Lift the siege</button></div>` : ""}</div>`;
  }
  if (selFleet != null && fleetById(selFleet)) h += fleetCard(fleetById(selFleet));
  if (selFoeFleet && !selCity) h += pFleet(selFoeFleet) ? pFleetCard(selFoeFleet) : C.foeFleets && C.foeFleets[selFoeFleet] ? foeFleetCard(selFoeFleet) : "";
  if (selFoe && !selCity && C.E.war[selFoe] && NATIONS[selFoe] && isHuman(selFoe)) {
    const f = selFoe, sl = sliceOf(f) || {}, can = canFieldP(f);
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[f].color}"></i><b>${esc(poss(nameOf(f)))} army</b><small>${sl.army | 0} regiments${sl.gen ? ` · under ${esc(sl.gen.name)}` : ""}</small></div>
      <p>${can ? `Within your reach. Fall on it in the open field: your ${armyStr()} against their ${sl.army | 0}. ${nameOf(f)} chooses whether to fight it themselves, the two of you in one battle, or leave it to their general.` : C.moved ? "Your army has already marched this year." : C.siege ? "Your army is tied to its siege." : sl.pos && overSea(armyPos(), sl.pos) ? "It's on the other side of the Atlantic." : "It's beyond a year's march of your army."}</p>
      ${can ? `<div class="cmp-acts"><button class="btn primary" data-pfield="fight">Attack · you lead</button><button class="btn" data-pfield="auto">Attack · generals lead</button></div>` : ""}</div>`;
  } else if (selFoe && !selCity && C.E.war[selFoe] && NATIONS[selFoe]) {
    const f = selFoe, fp = foeArmyPos(f), tg = C.foeGo && C.foeGo[f], can = canField(f), o = can ? fieldOf(f) : null;
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[f].color}"></i><b>${esc(poss(The(f)))} army</b><small>${C.foes[f] | 0} regiments${tg ? ` · marching on ${esc(tg)}` : ""}</small></div>
      <p>${can ? `Within your reach. Fall on it in the open field, before it reaches your towns: ${(C.armies || []).length ? `your ${esc(armyName(C.ar | 0).toLowerCase())}'s` : "your army's"} ${armyStr()} against some ${o.def} of theirs. Your odds: ${Math.round(odds(o.att * cmdMul(C.gen) * moraleK() * (1 + vetK()), o.def * cmdMul(genOf(f)), false) * 100)}%.` : C.moved ? "Your army has already marched this year." : C.siege ? "Your army is tied to its siege." : fp && overSea(armyPos(), fp) ? "It's on the other side of the Atlantic." : "It's beyond a year's march of your army."}</p>
      ${can ? `<div class="cmp-acts"><button class="btn primary" data-fieldf="fight">Attack · you lead</button><button class="btn" data-fieldf="auto">Attack · generals lead</button></div>` : ""}</div>`;
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
      ${(() => { const m = muster(id, 100); return `<div class="cmp-farmy">${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => { const nm = NATIONS[id].nw ? ({ axe: "War club", bow: "Bow", musketeer: "Trade musket" }[k] || TROOPS[k].name) : TROOPS[k].name; return `<span title="${esc(nm)}: about ${n}% of their army">${unitImg(k, "", id)}<small>${esc(nm)}</small></span>`; }).join("")}</div>`; })()}
      ${NATIONS[id].nw ? `<p class="cmp-help">A nation of the woods. Their towns stand behind wooden palisades, with no stone walls to besiege; a palisade can be set alight and burnt through. Their warriors fight with the bow and the war club, a few with trade muskets. They have no guns and no horse.</p>` : ""}
      ${C.foeGen && C.foeGen[id] ? `<div class="cmp-foegen">${face(C.foeGen[id], "sm")}<span><b>${esc(C.foeGen[id].name)}</b><small>Their general · command ${"●".repeat(C.foeGen[id].st[0])}${"○".repeat(5 - C.foeGen[id].st[0])} · ${(C.fguns[id] | 0) ? `${C.fguns[id]} gun${C.fguns[id] > 1 ? "s" : ""}: they can besiege walled towns` : "no guns: walled towns are safe from them"}</small></span></div>` : ""}
      <div class="cmp-acts">${war ? `<button class="btn" data-dip="peace" ${did.peace ? "disabled" : ""}>Offer peace</button><button class="btn" data-dip="demand" ${did.peace || citiesOfNow(g, id).length < 2 ? "disabled" : ""} title="Peace, if they give up their town nearest your lands. The worse the war has gone for them, the likelier.">Demand a town for peace</button>` : `
        <button class="btn" data-dip="envoy" ${did.envoy || C.gold < 40 ? "disabled" : ""}>Send an envoy · 40</button>
        <button class="btn" data-dip="gift" ${did.gift || C.gold < 150 ? "disabled" : ""}>A gift · 150</button>
        ${C.E.pact[id] ? `<button class="btn" data-dip="unpact">${NATIONS[id].nw ? "End the fur trade" : "End the trade pact"}</button>` : `<button class="btn" data-dip="pact" ${r[id] < 20 ? "disabled title='They need to think well of you (20)'" : ""}>${NATIONS[id].nw ? "Trade for furs" : "Trade pact"}</button>`}
        ${C.ally[id] ? `<button class="btn" data-dip="unally">Break the alliance</button>` : `<button class="btn" data-dip="ally" ${r[id] < 55 || did.ally ? "disabled title='They need to be friendly (55)'" : ""}>Propose an alliance</button>`}
        ${(t => t ? `<button class="btn" data-dip="buy" ${did.buy || r[id] < 40 || C.gold < buyPrice(t) ? `disabled title="${r[id] < 40 ? "They need to think well of you (40)" : did.buy ? "Asked this year" : "The treasury hasn't the money"}"` : `title="Offer to buy ${esc(t[0])}, their town nearest your lands"`}>Buy ${esc(t[0])} · ${buyPrice(t)}</button>` : "")(NATIONS[id].nw ? null : buyable(id))}
        <button class="btn danger" data-dip="war" ${tr ? `disabled title="A treaty: ${tr} more years"` : ""}>Declare war</button>`}</div>`);
  } else if (!selCity && !armySel) h += `<div class="cmp-card cmp-help"><p><b>Click</b> a town or a crown · <b>click your army</b>, then <b>right-click</b> to march · <b>drag</b> or WASD to move · <b>wheel</b> to zoom</p></div>` + fold("how", `<span class="cmp-h"><b>How it works</b><small>armies, towns, the sea, the New World</small></span>`, `<ul class="cmp-howto">
      <li><b>A year a turn.</b> Your army marches once a year, about 350 km. A town can only be attacked, besieged or supplied from within a year's march of it. Right-click an enemy town within reach to attack it. An army that marches up to a town's walls can still attack it that year, once.</li>
      <li><b>Regiments are raised in towns.</b> Choose a town to recruit: musketeers anywhere, grenadiers where there's a drill yard, horse in a city or where the farms breed horses. Each regiment costs thalers and the town's men, and joins the army at the year's end, or holds its town as a garrison if the army is far off. A town raises one a year, a city two, a great city three.</li>
      <li><b>Garrisons.</b> With your army at one of your towns, leave regiments there to hold it, or take its garrison into the army.</li>
      <li><b>The navy.</b> Build sloops, frigates and ships of the line in your ports' dockyards. Click a fleet, then right-click on the sea to sail it: a year's sailing crosses the Atlantic. Bring a fleet to the shore where an army stands to take it aboard, sail it, and land it anywhere. Ships of your own carry an army free and guard it; hired transports cost money, and enemy fleets may fall on them. Enemy fleets come for yours in war: fight the battle at sea yourself, or leave it to your admirals. Ships that strike their colours are taken as prizes. A town on the Great Lakes has a dockyard too, for sloops and frigates that sail its lake: Huron, Michigan and Erie are joined, but Ontario and Superior keep to themselves.</li>
      <li><b>Battles in the field.</b> Click an enemy army on the map, or right-click it: if your army can reach it this year, fall on it in the open before it reaches your towns. Beaten, it falls back and its march is stopped. In a campaign for two, the other player's army can be fallen on too, and they choose whether to meet you in the field themselves.</li>
      <li><b>More than one army.</b> Form a new army from a town's garrison. Click an army on the map to give it orders; each marches, besieges and fights on its own, under its own general. Two armies in one place can join.</li>
      <li><b>People</b> grow as the land feeds them: improve the farms for more, and keep taxes light for faster growth. Heavy taxes make towns restless, and a restless town may riot and pay nothing, and a town that riots two years running rises: put it down, or buy peace with concessions. Regiments in its garrison and a school keep order. A town's people make its wealth, and fill the army's thin regiments each year.</li>
      <li><b>Over the sea</b> the army takes ship: 120 thalers, and the year. A crown's army on the far side of the Atlantic can't come to its colonies' help.</li>
      <li><b>Walled towns</b> are taken by siege: sit down before them, and the guns, hunger and sickness do their work a year at a time. Send supplies to keep your own army fed, though you'll have to fight for the convoy on the road.</li>
      <li><b>Taking a town</b> takes its whole province with it. A crown with no towns left is gone, and its land is yours.</li>
      <li><b>The woods' nations</b> raise no stone walls and have no guns. Their towns stand behind palisades: hold <kbd>F</kbd> at a length of one in battle to set it alight.</li>
      <li><b>Generals</b> serve fifty years. Their command and the army's morale decide how hard it fights. <b>Governors</b> run your towns, for a fee.</li>
      <li><b>Leagues</b> stand with their own when one is attacked, but only in wars they can reach.</li>
    </ul>`);
  // your own: the treasury's use
  reconcile();
  h += fold("army", `<span class="cmp-h"><b>${(C.armies || []).length ? esc(armyName(C.ar | 0)) : "Your army"}</b><small>${field().length} regiment${field().length === 1 ? "" : "s"}${C.levyQ ? ` (+${C.levyQ} raising)` : ""}${C.units.some(u => u.at) ? ` · ${C.units.filter(u => u.at).length} in garrisons` : ""} · ${C.guns} gun${C.guns === 1 ? "" : "s"} · ${moraleWord(C.morale ?? 50).toLowerCase()} · ${C.siege ? `besieging ${esc(C.siege.ct)}` : C.go ? "on the march" : C.moved ? "marched this year" : "ready"}</small></span>`, `
    <div class="cmp-morale"><small>Morale</small><b>${moraleWord(C.morale ?? 50)}</b><i><u style="width:${C.morale ?? 50}%"></u></i><small>${C.morale ?? 50}</small></div>
    ${(C.armies || []).length ? `<div class="cmp-armies">${armyIds().map(id => { const n2 = (C.units || []).filter(u => !u.at && (u.ar | 0) === id).length, A = id === (C.ar | 0) ? C : C.armies.find(a => a.id === id) || {}, at = A.pos ? nearTown(A.pos)[0] : ""; return `<button class="btn${id === (C.ar | 0) ? " on" : ""}" data-army="${id}"${id === (C.ar | 0) ? " disabled" : ""} title="${esc(`${armyName(id)}: ${n2} regiments, near ${at}${A.gen ? `, under ${A.gen.name}` : ", no general"} · ${A.siege ? `besieging ${A.siege.ct}` : A.go ? "on the march" : A.moved ? "marched this year" : "ready"}`)}">${esc(armyName(id))} · ${n2}<small>${esc(at)}</small></button>`; }).join("")}</div>` : ""}
    ${C.gen ? manCard(C.gen) : `<div class="cmp-nogov"><span>No general leads it: it fights the worse for it.</span>${(C.ar | 0) !== armyIds()[0] ? `<button class="btn" data-askgen="1">Choose a general</button>` : ""}</div>`}
    <div class="cmp-acts">${(C.armies || []).some(a => a.pos && dist2(a.pos, armyPos()) <= 3 && !a.siege) && !C.siege ? `<button class="btn" data-join="1">Join the other army here</button>` : ""}${field().length >= 4 && !C.siege ? `<button class="btn ghost" data-split="1" title="Half of each arm marches off as an army of its own">Split the army</button>` : ""}</div>
    ${C.emb != null && fleetById(C.emb) ? `<div class="cmp-nogov"><span>Aboard the ${esc(fleetName(fleetById(C.emb)).toLowerCase())}, off ${esc(nearTown(armyPos())[0])}.</span><button class="btn" data-land="1">Land the army</button></div>` : (f => f ? `<div class="cmp-acts"><button class="btn" data-embark="${f.id}">Take it aboard the ${esc(fleetName(f).toLowerCase())}</button></div>` : "")((C.fleets || []).find(f => !C.siege && dist2(armyPos(), f.pos) <= 5 && fleetCap(f) - aboardRegs(f.id) >= field().length && field().length))}
    ${rollHtml()}
    ${(C.lq || []).length ? `<small class="cmp-fine">Raising: ${C.lq.map(q => `${esc(TROOPS[q.k].one.toLowerCase())} at ${esc(q.t)}`).join(", ")}. They join the army at the year's end, or hold their towns if it's far off.</small>` : ""}
    <small class="cmp-fine">Regiments are raised in your towns: choose one on the map. Thin regiments fill their ranks again from your towns each year, fastest on your own land. Upkeep ${upkeep()} a year.</small>`, armySel);
  // (the taxes: three rates, the treasury against the people's growth)
  { const t = C.tax ?? 1; h += `<div class="cmp-card cmp-tax"><span class="cmp-h"><b>Taxes</b><small>${TAX[t].n}: ${t === 0 ? "the towns grow faster and are content; the treasury takes three quarters" : t === 2 ? "a quarter more for the treasury; the towns slow to grow, and restless" : "the towns' worth in full"}${(() => { const r = citiesOfNow(grid(), C.me).filter(ct => orderOf(ct) < 0).length; return r ? ` · <em class="down">${r} town${r > 1 ? "s" : ""} may riot</em>` : ""; })()}</small></span><span class="cmp-taxb">${TAX.map((x, i) => `<button class="btn${i === t ? " on" : ""}" data-tax="${i}"${i === t ? " disabled" : ""}>${x.n}</button>`).join("")}</span></div>`; }
  // (every town of yours that can raise regiments this year, in one list: a little picture of each kind to raise there)
  { const g2 = grid(), towns = citiesOfNow(g2, C.me).sort((a, b) => b[3] - a[3] || popOf(b) - popOf(a)), free = towns.reduce((t, ct) => t + Math.max(0, slotsOf(ct) - raising(ct[0]).length), 0);
    h += fold("recruit", `<span class="cmp-h"><b>Your towns</b><small>${towns.length} town${towns.length === 1 ? "" : "s"} · ${free} regiment${free === 1 ? "" : "s"} can still be raised this year</small></span>`, `<div class="cmp-rtowns">${towns.map(ct => { const n = ct[0], q = raising(n), sl = slotsOf(ct);
      return `<div class="cmp-rtown"><button class="tm-lnk" data-goto="${esc(n)}"><b>${esc(n)}</b></button><small title="People · growth a year · worth a year · public order · regiments raising this year">${fmtN(popOf(ct))} · ${(r => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}%`)(popRate(ct))} · ${worth(ct)} th · <i class="${orderOf(ct) < 0 ? "down" : ""}">${orderWord(orderOf(ct))}</i>${garUnits(n).length ? ` · ${garUnits(n).length} held` : ""} · ${q.length}/${sl}</small><span>${kindsOf(C.me).map(k => { const U = UNIT[k], c = unitCost(k, g2), bad = (U.need && !U.need(ct)) || popOf(ct) - U.men < popFloor(ct) || q.length >= sl || C.gold < c; return `<button class="cmp-rmini" data-rec="${k}" data-at="${esc(n)}" title="${esc(`${TROOPS[k].name} at ${n}: ${c} thalers, ${U.men} men`)}"${bad ? " disabled" : ""}>${unitImg(k)}</button>`; }).join("")}</span></div>`; }).join("")}</div>`); }
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
  if (b.dataset.rec && (b.dataset.at || selCity)) { doAct({ k: "recruit", t: b.dataset.at || selCity[0], u: b.dataset.rec }); return; }
  if (b.dataset.goto) { __selectTown(b.dataset.goto); return; }
  if (b.dataset.ship && selCity) { doAct({ k: "ship", t: selCity[0], u: b.dataset.ship }); return; }
  if (b.dataset.unship && selCity) { doAct({ k: "unship", t: selCity[0] }); return; }
  if (b.dataset.embark != null) { doAct({ k: "embark", id: +b.dataset.embark }); return; }
  if (b.dataset.land) { doAct({ k: "land" }); return; }
  if (b.dataset.pfield) { if (selFoe) doAct({ k: "pfield", h: selFoe, how: b.dataset.pfield }); return; }
  if (b.dataset.seap) { doAct({ k: "pvpsea", id: +b.dataset.fid, h: b.dataset.seap, hf: +b.dataset.hf }); return; }
  if (b.dataset.seaf) { const fid = b.dataset.fid != null ? +b.dataset.fid : selFleet; if (fid != null) doAct({ k: "seafight", id: fid, foe: b.dataset.seaf, how: b.dataset.how }); return; }
  if (b.dataset.fieldf && selFoe) { doAct({ k: "field", foe: selFoe, how: b.dataset.fieldf }); return; }
  if (b.dataset.army != null) { doAct({ k: "usearmy", id: +b.dataset.army }); const p2 = armyPos(), cv2 = $("cmpMap"), S2 = cv2.width / MG_W; view.ox = clamp(p2.x * S2 - cv2.width / view.z / 2, 0, cv2.width - cv2.width / view.z); view.oy = clamp(p2.y * S2 - cv2.height / view.z / 2, 0, cv2.height - cv2.height / view.z); drawMap(); return; }
  if (b.dataset.form && selCity) { doAct({ k: "form", t: selCity[0] }); return; }
  if (b.dataset.join) { doAct({ k: "join" }); return; }
  if (b.dataset.split) { doAct({ k: "split" }); return; }
  if (b.dataset.askgen) { doAct({ k: "askgen" }); return; }
  if (b.dataset.ucard) { unitCard(b.dataset.ucard); return; }
  if (b.dataset.station && selCity) { doAct({ k: "station", t: selCity[0], u: b.dataset.station }); return; }
  if (b.dataset.unstation && selCity) { doAct({ k: "station", t: selCity[0], u: b.dataset.unstation, out: true }); return; }
  if (b.dataset.tax != null) { doAct({ k: "tax", v: +b.dataset.tax }); return; }
  if (b.dataset.disband) { doAct({ k: "disband", u: b.dataset.disband }); return; }
  if (b.dataset.unrec && selCity) { doAct({ k: "unrecruit", t: selCity[0] }); return; }
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
  if (a === "newgame") { if (mp) return; drawPick(); return; }
  if (a === "resume") { if (mp && mp.host) resumeMp(); return; }
  if (b.dataset.dip) { const id = selCity ? cityOwner(grid(), selCity) : sel; doAct({ k: "dip", id, w: b.dataset.dip }); return; }
  drawMap();
}
// (after a battle fought by hand: straight back to the map)
export const campaignOn = () => !!C;
// (for the tests: the campaign's own doings, from the console)
window.__setView = v => { view = v; paint(); };
// (a town picked from a list: chosen, and the map brought round to it)
function __selectTown(n) {
  const ct = CITIES.find(c => c[0] === n); if (!ct) return; selCity = ct; sel = cityOwner(grid(), ct); armySel = false;
  const cv = $("cmpMap"), S = cv.width / MG_W, t = cellXY(ct); view.ox = clamp(t.x * S - cv.width / view.z / 2, 0, cv.width - cv.width / view.z); view.oy = clamp(t.y * S - cv.height / view.z / 2, 0, cv.height - cv.height / view.z); drawMap();
}
window.__cmp = { get eu3d() { return eu3d; }, mpt: { meetEnd: (w, k, l) => meetEnd(w, k, l), apply: (w, a) => apply(w, a), endAll: () => endAll(), as: (c, fn) => as(c, fn), sliceOf: id => sliceOf(id), fleets3d: () => fleets3d() }, nav: { harbourOf, seaPath: (a, b) => seaPath(grid(), a, b), sailAlong, cellXY, launchShips: () => launchShips(grid()), foeNavies: () => { const ids = Object.keys(NATIONS).filter(id => id !== C.me && alive(grid(), id)); foeNavies(grid(), ids); navyHunt(grid(), ids); } }, get C() { return C; }, doAct: a => doAct(a), get view() { return { ...view, on3d, dist: eu3d && eu3d.dist }; }, dist: distFrom, endSeason, diplo, march, auto, settle, grid, citiesOfNow, draw: () => drawMap(), select: (name) => { selCity = CITIES.find(c => c[0] === name) || null; sel = selCity ? cityOwner(grid(), selCity) : null; drawMap(); } };

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
    if (a.k === "recruit") { const why = recruitAt(a.t, a.u); return why ? { note: why } : { sfx: [["coin", 0.45], ["drum", 0.3, 250]] }; }
    if (C.emb != null && ["move", "march", "siege", "field", "supply"].includes(a.k)) return { note: "Your army is aboard ship: land it first." };
    if (a.k === "ship") { const why = buildShip(a.t, a.u); return why ? { note: why } : { sfx: [["coin", 0.45], ["hammer", 0.3, 300]] }; }
    if (a.k === "unship") { unbuildShip(a.t); return { sfx: [["coin", 0.35]] }; }
    if (a.k === "sail") { W0(); const why = sail(a.id, { x: clamp(+a.x, 0, MG_W - 1), y: clamp(+a.y, 0, MG_H - 1) }); return why ? { note: why } : { note: (f => f && f.go ? `The fleet is under sail: more than a year's sailing, it will be there in the years after.` : "The fleet sails, and is there by the year's end.")(fleetById(a.id)), sfx: [["bell", 0.3]] }; }
    if (a.k === "embark") { const why = embark(a.id); return why ? { note: why } : { note: "Your army goes aboard the fleet. Sail it where you will, and land it there.", sfx: [["drum", 0.35]] }; }
    if (a.k === "land") { const why = land(); return why ? { note: why } : { note: "Your army is put ashore. It can march again next year.", sfx: [["drum", 0.4]] }; }
    if (a.k === "seafight") {
      if (!canSeaFight(a.id, a.foe)) return { note: "Your fleet can't reach theirs this year." };
      const f = fleetById(a.id), F = C.foeFleets[a.foe]; f.pos = { x: F.pos.x + 0.6, y: F.pos.y + 0.6 }; f.moved = true; f.go = null; syncAboard(f);
      if (a.how === "fight") { persist(); return { sea: { id: a.id, foe: a.foe, attack: true } }; }
      const won = R() < odds(gunsOf(f.ships) * 1.05, gunsOf(F.ships), false); seaEnd(a.id, a.foe, autoSea(f.ships, F.ships, won)); persist();
      return { note: C.log.find(l => /at sea|breaks off/.test(l.title)).title + ".", sfx: [["guns", 0.6], ...(won ? [["bell", 0.45, 1800]] : [])] };
    }
    if (a.k === "pvpsea") {
      if (!canSeaFightP(a.id, a.h, a.hf)) return { note: "Your fleet can't reach theirs this year." };
      const won = pvpSea(a.id, a.h, a.hf); persist();
      return { note: `${won ? "Victory" : "Beaten"} at sea, against ${poss(nameOf(a.h))} fleet.`, sfx: [["guns", 0.6], ...(won ? [["bell", 0.45, 1800]] : [])] };
    }
    if (a.k === "searesult") { if (fleetById(a.id) && C.foeFleets && C.foeFleets[a.foe] && a.r) { seaEnd(a.id, a.foe, a.r); persist(); } return {}; }
    if (a.k === "pfield") {
      if (!canFieldP(a.h)) return { note: "Your army can't reach theirs this year." };
      const sl = sliceOf(a.h), fp = { x: sl.pos.x, y: sl.pos.y }, ct = nearTown(fp), [lon, lat] = llOf(fp.x, fp.y);
      C.moved = true; C.go = null; C.aslt = C.year; C.pos = { x: fp.x + 0.8, y: fp.y };
      if (a.how !== "fight") {
        const w = pfieldAuto(actor, a.h, ct[0]);
        tell(a.h, { note: `${nameOf(actor)} fell on your army near ${ct[0]}: ${w ? "beaten in the field" : "a victory in the field"}. See the year's news.`, sfx: [["guns", 0.6]] }); persist();
        return { note: `${w ? "Victory" : "Beaten"} in the field near ${ct[0]}.`, sfx: [["drum", 0.55], ["guns", 0.6, 900], ...(w ? [["bell", 0.45, 2300]] : [])] };
      }
      const att = C.army; as(a.h, () => C.events.push({ kind: "fieldatk", human: true, foe: actor, ar: C.ar | 0, att, def: C.army, ct: ct[0], lon, lat }));
      tell(a.h, { note: `${nameOf(actor)} falls on your army near ${ct[0]}!`, sfx: [["drum", 0.6]] }); persist();
      return { note: `Your army falls on ${poss(nameOf(a.h))} army near ${ct[0]}. ${nameOf(a.h)} must answer: meet you in the field, or leave it to their general.`, sfx: [["drum", 0.55]] };
    }
    if (a.k === "field") {
      if (!canField(a.foe)) return { note: "Your army can't reach that army this year." };
      const o = fieldOf(a.foe);
      if (a.how === "fight") { C.moved = true; C.pending = { ...o, ct: o.ct[0], ar: C.ar | 0 }; persist(); return { sfx: [["drum", 0.55]], fight: { ...o, ct: o.ct[0] } }; }
      const w = R() < odds(o.att * cmdMul(C.gen) * moraleK() * (1 + vetK()), o.def * cmdMul(genOf(o.foe)), false); fieldEnd(o, w, w ? 0.12 : 0.3, w ? 0.35 : 0.12); persist();
      return { note: C.log.find(l => /field/.test(l.title)).title + ".", sfx: [["drum", 0.55], ["guns", 0.6, 900], ...(w ? [["bell", 0.45, 2300]] : [])] };
    }
    if (a.k === "usearmy") { if (!armyIds().includes(a.id | 0)) return null; useArmy(a.id | 0); persist(); return {}; }
    if (a.k === "form") { const why = formArmy(a.t); return why ? { note: why } : { note: `A new army is formed at ${a.t} from its garrison: the ${armyName(C.ar | 0).toLowerCase()}. Choose a general for it from its card.`, sfx: [["drum", 0.5]] }; }
    if (a.k === "split") { const why = splitArmy(); return why ? { note: why } : { note: `The army is split in two: the ${armyName(C.ar | 0).toLowerCase()} marches under its own colours. Choose a general for it.`, sfx: [["drum", 0.45]] }; }
    if (a.k === "join") { const why = joinArmy(); return why ? { note: why } : { note: "The two armies march together as one.", sfx: [["drum", 0.4]] }; }
    if (a.k === "askgen") { askGeneral(); return {}; }
    if (a.k === "station") { const why = station(a.t, a.u, !!a.out); return why ? { note: why } : { sfx: [["drum", 0.3]] }; }
    if (a.k === "tax") { C.tax = clamp(a.v | 0, 0, 2); persist(); return { sfx: [["coin", 0.35]] }; }
    if (a.k === "disband") { const t = disband(a.u); if (t == null) return null; return { note: `A regiment of ${TROOPS[a.u].name.toLowerCase()} is disbanded${t ? `, its men sent home to ${t}` : ""}.`, sfx: [["drum", 0.3]] }; }
    if (a.k === "unrecruit") { unrecruit(a.t); return { sfx: [["coin", 0.35]] }; }
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
        C.gold -= VOYAGE; C.pos = { x: t.x, y: t.y }; C.go = null; C.moved = true; C.sailed = C.year;
        // (hired merchantmen, unescorted: an enemy fleet at sea may fall on them)
        const hunter = Object.keys(C.foeFleets || {}).find(id => atWar(id) && C.foeFleets[id].ships.length && R() < 0.12 + C.foeFleets[id].ships.length * 0.04);
        if (hunter) { const n0 = C.army; wearUnits(C.army * 0.3); persist(); say(`${poss(The(hunter))} fleet falls on your transports`, `Hired merchantmen, unescorted: ${n0 - C.army} regiments lost before the rest get ashore. Ships of your own would have protected them.`); return { note: C.log[0].title + ".", sfx: [["guns", 0.5]] }; }
        persist();
        return { note: `The army takes ship for the other side of the Atlantic: ${VOYAGE} thalers for the hired shipping. It lands where you sent it, and can march again next year. Ships of your own carry it free, and guard it.`, sfx: [["bell", 0.4]] };
      }
      const st = stepToward(armyPos(), t, MARCH); C.pos = { x: st.x, y: st.y }; C.go = st.arrived ? null : t; C.moved = true; persist();
      return { note: st.arrived ? "Your army marches, and is there by the year's end." : `Your army is on the march: ${yearsTo(t)} more year${yearsTo(t) > 1 ? "s" : ""} to get there.`, sfx: [["drum", 0.45]] };
    }
    if (a.k === "lift") { if (!C.siege) return null; const n = C.siege.ct; C.siege = null; persist(); return { note: `The siege of ${n} is lifted. The army is free to march.`, sfx: [["drum", 0.5]] }; }
    if (a.k === "march") {
      const ct = city(a.ct), o = ct && march(ct); if (!o) return { note: ct ? whyNot(ct) : "Your army can't march there now." };
      if (isHuman(o.foe)) return humanMarch(actor, o, a.how);
      if (a.how === "fight") { C.pending = { ...o, ct: ct[0] }; persist(); return { sfx: [["drum", 0.55]], fight: { ...o, ct: ct[0] } }; }
      const w = auto(o); persist();
      return { note: w ? `${ct[0]} is yours.` : `The attack on ${ct[0]} failed.`, sfx: [["drum", 0.55], ["guns", 0.6, 900], ...(w ? [["bell", 0.45, 2300]] : [])] };
    }
    if (a.k === "ev") {
      const ev = C.events[a.i | 0]; if (!ev || ev.done) return null; ev.done = true;
      const done = r => { C.events = C.events.filter(x => !x.done); persist(); return r; };
      if (ev.kind === "peace") {
        if (a.how === "yes") { if (ev.cede) { const t = city(ev.cede); if (t && cityOwner(g, t) === C.me) { seize(t, ev.foe); if (C.govs) delete C.govs[t[0]]; say(`${t[0]} is given up`, `The price of peace with ${the(ev.foe)}.`); } } makePeace(ev.foe); if (ev.human) as(ev.foe, () => makePeace(actor)); C.gold += ev.gold || 0; return done({ sfx: [["quill", 0.5], ["seal", 0.6, 900], ...(ev.gold ? [["coin", 0.4, 1300]] : [])] }); }
        C.E.rel[ev.foe] -= 5; if (ev.human) tell(ev.foe, { note: `${nameOf(actor)} won't make peace.` }); return done({ sfx: [["drum", 0.45]] });
      }
      if (ev.kind === "ally" || ev.kind === "pact") {
        if (a.how === "yes") { const both = (x, y) => as(x, () => { if (ev.kind === "ally") C.ally[y] = true; else C.E.pact[y] = true; C.E.rel[y] = Math.max(C.E.rel[y], 40); say(ev.kind === "ally" ? `An alliance with ${nameOf(y)}` : `A trade pact with ${nameOf(y)}`); }); both(actor, ev.foe); both(ev.foe, actor); tell(ev.foe, { note: `${nameOf(actor)} ${v3(actor, "agrees")}.`, sfx: [["seal", 0.6]] }); return done({ sfx: [["quill", 0.5], ["seal", 0.6, 850]] }); }
        tell(ev.foe, { note: `${nameOf(actor)} ${v3(actor, "declines")}.` }); return done({});
      }
      if (ev.kind === "seabattle") {
        const f = fleetById(ev.fid), F = C.foeFleets && C.foeFleets[ev.foe]; if (!f || !F || !f.ships.length || !F.ships.length) return done({});
        if (a.how === "fight") return done({ sea: { id: ev.fid, foe: ev.foe, attack: false } });
        const won = R() < odds(gunsOf(f.ships), gunsOf(F.ships), false); seaEnd(ev.fid, ev.foe, autoSea(f.ships, F.ships, won));
        return done({ note: C.log.find(l => /at sea|breaks off/.test(l.title)).title + ".", sfx: [["guns", 0.6]] });
      }
      if (ev.kind === "rising") {
        const ct = city(ev.ct); if (!ct || cityOwner(g, ct) !== C.me) return done({});
        if (a.how === "concede") { const c = worth(ct) * 2; C.gold -= c; say(`${ct[0]} is quieted`, `Its grievances heard and ${c} thalers in concessions: the town goes back to its work.`); return done({ sfx: [["coin", 0.45], ["quill", 0.4, 500]] }); }
        const mine = garrison(ct) + helpNear(ct), w = R() < odds(mine, ev.att, false);
        if (w) { C.pop[ct[0]] = Math.round(popOf(ct) * 0.96); say(`The rising in ${ct[0]} is put down`, "The garrison clears the streets. The ringleaders hang, and the town is quiet, for now."); }
        else { const G = garUnits(ct[0]).length; C.units = C.units.filter(u => u.at !== ct[0]); C.pop[ct[0]] = Math.round(popOf(ct) * 0.9); C.gold -= worth(ct); say(`The rising in ${ct[0]} wins the day`, `The garrison is overwhelmed${G ? `, ${G} regiment${G > 1 ? "s" : ""} of it lost` : ""}, the town's books burned and a year's taxes lost before order is restored.`); }
        return done({ sfx: [["drum", 0.5], ["guns", 0.4, 700]] });
      }
      if (ev.kind === "fieldatk" && ev.human) {
        if (armyIds().includes(ev.ar | 0)) useArmy(ev.ar | 0);
        if (C.army < 1) return done({});
        if (a.how === "fight") { done(); return meet(ev.foe, actor, { attack: true, field: true, foe: actor, ct: ev.ct, att: ev.att, def: C.army, walls: false, lon: ev.lon, lat: ev.lat }); }
        const w = !pfieldAuto(ev.foe, actor, ev.ct);
        tell(ev.foe, { note: `${nameOf(actor)} left the battle near ${ev.ct} to their general: ${w ? "you're beaten in the field" : "a victory in the field"}. See the year's news.`, sfx: [["guns", 0.6]] });
        return done({ note: `${w ? "Victory" : "Beaten"} in the field near ${ev.ct}.`, sfx: [["guns", 0.6], ...(w ? [["bell", 0.45, 1800]] : [])] });
      }
      if (ev.kind === "fieldatk") {
        if (armyIds().includes(ev.ar | 0)) useArmy(ev.ar | 0);
        const ct = city(ev.ct), o = { attack: false, field: true, foe: ev.foe, ct, att: ev.att, def: C.army, walls: false };
        if (!ct || C.army < 1) return done({});
        if (a.how === "fight") { C.pending = { ...o, ct: ct[0], ar: C.ar | 0 }; return done({ sfx: [["drum", 0.55]], fight: { ...o, ct: ct[0] } }); }
        const w = R() < odds(o.def * cmdMul(C.gen) * moraleK() * (1 + vetK()), o.att * cmdMul(genOf(o.foe)), false); fieldEnd(o, w, w ? 0.12 : 0.3, w ? 0.35 : 0.12);
        return done({ note: C.log.find(l => /field/.test(l.title)).title + ".", sfx: [["guns", 0.6], ...(w ? [["bell", 0.45, 1800]] : [])] });
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
        const o = { attack: false, foe: ev.foe, ct, att: ev.att, def: ev.def, walls: ev.walls, army: ev.army !== false };
        if (a.how === "fight") { C.pending = { ...o, ct: ct[0] }; return done({ fight: { ...o, ct: ct[0] } }); }
        const held = auto(o); return done({ sfx: [["guns", 0.6], ...(held ? [["bell", 0.4, 1600]] : [])] });
      }
      return done({});
    }
    if (a.k === "result") {
      const P = C.pending; if (!P) return null; C.pending = null; if (P.ar != null && armyIds().includes(P.ar)) useArmy(P.ar);
      const ct = city(P.ct);
      if (P.field) { if (a.left) { fieldEnd({ ...P, ct }, false, 0.3, 0.05); persist(); return {}; } const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.8 + 0.05, t = Math.min(0.9, (a.killed || 0) / Math.max(1, a.theirMen || 20)) * 0.8 + 0.05; fieldEnd({ ...P, ct }, a.won, k, t); persist(); return { sfx: a.won ? [["bell", 0.4, 1200]] : [] }; }
      if (P.convoy) { const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.6 + 0.03; convoyEnd({ ...P, ct }, !a.left && a.won, k, 0); persist(); return { sfx: a.won ? [["bell", 0.4, 1200]] : [] }; }
      if (a.left) { settle({ ...P, ct }, false, 0.3, 0.05); C.log[0].sub += " (You left the field.)"; persist(); return {}; }
      const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.8 + 0.05, t = Math.min(0.9, (a.killed || 0) / Math.max(1, a.theirMen || 20)) * 0.8 + 0.05;
      settle({ ...P, ct }, a.won, k, t);
      // (a player's town taken from their garrison: told to them)
      if (isHuman(P.foe) && P.attack) as(P.foe, () => say(a.won ? `${P.ct} has fallen` : `${P.ct} holds`, a.won ? `${nameOf(actor)} ${v3(actor, "takes")} it from its garrison.` : `${poss(nameOf(actor))} attack is thrown back by the garrison.`));
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
      if (a.role === "general") { const ev = C.events[a.ev]; if (!ev || ev.kind !== "appoint" || ev.done || !ev.cands[a.i]) return null; const was = C.ar | 0; if (armyIds().includes(ev.ar | 0)) useArmy(ev.ar | 0); C.gen = { ...ev.cands[a.i], served: 0 }; const gn = C.gen.name, an = C.ar | 0; useArmy(was); ev.done = true; persist(); return { note: `${gn} takes command of ${an ? `the ${armyName(an).toLowerCase()}` : "your army"}.`, sfx: [["seal", 0.45], ["drum", 0.35, 400]] }; }
      const ct = city(a.town), list = ct && C.govCands[ct[0]]; if (!list || !list[a.i] || cityOwner(g, ct) !== C.me) return null;
      const fee = govFee(list[a.i], ct); if (C.gold < fee) return { note: `The office costs ${fee} thalers, and the chest hasn't got it.` };
      C.gold -= fee; C.govs[ct[0]] = { ...list[a.i], served: 0, town: ct[0] }; delete C.govCands[ct[0]]; persist();
      return { note: `${C.govs[ct[0]].name} is made governor of ${ct[0]}, for ${fee} thalers.`, sfx: [["seal", 0.45], ["coin", 0.4]] };
    }
    if (a.k === "rule") { const ct = city(a.ct); if (!ct || cityOwner(g, ct) !== C.me) return null; C.rule[ct[0]] = !!a.on; persist(); return {}; }
    // (a march called off before the battle's fought: the army back in camp, free to march again this year)
    if (a.k === "calloff") { const P = C.pending; if (!P || !P.attack) return null; C.pending = null; C.moved = !!P.was; C.aslt = null; persist(); return { note: `The march on ${P.ct} is called off. The army is back in camp.`, sfx: [["drum", 0.3]] }; }
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
    as(o.foe, () => say(w ? `${name} has fallen` : `${name} holds`, w ? `${poss(nameOf(actor))} generals take it.` : `${poss(nameOf(actor))} army is thrown back.`));
    tell(o.foe, { note: w ? `${nameOf(actor)} ${v3(actor, "has")} taken ${name}!` : `${name} held against ${nameOf(actor)}.`, sfx: [["guns", 0.6]] }); persist();
    return { note: w ? `${name} is yours.` : `The attack on ${name} failed.`, sfx: [["drum", 0.55], ["guns", 0.6, 900], ...(w ? [["bell", 0.45, 2300]] : [])] };
  }
  as(o.foe, () => C.events.push({ kind: "attack", foe: actor, human: true, ct: name, att: o.att, def: o.def, walls: o.walls }));
  tell(o.foe, { note: `${nameOf(actor)} ${v3(actor, "marches")} on ${name}!`, sfx: [["drum", 0.6]] }); persist();
  return { note: `Your army marches on ${name}. ${nameOf(o.foe)} must answer: meet you on the field, or leave it to the garrison.`, sfx: [["drum", 0.55]] };
}
// ---- two players' armies in the open field: one falls on the other's army, wherever it stands within a year's march ----
function canFieldP(h) {
  if (!C.mp || !isHuman(h) || h === C.me || !atWar(h) || C.moved || C.siege || C.emb != null || C.army < 5) return false;
  const sl = sliceOf(h), fp = sl && sl.pos; if (!fp || !isFinite(fp.x) || (sl.army | 0) < 3 || sl.emb != null || sl.siege) return false;
  return !overSea(armyPos(), fp) && yearsTo(fp) <= 1;
}
// (the battle's end for both: each army's losses and experience, the winner's general the greater for it, the beaten
//  army thrown back toward home — and each player told)
function pfieldEnd(attacker, defender, aWon, kA, kD, near) {
  const side = (crown, won, k, foe) => as(crown, () => {
    const n0 = C.army; wearUnits(C.army * k);
    for (const u of field()) u.xp = Math.min(3, (u.xp || 0) + (won ? 0.6 : 0.3));
    moraleMove(won ? 10 : -12); if (won) genWin();
    if (!won) { const mh = homeOf(grid(), C.me); if (mh) { const b = stepToward(armyPos(), mh, 4); C.pos = { x: b.x, y: b.y }; } C.go = null; }
    say(won ? `Victory in the field near ${near}` : `Beaten in the field near ${near}`, `Against ${poss(nameOf(foe))} army: men enough for ${n0 - C.army} of your regiments lost. ${won ? "Theirs falls back toward home." : "Your army falls back toward home."} ${armyStr()} left.`);
  });
  side(attacker, aWon, kA, defender); side(defender, !aWon, kD, attacker);
}
// (decided by the generals: each army's strength, its general, its spirit — and luck)
function pfieldAuto(attacker, defender, near) {
  const A = sliceOf(attacker), D = sliceOf(defender), str = sl => (sl.army | 0) * cmdMul(sl.gen) * clamp((sl.morale ?? 60) / 60, 0.6, 1.3);
  const w = R() < odds(str(A), str(D), false); pfieldEnd(attacker, defender, w, w ? 0.12 : 0.3, w ? 0.3 : 0.12, near); return w;
}
// the two players on one field: the battle hosted by the campaign's host, each company as big as their armies
function meet(attacker, defender, att) {
  const key = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  // (each chooses who takes the field first — the field met once both have)
  C.mp.meet = { key, att: { ...att }, attacker, defender, pick: {} };
  for (const crown of [attacker, defender]) {
    const regs = crown === attacker ? att.att : att.def, foe = crown === attacker ? defender : attacker;
    tell(crown, { muster: { key, regs, title: att.field ? (crown === attacker ? `Attack ${poss(nameOf(defender))} army` : `Stand against ${poss(nameOf(attacker))} army`) : crown === attacker ? `March on ${att.ct}` : `Hold ${att.ct}`, foe: `${nameOf(foe)}, at the head of ${the(foe)}, has ${crown === attacker ? att.def : att.att} regiments, and is choosing their men as you choose yours.` } });
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
  const at = { name: att.field ? `Near ${ct[0]}` : ct[0], lon: att.field && att.lon != null ? att.lon : ct[1], lat: att.field && att.lat != null ? att.lat : ct[2], date: `${SEASONS[C.s]} ${C.year}`, at: att.field ? `${nameOf(attacker)} ${v3(attacker, "falls")} on ${poss(nameOf(defender))} army, in the open` : `${nameOf(attacker)} ${v3(attacker, "marches")} on ${poss(nameOf(defender))} town`,
    // (the town itself, to be fought in: whose end it's at, how big, its walls, or a village's palisade)
    def: defender === hostC ? 0 : 1, rank: att.field ? 0 : ct[3], walls: !att.field && att.walls ? Math.max(1, lvOf(ct[0], "walls")) : 0, village: !att.field && isVillage(ct), seed: Math.round(ct[1] * 1000 + ct[2] * 100) };
  for (const crown of [attacker, defender]) tell(crown, { meet: { key, side: crown === hostC ? 0 : 1, foe: crown === attacker ? defender : attacker, army: crown === attacker ? A : D, theirs: crown === attacker ? D : A, ct: att.ct, at } });
  persist();
}
// (the meeting's outcome, from the host's game: the town taken or held)
function meetEnd(wonHost, killed, lost, left) {
  const M = C.mp && C.mp.meet; if (!M) return; C.mp.meet = null;
  const hostC = humans()[0], aWon = (hostC === M.attacker) === !!wonHost;
  const lostA = hostC === M.attacker ? lost : killed, lostD = hostC === M.attacker ? killed : lost;
  const ct = CITIES.find(c => c[0] === M.att.ct);
  if (M.att.field) { pfieldEnd(M.attacker, M.defender, aWon, Math.min(0.9, lostA / Math.max(1, M.menA)) * 0.8 + 0.05, Math.min(0.9, lostD / Math.max(1, M.menD)) * 0.8 + 0.05, M.att.ct); persist(); broadcast(); return; }
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
  if (r.sea) { const q = r.sea; seaFight(q.id, q.foe, q.attack, res => { doAct({ k: "searesult", id: q.id, foe: q.foe, r: res }); drawMap(); }); return; }
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
      onFail: why => { note = why; if (mp && mp.host) { const Mt = C.mp.meet; if (Mt) { C.mp.meet = null; if (Mt.att.field) pfieldAuto(Mt.attacker, Mt.defender, Mt.att.ct); else as(Mt.attacker, () => { const w = auto({ ...Mt.att, ct: CITIES.find(c => c[0] === Mt.att.ct) }); void w; }); broadcast(); } } openCampaign(); } });
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
