// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// YOUR REGIMENT'S COLOURS. A regiment of the 1680s was known by its colours: a silk field, a cross or division laid over
// it, a badge — the lion, the eagle, the crown, the colonel's cipher — painted at the centre. Carried by its ensign in
// the middle of the line, they were where the men looked in the smoke, where they rallied, and the one thing a regiment
// could not lose without its shame being told for a century; to take an enemy's was the greatest feat of a battle.
//
// Here: your own colours for each of your teams, made in the muster (field, division, badge, their tinctures); carried
// into battle by your ensign; and the record of every enemy's colours you've taken — a nation's colours must be taken
// in battle before you can raise its men as your own (see armoury.js buyTeam).

const KEY = "reckoning.colours.v1", TAKEN = "reckoning.colours.taken";
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// the tinctures a painter of colours had: the silks as they were dyed — not a modern palette
export const TINCTURES = [
  ["white", "#f2eee2"], ["yellow", "#d8b13a"], ["orange", "#d8742a"], ["red", "#b8241c"], ["crimson", "#8a1a2a"],
  ["blue", "#2a4a9a"], ["sky", "#6a92c8"], ["green", "#2e6a3a"], ["black", "#1a1714"], ["purple", "#5a2a6a"],
];
export const FIELDS = TINCTURES;
// the division laid over the field: the crosses of the nations, the French "flames", the quarters and the border
export const DIVISIONS = [
  ["plain", "Plain"], ["cross", "St George's cross"], ["nordic", "Nordic cross"], ["saltire", "Saltire"], ["flames", "Flames"],
  ["quarters", "Quartered"], ["pale", "Per pale"], ["fess", "Per fess"], ["bordure", "Border"], ["chevron", "Chevron"],
];
export const BADGES = [
  ["none", "None"], ["lion", "Lion"], ["eagle", "Eagle"], ["crown", "Crown"], ["star", "Star"], ["lily", "Lily"],
  ["cipher", "Cipher"], ["sword", "Sword"], ["tower", "Tower"],
];
const tint = n => (TINCTURES.find(t => t[0] === n) || TINCTURES[0])[1];

// a design: { field, div, divC, badge, badgeC, cipher }
export const DEFAULT = { field: "white", div: "cross", divC: "red", badge: "crown", badgeC: "yellow", cipher: "R" };
export const designOf = team => { const all = read(KEY, {}); return all[team] ? { ...DEFAULT, ...all[team] } : null; };
export function setDesign(team, d) { const all = read(KEY, {}); all[team] = { ...DEFAULT, ...(all[team] || {}), ...d }; all[team].cipher = String(all[team].cipher || "").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "R"; write(KEY, all); return all[team]; }

// whose colours you've taken, and how many times
export const takenAll = () => read(TAKEN, {});
export const taken = team => takenAll()[team] | 0;
export function addTaken(team) { const all = takenAll(); all[team] = (all[team] | 0) + 1; write(TAKEN, all); return all[team]; }

