// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Hamburg, 1683. A harbour on the north side, the family's house on the lane
// behind it, the square and St. Nikolai to the south, and the city wall with
// the marsh gate in its south-west corner. The streets are laid out by hand;
// the houses along them are generated, from a fixed seed, so it is the same
// city every time.

import { THREE, Builder, Collision, MAT, mat, rng, gableGeo, makeFlame, TAU, groundTexture, SNOW } from "./core.js";
import { WorldBase, G } from "./engine.js";
import { P, makeShip, makeScroll, modelCopy } from "./models.js";
import { AUDIO } from "./audio.js";
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
  [3, -28, 8, -3], [8, -28, 18, -15], [18, -28, 32, -3], [3, -38, 20, -28],
  [38, -38, 62, -3],
  [-62, 3, -38, 66], [-32, 3, -15, 37], [-15, 3, -3, 30], [3, 3, 32, 30],
  [-32, 43, -26, 53.5], [-23.5, 43, -15, 64], [-32, 56, -23.5, 64],
  [-15, 56, -8.5, 66], [8.5, 56, 15, 66],
  [15, 30, 32, 66], [38, 3, 62, 66],
];
const PLASTER = [0xe8dcc4, 0xd9c7a0, 0xc9a77a, 0xe0d0b0, 0xb7836a, 0xd6c3a5, 0xcfb89a];
const BRICK = [0x8a4a38, 0x7a3e30, 0x9a5a44, 0x6e3a2e];
const ROOF = [0x7a3a2a, 0x6a3428, 0x4a4a52, 0x8a4a34, 0x5a3a30];
const TIMBER = 0x3a2a20;

