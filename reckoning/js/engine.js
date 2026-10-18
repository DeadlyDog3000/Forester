// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The game underneath the story: input, the body you walk around in, the
// people who walk around with you, the camera over (or behind) your eyes, and
// the one thing in front of you that E would do something to.

import "./keys.js";   // (first: your own keys turned into the game's before anything else hears them)
import { THREE, renderer, camera, clamp, lerp, angDiff, makeSky, flicker, MAT, AUTO_FULL, noSnow, RELIEF, RIM, addDetail, ownGrain, NOTCH_M, NOTCH_P } from "./core.js";
import { renderFrame, post } from "./post.js";
export { post };
import { addBayonet, makeMusket, makePistol, makeCrossbow, shoulderArm, pikeHold } from "./models.js";
import { LOAD, loadPose, loadSteps, rodEnds } from "./reload.js";
import { powderSmoke, muzzleFlash, panPuff } from "./powder.js";
import { makePerson, makeAxe, makeArm, makeSaw, makeHammer, makeKnife, makeFood, makeSpade, makeLadle, makeSpatula, makeSickle, modelCopy, setToolSource, makeOwnArm , makeHorse } from "./models.js";
import { fillPaper, you, INK, TOWN } from "./map.js";
import { UI } from "./ui.js";
import { Bugs } from "./bugs.js";
import { AUDIO } from "./audio.js";
import { FOLEY } from "./foley.js";
import { tickTemperature } from "./temperature.js";
import { roomFor, freshBody, practise, damageTaken, rattle, healDelay, healRate, staminaDrain, aimSteady, hungerTick, ILLS, BODY_SKILLS, ROCKS, ITEM, TIER_NAME, skillK, loseSkills, wearTool } from "./body.js";
// (what's only ever thrust, never swung: the spear, and a musket with its bayonet fixed)
const THRUST = new Set(["spear", "bayonet"]);
// the materials of your own arms on the screen: one set, shared by every way you hold anything, painted to your body
const ARMS_M = { skin: new THREE.MeshStandardMaterial({ color: 0xe8c4a0, roughness: 0.6 }), sleeve: new THREE.MeshStandardMaterial({ color: 0x4d5a3c, roughness: 0.95 }), cuff: new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.95 }) };

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
  // (Ctrl is crouch: in play, none of the browser's own Ctrl shortcuts — save the page, find, bookmark, print — go off
  //  as you crouch and walk)
  if (e.ctrlKey && !e.metaKey && !e.altKey && G.mode === "play" && /^Key[A-Z]$|^Digit\d$/.test(e.code)) e.preventDefault();
});
addEventListener("keyup", e => input.keys.delete(e.code));
addEventListener("blur", () => input.keys.clear());
// the cursor gone off the page stops free look turning at the edge
document.addEventListener("mouseleave", () => { input.mx = input.my = -1; });
// (the browser now and then reports one false, enormous movement — just as the mouse is locked or let go, or when the
//  window regains focus — and that turned you right round in an instant. Such a jump, and anything in the first moments
//  after the lock changes, is let go; real hand movement never comes in one leap that size)
let lockChangedAt = 0;
document.addEventListener("pointerlockchange", () => { lockChangedAt = performance.now(); });
addEventListener("focus", () => { lockChangedAt = performance.now(); });
addEventListener("mousemove", e => {
  input.mx = e.clientX; input.my = e.clientY;
  if (performance.now() - lockChangedAt < 120) return;
  if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
  if (document.pointerLockElement || (input.freeLook && G.mode === "play")) { input.mdx += e.movementX; input.mdy += e.movementY; }
});
// (a click is a swing, a shot, a bite only when it's on the world itself: one on a map, a menu, a list or any window
//  over the game is that window's, and nothing in your hand is used)
const onWorld = e => !!document.pointerLockElement || e.target === renderer.domElement || e.target === window;
addEventListener("mousedown", e => { if (!onWorld(e)) return; if (e.button === 0) { input.click = true; input.mouseDown = true; } if (e.button === 2) { input.rclick = true; input.rdown = true; } });
addEventListener("mouseup", e => { if (e.button === 2) input.rdown = false; });
addEventListener("contextmenu", e => { if (G.mode === "play") e.preventDefault(); });
addEventListener("mouseup", e => { if (e.button === 0) input.mouseDown = false; });

// ---------------------------------------------------------------------------
//  the game object everything shares
// ---------------------------------------------------------------------------
// how much quicker a path is to walk on, for you and for everyone
const PATH_SPEED = 1.25;
export const G = {
  mode: "title",        // title | play | pause
  scene: new THREE.Scene(),
  world: null, player: null,
  settings: { sens: 1, fov: 72, invert: false, volume: 0.7, music: true, third: false, gore: true },
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
window.__G = G;
// the first Forester's sound engine (../sfx.js) is a global of the page, not a property of window: this reaches it
// for a module that has a name of its own in the way
export const sfxEngine = () => (typeof SFX !== "undefined" ? SFX : null);   // (for the sound, to know where you stand and which way you face)

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
// (a shadow is shade, not a hole: the sky still lights what the sun can't reach)
sun.shadow.intensity = 0.8;
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a3f30, 0.8);
// a low fill, so a room lit by one candle is dim rather than black
const fill = new THREE.AmbientLight(0xffdcb8, 0.1);
G.scene.add(sky, sun, sun.target, hemi, camera, fill);   // the camera too, so what it carries (the axe) is drawn
G.scene.fog = new THREE.Fog(0xc9d6e0, 30, 260);
G.sun = sun; G.hemi = hemi; G.sky = sky; G.fill = fill;

