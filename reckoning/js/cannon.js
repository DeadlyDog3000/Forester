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
// A field gun of the 1680s: a bronze barrel cast all in one, its mouldings turned on a lathe (the cascabel's button
// behind, the base ring, two reinforces stepping down, the long chase, the astragal and the swelling tulip of the
// muzzle), with dolphins to lift it by and its trunnions resting in the cheeks of an oak carriage. The cheeks run down
// from the axle to a trail on the ground, ironed along their tops; two wheels of twelve spokes with iron tyres; the
// rammer and sponge hung along the side. Built pointing down -z, on the ground at y = 0.
export function makeCannon() {
  const g = new THREE.Group();
  const oak = mat(0x5e4128, { surface: "wood" }), oakD = mat(0x4a321e, { surface: "wood" });
  const iron = mat(0x2a2b2e, { metalness: 0.7, roughness: 0.5 }), bronze = mat(0x8a6834, { metalness: 0.8, roughness: 0.4 }), dark = new THREE.MeshBasicMaterial({ color: 0x080606 });
  const put = (m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z, rx, ry, rz);
  const AX = -0.32, R = 0.47;                        // (the axle, and the wheels' size)
  // the cheeks: drawn from the side (z along, y up), sawn from a plank and set either side of the barrel
  const side = new THREE.Shape(), P = [[-0.72, 0.42], [-0.72, 0.78], [-0.5, 0.86], [-0.42, 0.8], [-0.24, 0.8], [-0.16, 0.86], [0.12, 0.78], [1.62, 0.1], [1.66, 0.0], [1.5, 0.0], [0.2, 0.42], [-0.2, 0.36], [-0.72, 0.42]];
  side.moveTo(P[0][0], P[0][1]); for (const [x, y] of P.slice(1)) side.lineTo(x, y);
  const cg = new THREE.ExtrudeGeometry(side, { depth: 0.085, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
  cg.translate(0, 0, -0.0425); cg.rotateY(-Math.PI / 2);
  for (const sd of [-1, 1]) {
    put(new THREE.Mesh(cg, oak), sd * 0.2);
    // iron along the top of each, and a strap over the trunnion (the capsquare)
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.012, 1.55), iron); put(strap, sd * 0.2, 0.47, 0.88, 0.47);
    put(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 5, 10, Math.PI), iron), sd * 0.2, 0.86, -0.32, 0, Math.PI / 2, 0);
    for (const z of [-0.6, 0.3, 0.9]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6).rotateZ(Math.PI / 2), iron), sd * 0.248, z > 0 ? 0.62 - (z - 0.12) * 0.47 : 0.6, z);
  }
  // the transoms between the cheeks, the trail's end, and its iron ring (the lunette)
  box(0.32, 0.16, 0.12, oakD, 0, 0.6, -0.62); box(0.32, 0.14, 0.12, oakD, 0, 0.5, 0.2); box(0.32, 0.12, 0.16, oakD, 0, 0.08, 1.52);
  put(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 12), iron), 0, 0.1, 1.66, Math.PI / 2);
  // the bed and quoin under the breech: the wedge that sets the elevation
  box(0.3, 0.05, 0.42, oakD, 0, 0.56, 0.25, 0.47);
  // the axle-tree, its arms running out into the wheels
  box(0.6, 0.13, 0.13, oakD, 0, R, AX); put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.02, 8).rotateZ(Math.PI / 2), iron), 0, R, AX);
  // the wheels: hub, twelve spokes, the felloes and their iron tyre
  for (const sd of [-1, 1]) {
    const wh = new THREE.Group(); wh.position.set(sd * 0.43, R, AX); g.add(wh);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.24, 12).rotateZ(Math.PI / 2), oak); wh.add(hub);
    for (const o of [-0.09, 0.09]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.01, 4, 14), iron); hoop.rotation.y = Math.PI / 2; hoop.position.x = o; wh.add(hoop); }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8).rotateZ(Math.PI / 2), iron); cap.position.x = sd * 0.13; wh.add(cap);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.045), oak);
      sp.position.set(sd * 0.02, Math.cos(a) * 0.25, Math.sin(a) * 0.25); sp.rotation.x = a; wh.add(sp);
    }
    const fel = new THREE.Mesh(new THREE.TorusGeometry(R - 0.045, 0.04, 6, 36), oak); fel.rotation.y = Math.PI / 2; fel.scale.set(1, 1, 1.5); wh.add(fel);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.005, 0.012, 4, 36), iron); tyre.rotation.y = Math.PI / 2; tyre.scale.set(1, 1, 4); wh.add(tyre);
    wh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  // the barrel, on its trunnions: turned from its outline (r, y) from the button behind to the lip in front, then the
  // bore back inside it; its trunnions are its pivot, so laying it up and down turns it about them
  const barrel = new THREE.Group(); barrel.position.set(0, 0.86, AX); g.add(barrel);
  const prof = [[0, 0.8], [0.04, 0.79], [0.055, 0.76], [0.05, 0.73], [0.028, 0.7], [0.03, 0.67], [0.12, 0.655], [0.152, 0.63], [0.168, 0.6], [0.168, 0.555], [0.152, 0.545],
    [0.149, 0.31], [0.164, 0.3], [0.164, 0.27], [0.143, 0.26], [0.138, 0.02], [0.15, 0.01], [0.15, -0.025], [0.126, -0.035], [0.108, -1.05], [0.122, -1.08], [0.122, -1.11], [0.106, -1.13],
    [0.112, -1.24], [0.134, -1.33], [0.146, -1.38], [0.146, -1.415], [0.06, -1.42], [0.055, -1.1], [0.001, -1.1]];
  const lg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y + 0.12)), 28); lg.rotateX(Math.PI / 2);
  const tube = new THREE.Mesh(lg, bronze); tube.castShadow = true; barrel.add(tube);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.056, 16), dark); bore.position.z = -1.0; bore.rotation.y = Math.PI; barrel.add(bore);
  const trun = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.44, 10).rotateZ(Math.PI / 2), bronze); barrel.add(trun);
  for (const sd of [-1, 1]) { const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateZ(Math.PI / 2), bronze); rim.position.x = sd * 0.155; barrel.add(rim); }
  // the dolphins: two arched handles astride it, over the trunnions
  for (const sd of [-1, 1]) { const d = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), bronze); d.rotation.y = Math.PI / 2; d.position.set(sd * 0.05, 0.13, 0.02); d.rotation.z = sd * 0.25; barrel.add(d); }
  // the touch-hole and its little pan
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10), bronze); pan.position.set(0, 0.162, 0.6); barrel.add(pan);
  const vent = new THREE.Mesh(new THREE.CircleGeometry(0.008, 8), dark); vent.rotation.x = -Math.PI / 2; vent.position.set(0, 0.169, 0.6); barrel.add(vent);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -1.36; barrel.add(muzzle);
  // the rammer and the sponge, laid along the left cheek, down its slope, on iron hooks
  const SL = 0.425, along = (t, x) => [x, 0.47 + (0.6 - t) * Math.tan(SL) * 0.0 + (0.6 - t) * 0.453, t];
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.9, 6).rotateX(Math.PI / 2), oakD);
  { const [x, y, z] = along(0.6, -0.285); put(pole, x, y, z, SL); }
  { const [x, y, z] = along(-0.33, -0.285); put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10).rotateX(Math.PI / 2), mat(0x5e5040, { roughness: 1 })), x, y, z, SL); }
  { const [x, y, z] = along(1.52, -0.285); put(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 10).rotateX(Math.PI / 2), oakD), x, y, z, SL); }
  for (const t of [0.0, 1.1]) { const [x, y, z] = along(t, -0.262); put(new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 8, Math.PI), iron), x, y - 0.01, z, 0, Math.PI / 2, Math.PI); }
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
