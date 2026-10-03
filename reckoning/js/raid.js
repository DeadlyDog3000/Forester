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

import { blowMul, SWORD_MUL } from "./body.js";
// your own sword strikes by its making (the smith's by his); anything else as it is
const ownBlade = pl => pl.blade === "sword" && G.body && G.body.tools.sword > 0 && !(G.town && G.town.playerArm && G.town.playerArm() === "sword" && G.body.tools.sword < 3) ? SWORD_MUL[G.body.tools.sword] : 1;
import { THREE } from "./core.js";
import { G, Actor } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeArm, makeTorch, MODELS } from "./models.js";
import { CLEARING, FIRE } from "./woods.js";
import { NATIONS, strengthOf, the } from "./europe.js";

/* global SFX */

const LOOK = (s, enemy) => enemy
  // a crown's soldiers: its colours, a hat each
  ? { model: "townsman", name: "Soldier", coat: parseInt(NATIONS[enemy].color.slice(1), 16), legs: 0x2a2620, hat: "hat", hatColor: 0x1a1a1a, beard: 0x3e3226, seed: 500 + s }
  : { model: MODELS.raider ? "raider" : "townsman", name: "Raider", coat: [0x4a3424, 0x3e3a2a, 0x54402c][s % 3], legs: [0x3a3226, 0x2e2a22, 0x443a2c][s % 3], hat: MODELS.raider ? undefined : ["cap", "hat", null][s % 3], hatColor: [0x5a4632, 0x3e3428, 0x6a5a44][s % 3], beard: 0x3e3226, seed: 500 + s };
const WALK = 3.4, FLEE = 3.1, WALL_SPEED = 2.6;
const HP = 85;                    // (harder than they were: a raider takes a good few blows now)
const DIRS = ["up", "left", "right"];

// what fights with what: damage in points (you have a hundred, a raider forty, a settler fifty).
// Spears, swords and battle axes are forged by the smith, as in the first Forester's tree.
export const ARMS = {
  fists: { name: "Bare fists", dmg: 5 },
  axe: { name: "Axe", dmg: 13 },
  spear: { name: "Spear", key: "spears", dmg: 14, tech: "spears" },
  sword: { name: "Sword", key: "swords", dmg: 20, tech: "swords" },
  battleaxe: { name: "Battle axe", key: "battleaxes", dmg: 28, tech: "battleaxes" },
  // (a musket: fired from range, a ball that does more than any blade; up close, empty, it's a club)
  musket: { name: "Musket", key: "muskets", dmg: 10 },
};
export const ARM_KINDS = ["battleaxe", "sword", "spear"];   // best first
// what a raider carries: how hard, and how often
const THEIRS = { knife: { dmg: 13, cool: 0.85 }, club: { dmg: 19, cool: 1.15 }, axe: { dmg: 23, cool: 1.35 }, sword: { dmg: 25, cool: 1.05 } };
// how long a raider's arm is drawn back before the blow lands: the red mark by the crosshair shows the side all that while
const WIND = 1.0;

