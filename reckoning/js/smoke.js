// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Smoke from the chimneys: every hearth and every furnace in the town, one soft
// puff after another rising, spreading and thinning as the wind takes it. All of
// it is one cloud of points, drawn at once, however many chimneys there are.

import { THREE } from "./core.js";

// where each model's chimney comes out, in the model's own frame: [x, top, z] (measured from the models)
export const CHIMNEY = {
  "cabin": [-1.2, 5.78, -3.3],
  "town/house_2": [1.25, 9.67, -1.5], "town/house_3": [-1.25, 13.07, -1.5], "town/house_4": [-1.25, 13.87, -1.5],
  "town/bakery_1": [-1.4, 5.73, -2.4], "town/bakery_2": [1.25, 9.67, -1.3], "town/bakery_3": [-1.25, 10.07, -1.3], "town/bakery_4": [-1.25, 10.77, -1.3],
  "town/forge_1": [-1.6, 5.91, -2.3], "town/forge_2": [1.35, 7.14, -1.25], "town/forge_3": [-1.35, 10.34, -1.25], "town/forge_4": [-1.35, 10.77, -1.25],
  "town/smelter_1": [-1.4, 5.73, -2.0], "town/smelter_2": [1.25, 6.87, -1.1], "town/smelter_3": [-1.25, 10.07, -1.1], "town/smelter_4": [-1.25, 7.67, -1.1],
  "town/brickworks_1": [4.5, 5.5, -1.2], "town/brickworks_2": [1.15, 6.6, -1.0], "town/brickworks_3": [-1.15, 6.8, -0.8], "town/brickworks_4": [-1.15, 7.67, -1.0],
  "town/hospital_1": [-2.4, 6.63, -2.5], "town/hospital_2": [1.75, 11.03, -1.35], "town/hospital_3": [-1.75, 11.43, -1.35], "town/hospital_4": [-1.75, 10.77, -1.35],
  "town/townhall_2": [2.25, 12.39, -1.75], "town/townhall_3": [-2.25, 15.79, -1.75], "town/townhall_4": [-2.25, 13.87, -1.75],
};
// a marker at the chimney's mouth, to hang on a model (its world position is where the smoke starts)
export function chimneyMark(key) {
  const c = CHIMNEY[key]; if (!c) return null;
  const o = new THREE.Object3D(); o.position.set(c[0], c[1] + 0.1, c[2]); o.name = "chimneyTop";
  return o;
}

const PER = 14;            // puffs in the air above each chimney at once
const MAX = 64;            // chimneys drawn at most (the nearest)
const LIFE = 9;            // seconds a puff lasts
const vtx = `
  attribute float aSize; attribute float aAlpha;
  varying float vAlpha; varying float vFog;
  uniform float uScale, uNear, uFar;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uScale / max(0.5, -mv.z), 400.0);
    // (thinned to nothing right in front of the eye, where a puff would fill the view)
    vAlpha = aAlpha * smoothstep(0.35, 1.3, -mv.z);
    vFog = smoothstep(uNear, uFar, -mv.z);
  }`;
const frag = `
  varying float vAlpha; varying float vFog;
  uniform vec3 uColor, uFogColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
    if (r > 1.0) discard;
    // a soft round puff, a little lumpy
    float a = (1.0 - r * r) * vAlpha * (0.85 + 0.15 * sin(d.x * 17.0 + d.y * 11.0));
    gl_FragColor = vec4(mix(uColor, uFogColor, vFog), a * (1.0 - vFog * 0.7));
  }`;

