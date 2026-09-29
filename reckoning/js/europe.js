// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Europe in 1683. The land is the real land — Natural Earth's coasts, and each
// spot of it given to the crown that held it that year (europe-data.js, built
// by the app's tools/geo) — and it is drawn as a map of the time was: engraved
// in sepia on parchment, the coasts water-lined, each crown hand-coloured along
// its borders, hills in profile, the seas named in Latin, a compass rose with
// its rhumb lines, a cartouche, a ship and a monster in the ocean.
//
// It is not a backdrop. The crowns go to war with each other and the borders
// move; plague and famine fall on them. And each has a view of you — improved
// by envoys, made useful by a trade pact, or ended by a declaration of war,
// after which it is not bandits that come up your road but its soldiers.

import { rng } from "./core.js";
import { GW, GH, BOUNDS, IDS, GRID_RLE, COAST } from "./europe-data.js";

// (the old names, for anything that still asks the grid's size by them)
export const MG_W = GW, MG_H = GH, MAP_ASPECT = GH / GW;

// each crown's wash — the colours a map-seller's colourist kept in his box
export const NATIONS = {
  scotland: { name: "Scotland", color: "#c77f8e", strength: 1 },
  england: { name: "Kingdom of England", color: "#d98a78", strength: 3 },
  ireland: { name: "Ireland", color: "#9fbf7a", strength: 1 },
  france: { name: "Kingdom of France", color: "#7f9ccc", strength: 5 },
  castile: { name: "Castile", color: "#e0b35a", strength: 4 },
  aragon: { name: "Aragon", color: "#e39a62", strength: 2 },
  portugal: { name: "Portugal", color: "#8fbf8a", strength: 2 },
  hre: { name: "Holy Roman Empire", color: "#e6cf6a", strength: 4 },
  brandenburg: { name: "Brandenburg", color: "#9aa9d8", strength: 2 },
  saxony: { name: "Saxony", color: "#86c2a0", strength: 2 },
  bavaria: { name: "Bavaria", color: "#90b6e0", strength: 2 },
  austria: { name: "Austrian Empire", color: "#e8a0a8", strength: 4 },
  milan: { name: "Milan", color: "#c9a0d8", strength: 2 },
  savoy: { name: "Savoy", color: "#e38c8c", strength: 2 },
  venice: { name: "Venice", color: "#7fc0b8", strength: 2 },
  tuscany: { name: "Tuscany", color: "#d8c070", strength: 2 },
  papal: { name: "Papal States", color: "#e0dc8a", strength: 2 },
  naples: { name: "Kingdom of Naples", color: "#e0a070", strength: 2 },
  sicily: { name: "Sicily", color: "#d49070", strength: 1 },
  sweden: { name: "Swedish Empire", color: "#e2c26a", strength: 3 },
  denmark: { name: "Denmark", color: "#e08a8a", strength: 2 },
  poland: { name: "Poland–Lithuania", color: "#d49ad0", strength: 4 },
  russia: { name: "Tsardom of Russia", color: "#a8c47a", strength: 5 },
  cossacks: { name: "Cossacks", color: "#e0c890", strength: 2 },
  crimea: { name: "Crimean Khanate", color: "#b8d890", strength: 2 },
  hungary: { name: "Hungary", color: "#a8d4a0", strength: 2 },
  transylvania: { name: "Transylvania", color: "#e0b890", strength: 2 },
  moldavia: { name: "Moldavia", color: "#c0b0e0", strength: 2 },
  wallachia: { name: "Wallachia", color: "#e6d27a", strength: 2 },
  ottoman: { name: "Ottoman Empire", color: "#8cc49a", strength: 6 },
  algiers: { name: "Algiers", color: "#e4be80", strength: 2 },
  tunis: { name: "Tunis", color: "#c8a0c0", strength: 2 },
  tripoli: { name: "Tripolitania", color: "#d8d090", strength: 2 },
  dutch: { name: "Dutch Republic", color: "#f0a860", strength: 3 },
  morocco: { name: "Sultanate of Morocco", color: "#d8a880", strength: 2 },
};
export const NATION_FAITH = {
  scotland: "reformed", england: "reformed", ireland: "catholic", france: "catholic", castile: "catholic", aragon: "catholic", portugal: "catholic", hre: "catholic",
  brandenburg: "lutheran", saxony: "lutheran", bavaria: "catholic", austria: "catholic", milan: "catholic", savoy: "catholic", venice: "catholic", tuscany: "catholic",
  papal: "catholic", naples: "catholic", sicily: "catholic", sweden: "lutheran", denmark: "lutheran", poland: "catholic", russia: "orthodox", cossacks: "orthodox", crimea: "muslim",
  hungary: "catholic", transylvania: "reformed", moldavia: "orthodox", wallachia: "orthodox", ottoman: "muslim", algiers: "muslim", tunis: "muslim", tripoli: "muslim",
  dutch: "reformed", morocco: "muslim",
};
// who can reach you with a war party: the crowns within a few days' march
export const NEAR = new Set(["denmark", "sweden", "brandenburg", "hre", "saxony", "poland", "england", "france", "bavaria", "dutch"]);

// a crown's name as a sentence wants it: "the Kingdom of France", "The Ottoman Empire seizes…", "Denmark"
export const the = id => (/^(Kingdom|Tsardom|Holy|Papal|Swedish|Austrian|Ottoman|Crimean|Cossacks|Dutch|Sultanate)/.test(NATIONS[id].name) ? "the " : "") + NATIONS[id].name;
export const The = id => { const n = the(id); return n[0].toUpperCase() + n.slice(1); };
// (the Cossacks are many: "the Cossacks seize", not "seizes")
const seizes = id => id === "cossacks" ? "seize" : "seizes";
const id2take = id => id === "cossacks" ? "take" : "takes";

// ---- the sheet: longitude and latitude to the grid, and back ----
const K = Math.cos(BOUNDS.latRef * Math.PI / 180), SPAN_X = (BOUNDS.lon1 - BOUNDS.lon0) * K, SPAN_Y = BOUNDS.lat1 - BOUNDS.lat0;
export const gridOf = (lon, lat) => [(lon - BOUNDS.lon0) * K / SPAN_X * GW, (BOUNDS.lat1 - lat) / SPAN_Y * GH];
// your clearing, in the woods north-east of Hamburg on the Lübeck road
const HOME_LL = [10.75, 53.72];
export const HOME = (() => { const [x, y] = gridOf(...HOME_LL); return { mx: Math.floor(x), my: Math.floor(y) }; })();

