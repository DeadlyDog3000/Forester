// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The game underneath the story: input, the body you walk around in, the
// people who walk around with you, the camera over (or behind) your eyes, and
// the one thing in front of you that E would do something to.

import { THREE, renderer, camera, clamp, lerp, angDiff, makeSky, flicker, MAT } from "./core.js";
import { makePerson, makeAxe } from "./models.js";
import { fillPaper, you, INK, TOWN } from "./map.js";
import { UI } from "./ui.js";
import { Bugs } from "./bugs.js";
import { AUDIO } from "./audio.js";

/* global SFX */

// ---------------------------------------------------------------------------
//  input
// ---------------------------------------------------------------------------
export const input = {
  keys: new Set(), pressed: new Set(), mdx: 0, mdy: 0, click: false, mouseDown: false,
  freeLook: false, mx: -1, my: -1,     // looking with a free cursor, where the browser will not lock it
  down(code) { return this.keys.has(code); },
  hit(code) { return this.pressed.has(code); },
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; this.click = false; this.rclick = false; },
};
addEventListener("keydown", e => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  if (!input.keys.has(e.code)) input.pressed.add(e.code);
  input.keys.add(e.code);
  if (["Space", "Tab"].includes(e.code) && G.mode === "play") e.preventDefault();
});
addEventListener("keyup", e => input.keys.delete(e.code));
addEventListener("blur", () => input.keys.clear());
// the cursor gone off the page stops free look turning at the edge
document.addEventListener("mouseleave", () => { input.mx = input.my = -1; });
addEventListener("mousemove", e => {
  input.mx = e.clientX; input.my = e.clientY;
  if (document.pointerLockElement || (input.freeLook && G.mode === "play")) { input.mdx += e.movementX; input.mdy += e.movementY; }
});
addEventListener("mousedown", e => { if (e.button === 0) { input.click = true; input.mouseDown = true; } if (e.button === 2) { input.rclick = true; input.rdown = true; } });
addEventListener("mouseup", e => { if (e.button === 2) input.rdown = false; });
addEventListener("contextmenu", e => { if (G.mode === "play") e.preventDefault(); });
addEventListener("mouseup", e => { if (e.button === 0) input.mouseDown = false; });

// ---------------------------------------------------------------------------
//  the game object everything shares
// ---------------------------------------------------------------------------
export const G = {
  mode: "title",        // title | play | pause
  scene: new THREE.Scene(),
  world: null, player: null,
  settings: { sens: 1, fov: 72, invert: false, volume: 0.7, music: true, third: false },
  who: "brother",       // which of the two you are
  marker: null,
  cine: null,           // {look: Vector3, speed} — the camera is steered for you
  lockMove: false,
  eyeLevel: 0,
  time: 0,
  onFrame: [],
  interactTarget: null, holdT: 0,
  pack: [],             // what you have on you that is not in your hands: [{name, note}]
  camp: null,           // at the clearing: what is stacked and built there
};
G.input = input;
G.bugs = new Bugs(G.scene);
window.G = G; window.__renderer = renderer; window.__camera = camera;

// ---------------------------------------------------------------------------
//  atmosphere: sun, sky, fog, and how bright the windows are
// ---------------------------------------------------------------------------
const sky = makeSky();
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a3f30, 0.8);
// a low fill, so a room lit by one candle is dim rather than black
const fill = new THREE.AmbientLight(0xffdcb8, 0.1);
G.scene.add(sky, sun, sun.target, hemi, camera, fill);   // the camera too, so what it carries (the axe) is drawn
G.scene.fog = new THREE.Fog(0xc9d6e0, 30, 260);
G.sun = sun; G.hemi = hemi; G.sky = sky;

