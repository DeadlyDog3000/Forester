// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Red squirrels: a few about the forest floor round you, bounding from tree to
// tree, sitting up now and then to look about with the tail curled over the back;
// come near and one is off to the nearest trunk and up it in a spiral, to sit on
// a branch out of reach until you've gone.

import { THREE, renderer } from "./core.js";
import { G } from "./engine.js";
import { CLEARING } from "./woods.js";

const COL = 0x9a4a22, BELLY = 0xe8d8c0;
function squirrelMesh() {
  const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const fur = M(COL), belly = M(BELLY), dark = M(0x1a1410);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), fur); body.scale.set(0.8, 0.85, 1.4); body.position.set(0, 0.07, 0); g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), belly); chest.position.set(0, 0.06, 0.05); g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), fur); head.scale.set(0.9, 0.9, 1.15); head.position.set(0, 0.11, 0.09); g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 4), fur); ear.position.set(s * 0.018, 0.15, 0.08); g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 4, 3), dark); eye.position.set(s * 0.022, 0.12, 0.115); g.add(eye);
  }
  // the tail: a big plume, curved up over the back
  const tail = new THREE.Group(); tail.position.set(0, 0.07, -0.08); g.add(tail);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.04 + i * 0.004, 6, 5), fur);
    const a = i / 3 * 1.6;
    p.position.set(0, Math.sin(a) * 0.1, -Math.cos(a) * 0.05 - 0.02); p.scale.set(0.8, 1.2, 0.9); tail.add(p);
  }
  g.userData.tail = tail; g.userData.body = body; g.userData.head = head;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Squirrels {
  constructor(w) { this.w = w; this.list = []; this.t = 0; this.spawnT = 1; }
  // a tree near x, z to make for (the forest's own trees, standing)
  treeNear(x, z, r = 12) {
    let best = null, bd = r * r;
    for (const t of this.w.forest) { if (t.gone) continue; const dx = t.x - x, dz = t.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = t; } }
    return best;
  }
  spawn(p) {
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 25, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + 6) return;
    const t = this.treeNear(x, z, 8); if (!t) return;
    const m = squirrelMesh(); this.w.root.add(m);
    this.list.push({ m, x: t.x + 0.6, z: t.z + 0.4, y: this.w.heightAt(t.x, t.z), state: "sit", t: 1 + Math.random() * 3, yaw: Math.random() * 6.28, tree: t, climb: 0 });
  }
  remove(s) { this.w.root.remove(s.m); this.list.splice(this.list.indexOf(s), 1); }
  update(dt) {
    const p = G.player && G.player.pos, T = G.town; if (!p) return;
    this.t += dt;
    const night = T && (T.frac > 0.74 || T.frac < 0.04), rain = (this.w.rainK || 0) > 0.5;
    // (a few about by day, none in the dark or a downpour; they go in when you're far off)
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 5; if (!night && !rain && this.list.length < 4) this.spawn(p); }
    for (const s of this.list.slice()) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 90 || ((night || rain) && s.state !== "up")) { this.remove(s); continue; }
      s.t -= dt;
      // seen: off to the tree and up it
      if (d < 9 && s.state !== "up" && s.state !== "climb" && s.state !== "flee") { s.state = "flee"; s.tree = this.treeNear(s.x, s.z, 15) || s.tree; }
      if (s.state === "sit") {
        if (s.t <= 0) { s.state = "hop"; s.t = 1.5 + Math.random() * 2; const a = Math.random() * 6.28, t2 = Math.random() < 0.5 && this.treeNear(s.x + Math.cos(a) * 6, s.z + Math.sin(a) * 6, 6); s.goal = t2 ? { x: t2.x + 0.5, z: t2.z + 0.5 } : { x: s.x + Math.cos(a) * 3, z: s.z + Math.sin(a) * 3 }; }
      } else if (s.state === "hop" || s.state === "flee") {
        const g = s.state === "flee" ? { x: s.tree.x + 0.25, z: s.tree.z + 0.25 } : s.goal, dx = g.x - s.x, dz = g.z - s.z, dd = Math.hypot(dx, dz);
        const sp = s.state === "flee" ? 4.5 : 1.6;
        if (dd < 0.15) { if (s.state === "flee") { s.state = "climb"; s.climb = 0; s.top = 2.5 + Math.random() * 3; } else { s.state = "sit"; s.t = 1.5 + Math.random() * 4; } }
        else { s.x += dx / dd * sp * dt; s.z += dz / dd * sp * dt; s.yaw = Math.atan2(dx, dz); }
      } else if (s.state === "climb") {
        s.climb = Math.min(s.top, s.climb + dt * 2.2);
        if (s.climb >= s.top) { s.state = "up"; s.t = 8 + Math.random() * 10; }
      } else if (s.state === "up") {
        // (down again once you've gone off a way)
        if (s.t <= 0 && d > 14) { s.state = "down"; }
      } else if (s.state === "down") {
        s.climb = Math.max(0, s.climb - dt * 1.6);
        if (s.climb <= 0) { s.state = "sit"; s.t = 2; s.x += 0.4; }
      }
      // ---- placing it: bounding along the ground, or round the trunk ----
      const m = s.m, gy = this.w.heightAt(s.x, s.z);
      if (s.state === "climb" || s.state === "up" || s.state === "down") {
        const t = s.tree, a = s.climb * 2.2 + (s.ph || (s.ph = Math.random() * 6));
        const r = 0.22 + (t.kind === "birch" ? 0 : 0.08);
        m.position.set(t.x + Math.cos(a) * r, gy + s.climb, t.z + Math.sin(a) * r);
        // (head up the trunk climbing, head down coming down, flat to the bark)
        m.rotation.set(s.state === "down" ? Math.PI / 2 : -Math.PI / 2, -a + Math.PI / 2, 0, "YXZ");
      } else {
        const hop = s.state === "hop" || s.state === "flee" ? Math.abs(Math.sin(this.t * (s.state === "flee" ? 14 : 9))) * (s.state === "flee" ? 0.12 : 0.08) : 0;
        m.position.set(s.x, gy + hop, s.z);
        m.rotation.set(s.state === "sit" ? -0.6 : 0, s.yaw, 0, "YXZ");
      }
      // (the tail: up and curled sitting, streaming out behind running)
      m.userData.tail.rotation.x = s.state === "sit" ? 0.2 + Math.sin(this.t * 3 + s.yaw) * 0.08 : -0.5;
    }
  }
}