// ---- the grid of who holds what ----
let BASE = null;
function baseGrid() {
  if (BASE) return BASE;
  const flat = [];
  const re = /(\d+)(.)/g; let m;
  while ((m = re.exec(GRID_RLE))) { const n = +m[1], ch = m[2]; const id = ch === "." ? null : ch === "~" ? "wilds" : IDS["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(ch)]; for (let i = 0; i < n; i++) flat.push(id); }
  BASE = Array.from({ length: GH }, (_, r) => flat.slice(r * GW, r * GW + GW));
  return BASE;
}
// the political map as it stands: 1683's, with every conquest since laid over it
let gridCache = null, gridKey = "";
export function buildGrid(E) {
  // (the same conquests, the same map: asked for on every movement of the pointer, so kept)
  const cq = (E && E.conq) || [], key = cq.length + ":" + (cq.length ? cq[cq.length - 1].c + "," + cq[cq.length - 1].r + cq[cq.length - 1].to : "");
  if (gridCache && key === gridKey) return gridCache.map(row => row.slice());
  const g = baseGrid().map(row => row.slice());
  for (const q of cq) if (g[q.r] && g[q.r][q.c] && g[q.r][q.c] !== "wilds") g[q.r][q.c] = q.to;
  gridCache = g; gridKey = key;
  return g.map(row => row.slice());
}
function neighbours(g, id) {
  const out = new Set();
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (g[r][c] !== id) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = g[r + dy] && g[r + dy][c + dx]; if (n && n !== id && NATIONS[n]) out.add(n); }
  }
  return [...out];
}
export function cityOwner(g, city) {
  const [fx, fy] = gridOf(city[1], city[2]), x = Math.floor(fx), y = Math.floor(fy);
  // (a harbour's own square is often counted as sea, and Lübeck stands in the free woods: the nearest crown's land is theirs)
  for (let rad = 0; rad <= 4; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
    const id = g[y + dy] && g[y + dy][x + dx];
    if (id && NATIONS[id]) return id;
  }
  return null;
}
export function citiesOf(E, id) { const g = buildGrid(E); return CITIES.filter(ct => cityOwner(g, ct) === id).sort((a, b) => b[3] - a[3]); }
const hexRGB = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ---- the state of Europe, kept with the settlement ----
// rel: each crown's view of you, −100 to 100 (it starts where its faith and its distance put it)
// war: crowns at war with you; wars: crowns at war with each other; conq: land that changed hands; pact: trade pacts
export function ensureEurope(S) {
  const E = S.europe;
  if (E) {
    // (a map from before the real one: its conquests were on the old, coarse grid, and mean nothing on this one)
    if (E.gridV !== 2) { E.conq = []; E.gridV = 2; }
    for (const id of Object.keys(NATIONS)) if (E.rel[id] == null) E.rel[id] = 0;
    return E;
  }
  const r = rng(77), rel = {};
  for (const id of Object.keys(NATIONS)) rel[id] = Math.round((NATION_FAITH[id] === "lutheran" ? 10 : NATION_FAITH[id] === "catholic" ? -5 : 0) + (r() - 0.5) * 30);
  return (S.europe = { rel, war: {}, wars: [], conq: [], pact: {}, plague: {}, famine: {}, beaten: {}, news: [], gridV: 2 });
}
export const relWord = v => v >= 50 ? "friendly" : v >= 15 ? "well disposed" : v > -15 ? "indifferent" : v > -50 ? "cool" : "hostile";
export function strengthOf(E, id) { return Math.max(1, NATIONS[id].strength - (E.plague[id] ? 2 : 0) - (E.famine[id] ? 1 : 0)); }

// a day in Europe: wars start, battles are fought and a province changes hands, peace is made; plague and famine
// come and go; crowns' tempers drift. Returns news — [{title, sub, img}] — worth a card.
export function europeDay(S, day) {
  const E = ensureEurope(S), news = [], ids = Object.keys(NATIONS);
  const say = (title, sub, img) => { news.push({ title, sub, img }); E.news.unshift({ day, title, sub }); E.news.length = Math.min(E.news.length, 30); };
  const g = buildGrid(E);
  if (E.wars.length < 3 && Math.random() < 0.1) {
    const a = ids[Math.floor(Math.random() * ids.length)], nb = neighbours(g, a).filter(b => !E.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)));
    if (nb.length) { const b = nb[Math.floor(Math.random() * nb.length)]; E.wars.push({ a, b, battles: 0 }); say(`${The(a)} and ${the(b)} are at war!`, "Word arrives from afar", "event_war"); }
  }
  for (const w of E.wars.slice()) {
    if (Math.random() > 0.25) continue;
    const before = g.map(row => row.slice());
    const sa = strengthOf(E, w.a), sb = strengthOf(E, w.b), aWins = Math.random() < sa / (sa + sb);
    const win = aWins ? w.a : w.b, lose = aWins ? w.b : w.a;
    const front = [];
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      if (g[r][c] !== lose) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[r + dy] && g[r + dy][c + dx] === win)) front.push([c, r]);
    }
    // a province: the loser's land within a few leagues of a point on the front
    let took = 0;
    if (front.length) {
      const [c0, r0] = front[Math.floor(Math.random() * front.length)], want = 40 + Math.floor(Math.random() * 60);
      const q = [[c0, r0]], seen = new Set([c0 + "," + r0]);
      while (q.length && took < want) {
        const [c, r] = q.shift();
        if (g[r][c] !== lose) continue;
        g[r][c] = win; took++;
        E.conq = E.conq.filter(x => !(x.c === c && x.r === r)); E.conq.push({ c, r, to: win });
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dx) + "," + (r + dy); if (!seen.has(k) && g[r + dy] && g[r + dy][c + dx] === lose && Math.hypot(c + dx - c0, r + dy - r0) < 10) { seen.add(k); q.push([c + dx, r + dy]); } }
      }
    }
    w.battles++;
    // a city in the province taken is the news; land alone, less so
    const fell = took ? CITIES.filter(ct => ct[3] >= 2 && cityOwner(g, ct) === win && cityOwner(before, ct) === lose) : [];
    if (fell.length) say(`${The(win)} ${id2take(win)} ${fell.map(ct => ct[0]).join(" and ")} from ${the(lose)}!`, fell.some(ct => ct[3] === 3) ? "A seat of the crown has fallen" : "The borders of Europe shift", "event_conquest");
    else if (took) say(`${The(win)} ${seizes(win)} land from ${the(lose)}!`, "The borders of Europe shift", "event_conquest");
    if ((w.battles >= 3 && Math.random() < 0.35) || !front.length) { E.wars.splice(E.wars.indexOf(w), 1); say(`${The(w.a)} and ${the(w.b)} make peace.`, "A weary truce is signed", "event_peace"); }
  }
  for (const id of ids) {
    if (E.plague[id] && --E.plague[id] <= 0) delete E.plague[id];
    if (E.famine[id] && --E.famine[id] <= 0) delete E.famine[id];
  }
  if (Math.random() < 0.08) { const id = ids[Math.floor(Math.random() * ids.length)]; if (!E.plague[id]) { E.plague[id] = 6 + Math.floor(Math.random() * 6); say(`Plague walks the towns of ${the(id)}.`, "Their strength fails, and their trade stops", "event_defeat"); } }
  if (Math.random() < 0.08) { const id = ids[Math.floor(Math.random() * ids.length)]; if (!E.famine[id]) { E.famine[id] = 5 + Math.floor(Math.random() * 5); say(`The harvest fails across ${the(id)}.`, "Grain is worth more than silver there", "event_caravan"); } }
  const st = S.stateFaith;
  for (const id of ids) {
    const home = (st && NATION_FAITH[id] === st ? 20 : 0) + (NATION_FAITH[id] === "lutheran" ? 10 : 0);
    E.rel[id] += Math.sign(home - E.rel[id]) * Math.min(1, Math.abs(home - E.rel[id]));
  }
  return news;
}

