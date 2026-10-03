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
    if (s == 1) return dTri(dTexA, 1, p * 0.55, w);
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

export const SNOW = { value: 0 };
// the colour-guessed grain in full (plaster, brick, tiles) only among the city's houses
export const AUTO_FULL = { value: 1 };
// a roofed room where no snow lies: (centre x, centre z, turn, on) and (half across, half deep, eaves height)
export const ROOFED = { value: new THREE.Vector4(0, 0, 0, 0) }, ROOFSIZE = { value: new THREE.Vector3(2.8, 3.3, 0) };
export function addDetail(material, { scale = 1, amount = 0.22, grain = 0.5, ground = 0, surface = "auto", seeThrough = 0, snow = true } = {}) {
  const surf = SURFACE[surface] ?? -1;
  material.userData.detail = { scale, amount, grain, ground, surface, seeThrough, snow };
  material.onBeforeCompile = sh => {
    sh.uniforms.dScale = { value: scale }; sh.uniforms.dAmount = { value: amount }; sh.uniforms.dNear = { value: seeThrough };
    sh.uniforms.dGrain = { value: grain }; sh.uniforms.dGround = { value: ground };
    sh.uniforms.dSnow = snow ? SNOW : { value: 0 }; sh.uniforms.dAutoFull = AUTO_FULL; sh.uniforms.dRoof = ROOFED; sh.uniforms.dRoofSize = ROOFSIZE;
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
      .replace("#include <common>", "#include <common>\nvarying vec3 vDWorld; varying vec3 vDNormal; uniform float dScale, dAmount, dGrain, dGround, dSnow, dAutoFull, dNear; uniform vec4 dRoof; uniform vec3 dRoofSize;" + DETAIL_GLSL + SURF_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
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
          }
          // then broad mottling, so no two walls are quite the same
          float broad = dFbm(p * 0.35);
          diffuseColor.rgb *= 1.0 + (broad - 0.5) * 1.1 * dAmount;
          // grime gathers low on walls and in the undersides
          float low = 1.0 - smoothstep(0.0, 1.4, vDWorld.y - dGround);
          diffuseColor.rgb *= 1.0 - low * 0.12 * (1.0 - an.y) - max(-vDNormal.y, 0.0) * 0.12;
          // snow lies on whatever faces the sky, thinner where the noise says so
          if (dSnow > 0.0) {
            float lie = smoothstep(0.25, 0.75, vDNormal.y + (dNoise(vDWorld * 1.7) - 0.5) * 0.5) * dSnow;
            if (dRoof.w > 0.5 && vDWorld.y < dRoofSize.z) {
              vec2 dd = vDWorld.xz - dRoof.xy; float rc = cos(dRoof.z), rs = sin(dRoof.z);
              vec2 lp = vec2(dd.x * rc - dd.y * rs, dd.x * rs + dd.y * rc);
              if (abs(lp.x) < dRoofSize.x && abs(lp.y) < dRoofSize.y) lie = 0.0;
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.96), lie);
          }
        }`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (dNoise(vDWorld * dScale * 2.0) - 0.5) * 0.25, 0.04, 1.0);`);
  };
  material.customProgramCacheKey = () => "detail" + surf;
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
    const { surface, ...o } = opts;
    _mc[key] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, ...o });
    if (!o.metalness) addDetail(_mc[key], { scale: 3, amount: 0.16, grain: 0.4, surface: surface || "auto" });
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
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, mid, bottom, sunCol, sunDir; uniform float sunSize; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.55)) : mix(mid, bottom, clamp(-h*4.0,0.0,1.0));
        float s = dot(normalize(vP), normalize(sunDir));
        c += sunCol * (smoothstep(sunSize, 1.0, s) * 1.6 + pow(max(s,0.0), 24.0) * 0.35);
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

// A flickering flame: a small cone and an optional real light.
export function makeFlame(size = 1, light = null) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.07 * size, 0.24 * size, 6), MAT.flame);
  outer.position.y = 0.1 * size;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.045 * size, 0.14 * size, 6), MAT.ember);
  inner.position.y = 0.06 * size;
  g.add(outer, inner);
  g.userData.flame = { outer, inner, t: Math.random() * 10, light, base: light ? light.intensity : 0 };
  if (light) { light.position.y = 0.25 * size; g.add(light); }
  return g;
}
export function flicker(g, dt) {
  const f = g.userData.flame; if (!f) return;
  f.t += dt;
  const k = 0.85 + Math.sin(f.t * 13.1) * 0.08 + Math.sin(f.t * 23.7) * 0.06 + Math.sin(f.t * 5.3) * 0.05;
  f.outer.scale.set(1, k, 1);
  f.inner.scale.set(1, 1.6 - k * 0.6, 1);
  if (f.light) f.light.intensity = f.base * (0.8 + (k - 0.85) * 2.5);
}
