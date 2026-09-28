// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The shots for the trailer and the short. Each is staged in the game and
// filmed with the rig, in either shape:
//
//   const { film } = await import("./tools/film.js");
//   await film.take("harbour", "wide");     // 1920 x 1080, for the trailer
//   await film.take("harbour", "tall");     // 1080 x 1920, for the short
//
// Frames go to the capture server as <shape>/<shot>/0000.jpg and onwards.
// Not part of the game.

import { G, Actor, setAtmo, blendAtmo, input } from "../js/engine.js";
import { THREE, MAT } from "../js/core.js";
import { startChapter, writeSave, loadSave } from "../js/story.js";
import { CABIN, CLEARING, FIRE, HUNT, STACK } from "../js/woods.js";
import { Hunt } from "../js/hunt.js";
import { BUILDINGS } from "../js/town.js";
import { makeLantern, ensureModel } from "../js/models.js";
import { rig } from "./rig.js";

const wait = ms => new Promise(r => setTimeout(r, ms));
const V = (x, y, z) => [x, y, z];
// a point in the cabin's own frame (x across, z out of the door), at height y above the cabin floor
const cab = (lx, y, lz) => { const c = Math.cos(CABIN.ry), s = Math.sin(CABIN.ry); return [CABIN.x + lx * c + lz * s, (G.world.cabinY || G.world.cy) + y, CABIN.z - lx * s + lz * c]; };
const gy = (x, z) => G.world.heightAt(x, z);
const L = rig.lerp.bind(rig), E = t => rig.ease(t);

// bring a chapter up, let its first seconds play out unseen, then set the light
async function chapter(n, opts = {}, save = null, settle = 2.5) {
  if (save) writeSave(save);
  G.mode = "play";
  startChapter(n, opts);
  await wait(1800);
  rig.run(settle);
}

// the town, laid out as a finished settlement in the style of an age
const TOWN_PLAN = ["cabin", "cabin", "bakery", "market", "cabin", "townhall", "church", "cabin", "sawmill", "well", "cabin", "brickworks", "cabin"];
async function preloadTown(tier) {
  const keys = ["cabin", "well", "woodshed", `town/lamp_${tier >= 4 ? 4 : 1}`];
  for (const t of ["house", "bakery", "market", "townhall", "church", "sawmill", "brickworks"]) keys.push(t === "house" ? (tier > 1 ? `town/house_${tier}` : "cabin") : `town/${t}_${tier}`);
  if (tier >= 3) keys.push(`town/fountain_${tier}`);
  await Promise.all(keys.map(k => ensureModel(k)));
}
function showcaseTown(tier) {
  const t = G.town; if (!t) return;
  for (const b of t.S.buildings.filter(b => b.type !== "field")) { const g = t.vis.get(b); if (g) { G.world.root.remove(g); if (g.userData.col) g.userData.col.disabled = true; } }
  t.S.buildings = t.S.buildings.filter(b => b.type === "field");
  let i = 0;
  for (const type of TOWN_PLAN) {
    let spot = null;
    for (let r = 9; r < 34 && !spot; r += 0.6) for (let a = i * 0.9; a < i * 0.9 + 6.28 && !spot; a += 0.17) {
      const x = FIRE.x + Math.cos(a) * r, z = FIRE.z + Math.sin(a) * r;
      // face the square
      const ry = Math.atan2(FIRE.x - x, FIRE.z - z);
      if (t.fits(type, x, z, ry)) spot = { x, z, ry };
    }
    i++;
    if (!spot) continue;
    const def = BUILDINGS[type];
    const b = { type, x: spot.x, z: spot.z, ry: spot.ry, logs: def.cost, got: { ...(def.mats || {}) }, done: true, tier: Math.min(tier, type === "well" && tier === 2 ? 2 : tier) };
    t.S.buildings.push(b); t.show(b);
  }
  t.streetLvl = null; t.updateStreets();
}