const C = h => new THREE.Color(h);
export const ATMO = {
  evening:   { sun: [0.55, 0.28, 0.4], sunC: 0xffb070, sunI: 2.4, hemiS: 0xa6b4d8, hemiG: 0x5a4632, hemiI: 0.9, fog: 0xd8a888, near: 40, far: 240, top: 0x3d5b93, mid: 0xf0b48a, bot: 0x8a6f60, stars: 0, win: 0.9, exp: 1.1 },
  dusk:      { sun: [-0.5, 0.08, 0.6], sunC: 0xff8050, sunI: 1.4, hemiS: 0x8a90c0, hemiG: 0x4e4238, hemiI: 1.0, fog: 0x7a6a78, near: 25, far: 180, top: 0x1e2850, mid: 0xc0705a, bot: 0x40353a, stars: 0.25, win: 1.6, exp: 1.2, fill: 0.3 },
  night:     { sun: [0.3, 0.7, -0.4], sunC: 0x8fa5d8, sunI: 0.5, hemiS: 0x46558a, hemiG: 0x1a1820, hemiI: 0.6, fog: 0x121828, near: 12, far: 100, top: 0x05070f, mid: 0x141b30, bot: 0x0a0a10, stars: 1, win: 2.2, exp: 1.35, fill: 0.42 },
  dawn:      { sun: [-0.2, 0.18, 0.9], sunC: 0xffc6a0, sunI: 1.1, hemiS: 0x9aa4b8, hemiG: 0x4e4844, hemiI: 0.85, fog: 0xa8a8b0, near: 8, far: 110, top: 0x5a6a88, mid: 0xc8b4b0, bot: 0x7a7478, stars: 0, win: 0.4, exp: 1.15 },
  mist:      { sun: [-0.2, 0.22, 0.9], sunC: 0xd0d0d8, sunI: 0.9, hemiS: 0xa4aebe, hemiG: 0x55504c, hemiI: 1.05, fog: 0x7a808a, near: 6, far: 70, top: 0x5a6472, mid: 0x8a909a, bot: 0x6a6c70, stars: 0, win: 0.9, exp: 1.3 },
  afternoon: { sun: [0.4, 0.62, 0.35], sunC: 0xfff0d0, sunI: 2.6, hemiS: 0xbcd0f0, hemiG: 0x4a4a30, hemiI: 0.85, fog: 0xa8b8b0, near: 30, far: 200, top: 0x4a78b5, mid: 0xc9d6e0, bot: 0x8a9a88, stars: 0, win: 0, exp: 1.0 },
  morning:   { sun: [-0.5, 0.42, 0.5], sunC: 0xffe6c0, sunI: 2.3, hemiS: 0xbcd0f0, hemiG: 0x4a4a30, hemiI: 0.8, fog: 0xb8c4c0, near: 30, far: 200, top: 0x5a88c0, mid: 0xdde4e0, bot: 0x8a9a88, stars: 0, win: 0, exp: 1.0 },
  snowday:   { sun: [-0.3, 0.35, 0.6], sunC: 0xe8eef8, sunI: 1.2, hemiS: 0xd8e2f0, hemiG: 0x9098a0, hemiI: 1.1, fog: 0xc8d0da, near: 15, far: 130, top: 0x9aa8b8, mid: 0xd4dae2, bot: 0xb8c0c8, stars: 0, win: 0.6, exp: 1.1 },
  snownight: { sun: [0.3, 0.7, -0.4], sunC: 0x9aaad0, sunI: 0.35, hemiS: 0x5a6890, hemiG: 0x2a3040, hemiI: 0.7, fog: 0x3a4458, near: 6, far: 45, top: 0x10141e, mid: 0x2a3244, bot: 0x1a1e28, stars: 0, win: 2.2, exp: 1.35, fill: 0.35 },
  firelight: { sun: [0.3, 0.6, -0.4], sunC: 0x7a8ac0, sunI: 0.45, hemiS: 0x46507a, hemiG: 0x241c14, hemiI: 0.65, fog: 0x0c0e16, near: 12, far: 100, top: 0x060812, mid: 0x1a1e34, bot: 0x0a0a10, stars: 1, win: 2.2, exp: 1.35, fill: 0.42 },
};
function applyAtmo(a) {
  sun.color.copy(a.sunC); sun.intensity = a.sunI;
  G.sunDir = a.sun.clone ? a.sun.clone().normalize() : new THREE.Vector3(...a.sun).normalize();
  hemi.color.copy(a.hemiS); hemi.groundColor.copy(a.hemiG); hemi.intensity = a.hemiI;
  fill.intensity = a.fill ?? 0.1;
  G.scene.fog.color.copy(a.fog); G.scene.fog.near = a.near; G.scene.fog.far = a.far;
  const u = sky.material.uniforms;
  u.top.value.copy(a.top); u.mid.value.copy(a.mid); u.bottom.value.copy(a.bot);
  u.sunDir.value.copy(G.sunDir); u.sunCol.value.copy(a.sunC).multiplyScalar(Math.min(1, a.sunI / 2));
  sky.userData.stars.material.opacity = a.stars;
  MAT.lit.emissiveIntensity = a.win;
  renderer.toneMappingExposure = a.exp;
}
const toLive = p => ({ fill: 0.1, ...p, sun: new THREE.Vector3(...p.sun), sunC: C(p.sunC), hemiS: C(p.hemiS), hemiG: C(p.hemiG), fog: C(p.fog), top: C(p.top), mid: C(p.mid), bot: C(p.bot) });
export function setAtmo(name) { applyAtmo(toLive(ATMO[name])); G.atmoName = name; }
// halfway between two presets — the long walk out of the city goes from
// afternoon to dusk a step at a time
export function blendAtmo(a, b, t) {
  const A = toLive(ATMO[a]), B = toLive(ATMO[b]), o = {};
  for (const k in A) {
    if (typeof A[k] === "number") o[k] = lerp(A[k], B[k], t);
    else if (A[k].isColor) o[k] = A[k].clone().lerp(B[k], t);
    else if (A[k].isVector3) o[k] = A[k].clone().lerp(B[k], t);
  }
  applyAtmo(o);
}

