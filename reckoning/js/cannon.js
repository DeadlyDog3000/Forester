// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// CANNON. Once the settlement knows Artillery, a gun can be cast and set on its carriage: a long iron barrel, its
// muzzle swelling at the end, on a field carriage with two spoked wheels and a trail to swing it round by. F at it,
// and you're the gunner: the barrel follows your eye (round as far as the trail will swing, up as high as the quoin
// lets it), and a click fires it. The ball goes out on a real arc, cuts through whoever stands in its way, and skips
// along the ground, throwing up earth. Then the gun has to be sponged and loaded again, and every ball is an iron
// one, cast from the settlement's stores. In a raid, if you aren't at it, the watch fire it themselves.

import { THREE } from "./core.js";
import { G, input } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { mat } from "./core.js";
import { shake, kickFov } from "./fight.js";

const RELOAD = 7, SPEED = 58, GRAV = 9.8, TRAVERSE = 0.9, ELEV = [-0.06, 0.42];

// ---- the gun itself ----
export function makeCannon() {
  const g = new THREE.Group();
  const oak = mat(0x5a3e26, { surface: "wood" }), iron = mat(0x2e3034, { metalness: 0.75, roughness: 0.45 }), band = mat(0x1e1f22, { metalness: 0.7, roughness: 0.5 });
  const box = (w, h, d, x, y, z, m, rx = 0, ry = 0, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(rx, ry, rz); b.castShadow = true; g.add(b); return b; };
  // the carriage: two cheeks of oak, the trail running back to the ground, an axle-tree, transoms between
  for (const sd of [-1, 1]) {
    box(0.1, 0.34, 1.5, sd * 0.2, 0.62, 0.15, oak, -0.32);
    box(0.1, 0.16, 0.5, sd * 0.2, 0.86, -0.5, oak);
  }
  box(0.5, 0.12, 0.2, 0, 0.5, 0.55, oak, -0.32); box(0.5, 0.12, 0.2, 0, 0.74, -0.3, oak);
  box(0.18, 0.12, 1.0, 0, 0.26, 0.95, oak, -0.3);                       // the trail, down to the ground behind
  box(0.92, 0.12, 0.12, 0, 0.42, -0.45, oak);                            // the axle-tree
  // the wheels: hub, felloes, spokes and an iron tyre
  for (const sd of [-1, 1]) {
    const wh = new THREE.Group(); wh.position.set(sd * 0.47, 0.42, -0.45); g.add(wh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 6, 24), oak); rim.rotation.y = Math.PI / 2; wh.add(rim);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.018, 4, 24), band); tyre.rotation.y = Math.PI / 2; wh.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 10).rotateZ(Math.PI / 2), oak); wh.add(hub);
    for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.38, 0.05), oak); const a = i / 10 * Math.PI * 2; s.position.set(0, Math.cos(a) * 0.2, Math.sin(a) * 0.2); s.rotation.x = -a; wh.add(s); }
    wh.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  // the barrel: on its trunnions between the cheeks, so it can be raised and lowered (and recoils with the carriage)
  const barrel = new THREE.Group(); barrel.position.set(0, 0.92, -0.45); g.add(barrel);
  const prof = [[0, 0.62], [0.13, 0.6], [0.145, 0.52], [0.13, 0.46], [0.122, 0.3], [0.115, 0.2], [0.112, 0.16], [0.105, 0.0], [0.095, -0.4], [0.088, -0.9], [0.083, -1.25], [0.098, -1.32], [0.1, -1.38], [0.07, -1.4], [0.04, -1.4]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  prof.unshift(new THREE.Vector2(0.001, 0.66), new THREE.Vector2(0.05, 0.68), new THREE.Vector2(0.06, 0.64));   // (the cascabel knob behind)
  const tube = new THREE.Mesh(new THREE.LatheGeometry(prof, 18).rotateX(-Math.PI / 2), iron); tube.castShadow = true; barrel.add(tube);
  // (its rings, the reinforce and the muzzle astragal)
  for (const [z, r] of [[0.45, 0.135], [0.16, 0.118], [-0.42, 0.1], [-1.22, 0.092]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 5, 18), band); ring.position.z = z; barrel.add(ring); }
  const trun = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8).rotateZ(Math.PI / 2), iron); barrel.add(trun);
  // the bore, black, and where the ball comes out
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshBasicMaterial({ color: 0x050505 })); bore.position.z = -1.401; bore.rotation.y = Math.PI; barrel.add(bore);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -1.45; barrel.add(muzzle);
  // the quoin under the breech, and a rammer and sponge leaning on the carriage
  box(0.16, 0.08, 0.3, 0, 0.83, 0.35, oak, -0.15);
  const rammer = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.1, 6), oak); rammer.position.set(0.32, 0.55, 0.3); rammer.rotation.set(-1.25, 0, 0.1); g.add(rammer);
  const sponge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), mat(0x6a5a42, { roughness: 1 })); sponge.position.set(0.32, 0.18, 1.3); sponge.rotation.set(-1.25, 0, 0.1); g.add(sponge);
  g.userData = { barrel, muzzle };
  return g;
}

