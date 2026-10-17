// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// POWDER SMOKE: what black powder does when it goes off. A jet of thick, dirty grey-black smoke thrown out of the muzzle, braking
// hard in a couple of paces and rolling over on itself into a lumpy cloud, sunlit on top and grey beneath; then it
// hangs there, swelling and thinning, lifting a little and drifting off down the wind — a musket's for a handful of
// seconds, a cannon's for the better part of half a minute, and a haze after it. A flintlock throws a puff of its own
// up out of the pan. The flash is a burst of light and sparks at the muzzle, there and gone.

import { THREE } from "./core.js";
import { G } from "./engine.js";
import { Billboards } from "./billboards.js";

// ---- the look of it: lumpy, cauliflowered puffs, shaded as if lit from above (a few of them, for variety) ----
let PUFFS = null, FLASH = null, SPARK = null, SHEET = null, SHEET_C = null;
// (each world's two pools of them: the smoke, sorted and see-through; the flashes and sparks, adding light)
const POOL = new WeakMap();
function pools(root) {
  let P = POOL.get(root); if (P && P.smoke.mesh.parent === root) return P;
  Billboards.install(G.scene);
  P = { smoke: new Billboards(root, SHEET, { grid: [2, 2], order: 2 }), flash: new Billboards(root, FLASH, { additive: true, order: 3 }) };
  POOL.set(root, P); return P;
}
function textures() {
  if (PUFFS) return;
  PUFFS = [];
  for (let v = 0; v < 4; v++) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 30, px = 64 + Math.cos(a) * d, py = 66 + Math.sin(a) * d * 0.85;
      const r = Math.min(18 + Math.random() * 22, px - 2, 126 - px, py - 2, 126 - py);
      const g = x.createRadialGradient(px - r * 0.25, py - r * 0.3, r * 0.1, px, py, r);
      g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.55, "rgba(236,234,230,0.6)"); g.addColorStop(1, "rgba(220,218,214,0)");
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    // (its underside in shadow: the lower part darkened, the colour kept)
    x.globalCompositeOperation = "source-atop";
    const sh = x.createLinearGradient(0, 30, 0, 118); sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(70,72,78,0.55)");
    x.fillStyle = sh; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; PUFFS.push(t);
    (SHEET_C ||= []).push(c);
  }
  // (the four on one sheet, two by two, for the puffs drawn all together)
  { const sh = document.createElement("canvas"); sh.width = sh.height = 256; const x2 = sh.getContext("2d"); SHEET_C.forEach((c, i) => x2.drawImage(c, (i % 2) * 128, (1 - Math.floor(i / 2)) * 128)); SHEET = new THREE.CanvasTexture(sh); SHEET.colorSpace = THREE.SRGBColorSpace; }
  const f = document.createElement("canvas"); f.width = f.height = 64; const y = f.getContext("2d");
  const g = y.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,252,230,1)"); g.addColorStop(0.25, "rgba(255,200,110,0.9)"); g.addColorStop(0.6, "rgba(255,120,40,0.35)"); g.addColorStop(1, "rgba(255,90,20,0)");
  y.fillStyle = g; y.fillRect(0, 0, 64, 64); FLASH = new THREE.CanvasTexture(f);
  SPARK = new THREE.SpriteMaterial({ map: FLASH, color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
}
// (sprites aren't lit as the world is: dimmed by hand to the daylight, or at night the smoke would glow)
function daylight() { return G.sun ? Math.max(0.14, Math.min(1, 0.14 + G.sun.intensity / 2.4 * 0.86)) : 1; }
// (a gentle wind, the same for every cloud a while, turning slowly)
function wind() { const t = (G.time || 0) * 0.01; return new THREE.Vector3(Math.cos(t) * 0.55, 0, Math.sin(t * 0.7) * 0.4); }

const _cp = new THREE.Vector3();
function run(tick) { G.onFrame.push(tick); }
function stop(tick) { const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); }

