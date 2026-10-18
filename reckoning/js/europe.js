// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Europe in 1683. The land is the real land — Natural Earth's coasts, and each
// spot of it given to the crown that held it that year (europe-data.js, built
// by the app's tools/geo) — and it is drawn as a map of the time was: engraved
// in sepia on parchment, the coasts water-lined, each crown hand-coloured along
// its borders, hills in profile, the seas named in Latin, a compass rose with
// its rhumb lines, a cartouche and a monster in the ocean.
//
// It is not a backdrop. The crowns go to war with each other and the borders
// move; plague and famine fall on them. And each has a view of you — improved
// by envoys, made useful by a trade pact, or ended by a declaration of war,
// after which it is not bandits that come up your road but its soldiers.

import { rng } from "./core.js";
import { GW as WGW, GH as WGH, BOUNDS as WB, IDS, GRID_RLE, COAST as WCOAST, WINDOWS } from "./europe-data.js";
import { rangeKm, fbm } from "./relief.js";

// ---- the sheet in use: the whole of it (Europe and the New World, for a campaign), or a window on it (the story's
//  Europe, which is the very grid it always was). Everything here — the grid, the projection, the coasts, the caches —
//  is the sheet's; useSheet() changes them all at once, and is a no-op when it's the one already in use ----
export let GW = 0, GH = 0, BOUNDS = null, MG_W = 0, MG_H = 0, MAP_ASPECT = 1, HOME = null, SHEET = "";
let K = 1, SPAN_X = 1, SPAN_Y = 1, COAST = [], X0 = 0, Y0 = 0;
// (west of the bend, out in the Atlantic, a degree of longitude is drawn wider — North America's at its own latitude,
//  not Europe's: longitude to "effective" longitude, which the sheet is even in, and back)
// (the sheet is laid out in "effective" degrees: Europe's plain longitude and latitude; North America drawn true to
//  shape about 80°W and larger, blended across the Atlantic — tools/geo/build.mjs, PROJ)
const PJ = WB.proj, cosr = lat => Math.cos(lat * Math.PI / 180) / Math.cos(PJ.ref * Math.PI / 180);
export const fwd = (lon, lat) => {
  const P = PJ; if (!P || lon >= P.b1) return [lon, lat];
  const naY = P.LC + (lat - P.LC) * P.M, naX = lo => P.A + (lo - P.cm) * cosr(lat) * P.M;
  if (lon <= P.b0) return [naX(lon), naY];
  const t = (lon - P.b0) / (P.b1 - P.b0), xa = naX(P.b0);
  return [xa + t * (P.b1 - xa), naY + t * (lat - naY)];
};
export const inv = (ex, ey) => {
  const P = PJ; if (!P || ex >= P.b1) return [ex, ey];
  let lat = P.LC + (ey - P.LC) / P.M, lon = P.cm + (ex - P.A) / (cosr(lat) * P.M);
  if (lon <= P.b0) return [lon, lat];
  let t = 0.5;
  for (let i = 0; i < 12; i++) { lat = (ey - (1 - t) * P.LC * (1 - P.M)) / ((1 - t) * P.M + t); const xa = P.A + (P.b0 - P.cm) * cosr(lat) * P.M; t = Math.max(0, Math.min(1, (ex - xa) / (P.b1 - xa))); }
  return [P.b0 + t * (P.b1 - P.b0), lat];
};
export function useSheet(name) {
  if (name === SHEET) return;
  SHEET = name;
  const [x0, y0, w, h] = name === "world" ? [0, 0, WGW, WGH] : WINDOWS[name], dl = (WB.lon1 - WB.lon0) / WGW, dt = (WB.lat1 - WB.lat0) / WGH;
  X0 = x0; Y0 = y0; GW = MG_W = w; GH = MG_H = h; MAP_ASPECT = h / w;
  // (in effective degrees: a window on Europe, plain ones)
  BOUNDS = { lon0: WB.lon0 + x0 * dl, lon1: WB.lon0 + (x0 + w) * dl, lat0: WB.lat1 - (y0 + h) * dt, lat1: WB.lat1 - y0 * dt, latRef: WB.latRef };
  K = Math.cos(BOUNDS.latRef * Math.PI / 180); SPAN_X = (BOUNDS.lon1 - BOUNDS.lon0) * K; SPAN_Y = BOUNDS.lat1 - BOUNDS.lat0;
  // (the coasts that touch the window, carried to its corner)
  COAST = WCOAST.map(r => r.map(([x, y]) => [x - x0 * 10, y - y0 * 10])).filter(r => r.some(([x, y]) => x > -50 && y > -50 && x < w * 10 + 50 && y < h * 10 + 50)).map(roundRing);
  { const [x, y] = gridOf(...HOME_LL); HOME = { mx: Math.floor(x), my: Math.floor(y) }; }
  BASE = null; gridCache = null; gridKey = ""; sheet = null; sheetKey = ""; coastP = null; relief = null; reliefPart = null; near = null; traced = null; TRC.clear(); SIG = null; shapes = null;
}
// a crown's land, or a people's, or nobody's: the peoples of the New World have their country on the map in their own
// names, and it isn't any crown's to take
export const PEOPLES = {
  p_iroquois: { name: "Haudenosaunee", long: "the Haudenosaunee, the Five Nations of the Iroquois", color: "#b9946a" },
  p_wabanaki: { name: "Wabanaki", long: "the Wabanaki Confederacy", color: "#9aae7e" },
  p_cherokee: { name: "Cherokee", long: "the Cherokee", color: "#c49a7a" },
  p_creek: { name: "Muscogee", long: "the Muscogee (the Creek)", color: "#b8a070" },
  p_choctaw: { name: "Choctaw", long: "the Choctaw", color: "#a8a07e" },
  p_shawnee: { name: "Shawnee", long: "the Shawnee", color: "#a8b07a" },
  p_illinois: { name: "Illinois", long: "the Illinois Confederation", color: "#c0a882" },
  p_anishinaabe: { name: "Anishinaabe", long: "the Anishinaabe — Odawa, Ojibwe and Potawatomi", color: "#94a88a" },
  p_dakota: { name: "Dakota", long: "the Dakota", color: "#bca27c" },
  p_cree: { name: "Cree", long: "the Cree", color: "#9aa890" },
};

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
  austria: { name: "Austrian Empire", color: "#e8a0a8", strength: 5 },
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
  // the nations of the New World's woods (nw): towns behind palisades, no walls of stone and no guns, few muskets
  p_iroquois: { name: "Haudenosaunee", color: "#c09060", strength: 3, nw: true, people: true },
  p_wabanaki: { name: "Wabanaki", color: "#8fae74", strength: 1, nw: true, people: true },
  p_cherokee: { name: "Cherokee", color: "#c8906c", strength: 2, nw: true, people: true },
  p_creek: { name: "Muscogee", color: "#bca064", strength: 2, nw: true, people: true },
  p_choctaw: { name: "Choctaw", color: "#a8a070", strength: 2, nw: true, people: true },
  p_shawnee: { name: "Shawnee", color: "#a4b070", strength: 1, nw: true, people: true },
  p_illinois: { name: "Illinois", color: "#c4a478", strength: 2, nw: true, people: true },
  p_anishinaabe: { name: "Anishinaabe", color: "#8ca884", strength: 2, nw: true, people: true },
  p_dakota: { name: "Dakota", color: "#c0a070", strength: 2, nw: true, people: true },
  p_cree: { name: "Cree", color: "#94a88c", strength: 1, nw: true, people: true },
  p_pawnee: { name: "Pawnee", color: "#c4ac80", strength: 2, nw: true, people: true },
  p_osage: { name: "Osage", color: "#b49870", strength: 2, nw: true, people: true },
  p_caddo: { name: "Caddo", color: "#c8a078", strength: 2, nw: true, people: true },
};
export const NATION_FAITH = {
  scotland: "reformed", england: "reformed", ireland: "catholic", france: "catholic", castile: "catholic", aragon: "catholic", portugal: "catholic", hre: "catholic",
  brandenburg: "lutheran", saxony: "lutheran", bavaria: "catholic", austria: "catholic", milan: "catholic", savoy: "catholic", venice: "catholic", tuscany: "catholic",
  papal: "catholic", naples: "catholic", sicily: "catholic", sweden: "lutheran", denmark: "lutheran", poland: "catholic", russia: "orthodox", cossacks: "orthodox", crimea: "muslim",
  hungary: "catholic", transylvania: "reformed", moldavia: "orthodox", wallachia: "orthodox", ottoman: "muslim", algiers: "muslim", tunis: "muslim", tripoli: "muslim",
  dutch: "reformed", morocco: "muslim",
  p_iroquois: "native", p_wabanaki: "native", p_cherokee: "native", p_creek: "native", p_choctaw: "native", p_shawnee: "native", p_illinois: "native", p_anishinaabe: "native", p_dakota: "native", p_cree: "native", p_pawnee: "native", p_osage: "native", p_caddo: "native",
};
// who can reach you with a war party: the crowns within a few days' march
export const NEAR = new Set(["denmark", "sweden", "brandenburg", "hre", "saxony", "poland", "england", "france", "bavaria", "dutch"]);

