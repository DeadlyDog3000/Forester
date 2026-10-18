// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE LOOK OF IT: the world is drawn first into a picture of its own, in full light, and then finished as a painter
// would: the brightest things (a fire, a lit window, the sun on snow) given a soft glow round them; the light brought
// down into the screen's range the filmic way; the darkest shadows lifted a little and cooled, so a shadow is shade and
// not a hole; the highlights warmed; the corners darkened a touch; and a faint grain over all of it. (Cinematic shading,
// in the settings; the Performance preset goes without.)
import { THREE, renderer } from "./core.js";
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export const post = { on: true, failed: false, ao: true, dof: 0, focus: 10 };

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
const scene2 = new THREE.Scene(); scene2.add(quad);
const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// the bright parts, at a quarter of the size: only what is brighter than the day around it glows
const brightM = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.9 } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold;
    void main() {
      vec3 c = vec3(0.0);
      for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += texture2D(tSrc, vUv + vec2(i, j) * texel).rgb;
      c /= 9.0;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c * smoothstep(threshold, threshold * 2.2, l), 1.0);
    }`,
});
// a soft blur, one way at a time
const blurM = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 dir;
    void main() {
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
      c += (texture2D(tSrc, vUv + dir * 1.3846153846).rgb + texture2D(tSrc, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
      c += (texture2D(tSrc, vUv + dir * 3.2307692308).rgb + texture2D(tSrc, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
// the sun's shafts: the bright sky about the sun kept (what stands in front of it is dark, and so cuts it), then drawn
// out toward the sun in a long radial smear — the light through the trees, the smoke and the ranks
const rayMaskM = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, sun: { value: new THREE.Vector2(0.5, 0.5) }, aspect: { value: 1 }, threshold: { value: 0.9 } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 sun; uniform float aspect, threshold;
    void main() {
      vec3 c = texture2D(tSrc, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float d = length((vUv - sun) * vec2(aspect, 1.0));
      gl_FragColor = vec4(c * smoothstep(threshold, threshold * 1.8, l) * (1.0 - smoothstep(0.05, 0.75, d)), 1.0);
    }`,
});
const rayBlurM = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, sun: { value: new THREE.Vector2(0.5, 0.5) }, len: { value: 0.5 } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 sun; uniform float len;
    void main() {
      vec2 d = (sun - vUv) * len / 28.0; vec2 p = vUv; vec3 c = vec3(0.0); float w = 1.0, ws = 0.0;
      for (int i = 0; i < 28; i++) { c += texture2D(tSrc, p).rgb * w; ws += w; w *= 0.955; p += d; }
      gl_FragColor = vec4(c / ws, 1.0);
    }`,
});
// ---- the shade where things meet: under a man's feet, in a wall's corner, between the gabions — ambient occlusion,
// worked out from the depth of the picture at half its size: a dozen points round each, and how much of the open sky
// above it the surfaces near it take away. Fading out with distance, as the haze takes the detail. ----
const DEPTH = `uniform sampler2D tDepth; uniform float cNear, cFar; uniform vec2 tanF;
  float lin(float d) { return cNear * cFar / (cFar - d * (cFar - cNear)); }
  float zAt(vec2 uv) { return lin(texture2D(tDepth, uv).x); }
  vec3 vpos(vec2 uv, float z) { return vec3((uv * 2.0 - 1.0) * tanF * z, -z); }`;
const aoM = new THREE.ShaderMaterial({
  uniforms: { tDepth: { value: null }, cNear: { value: 0.05 }, cFar: { value: 900 }, tanF: { value: new THREE.Vector2(1, 1) }, texel: { value: new THREE.Vector2() }, radius: { value: 0.9 }, power: { value: 1.6 }, seed: { value: 0 } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform vec2 texel; uniform float radius, power, seed; ${DEPTH}
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float d0 = texture2D(tDepth, vUv).x;
      if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      float z = lin(d0); vec3 P = vpos(vUv, z);
      if (z > 90.0) { gl_FragColor = vec4(1.0); return; }
      // (the surface's facing, from its neighbours — the nearer of each pair, so an edge doesn't bend it)
      vec3 pl = vpos(vUv - vec2(texel.x, 0.0), zAt(vUv - vec2(texel.x, 0.0))), pr = vpos(vUv + vec2(texel.x, 0.0), zAt(vUv + vec2(texel.x, 0.0)));
      vec3 pd = vpos(vUv - vec2(0.0, texel.y), zAt(vUv - vec2(0.0, texel.y))), pu = vpos(vUv + vec2(0.0, texel.y), zAt(vUv + vec2(0.0, texel.y)));
      vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl, dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
      vec3 N = normalize(cross(dx, dy));
      float rpx = radius / (z * tanF.y), a0 = hash(vUv * 731.0 + seed) * 6.2831, occ = 0.0;
      for (int i = 0; i < 12; i++) {
        float f = (float(i) + 0.5) / 12.0, ang = a0 + float(i) * 2.39996;
        vec2 suv = vUv + vec2(cos(ang), sin(ang)) * rpx * f * 0.5;
        vec3 Q = vpos(suv, zAt(suv)), v = Q - P; float vv = dot(v, v), vl = sqrt(vv);
        if (vl < 0.004 * z) continue;
        occ += max(0.0, dot(v / vl, N) - 0.12) * (1.0 - smoothstep(radius * 0.7, radius * 1.4, vl));
      }
      float ao = clamp(1.0 - occ / 12.0 * 2.5, 0.0, 1.0);
      ao = pow(ao, power);
      // (gone into the distance)
      ao = mix(ao, 1.0, smoothstep(40.0, 90.0, z));
      gl_FragColor = vec4(ao, z, 0.0, 1.0);
    }`,
});
// its blur: across and then down, never across an edge in depth (a man's shade doesn't bleed onto the field behind him)
const aoBlurM = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 dir;
    void main() {
      vec2 c0 = texture2D(tSrc, vUv).xy; float s = c0.x, w = 1.0;
      for (int i = -3; i <= 3; i++) { if (i == 0) continue;
        vec2 c = texture2D(tSrc, vUv + dir * float(i)).xy; float k = exp(-float(i * i) / 6.0) * (1.0 - smoothstep(0.02, 0.08, abs(c.y - c0.y) / max(c0.y, 0.1)));
        s += c.x * k; w += k; }
      gl_FragColor = vec4(s / w, c0.y, 0.0, 1.0);
    }`,
});
// a softened copy of the picture, at half its size: what's out of focus, in the films (the opening, the replays)
const downM = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 texel;
    void main() { vec3 c = texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, 1.0)).rgb; gl_FragColor = vec4(c * 0.25, 1.0); }`,
});
// and the finish
const finalM = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, tBloom: { value: null }, tRays: { value: null }, exposure: { value: 1 }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) },
    tAO: { value: null }, aoK: { value: 0 }, tSoft: { value: null }, dofK: { value: 0 }, focus: { value: 10 }, tDepth: { value: null }, cNear: { value: 0.05 }, cFar: { value: 900 }, tanF: { value: new THREE.Vector2(1, 1) }, fogCol: { value: new THREE.Color() },
    bloom: { value: 0.4 }, lift: { value: 1 }, grain: { value: 0.016 }, vignette: { value: 0.16 }, rays: { value: 0 }, rayCol: { value: new THREE.Color(1, 0.85, 0.6) }, sharp: { value: 0.35 }, fringe: { value: 0.0012 } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tScene, tBloom, tRays, tAO, tSoft; uniform float exposure, time, bloom, lift, grain, vignette, rays, sharp, fringe, aoK, dofK, focus; uniform vec3 rayCol, fogCol; uniform vec2 res; ${DEPTH}
    vec3 postRRTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 postAces(vec3 color) {
      const mat3 pIn = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 pOut = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= exposure / 0.6; color = pIn * color; color = postRRTFit(color); color = pOut * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      // (there was a lens's faint colour fringe toward the corners here, the red and the blue a hair apart: it split the
      //  fine dither of leaves thinned against the sky, right up against the eye, into purple smears — gone)
      vec2 px = 1.0 / res;
      vec3 n4 = texture2D(tScene, vUv + vec2(px.x, 0.0)).rgb + texture2D(tScene, vUv - vec2(px.x, 0.0)).rgb + texture2D(tScene, vUv + vec2(0.0, px.y)).rgb + texture2D(tScene, vUv - vec2(0.0, px.y)).rgb;
      vec3 c = texture2D(tScene, vUv).rgb;
      // (sharpened as much as the anti-aliasing softened it, less where the edge is already hard — no halos)
      vec3 edge = c - n4 * 0.25;
      c = max(c + edge * sharp / (1.0 + abs(edge) * 6.0), 0.0);
      // the shade where things meet (darkening toward the shade's own colour, not toward black: it's light kept out)
      if (aoK > 0.0) { float ao = texture2D(tAO, vUv).x; c *= mix(1.0, ao, aoK); }
      // out of focus, in a film: nearer or further than what the eye is on, softened by how far it is from it
      if (dofK > 0.0) {
        // (a long lens's gentle falloff: what's near the subject stays sharp, only what's well off it goes soft, and never
        //  all the way)
        float z = zAt(vUv), coc = clamp(abs(z - focus) / max(focus * 2.2, 6.0), 0.0, 1.0);
        c = mix(c, texture2D(tSoft, vUv).rgb, smoothstep(0.3, 1.0, coc) * dofK * 0.75);
      }
      c += texture2D(tBloom, vUv).rgb * bloom + texture2D(tRays, vUv).rgb * rayCol * rays;
      c = postAces(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // the light warmed, a touch
      c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.96), smoothstep(0.45, 1.0, l));
      // a little more colour where there is colour
      c = mix(vec3(l), c, 1.08);
      c = toSRGB(clamp(c, 0.0, 1.0));
      // the deepest shade lifted a little and cooled, as it looks on screen: shade, not a hole in the picture
      float ls = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += vec3(0.016, 0.019, 0.026) * lift * (1.0 - smoothstep(0.0, 0.3, ls));
      // the corners in shadow, and a grain over all of it
      float d = length((vUv - 0.5) * vec2(res.x / res.y, 1.0));
      c *= 1.0 - vignette * smoothstep(0.35, 1.0, d);
      c += (hash(vUv * res + time) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
});