// ---- smoke, flash and dust: soft puffs, made once ----
let PUFF = null, FLASH = null;
function puffTex() {
  if (PUFF) return PUFF;
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  for (let i = 0; i < 10; i++) { const px = 22 + Math.random() * 20, py = 22 + Math.random() * 20, r = Math.min(9 + Math.random() * 13, px - 1, 63 - px, py - 1, 63 - py), gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, "rgba(255,255,255,0.4)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
  PUFF = new THREE.CanvasTexture(c);
  const f = document.createElement("canvas"); f.width = f.height = 64; const y = f.getContext("2d");
  const gr = y.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,250,220,1)"); gr.addColorStop(0.3, "rgba(255,190,90,0.8)"); gr.addColorStop(1, "rgba(255,120,40,0)");
  y.fillStyle = gr; y.fillRect(0, 0, 64, 64); FLASH = new THREE.CanvasTexture(f);
  return PUFF;
}
// a cloud: n puffs from `at`, pushed along `dir`, spreading and fading over `life` seconds
function cloud(root, at, dir, { n = 10, colour = 0xd8d4cc, life = 4, speed = 4, size = 1.4, opacity = 0.55 } = {}) {
  const tex = puffTex(), parts = [];
  // (smoke isn't lit as the world is: dimmed by hand to the daylight there is, or at night it glows like a lamp)
  const lightK = G.sun ? Math.max(0.16, Math.min(1, 0.16 + G.sun.intensity / 2.4 * 0.84)) : 1, tint = new THREE.Color(colour).multiplyScalar(lightK);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, depthWrite: false, opacity, fog: true }));
    m.position.copy(at);
    const v = dir.clone().multiplyScalar(speed * (0.3 + Math.random())); v.x += (Math.random() - 0.5) * 1.6; v.y += Math.random() * 1.2; v.z += (Math.random() - 0.5) * 1.6;
    m.userData = { v, s: size * (0.6 + Math.random() * 0.6), rot: (Math.random() - 0.5) * 2 };
    root.add(m); parts.push(m);
  }
  let t = 0;
  const tick = dt => {
    t += dt; const k = t / life;
    for (const m of parts) {
      const u = m.userData; u.v.multiplyScalar(Math.max(0, 1 - dt * 1.6)); u.v.y += dt * 0.35;
      m.position.addScaledVector(u.v, dt);
      m.scale.setScalar(u.s * (1 + k * 2.6)); m.material.rotation += u.rot * dt * 0.2;
      m.material.opacity = opacity * Math.max(0, 1 - k) * Math.min(1, t * 8);
    }
    if (t > life) { for (const m of parts) { root.remove(m); m.material.dispose(); } const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); }
  };
  G.onFrame.push(tick);
}
function flash(root, at, size = 2.4) {
  puffTex();
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLASH, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  m.position.copy(at); m.scale.setScalar(size); root.add(m);
  let t = 0;
  const tick = dt => { t += dt; m.material.opacity = Math.max(0, 1 - t / 0.12); m.scale.setScalar(size * (1 + t * 3)); if (t > 0.13) { root.remove(m); m.material.dispose(); const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); } };
  G.onFrame.push(tick);
}

