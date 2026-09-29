// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Europe in 1683, as the first Forester draws it: thirty-three crowns painted
// on a coarse grid, the coastlines inked by sampling it through a noise warp,
// and your clearing in the woods beyond Hamburg. It is not a backdrop. The
// crowns go to war with each other and the borders move; plague and famine fall
// on them. And each has a view of you — improved by envoys, made useful by a
// trade pact, or ended by a declaration of war, after which it is not bandits
// that come up your road but its soldiers.

import { rng } from "./core.js";

export const MG_W = 100, MG_H = 56, SCALE = 2, FW = MG_W * SCALE, FH = MG_H * SCALE;
export const NATIONS = {
  scotland: { name: "Scotland", color: "#a0344a", strength: 1, blobs: [[19, 2, 6, 3], [18, 4, 7, 3]] },
  england: { name: "Kingdom of England", color: "#b03a52", strength: 3, blobs: [[18, 7, 7, 6], [17, 11, 3, 3], [23, 12, 3, 2]] },
  ireland: { name: "Ireland", color: "#94505e", strength: 1, blobs: [[12, 6, 4, 5]] },
  france: { name: "Kingdom of France", color: "#2d4d8e", strength: 5, blobs: [[23, 17, 12, 9], [20, 18, 5, 3], [33, 24, 3, 3]] },
  castile: { name: "Castile", color: "#b5541e", strength: 4, blobs: [[14, 26, 10, 10]] },
  aragon: { name: "Aragon", color: "#c86a2e", strength: 2, blobs: [[24, 27, 5, 5]] },
  portugal: { name: "Portugal", color: "#8e6a4a", strength: 2, blobs: [[12, 27, 3, 9]] },
  hre: { name: "Holy Roman Empire", color: "#a98436", strength: 4, blobs: [[33, 13, 9, 9], [31, 16, 3, 4]] },
  brandenburg: { name: "Brandenburg", color: "#8a6c2c", strength: 2, blobs: [[40, 10, 7, 4]] },
  saxony: { name: "Saxony", color: "#97762f", strength: 2, blobs: [[42, 14, 5, 3]] },
  bavaria: { name: "Bavaria", color: "#7d6228", strength: 2, blobs: [[39, 18, 5, 4]] },
  austria: { name: "Austrian Empire", color: "#6b4f1c", strength: 4, blobs: [[43, 20, 7, 4], [45, 18, 4, 2]] },
  milan: { name: "Milan", color: "#a04a3a", strength: 2, blobs: [[36, 23, 3, 2]] },
  savoy: { name: "Savoy", color: "#8e2d4d", strength: 2, blobs: [[34, 24, 3, 3]] },
  venice: { name: "Venice", color: "#a03a6e", strength: 2, blobs: [[38, 23, 5, 2], [43, 25, 3, 2]] },
  tuscany: { name: "Tuscany", color: "#b09a4a", strength: 2, blobs: [[37, 26, 3, 2]] },
  papal: { name: "Papal States", color: "#8e5a8e", strength: 2, blobs: [[39, 27, 3, 3], [41, 29, 2, 2]] },
  naples: { name: "Kingdom of Naples", color: "#b5541e", strength: 2, blobs: [[42, 31, 3, 3], [44, 33, 3, 3]] },
  sicily: { name: "Sicily", color: "#a04a1e", strength: 1, blobs: [[41, 38, 4, 2]] },
  sweden: { name: "Swedish Empire", color: "#4a6a8e", strength: 3, blobs: [[34, 1, 4, 4], [37, 0, 4, 4], [40, 2, 4, 5], [43, 4, 3, 4], [47, 0, 8, 5], [53, 2, 4, 4]] },
  denmark: { name: "Denmark", color: "#6a4a8e", strength: 2, blobs: [[35, 6, 2, 4], [38, 7, 3, 2]] },
  poland: { name: "Poland–Lithuania", color: "#8e2d8e", strength: 4, blobs: [[47, 9, 12, 10], [52, 7, 8, 3]] },
  russia: { name: "Tsardom of Russia", color: "#7a7a2d", strength: 5, blobs: [[60, 1, 39, 15], [64, 15, 34, 10], [59, 16, 5, 4]] },
  cossacks: { name: "Cossacks", color: "#5a8e4a", strength: 2, blobs: [[59, 20, 8, 4]] },
  crimea: { name: "Crimean Khanate", color: "#6aa05a", strength: 2, blobs: [[61, 24, 7, 3], [63, 27, 4, 2]] },
  hungary: { name: "Hungary", color: "#79a065", strength: 2, blobs: [[47, 21, 5, 3]] },
  transylvania: { name: "Transylvania", color: "#86a878", strength: 2, blobs: [[52, 20, 4, 3]] },
  moldavia: { name: "Moldavia", color: "#8fae7f", strength: 2, blobs: [[56, 17, 4, 4]] },
  wallachia: { name: "Wallachia", color: "#7ba26b", strength: 2, blobs: [[52, 24, 7, 2]] },
  ottoman: { name: "Ottoman Empire", color: "#2d7a3a", strength: 6, blobs: [[46, 26, 8, 6], [49, 24, 4, 3], [48, 32, 4, 3], [49, 35, 3, 2], [54, 30, 3, 2], [57, 30, 14, 7], [70, 28, 9, 7], [74, 33, 4, 9], [64, 42, 12, 5], [62, 40, 4, 3], [76, 30, 10, 8]] },
  algiers: { name: "Algiers", color: "#3a8e4a", strength: 2, blobs: [[24, 37, 9, 3], [22, 36, 4, 2]] },
  tunis: { name: "Tunis", color: "#3a8e4a", strength: 2, blobs: [[33, 36, 4, 4]] },
  tripoli: { name: "Tripolitania", color: "#3a8e4a", strength: 2, blobs: [[38, 39, 9, 3], [46, 40, 6, 3]] },
};
export const NATION_FAITH = {
  scotland: "reformed", england: "reformed", ireland: "catholic", france: "catholic", castile: "catholic", aragon: "catholic", portugal: "catholic", hre: "catholic",
  brandenburg: "lutheran", saxony: "lutheran", bavaria: "catholic", austria: "catholic", milan: "catholic", savoy: "catholic", venice: "catholic", tuscany: "catholic",
  papal: "catholic", naples: "catholic", sicily: "catholic", sweden: "lutheran", denmark: "lutheran", poland: "catholic", russia: "orthodox", cossacks: "orthodox", crimea: "muslim",
  hungary: "catholic", transylvania: "reformed", moldavia: "orthodox", wallachia: "orthodox", ottoman: "muslim", algiers: "muslim", tunis: "muslim", tripoli: "muslim",
};
export const LABELS = [
  ["Scotland", 21, 4], ["England", 21, 10], ["Ireland", 13, 8], ["France", 28, 21], ["Castile", 18, 30], ["Aragon", 26, 29], ["Portugal", 13, 32], ["Holy Roman\nEmpire", 37, 15], ["Brandenburg", 44, 11],
  ["Saxony", 45, 16], ["Bavaria", 41, 20], ["Austria", 46, 22], ["Milan", 36, 23], ["Savoy", 35, 26], ["Venice", 41, 24], ["Tuscany", 38, 27], ["Papal\nStates", 40, 29], ["Naples", 46, 34], ["Sicily", 43, 40],
  ["Swedish Empire", 44, 2], ["Denmark", 35, 6], ["Poland–Lithuania", 52, 12], ["Tsardom of Russia", 76, 8], ["Cossacks", 62, 22], ["Crimean\nKhanate", 64, 25], ["Hungary", 49, 23], ["Transylvania", 54, 20],
  ["Moldavia", 58, 17], ["Wallachia", 55, 26], ["Ottoman Empire", 63, 36], ["Algiers", 27, 39], ["Tunis", 35, 38], ["Tripolitania", 42, 41],
];
// a crown's name as a sentence wants it: "the Kingdom of France", "The Ottoman Empire seizes…", "Denmark"
export const the = id => (/^(Kingdom|Tsardom|Holy|Papal|Swedish|Austrian|Ottoman|Crimean|Cossacks)/.test(NATIONS[id].name) ? "the " : "") + NATIONS[id].name;
export const The = id => { const n = the(id); return n[0].toUpperCase() + n.slice(1); };
export const HOME = { mx: 37, my: 11 };   // the woods beyond Hamburg
// who can reach you with a war party: the crowns within a few days' march
export const NEAR = new Set(["denmark", "sweden", "brandenburg", "hre", "saxony", "poland", "england", "france", "bavaria"]);