post.u = finalM.uniforms;
let rt = null, bA = null, bB = null, rA = null, rB = null, aA = null, aB = null, sA = null, sB = null;
const size = new THREE.Vector2();
function ensure() {
  renderer.getDrawingBufferSize(size);
  if (rt && rt.width === size.x && rt.height === size.y) return;
  for (const t of [rt, bA, bB, rA, rB, aA, aB, sA, sB]) if (t) t.dispose();
  const o = { type: THREE.HalfFloatType, depthBuffer: false };
  rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  // (its depth kept, to read: for the shade where things meet, and for focus)
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y); rt.depthTexture.type = THREE.UnsignedIntType;
  const hw = Math.max(1, size.x >> 1), hh = Math.max(1, size.y >> 1);
  aA = new THREE.WebGLRenderTarget(hw, hh, o); aB = new THREE.WebGLRenderTarget(hw, hh, o);
  sA = new THREE.WebGLRenderTarget(hw, hh, o); sB = new THREE.WebGLRenderTarget(hw, hh, o);
  const bw = Math.max(1, size.x >> 2), bh = Math.max(1, size.y >> 2);
  bA = new THREE.WebGLRenderTarget(bw, bh, o); bB = new THREE.WebGLRenderTarget(bw, bh, o);
  rA = new THREE.WebGLRenderTarget(bw, bh, o); rB = new THREE.WebGLRenderTarget(bw, bh, o);
}
function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(scene2, cam2); }

