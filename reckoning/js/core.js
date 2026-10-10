// ===========================================================================
//  FORESTER: RECKONING
//  Copyright (c) 2026 Roan Fraese, trading as DeadlyDog Productions.
//  All rights reserved. See reckoning/LICENSE.
// ===========================================================================

// The pieces every other file leans on: the renderer, the materials, a way of
// building a whole street as one mesh instead of four hundred, and the
// collision the player and the watchmen walk into.

import * as THREE from "three";
export { THREE };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;

// Seeded, so a street is the same street every time the game is opened.
export function rng(seed) {
  let s = seed >>> 0;
  const r = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  return r;
}

// Shortest signed difference between two angles.
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// ---------------------------------------------------------------------------
//  renderer
// ---------------------------------------------------------------------------
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 900);
camera.rotation.order = "YXZ";

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------------------
//  surface detail: every material gets grain, mottling and wear from a noise
//  in world space, so a painted box reads as timber, plaster or stone rather
//  than as flat colour.
// ---------------------------------------------------------------------------
const DETAIL_GLSL = `
  float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float dNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float dFbm(vec3 p) { return dNoise(p) * 0.5 + dNoise(p * 2.03) * 0.28 + dNoise(p * 4.1) * 0.14 + dNoise(p * 8.3) * 0.08; }
`;
// Real surfaces: photographs of wood, plaster, stone, brick, bark, cloth,
// needles and roof tiles, reduced to their grain (tools/make_textures.py) and
// packed three to an image. Each surface picks one — named, or, for the
// vertex-coloured town, judged from its colour and slope — and it is laid
// on in world space from three sides, so nothing needs texture coordinates.
const texLoader = new THREE.TextureLoader();
const detailTex = ["a", "b", "c"].map(k => {
  const t = texLoader.load(`art/tex/detail_${k}.png`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
});
export const SURFACE = { auto: -1, none: -2, wood: 0, plaster: 1, stone: 2, brick: 3, bark: 4, cloth: 5, needles: 6, tiles: 7 };
export function groundTexture(name, repeat) {
  const t = texLoader.load(`art/tex/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}
const SURF_GLSL = `
  uniform sampler2D dTexA, dTexB, dTexC;
  // the grain of surface s at world point p, seen from the three axes and blended by the normal
  float dTri(sampler2D t, int ch, vec3 p, vec3 w) {
    vec4 a = texture2D(t, p.zy), b = texture2D(t, p.xz), c = texture2D(t, p.xy);
    return dot(vec3(a[ch], b[ch], c[ch]), w);
  }
  float dSurf(int s, vec3 p, vec3 w) {
    if (s == 0) return dTri(dTexA, 0, p * 0.9, w);
    if (s == 1) return dTri(dTexA, 1, p * 0.55, w) * 0.55 + dTri(dTexA, 1, p * 0.21 + vec3(0.37, 0.61, 0.13), w) * 0.45;   // (two scales, so the trowel marks don't repeat)
    if (s == 2) return dTri(dTexA, 2, p * 0.7, w);
    if (s == 3) return dTri(dTexB, 0, p * 0.9, w);
    if (s == 4) return dTri(dTexB, 1, p * 1.1, w);
    if (s == 5) return dTri(dTexB, 2, p * 3.0, w);
    if (s == 6) return dTri(dTexC, 0, p * 0.8, w);
    return dTri(dTexC, 1, p * 0.6, w);
  }
  // for the town, painted in vertex colours: what is it made of, judged by its colour and its slope
  int dClassify(vec3 lin, vec3 n) {
    vec3 c = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));                          // judge colour as the eye sees it
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 1e-3), lum = dot(c, vec3(0.3, 0.59, 0.11));
    bool slope = abs(n.y) > 0.3 && abs(n.y) < 0.97;
    if (c.g > c.r * 1.03 && c.g > c.b * 1.04 && sat > 0.12) return 6;            // green: foliage
    if (lum > 0.5 && sat < 0.5) return 1;                                         // pale, warm or cool: plaster
    if (slope && lum < 0.5) return 7;                                             // a dark slope: a roof of tiles or slate
    if (c.r > c.g * 1.65 && sat > 0.45 && n.y > 0.97) return 5;                   // red and lying flat: a blanket, a cloth, not brick
    if (c.r > c.g * 1.65 && sat > 0.45) return 3;                                   // red, upright: brick
    if (sat < 0.15) return 2;                                                     // grey: stone
    return 0;                                                                     // browns and the rest: timber
  }
  // everywhere but the city's houses, only what can be told for certain by colour: grey is stone,
  // a warm brown is wood; the rest (cloth, paint, food, foliage) is left its own plain colour
  int dClassifySimple(vec3 lin) {
    vec3 c = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 1e-3), lum = dot(c, vec3(0.3, 0.59, 0.11));
    if (sat < 0.14 && lum > 0.2 && lum < 0.75) return 2;
    if (c.r >= c.g && c.g >= c.b * 0.95 && sat > 0.2 && sat < 0.75 && lum < 0.6 && lum > 0.08) return 0;
    return -2;
  }