// the colours painted on a 192×128 canvas
export function drawDesign(x, D) {
  D = { ...DEFAULT, ...(D || {}) };
  const W = 192, H = 128, fill = (c, ...r) => { x.fillStyle = c; x.fillRect(...r); }, fc = tint(D.field), dc = tint(D.divC), bc = tint(D.badgeC);
  fill(fc, 0, 0, W, H);
  switch (D.div) {
    case "cross": fill(dc, W / 2 - 13, 0, 26, H); fill(dc, 0, H / 2 - 13, W, 26); break;
    case "nordic": fill(dc, 54, 0, 22, H); fill(dc, 0, H / 2 - 11, W, 22); break;
    case "saltire": x.strokeStyle = dc; x.lineWidth = 22; x.beginPath(); x.moveTo(0, 0); x.lineTo(W, H); x.moveTo(W, 0); x.lineTo(0, H); x.stroke(); break;
    case "flames": {
      // (the French regiments' drapeau à flammes: from the centre out to the edge, flames of two colours turn and turn
      //  about, and a white cross over them)
      const edge = []; for (let i = 0; i < 24; i++) { const t = i / 24 * 4, k = t % 1, side = Math.floor(t); edge.push(side === 0 ? [k * W, 0] : side === 1 ? [W, k * H] : side === 2 ? [W - k * W, H] : [0, H - k * H]); }
      for (let i = 0; i < 24; i += 2) { const a = edge[i], b = edge[(i + 1) % 24]; x.fillStyle = dc; x.beginPath(); x.moveTo(W / 2, H / 2); x.lineTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.closePath(); x.fill(); }
      fill("#f2eee2", W / 2 - 10, 0, 20, H); fill("#f2eee2", 0, H / 2 - 10, W, 20); break;
    }
    case "quarters": fill(dc, W / 2, 0, W / 2, H / 2); fill(dc, 0, H / 2, W / 2, H / 2); break;
    case "pale": fill(dc, W / 2, 0, W / 2, H); break;
    case "fess": fill(dc, 0, H / 2, W, H / 2); break;
    case "bordure": x.strokeStyle = dc; x.lineWidth = 22; x.strokeRect(0, 0, W, H); break;
    case "chevron": x.fillStyle = dc; x.beginPath(); x.moveTo(0, H); x.lineTo(W / 2, H * 0.32); x.lineTo(W, H); x.lineTo(W, H - 28); x.lineTo(W / 2, H * 0.32 - 30); x.lineTo(0, H - 28); x.closePath(); x.fill(); break;
  }
  // (the badge on a roundel of the field's own colour where a division runs under it, so it's read)
  const cx = W / 2, cy = H / 2, s = 1;
  if (D.badge !== "none" && D.div !== "plain" && D.div !== "bordure" && D.div !== "pale" && D.div !== "fess") { x.fillStyle = fc; x.beginPath(); x.arc(cx, cy, 30, 0, Math.PI * 2); x.fill(); x.strokeStyle = bc; x.lineWidth = 2.5; x.stroke(); }
  x.fillStyle = bc; x.strokeStyle = bc;
  const P = pts => { x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo : x.moveTo).call(x, cx + px * s, cy + py * s)); x.closePath(); x.fill(); };
  switch (D.badge) {
    case "lion":
      // (rampant: up on the hind legs, the forepaws raised, the tail curling up behind)
      P([[-4, -22], [6, -24], [10, -18], [6, -14], [12, -10], [16, -16], [18, -12], [12, -4], [8, 2], [12, 12], [18, 22], [12, 24], [4, 14], [-2, 16], [-6, 24], [-12, 22], [-8, 12], [-12, 2], [-10, -8], [-8, -16]]);
      x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 10, cy + 6); x.quadraticCurveTo(cx - 24, cy, cx - 18, cy - 16); x.stroke(); break;
    case "eagle":
      P([[0, -10], [-24, -22], [-28, -8], [-20, -2], [-24, 6], [-8, 4], [-6, 20], [0, 26], [6, 20], [8, 4], [24, 6], [20, -2], [28, -8], [24, -22]]);
      x.beginPath(); x.ellipse(cx, cy - 15, 4, 5, 0, 0, Math.PI * 2); x.fill(); break;
    case "crown":
      P([[-20, 10], [-22, -10], [-12, 0], [-6, -16], [0, -2], [6, -16], [12, 0], [22, -10], [20, 10]]); x.fillRect(cx - 21, cy + 10, 42, 7); break;
    case "star": { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 22; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } P(pts); break; }
    case "lily":
      x.beginPath(); x.ellipse(cx, cy - 8, 5, 15, 0, 0, Math.PI * 2); x.fill();
      for (const sd of [1, -1]) { x.beginPath(); x.ellipse(cx + sd * 11, cy - 2, 4, 12, sd * 0.7, 0, Math.PI * 2); x.fill(); }
      x.fillRect(cx - 14, cy + 6, 28, 5); x.fillRect(cx - 3, cy + 6, 6, 16); break;
    case "cipher":
      x.font = "italic bold 34px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(D.cipher || "R", cx, cy + 2); break;
    case "sword":
      x.fillRect(cx - 2.5, cy - 24, 5, 36); x.fillRect(cx - 12, cy + 10, 24, 5); x.fillRect(cx - 3, cy + 15, 6, 9); P([[-2.5, -24], [0, -30], [2.5, -24]]); break;
    case "tower":
      x.fillRect(cx - 12, cy - 12, 24, 34); for (let i = 0; i < 3; i++) x.fillRect(cx - 12 + i * 9, cy - 18, 6, 7);
      x.fillStyle = fc; x.beginPath(); x.arc(cx, cy + 22, 6, Math.PI, 0); x.fill(); x.fillRect(cx - 6, cy + 16, 12, 6); break;
  }
}
