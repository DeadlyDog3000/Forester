// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE TANNING RACK. A hide off the deer ride is no good to anyone as it comes: it's scraped on the beam, soaked in the
// bark liquor in the vat, and laced up on a frame to stretch and dry, and in a while it's leather. Two frames to a
// rack: hold F there to lace up one of your hides (from your pack, or the stores), and come back when it has gone
// from raw pink to brown. A tanner set to work there does the same with the stores' hides by himself.
// Leather makes a canteen that holds more, and a buff coat that turns a blow; and it sells.

import { THREE } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { mat } from "./core.js";

export const TAN_SECS = 240;            // (four minutes on the frame, raw to leather)

export function makeTannery() {
  const g = new THREE.Group();
  const wood = mat(0x6a4a2e, { surface: "wood" }), old = mat(0x55402a, { surface: "wood" }), cord = mat(0x3a2c1e, { roughness: 1 });
  const add = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const post = (h, r = 0.06) => new THREE.CylinderGeometry(r * 0.85, r, h, 7);
  const hides = [];
  // two frames, side by side, leaning back a little on their props
  for (const fx of [-0.85, 0.85]) {
    const f = new THREE.Group(); f.position.set(fx, 0, 0); f.rotation.x = -0.12; g.add(f);
    const P = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, wood); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; f.add(m); return m; };
    P(post(2.0), -0.72, 1.0, 0); P(post(2.0), 0.72, 1.0, 0);
    P(post(1.6, 0.045), 0, 1.78, 0, 0, 0, Math.PI / 2); P(post(1.6, 0.045), 0, 0.28, 0, 0, 0, Math.PI / 2);
    // the hide, laced to the frame: raw it's pale and pinkish, tanned it's brown (its colour set as it goes)
    const hm = new THREE.MeshStandardMaterial({ color: 0xc89a84, roughness: 0.85, side: THREE.DoubleSide });
    const shape = new THREE.Shape(); const pts = [[-0.5, -0.62], [-0.58, -0.2], [-0.52, 0.3], [-0.6, 0.62], [-0.2, 0.55], [0, 0.66], [0.2, 0.55], [0.6, 0.62], [0.52, 0.3], [0.58, -0.2], [0.5, -0.62], [0.15, -0.52], [0, -0.66], [-0.15, -0.52]];
    shape.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
    const hide = new THREE.Mesh(new THREE.ShapeGeometry(shape), hm); hide.position.set(0, 1.03, 0.01); hide.castShadow = true; f.add(hide);
    // the lacing: cords from the hide's edge out to the frame
    const lace = new THREE.Group(); f.add(lace);
    for (const [hx, hy, ex, ey] of [[-0.55, 0.4, -0.72, 0.5], [-0.56, -0.1, -0.72, -0.1], [-0.5, -0.55, -0.72, -0.6], [0.55, 0.4, 0.72, 0.5], [0.56, -0.1, 0.72, -0.1], [0.5, -0.55, 0.72, -0.6], [-0.3, 0.6, -0.3, 0.75], [0.3, 0.6, 0.3, 0.75], [-0.25, -0.58, -0.25, -0.75], [0.25, -0.58, 0.25, -0.75]]) {
      const dx = ex - hx, dy = ey - hy, L = Math.hypot(dx, dy), c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, L, 4), cord);
      c.position.set((hx + ex) / 2, 1.03 + (hy + ey) / 2, 0.01); c.rotation.z = Math.atan2(-dx, dy); lace.add(c);
    }
    // a prop behind, holding it up
    P(post(1.9, 0.04), 0, 0.95, -0.45, 0.45);
    hides.push({ hide, lace, mat: hm });
  }
  // the vat of bark liquor, and the scraping beam
  const vat = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.44, 0.62, 16, 1, true), old), 2.3, 0.31, 0.4);
  vat.material = old; vat.material.side = THREE.DoubleSide;
  for (const y of [0.12, 0.5]) add(new THREE.Mesh(new THREE.TorusGeometry(0.485, 0.018, 4, 18), mat(0x2e2a26, { metalness: 0.5 })), 2.3, y, 0.4, Math.PI / 2);
  add(new THREE.Mesh(new THREE.CircleGeometry(0.47, 16), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.2, metalness: 0.1 })), 2.3, 0.5, 0.4, -Math.PI / 2);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.7, 8), old), -2.2, 0.55, 0.5, 0, 0, 1.2);   // the beam, sloping
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.75, 6), wood), -1.55, 0.37, 0.5, 0.25);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.75, 6), wood), -1.55, 0.37, 0.5, -0.25);
  // the fleshing knife, left on the beam
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.05), mat(0x8a8e96, { metalness: 0.7, roughness: 0.35 })), -2.15, 0.72, 0.5, 0, 0, 1.2 - Math.PI / 2 + 0.2);
  g.userData.hides = hides;
  return g;
}