// ---- the grid ----
const WILDS = [[33, 7, 7, 6], [34, 13, 5, 1]];
const SEAS = [[16, 15, 14, 2], [26, 4, 7, 10], [43, 9, 4, 4], [56, 28, 7, 3], [52, 32, 4, 4], [44, 27, 2, 4]];
function vnoise(x, y, seed) {
  const L = 13, xi = Math.floor(x / L), yi = Math.floor(y / L);
  let fx = x / L - xi, fy = y / L - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => ((((a + 1e5) * 73856093) ^ ((b + 1e5) * 19349663) ^ (seed * 83492791)) >>> 0) % 1024 / 1024;
  const a = h(xi, yi), b = h(xi + 1, yi), c2 = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * fx + (c2 - a + (a - b + d - c2) * fx) * fy;
}
// the political map as it stands: 1683's, with every conquest since laid over it
export function buildGrid(E) {
  const g = Array.from({ length: MG_H }, () => Array(MG_W).fill(null));
  for (const [x, y, w, h] of WILDS) for (let r = y; r < y + h && r < MG_H; r++) for (let c = x; c < x + w && c < MG_W; c++) g[r][c] = "wilds";
  for (const [id, n] of Object.entries(NATIONS)) for (const [x, y, w, h] of n.blobs) for (let r = y; r < y + h && r < MG_H; r++) for (let c = x; c < x + w && c < MG_W; c++) g[r][c] = id;
  for (const [x, y, w, h] of SEAS) for (let r = y; r < y + h && r < MG_H; r++) for (let c = x; c < x + w && c < MG_W; c++) g[r][c] = null;
  for (const q of (E && E.conq) || []) if (g[q.r] && g[q.r][q.c]) g[q.r][q.c] = q.to;
  return g;
}
function neighbours(g, id) {
  const out = new Set();
  for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++) {
    if (g[r][c] !== id) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = g[r + dy] && g[r + dy][c + dx]; if (n && n !== id && NATIONS[n]) out.add(n); }
  }
  return [...out];
}
const hexRGB = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ---- the state of Europe, kept with the settlement ----
// rel: each crown's view of you, −100 to 100 (it starts where its faith and its distance put it)
// war: crowns at war with you; wars: crowns at war with each other; conq: land that changed hands; pact: trade pacts
export function ensureEurope(S) {
  if (S.europe) return S.europe;
  const r = rng(77), rel = {};
  for (const id of Object.keys(NATIONS)) rel[id] = Math.round((NATION_FAITH[id] === "lutheran" ? 10 : NATION_FAITH[id] === "catholic" ? -5 : 0) + (r() - 0.5) * 30);
  return (S.europe = { rel, war: {}, wars: [], conq: [], pact: {}, plague: {}, famine: {}, beaten: {}, news: [] });
}
export const relWord = v => v >= 50 ? "friendly" : v >= 15 ? "well disposed" : v > -15 ? "indifferent" : v > -50 ? "cool" : "hostile";
export function strengthOf(E, id) { return Math.max(1, NATIONS[id].strength - (E.plague[id] ? 2 : 0) - (E.famine[id] ? 1 : 0)); }

