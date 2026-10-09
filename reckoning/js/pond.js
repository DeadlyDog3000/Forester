// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The pond at the edge of the deer ride: still brown-green water holding the sky,
// stirred by the wind and pocked by the rain, a fringe of rushes round it, lily
// pads, and a pair of ducks paddling about that make off when you come close.
// It freezes over in winter.

import { THREE, clamp } from "./core.js";
import { G } from "./engine.js";
import { POND, pondR, pondK } from "./woods.js";
import { addSway, swayGeo } from "./models.js";

const vtx = `
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const frag = `
  uniform float uT, uWind, uRain, uIce;
  uniform vec3 uDeep, uZenith, uHorizon, uSunDir, uSunCol, uTrees;
  varying vec3 vW;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vW.xz;
    // the surface: slow swells, a finer cat's-paw where the wind catches it, and rings where the rain falls
    float w = 0.012 + uWind * 0.03;
    vec2 g = vec2(sin(p.x * 1.3 + uT * 0.9) + 0.6 * sin(p.x * 3.1 - p.y * 1.7 + uT * 1.7), cos(p.y * 1.5 - uT * 0.8) + 0.6 * cos(p.y * 2.9 + p.x * 2.3 - uT * 1.9)) * w;
    g += vec2(sin(p.x * 9.0 + p.y * 4.0 + uT * 5.0), cos(p.y * 8.0 - p.x * 5.0 + uT * 4.3)) * uRain * 0.035;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    if (uIce > 0.5) n = normalize(vec3(-g.x * 0.05, 1.0, -g.y * 0.05));
    vec3 v = normalize(cameraPosition - vW);
    // (what it reflects: the sky, paler toward the horizon; and how much, more at a glancing look)
    vec3 r = reflect(-v, n);
    vec3 sky = mix(uHorizon, uZenith, clamp(r.y * 1.4, 0.0, 1.0));
    // (low down, what it holds is the trees standing round it: dark, a little green, going up into the sky)
    sky = mix(uTrees, sky, smoothstep(0.32, 0.75, r.y));
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
    vec3 col = mix(uDeep, sky, clamp(fres * 0.85 + 0.03, 0.0, 1.0));
    // the sun's glint
    col += uSunCol * pow(max(dot(r, uSunDir), 0.0), 160.0) * 1.6;
    // ice: pale, grey and still
    if (uIce > 0.5) col = mix(vec3(0.62, 0.68, 0.74) * (0.5 + 0.5 * length(uHorizon)), sky, fres * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class Pond {
  constructor(w) {
    this.w = w; this.t = 0;
    const L = w.pondLevel, g = new THREE.Group();
    // ---- the water: the shore's shape, a little past it, so the bank always comes down into it ----
    const N = 64, pos = [0, 0, 0], idx = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, r = pondR(a) * 1.12; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); idx.push(0, 1 + ((i + 1) % N), 1 + i); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    this.uni = {
      uT: { value: 0 }, uWind: { value: 0.2 }, uRain: { value: 0 }, uIce: { value: 0 },
      uDeep: { value: new THREE.Color(0x1c2a1e) }, uZenith: { value: new THREE.Color(0x5a88c0) }, uHorizon: { value: new THREE.Color(0xc9d6e0) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uTrees: { value: new THREE.Color(0x1e2a1c) },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: vtx, fragmentShader: frag, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), fog: true });
    Object.assign(this.mat.uniforms, this.uni);
    this.water = new THREE.Mesh(geo, this.mat);
    this.water.position.set(POND.x, L, POND.z); this.water.receiveShadow = false;
    g.add(this.water);
    // ---- rushes round the margin, standing in the shallows and up the bank ----
    const rush = rushGeo(), RN = 140, rm = new THREE.InstancedMesh(swayGeo(rush, RN), addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), RN);
    const d = new THREE.Object3D(), c = new THREE.Color(), sw = rm.geometry.attributes.aSway.array;
    let n = 0;
    for (let i = 0; n < RN && i < RN * 3; i++) {
      const a = Math.random() * Math.PI * 2, k = 0.86 + Math.random() * 0.24;
      // (in clumps: a few gaps round the shore where the deer come down)
      if (Math.sin(a * 3 + 0.7) > 0.75) continue;
      const r = pondR(a) * k, x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r, y = Math.max(w.heightAt(x, z), L - 0.3);
      const s = 0.8 + Math.random() * 0.6;
      d.position.set(x, y, z); d.rotation.set(0, Math.random() * 6.28, 0); d.scale.set(s, s * (0.8 + Math.random() * 0.5), s); d.updateMatrix();
      rm.setMatrixAt(n, d.matrix); rm.setColorAt(n, c.setScalar(0.85 + Math.random() * 0.3));
      sw[n * 3] = y; sw[n * 3 + 1] = 1.4 * s; sw[n * 3 + 2] = a * 3.1;
      n++;
    }
    rm.count = n; rm.receiveShadow = true; rm.castShadow = false;
    g.add(rm); this.rushes = rm;
    // ---- lily pads: flat round leaves with a notch, lying on the water, and a few white flowers ----
    const pad = new THREE.CircleGeometry(0.28, 12, 0.25, Math.PI * 2 - 0.5); pad.rotateX(-Math.PI / 2);
    const PN = 26, pm = new THREE.InstancedMesh(pad, new THREE.MeshStandardMaterial({ color: 0x3e6a2a, roughness: 0.55, side: THREE.DoubleSide }), PN);
    this.pads = [];
    for (let i = 0; i < PN; i++) {
      let x, z, tries = 0;
      do { const a = Math.random() * Math.PI * 2, r = pondR(a) * (0.35 + Math.random() * 0.5); x = POND.x + Math.cos(a) * r; z = POND.z + Math.sin(a) * r; } while (tries++ < 10 && this.pads.some(p => Math.hypot(p.x - x, p.z - z) < 0.6));
      const s = 0.6 + Math.random() * 0.7, ry = Math.random() * 6.28;
      this.pads.push({ x, z, s, ry, ph: Math.random() * 6.28 });
      d.position.set(x, L + 0.01, z); d.rotation.set(0, ry, 0); d.scale.setScalar(s); d.updateMatrix(); pm.setMatrixAt(i, d.matrix);
    }
    pm.receiveShadow = true; g.add(pm); this.padMesh = pm;
    const fl = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const p = this.pads[i * 4]; if (!p) break;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.07, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6, side: THREE.DoubleSide }));
      f.rotation.x = Math.PI; f.position.set(p.x + 0.05, L + 0.05, p.z); fl.add(f);
      const y = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshStandardMaterial({ color: 0xe8c040 })); y.position.set(p.x + 0.05, L + 0.06, p.z); fl.add(y);
    }
    g.add(fl); this.flowers = fl;
    // ---- a pair of mallards ----
    this.ducks = [makeDuck(true), makeDuck(false)].map((m, i) => { g.add(m); const a = i * 2 + 1; return { m, x: POND.x + Math.cos(a) * 3, z: POND.z + Math.sin(a) * 3, yaw: a, sp: 0, t: Math.random() * 5, flee: 0 }; });
    w.root.add(g); this.g = g;
    // (you can wade the margin, but not out into the middle, where it's over your head)
    const rr = Math.min(...Array.from({ length: 24 }, (_, i) => pondR(i / 24 * Math.PI * 2)));
    w.col.addCircle(POND.x, POND.z, rr * 0.62, L + 3);
  }
  // is x, z in the water, and how deep
  depthAt(x, z) { return pondK(x, z) < 1 ? Math.max(0, this.w.pondLevel - this.w.heightAt(x, z)) : 0; }
  update(dt) {
    this.t += dt;
    const u = this.uni, w = this.w, town = G.town;
    u.uT.value = this.t;
    // the sky it holds: the dome's own colours, and the sun's
    const sky = G.sky && G.sky.material.uniforms;
    if (sky) { u.uZenith.value.copy(sky.top.value).lerp(sky.mid.value, 0.35); u.uHorizon.value.copy(G.scene.fog.color); }
    if (G.sunDir) u.uSunDir.value.copy(G.sunDir);
    if (G.sun) u.uSunCol.value.copy(G.sun.color).multiplyScalar(Math.min(1.2, G.sun.intensity / 2));
    const lit = 0.3 + 0.7 * clamp(G.sun ? G.sun.intensity / 2.4 : 1, 0, 1);
    u.uDeep.value.setRGB(0.028, 0.042, 0.03).multiplyScalar(lit);
    // (the trees round it, as dark as the woods look at this hour, hazed toward the fog)
    u.uTrees.value.setRGB(0.045, 0.07, 0.04).multiplyScalar(lit).lerp(G.scene.fog.color, 0.15);
    u.uWind.value = G.windV ? clamp(Math.hypot(G.windV.x, G.windV.z) / 2, 0, 1) : 0.2;
    u.uRain.value = w.rainK || 0;
    const ice = town && town.winter && (w.snowK || 0) > 0.5;
    u.uIce.value = ice ? 1 : 0;
    this.padMesh.visible = this.flowers.visible = !ice;
    if (town) this.flowers.visible = !ice && (town.season === "summer");
    // ---- the ducks: paddling about, dabbling now and then, and off to the far side if you come near ----
    const p = G.player && G.player.pos, L = w.pondLevel;
    for (const [i, dk] of this.ducks.entries()) {
      dk.m.visible = !ice && !(town && town.isNight && town.isNight());
      if (!dk.m.visible) continue;
      dk.t -= dt;
      const pd = p ? Math.hypot(p.x - dk.x, p.z - dk.z) : 99;
      if (pd < 7) { dk.flee = 3; const a = Math.atan2(dk.z - p.z, dk.x - p.x); dk.want = { x: POND.x + Math.cos(a) * pondR(a) * 0.7, z: POND.z + Math.sin(a) * pondR(a) * 0.7 }; dk.t = 4; }
      if (dk.t <= 0 || !dk.want) {
        // (the drake keeps near the duck)
        const other = this.ducks[1 - i], a = Math.random() * Math.PI * 2, r = pondR(a) * Math.random() * 0.7;
        dk.want = i === 0 && Math.random() < 0.6 ? { x: other.x + Math.cos(a) * 1.2, z: other.z + Math.sin(a) * 1.2 } : { x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r };
        dk.t = 5 + Math.random() * 8; dk.dabble = Math.random() < 0.4 ? 2 : 0;
      }
      dk.flee = Math.max(0, dk.flee - dt);
      const dx = dk.want.x - dk.x, dz = dk.want.z - dk.z, dd = Math.hypot(dx, dz);
      const want = dd > 0.3 ? (dk.flee ? 1.1 : 0.35) : 0;
      dk.sp += (want - dk.sp) * Math.min(1, dt * 1.5);
      if (dd > 0.05) { const ty = Math.atan2(dx, dz); let dy = ty - dk.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); dk.yaw += clamp(dy, -2 * dt, 2 * dt); }
      const nx = dk.x + Math.sin(dk.yaw) * dk.sp * dt, nz = dk.z + Math.cos(dk.yaw) * dk.sp * dt;
      if (pondK(nx, nz) < 0.85) { dk.x = nx; dk.z = nz; } else dk.t = 0;
      // (dabbling: tail up, head under, for a moment)
      if (dk.dabble > 0 && dk.sp < 0.1) dk.dabble -= dt;
      const up = dk.dabble > 0 && dk.sp < 0.1 && Math.sin(dk.dabble * 2.5) > 0;
      dk.m.position.set(dk.x, L + 0.02 + Math.sin(this.t * 2 + i) * 0.008, dk.z);
      dk.m.rotation.set(up ? 1.1 : Math.sin(this.t * 1.7 + i) * 0.04, dk.yaw, 0);
    }
  }
}
// a rush clump: stiff dark green blades, the tallest with a brown seed head
function rushGeo() {
  const P = [], C = [], I = [];
  for (let b = 0; b < 9; b++) {
    const a = b / 9 * Math.PI * 2 + b, lean = 0.04 + (b % 3) * 0.05, h = 0.8 + (b % 4) * 0.25, dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.012, pz = dx * 0.012, i0 = P.length / 3;
    P.push(-px, 0, -pz, px, 0, pz, dx * lean, h, dz * lean);
    C.push(0.07, 0.12, 0.04, 0.07, 0.12, 0.04, 0.17, 0.24, 0.08);
    I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 1);
    if (b % 3 === 0) {
      const j0 = P.length / 3, hx = dx * lean, hz = dz * lean;
      P.push(hx - 0.025, h - 0.15, hz, hx + 0.025, h - 0.15, hz, hx, h + 0.02, hz, hx, h - 0.15, hz + 0.025);
      for (let k = 0; k < 4; k++) C.push(0.16, 0.08, 0.035);
      I.push(j0, j0 + 1, j0 + 2, j0 + 1, j0 + 3, j0 + 2, j0 + 3, j0, j0 + 2, j0, j0 + 2, j0 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I); g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
// a mallard on the water: the drake with his green head and white collar, the duck all mottled brown
function makeDuck(drake) {
  const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M(drake ? 0x8a8478 : 0x7a5e40)); body.scale.set(0.8, 0.55, 1.25); body.position.y = 0.04; g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), M(drake ? 0x2a2a2a : 0x6a5038)); tail.rotation.x = -1.9; tail.position.set(0, 0.08, -0.2); g.add(tail);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 6), M(drake ? 0x1e5a32 : 0x7a5e40)); neck.position.set(0, 0.14, 0.12); neck.rotation.x = 0.3; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M(drake ? 0x1a5a2e : 0x6e5438)); head.scale.set(0.85, 0.9, 1.15); head.position.set(0, 0.21, 0.15); g.add(head);
  const bill = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.07), M(drake ? 0xd8c040 : 0xc87a30)); bill.position.set(0, 0.2, 0.22); g.add(bill);
  if (drake) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), M(0xf0f0f0)); ring.rotation.x = Math.PI / 2 - 0.3; ring.position.set(0, 0.105, 0.105); g.add(ring); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
