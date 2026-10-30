// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Hamburg, 1683. A harbour on the north side, the family's house on the lane
// behind it, the square and St. Nikolai to the south, and the city wall with
// the marsh gate in its south-west corner. The streets are laid out by hand;
// the houses along them are generated, from a fixed seed, so it is the same
// city every time.

import { THREE, Builder, Collision, MAT, mat, rng, gableGeo, makeFlame, TAU, groundTexture, SNOW, camera, addDetail, addHook } from "./core.js";
import { WorldBase, G } from "./engine.js";
import { P, makeShip, makeScroll, modelCopy } from "./models.js";
import { AUDIO } from "./audio.js";
import { WaterMat, trackWater } from "./water.js";
import { Smoke } from "./smoke.js";
import { water, label, INK, seen } from "./map.js";

// ---------------------------------------------------------------------------
//  ground textures, painted at load
// ---------------------------------------------------------------------------
export function stoneTexture(base = "#7d766c", seed = 1, size = 256, n = 70) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d"), r = rng(seed);
  x.fillStyle = "#4a4540"; x.fillRect(0, 0, size, size);
  const rows = 9;
  for (let j = 0; j < rows; j++) {
    const h = size / rows;
    let px = (j % 2) * -12;
    while (px < size) {
      const w = r.range(18, 34);
      const l = r.range(-10, 10);
      x.fillStyle = shade(base, l);
      roundRect(x, px + 1.5, j * h + 1.5, w - 3, h - 3, 5);
      px += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function grassTexture(base = "#4f6a34", seed = 2, size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d"), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = shade(base, r.range(-14, 14));
    const px = r() * size, py = r() * size;
    x.fillRect(px, py, r.range(1, 3), r.range(2, 6));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function shade(hex, l) {
  const c = new THREE.Color(hex); c.offsetHSL(0, 0, l / 100); return "#" + c.getHexString();
}
function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); x.fill();
}

// ---------------------------------------------------------------------------
//  the plan
// ---------------------------------------------------------------------------
// Every block is [x0, z0, x1, z1]; the gaps between them are the streets.
const BLOCKS = [
  [-62, -38, -38, -3], [-32, -38, -3, -3],
  [3, -28, 8, -3], [8, -28, 18, -22], [18, -28, 32, -3], [3, -38, 20, -28],
  [38, -38, 62, -3],
  [-62, 3, -38, 66], [-32, 3, -15, 37], [-15, 3, -3, 30], [3, 3, 32, 30],
  [-32, 43, -26, 53.5], [-23.5, 43, -15, 64], [-32, 56, -23.5, 64],
  [-15, 56, -8.5, 66], [8.5, 56, 15, 66],
  [15, 30, 32, 66], [38, 3, 62, 66],
];
const PLASTER = [0xe8dcc4, 0xd9c7a0, 0xc9a77a, 0xe0d0b0, 0xb7836a, 0xd6c3a5, 0xcfb89a];
const BRICK = [0x98543f, 0x8a4838, 0xa8644c, 0x7c4434];   // (the red-brown of Hamburg's Backstein: darker, a brick house in the shade of the street went black)
const ROOF = [0x7a3a2a, 0x6a3428, 0x4a4a52, 0x8a4a34, 0x5a3a30];
const TIMBER = 0x3a2a20;

export const HOME = { x0: 8, x1: 18, z0: -22, z1: -3, door: { x: 13, z: -3 } };   // (19 m deep: the hall, the counting room and the bedroom, and behind them the storeroom and the kitchen)
export const SPOTS = {
  bedroomYou: [16.9, -11.2], bedroomSib: [14.9, -11.2],
  fatherDesk: [11, -14.0], deskFront: [11, -11.6], ledger: [11, -13.4],
  hallTable: [12.5, -6.2], seatYou: [12.0, -5.2], seatSib: [13.4, -5.2], seatFather: [12.7, -7.3],
  hearth: [8.9, -6.2], doorIn: [13, -4.2], doorOut: [13, -1.5],
  jakob: [26, -39.6], warehouseDoor: [26, -38],
  square: [0, 44], scaffold: [0, 45], crowdBack: [0, 33.5],
  alley: [-24.8, 44.5], gate: [-35, 66], postern: [-27.5, 67.2],
};

let CHIMS = null;
// the houses' stuff: each its own grain (the same as the building models' materials of the same name)
const HOUSE_M = {};
const HOUSE_MAT = k => HOUSE_M[k] ??= addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: k === "tiles" ? 0.8 : 0.95 }),
  { scale: k === "brick" ? 1 : k === "tiles" ? 1 : 1.2, amount: k === "plaster" ? 0.3 : 0.42, grain: 0.6, surface: k });
function row(b, r, x0, z0, x1, z1, facades, win, lit, cols) {
  // one row of gable houses along the longer side of the lot
  const alongX = (x1 - x0) >= (z1 - z0);
  const L = alongX ? x1 - x0 : z1 - z0, D = alongX ? z1 - z0 : x1 - x0;
  let s = 0;
  while (s < L - 0.1) {
    let w = r.range(4.6, 7.4);
    if (L - s - w < 4) w = L - s;
    const h = r.range(7, 12.5);
    const brick = r() < 0.35;
    const wall = brick ? r.pick(BRICK) : r.pick(PLASTER);
    const roofH = w * r.range(0.8, 1.15);
    const roof = r.pick(ROOF);
    // centre of the house
    const cx = alongX ? x0 + s + w / 2 : (x0 + x1) / 2;
    const cz = alongX ? (z0 + z1) / 2 : z0 + s + w / 2;
    const ry = alongX ? 0 : Math.PI / 2;
    const bw = w - 0.06;
    // (and noted for the map, which draws the houses one by one as a town plan does)
    if (row.plots) row.plots.push([cx, cz, alongX ? bw : D, alongX ? D : bw]);
    // body (its walls and its roof each in their own stuff, when the street has them apart: plaster, brick, tiles)
    const wb = b.sub ? (brick ? b.sub.brick : b.sub.plaster) : b, rb = b.sub ? b.sub.tiles : b;
    wb.add(BOXG, wall, cx, h / 2, cz, 0, ry, 0, bw, h, D, 0.04);
    // the gable, as a triangular wall the depth of the house
    wb.add(gableGeo(bw, roofH, D), wall, cx, h, cz, 0, ry, 0, 1, 1, 1, 0.04);
    // two roof slopes
    const slope = Math.hypot(bw / 2, roofH), ang = Math.atan2(roofH, bw / 2);
    for (const sd of [-1, 1]) {
      const ox = sd * bw / 4, oy = h + roofH / 2;
      const px = alongX ? cx + ox : cx, pz = alongX ? cz : cz + ox;
      if (alongX) rb.add(BOXG, roof, px, oy + 0.08, pz, 0, 0, -sd * ang, slope + 0.35, 0.16, D + 0.5, 0.06);
      else rb.add(BOXG, roof, px, oy + 0.08, pz, sd * ang, 0, 0, D + 0.5, 0.16, slope + 0.35, 0.06);
    }
    // a chimney stack on most of them, up through one slope near the ridge (its smoke is the town's evening)
    // (from the house's own place, not the street's random run, so the rest of the street is as it always was)
    { const hh = (q => q - Math.floor(q))(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453);
      if (hh < 0.6) {
        const sd = hh < 0.3 ? -1 : 1, off = bw * 0.18, ly = h + roofH * (1 - off / (bw / 2)), dz = (hh * 7 % 1 - 0.5) * D * 0.5;
        const px = alongX ? cx + sd * off : cx + dz, pz = alongX ? cz + dz : cz + sd * off;
        b.add(BOXG, brick ? 0x7a3a2e : 0x8a8478, px, ly + 0.6, pz, 0, ry, 0, 0.55, 1.8, 0.55, 0.03);
        b.add(BOXG, 0x4a4440, px, ly + 1.55, pz, 0, ry, 0, 0.66, 0.12, 0.66);
        (CHIMS || []).push({ x: px, y: ly + 1.65, z: pz });
      } }
    // cornice
    b.add(BOXG, brick ? 0xcfc4b0 : TIMBER, cx, h + 0.05, cz, 0, ry, 0, bw + 0.12, 0.14, D + 0.12);
    // the faces that look onto a street get windows, a door, and beams
    for (const f of facades) {
      // f is +1 (the high side) or -1 (the low side) across the depth
      const fo = f * (D / 2 + 0.04);
      const put = (lx, y, wdt, hgt, color, into = b, dep = 0.08) => {
        const px = alongX ? cx + lx : cx + fo, pz = alongX ? cz + fo : cz + lx;
        into.add(BOXG, color, px, y, pz, 0, ry, 0, wdt, hgt, dep);
      };
      const floors = Math.max(2, Math.floor((h - 0.6) / 3));
      const nw = Math.max(1, Math.floor((bw - 0.6) / 1.7));
      for (let fl = 0; fl < floors; fl++) {
        const y = 1.7 + fl * 3;
        if (y + 0.8 > h) break;
        for (let i = 0; i < nw; i++) {
          const lx = (i - (nw - 1) / 2) * (bw / nw);
          if (fl === 0 && i === Math.floor(nw / 2)) { put(lx, 1.15, 1.1, 2.3, 0x3a2a1e); put(lx, 2.4, 1.3, 0.14, TIMBER); continue; }
          const isLit = r() < 0.38;
          put(lx, y, 0.8, 1.25, isLit ? 0xffd9a0 : 0x1e232c, isLit ? lit : win, 0.06);
          put(lx, y - 0.7, 1.0, 0.1, brick ? 0xcfc4b0 : TIMBER);
          // (a frame round it, and the glazing bars: a cross of wood and the little leaded panes)
          put(lx, y + 0.66, 0.92, 0.08, TIMBER, b, 0.1); put(lx - 0.44, y, 0.07, 1.3, TIMBER, b, 0.1); put(lx + 0.44, y, 0.07, 1.3, TIMBER, b, 0.1);
          put(lx, y, 0.05, 1.25, TIMBER, b, 0.1); put(lx, y + 0.12, 0.8, 0.05, TIMBER, b, 0.1);
          put(lx, y - 0.25, 0.8, 0.015, 0x2a2622, b, 0.09); put(lx, y + 0.42, 0.8, 0.015, 0x2a2622, b, 0.09);
          // (a timber house's frame shows between its windows: a post, and the braces either side of it — the crossed
          //  St Andrew's braces under the sills, a raking brace from post to beam above — as Hamburg's half-timbering is)
          if (!brick && i < nw - 1) {
            const px = lx + bw / nw / 2, gap = bw / nw - 1.0;
            if (gap > 0.35) {
              put(px, fl * 3 + 1.6, 0.16, 3, TIMBER, b, 0.1);
              const bl = Math.hypot(gap / 2, 0.8), ba = Math.atan2(0.8, gap / 2);
              for (const sd of [-1, 1]) {
                const qx = px + sd * gap / 4, qy = y - 1.1;
                const X = alongX ? cx + qx : cx + fo, Z = alongX ? cz + fo : cz + qx;
                b.add(BOXG, TIMBER, X, qy, Z, 0, ry, ba, bl, 0.12, 0.1);
                b.add(BOXG, TIMBER, X, qy, Z, 0, ry, -ba, bl, 0.12, 0.1);
              }
            }
          }
        }
        if (!brick && fl > 0) put(0, fl * 3 + 0.2, bw, 0.18, TIMBER);
      }
      if (!brick) { put(-bw / 2 + 0.1, h / 2, 0.18, h, TIMBER); put(bw / 2 - 0.1, h / 2, 0.18, h, TIMBER); }
      // a window up in the gable
      const gy = h + roofH * 0.3;
      const isLit = r() < 0.3;
      put(0, gy, 0.6, 0.9, isLit ? 0xffd9a0 : 0x1e232c, isLit ? lit : win, 0.06);
      put(0, gy, 0.04, 0.9, TIMBER, b, 0.1); put(0, gy + 0.1, 0.6, 0.04, TIMBER, b, 0.1); put(0, gy + 0.48, 0.7, 0.07, TIMBER, b, 0.1);
    }
    cols.push(h);
    s += w;
  }
}
const BOXG = new THREE.BoxGeometry(1, 1, 1);