export const SHOTS = {
  harbour: {
    secs: 6.5,
    async stage() { await chapter(1); setAtmo("evening"); },
    cam: (t, c) => rig.look(c, L(V(-18, 3.5, -78), V(-8, 3.0, -71), E(t)), L(V(8, 5, -36), V(11, 4.6, -36), E(t)), 45),
  },
  lane: {
    secs: 5,
    // down the lane at dusk, toward the house by the harbour
    async stage() { await chapter(1); setAtmo("dusk"); MAT.lit.emissiveIntensity = 1.2; },
    cam: (t, c) => rig.look(c, L(V(28, 1.7, -1.0), V(20, 1.65, -1.1), E(t)), V(9, 2.6, -2.4), 50),
  },
  torches: {
    secs: 5.5,
    // from the dark hall, through the open front door, the watch waiting in the lane
    async stage() { await chapter(2, {}, null, 1.5); setAtmo("night"); G.world.setDoor(true, true); MAT.lit.emissiveIntensity = 0.8; },
    cam: (t, c) => rig.look(c, L(V(15.4, 1.5, -8.8), V(14.9, 1.35, -7.2), E(t)), L(V(12.6, 1.7, 1.5), V(12.3, 1.8, 1.5), E(t)), 32 + 8 * E(t)),
  },
  square: {
    secs: 5.5,
    async stage() { await chapter(3); setAtmo("dawn"); },
    cam: (t, c) => rig.look(c, L(V(9, 1.8, 36), V(7, 4.8, 33.5), E(t)), L(V(0, 2.6, 44), V(0, 2.2, 44), t), 50),
  },
  gate: {
    secs: 5,
    async stage() { await chapter(4); setAtmo("mist"); },
    cam: (t, c) => rig.look(c, L(V(-38, 1.4, 38), V(-37.6, 1.35, 45), E(t)), V(-35, 3.0, 67), 50),
  },
  road: {
    secs: 6.5,
    async stage() { await chapter(5); setAtmo("afternoon"); G.player.place(0, -40, 0); },
    cam: (t, c) => rig.look(c, L(V(1.5, 1.7, -8), V(0.4, 1.9, 8), E(t)), V(0, 12, 205), 45),
  },
  clearing: {
    secs: 5.5,
    async stage() { await chapter(6, {}, { clearing: {} }); setAtmo("evening"); },
    cam: (t, c) => rig.look(c, L(cab(-5, 1.3, 13), cab(-2.5, 1.35, 8.5), E(t)), cab(0, 1.7, 0), 50),
  },
  felling: {
    secs: 5,
    hands: true,
    async stage() {
      await chapter(6, {}, { clearing: { axe: true, first: true } });
      setAtmo("morning");
      // stand at arm's length from a tree near the clearing, facing it
      const w = G.world, pl = G.player;
      const tr = w.fellable.filter(f => f.state === "up").sort((a, b) => Math.hypot(a.x - CLEARING.x, a.z - CLEARING.z) - Math.hypot(b.x - CLEARING.x, b.z - CLEARING.z))[3];
      const dx = CLEARING.x - tr.x, dz = CLEARING.z - tr.z, l = Math.hypot(dx, dz);
      pl.place(tr.x + dx / l * 1.7, tr.z + dz / l * 1.7, Math.atan2(dx, dz));
      pl.pitch = 0.05;
      pl.giveAxe(true);
      G.forceThird = true;       // your own body, seen from the side
      this.tree = tr; this.dir = [dx / l, dz / l];
    },
    cam(t, c) {
      const tr = this.tree, [ux, uz] = this.dir, sx = -uz, sz = ux;          // across the line from you to the tree
      const mx = tr.x + ux * 0.9, mz = tr.z + uz * 0.9, y = gy(mx, mz);
      rig.look(c, [mx + sx * (5.2 - t * 0.8) + ux * 1.2, y + 1.5, mz + sz * (5.2 - t * 0.8) + uz * 1.2], [mx, y + 1.6 + t * 1.2, mz], 55);
    },
    tick(t, i) { G.forceThird = true; if ([4, 38, 72, 106].includes(i)) G.player.swing(G.onSwing); },
    done() { G.forceThird = false; },
  },
  deer: {
    secs: 5,
    async stage() {
      await chapter(6, {}, { clearing: { axe: true } });
      setAtmo("evening");
      const w = G.world; w.huntOpen = true;
      G.player.place(CLEARING.x, CLEARING.z, 0);
      this.hunt = new Hunt(w, { x: HUNT.x, z: HUNT.z, r: 8 });
      this.hunt.spawn("deer", 3); this.hunt.spawn("hare", 2);
      rig.run(2);
    },
    cam(t, c) { const a = this.hunt.animals[0]; const p = a ? a.pos : { x: HUNT.x, z: HUNT.z }; rig.look(c, L(V(p.x - 7, gy(p.x - 7, p.z + 3) + 0.7, p.z + 3), V(p.x - 6, gy(p.x - 6, p.z + 1.5) + 0.75, p.z + 1.5), E(t)), V(p.x, gy(p.x, p.z) + 0.8, p.z), 40); },
  },
  bow: {
    secs: 4.5,
    hands: true,
    async stage() {
      await chapter(6, {}, { clearing: { axe: true } });
      setAtmo("evening");
      const w = G.world, pl = G.player; w.huntOpen = true;
      this.hunt = new Hunt(w, { x: HUNT.x, z: HUNT.z, r: 4 });
      this.hunt.spawn("deer", 1);
      const d = this.hunt.animals[0]; d.state = "graze"; d.t = 99;
      pl.place(d.pos.x - 11, d.pos.z - 3, 0); pl.crouched = true; pl.hasBow = true; pl.arrows = 12; pl.showBow(true);
      this.deer = d;
    },
    cam: null,
    tick(t, i) {
      const pl = G.player, d = this.deer, eye = pl.eyePos();
      const dist = Math.hypot(d.pos.x - pl.pos.x, d.pos.z - pl.pos.z);
      pl.crouched = true; d.t = 99; if (d.alive && d.state !== "flee") d.state = "graze";
      pl.yaw = Math.atan2(-(d.pos.x - pl.pos.x), -(d.pos.z - pl.pos.z)); pl.pitch = Math.atan2(d.pos.y + 0.8 + 0.2 - eye.y, dist);
      // draw from half a second in, and let go a second and a half later
      input.mouseDown = i >= 18 && i < 62;
    },
  },
  lantern: {
    secs: 5.5,
    async stage() {
      await chapter(8, {}, null, 1);
      blendAtmo("dusk", "night", 0.35);
      const w = G.world;
      w.lightFire(false);
      for (const a of w.actors.slice()) a.remove();
      const k = new Actor({ model: "townsman", name: "Kessler", coat: 0x4a4a52, legs: 0x2a2a2e, hat: "hat", hatColor: 0x1e1a18, seed: 88 }, 30, -326, 0);
      const lan = makeLantern(false); k.hold(lan); k.person.setPose("lantern"); k.heavy = true;
      const Lt = w.lightPool[1]; Lt.intensity = 4; Lt.distance = 11; Lt.color.set(0xffc27a); Lt.position.set(0, -0.1, 0); lan.add(Lt);
      k.place(22, -336); k.walk([[30, -337], [40, -338]], 1.2);
      G.player.place(34, -318, 0);
      this.k = k;
    },
    cam(t, c) { const k = this.k; rig.look(c, L(V(33, 1.2 + gy(33, -324), -324), V(34, 1.1 + gy(34, -326), -326), t), [k.pos.x, k.pos.y + 1.4, k.pos.z], 38); },
  },
  hearth: {
    secs: 5,
    async stage() { await chapter(9, { night: true }, { winter: { stack: 6, wood: 12, moss: [0, 1, 2, 3, 4, 5], chinked: true } }, 5); },
    cam: (t, c) => rig.look(c, L(cab(1.3, 1.25, 1.2), cab(0.8, 1.15, 0.6), E(t)), cab(-1.0, 0.55, -2.2), 55),
  },
  snowcabin: {
    secs: 4.5,
    async stage() { await chapter(9, { night: true }, { winter: { stack: 6, wood: 12, moss: [0, 1, 2, 3, 4, 5], chinked: true } }, 5); G.player.place(CLEARING.x, CLEARING.z + 12, 0); },
    cam: (t, c) => rig.look(c, L(cab(5, 1.6, 13), cab(3.5, 1.7, 11), E(t)), cab(0, 2.2, 0), 50),
  },
  town1: {
    secs: 5,
    async stage() { await chapter(14, {}, TOWNSAVE(), 2); await preloadTown(1); showcaseTown(1); setAtmo("morning"); rig.run(2); },
    cam: (t, c) => { const a = 2.2 + t * 0.35; rig.look(c, [FIRE.x + Math.cos(a) * 34, gy(FIRE.x, FIRE.z) + 15, FIRE.z + Math.sin(a) * 34], [FIRE.x, gy(FIRE.x, FIRE.z) + 2, FIRE.z], 50); },
  },
  town2: {
    secs: 5,
    async stage() { await chapter(14, {}, TOWNSAVE(), 2); await preloadTown(2); showcaseTown(2); setAtmo("afternoon"); rig.run(2); },
    cam: (t, c) => { const a = 2.55 + t * 0.35; rig.look(c, [FIRE.x + Math.cos(a) * 30, gy(FIRE.x, FIRE.z) + 12, FIRE.z + Math.sin(a) * 30], [FIRE.x, gy(FIRE.x, FIRE.z) + 3, FIRE.z], 50); },
  },
  town3: {
    secs: 5,
    async stage() { await chapter(14, {}, TOWNSAVE(), 2); await preloadTown(3); showcaseTown(3); setAtmo("evening"); rig.run(2); },
    cam: (t, c) => { const a = 2.9 + t * 0.35; rig.look(c, [FIRE.x + Math.cos(a) * 28, gy(FIRE.x, FIRE.z) + 10, FIRE.z + Math.sin(a) * 28], [FIRE.x, gy(FIRE.x, FIRE.z) + 4, FIRE.z], 50); },
  },
  city: {
    secs: 7,
    async stage() { await chapter(14, {}, TOWNSAVE(), 2); await preloadTown(4); showcaseTown(4); blendAtmo("dusk", "night", 0.5); rig.run(2); },
    cam: (t, c) => { const a = 3.3 + t * 0.9, r = 26 - t * 6, h = 5 + t * 10; rig.look(c, [FIRE.x + Math.cos(a) * r, gy(FIRE.x, FIRE.z) + h, FIRE.z + Math.sin(a) * r], [FIRE.x, gy(FIRE.x, FIRE.z) + 5, FIRE.z], 55); },
  },
};
// a settlement to stage the town shots in: people, a field, and the clock at a quiet hour
function TOWNSAVE() {
  const people = ["Marta", "Tomas", "Grete", "Jan", "Liesel", "Hinrich", "Anna", "Claus"].map((name, i) => ({ name, sex: i % 2 ? "m" : "f", seed: 500 + i * 7, job: ["hauler", "woodcutter", "farmer", "baker"][i % 4] }));
  return { unlocked: 14, finishedTutorial: true, town: { store: 40, rye: 80, bread: 20, coin: 50, name: "Forester's Clearing", people, felled: [], logs: [], days: 2.3, buildings: [{ type: "field", x: 22.5, z: -311, ry: 0.35, dug: 3, sown: true, growth: 3, done: true }] } };
}

