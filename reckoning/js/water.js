// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Water: a surface that holds the sky and the dark of what stands round it, stirred by the wind and pocked by the
// rain, with the sun's glint on it — the pond in the woods, and the Elbe at Hamburg. One material, its colours set
// every frame from the sky's own.

import { THREE, clamp } from "./core.js";
import { G } from "./engine.js";

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
  uniform float uT, uWind, uRain, uIce, uSwell;
  uniform vec3 uDeep, uZenith, uHorizon, uSunDir, uSunCol, uTrees;
  varying vec3 vW;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vW.xz;
    // the surface: slow swells, a finer cat's-paw where the wind catches it, and rings where the rain falls
    float w = (0.012 + uWind * 0.03) * uSwell;
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


export class WaterMat {
  // deep: the water's own colour, looked straight down into; round: what stands round it, reflected low down
  constructor({ deep = [0.028, 0.042, 0.03], round = [0.045, 0.07, 0.04], swell = 1 } = {}) {
    this.deep = deep; this.round = round;
    this.uni = {
      uT: { value: 0 }, uWind: { value: 0.2 }, uRain: { value: 0 }, uIce: { value: 0 }, uSwell: { value: swell },
      uDeep: { value: new THREE.Color() }, uZenith: { value: new THREE.Color(0x5a88c0) }, uHorizon: { value: new THREE.Color(0xc9d6e0) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uTrees: { value: new THREE.Color() },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: vtx, fragmentShader: frag, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), fog: true });
    Object.assign(this.mat.uniforms, this.uni);
    this.t = 0;
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
  }
}
