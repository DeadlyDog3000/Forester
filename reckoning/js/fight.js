// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE FIGHT, MADE TO BE FELT: the moment a blow lands held for a heartbeat, slow time on a parry and on the last
// man going down, the view shaken by what hits you and what you hit, sparks off steel and blood off a man, and a
// glint on a raised blade the instant before it comes. And the one way any raider's blow lands on you — a raid's,
// a camp's or a cave's: parried, blocked, or taken.
import { THREE } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";

// every raider winds up this long before his blow lands: two seconds to see it coming and meet it
export const WIND = 2.0;
// how soon before the blow your guard must come up for a parry (later than that, it's only a block)
export const PARRY = 0.65;

// ---- time: held, and slowed ----
let stopT = 0, slowT = 0, slowLen = 1, slowK = 1;
G.timeWarp = dt => {
  let k = 1;
  if (stopT > 0) { stopT -= dt; k = 0.03; }
  else if (slowT > 0) { slowT -= dt; const out = Math.min(1, slowT / Math.min(0.3, slowLen)); k = 1 - (1 - slowK) * out; }
  G.shakeA = Math.max(0, (G.shakeA || 0) - dt * 2.4);
  G.fovKick = (G.fovKick || 0) * Math.pow(0.004, dt);
  return dt * k;
};
export const hitStop = s => { stopT = Math.max(stopT, s); };
export const slowMo = (s, k) => { if (slowT <= 0 || k < slowK) slowK = k; slowT = Math.max(slowT, s); slowLen = slowT; };
export const shake = a => { G.shakeA = Math.min(1.2, Math.max(G.shakeA || 0, a)); };
export const kickFov = d => { G.fovKick = d; };

// ---- sparks and blood ----
let geoS = null, geoB = null;
const matS = new THREE.MeshBasicMaterial({ color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const matB = new THREE.MeshStandardMaterial({ color: 0x6a0e0a, roughness: 0.6 });
// at `at`, flying mostly along `dir`: kind "sparks" (bright, quick, gone) or "blood" (drops that fall and lie a while)
export function burst(at, dir, kind = "sparks", n = 12) {
  const root = G.scene; if (!root || !at) return;
  geoS ??= new THREE.BoxGeometry(0.012, 0.012, 0.09); geoB ??= new THREE.SphereGeometry(0.022, 5, 4);
  const spark = kind === "sparks", bits = [];
  const d = dir ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(spark ? geoS : geoB, spark ? matS : matB);
    b.position.copy(at); b.scale.setScalar(spark ? 0.6 + Math.random() : 0.5 + Math.random() * 1.1);
    const v = d.clone().multiplyScalar((spark ? 3 : 1.6) + Math.random() * (spark ? 4 : 2.2));
    v.x += (Math.random() - 0.5) * (spark ? 5 : 2.4); v.y += (spark ? 0.5 : 1.0) + Math.random() * (spark ? 3 : 1.8); v.z += (Math.random() - 0.5) * (spark ? 5 : 2.4);
    b.userData.v = v; root.add(b); bits.push(b);
  }
  let t = 0;
  const tick = dt => {
    t += dt;
    for (const b of bits) {
      const v = b.userData.v;
      if (!v) continue;
      v.y -= (spark ? 9 : 11) * dt; b.position.addScaledVector(v, dt);
      if (spark) { b.lookAt(b.position.x + v.x, b.position.y + v.y, b.position.z + v.z); b.scale.z = Math.max(0.01, 1 - t / 0.45); }
      const gy = G.world && G.world.heightAt ? G.world.heightAt(b.position.x, b.position.z) + 0.01 : -1e9;
      if (b.position.y < gy) { b.position.y = gy; b.userData.v = null; if (!spark) b.scale.set(b.scale.x * 1.8, 0.15, b.scale.z * 1.8); }
    }
    if (t > (spark ? 0.5 : 5)) { for (const b of bits) root.remove(b); const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); }
  };
  G.onFrame.push(tick);
}
// where on a man a blow lands: about his chest
export const chestOf = a => new THREE.Vector3(a.pos.x, a.pos.y + 1.25, a.pos.z);
// from one to another, flat
export const away = (from, to) => new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();

// ---- the glint on a blade raised to strike ----
let glintTex = null;
function glintMaterial() {
  if (!glintTex) {
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,240,1)"); g.addColorStop(0.25, "rgba(255,230,170,0.8)"); g.addColorStop(1, "rgba(255,200,120,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = "rgba(255,250,230,0.9)"; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 2); x.lineTo(32, 62); x.moveTo(2, 32); x.lineTo(62, 32); x.stroke();
    glintTex = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({ map: glintTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false });
}
export function glint(actor) {
  if (!actor || !actor.person) return;
  const held = actor.person.held, s = new THREE.Sprite(glintMaterial());
  const p = new THREE.Vector3();
  (held && held.children.length ? held.children[0] : actor.root).getWorldPosition(p);
  s.position.copy(p).add(new THREE.Vector3(0, 0.35, 0)); s.scale.setScalar(0.01);
  G.scene.add(s);
  let t = 0;
  const tick = dt => {
    t += dt; const k = Math.sin(Math.min(1, t / 0.35) * Math.PI);
    s.scale.setScalar(0.04 + k * 0.32); s.material.rotation = t * 3;
    if (held && held.children.length) { held.children[0].getWorldPosition(p); s.position.copy(p).add(new THREE.Vector3(0, 0.35, 0)); }
    if (t > 0.35) { G.scene.remove(s); s.material.dispose(); const i = G.onFrame.indexOf(tick); if (i >= 0) G.onFrame.splice(i, 1); }
  };
  G.onFrame.push(tick);
}