// ---------------------------------------------------------------------------
export class Hamburg extends WorldBase {
  constructor() {
    super(Collision);
    this.name = "hamburg";
    SNOW.value = 0;
    this.bounds = { x0: -61.5, x1: 61.5, z0: -45.4, z1: 67.4 };
    const root = this.root;
    const r = rng(1683);
    const b = new Builder(), win = new Builder(), lit = new Builder(), props = new Builder();
    // (the houses' walls and roofs apart, each with the grain of what it is: lime plaster, brick in its courses, tiles)
    b.sub = { plaster: new Builder(), brick: new Builder(), tiles: new Builder(), stone: new Builder() };

    // ---- ground ----
    // cobbles, real ones: a photographed street, about three and a half metres to a tile
    // the cobbles run from the quay's edge back to the wall; past the quay is the Elbe
    const cob = groundTexture("cobbles", 1); cob.repeat.set(74, 58);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 201), new THREE.MeshStandardMaterial({ map: cob, roughness: 0.92, color: 0xc8c2b8 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -45.6 + 100.5);
    ground.receiveShadow = true;
    // (a street of the 1680s is no clean one: mud trodden into the joints and lying in broad dark patches, puddles
    //  standing in the low places with the sky in them, straw and dung along the gutters)
    addHook(ground.material, sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vStW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvStW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vStW;
        float stH(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float stN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(stH(i), stH(i + vec2(1, 0)), f.x), mix(stH(i + vec2(0, 1)), stH(i + vec2(1, 1)), f.x), f.y); }
        float stF(vec2 p) { return stN(p) * 0.5 + stN(p * 2.1 + 3.0) * 0.3 + stN(p * 4.3 + 7.0) * 0.2; }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float stMud = smoothstep(0.42, 0.7, stF(vStW.xz * 0.18)), stPud = smoothstep(0.66, 0.74, stF(vStW.xz * 0.11 + 13.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.44, 0.36) + vec3(0.03, 0.025, 0.015), stMud * 0.75);
          diffuseColor.rgb *= 1.0 - stPud * 0.35;
          float stStraw = smoothstep(0.83, 0.9, stN(vStW.xz * 3.1)) * smoothstep(0.5, 0.75, stF(vStW.xz * 0.25 + 5.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.36, 0.2), stStraw * 0.6);`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.12, stPud * 0.9);`);
    }, "street");
    root.add(ground);
    // the marsh, outside the wall
    const marsh = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshStandardMaterial({ map: groundTexture("meadow", 1), roughness: 1, color: 0xb8bca8 }));
    marsh.material.map.repeat.set(80, 40);
    marsh.rotation.x = -Math.PI / 2; marsh.position.set(0, 0.02, 172); marsh.receiveShadow = true;
    root.add(marsh);

    // ---- the harbour ----
    // the Elbe, wide as a sea here, out past the ships to the horizon
    // (the Elbe: grey-green and silty, holding the sky, the quays and the ships dark along it, a slow swell running)
    this.wm = new WaterMat({ deep: [0.03, 0.05, 0.055], round: [0.05, 0.045, 0.04], swell: 1.8 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900, 110, 60), this.wm.mat); trackWater(water, this.wm);
    water.rotation.x = -Math.PI / 2; water.position.set(0, -1.1, -496);
    water.receiveShadow = true;
    root.add(water);
    this.water = water;
    const wpos = water.geometry.attributes.position;
    this._wbase = Float32Array.from(wpos.array);
    // quay wall
    b.box(260, 3.2, 1.2, 0, -1.4, -46.6, 0x5a544c);
    b.box(260, 0.3, 1.4, 0, 0.1, -46.2, 0x6e685e);
    this.col.addBox(-130, -48, 130, -45.9, 1.2);
    for (let x = -58; x <= 58; x += 7) { props.add(new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8), 0x3a3632, x, 0.35, -45.5); this.col.addCircle(x, -45.5, 0.22, 0.7); }
    // ships
    this.ships = [];
    for (const [x, len, s] of [[-34, 22, 4], [4, 18, 7], [44, 26, 9]]) {
      // (the real ships of the age where they're loaded — Dutch-built, as half of Hamburg's were — a large and a middling)
      const sm = modelCopy(len >= 26 ? "ship_dutch" : len >= 22 ? "ship_dutch_m" : "ship_pinnace") || modelCopy(len >= 22 ? "ship_dutch" : "ship_dutch_m") || modelCopy("ship");
      const sh = sm ? (() => { const g = new THREE.Group(); sm.scene.scale.setScalar(len / 20); g.add(sm.scene); g.userData.bob = s; return g; })() : makeShip(len, s);
      sh.position.set(x, -1.3, -53.5); sh.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.04;
      root.add(sh); this.ships.push(sh);
    }
    // cargo on the quay
    for (let i = 0; i < 26; i++) {
      const x = r.range(-58, 58), z = r.range(-44.8, -40.5);
      if (Math.abs(x - 26) < 5) continue;
      const k = r();
      if (k < 0.45) { P.barrel(props, x, z); this.col.addCircle(x, z, 0.36, 1); }
      else if (k < 0.8) { P.crate(props, x, z, r.range(0.8, 1.1), 0, r() * 0.4); this.col.addCircle(x, z, 0.6, 1); }
      else { P.sack(props, x, z, 0, r() * 3); }
    }
    // a treadwheel crane
    b.box(4, 5, 4, -12, 2.5, -43, 0x6a4a30);
    b.add(new THREE.ConeGeometry(3.3, 3, 4), 0x5a3a30, -12, 6.5, -43, 0, Math.PI / 4, 0);
    b.box(0.4, 0.4, 9, -12, 7.5, -47, 0x5a4030, 0);
    this.col.addRect(-12, -43, 4, 4, 5);

    // ---- blocks of houses ----
    const heights = []; CHIMS = this.chimneys = [];
    row.plots = this.plots = [];
    for (const bl of BLOCKS) {
      const [x0, z0, x1, z1] = bl;
      const alongX = (x1 - x0) >= (z1 - z0);
      const D = alongX ? z1 - z0 : x1 - x0;
      const rows = D > 15 ? Math.round(D / 11) : 1;
      for (let i = 0; i < rows; i++) {
        const a = i / rows, c2 = (i + 1) / rows;
        const facades = rows === 1 ? [-1, 1] : i === 0 ? [-1] : i === rows - 1 ? [1] : [];
        if (alongX) row(b, r, x0, z0 + (z1 - z0) * a, x1, z0 + (z1 - z0) * c2, facades, win, lit, heights);
        else row(b, r, x0 + (x1 - x0) * a, z0, x0 + (x1 - x0) * c2, z1, facades, win, lit, heights);
      }
      this.col.addBox(x0, z0, x1, z1, 14);
    }

    // ---- the family house ----
    this.buildHome(b, lit, props);
    // ---- the warehouse ----
    this.buildWarehouse(b, props);
    // ---- St. Nikolai ----
    this.buildChurch(b, lit);
    // ---- the wall and the marsh gate ----
    this.buildWall(b, props, lit);

    // ---- the square: a well, stalls, and (on the morning it is needed) the scaffold ----
    props.add(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 14), 0x6e685e, -9, 0.45, 36);
    props.add(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 14), 0x22303a, -9, 0.88, 36);
    props.box(0.15, 2.2, 0.15, -10, 1.1, 36, TIMBER); props.box(0.15, 2.2, 0.15, -8, 1.1, 36, TIMBER);
    props.box(2.3, 0.15, 0.15, -9, 2.2, 36, TIMBER);
    this.col.addCircle(-9, 36, 1.2, 1);
    this.stalls = new THREE.Group();
    const sb = new Builder();
    for (const [x, z, c] of [[-11, 48, 0xb03a2e], [10, 48, 0x2e5a8a], [-11, 53, 0xd2a03a], [10, 53, 0x3a7a4a]]) {
      P.table(sb, x, z, 2.4, 1.2);
      for (const [px, pz] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) sb.box(0.08, 2.3, 0.08, x + px, 1.15, z + pz, TIMBER);
      sb.box(2.7, 0.06, 1.7, x, 2.35, z, c, 0, 0.05);
      for (let i = 0; i < 4; i++) P.sack(sb, x - 0.8 + i * 0.5, z, 0.82);
    }
    this.stalls.add(sb.build());
    root.add(this.stalls);
    this.stallCols = [[-11, 48], [10, 48], [-11, 53], [10, 53]].map(([x, z]) => this.col.addRect(x, z, 2.5, 1.3, 1));
    this.scaffold = new THREE.Group();
    const scb = new Builder();
    scb.box(6, 1.8, 6, 0, 0.9, 45, 0x5a4432, 0, 0.05);
    scb.box(6.3, 0.14, 6.3, 0, 1.85, 45, 0x6a5038);
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) scb.box(0.14, 1.1, 0.14, px, 2.4, 45 + pz, TIMBER);
    scb.box(6, 0.1, 0.1, 0, 2.9, 42, TIMBER); scb.box(6, 0.1, 0.1, 0, 2.9, 48, TIMBER);
    scb.box(0.1, 0.1, 6, -3, 2.9, 45, TIMBER); scb.box(0.1, 0.1, 6, 3, 2.9, 45, TIMBER);
    for (let i = 0; i < 6; i++) scb.box(1.6, 0.14, 0.4, 0, 0.15 + i * 0.3, 41.6 - (5 - i) * 0.4, 0x6a5038);
    scb.box(0.1, 3.2, 0.1, 2.2, 3.4, 47.2, TIMBER);
    this.scaffold.add(scb.build());
    this.scaffold.visible = false;
    root.add(this.scaffold);
    this.scaffoldCol = this.col.addRect(0, 45, 6.2, 6.2, 2); this.scaffoldCol.disabled = true;

    // ---- street lamps: a post, an arm, a lantern, and a pool of light under it ----
    const lampB = new Builder(), headB = new Builder();
    this.lampSpots = [[-2.4, -20], [2.4, -8], [-2.4, 12], [2.4, 24], [-20, 2.4], [6, 2.4], [22, -2.4], [45, 2.4], [-50, -2.4],
      [-32.6, 20], [-37.4, 50], [-32.6, -20], [-20, 37.6], [-14.4, 40], [14.4, 40], [-20, -38.6], [10, -38.6], [40, -38.6], [32.6, -20], [37.4, 30]];
    const glowTex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,190,110,0.55)"); g.addColorStop(1, "rgba(255,190,110,0)");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const glowGeo = new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2);
    for (const [x, z] of this.lampSpots) {
      lampB.add(new THREE.CylinderGeometry(0.08, 0.11, 3.4, 8), 0x3e3a36, x, 1.7, z);
      lampB.box(0.14, 0.3, 0.14, x, 0.15, z, 0x3a3632);
      lampB.box(0.06, 0.06, 0.6, x, 3.3, z, 0x2a2622, Math.atan2(-x, -z));
      const hx = x + Math.sin(Math.atan2(-x, -z)) * 0.3, hz = z + Math.cos(Math.atan2(-x, -z)) * 0.3;
      lampB.add(new THREE.ConeGeometry(0.2, 0.16, 4), 0x2a2622, hx, 3.28, hz, 0, Math.PI / 4, 0);
      headB.box(0.28, 0.36, 0.28, hx, 3.02, hz, 0xffffff);
      // (its iron frame: the corner posts and a bar round the middle of its glass — a lantern, not a glowing box)
      for (const [a, c2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lampB.box(0.035, 0.4, 0.035, hx + a * 0.145, 3.02, hz + c2 * 0.145, 0x2a2622);
      lampB.box(0.31, 0.03, 0.31, hx, 3.2, hz, 0x2a2622); lampB.box(0.3, 0.02, 0.3, hx, 3.04, hz, 0x2a2622);
      lampB.box(0.26, 0.04, 0.26, hx, 2.89, hz, 0x2a2622);
      this.col.addCircle(x, z, 0.12, 3.4);
      const gl = new THREE.Mesh(glowGeo, this.glowMat); gl.position.set(hx, 0.03, hz); gl.renderOrder = 1; root.add(gl);
    }
    root.add(lampB.build(MAT.solid));
    this.lampHeadMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x4a4038 });
    root.add(headB.build(this.lampHeadMat, { shadow: false }));

    // ---- candles: a holder, the wax, and (added below) the flame ----
    this.candleSpots = [[10.3, 0.82, -13.6], [11.75, 0.82, -6.4], [13.0, 0.82, -6.15], [8.75, 1.32, -5.65], [8.75, 1.32, -6.75], [14.3, 1.55, -3.52]];
    for (const [x, y, z] of this.candleSpots) {
      // (a real turned candlestick, scanned, where it's loaded)
      const cm = modelCopy("prop_candlestick"); if (cm) { props.object(cm.scene, x, y, z, (x * 3.7) % 6.28, 0.85); continue; }
      props.add(new THREE.CylinderGeometry(0.055, 0.065, 0.03, 10), 0xb08a3a, x, y + 0.015, z);
      props.add(new THREE.CylinderGeometry(0.024, 0.024, 0.17, 8), 0xf0e6cc, x, y + 0.115, z);
    }
    props.box(0.14, 0.3, 0.04, 14.3, 1.65, -3.34, 0x6a4a2e);     // the sconce by the door
    props.box(0.16, 0.03, 0.16, 14.3, 1.535, -3.46, 0x6a4a2e);

    // ---- stealth cover along the west lane and the south-west street ----
    this.cover = [];
    const cov = (fn, x, z, w, d, h) => { fn(); this.cover.push(this.col.addRect(x, z, w, d, h)); };
    cov(() => P.cart(props, -35.6, 46, 0), -35.6, 46, 1.6, 2.8, 1.25);
    cov(() => { P.crate(props, -33, 51); P.crate(props, -33, 52.1, 0.9); P.crate(props, -33, 51.5, 0.8, 1); }, -33, 51.5, 1.1, 2.2, 1.7);
    cov(() => { P.barrel(props, -37.2, 54); P.barrel(props, -37.2, 54.8); P.barrel(props, -36.5, 54.4); }, -36.9, 54.4, 1.4, 1.6, 1);
    cov(() => { P.crate(props, -32.9, 58.5, 1.1); P.crate(props, -32.9, 59.7); }, -32.9, 59.1, 1.2, 2.4, 1.15);
    cov(() => P.cart(props, -36.8, 62.5, Math.PI + 0.2), -36.8, 62.5, 1.9, 2.8, 1.25);
    cov(() => { P.crate(props, -20, 38.5); P.barrel(props, -21, 38.3); }, -20.5, 38.5, 2, 1.2, 1);
    cov(() => P.cart(props, -29.5, 41.5, Math.PI / 2), -29.5, 41.5, 2.8, 1.6, 1.25);
    // odds and ends elsewhere
    for (const [x, z] of [[-2.2, -30], [2.2, -18], [-2.3, 12], [30.5, -8], [-30.6, 10], [35.2, 25], [-35.5, -20], [20, 2.2], [-50, 2.2]]) {
      P.barrel(props, x, z); this.col.addCircle(x, z, 0.35, 1);
    }

    for (const bb of [b, props]) { const m = bb.build(); root.add(m); }
    for (const [k, sb] of Object.entries(b.sub)) if (!sb.empty) root.add(sb.build(HOUSE_MAT(k)));
    b.sub = null;
    const wm = win.build(MAT.pane, { shadow: false }); root.add(wm);
    const lm = lit.build(MAT.lit, { shadow: false }); root.add(lm);

    // lights — a fixed pool, switched on and off, so no scene ever recompiles
    // 0 hearth · 1 desk candle · 2 table candles · 3-5 torches and lanterns · 6 the door sconce · 7-8 the nearest street lamps
    this.pool = [];
    for (let i = 0; i < 9; i++) {
      const L = new THREE.PointLight(0xff9a4a, 0, 12, 1.7);
      L.castShadow = false;
      root.add(L); this.pool.push(L);
    }
    this.hearthFire = makeFlame(3.2, this.pool[0]); this.hearthFire.position.set(9.05, 0.25, -6.2);
    this.pool[0].distance = 10;
    root.add(this.hearthFire); this.flames.push(this.hearthFire);
    this.candles = this.candleSpots.map(([x, y, z], i) => {
      const L = i === 0 ? this.pool[1] : i === 1 ? this.pool[2] : i === 5 ? this.pool[6] : null;
      const f = makeFlame(0.55, L); f.position.set(x, y + 0.2, z);
      if (L) { L.color.set(0xffc27a); L.distance = i === 5 ? 7 : 6; L.position.y = 0.1; }
      root.add(f); this.flames.push(f);
      return f;
    });
    for (const i of [7, 8]) { this.pool[i].color.set(0xffc27a); this.pool[i].distance = 13; }
    this.lampLevel = 0; this._lampT = 0;

    // the small door by the marsh gate, drawn over everything while you are making for it — as the lamplight round a
    //  doorway, warm and faint, not a green box from another kind of game
    this.posternGlow = new THREE.Group();
    const pgFill = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.12, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    const pgEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 2.3, 0.05)), new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, fog: false }));
    pgFill.rotation.y = Math.PI; this.posternGlow.add(pgFill, pgEdge);
    this.posternGlow.position.set(-27.5, 1.1, 67.7);
    this.posternGlow.renderOrder = 999; pgFill.renderOrder = 999; pgEdge.renderOrder = 1000;
    this.posternGlow.visible = false;
    root.add(this.posternGlow);

    this.t = 0;
  }

  // Walls with gaps: from a to b along x (or z), with openings [[from,to],...]
  wallX(b, x0, x1, z, t, h, gaps, color, colTop = h) {
    let s = x0;
    for (const [g0, g1, gTop] of [...gaps, [x1, x1]]) {
      if (g0 > s) { b.box(g0 - s, h, t, (s + g0) / 2, h / 2, z, color); this.col.addBox(s, z - t / 2, g0, z + t / 2, colTop); }
      if (gTop !== undefined && g1 > g0) b.box(g1 - g0, h - gTop, t, (g0 + g1) / 2, gTop + (h - gTop) / 2, z, color);
      s = g1;
    }
  }
  wallZ(b, z0, z1, x, t, h, gaps, color, colTop = h) {
    let s = z0;
    for (const [g0, g1, gTop] of [...gaps, [z1, z1]]) {
      if (g0 > s) { b.box(t, h, g0 - s, x, h / 2, (s + g0) / 2, color); this.col.addBox(x - t / 2, s, x + t / 2, g0, colTop); }
      if (gTop !== undefined && g1 > g0) b.box(t, h - gTop, g1 - g0, x, gTop + (h - gTop) / 2, (g0 + g1) / 2, color);
      s = g1;
    }
  }

  buildHome(b, lit, props) {
    const H = HOME, wallC = 0xd9c7a0, inner = 0xcdb994, floorC = 0x6a5038, h = 9.5, ih = 3.2;
    // outside: body to the eaves, the gable, the roof
    const W = H.x1 - H.x0, D = H.z1 - H.z0, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
    this.wallX(b, H.x0, H.x1, H.z1 - 0.15, 0.3, h, [[12.4, 13.6, 2.3]], wallC);
    this.wallX(b, H.x0, H.x1, H.z0 + 0.15, 0.3, h, [], wallC);
    this.wallZ(b, H.z0, H.z1, H.x0 + 0.15, 0.3, h, [], wallC);
    this.wallZ(b, H.z0, H.z1, H.x1 - 0.15, 0.3, h, [], wallC);
    b.box(W, 0.25, D, cx, ih + 0.12, cz, 0x5a4432);           // the ceiling of the ground floor
    b.box(W - 0.6, 0.02, D - 0.6, cx, 0.01, cz, floorC);       // floorboards
    b.add(gableGeo(W, 7.5, D), wallC, cx, h, cz, 0, Math.PI / 2 * 0, 0);
    const slope = Math.hypot(W / 2, 7.5), ang = Math.atan2(7.5, W / 2);
    for (const sd of [-1, 1]) b.add(BOXG, 0x6a3428, cx + sd * W / 4, h + 3.75 + 0.08, cz, 0, 0, -sd * ang, slope + 0.4, 0.18, D + 0.6);
    // half-timbering on the front
    for (const y of [3.4, 6.4, 9.4]) b.box(W, 0.2, 0.1, cx, y, H.z1 + 0.02, TIMBER);
    for (const x of [H.x0 + 0.1, 10.8, 15.2, H.x1 - 0.1]) b.box(0.2, h, 0.1, x, h / 2, H.z1 + 0.02, TIMBER);
    for (const [x, y] of [[9.9, 1.7], [16.1, 1.7], [9.9, 4.9], [13, 4.9], [16.1, 4.9], [9.9, 7.9], [13, 7.9], [16.1, 7.9], [13, 11]]) {
      // (the glass a thin pane set back in its frame — as a box standing proud of the wall, its sides glowed with the
      //  leaded panes smeared across them — and round it the frame, its mullion and transom, the sill under)
      lit.box(0.84, 1.24, 0.02, x, y, H.z1 + 0.02, 0xffd9a0);
      b.box(1.06, 0.1, 0.1, x, y + 0.67, H.z1 + 0.05, TIMBER);
      for (const sd of [-1, 1]) b.box(0.1, 1.44, 0.1, x + sd * 0.48, y, H.z1 + 0.05, TIMBER);
      b.box(0.05, 1.24, 0.05, x, y, H.z1 + 0.045, TIMBER); b.box(0.84, 0.05, 0.05, x, y + 0.16, H.z1 + 0.045, TIMBER);
      b.box(1.16, 0.09, 0.18, x, y - 0.68, H.z1 + 0.08, TIMBER);
    }
    // a sign over the door: a sheaf of wheat, for the grain the house dealt in
    b.box(0.08, 0.08, 0.9, 13, 2.85, H.z1 + 0.45, TIMBER);
    b.box(0.7, 0.5, 0.05, 13, 2.45, H.z1 + 0.85, 0x6a4a2e);
    b.box(0.3, 0.3, 0.06, 13, 2.45, H.z1 + 0.86, 0xd2a03a);
    b.box(1.8, 0.12, 0.6, 13, 0.06, H.z1 + 0.3, 0x6e685e);    // doorstep

    // inside: the partition walls
    this.wallX(b, H.x0 + 0.3, H.x1 - 0.3, -9, 0.2, ih, [[10.5, 11.7, 2.2], [15, 16.2, 2.2]], inner, ih);
    this.wallZ(b, -15, -9, 14, 0.2, ih, [], inner, ih);
    // (and behind the counting room and the bedroom, the back of the house: a door from each into it — the counting
    //  room's in its west corner, the bedroom's between the beds — and a storeroom and a kitchen there, open to each
    //  other, so the house goes round in a ring: hall, counting room, storeroom, kitchen, bedroom, hall)
    this.wallX(b, H.x0 + 0.3, H.x1 - 0.3, -15, 0.2, ih, [[8.6, 9.6, 2.2], [15.4, 16.4, 2.2]], inner, ih);
    this.wallZ(b, H.z0 + 0.3, -15, 13.5, 0.2, ih, [[-19.2, -18.0, 2.2]], inner, ih);
    // inner faces of the outer walls, a paler plaster
    b.box(W - 0.62, ih, 0.02, cx, ih / 2, H.z0 + 0.31, inner);
    b.box(0.02, ih, D - 0.62, H.x0 + 0.31, ih / 2, cz, inner);
    b.box(0.02, ih, D - 0.62, H.x1 - 0.31, ih / 2, cz, inner);
    // (the front one stops either side of the door)
    b.box(12.4 - (H.x0 + 0.31), ih, 0.02, (H.x0 + 0.31 + 12.4) / 2, ih / 2, H.z1 - 0.31, inner);
    b.box((H.x1 - 0.31) - 13.6, ih, 0.02, (13.6 + H.x1 - 0.31) / 2, ih / 2, H.z1 - 0.31, inner);
    b.box(1.2, ih - 2.3, 0.02, 13, 2.3 + (ih - 2.3) / 2, H.z1 - 0.31, inner);
    for (const x of [9.5, 12, 14.5, 17]) b.box(0.18, 0.22, D - 0.6, x, ih - 0.1, cz, 0x4a3626);   // beams
    // the hall
    P.table(props, 12.7, -6.2, 2.4, 1.0);
    P.bench(props, 12.7, -5.3, 2.2); P.bench(props, 12.7, -7.1, 2.2);
    P.hearth(props, 8.7, -6.2, Math.PI / 2);
    P.barrel(props, 17.2, -8.4); P.sack(props, 16.9, -4.1); P.sack(props, 17.3, -4.4, 0, 1);
    // a round rye loaf on its board, at the end of the table (out of the line between your seat and Father's), and a
    // pewter plate at each place
    props.add(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 14), 0x8a5e36, 13.55, 0.84, -6.45);
    { const m = modelCopy("food_bread"); if (m) props.object(m.scene, 13.55, 0.8525, -6.45, 0.3, 1.9);
      else props.add(new THREE.SphereGeometry(0.15, 16, 10, 0, TAU, 0, Math.PI / 2), 0x7a4a26, 13.55, 0.85, -6.45, 0, 0.3, 0, 1.15, 0.62, 0.95); }
    // (a turned and carved wooden plate, scanned (Poly Haven, CC0), where it's loaded; the pewter where not)
    for (const [x, z] of [[12.0, -5.85], [13.4, -5.85], [12.7, -6.6]]) {
      { const m = modelCopy("prop_plate"); if (m) { props.object(m.scene, x, 0.826, z, x * 3.1, 1.05); continue; } }
      props.add(new THREE.CylinderGeometry(0.115, 0.09, 0.018, 16), 0x9c9a90, x, 0.835, z);
      props.add(new THREE.CylinderGeometry(0.07, 0.07, 0.004, 16), 0xb4b2a8, x, 0.845, z);
    }
    this.col.addRect(12.7, -6.2, 2.4, 1.0, 0.85);
    this.col.addRect(8.7, -6.2, 0.9, 1.9, 3);
    this.col.addCircle(17.2, -8.4, 0.35, 1);
    // the counting room
    P.table(props, 11, -13.6, 1.8, 0.9);
    P.shelf(props, 9.1, -12.2, 1.4, Math.PI / 2);
    P.shelf(props, 12.6, -14.45, 1.6, 0);
    props.box(0.45, 0.06, 0.34, 11.2, 0.84, -13.5, 0x6a2e22);   // the ledger
    for (const [x, z] of [[9.6, -10], [10.2, -10], [9.6, -10.6]]) P.crate(props, x, z, 0.6);
    this.col.addRect(11, -13.6, 1.8, 0.9, 0.85);
    this.col.addRect(9.1, -12.2, 0.4, 1.4, 2.2); this.col.addRect(12.6, -14.45, 1.6, 0.4, 2.2);
    this.col.addRect(9.9, -10.3, 1.3, 1.2, 0.6);
    // the storeroom: the house's grain and goods — sacks stacked, barrels, crates; somewhere to keep low behind
    for (const [x, z, n] of [[9.0, -16.0, 2], [9.0, -17.4, 1], [12.6, -16.2, 1], [9.2, -21.0, 2], [12.4, -20.6, 1]]) for (let k = 0; k < n; k++) P.sack(props, x + k * 0.15, z + k * 0.3, k * 0.4, k);
    for (const [x, z] of [[10.8, -21.1], [11.6, -21.1], [12.8, -18.6]]) { P.barrel(props, x, z); this.col.addCircle(x, z, 0.35, 1); }
    for (const [x, z, s2] of [[10.2, -17.8, 0.8], [10.9, -17.8, 0.7], [10.5, -18.5, 0.6], [11.9, -16.0, 0.7]]) P.crate(props, x, z, s2);
    this.col.addRect(10.55, -18.1, 1.5, 1.2, 0.9); this.col.addRect(11.9, -16.0, 0.7, 0.7, 0.7);
    this.col.addRect(9.0, -16.6, 0.9, 2.0, 0.6); this.col.addRect(9.2, -21.0, 1.0, 0.8, 0.6);
    // the kitchen: a long work table, a dresser on the wall, a water butt by the back window
    P.table(props, 15.9, -19.6, 2.0, 0.8); this.col.addRect(15.9, -19.6, 2.0, 0.8, 0.85);
    P.shelf(props, 17.45, -17.2, 1.6, -Math.PI / 2); this.col.addRect(17.45, -17.2, 0.4, 1.6, 2.2);
    P.barrel(props, 14.2, -21.1); this.col.addCircle(14.2, -21.1, 0.35, 1);
    P.sack(props, 17.2, -21.0, 0, 0.3);
    // the bedroom
    // (a merchant's beds: carved and posted, the linen white — scanned (Poly Haven, CC0), where they're loaded)
    for (const x of [14.9, 16.9]) {
      const m = modelCopy("prop_bed");
      // (its linen as it would be in a house with a coal fire and no bleach: yellowed, greyed, not lit-white)
      if (m) { m.scene.traverse(o => { if (o.isMesh && o.material) addHook(o.material, sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\nfloat linenK = smoothstep(0.3, 0.6, dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)));\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.54, 0.44), linenK);").replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, linenK);"); }, "linen"); });
        props.object(m.scene, x, 0, -12.8, 0, 1); m.scene.scale.set(0.82, 1, 1.02); } else P.bed(props, x, -12.8, 0);
      this.col.addRect(x, -12.8, 1.15, 2.1, 0.6);
    }
    props.box(0.5, 0.5, 0.4, 17.3, 0.25, -9.6, 0x5a3e28);
    // ---- windows, from inside: small leaded panes in deep frames, the day showing through them (or the dark) ----
    // (old glass: the sky bright at the top of the pane, the yard's walls and roofs darker below, a little uneven)
    const gc = document.createElement("canvas"); gc.width = 8; gc.height = 64;
    { const x = gc.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, "#f4f7fa"); gr.addColorStop(0.45, "#dfe6ea"); gr.addColorStop(0.62, "#a8aea4"); gr.addColorStop(1, "#7c806e");
      x.fillStyle = gr; x.fillRect(0, 0, 8, 64); }
    const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    this.winGlass = new THREE.MeshBasicMaterial({ color: 0xc8d4dc, map: gt });
    const pane = (x, y, z, w, hh, faceZ) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), this.winGlass); g.position.set(x, y, z); g.rotation.y = faceZ > 0 ? 0 : Math.PI; this.root.add(g);
      // (the frame, the sill, and the lead between the little panes)
      const fz = z + faceZ * 0.03;
      b.box(w + 0.16, 0.08, 0.1, x, y + hh / 2 + 0.04, fz, TIMBER); b.box(w + 0.16, 0.08, 0.16, x, y - hh / 2 - 0.04, fz + faceZ * 0.03, TIMBER);
      b.box(0.08, hh, 0.1, x - w / 2 - 0.04, y, fz, TIMBER); b.box(0.08, hh, 0.1, x + w / 2 + 0.04, y, fz, TIMBER);
      b.box(0.05, hh, 0.04, x, y, fz, TIMBER);
      for (let i = 1; i < 4; i++) b.box(w, 0.012, 0.02, x, y - hh / 2 + hh * i / 4, fz - faceZ * 0.005, 0x2a2622);
      for (const k of [-0.25, 0.25]) b.box(0.012, hh, 0.02, x + w * k, y, fz - faceZ * 0.005, 0x2a2622);
    };
    pane(9.9, 1.7, H.z1 - 0.33, 0.9, 1.3, -1); pane(16.1, 1.7, H.z1 - 0.33, 0.9, 1.3, -1);      // the hall, onto the street
    pane(15.9, 1.95, H.z0 + 0.33, 0.7, 0.9, 1); pane(10.0, 1.8, H.z0 + 0.33, 0.8, 1.1, 1);      // the bedroom and the counting room, onto the yard
    // ---- what a merchant's house has in it ----
    // the hall: a dresser of pewter on the east wall, a candlestick on it
    props.box(0.5, 0.95, 1.5, 17.42, 0.475, -6.4, 0x5a3e28, 0, 0.04); props.box(0.32, 0.95, 1.5, 17.5, 1.42, -6.4, 0x5a3e28, 0, 0.03);
    for (const y of [1.2, 1.6]) { props.box(0.34, 0.03, 1.46, 17.48, y - 0.21, -6.4, 0x4a3220); for (let i = 0; i < 4; i++) {
      // (the carved wooden plates stood on edge along it, leaning back on the boards (Poly Haven, CC0), or pewter)
      const m = modelCopy("prop_plate");
      if (m) { props.object(m.scene, 17.29, y - 0.195 + 0.13, -6.95 + i * 0.36, 0, 1.25); m.scene.rotation.set(0, 0, Math.PI / 2 - 0.22); }
      else props.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), 0x9a9c98, 17.38, y - 0.04, -6.95 + i * 0.36, 0, 0, Math.PI / 2 - 0.25);
    } }
    // (brass goblets on it, scanned (Poly Haven, CC0), where they're loaded; a pewter flagon where not)
    if (modelCopy("prop_goblet")) for (const [z, ry] of [[-6.08, 0.4], [-5.8, 2.1]]) props.object(modelCopy("prop_goblet").scene, 17.2, 0.95, z, ry, 1);
    else props.add(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 8), 0x9a9c98, 17.3, 1.06, -6.0);
    this.col.addRect(17.42, -6.4, 0.5, 1.5, 1.9);
    // the counting room: an iron-bound strongbox, and the map of the Elbe pinned up on the west wall
    if (!P.chest(props, 13.3, -10.5, 0, 0.8)) {
      props.box(0.8, 0.5, 0.5, 13.3, 0.25, -10.5, 0x4a3420, 0, 0.03);
      for (const x of [13.05, 13.55]) props.box(0.06, 0.52, 0.52, x, 0.25, -10.5, 0x2a2724);
      props.box(0.12, 0.1, 0.03, 13.3, 0.36, -10.24, 0x3a3632);
    }
    this.col.addRect(13.3, -10.5, 0.8, 0.5, 0.6);
    props.box(0.02, 0.85, 1.15, H.x0 + 0.33, 1.85, -13.2, 0xd8c8a0);
    props.box(0.03, 0.9, 1.2, H.x0 + 0.32, 1.85, -13.2, 0x4a3626);
    for (let i = 0; i < 5; i++) props.box(0.025, 0.03, 0.5 + (i % 2) * 0.3, H.x0 + 0.345, 1.6 + i * 0.12, -13.25 + (i % 3) * 0.1, 0x5a7a8a);
    // the bedroom: a rag rug between the beds, a stool and a candle at their heads, a washstand, a cross over the door
    props.box(1.0, 0.012, 1.7, 15.9, 0.016, -11.6, 0x7a3a2e);
    for (let i = 0; i < 4; i++) props.box(1.0, 0.013, 0.08, 15.9, 0.017, -12.2 + i * 0.4, 0x5a4a3a);
    { const st = modelCopy("prop_stool"); if (st) props.object(st.scene, 15.9, 0, -13.6, 0.3, 0.9); else props.add(new THREE.CylinderGeometry(0.18, 0.16, 0.45, 8), 0x6a4a30, 15.9, 0.225, -13.6); }
    props.add(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 6), 0xe8e0c8, 15.9, 0.51, -13.6);
    props.box(0.5, 0.75, 0.42, 17.55, 0.375, -10.0, 0x5a3e28, Math.PI / 2, 0.03);
    props.add(new THREE.CylinderGeometry(0.17, 0.11, 0.09, 12), 0xd8d4c8, 17.55, 0.8, -10.0);
    props.add(new THREE.CylinderGeometry(0.06, 0.08, 0.24, 10), 0xc8c0b0, 17.62, 0.95, -9.82);
    this.col.addRect(17.55, -10.0, 0.42, 0.5, 0.8);
    props.box(0.06, 0.42, 0.04, 15.9, 2.55, -9.12, 0x3a2a1c); props.box(0.28, 0.06, 0.04, 15.9, 2.62, -9.12, 0x3a2a1c);
    // a clothes chest at the foot of each bed, iron-cornered
    // (the real chest's lid is domed: the blanket only on the old flat one)
    let flat = false;
    for (const x of [14.9, 16.9]) {
      if (P.chest(props, x, -11.57, 0, 0.86)) continue;
      flat = true;
      props.box(0.86, 0.46, 0.38, x, 0.23, -11.57, 0x5e4028, 0, 0.03); props.box(0.9, 0.06, 0.42, x, 0.48, -11.57, 0x4e3420);
      for (const sx of [-0.4, 0.4]) props.box(0.05, 0.47, 0.39, x + sx, 0.235, -11.57, 0x2a2622);
      props.box(0.1, 0.12, 0.03, x, 0.38, -11.37, 0x2a2622);
      this.col.addRect(x, -11.57, 0.86, 0.38, 0.5);
    }
    if (flat) { props.box(0.7, 0.12, 0.32, 14.9, 0.57, -11.57, 0x8a6a4a); props.box(0.7, 0.02, 0.32, 14.9, 0.64, -11.57, 0x6a4a3a); }
    // a peg rail on the partition wall: Father's old coat that came down to you, and a cap
    const wx = 14.12;
    props.box(0.05, 0.1, 1.6, wx, 1.75, -10.6, 0x4e3420);
    for (const z of [-11.2, -10.6, -10.0]) props.add(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), 0x3a2a1c, wx + 0.06, 1.75, z, 0, 0, Math.PI / 2);
    props.box(0.12, 0.9, 0.45, wx + 0.1, 1.28, -11.2, 0x3e4a5a, 0, 0.02); props.box(0.14, 0.18, 0.5, wx + 0.1, 1.68, -11.2, 0x36404e);
    props.add(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 10), 0x2a2420, wx + 0.12, 1.66, -10.0); props.add(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 12), 0x2a2420, wx + 0.12, 1.62, -10.0);
    props.box(0.08, 0.55, 0.32, wx + 0.08, 1.42, -10.6, 0xd8ccb0);          // a shirt
    // a shelf on the east wall over the washstand's corner, with a book, a box and a jug
    const ex = H.x1 - 0.42;
    props.box(0.22, 0.04, 1.0, ex, 1.55, -11.4, 0x4e3420);
    // (on two knee brackets — an upright against the wall and a strut under the board — not two blocks)
    for (const z of [-11.75, -11.05]) {
      props.box(0.03, 0.2, 0.04, ex + 0.095, 1.43, z, 0x3a2a1c);
      props.add(new THREE.BoxGeometry(0.03, 0.22, 0.035), 0x3a2a1c, ex + 0.015, 1.45, z, 0, 0, Math.PI / 4);
    }
    props.box(0.15, 0.06, 0.2, ex, 1.6, -11.7, 0x5c3a30); props.box(0.1, 0.1, 0.14, ex, 1.62, -11.4, 0x7a5a3a);
    // (and the jug a jug: a stoneware belly, a neck and a lip, turned on the wheel)
    props.add(new THREE.LatheGeometry([[0, 0], [0.048, 0], [0.062, 0.03], [0.068, 0.075], [0.056, 0.115], [0.034, 0.145], [0.03, 0.165], [0.037, 0.178], [0.033, 0.182]].map(([x, y]) => new THREE.Vector2(x, y)), 14), 0x8a6a4a, ex, 1.57, -11.1);
    // skirting boards round the room, where the plaster meets the floor
    props.box(0.03, 0.14, 5.5, 14.11, 0.07, -11.9, 0x3e2c1e); props.box(0.03, 0.14, 5.5, H.x1 - 0.33, 0.07, -11.9, 0x3e2c1e);
    props.box(3.5, 0.14, 0.03, 15.9, 0.07, H.z0 + 0.33, 0x3e2c1e);
    // the front door, on a hinge
    const door = new THREE.Group();
    // a door in old oxblood paint, weathered dark, in a darker frame
    for (const zz of [H.z1 - 0.33, H.z1 + 0.03]) {
      b.box(0.14, 2.45, 0.08, 12.33, 1.22, zz, TIMBER); b.box(0.14, 2.45, 0.08, 13.67, 1.22, zz, TIMBER);
      b.box(1.48, 0.14, 0.08, 13, 2.38, zz, TIMBER);
    }
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.28, 0.1), mat(0x5a2c24, { roughness: 0.85, surface: "wood" }));
    for (const [y, h] of [[0.45, 0.08], [1.14, 0.08], [1.85, 0.08]]) { const band = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.12), mat(0x2a2622, { metalness: 0.6, roughness: 0.5 })); band.position.set(0, y - 1.14, 0); leaf.add(band); }
    leaf.position.set(0.6, 1.14, 0); leaf.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), mat(0x2a2a2a, { metalness: 0.8 }));
    knob.position.set(1.05, 1.05, 0.07); leaf.add(knob.clone()); leaf.add(knob);
    door.add(leaf); door.position.set(12.4, 0, H.z1 - 0.15);
    this.root.add(door);
    this.door = door; this.doorOpen = false; this.doorAngle = 0;
    this.doorCol = this.col.addBox(12.4, H.z1 - 0.3, 13.6, H.z1, 2.3);
    this.doorIt = this.addInteract({ x: 13, y: 1.2, z: H.z1 - 0.1, reach: 2, label: () => this.doorOpen ? "Close the door" : "Open the door", use: () => this.setDoor(!this.doorOpen), can: () => !this.doorLocked });
  }
  setDoor(open, silent) {
    this.doorOpen = open; this.doorCol.disabled = open;
    if (!silent) AUDIO.door(open);
  }
  buildWarehouse(b, props) {
    const x0 = 20, x1 = 32, z0 = -38, z1 = -28, h = 8, c = 0x7a4a36;
    this.wallX(b, x0, x1, z0 + 0.2, 0.4, h, [[24, 28, 3.6]], c);
    this.wallX(b, x0, x1, z1 - 0.2, 0.4, h, [], c);
    this.wallZ(b, z0, z1, x0 + 0.2, 0.4, h, [], c);
    this.wallZ(b, z0, z1, x1 - 0.2, 0.4, h, [], c);
    b.add(gableGeo(z1 - z0, 5, x1 - x0), c, 26, h, -33, 0, Math.PI / 2, 0);
    const slope = Math.hypot(5, 5), ang = Math.atan2(5, 5);
    for (const sd of [-1, 1]) b.add(BOXG, 0x5a3a30, 26, h + 2.5 + 0.08, -33 + sd * 2.5, ang * sd, 0, 0, 12.6, 0.18, slope + 0.4);
    b.box(x1 - x0, 0.3, z1 - z0, 26, h, -33, 0x4a3626);
    b.box(4.4, 0.3, 0.5, 26, 3.75, z0, TIMBER);
    b.box(0.5, 0.5, 2.2, 26, 7, z0 - 0.9, TIMBER);       // the hoist beam
    for (let i = 0; i < 14; i++) {
      const x = 21.5 + (i % 5) * 2.2, z = -30 - Math.floor(i / 5) * 2.1;
      if (Math.abs(x - 26) < 2 && z < -33) continue;
      if (i % 3) P.sack(props, x, z, 0, i); else P.crate(props, x, z, 1);
      this.col.addCircle(x, z, 0.55, 1);
    }
    P.table(props, 22, -36, 1.6, 0.8); this.col.addRect(22, -36, 1.6, 0.8, 0.85);
    props.box(0.4, 0.05, 0.3, 22.2, 0.84, -36, 0xe8dcc0);
  }
  buildChurch(b, lit) {
    const stone = 0x8a7a68, brick = 0x7a4432;
    b.box(16, 14, 9, 0, 7, 62, brick, 0, 0.03);
    b.add(gableGeo(16, 9, 9), brick, 0, 14, 62, 0, Math.PI / 2 * 0, 0);
    const slope = Math.hypot(8, 9), ang = Math.atan2(9, 8);
    for (const sd of [-1, 1]) b.add(BOXG, 0x3e5a52, sd * 4, 14 + 4.5 + 0.08, 62, 0, 0, -sd * ang, slope + 0.4, 0.2, 9.6);
    b.box(6.5, 36, 6.5, 0, 18, 57.5, brick, 0, 0.03);
    b.box(7.2, 0.6, 7.2, 0, 36, 57.5, stone);
    b.add(new THREE.ConeGeometry(4.2, 26, 8), 0x4a7a6a, 0, 49, 57.5, 0, Math.PI / 8, 0);
    b.add(new THREE.SphereGeometry(0.5, 8, 6), 0xd4af37, 0, 62.4, 57.5);
    // windows: tall and pointed, dim
    for (const x of [-6, -2.2, 2.2, 6]) lit.box(1.2, 5, 0.03, x, 7, 57.45, 0xe0b070);
    for (const y of [12, 22, 30]) lit.box(1.4, 3, 0.03, 0, y, 54.2, 0xe0b070);
    b.box(2.2, 3.6, 0.2, 0, 1.8, 54.2, 0x3a2418);
    this.col.addBox(-8, 57.5, 8, 66.5, 20); this.col.addBox(-3.3, 54.2, 3.3, 61, 40);
  }
  buildWall(b, props, lit) {
    const stone = 0x8a8072, top = 7;
    // (in stone's own grain — courses and joints — and with some build to it: a battered foot, a string course under the
    //  merlons, buttresses along the inside; it stood at the end of every street as a plain grey slab)
    const sw = (b.sub && b.sub.stone) || b;
    const seg = (x0, x1) => {
      sw.box(x1 - x0, top, 2.4, (x0 + x1) / 2, top / 2, 69.2, stone, 0, 0.03);
      sw.box(x1 - x0, 0.9, 2.9, (x0 + x1) / 2, 0.45, 69.2, 0x7a7266, 0, 0.03);
      sw.box(x1 - x0, 0.22, 2.7, (x0 + x1) / 2, top - 0.6, 69.2, 0x9a9282);
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.6) sw.box(0.8, 0.8, 2.4, x, top + 0.4, 69.2, stone);
      for (let x = x0 + 4; x < x1 - 2; x += 9) sw.box(1.1, top - 1.2, 0.9, x, (top - 1.2) / 2, 67.6, 0x80776a, 0, 0.03);
      this.col.addBox(x0, 68, x1, 70.4, 20);
    };
    seg(-64, -40); seg(-30, 64);
    // side walls
    for (const sx of [-1, 1]) {
      sw.box(2.4, top, 110, sx * 63.2, top / 2, 15, stone, 0, 0.03);
      sw.box(2.9, 0.9, 110, sx * 63.2, 0.45, 15, 0x7a7266, 0, 0.03);
      sw.box(2.7, 0.22, 110, sx * 63.2, top - 0.6, 15, 0x9a9282);
      for (let z = -38; z < 68; z += 9) sw.box(0.9, top - 1.2, 1.1, sx * 61.6, (top - 1.2) / 2, z, 0x80776a, 0, 0.03);
      for (let z = -39.5; z < 69; z += 1.6) sw.box(2.4, 0.8, 0.8, sx * 63.2, top + 0.4, z, stone);
    }
    this.col.addBox(-64.4, -40, -62, 70, 20); this.col.addBox(62, -40, 64.4, 70, 20);
    // the gatehouse: a tower over an arched passage — the arch turned in dressed stone, the passage dark behind its
    //  doors; the doors themselves arched, of upright planks, strapped and studded with iron, a wicket in one leaf;
    //  the city's arms over the arch, battlements along the top, and its roof (it stood as a grey slab with a flat
    //  brown board for a door)
    { const gx = -35, fz = 66.2, H = 13, R = 2, SP = 5.2, dz = fz + 0.7, dress = 0xa69c8a;
      b.box(3, H, 6, gx - 3.5, H / 2, 69.2, stone, 0, 0.02); b.box(3, H, 6, gx + 3.5, H / 2, 69.2, stone, 0, 0.02);
      b.box(4, H - SP - R - 0.6, 6, gx, (SP + R + 0.6 + H) / 2, 69.2, stone, 0, 0.02);
      // (the spandrels over the arch, filled course by course down to its curve)
      for (let i = 0; i < 16; i++) { const x = -R + (i + 0.5) * (2 * R / 16), yc = SP + Math.sqrt(Math.max(0, R * R - x * x)); const h = SP + R + 0.6 - yc; if (h > 0.01) b.box(2 * R / 16 + 0.01, h, 6, gx + x, yc + h / 2, 69.2, stone); }
      // (the arch's dressed voussoirs, and its jambs)
      for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; b.add(BOXG, dress, gx + Math.cos(a) * (R + 0.25), SP + Math.sin(a) * (R + 0.25), fz - 0.04, 0, 0, a - Math.PI / 2, 0.62, 0.5, 0.2); }
      for (const sd of [-1, 1]) for (let y = 0.4; y < SP; y += 0.9) b.box(0.55 + (Math.round(y) % 2) * 0.2, 0.86, 0.2, gx + sd * (R + 0.25), y + 0.03, fz - 0.04, dress);
      // (the passage behind, dark)
      b.box(2 * R, SP, 0.1, gx, SP / 2, fz + 2.5, 0x15120f); b.add(new THREE.CircleGeometry(R, 20, 0, Math.PI), 0x15120f, gx, SP, fz + 2.45, 0, Math.PI, 0);
      // (the doors: upright planks, each its own shade, under an arched head; iron straps and their studs; the wicket)
      const planks = 14;
      for (let i = 0; i < planks; i++) { const x = -R + (i + 0.5) * (2 * R / planks), top = SP + Math.sqrt(Math.max(0, R * R - x * x)) - 0.05, c = [0x4a3020, 0x523624, 0x46301e, 0x4e3422][i % 4]; b.box(2 * R / planks - 0.015, top, 0.12, gx + x, top / 2, dz, c); }
      for (const y of [0.9, 2.6, 4.3]) for (const sd of [-1, 1]) {
        b.box(R - 0.12, 0.12, 0.05, gx + sd * (R / 2 + 0.02), y, dz - 0.085, 0x26231f);
        for (let k = 0; k < 6; k++) b.add(new THREE.SphereGeometry(0.035, 5, 3), 0x3a3632, gx + sd * (0.2 + k * 0.32), y, dz - 0.115);
      }
      b.box(0.08, SP + R - 0.1, 0.06, gx, (SP + R) / 2, dz - 0.08, 0x2e2a26);
      b.box(0.9, 1.8, 0.03, gx + 1.0, 0.95, dz - 0.075, 0x3e2a1a); b.box(0.06, 0.06, 0.06, gx + 0.66, 0.95, dz - 0.1, 0x2a2622);
      // (the arms of Hamburg over the arch: a white castle of three towers on red)
      b.box(1.7, 2.0, 0.12, gx, SP + R + 2.2, fz - 0.07, 0xa02a22); b.box(1.9, 2.2, 0.08, gx, SP + R + 2.2, fz - 0.02, dress);
      b.box(1.1, 0.6, 0.06, gx, SP + R + 1.75, fz - 0.15, 0xe8e2d4);
      for (const [x, h] of [[-0.4, 0.95], [0, 1.25], [0.4, 0.95]]) b.box(0.24, h, 0.06, gx + x, SP + R + 1.75 + h / 2, fz - 0.15, 0xe8e2d4);
      b.box(0.3, 0.42, 0.065, gx, SP + R + 1.66, fz - 0.16, 0x2a2622);
      // (a string course, and the battlements round the top of the tower, the roof standing within them)
      b.box(10.4, 0.25, 6.4, gx, H - 2.2, 69.2, dress);
      for (let x = -4.6; x <= 4.6; x += 1.3) { b.box(0.7, 0.9, 0.5, gx + x, H + 0.45, fz + 0.25, stone); b.box(0.7, 0.9, 0.5, gx + x, H + 0.45, 72.2 - 0.25, stone); }
      for (let z = fz + 1.2; z <= 71.4; z += 1.3) { b.box(0.5, 0.9, 0.7, gx - 4.75, H + 0.45, z, stone); b.box(0.5, 0.9, 0.7, gx + 4.75, H + 0.45, z, stone); }
      b.add(new THREE.ConeGeometry(5.4, 6, 4), 0x5a3a30, gx, H + 3, 69.2, 0, Math.PI / 4, 0);
      b.add(new THREE.CylinderGeometry(0.04, 0.06, 1.4, 5), 0x2a2622, gx, H + 6.6, 69.2);
      this.col.addBox(-40, 66.2, -30, 72.2, 20); }
    // the postern: a small door in the wall beside the gate
    // pale dressed stone round it, so it shows against the rubble of the wall
    b.box(1.7, 2.7, 0.12, -27.5, 1.35, 67.9, 0xc8bca8);
    b.box(1.15, 2.15, 0.1, -27.5, 1.08, 67.8, 0x8a5a30);
    for (const y of [0.4, 1.1, 1.8]) b.box(1.1, 0.08, 0.06, -27.5, y, 67.73, 0x2a2622);
    b.add(new THREE.SphereGeometry(0.05, 6, 4), 0x2a2622, -27.1, 1.1, 67.72);
    // a watch-lantern on a hook above it, burning low
    b.box(0.06, 0.06, 0.4, -27.5, 2.95, 67.7, 0x2a2622);
    lit.box(0.2, 0.28, 0.2, -27.5, 2.7, 67.55, 0xffd48a);
    // a brazier where the gate watch keeps warm
    props.add(new THREE.CylinderGeometry(0.4, 0.25, 0.6, 8), 0x2a2622, -40.5, 0.9, 64.2);
    props.box(0.1, 0.9, 0.1, -40.5, 0.45, 64.2, 0x2a2622);
    this.brazier = makeFlame(3.5); this.brazier.position.set(-40.5, 1.15, 64.2);
    this.root.add(this.brazier); this.flames.push(this.brazier);
    this.col.addCircle(-40.5, 64.2, 0.45, 1.3);
  }

  // on the minimap: cobbles, and the harbour water
  // on the map: cobbles as bare parchment, the Elbe hatched to the north, fields past the wall
  minimap(c, X, Z, S, big) {
    const W = c.canvas.width, H = c.canvas.height;
    c.fillStyle = "rgba(170,150,110,0.35)"; c.fillRect(0, 0, W, H);
    const wz = Z(-46); if (wz > 0) water(c, 0, 0, W, Math.min(H, wz));
    const gz = Z(70.4); if (gz < H) { c.fillStyle = "rgba(120,140,80,0.35)"; c.fillRect(0, Math.max(0, gz), W, H); }
  }
  // (over the blocks: each house's own plot ruled in, as on a town plan of the day, so a block reads as a row of houses
  //  and not one red slab — when the map is close enough for them to show)
  mapOver(c, X, Z, S) {
    if (!this.plots || S < 0.9) return;
    c.save(); c.strokeStyle = "rgba(59,42,26,0.5)"; c.lineWidth = Math.min(1, 0.35 + S * 0.12);
    for (const [x, z, w, d] of this.plots) c.strokeRect(X(x - w / 2), Z(z - d / 2), w * S, d * S);
    c.restore();
  }
  mapLabels(c, X, Z, S, set) {
    // the river is known to everyone; the rest only once you have been there
    label(c, "The Elbe", X(0), Z(-70), 20);
    if (seen(set, -20, -44)) label(c, "the harbour", X(-20), Z(-49), 12);
    if (seen(set, 0, 70)) label(c, "fields", X(0), Z(80), 14);
  }
  get mapTitle() { return "Hamburg, 1683"; }
  get mapBounds() { const b = this.bounds; return { x0: b.x0 - 8, x1: b.x1 + 8, z0: b.z0 - 22, z1: b.z1 + 14 }; }
  ceilingAt(x, z) {
    return (x > HOME.x0 && x < HOME.x1 && z > HOME.z0 && z < HOME.z1) ? 3.2 : Infinity;
  }
  // what is underfoot: floorboards at home, the marsh past the wall, cobbles everywhere else
  surfaceAt(x, z) { return this.inHome(x, z) ? "wood" : z > 70.5 ? "marsh" : "stone"; }
  inHome(x = G.player.pos.x, z = G.player.pos.z) { return x > HOME.x0 && x < HOME.x1 && z > HOME.z0 && z < HOME.z1; }

  update(dt) {
    // (the window glass: the colour of the day outside, bright at noon and gone dark at night)
    if (this.winGlass) { const f = G.scene.fog.color; this.winGlass.color.setRGB(f.r, f.g, f.b).multiplyScalar(0.8).lerp(new THREE.Color(0.75, 0.82, 0.9), 0.15 * Math.min(1, f.r * 2)); }
    this.t += dt;
    // the two street lamps nearest you actually light the street
    this._lampT -= dt;
    if (this._lampT <= 0 && this.lampLevel > 0 && G.player) {
      this._lampT = 0.4;
      const p = G.player.pos;
      const near = this.lampSpots.map(([x, z]) => [x, z, (x - p.x) ** 2 + (z - p.z) ** 2]).sort((a, b) => a[2] - b[2]);
      for (let k = 0; k < 2; k++) { const L = this.pool[7 + k]; L.position.set(near[k][0], 3.0, near[k][1]); L.intensity = this.lampLevel; }
    }
    // the door swings toward where it should be
    const want = this.doorOpen ? 1.55 : 0;
    this.doorAngle += (want - this.doorAngle) * Math.min(1, dt * 5);
    this.door.rotation.y = this.doorAngle;
    // water and ships
    if (this.wm) this.wm.update(dt);
    // gulls over the harbour
    if (!this.birds && !this._birdsLoading) { this._birdsLoading = true; import("./birds.js").then(m => { this.birds = new m.Birds(this, { gulls: true, at: { x: 0, z: -60 } }); }); }
    if (this.birds) this.birds.update(dt);
    // the town's chimneys: thin smoke from most of them, thicker toward evening
    if (this.chimneys && this.chimneys.length) {
      if (!this.smoke) this.smoke = new Smoke(this.root);
      const f = G.scene.fog, sun = G.sun ? Math.min(1, G.sun.intensity / 2.4) : 1, k = 0.3 + (1 - sun) * 0.3;
      const src = this._smk || (this._smk = this.chimneys.map(c => ({ x: c.x, y: c.y, z: c.z, k })));
      for (const c of src) c.k = k;
      this.smoke.update(dt, src, { x: 0.6, z: 0.25 }, G.player && G.player.pos, { color: new THREE.Color(0x77736f).multiplyScalar(0.35 + sun * 0.65).lerp(f.color, 0.18), fog: f.color, near: f.near, far: f.far });
      this.smoke.mat.uniforms.uScale.value = innerHeight * (window.devicePixelRatio || 1) / (2 * Math.tan(camera.fov * Math.PI / 360));
    }
    if (Math.floor(this.t * 20) !== this._wt) {
      this._wt = Math.floor(this.t * 20);
      const a = this.water.geometry.attributes.position, base = this._wbase;
      for (let i = 0; i < a.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        a.array[i * 3 + 2] = Math.sin(x * 0.18 + this.t * 1.1) * 0.12 + Math.cos(y * 0.23 + this.t * 0.8) * 0.1;
      }
      a.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
    }
    if (this.posternGlow.visible) {
      // (it fades as you come up to it — close by, you can see the door itself, and it isn't a sheet of light over the screen)
      const k = 0.55 + Math.sin(this.t * 3) * 0.45, pl = G.player;
      const near = pl ? Math.min(1, Math.max(0, (Math.hypot(pl.pos.x + 27.5, pl.pos.z - 67.7) - 3) / 5)) : 1;
      this.posternGlow.children[0].material.opacity = (0.06 + k * 0.1) * near;
      this.posternGlow.children[1].material.opacity = (0.22 + k * 0.28) * near;
    }
    for (const s of this.ships) {
      s.position.y = -1.3 + Math.sin(this.t * 0.7 + s.userData.bob) * 0.1;
      s.rotation.z = Math.sin(this.t * 0.5 + s.userData.bob) * 0.02;
    }
  }

  // which props exist depends on the day
  // the street lamps lit, as at night, whatever the chapter
  streetsAtNight(level = 3.2) {
    this.lampLevel = level; this.glowMat.opacity = 0.18;
    this.lampHeadMat.color.set(0xffd48a);
  }
  setChapter(ch) {
    const market = ch === 1;
    this.stalls.visible = market;
    for (const c of this.stallCols) c.disabled = !market;
    this.scaffold.visible = ch >= 3;
    this.scaffoldCol.disabled = ch < 3;
    this.brazier.visible = ch >= 2;
    this.posternGlow.visible = ch === 4;
    // the fire and the candles burn in the evening and the night; by dawn they are out
    const lit = ch <= 2;
    this.hearthFire.visible = lit;
    this.hearthFire.userData.flame.base = lit ? (ch === 2 ? 3 : 5) : 0; this.pool[0].intensity = this.hearthFire.userData.flame.base;
    this.candles.forEach((c, i) => {
      c.visible = lit;
      const L = c.userData.flame.light;
      if (L) { c.userData.flame.base = lit ? (i === 5 ? 1.6 : 2.2) : 0; L.intensity = c.userData.flame.base; }
    });
    for (let i = 3; i < 6; i++) this.pool[i].intensity = 0;
    // street lamps: lit at dusk and through the night, still burning in the morning mist
    this.lampLevel = { 1: 2.6, 2: 4.2, 3: 0, 4: 3.2 }[ch] ?? 0;
    // (the pool of light under a lamp only hints: the two nearest lamps' real light does the rest — at full it laid a flat
    //  beige disc over the cobbles that hid every stone)
    this.glowMat.opacity = { 1: 0.12, 2: 0.18, 3: 0, 4: 0.14 }[ch] ?? 0;
    this.lampHeadMat.color.set(this.lampLevel > 0 ? 0xffd48a : 0x4a4038);
    for (const i of [7, 8]) this.pool[i].intensity = 0;
    this._lampT = 0;
  }
}

// Wandering townsfolk for the evening: they walk loops of the streets.
export const ROUTES = [
  [[0, -36], [0, 25], [0, -36]],
  [[-20, 0], [40, 0], [-20, 0]],
  [[-35, -20], [-35, 30], [-35, -20]],
  [[35, -30], [35, 40], [35, -30]],
  [[-50, -42], [50, -42], [-50, -42]],
  [[-10, 35], [10, 52], [-10, 35]],
  [[20, -41], [-30, -41], [20, -41]],
  [[-60, 0], [-4, 0], [-60, 0]],
];
export { makeScroll };
void TAU;