// a crown's name as a sentence wants it: "the Kingdom of France", "The Ottoman Empire seizes…", "Denmark"
export const the = id => (NATIONS[id].people || /^(Kingdom|Tsardom|Holy|Papal|Swedish|Austrian|Ottoman|Crimean|Cossacks|Dutch|Sultanate)/.test(NATIONS[id].name) ? "the " : "") + NATIONS[id].name;
export const The = id => { const n = the(id); return n[0].toUpperCase() + n.slice(1); };
// (the Cossacks are many: "the Cossacks seize", not "seizes")
const seizes = id => id === "cossacks" || NATIONS[id].people ? "seize" : "seizes";
const id2take = id => id === "cossacks" || NATIONS[id].people ? "take" : "takes";

// ---- the sheet: longitude and latitude to the grid, and back ----
export const llOf = (gx, gy) => inv(BOUNDS.lon0 + gx / GW * SPAN_X / K, BOUNDS.lat1 - gy / GH * SPAN_Y);
export const gridOf = (lon, lat) => { const [ex, ey] = fwd(lon, lat); return [(ex - BOUNDS.lon0) * K / SPAN_X * GW, (BOUNDS.lat1 - ey) / SPAN_Y * GH]; };
// your clearing, in the woods north-east of Hamburg on the Lübeck road
const HOME_LL = [10.75, 53.72];

// ---- the grid of who holds what ----
let BASE = null, ALL = null;
function baseGrid() {
  if (BASE) return BASE;
  if (!ALL) {
    ALL = [];
    const re = /(\d+)(.)/g; let m;
    while ((m = re.exec(GRID_RLE))) { const n = +m[1], ch = m[2]; const id = ch === "." ? null : ch === "~" ? "wilds" : IDS["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(ch)]; for (let i = 0; i < n; i++) ALL.push(id); }
  }
  BASE = Array.from({ length: GH }, (_, r) => ALL.slice((r + Y0) * WGW + X0, (r + Y0) * WGW + X0 + GW));
  return BASE;
}
// (not a crown's: the free woods, and the peoples' country)
export const isFree = id => id === "wilds";
// the people whose country a square is, if any
export function peopleAt(cv, x, y, E) { const g = buildGrid(E), S = cv.width / GW, id = g[Math.floor(y / S)] && g[Math.floor(y / S)][Math.floor(x / S)]; return id && PEOPLES[id] ? id : null; }
// the political map as it stands: 1683's, with every conquest since laid over it
let gridCache = null, gridKey = "";
// (the same, not copied: for a reader that never writes into it — the campaign asks hundreds of times a turn, and a copy of
//  the whole sheet each time was most of the time a turn took)
export function buildGridRO(E) {
  // (the same conquests, the same map: asked for on every movement of the pointer, so kept)
  const cq = (E && E.conq) || [], key = ((E && E.rev) | 0) + ":" + cq.length + ":" + (cq.length ? cq[cq.length - 1].c + "," + cq[cq.length - 1].r + cq[cq.length - 1].to : "");
  if (gridCache && key === gridKey) return gridCache;
  const g = baseGrid().map(row => row.slice());
  for (const q of cq) if (g[q.r] && g[q.r][q.c] && !isFree(g[q.r][q.c])) g[q.r][q.c] = q.to;
  gridCache = g; gridKey = key; return g;
}
export function buildGrid(E) { return buildGridRO(E).map(row => row.slice()); }
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
  useSheet("europe");
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
  const E = ensureEurope(S), news = [], ids = Object.keys(NATIONS).filter(id => !NATIONS[id].nw);
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
  ["SCOTLAND", -4.2, 57.1, 1], ["ENGLAND", -1.4, 52.5, 2], ["IRELAND", -8.5, 52.8, 1], ["FRANCE", 2.2, 46.9, 3], ["CASTILE", -3.9, 39.9, 2], ["ARAGON", -0.4, 41.5, 0], ["PORTUGAL", -8.1, 39.6, -1, -90],
  ["HOLY ROMAN\nEMPIRE", 8.4, 49.9, 1], ["BRANDENBURG", 13.4, 52.7, -1], ["SAXONY", 13.5, 51.1, -1], ["BAVARIA", 11.6, 48.9, -1], ["AUSTRIA", 14.6, 47.6, 0], ["MILAN", 9.4, 45.5, -1],
  ["SAVOY", 6.9, 44.9, -1], ["VENICE", 12.1, 46.1, -1], ["TUSCANY", 11.1, 43.4, -1], ["PAPAL\nSTATES", 13, 42.7, -1], ["NAPLES", 15.9, 40.9, -1], ["SICILY", 14.1, 37.5, -1],
  ["SWEDEN", 15.4, 60.8, 2], ["FINLAND", 26.5, 62.6, 0], ["DENMARK", 9.2, 56.1, 0], ["NORWAY", 8.4, 61.6, 1], ["POLAND", 19.6, 52, 2], ["LITHUANIA", 25.4, 54.6, 1], ["RUSSIA", 36.5, 57, 3],
  ["COSSACKS", 32.8, 49.8, 0], ["CRIMEAN\nKHANATE", 34.6, 46.3, -1], ["HUNGARY", 19.4, 48.7, -1], ["TRANSYLVANIA", 24, 46.6, -1], ["MOLDAVIA", 27.6, 47.4, -1], ["WALLACHIA", 25, 44.4, -1],
  ["OTTOMAN\nEMPIRE", 22.4, 42.2, 2], ["ANATOLIA", 33.5, 39, 1], ["ALGIERS", 2.4, 34.4, 1], ["TUNIS", 9.6, 34.1, -1], ["TRIPOLI", 15.5, 32.6, -1], ["HOLLAND", 5.4, 52.9, -1], ["MOROCCO", -6.2, 33.4, 1],
  // the New World: the crowns' colonies, and the peoples whose country it is
  ["NEW ENGLAND", -71.6, 42.75, -1], ["NEW YORK", -74.3, 41.3, -1, -60], ["VIRGINIA", -77.6, 37.4, -1], ["CAROLINA", -79.6, 34.4, -1], ["PENSILVANIA", -75.9, 40.0, -1],
  ["NOUVELLE\nFRANCE", -71.0, 48.6, 1], ["ACADIE", -65.6, 45.6, -1], ["FLORIDA", -82.2, 29.4, -1], ["NUEVA ESPAÑA", -98.3, 23.6, 0], ["CUBA", -79.3, 22.0, -1],
  ["TERRE NEUVE", -56.2, 49.2, -1], ["RUPERT'S LAND", -88.5, 54.6, -1],
  ["Haudenosaunee", -76.4, 42.55, -1], ["Wabanaki", -69.6, 45.9, -1], ["Cherokee", -84.1, 35.2, -1], ["Muscogee", -84.9, 32.3, -1], ["Choctaw", -89.6, 32.1, -1],
  ["Shawnee", -83.4, 38.9, -1], ["Illinois", -89.6, 40.2, -1], ["Anishinaabe", -85.5, 44.2, -1], ["Dakota", -95.4, 45.6, -1], ["Cree", -84.5, 50.5, -1], ["Pawnee", -98.2, 40.6, -1], ["Osage", -94.2, 37.6, -1], ["Caddo", -94.4, 32.4, -1],
];
const SEAS = [["OCEANUS\nATLANTICUS", -8.9, 48.9], ["OCEANUS\nGERMANICUS", 3, 55.4], ["MARE BALTICUM", 18.4, 56.5], ["MARE MEDITERRANEUM", 5.2, 38.8], ["MARE ADRIATICUM", 15.4, 43.1, 36], ["PONTUS EUXINUS", 34.4, 43.4], ["MARE\nAEGAEUM", 25, 38.4], ["SINUS\nBOTHNICUS", 20.6, 62.6],
  ["OCEANUS\nATLANTICUS", -40, 44], ["MARE DEL NORT", -62, 33], ["SINUS\nMEXICANUS", -90.5, 25.6], ["MARE\nCHRISTIANUM", -82, 59.5], ["MARE\nGLACIALE", -55, 63.4]];
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
  // the New World's: the St Lawrence, the Hudson, the Mississippi, the Ohio, the Missouri, the Delaware, the Susquehanna, the Connecticut, the Savannah
  [[-66.5, 49.2], [-69.7, 48.1], [-71.2, 46.8], [-72.5, 46.3], [-73.6, 45.5], [-74.7, 45.0], [-75.9, 44.4], [-76.4, 44.1]],
  [[-74.0, 40.7], [-73.95, 41.7], [-73.75, 42.65], [-73.6, 43.3]],
  [[-89.3, 29.2], [-90.1, 30.0], [-91.2, 31.0], [-91.1, 32.6], [-90.2, 35.1], [-89.2, 37.0], [-90.2, 38.7], [-91.2, 40.5], [-91.1, 42.8], [-92.9, 44.9], [-93.6, 46.3], [-95.2, 47.3]],
  [[-89.1, 37.0], [-87.5, 37.9], [-85.8, 38.3], [-84.5, 39.1], [-82.6, 38.6], [-80.7, 39.9], [-80.0, 40.45], [-79.9, 41.6]],
  [[-90.2, 38.8], [-92.0, 38.6], [-94.6, 39.1], [-95.9, 41.0], [-96.6, 42.5], [-98.3, 43.6]],
  [[-75.4, 39.3], [-75.15, 40.0], [-75.0, 40.9], [-75.1, 41.9]], [[-76.1, 39.55], [-76.4, 40.3], [-76.9, 41.0], [-76.1, 41.8]], [[-72.35, 41.3], [-72.6, 42.2], [-72.4, 43.3], [-71.5, 44.9]],
  [[-80.9, 32.05], [-81.5, 32.9], [-82.2, 33.6], [-82.8, 34.6]],
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
  // the New World: the colonies' towns and forts, and the peoples' own towns (no crown's: they're shown, not taken)
  ["Boston", -71.06, 42.36, 2], ["New York", -74.01, 40.71, 2], ["Albany", -73.75, 42.65, 1], ["Philadelphia", -75.16, 39.95, 1], ["Jamestown", -76.78, 37.21, 1],
  ["St. Mary's City", -76.43, 38.19, 1], ["Charles Town", -79.93, 32.78, 1], ["Newport", -71.31, 41.49, 1], ["St. John's", -52.71, 47.56, 1],
  ["Moose Factory", -80.6, 51.27, 1], ["York Factory", -92.4, 57.0, 1],
  ["Québec", -71.21, 46.81, 2], ["Montréal", -73.57, 45.5, 1], ["Trois-Rivières", -72.55, 46.35, 1], ["Port-Royal", -65.52, 44.74, 1], ["Fort Frontenac", -76.48, 44.23, 1],
  ["Plaisance", -53.97, 47.25, 1], ["Michilimackinac", -84.73, 45.86, 1],
  ["La Habana", -82.36, 23.13, 2], ["San Agustín", -81.31, 29.9, 1], ["San Luis de Talimali", -84.32, 30.45, 1],
  ["Onondaga", -76.1, 42.95, 2], ["Ganondagan", -77.42, 42.96, 1], ["Norridgewock", -69.8, 44.77, 1], ["Chota", -84.15, 35.53, 1], ["Coweta", -85.0, 32.3, 1],
  ["Kunshak Chito", -88.9, 32.6, 1], ["Kaskaskia", -88.9, 41.3, 1], ["Chillicothe", -82.98, 39.33, 1], ["Mde Wakan", -93.6, 46.2, 1], ["Waswanipi", -76.5, 49.7, 1], ["Bawating", -84.35, 46.5, 1], ["Chequamegon", -90.9, 46.6, 1], ["Kitkehahki", -98.3, 41.3, 1], ["Osage Village", -94.0, 38.0, 1], ["Kadohadacho", -94.0, 33.4, 1], ["Hasinai", -95.0, 31.6, 1],
];


