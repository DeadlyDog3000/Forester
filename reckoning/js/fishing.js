// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// FISHING, at any water: the rod in your hands, a cast with a click, the baited hook out in the water, a nibble and then the
// take, a click to strike, the fish played in to the bank and swung in on the line. Whatever water it is gives the
// gear what it needs to know about itself (see fishingGear): the pond in the settlement's woods, a lake or the sea
// shore in Frontier.

import { THREE } from "./core.js";
import { G, vm } from "./engine.js";
import { UI } from "./ui.js";
import { ITEM } from "./body.js";
import { FOLEY } from "./foley.js";

// (a rod of your own: the water is fished with nothing else)
export const hasRod = () => !!(G.body && G.body.tools && G.body.tools.rod > 0);

class Gear {
  // ---- the rod, as an angler of the 1600s had it: a long, slender rod of hazel in four lengths, each whipped to the
  // next with thread, thick at the butt and fine as a switch at the top, a leather grip, no reel — the horsehair line
  // tied fast to the top, and a bare hook with a worm on it. It bends in an arc, all along, when a fish pulls ----
  rod(on) {
    const pl = G.player;
    if (on && !this.rodG) {
      const g = new THREE.Group();
      const hazel = new THREE.MeshStandardMaterial({ color: 0x9a7a4e, roughness: 0.75 }), dark = new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.8 });
      const whip = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 }), leather = new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 0.95 });
      // (the butt: a stout length, the grip of leather bound round it, a cap of horn at its end)
      const LEN = [0.95, 0.85, 0.75, 0.65], R0 = 0.019, R1 = 0.0028;
      let parent = g, at = 0, total = LEN.reduce((x, y) => x + y, 0);
      this.rodBends = [];
      for (let i = 0; i < LEN.length; i++) {
        const seg = new THREE.Group(); seg.position.y = i ? LEN[i - 1] : 0; parent.add(seg);
        const ra = R0 + (R1 - R0) * (at / total), rb = R0 + (R1 - R0) * ((at + LEN[i]) / total);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, LEN[i], 7), i ? hazel : dark); m.position.y = LEN[i] / 2; seg.add(m);
        // (the knots of the hazel along it, a little swollen)
        for (let k = 1; k < 3; k++) { const kn = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), hazel); const rr = ra + (rb - ra) * k / 3; kn.scale.set(rr * 1.25, rr * 0.7, rr * 1.25); kn.position.y = LEN[i] * k / 3; seg.add(kn); }
        // (where this length is whipped to the next: a band of thread)
        if (i < LEN.length - 1) { const w = new THREE.Mesh(new THREE.CylinderGeometry(rb * 1.35, rb * 1.35, 0.07, 7), whip); w.position.y = LEN[i] - 0.02; seg.add(w); }
        if (!i) {
          const grip = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 1.25, R0 * 1.3, 0.34, 8), leather); grip.position.y = 0.2; seg.add(grip);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(R0 * 1.3, 8, 5), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.5 })); cap.position.y = 0.02; seg.add(cap);
        }
        this.rodBends.push(seg); parent = seg; at += LEN[i];
      }
      const end = new THREE.Object3D(); end.position.y = LEN[LEN.length - 1]; parent.add(end);
      // (your hand round the grip, and your sleeve)
      const look = (pl.model && pl.model.colors) || {};
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), new THREE.MeshStandardMaterial({ color: look.skin ?? 0xe8c4a0, roughness: 0.6 })); fist.scale.set(1.1, 1.35, 1); fist.position.set(0, 0.2, 0.012); g.add(fist);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.05, 8), new THREE.MeshStandardMaterial({ color: look.linen ?? 0xe6e0d4, roughness: 0.9 })); cuff.position.set(0.0, 0.12, 0.012); g.add(cuff);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.32, 8), new THREE.MeshStandardMaterial({ color: look.coat ?? 0x2e3a2c, roughness: 0.95 })); sleeve.position.set(0.0, -0.09, 0.012); g.add(sleeve);
      g.position.set(0.22, -0.4, -0.3); g.rotation.set(-1.05, 0.12, -0.1);
      this.rodG = g; this.rodTip = end;
      // the line: a sag of horsehair from the top of the rod to the hook
      const N = 10, lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
      this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xcfc6b0, transparent: true, opacity: 0.75 })); this.line.frustumCulled = false; this.lineN = N;
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
      if (!this.toldRod) { this.toldRod = true; UI.keys([["Click", "cast, facing the water"], ["Click", "strike, when the line is drawn away under"], ["Right-click", "lift the line out"]], 9); }
    } else {
      this.cast = null; this.out = false; G.rodOut = false; this.rod(false);
    }
  }
  tipWorld(v = new THREE.Vector3()) { if (!this.rodTip) return v.set(0, 0, 0); this.rodTip.getWorldPosition(v); return v; }
  // a cast: out ahead of you over the water, as far as it goes — seven paces, or less if the far bank is nearer
  startCast() {
    const pl = G.player, f = pl.forward();
    if (!this.shore(pl.pos)) { UI.hint(this.farText || "Go down to the water's edge, and face the water to cast.", 3); return; }
    let to = null;
    for (let d = 8; d >= 2.5; d -= 0.5) { const x = pl.pos.x + f.x * d, z = pl.pos.z + f.z * d; if (this.wet(x, z, 0.9)) { to = { x, z }; break; } }
    if (!to) { UI.hint("Face the water to cast.", 2.5); return; }
    // the bank on the way back in, where a hooked fish is played to
    let sx = to.x, sz = to.z; for (let k = 0; k <= 1; k += 0.05) { const x = to.x + (pl.pos.x - to.x) * k, z = to.z + (pl.pos.z - to.z) * k; if (!this.wet(x, z, 0.94)) break; sx = x; sz = z; }
    this.cast = { st: "back", t: 0, x: to.x, z: to.z, sx, sz, nib: 1 + Math.random() * 3, wait: (3.5 + Math.random() * 8) * (1.35 - this.odds()), from: null };
    FOLEY.swish(0.4);
  }
  // the line lifted out (nothing on it): the hook skims back to you
  reelIn() { const c = this.cast; if (!c || c.st === "reel" || c.st === "land") return; c.st = "reel"; c.t = 0; c.from = this.float.position.clone(); FOLEY.swish(0.25); }
  fishTick(dt) {
    const pl = G.player, input = G.input; if (!pl) return;
    if (this.out && (pl.axe || pl.bow || pl.gun || pl.xbow || G.heldFood || pl.horse || this.frozen || !hasRod())) this.setOut(false);
    if (!this.out || !this.rodG) return;
    // (sat in a boat you can't walk, but you can fish: over the side, into the open water round you)
    const free = G.mode === "play" && (!G.lockMove || G.seatedInBoat) && !UI.dialogOpen && !G.cine;
    const click = free && input.click, rclick = free && input.rclick;
    const L = this.lvl(), c = this.cast, F = this.float, tip = this.tipWorld(), now = this.t;
    let rx = -1.05, rz = -0.1, bend = 0;
    this.raise = Math.min(1, (this.raise || 0) + dt * 4);
    if (!c) {
      if (click) this.startCast();
      // (the hook hangs from the top of the rod on a drop of line, swinging a little)
      F.position.set(tip.x + Math.sin(now * 1.7) * 0.04, tip.y - 0.7, tip.z + Math.cos(now * 1.3) * 0.04); F.rotation.set(0, 0, 0);
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
        // (a nibble now and then: the line twitches where it goes in, and a ring spreads — not yet)
        c.nib -= dt;
        if (c.nib < 0) { dip = 0.06 * Math.sin(Math.min(1, -c.nib / 0.25) * Math.PI); if (c.nib < -0.25) { c.nib = 1.2 + Math.random() * 3.5; } else if (c.nib > -dt * 1.5) { this.ripple(c.x, c.z, 0.3); FOLEY.plop({ x: c.x, z: c.z }, 0.12); } }
        F.position.set(c.x + dip * 0.6, L - 0.05 - dip, c.z);
        bend = dip * 0.6;
        if (click) { UI.hint(["Too soon — you snatch the line out of the water, and whatever was nosing at the worm is off.", "Too soon. Wait till the line's drawn right away under."][Math.floor(Math.random() * 2)], 3); this.reelIn(); }
        else if (c.t > c.wait) { c.st = "bite"; c.t = 0; this.ripple(c.x, c.z, 0.9); this.ringT = 1; FOLEY.plop({ x: c.x, z: c.z }, 0.45); }
      } else if (c.st === "bite") {
        // taken: the line drawn away under the water and the top of the rod pulled down — now
        rx = -1.24; bend = 0.22 + Math.sin(now * 18) * 0.04;
        F.position.set(c.x + Math.min(1, c.t * 2) * 0.5, L - 0.2, c.z + Math.sin(now * 9) * 0.1);
        if (click) { c.st = Math.random() < 0.08 ? "lost" : "hook"; c.t = 0; FOLEY.splash({ x: c.x, z: c.z }, 0.6); this.ripple(c.x, c.z, 1.1); }
        else if (c.t > 0.95) { UI.hint(["Too slow — it's off, and the worm with it.", "The line goes slack. Gone. Strike the moment it's drawn under."][Math.floor(Math.random() * 2)], 3); this.reelIn(); }
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
        F.position.set(px, L, pz);
        if ((c.splash = (c.splash || 0) - dt) <= 0) { c.splash = 0.22 + Math.random() * 0.2; this.ripple(px, pz, 0.5); if (Math.random() < 0.6) FOLEY.splash({ x: px, z: pz }, 0.35); }
        if (k >= 1) { c.st = "land"; c.t = 0; c.from = this.perch.position.clone(); FOLEY.splash({ x: px, z: pz }, 0.5); }
      } else if (c.st === "land") {
        // lifted out, swinging in on the line, flapping
        const k = Math.min(1, c.t / 0.75), to = tip.clone().add(new THREE.Vector3(0, -0.55, 0));
        rx = -0.35; bend = 0.3;
        const p = c.from.clone().lerp(to, k); p.y += Math.sin(k * Math.PI) * 0.6;
        this.perch.position.copy(p); this.perch.rotation.set(Math.PI / 2 - 0.2, now * 2, Math.sin(now * 28) * 0.7);
        F.position.copy(p).add(new THREE.Vector3(0, 0.12, 0));
        if (k >= 1) this.landed();
      } else if (c.st === "reel") {
        const k = Math.min(1, c.t / 0.5), to = tip.clone().add(new THREE.Vector3(0, -0.7, 0));
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
    // (the bend shared down the lengths, more toward the top: an arc, not a hinge)
    const W = [0.08, 0.2, 0.32, 0.4];
    this.rodBends.forEach((sg, i) => { sg.rotation.x += (-bend * W[i] * 2.2 - sg.rotation.x) * Math.min(1, dt * 12); });
    const a2 = this.line.geometry.attributes.position, t2 = this.tipWorld(), fp = this.perch.visible && this.cast && (this.cast.st === "hook" || this.cast.st === "land") ? this.perch.position : F.position;
    this.g.worldToLocal(t2);
    // (the line: slack and sagging while it waits, drawn straight when a fish is on it)
    const taut = this.cast && (this.cast.st === "bite" || this.cast.st === "hook" || this.cast.st === "land" || this.cast.st === "fly"), sag = taut ? 0.03 : this.cast && this.cast.st === "wait" ? 0.35 : 0.04, N = this.lineN;
    for (let i = 0; i < N; i++) { const k = i / (N - 1); a2.setXYZ(i, t2.x + (fp.x - t2.x) * k, t2.y + (fp.y + 0.015 - t2.y) * k - Math.sin(k * Math.PI) * sag, t2.z + (fp.z - t2.z) * k); }
    a2.needsUpdate = true;
  }
  landed() {
    this.perch.visible = false; this.cast = null;
    if (this.onCatch) return this.onCatch();
    const kind = Math.random();
    if (G.packAdd("fish", 1, ITEM.fish.name, ITEM.fish.note) > 0) {
      UI.hint(kind < 0.3 ? "A perch — striped, and fighting all the way in. Into the pack with it." : kind < 0.6 ? "A good perch, as long as your hand. Into the pack." : kind < 0.85 ? "A little one. It'll fry." : "A fat one! That's supper.", 3);
      FOLEY.packIn(0.4);
    } else UI.hint("A perch — but your pack's full, so back it goes.", 3);
    G.town && G.town.persist();
  }
  // the ring that spreads where the line goes in, when the hook lands or something takes
  ringTick(dt) {
    if (this.ringT > 0) { this.ringT -= dt * 1.2; const k = 1 - this.ringT; this.ring.position.set(this.float.position.x, this.lvl() + 0.01, this.float.position.z); this.ring.scale.setScalar(0.05 + k * 0.5); this.ring.material.opacity = 0.4 * this.ringT; } else this.ring.material.opacity = 0;
  }
}