// ---- a raider's blow, at you: parried, blocked or taken ----
// `a` is his body, `dir` the side it comes from ("up", "left", "right"), `base` its weight, `d` how far he is.
// `tips` holds which lessons have been given. Returns "parry", "block", "hit" or "miss".
export function strikeYou(a, dir, base, d, tips = {}) {
  const pl = G.player, f = pl.forward();
  const dx = a.pos.x - pl.pos.x, dz = a.pos.z - pl.pos.z, facing = (dx * f.x + dz * f.z) / (Math.hypot(dx, dz) || 1) > 0.25;
  const side = (pl.stance || "right") === dir;
  const mid = new THREE.Vector3(pl.pos.x + dx * 0.4, pl.pos.y + 1.6, pl.pos.z + dz * 0.4);
  const toMe = new THREE.Vector3(-dx, 0, -dz).normalize();
  if (pl.guard && facing && !side && !tips.sideTip) { tips.sideTip = true; UI.hint("Wrong side! Put your guard where the red mark is — look up for a blow from above, turn left or right for the sides.", 5); }
  // raised just as he swung, on his side: a parry — nothing lands, and he is thrown off his stroke
  if (pl.guard && facing && side && G.time - pl.guardAt < PARRY) {
    AUDIO.clang && AUDIO.clang(1.2);
    pl.parryJolt = G.time + 0.25;
    burst(mid, toMe.clone().multiplyScalar(-1), "sparks", 22);
    hitStop(0.1); slowMo(0.7, 0.3); shake(0.35); kickFov(-7);
    if ((tips.parried = (tips.parried || 0) + 1) <= 3) UI.hint("Parried! He's off balance — strike now.", 1.8);
    return "parry";
  }
  let dmg = base * (0.8 + Math.random() * 0.4), how = "hit";
  // held up all along: a block — most of the blow taken on the haft, and it costs breath
  if (pl.guard && facing && side && (G.stamina ?? 1) > 0.15) {
    AUDIO.clang && AUDIO.clang(0.7); pl.parryJolt = G.time + 0.2;
    G.stamina = Math.max(0, (G.stamina ?? 1) - 0.3);
    dmg *= 0.25; how = "block";
    burst(mid, toMe.clone().multiplyScalar(-1), "sparks", 9);
    hitStop(0.05); shake(0.45);
    if (!tips.blockTip) { tips.blockTip = true; UI.hint("Blocked — but it cost you. Raise your guard just as he swings to parry instead.", 3.5); }
  } else {
    // a blow: knocked back a step, the breath half out of you, and whatever you carried on the ground
    const k = 0.7 / (d || 1);
    pl.pos.x -= dx * k; pl.pos.z -= dz * k;
    G.stamina = Math.max(0, (G.stamina ?? 1) - 0.4);
    if (pl.carryN) { pl.carryN = 0; UI.carry(null); }
    hitStop(0.07); shake(1.0); kickFov(6);
  }
  if (dmg > 4) AUDIO.voice && AUDIO.voice(dmg > 9 ? "pain" : "grunt", { high: G.who === "sister", vol: 0.8 });
  G.hurt(dmg, a);
  return how;
}

// ---- your blow, on a raider ----
// what it looks like: he turned it (sparks), it went in (blood), or it put him down (slow, and a lot of blood)
export function blowLands(a, kind, from = G.player) {
  const near = G.player && Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z) < 30;
  if (!near) return;
  const at = chestOf(a), dir = from && from.pos ? away(from.pos, a.pos) : new THREE.Vector3(0, 0, 1);
  if (kind === "parried") { burst(at, dir.clone().multiplyScalar(-1), "sparks", 14); hitStop(0.07); shake(0.3); return; }
  if (kind === "hit") { burst(at, dir, "blood", 10); if (from === G.player) { hitStop(0.06); shake(0.22); } return; }
  if (kind === "down") {
    burst(at, dir, "blood", 22);
    if (from === G.player || !from) { hitStop(0.08); slowMo(1.1, 0.22); shake(0.5); kickFov(-8); }
  }
}

// ---- the marks round the crosshair, for whichever fight you're in ----
// every raider about: a raid's, a camp's, the cave's (each with wind, dir, guardDir, duel, and alive or down)
function foes() {
  const out = [];
  const r = G.town && G.town.raids; if (r && r.band) for (const x of r.band) if (x.alive) out.push(x);
  const w = G.world;
  if (w && w.camps) for (const c of w.camps.camps.values()) for (const b of c.band) if (!b.down) out.push(b);
  if (w && w.cave && w.cave.inside) for (const b of w.cave.band || []) if (!b.down) out.push(b);
  return out;
}
// (true while a fight is on round you: the health bar shows)
export function stanceTick() {
  const pl = G.player;
  if (!pl || !pl.axe) { UI.stance(null); return false; }
  const f = pl.forward();
  let threat = null, td = 99, urg = 0, foe = null, fd = 4, any = false;
  for (const r of foes()) {
    const p = r.pos, dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d < 9 && (r.woke !== false)) any = true;
    if (r.wind > 0 && (r.duel === pl || d < 2.6) && d < td) { td = r.duel === pl ? 0 : d; threat = r.dir; urg = 1 - r.wind / WIND; }
    if (d < fd && (dx * f.x + dz * f.z) / (d || 1) > 0.5) { fd = d; foe = r.guardDir; }
  }
  if (!any && !(G.town && G.town.raids && G.town.raids.active)) { UI.stance(null); return false; }
  UI.stance({ mine: pl.stance || "right", threat, foe, urg });
  return any;
}
