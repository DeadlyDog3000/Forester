// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// RISING: a settlement kept miserable long enough turns on you. After twenty minutes of play, if contentment
// has sunk under 35, the unhappiest rise; the rest stay loyal, and the two sides fight it out in the streets.
// The rebels wear a red rag on the arm. Put them down, and they leave (or go to the jail); lose, and they
// take the treasury, and your taxes with it.
import { THREE, mat } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { FIRE } from "./woods.js";

export const REVOLT_AFTER = 20 * 60, REVOLT_BELOW = 35;

// the day's look: is it time?
export function revoltCheck(town) {
  const S = town.S;
  if (S.revolt && S.revolt.active) return;
  if ((S.playSecs || 0) < REVOLT_AFTER) return;
  if (S.lastRevolt != null && town.day - S.lastRevolt < 6) return;
  const adults = S.people.filter(p => !p.child);
  if (adults.length < 3 || town.contentment().value >= REVOLT_BELOW) return;
  startRevolt(town);
}

export function startRevolt(town) {
  const S = town.S, adults = S.people.filter(p => !p.child);
  // the unhappiest rise; the rest stand by you (at least one of each)
  const ranked = adults.map(p => [p, town.mood(p).value]).sort((a, b) => a[1] - b[1]);
  let rebels = ranked.filter(([, m]) => m < 45).map(([p]) => p);
  if (!rebels.length) rebels = [ranked[0][0]];
  if (rebels.length === adults.length && adults.length > 1) rebels = rebels.slice(0, -1);
  for (const p of adults) p.rebel = rebels.includes(p);
  S.revolt = { active: true, day: town.day, rebels: rebels.map(p => p.name) };
  for (const a of town.actors) if (a.settler && a.settler.rebel) armband(a, true);
  town.persist();
  const sib = G.who === "sister" ? "Brother" : "Sister";
  UI.bark(sib, `They've risen against us — ${rebels.length === 1 ? rebels[0].name : `${rebels.length} of them`}! The red rags on their arms. The rest are with us — help them!`, 6);
  UI.news && UI.news({ title: "The settlement has risen", sub: `${rebels.map(p => p.name).join(", ")} ${rebels.length > 1 ? "have" : "has"} taken up arms against you. The loyal fight them in the streets.`, img: "event_war" });
  G.guide && G.guide("revolt");
  AUDIO.voice && AUDIO.voice("war", { at: G.player && G.player.pos });
}

// a red rag tied round the upper arm
function armband(a, on) {
  if (a.band) { a.root.remove(a.band); a.band = null; }
  if (!on) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.13), mat(0xb01e14, { roughness: 0.9 }));
  m.position.set(0.24, 1.28, 0); a.root.add(m); a.band = m;
}