// the flash: a burst of light at the muzzle and a spray of sparks, a tenth of a second
export function muzzleFlash(root, at, dir, scale = 1) {
  textures();
  const F = pools(root).flash;
  const core = F.add(0, 0xffffff); core.position.copy(at).addScaledVector(dir, 0.15 * scale); core.scale.setScalar(0.9 * scale);
  const tongue = F.add(0, 0xffa050); tongue.position.copy(at).addScaledVector(dir, 0.5 * scale); tongue.scale.setScalar(0.7 * scale);
  const sparks = [];
  for (let i = 0; i < 6 + 6 * scale; i++) {
    const s = F.add(0, 0xffc070); s.scale.setScalar(0.05 * Math.sqrt(scale)); s.position.copy(at);
    s.userData.v = dir.clone().multiplyScalar(8 + Math.random() * 12).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.3) * 4, (Math.random() - 0.5) * 4));
    sparks.push(s);
  }
  let t = 0;
  const tick = dt => {
    t += dt;
    core.material.opacity = Math.max(0, 1 - t / 0.08); core.scale.setScalar(0.9 * scale * (1 + t * 6));
    tongue.material.opacity = Math.max(0, 1 - t / 0.06); tongue.position.addScaledVector(dir, dt * 6 * scale);
    for (const s of sparks) { s.userData.v.y -= 9 * dt; s.position.addScaledVector(s.userData.v, dt); s.visible = t < 0.35 + Math.random() * 0.1; }
    if (t > 0.5) { for (const p of [core, tongue, ...sparks]) F.remove(p); stop(tick); }
  };
  run(tick);
}

