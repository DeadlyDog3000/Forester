// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Hunting: roe deer and hares in the woods, and arrows that fly as arrows do —
// they drop, they stick where they land, and you go and pull them out again.
//
// An animal grazes, lifts its head, walks a little way and grazes again. It
// hears you before it sees you: a runner a long way off, a walker at a stone's
// throw, a crouching hunter only close to. Startled, it bolts away from you and
// does not stop for a while. One good arrow brings a hare down; a deer wants a
// well-drawn one, or two.

import { THREE, clamp } from "./core.js";
import { G } from "./engine.js";
import { modelCopy } from "./models.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { CLEARING } from "./woods.js";

/* global SFX */

const KINDS = {
  deer: { name: "roe deer", r: 0.34, h: 0.8, len: 0.42, walk: 0.9, run: 8.5, hp: 2, meat: 3, hearRun: 30, hearWalk: 15, hearCreep: 5.5, stride: 1.6, meatKind: "venison" },
  hare: { name: "hare", r: 0.16, h: 0.2, len: 0.12, walk: 0.6, run: 7.5, hp: 1, meat: 1, hearRun: 22, hearWalk: 10, hearCreep: 3.5, stride: 0.7, meatKind: "hare" },
  // a boar: heavy, slow to frighten, hard to bring down — and, wounded, it comes for you
  boar: { name: "wild boar", r: 0.42, h: 0.55, len: 0.5, walk: 0.7, run: 6.8, hp: 4, meat: 3, hearRun: 22, hearWalk: 10, hearCreep: 3.5, stride: 1.2, meatKind: "boar" },
};
const GRAVITY = 9.8;

