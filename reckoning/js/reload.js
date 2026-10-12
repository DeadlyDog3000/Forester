// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// LOADING A FLINTLOCK, as a soldier of the 1680s was drilled to: the cock back to half cock; the pan primed from the
// flask and the steel snapped shut over it; the gun stood on its butt, the charge poured down the barrel and the ball
// after it; the ramrod drawn from its pipes and rammed home, three strokes; the rod put back; the gun brought up and
// cocked. One timeline for all of it — what the hands do on the screen, what your body and anyone else's do, and the
// sound of each step (foley.js) — so they never drift apart. A pistol is the same drill, quicker.

export const LOAD = {
  musket: { time: 6.5, steps: [[0, "halfcock"], [0.3, "prime"], [0.85, "frizzen"], [1.2, "powder"], [2.05, "ball"], [2.55, "rodOut"], [3.25, "ram"], [3.75, "ram"], [4.25, "ram"], [4.8, "rodIn"], [5.95, "cock"]] },
  pistol: { time: 2.4, steps: [[0, "halfcock"], [0.12, "prime"], [0.42, "frizzen"], [0.55, "powder"], [0.95, "ball"], [1.1, "rodOut"], [1.32, "ram"], [1.58, "ram"], [1.82, "rodIn"], [2.2, "cock"]] },
};

const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const at = (L, name) => (L.steps.find(s => s[0] !== undefined && s[1] === name) || [0])[0];

// where in the drill, e seconds in:
//  up     0 at the hip .. 1 stood up on its butt, muzzle up before you
//  prime  0 .. 1 turned lock-up, low, for the pan
//  hand   what the free hand is at: "lock", "muzzle", "rod", or null (its usual place)
//  rod    how far the ramrod is out of its pipes (0..1) and how deep it's down the barrel (0..1)
export function loadPose(kind, e) {
  const L = LOAD[kind] || LOAD.musket, s = n => at(L, n), fast = kind === "pistol" ? 0.4 : 1;
  const prime = ease(e / (0.25 * fast)) * (1 - ease((e - s("frizzen") - 0.08 * fast) / (0.25 * fast)));
  const up = ease((e - s("frizzen") - 0.05 * fast) / (0.35 * fast)) * (1 - ease((e - s("rodIn") - 0.35 * fast) / (0.55 * fast)));
  let hand = null;
  if (e >= s("prime") - 0.1 * fast && e < s("frizzen") + 0.12 * fast) hand = "lock";
  else if (e >= s("powder") - 0.1 * fast && e < s("rodOut")) hand = "muzzle";
  else if (e >= s("rodOut") && e < s("rodIn") + 0.35 * fast) hand = "rod";
  const out = ease((e - s("rodOut")) / (0.4 * fast)) * (1 - ease((e - s("rodIn")) / (0.35 * fast)));
  // (each stroke: down on the ball and back up a little; between the drawing and the first stroke it goes in)
  let depth = 0.25 * ease((e - s("rodOut") - 0.35 * fast) / (0.2 * fast));
  for (const [t, n] of L.steps) if (n === "ram") { const x = (e - t) / (0.22 * fast); if (x > -1 && x < 1) depth = Math.max(depth, 0.35 + 0.65 * (x < 0 ? ease(1 + x) : 1 - ease(x))); }
  return { up, prime, hand, rod: { out, depth } };
}

// the steps that fall between two moments of the drill (to be heard)
export function loadSteps(kind, e0, e1) {
  const L = LOAD[kind] || LOAD.musket;
  return L.steps.filter(([t]) => t >= e0 && t < e1).map(s => s[1]);
}
