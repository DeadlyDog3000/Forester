// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The game underneath the story: input, the body you walk around in, the
// people who walk around with you, the camera over (or behind) your eyes, and
// the one thing in front of you that E would do something to.

import { THREE, renderer, camera, clamp, lerp, angDiff, makeSky, flicker, MAT } from "./core.js";
import { makePerson, makeAxe } from "./models.js";
import { UI } from "./ui.js";

/* global SFX */

// ---------------------------------------------------------------------------
//  input
// ---------------------------------------------------------------------------
export const input = {
  keys: new Set(), pressed: new Set(), mdx: 0, mdy: 0, click: false, mouseDown: false,
  down(code) { return this.keys.has(code); },
  hit(code) { return this.pressed.has(code); },
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; this.click = false; },
};
addEventListener("keydown", e => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  if (!input.keys.has(e.code)) input.pressed.add(e.code);
  input.keys.add(e.code);
  if (["Space", "Tab"].includes(e.code) && G.mode === "play") e.preventDefault();
});
addEventListener("keyup", e => input.keys.delete(e.code));
addEventListener("blur", () => input.keys.clear());
addEventListener("mousemove", e => {
  if (document.pointerLockElement) { input.mdx += e.movementX; input.mdy += e.movementY; }
});
addEventListener("mousedown", e => { if (e.button === 0) { input.click = true; input.mouseDown = true; } });
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
};
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
G.scene.add(sky, sun, sun.target, hemi);
G.scene.fog = new THREE.Fog(0xc9d6e0, 30, 260);
G.sun = sun; G.hemi = hemi; G.sky = sky;

