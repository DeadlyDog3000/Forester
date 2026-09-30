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
import { startChapter, writeSave, loadSave, LOOKS } from "../js/story.js";
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
    cam: (t, c) => rig.look(c, L(V(-37.6, 1.4, 42), V(-37.2, 1.35, 47.5), E(t)), V(-35, 3.0, 67), 50),
  },
  road: {
    secs: 6.5,
    // walking the road north-east, the forks and the woods closing in ahead
    async stage() { await chapter(5); setAtmo("afternoon"); G.player.place(24, -38, 0); },
    cam(t, c) {
      const x = L([0, 26], [2.2, 4], E(t)), from = [x[0], gy(x[0], x[1]) + 1.75, x[1]];
      const a = L([9, -16], [18, -34], E(t));
      rig.look(c, from, [a[0], gy(a[0], a[1]) + 2.4, a[1]], 50);
    },
  },
  clearing: {
    secs: 5.5,
    async stage() { await chapter(6, {}, { clearing: {} }); setAtmo("evening"); },
    cam: (t, c) => rig.look(c, L(cab(-5, 1.3, 13), cab(-2.5, 1.35, 8.5), E(t)), cab(0, 1.7, 0), 50),
  },
  felling: {
    secs: 5,
    hands: true,
    // first person, as you play it: one last swing, and a spruce at the edge of the clearing comes down
    async stage() {
      await chapter(6, {}, { clearing: { axe: true, first: true } });
      setAtmo("afternoon");
      const w = G.world, pl = G.player;
      const tr = w.fellable.filter(f => f.state === "up").sort((a, b) => Math.hypot(a.x - CLEARING.x, a.z - CLEARING.z) - Math.hypot(b.x - CLEARING.x, b.z - CLEARING.z))[0];
      const dx = CLEARING.x - tr.x, dz = CLEARING.z - tr.z, l = Math.hypot(dx, dz);
      // a spruce's skirts reach nearly four metres, so stand clear of them, facing the trunk
      pl.place(tr.x + dx / l * 7.5, tr.z + dz / l * 7.5, Math.atan2(dx, dz));
      pl.giveAxe(true);
      this.tree = tr; this.dir = [dx / l, dz / l];
    },
    tick(t, i) {
      const pl = G.player, tr = this.tree;
      pl.yaw = Math.atan2(pl.pos.x - tr.x, pl.pos.z - tr.z);
      // eyes on the crown, then following it down as it goes
      pl.pitch = i < 30 ? 0.2 : 0.2 - Math.min(1, (i - 30) / 60) * 0.3;
      // the last swing lands, and the tree goes over away from you, as the game's own fell() has it
      if (i === 8) pl.swing(() => {
        const dx = -this.dir[0], dz = -this.dir[1];
        tr.state = "falling"; tr.fall = 0; tr.col.disabled = true;
        tr.dir = { x: dx, z: dz }; tr.axis = new THREE.Vector3(dz, 0, -dx);
      });
    },
  },
  deer: {
    secs: 8,
    async stage() {
      await chapter(6, {}, { clearing: { axe: true } });
      setAtmo("evening");
      const w = G.world; w.huntOpen = true;
      G.player.place(CLEARING.x, CLEARING.z, 0);
      this.hunt = new Hunt(w, { x: HUNT.x, z: HUNT.z, r: 6 });
      this.hunt.spawn("deer", 3); this.hunt.spawn("hare", 2);
      rig.run(2);
      // a place to watch from with nothing in the way: round the glade until the line to its middle is clear
      const col = w.col, at = (x, z) => new THREE.Vector3(x, gy(x, z) + 0.9, z);
      this.eye = null;
      for (let a = Math.PI; a < Math.PI * 3 && !this.eye; a += 0.2) {
        const x = HUNT.x + Math.cos(a) * 11, z = HUNT.z + Math.sin(a) * 11;
        if (!col.solidAt(x, gy(x, z) + 1, z, 0.8) && col.lineOfSight(at(x, z), at(HUNT.x, HUNT.z))) this.eye = [x, z];
      }
      this.eye = this.eye || [HUNT.x - 11, HUNT.z];
    },
    cam(t, c) {
      const [x, z] = this.eye, alive = this.hunt.animals.filter(a => a.alive);
      const cx = alive.reduce((s, a) => s + a.pos.x, 0) / (alive.length || 1), cz = alive.reduce((s, a) => s + a.pos.z, 0) / (alive.length || 1);
      const k = 0.15 + 0.1 * t;
      rig.look(c, [x + (cx - x) * k, gy(x, z) + 0.75, z + (cz - z) * k], [cx, gy(cx, cz) + 0.7, cz], 38);
    },
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
      const at = (x, z) => new THREE.Vector3(x, gy(x, z) + 1.0, z);
      let spot = null;
      for (let a = Math.PI; a < Math.PI * 3 && !spot; a += 0.15) {
        const x = d.pos.x + Math.cos(a) * 10, z = d.pos.z + Math.sin(a) * 10;
        if (!w.col.solidAt(x, gy(x, z) + 1, z, 1.2) && w.col.lineOfSight(at(x, z), at(d.pos.x, d.pos.z))) spot = [x, z];
      }
      spot = spot || [d.pos.x - 10, d.pos.z];
      pl.place(spot[0], spot[1], 0); pl.crouched = true; pl.hasBow = true; pl.arrows = 12; pl.showBow(true);
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
    cam(t, c) { const k = this.k; rig.look(c, L(V(27, 1.2 + gy(27, -323), -323), V(28, 1.1 + gy(28, -325), -325), t), [k.pos.x, k.pos.y + 1.4, k.pos.z], 24); },
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
    cam: (t, c) => { const a = 2.55 + t * 0.35; rig.look(c, [FIRE.x + Math.cos(a) * 36, gy(FIRE.x, FIRE.z) + 19, FIRE.z + Math.sin(a) * 30], [FIRE.x, gy(FIRE.x, FIRE.z) + 3, FIRE.z], 50); },
  },
  town3: {
    secs: 5,
    async stage() { await chapter(14, {}, TOWNSAVE(), 2); await preloadTown(3); showcaseTown(3); setAtmo("evening"); rig.run(2); },
    cam: (t, c) => { const a = 2.9 + t * 0.35; rig.look(c, [FIRE.x + Math.cos(a) * 36, gy(FIRE.x, FIRE.z) + 14, FIRE.z + Math.sin(a) * 28], [FIRE.x, gy(FIRE.x, FIRE.z) + 4, FIRE.z], 50); },
  },
  city: {
    secs: 7,
    async stage() { await chapter(14, {}, TOWNSAVE(), 2); await preloadTown(4); showcaseTown(4); blendAtmo("dusk", "night", 0.5); rig.run(2); },
    cam: (t, c) => { const a = 3.3 + t * 0.9, r = 34 - t * 6, h = 9 + t * 11; rig.look(c, [FIRE.x + Math.cos(a) * r, gy(FIRE.x, FIRE.z) + h, FIRE.z + Math.sin(a) * r], [FIRE.x, gy(FIRE.x, FIRE.z) + 5, FIRE.z], 55); },
  },
  raid: {
    secs: 4.5,
    // night, and the raiders coming down the road with their torches, toward the houses and the fire
    async stage() {
      await chapter(14, {}, TOWNSAVE(), 2); await preloadTown(2); showcaseTown(2);
      const t = G.town; t.t = t.dayLen * (Math.floor(t.t / t.dayLen) + 0.83); rig.run(1.5);
      t.S.raid = { next: 0, count: 1 }; if (t.raids) t.raids.start();
      this.band = t.raids ? t.raids.band.length : 0; this.cx = this.cz = null;
      rig.run(1.2);
    },
    // (behind the band, low, following them down into the settlement toward the fire)
    cam(t, c) {
      const band = (G.town.raids ? G.town.raids.band : []).filter(r => r.alive);
      let x = 0, z = 0; for (const r of band) { x += r.pos.x; z += r.pos.z; }
      if (band.length) { x /= band.length; z /= band.length; } else { x = FIRE.x; z = FIRE.z + 20; }
      this.cx = this.cx == null ? x : this.cx + (x - this.cx) * 0.08; this.cz = this.cz == null ? z : this.cz + (z - this.cz) * 0.08;
      const dx = FIRE.x - this.cx, dz = FIRE.z - this.cz, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      const fx = this.cx - ux * 5.5 + uz * 1.6, fz = this.cz - uz * 5.5 - ux * 1.6;
      rig.look(c, [fx, gy(fx, fz) + 2.0, fz], [this.cx + ux * 9, gy(this.cx, this.cz) + 1.3, this.cz + uz * 9], 55);
    },
  },
  mine: {
    secs: 6,
    hands: true,
    // your own pick at a copper rock out in the woods, the ore breaking loose
    async stage() {
      await chapter(14, {}, TOWNSAVE(), 2); setAtmo("afternoon");
      const k = G.world.rocks.find(r => r.kind === "copper");
      G.player.place(k.x + 2.5, k.z + 0.6, 0); G.player.yaw = Math.atan2(-(k.x - G.player.pos.x), -(k.z - G.player.pos.z)); G.player.pitch = -0.2;
      rig.run(1);
      G.body.tools.pick = 4; G.player.wield("pick");
    },
    tick(t, i) { input.click = i % 24 === 2; },
    // (the hands are fixed to the view, so for a tall frame this is filmed wide and large, and cut down)
    done() { input.click = false; },
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
    const [w, h] = shape === "tall" ? [1080, 1920] : shape === "big" ? [2880, 1620] : [1920, 1080];   // ("big": filmed wide and large, to be cut down to a tall frame)
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
    const [w, h] = shape === "tall" ? [1080, 1920] : shape === "big" ? [2880, 1620] : [1920, 1080];   // ("big": filmed wide and large, to be cut down to a tall frame)
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