export const HOME = { x0: 8, x1: 18, z0: -15, z1: -3, door: { x: 13, z: -3 } };
export const SPOTS = {
  bedroomYou: [16.9, -11.2], bedroomSib: [14.9, -11.2],
  fatherDesk: [11, -14.0], deskFront: [11, -11.6], ledger: [11, -13.4],
  hallTable: [12.5, -6.2], seatYou: [12.0, -5.2], seatSib: [13.4, -5.2], seatFather: [12.7, -7.3],
  hearth: [8.9, -6.2], doorIn: [13, -4.2], doorOut: [13, -1.5],
  jakob: [26, -39.6], warehouseDoor: [26, -38],
  square: [0, 44], scaffold: [0, 45], crowdBack: [0, 33.5],
  alley: [-24.8, 44.5], gate: [-35, 66], postern: [-27.5, 67.2],
};

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
    // body
    b.add(BOXG, wall, cx, h / 2, cz, 0, ry, 0, bw, h, D, 0.04);
    // the gable, as a triangular wall the depth of the house
    b.add(gableGeo(bw, roofH, D), wall, cx, h, cz, 0, ry, 0, 1, 1, 1, 0.04);
    // two roof slopes
    const slope = Math.hypot(bw / 2, roofH), ang = Math.atan2(roofH, bw / 2);
    for (const sd of [-1, 1]) {
      const ox = sd * bw / 4, oy = h + roofH / 2;
      const px = alongX ? cx + ox : cx, pz = alongX ? cz : cz + ox;
      if (alongX) b.add(BOXG, roof, px, oy + 0.08, pz, 0, 0, -sd * ang, slope + 0.35, 0.16, D + 0.5, 0.06);
      else b.add(BOXG, roof, px, oy + 0.08, pz, sd * ang, 0, 0, D + 0.5, 0.16, slope + 0.35, 0.06);
    }
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
        }
        if (!brick && fl > 0) put(0, fl * 3 + 0.2, bw, 0.18, TIMBER);
      }
      if (!brick) { put(-bw / 2 + 0.1, h / 2, 0.18, h, TIMBER); put(bw / 2 - 0.1, h / 2, 0.18, h, TIMBER); }
      // a window up in the gable
      const gy = h + roofH * 0.3;
      const isLit = r() < 0.3;
      put(0, gy, 0.6, 0.9, isLit ? 0xffd9a0 : 0x1e232c, isLit ? lit : win, 0.06);
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

    // ---- ground ----
    // cobbles, real ones: a photographed street, about three and a half metres to a tile
    // the cobbles run from the quay's edge back to the wall; past the quay is the Elbe
    const cob = groundTexture("cobbles", 1); cob.repeat.set(74, 58);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 201), new THREE.MeshStandardMaterial({ map: cob, roughness: 0.92, color: 0xc8c2b8 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -45.6 + 100.5);
    ground.receiveShadow = true;
    root.add(ground);
    // the marsh, outside the wall
    const marsh = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshStandardMaterial({ map: groundTexture("meadow", 1), roughness: 1, color: 0xb8bca8 }));
    marsh.material.map.repeat.set(80, 40);
    marsh.rotation.x = -Math.PI / 2; marsh.position.set(0, 0.02, 172); marsh.receiveShadow = true;
    root.add(marsh);

    // ---- the harbour ----
    // the Elbe, wide as a sea here, out past the ships to the horizon
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900, 110, 60), new THREE.MeshStandardMaterial({ color: 0x2f607a, roughness: 0.12, metalness: 0.45 }));
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
      const sm = modelCopy("ship");
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
    const heights = [];
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
      headB.box(0.3, 0.38, 0.3, hx, 3.02, hz, 0xffffff);
      lampB.box(0.26, 0.04, 0.26, hx, 2.89, hz, 0x2a2622);
      this.col.addCircle(x, z, 0.12, 3.4);
      const gl = new THREE.Mesh(glowGeo, this.glowMat); gl.position.set(hx, 0.03, hz); gl.renderOrder = 1; root.add(gl);
    }
    root.add(lampB.build(MAT.solid));
    this.lampHeadMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x4a4038 });
    root.add(headB.build(this.lampHeadMat, { shadow: false }));

    // ---- candles: a holder, the wax, and (added below) the flame ----
    this.candleSpots = [[10.3, 0.82, -13.6], [12.2, 0.82, -6.35], [13.2, 0.82, -6.05], [8.75, 1.32, -5.65], [8.75, 1.32, -6.75], [14.3, 1.55, -3.52]];
    for (const [x, y, z] of this.candleSpots) {
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
    const wm = win.build(MAT.solid, { shadow: false }); root.add(wm);
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

    // the small door by the marsh gate, drawn over everything while you are making for it
    this.posternGlow = new THREE.Group();
    const pgFill = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshBasicMaterial({ color: 0x8cf08a, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, fog: false }));
    const pgEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 2.3, 0.05)), new THREE.LineBasicMaterial({ color: 0xa8ffa0, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false }));
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
      lit.box(0.9, 1.3, 0.08, x, y, H.z1 + 0.06, 0xffd9a0);
      b.box(1.1, 0.1, 0.12, x, y - 0.72, H.z1 + 0.06, TIMBER);
    }
    // a sign over the door: a sheaf of wheat, for the grain the house dealt in
    b.box(0.08, 0.08, 0.9, 13, 2.85, H.z1 + 0.45, TIMBER);
    b.box(0.7, 0.5, 0.05, 13, 2.45, H.z1 + 0.85, 0x6a4a2e);
    b.box(0.3, 0.3, 0.06, 13, 2.45, H.z1 + 0.86, 0xd2a03a);
    b.box(1.8, 0.12, 0.6, 13, 0.06, H.z1 + 0.3, 0x6e685e);    // doorstep

    // inside: the partition walls
    this.wallX(b, H.x0 + 0.3, H.x1 - 0.3, -9, 0.2, ih, [[10.5, 11.7, 2.2], [15, 16.2, 2.2]], inner, ih);
    this.wallZ(b, H.z0 + 0.3, -9, 14, 0.2, ih, [], inner, ih);
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
    props.box(0.5, 0.3, 0.35, 12.3, 0.95, -6.1, 0xa87a4a);   // a loaf on the table
    props.box(0.25, 0.08, 0.25, 13.3, 0.86, -6.0, 0xd8d0c0); props.box(0.25, 0.08, 0.25, 12.0, 0.86, -6.3, 0xd8d0c0);
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
    // the bedroom
    P.bed(props, 14.9, -12.8, 0); P.bed(props, 16.9, -12.8, 0);
    this.col.addRect(14.9, -12.8, 1, 2.1, 0.6); this.col.addRect(16.9, -12.8, 1, 2.1, 0.6);
    props.box(0.5, 0.5, 0.4, 17.3, 0.25, -9.6, 0x5a3e28);
    // ---- windows, from inside: small leaded panes in deep frames, the day showing through them (or the dark) ----
    this.winGlass = new THREE.MeshBasicMaterial({ color: 0xc8d4dc });
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
    for (const y of [1.2, 1.6]) { props.box(0.34, 0.03, 1.46, 17.48, y - 0.21, -6.4, 0x4a3220); for (let i = 0; i < 4; i++) props.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), 0x9a9c98, 17.38, y - 0.04, -6.95 + i * 0.36, 0, 0, Math.PI / 2 - 0.25); }
    props.add(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 8), 0x9a9c98, 17.3, 1.06, -6.0);
    this.col.addRect(17.42, -6.4, 0.5, 1.5, 1.9);
    // the counting room: an iron-bound strongbox, and the map of the Elbe pinned up on the west wall
    props.box(0.8, 0.5, 0.5, 13.3, 0.25, -10.5, 0x4a3420, 0, 0.03);
    for (const x of [13.05, 13.55]) props.box(0.06, 0.52, 0.52, x, 0.25, -10.5, 0x2a2724);
    props.box(0.12, 0.1, 0.03, 13.3, 0.36, -10.24, 0x3a3632);
    this.col.addRect(13.3, -10.5, 0.8, 0.5, 0.6);
    props.box(0.02, 0.85, 1.15, H.x0 + 0.33, 1.85, -13.2, 0xd8c8a0);
    props.box(0.03, 0.9, 1.2, H.x0 + 0.32, 1.85, -13.2, 0x4a3626);
    for (let i = 0; i < 5; i++) props.box(0.025, 0.03, 0.5 + (i % 2) * 0.3, H.x0 + 0.345, 1.6 + i * 0.12, -13.25 + (i % 3) * 0.1, 0x5a7a8a);
    // the bedroom: a rag rug between the beds, a stool and a candle at their heads, a washstand, a cross over the door
    props.box(1.0, 0.012, 1.7, 15.9, 0.016, -11.6, 0x7a3a2e);
    for (let i = 0; i < 4; i++) props.box(1.0, 0.013, 0.08, 15.9, 0.017, -12.2 + i * 0.4, 0x5a4a3a);
    props.add(new THREE.CylinderGeometry(0.18, 0.16, 0.45, 8), 0x6a4a30, 15.9, 0.225, -13.6);
    props.add(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 6), 0xe8e0c8, 15.9, 0.51, -13.6);
    props.box(0.5, 0.75, 0.42, 17.55, 0.375, -10.0, 0x5a3e28, Math.PI / 2, 0.03);
    props.add(new THREE.CylinderGeometry(0.17, 0.11, 0.09, 12), 0xd8d4c8, 17.55, 0.8, -10.0);
    props.add(new THREE.CylinderGeometry(0.06, 0.08, 0.24, 10), 0xc8c0b0, 17.62, 0.95, -9.82);
    this.col.addRect(17.55, -10.0, 0.42, 0.5, 0.8);
    props.box(0.06, 0.42, 0.04, 15.9, 2.55, -9.12, 0x3a2a1c); props.box(0.28, 0.06, 0.04, 15.9, 2.62, -9.12, 0x3a2a1c);
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
    for (const x of [-6, -2.2, 2.2, 6]) lit.box(1.2, 5, 0.1, x, 7, 57.45, 0xe0b070);
    for (const y of [12, 22, 30]) lit.box(1.4, 3, 0.1, 0, y, 54.2, 0xe0b070);
    b.box(2.2, 3.6, 0.2, 0, 1.8, 54.2, 0x3a2418);
    this.col.addBox(-8, 57.5, 8, 66.5, 20); this.col.addBox(-3.3, 54.2, 3.3, 61, 40);
  }
  buildWall(b, props, lit) {
    const stone = 0x7d7468, top = 7;
    const seg = (x0, x1) => {
      b.box(x1 - x0, top, 2.4, (x0 + x1) / 2, top / 2, 69.2, stone, 0, 0.03);
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.6) b.box(0.8, 0.8, 2.4, x, top + 0.4, 69.2, stone);
      this.col.addBox(x0, 68, x1, 70.4, 20);
    };
    seg(-64, -40); seg(-30, 64);
    // side walls
    b.box(2.4, top, 110, -63.2, top / 2, 15, stone, 0, 0.03); this.col.addBox(-64.4, -40, -62, 70, 20);
    b.box(2.4, top, 110, 63.2, top / 2, 15, stone, 0, 0.03); this.col.addBox(62, -40, 64.4, 70, 20);
    // the gatehouse
    b.box(3, 13, 6, -38.5, 6.5, 69.2, stone, 0, 0.02); b.box(3, 13, 6, -31.5, 6.5, 69.2, stone, 0, 0.02);
    b.box(10, 5, 6, -35, 10.5, 69.2, stone, 0, 0.02);
    b.add(new THREE.ConeGeometry(6.2, 6, 4), 0x5a3a30, -35, 16, 69.2, 0, Math.PI / 4, 0);
    this.col.addBox(-40, 66.2, -30, 72.2, 20);
    // the great doors, shut
    b.box(4, 7.8, 0.3, -35, 3.9, 67.2, 0x4a3020);
    for (const y of [1.5, 4, 6.5]) b.box(4, 0.15, 0.1, -35, y, 67.02, 0x2a2622);
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
    if (this.winGlass) { const f = G.scene.fog.color; this.winGlass.color.setRGB(f.r, f.g, f.b).multiplyScalar(1.15).lerp(new THREE.Color(0.75, 0.82, 0.9), 0.15 * Math.min(1, f.r * 2)); }
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
      const k = 0.55 + Math.sin(this.t * 3) * 0.45;
      this.posternGlow.children[0].material.opacity = 0.1 + k * 0.18;
      this.posternGlow.children[1].material.opacity = 0.45 + k * 0.5;
    }
    for (const s of this.ships) {
      s.position.y = -1.3 + Math.sin(this.t * 0.7 + s.userData.bob) * 0.1;
      s.rotation.z = Math.sin(this.t * 0.5 + s.userData.bob) * 0.02;
    }
  }

  // which props exist depends on the day
  // the street lamps lit, as at night, whatever the chapter
  streetsAtNight(level = 3.2) {
    this.lampLevel = level; this.glowMat.opacity = 1;
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
    this.lampLevel = { 1: 1.6, 2: 3.2, 3: 0, 4: 1.8 }[ch] ?? 0;
    this.glowMat.opacity = { 1: 0.6, 2: 1, 3: 0, 4: 0.7 }[ch] ?? 0;
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