const C = h => new THREE.Color(h);
export const ATMO = {
  evening:   { sun: [0.55, 0.28, 0.4], sunC: 0xffb070, sunI: 2.4, hemiS: 0xa6b4d8, hemiG: 0x6a543a, hemiI: 0.9, fog: 0xd8a888, near: 40, far: 240, top: 0x3d5b93, mid: 0xf0b48a, bot: 0x8a6f60, stars: 0, win: 0.9, exp: 1.1 },
  dusk:      { sun: [-0.5, 0.08, 0.6], sunC: 0xff8050, sunI: 1.4, hemiS: 0x8a90c0, hemiG: 0x4e4238, hemiI: 1.0, fog: 0x7a6a78, near: 25, far: 180, top: 0x1e2850, mid: 0xc0705a, bot: 0x40353a, stars: 0.25, win: 1.6, exp: 1.2, fill: 0.3 },
  night:     { sun: [0.3, 0.7, -0.4], sunC: 0x8fa5d8, sunI: 0.5, hemiS: 0x46558a, hemiG: 0x1a1820, hemiI: 0.6, fog: 0x121828, near: 12, far: 100, top: 0x05070f, mid: 0x141b30, bot: 0x0a0a10, stars: 1, win: 2.2, exp: 1.35, fill: 0.42 },
  dawn:      { sun: [-0.2, 0.18, 0.9], sunC: 0xffc6a0, sunI: 1.1, hemiS: 0x9aa4b8, hemiG: 0x4e4844, hemiI: 0.85, fog: 0xa8a8b0, near: 8, far: 110, top: 0x5a6a88, mid: 0xc8b4b0, bot: 0x7a7478, stars: 0, win: 0.4, exp: 1.15 },
  mist:      { sun: [-0.2, 0.22, 0.9], sunC: 0xd0d0d8, sunI: 0.9, hemiS: 0xa4aebe, hemiG: 0x55504c, hemiI: 1.05, fog: 0x7a808a, near: 6, far: 70, top: 0x5a6472, mid: 0x8a909a, bot: 0x6a6c70, stars: 0, win: 0.9, exp: 1.3 },
  afternoon: { sun: [0.4, 0.62, 0.35], sunC: 0xfff0d0, sunI: 2.6, hemiS: 0xbcd0f0, hemiG: 0x66603f, hemiI: 0.85, fog: 0xa8b8b0, near: 30, far: 200, top: 0x4a78b5, mid: 0xc9d6e0, bot: 0x8a9a88, stars: 0, win: 0, exp: 1.0 },
  morning:   { sun: [-0.5, 0.42, 0.5], sunC: 0xffe6c0, sunI: 2.3, hemiS: 0xbcd0f0, hemiG: 0x66603f, hemiI: 0.8, fog: 0xb8c4c0, near: 30, far: 200, top: 0x5a88c0, mid: 0xdde4e0, bot: 0x8a9a88, stars: 0, win: 0, exp: 1.0 },
  // night, with the marsh mist come in off the Elbe: the escape through the city
  nightmist: { sun: [0.3, 0.7, -0.4], sunC: 0x8fa0c8, sunI: 0.42, hemiS: 0x4a5878, hemiG: 0x1a1a22, hemiI: 0.62, fog: 0x1c2230, near: 5, far: 60, top: 0x070a12, mid: 0x1a2032, bot: 0x0c0c12, stars: 0.4, win: 2.2, exp: 1.35 },
  snowday:   { sun: [-0.3, 0.35, 0.6], sunC: 0xe8eef8, sunI: 1.2, hemiS: 0xd8e2f0, hemiG: 0x9098a0, hemiI: 1.1, fog: 0xc8d0da, near: 15, far: 130, top: 0x9aa8b8, mid: 0xd4dae2, bot: 0xb8c0c8, stars: 0, win: 0.6, exp: 1.1 },
  snownight: { sun: [0.3, 0.7, -0.4], sunC: 0x9aaad0, sunI: 0.35, hemiS: 0x5a6890, hemiG: 0x2a3040, hemiI: 0.7, fog: 0x3a4458, near: 6, far: 45, top: 0x10141e, mid: 0x2a3244, bot: 0x1a1e28, stars: 0, win: 2.2, exp: 1.35, fill: 0.35 },
  firelight: { sun: [0.3, 0.6, -0.4], sunC: 0x7a8ac0, sunI: 0.45, hemiS: 0x46507a, hemiG: 0x241c14, hemiI: 0.65, fog: 0x0c0e16, near: 12, far: 100, top: 0x060812, mid: 0x1a1e34, bot: 0x0a0a10, stars: 1, win: 2.2, exp: 1.35, fill: 0.42 },
};
// Dark Fantasy (a setting): the same hour, darker, colder and greyer, with the mist in closer
const GRIM = new THREE.Color(0x2a2c30);
const grim = c => G.settings.dark ? c.clone().lerp(GRIM, 0.35).multiplyScalar(0.55) : c;
// the weather over the hour: cloud (0 clear, 1 a low grey sky, rain coming) greys the sky and the light and pulls the
// mist in; flash is lightning, for a moment
const OVERCAST = new THREE.Color(0x8a9098);
function weathered(a) {
  const c = G.cloud || 0, fl = G.flash || 0, m = G.mist || 0;
  if (c < 0.01 && fl < 0.01 && m < 0.01) return a;
  // (the grey as bright as the sky was: a cloudy night is still night)
  const grey = col => { const l = col.r * 0.3 + col.g * 0.55 + col.b * 0.15; return col.clone().lerp(OVERCAST.clone().multiplyScalar(l / 0.56 * 0.9), Math.min(1, c * 1.3)); };
  return { ...a, top: grey(a.top), mid: grey(a.mid), bot: grey(a.bot), fog: grey(a.fog), sunC: grey(a.sunC),
    sunI: a.sunI * (1 - c * 0.72), hemiI: a.hemiI * (1 + c * 0.15) + fl * 2.5, hemiS: a.hemiS.clone().lerp(new THREE.Color(0xdde4ff), fl),
    near: a.near * (1 - c * 0.5) * (1 - m * 0.85), far: a.far * (1 - c * 0.45) * (1 - m * 0.6), stars: a.stars * (1 - c), exp: a.exp * (1 - c * 0.06) + fl * 0.6, win: a.win + c * 0.35 };
}
function applyAtmo(a00) {
  G.atmoNow = a00;
  const a0 = weathered(a00);
  const dk = !!G.settings.dark;
  const a = dk ? { ...a0, fog: grim(a0.fog), top: grim(a0.top), mid: grim(a0.mid), bot: grim(a0.bot), sunC: grim(a0.sunC).multiplyScalar(1.5), sunI: a0.sunI * 0.7, hemiI: a0.hemiI * 0.7, near: a0.near * 0.6, far: a0.far * 0.7, exp: a0.exp * 0.8, stars: a0.stars * 0.5 } : a0;
  sun.color.copy(a.sunC); sun.intensity = a.sunI;
  G.sunDir = a.sun.clone ? a.sun.clone().normalize() : new THREE.Vector3(...a.sun).normalize();
  hemi.color.copy(a.hemiS); hemi.groundColor.copy(a.hemiG); hemi.intensity = a.hemiI;
  fill.intensity = a.fill ?? 0.1;
  RIM.value.copy(a.hemiS).multiplyScalar(0.55 * a.hemiI);
  // (the sun for the post pass's shafts: where, how strong, what colour)
  post.sunDir = G.sunDir; post.sunI = a.sunI; (post.sunC ||= new THREE.Color()).copy(a.sunC);
  // (the draw distance booster pulls the fog in, and the camera stops drawing just beyond it)
  const dm = G.drawMul ?? 1;
  G.scene.fog.color.copy(a.fog); G.scene.fog.near = a.near * dm; G.scene.fog.far = a.far * dm;
  const far = dm < 1 ? Math.max(35, a.far * dm * 1.08) : 900;
  if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
  // (the sky dome is 800 across: inside a short draw distance it shrinks to fit, or it would be cut away and leave black)
  sky.scale.setScalar(Math.min(1, (far - 25) / 800));
  const u = sky.material.uniforms;
  u.top.value.copy(a.top); u.mid.value.copy(a.mid); u.bottom.value.copy(a.bot);
  u.sunDir.value.copy(G.sunDir); u.sunCol.value.copy(a.sunC).multiplyScalar(Math.min(1, a.sunI / 2));
  sky.userData.stars.material.opacity = a.stars;
  // (the moon: out with the stars, behind the cloud; full every eighth day, waxing and waning between)
  u.moonK.value = clamp(a.stars * 1.2, 0, 1) * (1 - Math.min(1, (G.cloud || 0) * 1.3));
  // (the clouds: a fair day's scatter, thickening with the weather; lit by the day, near black by night)
  u.cloudK.value = clamp(0.25 + (G.cloud || 0) * 0.85, 0, 1);
  u.cloudLit.value = clamp((a.sunI - 0.4) / 2.0, 0, 1) * 1.05 + 0.035;
  u.bowK.value = G.rainbow || 0;
  u.moonPhase.value = G.town ? ((G.town.t / (G.town.dayLen || 480)) / 8) % 1 : 0.5;
  MAT.lit.emissiveIntensity = a.win;
  renderer.toneMappingExposure = a.exp;
}
// (put the sky and light back as they were, after somewhere that overrode them — a cave)
G.reAtmo = () => { if (G.atmoNow) applyAtmo(G.atmoNow); };
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
// what your hands hold on the screen hangs from this, not the camera itself, so it can move as you do:
// it sways behind a turn, bobs with your stride, drops when you land, and comes up from below when you take a thing out
export const vm = new THREE.Group();
// (the splash of a stroke, a plunge, a going-under: the foley's, when it's there)
let _gv, _gd, _gz, _gv2, _gq, _gq2;
// a ramrod laid between its two ends ([y, z] up and across the gun, as reload.js gives them)
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function placeRod(rod, RE, L) {
  _ra.set(0, RE.R[0], RE.R[1]); _rb.set(0, RE.T[0], RE.T[1]);
  rod.position.copy(_ra).add(_rb).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(_up, _rb.sub(_ra).normalize());
  rod.scale.set(1, L, 1);
}
// the things in the working hand through the loading, in the gun's own frame (y up the barrel, z over it): the
// priming flask, its spout to the pan; a charge off the bandolier — a little wooden bottle — upended over the muzzle and
// poured; and the ball, let fall in after it. Each shown only for its part of the drill (reload.js's steps).
const KIT_M = { horn: new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.55 }), wood: new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.7 }), brass: new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.7, roughness: 0.35 }), lead: new THREE.MeshStandardMaterial({ color: 0x6d7074, metalness: 0.5, roughness: 0.45 }) };
function loadKit(hand) {
  const flask = new THREE.Group();
  flask.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 10).rotateX(Math.PI), KIT_M.horn));
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.05, 6), KIT_M.brass); sp.position.y = -0.085; flask.add(sp);
  const bottle = new THREE.Group();
  bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.07, 10), KIT_M.wood));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.018, 8), KIT_M.wood); cap.position.y = 0.044; bottle.add(cap);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 10, 8), KIT_M.lead);
  for (const o of [flask, bottle, ball]) { o.visible = false; hand.add(o); }
  const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  return {
    show(kind, e, muzY) {
      const L = LOAD[kind] || LOAD.musket, at = n => (L.steps.find(s => s[1] === n) || [0])[0], f = kind === "pistol" ? 0.4 : 1;
      const on = !!kind, sP = at("prime"), sF = at("frizzen"), sW = at("powder"), sB = at("ball"), sR = at("rodOut");
      // (the flask: tipped to the pan, a shake or two)
      flask.visible = on && e > sP - 0.15 * f && e < sF;
      if (flask.visible) { flask.position.set(0.0, 0.08, 0.06); flask.rotation.set(-0.9 + 0.15 * Math.sin(e * 22), 0, 0.3); }
      // (the charge: up out of the hand, upended over the muzzle, and poured)
      bottle.visible = on && e > sW - 0.1 * f && e < sB - 0.05 * f;
      if (bottle.visible) { const tip = ease((e - sW) / (0.35 * f)); bottle.position.set(0, 0.085, 0.02); bottle.rotation.set(Math.PI * (0.25 + 0.72 * tip), 0, 0); }
      // (the ball: taken from the mouth or the pouch, held over the muzzle, and let go — down into the bore)
      ball.visible = on && e > sB - 0.05 * f && e < sB + 0.45 * f;
      if (ball.visible) { const drop = ease((e - sB - 0.25 * f) / (0.15 * f)); ball.position.set(0, 0.06 - drop * 0.12, 0.0); ball.scale.setScalar(drop > 0.95 ? 0.001 : 1); }
    },
  };
}
// a normal spread (a gun's scatter is bunched in the middle, with the odd wild one)
const randn = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// how fast you load, as you are: standing still, full speed; crouched in cover, cramped; walking, slower; running, much
const loadPace = p => (p.crouched ? 0.75 : 1) * (p.speed > 4.2 ? 0.4 : p.speed > 0.6 ? 0.6 : 1);
const FOLEY_SPLASH = (p, vol) => { const F = window.__foley; if (F && F.splash) F.splash({ x: p.x, y: p.y + 1.2, z: p.z }, vol); };
camera.add(vm);

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
    // (your hands and sleeves, first person, as the body you've been given: its skin, its coat, its shirt at the cuff)
    const c = this.model.colors || {};
    ARMS_M.skin.color.setHex(c.skin ?? 0xe8c4a0); ARMS_M.sleeve.color.setHex(c.coat ?? 0x4d5a3c); ARMS_M.cuff.color.setHex(c.linen ?? 0xd9d2c3);
    // (the body's own skin and cloth as they're drawn — their colour times the shading painted into the model — so the
    // hands on the screen are the very colour of the face and the arms below them, not a shade lighter)
    const seen = (re, M) => {
      let mesh = null; this.model.root.traverse(o => { if (!mesh && o.isMesh && re.test(o.name) && o.material && o.material.color) mesh = o; });
      if (!mesh) return;
      const col = mesh.material.color.clone(), ca = mesh.material.vertexColors && mesh.geometry.attributes.color;
      if (ca) { let r = 0, g = 0, b = 0; const n = ca.count; for (let i = 0; i < n; i++) { r += ca.getX(i); g += ca.getY(i); b += ca.getZ(i); } col.multiply(new THREE.Color(r / n, g / n, b / n)); }
      M.color.copy(col); M.roughness = mesh.material.roughness ?? M.roughness;
    };
    seen(/skin$/i, ARMS_M.skin); seen(/coat$/i, ARMS_M.sleeve); seen(/linen$/i, ARMS_M.cuff);
  }
  place(x, z, yaw = 0) {
    this.pos.set(x, G.world ? G.world.heightAt(x, z) : 0, z);
    this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0);
    this.landTrail = null;              // (put somewhere new: the dry ground behind you is here now, not where you were)
    this.trail = [{ x, z }];
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  // put the axe away (still yours) or take it out again
  holsterAxe(away) {
    if (away && this.axe) { this.giveAxe(false); this.hasAxe = true; }
    else if (!away && this.hasAxe && !this.axe) this.giveAxe(true);
  }
  // take up a weapon in place of the axe (or the axe again): the same two-handed swing
  wield(kind) {
    // (a plug bayonet fixed in the muzzle: pushed in and seated, a moment before it's any use)
    if (kind === "bayonet" && this.blade !== "bayonet") { const F = window.__foley; F && F.load && F.load("fixBayonet", null, 0.7); this.fixUntil = G.time + 1.0; }
    const owned = this.hasAxe;
    if (this.axe) this.giveAxe(false);
    this.blade = kind; this.giveAxe(true);
    if (kind !== "axe") this.hasAxe = owned;
  }
  // food in the hand is put away whenever something else is taken up (however it comes to you: a key, or the story)
  dropFood() { if (G.heldFood) { G.heldFood = null; if (G.working && (G.working.kind === "food" || G.working.kind === "eat")) G.working = null; } }
  giveAxe(on) {
    this.hasAxe = on;
    if (on) { this.dropFood(); if (this.gun) this.showGun(false); }
    if (on && this.bow) this.showBow(false);
    if (on && this.xbow) this.showXbow(false);
    if (on && !this.axe) {
      // the hands are a pivot; inside it the haft points forward and the blade leads to the left
      this.axe = new THREE.Group();
      this.axe.rotation.order = "YXZ";
      const a = (G.town ? k => makeOwnArm(k, !!(G.town.playerArm && G.town.playerArm() === "sword")) : makeArm)(this.blade || "axe");
      a.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
      this.axe.add(a);
      vm.add(this.axe);
      // your two hands on the haft, and your sleeves back to your shoulders, so hands and axe are one
      const look = this.model && this.model.colors || {};
      const skinM = ARMS_M.skin;
      const sleeveM = ARMS_M.sleeve;
      const cuffM = ARMS_M.cuff;
      const hand = y => {
        const h = new THREE.Group(); h.position.set(0, y, 0);
        const fist = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 8), skinM); fist.rotation.z = Math.PI / 2; h.add(fist);
        a.add(h); return h;
      };
      // (a sword's grip is short: the second hand close under the guard)
      const grips = { sword: [0.03, 0.15], spear: [0.12, 0.5], bayonet: [0.0, 0.42], pick: [0.03, 0.15], dagger: [0.02, 0.08] }[this.blade] || [0.07, 0.3];   // (a pick swung with both hands together at the end of the haft, as a pick is)
      this.hands = [hand(grips[0]), hand(grips[1])];
      this.arms = this.hands.map((h, i) => {
        const arm = new THREE.Group();
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 1, 10).translate(0, 0.5, 0), sleeveM); arm.add(sleeve);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10).translate(0, 0.035, 0), cuffM); arm.add(cuff);
        vm.add(arm);
        // (both arms come in from the right: the axe is held right-handed, the left hand low on the haft)
        return { arm, sleeve, cuff, shoulder: new THREE.Vector3(i === 0 ? 0.3 : 0.12, i === 0 ? -0.5 : -0.56, 0.12) };
      });
      this.axeRest();
      // and one in the hand of your body, for when the camera is behind you
      this.axeBody = (G.town ? k => makeOwnArm(k, !!(G.town.playerArm && G.town.playerArm() === "sword")) : makeArm)(this.blade || "axe"); this.axeBody.rotation.x = Math.PI / 2; this.axeBody.position.set(0, 0, 0);
      // (a spear or a bayonet in both hands, as a pike, seen from behind; anything else in the right)
      if (this.model && THRUST.has(this.blade) && pikeHold(this.model, this.axeBody, this.blade)) this.axeBody.rotation.x = 0;
      else if (this.model && this.model.held) this.model.held.add(this.axeBody);
    } else if (!on && this.axe) {
      vm.remove(this.axe); this.axe = null;
      for (const a of this.arms || []) vm.remove(a.arm);
      this.arms = null; this.hands = null;
      if (this.axeBody && this.model && this.model.aimH && this.model.aimH.obj === this.axeBody) this.model.aimHold(null);
      if (this.axeBody && this.model && this.model.held) this.model.held.remove(this.axeBody); this.axeBody = null;
    }
  }
  // ---- the musket: carried at the hip; right mouse brings it up to the eye, a click fires it, and then the long
  // business of loading it again — powder, ball, the ramrod down the barrel three times — before it can fire again ----
  showGun(on) {
    // (the bayonet out of the muzzle first, if it's in: it plugs the barrel)
    if (on && this.blade === "bayonet") { const F = window.__foley; F && F.load && F.load("unfixBayonet", null, 0.7); this.blade = "axe"; this.unfixUntil = G.time + 0.9; }
    if (on && !this.gun) {
      this.dropFood(); if (this.xbow) this.showXbow(false);
      if (this.axe) this.holsterAxe(true);
      if (this.bow) this.showBow(false);
      // (a pistol or the musket: each loaded or not as it was left)
      const pis = this.gunKind === "pistol"; this.gunIs = pis ? "pistol" : "musket";
      const sv = (this.gunSaved ??= {})[this.gunIs]; if (sv) { this.gunLoaded = sv.l; this.gunReload = sv.r; } else { this.gunLoaded = true; this.gunReload = 0; }
      const g = new THREE.Group(); g.rotation.order = "YXZ";
      const m = pis ? makePistol() : makeMusket(); m.rotation.x = -Math.PI / 2; g.add(m); this.gunModel = m;
      m.traverse(o => { if (o.isMesh) o.castShadow = false; });
      vm.add(g); this.gun = g;
      const look = this.model && this.model.colors || {};
      const skinM = ARMS_M.skin;
      const sleeveM = ARMS_M.sleeve;
      const cuffM = ARMS_M.cuff;
      const fist = (y, z) => { const h = new THREE.Group(); const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 8), skinM); f.rotation.z = Math.PI / 2; h.add(f); h.position.set(0, y, z); m.add(h); return h; };
      // (a pistol is held in the one hand, at the grip)
      this.hands = pis ? [fist(-0.06, -0.068), fist(0.1, -0.03)] : [fist(-0.065, -0.024), fist(0.46, -0.016)];
      // (the ramrod, for loading: drawn out of its pipes and down the barrel)
      const rodL = pis ? 0.27 : 0.92;
      this.gunRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.6 }));
      this.gunRod.userData.len = rodL; this.gunRod.visible = false; m.add(this.gunRod);
      // (each arm in two, jointed at the elbow — it bends as the hand comes in to the work, and straightens as it goes out)
      this.arms = this.hands.map((h, i) => {
        const arm = new THREE.Group(), fore = new THREE.Group();
        arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 1, 10).translate(0, 0.5, 0), sleeveM));
        fore.add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.046, 1, 10).translate(0, 0.5, 0), sleeveM));
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10).translate(0, 0.035, 0), cuffM); fore.add(cuff);
        vm.add(arm); vm.add(fore);
        return { arm, sleeve: arm.children[0], fore, foreSleeve: fore.children[0], cuff, side: i === 0 ? 1 : -1, len: pis ? 0.3 : 0.56, bend: 0, shoulder: new THREE.Vector3(i === 0 ? 0.26 : 0.02, i === 0 ? -0.48 : -0.55, 0.12) };
      });
      // (what the working hand holds through the drill: the priming flask, a charge off the bandolier, the ball)
      this.loadKit = loadKit(this.hands[pis ? 1 : 0]);
      this.gunLoaded ??= true; this.gunReload = this.gunReload || 0; this.gunAim = 0; this.gunKickT = 0;
      // (and in both hands of your body, at the shoulder, for when the camera is behind you)
      if (this.model && this.model.aimHold) this.gunBody = shoulderArm(this.model, this.gunIs);
      // (the bayonet, if it's fixed, on it: on the gun in your hands and the one your body carries)
      if (this.bayonet && !pis) { addBayonet(m); addBayonet(this.gunBody); }
    } else if (!on && this.gun) {
      (this.gunSaved ??= {})[this.gunIs || "musket"] = { l: this.gunLoaded, r: this.gunReload };
      vm.remove(this.gun); this.gun = null;
      for (const a of this.arms || []) { vm.remove(a.arm); if (a.fore) vm.remove(a.fore); }
      this.arms = null; this.hands = null; this.loadKit = null;
      if (this.gunBody && this.model && this.model.aimHold) this.model.aimHold(null); this.gunBody = null;
    }
  }
  // the bayonet fixed under the muzzle, or taken off: a second's work, heard; nothing fired or thrust till it's done
  fixBayonet(on) {
    if (!!this.bayonet === !!on || G.time < (this.fixUntil || 0)) return false;
    this.bayonet = !!on; this.fixUntil = G.time + 1.0;
    const F = window.__foley; F && F.load && F.load(on ? "fixBayonet" : "unfixBayonet", null, 0.7);
    if (this.gun && this.gunIs === "musket") {
      if (on) { addBayonet(this.gunModel); addBayonet(this.gunBody); }
      else for (const m of [this.gunModel, this.gunBody]) if (m && m.userData.bayonet) { m.remove(m.userData.bayonet); m.userData.bayonet = null; }
    }
    return true;
  }
  updateGun(dt) {
    _gv ??= new THREE.Vector3(); _gd ??= new THREE.Vector3(); _gz ??= new THREE.Vector3(); _gv2 ??= new THREE.Vector3(); _gq ??= new THREE.Quaternion(); _gq2 ??= new THREE.Quaternion();
    if (!this.gun) return;
    const free = G.mode === "play" && !G.lockMove && !UI.dialogOpen && !G.cine && !(G.town && G.town.planning);
    const pis = this.gunIs === "pistol", kind = pis ? "pistol" : "musket", RL = LOAD[kind].time;
    // loading: only when you set about it (R), fired and empty — then as the drill goes (reload.js), each step heard
    if (free && input.hit("KeyR") && !this.gunLoaded && !(this.gunReload > 0) && !(this.thrustT >= 0) && G.time >= (this.fixUntil || 0)) this.gunReload = RL;
    if (this.gunReload > 0 && !(this.thrustT >= 0)) {
      const before = this.gunReload; this.gunReload = Math.max(0, this.gunReload - dt * loadPace(this) * (this.bayonet && !pis ? 0.8 : 1));   // (the bayonet in the way of the rod)
      const F = window.__foley;
      for (const st of loadSteps(kind, RL - before, RL - this.gunReload + (this.gunReload === 0 ? 1 : 0))) F && F.load && F.load(st, null, 0.6, pis);
      if (this.gunReload === 0) this.gunLoaded = true;
    }
    const reloading = this.gunReload > 0;
    const aimWant = free && input.rdown && !reloading && !this.guard ? 1 : 0;
    this.gunAim += (aimWant - this.gunAim) * Math.min(1, dt * 9);
    if (this.model) this.model.aimWant = this.gunAim > 0.5;
    // the bayonet: fired, and loading, a click is the steel instead — the loading left off (R to begin it again), the
    // musket driven out straight before you and back
    if (free && input.click && this.bayonet && !pis && !this.gunLoaded && !(this.thrustT >= 0) && G.time >= (this.fixUntil || 0)) {
      input.click = false; this.thrustT = 0; this.thrustHit = false; this.gunReload = 0;
      AUDIO.whoosh && AUDIO.whoosh(0.5, true);
    }
    if (this.thrustT >= 0) {
      this.thrustT += dt;
      if (this.thrustT > 0.2 && !this.thrustHit) { this.thrustHit = true; G.onSwing && G.onSwing(); }
      if (this.thrustT > 0.62) this.thrustT = -1;
    }
    // fire
    if (free && input.click && this.gunLoaded && !reloading && G.time >= (this.fixUntil || 0)) {
      input.click = false;
      const q = camera.getWorldQuaternion(new THREE.Quaternion());
      // a smoothbore's scatter, as it was: a round ball a size smaller than the bore, rattling out — aimed with care, a
      // musket throws a hand's breadth or two either side at fifty paces and twice that at a hundred; from the hip, or
      // on the move, much wider; a pistol is wild past a few paces
      const sigma = ((pis ? 0.014 : 0.0065) + (1 - this.gunAim) * (pis ? 0.03 : 0.022) + Math.min(1, this.speed / 4) * 0.015 + (this.crouched ? -0.0015 : 0)) * (this.bayonet && !pis ? 1.4 : 1);   // (and its weight at the muzzle in the way of the aim)
      const dir = new THREE.Vector3(randn() * sigma, randn() * sigma, -1).normalize().applyQuaternion(q);
      const from = camera.getWorldPosition(new THREE.Vector3());
      const muzzle = this.gunModel.userData.muzzle.getWorldPosition(new THREE.Vector3());
      AUDIO.gunshot && AUDIO.gunshot(pis ? 0.8 : 1);
      if (G.onGunshot) G.onGunshot(from, dir, this.gunIs);
      if (G.hunt) { G.hunt.fireBall(from.clone().addScaledVector(dir, 0.6), dir, { speed: pis ? 260 : 420, power: pis ? 1.9 : 2.6, range: pis ? 60 : 160 }); G.practise && G.practise("archery", 0.3); }
      gunSmoke(muzzle, dir, pis ? 0.6 : 1);
      this.gunLoaded = false; this.gunReload = 0; this.gunKickT = 1; G.bowKick = pis ? 1.0 : 1.4;
      if (!this.gunTip) { this.gunTip = true; setTimeout(() => UI.hint("R to load — powder, ball, and the ramrod. It takes a while: find cover.", 4), 600); }
    } else if (free && input.click && !this.gunLoaded) {
      input.click = false;
      // (the dry click of a cock let fall on an empty pan — and a word, if you've forgotten)
      if (!reloading && !this.bayonet && G.time > (this.emptyTold || 0)) { this.emptyTold = G.time + 2.5; const F = window.__foley; F && F.load && F.load("latch", null, 0.35, pis); UI.hint("Empty — R to load.", 1.6); }
    }
    this.gunKickT = Math.max(0, this.gunKickT - dt * 4);
    // where it is: at the hip, at the eye, or down for loading; and kicked by the shot
    const a = this.gunAim, k = this.gunKickT * this.gunKickT, g = this.gun;
    const LP = reloading ? loadPose(kind, RL - this.gunReload) : { up: 0, prime: 0, hand: null, rod: { out: 0, depth: 0 } };
    if (this.model) this.model.load = reloading ? { kind, e: RL - this.gunReload } : null;
    // three places for it: at the hip or the eye (aimed); low and turned lock-up for priming; and stood on its butt
    // before you, the muzzle up, for the charge, the ball and the rod. (A pistol: out at arm's length to aim, its kick
    // a sharp flip of the wrist.)
    const H = pis
      ? [0.2 - 0.17 * a, -0.21 + 0.155 * a, -0.36 - 0.14 * a + 0.05 * k, 0.05 * (1 - a) + 0.35 * k, 0.05 * (1 - a) + 0.03 * a, 0.12 * (1 - a)]
      : [0.22 - 0.22 * a, -0.27 + 0.155 * a, -0.32 + 0.02 * a + 0.06 * k, 0.04 * (1 - a) + 0.12 * k, 0.06 * (1 - a), 0.1 * (1 - a)];
    const P = pis ? [0.1, -0.27, -0.34, 0.25, 0.45, -1.0] : [0.12, -0.34, -0.4, 0.2, 0.45, -1.05];
    const v = H.map((h, i) => h + (P[i] - h) * LP.prime);
    g.position.set(v[0], v[1], v[2]); g.rotation.set(v[3], v[4], v[5]);
    // (the thrust: drawn back a little, then out hard along the line of the barrel, and back to the hip)
    // (guarding with it: held crosswise before you — up over your head against a blow from above, or upright to the side
    //  it's coming from)
    this.gunGuard = (this.gunGuard || 0) + ((this.guard ? 1 : 0) - (this.gunGuard || 0)) * Math.min(1, dt * 14);
    if (this.gunGuard > 0.01) {
      const q = this.gunGuard, up = this.stance === "up", sd = this.stance === "left" ? -1 : 1;
      g.position.x += ((up ? 0.05 : sd * 0.12) - g.position.x) * q; g.position.y += ((up ? 0.02 : -0.12) - g.position.y) * q; g.position.z += (-0.42 - g.position.z) * q;
      g.rotation.x += ((up ? 0.1 : 1.2) - g.rotation.x) * q; g.rotation.y += ((up ? 1.45 : sd * 0.25) - g.rotation.y) * q; g.rotation.z += ((up ? 0 : -sd * 0.35) - g.rotation.z) * q;
    }
    if (this.thrustT >= 0) { const t = this.thrustT, out = t < 0.12 ? -0.12 * (t / 0.12) : t < 0.24 ? -0.12 + 0.62 * ((t - 0.12) / 0.12) : 0.5 * (1 - Math.min(1, (t - 0.24) / 0.38)); g.position.z -= out; g.position.y += out * 0.12; g.rotation.x -= out * 0.12; }
    // (stood up for the charge and the rod: leaning away to the left, the muzzle up in the corner of your eye — so the
    //  hand at it and the rod going down are in sight, and the field in front of you still is)
    if (LP.up > 0.001) {
      const M = pis ? _gv.set(-0.17, -0.06, -0.46) : _gv.set(-0.15, -0.04, -0.6), d = _gd.set(pis ? -0.3 : -0.12, 0.85, pis ? -0.42 : -0.34).normalize();
      const len = this.gunModel.userData.muzzle.position.y;
      _gq.setFromUnitVectors(_gz.set(0, 0, -1), d);                 // (the barrel, -z in here, along d)
      _gq.multiply(_gq2.setFromAxisAngle(_gz.set(0, 0, 1), pis ? 0.4 : 0.5));   // (rolled, the lock toward you)
      g.quaternion.slerp(_gq, LP.up);
      g.position.lerp(_gv2.copy(M).addScaledVector(d, -len), LP.up);
    }
    // the free hand: on the fore-end (the pistol's out of sight), or at the lock, the muzzle, the rod
    const muzY = this.gunModel.userData.muzzle.position.y, rod = this.gunRod, rodL = rod ? rod.userData.len : 0;
    // (drawn up out of its pipes under the barrel, turned end for end, down the bore as far as the strokes take it,
    //  and back — reload.js; the one lying in the pipes hidden while it's out)
    const RE = reloading ? rodEnds(kind, RL - this.gunReload) : { show: false };
    if (rod) {
      rod.visible = !!RE.show;
      if (RE.show) placeRod(rod, RE, rodL);
      const baked = this.gunModel.userData.rodMesh; if (baked) baked.visible = !RE.show;
    }
    if (this.hands && this.hands[1]) {
      // (the musket: stood up, it's held by the barrel in the left hand and the right does the work — the pan, the
      //  charge, the ball, the rod — as the drill had it. The pistol stays in the right, and the left works.)
      const wi = pis ? 1 : 0, h = this.hands[wi], rest = pis ? null : [-0.065, -0.024];
      const top = RE.show ? (RE.R[0] > RE.T[0] ? RE.R : RE.T) : null;
      const tgt = LP.hand === "lock" ? [0.07, 0.06] : LP.hand === "muzzle" ? [muzY + 0.05, 0.035] : LP.hand === "rod" && top ? [top[0] - 0.05, top[1]] : LP.hand === "rod" ? [muzY + 0.03, 0.03] : rest;
      h.userData.at = h.userData.at || [rest ? rest[0] : 0.1, rest ? rest[1] : -0.03];
      if (tgt) { const kk = Math.min(1, dt * 12); h.userData.at[0] += (tgt[0] - h.userData.at[0]) * kk; h.userData.at[1] += (tgt[1] - h.userData.at[1]) * kk; }
      h.position.set(LP.hand === "lock" ? 0.05 : !pis && LP.hand ? 0.045 : 0, h.userData.at[0], h.userData.at[1]);
      if (pis && this.arms && this.arms[1]) { const seen = !!(reloading && LP.hand); this.arms[1].arm.visible = seen; h.visible = seen; }
      if (!pis) { const f = this.hands[1]; f.position.y = 0.46 + (0.6 - 0.46) * LP.up; }
      if (this.loadKit) this.loadKit.show(reloading ? kind : null, RL - this.gunReload, muzY);
    }
    // (the arms come in to it while it's stood up: the shoulders forward, the elbows bent)
    if (this.arms) for (let i = 0; i < this.arms.length; i++) {
      const A = this.arms[i], sh = A.shoulder, base = A.base ??= sh.clone(), to = pis ? (i ? [-0.3, -0.62, base.z] : [base.x, base.y, base.z]) : i ? [-0.3, -0.6, 0.0] : [0.3, -0.8, 0.0];
      sh.set(base.x + (to[0] - base.x) * LP.up, base.y + (to[1] - base.y) * LP.up, base.z + (to[2] - base.z) * LP.up); A.bend = pis ? 0 : LP.up;
    }
    this.fitArms();
  }
  // ---- the bow: held out in the left hand, the right on the string ----
  // (the axe goes on your back while the bow is out, and the other way round)
  showBow(on) {
    if (on) { this.dropFood(); if (this.gun) this.showGun(false); if (this.xbow) this.showXbow(false); }
    if (on && !this.bow) {
      if (this.axe) this.holsterAxe(true);
      const g = new THREE.Group(); g.rotation.order = "YXZ";
      const m = modelCopy("bow");
      const limbs = m ? m.scene : new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x7a4e2a }));
      limbs.rotation.y = Math.PI;                    // its belly toward you, the tips drawn back toward you
      limbs.traverse(o => { if (o.isMesh) o.castShadow = false; });
      g.add(limbs);
      const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
      this.bowString = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xe8e0c8 }));
      g.add(this.bowString);
      const am = modelCopy("arrow");
      this.nocked = new THREE.Group();
      if (am) { am.scene.rotation.y = Math.PI; am.scene.position.z = -0.37; this.nocked.add(am.scene); }
      g.add(this.nocked);
      vm.add(g); this.bow = g;
      const look = this.model && this.model.colors || {};
      const skinM = ARMS_M.skin;
      const sleeveM = ARMS_M.sleeve;
      const cuffM = ARMS_M.cuff;
      const fist = parent => { const h = new THREE.Group(); const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 8), skinM); h.add(f); parent.add(h); return h; };
      const grip = fist(g); grip.position.set(0, 0, 0.02);
      this.nockHand = fist(g);
      this.hands = [this.nockHand, grip];
      this.arms = this.hands.map((h, i) => {
        const arm = new THREE.Group();
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 1, 10).translate(0, 0.5, 0), sleeveM); arm.add(sleeve);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10).translate(0, 0.035, 0), cuffM); arm.add(cuff);
        vm.add(arm);
        return { arm, sleeve, cuff, shoulder: new THREE.Vector3(i === 0 ? 0.24 : -0.22, -0.5, 0.12) };
      });
      this.draw = 0; this.reload = 0;
      this.bowPose(0);
    } else if (!on && this.bow) {
      vm.remove(this.bow); this.bow = null;
      for (const a of this.arms || []) vm.remove(a.arm);
      this.arms = null; this.hands = null; this.draw = 0;
    }
  }
  // the bow at rest, or drawn by k (0..1): the string comes back to your cheek and the bow comes up to your eye.
  // After a shot (rel, 1 falling to 0) the bow kicks forward and rolls in the hand, the string shivers, and the drawing
  // hand flies back past the ear; then (reloading) it goes back over the shoulder to the quiver and brings an arrow to the string
  bowPose(k, rel = this.release || 0) {
    const g = this.bow; if (!g) return;
    const e = k * k * (3 - 2 * k), kick = rel * rel;
    g.position.set(-0.07 + 0.05 * e, -0.22 + 0.13 * e - 0.015 * kick, -0.55 + 0.04 * e - 0.05 * kick);
    g.rotation.set(0.05 * (1 - e) - 0.06 * kick, 0.06 * e, 0.28 * (1 - e) + 0.1 + 0.3 * kick);
    const back = 0.15, L = 0.66, nockZ = back + 0.02 + e * 0.4;
    // (the string, let go, shivers back and forth a few times and is still)
    const shiver = rel > 0 ? Math.sin((1 - rel) * 70) * 0.03 * rel : 0;
    const a = this.bowString.geometry.attributes.position;
    a.setXYZ(0, 0, L, back); a.setXYZ(1, 0, 0.012, nockZ + shiver); a.setXYZ(2, 0, -L, back); a.needsUpdate = true;
    this.bowString.geometry.computeBoundingSphere();
    const RL = 0.9, p = this.reload > 0 ? 1 - this.reload / RL : 1, ez = x => x * x * (3 - 2 * x);
    // the drawing hand: on the string; or flown back after the shot; or away to the quiver and back with an arrow
    const hx = 0.02, hy = 0.0, hz = nockZ + 0.03;
    let x = hx, y = hy, z = hz;
    if (this.reload > 0) {
      const QX = 0.22, QY = 0.32, QZ = 0.42;                                  // (over the right shoulder, where the quiver is)
      if (p < 0.4) { const t = ez(p / 0.4); x = 0.06 + (QX - 0.06) * t; y = 0.02 + (QY - 0.02) * t; z = hz + 0.16 + (QZ - hz - 0.16) * t; }
      else { const t = ez((p - 0.4) / 0.6); x = QX + (hx - QX) * t; y = QY + (hy - QY) * t; z = QZ + (back + 0.05 - QZ) * t; }
    }
    if (rel > 0 && this.reload > 0.6) { x += 0.04 * rel; z += 0.14 * rel; }
    this.nockHand.position.set(x, y, z);
    // the arrow: on the string, or in the hand on its way there
    const have = (this.arrows || 0) > 0;
    this.nocked.visible = have && (this.reload <= 0 || p > 0.4);
    if (this.reload > 0 && p > 0.4) this.nocked.position.set(x - 0.008, y + 0.012, z - 0.03);
    else this.nocked.position.set(0.012, 0.012, nockZ);
  }
  updateBow(dt) {
    if (!this.bow) return;
    const free = G.mode === "play" && !G.lockMove && !UI.dialogOpen && !G.cine && !(G.town && G.town.planning);
    // (the next arrow from the quiver and onto the string: slower on the move)
    { const was = this.reload; this.reload = Math.max(0, this.reload - dt * loadPace(this)); const F = window.__foley;
      if (was > 0.6 && this.reload <= 0.6 && (this.arrows || 0) > 0) F && F.load && F.load("quiver", null, 0.4);
      if (was > 0.12 && this.reload <= 0.12 && (this.arrows || 0) > 0) F && F.load && F.load("nock", null, 0.45); }
    this.release = Math.max(0, (this.release || 0) - dt * 2.6);
    // hold the right mouse button to draw; let it go to loose
    if (!input.rdown) this.noDraw = false;
    // (nor does holding right-click on something to use it, like an arrow to pull out)
    if (free && input.rdown && !this.noDraw && (this.arrows || 0) > 0 && this.reload <= 0) {
      if (this.draw === 0) { const F = window.__foley; F && F.load && F.load("drawBow", null, 0.45); this.heldFull = 0; this.creakT = 0; this.breathHeld = 0; this.letdown = false; }
      // (it comes easily at first and harder the further back it comes: the bow stacks)
      this.draw = Math.min(1, this.draw + dt / 0.85 * (1.35 - 0.75 * this.draw));
      if (this.draw < 1 && (this.creakT -= dt) <= 0) { this.creakT = 0.14 + Math.random() * 0.12; AUDIO.bowCreak && AUDIO.bowCreak(this.draw); }
      if (this.draw >= 1) this.heldFull += dt;
    } else if (this.draw > 0) {
      // let go: a real shot if it was drawn enough; if not, the string let down gently, not snapped
      if (this.draw > 0.2 && free && !this.letdown) {
        const q = camera.getWorldQuaternion(new THREE.Quaternion());
        // (the arrow goes where the bow was pointing — sway and all — not where the crosshair is)
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.swY || 0, this.swX || 0, 0, "YXZ")).applyQuaternion(q);
        const from = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.5);
        this.arrows--; this.reload = 0.9; this.release = 1; G.bowKick = 0.6 + 0.4 * this.draw; this.nockAt = 0.9;
        if (G.hunt) G.hunt.loose(from, dir, this.draw);
        G.practise("archery", 0.5);
        AUDIO.twang ? AUDIO.twang(this.draw) : SFX.swingFist && SFX.swingFist();
        this.draw = 0; this.heldFull = 0;
      } else { this.letdown = true; this.draw = Math.max(0, this.draw - dt * 2.4); if (this.draw === 0) { this.letdown = false; this.heldFull = 0; } }
    }
    // held at full draw, your arms begin to shake — a little at first, then worse. Shift holds your breath: steady for a
    // few seconds, at a cost in wind, and worse after
    let steady = 1;
    if (this.draw >= 1 && (input.down("ShiftLeft") || input.down("ShiftRight")) && (G.stamina ?? 1) > 0.05 && (this.breathHeld || 0) < 3.5) {
      this.breathHeld = (this.breathHeld || 0) + dt; steady = 0.2;
      if (G.stamina !== undefined) G.stamina = Math.max(0, G.stamina - dt * 0.12);
      if (!this.breathTip) { this.breathTip = true; UI.hint("Holding your breath: steady, for a few seconds.", 2.5); }
    } else if ((this.breathHeld || 0) >= 3.5) steady = 1.8;
    this.shake = this.draw >= 1 ? Math.min(1, 0.15 + (this.heldFull || 0) / 3) * aimSteady(G.body) * steady : 0;
    // the aim drifts as you hold it: a slow wander, a little more the harder the pull and the more tired the arms
    const t = G.time, amp = this.draw > 0 ? (0.004 + 0.006 * this.draw + 0.018 * this.shake) * steady : 0;
    this.swX = (Math.sin(t * 0.83) * 0.6 + Math.sin(t * 1.71 + 1.3) * 0.4) * amp + Math.sin(t * 17) * 0.004 * this.shake;
    this.swY = (Math.sin(t * 1.17 + 0.4) * 0.6 + Math.sin(t * 2.3) * 0.4) * amp * 0.8 + Math.sin(t * 13) * 0.004 * this.shake;
    this.bowPose(this.draw);
    this.bow.rotation.y += this.swX; this.bow.rotation.x += this.swY;
    this.fitArms();
  }
  // ---- the crossbow: a stock with a steel bow across its front, spanned with a crank; aimed down, and loosed ----
  showXbow(on) {
    if (on) { this.dropFood(); if (this.gun) this.showGun(false); if (this.bow) this.showBow(false); }
    if (on && !this.xbow) {
      if (this.axe) this.holsterAxe(true);
      const g = makeCrossbow(); g.scale.setScalar(0.86);
      g.traverse(o => { if (o.isMesh) o.castShadow = false; });
      vm.add(g); this.xbow = g;
      this.xcrank = g.userData.crank; this.xbolt = g.userData.bolt; this.xtrig = g.userData.trig;
      // your hands on it: the right round the wrist of the stock at the trigger, the left under the fore-end
      const look = this.model && this.model.colors || {};
      const skinM = ARMS_M.skin;
      const sleeveM = ARMS_M.sleeve;
      const cuffM = ARMS_M.cuff;
      const fist = (x, y, z, rz) => { const h = new THREE.Group(); const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.05, 4, 8), skinM); f.rotation.z = rz; h.add(f); h.position.set(x, y, z); g.add(h); return h; };
      this.hands = [fist(0.012, -0.06, 0.02, Math.PI / 2 - 0.3), fist(-0.006, -0.05, -0.27, Math.PI / 2 + 0.2)];
      this.arms = this.hands.map((h, i) => {
        const arm = new THREE.Group();
        arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 1, 10).translate(0, 0.5, 0), sleeveM));
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10).translate(0, 0.035, 0), cuffM); arm.add(cuff);
        vm.add(arm);
        return { arm, sleeve: arm.children[0], cuff, shoulder: new THREE.Vector3(i === 0 ? 0.26 : -0.02, i === 0 ? -0.48 : -0.55, 0.12) };
      });
      // (and the one the others see, in your hands)
      if (this.model && this.model.aimHold) this.xbowBody = shoulderArm(this.model, "crossbow");
      this.xaim = 0; this.xspan = (G.body && G.body.tools.bolts > 0) ? 1 : 0; this.xkick = 0;
      this.xposeIt();
    } else if (!on && this.xbow) {
      vm.remove(this.xbow); this.xbow = null;
      for (const a of this.arms || []) vm.remove(a.arm);
      this.arms = null; this.hands = null;
      if (this.xbowBody && this.model && this.model.aimHold) this.model.aimHold(null); this.xbowBody = null;
    }
  }
  // how it lies in the hands: at the hip, or up at the eye with the bolt along the sight; the string back or loosed
  xposeIt() {
    const g = this.xbow; if (!g) return;
    const a = this.xaim * this.xaim * (3 - 2 * this.xaim), k = this.xkick, wd = this.xwind || 0, wn = wd * wd * (3 - 2 * wd);
    // three ways of holding it: low at the hip; up at the cheek, the butt beside your face and the sights before your
    // eye; and tipped up and turned while you wind the crank
    const L = (h, m, wv) => (h + (m - h) * a) * (1 - wn) + wv * wn;
    g.position.set(L(0.17, 0, 0.07), L(-0.24, -0.074, -0.23) + 0.02 * k, L(-0.5, -0.2, -0.42) + 0.06 * k);
    g.rotation.set(L(0.07, 0, 0.42) + 0.12 * k, L(0.07, 0, 0.62), L(0.1, 0, 0.16));
    const sp = this.xspan;
    g.userData.span(sp);
    if (this.xbowBody) this.xbowBody.userData.span(sp);
    // (the trigger lever squeezed up against the stock as it looses, and back down)
    if (this.xtrig) this.xtrig.rotation.x = 0.16 * k;
    this.xbolt.visible = sp >= 1 && (G.body ? G.body.tools.bolts > 0 : false);
    if (this.xbowBody) this.xbowBody.userData.bolt.visible = this.xbolt.visible;
    // (the left hand leaves the fore-end to wind the crank while it's spanned)
    if (this.hands) {
      // (on the crank's knob, going round with it)
      const c = this.xcrank.rotation.x, wx = 0.09, wy = -0.01 + 0.07 * Math.cos(c), wz = -0.03 + 0.07 * Math.sin(c);
      this.hands[1].position.set(-0.006 + (wx + 0.006) * wn, -0.05 + (wy + 0.05) * wn, -0.27 + (wz + 0.27) * wn);
    }
    this.fitArms();
  }
  updateXbow(dt) {
    if (!this.xbow) return;
    const free = G.mode === "play" && !G.lockMove && !UI.dialogOpen && !G.cine && !(G.town && G.town.planning);
    const bolts = G.body ? G.body.tools.bolts || 0 : 0;
    this.xaim += ((free && input.rdown ? 1 : 0) - this.xaim) * Math.min(1, dt * 9);
    if (this.model) this.model.aimWant = this.xaim > 0.5;
    this.xkick = Math.max(0, this.xkick - dt * 3);
    if (free && input.hit("KeyR") && this.xspan < 1 && bolts > 0) this.xwinding = true;
    this.xwind = (this.xwind || 0) + ((this.xspan < 1 && bolts > 0 && this.xwinding && this.xkick < 0.6 ? 1 : 0) - (this.xwind || 0)) * Math.min(1, dt * 6);
    // the shot: down the line of the sight if aimed, wider from the hip
    if (free && input.click && this.xspan >= 1 && bolts > 0) {
      input.click = false;
      const q = camera.getWorldQuaternion(new THREE.Quaternion()), spread = 0.004 + (1 - this.xaim) * 0.05;
      const dir = new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, -1).normalize().applyQuaternion(q);
      const from = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.5);
      G.body.tools.bolts = bolts - 1; G.body.dirty = true;
      this.xspan = 0; this.xkick = 1; G.bowKick = 1.2; this.xwinding = false;
      if (G.hunt) G.hunt.loose(from, dir, 1.75, true);
      G.practise && G.practise("archery", 0.6);
      AUDIO.twang ? AUDIO.twang(1.3) : SFX.swingFist && SFX.swingFist();
    } else if (free && input.click && bolts <= 0 && this.xspan < 1) { input.click = false; UI.hint("No bolts. Make some at the chopping block (it takes iron, so a forge).", 3); }
    else if (free && input.click && this.xspan < 1 && !this.xwinding) { input.click = false; if (G.time > (this.emptyTold || 0)) { this.emptyTold = G.time + 2.5; UI.hint("Unspanned — R to wind it.", 1.6); } }
    // spanning it again (R): the crank wound, the string drawn back to the nut, a bolt laid in the groove
    if (this.xspan < 1 && bolts > 0 && this.xwinding) {
      const pace = loadPace(this), was = this.xspan; this.xspan = Math.min(1, this.xspan + dt / 2.6 * pace);
      this.xcrank.rotation.x += dt * 14 * pace;
      const F = window.__foley;
      // (the windlass ratcheting round, the string caught on the nut, a bolt laid in the groove)
      if (Math.floor(was * 5) !== Math.floor(this.xspan * 5) && this.xspan < 1) F && F.load && F.load("crank", null, 0.45);
      if (this.xspan >= 1) { this.xwinding = false; F && F.load && F.load("latch", null, 0.55); setTimeout(() => F && F.load && F.load("boltLay", null, 0.4), 260); }
    }
    this.xposeIt();
  }
  // each sleeve runs from its shoulder to its hand on the haft, however the axe is held
  fitArms() {
    if (!this.arms) return;
    (this.axe || this.bow || this.gun || this.xbow).updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(vm.matrixWorld).invert();
    for (let i = 0; i < this.arms.length; i++) {
      const { arm, sleeve, cuff, shoulder, fore, foreSleeve } = this.arms[i];
      const hp = new THREE.Vector3().setFromMatrixPosition(this.hands[i].matrixWorld).applyMatrix4(inv);
      const d = new THREE.Vector3().subVectors(hp, shoulder), L = d.length();
      arm.position.copy(shoulder);
      if (fore) {
        // (two bones: reach far and the arm's straight; nearer, the elbow drops down and out to the side)
        const A = this.arms[i].len, dir = d.clone().normalize(), Y = new THREE.Vector3(0, 1, 0);
        let elbow;
        if (L >= 2 * A - 1e-3 || !this.arms[i].bend) elbow = shoulder.clone().addScaledVector(dir, L / 2);
        else {
          const x = L / 2, h = Math.sqrt(Math.max(0, A * A - x * x));
          const pole = new THREE.Vector3(this.arms[i].side * 0.5, -1, -0.1); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
          elbow = shoulder.clone().addScaledVector(dir, x).addScaledVector(pole, h);
        }
        const up = elbow.clone().sub(shoulder), lo = hp.clone().sub(elbow), ul = up.length(), ll = lo.length();
        arm.quaternion.setFromUnitVectors(Y, up.normalize()); sleeve.scale.set(1, Math.max(0.02, ul), 1);
        fore.position.copy(elbow); fore.quaternion.setFromUnitVectors(Y, lo.normalize()); fore.visible = arm.visible;
        foreSleeve.scale.set(1, Math.max(0.02, ll - 0.08), 1); cuff.position.y = Math.max(0.02, ll - 0.12);
        continue;
      }
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      sleeve.scale.set(1, Math.max(0.05, L - 0.08), 1);
      cuff.position.y = Math.max(0.05, L - 0.12);
    }
  }
  // ---- work in your hands: a saw drawn back and forth, a hammer striking, a knife whittling ----
  // G.working = { kind, until } while a held action goes on (or workFor, for a moment's work after something is made)
  workFor(kind, secs) { G.working = { kind, until: G.time + secs }; }
  updateWork(dt) {
    // (food taken up stays in the hand after anything else you did meanwhile)
    if (G.heldFood && (!G.working || G.time >= G.working.until)) G.working = { kind: "food", food: G.heldFood.icon, until: Infinity, quiet: true };
    const wk = G.working && G.time < G.working.until && G.working.kind ? G.working : null;
    const kind = wk ? wk.kind : null;
    if (kind !== this.workKind) {
      if (this.workRig) { vm.remove(this.workRig); this.workRig = null; }
      if (this.workBody && this.model && this.model.held) this.model.held.remove(this.workBody); this.workBody = null;
      this.workKind = kind; this.workT = 0; this.workBeat = 0;
      // the axe or the bow goes aside while your hands are busy
      const show = !kind;
      for (const a of this.arms || []) a.arm.visible = show;
      if (this.bow) this.bow.visible = show;
      if (this.gun) this.gun.visible = show;
      if (this.model) this.model.setPose(kind === "food" ? "idle" : kind ? "hammer" : "idle");
      if (kind) {
        const look = this.model && this.model.colors || {};
        const g = new THREE.Group();
        const hand = new THREE.Group(); g.add(hand);
        const skin = ARMS_M.skin;
        const fist = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 8), skin); fist.rotation.z = Math.PI / 2; hand.add(fist);
        const tool = kind === "eat" || kind === "food" ? makeFood(G.working.food) : kind === "reap" ? makeSickle() : kind === "pick" ? new THREE.Group() : kind === "dig" ? makeSpade() : kind === "sow" ? new THREE.Group() : kind === "saw" ? makeSaw() : kind === "craft" ? makeKnife() : kind === "stir" ? makeLadle() : kind === "toss" ? makeSpatula() : makeHammer();
        // (blades turned flat to the eye, not edge on)
        if (kind !== "hammer" && kind !== "eat" && kind !== "food" && kind !== "reap") tool.rotation.y = Math.PI / 2;
        // (the hammer's face leading the blow, square onto what it strikes — not its back)
        if (kind === "hammer") tool.rotation.y = Math.PI;
        hand.add(tool);
        // the sleeve runs from the right shoulder to the hand, wherever the hand goes (as the axe's do)
        const arm = new THREE.Group(); g.add(arm);
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 1, 10).translate(0, 0.5, 0), ARMS_M.sleeve); arm.add(sleeve);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10).translate(0, 0.035, 0), ARMS_M.cuff); arm.add(cuff);
        g.userData.hand = hand; g.userData.arm = { arm, sleeve, cuff };
        vm.add(g); this.workRig = g;
        // and the same tool in the hand of your body, for when the camera is behind you
        if (this.model && this.model.held && kind !== "eat" && kind !== "food" && kind !== "sow" && kind !== "pick") { this.workBody = kind === "reap" ? makeSickle() : kind === "dig" ? makeSpade() : kind === "saw" ? makeSaw() : kind === "craft" ? makeKnife() : kind === "stir" ? makeLadle() : kind === "toss" ? makeSpatula() : makeHammer(); this.workBody.rotation.x = Math.PI / 2; this.model.held.add(this.workBody); }
      }
    }
    if (!this.workRig) return;
    const t = (this.workT += dt), h = this.workRig.userData.hand;
    const beat = n => { const b = Math.floor(t * n); if (b !== this.workBeat) { this.workBeat = b; return true; } return false; };
    if (kind === "saw") {
      // long strokes, forward and back, the blade pointing away and down into the cut
      const k = Math.sin(t * Math.PI * 2 * 1.3);
      h.position.set(0.16, -0.28 + k * 0.012, -0.5 - k * 0.13);
      h.rotation.set(-1.25, 0, 0.12);
      if (beat(2.6) && !wk.quiet) AUDIO.whoosh(0.18, false);
    } else if (kind === "hammer") {
      // raise it slowly, bring it down fast
      const p = (t * 1.7) % 1, e = x => x * x * (3 - 2 * x);
      const a = p < 0.7 ? e(p / 0.7) * 1.2 : 1.2 - e((p - 0.7) / 0.3) * 1.35;
      h.position.set(0.24, -0.34 + a * 0.06, -0.46);
      h.rotation.set(-0.35 + a * 0.9, 0.2, 0.1);
      if (beat(1.7) && !wk.quiet) SFX.hammer && SFX.hammer();
    } else if (kind === "dig") {
      // the spade: driven down with the foot, levered back, the earth thrown aside
      const p = (t * 0.9) % 1, e = x => x * x * (3 - 2 * x);
      const down = p < 0.35 ? e(p / 0.35) : p < 0.6 ? 1 : 1 - e((p - 0.6) / 0.4);
      const lever = p > 0.35 && p < 0.75 ? Math.sin((p - 0.35) / 0.4 * Math.PI) : 0;
      // (held in the right hand, low; the haft runs forward, left and down, the blade in the ground ahead)
      h.position.set(0.2, -0.04 - down * 0.1 + lever * 0.04, -0.5 - down * 0.04);
      h.quaternion.setFromUnitVectors(_UP, _dig.set(-0.25 + lever * 0.05, -0.8 - down * 0.2 + lever * 0.35, -1.1).normalize());
      if (beat(0.9) && !wk.quiet) SFX.dig && SFX.dig();
    } else if (kind === "reap") {
      // the sickle swept low through the stalks, right to left, the left hand gathering what it cuts; then back for more
      const p = (t * 1.25) % 1, e = x => x * x * (3 - 2 * x);
      const sweep = p < 0.45 ? e(p / 0.45) : 1 - e((p - 0.45) / 0.55);
      h.position.set(0.28 - sweep * 0.4, -0.29 - Math.sin(sweep * Math.PI) * 0.05, -0.5 - Math.sin(sweep * Math.PI) * 0.08);
      h.rotation.set(-1.15 + sweep * 0.15, 0.35 - sweep * 1.0, -0.2 + sweep * 0.5);
      if (beat(1.25) && !wk.quiet) AUDIO.whoosh(0.22, false);
    } else if (kind === "pick") {
      // out to it, the fingers closing, a little twist and pull, and back to you — again and again
      const p = (t * 1.4) % 1, e = x => x * x * (3 - 2 * x);
      const out = p < 0.4 ? e(p / 0.4) : p < 0.6 ? 1 : 1 - e((p - 0.6) / 0.4), tug = p > 0.4 && p < 0.6 ? Math.sin((p - 0.4) / 0.2 * Math.PI) : 0;
      h.position.set(0.17 - out * 0.08, -0.27 + out * 0.07 - tug * 0.015, -0.42 - out * 0.16 + tug * 0.03);
      h.rotation.set(-0.5 + out * 0.4, 0.3 - tug * 0.4, 0.6 - out * 0.3);
      h.scale.setScalar(1);
      h.children[0] && (h.children[0].scale.x = 1 - (p > 0.38 && p < 0.65 ? 0.25 : 0));   // (the hand closing round it)
      if (beat(1.4) && !wk.quiet && Math.random() < 0.7) SFX.pickup && SFX.pickup();
    } else if (kind === "sow") {
      // a handful out of the sack, cast wide in an arc
      const p = (t * 1.3) % 1;
      h.position.set(0.28 - Math.sin(p * Math.PI) * 0.22, -0.3 + Math.sin(p * Math.PI) * 0.08, -0.4 - Math.sin(p * Math.PI) * 0.06);
      h.rotation.set(-0.4, 0.3 - p * 0.8, 0.2);
    } else if (kind === "stir") {
      // the ladle down in the pot: going round slowly while it simmers, hard and fast when you stir
      const busy = wk.busy && G.time < wk.busy, sp = busy ? 7 : 1.2, r = busy ? 0.05 : 0.018;
      this.stirA = (this.stirA || 0) + dt * sp;
      h.position.set(0.04 + Math.cos(this.stirA) * r, -0.3 + Math.sin(this.stirA * 2) * 0.006, -0.52 + Math.sin(this.stirA) * r * 0.8);
      h.rotation.set(-1.9, 0, 0.25 + Math.cos(this.stirA) * 0.15);
    } else if (kind === "toss") {
      // the spatula over the pan, ready; a flick under and over when you turn it
      const busy = wk.busy && G.time < wk.busy, p = busy ? 1 - (wk.busy - G.time) / 0.5 : 0, flick = Math.sin(p * Math.PI);
      h.position.set(0.12 - flick * 0.05, -0.3 + flick * 0.09 + Math.sin(t * 2) * 0.004, -0.5 - flick * 0.05);
      h.rotation.set(-1.6 + flick * 1.1, 0.2, 0.35 - flick * 0.6);
    } else if (kind === "food") {
      // held in the hand, low and to the right, ready: it moves a little with you
      h.position.set(0.2, -0.3 + Math.sin(t * 1.6) * 0.004, -0.44);
      h.rotation.set(-0.25, 0.4, 0.25 + Math.sin(t * 1.1) * 0.02);
    } else if (kind === "eat") {
      // up to the mouth, and a bite, and a bite; the view dips a little with each
      const up = Math.min(1, t / 0.35), bite = Math.max(0, Math.sin(t * Math.PI * 2 * 1.6));
      h.position.set(0.2 - up * 0.13, -0.36 + up * 0.2 - bite * 0.015, -0.46 + up * 0.2 + bite * 0.03);
      h.rotation.set(-0.3 + up * 0.5, 0.4, 0.3);
      if (t > 0.35 && beat(1.6)) AUDIO.chew && AUDIO.chew();
    } else {
      // short quick strokes of the knife toward you
      const p = (t * 3) % 1;
      h.position.set(0.13, -0.27 - p * 0.03, -0.42 + p * 0.07);
      h.rotation.set(-0.9 + p * 0.3, -0.3, 0.3);
    }
    // the sleeve, shoulder to hand
    const { arm, sleeve, cuff } = this.workRig.userData.arm, sh = new THREE.Vector3(0.3, -0.62, 0.1);
    const d = new THREE.Vector3().subVectors(h.position, sh), L = d.length();
    arm.position.copy(sh); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    sleeve.scale.set(1, Math.max(0.05, L - 0.08), 1); cuff.position.y = Math.max(0.05, L - 0.12);
  }
  // held low on the right, head up, ready
  axeRest() { const R = this.restPose(); this.axe.rotation.set(R[0], R[1], R[2]); this.axe.position.set(R[3], R[4], R[5]); }
  // (a pike or a fixed bayonet is carried levelled, its point out before you — "charge your bayonets" — not upright)
  restPose() { return THRUST.has(this.blade) ? [0.22, -0.1, 0.0, 0.28, -0.36, -0.12] : [1.05, -0.35, -0.5, 0.34, -0.5, -0.42]; }
  swing(onHit) {
    if (this.swingT >= 0 || this.swimming || G.time < (this.fixUntil || 0)) return;
    this.swingT = 0; this.onSwingHit = onHit; this._hitDone = false;
    if (this.horse && this.horse.strike) this.horse.strike();   // (the horse surging into the blow under you)
    // (a pickaxe only ever comes down from above, into the rock)
    this.swingDir = this.blade === "pick" ? "up" : this.stance || "right";
    G.practise("strength", 0.3);
    // the stroke through the air (the heavier the thing swung, the lower it sounds)
    AUDIO.whoosh(0.55, (this.blade || "axe") !== "sword");
    if (G.onSwingStart) G.onSwingStart(this.swingDir);
  }
  update(dt) {
    const w = G.world;
    const s = G.settings;
    const look = !G.cine && G.mode === "play" && !G.freecam;
    if (!look) UI.swingArrow(null);
    if (look) {
      const zs = 1 - (G.zoom || 0) * 0.6;
      this.yaw -= input.mdx * 0.0022 * s.sens * zs;
      this.pitch -= input.mdy * 0.0022 * s.sens * zs * (s.invert ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      // the stance, for a stroke or a guard: looking up at all is from above; otherwise the way the view last turned
      this.turnAcc = (this.turnAcc || 0) * Math.pow(0.05, dt) + input.mdx;
      if (this.turnAcc < -14) this.side = "left"; else if (this.turnAcc > 14) this.side = "right";
      this.stance = this.pitch > 0.04 ? "up" : (this.side || "right");
      // with a blade or the axe out and not already swinging, an arrow shows which way the next stroke comes
      UI.swingArrow(this.axe && this.swingT < 0 && !this.workKind && !UI.dialogOpen && G.mode === "play" && this.blade !== "pick" && !THRUST.has(this.blade) ? this.stance : null);
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
    const canMove = G.mode === "play" && !G.lockMove && !UI.dialogOpenBlocking && !G.freecam && !this.drowning;
    if (canMove) {
      if (input.down("KeyW") || input.down("ArrowUp")) mz -= 1;
      if (input.down("KeyS") || input.down("ArrowDown")) mz += 1;
      if (input.down("KeyA") || input.down("ArrowLeft")) mx -= 1;
      if (input.down("KeyD") || input.down("ArrowRight")) mx += 1;
    }
    // (not while the camera flies free: there C takes the camera down, not you)
    if (!G.freecam && (input.hit("KeyC") || input.hit("ControlLeft"))) this.crouched = !this.crouched;
    let sprint = (input.down("ShiftLeft") || input.down("ShiftRight")) && !this.crouched;
    // in deep water, out of your depth: swimming (not on a horse, not in a boat)
    this.swimUpdate(dt, w, mx || mz);
    if (this.swimming) {
      // the water takes your strength fast, and gives none of it back till you're out: when it's gone, you go under
      // (Shift: a hard stroke, quicker, and quicker spent)
      if (G.stamina === undefined) G.stamina = 1;
      const drain = (mx || mz ? (sprint ? 1 / 4.5 : 1 / 8.5) : 1 / 14) * (G.staminaMul ?? 1) * staminaDrain(G.body);
      if (!this.drowning) G.stamina = Math.max(0, G.stamina - dt * drain);
      if (G.stamina <= 0) this.drown();
      this.winded = false;
      UI.stamina(G.stamina, G.stamina < 0.25);
    } else if (G.stamina !== undefined) {
      if (this.winded && G.stamina > 0.35) this.winded = false;
      const hungry = G.body && G.body.hunger < 0.2 ? 0.5 : 1;
      if (sprint && !this.winded && this.speed > 1) { G.stamina = Math.max(0, G.stamina - dt / 5.5 * (G.staminaMul ?? 1) * staminaDrain(G.body)); if (G.stamina < 0.5) G.practise("endurance", dt * 0.5); }
      else G.stamina = Math.min(1, G.stamina + dt / (sprint ? 9 : 3.5) * hungry * (G.body && G.body.plague > 0 ? 0.5 : 1) * (2 - staminaDrain(G.body)));
      if (G.stamina <= 0) this.winded = true;
      if (this.winded) sprint = false;
      // the bar shows while you are short of breath, and goes once you have it back
      // (red while winded, and only then: red means you cannot sprint)
      UI.stamina(G.stamina < 0.995 ? G.stamina : null, this.winded);
    } else UI.stamina(null);
    // out of breath, you hear it: in and out, faster and louder the more spent you are (and when badly hurt)
    {
      const spent = Math.max(G.stamina !== undefined ? clamp((0.75 - G.stamina) / 0.75, 0, 1) * (this.winded ? 1.2 : 1) : 0, G.health !== undefined && G.health < 0.35 ? (0.35 - G.health) * 2 : 0, G.panting > 0 ? Math.min(1, G.panting / 4) : 0);
      if (G.panting > 0) G.panting = Math.max(0, G.panting - dt);
      this.breathT = (this.breathT ?? 0) - dt;
      if (spent > 0.15 || (this.breathTail || 0) > 0) {
        if (spent > 0.15) this.breathTail = 3;        // a few breaths more after you have it back
        else this.breathTail -= dt;
        if (this.breathT <= 0) {
          const k = Math.max(spent, 0.2), period = 1.9 - k * 1.1;
          AUDIO.breath && AUDIO.breath(true, 0.35 + k * 0.65, period, G.who === "sister");
          setTimeout(() => AUDIO.breath && AUDIO.breath(false, 0.35 + k * 0.65, period, G.who === "sister"), period * 420);
          this.breathT = period;
        }
      }
    }
    heartTick(dt);
    // health: blows take it, and it comes back slowly once nothing has hit you for a while
    if (G.health !== undefined) {
      G.hurtT = (G.hurtT || 0) + dt;
      const b = G.body, starving = b && b.hunger <= 0, hungry = b && b.hunger < 0.2;
      if (b && b.hunger < 0.5 && G.guide) G.guide("hunger");
      // the plague: it eats at you, and nothing mends while you have it; left alone it passes, or it kills you
      const sick = b && b.plague > 0;
      if (sick && G.mode === "play" && !G.downed) {
        b.plague = Math.max(0, b.plague - dt); b.dirty = true;
        G.health = Math.max(0, G.health - dt / 330);
        if (G.health <= 0) G.die("plague");
        else if (b.plague <= 0) UI.hint("The fever breaks. You've come through the plague.", 5);
        if ((this.coughT = (this.coughT || 4) - dt) <= 0) { this.coughT = 5 + Math.random() * 6; AUDIO.voice && AUDIO.voice("pain", { high: G.who === "sister", vol: 0.5 }); }
      }
      // ill from bad water: the flux — nothing mends, and it wears you down, until it passes
      const ill = b && b.ill;
      if (ill && G.mode === "play" && !G.downed) {
        ill.t -= dt; b.dirty = true;
        G.health = Math.max(0.02, G.health - dt * (ILLS[ill.id] ? ILLS[ill.id].drain : 0.002));
        if (ill.t <= 0) { b.ill = null; UI.hint(`The worst of ${ILLS[ill.id] ? ILLS[ill.id].name : "it"} has passed. Boil your water.`, 5); }
      }
      if (G.hurtT > healDelay(b) && G.health < 1 && !G.downed && !hungry && !sick && !ill && !G.arena) {
        const h0 = G.health; G.health = Math.min(1, G.health + dt * healRate(b));
        G.practise("healing", (G.health - h0) * 40);
      }
      // with nothing in you at all, you weaken, and in the end it kills you
      if (starving && !G.downed) { G.health = Math.max(0, G.health - dt / 240); if (G.health <= 0) G.die("hunger"); }
      // with no water in you, sooner; and low on either, a slow weakening even before they're gone
      else if (b && !G.downed && G.mode === "play" && (b.hunger < 0.1)) G.health = Math.max(0.05, G.health - dt / 700);
      if (G.mode === "play") { hungerTick(b, dt, sprint && this.speed > 1); }
      // the cold and the heat: out of doors (not in the city's streets and houses), the gauge fills; full, it hurts
      let temp = null;
      if (G.world && (G.world.outdoors || G.world.land) && G.mode === "play" && !G.cine) {
        temp = G.temp = tickTemperature(G, dt);
        if (temp && Math.abs(temp.g) >= 0.999 && !G.downed) {
          const cold = temp.g < 0;
          if (G.mp) { if ((G.expT = (G.expT || 0) - dt) <= 0) { G.expT = 6; G.mp.net.send({ t: "exposure", cold }); } }
          else { G.health = Math.max(0, G.health - dt / 160); if (G.health <= 0) G.die(cold ? "cold" : "heat"); }
        }
        if (temp && G.guide) { if (temp.g < -0.4) G.guide("cold"); else if (temp.g > 0.4) G.guide("heat"); }
        if (temp && !G._toldCold && temp.g < -0.35) { G._toldCold = true; UI.hint("The cold's getting into you. A fire, a cave or a roof over you will warm you — a warmer coat keeps it out.", 6); }
        if (temp && !G._toldHeat && temp.g > 0.35) { G._toldHeat = true; UI.hint("The heat's getting to you. Get into the shade — a roof, a cave — or wear less: shirtsleeves and a brimmed hat.", 6); }
      }
      UI.vitals(G.mode === "play" && !G.cine ? G.health : null, b ? b.hunger : 1, !G.hasMap, sick || !!ill, null, temp);
    } else UI.vitals(null);
    if (sprint && this.crouched) this.crouched = false;
    // (a bow drawn: no running, and a slow, careful step)
    if (this.draw > 0) sprint = false;
    // (a path is quicker going: a quarter faster along it; looked for a few times a second)
    if ((this.pathT = (this.pathT || 0) - dt) <= 0) { this.pathT = 0.15; this.onPath = !!(G.town && G.town.pathAt && G.town.pathAt(this.pos.x, this.pos.z)); this.wading = G.world && G.world.waterDepth ? G.world.waterDepth(this.pos.x, this.pos.z) : 0; }
    // (wading is slow going, and slower the deeper)
    const wade = this.wading > 0.05 && !this.horse ? 1 - Math.min(0.55, this.wading * 0.7) : 1;
    const max = this.swimming ? (sprint ? 2.7 : 1.8) : (this.draw > 0 ? 1.6 - this.draw * 0.5 : 1) * (this.crouched ? 1.5 : sprint ? (G.sprintSpeed ?? 5.6) : 3.1) * (G.town ? G.town.walkMul : 1) * (G.loadMul ?? 1) * (this.onPath ? PATH_SPEED : 1) * (this.horse ? (sprint ? 1.6 : 2.0) : 1) * wade;
    if (this.horse) this.crouched = false;
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
    // (a jump costs breath: winded, you can't jump at all; tired, it's only a hop)
    if (canMove && input.hit("Space") && this.onGround && !this.swimming && !UI.dialogOpen && !(this.winded && G.stamina !== undefined)) {
      const st = G.stamina ?? 1;
      this.vy = 4.6 * (st < 0.2 ? 0.7 : 1); this.onGround = false;
      if (G.stamina !== undefined) { G.stamina = Math.max(0, G.stamina - 0.12 * (G.staminaMul ?? 1) * staminaDrain(G.body)); if (G.stamina <= 0) this.winded = true; }
    }
    this.vy -= 16 * dt;
    this.pos.y += this.vy * dt;
    if (w) {
      w.col.resolve(this.pos, this.radius, this.pos.y + 0.3, this.crouched ? 1.1 : 1.7);
      // boxed in on every side (a building finished round you, a crowd, a bad spawn): step out to the nearest clear ground
      if ((this.unstickT = (this.unstickT || 0) - dt) <= 0) {
        this.unstickT = 0.5;
        const y = this.pos.y + 0.9, free = (x, z) => !w.col.solidAt(x, y, z, this.radius);
        let open = 0;
        for (let k = 0; k < 8; k++) if (free(this.pos.x + Math.cos(k * Math.PI / 4) * 0.35, this.pos.z + Math.sin(k * Math.PI / 4) * 0.35)) open++;
        if (!open) for (let r = 0.6, found = false; r <= 6 && !found; r += 0.4) for (let k = 0; k < 16 && !found; k++) {
          const x = this.pos.x + Math.cos(k * Math.PI / 8) * r, z = this.pos.z + Math.sin(k * Math.PI / 8) * r;
          if (free(x, z)) { this.pos.x = x; this.pos.z = z; found = true; }
        }
      }
      if (w.bounds) {
        const b = w.bounds;
        this.pos.x = clamp(this.pos.x, b.x0, b.x1); this.pos.z = clamp(this.pos.z, b.z0, b.z1);
      }
      if (w.constrain) w.constrain(this.pos);
      // (in a house with an upper floor, the floor under your feet: the stair, or the loft)
      let gy = w.floorAt ? w.floorAt(this.pos.x, this.pos.z, this.pos.y) : w.heightAt(this.pos.x, this.pos.z);
      // (swimming: afloat, your head above the water, rising and falling a little with your strokes)
      if (this.swimming) gy = Math.max(gy, this.swimSurf - 1.32 + Math.sin(this.swimT * 3.2) * 0.04);
      const was = this.onGround, fall = this.vy;
      if (this.pos.y <= gy) { this.pos.y = gy; this.vy = 0; this.onGround = true; }
      else if (this.pos.y - gy < 0.25 && this.vy <= 0) { this.pos.y = gy; this.vy = 0; this.onGround = true; }
      else this.onGround = false;
      // landing: the knees take it — the view drops and comes back, harder the further you fell, and a thud underfoot
      if (!was && this.onGround && fall < -2.5) {
        G.landDip = Math.max(G.landDip || 0, Math.min(0.2, -fall * 0.022));
        AUDIO.step(this.surface || "grass", Math.min(1.2, -fall * 0.12), { heavy: true });
      }
    }
    this.speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);

    // on horseback: the horse under you, its legs going with the pace, and its hooves on the ground
    if (this.horse) {
      const h = this.horse;
      h.root.position.set(this.pos.x, this.pos.y, this.pos.z); h.root.rotation.y = this.yaw + Math.PI;
      h.phase = h.gait(dt, this.speed);
      // (hoofbeats: each hoof as it comes down — the walk's four, the trot's two, the gallop's drumming three and the
      //  moment in the air; the tack jingling with the pace, and now and then a snort)
      if (this.onGround) for (const i of h.falls) FOLEY.hoof(null, (this.speed > 6 ? 0.75 : 0.55) * (i < 2 ? 1 : 0.85));
      if (this.speed > 1.5 && h.falls.length && Math.random() < 0.18 * Math.min(1, this.speed / 6)) FOLEY.tack(null, 0.22);
      if ((h.snortT = (h.snortT ?? 8) - dt) <= 0) { h.snortT = 8 + Math.random() * 14; if (this.speed > 3 || Math.random() < 0.4) FOLEY.snort(null, 0.4); }
    }
    // footsteps
    if (this.onGround && this.speed > 0.4 && !this.horse) {
      this.stride += this.speed * dt;
      const every = sprint ? 1.6 : 1.25;
      if (this.stride > every) { this.stride = 0; AUDIO.step(w && w.surfaceAt ? w.surfaceAt(this.pos.x, this.pos.z) : "grass", this.crouched ? 0.25 : sprint ? 0.75 : 0.55, { fast: sprint }); }
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
    const targetEye = this.horse ? 2.35 : this.seated ? 1.2 : this.crouched ? 1.05 : 1.62;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    // body
    if (this.model) {
      const m = this.model;
      m.root.position.set(this.pos.x, this.pos.y, this.pos.z);
      m.root.rotation.y = this.yaw + Math.PI;
      // (a model with a crouch of its own crouches; an older one is squat)
      m.crouching = this.crouched && !this.swimming;
      m.body.scale.y = (this.model.scaleBase ?? 1) * (this.crouched && !(m.has && m.has("crouch")) ? 0.7 : 1);
      // on a bench or a stool, your body sits too
      m.sitting += ((this.seated || this.horse ? 1 : 0) - m.sitting) * Math.min(1, dt * 6);
      if (this.swimming) m.setPose("swim"); else if (m.pose === "swim") m.setPose("idle");
      m.update(dt, this.seated || this.horse ? 0 : this.speed);
      m.body.rotation.z = this.lean * 0.28;
      // first person, your own body is there when you look down: all of you but the head (the camera is in it)
      // and the right arm (the one on the screen, holding what you hold), set a little back so none of it is in the lens
      const fp = !G.forceThird && !G.freecam;
      if (this.horse) m.root.position.y += 1.02;
      if (fp) { const bk = G.fpBack ?? 0.12; m.root.position.x += Math.sin(this.yaw) * bk; m.root.position.z += Math.cos(this.yaw) * bk; m.root.position.y -= G.fpDown ?? 0.05; }
      firstPersonBones(m, fp);
      // (and the gun at your body's shoulder is the one on the screen, first person: not drawn twice)
      m.aimHidden = fp;
      // (first person in the water, your own body's under you and out of sight: the arms on the screen do the swimming)
      m.root.visible = !(fp && this.swimming);
    }

    // the guard: right mouse held with the axe or a weapon out (and nothing in front of you to use) —
    // the haft brought up across you. Raised just as a blow comes, it turns it aside: a parry.
    // (a musket too, with the steel close: brought up crosswise, barrel and stock, to take the blow — a man within a few
    //  paces is no one to aim at)
    const guard = (!!this.axe || (!!this.gun && !!G.meleeNear && !(this.gunReload > 0) && !(this.thrustT >= 0))) && input.rdown && !G.interactTarget && this.swingT < 0 && G.mode === "play" && !G.lockMove && !G.downed;
    // (raised, or moved to another side, just now: that is what makes a parry)
    if (guard && (!this.guard || this.stance !== this._gs)) this.guardAt = G.time;
    this.guard = guard; this._gs = this.stance;
    // the guard where the blow will come: across above you, or upright on the left or the right;
    // the hands move there (and from one side to another) quickly, but not in no time
    const R = this.restPose();
    const U = { up: [0.15, 1.35, 0.2, 0.3, -0.12, -0.6], right: [1.45, 0.1, 0.0, 0.3, -0.34, -0.52], left: [1.45, -0.1, 0.0, -0.2, -0.34, -0.52] }[this.stance || "right"];
    const want = guard ? U : R;
    if (!this.gp) this.gp = R.slice();
    const k = Math.min(1, dt * 16);
    let off = 0;
    for (let i = 0; i < 6; i++) { this.gp[i] += (want[i] - this.gp[i]) * k; off += Math.abs(this.gp[i] - R[i]); }
    if (this.axe && this.swingT < 0 && (guard || off > 0.002)) {
      const jolt = Math.max(0, (this.parryJolt || 0) - G.time) * 0.3, P = this.gp;
      this.axe.rotation.set(P[0], P[1], P[2]);
      this.axe.position.set(P[3], P[4] + jolt, P[5] + jolt);
    } else if (this.swingT >= 0) this.gp = R.slice();
    // the axe
    if (this.swingT >= 0) {
      // (just after the blade bites, the stroke all but stops for a moment: you feel it hit)
      this.swingT += dt * ((this.impactT || 0) - G.time > 0.11 ? 0.1 : 1) * (this.swingRate || 1);
      const T = this.swingT;
      if (this.axe) {
        // (pitch, yaw, roll) of the hands, and where they are: a level swing from right to left
        const e = x => x * x * (3 - 2 * x), L = (a, b, k) => a + (b - a) * k;
        // (pitch, yaw, roll, x, y, z) — from the right (a level stroke leftward), from the left (backhand, rightward), or from above
        const REST = THRUST.has(this.blade) ? this.restPose() : [1.05, -0.35, -0.5, 0.3, -0.42, -0.4];
        const [BACK, HIT, THRU] = {
          right: [[0.25, -1.25, 0.0, 0.42, -0.24, -0.26], [0.18, 0.75, 0.0, 0.1, -0.3, -0.46], [0.2, 1.6, 0.0, -0.12, -0.34, -0.36]],
          left: [[0.25, 1.2, 0.0, -0.3, -0.22, -0.3], [0.18, -0.7, 0.0, 0.02, -0.3, -0.46], [0.2, -1.5, 0.0, 0.3, -0.36, -0.36]],
          up: [[1.95, -0.1, 1.57, 0.2, -0.3, -0.3], [0.25, 0.0, 1.57, 0.08, -0.3, -0.5], [-0.4, 0.0, 1.57, 0.06, -0.44, -0.42]],   // (the head of the pick goes back over your shoulder; your hands stay low, at your chest)
          // (a spear is never swung: drawn back level at the hip, then driven straight out before you, and back)
          thrust: [[0.1, -0.1, 0.0, 0.3, -0.34, 0.02], [0.02, -0.03, 0.0, 0.16, -0.27, -0.92], [0.03, -0.03, 0.0, 0.17, -0.28, -0.82]],
        }[THRUST.has(this.blade) ? "thrust" : this.swingDir || "right"];
        const pose = (A, B, k) => { k = e(k); this.axe.rotation.set(L(A[0], B[0], k), L(A[1], B[1], k), L(A[2], B[2], k)); this.axe.position.set(L(A[3], B[3], k), L(A[4], B[4], k), L(A[5], B[5], k)); };
        if (T < 0.2) pose(REST, BACK, T / 0.2);
        else if (T < 0.29) pose(BACK, HIT, (T - 0.2) / 0.09);
        else if (T < 0.36) pose(HIT, THRU, (T - 0.29) / 0.07);
        else pose(THRU, REST, Math.min(1, (T - 0.36) / 0.3));
      }
      if (this.model) { this.model.setPose(THRUST.has(this.blade) ? "punch" : this.swingDir === "up" ? "overhead" : G.arena ? "slash" : "chop"); this.model.poseT = T / 1.25 * 1; }
      if (T > 0.29 && !this._hitDone) {
        this._hitDone = true; const before = this.impactT || 0;
        this.onSwingHit && this.onSwingHit();
        // (a stroke that met nothing else, with the axe or a blade — not the pick — takes down a bush in front of you)
        if ((this.impactT || 0) === before && this.blade !== "pick" && G.world && G.world.cutShrub && G.world.cutShrub(this)) G.impact && G.impact();
      }
      if (T > 0.62) { this.swingT = -1; if (this.axe) this.axeRest(); if (this.model) this.model.setPose("idle"); }
    }
    // the sleeves follow wherever the hands have gone this frame
    if (this.axe) this.fitArms();
    this.updateBow(dt);
    this.updateXbow(dt);
    this.updateGun(dt);
    this.updateWork(dt);
  }
  // ---- swimming ----
  // in the water or out of it, each frame: your tools put away while you swim (and back in your hands on the shore),
  // the dry ground you last stood on remembered, and the arms on the screen stroking
  swimUpdate(dt, w, moving) {
    let deep = 0, ground = 0;
    if (w && w.waterDepth && !this.horse && !G.noSwim) { ground = w.heightAt(this.pos.x, this.pos.z); deep = w.waterDepth(this.pos.x, this.pos.z); }
    const surf = ground + deep + (deep > 0.5 && w.waveHeight ? w.waveHeight(this.pos.x, this.pos.z) : 0);
    // (out of your depth and down in it — not stood on a tower over it, nor in a boat on it)
    const was = this.swimming;
    this.swimming = deep > (was ? 1.05 : 1.2) && this.pos.y < surf - 0.6;
    if (this.swimming) {
      this.swimSurf = surf; this.swimT = (this.swimT || 0) + dt * (moving ? 1 : 0.45);
      if (!was) {
        this.swimStow = { axe: !!this.axe || this.swimStow?.axe, bow: !!this.bow, gun: !!this.gun };
        FOLEY_SPLASH(this.pos, 0.6);
        if (!this.toldSwim) { this.toldSwim = true; UI.hint("Out of your depth — swimming. It takes your strength fast (Shift: a hard stroke, faster spent). Make for land before the bar runs out.", 5); }
      }
      if (this.axe) this.holsterAxe(true);
      if (this.bow) this.showBow(false);
      if (this.gun) this.showGun(false);
      if (this.crouched) this.crouched = false;
      // the strokes: a splash now and then as the arms come round
      const ph = (this.swimT * 0.55) % 1;
      if (moving && (this.lastStroke ?? 1) > ph) FOLEY_SPLASH(this.pos, 0.25);
      this.lastStroke = ph;
    } else {
      if (was && this.swimStow) {
        const st = this.swimStow; this.swimStow = null;
        if (st.axe) this.holsterAxe(false); else if (st.bow) this.showBow(true); else if (st.gun) this.showGun(true);
      }
      // the last dry ground you stood on, a few seconds back: where you come to if the water takes you
      if (this.onGround && deep < 0.15 && !this.drowning && w) {
        if ((this.landT = (this.landT || 0) - dt) <= 0) {
          this.landT = 0.5;
          (this.landTrail ??= []).push({ x: this.pos.x, z: this.pos.z, yaw: this.yaw });
          if (this.landTrail.length > 8) this.landTrail.shift();
        }
      }
    }
    this.swimArms(dt, this.swimming && !G.forceThird && !G.freecam, moving);
  }
  // the water takes you: everything goes dark, and you come to on the last dry ground you stood on, spent and coughing
  drown() {
    if (this.drowning) return;
    this.drowning = true;
    UI.hint("Your strength's gone — the water's taking you under…", 2.5);
    FOLEY_SPLASH(this.pos, 0.9);
    UI.fade(1, 0.9).then(() => {
      const t = (this.landTrail || []).filter(p => !G.world || !G.world.waterDepth || G.world.waterDepth(p.x, p.z) < 0.15);
      const p = t[0] || t[t.length - 1];
      if (p) this.place(p.x, p.z, p.yaw); this.vel.set(0, 0, 0);
      this.landTrail = p ? [p] : [];
      G.stamina = 0.4; this.winded = true;
      // (a hurt for it, in a game whose health is yours to keep — in a game on a server, the server keeps it)
      if (!G.mp && G.health !== undefined) G.health = Math.max(0.05, G.health - 0.15);
      G.panting = 4;
      this.drowning = false;
      UI.fade(0, 1.1);
      UI.hint("The water took you under. You come to on the shore, coughing it up.", 4.5);
    });
  }
  // your two arms on the screen, in the water: out together in front, apart in a wide sweep, and drawn back in to the
  // chest — a breaststroke, slower when you only tread water
  swimArms(dt, on, moving) {
    if (!on) { if (this.swimRig) this.swimRig.visible = false; return; }
    if (!this.swimRig) {
      const g = this.swimRig = new THREE.Group(); vm.add(g);
      this.swimLimbs = [-1, 1].map(side => {
        const arm = new THREE.Group();
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 1, 10).translate(0, 0.5, 0), ARMS_M.sleeve); arm.add(sleeve);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10).translate(0, 0.035, 0), ARMS_M.cuff); arm.add(cuff);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.12).translate(0, 0, -0.05), ARMS_M.skin);
        g.add(arm, hand); return { side, arm, sleeve, cuff, hand };
      });
    }
    this.swimRig.visible = true;
    // (the cycle: 0 hands together at the chest .. 0.3 reached out in front .. 0.65 swept wide .. 1 drawn back in)
    const ph = (this.swimT * 0.55) % 1, e = x => x * x * (3 - 2 * x);
    const key = [[0, 0.09, -0.27, -0.42], [0.3, 0.07, -0.16, -0.85], [0.65, 0.5, -0.19, -0.62], [1, 0.09, -0.27, -0.42]];
    let k = 0; while (k < key.length - 2 && ph > key[k + 1][0]) k++;
    const [t0, x0, y0, z0] = key[k], [t1, x1, y1, z1] = key[k + 1], f = e((ph - t0) / (t1 - t0));
    const hx = x0 + (x1 - x0) * f, hy = y0 + (y1 - y0) * f + (moving ? 0 : 0.03), hz = z0 + (z1 - z0) * f;
    const sweep = k === 1 ? f : k === 2 ? 1 - f : 0;            // (palms turned out as they sweep apart)
    for (const L of this.swimLimbs) {
      const h = new THREE.Vector3(hx * L.side, hy, hz), sh = new THREE.Vector3(0.24 * L.side, -0.5, 0.08);
      L.hand.position.copy(h); L.hand.rotation.set(-0.15, 0, L.side * (0.25 + sweep * 0.9));
      const d = new THREE.Vector3().subVectors(h, sh), len = d.length();
      L.arm.position.copy(sh); L.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      L.sleeve.scale.set(1, Math.max(0.05, len - 0.08), 1); L.cuff.position.y = Math.max(0.05, len - 0.11);
    }
  }
  // where your eyes are, leaning included
  // up on a horse from the stable, and down again (it goes back there by itself)
  mount() {
    if (this.horse) return;
    this.horse = makeHorse(0x6a4428); G.scene.add(this.horse.root);
    this.radius = 0.55; if (this.axe) this.giveAxe(false);
    AUDIO.step("dirt", 0.8);
  }
  dismount() {
    if (!this.horse) return;
    G.scene.remove(this.horse.root); this.horse = null; this.radius = 0.32;
  }
  eyePos() {
    const l = this.lean * 0.5;
    return new THREE.Vector3(this.pos.x + Math.cos(this.yaw) * l, this.pos.y + this.eye - Math.abs(this.lean) * 0.08, this.pos.z - Math.sin(this.yaw) * l);
  }
}

