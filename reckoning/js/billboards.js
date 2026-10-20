// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// MANY SOFT THINGS IN ONE DRAW: the powder smoke of a battle's volleys and the flashes at the muzzles were each a sprite
// of their own — hundreds on the field at once, each drawn by itself, and a volley of a whole company was a hitch you
// felt. Here they are one: a quad for each, facing the eye, its place, size, turn, tint and see-through its own, its
// picture a cell of one sheet; sorted back to front before they're drawn (the smoke; the flashes, adding light, needn't
// be). A puff is a small object that looks enough like a sprite — position, scale, material.opacity and .rotation,
// userData, parent — that the smoke's own code moves it as it did before.

import { THREE } from "./core.js";

const VS = `
attribute vec4 iPos;   // where it is, and how big
attribute vec4 iCol;   // its tint, and how see-through
attribute vec2 iRot;   // its turn on the screen, and which cell of the sheet
uniform vec2 uGrid;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(iPos.xyz, 1.0);
  float c = cos(iRot.x), s = sin(iRot.x);
  vec2 p = position.xy * iPos.w;
  mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * mvPosition;
  vec2 cell = vec2(mod(iRot.y, uGrid.x), floor(iRot.y / uGrid.x));
  vUv = (uv + cell) / uGrid; vCol = iCol;
  #include <fog_vertex>
}`;
const FS = `
uniform sampler2D map;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// one of them: as like a sprite as the smoke's code needs
class Puff {
  constructor(pool, tile, color) {
    this.pool = pool; this.parent = pool.root; this.visible = true; this.tile = tile;
    this.position = new THREE.Vector3(); this.scale = new THREE.Vector3(1, 1, 1); this.userData = {};
    this.material = { opacity: 1, rotation: 0, color: new THREE.Color(color ?? 0xffffff), dispose() {} };
  }
}

export class Billboards {
  // root: what it's in (the world's root, as the sprites were); tex: the sheet; grid: its cells, across and down
  constructor(root, tex, { grid = [1, 1], additive = false, order = 2 } = {}) {
    this.root = root; this.list = []; this.cap = 0; this.additive = additive;
    const g = this.geo = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute("position", q.attributes.position); g.setAttribute("uv", q.attributes.uv);
    this.grow(128);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uGrid: { value: new THREE.Vector2(grid[0], grid[1]) } }]) });
    this.mat.uniforms.map.value = tex;
    const m = this.mesh = new THREE.Mesh(g, this.mat); m.frustumCulled = false; m.renderOrder = order; m.userData.billboards = this;
    root.add(m); POOLS.add(this);
  }
  // (written as the scene is about to be drawn — before anything of it goes to the graphics card — with the eye that's
  //  drawing it: sorted from it, farthest first)
  // a world put away: its pools let go (one with smoke still in it was kept, the whole of its world with it)
  static drop(root) { for (const b of POOLS) { let o = b.mesh; while (o && o !== root) o = o.parent; if (o === root) POOLS.delete(b); } }
  static install(scene) {
    if (!scene || scene.__billboards) return; scene.__billboards = true;
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (r, s, cam, rt) => { if (prev) prev(r, s, cam, rt); for (const b of POOLS) { let o = b.mesh; while (o.parent) o = o.parent; if (o === s) b.write(cam); else if (!b.list.some(p => !p.dead)) POOLS.delete(b); } };
  }
  grow(n) {
    this.cap = n; const g = this.geo;
    for (const [k, w] of [["iPos", 4], ["iCol", 4], ["iRot", 2]]) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * w), w); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); }
    g.instanceCount = 0;
  }
  add(tile = 0, color = 0xffffff) { const p = new Puff(this, tile, color); this.list.push(p); return p; }
  remove(p) { p.parent = null; p.dead = true; }
  write(cam) {
    const L = this.list = this.list.filter(p => !p.dead); if (L.length > this.cap) this.grow(Math.max(L.length, this.cap * 2));
    if (!this.additive && cam) { const c = cam.getWorldPosition(_v); for (const p of L) p._d = p.position.distanceToSquared(c); L.sort((a, b) => b._d - a._d); }
    const P = this.geo.attributes.iPos, Cc = this.geo.attributes.iCol, Rr = this.geo.attributes.iRot;
    let n = 0;
    for (const p of L) {
      const a = p.visible ? p.material.opacity : 0; if (a <= 0.002) continue;
      const col = p.material.color;
      P.array.set([p.position.x, p.position.y, p.position.z, p.scale.x], n * 4);
      Cc.array.set([col.r, col.g, col.b, a], n * 4);
      Rr.array[n * 2] = p.material.rotation; Rr.array[n * 2 + 1] = p.tile; n++;
    }
    this.geo.instanceCount = n;
    P.needsUpdate = Cc.needsUpdate = Rr.needsUpdate = true;
    P.addUpdateRange(0, n * 4); Cc.addUpdateRange(0, n * 4); Rr.addUpdateRange(0, n * 2);
  }
}
const _v = new THREE.Vector3(), POOLS = new Set();
