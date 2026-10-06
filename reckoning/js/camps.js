// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// RAIDERS' CAMPS: out in the woods near each settlement, a band of raiders has made camp — a fire, a couple of
// lean-tos of hides, and a stash of what they've taken. It's on the map. Put them down and the stash is yours;
// a camp cleared near the first settlement puts its next raid off a few days. Some days later another band moves
// in somewhere else. Raiders camped down in the caves keep a stash by their fire the same way.
import { THREE, Builder, MAT, mat, rng, TAU, makeFlame, prismGeo } from "./core.js";
import { G, Actor } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeArm, MODELS } from "./models.js";
import { CLEARING } from "./woods.js";
import { ITEM, roomFor } from "./body.js";

const RETURN_DAYS = 8;            // a cleared camp: how long before another band moves in, somewhere else
const NEAR = 70, FAR = 100;       // its raiders are about when you're this near the camp, and gone again past this

// a raider camped out (in the woods, or down in the caves): sits by his fire until he sees you, then comes for you.
// `owner` is the camp: what ground is his (holds(x, z)), and his band.
export class Bandit {
  constructor(owner, x, z, i) {
    this.owner = owner; this.hp = 70; this.cool = 1; this.down = false; this.woke = false;
    const raider = !!MODELS.raider;
    this.a = new Actor({ model: raider ? "raider" : "townsman", name: "Raider", coat: [0x4a3424, 0x3e3a2a, 0x54402c][i % 3], legs: [0x3a3226, 0x2e2a22, 0x443a2c][i % 3],
      hat: raider ? undefined : ["cap", "hat", null][i % 3], hatColor: [0x5a4632, 0x3e3428, 0x6a5a44][i % 3], beard: 0x3e3226, seed: 900 + i }, x, z, 0);
    this.arm = ["axe", "club", "sword", "knife"][i % 4];
    this.a.hold(makeArm(this.arm)); this.a.heavy = true;
    this.a.faceTo(owner.fire ? owner.fire.x : x, owner.fire ? owner.fire.z : z);
    this.a.person.setPose("sit");
    // (the hunt's arrows and the musket find him, as they find a raid's raiders)
    this.K = { r: 0.36, h: 1.05, len: 0.18, name: "raider", upright: true };
    if (G.hunt) G.hunt.animals.push(this);
  }
  get alive() { return !this.down; }
  get root() { return this.a.root; }
  get pos() { return this.a.pos; }
  get yaw() { return this.a.yaw; }
  centre() { return new THREE.Vector3(this.a.pos.x, this.a.pos.y + 1.05, this.a.pos.z); }
  update() {}
  startle() { this.wake(); }
  hit(power, head = false) { this.wake(); this.hurt((10 + power * 22) * (head ? 2 : 1)); }
  wake() {
    if (this.woke) return;
    for (const b of this.owner.band || []) if (!b.woke) { b.woke = true; b.a.person.setPose("idle"); }
    AUDIO.voice && AUDIO.voice("war", { at: this.a.pos });
    UI.hint(this.owner.wakeText || "Raiders — they've seen you!", 3);
  }
  remove() { this.a.remove(); if (G.hunt) { const j = G.hunt.animals.indexOf(this); if (j >= 0) G.hunt.animals.splice(j, 1); } }
  tick(dt) {
    if (this.down) return;
    const pl = G.player, a = this.a;
    // one at a time: whoever he has squared up to, you or one of those with you, until one of them is down
    const mates = G.town ? G.town.actors.filter(o => o.settler && o.settler.follow && !o.knocked && this.owner.holds(o.pos.x, o.pos.z)) : [];
    const D = o => Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z), others = (this.owner.band || []).filter(b => b !== this && !b.down);
    const taken = o => others.some(b => b.duel === o);
    if (this.duel && (this.duel === pl ? G.downed || D(pl) > 25 : this.duel.knocked || !mates.includes(this.duel))) this.duel = null;
    if (!this.duel && this.woke) {
      const free = [pl, ...mates].filter(o => !taken(o)).sort((p, q) => D(p) - D(q))[0];
      if (free && D(free) < 18) this.duel = free;
    }
    const near = [pl, ...mates].sort((p, q) => D(p) - D(q))[0];
    const tp = (this.duel || near).pos, foe = this.duel && this.duel !== pl ? this.duel : null;
    const d = D(this.duel || near);
    // (crouched — C — you get closer before they see you)
    if (!this.woke && d < (pl.crouched ? 8 : 15)) this.wake();
    if (!this.woke) return;
    a.squareTo = this.duel || near;
    this.cool -= dt; this.re = (this.re || 0) - dt;
    // nobody free to fight: he hangs back, waiting for his turn
    if (!this.duel) { if (this.re <= 0 && (d < 3.5 || d > 6)) { this.re = 0.8; a.approach(tp, 4.5, 2.6); } return; }
    if (d > 2.0) { if (!a.path.length || this.re <= 0) { this.re = 0.5; a.approach(tp, 1.4, 3.4); } return; }
    if (this.cool > 0.35) { if (this.re <= 0) { this.re = 0.7 + Math.random() * 0.8; if (Math.random() < 0.65) a.circleAbout(tp, 1.6, 1.3); } return; }
    if (d > 1.6) { if (this.re <= 0) { this.re = 0.3; a.approach(tp, 1.3, 2.6); } return; }
    a.path = []; a.faceTo(tp.x, tp.z);
    // the arm drawn back first, so you see it coming
    if (this.cool <= 0 && !(this.wind > 0)) { this.wind = 0.62; a.person.setPose(Math.random() < 0.35 ? "overhead" : "chop"); return; }
    if (this.wind > 0 && (this.wind -= dt) > 0) return;
    if (this.cool <= 0) {
      this.wind = 0;
      this.cool = 1.2 + Math.random() * 0.5;
      setTimeout(() => a.person && a.person.setPose("idle"), 550);
      const dmg = { axe: 17, club: 14, sword: 19, knife: 10 }[this.arm] * (0.8 + Math.random() * 0.4);
      if (foe) { if (Math.hypot(foe.pos.x - a.pos.x, foe.pos.z - a.pos.z) < 2.1) { foe.hp = (foe.hp ?? 50) - dmg; if (foe.hp > 0 && foe.person.flinch) foe.person.flinch(); if (foe.hp <= 0) { if (Math.random() < 0.3 && G.town && G.town.killSettler) G.town.killSettler(foe, "cave"); else { foe.knocked = G.time + 25; foe.lying = true; foe.squareTo = null; } } } }
      else if (Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) < 2.1) G.hurt(pl.guard ? dmg * 0.3 : dmg, "raider");
      AUDIO.whoosh && AUDIO.whoosh(0.4, true);
    }
  }
  hurt(n) {
    if (this.down) return;
    this.wake();
    this.hp -= n;
    if (this.hp > 0) { AUDIO.voice && AUDIO.voice("pain", { at: this.a.pos }); this.a.person.flinch && this.a.person.flinch(); return; }
    this.down = true; this.a.lying = true; this.a.path = []; this.a.squareTo = null; this.duel = null;
    AUDIO.voice && AUDIO.voice("fear", { at: this.a.pos });
    // what he had on him
    const dm = 4 + Math.floor(Math.random() * 10);
    G.body.purse = (G.body.purse || 0) + dm; G.body.dirty = true;
    const left = (this.owner.band || []).filter(b => !b.down).length;
    UI.hint(`He's down. ${dm} DM in his purse — yours now.${left ? "" : " That's the last of them: the stash is yours (F at it)."}`, 4);
    this.owner.onDown && this.owner.onDown(this);
  }
}

