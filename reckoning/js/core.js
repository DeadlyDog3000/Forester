// ===========================================================================
//  FORESTER: RECKONING
//  Copyright (c) 2026 Roan Fraese, trading as DeadlyDog Productions.
//  All rights reserved. See reckoning/LICENSE.
// ===========================================================================

// The pieces every other file leans on: the renderer, the materials, a way of
// building a whole street as one mesh instead of four hundred, and the
// collision the player and the watchmen walk into.

import * as THREE from "three";
import { mergeVertices } from "../lib/utils/BufferGeometryUtils.js";
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
// and each surface's own colour (art/tex/colour.jpg, twelve squares side by side: the eight stuffs, then meadow, forest floor, dirt and cobbles): how each brick, stone, board and
// tile differs from the wall's own colour, so a wall shows its courses and its mortar, not only a grain on a flat
// paint. Cut into the layers of one texture (one sampler for all twelve); a flat grey layer until it has loaded.
const COLOUR_N = 12, COLOUR_SZ = 512;
const colourTex = new THREE.DataArrayTexture(new Uint8Array(4 * 4 * COLOUR_N).fill(128), 2, 2, COLOUR_N);
colourTex.wrapS = colourTex.wrapT = THREE.RepeatWrapping; colourTex.colorSpace = THREE.NoColorSpace;
colourTex.magFilter = THREE.LinearFilter; colourTex.minFilter = THREE.LinearMipmapLinearFilter; colourTex.generateMipmaps = true; colourTex.anisotropy = 8;
colourTex.needsUpdate = true;
{
  const img = new Image();
  img.onload = () => {
    const S = COLOUR_SZ, c = document.createElement("canvas"); c.width = S * COLOUR_N; c.height = S;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, S * COLOUR_N, S);
    const data = new Uint8Array(S * S * 4 * COLOUR_N);
    for (let k = 0; k < COLOUR_N; k++) data.set(g.getImageData(k * S, 0, S, S).data, k * S * S * 4);
    colourTex.image = { data, width: S, height: S, depth: COLOUR_N };
    colourTex.needsUpdate = true;
  };
  img.src = "art/tex/colour.jpg";
}
export const SURFACE = { auto: -1, none: -2, wood: 0, plaster: 1, stone: 2, brick: 3, bark: 4, cloth: 5, needles: 6, tiles: 7, rock: 8, ground: 9, log: 10 };
export function groundTexture(name, repeat) {
  const t = texLoader.load(`art/tex/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}
const SURF_GLSL = `
  uniform sampler2D dTexA, dTexB, dTexC;
  uniform highp sampler2DArray dTexCol;
  // (a log lies on its side: its grain runs along it, so on the walls the photograph is laid on turned a quarter)
  bool dRot = false;
  vec3 dTriCol(int s, vec3 p, vec3 w) {
    float L = float(s);
    return texture(dTexCol, vec3(dRot ? p.yz : p.zy, L)).rgb * w.x + texture(dTexCol, vec3(p.xz, L)).rgb * w.y + texture(dTexCol, vec3(dRot ? p.yx : p.xy, L)).rgb * w.z;
  }
  // the ground: grass, leaf litter, bare earth or stones, judged by the ground's own colour, at two scales so the
  // photographs' squares don't show across a field; and only up close, where it can be seen, not as a shimmer far off
  // which ground photograph (a layer of the colour texture), or -1: bare rock, which is a boulder's own grain
  // (where one ground gives way to the next, the line wanders, ragged, as grass thins onto a track — the colours it
  //  goes by are the terrain's, laid on its corners, and a hard line across them ran ruler-straight along the triangles)
  int dGroundL(vec3 lin, vec3 n, vec3 p, out float k) {
    vec3 c = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 1e-3), lum = dot(c, vec3(0.3, 0.59, 0.11));
    float j = texture2D(dTexA, p.xz * 0.045).r * 0.65 + texture2D(dTexB, p.xz * 0.17 + 0.31).g * 0.35 - 0.5;
    k = 0.8;
    if (n.y < 0.6 || (sat < 0.12 + j * 0.05 && lum < 0.7)) return -1;                          // steep or grey: rock
    if (c.g >= c.r * (0.92 + j * 0.12) && sat > 0.12 + j * 0.06) { k = 0.85; return 8; }        // green: grass
    if (lum > 0.5 + j * 0.12) { k = 0.7; return 10; }                                          // pale: sand, dry earth
    if (lum < 0.3 + j * 0.12) return 9;                                                        // dark brown: the forest floor
    k = 0.75; return 10;                                                                       // brown: bare earth
  }
  vec3 dGroundCol(int L, float k, vec3 p, vec3 n, float far) {
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    vec3 a = dTriCol(L, p * 0.42, w) * 2.0, b = dTriCol(L, p * 0.11 + vec3(0.3, 0.0, 0.7), w) * 2.0;
    vec3 pc = 1.0 + (mix(a, b, 0.4) - 1.0) * 1.5;
    // (the meadow's flowers and the like kept only as light and dark: the ground's own colour is the ground's)
    pc = mix(vec3(dot(pc, vec3(0.3, 0.59, 0.11))), pc, 0.35);
    return mix(vec3(1.0), max(pc, vec3(0.3)), k * (1.0 - smoothstep(30.0, 90.0, far)));
  }
  // the surface's own colour pattern at p, laid on at the scale its grain is (so the two agree): 1 is the wall's colour
  vec3 dSurfCol(int s, vec3 p, vec3 w) {
    float sc = s == 0 ? 0.9 : s == 1 ? 0.21 : s == 2 ? 0.7 : s == 3 ? 0.9 : s == 4 ? 1.1 : s == 5 ? 3.0 : s == 6 ? 0.8 : 0.6;
    return dTriCol(s, p * sc, w) * 2.0;
  }
  // the grain of surface s at world point p, seen from the three axes and blended by the normal
  float dTri(sampler2D t, int ch, vec3 p, vec3 w) {
    vec4 a = texture2D(t, dRot ? p.yz : p.zy), b = texture2D(t, p.xz), c = texture2D(t, dRot ? p.yx : p.xy);
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
    if (s == 8) {
      // a boulder's own rock, not a mason's wall: a coarse grain, specks of other stone in it, and a few hairline cracks
      float n = dFbm(p * 2.4), sp = dNoise(p * 17.0), cr = 1.0 - smoothstep(0.0, 0.035, abs(dNoise(p * 0.8 + 4.3) - 0.5));
      return clamp(0.5 + (n - 0.5) * 1.0 + (sp - 0.5) * 0.4 - cr * 0.35, 0.0, 1.0);
    }
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
    if (sat < 0.14 && lum > 0.2 && lum < 0.75) return 8;                        // (out here, grey is rock, not a wall)
    if (c.r >= c.g && c.g >= c.b * 0.95 && sat > 0.2 && sat < 0.75 && lum < 0.6 && lum > 0.08) return 0;
    return -2;
  }
`;
const SURF_STRENGTH = "float dStrength[9] = float[9](0.75, 0.3, 0.85, 0.8, 0.95, 0.55, 0.8, 0.85, 0.7);";
// how deep each surface's grain stands out, in metres: the grain lit as relief, not only painted on — wood's
// grain and checks, plaster's trowel marks, stone's pits, brick's mortar, bark's furrows, cloth's weave
const SURF_RELIEF = "float dDepth[9] = float[9](0.012, 0.009, 0.018, 0.02, 0.009, 0.005, 0.01, 0.016, 0.02);";   // (bark kept shallow: deeper, its fine furrows lit up as a glitter of white specks on every bough)
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
// (rain: how wet the world out under the sky is, 0 to 1 — eased toward the rain in the engine's frame)
export const WET = { value: 0 };
// the axe's notches in standing trunks (up to four at once): for each, the world taken into the notch's own frame —
// x out toward the side it was cut from, y up from the floor of the cut, z across — and (trunk radius, depth, height
// of the sloped face, on). Bark inside the wedge is not drawn: the notch's own faces (engine.js) show through it.
export const NOTCH_M = { value: [0, 1, 2, 3].map(() => new THREE.Matrix4()) }, NOTCH_P = { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) };
// the colour-guessed grain in full (plaster, brick, tiles) only among the city's houses
export const AUTO_FULL = { value: 1 };
// a roofed room where no snow lies: (centre x, centre z, turn, on) and (half across, half deep, eaves height)
export const ROOFED = { value: new THREE.Vector4(0, 0, 0, 0) }, ROOFSIZE = { value: new THREE.Vector3(2.8, 3.3, 0) };
export const RELIEF = { value: 1 };
// the sky's light caught along the edges of things turned away from you — a man's shoulder, a roof's ridge against the
// field — so they stand out from what's behind them (set from the sky's colour and strength, applyAtmo)
export const RIM = { value: new THREE.Color(0, 0, 0) };   // (the graphics setting: 0 turns the relief off)
// (local: the grain laid on in the thing's own space, not the world's — for what's carried in your hands, which
//  would otherwise slide through the world's grain as you turn)
// (limbs: a tree's own branches — whatever of its bark stands further than this from its axis, in its own space — thin
//  away right up against the eye, as its needles do: stood at the trunk with an axe, you'd otherwise be looking out
//  through a cage of bare poles)
// ---- more for a material's shader than its grain: a hook added to it is run after the grain's own, every time the
// material is made — and goes with it when it's copied (for snow, for its own grain, for limbs thinning: noSnow,
// ownGrain, fadeLimbs), which once made a fresh copy with the grain alone and lost the rest without a word ----
const HOOKS = new WeakMap(), HOOKED = new WeakSet();
function runHooks(m, sh, r) { const L = HOOKS.get(m); if (L) for (const [f] of L) f(sh, r); }
function hookKey(m) { const L = HOOKS.get(m); return L ? L.map(h => h[1]).join("") : ""; }
export function addHook(m, fn, key) {
  if (!m) return m;
  let L = HOOKS.get(m); if (!L) HOOKS.set(m, (L = []));
  if (key && L.some(h => h[1] === key)) return m;
  L.push([fn, key || ""]);
  // (a material with no grain of its own: the hooks put on it directly, once)
  if (!m.userData.detail && !HOOKED.has(m)) {
    HOOKED.add(m);
    const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); runHooks(m, sh, r); };
    m.customProgramCacheKey = () => (pk ? pk.call(m) : "") + hookKey(m);
  }
  m.needsUpdate = true;
  return m;
}
export function inheritHooks(from, to) {
  const L = HOOKS.get(from); if (!L || from === to) return to;
  for (const [f, k] of L) addHook(to, f, k);
  return to;
}
export function addDetail(material, { scale = 1, amount = 0.22, grain = 0.5, ground = 0, surface = "auto", seeThrough = 0, snow = true, weather = true, local = false, limbs = 0, rim = true, cards = false } = {}) {
  const surf = SURFACE[surface] ?? -1;
  material.userData.detail = { scale, amount, grain, ground, surface, seeThrough, snow, weather, local, limbs };
  const lit = material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial;
  material.onBeforeCompile = sh => {
    detailCompile(sh);
    // (leaves and needles on cards, seen from either side: lit the same from both, not turned to face the ground from behind)
    if (cards) sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
    // (the rim: lit stuff only — a flat-coloured thing has no light to catch)
    // (and not on leaves and needles: cut out on cards facing every way, their edges caught it all and the woods went
    //  frosted blue-white at noon)
    if (lit && rim) sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", `{
        float rk = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += dRim * mix(diffuseColor.rgb, vec3(0.6), 0.35) * rk * rk * rk;
      }
      #include <opaque_fragment>`);
  };
  const detailCompile = sh => {
    sh.uniforms.dScale = { value: scale }; sh.uniforms.dAmount = { value: amount }; sh.uniforms.dNear = { value: seeThrough };
    sh.uniforms.dGrain = { value: grain }; sh.uniforms.dGround = { value: ground };
    sh.uniforms.dWet = WET; sh.uniforms.dSnow = snow ? SNOW : { value: 0 }; sh.uniforms.dSnowK = { value: typeof snow === "number" ? snow : 1 }; sh.uniforms.dAutoFull = AUTO_FULL; sh.uniforms.dRoof = ROOFED; sh.uniforms.dRoofSize = ROOFSIZE; sh.uniforms.dRelief = RELIEF; sh.uniforms.dWeather = { value: weather ? 1 : 0 };
    sh.uniforms.dRim = RIM;
    if (surface === "bark") { sh.uniforms.dNotchM = NOTCH_M; sh.uniforms.dNotchP = NOTCH_P; }
    sh.uniforms.dTexA = { value: detailTex[0] }; sh.uniforms.dTexB = { value: detailTex[1] }; sh.uniforms.dTexC = { value: detailTex[2] }; sh.uniforms.dTexCol = { value: colourTex };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDWorld; varying vec3 vDNormal; varying vec3 vDReal; varying vec3 vDTrunk;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        vec3 dn = objectNormal;
        // (the tree's own foot, and how big it's grown: for its lowest boughs, thinned when you stand in under them)
        vec4 dTr = vec4(0.0, 0.0, 0.0, 1.0); float dTs = length(modelMatrix[0].xyz);
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp; dn = mat3(instanceMatrix) * dn; dTr = instanceMatrix * dTr; dTs *= length(instanceMatrix[0].xyz);
        #endif
        // (a whole wood merged into one mesh sits at the world's origin, with no one tree's foot to go by: left out)
        bool dOne = length(modelMatrix[3].xz) > 0.01;
        #ifdef USE_INSTANCING
          dOne = true;
        #endif
        vDTrunk = vec3((modelMatrix * dTr).xz, dOne ? dTs : 0.0);
        vDReal = (modelMatrix * dwp).xyz;
        ${local ? "vDWorld = dwp.xyz * 2.0; vDNormal = normalize(dn);" : "vDWorld = vDReal; vDNormal = normalize(mat3(modelMatrix) * dn);"}`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDWorld; varying vec3 vDNormal; varying vec3 vDReal; varying vec3 vDTrunk; uniform vec3 dRim; uniform float dScale, dAmount, dGrain, dGround, dSnow, dAutoFull, dNear, dWet; uniform vec4 dRoof; uniform vec3 dRoofSize; uniform float dRelief, dWeather, dSnowK;" + (surface === "bark" ? "uniform mat4 dNotchM[4]; uniform vec4 dNotchP[4];" : "") + DETAIL_GLSL + SURF_GLSL + RELIEF_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float dHgt = 0.0, dHk = 0.0, dWetK = 0.0;
        ${surface === "bark" ? `for (int i = 0; i < 4; i++) if (dNotchP[i].w > 0.5) {
          vec3 q = (dNotchM[i] * vec4(vDReal, 1.0)).xyz; vec4 np = dNotchP[i];
          if (q.y > -0.004 && length(q.xz) < np.x * 1.6 && q.x - (np.x - np.y) >= q.y * np.y / np.z) discard;
        }` : ""}
        // leaves and needles right up against the eye (standing inside a tree) are gone, so you see out through them;
        // only a narrow edge a little further off thins away in a fine dither — a wide band of it, never quite clear,
        // laid a screen of dots over the whole view in among the trees
        ${limbs > 0 && local ? `if (length(vDWorld.xz) * 0.5 > ${limbs.toFixed(3)}) {
          float dd = distance(vDReal, cameraPosition), kNear = 1.0 - smoothstep(1.5, 2.25, dd);   // (just as far as the needles thin, or they go first and leave the poles)
          // (standing in under a tree — at its trunk with the axe — its lower boughs all round you go, the crown over your
          //  head kept: a screen of dots and dark needles filled the whole view while you felled a spruce)
          if (vDTrunk.z > 0.0) { float tIn = 1.0 - smoothstep(1.7, 2.6, distance(cameraPosition.xz, vDTrunk.xy) / vDTrunk.z); if (vDReal.y < cameraPosition.y + 1.6) kNear = max(kNear, tIn); }
          if (kNear >= 1.0) discard;
          if (kNear > 0.0) { ivec2 bq = ivec2(mod(gl_FragCoord.xy, 4.0)); float bm[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.); if ((bm[bq.x + bq.y * 4] + 0.5) / 16.0 < kNear) discard; }
        }` : ""}
        if (dNear > 0.0) {
          float dd = distance(vDReal, cameraPosition), kNear = 1.0 - smoothstep(dNear * 0.42, dNear * 0.6, dd);
          if (vDTrunk.z > 0.0) { float tIn = 1.0 - smoothstep(1.7, 2.6, distance(cameraPosition.xz, vDTrunk.xy) / vDTrunk.z); if (vDReal.y < cameraPosition.y + 1.6) kNear = max(kNear, tIn); }
          if (kNear >= 1.0) discard;
          if (kNear > 0.0) { ivec2 bq = ivec2(mod(gl_FragCoord.xy, 4.0)); float bm[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.); if ((bm[bq.x + bq.y * 4] + 0.5) / 16.0 < kNear) discard; }
        }
        {
          vec3 p = vDWorld * dScale;
          vec3 an = abs(vDNormal);
          // the real surface first
          int s = ${surf};
          if (s == -1) s = dAutoFull > 0.5 ? dClassify(diffuseColor.rgb, vDNormal) : dClassifySimple(diffuseColor.rgb);
          if (s == 10) { dRot = true; s = 0; }
          if (s == 9) {
            float gk; int L = dGroundL(diffuseColor.rgb, vDNormal, vDReal, gk);
            if (L < 0) s = 8;
            else { diffuseColor.rgb *= dGroundCol(L, gk, vDWorld, vDNormal, distance(vDReal, cameraPosition)); s = -2; }
          }
          if (s >= 0) {
            ${SURF_STRENGTH}
            vec3 w = pow(an, vec3(4.0)); w /= (w.x + w.y + w.z);
            float g = dSurf(s, vDWorld, w);
            // the surface's real colour pattern (courses, mortar, boards, stones), and the grain over it, gentler
            ${"float dColK[8] = float[8](0.9, 1.0, 1.0, 1.0, 0.9, 0.6, 0.8, 1.0);"}
            if (s < 8) {
              vec3 pc = dSurfCol(s, vDWorld, w);
              diffuseColor.rgb *= mix(vec3(1.0), pc, dColK[s] * (dRot ? 0.75 : 1.0));
              diffuseColor.rgb *= 1.0 + (g - 0.5) * 0.7 * dStrength[s];
            } else diffuseColor.rgb *= 1.0 + (g - 0.5) * 1.6 * dStrength[s];
            // (the same grain as relief, fading out with distance, where it would only shimmer)
            ${SURF_RELIEF}
            dHk = dDepth[s] * dRelief * (1.0 - smoothstep(18.0, 45.0, distance(vDReal, cameraPosition)));
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
              // and the wash itself never quite even: broad clouds of it paler and dingier, and its patches where it was mended
              float cl = dFbm(vDWorld * vec3(0.45, 0.8, 0.45) + 11.0);
              diffuseColor.rgb *= mix(vec3(1.05, 1.03, 0.99), vec3(0.86, 0.84, 0.8), smoothstep(0.35, 0.7, cl));
              float pa = step(0.78, dNoise(floor(vDWorld * vec3(1.6, 2.2, 1.6)) + 5.0));
              diffuseColor.rgb *= 1.0 + pa * 0.05;
              // plaster: rain streaks run down the walls from the eaves and the sills, and it greys toward the ground
              float st = dNoise(vec3(vDWorld.x * 5.0, vDWorld.y * 0.35, vDWorld.z * 5.0)) * dNoise(vDWorld * 0.6 + 3.1);
              diffuseColor.rgb *= 1.0 - smoothstep(0.22, 0.6, st) * 0.3 * side;
            }
            if (dWeather > 0.5 && (s == 2 || s == 3 || s == 7 || s == 8)) {
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
          // (and on a wall's foot the street's own dirt: splashed mud and the damp rising, darker and browner, its upper
          //  edge ragged, heaviest at the very bottom)
          if (dWeather > 0.5) {
            float edge = 0.55 + (dFbm(vDWorld * vec3(1.7, 0.4, 1.7) + 2.0) - 0.5) * 0.7;
            float foot = (1.0 - smoothstep(0.0, edge, vDWorld.y - dGround)) * (1.0 - an.y) * (1.0 - dSnow * 0.7);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.5, 0.42), foot * 0.65);
          }
          // rain: whatever is out under the sky darker for being wet, and what faces up sheened with it (not under the
          //  cabin's roof)
          if (dWet > 0.0 && dWeather > 0.5) {
            float roofed = 0.0;
            if (dRoof.w > 0.5 && vDWorld.y < dRoofSize.z) { vec2 wd = vDWorld.xz - dRoof.xy; float wc = cos(dRoof.z), ws = sin(dRoof.z); vec2 wl = vec2(wd.x * wc - wd.y * ws, wd.x * ws + wd.y * wc); if (abs(wl.x) < dRoofSize.x && abs(wl.y) < dRoofSize.y) roofed = 1.0; }
            float wk = dWet * (1.0 - roofed);
            diffuseColor.rgb *= 1.0 - 0.24 * wk;
            dWetK = wk * smoothstep(0.35, 0.9, vDNormal.y) * (0.55 + 0.45 * dNoise(vDWorld * 0.7));
          }
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
        // (where the grain is finer than the pixels that show it — bark on a bough seen edge-on, say — its slope from one
        //  pixel to the next is noise, not relief, and lit it is a glitter of white specks: there it fades out)
        { vec2 dhh = vec2(dFdx(dHgt), dFdy(dHgt)); float fw = abs(dhh.x) + abs(dhh.y);
          if (dHk > 0.0) normal = dPerturb(-vViewPosition, normal, dhh * dHk * (1.0 - smoothstep(0.04, 0.16, fw)), faceDirection); }`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (dNoise(vDWorld * dScale * 2.0) - 0.5) * 0.25, 0.04, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.32, dWetK);`);
  };
  // (and whatever else has been laid on this material — cloth, wear, weathered skin, bark: see addHook)
  { const dc = material.onBeforeCompile; material.onBeforeCompile = (sh, r) => { dc(sh, r); runHooks(material, sh, r); }; }
  material.customProgramCacheKey = () => "detail" + surf + (weather ? "" : "w") + (local ? "l" : "") + (rim ? "" : "r") + (cards ? "c" : "") + hookKey(material);
  material.needsUpdate = true;
  return material;
}

// a thing that moves through the world — what's in your hands, a tree as it falls — wears its grain in its own space,
// not the world's, or the grain would slide over it as it moves. (The same stuff, a copy of its material once.)
const OWN_GRAIN = new Map();
export function ownGrain(m) {
  if (!m || !m.userData || !m.userData.detail || m.userData.detail.local) return m;
  let c = OWN_GRAIN.get(m);
  if (!c) { c = m.clone(); c.color = m.color; if (m.emissive) c.emissive = m.emissive; addDetail(c, { ...m.userData.detail, local: true, snow: false }); inheritHooks(m, c); OWN_GRAIN.set(m, c); }
  return c;
}
// a tree's branches let go of close up (its bark, own-grained, copied once more with its limbs to thin away)
const LIMBS = new Map();
export function fadeLimbs(obj, r = 0.27) {
  obj.traverse(o => {
    const m = o.isMesh && o.material, d = m && m.userData && m.userData.detail;
    if (!d || d.surface !== "bark" || !d.local || d.limbs) return;
    let c = LIMBS.get(m);
    if (!c) { c = m.clone(); c.color = m.color; addDetail(c, { ...d, limbs: r }); inheritHooks(m, c); LIMBS.set(m, c); }
    o.material = c;
  });
}
export function ownGrainAll(obj) { obj.traverse(o => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(ownGrain) : ownGrain(o.material); }); }

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
// leaded glass, as every window in 1683 had: little diamond panes held in strips of lead, each pane a touch different
// (greenish, uneven, a bubble here and there). On the lit windows the candlelight shows through the panes and not the lead
export const LEADED = (() => {
  if (typeof document === "undefined") return null;
  const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S; const c = cv.getContext("2d"), R = rng(41);
  const nx = 5, ny = 7, w = S / nx, h = S / ny;
  for (let j = -1; j <= ny; j++) for (let i = -1; i <= nx; i++) for (const o of [0, 0.5]) {
    const x = (i + o) * w, y = (j + o) * h, v = 200 + Math.floor(R() * 55);
    c.fillStyle = `rgb(${v},${v},${Math.min(255, v + 6)})`;
    c.beginPath(); c.moveTo(x, y - h / 2); c.lineTo(x + w / 2, y); c.lineTo(x, y + h / 2); c.lineTo(x - w / 2, y); c.closePath(); c.fill();
    if (R() < 0.5) { c.fillStyle = "rgba(255,255,255,0.25)"; c.beginPath(); c.arc(x - w * 0.12, y - h * 0.12, 3 + R() * 5, 0, TAU); c.fill(); }
  }
  c.strokeStyle = "rgb(38,36,34)"; c.lineWidth = 5;
  for (let k = -nx - ny; k <= nx + ny; k++) {
    c.beginPath(); c.moveTo(k * w, 0); c.lineTo(k * w + S * w / h, S); c.stroke();
    c.beginPath(); c.moveTo(k * w, 0); c.lineTo(k * w - S * w / h, S); c.stroke();
  }
  c.lineWidth = 10; c.strokeRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
})();
if (LEADED) { MAT.lit.map = LEADED; MAT.lit.emissiveMap = LEADED; MAT.glass.map = LEADED; }
// (the dark windows of a street, built into one mesh with their own colours: the same leaded glass, catching the sky)
MAT.pane = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.25, map: LEADED });

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
      if (!c) { c = m.clone(); addDetail(c, { ...m.userData.detail, snow: false }); inheritHooks(m, c); _noSnow.set(m, c); }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  return obj;
}
// ---- what bright metal shows: the sky over it and the ground under it ----
// (with nothing to reflect, a metal draws black — an axe's head, a gun's lock, a pan were dark blocks even at noon.
//  One small sky, light above, the horizon paler, the earth dark below, tinted and dimmed by the hour (ENVK, set
//  in applyAtmo) so a blade at night isn't lit by a noon sky)
export const ENVK = { value: new THREE.Color(0.4, 0.42, 0.46) };
let _skyCube = null;
function skyCube() {
  if (_skyCube) return _skyCube;
  const face = (top, mid, bot) => {
    const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, top); g.addColorStop(0.48, mid); g.addColorStop(0.56, "#5a5248"); g.addColorStop(1, bot); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return c;
  };
  const side = () => face("#d8dee6", "#f2f2ee", "#2e2a24"), up = face("#e4e8ee", "#e4e8ee", "#e4e8ee"), dn = face("#262420", "#262420", "#262420");
  _skyCube = new THREE.CubeTexture([side(), side(), up, dn, side(), side()]);
  _skyCube.colorSpace = THREE.SRGBColorSpace; _skyCube.needsUpdate = true;
  return _skyCube;
}
// (how much of a metalness map is metal: a scanned bed or chest carries one that's black but for its nails — only
//  what is mostly metal, an axe's head, a pan, gets the sky; glTF keeps metalness in the blue)
const _metalShare = new WeakMap();
function metalShare(tex) {
  const img = tex && tex.image; if (!img || !img.width || typeof document === "undefined") return 1;
  if (_metalShare.has(img)) return _metalShare.get(img);
  let k = 1;
  try { const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data; let n = 0; for (let i = 2; i < d.length; i += 4) if (d[i] > 120) n++; k = n / 1024; } catch (e) {}
  _metalShare.set(img, k); return k;
}
export function shine(m) {
  if (!m || !m.isMeshStandardMaterial || m.envMap || (m.metalness || 0) < 0.15) return m;
  if (m.metalnessMap && metalShare(m.metalnessMap) < 0.06) return m;
  m.envMap = skyCube(); m.envMapIntensity = 1;
  return addHook(m, sh => {
    sh.uniforms.uEnvK = ENVK;
    // (once: a copy can run its source's hooks as well as its own)
    if (sh.fragmentShader.includes("uniform vec3 uEnvK;")) return;
    const tint = c => c.replace(/envMapColor\.rgb \* envMapIntensity/g, "envMapColor.rgb * envMapIntensity * uEnvK");
    sh.fragmentShader = "uniform vec3 uEnvK;\n" + (sh.fragmentShader.includes("#include <envmap_physical_pars_fragment>")
      ? sh.fragmentShader.replace("#include <envmap_physical_pars_fragment>", tint(THREE.ShaderChunk.envmap_physical_pars_fragment))
      : tint(sh.fragmentShader));
  }, "env");
}
export function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (!_mc[key]) {
    // (weather: false — no moss and weathering, for what's under the ground or indoors)
    const { surface, weather, ...o } = opts;
    _mc[key] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, ...o });
    if (!o.metalness) addDetail(_mc[key], { scale: 3, amount: 0.16, grain: 0.4, surface: surface || "auto", weather: weather !== false });
    else shine(_mc[key]);
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

// ---- a stone: weathered and rounded, lumpy, flat where it has settled into the ground; never a die with twelve faces ----
// (a handful of shapes made once, each a unit across, and handed out scaled: radius r, and the shape picked by seed. Each
//  carries "shade", the stone's own light and dark — cracks and hollows darker, the tops paler — which the Builder
//  multiplies into whatever colour it is given, and a material with vertexColors reads directly as its "color")
const ROCKS = [];
function rockShape(seed) {
  const R = rng(1000 + seed * 77);
  let g = new THREE.IcosahedronGeometry(1, 3); g.deleteAttribute("normal"); g.deleteAttribute("uv"); g = mergeVertices(g);
  const p = g.attributes.position, n = p.count, sh = new Float32Array(n), col = new Float32Array(n * 3);
  // (a few broad lumps and flats, then finer knobs: sums of waves in random directions, which is enough for a stone)
  const waves = []; for (let i = 0; i < 13; i++) { const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(); waves.push([d, i < 3 ? 1.3 + R() : i < 6 ? 3 + R() * 2 : i < 9 ? 7 + R() * 4 : 13 + R() * 6, R() * TAU, i < 3 ? 0.16 : i < 6 ? 0.07 : i < 9 ? 0.026 : 0.012]); }
  const cuts = []; for (let i = 0, nc = 2 + Math.floor(R() * 3); i < nc; i++) cuts.push([new THREE.Vector3(R() - 0.5, (R() - 0.3) * 0.8, R() - 0.5).normalize(), 0.7 + R() * 0.2]);
  const sx = 0.85 + R() * 0.35, sz = 0.85 + R() * 0.35, sy = 0.62 + R() * 0.2, v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1, crev = 0;
    for (const [d, f, ph, a] of waves) { const w = Math.sin(v.dot(d) * f + ph); k += w * a; if (a < 0.06) crev += (a < 0.02 ? Math.abs(w) - 0.6 : w) * a; }
    // (one or two flat faces, where it split; and sat flat on the ground below)
    k = Math.min(k, 1.02 + 0.05 * Math.sin(v.x * 2 + seed));
    // (and faces where it split: cut flat across, so it has edges and a shape to it, not an egg's)
    for (const [d, o] of cuts) { const t = v.dot(d) * k; if (t > o) k -= (t - o) / Math.max(0.2, v.dot(d)); }
    let y = v.y * k * sy; if (y < -0.3 * sy) y = -0.3 * sy + (y + 0.3 * sy) * 0.15;
    p.setXYZ(i, v.x * k * sx, y, v.z * k * sz);
    const t = 1.0 + crev * 5 + (v.y > 0 ? v.y * 0.12 : v.y * 0.2) + (R() - 0.5) * 0.06;
    sh[i] = t; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = t;
  }
  g.setAttribute("shade", new THREE.BufferAttribute(sh, 1)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // (a little uv from where it faces, so a detailed material's grain lies on it rather than smearing)
  const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = p.getX(i) + p.getZ(i) * 0.5; uv[i * 2 + 1] = p.getY(i) + p.getZ(i) * 0.5; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
export function rockGeo(r = 1, seed) {
  if (!ROCKS.length) for (let i = 0; i < 6; i++) ROCKS.push(rockShape(i));
  const i = seed == null ? Math.floor(Math.random() * ROCKS.length) : ((Math.floor(seed) % ROCKS.length) + ROCKS.length) % ROCKS.length;
  return ROCKS[i].clone().scale(r, r, r);
}

export class Builder {
  constructor() { this.parts = []; this.objects = []; }
  // (a whole model alongside the merged pieces — a real barrel, a real table — set at its place, and carried by the
  //  mesh this builds)
  object(o, x = 0, y = 0, z = 0, ry = 0, s = 1) { o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); this.objects.push(o); return this; }
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
    const shade = g.attributes.shade;
    for (let i = 0; i < n; i++) { const k = shade ? shade.getX(i) : 1; c[i * 3] = _col.r * k; c[i * 3 + 1] = _col.g * k; c[i * 3 + 2] = _col.b * k; }
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
    for (const o of this.objects) { o.traverse(c => { if (c.isMesh) { c.castShadow = shadow; c.receiveShadow = receive; } }); m.add(o); }
    this.objects = [];
    return m;
  }
  get empty() { return this.parts.length === 0 && this.objects.length === 0; }
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

// a model's footing: the extent, in `frame`'s own space, of every face of it that stands across a person's waist
// height (y = h) — walls and posts, not the roof over them nor the steps before them; big low-poly walls have their
// corners only at the floor and the eaves, so their corners alone (in a band) would miss them
export function footingOf(root, frame, h = 1.0) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(), M = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const take = v => { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); };
  root.traverse(o => {
    const g = o.isMesh && !o.isInstancedMesh && o.visible && o.geometry, p = g && g.attributes.position; if (!p) return;
    M.multiplyMatrices(inv, o.matrixWorld);
    const ix = g.index, n = ix ? ix.count : p.count;
    for (let i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(M); b.fromBufferAttribute(p, ix ? ix.getX(i + 1) : i + 1).applyMatrix4(M); c.fromBufferAttribute(p, ix ? ix.getX(i + 2) : i + 2).applyMatrix4(M);
      const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
      if (lo > h || hi < h) continue;
      take(a); take(b); take(c);
    }
  });
  return x1 > x0 && z1 > z0 ? { x0, x1, z0, z1 } : null;
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
    const ext = o.type === "box" ? o : o.type === "obox" ? o.bb : { x0: o.x - o.r, x1: o.x + o.r, z0: o.z - o.r, z1: o.z + o.r };
    const x0 = Math.floor(ext.x0 / c), x1 = Math.floor(ext.x1 / c), z0 = Math.floor(ext.z0 / c), z1 = Math.floor(ext.z1 / c);
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
  // (how far down a thing is solid: to well under the ground it stands on — however low that ground is — but not so far
  //  that it reaches a cave beneath it)
  addBox(x0, z0, x1, z1, y1 = 10, y0 = Math.min(-5, y1 - 40), tag) {
    return this.insert({ type: "box", x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, tag });
  }
  // a box given by centre and size
  addRect(cx, cz, w, d, y1 = 10, y0 = Math.min(-5, y1 - 40), tag) { return this.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y1, y0, tag); }
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
  // a box turned to any angle (a building set down square to the way you faced): centre, half its width and depth,
  // and its turn about the upright
  addOBox(x, z, hw, hd, ry = 0, y1 = 10, y0 = Math.min(-5, y1 - 40), tag) {
    const c = Math.cos(ry), s = Math.sin(ry), ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
    return this.insert({ type: "obox", x, z, c, s, hw, hd, y0, y1, tag, bb: { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez } });
  }
  addCircle(x, z, r, y1 = 10, tag) { return this.insert({ type: "circle", x, z, r, y0: Math.min(-5, y1 - 40), y1, tag }); }
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
      } else if (o.type === "obox") {
        // (into the box's own frame — x along its width, z along its depth — pushed out there, and back)
        const wx = p.x - o.x, wz = p.z - o.z, lx = wx * o.c - wz * o.s, lz = wx * o.s + wz * o.c, pad = npc && o.npcPad || 0;
        const cx = clamp(lx, -o.hw - pad, o.hw + pad), cz = clamp(lz, -o.hd - pad, o.hd + pad);
        let dx = lx - cx, dz = lz - cz, nx = lx, nz = lz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = cx + dx / d * r; nz = cz + dz / d * r; }
          else { const ox = o.hw + pad - Math.abs(lx), oz = o.hd + pad - Math.abs(lz); if (ox < oz) nx = Math.sign(lx || 1) * (o.hw + pad + r); else nz = Math.sign(lz || 1) * (o.hd + pad + r); }
          p.x = o.x + nx * o.c + nz * o.s; p.z = o.z - nx * o.s + nz * o.c;
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
      else if (o.type === "obox") { const wx = x - o.x, wz = z - o.z; if (Math.abs(wx * o.c - wz * o.s) < o.hw + pad && Math.abs(wx * o.s + wz * o.c) < o.hd + pad) return true; }
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
      if (o.type !== "box" && o.type !== "obox") continue;
      // slab test on the segment (a turned box: in its own frame)
      let t0 = 0, t1 = 1;
      const slab = (p, d, lo, hi) => {
        if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
        let u = (lo - p) / d, v = (hi - p) / d;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
        return t0 <= t1;
      };
      if (o.type === "obox") {
        const ax = a.x - o.x, az = a.z - o.z, lx = ax * o.c - az * o.s, lz = ax * o.s + az * o.c, ldx = dx * o.c - dz * o.s, ldz = dx * o.s + dz * o.c;
        if (slab(lx, ldx, -o.hw, o.hw) && slab(a.y, dy, o.y0, o.y1) && slab(lz, ldz, -o.hd, o.hd) && t1 > 0.001 && t0 < 0.999) return false;
        continue;
      }
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
      // the shape: not one cone but three tongues from a common root, each its own height and sway, licking up, thinning
      //  and tearing off into loose wisps near the top, bent by the turbulence
      const du = u + (turb - 0.5) * 0.6 * v;
      let k = 0;
      for (let t = 0; t < 3; t++) {
        const c = (t - 1) * 0.32 * (0.35 + v) + Math.sin(ang + t * 2.1) * 0.08 * v, ht = t === 1 ? 1 : 0.62 + 0.22 * Math.sin(ang * (t + 1) + t);
        if (v > ht) continue;
        const vt = v / ht, wv = (t === 1 ? 0.5 : 0.34) * Math.pow(1 - vt, 0.6) + 0.03;
        k = Math.max(k, Math.exp(-Math.pow((du - c) / wv, 2) * 1.7) * Math.pow(1 - vt, 0.3));
      }
      k *= 0.42 + turb * 1.15 - v * 0.6;
      // (the torn-off wisps: above the body of the flame, only where the finer noise runs strong)
      k += Math.max(0, n2 - 0.62) * 2.2 * Math.max(0, v - 0.45) * Math.exp(-Math.pow(du / 0.45, 2));
      k = Math.max(0, Math.min(1.2, k * 1.55 - 0.12));
      // (nothing at a frame's very edges, so no frame bleeds into the next)
      k *= Math.min(1, v / 0.05) * Math.min(1, (1 - v) / 0.08) * Math.min(1, (1 - Math.abs(u)) / 0.08);
      const o = ((oy + j) * cv.width + ox + i) * 4;
      // white-gold at the heart, orange, then deep red as it thins
      d[o] = Math.min(255, 255 * Math.min(1, k * 2.2));
      d[o + 1] = Math.min(255, 255 * Math.max(0, Math.min(1, k * 1.5 - 0.25)));
      // (and at the very root, where the wood gives off its gas, a thin blue)
      const root = Math.max(0, 0.16 - v) / 0.16 * Math.exp(-u * u * 3) * Math.min(1, k * 3);
      d[o + 2] = Math.min(255, 255 * (Math.max(0, k - 0.75) * 2.4 + root * 0.55));
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
// (every fire made, so the cold can ask which are near: see temperature.js)
export const FLAMES = new Set();
export function makeFlame(size = 1, light = null) {
  const F = flameParts(), g = new THREE.Group();
  g.userData.heat = size; FLAMES.add(g);
  // the faces of the flame: a tall one in the middle, and smaller ones about it, each at its own place in the film
  const faces = [];
  const n = size >= 4 ? 9 : size >= 2 ? 6 : size >= 0.8 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const map = F.film.clone(); map.repeat.set(0.25, 0.25);
    // (many flames over a big fire add up where they overlap: each fainter, or their roots burn out to a white blot)
    const m = new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true, opacity: n > 4 ? 0.55 : n > 3 ? 0.8 : 1 });
    const sp = new THREE.Sprite(m); sp.center.set(0.5, 0.04); sp.renderOrder = 2;
    const main = i === 0, a = i / n * Math.PI * 2 + Math.random();
    const w = (main ? 0.24 : 0.12 + Math.random() * 0.08) * size, h = (main ? 0.5 : 0.24 + Math.random() * 0.2) * size;
    // (a big fire burns along its wood, not from one point: its flames spread over the bed, lower toward the edge)
    const rr = main ? 0 : (n > 4 ? 0.035 + Math.random() * 0.06 : 0.05) * size;
    sp.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
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
  // the bed of coals under a proper fire: glowing through the ash, hot spots shifting and pulsing, darker at the rim
  let coals = null;
  if (size >= 2) {
    const cm = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `varying vec2 vUv; uniform float uT, uK;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vUv * 9.0;
          float a = n(p + vec2(uT * 0.11, -uT * 0.07)) * 0.6 + n(p * 2.3 - vec2(uT * 0.17, uT * 0.05)) * 0.4;
          float hot = smoothstep(0.42, 0.85, a), edge = smoothstep(0.5, 0.18, length(vUv - 0.5));
          float ash = smoothstep(0.55, 0.75, n(p * 4.1 + 11.0));
          float pulse = 0.72 + 0.28 * sin(uT * 2.3 + a * 9.0);
          vec3 col = mix(vec3(0.5, 0.05, 0.0), vec3(1.0, 0.5, 0.12), hot) * hot * edge * pulse * (1.0 - ash * 0.7) * uK;
          gl_FragColor = vec4(col, 1.0);
        }` });
    coals = new THREE.Mesh(new THREE.CircleGeometry(0.095 * size, 24), cm); coals.rotation.x = -Math.PI / 2; coals.position.y = 0.015; coals.renderOrder = 1; g.add(coals);
  }
  // smoke, over a proper fire
  const smoke = [];
  // (and a thinner, darker trail off a torch's pitch or a small fire)
  if (size >= 1.2) for (let i = 0, ns = size >= 2 ? 7 : 4; i < ns; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.smokeTex, color: size >= 2 ? 0x9a948a : 0x5a5650, transparent: true, depthWrite: false, opacity: 0, fog: true }));
    m.userData = { t: i / ns, rot: (Math.random() - 0.5) * 0.6, col: m.material.color.clone() }; m.renderOrder = 1; g.add(m); smoke.push(m);
  }
  g.userData.flame = { faces, glow, sparks, smoke, coals, size, t: Math.random() * 10, light, base: light ? light.intensity : 0 };
  if (light) { light.position.y = 0.25 * size; g.add(light); }
  return g;
}
// (a fire under the open sky by day: the sun drowns its light, and the grass round it isn't washed yellow — set from the
//  sun's strength in applyAtmo; a flame marked dayDim takes it, a hearth indoors doesn't)
export const FIREDAY = { k: 1, sky: 1 };
// smoke, steam and dust drawn as sprites take no light of their own: seen by the daylight there is (SKYLIT, set with the
// hour in applyAtmo), so a battle's powder smoke at night is a dark drift, not a glowing white cloud
export const SKYLIT = { value: 1 };
export function skyLit(m) {
  return addHook(m, sh => { sh.uniforms.uSkyLit = SKYLIT; sh.fragmentShader = "uniform float uSkyLit;\n" + sh.fragmentShader.replace("outgoingLight = diffuseColor.rgb;", "outgoingLight = diffuseColor.rgb * uSkyLit;"); }, "skylit");
}   // (sky: how much daylight there is to see smoke by)
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
  if (f.coals) { f.coals.visible = !!f.light ? f.base > 0.001 : true; f.coals.material.uniforms.uT.value = f.t; f.coals.material.uniforms.uK.value = lit ? 1 : 0.35; }
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
    m.material.opacity = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.22;
    m.material.rotation = u.rot * t * 3;
    // (smoke is seen by the light there is: grey by day, near black by night but where the fire under it lights it)
    if (u.col) m.material.color.copy(u.col).multiplyScalar(Math.max(FIREDAY.sky, (1 - t) * (lit ? 0.5 : 0)));
  }
  if (f.light) f.light.intensity = f.base * (0.8 + (k - 0.85) * 2.5) * (f.dayDim ? FIREDAY.k : 1);
}
