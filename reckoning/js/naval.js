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
import { modelCopy, shipSails } from "./models.js";
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
// the sea's swell: waves running down the wind, fanned a little either side of it, long and short together — each
// one's water moving in a circle as it passes (Gerstner's waves: the crests sharp and the troughs broad, as the sea's
// are, not the round hills of a plain sine). The same sum in the shader and here, for the ships to ride.
//   [angle off the wind, length (m), steepness]
const WAVES = [[0.0, 96, 0.075], [0.35, 61, 0.085], [-0.42, 43, 0.09], [0.75, 31, 0.08], [-0.2, 21, 0.085], [0.55, 14.5, 0.07], [-0.8, 9.5, 0.065], [0.15, 6.2, 0.055]];
const WAVE_K = 0.62, CHOP = 0.78;   // (the swell's height overall, and how far the crests are drawn sharp)
let waveRot = 0, WV = null;
function waveSet() {
  return WAVES.map(([da, l, st]) => { const a = waveRot + da, k = 6.2832 / l, amp = st / k * WAVE_K; return { dx: Math.sin(a), dz: Math.cos(a), k, w: Math.sqrt(G0 * k), amp, q: CHOP / (k * amp * WAVES.length) }; });
}
// (the water's height over a point of the sea: the surface there was carried in from a little way off, so the point
//  it came from is found first, a few steps back along the waves' push)
function waveH(x, z, t) {
  const W = WV || (WV = waveSet());
  let px = x, pz = z;
  for (let it = 0; it < 3; it++) {
    let ox = 0, oz = 0;
    for (const v of W) { const c = Math.cos(v.k * (v.dx * px + v.dz * pz) - v.w * t) * v.q * v.amp; ox += v.dx * c; oz += v.dz * c; }
    px = x - ox; pz = z - oz;
  }
  let h = 0; for (const v of W) h += v.amp * Math.sin(v.k * (v.dx * px + v.dz * pz) - v.w * t);
  return h;
}

const WAVE_GLSL = `
uniform vec4 uW[8]; uniform vec2 uQ[8];   // (each wave: its way (x, z), its number k, its height; and its speed, its sharpness)
`;
const SEA_V = WAVE_GLSL + `
uniform float uT; varying vec3 vP; varying vec2 vX; varying float vH; varying float vJ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vec2 x0 = wp.xz; vec3 off = vec3(0.0); float J = 0.0;
  // (a wave shorter than the mesh can carry, here, is left to the shading: drawn, it would only flicker)
  float cell = 0.9 + length(position.xz) * 0.0135;
  for (int i = 0; i < 8; i++) {
    float k = uW[i].z, a = uW[i].w * smoothstep(3.0, 5.5, 6.2832 / k / cell), ph = k * dot(uW[i].xy, x0) - uQ[i].x * uT;
    float c = cos(ph), s = sin(ph), qa = uQ[i].y * a;
    off.xz += uW[i].xy * qa * c; off.y += a * s; J += uQ[i].y * k * a * s;
  }
  wp.xyz += off; vH = off.y; vX = x0; vP = wp.xyz; vJ = J;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SEA_F = WAVE_GLSL + `