const RAW = new THREE.Color(0xc89a84), TANNED = new THREE.Color(0x7a4e2c);
export class Tannery {
  constructor(w, town) { this.w = w; this.town = town; this.racks = new Map(); town.tannery = this; }
  sync() {
    const t = this.town, live = new Set();
    for (const b of t.S.buildings) {
      if (b.type !== "tannery" || !b.done || b.gone) continue;
      live.add(b);
      b.frames ??= [];
      if (!this.racks.has(b)) {
        const it = this.w.addInteract({ x: b.x, z: b.z, y: this.w.heightAt(b.x, b.z) + 1.2, reach: 3.2, hold: 2.2,
          can: () => !!this.action(b),
          label: () => { const a = this.action(b); return a ? a.label : ""; },
          use: () => { const a = this.action(b); if (a) a.go(); } });
        this.racks.set(b, it);
      }
    }
    for (const [b, it] of this.racks) if (!live.has(b)) { this.w.removeInteract(it); this.racks.delete(b); }
  }
  now() { return this.town.S.playSecs || 0; }
  ready(b) { return (b.frames || []).filter(f => this.now() - f.at >= TAN_SECS).length; }
  hides() { const it = (G.pack || []).find(i => i.icon === "hide"); return (it ? it.n || 1 : 0) + (this.town.S.hide || 0); }
  // what F does here: take the leather that's done, or lace up a hide on a free frame
  action(b) {
    const fr = b.frames || [], done = this.ready(b);
    if (done) return { label: `Take the leather off the frame (${done})`, go: () => this.take(b) };
    if (fr.length < 2 && this.hides() > 0) return { label: `Scrape a hide and lace it on the frame (${this.hides()} hide${this.hides() > 1 ? "s" : ""})`, go: () => this.lace(b) };
    if (fr.length) { const left = Math.max(0, Math.ceil((TAN_SECS - (this.now() - Math.min(...fr.map(f => f.at)))) / 60)); return { label: `Tanning — about ${left} min to go${fr.length < 2 ? " (a hide from the hunt would go on the other frame)" : ""}`, go: () => UI.hint("Still tanning. Leave it be.", 2) }; }
    return { label: "Tanning rack — bring a hide from the hunt", go: () => UI.hint("You need a hide: hunt the deer ride, or a hunter brings them to the stores.", 3) };
  }
  lace(b) {
    const it = (G.pack || []).find(i => i.icon === "hide");
    if (it) { it.n = (it.n || 1) - 1; if (it.n <= 0) G.pack.splice(G.pack.indexOf(it), 1); }
    else if ((this.town.S.hide || 0) > 0) this.town.S.hide--;
    else return;
    (b.frames ??= []).push({ at: this.now() });
    G.player.workFor && G.player.workFor("craft", 1.5);
    G.practise && G.practise("crafting", 1);
    this.town.persist(); this.paint(b);
    UI.hint("Scraped, soaked and laced up. It'll be leather in a few minutes.", 3.5);
  }
  take(b) {
    const n = this.ready(b); if (!n) return;
    b.frames = b.frames.filter(f => this.now() - f.at < TAN_SECS);
    this.town.S.leather = (this.town.S.leather || 0) + n;
    this.town.showStore && this.town.showStore(); this.town.persist(); this.paint(b);
    UI.hint(`${n} piece${n > 1 ? "s" : ""} of leather, into the stores. Make a buff coat or a better canteen at the chopping block, or sell it.`, 4.5);
  }
  // the hides on the frames: there or not, pale or brown as they've come along
  paint(b) {
    const g = this.town.vis.get(b), hs = g && g.userData.tannery && g.userData.tannery.userData.hides; if (!hs) return;
    const fr = b.frames || [], tanner = (this.town.S.people || []).some(p => p.job === "tanner") && (this.town.S.hide || 0) > 0;
    hs.forEach((h, i) => {
      const f = fr[i], on = !!f || (i === 1 && tanner);
      h.hide.visible = h.lace.visible = on;
      const k = f ? Math.min(1, (this.now() - f.at) / TAN_SECS) : 0.5;
      h.mat.color.copy(RAW).lerp(TANNED, k);
    });
  }
  update(dt) {
    if ((this.t = (this.t || 0) - dt) > 0) return;
    this.t = 1;
    this.sync();
    for (const b of this.racks.keys()) this.paint(b);
  }
}