// a stroke of yours: a raider of this band in front of you takes it
export function swingAt(band, pl) {
  const f = pl.forward();
  for (const b of band || []) {
    if (b.down) continue;
    const dx = b.a.pos.x - pl.pos.x, dz = b.a.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d < 2.3 && (dx * f.x + dz * f.z) / d > 0.5) {
      // struck by you: it's you he fights now (and whoever had you waits)
      if (b.duel !== pl) { for (const o of band) if (o.duel === pl) o.duel = null; b.duel = pl; }
      b.hurt(20 + Math.random() * 10); AUDIO.clang && AUDIO.clang(0.5, b.a.pos); G.practise && G.practise("strength", 0.6); return true;
    }
  }
  return false;
}

// the raiders' stash: a strongbox, sacks and a heap of what they took, under a hide
export function makeStash() {
  const bb = new Builder();
  bb.box(0.9, 0.5, 0.55, 0, 0.25, 0, 0x5a3e24, 0, 0.05);
  bb.box(0.94, 0.08, 0.58, 0, 0.52, 0, 0x4a3220);
  for (const o of [-0.3, 0.3]) bb.box(0.06, 0.54, 0.6, o, 0.27, 0, 0x2a2724);
  bb.box(0.12, 0.12, 0.04, 0, 0.36, 0.3, 0x8a7a50);
  // sacks, slumped
  for (const [x, z, s] of [[0.75, 0.15, 1], [0.95, -0.35, 0.85], [-0.75, 0.25, 0.9]]) {
    const g = new THREE.SphereGeometry(0.28 * s, 8, 6); g.scale(1, 1.2, 0.9);
    bb.add(g, 0xb8a47a, x, 0.3 * s, z);
    bb.box(0.1 * s, 0.1 * s, 0.1 * s, x, 0.62 * s, z, 0xa8946a);
  }
  // a barrel on its side, and a few stolen logs
  const bg = new THREE.CylinderGeometry(0.26, 0.26, 0.7, 10); bg.rotateZ(Math.PI / 2);
  bb.add(bg, 0x6a4a2e, -0.2, 0.26, -0.6);
  for (let i = 0; i < 3; i++) { const lg = new THREE.CylinderGeometry(0.1, 0.1, 1.4, 7); lg.rotateX(Math.PI / 2); bb.add(lg, 0x7a5634, -1.05 + i * 0.22, 0.1, -0.2); }
  const m = bb.build(MAT.rough); m.castShadow = true;
  return m;
}