export const film = {
  // stage a shot and keep its first, middle and last frames, to judge the framing
  async scout(name, shape = "wide") {
    const S = SHOTS[name];
    const [w, h] = shape === "tall" ? [1080, 1920] : [1920, 1080];
    rig.setup(w, h);
    await S.stage.call(S);
    rig.hands(!!S.hands); rig.setup(w, h);
    const n = Math.round(S.secs * rig.fps);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      G.camOverride = c => { if (S.tick) S.tick.call(S, t, i); if (S.cam) S.cam.call(S, t, c); if (shape === "tall") { c.fov = Math.min(80, (S.cam ? c.fov : 50) * 1.55); c.updateProjectionMatrix(); } if (!S.hands) for (const ch of c.children) if (!ch.isLight) ch.visible = false; };
      const keep = i === 0 || i === Math.floor(n / 2) || i === n - 1;
      (await import("../js/engine.js")).frame(1 / rig.fps, !keep);
      if (keep) await fetch(`/__frame?name=scout/${shape}_${name}_${i === 0 ? 0 : i === n - 1 ? 2 : 1}.jpg`, { method: "POST", body: window.__renderer.domElement.toDataURL("image/jpeg", 0.8) });
    }
    G.camOverride = null; rig.hands(true);
    if (S.done) S.done.call(S);
  },
  async take(name, shape = "wide", { from = 0 } = {}) {
    const S = SHOTS[name];
    const [w, h] = shape === "tall" ? [1080, 1920] : [1920, 1080];
    rig.setup(w, h);
    await S.stage.call(S);
    rig.hands(!!S.hands);
    rig.setup(w, h);
    // a tall frame sees less across, so it looks wider
    const tall = shape === "tall";
    const camFn = S.cam ? (t, c) => { S.cam.call(S, t, c); if (tall) { c.fov = Math.min(80, c.fov * 1.55); c.updateProjectionMatrix(); } } : null;
    let i = 0;
    const n = await rig.shot(`${shape}/${name}`, S.secs, (t, c) => {
      if (S.tick) S.tick.call(S, t, i);
      i++;
      if (camFn) camFn(t, c);
      else if (tall) { c.fov = 78; c.updateProjectionMatrix(); }
    }, { from });
    rig.hands(true);
    if (S.done) S.done.call(S);
    return n;
  },
};
window.film = film;
