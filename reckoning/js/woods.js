// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The old woods, far from Hamburg: a road that goes on long enough to leave
// the bells behind, and at the end of it a clearing with a burned cabin.

import { THREE, Builder, Collision, MAT, mat, rng, prismGeo, makeFlame, TAU, clamp, addDetail, groundTexture } from "./core.js";
import { WorldBase, G } from "./engine.js";
import { P, forestInstances, makeSpruce, TREE, modelCopy } from "./models.js";
import { grassTexture } from "./hamburg.js";
import { INK, TREEC, TOWN, tree, road, label } from "./map.js";

// the road out of the city winds: round hills, round bogs, round other people's land
const ROAD_PTS = [[0, 30], [0, 10], [9, -16], [24, -38], [18, -62], [-4, -78], [-24, -98], [-30, -124], [-14, -146], [10, -154], [28, -172],
  [24, -198], [4, -212], [-14, -230], [-12, -252], [4, -266], [20, -276], [30, -290]];
// where other tracks leave it: t is how far along the road, side is -1 left / 1 right (flipped if it would cross back)
export const FORKS = [
  { t: 0.07, side: 1, sign: ["Lübeck", "Altona"] },
  { t: 0.17, side: -1, sign: ["Lübeck", "Wandsbek"] },
  { t: 0.29, side: 1, sign: ["Lübeck", "Bergedorf"] },
  { t: 0.42, side: -1 },
  { t: 0.61, side: 1 },
  { t: 0.72, side: -1 },
  { t: 0.83, side: 1 },
];
export const CLEARING = { x: 34, z: -318, r: 23 };
export const CABIN = { x: 36, z: -325, ry: 0.35 };
const STACK = { x: 28.5, z: -321.5 };
const BLOCK = { x: 41.5, z: -316 };
const FIRE = { x: 33.5, z: -311.5 };

export class Woods extends WorldBase {
  constructor() {
    super(Collision);
    this.col = new Collision(6);
    this.name = "woods";
    const root = this.root, r = rng(3071);

    // the road, as a smooth curve sampled into points
    const curve = new THREE.CatmullRomCurve3(ROAD_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    this.road = curve.getSpacedPoints(700).map(v => ({ x: v.x, z: v.z }));
    this.roadLen = curve.getLength();
    // the forks: tracks that leave the road, bend away, and peter out in the trees
    this.branches = FORKS.map((f, n) => {
      const k = Math.floor(f.t * (this.road.length - 1));
      const a = this.road[k], b = this.road[Math.min(this.road.length - 1, k + 4)];
      const dl = Math.hypot(b.x - a.x, b.z - a.z) || 1, fx = (b.x - a.x) / dl, fz = (b.z - a.z) / dl;
      const make = side => {
        const rx = -fz * side, rz = fx * side;           // to that side
        const pts = [[a.x, a.z]];
        let dx = fx * 0.55 + rx * 0.84, dz = fz * 0.55 + rz * 0.84;
        let x = a.x, z = a.z;
        for (const [len, turn] of [[12, 0.15], [18, 0.2], [18, -0.1], [16, 0.12]]) {
          const c = Math.cos(turn * side), s = Math.sin(turn * side);
          [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
          x += dx * len; z += dz * len; pts.push([x, z]);
        }
        return pts;
      };
      // the track must not wander back to the road further on
      const far = pts => Math.min(...pts.slice(2).map(([x, z]) => Math.min(...this.road.filter((_, i) => Math.abs(i - k) > 30).map(p => Math.hypot(p.x - x, p.z - z)))));
      let pts = make(f.side);
      if (far(pts) < 22) { const o = make(-f.side); if (far(o) > far(pts)) { pts = o; f.side = -f.side; } }
      const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
      const sp = c.getSpacedPoints(60).map(v => ({ x: v.x, z: v.z }));
      return { fork: f, n, k, at: a, pts: sp, dir: { x: fx, z: fz } };
    });

    // ---- terrain ----
    const size = 760, seg = 190;
    const tg = new THREE.PlaneGeometry(size, size, seg, seg);
    tg.rotateX(-Math.PI / 2);
    tg.translate(10, 0, -150);
    const pos = tg.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // tints over the photographed forest floor: a little greener in the hollows, a little paler on the rises
    const cA = new THREE.Color(0xe6e8d4), cB = new THREE.Color(0xc4ccb0), cRoad = new THREE.Color(0xc8b89a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      const d = this.anyRoadDist(x, z).d;
      const c = cA.clone().lerp(cB, (Math.sin(x * 0.05) * Math.cos(z * 0.04) + 1) / 2);
      if (d < 2.5) c.lerp(cRoad, clamp((2.5 - d) / 1.5, 0, 1) * 0.35);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    tg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    tg.computeVertexNormals();
    const gt = groundTexture("forestfloor", 150);
    const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 1 }));
    terrain.receiveShadow = true;
    root.add(terrain);

    const bEnd = this.branches[3].pts, be = bEnd[bEnd.length - 1], bp = bEnd[bEnd.length - 6];
    const bl = Math.hypot(be.x - bp.x, be.z - bp.z) || 1;
    const burnerAt = { x: be.x + (be.x - bp.x) / bl * 6, z: be.z + (be.z - bp.z) / bl * 6 };
    // ---- the forest ----
    const list = [];
    const taken = new Map();
    const cellK = (x, z) => Math.floor(x / 3.4) + "," + Math.floor(z / 3.4);
    const tries = 6500;
    for (let i = 0; i < tries; i++) {
      const t = this.road[Math.floor(r() * this.road.length)];
      const a = r() * TAU, rad = 5 + Math.pow(r(), 0.9) * 70;
      const x = t.x + Math.cos(a) * rad, z = t.z + Math.sin(a) * rad;
      if (this.anyRoadDist(x, z).d < 4.5) continue;
      if (z > 16) continue;                            // the fields behind: open ground back to the city
      if (Math.hypot(x - burnerAt.x, z - burnerAt.z) < 17) continue;   // the charcoal burner's clearing
      const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
      if (dc < CLEARING.r + 14) continue;             // the clearing and the ring of choppable trees
      const k = cellK(x, z);
      if (taken.has(k)) continue;
      taken.set(k, 1);
      const kind = r() < 0.62 ? "spruce" : r() < 0.6 ? "pine" : "birch";
      const h = kind === "spruce" ? r.range(8, 16) : kind === "pine" ? r.range(10, 17) : r.range(7, 11);
      list.push({ x, z, y: this.heightAt(x, z), h, kind, rot: r() * TAU });
      if (this.roadDist(x, z).d < 40 || dc < 70) this.col.addCircle(x, z, kind === "birch" ? 0.2 : 0.3, 12);
    }
    // and the woods close round the charcoal burner's clearing too
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU, rad = 17 + Math.pow(r(), 0.8) * 45;
      const x = burnerAt.x + Math.cos(a) * rad, z = burnerAt.z + Math.sin(a) * rad;
      if (this.anyRoadDist(x, z).d < 4.5) continue;
      const k = cellK(x, z);
      if (taken.has(k)) continue;
      taken.set(k, 1);
      const kind = r() < 0.7 ? "spruce" : r() < 0.5 ? "pine" : "birch";
      const h = kind === "spruce" ? r.range(8, 16) : kind === "pine" ? r.range(10, 17) : r.range(7, 11);
      list.push({ x, z, y: this.heightAt(x, z), h, kind, rot: r() * TAU });
      if (rad < 30) this.col.addCircle(x, z, kind === "birch" ? 0.2 : 0.3, 12);
    }
    for (const m of forestInstances(list)) root.add(m);
    this.mapTrees = list.map(t => ({ x: t.x, z: t.z, k: t.kind }));
    this.treeCount = list.length;