// what the stash holds: money, metal and ore, meat, arrows, and the stores they took from you
export function lootStash(rich = 1, homeView = null) {
  const got = [];
  const dm = Math.round((14 + Math.random() * 20) * rich);
  G.body.purse = (G.body.purse || 0) + dm; G.body.dirty = true; got.push(`${dm} DM`);
  const pool = [["ironore", 2, 5], ["copperore", 2, 5], ["tinore", 1, 4], ["iron", 1, 3], ["bronze", 1, 2], ["meat", 2, 5], ["hide", 1, 3]].sort(() => Math.random() - 0.5);
  let full = false;
  for (const [icon, a, b] of pool.slice(0, 2 + (rich > 1 ? 1 : 0))) {
    if (!ITEM[icon]) continue;
    let n = Math.round((a + Math.random() * (b - a)) * rich);
    const room = roomFor(G.pack, G.body, icon); if (room < n) full = true; n = Math.min(n, room);
    if (n <= 0) continue;
    const have = G.pack.find(i => i.icon === icon);
    if (have) have.n = (have.n || 1) + n; else G.pack.push({ icon, name: ITEM[icon].name, note: ITEM[icon].note, n });
    got.push(`${n} ${ITEM[icon].name.toLowerCase()}`);
  }
  if (G.player && G.player.hasBow) { const n = 4 + Math.floor(Math.random() * 5); G.player.arrows = (G.player.arrows || 0) + n; got.push(`${n} arrows`); }
  // (what they took from the settlement goes back to its stores)
  if (homeView && homeView.S) {
    const logs = Math.min(4 + Math.floor(Math.random() * 6), Math.max(0, (homeView.storeCap || 999) - (homeView.S.store || 0))), rye = 8 + Math.floor(Math.random() * 14);
    if (logs) homeView.S.store = (homeView.S.store || 0) + logs;
    homeView.S.rye = (homeView.S.rye || 0) + rye;
    got.push(`and ${logs ? `${logs} logs and ` : ""}${rye} rye back to the stores`);
    G.town && G.town.showStore && G.town.showStore();
  }
  return { got, full };
}