// ---- the guns of a settlement ----
export class Artillery {
  constructor(w, town) {
    this.w = w; this.town = town; this.guns = new Map(); this.balls = [];
    this.manned = null;
    town.artillery = this;
  }
  // each gun that stands: its state, and what F at it does
  sync() {
    const t = this.town, live = new Set();
    for (const b of t.S.buildings) {
      if (b.type !== "cannon" || !b.done || b.gone) continue;
      live.add(b);
      const vis = t.vis.get(b), model = vis && vis.userData.cannon;
      let gun = this.guns.get(b);
      if (!gun) {
        gun = { b, yaw: 0, pitch: 0.05, loaded: b.loaded ?? true, reload: 0, recoil: 0, auto: 0 };
        gun.it = this.w.addInteract({ x: b.x, z: b.z, y: this.w.heightAt(b.x, b.z) + 1, reach: 2.8,
          can: () => !this.manned,
          label: () => `Man the cannon${gun.loaded ? " — loaded" : gun.reload > 0 ? " — loading" : ""}`,
          use: () => this.man(gun) });
        this.guns.set(b, gun);
      }
      gun.model = model || null;
    }
    for (const [b, gun] of this.guns) if (!live.has(b)) { this.w.removeInteract(gun.it); if (this.manned === gun) this.unman(); this.guns.delete(b); }
  }
  // which way the gun faces in the world (its carriage's own way, swung by the gunner)
  facing(gun) { return gun.b.ry + gun.yaw; }
  man(gun) {
    const pl = G.player;
    this.manned = gun; gun.manT = 0;
    if (pl.axe) { pl.holsterAxe(true); this.reAxe = true; }
    if (pl.bow) pl.showBow(false); if (pl.gun) pl.showGun(false); if (pl.xbow) pl.showXbow(false);
    G.lockMove = true;
    pl.yaw = this.facing(gun); pl.pitch = gun.pitch;
    UI.hint(`The gun is yours. Look to aim it; click to fire${gun.loaded ? "" : " (once it's loaded)"}. Each ball is an iron one. F to leave it.`, 6);
    this.keyF = e => { if (e.code === "KeyF" && !e.repeat && this.manned) { e.preventDefault(); e.stopImmediatePropagation(); this.unman(); } };
    setTimeout(() => addEventListener("keydown", this.keyF, true), 200);
  }
  unman() {
    const gun = this.manned; if (!gun) return;
    this.manned = null; G.lockMove = false;
    removeEventListener("keydown", this.keyF, true);
    if (this.reAxe) { this.reAxe = false; G.player.holsterAxe && G.player.holsterAxe(false); }
    gun.b.loaded = gun.loaded; this.town.persist();
  }
  // a ball cast and loaded: it takes iron
  startLoad(gun) {
    const S = this.town.S;
    if (gun.loaded || gun.reload > 0) return;
    if ((S.iron || 0) < 1) { if (this.manned === gun && !gun.noIronTold) { gun.noIronTold = true; UI.hint("No iron for a ball. The smelter makes it.", 3); } return; }
    S.iron -= 1; this.town.showStore && this.town.showStore();
    gun.reload = RELOAD; gun.noIronTold = false;
  }
  fire(gun, byWatch = false) {
    if (!gun.loaded || !gun.model) return;
    gun.loaded = false; gun.b.loaded = false; gun.recoil = 1;
    const m = gun.model.userData, root = this.w.root;
    gun.model.updateMatrixWorld(true);
    const at = m.muzzle.getWorldPosition(new THREE.Vector3());
    const yaw = this.facing(gun), dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(gun.pitch), Math.sin(gun.pitch), -Math.cos(yaw) * Math.cos(gun.pitch));
    // (fired by the watch: they aim, as well as they can, at the nearest of the enemy)
    this.balls.push({ p: at.clone(), v: dir.clone().multiplyScalar(SPEED), hits: new Set(), bounces: 0, t: 0, mesh: this.ballMesh(at) });
    flash(root, at.clone().addScaledVector(dir, 0.4), 2.8);
    cloud(root, at.clone().addScaledVector(dir, 0.6), dir, { n: 14, life: 5, speed: 6, size: 1.6, opacity: 0.6 });
    AUDIO.cannon ? AUDIO.cannon(1, at) : AUDIO.gunshot && AUDIO.gunshot(1.4, at);
    const d = Math.hypot(at.x - G.player.pos.x, at.z - G.player.pos.z);
    if (d < 40) { shake(Math.max(0.15, 1 - d / 40)); if (this.manned === gun) { kickFov(9); G.hitShake = 0.6; } }
    this.town.persist();
    if (byWatch && !this.watchTold) { this.watchTold = true; UI.hint("The watch have the cannon — it's firing on the raiders.", 4); }
  }
  ballMesh(at) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(0x1c1c1e, { metalness: 0.6, roughness: 0.5 }));
    m.position.copy(at); m.castShadow = true; this.w.root.add(m); return m;
  }
  // the ball in flight: through whoever is in its way, then down, skipping, and still
  flyBall(b, dt) {
    const steps = 3, h = dt / steps, root = this.w.root;
    for (let s = 0; s < steps && !b.done; s++) {
      const from = b.p.clone();
      b.v.y -= GRAV * h; b.p.addScaledVector(b.v, h);
      if (b.v.length() > 6) {
        // whoever it passes through, raider or beast: it doesn't stop for them
        for (const a of (G.hunt ? G.hunt.animals : [])) {
          if (!a || b.hits.has(a) || (a.alive === false)) continue;
          const c = a.centre ? a.centre() : a.pos; if (!c) continue;
          if (segDist(from, b.p, c) < 1.0) {
            b.hits.add(a);
            if (a.damage) a.damage(400); else if (a.hit) a.hit(4, false);
            cloud(root, c.clone ? c.clone() : new THREE.Vector3(c.x, c.y, c.z), b.v.clone().normalize(), { n: 4, colour: 0x7a1a12, life: 1.2, speed: 2, size: 0.5, opacity: 0.45 });
            b.v.multiplyScalar(0.85);
          }
        }
      }
      const gy = this.w.heightAt(b.p.x, b.p.z);
      if (b.p.y <= gy + 0.07) {
        b.p.y = gy + 0.07;
        const sp = b.v.length();
        // earth thrown up where it strikes
        if (sp > 8) { cloud(root, b.p.clone(), new THREE.Vector3(0, 1, 0), { n: 7, colour: 0x6a5a44, life: 2.2, speed: 3, size: 0.9, opacity: 0.6 }); AUDIO.thud ? AUDIO.thud(Math.min(1, sp / 40)) : null; }
        if (sp > 12 && b.bounces < 3) { b.bounces++; b.v.y = Math.abs(b.v.y) * 0.32; b.v.x *= 0.62; b.v.z *= 0.62; }
        else { b.v.set(0, 0, 0); b.done = true; }
      }
    }
    b.mesh.position.copy(b.p);
  }
  update(dt) {
    if ((this.syncT = (this.syncT || 0) - dt) <= 0) { this.syncT = 1; this.sync(); }
    const pl = G.player, raids = this.town.raids, raidOn = !!(raids && raids.active);
    for (const gun of this.guns.values()) {
      // loading: sponged, the charge and the ball rammed home
      if (!gun.loaded && gun.reload <= 0) this.startLoad(gun);
      if (gun.reload > 0) { gun.reload -= dt; if (gun.reload <= 0) { gun.reload = 0; gun.loaded = true; gun.b.loaded = true; if (this.manned === gun) { UI.hint("Loaded.", 1.2); AUDIO.ramrod && AUDIO.ramrod(); } } else if (this.manned === gun && Math.floor((gun.reload + dt) * 2) !== Math.floor(gun.reload * 2) && gun.reload > 1.5) AUDIO.ramrod && AUDIO.ramrod(); }
      // manned: the gun follows your eye, as far as it will go
      if (this.manned === gun) {
        const base = gun.b.ry;
        let dy = Math.atan2(Math.sin(pl.yaw - base), Math.cos(pl.yaw - base));
        dy = Math.max(-TRAVERSE, Math.min(TRAVERSE, dy)); pl.yaw = base + dy;
        pl.pitch = Math.max(ELEV[0], Math.min(ELEV[1], pl.pitch));
        gun.yaw = dy; gun.pitch = pl.pitch;
        // you stand behind the breech, looking along the barrel
        const f = this.facing(gun), bx = gun.b.x + Math.sin(f) * 1.55, bz = gun.b.z + Math.cos(f) * 1.55;
        pl.pos.set(bx, this.w.heightAt(bx, bz), bz); pl.vel && pl.vel.set(0, 0, 0);
        if (input.click) { input.click = false; if (gun.loaded) this.fire(gun); else UI.hint(gun.reload > 0 ? `Loading — ${Math.ceil(gun.reload)}s` : "No ball to load — it takes iron.", 1.5); }
      } else if (raidOn && gun.loaded && (this.town.S.people || []).some(p => p.job === "watch")) {
        // the watch at the gun, in a raid: laid on the nearest raider in front of it, and fired now and then
        gun.auto -= dt;
        const tgt = raids.band.filter(r => r.alive).map(r => ({ r, d: Math.hypot(r.pos.x - gun.b.x, r.pos.z - gun.b.z) })).filter(o => o.d > 6 && o.d < 70).sort((a, b) => a.d - b.d)[0];
        if (tgt) {
          const base = gun.b.ry, want = Math.atan2(-(tgt.r.pos.x - gun.b.x), -(tgt.r.pos.z - gun.b.z));
          const dy = Math.atan2(Math.sin(want - base), Math.cos(want - base));
          if (Math.abs(dy) <= TRAVERSE) {
            gun.yaw += (dy - gun.yaw) * Math.min(1, dt * 2);
            // (elevation for the range, flat-ish: v² sin2θ / g, with a little error)
            const need = 0.5 * Math.asin(Math.min(1, tgt.d * GRAV / (SPEED * SPEED)));
            gun.pitch += (need + (this.w.heightAt(tgt.r.pos.x, tgt.r.pos.z) - this.w.heightAt(gun.b.x, gun.b.z)) / tgt.d * 0.9 - gun.pitch) * Math.min(1, dt * 2);
            if (gun.auto <= 0 && Math.abs(dy - gun.yaw) < 0.05) { gun.auto = 4 + Math.random() * 3; this.fire(gun, true); }
          }
        }
      }
      // the gun on its carriage: swung, raised, and thrown back when it fires
      if (gun.model) {
        gun.recoil = Math.max(0, gun.recoil - dt * 1.4);
        const m = gun.model, r = gun.recoil;
        m.rotation.y = gun.yaw;
        m.position.z = Math.sin(Math.min(1, r) * Math.PI) * 0.35 * (r > 0.5 ? 1 : r * 2);
        m.userData.barrel.rotation.x = gun.pitch;
      }
    }
    for (const b of this.balls) { if (!b.done) this.flyBall(b, dt); b.t += dt; }
    // (a ball lies where it stopped a while, then is picked up)
    for (const b of this.balls.slice()) if (b.done && b.t > 25) { this.w.root.remove(b.mesh); this.balls.splice(this.balls.indexOf(b), 1); }
  }
}
// how near a point comes to a line between two others
function segDist(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const L = abx * abx + aby * aby + abz * abz, t = L ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / L)) : 0;
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}
