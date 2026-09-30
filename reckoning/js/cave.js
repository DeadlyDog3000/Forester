// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE CAVES: a mouth in a hillside out in the forest, and behind it a great warren of chambers and tunnels,
// dark but for your lantern and a few old torches — thick with copper, tin and iron. Sometimes a band of
// raiders has made its camp down there. The caves lie far off the map, under the ground as it were: the
// forest's heightAt asks the cave for its floor while you are in it.
import { THREE, mat, MAT, rng, TAU, makeFlame, camera } from "./core.js";
import { G, Actor } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeArm, makeTorch } from "./models.js";
import { CLEARING } from "./woods.js";

// where the caves are laid out (well away from everything), and how fine the ground is made
const O = { x: 1500, z: -1500 }, CELL = 1.5, BASE = -60;

export class Caves {
  constructor(w, seed = 41) {
    this.w = w; this.inside = false;
    const r = rng(seed);
    // the chambers: a winding chain with branches off it, each a great round hall
    const halls = [{ x: 0, z: 0, r: 11 }];
    let a = 0, x = 0, z = 0;
    for (let i = 1; i < 9; i++) {
      a += (r() - 0.5) * 1.6; const d = 26 + r() * 14;
      x += Math.cos(a) * d; z += Math.sin(a) * d;
      halls.push({ x, z, r: 10 + r() * 9, from: i - 1 });
    }
    for (const k of [2, 4, 6]) {
      const h = halls[k], b = a + (r() < 0.5 ? 1 : -1) * (1.2 + r()), d = 24 + r() * 10;
      halls.push({ x: h.x + Math.cos(b) * d, z: h.z + Math.sin(b) * d, r: 9 + r() * 6, from: k });
    }
    this.halls = halls.map(h => ({ ...h, x: h.x + O.x, z: h.z + O.z }));
    this.tunnels = this.halls.filter(h => h.from != null).map(h => ({ a: this.halls[h.from], b: h, r: 2.4 + r() * 1.4 }));
    const xs = this.halls.map(h => [h.x - h.r - 4, h.x + h.r + 4]).flat(), zs = this.halls.map(h => [h.z - h.r - 4, h.z + h.r + 4]).flat();
    this.b = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    this.r = r;
    // (the forest asks the cave for its floor from here on: the rocks laid in it must stand on that floor)
    w.cave = this;
    this.build();
  }
  holds(x, z) { return x > this.b.x0 && x < this.b.x1 && z > this.b.z0 && z < this.b.z1; }
  // how far inside the caves a point is (negative: in the rock)
  sd(x, z) {
    let best = -Infinity;
    for (const h of this.halls) best = Math.max(best, h.r - Math.hypot(x - h.x, z - h.z));
    for (const t of this.tunnels) {
      const dx = t.b.x - t.a.x, dz = t.b.z - t.a.z, l = dx * dx + dz * dz, k = Math.max(0, Math.min(1, ((x - t.a.x) * dx + (z - t.a.z) * dz) / l));
      best = Math.max(best, t.r - Math.hypot(x - t.a.x - dx * k, z - t.a.z - dz * k));
    }
    return best;
  }
  floorAt(x, z) { return BASE + Math.sin(x * 0.13) * 0.35 + Math.cos(z * 0.11) * 0.35 + Math.sin((x - z) * 0.05) * 0.8; }
  build() {
    const w = this.w, B = this.b, nx = Math.ceil((B.x1 - B.x0) / CELL) + 1, nz = Math.ceil((B.z1 - B.z0) / CELL) + 1, r = this.r;
    const X = i => B.x0 + i * CELL, Z = j => B.z0 + j * CELL;
    const sd = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) sd[i + j * nx] = this.sd(X(i), Z(j));
    const root = this.root = new THREE.Group();
    // the floor and the roof, as two sheets over the same grid: the roof comes down to meet the floor at the walls
    const mk = roof => {
      const pos = [], col = [], idx = [], at = new Int32Array(nx * nz).fill(-1);
      const vert = (i, j) => {
        const k = i + j * nx; if (at[k] >= 0) return at[k];
        const x = X(i), z = Z(j), s = sd[k], f = this.floorAt(x, z);
        const h = roof ? (s > 0 ? f + 2.9 + Math.min(9, s * 0.75) + (r() - 0.5) * 0.9 : f + Math.max(-0.4, s * 0.8)) : f;
        pos.push(x, h, z);
        const g = roof ? 0.36 + r() * 0.1 : 0.44 + r() * 0.08;
        col.push(g * 1.05, g, g * 0.92);
        return at[k] = pos.length / 3 - 1;
      };
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const k = i + j * nx, m = Math.max(sd[k], sd[k + 1], sd[k + nx], sd[k + nx + 1]);
        if (m < (roof ? -2.5 : -0.2)) continue;
        const a = vert(i, j), b2 = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
        if (roof) idx.push(a, b2, c, b2, d, c); else idx.push(a, c, b2, b2, c, d);
      }
      let geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo = geo.toNonIndexed(); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: roof ? THREE.DoubleSide : THREE.FrontSide }));
      m.receiveShadow = true;
      return m;
    };
    root.add(mk(false), mk(true));
    w.root.add(root);
    // the walls, to walk against: a post in every cell of rock that borders the open cave
    this.cols = [];
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = i + j * nx; if (sd[k] > 0) continue;
      // (reaching down to the cave's own floor, far under the forest's)
      if (sd[k + 1] > 0 || sd[k - 1] > 0 || sd[k + nx] > 0 || sd[k - nx] > 0) { const o = w.col.addCircle(X(i), Z(j), CELL * 0.75, BASE + 20); o.y0 = BASE - 20; this.cols.push(o); }
    }
    // stalagmites, here and there
    for (let i = 0; i < 70; i++) {
      const h = this.halls[Math.floor(r() * this.halls.length)], a = r() * TAU, d = r() * h.r * 0.85, x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      if (this.sd(x, z) < 2) continue;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.25 + r() * 0.35, 0.8 + r() * 1.8, 5), mat(0x4a4640, { roughness: 1 }));
      s.position.set(x, this.floorAt(x, z) + 0.5, z); root.add(s);
    }
    // the ore: plenty of it, deeper halls richer
    this.rocks = [];
    this.halls.forEach((h, n) => {
      if (n === 0) return;
      const many = 2 + Math.floor(r() * 3);
      for (let k = 0; k < many; k++) {
        const a = r() * TAU, d = h.r * (0.3 + r() * 0.45), x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
        if (this.sd(x, z) < 2.5) continue;
        const kind = r() < 0.15 ? "stone" : ["copper", "tin", "iron"][Math.floor(r() * 3)];
        if (w.makeRock) this.rocks.push(w.makeRock(kind, x, z));
      }
    });
    // old torches in iron brackets along the way: the only light but yours
    this.lights = [];
    for (const h of this.halls.filter((_, n) => n % 3 === 1)) {
      const x = h.x + h.r * 0.7, z = h.z, L = new THREE.PointLight(0xff9a4a, 10, 20, 1.5);
      const f = makeFlame(0.9, L); f.position.set(x, this.floorAt(x, z) + 1.8, z); root.add(f); this.lights.push(f);
      if (w.flames) w.flames.push(f);
    }
    // the way in, and back out: the first hall
    const h0 = this.halls[0];
    this.start = { x: h0.x, z: h0.z + 4 };
    const exit = { x: h0.x, z: h0.z - h0.r + 2.5 };
    const shaft = new THREE.PointLight(0xdfe8ff, 16, 16, 1.3); shaft.position.set(exit.x, this.floorAt(exit.x, exit.z) + 5, exit.z); root.add(shaft);
    this.outIt = w.addInteract({ x: exit.x, y: this.floorAt(exit.x, exit.z) + 1.2, z: exit.z, reach: 2.8, label: "Climb out, into the daylight", use: () => this.leave() });
    root.visible = false;
  }
  // ---- the mouth, out in the forest: a heap of rock round a black opening ----
  mouth(x, z, ry) {
    const w = this.w, y = w.heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    w.clearScenery && w.clearScenery(x + Math.sin(ry) * 2, z + Math.cos(ry) * 2, 7);
    const rock = new THREE.MeshStandardMaterial({ color: 0x6a665e, roughness: 1, flatShading: true });
    // the hill it goes into: a low mound of earth and moss behind
    const mound = new THREE.Mesh(new THREE.SphereGeometry(7, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a5a32, roughness: 1, flatShading: true }));
    mound.scale.set(1, 0.62, 0.9); mound.position.set(0, -0.3, -8.2); mound.receiveShadow = true; g.add(mound);
    // an arch of rock: two jambs, a lintel across, and rubble either side
    for (const [px, py, pz, s] of [[-1.9, 1.1, 0.2, 1.1], [1.9, 1.1, 0.2, 1.1], [-2.1, 2.4, -0.2, 0.9], [2.1, 2.4, -0.2, 0.9], [0, 3.35, 0, 1.25], [-1.1, 3.2, -0.4, 0.9], [1.1, 3.2, -0.4, 0.9], [-3.2, 0.5, -0.6, 1.0], [3.2, 0.5, -0.6, 1.0], [-2.6, 3.0, -1.6, 1.4], [2.6, 3.0, -1.6, 1.4], [0, 4.2, -1.8, 1.6]]) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rock); m.position.set(px, py, pz); m.rotation.set(px * 1.3, pz + 0.4, py); m.castShadow = true; g.add(m);
    }
    // the passage: black, going back and down into the hill
    const dark = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.7, 2.2), new THREE.MeshBasicMaterial({ color: 0x040302, side: THREE.BackSide }));
    dark.position.set(0, 1.35, -1.05); g.add(dark);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.6), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    face.position.set(0, 1.3, -2.1); g.add(face);
    w.root.add(g);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [lx, lz, rr] of [[-2.0, 0.2, 1.0], [2.0, 0.2, 1.0], [0, -3.2, 1.6], [-3.2, -0.6, 1.0], [3.2, -0.6, 1.0], [-3, -3.5, 2.4], [3, -3.5, 2.4], [0, -6, 3]]) w.col.addCircle(x + lx * c + lz * s, z - lx * s + lz * c, rr, y + 5);
    const fx = x + Math.sin(ry) * 1.6, fz = z + Math.cos(ry) * 1.6;
    this.mouthAt = { x: fx, z: fz, ry };
    this.inIt = w.addInteract({ x: fx, y: y + 1.3, z: fz, reach: 2.6, label: "Go down into the cave", use: () => this.enter() });
    return g;
  }
  enter() {
    const pl = G.player; if (this.inside) return;
    this.inside = true; this.root.visible = true; this._entering = true;
    UI.fade(1, 0.5).then(() => {
      pl.place(this.start.x, this.start.z, Math.PI); this._entering = false;
      if (pl.horse) pl.dismount();
      this.lantern = this.lantern || new THREE.PointLight(0xffc48a, 9, 20, 1.7);
      camera.add(this.lantern);
      this.bandits();
      UI.fade(0, 0.8);
      G.guide && G.guide("cave");
      if (!this.told) { this.told = true; UI.hint("The cave. Copper, tin and iron in the rock all through it — and it goes a long way back. Mind the dark.", 6); }
    });
    AUDIO.step && AUDIO.step("stone", 0.8);
  }
  leave() {
    const pl = G.player; if (!this.inside) return;
    UI.fade(1, 0.5).then(() => {
      this.inside = false; this.root.visible = false;
      if (this.lantern && this.lantern.parent) this.lantern.parent.remove(this.lantern);
      for (const b of this.band || []) b.a.remove(); this.band = [];
      const m = this.mouthAt; pl.place(m.x + Math.sin(m.ry) * 1.2, m.z + Math.cos(m.ry) * 1.2, m.ry + Math.PI);
      if (G.sky) G.sky.visible = true; G.reAtmo && G.reAtmo();
      UI.fade(0, 0.8);
    });
  }
  // the dark: every frame down here, whatever the time of day outside
  tick(dt) {
    if (!this.inside) return;
    // (brought out some other way — beaten down, and woken in your bed): the cave lets you go
    if (!this.holds(G.player.pos.x, G.player.pos.z) && !this._entering) {
      this.inside = false; this.root.visible = false;
      if (this.lantern && this.lantern.parent) this.lantern.parent.remove(this.lantern);
      for (const b of this.band || []) b.a.remove(); this.band = [];
      G.sky && (G.sky.visible = true); G.reAtmo && G.reAtmo(); return;
    }
    for (const b of this.band || []) b.tick(dt);
  }
  dark() {
    G.sun.intensity = 0; G.hemi.intensity = 0.32; G.hemi.color.setHex(0x6a6258); G.hemi.groundColor.setHex(0x1a1612);
    G.scene.fog.color.setHex(0x0c0a08); G.scene.fog.near = 6; G.scene.fog.far = 55;
    if (G.sky) G.sky.visible = false;
  }
  // now and then, raiders have made their camp down here: a fire in a far hall, and three or four of them round it
  bandits() {
    this.band = [];
    if (Math.random() > 0.45) return;
    const far = this.halls.slice(3), h = far[Math.floor(Math.random() * far.length)];
    const fire = makeFlame(1.6, new THREE.PointLight(0xff8a3a, 12, 18, 1.5)); fire.position.set(h.x, this.floorAt(h.x, h.z) + 0.1, h.z); this.root.add(fire);
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, x = h.x + Math.cos(a) * 3, z = h.z + Math.sin(a) * 3;
      this.band.push(new Bandit(this, x, z, i));
    }
  }
  // your stroke: a bandit in front of you takes it
  swing(pl) {
    if (!this.inside) return false;
    const f = pl.forward();
    for (const b of this.band || []) {
      if (b.down) continue;
      const dx = b.a.pos.x - pl.pos.x, dz = b.a.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * f.x + dz * f.z) / d > 0.5) { b.hurt(20 + Math.random() * 10); AUDIO.clang && AUDIO.clang(0.5, b.a.pos); G.practise && G.practise("strength", 0.6); return true; }
    }
    return false;
  }
}