// ---- the camps in the woods ----
export class Camps {
  constructor(w, town) {
    this.w = w; this.town = town; this.camps = new Map();
    w.camps = this;
    this.sync();
  }
  get S() { return this.town.S; }
  // every settlement has one, unless it was cleared and nobody has moved in yet
  places() {
    const S = this.S;
    return [{ name: S.name || "Forester's Clearing", x: CLEARING.x, z: CLEARING.z, r: this.town.clearR || CLEARING.r, main: true },
      ...(S.colonies || []).map(c => ({ name: c.name, x: c.x, z: c.z, r: c.r, main: false }))];
  }
  state(name) {
    const all = (this.S.camps ??= {});
    return (all[name] ??= { gen: 0, cleared: null, looted: false, down: 0, told: false });
  }
  sync() {
    const day = this.town.day || 0;
    for (const pl of this.places()) {
      const st = this.state(pl.name);
      // a band moved on, and another moved in somewhere else
      if (st.cleared != null && day >= st.cleared + RETURN_DAYS) { st.gen++; st.cleared = null; st.looted = false; st.down = 0; st.told = false; this.drop(pl.name); }
      if (st.cleared != null && st.looted) { if (this.camps.has(pl.name)) this.drop(pl.name); continue; }
      if (!this.camps.has(pl.name)) { const c = this.make(pl, st); if (c) this.camps.set(pl.name, c); }
    }
  }
  // a spot in the woods within a few minutes' walk of the settlement: off its ground, off the roads, flat enough
  spot(pl, st) {
    const w = this.w, h = [...(pl.name + st.gen)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7), r = rng(h);
    const others = [...this.camps.values()];
    for (let k = 0; k < 60; k++) {
      const a = r() * TAU, d = pl.r + 45 + r() * 45, x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d;
      if (this.town.onGround(x, z, -16)) continue;
      // (on the map, where you can find it)
      const mb = w.mapBounds; if (mb && (x < mb.x0 + 18 || x > mb.x1 - 18 || z < mb.z0 + 18 || z > mb.z1 - 18)) continue;
      if (w.anyRoadDist && w.anyRoadDist(x, z).d < 12) continue;
      if (others.some(o => Math.hypot(o.x - x, o.z - z) < 40)) continue;
      if (w.cave && w.cave.mouthAt && Math.hypot(w.cave.mouthAt.x - x, w.cave.mouthAt.z - z) < 25) continue;
      if (w.burner && Math.hypot(w.burner.camp.x - x, w.burner.camp.z - z) < 30) continue;
      const hs = [0, 1, 2, 3].map(i => w.heightAt(x + Math.cos(i * 1.57) * 5, z + Math.sin(i * 1.57) * 5));
      if (Math.max(...hs) - Math.min(...hs) > 2.2) continue;
      return { x, z, ry: a + Math.PI };
    }
    return null;
  }
  make(pl, st) {
    const w = this.w, at = this.spot(pl, st); if (!at) return null;
    const { x, z, ry } = at, y = w.heightAt(x, z);
    // the trees cleared for it
    w.clearScenery && w.clearScenery(x, z, 7.5);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const bb = new Builder();
    // the fire: a ring of stones, the logs burned down
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; bb.box(0.26, 0.16, 0.2, Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, 0x6a6660, a, 0); }
    for (let i = 0; i < 3; i++) { const lg = new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6); lg.rotateZ(Math.PI / 2); lg.rotateY(i * 1.05); bb.add(lg, 0x2a221c, 0, 0.1, 0); }
    // two lean-tos: poles and a sheet of hides, a bedroll under each
    for (const [lx, lz, lr] of [[-3.2, -1.6, 0.5], [2.9, -2.2, -0.45]]) {
      const lt = new THREE.Group(), lb = new Builder();
      for (const s of [-1, 1]) { lb.box(0.09, 2.0, 0.09, s * 1.2, 1.0, 0.75, 0x5a4230); lb.box(0.09, 0.09, 2.4, s * 1.2, 0.05, -0.1, 0x5a4230); }
      lb.box(2.5, 0.09, 0.09, 0, 1.95, 0.75, 0x5a4230);
      // (the hides slope from the ridge pole down to the ground behind)
      lb.add(new THREE.BoxGeometry(2.7, 0.05, 2.64), 0x6a5440, 0, 0.98, -0.12, -0.84, 0, 0, 1, 1, 1, 0.08);
      lb.box(0.7, 0.12, 1.7, -0.4, 0.06, -0.1, 0x7a3a2a); lb.box(0.7, 0.12, 1.7, 0.45, 0.06, -0.1, 0x4a4a3a);
      const m = lb.build(MAT.rough); m.castShadow = true; lt.add(m);
      lt.position.set(lx, 0, lz); lt.rotation.y = lr; g.add(lt);
    }
    // log seats round the fire
    for (const [sx, sz, sr] of [[0, 2.0, 0], [-1.9, 0.4, 1.3], [1.9, 0.6, -1.3]]) { const lg = new THREE.CylinderGeometry(0.2, 0.22, 1.5, 8); lg.rotateZ(Math.PI / 2); lg.rotateY(sr); bb.add(lg, 0x6a4a2e, sx, 0.2, sz); }
    // a pole with a rag on it, and a skull of something
    bb.box(0.08, 2.8, 0.08, 4.2, 1.4, 1.5, 0x4a3828);
    bb.box(0.04, 0.55, 0.8, 4.2, 2.4, 1.92, 0x7a2a22);
    bb.box(0.2, 0.16, 0.24, 4.2, 2.86, 1.5, 0xd8d0bc);
    const vis = bb.build(MAT.rough); vis.castShadow = true; vis.receiveShadow = true; g.add(vis);
    // the stash, behind the fire
    const stash = makeStash(); stash.position.set(0.4, 0, -3.6); g.add(stash);
    // the fire's flame, while the camp is lived in
    let flame = null;
    if (st.cleared == null) { flame = makeFlame(1.1, null); flame.position.set(0, 0.1, 0); g.add(flame); w.flames && w.flames.push(flame); }
    w.root.add(g);
    const wp = (lx, lz) => ({ x: x + lx * Math.cos(ry) + lz * Math.sin(ry), z: z - lx * Math.sin(ry) + lz * Math.cos(ry) });
    const sp = wp(0.4, -3.6), cols = [w.col.addCircle(sp.x, sp.z, 1.0, y + 1), ...[[-3.2, -1.6], [2.9, -2.2]].map(([a, b]) => { const p = wp(a, b); return w.col.addCircle(p.x, p.z, 1.1, y + 2); })];
    const camp = { name: pl.name, main: pl.main, x, z, ry, y, g, flame, cols, st, fire: { x, z }, band: [],
      wakeText: `Raiders — the camp near ${pl.name}! They've seen you.`,
      holds: (px, pz) => Math.hypot(px - x, pz - z) < 40,
      onDown: () => { st.down = (st.down || 0) + 1; if (camp.band.every(b => b.down)) this.cleared(camp); this.town.persist(); } };
    const sf = wp(0.4, -2.4);
    camp.it = w.addInteract({ x: sf.x, z: sf.z, y: y + 0.8, reach: 2.4, hold: 2.5, anim: "craft",
      label: () => camp.st.looted ? "The stash — empty" : camp.band.some(b => !b.down) ? `The raiders' stash (${camp.band.filter(b => !b.down).length} of them still standing)` : "Loot the raiders' stash",
      can: () => !camp.st.looted,
      use: () => this.loot(camp) });
    // first seen: the news, and the map
    if (!st.told) {
      st.told = true;
      setTimeout(() => G.report && G.report(`Raiders have made camp in the woods near ${pl.name}. It's marked on the map (J). Put them down, and their stash is yours.`, "big", pl.main ? null : pl.name), 3000);
      this.town.persist();
    }
    return camp;
  }
  drop(name) {
    const c = this.camps.get(name); if (!c) return;
    for (const b of c.band) b.remove(); c.band = [];
    this.w.root.remove(c.g); for (const k of c.cols) this.w.col.remove(k);
    if (c.flame && this.w.flames) { const i = this.w.flames.indexOf(c.flame); if (i >= 0) this.w.flames.splice(i, 1); }
    this.w.removeInteract(c.it);
    this.camps.delete(name);
  }
  // the raiders, about when you're near (and not those already put down)
  spawn(c) {
    const n = Math.max(0, 3 + (this.town.hallTier >= 2 ? 1 : 0) - (c.st.down || 0));
    const seats = [[0, 1.6], [-1.6, 0.4], [1.6, 0.6], [0.9, -1.4]];
    for (let i = 0; i < n; i++) {
      const [lx, lz] = seats[i % seats.length];
      const p = { x: c.x + lx * Math.cos(c.ry) + lz * Math.sin(c.ry), z: c.z - lx * Math.sin(c.ry) + lz * Math.cos(c.ry) };
      c.band.push(new Bandit(c, p.x, p.z, i + (c.st.gen || 0) * 3));
    }
  }
  cleared(c) {
    const st = c.st;
    if (st.cleared != null) return;
    st.cleared = this.town.day;
    if (c.flame) { c.g.remove(c.flame); const i = this.w.flames ? this.w.flames.indexOf(c.flame) : -1; if (i >= 0) this.w.flames.splice(i, 1); c.flame = null; }
    // (the band near the first settlement was the one that raided it: the next raid is put off)
    const R = this.S.raid;
    if (c.main && R && !(this.town.raids && this.town.raids.active)) R.next = Math.max(R.next || 0, this.town.day + 4);
    G.report && G.report(`The raiders' camp near ${c.name} is cleared.${c.main ? " The next raid will be a while coming." : ""}`, "big", c.main ? null : c.name);
  }
  loot(c) {
    if (c.st.looted) return;
    const up = c.band.filter(b => !b.down);
    if (up.length) { for (const b of up) b.wake(); UI.hint(`Not with ${up.length === 1 ? "one of them" : `${up.length} of them`} still on their feet.`, 3); return; }
    const home = this.town.viewFor ? this.town.viewFor(c.main ? null : (this.S.colonies || []).find(k => k.name === c.name)) : this.town;
    const { got, full } = lootStash(1 + (c.st.gen || 0) * 0.15, home);
    c.st.looted = true; if (c.st.cleared == null) this.cleared(c);
    AUDIO.pickup ? AUDIO.pickup() : null;
    UI.hint(`The stash: ${got.join(", ")}.${full ? " (Your pack is full — some was left.)" : ""}`, 7);
    G.report && G.report(`The raiders' stash near ${c.name} was taken back.`, "trade", c.main ? null : c.name);
    this.town.persist();
  }
  swing(pl) { for (const c of this.camps.values()) if (c.band.length && swingAt(c.band, pl)) return true; return false; }
  // for the map: where they are
  list() { return [...this.camps.values()].map(c => ({ x: c.x, z: c.z, cleared: c.st.cleared != null, name: c.name })); }
  update(dt) {
    // a day gone by: anything to move on, or move in
    if (this.day !== this.town.day) { this.day = this.town.day; this.sync(); }
    const p = G.player && G.player.pos; if (!p || (this.w.cave && this.w.cave.inside)) return;
    for (const c of this.camps.values()) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (c.st.cleared == null && !c.band.length && d < NEAR) this.spawn(c);
      // (gone from sight: those still standing are put away, to be there again when you come back)
      else if (c.band.length && d > FAR && !c.band.some(b => b.woke && !b.down)) { for (const b of c.band) b.remove(); c.band = []; }
      for (const b of c.band) b.tick(dt);
    }
  }
}
