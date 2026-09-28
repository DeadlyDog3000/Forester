// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Raiders. A settlement with full stores is worth robbing: from the second
// year a band comes up the road at dusk every week or so, bigger as the town
// grows. They make for wherever the logs are kept, fill their arms with logs,
// rye and money, and run back down the road with it.
//
// They come armed — knives, clubs, axes, now and then a sword — and with
// torches, for it is getting dark. You can stop them: three strokes of the axe
// or a couple of good arrows puts one down, and whatever he was carrying goes
// back into the stores. They fight back: every blow costs you health, and if
// it runs out you go down, and wake by the fire with the raiders gone.
//
// Every grown settler joins in — with a sword or a spear if the smith has made
// them, an axe if they are a woodcutter, and their bare fists if not. The
// children hide by the fire.
//
// A raider is a target the hunt's arrows can strike (the same shape as an
// animal to it), so the crosshair turns red over them and arrows stick in them.

import { THREE } from "./core.js";
import { G, Actor } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeArm, makeTorch } from "./models.js";
import { CLEARING, FIRE } from "./woods.js";

/* global SFX */

const LOOK = s => ({ model: "townsman", name: "Raider", coat: [0x3a3228, 0x2e3228, 0x40302a][s % 3], legs: 0x2a2620, hat: ["cap", "hat", null][s % 3], hatColor: 0x241e1a, beard: 0x3e3226, seed: 500 + s });
const WALK = 2.9, FLEE = 2.7;
const HP = 40;

// what fights with what: damage in points (you have a hundred, a raider forty, a settler fifty).
// Spears, swords and battle axes are forged by the smith, as in the first Forester's tree.
export const ARMS = {
  fists: { name: "Bare fists", dmg: 5 },
  axe: { name: "Axe", dmg: 13 },
  spear: { name: "Spear", key: "spears", dmg: 14, tech: "spears" },
  sword: { name: "Sword", key: "swords", dmg: 20, tech: "swords" },
  battleaxe: { name: "Battle axe", key: "battleaxes", dmg: 28, tech: "battleaxes" },
};
export const ARM_KINDS = ["battleaxe", "sword", "spear"];   // best first
// what a raider carries: how hard, and how often
const THEIRS = { knife: { dmg: 7, cool: 1.1 }, club: { dmg: 10, cool: 1.6 }, axe: { dmg: 12, cool: 1.8 }, sword: { dmg: 14, cool: 1.4 } };