// a day in Europe: wars start, battles are fought and land changes hands, peace is made; plague and famine come
// and go; crowns' tempers drift. Returns news — [{title, sub, img}] — worth a card.
export function europeDay(S, day) {
  const E = ensureEurope(S), news = [], ids = Object.keys(NATIONS);
  const say = (title, sub, img) => { news.push({ title, sub, img }); E.news.unshift({ day, title, sub }); E.news.length = Math.min(E.news.length, 30); };
  let g = buildGrid(E);
  // a new war, now and then, between neighbours
  if (E.wars.length < 3 && Math.random() < 0.18) {
    const a = ids[Math.floor(Math.random() * ids.length)], nb = neighbours(g, a).filter(b => !E.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)));
    if (nb.length) { const b = nb[Math.floor(Math.random() * nb.length)]; E.wars.push({ a, b, battles: 0 }); say(`${The(a)} and ${the(b)} are at war!`, "Word arrives from afar", "event_war"); }
  }
  // the battles of the wars there are
  for (const w of E.wars.slice()) {
    if (Math.random() > 0.45) continue;
    const sa = strengthOf(E, w.a), sb = strengthOf(E, w.b), aWins = Math.random() < sa / (sa + sb);
    const win = aWins ? w.a : w.b, lose = aWins ? w.b : w.a;
    const front = [];
    for (let r = 0; r < MG_H; r++) for (let c = 0; c < MG_W; c++) {
      if (g[r][c] !== lose) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[r + dy] && g[r + dy][c + dx] === win)) front.push([c, r]);
    }
    const take = Math.min(front.length, 1 + Math.floor(Math.random() * 2));
    for (let i = 0; i < take; i++) {
      const [c, r] = front.splice(Math.floor(Math.random() * front.length), 1)[0];
      E.conq = E.conq.filter(q => !(q.c === c && q.r === r)); E.conq.push({ c, r, to: win }); g[r][c] = win;
    }
    w.battles++;
    if (take) say(`${The(win)} seizes land from ${the(lose)}!`, "The borders of Europe shift", "event_conquest");
    if ((w.battles >= 3 && Math.random() < 0.35) || !front.length) { E.wars.splice(E.wars.indexOf(w), 1); say(`${The(w.a)} and ${the(w.b)} make peace.`, "A weary truce is signed", "event_peace"); }
  }
  // plague and famine
  for (const id of ids) {
    if (E.plague[id] && --E.plague[id] <= 0) delete E.plague[id];
    if (E.famine[id] && --E.famine[id] <= 0) delete E.famine[id];
  }
  if (Math.random() < 0.08) { const id = ids[Math.floor(Math.random() * ids.length)]; if (!E.plague[id]) { E.plague[id] = 6 + Math.floor(Math.random() * 6); say(`Plague walks the towns of ${the(id)}.`, "Their strength fails, and their trade stops", "event_defeat"); } }
  if (Math.random() < 0.08) { const id = ids[Math.floor(Math.random() * ids.length)]; if (!E.famine[id]) { E.famine[id] = 5 + Math.floor(Math.random() * 5); say(`The harvest fails across ${the(id)}.`, "Grain is worth more than silver there", "event_caravan"); } }
  // tempers drift back toward where their faith puts them, a little a day; a crown at war with you softens slowly
  const st = S.stateFaith;
  for (const id of ids) {
    const home = (st && NATION_FAITH[id] === st ? 20 : 0) + (NATION_FAITH[id] === "lutheran" ? 10 : 0);
    E.rel[id] += Math.sign(home - E.rel[id]) * Math.min(1, Math.abs(home - E.rel[id]));
  }
  return news;
}

