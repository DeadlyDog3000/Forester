// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The settlement: what can be built in the clearing, how it is planned and
// raised, the forest that pays for it, and the people who come to live there.
// The later chapters teach it a piece at a time; free play is all of it.
//
//   planning   B opens the plans; a building follows your eye as a ghost, R turns
//              it, click or F sets it down (red where it will not fit)
//   raising    carry logs to the site (F), then hold F to raise it
//   forestry   fell a tree and it drops logs; carry them to the stack or a site.
//              Stumps grow back, slowly, so the forest is never used up
//   people     settlers take jobs: woodcutters fell and stack, haulers carry from
//              the stack to building sites, farmers keep the fields

import { THREE, Builder, MAT, mat, clamp, TAU } from "./core.js";
import { G, Actor } from "./engine.js";
import { UI } from "./ui.js";
import { modelCopy, makeAxe } from "./models.js";
import { CLEARING, CABIN, STACK, BLOCK, FIRE } from "./woods.js";

export const BUILDINGS = {
  cabin:    { name: "Cabin", cost: 20, model: "cabin", w: 5.8, d: 6.8, beds: 2, icon: "cabin", note: "A home for two more people." },
  woodshed: { name: "Woodshed", cost: 8, model: "woodshed", w: 4.0, d: 2.6, store: 30, icon: "logs", note: "Keeps thirty more logs dry." },
  well:     { name: "Well", cost: 6, model: "well", w: 2.4, d: 2.4, icon: "key", note: "Water close by: the fields yield more." },
  field:    { name: "Field", cost: 0, w: 6.6, d: 7.4, dig: 3, icon: "seeds", note: "Three strips of rye. Dug, not built." },
};
export const LOGS_PER_TREE = 3, CARRY_MAX = 6;
const SFX = () => window.SFX || { chop() {}, build() {}, pickup() {}, hammer() {}, treeFall() {}, timberCrack() {} };

// a settler's look, from a seed: townsman or townswoman, in their own colours
function settlerLook(p) {
  const r = p.seed;
  const pick = (a, k) => a[(r * 7 + k * 13) % a.length];
  return p.sex === "f"
    ? { model: "townswoman", name: p.name, skirt: true, apron: pick([0xf0ebe0, 0xe6dcc8, undefined], 1), hat: "bonnet", seed: r, coat: pick([0x6a5a48, 0x5a3b32, 0x4a4a3a], 2), skirtColor: pick([0x4a4038, 0x3e4a5c, 0x5a4a3a], 3), scale: p.child ? 0.72 : 1 }
    : { model: "townsman", name: p.name, hat: pick(["tricorn", "cap", "hat"], 1), seed: r, coat: pick([0x5b4a3a, 0x4d5a3c, 0x3e4a5c, 0x6a4a32], 2), legs: pick([0x3a3028, 0x2e2e33, 0x4a4035], 3), scale: p.child ? 0.72 : 1 };
}

export class Town {
  // state: { store, rye, buildings: [{type,x,z,ry,logs,dug,done}], people: [{name,sex,seed,job,child}], felled: [], logs: [] }
  constructor(w, state, persist, opts = {}) {
    this.w = w; this.S = state; this.persist = persist;
    this.S.store ??= 0; this.S.rye ??= 0; this.S.buildings ??= []; this.S.people ??= []; this.S.felled ??= []; this.S.logs ??= [];
    this.opts = opts;
    this.vis = new Map();         // building -> its group in the world
    this.actors = [];
    this.bundles = [];
    this.stumps = new Map();
    this.hooks = [];
    this.t = 0;
    this.day = 0;
    // the trees felled before stay down (stumps), until they grow back
    for (const f of this.S.felled) { const t = w.fellable[f.i]; if (t) this.fellNow(t, true); }
    w.setStack(Math.min(this.S.store, 24));
    for (const b of this.S.buildings) this.show(b);
    for (const l of this.S.logs) this.dropLogs(l.x, l.z, l.a, l.n, true);
    this.setupForestry();
    this.setupStack();
  }

