// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// BATTLES AT SEA — two fleets on the open water, under sail. The wind decides
// everything: a ship runs fast before it, faster still with it on her beam, and
// hardly moves at all heading into it. Her guns are along her sides, so she
// must turn to bring a broadside to bear, and the enemy is turning too.
// Round shot that strikes the hull kills the crew and opens her seams; shot
// high in the rigging slows her. A ship whose hull is shot through sinks; one
// whose crew is cut down strikes her colours, and is taken as a prize.
//
// It is played in a window of its own over the campaign's map: its own
// renderer, scene and sea, and its own clock.

import { THREE, clamp } from "./core.js";
import { modelCopy } from "./models.js";
import { AUDIO } from "./audio.js";
import { FOLEY } from "./foley.js";

// ---- the ships: a sloop of a dozen guns, a frigate of thirty-two, a ship of the line of sixty-four ----
export const SHIPS = {
  sloop: { name: "Sloops", one: "Sloop", guns: 12, hull: 60, crew: 80, speed: 10, turn: 0.34, scale: 0.72, reload: 7, cap: 4, cost: 60, up: 2, note: "Fast and handy: 12 guns, carries 4 regiments" },
  frigate: { name: "Frigates", one: "Frigate", guns: 32, hull: 150, crew: 200, speed: 9, turn: 0.24, scale: 1.0, reload: 9, cap: 8, cost: 130, up: 4, note: "The workhorse: 32 guns, carries 8 regiments" },
  line: { name: "Ships of the line", one: "Ship of the line", guns: 64, hull: 320, crew: 480, speed: 7, turn: 0.15, scale: 1.32, reload: 11, cap: 12, cost: 250, up: 7, note: "A floating fortress: 64 guns, carries 12 regiments" },
};
export const SHIP_KINDS = ["sloop", "frigate", "line"];

const G0 = 9.8, BALL_V = 165;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// the sea's swell: a few long waves running down the wind (the same sum in the shader and here, for the ships)
const WAVES = [[1, 0.2, 62, 0.55], [0.7, 0.7, 37, 0.32], [0.95, -0.3, 23, 0.18], [0.3, 0.95, 14, 0.08]];
let waveRot = 0;
function waveH(x, z, t) {
  let h = 0; const c = Math.cos(waveRot), s = Math.sin(waveRot);
  for (const [ax, az, l, a] of WAVES) { const dx = ax * c - az * s, dz = ax * s + az * c, k = 6.2832 / l, w = Math.sqrt(G0 * k); h += a * Math.sin(k * (dx * x + dz * z) - w * t); }
  return h;
}

const SEA_V = `
uniform float uT; uniform vec4 uW[4]; varying vec3 vP; varying vec3 vN; varying float vH;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); float h = 0.0; vec2 d = vec2(0.0);
  for (int i = 0; i < 4; i++) { vec2 dir = uW[i].xy; float k = 6.2832 / uW[i].z, w = sqrt(9.8 * k), ph = k * dot(dir, wp.xz) - w * uT; h += uW[i].w * sin(ph); d += uW[i].w * k * cos(ph) * dir; }
  wp.y += h; vH = h; vP = wp.xyz; vN = normalize(vec3(-d.x, 1.0, -d.y));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SEA_F = `
uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uHor; uniform vec3 uDeep; uniform vec3 uFogC; uniform float uFogN; uniform float uFogF;
varying vec3 vP; varying vec3 vN; varying float vH;
void main() {
  vec3 V = normalize(cameraPosition - vP), N = normalize(vN);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 R = reflect(-V, N), sky = mix(uHor, uSky, clamp(R.y * 1.6, 0.0, 1.0));
  vec3 col = mix(uDeep, sky, 0.08 + 0.6 * fr);
  float sp = pow(max(dot(R, normalize(uSun)), 0.0), 220.0); col += vec3(1.0, 0.95, 0.85) * sp * 1.6;
  col = mix(col, vec3(0.8, 0.85, 0.88), smoothstep(0.7, 1.05, vH) * 0.18);
  float dist = length(cameraPosition - vP), f = smoothstep(uFogN, uFogF, dist);
  gl_FragColor = vec4(mix(col, uFogC, f), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// a soft round puff, for smoke and spray
let PUFF = null;
function puffTex() {
  if (PUFF) return PUFF;
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return PUFF = new THREE.CanvasTexture(c);
}

// ---- a ship ----
class Ship {
  constructor(B, team, k, hp, x, z, yaw, color, name) {
    const S = SHIPS[k]; this.B = B; this.team = team; this.k = k; this.S = S; this.name = name;
    this.maxHull = S.hull; this.hull = S.hull * clamp(hp ?? 1, 0.15, 1); this.crew = S.crew * clamp(0.5 + (hp ?? 1) * 0.5, 0.3, 1); this.rig = 1;
    this.x = x; this.z = z; this.yaw = yaw; this.spd = S.speed * 0.5; this.trim = 1; this.rudder = 0;
    this.reload = [S.reload * Math.random() * 0.5, S.reload * Math.random() * 0.5]; this.sink = 0; this.sunk = false; this.struck = false; this.heelK = 0; this.recoil = 0;
    this.L = 26 * S.scale; this.beam = 6.4 * S.scale; this.side0 = Math.random() < 0.5 ? 1 : -1;
    const g = this.root = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const m = modelCopy("ship");
    if (m) { m.scene.position.z = -2.4; inner.add(m.scene); m.scene.traverse(o => { if (o.isMesh && o.material && /flag/.test(o.material.name || "")) { o.material = o.material.clone(); o.material.color.set(color); this.flag = o; } }); }
    else { const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 24), new THREE.MeshStandardMaterial({ color: 0x5a3e28 })); hull.position.y = 1; inner.add(hull); const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x4a3a2a })); mast.position.y = 11; inner.add(mast); const sail = new THREE.Mesh(new THREE.PlaneGeometry(10, 12), new THREE.MeshStandardMaterial({ color: 0xeee6d0, side: THREE.DoubleSide })); sail.position.set(0, 11, 0.5); inner.add(sail); }
    inner.scale.setScalar(S.scale); this.inner = inner;
    // (her pennant in her colours, high on the mainmast, so friend and foe are told apart across the water)
    const pen = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true })); pen.position.set(0, 24.5 * S.scale, 2.5 * S.scale); pen.rotation.y = Math.PI / 2; pen.geometry.translate(2.5, 0, 0); g.add(pen); this.pen = pen;
    B.scene.add(g);
  }
  get alive() { return !this.sunk && !this.struck && this.hull > 0; }
  get frac() { return this.hull / this.maxHull; }
  // how she sails with the wind where it is: fastest with it on her beam, well before it, poorly close-hauled, not at all into it
  pointK() {
    const f = [Math.sin(this.yaw), Math.cos(this.yaw)], w = this.B.windTo, rel = Math.acos(clamp(f[0] * w[0] + f[1] * w[1], -1, 1)) * 180 / Math.PI;
    return rel <= 90 ? 0.8 + 0.2 * rel / 90 : rel <= 140 ? 1 - (rel - 90) / 50 * 0.55 : Math.max(0.06, 0.45 - (rel - 140) / 40 * 0.4);
  }
  // (a word over a ship that's out of the fight, seen across the water: struck, and taken; sinking; sunk, over the wreck)
  tag(word, color) {
    if (this.tagWord === word) return; this.tagWord = word;
    const cv = document.createElement("canvas"); cv.width = 640; cv.height = 80; const c = cv.getContext("2d");
    c.font = "bold 34px Georgia, serif"; const w = Math.min(624, c.measureText(word).width + 44), x0 = (640 - w) / 2;
    c.fillStyle = "rgba(12,18,22,0.8)"; c.beginPath(); c.roundRect(x0, 10, w, 60, 10); c.fill(); c.strokeStyle = color; c.lineWidth = 3; c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = color; c.fillText(word, 320, 41, 600);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    if (!this.tagS) { this.tagS = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false, fog: false })); this.tagS.scale.set(0.36, 0.045, 1); this.tagS.renderOrder = 9; this.B.scene.add(this.tagS); }
    else { this.tagS.material.map.dispose(); this.tagS.material.map = t; this.tagS.material.needsUpdate = true; }
  }
  update(dt, t) {
    if (this.tagS) { this.tagS.position.set(this.x, (this.sunk ? 6 : 34) * this.S.scale, this.z); if (this.sunk) { this.wreckT = (this.wreckT || 0) + dt; this.tagS.material.opacity = clamp(1 - (this.wreckT - 20) / 5, 0, 1); } }
    if (this.sunk) return;
    if (this.hull <= 0) { this.sink += dt * 0.32; if (this.sink > 9) { this.sunk = true; this.root.visible = false; this.tag(`${this.team ? "Enemy" : "Your"} ${this.S.one.toLowerCase()} · sunk`, "#e07a5f"); } else this.tag(`${this.team ? "Enemy" : "Your"} ${this.S.one.toLowerCase()} · sinking`, "#e07a5f"); }
    const S = this.S, go = this.hull > 0 && !this.struck;
    const target = go ? S.speed * this.trim * this.pointK() * (0.35 + 0.65 * this.rig) * (0.5 + 0.5 * this.frac) : 0;
    this.spd += (target - this.spd) * Math.min(1, dt * 0.35);
    if (go) this.yaw = wrap(this.yaw + this.rudder * S.turn * clamp(this.spd / 3, 0.25, 1) * dt);
    this.x += Math.sin(this.yaw) * this.spd * dt; this.z += Math.cos(this.yaw) * this.spd * dt;
    for (let i = 0; i < 2; i++) this.reload[i] = Math.max(0, this.reload[i] - dt * (0.45 + 0.55 * clamp(this.crew / S.crew * 1.4, 0, 1)));
    // riding the swell: lifted and dropped, pitched and rolled with it; heeled by the wind in her sails; rocked by her own guns
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), L = this.L * 0.4, W = this.beam * 0.5;
    const h = waveH(this.x, this.z, t), hb = waveH(this.x + fx * L, this.z + fz * L, t), hs = waveH(this.x - fx * L, this.z - fz * L, t), hl = waveH(this.x + fz * W, this.z - fx * W, t), hr = waveH(this.x - fz * W, this.z + fx * W, t);
    const wr = this.B.windTo, cross = fx * wr[1] - fz * wr[0];
    this.heelK += ((go ? this.trim * 0.09 * cross : 0) - this.heelK) * Math.min(1, dt); this.recoil *= Math.max(0, 1 - dt * 1.5);
    this.root.position.set(this.x, h - 0.15 - this.sink * (this.sink > 4 ? 1.6 : 0.5), this.z);
    this.root.rotation.set(Math.atan2(hs - hb, 2 * L) * 0.6 + (this.hull <= 0 ? this.sink * 0.05 : 0), this.yaw, Math.atan2(hl - hr, 2 * W) * 0.7 + this.heelK + this.recoil + (this.hull <= 0 ? this.sink * 0.06 : 0), "YXZ");
    if (this.pen) this.pen.rotation.y = Math.atan2(-this.B.windTo[1], this.B.windTo[0]) - this.yaw + Math.sin(t * 3 + this.x) * 0.15;
    // (struck: her colours down and a white flag in their place, her sails let fly, and the word over her)
    if (this.struck && !this.whiteFlag) { this.whiteFlag = true; if (this.flag) this.flag.material.color.set(0xf4f1e6); if (this.pen) this.pen.material.color.set(0xf4f1e6); this.trim = 0; }
    if (this.struck && this.hull > 0) this.tag(`${this.team ? "Enemy" : "Your"} ${this.S.one.toLowerCase()} · struck${this.team ? ", a prize" : ""}`, "#f4f1e6");
  }
  // a broadside: side +1 her starboard, −1 her larboard. dist: how far to lay the guns for (elevation)
  fire(side, dist = 150) {
    const i = side > 0 ? 1 : 0; if (!this.alive || this.reload[i] > 0) return false;
    this.reload[i] = this.S.reload;
    const n = Math.min(14, Math.max(4, Math.round(this.S.guns / 2 / 2.3))), per = (this.S.guns / 2) / n * 1.6, a = this.yaw - side * Math.PI / 2;
    const el = 0.5 * Math.asin(clamp(G0 * clamp(dist, 40, 900) / (BALL_V * BALL_V), 0, 1));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), nx = Math.sin(a), nz = Math.cos(a), deckY = this.root.position.y + 2.4 * this.S.scale;
    for (let j = 0; j < n; j++) {
      const along = (j / (n - 1) - 0.5) * this.L * 0.62, delay = j * 0.06 + Math.random() * 0.05;
      const px = this.x + fx * along + nx * this.beam * 0.52, pz = this.z + fz * along + nz * this.beam * 0.52;
      const spread = (Math.random() - 0.5) * 0.06, e = el + (Math.random() - 0.4) * 0.035, ca = a + spread;
      this.B.later(delay, () => {
        this.B.ball({ x: px, y: deckY, z: pz, vx: Math.sin(ca) * Math.cos(e) * BALL_V, vy: Math.sin(e) * BALL_V, vz: Math.cos(ca) * Math.cos(e) * BALL_V, dmg: per, team: this.team, from: this });
        this.B.flash(px, deckY, pz, nx, nz);
      });
    }
    this.recoil = -side * 0.05;
    const d = this.B.camDist(this.x, this.z); this.B.later(0.05, () => { try { AUDIO.cannon(clamp(1.1 - d / 900, 0.15, 1)); } catch (e) {} });
    if (n > 7) this.B.later(0.35, () => { try { AUDIO.cannon(clamp(0.9 - d / 900, 0.12, 0.8)); } catch (e) {} });
    return true;
  }
  // the ship's own officers: close the enemy, keep him on the beam, and give him a broadside when he's there
  think(dt) {
    if (!this.alive) { this.trim = 0; return; }
    const foes = this.B.ships.filter(s => s.team !== this.team && s.alive);
    if (!foes.length) { this.rudder = 0; this.trim = 0.4; return; }
    const tg = foes.reduce((b, s) => (Math.hypot(s.x - this.x, s.z - this.z) < Math.hypot(b.x - this.x, b.z - this.z) ? s : b));
    const dx = tg.x - this.x, dz = tg.z - this.z, dist = Math.hypot(dx, dz), bear = Math.atan2(dx, dz);
    let want;
    if (dist > 230) want = bear;
    else { const side = wrap(bear - this.yaw) < 0 ? 1 : -1; this.side0 = side; want = bear + side * Math.PI / 2 + (dist > 150 ? -side * 0.35 : dist < 70 ? side * 0.35 : 0); }
    // (no ship sails into the wind: closer than five points to it, she bears away and beats up on a tack)
    const wFrom = Math.atan2(-this.B.windTo[0], -this.B.windTo[1]), off = wrap(want - wFrom);
    if (Math.abs(off) < 0.75) want = wFrom + (off >= 0 ? 0.8 : -0.8);
    // (and keeps off the land at the edge of the battle: the sea runs out a long way off)
    const r = Math.hypot(this.x, this.z); if (r > 900) want = Math.atan2(-this.x, -this.z);
    this.rudder = clamp(wrap(want - this.yaw) * 2.2, -1, 1);
    this.trim = dist < 120 ? 0.65 : 1;
    this.gunnery(foes);
  }
  // (her gun captains: a broadside loaded and an enemy on that beam, within range, and they fire — yours too, as you
  //  steer; Q and E only give the word sooner, at longer range or a wider bearing)
  gunnery(foes = this.B.ships.filter(s => s.team !== this.team && s.alive)) {
    if (!this.alive) return;
    for (const side of [1, -1]) {
      const a = this.yaw - side * Math.PI / 2;
      for (const f of foes) { const fd = Math.hypot(f.x - this.x, f.z - this.z); if (fd < 300 && Math.abs(wrap(Math.atan2(f.x - this.x, f.z - this.z) - a)) < 0.26) { if (this.fire(side, fd)) break; } }
    }
  }
}