class Raider {
  constructor(raid, x, z, i, n, enemy) {
    this.raid = raid; this.i = i;
    this.a = new Actor(LOOK(i, enemy), x, z, 0);
    // his own weapon, and a torch in the other hand (the first few throw real light); soldiers carry swords
    this.arm = enemy ? ["sword", "sword", "axe"][n % 3] : ["club", "axe", "knife", "sword", "axe", "club"][n % 6];
    this.a.hold(makeArm(this.arm));
    this.a.hold(makeTorch(n < 3), true);
    this.a.heavy = true;
    this.hp = HP; this.state = "come"; this.loot = null; this.cool = 1; this.stun = 0; this.wind = 0; this.t = 0;
    this.dir = "right"; this.guardDir = DIRS[n % 3]; this.guardT = 1;
    this.K = { r: 0.36, h: 1.05, len: 0.18, name: "raider", upright: true };
  }
  // (what the hunt's arrows and the crosshair ask of a target)
  get alive() { return this.state !== "down" && this.state !== "gone"; }
  get root() { return this.a.root; }
  get pos() { return this.a.pos; }
  get yaw() { return this.a.yaw; }
  centre() { return new THREE.Vector3(this.a.pos.x, this.a.pos.y + 1.05, this.a.pos.z); }
  update() {}
  startle() {}
  // an arrow: a good full draw takes over a third of him; one in the head, twice that
  hit(power, head = false) {
    this.damage((10 + power * 22) * (head ? 2 : 1));
    if (head && this.alive && !this.raid.headTold) { this.raid.headTold = true; UI.hint("In the head — that one counts double.", 2.5); }
  }
  // a stroke at him, from you or a settler (an arrow has no `from`, and can't be parried)
  damage(d, from) {
    if (!this.alive) return;
    // a stroke that comes where he is guarding, he turns aside (yours, by the side you struck from; a settler's, now and then)
    if (from && this.stun <= 0 && this.wind <= 0 && this.state !== "flee") {
      const dx = from.pos.x - this.pos.x, dz = from.pos.z - this.pos.z;
      const facing = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (Math.hypot(dx, dz) || 1) > 0.3;
      const guarded = from === G.player ? this.guardDir === (G.player.swingDir || "right") : Math.random() < 0.22;
      if (facing && guarded) return this.parry(from);
    }
    this.hp -= d;
    if (this.hp <= 0) { AUDIO.voice("pain", { at: this.pos, vol: 1.1 }); return this.down(); }
    this.a.person.flinch && this.a.person.flinch();
    // struck by you: whoever he was fighting, it's you he turns on now
    if (from === G.player && this.duel !== G.player) this.raid.lock(this, G.player);
    AUDIO.voice(Math.random() < 0.7 ? "pain" : "grunt", { at: this.pos });
    // (a blow doesn't stop his own stroke once it's started — you have to guard it, or get out of the way; between
    // strokes it staggers him for a moment)
    if (!(this.wind > 0)) { this.stun = 0.2; this.a.path = []; }
  }
  // he turns the blow aside, and is quick to answer it
  parry(from) {
    AUDIO.clang(0.9, this.pos);
    this.a.person.setPose("chop"); setTimeout(() => { if (this.alive) this.a.person.setPose("idle"); }, 300);
    this.cool = Math.min(this.cool, 0.35);
    if (from === G.player) {
      G.player.parryJolt = G.time + 0.3;
      if ((this.raid.parried = (this.raid.parried || 0) + 1) <= 2) UI.hint("He was guarding that side — the grey mark by the crosshair. Strike from another: look up for an overhead, or turn left or right.", 5);
    } else from.stagger = G.time + 0.9;
  }
  down() {
    this.raid.lock(this, null); this.a.squareTo = null;
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
    G.onDowned = (from, lost) => this.active && from !== "hunger" ? this.knockedOut(lost) : G.wakeUp(from, lost);
  }
  async knockedOut(lost = {}) {
    const pl = G.player, t = this.town;
    G.lockMove = true; UI.fade(1, 0.8);
    UI.hint("You were killed.", 2.5);
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
    UI.bark(sib, "You're breathing. I thought — they left you for dead. They're gone, and half the stores with them. Don't ever do that to me again.", 5);
    setTimeout(() => UI.hint("You came back from it, but not whole." + G.lostText(lost), 7), 5200);
  }
  get active() { return this.band.some(r => r.state === "come" || r.state === "steal" || r.state === "flee" || r.state === "breach"); }
  // the road they come up and go back down
  get roadEnd() { const r = this.w.road[this.w.road.length - 30]; return { x: r.x, z: r.z }; }
  start() {
    const t = this.town, S = t.S, pop = S.people.length + 2, enemy = t.enemy;
    // at war: a crown's soldiers, more of them the stronger it is
    const n = enemy ? Math.min(10, 4 + strengthOf(S.europe, enemy)) : Math.min(8, 3 + Math.floor(pop / 4) + Math.floor(S.raid.count / 2));
    this.enemy = enemy;
    const e = this.roadEnd;
    for (let i = 0; i < n; i++) {
      const r = new Raider(this, e.x + (i % 3 - 1) * 1.4, e.z + Math.floor(i / 3) * 1.6, S.raid.count * 7 + i, i, enemy);
      this.band.push(r);
      // the hunt's arrows can strike them, and the crosshair knows them
      if (G.hunt) G.hunt.animals.push(r);
    }
    S.raid.count++; S.raid.next = t.day + (enemy ? 3 + Math.floor(Math.random() * 3) : 6 + Math.floor(Math.random() * 4));
    t.persist();
    AUDIO.bell && AUDIO.bell(1.1, 0.85);
    setTimeout(() => AUDIO.bell && AUDIO.bell(1.1, 0.85), 700);
    const sib = G.who === "sister" ? "Brother" : "Sister";
    UI.bark(sib, enemy ? `Soldiers — ${n} of them, from ${the(enemy)}, on the road!` : `Raiders — ${n} of them, on the road! They're after the stores!`, 4);
    // they come up the road yelling, to frighten; and the settlement cries out
    this.band.forEach((r, i) => setTimeout(() => r.alive && AUDIO.voice("war", { at: r.pos, vol: 1.2 }), 300 + i * 380 + Math.random() * 300));
    setTimeout(() => { const s = this.town.actors[0]; if (s) AUDIO.voice("fear", { at: s.pos, high: true }); }, 1400);
    G.guide && G.guide("raid");
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
    best.damage(this.town.armDmg(pl.blade && pl.blade !== "axe" ? pl.blade : "axe") * blowMul(G.body) * ownBlade(pl), pl); G.practise("strength", 1.5);
    return true;
  }
  // ---- the duel: a raider fights one at a time, whoever he has squared up to, until one of them is down ----
  // (you, or one settler; a settler with no raider left to pair with waits their turn rather than piling on)
  lock(r, foe) {
    const old = r.duel;
    if (old === foe) return;
    if (old && old !== G.player && old.duel === r) old.duel = null;
    r.duel = foe;
    // (one on you at a time: whoever had you before lets you be)
    if (foe === G.player) for (const o of this.band) if (o !== r && o.duel === foe) o.duel = null;
    if (foe && foe !== G.player) { if (foe.duel && foe.duel !== r && foe.duel.duel === foe) foe.duel.duel = null; foe.duel = r; }
    if (foe === G.player) {
      AUDIO.voice("war", { at: r.pos, vol: 1 });
      if (!this.duelTold) { this.duelTold = true; UI.hint("He's squared up to you — it's you and him now. Watch for the red mark as he winds up, and guard that side.", 5); }
    }
  }
  // a settler looking for a fight: the nearest raider nobody has squared up to yet
  claim(a) {
    let best = null, bd = Infinity;
    for (const r of this.band) {
      if (!r.alive || r.duel) continue;
      const d = Math.hypot(r.pos.x - a.pos.x, r.pos.z - a.pos.z);
      if (d < bd) { bd = d; best = r; }
    }
    if (best) this.lock(best, a);
    return best;
  }
  // who he is fighting, if anyone: the one he is locked to while they're still standing and not far off;
  // otherwise you, if you come close enough and nobody else of his is already at you
  duelOf(r) {
    const pl = G.player, a = r.a, D = f => Math.hypot(f.pos.x - a.pos.x, f.pos.z - a.pos.z);
    const ok = f => f === pl ? !G.downed && G.mode === "play" && D(pl) < 22 : f && !f.knocked && !f.gone && !f.dead && f.fighting && f.duel === r && D(f) < 22;
    if (r.duel && !ok(r.duel)) this.lock(r, null);
    if (!r.duel && !G.downed && G.mode === "play" && !this.band.some(o => o !== r && o.alive && o.duel === pl)) {
      const d = D(pl);
      // (running off with his arms full, he only turns on you if you catch him)
      if (d < (r.state === "flee" ? 2.4 : 9)) this.lock(r, pl);
    }
    return r.duel;
  }
  strikePlayer(r, W, d) {
    const pl = G.player, a = r.a, f = pl.forward();
    const dx = a.pos.x - pl.pos.x, dz = a.pos.z - pl.pos.z, facing = (dx * f.x + dz * f.z) / (Math.hypot(dx, dz) || 1) > 0.25;
    // a guard on the wrong side catches nothing
    const side = (pl.stance || "right") === r.dir;
    if (pl.guard && facing && !side && !this.sideTip) { this.sideTip = true; UI.hint("Wrong side! Put your guard where the red mark is — look up for a blow from above, turn left or right for the sides.", 5); }
    // raised just as he swung, on his side: a parry — nothing lands, and he is thrown off his stroke
    if (pl.guard && facing && side && G.time - pl.guardAt < 0.6) {
      AUDIO.clang(1.2);
      pl.parryJolt = G.time + 0.25; r.stun = 0.9; r.cool = Math.max(r.cool, 1.2); a.path = [];
      if ((this.youParried = (this.youParried || 0) + 1) <= 3) UI.hint("Parried! He's off balance — strike now.", 1.8);
      return;
    }
    // held up all along: a block — most of the blow taken on the haft, and it costs breath
    let dmg = W.dmg * (0.8 + Math.random() * 0.4);
    if (pl.guard && facing && side && (G.stamina ?? 1) > 0.15) {
      AUDIO.clang(0.7); pl.parryJolt = G.time + 0.2;
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
    if (dmg > 4) AUDIO.voice(dmg > 9 ? "pain" : "grunt", { high: G.who === "sister", vol: 0.8 });
    G.hurt(dmg, r);
  }
  // a woman's or a child's voice
  highVoice(s) { const p = s.settler || {}; return p.sex === "f" || !!p.child; }
  strikeSettler(s, dmg, r) {
    // settlers parry too: now and then, better with a weapon than bare-handed
    if (Math.random() < (s.armKind && s.armKind !== "fists" ? 0.3 : 0.1)) {
      if (s.armKind && s.armKind !== "fists") AUDIO.clang(0.8, s.pos); else AUDIO.voice("grunt", { at: s.pos, high: this.highVoice(s) });
      if (r) { r.stun = 1; r.cool = Math.max(r.cool, 1.2); }
      return;
    }
    s.hp = (s.hp ?? 50) - dmg;
    if (s.hp > 0 && s.person.flinch) s.person.flinch();
    AUDIO.voice(s.hp > 0 ? "pain" : "fear", { at: s.pos, high: this.highVoice(s) });
    if (s.hp > 0) return;
    // cut down by a blade, sometimes they do not get up again
    if (r && r.arm && r.arm !== "fists" && Math.random() < 0.3 && this.town.killSettler) { this.town.killSettler(s); return; }
    // down in the grass for a while; they get up again when it's over
    s.squareTo = null; s.duel = null;
    s.knocked = G.time + 18; s.wasKnocked = true; s.path = []; s.lying = true; s.yOff = 0.05; s.person.held.clear(); s.armKind = null;
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
      // his guard moves: to a side at random, or to the side you're on
      if ((r.guardT -= dt) <= 0) { r.guardT = 0.8 + Math.random() * 1.0; r.guardDir = Math.random() < (r.duel === pl ? 0.65 : 0.45) && pl.stance ? pl.stance : DIRS[Math.floor(Math.random() * 3)]; }
      const foe = this.duelOf(r);
      a.squareTo = foe;
      if (foe) {
        const fp = foe.pos, d = Math.hypot(fp.x - a.pos.x, fp.z - a.pos.z);
        const W = THEIRS[r.arm];
        r.stepT = (r.stepT || 0) - dt;
        if (r.wind > 0) {
          // the wind-up: the arm going back — the moment to raise a guard
          a.path = [];
          const was = r.wind; r.wind -= dt;
          if (was > 0.62 && r.wind <= 0.62) a.person.setPose(r.dir === "up" ? "overhead" : "chop");
          if (r.wind <= 0) {
            setTimeout(() => { if (r.alive) a.person.setPose("idle"); }, 550);
            AUDIO.whoosh && AUDIO.whoosh(0.4, r.arm !== "knife");
            if (d < 1.9) foe === pl ? this.strikePlayer(r, W, d) : this.strikeSettler(foe, W.dmg, r);
          }
        } else if (d > 2.3) {
          // closing in on them, and keeping after them
          if (!a.path.length || r.stepT <= 0) { r.stepT = 0.4; a.approach(fp, 1.4, WALK); }
        } else if (d < 0.95) {
          // too close to swing: a step back
          if (r.stepT <= 0) { r.stepT = 0.5; a.approach(fp, 1.5, 2.2); }
        } else if (r.cool <= 0) {
          if (d > 1.75) { if (r.stepT <= 0) { r.stepT = 0.3; a.approach(fp, 1.3, 2.6); } }
          else {
            a.path = [];
            r.cool = W.cool * (0.85 + Math.random() * 0.3);
            // (the stroke starts with the wind-up: the weapon drawn back, or raised high for one from above, and the blow lands as it comes through)
            r.wind = WIND; r.dir = DIRS[Math.floor(Math.random() * 3)]; a.person.setPose("guard");
            if (Math.random() < 0.45) AUDIO.voice(Math.random() < 0.5 ? "grunt" : "war", { at: a.pos, vol: 0.8 });
          }
        } else if (r.stepT <= 0) {
          // between blows: circling, looking for the opening
          r.stepT = 0.7 + Math.random() * 0.9;
          if (Math.random() < 0.7) a.circleAbout(fp, 1.6, 1.3); else a.path = [];
        }
        continue;
      }
      const st = t.stackAt, e = this.roadEnd;
      // a wall in the way: no headway toward where he's going, and a length of it close by — he hacks through
      if (r.state === "breach") {
        const b = r.wall && r.wall.b;
        if (!b || b.broken || (b.type === "gate" && b.open)) { r.state = r.loot ? "flee" : "come"; r.wall = null; r.best = Infinity; a.path = []; continue; }
        const d = Math.hypot(a.pos.x - r.wall.x, a.pos.z - r.wall.z);
        if (d > 1.3) { if (!a.path.length) a.walkTo(r.wall.x + (a.pos.x - r.wall.x) / (d || 1) * 0.9, r.wall.z + (a.pos.z - r.wall.z) / (d || 1) * 0.9, WALL_SPEED); }
        else if (r.cool <= 0) {
          a.path = []; a.faceTo(r.wall.x, r.wall.z); r.cool = 1.2; a.person.setPose("chop");
          setTimeout(() => { if (r.alive) a.person.setPose("idle"); }, 400);
          t.hitWall(b, THEIRS[r.arm].dmg);
          if (Math.random() < 0.3) AUDIO.voice("grunt", { at: a.pos, vol: 0.7 });
        }
        continue;
      }
      if (r.state === "come" || r.state === "flee") {
        const gx = r.state === "come" ? st.x : e.x, gz = r.state === "come" ? st.z : e.z, dg = Math.hypot(a.pos.x - gx, a.pos.z - gz);
        if (dg < (r.best ?? Infinity) - 0.4) { r.best = dg; r.stuckT = 0; }
        else if ((r.stuckT = (r.stuckT || 0) + dt) > 2) {
          r.stuckT = 0; r.best = Infinity;
          const wl = t.wallNear && t.wallNear(a.pos, 4.5);
          if (wl) { r.state = "breach"; r.wall = wl; a.path = []; if (!this.breachTold) { this.breachTold = true; UI.bark(G.who === "sister" ? "Brother" : "Sister", "They're at the wall — they're hacking through it!", 3); } continue; }
        }
      }
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
    // round the crosshair: your side; his blow coming (the nearest winding up at you); the guard of the one in front of you
    if (act && pl.axe) {
      let threat = null, td = 99, foe = null, fd = 4;
      const f = pl.forward();
      for (const r of this.band) {
        if (!r.alive) continue;
        const dx = r.pos.x - pl.pos.x, dz = r.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
        if (r.wind > 0 && (r.duel === pl || d < 2.6) && d < td) { td = r.duel === pl ? 0 : d; threat = r.dir; }
        if (d < fd && (dx * f.x + dz * f.z) / (d || 1) > 0.5) { fd = d; foe = r.guardDir; }
      }
      UI.stance({ mine: pl.stance || "right", threat, foe });
    } else UI.stance(null);
    // the noise of it: yells, the settlers shouting and screaming, someone always crying out somewhere
    if (act && (this.din = (this.din ?? 1) - dt) <= 0) {
      this.din = 0.45 + Math.random() * 1.1;
      const alive = this.band.filter(r => r.alive), folk = t.actors.filter(s => !s.gone && s.root.visible !== false);
      if (alive.length && Math.random() < 0.45) { const r = alive[Math.floor(Math.random() * alive.length)]; AUDIO.voice(Math.random() < 0.75 ? "war" : "grunt", { at: r.pos, vol: 0.9 }); }
      else if (folk.length) {
        const s = folk[Math.floor(Math.random() * folk.length)], high = this.highVoice(s);
        AUDIO.voice(s.settler && s.settler.child ? "fear" : s.fighting ? (Math.random() < 0.6 ? "war" : "grunt") : (high && Math.random() < 0.7 ? "fear" : "war"), { at: s.pos, high, vol: 0.85 });
      }
    }
    if (this.wasActive && !act && this.enemy && this.band.length && this.band.every(r => r.state === "down" || r.state === "gone") && this.band.filter(r => r.state === "down").length >= this.band.length / 2) {
      const E = S.europe, id = this.enemy;
      E.beaten[id] = (E.beaten[id] || 0) + 1;
      S.crownsBeaten = (S.crownsBeaten || 0) + 1;
      if (E.beaten[id] >= 2) { const pay = 10 + strengthOf(E, id) * 5; S.coin = (S.coin || 0) + pay; t.makePeace(id, `Beaten at your gate twice, it sues for peace — and pays ${pay} DM`); }
    }
    if (this.wasActive && !act) {
      const sib = G.who === "sister" ? "Brother" : "Sister";
      UI.bark(sib, this.band.some(r => r.state === "down") ? "They're done. Nobody takes from us twice." : "Gone. We'll be readier next time.", 3.5);
    }
    this.wasActive = act;
  }
}
