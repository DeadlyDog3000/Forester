// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Bugs. Every so often a little cloud of them turns up near you: flies in the
// daytime, moths in the dusk and round the lamps, fireflies in the woods after
// dark. Now and then one comes buzzing past your ear.

import { THREE } from "./core.js";

const N = 90;
const KINDS = {
  flies:     { color: 0x1a1814, size: 0.045, speed: 2.6, jitter: 9, glow: false, per: [5, 10], every: [7, 15], buzz: true },
  moths:     { color: 0xe0d6bc, size: 0.07, speed: 1.3, jitter: 4, glow: false, per: [3, 7], every: [8, 16], buzz: false },
  fireflies: { color: 0xd8ff7a, size: 0.11, speed: 0.6, jitter: 1.5, glow: true, per: [8, 16], every: [5, 10], buzz: false },
};

function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,0.8)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Bugs {
  constructor(scene) {
    this.pos = new Float32Array(N * 3).fill(-9999);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    const tex = dotTexture();
    this.matDark = new THREE.PointsMaterial({ map: tex, size: 0.05, transparent: true, depthWrite: false, color: 0x1a1814, sizeAttenuation: true });
    this.matGlow = new THREE.PointsMaterial({ map: tex, size: 0.1, transparent: true, depthWrite: false, color: 0xd8ff7a, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.matDark);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.bugs = [];           // {i, cx,cy,cz, ph, r, life, blink}
    this.swarms = [];
    this.next = 3;
    this.kind = null;
  }
  setKind(k) {
    if (k === this.kind) return;
    this.kind = k;
    this.clear();
    if (!k) return;
    const K = KINDS[k];
    const m = K.glow ? this.matGlow : this.matDark;
    m.color.set(K.color); m.size = K.size;
    this.points.material = m;
    this.next = 2 + Math.random() * 4;
  }
  clear() { this.swarms = []; this.pos.fill(-9999); this.geo.attributes.position.needsUpdate = true; }
  update(dt, player, sfx) {
    if (!this.kind || !player) { return; }
    const K = KINDS[this.kind];
    this.next -= dt;
    if (this.next <= 0 && this.swarms.length < 4) {
      this.next = K.every[0] + Math.random() * (K.every[1] - K.every[0]);
      // somewhere ahead of you, off to one side
      const a = player.yaw + (Math.random() - 0.5) * 2.2, d = 3 + Math.random() * 6;
      const cx = player.pos.x - Math.sin(a) * d, cz = player.pos.z - Math.cos(a) * d;
      const n = Math.floor(K.per[0] + Math.random() * (K.per[1] - K.per[0]));
      const s = { cx, cy: player.pos.y + 0.8 + Math.random() * 1.2, cz, vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, life: 12 + Math.random() * 10, bugs: [] };
      for (let i = 0; i < n; i++) s.bugs.push({ ph: Math.random() * 100, r: 0.2 + Math.random() * 0.7, sp: 0.6 + Math.random() * 0.8, x: cx, y: s.cy, z: cz });
      this.swarms.push(s);
      // and sometimes one comes right past your ear
      if (K.buzz && Math.random() < 0.45) { s.zip = { t: 0 }; sfx && sfx(); }
    }
    let k = 0;
    const eye = player.eyePos ? player.eyePos() : player.pos;
    for (const s of this.swarms) {
      s.life -= dt;
      s.cx += s.vx * dt; s.cz += s.vz * dt;
      const fade = Math.min(1, s.life / 2);
      for (const b of s.bugs) {
        if (k >= N) break;
        b.ph += dt * K.speed * b.sp;
        let tx = s.cx + Math.sin(b.ph * 1.7) * b.r + Math.sin(b.ph * 4.3) * 0.12;
        let ty = s.cy + Math.sin(b.ph * 2.3) * b.r * 0.5 + Math.cos(b.ph * 5.1) * 0.06;
        let tz = s.cz + Math.cos(b.ph * 1.3) * b.r + Math.cos(b.ph * 3.9) * 0.12;
        if (s.zip && b === s.bugs[0]) {
          // the one that comes for your ear: out from the cloud, past you, and back
          s.zip.t += dt * 0.7;
          const t = Math.min(1, s.zip.t), u = Math.sin(t * Math.PI);
          tx += (eye.x + Math.cos(player.yaw) * 0.35 - tx) * u; ty += (eye.y - ty) * u; tz += (eye.z - Math.sin(player.yaw) * 0.35 - tz) * u;
        }
        b.x += (tx - b.x) * Math.min(1, dt * K.jitter); b.y += (ty - b.y) * Math.min(1, dt * K.jitter); b.z += (tz - b.z) * Math.min(1, dt * K.jitter);
        // fireflies blink
        const hide = (K.glow && Math.sin(b.ph * 1.9 + b.r * 10) < -0.3) || Math.random() > fade + 0.2;
        this.pos[k * 3] = b.x; this.pos[k * 3 + 1] = hide ? -9999 : b.y; this.pos[k * 3 + 2] = b.z;
        k++;
      }
    }
    for (; k < N; k++) this.pos[k * 3 + 1] = -9999;
    this.swarms = this.swarms.filter(s => s.life > 0);
    this.geo.attributes.position.needsUpdate = true;
  }
}