// ===========================================================================
//  the map, drawn as a map of 1683 was
// ===========================================================================
const INK = "#3a2a1a", INK_SOFT = "rgba(58,42,26,", PAPER = "#efe4c6", FELL = '"IM Fell English", "Cormorant Garamond", Georgia, serif';
// the crowns' names, as the engraver lettered them (large for the great, small for the rest), placed by longitude and latitude
const NAMES = [
  ["SCOTIA", -4.2, 57.1, 1], ["ANGLIA", -1.4, 52.5, 2], ["HIBERNIA", -8.5, 52.8, 1], ["GALLIA", 2.2, 46.9, 3], ["CASTILIA", -3.9, 39.9, 2], ["ARAGONIA", -0.4, 41.5, 0], ["LUSITANIA", -8.1, 39.6, -1, -90],
  ["IMPERIUM\nROMANUM", 8.4, 49.9, 1], ["BRANDENBURG", 13.4, 52.7, -1], ["SAXONIA", 13.5, 51.1, -1], ["BAVARIA", 11.6, 48.9, -1], ["AUSTRIA", 14.6, 47.6, 0], ["MEDIOL.", 9.4, 45.5, -1],
  ["SABAUDIA", 6.9, 44.9, -1], ["VENETIA", 12.1, 46.1, -1], ["TUSCIA", 11.1, 43.4, -1], ["STATUS\nECCLESIAE", 13, 42.7, -1], ["NEAPOLIS", 15.9, 40.9, -1], ["SICILIA", 14.1, 37.5, -1],
  ["SUECIA", 15.4, 60.8, 2], ["FINLANDIA", 26.5, 62.6, 0], ["DANIA", 9.2, 56.1, 0], ["NORVEGIA", 8.4, 61.6, 1], ["POLONIA", 19.6, 52, 2], ["LITHUANIA", 25.4, 54.6, 1], ["MOSCOVIA", 36.5, 57, 3],
  ["COSACCI", 32.8, 49.8, 0], ["TARTARIA\nCRIMEA", 34.6, 46.3, -1], ["HUNGARIA", 19.4, 48.7, -1], ["TRANSYLVANIA", 24, 46.6, -1], ["MOLDAVIA", 27.6, 47.4, -1], ["VALACHIA", 25, 44.4, -1],
  ["IMPERIUM\nTURCICUM", 22.4, 42.2, 2], ["NATOLIA", 33.5, 39, 1], ["ALGERIA", 2.4, 34.4, 1], ["TUNETUM", 9.6, 34.1, -1], ["TRIPOLIS", 15.5, 32.6, -1], ["HOLLANDIA", 5.4, 52.9, -1], ["MAROCCO", -6.2, 33.4, 1],
];
const SEAS = [["OCEANUS\nATLANTICUS", -8.9, 48.9], ["OCEANUS\nGERMANICUS", 3, 55.4], ["MARE BALTICUM", 18.4, 56.5], ["MARE MEDITERRANEUM", 5.2, 38.8], ["MARE ADRIATICUM", 15.4, 43.1, 36], ["PONTUS EUXINUS", 34.4, 43.4], ["MARE\nAEGAEUM", 25, 38.4], ["SINUS\nBOTHNICUS", 20.6, 62.6]];
// rivers, as the engraver would have traced them: a few points each, from the mouth up
const RIVERS = [
  [[4.1, 51.9], [6.1, 51.8], [6.8, 51.3], [7.6, 50.4], [8.3, 49.9], [8.4, 49], [7.6, 47.6], [9.3, 47.6]],
  [[29.7, 45.2], [28.2, 45.4], [28, 44.4], [26.1, 44.1], [24.5, 43.7], [22.6, 44.6], [20.3, 45.2], [19, 46], [18.9, 47.8], [16.4, 48.2], [13.4, 48.6], [12.1, 49], [10.9, 48.7], [8.2, 48]],
  [[8.8, 53.9], [10, 53.5], [11.6, 53], [11.8, 52], [12.6, 51.9], [13.7, 51], [14.3, 50.5]],
  [[14.3, 53.9], [14.6, 53.4], [14.6, 52.4], [15.3, 51.8], [17, 51.1], [18.1, 50.1]],
  [[18.9, 54.4], [18.6, 53.4], [19.3, 52.6], [21, 52.2], [21.7, 50.9], [20, 50.1]],
  [[32.6, 46.6], [34.3, 47.5], [35.1, 48.4], [33.2, 49.3], [30.5, 50.5], [30.3, 51.9], [31, 53.5], [32, 54.8], [33, 55.2]],
  [[39.3, 47.1], [40.8, 47.5], [42.5, 48.5], [43.5, 49.7], [41, 50.5], [39.3, 51.5], [38.3, 53.5]],
  [[0.1, 49.4], [1.2, 49.3], [2.3, 48.8], [3, 48.5], [4, 48.3]], [[-2.2, 47.2], [0.7, 47.4], [1.9, 47.9], [3, 47.2], [4, 46]],
  [[4.8, 43.4], [4.8, 44.9], [4.9, 45.7], [6.1, 46.2]], [[12.4, 44.9], [10.9, 45.1], [9.2, 45.1], [7.7, 45]], [[-9.2, 38.7], [-8.2, 39.4], [-6.5, 39.8], [-4.3, 39.9], [-2.2, 40.4]],
  [[0.8, 40.7], [-0.9, 41.6], [-2.4, 42.4], [-3.7, 43]], [[24, 57], [25.5, 56.5], [26.5, 55.9], [28.8, 55.5], [30.2, 55.2]], [[21.2, 55.3], [22.5, 55.1], [23.9, 54.9], [25.8, 54.2]],
];
// hills in profile, along the ranges
const HILLS = [
  [6.9, 45.5], [7.6, 45.9], [8.5, 46.4], [9.5, 46.5], [10.5, 46.6], [11.5, 47], [12.5, 47], [13.5, 47.1], [14.5, 47.3], [7.2, 44.6], [8.2, 46.8], [10, 46.2], [11.7, 46.4], [13, 46.5],
  [-1.2, 43], [0, 42.8], [1, 42.7], [2, 42.5], [18.5, 49.3], [19.8, 49.3], [21, 49.3], [22.5, 49], [23.8, 48.2], [24.8, 47.6], [25.6, 46.8], [25.9, 45.8], [25.2, 45.4], [24, 45.4], [22.8, 45.3],
  [8, 61], [9, 62], [10, 62.5], [12, 63.5], [13, 64.5], [7.5, 60], [8.5, 60.5], [11, 63], [14, 65.5], [10, 44.2], [11.5, 43.8], [12.6, 43.3], [13.5, 42.3], [14.5, 41.5], [15.5, 40.6], [16.2, 39.5],
  [23, 42.8], [24.5, 42.7], [25.5, 42.7], [19.5, 42.8], [20.5, 42.3], [21.8, 41.6], [22, 40], [-4.5, 33], [-3, 33.5], [-1, 34.2], [2, 35.5], [4, 36.2], [6, 35.5], [40, 43.5], [42, 43], [43.5, 42.7],
  [-4.5, 57], [-5, 57.5], [-4, 57.2], [13, 50.5], [15.5, 50.7], [14, 49], [16, 44], [17.5, 43.5], [18.8, 43], [21, 39.8], [21.5, 39], [30, 38], [33, 37.3], [36, 38], [39, 39],
  [-3.5, 37.1], [-4.5, 40.4], [-6, 40.3], [3.2, 45.3], [2.9, 44.5], [-3.9, 52.6], [-3.4, 54.5],
];
// the cities of 1683, as the map-makers named them: rank 3 a crown's seat (drawn walled, with its flag), 2 a great town, 1 a town
export const CITIES = [
  ["London", -0.12, 51.5, 3], ["Paris", 2.35, 48.85, 3], ["Madrid", -3.7, 40.4, 3], ["Lisboa", -9.14, 38.72, 3], ["Wien", 16.37, 48.21, 3], ["Roma", 12.5, 41.9, 3],
  ["Stockholm", 18.07, 59.33, 3], ["Kiøbenhavn", 12.57, 55.68, 3], ["Warszawa", 21, 52.23, 3], ["Moskva", 37.6, 55.75, 3], ["Constantinopolis", 28.97, 41.01, 3], ["Amsterdam", 4.9, 52.37, 3],
  ["Edinburgh", -3.19, 55.95, 3], ["Dublin", -6.26, 53.35, 3], ["Berlin", 13.4, 52.52, 3], ["Dresden", 13.74, 51.05, 3], ["München", 11.58, 48.14, 3], ["Venezia", 12.33, 45.44, 3],
  ["Napoli", 14.25, 40.85, 3], ["Firenze", 11.25, 43.77, 3], ["Torino", 7.68, 45.07, 3], ["Milano", 9.19, 45.46, 3], ["Palermo", 13.36, 38.12, 3], ["Pressburg", 17.1, 48.15, 3],
  ["Alger", 3.06, 36.75, 3], ["Tunis", 10.18, 36.8, 3], ["Tripoli", 13.19, 32.89, 3], ["Fès", -5, 34.03, 3], ["Iaşi", 27.6, 47.16, 3], ["Târgovişte", 25.45, 44.92, 3],
  ["Weissenburg", 23.58, 46.07, 3], ["Bakhchisaray", 33.86, 44.75, 3], ["Chyhyryn", 32.66, 49.08, 3], ["Zaragoza", -0.88, 41.65, 3], ["Regensburg", 12.1, 49.02, 2],
  ["Hamburg", 10, 53.55, 2], ["Lübeck", 10.7, 53.87, 2], ["Danzig", 18.65, 54.35, 2], ["Königsberg", 20.5, 54.7, 2], ["Riga", 24.1, 56.95, 2], ["Reval", 24.75, 59.44, 2],
  ["Åbo", 22.27, 60.45, 2], ["Bergen", 5.32, 60.39, 2], ["Christiania", 10.75, 59.91, 2], ["Göteborg", 11.97, 57.7, 2], ["Stettin", 14.55, 53.43, 2], ["Köln", 6.96, 50.94, 2],
  ["Frankfurt", 8.68, 50.11, 2], ["Nürnberg", 11.08, 49.45, 2], ["Augsburg", 10.9, 48.37, 2], ["Leipzig", 12.37, 51.34, 2], ["Prag", 14.42, 50.08, 2], ["Breslau", 17.04, 51.11, 2],
  ["Kraków", 19.94, 50.06, 2], ["Wilna", 25.28, 54.69, 2], ["Kiev", 30.52, 50.45, 2], ["Smolensk", 32.05, 54.78, 2], ["Novgorod", 31.27, 58.52, 2], ["Lyon", 4.84, 45.76, 2],
  ["Marseille", 5.37, 43.3, 2], ["Bordeaux", -0.58, 44.84, 2], ["Rouen", 1.1, 49.44, 2], ["Sevilla", -5.98, 37.39, 2], ["Barcelona", 2.17, 41.39, 2], ["Valencia", -0.38, 39.47, 2],
  ["Genova", 8.93, 44.41, 2], ["Bologna", 11.34, 44.49, 2], ["Belgrad", 20.46, 44.8, 2], ["Buda", 19.04, 47.5, 2], ["Sofia", 23.32, 42.7, 2], ["Athenae", 23.73, 37.98, 2],
  ["Thessalonica", 22.94, 40.64, 2], ["Smyrna", 27.14, 38.42, 2], ["Ankara", 32.86, 39.93, 2], ["Bristol", -2.6, 51.45, 2], ["York", -1.08, 53.96, 2], ["Antwerpen", 4.4, 51.22, 2],
  ["Brussel", 4.35, 50.85, 2], ["Strassburg", 7.75, 48.58, 2], ["Zürich", 8.54, 47.37, 2], ["Graz", 15.44, 47.07, 2], ["Lemberg", 24.03, 49.84, 2], ["Kamieniec", 26.58, 48.68, 2],
  ["Azov", 39.42, 47.1, 2], ["Kaffa", 35.38, 45.03, 2], ["Oran", -0.63, 35.7, 2], ["Candia", 25.13, 35.34, 2], ["Bremen", 8.8, 53.08, 2], ["Hannover", 9.73, 52.37, 2],
  ["Nantes", -1.55, 47.22, 1], ["Toulouse", 1.44, 43.6, 1], ["Brest", -4.49, 48.39, 1], ["Cádiz", -6.29, 36.53, 1], ["Porto", -8.61, 41.15, 1], ["Glasgow", -4.25, 55.86, 1],
  ["Cork", -8.47, 51.9, 1], ["Norwich", 1.3, 52.63, 1], ["Magdeburg", 11.63, 52.13, 1], ["Posen", 16.93, 52.41, 1], ["Sarajevo", 18.41, 43.86, 1],
  ["Ragusa", 18.09, 42.65, 1], ["Ancona", 13.52, 43.62, 1], ["Messina", 15.55, 38.19, 1], ["Tula", 37.62, 54.19, 1], ["Poltava", 34.55, 49.59, 1],
];


