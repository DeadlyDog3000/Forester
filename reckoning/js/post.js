// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE LOOK OF IT: the world is drawn first into a picture of its own, in full light, and then finished as a painter
// would: the brightest things (a fire, a lit window, the sun on snow) given a soft glow round them; the light brought
// down into the screen's range the filmic way; the darkest shadows lifted a little and cooled, so a shadow is shade and
// not a hole; the highlights warmed; the corners darkened a touch; and a faint grain over all of it. (Cinematic shading,
// in the settings; the Performance preset goes without.)
import { THREE, renderer } from "./core.js";

export const post = { on: true, failed: false };

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
// and the finish
const finalM = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, tBloom: { value: null }, exposure: { value: 1 }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) },
    bloom: { value: 0.4 }, lift: { value: 1 }, grain: { value: 0.016 }, vignette: { value: 0.16 } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tScene, tBloom; uniform float exposure, time, bloom, lift, grain, vignette; uniform vec2 res;
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
      vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
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
let rt = null, bA = null, bB = null;
const size = new THREE.Vector2();
function ensure() {
  renderer.getDrawingBufferSize(size);
  if (rt && rt.width === size.x && rt.height === size.y) return;
  for (const t of [rt, bA, bB]) if (t) t.dispose();
  const o = { type: THREE.HalfFloatType, depthBuffer: false };
  rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const bw = Math.max(1, size.x >> 2), bh = Math.max(1, size.y >> 2);
  bA = new THREE.WebGLRenderTarget(bw, bh, o); bB = new THREE.WebGLRenderTarget(bw, bh, o);
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
    const u = finalM.uniforms;
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