// draw the frame: through the finish if it is on (and works here), straight to the screen if not
export function renderFrame(scene, camera) {
  if (!post.on || post.failed) { renderer.render(scene, camera); return; }
  try {
    ensure();
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    brightM.uniforms.tSrc.value = rt.texture; brightM.uniforms.texel.value.set(1 / size.x * 2, 1 / size.y * 2); pass(brightM, bA);
    blurM.uniforms.tSrc.value = bA.texture; blurM.uniforms.dir.value.set(1 / bA.width, 0); pass(blurM, bB);
    blurM.uniforms.tSrc.value = bB.texture; blurM.uniforms.dir.value.set(0, 1 / bA.height); pass(blurM, bA);
    // the sun's shafts, when it's in front of you and not too high (they show best low: morning, evening)
    const u = finalM.uniforms, sd = post.sunDir;
    let rk = 0;
    if (sd && post.sunI > 0.2) {
      _v.copy(camera.position).addScaledVector(sd, 500).project(camera);
      const fwd = camera.getWorldDirection(_f).dot(sd), sx = (_v.x + 1) / 2, sy = (_v.y + 1) / 2;
      const onScr = 1 - Math.min(1, Math.max(0, Math.max(Math.abs(_v.x), Math.abs(_v.y)) - 1) * 1.5);
      rk = Math.max(0, fwd) ** 2 * onScr * Math.min(1, post.sunI / 1.5) * (0.55 + 0.45 * (1 - Math.min(1, Math.max(0, sd.y) / 0.6)));
      if (rk > 0.01) {
        rayMaskM.uniforms.tSrc.value = rt.texture; rayMaskM.uniforms.sun.value.set(sx, sy); rayMaskM.uniforms.aspect.value = size.x / size.y; rayMaskM.uniforms.threshold.value = 0.9 * Math.max(0.5, renderer.toneMappingExposure); pass(rayMaskM, rA);
        rayBlurM.uniforms.sun.value.set(sx, sy);
        rayBlurM.uniforms.tSrc.value = rA.texture; rayBlurM.uniforms.len.value = 0.9; pass(rayBlurM, rB);
        rayBlurM.uniforms.tSrc.value = rB.texture; rayBlurM.uniforms.len.value = 0.35; pass(rayBlurM, rA);
      }
    }
    u.rays.value = rk * 0.55; u.tRays.value = rA.texture; if (post.sunC) u.rayCol.value.copy(post.sunC);
    // the depth, and what's worked out from it
    const tf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    for (const m of [aoM, finalM]) { m.uniforms.tDepth.value = rt.depthTexture; m.uniforms.cNear.value = camera.near; m.uniforms.cFar.value = camera.far; m.uniforms.tanF.value.set(tf * camera.aspect, tf); }
    if (post.ao) {
      aoM.uniforms.texel.value.set(1 / aA.width, 1 / aA.height); aoM.uniforms.seed.value = 0; pass(aoM, aA);
      aoBlurM.uniforms.tSrc.value = aA.texture; aoBlurM.uniforms.dir.value.set(1 / aA.width, 0); pass(aoBlurM, aB);
      aoBlurM.uniforms.tSrc.value = aB.texture; aoBlurM.uniforms.dir.value.set(0, 1 / aA.height); pass(aoBlurM, aA);
    }
    u.aoK.value = post.ao ? 1 : 0; u.tAO.value = aA.texture;
    // (focus eased toward where it's told, so a cut doesn't snap the blur about)
    post.dofNow = (post.dofNow || 0) + ((post.dof || 0) - (post.dofNow || 0)) * 0.08;
    if (post.dofNow > 0.01) {
      downM.uniforms.tSrc.value = rt.texture; downM.uniforms.texel.value.set(1 / size.x, 1 / size.y); pass(downM, sA);
      blurM.uniforms.tSrc.value = sA.texture; blurM.uniforms.dir.value.set(1.6 / sA.width, 0); pass(blurM, sB);
      blurM.uniforms.tSrc.value = sB.texture; blurM.uniforms.dir.value.set(0, 1.6 / sA.height); pass(blurM, sA);
      u.focus.value += ((post.focus || 10) - u.focus.value) * 0.15;
    }
    u.dofK.value = post.dofNow > 0.01 ? post.dofNow : 0; u.tSoft.value = sA.texture;
    u.tScene.value = rt.texture; u.tBloom.value = bA.texture; u.exposure.value = renderer.toneMappingExposure;
    u.time.value = (performance.now() % 100000) / 1000; u.res.value.set(size.x, size.y);
    pass(finalM, null);
  } catch (e) {
    // a machine that can't: back to the plain way, for good
    console.warn("Reckoning: cinematic shading isn't available here", e);
    post.failed = true; renderer.setRenderTarget(null); renderer.render(scene, camera);
  }
}
// (for the tests: what each stage holds at the middle of the picture)
export function postProbe() {
  const px = (t, w, h) => { const b = new Uint16Array(4); try { renderer.readRenderTargetPixels(t, w >> 1, h >> 1, 1, 1, b); } catch (e) { return String(e.message); } return Array.from(b).map(v => +THREE.DataUtils.fromHalfFloat(v).toFixed(3)); };
  return { size: [size.x, size.y], rt: rt && px(rt, rt.width, rt.height), bloom: bA && px(bA, bA.width, bA.height), gl: renderer.getContext().getError() };
}