// ---------------------------------------------------------------------------
//  the player
// ---------------------------------------------------------------------------
export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.32;
    this.eye = 1.62; this.crouched = false; this.onGround = true; this.vy = 0;
    this.stride = 0; this.bob = 0; this.speed = 0;
    this.model = null; this.trail = [];
    this.axe = null; this.swingT = -1; this.onSwingHit = null;
    this.carryN = 0; this.lean = 0;
  }
  setModel(opts) {
    if (this.model) G.scene.remove(this.model.root);
    this.model = makePerson(opts);
    G.scene.add(this.model.root);
  }
  place(x, z, yaw = 0) {
    this.pos.set(x, G.world ? G.world.heightAt(x, z) : 0, z);
    this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0);
    this.trail = [{ x, z }];
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  // put the axe away (still yours) or take it out again
  holsterAxe(away) {
    if (away && this.axe) { this.giveAxe(false); this.hasAxe = true; }
    else if (!away && this.hasAxe && !this.axe) this.giveAxe(true);
  }
  giveAxe(on) {
    this.hasAxe = on;
    if (on && !this.axe) {
      // the hands are a pivot; inside it the haft points forward and the blade leads to the left
      this.axe = new THREE.Group();
      this.axe.rotation.order = "YXZ";
      const a = makeAxe();
      a.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
      this.axe.add(a);
      camera.add(this.axe);
      // your two hands on the haft, and your sleeves back to your shoulders, so hands and axe are one
      const look = this.model && this.model.look || {};
      const skinM = new THREE.MeshStandardMaterial({ color: look.skin ?? 0xe8c4a0, roughness: 0.6 });
      const sleeveM = new THREE.MeshStandardMaterial({ color: look.coat ?? 0x4d5a3c, roughness: 0.95 });
      const cuffM = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.95 });
      const hand = y => {
        const h = new THREE.Group(); h.position.set(0, y, 0);
        const fist = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 8), skinM); fist.rotation.z = Math.PI / 2; h.add(fist);
        const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 3, 6), skinM); thumb.position.set(0.02, 0.03, 0.03); thumb.rotation.x = 0.8; h.add(thumb);
        a.add(h); return h;
      };
      this.hands = [hand(0.07), hand(0.3)];
      this.arms = this.hands.map((h, i) => {
        const arm = new THREE.Group();
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 1, 10).translate(0, 0.5, 0), sleeveM); arm.add(sleeve);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10).translate(0, 0.035, 0), cuffM); arm.add(cuff);
        camera.add(arm);
        return { arm, sleeve, cuff, shoulder: new THREE.Vector3(i === 0 ? 0.24 : -0.2, -0.5, 0.12) };
      });
      this.axeRest();
      // and one in the hand of your body, for when the camera is behind you
      this.axeBody = makeAxe(); this.axeBody.rotation.x = Math.PI / 2; this.axeBody.position.set(0, 0, 0);
      this.model.held.add(this.axeBody);
    } else if (!on && this.axe) {
      camera.remove(this.axe); this.axe = null;
      for (const a of this.arms || []) camera.remove(a.arm);
      this.arms = null; this.hands = null;
      if (this.axeBody) this.model.held.remove(this.axeBody); this.axeBody = null;
    }
  }
  // each sleeve runs from its shoulder to its hand on the haft, however the axe is held
  fitArms() {
    if (!this.arms) return;
    this.axe.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(camera.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const { arm, sleeve, cuff, shoulder } = this.arms[i];
      const hp = new THREE.Vector3().setFromMatrixPosition(this.hands[i].matrixWorld).applyMatrix4(inv);
      const d = new THREE.Vector3().subVectors(hp, shoulder), L = d.length();
      arm.position.copy(shoulder);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      sleeve.scale.set(1, Math.max(0.05, L - 0.08), 1);
      cuff.position.y = Math.max(0.05, L - 0.12);
    }
  }
  // held low on the right, head up, ready
  axeRest() { this.axe.position.set(0.34, -0.5, -0.42); this.axe.rotation.set(1.05, -0.35, -0.5); }
  swing(onHit) {
    if (this.swingT >= 0) return;
    this.swingT = 0; this.onSwingHit = onHit; this._hitDone = false;
    SFX.swingFist();
  }
  update(dt) {
    const w = G.world;
    const s = G.settings;
    const look = !G.cine && G.mode === "play";
    if (look) {
      const zs = 1 - (G.zoom || 0) * 0.6;
      this.yaw -= input.mdx * 0.0022 * s.sens * zs;
      this.pitch -= input.mdy * 0.0022 * s.sens * zs * (s.invert ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    } else if (G.cine && G.cine.look) {
      // steer the view toward whatever the scene wants seen
      const d = G.cine.look.clone().sub(this.eyePos());
      const ty = Math.atan2(-d.x, -d.z), tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      const k = Math.min(1, dt * (G.cine.speed ?? 2.5));
      this.yaw += angDiff(this.yaw, ty) * k;
      this.pitch += (tp - this.pitch) * k;
    }

    // movement
    let mx = 0, mz = 0;
    const canMove = G.mode === "play" && !G.lockMove && !UI.dialogOpenBlocking;
    if (canMove) {
      if (input.down("KeyW") || input.down("ArrowUp")) mz -= 1;
      if (input.down("KeyS") || input.down("ArrowDown")) mz += 1;
      if (input.down("KeyA") || input.down("ArrowLeft")) mx -= 1;
      if (input.down("KeyD") || input.down("ArrowRight")) mx += 1;
    }
    if (input.hit("KeyC") || input.hit("ControlLeft")) this.crouched = !this.crouched;
    let sprint = (input.down("ShiftLeft") || input.down("ShiftRight")) && !this.crouched;
    // in a chase, breath runs out: a spent runner can only jog until it comes back
    if (G.stamina !== undefined) {
      if (this.winded && G.stamina > 0.35) this.winded = false;
      if (sprint && !this.winded && this.speed > 1) G.stamina = Math.max(0, G.stamina - dt / 5.5);
      else G.stamina = Math.min(1, G.stamina + dt / (sprint ? 9 : 3.5));
      if (G.stamina <= 0) this.winded = true;
      if (this.winded) sprint = false;
      // the bar shows while you are short of breath, and goes once you have it back
      UI.stamina(G.stamina < 0.995 ? G.stamina : null);
    } else UI.stamina(null);
    if (sprint && this.crouched) this.crouched = false;
    const max = this.crouched ? 1.5 : sprint ? (G.sprintSpeed ?? 5.6) : 3.1;
    const len = Math.hypot(mx, mz);
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    let wx = 0, wz = 0;
    if (len > 0) { mx /= len; mz /= len; wx = (mx * c + mz * sn) * max; wz = (-mx * sn + mz * c) * max; }
    const acc = this.onGround ? 12 : 3;
    this.vel.x += (wx - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (wz - this.vel.z) * Math.min(1, dt * acc);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;

    // jumping and gravity
    if (canMove && input.hit("Space") && this.onGround && !UI.dialogOpen) { this.vy = 4.6; this.onGround = false; }
    this.vy -= 16 * dt;
    this.pos.y += this.vy * dt;
    if (w) {
      w.col.resolve(this.pos, this.radius, this.pos.y + 0.3, this.crouched ? 1.1 : 1.7);
      if (w.bounds) {
        const b = w.bounds;
        this.pos.x = clamp(this.pos.x, b.x0, b.x1); this.pos.z = clamp(this.pos.z, b.z0, b.z1);
      }
      if (w.constrain) w.constrain(this.pos);
      const gy = w.heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= gy) { this.pos.y = gy; this.vy = 0; this.onGround = true; }
      else if (this.pos.y - gy < 0.25 && this.vy <= 0) { this.pos.y = gy; this.vy = 0; this.onGround = true; }
      else this.onGround = false;
    }
    this.speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);

    // footsteps
    if (this.onGround && this.speed > 0.4) {
      this.stride += this.speed * dt;
      const every = sprint ? 1.6 : 1.25;
      if (this.stride > every) { this.stride = 0; if (!this.crouched) SFX.step(sprint); }
      this.bob += dt * this.speed * 2.2;
    }
    // breadcrumbs, so the one following you goes round corners rather than through them
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - this.pos.x, last.z - this.pos.z) > 0.6) {
      this.trail.push({ x: this.pos.x, z: this.pos.z });
      if (this.trail.length > 200) this.trail.shift();
    }

    // leaning: Q to the left, E to the right — the head goes, the feet stay
    let leanWant = 0;
    if (canMove && !sprint) { if (input.down("KeyQ")) leanWant -= 1; if (input.down("KeyE")) leanWant += 1; }
    if (leanWant && w) {
      // no leaning your head into a wall
      const rx = Math.cos(this.yaw) * leanWant, rz = -Math.sin(this.yaw) * leanWant;
      for (let d = 0.2; d <= 0.5; d += 0.15) if (w.col.solidAt(this.pos.x + rx * d, this.pos.y + this.eye, this.pos.z + rz * d, 0.12)) { leanWant *= (d - 0.2) / 0.3; break; }
    }
    this.lean += (leanWant - this.lean) * Math.min(1, dt * 9);
    const targetEye = this.seated ? 1.2 : this.crouched ? 1.05 : 1.62;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    // body
    if (this.model) {
      const m = this.model;
      m.root.position.set(this.pos.x, this.pos.y, this.pos.z);
      m.root.rotation.y = this.yaw + Math.PI;
      m.body.scale.y = (this.model.scaleBase ?? 1) * (this.crouched ? 0.7 : 1);
      // on a bench or a stool, your body sits too
      m.sitting += ((this.seated ? 1 : 0) - m.sitting) * Math.min(1, dt * 6);
      m.update(dt, this.seated ? 0 : this.speed);
      m.body.rotation.z = this.lean * 0.28;
      m.root.visible = G.settings.third || G.forceThird;
    }

    // the axe
    if (this.swingT >= 0) {
      this.swingT += dt;
      const T = this.swingT;
      if (this.axe) {
        // (pitch, yaw, roll) of the hands, and where they are: a level swing from right to left
        const e = x => x * x * (3 - 2 * x), L = (a, b, k) => a + (b - a) * k;
        const REST = [1.05, -0.35, -0.5, 0.3, -0.42, -0.4], BACK = [0.25, -1.25, 0.0, 0.42, -0.24, -0.26], HIT = [0.18, 0.75, 0.0, 0.1, -0.3, -0.46], THRU = [0.2, 1.6, 0.0, -0.12, -0.34, -0.36];
        const pose = (A, B, k) => { k = e(k); this.axe.rotation.set(L(A[0], B[0], k), L(A[1], B[1], k), L(A[2], B[2], k)); this.axe.position.set(L(A[3], B[3], k), L(A[4], B[4], k), L(A[5], B[5], k)); };
        if (T < 0.2) pose(REST, BACK, T / 0.2);
        else if (T < 0.29) pose(BACK, HIT, (T - 0.2) / 0.09);
        else if (T < 0.36) pose(HIT, THRU, (T - 0.29) / 0.07);
        else pose(THRU, REST, Math.min(1, (T - 0.36) / 0.3));
      }
      if (this.model) { this.model.setPose("chop"); this.model.poseT = T / 1.25 * 1; }
      if (T > 0.29 && !this._hitDone) { this._hitDone = true; this.onSwingHit && this.onSwingHit(); }
      if (T > 0.62) { this.swingT = -1; if (this.axe) this.axeRest(); if (this.model) this.model.setPose("idle"); }
    }
    // the sleeves follow wherever the hands have gone this frame
    if (this.axe) this.fitArms();
  }
  // where your eyes are, leaning included
  eyePos() {
    const l = this.lean * 0.5;
    return new THREE.Vector3(this.pos.x + Math.cos(this.yaw) * l, this.pos.y + this.eye - Math.abs(this.lean) * 0.08, this.pos.z - Math.sin(this.yaw) * l);
  }
}