// ---- the battle ----
// opts: { title, mine: [{ k, hp }], theirs: [{ k, hp }], myColor, theirColor, myName, theirName, onEnd(result) }
// result: { won, left, mine: [{ k, hp, sunk, struck }], theirs: [...] } — hp the hull left, 0..1
export function navalBattle(opts) {
  const B = new Battle(opts); B.start(); window.__navB = B; return B;
}
class Battle {
  constructor(o) {
    this.o = o; this.t = 0; this.timers = []; this.balls = []; this.puffs = []; this.speedK = 1; this.over = false; this.started = false;
    const wa = Math.random() * Math.PI * 2; this.windTo = [Math.sin(wa), Math.cos(wa)]; waveRot = wa;
    const el = this.el = document.createElement("div"); el.id = "naval"; el.className = "naval";
    const R = this.renderer = new THREE.WebGLRenderer({ antialias: true }); R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.setSize(innerWidth, innerHeight); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    el.appendChild(R.domElement);
    const sc = this.scene = new THREE.Scene(), hor = new THREE.Color(0xc7d3dc), sky = new THREE.Color(0x6f98c4);
    sc.background = hor; sc.fog = new THREE.Fog(hor, 500, 2200);
    // (the sky: a dome, pale at the horizon and blue overhead)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { a: { value: hor }, b: { value: sky } }, vertexShader: "varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }", fragmentShader: "uniform vec3 a; uniform vec3 b; varying vec3 p; void main(){ float k = clamp(normalize(p).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(a, b, k), 1.0);\n#include <colorspace_fragment>\n}" }));
    sc.add(dome); this.dome = dome;
    sc.add(new THREE.HemisphereLight(0xcfdcea, 0x31424a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.1); const sd = new THREE.Vector3(this.windTo[0] * 0.5 + 0.3, 0.75, this.windTo[1] * 0.5 - 0.2).normalize(); sun.position.copy(sd.clone().multiplyScalar(500)); sc.add(sun);
    const W = WAVES.map(([ax, az, l, a]) => { const c = Math.cos(waveRot), s = Math.sin(waveRot); return new THREE.Vector4(ax * c - az * s, ax * s + az * c, l, a); });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200, 280, 280).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: SEA_V, fragmentShader: SEA_F, uniforms: { uT: { value: 0 }, uW: { value: W }, uSun: { value: sd }, uSky: { value: sky }, uHor: { value: hor }, uDeep: { value: new THREE.Color(0x0e3442) }, uFogC: { value: hor }, uFogN: { value: 500 }, uFogF: { value: 2200 } } }));
    sc.add(this.sea);
    this.cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 6000); this.orbit = { a: Math.PI, e: 0.32, d: 95 };
    // the two fleets: in line ahead, a long way apart, coming on
    this.ships = [];
    const lay = (list, team, color, name) => list.forEach((s, i) => { const row = team ? 1 : -1, x = (i - (list.length - 1) / 2) * 60 + (Math.random() - 0.5) * 20, z = row * 300 + (Math.random() - 0.5) * 30; this.ships.push(new Ship(this, team, s.k, s.hp, x, z, team ? Math.PI : 0, color, name)); });
    // (the biggest of yours carries your flag)
    const mine = [...o.mine].sort((a, b) => SHIP_KINDS.indexOf(b.k) - SHIP_KINDS.indexOf(a.k));
    lay(mine, 0, o.myColor || "#c0281a", o.myName || "You"); lay(o.theirs, 1, o.theirColor || "#2a5aa0", o.theirName || "The enemy");
    this.order = this.ships.map(s => s); this.flag = this.ships.find(s => s.team === 0);
    this.keys = new Set();
    this.hud();
  }
  later(d, fn) { this.timers.push({ at: this.t + d, fn }); }
  camDist(x, z) { return Math.hypot(this.cam.position.x - x, this.cam.position.z - z); }
  ball(b) { const m = new THREE.Mesh(this.ballGeo ||= new THREE.SphereGeometry(0.28, 6, 4), this.ballMat ||= new THREE.MeshBasicMaterial({ color: 0x1a1a1a })); m.position.set(b.x, b.y, b.z); this.scene.add(m); b.m = m; this.balls.push(b); }
  puff(x, y, z, o) {
    if (this.puffs.length > 520) { const p = this.puffs.shift(); this.scene.remove(p.s); p.s.material.dispose(); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color: o.color ?? 0xd8d6d0, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    s.position.set(x, y, z); s.scale.setScalar(o.size || 3); this.scene.add(s);
    this.puffs.push({ s, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 6, t: 0, a: o.alpha ?? 0.7, grow: o.grow ?? 2.4, size: o.size || 3, g: o.g || 0 });
  }
  flash(x, y, z, nx, nz) {
    this.puff(x + nx, y, z + nz, { color: 0xffd27a, size: 2.6, life: 0.18, alpha: 1, grow: 0.5 });
    for (let i = 0; i < 3; i++) this.puff(x + nx * (1.5 + i * 1.6), y + Math.random(), z + nz * (1.5 + i * 1.6), { vx: nx * (4 - i) + this.windTo[0] * 2, vy: 0.4, vz: nz * (4 - i) + this.windTo[1] * 2, size: 3.2 + i, life: 7 + Math.random() * 3, alpha: 0.62 });
  }
  splash(x, z) { const h = waveH(x, z, this.t); for (let i = 0; i < 5; i++) this.puff(x + (Math.random() - 0.5), h, z + (Math.random() - 0.5), { color: 0xf2f6f8, vy: 7 + Math.random() * 6, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, g: 14, size: 1.2, grow: 1.2, life: 1.3, alpha: 0.85 }); if (this.camDist(x, z) < 220 && Math.random() < 0.35) try { FOLEY.splash(null, 0.35); } catch (e) {} }
  start() {
    document.body.appendChild(this.el);
    // (the keys are the battle's while it's on: nothing behind it — the map, the menus — hears them)
    this.onKey = e => { e.stopImmediatePropagation(); if (["Tab", "Space"].includes(e.code)) e.preventDefault(); if (this.over) return; const k = e.code; if (e.type === "keydown") { if (!e.repeat) this.press(k, e); this.keys.add(k); } else this.keys.delete(k); };
    addEventListener("keydown", this.onKey, true); addEventListener("keyup", this.onKey, true);
    let drag = null; const cv = this.renderer.domElement;
    cv.addEventListener("mousedown", e => { drag = { x: e.clientX, y: e.clientY }; });
    addEventListener("mouseup", this.onUp = () => { drag = null; });
    addEventListener("mousemove", this.onMove = e => { if (!drag) return; this.orbit.a -= (e.clientX - drag.x) * 0.006; this.orbit.e = clamp(this.orbit.e + (e.clientY - drag.y) * 0.004, 0.06, 1.3); drag = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener("wheel", e => { e.preventDefault(); this.orbit.d = clamp(this.orbit.d * Math.exp(e.deltaY * 0.001), 30, 700); }, { passive: false });
    addEventListener("resize", this.onResize = () => { this.renderer.setSize(innerWidth, innerHeight); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); });
    this.last = performance.now(); this.loop = () => { if (!this.el.isConnected) return; const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.step(dt * (this.started ? this.speedK : 0.4)); this.raf = requestAnimationFrame(this.loop); };
    this.raf = requestAnimationFrame(this.loop);
    try { FOLEY.wash(0.4); } catch (e) {}
  }
  press(k, e) {
    if (!this.started && (k === "Enter" || k === "Space")) { this.begin(); return; }
    const f = this.flag; if (!f) return;
    if (k === "KeyW") f.trim = clamp(Math.round(f.trim * 2 + 1) / 2, 0, 1);
    if (k === "KeyS") f.trim = clamp(Math.round(f.trim * 2 - 1) / 2, 0, 1);
    if (k === "KeyQ") f.fire(-1, this.aimRange(f, -1));
    if (k === "KeyE") f.fire(1, this.aimRange(f, 1));
    if (k === "KeyT") { this.speedK = this.speedK >= 3 ? 1 : this.speedK + 1; this.note(`Time ×${this.speedK}`); }
    if (k === "Tab") { e.preventDefault(); const L = this.ships.filter(s => s.team === 0 && s.alive); if (L.length) { this.flag = L[(L.indexOf(f) + 1) % L.length]; this.note(`Your flag in the ${this.flag.S.one.toLowerCase()}`); } }
    if (k === "Escape") { this.ask(); }
  }
  // (the range to the nearest enemy on that side, so the guns are laid for it — a captain's eye, not a calculation)
  aimRange(f, side) {
    const a = f.yaw - side * Math.PI / 2; let best = 200;
    for (const s of this.ships) if (s.team !== f.team && s.alive) { const d = Math.hypot(s.x - f.x, s.z - f.z); if (Math.abs(wrap(Math.atan2(s.x - f.x, s.z - f.z) - a)) < 0.5 && d < best * 2) best = d; }
    return best;
  }
  begin() { this.started = true; this.el.querySelector(".nv-intro")?.remove(); }
  step(dt) {
    this.t += dt;
    for (const tm of this.timers.splice(0)) if (tm.at <= this.t) tm.fn(); else this.timers.push(tm);
    const f = this.flag;
    if (f && f.alive && this.started) { f.rudder = (this.keys.has("KeyA") ? 1 : 0) - (this.keys.has("KeyD") ? 1 : 0); }
    for (const s of this.ships) { if (s !== f || !f.alive) { if (this.started) s.think(dt); } else if (this.started) s.gunnery(); s.update(dt, this.t); }
    // (ships that run aboard one another: pushed apart, and the worse for it)
    for (let i = 0; i < this.ships.length; i++) for (let j = i + 1; j < this.ships.length; j++) {
      const a = this.ships[i], b = this.ships[j]; if (a.sunk || b.sunk) continue; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = (a.L + b.L) * 0.3;
      if (d < min && d > 0.01) { const p = (min - d) / 2; a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p; a.spd *= 0.97; b.spd *= 0.97; }
    }
    // the shot in the air
    for (const b of this.balls.splice(0)) {
      b.vy -= G0 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.m.position.set(b.x, b.y, b.z);
      let hit = null;
      for (const s of this.ships) {
        if (s.team === b.team || s.sunk || s === b.from) continue; const dx = b.x - s.x, dz = b.z - s.z; if (dx * dx + dz * dz > s.L * s.L) continue;
        const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), lz = dx * sn + dz * c, lx = dx * c - dz * sn, y = b.y - s.root.position.y;
        if (Math.abs(lx) < s.beam / 2 && Math.abs(lz) < s.L / 2 && y > -1 && y < 22 * s.S.scale) { hit = { s, y }; break; }
      }
      if (hit) {
        const s = hit.s, sc = s.S.scale;
        if (hit.y < 4.2 * sc) { s.hull -= b.dmg; s.crew -= b.dmg * 1.6 * (0.6 + Math.random() * 0.8); for (let i = 0; i < 3; i++) this.puff(b.x, b.y, b.z, { color: 0x7a5a3a, size: 0.9, grow: 1, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, g: 9, life: 1.1, alpha: 0.9 }); if (this.camDist(b.x, b.z) < 260 && Math.random() < 0.3) try { FOLEY.play("crash", { vol: 0.18, rate: [1.3, 1.6] }); } catch (e) {} }
        else { s.rig = Math.max(0.15, s.rig - b.dmg * 0.006); s.crew -= b.dmg * 0.3; }
        // (a ship struck hard: her colours come down when her crew is cut to pieces, or she's sinking under them)
        if (s.hull > 0 && !s.struck && (s.crew < s.S.crew * 0.12 || (s.frac < 0.3 && s.crew < s.S.crew * 0.35 && Math.random() < 0.06))) { s.struck = true; this.note(`${s.team ? "The enemy's" : "Your"} ${s.S.one.toLowerCase()} strikes her colours!`); }
        if (s.hull <= 0 && !s.sinkTold) { s.sinkTold = true; this.note(`${s.team ? "The enemy's" : "Your"} ${s.S.one.toLowerCase()} is sinking!`); }
        this.scene.remove(b.m); continue;
      }
      if (b.y < waveH(b.x, b.z, this.t)) { this.splash(b.x, b.z); this.scene.remove(b.m); continue; }
      if (Math.abs(b.x) > 3000 || Math.abs(b.z) > 3000) { this.scene.remove(b.m); continue; }
      this.balls.push(b);
    }
    for (const p of this.puffs.slice()) {
      p.t += dt; const k = p.t / p.life; p.vy -= p.g * dt; const drag = Math.max(0, 1 - dt * 0.8);
      p.vx = p.vx * drag + this.windTo[0] * dt * 1.2; p.vz = p.vz * drag + this.windTo[1] * dt * 1.2;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.size * (1 + k * p.grow)); p.s.material.opacity = p.a * Math.min(1, p.t * 10) * Math.max(0, 1 - k);
      if (k >= 1) { this.scene.remove(p.s); p.s.material.dispose(); this.puffs.splice(this.puffs.indexOf(p), 1); }
    }
    // the camera, about your flagship
    const c = f && !f.sunk ? f : this.ships.find(s => !s.sunk) || this.ships[0], o = this.orbit, a = (c.yaw || 0) + o.a;
    this.cam.position.set(c.x + Math.sin(a) * Math.cos(o.e) * o.d, Math.max(4, Math.sin(o.e) * o.d + 6), c.z + Math.cos(a) * Math.cos(o.e) * o.d);
    this.cam.lookAt(c.x, 8, c.z);
    const cell = 4200 / 280; this.sea.position.set(Math.round(c.x / cell) * cell, 0, Math.round(c.z / cell) * cell); this.dome.position.set(c.x, 0, c.z);
    this.sea.material.uniforms.uT.value = this.t;
    this.renderer.render(this.scene, this.cam);
    this.drawHud();
    try { FOLEY.wash(f && f.alive ? clamp(f.spd / 8, 0.15, 1) : 0.15); } catch (e) {}
    if (this.started && !this.over) {
      const mine = this.ships.some(s => s.team === 0 && s.alive), theirs = this.ships.some(s => s.team === 1 && s.alive);
      if (!mine || !theirs) { this.endT = (this.endT || 0) + dt; if (this.endT > 4) this.end(theirs ? false : true); }
      if (f && !f.alive) { const n = this.ships.find(s => s.team === 0 && s.alive); if (n) { this.flag = n; this.note(`Your flag shifts to the ${n.S.one.toLowerCase()}`); } }
    }
  }
  note(t) { const n = this.el.querySelector(".nv-note"); n.textContent = t; n.classList.add("on"); clearTimeout(this.noteT); this.noteT = setTimeout(() => n.classList.remove("on"), 2600); }
  hud() {
    const o = this.o;
    this.el.insertAdjacentHTML("beforeend", `<div class="nv-top"><b>${o.title || "A battle at sea"}</b><span class="nv-wind"><i></i>Wind</span></div>
      <div class="nv-note"></div><div class="nv-me"></div><div class="nv-fleets"></div>
      <div class="nv-keys"><b>W</b>/<b>S</b> make or shorten sail · <b>A</b>/<b>D</b> helm · your guns fire when an enemy is on the beam · <b>Q</b>/<b>E</b> fire larboard/starboard now · <b>Tab</b> change ship · <b>T</b> time · drag to look · <b>Esc</b> withdraw</div>
      <div class="nv-intro"><div class="nv-box"><h2>${o.title || "A battle at sea"}</h2><p>${o.sub || ""}</p><p>You command from the ${this.flag ? this.flag.S.one.toLowerCase() : "flagship"}; your other captains fight their own ships. The wind is everything: no ship sails into it. Her guns are along her sides, so turn to bring a broadside to bear: her gun crews fire on their own as soon as an enemy is on the beam and in range, or give the word sooner with Q and E. Shot in the hull kills her crew and sinks her; a ship that loses her crew strikes her colours and is taken as a prize.</p><button class="btn primary" data-nv="go">Clear for action</button></div></div>`);
    this.el.addEventListener("click", e => { const b = e.target.closest("[data-nv]"); if (!b) return; const a = b.dataset.nv; if (a === "go") this.begin(); if (a === "stay") this.el.querySelector(".nv-ask")?.remove(); if (a === "leave") { this.el.querySelector(".nv-ask")?.remove(); this.end(false, true); } if (a === "done") this.close(); });
  }
  ask() { if (this.el.querySelector(".nv-ask")) return; this.el.insertAdjacentHTML("beforeend", `<div class="nv-ask"><div class="nv-box"><h2>Withdraw?</h2><p>Your ships break off and make what sail they can. The ones still fighting get away; the battle is lost.</p><button class="btn" data-nv="leave">Withdraw</button><button class="btn primary" data-nv="stay">Fight on</button></div></div>`); }
  drawHud() {
    const f = this.flag, me = this.el.querySelector(".nv-me");
    if (f) {
      const r = s => s.reload[s === f ? 0 : 0];
      me.innerHTML = `<b>${f.S.one}</b><span>Hull <i><u style="width:${Math.max(0, f.frac) * 100}%"></u></i></span><span>Crew <i><u style="width:${clamp(f.crew / f.S.crew, 0, 1) * 100}%"></u></i></span><span>Rigging <i><u style="width:${f.rig * 100}%"></u></i></span><span>Sail <em>${["Furled", "Battle sail", "All plain sail"][Math.round(f.trim * 2)]}</em> · ${Math.round(f.spd * 1.3)} knots</span><span class="nv-guns"><em class="${f.reload[0] <= 0 ? "ready" : ""}">Q larboard ${f.reload[0] <= 0 ? "ready" : Math.ceil(f.reload[0]) + "s"}</em><em class="${f.reload[1] <= 0 ? "ready" : ""}">E starboard ${f.reload[1] <= 0 ? "ready" : Math.ceil(f.reload[1]) + "s"}</em></span>`;
    }
    const row = team => this.ships.filter(s => s.team === team).map(s => `<span class="${s.sunk || s.hull <= 0 ? "sunk" : s.struck ? "struck" : ""}${s === f ? " flag" : ""}" title="${s.S.one}${s.sunk ? ": sunk" : s.hull <= 0 ? ": sinking" : s.struck ? ": struck her colours" : ""}">${s.k === "line" ? "Line" : s.k === "frigate" ? "Frigate" : "Sloop"}${s.sunk ? "<em>Sunk</em>" : s.hull <= 0 ? "<em>Sinking</em>" : s.struck ? "<em>Struck</em>" : ""}<i><u style="width:${Math.max(0, s.frac) * 100}%"></u></i></span>`).join("");
    this.el.querySelector(".nv-fleets").innerHTML = `<div><b>${this.o.myName || "Yours"}</b>${row(0)}</div><div><b>${this.o.theirName || "Theirs"}</b>${row(1)}</div>`;
    // (the wind's arrow, as it blows across the view)
    const ca = Math.atan2(this.cam.position.x - (f ? f.x : 0), this.cam.position.z - (f ? f.z : 0)), wa = Math.atan2(this.windTo[0], this.windTo[1]);
    const i = this.el.querySelector(".nv-wind i"); if (i) i.style.transform = `rotate(${(-(wa - ca) * 180 / Math.PI) + 180}deg)`;
  }
  end(won, left = false) {
    if (this.over) return; this.over = true;
    const tally = team => this.ships.filter(s => s.team === team).map(s => ({ k: s.k, hp: Math.max(0, s.frac), sunk: s.hull <= 0 || s.sunk, struck: s.struck && s.hull > 0 }));
    this.result = { won: !!won, left, mine: tally(0), theirs: tally(1) };
    const R = this.result, n = (L, f) => L.filter(f).length;
    this.el.insertAdjacentHTML("beforeend", `<div class="nv-end"><div class="nv-box"><h2>${won ? "Victory at sea" : left ? "You break off the action" : "Beaten at sea"}</h2>
      <p>Theirs: ${n(R.theirs, s => s.sunk)} sunk, ${n(R.theirs, s => s.struck)} taken${won && n(R.theirs, s => s.struck) ? " — prizes for your fleet" : ""}, ${n(R.theirs, s => !s.sunk && !s.struck)} got away.</p>
      <p>Yours: ${n(R.mine, s => s.sunk)} sunk, ${n(R.mine, s => s.struck)} struck, ${n(R.mine, s => !s.sunk && !s.struck)} afloat.</p>
      <button class="btn primary" data-nv="done">Back to the map</button></div></div>`);
  }
  close() {
    cancelAnimationFrame(this.raf); removeEventListener("keydown", this.onKey, true); removeEventListener("keyup", this.onKey, true); removeEventListener("mouseup", this.onUp); removeEventListener("mousemove", this.onMove); removeEventListener("resize", this.onResize);
    try { FOLEY.wash(0); } catch (e) {}
    this.renderer.dispose(); this.el.remove();
    if (this.o.onEnd) this.o.onEnd(this.result || { won: false, left: true, mine: [], theirs: [] });
  }
}
// (for the tests)
window.__naval = navalBattle;