// a shift in the fighting, for one settler; true if they fought (or hid)
export async function revoltShift(town, a, sleep, alive) {
  const S = town.S; if (!(S.revolt && S.revolt.active) || a.settler.child) return false;
  if (a.knocked) { a.doing = "beaten down in the rising"; a.lying = true; await sleep(1); alive(); return true; }
  const rebel = !!a.settler.rebel;
  if (a.settler.rebel && !a.band) armband(a, true);
  const foes = town.actors.filter(o => o.settler && !o.settler.child && !o.knocked && !o.gone && !!o.settler.rebel !== rebel);
  const pl = G.player;
  // a rebel may go for you, if you are near
  const youNear = rebel && pl && !G.downed && Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) < 16;
  // one at a time: whoever they squared up to, until one of them is down (or it's broken off, far apart)
  const held = a.revFoe, D = o => Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
  let target = held === "you" ? (rebel && !G.downed && D(pl) < 20 ? "you" : null) : held && foes.includes(held) && D(held) < 20 ? held : null;
  if (!target) {
    let td = Infinity;
    // (the one nobody is fighting yet, first)
    for (const o of foes) { const d = D(o) + (town.actors.some(x => x !== a && x.revFoe === o) ? 6 : 0); if (d < td) { td = d; target = o; } }
    if (youNear && D(pl) < td && !town.actors.some(x => x !== a && x.revFoe === "you")) target = "you";
  }
  a.revFoe = target; a.squareTo = target === "you" ? pl : target;
  if (!target) { a.doing = rebel ? "in revolt, looking for a fight" : "standing by you"; await sleep(1.5); alive(); return true; }
  const tp = target === "you" ? pl.pos : target.pos;
  a.doing = rebel ? "fighting for the rising" : "fighting the rebels";
  const d = Math.hypot(tp.x - a.pos.x, tp.z - a.pos.z);
  if (d > 2.0) { await Promise.race([a.approach(tp, 1.4, 2.8), sleep(0.8)]); alive(); return true; }
  if (Math.random() < 0.35) { await Promise.race([a.circleAbout(tp, 1.5, 1.4), sleep(0.7)]); alive(); return true; }
  if (d > 1.5) { await Promise.race([a.approach(tp, 1.3, 2.4), sleep(0.4)]); alive(); }
  a.path = []; a.faceTo(tp.x, tp.z); a.person.setPose(Math.random() < 0.5 ? "punch" : "overhead"); await sleep(0.55); alive(); a.person.setPose("idle");
  const dmg = 9 + Math.random() * 7;
  if (target === "you") { if (Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) < 2) G.hurt(dmg * 0.8, "rebel"); }
  else if (Math.hypot(target.pos.x - a.pos.x, target.pos.z - a.pos.z) < 2) hit(town, target, dmg);
  AUDIO.whoosh && AUDIO.whoosh(0.3, false);
  if (Math.random() < 0.25) AUDIO.voice && AUDIO.voice(Math.random() < 0.5 ? "war" : "grunt", { at: a.pos, high: a.settler.sex === "f" });
  await sleep(0.8);
  return true;
}
function hit(town, a, dmg) {
  a.hp = (a.hp ?? 50) - dmg;
  if (a.hp > 0 && a.person.flinch) a.person.flinch();
  // (a blow that brings them down sometimes kills)
  if (a.hp <= 0) { a.squareTo = null; a.revFoe = null; }
  if (a.hp <= 0 && Math.random() < 0.3 && town.killSettler) { town.killSettler(a, "revolt"); checkEnd(town); return; }
  if (a.hp <= 0) { a.knocked = Infinity; a.lying = true; a.path = []; AUDIO.voice && AUDIO.voice("fear", { at: a.pos, high: a.settler.sex === "f" }); checkEnd(town); }
}
// your stroke: a rebel in front of you takes it
export function revoltSwing(town, pl) {
  const S = town.S; if (!(S.revolt && S.revolt.active)) return false;
  const f = pl.forward();
  for (const a of town.actors) {
    if (!a.settler || !a.settler.rebel || a.knocked) continue;
    const dx = a.pos.x - pl.pos.x, dz = a.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d < 2.2 && (dx * f.x + dz * f.z) / d > 0.5) { hit(town, a, 22 + Math.random() * 10); AUDIO.clang && AUDIO.clang(0.5, a.pos); G.practise && G.practise("strength", 0.5); return true; }
  }
  return false;
}
// over when one side is down (or you are)
export function checkEnd(town) {
  const S = town.S; if (!(S.revolt && S.revolt.active)) return;
  const up = side => town.actors.filter(a => a.settler && !a.settler.child && !a.knocked && !a.gone && !!a.settler.rebel === side).length;
  if (up(true) === 0) endRevolt(town, "loyal");
  else if (G.downed || (up(false) === 0 && (G.health ?? 1) < 0.2)) endRevolt(town, "rebels");
}
export function endRevolt(town, winner) {
  const S = town.S, rebels = S.people.filter(p => p.rebel);
  S.revolt.active = false; S.lastRevolt = town.day;
  for (const a of town.actors) { if (a.knocked === Infinity && !a.dead) { a.knocked = 0; a.lying = false; a.hp = 50; } a.revFoe = null; a.squareTo = null; armband(a, false); }
  if (winner === "loyal") {
    // the rebels are put out of the settlement (the jail keeps one, if there is a jail)
    const jail = town.has && town.has("jail");
    for (const p of rebels) {
      p.rebel = false;
      if (jail && p === rebels[0]) { p.jailedDay = town.day + 1; p.mark = "disgraced"; continue; }
      town.leave("revolt", p);
    }
    UI.news && UI.news({ title: "The rising is put down", sub: `${rebels.map(p => p.name).join(", ")} ${jail ? "— the ringleader is in the jail, the rest are gone down the road." : "are gone down the road."} Those who stood by you won't forget it.`, img: "event_war" });
    for (const p of S.people) if (!p.child) town.setMark && town.setMark(p, "hardened", "stood by you in the rising");
  } else {
    // they win: the treasury is theirs, and the taxes are struck down
    const took = Math.floor((S.coin || 0) * 0.6);
    S.coin = (S.coin || 0) - took; S.tax = 0; S.bizTax = 0;
    for (const p of rebels) { p.rebel = false; p.purse = (p.purse || 0) + Math.floor(took / Math.max(1, rebels.length)); }
    UI.news && UI.news({ title: "The rebels have won", sub: `They took ${took} DM out of the treasury and shared it among themselves, and struck down every tax. The settlement is theirs as much as yours now.`, img: "event_war" });
    const sib = G.who === "sister" ? "Brother" : "Sister";
    setTimeout(() => UI.bark(sib, "We had it coming, maybe. Keep them fed and warm, and it won't happen again.", 5), 2500);
  }
  town.persist();
}
