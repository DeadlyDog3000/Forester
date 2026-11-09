// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// PAINTING YOUR OWN COLOURS, freehand, with the tools a colour-painter's shop had: the brush, the straight-edge (a
// line, held level or upright or at the diagonal with Shift), the square for a filled block, the bucket of paint for a
// whole field, and the stencils of the badges — the lion, the eagle, the crown and the rest — set down wherever you
// like, as large or small as you like. Undo takes back a stroke; the silks are the age's (see colours.js TINCTURES).
// The picture is kept with your colours (design.img) and carried into battle by your ensign.

import { TINCTURES, BADGES, PAINT_W, PAINT_H, drawDesign, drawBadge, imgOk } from "./colours.js";

const W = PAINT_W, H = PAINT_H, SHOW = 2;   // (painted at its own size; shown twice as large to paint on)
const TOOLS = [["brush", "Brush"], ["line", "Straight line"], ["rect", "Block"], ["fill", "Fill"], ["stamp", "Stamp"]];
// (one painter at a time: kept here, so the muster drawing itself afresh doesn't lose a picture half made)
const P = { team: null, cv: null, tool: "brush", colour: "#b8241c", size: 6, stamp: "lion", stampSize: 1, undo: [], design: null };

function work(team, design) {
  if (P.cv && P.team === team) return P.cv;
  const cv = P.cv = document.createElement("canvas"); cv.width = W; cv.height = H; P.team = team; P.undo = [];
  const x = cv.getContext("2d");
  if (design && imgOk(design.img)) { const im = new Image(); im.onload = () => { x.drawImage(im, 0, 0, W, H); P.redraw && P.redraw(); }; im.src = design.img; }
  else fromPattern(x, design);
  return cv;
}
function fromPattern(x, design) { const t = document.createElement("canvas"); t.width = 192; t.height = 128; drawDesign(t.getContext("2d"), { ...(design || {}), img: null }); x.drawImage(t, 0, 0, W, H); }
const snap = () => { P.undo.push(P.cv.getContext("2d").getImageData(0, 0, W, H)); if (P.undo.length > 30) P.undo.shift(); };

// a field of one colour filled from where it's clicked, out to where the colour changes
function flood(x, sx, sy, hex) {
  const img = x.getImageData(0, 0, W, H), d = img.data, at = (sx | 0) + (sy | 0) * W, r0 = d[at * 4], g0 = d[at * 4 + 1], b0 = d[at * 4 + 2];
  const c = parseInt(hex.slice(1), 16), r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
  if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) < 6) return;
  const same = i => Math.abs(d[i * 4] - r0) + Math.abs(d[i * 4 + 1] - g0) + Math.abs(d[i * 4 + 2] - b0) < 60;
  const seen = new Uint8Array(W * H), st = [at];
  while (st.length) { const i = st.pop(); if (seen[i] || !same(i)) continue; seen[i] = 1; d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; const px = i % W; if (px > 0) st.push(i - 1); if (px < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < W * (H - 1)) st.push(i + W); }
  x.putImageData(img, 0, 0);
}

