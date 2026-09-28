// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Raiders. A settlement with full stores is worth robbing: from the second
// year a band comes up the road at dusk every week or so, bigger as the town
// grows. They make for wherever the logs are kept, fill their arms with logs,
// rye and money, and run back down the road with it.
//
// You can stop them: three strokes of the axe or a couple of good arrows puts
// one down, and whatever he was carrying goes back into the stores. They fight
// back — a blow knocks you off your feet and out of breath. Settlers take cover
// by the fire; once the settlement knows Policing, the watch goes after them.
//
// A raider is a target the hunt's arrows can strike (the same shape as an
// animal to it), so the crosshair turns red over them and arrows stick in them.

import { THREE } from "./core.js";
import { G, Actor } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeAxe } from "./models.js";
import { CLEARING, FIRE } from "./woods.js";

/* global SFX */

const LOOK = s => ({ model: "townsman", name: "Raider", coat: [0x3a3228, 0x2e3228, 0x40302a][s % 3], legs: 0x2a2620, hat: ["cap", "hat", null][s % 3], hatColor: 0x241e1a, beard: 0x3e3226, seed: 500 + s });
const WALK = 2.9, FLEE = 2.7;

class Raider {
  constructor(raid, x, z, i) {
    this.raid = raid; this.i = i;
    this.a = new Actor(LOOK(i), x, z, 0);
    this.a.hold(makeAxe());
    this.a.heavy = true;
    this.hp = 3; this.state = "come"; this.loot = null; this.cool = 0; this.stun = 0; this.t = 0;
    this.K = { r: 0.45, h: 1.05, len: 0.18, name: "raider" };
  }
  // (what the hunt's arrows and the crosshair ask of a target)
  get alive() { return this.state !== "down" && this.state !== "gone"; }
  get root() { return this.a.root; }
  get pos() { return this.a.pos; }
  get yaw() { return this.a.yaw; }
  centre() { return new THREE.Vector3(this.a.pos.x, this.a.pos.y + 1.05, this.a.pos.z); }
  update() {}
  startle() {}
  hit(power) {
    if (!this.alive) return;
    this.hp -= power > 0.7 ? 2 : 1;
    AUDIO.shout && Math.random() < 0.5 && AUDIO.shout();
    if (this.hp <= 0) return this.down();
    this.stun = 0.6; this.a.path = [];
  }
  down() {
    this.state = "down"; this.a.path = []; this.a.person.held.clear();
    this.a.lying = true; this.a.yOff = 0.05;
    // what he had goes back where it came from
    if (this.loot) { this.raid.giveBack(this.loot); this.loot = null; }
    SFX.treeFall && SFX.treeFall(0.25);
    setTimeout(() => { this.state = "gone"; this.a.remove(); this.raid.forget(this); }, 25000);
  }
}