uniform float uT; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uHor; uniform vec3 uDeep; uniform vec3 uFogC; uniform float uFogN; uniform float uFogF;
uniform vec4 uS[24]; uniform vec4 uS2[24];   // (each ship: where, which way; her half-length, half-beam, way on her)
varying vec3 vP; varying vec2 vX; varying float vH; varying float vJ;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
// (the little waves the wind raises on the big ones: noise's slope, drifting down the wind)
vec2 ripple(vec2 p, vec2 wind, float t) {
  vec2 q = p + wind * t; float e = 0.12;
  float n = vnoise(q), nx = vnoise(q + vec2(e, 0.0)), nz = vnoise(q + vec2(0.0, e));
  return vec2(nx - n, nz - n) / e;
}
void main() {
  float dist = length(cameraPosition - vP);
  // (past the fog's far edge the sea is only the fog: none of the rest worked out for it)
  if (dist >= uFogF) { gl_FragColor = vec4(uFogC, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return; }
  // the surface's slope, here, from every wave — the short ones fading out with distance, where they'd only sparkle
  vec2 d = vec2(0.0); float crest = 0.0;
  for (int i = 0; i < 8; i++) {
    float k = uW[i].z, l = 6.2832 / k, fade = 1.0 - smoothstep(l * 14.0, l * 40.0, dist);
    float a = uW[i].w * fade, ph = k * dot(uW[i].xy, vX) - uQ[i].x * uT;
    d += uW[i].xy * (k * a * cos(ph)); crest += uQ[i].y * k * a * sin(ph);
  }
  vec3 N = normalize(vec3(-d.x, max(0.2, 1.0 - crest), -d.y));
  // and the wind's ripples on them, two sizes, gone in the distance
  vec2 wind = uW[0].xy;
  float rf = 1.0 - smoothstep(30.0, 260.0, dist), rf2 = 1.0 - smoothstep(12.0, 90.0, dist);
  vec2 r1 = rf > 0.0 ? ripple(vX * 0.42, wind * 0.9, uT * 0.55) * 0.16 * rf : vec2(0.0);
  vec2 r2 = rf2 > 0.0 ? ripple(vX * 1.7, wind * 1.6, uT * 0.9) * 0.07 * rf2 : vec2(0.0);
  N = normalize(N + vec3(r1.x + r2.x, 0.0, r1.y + r2.y));
  vec3 V = normalize(cameraPosition - vP), L = normalize(uSun);
  // the sky in it: a reflection, more of it the lower you look across the water (Schlick's reckoning of Fresnel's)
  float cosT = max(dot(N, V), 0.0), fr = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 sky = mix(uHor, uSky, pow(clamp(R.y, 0.0, 1.0), 0.6));
  // the water itself: dark in the troughs, a little lighter and greener up the waves' faces, lit through at their crests
  //  (a northern sea: grey-green, not the blue of the south)
  vec3 body = mix(uDeep, vec3(0.06, 0.11, 0.12), 0.45) * (0.8 + 0.4 * clamp(vH * 0.35 + 0.5, 0.0, 1.0));
  float sss = pow(clamp(dot(V, -normalize(L + N * 0.55)), 0.0, 1.0), 3.0) * clamp(vH * 0.45 + 0.3, 0.0, 1.0);
  body += vec3(0.03, 0.12, 0.09) * sss + vec3(0.012, 0.03, 0.028) * max(dot(N, L), 0.0);
  vec3 col = mix(body, sky, fr);
  // the sun on it: a hard glint close by, spread into a broad glitter toward the horizon
  vec3 H = normalize(L + V); float nh = max(dot(N, H), 0.0);
  float rough = mix(900.0, 120.0, smoothstep(40.0, 900.0, dist));
  col += vec3(1.0, 0.93, 0.8) * (pow(nh, rough) * 3.2 + pow(nh, rough * 0.08) * 0.08) * fr * 4.0;
  // white water: the steepest crests breaking, in patches, the foam streaked down the wind
  vec2 fp = vX * 0.11 + wind * uT * 0.35;
  float patchy = vnoise(fp) * 0.6 + vnoise(fp * 3.1 + 7.0) * 0.4;
  // (lace, not paint: the foam broken up finely, thin at its edges, and sliding off the back of the wave)
  float lace = vnoise(vX * 1.4 + wind * uT * 0.6) * 0.55 + vnoise(vX * 4.3 - wind * uT * 0.3) * 0.45;
  float foam = smoothstep(0.6, 0.86, crest + patchy * 0.4) * smoothstep(0.1, 0.8, vH);
  foam *= smoothstep(0.3, 0.72, lace + foam * 0.25) * (1.0 - smoothstep(150.0, 700.0, dist) * 0.5);
  float streak = smoothstep(0.62, 0.9, vnoise(vec2(dot(vX, wind) * 0.05, dot(vX, vec2(-wind.y, wind.x)) * 0.9) + uT * 0.05)) * 0.18 * rf;
  // the ships' own white water: the bow wave thrown up about her stem and along her sides, and her wake behind — a
  //  churned lane straight astern, and the two arms of the waves she makes spreading out from it (Kelvin's angle,
  //  about a fifth of a right angle each side), fading as they go
  float wk = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 a = uS[i], b = uS2[i]; if (b.z <= 0.01) continue;
    vec2 q = vX - a.xy; float u = dot(q, a.zw), v = dot(q, vec2(-a.w, a.z)), sp = b.z;
    if (abs(u) > 260.0 || abs(v) > 120.0) continue;
    float e = length(vec2(u / (b.x * 1.04), v / (b.y * 1.1)));
    float hullF = (1.0 - smoothstep(1.0, 1.0 + 0.5 * sp, e)) * smoothstep(0.92, 1.0, e) * (0.45 + 0.55 * smoothstep(-0.2, 0.9, u / b.x));
    float back = max(0.0, -u - b.x * 0.7), life = 1.0 - smoothstep(0.0, 28.0 + 70.0 * sp, back);
    float lane = (1.0 - smoothstep(b.y * 0.35, b.y * 1.1 + back * 0.04, abs(v))) * life * life * step(0.0, back);
    float arm = abs(abs(v) - (b.y * 0.8 + back * 0.35)), armL = 1.0 - smoothstep(0.0, 16.0 + 36.0 * sp, back);
    float arms = (1.0 - smoothstep(0.0, 0.7 + back * 0.025, arm)) * armL * armL * step(0.0, back);
    wk = max(wk, (hullF * 0.75 + lane * 0.4 + arms * 0.28) * min(sp, 1.0));
  }
  float wlace = smoothstep(0.35, 0.8, lace + wk * 0.3);
  foam = max(foam, wk * wlace);
  col = mix(col, vec3(0.84, 0.88, 0.88), clamp(foam * 0.7 + streak * smoothstep(0.2, 0.6, crest), 0.0, 0.8));
  float f = smoothstep(uFogN, uFogF, dist);
  gl_FragColor = vec4(mix(col, uFogC, f), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// the sea's mesh: fine about the middle, where the eye is and the short waves show, coarser out to the horizon
function seaGeo(half, n) {
  const g = new THREE.PlaneGeometry(2, 2, n, n).rotateX(-Math.PI / 2), p = g.attributes.position, A = 0.12;
  const m = u => Math.sign(u) * half * (A * Math.abs(u) + (1 - A) * Math.abs(u) ** 3);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, m(p.getX(i)), 0, m(p.getZ(i)));
  g.computeBoundingSphere(); return g;
}
const SEA_SNAP = 2100 * 0.12 * 2 / 400;   // (the finest square's width: the mesh moves with the eye a square at a time)

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
    const S = SHIPS[k]; this.B = B; this.team = team; this.k = k; this.S = S; this.name = name; this.color = color;
    this.maxHull = S.hull; this.hull = S.hull * clamp(hp ?? 1, 0.15, 1); this.crew = S.crew * clamp(0.5 + (hp ?? 1) * 0.5, 0.3, 1); this.rig = 1;
    this.x = x; this.z = z; this.yaw = yaw; this.spd = S.speed * 0.5; this.trim = 1; this.rudder = 0;
    this.reload = [S.reload * Math.random() * 0.5, S.reload * Math.random() * 0.5]; this.sink = 0; this.sunk = false; this.struck = false; this.heelK = 0; this.recoil = 0;
    this.L = 26 * S.scale; this.beam = 6.4 * S.scale; this.side0 = Math.random() < 0.5 ? 1 : -1;
    const g = this.root = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const m = modelCopy("ship");
    if (m) { m.scene.position.z = -2.4; inner.add(m.scene); m.scene.traverse(o => { if (o.isMesh && o.material && /flag/.test(o.material.name || "")) { o.material = o.material.clone(); o.material.color.set(color); this.flag = o; } }); }
    else { const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 24), new THREE.MeshStandardMaterial({ color: 0x5a3e28 })); hull.position.y = 1; inner.add(hull); const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x4a3a2a })); mast.position.y = 11; inner.add(mast); const sail = new THREE.Mesh(new THREE.PlaneGeometry(10, 12), new THREE.MeshStandardMaterial({ color: 0xeee6d0, side: THREE.DoubleSide })); sail.position.set(0, 11, 0.5); inner.add(sail); }
    inner.scale.setScalar(S.scale); this.inner = inner;
    // (her sails set, each let fall from its yard: see RIG)
    this.sails = m ? shipSails(m.scene) : [];
    // (her pennant in her colours, high on the mainmast, so friend and foe are told apart across the water)
    //  (a long streamer, tapering to a point, flown from the very top of the mast her flag is on — not a board in the air
    //  beside it)
    const sh = new THREE.Shape(); sh.moveTo(0, 0.42); sh.lineTo(8.5, 0.07); sh.lineTo(8.5, -0.07); sh.lineTo(0, -0.42); sh.closePath();
    const pen = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true }));
    let top = [0, 24.5 * S.scale, 2.5 * S.scale];
    if (m) { inner.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(m.scene), fb = this.flag ? new THREE.Box3().setFromObject(this.flag) : null, c = fb ? fb.getCenter(new THREE.Vector3()) : bb.getCenter(new THREE.Vector3()); top = [c.x, bb.max.y - 0.25, c.z]; }
    pen.position.set(top[0], top[1], top[2]); this.topY = top[1]; pen.rotation.y = Math.PI / 2; g.add(pen); this.pen = pen;
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
  tag(word, color, quiet = false) {
    if (this.tagWord === word) return; this.tagWord = word;
    const cv = document.createElement("canvas"); cv.width = 640; cv.height = 80; const c = cv.getContext("2d");
    c.font = "bold 34px Georgia, serif"; const w = Math.min(624, c.measureText(word).width + 44), x0 = (640 - w) / 2;
    c.fillStyle = quiet ? "rgba(12,18,22,0.55)" : "rgba(12,18,22,0.8)"; c.beginPath(); c.roundRect(x0, 10, w, 60, 10); c.fill(); c.strokeStyle = color; c.lineWidth = quiet ? 2 : 3; if (!quiet) c.stroke(); else { c.beginPath(); c.moveTo(x0 + 14, 62); c.lineTo(x0 + w - 14, 62); c.stroke(); }
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = color; c.fillText(word, 320, 41, 600); this.tagW = w / 640;
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sc = quiet ? [0.26, 0.0325] : [0.36, 0.045];
    if (this.tagS) this.tagS.scale.set(sc[0], sc[1], 1);
    if (!this.tagS) { this.tagS = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false, fog: false })); this.tagS.scale.set(sc[0], sc[1], 1); this.tagS.center.set(0.5, 0); this.tagS.renderOrder = 9; this.B.scene.add(this.tagS); }
    else { this.tagS.material.map.dispose(); this.tagS.material.map = t; this.tagS.material.needsUpdate = true; }
  }
  update(dt, t) {
    if (this.tagS) { this.tagS.position.set(this.x, this.sunk ? 6 * this.S.scale : (this.topY || 24.5 * this.S.scale) + 2 * this.S.scale, this.z); if (this.sunk) { this.wreckT = (this.wreckT || 0) + dt; this.tagS.material.opacity = clamp(1 - (this.wreckT - 20) / 5, 0, 1); } }
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
    // (her sails: let fall or taken in as she makes or shortens sail — the courses first in, the topsails last — and filled
    //  the more the better the wind serves her, with a breath of flutter in them)
    if (this.sails.length) {
      const set = go ? this.trim : 0, fill = 0.35 + 0.65 * this.pointK();
      for (const sl of this.sails) {
        const want = set >= 0.75 || (set > 0 && !sl.course) ? 1 : 0;
        sl.k += (want - sl.k) * Math.min(1, dt * 0.9); if (Math.abs(want - sl.k) < 0.004) sl.k = want;
        sl.m.visible = sl.k > 0.02;
        if (sl.m.visible) sl.m.scale.set(1, sl.drop * sl.k, (0.55 + 0.5 * fill * this.rig) * sl.k * (1 + Math.sin(t * 2.3 + sl.ph) * 0.06));
      }
    }
    // (struck: her colours down and a white flag in their place, her sails let fly, and the word over her)
    if (this.struck && !this.whiteFlag) { this.whiteFlag = true; if (this.flag) this.flag.material.color.set(0xf4f1e6); if (this.pen) this.pen.material.color.set(0xf4f1e6); this.trim = 0; }
    // (every ship still fighting: whose she is and what, small, in her side's colour — the flagship marked as yours)
    //  (the flagship herself, under the eye, needs none)
    if (this.alive) this.tag(this.team ? `${enemyOf(this.name)} ${this.S.one.toLowerCase()}` : `Your ${this.S.one.toLowerCase()}`, this.team ? "#9cc0ea" : "#f0b49e", true);
    if (this.tagS) this.tagS.visible = !(this.alive && this === this.B.flag);
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
// (the enemy's ships called by their crown: "French", "Danish" — or simply "Enemy")
const ADJ = [[/engl/, "English"], [/fran/, "French"], [/castil|spain|spanish|aragon/, "Spanish"], [/dutch|holland/, "Dutch"], [/portug/, "Portuguese"], [/swed/, "Swedish"], [/denm|danish/, "Danish"], [/ottoman|turk/, "Turkish"], [/venic|venet/, "Venetian"], [/algi/, "Algerine"], [/tunis/, "Tunisian"], [/tripol/, "Tripolitan"], [/morocc/, "Moroccan"], [/naples|neapol/, "Neapolitan"], [/scot/, "Scottish"], [/brandenb/, "Brandenburg"]];
const enemyOf = name => { const n = String(name || "").toLowerCase(), m = ADJ.find(([rx]) => rx.test(n)); return m ? m[1] : "Enemy"; };
export const enemyOfName = enemyOf;
// opts: { title, mine: [{ k, hp }], theirs: [{ k, hp }], myColor, theirColor, myName, theirName, onEnd(result) }
// result: { won, left, mine: [{ k, hp, sunk, struck }], theirs: [...] } — hp the hull left, 0..1
export function navalBattle(opts) {
  const B = new Battle(opts); B.start(); window.__navB = B; return B;
}
class Battle {
  constructor(o) {
    this.o = o; this.t = 0; this.timers = []; this.balls = []; this.puffs = []; this.speedK = 1; this.over = false; this.started = false;
    const wa = Math.random() * Math.PI * 2; this.windTo = [Math.sin(wa), Math.cos(wa)]; waveRot = wa; WV = null;
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
    WV = waveSet();
    const W = WV.map(v => new THREE.Vector4(v.dx, v.dz, v.k, v.amp)), Q = WV.map(v => new THREE.Vector2(v.w, v.q));
    this.sea = new THREE.Mesh(seaGeo(2100, 400), new THREE.ShaderMaterial({ vertexShader: SEA_V, fragmentShader: SEA_F, uniforms: { uT: { value: 0 }, uW: { value: W }, uQ: { value: Q }, uS: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, uS2: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, uSun: { value: sd }, uSky: { value: sky }, uHor: { value: hor }, uDeep: { value: new THREE.Color(0x0e3442) }, uFogC: { value: hor }, uFogN: { value: 500 }, uFogF: { value: 2200 } } }));
    sc.add(this.sea);
    this.cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 6000); this.orbit = { a: Math.PI, e: 0.32, d: 95 };
    // the two fleets: in line ahead, a long way apart, coming on
    this.ships = [];
    const lay = (list, team, color, name) => list.forEach((s, i) => { const row = team ? 1 : -1, x = (i - (list.length - 1) / 2) * 60 + (Math.random() - 0.5) * 20, z = row * 300 + (Math.random() - 0.5) * 30; this.ships.push(new Ship(this, team, s.k, s.hp, x, z, team ? Math.PI : 0, s.color || color, s.name || name)); });
    // (the biggest of yours carries your flag)
    const mine = [...o.mine].sort((a, b) => SHIP_KINDS.indexOf(b.k) - SHIP_KINDS.indexOf(a.k));
    lay(mine, 0, o.myColor || "#c0281a", o.myName || "You"); lay(o.theirs, 1, o.theirColor || "#2a5aa0", o.theirName || "The enemy");
    this.order = this.ships.map(s => s); this.flag = this.ships.find(s => s.team === 0);
    this.keys = new Set();
    this.hud();
  }
  later(d, fn) { this.timers.push({ at: this.t + d, fn }); }
  // (the ships' words kept apart on the screen: the nearer ship's stays put, a farther one's rises above it)
  unclutter(dt) {
    this.cam.updateMatrixWorld(); const P = this.cam.projectionMatrix.elements, py = P[5], px = P[0], v = new THREE.Vector3(), placed = [];
    const L = this.ships.filter(s => s.tagS && s.tagS.visible !== false && s.tagS.material.opacity > 0.05).map(s => ({ s, d: this.camDist(s.x, s.z) })).sort((a, b) => a.d - b.d);
    for (const { s } of L) {
      v.copy(s.tagS.position).project(this.cam); if (v.z > 1) continue;
      const w = s.tagS.scale.x * px * (s.tagW || 0.5) + 0.01, h = s.tagS.scale.y * py * 0.8;
      let lift = 0; for (let i = 0; i < 5 && placed.some(q => Math.abs(q.x - v.x) < (q.w + w) / 2 && Math.abs(q.y - (v.y + lift * h)) < (q.h + h) / 2); i++) lift++;
      placed.push({ x: v.x, y: v.y + lift * h, w, h });
      // (its foot just over her masthead, however near she is: not a fixed height that hung far over a ship close by)
      const c = s.tagS.center, to = -lift * 0.8; c.y += (to - c.y) * Math.min(1, dt * 8);
    }
  }
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
  begin() { this.started = true; this.lastHit = this.t; this.el.querySelector(".nv-intro")?.remove(); }
  step(dt) {
    this.t += dt;
    for (const tm of this.timers.splice(0)) if (tm.at <= this.t) tm.fn(); else this.timers.push(tm);
    const f = this.flag;
    if (f && f.alive && this.started) {
      f.rudder = (this.keys.has("KeyA") ? 1 : 0) - (this.keys.has("KeyD") ? 1 : 0);
      // (sailed far out of the fight: her sailing master brings her about, back toward it, unless you're steering)
      const r = Math.hypot(f.x, f.z);
      if (r > 1050 && !f.rudder) { const want = Math.atan2(-f.x, -f.z), d = Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw)); f.rudder = Math.max(-1, Math.min(1, d * 2.2)); if (!this.toldFar) { this.toldFar = true; this.note("Your sailing master brings her about: the battle lies astern"); } }
      else if (r < 900) this.toldFar = false;
    }
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
        const s = hit.s, sc = s.S.scale; this.lastHit = this.t;
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
    const cell = SEA_SNAP; this.sea.position.set(Math.round(c.x / cell) * cell, 0, Math.round(c.z / cell) * cell); this.dome.position.set(c.x, 0, c.z);
    this.sea.material.uniforms.uT.value = this.t;
    // (each ship's bow wave and wake, to the sea: the faster she goes the more white water)
    { const U = this.sea.material.uniforms, A = U.uS.value, B2 = U.uS2.value;
      for (let i = 0; i < 24; i++) { const s = this.ships[i]; if (!s || s.sunk) { B2[i].set(0, 0, 0, 0); continue; } A[i].set(s.x, s.z, Math.sin(s.yaw), Math.cos(s.yaw)); B2[i].set(s.L * 0.5, s.beam * 0.5, clamp(Math.abs(s.spd) / 7, 0, 1.2), 0); } }
    this.unclutter(dt);
    this.renderer.render(this.scene, this.cam);
    this.drawHud();
    try { FOLEY.wash(f && f.alive ? clamp(f.spd / 8, 0.15, 1) : 0.15); } catch (e) {}
    if (this.started && !this.over) {
      const mine = this.ships.some(s => s.team === 0 && s.alive), theirs = this.ships.some(s => s.team === 1 && s.alive);
      if (!mine || !theirs) { this.endT = (this.endT || 0) + dt; if (this.endT > 4) this.end(theirs ? false : true); }
      // (no shot striking home for two and a half minutes: the fleets have drawn apart, and the day goes to the side that
      //  took more of the other's ships — or to neither)
      else if (this.t - (this.lastHit ?? 0) > 150) {
        const lost = team => this.ships.filter(s => s.team === team && !s.alive).length, a = lost(1), b = lost(0);
        this.drawn = a === b; this.end(a > b, a === b);
      }
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
    // (the counts that aren't nothing, in words: "2 sunk, 1 got away")
    const say = parts => parts.filter(p => p[0] > 0).map(p => `${p[0]} ${p[1]}`).join("; ") || "none";
    this.el.insertAdjacentHTML("beforeend", `<div class="nv-end"><div class="nv-box"><h2>${won ? "Victory at sea" : this.drawn ? "The fleets draw apart" : left ? "You break off the action" : "Beaten at sea"}</h2>
      <p>Theirs: ${say([[n(R.theirs, s => s.sunk), "sunk"], [n(R.theirs, s => s.struck), won ? "taken, prizes for your fleet" : "struck, and retaken by them"], [n(R.theirs, s => !s.sunk && !s.struck), won ? "got away" : "still hold the sea"]])}.</p>
      <p>Yours: ${say([[n(R.mine, s => s.sunk), "sunk"], [n(R.mine, s => s.struck), won ? "struck, and retaken" : "struck, taken by them"], [n(R.mine, s => !s.sunk && !s.struck), won ? "afloat" : "got away"]])}.</p>
      <button class="btn primary" data-nv="done">${this.o.doneText || "Back to the map"}</button></div></div>`);
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