// ---- drawing: the fine grid through a noise warp, borders darkened, labels, your clearing, the wars ----
let paper = null, paperKey = "";
export function drawEurope(cv, E, { hover = null, selected = null, homePop = 2 } = {}) {
  const g = buildGrid(E), key = JSON.stringify(E.conq);
  if (!paper || key !== paperKey) {
    paperKey = key;
    paper = document.createElement("canvas"); paper.width = FW; paper.height = FH;
    const ctx = paper.getContext("2d"), img = ctx.createImageData(FW, FH);
    const idAt = new Array(FW * FH);
    for (let r = 0; r < FH; r++) for (let c = 0; c < FW; c++) {
      const wx = c + (vnoise(c * 3, r * 3, 1) - 0.5) * 3.2, wy = r + (vnoise(c * 3, r * 3, 2) - 0.5) * 3.2;
      const cc = Math.max(0, Math.min(MG_W - 1, Math.floor(wx / SCALE))), rr = Math.max(0, Math.min(MG_H - 1, Math.floor(wy / SCALE)));
      idAt[r * FW + c] = g[rr][cc];
    }
    for (let i = 0; i < FW * FH; i++) {
      const id = idAt[i], x = i % FW, y = (i / FW) | 0;
      let rgb = !id ? [22, 48, 63] : id === "wilds" ? [85, 97, 78] : hexRGB(NATIONS[id].color);
      // a darker line where one crown meets another, and a pale one along the coast
      const edge = [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([dx, dy]) => { const j = (y + dy) * FW + (x + dx); return x + dx >= 0 && x + dx < FW && y + dy >= 0 && y + dy < FH && idAt[j] !== id; });
      if (edge) rgb = id ? rgb.map(v => v * 0.55) : [58, 86, 98];
      img.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }
  const c = cv.getContext("2d"), W = cv.width, H = cv.height, k = W / FW;
  c.imageSmoothingEnabled = false;
  c.drawImage(paper, 0, 0, W, H);
  const at = (mx, my) => [(mx + 0.5) * SCALE * k, (my + 0.5) * SCALE * k];
  // the one you point at, and the one chosen, lit
  for (const [id, a] of [[hover, 0.18], [selected, 0.3]]) {
    if (!id || !NATIONS[id]) continue;
    c.fillStyle = `rgba(255,240,200,${a})`;
    for (let r = 0; r < MG_H; r++) for (let cc = 0; cc < MG_W; cc++) if (g[r][cc] === id) c.fillRect(cc * SCALE * k, r * SCALE * k, SCALE * k, SCALE * k);
  }
  // crowns at war with you: crossed swords over them; crowns at war with each other: a red line between
  c.font = `600 ${Math.max(9, Math.round(k * 3.3))}px "Open Sans", sans-serif`; c.textAlign = "center";
  for (const [txt, x, y] of LABELS) {
    const lines = txt.split("\n"), [px, py] = at(x, y);
    lines.forEach((t, i) => { c.fillStyle = "rgba(0,0,0,0.55)"; c.fillText(t, px + 1, py + 1 + i * k * 3.6); c.fillStyle = "rgba(245,236,214,0.92)"; c.fillText(t, px, py + i * k * 3.6); });
  }
  const mark = (id, glyph, col) => {
    let sx = 0, sy = 0, n = 0;
    for (let r = 0; r < MG_H; r++) for (let cc = 0; cc < MG_W; cc++) if (g[r][cc] === id) { sx += cc; sy += r; n++; }
    if (!n) return;
    const [px, py] = at(sx / n, sy / n + 2.2);
    c.font = `${Math.round(k * 7)}px serif`; c.fillStyle = col; c.fillText(glyph, px, py);
  };
  for (const id of Object.keys(E.war || {})) if (E.war[id]) mark(id, "⚔", "#ff5a4a");
  for (const w of E.wars) { mark(w.a, "⚔", "rgba(255,210,160,0.8)"); mark(w.b, "⚔", "rgba(255,210,160,0.8)"); }
  for (const id of Object.keys(E.plague)) mark(id, "☠", "rgba(230,230,210,0.9)");
  // your clearing, growing with it
  const [hx, hy] = at(HOME.mx, HOME.my), rad = k * (1.5 + Math.min(2, homePop / 6));
  c.fillStyle = "#e8c860"; c.strokeStyle = "#1a1208"; c.lineWidth = 2;
  c.beginPath(); c.arc(hx, hy, rad, 0, Math.PI * 2); c.fill(); c.stroke();
  // (to the left of it: Brandenburg's name is on the right)
  c.font = `700 ${Math.max(10, Math.round(k * 4.6))}px "Open Sans", sans-serif`; c.textAlign = "right";
  c.fillStyle = "rgba(0,0,0,0.6)"; c.fillText("You", hx - rad - 3 + 1, hy + 5); c.fillStyle = "#fff4d0"; c.fillText("You", hx - rad - 3, hy + 4);
  return g;
}
// which crown is under a point on the drawn map
export function nationAt(E, cv, x, y) {
  const g = buildGrid(E), k = cv.width / FW, c = Math.floor(x / (SCALE * k)), r = Math.floor(y / (SCALE * k));
  const id = g[r] && g[r][c];
  return id && NATIONS[id] ? id : null;
}