// ---------------------------------------------------------------------------
//  the camera: over the eyes, or over the shoulder
// ---------------------------------------------------------------------------
const _cam = new THREE.Vector3();
function updateCamera(dt) {
  const p = G.player;
  const third = G.settings.third || G.forceThird;
  const bobY = third ? 0 : Math.sin(p.bob * 2) * 0.035 * Math.min(1, p.speed / 3);
  const bobX = third ? 0 : Math.cos(p.bob) * 0.025 * Math.min(1, p.speed / 3);
  camera.rotation.set(p.pitch, p.yaw, third ? 0 : -p.lean * 0.18);
  const eye = p.eyePos();
  if (!third) {
    camera.position.set(eye.x + bobX * Math.cos(p.yaw), eye.y + bobY, eye.z - bobX * Math.sin(p.yaw));
  } else {
    const back = new THREE.Vector3(0, 0, 1).applyEuler(camera.rotation);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(camera.rotation);
    const pivot = eye.clone().add(new THREE.Vector3(0, 0.15, 0));
    let dist = 3.1;
    const w = G.world;
    const ceil = w.ceilingAt ? w.ceilingAt(p.pos.x, p.pos.z) : Infinity;
    for (let d = 0.4; d <= 3.1; d += 0.15) {
      _cam.copy(pivot).addScaledVector(back, d).addScaledVector(right, 0.45 * Math.min(1, d / 1.5));
      if (w.col.solidAt(_cam.x, _cam.y, _cam.z, 0.2) || _cam.y > ceil - 0.15 || _cam.y < w.heightAt(_cam.x, _cam.z) + 0.2) { dist = Math.max(0.35, d - 0.2); break; }
    }
    camera.position.copy(pivot).addScaledVector(back, dist).addScaledVector(right, 0.45 * Math.min(1, dist / 1.5));
    // too close and the body would fill the lens
    if (p.model) p.model.root.visible = dist > 0.7;
  }
  if (p.axe) p.axe.visible = !third;
  // hold Z to look closer
  const zoomWant = G.mode === "play" && input.down("KeyZ") ? 1 : 0;
  G.zoom = (G.zoom || 0) + (zoomWant - (G.zoom || 0)) * Math.min(1, dt * 10);
  const fov = G.settings.fov + (28 - G.settings.fov) * G.zoom;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // the sun's shadow follows the player
  const sd = G.sunDir || new THREE.Vector3(0, 1, 0);
  sun.position.set(p.pos.x + sd.x * 90, p.pos.y + sd.y * 90, p.pos.z + sd.z * 90);
  sun.target.position.set(p.pos.x, p.pos.y, p.pos.z);
  sky.position.copy(camera.position);
}