const C = h => new THREE.Color(h);
export const ATMO = {
  evening:   { sun: [0.55, 0.28, 0.4], sunC: 0xffb070, sunI: 2.4, hemiS: 0xa6b4d8, hemiG: 0x5a4632, hemiI: 0.75, fog: 0xd8a888, near: 40, far: 240, top: 0x3d5b93, mid: 0xf0b48a, bot: 0x8a6f60, stars: 0, win: 0.9, exp: 1.0 },
  dusk:      { sun: [-0.5, 0.08, 0.6], sunC: 0xff8050, sunI: 1.2, hemiS: 0x6a70a0, hemiG: 0x3a2e28, hemiI: 0.5, fog: 0x7a6a78, near: 25, far: 180, top: 0x1e2850, mid: 0xc0705a, bot: 0x40353a, stars: 0.25, win: 1.6, exp: 1.05 },
  night:     { sun: [0.3, 0.7, -0.4], sunC: 0x7f95c8, sunI: 0.35, hemiS: 0x33406a, hemiG: 0x121014, hemiI: 0.28, fog: 0x0e121e, near: 10, far: 90, top: 0x05070f, mid: 0x141b30, bot: 0x0a0a10, stars: 1, win: 2.2, exp: 1.1 },
  dawn:      { sun: [-0.2, 0.18, 0.9], sunC: 0xffc6a0, sunI: 0.9, hemiS: 0x9aa4b8, hemiG: 0x4a4440, hemiI: 0.6, fog: 0xa8a8b0, near: 8, far: 110, top: 0x5a6a88, mid: 0xc8b4b0, bot: 0x7a7478, stars: 0, win: 0.4, exp: 1.0 },
  mist:      { sun: [-0.2, 0.22, 0.9], sunC: 0xc8c8d0, sunI: 0.45, hemiS: 0x7a8494, hemiG: 0x3a3634, hemiI: 0.45, fog: 0x6a707a, near: 4, far: 55, top: 0x4a5462, mid: 0x7a808a, bot: 0x5a5c60, stars: 0, win: 0.9, exp: 1.0 },
  afternoon: { sun: [0.4, 0.62, 0.35], sunC: 0xfff0d0, sunI: 2.6, hemiS: 0xbcd0f0, hemiG: 0x4a4a30, hemiI: 0.85, fog: 0xa8b8b0, near: 30, far: 200, top: 0x4a78b5, mid: 0xc9d6e0, bot: 0x8a9a88, stars: 0, win: 0, exp: 1.0 },
  morning:   { sun: [-0.5, 0.42, 0.5], sunC: 0xffe6c0, sunI: 2.3, hemiS: 0xbcd0f0, hemiG: 0x4a4a30, hemiI: 0.8, fog: 0xb8c4c0, near: 30, far: 200, top: 0x5a88c0, mid: 0xdde4e0, bot: 0x8a9a88, stars: 0, win: 0, exp: 1.0 },
  firelight: { sun: [0.3, 0.6, -0.4], sunC: 0x6a7ab0, sunI: 0.28, hemiS: 0x2a3050, hemiG: 0x14100c, hemiI: 0.3, fog: 0x0c0e16, near: 12, far: 100, top: 0x060812, mid: 0x1a1e34, bot: 0x0a0a10, stars: 1, win: 2.2, exp: 1.15 },
};
function applyAtmo(a) {
  sun.color.copy(a.sunC); sun.intensity = a.sunI;
  G.sunDir = a.sun.clone ? a.sun.clone().normalize() : new THREE.Vector3(...a.sun).normalize();
  hemi.color.copy(a.hemiS); hemi.groundColor.copy(a.hemiG); hemi.intensity = a.hemiI;
  G.scene.fog.color.copy(a.fog); G.scene.fog.near = a.near; G.scene.fog.far = a.far;
  const u = sky.material.uniforms;
  u.top.value.copy(a.top); u.mid.value.copy(a.mid); u.bottom.value.copy(a.bot);
  u.sunDir.value.copy(G.sunDir); u.sunCol.value.copy(a.sunC).multiplyScalar(Math.min(1, a.sunI / 2));
  sky.userData.stars.material.opacity = a.stars;
  MAT.lit.emissiveIntensity = a.win;
  renderer.toneMappingExposure = a.exp;
}
const toLive = p => ({ ...p, sun: new THREE.Vector3(...p.sun), sunC: C(p.sunC), hemiS: C(p.hemiS), hemiG: C(p.hemiG), fog: C(p.fog), top: C(p.top), mid: C(p.mid), bot: C(p.bot) });
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
    this.carryN = 0;
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
  giveAxe(on) {
    if (on && !this.axe) {
      this.axe = makeAxe();
      this.axe.scale.setScalar(1);
      camera.add(this.axe);
      this.axeRest();
      // and one in the hand of your body, for when the camera is behind you
      this.axeBody = makeAxe(); this.axeBody.rotation.x = Math.PI / 2; this.axeBody.position.set(0, 0, 0);
      this.model.held.add(this.axeBody);
    } else if (!on && this.axe) { camera.remove(this.axe); this.axe = null; if (this.axeBody) this.model.held.remove(this.axeBody); this.axeBody = null; }
  }
  axeRest() { this.axe.position.set(0.32, -0.62, -0.55); this.axe.rotation.set(-0.35, -0.25, -0.15); }
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
      this.yaw -= input.mdx * 0.0022 * s.sens;
      this.pitch -= input.mdy * 0.0022 * s.sens * (s.invert ? -1 : 1);
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
    const sprint = (input.down("ShiftLeft") || input.down("ShiftRight")) && !this.crouched;
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

    const targetEye = this.seated ? 1.2 : this.crouched ? 1.05 : 1.62;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    // body
    if (this.model) {
      const m = this.model;
      m.root.position.set(this.pos.x, this.pos.y, this.pos.z);
      m.root.rotation.y = this.yaw + Math.PI;
      m.body.scale.y = (this.model.scaleBase ?? 1) * (this.crouched ? 0.7 : 1);
      m.update(dt, this.speed);
      m.root.visible = G.settings.third || G.forceThird;
    }

    // the axe
    if (this.swingT >= 0) {
      this.swingT += dt;
      const T = this.swingT;
      if (this.axe) {
        if (T < 0.16) { const k = T / 0.16; this.axe.rotation.set(-0.35 + k * 1.3, -0.25, -0.15 - k * 0.2); this.axe.position.set(0.32, -0.62 + k * 0.25, -0.55); }
        else if (T < 0.3) { const k = (T - 0.16) / 0.14; this.axe.rotation.set(0.95 - k * 2.3, -0.25 + k * 0.2, -0.35); this.axe.position.set(0.32 - k * 0.18, -0.37 - k * 0.2, -0.55 - k * 0.2); }
        else { const k = Math.min(1, (T - 0.3) / 0.3); this.axe.rotation.set(-1.35 + k, -0.05 - k * 0.2, -0.35 + k * 0.2); this.axe.position.set(0.14 + k * 0.18, -0.57 - k * 0.05, -0.75 + k * 0.2); }
      }
      if (this.model) { this.model.setPose("chop"); this.model.poseT = T / 1.25 * 1; }
      if (T > 0.26 && !this._hitDone) { this._hitDone = true; this.onSwingHit && this.onSwingHit(); }
      if (T > 0.62) { this.swingT = -1; if (this.axe) this.axeRest(); if (this.model) this.model.setPose("idle"); }
    }
  }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }
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
  camera.rotation.set(p.pitch, p.yaw, 0);
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
  if (camera.fov !== G.settings.fov) { camera.fov = G.settings.fov; camera.updateProjectionMatrix(); }
  // the sun's shadow follows the player
  const sd = G.sunDir || new THREE.Vector3(0, 1, 0);
  sun.position.set(p.pos.x + sd.x * 90, p.pos.y + sd.y * 90, p.pos.z + sd.z * 90);
  sun.target.position.set(p.pos.x, p.pos.y, p.pos.z);
  sky.position.copy(camera.position);
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
        if (l > 0.05) { p.x += dx / l * spd * dt; p.z += dz / l * spd * dt; this.targetYaw = Math.atan2(dx, dz); moving = true; }
      } else { this.targetYaw = Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z); }
    } else if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz);
      spd = this.walkSpeed;
      if (l < 0.12 + spd * dt) {
        p.x = t.x; p.z = t.z; this.path.shift();
        if (!this.path.length && this.resolve) { const r = this.resolve; this.resolve = null; r(); }
      } else { p.x += dx / l * spd * dt; p.z += dz / l * spd * dt; this.targetYaw = Math.atan2(dx, dz); moving = true; }
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
    const dx = it.x - p.pos.x, dz = it.z - p.pos.z, d = Math.hypot(dx, dz);
    const reach = it.reach ?? 2.3;
    if (d > reach) continue;
    const to = new THREE.Vector3(it.x - eye.x, (it.y ?? 1) - eye.y, it.z - eye.z).normalize();
    const dot = to.dot(fwd);
    if (dot < (d < 1 ? 0.2 : 0.72)) continue;
    const score = d * (2 - dot);
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}
function updateInteract(dt) {
  const it = pickInteract();
  if (it !== G.interactTarget) { G.holdT = 0; G.interactTarget = it; }
  if (!it) { UI.prompt(null); UI.hold(0); return; }
  const label = typeof it.label === "function" ? it.label() : it.label;
  UI.prompt(label, !!it.hold);
  if (it.hold) {
    if (input.down("KeyE")) {
      G.holdT += dt;
      if (it.onHoldTick) it.onHoldTick(dt, G.holdT);
      UI.hold(G.holdT / it.hold);
      if (G.holdT >= it.hold) { G.holdT = 0; UI.hold(0); it.use(); }
    } else { G.holdT = Math.max(0, G.holdT - dt * 2); UI.hold(G.holdT / it.hold); }
  } else if (input.hit("KeyE")) it.use();
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
export function frame(dt) {
  window.__frame = frame;
  G.time += dt;
  const w = G.world;
  if (G.mode === "play" && w) {
    if (!G.player.frozen) G.player.update(dt);
    for (const a of w.actors.slice()) a.update(dt);
    if (w.update) w.update(dt);
    for (const f of w.flames) flicker(f, dt);
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
    if (input.click && G.player.axe && !UI.dialogOpen && !G.cine && G.onSwing) G.player.swing(G.onSwing);
    // move dialogue on
    if (UI.dialogOpen && (input.hit("Space") || input.hit("Enter") || input.hit("KeyE") || input.click)) UI.advance();
    if (input.hit("KeyV")) { G.settings.third = !G.settings.third; UI.hint(G.settings.third ? "Camera: over the shoulder" : "Camera: first person", 1.6); G.saveSettings && G.saveSettings(); }
  } else if (w) {
    for (const f of w.flames) flicker(f, dt * 0.2);
  }
  if (G.player && w) updateCamera(dt);
  updateMarker();
  input.endFrame();
  renderer.render(G.scene, camera);
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
    this.root.traverse(o => { if (o.geometry && !o.geometry._shared) o.geometry.dispose(); });
  }
}
