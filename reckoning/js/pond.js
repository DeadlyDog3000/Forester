// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The pond at the edge of the deer ride: still brown-green water holding the sky,
// stirred by the wind and pocked by the rain, a fringe of rushes round it, lily
// pads, and a pair of ducks paddling about that make off when you come close.
// It freezes over in winter.

import { THREE, clamp } from "./core.js";
import { G, vm } from "./engine.js";
import { UI } from "./ui.js";
import { ITEM } from "./body.js";
import { AUDIO } from "./audio.js";
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
    // ---- fishing: a float out on the water off the shore nearest you; hold F, watch it, and wait for it to go under ----
    const fl2 = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8301e, roughness: 0.5 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.5 }));
    const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0xe8e0c8 })); quill.position.y = 0.05;
    fl2.add(top, bot, quill); fl2.visible = false; g.add(fl2); this.float = fl2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 16), new THREE.MeshBasicMaterial({ color: 0xc0c8d0, transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; g.add(ring); this.ring = ring;
    // ripples: rings spreading on the water behind a paddling duck, round your legs as you wade, where a fish rises
    const RN2 = 28, rgeo = new THREE.RingGeometry(0.85, 1, 20); rgeo.rotateX(-Math.PI / 2);
    this.rip = new THREE.InstancedMesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xc8d0d8, transparent: true, opacity: 0.32, depthWrite: false }), RN2);
    this.rip.frustumCulled = false; this.ripT = new Float32Array(RN2).fill(1); this.ripP = new Float32Array(RN2 * 3); this.ripN = 0;
    g.add(this.rip);
    this.fishIt = w.addInteract({ x: POND.x, y: L, z: POND.z, reach: 4.6, hold: 6 + Math.random() * 5,
      label: () => this.frozen ? "The pond is frozen over" : "Fish — hold F, and wait for the float to go under",
      can: () => !this.frozen && G.mode === "play" && !G.player.horse,
      onHoldTick: (dt, t) => this.fishing(dt, t),
      use: () => this.landed() });
    // (you can wade the margin, but not out into the middle, where it's over your head)
    const rr = Math.min(...Array.from({ length: 24 }, (_, i) => pondR(i / 24 * Math.PI * 2)));
    w.col.addCircle(POND.x, POND.z, rr * 0.62, L + 3);
  }
  // how likely a fish is to take, now: best at dawn and dusk, slow at midday, poorer still at night; a little better in rain
  odds() {
    const t = G.town, f = t ? t.frac : 0.4;
    let k = f < 0.12 || (f > 0.55 && f < 0.72) ? 0.75 : f > 0.74 || f < 0.04 ? 0.3 : 0.45;
    if ((this.w.rainK || 0) > 0.2) k += 0.1;
    if (t && t.season === "autumn") k += 0.05;
    return Math.min(0.9, k);
  }
  // the rod in your hands while you fish (the axe or whatever else put by), and the line from its tip to the float
  rod(on) {
    const pl = G.player;
    if (on && !this.rodG) {
      const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.8 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.016, 2.3, 6), wood); pole.position.y = 1.15; g.add(pole);
      const tip = new THREE.Object3D(); tip.position.y = 2.3; g.add(tip);
      // (your hand round the butt of it, and your sleeve)
      const look = (pl.model && pl.model.look) || {};
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), new THREE.MeshStandardMaterial({ color: look.skin ?? 0xe8c4a0, roughness: 0.6 })); fist.scale.set(1.1, 1.35, 1); fist.position.set(0, 0.16, 0.012); g.add(fist);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.9 })); cuff.position.set(0.0, 0.08, 0.012); g.add(cuff);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.32, 8), new THREE.MeshStandardMaterial({ color: look.coat ?? 0x2e3a2c, roughness: 0.95 })); sleeve.position.set(0.0, -0.13, 0.012); g.add(sleeve);
      g.position.set(0.22, -0.38, -0.32); g.rotation.set(-1.05, 0.12, -0.1);
      this.rodG = g; this.rodTip = tip;
      const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xd8d4c8, transparent: true, opacity: 0.7 })); this.line.frustumCulled = false;
    }
    if (!this.rodG) return;
    if (on && !this.rodG.parent) { vm.add(this.rodG); this.g.add(this.line); G.fishing = true; }
    if (!on && this.rodG.parent) { vm.remove(this.rodG); this.g.remove(this.line); G.fishing = false; }
  }
  fishing(dt, t) {
    const it = this.fishIt, f = this.float;
    if (!f.visible) { f.visible = true; this.bite = Math.random() < this.odds(); this.ringT = 0; f.position.set(it.x, this.w.pondLevel, it.z); this.rod(true); }
    // (the float rides the water; now and then a nibble dips it; at the end, if one has taken, it goes right under)
    const end = t > it.hold - 0.6, nib = Math.sin(t * 7.3) > 0.97 || (this.bite && t > it.hold * 0.6 && Math.sin(t * 11) > 0.9);
    f.position.y = this.w.pondLevel + Math.sin(this.t * 2.1) * 0.006 - (nib ? 0.025 : 0) - (end && this.bite ? 0.08 : 0);
    if (nib && this.ringT <= 0) this.ringT = 1;
  }
  landed() {
    const f = this.float, it = this.fishIt;
    f.visible = false; this.rod(false);
    it.hold = 6 + Math.random() * 6;
    if (this.bite) {
      if (G.packAdd("fish", 1, ITEM.fish.name, ITEM.fish.note) > 0) UI.hint(["A perch — striped, and fighting all the way in.", "A good perch. Into the pack with it.", "A little one. It'll fry."][Math.floor(Math.random() * 3)], 3);
      this.ringT = 1;
      G.town && G.town.persist();
    } else UI.hint(["Nothing. The bait's gone — a clever one down there.", "A nibble, and nothing. Try again.", "Not a touch. They're not biting just now."][Math.floor(Math.random() * 3)], 2.5);
    this.bite = false;
  }
  ripple(x, z, size = 1) {
    const i = this.ripN; this.ripN = (i + 1) % this.ripT.length;
    this.ripT[i] = 0; this.ripP[i * 3] = x; this.ripP[i * 3 + 1] = size; this.ripP[i * 3 + 2] = z;
  }
  // is x, z in the water, and how deep
  depthAt(x, z) { return pondK(x, z) < 1 ? Math.max(0, this.w.pondLevel - this.w.heightAt(x, z)) : 0; }
  update(dt) {
    this.t += dt;
    // the fishing spot: out on the water, off the bit of shore nearest you
    const pp = G.player && G.player.pos;
    // (the first time you come to it, the guide's page on it)
    if (pp && !this.told && Math.hypot(pp.x - POND.x, pp.z - POND.z) < POND.r + 9 && G.mode === "play") { this.told = true; G.guide && G.guide("pond"); }
    if (pp && this.fishIt) {
      const a = Math.atan2(pp.z - POND.z, pp.x - POND.x), r = pondR(a) * 0.82;
      this.fishIt.x = POND.x + Math.cos(a) * r; this.fishIt.z = POND.z + Math.sin(a) * r; this.fishIt.y = this.w.pondLevel + 0.1;
      if (this.float.visible && (G.interactTarget !== this.fishIt || G.holdT <= 0)) { this.float.visible = false; this.rod(false); }
      // (the line, from the rod's tip down to the float)
      if (this.line && this.line.parent && this.rodTip) {
        const a2 = this.line.geometry.attributes.position, v = new THREE.Vector3();
        this.rodTip.getWorldPosition(v); this.g.worldToLocal(v); a2.setXYZ(0, v.x, v.y, v.z);
        const fp = this.float.position; a2.setXYZ(1, fp.x, fp.y + 0.09, fp.z); a2.needsUpdate = true;
      }
    }
    // the ripples spreading and fading; and new ones where something moves through the water
    { const M = this._m || (this._m = new THREE.Matrix4()), L0 = this.w.pondLevel + 0.012;
      for (let i = 0; i < this.ripT.length; i++) {
        if (this.ripT[i] >= 1) { M.makeScale(0, 0, 0); this.rip.setMatrixAt(i, M); continue; }
        this.ripT[i] = Math.min(1, this.ripT[i] + dt / 1.8);
        const k = this.ripT[i], r = (0.1 + k * 0.9) * this.ripP[i * 3 + 1];
        M.makeScale(r, 1, r).setPosition(this.ripP[i * 3], L0, this.ripP[i * 3 + 2]);
        if (k > 0.6) M.scale(new THREE.Vector3(1 + (k - 0.6), 1, 1 + (k - 0.6)));
        this.rip.setMatrixAt(i, M);
      }
      this.rip.instanceMatrix.needsUpdate = true;
      this.rip.material.opacity = 0.2;
      // (wading: rings round your legs as you go)
      const pl = G.player;
      if (pl && pl.wading > 0.05 && pl.speed > 0.4 && (this.wadeT = (this.wadeT || 0) - dt) <= 0) { this.wadeT = 0.35; this.ripple(pl.pos.x, pl.pos.z, 0.8); }
    }
    if (this.ringT > 0) { this.ringT -= dt * 1.2; const k = 1 - this.ringT; this.ring.position.set(this.float.position.x, this.w.pondLevel + 0.01, this.float.position.z); this.ring.scale.setScalar(0.05 + k * 0.5); this.ring.material.opacity = 0.4 * this.ringT; } else this.ring.material.opacity = 0;
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
    this.frozen = !!ice; this.rip.visible = !ice;
    // (frogs at dusk and into the night, spring and summer; and the ducks talking now and then, by day)
    const ft = town ? town.frac : 0.4, warm = town && (town.season === "spring" || town.season === "summer");
    if (pp && Math.hypot(pp.x - POND.x, pp.z - POND.z) < 55) {
      if (!ice && warm && (ft > 0.55 || ft < 0.05) && (w.rainK || 0) < 0.6 && Math.random() < dt / 2.5) { const a = Math.random() * 6.283, r = pondR(a) * 0.95; AUDIO.frog && AUDIO.frog({ x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r }); }
      if (!ice && ft > 0.06 && ft < 0.7 && Math.random() < dt / 9) { const dk = this.ducks[Math.floor(Math.random() * 2)]; if (dk.m.visible) AUDIO.quack && AUDIO.quack({ x: dk.x, z: dk.z }); }
    }
    // (a fish rising, out in the middle, now and then — more at dusk)
    if (!ice && Math.random() < dt * (this.odds() * 0.12)) { const a = Math.random() * 6.283, r = pondR(a) * Math.random() * 0.7; this.ripple(POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r, 0.6); }
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
      // (a wake behind a duck that's going somewhere; a ring where one dabbles)
      if ((dk.sp > 0.15 || (up && Math.random() < dt * 2)) && (dk.wakeT = (dk.wakeT || 0) - dt) <= 0) { dk.wakeT = dk.flee ? 0.25 : 0.6; this.ripple(dk.x - Math.sin(dk.yaw) * 0.15, dk.z - Math.cos(dk.yaw) * 0.15, 0.5 + dk.sp * 0.4); }
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
