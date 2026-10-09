// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The map, drawn as a map of 1683 would be: ink on parchment, forests as
// stamped trees, roads as double brown lines, water hatched, towns in red.
// The corner minimap and the full map (J) are the same drawing at two sizes.

export const INK = "#3b2a1a", PAPER = "#dccb9f", ROADC = "#8a5a2e", WATERC = "#9aaba4", WATERH = "#5f7874", TOWN = "#a4553a", TREEC = "#4a5634", SERIF = '"IM Fell English", Georgia, serif';

// a sheet of parchment: speckle, fibres and stains, drawn once and tiled
let paper = null;
function paperPattern(c) {
  if (!paper) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const p = cv.getContext("2d");
    p.fillStyle = PAPER; p.fillRect(0, 0, 256, 256);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) { p.fillStyle = `rgba(${rnd() < 0.5 ? "90,60,30" : "255,245,220"},${0.04 + rnd() * 0.06})`; p.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
    p.strokeStyle = "rgba(110,80,40,0.06)"; p.lineWidth = 0.6;
    for (let i = 0; i < 90; i++) { const x = rnd() * 256, y = rnd() * 256, a = rnd() * 6.3, l = 6 + rnd() * 18; p.beginPath(); p.moveTo(x, y); p.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); p.stroke(); }
    for (let i = 0; i < 6; i++) { const g = p.createRadialGradient(rnd() * 256, rnd() * 256, 0, rnd() * 256, rnd() * 256, 30 + rnd() * 50); g.addColorStop(0, "rgba(140,100,50,0.07)"); g.addColorStop(1, "rgba(140,100,50,0)"); p.fillStyle = g; p.fillRect(0, 0, 256, 256); }
    paper = cv;
  }
  return c.createPattern(paper, "repeat");
}
export function fillPaper(c, W, H) {
  c.fillStyle = paperPattern(c); c.fillRect(0, 0, W, H);
}

// a stamped tree: a spruce is a pointed tuft on a stalk, a broadleaf a round one
export function tree(c, x, y, s, kind) {
  c.beginPath();
  if (kind === "spruce") { c.moveTo(x, y - s * 1.3); c.lineTo(x + s * 0.7, y + s * 0.3); c.lineTo(x - s * 0.7, y + s * 0.3); c.closePath(); }
  else { c.arc(x, y - s * 0.4, s * 0.62, 0, Math.PI * 2); }
  c.fill();
  c.fillRect(x - 0.5, y + s * 0.2, 1, s * 0.5);
}

// a road as a map shows one: two thin ink lines with brown between
export function road(c, pts, X, Z, width) {
  if (pts.length < 2) return;
  const path = () => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p.x), Z(p.z)) : c.moveTo(X(p.x), Z(p.z))); };
  c.lineCap = "round"; c.lineJoin = "round";
  path(); c.strokeStyle = INK; c.lineWidth = width + 1.6; c.stroke();
  path(); c.strokeStyle = "#c9a36a"; c.lineWidth = width; c.stroke();
  path(); c.strokeStyle = ROADC; c.lineWidth = Math.max(0.8, width * 0.35); c.setLineDash([width * 1.4, width * 1.1]); c.stroke(); c.setLineDash([]);
}

// water: a pale wash with a hatch of short ripples
export function water(c, x, y, w, h) {
  c.fillStyle = WATERC; c.fillRect(x, y, w, h);
  c.strokeStyle = WATERH; c.lineWidth = 0.8;
  for (let yy = y + 4; yy < y + h; yy += 6) for (let xx = x + ((yy / 6) % 2) * 5; xx < x + w; xx += 12) { c.beginPath(); c.moveTo(xx, yy); c.quadraticCurveTo(xx + 2.5, yy - 2, xx + 5, yy); c.stroke(); }
}

// has this spot been seen? (the explored set holds 6 m cells as "i,j")
export const seen = (set, x, z) => !set || set.has(Math.floor(x / 6) + "," + Math.floor(z / 6));
export function label(c, text, x, y, size = 13, color = INK, italic = true) {
  c.font = `${italic ? "italic " : ""}${size}px ${SERIF}`;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.lineWidth = 3; c.strokeStyle = "rgba(220,203,159,0.85)"; c.strokeText(text, x, y);
  c.fillStyle = color; c.fillText(text, x, y);
}