    // undergrowth: bushes, ferns, stones
    const ub = new Builder();
    for (let i = 0; i < 900; i++) {
      const t = this.road[Math.floor(r() * this.road.length)];
      const a = r() * TAU, rad = 3.5 + r() * 45;
      const x = t.x + Math.cos(a) * rad, z = t.z + Math.sin(a) * rad;
      if (this.anyRoadDist(x, z).d < 3) continue;
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r - 4) continue;
      if (Math.hypot(x - burnerAt.x, z - burnerAt.z) < 13) continue;
      const y = this.heightAt(x, z);
      const k = r();
      if (k < 0.45) ub.add(TREE.blob, r.pick([0x3e5a2e, 0x4a6a34, 0x55703a]), x, y + 0.3, z, 0, r() * 3, 0, r.range(0.6, 1.3), r.range(0.4, 0.8), r.range(0.6, 1.3), 0.06);
      else if (k < 0.8) for (let j = 0; j < 5; j++) ub.add(TREE.cone, 0x5a7a3a, x + r.range(-0.4, 0.4), y, z + r.range(-0.4, 0.4), r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5), 0.12, 0.7, 0.12);
      else ub.add(new THREE.DodecahedronGeometry(0.5, 0), 0x7a7870, x, y + 0.1, z, r(), r(), r(), r.range(0.5, 1.4), r.range(0.3, 0.7), r.range(0.5, 1.2), 0.08);
    }
    root.add(ub.build(MAT.rough, { shadow: false }));

    // ---- the road: a narrow cart track, two ruts and grass up the middle; the forks fainter still ----
    const rPos = [], rCol = [], rIdx = [];
    const C = h => new THREE.Color(h);
    const GRASS = C(0x7c8a5c), EDGE = C(0x8a7a5a), DIRT = C(0x7a6848), RUT = C(0x4e4232), MID = C(0x6c7448);
    // across the track, from the grass on one side to the grass on the other: [offset in half-widths, colour, height]
    const XS = [[-1.5, GRASS, 0.015], [-1.0, EDGE, 0.03], [-0.66, RUT, 0.0], [-0.4, DIRT, 0.03], [0, MID, 0.05], [0.4, DIRT, 0.03], [0.66, RUT, 0.0], [1.0, EDGE, 0.03], [1.5, GRASS, 0.015]];
    const tc = new THREE.Color();
    const track = (R, W0, W1, seed) => {
      const base = rPos.length / 3, n = XS.length;
      for (let i = 0; i < R.length; i++) {
        const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l, nz = dx / l;
        const f = i / (R.length - 1);
        // the width wanders, as a track worn by carts and weather does
        const W = (W0 + (W1 - W0) * f) * (1 + 0.2 * Math.sin(i * 0.31 + seed) + 0.1 * Math.sin(i * 1.7 + seed * 3));
        for (let j = 0; j < n; j++) {
          const [o, c, h] = XS[j];
          const edge = Math.abs(o) >= 1;
          const jit = edge ? (r() - 0.5) * 0.3 : (r() - 0.5) * 0.06;
          const x = R[i].x + nx * (o * W + jit), z = R[i].z + nz * (o * W + jit);
          rPos.push(x, this.heightAt(x, z) + h + (r() - 0.5) * 0.02, z);
          tc.copy(c).offsetHSL(0, 0, (r() - 0.5) * 0.06);
          // fainter towards the end of a fork: the grass takes it back
          if (W1 < W0) tc.lerp(GRASS, f * f * 0.8);
          rCol.push(tc.r, tc.g, tc.b);
        }
        if (i > 0) for (let j = 0; j < n - 1; j++) {
          const p0 = base + (i - 1) * n + j, p1 = p0 + 1, q0 = base + i * n + j, q1 = q0 + 1;
          rIdx.push(p0, q0, p1, p1, q0, q1);
        }
      }
    };
    track(this.road, 0.95, 0.95, 1.3);
    this.branches.forEach((br, n) => track(br.pts, 0.75, 0.3, n * 2.7));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rPos, 3));
    rg.setAttribute("color", new THREE.Float32BufferAttribute(rCol, 3));
    rg.setIndex(rIdx);
    rg.computeVertexNormals();
    // wound the other way round: flip if it faces down
    if (rg.attributes.normal.getY(0) < 0) { const ix = rg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } rg.computeVertexNormals(); }
    const roadMesh = new THREE.Mesh(rg, addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { scale: 4, amount: 0.35, grain: 0.8 }));
    roadMesh.receiveShadow = true;
    root.add(roadMesh);
    // stones kicked to the sides, tufts in the middle
    const sb2 = new Builder();
    const strew = (R, W, every) => {
      for (let i = 0; i < R.length; i += every) {
        const a = R[i], b = R[Math.min(R.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        if (r() < 0.7) { const o = (r() < 0.5 ? -1 : 1) * W * (0.9 + r() * 0.5); const x = a.x + nx * o, z = a.z + nz * o; sb2.add(new THREE.DodecahedronGeometry(0.12, 0), r.pick([0x7a7870, 0x8a857a, 0x6a665e]), x, this.heightAt(x, z) + 0.04, z, r(), r(), r(), r.range(0.6, 1.8), r.range(0.4, 0.8), r.range(0.6, 1.5), 0.08); }
        if (r() < 0.5) { const x = a.x + nx * (r() - 0.5) * 0.3, z = a.z + nz * (r() - 0.5) * 0.3; for (let k = 0; k < 3; k++) sb2.add(TREE.cone, 0x6a7a3a, x + (r() - 0.5) * 0.2, this.heightAt(x, z) + 0.02, z + (r() - 0.5) * 0.2, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6, 0.05, 0.22, 0.05); }
      }
    };
    strew(this.road, 0.95, 3);
    for (const br of this.branches) strew(br.pts, 0.6, 2);
    root.add(sb2.build(MAT.rough, { shadow: false }));

    // ---- at the forks: signposts near the city, and every track ends at a fallen tree ----
    const sb = new Builder();
    for (const br of this.branches) {
      const { at, dir, fork } = br;
      const side = fork.side, rx = -dir.z * side, rz = dir.x * side;
      if (fork.sign) {
        // on the far side of the junction from the fork, arms pointing down each way
        const px = at.x - rx * 2.6, pz = at.z - rz * 2.6, py = this.heightAt(px, pz);
        sb.box(0.14, 2.6, 0.14, px, py + 1.3, pz, 0x5a4432);
        const arm = (ax, az, y, len) => { const ry = Math.atan2(ax, az) + Math.PI / 2; sb.box(len, 0.24, 0.05, px + ax * len * 0.5, py + y, pz + az * len * 0.5, 0xb09a78, ry, 0.05); sb.box(len * 0.08, 0.24, 0.07, px + ax * len * 0.96, py + y, pz + az * len * 0.96, 0x3a2a1e, ry); };
        arm(dir.x, dir.z, 2.25, 1.1);
        const bd = br.pts[6], bl = Math.hypot(bd.x - at.x, bd.z - at.z) || 1;
        arm((bd.x - at.x) / bl, (bd.z - at.z) / bl, 1.85, 1.0);
      }
      if (br.n === 3) { this.buildBurner(br); continue; }
      // the dead end: a spruce fallen across the track
      const e = br.pts[br.pts.length - 4], e2 = br.pts[br.pts.length - 1];
      const ey = this.heightAt(e.x, e.z), ang = Math.atan2(e2.x - e.x, e2.z - e.z);
      sb.add(new THREE.CylinderGeometry(0.22, 0.3, 9, 8), 0x4e3a2a, e.x, ey + 0.28, e.z, Math.PI / 2, ang + Math.PI / 2, 0.05);
      for (let j = 0; j < 4; j++) sb.add(TREE.blob, 0x2f4a2c, e.x + Math.sin(ang + Math.PI / 2) * (2 + j * 1.2), ey + 0.7, e.z + Math.cos(ang + Math.PI / 2) * (2 + j * 1.2), 0, j, 0, 1.1, 0.8, 1.1, 0.08);
      this.col.addCircle(e.x, e.z, 1.6, 2);
    }
    root.add(sb.build(MAT.rough));

    // ---- far behind: the city, a row of spires on the skyline ----
    const city = new THREE.Group();
    const cm = new THREE.MeshBasicMaterial({ color: 0x5a6070, fog: false, transparent: true, opacity: 0.55 });
    for (const [x, h, w] of [[-60, 40, 6], [-30, 55, 5], [0, 70, 6], [20, 48, 5], [45, 38, 7], [70, 30, 10], [-80, 22, 20], [100, 18, 30]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, w), cm); b.position.set(x, h * 0.27, 0); city.add(b);
      const s = new THREE.Mesh(new THREE.ConeGeometry(w * 0.6, h * 0.45, 8), cm); s.position.set(x, h * 0.55 + h * 0.22, 0); city.add(s);
    }
    const wallM = new THREE.Mesh(new THREE.BoxGeometry(300, 12, 4), cm); wallM.position.set(0, 6, 0); city.add(wallM);
    city.position.set(0, -4, 520);
    // Hamburg across the fields, made in Blender, if it is there
    const sky = modelCopy("hamburg_skyline");
    if (sky) {
      city.clear();
      // distance takes the light out of it: flat, pale, a little see-through against the sky
      sky.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xc8ccd4, fog: false, transparent: true, opacity: 0.72, depthWrite: false }); } });
      sky.scene.rotation.y = Math.PI;
      city.add(sky.scene);
      city.position.set(0, this.rawAt(0, 205) - 1, 205);
    }
    root.add(city);
    this.city = city;

    // ---- the clearing ----
    this.buildClearing();

    this.lightPool = [];
    for (let i = 0; i < 2; i++) { const L = new THREE.PointLight(0xff8a3a, 0, 16, 1.6); root.add(L); this.lightPool.push(L); }
    this.t = 0;
  }

  // on the map: stamped forest, the road and its forks, the clearing, and the city behind
  minimap(c, X, Z, S, big) {
    const W = c.canvas.width, H = c.canvas.height, pad = 12;
    const vis = (x, z) => { const px = X(x), pz = Z(z); return px > -pad && px < W + pad && pz > -pad && pz < H + pad; };
    // the fields behind, towards the city, a paler wash
    const fz = Z(16);
    if (fz < H) { c.fillStyle = "rgba(200,190,120,0.35)"; c.fillRect(0, Math.max(0, fz), W, H); }
    // the forest, tree by tree
    const ts = Math.max(2.2, Math.min(4.2, S * 1.6));
    c.fillStyle = TREEC;
    const step = big && S < 1.2 ? 2 : 1;
    for (let i = 0; i < this.mapTrees.length; i += step) { const t = this.mapTrees[i]; if (vis(t.x, t.z)) tree(c, X(t.x), Z(t.z), ts, t.k); }
    // the clearing
    c.fillStyle = "rgba(214,200,150,0.9)"; c.beginPath(); c.arc(X(CLEARING.x), Z(CLEARING.z), CLEARING.r * S, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK; c.lineWidth = 1; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    c.fillStyle = TREEC;
    for (const t of this.fellable) if (t.state === "up" || t.state === "shake") tree(c, X(t.x), Z(t.z), ts * 1.1, "spruce");
    // the cabin
    c.fillStyle = this.cabin && this.cabin.visible ? TOWN : "#3a3530";
    c.save(); c.translate(X(CABIN.x), Z(CABIN.z)); c.rotate(-CABIN.ry); c.fillRect(-2.5 * S, -3 * S, 5 * S, 6 * S); c.strokeStyle = INK; c.strokeRect(-2.5 * S, -3 * S, 5 * S, 6 * S); c.restore();
    // the road and the tracks off it
    const rw = Math.max(2.2, Math.min(4.5, S * 1.9));
    for (const br of this.branches) road(c, br.pts, X, Z, rw * 0.6);
    road(c, this.road, X, Z, rw);
  }
  mapLabels(c, X, Z, S) {
    {
      label(c, "The Clearing", X(CLEARING.x), Z(CLEARING.z) + CLEARING.r * S + 14, 15);
      label(c, "the road north-east", X(-40), Z(-120), 13);
      label(c, "The old woods", X(70), Z(-200), 18);
      label(c, "to Hamburg", X(0), Z(40), 14);
      for (const br of this.branches) if (br.fork.sign) { const e = br.pts[br.pts.length - 1]; label(c, "to " + br.fork.sign[1], X(e.x), Z(e.z) + 11, 11); }
    }
  }
  get mapTitle() { return "The Road North-East"; }
  get mapBounds() { return { x0: -90, x1: 110, z0: -350, z1: 60 }; }
  // gentle hills, flattened where the road runs and in the clearing
  heightAt(x, z) {
    let h = Math.sin(x * 0.021) * 2.2 + Math.cos(z * 0.017) * 2.6 + Math.sin((x + z) * 0.043) * 0.9 + Math.cos(x * 0.09 - z * 0.07) * 0.35;
    const rd = this.road ? (this.branches ? this.anyRoadDist(x, z) : this.roadDist(x, z)) : null;
    const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
    const flatC = clamp((dc - CLEARING.r + 4) / 14, 0, 1);
    const clearingH = this._ch ?? (this._ch = this.rawAt(CLEARING.x, CLEARING.z));
    if (rd) {
      const k = clamp((rd.d - 2) / 8, 0, 1);
      const roadH = this.rawAt(rd.x, rd.z);
      h = roadH + (h - roadH) * k;
    }
    return clearingH + (h - clearingH) * flatC;
  }
  rawAt(x, z) { return Math.sin(x * 0.021) * 2.2 + Math.cos(z * 0.017) * 2.6 + Math.sin((x + z) * 0.043) * 0.9 + Math.cos(x * 0.09 - z * 0.07) * 0.35; }
  roadDist(x, z) {
    let best = Infinity, bi = 0;
    const R = this.road;
    // coarse then fine
    for (let i = 0; i < R.length; i += 8) { const d = (R[i].x - x) ** 2 + (R[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    for (let i = Math.max(0, bi - 8); i < Math.min(R.length, bi + 9); i++) { const d = (R[i].x - x) ** 2 + (R[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    return { d: Math.sqrt(best), i: bi, t: bi / (R.length - 1), x: R[bi].x, z: R[bi].z };
  }
  // the nearest of the road and its forks: {d, x, z, branch} (branch is null on the road itself)
  anyRoadDist(x, z) {
    const m = this.roadDist(x, z);
    let best = { d: m.d, x: m.x, z: m.z, branch: null, i: m.i };
    for (const b of this.branches || []) {
      for (let i = 0; i < b.pts.length; i++) {
        const p = b.pts[i], d = Math.hypot(p.x - x, p.z - z);
        if (d < best.d) best = { d, x: p.x, z: p.z, branch: b, i };
      }
    }
    return best;
  }
  // how far along the road you are, 0 to 1
  progress(x = G.player.pos.x, z = G.player.pos.z) { return this.roadDist(x, z).t; }
  constrain(p) {
    const dc = Math.hypot(p.x - CLEARING.x, p.z - CLEARING.z);
    if (dc < CLEARING.r + 12) {
      if (dc > CLEARING.r + 10) { const k = (CLEARING.r + 10) / dc; p.x = CLEARING.x + (p.x - CLEARING.x) * k; p.z = CLEARING.z + (p.z - CLEARING.z) * k; }
      return;
    }
    const rd = this.anyRoadDist(p.x, p.z);
    const lim = 14;
    if (rd.d > lim) { const k = lim / rd.d; p.x = rd.x + (p.x - rd.x) * k; p.z = rd.z + (p.z - rd.z) * k; if (!this._warned || G.time - this._warned > 8) { this._warned = G.time; this.onTooFar && this.onTooFar(); } }
    if (!rd.branch && rd.i < 3 && p.z > this.road[0].z) p.z = this.road[0].z;
  }

  buildClearing() {
    const root = this.root, C = CLEARING, r = rng(88);
    const y0 = this.heightAt(C.x, C.z);
    this.cy = y0;
    // a patch of ash where the cabin burned
    const ash = new THREE.Mesh(new THREE.CircleGeometry(5.5, 20), mat(0x3a3530));
    ash.rotation.x = -Math.PI / 2; ash.position.set(CABIN.x, y0 + 0.03, CABIN.z); ash.receiveShadow = true;
    root.add(ash); this.ash = ash;

    // ---- the burned cabin ----
    this.burned = new THREE.Group();
    const bb = new Builder();
    const charred = [0x1e1a17, 0x2a2420, 0x332b25, 0x241f1b];
    const logs = (len, n, x, z, ry, burntTo) => {
      for (let i = 0; i < n; i++) {
        const l = len * (i < burntTo ? 1 : r.range(0.3, 0.9));
        const off = (len - l) / 2 * (r() < 0.5 ? -1 : 1);
        bb.add(new THREE.CylinderGeometry(0.17, 0.17, l, 7), r.pick(charred), x + Math.cos(ry) * off, 0.17 + i * 0.3, z - Math.sin(ry) * off, Math.PI / 2, ry + Math.PI / 2, 0);
      }
    };
    // cabin local frame: 5 wide (x), 6 deep (z), front at +z
    const cw = 5, cd = 6;
    const place = (lx, lz) => { const c = Math.cos(CABIN.ry), s = Math.sin(CABIN.ry); return [CABIN.x + lx * c + lz * s, CABIN.z - lx * s + lz * c]; };
    let [x, z] = place(0, -cd / 2); logs(cw, 6, x, z, CABIN.ry, 3);
    [x, z] = place(-cw / 2, 0); logs(cd, 5, x, z, CABIN.ry + Math.PI / 2, 2);
    [x, z] = place(cw / 2, 0); logs(cd, 3, x, z, CABIN.ry + Math.PI / 2, 1);
    [x, z] = place(-1.6, cd / 2); logs(1.8, 4, x, z, CABIN.ry, 2);
    [x, z] = place(1.6, cd / 2); logs(1.8, 2, x, z, CABIN.ry, 1);
    // fallen roof beams, leaning in
    for (let i = 0; i < 5; i++) {
      const [bx, bz] = place(r.range(-1.8, 1.8), r.range(-2, 2));
      bb.add(new THREE.CylinderGeometry(0.12, 0.14, r.range(2.5, 4.5), 6), r.pick(charred), bx, 0.6, bz, r.range(0.8, 1.3), r() * TAU, r.range(-0.3, 0.3));
    }
    // corner posts
    for (const [lx, lz, h] of [[-2.5, -3, 2.4], [2.5, -3, 1.4], [-2.5, 3, 1.9], [2.5, 3, 0.8]]) { const [px, pz] = place(lx, lz); bb.box(0.26, h, 0.26, px, h / 2, pz, 0x1a1614); }
    // the stone chimney, which fire does not take
    const [chx, chz] = place(-1.2, -3.3); bb.box(1.2, 4.2, 0.9, chx, 2.1, chz, 0x6a6660, CABIN.ry, 0.06);
    const bm = bb.build(); bm.position.y = y0; this.burned.add(bm);
    const ruinModel = modelCopy("cabin_burned");
    if (ruinModel) { bm.visible = false; ruinModel.scene.position.set(CABIN.x, y0, CABIN.z); ruinModel.scene.rotation.y = CABIN.ry; this.burned.add(ruinModel.scene); }
    root.add(this.burned);
    this.burnedCols = [];
    {
      const c = Math.cos(CABIN.ry), s = Math.sin(CABIN.ry);
      const wall = (lx0, lz0, lx1, lz1, h) => {
        const n = Math.ceil(Math.hypot(lx1 - lx0, lz1 - lz0) / 0.5);
        for (let i = 0; i <= n; i++) {
          const lx = lx0 + (lx1 - lx0) * i / n, lz = lz0 + (lz1 - lz0) * i / n;
          this.burnedCols.push(this.col.addCircle(CABIN.x + lx * c + lz * s, CABIN.z - lx * s + lz * c, 0.28, h));
        }
      };
      wall(-2.5, -3, 2.5, -3, 3); wall(-2.5, -3, -2.5, 3, 3); wall(2.5, -3, 2.5, 3, 3); wall(-2.5, 3, -0.7, 3, 3); wall(0.7, 3, 2.5, 3, 3);
      this.cabinFrame = { c, s };
    }

    // ---- the rebuilt cabin (hidden until it is) ----
    this.cabin = new THREE.Group();
    const cb = new Builder();
    const logC = [0x8a6440, 0x7a5634, 0x946a44];
    const wallLogs = (len, n, lx, lz, along, skip) => {
      for (let i = 0; i < n; i++) {
        if (skip && skip(i)) continue;
        const [px, pz] = place(lx, lz);
        cb.add(new THREE.CylinderGeometry(0.18, 0.18, len, 8), r.pick(logC), px, 0.18 + i * 0.33, pz, Math.PI / 2, CABIN.ry + (along ? Math.PI / 2 : 0), 0, 1, 1, 1, 0.05);
      }
    };
    wallLogs(cw + 0.5, 8, 0, -cd / 2, true);
    wallLogs(cd + 0.5, 8, -cw / 2, 0, false);
    wallLogs(cd + 0.5, 8, cw / 2, 0, false);
    wallLogs(1.9, 8, -1.55, cd / 2, true); wallLogs(1.9, 8, 1.55, cd / 2, true);
    const [lx, lz] = place(0, cd / 2); cb.add(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8), 0x8a6440, lx, 2.35, lz, Math.PI / 2, CABIN.ry + Math.PI / 2, 0);
    cb.add(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8), 0x8a6440, lx, 2.68, lz, Math.PI / 2, CABIN.ry + Math.PI / 2, 0);
    // the charred beam they kept, at the front corner
    const [kx, kz] = place(-2.5, 3); cb.box(0.3, 2.7, 0.3, kx, 1.35, kz, 0x161210, CABIN.ry);
    // roof
    const roof = prismGeo(cw + 0.2, 2.2, cd + 0.2, 0.55);
    cb.add(roof, 0x5a4636, CABIN.x, 2.72, CABIN.z, 0, CABIN.ry, 0);
    // gables filled with planks
    const [chx2, chz2] = place(-1.2, -3.3); cb.box(1.2, 5.6, 0.9, chx2, 2.8, chz2, 0x6a6660, CABIN.ry, 0.06);
    // the door they hewed
    const [dx, dz] = place(0, cd / 2 + 0.05);
    cb.box(1.1, 2.1, 0.12, dx, 1.05, dz, 0x6a4a2e, CABIN.ry);
    for (const yy of [0.4, 1.7]) cb.box(1.1, 0.12, 0.05, dx + Math.sin(CABIN.ry) * 0.07, yy, dz + Math.cos(CABIN.ry) * 0.07, 0x4a3420, CABIN.ry);
    const cm = cb.build(); cm.position.y = y0; this.cabin.add(cm);
    // a cabin made in Blender, if there is one, stands in for this one
    const cabinModel = modelCopy("cabin");
    if (cabinModel) { cm.visible = false; cabinModel.scene.position.set(CABIN.x, y0, CABIN.z); cabinModel.scene.rotation.y = CABIN.ry; this.cabin.add(cabinModel.scene); }
    // a window with light in it, for the last evening
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.06), MAT.lit);
    const [wx, wz] = place(cw / 2 + 0.2, 0.5); win.position.set(wx, y0 + 1.5, wz); win.rotation.y = CABIN.ry + Math.PI / 2;
    this.cabin.add(win);
    this.cabin.visible = false;
    root.add(this.cabin);

    // ---- the chopping block, with an axe left in it ----
    const blk = new Builder();
    blk.add(new THREE.CylinderGeometry(0.42, 0.48, 0.6, 10), 0x6a4a30, BLOCK.x, 0.3, BLOCK.z);
    blk.add(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 10), 0xb89a70, BLOCK.x, 0.61, BLOCK.z);
    // a sawhorse beside it
    for (const s of [-0.7, 0.7]) { blk.box(0.08, 0.9, 0.08, BLOCK.x + 1.3 + s, 0.45, BLOCK.z + 0.35, 0x5a4030); blk.box(0.08, 0.9, 0.08, BLOCK.x + 1.3 + s, 0.45, BLOCK.z - 0.35, 0x5a4030); }
    blk.box(1.8, 0.1, 0.12, BLOCK.x + 1.3, 0.9, BLOCK.z, 0x6a4a30);
    const bm2 = blk.build(); bm2.position.y = y0; root.add(bm2);
    this.col.addCircle(BLOCK.x, BLOCK.z, 0.5, 0.6);
    this.col.addRect(BLOCK.x + 1.3, BLOCK.z, 1.8, 0.8, 0.9);
    this.blockAxe = new THREE.Group();
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.75, 6), mat(0x6a4a30)); haft.position.y = 0.3; this.blockAxe.add(haft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.17), mat(0x4d4f52, { metalness: 0.7, roughness: 0.6 })); head.position.set(0, -0.05, 0.05); this.blockAxe.add(head);
    this.blockAxe.position.set(BLOCK.x, y0 + 0.72, BLOCK.z); this.blockAxe.rotation.set(0.5, 0.8, 0.15);
    root.add(this.blockAxe);
    // a door, once one is hewn, leans on the sawhorse
    this.doorProp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), mat(0x7a5634));
    this.doorProp.position.set(BLOCK.x + 1.3, y0 + 1.0, BLOCK.z - 0.55); this.doorProp.rotation.x = 0.25; this.doorProp.visible = false;
    root.add(this.doorProp);

    // ---- the stack, which grows as logs are carried to it ----
    this.stack = new THREE.Group(); root.add(this.stack);
    this.stackN = -1; this.setStack(0);
    this.col.addRect(STACK.x, STACK.z, 1.6, 2.6, 0.5);

    // ---- a fire ring ----
    const fr = new Builder();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; fr.add(new THREE.DodecahedronGeometry(0.2, 0), 0x6a6660, FIRE.x + Math.cos(a) * 0.65, 0.1, FIRE.z + Math.sin(a) * 0.65, i, i, 0, 1, 0.8, 1, 0.1); }
    for (let i = 0; i < 4; i++) fr.add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), 0x3a2a20, FIRE.x, 0.12, FIRE.z, Math.PI / 2, i * 0.8, 0.2);
    // logs to sit on
    fr.add(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8), 0x7a5634, FIRE.x - 1.9, 0.2, FIRE.z + 0.3, Math.PI / 2, 0.3, 0);
    fr.add(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8), 0x7a5634, FIRE.x + 1.9, 0.2, FIRE.z + 0.4, Math.PI / 2, -0.3, 0);
    const fm = fr.build(); fm.position.y = y0; root.add(fm);
    this.col.addCircle(FIRE.x, FIRE.z, 0.7, 0.4);
    this.fire = null;

    // ---- the ring of trees you can fell ----
    this.fellable = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + r.range(-0.05, 0.05);
      const d = C.r + r.range(2, 12);
      const tx = C.x + Math.cos(a) * d, tz = C.z + Math.sin(a) * d;
      // leave the road's mouth open
      if (this.roadDist(tx, tz).d < 5) continue;
      const h = r.range(8, 12);
      const sm = modelCopy("spruce");
      let g;
      if (sm) { g = new THREE.Group(); sm.scene.scale.setScalar(h / 10); sm.scene.rotation.y = r() * TAU; g.add(sm.scene); }
      else g = makeSpruce(h, i * 7 + 1);
      const ty = this.heightAt(tx, tz);
      g.position.set(tx, ty - 0.1, tz);
      root.add(g);
      const t = { g, x: tx, z: tz, y: ty, h, hp: 4, state: "up", angle: a, col: this.col.addCircle(tx, tz, 0.32, 12), fall: 0, claimed: null };
      this.fellable.push(t);
    }
  }
  // the charcoal burner's camp, where his track ends: a kiln smoking under its turf, his hut, his wood
  buildBurner(br) {
    const r = rng(417), root = this.root;
    const e = br.pts[br.pts.length - 1], e2 = br.pts[br.pts.length - 6];
    const ang = Math.atan2(e.x - e2.x, e.z - e2.z);             // the way the track was going
    const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
    const at = (a, b) => [e.x + fx * a + rx * b, e.z + fz * a + rz * b];
    const b = new Builder();
    // a trodden patch of black earth
    const [px, pz] = at(5, 0), py = this.heightAt(px, pz);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(9, 24), mat(0x2e2824));
    patch.rotation.x = -Math.PI / 2; patch.position.set(px, py + 0.03, pz); patch.receiveShadow = true; root.add(patch);
    // the kiln: a low dome of turf and earth, smoke leaking from its crown
    const [kx, kz] = at(6, 3.5), ky = this.heightAt(kx, kz);
    b.add(new THREE.SphereGeometry(2.4, 18, 10, 0, TAU, 0, Math.PI / 2), 0x6a6448, kx, ky - 0.1, kz, 0, 0, 0, 1, 0.75, 1, 0.08);
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = r.range(0.4, 2.2); b.add(new THREE.DodecahedronGeometry(0.28, 0), r.pick([0x4a5230, 0x3e3a2c, 0x2a2622]), kx + Math.cos(a) * d, ky + (1 - d / 2.4) * 1.4, kz + Math.sin(a) * d, r(), r(), r(), 1.2, 0.5, 1.2, 0.08); }
    // his hut: a lean-to of poles and bark
    const [hx, hz] = at(9, -3.5), hy = this.heightAt(hx, hz);
    for (let i = 0; i < 9; i++) {
      const o = (i - 4) * 0.45;
      b.add(new THREE.CylinderGeometry(0.06, 0.08, 2.8, 6), 0x6a5440, hx + rx * o, hy + 0.95, hz + rz * o, -0.95, ang, 0, 1, 1, 1, 0.1);
      b.add(new THREE.BoxGeometry(0.46, 2.7, 0.05), 0x7a6650, hx + rx * o - fx * 0.12, hy + 1.0, hz + rz * o - fz * 0.12, -0.95, ang, 0, 1, 1, 1, 0.14);
    }
    b.add(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 6), 0x6a5440, hx + fx * 0.9, hy + 1.9, hz + fz * 0.9, 0, ang, Math.PI / 2);
    // a stack of split wood waiting to be burned, a chopping block, a rake
    const [wx, wz] = at(3, -5.5), wy = this.heightAt(wx, wz);
    P.logPile(b, wx, wz, 11, ang, wy);
    const [cx2, cz2] = at(4.5, -1.2), cy2 = this.heightAt(cx2, cz2);
    b.add(new THREE.CylinderGeometry(0.34, 0.38, 0.55, 10), 0x6a5038, cx2, cy2 + 0.27, cz2);
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), 0x5a4432, kx - rx * 2.9, ky + 0.9, kz - rz * 2.9, 0.3, 0, 0.2);
    root.add(b.build(MAT.rough));
    this.col.addCircle(kx, kz, 2.3, 2); this.col.addCircle(hx, hz, 1.9, 3); this.col.addCircle(wx, wz, 1.2, 1.5);
    // smoke from the kiln, thin and endless
    const smoke = [];
    const sm = new THREE.MeshBasicMaterial({ color: 0xb8b4ac, transparent: true, opacity: 0.25, depthWrite: false });
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), sm.clone()); m.userData.t = i / 14; root.add(m); smoke.push(m); }
    this.burner = { x: hx - fx * 1.6, z: hz - fz * 1.6, kiln: { x: kx, y: ky + 1.6, z: kz }, smoke, face: ang + Math.PI, camp: { x: px, z: pz } };
  }
  setStack(n) {
    if (n === this.stackN) return;
    this.stackN = n;
    this.stack.clear();
    const b = new Builder();
    b.box(1.8, 0.12, 2.6, STACK.x, 0.06, STACK.z, 0x4a3a2a);
    if (n > 0) P.logPile(b, STACK.x, STACK.z, Math.min(n, 24), Math.PI / 2, 0.12);
    const m = b.build(); m.position.y = this.cy; this.stack.add(m);
  }
  lightFire(on = true) {
    if (on && !this.fire) {
      const L = this.lightPool[0]; L.intensity = 9; L.distance = 18;
      this.fire = makeFlame(5, L); this.fire.position.set(FIRE.x, this.cy + 0.05, FIRE.z);
      this.fire.userData.flame.base = 9;
      this.root.add(this.fire); this.flames.push(this.fire);
    }
  }
  showCabin() {
    this.burned.visible = false; this.cabin.visible = true;
    this.ash.material = mat(0x5a4e3e);
    for (const c of this.burnedCols) c.disabled = true;
    // the finished cabin is one solid block with its door on the front
    const { c, s } = this.cabinFrame;
    const pts = [[-2.7, -3.2], [2.7, -3.2], [2.7, 3.2], [-2.7, 3.2]].map(([lx, lz]) => [CABIN.x + lx * c + lz * s, CABIN.z - lx * s + lz * c]);
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    if (!this.cabinCol) this.cabinCol = this.col.addBox(Math.min(...xs) + 0.6, Math.min(...zs) + 0.6, Math.max(...xs) - 0.6, Math.max(...zs) - 0.6, 5);
  }
  update(dt) {
    this.t += dt;
    if (this.burner) for (const m of this.burner.smoke) {
      const u = (m.userData.t = (m.userData.t + dt * 0.06) % 1), k = this.burner.kiln;
      m.position.set(k.x + Math.sin(u * 9 + this.t * 0.3) * u * 1.4 + u * 3, k.y + u * 14, k.z + Math.cos(u * 7) * u * 1.2);
      m.scale.setScalar(0.6 + u * 3.2); m.material.opacity = 0.3 * (1 - u) * Math.min(1, u * 8);
    }
    for (const t of this.fellable) {
      if (t.state === "falling") {
        t.fall = Math.min(1, t.fall + dt * (0.25 + t.fall * 2.2));
        const a = t.fall * t.fall * (Math.PI / 2 - 0.08);
        t.g.rotation.set(0, 0, 0);
        t.g.rotateOnWorldAxis(t.axis, a);
        if (t.fall >= 1) { t.state = "down"; t.onDown && t.onDown(); }
      } else if (t.state === "shake") {
        t.shake -= dt;
        t.g.rotation.z = Math.sin(t.shake * 60) * 0.01 * Math.max(0, t.shake) * 8;
        if (t.shake <= 0) { t.state = "up"; t.g.rotation.z = 0; }
      }
    }
  }
}
export { STACK, BLOCK, FIRE };
void prismGeo;