const lonlat = (lon, lat, S) => { const [x, y] = gridOf(lon, lat); return [x * S, y * S]; };
// the coast as a reusable path, at a scale
let coastP = null, coastS = 0;
function coastPath(S) {
  if (coastP && coastS === S) return coastP;
  coastP = new Path2D(); coastS = S;
  for (const ring of COAST) { ring.forEach(([x, y], i) => (i ? coastP.lineTo(x * S / 10, y * S / 10) : coastP.moveTo(x * S / 10, y * S / 10))); coastP.closePath(); }
  return coastP;
}
// the land as a path, from the coast rings (in tenths of a cell)
function landPath(c, S) {
  c.beginPath();
  for (const ring of COAST) { ring.forEach(([x, y], i) => (i ? c.lineTo(x * S / 10, y * S / 10) : c.moveTo(x * S / 10, y * S / 10))); c.closePath(); }
}

// the finished sheet, without the things that change by the second (the pointer, the lit crown)
let sheet = null, sheetKey = "";
function drawSheet(W, H, E, g, homePop) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d"), S = W / GW, r = rng(1683);
  // ---- the paper: warm, uneven, a little foxed, darker to the edges ----
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = r() * H, rad = 40 + r() * 160, gr = c.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${170 + r() * 30},${140 + r() * 20},${90 + r() * 20},${0.03 + r() * 0.05})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  { const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(120,90,50,0.22)"); c.fillStyle = vg; c.fillRect(0, 0, W, H); }
  // ---- the sea: a pale wash, and a portolan's rhumb lines from the rose ----
  // (the sea is left pale, as the colourists left it, with only a cool breath of tint)
  c.save(); c.fillStyle = "rgba(214,226,218,0.32)"; c.fillRect(0, 0, W, H); c.restore();
  const [rx, ry] = lonlat(-5, 46.2, S);
  c.save(); landPath(c, S); c.rect(W, 0, -W, H); c.clip("evenodd");
  c.strokeStyle = INK_SOFT + "0.16)"; c.lineWidth = 0.7;
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + Math.cos(a) * W * 1.6, ry + Math.sin(a) * W * 1.6); c.stroke(); }
  // water-lining: fine rings of ink along every coast, fainter as they go out to sea. Drawn on a layer of their own —
  // each ring a band of ink with its middle cut out — so only the lines themselves reach the paper
  {
    const wl = document.createElement("canvas"); wl.width = W; wl.height = H;
    const w = wl.getContext("2d"), coast = coastPath(S), gap = S * 0.85, lw = Math.max(0.8, S * 0.16);
    w.lineJoin = "round";
    for (let i = 6; i >= 1; i--) {
      w.globalCompositeOperation = "source-over"; w.lineWidth = i * gap * 2 + lw; w.strokeStyle = INK_SOFT + (0.5 * (1 - i / 7)).toFixed(3) + ")"; w.stroke(coast);
      w.globalCompositeOperation = "destination-out"; w.lineWidth = i * gap * 2 - lw; w.strokeStyle = "#000"; w.stroke(coast);
    }
    c.drawImage(wl, 0, 0);
  }
  c.restore();
  // ---- the land: the paper, a shade lighter, and each crown hand-coloured — a band of colour along its borders, a thin wash within ----
  c.save(); landPath(c, S); c.clip("evenodd");
  c.fillStyle = "rgba(245,236,210,0.55)"; c.fillRect(0, 0, W, H);
  const wash = document.createElement("canvas"); wash.width = GW; wash.height = GH;
  const wc = wash.getContext("2d"), img = wc.createImageData(GW, GH);
  // distance in from each crown's edge, a few cells deep
  const depth = new Uint8Array(GW * GH).fill(9);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const id = g[y][x]; if (!id || id === "wilds") continue;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = g[y + dy] && g[y + dy][x + dx]; if (n !== id) { edge = true; break; } }
    if (edge) depth[y * GW + x] = 0;
  }
  for (let pass = 1; pass <= 4; pass++) for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const k = y * GW + x; if (depth[k] < pass) continue;
    const id = g[y][x]; if (!id || id === "wilds") continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (y + dy) * GW + x + dx; if (g[y + dy] && g[y + dy][x + dx] === id && depth[n] === pass - 1) { depth[k] = pass; break; } }
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const id = g[y][x], k = y * GW + x; if (!id) continue;
    const [R, G, B] = id === "wilds" ? [120, 140, 90] : hexRGB(NATIONS[id].color);
    const d = depth[k], a = id === "wilds" ? 0.35 : d === 0 ? 0.95 : d === 1 ? 0.7 : d === 2 ? 0.45 : 0.22;
    img.data.set([R, G, B, Math.round(a * 255)], k * 4);
  }
  wc.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true; c.filter = `blur(${(S * 0.55).toFixed(1)}px)`; c.globalAlpha = 0.85;
  c.drawImage(wash, 0, 0, W, H);
  c.filter = "none"; c.globalAlpha = 1;
  // borders: a dotted line where one crown meets another
  c.fillStyle = INK_SOFT + "0.7)";
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const id = g[y][x]; if (!id) continue;
    const e = g[y][x + 1], s = g[y + 1] && g[y + 1][x];
    if (e && e !== id && (x + y) % 2 === 0) { c.beginPath(); c.arc((x + 1) * S, (y + 0.5) * S, Math.max(0.7, S * 0.2), 0, 7); c.fill(); }
    if (s && s !== id && (x + y) % 2 === 0) { c.beginPath(); c.arc((x + 0.5) * S, (y + 1) * S, Math.max(0.7, S * 0.2), 0, 7); c.fill(); }
  }
  // rivers: a fine wandering line in a paler ink, thicker toward the mouth
  for (const rv of RIVERS) {
    const pts = rv.map(([lo, la]) => lonlat(lo, la, S));
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      c.lineWidth = Math.max(0.6, S * (0.42 - i / pts.length * 0.3)); c.strokeStyle = "rgba(60,80,96,0.8)";
      c.beginPath(); c.moveTo(x0, y0);
      // a meander or two between each pair of points
      const n = Math.max(2, Math.round(L / (S * 3)));
      for (let k = 1; k <= n; k++) { const t = k / n, wob = (r() - 0.5) * S * 1.4; c.quadraticCurveTo(x0 + dx * (t - 0.5 / n) - dy / L * wob, y0 + dy * (t - 0.5 / n) + dx / L * wob, x0 + dx * t, y0 + dy * t); }
      c.stroke();
    }
  }
  // hills in profile: a humped outline, shaded on its eastern side
  for (const [lo, la] of HILLS) {
    const [x, y] = lonlat(lo, la, S), w = S * (1.8 + r() * 0.8), h = S * (1.5 + r() * 0.9);
    c.fillStyle = "rgba(240,228,200,0.95)"; c.strokeStyle = INK; c.lineWidth = Math.max(0.8, S * 0.22);
    c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.3, y - h * 1.4, x, y - h); c.quadraticCurveTo(x + w * 0.4, y - h * 1.3, x + w, y); c.fill(); c.stroke();
    c.lineWidth = Math.max(0.5, S * 0.12); for (let j = 0; j < 4; j++) { c.beginPath(); c.moveTo(x + w * (0.1 + j * 0.2), y - h * (0.8 - j * 0.18)); c.lineTo(x + w * (0.25 + j * 0.2), y); c.stroke(); }
  }
  c.restore();
  // ---- the coast itself, inked ----
  landPath(c, S); c.strokeStyle = INK; c.lineWidth = Math.max(1.2, S * 0.42); c.lineJoin = "round"; c.stroke();
  // ---- the cities: a dot each, and the name where it finds room (right, left, above, below) — clear of the crowns'
  // and the seas' names, and of each other; a town whose name can't be fitted keeps its dot ----
  c.textBaseline = "middle";
  const taken = [];
  const hit = b => taken.some(t => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  const boxOf = (lines, x, y, px, sp, ang) => {
    if (ang) return [x - px, y - px * 5, x + px, y + px * 5];
    const w = Math.max(...lines.map(l => c.measureText(l).width + sp * (l.length - 1))), h = px * 1.1 * lines.length;
    return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  };
  for (const [n, lo, la, size, ang = 0] of NAMES) { const [x, y] = lonlat(lo, la, S), px = Math.round(S * [3.9, 4.5, 5.3, 6.6, 8][size + 1]); c.font = `${size >= 2 ? "" : "italic "}${px}px ${FELL}`; taken.push(boxOf(n.split("\n"), x, y, px, size >= 2 ? px * 0.3 : size >= 1 ? px * 0.2 : px * 0.08, ang)); }
  for (const [n, lo, la, ang = 0] of SEAS) { const [x, y] = lonlat(lo, la, S), px = Math.round(S * 4); c.font = `italic ${px}px ${FELL}`; taken.push(boxOf(n.split("\n"), x, y, px, px * 0.26, ang)); }
  // the seats first, then the great towns, then the rest: the important names get the room
  for (const ct of [...CITIES].sort((a, b) => b[3] - a[3])) {
    const [n, lo, la, rank] = ct, [x, y] = lonlat(lo, la, S), own = cityOwner(g, ct);
    townSign(c, x, y, S, rank, own);
    c.font = rank === 3 ? `${Math.round(S * 2.9)}px ${FELL}` : `italic ${Math.round(S * (rank === 2 ? 2.7 : 2.4))}px ${FELL}`;
    const w = c.measureText(n).width, h = S * 2.8, d = S * (rank === 3 ? 1.6 : 0.9);
    const tries = [[x + d, y, "left"], [x - d, y, "right"], [x, y - h * 0.9, "center"], [x, y + h * 0.9, "center"], [x + d * 0.6, y - h * 0.8, "left"], [x + d * 0.6, y + h * 0.8, "left"]];
    for (const [tx, ty, al] of tries) {
      const x0 = al === "left" ? tx : al === "right" ? tx - w : tx - w / 2, b = [x0, ty - h / 2, x0 + w, ty + h / 2];
      if (hit(b)) continue;
      taken.push(b, [x - S, y - S, x + S, y + S]);
      c.textAlign = al; c.fillStyle = INK_SOFT + (rank === 1 ? "0.7)" : "0.9)"); c.fillText(n, tx, ty + S * 0.1);
      break;
    }
  }
  // ---- the crowns' names ----
  c.textAlign = "center";
  for (const [n, lo, la, size, ang = 0] of NAMES) {
    const [x, y] = lonlat(lo, la, S), px = Math.round(S * [3.9, 4.5, 5.3, 6.6, 8][size + 1]);
    c.save(); c.translate(x, y); c.rotate(ang * Math.PI / 180);
    c.font = `${size >= 2 ? "" : "italic "}${px}px ${FELL}`; c.fillStyle = INK_SOFT + "0.92)";
    n.split("\n").forEach((line, i, all) => spaced(c, line, 0, (i - (all.length - 1) / 2) * px * 1.05, size >= 2 ? px * 0.3 : size >= 1 ? px * 0.2 : px * 0.08));
    c.restore();
  }
  // ---- the seas, in Latin, italic and wide ----
  for (const [n, lo, la, ang = 0] of SEAS) {
    const [x, y] = lonlat(lo, la, S), px = Math.round(S * 4);
    c.save(); c.translate(x, y); c.rotate(ang * Math.PI / 180);
    c.font = `italic ${px}px ${FELL}`; c.fillStyle = INK_SOFT + "0.72)";
    n.split("\n").forEach((line, i, all) => spaced(c, line, 0, (i - (all.length - 1) / 2) * px * 1.1, px * 0.26));
    c.restore();
  }
  // ---- ornament: the rose, a ship, a monster, the cartouche, a scale, the frame ----
  rose(c, rx, ry, S * 8);
  ship(c, ...lonlat(-9.6, 41.4, S), S * 0.45);
  monster(c, ...lonlat(-8.6, 56.6, S), S * 0.5);
  cartouche(c, W, H, S);
  scaleBar(c, W, H, S);
  frame(c, W, H, S);
  // the paper's grain, over everything
  for (let i = 0; i < W * H / 60; i++) { c.fillStyle = `rgba(${r() < 0.5 ? "60,40,20" : "255,250,235"},${(r() * 0.08).toFixed(3)})`; c.fillRect(r() * W, r() * H, 1, 1); }
  return cv;
}
// a city's mark: a dot — a larger one ringed in its crown's colour for a seat, a middling one for a great town, a small one for a town
function townSign(c, x, y, S, rank, own) {
  const r = S * (rank === 3 ? 0.62 : rank === 2 ? 0.46 : 0.32);
  c.save();
  if (rank === 3) { c.beginPath(); c.arc(x, y, r * 1.9, 0, 7); c.fillStyle = own ? NATIONS[own].color : "#b0281a"; c.fill(); c.lineWidth = Math.max(0.6, S * 0.12); c.strokeStyle = INK; c.stroke(); }
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = INK; c.fill();
  c.restore();
}
// letters drawn one by one, with space between, centred on x
function spaced(c, t, x, y, sp) {
  const ws = [...t].map(ch => c.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0) + sp * (t.length - 1);
  let at = x - total / 2;
  const align = c.textAlign; c.textAlign = "left";
  [...t].forEach((ch, i) => { c.fillText(ch, at, y); at += ws[i] + sp; });
  c.textAlign = align;
}
function rose(c, x, y, R) {
  c.save(); c.translate(x, y);
  c.strokeStyle = INK; c.lineWidth = 1;
  c.beginPath(); c.arc(0, 0, R * 1.08, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, R * 0.98, 0, 7); c.stroke();
  // sixteen points: long and dark for the four winds, shorter for the rest
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 - Math.PI / 2, len = i % 4 === 0 ? R : i % 2 === 0 ? R * 0.68 : R * 0.45, w = i % 4 === 0 ? R * 0.14 : R * 0.08;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * len, Math.sin(a) * len); c.lineTo(Math.cos(a + side * Math.PI / 2) * w, Math.sin(a + side * Math.PI / 2) * w); c.closePath();
      c.fillStyle = side < 0 ? INK : (i % 4 === 0 ? "#d9c79a" : "#e6d7b0"); c.fill(); c.stroke();
    }
  }
  // the lily for north
  c.fillStyle = INK; c.font = `${Math.round(R * 0.3)}px ${FELL}`; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("⚜", 0, -R * 1.22);
  c.restore();
}
function ship(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.strokeStyle = INK; c.fillStyle = "#d8c7a0"; c.lineWidth = 0.9;
  // hull, three masts, square sails swelling, a pennant
  c.beginPath(); c.moveTo(-16, 0); c.quadraticCurveTo(0, 7, 16, -1); c.lineTo(13, -4); c.lineTo(-14, -3); c.closePath(); c.fill(); c.stroke();
  for (const [mx, h] of [[-8, 16], [0, 22], [8, 16]]) {
    c.beginPath(); c.moveTo(mx, -3); c.lineTo(mx, -3 - h); c.stroke();
    for (const k of [0.35, 0.7]) { c.beginPath(); c.moveTo(mx - 5, -3 - h * k); c.quadraticCurveTo(mx + 3, -3 - h * k + h * 0.15, mx - 5, -3 - h * k + h * 0.28); c.lineTo(mx + 5, -3 - h * k + h * 0.28); c.quadraticCurveTo(mx + 8, -3 - h * k + h * 0.15, mx + 5, -3 - h * k); c.closePath(); c.fill(); c.stroke(); }
  }
  c.beginPath(); c.moveTo(0, -25); c.lineTo(7, -24); c.lineTo(0, -23); c.fill(); c.stroke();
  // the sea under her
  c.lineWidth = 0.6; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-22 + i * 9, 5 + Math.abs(i)); c.quadraticCurveTo(-18 + i * 9, 2 + Math.abs(i), -14 + i * 9, 5 + Math.abs(i)); c.stroke(); }
  c.restore();
}
function monster(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.strokeStyle = INK; c.fillStyle = "#cbb88e"; c.lineWidth = 0.9;
  // a sea serpent: humps out of the water, a toothed head, a spout
  c.beginPath(); c.moveTo(-24, 2); c.quadraticCurveTo(-18, -12, -12, 2); c.moveTo(-8, 2); c.quadraticCurveTo(-2, -14, 4, 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(8, 2); c.quadraticCurveTo(10, -14, 18, -12); c.quadraticCurveTo(24, -11, 22, -6); c.lineTo(16, -6); c.quadraticCurveTo(14, -2, 13, 2); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.arc(18, -9.5, 0.8, 0, 7); c.fillStyle = INK; c.fill();
  c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(16 + i * 2, -6); c.lineTo(17 + i * 2, -4.5); } c.stroke();
  c.beginPath(); c.moveTo(18, -13); c.quadraticCurveTo(16, -20, 13, -22); c.moveTo(18, -13); c.quadraticCurveTo(20, -20, 23, -21); c.stroke();
  c.lineWidth = 0.6; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 8 - 4, 4); c.quadraticCurveTo(i * 8, 1, i * 8 + 4, 4); c.stroke(); }
  c.restore();
}
function cartouche(c, W, H, S) {
  const w = S * 58, h = S * 21, x = S * 7, y = S * 7;
  c.save();
  c.fillStyle = "#efe3c4"; c.strokeStyle = INK; c.lineWidth = 1.4;
  // a scrolled frame: the box, its curled ends, a double rule inside
  c.beginPath(); c.moveTo(x + 10, y); c.lineTo(x + w - 10, y); c.quadraticCurveTo(x + w + 8, y + h / 2, x + w - 10, y + h); c.lineTo(x + 10, y + h); c.quadraticCurveTo(x - 8, y + h / 2, x + 10, y); c.closePath(); c.fill(); c.stroke();
  for (const side of [0, 1]) { const cx = side ? x + w - 4 : x + 4; c.beginPath(); c.arc(cx, y + 6, 5, 0, 7); c.stroke(); c.beginPath(); c.arc(cx, y + h - 6, 5, 0, 7); c.stroke(); }
  c.lineWidth = 0.7; c.strokeRect(x + 14, y + 5, w - 28, h - 10);
  c.fillStyle = INK; c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `${Math.round(S * 6.4)}px ${FELL}`; spaced(c, "EUROPA", x + w / 2, y + h * 0.38, S * 1.8);
  c.font = `italic ${Math.round(S * 2.5)}px ${FELL}`;
  c.fillText("nova et accurata descriptio · Anno Domini MDCLXXXIII", x + w / 2, y + h * 0.72);
  c.restore();
}
function scaleBar(c, W, H, S) {
  // a hundred German miles (a German mile being about 7½ km, or a fifteenth of a degree)
  const len = 100 / 15 * K / SPAN_X * GW * S, [x0, y0] = [W - len - S * 12, H - S * 10];
  c.save(); c.strokeStyle = INK; c.lineWidth = 1;
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? "#efe3c4" : INK; c.fillRect(x0 + i * len / 4, y0, len / 4, S * 0.8); }
  c.strokeRect(x0, y0, len, S * 0.8);
  c.fillStyle = INK; c.font = `italic ${Math.round(S * 2.2)}px ${FELL}`; c.textAlign = "center";
  for (let i = 0; i <= 4; i++) c.fillText(String(i * 25), x0 + i * len / 4, y0 - S * 1.2);
  c.fillText("Milliaria Germanica communia", x0 + len / 2, y0 + S * 2.8);
  c.restore();
}
function frame(c, W, H, S) {
  const m = S * 1.1;
  c.save(); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(m, m, W - 2 * m, H - 2 * m);
  c.lineWidth = 0.8; c.strokeRect(m + S * 1.1, m + S * 1.1, W - 2 * m - S * 2.2, H - 2 * m - S * 2.2);
  // degrees along the frame, in alternating bars, numbered every five
  c.font = `${Math.round(S * 1.9)}px ${FELL}`; c.fillStyle = INK; c.textAlign = "center"; c.textBaseline = "middle";
  for (let lon = Math.ceil(BOUNDS.lon0); lon < BOUNDS.lon1; lon++) {
    const x = gridOf(lon, BOUNDS.lat0)[0] * S, x2 = gridOf(lon + 1, BOUNDS.lat0)[0] * S;
    if (lon % 2 === 0) { c.fillRect(x, m, x2 - x, S * 1.1); c.fillRect(x, H - m - S * 1.1, x2 - x, S * 1.1); }
    // (the meridian counted from Ferro, in the Canaries, as the Dutch map-makers counted it: about 18° west of Greenwich)
    if ((lon + 18) % 5 === 0) c.fillText(String(lon + 18), x, m + S * 2.6);
  }
  for (let lat = Math.ceil(BOUNDS.lat0); lat < BOUNDS.lat1; lat++) {
    const y = gridOf(BOUNDS.lon0, lat)[1] * S, y2 = gridOf(BOUNDS.lon0, lat + 1)[1] * S;
    if (lat % 2 === 0) { c.fillRect(m, y2, S * 1.1, y - y2); c.fillRect(W - m - S * 1.1, y2, S * 1.1, y - y2); }
    if (lat % 5 === 0) c.fillText(String(lat), m + S * 3, y);
  }
  c.restore();
}