// Butterflies: over the clearing's flowers on a fine day in spring and summer, a handful of them, fluttering in
// their jinking way from flower to flower and resting a moment, wings up, on one
const BUTTER = [0xf0f0e8, 0xe8c840, 0xd06a28, 0x6a8ac8];
export class Butterflies {
  constructor(w) {
    this.w = w; this.list = [];
    const wing = new THREE.PlaneGeometry(0.05, 0.045); wing.translate(0.025, 0, 0);
    this.geo = wing;
  }
  make(col) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 });
    const L = new THREE.Mesh(this.geo, m), R = new THREE.Mesh(this.geo, m); R.scale.x = -1;
    L.rotation.x = R.rotation.x = -Math.PI / 2;
    const wl = new THREE.Group(), wr = new THREE.Group(); wl.add(L); wr.add(R); g.add(wl, wr);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.035, 4), new THREE.MeshStandardMaterial({ color: 0x2a2018 })); body.rotation.x = Math.PI / 2; g.add(body);
    g.userData.wl = wl; g.userData.wr = wr;
    this.w.root.add(g);
    return g;
  }
  update(dt) {
    const T = G.town, p = G.player && G.player.pos; if (!T || !p) return;
    const fine = (T.season === "spring" || T.season === "summer") && T.frac > 0.1 && T.frac < 0.62 && (this.w.rainK || 0) < 0.05 && (G.cloud || 0) < 0.6;
    const near = Math.hypot(p.x - CLEARING.x, p.z - CLEARING.z) < CLEARING.r + 25;
    if (fine && near && this.list.length < 7 && Math.random() < dt) {
      const a = Math.random() * 6.28, r = 4 + Math.random() * 12, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + 4) this.list.push({ m: this.make(BUTTER[Math.floor(Math.random() * BUTTER.length)]), x, z, y: 0.6, h: Math.random() * 6.28, t: 0, rest: 0, ph: Math.random() * 6 });
    }
    for (const b of this.list.slice()) {
      b.t += dt;
      if (!fine || !near || Math.hypot(b.x - p.x, b.z - p.z) > 40) { this.w.root.remove(b.m); this.list.splice(this.list.indexOf(b), 1); continue; }
      const gy = this.w.heightAt(b.x, b.z);
      let flap;
      if (b.rest > 0) { b.rest -= dt; b.y += (0.32 - b.y) * Math.min(1, dt * 4); flap = 0.15 + Math.sin(b.t * 2) * 0.1; }
      else {
        // (the jinking flight: the heading wandering, up and down in little lifts, now and then down to rest)
        b.h += (Math.sin(b.t * 2.3 + b.ph) * 2.5 + (Math.random() - 0.5) * 6) * dt;
        b.x += Math.sin(b.h) * 1.1 * dt; b.z += Math.cos(b.h) * 1.1 * dt;
        b.y += ((0.6 + Math.sin(b.t * 3.1 + b.ph) * 0.35) - b.y) * Math.min(1, dt * 3);
        if (Math.random() < dt * 0.15) b.rest = 2 + Math.random() * 3;
        flap = Math.sin(b.t * 28 + b.ph);
        // (drifting back if it strays out of the clearing)
        if (Math.hypot(b.x - CLEARING.x, b.z - CLEARING.z) > CLEARING.r + 4) b.h = Math.atan2(CLEARING.x - b.x, CLEARING.z - b.z);
      }
      const m = b.m; m.position.set(b.x, gy + b.y, b.z); m.rotation.y = b.h;
      const a = b.rest > 0 ? 1.2 : 0.2 + flap * 1.1;
      m.userData.wl.rotation.z = a; m.userData.wr.rotation.z = -a;
    }
  }
}