class Raider {
  constructor(raid, x, z, i, n) {
    this.raid = raid; this.i = i;
    this.a = new Actor(LOOK(i), x, z, 0);
    // his own weapon, and a torch in the other hand (the first few throw real light)
    this.arm = ["club", "axe", "knife", "sword", "axe", "club"][n % 6];
    this.a.hold(makeArm(this.arm));
    this.a.hold(makeTorch(n < 3), true);
    this.a.heavy = true;
    this.hp = HP; this.state = "come"; this.loot = null; this.cool = 1; this.stun = 0; this.wind = 0; this.t = 0;
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
  // an arrow: a good full draw does half of him
  hit(power) { this.damage(8 + power * 16); }
  // a stroke at him, from you or a settler (an arrow has no `from`, and can't be parried)
  damage(d, from) {
    if (!this.alive) return;
    if (from && this.stun <= 0 && this.wind <= 0 && this.state !== "flee" && Math.random() < 0.22) {
      const dx = from.pos.x - this.pos.x, dz = from.pos.z - this.pos.z;
      if ((dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (Math.hypot(dx, dz) || 1) > 0.3) return this.parry(from);
    }
    this.hp -= d;
    AUDIO.shout && Math.random() < 0.4 && AUDIO.shout();
    if (this.hp <= 0) return this.down();
    this.stun = 0.45; this.wind = 0; this.a.path = [];
  }
  // he turns the blow aside, and is quick to answer it
  parry(from) {
    SFX.hammer && SFX.hammer();
    this.a.person.setPose("chop"); setTimeout(() => { if (this.alive) this.a.person.setPose("idle"); }, 300);
    this.cool = Math.min(this.cool, 0.35);
    if (from === G.player) {
      G.player.parryJolt = G.time + 0.3;
      if ((this.raid.parried = (this.raid.parried || 0) + 1) <= 2) UI.hint("He caught that on his blade. Watch him — and raise your guard as he swings.", 3);
    } else from.stagger = G.time + 0.9;
  }
  down() {
    this.state = "down"; this.a.path = []; this.a.person.held.clear(); this.a.person.heldL.clear();
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
    // beaten down: you come to by the fire, and they are gone with what they could carry
    G.onDowned = () => this.knockedOut();
  }
  async knockedOut() {
    const pl = G.player, t = this.town;
    G.lockMove = true; UI.fade(1, 0.8);
    UI.hint("You went down.", 2.5);
    await new Promise(r => setTimeout(r, 1500));
    for (const r of this.band) if (r.alive) { if (!r.loot) r.loot = this.take(); r.state = "gone"; r.a.remove(); }
    this.band = this.band.filter(r => r.state === "down");
    if (G.hunt) G.hunt.animals = G.hunt.animals.filter(a => !(a instanceof Raider) || a.state === "down");
    t.S.lootedDay = t.day; t.persist();
    pl.place(FIRE.x + 2.2, FIRE.z + 1.2, 0); pl.yaw = Math.atan2(-(FIRE.x - pl.pos.x), -(FIRE.z - pl.pos.z));
    G.health = 0.35; G.downed = false; G.hurtT = 0; G.stamina = 0.3;
    await new Promise(r => setTimeout(r, 1200));
    UI.fade(0, 1.5); G.lockMove = false;
    const sib = G.who === "sister" ? "Brother" : "Sister";
    UI.bark(sib, "You're awake. They're gone — and half the stores with them. Don't ever do that to me again.", 4.5);
  }
  get active() { return this.band.some(r => r.state === "come" || r.state === "steal" || r.state === "flee"); }
  // the road they come up and go back down
  get roadEnd() { const r = this.w.road[this.w.road.length - 30]; return { x: r.x, z: r.z }; }
  start() {
    const t = this.town, S = t.S, pop = S.people.length + 2;
    const n = Math.min(6, 2 + Math.floor(pop / 5) + Math.floor(S.raid.count / 3));
    const e = this.roadEnd;
    for (let i = 0; i < n; i++) {
      const r = new Raider(this, e.x + (i % 3 - 1) * 1.4, e.z + Math.floor(i / 3) * 1.6, S.raid.count * 7 + i, i);
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
    UI.hint("Raiders! Drive them off with the axe or the bow before they carry off the stores. Mind your health — they hit back.", 7);
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
    best.damage(this.town.armDmg(pl.blade && pl.blade !== "axe" ? pl.blade : "axe"), pl);
    return true;
  }
  // the nearest one standing up to him: you (unless you're down), or a settler in the fight, within a few steps
  foeOf(r) {
    const pl = G.player, a = r.a;
    let best = null, bd = 4;
    if (!G.downed && G.mode === "play") { const d = Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z); if (d < bd) { bd = d; best = pl; } }
    for (const s of this.town.actors) {
      if (!s.fighting || s.knocked) continue;
      const d = Math.hypot(s.pos.x - a.pos.x, s.pos.z - a.pos.z);
      if (d < bd - 0.5) { bd = d; best = s; }
    }
    return best;
  }
  strikePlayer(r, W, d) {
    const pl = G.player, a = r.a, f = pl.forward();
    const dx = a.pos.x - pl.pos.x, dz = a.pos.z - pl.pos.z, facing = (dx * f.x + dz * f.z) / (Math.hypot(dx, dz) || 1) > 0.25;
    // raised just as he swung: a parry — nothing lands, and he is thrown off his stroke
    if (pl.guard && facing && G.time - pl.guardAt < 0.45) {
      SFX.hammer && SFX.hammer(); setTimeout(() => SFX.hammer && SFX.hammer(), 60);
      pl.parryJolt = G.time + 0.25; r.stun = 1.3; r.cool = Math.max(r.cool, 1.6); a.path = [];
      if ((this.youParried = (this.youParried || 0) + 1) <= 3) UI.hint("Parried! He's off balance — strike now.", 1.8);
      return;
    }
    // held up all along: a block — most of the blow taken on the haft, and it costs breath
    let dmg = W.dmg * (0.8 + Math.random() * 0.4);
    if (pl.guard && facing && (G.stamina ?? 1) > 0.15) {
      SFX.hammer && SFX.hammer(); pl.parryJolt = G.time + 0.2;
      G.stamina = Math.max(0, (G.stamina ?? 1) - 0.3);
      dmg *= 0.25;
      if (!this.blockTip) { this.blockTip = true; UI.hint("Blocked — but it cost you. Raise your guard just as he swings to parry instead.", 3.5); }
    } else {
      // a blow: knocked back a step, the breath half out of you, and whatever you carried on the ground
      const k = 0.7 / (d || 1);
      pl.pos.x += (pl.pos.x - a.pos.x) * k; pl.pos.z += (pl.pos.z - a.pos.z) * k;
      G.stamina = Math.max(0, (G.stamina ?? 1) - 0.4);
      if (pl.carryN) { pl.carryN = 0; UI.carry(null); }
    }
    G.hurt(dmg, r);
  }
  strikeSettler(s, dmg, r) {
    // settlers parry too: now and then, better with a weapon than bare-handed
    if (Math.random() < (s.armKind && s.armKind !== "fists" ? 0.3 : 0.1)) {
      SFX.hammer && SFX.hammer(); if (r) { r.stun = 1; r.cool = Math.max(r.cool, 1.2); }
      return;
    }
    s.hp = (s.hp ?? 50) - dmg;
    if (s.hp > 0) return;
    // down in the grass for a while; they get up again when it's over
    s.knocked = G.time + 18; s.path = []; s.lying = true; s.yOff = 0.05; s.person.held.clear(); s.armKind = null;
    UI.bark(s.settler.name, ["Ah—!", "I'm down—", "Get him off me!"][Math.floor(Math.random() * 3)], 1.8);
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
      // whoever is in his way — you, or a settler standing up to him — he fights
      // (unless he is running off with his arms full)
      const foe = r.state !== "flee" && this.foeOf(r);
      if (foe) {
        const fp = foe === pl ? pl.pos : foe.pos, d = Math.hypot(fp.x - a.pos.x, fp.z - a.pos.z);
        a.path = []; a.faceTo(fp.x, fp.z);
        const W = THEIRS[r.arm];
        if (r.wind > 0) {
          // the wind-up: the arm going back — the moment to raise a guard
          r.wind -= dt;
          if (r.wind <= 0) {
            a.person.setPose("chop"); setTimeout(() => { if (r.alive) a.person.setPose("idle"); }, 350);
            AUDIO.whoosh && AUDIO.whoosh(0.4, r.arm !== "knife");
            if (d < 1.9) foe === pl ? this.strikePlayer(r, W, d) : this.strikeSettler(foe, W.dmg, r);
          }
        } else if (d > 1.3) { a.walkTo(fp.x, fp.z, WALK); }
        else if (r.cool <= 0) {
          r.cool = W.cool * (0.85 + Math.random() * 0.3);
          r.wind = 0.5; a.person.setPose("reach");
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
    G.showHealth = act;
    if (this.wasActive && !act) {
      const sib = G.who === "sister" ? "Brother" : "Sister";
      UI.bark(sib, this.band.some(r => r.state === "down") ? "They're done. Nobody takes from us twice." : "Gone. We'll be readier next time.", 3.5);
    }
    this.wasActive = act;
  }
}