// the sheet, and over it what changes: the crown under the pointer and the one chosen, the wars, the plague, your clearing
export function drawEurope(cv, E, { hover = null, selected = null, homePop = 2 } = {}) {
  const g = buildGrid(E), W = cv.width, H = cv.height, S = W / GW;
  const key = W + "x" + H + "|" + E.conq.length + "|" + (E.conq.length ? E.conq[E.conq.length - 1].c + "," + E.conq[E.conq.length - 1].r : "") + "|" + (document.fonts && document.fonts.status);
  if (!sheet || key !== sheetKey) { sheet = drawSheet(W, H, E, g, homePop); sheetKey = key; }
  const c = cv.getContext("2d");
  c.drawImage(sheet, 0, 0);
  // the lit crowns: a warm wash over them
  for (const [id, a] of [[hover, 0.16], [selected, 0.28]]) {
    if (!id || !NATIONS[id]) continue;
    c.fillStyle = `rgba(255,236,190,${a})`;
    for (let y = 0; y < GH; y++) { let x0 = -1; for (let x = 0; x <= GW; x++) { const on = x < GW && g[y][x] === id; if (on && x0 < 0) x0 = x; if (!on && x0 >= 0) { c.fillRect(x0 * S, y * S, (x - x0) * S, S + 0.5); x0 = -1; } } }
  }
  // crossed swords over a crown at war (red if with you), a skull over a plague
  const centre = id => { let sx = 0, sy = 0, n = 0; for (let y = 0; y < GH; y += 2) for (let x = 0; x < GW; x += 2) if (g[y][x] === id) { sx += x; sy += y; n++; } return n ? [sx / n * S, sy / n * S] : null; };
  const glyph = (id, t, col, dy = 0) => { const p = centre(id); if (!p) return; c.font = `${Math.round(S * 5)}px ${FELL}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = col; c.fillText(t, p[0], p[1] + S * (4 + dy)); };
  for (const w of E.wars) { glyph(w.a, "⚔", "rgba(90,40,20,0.85)"); glyph(w.b, "⚔", "rgba(90,40,20,0.85)"); }
  for (const id of Object.keys(E.war || {})) if (E.war[id]) glyph(id, "⚔", "#b0281a");
  for (const id of Object.keys(E.plague)) glyph(id, "☠", "rgba(40,30,20,0.85)", 7);
  // your clearing: a little town sign, and its name
  const [hx, hy] = [(HOME.mx + 0.5) * S, (HOME.my + 0.5) * S];
  c.fillStyle = "#b0281a"; c.strokeStyle = INK; c.lineWidth = 1.2;
  c.beginPath(); c.arc(hx, hy, S * (0.9 + Math.min(1.2, homePop / 10)), 0, 7); c.fill(); c.stroke();
  c.font = `italic 600 ${Math.round(S * 3.6)}px ${FELL}`; c.textAlign = "right"; c.textBaseline = "middle"; c.fillStyle = "#6a1a10";
  c.fillText("Forester's Clearing", hx - S * 1.6, hy - S * 1.8);
  return g;
}
// which crown is under a point on the drawn map
export function nationAt(E, cv, x, y) {
  const g = buildGrid(E), S = cv.width / GW, c = Math.floor(x / S), r = Math.floor(y / S);
  const id = g[r] && g[r][c];
  return id && NATIONS[id] ? id : null;
}