// put the gear on a water. host: { w, g (a group in the world, at its origin), t (its clock), lvl() (the water's level),
// wet(x, z, k) (open water there, a fish could be under), shore(pos) (near enough to cast from), ripple(x, z, size),
// odds() (how likely a take is, 0..1), frozen, onCatch() (optional: what a fish is — the pack, by default), farText }
export function fishingGear(host) {
  for (const k of Object.getOwnPropertyNames(Gear.prototype)) if (k !== "constructor") host[k] = Gear.prototype[k];
  const g = host.g;
  // (no float: the bare hook, bent from a pin, and a worm on it — what you watch is the line, where it goes into the water)
  const fl2 = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0018, 4, 10, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0x6a6e74, metalness: 0.6, roughness: 0.4 })); hook.rotation.z = Math.PI * 0.85; fl2.add(hook);
  const worm = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.03, 3, 6), new THREE.MeshStandardMaterial({ color: 0xb8706a, roughness: 0.6 })); worm.position.set(0.008, -0.012, 0); worm.rotation.z = 0.6; fl2.add(worm);
  fl2.visible = false; g.add(fl2); host.float = fl2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 16), new THREE.MeshBasicMaterial({ color: 0xc0c8d0, transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; g.add(ring); host.ring = ring;
  host.cast = null; host.ringT = 0;
  // a perch on the line: olive-backed, barred, red-finned
  host.perch = makePerch(); host.perch.visible = false; g.add(host.perch);
  G.toggleRod = on => host.setOut(on);
  host.w.fishing = host;
  return host;
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