// a raider camped in the caves: sits by his fire until he sees you, then comes for you
class Bandit {
  constructor(cave, x, z, i) {
    this.cave = cave; this.hp = 70; this.cool = 1; this.down = false; this.woke = false;
    this.a = new Actor({ model: "townsman", name: "Raider", coat: [0x3a3228, 0x2e3228, 0x40302a][i % 3], legs: 0x2a2620, hat: ["cap", "hat", null][i % 3], hatColor: 0x241e1a, beard: 0x3e3226, seed: 900 + i }, x, z, 0);
    this.arm = ["axe", "club", "sword", "knife"][i % 4];
    this.a.hold(makeArm(this.arm)); this.a.heavy = true;
  }
  tick(dt) {
    if (this.down) return;
    const pl = G.player, a = this.a, d = Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z);
    if (!this.woke && d < 15) { this.woke = true; AUDIO.voice && AUDIO.voice("war", { at: a.pos }); UI.hint("Raiders — they've made their camp down here!", 3); }
    if (!this.woke) return;
    this.cool -= dt;
    if (d > 1.6) { if (!a.path.length || (this.re = (this.re || 0) - dt) <= 0) { this.re = 0.6; a.walkTo(pl.pos.x, pl.pos.z, 3.4); } return; }
    a.path = []; a.faceTo(pl.pos.x, pl.pos.z);
    if (this.cool <= 0) {
      this.cool = 1.2 + Math.random() * 0.5;
      a.person.setPose("chop"); setTimeout(() => a.person && a.person.setPose("idle"), 350);
      if (Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) < 2.1) {
        const dmg = { axe: 17, club: 14, sword: 19, knife: 10 }[this.arm] * (0.8 + Math.random() * 0.4);
        G.hurt(pl.guard ? dmg * 0.3 : dmg, "raider");
      }
      AUDIO.whoosh && AUDIO.whoosh(0.4, true);
    }
  }
  hurt(n) {
    this.hp -= n;
    if (this.hp > 0) { AUDIO.voice && AUDIO.voice("pain", { at: this.a.pos }); return; }
    this.down = true; this.a.lying = true; this.a.path = [];
    AUDIO.voice && AUDIO.voice("fear", { at: this.a.pos });
    // what he had on him
    const dm = 4 + Math.floor(Math.random() * 10);
    G.body.purse = (G.body.purse || 0) + dm; G.body.dirty = true;
    UI.hint(`He's down. ${dm} DM in his purse — yours now.`, 3);
  }
}