`;
const SURF_STRENGTH = "float dStrength[8] = float[8](0.75, 0.3, 0.85, 0.8, 0.95, 0.55, 0.8, 0.85);";
// how deep each surface's grain stands out, in metres: the grain lit as relief, not only painted on — wood's
// grain and checks, plaster's trowel marks, stone's pits, brick's mortar, bark's furrows, cloth's weave
const SURF_RELIEF = "float dDepth[8] = float[8](0.012, 0.009, 0.018, 0.02, 0.026, 0.005, 0.01, 0.016);";
// the light bent by a height that changes across the surface (as three's bump map, from the screen-space slope of it)
const RELIEF_GLSL = `
  vec3 dPerturb(vec3 sp, vec3 sn, vec2 dh, float fd) {
    vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);
    float det = dot(sx, r1) * fd;
    vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
    return normalize(abs(det) * sn - grad);
  }
`;

export const SNOW = { value: 0 };
// the colour-guessed grain in full (plaster, brick, tiles) only among the city's houses
export const AUTO_FULL = { value: 1 };
// a roofed room where no snow lies: (centre x, centre z, turn, on) and (half across, half deep, eaves height)
export const ROOFED = { value: new THREE.Vector4(0, 0, 0, 0) }, ROOFSIZE = { value: new THREE.Vector3(2.8, 3.3, 0) };
export const RELIEF = { value: 1 };   // (the graphics setting: 0 turns the relief off)
export function addDetail(material, { scale = 1, amount = 0.22, grain = 0.5, ground = 0, surface = "auto", seeThrough = 0, snow = true, weather = true } = {}) {
  const surf = SURFACE[surface] ?? -1;
  material.userData.detail = { scale, amount, grain, ground, surface, seeThrough, snow };
  material.onBeforeCompile = sh => {
    sh.uniforms.dScale = { value: scale }; sh.uniforms.dAmount = { value: amount }; sh.uniforms.dNear = { value: seeThrough };
    sh.uniforms.dGrain = { value: grain }; sh.uniforms.dGround = { value: ground };
    sh.uniforms.dSnow = snow ? SNOW : { value: 0 }; sh.uniforms.dSnowK = { value: typeof snow === "number" ? snow : 1 }; sh.uniforms.dAutoFull = AUTO_FULL; sh.uniforms.dRoof = ROOFED; sh.uniforms.dRoofSize = ROOFSIZE; sh.uniforms.dRelief = RELIEF; sh.uniforms.dWeather = { value: weather ? 1 : 0 };
    sh.uniforms.dTexA = { value: detailTex[0] }; sh.uniforms.dTexB = { value: detailTex[1] }; sh.uniforms.dTexC = { value: detailTex[2] };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDWorld; varying vec3 vDNormal;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        vec3 dn = objectNormal;
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp; dn = mat3(instanceMatrix) * dn;
        #endif
        vDWorld = (modelMatrix * dwp).xyz; vDNormal = normalize(mat3(modelMatrix) * dn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDWorld; varying vec3 vDNormal; uniform float dScale, dAmount, dGrain, dGround, dSnow, dAutoFull, dNear; uniform vec4 dRoof; uniform vec3 dRoofSize; uniform float dRelief, dWeather, dSnowK;" + DETAIL_GLSL + SURF_GLSL + RELIEF_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float dHgt = 0.0, dHk = 0.0;
        // leaves and needles right up against the eye (standing inside a tree) thin away in a fine dither,
        // so you can see out through them and still be in among them
        if (dNear > 0.0) {
          float dd = distance(vDWorld, cameraPosition), kNear = 1.0 - smoothstep(dNear * 0.6, dNear, dd);
          if (kNear > 0.0) { ivec2 bq = ivec2(mod(gl_FragCoord.xy, 4.0)); float bm[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.); if ((bm[bq.x + bq.y * 4] + 0.5) / 16.0 < kNear * 0.92) discard; }
        }
        {
          vec3 p = vDWorld * dScale;
          vec3 an = abs(vDNormal);
          // the real surface first
          int s = ${surf};
          if (s == -1) s = dAutoFull > 0.5 ? dClassify(diffuseColor.rgb, vDNormal) : dClassifySimple(diffuseColor.rgb);
          if (s >= 0) {
            ${SURF_STRENGTH}
            vec3 w = pow(an, vec3(4.0)); w /= (w.x + w.y + w.z);
            float g = dSurf(s, vDWorld, w);
            diffuseColor.rgb *= 1.0 + (g - 0.5) * 1.6 * dStrength[s];
            // (the same grain as relief, fading out with distance, where it would only shimmer)
            ${SURF_RELIEF}
            dHk = dDepth[s] * dRelief * (1.0 - smoothstep(18.0, 45.0, distance(vDWorld, cameraPosition)));
            dHgt = g;
            // (and the hollows of it a little darker, as dirt and shadow gather in them)
            diffuseColor.rgb *= 1.0 - (1.0 - g) * 0.12 * step(0.001, dHk);
            // weather: what years outdoors do to each stuff
            float up = vDNormal.y, side = 1.0 - an.y;
            if (dWeather < 0.5) {}
            else if (s == 0 || s == 4) {
              // timber: every log and board its own shade, warmer or greyer, the grey where the rain gets at it
              float tone = dNoise(vec3(floor(vDWorld.y * 3.2), floor(vDWorld.x * 0.7), floor(vDWorld.z * 0.7)) + 0.37);
              diffuseColor.rgb *= mix(vec3(1.08, 1.02, 0.94), vec3(0.9, 0.9, 0.92), tone) * (0.92 + tone * 0.14);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), max(up, 0.0) * 0.25);
            } else if (s == 1) {
              // plaster: rain streaks run down the walls from the eaves and the sills, and it greys toward the ground
              float st = dNoise(vec3(vDWorld.x * 5.0, vDWorld.y * 0.35, vDWorld.z * 5.0)) * dNoise(vDWorld * 0.6 + 3.1);
              diffuseColor.rgb *= 1.0 - smoothstep(0.25, 0.6, st) * 0.16 * side;
            }
            if (dWeather > 0.5 && (s == 2 || s == 3 || s == 7)) {
              // stone, brick and tile: moss and lichen on what faces the sky and the wet low courses
              float mn = dFbm(vDWorld * 1.3 + 7.0), wet = max(up, 0.0) * 0.8 + (1.0 - smoothstep(0.0, 0.9, vDWorld.y - dGround)) * 0.6;
              float moss = smoothstep(0.55, 0.75, mn + wet * 0.35) * (1.0 - dSnow);
              // (a roof's tiles only flecked with lichen: a whole roof gone green read as a different colour of roof)
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.78, 0.45) + vec3(0.02, 0.035, 0.0), moss * (s == 7 ? 0.22 : 0.5));
            }
          }
          // then broad mottling, so no two walls are quite the same
          float broad = dFbm(p * 0.35);
          diffuseColor.rgb *= 1.0 + (broad - 0.5) * 1.1 * dAmount;
          // grime gathers low on walls and in the undersides
          float low = 1.0 - smoothstep(0.0, 1.4, vDWorld.y - dGround);
          diffuseColor.rgb *= 1.0 - low * 0.12 * (1.0 - an.y) - max(-vDNormal.y, 0.0) * 0.12;
          // snow lies on whatever faces the sky, thinner where the noise says so
          if (dSnow > 0.0) {
            // (dSnowK: how much of it lies here — a trodden path keeps only a thin, broken cover)
            float lie = smoothstep(0.25, 0.75, vDNormal.y + (dNoise(vDWorld * 1.7) - 0.5) * 0.5) * dSnow * dSnowK;
            if (dRoof.w > 0.5 && vDWorld.y < dRoofSize.z) {
              vec2 dd = vDWorld.xz - dRoof.xy; float rc = cos(dRoof.z), rs = sin(dRoof.z);
              vec2 lp = vec2(dd.x * rc - dd.y * rs, dd.x * rs + dd.y * rc);
              if (abs(lp.x) < dRoofSize.x && abs(lp.y) < dRoofSize.y) lie = 0.0;
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.96), lie);
          }
        }`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        if (dHk > 0.0) normal = dPerturb(-vViewPosition, normal, vec2(dFdx(dHgt), dFdy(dHgt)) * dHk, faceDirection);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (dNoise(vDWorld * dScale * 2.0) - 0.5) * 0.25, 0.04, 1.0);`);
  };
  material.customProgramCacheKey = () => "detail" + surf + (weather ? "" : "w");
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------------
//  materials — vertex coloured, so one material paints a whole town
// ---------------------------------------------------------------------------
export const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
  rough: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }),
  // windows with a candle behind them; their glow is turned up at night
  lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffa94d, emissiveIntensity: 0 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.25, metalness: 0.3 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
  ember: new THREE.MeshBasicMaterial({ color: 0xff6a1a }),
};
addDetail(MAT.solid, { scale: 1.4, amount: 0.26 });
addDetail(MAT.rough, { scale: 1.1, amount: 0.3, grain: 0.7 });
addDetail(MAT.lit, { scale: 1.4, amount: 0.12, grain: 0.2 });

const _mc = {};
// people, and what they carry, never have snow lying on them: their materials (which may be shared with a roof or a
// fence) are swapped for copies of their own that take none — one copy of each, used by everyone
const _noSnow = new WeakMap();
export function noSnow(obj) {
  if (!obj) return obj;
  obj.traverse(o => {
    if (!o.isMesh) return;
    const one = m => {
      if (!m || !m.userData || !m.userData.detail || m.userData.detail.snow === false) return m;
      let c = _noSnow.get(m);
      if (!c) { c = m.clone(); addDetail(c, { ...m.userData.detail, snow: false }); _noSnow.set(m, c); }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  return obj;
}
export function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (!_mc[key]) {
    // (weather: false — no moss and weathering, for what's under the ground or indoors)
    const { surface, weather, ...o } = opts;
    _mc[key] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, ...o });
    if (!o.metalness) addDetail(_mc[key], { scale: 3, amount: 0.16, grain: 0.4, surface: surface || "auto", weather: weather !== false });
  }
  return _mc[key];
}

// ---------------------------------------------------------------------------
//  Builder: many coloured shapes, one draw call
// ---------------------------------------------------------------------------
const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Builder {
  constructor() { this.parts = []; }
  // add a geometry, painted one colour, placed by position/rotation/scale
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, jitter = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz, "YXZ");
    _q.setFromEuler(_e);
    _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    _col.set(color);
    if (jitter) _col.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    for (let i = 0; i < n; i++) { c[i * 3] = _col.r; c[i * 3 + 1] = _col.g; c[i * 3 + 2] = _col.b; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(g);
    return this;
  }
  box(w, h, d, x, y, z, color, ry = 0, jitter = 0) {
    return this.add(BOX, color, x, y, z, 0, ry, 0, w, h, d, jitter);
  }
  build(material = MAT.solid, { shadow = true, receive = true } = {}) {
    const geo = mergeGeos(this.parts);
    this.parts.forEach(p => p.dispose());
    this.parts = [];
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow; m.receiveShadow = receive;
    return m;
  }
  get empty() { return this.parts.length === 0; }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

export function mergeGeos(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

// A gable roof: a triangular prism, ridge along Z, gables facing ±Z.
export function prismGeo(w, h, d, overhang = 0.35) {
  const W = w / 2 + overhang, D = d / 2 + overhang * 0.6;
  const v = [
    // left slope
    -W, 0, -D, 0, h, -D, 0, h, D,  -W, 0, -D, 0, h, D, -W, 0, D,
    // right slope
    W, 0, -D, W, 0, D, 0, h, D,  W, 0, -D, 0, h, D, 0, h, -D,
    // front gable (+Z)
    -W, 0, D, 0, h, D, W, 0, D,
    // back gable (-Z)
    W, 0, -D, 0, h, -D, -W, 0, -D,
    // underside
    -W, 0, -D, -W, 0, D, W, 0, D,  -W, 0, -D, W, 0, D, W, 0, -D,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

// the wall under a gable: a pentagon face, extruded
export function gableGeo(w, h, t) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

// ---------------------------------------------------------------------------
//  collision
// ---------------------------------------------------------------------------
// Boxes are axis-aligned, with a top: a crate you can crouch behind is a box
// 1.1 high, a house is a box 12 high. Circles are tree trunks and posts. Both
// sit in a coarse grid so a forest of two thousand trunks costs nine cells.
export class Collision {
  constructor(cell = 8) { this.cell = cell; this.grid = new Map(); this.all = []; }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  insert(o) {
    this.all.push(o);
    const c = this.cell;
    const x0 = Math.floor((o.type === "box" ? o.x0 : o.x - o.r) / c), x1 = Math.floor((o.type === "box" ? o.x1 : o.x + o.r) / c);
    const z0 = Math.floor((o.type === "box" ? o.z0 : o.z - o.r) / c), z1 = Math.floor((o.type === "box" ? o.z1 : o.z + o.r) / c);
    o._cells = [];
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = this.key(i, j);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(o);
      o._cells.push(k);
    }
    return o;
  }
  remove(o) {
    if (!o) return;
    o.disabled = true;                 // (anything still holding it finds it gone)
    const i = this.all.indexOf(o); if (i >= 0) this.all.splice(i, 1);
    for (const k of o._cells || []) { const a = this.grid.get(k); const j = a ? a.indexOf(o) : -1; if (j >= 0) a.splice(j, 1); }
    o._cells = [];
  }
  addBox(x0, z0, x1, z1, y1 = 10, y0 = -5, tag) {
    return this.insert({ type: "box", x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, tag });
  }
  // a box given by centre and size
  addRect(cx, cz, w, d, y1 = 10, y0 = -5, tag) { return this.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y1, y0, tag); }
  // the extent of everything solid, for fitting a map to it
  bounds() {
    if (!this.all.length) return null;
    const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const o of this.all) {
      if (o.type !== "box" || o.x1 - o.x0 > 400 || o.z1 - o.z0 > 400) continue;
      b.x0 = Math.min(b.x0, o.x0); b.x1 = Math.max(b.x1, o.x1); b.z0 = Math.min(b.z0, o.z0); b.z1 = Math.max(b.z1, o.z1);
    }
    return isFinite(b.x0) ? b : null;
  }
  addCircle(x, z, r, y1 = 10, tag) { return this.insert({ type: "circle", x, z, r, y0: -5, y1, tag }); }
  near(x, z, rad = 2) {
    const c = this.cell, out = new Set();
    for (let i = Math.floor((x - rad) / c); i <= Math.floor((x + rad) / c); i++)
      for (let j = Math.floor((z - rad) / c); j <= Math.floor((z + rad) / c); j++) {
        const a = this.grid.get(this.key(i, j));
        if (a) for (const o of a) out.add(o);
      }
    return out;
  }
  // push a circle of radius r at height band [y, y+h] out of everything
  // (npc: people other than you keep the margin a building asks of them — its walls are a little inside its looks,
  // so that you slip round a corner, but they don't clip through one)
  resolve(p, r, y = 0, h = 1.7, npc = false) {
    for (let pass = 0; pass < 2; pass++) for (const o of this.near(p.x, p.z, r + (npc ? 1.8 : 1))) {
      if (o.disabled || y > o.y1 - 0.05 || y + h < o.y0) continue;
      if (o.type === "box") {
        const cx = clamp(p.x, o.x0, o.x1), cz = clamp(p.z, o.z0, o.z1);
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = cx + dx / d * r; p.z = cz + dz / d * r;
          } else {
            // centre inside the box: leave by the nearest face
            const l = p.x - o.x0, rr = o.x1 - p.x, f = p.z - o.z0, b = o.z1 - p.z;
            const m = Math.min(l, rr, f, b);
            if (m === l) p.x = o.x0 - r; else if (m === rr) p.x = o.x1 + r;
            else if (m === f) p.z = o.z0 - r; else p.z = o.z1 + r;
          }
        }
      } else {
        const dx = p.x - o.x, dz = p.z - o.z, rr = r + o.r + (npc && o.npcPad || 0), d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = o.x + dx / d * rr; p.z = o.z + dz / d * rr; }
      }
    }
  }
  // is a point inside anything solid? (used to keep the chase camera out of walls)
  solidAt(x, y, z, pad = 0.15) {
    for (const o of this.near(x, z, 1)) {
      if (o.disabled || y > o.y1 || y < o.y0) continue;
      if (o.type === "box") { if (x > o.x0 - pad && x < o.x1 + pad && z > o.z0 - pad && z < o.z1 + pad) return true; }
      else if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + pad) ** 2) return true;
    }
    return false;
  }
  // can a watchman at a see b? Boxes only — a trunk is too thin to hide behind.
  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const cand = this.near((a.x + b.x) / 2, (a.z + b.z) / 2, len / 2 + 1);
    for (const o of cand) {
      if (o.disabled || o.noSight) continue;
      // a tree trunk, or anything round: closest approach of the sight line to its centre
      if (o.type === "circle") {
        const L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / L2));
        const cx = a.x + dx * t, cz = a.z + dz * t, cy = a.y + dy * t;
        if (t > 0.02 && t < 0.98 && (cx - o.x) ** 2 + (cz - o.z) ** 2 < o.r * o.r && cy > o.y0 && cy < o.y1) return false;
        continue;
      }
      if (o.type !== "box") continue;
      // slab test on the segment
      let t0 = 0, t1 = 1;
      const slab = (p, d, lo, hi) => {
        if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
        let u = (lo - p) / d, v = (hi - p) / d;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
        return t0 <= t1;
      };
      if (slab(a.x, dx, o.x0, o.x1) && slab(a.y, dy, o.y0, o.y1) && slab(a.z, dz, o.z0, o.z1) && t1 > 0.001 && t0 < 0.999) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
//  sky: a gradient dome, and stars for the nights
// ---------------------------------------------------------------------------
export function makeSky() {
  const geo = new THREE.SphereGeometry(800, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x4a78b5) }, mid: { value: new THREE.Color(0xc9d6e0) },
      bottom: { value: new THREE.Color(0x9aa9b0) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color(0xfff0c0) }, sunSize: { value: 0.9985 },
      moonK: { value: 0 }, moonPhase: { value: 0.5 },
      cloudT: { value: 0 }, cloudK: { value: 0.3 }, cloudLit: { value: 1 }, bowK: { value: 0 },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, mid, bottom, sunCol, sunDir; uniform float sunSize, moonK, moonPhase, cloudT, cloudK, cloudLit, bowK; varying vec3 vP;
      float ch(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
      float cfbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * cn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.55)) : mix(mid, bottom, clamp(-h*4.0,0.0,1.0));
        vec3 d = normalize(vP), sd = normalize(sunDir);
        float s = dot(d, sd);
        c += sunCol * (smoothstep(sunSize, 1.0, s) * 1.6 + pow(max(s,0.0), 24.0) * 0.35) * (1.0 - moonK);
        // clouds: a layer overhead, seen in perspective, drifting with the wind; scattered on a fair day, a low grey
        // lid before rain; lit white on the sun's side and grey beneath, and only dark shapes against the night
        if (h > 0.0) {
          vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(cloudT * 0.012, cloudT * 0.005);
          float n = cfbm(cp) * 0.75 + cfbm(cp * 2.7 + 3.1) * 0.25;
          float cov = smoothstep(0.62 - cloudK * 0.5, 0.78 - cloudK * 0.35, n) * smoothstep(0.0, 0.18, h);
          float thick = smoothstep(0.5, 0.95, n + cloudK * 0.3);
          vec3 lit = mix(vec3(1.0), sunCol * 1.4 + vec3(0.25), 0.35) * cloudLit;
          vec3 shade = mix(mid, vec3(0.42, 0.44, 0.48), 0.6) * (0.35 + 0.65 * cloudLit);
          vec3 cc = mix(lit, shade, thick * 0.8 + cloudK * 0.3);
          // (brighter at the edges toward the sun)
          cc += sunCol * pow(max(s, 0.0), 6.0) * (1.0 - thick) * 0.5 * cloudLit;
          c = mix(c, cc, cov * (0.85 + cloudK * 0.15));
        }
        // a rainbow, as a shower clears: the bow forty-two degrees round the point opposite the sun, red outside
        // and violet within, fainter toward the ground and the ends
        if (bowK > 0.0 && h > -0.02) {
          float ang = acos(clamp(dot(d, -sd), -1.0, 1.0)), x = (ang - 0.705) / 0.045;
          if (abs(x) < 1.0) {
            vec3 bow = clamp(vec3(1.5 - abs(x - 0.7) * 2.6, 1.5 - abs(x) * 2.6, 1.5 - abs(x + 0.7) * 2.6), 0.0, 1.0);
            c += bow * bowK * 0.32 * smoothstep(-0.02, 0.15, h) * (1.0 - x * x);
          }
        }
        // the moon, by night, where the night's light comes from: a pale disc lit on one side by the sun below the
        // world (its phase), the dark of it faintly there, and a soft halo round it
        if (moonK > 0.0) {
          vec3 ax = normalize(cross(sd, vec3(0.0, 1.0, 0.0))), ay = cross(ax, sd);
          vec2 q = vec2(dot(d, ax), dot(d, ay)) / 0.03;
          float r2 = dot(q, q);
          if (r2 < 1.0 && s > 0.0) {
            vec3 n = vec3(q, sqrt(1.0 - r2));
            float ph = moonPhase * 6.2832, lit = smoothstep(-0.05, 0.12, dot(n, vec3(sin(ph), 0.0, -cos(ph))));
            float mot = 0.86 + 0.14 * sin(q.x * 9.0 + 1.3) * sin(q.y * 7.0 - 0.4);
            c = mix(c, vec3(0.95, 0.94, 0.88) * mot * (0.08 + 1.1 * lit), moonK * smoothstep(1.0, 0.92, r2));
          }
          c += vec3(0.5, 0.56, 0.7) * pow(max(s, 0.0), 900.0) * 0.5 * moonK * (0.4 + 0.6 * abs(cos(moonPhase * 3.1416)));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, m);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  // stars
  const n = 900, p = new Float32Array(n * 3), r = rng(7);
  for (let i = 0; i < n; i++) {
    const u = r() * TAU, v = Math.acos(r() * 0.95);
    p[i * 3] = Math.sin(v) * Math.cos(u) * 700; p[i * 3 + 1] = Math.cos(v) * 700; p[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 700;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false;
  sky.add(stars);
  sky.userData.stars = stars;
  return sky;
}

// A flickering flame: tongues of fire, white-hot at the root and dark orange where they thin away to nothing (drawn
// additively, so a darker colour is a fainter one), a soft glow round them, sparks going up — and an optional real light.
const FLAME = {};
// FIRE: flames drawn as they move, not solid cones — a little film of a flame, sixteen frames that loop, made once
// here from noise (the tongues licking up and breaking off, white-gold at the heart and red at the edges), shown on a
// few faces that always turn to you; a glow about it; embers that float up and wink out; and over a big fire, smoke.
function noise3(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z;
  const h = (i, j, k) => { let n = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = t => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(X, Y, Z), h(X + 1, Y, Z), u), L(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v), L(L(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), L(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
}
const FRAMES = 16, FW = 64, FH = 128;
function flameParts() {
  if (FLAME.film) return FLAME;
  // the film: four rows of four frames; time goes round a circle through the noise, so the last frame meets the first
  const cv = document.createElement("canvas"); cv.width = FW * 4; cv.height = FH * 4;
  const x = cv.getContext("2d"), img = x.createImageData(cv.width, cv.height), d = img.data;
  for (let f = 0; f < FRAMES; f++) {
    const ang = f / FRAMES * Math.PI * 2, cz = Math.cos(ang) * 1.3, sz = Math.sin(ang) * 1.3, ox = (f % 4) * FW, oy = Math.floor(f / 4) * FH;
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      const u = (i + 0.5) / FW * 2 - 1, v = 1 - (j + 0.5) / FH;     // (v: 0 at the foot, 1 at the top)
      // the rising turbulence: noise drifting up through the flame, two scales of it
      const n1 = noise3(u * 2.2 + cz, v * 3.2 - ang * 0.9, sz), n2 = noise3(u * 5 + 7 + cz * 1.7, v * 7 - ang * 1.8, sz * 1.7 + 3);
      const turb = n1 * 0.65 + n2 * 0.35;
      // the shape: wide and bright at the foot, narrowing and breaking up toward the top, bent by the turbulence
      const wv = 0.62 * Math.pow(1 - v, 0.55) + 0.04, du = u + (turb - 0.5) * 0.55 * v;
      let k = Math.exp(-Math.pow(du / wv, 2) * 1.6) * Math.pow(1 - v, 0.35);
      k *= 0.45 + turb * 1.1 - v * 0.55;
      k = Math.max(0, Math.min(1.2, k * 1.5 - 0.1));
      // (nothing at a frame's very edges, so no frame bleeds into the next)
      k *= Math.min(1, v / 0.05) * Math.min(1, (1 - v) / 0.08) * Math.min(1, (1 - Math.abs(u)) / 0.08);
      const o = ((oy + j) * cv.width + ox + i) * 4;
      // white-gold at the heart, orange, then deep red as it thins
      d[o] = Math.min(255, 255 * Math.min(1, k * 2.2));
      d[o + 1] = Math.min(255, 255 * Math.max(0, Math.min(1, k * 1.5 - 0.25)));
      d[o + 2] = Math.min(255, 255 * Math.max(0, k - 0.75) * 2.4);
      d[o + 3] = Math.min(255, 255 * Math.min(1, k * 1.8));
    }
  }
  x.putImageData(img, 0, 0);
  FLAME.film = new THREE.CanvasTexture(cv); FLAME.film.colorSpace = THREE.SRGBColorSpace;
  FLAME.film.generateMipmaps = false; FLAME.film.minFilter = THREE.LinearFilter;
  FLAME.film.repeat.set(0.25, 0.25);
  const blob = (inner, outer, a0, size = 64) => {
    const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, inner); gr.addColorStop(a0, outer); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  FLAME.glow = new THREE.SpriteMaterial({ map: blob("rgba(255,170,70,0.55)", "rgba(255,110,30,0.2)", 0.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  FLAME.ember = new THREE.SpriteMaterial({ map: blob("rgba(255,240,200,1)", "rgba(255,140,40,0.6)", 0.35, 32), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true });
  // smoke: a soft, uneven puff
  { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    for (let i = 0; i < 9; i++) { const px = 22 + Math.random() * 20, py = 22 + Math.random() * 20, r = Math.min(10 + Math.random() * 14, px - 1, 63 - px, py - 1, 63 - py), gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, "rgba(255,255,255,0.32)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    FLAME.smokeTex = new THREE.CanvasTexture(c); }
  return FLAME;
}
export function makeFlame(size = 1, light = null) {
  const F = flameParts(), g = new THREE.Group();
  // the faces of the flame: a tall one in the middle, and smaller ones about it, each at its own place in the film
  const faces = [];
  const n = size >= 2 ? 4 : size >= 0.8 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const map = F.film.clone(); map.repeat.set(0.25, 0.25);
    const m = new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true });
    const sp = new THREE.Sprite(m); sp.center.set(0.5, 0.04); sp.renderOrder = 2;
    const main = i === 0, a = i / n * Math.PI * 2 + Math.random();
    const w = (main ? 0.26 : 0.17 + Math.random() * 0.05) * size, h = (main ? 0.52 : 0.34 + Math.random() * 0.1) * size;
    sp.position.set(main ? 0 : Math.cos(a) * 0.05 * size, 0, main ? 0 : Math.sin(a) * 0.05 * size);
    sp.scale.set(w, h, 1);
    sp.userData = { w, h, ph: Math.random() * FRAMES, fps: 15 + Math.random() * 6, flip: Math.random() < 0.5 };
    if (sp.userData.flip) { map.repeat.x = -0.25; }
    g.add(sp); faces.push(sp);
  }
  const glow = new THREE.Sprite(F.glow); glow.scale.setScalar(0.75 * size); glow.position.y = 0.12 * size; glow.renderOrder = 1; g.add(glow);
  // embers, from a fire big enough to throw them
  const sparks = [];
  if (size >= 1.5) for (let i = 0; i < Math.min(14, Math.round(size * 2.5)); i++) {
    const sp = new THREE.Sprite(F.ember.clone()); sp.scale.setScalar(0.035 * Math.min(2, size / 2)); sp.userData = { t: Math.random(), sp: 0.35 + Math.random() * 0.35, dx: 0, dz: 0, sw: Math.random() * 10 }; sp.renderOrder = 3; g.add(sp); sparks.push(sp);
  }
  // smoke, over a proper fire
  const smoke = [];
  if (size >= 2) for (let i = 0; i < 7; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.smokeTex, color: 0x9a948a, transparent: true, depthWrite: false, opacity: 0, fog: true }));
    m.userData = { t: i / 7, rot: (Math.random() - 0.5) * 0.6 }; m.renderOrder = 1; g.add(m); smoke.push(m);
  }
  g.userData.flame = { faces, glow, sparks, smoke, size, t: Math.random() * 10, light, base: light ? light.intensity : 0 };
  if (light) { light.position.y = 0.25 * size; g.add(light); }
  return g;
}
export function flicker(g, dt) {
  const f = g.userData.flame; if (!f) return;
  f.t += dt;
  const k = 0.85 + Math.sin(f.t * 13.1) * 0.08 + Math.sin(f.t * 23.7) * 0.06 + Math.sin(f.t * 5.3) * 0.05;
  const s = f.size || 1;
  // (out: a fire with no light left in it shows no flame either)
  const lit = !f.light || f.base > 0.01;
  for (const sp of f.faces || []) {
    const u = sp.userData; sp.visible = lit; if (!lit) continue;
    const fr = Math.floor(u.ph + f.t * u.fps) % FRAMES, map = sp.material.map;
    map.offset.set((fr % 4) * 0.25 + (u.flip ? 0.25 : 0), 0.75 - Math.floor(fr / 4) * 0.25);
    const breathe = 0.9 + (k - 0.85) * 1.2 + 0.06 * Math.sin(f.t * 3.1 + u.ph);
    sp.scale.set(u.w * (1.02 - (k - 0.85) * 0.4), u.h * breathe, 1);
    sp.material.rotation = Math.sin(f.t * 1.7 + u.ph) * 0.05;
  }
  if (f.glow) { f.glow.visible = lit; f.glow.scale.setScalar(0.75 * s * (0.9 + (k - 0.85) * 1.5)); }
  for (const sp of f.sparks || []) {
    const u = sp.userData;
    u.t += dt * u.sp;
    if (u.t > 1) { u.t = 0; u.dx = (Math.random() - 0.5) * 0.5 * s; u.dz = (Math.random() - 0.5) * 0.5 * s; u.sp = 0.3 + Math.random() * 0.4; }
    const t = u.t;
    sp.position.set(u.dx * t + Math.sin(t * 7 + u.sw) * 0.06 * s, 0.12 * s + t * (0.8 + u.sp) * s, u.dz * t + Math.cos(t * 6 + u.sw) * 0.05 * s);
    sp.visible = lit && t < 0.92;
    sp.material.opacity = (1 - t) * (0.6 + 0.4 * Math.sin(f.t * 20 + u.sw));
  }
  for (const m of f.smoke || []) {
    const u = m.userData; u.t += dt * 0.16; if (u.t > 1) u.t -= 1;
    const t = u.t;
    m.visible = lit;
    m.position.set(Math.sin(t * 3 + u.rot * 9) * 0.15 * s, 0.35 * s + t * 1.6 * s, Math.cos(t * 2.4 + u.rot * 7) * 0.12 * s);
    m.scale.setScalar((0.25 + t * 0.9) * s);
    m.material.opacity = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.16;
    m.material.rotation = u.rot * t * 3;
  }
  if (f.light) f.light.intensity = f.base * (0.8 + (k - 0.85) * 2.5);
}