const lonlat = (lon, lat, S) => { const [x, y] = gridOf(lon, lat); return [x * S, y * S]; };
// (a coast's ring with its corners cut, twice over, so it runs as a coast does and not in straight runs and sharp turns
//  — the long straight stretches of the outline as it's stored made Denmark and the Baltic look cut from card)
function roundRing(R) {
  let P = R;
  for (let it = 0; it < 2; it++) { const Q = []; for (let i = 0; i < P.length; i++) { const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length]; Q.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); } P = Q; }
  return P;
}
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
let sheet = null, sheetKey = "", prevSheet = null;
// ---- a crown's outline: its squares' edges joined into loops, each run through the middles of its edges (so a stair of
// squares becomes a slope) and rounded off; with runs, the stretches of it that are a border with another crown ----
function trace(g, id, borders = false) {
  const VW = GW + 1, out = new Map(), edges = [];
  const at = (x, y) => (g[y] && g[y][x]) || null;
  const add = (x0, y0, x1, y1, other) => { const e = { a: y0 * VW + x0, b: y1 * VW + x1, x: (x0 + x1) / 2, y: (y0 + y1) / 2, other, used: false }; edges.push(e); (out.get(e.a) || out.set(e.a, []).get(e.a)).push(e); };
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (g[y][x] !== id) continue;
    let n;
    if ((n = at(x, y - 1)) !== id) add(x, y, x + 1, y, n);
    if ((n = at(x + 1, y)) !== id) add(x + 1, y, x + 1, y + 1, n);
    if ((n = at(x, y + 1)) !== id) add(x + 1, y + 1, x, y + 1, n);
    if ((n = at(x - 1, y)) !== id) add(x, y + 1, x, y, n);
  }
  const loops = [], runs = [];
  for (const e0 of edges) {
    if (e0.used) continue;
    const loop = []; let e = e0;
    while (e && !e.used) { e.used = true; loop.push(e); const nx = out.get(e.b); e = nx && (nx.find(q => !q.used) || null); }
    if (loop.length < 4) continue;
    loops.push(chaikin(loop.map(q => [q.x, q.y]), true, 2));
    if (borders) {
      // (a border with a crown — not the sea, not the free woods — drawn by the one of the two that comes first)
      const isB = q => q.other && q.other !== "wilds" && NATIONS[q.other] && q.other > id;
      let k0 = loop.findIndex(q => !isB(q)); if (k0 < 0) { runs.push(chaikin(loop.map(q => [q.x, q.y]), true, 2)); continue; }
      let cur = [];
      for (let i = 1; i <= loop.length; i++) { const q = loop[(k0 + i) % loop.length]; if (isB(q)) cur.push([q.x, q.y]); else if (cur.length) { if (cur.length > 1) runs.push(chaikin(cur, false, 2)); cur = []; } }
      if (cur.length > 1) runs.push(chaikin(cur, false, 2));
    }
  }
  return { loops, runs };
}
// rounding a line off: each corner cut, twice over
function chaikin(pts, closed, n) {
  for (let it = 0; it < n; it++) {
    const o = [], N = pts.length;
    if (!closed) o.push(pts[0]);
    for (let i = 0; i < (closed ? N : N - 1); i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % N]; o.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); }
    if (!closed) o.push(pts[N - 1]);
    pts = o;
  }
  return pts;
}
function addLoop(p, pts) { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); }
function addLine(p, pts) { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); }
let GONE = null;
// (the outlines depend only on the map, not the view: kept for as long as the map stands — a close view redrawn as you
//  pan doesn't trace every crown round again)
let traced = null;
// (each crown's trace kept by what it's traced from — its own squares, and for its borders who lies over each edge —
//  so when a town changes hands only the crowns it touched are traced again, not all fifty)
const TRC = new Map(), IDH = new Map(); let SIG = null;
const idHash = id => { let h = IDH.get(id); if (h == null) { h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0; IDH.set(id, h); } return h; };
function sigs(g) {
  if (SIG && SIG.g === g) return SIG.m; const m = new Map();
  for (let y = 0; y < GH; y++) { const row = g[y]; for (let x = 0; x < GW; x++) {
    const id = row[x]; if (!id) continue; let s = m.get(id); if (!s) m.set(id, s = [0, 0, 0, 0]);
    const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0; s[0] = (s[0] + h) >>> 0; s[1] = (s[1] ^ Math.imul(h, 2654435761)) >>> 0; s[2]++;
    for (let d = 0; d < 4; d++) { const nx = x + (d === 1 ? 1 : d === 3 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 0 ? -1 : 0), n = (g[ny] && g[ny][nx]) || null; if (n !== id) s[3] = (s[3] + Math.imul(h + d, n ? idHash(n) : 7)) >>> 0; }
  } }
  SIG = { g, m }; return m;
}
function traceOf(g, id, borders, key) {
  if (!key) return trace(g, id, borders);
  const s = sigs(g).get(id) || [0, 0, 0, 0], k = id + (borders ? "|b|" + s.join(",") : "|" + s.slice(0, 3).join(","));
  let t = TRC.get(k); if (!t) { if (TRC.size > 800) TRC.clear(); TRC.set(k, t = trace(g, id, borders)); }
  return t;
}
// vp: { w, h, z, ox, oy } — only that part of the sheet, drawn at that zoom (sharp close in, not a picture stretched)
let GRAIN = null;
function grainTile() {
  if (GRAIN) return GRAIN; const T = 509, cv = document.createElement("canvas"); cv.width = cv.height = T; const c = cv.getContext("2d"), r = rng(1759);
  for (let i = 0; i < T * T / 60; i++) { c.fillStyle = `rgba(${r() < 0.5 ? "60,40,20" : "255,250,235"},${(r() * 0.08).toFixed(3)})`; c.fillRect(Math.floor(r() * T), Math.floor(r() * T), 1, 1); }
  return (GRAIN = cv);
}
function drawSheet(W, H, E, g, homePop, vp = null, tkey = "") {
  GONE = E && E.gone || null;
  const cv = document.createElement("canvas"); cv.width = vp ? vp.w : W; cv.height = vp ? vp.h : H;
  const at = x => { if (vp) x.setTransform(vp.z, 0, 0, vp.z, -vp.ox * vp.z, -vp.oy * vp.z); return x; }, Z = vp ? vp.z : 1;
  // (a layer drawn in the same place, laid on as it is)
  const layer = () => { const l = document.createElement("canvas"); l.width = cv.width; l.height = cv.height; return l; };
  const lay = l => { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(l, 0, 0); c.restore(); };
  const c = at(cv.getContext("2d")), S = W / GW, r = rng(1683), INKZ = Math.min(1, Math.pow(Z, -0.6));
  // ---- the paper: warm, uneven, a little foxed, darker to the edges ----
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = r() * H, rad = 40 + r() * 160, gr = c.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${170 + r() * 30},${140 + r() * 20},${90 + r() * 20},${0.03 + r() * 0.05})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  { const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(120,90,50,0.22)"); c.fillStyle = vg; c.fillRect(0, 0, W, H); }
  // ---- the sea: a pale wash ----
  // (the sea is left pale, as the colourists left it, with only a cool breath of tint)
  c.save(); c.fillStyle = "rgba(196,216,212,0.42)"; c.fillRect(0, 0, W, H); c.restore();
  c.save(); landPath(c, S); c.rect(W, 0, -W, H); c.clip("evenodd");
  // water-lining: fine rings of ink along every coast, fainter as they go out to sea. Drawn on a layer of their own —
  // each ring a band of ink with its middle cut out — so only the lines themselves reach the paper
  {
    const wl = layer();
    // (the ink a pen's width on the screen, close in or far out: drawn in the sheet's own units, it grew with the zoom
    //  until the rings ran together into a grey band and the coast was a thick black rope)
    const w = at(wl.getContext("2d")), coast = coastPath(S), gap = S * 0.85, lw = Math.max(0.8, S * 0.16) * INKZ;
    w.lineJoin = "round";
    for (let i = 6; i >= 1; i--) {
      w.globalCompositeOperation = "source-over"; w.lineWidth = i * gap * 2 + lw; w.strokeStyle = INK_SOFT + (0.5 * (1 - i / 7)).toFixed(3) + ")"; w.stroke(coast);
      w.globalCompositeOperation = "destination-out"; w.lineWidth = i * gap * 2 - lw; w.strokeStyle = "#000"; w.stroke(coast);
    }
    lay(wl);
  }
  c.restore();
  // ---- the land: the paper, a shade lighter, and each crown hand-coloured — a band of colour along its borders, a thin wash within ----
  c.save(); landPath(c, S); c.clip("evenodd");
  c.fillStyle = "rgba(245,236,210,0.55)"; c.fillRect(0, 0, W, H);
  // (each crown traced round as a line — not the grid's squares — and that line rounded off, the way an engraver drew a
  //  border: then washed inside it, a deeper band of colour along it, and the border itself dotted where one crown
  //  meets another)
  const ext = traced && traced.key === tkey && traced.ext || g.map(row => row.slice());
  // (the colour carried a little out over the sea, so the coast — cut to the real one — is coloured right to its edge)
  if (!(traced && traced.key === tkey && traced.ext)) for (let pass = 0; pass < 3; pass++) { const prev = ext.map(row => row.slice()); for (let y = 0; y < GH; y++) { const P = prev[y], U = prev[y - 1], D = prev[y + 1], X = ext[y]; for (let x = 0; x < GW; x++) if (!P[x]) { const n = P[x + 1] || P[x - 1] || (D && D[x]) || (U && U[x]); if (n) X[x] = n; } } }
  if (tkey) { if (!traced || traced.key !== tkey) traced = { key: tkey, m: new Map() }; traced.ext = ext; }
  const ids = new Set(); for (const row of g) for (const id of row) if (id) ids.add(id);
  const band = Math.max(2, S * 2.2);
  // (the deeper bands drawn on a layer of their own, and softened all at once)
  const bl = layer(); const bc = at(bl.getContext("2d")); bc.lineJoin = "round"; bc.lineWidth = band * 2;
  for (const id of ids) {
    const { loops } = traceOf(ext, id, false, tkey);
    if (!loops.length) continue;
    const path = new Path2D(); for (const L of loops) addLoop(path, L.map(([x, y]) => [x * S, y * S]));
    const [R, G, B] = id === "wilds" ? [120, 140, 90] : hexRGB(NATIONS[id].color);
    c.save(); c.clip(path, "evenodd");
    c.fillStyle = `rgba(${R},${G},${B},${id === "wilds" ? 0.3 : 0.22})`; c.fillRect(0, 0, W, H);
    c.restore();
    if (id !== "wilds") { bc.save(); bc.clip(path, "evenodd"); bc.strokeStyle = `rgba(${R},${G},${B},0.85)`; bc.stroke(path); bc.restore(); }
  }
  c.filter = `blur(${(S * 0.6 * Z).toFixed(1)}px)`; lay(bl); c.filter = "none";
  // borders: dotted, along the rounded line, where one crown meets another (each border once)
  c.save(); c.strokeStyle = INK_SOFT + "0.72)"; c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = Math.max(1.3, S * 0.42) * Math.max(0.55, INKZ); c.setLineDash([0, Math.max(3, S * 0.95)]);
  for (const id of ids) {
    if (isFree(id)) continue;
    for (const run of traceOf(g, id, true, tkey).runs) { const p = new Path2D(); addLine(p, run.map(([x, y]) => [x * S, y * S])); c.stroke(p); }
  }
  c.restore();
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
  // the mountains where they truly run: the land shaded as the light falls on it from the north-west, high ground
  // a shade browner, the highest peaks pale with snow
  c.save(); landPath(c, S); c.clip("evenodd"); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; 
  if (vp && vp.z > 1.6) {
    // (close in: only what's in view, shaded at this zoom — a little past the edges, so a pan shows no seam)
    const m = 0.08, x0 = vp.ox, y0 = vp.oy, w = vp.w / vp.z, h = vp.h / vp.z;
    const part = [(x0 - w * m) / S, (y0 - h * m) / S, (x0 + w * (1 + m)) / S, (y0 + h * (1 + m)) / S].map(v => Math.round(v * 100) / 100);
    c.drawImage(reliefLayer(part), part[0] * S, part[1] * S, (part[2] - part[0]) * S, (part[3] - part[1]) * S);
  } else c.drawImage(reliefLayer(), 0, 0, W, H);
  c.restore();
  c.restore();
  // ---- the coast itself, inked ----
  landPath(c, S); c.strokeStyle = INK; c.lineWidth = Math.max(1.2, S * 0.42) * INKZ; c.lineJoin = "round"; c.stroke();
  // ---- the crowns' names ----
  c.textAlign = "center";
  for (const [n, lo, la, size, ang = 0] of NAMES) {
    // (a crown conquered to the last town: its name gone from the map with it)
    const w0 = n.split(/\s/)[0].toLowerCase(), nid = { holy: "hre", papal: "papal", crimean: "crimea", holland: "dutch", haudenosaunee: "p_iroquois", muscogee: "p_creek" }[w0] || (NATIONS["p_" + w0] ? "p_" + w0 : w0);
    if (GONE && GONE[nid]) continue;
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
  // ---- ornament: the rose, a monster, the cartouche, a scale, the frame ----
  // the rose and its rhumb lines out in the ocean, and a monster in the deep — as the Dutch sheets
  //  filled their seas
  const sea = (lo, la) => { const [x, y] = lonlat(lo, la, S); return [x, y]; };
  const roses = SHEET === "world" ? [[-36, 40, 16], [-10.9, 46.2, 6]] : [[-10.6, 46.0, 7]];
  c.save(); landPath(c, S); c.rect(W, 0, -W, H); c.clip("evenodd"); for (const [lo, la] of roses) { const [x, y] = sea(lo, la); rhumbs(c, x, y, W, H, S); } c.restore();
  for (const [lo, la, rr] of roses) { const [x, y] = sea(lo, la); rose(c, x, y, S * rr); }
  if (SHEET === "world") { const [mx, my] = sea(-44, 28.5); monster(c, mx, my, S * 1.9); }
  cartouche(c, W, H, S);
  scaleBar(c, W, H, S);
  frame(c, W, H, S);
  // the paper's grain, over everything (a tile of it, made once and laid on as a pattern: speck by speck over the whole
  //  sheet it was a quarter of a second each time the map was redrawn)
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = c.createPattern(grainTile(), "repeat"); c.fillRect(0, 0, cv.width, cv.height); c.restore();
  return cv;
}
function nameBoxes(c, S) {
  const out = [];
  const boxOf = (lines, x, y, px, sp, ang) => {
    if (ang) return [x - px, y - px * 5, x + px, y + px * 5];
    const w = Math.max(...lines.map(l => c.measureText(l).width + sp * (l.length - 1))), h = px * 1.1 * lines.length;
    return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  };
  for (const [n, lo, la, size, ang = 0] of NAMES) { const [x, y] = lonlat(lo, la, S), px = Math.round(S * [3.9, 4.5, 5.3, 6.6, 8][size + 1]); c.font = `${size >= 2 ? "" : "italic "}${px}px ${FELL}`; out.push(boxOf(n.split("\n"), x, y, px, size >= 2 ? px * 0.3 : size >= 1 ? px * 0.2 : px * 0.08, ang)); }
  for (const [n, lo, la, ang = 0] of SEAS) { const [x, y] = lonlat(lo, la, S), px = Math.round(S * 4); c.font = `italic ${px}px ${FELL}`; out.push(boxOf(n.split("\n"), x, y, px, px * 0.26, ang)); }
  return out;
}
// the cities, over the sheet at whatever zoom: a dot each, the same size on screen at any zoom, and the name where it
// finds room (right, left, above, below) — so zooming in makes room, and more of the towns' names appear
function drawCities(c, g, S, v, W, H, opt = {}) {
  const k = W / 1300, taken = nameBoxes(c, S).map(b => [(b[0] - v.ox) * v.z, (b[1] - v.oy) * v.z, (b[2] - v.ox) * v.z, (b[3] - v.oy) * v.z]);
  const hit = b => taken.some(t => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  c.textBaseline = "middle";
  const sorted = [...CITIES].sort((a, b) => b[3] - a[3]);
  // the dots first, so no name is written over one
  const at = sorted.map(ct => { const [x, y] = lonlat(ct[1], ct[2], S); return [ct, (x - v.ox) * v.z, (y - v.oy) * v.z]; }).filter(([, x, y]) => x > -40 && y > -40 && x < W + 40 && y < H + 40);
  // (the pictures drawn north to south, so a town further down the sheet stands in front of the one behind it; a
  //  little larger close in)
  const u = k * Math.min(2.3, 1.15 + v.z / (opt.zf || 1) * 0.22);
  for (const [ct, x, y] of [...at].sort((a, b) => a[2] - b[2])) { const own = cityOwner(g, ct), hw = (ct[3] === 3 ? 4.5 : ct[3] === 2 ? 2.5 : 2) * u; townGlyph(c, x, y, u, ct[3], own, { mine: opt.me && own === opt.me, walled: opt.walled && opt.walled[ct[0]], walledKnown: !!opt.walled, pop: opt.pop && opt.pop[ct[0]] }); taken.push([x - hw, y - hw, x + hw, y + hw]); }
  for (const [ct, x, y] of at) {
    const [n, , , rank] = ct;
    c.font = rank === 3 ? `${Math.round(k * 15)}px ${FELL}` : `italic ${Math.round(k * (rank === 2 ? 14 : 13))}px ${FELL}`;
    const w = c.measureText(n).width, h = k * 15, d = u * (rank === 3 ? 5.5 : rank === 2 ? 3.8 : 3.5);
    const up = (rank === 3 ? 4.5 : 3) * u, dn = up, yy = y;
    const tries = [[x + d, yy, "left"], [x - d, yy, "right"], [x, y + dn + h * 0.6, "center"], [x, y - up - h * 0.4, "center"], [x + d * 0.6, y + dn + h * 0.6, "left"], [x + d * 0.6, y - up - h * 0.4, "left"]];
    let put = false;
    for (const [tx, ty, al] of tries) {
      const x0 = al === "left" ? tx : al === "right" ? tx - w : tx - w / 2, b = [x0, ty - h / 2, x0 + w, ty + h / 2];
      if (hit(b)) continue;
      taken.push(b);
      c.textAlign = al; c.fillStyle = INK_SOFT + (rank === 1 ? "0.75)" : "0.92)"); c.fillText(n, tx, ty + k);
      put = true; break;
    }
    // (a crown's seat is always named, even where the country's own name lies across it: written over it, haloed in
    //  the paper's colour so both can be read — Wien under "AUSTRIA" went nameless)
    if (!put && rank === 3) {
      const [tx, ty] = tries[0], b = [tx, ty - h / 2, tx + w, ty + h / 2]; taken.push(b);
      c.save(); c.textAlign = "left"; c.lineJoin = "round"; c.strokeStyle = "rgba(240,228,198,0.9)"; c.lineWidth = 3.2 * k; c.strokeText(n, tx, ty + k);
      c.fillStyle = INK_SOFT + "0.95)"; c.fillText(n, tx, ty + k); c.restore();
    }
  }
}
// a town's mark, as the engravers drew one on a map of the time: a little picture of it standing on its place — a
// seat of the crown walled, with its towers and the spire of its great church; a great town a cluster of roofs about
// its church; a town two or three houses and a steeple; a town of the woods' nations a palisade with a longhouse
// behind it. Its holder's colours fly over it. (x, y): the place; u: the size of a unit on the screen
// opt: { mine: your own (the flag gold-edged), walled: walls built round it, grand: a little larger }
function townGlyph(c, x, y, u, rank, own, opt = {}) {
  // (every town a dot, a little larger the greater it is — a seat of the crown ringed, as the engravers marked one)
  if (!opt.picture) {
    // (on a campaign's map, as great as its people: a town that grows, a bigger dot)
    const r = (opt.pop ? Math.min(3.1, Math.max(1.3, 0.9 + Math.sqrt(opt.pop / 10000) * 0.75)) : rank === 3 ? 2.3 : rank === 2 ? 1.9 : 1.5) * u;
    c.save(); c.fillStyle = INK; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    if (rank === 3) { c.strokeStyle = INK; c.lineWidth = Math.max(0.6, u * 0.45); c.beginPath(); c.arc(x, y, r + 1.3 * u, 0, 7); c.stroke(); }
    if (opt.mine) { c.strokeStyle = "#b8862a"; c.lineWidth = Math.max(0.8, u * 0.7); c.beginPath(); c.arc(x, y, r + (rank === 3 ? 2.6 : 1.2) * u, 0, 7); c.stroke(); }
    c.restore(); return;
  }
  // (on a campaign's map, walls only where they stand — the card and the picture agree; elsewhere a crown's seat is
  //  drawn walled, as the old sheets drew it)
  const woods = own && NATIONS[own] && NATIONS[own].nw, walled = !woods && (opt.walledKnown ? !!opt.walled : (opt.walled || rank === 3));
  const lw = Math.max(0.7, u * 0.75), roof = "rgba(150,72,48,0.92)", wall = "#efe4c6", stone = "#9d9381";
  c.save(); c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = INK; c.lineWidth = lw;
  const base = y + 2.5 * u;
  // (its shadow on the paper: a soft smudge to the south-east, so it stands up off the map)
  c.fillStyle = "rgba(58,42,26,0.16)"; c.beginPath(); c.ellipse(x + 1.2 * u, base + 0.6 * u, (rank === 3 ? 10 : rank === 2 ? 8 : 6) * u, 1.8 * u, 0, 0, 7); c.fill();
  const house = (hx, w, h, rh = w * 0.6) => {
    c.fillStyle = wall; c.beginPath(); c.rect(hx - w / 2, base - h, w, h); c.fill(); c.stroke();
    c.fillStyle = roof; c.beginPath(); c.moveTo(hx - w / 2 - 0.4 * u, base - h); c.lineTo(hx, base - h - rh); c.lineTo(hx + w / 2 + 0.4 * u, base - h); c.closePath(); c.fill(); c.stroke();
  };
  const church = (hx, h, sp) => {
    c.fillStyle = wall; c.beginPath(); c.rect(hx - 1.4 * u, base - h, 2.8 * u, h); c.fill(); c.stroke();
    c.fillStyle = "rgba(70,78,82,0.95)"; c.beginPath(); c.moveTo(hx - 1.7 * u, base - h); c.lineTo(hx, base - h - sp); c.lineTo(hx + 1.7 * u, base - h); c.closePath(); c.fill(); c.stroke();
    return base - h - sp;
  };
  let top;
  if (woods) {
    // the longhouse, round-roofed, and the palisade's stakes before it
    c.fillStyle = "rgba(110,88,66,0.95)"; c.beginPath(); c.moveTo(x - 6 * u, base - 1 * u); c.lineTo(x - 6 * u, base - 3.5 * u); c.quadraticCurveTo(x, base - 9 * u, x + 6 * u, base - 3.5 * u); c.lineTo(x + 6 * u, base - 1 * u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#8a6e50";
    for (let i = -7; i <= 7; i++) { const sx = x + i * 1.05 * u, hh = (3.6 + (i % 2 ? 0.5 : 0)) * u; c.beginPath(); c.moveTo(sx - 0.45 * u, base); c.lineTo(sx - 0.45 * u, base - hh); c.lineTo(sx, base - hh - 0.9 * u); c.lineTo(sx + 0.45 * u, base - hh); c.lineTo(sx + 0.45 * u, base); c.closePath(); c.fill(); c.stroke(); }
    top = base - 9 * u;
  } else if (rank === 3) {
    // walled: two towers at either end of a curtain wall, the roofs and the great church's spire over it
    house(x - 4.5 * u, 4 * u, 5 * u); house(x + 4.8 * u, 3.6 * u, 4.6 * u); top = church(x, 7.5 * u, 6.5 * u);
    if (walled) {
      c.fillStyle = stone; c.beginPath(); c.rect(x - 9 * u, base - 3.4 * u, 18 * u, 3.4 * u); c.fill(); c.stroke();
      for (const tx of [-9, 9]) { c.beginPath(); c.rect(x + tx * u - 1.8 * u, base - 6 * u, 3.6 * u, 6 * u); c.fill(); c.stroke(); for (const m of [-1.2, 0, 1.2]) { c.beginPath(); c.rect(x + tx * u + m * u - 0.45 * u, base - 6.9 * u, 0.9 * u, 0.9 * u); c.fill(); c.stroke(); } }
      for (let m = -6.5; m <= 6.5; m += 2.2) { c.beginPath(); c.rect(x + m * u - 0.5 * u, base - 4.2 * u, 1 * u, 0.8 * u); c.fill(); c.stroke(); }
      c.fillStyle = INK; c.beginPath(); c.arc(x, base - 0.2 * u, 1.2 * u, Math.PI, 0); c.fill();
    }
  } else if (rank === 2) {
    house(x - 4.2 * u, 3.6 * u, 4 * u); house(x + 4 * u, 3.4 * u, 3.6 * u); top = church(x, 5.2 * u, 5 * u);
    if (walled) { c.fillStyle = stone; c.beginPath(); c.rect(x - 7 * u, base - 2.6 * u, 14 * u, 2.6 * u); c.fill(); c.stroke(); for (let m = -5; m <= 5; m += 2) { c.beginPath(); c.rect(x + m * u - 0.45 * u, base - 3.3 * u, 0.9 * u, 0.7 * u); c.fill(); c.stroke(); } for (const tx of [-7.5, 7.5]) { c.beginPath(); c.rect(x + tx * u - 1.4 * u, base - 4.6 * u, 2.8 * u, 4.6 * u); c.fill(); c.stroke(); } }
  } else {
    house(x - 2.4 * u, 3.2 * u, 3.2 * u); top = church(x + 2 * u, 3.8 * u, 3.6 * u);
    if (walled) { c.fillStyle = stone; c.beginPath(); c.rect(x - 5 * u, base - 2.2 * u, 10 * u, 2.2 * u); c.fill(); c.stroke(); for (const tx of [-5.5, 5.5]) { c.beginPath(); c.rect(x + tx * u - 1.2 * u, base - 3.8 * u, 2.4 * u, 3.8 * u); c.fill(); c.stroke(); } }
  }
  // the ground line it stands on
  c.beginPath(); c.moveTo(x - (rank === 3 ? 10 : rank === 2 ? 8 : 6) * u, base); c.lineTo(x + (rank === 3 ? 10 : rank === 2 ? 8 : 6) * u, base); c.stroke();
  // its holder's colours, on a staff over it
  if (own && NATIONS[own]) {
    const fx = woods ? x + 4 * u : x + (rank === 1 ? 2 * u : 0), ft = (woods ? base - 7 * u : top) - 4.5 * u;
    c.beginPath(); c.moveTo(fx, woods ? base - 6 * u : top); c.lineTo(fx, ft); c.stroke();
    c.fillStyle = NATIONS[own].color; c.strokeStyle = opt.mine ? "#b8862a" : INK; c.lineWidth = opt.mine ? lw * 1.8 : lw;
    c.beginPath(); c.moveTo(fx, ft); c.quadraticCurveTo(fx + 2.6 * u, ft - 0.7 * u, fx + 5 * u, ft + 0.2 * u); c.lineTo(fx + 5 * u, ft + 2.6 * u); c.quadraticCurveTo(fx + 2.6 * u, ft + 1.8 * u, fx, ft + 2.4 * u); c.closePath(); c.fill(); c.stroke();
  }
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
// rhumb lines: from a rose, thirty-two fine lines out across the sea, every way the wind can blow
function rhumbs(c, x, y, W, H, S) {
  c.save(); c.lineWidth = Math.max(0.5, S * 0.1); const L = Math.hypot(W, H);
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; c.strokeStyle = INK_SOFT + (i % 4 === 0 ? "0.22)" : "0.1)"); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); }
  c.restore();
}
// a compass rose: sixteen points, each half inked and half left white, in rings, the north marked with a lily
function rose(c, x, y, R) {
  c.save(); c.translate(x, y); c.lineJoin = "round";
  c.fillStyle = "rgba(239,228,198,0.9)"; c.strokeStyle = INK; c.lineWidth = Math.max(0.6, R * 0.03);
  for (const rr of [1.05, 0.98]) { c.beginPath(); c.arc(0, 0, R * rr, 0, 7); c.stroke(); }
  c.beginPath(); c.arc(0, 0, R * 0.98, 0, 7); c.fill();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 - Math.PI / 2, len = i % 4 === 0 ? R : i % 2 === 0 ? R * 0.72 : R * 0.5, w = i % 4 === 0 ? R * 0.13 : R * 0.08, ca = Math.cos(a), sa = Math.sin(a);
    const tip = [ca * len, sa * len], l = [Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w], r = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
    c.fillStyle = INK; c.beginPath(); c.moveTo(0, 0); c.lineTo(...l); c.lineTo(...tip); c.closePath(); c.fill();
    c.fillStyle = "#efe4c6"; c.beginPath(); c.moveTo(0, 0); c.lineTo(...r); c.lineTo(...tip); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = INK; c.beginPath(); c.arc(0, 0, R * 0.06, 0, 7); c.fill();
  // (the lily at the north)
  c.beginPath(); c.moveTo(0, -R * 1.32); c.quadraticCurveTo(R * 0.1, -R * 1.18, 0, -R * 1.06); c.quadraticCurveTo(-R * 0.1, -R * 1.18, 0, -R * 1.32); c.fill();
  for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(0, -R * 1.1); c.quadraticCurveTo(sd * R * 0.16, -R * 1.25, sd * R * 0.12, -R * 1.08); c.stroke(); }
  c.restore();
}
// a sea monster: the humps of a great serpent out of the water, its head reared with the jaws open, a fin, its tail
function monster(c, x, y, k) {
  c.save(); c.translate(x, y); c.strokeStyle = INK; c.lineWidth = Math.max(0.6, k * 0.12); c.lineJoin = "round"; c.fillStyle = "rgba(96,110,96,0.9)";
  for (const [hx, hw] of [[-7, 2.2], [-2.5, 2.6], [2.4, 2.2]]) { c.beginPath(); c.moveTo((hx - hw) * k, 0); c.quadraticCurveTo(hx * k, -hw * 1.6 * k, (hx + hw) * k, 0); c.closePath(); c.fill(); c.stroke(); for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo((hx + i * 0.6) * k, -hw * 0.7 * k); c.lineTo((hx + i * 0.6 + 0.25) * k, -hw * 1.05 * k); c.stroke(); } }
  // (the head, reared up at the front, jaws open; an eye)
  c.beginPath(); c.moveTo(5 * k, 0); c.quadraticCurveTo(5.5 * k, -4.5 * k, 7.6 * k, -5.2 * k); c.lineTo(10 * k, -4.6 * k); c.lineTo(8.2 * k, -4 * k); c.lineTo(9.6 * k, -3.2 * k); c.lineTo(7.4 * k, -3.4 * k); c.quadraticCurveTo(6.6 * k, -1.6 * k, 7 * k, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = INK; c.beginPath(); c.arc(7.9 * k, -4.7 * k, 0.25 * k, 0, 7); c.fill();
  // (the tail, out of the water behind, forked)
  c.fillStyle = "rgba(96,110,96,0.9)"; c.beginPath(); c.moveTo(-10 * k, 0); c.quadraticCurveTo(-11 * k, -2 * k, -12.6 * k, -3 * k); c.lineTo(-11.6 * k, -1.8 * k); c.lineTo(-13 * k, -1.2 * k); c.quadraticCurveTo(-11.2 * k, -0.8 * k, -10.6 * k, 0); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = INK_SOFT + "0.55)"; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo((-12 + i * 4.6) * k, 0.8 * k); c.quadraticCurveTo((-10.6 + i * 4.6) * k, 0.2 * k, (-9.2 + i * 4.6) * k, 0.8 * k); c.stroke(); }
  c.restore();
}
function cartouche(c, W, H, S) {
  // (the world's sheet: its title longer, and the cartouche larger to carry it on so wide a sheet)
  const title = SHEET === "world" ? "EUROPA ET NOVUS ORBIS" : "EUROPA"; if (SHEET === "world") S *= 1.7;
  c.font = `${Math.round(S * 6.4)}px ${FELL}`; const tw = [...title].reduce((t, ch) => t + c.measureText(ch).width, 0) + S * 1.8 * (title.length - 1);
  const w = Math.max(S * 58, tw + S * 22), h = S * 21, x = S * 7 / (SHEET === "world" ? 1.7 : 1), y = S * 7 / (SHEET === "world" ? 1.7 : 1);
  c.save();
  c.fillStyle = "#efe3c4"; c.strokeStyle = INK; c.lineWidth = 1.4;
  // a scrolled frame: the box, its curled ends, a double rule inside
  c.beginPath(); c.moveTo(x + 10, y); c.lineTo(x + w - 10, y); c.quadraticCurveTo(x + w + 8, y + h / 2, x + w - 10, y + h); c.lineTo(x + 10, y + h); c.quadraticCurveTo(x - 8, y + h / 2, x + 10, y); c.closePath(); c.fill(); c.stroke();
  for (const side of [0, 1]) { const cx = side ? x + w - 4 : x + 4; c.beginPath(); c.arc(cx, y + 6, 5, 0, 7); c.stroke(); c.beginPath(); c.arc(cx, y + h - 6, 5, 0, 7); c.stroke(); }
  c.lineWidth = 0.7; c.strokeRect(x + 14, y + 5, w - 28, h - 10);
  c.fillStyle = INK; c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `${Math.round(S * 6.4)}px ${FELL}`; spaced(c, title, x + w / 2, y + h * 0.38, S * 1.8);
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
  for (let lon = Math.ceil(Math.max(BOUNDS.lon0, PJ ? PJ.b1 : -999)); lon < BOUNDS.lon1; lon++) {
    const x = gridOf(lon, BOUNDS.lat0)[0] * S, x2 = gridOf(lon + 1, BOUNDS.lat0)[0] * S;
    if (lon % 2 === 0) { c.fillRect(x, m, x2 - x, S * 1.1); c.fillRect(x, H - m - S * 1.1, x2 - x, S * 1.1); }
    // (the meridian counted from Ferro, in the Canaries, as the Dutch map-makers counted it: about 18° west of Greenwich)
    if ((lon + 18) % 5 === 0) c.fillText(String(lon + 18), x, m + S * 2.6);
  }
  for (let lat = Math.ceil(BOUNDS.lat0); lat < BOUNDS.lat1; lat++) {
    const y = gridOf(BOUNDS.lon1 - 1, lat)[1] * S, y2 = gridOf(BOUNDS.lon1 - 1, lat + 1)[1] * S;
    if (lat % 2 === 0) { c.fillRect(m, y2, S * 1.1, y - y2); c.fillRect(W - m - S * 1.1, y2, S * 1.1, y - y2); }
    if (lat % 5 === 0) c.fillText(String(lat), m + S * 3, y);
  }
  c.restore();
}

