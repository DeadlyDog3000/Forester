// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// WATER. Out in the woods you get thirsty (body.js keeps it, the engine weakens you for it). Here is where you drink:
// at the water's edge — the brook and the pond, F wherever you stand by them — and at a well; and the canteen, a
// little wooden costrel, filled at any of them, boiled at the fire, and drunk from anywhere. Brook and pond water as
// it comes may give you the flux; a well's seldom; boiled, never.

import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { WATER_RISK, WATER_NAME, ILLS, canteenSize } from "./body.js";
import { POND, pondR } from "./woods.js";

const WORSE = { boiled: 0, well: 1, raw: 2 };
const near = { on: false, x: 0, z: 0, y: 0, what: "brook" };
let world = null, drinkIt = null, wells = new Map();

// a drink: how much, of what, and the chance it makes you ill
function quench(amount, kind, how) {
  const b = G.body; if (!b) return;
  b.thirst = Math.min(1, (b.thirst ?? 1) + amount); b.dirty = true;
  AUDIO.water && AUDIO.water.sip ? AUDIO.water.sip() : AUDIO.chew && AUDIO.chew();
  if (!b.ill && Math.random() < (WATER_RISK[kind] || 0)) {
    b.ill = { id: "flux", t: ILLS.flux.secs };
    setTimeout(() => UI.hint(`Your belly turns over — the flux, from ${kind === "well" ? "the well" : "the unboiled water"}. Nothing mends till it passes, and you'll be thirstier. Boil your water.`, 7), 1800);
  } else if (how) UI.hint(how, 2.5);
}
function drinkAt(kind, what) {
  const b = G.body; if (!b) return;
  if ((b.thirst ?? 1) > 0.97) return UI.hint("You're not thirsty.", 1.6);
  G.player.workFor && G.player.workFor("sow", 1.6);
  setTimeout(() => quench(1, kind, `You drink your fill at the ${what}.${kind === "raw" ? " (Unboiled — it may not agree with you.)" : ""}`), 1500);
}
// the canteen: by the fire, boil it; by water, fill it; anywhere, drink from it
G.useCanteen = () => {
  const b = G.body, size = canteenSize(b); if (!size) return;
  const W = b.water ??= { n: 0, kind: null }, w = G.world;
  if (G.working && G.time < G.working.until && G.working.kind !== "food") return;
  const fire = fireNear(w);
  if (fire && W.n > 0 && W.kind !== "boiled") {
    G.player.workFor && G.player.workFor("stir", 5);
    UI.hint("You set the canteen in the embers and let it come to the boil…", 4);
    setTimeout(() => { if (b.water.n > 0) { b.water.kind = "boiled"; b.dirty = true; UI.hint("Boiled. That water won't make you ill.", 3); } }, 5000);
    return;
  }
  const src = wellNear(w) ? { kind: "well", what: "well" } : near.on ? { kind: "raw", what: near.what } : null;
  if (src && W.n < size) {
    G.player.workFor && G.player.workFor("sow", 1.8);
    setTimeout(() => {
      const kind = W.n > 0 && WORSE[W.kind] > WORSE[src.kind] ? W.kind : src.kind;
      b.water = { n: size, kind }; b.dirty = true;
      UI.hint(`Canteen filled at the ${src.what}${kind === "raw" ? " — boil it at the fire before you drink it" : W.n > 0 && kind !== src.kind ? ` (mixed with what was in it: ${WATER_NAME[kind]})` : ""}.`, 3.5);
    }, 1700);
    return;
  }
  if (W.n <= 0) return UI.hint("Your canteen is empty. Fill it at a well, the brook or the pond.", 3);
  if ((b.thirst ?? 1) > 0.97) return UI.hint("You're not thirsty.", 1.6);
  G.working = { kind: "eat", food: "canteen", until: G.time + 1.4 };
  setTimeout(() => {
    if (b.water.n <= 0) return;
    const kind = b.water.kind;
    b.water.n -= 1; if (b.water.n <= 0) b.water = { n: 0, kind: null };
    quench(0.32, kind, b.water.n ? null : "That's the last of it.");
  }, 1300);
};
// a fire you could boil water on: the clearing's, the hearth, a settlement's
function fireNear(w) {
  const pl = G.player; if (!w || !pl) return null;
  for (const f of w.flames || []) {
    const fl = f.userData && f.userData.flame; if (!fl || fl.size < 2 || !(fl.base > 0.5) || !f.parent) continue;
    const p = f.getWorldPosition ? f.getWorldPosition(f.position.clone()) : f.position;
    if (Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 3.2) return f;
  }
  return null;
}
function wellNear(w) {
  const t = G.town, pl = G.player; if (!t || !pl || t.w !== w) return false;
  return t.S.buildings.some(b => b.type === "well" && b.done && !b.gone && Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z) < 3.4);
}
// where the nearest water is, as you walk: the brook's course, or the pond's edge
function findWater(w) {
  const pl = G.player; near.on = false; if (!pl) return;
  let best = 2.2, bx = 0, bz = 0, what = "";
  const pts = w.brook && w.brook.pts;
  if (pts) for (const p of pts) {
    const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) - (p.w || 1);
    if (d < best) { best = d; bx = p.x; bz = p.z; what = "brook"; }
  }
  {
    const a = Math.atan2(pl.pos.z - POND.z, pl.pos.x - POND.x), r = pondR(a), dc = Math.hypot(pl.pos.x - POND.x, pl.pos.z - POND.z), d = dc - r;
    if (d < best) { best = d; const k = Math.max(0, r - 0.6) / (dc || 1); bx = POND.x + (pl.pos.x - POND.x) * k; bz = POND.z + (pl.pos.z - POND.z) * k; what = "pond"; }
  }
  if (what) { near.on = true; near.x = bx; near.z = bz; near.y = (w.pondLevel ?? w.heightAt(bx, bz)) + 0.2; near.what = what; }
}
function setup(w) {
  world = w; wells = new Map();
  drinkIt = w.addInteract({ get x() { return near.x; }, get z() { return near.z; }, get y() { return near.y; }, reach: 3.2,
    can: () => near.on && !!G.body && !(G.player && G.player.horse),
    label: () => `Drink from the ${near.what} — unboiled${canteenSize(G.body) ? " (press the canteen's number to fill it)" : ""}`,
    use: () => drinkAt("raw", near.what) });
}
// the town's wells, each a place to drink
function syncWells(w) {
  const t = G.town; if (!t || t.w !== w || t.replica) return;
  const live = new Set();
  for (const b of t.S.buildings) {
    if (b.type !== "well" || !b.done || b.gone) continue;
    live.add(b);
    if (!wells.has(b)) wells.set(b, w.addInteract({ x: b.x, z: b.z, y: w.heightAt(b.x, b.z) + 1, reach: 2.8, can: () => !!G.body,
      label: () => `Drink at the well${canteenSize(G.body) ? " (press the canteen's number to fill it)" : ""}`, use: () => drinkAt("well", "well") }));
  }
  for (const [b, it] of wells) if (!live.has(b)) { w.removeInteract(it); wells.delete(b); }
}
let wellT = 0;
setInterval(() => {
  const w = G.world;
  if (!w || !w.waterOK) { near.on = false; return; }
  if (w !== world) setup(w);
  findWater(w);
  if ((wellT -= 0.1) <= 0) { wellT = 1; syncWells(w); }
}, 100);
void drinkIt;