// a compass rose, in ink with a red north
export function compass(c, x, y, r) {
  c.save(); c.translate(x, y);
  c.strokeStyle = INK; c.lineWidth = 1;
  c.beginPath(); c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, r * 0.68, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, long = i % 2 === 0, l = long ? r : r * 0.6, wv = long ? r * 0.16 : r * 0.1;
    for (const half of [0, 1]) {
      c.beginPath(); c.moveTo(0, 0);
      c.lineTo(Math.sin(a) * l, -Math.cos(a) * l);
      c.lineTo(Math.sin(a + (half ? 1 : -1) * Math.PI / 2) * wv, -Math.cos(a + (half ? 1 : -1) * Math.PI / 2) * wv);
      c.closePath();
      c.fillStyle = i === 0 ? (half ? "#9a2e22" : "#c9483a") : (half ? INK : "#e9dcb8");
      c.fill(); c.stroke();
    }
  }
  label(c, "N", 0, -r - 9, 14, "#9a2e22", false);
  c.restore();
}

// the arrow that is you
export function you(c, x, y, yaw, s = 1) {
  c.save(); c.translate(x, y); c.rotate(-yaw); c.scale(s, s);
  c.fillStyle = "#9a2e22"; c.strokeStyle = "#f3e7c6"; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(0, 3); c.lineTo(-5.5, 6); c.closePath(); c.fill(); c.stroke();
  c.restore();
}