// ---------------------------------------------------------------------------
//  the camera: over the eyes, or over the shoulder
// ---------------------------------------------------------------------------
const _cam = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _dig = new THREE.Vector3();
// the free camera (;): the view leaves your body and goes where you steer it — WASD, Space up, C down, Shift quicker
function freeCamera(dt) {
  const f = G.freecam;
  if (G.mode === "play") {
    const s = G.settings;
    f.yaw -= input.mdx * 0.0022 * s.sens; f.pitch = clamp(f.pitch - input.mdy * 0.0022 * s.sens * (s.invert ? -1 : 1), -1.5, 1.5);
    // (the wheel sets the pace: slower for close work, much faster to cross the country)
    const sp = (input.down("ShiftLeft") || input.down("ShiftRight") ? 22 : 7) * (f.mul || 1) * dt;
    const fx = -Math.sin(f.yaw) * Math.cos(f.pitch), fy = Math.sin(f.pitch), fz = -Math.cos(f.yaw) * Math.cos(f.pitch);
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
    const k = (a, b) => (input.down(a) ? 1 : 0) - (input.down(b) ? 1 : 0);
    const fw = k("KeyW", "KeyS"), st = k("KeyD", "KeyA"), up = k("Space", "KeyC");
    f.x += (fx * fw + rx * st) * sp; f.y += (fy * fw + up) * sp; f.z += (fz * fw + rz * st) * sp;
    const w = G.world; if (w && w.heightAt) f.y = Math.max(f.y, w.heightAt(f.x, f.z) + 0.3);
  }
  camera.rotation.set(f.pitch, f.yaw, 0, "YXZ");
  camera.position.set(f.x, f.y, f.z);
  const p = G.player;
  // (nothing held in front of the lens: your arms stay with you)
  for (const c of camera.children) c.visible = false;
  if (p.model) p.model.root.visible = true;
}
// (out of the free camera without fuss: a chapter starting or the title screen ends it)
G.endFreecam = () => { if (G.freecam) G.toggleFreecam(); document.body.classList.remove("freecam"); };
G.toggleFreecam = () => {
  if (G.freecam) {
    for (const [c, v] of G.freecam.shown) c.visible = v;
    // (what's in your hands always back in them: the free camera taken up after you'd fallen — at a battle's end —
    //  remembered them hidden, and the next battle began with no gun to be seen)
    vm.visible = !G.deathCam;
    // (back in yourself standing, as you went out)
    G.player.crouched = !!G.freecam.crouched;
    G.freecam = null; if (G.player.model) G.player.model.root.visible = false; document.body.classList.remove("freecam"); return false;
  }
  const p = G.player, e = p.eyePos();
  G.freecam = { x: e.x, y: e.y, z: e.z, yaw: p.yaw, pitch: p.pitch, shown: camera.children.filter(c => c !== vm).map(c => [c, c.visible]), crouched: !!p.crouched };
  document.body.classList.add("freecam");
  return true;
};
function updateCamera(dt) {
  const p = G.player;
  // (dead: the eye goes where the head goes, as the body falls — see pvp.js — and nothing in your hands)
  if (G.deathCam) { G.deathCam(camera, dt); vm.visible = false; sky.position.copy(camera.position); G.wasDeathCam = true; return; }
  if (G.wasDeathCam) { G.wasDeathCam = false; camera.up.set(0, 1, 0); vm.visible = true; }
  if (G.freecam) { freeCamera(dt); sky.position.copy(camera.position); return; }
  const third = !!G.forceThird;   // first person always; only a scene may step the camera back
  const bobY = third ? 0 : Math.sin(p.bob * 2) * 0.035 * Math.min(1, p.speed / 3);
  const bobX = third ? 0 : Math.cos(p.bob) * 0.025 * Math.min(1, p.speed / 3);
  camera.rotation.set(p.pitch, p.yaw, third ? 0 : -p.lean * 0.18);
  const eye = p.eyePos();
  // breathing: out of breath, or in a tense moment (G.tension, set by the story), the view rises and falls with it —
  // slow and shallow when you are only afraid, quicker and deeper when you have been running
  const winded = clamp((0.75 - (G.stamina ?? 1)) / 0.75, 0, 1), tense = G.tension || 0;
  const heave = Math.max(winded, tense * 0.6);
  G.breathT = (G.breathT || 0) + dt * (1.5 + 2.6 * winded + 0.6 * tense);
  const breath = third ? 0 : Math.sin(G.breathT) * 0.026 * heave;
  if (!third) camera.rotation.x += breath * 0.3;
  // shaken: a blow jolts the view hard and dies away quickly; gasping for breath, it trembles
  if (!third) {
    const hs = G.hitShake || 0, pant = G.panting > 0 ? Math.min(1, G.panting / 5) : 0, gasp = Math.max(pant, winded > 0.6 ? (winded - 0.6) * 1.5 : 0) * 0.35;
    const tt = G.time;
    camera.rotation.x += (Math.sin(tt * 37) * 0.6 + Math.sin(tt * 23.3) * 0.4) * 0.05 * hs + Math.sin(tt * 13.1) * 0.006 * gasp;
    camera.rotation.y += (Math.sin(tt * 31.7) * 0.6 + Math.sin(tt * 19.1) * 0.4) * 0.05 * hs + Math.sin(tt * 11.3) * 0.006 * gasp;
    camera.rotation.z += Math.sin(tt * 27.1) * 0.04 * hs;
    G.hitShake = Math.max(0, hs - dt * 2.2);
  }
  // (the landing: down quickly, and back up more slowly)
  const land = G.landDip || 0;
  if (land > 0) { G.landPhase = (G.landPhase || 0) + dt * 7; G.landDip = Math.max(0, land - dt * 0.55); if (G.landDip === 0) G.landPhase = 0; }
  const landY = land > 0 ? -land * Math.min(1, (G.landPhase || 0) * 3) : 0;
  if (!third && land > 0) camera.rotation.x -= land * 0.35 * Math.min(1, (G.landPhase || 0) * 3);
  if (!third) {
    camera.position.set(eye.x + bobX * Math.cos(p.yaw), eye.y + bobY + breath + landY, eye.z - bobX * Math.sin(p.yaw));
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
  // (put by while you fish: the rod is in your hands then, and the arms that held the axe hold it)
  if (p.axe) p.axe.visible = !third && !p.workKind && !G.fishing;
  if (G.fishing) { for (const a of p.arms || []) if (a.arm) a.arm.visible = false; p.fishHid = true; }
  else if (p.fishHid) { p.fishHid = false; for (const a of p.arms || []) if (a.arm) a.arm.visible = !third; }
  if (p.gun) p.gun.visible = !third && !p.workKind;
  viewModel(dt, p, third);
  if (p.workRig) p.workRig.visible = !third;
  // hold Z to look closer
  const zoomWant = G.mode === "play" && input.down("KeyZ") ? 1 : Math.max((p.draw || 0) * 0.55, (p.gun ? p.gunAim || 0 : 0) * 0.35);
  G.zoom = (G.zoom || 0) + (zoomWant - (G.zoom || 0)) * Math.min(1, dt * 10);
  const fov = G.settings.fov + (28 - G.settings.fov) * G.zoom + (G.fovKick || 0);
  // the view shaken by a blow, given or taken
  if (G.shakeA > 0.001 && !third) { const s = G.shakeA * G.shakeA; camera.rotation.x += (Math.random() - 0.5) * s * 0.07; camera.rotation.y += (Math.random() - 0.5) * s * 0.05; camera.rotation.z += (Math.random() - 0.5) * s * 0.06; }
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // the sun's shadow follows the player
  const sd = G.sunDir || new THREE.Vector3(0, 1, 0);
  sun.position.set(p.pos.x + sd.x * 90, p.pos.y + sd.y * 90, p.pos.z + sd.z * 90);
  sun.target.position.set(p.pos.x, p.pos.y, p.pos.z);
  sky.position.copy(camera.position);
  // (the clouds drift on, with the wind)
  sky.material.uniforms.cloudT.value = (G.time || 0) * (1 + (G.windV ? Math.hypot(G.windV.x, G.windV.z) : 0.4));
}

// a tool used: a stroke's wear on it; worn through, it's put down (and you're told)
G.wear = (k, n = 1) => {
  const r = G.body && wearTool(G.body, k, n);
  if (!r) return;
  UI.hint(r.text, r.broke ? 4.5 : 3);
  if (r.broke) {
    AUDIO.clang && AUDIO.clang(0.6);
    const pl = G.player;
    // (the pickaxe or your own sword gone from your hands: the axe again, if you have one)
    if (pl && pl.axe && pl.blade === k && !(G.body.tools[k] > 0)) { if (pl.hasAxe || k !== "axe") pl.wield("axe"); }
    else if (pl && pl.axe && k === "axe" && (pl.blade || "axe") === "axe") pl.wield("axe");
  }
};
// a shot's smoke: the flash at the muzzle, the jet of powder smoke rolling out and hanging, and the puff from the pan
// (powder.js); no new light for the flash, which would stall the game a moment as it was made
// (k: a pistol's is about half a musket's)
function gunSmoke(at, dir, k = 1) {
  if (!G.world) return;
  muzzleFlash(G.world.root, at, dir, k);
  // (a thick white cloud, as black powder makes: rolling out of the muzzle, and a bank of it hanging after)
  powderSmoke(G.world.root, at, dir, { scale: k, life: 16 * Math.sqrt(k), n: Math.round(36 * k), speed: 9 * k, haze: true, hazeN: Math.round(8 * k), hazeA: 0.3 });
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  panPuff(G.world.root, at.clone().addScaledVector(dir, k < 1 ? -0.3 : -0.95).addScaledVector(side, 0.06));
}
// (a shot puts the birds up out of the woods round about)
G.gunSmoke = (at, dir, k = 1) => { gunSmoke(at, dir, k); if (G.startleBirds && Math.random() < 0.7) G.startleBirds(at.x + dir.x * 25, at.z + dir.z * 25); };
// a blow that landed on something (a tree, a rock, a man): the stroke checks and your arms jar
G.impact = () => { if (G.player) G.player.impactT = G.time + 0.18; };
// ---- your hands on the screen, moving as you move ----
const VM = { sx: 0, sy: 0, svx: 0, svy: 0, fy: 0, fv: 0, roll: 0, sprint: 0, crouch: 0, raise: 1, held: "", yaw: null, pitch: 0, t: 0 };
// a spring a little short of settling at once: it overshoots a touch and comes back, as a held weight does
const spring = (x, v, to, dt, k = 140, d = 17) => { v += ((to - x) * k - v * d) * dt; return [x + v * dt, v]; };
function viewModel(dt, p, third) {
  if (third) return;
  vm.traverse(o => { if (o.isMesh && !Array.isArray(o.material) && o.material.userData.detail && !o.material.userData.detail.local) o.material = ownGrain(o.material); });
  dt = Math.min(dt, 1 / 30);
  VM.t += dt;
  // how fast the view turned this frame: the hands lag behind it, and catch up
  if (VM.yaw === null) { VM.yaw = p.yaw; VM.pitch = p.pitch; }
  const yv = angDiff(VM.yaw, p.yaw) / dt, pv = (p.pitch - VM.pitch) / dt;
  VM.yaw = p.yaw; VM.pitch = p.pitch;
  const aim = Math.max(p.draw || 0, G.zoom || 0), steady = 1 - aim * 0.8;
  const tx = clamp(-yv * 0.012, -0.09, 0.09) * steady, ty = clamp(-pv * 0.012, -0.07, 0.07) * steady;
  [VM.sx, VM.svx] = spring(VM.sx, VM.svx, tx, dt); [VM.sy, VM.svy] = spring(VM.sy, VM.svy, ty, dt);
  // going up, the hands are left behind a little; coming down, they float; and the landing pushes them down
  const fall = p.onGround ? 0 : clamp(-p.vy * 0.007, -0.04, 0.05);
  [VM.fy, VM.fv] = spring(VM.fy, VM.fv, fall - (G.landDip || 0) * 0.5, dt, 110, 12);
  // a step to the side, and they roll with it
  const side = Math.cos(p.yaw) * p.vel.x - Math.sin(p.yaw) * p.vel.z;
  VM.roll += (clamp(-side * 0.012, -0.05, 0.05) - VM.roll) * Math.min(1, dt * 8);
  // running: held lower and turned in, out of the way; crouched: drawn in close
  const running = p.speed > 4.2 && p.onGround && !p.horse && !p.workKind && !(p.draw > 0) && p.swingT < 0 && !p.guard;
  VM.sprint += ((running ? 1 : 0) - VM.sprint) * Math.min(1, dt * 7);
  VM.crouch += ((p.crouched ? 1 : 0) - VM.crouch) * Math.min(1, dt * 8);
  // the stride: a figure of eight, side to side once and down twice a pair of steps, bigger running
  const walk = p.onGround && !p.horse ? Math.min(1, p.speed / 3.1) : 0, big = 1 + VM.sprint * 0.8;
  const bx = Math.cos(p.bob) * 0.011 * walk * big * steady, by = -Math.abs(Math.sin(p.bob)) * 0.013 * walk * big * steady;
  // still, the hands rise and fall with your breath
  const br = Math.sin(VM.t * 1.7) * 0.0035 * (1 - walk) * steady;
  // taken out: up from below, quickly, and settled
  const held = (p.axe ? "a" + (p.blade || "axe") : "") + (p.bow ? "b" : "") + (p.gun ? "g" : "") + (p.workKind === "eat" ? "food" : p.workKind || "");
  if (held !== VM.held) { if (held) VM.raise = 0; VM.held = held; noSnow(vm); if (p.model) noSnow(p.model.root); }
  VM.raise = Math.min(1, VM.raise + dt * 3.6);
  const r = 1 - VM.raise, rise = r * r * (3 - 2 * r);
  vm.position.set(bx + VM.sprint * 0.02 + VM.crouch * -0.01, by + br + VM.fy - VM.sprint * 0.04 - rise * 0.32 - VM.crouch * 0.015, VM.sprint * 0.02 + VM.crouch * 0.03);
  vm.rotation.set(VM.sy + VM.sprint * -0.16 - rise * 0.5 + by * 1.5, VM.sx + VM.sprint * 0.07, VM.roll + bx * 2 + VM.sprint * 0.22 + Math.cos(p.bob) * 0.012 * walk * VM.sprint);
  // a stroke: the body goes with it, a little, turning into the blow and through it
  if (p.swingT >= 0) {
    const T = p.swingT, s = p.swingDir === "left" ? -1 : 1;
    const wind = Math.sin(clamp(T / 0.2, 0, 1) * Math.PI) * 0.6, blow = Math.exp(-(((T - 0.3) / 0.07) ** 2));
    if (THRUST.has(p.blade)) camera.rotation.x += wind * 0.008 - blow * 0.012;
    else if (p.swingDir === "up") camera.rotation.x += wind * 0.03 - blow * 0.035;
    else { camera.rotation.y += (-wind * 0.015 + blow * 0.025) * s; camera.rotation.z += (wind * 0.012 - blow * 0.02) * s; }
  }
  // the shot: the string's slap runs up the arm, and the view jolts, a little, and settles
  const bk = G.bowKick || 0;
  if (bk > 0) { const k = bk * bk; camera.rotation.x += 0.014 * k; camera.rotation.z -= 0.006 * k; G.bowKick = Math.max(0, bk - dt * 5); }
  // the bite: the blade stops dead in what it struck, and it jars your arms
  const im = Math.max(0, (p.impactT || 0) - G.time);
  if (im > 0) { const k = im / 0.18; camera.rotation.x += Math.sin(G.time * 70) * 0.006 * k; vm.position.y += 0.012 * k; vm.position.z += 0.025 * k; }
}

// ---------------------------------------------------------------------------
//  finding a way round things
// ---------------------------------------------------------------------------
// People walk the way you would: round the table, not through it. A straight
// line is taken when it is clear; otherwise a small grid search finds the way
// and the corners are pulled tight so the walk still looks direct.
const NPC_R = 0.3, CELL = 0.5;
const stepClock = { t: 0 };
let planFrame = -1, plansNow = 0;
// (routes found per frame, at most: enough that a melee of forty men re-routing after each other aren't left standing
//  waiting their turn — they were, one route a frame, and a charge crawled and stuttered)
const PLANS_PER_FRAME = 8;
// would someone standing here be inside something? (the same height band you collide in)
// (y is the ground height, found once per search: sampling the terrain for every cell is the slow part)
function blockedAt(w, x, z, pad = NPC_R, y = w.heightAt(x, z)) {
  for (const o of w.col.near(x, z, pad + 1.3)) {
    if (o.disabled || y + 0.3 > o.y1 - 0.05 || y + 1.7 < o.y0) continue;
    if (o.type === "box") { if (x > o.x0 - pad && x < o.x1 + pad && z > o.z0 - pad && z < o.z1 + pad) return true; }
    else if (o.type === "obox") { const wx = x - o.x, wz = z - o.z, q = pad + (o.npcPad || 0); if (Math.abs(wx * o.c - wz * o.s) < o.hw + q && Math.abs(wx * o.s + wz * o.c) < o.hd + q) return true; }
    else if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + pad + (o.npcPad || 0)) ** 2) return true;
  }
  return false;
}
// can one walk straight from a to b? (a start already against something is let off its first steps)
function clearLine(w, ax, az, bx, bz, y) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.ceil(l / 0.25);
  const startStuck = blockedAt(w, ax, az, NPC_R * 0.9, y);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (startStuck && t * l < 0.7) continue;
    if (blockedAt(w, ax + (bx - ax) * t, az + (bz - az) * t, NPC_R * 0.9, y)) return false;
  }
  return true;
}
// a way from (sx,sz) to (gx,gz) as a list of {x,z}; the last may be marked `near`
// when the goal itself is inside something and only the closest free spot is reached
export function findPath(w, sx, sz, gx, gz) {
  if (!w || !w.col) return [{ x: gx, z: gz }];
  // one ground height for the whole search is fast; between floors of a house it would be wrong, so there each cell finds its own
  const ys = w.heightAt(sx, sz), yg = w.heightAt(gx, gz);
  const y = Math.abs(ys - yg) < 0.8 ? (ys + yg) / 2 : undefined;
  if (clearLine(w, sx, sz, gx, gz, y)) return [{ x: gx, z: gz }];
  const M = 8;
  const x0 = Math.min(sx, gx) - M, z0 = Math.min(sz, gz) - M;
  const nx = Math.ceil((Math.max(sx, gx) + M - x0) / CELL), nz = Math.ceil((Math.max(sz, gz) + M - z0) / CELL);
  if (nx * nz > 40000) return [{ x: gx, z: gz }];
  const cx = i => x0 + (i + 0.5) * CELL, cz = j => z0 + (j + 0.5) * CELL;
  const block = new Int8Array(nx * nz).fill(-1);
  const isBlocked = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return true;
    const k = i + j * nx;
    if (block[k] < 0) block[k] = blockedAt(w, cx(i), cz(j), NPC_R, y) ? 1 : 0;
    return block[k] === 1;
  };
  const cellOf = (x, z) => [clamp(Math.floor((x - x0) / CELL), 0, nx - 1), clamp(Math.floor((z - z0) / CELL), 0, nz - 1)];
  const [si, sj] = cellOf(sx, sz);
  let [gi, gj] = cellOf(gx, gz), goalFree = !blockedAt(w, gx, gz, NPC_R, y);
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
  while (heap.length && iter++ < 6000) {
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
  // (one pass forward: keep going while the next cell is still in sight of the last corner)
  const out = [];
  let ax = sx, az = sz, i = 0;
  while (i < cells.length) {
    let j = i;
    while (j + 1 < cells.length && clearLine(w, ax, az, cells[j + 1].x, cells[j + 1].z, y)) j++;
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
// a blow to you: dmg in points of a hundred. At nothing, you go down (what happens then is the chapter's to say)
// a stroke of the pick: at the rock in front, if the pick is hard enough for it
function mineSwing() {
  // (a game with rocks of its own — Frontier's — breaks them its own way)
  if (G.onMine) return G.onMine();
  const pl = G.player, w = G.world, tools = G.body && G.body.tools;
  const k = w && w.rockAhead && w.rockAhead(pl.pos, pl.forward());
  if (!k || !tools) return;
  G.impact();
  G.wear("pick");
  const R = ROCKS[k.kind];
  if ((tools.pick || 0) < R.need) {
    AUDIO.clang(0.25, { x: k.x, y: k.y + 0.6, z: k.z });
    rockChips(k, 0.3);
    UI.hint(`Too hard for a ${TIER_NAME[tools.pick]} pick — ${k.kind === "iron" ? "iron wants a bronze pickaxe" : `${k.kind} wants a stone pickaxe`}.`, 3);
    return;
  }
  // (a full pack: nothing more to put it in)
  if (roomFor(G.pack, G.body, R.gives) <= 0) { UI.hint("Your pack is full. Put things in a chest — or make a backpack from hides at the chopping block.", 3.5); return; }
  AUDIO.clang(0.4, { x: k.x, y: k.y + 0.6, z: k.z }); SFX.chop && SFX.chop();
  rockChips(k, 1);
  k.hp -= 1 + ((tools.pick - R.need) * 0.5) + (Math.random() < skillK(G.body, "strength") * 0.6 ? 1 : 0);
  G.practise("strength", 0.5);
  if (k.hp > 0) { k.g.position.x += (Math.random() - 0.5) * 0.02; return; }
  rockChips(k, 2.5);
  w.breakRock(k);
  SFX.treeFall && SFX.treeFall(0.2);
  const item = ITEM[R.gives], got = G.packAdd(R.gives, R.n);
  UI.hint(`${got} ${item.name.toLowerCase()}.`, 2);
  G.emitMine && G.emitMine(k.kind);
}
// chips of the rock flying from where the pick struck, in the rock's own colour; more when it breaks
const CHIP_COL = { stone: 0x8e897d, copper: 0x5e8a6a, tin: 0xb0b0a6, iron: 0x8a4e3a };
let chipGeo = null;
function rockChips(k, amount = 1) {
  const pl = G.player, root = G.scene; if (!root || !pl) return;
  chipGeo ??= new THREE.TetrahedronGeometry(0.035, 0);
  const dx = pl.pos.x - k.x, dz = pl.pos.z - k.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  // (the face of the rock toward you, about where the pick came down)
  const r = Math.min(0.7, Math.max(0.35, d - 1.1)), hx = k.x + ux * r, hz = k.z + uz * r, hy = (k.y || 0) + 0.55;
  const cm = new THREE.MeshStandardMaterial({ color: CHIP_COL[k.kind] || CHIP_COL.stone, roughness: 0.9, flatShading: true });
  const bits = [], n = Math.round(9 * amount) + 3;
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(chipGeo, cm); const s = 0.5 + Math.random() * (amount > 2 ? 1.6 : 0.9); b.scale.setScalar(s);
    b.position.set(hx, hy, hz); b.castShadow = true;
    // out from the face, toward you and to the sides, up and falling
    const sx = (Math.random() - 0.5) * 2.6, up = 1.2 + Math.random() * 2.6, out = 0.8 + Math.random() * 2.2;
    b.userData.v = new THREE.Vector3(ux * out - uz * sx, up, uz * out + ux * sx); b.userData.spin = new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0);
    root.add(b); bits.push(b);
  }
  let t = 0;
  const tick = dt => {
    t += dt;
    const w = G.world;
    for (const b of bits) {
      const v = b.userData.v; v.y -= 9.8 * dt;
      b.position.addScaledVector(v, dt);
      const gy = w && w.heightAt ? w.heightAt(b.position.x, b.position.z) + 0.02 : 0;
      if (b.position.y < gy) { b.position.y = gy; v.multiplyScalar(0.3); v.y = Math.abs(v.y) * 0.3; b.userData.spin.multiplyScalar(0.5); }
      b.rotation.x += b.userData.spin.x * dt; b.rotation.y += b.userData.spin.y * dt;
    }
    // (the chips lie a moment where they land, then they're gone)
    if (t > 2.2) {
      for (const b of bits) root.remove(b); cm.dispose();
      const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1);
    }
  };
  G.onFrame.push(tick);
}
G.rockChips = rockChips;
// chips of wood flying from the cut where the axe bit: pale heartwood and dark bark, flat and spinning; a shower when it falls
let woodGeo = null;
function woodChips(t, amount = 1) {
  const pl = G.player, root = G.scene; if (!root || !pl || !t) return;
  woodGeo ??= new THREE.BoxGeometry(0.075, 0.014, 0.045);
  const dx = pl.pos.x - t.x, dz = pl.pos.z - t.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  const gy = G.world && G.world.heightAt ? G.world.heightAt(t.x, t.z) : 0;
  // (out of the face of the cut, on the bark: a big spruce's trunk is thicker than a birch's, so further from its heart)
  const kind = t.kind || (t.src && t.src.kind), rTrunk = Math.max(0.24, (kind === "birch" ? 0.2 : 0.3) * ((t.h || 10) / 10)) + 0.05;
  const hx = t.x + ux * rTrunk, hz = t.z + uz * rTrunk, hy = gy + 0.95;
  const mats = [new THREE.MeshStandardMaterial({ color: 0xd8b880, roughness: 0.9, flatShading: true }), new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1, flatShading: true })];
  const bits = [], n = Math.round(14 * amount) + 6;
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(woodGeo, mats[i % 3 === 0 ? 1 : 0]); b.scale.setScalar(0.6 + Math.random() * 1.1);
    b.position.set(hx, hy + (Math.random() - 0.5) * 0.15, hz); b.castShadow = true;
    const sx = (Math.random() - 0.5) * 3, up = 1 + Math.random() * 2.4, out = 1 + Math.random() * 2.4;
    b.userData.v = new THREE.Vector3(ux * out - uz * sx, up, uz * out + ux * sx); b.userData.spin = new THREE.Vector3(Math.random() * 16, Math.random() * 16, Math.random() * 10);
    root.add(b); bits.push(b);
  }
  let tt = 0;
  const tick = dt => {
    tt += dt;
    for (const b of bits) {
      const v = b.userData.v; v.y -= 7 * dt; v.multiplyScalar(Math.pow(0.6, dt));
      b.position.addScaledVector(v, dt);
      const g2 = G.world && G.world.heightAt ? G.world.heightAt(b.position.x, b.position.z) + 0.01 : 0;
      if (b.position.y < g2) { b.position.y = g2; v.set(0, 0, 0); b.userData.spin.set(0, 0, 0); b.rotation.x = 0; b.rotation.z = 0; }
      b.rotation.x += b.userData.spin.x * dt; b.rotation.y += b.userData.spin.y * dt; b.rotation.z += b.userData.spin.z * dt;
    }
    // (they lie on the ground a while, then they're gone)
    if (tt > 4) { for (const b of bits) root.remove(b); for (const m of mats) m.dispose(); const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); }
  };
  G.onFrame.push(tick);
}
G.woodChips = (t, amount = 1) => { woodChips(t, amount); if (amount === 1) notch(t); };
// the cut the axe makes: a real notch, cut into the trunk at waist height on the side you're at, deeper with every
// stroke — a flat floor and a sloped face above it meeting in a crease, the fresh wood pale. The bark in the wedge is
// left undrawn (core.js, NOTCH_M); these two faces, fitted to the trunk's own girth there, are what you see in it.
const NOTCH_SLOTS = [null, null, null, null], _nm = new THREE.Matrix4();
const NOTCH_MAT = addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), { scale: 2.5, amount: 0.12, grain: 0.6, surface: "wood", weather: false, snow: false });
// the trunk's own outline, as the bark has it: rings of it up the trunk (each a many-sided ring, not a circle), and how
// far out its surface is in any direction at any height — so the cut meets the bark exactly, flats and corners alike
function trunkRings(t) {
  let bark = null; t.g.traverse(o => { if (!bark && o.isMesh && o.material && o.material.userData.detail && o.material.userData.detail.surface === "bark") bark = o; });
  if (!bark) return null;
  const P = bark.geometry.attributes.position, v = new THREE.Vector3(), pts = [];
  bark.updateMatrix();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(bark.matrix); if (v.y > -0.3 && v.y < 2.6) pts.push([v.x, v.y, v.z]); }
  if (pts.length < 6) return null;
  // (low boughs come out here too, more of them than the trunk's few points: the trunk is everything near the
  //  middle out to the first wide gap)
  let cx = 0, cz = 0, near = pts;
  for (let pass = 0; pass < 2; pass++) {
    const d = pts.map(p => Math.hypot(p[0] - cx, p[2] - cz)).sort((a, b) => a - b);
    let cut = d[d.length - 1];
    for (let k = 1; k < d.length; k++) if (d[k] > d[k - 1] * 1.6 + 0.04) { cut = d[k - 1]; break; }
    near = pts.filter(p => Math.hypot(p[0] - cx, p[2] - cz) <= cut + 1e-4);
    cx = near.reduce((a, p) => a + p[0], 0) / near.length; cz = near.reduce((a, p) => a + p[2], 0) / near.length;
  }
  // (the rings: the points at one height, the outermost of them — the stubs of boughs inside the trunk left out)
  const by = new Map();
  for (const p of near) { const k = Math.round(p[1] / 0.04); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const rings = [];
  for (const g of by.values()) {
    if (g.length < 5) continue;
    const md = Math.max(...g.map(p => Math.hypot(p[0] - cx, p[2] - cz))), ring = g.filter(p => Math.hypot(p[0] - cx, p[2] - cz) > md * 0.8);
    if (ring.length < 5 || md < 0.05) continue;
    rings.push({ y: ring.reduce((a, p) => a + p[1], 0) / ring.length, md, v: ring.map(p => [p[0] - cx, p[2] - cz, Math.atan2(p[2] - cz, p[0] - cx)]).sort((a, b) => a[2] - b[2]) });
  }
  if (!rings.length) return null;
  rings.sort((a, b) => a.y - b.y);
  // how far out the bark is from the middle along (dx, dz), in one ring: where that ray crosses the ring's sides
  const out = (ring, dx, dz) => {
    const L = ring.v, n = L.length;
    for (let i = 0; i < n; i++) {
      const a = L[i], b = L[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const rho = (a[0] * ez - a[1] * ex) / den, s = Math.abs(ex) > Math.abs(ez) ? (dx * rho - a[0]) / ex : (dz * rho - a[1]) / ez;
      if (rho > 0 && s >= -1e-4 && s <= 1 + 1e-4) return rho;
    }
    return ring.md;
  };
  const R = (y, dx, dz) => {
    let lo = rings[0], hi = rings[rings.length - 1];
    for (const r of rings) { if (r.y <= y) lo = r; if (r.y >= y) { hi = r; break; } }
    const a = out(lo, dx, dz), b = out(hi, dx, dz), k = hi.y > lo.y ? (y - lo.y) / (hi.y - lo.y) : 0;
    return a + (b - a) * Math.max(0, Math.min(1, k));
  };
  return { cx, cz, R };
}
// the two faces of the cut, in its own frame (x out toward the cutter, y up from the floor, z across): sampled across
// the face of the trunk, kept where the bark stands out past the crease, a strip from the crease out to the bark
function notchGeo(T, a, Y, u0, D, up) {
  const pos = [], col = [];
  const pale = new THREE.Color(0xe4cd9c), floor = new THREE.Color(0xc9ac78), deep = new THREE.Color(0x6e5232);
  const put = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); };
  const ux = Math.sin(a), uz = Math.cos(a), zx = -Math.cos(a), zz = Math.sin(a);
  // (the bark's edge, in the frame, at height h over the floor, in the frame's direction phi)
  const edge = (phi, h) => { const dx = ux * Math.cos(phi) + zx * Math.sin(phi), dz = uz * Math.cos(phi) + zz * Math.sin(phi), r = T.R(Y + h, dx, dz); return [r * Math.cos(phi), r * Math.sin(phi)]; };
  for (const top of [false, true]) {
    const N = 60, S = [];
    for (let i = 0; i <= N; i++) {
      const phi = -Math.PI / 2 + Math.PI * i / N;
      // (on the sloped face the height depends on how far out it meets the bark: settled in a few steps)
      let e = edge(phi, 0);
      if (top) for (let k = 0; k < 3; k++) e = edge(phi, Math.max(0, (e[0] - u0) * up / D));
      S.push([e[0], top ? Math.max(0, (e[0] - u0) * up / D) : 0, e[1]]);
    }
    const at = (A, B) => { const k = (u0 - A[0]) / (B[0] - A[0]); return [u0, 0, A[2] + (B[2] - A[2]) * k]; };
    for (let i = 0; i < N; i++) {
      let p = S[i], q = S[i + 1];
      const pin = p[0] > u0, qin = q[0] > u0; if (!pin && !qin) continue;
      // (where the bark comes in to the crease, the strip ends exactly there)
      if (!pin) p = at(p, q); else if (!qin) q = at(p, q);
      const cp = [u0, 0, p[2]], cq = [u0, 0, q[2]], c = top ? pale : floor;
      if (top) { put(cp, deep); put(q, c); put(p, c); put(cp, deep); put(cq, deep); put(q, c); }
      else { put(cp, deep); put(p, c); put(q, c); put(cp, deep); put(q, c); put(cq, deep); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals(); return g;
}
function notch(t) {
  const pl = G.player; if (!t || !t.g || !pl || t.state === "falling" || t.state === "down" || t.state === "gone") return;
  const Y = 0.85;
  if (!t.notch) {
    const kind = t.kind || (t.src && t.src.kind), r0 = Math.max(0.2, (kind === "birch" ? 0.2 : 0.3) * ((t.h || 10) / 10));
    const T = trunkRings(t) || { cx: 0, cz: 0, R: () => r0 };
    // (which way you are from the tree, in the tree's own turn)
    t.g.updateMatrixWorld(true);
    const lp = t.g.worldToLocal(new THREE.Vector3(pl.pos.x, pl.pos.y, pl.pos.z)), a = Math.atan2(lp.x - T.cx, lp.z - T.cz);
    const m = new THREE.Mesh(new THREE.BufferGeometry(), NOTCH_MAT); m.castShadow = false; m.receiveShadow = true;
    // its frame: x out toward you, y up, z across
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.cos(a), 0, Math.sin(a))).setPosition(T.cx, Y, T.cz);
    m.userData = { k: 0, T, a, r: T.R(Y, Math.sin(a), Math.cos(a)), world: G.world };
    let s = NOTCH_SLOTS.findIndex(x => !x || !x.notch || !x.g.visible); if (s < 0) { s = 0; G.clearNotch(NOTCH_SLOTS[0]); }
    NOTCH_SLOTS[s] = t; m.userData.slot = s;
    t.g.add(m); t.notch = m;
  } else t.notch.userData.k = Math.min(6, t.notch.userData.k + 1);
  const m = t.notch, { r, T, a } = m.userData, D = r * (0.18 + 0.08 * m.userData.k), up = D * 0.95;
  m.geometry.dispose(); m.geometry = notchGeo(T, a, Y, r - D, D, up);
  NOTCH_P.value[m.userData.slot].set(r, D, up, 1);
}
// (each frame: the world into every notch's frame, as its tree stands — or falls)
function notchFrame() {
  for (let i = 0; i < 4; i++) {
    const t = NOTCH_SLOTS[i]; if (!t || !t.notch || !t.notch.parent) { NOTCH_P.value[i].w = 0; continue; }
    NOTCH_M.value[i].copy(_nm.multiplyMatrices(t.notch.parent.matrixWorld, t.notch.matrix)).invert();
    NOTCH_P.value[i].w = t.g.visible && t.notch.userData.world === G.world ? 1 : 0;
  }
}
// (a tree grown again, or stood up again, has no cut in it)
G.clearNotch = t => {
  if (!t || !t.notch) return;
  const s = t.notch.userData.slot; if (NOTCH_SLOTS[s] === t) { NOTCH_SLOTS[s] = null; NOTCH_P.value[s].w = 0; }
  t.notch.parent && t.notch.parent.remove(t.notch); t.notch.geometry.dispose(); t.notch = null;
};
// money as it is written: whole marks, or a mark and a tenth — never 0.30000000000000004
export const dm = n => { const v = Math.round((+n || 0) * 10) / 10; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
G.dm = dm;
// your own body in first person: the head and the right arm folded away to nothing (a bone scaled to a speck
// takes everything hung from it), and back again for anyone else's view
function firstPersonBones(m, fp) {
  if (m._fpOn === fp) { if (fp && m._fp) for (const b of m._fp) b.scale.setScalar(0.001); return; }
  m._fpOn = fp;
  if (!m._fp) {
    m._fp = []; m.root.traverse(o => { if (o.isBone && /^(neck|shoulderR)$/i.test(o.name)) m._fp.push(o); });
    // (the body built in code, if the model never came: its neck group carries the head and hat)
    if (!m._fp.length) m._fp = [m.neck, m.armR].filter(Boolean);
  }
  for (const b of m._fp) b.scale.setScalar(fp ? 0.001 : 1);
  // (and a stock over where the neck was: looking down, you see your collar, not the inside of a neck)
  const nb = m._fp.find(b => b.isBone && /^neck$/i.test(b.name));
  if (nb && nb.parent && !m._cap) {
    m._cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 6), new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.9 }));
    m._cap.scale.set(1.05, 0.55, 0.95); m._cap.position.copy(nb.position); nb.parent.add(m._cap);
  }
  if (m._cap) m._cap.visible = fp;
}
// something put in your pack, as much as there is room for (a dozen to a slot); how many went in
G.packAdd = (icon, n, name, note) => {
  const put = Math.min(n, roomFor(G.pack, G.body, icon));
  if (put > 0) {
    const have = G.pack.find(i => i.icon === icon);
    if (have) have.n = (have.n || 1) + put;
    else G.pack.push({ icon, name: name || (ITEM[icon] || {}).name || icon, note: note || (ITEM[icon] || {}).note || "", n: put });
  }
  if (put > 0 && window.__foley) window.__foley.packIn(0.32);
  if (put < n) UI.hint(`Your pack is full${put ? ` — only ${put} went in` : ""}. Put things in a chest, or make a bigger backpack from hides.`, 4);
  return put;
};
// practice at something: a word when it rises
G.body = freshBody();
setToolSource(() => G.body && G.body.tools);
G.practise = (id, xp) => {
  const up = practise(G.body, id, xp);
  if (up && G.guide) G.guide("skills");
  if (up) { const sk = BODY_SKILLS.find(s => s.id === id); UI.hint(`${sk.name} rose to ${up}.${up === 100 ? " No one could be better." : ""}`, 3); window.__uisfx && (up % 10 === 0 ? window.__uisfx.fanfare() : window.__uisfx.done()); }
};
// dying: whatever killed you, a share of every skill goes (15%), and you wake in your own bed if you have one
// near death: your heart in your ears, and the edges of your sight going red with every beat of it — quicker and harder
// the less of you is left
const heart = { t: 0, beat: 9, on: 0 };
function heartTick(dt) {
  const el = document.getElementById("lowHpFx"); if (!el) return;
  const h = G.health, low = h !== undefined && h < 0.35 && h > 0 && !G.downed && G.mode === "play" ? (0.35 - h) / 0.35 : 0;
  heart.on += ((low > 0 ? 1 : 0) - heart.on) * Math.min(1, dt * 2);
  if (heart.on < 0.01) { if (el.style.opacity !== "0") el.style.opacity = "0"; heart.t = 0; return; }
  const period = 60 / (72 + 68 * low);
  if ((heart.t -= dt) <= 0) { heart.t += period; heart.beat = 0; if (low > 0) AUDIO.heartbeat && AUDIO.heartbeat(0.45 + 0.55 * low); }
  heart.beat += dt;
  // (the lub and the dub, a sixth of a second apart, the second weaker; each a quick swell and a slower ebb)
  const pulse = b => b < 0 ? 0 : b < 0.05 ? b / 0.05 : Math.exp(-(b - 0.05) * 7);
  const p = Math.max(pulse(heart.beat), 0.65 * pulse(heart.beat - 0.17));
  el.style.opacity = Math.min(1, heart.on * (0.35 + 0.3 * low + (0.3 + 0.2 * low) * p)).toFixed(3);
}
G.die = (from) => {
  { const el = document.getElementById("lowHpFx"); if (el) el.style.opacity = "0"; heart.on = 0; }
  if (G.downed) return;
  G.downed = true; G.health = 0;
  const lost = loseSkills(G.body, 0.15);
  if (G.onDowned) G.onDowned(from, lost); else G.wakeUp(from, lost);
};
G.lostText = lost => { const n = Object.values(lost).reduce((a, b) => a + b, 0); return n ? ` Every skill is down by a sixth or so (${n} level${n === 1 ? "" : "s"} lost in all — P to see).` : " Your skills are down a little (P to see)."; };
G.wakeUp = async (from, lost) => {
  const pl = G.player, w = G.world;
  G.lockMove = true; UI.fade(1, 0.8);
  await new Promise(r => setTimeout(r, 1400));
  if (w && w.bedSpot && w.cabin && w.cabin.visible) { const b = w.bedSpot(0); if (b) pl.place(b.x + 0.6, b.z + 0.6, b.ry); }
  G.health = 0.5; G.downed = false; G.hurtT = 0; G.stamina = 0.5; G.panting = 0; G.hitShake = 0;
  if (G.body) { G.body.hunger = Math.max(G.body.hunger, 0.35); G.body.thirst = Math.max(G.body.thirst ?? 1, 0.4); G.body.ill = null; }
  await new Promise(r => setTimeout(r, 900));
  UI.fade(0, 1.4); G.lockMove = false;
  if (G.body) G.body.plague = 0;
  UI.hint((from === "cold" ? "The cold took you — and you woke in your bed, under every blanket in the house." : from === "heat" ? "The heat struck you down — and you woke in your bed, a wet cloth on your head." : from === "hunger" ? "You died of hunger, and woke in your bed as if from a fever." : from === "thirst" ? "You died of thirst, and woke in your bed with a cup of water beside it." : from === "plague" ? "The plague took you — and yet you woke, in your bed, the fever gone." : "You died, and woke in your bed.") + G.lostText(lost || {}), 7);
};
G.hurt = (dmg, from) => {
  if (G.devGod) return;
  if (G.health === undefined || G.downed || G.mode !== "play") return;
  dmg = damageTaken(G.body, dmg);
  G.health = Math.max(0, G.health - dmg / 100); G.hurtT = 0;
  G.guide && G.guide("hurt");
  // the blow lands: red, a jolt of the view, and you gasp for a while after (less, the tougher you are)
  const k = rattle(G.body);
  UI.hurt(Math.min(1, (0.45 + dmg / 25) * (0.4 + 0.6 * k)));
  G.hitShake = Math.min(1.2, (G.hitShake || 0) + (0.5 + dmg / 20) * k);
  G.panting = Math.max(G.panting || 0, 4 + 4 * k);
  AUDIO.breath && AUDIO.breath(true, 1, 0.6, G.who === "sister");
  G.practise("toughness", dmg * 0.6);
  if (G.health <= 0) G.die(from);
};

