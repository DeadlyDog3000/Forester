// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// LOADING A FLINTLOCK, as a soldier of the 1680s was drilled to: the cock back to half cock; the pan primed from the
// flask and the steel snapped shut over it; the gun stood on its butt, the charge poured down the barrel and the ball
// after it; the ramrod drawn from its pipes and rammed home, three strokes; the rod put back; the gun brought up and
// cocked. One timeline for all of it — what the hands do on the screen, what your body and anyone else's do, and the
// sound of each step (foley.js) — so they never drift apart. A pistol is the same drill, a little quicker (a short barrel, a short rod).

export const LOAD = {
  musket: { time: 6.5, steps: [[0, "halfcock"], [0.3, "prime"], [0.85, "frizzen"], [1.2, "powder"], [2.05, "ball"], [2.55, "rodOut"], [3.45, "ram"], [3.95, "ram"], [4.45, "ram"], [4.95, "rodIn"], [5.95, "cock"]] },
  pistol: { time: 4.2, steps: [[0.0, "halfcock"], [0.18, "prime"], [0.56, "frizzen"], [0.79, "powder"], [1.4, "ball"], [1.66, "rodOut"], [2.31, "ram"], [2.77, "ram"], [3.12, "rodIn"], [3.94, "cock"]] },
};

const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const at = (L, name) => (L.steps.find(s => s[0] !== undefined && s[1] === name) || [0])[0];

// where in the drill, e seconds in:
//  up     0 at the hip .. 1 stood up on its butt, muzzle up before you
//  prime  0 .. 1 turned lock-up, low, for the pan
//  hand   what the free hand is at: "lock", "muzzle", "rod", or null (its usual place)
//  rod    how far the ramrod is out of its pipes (0..1) and how deep it's down the barrel (0..1)
export function loadPose(kind, e) {
  const L = LOAD[kind] || LOAD.musket, s = n => at(L, n), fast = kind === "pistol" ? 0.7 : 1;
  const prime = ease(e / (0.25 * fast)) * (1 - ease((e - s("frizzen") - 0.08 * fast) / (0.25 * fast)));
  const up = ease((e - s("frizzen") - 0.05 * fast) / (0.35 * fast)) * (1 - ease((e - s("rodIn") - 0.35 * fast) / (0.55 * fast)));
  let hand = null;
  if (e >= s("prime") - 0.1 * fast && e < s("frizzen") + 0.12 * fast) hand = "lock";
  else if (e >= s("powder") - 0.1 * fast && e < s("rodOut")) hand = "muzzle";
  else if (e >= s("rodOut") && e < s("rodIn") + 0.35 * fast) hand = "rod";
  const out = ease((e - s("rodOut")) / (0.4 * fast)) * (1 - ease((e - s("rodIn")) / (0.35 * fast)));
  // (each stroke: down on the ball and back up a little; between the drawing and the first stroke it goes in)
  let depth = 0.25 * ease((e - s("rodOut") - 0.8 * fast) / (0.2 * fast));
  for (const [t, n] of L.steps) if (n === "ram") { const x = (e - t) / (0.22 * fast); if (x > -1 && x < 1) depth = Math.max(depth, 0.35 + 0.65 * (x < 0 ? ease(1 + x) : 1 - ease(x))); }
  return { up, prime, hand, rod: { out, depth } };
}

// the steps that fall between two moments of the drill (to be heard)
export function loadSteps(kind, e0, e1) {
  const L = LOAD[kind] || LOAD.musket;
  return L.steps.filter(([t]) => t >= e0 && t < e1).map(s => s[1]);
}

// the ramrod, through the drill: where its two ends are, along the gun (y up the barrel) and above or below it (z), in
// the gun's own frame. It lies in its pipes under the barrel; it's drawn up out of them till it clears the muzzle,
// turned end for end in the air, and its rammer end put into the bore and driven down on the ball; then out again,
// turned back, and slid home into the pipes. R is the rammer end (it goes in), T the tail; show: out of its pipes.
export const ROD_GEO = { musket: { pipeY: 0.12, pipeZ: -0.012, boreZ: 0.032, muzY: 1.13, L: 0.98 }, pistol: { pipeY: 0.06, pipeZ: -0.006, boreZ: 0.022, muzY: 0.336, L: 0.27 } };
export function rodEnds(kind, e) {
  const L0 = LOAD[kind] || LOAD.musket, g = ROD_GEO[kind] || ROD_GEO.musket, f = kind === "pistol" ? 0.7 : 1;
  const sOut = at(L0, "rodOut"), sIn = at(L0, "rodIn"), clear = g.muzY + 0.04;
  const show = e >= sOut && e < sIn + 0.95 * f;
  if (!show) return { show: false };
  const lp = loadPose(kind, e);
  const d = ease((e - sOut) / (0.45 * f)), fl = ease((e - sOut - 0.45 * f) / (0.35 * f));
  const po = ease((e - sIn) / (0.2 * f)), fb = ease((e - sIn - 0.2 * f) / (0.3 * f)), si = ease((e - sIn - 0.5 * f) / (0.4 * f));
  const turned = e < sIn ? fl : 1 - fb;                              // (0: rammer end up, as it lies; 1: rammer end down)
  let tailY;                                                          // (the tail's height up the gun, before any turning)
  if (e < sIn) tailY = g.pipeY + d * (clear - g.pipeY);
  else tailY = clear + (g.pipeY - clear) * si;
  const z = g.pipeZ + (g.boreZ - g.pipeZ) * turned;
  // turned about its middle, end over end, the rammer end coming down toward the muzzle
  const midY = tailY + g.L / 2, th = Math.PI * turned;
  let R = [midY + Math.cos(th) * g.L / 2, z + Math.sin(th) * g.L * 0.25], T = [midY - Math.cos(th) * g.L / 2, z - Math.sin(th) * g.L * 0.25];
  // in the bore: down on the ball, and out again
  if (turned >= 0.999 && e < sIn + 0.2 * f) {
    const depth = e < sIn ? lp.rod.depth : lp.rod.depth * (1 - po);
    const ry = clear - depth * g.L * 0.8;
    R = [ry, g.boreZ]; T = [ry + g.L, g.boreZ];
  }
  return { show: true, R, T, inHand: true };
}
