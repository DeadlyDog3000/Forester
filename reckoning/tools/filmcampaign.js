// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The campaign trailer's shots: the land seen close (europe3d), filmed a frame at a time on a clock of our own, so
// the armies' marches and the ships' courses are as smooth on film however slowly the machine draws them.
//
//   const { cfilm } = await import("./tools/filmcampaign.js");
//   await cfilm.start("austria");
//   await cfilm.take("descend");             // frames to the capture server as cmp/<shot>/0000.jpg and on
//   await cfilm.take("descend", { scout: true });   // only the first, middle and last, to judge the framing
//
// Not part of the game.

const FPS = 30;
const yieldF = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const E = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

// ---- the clock: performance.now held, and moved on a frame at a time only when we say ----
let T = null;
const realNow = performance.now.bind(performance);
function holdClock() { if (T == null) { T = realNow(); performance.now = () => T; } }
function tick(speed = 1) { T += 1000 / FPS * speed; }

const post = (name, url) => fetch(`/__frame?name=${name}`, { method: "POST", body: url });
const cmp = () => window.__cmp;
const v3 = () => window.__cmp.eu3d;

// a place on the land, as the view's own coordinates
function world(lon, lat) { const v = v3(), t = v.target.clone(), d = v.dist; v.look(lon, lat); const p = v.target.clone(); v.target.copy(t); v.dist = d; return p; }

// the eye: over (x, z) on the land, `dist` off, turned `yaw` round from the south, `pitch` up from the level
function eye(v, x, z, dist, yaw = 0, pitch = null) {
  v.target.set(x, 0, z); v.dist = dist;
  v.frame();
  // (the eye's height kept steady over the hills: the ground under the view's middle followed slowly, never step by step,
  //  or the camera bobs over every ridge it passes)
  const g = Math.max(0, v.groundY(x, z)); v._ty = v._ty == null ? g : v._ty + (g - v._ty) * (v._tyK ?? 0.03);
  const ty = v._ty, p = pitch ?? (0.55 + Math.min(1, dist / 40) * 0.5);
  v.camera.position.set(x + Math.sin(yaw) * Math.cos(p) * dist, ty + Math.sin(p) * dist, z + Math.cos(yaw) * Math.cos(p) * dist);
  v.camera.lookAt(x, ty, z);
}

// draw it, with everything the view builds a piece at a time (the near land, the towns) finished first
async function settle(v) {
  for (let i = 0; i < 4; i++) { v.frame(); await yieldF(); }
  let n = 0; while ((v.cityJob || v.detailJob) && n++ < 400) { v.frame(); await yieldF(); }
}

// (a town's name far off in the haze is drawn as a blank pale box on the horizon: the map's own eye never looks that
//  low, but the film's does — so the far ones are left off)
function fixSize(v, k) {
  if (k == null) return;
  if (v.armyGroup) for (const o of v.armyGroup.children) if (o.userData.army) o.scale.setScalar(k * 0.022);
  if (v.fleetGroup) for (const o of v.fleetGroup.children) if (o.userData.fleet) o.scale.setScalar(k * 0.0036);
}
// (a march or a voyage drawn out longer than the map plays it, the men's own steps left at their pace)
function slowGlides(v, f) {
  if (!f || f === 1) return;
  for (const M of [v.armyMap, v.fleetMap]) if (M) for (const R of M.values()) if (R.glide && !R.glide._slow) { R.glide._slow = true; R.glide.dur *= f; }
}
function hideFar(v) { const far = v.scene.fog ? v.scene.fog.near + (v.scene.fog.far - v.scene.fog.near) * 0.35 : 1e9; for (const l of v.labels || []) if (l.visible && l.position.distanceTo(v.camera.position) > far) l.visible = false; }