class Animal {
  constructor(hunt, kind, x, z) {
    this.hunt = hunt; this.kind = kind; this.K = KINDS[kind];
    const m = modelCopy(kind);
    this.root = new THREE.Group(); this.root.rotation.order = "YXZ";
    if (m) this.root.add(m.scene);
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(this.K.r * 1.2, this.K.r * 1.4, this.K.len * 2.4), new THREE.MeshStandardMaterial({ color: 0x8a5a3a })); b.position.y = this.K.h; this.root.add(b); }
    const find = n => this.root.getObjectByName(n);
    this.legs = ["legFL", "legFR", "legHL", "legHR"].map(find);
    this.neck = find("neck");
    this.neck0 = this.neck ? this.neck.rotation.x : 0;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.state = "graze"; this.t = 1 + Math.random() * 4;
    this.speed = 0; this.phase = Math.random() * 6; this.head = 1; this.hp = this.K.hp;
    this.target = null; this.fear = 0; this.fall = 0;
    hunt.w.root.add(this.root);
    this.sync();
  }
  get alive() { return this.state !== "dead"; }
  centre() { return new THREE.Vector3(this.pos.x, this.pos.y + this.K.h, this.pos.z); }
  sync() {
    const w = this.hunt.w;
    this.pos.y = w.heightAt(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
  // an arrow in it: power is how far the bow was drawn
  hit(power) {
    if (!this.alive) return;
    this.hp -= power > 0.7 ? 2 : 1;
    G.practise && G.practise("archery", 3);
    if (this.hp <= 0) { this.state = "dead"; this.slide = Math.min(6, this.speed || 0); this.fall = 0; this.speed = 0; this.hunt.onDown(this); SFX.treeFall && SFX.treeFall(0.3); return; }
    // a wounded boar turns on whoever did it, if they are near enough to reach
    const pl = G.player;
    if (this.kind === "boar" && pl && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 14) {
      this.state = "charge"; this.t = 5; this.gore = 0; this.fear = 1;
      AUDIO.voice && AUDIO.voice("grunt", { at: this.pos, vol: 1.3 });
      return;
    }
    this.startle(G.player.pos, 1.5);
  }
  startle(from, k = 1) {
    if (!this.alive) return;
    // away from what frightened it, and a little to one side
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
    const a = Math.atan2(dx / l, dz / l) + (Math.random() - 0.5) * 0.8;
    this.target = { x: this.pos.x + Math.sin(a) * 40, z: this.pos.z + Math.cos(a) * 40 };
    this.state = "flee"; this.t = 5 + Math.random() * 3 * k; this.fear = 1;
    // the others see it go
    for (const o of this.hunt.animals) if (o !== this && o.alive && o.state !== "flee" && o.state !== "charge" && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 14) o.startle(from, 0.8);
  }
  update(dt) {
    const K = this.K, pl = G.player, home = this.ownHome || this.hunt.home;
    if (this.state === "dead") {
      // it carries on a stride or two with what speed it had, stumbles, goes down on its side, and the legs kick
      this.slide ??= 0;
      this.slide = Math.max(0, this.slide - dt * 9);
      if (this.slide > 0.05) { this.pos.x += Math.sin(this.yaw) * this.slide * dt; this.pos.z += Math.cos(this.yaw) * this.slide * dt; this.pos.y = this.hunt.w.heightAt(this.pos.x, this.pos.z); this.root.position.x = this.pos.x; this.root.position.z = this.pos.z; }
      this.fall = Math.min(1, this.fall + dt * (this.slide > 0.5 ? 1.2 : 2.2));
      const e = this.fall * this.fall * (3 - 2 * this.fall);
      this.root.rotation.z = e * Math.PI / 2; this.root.rotation.x += ((this.slide > 0.5 ? 0.25 : 0) - this.root.rotation.x) * Math.min(1, dt * 6);
      this.root.position.y = this.pos.y + e * K.r * 0.55;
      this.kick = (this.kick || 0) + dt;
      const k = Math.max(0, 1 - this.kick / 2.2);
      this.legs.forEach((l, i) => { if (l) l.rotation.x = Math.sin(this.kick * 16 + i * 1.7) * 0.5 * k * k; });
      if (this.neck) this.neck.rotation.x += (this.neck0 - 0.3 - this.neck.rotation.x) * Math.min(1, dt * 3);
      return;
    }
    // what it hears of you
    const d = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    const loud = pl.speed > 4 ? K.hearRun : pl.speed > 0.4 ? (pl.crouched ? K.hearCreep : K.hearWalk) : 2.2;
    if (d < loud && this.state !== "flee" && this.state !== "charge") this.startle(pl.pos);
    // people: whatever the herd, it keeps off the settlements' ground — and one living out in the woods keeps well clear of it
    if (this.state !== "flee" && this.state !== "charge" && (this.koT = (this.koT || 0) - dt) <= 0) {
      this.koT = 0.6;
      const away = this.hunt.keepOut(this.pos.x, this.pos.z, this.ownHome ? 18 : 2);
      if (away) { this.state = "walk"; this.target = away; this.t = 14; this.looking = 0; }
    }
    this.t -= dt;
    let want = 0;
    if (this.state === "graze") {
      // head down to the grass — and now and then up, ears forward, looking about
      this.lookT = (this.lookT ?? 2 + Math.random() * 5) - dt;
      if (this.lookT < 0) { this.looking = this.looking ? 0 : 1.2 + Math.random() * 1.5; this.lookT = this.looking || 3 + Math.random() * 6; this.lookYaw = (Math.random() - 0.5) * 1.1; }
      this.head += ((this.looking ? 1 : 0) - this.head) * Math.min(1, dt * (this.looking ? 4 : 2));
      if (this.t <= 0) {
        // a few steps to fresh grass, never far from home
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
        let tx = this.pos.x + Math.sin(a) * r, tz = this.pos.z + Math.cos(a) * r;
        if (Math.hypot(tx - home.x, tz - home.z) > home.r) { tx = home.x + (Math.random() - 0.5) * home.r; tz = home.z + (Math.random() - 0.5) * home.r; }
        // (never a step toward where people live)
        if (this.hunt.keepOut(tx, tz, this.ownHome ? 18 : 2)) { tx = this.pos.x - Math.sin(a) * r; tz = this.pos.z - Math.cos(a) * r; }
        this.target = { x: tx, z: tz }; this.state = "walk"; this.t = 12;
      }
    } else if (this.state === "walk") {
      this.head += (1 - this.head) * Math.min(1, dt * 3);
      want = K.walk;
      if (!this.target || this.t <= 0 || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 0.6) { this.state = "graze"; this.t = 3 + Math.random() * 7; }
    } else if (this.state === "charge") {
      // head down, straight at you; a blow from the tusks, and it breaks away
      this.head = 1; want = K.run * 0.95; this.target = { x: pl.pos.x, z: pl.pos.z };
      this.gore -= dt;
      if (d < 1.3 && this.gore <= 0 && !G.downed) {
        G.hurt && G.hurt(pl.guard ? 5 : 15, "boar"); this.gore = 1.8;
        AUDIO.voice && AUDIO.voice("grunt", { at: this.pos, vol: 1.2 });
        if (Math.random() < 0.65) { this.startle(pl.pos, 1); }
      }
      if (this.t <= 0 || d > 30) this.startle(pl.pos, 1);
    } else if (this.state === "flee") {
      this.head = 1;
      want = K.run * (this.t > 1.5 ? 1 : 0.5);
      if (this.t <= 0) { this.state = "walk"; this.t = 6; this.target = { x: home.x + (Math.random() - 0.5) * home.r, z: home.z + (Math.random() - 0.5) * home.r }; }
    }
    this.speed += (want - this.speed) * Math.min(1, dt * (this.state === "flee" || this.state === "charge" ? 4 : 2));
    // a hare goes in hops: it covers its ground in the air and sits a moment between them (less, the faster it goes)
    const hare = this.kind === "hare", runK = clamp((this.speed - K.walk) / (K.run - K.walk), 0, 1);
    let hop = -1, hopK = 1;
    if (hare) {
      const duty = 0.5 + 0.4 * runK, u = (this.phase / (Math.PI * 2)) % 1;
      if (u < duty) { hop = u / duty; hopK = 1 / duty; } else hopK = 0;
    }
    if (this.target && this.speed > 0.05) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const turn = Math.atan2(dx, dz) - this.yaw;
      this.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * (this.state === "flee" || this.state === "charge" ? 5 : 2));
      this.pos.x += Math.sin(this.yaw) * this.speed * hopK * dt; this.pos.z += Math.cos(this.yaw) * this.speed * hopK * dt;
      // round the trunks, not through them
      const before = this.pos.clone();
      this.hunt.w.col.resolve(this.pos, K.r * 0.8, this.pos.y + 0.2, K.h);
      if (before.distanceTo(this.pos) > 0.001 && this.state !== "flee") this.yaw += dt * 2;
      // a fleeing animal that has run out of woods turns back into them
      if (Math.hypot(this.pos.x - home.x, this.pos.z - home.z) > home.r + 25) this.target = { x: home.x, z: home.z };
    }
    // the legs: a walk moves them in diagonal pairs, a bolt throws the fronts and the hinds together
    this.phase += dt * this.speed / (hare ? 0.45 + runK * 1.5 : K.stride) * Math.PI * 2;
    const run = clamp((this.speed - K.walk) / (K.run - K.walk), 0, 1), amp = clamp(this.speed / K.walk, 0, 1) * (0.45 + run * 0.35);
    const off = run > 0.5 ? [0, 0, Math.PI, Math.PI] : [0, Math.PI, Math.PI, 0];
    if (hare) {
      // the hinds push off together and the fronts reach out ahead; on the ground they gather in under it
      const air = hop >= 0 ? Math.sin(hop * Math.PI) : 0, kick = hop >= 0 ? Math.sin(hop * Math.PI * 2) : 0;
      this.legs.forEach((l, i) => { if (l) l.rotation.x = i < 2 ? -air * 0.9 : kick * 0.8 + air * 0.3; });
    } else this.legs.forEach((l, i) => { if (l) l.rotation.x = Math.sin(this.phase + off[i]) * amp; });
    // the head nods with each step at a walk; while it looks about, it turns
    const nod = Math.sin(this.phase * 2) * 0.07 * clamp(this.speed / K.walk, 0, 1) * (1 - run * 0.6);
    if (this.neck) {
      this.neck.rotation.x = this.neck0 + (1 - this.head) * (this.kind === "deer" ? 1.1 : this.kind === "boar" ? 0.6 : 0.4) + Math.sin(G.time * 3 + this.phase) * 0.03 * (1 - this.head) + nod;
      this.neck.rotation.y += (((this.state === "graze" && this.looking) ? this.lookYaw || 0 : 0) - this.neck.rotation.y) * Math.min(1, dt * 3);
    }
    // a hare bounds; a deer lifts at the gallop
    if (hare) {
      const air = hop >= 0 ? Math.sin(hop * Math.PI) : 0;
      this.root.position.y = this.pos.y + air * (0.07 + runK * 0.28);
      // nose up as it leaves the ground, down as it lands
      this.root.rotation.x += ((hop >= 0 ? -Math.cos(hop * Math.PI) * (0.25 + runK * 0.15) : 0) - this.root.rotation.x) * Math.min(1, dt * 18);
    } else {
      // a gallop rocks the body, nose down and up, as the fore and hind legs take it in turn
      this.root.position.y = this.pos.y + Math.abs(Math.sin(this.phase)) * run * 0.08;
      this.root.rotation.x += (Math.sin(this.phase + 0.6) * 0.09 * run - this.root.rotation.x) * Math.min(1, dt * 12);
      // (the walk nods the head with each step)
      if (this.neck && this.speed > 0.1 && run < 0.5) this.neck.rotation.x += Math.sin(this.phase * 2) * 0.05 * Math.min(1, this.speed / K.walk);
    }
    this.root.position.x = this.pos.x; this.root.position.z = this.pos.z;
    this.root.rotation.y = this.yaw;
    this.pos.y = this.hunt.w.heightAt(this.pos.x, this.pos.z);
  }
}