// (how many puffs there are on the field at once, all told: a battle's volleys made thousands, each drawn on its own,
//  and the game crawled — so past a point a shot's cloud is made of fewer, bigger puffs, a far one of fewer still, and
//  when there are too many the oldest thin away the sooner)
const CAP = 420, ALL = new Set();
// (a puff of a field since cleared away — its ticking stopped with the scene — doesn't count)
const live = () => { if (ALL.size > CAP / 2) for (const m of ALL) { let o = m; while (o.parent) o = o.parent; if (o !== G.scene) ALL.delete(m); } return ALL.size; };
window.__smokeN = () => live();
const _cd = new THREE.Vector3();
// the smoke itself. o: { scale (1 a musket, about 3 a cannon), life (seconds), n (puffs), speed (of the jet) }
export function powderSmoke(root, at, dir, o = {}) {
  textures();
  const cam0 = window.__camera, far = cam0 ? cam0.getWorldPosition(_cd).distanceTo(at) : 0;
  const LIVE = live(), room = Math.max(0.12, 1 - LIVE / CAP) * (far > 90 ? 0.35 : far > 45 ? 0.6 : 1);
  const n0 = o.n || 14, n = Math.max(Math.min(n0, 3), Math.round(n0 * room)), big = Math.min(2.2, Math.sqrt(n0 / n));
  const scale = o.scale || 1, life = o.life || 7, speed = o.speed || 9;
  // (a grey: coarse powder burnt in a hurry — the haze it leaves lighter. Darker than this, a gun's cloud hung in a
  //  sunlit field as a black blot)
  const day = daylight(), tint = new THREE.Color(o.tint || 0x9a9996).multiplyScalar(day), hazeTint = new THREE.Color(0xaeadaa).multiplyScalar(day), drift = wind(), puffs = [], alpha = o.alpha || 1;
  const SM = pools(root).smoke;
  const add = (p0, v0, s0, grow, l, a0, delay = 0, col = tint) => {
    const m = SM.add(Math.floor(Math.random() * 4), col); m.material.opacity = 0;
    s0 *= big; grow *= big; ALL.add(m);
    m.position.copy(p0); m.scale.setScalar(s0); m.material.rotation = Math.random() * Math.PI * 2;
    // (drawn at 2, over the blood on the ground at 1: a cloud hides what lies under it)
    m.userData = { v: v0, s0, grow, l, a0, delay, spin: (Math.random() - 0.5) * 0.4, t: 0 };
    puffs.push(m);
  };
  // the jet: out along the barrel in a narrow cone, the front of it fastest
  for (let i = 0; i < n; i++) {
    const k = i / n, side = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.4), (Math.random() - 0.5)).multiplyScalar(speed * 0.18);
    const v = dir.clone().multiplyScalar(speed * (0.35 + 0.75 * (1 - k)) * (0.8 + Math.random() * 0.4)).add(side);
    add(at.clone().addScaledVector(dir, 0.1 * scale), v, (0.18 + Math.random() * 0.12) * scale, (0.8 + Math.random() * 0.6) * scale, life * (0.7 + Math.random() * 0.6), (0.7 + Math.random() * 0.25) * alpha);
  }
  // (a cannon's leaves a wide, faint haze hanging after the cloud has gone)
  // (black powder's smoke hangs: a musket's too leaves a bank of it drifting off down the line — o.hazeN puffs, o.hazeA thick)
  if (o.haze) for (let i = 0, hn = Math.round((o.hazeN || 6) * room); i < hn; i++) {
    const v = dir.clone().multiplyScalar(speed * 0.25 * Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 0.6, (Math.random() - 0.5) * 2));
    add(at.clone().addScaledVector(dir, (2 + Math.random() * 3) * Math.min(1, scale)), v, 1.0 * scale, 2.2 * scale, life * 1.4, o.hazeA || 0.1, 0.6 + Math.random() * 0.8, hazeTint);
  }
  const tick = dt => {
    let alive = 0;
    for (const m of puffs) {
      const u = m.userData; u.t += dt;
      if (u.t < u.delay) { alive++; continue; }
      const t = u.t - u.delay;
      // (too many on the field: the older ones thin away over a second and a half)
      if (ALL.size > CAP && t > 3 && u.kill == null) u.kill = 1;
      if (u.kill != null) u.kill -= dt / 1.5;
      if (t > u.l || (u.kill != null && u.kill <= 0)) { if (m.parent) SM.remove(m); ALL.delete(m); continue; }
      alive++;
      // braking hard out of the jet, then hanging, lifting a little, and away on the wind
      u.v.multiplyScalar(Math.exp(-dt * 3.4));
      u.v.y += dt * 0.1;
      m.position.addScaledVector(u.v, dt).addScaledVector(drift, dt * Math.min(1, t * 0.6));
      // swelling fast as it rolls out, then slowly as it thins
      const sc = u.s0 + u.grow * (1 - Math.exp(-t * 2.2)) + u.grow * 0.08 * t;
      m.scale.setScalar(sc);
      m.material.rotation += u.spin * dt;
      // (thinner as it spreads: the same smoke over more air, until it's a haze, and then nothing)
      const k = t / u.l, spread = Math.min(1, (u.s0 + u.grow * 0.55) / sc);
      // (and see-through as it comes over your eyes: a cloud you stand in is a haze round you, never a wall over the
      //  view — a dark puff across the whole sky turned it black)
      const cam = window.__camera, near = cam ? cam.getWorldPosition(_cp).distanceTo(m.position) / (sc * 0.55 + 0.4) : 9;
      m.material.opacity = u.a0 * Math.min(1, t * 12) * (1 - Math.pow(k, 1.1)) * spread * Math.min(1, Math.max(0, near - 0.35) / 0.9) * (u.kill != null ? Math.max(0, u.kill) : 1);
    }
    if (!alive) stop(tick);
  };
  run(tick);
}
// a flintlock's pan: a little puff out of the lock, at the side, going up
export function panPuff(root, at, scale = 1) {
  powderSmoke(root, at, new THREE.Vector3(0, 1, 0), { scale: 0.35 * scale, life: 3, n: 4, speed: 2.6, alpha: 0.55 });
}