// people keep a little room between them: two who have come together to talk, or been sent to the same spot,
// ease apart to a natural distance instead of standing inside one another (not those sitting, lying or indoors)
function personalSpace(list, dt) {
  const R = 0.75, k = Math.min(1, dt * 4);
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (!a.settler || a.lying || a.inside || a.person.sitting || a.horse || !a.root.visible) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (!b.settler || b.lying || b.inside || b.person.sitting || b.horse || !b.root.visible) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 >= R * R || Math.abs(a.pos.y - b.pos.y) > 1) continue;
      const d = Math.sqrt(d2) || 0.01, push = (R - d) * 0.5 * k, ux = d2 ? dx / d : Math.cos(i), uz = d2 ? dz / d : Math.sin(i);
      a.pos.x -= ux * push; a.pos.z -= uz * push; b.pos.x += ux * push; b.pos.z += uz * push;
      if (a.collide) a.collide(); if (b.collide) b.collide();
    }
  }
}
// (how high a rider's seat is lifted: the seated clip's hips stand 0.9 over its feet, and the horse's back is 1.5 up)
const SADDLE = 0.68;
export class Actor {
  constructor(opts, x, z, yaw = 0) {
    this.person = makePerson(opts);
    this.opts = opts;                    // (what they were made from: for showing them on someone else's screen)
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
    this.root.rotation.order = "YXZ";
    this.root.rotation.y = this.yaw;
    // asleep: on their back, the head toward where the back of the head was
    this.root.rotation.x = -Math.PI / 2 * (this.lieK ?? (this.lying ? 1 : 0));
  }
  place(x, z, yaw) { this.pos.x = x; this.pos.z = z; if (yaw !== undefined) { this.yaw = this.targetYaw = yaw; } this.path = []; this.sync(); }
  // up on a horse (a trooper in a battle): sat in the saddle, carried at the horse's pace — twice and more a man's — its
  // legs going under him; and thrown from it (killed), the horse bolting away riderless
  mountHorse(h) { this.horse = h; this.yOff = SADDLE; this.person.sitting = 1; G.scene.add(h.root); }
  unhorse(from = null) {
    const h = this.horse; if (!h) return; this.horse = null; this.yOff = 0;
    const p = this.pos, a = from ? Math.atan2(p.x - from.x, p.z - from.z) : this.yaw + (Math.random() - 0.5) * 2;
    this.bolt = { h, a: a + (Math.random() - 0.5) * 1.2, t: 0 };
  }
  // walk a list of [x,z] points; resolves on arrival
  walk(points, speed = 1.4) {
    this.follow = null;
    this.path = points.map(p => ({ x: p[0], z: p[1] }));
    // (settlers walk faster once the settlement knows horses)
    this.walkSpeed = speed * (this.settler && G.town ? G.town.walkMul : 1) * (this.horse ? 1.85 : 1);
    if (this.resolve) this.resolve();
    return new Promise(r => { this.resolve = r; });
  }
  walkTo(x, z, speed) { return this.walk([[x, z]], speed); }
  // a walking body is pushed out of whatever it brushes, and steps round you
  collide() {
    const w = G.world, p = this.pos;
    if (!w || !w.col) return;
    w.col.resolve(p, NPC_R, w.heightAt(p.x, p.z) + 0.3, 1.4, true);
    const pl = G.player;
    // (someone lying on the ground — asleep, knocked down, dead — isn't shoved aside by you walking up to them)
    if (pl && pl.pos && !this.lying && !this.ragdoll) {
      const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, d = Math.hypot(dx, dz), rr = NPC_R + (pl.radius || 0.3);
      if (d < rr && d > 1e-4) { p.x = pl.pos.x + dx / d * rr; p.z = pl.pos.z + dz / d * rr; }
    }
  }
  // up to someone, stopping short at arm's length (never onto the spot they stand on); or back off to that distance
  approach(fp, dist, speed) {
    let dx = this.pos.x - fp.x, dz = this.pos.z - fp.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { dx = Math.sin(this.yaw + Math.PI); dz = Math.cos(this.yaw + Math.PI); d = 1; }
    return this.walkTo(fp.x + dx / d * dist, fp.z + dz / d * dist, speed);
  }
  // step round someone you're fighting, at about this distance, one way or the other (the way you were going, mostly)
  circleAbout(fp, rad, speed) {
    if (Math.random() < 0.3 || !this.circleDir) this.circleDir = Math.random() < 0.5 ? -1 : 1;
    const ang = Math.atan2(this.pos.x - fp.x, this.pos.z - fp.z) + this.circleDir * (0.45 + Math.random() * 0.35);
    return this.walkTo(fp.x + Math.sin(ang) * rad, fp.z + Math.cos(ang) * rad, speed);
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
    // someone you are talking to stops what they are doing and turns to you, for as long as the talk lasts
    if (this.talkUntil && G.time < this.talkUntil && G.player) {
      const want = Math.atan2(G.player.pos.x - p.x, G.player.pos.z - p.z);
      this.targetYaw = want;
      this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 6);
      this.person.update(dt, 0); this.sync(); return;
    }
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
      // (one search a frame between everyone, so a crowd setting off at once doesn't stutter)
      if (planFrame !== G.time) { planFrame = G.time; plansNow = 0; }
      if (this.stepsFor !== t && plansNow >= PLANS_PER_FRAME) { this.person.update(dt, 0); this.sync(); return; }
      if (this.stepsFor !== t) {
        plansNow++; this.steps = findPath(G.world, p.x, p.z, t.x, t.z); this.stepsFor = t; this.stuck = 0; this.replans = this.replans && this.lastFor === t ? this.replans : 0; this.lastFor = t; this.bestD = Infinity; }
      const st = this.steps[0];
      const dx = st.x - p.x, dz = st.z - p.z, l = Math.hypot(dx, dz);
      if ((this.pathT = (this.pathT || 0) - dt) <= 0) { this.pathT = 0.25; this.onPath = !!(G.town && G.town.pathAt && G.town.pathAt(p.x, p.z)); }
      spd = this.walkSpeed * (this.onPath ? PATH_SPEED : 1);
      const arrive = () => {
        this.path.shift(); this.steps = []; this.stepsFor = null; this.replans = 0;
        if (!this.path.length && this.resolve) { const r = this.resolve; this.resolve = null; r(); }
      };
      // a walk that ends beside you is done once they are there: you are in the way of the last step
      const pd = Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z);
      const byYou = this.path.length === 1 && this.steps.length === 1 && Math.hypot(G.player.pos.x - st.x, G.player.pos.z - st.z) < 1.5 && pd < 1.15;
      if (l < 0.12 + spd * dt || (st.near && l < 0.45) || byYou) {
        if (!st.near) { p.x = st.x; p.z = st.z; }
        this.steps.shift(); this.bestD = Infinity; this.stuck = 0;
        if (!this.steps.length) arrive();
      } else {
        p.x += dx / l * spd * dt; p.z += dz / l * spd * dt; this.targetYaw = Math.atan2(dx, dz); moving = true;
        if (!st.ghost) this.collide();
        // no headway for a while (someone in the doorway, a door just shut): look again, and in the end give up here
        if (l < this.bestD - 0.05) { this.bestD = l; this.stuck = 0; }
        // (waiting on you in a doorway counts, only more patiently: nothing waits forever)
        else this.stuck += Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z) > 1.3 ? dt : dt * 0.35;
        if (this.stuck > 1.2) {
          this.replans = (this.replans || 0) + 1;
          if (this.replans > 3) { moving = false; arrive(); }
          else this.stepsFor = null;
        }
      }
    }
    if (!moving && this.faceTarget === "player") this.targetYaw = Math.atan2(G.player.pos.x - p.x, G.player.pos.z - p.z);
    // squared up to someone in a fight: the face stays on them, stepping about or not
    const sq = this.squareTo && this.squareTo.pos;
    if (sq) this.targetYaw = Math.atan2(sq.x - p.x, sq.z - p.z);
    // watching someone (who may be moving): turned to them while standing, and the head after them always
    const wt = this.watch && this.watch.pos;
    if (wt && !moving) this.targetYaw = Math.atan2(wt.x - p.x, wt.z - p.z);
    // (a turn where they stand is taken at a person's pace, not spun on the spot: the head leads it, the feet step round)
    const dTurn = angDiff(this.yaw, this.targetYaw), maxTurn = (moving ? 7 : 3.6) * dt;
    this.yaw += clamp(dTurn * Math.min(1, dt * (wt ? 3 : 6)), -maxTurn, maxTurn);
    if (!moving && !this.lying && !(this.person.sitting > 0.3) && Math.abs(dTurn) > 0.35) this.turnStep = 0.3;
    else if (this.turnStep > 0) this.turnStep -= dt;
    if (wt) this.person.look = clamp(angDiff(this.yaw, Math.atan2(wt.x - p.x, wt.z - p.z)), -1, 1);
    // a head turned toward whoever is talking to them
    else if (this.lookP) {
      const a = Math.atan2(G.player.pos.x - p.x, G.player.pos.z - p.z);
      this.person.look = clamp(angDiff(this.yaw, a), -1, 1);
    } else {
      // and anyone standing about glances at you as you pass close by
      const dx = G.player.pos.x - p.x, dz = G.player.pos.z - p.z, d = Math.hypot(dx, dz), a = angDiff(this.yaw, Math.atan2(dx, dz));
      this.person.look = !moving && !this.lying && d < 5 && d > 0.8 && Math.abs(a) < 1.5 && G.mode === "play" ? clamp(a, -1, 1) * 0.85 : 0;
    }
    this.speed = moving ? spd : (this.forcedSpeed || 0);
    // (the head ahead of the body into a turn)
    if (this.turnStep > 0 && !moving) this.person.look = clamp((this.person.look || 0) + clamp(dTurn, -0.7, 0.7) * 0.7, -1, 1);
    // their footsteps, if you are near enough to hear them (a few at a time, however many are walking)
    if (moving && spd > 0.3) {
      this.stepD = (this.stepD || 0) + spd * dt;
      if (this.stepD > (spd > 3 ? 1.5 : 0.75)) {
        this.stepD = 0;
        const d = Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z), hear = this.horse ? 40 : this.heavy ? 26 : 16;
        if (d < hear && G.time - (stepClock.t) > 0.09) {
          stepClock.t = G.time;
          const w = G.world, k = (1 - d / hear) ** 2;
          AUDIO.step(w && w.surfaceAt ? w.surfaceAt(p.x, p.z) : "grass", 0.5 * k, { fast: spd > 3, heavy: !!this.heavy });
        }
      }
    }
    // squared up to someone: the body knows it's in a fight, and which way it's stepping (to the side, or in and out)
    const mvx = p.x - (this._lx ?? p.x), mvz = p.z - (this._lz ?? p.z); this._lx = p.x; this._lz = p.z;
    const sq2 = this.squareTo && this.squareTo.pos, per = this.person;
    per.fight = !!sq2 && !this.lying;
    if (sq2 && dt > 0) { per.strafe = (mvx * Math.cos(this.yaw) - mvz * Math.sin(this.yaw)) / dt; per.fwd = (mvx * Math.sin(this.yaw) + mvz * Math.cos(this.yaw)) / dt; }
    else per.strafe = per.fwd = 0;
    // going down (or getting up): not all at once — over a moment, falling faster as they go
    this.lieK = this.lieK ?? (this.lying ? 1 : 0);
    if (this.lying && this.lieK < 1) this.lieK = Math.min(1, this.lieK + dt * (1.2 + this.lieK * 5));
    else if (!this.lying && this.lieK > 0) this.lieK = Math.max(0, this.lieK - dt * 2.5);
    // (stepping round in a turn, unless they're busy at something with their hands)
    const stepTurn = this.turnStep > 0 && !moving && (!this.person.pose || this.person.pose === "idle" || this.person.pose === "talk") && !per.fight;
    if (this.horse) this.person.sitting = 1;
    // (a crowd far off — a battle's hundred men across the field — moved as often as the eye can tell: every frame
    //  close by, a few times a second further out; and only those near the eye throw a shadow)
    const cx = camera.position.x - p.x, cz = camera.position.z - p.z, far2 = cx * cx + cz * cz;
    const every = G.arena && !this.lying ? (far2 > 6400 ? 6 : far2 > 1225 ? 3 : 1) : 1;
    this._animAcc = (this._animAcc || 0) + dt; this._animN = (this._animN || 0) + 1;
    if (this._animN % every === 0) { this.person.update(this._animAcc, this.horse ? 0 : stepTurn ? Math.max(this.speed, 0.65) : this.speed); this._animAcc = 0; }
    if (G.arena && (this._shT = (this._shT || 0) - dt) <= 0) {
      this._shT = 0.5 + Math.random() * 0.2;
      const cast = far2 < 900;
      if (cast !== this._cast) { this._cast = cast; this.root.traverse(o => { if (o.isMesh) o.castShadow = cast; }); if (this.horse) this.horse.root.traverse(o => { if (o.isMesh) o.castShadow = cast; }); }
    }
    if (this.onUpdate) this.onUpdate(dt);
    // (the saddle where the horse has it: up with it when it rears)
    if (this.horse) this.yOff = SADDLE + (this.horse.lift || 0);
    this.sync();
    // (the horse under him, on the ground, its gait going with the pace; its hooves heard near you, and its snort)
    if (this.horse) {
      const h = this.horse; h.root.position.set(p.x, p.y - this.yOff, p.z); h.root.rotation.y = this.yaw; h.gait(dt, this.speed);
      if (h.falls.length && far2 < 3600) { const at = { x: p.x, z: p.z }; for (const i of h.falls) FOLEY.hoof(at, this.speed > 6 ? 0.7 : 0.5); if (Math.random() < 0.12) FOLEY.tack(at, 0.25); }
      if ((h.snortT = (h.snortT ?? 4 + Math.random() * 20) - dt) <= 0) { h.snortT = 10 + Math.random() * 25; if (far2 < 900) FOLEY.snort({ x: p.x, z: p.z }, 0.45); }
    }
    // (his horse, riderless: off at a gallop away from the fight, and gone)
    if (this.bolt) {
      const b = this.bolt, h = b.h, w = G.world; b.t += dt;
      const sp = b.t < 4 ? 8 : 0; h.root.position.x += Math.sin(b.a) * sp * dt; h.root.position.z += Math.cos(b.a) * sp * dt;
      if (w) h.root.position.y = w.heightAt(h.root.position.x, h.root.position.z);
      h.root.rotation.y = b.a; h.gait(dt, sp);
      if (h.falls.length && b.t < 4) for (const i of h.falls) FOLEY.hoof({ x: h.root.position.x, z: h.root.position.z }, 0.6);
      if (b.t > 6) { G.scene.remove(h.root); this.bolt = null; }
    }
  }
  remove() {
    G.scene.remove(this.root);
    if (this.horse) G.scene.remove(this.horse.root); if (this.bolt) G.scene.remove(this.bolt.h.root);
    // (the bones' texture each skinned body keeps on the graphics card, and a battle man's body made one: let go of with
    //  the body — made again if it's ever put back — or every battle's men would be left there after it)
    for (const r of [this.root, this.horse && this.horse.root]) if (r) r.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) o.skeleton.dispose(); if (/^merged_/.test(o.name)) o.geometry.dispose(); });
    if (G.world) { const a = G.world.actors; const i = a.indexOf(this); if (i >= 0) a.splice(i, 1); }
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(); }
  }
  hold(obj, left = false) { (left ? this.person.heldL : this.person.held).add(obj); return noSnow(obj); }
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
    // (not a thing far over your head or under your feet: up on the hill when you're down in a cave under it)
    if (it.y != null && Math.abs(it.y - eye.y) > 12) continue;
    const to = new THREE.Vector3(ix - eye.x, (it.y ?? 1) - eye.y, iz - eye.z).normalize();
    const dot = to.dot(fwd);
    if (dot < (d < 1 ? 0.2 : 0.72)) continue;
    // (what you're looking at, more than what's nearest: a site straight ahead, not the store chest off to the side a
    //  pace nearer)
    const score = d * (2 - dot) ** 3;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}
