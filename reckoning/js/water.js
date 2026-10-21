// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Water: a surface that holds the sky and the dark of what stands round it, stirred by the wind and pocked by the
// rain, with the sun's glint on it — the pond in the woods, and the Elbe at Hamburg. One material, its colours set
// every frame from the sky's own.

import { THREE, clamp } from "./core.js";
import { G } from "./engine.js";

// the waves: a few long swells running across the surface, each its own length, way and pace (a deep-water wave's
// pace from its length, as the sea's own are), summed — the surface lifted and dropped by them, its slope carried to
// the light; the same sum in JS below (waveAt), so a float or a duck rides them
const CHOP = "1.6";
const WAVES = [[0.96, 0.28, 1.0, 0.5], [-0.37, 0.93, 0.61, 0.28], [0.66, -0.75, 0.39, 0.15], [-0.98, -0.2, 0.24, 0.07], [0.2, 0.98, 0.15, 0.04]];
const WAVE_GLSL = `
  uniform float uAmp, uLen, uRoughOn; uniform sampler2D uRough; uniform vec4 uRoughBox;
  // how rough the sea is here (1 as it is; a sheltered bay less, the open ocean in the north far more): see setRough
  float roughAt(vec2 p) { return uRoughOn > 0.5 ? texture2D(uRough, (p - uRoughBox.xy) * uRoughBox.zw).r * 3.0 : 1.0; }
  // (each wave's water going round as it passes — Gerstner's waves: the crests drawn sharp and the troughs broad; how
  //  sharp, in proportion to the wave's own steepness, so a calm surface stays smooth. wOff: the sideways carry; wJ:
  //  how much the crests are pinched, for the shading)
  vec2 wOff; float wJ;
  vec3 waves(vec2 p, float t) {
    float h = 0.0; vec2 s = vec2(0.0); wOff = vec2(0.0); wJ = 0.0;
    ${WAVES.map(([dx, dz, l, a]) => `{ float L = ${l.toFixed(3)} * uLen, k = 6.2832 / L, w = sqrt(9.8 * k), ph = k * dot(vec2(${dx}, ${dz}), p) - w * t, A = ${a.toFixed(3)} * uAmp, Q = min(${CHOP}, 0.85 / (${WAVES.length}.0 * k * A + 1e-4));
      float c = cos(ph), sn = sin(ph); h += A * sn; s += A * k * vec2(${dx}, ${dz}) * c; wOff += Q * A * vec2(${dx}, ${dz}) * c; wJ += Q * k * A * sn; }`).join("\n    ")}
    return vec3(h, s);
  }`;