  // ---- what the settlement can hold ----
  get beds() { return 2 + this.S.buildings.filter(b => b.done && b.type === "cabin").length * 2; }
  get storeCap() { return 40 + this.S.buildings.filter(b => b.done && b.type === "woodshed").length * 30; }
  has(type) { return this.S.buildings.some(b => b.done && b.type === type); }
  count(type) { return this.S.buildings.filter(b => b.done && b.type === type).length; }

  // ---- showing a building: a frame and a heap of logs while it goes up, the thing itself when done ----
  show(b) {
    const w = this.w, def = BUILDINGS[b.type];
    let g = this.vis.get(b);
    if (g) { w.root.remove(g); if (g.userData.col) g.userData.col.disabled = true; }
    g = new THREE.Group(); g.position.set(b.x, w.heightAt(b.x, b.z), b.z); g.rotation.y = b.ry;
    if (b.type === "field") this.fieldVis(g, b);
    else if (b.done) {
      const m = modelCopy(def.model);
      if (m) g.add(m.scene);
      else { const bb = new Builder(); bb.box(def.w, 2.4, def.d, 0, 1.2, 0, 0x7a5634); g.add(bb.build()); }
      // solid: an axis-aligned box round the turned footprint, a little inside it
      const c = Math.abs(Math.cos(b.ry)), s = Math.abs(Math.sin(b.ry));
      const hx = (def.w * c + def.d * s) / 2 - 0.5, hz = (def.w * s + def.d * c) / 2 - 0.5;
      g.userData.col = w.col.addBox(b.x - hx, b.z - hz, b.x + hx, b.z + hz, 4);
    } else {
      // stakes at the corners, a line between them, and the logs brought so far
      const bb = new Builder();
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bb.box(0.1, 1.1, 0.1, sx * def.w / 2, 0.55, sz * def.d / 2, 0x8a6a45);
      for (const [x0, z0, x1, z1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
        const ax = x0 * def.w / 2, az = z0 * def.d / 2, bx = x1 * def.w / 2, bz = z1 * def.d / 2;
        bb.box(Math.max(0.02, Math.abs(bx - ax)), 0.02, Math.max(0.02, Math.abs(bz - az)), (ax + bx) / 2, 0.9, (az + bz) / 2, 0xd8ceb4);
      }
      const n = Math.min(b.logs || 0, def.cost);
      for (let i = 0; i < n; i++) { const row = Math.floor(i / 5), col = i % 5; bb.add(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 7), 0x7a5634, (col - 2) * 0.32, 0.15 + row * 0.27, def.d / 2 + 1.2, Math.PI / 2, Math.PI / 2, 0, 1, 1, 1, 0.08); }
      g.add(bb.build(MAT.rough));
    }
    w.root.add(g); this.vis.set(b, g);
  }
  fieldVis(g, b) {
    const w = this.w, growth = b.growth ?? 0;
    const H = [0.12, 0.12, 0.45, 0.95][growth], C = [0x6a8a3a, 0x6a8a3a, 0x7a9a3e, 0xc8a850][growth];
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 2.2;
      if (k >= (b.dug || 0)) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.02, 7), new THREE.MeshBasicMaterial({ color: 0xc8962e, transparent: true, opacity: 0.18, depthWrite: false }));
        line.position.set(o, 0.04, 0); g.add(line); continue;
      }
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 7), mat(0x3e2e22, { surface: "stone" }));
      soil.position.set(o, 0.02, 0); soil.receiveShadow = true; g.add(soil);
      if (b.sown && growth > 0) for (const f of [-0.5, 0, 0.5]) for (let z = -3; z <= 3; z += growth > 1 ? 0.3 : 0.5) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(growth > 1 ? 0.05 : 0.03, H, 4), mat(C, { surface: "needles" }));
        m.position.set(o + f, 0.08 + H / 2, z); g.add(m);
      }
    }
  }

  // ---- can it go here? inside the clearing, clear of everything solid, trees and other plans ----
  fits(type, x, z, ry) {
    const def = BUILDINGS[type], w = this.w;
    const r = Math.hypot(def.w, def.d) / 2;
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) > CLEARING.r + 6 - r * 0.5) return false;
    for (const b of this.S.buildings) { const d2 = BUILDINGS[b.type]; if (Math.hypot(b.x - x, b.z - z) < (Math.hypot(d2.w, d2.d) / 2 + r) * 0.8) return false; }
    for (const t of w.fellable) if ((t.state === "up" || t.state === "shake") && Math.hypot(t.x - x, t.z - z) < r) return false;
    for (const [px, pz, pr] of [[CABIN.x, CABIN.z, 4.6], [STACK.x, STACK.z, 2], [BLOCK.x, BLOCK.z, 1.4], [FIRE.x, FIRE.z, 2.2]]) if (Math.hypot(px - x, pz - z) < pr + r * 0.8) return false;
    if (this.opts.keepClear) for (const [px, pz, pr] of this.opts.keepClear) if (Math.hypot(px - x, pz - z) < pr + r * 0.8) return false;
    return true;
  }

  // ---- planning: the ghost follows your eye; resolves with the new building, or null ----
  plan(type) {
    if (this.planning) this.planning.cancel();
    const def = BUILDINGS[type], w = this.w, pl = G.player;
    const ghost = new THREE.Group();
    const m = def.model ? modelCopy(def.model) : null;
    const tint = new THREE.MeshBasicMaterial({ color: 0x7fe07a, transparent: true, opacity: 0.35, depthWrite: false });
    if (m) { m.scene.traverse(o => { if (o.isMesh) { o.material = tint; o.castShadow = false; } }); ghost.add(m.scene); }
    else { const box = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.1, def.d), tint); box.position.y = 0.05; ghost.add(box); }
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(def.w, 0.05, def.d)), new THREE.LineBasicMaterial({ color: 0x7fe07a }));
    edge.position.y = 0.05; ghost.add(edge);
    w.root.add(ghost);
    let ry = CABIN.ry, x = 0, z = 0, ok = false;
    UI.keys([["Click", "set it here"], ["R", "turn it"], ["Esc", "put the plan away"]], 9);
    return new Promise(res => {
      const input = G.input;
      const tick = () => {
        const f = pl.forward(), d = 4 + Math.max(def.w, def.d) / 2;
        x = pl.pos.x + f.x * d; z = pl.pos.z + f.z * d;
        if (input.hit("KeyR")) ry += Math.PI / 4;
        ok = this.fits(type, x, z, ry);
        ghost.position.set(x, w.heightAt(x, z), z); ghost.rotation.y = ry;
        const col = ok ? 0x7fe07a : 0xe0503a; tint.color.setHex(col); edge.material.color.setHex(col);
        if ((input.click || input.hit("KeyF")) && ok) { done({ type, x, z, ry, logs: 0, dug: 0, done: type === "field" ? false : false }); }
        if (input.hit("Escape")) done(null);
      };
      const done = b => {
        const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1);
        w.root.remove(ghost); this.planning = null;
        if (b) { this.S.buildings.push(b); this.show(b); this.site(b); this.persist(); SFX().build(); }
        res(b);
      };
      this.planning = { cancel: () => done(null) };
      G.onFrame.push(tick);
    });
  }

  // ---- a site to work at: bring logs, then raise it (or, for a field, dig it and sow it) ----
  site(b) {
    const def = BUILDINGS[b.type], w = this.w, pl = G.player;
    if (b.done && b.type !== "field") return;
    const at = () => ({ x: b.x, z: b.z });
    const along = b.type === "field" ? [b.x - Math.sin(b.ry) * 3.4, b.z - Math.cos(b.ry) * 3.4, b.x + Math.sin(b.ry) * 3.4, b.z + Math.cos(b.ry) * 3.4] : null;
    const it = w.addInteract({
      x: b.x, y: w.heightAt(b.x, b.z) + (along ? 0.3 : 0.9), z: b.z, reach: along ? 4.2 : Math.max(def.w, def.d) / 2 + 1.6, seg: along,
      hold: () => b.type === "field" || (b.logs >= def.cost) ? 3 : 0,
      label: () => {
        if (b.type === "field") return (b.dug || 0) < 3 ? `Dig the field — strip ${(b.dug || 0) + 1} of 3` : !b.sown ? "Sow the rye" : "The rye is growing";
        if (b.logs < def.cost) return pl.carryN > 0 ? `Add ${Math.min(pl.carryN, def.cost - b.logs)} logs (${b.logs} of ${def.cost})` : `Bring logs — ${b.logs} of ${def.cost}`;
        return `Raise the ${def.name.toLowerCase()}`;
      },
      can: () => b.type === "field" ? !b.sown : (b.logs < def.cost ? pl.carryN > 0 : true),
      onHoldTick: (dt, t) => { if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) SFX().hammer(); },
      use: () => {
        if (b.type === "field") {
          if ((b.dug || 0) < 3) b.dug = (b.dug || 0) + 1;
          else { b.sown = true; b.growth = 1; b.done = true; w.removeInteract(it); }
          this.show(b); this.persist(); SFX().build(); this.emit("dug", b); return;
        }
        if (b.logs < def.cost) {
          const n = Math.min(pl.carryN, def.cost - b.logs);
          b.logs += n; pl.carryN -= n; UI.carry(pl.carryN ? `Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}` : null);
          this.show(b); this.persist(); SFX().pickup(); return;
        }
        b.done = true; w.removeInteract(it); this.show(b); this.persist(); SFX().build(); this.emit("built", b);
      },
    });
    // the interact system wants hold as a number; keep it current
    Object.defineProperty(it, "hold", { get: () => b.type === "field" ? 3 : (b.logs >= def.cost ? 4 : 0) });
    b._it = it;
  }
  sitesAll() { for (const b of this.S.buildings) if (!b.done || (b.type === "field" && !b.sown)) this.site(b); }

  on(ev, f) { this.hooks.push([ev, f]); }
  emit(ev, x) { for (const [e, f] of this.hooks) if (e === ev) f(x); }

  // ---- the stack by the cabin: logs in, logs out ----
  setupStack() {
    const w = this.w, pl = G.player;
    this.stackIt = w.addInteract({ x: STACK.x, y: w.cy + 0.8, z: STACK.z, reach: 2.6,
      label: () => pl.carryN > 0 ? `Stack the logs (${pl.carryN})` : `Take logs from the stack (${this.S.store})`,
      can: () => pl.carryN > 0 ? this.S.store < this.storeCap : this.S.store > 0,
      use: () => {
        if (pl.carryN > 0) { const n = Math.min(pl.carryN, this.storeCap - this.S.store); this.S.store += n; pl.carryN -= n; }
        else { const n = Math.min(CARRY_MAX, this.S.store); this.S.store -= n; pl.carryN += n; }
        UI.carry(pl.carryN ? `Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}` : null);
        w.setStack(Math.min(this.S.store, 24)); this.persist(); SFX().build();
      } });
  }

  // ---- felling: swing at a standing tree, it falls, it leaves logs ----
  setupForestry() {
    const w = this.w, pl = G.player;
    G.onSwing = () => {
      const f = pl.forward();
      let best = null, bd = 2.4;
      for (const t of w.fellable) {
        if (t.state !== "up" && t.state !== "shake") continue;
        if (t.claimed) continue;
        const dx = t.x - pl.pos.x, dz = t.z - pl.pos.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * f.x + dz * f.z) / d > 0.45) { bd = d; best = t; }
      }
      if (!best) return;
      SFX().chop();
      best.hp = (best.hp ?? 4) - 1;
      if (best.hp > 0) { best.state = "shake"; best.shake = 0.25; return; }
      this.fell(best, best.x - pl.pos.x, best.z - pl.pos.z, true);
    };
  }
  fell(t, dx, dz, dropLogs) {
    const l = Math.hypot(dx, dz) || 1;
    t.state = "falling"; t.fall = 0; t.col.disabled = true;
    t.dir = { x: dx / l, z: dz / l };
    t.axis = new THREE.Vector3(dz / l, 0, -dx / l);
    SFX().timberCrack();
    t.onDown = () => {
      SFX().treeFall();
      const i = this.w.fellable.indexOf(t);
      if (!this.S.felled.some(f => f.i === i)) this.S.felled.push({ i, day: this.day });
      if (dropLogs) this.dropLogs(t.x + t.dir.x * 1.6, t.z + t.dir.z * 1.6, Math.atan2(t.dir.x, t.dir.z), LOGS_PER_TREE);
      this.persist();
      setTimeout(() => this.fellNow(t), 1500);
    };
  }
  fellNow(t, instant) {
    t.g.visible = false; t.state = "gone"; t.col.disabled = true;
    if (!this.stumps.has(t)) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.45, 8), mat(0x5a4030, { surface: "bark" }));
      m.position.set(t.x, t.y + 0.1, t.z); m.castShadow = true;
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.26, 8), mat(0xc8a878, { surface: "wood" }));
      top.rotation.x = -Math.PI / 2; top.position.y = 0.226; m.add(top);
      this.w.root.add(m); this.stumps.set(t, m);
    }
  }
  // a stump grows back into a young tree, then a tree
  regrow(t) {
    const m = this.stumps.get(t); if (m) { this.w.root.remove(m); this.stumps.delete(t); }
    t.g.visible = true; t.state = "up"; t.col.disabled = false; t.hp = 4; t.claimed = null;
    t.g.rotation.set(0, 0, 0);
    const i = this.w.fellable.indexOf(t);
    this.S.felled = this.S.felled.filter(f => f.i !== i);
  }
  dropLogs(x, z, a, n, restoring) {
    const w = this.w, pl = G.player;
    const reach = CLEARING.r + 7.5, dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
    if (dc > reach) { x = CLEARING.x + (x - CLEARING.x) * reach / dc; z = CLEARING.z + (z - CLEARING.z) * reach / dc; }
    const y = w.heightAt(x, z), dx = Math.sin(a), dz = Math.cos(a);
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 8), mat(0x7a5634, { surface: "bark" }));
      m.rotation.z = Math.PI / 2; m.rotation.y = a + Math.PI / 2;
      m.position.set((i - 1) * 0.3 * dz, 0.15 + (i === 1 ? 0.24 : 0), -(i - 1) * 0.3 * dx);
      m.castShadow = true; g.add(m);
    }
    g.position.set(x, y, z); w.root.add(g);
    const b = { g, x, z, a, n };
    b.it = w.addInteract({ x, y: y + 0.4, z, reach: 2.4, label: () => `Take the logs (${b.n})`,
      can: () => pl.carryN < CARRY_MAX,
      use: () => {
        const take = Math.min(b.n, CARRY_MAX - pl.carryN);
        pl.carryN += take; b.n -= take; SFX().pickup();
        UI.carry(`Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}`);
        if (b.n <= 0) this.pickUp(b);
        this.saveLogs();
      } });
    this.bundles.push(b);
    if (!restoring) this.saveLogs();
    return b;
  }
  pickUp(b) { this.w.removeInteract(b.it); this.w.root.remove(b.g); this.bundles.splice(this.bundles.indexOf(b), 1); }
  saveLogs() { this.S.logs = this.bundles.map(b => ({ x: b.x, z: b.z, a: b.a, n: b.n })); this.persist(); }

  // ---- people ----
  addPerson(p, x, z) {
    if (!this.S.people.includes(p)) this.S.people.push(p);
    const a = new Actor(settlerLook(p), x ?? CLEARING.x + 2, z ?? CLEARING.z + 6, 0);
    a.settler = p; this.actors.push(a);
    this.work(a).catch(e => { if (e !== "stop") console.error(e); });
    this.persist();
    return a;
  }
  spawnPeople() { this.S.people.forEach((p, i) => this.addPerson(p, CLEARING.x - 6 + (i % 4) * 3, CLEARING.z + 8 + Math.floor(i / 4) * 2)); }
  stop() { this.stopped = true; for (const a of this.actors) a.remove(); this.actors = []; if (this.planning) this.planning.cancel(); G.onSwing = null; }

  // each settler's day: their job, over and over
  async work(a) {
    const sleep = s => new Promise(r => setTimeout(r, s * 1000));
    const alive = () => { if (this.stopped || !G.world || G.world !== this.w) throw "stop"; };
    await sleep(Math.random() * 3);
    while (true) {
      alive();
      const job = a.settler.job || "hauler";
      const site = this.S.buildings.find(b => !b.done && b.type !== "field" && b.logs < BUILDINGS[b.type].cost);
      if (job === "hauler" && site && this.S.store > 0) {
        await a.walkTo(STACK.x + 1.3, STACK.z + 0.8, 1.3); alive();
        const n = Math.min(4, this.S.store, BUILDINGS[site.type].cost - site.logs); if (n <= 0) continue;
        this.S.store -= n; this.w.setStack(Math.min(this.S.store, 24)); a.person.setPose("hold");
        await a.walkTo(site.x + 1.6, site.z + BUILDINGS[site.type].d / 2 + 1.4, 1.1); alive();
        site.logs = Math.min(BUILDINGS[site.type].cost, site.logs + n); a.person.setPose("idle"); this.show(site); this.persist(); SFX().pickup();
        await sleep(2);
      } else if (job === "woodcutter" || (job === "hauler" && site)) {
        const trees = this.w.fellable.filter(t => t.state === "up" && !t.claimed);
        if (!trees.length) { await sleep(5); continue; }
        trees.sort((p, q) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z) - Math.hypot(q.x - a.pos.x, q.z - a.pos.z));
        const t = trees[Math.floor(Math.random() * Math.min(5, trees.length))];
        t.claimed = "settler";
        const dx = CLEARING.x - t.x, dz = CLEARING.z - t.z, l = Math.hypot(dx, dz);
        await a.walkTo(t.x + dx / l * 1.1, t.z + dz / l * 1.1, 1.3); alive();
        a.faceTo(t.x, t.z); a.person.setPose("chop");
        const axe = a.hold(makeAxe());
        for (let i = 0; i < 6; i++) { await sleep(0.8); alive(); if (Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z) < 24) SFX().chop(); }
        a.person.setPose("idle"); a.person.held.remove(axe);
        this.fell(t, -dx, -dz, false);
        await sleep(2.6); alive();
        a.person.setPose("hold");
        await a.walkTo(STACK.x + 1.4, STACK.z + 0.6, 1.2); alive();
        a.person.setPose("idle");
        this.S.store = Math.min(this.storeCap, this.S.store + LOGS_PER_TREE); this.w.setStack(Math.min(this.S.store, 24)); this.persist(); SFX().build();
        await sleep(3 + Math.random() * 3);
      } else if (job === "farmer") {
        const fields = this.S.buildings.filter(b => b.type === "field" && b.done);
        const f = fields.length ? fields[Math.floor(Math.random() * fields.length)] : null;
        if (!f) { await a.walkTo(FIRE.x + (Math.random() - 0.5) * 6, FIRE.z + 3 + Math.random() * 2, 1); await sleep(6); continue; }
        await a.walkTo(f.x + (Math.random() - 0.5) * 4, f.z + (Math.random() - 0.5) * 5, 1.1); alive();
        a.person.setPose("hammer"); await sleep(6 + Math.random() * 4); alive(); a.person.setPose("idle");
      } else {
        // nothing to do: idle about the fire and the cabins
        await a.walkTo(FIRE.x + (Math.random() - 0.5) * 8, FIRE.z + (Math.random() - 0.5) * 8, 1.0); alive();
        await sleep(4 + Math.random() * 6);
      }
    }
  }

  // ---- time: days pass; the forest grows back, fields ripen, people eat ----
  update(dt, dayLength = 300) {
    this.t += dt;
    const day = Math.floor(this.t / dayLength);
    if (day !== this.day) {
      this.day = day;
      // stumps from more than two days ago come back, a few a day
      for (const f of this.S.felled.slice()) if (this.day - (f.day ?? -9) >= 2 && Math.random() < 0.35) { const t = this.w.fellable[f.i]; if (t && t.state === "gone") this.regrow(t); }
      // fields grow a stage a day; ripe fields are harvested by the farmers, or by you
      for (const b of this.S.buildings) if (b.type === "field" && b.sown) {
        if ((b.growth ?? 1) < 3) { b.growth = (b.growth ?? 1) + 1; this.show(b); }
        else if (this.S.people.some(p => p.job === "farmer")) { this.S.rye += 10 + (this.has("well") ? 5 : 0); b.growth = 1; this.show(b); }
      }
      // everyone eats
      this.S.rye = Math.max(0, this.S.rye - Math.ceil((this.S.people.length + 2) / 2));
      this.persist();
      this.emit("day", this.day);
    }
  }

  // a ripe field can be reaped by hand
  harvestable() { return this.S.buildings.filter(b => b.type === "field" && b.sown && (b.growth ?? 1) >= 3); }
}