const crossEl = () => document.getElementById("crosshair");
let crossFlash = 0;
// something that can be hunted, under the middle of the screen: a live animal, in reach of an arrow and in plain sight
const _ray = new THREE.Raycaster();
function huntTarget() {
  const alive = G.hunt.animals.filter(a => a.alive && a.root.parent);
  if (!alive.length) return null;
  _ray.setFromCamera({ x: 0, y: 0 }, camera); _ray.far = 70;
  const hit = _ray.intersectObjects(alive.map(a => a.root), true)[0];
  if (!hit) return null;
  const from = camera.getWorldPosition(new THREE.Vector3());
  return G.world.col.lineOfSight(from, hit.point.clone().addScaledVector(_ray.ray.direction, -0.3)) ? hit : null;
}
// what a held action is done with, and so what your hands are seen doing: judged from what it is
export function workOf(label) {
  if (/\b(Dig|Turn the earth)/i.test(label)) return "dig";
  if (/\bReap/i.test(label)) return "reap";
  if (/\bSow/i.test(label)) return "sow";
  if (/\b(Pick|Pull|Take|Gather)/i.test(label)) return "pick";
  if (/\b(Hew|Saw|plank)/i.test(label)) return "saw";
  if (/\b(Carve|Dress|Whittle|Skin)/i.test(label)) return "craft";
  if (/\b(Rebuild|Raise|Build|Chink|Mend|Repair|Make|Nail|Frame|Furnish)/i.test(label)) return "hammer";
  return null;
}
function updateInteract(dt) {
  const it = pickInteract();
  // the cursor: pale at rest, yellow over something usable, turning slowly to green as you use it
  const ch = crossEl();
  if (ch) {
    let k = 0;                                          // 0 yellow .. 1 green
    const ih = it && (typeof it.hold === "function" ? it.hold() : it.hold);
    if (it && G.holdT > 0) k = clamp(G.holdT / (ih || 1), 0, 1);
    if (it && input.hit("KeyF") && !ih) crossFlash = 1;
    if (G.player && G.player.swingT >= 0) crossFlash = Math.max(crossFlash, 1 - G.player.swingT / 0.62);
    crossFlash = Math.max(0, crossFlash - dt * 2.2);
    k = Math.max(k, crossFlash);
    ch.classList.toggle("active", !!it);
    // the cross opens wide with the bow out, and closes in as you draw
    // (with something to shoot in your hands — the bow, a gun, the crossbow — only a dot: you aim down it, not by a
    //  cross on the screen)
    const pl = G.player;
    ch.classList.toggle("dot", !!(pl && (pl.bow || pl.gun || pl.xbow)));
    ch.style.setProperty("--gap", "4px");
    // and turns red over something you can hunt (never a person)
    const game = G.hunt && huntTarget();
    ch.classList.toggle("kill", !!game);
    if (game) ch.style.setProperty("--cc", "rgb(230,64,52)");
    else if (!it && k <= 0.01) ch.style.removeProperty("--cc");
    else {
      const r = Math.round(240 + (127 - 240) * k), g = Math.round(206 + (224 - 206) * k), b = Math.round(70 + (122 - 70) * k);
      ch.style.setProperty("--cc", `rgb(${r},${g},${b})`);
    }
  }
  if (it !== G.interactTarget) { G.holdT = 0; G.interactTarget = it; }
  if (!it) { UI.prompt(null); UI.hold(0); G.tapFor = null; return; }
  const label = typeof it.label === "function" ? it.label() : it.label;
  // talking to someone is an action like any other, and takes a moment: hold F, and they stop to talk
  const talk = /^(Talk to|Speak to|Ask) /.test(label || "");
  // every action fills the wheel: a quick one in a moment, talking in a second, real work as long as it takes
  // (how long it's held: a number, or worked out now — a site is a quick F to add logs, a long hold to raise)
  const hold = (typeof it.hold === "function" ? it.hold() : it.hold) || (talk ? 1.0 : 0.4);
  UI.prompt(label, hold >= 1);
  // (F only: the right button is the bow and the guard, never a second F)
  // (a quick action — under a second — goes through on a tap: the wheel fills by itself once F is pressed on it;
  //  real work, a second or more, still wants F held all the way)
  if (input.hit("KeyF") && hold < 1 && !G.holdLatch) G.tapFor = it;
  if (G.tapFor && G.tapFor !== it) G.tapFor = null;
  const pressing = input.down("KeyF") || G.tapFor === it;
  // (once done, let go before the next: holding F doesn't open and shut a door over and over)
  if (!input.down("KeyF")) G.holdLatch = false;
  if (pressing && !G.holdLatch) {
    G.holdT += dt;
    if (it.actor) it.actor.talkUntil = G.time + 0.3;
    if (it.onHoldTick) it.onHoldTick(dt, G.holdT);
    UI.hold(G.holdT / hold);
    // real work: your hands are seen doing it
    if (hold >= 1 && !talk) G.working = { kind: it.anim || workOf(label || ""), until: G.time + 0.15, quiet: !!it.onHoldTick };
    if (G.holdT >= hold) { G.holdT = 0; UI.hold(0); G.holdLatch = input.down("KeyF"); G.tapFor = null; if (it.actor && talk) it.actor.talkUntil = G.time + 2.5; if (!(G.mpUse && G.mpUse(it))) it.use(); }   // (in someone else's colony, done in their game)
  } else { G.holdT = Math.max(0, G.holdT - dt * 2); UI.hold(G.holdT / hold); }
}