// ---- the map's own symbols, in ink on the parchment ----
// a lump of rock, faceted, with what is in it showing: plain grey stone with a crack; copper's green and orange flecks;
// tin's pale crystals; iron's rust-red streaks
const ROCK_SHAPE = [[-1, 0.15], [-0.7, -0.7], [0.05, -1], [0.8, -0.6], [1, 0.25], [0.55, 0.85], [-0.45, 0.9]];
export function oreIcon(c, x, y, kind, s = 5) {
  c.save(); c.translate(x, y);
  c.fillStyle = kind === "stone" || !kind ? "#8e897d" : "#6e6a60";
  c.beginPath(); ROCK_SHAPE.forEach(([a, b], i) => i ? c.lineTo(a * s, b * s) : c.moveTo(a * s, b * s)); c.closePath(); c.fill();
  c.fillStyle = "rgba(255,248,230,0.28)"; c.beginPath(); c.moveTo(-0.7 * s, -0.7 * s); c.lineTo(0.05 * s, -1 * s); c.lineTo(0.8 * s, -0.6 * s); c.lineTo(0.1 * s, -0.25 * s); c.closePath(); c.fill();
  if (kind === "copper") { c.fillStyle = "#3aa878"; for (const [a, b] of [[-0.35, 0.1], [0.35, 0.35], [0.1, -0.35]]) { c.beginPath(); c.arc(a * s, b * s, s * 0.2, 0, Math.PI * 2); c.fill(); } c.fillStyle = "#d0803e"; c.beginPath(); c.arc(0.55 * s, -0.15 * s, s * 0.16, 0, Math.PI * 2); c.fill(); }
  else if (kind === "tin") { c.fillStyle = "#e6ebf2"; for (const [a, b] of [[-0.3, 0.15], [0.35, 0.3], [0.2, -0.35]]) { c.beginPath(); c.moveTo(a * s, (b - 0.24) * s); c.lineTo((a + 0.14) * s, b * s); c.lineTo(a * s, (b + 0.24) * s); c.lineTo((a - 0.14) * s, b * s); c.closePath(); c.fill(); } }
  else if (kind === "iron") { c.strokeStyle = "#b2482c"; c.lineWidth = Math.max(1.2, s * 0.24); c.lineCap = "round"; c.beginPath(); c.moveTo(-0.55 * s, 0.4 * s); c.lineTo(0.1 * s, -0.25 * s); c.moveTo(-0.05 * s, 0.6 * s); c.lineTo(0.55 * s, 0.05 * s); c.stroke(); }
  else { c.strokeStyle = "rgba(59,42,26,0.6)"; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-0.3 * s, -0.5 * s); c.lineTo(0, 0.05 * s); c.lineTo(-0.15 * s, 0.6 * s); c.stroke(); }
  c.strokeStyle = INK; c.lineWidth = Math.max(0.8, s * 0.16); c.lineJoin = "round";
  c.beginPath(); ROCK_SHAPE.forEach(([a, b], i) => i ? c.lineTo(a * s, b * s) : c.moveTo(a * s, b * s)); c.closePath(); c.stroke();
  c.restore();
}
// a cave: a shoulder of hillside, the dark mouth in it, and the old timbers propping it
export function caveIcon(c, x, y, s = 6) {
  c.save(); c.translate(x, y);
  c.fillStyle = "#8a7a62"; c.beginPath(); c.moveTo(-1.6 * s, 0.8 * s); c.quadraticCurveTo(-1.2 * s, -1.1 * s, 0, -1.25 * s); c.quadraticCurveTo(1.2 * s, -1.1 * s, 1.6 * s, 0.8 * s); c.closePath(); c.fill();
  c.strokeStyle = INK; c.lineWidth = Math.max(0.9, s * 0.15); c.stroke();
  c.fillStyle = "#15110c"; c.beginPath(); c.moveTo(-0.6 * s, 0.8 * s); c.lineTo(-0.6 * s, -0.05 * s); c.quadraticCurveTo(0, -0.75 * s, 0.6 * s, -0.05 * s); c.lineTo(0.6 * s, 0.8 * s); c.closePath(); c.fill();
  c.strokeStyle = "#7a5634"; c.lineWidth = Math.max(1, s * 0.18); c.lineCap = "round";
  c.beginPath(); c.moveTo(-0.62 * s, 0.8 * s); c.lineTo(-0.62 * s, -0.2 * s); c.moveTo(0.62 * s, 0.8 * s); c.lineTo(0.62 * s, -0.2 * s); c.moveTo(-0.82 * s, -0.25 * s); c.lineTo(0.82 * s, -0.25 * s); c.stroke();
  c.restore();
}
// what the map's marks mean: [draw(c, x, y), words]
export const LEGEND = [
  [(c, x, y) => you(c, x, y + 1, 0, 0.75), "You"],
  [(c, x, y) => { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillStyle = "#c8962e"; c.strokeStyle = INK; c.lineWidth = 1.2; c.fillRect(-4, -4, 8, 8); c.strokeRect(-4, -4, 8, 8); c.restore(); }, "Where to go"],
  [(c, x, y) => dot(c, x, y, "#2e6a40", 3.6), "Your brother or sister"],
  [(c, x, y) => dot(c, x, y, "#6a5a48", 2.6), "Settlers, and other folk"],
  [(c, x, y) => { c.strokeStyle = "rgba(179,38,30,0.55)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 9, y - 4); c.stroke(); dot(c, x, y, "#b3261e", 3.6); }, "The watch, and where they look"],
  [(c, x, y) => { c.fillStyle = TOWN; c.strokeStyle = INK; c.lineWidth = 1; c.fillRect(x - 4, y - 5, 8, 10); c.strokeRect(x - 4, y - 5, 8, 10); }, "Buildings"],
  [(c, x, y) => { c.fillStyle = TREEC; tree(c, x, y + 2, 4.2, "spruce"); }, "Trees"],
  [(c, x, y) => road(c, [{ x: x - 9, z: y + 3 }, { x: x + 9, z: y - 3 }], v => v, v => v, 3.4), "Roads and tracks"],
  [(c, x, y) => { c.fillStyle = "rgba(214,200,150,0.95)"; c.strokeStyle = INK; c.lineWidth = 1; c.setLineDash([2, 2]); c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]); }, "Your land"],
  [(c, x, y) => oreIcon(c, x, y, "stone", 5.5), "Stone"],
  [(c, x, y) => oreIcon(c, x, y, "copper", 5.5), "Copper ore"],
  [(c, x, y) => oreIcon(c, x, y, "tin", 5.5), "Tin ore"],
  [(c, x, y) => oreIcon(c, x, y, "iron", 5.5), "Iron ore"],
  [(c, x, y) => caveIcon(c, x, y + 1, 5), "A cave"],
  [(c, x, y) => { c.fillStyle = "rgba(92,122,138,0.85)"; c.strokeStyle = "rgba(48,64,72,0.7)"; c.lineWidth = 1; c.beginPath(); c.ellipse(x, y, 5, 3.4, 0.3, 0, Math.PI * 2); c.fill(); c.stroke(); }, "The pond"],
];
function dot(c, x, y, col, r) { c.fillStyle = col; c.strokeStyle = "#f3e7c6"; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke(); }
// the key, as a block of parchment in the corner of the big map
export function drawLegend(c, x, y) {
  const rowH = 17, w = 228, h = 28 + LEGEND.length * rowH;
  c.save();
  c.fillStyle = "rgba(228,214,176,0.94)"; c.strokeStyle = INK; c.lineWidth = 1.2; c.fillRect(x, y, w, h); c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.fillStyle = INK; c.font = `italic 15px ${SERIF}`; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText("Key", x + 10, y + 13);
  c.font = `13px ${SERIF}`;
  LEGEND.forEach(([draw, words], i) => { const ry = y + 32 + i * rowH; draw(c, x + 20, ry); c.fillStyle = INK; c.fillText(words, x + 38, ry + 1); });
  c.restore();
  return { w, h };
}
