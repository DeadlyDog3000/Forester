// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The pond at the edge of the deer ride: still brown-green water holding the sky,
// stirred by the wind and pocked by the rain, a fringe of rushes round it, lily
// pads, and a pair of ducks paddling about that make off when you come close.
// It freezes over in winter.

import { THREE, clamp } from "./core.js";
import { G, vm } from "./engine.js";
import { UI } from "./ui.js";
import { ITEM } from "./body.js";
import { AUDIO } from "./audio.js";
import { POND, pondR, pondK } from "./woods.js";
import { addSway, swayGeo } from "./models.js";
import { WaterMat } from "./water.js";
import { FOLEY } from "./foley.js";

// (a rod of your own: the pond is fished with nothing else)
const hasRod = () => !!(G.body && G.body.tools && G.body.tools.rod > 0);

export class Pond {
  constructor(w) {
    this.w = w; this.t = 0;
    const L = w.pondLevel, g = new THREE.Group();
    // ---- the water: the shore's shape, a little past it, so the bank always comes down into it ----
    const N = 64, pos = [0, 0, 0], idx = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, r = pondR(a) * 1.12; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); idx.push(0, 1 + ((i + 1) % N), 1 + i); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    this.wm = new WaterMat(); this.mat = this.wm.mat; this.uni = this.wm.uni;
    this.water = new THREE.Mesh(geo, this.mat);
    this.water.position.set(POND.x, L, POND.z); this.water.receiveShadow = false;
    g.add(this.water);
    // ---- rushes round the margin, standing in the shallows and up the bank ----
    const rush = rushGeo(), RN = 140, rm = new THREE.InstancedMesh(swayGeo(rush, RN), addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), RN);
    const d = new THREE.Object3D(), c = new THREE.Color(), sw = rm.geometry.attributes.aSway.array;
    let n = 0;
    for (let i = 0; n < RN && i < RN * 3; i++) {
      const a = Math.random() * Math.PI * 2, k = 0.86 + Math.random() * 0.24;
      // (in clumps: a few gaps round the shore where the deer come down)
      if (Math.sin(a * 3 + 0.7) > 0.75) continue;
      const r = pondR(a) * k, x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r, y = Math.max(w.heightAt(x, z), L - 0.3);
      const s = 0.8 + Math.random() * 0.6;
      d.position.set(x, y, z); d.rotation.set(0, Math.random() * 6.28, 0); d.scale.set(s, s * (0.8 + Math.random() * 0.5), s); d.updateMatrix();
      rm.setMatrixAt(n, d.matrix); rm.setColorAt(n, c.setScalar(0.85 + Math.random() * 0.3));
      sw[n * 3] = y; sw[n * 3 + 1] = 1.4 * s; sw[n * 3 + 2] = a * 3.1;
      n++;
    }
    rm.count = n; rm.receiveShadow = true; rm.castShadow = false;
    g.add(rm); this.rushes = rm;
    // ---- lily pads: flat round leaves with a notch, lying on the water, and a few white flowers ----
    const pad = new THREE.CircleGeometry(0.28, 12, 0.25, Math.PI * 2 - 0.5); pad.rotateX(-Math.PI / 2);
    const PN = 26, pm = new THREE.InstancedMesh(pad, new THREE.MeshStandardMaterial({ color: 0x3e6a2a, roughness: 0.55, side: THREE.DoubleSide }), PN);
    this.pads = [];
    for (let i = 0; i < PN; i++) {
      let x, z, tries = 0;
      do { const a = Math.random() * Math.PI * 2, r = pondR(a) * (0.35 + Math.random() * 0.5); x = POND.x + Math.cos(a) * r; z = POND.z + Math.sin(a) * r; } while (tries++ < 10 && this.pads.some(p => Math.hypot(p.x - x, p.z - z) < 0.6));
      const s = 0.6 + Math.random() * 0.7, ry = Math.random() * 6.28;
      this.pads.push({ x, z, s, ry, ph: Math.random() * 6.28 });
      d.position.set(x, L + 0.01, z); d.rotation.set(0, ry, 0); d.scale.setScalar(s); d.updateMatrix(); pm.setMatrixAt(i, d.matrix);
    }
    pm.receiveShadow = true; g.add(pm); this.padMesh = pm;
    const fl = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const p = this.pads[i * 4]; if (!p) break;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.07, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6, side: THREE.DoubleSide }));
      f.rotation.x = Math.PI; f.position.set(p.x + 0.05, L + 0.05, p.z); fl.add(f);
      const y = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshStandardMaterial({ color: 0xe8c040 })); y.position.set(p.x + 0.05, L + 0.06, p.z); fl.add(y);
    }
    g.add(fl); this.flowers = fl;
    // ---- a pair of mallards ----
    this.ducks = [makeDuck(true), makeDuck(false)].map((m, i) => { g.add(m); const a = i * 2 + 1; return { m, x: POND.x + Math.cos(a) * 3, z: POND.z + Math.sin(a) * 3, yaw: a, sp: 0, t: Math.random() * 5, flee: 0 }; });
    w.root.add(g); this.g = g;
    // ---- fishing: a float out on the water off the shore nearest you; hold F, watch it, and wait for it to go under ----
    const fl2 = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8301e, roughness: 0.5 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.5 }));
    const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0xe8e0c8 })); quill.position.y = 0.05;
    fl2.add(top, bot, quill); fl2.visible = false; g.add(fl2); this.float = fl2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 16), new THREE.MeshBasicMaterial({ color: 0xc0c8d0, transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; g.add(ring); this.ring = ring;
    // ripples: rings spreading on the water behind a paddling duck, round your legs as you wade, where a fish rises
    const RN2 = 28, rgeo = new THREE.RingGeometry(0.85, 1, 20); rgeo.rotateX(-Math.PI / 2);
    this.rip = new THREE.InstancedMesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xc8d0d8, transparent: true, opacity: 0.32, depthWrite: false }), RN2);
    this.rip.frustumCulled = false; this.ripT = new Float32Array(RN2).fill(1); this.ripP = new Float32Array(RN2 * 3); this.ripN = 0;
    g.add(this.rip);
    // (on the shore, with a rod and it put away: F takes it out — then a click casts)
    this.fishIt = w.addInteract({ x: POND.x, y: L, z: POND.z, reach: 4.6, local: true,
      label: () => this.frozen ? "The pond is frozen over" : "Take out your rod and fish",
      can: () => !this.frozen && hasRod() && !this.out && G.mode === "play" && !G.player.horse,
      use: () => G.toggleRod(true) });
    this.cast = null;
    // a perch on the line: olive-backed, barred, red-finned
    this.perch = makePerch(); this.perch.visible = false; g.add(this.perch);
    G.toggleRod = on => this.setOut(on);
    // (you can wade the margin, but not out into the middle, where it's over your head)
    const rr = Math.min(...Array.from({ length: 24 }, (_, i) => pondR(i / 24 * Math.PI * 2)));
    this.deep = w.col.addCircle(POND.x, POND.z, rr * 0.62, L + 3);
  }
  // how likely a fish is to take, now: best at dawn and dusk, slow at midday, poorer still at night; a little better in rain
  odds() {
    const t = G.town, f = t ? t.frac : 0.4;
    let k = f < 0.12 || (f > 0.55 && f < 0.72) ? 0.75 : f > 0.74 || f < 0.04 ? 0.3 : 0.45;
    if ((this.w.rainK || 0) > 0.2) k += 0.1;
    if (t && t.season === "autumn") k += 0.05;
    return Math.min(0.9, k);
  }
  // ---- the rod: a long hazel pole of two lengths, the line and the float; in your hands while it's out ----
  rod(on) {
    const pl = G.player;
    if (on && !this.rodG) {
      const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.8 });
      const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.017, 1.3, 6), wood); butt.position.y = 0.65; g.add(butt);
      // (the top length bends: a fish on, and it's pulled down in an arc)
      const tip = new THREE.Group(); tip.position.y = 1.3; g.add(tip);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.011, 1.0, 5), wood); top.position.y = 0.5; tip.add(top);
      const end = new THREE.Object3D(); end.position.y = 1.0; tip.add(end);
      // (your hand round the butt of it, and your sleeve)
      const look = (pl.model && pl.model.colors) || {};
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), new THREE.MeshStandardMaterial({ color: look.skin ?? 0xe8c4a0, roughness: 0.6 })); fist.scale.set(1.1, 1.35, 1); fist.position.set(0, 0.16, 0.012); g.add(fist);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.05, 8), new THREE.MeshStandardMaterial({ color: look.linen ?? 0xe6e0d4, roughness: 0.9 })); cuff.position.set(0.0, 0.08, 0.012); g.add(cuff);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.32, 8), new THREE.MeshStandardMaterial({ color: look.coat ?? 0x2e3a2c, roughness: 0.95 })); sleeve.position.set(0.0, -0.13, 0.012); g.add(sleeve);
      g.position.set(0.22, -0.38, -0.32); g.rotation.set(-1.05, 0.12, -0.1);
      this.rodG = g; this.rodTip = end; this.rodBend = tip;
      const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
      this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xd8d4c8, transparent: true, opacity: 0.7 })); this.line.frustumCulled = false;
    }
    if (!this.rodG) return;
    if (on && !this.rodG.parent) { vm.add(this.rodG); this.g.add(this.line); this.float.visible = true; G.fishing = true; }
    if (!on && this.rodG.parent) { vm.remove(this.rodG); this.g.remove(this.line); this.float.visible = false; this.perch.visible = false; G.fishing = false; }
  }
  // take the rod out (the axe, the bow, whatever's in your hands put by), or put it away
  setOut(on) {
    const pl = G.player; if (!pl || on === !!this.out) return;
    if (on) {
      if (!hasRod() || this.frozen) return;
      if (pl.axe) { pl.giveAxe(false); pl.hasAxe = true; }
      if (pl.bow) pl.showBow(false); if (pl.gun) pl.showGun(false); if (pl.xbow) pl.showXbow(false);
      pl.dropFood && pl.dropFood();
      this.out = true; G.rodOut = true; this.rod(true); this.raise = 0;
      FOLEY.swish(0.2);
      if (!this.toldRod) { this.toldRod = true; UI.keys([["Click", "cast, facing the water"], ["Click", "strike, when the float goes right under"], ["Right-click", "reel in"]], 9); }
    } else {
      this.cast = null; this.out = false; G.rodOut = false; this.rod(false);
    }
  }
  tipWorld(v = new THREE.Vector3()) { if (!this.rodTip) return v.set(0, 0, 0); this.rodTip.getWorldPosition(v); return v; }
  // a cast: out ahead of you over the water, as far as it goes — seven paces, or less if the far bank is nearer
  startCast() {
    const pl = G.player, f = pl.forward();
    if (pondK(pl.pos.x, pl.pos.z) > 1.7) { UI.hint("Go down to the water's edge, and face the pond to cast.", 3); return; }
    let to = null;
    for (let d = 8; d >= 2.5; d -= 0.5) { const x = pl.pos.x + f.x * d, z = pl.pos.z + f.z * d; if (pondK(x, z) < 0.9) { to = { x, z }; break; } }
    if (!to) { UI.hint("Face the water to cast.", 2.5); return; }
    // the bank on the way back in, where a hooked fish is played to
    let sx = to.x, sz = to.z; for (let k = 0; k <= 1; k += 0.05) { const x = to.x + (pl.pos.x - to.x) * k, z = to.z + (pl.pos.z - to.z) * k; if (pondK(x, z) > 0.94) break; sx = x; sz = z; }
    this.cast = { st: "back", t: 0, x: to.x, z: to.z, sx, sz, nib: 1 + Math.random() * 3, wait: (3.5 + Math.random() * 8) * (1.35 - this.odds()), from: null };
    FOLEY.swish(0.4);
  }
  // reel in (nothing on it): the float skims back to you
  reelIn() { const c = this.cast; if (!c || c.st === "reel" || c.st === "land") return; c.st = "reel"; c.t = 0; c.from = this.float.position.clone(); FOLEY.swish(0.25); }
  fishTick(dt) {
    const pl = G.player, input = G.input; if (!pl) return;
    if (this.out && (pl.axe || pl.bow || pl.gun || pl.xbow || G.heldFood || pl.horse || this.frozen || !hasRod())) this.setOut(false);
    if (!this.out || !this.rodG) return;
    const free = G.mode === "play" && !G.lockMove && !UI.dialogOpen && !G.cine;
    const click = free && input.click, rclick = free && input.rclick;
    const L = this.w.pondLevel, c = this.cast, F = this.float, tip = this.tipWorld(), now = this.t;
    let rx = -1.05, rz = -0.1, bend = 0;
    this.raise = Math.min(1, (this.raise || 0) + dt * 4);
    if (!c) {
      if (click) this.startCast();
      // (the float hangs from the tip on a short drop of line, swinging a little)
      F.position.set(tip.x + Math.sin(now * 1.7) * 0.04, tip.y - 0.6, tip.z + Math.cos(now * 1.3) * 0.04); F.rotation.set(0, 0, 0);
    } else {
      c.t += dt;
      if (rclick) this.reelIn();
      if (c.st === "back") {
        // the rod lifted back over your shoulder, and flicked forward
        const k = c.t / 0.28; rx = -1.05 + 1.2 * Math.sin(Math.min(1, k) * Math.PI / 2);
        F.position.set(tip.x, tip.y - 0.5 + k * 0.4, tip.z);
        if (c.t >= 0.28) { c.st = "fly"; c.t = 0; c.from = tip.clone(); FOLEY.swish(0.45); }
      } else if (c.st === "fly") {
        const k = Math.min(1, c.t / 0.55); rx = 0.15 - 1.45 * Math.min(1, c.t / 0.18); bend = Math.max(0, 0.25 - c.t);
        F.position.set(c.from.x + (c.x - c.from.x) * k, c.from.y + (L - c.from.y) * k + Math.sin(k * Math.PI) * 1.6, c.from.z + (c.z - c.from.z) * k);
        if (k >= 1) { c.st = "wait"; c.t = 0; this.ripple(c.x, c.z, 0.7); this.ringT = 1; FOLEY.plop({ x: c.x, z: c.z }, 0.6); }
      } else if (c.st === "wait") {
        rx = -1.2 + Math.sin(now * 0.8) * 0.02;
        let dip = 0;
        // (a nibble now and then: the float dips and comes up again — not yet)
        c.nib -= dt;
        if (c.nib < 0) { dip = 0.03 * Math.sin(Math.min(1, -c.nib / 0.25) * Math.PI); if (c.nib < -0.25) { c.nib = 1.2 + Math.random() * 3.5; } else if (c.nib > -dt * 1.5) { this.ripple(c.x, c.z, 0.3); FOLEY.plop({ x: c.x, z: c.z }, 0.18); } }
        F.position.set(c.x, L + Math.sin(now * 2.1) * 0.006 - dip, c.z);
        if (click) { UI.hint(["Too soon — you jerk the float out of the water, and whatever was nosing at it is off.", "Too soon. Wait till it goes right under."][Math.floor(Math.random() * 2)], 3); this.reelIn(); }
        else if (c.t > c.wait) { c.st = "bite"; c.t = 0; this.ripple(c.x, c.z, 0.9); this.ringT = 1; FOLEY.plop({ x: c.x, z: c.z }, 0.45); }
      } else if (c.st === "bite") {
        // pulled right under: now
        rx = -1.22; bend = 0.08;
        F.position.set(c.x + Math.sin(now * 20) * 0.03, L - 0.09, c.z);
        if (click) { c.st = Math.random() < 0.08 ? "lost" : "hook"; c.t = 0; FOLEY.splash({ x: c.x, z: c.z }, 0.6); this.ripple(c.x, c.z, 1.1); }
        else if (c.t > 0.95) { UI.hint(["Too slow — it's off, and the bait with it.", "The float bobs up again. Gone. Strike the moment it goes under."][Math.floor(Math.random() * 2)], 3); this.reelIn(); }
      } else if (c.st === "lost") {
        rx = -0.7; bend = 0.4 * Math.max(0, 1 - c.t * 2);
        F.position.set(c.x, L + 0.02, c.z);
        if (c.t > 0.5) { UI.hint("It throws the hook, and it's gone.", 2.5); this.reelIn(); }
      } else if (c.st === "hook") {
        // played in to the bank: the rod bent and dancing, the fish thrashing on the top of the water
        const k = Math.min(1, c.t / 1.8), side = Math.sin(c.t * 9) * 0.45 * (1 - k);
        const fx = c.x + (c.sx - c.x) * k, fz = c.z + (c.sz - c.z) * k, dx = c.sx - c.x, dz = c.sz - c.z, l = Math.hypot(dx, dz) || 1;
        const px = fx - dz / l * side, pz = fz + dx / l * side;
        rx = -0.55 + Math.sin(c.t * 7) * 0.08; rz = -0.1 + Math.sin(c.t * 5.3) * 0.12; bend = 0.55 + Math.sin(c.t * 13) * 0.12;
        this.perch.visible = true; this.perch.position.set(px, L + 0.03 + Math.abs(Math.sin(c.t * 14)) * 0.07, pz);
        this.perch.rotation.set(0, Math.atan2(dx, dz) + Math.sin(c.t * 18) * 0.6, Math.sin(c.t * 11) * 0.5);
        F.position.set(px, L + 0.05, pz);
        if ((c.splash = (c.splash || 0) - dt) <= 0) { c.splash = 0.22 + Math.random() * 0.2; this.ripple(px, pz, 0.5); if (Math.random() < 0.6) FOLEY.splash({ x: px, z: pz }, 0.35); }
        if (k >= 1) { c.st = "land"; c.t = 0; c.from = this.perch.position.clone(); FOLEY.splash({ x: px, z: pz }, 0.5); }
      } else if (c.st === "land") {
        // lifted out, swinging in on the line, flapping
        const k = Math.min(1, c.t / 0.75), to = tip.clone().add(new THREE.Vector3(0, -0.55, 0));
        rx = -0.35; bend = 0.3;
        const p = c.from.clone().lerp(to, k); p.y += Math.sin(k * Math.PI) * 0.6;
        this.perch.position.copy(p); this.perch.rotation.set(Math.PI / 2 - 0.2, now * 2, Math.sin(now * 28) * 0.7);
        F.position.copy(p).add(new THREE.Vector3(0, 0.35, 0));
        if (k >= 1) this.landed();
      } else if (c.st === "reel") {
        const k = Math.min(1, c.t / 0.5), to = tip.clone().add(new THREE.Vector3(0, -0.6, 0));
        rx = -1.05 + 0.4 * Math.sin(k * Math.PI);
        F.position.copy(c.from).lerp(to, k); F.position.y += Math.sin(k * Math.PI) * 0.4;
        if (k >= 1) { this.cast = null; this.perch.visible = false; }
      }
      // (walked off with it out: reeled in)
      if (this.cast && Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z) > 16 && c.st !== "reel") this.reelIn();
    }
    // the rod in your hands, and the line from its tip, sagging a little, to the float (or the fish)
    const R = this.rodG, up = 1 - this.raise;
    R.rotation.x += (rx - R.rotation.x) * Math.min(1, dt * 14); R.rotation.z += (rz - R.rotation.z) * Math.min(1, dt * 10);
    R.position.y = -0.38 - up * 0.4;
    this.rodBend.rotation.x += (-bend - this.rodBend.rotation.x) * Math.min(1, dt * 12);
    const a2 = this.line.geometry.attributes.position, t2 = this.tipWorld(), fp = this.perch.visible && this.cast && (this.cast.st === "hook" || this.cast.st === "land") ? this.perch.position : F.position;
    this.g.worldToLocal(t2);
    const mx = (t2.x + fp.x) / 2, mz = (t2.z + fp.z) / 2, my = (t2.y + fp.y + 0.09) / 2 - (this.cast && this.cast.st === "wait" ? 0.25 : 0.04);
    a2.setXYZ(0, t2.x, t2.y, t2.z); a2.setXYZ(1, mx, my, mz); a2.setXYZ(2, fp.x, fp.y + 0.09, fp.z); a2.needsUpdate = true;
  }
  landed() {
    this.perch.visible = false; this.cast = null;
    const kind = Math.random();
    if (G.packAdd("fish", 1, ITEM.fish.name, ITEM.fish.note) > 0) {
      UI.hint(kind < 0.3 ? "A perch — striped, and fighting all the way in. Into the pack with it." : kind < 0.6 ? "A good perch, as long as your hand. Into the pack." : kind < 0.85 ? "A little one. It'll fry." : "A fat one! That's supper.", 3);
      FOLEY.packIn(0.4);
    } else UI.hint("A perch — but your pack's full, so back it goes.", 3);
    G.town && G.town.persist();
  }
  ripple(x, z, size = 1) {
    const i = this.ripN; this.ripN = (i + 1) % this.ripT.length;
    this.ripT[i] = 0; this.ripP[i * 3] = x; this.ripP[i * 3 + 1] = size; this.ripP[i * 3 + 2] = z;
  }
  // is x, z in the water, and how deep
  depthAt(x, z) { return pondK(x, z) < 1 ? Math.max(0, this.w.pondLevel - this.w.heightAt(x, z)) : 0; }
  update(dt) {
    this.t += dt;
    // the fishing spot: out on the water, off the bit of shore nearest you
    const pp = G.player && G.player.pos;
    // (the first time you come to it, the guide's page on it)
    if (pp && !this.told && Math.hypot(pp.x - POND.x, pp.z - POND.z) < POND.r + 9 && G.mode === "play") { this.told = true; G.guide && G.guide("pond"); }
    // the first time you come down to the water without a rod, one is put in your hands, and you're told how
    if (pp && G.body && G.body.tools && !(G.body.tools.rod > 0) && !this.gave && Math.hypot(pp.x - POND.x, pp.z - POND.z) < POND.r + 14 && G.mode === "play" && !G.cine && !UI.dialogOpen) {
      this.gave = true; G.body.tools.rod = 1; G.body.dirty = true;
      const sib = G.who === "sister" ? "Brother" : "Sister";
      const line = "Here — I cut you a rod from the hazel, and twisted a line. Take it out with its number and click to cast. When the float goes right under — not just dips, right under — click, quick!";
      if (G.mp || !UI.bark) UI.hint("A fishing rod for the pond. Take it out with its number, click to cast, and click again the moment the float goes right under.", 7);
      else UI.bark(sib, line, 7);
      FOLEY.packIn(0.35);
    }
    if (pp && this.fishIt) {
      const a = Math.atan2(pp.z - POND.z, pp.x - POND.x), r = pondR(a) * 0.82;
      this.fishIt.x = POND.x + Math.cos(a) * r; this.fishIt.z = POND.z + Math.sin(a) * r; this.fishIt.y = this.w.pondLevel + 0.1;
    }
    this.fishTick(dt);
    // the ripples spreading and fading; and new ones where something moves through the water
    { const M = this._m || (this._m = new THREE.Matrix4()), L0 = this.w.pondLevel + 0.012;
      for (let i = 0; i < this.ripT.length; i++) {
        if (this.ripT[i] >= 1) { M.makeScale(0, 0, 0); this.rip.setMatrixAt(i, M); continue; }
        this.ripT[i] = Math.min(1, this.ripT[i] + dt / 1.8);
        const k = this.ripT[i], r = (0.1 + k * 0.9) * this.ripP[i * 3 + 1];
        M.makeScale(r, 1, r).setPosition(this.ripP[i * 3], L0, this.ripP[i * 3 + 2]);
        if (k > 0.6) M.scale(new THREE.Vector3(1 + (k - 0.6), 1, 1 + (k - 0.6)));
        this.rip.setMatrixAt(i, M);
      }
      this.rip.instanceMatrix.needsUpdate = true;
      this.rip.material.opacity = 0.2;
      // (wading: rings round your legs as you go)
      const pl = G.player;
      if (pl && pl.wading > 0.05 && pl.speed > 0.4 && (this.wadeT = (this.wadeT || 0) - dt) <= 0) { this.wadeT = 0.35; this.ripple(pl.pos.x, pl.pos.z, 0.8); }
    }
    if (this.ringT > 0) { this.ringT -= dt * 1.2; const k = 1 - this.ringT; this.ring.position.set(this.float.position.x, this.w.pondLevel + 0.01, this.float.position.z); this.ring.scale.setScalar(0.05 + k * 0.5); this.ring.material.opacity = 0.4 * this.ringT; } else this.ring.material.opacity = 0;
    const w = this.w, town = G.town;
    const ice = town && town.winter && (w.snowK || 0) > 0.5;
    this.frozen = !!ice; this.rip.visible = !ice;
    // (frozen, you may walk out over it; thawed, the middle is too deep again)
    if (this.deep) this.deep.disabled = !!ice;
    // (the rushes die back: straw-coloured in autumn, brown and broken-looking in winter)
    if (town && this.rushes && this._rushSeason !== town.season) {
      this._rushSeason = town.season;
      this.rushes.material.color.set(town.season === "winter" ? 0xb08a60 : town.season === "autumn" ? 0xd8c890 : 0xffffff);
    }
    this.wm.update(dt, { rain: w.rainK || 0, ice });
    // (frogs at dusk and into the night, spring and summer; and the ducks talking now and then, by day)
    const ft = town ? town.frac : 0.4, warm = town && (town.season === "spring" || town.season === "summer");
    if (pp && Math.hypot(pp.x - POND.x, pp.z - POND.z) < 55) {
      if (!ice && warm && (ft > 0.55 || ft < 0.05) && (w.rainK || 0) < 0.6 && Math.random() < dt / 2.5) { const a = Math.random() * 6.283, r = pondR(a) * 0.95; AUDIO.frog && AUDIO.frog({ x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r }); }
      if (!ice && ft > 0.06 && ft < 0.7 && Math.random() < dt / 9) { const dk = this.ducks[Math.floor(Math.random() * 2)]; if (dk.m.visible) AUDIO.quack && AUDIO.quack({ x: dk.x, z: dk.z }); }
    }
    // (a fish rising, out in the middle, now and then — more at dusk)
    if (!ice && Math.random() < dt * (this.odds() * 0.12)) { const a = Math.random() * 6.283, r = pondR(a) * Math.random() * 0.7; this.ripple(POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r, 0.6); }
    this.padMesh.visible = this.flowers.visible = !ice;
    if (town) this.flowers.visible = !ice && (town.season === "summer");
    // ---- the ducks: paddling about, dabbling now and then, and off to the far side if you come near ----
    const p = G.player && G.player.pos, L = w.pondLevel;
    for (const [i, dk] of this.ducks.entries()) {
      dk.m.visible = !ice && !(town && town.isNight && town.isNight());
      if (!dk.m.visible) continue;
      dk.t -= dt;
      const pd = p ? Math.hypot(p.x - dk.x, p.z - dk.z) : 99;
      if (pd < 7) { dk.flee = 3; const a = Math.atan2(dk.z - p.z, dk.x - p.x); dk.want = { x: POND.x + Math.cos(a) * pondR(a) * 0.7, z: POND.z + Math.sin(a) * pondR(a) * 0.7 }; dk.t = 4; }
      if (dk.t <= 0 || !dk.want) {
        // (the drake keeps near the duck)
        const other = this.ducks[1 - i], a = Math.random() * Math.PI * 2, r = pondR(a) * Math.random() * 0.7;
        dk.want = i === 0 && Math.random() < 0.6 ? { x: other.x + Math.cos(a) * 1.2, z: other.z + Math.sin(a) * 1.2 } : { x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r };
        dk.t = 5 + Math.random() * 8; dk.dabble = Math.random() < 0.4 ? 2 : 0;
      }
      dk.flee = Math.max(0, dk.flee - dt);
      const dx = dk.want.x - dk.x, dz = dk.want.z - dk.z, dd = Math.hypot(dx, dz);
      const want = dd > 0.3 ? (dk.flee ? 1.1 : 0.35) : 0;
      dk.sp += (want - dk.sp) * Math.min(1, dt * 1.5);
      if (dd > 0.05) { const ty = Math.atan2(dx, dz); let dy = ty - dk.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); dk.yaw += clamp(dy, -2 * dt, 2 * dt); }
      const nx = dk.x + Math.sin(dk.yaw) * dk.sp * dt, nz = dk.z + Math.cos(dk.yaw) * dk.sp * dt;
      if (pondK(nx, nz) < 0.85) { dk.x = nx; dk.z = nz; } else dk.t = 0;
      // (dabbling: tail up, head under, for a moment)
      if (dk.dabble > 0 && dk.sp < 0.1) dk.dabble -= dt;
      const up = dk.dabble > 0 && dk.sp < 0.1 && Math.sin(dk.dabble * 2.5) > 0;
      dk.m.position.set(dk.x, L + 0.02 + Math.sin(this.t * 2 + i) * 0.008, dk.z);
      // (a wake behind a duck that's going somewhere; a ring where one dabbles)
      if ((dk.sp > 0.15 || (up && Math.random() < dt * 2)) && (dk.wakeT = (dk.wakeT || 0) - dt) <= 0) { dk.wakeT = dk.flee ? 0.25 : 0.6; this.ripple(dk.x - Math.sin(dk.yaw) * 0.15, dk.z - Math.cos(dk.yaw) * 0.15, 0.5 + dk.sp * 0.4); }
      dk.m.rotation.set(up ? 1.1 : Math.sin(this.t * 1.7 + i) * 0.04, dk.yaw, 0);
    }
  }
}
// a rush clump: stiff dark green blades, the tallest with a brown seed head
export function rushGeo() {
  const P = [], C = [], I = [];
  for (let b = 0; b < 9; b++) {
    const a = b / 9 * Math.PI * 2 + b, lean = 0.04 + (b % 3) * 0.05, h = 0.8 + (b % 4) * 0.25, dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.012, pz = dx * 0.012, i0 = P.length / 3;
    P.push(-px, 0, -pz, px, 0, pz, dx * lean, h, dz * lean);
    C.push(0.07, 0.12, 0.04, 0.07, 0.12, 0.04, 0.17, 0.24, 0.08);
    I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 1);
    if (b % 3 === 0) {
      const j0 = P.length / 3, hx = dx * lean, hz = dz * lean;
      P.push(hx - 0.025, h - 0.15, hz, hx + 0.025, h - 0.15, hz, hx, h + 0.02, hz, hx, h - 0.15, hz + 0.025);
      for (let k = 0; k < 4; k++) C.push(0.16, 0.08, 0.035);
      I.push(j0, j0 + 1, j0 + 2, j0 + 1, j0 + 3, j0 + 2, j0 + 3, j0, j0 + 2, j0, j0 + 2, j0 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I); g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
// a mallard on the water: the drake with his green head and white collar, the duck all mottled brown
function makeDuck(drake) {
  const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M(drake ? 0x8a8478 : 0x7a5e40)); body.scale.set(0.8, 0.55, 1.25); body.position.y = 0.04; g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), M(drake ? 0x2a2a2a : 0x6a5038)); tail.rotation.x = -1.9; tail.position.set(0, 0.08, -0.2); g.add(tail);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 6), M(drake ? 0x1e5a32 : 0x7a5e40)); neck.position.set(0, 0.14, 0.12); neck.rotation.x = 0.3; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M(drake ? 0x1a5a2e : 0x6e5438)); head.scale.set(0.85, 0.9, 1.15); head.position.set(0, 0.21, 0.15); g.add(head);
  const bill = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.07), M(drake ? 0xd8c040 : 0xc87a30)); bill.position.set(0, 0.2, 0.22); g.add(bill);
  if (drake) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), M(0xf0f0f0)); ring.rotation.x = Math.PI / 2 - 0.3; ring.position.set(0, 0.105, 0.105); g.add(ring); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// a perch: an olive back with dark bars down its sides, a pale belly, and red fins
function makePerch() {
  const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), M(0x7a8a3a)); body.scale.set(0.45, 0.75, 1.5); g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M(0xe8dcb0)); belly.scale.set(0.47, 0.75, 1.45); g.add(belly);
  for (const z of [-0.06, 0, 0.06]) { const bar = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.009, 4, 10, Math.PI), M(0x2e3418)); bar.rotation.set(0, Math.PI / 2, Math.PI / 2); bar.scale.set(1, 0.7, 1); bar.position.z = z; g.add(bar); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.09, 4), M(0xb04a2a)); tail.rotation.x = Math.PI / 2; tail.scale.set(0.25, 1, 1); tail.position.z = -0.17; g.add(tail);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 3), M(0x4a5222)); fin.position.set(0, 0.08, 0.01); fin.scale.set(0.2, 1, 1.4); g.add(fin);
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), M(0xd8b030)); eye.position.set(sx * 0.035, 0.02, 0.11); g.add(eye); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