export class Smoke {
  constructor(root) {
    const n = PER * MAX;
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vtx, fragmentShader: frag, transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 }, uNear: { value: 30 }, uFar: { value: 200 }, uColor: { value: new THREE.Color(0x9a9a9a) }, uFogColor: { value: new THREE.Color(0xc9d6e0) } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 2;
    root.add(this.points);
    this.t = 0;
  }
  // sources: [{ x, y, z, k }] — where, and how thick (0 none, 1 a furnace going hard); wind: {x, z} in m/s
  update(dt, sources, wind, cam, light) {
    this.t += dt;
    const P = this.pos, S = this.size, A = this.alpha;
    // the nearest chimneys only, when there are a great many
    if (sources.length > MAX && cam) sources = sources.slice().sort((a, b) => (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2 - (b.x - cam.x) ** 2 - (b.z - cam.z) ** 2).slice(0, MAX);
    let i = 0;
    for (let s = 0; s < sources.length; s++) {
      const c = sources[s], seed = c.x * 0.37 + c.z * 0.71;
      for (let j = 0; j < PER; j++, i++) {
        // (each puff its own place in the cycle, so they come up one after another)
        const u = ((this.t / LIFE + j / PER + seed) % 1 + 1) % 1, age = u * LIFE;
        const rise = 1.6 * age / (1 + age * 0.18), drift = age * age * 0.06 + age * 0.35;
        const wob = Math.sin(seed * 13 + j * 2.1 + age * 0.9) * (0.15 + age * 0.12);
        P[i * 3] = c.x + (wind.x * drift) + wob; P[i * 3 + 1] = c.y + rise; P[i * 3 + 2] = c.z + (wind.z * drift) + Math.cos(seed * 7 + j * 1.3 + age * 0.8) * (0.1 + age * 0.1);
        S[i] = (0.45 + age * 0.55) * (0.7 + c.k * 0.5);
        A[i] = c.k * 0.55 * Math.min(1, u * 8) * (1 - u) ** 1.4;
      }
    }
    this.points.geometry.setDrawRange(0, i);
    this.points.visible = i > 0;
    for (const k of ["position", "aSize", "aAlpha"]) this.points.geometry.attributes[k].needsUpdate = true;
    // the smoke takes the light of the hour: pale by day, dark against the night, and lost in the mist
    if (light) { this.mat.uniforms.uColor.value.copy(light.color); this.mat.uniforms.uFogColor.value.copy(light.fog); this.mat.uniforms.uNear.value = light.near; this.mat.uniforms.uFar.value = light.far; }
  }
}

// Breath in the cold: a little white cloud in front of a face on every breath out, drifting forward and up and gone in
// a second or two. One pool of points for everyone.
const BN = 160, BLIFE = 1.7;
export class Breath {
  constructor(root) {
    this.pos = new Float32Array(BN * 3); this.size = new Float32Array(BN); this.alpha = new Float32Array(BN);
    this.vel = new Float32Array(BN * 3); this.age = new Float32Array(BN).fill(BLIFE); this.k = new Float32Array(BN);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vtx, fragmentShader: frag, transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 }, uNear: { value: 30 }, uFar: { value: 200 }, uColor: { value: new THREE.Color(0xe8ecf0) }, uFogColor: { value: new THREE.Color(0xc9d6e0) } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 3;
    root.add(this.points);
    this.next = 0;
  }
  // a breath out at (x, y, z), toward (dx, dz); k how much of it shows (the colder, the more)
  puff(x, y, z, dx, dz, k = 1) {
    for (let n = 0; n < 3; n++) {
      const i = this.next; this.next = (this.next + 1) % BN;
      this.pos[i * 3] = x + dx * 0.04 * n; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z + dz * 0.04 * n;
      const sp = 0.55 + Math.random() * 0.25 - n * 0.12;
      this.vel[i * 3] = dx * sp + (Math.random() - 0.5) * 0.1; this.vel[i * 3 + 1] = -0.05 + Math.random() * 0.08; this.vel[i * 3 + 2] = dz * sp + (Math.random() - 0.5) * 0.1;
      this.age[i] = -n * 0.06; this.k[i] = k;
    }
  }
  update(dt, light) {
    let any = false;
    for (let i = 0; i < BN; i++) {
      const a = (this.age[i] += dt);
      if (a >= BLIFE || a < 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      any = true;
      const drag = Math.pow(0.18, dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.12 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const u = a / BLIFE;
      this.size[i] = 0.07 + u * 0.4;
      this.alpha[i] = this.k[i] * 0.32 * Math.min(1, u * 10) * (1 - u) ** 1.6;
    }
    this.points.visible = any;
    if (!any) return;
    for (const k of ["position", "aSize", "aAlpha"]) this.points.geometry.attributes[k].needsUpdate = true;
    if (light) { this.mat.uniforms.uColor.value.copy(light.color); this.mat.uniforms.uFogColor.value.copy(light.fog); this.mat.uniforms.uNear.value = light.near; this.mat.uniforms.uFar.value = light.far; this.mat.uniforms.uScale.value = light.scale; }
  }
}