export const CSHOTS = {
  // high over all Europe, coming down to Vienna and the Danube
  descend: {
    secs: 7.5, size: 9,
    cam(t, v) {
      const a = world(9, 51.5), b = world(16.37, 48.21), e = E(t), k = Math.pow(e, 0.8);
      eye(v, mix(a.x, b.x, e), mix(a.z, b.z, e), mix(110, 9, k), mix(0.35, -0.15, e));
    },
  },
  // round Vienna, the Turk's camp about it
  vienna: {
    secs: 6, size: 5.5,
    cam(t, v) { const c = world(16.37, 48.21), p = world(17.1, 48.14); eye(v, mix(c.x, p.x, 0.45), mix(c.z, p.z, 0.45), this.d ?? 5.5, mix(-0.55, 0.25, E(t)), this.p ?? 0.45); },
  },
  // the Alps under snow, the borders over the passes
  alps: {
    secs: 6,
    cam(t, v) { const a = world(7.6, 46.3), b = world(11.6, 46.9), e = E(t); eye(v, mix(a.x, b.x, e), mix(a.z, b.z, e), 9, -0.25, 0.5); },
  },
  // the New World: the coast, the colonies and the woods' nations
  america: {
    secs: 6,
    cam(t, v) { const a = world(-74, 40.4), b = world(-70.6, 42.6), e = E(t); eye(v, mix(a.x, b.x, e), mix(a.z, b.z, e), mix(16, 11, e), 0.2, 0.75); },
  },
  // your own army on the march: off from its town, down the road to the next, the eye going along above it (slowed:
  // a year's march is three seconds on the map)
  march: {
    secs: 7, speed: 0.5, slow: 4, size: 2.2, tyK: 0.12,
    async stage() {
      const C = cmp().C; C.moved = false; C.arrived = false; C.siege = null;
      const rows = cmp().citiesOfNow(cmp().grid(), C.me), row = rows.find(c => c[0] === this.to) || rows[1];
      const to = cmp().nav.cellXY(row);
      this.key = "mine-" + (C.ar | 0); this.f = null;
      cmp().armySel = !!this.sel;
      this.go = () => cmp().doAct({ k: "move", x: to.x, y: to.y });
    },
    tick(i) { if (i === 10) this.go(); },
    cam(t, v) {
      const R = v.armyMap && v.armyMap.get(this.key); if (!R) return;
      const p = R.co.position;
      if (!this.f) this.f = { x: p.x, z: p.z };
      const f = this.f; f.x += (p.x - f.x) * 0.2; f.z += (p.z - f.z) * 0.2;
      eye(v, f.x, f.z, this.d ?? 4, (this.yaw ?? 0.3) + t * 0.12, this.p ?? 0.5);
    },
  },
  // your fleet out of its harbour and down to the sea, the eye going along over the water (slowed, as the march)
  fleet: {
    secs: 6, speed: 0.5, slow: 4, size: 4,
    async stage() {
      const C = cmp().C, f = C.fleets[0]; f.moved = false; f.go = null;
      this.key = "mine-" + f.id; this.f = null;
      this.go = () => { this.note = cmp().doAct({ k: "sail", id: f.id, x: f.pos.x + (this.dx ?? -20), y: f.pos.y + (this.dy ?? 4) }); };
    },
    tick(i) { if (i === 10) this.go(); },
    cam(t, v) {
      const F = v.fleetMap && v.fleetMap.get(this.key); if (!F) return;
      const p = F.ship.position;
      if (!this.f) this.f = { x: p.x, z: p.z };
      const f = this.f; f.x += (p.x - f.x) * 0.25; f.z += (p.z - f.z) * 0.25;
      eye(v, f.x, f.z, this.d ?? 4, (this.yaw ?? -0.4) + t * 0.15, this.p ?? 0.5);
    },
  },
  // the year's end over the Danube: every crown's armies on the march at once
  yearend: {
    secs: 7, speed: 0.5,
    async stage() { this.c = world(this.lon ?? 17.5, this.lat ?? 47.8); },
    tick(i) { if (i === 12) { const b = [...document.querySelectorAll("button")].find(b => /End the year/.test(b.textContent) && b.offsetParent); if (b) b.click(); } },
    cam(t, v) { eye(v, this.c.x, this.c.z, mix(this.d ?? 12, (this.d ?? 12) * 0.85, E(t)), mix(-0.2, 0.15, E(t)), this.p ?? 0.55); },
  },
};

export const cfilm = {
  // a new campaign as `crown`, the paper put aside, and the land seen close
  async start(crown = "austria") {
    const { G } = await import("../js/engine.js"); G.demoGate = null;
    const m = await import("../js/campaign.js");
    m.openCampaign(true); await wait(1500);
    cmp().begin(crown); await wait(600);
    for (const b of document.querySelectorAll("button")) if (/Take up the crown/.test(b.textContent)) b.click();
    if (!cmp().view.on3d) cmp().enter3d(); await wait(400);
    holdClock();
    return v3();
  },
  async take(name, { scout = false, quality = 0.92, dir = "cmp", ...set } = {}) {
    const S = CSHOTS[name], v = v3();
    Object.assign(S, set);
    if (S.stage) await S.stage.call(S);
    v._ty = null; v._tyK = S.tyK ?? null;
    const n = Math.round(S.secs * FPS);
    S.cam.call(S, 0, v); await settle(v);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      if (S.tick) S.tick.call(S, i);
      tick(S.speed ?? 1);
      S.cam.call(S, t, v);
      const pos = v.camera.position.clone(), q = v.camera.quaternion.clone(), tg = v.target.clone(), d = v.dist;
      // (anything new in sight built before it's drawn: never a town popping in on the film)
      let k = 0; while ((v.cityJob || v.detailJob) && k++ < 400) { v.target.copy(tg); v.dist = d; v.frame(); await yieldF(); }
      // (and the eye put back where the shot has it: the map's own drawing between our frames moves it)
      v.target.copy(tg); v.dist = d; v.frame(); v.camera.position.copy(pos); v.camera.quaternion.copy(q);
      slowGlides(v, S.slow);
      fixSize(v, S.size);
      hideFar(v);
      v.renderer.render(v.scene, v.camera);
      const keep = !scout || i === 0 || i === Math.floor(n / 2) || i === n - 1;
      if (keep) await post(scout ? `${dir}/scout/${name}_${i === 0 ? 0 : i === n - 1 ? 2 : 1}.jpg` : `${dir}/${name}/${String(i).padStart(4, "0")}.jpg`, v.renderer.domElement.toDataURL("image/jpeg", scout ? 0.8 : quality));
      else await yieldF();
    }
    if (S.done) S.done.call(S);
    return n;
  },
};
window.cfilm = cfilm;