// ---------------------------------------------------------------------------
//  the objective marker
// ---------------------------------------------------------------------------
const _mv = new THREE.Vector3();
// the way to the marker, when a straight line would run into a house: [{x,z}], refreshed now and then
let markerWay = null, markerWayT = 0, markerWayFor = null, markerShown = null;
// the same objective, even when a chapter hands over a fresh marker every frame: the same person, or the same spot
const sameMark = (a, b) => !!a && !!b && (a.actor || b.actor ? a.actor === b.actor : Math.hypot(a.x - b.x, a.z - b.z) < 0.6);
function updateMarker(dt = 0) {
  const m = G.marker;
  if (!m || G.mode !== "play" || G.cine) { UI.marker(0, 0, 0, false); markerWay = null; markerShown = null; return; }
  const target = m.actor ? m.actor.headPos().add(new THREE.Vector3(0, 0.35, 0)) : new THREE.Vector3(m.x, m.y ?? 1.8, m.z);
  const pl = G.player, w = G.world;
  let dist = Math.hypot(target.x - pl.pos.x, target.z - pl.pos.z);
  if (dist < (m.hideWithin ?? 2.5)) { UI.marker(0, 0, 0, false); markerShown = null; return; }
  // a marker you can't walk straight to stands on the next corner of the way there; the distance is the whole way.
  // The way is worked out again now and then, not every frame, and kept unless it really changed — so the marker
  // doesn't hop between a corner and the goal while you stand at the edge of seeing it
  const fresh = !sameMark(m, markerWayFor);
  markerWayT -= dt;
  if (m.actor) markerWay = null;
  else if (w && w.col && dist < 160 && (markerWayT <= 0 || fresh)) {
    markerWayT = 0.8; markerWayFor = m.actor ? m : { x: m.x, z: m.z };
    const eye = new THREE.Vector3(pl.pos.x, pl.pos.y + 1.2, pl.pos.z), to = new THREE.Vector3(target.x, Math.max(target.y, pl.pos.y + 1.2), target.z);
    const clear = w.col.lineOfSight ? w.col.lineOfSight(eye, to) : false;
    if (clear) markerWay = null;
    else {
      const way = findPath(w, pl.pos.x, pl.pos.z, target.x, target.z);
      const next = way.length > 1 ? way : null;
      // (a new way only replaces the old if its next corner is somewhere else)
      if (!next || !markerWay || fresh || markerWay.length < 2 || Math.hypot(next[0].x - markerWay[0].x, next[0].z - markerWay[0].z) > 1.5) markerWay = next;
    }
  }
  if (markerWay) {
    while (markerWay.length > 1 && Math.hypot(markerWay[0].x - pl.pos.x, markerWay[0].z - pl.pos.z) < 1.6) markerWay.shift();
    if (markerWay.length > 1) {
      const c0 = markerWay[0];
      let whole = Math.hypot(c0.x - pl.pos.x, c0.z - pl.pos.z);
      for (let i = 1; i < markerWay.length; i++) whole += Math.hypot(markerWay[i].x - markerWay[i - 1].x, markerWay[i].z - markerWay[i - 1].z);
      dist = whole;
      target.set(c0.x, (w.heightAt ? w.heightAt(c0.x, c0.z) : 0) + 1.6, c0.z);
    }
  }
  camera.updateMatrixWorld();
  _mv.copy(target).project(camera);
  const behind = _mv.z > 1;
  let sx = _mv.x, sy = _mv.y;
  if (behind) { sx = -sx; sy = -sy; sy = Math.min(sy, -0.5); }
  const edge = behind || Math.abs(sx) > 0.92 || Math.abs(sy) > 0.88;
  if (edge) {
    const k = Math.max(Math.abs(sx) / 0.92, Math.abs(sy) / 0.88);
    sx /= k; sy /= k;
  }
  // and on screen it glides to where it should be, rather than jumping
  const px = (sx * 0.5 + 0.5) * innerWidth, py = (-sy * 0.5 + 0.5) * innerHeight;
  if (!markerShown) markerShown = { x: px, y: py };
  else { const k = Math.min(1, dt * 14); markerShown.x += (px - markerShown.x) * k; markerShown.y += (py - markerShown.y) * k; }
  UI.marker(markerShown.x, markerShown.y, dist, true, edge);
}