const vtx = `
  uniform float uT;
  varying vec3 vW; varying vec2 vUv; varying vec3 vWave; varying float vR; varying vec2 vX;
  ${WAVE_GLSL}
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWave = vec3(0.0); vR = 1.0; vX = wp.xz;
    if (uAmp > 0.0) { vR = roughAt(wp.xz); vWave = waves(wp.xz, uT) * vR; wp.y += vWave.x; wp.xz += wOff * vR; }
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const frag = `
  uniform float uT, uWind, uRain, uIce, uSwell;
  uniform vec3 uDeep, uZenith, uHorizon, uSunDir, uSunCol, uTrees; uniform float uFlow;
  varying vec3 vW; varying vec2 vUv; varying vec3 vWave; varying float vR; varying vec2 vX;
  ${WAVE_GLSL}
  float wHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vW.xz;
    // the surface: the wind's ripples — two sizes of them drifting down the wind, irregular as the real ones are, gone
    //  into a smooth sheen in the distance — and rings where the rain falls
    float dist = length(cameraPosition - vW);
    float w = (0.025 + uWind * 0.06) * uSwell * 1.6;
    vec2 wd = normalize(vec2(0.96, 0.28)), q1 = p * 0.85 + wd * uT * 0.45, q2 = p * 2.6 + wd * uT * 0.9 + vec2(13.1, 7.7);
    float e = 0.15, n1 = wNoise(q1), n2 = wNoise(q2);
    vec2 g = (vec2(wNoise(q1 + vec2(e, 0.0)) - n1, wNoise(q1 + vec2(0.0, e)) - n1) / e * (1.0 - smoothstep(25.0, 140.0, dist))
           + vec2(wNoise(q2 + vec2(e, 0.0)) - n2, wNoise(q2 + vec2(0.0, e)) - n2) / e * 0.45 * (1.0 - smoothstep(8.0, 45.0, dist))) * w;
    g += vec2(sin(p.x * 9.0 + p.y * 4.0 + uT * 5.0), cos(p.y * 8.0 - p.x * 5.0 + uT * 4.3)) * uRain * 0.035;
    // (running water: ripples carried downstream, v along the stream, u across it)
    float fl = 0.0;
    if (uFlow > 0.0) {
      float ph = vUv.y * 2.2 - uT * 1.6 * uFlow + sin(vUv.x * 7.0 + vUv.y * 0.9) * 0.8;
      g += vec2(sin(ph * 3.1) * 0.05, cos(ph * 2.3 + vUv.x * 5.0) * 0.05);
      fl = smoothstep(0.82, 1.0, sin(ph * 1.7 + vUv.x * 3.0) * 0.5 + 0.5) * (0.4 + 0.6 * abs(vUv.x - 0.5) * 2.0);
    }
    // (the swells' own slope under the ripples, reckoned here and not only at the mesh's corners: every crest crisp)
    float crestJ = 0.0;
    if (uAmp > 0.0) { vec3 wv = waves(vX, uT) * vR; g += wv.yz; crestJ = wJ * vR; }
    vec3 n = normalize(vec3(-g.x, max(0.25, 1.0 - crestJ), -g.y));
    if (uIce > 0.5) n = normalize(vec3(-g.x * 0.05, 1.0, -g.y * 0.05));
    vec3 v = normalize(cameraPosition - vW);
    // (what it reflects: the sky, paler toward the horizon; and how much, more at a glancing look)
    vec3 r = reflect(-v, n);
    vec3 sky = mix(uHorizon, uZenith, clamp(r.y * 1.4, 0.0, 1.0));
    // (low down, what it holds is the trees standing round it: dark, a little green, going up into the sky)
    sky = mix(uTrees, sky, smoothstep(0.32, 0.75, r.y));
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    // (the water's own body: on a sea with waves, light coming through the thin tops of them, greenish)
    vec3 deep = uDeep;
    if (uAmp > 0.0) { float sss = pow(clamp(dot(v, -normalize(uSunDir + n * 0.6)), 0.0, 1.0), 3.0) * clamp(vWave.x / (uAmp * vR + 1e-3) * 0.5 + 0.4, 0.0, 1.0); deep += vec3(0.02, 0.09, 0.07) * sss * length(uSunCol); }
    vec3 col = mix(deep, sky, clamp(fres * 0.9 + 0.02, 0.0, 1.0));
    // the sun's glint: a hard spark on each ripple near you, spread to a glitter further off (not one round blob)
    vec3 hv = normalize(uSunDir + v); float nh = max(dot(n, hv), 0.0), rough = mix(1400.0, 160.0, smoothstep(5.0, 160.0, dist));
    col += uSunCol * (pow(nh, rough) * 2.6 + pow(nh, rough * 0.06) * 0.05) * (0.3 + 0.7 * fres * 4.0);
    // ice: pale, grey and still
    if (uIce > 0.5) col = mix(vec3(0.62, 0.68, 0.74) * (0.5 + 0.5 * length(uHorizon)), sky, fres * 0.5);
    col += vec3(0.5, 0.55, 0.58) * fl * 0.12 * (0.3 + 0.7 * length(uHorizon));
    // white water on the crests of the bigger waves, broken up, lit as the day is
    if (uAmp * vR > 0.15 && uIce < 0.5) {
      float crest = vWave.x / (uAmp * vR) * 0.6 + crestJ * 0.9, br = wNoise(p * 0.9 + vec2(uT * 0.25, -uT * 0.18)) * 0.65 + wNoise(p * 3.1 - vec2(uT * 0.4, uT * 0.3)) * 0.35;
      float foam = smoothstep(0.5, 0.85, crest + (br - 0.5) * 0.55) * smoothstep(0.35, 0.65, br) * (0.35 + 0.65 * uWind) * clamp(0.5 + (vR - 1.0) * 0.6, 0.3, 1.4);
      col = mix(col, vec3(0.86, 0.9, 0.92) * (0.35 + 0.65 * length(uHorizon) / 1.5), foam * 0.6);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;


export class WaterMat {
  // deep: the water's own colour, looked straight down into; round: what stands round it, reflected low down
  constructor({ deep = [0.028, 0.042, 0.03], round = [0.045, 0.07, 0.04], swell = 1, flow = 0, amp = 0, len = 1 } = {}) {
    this.deep = deep; this.round = round; this.amp = amp; this.len = len;
    this.uni = {
      uT: { value: 0 }, uWind: { value: 0.2 }, uRain: { value: 0 }, uIce: { value: 0 }, uSwell: { value: swell }, uFlow: { value: flow }, uAmp: { value: amp }, uLen: { value: len },
      uRoughOn: { value: 0 }, uRough: { value: null }, uRoughBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      uDeep: { value: new THREE.Color() }, uZenith: { value: new THREE.Color(0x5a88c0) }, uHorizon: { value: new THREE.Color(0xc9d6e0) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uTrees: { value: new THREE.Color() },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: vtx, fragmentShader: frag, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), fog: true });
    Object.assign(this.mat.uniforms, this.uni);
    this.t = 0;
  }
  // how rough the sea is, place by place: a grid (n × n, 0..3) over the square from (x0, z0), size across
  setRough(data, n, x0, z0, size) {
    const b = new Uint8Array(n * n); for (let i = 0; i < n * n; i++) b[i] = Math.max(0, Math.min(255, Math.round(data[i] / 3 * 255)));
    const t = new THREE.DataTexture(b, n, n, THREE.RedFormat, THREE.UnsignedByteType); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    this.rough = { data, n, x0, z0, size };
    this.uni.uRough.value = t; this.uni.uRoughBox.value.set(x0, z0, 1 / size, 1 / size); this.uni.uRoughOn.value = 1;
  }
  roughAt(x, z) {
    const r = this.rough; if (!r) return 1;
    const fx = Math.max(0, Math.min(r.n - 1.001, (x - r.x0) / r.size * r.n - 0.5)), fz = Math.max(0, Math.min(r.n - 1.001, (z - r.z0) / r.size * r.n - 0.5));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, d = r.data, n = r.n;
    return (d[j * n + i] * (1 - u) + d[j * n + i + 1] * u) * (1 - v) + (d[(j + 1) * n + i] * (1 - u) + d[(j + 1) * n + i + 1] * u) * v;
  }
  update(dt, { rain = 0, ice = false } = {}) {
    const u = this.uni;
    this.t += dt; u.uT.value = this.t;
    const sky = G.sky && G.sky.material.uniforms;
    if (sky) { u.uZenith.value.copy(sky.top.value).lerp(sky.mid.value, 0.35); u.uHorizon.value.copy(G.scene.fog.color); }
    if (G.sunDir) u.uSunDir.value.copy(G.sunDir);
    if (G.sun) u.uSunCol.value.copy(G.sun.color).multiplyScalar(Math.min(1.2, G.sun.intensity / 2));
    const lit = 0.3 + 0.7 * clamp(G.sun ? G.sun.intensity / 2.4 : 1, 0, 1);
    u.uDeep.value.setRGB(...this.deep).multiplyScalar(lit);
    u.uTrees.value.setRGB(...this.round).multiplyScalar(lit).lerp(G.scene.fog.color, 0.15);
    u.uWind.value = G.windV ? clamp(Math.hypot(G.windV.x, G.windV.z) / 2, 0, 1) : 0.2;
    u.uRain.value = rain; u.uIce.value = ice ? 1 : 0;
    // (the swell rises with the wind, and a frozen surface is still)
    u.uAmp.value = ice ? 0 : this.amp * (0.6 + 0.8 * u.uWind.value + rain * 0.4);
  }
}

// how high the water stands at x, z now, on one water's waves (the shader's own sum): for a float, a duck, a boat
export function waveAt(wm, x, z) {
  const u = wm.uni, A = u.uAmp.value, t = u.uT.value; if (!A) return 0;
  const R = wm.roughAt(x, z), Ch = +CHOP, W = WAVES.map(([dx, dz, l, a]) => { const L = l * u.uLen.value, k = 6.2832 / L, Am = a * A; return { dx, dz, k, w: Math.sqrt(9.8 * k), Am, Q: Math.min(Ch, 0.85 / (WAVES.length * k * Am + 1e-4)) }; });
  // (the water over x, z came from a little upwind of it: that point found first, then its height)
  let px = x, pz = z;
  for (let it = 0; it < 3; it++) { let ox = 0, oz = 0; for (const v of W) { const c = Math.cos(v.k * (v.dx * px + v.dz * pz) - v.w * t) * v.Q * v.Am * R; ox += v.dx * c; oz += v.dz * c; } px = x - ox; pz = z - oz; }
  let h = 0; for (const v of W) h += v.Am * Math.sin(v.k * (v.dx * px + v.dz * pz) - v.w * t);
  return h * R;
}