export class Raids {
  constructor(w, town) {
    this.w = w; this.town = town; this.band = [];
    const S = town.S;
    // the first comes early in the second year; then every six to nine days
    S.raid ??= { next: 9, count: 0 };
    town.raids = this;
  }
  get active() { return this.band.some(r => r.state === "come" || r.state === "steal" || r.state === "flee"); }
  // the road they come up and go back down
  get roadEnd() { const r = this.w.road[this.w.road.length - 30]; return { x: r.x, z: r.z }; }
  start() {
    const t = this.town, S = t.S, pop = S.people.length + 2;
    const n = Math.min(6, 2 + Math.floor(pop / 5) + Math.floor(S.raid.count / 3));
    const e = this.roadEnd;
    for (let i = 0; i < n; i++) {
      const r = new Raider(this, e.x + (i % 3 - 1) * 1.4, e.z + Math.floor(i / 3) * 1.6, S.raid.count * 7 + i);
      this.band.push(r);
      // the hunt's arrows can strike them, and the crosshair knows them
      if (G.hunt) G.hunt.animals.push(r);
    }
    S.raid.count++; S.raid.next = t.day + 6 + Math.floor(Math.random() * 4);
    t.persist();
    AUDIO.bell && AUDIO.bell(1.1, 0.85);
    setTimeout(() => AUDIO.bell && AUDIO.bell(1.1, 0.85), 700);
    const sib = G.who === "sister" ? "Brother" : "Sister";
    UI.bark(sib, `Raiders — ${n} of them, on the road! They're after the stores!`, 4);
    UI.hint("Raiders! Drive them off with the axe or the bow before they carry off the stores. Three strokes or two good arrows puts one down.", 7);
    t.emit("raid", n);
  }
  forget(r) {
    const i = this.band.indexOf(r); if (i >= 0) this.band.splice(i, 1);
    if (G.hunt) { const j = G.hunt.animals.indexOf(r); if (j >= 0) G.hunt.animals.splice(j, 1); }
  }
  // what a raider carries off, and gives back if he is stopped
  take() {
    const S = this.town.S;
    const loot = { store: Math.min(6, S.store), rye: Math.min(8, S.rye), coin: Math.min(6, S.coin || 0) };
    S.store -= loot.store; S.rye -= loot.rye; S.coin -= loot.coin;
    this.town.showStore && this.town.showStore(); this.town.persist();
    return loot;
  }
  giveBack(l) {
    const S = this.town.S;
    S.store = Math.min(this.town.storeCap, S.store + l.store); S.rye += l.rye; S.coin = (S.coin || 0) + l.coin;
    this.town.showStore && this.town.showStore(); this.town.persist();
    UI.hint(`Got it back: ${[l.store && `${l.store} logs`, l.rye && `${l.rye} rye`, l.coin && `${l.coin} DM`].filter(Boolean).join(", ") || "nothing, as it happens"}.`, 3);
  }
  // the player's axe: a stroke at a raider in reach, in front
  swing(pl) {
    const f = pl.forward();
    let best = null, bd = 2.4;
    for (const r of this.band) {
      if (!r.alive) continue;
      const dx = r.pos.x - pl.pos.x, dz = r.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * f.x + dz * f.z) / (d || 1) > 0.4) { bd = d; best = r; }
    }
    if (!best) return false;
    SFX.chop && SFX.chop();
    best.hit(0.5);
    return true;
  }
  nearest(p, alive = true) {
    let best = null, bd = Infinity;
    for (const r of this.band) { if (alive && !r.alive) continue; const d = Math.hypot(r.pos.x - p.x, r.pos.z - p.z); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  update(dt) {
    const t = this.town, S = t.S, pl = G.player;
    if (!this.band.length && t.day >= S.raid.next && t.frac > 0.63 && t.frac < 0.67 && t.techGates) this.start();
    let stolen = false;
    for (const r of this.band.slice()) {
      if (!r.alive) continue;
      const a = r.a; r.t += dt; r.cool -= dt;
      if (r.stun > 0) { r.stun -= dt; continue; }
      const dp = Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z);
      // you, in the way: he fights (unless he is running off with his arms full)
      if (dp < 4 && r.state !== "flee") {
        a.path = []; a.faceTo(pl.pos.x, pl.pos.z);
        if (dp > 1.3) { a.walkTo(pl.pos.x, pl.pos.z, WALK); }
        else if (r.cool <= 0) {
          r.cool = 1.6; a.person.setPose("chop");
          setTimeout(() => { if (r.alive) a.person.setPose("idle"); }, 500);
          // a blow: knocked back, out of breath, and whatever you were carrying on the ground
          const k = 1.4 / (dp || 1);
          pl.pos.x += (pl.pos.x - a.pos.x) * k; pl.pos.z += (pl.pos.z - a.pos.z) * k;
          G.stamina = 0; pl.winded = true;
          if (pl.carryN) { pl.carryN = 0; UI.carry(null); }
          UI.eye && UI.eye(0.9); setTimeout(() => UI.eye && UI.eye(0), 350);
          SFX.swingFist && SFX.swingFist();
        }
        continue;
      }
      const st = t.stackAt, e = this.roadEnd;
      if (r.state === "come") {
        if (Math.hypot(a.pos.x - st.x, a.pos.z - st.z) < 1.8) { r.state = "steal"; r.t = 0; a.path = []; a.person.setPose("reach"); }
        else if (!a.path.length) a.walkTo(st.x + (r.i % 3 - 1) * 0.8, st.z + 0.6, WALK);
      } else if (r.state === "steal") {
        if (r.t > 2.2) { r.loot = this.take(); r.state = "flee"; a.person.setPose("hold"); a.walkTo(e.x, e.z, FLEE); }
      } else if (r.state === "flee") {
        if (!a.path.length) a.walkTo(e.x, e.z, FLEE);
        if (Math.hypot(a.pos.x - e.x, a.pos.z - e.z) < 2.5) {
          // away down the road, with it
          if (r.loot && (r.loot.store || r.loot.rye || r.loot.coin)) stolen = true;
          r.state = "gone"; a.remove(); this.forget(r);
        }
      }
    }
    if (stolen) {
      S.lootedDay = t.day; t.persist();
      UI.hint("One got away down the road with the stores he could carry. The settlement won't forget it soon.", 5);
    }
    // the raid over: every one of them down in the grass, or away down the road
    const act = this.active;
    if (this.wasActive && !act) {
      const sib = G.who === "sister" ? "Brother" : "Sister";
      UI.bark(sib, this.band.some(r => r.state === "down") ? "They're done. Nobody takes from us twice." : "Gone. We'll be readier next time.", 3.5);
    }
    this.wasActive = act;
  }
}