// ---------------------------------------------------------------------------
//  the minimap: north up, you in the middle, forty metres each way
// ---------------------------------------------------------------------------
let mmT = null, mmCtx = null;
// ---- exploration: the map only shows what you have been near ----
const EXPLORE_CELL = 6, EXPLORE_R = 30;
let explored = {}, exploreDirty = false, exploreT = 0, exploreSaveT = 0;
try { explored = Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem("reckoning.explored.v1") || "{}")).map(([k, v]) => [k, new Set(v)])); } catch (e) { explored = {}; }
function exploredSet() { const k = G.world && G.world.name; if (!k) return null; return explored[k] || (explored[k] = new Set()); }
function updateExplore(dt) {
  exploreT -= dt; exploreSaveT -= dt;
  if (exploreT <= 0 && G.world && G.player && !G.world.noFog) {
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
// cover what has not been seen with blank parchment, its edge soft as if the ink ran out.
// The holes are cut in a small mask (a quarter of the size, so the blur costs little) that is
// stretched over a sheet of paper drawn once; and only the cells in view are looked at.
let fogCv = null, maskCv = null, paperCv = null;
const FOG_K = 4;
// the unseen, for a whole country: opaque where not yet seen, a pixel to FOG_M metres; kept until more is seen
const FOG_M = 1.5;
let wFog = null;
function worldFog(s) {
  const w = G.world, mb = w.mapBounds;
  const bkey = `${mb.x0},${mb.x1},${mb.z0},${mb.z1}`;
  if (wFog && wFog.w === w && wFog.n === s.size && wFog.key === bkey) return wFog;
  const k = 1 / FOG_M;
  // (the same country, more seen: only the new cells are cut; then the whole small sheet is softened once)
  if (!(wFog && wFog.w === w && s.size > wFog.n && wFog.key === bkey)) {
    const b = { x0: mb.x0 - 60, x1: mb.x1 + 60, z0: mb.z0 - 60, z1: mb.z1 + 60 };
    const mk = () => { const cv = document.createElement("canvas"); cv.width = Math.ceil((b.x1 - b.x0) * k); cv.height = Math.ceil((b.z1 - b.z0) * k); return cv; };
    const sharp = mk(), sc = sharp.getContext("2d"); sc.fillStyle = "#000"; sc.fillRect(0, 0, sharp.width, sharp.height);
    wFog = { w, n: 0, cv: mk(), sharp, b, cut: new Set(), key: bkey };
  }
  const sc = wFog.sharp.getContext("2d"), b = wFog.b, C = EXPLORE_CELL, r = C * 0.95 * k;
  sc.globalCompositeOperation = "destination-out";
  for (const key of s) {
    if (wFog.cut.has(key)) continue;
    wFog.cut.add(key);
    const n = key.indexOf(","), i = +key.slice(0, n), j = +key.slice(n + 1);
    sc.beginPath(); sc.arc(((i + 0.5) * C - b.x0) * k, ((j + 0.5) * C - b.z0) * k, r, 0, Math.PI * 2); sc.fill();
  }
  sc.globalCompositeOperation = "source-over";
  const m = wFog.cv.getContext("2d");
  m.clearRect(0, 0, wFog.cv.width, wFog.cv.height);
  m.filter = `blur(${Math.max(1, EXPLORE_CELL * 0.6 * k)}px)`; m.drawImage(wFog.sharp, 0, 0); m.filter = "none";
  wFog.n = s.size;
  return wFog;
}
function drawFog(c, X, Z, S) {
  // (the cave keeps its own map of what you've seen)
  if (G.world && ((G.world.cave && G.world.cave.inside) || G.world.noFog)) return;
  const s = exploredSet(); if (!s) return;
  const W = c.canvas.width, H = c.canvas.height, mw = Math.ceil(W / FOG_K), mh = Math.ceil(H / FOG_K);
  if (!fogCv) { fogCv = document.createElement("canvas"); maskCv = document.createElement("canvas"); paperCv = document.createElement("canvas"); }
  if (fogCv.width !== W || fogCv.height !== H) {
    fogCv.width = paperCv.width = W; fogCv.height = paperCv.height = H;
    fillPaper(paperCv.getContext("2d"), W, H);
  }
  if (maskCv.width !== mw || maskCv.height !== mh) { maskCv.width = mw; maskCv.height = mh; }
  // a country with a map: its holes are cut once, onto a sheet of its own, and cut again only when more is seen
  const wf = G.world && G.world.mapBounds && worldFog(s);
  if (wf) {
    const m = maskCv.getContext("2d"), k = 1 / FOG_K;
    m.globalCompositeOperation = "source-over"; m.filter = "none";
    m.fillStyle = "#000"; m.fillRect(0, 0, mw, mh);
    m.globalCompositeOperation = "copy";
    const dx = X(wf.b.x0) * k, dy = Z(wf.b.z0) * k, dw = (wf.b.x1 - wf.b.x0) * S * k, dh = (wf.b.z1 - wf.b.z0) * S * k;
    m.drawImage(wf.cv, dx, dy, dw, dh);
    // (beyond the sheet, all unseen)
    m.globalCompositeOperation = "source-over"; m.fillStyle = "#000";
    if (dx > 0) m.fillRect(0, 0, dx, mh); if (dy > 0) m.fillRect(0, 0, mw, dy);
    if (dx + dw < mw) m.fillRect(dx + dw, 0, mw, mh); if (dy + dh < mh) m.fillRect(0, dy + dh, mw, mh);
  } else {
  // the mask: opaque where unseen
  const m = maskCv.getContext("2d");
  m.globalCompositeOperation = "source-over"; m.filter = "none";
  m.clearRect(0, 0, mw, mh); m.fillStyle = "#000"; m.fillRect(0, 0, mw, mh);
  m.globalCompositeOperation = "destination-out";
  m.filter = `blur(${Math.max(1, EXPLORE_CELL * S * 0.6 / FOG_K)}px)`;
  const C = EXPLORE_CELL, r = C * S * 0.95, k = 1 / FOG_K;
  // the cells the view covers (X and Z are straight lines, so they turn back easily)
  const x0 = X(0), z0 = Z(0);
  const i0 = Math.floor((-r - x0) / S / C) - 1, i1 = Math.ceil((W + r - x0) / S / C) + 1;
  const j0 = Math.floor((-r - z0) / S / C) - 1, j1 = Math.ceil((H + r - z0) / S / C) + 1;
  const hole = (i, j) => { const x = X((i + 0.5) * C), y = Z((j + 0.5) * C); m.beginPath(); m.arc(x * k, y * k, r * k, 0, Math.PI * 2); m.fill(); };
  if ((i1 - i0) * (j1 - j0) <= s.size) { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (s.has(i + "," + j)) hole(i, j); }
  else for (const key of s) { const n = key.indexOf(","), i = +key.slice(0, n), j = +key.slice(n + 1); if (i >= i0 && i <= i1 && j >= j0 && j <= j1) hole(i, j); }
  }
  // paper, kept only where the mask is
  const f = fogCv.getContext("2d");
  // (not blank: what lies there shows through faintly, as land you've only heard of)
  f.globalCompositeOperation = "source-over"; f.clearRect(0, 0, W, H); f.globalAlpha = 0.78; f.drawImage(paperCv, 0, 0); f.globalAlpha = 1;
  f.globalCompositeOperation = "destination-in"; f.imageSmoothingEnabled = true; f.drawImage(maskCv, 0, 0, mw, mh, 0, 0, W, H);
  f.globalCompositeOperation = "source-over";
  c.drawImage(fogCv, 0, 0, W, H);
}

// the map, at any size: the world's own drawing, then buildings, people, the objective, and you
export function drawMap(c, X, Z, S, big, cx, cz, radius) {
  drawMapGround(c, X, Z, S, big, cx, cz, radius);
  drawMapLive(c, X, Z, S, big, radius);
}
// what hardly changes: the forest and roads, the buildings, and the parchment over what you haven't seen
function drawMapGround(c, X, Z, S, big, cx, cz, radius) {
  const W = c.canvas.width, H = c.canvas.height, w = G.world;
  fillPaper(c, W, H);
  if (w.minimap) w.minimap(c, X, Z, S, big);
  // buildings and walls: everything solid and taller than a person, in red with an ink edge
  c.fillStyle = TOWN; c.strokeStyle = INK; c.lineWidth = 0.8;
  // (a wide view: every solid thing, straight off the list — looking them up square by square over a whole land was
  //  millions of empty squares, and a third of a second every time the map was drawn)
  for (const o of radius > 250 ? w.col.all : w.col.near(cx, cz, radius)) {
    if (o.disabled) continue;
    if (o.type === "obox") {
      // (a turned building: drawn turned)
      c.beginPath(); for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = u * o.hw, lz = v * o.hd; c.lineTo(X(o.x + lx * o.c + lz * o.s), Z(o.z - lx * o.s + lz * o.c)); } c.closePath();
      if (o.y1 >= 1.5) { c.fill(); c.stroke(); } else { c.fillStyle = "rgba(90,70,50,0.55)"; c.fill(); c.fillStyle = TOWN; }
      continue;
    }
    if (o.type !== "box" || o.x1 - o.x0 > 400) continue;
    const x = X(o.x0), y = Z(o.z0), ww = (o.x1 - o.x0) * S, hh = (o.z1 - o.z0) * S;
    if (o.y1 >= 1.5) { c.fillRect(x, y, ww, hh); c.strokeRect(x, y, ww, hh); }
    else { c.fillStyle = "rgba(90,70,50,0.55)"; c.fillRect(x, y, ww, hh); c.fillStyle = TOWN; }
  }
  // the settlement's own buildings, fields and paths, as they stand
  if (G.town && G.town.w === w && G.town.drawOnMap) G.town.drawOnMap(c, X, Z, S, TOWN, INK);
  // what you have not seen is still blank parchment
  drawFog(c, X, Z, S);
  if (big && w.mapLabels) w.mapLabels(c, X, Z, S, exploredSet());
}
// what moves: people, the objective, and you
function drawMapLive(c, X, Z, S, big, radius) {
  const W = c.canvas.width, w = G.world, p = G.player.pos;
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
  // your own waypoint: a red flag on its pole, held to the edge of the minimap when it's further
  const wp = G.waypoint && G.waypoint.w === w ? G.waypoint : null;
  if (wp) {
    let fx = X(wp.x), fz = Z(wp.z);
    if (!big) { const R = W / 2, dx = fx - R, dz = fz - R, d = Math.hypot(dx, dz); if (d > R - 9) { fx = R + dx / d * (R - 9); fz = R + dz / d * (R - 9); } }
    const k = big ? 1.4 : 1;
    c.strokeStyle = INK; c.lineWidth = 1.4 * k; c.beginPath(); c.moveTo(fx, fz); c.lineTo(fx, fz - 13 * k); c.stroke();
    c.fillStyle = "#b3261e"; c.beginPath(); c.moveTo(fx, fz - 13 * k); c.lineTo(fx + 9 * k, fz - 10 * k); c.lineTo(fx, fz - 7 * k); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(fx, fz, 1.8 * k, 0, Math.PI * 2); c.fill();
  }
  you(c, X(p.x), Z(p.z), G.player.yaw, big ? 1.3 : 1);
}
// ---- a waypoint of your own, set on the map (right-click): a beam of light standing up out of the place, seen from
// far off, and a little flag on the screen with how far it is ----
let wpBeam = null, wpEl = null;
function updateWaypoint() {
  const wp = G.waypoint, w = G.world, on = !!(wp && wp.w === w && G.mode === "play" && !G.cine), shown = on && !G.menuLock && !G.mapOpen;
  if (!wpEl) { wpEl = document.createElement("div"); wpEl.id = "wpMark"; wpEl.innerHTML = `<i></i><span></span>`; document.body.appendChild(wpEl); }
  if (!on) { if (wpEl.style.display !== "none") wpEl.style.display = "none"; if (wpBeam && wpBeam.parent) wpBeam.parent.remove(wpBeam); return; }
  if (!wpBeam) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    wpBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 140, 10, 1, true).translate(0, 70, 0), m); wpBeam.renderOrder = 5;
  }
  if (wpBeam.parent !== w.root) w.root.add(wpBeam);
  wpBeam.position.set(wp.x, w.heightAt(wp.x, wp.z), wp.z); wpBeam.material.opacity = 0.22 + 0.08 * Math.sin(G.time * 2.5);
  const pl = G.player, d = Math.hypot(wp.x - pl.pos.x, wp.z - pl.pos.z);
  if (d < 3) { G.waypoint = null; UI.hint && UI.hint("You're at your waypoint.", 2); return; }
  const v = new THREE.Vector3(wp.x, w.heightAt(wp.x, wp.z) + 2.5, wp.z).project(camera);
  let sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
  // (behind you, or off the edge: held at the edge of the screen, on the side it lies)
  if (v.z > 1) { sx = innerWidth - sx; sy = innerHeight - 40; }
  sx = Math.max(24, Math.min(innerWidth - 24, sx)); sy = Math.max(40, Math.min(innerHeight - 60, sy));
  // (the page touched only when something's changed: a moving marker repainted every frame over the whole game
  //  costs more than it should)
  const disp = shown ? "block" : "none"; if (wpEl.style.display !== disp) wpEl.style.display = disp;
  const tf = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`; if (wpEl._tf !== tf) { wpEl._tf = tf; wpEl.style.transform = tf; }
  const txt = d >= 1000 ? (d / 1000).toFixed(1) + " km" : (d >= 100 ? Math.round(d / 10) * 10 : Math.round(d)) + " m"; if (wpEl._txt !== txt) { wpEl._txt = txt; wpEl.lastChild.textContent = txt; }
}
// The minimap every frame, smoothly: the ground is drawn once into a sheet twice the map's reach and only
// slid under it as you walk (drawn again when you near its edge, or every few seconds for what has changed),
// and only people, the marker and you are drawn fresh.
let mmSheet = null, mmSheetAt = null, mmSheetT = 0, mmWorld = null;
const MM_REACH = 40, MM_SHEET = 2.2;               // metres from you to the map's rim; the sheet's size against the map
function updateMinimap(dt) {
  const cv = document.getElementById("minimap"); if (!cv) return;
  const wrap = document.getElementById("minimapWrap");
  const want = !!G.hasMap;
  if (mmT !== want) { mmT = want; if (wrap) wrap.classList.toggle("hidden", !want); }
  if (!want) return;
  const c = mmCtx || (mmCtx = cv.getContext("2d"));
  const W = cv.width, R = W / 2, S = R / MM_REACH;
  const p = G.player.pos, w = G.world;
  // the sheet under it
  const SW = Math.round(W * MM_SHEET);
  if (!mmSheet) { mmSheet = document.createElement("canvas"); }
  if (mmSheet.width !== SW) { mmSheet.width = mmSheet.height = SW; mmSheetAt = null; }
  mmSheetT -= dt;
  const off = mmSheetAt ? Math.max(Math.abs(p.x - mmSheetAt.x), Math.abs(p.z - mmSheetAt.z)) * S : Infinity;
  if (mmWorld !== w || off > (SW - W) / 2 - 4 || mmSheetT <= 0) {
    mmWorld = w; mmSheetAt = { x: p.x, z: p.z }; mmSheetT = 3;
    const sc = mmSheet.getContext("2d"), SR = SW / 2, ax = p.x, az = p.z;
    drawMapGround(sc, x => SR + (x - ax) * S, z => SR + (z - az) * S, S, false, ax, az, MM_REACH * MM_SHEET * 0.75);
  }
  const SR = SW / 2;
  c.drawImage(mmSheet, R - SR - (p.x - mmSheetAt.x) * S, R - SR - (p.z - mmSheetAt.z) * S);
  const X = x => R + (x - p.x) * S, Z = z => R + (z - p.z) * S;
  drawMapLive(c, X, Z, S, false, MM_REACH * 1.45);
  // an inked rim
  c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(R, R, R - 1.5, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = "rgba(59,42,26,0.5)"; c.lineWidth = 1; c.beginPath(); c.arc(R, R, R - 6, 0, Math.PI * 2); c.stroke();
}

// ---------------------------------------------------------------------------
//  worlds
// ---------------------------------------------------------------------------
export function setWorld(w) {
  if (G.player && G.player.horse) G.player.dismount();
  if (G.freecam) G.freecam = null;
  if (G.world) G.world.dispose();
  G.world = w;
  AUTO_FULL.value = w.name === "hamburg" ? 1 : 0;
  G.scene.add(w.root);
  G.interactTarget = null;
}

// ---------------------------------------------------------------------------
//  the frame
// ---------------------------------------------------------------------------
export function frame(dt, skipRender) {
  // (a fight's moments: a blow held for a heartbeat, a parry or the last man down in slow time)
  if (G.timeWarp) dt = G.timeWarp(dt);
  updateExplore(dt);
  window.__frame = frame;
  G.time += dt;
  const w = G.world;
  // (in a game with others the world doesn't stop for you: paused, or reading a card, it goes on — only your hands stop)
  // (and a battle played back — see replay.js — goes on with nobody in it to play)
  const live = G.mode === "play" || G.mode === "theatre" || (G.mp && (G.mode === "pause" || G.mode === "lesson"));
  if (live && w) {
    if (!G.player.frozen && G.mode === "play") G.player.update(dt);
    for (const a of w.actors.slice()) a.update(dt);
    personalSpace(w.actors, dt);
    if (window.__foley) window.__foley.work(w.actors);
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
    // (one thing going wrong never stops the rest: a fault in any one of these used to end the frame there, every frame
    //  — nothing moved again, and the game looked frozen. Now it's reported once and the frame goes on; a thing that
    //  fails frame after frame is taken out)
    notchFrame();
    for (const f of G.onFrame.slice()) {
      try { f(dt); f.__bad = 0; }
      catch (e) {
        if (!f.__bad) console.error("Reckoning: a frame task failed —", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e);
        if ((f.__bad = (f.__bad || 0) + 1) > 90) { const i = G.onFrame.indexOf(f); if (i >= 0) G.onFrame.splice(i, 1); }
      }
    }
    // (after everything else has set the sky: under the ground, it is dark)
    if (G.world && G.world.cave && G.world.cave.inside) G.world.cave.dark();
    if (G.mode === "play") {
    updateInteract(dt);
    // the axe swings on a click, when there is an axe
    // food in the hand: a click is a bite of it, not a swing
    if (input.click && G.foodInHand && G.foodInHand() && !UI.dialogOpen && !G.cine) { G.eatHeld(); input.click = false; }
    if (input.click && G.player.axe && (!G.player.horse || G.arena) && !UI.dialogOpen && !G.cine && (G.onSwing || G.player.blade === "pick") && !(G.town && G.town.planning)) G.player.swing(G.player.blade === "pick" ? mineSwing : G.onSwing);
    // move dialogue on
    if (UI.dialogOpen && (input.hit("Space") || input.hit("Enter") || input.hit("KeyF") || input.click)) UI.advance();
    }
  } else if (w) {
    for (const f of w.flames) flicker(f, dt * 0.2);
  }
  if (G.player && w) updateCamera(dt);
  // a filming rig can take the camera over for a shot (the trailer is captured this way)
  if (G.camOverride) G.camOverride(camera, dt);
  updateMarker(dt);
  updateWaypoint();
  if (live && w) updateMinimap(dt);
  input.endFrame();
  // (hard shadows, the cheaper kind, are only redrawn every other frame)
  if (G.shadowEvery > 1) renderer.shadowMap.needsUpdate = (G.frameN = (G.frameN || 0) + 1) % G.shadowEvery === 0;
  if (!skipRender) renderFrame(G.scene, camera);
}

// ---- graphics: the FPS boosters in the settings ----
// shadows: "high" soft and sharp, "low" hard-edged, smaller and redrawn every other frame, "off" none at all
export function setGraphics({ shadows = "high", drawMul = 1 } = {}) {
  const want = shadows !== "off", type = shadows === "low" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap, size = shadows === "low" ? 1024 : 2048;
  const changed = renderer.shadowMap.enabled !== want || renderer.shadowMap.type !== type;
  renderer.shadowMap.enabled = want; renderer.shadowMap.type = type;
  renderer.shadowMap.autoUpdate = shadows !== "low";
  G.shadowEvery = shadows === "low" ? 2 : 1;
  // (the grain's relief: off with the shadows, on the slowest setting)
  RELIEF.value = shadows === "off" ? 0 : 1;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  // shadows on or off, or soft or hard: every material has to be rebuilt to match
  if (changed) G.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  if (G.drawMul !== drawMul) { G.drawMul = drawMul; if (G.atmoNow) applyAtmo(G.atmoNow); }
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
      // (a mesh can have a list of materials; and textures shared between maps, like the logs', stay)
      for (const m of [].concat(o.material || [])) if (m && m.map && m.map.isTexture && !m.map.userData.shared) m.map.dispose();
    });
  }
}
