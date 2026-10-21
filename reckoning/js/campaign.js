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
import { G } from "./engine.js";
import { NATIONS, NATION_FAITH, CITIES, buildGrid, buildGridRO, cityOwner, gridOf, llOf, drawEurope, cityAt, nationAt, relWord, the, The, MAP_ASPECT, MG_W, MG_H, useSheet, PEOPLES, peopleAt } from "./europe.js";
import { EuropeView3D } from "./europe3d.js";
import { TROOPS } from "./pvp.js";
import { UNI_OF_NATION, UNIFORMS, soldierLook, coloursCanvas } from "./battle.js";
import { plateOf, wayOfUniform } from "./unitart.js";
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
export const UNI_OF = UNI_OF_NATION;
const STYLE = {
  west: [["musketeer", 0.52], ["militia", 0.06], ["pike", 0.15], ["grenadier", 0.1], ["cavalry", 0.1], ["sword", 0.07]],
  east: [["musketeer", 0.36], ["militia", 0.06], ["bow", 0.22], ["sword", 0.2], ["cavalry", 0.16]],
  steppe: [["musketeer", 0.36], ["militia", 0.06], ["cavalry", 0.22], ["sword", 0.16], ["bow", 0.1], ["pike", 0.1]],
  tsar: [["musketeer", 0.6], ["militia", 0.06], ["pike", 0.18], ["cavalry", 0.08], ["axe", 0.08]],
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
// (where Back goes: the battles menu, or the title, whichever the campaign was opened from)
let cmpHome = "pvp";
const MPKEY = "reckoning.campaign.mp.v1";
// (three campaigns kept side by side: a new one doesn't cost you the one you have)
const SLOTS = 3, SLOTKEY = "reckoning.campaign.slot", slotKey = i => i ? `${KEY}.${i + 1}` : KEY;
let slot = (() => { try { return Math.min(SLOTS - 1, Math.max(0, +localStorage.getItem(SLOTKEY) || 0)); } catch (e) { return 0; } })();
const campaigns = () => { const out = []; for (let i = 0; i < SLOTS; i++) { const c = load(i); if (c && c.me && NATIONS[c.me]) out.push({ i, c }); } return out.sort((a, b) => (b.c.at || 0) - (a.c.at || 0)); };
const save = () => { try { if (!C) return; if (C.mp) { if (mp && mp.host) localStorage.setItem(MPKEY, JSON.stringify({ partner: mp.foe.pid || "", partnerName: mp.foe.name || "", C })); return; } C.at = Date.now(); C.towns = citiesOfNow(grid(), C.me).length; localStorage.setItem(slotKey(slot), JSON.stringify({ ...C, own: packOwn(C.own), E: { ...C.E, conq: [] } })); localStorage.setItem(SLOTKEY, String(slot)); } catch (e) { if (!saveWarned) { saveWarned = true; try { answer("Your campaign couldn't be saved: the game's storage is full. Give up an old campaign from the list to make room."); } catch (e2) {} } } };
let saveWarned = false;
// (the map's changed squares kept small: by crown, each a run of "col,row;" — and the map's own copy of them left out,
//  made again from these when the campaign is opened. Sixty years of conquest was near a megabyte, written as it was)
function packOwn(L) { if (!Array.isArray(L)) return L; const by = {}; for (const [k, to] of L) (by[to] ||= []).push(k); for (const t in by) by[t] = by[t].join(";"); return { packed: 1, by }; }
function unpackOwn(x) { if (!x) return []; if (Array.isArray(x)) return x; const out = []; for (const [to, s2] of Object.entries(x.by || {})) for (const k of s2.split(";")) if (k) out.push([k, to]); return out; }
// (the story's own campaign — Part Three's commission — kept apart from the three of yours, and not listed with them)
const STORY_SLOT = 9;
const ownSlot = () => { try { return Math.min(SLOTS - 1, Math.max(0, +localStorage.getItem(SLOTKEY) || 0)); } catch (e) { return 0; } };
let storyHome = null;
const load = (i = slot) => { try { return JSON.parse(localStorage.getItem(slotKey(i))); } catch (e) { return null; } };

// ---- a campaign of two: each player's crown its own treasury, army, dealings with the others, wars and news ----
// The campaign holds one crown "on top" (C.me, and these fields of C) and the other's put by in C.H; as(crown, fn)
// does a thing as that crown, and puts everything back. The shared things — the year, the map, the other crowns'
// armies and wars — are C's own.
const SLICE = ["gold", "army", "moved", "did", "ally", "truce", "warT", "took", "lost", "events", "log", "over", "won", "pending", "tech", "guns", "gen", "govs", "govCands", "levyQ", "lq", "units", "tax", "armies", "ar", "fleets", "sq", "rule", "morale", "siege", "supplied", "pos", "go", "aslt",
  // (and each player's own: the army in hand aboard ship or on its way to join another, their government, the courts they
  //  have spies in, their protectorates, scholars exchanged, a crown without a town, the towns they've sacked)
  "emb", "joinTo", "sailed", "govt", "spies", "vassal", "learnX", "exile", "sacked"];
let mp = null;    // (the link to the other player: { net, side, host, foe, ... } — null playing alone)
const humans = () => (C && C.mp ? C.mp.humans : []);
const isHuman = id => humans().includes(id);
function stash(c) { const o = {}; for (const k of SLICE) o[k] = C[k]; o.rel = C.E.rel; o.war = C.E.war; o.pact = C.E.pact; (C.H ||= {})[c] = o; }
function unstash(c) { const o = C.H[c]; for (const k of SLICE) C[k] = o[k]; C.E.rel = o.rel; C.E.war = o.war; C.E.pact = o.pact; delete C.H[c]; C.me = c; }
function as(c, fn) { if (!C.mp || c === C.me || !C.H || !C.H[c]) return fn(); const was = C.me; stash(was); unstash(c); try { return fn(); } finally { stash(c); unstash(was); } }
const sliceOf = id => id === C.me ? C : (C.H && C.H[id]) || null;
// (a crown's army: a player's regiments, or the computer's)
// ---- the other crowns' colonial armies: a crown of Europe with towns over the Atlantic keeps companies there of
//  their own, as they did — the army at home can't come to them. One for each such crown, on the map in the New World,
//  marching on your colonies in war and holding its own; reached by the key "<crown>~c" where a crown's army is asked for ----
const COLO = "~c", isColo = k => typeof k === "string" && k.endsWith(COLO), crownOf = k => isColo(k) ? k.slice(0, -COLO.length) : k;
const naTowns = (g, id) => citiesOfNow(g, id).filter(c => seaSide(cellXY(c)));
const coloCap = n => 4 + n * 3;
// (made up once for a campaign, and kept: which crowns have one, how strong, where it stands)
function colonies() {
  if (C.colo) return C.colo; C.colo = {}; const g = grid();
  for (const id of Object.keys(NATIONS)) {
    if (id === C.me || isHuman(id) || !alive(g, id)) continue; const h = homeOf(g, id); if (!h || seaSide(h)) continue;
    const na = naTowns(g, id); if (!na.length) continue; const big = na.sort((a, b) => b[3] - a[3])[0], t = cellXY(big);
    C.colo[id] = { n: 3 + na.length * 2, pos: { x: t.x + 0.8, y: t.y + 0.6 } };
  }
  return C.colo;
}
const coloOf = id => colonies()[crownOf(id)] || null;
// (the colonial army that answers for a town: the crown's, when the town is over the water from its army at home and on
//  the colony army's side of it)
function coloFor(id, ct) { const c = coloOf(id); if (!c || isHuman(id)) return null; const t = cellXY(ct), fp = foeArmyPos(id); return !overSea(c.pos, t) && (!fp || overSea(fp, t)) ? c : null; }
// (the year: made up a little as the colonies can find men; gone with the last of the crown's towns over there)
function coloniesYear(g) {
  const CO = colonies();
  for (const id of Object.keys(CO)) {
    const na = naTowns(g, id); if (!na.length || !alive(g, id)) { delete CO[id]; continue; }
    const c = CO[id], beat = C.foeBeat && C.foeBeat[id] != null && C.year - C.foeBeat[id] < 2;
    c.n = Math.min(Math.max(c.n, coloCap(na.length)), c.n + (beat ? 0 : 1) + (na.length >= 6 ? 1 : 0));
    if (!c.go && dist2(c.pos, cellXY(na.sort((a, b) => b[3] - a[3])[0])) > MARCH * 2) { const t = cellXY(na[0]); c.pos = { x: t.x + 0.8, y: t.y + 0.6 }; }
  }
}
// ---- what you know of another crown's army: nothing of its size, until a man at its court is in your pay ----
const SPY_COST = 300;
const knowsArmy = id => !id || isHuman(id) || !!(C.spies && C.spies[id]);
// (its strength as you can say it: the number, or a question mark)
const foeSize = id => knowsArmy(crownOf(id)) ? String(isColo(id) ? (coloOf(id) || {}).n | 0 : C.foes[id] | 0) : "?";
const foeArmy = id => isHuman(id) ? (s2 => s2 ? (s2.army | 0) + (s2.armies || []).reduce((t, a) => t + (a.army | 0), 0) : 0)(sliceOf(id)) : C.foes[id] || 0;
// (for a player, the change falls on the army they have in hand — foeArmy counts all their armies together)
const setFoeArmy = (id, v) => { if (isHuman(id)) { const s2 = sliceOf(id); if (s2) s2.army = Math.max(0, Math.round((s2.army | 0) + v - foeArmy(id))); } else C.foes[id] = v; };
// (a verb after a crown's name: a people takes the plural — "the Cherokee march", not "marches")
// (a name's possessive: "the Papal States'", not "States's")
const poss = n => /s$/.test(n) ? n + "'" : n + "'s";
// (a crown named in the plural takes a plural verb, as a people does: the Papal States wall Genova)
const v3 = (id, v) => !(NATIONS[id] && (NATIONS[id].people || /\b(States|Provinces|Netherlands|Isles|Islands|Cossacks)$/.test(NATIONS[id].name))) || (C && C.mp && C.mp.names[id]) ? v : v === "has" ? "have" : v === "is" ? "are" : v === "marches" ? "march" : v.replace(/s$/, "");
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
const grid = () => (W0(), buildGridRO(E()));
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
// (and the trade of 1683: the old Anglo-Portuguese wine and cloth, the Muscovy and Levant companies, the Dutch in every
//  port from Archangel to Smyrna and Danzig's grain, France's capitulations with the Porte, the Sultan's regencies; over
//  the water, the fur trade at Albany, Montréal and the Bay, and Carolina's deerskins)
const TRADE_1683 = [["england", "portugal"], ["england", "dutch"], ["england", "castile"], ["england", "russia"], ["england", "tuscany"], ["england", "ottoman"],
  ["dutch", "sweden"], ["dutch", "denmark"], ["dutch", "russia"], ["dutch", "ottoman"], ["dutch", "poland"], ["dutch", "brandenburg"], ["dutch", "portugal"],
  ["france", "ottoman"], ["france", "denmark"], ["venice", "ottoman"], ["castile", "aragon"], ["castile", "naples"], ["castile", "portugal"], ["sweden", "brandenburg"],
  ["poland", "brandenburg"], ["austria", "venice"], ["hre", "dutch"], ["saxony", "poland"], ["bavaria", "venice"], ["savoy", "france"], ["papal", "tuscany"], ["sicily", "naples"],
  ["ottoman", "algiers"], ["ottoman", "tunis"], ["ottoman", "tripoli"], ["ottoman", "crimea"], ["morocco", "england"], ["scotland", "england"], ["ireland", "england"],
  ["england", "p_iroquois"], ["england", "p_cree"], ["england", "p_creek"], ["france", "p_anishinaabe"], ["france", "p_wabanaki"], ["france", "p_illinois"], ["france", "p_dakota"]];
const leagueOf = (a, b) => LEAGUES_1683.find(L => L.ids.includes(a) && L.ids.includes(b));
// (the leagues' word kept among the other crowns: allies of a crown that's attacked come in on its side)
const alliesOf = id => [...new Set(LEAGUES_1683.filter(L => L.ids.includes(id)).flatMap(L => L.ids))].filter(x => x !== id);
// a new campaign, as a crown
// (the great fortresses of 1683: walled from the first year, as they stood — Vienna that the Turks were sitting down
//  before, the Danube and Dniester strongholds, Candia's Venetian bastions, Strasbourg and the Baltic ports)
const FORTS_1683 = ["Wien", "Buda", "Belgrad", "Kamieniec", "Candia", "Azov", "Strassburg", "Antwerpen", "Hamburg", "Danzig", "Riga", "Kiøbenhavn",
  // (and the rest of the towns that stood behind walls in 1683: the old free cities, the fortress towns of the frontiers,
  //  the great capitals' citadels, and the Spanish and French strongholds over the sea)
  "Constantinopolis", "Prag", "Kraków", "Nürnberg", "Köln", "Magdeburg", "Lübeck", "Bremen", "Königsberg", "Reval", "Stettin", "Breslau",
  "Lemberg", "Smolensk", "Kiev", "Novgorod", "Moskva", "Torino", "Milano", "Genova", "Ragusa", "Graz", "Pressburg", "Kaffa", "Oran", "Cádiz",
  "Brest", "Göteborg", "La Habana", "Québec"];
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
  // (the trade you begin with: 1683's, else the friendliest crown at peace with you; their merchants well thought of)
  const pact = {};
  // (the chief four of them at the most — the list has each crown's oldest and greatest trade first — and two for a
  //  nation of the woods: a dozen at once was a fortune from the first year)
  TRADE_1683.map(([x, y]) => x === me ? y : y === me ? x : null).filter(f => f && NATIONS[f] && !war[f]).slice(0, NATIONS[me].nw ? 2 : 4).forEach(f => { pact[f] = true; });
  if (!Object.keys(pact).length) { const f = Object.keys(rel).filter(id => !war[id] && !!NATIONS[id].nw === !!NATIONS[me].nw).sort((x, y) => rel[y] - rel[x])[0]; if (f && rel[f] >= 0) pact[f] = true; }
  for (const f of Object.keys(pact)) rel[f] = Math.max(rel[f], 20);
  return { v: 1, gridV: 6, me, year: 1683, s: 0, gold: 200 + NATIONS[me].strength * 60, army: NATIONS[me].strength * 10 + 6, moved: false, did: {},
    E: { rel, war, wars, conq: [], pact, plague: {}, famine: {}, beaten: {}, news: [], gridV: 2 },
    foes: army, ally, truce: {}, warT: {}, took: {}, lost: {}, events: [], log: [], pending: null, over: null, won: false, own: [],
    walls: Object.fromEntries(FORTS_1683.filter(n => CITIES.some(c => c[0] === n)).map(n => [n, 1])), forts2: 1 };
}
function begin(me, into = slot) {
  slot = into; spreadOf = ""; C = fresh(me); ensureRealm(); own = new Map(); warmMaps();
  // (England, the sea power: its fleet already in being in 1683, six ships lying off its capital)
  if (me === "england") { const g = grid(), ct = citiesOfNow(g, me).sort((a, b) => b[3] - a[3]).find(c => harbourOf(c)), hb = ct && harbourOf(ct); if (hb) C.fleets = [{ id: 0, pos: { x: hb.x, y: hb.y }, ships: navyMix(me, 6), moved: false, go: null }]; }
  // (the colonies over the Atlantic: companies of their own in each town, as they had — the army at home can't come to
  //  them: a regiment of foot in each, two in a colony's chief towns, and the settlers' militia)
  { ensureUnits(); const g = grid(), home = homeOf(g, me);
    if (home && !seaSide(home)) for (const ct of citiesOfNow(g, me).filter(c => seaSide(cellXY(c)))) { const n = ct[3] >= 2 ? 2 : 1; for (let i = 0; i < n; i++) C.units.push({ k: "musketeer", hp: 1, at: ct[0] }); C.units.push({ k: "militia", hp: 1, at: ct[0] }); } }
  // (a nation of the woods with one town: its warriors don't all go with the war party — some stay to hold the palisade,
  //  or the first raid on it while the army's away ends everything)
  if (NATIONS[me].nw) { const g = grid(), T = citiesOfNow(g, me); if (T.length === 1) { const kinds = {}; for (const u of C.units) if (!u.at) kinds[u.k] = (kinds[u.k] || 0) + 1; const k = Object.entries(kinds).sort((x, y) => y[1] - x[1])[0]; for (let i = 0; i < 6; i++) C.units.push({ k: k ? k[0] : "militia", hp: 1, at: T[0][0] }); } }
  // (where you stand in 1683: your league, your wars)
  const al = Object.keys(C.ally).filter(id => C.ally[id]), wr = Object.keys(C.E.war).filter(id => C.E.war[id]);
  for (const L of LEAGUES_1683.filter(L => L.ids.includes(me))) { const o = L.ids.filter(x => x !== me).map(x => the(x)); say(`You are in ${L.n}`, `With ${o.length > 1 ? o.slice(0, -1).join(", ") + " and " + o[o.length - 1] : o[0]}.`); }
  if (wr.length) say(`At war`, `You are already at war with ${wr.length > 1 ? wr.slice(0, -1).map(x => the(x)).join(", ") + " and " + the(wr[wr.length - 1]) : the(wr[0])}.`);
  say(`${The(me)} — ${C.year}`, `You take the crown. ${citiesOfNow(grid(), me).length} towns, ${C.army} regiments, ${C.gold} thalers in the treasury.${al.length ? ` Allies: ${al.length}.` : ""}`);
  save();
}
function resume() {
  C = load(); if (!C) return false; C.own = unpackOwn(C.own); own = new Map(C.own); C._dirty = true; toWorldGrid(); ensureRealm();
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
function say(title, sub = "", kind) { C.logN = (C.logN | 0) + 1; C.log.unshift({ t: `${C.year}`, n: C.logN, title, sub, ...(kind ? { kind } : {}) }); C.log.length = Math.min(C.log.length, 60); }
// (what a learning costs, and the years it takes at the least: deeper in its branch, the longer)
// (what a nation of the woods has no use for: guns, and the stone forts built against them)
const NOT_WOODS = new Set(["founding", "fieldart", "trace"]);
const techFor = id => !(NOT_WOODS.has(id) && NATIONS[C.me] && NATIONS[C.me].nw);
const techDepth = id => { const r = TECHS[id].req || []; return r.length ? 1 + Math.max(...r.map(techDepth)) : 0; };
const techCost = id => TECHS[id].cost;   // (as it was: the years it takes at the least are what keep a great realm from learning a thing a year)
const techYears = id => 2 + Math.min(2, techDepth(id));
// ---- the year's news as the gazettes printed it: your own crown's paper, the year's great matter for its headline
//  under a woodcut, and the rest set out in columns — laid before you as the year begins ----
const PAPERS = {
  england: ["The London Gazette", "Published by Authority"], scotland: ["The Edinburgh Gazette", "Published by Authority"], ireland: ["The Dublin Intelligence", "Printed for the Publick"],
  france: ["Gazette de France", "Avec Privilège du Roy"], dutch: ["Oprechte Haerlemsche Courant", "Met Privilegie"], hre: ["Wienerisches Diarium", "Mit Kaiserlicher Freiheit"], austria: ["Wienerisches Diarium", "Mit Kaiserlicher Freiheit"],
  castile: ["Gaceta de Madrid", "Con Privilegio"], aragon: ["Gaceta de Zaragoza", "Con Privilegio"], portugal: ["Gazeta de Lisboa", "Com Privilégio Real"], sweden: ["Ordinarie Post Tidender", "Med Kongl. Privilegio"],
  denmark: ["Den Danske Mercurius", "Med Kongelig Privilegio"], poland: ["Merkuriusz Polski", "Z Przywilejem J.K.M."], russia: ["Vedomosti", "By the Tsar's Command"], venice: ["Gazzetta di Venezia", "Con Licenza de' Superiori"],
  papal: ["Diario di Roma", "Con Licenza de' Superiori"], tuscany: ["Gazzetta di Firenze", "Con Licenza de' Superiori"], milan: ["Gazzetta di Milano", "Con Licenza"], naples: ["Avvisi di Napoli", "Con Licenza"],
  savoy: ["Gazzetta di Torino", "Con Privilegio"], brandenburg: ["Berlinische Zeitung", "Mit Churfürstlicher Freiheit"], saxony: ["Leipziger Post-Zeitung", "Mit Churfürstlicher Freiheit"], bavaria: ["Münchner Ordinari-Zeitung", "Mit Churfürstlicher Freiheit"],
};
// (and what each cost, in the coin of the place: Venice's in the gazzetta, the coin that gave the gazettes their name)
const PRICES = { england: "One Penny", scotland: "One Penny", ireland: "One Penny", france: "Two Sols", dutch: "Two Stuivers", hre: "One Kreuzer", austria: "One Kreuzer",
  castile: "Two Cuartos", aragon: "Two Cuartos", portugal: "Ten Réis", sweden: "Two Öre", denmark: "Two Skilling", poland: "One Grosz", russia: "One Kopeck", venice: "One Gazzetta",
  papal: "One Baiocco", tuscany: "One Crazia", milan: "One Soldo", naples: "One Grano", savoy: "One Soldo", brandenburg: "One Groschen", saxony: "One Groschen", bavaria: "One Kreuzer" };
const priceOf = id => NATIONS[id] && NATIONS[id].nw ? "Told at the fire" : `Price ${PRICES[id] || "One Penny"}`;
const paperOf = id => PAPERS[id] || (NATIONS[id] && NATIONS[id].nw ? ["Words from the Council Fire", "As the runners told it"] : ["The European Mercury", "Being the News of the Year"]);
function gazette(items) {
  if (!C || !items || !items.length) return;
  const mineT = new Set(citiesOfNow(grid(), C.me).map(c => c[0]));
  const kind = l => { if (l.kind === "learn") return "learn"; if (l.kind === "war") return "war"; const t = l.title, all = t + " " + (l.sub || ""), mine = [...mineT].some(n => all.includes(n));
    // (your own realm's doings, at home; the wars, yours and the world's; the courts' alliances and treaties; the rest)
    if (/^at war$/i.test(t)) return "war";
    if (/\byour\b|^the regiments|regiments (raised|broken|merged)|launched|riots? in|rising in|is cast|governor|treasury|: (bold|cautious|siege engineer|hero of the nation|beloved of the men|drunkard|flogger)$|is (sacked|occupied)|^(a )?mission/i.test(t) || (mine && !/marches|army|siege|fallen|takes/i.test(t))) return "home";
    if (/has fallen|falls to|is yours|surrenders|takes .* from| takes /i.test(t)) return "fall";
    if (/declares war|are at war|marches|army|siege|beaten|victory|field|at sea|ships an army|holds|raid|broken|war party|^winter in/i.test(t)) return "war";
    if (/peace|alliance|league|comes? in on|treaty|pact|truce|cedes|offers|envoy|marriage|dies|succeeds|crown|agreement|tribute|submits|protectorate/i.test(t)) return "court";
    return "abroad"; };
  // (the headline: the year's greatest matter for you — your towns lost or won, your army's battles, war on you — else the first)
  const score = l => { const t = l.title + " " + (l.sub || ""), k = kind(l); let v = 0; if (k === "fall") v += 50; if (k === "war") v += 30; if (k === "court") v += 20; if ([...mineT].some(n => t.includes(n)) || /\byou(r)?\b/i.test(t)) v += 40; if (/declares war on you|has fallen|^War declared/.test(t)) v += 30; if (k === "learn") v += 75; if (/victory|beaten/i.test(t)) v += 15; return v; };
  const head = items.reduce((b, l) => score(l) > score(b) ? l : b, items[0]), rest = items.filter(l => l !== head);
  const way = wayOfUniform(UNI_OF[C.me] || ""), hk = kind(head);
  const img = /at sea|fleet|ship/i.test(head.title + head.sub) ? "art/units/ship-line.jpg" : hk === "war" || hk === "fall" ? plateOf(/field|horse|cavalry/i.test(head.sub || "") ? way : way, /field/i.test(head.title) ? "cavalry" : "musketeer") : hk === "court" ? null : plateOf(way, "pike");
  const [name, motto] = paperOf(C.me), num = Math.max(1, C.year - 1682);
  const sec = { war: "From the Wars", fall: "From the Wars", court: "From the Courts", home: "At Home", abroad: "From Abroad", learn: "From the Learned World" }, cols = {};
  // (a discovery not in the headline still gets its own box, set apart; declarations of war lead their column)
  const learned = rest.filter(l => kind(l) === "learn");
  for (const l of rest) if (kind(l) !== "learn") (cols[sec[kind(l)]] ||= []).push(l);
  for (const L of Object.values(cols)) L.sort((a, b) => (/declares? war|^War declared|are at war/.test(b.title) ? 1 : 0) - (/declares? war|^War declared|are at war/.test(a.title) ? 1 : 0));
  const el = document.createElement("div"); el.className = "cmp-gazette"; el.id = "cmpGazette";
  el.innerHTML = `<div class="gz-paper">
    <div class="gz-mast"><small>${esc(motto)}</small><h1>${esc(name)}</h1><div class="gz-line"><span>Numb. ${num}</span><span>${esc(SEASONS[C.s] || "Spring")}, in the Year ${C.year}</span><span>${esc(priceOf(C.me))}</span></div></div>
    <div class="gz-head${hk === "learn" ? " gz-learn" : ""}">${hk === "learn" ? `<div class="gz-seal" aria-hidden="true">✦</div>` : img ? `<img class="gz-cut" src="${esc(img)}" alt="">` : ""}<div>${hk === "learn" ? `<small class="gz-kicker">From the Learned World</small>` : /declares? war|^War declared/.test(head.title) ? `<small class="gz-kicker">Extraordinary</small>` : ""}<h2>${esc(head.title)}</h2>${head.sub ? `<p class="gz-lead${String(head.sub || "").length < 60 ? " gz-short" : ""}">${esc(head.sub)}</p>` : ""}</div></div>
    ${learned.map(l => `<div class="gz-learnbox"><span class="gz-seal" aria-hidden="true">✦</span><div><small class="gz-kicker">From the Learned World</small><b>${esc(l.title)}</b><p>${esc(l.sub || "")}</p></div></div>`).join("")}
    ${Object.keys(cols).length ? `<div class="gz-cols">${Object.entries(cols).map(([h, L]) => `<section><h3>${esc(h)}</h3>${L.slice(0, 7).map(l => `<p><b>${esc(l.title)}.</b> ${esc(l.sub || "")}</p>`).join("")}</section>`).join("")}</div>` : ""}
    <div class="gz-foot"><button class="btn primary" data-gz="1">Lay it aside</button></div>
  </div>`;
  const close = () => { el.classList.add("out"); setTimeout(() => { el.remove(); goalScreen(); }, 260); removeEventListener("keydown", key, true); };
  const key = e => { if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") { e.preventDefault(); e.stopPropagation(); close(); } };
  el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-gz]")) close(); });
  addEventListener("keydown", key, true);
  $("gazetteOld")?.remove(); const old = $("cmpGazette"); if (old) old.remove();
  $("campaign").appendChild(el); sfx("parchment", 0.5);
}
// ---- a new reign's first paper: the realm as you find it — your wars and who is in them, your leagues, your trade, who
//  at the other courts wishes you well or ill, the world's other wars, and what the crown asks of you ----
function statePaper() {
  if (!C || C.mp || C.story) return;
  const g = grid(), me = C.me, mine = citiesOfNow(g, me), cap = mine.reduce((b, t) => !b || t[3] > b[3] ? t : b, null);
  const list = a => a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "";
  const names = ids => list(ids.map((id, i) => i ? the(id) : The(id)));
  const live = Object.keys(C.E.rel).filter(id => NATIONS[id] && alive(g, id)), towns = id => citiesOfNow(g, id).length;
  const wr = live.filter(id => atWar(id)), al = live.filter(id => C.ally[id]), T = tradeOf(g);
  const P = [], col = (h, items) => { if (items.length) P.push(`<section><h3>${esc(h)}</h3>${items.map(([b, t]) => `<p><b>${esc(b)}.</b> ${esc(t)}</p>`).join("")}</section>`); };
  // (the wars: each enemy, its towns, who fights with it, and who of yours with you)
  col("At War", wr.length ? wr.map(id => { const theirs = alliesOf(id).filter(x => NATIONS[x] && alive(g, x) && !wr.includes(x) && (atWar(x) || C.E.wars.some(w => (w.a === x && al.includes(w.b)) || (w.b === x && al.includes(w.a)))));
    const mates = C.E.wars.filter(w => w.withYou && (w.a === id || w.b === id)).map(w => w.a === id ? w.b : w.a).filter(x => al.includes(x));
    return [The(id), `${towns(id)} town${towns(id) === 1 ? "" : "s"}${C.E.rel[id] <= -60 ? ", and no mercy looked for" : ""}.${mates.length ? ` ${names(mates)} ${mates.length > 1 ? "fight" : v3(mates[0], "fights")} beside you.` : ""}${theirs.length ? ` With ${the(id)}: ${list(theirs.map(the))}.` : ""}`]; })
    : [["At peace", `${The(me)} ${v3(me, "is")} at war with no one. The drums are quiet, and the treasury the better for it.`]]);
  // (the leagues, each with its members)
  col("Allies", LEAGUES_1683.filter(L => L.ids.includes(me)).map(L => [L.n[0].toUpperCase() + L.n.slice(1), `With ${list(L.ids.filter(x => x !== me && NATIONS[x]).map(the))}: their quarrels yours, and yours theirs.`])
    .concat(al.filter(id => !LEAGUES_1683.some(L => L.ids.includes(me) && L.ids.includes(id))).map(id => [The(id), "Allied to your crown."])));
  // (trade: what your towns send out, and each partner with what it pays and the goods it brings you)
  const ks = Object.keys(T.have).sort((a, b) => GOODS[b].v * T.have[b] - GOODS[a].v * T.have[a]);
  col("Trade", [[`${T.goods + T.pactV} thalers a year`, ks.length ? `Your towns send out ${list(ks.map(k => GOODS[k].n.toLowerCase()))}.` : "Your towns have little to sell."]]
    .concat(T.pacts.map(p2 => [The(p2.id), `A trade pact, ${p2.v} thalers a year${p2.fresh.length ? `, and ${list(p2.fresh.map(k => GOODS[k].n.toLowerCase()))} your own towns don't make` : ""}.`]))
    .concat(T.pacts.length ? [] : [["No partners", "No crown trades with you by treaty. An envoy to a friendly court could change that."]]));
  // (the other courts: the warmest and the coldest of those you're neither allied to nor fighting)
  const rest = live.filter(id => !atWar(id) && !C.ally[id]).sort((a, b) => C.E.rel[b] - C.E.rel[a]);
  const warm = rest.filter(id => C.E.rel[id] >= 25).slice(0, 4), cold = rest.filter(id => C.E.rel[id] <= -15).reverse().slice(0, 4);
  col("At the Courts", [...(warm.length ? [["Well disposed", `${names(warm)} think${warm.length === 1 && v3(warm[0], "is") === "is" ? "s" : ""} well of you.`]] : []),
    ...(cold.length ? [["Ill disposed", `${names(cold)} wish${cold.length === 1 && v3(cold[0], "is") === "is" ? "es" : ""} you ill. Watch them.`]] : [])]);
  // (the world's other wars)
  col("Abroad", C.E.wars.filter(w => w.a !== me && w.b !== me && !w.withYou && NATIONS[w.a] && NATIONS[w.b] && alive(g, w.a) && alive(g, w.b)).slice(0, 6).map(w => [`${The(w.a)} against ${the(w.b)}`, w.withYou ? "Your allies' war, and so yours." : "Not your quarrel, as yet."]));
  // (and the crown's ambition)
  const G = goalOf();
  const way = wayOfUniform(UNI_OF[me] || ""), img = plateOf(way, wr.length ? "musketeer" : "pike");
  const [name, motto] = paperOf(me);
  const el = document.createElement("div"); el.className = "cmp-gazette"; el.id = "cmpGazette";
  el.innerHTML = `<div class="gz-paper gz-state">
    <div class="gz-mast"><small>${esc(motto)}</small><h1>${esc(name)}</h1><div class="gz-line"><span>Numb. 1</span><span>${esc(SEASONS[C.s] || "Spring")}, in the Year ${C.year}</span><span>${esc(priceOf(C.me))}</span></div></div>
    <div class="gz-head">${img ? `<img class="gz-cut" src="${esc(img)}" alt="">` : ""}<div><small class="gz-kicker">The State of the Realm</small><h2>${esc(NATIONS[me].nw ? `The council fire at ${cap ? cap[0] : NATIONS[me].name}` : `A new reign in ${cap ? cap[0] : NATIONS[me].name}`)}</h2>
      <p class="gz-lead">${esc(`${The(me)} ${v3(me, "has")} ${mine.length} town${mine.length === 1 ? "" : "s"}, ${C.army} regiments under arms and ${C.gold} thalers in the treasury. ${wr.length ? `${wr.length === 1 ? "One war is" : `${wr.length} wars are`} already being fought, ${al.length ? `with ${al.length} all${al.length === 1 ? "y" : "ies"} sworn to you` : "and no ally sworn to you"}.` : al.length ? `The realm is at peace, with ${al.length} all${al.length === 1 ? "y" : "ies"} sworn to it.` : "The realm is at peace, and stands alone."}`)}</p></div></div>
    ${G ? `<div class="gz-learnbox"><span class="gz-seal" aria-hidden="true">♛</span><div><small class="gz-kicker">The Crown's Ambition</small><b>${esc(list(G.towns))}</b><p>${esc(`Hold ${G.towns.length > 1 ? "these" : "it"}, and ${G.n} towns in all, by ${G.by}.`)}</p></div></div>` : ""}
    <div class="gz-cols">${P.join("")}</div>
    <div class="gz-foot"><button class="btn primary" data-gz="1">Take up the crown</button></div>
  </div>`;
  const close = () => { el.classList.add("out"); setTimeout(() => { el.remove(); goalScreen(); }, 260); removeEventListener("keydown", key, true); };
  const key = e => { if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") { e.preventDefault(); e.stopPropagation(); close(); } };
  el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-gz]")) close(); });
  addEventListener("keydown", key, true);
  const old = $("cmpGazette"); if (old) old.remove();
  $("campaign").appendChild(el); sfx("parchment", 0.5);
}
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
  // (whose it was, and whose its people first were: for its loyalty to the new crown)
  { const H = (C.held ||= {}), was = H[ct[0]]; H[ct[0]] = { from, by: to, y: C.year, orig: was && was.orig ? was.orig : from }; if (H[ct[0]].orig === to) delete H[ct[0]]; }
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
// ---- military access, as in the Total War games: another crown's land is crossed only by its leave — at war with it,
//  allied to it, or with its leave asked and given; and the other crowns ask yours to cross your land ----
const freeIn = id => !id || !NATIONS[id] || id === C.me || atWar(id) || !!C.ally[id] || !!(C.E.access && C.E.access[id]) || isHuman(id);
// (the crowns whose land a march from p to t would cross without their leave; the ground it starts on doesn't count,
//  so an army caught in a crown's land when its leave ends can always march out)
function barredBy(p, t, sea) {
  const g = grid(), out = new Set(), at = (x, y) => g[Math.floor(y)] && g[Math.floor(y)][Math.floor(x)];
  if (sea) { const id = at(t.x, t.y); if (!freeIn(id)) out.add(id); return [...out]; }
  const from = at(p.x, p.y), n = Math.max(1, Math.ceil(Math.hypot(t.x - p.x, t.y - p.y) / 0.6));
  for (let i = 1; i <= n; i++) { const id = at(p.x + (t.x - p.x) * i / n, p.y + (t.y - p.y) * i / n); if (id !== from && !freeIn(id)) out.add(id); }
  return [...out];
}
const barNote = (L, what = "Your army") => `${what} can't cross ${L.length > 1 ? `the lands of ${L.slice(0, -1).map(the).join(", ")} and ${the(L[L.length - 1])}` : poss(the(L[0])) + " land"} without leave. Choose ${L.length > 1 ? "each crown" : "the crown"} and ask for military access, or go around.`;
// (an AI crown's march on a town it's at war with: does it cross your land? ask first)
const nearOwn = (g, id, ct) => { const t = cellXY(ct), own = citiesOfNow(g, id); return own.length ? cellXY(own.reduce((a, b) => (dist2(cellXY(b), t) < dist2(cellXY(a), t) ? b : a))) : { x: -999, y: -999 }; };
function crossesMine(g, id, ct) {
  const t = cellXY(ct), p = nearOwn(g, id, ct); if (p.x < 0 || overSea(p, t)) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(t.x - p.x, t.y - p.y) / 0.6)); let hit = 0;
  for (let i = 1; i < n; i++) { const y = Math.floor(p.y + (t.y - p.y) * i / n), x = Math.floor(p.x + (t.x - p.x) * i / n); if (g[y] && g[y][x] === C.me) hit++; }
  return hit >= 2;
}
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
// (and any water between: Britain from the Continent, Ireland, Sicily, Scandinavia's islands — no land road joins them,
//  so the army takes ship; an army in hand is never walked over the sea)
const overSea = (p, t) => { if (seaSide(p) !== seaSide(t)) return true; const g = grid(), a = landOf(g, p), b = landOf(g, t); return a >= 0 && b >= 0 && a !== b; };
// (what to do about it, said when it's tried)
const SEA_NOTE = "There's water between: no road for an army. Bring a fleet of yours to the shore where it stands, click the fleet and embark the army, then sail it over and land.";
// (the New World is drawn larger than Europe — 1.45 times, west of 50°W — so a year's march there covers more squares)
const magAt = p => { const lon = llOf(p.x, p.y)[0]; return lon <= -50 ? 1.45 : lon >= -20 ? 1 : 1 + 0.45 * (-20 - lon) / 30; };
const mdist = (p, q) => dist2(p, q) / magAt({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
function stepToward(p, t, d) {
  if (overSea(p, t)) return { x: t.x, y: t.y, arrived: true, sea: true };
  // (by the road over land, round any water in the way; a year's march along it)
  const P = landPath(grid(), p, t) || [p, t]; let left = d;
  for (let i = 1; i < P.length; i++) { const s = mdist(P[i - 1], P[i]); if (s >= left) { const k = left / s, q = { x: P[i - 1].x + (P[i].x - P[i - 1].x) * k, y: P[i - 1].y + (P[i].y - P[i - 1].y) * k }; return i === P.length - 1 && s - left < 0.01 ? { x: P[i].x, y: P[i].y, arrived: true } : { ...q, arrived: false }; } left -= s; }
  const e = P[P.length - 1]; return { x: e.x, y: e.y, arrived: true };
}
const inMarch = ct => mdist(armyPos(), cellXY(ct)) <= MARCH + 0.5;
const yearsTo = t => overSea(armyPos(), t) ? 1 : Math.max(1, Math.ceil(mdist(armyPos(), t) / MARCH));
// (the other crowns' field armies: at their capital, or on the march toward a town of yours)
// (the crowns' own wars, fought on the map: a crown not at war with a player, nor marching on one, has its army go where
//  its war is — before the town it takes, falling back home when it's beaten, home again at the peace — so the wars
//  among the other crowns are there to be seen, not only read of in the news)
const ownWar = id => !C.mp && NATIONS[id] && !isHuman(id) && !C.E.war[id] && !(C.foeGo && C.foeGo[id]);
// (the town a place is nearest, within a few days' march: to name a battle by)
const townNear = p => { let bd = 7, best = null; for (const ct of CITIES) { const t = cellXY(ct), d = Math.hypot(t.x - p.x, t.y - p.y) - ct[3] * 0.6; if (d < bd) { bd = d; best = ct[0]; } } return best; };
const othersAtWar = () => { const g = grid(), s = new Set(); for (const w of C.E.wars || []) for (const id of [w.a, w.b]) if (ownWar(id) && alive(g, id)) s.add(id); return [...s]; };
function warMove(id, to, d) { if (!ownWar(id)) return; const fp = foeArmyPos(id); if (!fp || !to) return; const st = stepToward(fp, to, d); if (st.sea) return; C.foePos[id] = { x: st.x, y: st.y }; }
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
const sackLoot = ct => Math.round((ct[3] * 60 + popOf(ct) / 120) / 10) * 10;
const worth = ct => { const n = ct[0]; let inc = ct[3] * 22 * clamp(Math.sqrt(popOf(ct) / popBase(ct)), 0.6, 1.6); for (const ch of ["farm", "trade", "works"]) inc += (CHAINS[ch].levels[lvOf(n, ch)].inc || 0) * (ch === "farm" && knows("enclosure") ? 1.15 : 1); return Math.round(inc * govMul(n)); };
function garrison(ct) { const n = ct[0], v = govOf(n), o = cityOwner(grid(), ct), sl = o === C.me ? C : o && isHuman(o) ? sliceOf(o) : null; return Math.round(garUnits(n, sl ? sl.units : null).reduce((t, u) => t + worthOf(u), 0)) + ct[3] * 4 + 2 + (CHAINS.walls.levels[lvOf(n, "walls")].gar || 0) + (CHAINS.army.levels[lvOf(n, "army")].gar || 0) + (v ? v.st[2] - 2 : 0) + (o && o !== C.me && !isHuman(o) ? militia(o, ct) : 0); }
// (a crown's own towns have their townsmen under arms besides the soldiers: the trained bands, the burgher companies — the
//  more so its capital, and the more of its towns it has already lost)
function militia(o, ct) { const all = citiesOfNow(grid(), o), cap = all.length && all.reduce((b, t) => t[3] > b[3] ? t : b, all[0]) === ct; return ct[3] + 2 + (cap ? 4 : 0) + Math.min(6, Math.round((C.took && C.took[o] || 0) * 1.5)); }
// (walls only where they've been built — by you, or by the crown that holds the town — save a crown's last town,
//  which every man in it holds to the end behind whatever they can throw up)
// (a walled town on the map: a little stone fort round it, seen from above — four curtain walls, battlemented, a round
//  tower at each corner; the new works, a star fort's arrowhead bastions instead — so a wall can be told at a glance)
function wallRing(c, x, y, rr, k, lv) {
  const R = rr + 2.2 * k, T = 2.3 * k, stone = "#a49a86", ink = "#2a2018";
  c.save(); c.strokeStyle = ink; c.lineWidth = Math.max(0.8, 0.9 * k); c.lineJoin = "round";
  // the curtain: a band of stone round the town, its battlements along the outer edge
  c.fillStyle = stone; c.beginPath(); c.rect(x - R - T, y - R - T, 2 * (R + T), 2 * (R + T)); c.rect(x - R, y - R, 2 * R, 2 * R); c.fill("evenodd");
  c.beginPath(); c.rect(x - R - T, y - R - T, 2 * (R + T), 2 * (R + T)); c.stroke(); c.beginPath(); c.rect(x - R, y - R, 2 * R, 2 * R); c.stroke();
  const m = 1.3 * k, n = Math.max(2, Math.round((2 * R) / (2.4 * k)));
  c.fillStyle = "#7f7564";
  for (let i = 0; i < n; i++) { const t = -R + (i + 0.5) * (2 * R / n) - m / 2; for (const [mx, my] of [[x + t, y - R - T - m * 0.55], [x + t, y + R + T - m * 0.45], [x - R - T - m * 0.55, y + t], [x + R + T - m * 0.45, y + t]]) { c.fillRect(mx, my, m, m); c.strokeRect(mx, my, m, m); } }
  // the corners: round towers, or a star fort's arrowhead bastions
  c.fillStyle = stone;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = x + sx * (R + T / 2), cy = y + sy * (R + T / 2);
    c.beginPath();
    if (lv >= 2) { const a = 4.2 * k, ux = sx * 0.7071, uy = sy * 0.7071, vx = -uy, vy = ux; c.moveTo(cx + ux * a, cy + uy * a); c.lineTo(cx + vx * a * 0.62, cy + vy * a * 0.62); c.lineTo(cx - ux * a * 0.35, cy - uy * a * 0.35); c.lineTo(cx - vx * a * 0.62, cy - vy * a * 0.62); c.closePath(); }
    else c.arc(cx, cy, 2.4 * k, 0, 7);
    c.fill(); c.stroke();
  }
  c.restore();
}
function hasWalls(ct, owner, g = grid()) { return lvOf(ct[0], "walls") >= 1 || (!!owner && !NATIONS[owner].nw && citiesOfNow(g, owner).length === 1); }
// (a town of the woods' nations: a palisade round it, fought in as a village)
const isVillage = ct => { const o = cityOwner(grid(), ct); return !!o && !!NATIONS[o].nw && !lvOf(ct[0], "walls"); };
// ---- the government, as in Empire: Total War: how the crown is ruled, and its three ministers ----
const GOVS = {
  absolute: { n: "Absolute monarchy", short: "Absolute", inc: 1, res: 0.9, heavy: -1, d: "The crown's will is law: heavy taxes anger the towns less (−1 loyalty, not −2), but the scholars work slower (−10%)." },
  constitutional: { n: "Constitutional monarchy", short: "Constitutional", inc: 1.1, res: 1.1, heavy: -2, d: "King and parliament together: 10% more from the towns and trade, scholars 10% quicker; every five years an election may change a minister." },
  republic: { n: "Republic", short: "Republic", inc: 1.15, res: 1.2, heavy: -2, loyal: 1, d: "The people's own government: 15% more from the towns and trade, scholars 20% quicker, the towns more content (+1 loyalty); but three years of war weary them (−1)." },
};
const GOV_START = { dutch: "republic", venice: "republic", genoa: "republic", swiss: "republic", england: "constitutional", scotland: "constitutional", ireland: "constitutional", poland: "constitutional" };
const POSTS = [["treasury", "Treasury", "Income: ±3% a star of skill from three, and 3% lost for each point of his corruption"], ["war", "War", "Regiments' cost and the army's morale by his skill; each point of corruption makes regiments 3% dearer"], ["justice", "Justice", "Order in the towns: +1 loyalty with four stars of skill, −1 with one, and −1 more if he's badly corrupt (three or more)"]];
// (a minister: a man of the crown's own tongue, his skill one to five)
function minister(post) { const m = newMan(C.me, "governor"); return { name: m.name, short: m.short, port: m.port, gen: m.gen, sk: m.st[1], cor: Math.min(4, m.st[0]), post }; }
function govOf_() {
  if (!C.govt) { C.govt = { type: GOV_START[C.me] || (NATIONS[C.me].nw ? "absolute" : "absolute"), min: {}, unrest: 0, since: C.year }; for (const [p] of POSTS) C.govt.min[p] = minister(p); }
  // (ministers from before there was corruption: given theirs)
  for (const m of Object.values(C.govt.min)) if (m.cor == null) m.cor = Math.floor(R() * 3);
  return C.govt;
}
const govType = () => GOVS[govOf_().type];
const minSk = p => (govOf_().min[p] || { sk: 3 }).sk;
const minCor = p => (govOf_().min[p] || { cor: 0 }).cor | 0;
// (what the corruption of the ministers costs: the Treasury's in the realm's income, the War's in what regiments cost)
const corLoss = () => minCor("treasury") * 0.03;
const dots = (n, cls = "") => `<i class="${cls}">${"●".repeat(n)}${"○".repeat(5 - n)}</i>`;
const research = g => Math.round((1 + citiesOfNow(g, C.me).reduce((t, ct) => t + (CHAINS.church.levels[lvOf(ct[0], "church")].rp || 0), 0)) * govType().res * 10) / 10;
const regCost = g => REGIMENT - Math.max(0, ...citiesOfNow(g, C.me).map(ct => CHAINS.works.levels[lvOf(ct[0], "works")].cheap || 0));
const GUN_COST = 140;
// (your army's nerve in a battle: the drill of your barracks, the bayonet, the general's hold on his men)
const braveMul = g => moraleK() * (1 + Math.max(0, ...citiesOfNow(g, C.me).map(ct => CHAINS.army.levels[lvOf(ct[0], "army")].morale || 0)) + (knows("bayonet") ? 0.05 : 0) + (C.gen ? (C.gen.st[1] - 3) * 0.06 : -0.06) + vetK());
// (a general's victories: every third one, he grows in command, up to the most a man can have)
// ---- a general's traits, as Empire's: earned in the field and in the camp, and counting in every battle after ----
const TRAITS = {
  bold: { n: "Bold", d: "He has won against the odds: his army fights 6% better attacking.", att: 0.06 },
  cautious: { n: "Cautious", d: "Twice beaten, he takes no chances: 8% better holding his ground, 4% worse attacking.", att: -0.04, def: 0.08 },
  engineer: { n: "Siege engineer", d: "He has stormed walls before: they count for half against him.", good: 1 },
  hero: { n: "Hero of the nation", d: "Six victories: 5% better in every battle, and the men's spirits higher.", att: 0.05, def: 0.05, mor: 6 },
  beloved: { n: "Beloved of the men", d: "He shares their hardships: their spirits higher.", mor: 5 },
  drunk: { n: "Drunkard", d: "Seldom sober by noon: 5% worse in every battle.", att: -0.05, def: -0.05, bad: 1 },
  harsh: { n: "Flogger", d: "He rules by the lash: the men's spirits lower.", mor: -4, bad: 1 },
};
const hasT = (gen, t) => !!(gen && gen.tr && gen.tr.includes(t));
const trSum = (gen, k) => ((gen && gen.tr) || []).reduce((t, x) => t + ((TRAITS[x] || {})[k] || 0), 0);
function giveT(gen, t) { if (!gen || hasT(gen, t)) return; (gen.tr ||= []).push(t); say(`${gen.name}: ${TRAITS[t].n.toLowerCase()}`, TRAITS[t].d); }
// (a battle's mark on him: bold for a win against the odds, an engineer for walls stormed twice, cautious after two defeats)
function genMark(o, won) {
  const G = C.gen; if (!G) return;
  if (won && o.attack && (o.att | 0) < (o.def | 0)) giveT(G, "bold");
  if (won && o.attack && o.walls) { G.storms = (G.storms | 0) + 1; if (G.storms >= 2) giveT(G, "engineer"); }
  if (!won) { G.losses = (G.losses | 0) + 1; if (G.losses >= 2) giveT(G, "cautious"); }
}
// (a year in the camp: a vice taken up now and then; a long service unbeaten makes him loved)
function genYear(G) {
  if (!G) return;
  if (!G.hist && !G.you) { if (R() < 0.015) giveT(G, "drunk"); else if (R() < 0.01) giveT(G, "harsh"); }   // (never a real man of history)
  if ((G.served | 0) >= 5 && !(G.losses | 0) && !hasT(G, "harsh") && R() < 0.25) giveT(G, "beloved");
}
function genWin() {
  const G = C.gen; if (!G) return; G.wins = (G.wins | 0) + 1; if (G.wins >= 6) giveT(G, "hero");
  if (G.wins % 3 === 0 && G.st[0] < 5) { G.st[0]++; say(`${G.name} grows in command`, `${G.wins} victories behind him: his command is now ${G.st[0]} of 5.`); }
}
// (the army's experience: its regiments' battles behind them, up to three chevrons each — a veteran army a tenth steadier)
const vetK = () => { const L = C.units || []; return L.length ? L.reduce((t, u) => t + (u.xp || 0), 0) / L.length * 0.033 : 0; };
const cmdMul = gen => gen ? 1 + (gen.st[0] - 3) * 0.07 : 0.93;
// ---- the army's morale, 0 to 100: where its general's spirit and its barracks put it, raised by victories and broken by
//  defeats, by a general lost and by pay missed; drifting back a third of the way each year. It counts in every battle:
//  a broken army fights at 85%, a confident one at 115% ----
const moraleBase = () => clamp(30 + trSum(C.gen, "mor") + (minSk("war") - 3) * 2 + (C.gen ? C.gen.st[1] * 9 : 12) + (knows("bayonet") ? 4 : 0) + Math.round(Math.max(0, ...citiesOfNow(grid(), C.me).map(ct => CHAINS.army.levels[lvOf(ct[0], "army")].morale || 0)) * 100), 10, 95);
const moraleK = () => 0.85 + clamp(C.morale ?? 50, 0, 100) * 0.003;
const moraleMove = d => { C.morale = clamp(Math.round((C.morale ?? 50) + d), 0, 100); };
const moraleWord = v => v >= 85 ? "Eager for battle" : v >= 68 ? "Confident" : v >= 50 ? "Steady" : v >= 32 ? "Shaken" : v >= 15 ? "Wavering" : "Broken";
const genOf = id => id === C.me ? C.gen : isHuman(id) ? as(id, () => C.gen) : foeTraits((C.foeGen && C.foeGen[id]) || null);
// (another crown's general: a trait of his own, half the time, given him once — so you know whom you face)
function foeTraits(m) { if (m && !m.trRolled) { m.trRolled = true; if (R() < 0.5) m.tr = [pick(m.hist ? ["bold", "cautious", "engineer", "hero"] : ["bold", "cautious", "engineer", "drunk", "hero"])]; } return m; }  // (a real man of history is never made a drunkard by the dice)
// what a town of yours can build next, chain by chain: the next level, its cost, and the learning it waits on
function buildable(ct) {
  const n = ct[0], out = [];
  for (const ch of CHAIN_ORDER) {
    // (a nation of the woods raises no stone walls: its towns stand behind their palisades)
    if (ch === "walls" && NATIONS[C.me] && NATIONS[C.me].nw) continue;
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
  // (a campaign begun before the walled towns of 1683 were all counted: theirs given them, unless it's had its say over them since)
  if (!C.forts2) { C.forts2 = 1; for (const n of FORTS_1683) if (CITIES.some(c => c[0] === n) && !(n in C.walls)) C.walls[n] = 1; }
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
// (who sets the missions: the Crown and its court; for a nation of the woods, its council)
const crownW = cap => NATIONS[C.me] && NATIONS[C.me].nw ? (cap ? "The council" : "the council") : (cap ? "The Crown" : "the Crown");
const courtW = cap => NATIONS[C.me] && NATIONS[C.me].nw ? (cap ? "The council" : "the council") : (cap ? "The court" : "the court");
// ---- the Crown's missions, as in Empire: Total War: now and then the court sets you a task — a town to take, a building
//  to raise, an army or a fleet to have, a battle to win, a treaty to sign — with a year to have it done by and a reward
//  when it is. Two at a time at most; one that runs out of time is simply dropped, with the court's displeasure ----
const MISSION_MAX = 2;
function missionOffer(g) {
  const L = [], mine = citiesOfNow(g, C.me), yr = C.year, M = C.missions ||= [], has = k => M.some(m => m.k === k) || ((C.missionRest || {})[k] | 0) > yr;   // (a kind just failed is let rest a while: not asked again the same year, word for word)
  // (a town of a crown you're at war with, near enough to march on)
  if (!has("take")) { const T = CITIES.filter(ct => { const o = cityOwner(g, ct); return o && o !== C.me && atWar(o) && !isHuman(o); }).map(ct => [ct, mdist(armyPos(), cellXY(ct))]).filter(([, d]) => d < MARCH * 3).sort((a, b) => a[1] - b[1]).slice(0, 4);
    if (T.length) { const [ct] = pick(T), o = cityOwner(g, ct); L.push({ k: "take", t: ct[0], foe: o, by: yr + 4, gold: 300 + ct[3] * 150, title: `Take ${ct[0]}`, d: `${ct[0]} is ${poss(the(o))}, and ${courtW(0)} wants it. Take it by ${yr + 4}.` }); } }
  // (a building raised in a town of yours)
  if (!has("build") && mine.length) { const ops = mine.flatMap(ct => buildable(ct).filter(o => !o.tech).map(o => [ct, o])); if (ops.length) { const [ct, o] = pick(ops); L.push({ k: "build", t: ct[0], ch: o.chain, lv: o.lv, by: yr + 3, gold: Math.round(o.cost * 0.6) + 80, title: `${o.L.n} at ${ct[0]}`, d: `Build the ${o.L.n.toLowerCase()} at ${ct[0]} by ${yr + 3}. ${crownW(1)} will repay much of the cost.` }); } }
  // (an army of so many regiments, all told)
  if (!has("army")) { const n = allField().length + 6 + Math.floor(R() * 5); L.push({ k: "army", n, by: yr + 3, gold: 250 + n * 6, title: `An army of ${n} regiments`, d: `${crownW(1)} wants ${n} regiments in the field (it has ${allField().length}). Have them by ${yr + 3}.` }); }
  // (a battle won against a crown at war with you)
  if (!has("beat")) { const ws = Object.keys(C.E.war).filter(id => C.E.war[id] && !isHuman(id) && alive(g, id) && (C.foes[id] | 0) >= 5); if (ws.length) { const id = pick(ws); L.push({ k: "beat", foe: id, from: yr, by: yr + 3, gold: 400, title: `Beat ${poss(the(id))} army`, d: `Defeat ${poss(the(id))} army in battle, in the field or at a town, by ${yr + 3}.` }); } }
  // (a trade pact with a crown that thinks well enough of you)
  if (!has("pact")) { const ps = Object.keys(C.E.rel).filter(id => NATIONS[id] && id !== C.me && !atWar(id) && !C.E.pact[id] && !isHuman(id) && alive(g, id) && C.E.rel[id] >= 5); if (ps.length) { const id = pick(ps); L.push({ k: "pact", foe: id, by: yr + 3, gold: 250, title: `A trade pact with ${the(id)}`, d: `The merchants want ${poss(the(id))} markets. Sign a trade pact with ${the(id)} by ${yr + 3}.` }); } }
  // (a fleet, for a crown with a port)
  if (!has("navy") && mine.some(ct => harbourOf(ct))) { const have = (C.fleets || []).reduce((t, f) => t + f.ships.length, 0), n = have + 3; L.push({ k: "navy", n, by: yr + 4, gold: 350, title: `A navy of ${n} ships`, d: `The Admiralty wants ${n} ships at sea (you have ${have}). Build them by ${yr + 4}.` }); }
  return L.length ? pick(L) : null;
}
// (done yet?)
function missionDone(m, g) {
  if (m.k === "take") return (CITIES.find(c => c[0] === m.t) && cityOwner(g, CITIES.find(c => c[0] === m.t))) === C.me;
  if (m.k === "build") return lvOf(m.t, m.ch) >= m.lv;
  if (m.k === "army") return allField().length >= m.n;
  if (m.k === "beat") return !!(C.foeBeat && C.foeBeat[m.foe] != null && C.foeBeat[m.foe] >= m.from);
  if (m.k === "pact") return !!C.E.pact[m.foe];
  if (m.k === "navy") return (C.fleets || []).reduce((t, f) => t + f.ships.length, 0) >= m.n;
  return false;
}
// (the missions looked over: done ones rewarded at once — said on the screen — and, at the year's end, the expired
//  dropped and a new one perhaps set)
function missionsCheck(yearEnd) {
  if (!C || C.mp || C.over) return null; const g = grid(), M = C.missions ||= []; let shown = null;
  for (const m of M.slice()) {
    if (missionDone(m, g)) { M.splice(M.indexOf(m), 1); C.gold += m.gold; moraleMove(3); say(`Mission accomplished: ${m.title}`, `${crownW(1)} is pleased: ${m.gold} thalers to the treasury.`); shown = `Mission accomplished: ${m.title}. ${crownW(1)} sends ${m.gold} thalers.`; }
    else if (yearEnd && C.year >= m.by) { M.splice(M.indexOf(m), 1); (C.missionRest ||= {})[m.k] = C.year + 2; moraleMove(-2); say(`Mission failed: ${m.title}`, `The time ${crownW(0)} gave you is up. ${courtW(1)} is displeased.`); }
  }
  if (yearEnd && M.length < MISSION_MAX && (M.length === 0 ? R() < 0.7 : R() < 0.35)) { const m = missionOffer(g); if (m) { M.push(m); say(`A mission from ${crownW(0)}: ${m.title}`, `${m.d} Reward: ${m.gold} thalers.`); } }
  if (shown) persist();
  return shown;
}
// ---- the campaign's aim, as Empire's: certain towns to hold, and so many in all, by a year — the crown's ambition ----
const GOAL_YEARS = 60;
function goalOf() {
  if (!C || C.mp) return null; if (C.goal) return C.goal;
  const g = grid(), own = citiesOfNow(g, C.me), h = homeOf(g, C.me); if (!h) return null;
  const nw = !!NATIONS[C.me].nw;
  // (the prizes: the great towns nearest home that aren't yours — near and big counting for most)
  // (across the water counts as three times as far: a crossing is a harder war)
  // (never a friend's: not a crown of your own league, nor an ally)
  const friend = id => !!leagueOf(C.me, id) || !!C.ally[id];
  const want = CITIES.filter(ct => { const o = cityOwner(g, ct); return o !== C.me && o != null && NATIONS[o] && !friend(o) && (!nw || !overSea(h, cellXY(ct))); })
    .map(ct => [ct, dist2(h, cellXY(ct)) * (overSea(h, cellXY(ct)) ? 3 : 1) / (1 + ct[3] * 0.8)]).sort((a, b) => a[1] - b[1]).slice(0, nw ? 2 : 4).map(([ct]) => ct[0]);
  C.goal = { towns: want, n: Math.min(WIN_CITIES, Math.max(own.length + (nw ? 5 : 10), nw ? 7 : 14)), by: C.year + GOAL_YEARS };
  return C.goal;
}
// (how it stands: the towns held of those asked for, and the count)
function goalState() {
  const G = goalOf(); if (!G) return null; const g = grid(), n = citiesOfNow(g, C.me).length;
  const held = G.towns.map(t => { const ct = CITIES.find(c => c[0] === t); return [t, !!ct && cityOwner(g, ct) === C.me]; });
  return { G, n, held, done: n >= G.n && held.every(([, h]) => h) };
}
function goalCheck() {
  const st = goalState(); if (!st || C.over) return; const G = st.G;
  if (st.done && !G.won) { G.won = C.year; G.show = "won"; say("Victory: the crown's ambition is won", `${G.towns.join(", ")} and ${st.n} towns in all are yours, ${G.by - C.year} years before the time. Play on, if you like.`); }
  else if (!G.won && !G.out && C.year >= G.by) { G.out = C.year; G.show = "out"; say("The years run out", `${G.by} is come, and the crown's ambition not won: ${st.held.filter(([, h]) => h).length} of the ${G.towns.length} towns it asked for, ${st.n} of ${G.n} in all. Play on, if you like.`); }
}
function goalHtml() {
  const st = goalState(); if (!st) return ""; const { G, n, held } = st, left = G.by - C.year;
  return fold("goal", `<span class="cmp-h"><b>${G.won ? "Victory won" : "Victory"}</b><small>${G.won ? `in ${G.won}` : G.out ? "the years ran out" : `by ${G.by} · ${left} year${left === 1 ? "" : "s"} left`}</small></span>`,
    `<div class="cmp-goals">${held.map(([t, h]) => `<span class="${h ? "on" : ""}"><i>${h ? "✓" : ""}</i>Hold&nbsp;<button class="tm-lnk" data-goto="${esc(t)}" title="Show it on the map">${esc(t)}</button></span>`).join("")}<span class="${n >= G.n ? "on" : ""}"><i>${n >= G.n ? "✓" : ""}</i>${G.n} towns in all <em>${n} now</em></span></div>`, !G.won);
}
// (won, or the time run out: told once, in a page of its own over the map)
function goalScreen() {
  const G = C && C.goal; if (!G || !G.show || $("cmpGoal") || $("cmpGazette")) return; const kind = G.show; G.show = null; persist();
  // (the crown lost: a page of its own too, not only a line at the side)
  if (kind === "lost") {
    const el = document.createElement("div"); el.id = "cmpGoal"; el.className = "cmp-must"; $("campaign").appendChild(el);
    el.innerHTML = `<div class="cmp-mbox cmp-goalbox lost"><h2>Your crown is lost</h2><p class="sub">${esc(NATIONS[C.me].name)}, ${C.year}</p>
      <p>The last of your towns has fallen, and none was taken back. ${esc(The(C.me))} ${v3(C.me, "is")} a name in the histories now, ${C.year - 1683} year${C.year - 1684 ? "s" : ""} after you took up its crown.</p>
      <nav class="menu">${mp ? "" : `<button class="btn primary" data-gl="new">Another campaign</button>`}<button class="btn" data-gl="on">Look at the map</button></nav></div>`;
    sfx("parchment", 0.5);
    el.onclick = e => { const b = e.target.closest("[data-gl]"); if (!b) return; el.remove(); if (b.dataset.gl === "new" && !mp) drawPick(); };
    return;
  }
  const st = goalState(), el = document.createElement("div"); el.id = "cmpGoal"; el.className = "cmp-must"; $("campaign").appendChild(el);
  el.innerHTML = `<div class="cmp-mbox cmp-goalbox ${kind}"><h2>${kind === "won" ? "Victory" : "The years run out"}</h2><p class="sub">${esc(NATIONS[C.me].name)}, ${C.year}</p>
    <p>${kind === "won" ? `The crown's ambition is won, ${G.by - C.year} years before its time: every town it asked for is yours, and ${st.n} in all. Your name is in every gazette in the world.` : `${G.by} is come. Of the towns the crown asked for you hold ${st.held.filter(([, h]) => h).length} of ${G.towns.length}, and ${st.n} of the ${G.n} in all.`}</p>
    <div class="cmp-goals">${st.held.map(([t, h]) => `<span class="${h ? "on" : ""}"><i>${h ? "✓" : ""}</i>${esc(t)}</span>`).join("")}</div>
    <nav class="menu"><button class="btn primary" data-gl="on">Play on</button>${mp ? "" : `<button class="btn" data-gl="new">Another campaign</button>`}</nav></div>`;
  sfx(kind === "won" ? "bell" : "parchment", 0.5);
  el.onclick = e => { const b = e.target.closest("[data-gl]"); if (!b) return; el.remove(); if (b.dataset.gl === "new" && !mp) drawPick(); };
}
function missionsHtml() {
  const M = (C && !C.mp && C.missions) || []; if (!M.length) return "";
  return `<div class="cmp-card cmp-missions"><span class="cmp-h"><b>Missions from ${crownW(0)}</b></span>${M.map(m => { const left = m.by - C.year; return `<div class="cmp-mis"><b>${esc(m.title)}</b><small>${esc(m.d)}</small><span><em>${m.gold} thalers</em><i class="${left <= 0 ? "down" : ""}">${left <= 0 ? "this year" : `${left} year${left > 1 ? "s" : ""} left`}</i></span></div>`; }).join("")}</div>`;
}
// (the government's year: unrest counted, a revolution when it's been widespread two years running; an election in a
//  constitutional monarchy every five years, a minister perhaps turned out)
function govYear(g) {
  const G = govOf_(), towns = citiesOfNow(g, C.me); G.cand = {}; G.swap = null;
  // (ports shut by enemy fleets: said in the year's news)
  { const sh = tradeOf(g).shut; if (sh.length) say(`Blockade: ${sh.map(([ct]) => ct[0]).join(", ")}`, `${sh.length > 1 ? "Enemy fleets lie" : `${poss(The(sh[0][1]))} fleet lies`} off ${sh.length > 1 ? "your ports" : sh[0][0][0]}: no trade goes in or out. Send a fleet to drive ${sh.length > 1 ? "them" : "it"} off.`); }
  // (a corrupt minister caught at it: the money gone, and the choice of turning him out or keeping him)
  for (const [p, title] of POSTS) { const m = G.min[p]; if (m.cor >= 2 && !(m.scT != null && C.year - m.scT < 3) && R() < 0.01 + m.cor * 0.025 && !C.events.some(e => !e.done && e.kind === "scandal")) { m.scT = C.year; const lost = Math.min(C.gold, 40 + m.cor * 35); C.gold -= lost; C.events.push({ kind: "scandal", post: p, lost }); say(`Scandal: the minister of ${title === "Treasury" ? "the Treasury" : title}`, `${m.name} is found to have taken ${lost} thalers from the treasury.`); break; } }
  const restless = towns.length ? towns.filter(ct => orderOf(ct) < 0).length / towns.length : 0;
  G.unrest = restless >= 0.4 ? G.unrest + 1 : Math.max(0, G.unrest - 1);
  if (G.unrest >= 2 && !C.events.some(e => !e.done && e.kind === "revolution")) { const to = G.type === "absolute" ? "constitutional" : G.type === "constitutional" ? "republic" : "constitutional"; C.events.push({ kind: "revolution", to }); }
  if (G.type === "constitutional" && (C.year - G.since) % 5 === 0 && C.year !== G.since) {
    const [p, title] = pick(POSTS), old = G.min[p], nu = minister(p); if (R() < 0.6) { G.min[p] = nu; say(`An election: a new minister of ${title === "Treasury" ? "the Treasury" : title}`, `${old.name} loses his seat; ${nu.name} takes ${title === "Treasury" ? "the Treasury" : `the ministry of ${title}`}.`); } else say("An election", "Parliament returns the ministers as they were.");
  }
}
function govHtml() {
  const G = govOf_(), T = GOVS[G.type];
  return fold("gov", `<span class="cmp-h"><b>Government</b><small title="${esc(T.d)}">${esc(T.n)}${G.unrest ? ` · <em class="down">unrest</em>` : ""}</small></span>`, `<p class="cmp-fine">${esc(T.d)}</p><div class="cmp-mins">${POSTS.map(([p, title, what]) => { const m = G.min[p]; return `<div class="cmp-min" title="${esc(what)}">${face(m, "sm")}<span><small>${title}</small><b>${esc(m.name)}</b><em class="cmp-minst"><span title="Skill">Skill ${dots(m.sk)}</span><span title="Corruption: the more, the more of what passes through his hands sticks to them">Corruption ${dots(m.cor, "bad")}</span></em></span>${G.swap === C.year ? "" : `<button class="tm-lnk" data-minr="${p}">Replace</button>`}</div>`; }).join("")}</div>${(() => { const inc = income(grid()) - 40, lost = Math.round(inc / Math.max(0.01, 1 - corLoss()) * corLoss()); return lost > 0 ? `<small class="cmp-fine">Corruption at the Treasury costs about ${lost} thalers a year.</small>` : ""; })()}${G.swap === C.year ? `<small class="cmp-fine">A minister has been changed this year.</small>` : ""}`);
}
// (a post's candidates, three men to choose from — the same three all year)
function ministerPick(post) {
  const G = govOf_(); G.cand ||= {}; const L = G.cand[post] ||= [minister(post), minister(post), minister(post)], title = POSTS.find(x => x[0] === post)[1];
  const el = document.createElement("div"); el.id = "cmpMin"; el.className = "cmp-must"; $("campaign").appendChild(el);
  el.innerHTML = `<div class="cmp-mbox cmp-minbox"><h2>Minister of ${post === "treasury" ? "the Treasury" : title}</h2><p class="sub">${esc(POSTS.find(x => x[0] === post)[2])}. Now: ${esc(G.min[post].name)}, skill ${G.min[post].sk}, corruption ${G.min[post].cor}. One minister can be changed a year.</p><div class="cmp-mincands">${L.map((m, i) => `<button class="cmp-mincand" data-minc="${i}">${face(m)}<b>${esc(m.name)}</b><small>Skill</small>${dots(m.sk)}<small>Corruption</small>${dots(m.cor, "bad")}</button>`).join("")}</div><div class="pv-acts"><button class="btn" data-minx="1">Keep the one you have</button></div></div>`;
  el.onclick = e => { const b = e.target.closest("[data-minc],[data-minx]"); if (!b) { if (e.target === el) el.remove(); return; } el.remove(); if (b.dataset.minc != null) doAct({ k: "minister", post, i: +b.dataset.minc }); };
}
function realmMine(g) {
  riots(g);
  reconcile(); { const men = eachArmy(id => replenish(g, id === armyIds()[0])).reduce((t, v) => t + (v | 0), 0); if (men >= 300) say(`The regiments fill their ranks`, `${fmtN(Math.round(men / 100) * 100)} men from your towns join the thin regiments.`); }
  if (C.lq && C.lq.length) {
    // (drilled where they were raised: a barracks sends its recruits out blooded, a military academy seasoned)
    let held = 0; const by = {}; for (const q of C.lq) { const lv = lvOf(q.t, "army"); const tc = CITIES.find(c => c[0] === q.t), na = null, near = false; C.units.push({ k: q.k, hp: 1, ...(lv >= 2 ? { xp: lv >= 3 ? 2 : 1 } : {}), ...(near ? (na ? { ar: na } : {}) : tc ? { at: q.t } : {}) }); if (tc && !near) held++; if (near && na !== (C.ar | 0)) { const A = C.armies.find(a => a.id === na); if (A) A.army = (A.army | 0) + 1; } by[q.k] = (by[q.k] || 0) + 1; }
    const n = C.lq.length; C.army = Math.round(unitSum());
    say(`${n} new regiment${n > 1 ? "s" : ""} raised`, `${Object.entries(by).map(([k, c]) => `${c} of ${TROOPS[k].name.toLowerCase()}`).join(", ")}: armed and drilled over the year. ${n > 1 ? "They stand" : "It stands"} in the garrison of the town that raised ${n > 1 ? "them" : "it"}: choose the town to send ${n > 1 ? "them" : "it"} to one of your armies, or bring an army to fetch ${n > 1 ? "them" : "it"}.`);
  }
  C.lq = []; C.levyQ = 0;
  const T = C.tech; T.pts += research(g);
  // (a learning is years in the making, however many scholars: the first of a branch two at the least, what's built on
  //  it three, the furthest four — when a realm of colleges had each in a single year)
  if (T.cur) T.yrs = (T.yrs | 0) + 1;
  if (T.cur && T.pts >= techCost(T.cur) && T.yrs >= techYears(T.cur)) {
    const id = T.cur, t = TECHS[id]; T.pts -= techCost(id); T.done[id] = true;
    say(`A discovery: ${t.n.replace(/^The /, "the ").replace(/^./, c => c.toUpperCase())}`, `After ${T.yrs} years of study, your scholars have mastered it. ${t.d}`, "learn");
    T.cur = null; T.yrs = 0;
  }
  if (!T.cur) T.pts = Math.min(T.pts, 6);
  // (thin regiments of one arm in one army made into one: their men together, their experience as the men bring it)
  { let merged = 0; const groups = {}; for (const u of C.units) if (u.hp < 0.6) (groups[`${u.at || "a" + (u.ar | 0)}|${u.k}`] ||= []).push(u);
    for (const L of Object.values(groups)) { L.sort((a, b) => a.hp - b.hp); while (L.length > 1 && L[0].hp + L[1].hp <= 1) { const [a, b] = L.splice(0, 2), hp = a.hp + b.hp; b.xp = ((a.xp || 0) * a.hp + (b.xp || 0) * b.hp) / hp; b.hp = hp; C.units.splice(C.units.indexOf(a), 1); merged++; if (hp < 0.6) { L.push(b); L.sort((x, y) => x.hp - y.hp); } } }
    if (merged) say(`${merged} thin regiment${merged > 1 ? "s" : ""} merged`, "Too few men left in them to stand alone: their men go into others of the same arm."); }
  eachArmy(id => {
    siegeYear(g); winterWear(g, id);
    C.morale = Math.round((C.morale ?? moraleBase()) + (moraleBase() - (C.morale ?? moraleBase())) * 0.35);
    if (C.gen) { C.gen.served = (C.gen.served | 0) + 1; genYear(C.gen); if (C.gen.served >= lifeOf(C.gen)) { say(`${C.gen.name} dies`, `Of old age, after long service. Choose who will lead ${id ? `the ${armyName(id).toLowerCase()}` : "your army"} now.`); C.gen = null; } }
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
// (numbers tell, as they did: two to one wins three times in four, three to one nearly nine in ten)
function odds(att, def, walls) { const a = Math.pow(att, 1.7), d = Math.pow(def * (walls === true ? 1.3 : walls || 1), 1.7); return a / (a + d); }
// the outcome applied, however it was decided: casualties both ways; the town changes hands if the attacker won
function settle(o, won, myLossK, theirLossK) {
  const mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att;
  // (defending a town: its own regiments bear their share of the losses, beside the field army's)
  //  — and the field army only its own: the part of it that came to the town's help, not the whole of it far away
  let loss = mine * myLossK;
  // (a town held by its garrison alone, the army far off: the army's men, guns, spirit and general are not in it)
  const away = !o.attack && !o.field && o.army === false;
  if (!o.attack && C.units) {
    const G = garUnits(o.ct[0]), gs = G.reduce((t, u) => t + worthOf(u), 0), fieldPart = clamp(mine - garrison(o.ct), 0, mine);
    if (gs > 0) { const gl = Math.min(gs, loss * gs / Math.max(1, mine)), f = 1 - gl / gs; for (const u of G) u.hp *= f; C.units = C.units.filter(u => !u.at || u.hp >= 0.12); }
    loss = away ? 0 : mine * myLossK * fieldPart / Math.max(1, mine);
  }
  const broken = wearUnits(loss, o.pick) || {};
  // (the regiments that fought: the wiser for it — the more so for a victory)
  for (const u of C.units || []) if ((!away || u.at === o.ct[0]) && (!o.pick || (o.pick.men && o.pick.men[u.k]))) u.xp = Math.min(3, (u.xp || 0) + (won ? 0.6 : 0.3) * (o.pick ? 1 : 0.6));
  { const L = Math.max(0, theirs - garrison(o.ct)) * theirLossK, co = !isHuman(o.foe) && (o.colo ? coloOf(o.foe) : coloFor(o.foe, o.ct));
    if (co) co.n = Math.max(0, Math.round(co.n - L)); else setFoeArmy(o.foe, Math.max(0, Math.round(foeArmy(o.foe) - L))); }
  if (won && !isHuman(o.foe)) (C.foeBeat ||= {})[o.foe] = C.year;
  const name = o.ct[0];
  if (o.attack) {
    if (won) { seize(o.ct, C.me); C.took[o.foe] = (C.took[o.foe] || 0) + 1; for (const id of Object.keys(C.E.rel)) C.E.rel[id] -= id === o.foe ? 8 : NATION_FAITH[id] === NATION_FAITH[o.foe] ? 4 : 2; const fa = NATION_FAITH[o.foe]; say(`${name} is yours`, `Taken from ${the(o.foe)}.${fa && fa !== "native" ? ` The other ${FAITH_WORD[fa]} courts are alarmed.` : ""}`); if (!C.mp && peopleOf(o.ct) !== C.me && !C.events.some(e => !e.done && e.kind === "sack" && e.ct === name)) C.events.push({ kind: "sack", ct: name, foe: o.foe }); }
    else say(`Beaten before ${name}`, `Your army falls back with what it has left: ${armyStr()}.`);
  } else {
    if (won) { say(`${name} holds`, `${poss(The(o.foe))} ${NATIONS[o.foe] && NATIONS[o.foe].nw ? "war party" : "army"} is thrown back.`); if (!isHuman(o.foe) && C.foePos && C.foePos[o.foe]) { const h = homeOf(grid(), o.foe); if (h) { const b = stepToward(cellXY(o.ct), h, 8); C.foePos[o.foe] = { x: b.x, y: b.y }; } } strikeBack(o.foe); }
    else { seize(o.ct, o.foe); C.lost[o.foe] = (C.lost[o.foe] || 0) + 1; say(`${name} has fallen`, `${The(o.foe)} ${v3(o.foe, "takes")} it.`); if (C.govs) delete C.govs[name]; }
  }
  if (Object.keys(broken).length) say(`Regiments broken at ${name}`, `${Object.entries(broken).map(([k, c]) => `${c} of ${TROOPS[k].name.toLowerCase()}`).join(", ")}: too few men left to stand as regiments, they are struck off the roll.`);
  // (where your army ends up: in the town it took, or fallen back toward home from the one it couldn't)
  if (o.attack && !o.convoy) { const t = cellXY(o.ct); if (won) C.pos = { x: t.x, y: t.y }; else { const h = homeOf(grid(), C.me) || armyPos(); const b = stepToward(t, h, 6); C.pos = { x: b.x, y: b.y }; } }
  // (a storm through the breach: the siege over, won or lost)
  if (o.attack && siegeOf(o.ct)) C.siege = null;
  // (the army's spirit: up with a victory — more for a town taken — down hard with a defeat)
  // (the generals' fate: in a lost battle one may fall; even in a won one, now and then — reckoned first, so a man killed
  //  in it isn't also given the battle's mark on him, cautious for a second defeat he didn't live through)
  const falls = !!(C.gen && !C.gen.you && !away && R() < (won ? 0.05 : 0.25));
  if (!away) { moraleMove(won ? (o.attack ? 12 : 8) : -16); if (!falls) { genMark(o, won); if (won && (o.attack || !o.walls)) genWin(); } }
  if (falls) { moraleMove(-10); say(`${C.gen.name} falls at ${name}`, "Killed at the head of his men. Choose who will lead your army now."); C.gen = null; needGeneral(); }
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
  const mine = cmdMul(C.gen) * (1 + trSum(C.gen, o.attack ? "att" : "def")) * moraleK(), theirs = cmdMul(genOf(o.foe)) * (1 + trSum(genOf(o.foe), o.attack ? "def" : "att")), p = odds(o.att * (o.attack ? mine : theirs), o.def * (o.attack ? theirs : mine), o.walls && !o.breach ? ((o.attack ? hasT(C.gen, "engineer") : hasT(genOf(o.foe), "engineer")) ? 1.15 : true) : false), attWins = R() < p, won = o.attack ? attWins : !attWins;
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
  // (the battle begun: from here, leaving it is leaving the field)
  if (C.pending && !C.pending.begun) { C.pending.begun = true; persist(); }
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
  // (what each side has learnt: the socket bayonet, linear tactics, field guns; an AI crown has them as the age did —
  //  the bayonet by the later 1690s, platoon fire and light field guns by the 1700s)
  const myTech = { bayonet: knows("bayonet"), linear: knows("linear"), fieldart: knows("fieldart") }, foeTech = isHuman(o.foe) ? as(o.foe, () => ({ bayonet: knows("bayonet"), linear: knows("linear"), fieldart: knows("fieldart") })) : { bayonet: C.year >= 1697, linear: C.year >= 1705, fieldart: C.year >= 1708 };
  // (in the open field the guns that keep up with the army: one without field artillery, the heavy guns left behind)
  const fieldCap = (t, n) => o.field && !t.fieldart ? Math.min(1, n) : n;
  const fg = genOf(o.foe), theirBrave = fg ? 1 + (fg.st[1] - 3) * 0.06 : 1, foeGuns = isHuman(o.foe) ? as(o.foe, () => C.guns | 0) : (C.fguns[o.foe] | 0);
  const b = {
    id: "cmp-" + ct[0], campaign: true, name: o.field ? `The field near ${ct[0]}` : o.convoy ? `The road to ${ct[0]}` : ct[0], date: `${SEASONS[s]} ${C.year}`, year: C.year, gen: C.gen && C.gen.name ? String(C.gen.name) : null, lon: ct[1], lat: ct[2],
    at: o.field ? (o.attack ? `You fall on ${poss(the(o.foe))} army on the march` : `${poss(The(o.foe))} army falls on yours in the open`) : o.convoy ? `${The(o.foe)} ${v3(o.foe, "falls")} on your supply train to ${ct[0]}` : o.attack ? `You march on ${poss(the(o.foe))} town` : `${The(o.foe)} ${v3(o.foe, "marches")} on your town`,
    hour: hourR < 0.1 ? "night" : hourR < 0.35 ? "morning" : hourR < 0.8 ? "afternoon" : "evening",
    cloud: s === 3 ? 0.7 : s === 2 ? 0.5 : s === 0 ? 0.35 : 0.1, mist: s === 2 ? 0.3 : s === 3 ? 0.25 : 0,
    fort: null, won: undefined, you: 0,
    sides: [
      { name: NATIONS[C.me].name, lead: "you", hold: o.attack ? undefined : 999, cos: [{ uni: UNI_OF[C.me], muster: { ...o.pick.men }, guns: fieldCap(myTech, o.pick.guns | 0), brave: braveMul(g), tech: myTech }, ...(ally && !o.walls ? [{ uni: UNI_OF[ally], muster: muster(ally, 14), guns: 1 }] : [])] },
      { name: NATIONS[o.foe].name, lead: "their officers", hold: o.attack ? 999 : undefined, cos: [{ uni: UNI_OF[o.foe] === UNI_OF[C.me] ? (UNI_OF[C.me] === "imperial" ? "bavarian" : "imperial") : UNI_OF[o.foe], muster: theirMuster, tech: foeTech, guns: o.convoy ? 0 : fieldCap(foeTech, Math.min(3, foeGuns, Math.ceil(theirs / 15))), brave: theirBrave }] },
    ],
    map: { snow: s === 3, things },
  };
  if (!C.mp || (mp && mp.host)) { C.pending = { ...o, ct: o.ct[0], ar: C.ar | 0 }; persist(); }
  b.onEnd = (won, killed, lost, fled) => doAct({ k: "result", won: !!won, killed: killed | 0, lost: lost | 0, myMen, theirMen, fled: !!fled });
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
// ---- the roads over land: an army goes round a bay or a lake, never across it ----
// (each land mass, labelled: the Continent one, Britain another, each island its own)
let LANDS = null, LANDS_G = null;
function landsOf(g) {
  // (the land never changes, whoever holds it: worked out once for the sheet)
  if (LANDS && LANDS_G === g.length * g[0].length) return LANDS;
  const W = g[0].length, H = g.length, lab = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let id = 0;
  for (let s0 = 0; s0 < W * H; s0++) {
    if (lab[s0] >= 0 || g[(s0 / W) | 0][s0 % W] === null) continue; let h = 0, n = 0; q[n++] = s0; lab[s0] = id;
    while (h < n) { const i = q[h++], x = i % W, y = (i / W) | 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (lab[j] >= 0 || g[ny][nx] === null) continue; lab[j] = id; q[n++] = j; } }
    id++;
  }
  LANDS_G = W * H; LANDS = lab; return lab;
}
// (the land a point is on — or, standing off a shore, the nearest land to it; −1 out at sea)
function landOf(g, p) { const L = landsOf(g), W = g[0].length, x = Math.floor(p.x), y = Math.floor(p.y); if (y >= 0 && y < g.length && x >= 0 && x < W && L[y * W + x] >= 0) return L[y * W + x]; const q = landNear(g, p, 4); return q ? L[Math.floor(q.y) * W + Math.floor(q.x)] : -1; }
const ROADS = new Map();
function landPath(g, a, b) {
  const key = `${Math.floor(a.x)},${Math.floor(a.y)}|${Math.floor(b.x)},${Math.floor(b.y)}|${g.length}`;
  if (ROADS.has(key)) return ROADS.get(key);
  const p = landPath0(g, a, b); if (ROADS.size > 400) ROADS.clear(); ROADS.set(key, p); return p;
}
function landPath0(g, a, b) {
  const W = g[0].length, H = g.length, dry = (x, y) => y >= 0 && y < H && x >= 0 && x < W && g[y][x] !== null;
  const s0 = dry(Math.floor(a.x), Math.floor(a.y)) ? a : landNear(g, a, 4), t0 = dry(Math.floor(b.x), Math.floor(b.y)) ? b : landNear(g, b, 6); if (!s0 || !t0) return null;
  const si = Math.floor(s0.y) * W + Math.floor(s0.x), ti = Math.floor(t0.y) * W + Math.floor(t0.x);
  const prev = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let h = 0, n = 0; q[n++] = si; prev[si] = si;
  while (h < n) { const i = q[h++]; if (i === ti) break; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (!dry(nx, ny)) continue; const j = ny * W + nx; if (prev[j] !== -1) continue; prev[j] = i; q[n++] = j; } }
  if (prev[ti] === -1) return null;
  const cells = []; for (let i = ti; ; i = prev[i]) { cells.push({ x: i % W + 0.5, y: ((i / W) | 0) + 0.5 }); if (i === si) break; } cells.reverse();
  // (the square-by-square way drawn straight wherever the land allows: only the turns round the water kept)
  const clear = (p, q2) => { const k = Math.ceil(Math.hypot(q2.x - p.x, q2.y - p.y) * 2); for (let i = 1; i < k; i++) if (!dry(Math.floor(p.x + (q2.x - p.x) * i / k), Math.floor(p.y + (q2.y - p.y) * i / k))) return false; return true; };
  const out = [{ x: a.x, y: a.y }]; let i = 0;
  while (i < cells.length - 1) { let j = Math.min(cells.length - 1, i + 80); while (j > i + 1 && !clear(out[out.length - 1], cells[j])) j--; out.push(cells[j]); i = j; }
  const end = out[out.length - 1]; if (dry(Math.floor(b.x), Math.floor(b.y)) && clear(end, b)) out[out.length - 1] = { x: b.x, y: b.y };
  return out;
}
// (land anywhere on the straight line between two points)
function landBetween(a, b) { const g = grid(), k = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2); for (let i = 1; i < k; i++) { const x = Math.floor(a.x + (b.x - a.x) * i / k), y = Math.floor(a.y + (b.y - a.y) * i / k); if (g[y] && g[y][x] !== null && g[y][x] !== undefined) return true; } return false; }
// (a way smoothed for the eye: drawn straight wherever the ground it keeps to allows — land for an army, sea for a fleet
//  — and its corners then rounded off, a cut corner kept only where it stays on that ground)
function smoothWay(P, sea) {
  if (!P || P.length < 3) return P; const g = grid(), H = g.length, W = g[0].length;
  const ok = (x, y) => { const cx = Math.floor(x), cy = Math.floor(y); if (cy < 0 || cy >= H || cx < 0 || cx >= W) return false; return sea ? g[cy][cx] === null : g[cy][cx] !== null; };
  const clear = (a, b) => { const k = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2); for (let i = 1; i < k; i++) if (!ok(a.x + (b.x - a.x) * i / k, a.y + (b.y - a.y) * i / k)) return false; return true; };
  let Q = [P[0]], i = 0; while (i < P.length - 1) { let j = Math.min(P.length - 1, i + 60); while (j > i + 1 && !clear(Q[Q.length - 1], P[j])) j--; Q.push(P[j]); i = j; }
  for (let it = 0; it < 2; it++) { const R2 = [Q[0]]; for (let k = 0; k < Q.length - 1; k++) { const a = Q[k], b = Q[k + 1], p1 = { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, p2 = { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }; if (k > 0) R2.push(ok(p1.x, p1.y) ? p1 : a); R2.push(k < Q.length - 2 ? (ok(p2.x, p2.y) ? p2 : b) : b); } Q = R2; }
  return Q;
}
// (the land and the sea worked out while the map is first looked at, not on the first march, where it was a stall)
function warmMaps() { const go = () => { if (!C) return; try { W0(); const g = grid(); landsOf(g); oceanOf(g); } catch (e) {} }; (window.requestIdleCallback || (f => setTimeout(f, 400)))(go, { timeout: 1500 }); }
// (an army just formed: drawn where it stands at once, never marching in from where an army of its number once stood)
function appearAt(id, p) { const k = C.me + "#" + id; lastArmyAt[k] = { x: p.x, y: p.y }; marchAnims = marchAnims.filter(A => A.key !== k); }
// (a point along a way, so far along its length — a fraction of it — with the way it faces there)
function alongPts(P, f) {
  let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
  let d = f * L; for (let i = 1; i < P.length; i++) { const s = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); if (d <= s || i === P.length - 1) { const k = s ? Math.min(1, d / s) : 1; return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * k, y: P[i - 1].y + (P[i].y - P[i - 1].y) * k, a: Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x) }; } d -= s; }
  return { x: P[0].x, y: P[0].y, a: 0 };
}
// (as far along it as a year's sailing goes: the New World drawn larger, as for marches)
function sailAlong(path, range = SAIL) { let d = 0, i = 1; for (; i < path.length; i++) { const st = dist2(path[i - 1], path[i]) / magAt(path[i]); if (d + st > range) break; d += st; } return { at: path[i - 1], arrived: i >= path.length, len: path.reduce((t, p, j) => j ? t + dist2(path[j - 1], p) / magAt(p) : 0, 0) }; }
// (a voyage that passes within hail of a fleet it's at war with, anywhere along the way it sails this year: stopped
//  there, and the two fight — a fleet can't slip through the Channel past the enemy's lying in it)
function crossed(p, st, others) { const end = p.indexOf(st.at), last = end < 0 ? p.length - 1 : end; for (let i = 0; i <= last; i++) for (const o of others) if (dist2(p[i], o.pos) <= CONTACT) return { at: p[i], o }; return null; }
const foesAfloat = () => Object.entries(C.foeFleets || {}).filter(([id, F]) => F && F.ships && F.ships.length && atWar(id)).map(([id, F]) => ({ pos: F.pos, id }));
function metAtSea(f, cut) { f.pos = { x: cut.at.x, y: cut.at.y }; f.go = null; if (!C.events.some(e => !e.done && e.kind === "seabattle" && e.foe === cut.o.id)) { C.events.push({ kind: "seabattle", foe: cut.o.id, fid: f.id }); say(`The ${fleetName(f).toLowerCase()} meets ${poss(the(cut.o.id))} fleet`, "They sight each other's topsails and close: a battle at sea."); } }
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
    // (sent to join another fleet: following it wherever it has gone)
    const J = f.joinTo != null && C.fleets.find(x => x.id === f.joinTo && x !== f); if (f.joinTo != null && !J) f.joinTo = null;
    if (J && dist2(J.pos, f.pos) > 4) f.go = { x: J.pos.x, y: J.pos.y };
    if (f.go) { const p = seaPath(g, f.pos, f.go); if (!p) { f.go = null; continue; } const st = sailAlong(p), cut = crossed(p, st, foesAfloat()); if (cut) { metAtSea(f, cut); f.moved = true; syncAboard(f); continue; } f.pos = { x: st.at.x, y: st.at.y }; if (st.arrived && !J) { f.go = null; say(`The ${fleetName(f).toLowerCase()} arrives`, "It's where you sent it."); } f.moved = true; syncAboard(f); }
  }
  for (const f of [...(C.fleets || [])]) { const J = f.joinTo != null && C.fleets.find(x => x.id === f.joinTo && x !== f); if (J && dist2(J.pos, f.pos) <= 4) { mergeFleet(f, J); say(`The ${fleetName(f).toLowerCase()} joins the ${fleetName(J).toLowerCase()}`, `${J.ships.length} ships now sail together.`); } }
}
// a fleet sent somewhere: as far as a year's sailing takes it now, the rest of the way in the years after
function sail(fid, t) {
  const g = grid(), f = fleetById(fid); if (!f) return "No such fleet."; if (f.moved) return "That fleet has already sailed this year.";
  const p = seaPath(g, f.pos, t); if (!p) return onLake(g, f.pos) ? "The fleet can't sail there: its lake doesn't reach it." : "The fleet can't sail there: the sea doesn't reach it.";
  const st = sailAlong(p), cut = crossed(p, st, foesAfloat());
  if (cut) { metAtSea(f, cut); f.moved = true; syncAboard(f); persist(); return null; }
  f.pos = { x: st.at.x, y: st.at.y }; f.go = st.arrived ? null : { x: p[p.length - 1].x, y: p[p.length - 1].y }; f.moved = true; syncAboard(f); persist();
  return null;
}
// (two fleets of yours made one: the ships, and any army aboard, into the other; the first fleet struck from the list)
function mergeFleet(f, T) {
  T.ships.push(...f.ships); eachArmy(() => { if (C.emb === f.id) { C.emb = T.id; C.pos = { x: T.pos.x, y: T.pos.y }; C.go = null; } });
  C.fleets = C.fleets.filter(x => x !== f); if (selFleet === f.id) selFleet = T.id; T.joinTo = null;
}
// a fleet sent to join another of yours: at once if it's within the year's sail, else following it till it gets there
function fleetJoin(fid, to) {
  const f = fleetById(fid), T = fleetById(to); if (!f || !T || f === T) return "No such fleet.";
  if (dist2(f.pos, T.pos) <= 4) { mergeFleet(f, T); persist(); return null; }
  const why = sail(fid, { x: T.pos.x, y: T.pos.y }); if (why) return why;
  if (dist2(f.pos, T.pos) <= 4) { mergeFleet(f, T); persist(); return null; }
  f.joinTo = to; persist(); return null;
}
// the army in hand taken aboard a fleet of yours lying off the shore where it stands — if she has the room
// (a river port's quays are some way up from the sea: the fleet off its mouth still counts as at the shore)
const EMBARK_R = 9;
// (why the army in hand can't go aboard a fleet now, or null if it can)
function whyNotEmbark(f) {
  if (!f) return "No such fleet."; if (C.emb != null) return "Your army is already aboard a fleet.";
  if (C.siege) return "Not while it's besieging a town."; if (!field().length) return "The army has no regiments.";
  if (dist2(armyPos(), f.pos) > EMBARK_R) return `Bring the fleet to the shore where your army stands (it's off ${nearTown(f.pos)[0]}; the army is at ${nearTown(armyPos())[0]}).`;
  if (fleetCap(f) - aboardRegs(f.id) < 1) return "The fleet is full. Build more ships.";
  return null;
}
function embark(fid) {
  const f = fleetById(fid), why = whyNotEmbark(f); if (why) return why;
  // (more regiments than the ships can carry: as many as they can go aboard, as an army of their own; the rest stay ashore)
  const room = fleetCap(f) - aboardRegs(fid);
  if (room < field().length) {
    if ((C.armies || []).length >= 5) return `The fleet has room for ${room} of your ${field().length} regiments, and you have armies enough to split off another. Build more ships.`;
    reconcile(); const id = Math.max(...armyIds()) + 1, F = field().sort((a, b) => b.hp - a.hp), p = armyPos();
    for (const u of F.slice(0, room)) u.ar = id; C.army = Math.round(unitSum());
    (C.armies ||= []).push({ id, pos: { x: p.x, y: p.y }, go: null, moved: C.moved, siege: null, army: room, gen: null, morale: C.morale ?? 50, supplied: false, sailed: 0 });
    appearAt(id, p);
    useArmy(id);
  }
  C.emb = fid; C.pos = { x: f.pos.x, y: f.pos.y }; C.go = null; persist(); return null;
}
// and put ashore on the nearest beach — the landing takes the rest of the year
function land() {
  const f = fleetById(C.emb); if (!f) { C.emb = null; return null; }
  const p = landNear(grid(), f.pos, 4); if (!p) return "There's no shore near enough to land on. Sail in closer.";
  { const bar = barredBy(p, p, true); if (bar.length) return `That shore is ${poss(the(bar[0]))}: ask for military access before landing an army on it.`; }
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
    const tg = mine.reduce((b, f) => (dist2(f.pos, F.pos) < dist2(b.pos, F.pos) ? f : b));
    // (a fleet too weak to seek a battle keeps to its own waters: it doesn't sail up to yours only to lie there)
    if (gunsOf(F.ships) <= gunsOf(tg.ships) * 0.7) continue;
    const p = seaPath(g, F.pos, tg.pos); if (!p) continue;
    const st = sailAlong(p, SAIL * 0.8), cut = crossed(p, st, mine.map(f => ({ pos: f.pos, f }))); F.hunt = C.year;
    // (come up with yours — the one it sought, or another lying on its way: it falls on it, always; a fleet doesn't
    //  sail up to an enemy's to look at it)
    F.pos = cut ? { x: cut.at.x, y: cut.at.y } : { x: st.at.x, y: st.at.y };
    const hit = cut ? cut.o.f : st.arrived || dist2(F.pos, tg.pos) <= CONTACT ? tg : null;
    if (hit && !C.events.some(e => !e.done && e.kind === "seabattle" && e.foe === id)) C.events.push({ kind: "seabattle", foe: id, fid: hit.id });
  }
}
// (two fleets at war that end the year alongside each other, whoever sailed up to whom: a battle, not a year of the
//  two lying a cable apart)
const CONTACT = 8;
function seaContact(ids) {
  const mine = (C.fleets || []).filter(f => f.ships.length); if (!mine.length) return;
  for (const id of ids) {
    const F = C.foeFleets && C.foeFleets[id]; if (!F || !F.ships.length || !atWar(id) || C.events.some(e => !e.done && e.kind === "seabattle" && e.foe === id)) continue;
    const near = mine.filter(f => dist2(f.pos, F.pos) <= CONTACT).sort((a, b) => dist2(a.pos, F.pos) - dist2(b.pos, F.pos))[0];
    if (near) C.events.push({ kind: "seabattle", foe: id, fid: near.id });
  }
}
// (an enemy fleet your fleet can fall on this year)
function canSeaFight(fid, foe) {
  const f = fleetById(fid), F = C.foeFleets && C.foeFleets[foe]; if (!f || !F || !f.ships.length || !F.ships.length || !atWar(foe)) return false;
  // (sailed this year: only if it's already alongside them)
  if (f.moved) return dist2(f.pos, F.pos) <= 4;
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
  // (and the winner's own struck ships, retaken once the loser is beaten off or gone)
  f.ships.push(...prizes, ...(res.won ? taken(res.mine) : [])); F.ships.push(...lostTo, ...(res.won ? [] : taken(res.theirs)));
  const sunkM = res.mine.filter(s => s.sunk).length, sunkT = res.theirs.filter(s => s.sunk).length;
  say(res.won ? `Victory at sea` : res.left ? `Your fleet breaks off the action` : `Beaten at sea`, `Against ${poss(the(foe))} fleet: ${!sunkT && !sunkM && !prizes.length && !lostTo.length ? "neither side loses a ship, though both are badly knocked about." : `${sunkT} of theirs sunk${prizes.length ? `, ${prizes.length} taken as prize${prizes.length > 1 ? "s" : ""}` : ""}; ${sunkM} of yours sunk${lostTo.length ? `, ${lostTo.length} taken` : ""}.`}`);
  // (the regiments aboard ships that went down or were taken: lost with them)
  drownAboard(f, capBefore);
  if (!f.ships.length) C.fleets = C.fleets.filter(x => x !== f);
  if (!F.ships.length) delete C.foeFleets[foe];
  else if (res.won) { const h = citiesOfNow(grid(), foe).map(ct => harbourOf(ct, true)).find(Boolean); if (h) { const p = seaPath(grid(), F.pos, h); if (p) { const st = sailAlong(p, 60); F.pos = { x: st.at.x, y: st.at.y }; } } }
  moraleMove(res.won ? 6 : -6);
  invasionAfter(foe, !!res.won && !res.left);
}
// ---- an invasion over the narrow seas: an enemy army taking ship for a town of yours across the Channel, the North Sea or
//  the Mediterranean — and turned back by a fleet of yours that lies in its way ----
// (how far off the crossing a fleet of yours still stands in its way: the same stretch of sea, not only the line)
const GUARD_SEA = 60;
const narrowSea = (a, b) => seaSide(a) === seaSide(b) && mdist(a, b) <= MARCH * 2.5;
// (how near a point lies to the crossing, from one shore to the other)
const offLine = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1, t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L, 0, 1); return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
function invade(id, fp, ct) {
  const tc = cellXY(ct); if (!narrowSea(fp, tc)) return false;
  if (C.invade && C.invade.foe === id) { if (C.events.some(e => !e.done && e.kind === "seabattle" && e.foe === id)) return true; C.invade = null; }
  // (your fleet in the way: the nearest of yours to the crossing, if any lies close to it)
  const guard = (C.fleets || []).filter(f => f.ships.length && offLine(f.pos, fp, tc) <= GUARD_SEA).sort((a, b) => offLine(a.pos, fp, tc) - offLine(b.pos, fp, tc))[0];
  const F = C.foeFleets && C.foeFleets[id];
  if (guard && !(F && F.ships.length)) { const lost = Math.max(1, Math.round((C.foes[id] | 0) * 0.12)); C.foes[id] = Math.max(0, (C.foes[id] | 0) - lost); (C.foeBeat ||= {})[id] = C.year; say(`Your ${fleetName(guard).toLowerCase()} falls on ${poss(the(id))} transports`, `${The(id)} ${v3(id, "tries")} to carry ${NATIONS[id].nw ? "its warriors" : "its army"} over to ${ct[0]} with no fleet to cover the crossing. Your ships catch the transports at sea: ${knowsArmy(id) ? `${lost} regiments` : "many of its men"} drowned or taken, and the rest put back to port.`); return true; }
  if (guard) {
    // (their fleet must beat yours first: the battle at sea, and the crossing on its outcome)
    F.pos = { x: guard.pos.x + 0.6, y: guard.pos.y + 0.6 }; C.invade = { foe: id, ct: ct[0], fid: guard.id };
    if (!C.events.some(e => !e.done && e.kind === "seabattle" && e.foe === id)) C.events.push({ kind: "seabattle", foe: id, fid: guard.id, invade: ct[0] });
    say(`${poss(The(id))} fleet sails to clear the way to ${ct[0]}`, `${The(id)} ${v3(id, "means")} to carry ${NATIONS[id].nw ? "its warriors" : "an army"} over, and your ${fleetName(guard).toLowerCase()} lies in the way. Beat their fleet and the crossing fails.`);
    return true;
  }
  landFoe(id, ct); return true;
}
// (put ashore near a town of yours: on the march to it, at its walls the year after)
// how far off a marching army still is, in years: told true, not always "next year"
function marchOff(p, tc) { const n = Math.max(1, Math.ceil(mdist(p, tc) / MARCH)); return n === 1 ? "a year's march off. They'll be at its walls next year." : `${["", "", "two", "three", "four", "five"][n] || "many"} years' march off.`; }
function landFoe(id, ct) { const t = cellXY(ct), sh = landNear(grid(), { x: t.x + 1.5, y: t.y + 1 }, 6) || t; C.foePos[id] = { x: sh.x, y: sh.y }; (C.foeGo ||= {})[id] = ct[0]; say(`${The(id)} ${v3(id, "lands")} an army near ${ct[0]}`, `${knowsArmy(id) ? `Some ${C.foes[id]} regiments` : "An army"} put ashore over the water, a march from its walls.`); }
// (the battle at sea that decided an invasion: won, the crossing fails and the transports go down; lost, they land)
function invasionAfter(foe, won) {
  const I = C.invade; if (!I || I.foe !== foe) return; C.invade = null; const ct = CITIES.find(c => c[0] === I.ct); if (!ct) return;
  if (won) { const lost = Math.round((C.foes[foe] | 0) * 0.15); C.foes[foe] = Math.max(0, (C.foes[foe] | 0) - lost); (C.foeBeat ||= {})[foe] = C.year; if (C.foeGo) delete C.foeGo[foe]; say(`The invasion fails`, `With their fleet beaten, ${poss(the(foe))} crossing to ${I.ct} is given up${knowsArmy(foe) ? `, ${lost} regiments lost with the transports` : ", and men lost with the transports"}.`); }
  else if (cityOwner(grid(), ct) === C.me) landFoe(foe, ct);
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
  if (isColo(id)) { const c = coloOf(id), b = crownOf(id); return !!c && c.n >= 2 && atWar(b) && !C.moved && !C.siege && C.emb == null && C.army >= 5 && !overSea(armyPos(), c.pos) && yearsTo(c.pos) <= 1; }
  const fp = !isHuman(id) && atWar(id) && foeArmyPos(id); if (!fp || C.moved || C.siege || C.army < 5 || (C.foes[id] | 0) < 1) return false;
  return !overSea(armyPos(), fp) && yearsTo(fp) <= 1;
}
// (the town nearest the field, to name the battle after and give it its country)
const nearTown = p => CITIES.reduce((b, ct) => { const d = dist2(cellXY(ct), p); return !b || d < b[1] ? [ct, d] : b; }, null)[0];
function fieldOf(id) { if (isColo(id)) { const c = coloOf(id); return { attack: true, field: true, colo: true, foe: crownOf(id), ct: nearTown(c.pos), att: C.army, def: Math.max(2, Math.round(c.n * 0.85)), walls: false, at: { x: c.pos.x, y: c.pos.y } }; } const fp = foeArmyPos(id); return { attack: true, field: true, foe: id, ct: nearTown(fp), att: C.army, def: Math.max(3, Math.round((C.foes[id] | 0) * 0.85)), walls: false, at: { x: fp.x, y: fp.y } }; }
// the field battle decided: the losses both ways; the beaten army thrown back, its march broken
// (what a battle costs the side you fought: its dead and more — beaten, the wounded it leaves on the field, the men taken
//  prisoner and the men who ran and never came back: two fifths of it at the least)
function routLoss(a) { const t = Math.min(0.9, (a.killed || 0) / Math.max(1, a.theirMen || 20)) * 0.8 + 0.05; return a.won ? Math.min(0.85, Math.max(0.4, t + 0.2)) : t; }
function fieldEnd(o, won, myLossK, theirLossK) {
  const mine = o.attack ? o.att : o.def, theirs = o.attack ? o.def : o.att;
  const broken = wearUnits(mine * myLossK, o.pick) || {};
  for (const u of field()) if (!o.pick || (o.pick.men && o.pick.men[u.k])) u.xp = Math.min(3, (u.xp || 0) + (won ? 0.6 : 0.3) * (o.pick ? 1 : 0.6));
  const CO = o.colo ? coloOf(o.foe) : null;
  if (CO) CO.n = Math.max(0, Math.round(CO.n - theirs * theirLossK - (won ? theirs * 0.06 : 0)));
  else C.foes[o.foe] = Math.max(0, Math.round((C.foes[o.foe] | 0) - theirs * theirLossK - (won ? theirs * 0.06 : 0)));
  if (won) (C.foeBeat ||= {})[o.foe] = C.year;
  const near = o.ct[0], h = homeOf(grid(), o.foe), fp = foeArmyPos(o.foe); C.moved = true; C.go = null;
  // (whether the general falls, reckoned before the battle's mark is made on him: see the siege's)
  const falls = !!(C.gen && !C.gen.you && R() < (won ? 0.04 : 0.2));
  if (won) {
    if (CO) { const na = naTowns(grid(), o.foe).sort((a, b) => b[3] - a[3])[0]; if (na) { const b = stepToward(CO.pos, cellXY(na), 8); CO.pos = { x: b.x, y: b.y }; } CO.go = null; }
    else { if (h && fp) { const b = stepToward(fp, h, 8); C.foePos[o.foe] = { x: b.x, y: b.y }; } if (C.foeGo) delete C.foeGo[o.foe]; }
    moraleMove(10); if (!falls) { genMark(o, true); genWin(); } say(`Victory in the field near ${near}`, `${o.attack ? "" : "Your army stands its ground. "}${poss(The(o.foe))} ${CO ? "colonial army" : "army"} is broken and falls back${CO ? "" : " toward home"}${knowsArmy(o.foe) ? `, ${CO ? CO.n : C.foes[o.foe]} regiments left to it` : ""}. Its march is stopped.`);
  } else {
    const mh = homeOf(grid(), C.me); if (mh) { const b = stepToward(armyPos(), mh, 4); C.pos = { x: b.x, y: b.y }; }
    moraleMove(-12); if (!falls) genMark(o, false); say(`Beaten in the field near ${near}`, `Your army falls back with what it has left: ${armyStr()}.`);
  }
  if (Object.keys(broken).length) say(`Regiments broken near ${near}`, `${Object.entries(broken).map(([k, c]) => `${c} of ${TROOPS[k].name.toLowerCase()}`).join(", ")}: too few men left to stand as regiments, they are struck off the roll.`);
  if (falls) { moraleMove(-10); say(`${C.gen.name} falls near ${near}`, "Killed at the head of his men."); C.gen = null; needGeneral(); }
  if (!won && C.guns > 0 && R() < 0.5) C.guns--;
}
// ---- the muster before a battle you fight yourself: how many of your army take the field, and of which arms ----
const MUST_KINDS = ["musketeer", "militia", "grenadier", "pike", "sword", "axe", "bow", "crossbow", "cavalry"];
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
      C.pending = null; if (o.field) { const w = R() < odds((o.attack ? o.att : o.def) * cmdMul(C.gen) * moraleK() * (1 + vetK()), (o.attack ? o.def : o.att) * cmdMul(genOf(o.foe)), false); fieldEnd(o, w, w ? 0.12 : 0.3, w ? 0.45 : 0.12); persist(); note = C.log.find(l => /field/.test(l.title)).title + "."; sfx("guns", 0.5); drawMap(); return; } if (o.convoy) { convoyEnd(o, R() < odds(o.def * cmdMul(C.gen) * moraleK(), o.att, false), 0.15, 0.2); persist(); drawMap(); return; } const won = auto(o); persist();
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
  // (closed at the muster, before a shot was fired: the muster again, not a defeat)
  const P = C.pending, ct = !C.mp && !P.begun && CITIES.find(c => c[0] === P.ct);
  if (ct) { setTimeout(() => { if (C && C.pending === P && !$("cmpMust")) fight({ ...P, ct }); }, 0); return; }
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
  // (a colony of theirs over the water: its own colonial army comes to it, if it's near)
  const co = far && coloFor(foe, ct); if (co) return Math.round(co.n * (yearsTo(co.pos) <= 1 || mdist(co.pos, cellXY(ct)) <= MARCH * 1.5 ? 0.65 : 0.2));
  return Math.round(foeArmy(foe) * (far ? 0.12 : isHuman(foe) ? 0.7 : 0.65));
}
function defOf(g, ct, foe) {
  const S = siegeOf(ct), gar = Math.round(garrison(ct) * (1 - (S ? S.starve : 0)));
  return gar + Math.round(fieldHelp(foe, ct) * (S ? 0.5 : 1)) + Math.round(levy(citiesOfNow(g, foe).length) * (isHuman(foe) ? 1 : 0.5));
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
  S.starve = Math.min(0.8, S.starve + 0.15 + (ct[3] <= 1 ? 0.07 : 0));
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
  const own = citiesOfNow(g, S.foe), capital = own.length && own.reduce((b, t) => t[3] > b[3] ? t : b, own[0]) === ct;
  const give = S.starve * 0.5 + Math.min(1, S.bat) * 0.2 + (S.years >= 4 ? 0.25 : 0) - ct[3] * 0.1 - (capital ? 0.15 : 0);
  if (R() < give) {
    C.siege = null; seize(ct, C.me); C.took[S.foe] = (C.took[S.foe] || 0) + 1; moraleMove(10); for (const id of Object.keys(C.E.rel)) C.E.rel[id] -= id === S.foe ? 6 : NATION_FAITH[id] === NATION_FAITH[S.foe] ? 3 : 1;
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
// (the fourth, a town's alone: exempt — nothing to the treasury, and its people the gladder for it)
const TAX = [{ n: "Light", k: 0.75, g: 0.008 }, { n: "Fair", k: 1, g: 0 }, { n: "Heavy", k: 1.25, g: -0.01 }, { n: "Exempt", k: 0, g: 0.012 }];
// (a town of yours: its own rate, if you've set one, else the realm's)
const taxAt = ct => { const t = C.ttax && C.ttax[ct[0]]; return t != null ? t : C.tax ?? 1; };
const taxOf = id => { const s2 = id && (id === C.me || isHuman(id)) ? sliceOf(id) : null; return TAX[s2 && s2.tax != null ? s2.tax : 1]; };
const popRate = (ct, o = cityOwner(grid(), ct)) => { const p = popOf(ct), cap = popCap(ct); if (p > cap) return -0.02; return (0.018 + lvOf(ct[0], "farm") * 0.01 + (lvOf(ct[0], "trade") ? 0.004 : 0)) * (1 - p / cap * 0.6) + (o === C.me ? TAX[taxAt(ct)].g : taxOf(o).g); };
const fmtN = n => Math.round(n).toLocaleString("en-GB");
// what each kind of regiment costs, the men it takes from its town, its upkeep a year, and what it needs to be raised
const UNIT = {
  musketeer: { cost: 30, men: 600, up: 1.6 },
  militia: { cost: 12, men: 450, up: 0.7 },
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
const RATE = { musketeer: [4, 2, 2, 2], militia: [2, 1, 2, 1], grenadier: [4, 3, 2, 2], pike: [0, 3, 2, 5], sword: [1, 4, 3, 2], axe: [0, 4, 2, 1], bow: [3, 1, 3, 1], crossbow: [3, 2, 2, 1], cavalry: [1, 4, 5, 3] };
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
const unitCost = (k, g = grid()) => Math.max(8, Math.round((UNIT[k].cost - (REGIMENT - regCost(g))) * (1 - (minSk("war") - 3) * 0.04) * (1 + minCor("war") * 0.03)));
const raising = n => (C.lq || []).filter(q => q.t === n);
// (the roll, from what a save had before: its regiments as the crown's way of war made them up)
function ensureUnits() { if (C.units) return; const m = muster(C.me, C.army | 0); C.units = []; for (const [k, n] of Object.entries(m)) for (let i = 0; i < n; i++) C.units.push({ k, hp: 1 }); C.lq ||= []; }
// (the field army: the regiments not left in a town's garrison)
const field = () => (C.units || []).filter(u => !u.at && (u.ar | 0) === (C.ar | 0));
// (the sound of the army on the road: the foot's tread, and the horse's trot behind it when it has a good part horse)
const marchSfx = (v = 0.5) => { const F = field(), h = F.filter(u => TROOPS[u.k] && TROOPS[u.k].horse).length; return [["drum", v * 0.6], ["march", v, 250], ...(h && h * 3 >= F.length ? [["trot", v * 0.8, 700]] : [])]; };
// ---- more than one army: each its own place, march, siege, general and spirit. The one you're giving orders to stands in
//  the campaign's own fields (C.pos, C.go, C.army…); the others wait in C.armies, and are swapped in when chosen ----
const AKEYS = ["pos", "go", "moved", "siege", "army", "gen", "morale", "supplied", "sailed", "emb", "aslt", "joinTo", "chase", "target", "arrived"];
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
  (C.armies ||= []).push({ id, pos: { x: t.x + (crowd ? 1.8 : 0), y: t.y + (crowd ? 0.8 : 0) }, go: null, moved: false, siege: null, army: Math.round(G.reduce((s2, u) => s2 + worthOf(u), 0)), gen: null, morale: 50, supplied: false, sailed: 0 });
  appearAt(id, C.armies[C.armies.length - 1].pos);
  useArmy(id); persist(); return null;
}
// (the army in hand split in two where it stands: half of each arm marched off as an army of its own)
function splitArmy() {
  reconcile(); const F = field(); if (F.length < 4) return "Too few regiments to split.";
  if (C.siege) return "Not while it's besieging a town."; if ((C.armies || []).length >= 5) return "You have armies enough to command.";
  const id = Math.max(...armyIds()) + 1, by = {}; for (const u of F) (by[u.k] ||= []).push(u);
  let n = 0; for (const L of Object.values(by)) for (const u of L.slice(0, Math.floor(L.length / 2))) { u.ar = id; n++; }
  if (!n) return "Too few regiments to split."; const p = armyPos(), moved = C.moved;
  const str = Math.round(C.units.filter(u => !u.at && u.ar === id).reduce((t, u) => t + worthOf(u), 0)); C.army = Math.round(unitSum());
  (C.armies ||= []).push({ id, pos: { x: p.x + 1.8, y: p.y + 0.8 }, go: null, moved, siege: null, army: str, gen: null, morale: C.morale ?? 50, supplied: false, sailed: 0 });
  appearAt(id, C.armies[C.armies.length - 1].pos);
  useArmy(id); persist(); return null;
}
// (two of your armies in one place: the one in hand marched into the other, and gone)
function joinArmy(to) {
  const here = armyPos(), o = (C.armies || []).find(a => a.pos && (to == null || a.id === to) && dist2(a.pos, here) <= 3 && !a.siege); if (!o) return "No other army of yours stands here.";
  const from = C.ar | 0; useArmy(o.id); for (const u of C.units) if (!u.at && (u.ar | 0) === from) u.ar = o.id;
  C.armies = C.armies.filter(a => a.id !== from); C.army = Math.round(unitSum()); persist(); return null;
}
// (what a regiment is worth in the reckoning of strength — the odds of a battle fought out, a garrison's hold: a
//  militia regiment, townsmen with a musket and a few Sundays' drill, a little over half a regiment of musketeers)
const KIND_W = { militia: 0.55 };
const worthOf = u => u.hp * (KIND_W[u.k] ?? 1);
const unitSum = () => field().reduce((t, u) => t + worthOf(u), 0);
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
// ---- winter, as Empire's: an army that sees the year out in another crown's land in the far north, or out on the
//  eastern steppe, loses men to the cold and sickness — your own land, a friend's, or a ship's deck spares it ----
function winterWear(g, id) {
  if (C.emb != null || !field().length) return;
  const p = armyPos(), [lon, lat] = llOf(p.x, p.y); if (!(lat >= 56 || (lon >= 30 && lat >= 44))) return;
  const o = g[Math.floor(p.y)] && g[Math.floor(p.y)][Math.floor(p.x)]; if (!o || o === C.me || C.ally[o] || isVassal(o)) return;
  const n0 = Math.round(unitSum()); wearUnits(field().length * 0.07); const lost = n0 - Math.round(unitSum());
  if (lost > 0) say(`Winter in ${NATIONS[o] ? the(o) : "the north"}`, `${id ? `The ${armyName(id).toLowerCase()}` : "Your army"} loses men to the cold and sickness: some ${lost * 600} of them. Winter quarters at home, or in a friend's country, would spare it.`);
}
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
  else if (k === "*") { const L = field(); if (!L.length) return null; for (const u of L) u.at = n; }
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
// ---- a town's loyalty, as the Total War games keep it: each thing that sways it, for or against, and the sum of them.
//  A town you took is the hardest to hold: newly conquered, its people remember their old crown (the more while you
//  fight it), and pray, it may be, in another church — every one of which fades as the years go by under your rule ----
// (whose a town's people are: the crown that held it in 1683, whoever has taken it since)
let ORIG_G = null;
const peopleOf = ct => { W0(); ORIG_G ||= buildGrid({ conq: [] }); return cityOwner(ORIG_G, ct); };
const FAITH_WORD = { catholic: "Catholic", reformed: "Reformed", lutheran: "Lutheran", orthodox: "Orthodox", muslim: "Muslim", native: "their own" };
function loyalty(ct) {
  const n = ct[0], t = taxAt(ct), v = govOf(n), out = [["Your rule", 1]];
  const GV = govType();
  if (t === 3) out.push(["Exempt from taxes", 2]); else if (t === 2) out.push(["Heavy taxes", GV.heavy]); else if (t === 0) out.push(["Light taxes", 1]);
  if (GV.loyal) out.push(["A republic: the people's own", GV.loyal]);
  if (GV === GOVS.republic && Object.keys(C.E.war).some(id => C.E.war[id] && (C.warT[id] || 0) >= 3)) out.push(["Weary of a long war", -1]);
  { const j = minSk("justice"), jc = minCor("justice"), jn = govOf_().min.justice.short; if (j >= 4) out.push([`Justice: ${jn}, a firm hand`, 1]); else if (j <= 1) out.push([`Justice: ${jn}, a weak one`, -1]); if (jc >= 3) out.push([`Justice: ${jn} sells verdicts`, -1]); }
  if (ct[3] === 3) out.push(["A great city's crowds", -1]);
  const gar = Math.min(2, garUnits(n).length); if (gar) out.push([`Garrison of ${garUnits(n).length}`, gar]);
  if (lvOf(n, "church")) out.push(["The church", 1]);
  if (v) { const k = v.st[0] >= 4 ? -1 : v.st[0] <= 1 ? 1 : 0; if (k) out.push([`Governor ${v.name.split(" ").pop()}${k < 0 ? ", corrupt" : ", honest"}`, k]); }
  // (your army standing by it: soldiers in the streets keep the peace — as long as they're there)
  if (C.emb == null && !C.siege && dist2(armyPos(), cellXY(ct)) <= 6) out.push(["Your army in the town", 1]);
  const H = C.held && C.held[n], folk = peopleOf(ct), yrs = H && H.by === C.me ? C.year - H.y : 99;
  if (folk === C.me) {
    // (one of your own towns won back: its people glad of it, for a few years)
    if (yrs < 4) out.push(["Liberated", 1]);
  } else if (folk && NATIONS[folk]) {
    // (newly conquered: fierce at first, fading over some six years)
    // (a town you sacked: its people won't forget it for ten years)
    { const sk = C.sacked && C.sacked[n]; if (sk != null && C.year - sk < 10) out.push(["Sacked by your army", C.year - sk < 4 ? -2 : -1]); }
    const nc = yrs < 2 ? -3 : yrs < 4 ? -2 : yrs < 7 ? -1 : 0; if (nc) out.push([yrs < 1 ? "Newly conquered" : `Conquered ${yrs} year${yrs > 1 ? "s" : ""} ago`, nc]);
    // (its people remember their own crown, while it stands — the more while you're at war with it — for fifteen years)
    if (alive(grid(), folk) && yrs < 15) out.push([`Remembers ${the(folk)}${atWar(folk) ? ", at war with you" : ""}`, atWar(folk) ? -2 : -1]);
    // (its people of another church than yours, till a generation has grown up under you)
    const f = NATION_FAITH[folk], mf = NATION_FAITH[C.me]; if (f && mf && f !== mf && yrs < 25) out.push([`${FAITH_WORD[f] || f} people under a ${FAITH_WORD[mf] || mf} crown`, -1]);
  }
  return out;
}
function orderOf(ct) { return loyalty(ct).reduce((t, [, v]) => t + v, 0); }
// (each thing that sways it, laid out for the town's card)
// (taxes as a slider: its stops left to right, low to high, and the one it stands at; each stop named under it)
function taxSlider(attr, stops, cur) {
  const i = Math.max(0, stops.indexOf(cur));
  return `<div class="cmp-tslide"><input type="range" min="0" max="${stops.length - 1}" step="1" value="${i}" ${attr}="1" data-stops="${stops.join(",")}" aria-label="Taxes" style="--p:${i / (stops.length - 1) * 100}%"><div class="cmp-tticks">${stops.map((v, k) => `<span class="${k === i ? "on" : ""}">${TAX[v].n}</span>`).join("")}</div></div>`;
}
function loyaltyHtml(ct) {
  const L = loyalty(ct), o = L.reduce((t, [, v]) => t + v, 0);
  return `<div class="cmp-loyal"><details${o < 0 ? " open" : ""}><summary>Loyalty: <b class="${o < 0 ? "down" : ""}">${orderWord(o)}</b> <em>${o > 0 ? "+" : ""}${o}</em>${o < 0 ? " · may riot" : ""}</summary>
    <ul>${L.map(([k, v]) => `<li class="${v < 0 ? "down" : "up"}"><i>${v > 0 ? "+" : ""}${v}</i>${esc(k)}</li>`).join("")}</ul></details>
    ${cityOwner(grid(), ct) === C.me ? `<div class="cmp-ttax"><small>Taxes here${C.ttax && C.ttax[ct[0]] != null ? "" : " (the realm's)"}</small>${taxSlider("data-ttaxs", [3, 0, 1, 2], taxAt(ct))}</div>` : ""}</div>`;
}
const orderWord = o => o >= 2 ? "Content" : o >= 0 ? "Quiet" : o === -1 ? "Restless" : "Close to rising";
function riots(g) {
  C.riotN ||= {};
  for (const ct of citiesOfNow(g, C.me)) {
    const o = orderOf(ct); if (o >= 0 || R() > 0.2 * -o) { delete C.riotN[ct[0]]; continue; }
    // (a second year of riots in a row: the town rises)
    if ((C.riotN[ct[0]] = (C.riotN[ct[0]] || 0) + 1) >= 2 && !C.events.some(e => !e.done && e.kind === "rising" && e.ct === ct[0])) { C.riotN[ct[0]] = 0; C.events.push({ kind: "rising", ct: ct[0], att: Math.round(popOf(ct) / 4000) + 3 }); }
    const w = Math.round(worth(ct) * TAX[taxAt(ct)].k); C.gold -= Math.min(Math.max(0, C.gold), w);   // (what's lost to the riot: never more than the chest holds)
    C.pop[ct[0]] = Math.round(popOf(ct) * 0.97);
    say(`Riots in ${ct[0]}`, `${taxAt(ct) === 2 ? "The heavy taxes drive its people into the streets." : "Its people take to the streets."} The town pays ${w ? `none of its ${w} thalers` : "nothing"} this year${garUnits(ct[0]).length ? "" : "; a regiment in its garrison would keep order"}.`);
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
// ---- trade, as in Empire: Total War: each town's good, what it fetches, the pacts that carry it abroad, and the ports an
//  enemy fleet shuts ----
const GOODS = {
  furs: { n: "Furs", v: 14 }, sugar: { n: "Sugar", v: 18 }, tobacco: { n: "Tobacco", v: 14 }, fish: { n: "Fish", v: 6 },
  timber: { n: "Timber", v: 7 }, iron: { n: "Iron", v: 9 }, grain: { n: "Grain", v: 7 }, wine: { n: "Wine", v: 9 },
  wool: { n: "Wool", v: 8 }, silk: { n: "Silk", v: 12 }, cloth: { n: "Cloth", v: 9 }, silver: { n: "Silver", v: 20 },
};
// (the pictures, loaded once, for the map; redrawn when they've come)
const GOOD_PICS = {};
const goodPic = k => GOOD_PICS[k] || (GOOD_PICS[k] = Object.assign(new Image(), { src: `art/goods/${k}.png`, onload: () => { if (C && shown() && !on3d) paint(); } }));
const goodImg = (k, cls = "") => `<img class="cmp-good ${cls}" src="art/goods/${k}.png" alt="${esc(GOODS[k].n)}" title="${esc(GOODS[k].n)}">`;
// (a town's good, by where it stands: the New World's furs, fish, tobacco, sugar and silver; Europe's timber and iron,
//  grain, wool, wine, cloth and silk)
function goodOf(ct) {
  const lon = ct[1], lat = ct[2];
  if (lon < -45) {
    if (lat < 23 && lon < -90) return "silver";
    if (lat < 28) return "sugar";
    if (lon > -61 && lat > 45) return "fish";
    if (lat >= 43.5) return "furs";
    if (lat >= 33 && lat < 40 && lon > -84) return "tobacco";
    if (lat >= 40 && lon > -75) return "fish";
    return "furs";
  }
  if (lat >= 59 || (lat >= 55 && lon > 20)) return "timber";
  if (lat >= 55 && lon > 10) return "iron";
  if (lon < 2 && lat > 50) return "wool";
  if (lat >= 49 && lon > 14) return "grain";
  if (lat >= 47 && lon >= 2 && lon <= 14) return "cloth";
  if (lat < 47 && lon > 7 && lon < 19) return "silk";
  if (lon >= 19 && lat < 46) return "silk";
  if (lat < 50 && lon < 8) return "wine";
  return "grain";
}
// (a port of yours shut by an enemy fleet lying off it)
function blockader(ct) { const h = harbourOf(ct); if (!h) return null; for (const [id, F] of Object.entries(C.foeFleets || {})) if (F.ships.length && atWar(id) && dist2(F.pos, h) <= 6) return id; return null; }
// (each town's good, unless blockaded; each trade pact, the more for the goods it brings you that you haven't)
function tradeOf(g) {
  const mine = citiesOfNow(g, C.me), have = {}, shut = [];
  for (const ct of mine) { const b = blockader(ct); if (b) { shut.push([ct, b]); continue; } const k = goodOf(ct); have[k] = (have[k] || 0) + 1; }
  const goods = Object.entries(have).reduce((t, [k, n]) => t + GOODS[k].v * n, 0);
  const pacts = Object.keys(C.E.pact).filter(id => C.E.pact[id] && alive(g, id)).map(id => { const theirs = new Set(citiesOfNow(g, id).map(goodOf)), fresh = [...theirs].filter(k => !have[k]); return { id, fresh, v: 10 + NATIONS[id].strength * 3 + Math.min(5, fresh.length) * 5 }; });
  return { have, goods, pacts, pactV: pacts.reduce((t, p) => t + p.v, 0), shut };
}
const income = g => { const k = govType().inc * (1 + (minSk("treasury") - 3) * 0.03) * (1 - corLoss()), T = tradeOf(g); return 40 + Math.round((citiesOfNow(g, C.me).reduce((t, ct) => t + worth(ct) * TAX[taxAt(ct)].k, 0) + T.goods + T.pactV) * k); };
// ---- the great powers, ranked, as Empire's faction summary: by their towns and the people in them (their armies you
//  can't know) ----
function rankHtml() {
  if (C.mp) return "";
  const g = grid(), score = {}, towns = {};
  for (const ct of CITIES) { const o = cityOwner(g, ct); if (!o || !NATIONS[o]) continue; towns[o] = (towns[o] || 0) + 1; score[o] = (score[o] || 0) + 20 + popOf(ct) / 1000; }
  const L = Object.keys(score).sort((a, b) => score[b] - score[a]), mine = L.indexOf(C.me), top = L.slice(0, 6);
  const row = (id, i) => `<div class="cmp-rank${id === C.me ? " me" : ""}" data-selc="${id}" title="${id === C.me ? "Your crown" : "Their card"}"><em>${i + 1}</em><i style="background:${NATIONS[id].color}"></i><b>${esc(id === C.me ? NATIONS[id].name + " (you)" : NATIONS[id].name)}</b><small>${towns[id]} town${towns[id] === 1 ? "" : "s"}</small></div>`;
  return fold("rank", `<span class="cmp-h"><b>The great powers</b><small>${mine >= 0 ? `yours is ${ordinal(mine + 1)} of ${L.length}` : ""}</small></span>`,
    `<div class="cmp-ranks">${top.map((id, i) => row(id, i)).join("")}${mine >= 6 ? `<div class="cmp-rank gap">…</div>${row(C.me, mine)}` : ""}</div>`);
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
function tradeHtml() {
  const T = tradeOf(grid()), ks = Object.keys(T.have).sort((a, b) => GOODS[b].v * T.have[b] - GOODS[a].v * T.have[a]);
  return fold("trade", `<span class="cmp-h"><b>Trade</b><small>${T.goods + T.pactV} thalers a year${T.shut.length ? ` · <em class="down">${T.shut.length} port${T.shut.length > 1 ? "s" : ""} blockaded</em>` : ""}</small></span>`,
    `<div class="cmp-goods">${ks.map(k => `<span title="${esc(GOODS[k].n)}: ${GOODS[k].v} thalers a year from each town">${goodImg(k)}<b>${T.have[k]}</b><small>${esc(GOODS[k].n)}</small></span>`).join("") || `<small class="cmp-fine">No goods: every port is shut.</small>`}</div>
    ${T.pacts.length ? `<div class="cmp-pacts">${T.pacts.map(p => `<div><b>${esc(The(p.id))}</b><small>${p.v} a year${p.fresh.length ? ` · ${p.fresh.map(k => goodImg(k, "sm")).join("")}` : ""}</small></div>`).join("")}</div>` : `<small class="cmp-fine">No trade pacts. A pact with a crown whose goods you haven't brings the most.</small>`}
    ${T.shut.map(([ct, b]) => `<small class="cmp-fine down">${esc(ct[0])} blockaded by ${esc(poss(the(b)))} fleet: drive it off.</small>`).join("")}`);
}
const upkeep = () => shipUp() + Math.round((C.units ? C.units.reduce((t, u) => t + u.hp * (UNIT[u.k] || UNIT.musketeer).up, 0) : C.army * 1.6) * (1 + (C.gen ? C.gen.st[2] : 2) * 0.04));
// diplomacy: what you can do with a crown this season
function diplo(id, what) {
  const r = C.E.rel, did = C.did[id] ||= {};
  const done = t => { did[what] = true; persist(); return t; };
  // (scholars exchanged with a friend — an ally or a trade partner — letters and books between the universities: each
  //  crown's learning the further on for it. Once in five years with each)
  if (what === "learn") { const L = (C.learnX ||= {}); if (atWar(id) || !(C.ally[id] || C.E.pact[id]) || (L[id] != null && C.year - L[id] < 5) || NATIONS[id].nw) return null; L[id] = C.year; const pts = 2 + (C.ally[id] ? 1 : 0); C.tech.pts = Math.round((C.tech.pts + pts) * 10) / 10; r[id] = clamp(r[id] + 3, -100, 100); return done(`Scholars go between your universities and ${poss(the(id))}: your learning is ${pts} points the further on.${C.tech.cur ? "" : " Set your scholars something to study to make use of it."}`); }
  if (what === "envoy") { if (did.envoy || atWar(id) || C.gold < 40) return null; C.gold -= 40; r[id] = clamp(r[id] + 6 + Math.round(R() * 7), -100, 100); return done(`Your envoy is received at ${courtOf(id)}.`); }
  if (what === "gift") { if (did.gift || atWar(id) || C.gold < 150) return null; C.gold -= 150; r[id] = clamp(r[id] + 18 + Math.round(R() * 8), -100, 100); return done(`${The(id)} ${v3(id, "accepts")} your gift.`); }
  if (what === "pact") { if (atWar(id) || C.E.pact[id] || r[id] < 20) return null; C.E.pact[id] = true; r[id] += 5; return done(NATIONS[id].nw ? `The fur trade with ${the(id)}: beaver pelts down to your posts, kettles, cloth and guns up to their towns.` : `A trade pact with ${the(id)}: their merchants in your towns, yours in theirs.`); }
  // (a politician of theirs bought: their army's strength told you from now on, whatever their view of you)
  if (what === "bribe") {
    C.spies ||= {}; if (C.spies[id] || C.gold < SPY_COST) return null; C.gold -= SPY_COST; C.spies[id] = true; persist();
    return `A man at ${courtOf(id)} takes your ${SPY_COST} thalers. ${poss(The(id))} army is ${C.foes[id] | 0} regiments, and he'll send word of it from now on.`;
  }
  if (what === "access") {
    C.E.access ||= {}; if (atWar(id) || C.E.access[id] || did.access) return null;
    if (C.ally[id] || (r[id] >= -10 && R() < 0.3 + (r[id] + 10) / 70 + (C.E.pact[id] ? 0.15 : 0))) { C.E.access[id] = true; return done(`${The(id)} ${v3(id, "grants")} your armies leave to cross ${NATIONS[id].nw ? "their country" : "its lands"}.`); }
    r[id] -= 2; return done(`${The(id)} ${v3(id, "refuses")} your armies passage through ${NATIONS[id].nw ? "their country" : "its lands"}.`);
  }
  if (what === "unaccess") { if (C.E.access) delete C.E.access[id]; return done(`You give up your leave to cross ${poss(the(id))} land.`); }
  if (what === "revoke") { if (!C.E.grant || C.E.grant[id] !== true) return null; C.E.grant[id] = C.year; r[id] -= 8; return done(`You revoke ${poss(the(id))} leave to cross your land.`); }
  if (what === "unpact") { C.E.pact[id] = false; r[id] -= 10; return done(`The trade pact with ${the(id)} ${v3(id, "is")} ended.`); }
  if (what === "ally") { if (atWar(id) || C.ally[id] || r[id] < 55) return null; if (R() < 0.25 + (r[id] - 55) / 60) { C.ally[id] = true; r[id] += 5; return done(`${The(id)} ${v3(id, "is")} your ally: it will join your wars.`); } r[id] -= 3; return done(`${The(id)} won't bind itself to you — not yet.`); }
  if (what === "release") { if (!isVassal(id)) return null; delete C.vassal[id]; r[id] = clamp(r[id] + 15, -100, 100); return done(`${The(id)} ${v3(id, "is")} free of you, and grateful: still your ally, its tribute ended.`); }
  if (what === "unally") { if (isVassal(id)) return null; C.ally[id] = false; r[id] -= 20; return done(`You break the alliance with ${the(id)}.`); }
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
  // (a crown beaten in the field and smaller than yours, asked to submit: a protectorate, as Empire's — peace, its
  //  tribute every year, and its armies in your wars)
  if (what === "submit") {
    if (!atWar(id) || did.peace || NATIONS[id].nw) return null;
    const g = grid(), theirs = citiesOfNow(g, id).length, mineN = citiesOfNow(g, C.me).length; if (!theirs || theirs > mineN) return null;
    const ratio = allArmies() / Math.max(1, foeArmy(id)), p = clamp(-0.3 + ratio * 0.12 + (C.took[id] || 0) * 0.12 - (C.lost[id] || 0) * 0.08 + (C.warT[id] || 0) * 0.02, 0.02, 0.6);
    did.peace = true;
    if (R() < p) { makePeace(id); (C.vassal ||= {})[id] = C.year; C.ally[id] = true; r[id] = Math.max(r[id], 30); for (const f of Object.keys(C.E.war)) if (C.E.war[f] && f !== id && !C.E.wars.some(x => (x.a === id && x.b === f) || (x.a === f && x.b === id))) C.E.wars.push({ a: id, b: f, battles: 0, withYou: true }); say(`${The(id)} ${v3(id, "submits")}`, `A protectorate of yours now: peace, tribute every year, and ${NATIONS[id].people ? "their" : "its"} armies in your wars.`); return done(`${The(id)} ${v3(id, "submits")}: a protectorate of yours, paying tribute and allied to you.`); }
    return done(`${The(id)} won't bow the knee. The war goes on.`);
  }
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
// ---- the other crowns' own proposals, as Empire's: a trade agreement offered, an alliance, or a strong neighbour's
//  demand for tribute — pay, or have war. One a year at most ----
function aiOffers(g, ids) {
  if (C.year - 1683 < 2 || C.events.some(e => !e.done && (e.kind === "offer" || e.kind === "tribute"))) return;
  const nb = neighbours(g, C.me), live = ids.filter(id => alive(g, id) && !atWar(id) && NATIONS[id]);
  const foeOf = id => Object.keys(C.E.war).some(f => C.E.war[f] && C.E.wars.some(w => (w.a === id && w.b === f) || (w.b === id && w.a === f)));
  const R0 = R();
  if (R0 < 0.07) {
    const bully = live.filter(id => nb.has(id) && !C.ally[id] && (C.truce[id] || 0) <= 0 && C.E.rel[id] < 0 && (C.foes[id] | 0) > allArmies() * 1.6);
    if (bully.length && C.gold >= 100) { const id = pick(bully), amt = Math.min(C.gold, clamp(Math.round(C.gold * 0.25 / 10) * 10, 100, 600)); C.events.push({ kind: "tribute", foe: id, amt }); say(`${The(id)} ${v3(id, "demands")} tribute`, `${amt} thalers, or war.`); return; }
  }
  if (R0 < 0.2) {
    const al = live.filter(id => !C.ally[id] && C.E.rel[id] >= 45 && (NATION_FAITH[id] === NATION_FAITH[C.me] || foeOf(id)));
    if (al.length) { const id = pick(al); C.events.push({ kind: "offer", w: "ally", foe: id }); return; }
  }
  if (R0 < 0.32) {
    const tr = live.filter(id => !C.E.pact[id] && C.E.rel[id] >= 15);
    if (tr.length) { const id = pick(tr); C.events.push({ kind: "offer", w: "pact", foe: id }); }
  }
}
const isVassal = id => !!(C && C.vassal && C.vassal[id] != null);
// (the protectorates' year: their tribute paid in — a sixth of what their towns are worth — and a protectorate that has
//  lost its last town struck off)
function vassalsYear(g) {
  if (!C.vassal) return; let tot = 0;
  for (const id of Object.keys(C.vassal)) { if (!alive(g, id)) { delete C.vassal[id]; continue; } tot += Math.round(citiesOfNow(g, id).reduce((t, ct) => t + worth(ct), 0) / 3); }
  if (tot) { C.gold += tot; say(`Tribute from your protectorates: ${tot} thalers`); }
}
function declare(id, by) {
  C.E.war[id] = true; C.warT[id] = 0; C.E.pact[id] = false; C.ally[id] = false; if (C.vassal) delete C.vassal[id]; if (C.E.access) delete C.E.access[id]; if (C.E.grant) delete C.E.grant[id];
  C.E.rel[id] = Math.min(C.E.rel[id], -40);
  // (your allies: into it with you, against them)
  for (const a of Object.keys(C.ally)) if (C.ally[a] && a !== id && !isHuman(a) && ((C.E.rel[a] >= 30 && sameSide(a, id)) || isVassal(a)) && !C.E.wars.some(w => (w.a === a && w.b === id) || (w.a === id && w.b === a))) { C.E.wars.push({ a, b: id, battles: 0, withYou: true }); say(`${The(a)} ${v3(a, "joins")} your war`, `Your ally marches on ${the(id)}.`); }
  if (by !== C.me) say(`${The(id)} ${v3(id, "declares")} war on you!`, knowsArmy(id) ? `Their army: some ${C.foes[id]} regiments.` : "How strong their army is, you don't know.", "war");
  // (and your own declaration, as the gazettes printed it: the herald at their court, and the drums in your streets)
  else say(`War declared on ${the(id)}`, `Your herald reads the declaration at ${poss(the(id))} court. ${knowsArmy(id) ? `Their army stands at some ${C.foes[id]} regiments.` : "How strong their army is, no one can say."}`, "war");
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
  if (mine && !C.over) { C.gold += income(g) - upkeep(); vassalsYear(g); realmMine(g); missionsCheck(true); govYear(g); launchShips(g); fleetsYear(g); navyHunt(g, ids); seaContact(ids);
  if (C.gold < 0) { const lose = Math.ceil(-C.gold / REGIMENT); C.army = Math.max(0, C.army - lose); C.gold = 0; moraleMove(-15); say("The pay chest is empty", `${lose} regiments desert for want of pay.`); } }
  if (world) coloniesYear(g);
  // (the other crowns: their armies made up again; their tempers going back to where their faith puts them)
  for (const id of ids) {
    // (as many regiments as its people can keep: a crown that loses its great cities loses the men to fill its ranks)
    const folk = citiesOfNow(g, id).reduce((t, ct) => t + popOf(ct), 0), cap = NATIONS[id].nw ? NATIONS[id].strength * 11 + Math.round(folk / 5000) + 6 : NATIONS[id].strength * 17 + Math.round(folk / 9000) + 8;
    // (a crown beaten in the field these two years past finds the men slower: half as fast)
    const beat = C.foeBeat && C.foeBeat[id] != null && C.year - C.foeBeat[id] < 2 ? 0.5 : 1;
    // (a crown at war with you, its towns falling: the whole country called to arms, the men found faster)
    const rally = atWar(id) ? 1 + 0.15 * Math.min(4, C.took && C.took[id] || 0) : 1;
    // (more men than its towns can keep — its great cities lost: a fifth of the excess melts away each year)
    if (world) C.foes[id] = (C.foes[id] || 0) > cap ? Math.max(cap, Math.round(C.foes[id] - (C.foes[id] - cap) * 0.2 - 1)) : Math.min(cap, (C.foes[id] || 0) + Math.max(1, Math.round((NATIONS[id].strength * 1.6 + (C.E.plague[id] ? -2 : 0)) * beat * rally)));
    if (!mine) continue;
    const home = (NATION_FAITH[id] === NATION_FAITH[C.me] ? 18 : 0) + (C.E.pact[id] ? 15 : 0) + (C.ally[id] ? 25 : 0) - (atWar(id) ? 40 : 0);
    C.E.rel[id] += Math.sign(home - C.E.rel[id]) * Math.min(2, Math.abs(home - C.E.rel[id]));
    if (C.E.pact[id] && (C.E.rel[id] < 0 || atWar(id))) { C.E.pact[id] = false; say(`${The(id)} ${v3(id, "ends")} your trade pact`); }
    if (C.ally[id] && C.E.rel[id] < 20 && !isVassal(id)) { C.ally[id] = false; say(`${The(id)} ${v3(id, "leaves")} your alliance`); }
    if (C.truce[id] > 0) C.truce[id]--;
    if (atWar(id)) C.warT[id] = (C.warT[id] || 0) + 1;
  }
  // (and they at each other: their wars begun, fought and ended, and the borders moving)
  if (world) crownsWar(g, ids);
  if (world && mine && !C.mp) aiOffers(g, ids);
  if (world) raiseWalls(g, ids);
  if (mine && !C.over) {
  const g2 = grid(), mine = citiesOfNow(g2, C.me), nb = neighbours(g2, C.me), big = mine.length;
  // who'll make war on you: a neighbour that hates you, or fears you as you grow — and thinks itself able
  // (a new crown is watched for its first two years before anyone tries it)
  const years = C.year - 1683;
  for (const id of ids) {
    if (years < 2 || atWar(id) || C.ally[id] || isVassal(id) || (C.truce[id] || 0) > 0 || !nb.has(id) || !alive(g2, id)) continue;
    const p = 0.015 + Math.max(0, -C.E.rel[id]) / 500 + (big > 12 ? 0.03 : 0) + (big > 25 ? 0.05 : 0) + Math.min(0.04, Object.values(C.took || {}).reduce((t, n) => t + n, 0) * 0.004), able = C.foes[id] > allArmies() * 0.6 ? 1 : 0.3;
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
  // their colonial armies: at war with you, now and then on a colony of yours on their side of the water
  for (const id of ids) {
    const co = coloOf(id); if (!co || !atWar(id) || co.n < 4 || (!co.go && R() > 0.45) || C.events.some(e => !e.done && e.foe === id && e.colo)) continue;
    const near = mine.filter(c => !overSea(co.pos, cellXY(c)) && mdist(co.pos, cellXY(c)) <= MARCH * 3 && (!hasWalls(c, C.me, g2) || (C.fguns[id] | 0) > 0)); if (!near.length && !co.go) continue;
    const ct = (co.go && mine.find(c => c[0] === co.go)) || near.sort((a, b) => mdist(co.pos, cellXY(a)) - mdist(co.pos, cellXY(b)))[0]; if (!ct) { co.go = null; continue; }
    const tc = cellXY(ct);
    if (mdist(co.pos, tc) > MARCH) { const st = stepToward(co.pos, tc, MARCH); co.pos = { x: st.x, y: st.y }; co.go = ct[0]; say(`${poss(The(id))} colonial army marches toward ${ct[0]}`, `${knowsArmy(id) ? `Some ${co.n} regiments, ` : "An army of its colonists and soldiers is "}${marchOff(st, tc)}`); continue; }
    co.pos = { x: tc.x + 0.8, y: tc.y + 0.6 }; co.go = null;
    const att = Math.max(2, Math.round(co.n * (0.55 + R() * 0.25)));
    C.events.push({ kind: "attack", colo: true, foe: id, ct: ct[0], att, of: co.n, def: garrison(ct) + levy(mine.length) + helpNear(ct), walls: hasWalls(ct, C.me), army: helpNear(ct) > 0 });
  }
  // who marches on your towns: each crown at war with you, now and then, at a town of yours within its reach
  for (const id of ids) {
    if (C.events.some(e => !e.done && e.kind === "fieldatk" && e.foe === id)) continue;
    // (an army already on the road keeps marching; a new march is begun now and then)
    C.foeGo ||= {};
    if (!atWar(id) || C.foes[id] < 8 || (!C.foeGo[id] && R() > 0.5)) continue;
    // (an army of theirs with one of yours right on it — cornered, its way out across your front — doesn't march
    //  off as if you weren't there: it stays where it is, to fight its way out or be brought to battle)
    { const fp = foeArmyPos(id), by = fp && eachArmy(() => { const p = armyPos(); return C.army >= 3 && !overSea(p, fp) && (mdist(p, fp) <= MARCH * 0.3 || (C.chase === id && mdist(p, fp) <= MARCH * 1.05)) ? C.army : 0; }).some(Boolean);
      if (by) { if (C.foeGo[id]) { say(`${poss(The(id))} ${NATIONS[id].nw ? "war party" : "army"} is held`, `It was marching on ${C.foeGo[id]}, but your army stands across its road near ${nearTown(fp)[0]}: it can't march on without giving battle.`); delete C.foeGo[id]; } continue; } }
    // (a walled town is only sat down before by a crown with guns to batter it)
    // (a town already marched toward: kept to; else one within its reach)
    let ct = C.foeGo[id] && mine.find(c => c[0] === C.foeGo[id]);
    if (!ct) { const fp0 = foeArmyPos(id), near = mine.filter(c => (fp0 && overSea(fp0, cellXY(c)) ? narrowSea(fp0, cellXY(c)) : inReach(g2, c, id)) && (!hasWalls(c, C.me, g2) || (C.fguns[id] | 0) > 0)); if (!near.length) continue;
      // (and its own lost towns first: a crown you've taken towns from comes back for them)
      const lost = near.filter(c => peopleOf(c) === id); ct = lost.length && R() < 0.75 ? pick(lost) : pick(near); }
    // its army on the road: there this year if it's near enough, else a year's march nearer — seen coming
    const fp = foeArmyPos(id), tc = cellXY(ct);
    if (fp && overSea(fp, tc)) { if (!invade(id, fp, ct)) delete C.foeGo[id]; continue; }
    if (fp && mdist(fp, tc) > MARCH) { const st = stepToward(fp, tc, MARCH); C.foePos[id] = { x: st.x, y: st.y }; C.foeGo[id] = ct[0]; say(`${poss(The(id))} ${NATIONS[id].nw ? "war party" : "army"} marches toward ${ct[0]}`, `${knowsArmy(id) ? `Some ${C.foes[id]} ${NATIONS[id].nw ? "bands of warriors" : "regiments"}, ` : NATIONS[id].nw ? "Its warriors are " : "Its army is "}${marchOff(st, tc)}`); continue; }
    if (fp) C.foePos[id] = { x: tc.x, y: tc.y }; delete C.foeGo[id];
    const att = Math.round(C.foes[id] * (0.45 + R() * 0.25));
    // (your army comes to its help only if it's near)
    C.events.push({ kind: "attack", foe: id, ct: ct[0], att, of: C.foes[id], def: garrison(ct) + levy(mine.length) + helpNear(ct), walls: hasWalls(ct, C.me), army: helpNear(ct) > 0 });
  }
  }
  // a plague or a bad harvest, now and then
  if (world) {
    if (R() < 0.08 && ids.length) { const id = pick(ids); C.E.plague[id] = 3; sayAll(`Plague in ${the(id)}`, v3(id, "is") === "are" ? "Their armies thin." : "Its armies thin."); C.foes[id] = Math.round(C.foes[id] * 0.8); }
    for (const id of Object.keys(C.E.plague)) if (--C.E.plague[id] <= 0) delete C.E.plague[id];
  }
  // the season turns
  // the year turns (a turn is a year; the season of its fighting, as it falls)
  if (turn) { C.year++; C.s = Math.floor(R() * 3); }
  if (!mine) { persist(); return; }
  C.did = {};
  fleetsStart(grid());
  eachArmy(id => {
    C.moved = false; C.supplied = false; C.arrived = false;
    // (an army still on its way: the year's march taken up with getting there)
    // (sent to join another army: following it wherever it has gone)
    const J = C.joinTo != null && (C.armies || []).find(a => a.id === C.joinTo && a.pos);
    if (J) { if (C.go || dist2(J.pos, armyPos()) > 3) C.go = { x: J.pos.x, y: J.pos.y }; } else C.joinTo = null;
    if (C.go && C.emb == null && overSea(armyPos(), C.go)) C.go = null;
    if (C.go && !C.siege) { const st = stepToward(armyPos(), C.go, MARCH); C.pos = { x: st.x, y: st.y }; C.moved = true;
      // (arrived: it can't march on this year, but it can give battle — the town it was sent against, the army it went after)
      if (st.arrived) { C.go = null; C.arrived = true; C.moved = false;
        const who = id ? `The ${armyName(id).toLowerCase()}` : "Your army";
        if (C.target && CITIES.some(c => c[0] === C.target)) say(`${who} stands before ${C.target}`, `It can fall on the town this year: right-click it.`);
        else if (C.chase && atWar(C.chase)) say(`${who} has come up with ${poss(the(C.chase))} army`, "It can fall on it this year: right-click it.");
        else say(`${who} arrives`, "It's where you sent it, and can give battle this year if there's an enemy within reach; it marches again next year."); } }
  });
  // (an army sent to join another, there now: the two made one)
  { const keep = C.ar | 0; for (let pass = 0; pass < 6; pass++) { let done = false; for (const id of armyIds()) { useArmy(id); const to = C.joinTo; if (to == null) continue; const T = (C.armies || []).find(a => a.id === to); if (!T) { C.joinTo = null; continue; } if (T.pos && !T.siege && C.emb == null && dist2(T.pos, armyPos()) <= 3) { C.joinTo = null; const name = armyName(to); if (!joinArmy(to)) { say(`Reinforcements reach the ${name.toLowerCase()}`, `The regiments sent to join it march into its camp: ${armyStr()}.`); done = true; break; } } } if (!done) break; } useArmy(armyIds().includes(keep) ? keep : armyIds()[0]); }
  // (a loss called a loss, not a profit with a minus to it)
  { const net = income(grid()) - upkeep(); say(`${C.year}`, `${net >= 0 ? `+${net} thalers profit a year.` : `A loss of ${-net} thalers a year.`}${C.events.filter(e => !e.done).length ? " Things need your word." : ""}`); }
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
      for (const x of alliesOf(b).filter(x => x !== a && x !== C.me && !isHuman(x) && alive(g, x) && !leagueOf(x, a) && sameSide(x, a) && !W.some(w => (w.a === x && w.b === a) || (w.a === a && w.b === x))).slice(0, 2)) if (R() < 0.6) { W.push({ a: x, b: a, battles: 0 }); sayAll(`${The(x)} ${v3(x, "comes")} in on ${poss(the(b))} side`, `Against ${the(a)}, as ${v3(x, "is") === "are" ? "their league binds them" : "its league binds it"}.`); }
    }
  }
  // (where the crowns fought this year: marked on the map until the next year's fighting)
  C.E.fought = [];
  // (each with who won it and who lost, and the town it was fought for or nearest, to name it by; and the battles that
  //  matter to you — a great power's, an ally's, a neighbour's — in the year's news, three at the most)
  let told = 0;
  const nearYou = id => !!C.ally[id] || citiesOfNow(grid(), C.me).some(ct => distFrom(grid(), id, ct) <= REACH);
  const fought = (p, took, win, lose) => {
    if (!p || !isFinite(p.x) || C.E.fought.length >= 24) return;
    const at = took || townNear(p);
    C.E.fought.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, took: took || null, w: win, l: lose, at, yr: C.year });
    if (took || told >= 3 || !at) return;
    if (Math.max(NATIONS[win].strength, NATIONS[lose].strength) < 3 && !nearYou(win) && !nearYou(lose)) return;
    told++; sayAll(`${The(win)} ${v3(win, "beats")} ${the(lose)} near ${at}`, `${poss(The(lose))} army falls back toward home.`);
  };
  // (a crown at peace with everyone marches its army home again)
  { const gg = grid(), busy = new Set(W.flatMap(w => [w.a, w.b])); for (const id of Object.keys(C.foePos || {})) if (!busy.has(id) && ownWar(id) && alive(gg, id)) { const h = homeOf(gg, id); if (h && mdist(C.foePos[id], h) > 1) warMove(id, h, MARCH); } }
  for (const w of W.slice()) {
    if (!alive(grid(), w.a) || !alive(grid(), w.b)) { W.splice(W.indexOf(w), 1); continue; }
    if (R() > 0.45) continue;
    // (each side with the help of its allies fighting the same enemy — the Holy League's armies at Vienna, not the
    //  Emperor's alone — a part of their strength, as they can spare it)
    // (and a crown with several wars on its hands has its armies divided among them: the Sultan's can't be at Vienna,
    //  Kraków and Venice at once with the whole of them)
    // (the Holy League in its first years fought as one — Sobieski's Poles came to Vienna with the whole of their army)
    const holyLeague = (x, y) => C.year < 1700 && (leagueOf(x, y) || {}).n === "the Holy League";
    const fronts = id => Math.max(1, W.filter(v => v.a === id || v.b === id).length);
    const pow = id => ((C.foes[id] || 0) + NATIONS[id].strength * 4) / Math.pow(fronts(id), 0.3);
    const help = (x, foe) => W.filter(v => v !== w && ((v.a === foe && v.b !== x) || (v.b === foe && v.a !== x))).map(v => v.a === foe ? v.b : v.a).filter(y => NATIONS[y] && !isHuman(y) && (leagueOf(x, y) || C.ally[y] && x === C.me)).reduce((t, y) => t + pow(y) * (holyLeague(x, y) ? 0.8 : 0.2), 0);
    // (the odds of a year's fighting going one's way, the strength of each side squared: a crown with half its
    //  enemy's strength wins a fifth of the time, not a third — small states took towns from great powers only with
    //  great allies at their side, as the Holy League's did from the Sultan)
    const sa = pow(w.a) + help(w.a, w.b), sb = pow(w.b) + help(w.b, w.a), aWins = R() < sa * sa / (sa * sa + sb * sb);
    const win = aWins ? w.a : w.b, lose = aWins ? w.b : w.a, gg = grid();
    const canTake = ct => !hasWalls(ct, lose, gg) || (C.fguns[win] | 0) > 0;
    let target = citiesOfNow(gg, lose).filter(ct => distFrom(gg, win, ct) <= REACH && canTake(ct));
    // (a march across your land: by your leave, asked first. Given, the road through your country opens towns further
    //  off to it; refused, it must go another way, or not at all)
    if (!C.mp && !C.ally[win] && !atWar(win) && !isHuman(win)) {
      const G = (C.E.grant ||= {}), ok = G[win] === true, no = typeof G[win] === "number" && C.year - G[win] < 8;
      const far = citiesOfNow(gg, lose).filter(ct => canTake(ct) && !target.includes(ct) && mdist(nearOwn(gg, win, ct), cellXY(ct)) <= MARCH * 3 && crossesMine(gg, win, ct));
      if (ok) target = target.concat(far);
      else {
        const via = target.filter(ct => crossesMine(gg, win, ct)); target = target.filter(ct => !via.includes(ct)); via.push(...far);
        if (via.length && !no && (!target.length || R() < 0.4) && !C.events.some(e => e.kind === "passage" && e.foe === win && !e.done)) { C.events.push({ kind: "passage", foe: win, vs: lose, ct: pick(via)[0] }); w.battles++; continue; }
      }
    }
    C.foes[lose] = Math.max(0, C.foes[lose] - 3 - Math.floor(R() * 4)); C.foes[win] = Math.max(0, C.foes[win] - 1 - Math.floor(R() * 2));
    // (the much weaker side, winning, mostly throws the attack back and holds what it has: it hasn't the men to go on
    //  and take a great power's town)
    { const sw = aWins ? sa : sb, sl = aWins ? sb : sa; if (sw < sl * 0.6 && R() < 0.7) { { const pa = foeArmyPos(win), pb = foeArmyPos(lose); fought(pa && pb && !overSea(pa, pb) ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } : pb, null, win, lose); } warMove(lose, homeOf(gg, lose), MARCH * 0.6); w.battles++; continue; } }
    // (a crown's own seat holds out longest: taken only on a second good day, unless it's nearly all the crown has left)
    if (target.length) {
      const ct = pick(target), tc = cellXY(ct); fought(tc, ct[0], win, lose);
      // (the winner's army before the town it fought for; the loser's falling back toward home)
      { const sh = landNear(gg, { x: tc.x + 1.2, y: tc.y + 0.9 }, 5) || tc; warMove(win, sh, MARCH * 1.5); warMove(lose, homeOf(gg, lose), MARCH * 0.6); }
      if (ct[3] === 3 && citiesOfNow(gg, lose).length > 3 && R() < 0.6) { w.battles++; continue; }
      seize(ct, win); if (ct[3] >= 2 || w.withYou || nearYou(win)) sayAll(`${The(win)} ${v3(win, "takes")} ${ct[0]} from ${the(lose)}`, `${poss(The(lose))} army beaten before its walls.`);
    }
    w.battles++;
    if (!w.withYou && w.battles >= 3 && R() < 0.3) { W.splice(W.indexOf(w), 1); sayAll(`${The(w.a)} and ${the(w.b)} make peace`); }
  }
}
function checkEnd() {
  orphans(C.me);
  const g = grid(), n = citiesOfNow(g, C.me).length;
  // (the last town fallen, but an army still in the field: three years to take one back, as a court in exile might —
  //  the crown lost only if it can't, or its army's gone too)
  if (!n && !C.over) {
    if (C.exile == null && allArmies() >= 4) { C.exile = C.year; say("Your last town has fallen", "Your army is still in the field. Take back a town within three years, or the crown is lost."); }
    else if (C.exile == null || allArmies() < 1 || C.year - C.exile >= 3) { C.over = "lost"; C.exile = null; say("Your crown is lost", "The last of your towns has fallen."); if (C.goal) C.goal.show = "lost"; }
  }
  if (n && C.exile != null) { C.exile = null; say("A crown again", "A town of your own once more: the crown is saved."); }
  goalCheck();
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
const loop3d = () => { if (!on3d || !shown()) { if (eu3d) eu3d.visible = false; raf3d = 0; heard3d(false); return; } eu3d.visible = true; if (innerWidth !== eu3d.w || innerHeight !== eu3d.h) eu3d.size(innerWidth, innerHeight); eu3d.frame(); heard3d(true); raf3d = requestAnimationFrame(loop3d); };
// (the land seen close, heard: the wind over it as you come down to it, and the surf where the sea is in view — a few
//  times a second, from a handful of points round the middle of the view)
let heardT = 0;
function heard3d(on) {
  if (!on) { if (heardT) { heardT = 0; try { FOLEY.outdoors(0, 0); } catch (e) {} } return; }
  const t = performance.now(); if (t - heardT < 250) return; heardT = t;
  const v = eu3d, close = clamp((55 - v.dist) / 40, 0, 1); let wet = 0;
  if (close > 0) { const r = v.dist * 0.35; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (v.rawY(v.target.x + i * r, v.target.z + j * r) < 0) wet++; }
  const sea = wet / 9;
  try { FOLEY.outdoors(close * (1 - sea * 0.5), close * Math.min(1, sea * 1.8)); } catch (e) {}
}
const shown = () => !$("campaign").classList.contains("hidden") && !$("cmpPlay").classList.contains("hidden");
// ---- a right-click with a fleet in hand: joined to another of yours, an enemy fleet engaged (or sailed after), or sailed
//  to where you clicked ----
function fleetOrder(fh2, x, y) {
  if (fh2 && fh2.mine != null && fh2.mine !== selFleet) { doAct({ k: "fjoin", id: selFleet, to: fh2.mine }); return; }
  if (fh2 && fh2.foe && C.foeFleets && C.foeFleets[fh2.foe]) { if (canSeaFight(selFleet, fh2.foe)) { doAct({ k: "seafight", id: selFleet, foe: fh2.foe, how: "fight" }); return; } if (!atWar(fh2.foe)) { react({ note: `You're not at war with ${the(fh2.foe)}.` }); drawMap(); return; } const F = C.foeFleets[fh2.foe]; doAct({ k: "sail", id: selFleet, x: F.pos.x, y: F.pos.y }); return; }
  doAct({ k: "sail", id: selFleet, x, y });
}
// (a fleet's name on the land seen close, as fleetHit gives it on the parchment)
const fleetOf3d = k => { if (!k) return null; let m; if ((m = k.match(/^mine-(\d+)$/))) return { mine: +m[1] }; if ((m = k.match(/^p-(.+)-(\d+)$/))) return { foe: `p:${m[1]}:${m[2]}` }; if ((m = k.match(/^foe-(.+)$/))) return { foe: m[1] }; return null; };
// ---- a right-click with the army in hand, on the parchment map or the land seen close: what's under it decides the
//  order — aboard a fleet of yours, joined to another army of yours, an enemy town fallen on (or marched on, or why
//  not), an enemy army fallen on (or gone after, or why not), or else marched to where you clicked ----
function orderAt({ fleetMine = null, ah = null, ct = null, fh = null, x, y }) {
  // (a fleet of yours, with the army in hand: the army goes aboard it)
  if (fleetMine != null && C.emb == null) { doAct({ k: "embark", id: fleetMine }); armySel = false; return; }
  // (another army of your own: the one in hand marched to it, and the two made one when it gets there)
  if (ah && ah.id !== (C.ar | 0) && C.emb == null) { doAct({ k: "joinat", id: ah.id }); armySel = false; return; }
  // (an enemy town under the click that can be fallen on now: the town — even with their army standing on it, as a
  //  woods nation's war party camps in its own town; it was taken for the army, and the army went after it instead)
  const o = ct && cityOwner(grid(), ct);
  if (ct && o && o !== C.me && atWar(o) && C.emb == null && C.army >= 5 && inMarch(ct) && freeToStrike(ct) && (!C.siege || siegeOf(ct))) { selCity = ct; sel = o; doAct({ k: "march", ct: ct[0], how: "fight" }); return; }
  // (an enemy army within a year's march: the army falls on it in the field)
  if (fh && isHuman(fh) && canFieldP(fh)) { selFoe = fh; sel = fh; selCity = null; armySel = false; doAct({ k: "pfield", h: fh, how: "fight" }); return; }
  if (fh && canField(fh) && C.emb == null) { selFoe = fh; sel = crownOf(fh); selCity = null; armySel = false; doAct({ k: "field", foe: fh, how: "fight" }); return; }
  // (an enemy army that can't be fallen on now: why not, said — or, out of a year's reach, gone after: marched toward
  //  where it stands, and held where it is once you're within a year's march of it, to be brought to battle)
  if (fh && !isHuman(fh) && !isColo(fh) && atWar(fh) && C.emb == null) {
    const why = C.siege ? `Your army is sitting down before ${C.siege.ct}: lift the siege first.` : C.moved ? "Your army has already marched this year: attack it next year." : C.army < 5 ? "Your army is too small to give battle: five regiments at the least." : null;
    if (why) { react({ note: why }); drawMap(); return; }
    const fp = foeArmyPos(fh); if (fp) { selFoe = fh; doAct({ k: "move", x: fp.x, y: fp.y, chase: fh }); return; }
  }
  // (an enemy town that can't be fallen on now: beyond a year's march, marched on — and told when the army stands
  //  before it; anything else, said why, and the army left where it is)
  if (ct && o && o !== C.me && atWar(o) && C.emb == null) {
    if (!inMarch(ct) && !C.moved && !C.siege && C.army >= 5) { const t = cellXY(ct); doAct({ k: "move", x: t.x, y: t.y, target: ct[0] }); return; }
    react({ note: whyNot(ct) }); drawMap(); return;
  }
  // (and it stays chosen after a march order, to send on somewhere else; Esc, or a click away, puts it down)
  doAct({ k: "move", x, y });
}
export function initCampaign(c, battle, withPlayer) {
  ctx = c; startBattle = battle; fieldWithPlayer = withPlayer || null;
  ZOOM_3D = 4.2 * ZF(); addEventListener("resize", () => { ZOOM_3D = 4.2 * ZF(); });
  // (leaving a campaign of two: the link closed — the host keeps it to take up again — and the one alone as it was)
  $("cmpBack").onclick = () => { if (mp) leaveMp(); ctx.screen(cmpHome); };
  $("cmpNew").onclick = () => { if (!mp) drawPick(); };
  $("cmpPick").addEventListener("click", e => {
    const r = e.target.closest("[data-mpresume]"); if (r && mp && mp.host) { mp.net.send({ t: "cpick", crown: "" }); resumeMp(); return; }
    const b = e.target.closest("[data-crown]"); if (!b) return;
    if (mp) { if (b.dataset.crown === mp.theirs) return; mp.mine = b.dataset.crown; mp.net.send({ t: "cpick", crown: mp.mine }); sfx("parchment", 0.4); if (mp.host) maybeBegin(); if (!C) drawPick(); return; }
    // (into an empty place; all three taken, the one longest left alone makes way — asked first)
    const have = campaigns(); let into = [...Array(SLOTS).keys()].find(i => !have.some(h => h.i === i));
    if (into === undefined) { const old = have[have.length - 1]; if (!confirm(`You have ${SLOTS} campaigns. Begin a new one in place of ${NATIONS[old.c.me].name}, ${old.c.year}? That one will be lost.`)) return; into = old.i; }
    begin(b.dataset.crown, into); sel = null; selCity = null; drawMap(true); sfx("bell", 0.45); sfx("drum", 0.4, 900); statePaper(); });
  $("cmpPick").addEventListener("click", e => {
    const go = e.target.closest("[data-slot]"), drop = e.target.closest("[data-drop]");
    if (go) { slot = +go.dataset.slot; try { localStorage.setItem(SLOTKEY, String(slot)); } catch (er) {} if (resume()) { sel = null; selCity = null; note = ""; news = []; drawMap(true); sfx("parchment", 0.45); } return; }
    if (drop) { const i = +drop.dataset.drop, c = load(i); if (!c || !confirm(`Give up your campaign as ${NATIONS[c.me].name} (${c.year})? It can't be brought back.`)) return; try { localStorage.removeItem(slotKey(i)); } catch (er) {} if (i === slot) C = null; sfx("quill", 0.35); drawPick(); }
  });
  $("cmpEnd").onclick = () => {
    if (C && C.mp) { if (!mp || mp.gone) return; doAct({ k: "end" }); sfx("quill", 0.35); return; }
    // (what's on the move as the year turns: your armies marching, your fleets under sail — heard going)
    const marching = !!C.go || (C.armies || []).some(a => a.go), sailing = (C.fleets || []).some(f => f.go);
    const since = C.paperN | 0; endSeason(); firstDid("year");
    if (marching) sfx("march", 0.38, 250); if (sailing) sfx("sail", 0.35, marching ? 900 : 250);
    sfx("parchment", 0.55);
    // (what happened since the last paper — while the season turned, and what you did in it: a war you declared, a
    //  treaty — the news of it, at the top)
    const fresh = []; for (const l of C.log) { if (!l.n || l.n <= since) break; fresh.push(l); }
    C.paperN = C.logN | 0;
    news = fresh.filter(l => !/^((Spring|Summer|Autumn|Winter) )?\d{4}$| — \d{4}$/.test(l.title)).reverse(); note = ""; drawMap(); gazette(news); goalScreen();
    // (war on you, or an army on its way: the drum; a crown gone from the map: the bells)
    if (C.events.some(e => e.kind === "attack" && !e.done) || news.some(l => /declares war on you/.test(l.title))) { sfx("drum", 0.5, 400); if (C.events.some(e => e.kind === "attack" && !e.done)) sfx("march", 0.35, 1200); }
    else if (news.some(l => /is no more|takes /.test(l.title))) sfx("guns", 0.4, 400);
  };
  $("cmpSide").addEventListener("click", sideClick);
  $("cmpSide").addEventListener("input", e => { const el = e.target; if (!el.matches || !el.matches("[data-taxs],[data-ttaxs]")) return; const i = +el.value, n = el.parentElement.querySelectorAll(".cmp-tticks span"); n.forEach((s2, k) => s2.classList.toggle("on", k === i)); el.style.setProperty("--p", `${i / Math.max(1, n.length - 1) * 100}%`); });
  $("cmpSide").addEventListener("change", e => { const el = e.target; if (!el.matches || !el.matches("[data-taxs],[data-ttaxs]")) return; const v = +el.dataset.stops.split(",")[+el.value]; if (el.dataset.taxs) doAct({ k: "tax", v }); else if (selCity) doAct({ k: "ttax", t: selCity[0], v }); });
  $("cmpSide").addEventListener("change", e => { const t = e.target.closest("[data-rule]"); if (t && C) doAct({ k: "rule", ct: t.dataset.rule, on: t.checked }); });
  $("cmpHelpB").onclick = () => { if (C) howTo(); };
  $("cmpTechB").onclick = () => { if (C) { drawTech(); sfx("parchment", 0.4); } };
  $("cmpDipB").onclick = () => { if (C) { drawDiplo(); sfx("parchment", 0.4); } };
  $("cmpPanel").onclick = () => { $("cmpSide").classList.toggle("shut"); sfx("parchment", 0.5); };
  // (Esc: whatever's open over the map closed — a unit's card, the learning, the loyalty map — else the pause menu)
  addEventListener("keydown", e => {
    if (e.code !== "Escape" || e.repeat || !C || $("campaign").classList.contains("hidden") || $("cmpPlay").classList.contains("hidden") || $("cmpGazette") || $("cmpMust")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    for (const id of ["cmpGoal", "cmpMin", "cmpHow", "cmpPause", "cmpUnit", "cmpTech", "cmpDip"]) if ($(id)) { $(id).remove(); return; }
    if (loyMap) { toggleLoy(); return; }
    // (an army or a fleet in hand: put down first)
    if (armySel || selFleet != null) { armySel = false; selFleet = null; note = ""; drawMap(); return; }
    pauseMenu();
  }, true);
  // (P: diplomacy, open and shut)
  addEventListener("keydown", e => { if (e.code !== "KeyP" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !C || $("campaign").classList.contains("hidden") || $("cmpPlay").classList.contains("hidden") || $("cmpGazette") || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return; e.preventDefault(); e.stopImmediatePropagation(); if ($("cmpDip")) $("cmpDip").remove(); else $("cmpDipB").click(); }, true);
  // (L: the loyalty map, on and off)
  addEventListener("keydown", e => { if (e.code !== "KeyL" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !C || $("campaign").classList.contains("hidden") || $("cmpPlay").classList.contains("hidden") || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return; e.preventDefault(); e.stopImmediatePropagation(); toggleLoy(); }, true);
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
    const px = pos(e), fh = foeHit(cv, ...px), ah = !fh && armyHit(cv, ...px), wh = !fh && !ah && warHit(cv, ...px), sh = !fh && !ah && !wh && fleetHit(cv, ...px), bf = !fh && !ah && !wh && !sh && !ct && fieldHit(cv, ...px);
    if (bf) fieldTip(bf, e); else if (wh) { cv.style.cursor = "pointer"; armyTip(wh, null, e); } else if (fh || ah) { cv.style.cursor = "pointer"; armyTip(fh, ah, e); } else if (sh) { cv.style.cursor = "pointer"; fleetTip(sh, e); } else townTip(ct, e);
  };
  cv.onmouseleave = () => { drag = null; hov = null; hovCity = null; townTip(null); paint(); };
  // (right-click: your army sent there)
  cv.oncontextmenu = e => {
    e.preventDefault(); if (!C) return;
    const [mx, my] = toMap(pos(e)), S = cv.width / MG_W;
    if (selFleet != null && fleetById(selFleet)) { fleetOrder(fleetHit(cv, ...pos(e)), mx / S, my / S); return; }
    // (nothing chosen — no army, no fleet: a right-click gives no orders. It used to march the army last in hand
    //  wherever you clicked, chosen or not, so a garrison's new army set off after it had been put down)
    if (!armySel) { note = "Choose an army first: click it, then right-click where it should go."; drawMap(); return; }
    // (what's under the click — a fleet of yours, another army of yours, a town, an enemy army — and the order it means)
    const fl = armySel && C.emb == null ? fleetHit(cv, ...pos(e)) : null;
    orderAt({ fleetMine: fl && fl.mine != null ? fl.mine : null, ah: armyHit(cv, ...pos(e)), ct: cityAt(cv, mx, my, view.z), fh: foeHit(cv, ...pos(e)), x: mx / S, y: my / S });
  };
  cv.onmouseup = e => {
    const moved = drag ? drag.moved : 0; drag = null; if (moved > 5 || !C || e.button !== 0) return;
    // (a town's own dot, clicked, is the town, whatever army or fleet stands over it; and a second click on an army or
    //  fleet already chosen goes through it to the town beneath)
    const dot = dotAt(cv, pos(e)), thru = dot.ct && (dot.on || (selFoe && foeHit(cv, ...pos(e)) === selFoe) || (armySel && (armyHit(cv, ...pos(e)) || {}).id === (C.ar | 0)) || (selFleet != null && (fleetHit(cv, ...pos(e)) || {}).mine === selFleet) || (selFoeFleet && (fleetHit(cv, ...pos(e)) || {}).foe === selFoeFleet));
    const sh = !thru && fleetHit(cv, ...pos(e));
    if (sh) { if (sh.mine != null) { selFleet = selFleet === sh.mine ? null : sh.mine; selFoeFleet = null; } else { selFoeFleet = sh.foe; sel = pFleet(sh.foe) ? pFleet(sh.foe).h : sh.foe; } selCity = null; selFoe = null; armySel = false; note = selFleet != null && sh.mine != null ? "Your fleet: right-click on the sea to sail there." : ""; drawMap(); sfx("bell", 0.15); return; }
    if (selFleet != null) { selFleet = null; }
    selFoeFleet = null;
    const fh = !thru && foeHit(cv, ...pos(e));
    if (fh) { selFoe = fh; sel = crownOf(fh); selCity = null; armySel = false; note = ""; drawMap(); sfx("drum", 0.2); return; }
    selFoe = null;
    const hit = !thru && armyHit(cv, ...pos(e));
    if (hit && hit.id !== (C.ar | 0)) { doAct({ k: "usearmy", id: hit.id }); armySel = false; }
    if (hit) { armySel = !armySel; selCity = null; sel = null; note = armySel ? `${(C.armies || []).length ? `The ${armyName(C.ar | 0).toLowerCase()}` : "Your army"}: right-click anywhere on the map to march there. A year's march takes it about 350 km; a town within that is in its reach.` : ""; drawMap(); sfx("drum", 0.25); return; }
    armySel = false;
    const wh = !thru && warHit(cv, ...pos(e));
    if (wh) { selCity = null; sel = wh; note = ""; drawMap(); sfx("drum", 0.2); return; }
    const p = toMap(pos(e)), ct = (thru ? dot.ct : null) || cityAt(cv, ...p, view.z) || loyTownAt(...p);
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
      // (the same orders as on the parchment: an enemy town's name or the ground about it, an army under the pointer
      //  where it's drawn — where a right-click here once only ever marched the army to the spot)
      eu3d.el.addEventListener("contextmenu", e => {
        e.preventDefault(); if (!C) return;
        const r = eu3d.el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        if (selFleet != null && fleetById(selFleet)) { const h = eu3d.pick(px, py); if (!h || !h.ll) return; const [fx, fy] = gridOf(...h.ll); fleetOrder(fleetOf3d(eu3d.fleetAt(px, py)), fx, fy); return; }
        if (!armySel) { note = "Choose an army first: click it, then right-click where it should go."; drawMap(); return; }
        const ak = eu3d.armyAt(px, py), hit = eu3d.pick(px, py); if (!hit) return;
        let ct = hit.city ? CITIES.find(c => c[0] === hit.city) || null : null, x, y;
        if (hit.ll) { [x, y] = gridOf(...hit.ll); if (!ct) { let bd = 1.6; for (const c of CITIES) { const t = cellXY(c), d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; ct = c; } } } }
        else if (ct) { const t = cellXY(ct); x = t.x; y = t.y; }
        if (x == null) return;
        const fh = ak && ak.startsWith("foe-") ? ak.slice(4) : ak && ak.startsWith("p-") ? ak.slice(2) : null, am = ak && ak.match(/^mine-(\d+)$/);
        orderAt({ ah: am ? { id: +am[1] } : null, ct, fh, x, y });
      });
      addEventListener("mousemove", e => {
        if (!on3d) return;
        if (d3 && e.buttons & 1) { const dx = e.clientX - d3.x, dy = e.clientY - d3.y; d3.moved += Math.abs(dx) + Math.abs(dy); d3.x = e.clientX; d3.y = e.clientY; eu3d.pan(dx, dy); eu3d.el.style.cursor = "grabbing"; return; }
        if (e.target !== eu3d.el) return;
        const r = eu3d.el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, ak = C && eu3d.armyAt(px, py), hit = eu3d.pick(px, py);
        eu3d.el.style.cursor = ak || (hit && hit.city) ? "pointer" : "grab";
        // (what's under the pointer, said beside it, as on the parchment: an army — whose, how strong, what it's about —
        //  or a town)
        if (!C) return;
        const mm = ak && ak.match(/^mine-(\d+)$/), fid = ak && (ak.startsWith("foe-") ? ak.slice(4) : ak.startsWith("war-") ? ak.slice(4) : ak.startsWith("p-") ? ak.slice(2) : null);
        const sh = !ak && fleetOf3d(eu3d.fleetAt(px, py)); if (sh) eu3d.el.style.cursor = "pointer";
        const bfn = !ak && !sh && !(hit && hit.city) && eu3d.markAt(px, py, /^fought:/), bf3 = bfn && (C.E.fought || []).find(f => "fought:" + f.x + "," + f.y === bfn);
        if (mm) armyTip(null, { id: +mm[1] }, e);
        else if (fid && (NATIONS[fid] || isColo(fid))) armyTip(fid, null, e);
        else if (sh) fleetTip(sh, e);
        else if (bf3) fieldTip(bf3, e);
        else townTip(hit && hit.city ? CITIES.find(c => c[0] === hit.city) || null : null, e);
      });
      addEventListener("mouseup", e => {
        if (!d3 || !on3d) { d3 = null; return; }
        const moved = d3.moved; d3 = null; eu3d.el.style.cursor = "grab"; if (moved > 5 || !C) return;
        const r = eu3d.el.getBoundingClientRect();
        // (a ship under the pointer: that fleet chosen — yours to sail, another's to look at — or put down again)
        { const sh = fleetOf3d(eu3d.fleetAt(e.clientX - r.left, e.clientY - r.top));
          if (sh) { if (sh.mine != null) { selFleet = selFleet === sh.mine ? null : sh.mine; selFoeFleet = null; } else { selFoeFleet = sh.foe; sel = pFleet(sh.foe) ? pFleet(sh.foe).h : sh.foe; } selCity = null; selFoe = null; armySel = false; note = selFleet != null && sh.mine != null ? "Your fleet: right-click on the sea to sail there." : ""; drawMap(); sfx("bell", 0.15); return; }
          if (selFleet != null) selFleet = null; selFoeFleet = null; }
        // (a company under the pointer, where it's drawn: chosen before the town or the ground beneath it)
        { const ak = eu3d.armyAt(e.clientX - r.left, e.clientY - r.top), mm = ak && ak.match(/^mine-(\d+)$/), fm = ak && !ak.includes(COLO) && ak.match(/^foe-(.+)$/);
          if (mm) { const id = +mm[1]; if (id !== (C.ar | 0)) doAct({ k: "usearmy", id }); armySel = true; selCity = null; sel = null; selFoe = null; note = ""; drawMap(); sfx("drum", 0.25); return; }
          if (fm && NATIONS[fm[1]]) { selFoe = fm[1]; sel = fm[1]; selCity = null; armySel = false; note = ""; drawMap(); sfx("drum", 0.2); return; } }
        const hit = eu3d.pick(e.clientX - r.left, e.clientY - r.top); if (!hit) return;
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
export function openCampaign(fromMenu = false, home = null) {
  if (home) cmpHome = home;
  // (from the battles menu: your own campaigns — the story's, if it was the one open, put away for the story to take up)
  if (fromMenu && C && C.story) { persist(); C = null; sel = null; selCity = null; note = ""; news = []; slot = ownSlot(); storyHomeBtn(); }
  ctx.screen("campaign");
  if (mp) { if (C) { abandoned(); drawMap(); } else drawPick(); return; }
  if (C || resume()) { abandoned(); drawMap(true); warmMaps(); } else drawPick();
}
// ---- the story's campaign: Part Three, the Emperor's commission. The Emperor's army in the Hungarian war, from the
//  autumn of 1686, with you at its head — the story's hero as its general, who takes no ball in the field; and the way
//  home to your settlement at the top of the screen, the campaign kept as it stands for you to come back to ----
export function openStoryCampaign(o = {}) {
  storyHome = o.home || null;
  if (mp) leaveMp();
  if (!(C && C.story)) {
    slot = STORY_SLOT;
    if (!resume()) {
      begin("austria", STORY_SLOT);
      C.story = 1; C.year = 1686; C.goal = null;
      const g0 = newMan("hre", "general");
      C.gen = { ...g0, name: o.name || "The Forester", short: o.short || "Forester", you: true, st: [3, 4, 1], served: 0, d: "You: out of Hamburg by the Marsh Gate, a forester in the old woods, and on the works at the Elbe when the Danes came. The Emperor's commission in your coat." };
      C.log = C.log.filter(l => !/^You take the crown/.test(l.sub || ""));
      say("The Emperor's commission", "You command the Emperor's army in the Hungarian war. Buda has been the Sultan's since 1541: take it, and hold what the Emperor holds. The Home button at the top takes you back to your settlement whenever you like; the campaign is kept as it stands.");
      save();
    }
    C.story = 1;
  }
  storyHomeBtn();
  ctx.screen("campaign"); abandoned(); drawMap(true); warmMaps();
}
// (the way home from the story's campaign: a button at the top, only there)
function storyHomeBtn() {
  let b = $("cmpHome");
  if (!b) { b = document.createElement("button"); b.id = "cmpHome"; b.className = "btn ghost"; b.title = "Back to your settlement: the campaign is kept"; b.textContent = "Home"; $("cmpTechB").before(b); b.onclick = () => storyLeave(); }
  b.classList.toggle("hidden", !(C && C.story));
  { const nb = $("cmpNew"); if (nb && C && C.story) nb.classList.add("hidden"); }
}
function storyLeave() {
  if (!C || !C.story) return;
  persist(); const go = storyHome; C = null; sel = null; selCity = null; note = ""; news = []; slot = ownSlot(); storyHomeBtn();
  if (go) go();
}
export const storyCampaignKept = () => { try { return !!JSON.parse(localStorage.getItem(slotKey(STORY_SLOT))); } catch (e) { return false; } };
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
    <div class="cmp-pickwrap"><div class="cmp-crowns">${list.map(x => `<button class="cmp-crown" data-crown="${x.id}"><i style="background:${NATIONS[x.id].color}"></i><b>${esc(NATIONS[x.id].name)}</b><small>${word(x.s)} · ${x.n} town${x.n > 1 ? "s" : ""} · ${"★".repeat(x.s)}</small></button>`).join("")}</div>
    <aside class="cmp-prev" id="cmpPrev"><canvas id="cmpPrevMap"></canvas><div id="cmpPrevText"></div></aside></div>
    <div class="pv-acts"><button class="btn ghost" id="cmpPickBack">${C ? "Back to your campaign" : "Back"}</button></div>`;
  $("cmpPickBack").onclick = () => { if (C) drawMap(true); else ctx.screen(cmpHome); };
  // (a crown pointed at: its lands on the map, and how it stands in 1683 — the first of them, till you point at another)
  const grid0 = $("cmpPick").querySelector(".cmp-crowns");
  const show = id => { if (id && id !== pickShown) pickPreview(id, g, list.find(x => x.id === id), word); };
  grid0.addEventListener("mouseover", e => { const b = e.target.closest("[data-crown]"); if (b) show(b.dataset.crown); });
  grid0.addEventListener("focusin", e => { const b = e.target.closest("[data-crown]"); if (b) show(b.dataset.crown); });
  pickShown = null; show(list[0] && list[0].id);
}
// ---- the crown you're looking at, before you take it up: where it lies, and where it stands ----
// (what each of the greater crowns was about in 1683, in a line; the rest are told by their towns and their wars)
const CROWN_1683 = {
  ottoman: "At the height of its reach: the Grand Vizier's army is on the road to Vienna, and the Crimean Tatars ride with it.",
  france: "Louis XIV's kingdom, the strongest in Europe, taking towns along its eastern frontier by law and by force.",
  austria: "The Emperor Leopold's own lands, with Vienna itself about to be besieged by the Turk.",
  russia: "Muscovy under the regency of Sophia: vast, and still turned inward.",
  castile: "Spain under Charles II: a great empire past its best, at war with France over the Low Countries.",
  hre: "The Empire's princes and free cities, bound loosely under the Emperor, and called to arms against the Turk.",
  poland: "John III Sobieski's commonwealth, sworn to the Emperor's aid against the Turk.",
  england: "Charles II's kingdom: rich in trade and ships, at peace on the Continent, with colonies over the Atlantic.",
  sweden: "Charles XI's Baltic empire, holding the shores from Stockholm round to Stettin and Bremen.",
  dutch: "The Republic of the United Provinces: few towns, but the richest trade in Europe and a great fleet.",
  venice: "The Most Serene Republic, mistress of the Adriatic, old enemy of the Turk.",
  papal: "The Pope's own state. Innocent XI is gathering the Christian crowns into a league against the Turk.",
  denmark: "Christian V's kingdom, holding the Sound and Norway, the old rival of Sweden.",
  brandenburg: "The Great Elector's lands, scattered from the Rhine to the Baltic.",
  portugal: "Twenty years free of Spain again, with an empire overseas.",
  saxony: "John George III's rich Saxony, which will send its regiments to Vienna's relief.",
  bavaria: "Max Emanuel's Bavaria, young and ambitious, which will march to Vienna's relief.",
  hungary: "Thököly's Hungary of the rebels, allied to the Sultan against the Emperor.",
  crimea: "The Khan's Tatar horsemen, riding with the Sultan against Poland and the Emperor.",
  cossacks: "The Hetmanate on the Dnieper, under the Tsar's protection.",
};
let pickShown = null;
function pickPreview(id, g, x, word) {
  pickShown = id;
  const cv = $("cmpPrevMap"), tx = $("cmpPrevText"); if (!cv || !tx) return;
  const W = 520, H = Math.round(W * MAP_ASPECT); if (cv.width !== W) { cv.width = W; cv.height = H; }
  // (the map framed on its lands, a margin round them — the whole of them, the colonies over the sea as well)
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const ct of citiesOfNow(g, id)) { const p = cellXY(ct); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const S = W / MG_W, w = Math.max(60, (x1 - x0) * 1.5 + 40), h = Math.max(40, (y1 - y0) * 1.5 + 30);
  const z = clamp(Math.min(MG_W / w, MG_H / h), 1, 7), ox = clamp((x0 + x1) / 2 * S - W / (2 * z), 0, W - W / z), oy = clamp((y0 + y1) / 2 * S - H / (2 * z), 0, H - H / z);
  const E0 = { conq: [], wars: WARS_1683.map(([a, b]) => ({ a, b })), war: {}, plague: {}, rev: 0 };
  try { drawEurope(cv, E0, { selected: id, home: false, view: { z, ox, oy }, zf: 1 }); } catch (e) { /* (the preview's only a nicety) */ }
  const wars = WARS_1683.filter(w => w.includes(id)).map(w => w[0] === id ? w[1] : w[0]).filter(o => NATIONS[o]);
  const leagues = LEAGUES_1683.filter(L => L.ids.includes(id));
  const big = citiesOfNow(g, id).sort((a, b) => b[3] - a[3])[0];
  const list = a => a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "";
  tx.innerHTML = `<h3><i style="background:${NATIONS[id].color}"></i>${esc(NATIONS[id].name)}</h3>
    <small>${word(x.s)} · ${x.n} town${x.n > 1 ? "s" : ""}${big ? ` · its chief town ${esc(big[0])}` : ""}</small>
    ${CROWN_1683[id] ? `<p>${esc(CROWN_1683[id])}</p>` : ""}
    <p><b>${wars.length ? "At war" : "At peace"}</b> ${wars.length ? `with ${esc(list(wars.map(the)))}.` : "with everyone, as the year begins."}</p>
    ${leagues.map(L => `<p><b>Of ${esc(L.n)}</b> with ${esc(list(L.ids.filter(o => o !== id && NATIONS[o]).map(the)))}.</p>`).join("")}
    <small class="cmp-prev-go">Click to take up this crown.</small>`;
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
  // (the year's battlefields of the other crowns' wars: crossed swords in a darker ink)
  for (const f of (C.E && C.E.fought) || []) { const [lon, lat] = llOf(f.x, f.y); out.push({ name: "fought:" + f.x + "," + f.y, lon, lat, kind: "swords", color: "#5a3a22", dim: false }); }
  return out;
}
// the armies on the land, for the near view: each as a company of its own men in its own coats (europe3d.js armies)
// (where each army stood when the 3D view last saw it: moved since, it's given the road it came by, to walk along)
let last3d = {}, last3dOf = null, lastF3d = {}, lastF3dOf = null; const route3d = new Map();
function armies3d() {
  const g = grid(), out = [];
  if (last3dOf !== C) { last3dOf = C; last3d = {}; }
  const add = (key, p, id, n, mine, go) => {
    if (!p || !isFinite(p.x) || !NATIONS[id]) return;
    let via = null; { const was = last3d[key]; if (was && Math.hypot(p.x - was.x, p.y - was.y) > 0.4 && !overSea(was, p)) { const P = landPath(g, was, p), w = P && smoothWay(P, false); if (w && w.length > 2) via = w.map(q => llOf(q.x, q.y).map(v => Math.round(v * 1000) / 1000)); } last3d[key] = { x: p.x, y: p.y }; }
    // (and the road it's on, to where it's bound: worked out once for each march, not every time the map is drawn)
    let route = null; if (go && isFinite(go.x)) { const rk = `${key}|${p.x.toFixed(2)},${p.y.toFixed(2)}|${go.x.toFixed(2)},${go.y.toFixed(2)}`; route = route3d.get(rk); if (route === undefined) { const P = !overSea(p, go) && landPath(g, p, go), w = P && smoothWay(P, false); route = (w && w.length > 1 ? w : [p, go]).map(q => llOf(q.x, q.y).map(v => Math.round(v * 1000) / 1000)); if (route3d.size > 200) route3d.clear(); route3d.set(rk, route); } }
    const [lon, lat] = llOf(p.x, p.y), uni = UNI_OF[id], U = UNIFORMS[uni] || UNIFORMS.imperial, L = soldierLook(U, 1683 + id.length * 7), gl = go ? llOf(go.x, go.y) : null;
    out.push({ key, lon, lat, color: NATIONS[id].color, n, mine: !!mine, body: L.body, nw: !!NATIONS[id].nw, march: !!go, glon: gl ? gl[0] : null, glat: gl ? gl[1] : null, ...(via ? { via } : {}), ...(route ? { route } : {}), ...(mine && armySel && key === "mine-" + (C.ar | 0) ? { chosen: true } : {}),
      colors: { coat: L.coat, vest: L.vest, cuff: L.cuff, legs: L.legs, hat: L.hatColor, sash: L.sash, stockings: L.stockings, linen: L.linen, skin: L.skin, hair: L.hair },
      flag: NATIONS[id].nw ? null : coloursCanvas(uni) });
  };
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !isHuman(id) && alive(g, id)) { const fp = foeArmyPos(id), tg = C.foeGo && C.foeGo[id] && CITIES.find(t => t[0] === C.foeGo[id]); if (fp) add("foe-" + id, fp, id, knowsArmy(id) ? foeArmy(id) : 12, false, tg ? cellXY(tg) : null); }
  for (const [id, c] of Object.entries(colonies())) if (atWar(id) && c.n > 0) add("foe-" + id + COLO, c.pos, id, knowsArmy(id) ? c.n : 8, false, c.go ? (t => t ? cellXY(t) : null)(CITIES.find(x => x[0] === c.go)) : null);
  for (const id of othersAtWar()) add("war-" + id, foeArmyPos(id), id, knowsArmy(id) ? foeArmy(id) : 12, false, null);
  if (C.mp) for (const h of humans()) if (h !== C.me) { const sl = sliceOf(h); if (sl && sl.pos && sl.emb == null) add("p-" + h, sl.pos, h, sl.army | 0, false, sl.go || null); }
  for (const a of C.armies || []) if (a.pos && a.emb == null) add("mine-" + a.id, a.pos, C.me, C.units.filter(u => !u.at && (u.ar | 0) === a.id).length, true, a.go || null);
  if (C.emb == null) add("mine-" + (C.ar | 0), armyPos(), C.me, field().length || C.army, true, C.go || null);
  return out;
}
// (the towns under siege, for the land seen close: yours, by each of your armies, and the other player's — the lines dug
//  round them, the besiegers' tents, the guns' smoke over the batteries)
function sieges3d() {
  const out = [], one = (S, id) => { const ct = S && CITIES.find(c => c[0] === S.ct); if (!ct) return; out.push({ name: ct[0], lon: ct[1], lat: ct[2], rank: ct[3] | 0, color: NATIONS[id].color, years: S.years | 0, breach: (S.bat || 0) >= 1 }); };
  eachArmy(() => { if (C.siege) one(C.siege, C.me); });
  if (C.mp) for (const h of humans()) if (h !== C.me) { const sl = sliceOf(h); if (sl && sl.siege) one(sl.siege, h); }
  for (const f of (C.E && C.E.fought) || []) { const [lon, lat] = llOf(f.x, f.y); out.push({ name: "fought", lon, lat, rank: 0, color: "#888", field: true }); }
  return out;
}
// (the fleets at sea, for the land seen close: yours, the other player's, and the crowns' — each heading where she's bound)
function fleets3d() {
  if (lastF3dOf !== C) { lastF3dOf = C; lastF3d = {}; }
  const out = [], one = (p, id, n, mine, go, key) => {
    // (moved since the view last saw her: the course she sailed, round the land, for her to be seen sailing it)
    let via = null; { const was = lastF3d[key]; if (was && Math.hypot(p.x - was.x, p.y - was.y) > 0.4) { const sp = seaPath(grid(), was, p); if (sp && sp.length > 1) via = smoothWay([{ x: was.x, y: was.y }, ...sp, { x: p.x, y: p.y }], true).map(q => llOf(q.x, q.y).map(v => Math.round(v * 1000) / 1000)); } lastF3d[key] = { x: p.x, y: p.y }; }
    const [lon, lat] = llOf(p.x, p.y), yaw = go ? Math.atan2(go.x - p.x, go.y - p.y) : (hashStr(key) % 628) / 100; out.push({ name: key, lon, lat, color: NATIONS[id].color, n, yaw: Math.round(yaw * 100) / 100, mine, bound: !!go, ...(via ? { via } : {}), ...(mine && key === "mine-" + selFleet ? { chosen: true } : {}) }); };
  for (const [id, F] of Object.entries(C.foeFleets || {})) if (F.ships.length) one(F.pos, id, F.ships.length, false, null, "foe-" + id);
  for (const [h, f] of otherFleets()) one(f.pos, h, f.ships.length, false, f.go, `p-${h}-${f.id}`);
  for (const f of C.fleets || []) if (f.ships.length) one(f.pos, C.me, f.ships.length, true, f.go, "mine-" + f.id);
  return out;
}
const hashStr = t => { let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
// (the other player's fleets, in a campaign of two)
const otherFleets = () => C.mp ? humans().filter(h => h !== C.me).flatMap(h => ((sliceOf(h) || {}).fleets || []).filter(f => f.ships.length).map(f => [h, f])) : [];
// (an army under the pointer: whose, how strong, under whom, and what it's about)
// (a fleet under the pointer: whose, how many ships and of what kinds, and whether she's under sail)
function fleetTip(sh, e) {
  let el = $("cmpTip"); if (!el) { el = document.createElement("div"); el.id = "cmpTip"; el.className = "cmp-tip"; $("campaign").appendChild(el); }
  const pf = sh.foe && pFleet(sh.foe), f = sh.mine != null ? fleetById(sh.mine) : pf ? pf.f : C.foeFleets && C.foeFleets[sh.foe]; if (!f || !f.ships) { el.style.display = "none"; return; }
  const who = sh.mine != null ? "Your fleet" : pf ? `${poss(nameOf(pf.h))} fleet` : `${poss(The(sh.foe))} fleet`, kinds = {};
  for (const s2 of f.ships) kinds[s2.k] = (kinds[s2.k] || 0) + 1;
  const mix = Object.entries(kinds).map(([k, n]) => `${n} ${(n === 1 ? SHIPS[k].one : SHIPS[k].name).toLowerCase()}`).join(", ");
  el.innerHTML = `<b>${esc(sh.mine != null && (C.fleets || []).length > 1 ? fleetName(f) : who)}</b><small>${f.ships.length} ship${f.ships.length === 1 ? "" : "s"}: ${esc(mix)}</small><span>${f.go ? "Under sail" : sh.mine != null ? "At anchor · click, then right-click the sea to sail" : sh.mine == null && atWar(crownOf(sh.foe.replace(/^p:([^:]+):.*$/, "$1"))) ? "At war with you" : "At anchor"}</span>`;
  placeTip(el, e);
}
function armyTip(foe, mine, e) {
  let el = $("cmpTip"); if (!el) { el = document.createElement("div"); el.id = "cmpTip"; el.className = "cmp-tip"; $("campaign").appendChild(el); }
  if (foe && isHuman(foe)) { const sl = sliceOf(foe) || {}; el.innerHTML = `<b>${esc(poss(nameOf(foe)))} army</b><small>${sl.army | 0} regiments${sl.gen ? ` · under ${esc(sl.gen.name)}` : ""}</small><span>${sl.siege ? `Besieging ${esc(sl.siege.ct)}` : "In the field"}${canFieldP(foe) ? " · within your reach" : ""}</span>`; }
  else if (foe && isColo(foe)) { const b = crownOf(foe), c = coloOf(foe) || {}; el.innerHTML = `<b>${esc(poss(The(b)))} colonial army</b><small>${knowsArmy(b) ? `${c.n | 0} regiments` : "Its size unknown"} · its colonists and soldiers in the New World</small><span>${c.go ? `Marching on ${esc(c.go)}` : "Holding its colonies"}${canField(foe) ? " · within your reach" : ""}</span>`; }
  else if (foe) { const tg = C.foeGo && C.foeGo[foe], fg = C.foeGen && C.foeGen[foe]; el.innerHTML = `<b>${esc(poss(The(foe)))} army</b><small>${knowsArmy(foe) ? `${C.foes[foe] | 0} regiments` : "Its size unknown"}${fg ? ` · under ${esc(fg.name)}` : ""}</small><span>${tg ? `Marching on ${esc(tg)}` : !C.E.war[foe] ? (en => en.length ? `At war with ${esc(en.length > 1 ? en.slice(0, -1).map(x => the(x)).join(", ") + " and " + the(en[en.length - 1]) : the(en[0]))} · not with you` : "At home")((C.E.wars || []).filter(w => w.a === foe || w.b === foe).map(w => w.a === foe ? w.b : w.a)) : "In the field"}${C.E.war[foe] && canField(foe) ? " · within your reach" : ""}</span>`; }
  else { const id = mine.id, A = id === (C.ar | 0) ? C : (C.armies || []).find(a => a.id === id) || {}, n = (C.units || []).filter(u => !u.at && (u.ar | 0) === id).length; el.innerHTML = `<b>${(C.armies || []).length ? esc(armyName(id)) : "Your army"}</b><small>${n} regiments${A.gen ? ` · under ${esc(A.gen.name)}` : " · no general"}</small><span>${A.siege ? `Besieging ${esc(A.siege.ct)}` : A.go ? "On the march" : A.moved ? "Marched this year" : "Ready to march"}</span>`; }
  placeTip(el, e);
}
// (a battlefield: where, between whom, who had the day)
function fieldTip(f, e) {
  let el = $("cmpTip"); if (!el) { el = document.createElement("div"); el.id = "cmpTip"; el.className = "cmp-tip"; $("campaign").appendChild(el); }
  const w = f.w && NATIONS[f.w] ? f.w : null, l = f.l && NATIONS[f.l] ? f.l : null;
  el.innerHTML = `<b>${f.at ? `The battle ${f.took ? "for" : "near"} ${esc(f.at)}` : "A battlefield"}</b><small>${f.yr || C.year - 1}${w && l ? ` · ${esc(The(w))} against ${esc(the(l))}` : ""}</small><span>${w && l ? (f.took ? `${esc(The(w))} ${v3(w, "won")} the day and took the town.` : `${esc(The(w))} ${v3(w, "won")} the day; ${esc(poss(the(l)))} army fell back.`) : "Fought this year."}</span>`;
  placeTip(el, e);
}
// (beside the pointer, and kept whole inside the window: flipped to the pointer's other side near the right or bottom edge)
function placeTip(el, e) {
  el.style.display = "block"; el.style.left = "0px"; el.style.top = "0px"; el.style.width = ""; el.style.maxWidth = "300px"; const w = Math.min(innerWidth - 8, el.offsetWidth + 1), h = el.offsetHeight; el.style.width = w + "px";
  el.style.left = Math.max(4, e.clientX + 16 + w > innerWidth - 4 ? e.clientX - 12 - w : e.clientX + 16) + "px";
  el.style.top = Math.max(4, e.clientY + 14 + h > innerHeight - 4 ? e.clientY - 10 - h : e.clientY + 14) + "px";
}
// (a town under the pointer: its name, how great it is, whose, and its people — beside the pointer)
function townTip(ct, e) {
  let el = $("cmpTip");
  if (!ct || !e) { if (el) el.style.display = "none"; return; }
  if (!el) { el = document.createElement("div"); el.id = "cmpTip"; el.className = "cmp-tip"; $("campaign").appendChild(el); }
  const o = cityOwner(grid(), ct), r = popRate(ct);
  el.innerHTML = `<b>${esc(ct[0])}</b><small>${["", "A town", "A city", "A great city"][ct[3]]}${o ? ` · ${o === C.me ? "yours" : esc(NATIONS[o].name)}` : ""}</small><span>${fmtN(popOf(ct))} people${o === C.me && r ? ` · ${r > 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}% a year` : ""}</span>${o === C.me ? `<span>${orderWord(orderOf(ct))}${garUnits(ct[0]).length ? ` · ${garUnits(ct[0]).length} regiment${garUnits(ct[0]).length > 1 ? "s" : ""} holding it` : ""}${raising(ct[0]).length ? ` · raising ${raising(ct[0]).length}` : ""}</span>` : ""}`;
  placeTip(el, e);
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
  if (on3d && eu3d) { eu3d.me = C.me; eu3d.season(C.s | 0); eu3d.setMap(E(), 2, null, C.walls, C.pop); eu3d.marks(marks3d()); eu3d.fleets(fleets3d()); eu3d.armies(armies3d()); eu3d.sieges(sieges3d()); if (!raf3d) loop3d(); return; }
  // (marches finished since the map was last drawn: their marks drawn on it again, off the overlay)
  { const t = performance.now(); marchAnims = marchAnims.filter(A => t - A.t0 < A.dur); }
  spreadCheck();
  let sp = null;
  if (spread) { const t = (performance.now() - spread.t0) / spread.dur; if (t >= 1) spread = null; else { const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; sp = { cells: spread.cells, p: e * (spread.max + 4) - 1 }; if (!spreadRaf) spreadRaf = requestAnimationFrame(spreadTick); } }
  // (where the armies and fleets will stand on the view, so the towns' names are written clear of them)
  const avoid = (() => { const S0 = cv.width / MG_W, k0 = cv.width / 1300, out = [], box = p => { if (!p || !isFinite(p.x)) return; const x = (p.x * S0 - view.ox) * view.z, y = (p.y * S0 - view.oy) * view.z; out.push([x - 32 * k0, y - 26 * k0, x + 30 * k0, y + 16 * k0]); };
    box(armyPos()); for (const a of C.armies || []) box(a.pos); for (const f of C.fleets || []) box(f.pos);
    for (const f of Object.keys(C.E.war || {})) if (C.E.war[f] && !isHuman(f)) box(foeArmyPos(f));
    return out; })();
  const g = drawEurope(cv, E(), { avoid, spread: sp, pop: C.pop || null, hover: hov || C.me, selected: sel, city: selCity, hoverCity: hovCity, view, home: false, me: C.me, walled: C.walls || null, zf: ZF(), sharp: () => { if (shown() && !on3d) paint(); } });
  // over the map: your towns ringed in your colour; the towns of your enemies within your army's reach marked with
  // crossed swords (dim once it's marched this season); a town an enemy marches on, red
  const c = cv.getContext("2d"), S = cv.width / MG_W, k = cv.width / 1300, at = ct => { const [x, y] = gridOf(ct[1], ct[2]); return [(x * S - view.ox) * view.z, (y * S - view.oy) * view.z]; };
  if (loyMap) paintLoyalty(c, g, S, k, at);
  // (close in: each town's good, small, beside its dot; a port of yours shut by an enemy fleet, a red ring round it)
  // (the walls round each walled town, on the town itself: at every zoom where the towns show)
  if (view.z >= 1.4) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); for (const ct of CITIES) { const wl = lvOf(ct[0], "walls"); if (!wl) continue; const [x, y] = at(ct); if (x < -30 || y < -30 || x > cv.width + 30 || y > cv.height + 30) continue; wallRing(c, x, y, Math.min(2.3, 1.15 + view.z / ZF() * 0.22) * 3.4 * k, k, wl); } c.restore(); }
  // (each town's trade good: only on the loyalty map, where the towns' business is what you're looking at)
  if (view.z >= 2.2 && loyMap) { const sz = Math.min(28, 12 + view.z * 2) * k; c.save(); c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; c.setTransform(1, 0, 0, 1, 0, 0); for (const ct of CITIES) { const [x, y] = at(ct); if (x < -20 || y < -20 || x > cv.width + 20 || y > cv.height + 20) continue; const im = goodPic(goodOf(ct)); if (im.complete && im.naturalWidth) { const bx = x + 6 * k + sz / 2, by = y - sz / 2 - 4 * k, rr = sz * 0.62; c.fillStyle = "rgba(30,22,14,0.82)"; c.strokeStyle = "#c9a45a"; c.lineWidth = 1.3 * k; c.beginPath(); c.arc(bx, by, rr, 0, 7); c.fill(); c.stroke(); c.drawImage(im, bx - sz * 0.48, by - sz * 0.48, sz * 0.96, sz * 0.96); } } c.restore(); }
  for (const ct of citiesOfNow(g, C.me)) if (blockader(ct)) { const [x, y] = at(ct); c.save(); c.strokeStyle = "#c0281a"; c.lineWidth = 2.2 * k; c.setLineDash([3 * k, 2 * k]); c.beginPath(); c.arc(x, y, 9 * k, 0, 7); c.stroke(); c.restore(); }
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
  // (the year's battlefields in the other crowns' wars: crossed swords in a darker ink, where they met)
  for (const f of (C.E && C.E.fought) || []) { const [x, y] = scr(f); swords(x, y - 6 * k, 4.2 * k, "rgba(84,54,30,0.85)"); }
  // (a town under siege: the lines drawn round it in the engineers' way — a jagged ring of redoubts — and the
  //  besiegers' tents behind them, in their colours)
  for (const Sg of sieges3d()) {
    const ct = CITIES.find(t => t[0] === Sg.name); if (!ct) continue;
    const [x, y] = scr(cellXY(ct)), R0 = (9 + Sg.rank * 3) * k * Math.min(2.2, 0.8 + view.z / ZF() * 0.4);
    c.save(); c.strokeStyle = "rgba(70,48,26,0.9)"; c.lineWidth = 1.6 * k; c.setLineDash([3 * k, 1.6 * k]); c.beginPath();
    for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, rr = R0 * (1 + 0.1 * Math.sin(a * 9)); i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
    c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4, tx = x + Math.cos(a) * R0 * 1.3, ty = y + Math.sin(a) * R0 * 1.3 * 0.8, h = 3.2 * k; c.fillStyle = i % 2 ? "rgba(236,226,200,0.95)" : Sg.color; c.strokeStyle = "rgba(60,40,20,0.85)"; c.lineWidth = 0.8 * k; c.beginPath(); c.moveTo(tx - h, ty + h * 0.6); c.lineTo(tx, ty - h); c.lineTo(tx + h, ty + h * 0.6); c.closePath(); c.fill(); c.stroke(); }
    c.restore();
  }
  marchView = { S, ox: view.ox, oy: view.oy, z: view.z, u: armyU(k) };
  if (lastArmyOf !== C) { lastArmyOf = C; lastArmyAt = {}; marchAnims = []; }
  const army = (p, id, n, mine, go, act = true, key = id) => {
    // (an army somewhere new since it was last drawn — marched there on your order, or the enemy's at the year's end:
    //  its mark seen going there, drawn over the map on its way — see marchLoop — and not here till it arrives)
    const now = performance.now();
    { const was = lastArmyAt[key]; if (was) { const d = Math.hypot(p.x - was.x, p.y - was.y); if (d > 0.4 && d < 220) { marchAnims = marchAnims.filter(A => A.key !== key); const sea = overSea(was, p) || landPath(grid(), was, p) === null, pts = !sea && smoothWay(landPath(grid(), was, p), false); if (!sea) marchAnims.push({ key, from: { x: was.x, y: was.y }, to: { x: p.x, y: p.y }, pts: pts && pts.length > 2 ? pts : null, id, n, mine, t0: now, dur: 1400 + Math.min(1800, d * 45) }); } }
      lastArmyAt[key] = { x: p.x, y: p.y }; }
    const [x, y0] = scr(p), y = y0 + townNudge(p, armyU(k)); if (x < -60 || y < -60 || x > cv.width + 60 || y > cv.height + 60) return;
    const u = armyU(k);
    if (go) {
      // (the road it's on: dashed to where it's going, an arrowhead there)
      const [gx, gy] = scr(go), a = Math.atan2(gy - y, gx - x);
      c.save(); c.strokeStyle = mine ? "rgba(40,28,16,0.85)" : "rgba(150,30,20,0.9)"; c.lineWidth = 2.2 * u; c.setLineDash([7 * u, 5 * u]);
      const R2 = !overSea(p, go) && smoothWay(landPath(grid(), p, go), false); c.beginPath(); c.moveTo(x, y); if (R2 && R2.length > 2) for (const q of R2.slice(1, -1)) c.lineTo(...scr(q)); c.lineTo(gx, gy); c.stroke(); c.setLineDash([]);
      c.fillStyle = c.strokeStyle; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - Math.cos(a - 0.45) * 11 * u, gy - Math.sin(a - 0.45) * 11 * u); c.lineTo(gx - Math.cos(a + 0.45) * 11 * u, gy - Math.sin(a + 0.45) * 11 * u); c.fill(); c.restore();
    }
    // (on its way here: drawn moving, over the map, till it's arrived)
    if (marchAnims.some(A => A.key === key && now - A.t0 < A.dur)) return;
    const face = go ? (() => { const [gx, gy] = scr(go); return Math.atan2(gy - y, gx - x) + Math.PI / 2; })() : 0;
    armyMark(c, x, y, face, id, n, mine, mine && act && armySel, u);
  };
  // (the other crowns at war with you, and their marches on your towns; the other player's; then yours, on top)
  // (the straits that join the great lakes, too narrow for the map's coast to show: drawn in, so a lake's ships aren't
  //  seen sailing over the land)
  { const cell = Math.max(1.5, scr({ x: 1, y: 0 })[0] - scr({ x: 0, y: 0 })[0]); c.save(); c.lineCap = "round";
    for (const [[lo0, la0], [lo1, la1]] of STRAITS) { const [x0, y0] = scr({ x: gridOf(lo0, la0)[0], y: gridOf(lo0, la0)[1] }), [x1, y1] = scr({ x: gridOf(lo1, la1)[0], y: gridOf(lo1, la1)[1] });
      c.strokeStyle = "rgba(60,48,32,0.75)"; c.lineWidth = cell * 0.9 + 1.6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = "rgb(225,221,199)"; c.lineWidth = cell * 0.9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    c.restore(); }
  // (your armies standing together fanned out a little on the screen, so each can be seen and clicked)
  // (an army standing in a town stands off to the left of it, and more armies at one place further left again: the
  //  town's name is written to its right, and an army laid over it hid it — Wien, with the Emperor's army in it)
  const inTown = (sx, sy) => CITIES.some(t => { const q = scr(cellXY(t)); return Math.abs(q[0] - sx) < 4 && Math.abs(q[1] - sy) < 4; }) ? -20 * armyU(k) / 1.6 : 0;
  armyOff = {}; foeOff = {}; { const placed = []; for (const [id, p] of [[C.ar | 0, armyPos()], ...(C.armies || []).filter(a => a.pos).map(a => [a.id, a.pos])]) { let [sx, sy] = scr(p), dx = inTown(sx, sy); while (placed.some(([px2, py2]) => Math.hypot(px2 - sx - dx, py2 - sy) < 30 * armyU(k) / 1.6)) dx -= 34 * armyU(k) / 1.6; placed.push([sx + dx, sy]); armyOff[id] = dx / (S * view.z); }
    // (and an enemy army standing on one of yours, or on another: set off to the other side, so neither hides the other)
    for (const [id, p] of foeMarks()) { let [sx, sy] = scr(p), dx = inTown(sx, sy); while (placed.some(([px2, py2]) => Math.hypot(px2 - sx - dx, py2 - sy) < 30 * armyU(k) / 1.6)) dx -= 34 * armyU(k) / 1.6; placed.push([sx + dx, sy]); foeOff[id] = dx / (S * view.z); } }
  for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !isHuman(id) && alive(g, id)) { const fp = foeArmyPos(id); if (fp) { const tg = C.foeGo && C.foeGo[id] && CITIES.find(t => t[0] === C.foeGo[id]); army({ x: fp.x + (foeOff[id] || 0), y: fp.y }, id, knowsArmy(id) ? foeArmy(id) : "?", false, tg ? cellXY(tg) : null); } }
  // (their colonial armies, over the water: at war with you, seen)
  for (const [id, c] of Object.entries(colonies())) if (atWar(id) && c.n > 0) { const tg = c.go && CITIES.find(t => t[0] === c.go); army({ x: c.pos.x + (foeOff[id + COLO] || 0), y: c.pos.y }, id, knowsArmy(id) ? c.n : "?", false, tg ? cellXY(tg) : null, true, "foe-" + id + COLO); }
  for (const id of othersAtWar()) { const fp = foeArmyPos(id); if (fp) army({ x: fp.x + (foeOff[id] || 0), y: fp.y }, id, knowsArmy(id) ? foeArmy(id) : "?", false, null); }
  if (C.mp) for (const h of humans()) if (h !== C.me) { const sl = sliceOf(h); if (sl && sl.pos) army({ x: sl.pos.x + (foeOff[h] || 0), y: sl.pos.y }, h, sl.army | 0, false, null); }
  for (const a of C.armies || []) if (a.pos && a.emb == null) army({ x: a.pos.x + (armyOff[a.id] || 0), y: a.pos.y }, C.me, C.units.filter(u => !u.at && (u.ar | 0) === a.id).length, true, a.go || null, false, C.me + "#" + a.id);
  // (an army aboard ship isn't seen marching: when it lands it's simply there, not walked over the water)
  if (C.emb == null) army(armyPos(), C.me, field().length || C.army, true, C.go || null, true, C.me + "#" + (C.ar | 0)); else delete lastArmyAt[C.me + "#" + (C.ar | 0)];
  for (const a of C.armies || []) if (a.emb != null) delete lastArmyAt[C.me + "#" + a.id];
  marchStart(cv);
  // ---- the fleets: a ship under sail, engraved, in her crown's colour, how many ships under her, and where she's bound ----
  const shipMark = (p, col, n, mine, sel, go, cargo, key) => {
    // (a fleet somewhere new since it was last drawn: seen sailing there, over the map, and drawn here once it's in)
    const now = performance.now();
    { const was = lastArmyAt[key]; if (was) { const d = Math.hypot(p.x - was.x, p.y - was.y); if (d > 0.4 && d < 400) { marchAnims = marchAnims.filter(A => A.key !== key); const sp = seaPath(grid(), was, p); if (sp || !landBetween(was, p)) marchAnims.push({ key, fleet: true, pts: sp && sp.length > 2 ? smoothWay([{ x: was.x, y: was.y }, ...sp, { x: p.x, y: p.y }], true) : null, from: { x: was.x, y: was.y }, to: { x: p.x, y: p.y }, col, n, mine, cargo, t0: now, dur: 1400 + Math.min(2200, d * 30) }); } } lastArmyAt[key] = { x: p.x, y: p.y }; }
    const [x, y] = scr(p); if (x < -60 || y < -60 || x > cv.width + 60 || y > cv.height + 60) return; const u = armyU(k);
    // (its course: by the sea, round the coasts)
    if (go) { const [gx, gy] = scr(go), P = smoothWay(seaPath(grid(), p, go), true); c.save(); c.strokeStyle = mine ? "rgba(30,50,70,0.8)" : "rgba(150,30,20,0.8)"; c.lineWidth = 1.8 * u; c.setLineDash([2 * u, 4 * u]); c.beginPath(); c.moveTo(x, y); if (P) for (const q of P) c.lineTo(...scr(q)); c.lineTo(gx, gy); c.stroke(); c.restore(); }
    if (marchAnims.some(A => A.key === key && now - A.t0 < A.dur)) return;
    fleetMark(c, x, y, col, n, mine, sel, cargo, u);
  };
  for (const [id, F] of Object.entries(C.foeFleets || {})) if (F.ships.length) shipMark(F.pos, NATIONS[id].color, F.ships.length, false, selFoeFleet === id, null, 0, "ff-" + id);
  for (const [h, f] of otherFleets()) shipMark(f.pos, NATIONS[h].color, f.ships.length, false, false, null, 0, "hf-" + h + "-" + f.id);
  for (const f of C.fleets || []) if (f.ships.length) shipMark(f.pos, NATIONS[C.me].color, f.ships.length, true, selFleet === f.id, f.go, aboardRegs(f.id), "mf-" + f.id);
  c.restore();
}
// a fleet's mark on the map: a ship under sail, engraved, in her crown's colour, and how many ships are under her
function fleetMark(c, x, y, col, n, mine, sel, cargo, u) {
    c.save(); c.translate(x, y); c.lineJoin = "round";
    c.fillStyle = "rgba(244,234,210,0.6)"; c.beginPath(); c.ellipse(0, 3 * u, 13 * u, 4.5 * u, 0, 0, 7); c.fill();
    c.strokeStyle = mine ? "#2a1c10" : "#7a2216"; c.lineWidth = 1 * u;
    c.fillStyle = "#5a3e28"; c.beginPath(); c.moveTo(-10 * u, -1 * u); c.lineTo(10 * u, -1 * u); c.quadraticCurveTo(8 * u, 4 * u, 5 * u, 4 * u); c.lineTo(-6 * u, 4 * u); c.quadraticCurveTo(-9 * u, 3 * u, -10 * u, -1 * u); c.fill(); c.stroke();
    for (const [mx, h] of [[-4, 11], [1, 13], [6, 10]]) { c.beginPath(); c.moveTo(mx * u, -1 * u); c.lineTo(mx * u, -h * u); c.stroke(); c.fillStyle = "#efe4c6"; c.beginPath(); c.moveTo((mx - 2.6) * u, (-h + 1.5) * u); c.quadraticCurveTo((mx + 0.6) * u, (-h + 4.5) * u, (mx - 2.6) * u, -3 * u); c.lineTo((mx + 2.6) * u, -3 * u); c.quadraticCurveTo((mx + 3.6) * u, (-h + 4.5) * u, (mx + 2.6) * u, (-h + 1.5) * u); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = col; c.beginPath(); c.moveTo(1 * u, -13 * u); c.lineTo(6 * u, -12 * u); c.lineTo(1 * u, -11 * u); c.closePath(); c.fill(); c.stroke();
    if (sel) { c.strokeStyle = "#c89a30"; c.lineWidth = 1.6 * u; c.setLineDash([3 * u, 2.4 * u]); c.beginPath(); c.ellipse(0, -2 * u, 16 * u, 13 * u, 0, 0, 7); c.stroke(); c.setLineDash([]); }
    c.font = `italic bold ${Math.round(9 * u)}px Georgia, serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 3 * u; const t = `${n}${cargo ? ` · ${cargo}` : ""}`; c.strokeText(t, 0, 10.5 * u); c.fillStyle = mine ? "#2a1c10" : "#7a2216"; c.fillText(t, 0, 10.5 * u);
    c.restore();
}
// an army's mark on the map, as the engravers of the day drew an army in the field (see paint), at (x, y) on the canvas
function armyMark(c, x, y, face, id, n, mine, sel, u) {
  const col = NATIONS[id].color;
    c.save(); c.translate(x, y);
    // (drawn as the engravers of the day drew an army in the field, flat on the paper: its battalions in two lines
    //  in its colour, horse on the wings, the front turned the way it marches — and the count of regiments in
    //  small italic under it, haloed against the map, no flag or box to cover the country it's in)
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
    if (sel) { c.save(); c.strokeStyle = "#c89a30"; c.lineWidth = 1.6 * u; c.setLineDash([3 * u, 2.4 * u]); c.beginPath(); c.ellipse(0, 0, 16 * u, 9 * u, face, 0, 7); c.stroke(); c.restore(); }
    const t = String(n); c.font = `italic bold ${Math.round(9.5 * u)}px ${'"IM Fell English", Georgia, serif'}`; c.textAlign = "center"; c.textBaseline = "top";
    c.lineJoin = "round"; c.strokeStyle = "rgba(244,234,210,0.92)"; c.lineWidth = 3 * u; c.strokeText(t, 0, 7 * u); c.fillStyle = ink; c.fillText(t, 0, 7 * u);
    c.restore();
}
let armySel = false, armyOff = {}, foeOff = {};
// ---- the loyalty map (L): your lands, each town's country coloured by how loyal it is ----
let loyMap = false, loyCache = null;
const LOY_COL = o => o <= -3 ? [150, 24, 18] : o === -2 ? [196, 56, 30] : o === -1 ? [222, 128, 48] : o === 0 ? [226, 200, 110] : o === 1 ? [150, 190, 90] : o === 2 ? [86, 160, 70] : [40, 120, 50];
// (each square of your land given to the nearest of your towns: its country)
function loyRegions(g) {
  const towns = citiesOfNow(g, C.me), key = towns.map(c => c[0]).join("|");
  if (loyCache && loyCache.g === g && loyCache.key === key) return loyCache;
  const pts = towns.map(ct => cellXY(ct)), own = new Int16Array(MG_W * MG_H).fill(-1);
  for (let y = 0; y < MG_H; y++) { const row = g[y]; if (!row) continue; for (let x = 0; x < MG_W; x++) { if (row[x] !== C.me) continue; let b = -1, bd = 1e9; for (let i = 0; i < pts.length; i++) { const d = (pts[i].x - x - 0.5) ** 2 + (pts[i].y - y - 0.5) ** 2; if (d < bd) { bd = d; b = i; } } own[y * MG_W + x] = b; } }
  return loyCache = { g, key, towns, own, cv: null, sig: "" };
}
// the pause menu over the campaign: back to it, the learning, the settings and controls, or away to the title (the
//  campaign is kept as it stands)
function pauseMenu() {
  const el = document.createElement("div"); el.id = "cmpPause"; el.className = "cmp-must"; $("campaign").appendChild(el);
  el.innerHTML = `<div class="cmp-mbox cmp-pausebox"><h2>Paused</h2><p class="sub">${esc(NATIONS[C.me].name)}, ${C.year}. The campaign is kept as it stands.</p>
    <nav class="menu"><button class="btn primary" data-pz="back">Back to the campaign</button><button class="btn" data-pz="tech">Learning</button><button class="btn" data-pz="settings">Settings</button><button class="btn" data-pz="how">How the campaign works</button><button class="btn" data-pz="controls">Controls</button>${C.story ? `<button class="btn" data-pz="home">Home to your settlement</button>` : `${mp ? "" : `<button class="btn" data-pz="new">Another campaign</button>`}<button class="btn" data-pz="arms">To the battles menu</button>`}<button class="btn ghost" data-pz="title">${mp ? "Leave the campaign" : "Quit to title"}</button></nav></div>`;
  el.onclick = e => {
    const b = e.target.closest("[data-pz]"); if (!b) { if (e.target === el) el.remove(); return; }
    const w = b.dataset.pz; el.remove(); sfx("quill", 0.2);
    if (w === "tech") $("cmpTechB").click();
    else if (w === "how") howTo();
    else if (w === "new") { if (!mp) drawPick(); }
    else if (w === "arms") $("cmpBack").click();
    else if (w === "home") storyLeave();
    else if (w === "settings" || w === "controls") G.openFrom && G.openFrom("campaign", w);
    else if (w === "title") { persist(); if (mp) leaveMp(); G.toTitle && G.toTitle(); }
  };
}
// (how the campaign works: its own page over the map, from the ? button or the menu)
let howHtml = "";
function howTo() {
  if (!howHtml) { const s0 = selCity, a0 = armySel; selCity = null; armySel = false; drawMap(); selCity = s0; armySel = a0; drawMap(); }
  const el = document.createElement("div"); el.id = "cmpHow"; el.className = "cmp-must"; $("campaign").appendChild(el);
  el.innerHTML = `<div class="cmp-mbox cmp-howbox"><h2>How the campaign works</h2>${howHtml}<div class="pv-acts"><button class="btn primary" data-hx="1">Back to the map</button></div></div>`;
  el.onclick = e => { if (e.target === el || e.target.closest("[data-hx]")) el.remove(); };
}
function toggleLoy() { loyMap = !loyMap; if (loyMap && on3d) leave3d(); note = loyMap ? "The loyalty map: each of your towns' country coloured by its loyalty. Click one to see why, and to set its taxes. L to close." : ""; sfx("quill", 0.25); drawMap(); }
function loyTownAt(mx, my) { if (!loyMap || !C) return null; const g = grid(), R2 = loyRegions(g), S = $("cmpMap").width / MG_W, x = Math.floor(mx / S), y = Math.floor(my / S); if (x < 0 || y < 0 || x >= MG_W || y >= MG_H) return null; const i = R2.own[y * MG_W + x]; return i >= 0 ? R2.towns[i] : null; }
function paintLoyalty(c, g, S, k, at) {
  const R2 = loyRegions(g), vals = R2.towns.map(ct => orderOf(ct)), sig = vals.join(",") + "|" + (selCity ? selCity[0] : "");
  if (!R2.cv || R2.sig !== sig) {
    const cv2 = R2.cv || (R2.cv = document.createElement("canvas")); cv2.width = MG_W; cv2.height = MG_H; const x2 = cv2.getContext("2d"), im = x2.createImageData(MG_W, MG_H), d = im.data, si = selCity ? R2.towns.findIndex(t => t[0] === selCity[0]) : -1;
    for (let y = 0; y < MG_H; y++) for (let x = 0; x < MG_W; x++) {
      const j = y * MG_W + x, i = R2.own[j]; if (i < 0) continue; const col = LOY_COL(vals[i]);
      // (the edges between towns' countries drawn darker; the chosen town's lighter)
      // (a line only where one of your towns' countries meets another's — the coasts and frontiers are the map's own ink)
      const other = k => k >= 0 && k !== i, edge = (x + 1 < MG_W && other(R2.own[j + 1])) || (y + 1 < MG_H && other(R2.own[j + MG_W]));
      const m = edge ? 0.62 : i === si ? 1.12 : 1; d[j * 4] = Math.min(255, col[0] * m + 40); d[j * 4 + 1] = Math.min(255, col[1] * m + 40); d[j * 4 + 2] = Math.min(255, col[2] * m + 40); d[j * 4 + 3] = edge ? 220 : i === si ? 230 : 200;
    }
    x2.putImageData(im, 0, 0); R2.sig = sig;
  }
  c.save(); c.imageSmoothingEnabled = false; c.globalCompositeOperation = "multiply"; c.drawImage(R2.cv, -view.ox * view.z, -view.oy * view.z, MG_W * S * view.z, MG_H * S * view.z); c.restore();
  // (each town's loyalty, in a little plate under its dot)
  c.save(); c.font = `600 ${Math.round(11 * k)}px Georgia, serif`; c.textAlign = "center"; c.textBaseline = "middle";
  R2.towns.forEach((ct, i) => { const [x, y] = at(ct), o = vals[i], t = (o > 0 ? "+" : "") + o, w = c.measureText(t).width + 9 * k; c.fillStyle = "rgba(24,18,12,0.82)"; c.beginPath(); c.roundRect(x - w / 2, y + 7 * k, w, 15 * k, 4 * k); c.fill(); const col = LOY_COL(o); c.fillStyle = `rgb(${Math.min(255, col[0] + 60)},${Math.min(255, col[1] + 60)},${Math.min(255, col[2] + 60)})`; c.fillText(t, x, y + 14.5 * k); });
  // (the key, bottom left)
  // (in the screen's own pixels: clear of the zoom buttons, whatever the window's size)
  k = c.canvas.width / Math.max(1, c.canvas.getBoundingClientRect().width);
  const L = [-3, -2, -1, 0, 1, 2, 3].map(o => [o, orderWord(o) + (o < 0 ? ", may riot" : "")]), bw = 222 * k, bh = (30 + L.length * 15) * k, bx = 50 * k, by = c.canvas.height - bh - 12 * k;
  c.fillStyle = "rgba(24,18,12,0.86)"; c.beginPath(); c.roundRect(bx, by, bw, bh, 5 * k); c.fill(); c.textAlign = "left"; c.fillStyle = "#efe4c6"; c.font = `600 ${Math.round(12 * k)}px Georgia, serif`; c.fillText("Loyalty · L to close", bx + 9 * k, by + 13 * k);
  c.font = `${Math.round(11 * k)}px Georgia, serif`; L.forEach(([o, n], i) => { const col = LOY_COL(o), yy = by + (30 + i * 15) * k; c.fillStyle = `rgb(${col})`; c.fillRect(bx + 9 * k, yy - 5 * k, 14 * k, 10 * k); c.fillStyle = "#e6d9b8"; c.fillText(`${o > 0 ? "+" : ""}${o}${o === -3 ? " or less" : o === 3 ? " or more" : ""} · ${n}`, bx + 30 * k, yy); });
  c.restore();
}
// ---- an army on the march, seen marching: a file of its men stepping out along its road, drawn over the map on a
//  canvas of their own (the map itself is too much to draw again every frame) — while the 2D map is up ----
let marchRaf = 0, marchCv = null, marchView = null, marchAnims = [], lastArmyAt = {}, lastArmyOf = null;
function marchStart(cv) {
  if (!marchCv) { marchCv = document.createElement("canvas"); marchCv.id = "cmpMarch"; marchCv.style.pointerEvents = "none"; cv.parentElement.appendChild(marchCv); }
  if (marchCv.width !== cv.width || marchCv.height !== cv.height) { marchCv.width = cv.width; marchCv.height = cv.height; }
  marchCv.style.width = cv.style.width; marchCv.style.height = cv.style.height;
  if (!marchRaf) marchRaf = requestAnimationFrame(marchLoop);
}
function marchLoop(now) {
  marchRaf = 0; if (!marchCv) return;
  const c = marchCv.getContext("2d"); c.clearRect(0, 0, marchCv.width, marchCv.height);
  // (a march just ended: the map drawn again, with the army where it now stands)
  // (a march just ended: its mark left standing on the overlay where it stopped — no redrawing of the whole map for it;
  //  the map takes it over the next time it's drawn)
  const moving = marchAnims.some(A => now - A.t0 < A.dur);
  const live = C && !on3d && marchAnims.length && $("cmpMap") && $("cmpMap").offsetParent && !document.hidden;
  marchCv.style.display = live ? "" : "none";
  if (!live || !marchView) return;
  // (an army on its way: its own mark drawn going from where it was to where it's bound, turned the way it goes —
  //  starting off and drawing up gently)
  const V = marchView, sc = (p, nudge) => [(p.x * V.S - V.ox) * V.z, (p.y * V.S - V.oy) * V.z + (nudge ? townNudge(p, V.u) : 0)];
  for (const A of marchAnims) {
    const [fx, fy] = sc(A.from, !A.fleet), [tx, ty] = sc(A.to, !A.fleet), q = Math.min(1, (now - A.t0) / A.dur), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
    // (by its road, round the water — or, for a ship, round the land)
    if (A.pts) {
      const q2 = alongPts(A.pts, e), ah = alongPts(A.pts, Math.min(1, e + 0.035)), [qx, qy] = sc(q2, !A.fleet), want = e < 0.999 ? Math.atan2(ah.y - q2.y, ah.x - q2.x) : A.face ?? q2.a;
      A.face = A.face == null ? want : A.face + Math.atan2(Math.sin(want - A.face), Math.cos(want - A.face)) * 0.18;
      if (A.fleet) fleetMark(c, qx, qy, A.col, A.n, A.mine, false, A.cargo, V.u); else armyMark(c, qx, qy, A.face + Math.PI / 2, A.id, A.n, A.mine, false, V.u); continue;
    }
    if (A.fleet) fleetMark(c, fx + (tx - fx) * e, fy + (ty - fy) * e, A.col, A.n, A.mine, false, A.cargo, V.u);
    else armyMark(c, fx + (tx - fx) * e, fy + (ty - fy) * e, Math.atan2(ty - fy, tx - fx) + Math.PI / 2, A.id, A.n, A.mine, false, V.u);
  }
  if (moving) marchRaf = requestAnimationFrame(marchLoop);
}
// (the other armies on the map, where they stand: the crowns at war with you, and the other player)
const foeMarks = () => { const g = grid(), out = []; for (const id of Object.keys(C.E.war)) if (C.E.war[id] && !isHuman(id) && alive(g, id)) { const fp = foeArmyPos(id); if (fp) out.push([id, fp]); } for (const id of othersAtWar()) { const fp = foeArmyPos(id); if (fp) out.push([id, fp]); } for (const [id, c] of Object.entries(colonies())) if (atWar(id) && c.n > 0) out.push([id + COLO, c.pos]); if (C.mp) for (const h of humans()) if (h !== C.me) { const sl = sliceOf(h); if (sl && sl.pos) out.push([h, sl.pos]); } return out; };
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
// (the town under a point on the screen, and whether the point is right on its dot)
const toMapPt = (cv, [x, y]) => [view.ox + x / view.z, view.oy + y / view.z];
// (the nearest town within an army mark's reach of the point, for the click that goes through it)
function dotAt(cv, px) {
  const p = toMapPt(cv, px), S = cv.width / MG_W, k = cv.width / 1300; let ct = null, bd = 30 * k;
  for (const c of CITIES) { const [gx, gy] = gridOf(c[1], c[2]), d = Math.hypot(gx * S - p[0], gy * S - p[1]) * view.z; if (d < bd) { bd = d; ct = c; } }
  return { ct, on: !!ct && bd < 7 * k };
}
function foeHit(cv, px, py) {
  if (!C) return null; const S = cv.width / MG_W, u = armyU(cv.width / 1300), g = grid();
  for (const id of Object.keys(C.E.war)) {
    if (!C.E.war[id] || !alive(g, id)) continue; const p0 = isHuman(id) ? (sliceOf(id) || {}).pos : foeArmyPos(id); if (!p0 || !isFinite(p0.x)) continue; const p = { x: p0.x + (foeOff[id] || 0), y: p0.y };
    const x = (p.x * S - view.ox) * view.z, y = (p.y * S - view.oy) * view.z + townNudge(p, u); if (Math.hypot(px - x, py - y - 3 * u) < 16 * u) return id;
  }
  for (const [id, c] of Object.entries(colonies())) { if (!atWar(id) || !(c.n > 0)) continue; const p = { x: c.pos.x + (foeOff[id + COLO] || 0), y: c.pos.y }, x = (p.x * S - view.ox) * view.z, y = (p.y * S - view.oy) * view.z + townNudge(p, u); if (Math.hypot(px - x, py - y - 3 * u) < 16 * u) return id + COLO; }
  return null;
}
// (the other crowns' armies at war with each other, not with you: pointed at, they're said, and clicked, their crown)
function warHit(cv, px, py) {
  if (!C) return null; const S = cv.width / MG_W, u = armyU(cv.width / 1300);
  for (const id of othersAtWar()) { const p0 = foeArmyPos(id); if (!p0 || !isFinite(p0.x)) continue; const p = { x: p0.x + (foeOff[id] || 0), y: p0.y }, x = (p.x * S - view.ox) * view.z, y = (p.y * S - view.oy) * view.z + townNudge(p, u); if (Math.hypot(px - x, py - y - 3 * u) < 16 * u) return id; }
  return null;
}
// (a battlefield of the year's wars, pointed at on the parchment: where its crossed swords are drawn)
function fieldHit(cv, px, py) {
  if (!C || !C.E.fought) return null; const S = cv.width / MG_W, k = armyU(cv.width / 1300);
  for (const f of C.E.fought) { const x = (f.x * S - view.ox) * view.z, y = (f.y * S - view.oy) * view.z - 6 * k; if (Math.hypot(px - x, py - y) < 9 * k) return f; }
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
// ---- a new player's first year: what to do, a step at a time, each ticked off as it's done — once, over all their
//  campaigns (one who played before it came never sees it), and put away when they like ----
const FIRSTKEY = "reckoning.campaign.first";
let first = (() => { try { const f = JSON.parse(localStorage.getItem(FIRSTKEY)); if (f) return f; return localStorage.getItem(TIPKEY) ? { off: 1 } : {}; } catch (e) { return { off: 1 }; } })();
const firstSave = () => { try { localStorage.setItem(FIRSTKEY, JSON.stringify(first)); } catch (e) {} };
const firstDid = k => { if (first[k] || first.off) return; first[k] = 1; firstSave(); };
const FIRST = [
  ["army", "Choose your army", "Click its men on the map."],
  ["march", "Send it on its way", "Right-click a town, or the ground, in its reach."],
  ["recruit", "Raise regiments", "Click one of your towns, or open Your towns below."],
  ["learn", "Set your scholars to work", "Learning, at the top."],
  ["year", "End the year", "The red button. The world moves on, and its news comes to you."],
];
function firstCard() {
  if (!C || C.mp || C.over || first.off || FIRST.every(([k]) => first[k])) return "";
  const n = FIRST.filter(([k]) => first[k]).length;
  return `<div class="cmp-card cmp-first"><div class="cmp-first-h"><b>${C.year > 1683 ? "Getting started" : "Your first year"}</b><small>${n} of ${FIRST.length}</small></div><ol>${FIRST.map(([k, t, d]) => `<li class="${first[k] ? "done" : ""}"><b>${t}</b><small>${d}</small></li>`).join("")}</ol><button class="tm-lnk" data-firstoff="1">Put this away</button></div>`;
}
function newsTip() { if (firstCard()) return; try { if (localStorage.getItem(TIPKEY)) return; localStorage.setItem(TIPKEY, "1"); } catch (e) { return; } if (!note) note = "How the campaign works: every town has its people, and regiments are raised in your towns, a kind at a time: choose a town to recruit, or use Your towns. Leave regiments to hold a town, form new armies from garrisons, and click an enemy army to fight it in the field. The ? at the top explains the rest."; }
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
    <span><small>Year</small><b>${C.year}</b></span><span title="${esc(`${net >= 0 ? `Profit a year: +${net} thalers.` : `A loss of ${-net} thalers a year.`} In: ${income(g)} from your towns at ${TAX[C.tax ?? 1].n.toLowerCase()} taxes, and trade. Out: ${upkeep()} on the upkeep of ${(C.units || []).length} regiments${shipUp() ? " and the fleet" : ""}. What you spend on raising, building and the rest comes out as you spend it.`)}"><small>Treasury</small><b>${C.gold}</b> <em class="${net >= 0 ? "up" : "down"}">${net >= 0 ? `+${net} profit a year` : `−${-net} a year, a loss`}</em></span>
    <span><small>${(C.armies || []).length ? `Armies · ${armyIds().length}` : "Army"}</small><b>${allField().length}</b> regiments${(C.units || []).some(u => u.at) ? ` <em title="Regiments in your towns' garrisons">+${C.units.filter(u => u.at).length}</em>` : ""}</span><span><small>People</small><b>${fmtN(citiesOfNow(g, C.me).reduce((t, ct) => t + popOf(ct), 0))}</b></span><span><small>Towns</small><b>${n}</b> of ${(goalOf() || {}).n || WIN_CITIES}</span><span class="cmp-wars" title="${esc(wars.length ? wars.map(id => NATIONS[id].name).join(", ") : "")}"><small>At war with</small><b>${wars.length ? wars.slice(0, 2).map(id => esc(NATIONS[id].name)).join(", ") + (wars.length > 2 ? ` +${wars.length - 2} more` : "") : "nobody"}</b></span>${C.mp ? (() => { const o = humans().find(h => h !== C.me), ready = C.mp.ready[o]; return `<span class="cmp-mate"><small>${esc(nameOf(o))}</small><b><i style="background:${NATIONS[o].color}"></i>${esc(NATIONS[o].name)}</b><em class="${ready ? "up" : ""}">${mp && mp.gone ? "has left" : ready ? "ready to end the year" : "playing their year"}</em></span>`; })() : ""}`;
  const open = C.events.filter(e => !e.done).length, mine = C.mp && C.mp.ready[C.me], other = C.mp && humans().find(h => h !== C.me);
  $("cmpEnd").disabled = !!C.over || open > 0 || !!(mp && mp.gone); $("cmpEnd").textContent = C.over ? "The campaign is over" : open ? "Answer what's waiting first" : mine ? `Waiting for ${nameOf(other)}…` : "End the year";
  $("cmpEnd").classList.toggle("waiting", !!mine); $("cmpNew").classList.add("hidden");
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
  return `<div class="cmp-man">${face(m)}<div><b>${esc(m.name)}</b>${m.hist ? `<em class="cmp-hist">Historical</em>` : ""}<small>${esc(m.d)}</small>${statsOf(m)}<small class="cmp-yrs">${m.served | 0} of ${lifeOf(m)} years' service${m.wins ? ` · ${m.wins} victor${m.wins > 1 ? "ies" : "y"}` : ""}</small>${(m.tr || []).length ? `<span class="cmp-traits">${m.tr.map(t => TRAITS[t] ? `<i class="${TRAITS[t].bad ? "bad" : ""}" title="${esc(TRAITS[t].d)}">${esc(TRAITS[t].n)}</i>` : "").join("")}</span>` : ""}${extra}</div></div>`;
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
  const room = fleetCap(f), aboard = aboardOf(f.id), regs = aboardRegs(f.id), canEmb = !whyNotEmbark(f);
  const fights = Object.keys(C.foeFleets || {}).filter(id => canSeaFight(f.id, id));
  return `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[C.me].color}"></i><b>${esc(fleetName(f))}</b><small>${f.ships.length} ship${f.ships.length > 1 ? "s" : ""} · ${f.go ? "under sail" : f.moved ? "sailed this year" : "ready to sail"} · off ${esc(nearTown(f.pos)[0])}</small></div>
    ${shipRoll(f.ships)}
    <p class="cmp-pop">Carries ${room} regiments${regs ? `: ${regs} aboard (${aboard.map(id => (C.armies || []).length ? armyName(id).toLowerCase() : "your army").join(", ")})` : ", none aboard"}.</p>
    <div class="cmp-acts">${C.emb === f.id ? "" : (w => `<button class="btn" data-embark="${f.id}"${w ? ` disabled title="${esc(w)}"` : ""}>Take ${(C.armies || []).length ? `the ${esc(armyName(C.ar | 0).toLowerCase())}` : "your army"} aboard</button>${w && C.emb == null ? `<small class="cmp-fine">${esc(w)}</small>` : ""}`)(whyNotEmbark(f))}${C.emb === f.id ? `<button class="btn" data-land="1">Land ${(C.armies || []).length ? `the ${esc(armyName(C.ar | 0).toLowerCase())}` : "the army"}</button>` : ""}
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
  if (here && Object.keys(fk).length) h += `<div class="cmp-gar leave"><small>Leave in ${esc(n)}:</small>${Object.entries(fk).map(([k, c]) => `<button class="cmp-rmini" data-station="${k}" title="Leave a regiment of ${esc(TROOPS[k].name.toLowerCase())} to hold ${esc(n)} (${c} in the army)">${unitImg(k)}</button>`).join("")}${field().length > 1 ? `<button class="tm-lnk" data-station="*" title="Every regiment of this army goes into ${esc(n)}'s garrison">The whole army</button>` : ""}</div>`;
  else if (G.length && !here) h += `<small class="cmp-fine">Bring an army here to take them into it.</small>`;
  if (G.length && armyIds().length && field().length + (C.armies || []).length) h += `<div class="cmp-gar send"><small>Send to:</small>${armyIds().filter(id => (C.units || []).some(u => !u.at && (u.ar | 0) === id)).map(id => `<button class="tm-lnk" data-sendgar="${id}" title="March ${esc(n)}'s garrison out to the ${esc(armyName(id).toLowerCase())}, and join it when it gets there">${esc(armyName(id))}</button>`).join("")}</div>`;
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
  let h = `<p>Yours. Garrison ${garrison(ct)}; worth ${worth(ct)} thalers a year. ${wl ? CHAINS.walls.levels[wl].n + "." : last ? "No walls, but it's your last town: its people will hold it to the end." : "No walls."}</p><p class="cmp-pop">${popLine(ct)}</p>${(h => h ? `<p class="cmp-pop">${onLake(grid(), h) ? "A port on the Great Lakes: its ships sail the lakes, never out to the sea." : "A port, on the sea."}</p>` : "")(harbourOf(ct))}${loyaltyHtml(ct)}` + garHtml(ct) + recruitHtml(ct) + dockHtml(ct);
  { const k = goodOf(ct), b = blockader(ct); h = h.replace(`<div class="cmp-loyal">`, () => `<div class="cmp-tgood">${goodImg(k)}<span><b>${esc(GOODS[k].n)}</b><small>${b ? `<em class="down">Blockaded by ${esc(poss(the(b)))} fleet: none of it gets out</em>` : `${GOODS[k].v} thalers a year in trade`}</small></span></div><div class="cmp-loyal">`); }
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
// diplomacy: every crown you know of, how it stands with you — at war, allied, bound by a pact or a truce, its regard
// for you — and its own wars; one clicked is chosen on the map, its card beside it to deal with
function drawDiplo() {
  let el = $("cmpDip");
  if (!el) { el = document.createElement("div"); el.id = "cmpDip"; el.className = "cmp-must"; $("campaign").appendChild(el);
    el.onclick = e => { const b = e.target.closest("[data-dipc]"); if (!b) { if (e.target === el || e.target.closest("[data-dipx]")) el.remove(); return; } el.remove(); sel = b.dataset.dipc; selCity = null; selFoe = null; armySel = false; note = ""; drawMap(); sfx("parchment", 0.28); $("cmpSide").scrollTop = 0; }; }
  const g = grid(), r = C.E.rel, ids = Object.keys(NATIONS).filter(id => id !== C.me && alive(g, id));
  const towns = id => citiesOfNow(g, id).length;
  const theirWars = id => (C.E.wars || []).filter(w => !w.withYou && (w.a === id || w.b === id)).map(w => w.a === id ? w.b : w.a).filter(o => o !== C.me && NATIONS[o]);
  const chips = id => {
    const out = [];
    if (atWar(id)) out.push(["war", `At war${C.warT && C.warT[id] ? ` · ${C.warT[id]} yr` : ""}`]);
    if (isVassal(id)) out.push(["ally", "Your protectorate"]); else if (C.ally[id]) out.push(["ally", "Ally"]);
    if (C.E.pact[id]) out.push(["pact", "Trade pact"]);
    if ((C.truce[id] || 0) > 0) out.push(["truce", `Truce · ${C.truce[id]}`]);
    if (C.E.access && C.E.access[id]) out.push(["pact", "You may cross their land"]);
    if (C.E.grant && C.E.grant[id] === true) out.push(["pact", "They may cross yours"]);
    // (the towns you've taken from their fellows in the faith: they remember it)
    if (!atWar(id) && !isHuman(id)) { const f = NATION_FAITH[id], n = f && f !== "native" ? Object.keys(C.took || {}).filter(x => x !== id && NATION_FAITH[x] === f).reduce((t, x) => t + C.took[x], 0) : 0; if (n) out.push(["truce", `Wary: ${n} ${FAITH_WORD[f]} town${n > 1 ? "s" : ""} taken`]); }
    if (isHuman(id)) out.push(["human", "A player"]);
    return out.map(([k, t]) => `<i class="dp-chip ${k}">${esc(t)}</i>`).join("");
  };
  const row = id => { const v = Math.round(r[id] ?? 0), w = theirWars(id);
    return `<button class="dp-row" data-dipc="${id}"><span class="dp-sw" style="background:${esc(NATIONS[id].color || "#888")}"></span><span class="dp-name"><b>${esc(NATIONS[id].name)}</b><small>${towns(id)} town${towns(id) === 1 ? "" : "s"}${knowsArmy(id) && C.foes && C.foes[id] != null ? ` · some ${C.foes[id]} regiments` : ""}${w.length ? ` · at war with ${w.slice(0, 3).map(o => esc(NATIONS[o].name)).join(", ")}${w.length > 3 ? "…" : ""}` : ""}</small></span><span class="dp-chips">${chips(id)}</span><span class="dp-rel" title="How they regard you: ${v}"><u style="left:${50 + Math.max(-50, Math.min(50, v / 2))}%"></u><small>${esc(relWord(v))}</small></span></button>`; };
  const groups = [
    ["At war with you", ids.filter(id => atWar(id))],
    ["Allies and protectorates", ids.filter(id => !atWar(id) && (C.ally[id] || isVassal(id)))],
    ["Bound by a pact or a truce", ids.filter(id => !atWar(id) && !C.ally[id] && !isVassal(id) && (C.E.pact[id] || (C.truce[id] || 0) > 0))],
    ["The other crowns", ids.filter(id => !atWar(id) && !C.ally[id] && !isVassal(id) && !C.E.pact[id] && !((C.truce[id] || 0) > 0))],
  ].filter(([, L]) => L.length);
  for (const [, L] of groups) L.sort((a, b) => (r[b] ?? 0) - (r[a] ?? 0));
  el.innerHTML = `<div class="cmp-mbox cmp-dipbox"><h2>Diplomacy</h2><p class="sub">Every crown, and how it stands with you. Click one to deal with it.</p>
    ${groups.map(([h, L]) => `<section class="dp-sec"><h3>${esc(h)} <small>${L.length}</small></h3>${L.map(row).join("")}</section>`).join("")}
    <div class="pv-acts"><button class="btn" data-dipx="1">Close</button></div></div>`;
}
// learning: the four branches, what's known, what's being studied, what can be
function drawTech() {
  let el = $("cmpTech"); if (!el) { el = document.createElement("div"); el.id = "cmpTech"; el.className = "cmp-must"; $("campaign").appendChild(el); el.onclick = e => { const b = e.target.closest("[data-study],[data-techx]"); if (!b) { if (e.target === el) el.remove(); return; } if (b.dataset.techx) { el.remove(); return; } doAct({ k: "study", id: b.dataset.study }); drawTech(); }; }
  const T = C.tech, rp = research(grid()); T.pts = Math.round(T.pts * 10) / 10;
  el.innerHTML = `<div class="cmp-mbox cmp-techbox"><h2>Learning</h2><p class="sub">${T.cur ? (() => { const left = Math.max(1, Math.ceil((techCost(T.cur) - T.pts) / Math.max(0.1, rp)), techYears(T.cur) - (T.yrs | 0)); return `Your scholars study <b>${esc(TECHS[T.cur].n)}</b>: ${T.pts} of ${techCost(T.cur)}, in its ${["first", "second", "third", "fourth", "fifth", "sixth"][Math.min(5, T.yrs | 0)]} year — about ${left} more year${left > 1 ? "s" : ""}.`; })() : "Choose what your scholars study next. Each learning takes years: two at the least, more the deeper it goes."} ${rp} a year from your schools and colleges.</p>
    <div class="cmp-tree">${BRANCHES.map(([br, nm]) => `<div class="cmp-br"><div class="cmp-brh">${nm}</div>${Object.entries(TECHS).filter(([id, t]) => t.br === br && techFor(id)).map(([id, t]) => { const done = T.done[id], can = canStudy(T.done, id), cur = T.cur === id;
      return `<button class="cmp-tech${done ? " done" : cur ? " cur" : can ? " can" : " lock"}" data-study="${id}"${done || !can ? " disabled" : ""}><b>${esc(t.n)}</b><small>${esc(t.d)}</small><em>${done ? "Known" : cur ? `Studying · ${T.pts}/${techCost(id)}` : can ? `${techCost(id)} to learn · ${techYears(id)} years at the least` : `After ${(t.req || []).map(r => TECHS[r].n).join(", ")}`}</em></button>`; }).join("")}</div>`).join("")}</div>
    <div class="pv-acts"><button class="btn" data-techx="1">Close</button></div></div>`;
}
// ---- the side panel's cards folded down to a line when you don't need them (kept as you leave them) ----
const FOLDKEY = "reckoning.campaign.folds";
let folds = (() => { try { return JSON.parse(localStorage.getItem(FOLDKEY)) || {}; } catch (e) { return {}; } })();
const fold = (key, head, body, open0 = false) => `<details class="cmp-card cmp-fold" data-fold="${key}"${(folds[key] ?? open0) ? " open" : ""}><summary>${head}</summary>${body}</details>`;
function drawSide() {
  const g = grid(), el = $("cmpSide"), r = C.E.rel;
  let h = "";
  // (scholars with nothing to study: a year's learning going to waste — said where it can't be missed, under what's
  //  waiting for your word)
  const idle = (!C.mp && !C.over && C.tech && !C.tech.cur && Object.keys(TECHS).some(id => canStudy(C.tech.done, id) && techFor(id))) ? `<div class="cmp-card cmp-idle"><span><b>Your scholars have nothing to study</b><small>Their learning goes to waste until you choose something.</small></span><button class="btn" data-learnb="1">Learning</button></div>` : "";
  if (C.exile != null && !C.over) { const left = 3 - (C.year - C.exile); h += `<div class="cmp-card cmp-exile"><b>Without a town</b><small>Your last town has fallen. Take one back with your army within ${left} year${left === 1 ? "" : "s"}, or the crown is lost.</small></div>`; }
  if (C.over) h += `<div class="cmp-over"><b>Your crown is lost.</b> Every town has fallen. <button class="btn" data-act="newgame">Begin again</button></div>`;
  else if (C.won) h += `<div class="cmp-won"><b>Yours is the first crown of the world.</b> ${citiesOfNow(g, C.me).length} towns under your crown.</div>`;
  // what's waiting for your word: towns attacked, peace offered
  for (const [i, e] of C.events.entries()) {
    if (e.done) continue;
    if (e.kind === "appoint") { h += `<div class="cmp-ev"><b>Choose a general for ${e.ar ? `the ${esc(armyName(e.ar).toLowerCase())}` : "your army"}</b><small>One of three men put forward. He serves fifty years, if the enemy doesn't end it first.</small>${candidates(e.cands, `data-ev="${i}" data-appg`)}</div>`; continue; }
    if (e.kind === "seabattle" && e.invade) { const f = fleetById(e.fid), F = C.foeFleets && C.foeFleets[e.foe]; if (!f || !F) { e.done = true; continue; } h += `<div class="cmp-ev war"><b>${esc(poss(The(e.foe)))} fleet comes to clear the way to ${esc(e.invade)}</b><small>${F.ships.length} ships against your ${esc(fleetName(f).toLowerCase())}'s ${f.ships.length}, and an army waiting to cross behind them. Beat their fleet and the invasion fails; lose, and they land near ${esc(e.invade)}.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Fight it yourself</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to your admirals</button></span></div>`; continue; }
    if (e.kind === "seabattle") { const f = fleetById(e.fid), F = C.foeFleets && C.foeFleets[e.foe]; if (!f || !F) { e.done = true; continue; } h += `<div class="cmp-ev war"><b>${esc(poss(The(e.foe)))} fleet falls on your ${esc(fleetName(f).toLowerCase())}!</b><small>${F.ships.length} ships of war against your ${f.ships.length}${aboardRegs(f.id) ? `, with ${aboardRegs(f.id)} regiments aboard yours` : ""}. Your odds: ${Math.round(odds(gunsOf(f.ships), gunsOf(F.ships), false) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Command the fleet</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to your admirals</button></span></div>`; continue; }
    if (e.kind === "scandal") { const m = govOf_().min[e.post], title = POSTS.find(x => x[0] === e.post)[1]; h += `<div class="cmp-ev"><b>Scandal: ${esc(m.name)}</b><small>Your minister of ${title === "Treasury" ? "the Treasury" : title} has been taking money: ${e.lost} thalers gone from the treasury. Turn him out and a new man takes his place (he may be honester, or not), or keep him: he knows his work.</small><span><button class="btn primary" data-ev="${i}" data-how="sack">Turn him out</button><button class="btn" data-ev="${i}" data-how="keep">Keep him</button></span></div>`; continue; }
    if (e.kind === "revolution") { h += `<div class="cmp-ev war"><b>Revolution!</b><small>Two years of unrest across your towns, and now the people are in the streets demanding ${e.to === "republic" ? "a republic" : "a constitution"}. Grant it, and you rule as a ${GOVS[e.to].n.toLowerCase()}: ${esc(GOVS[e.to].d)} Crush it, and a quarter of your army is lost putting it down, its spirit with it.</small><span><button class="btn primary" data-ev="${i}" data-how="grant">Grant ${e.to === "republic" ? "the republic" : "a constitution"}</button><button class="btn" data-ev="${i}" data-how="crush">Crush it</button></span></div>`; continue; }
    if (e.kind === "sack") { const ct = CITIES.find(c => c[0] === e.ct); if (!ct || cityOwner(grid(), ct) !== C.me) { e.done = true; continue; } h += `<div class="cmp-ev"><b>${esc(e.ct)} is yours: what of it?</b><small>Occupy it, and its people are spared and its trade goes on. Sack it, and your soldiers carry off ${sackLoot(ct)} thalers, but a third of its people are killed or flee, and the rest hate you for it.</small><span><button class="btn primary" data-ev="${i}" data-how="occupy">Occupy</button><button class="btn" data-ev="${i}" data-how="sack">Sack it · ${sackLoot(ct)}</button></span></div>`; continue; }
    if (e.kind === "offer") { const ally = e.w === "ally"; h += `<div class="cmp-ev"><b>${esc(The(e.foe))} ${v3(e.foe, "offers")} ${ally ? "an alliance" : "a trade agreement"}</b><small>${ally ? `${esc(The(e.foe))} would stand with you in your wars, and you with ${NATIONS[e.foe].people ? "them" : "it"} in ${NATIONS[e.foe].people ? "theirs" : "its"}.` : `Their merchants and yours, each in the other's markets: more trade for both crowns.`} Refused, they'll think a little worse of you.</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Accept</button><button class="btn" data-ev="${i}" data-how="no">Decline</button></span></div>`; continue; }
    if (e.kind === "tribute") { h += `<div class="cmp-ev war"><b>${esc(The(e.foe))} ${v3(e.foe, "demands")} tribute</b><small>${e.amt} thalers, and ${NATIONS[e.foe].people ? "they" : "it"} will leave you in peace five years. Refuse, and ${NATIONS[e.foe].people ? "they" : "it"} may well make war on you: ${knowsArmy(e.foe) ? `${C.foes[e.foe] | 0} regiments against your ${allArmies()}` : "a great army, by all accounts"}.</small><span><button class="btn primary" data-ev="${i}" data-how="yes"${C.gold < e.amt ? " disabled" : ""}>Pay ${e.amt}</button><button class="btn" data-ev="${i}" data-how="no">Refuse</button></span></div>`; continue; }
    if (e.kind === "passage") { h += `<div class="cmp-ev"><b>${esc(The(e.foe))} ${v3(e.foe, "asks")} leave to cross your land</b><small>${NATIONS[e.foe].nw ? "Their war parties march" : "Its army marches"} against ${esc(the(e.vs))}, toward ${esc(e.ct)}, and the road runs through your country. Granted, the leave holds until you revoke it; refused, they'll think worse of you, and must go another way.</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Grant passage</button><button class="btn" data-ev="${i}" data-how="no">Refuse</button></span></div>`; continue; }
    if (e.kind === "rising") { const ct = CITIES.find(c => c[0] === e.ct); h += `<div class="cmp-ev war"><b>${esc(e.ct)} rises!</b><small>A second year of riots, and the town is up in arms: some ${e.att} companies of townsmen against its garrison of ${ct ? garrison(ct) : 0}.${(() => { const old = ct && peopleOf(ct); return old && old !== C.me && NATIONS[old] && alive(grid(), old) ? ` If it wins, the town goes over to ${esc(the(old))}.` : ""; })()} Put it down by force, or buy peace with concessions${ct ? ` (${worth(ct) * 2} thalers)` : ""}.</small><span><button class="btn primary" data-ev="${i}" data-how="crush">Put it down</button><button class="btn" data-ev="${i}" data-how="concede"${ct && C.gold < worth(ct) * 2 ? " disabled title=\"The treasury hasn't the money\"" : ""}>Grant concessions</button></span></div>`; continue; }
    if (e.kind === "fieldatk" && e.human) { h += `<div class="cmp-ev war"><b>${esc(nameOf(e.foe))} ${v3(e.foe, "falls")} on ${e.ar ? `your ${esc(armyName(e.ar).toLowerCase())}` : "your army"}!</b><small>${e.att} regiments of ${esc(NATIONS[e.foe].name)} against your ${e.def}, in the open near ${esc(e.ct)}. Meet them in the field yourself, the two of you in one battle, or leave it to your general.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Meet them in the field</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to your general</button></span></div>`; continue; }
    if (e.kind === "fieldatk") { h += `<div class="cmp-ev war"><b>${esc(poss(The(e.foe)))} army falls on ${e.ar ? `your ${esc(armyName(e.ar).toLowerCase())}` : "your army"}!</b><small>${e.att} regiments against your ${e.def}, in the open near ${esc(e.ct)}. Your odds: ${Math.round(odds(e.def, e.att, false) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Fight it yourself</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to your general</button></span></div>`; continue; }
    if (e.kind === "attack" && e.human) { h += `<div class="cmp-ev war"><b>${esc(nameOf(e.foe))} marches on ${esc(e.ct)}!</b><small>${e.att} regiments of ${esc(NATIONS[e.foe].name)} against your ${e.def} (${e.army === false ? `the garrison${e.walls ? ", behind its walls" : ""}: your army is too far off to come` : `garrison and army${e.walls ? ", behind its walls" : ""}`}). Meet them on the field yourself, the two of you in one battle, or leave it to the garrison and let them fight it.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Meet them on the field</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to the garrison</button></span></div>`; continue; }
    if (e.kind === "ally" || e.kind === "pact" || (e.kind === "peace" && e.human)) { h += `<div class="cmp-ev"><b>${esc(nameOf(e.foe) === NATIONS[e.foe].name ? The(e.foe) : nameOf(e.foe))} ${v3(e.foe, "proposes")} ${e.kind === "peace" ? "peace" : e.kind === "ally" ? "an alliance" : NATIONS[e.foe].nw ? "the fur trade" : "a trade pact"}</b><small>${e.kind === "peace" ? "Each side keeps what it holds." : e.kind === "ally" ? "Their wars yours, and yours theirs." : (NATIONS[e.foe].nw ? "Beaver pelts down to your posts; kettles, cloth and trade muskets up to their towns." : "Their merchants in your towns, and yours in theirs.")}</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Agree</button><button class="btn" data-ev="${i}" data-how="no">Decline</button></span></div>`; continue; }
    if (e.kind === "attack") h += `<div class="cmp-ev war"><b>${e.colo ? `${esc(poss(The(e.foe)))} colonial army marches` : `${esc(The(e.foe))} ${v3(e.foe, "marches")}`} on ${esc(e.ct)}!</b><small>${e.att} regiments${e.of > e.att && knowsArmy(e.foe) ? ` of its ${e.of}` : ""} against your ${e.def} (${e.army === false ? `the garrison${e.walls ? ", behind its walls" : ""}: your army is too far off to come` : `garrison and army${e.walls ? ", behind its walls" : ""}`}). Your odds: ${Math.round((1 - odds(e.att, e.def, e.walls)) * 100)}%.</small><span><button class="btn primary" data-ev="${i}" data-how="fight">Fight it yourself</button><button class="btn" data-ev="${i}" data-how="auto">Leave it to the garrison</button></span></div>`;
    if (e.kind === "peace") h += `<div class="cmp-ev"><b>${esc(The(e.foe))} ${v3(e.foe, "offers")} peace</b><small>${e.cede ? `If you give up ${esc(e.cede)} and its country.` : e.gold ? `And ${e.gold} thalers to have it.` : "Each side keeps what it holds."}</small><span><button class="btn primary" data-ev="${i}" data-how="yes">Make peace</button><button class="btn" data-ev="${i}" data-how="no">Fight on</button></span></div>`;
  }
  if (armySel) firstDid("army"); if (C.tech && C.tech.cur) firstDid("learn");
  h += idle + firstCard();
  if (note) h += `<div class="cmp-note">${esc(note)}</div>`;
  if (news.length) h += `<div class="cmp-news"><b>The year's news</b>${news.slice(0, 8).map(l => `<div>${esc(l.title)}${l.sub ? ` <span>${esc(l.sub)}</span>` : ""}</div>`).join("")}<button class="tm-lnk" data-act="gazette">Read the gazette</button> <button class="tm-lnk" data-act="news">Close</button></div>`;
  // the town or the crown chosen on the map
  if (selCity) {
    const own2 = cityOwner(g, selCity), mineT = own2 === C.me, reach = !mineT && own2 && inMarch(selCity), can = !mineT && own2 && atWar(own2) && reach && freeToStrike(selCity) && C.army >= 5;
    const S = siegeOf(selCity), def = own2 && !mineT ? defOf(g, selCity, own2) : 0, walls = own2 ? hasWalls(selCity, own2, g) : false, open = walls && S && S.bat >= 1;
    const pp = own2 ? null : (() => { const [x, y] = cellOf(selCity); for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const v = g[y + dy] && g[y + dy][x + dx]; if (PEOPLES[v]) return v; } return null; })();
    h += `<div class="cmp-card"><div class="cmp-h"><b>${esc(selCity[0])}</b><small>${["", "A town", "A city", "A great city"][selCity[3]]} · ${own2 ? esc(NATIONS[own2].name) : pp ? esc(PEOPLES[pp].name) : "nobody's"}</small></div>
      ${pp ? `<p>A town of ${esc(PEOPLES[pp].long)}, in their own country. It isn't any crown's to take.</p>` : ""}
      ${!mineT && own2 ? `<p class="cmp-pop">Population ${fmtN(popOf(selCity))}</p>` : ""}
      ${!mineT ? `<div class="cmp-tgood">${goodImg(goodOf(selCity))}<span><b>${esc(GOODS[goodOf(selCity)].n)}</b><small>its trade</small></span></div>` : ""}${mineT ? townCard(g, selCity) : own2 ? `<p>Held by ${garrison(selCity)} men of the garrison${own2 && !isHuman(own2) ? `, ${militia(own2, selCity)} of them townsmen under arms` : ""}, and ${the(own2)} can bring ${knowsArmy(own2) ? `some ${fieldHelp(own2, selCity)} regiments` : "an army of a size you don't know"} to it${walls ? ", behind walls" : isVillage(selCity) ? ", behind a palisade" : ""}. ${!reach ? `${overSea(armyPos(), cellXY(selCity)) ? "Your army is on the other side of the Atlantic: a year at sea." : `Your army is ${yearsTo(cellXY(selCity)) > 1 ? `${yearsTo(cellXY(selCity))} years'` : "a year's"} march away.`}` : !atWar(own2) ? `You're not at war with ${the(own2)}.` : !freeToStrike(selCity) ? whyNot(selCity) : `Your odds: ${Math.round(odds(C.army * cmdMul(C.gen) * moraleK(), def, walls && !open) * 100)}%.${walls && !open && !isHuman(own2) && C.army >= 8 && !C.siege && odds(C.army * cmdMul(C.gen) * moraleK(), def, true) < 0.4 ? " Long odds against those walls: lay siege, and starve them first." : ""}`}</p>` : ""}
      ${S ? `<div class="cmp-siege"><b>Under siege · year ${S.years}</b><span>Garrison ${S.starve >= 0.6 ? "starving" : S.starve >= 0.3 ? "on short rations" : "well fed"} (${Math.round(garrison(selCity) * (1 - S.starve))} of ${garrison(selCity)} men fit) · walls ${S.bat >= 1 ? "breached" : `${Math.round(S.bat * 100)}% battered`}</span><i><u style="width:${Math.min(100, Math.round(S.bat * 100))}%"></u></i>${!C.supplied && C.gold >= SUPPLY_COST ? `<div class="cmp-acts"><button class="btn" data-act="supply" title="Fresh men, powder and bread for the siege lines — if they get through the enemy's raiders">Send supplies · ${SUPPLY_COST} · you escort</button><button class="btn ghost" data-act="supplyauto">Supplies · escort alone</button></div>` : C.supplied ? `<small class="cmp-fine">This year's supply train has gone.</small>` : ""}</div>` : ""}
      ${can && S ? `<div class="cmp-acts"><button class="btn primary" data-act="fight">Storm · you lead</button><button class="btn" data-act="auto">Storm · generals lead</button><button class="btn ghost" data-act="lift">Lift the siege</button></div>` : can && !C.siege ? `<div class="cmp-acts"><button class="btn primary" data-act="fight">Attack · you lead</button><button class="btn" data-act="auto">Attack · generals lead</button>${walls && !isHuman(own2) && C.army >= 8 ? `<button class="btn" data-act="siege" title="Starve it out and batter its walls, a year at a time">Lay siege</button>` : ""}</div>` : C.siege && !S && !mineT && own2 ? `<p class="cmp-fine">Your army is besieging ${esc(C.siege.ct)}: lift that siege to march here.</p>` : !C.siege && !C.moved && (mineT || (own2 && !reach)) && dist2(armyPos(), cellXY(selCity)) > 1 ? `<div class="cmp-acts"><button class="btn" data-act="goto">${overSea(armyPos(), cellXY(selCity)) ? `Over the water: needs a fleet of yours` : `${mineT ? "Move your army here" : "March toward it"} · ${yearsTo(cellXY(selCity))} yr`}</button></div>` : S && C.moved ? `<div class="cmp-acts"><button class="btn ghost" data-act="lift">Lift the siege</button></div>` : ""}</div>`;
  }
  if (selFleet != null && fleetById(selFleet)) h += fleetCard(fleetById(selFleet));
  if (selFoeFleet && !selCity) h += pFleet(selFoeFleet) ? pFleetCard(selFoeFleet) : C.foeFleets && C.foeFleets[selFoeFleet] ? foeFleetCard(selFoeFleet) : "";
  if (selFoe && !selCity && C.E.war[selFoe] && NATIONS[selFoe] && isHuman(selFoe)) {
    const f = selFoe, sl = sliceOf(f) || {}, can = canFieldP(f);
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[f].color}"></i><b>${esc(poss(nameOf(f)))} army</b><small>${sl.army | 0} regiments${sl.gen ? ` · under ${esc(sl.gen.name)}` : ""}</small></div>
      <p>${can ? `Within your reach. Fall on it in the open field: your ${armyStr()} against their ${sl.army | 0}. ${nameOf(f)} chooses whether to fight it themselves, the two of you in one battle, or leave it to their general.` : C.moved ? "Your army has already marched this year." : C.siege ? "Your army is tied to its siege." : sl.pos && overSea(armyPos(), sl.pos) ? "It's on the other side of the Atlantic." : "It's beyond a year's march of your army."}</p>
      ${can ? `<div class="cmp-acts"><button class="btn primary" data-pfield="fight">Attack · you lead</button><button class="btn" data-pfield="auto">Attack · generals lead</button></div>` : ""}</div>`;
  } else if (selFoe && !selCity && isColo(selFoe) && coloOf(selFoe) && atWar(crownOf(selFoe))) {
    const f = crownOf(selFoe), c = coloOf(selFoe), can = canField(selFoe), o = can ? fieldOf(selFoe) : null;
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[f].color}"></i><b>${esc(poss(The(f)))} colonial army</b><small>${knowsArmy(f) ? `${c.n | 0} regiments` : "size unknown"}${c.go ? ` · marching on ${esc(c.go)}` : " · holding its colonies"}</small></div>
      <p class="cmp-fine">Its colonists and soldiers in the New World: the army at home can't come over to them, nor this one go home.${knowsArmy(f) ? "" : ` How many it has, a politician of ${esc(the(f))}'s in your pay would tell you (${SPY_COST} thalers).`}</p>
      <p>${can ? `Within your reach. Fall on it in the open field: ${armyStr()} against ${knowsArmy(f) ? `some ${o.def} of theirs. Your odds: ${Math.round(odds(o.att * cmdMul(C.gen) * moraleK() * (1 + vetK()), o.def, false) * 100)}%.` : "an army of a size you don't know."}` : C.moved ? "Your army has already marched this year." : C.siege ? "Your army is tied to its siege." : overSea(armyPos(), c.pos) ? "It's over the water from your army." : "It's beyond a year's march of your army."}</p>
      ${can ? `<div class="cmp-acts"><button class="btn primary" data-fieldf="fight">Attack · you lead</button><button class="btn" data-fieldf="auto">Attack · generals lead</button></div>` : ""}</div>`;
  } else if (selFoe && !selCity && C.E.war[selFoe] && NATIONS[selFoe]) {
    const f = selFoe, fp = foeArmyPos(f), tg = C.foeGo && C.foeGo[f], can = canField(f), o = can ? fieldOf(f) : null;
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[f].color}"></i><b>${esc(poss(The(f)))} army</b><small>${knowsArmy(f) ? `${C.foes[f] | 0} regiments` : `size unknown`}${tg ? ` · marching on ${esc(tg)}` : ""}</small></div>${knowsArmy(f) ? "" : `<p class="cmp-fine">How many regiments it has, nobody at your court can say. A politician of ${esc(the(f))}'s in your pay would tell you: choose their crown and corrupt one (${SPY_COST} thalers).</p>`}
      <p>${can ? `Within your reach. Fall on it in the open field, before it reaches your towns: ${(C.armies || []).length ? `your ${esc(armyName(C.ar | 0).toLowerCase())}'s` : "your army's"} ${armyStr()} ${knowsArmy(f) ? `against some ${o.def} of theirs. Your odds: ${Math.round(odds(o.att * cmdMul(C.gen) * moraleK() * (1 + vetK()), o.def * cmdMul(genOf(f)), false) * 100)}%.` : "against an army of a size you don't know, at odds you can't reckon."}` : C.moved ? "Your army has already marched this year." : C.siege ? "Your army is tied to its siege." : fp && overSea(armyPos(), fp) ? "It's on the other side of the Atlantic." : "It's beyond a year's march of your army."}</p>
      ${can ? `<div class="cmp-acts"><button class="btn primary" data-fieldf="fight">Attack · you lead</button><button class="btn" data-fieldf="auto">Attack · generals lead</button></div>` : ""}</div>`;
  }
  const id = selCity ? cityOwner(g, selCity) : sel;
  if (id && isHuman(id) && id !== C.me) {
    const did = C.did[id] || {}, war = atWar(id), tr = C.truce[id] || 0;
    h += `<div class="cmp-card"><div class="cmp-h"><i style="background:${NATIONS[id].color}"></i><b>${esc(NATIONS[id].name)}</b><small>${esc(nameOf(id))}'s crown · ${citiesOfNow(g, id).length} town${citiesOfNow(g, id).length === 1 ? "" : "s"} · army ${foeArmy(id)} · ${war ? "<em class='down'>at war with you</em>" : C.ally[id] ? "your ally" : C.E.pact[id] ? "trade pact" : "at peace"}</small></div>
      <div class="cmp-acts">${war ? `<button class="btn" data-dip="peace" ${did.peace ? "disabled" : ""}>Propose peace</button>` : `
        <button class="btn" data-dip="gift" ${did.gift || C.gold < 150 ? "disabled" : ""}>Send 150 thalers</button>
        ${C.E.pact[id] ? `<button class="btn" data-dip="unpact">End the trade pact</button>` : `<button class="btn" data-dip="pact" ${did.pact ? "disabled" : ""}>Propose a trade pact</button>`}
        ${isVassal(id) ? `<button class="btn" data-dip="release" title="Free them: still your ally, but no more tribute">Release them</button>` : C.ally[id] ? `<button class="btn" data-dip="unally">Break the alliance</button>` : `<button class="btn" data-dip="ally" ${did.ally ? "disabled" : ""}>Propose an alliance</button>`}
        <button class="btn danger" data-dip="war" ${tr ? `disabled title="A treaty: ${tr} more years"` : ""}>Declare war</button>`}</div></div>`;
  } else if (id && id !== C.me && NATIONS[id]) {
    const did = C.did[id] || {}, war = atWar(id), tr = C.truce[id] || 0;
    const head = `<span class="cmp-h"><i style="background:${NATIONS[id].color}"></i><b>${esc(NATIONS[id].name)}</b><small>${isVassal(id) ? "your protectorate · " : ""}${citiesOfNow(g, id).length} town${citiesOfNow(g, id).length === 1 ? "" : "s"} · army ${knowsArmy(id) ? C.foes[id] || 0 : `<span title="Unknown: corrupt one of their politicians to learn it">?</span>`} · ${war ? "<em class='down'>at war with you</em>" : C.ally[id] ? "your ally" : C.E.pact[id] ? "trade pact" : relWord(r[id])}${!war && !C.ally[id] && C.E.access && C.E.access[id] ? " · military access" : ""}</small></span>`;
    h += (selCity ? (b2 => fold("crown", head, b2)) : (b2 => `<div class="cmp-card">${head}${b2}</div>`))(`
      <div class="cmp-rel"><i style="left:${(r[id] + 100) / 2}%"></i><span>Their view of you: ${r[id] > 0 ? "+" : ""}${Math.round(r[id])}</span></div>
      ${(() => { const m = muster(id, 100); return `<div class="cmp-farmy">${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => { const nm = NATIONS[id].nw ? ({ axe: "War club", bow: "Bow", musketeer: "Trade musket" }[k] || TROOPS[k].name) : TROOPS[k].name; return `<span title="${esc(nm)}: about ${n}% of their army">${unitImg(k, "", id)}<small>${esc(nm)}</small></span>`; }).join("")}</div>`; })()}
      ${NATIONS[id].nw ? `<p class="cmp-help">A nation of the woods. Their towns stand behind wooden palisades, with no stone walls to besiege; a palisade can be set alight and burnt through. Their warriors fight with the bow and the war club, a few with trade muskets. They have no guns and no horse.</p>` : ""}
      ${C.foeGen && C.foeGen[id] && genOf(id) ? `<div class="cmp-foegen">${face(C.foeGen[id], "sm")}<span><b>${esc(C.foeGen[id].name)}</b><small>Their general · command ${"●".repeat(C.foeGen[id].st[0])}${"○".repeat(5 - C.foeGen[id].st[0])} · ${(C.fguns[id] | 0) ? `${C.fguns[id]} gun${C.fguns[id] > 1 ? "s" : ""}: they can besiege walled towns` : "no guns: walled towns are safe from them"}</small>${(C.foeGen[id].tr || []).length ? `<span class="cmp-traits">${C.foeGen[id].tr.map(t => TRAITS[t] ? `<i class="${TRAITS[t].bad ? "bad" : ""}" title="${esc(TRAITS[t].d)}">${esc(TRAITS[t].n)}</i>` : "").join("")}</span>` : ""}</span></div>` : ""}
      <div class="cmp-acts">${war ? `<button class="btn" data-dip="peace" ${did.peace ? "disabled" : ""}>Offer peace</button><button class="btn" data-dip="demand" ${did.peace || citiesOfNow(g, id).length < 2 ? "disabled" : ""} title="Peace, if they give up their town nearest your lands. The worse the war has gone for them, the likelier.">Demand a town for peace</button>${NATIONS[id].nw ? "" : `<button class="btn" data-dip="submit" ${did.peace || citiesOfNow(g, id).length > citiesOfNow(g, C.me).length ? "disabled" : ""} title="Peace, if they become your protectorate: tribute every year, and their armies in your wars. Only a crown no bigger than yours, and the worse the war has gone for them, the likelier.">Demand they submit</button>`}${C.spies && C.spies[id] ? "" : `<button class="btn" data-dip="bribe" ${C.gold < SPY_COST ? `disabled title="The treasury hasn't ${SPY_COST} thalers"` : `title="Buy a politician at their court: he tells you how big their army is, from now on"`}>Corrupt a politician · ${SPY_COST}</button>`}` : `${C.spies && C.spies[id] ? "" : `<button class="btn" data-dip="bribe" ${C.gold < SPY_COST ? `disabled title="The treasury hasn't ${SPY_COST} thalers"` : `title="Buy a politician at their court: he tells you how big their army is, from now on"`}>Corrupt a politician · ${SPY_COST}</button>`}
        <button class="btn" data-dip="envoy" ${did.envoy || C.gold < 40 ? "disabled" : ""}>Send an envoy · 40</button>
        <button class="btn" data-dip="gift" ${did.gift || C.gold < 150 ? "disabled" : ""}>A gift · 150</button>
        ${!NATIONS[id].nw && (C.ally[id] || C.E.pact[id]) ? (L => `<button class="btn" data-dip="learn" ${L != null && C.year - L < 5 ? `disabled title="Again in ${5 - (C.year - L)} year${5 - (C.year - L) === 1 ? "" : "s"}"` : `title="Learning points for your scholars' current study"`}>Exchange scholars</button>`)((C.learnX || {})[id]) : ""}
        ${C.E.pact[id] ? `<button class="btn" data-dip="unpact">${NATIONS[id].nw ? "End the fur trade" : "End the trade pact"}</button>` : `<button class="btn" data-dip="pact" ${r[id] < 20 ? "disabled title='They need to think well of you (20)'" : ""}>${NATIONS[id].nw ? "Trade for furs" : "Trade pact"}</button>`}
        ${isVassal(id) ? `<button class="btn" data-dip="release" title="Free them: still your ally, but no more tribute">Release them</button>` : C.ally[id] ? `<button class="btn" data-dip="unally">Break the alliance</button>` : `<button class="btn" data-dip="ally" ${r[id] < 55 || did.ally ? "disabled title='They need to be friendly (55)'" : ""}>Propose an alliance</button>`}
        ${C.E.access && C.E.access[id] ? `<button class="btn" data-dip="unaccess" title="Your armies may cross their land">Give up military access</button>` : C.ally[id] ? "" : `<button class="btn" data-dip="access" ${did.access || r[id] < -10 ? `disabled title="${did.access ? "Asked this year" : "They think too ill of you (−10)"}"` : `title="Ask leave for your armies to cross their land"`}>Ask military access</button>`}
        ${C.E.grant && C.E.grant[id] === true ? `<button class="btn" data-dip="revoke" title="Their armies may cross your land, by your leave">Revoke their passage</button>` : ""}
        ${(t => t ? `<button class="btn" data-dip="buy" ${did.buy || r[id] < 40 || C.gold < buyPrice(t) ? `disabled title="${r[id] < 40 ? "They need to think well of you (40)" : did.buy ? "Asked this year" : "The treasury hasn't the money"}"` : `title="Offer to buy ${esc(t[0])}, their town nearest your lands"`}>Buy ${esc(t[0])} · ${buyPrice(t)}</button>` : "")(NATIONS[id].nw ? null : buyable(id))}
        <button class="btn danger" data-dip="war" ${tr ? `disabled title="A treaty: ${tr} more years"` : ""}>Declare war</button>`}</div>`);
  } else if (!selCity && !armySel) howHtml = `<p class="sub"><b>Click</b> a town or a crown · <b>click your army</b>, then <b>right-click</b> to march · <b>drag</b> or WASD to move · <b>wheel</b> to zoom · <b>Esc</b> for the menu</p><ul class="cmp-howto">
      <li><b>A year a turn.</b> Your army marches once a year, about 350 km. A town can only be attacked, besieged or supplied from within a year's march of it. Right-click an enemy town within reach to attack it. An army that marches up to a town's walls can still attack it that year, once. An army that sees the year out in another crown's land in the far north, or on the eastern steppe, loses men to the winter.</li>
      <li><b>Two views.</b> Zoom in far enough and the parchment gives way to the land itself, its towns, woods, rivers and roads; zoom out to go back. Orders are the same in both: click an army or a ship to take it in hand (it's ringed in gold), then right-click where it should go, or on what it should fall on. Point at an army or a town to see what it is.</li>
      <li><b>Victory.</b> Your crown's ambition is in the Victory card: certain towns to take and hold, and so many towns in all, within sixty years. Lose your last town and you have three years to take one back with the army you still have, or the crown is lost.</li>
      <li><b>Generals.</b> They earn traits in the field and the camp: Bold, Cautious, Siege engineer, Hero of the nation, Beloved of the men, and the vices of drink and the lash. Each counts in battle. Hover one on the general's card to see what it does.</li>
      <li><b>The other crowns.</b> They come to you with trade agreements and alliances, and a strong neighbour may demand tribute: pay, or risk war. Beat a smaller crown and you can demand it submit as your protectorate: it pays you tribute every year and fights in your wars. The great powers card ranks the crowns by their towns and people.</li>
      <li><b>The wars of others.</b> The other crowns fight their own wars on the same map. Their armies march to their fronts and home again at the peace; the year's battlefields are marked with crossed swords in a dark ink, and a siege with its lines and tents round the town. Point at any of them to see whose it is and who fought whom. The gazette reports the battles that matter to you.</li>
      <li><b>Regiments are raised in towns.</b> Choose a town to recruit: musketeers anywhere, grenadiers where there's a drill yard, horse in a city or where the farms breed horses. Each regiment costs thalers and the town's men, and joins the army at the year's end, or holds its town as a garrison if the army is far off. A town raises one a year, a city two, a great city three.</li>
      <li><b>Trade.</b> Every town has its good (furs, fish, tobacco, sugar, silver, timber, iron, grain, wool, cloth, wine or silk), and each brings thalers. Trade pacts pay more for goods you don't have yourself. An enemy fleet lying off one of your ports blockades it: none of its trade gets out until you drive the fleet off.</li>
      <li><b>Government.</b> Your crown is an absolute monarchy, a constitutional monarchy or a republic, each with its strengths, and has three ministers (the Treasury, War and Justice) whose skill counts. Change one a year from the side panel. Two years of widespread unrest bring a revolution: grant what the people want, or crush it at the cost of a quarter of your army.</li>
      <li><b>Missions.</b> The Crown sets you tasks now and then, with a deadline and a reward in thalers.</li>
      <li><b>Spies.</b> You don't know how big another crown's army is. Choose the crown and corrupt one of its politicians (300 thalers): from then on its army's size shows on the map, on its card and in the news.</li>
      <li><b>Loyalty map.</b> Press L to colour each of your towns' country by its loyalty, red where it may riot, green where it's content, and to show every town's trade good. Click a country to see why, and set that town's own taxes.</li>
      <li><b>Military access.</b> Your armies cross another crown's land only with its leave: when you're at war with it, allied to it, or given access. Choose the crown and ask for it. The other crowns ask yours before they march through your land.</li>
      <li><b>Garrisons.</b> With your army at one of your towns, leave regiments there to hold it, or take its garrison into the army.</li>
      <li><b>The navy.</b> Build sloops, frigates and ships of the line in your ports' dockyards. Click a fleet, then right-click on the sea to sail it: a year's sailing crosses the Atlantic. Bring a fleet to the shore where an army stands to take it aboard, sail it, and land it anywhere. An army crosses the sea only aboard ships of your own, and enemy fleets may fall on them. Enemy fleets come for yours in war: fight the battle at sea yourself, or leave it to your admirals. Ships that strike their colours are taken as prizes. A town on the Great Lakes has a dockyard too, for sloops and frigates that sail its lake: Huron, Michigan and Erie are joined, but Ontario and Superior keep to themselves.</li>
      <li><b>Battles in the field.</b> Click an enemy army on the map, or right-click it: if your army can reach it this year, fall on it in the open before it reaches your towns. Beaten, it falls back and its march is stopped. In a campaign for two, the other player's army can be fallen on too, and they choose whether to meet you in the field themselves.</li>
      <li><b>More than one army.</b> Form a new army from a town's garrison. Click an army on the map to give it orders; each marches, besieges and fights on its own, under its own general. Right-click another of your armies to march to it and join the two into one.</li>
      <li><b>People</b> grow as the land feeds them: improve the farms for more, and keep taxes light for faster growth. Heavy taxes make towns restless, and a restless town may riot and pay nothing, and a town that riots two years running rises: put it down, or buy peace with concessions. Regiments in its garrison and a school keep order. <b>Loyalty</b>: a town you conquer is the hardest to hold — newly conquered, its people remembering their own crown (the more while you're at war with it) and praying, it may be, in another church — and each fades as the years pass under you. Its card shows every reason for and against. A conquered town that rises and wins goes back to its own crown; one of your own won back is glad of it. A town's people make its wealth, and fill the army's thin regiments each year.</li>
      <li><b>Over the sea</b> an army goes only aboard a fleet of your own: bring the fleet to its shore, embark it, sail and land. A crown's army on the far side of the Atlantic can't come to its colonies' help.</li>
      <li><b>Walled towns</b> are taken by siege (the great fortresses of the age, Vienna among them, are walled from the start): sit down before them, and the guns, hunger and sickness do their work a year at a time. Send supplies to keep your own army fed, though you'll have to fight for the convoy on the road.</li>
      <li><b>Taking a town</b> takes its whole province with it. You may let the soldiers sack it for its plunder, but its people will remember. A crown with no towns left is gone, and its land is yours.</li>
      <li><b>The woods' nations</b> raise no stone walls and have no guns. Their towns stand behind palisades: hold <kbd>F</kbd> at a length of one in battle to set it alight.</li>
      <li><b>Generals</b> serve fifty years. Their command and the army's morale decide how hard it fights. <b>Governors</b> run your towns, for a fee.</li>
      <li><b>Leagues</b> stand with their own when one is attacked, but only in wars they can reach.</li>
    </ul>`;
  // your own: the treasury's use
  reconcile();
  h += goalHtml();
  h += missionsHtml();
  h += govHtml();
  h += tradeHtml();
  h += rankHtml();
  h += fold("army", `<span class="cmp-h"><b>${(C.armies || []).length ? esc(armyName(C.ar | 0)) : "Your army"}</b><small>${field().length} regiment${field().length === 1 ? "" : "s"}${C.levyQ ? ` (+${C.levyQ} raising)` : ""}${C.units.some(u => u.at) ? ` · ${C.units.filter(u => u.at).length} in garrisons` : ""} · ${C.guns} gun${C.guns === 1 ? "" : "s"} · ${moraleWord(C.morale ?? 50).toLowerCase()} · ${C.siege ? `besieging ${esc(C.siege.ct)}` : C.go ? "on the march" : C.moved ? "marched this year" : "ready"}</small></span>`, `
    <div class="cmp-morale"><small>Morale</small><b>${moraleWord(C.morale ?? 50)}</b><i><u style="width:${C.morale ?? 50}%"></u></i><small>${C.morale ?? 50}</small></div>
    ${(C.armies || []).length ? `<div class="cmp-armies">${armyIds().map(id => { const n2 = (C.units || []).filter(u => !u.at && (u.ar | 0) === id).length, A = id === (C.ar | 0) ? C : C.armies.find(a => a.id === id) || {}, at = A.pos ? nearTown(A.pos)[0] : ""; return `<button class="btn${id === (C.ar | 0) ? " on" : ""}" data-army="${id}"${id === (C.ar | 0) ? " disabled" : ""} title="${esc(`${armyName(id)}: ${n2} regiments, near ${at}${A.gen ? `, under ${A.gen.name}` : ", no general"} · ${A.siege ? `besieging ${A.siege.ct}` : A.go ? "on the march" : A.moved ? "marched this year" : "ready"}`)}">${esc(armyName(id))} · ${n2}<small>${esc(at)}</small></button>`; }).join("")}</div>` : ""}
    ${C.gen ? manCard(C.gen) : `<div class="cmp-nogov"><span>No general leads it: it fights the worse for it.</span>${(C.ar | 0) !== armyIds()[0] ? `<button class="btn" data-askgen="1">Choose a general</button>` : ""}</div>`}
    <div class="cmp-acts">${(C.armies || []).some(a => a.pos && dist2(a.pos, armyPos()) <= 3 && !a.siege) && !C.siege ? `<button class="btn" data-join="1">Join the other army here</button>` : ""}${field().length >= 4 && !C.siege ? `<button class="btn ghost" data-split="1" title="Half of each arm marches off as an army of its own">Split the army</button>` : ""}</div>
    ${C.emb != null && fleetById(C.emb) ? `<div class="cmp-nogov"><span>Aboard the ${esc(fleetName(fleetById(C.emb)).toLowerCase())}, off ${esc(nearTown(armyPos())[0])}.</span><button class="btn" data-land="1">Land the army</button></div>` : (f => f ? `<div class="cmp-acts"><button class="btn" data-embark="${f.id}">Take it aboard the ${esc(fleetName(f).toLowerCase())}</button></div>` : "")((C.fleets || []).find(f => !whyNotEmbark(f)))}
    ${rollHtml()}
    ${(C.lq || []).length ? `<small class="cmp-fine">Raising: ${C.lq.map(q => `${esc(TROOPS[q.k].one.toLowerCase())} at ${esc(q.t)}`).join(", ")}. They join the army at the year's end, or hold their towns if it's far off.</small>` : ""}`, armySel);
  // (the taxes: three rates, the treasury against the people's growth)
  { const t = C.tax ?? 1, riot = citiesOfNow(grid(), C.me).filter(ct => orderOf(ct) < 0).length; h += `<div class="cmp-card cmp-tax"><span class="cmp-h"><b>Taxes</b><small title="${esc(t === 0 ? "Light: the towns grow faster and are content; the treasury takes three quarters" : t === 2 ? "Heavy: a quarter more for the treasury; the towns slow to grow, and restless" : "Fair: the towns' worth in full")}. Set a town's own from its card.">${riot ? `<em class="down">${riot} town${riot > 1 ? "s" : ""} may riot</em> · ` : ""}<kbd>L</kbd> loyalty map</small></span>${taxSlider("data-taxs", [0, 1, 2], t)}</div>`; }
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
  if (e.target.closest("[data-learnb]")) { $("cmpTechB").click(); return; }
  if (e.target.closest("[data-firstoff]")) { first.off = 1; firstSave(); drawMap(); return; }
  { const sc = e.target.closest("[data-selc]"); if (sc && NATIONS[sc.dataset.selc]) { sel = sc.dataset.selc; selCity = null; selFoe = null; armySel = false; note = ""; drawMap(); sfx("parchment", 0.28); $("cmpSide").scrollTop = 0; return; } }
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
  if (b.dataset.sendgar && selCity) { doAct({ k: "sendgar", t: selCity[0], id: +b.dataset.sendgar }); return; }
  if (b.dataset.form && selCity) { doAct({ k: "form", t: selCity[0] }); return; }
  if (b.dataset.join) { doAct({ k: "join" }); return; }
  if (b.dataset.split) { doAct({ k: "split" }); return; }
  if (b.dataset.askgen) { doAct({ k: "askgen" }); return; }
  if (b.dataset.ucard) { unitCard(b.dataset.ucard); return; }
  if (b.dataset.station && selCity) { doAct({ k: "station", t: selCity[0], u: b.dataset.station }); return; }
  if (b.dataset.unstation && selCity) { doAct({ k: "station", t: selCity[0], u: b.dataset.unstation, out: true }); return; }
  if (b.dataset.minr) { ministerPick(b.dataset.minr); return; }
  if (b.dataset.ttax != null && selCity) { doAct({ k: "ttax", t: selCity[0], v: +b.dataset.ttax }); return; }
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
  if (a === "gazette") { gazette(news); return; }
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
  const cv = $("cmpMap"), S = cv.width / MG_W, t = cellXY(ct); view.ox = clamp(t.x * S - cv.width / view.z / 2, 0, cv.width - cv.width / view.z); view.oy = clamp(t.y * S - cv.height / view.z / 2, 0, cv.height - cv.height / view.z);
  // (on the land in 3D: the eye goes there too, at the height it's at)
  if (on3d && eu3d) eu3d.look(ct[1], ct[2]);
  drawMap();
}
window.__cmp = { get eu3d() { return eu3d; }, enter3d: () => enter3d(), fight: o => fight(o), get armySel() { return armySel; }, set armySel(v) { armySel = !!v; }, begin: me => { begin(me); drawMap(true); }, statePaper: () => statePaper(), mpt: { meetEnd: (w, k, l) => meetEnd(w, k, l), apply: (w, a) => apply(w, a), endAll: () => endAll(), as: (c, fn) => as(c, fn), sliceOf: id => sliceOf(id), fleets3d: () => fleets3d() }, nav: { harbourOf, seaPath: (a, b) => seaPath(grid(), a, b), sailAlong, cellXY, launchShips: () => launchShips(grid()), foeNavies: () => { const ids = Object.keys(NATIONS).filter(id => id !== C.me && alive(grid(), id)); foeNavies(grid(), ids); navyHunt(grid(), ids); } }, get C() { return C; }, doAct: a => doAct(a), get view() { return { ...view, on3d, dist: eu3d && eu3d.dist }; }, dist: distFrom, endSeason, diplo, march, auto, settle, grid, citiesOfNow, garrison, defOf: (ct, foe) => defOf(grid(), ct, foe), draw: () => drawMap(), select: (name) => { selCity = CITIES.find(c => c[0] === name) || null; sel = selCity ? cityOwner(grid(), selCity) : null; drawMap(); } };

// ---------------------------------------------------------------------------
//  what you do on the campaign's map, as an act: done here, playing alone — or, a campaign of two, done on the
//  host's game (the one the campaign lives on), as whichever of you did it, and the outcome sent back
// ---------------------------------------------------------------------------
function doAct(a) {
  if (C && C.mp && mp && !mp.host) { mp.net.send({ t: "cact", a }); return; }
  const r = apply(C.me, a) || {};
  // (done, not refused: what's done is heard — a refusal is only a note)
  if (r.sfx || r.fight) { if (["move", "march", "siege", "field"].includes(a.k)) firstDid("march"); else if (a.k === "recruit") firstDid("recruit"); }
  react(r);
  // (a mission done by what was just done: the reward told at once, over the map)
  { const m = missionsCheck(false); if (m) { answer(m); sfx("coin", 0.5); drawMap(); } }
  if (C && C.mp) broadcast();
}
// (an act as a crown: what it changes, and what's to be said and heard and done about it on that player's screen)
function apply(actor, a) {
  if (!C || C.over && a.k !== "end") return null;
  return as(actor, () => {
    const g = grid(), city = n => CITIES.find(c => c[0] === n);
    if (a.k === "recruit") { const why = recruitAt(a.t, a.u); return why ? { note: why } : { sfx: [["purse", 0.45], ["drum", 0.3, 450]] }; }
    if (C.emb != null && ["move", "march", "siege", "field", "supply"].includes(a.k)) return { note: "Your army is aboard ship: land it first." };
    if (a.k === "ship") { const why = buildShip(a.t, a.u); return why ? { note: why } : { sfx: [["purse", 0.45], ["hammer", 0.35, 500], ["hammer", 0.3, 900]] }; }
    if (a.k === "unship") { unbuildShip(a.t); return { sfx: [["coin", 0.35]] }; }
    if (a.k === "fjoin") { const f = fleetById(a.id), T = fleetById(a.to); if (!f || !T) return null; const nm = fleetName(T).toLowerCase(), why = fleetJoin(a.id, a.to); if (why) return { note: why }; return fleetById(a.id) ? { note: `The ${fleetName(f).toLowerCase()} is under sail to join the ${nm}, and joins it when it gets there.`, sfx: [["bell", 0.35]] } : { note: `The two fleets sail as one: the ${nm}, ${T.ships.length} ships.`, sfx: [["bell", 0.4]] }; }
    if (a.k === "sail") { { const f = fleetById(a.id); if (f) f.joinTo = null; } W0(); const why = sail(a.id, { x: clamp(+a.x, 0, MG_W - 1), y: clamp(+a.y, 0, MG_H - 1) }); const met = C.events.find(e => !e.done && e.kind === "seabattle" && e.fid === a.id); return why ? { note: why } : met ? { note: `On the way, the fleet meets ${poss(the(met.foe))} fleet, and they close for battle. Fight it yourself, or leave it to your admirals.`, sfx: [["sail", 0.5], ["bell", 0.3, 500], ["guns", 0.5, 1300]] } : { note: (f => f && f.go ? `The fleet is under sail: more than a year's sailing, it will be there in the years after.` : "The fleet sails, and is there by the year's end.")(fleetById(a.id)), sfx: [["sail", 0.55], ["bell", 0.3, 600]] }; }
    if (a.k === "embark") { const n0 = field().length, why = embark(a.id); return why ? { note: why } : { note: field().length < n0 || (C.armies || []).length && n0 !== field().length ? `${field().length} regiments go aboard the fleet, all it can carry, as the ${armyName(C.ar | 0).toLowerCase()}; the rest stay ashore. Click the fleet, then right-click the sea to sail it; land the army from the fleet's card.` : "Your army goes aboard the fleet. Click the fleet, then right-click the sea to sail it; land the army from the fleet's card.", sfx: [["march", 0.4], ["sail", 0.4, 900]] }; }
    if (a.k === "land") { const why = land(); return why ? { note: why } : { note: "Your army is put ashore. It can march again next year.", sfx: [["drum", 0.4], ["march", 0.45, 300]] }; }
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
      const w = R() < odds(o.att * cmdMul(C.gen) * moraleK() * (1 + vetK()), o.def * cmdMul(genOf(o.foe)), false); fieldEnd(o, w, w ? 0.12 : 0.3, w ? 0.45 : 0.12); persist();
      return { note: C.log.find(l => /field/.test(l.title)).title + ".", sfx: [["drum", 0.55], ["guns", 0.6, 900], ...(w ? [["bell", 0.45, 2300]] : [])] };
    }
    if (a.k === "usearmy") { if (!armyIds().includes(a.id | 0)) return null; useArmy(a.id | 0); persist(); return {}; }
    if (a.k === "form") { const why = formArmy(a.t); return why ? { note: why } : { note: `A new army is formed at ${a.t} from its garrison: the ${armyName(C.ar | 0).toLowerCase()}. Choose a general for it from its card.`, sfx: [["drum", 0.5]] }; }
    if (a.k === "split") { const why = splitArmy(); return why ? { note: why } : { note: `The army is split in two: the ${armyName(C.ar | 0).toLowerCase()} marches under its own colours. Choose a general for it.`, sfx: [["drum", 0.4], ["march", 0.4, 300]] }; }
    // (marched to another army of yours and joined to it there: at once if it's within the year's march, else on the way)
    // (a town's garrison marched out to one of your armies, and joined to it when it gets there)
    if (a.k === "sendgar") {
      const to = a.id | 0; if (!armyIds().includes(to)) return null; const from = C.ar | 0;
      const why = formArmy(a.t); if (why) return { note: why };
      const nid = C.ar | 0, res = apply(actor, { k: "joinat", id: to });
      if (armyIds().includes(nid)) useArmy(nid); else useArmy(armyIds().includes(from) ? from : to);
      return res;
    }
    if (a.k === "joinat") {
      const o = (C.armies || []).find(x => x.id === a.id && x.pos); if (!o) return null;
      if (o.siege) return { note: "That army is besieging a town: march to it and join it when the siege is done." };
      if (dist2(o.pos, armyPos()) > 3) {
        const was = !!C.moved, res = apply(actor, { k: "move", x: o.pos.x, y: o.pos.y }); if (!was && C.moved) C.joinTo = o.id;
        // (too far for the year: on its way, and joined with a right-click on it again once it's there)
        if (dist2(o.pos, armyPos()) > 3) return res && res.note ? { ...res, note: C.joinTo === o.id ? `${res.note} It joins the ${armyName(o.id).toLowerCase()} when it reaches it.` : res.note } : res || { note: "Your army can't march to it now." };
      }
      const name = armyName(o.id), why = joinArmy(o.id); return why ? { note: why } : { note: `The two armies march together as one: the ${name.toLowerCase()}, ${armyStr()}.`, sfx: [["drum", 0.45], ["march", 0.45, 300]] };
    }
    if (a.k === "join") { const why = joinArmy(); return why ? { note: why } : { note: "The two armies march together as one.", sfx: [["drum", 0.4], ["march", 0.45, 300]] }; }
    if (a.k === "askgen") { askGeneral(); return {}; }
    if (a.k === "station") { const why = station(a.t, a.u, !!a.out); return why ? { note: why } : { sfx: [["drum", 0.3]] }; }
    if (a.k === "minister") { const G = govOf_(), m = G.cand && G.cand[a.post] && G.cand[a.post][a.i | 0]; if (!m || G.swap === C.year) return null; const old = G.min[a.post]; G.min[a.post] = m; G.swap = C.year; G.cand[a.post] = null; persist(); return { note: `${m.name} takes the ${POSTS.find(x => x[0] === a.post)[1].toLowerCase()}, in ${old.name}'s place.`, sfx: [["quill", 0.5], ["seal", 0.6, 800]] }; }
    if (a.k === "ttax") { const ct = city(a.t); if (!ct || cityOwner(g, ct) !== C.me) return null; const v = clamp(a.v | 0, 0, 3); C.ttax ||= {}; if (v === (C.tax ?? 1)) delete C.ttax[ct[0]]; else C.ttax[ct[0]] = v; persist(); return { sfx: [["coin", 0.35]] }; }
    if (a.k === "tax") { C.tax = clamp(a.v | 0, 0, 2); C.ttax = Object.fromEntries(Object.entries(C.ttax || {}).filter(([, v]) => v === 3)); persist(); return { sfx: [["coin", 0.35]] }; }
    if (a.k === "disband") { const t = disband(a.u); if (t == null) return null; return { note: `A regiment of ${TROOPS[a.u].name.toLowerCase()} is disbanded${t ? `, its men sent home to ${t}` : ""}.`, sfx: [["drum", 0.3]] }; }
    if (a.k === "unrecruit") { unrecruit(a.t); return { sfx: [["coin", 0.35]] }; }
    if (a.k === "dip") {
      if (isHuman(a.id)) return humanDip(actor, a.id, a.w);
      const t = diplo(a.id, a.w); if (!t) return null;
      if (!/^You|refuses|won't/.test(t)) say(t); persist();
      const w = a.w;
      return { note: t, sfx: w === "war" ? [["quill", 0.4], ["drum", 0.6, 600]] : w === "gift" || w === "bribe" ? [["coin", 0.5]] : w === "envoy" || w === "unpact" || w === "unally" || w === "unaccess" || w === "revoke" || /refuses|won't/.test(t) ? [["quill", 0.5]] : [["quill", 0.5], ["seal", 0.6, 850]] };
    }
    if (a.k === "siege") {
      const ct = city(a.ct), foe = ct && cityOwner(g, ct);
      if (!ct || C.siege || C.moved || !foe || isHuman(foe) || !atWar(foe) || C.army < 8 || !inMarch(ct) || !hasWalls(ct, foe, g)) return { note: "Your army can't lay siege there now." };
      C.siege = { ct: ct[0], foe, years: 0, starve: 0, bat: 0 }; C.moved = true; C.go = null; { const t = cellXY(ct); C.pos = { x: t.x, y: t.y }; } persist();
      return { note: `Your army sits down before ${ct[0]}: trenches dug, the guns brought up, the roads closed. Each year the garrison grows hungrier and the walls weaker.`, sfx: [["drum", 0.55], ["spades", 0.5, 500], ["guns", 0.5, 1600]] };
    }
    if (a.k === "supply") {
      const o = sendSupply(); if (!o) return { note: `A supply train costs ${SUPPLY_COST} thalers, and only one goes a year.` };
      if (a.how === "fight") { C.pending = { ...o, ct: o.ct[0] }; persist(); return { sfx: [["drum", 0.5]], fight: { ...o, ct: o.ct[0] } }; }
      convoyEnd(o, R() < odds(o.def * cmdMul(C.gen) * moraleK(), o.att, false), 0.15); persist(); return { note: C.log[0].title + ".", sfx: [["drum", 0.5]] };
    }
    // the army sent somewhere: as far as a year's march takes it now, the rest of the way in the years after
    if (a.k === "move") {
      C.joinTo = null;
      if (C.siege) return { note: `Your army is sitting down before ${C.siege.ct}: lift the siege first.` };
      if (C.moved || C.arrived) return { note: C.arrived ? "Your army has only just got there: it can give battle this year, and march again next year." : "Your army has already marched this year." };
      W0(); let t = { x: clamp(+a.x, 0, MG_W - 1), y: clamp(+a.y, 0, MG_H - 1) }; if (!isFinite(t.x) || !isFinite(t.y)) return null;
      // (sent out onto the water: to the shore nearest it — an army doesn't march on the sea)
      { const g0 = grid(), x0 = Math.floor(t.x), y0 = Math.floor(t.y); if (g0[y0] && g0[y0][x0] === null) { const sh = landNear(g0, t, 8); if (!sh) return { note: "That's the open sea. To cross it, embark the army on a fleet of yours." }; t = sh; } }
      { const bar = barredBy(armyPos(), t, overSea(armyPos(), t)); if (bar.length) return { note: barNote(bar) }; }
      // (over the sea: no march — only aboard a fleet of your own)
      if (overSea(armyPos(), t)) return { note: SEA_NOTE };
      const st = stepToward(armyPos(), t, MARCH); C.pos = { x: st.x, y: st.y }; C.go = st.arrived ? null : t; C.moved = true; C.chase = a.chase && atWar(a.chase) ? a.chase : null; C.target = a.target || null; persist();
      if (C.target && st.arrived) return { note: `Your army stands before ${C.target}. Right-click it to fall on it.`, sfx: marchSfx(0.5) };
      if (C.target) return { note: `Your army marches on ${C.target}: ${yearsTo(t)} more year${yearsTo(t) > 1 ? "s" : ""} to get there. It can attack the year it arrives.`, sfx: marchSfx(0.5) };
      if (C.chase) { const fp = foeArmyPos(C.chase), near = fp && mdist(C.pos, fp) <= MARCH; return { note: near ? `Your army goes after ${poss(the(C.chase))} army: it's within a year's march of it now, and it won't get away. Fall on it next year.` : `Your army goes after ${poss(the(C.chase))} army: ${yearsTo(fp)} more year${yearsTo(fp) > 1 ? "s" : ""} to come up with it.`, sfx: marchSfx(0.5) }; }
      return { note: st.arrived ? "Your army marches, and is there by the year's end." : `Your army is on the march: ${yearsTo(t)} more year${yearsTo(t) > 1 ? "s" : ""} to get there.`, sfx: marchSfx(0.5) };
    }
    if (a.k === "lift") { if (!C.siege) return null; const n = C.siege.ct; C.siege = null; persist(); return { note: `The siege of ${n} is lifted. The army is free to march.`, sfx: [["drum", 0.4], ["march", 0.4, 400]] }; }
    if (a.k === "march") {
      const ct = city(a.ct), o = ct && march(ct); if (!o) return { note: ct ? whyNot(ct) : "Your army can't march there now." };
      if (overSea(armyPos(), cellXY(ct))) return { note: SEA_NOTE };
      { const bar = barredBy(armyPos(), cellXY(ct), overSea(armyPos(), cellXY(ct))); if (bar.length) return { note: barNote(bar) }; }
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
      if (ev.kind === "scandal") {
        const G = govOf_(), old = G.min[ev.post], title = POSTS.find(x => x[0] === ev.post)[1];
        if (a.how === "sack") { const nu = minister(ev.post); G.min[ev.post] = nu; say(`${old.name} is dismissed`, `${nu.name} takes ${title === "Treasury" ? "the Treasury" : `the ministry of ${title}`}.`); return done({ note: `${old.name} is turned out; ${nu.name} takes ${title === "Treasury" ? "the Treasury" : `the ministry of ${title}`}.`, sfx: [["quill", 0.5], ["seal", 0.6, 800]] }); }
        return done({ note: `${old.name} keeps his post.`, sfx: [["quill", 0.4]] });
      }
      if (ev.kind === "revolution") {
        const G = govOf_(); G.unrest = 0;
        if (a.how === "grant") { G.type = ev.to; G.since = C.year; for (const [p] of POSTS) if (R() < 0.5) G.min[p] = minister(p); say(`A ${GOVS[ev.to].n.toLowerCase()}`, `The ${ev.to === "republic" ? "republic is proclaimed" : "constitution is sworn"}, and the streets go quiet. ${GOVS[ev.to].d}`); return done({ note: `You rule now as a ${GOVS[ev.to].n.toLowerCase()}.`, sfx: [["bell", 0.5], ["quill", 0.4, 600]] }); }
        const n0 = allField().length; eachArmy(() => { reconcile(); const F = field().sort((x, y) => x.hp - y.hp), gone = new Set(F.slice(0, Math.round(F.length * 0.25))); C.units = C.units.filter(u => !gone.has(u)); C.army = Math.round(unitSum()); }); moraleMove(-15); say("The revolution is crushed", `Soldiers clear the streets; ${n0 - allField().length} regiments are lost, and the army's heart with them.`); return done({ note: "The revolution is crushed, at a heavy price.", sfx: [["guns", 0.5], ["drum", 0.5, 400]] });
      }
      if (ev.kind === "sack") {
        const ct = city(ev.ct); if (!ct || cityOwner(g, ct) !== C.me) return done({});
        if (a.how !== "sack") { say(`${ev.ct} is occupied`, "Its people spared, its markets open."); return done({ note: `${ev.ct} is occupied. Its people are spared.`, sfx: [["quill", 0.4]] }); }
        const loot = sackLoot(ct); C.gold += loot; (C.pop ||= {})[ct[0]] = Math.round(popOf(ct) * 0.67); (C.sacked ||= {})[ct[0]] = C.year;
        for (const id of Object.keys(C.E.rel)) if (NATION_FAITH[id] === NATION_FAITH[peopleOf(ct)]) C.E.rel[id] = clamp(C.E.rel[id] - 4, -100, 100);
        say(`${ev.ct} is sacked`, `${loot} thalers carried off; a third of its people dead or fled.`); return done({ note: `${ev.ct} is sacked: ${loot} thalers to the treasury.`, sfx: [["coin", 0.6], ["guns", 0.3, 300]] });
      }
      if (ev.kind === "offer") {
        if (!alive(g, ev.foe) || atWar(ev.foe)) return done({});
        if (a.how === "yes") { if (ev.w === "ally") C.ally[ev.foe] = true; else C.E.pact[ev.foe] = true; C.E.rel[ev.foe] = clamp(Math.max(C.E.rel[ev.foe] + 8, ev.w === "ally" ? 40 : 15), -100, 100); say(ev.w === "ally" ? `An alliance with ${the(ev.foe)}` : `A trade agreement with ${the(ev.foe)}`); return done({ note: ev.w === "ally" ? `${The(ev.foe)} ${v3(ev.foe, "is")} your ally.` : `A trade agreement with ${the(ev.foe)}.`, sfx: [["quill", 0.5], ["seal", 0.6, 850]] }); }
        C.E.rel[ev.foe] = clamp(C.E.rel[ev.foe] - 4, -100, 100); return done({ sfx: [["quill", 0.4]] });
      }
      if (ev.kind === "tribute") {
        if (!alive(g, ev.foe) || atWar(ev.foe)) return done({});
        if (a.how === "yes" && C.gold >= ev.amt) { C.gold -= ev.amt; C.truce[ev.foe] = Math.max(C.truce[ev.foe] || 0, 5); C.E.rel[ev.foe] = clamp(C.E.rel[ev.foe] + 15, -100, 100); say(`Tribute paid to ${the(ev.foe)}`, `${ev.amt} thalers: five years' peace bought.`); return done({ note: `${ev.amt} thalers paid. ${The(ev.foe)} will leave you be for five years.`, sfx: [["coin", 0.6]] }); }
        C.E.rel[ev.foe] = clamp(C.E.rel[ev.foe] - 12, -100, 100);
        if (R() < 0.55) { declare(ev.foe, ev.foe); return done({ note: `You refuse. ${The(ev.foe)} ${v3(ev.foe, "declares")} war!`, sfx: [["drum", 0.55]] }); }
        say(`You refuse ${poss(the(ev.foe))} demand`, "For now, they do nothing."); return done({ note: `${The(ev.foe)} ${v3(ev.foe, "backs")} down rather than fight. Your thalers are your own, and the peace holds.`, sfx: [["quill", 0.4]] });
      }
      if (ev.kind === "passage") {
        const G = (C.E.grant ||= {});
        if (a.how === "yes") { G[ev.foe] = true; C.E.rel[ev.foe] = clamp(C.E.rel[ev.foe] + 6, -100, 100); say(`${The(ev.foe)} ${v3(ev.foe, "marches")} through your land`, `By your leave, against ${the(ev.vs)}.`); return done({ sfx: [["quill", 0.5], ["seal", 0.6, 850]] }); }
        G[ev.foe] = C.year; C.E.rel[ev.foe] = clamp(C.E.rel[ev.foe] - 8, -100, 100); say(`You refuse ${the(ev.foe)} passage`, `Its army must find another road to ${ev.ct}.`); return done({ sfx: [["quill", 0.5]] });
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
        if (a.how === "concede") { const c = worth(ct) * 2; if (C.gold < c) { ev.done = false; return { note: "The treasury hasn't the money for concessions." }; } C.gold -= c; say(`${ct[0]} is quieted`, `Its grievances heard and ${c} thalers in concessions: the town goes back to its work.`); return done({ sfx: [["coin", 0.45], ["quill", 0.4, 500]] }); }
        const mine = garrison(ct) + helpNear(ct), w = R() < odds(mine, ev.att, false);
        if (w) { C.pop[ct[0]] = Math.round(popOf(ct) * 0.96); say(`The rising in ${ct[0]} is put down`, "The garrison clears the streets. The ringleaders hang, and the town is quiet, for now."); }
        else if ((() => { const old = peopleOf(ct); return old && old !== C.me && NATIONS[old] && alive(g, old) && (ev.back = old); })()) {
          // (a conquered town risen and the day won: it opens its gates to its old crown)
          const G = garUnits(ct[0]).length; seize(ct, ev.back); say(`${ct[0]} goes over to ${the(ev.back)}`, `The rising wins the day${G ? `, the garrison of ${G} regiment${G > 1 ? "s" : ""} overwhelmed` : ""}, and the town opens its gates to its old crown.`);
        }
        else { const G = garUnits(ct[0]).length; C.units = C.units.filter(u => u.at !== ct[0]); C.pop[ct[0]] = Math.round(popOf(ct) * 0.9); C.gold -= Math.min(Math.max(0, C.gold), worth(ct)); say(`The rising in ${ct[0]} wins the day`, `The garrison is overwhelmed${G ? `, ${G} regiment${G > 1 ? "s" : ""} of it lost` : ""}, the town's books burned and a year's taxes lost before order is restored.`); }
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
        const w = R() < odds(o.def * cmdMul(C.gen) * moraleK() * (1 + vetK()), o.att * cmdMul(genOf(o.foe)), false); fieldEnd(o, w, w ? 0.12 : 0.3, w ? 0.45 : 0.12);
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
        const o = { attack: false, foe: ev.foe, ct, att: ev.att, def: ev.def, walls: ev.walls, army: ev.army !== false, colo: !!ev.colo };
        if (a.how === "fight") { C.pending = { ...o, ct: ct[0] }; return done({ fight: { ...o, ct: ct[0] } }); }
        const held = auto(o); return done({ sfx: [["guns", 0.6], ...(held ? [["bell", 0.4, 1600]] : [])] });
      }
      return done({});
    }
    if (a.k === "result") {
      const P = C.pending; if (!P) return null; C.pending = null; if (P.ar != null && armyIds().includes(P.ar)) useArmy(P.ar);
      const ct = city(P.ct);
      // (a battle left from the pause menu: lost, and the news says so — on the battle's own line, not the broken regiments')
      const leftNote = re => { const l = C.log.find(l => re.test(l.title)); if (l) l.sub += " (You left the field.)"; };
      if (P.field) { if (a.left) { fieldEnd({ ...P, ct }, false, 0.3, 0.05); leftNote(/^Beaten in the field/); persist(); return {}; } const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.8 + 0.05, t = routLoss(a); fieldEnd({ ...P, ct }, a.won, k, t); if (a.fled) leftNote(/^Beaten in the field/); persist(); return { sfx: a.won ? [["bell", 0.4, 1200]] : [] }; }
      if (P.convoy) { const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.6 + 0.03; convoyEnd({ ...P, ct }, !a.left && a.won, k, 0); persist(); return { sfx: a.won ? [["bell", 0.4, 1200]] : [] }; }
      if (a.left) { settle({ ...P, ct }, false, 0.3, 0.05); leftNote(/^(Beaten before|.* has fallen$)/); persist(); return {}; }
      const k = Math.min(0.9, (a.lost || 0) / Math.max(1, a.myMen || 20)) * 0.8 + 0.05, t = routLoss(a);
      settle({ ...P, ct }, a.won, k, t); if (a.fled) leftNote(/^(Beaten before|.* has fallen$)/);
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
      return { note: `${ct[0]}: work begins on ${o.L.n.toLowerCase()}. It'll stand at the year's end.`, sfx: [["purse", 0.45], ["hammer", 0.3, 700], ["build", 0.3, 1100]] };
    }
    if (a.k === "unbuild") { const ct = city(a.ct), q = ct && C.Q[ct[0]]; if (!q || q.by !== C.me) return null; C.gold += q.cost | 0; delete C.Q[ct[0]]; persist(); return { note: `The work at ${ct[0]} is stopped, and the money back in the treasury.`, sfx: [["coin", 0.4]] }; }
    if (a.k === "study") { if (!TECHS[a.id] || !canStudy(C.tech.done, a.id) || !techFor(a.id)) return null; if (C.tech.cur !== a.id) C.tech.yrs = 0; C.tech.cur = a.id; persist(); return { sfx: [["quill", 0.4]] }; }
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
  const since = {}; for (const h of humans()) since[h] = sliceOf(h).paperN | 0;
  as(humans()[0], () => endSeason({ mine: false }));
  for (const h of humans()) as(h, () => endSeason({ world: false, turn: false }));
  for (const h of humans()) C.mp.ready[h] = false;
  for (const h of humans()) {
    const sl = sliceOf(h), L = sl.log || [], fresh = []; for (const l of L) { if (!l.n || l.n <= since[h]) break; fresh.push(l); }
    sl.paperN = sl.logN | 0;
    tell(h, { news: fresh.filter(l => !/^((Spring|Summer|Autumn|Winter) )?\d{4}$| — \d{4}$/.test(l.title)).reverse(), sfx: [["parchment", 0.55]] });
  }
}
// (said to a player: on this screen if it's this player, else sent)
function tell(crown, r) {
  if (!C.mp) return;
  const mine = mp && mp.host ? humans()[0] : humans()[1];
  if (crown === mine) setTimeout(() => react(r), 0);
  else if (mp && mp.net) mp.net.send({ t: "cres", r });
}
// (the answer to what you did or asked, where you'll see it: a card over the map, green for yes, red for no, until
//  you click it or it has been there long enough to read)
let answerT = 0;
function answer(t) {
  const wrap = document.querySelector("#campaign .cmp-mapwrap"); if (!wrap || !t) return;
  let el = $("cmpAnswer"); if (!el) { el = document.createElement("div"); el.id = "cmpAnswer"; el.className = "cmp-answer"; wrap.appendChild(el); el.onclick = () => el.classList.remove("on"); }
  const no = /\b(refuses?|won't|can't|cannot|hasn't|haven't|isn't|not |no |too |lost|fails?|failed|already|beyond|first\.)/i.test(t), yes = !no && /\b(grants?|agrees?|accepts?|yours|ally|pact|raised|joins?|marches|sails|formed|as one|received|launched|sells|buys|takes your|accomplished)/i.test(t);
  el.className = "cmp-answer on " + (no ? "no" : yes ? "yes" : "");
  el.innerHTML = `<b>${no ? "✕" : yes ? "✓" : "✦"}</b><span>${esc(t)}</span>`;
  clearTimeout(answerT); answerT = setTimeout(() => el.classList.remove("on"), 3500 + Math.min(6000, t.length * 45));
}
// what an act comes to on your screen: a word, the sounds, a battle to fight, a field to meet the other player on
function react(r) {
  if (!r) return;
  if (r.note) { note = r.note; answer(r.note); }
  if (r.news) { news = r.news; note = ""; setTimeout(() => gazette(news), 0); }
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
  C = S; C.own = unpackOwn(C.own); own = new Map(C.own); C._dirty = true; toWorldGrid();
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
  C = j.C; C.own = unpackOwn(C.own); own = new Map(C.own); C._dirty = true; toWorldGrid();
  if (C.me !== C.mp.humans[0] && C.H && C.H[C.mp.humans[0]]) { stash(C.me); unstash(C.mp.humans[0]); }
  C.mp.names[C.mp.humans[1]] = mp.foe.name || C.mp.names[C.mp.humans[1]]; C.mp.ready = {}; ensureRealm();
  sfx("drum", 0.4); broadcast(); drawMap(true);
}