// Fireflies: on a still summer night, a scatter of little greenish lights drifting low over the grass round you,
// each glowing up and fading in its own slow rhythm. None in rain or wind, or out of summer.
const FF = 48;
export class Fireflies {
  constructor(w) {
    this.w = w; this.t = 0; this.k = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(FF * 3); this.ph = new Float32Array(FF);
    this.fl = [];
    for (let i = 0; i < FF; i++) { this.ph[i] = Math.random() * 40; this.fl.push({ x: 0, z: 0, y: 0.6, h: Math.random() * 6.28, rate: 0.5 + Math.random() * 0.6, ok: false }); }
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("aPh", new THREE.BufferAttribute(this.ph, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0 }, uPx: { value: 1 } },
      vertexShader: `attribute float aPh; uniform float uT, uPx; varying float vB;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // (each one's glow: a slow swell and fade, then dark a while)
          float c = fract(uT * (0.18 + fract(aPh * 0.37) * 0.1) + aPh);
          vB = smoothstep(0.0, 0.1, c) * (1.0 - smoothstep(0.3, 0.55, c));
          gl_PointSize = clamp(110.0 / -mv.z, 4.0, 22.0) * (0.4 + vB) * uPx;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uK; varying float vB;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (exp(-d * d * 6.0) + exp(-d * d * 2.0) * 0.5) * vB * uK;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.9, 1.0, 0.45) * a * 3.5, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.visible = false;
    w.root.add(this.pts);
  }
  place(f, p) {
    const a = Math.random() * 6.28, r = 3 + Math.random() * 22;
    f.x = p.x + Math.cos(a) * r; f.z = p.z + Math.sin(a) * r; f.y = 0.3 + Math.random() * 1.3; f.ok = true;
  }
  update(dt) {
    const T = G.town, p = G.player && G.player.pos; if (!T || !p) return;
    this.t += dt;
    const f0 = T.frac, night = f0 > 0.7 || f0 < 0.03;
    const want = T.season === "summer" && night && (this.w.rainK || 0) < 0.05 && (G.windV ? Math.hypot(G.windV.x, G.windV.z) : 0) < 1.5 ? 1 : 0;
    this.k += (want - this.k) * Math.min(1, dt * 0.3);
    this.pts.visible = this.k > 0.01;
    if (!this.pts.visible) { for (const f of this.fl) f.ok = false; return; }
    for (let i = 0; i < FF; i++) {
      const f = this.fl[i];
      if (!f.ok || Math.hypot(f.x - p.x, f.z - p.z) > 28) this.place(f, p);
      // (a lazy, wandering drift: the heading turning slowly, rising and sinking a little)
      f.h += (Math.sin(this.t * 0.7 + i) * 0.8 + (Math.random() - 0.5) * 1.5) * dt;
      f.x += Math.sin(f.h) * 0.35 * f.rate * dt; f.z += Math.cos(f.h) * 0.35 * f.rate * dt;
      const gy = this.w.heightAt(f.x, f.z), y = gy + f.y + Math.sin(this.t * 0.6 * f.rate + i * 1.7) * 0.25;
      this.pos[i * 3] = f.x; this.pos[i * 3 + 1] = Math.max(gy + 0.15, y); this.pos[i * 3 + 2] = f.z;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.mat.uniforms.uT.value = this.t; this.mat.uniforms.uK.value = this.k; this.mat.uniforms.uPx.value = renderer.getPixelRatio();
  }
}