// ---------------------------------------------------------------------------
//  finding a way round things
// ---------------------------------------------------------------------------
// People walk the way you would: round the table, not through it. A straight
// line is taken when it is clear; otherwise a small grid search finds the way
// and the corners are pulled tight so the walk still looks direct.
const NPC_R = 0.3, CELL = 0.5;
// would someone standing here be inside something? (the same height band you collide in)
function blockedAt(w, x, z, pad = NPC_R) {
  const y = w.heightAt(x, z);
  for (const o of w.col.near(x, z, pad + 0.5)) {
    if (o.disabled || y + 0.3 > o.y1 - 0.05 || y + 1.7 < o.y0) continue;
    if (o.type === "box") { if (x > o.x0 - pad && x < o.x1 + pad && z > o.z0 - pad && z < o.z1 + pad) return true; }
    else if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + pad) ** 2) return true;
  }
  return false;
}
// can one walk straight from a to b? (a start already against something is let off its first steps)
function clearLine(w, ax, az, bx, bz) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.ceil(l / 0.25);
  const startStuck = blockedAt(w, ax, az, NPC_R * 0.9);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (startStuck && t * l < 0.7) continue;
    if (blockedAt(w, ax + (bx - ax) * t, az + (bz - az) * t, NPC_R * 0.9)) return false;
  }
  return true;
}
// a way from (sx,sz) to (gx,gz) as a list of {x,z}; the last may be marked `near`
// when the goal itself is inside something and only the closest free spot is reached
function findPath(w, sx, sz, gx, gz) {
  if (!w || !w.col) return [{ x: gx, z: gz }];
  if (clearLine(w, sx, sz, gx, gz)) return [{ x: gx, z: gz }];
  const M = 8;
  const x0 = Math.min(sx, gx) - M, z0 = Math.min(sz, gz) - M;
  const nx = Math.ceil((Math.max(sx, gx) + M - x0) / CELL), nz = Math.ceil((Math.max(sz, gz) + M - z0) / CELL);
  if (nx * nz > 90000) return [{ x: gx, z: gz }];
  const cx = i => x0 + (i + 0.5) * CELL, cz = j => z0 + (j + 0.5) * CELL;
  const block = new Int8Array(nx * nz).fill(-1);
  const isBlocked = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return true;
    const k = i + j * nx;
    if (block[k] < 0) block[k] = blockedAt(w, cx(i), cz(j)) ? 1 : 0;
    return block[k] === 1;
  };
  const cellOf = (x, z) => [clamp(Math.floor((x - x0) / CELL), 0, nx - 1), clamp(Math.floor((z - z0) / CELL), 0, nz - 1)];
  const [si, sj] = cellOf(sx, sz);
  let [gi, gj] = cellOf(gx, gz), goalFree = !blockedAt(w, gx, gz);
  if (isBlocked(gi, gj)) {
    // the goal is inside something: aim for the nearest free cell round it
    let best = null;
    for (let r = 1; r <= 5 && !best; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r || isBlocked(gi + di, gj + dj)) continue;
      const d = Math.hypot(cx(gi + di) - gx, cz(gj + dj) - gz);
      if (!best || d < best.d) best = { i: gi + di, j: gj + dj, d };
    }
    if (!best) return [{ x: gx, z: gz }];
    gi = best.i; gj = best.j; goalFree = false;
  }
  // A* over the cells, eight ways, no cutting corners
  const N = nx * nz, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
  const heap = [];
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (i, j) => Math.hypot(i - gi, j - gj);
  const sk = si + sj * nx, gk = gi + gj * nx;
  gs[sk] = 0; push(sk, h(si, sj));
  let found = false, iter = 0;
  while (heap.length && iter++ < 40000) {
    const [, k] = pop();
    if (shut[k]) continue;
    shut[k] = 1;
    if (k === gk) { found = true; break; }
    const i = k % nx, j = (k / nx) | 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (isBlocked(ni, nj) && !(ni === si && nj === sj)) continue;
      if (di && dj && (isBlocked(i + di, j) || isBlocked(i, j + dj))) continue;
      const nk = ni + nj * nx, g = gs[k] + (di && dj ? 1.414 : 1);
      if (g < gs[nk]) { gs[nk] = g; from[nk] = k; push(nk, g + h(ni, nj)); }
    }
  }
  if (!found) return [{ x: gx, z: gz }];
  const cells = [];
  for (let k = gk; k !== -1 && k !== sk; k = from[k]) cells.unshift({ x: cx(k % nx), z: cz((k / nx) | 0) });
  if (goalFree) cells[cells.length - 1] = { x: gx, z: gz };
  // pull the string tight: from each corner, go to the farthest cell still in plain sight
  const out = [];
  let ax = sx, az = sz, i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearLine(w, ax, az, cells[j].x, cells[j].z)) j--;
    out.push(cells[j]); ax = cells[j].x; az = cells[j].z; i = j + 1;
  }
  if (!out.length) out.push({ x: gx, z: gz, ghost: true });
  if (!goalFree) {
    // close enough to step the last bit (onto a bench, up to a bed) without colliding
    const last = out[out.length - 1];
    if (Math.hypot(last.x - gx, last.z - gz) < 1.0) out.push({ x: gx, z: gz, ghost: true });
    else last.near = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
//  the people who are not you
// ---------------------------------------------------------------------------
export class Actor {
  constructor(opts, x, z, yaw = 0) {
    this.person = makePerson(opts);
    this.root = this.person.root;
    this.name = opts.name || "";
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw; this.targetYaw = yaw;
    this.speed = 0; this.path = []; this.resolve = null;
    this.walkSpeed = 1.4; this.follow = null; this.faceTarget = null;
    this.bob = 0; this.onUpdate = null;
    G.scene.add(this.root);
    if (G.world) G.world.actors.push(this);
    this.sync();
  }
  sync() {
    const w = G.world;
    this.pos.y = (w ? w.heightAt(this.pos.x, this.pos.z) : 0) + (this.yOff || 0);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
  place(x, z, yaw) { this.pos.x = x; this.pos.z = z; if (yaw !== undefined) { this.yaw = this.targetYaw = yaw; } this.path = []; this.sync(); }
  // walk a list of [x,z] points; resolves on arrival
  walk(points, speed = 1.4) {
    this.follow = null;
    this.path = points.map(p => ({ x: p[0], z: p[1] }));
    this.walkSpeed = speed;
    if (this.resolve) this.resolve();
    return new Promise(r => { this.resolve = r; });
  }
  walkTo(x, z, speed) { return this.walk([[x, z]], speed); }
  // a walking body is pushed out of whatever it brushes, and steps round you
  collide() {
    const w = G.world, p = this.pos;
    if (!w || !w.col) return;
    w.col.resolve(p, NPC_R, w.heightAt(p.x, p.z) + 0.3, 1.4);
    const pl = G.player;
    if (pl && pl.pos) {
      const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, d = Math.hypot(dx, dz), rr = NPC_R + (pl.radius || 0.3);
      if (d < rr && d > 1e-4) { p.x = pl.pos.x + dx / d * rr; p.z = pl.pos.z + dz / d * rr; }
    }
  }
  faceTo(x, z) { this.faceTarget = null; this.targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z); }
  facePlayer() { this.faceTarget = "player"; }
  stopFacing() { this.faceTarget = null; }
  followPlayer(dist = 2.2) { this.path = []; this.follow = { dist, idx: 0 }; }
  stopFollow() { this.follow = null; }
  lookAtPlayer(on = true) { this.lookP = on; }
  update(dt) {
    const p = this.pos;
    let moving = false, spd = 0;
    if (this.follow) {
      const pl = G.player, tr = pl.trail;
      const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      if (d > 30) { // lost you: catch up out of sight
        const back = tr[Math.max(0, tr.length - 5)];
        p.x = back.x; p.z = back.z;
      } else if (d > this.follow.dist) {
        // head for the oldest crumb still ahead of us that is in reach
        let target = null;
        for (let i = 0; i < tr.length; i++) {
          const c = tr[i];
          if (Math.hypot(c.x - pl.pos.x, c.z - pl.pos.z) < this.follow.dist) break;
          if (Math.hypot(c.x - p.x, c.z - p.z) < 0.8) { tr.splice(0, i + 1); i = -1; continue; }
          target = c; break;
        }
        if (!target) target = { x: pl.pos.x, z: pl.pos.z };
        const dx = target.x - p.x, dz = target.z - p.z, l = Math.hypot(dx, dz);
        spd = Math.min(Math.max(1.4, pl.speed * 1.05 + (d - this.follow.dist) * 0.6), 6);
        if (l > 0.05) { p.x += dx / l * spd * dt; p.z += dz / l * spd * dt; this.targetYaw = Math.atan2(dx, dz); moving = true; this.collide(); }
      } else { this.targetYaw = Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z); }
    } else if (this.path.length) {
      const t = this.path[0];
      // plan the way to the next point the first time we head for it, or again when stuck
      if (this.stepsFor !== t) { this.steps = findPath(G.world, p.x, p.z, t.x, t.z); this.stepsFor = t; this.stuck = 0; this.replans = this.replans && this.lastFor === t ? this.replans : 0; this.lastFor = t; this.bestD = Infinity; }
      const st = this.steps[0];
      const dx = st.x - p.x, dz = st.z - p.z, l = Math.hypot(dx, dz);
      spd = this.walkSpeed;
      const arrive = () => {
        this.path.shift(); this.steps = []; this.stepsFor = null; this.replans = 0;
        if (!this.path.length && this.resolve) { const r = this.resolve; this.resolve = null; r(); }
      };
      if (l < 0.12 + spd * dt || (st.near && l < 0.45)) {
        if (!st.near) { p.x = st.x; p.z = st.z; }
        this.steps.shift(); this.bestD = Infinity; this.stuck = 0;
        if (!this.steps.length) arrive();
      } else {
        p.x += dx / l * spd * dt; p.z += dz / l * spd * dt; this.targetYaw = Math.atan2(dx, dz); moving = true;
        if (!st.ghost) this.collide();
        // no headway for a while (someone in the doorway, a door just shut): look again, and in the end give up here
        if (l < this.bestD - 0.05) { this.bestD = l; this.stuck = 0; }
        else if (Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z) > 1.3) this.stuck += dt;
        if (this.stuck > 1.2) {
          this.replans = (this.replans || 0) + 1;
          if (this.replans > 3) { moving = false; arrive(); }
          else this.stepsFor = null;
        }
      }
    }
    if (!moving && this.faceTarget === "player") this.targetYaw = Math.atan2(G.player.pos.x - p.x, G.player.pos.z - p.z);
    this.yaw += angDiff(this.yaw, this.targetYaw) * Math.min(1, dt * 6);
    // a head turned toward whoever is talking to them
    if (this.lookP) {
      const a = Math.atan2(G.player.pos.x - p.x, G.player.pos.z - p.z);
      this.person.look = clamp(angDiff(this.yaw, a), -1, 1);
    } else this.person.look = 0;
    this.speed = moving ? spd : (this.forcedSpeed || 0);
    this.person.update(dt, this.speed);
    if (this.onUpdate) this.onUpdate(dt);
    this.sync();
  }
  remove() {
    G.scene.remove(this.root);
    if (G.world) { const a = G.world.actors; const i = a.indexOf(this); if (i >= 0) a.splice(i, 1); }
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(); }
  }
  hold(obj, left = false) { (left ? this.person.heldL : this.person.held).add(obj); return obj; }
  headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.75 * (this.person.body.scale.y), this.pos.z); }
}