export class Hunt {
  // home: {x, z, r} — where the herd lives. onDown(animal) when one falls; onDress(animal, meat) when you take the meat.
  constructor(w, home, { onDown, onDress } = {}) {
    this.w = w; this.home = home; this.animals = []; this.arrows = [];
    this._onDown = onDown; this._onDress = onDress;
    G.hunt = this;
    this._tick = dt => this.update(dt);
    G.onFrame.push(this._tick);
  }
  // somewhere in the herd's ground that isn't inside a tree
  spot() {
    const h = this.home;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * h.r;
      const x = h.x + Math.sin(a) * r, z = h.z + Math.cos(a) * r;
      // (never where you would see it appear: well away from you, when there is room)
      const p = G.player && G.player.pos;
      if (p && i < 30 && Math.hypot(p.x - x, p.z - z) < 28) continue;
      if (!this.w.col.solidAt(x, this.w.heightAt(x, z) + 0.5, z, 0.6)) return [x, z];
    }
    return [h.x, h.z];
  }
  // where people live: the settlement's ground, and every settlement out in the forest, with `pad` metres round it.
  // Inside it, a point to make for, out the far side — or null
  keepOut(x, z, pad = 2) {
    const t = G.town; if (!t || !t.onGround) return null;
    const out = (cx, cz, r) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1; return { x: cx + dx / d * (r + pad + 14), z: cz + dz / d * (r + pad + 14) }; };
    for (const c of t.S.colonies || []) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return out(c.x, c.z, c.r);
    if (t.onGround(x, z, -pad * 2)) {
      // (from the old clearing's middle, out past the edge of everything claimed in that direction)
      const C = CLEARING;
      const dx = x - C.x, dz = z - C.z, d = Math.hypot(dx, dz) || 1;
      for (let r = d + 6; r < d + 160; r += 6) { const px = C.x + dx / d * r, pz = C.z + dz / d * r; if (!t.onGround(px, pz, -pad * 2)) return { x: px + dx / d * 10, z: pz + dz / d * 10 }; }
      return out(C.x, C.z, t.clearR || 30);
    }
    return null;
  }
  // The woods, all round you: a few beasts of their own, each with its patch of forest, never near where people live.
  // They come and go as you do — spread out at a distance, gone once you're far from them — so the forest is never empty
  // and never crowded.
  roam(want = { deer: 3, hare: 3, boar: 1 }) {
    const w = this.w;
    let t = 0;
    const wild = () => this.animals.filter(a => a.ownHome);
    const tick = dt => {
      if ((t -= dt) > 0) return; t = 3;
      const p = G.player && G.player.pos; if (!p || G.cine || (w.cave && w.cave.inside)) return;
      // the far ones go, once out of sight and mind
      for (const a of wild()) if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) > 190 && a.alive) { w.root.remove(a.root); this.animals.splice(this.animals.indexOf(a), 1); }
      for (const [k, n] of Object.entries(want)) {
        if (wild().filter(a => a.kind === k && a.alive).length >= n) continue;
        // somewhere out of sight in the trees: well away from you, from people, and from the deer ride
        for (let i = 0; i < 25; i++) {
          const ang = Math.random() * Math.PI * 2, r = 70 + Math.random() * 80, x = p.x + Math.sin(ang) * r, z = p.z + Math.cos(ang) * r;
          if (this.keepOut(x, z, 30) || Math.hypot(x - this.home.x, z - this.home.z) < this.home.r + 15) continue;
          const b = w.bounds; if (b && (x < b.x0 + 8 || x > b.x1 - 8 || z < b.z0 + 8 || z > b.z1 - 8)) continue;
          if (w.col.solidAt(x, w.heightAt(x, z) + 0.5, z, 0.6)) continue;
          const a = new Animal(this, k, x, z); a.ownHome = { x, z, r: k === "hare" ? 18 : 32 }; this.animals.push(a);
          break;
        }
        break;     // (one a beat)
      }
    };
    G.onFrame.push(tick);
    this._roam = tick;
  }
  spawn(kind, n = 1) { for (let i = 0; i < n; i++) { const [x, z] = this.spot(); this.animals.push(new Animal(this, kind, x, z)); } }
  onDown(a) {
    // a fallen beast can be dressed where it lies
    const it = this.w.addInteract({ get x() { return a.pos.x; }, get z() { return a.pos.z; }, get y() { return a.pos.y + 0.4; }, reach: 2.2, hold: 2.2,
      label: `Dress the ${a.K.name}`,
      onHoldTick: (dt, t) => { if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) SFX.pickup && SFX.pickup(); },
      use: () => {
        this.w.removeInteract(it);
        this.w.root.remove(a.root);
        this.animals.splice(this.animals.indexOf(a), 1);
        // the arrows that went into it are spent: snapped off, the heads lost in the meat
        const spent = this.arrows.filter(r => r.in === a);
        for (const ar of spent) this.arrows.splice(this.arrows.indexOf(ar), 1);
        if (spent.length) UI.hint && UI.hint(`The arrow${spent.length > 1 ? "s" : ""} that struck it ${spent.length > 1 ? "are" : "is"} broken — no good again.`, 3);
        this._onDress && this._onDress(a, a.K.meat);
      } });
    this._onDown && this._onDown(a);
  }
  loose(from, dir, power) {
    const m = modelCopy("arrow");
    const mesh = m ? m.scene : new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.74).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb89a6a }));
    this.w.root.add(mesh);
    const ar = { mesh, pos: from.clone(), from: from.clone(), vel: dir.clone().multiplyScalar(14 + 32 * power), power, t: 0, stuck: false };
    this.arrows.push(ar);
    this.orient(ar);
  }
  // a musket ball: no arrow to see, it's there at once — along the line from the muzzle until it meets something: a man
  // (anywhere on him, the head counting double), a beast, a tree or a wall, or the ground. Everything for sixty metres
  // round hears it and takes fright. Returns what it struck.
  shoot(from, dir, power = 2.6, range = 90) {
    const w = this.w, p = from.clone(), step = 0.15;
    let struck = null;
    for (let d = 0; d < range && !struck; d += step) {
      p.addScaledVector(dir, step);
      for (const a of this.animals) {
        if (!a.alive) continue;
        if (a.K.upright) {
          const q = a.pos;
          if (p.y >= q.y + 0.1 && p.y <= q.y + 1.85 && Math.hypot(p.x - q.x, p.z - q.z) < a.K.r) { a.hit(power, p.y > q.y + 1.48); struck = a; break; }
          continue;
        }
        const c = a.centre(), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
        const along = clamp((p.x - c.x) * fx + (p.z - c.z) * fz, -a.K.len, a.K.len);
        if (Math.hypot(p.x - (c.x + fx * along), p.y - c.y, p.z - (c.z + fz * along)) < a.K.r) { a.hit(power); struck = a; break; }
      }
      if (struck) break;
      if (p.y <= w.heightAt(p.x, p.z) || w.col.solidAt(p.x, p.y, p.z, 0)) { struck = "ground"; break; }
    }
    for (const a of this.animals) if (a.alive && a !== struck && a.startle && Math.hypot(a.pos.x - from.x, a.pos.z - from.z) < 60) a.startle(from, 1.4);
    return { struck, at: p };
  }
  orient(ar) { ar.mesh.position.copy(ar.pos); ar.mesh.lookAt(ar.pos.clone().add(ar.vel)); }
  // an arrow has come to rest; it can be pulled out and used again
  stick(ar, into = null) {
    ar.stuck = true; ar.in = into;
    if (into) {
      // carried along with the animal
      into.root.attach(ar.mesh);
      return;
    }
    // a miss that thuds into the ground or a trunk near them: they bolt — away from where it came from, not from
    // where it landed (the nearer it falls, the surer they are)
    for (const a of this.animals) {
      if (!a.alive || a.state === "charge") continue;
      const d = Math.hypot(a.pos.x - ar.pos.x, a.pos.z - ar.pos.z);
      if (d < 14 && (d < 7 || Math.random() < 0.7)) a.startle(ar.from, d < 7 ? 1.3 : 1);
    }
    ar.it = this.w.addInteract({ x: ar.pos.x, y: ar.pos.y, z: ar.pos.z, reach: 2.0, label: "Pull the arrow out",
      use: () => { this.w.removeInteract(ar.it); this.w.root.remove(ar.mesh); this.arrows.splice(this.arrows.indexOf(ar), 1); G.player.arrows = (G.player.arrows || 0) + 1; SFX.pickup && SFX.pickup(); } });
  }
  update(dt) {
    const w = this.w;
    for (const ar of this.arrows) {
      if (ar.stuck) continue;
      // a few small steps a frame, so a fast arrow can't pass through a hare
      const steps = 4, h = Math.min(dt, 0.05) / steps;
      for (let s = 0; s < steps && !ar.stuck; s++) {
        ar.vel.y -= GRAVITY * h;
        ar.pos.addScaledVector(ar.vel, h);
        ar.t += h;
        for (const a of this.animals) {
          if (!a.alive) continue;
          // a man stands upright: his whole height, feet to head, and a shot to the head counts double
          if (a.K.upright) {
            const p = a.pos, y0 = p.y + 0.2, y1 = p.y + 1.78, yy = clamp(ar.pos.y, y0, y1);
            if (ar.pos.y >= y0 - 0.1 && ar.pos.y <= y1 + 0.1 && Math.hypot(ar.pos.x - p.x, ar.pos.z - p.z) < a.K.r) { this.stick(ar, a); a.hit(ar.power, yy > p.y + 1.48); break; }
            continue;
          }
          // the body is a short capsule along the animal's length
          const c = a.centre(), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
          const along = clamp((ar.pos.x - c.x) * fx + (ar.pos.z - c.z) * fz, -a.K.len, a.K.len);
          const px = c.x + fx * along, pz = c.z + fz * along;
          if (Math.hypot(ar.pos.x - px, ar.pos.y - c.y, ar.pos.z - pz) < a.K.r) { this.stick(ar, a); a.hit(ar.power); UI.hint && null; break; }
        }
        if (ar.stuck) break;
        const gy = w.heightAt(ar.pos.x, ar.pos.z);
        if (ar.pos.y <= gy + 0.02) { ar.pos.y = gy + 0.05; this.stick(ar); break; }
        if (w.col.solidAt(ar.pos.x, ar.pos.y, ar.pos.z, 0)) { this.stick(ar); break; }
        if (ar.t > 6) { this.stick(ar); break; }
      }
      if (!ar.stuck || !ar.in) this.orient(ar);
      // (just off the string an arrow flexes and wobbles — the archer's paradox — and straightens as it flies)
      if (!ar.stuck && ar.t < 0.4) { const k = 1 - ar.t / 0.4; ar.mesh.rotateY(Math.sin(ar.t * 62) * 0.07 * k); ar.mesh.rotateX(Math.cos(ar.t * 55) * 0.04 * k); }
    }
    for (const a of this.animals) a.update(dt);
  }
  stop() {
    const i = G.onFrame.indexOf(this._tick); if (i >= 0) G.onFrame.splice(i, 1);
    if (this._roam) { const j = G.onFrame.indexOf(this._roam); if (j >= 0) G.onFrame.splice(j, 1); }
    for (const a of this.animals) this.w.root.remove(a.root);
    for (const ar of this.arrows) { if (ar.it) this.w.removeInteract(ar.it); if (ar.mesh.parent) ar.mesh.parent.remove(ar.mesh); }
    this.animals = []; this.arrows = [];
    if (G.hunt === this) G.hunt = null;
  }
}
