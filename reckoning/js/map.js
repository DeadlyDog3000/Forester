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