// ---------------------------------------------------------------------------
//  interaction: the thing in front of you
// ---------------------------------------------------------------------------
// An interactable is {x, y, z, label, use, can?, hold?, reach?}. The nearest
// one you are looking roughly at wins; one with `hold` needs E kept down.
function pickInteract() {
  const w = G.world, p = G.player;
  if (!w || UI.dialogOpen || G.cine || G.lockMove) return null;
  const eye = p.eyePos();
  const fwd = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  let best = null, bestScore = Infinity;
  for (const it of w.interact) {
    if (it.can && !it.can()) continue;
    // a long thing (a strip of field) can be used from anywhere along it: aim at its nearest point
    let ix = it.x, iz = it.z;
    if (it.seg) {
      const [x0, z0, x1, z1] = it.seg, ex = x1 - x0, ez = z1 - z0;
      const t = Math.max(0, Math.min(1, ((p.pos.x - x0) * ex + (p.pos.z - z0) * ez) / (ex * ex + ez * ez || 1)));
      ix = x0 + ex * t; iz = z0 + ez * t;
    }
    const dx = ix - p.pos.x, dz = iz - p.pos.z, d = Math.hypot(dx, dz);
    const reach = it.reach ?? 2.3;
    if (d > reach) continue;
    const to = new THREE.Vector3(ix - eye.x, (it.y ?? 1) - eye.y, iz - eye.z).normalize();
    const dot = to.dot(fwd);
    if (dot < (d < 1 ? 0.2 : 0.72)) continue;
    const score = d * (2 - dot);
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}
const crossEl = () => document.getElementById("crosshair");
let crossFlash = 0;
function updateInteract(dt) {
  const it = pickInteract();
  // the cursor: pale at rest, yellow over something usable, turning slowly to green as you use it
  const ch = crossEl();
  if (ch) {
    let k = 0;                                          // 0 yellow .. 1 green
    if (it && it.hold) k = clamp(G.holdT / it.hold, 0, 1);
    if (it && (input.hit("KeyF") || input.rclick) && !it.hold) crossFlash = 1;
    if (G.player && G.player.swingT >= 0) crossFlash = Math.max(crossFlash, 1 - G.player.swingT / 0.62);
    crossFlash = Math.max(0, crossFlash - dt * 2.2);
    k = Math.max(k, crossFlash);
    ch.classList.toggle("active", !!it);
    if (!it && k <= 0.01) ch.style.removeProperty("--cc");
    else {
      const r = Math.round(240 + (127 - 240) * k), g = Math.round(206 + (224 - 206) * k), b = Math.round(70 + (122 - 70) * k);
      ch.style.setProperty("--cc", `rgb(${r},${g},${b})`);
    }
  }
  if (it !== G.interactTarget) { G.holdT = 0; G.interactTarget = it; }
  if (!it) { UI.prompt(null); UI.hold(0); return; }
  const label = typeof it.label === "function" ? it.label() : it.label;
  UI.prompt(label, !!it.hold);
  if (it.hold) {
    if (input.down("KeyF") || input.rdown) {
      G.holdT += dt;
      if (it.onHoldTick) it.onHoldTick(dt, G.holdT);
      UI.hold(G.holdT / it.hold);
      if (G.holdT >= it.hold) { G.holdT = 0; UI.hold(0); it.use(); }
    } else { G.holdT = Math.max(0, G.holdT - dt * 2); UI.hold(G.holdT / it.hold); }
  } else if (input.hit("KeyF") || input.rclick) it.use();
}

// ---------------------------------------------------------------------------
//  the objective marker
// ---------------------------------------------------------------------------
const _mv = new THREE.Vector3();
function updateMarker() {
  const m = G.marker;
  if (!m || G.mode !== "play" || G.cine) { UI.marker(0, 0, 0, false); return; }
  const target = m.actor ? m.actor.headPos().add(new THREE.Vector3(0, 0.35, 0)) : new THREE.Vector3(m.x, m.y ?? 1.8, m.z);
  const dist = Math.hypot(target.x - G.player.pos.x, target.z - G.player.pos.z);
  if (dist < (m.hideWithin ?? 2.5)) { UI.marker(0, 0, 0, false); return; }
  _mv.copy(target).project(camera);
  let behind = _mv.z > 1;
  let sx = _mv.x, sy = _mv.y;
  if (behind) { sx = -sx; sy = -sy; }
  const edge = behind || Math.abs(sx) > 0.92 || Math.abs(sy) > 0.88;
  if (edge) {
    if (behind) sy = Math.min(sy, -0.5);
    const k = Math.max(Math.abs(sx) / 0.92, Math.abs(sy) / 0.88);
    sx /= k; sy /= k;
  }
  UI.marker((sx * 0.5 + 0.5) * innerWidth, (-sy * 0.5 + 0.5) * innerHeight, dist, true, edge);
}

// ---------------------------------------------------------------------------
//  the minimap: north up, you in the middle, forty metres each way
// ---------------------------------------------------------------------------
let mmT = 0, mmCtx = null;
// ---- exploration: the map only shows what you have been near ----
const EXPLORE_CELL = 6, EXPLORE_R = 30;
let explored = {}, exploreDirty = false, exploreT = 0, exploreSaveT = 0;
try { explored = Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem("reckoning.explored.v1") || "{}")).map(([k, v]) => [k, new Set(v)])); } catch (e) { explored = {}; }
function exploredSet() { const k = G.world && G.world.name; if (!k) return null; return explored[k] || (explored[k] = new Set()); }
function updateExplore(dt) {
  exploreT -= dt; exploreSaveT -= dt;
  if (exploreT <= 0 && G.world && G.player) {
    exploreT = 0.3;
    const s = exploredSet(), p = G.player.pos, C = EXPLORE_CELL, n = Math.ceil(EXPLORE_R / C);
    const cx = Math.floor(p.x / C), cz = Math.floor(p.z / C);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      if ((i * i + j * j) * C * C > EXPLORE_R * EXPLORE_R) continue;
      const k = (cx + i) + "," + (cz + j);
      if (!s.has(k)) { s.add(k); exploreDirty = true; }
    }
  }
  if (exploreDirty && exploreSaveT <= 0) {
    exploreSaveT = 3; exploreDirty = false;
    try { localStorage.setItem("reckoning.explored.v1", JSON.stringify(Object.fromEntries(Object.entries(explored).map(([k, v]) => [k, [...v]])))); } catch (e) {}
  }
}
G.forgetExplored = () => { explored = {}; try { localStorage.removeItem("reckoning.explored.v1"); } catch (e) {} };
// cover what has not been seen with blank parchment, its edge soft as if the ink ran out
let fogCv = null;
function drawFog(c, X, Z, S) {
  const s = exploredSet(); if (!s) return;
  const W = c.canvas.width, H = c.canvas.height;
  if (!fogCv) fogCv = document.createElement("canvas");
  if (fogCv.width !== W || fogCv.height !== H) { fogCv.width = W; fogCv.height = H; }
  const f = fogCv.getContext("2d");
  f.globalCompositeOperation = "source-over"; f.filter = "none";
  f.clearRect(0, 0, W, H);
  fillPaper(f, W, H);
  f.globalCompositeOperation = "destination-out";
  f.filter = `blur(${Math.max(2, EXPLORE_CELL * S * 0.6)}px)`;
  f.fillStyle = "#000";
  const C = EXPLORE_CELL, r = C * S * 0.95;
  for (const k of s) {
    const [i, j] = k.split(",").map(Number);
    const x = X((i + 0.5) * C), y = Z((j + 0.5) * C);
    if (x < -r || y < -r || x > W + r || y > H + r) continue;
    f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill();
  }
  c.drawImage(fogCv, 0, 0, W, H);
}