// the painter, put into el: onSave(dataURL) when it's kept, onCancel() to go back to the pattern
export function mountPainter(el, { team, design, cipher = "R", onSave, onPattern }) {
  const cv = work(team, design), x = cv.getContext("2d");
  el.innerHTML = `<div class="pn">
    <div class="pn-tools">${TOOLS.map(([k, n]) => `<button class="pv-gr${P.tool === k ? " on" : ""}" data-pn="tool:${k}"><b>${n}</b></button>`).join("")}</div>
    <div class="pn-row"><span class="cl-l">Silk</span>${TINCTURES.map(([n, c]) => `<button class="cl-t${P.colour === c ? " on" : ""}" data-pn="col:${c}" title="${n}" style="background:${c}"></button>`).join("")}</div>
    <div class="pn-row pn-size"><span class="cl-l">${P.tool === "stamp" ? "Stamp size" : "Width"}</span><input type="range" min="${P.tool === "stamp" ? 3 : 1}" max="${P.tool === "stamp" ? 30 : 40}" value="${P.tool === "stamp" ? Math.round(P.stampSize * 10) : P.size}" data-pn="size"></div>
    <div class="pn-row pn-syms"><span class="cl-l">Symbols — drag one onto the flag</span>${BADGES.filter(b => b[0] !== "none").map(([k, n]) => `<button class="pv-gr pn-sym${P.stamp === k ? " on" : ""}" data-pn="stamp:${k}" title="Drag onto the flag"><canvas width="44" height="44" data-sym="${k}"></canvas><b>${n}</b></button>`).join("")}</div>
    <canvas class="pn-cv" width="${W * SHOW}" height="${H * SHOW}"></canvas>
    <div class="pn-hint">${P.tool === "line" ? "Drag from one end to the other. Hold Shift to keep it level, upright, or at the diagonal." : P.tool === "rect" ? "Drag from one corner to the other." : P.tool === "fill" ? "Click a field to fill it with the silk." : P.tool === "stamp" ? "Press on the flag and drag the symbol where you want it; let go to set it down. The wheel makes it larger or smaller." : "Paint with the mouse."}</div>
    <div class="pn-row"><button class="btn ghost" data-pn="undo">Undo</button><button class="btn ghost" data-pn="clear">Fill all with the silk</button><button class="btn ghost" data-pn="pattern">Start from the pattern</button><button class="btn ghost" data-pn="back">Back to the pattern</button><button class="btn" data-pn="save">Keep these colours</button></div>
  </div>`;
  const view = el.querySelector(".pn-cv"), vx = view.getContext("2d");
  let drag = null, last = null, shift = false;
  const redraw = (prev = null) => { vx.imageSmoothingEnabled = false; vx.clearRect(0, 0, view.width, view.height); vx.drawImage(cv, 0, 0, view.width, view.height); if (prev) { vx.save(); vx.scale(SHOW, SHOW); prev(vx); vx.restore(); } };
  P.redraw = () => redraw();
  const at = e => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  // (Shift: the line held to the nearest of level, upright and the two diagonals)
  const end = (a, b) => { if (!shift) return b; const dx = b.x - a.x, dy = b.y - a.y, ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(dx, dy); return { x: a.x + Math.cos(ang) * L, y: a.y + Math.sin(ang) * L }; };
  const stroke = (g, a, b) => { g.strokeStyle = P.colour; g.lineWidth = P.size; g.lineCap = "round"; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
  const block = (g, a, b) => { g.fillStyle = P.colour; g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); };
  const stamp = (g, p) => drawBadge(g, P.stamp, p.x, p.y, P.stampSize * (W / 192), P.colour, "#f2eee2", cipher);
  view.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation(); view.setPointerCapture(e.pointerId); shift = e.shiftKey;
    const p = at(e); snap();
    if (P.tool === "fill") { flood(x, p.x, p.y, P.colour); redraw(); return; }
    if (P.tool === "stamp") { drag = p; redraw(g => { g.globalAlpha = 0.6; stamp(g, p); }); return; }
    drag = p; last = p; if (P.tool === "brush") { stroke(x, p, p); redraw(); }
  });
  view.addEventListener("pointermove", e => {
    if (!drag) { if (P.tool === "stamp") { const p = at(e); redraw(g => { g.globalAlpha = 0.5; stamp(g, p); }); } return; }
    shift = e.shiftKey; const p = at(e);
    if (P.tool === "stamp") { drag = p; redraw(g => { g.globalAlpha = 0.6; stamp(g, p); }); }
    else if (P.tool === "brush") { stroke(x, last, p); last = p; redraw(); }
    else if (P.tool === "line") redraw(g => stroke(g, drag, end(drag, p)));
    else if (P.tool === "rect") redraw(g => block(g, drag, p));
  });
  const up = e => {
    if (!drag) return; shift = e.shiftKey; const p = at(e);
    if (P.tool === "line") stroke(x, drag, end(drag, p)); else if (P.tool === "rect") block(x, drag, p); else if (P.tool === "stamp") stamp(x, p);
    drag = null; redraw();
  };
  view.addEventListener("pointerup", up); view.addEventListener("pointercancel", () => { drag = null; redraw(); });
  view.addEventListener("pointerleave", () => { if (!drag) redraw(); });
  el.querySelector(".pn").addEventListener("click", e => {
    const b = e.target.closest("[data-pn]"); if (!b) return; e.stopPropagation();
    const [k, v] = b.dataset.pn.split(/:(.*)/s);
    if (k === "tool") { P.tool = v; mountPainter(el, { team, design, cipher, onSave, onPattern }); }
    else if (k === "col") { P.colour = v; el.querySelectorAll("[data-pn^='col:']").forEach(q => q.classList.toggle("on", q === b)); el.querySelectorAll("[data-sym]").forEach(c => { const g = c.getContext("2d"); g.fillStyle = "#f2eee2"; g.fillRect(0, 0, 44, 44); drawBadge(g, c.dataset.sym, 22, 23, 0.62, P.colour, "#f2eee2", cipher); }); }
    else if (k === "stamp") { P.stamp = v; el.querySelectorAll("[data-pn^='stamp:']").forEach(q => q.classList.toggle("on", q === b)); }
    else if (k === "undo") { const u = P.undo.pop(); if (u) { x.putImageData(u, 0, 0); redraw(); } }
    else if (k === "clear") { snap(); x.fillStyle = P.colour; x.fillRect(0, 0, W, H); redraw(); }
    else if (k === "pattern") { snap(); fromPattern(x, design); redraw(); }
    else if (k === "back") { P.cv = null; P.team = null; onPattern && onPattern(); }
    else if (k === "save") { const u = cv.toDataURL("image/png"); if (!imgOk(u)) { el.querySelector(".pn-hint").textContent = "Too much detail to keep: simplify it a little (fewer fine strokes) and try again."; return; } P.cv = null; P.team = null; onSave && onSave(u); }
  });
  el.querySelector("[data-pn='size']").addEventListener("input", e => { const v = +e.target.value; if (P.tool === "stamp") P.stampSize = v / 10; else P.size = v; });
  el.addEventListener("keydown", e => e.stopPropagation());
  // (the symbols, each drawn on its button, picked up and dragged onto the flag: shown where it would go as it comes
  //  over the cloth, set down where it's let go, and nothing done if it's let go anywhere else)
  el.querySelectorAll("[data-sym]").forEach(c => { const g = c.getContext("2d"); g.fillStyle = "#f2eee2"; g.fillRect(0, 0, 44, 44); drawBadge(g, c.dataset.sym, 22, 23, 0.62, P.colour, "#f2eee2", cipher); });
  const over = e => { const r = view.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  el.querySelectorAll(".pn-sym").forEach(btn => btn.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation(); P.stamp = btn.dataset.pn.slice(6); el.querySelectorAll(".pn-sym").forEach(q => q.classList.toggle("on", q === btn));
    const ghost = btn.querySelector("canvas").cloneNode(); ghost.getContext("2d").drawImage(btn.querySelector("canvas"), 0, 0); ghost.className = "pn-ghost"; document.body.appendChild(ghost);
    const move = ev => { ghost.style.left = ev.clientX - 22 + "px"; ghost.style.top = ev.clientY - 22 + "px"; if (over(ev)) { ghost.style.opacity = 0; const p = at(ev); redraw(g => { g.globalAlpha = 0.6; stamp(g, p); }); } else { ghost.style.opacity = 0.85; redraw(); } };
    const done = ev => { removeEventListener("pointermove", move, true); removeEventListener("pointerup", done, true); ghost.remove(); if (over(ev)) { snap(); stamp(x, at(ev)); } redraw(); };
    move(e); addEventListener("pointermove", move, true); addEventListener("pointerup", done, true);
  }));
  // (the wheel over the flag: the symbol larger or smaller)
  view.addEventListener("wheel", e => { if (P.tool !== "stamp" && !drag) return; e.preventDefault(); e.stopPropagation(); P.stampSize = Math.max(0.3, Math.min(3, P.stampSize * (e.deltaY < 0 ? 1.1 : 0.9))); const sl = el.querySelector("[data-pn='size']"); if (sl && P.tool === "stamp") sl.value = Math.round(P.stampSize * 10); const p = at(e); redraw(g => { g.globalAlpha = 0.6; stamp(g, p); }); }, { passive: false });
  redraw();
}
// (a new kingdom's colours: the painter starts afresh from its pattern)
export const resetPainter = () => { P.cv = null; P.team = null; };