// ---- the relief: shaded once, for the whole sheet, from the ranges (relief.js) ----
// (a part of it — gx0, gy0, gx1, gy1 in grid squares — shaded finer, for a close view)
let relief = null, reliefPart = null;
function reliefLayer(part = null) {
  if (!part && relief) return relief;
  if (part && reliefPart && reliefPart.key === part.join()) return reliefPart.cv;
  const [gx0, gy0, gx1, gy1] = part || [0, 0, GW, GH];
  const RW = part ? 760 : 1100, RH = Math.round(RW * (gy1 - gy0) / (gx1 - gx0)), h = new Float32Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const [lon, lat] = llOf(gx0 + (x + 0.5) / RW * (gx1 - gx0), gy0 + (y + 0.5) / RH * (gy1 - gy0));
    let v = rangeKm(lon, lat, K);
    // (ridges and valleys along the range: it reads as mountains, not a smooth swell)
    if (v > 0.04) { const n = fbm(lon * 3.2, lat * 3.2, 31, 4), rdg = 1 - Math.abs(n * 2 - 1), m = fbm(lon * 1.1, lat * 1.1, 11, 2); v *= (0.35 + rdg * 0.9) * (0.6 + m * 0.7); }
    h[y * RW + x] = v;
  }
  const cv = document.createElement("canvas"); cv.width = RW; cv.height = RH;
  const c = cv.getContext("2d"), img = c.createImageData(RW, RH), d = img.data, ex = 2.2 * 1100 / 1400 * (RW / 1100) * (GW / (gx1 - gx0));
  for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) {
    const i = y * RW + x, v = h[i]; if (v < 0.06) continue;
    const dx = (h[i + 1] - h[i - 1]) * ex, dy = (h[i + RW] - h[i - RW]) * ex;
    // (light from the north-west: slopes facing it lit, the far sides in shadow)
    const lit = (-dx - dy) / Math.SQRT2 / Math.sqrt(1 + dx * dx + dy * dy), fade = Math.min(1, (v - 0.06) / 0.35);
    let r, g, b, a;
    if (lit < 0) { r = 92; g = 70; b = 46; a = Math.min(0.62, -lit * 0.95) * fade; }
    else { r = 255; g = 248; b = 228; a = Math.min(0.4, lit * 0.6) * fade; }
    // (the high ground a shade of brown; snow on the highest)
    const hi = Math.min(1, Math.max(0, (v - 0.9) / 1.4)), snow = Math.min(1, Math.max(0, (v - 2.3) / 0.8));
    const tint = 0.22 * hi * fade;
    r = r * (1 - tint) + 150 * tint; g = g * (1 - tint) + 122 * tint; b = b * (1 - tint) + 84 * tint; a = Math.max(a, tint);
    if (snow > 0) { r = r * (1 - snow) + 250 * snow; g = g * (1 - snow) + 250 * snow; b = b * (1 - snow) + 246 * snow; a = Math.max(a, 0.55 * snow); }
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a * 255;
  }
  c.putImageData(img, 0, 0);
  if (part) { reliefPart = { key: part.join(), cv }; return cv; }
  return (relief = cv);
}
// the sheet, and over it what changes: the crown under the pointer and the one chosen, the wars, the plague, your clearing
// view: { z, ox, oy } — the part of the sheet shown (in the canvas's own units at z 1), for zooming and panning
let near = null, nearT = 0;
let shapes = null;
export function drawEurope(cv, E, { hover = null, selected = null, homePop = 2, city = null, hoverCity = null, view = null, homeName = "Forester's Clearing", home = true, sharp = null, me = null, walled = null, zf = 1, spread = null, pop = null } = {}) {
  const g = buildGrid(E), W = cv.width, H = cv.height, S = W / GW, v = view || { z: 1, ox: 0, oy: 0 };
  const key = W + "x" + H + "|" + (E.rev | 0) + "|" + E.conq.length + "|" + (E.conq.length ? E.conq[E.conq.length - 1].c + "," + E.conq[E.conq.length - 1].r : "") + "|" + (document.fonts && document.fonts.status);
  // (drawn at twice the size, so it stays sharp when zoomed)
  if (!sheet || key !== sheetKey) { if (sheet && sheet.width === W * 2) prevSheet = sheet; sheet = drawSheet(W * 2, H * 2, E, g, homePop, null, SHEET + key); sheetKey = key; }
  // (land newly taken, spreading: the sheet as it was laid back over the squares the new colour hasn't reached yet)
  if (spread && !prevSheet) spread = null;
  if (spread) sharp = null;
  const c = cv.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = "#1a1510"; c.fillRect(0, 0, W, H);
  // (close in, the part in view drawn again at that zoom once the view rests — the picture stretched only while it moves)
  const vkey = key + "|" + v.z.toFixed(4) + "," + v.ox.toFixed(2) + "," + v.oy.toFixed(2);
  if (sharp && v.z > 1.15 && near && near.key === vkey) c.drawImage(near.cv, 0, 0);
  else {
    c.setTransform(v.z, 0, 0, v.z, -v.ox * v.z, -v.oy * v.z);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    c.drawImage(sheet, 0, 0, W, H);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (sharp && v.z > 1.15) { clearTimeout(nearT); nearT = setTimeout(() => { near = { key: vkey, cv: drawSheet(W, H, E, g, homePop, { w: W, h: H, z: v.z, ox: v.ox, oy: v.oy }, SHEET + key) }; sharp(); }, 140); }
  }
  c.setTransform(v.z, 0, 0, v.z, -v.ox * v.z, -v.oy * v.z);
  if (spread) {
    // (rows of the squares not reached yet, run together, as the clip for the old sheet; and the squares just reached
    //  washed in their new holder's colour — the front of it, moving out across the land)
    const rows = new Map(), front = [];
    for (const [x, y, st] of spread.cells) { if (st > spread.p) { let r = rows.get(y); if (!r) rows.set(y, r = []); r.push(x); } else if (st > spread.p - 4) front.push([x, y, 1 - (spread.p - st) / 4]); }
    c.save(); c.beginPath();
    for (const [y, xs] of rows) { xs.sort((a, b) => a - b); let a = xs[0], b = a; for (let i = 1; i <= xs.length; i++) { if (i < xs.length && xs[i] === b + 1) { b = xs[i]; continue; } c.rect(a * S - 0.3, y * S - 0.3, (b - a + 1) * S + 0.6, S + 0.6); if (i < xs.length) a = b = xs[i]; } }
    c.clip(); c.drawImage(prevSheet, 0, 0, W, H); c.restore();
    c.save(); c.globalCompositeOperation = "multiply";
    for (const [x, y, a] of front) { const id = g[y] && g[y][x], col = NATIONS[id] && NATIONS[id].color; if (!col) continue; c.globalAlpha = a * 0.55; c.fillStyle = col; c.fillRect(x * S - 0.2, y * S - 0.2, S + 0.4, S + 0.4); }
    c.restore(); c.globalAlpha = 1;
  }
  // the lit crowns: a warm wash over them
  // (one shape for the whole crown, filled once — row by row it overlapped itself in stripes — and laid on as an
  //  overlay, which lightens the paper and the paint but leaves black black: the coasts, frontiers and lettering stay
  //  drawn over it)
  // (each crown's shape made once for the map as it stands, not scanned out of the grid every frame)
  if (!shapes || shapes.key !== key) shapes = { key, wash: new Map(), mid: new Map() };
  for (const [id, a] of [[hover, 0.34], [selected, 0.55]]) {
    if (!id || !NATIONS[id]) continue;
    let p = shapes.wash.get(id); if (!p) { p = new Path2D(); for (let y = 0; y < GH; y++) { let x0 = -1; for (let x = 0; x <= GW; x++) { const on = x < GW && g[y][x] === id; if (on && x0 < 0) x0 = x; if (!on && x0 >= 0) { p.rect(x0 * S, y * S, (x - x0) * S, S + 0.5); x0 = -1; } } } shapes.wash.set(id, p); }
    c.save(); c.globalCompositeOperation = "overlay"; c.fillStyle = `rgba(255,236,190,${a})`; c.fill(p); c.restore();
  }
  // crossed swords over a crown at war (red if with you), a skull over a plague
  const centre = id => { if (shapes.mid.has(id)) return shapes.mid.get(id); let sx = 0, sy = 0, n = 0; for (let y = 0; y < GH; y += 2) for (let x = 0; x < GW; x += 2) if (g[y][x] === id) { sx += x; sy += y; n++; } const p = n ? [sx / n * S, sy / n * S] : null; shapes.mid.set(id, p); return p; };
  const glyph = (id, t, col, dy = 0) => { const p = centre(id); if (!p) return; c.font = `${Math.round(S * 5)}px ${FELL}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = col; c.fillText(t, p[0], p[1] + S * (4 + dy)); };
  for (const w of E.wars) { glyph(w.a, "⚔", "rgba(90,40,20,0.85)"); glyph(w.b, "⚔", "rgba(90,40,20,0.85)"); }
  for (const id of Object.keys(E.war || {})) if (E.war[id]) glyph(id, "⚔", "#b0281a");
  for (const id of Object.keys(E.plague)) glyph(id, "☠", "rgba(40,30,20,0.85)", 7);
  // your clearing: a little town sign, and its name
  // (not on a campaign's map: there you're a crown, not a clearing)
  if (home) {
    const [hx, hy] = [(HOME.mx + 0.5) * S, (HOME.my + 0.5) * S];
    c.fillStyle = "#b0281a"; c.strokeStyle = INK; c.lineWidth = 1.2;
    c.beginPath(); c.arc(hx, hy, S * (0.9 + Math.min(1.2, homePop / 10)), 0, 7); c.fill(); c.stroke();
    c.font = `italic 600 ${Math.round(S * 3.6)}px ${FELL}`; c.textAlign = "right"; c.textBaseline = "middle"; c.fillStyle = "#6a1a10";
    c.fillText(homeName, hx - S * 1.6, hy - S * 1.8);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawCities(c, g, S, v, W, H, { me, walled, zf, pop });
  // the chosen city's ring, over its dot
  for (const [ct, strong] of [[hoverCity, false], [city, true]]) {
    if (!ct) continue;
    const [cx, cy] = lonlat(ct[1], ct[2], S), sx = (cx - v.ox) * v.z, sy = (cy - v.oy) * v.z, k = W / 1300;
    c.beginPath(); c.arc(sx, sy, k * (strong ? 11 : 9), 0, 7); c.lineWidth = strong ? 2.4 : 1.5; c.strokeStyle = strong ? "#b0281a" : "rgba(176,40,26,0.6)"; c.stroke();
  }
  return g;
}
// the city under a point on the drawn map (within a little of its dot), if any
export function cityAt(cv, x, y, z = 1) {
  const S = cv.width / GW;
  let best = null, bd = (cv.width / 1300) * 10 / z;
  for (const ct of CITIES) { const [cx, cy] = lonlat(ct[1], ct[2], S), d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = ct; } }
  return best;
}
// the crown that held a city's ground in 1683
export function cityFirstOwner(city) { return cityOwner(baseGrid(), city); }
// which crown is under a point on the drawn map
export function nationAt(E, cv, x, y) {
  const g = buildGrid(E), S = cv.width / GW, c = Math.floor(x / S), r = Math.floor(y / S);
  const id = g[r] && g[r][c];
  return id && NATIONS[id] ? id : null;
}

useSheet("europe");