// the map, at any size: the world's own drawing, then buildings, people, the objective, and you
export function drawMap(c, X, Z, S, big, cx, cz, radius) {
  const W = c.canvas.width, H = c.canvas.height, w = G.world, p = G.player.pos;
  fillPaper(c, W, H);
  if (w.minimap) w.minimap(c, X, Z, S, big);
  // buildings and walls: everything solid and taller than a person, in red with an ink edge
  c.fillStyle = TOWN; c.strokeStyle = INK; c.lineWidth = 0.8;
  for (const o of w.col.near(cx, cz, radius)) {
    if (o.disabled || o.type !== "box" || o.x1 - o.x0 > 400) continue;
    const x = X(o.x0), y = Z(o.z0), ww = (o.x1 - o.x0) * S, hh = (o.z1 - o.z0) * S;
    if (o.y1 >= 1.5) { c.fillRect(x, y, ww, hh); c.strokeRect(x, y, ww, hh); }
    else { c.fillStyle = "rgba(90,70,50,0.55)"; c.fillRect(x, y, ww, hh); c.fillStyle = TOWN; }
  }
  // what you have not seen is still blank parchment
  drawFog(c, X, Z, S);
  if (big && w.mapLabels) w.mapLabels(c, X, Z, S, exploredSet());
  // people
  for (const a of w.actors) {
    if (!big && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) > radius) continue;
    const guard = a.name === "Watchman";
    c.fillStyle = guard ? "#b3261e" : a.isSibling ? "#2e6a40" : "#6a5a48";
    c.strokeStyle = "#f3e7c6"; c.lineWidth = 1;
    c.beginPath(); c.arc(X(a.pos.x), Z(a.pos.z), guard || a.isSibling ? 3.6 : 2.4, 0, Math.PI * 2); c.fill(); c.stroke();
    if (guard) {    // which way they are looking
      c.strokeStyle = "rgba(179,38,30,0.55)"; c.lineWidth = 1.5; c.beginPath();
      c.moveTo(X(a.pos.x), Z(a.pos.z)); c.lineTo(X(a.pos.x + Math.sin(a.yaw) * 7), Z(a.pos.z + Math.cos(a.yaw) * 7)); c.stroke();
    }
  }
  // the objective: a gold diamond, held to the edge of the minimap when it is further
  const m = G.marker;
  if (m) {
    const t = m.actor ? m.actor.pos : m;
    let mx = X(t.x), mz = Z(t.z);
    if (!big) { const R = W / 2, dx = mx - R, dz = mz - R, d = Math.hypot(dx, dz); if (d > R - 9) { mx = R + dx / d * (R - 9); mz = R + dz / d * (R - 9); } }
    c.fillStyle = "#c8962e"; c.strokeStyle = INK; c.lineWidth = 1.2;
    c.save(); c.translate(mx, mz); c.rotate(Math.PI / 4); c.fillRect(-4.5, -4.5, 9, 9); c.strokeRect(-4.5, -4.5, 9, 9); c.restore();
  }
  you(c, X(p.x), Z(p.z), G.player.yaw, big ? 1.3 : 1);
}
function updateMinimap(dt) {
  mmT -= dt; if (mmT > 0) return; mmT = 1 / 15;
  const cv = document.getElementById("minimap"); if (!cv) return;
  const c = mmCtx || (mmCtx = cv.getContext("2d"));
  const W = cv.width, R = W / 2, S = R / 40;      // pixels per metre
  const p = G.player.pos;
  const X = x => R + (x - p.x) * S, Z = z => R + (z - p.z) * S;
  drawMap(c, X, Z, S, false, p.x, p.z, 58);
  // an inked rim
  c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(R, R, R - 1.5, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = "rgba(59,42,26,0.5)"; c.lineWidth = 1; c.beginPath(); c.arc(R, R, R - 6, 0, Math.PI * 2); c.stroke();
}

// ---------------------------------------------------------------------------
//  worlds
// ---------------------------------------------------------------------------
export function setWorld(w) {
  if (G.world) G.world.dispose();
  G.world = w;
  G.scene.add(w.root);
  G.interactTarget = null;
}

// ---------------------------------------------------------------------------
//  the frame
// ---------------------------------------------------------------------------
export function frame(dt, skipRender) {
  updateExplore(dt);
  window.__frame = frame;
  G.time += dt;
  const w = G.world;
  if (G.mode === "play" && w) {
    if (!G.player.frozen) G.player.update(dt);
    for (const a of w.actors.slice()) a.update(dt);
    if (w.update) w.update(dt);
    for (const f of w.flames) flicker(f, dt);
    G.bugs.update(dt, G.player, () => AUDIO.buzz());
    // triggers
    for (const t of w.triggers.slice()) {
      if (t.done) continue;
      const p = G.player.pos;
      const inside = t.r ? Math.hypot(p.x - t.x, p.z - t.z) < t.r : (p.x > t.x0 && p.x < t.x1 && p.z > t.z0 && p.z < t.z1);
      if (inside && (!t.cond || t.cond())) { if (t.once !== false) t.done = true; t.fn(); }
    }
    for (const f of G.onFrame.slice()) f(dt);
    updateInteract(dt);
    // the axe swings on a click, when there is an axe
    if (input.click && G.player.axe && !UI.dialogOpen && !G.cine && G.onSwing && !(G.town && G.town.planning)) G.player.swing(G.onSwing);
    // move dialogue on
    if (UI.dialogOpen && (input.hit("Space") || input.hit("Enter") || input.hit("KeyF") || input.click)) UI.advance();
    if (input.hit("KeyV")) { G.settings.third = !G.settings.third; UI.hint(G.settings.third ? "Camera: over the shoulder" : "Camera: first person", 1.6); G.saveSettings && G.saveSettings(); }
  } else if (w) {
    for (const f of w.flames) flicker(f, dt * 0.2);
  }
  if (G.player && w) updateCamera(dt);
  updateMarker();
  if (G.mode === "play" && w) updateMinimap(dt);
  input.endFrame();
  if (!skipRender) renderer.render(G.scene, camera);
}

// Base for a map: the root group, its collision, and what lives in it.
export class WorldBase {
  constructor(Collision) {
    this.root = new THREE.Group();
    this.col = new Collision();
    this.interact = []; this.triggers = []; this.actors = []; this.flames = []; this.lights = [];
    this.bounds = null;
  }
  heightAt() { return 0; }
  ceilingAt() { return Infinity; }
  addInteract(it) { this.interact.push(it); return it; }
  removeInteract(it) { const i = this.interact.indexOf(it); if (i >= 0) this.interact.splice(i, 1); }
  addTrigger(t) { this.triggers.push(t); return t; }
  dispose() {
    for (const a of this.actors.slice()) a.remove();
    G.scene.remove(this.root);
    // free what this map made for itself; the shared shapes and colours stay
    this.root.traverse(o => {
      if (o.geometry && !o.geometry._shared) o.geometry.dispose();
      const m = o.material;
      if (m && m.map) m.map.dispose();
    });
  }
}
