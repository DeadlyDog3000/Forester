// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Birds overhead: little flocks of finches bounding over the clearing (a burst of
// wingbeats, then a dip with the wings shut), crows rowing steadily across, a
// buzzard wheeling high on still wings, and bats flickering about at dusk. A tree
// coming down, or a shot, puts the birds up out of the woods round it.
// All of them are one mesh, drawn at once; their wings beat in the shader.

import { THREE, clamp } from "./core.js";
import { G } from "./engine.js";

const MAX = 90;
// how each kind flies: span (m), speed (m/s), height above the ground, beats a second, colour, how many together
const KIND = {
  finch:   { span: 0.24, speed: 9, alt: [6, 22], rate: 15, col: 0x4a3c30, n: [5, 11], bound: true },
  crow:    { span: 0.95, speed: 10, alt: [14, 40], rate: 4.2, col: 0x141414, n: [1, 4] },
  buzzard: { span: 1.25, speed: 8, alt: [45, 75], rate: 3, col: 0x5a4430, n: [1, 1], soar: true },
  bat:     { span: 0.3, speed: 6, alt: [3, 12], rate: 11, col: 0x2a2220, n: [2, 5], erratic: true },
  gull:    { span: 1.15, speed: 7.5, alt: [7, 24], rate: 3.4, col: 0xe6e6e2, n: [1, 3], glide: true },
};
// a bird: a slim body and two wings, each wing's points marked with how far out along it they lie (for the beat)
function birdGeo() {
  const P = [], W = [], I = [];
  const v = (x, y, z, w) => { P.push(x, y, z); W.push(w); return P.length / 3 - 1; };
  // body, along +z (forward), a flat diamond seen from above and a little depth
  const nose = v(0, 0, 0.5, 0), tail = v(0, 0.01, -0.5, 0), l = v(-0.09, 0, 0.05, 0), r = v(0.09, 0, 0.05, 0), top = v(0, 0.07, 0.05, 0), bot = v(0, -0.06, 0.05, 0);
  I.push(nose, l, top, nose, top, r, tail, top, l, tail, r, top, nose, bot, l, nose, r, bot, tail, l, bot, tail, bot, r);
  // the tail fan
  const t1 = v(-0.12, 0, -0.62, 0), t2 = v(0.12, 0, -0.62, 0); I.push(tail, t1, t2, tail, t2, t1);
  // wings: root at the body, a bend at the wrist, the tip; swept a little back
  for (const s of [-1, 1]) {
    const a = v(s * 0.08, 0.02, 0.18, 0), b = v(s * 0.08, 0.02, -0.12, 0), m = v(s * 0.5, 0.02, 0.05, s * 0.5), m2 = v(s * 0.5, 0.02, -0.18, s * 0.5), tip = v(s * 1.0, 0.02, -0.22, s);
    I.push(a, m, b, b, m, m2, m, tip, m2, a, b, m, b, m2, m, m, m2, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("aWing", new THREE.Float32BufferAttribute(W, 1));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

export class Birds {
  // opts.gulls: a harbour's sky instead of the woods' — gulls wheeling over the water round opts.at
  constructor(w, opts = {}) {
    this.w = w; this.flocks = []; this.t = 0; this.spawnT = 2; this.opts = opts;
    const geo = birdGeo();
    this.flap = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);   // phase, beats a second, how far the wings go
    geo.setAttribute("aFlap", this.flap);
    this.uT = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = this.uT;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aWing; attribute vec3 aFlap; uniform float uT;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float wa = sin(uT * aFlap.y * 6.2832 + aFlap.x) * aFlap.z;
          float aw = abs(aWing);
          // (the wing hinges at the body and bends again at the wrist: the outer half goes further)
          transformed.y += wa * aw * (0.55 + aw * 0.45);
          transformed.x *= 1.0 - abs(wa) * aw * 0.12;`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.count = 0;
    w.root.add(this.mesh);
    // anything that puts the birds up: a tree down, a shot
    G.startleBirds = (x, z) => this.startle(x, z);
  }
  flock(kind, x, z, opts = {}) {
    const K = KIND[kind], n = opts.n || Math.round(K.n[0] + Math.random() * (K.n[1] - K.n[0]));
    const gy = this.w.heightAt(x, z), alt = opts.alt ?? K.alt[0] + Math.random() * (K.alt[1] - K.alt[0]);
    const a = opts.dir ?? Math.random() * Math.PI * 2;
    const f = { kind, K, pos: new THREE.Vector3(x, gy + alt, z), vel: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(K.speed), alt, target: null, life: opts.life ?? 60 + Math.random() * 60, birds: [], heading: a, circle: Math.random() * 6.28, climb: opts.climb || 0 };
    for (let i = 0; i < n; i++) {
      const sp = kind === "finch" ? 2.2 : kind === "crow" ? 4 : 2;
      f.birds.push({ off: new THREE.Vector3((Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp * 0.6, (Math.random() - 0.5) * sp * 2), ph: Math.random() * 6.28, wob: Math.random() * 6.28, glide: 0 });
    }
    this.flocks.push(f);
    return f;
  }
  // put the birds up: a burst of finches (and a crow or two, cawing off) out of the trees round x, z, away from you
  startle(x, z) {
    const p = G.player && G.player.pos; if (!p || Math.hypot(x - p.x, z - p.z) > 90) return;
    const away = Math.atan2(x - p.x, z - p.z) + (Math.random() - 0.5) * 1.2;
    this.flock("finch", x, z, { alt: 7 + Math.random() * 4, dir: away, life: 25, climb: 4, n: 8 + Math.floor(Math.random() * 6) });
    if (Math.random() < 0.6) this.flock("crow", x + 3, z - 2, { alt: 10, dir: away + 0.4, life: 30, climb: 3 });
  }
  update(dt) {
    const p = G.player && G.player.pos; if (!p) return;
    this.t += dt; this.uT.value = this.t;
    const town = G.town, f = town ? town.frac : 0.4, rain = this.w.rainK || 0;
    const day = f > 0.05 && f < 0.66, dusk = f > 0.62 && f < 0.78, winter = town && town.winter;
    const under = this.w.cave && this.w.cave.inside;
    this.mesh.visible = !under;
    // ---- who is about: a few flocks round you by day, bats at dusk, nothing in a downpour or the dark ----
    if (this.opts.gulls && (this.spawnT -= dt) <= 0) {
      this.spawnT = 3 + Math.random() * 4;
      const at = this.opts.at, n = this.flocks.length;
      if (n < 4 && rain < 0.6) { const a = Math.random() * 6.28, r = 8 + Math.random() * 40; this.flock("gull", at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, { dir: Math.random() * 6.28, life: 60 + Math.random() * 60 }); }
    } else if (!this.opts.gulls && (this.spawnT -= dt) <= 0) {
      this.spawnT = 4 + Math.random() * 6;
      const live = k => this.flocks.filter(q => q.kind === k).length;
      const ring = (r0, r1) => { const a = Math.random() * 6.28, r = r0 + Math.random() * (r1 - r0); return [p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, a + Math.PI + (Math.random() - 0.5) * 1.4]; };
      if (day && rain < 0.5) {
        if (!winter && live("finch") < 2) { const [x, z, d] = ring(60, 110); this.flock("finch", x, z, { dir: d }); }
        if (live("crow") < (winter ? 2 : 1)) { const [x, z, d] = ring(80, 140); this.flock("crow", x, z, { dir: d }); }
        if (!live("buzzard") && Math.random() < 0.25) { const [x, z] = ring(10, 60); this.flock("buzzard", x, z, { life: 90 + Math.random() * 60 }); }
      }
      if (dusk && !winter && rain < 0.3 && live("bat") < 2) { const [x, z, d] = ring(15, 40); this.flock("bat", x, z, { dir: d, life: 50 }); }
    }
    // ---- flying ----
    const m = this.mesh, d = new THREE.Object3D(), c = new THREE.Color(), fl = this.flap.array;
    let n = 0;
    for (let k = this.flocks.length - 1; k >= 0; k--) {
      const q = this.flocks[k], K = q.K;
      q.life -= dt;
      const dist = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
      if (dist > 260 || (q.life < 0 && dist > 120) || q.life < -40 || (!this.opts.gulls && !day && !dusk && q.kind !== "bat" && q.life < 0) || (q.kind === "bat" && !dusk && q.life < 0)) { this.flocks.splice(k, 1); continue; }
      // where to: a buzzard wheels over a spot; the rest wander across, curving gently, and turn back toward you if they
      // stray too far (while they're still about)
      if (K.soar) {
        q.circle += dt * K.speed / 35;
        const cx = q.cx ?? (q.cx = q.pos.x), cz = q.cz ?? (q.cz = q.pos.z);
        const want = new THREE.Vector3(cx + Math.cos(q.circle) * 35 - q.pos.x, 0, cz + Math.sin(q.circle) * 35 - q.pos.z);
        q.vel.lerp(want.normalize().multiplyScalar(K.speed), Math.min(1, dt * 1.5));
      } else if (K.glide && this.opts.at) {
        // (a gull: long easy turns over the water, drifting back over the harbour if it strays)
        const at = this.opts.at, back = Math.atan2(at.x - q.pos.x, at.z - q.pos.z), da = Math.hypot(at.x - q.pos.x, at.z - q.pos.z);
        q.heading += (Math.sin(this.t * 0.25 + k * 2.1) * 0.5) * dt;
        if (da > 70) { let dh = back - q.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); q.heading += Math.max(-0.5, Math.min(0.5, dh)) * dt; }
        q.vel.set(Math.sin(q.heading), 0, Math.cos(q.heading)).multiplyScalar(K.speed);
      } else {
        q.heading += (Math.sin(this.t * 0.3 + k * 1.7) * 0.25 + (K.erratic ? Math.sin(this.t * 2.3 + k) * 2.2 : 0)) * dt;
        if (q.life > 0 && dist > 120) { const back = Math.atan2(p.x - q.pos.x, p.z - q.pos.z); let dh = back - q.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); q.heading += clamp(dh, -0.6, 0.6) * dt; }
        q.vel.set(Math.sin(q.heading), 0, Math.cos(q.heading)).multiplyScalar(K.speed);
      }
      q.pos.addScaledVector(q.vel, dt);
      // (keeping their height over the ground, rising first if put up out of the trees)
      const gy = this.w.heightAt(q.pos.x, q.pos.z), wantY = gy + q.alt + (q.climb ? 6 : 0);
      if (q.climb) q.climb = Math.max(0, q.climb - dt);
      q.pos.y += clamp(wantY - q.pos.y, -2, 3) * Math.min(1, dt * (q.climb ? 2 : 0.6));
      const yaw = Math.atan2(q.vel.x, q.vel.z), turn = (yaw - (q.lastYaw ?? yaw)); q.lastYaw = yaw;
      for (const b of q.birds) {
        if (n >= MAX) break;
        b.wob += dt;
        const bob = K.bound ? Math.sin(this.t * 2.6 + b.ph) * 0.5 : Math.sin(this.t * 0.8 + b.ph) * 0.2;
        const ox = b.off.x * Math.cos(yaw) + b.off.z * Math.sin(yaw), oz = -b.off.x * Math.sin(yaw) + b.off.z * Math.cos(yaw);
        d.position.set(q.pos.x + ox + Math.sin(b.wob * 0.7 + b.ph) * 0.4, q.pos.y + b.off.y + bob, q.pos.z + oz + Math.cos(b.wob * 0.6 + b.ph) * 0.4);
        d.rotation.set(K.bound ? -Math.cos(this.t * 2.6 + b.ph) * 0.25 : 0, yaw, clamp(-turn / Math.max(dt, 1e-3) * 0.25, -0.6, 0.6), "YXZ");
        d.scale.setScalar(K.span / 2);
        d.updateMatrix(); m.setMatrixAt(n, d.matrix);
        m.setColorAt(n, c.set(K.col));
        // the wingbeat: a finch beats in bursts and shuts its wings between; a crow rows on; a buzzard hardly beats at all
        let amp = 0.55;
        if (K.bound) amp = Math.sin(this.t * 2.6 + b.ph) > -0.2 ? 0.7 : 0.04;
        if (K.soar) amp = Math.sin(this.t * 0.15 + b.ph) > 0.93 ? 0.35 : 0.03;
        if (K.glide) amp = Math.sin(this.t * 0.6 + b.ph) > 0.3 ? 0.45 : 0.05;
        fl[n * 3] = b.ph; fl[n * 3 + 1] = K.rate * (0.9 + (b.ph % 1) * 0.2); fl[n * 3 + 2] = amp;
        n++;
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; this.flap.needsUpdate = true;
  }
}
