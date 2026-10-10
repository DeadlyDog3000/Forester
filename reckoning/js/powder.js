// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// POWDER SMOKE: what black powder does when it goes off. A jet of thick white smoke thrown out of the muzzle, braking
// hard in a couple of paces and rolling over on itself into a lumpy cloud, sunlit on top and grey beneath; then it
// hangs there, swelling and thinning, lifting a little and drifting off down the wind — a musket's for a handful of
// seconds, a cannon's for the better part of half a minute, and a haze after it. A flintlock throws a puff of its own
// up out of the pan. The flash is a burst of light and sparks at the muzzle, there and gone.

import { THREE } from "./core.js";
import { G } from "./engine.js";

// ---- the look of it: lumpy, cauliflowered puffs, shaded as if lit from above (a few of them, for variety) ----
let PUFFS = null, FLASH = null, SPARK = null;
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
  }
  const f = document.createElement("canvas"); f.width = f.height = 64; const y = f.getContext("2d");
  const g = y.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,252,230,1)"); g.addColorStop(0.25, "rgba(255,200,110,0.9)"); g.addColorStop(0.6, "rgba(255,120,40,0.35)"); g.addColorStop(1, "rgba(255,90,20,0)");
  y.fillStyle = g; y.fillRect(0, 0, 64, 64); FLASH = new THREE.CanvasTexture(f);
  SPARK = new THREE.SpriteMaterial({ map: FLASH, color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
}
// (sprites aren't lit as the world is: dimmed by hand to the daylight, or at night the smoke would glow)
function daylight() { return G.sun ? Math.max(0.14, Math.min(1, 0.14 + G.sun.intensity / 2.4 * 0.86)) : 1; }
// (a gentle wind, the same for every cloud a while, turning slowly)
function wind() { const t = (G.time || 0) * 0.01; return new THREE.Vector3(Math.cos(t) * 0.55, 0, Math.sin(t * 0.7) * 0.4); }

function run(tick) { G.onFrame.push(tick); }
function stop(tick) { const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); }

// the flash: a burst of light at the muzzle and a spray of sparks, a tenth of a second
export function muzzleFlash(root, at, dir, scale = 1) {
  textures();
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLASH, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  core.position.copy(at).addScaledVector(dir, 0.15 * scale); core.scale.setScalar(0.9 * scale); root.add(core);
  const tongue = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLASH, color: 0xffa050, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  tongue.position.copy(at).addScaledVector(dir, 0.5 * scale); tongue.scale.set(0.7 * scale, 0.7 * scale, 1); root.add(tongue);
  const sparks = [];
  for (let i = 0; i < 6 + 6 * scale; i++) {
    const s = new THREE.Sprite(SPARK); s.scale.setScalar(0.05 * Math.sqrt(scale)); s.position.copy(at);
    s.userData.v = dir.clone().multiplyScalar(8 + Math.random() * 12).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.3) * 4, (Math.random() - 0.5) * 4));
    root.add(s); sparks.push(s);
  }
  let t = 0;
  const tick = dt => {
    t += dt;
    core.material.opacity = Math.max(0, 1 - t / 0.08); core.scale.setScalar(0.9 * scale * (1 + t * 6));
    tongue.material.opacity = Math.max(0, 1 - t / 0.06); tongue.position.addScaledVector(dir, dt * 6 * scale);
    for (const s of sparks) { s.userData.v.y -= 9 * dt; s.position.addScaledVector(s.userData.v, dt); s.visible = t < 0.35 + Math.random() * 0.1; }
    if (t > 0.5) { root.remove(core, tongue, ...sparks); core.material.dispose(); tongue.material.dispose(); stop(tick); }
  };
  run(tick);
}

// the smoke itself. o: { scale (1 a musket, about 3 a cannon), life (seconds), n (puffs), speed (of the jet) }
export function powderSmoke(root, at, dir, o = {}) {
  textures();
  const scale = o.scale || 1, life = o.life || 7, n = o.n || 14, speed = o.speed || 9;
  const tint = new THREE.Color(0xe8e9ea).lerp(new THREE.Color(0xc4c9d0), 0.25).multiplyScalar(daylight()), drift = wind(), puffs = [], alpha = o.alpha || 1;
  const add = (p0, v0, s0, grow, l, a0, delay = 0) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFFS[Math.floor(Math.random() * PUFFS.length)], color: tint, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    m.position.copy(p0); m.scale.setScalar(s0); m.material.rotation = Math.random() * Math.PI * 2;
    m.userData = { v: v0, s0, grow, l, a0, delay, spin: (Math.random() - 0.5) * 0.4, t: 0 };
    root.add(m); puffs.push(m);
  };
  // the jet: out along the barrel in a narrow cone, the front of it fastest
  for (let i = 0; i < n; i++) {
    const k = i / n, side = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.4), (Math.random() - 0.5)).multiplyScalar(speed * 0.18);
    const v = dir.clone().multiplyScalar(speed * (0.35 + 0.75 * (1 - k)) * (0.8 + Math.random() * 0.4)).add(side);
    add(at.clone().addScaledVector(dir, 0.1 * scale), v, (0.18 + Math.random() * 0.12) * scale, (0.8 + Math.random() * 0.6) * scale, life * (0.7 + Math.random() * 0.6), (0.7 + Math.random() * 0.25) * alpha);
  }
  // (a cannon's leaves a wide, faint haze hanging after the cloud has gone)
  if (o.haze) for (let i = 0; i < 6; i++) {
    const v = dir.clone().multiplyScalar(speed * 0.25 * Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 0.6, (Math.random() - 0.5) * 2));
    add(at.clone().addScaledVector(dir, 2 + Math.random() * 3), v, 1.0 * scale, 2.2 * scale, life * 1.4, 0.1, 0.6 + Math.random() * 0.8);
  }
  const tick = dt => {
    let alive = 0;
    for (const m of puffs) {
      const u = m.userData; u.t += dt;
      if (u.t < u.delay) { alive++; continue; }
      const t = u.t - u.delay;
      if (t > u.l) { if (m.parent) { root.remove(m); m.material.dispose(); } continue; }
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
      m.material.opacity = u.a0 * Math.min(1, t * 12) * (1 - Math.pow(k, 1.1)) * spread;
    }
    if (!alive) stop(tick);
  };
  run(tick);
}
// a flintlock's pan: a little puff out of the lock, at the side, going up
export function panPuff(root, at, scale = 1) {
  powderSmoke(root, at, new THREE.Vector3(0, 1, 0), { scale: 0.35 * scale, life: 3, n: 4, speed: 2.6, alpha: 0.55 });
}
