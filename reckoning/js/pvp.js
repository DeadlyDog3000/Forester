// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE DUEL. From the title: a loadout — a long arm, a sidearm and a blade — and then a fight, one against one, in a
// deer ride in the woods. Another player if anyone else is looking for a fight on a server you know; if not, a bot
// as strong as you are (by your record: the better you do, the better it gets). Best of three rounds. Everything is
// the story's own fighting: the musket that wants loading, the bow drawn, the crossbow spanned, the guard to the side
// the blow is coming from and the parry just as it comes.

import { THREE } from "./core.js";
import { G, Actor, setWorld, setAtmo } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { FOLEY } from "./foley.js";
import { Woods, HUNT } from "./woods.js";
import { Hunt } from "./hunt.js";
import { WIND, strikeYou, blowLands, glint, stanceTick, slowMo, burst } from "./fight.js";
import { makeArm, makeCrossbow, modelCopy } from "./models.js";
import { resetForMode } from "./story.js";
import { Net, addressOf } from "./mp/net.js";
import { lookOpts, randomLook, isF } from "./mp/look.js";

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- what can be carried in ----
export const LONG = {
  musket: { name: "Musket", icon: "musket", stats: [["Ball", "64 · head 102"], ["Range", "90 m"], ["Loading", "6.5 s"]], note: "One to the head, two to the body. Then the long business of loading it." },
  bow: { name: "Bow", icon: "bow", stats: [["Arrow", "12–42 · head ×1.6"], ["Range", "60 m, falling"], ["Loading", "0.9 s"]], note: "Quick, and quiet. The harder you draw, the harder it hits — 20 arrows." },
  crossbow: { name: "Crossbow", icon: "crossbow", stats: [["Bolt", "52 · head 83"], ["Range", "70 m"], ["Spanning", "2.6 s"]], note: "Nearly a musket's blow, and quicker to span — 12 bolts." },
};
export const SIDE = {
  pistol: { name: "Pistol", icon: "pistol", stats: [["Ball", "45 · head 72"], ["Range", "45 m"], ["Loading", "3.6 s"]], note: "A horseman's flintlock: one shot, close, when the long arm is empty." },
  none: { name: "Nothing", icon: "arrows", stats: [["Instead", "more arrows or bolts"]], note: "No pistol — and half as many arrows or bolts again in your quiver." },
};
export const BLADE = {
  sword: { name: "Sword", icon: "sword5", dmg: 20, rate: 1.15, reach: 2.4, stats: [["Blow", "20"], ["Pace", "quick"], ["Reach", "2.4 m"]], note: "A soldier's sword: quick to strike and quick to guard." },
  battleaxe: { name: "Battle axe", icon: "battleaxe", dmg: 28, rate: 0.8, reach: 2.4, stats: [["Blow", "28"], ["Pace", "slow"], ["Reach", "2.4 m"]], note: "Heavy. Fewer blows, and every one of them felt." },
  spear: { name: "Spear", icon: "spear", dmg: 16, rate: 1.0, reach: 3.0, stats: [["Blow", "16"], ["Pace", "steady"], ["Reach", "3 m"]], note: "Keeps him off: you reach him before he reaches you." },
  axe: { name: "Felling axe", icon: "axe", dmg: 14, rate: 1.05, reach: 2.3, stats: [["Blow", "14"], ["Pace", "steady"], ["Reach", "2.3 m"]], note: "The woodsman's axe. It'll do, in the right hands." },
};
const AMMO = { bow: 20, crossbow: 12 };
const RELOAD = { musket: 6.5, pistol: 3.6, bow: 0.9, crossbow: 2.6 };
const RANGE = { musket: 55, pistol: 18, bow: 38, crossbow: 45 };
const HP = 100, ROUNDS_TO_WIN = 2, ROUND_SECS = 150;

// what a shot or an arrow does to a man (by its power, as the hunt tells it): a musket ball, a pistol's, a bolt, an
// arrow by how hard it was drawn — and to the head, more than half as much again (a musket ball there, the end of it)
export function dmgOf(power, head) {
  const d = power >= 2.5 ? 64 : power >= 1.85 ? 45 : power >= 1.7 ? 52 : 12 + power * 30;
  return Math.round(d * (head ? 1.6 : 1));
}

// ---- your loadout and your record, kept on this computer ----
const LO_KEY = "reckoning.pvp.loadout", REC_KEY = "reckoning.pvp.record";
export function loadout() {
  let l = null; try { l = JSON.parse(localStorage.getItem(LO_KEY)); } catch (e) {}
  l = l || {};
  return { long: LONG[l.long] ? l.long : "musket", side: SIDE[l.side] ? l.side : "pistol", blade: BLADE[l.blade] ? l.blade : "sword" };
}
function saveLoadout(l) { try { localStorage.setItem(LO_KEY, JSON.stringify(l)); } catch (e) {} }
export function record() {
  let r = null; try { r = JSON.parse(localStorage.getItem(REC_KEY)); } catch (e) {}
  return { rating: 1000, w: 0, l: 0, streak: 0, ...(r || {}) };
}
function saveRecord(r) { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {} }
// how good a bot is, from a rating: a beginner's bot misses and is slow to the guard; a strong player's is neither
const skillOf = rating => clamp((rating - 550) / 1000, 0.12, 0.95);
const rankOf = r => r < 900 ? "Recruit" : r < 1050 ? "Musketeer" : r < 1200 ? "Corporal" : r < 1350 ? "Sergeant" : r < 1550 ? "Lieutenant" : "Captain";

// ---------------------------------------------------------------------------
//  the menus: the loadout, the search, the result
// ---------------------------------------------------------------------------
let ctx = null, lo = loadout(), search = null;
export function initPvp(c) {
  ctx = c;
  $("btnPvp").onclick = () => openLoadout();
  $("pvpBack").onclick = () => ctx.screen("title");
  $("pvpGo").onclick = () => findMatch();
  $("pvpCancel").onclick = () => cancelSearch();
  $("pvpAgain").onclick = () => findMatch();
  $("pvpLoadout").onclick = () => openLoadout();
  $("pvpTitle").onclick = () => ctx.screen("title");
  $("pvpCols").addEventListener("click", e => {
    const b = e.target.closest("[data-slot][data-id]"); if (!b) return;
    lo[b.dataset.slot] = b.dataset.id; saveLoadout(lo); drawLoadout();
    window.__uisfx && window.__uisfx.click && window.__uisfx.click();
  });
}
export const PVP_SCREENS = ["pvp", "pvpFind", "pvpEnd"];
function openLoadout() { lo = loadout(); drawLoadout(); ctx.screen("pvp"); }
function drawLoadout() {
  const I = ctx.ICON, card = (slot, id, o) => `<button class="pv-card${lo[slot] === id ? " on" : ""}" data-slot="${slot}" data-id="${id}">
      <img src="${I[o.icon] || ""}" alt=""><span class="pv-name">${esc(o.name)}</span>
      <span class="pv-stats">${o.stats.map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join("")}</span>
      <span class="pv-note">${esc(o.note)}</span></button>`;
  const col = (slot, title, list) => `<div class="pv-col"><div class="pv-h">${title}</div>${Object.entries(list).map(([id, o]) => card(slot, id, o)).join("")}</div>`;
  $("pvpCols").innerHTML = col("long", "Long arm", LONG) + col("side", "Sidearm", SIDE) + col("blade", "Blade", BLADE);
  const r = record(), me = ctx.identity();
  $("pvpRec").innerHTML = `<span class="pv-rank">${rankOf(r.rating)}</span> · rating <b>${Math.round(r.rating)}</b> · ${r.w} won, ${r.l} lost${r.streak > 1 ? ` · ${r.streak} in a row` : ""}<br><small>You fight as ${esc(me.name)}.</small>`;
}

// ---- the search: a server you know, and anyone on it looking for a fight; or, after a while, a bot ----
async function findMatch() {
  cancelSearch(true);
  const s = search = { t0: performance.now(), net: null, done: false };
  ctx.screen("pvpFind");
  const say = (t, sub) => { $("pvpFindT").textContent = t; if (sub != null) $("pvpFindS").textContent = sub; };
  say("Looking for an opponent…", "Anyone else looking for a fight, on the servers you know.");
  const clock = setInterval(() => { if (search !== s) return clearInterval(clock); $("pvpFindC").textContent = `${Math.floor((performance.now() - s.t0) / 1000)} s`; }, 250);
  const me = ctx.identity(), r = record();
  // (the servers: the wide world's, and any you've typed in; the first to answer is the one)
  const addrs = ctx.servers().map(addressOf).filter(Boolean);
  let net = null;
  if (addrs.length) {
    net = await Promise.any(addrs.map(async a => { const n = new Net(a); try { await n.connect(me.name, me.look); return n; } catch (e) { n.close(); throw e; } })).catch(() => null);
  }
  if (search !== s) { if (net) net.close(); return; }
  if (net) {
    s.net = net;
    say("Looking for an opponent…", `On ${net.addr.label}. If nobody turns up, a bot as good as you are.`);
    net.send({ t: "pvpq", lo, rating: Math.round(r.rating), user: ctx.user() });
    const m = await net.next("duel", 14000).catch(() => null);
    if (search !== s) { net.send({ t: "pvpcancel" }); net.close(); return; }
    if (m) { s.done = true; search = null; clearInterval(clock); return startDuel({ net, side: m.side, foe: m.foe, seed: m.seed }); }
    net.send({ t: "pvpcancel" }); net.close(); s.net = null;
  } else {
    await new Promise(ok => setTimeout(ok, 2200));
    if (search !== s) return;
  }
  say("Nobody else is looking.", "A bot, then — as strong as you are.");
  await new Promise(ok => setTimeout(ok, 1200));
  if (search !== s) return;
  s.done = true; search = null; clearInterval(clock);
  startDuel({ bot: true });
}
function cancelSearch(quiet) {
  const s = search; search = null;
  if (s && s.net) { s.net.send({ t: "pvpcancel" }); s.net.close(); }
  if (!quiet) openLoadout();
}

// a bot's name and look, made up fresh
const FIRST = ["Hans", "Matthias", "Jörg", "Kaspar", "Lorenz", "Veit", "Ulrich", "Bastian", "Anna", "Margarethe", "Ursula", "Dorothea", "Barbara", "Elsbeth"];
const LAST = ["Brenner", "Kohl", "Weidner", "Falk", "Ostermann", "Lindau", "Rausch", "Haberland", "Steinkopf", "Wedel", "Asmus", "Grote"];
function botFoe() {
  const look = randomLook(), f = isF(look), first = FIRST.filter((_, i) => f ? i >= 8 : i < 8);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  return { name: `${pick(first)} ${pick(LAST)}`, look, lo: { long: pick(Object.keys(LONG)), side: Math.random() < 0.7 ? "pistol" : "none", blade: pick(Object.keys(BLADE)) } };
}

// ---------------------------------------------------------------------------
//  into the ride
// ---------------------------------------------------------------------------
function startDuel(o) {
  const me = ctx.identity(), r = record();
  ctx.begin();
  const foe = o.bot ? { ...botFoe(), bot: true, skill: skillOf(r.rating) } : { ...o.foe, bot: false };
  new Arena({ me, lo: { ...lo }, foe, net: o.net || null, side: o.side || 0 });
}

// the ground: the deer ride in the woods below the clearing, open in the middle and the trees thick round it
const C = { x: HUNT.x, z: HUNT.z }, BOUND = 40;
const SPAWN = [{ x: C.x - 19, z: C.z + 2 }, { x: C.x + 19, z: C.z - 2 }];

class Arena {
  constructor({ me, lo, foe, net, side }) {
    resetForMode();
    G.arena = this;
    this.me = me; this.lo = lo; this.foeInfo = foe; this.net = net; this.side = side;
    this.wins = [0, 0]; this.round = 0; this.over = false; this.live = false; this.clock = ROUND_SECS;
    const w = this.w = new Woods(); setWorld(w); setAtmo("afternoon");
    w.huntOpen = true;
    this.hunt = new Hunt(w, { x: C.x, z: C.z, r: 1 }, {});
    G.who = isF(me.look) ? "sister" : "brother";
    G.player.setModel(lookOpts(me.look, me.name)); G.player.model.scaleBase = me.look.height || 1;
    G.showHealth = true; G.hasMap = false;
    AUDIO.music("battle");
    // the foe
    this.foe = foe.bot ? new Bot(this, foe) : new NetFoe(this, foe);
    this.hunt.animals.push(this.foe);
    // the ride opened up for the fight: most of its trees gone, one here and there left standing for cover (never
    // close by where either of you starts), and the ground they stand on clear
    const hash = (x, z) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    w.clearScenery(C.x, C.z, BOUND - 6, null, (x, z) => hash(x, z) < 0.2 && SPAWN.every(p => Math.hypot(p.x - x, p.z - z) > 7) && Math.hypot(x - C.x, z - C.z) > 4);
    this.spawns = SPAWN.map(p => this.clearSpot(p.x, p.z));
    // your hands: the swing, the shots, and going down
    G.onSwing = () => this.swing();
    G.onDowned = from => this.youDown(from);
    if (net) this.wire(net);
    this.hud();
    this.tick = dt => this.update(dt);
    G.onFrame.push(this.tick);
    this.beginRound();
  }
  // somewhere near (x, z) that isn't inside a trunk
  clearSpot(x, z) {
    const w = this.w;
    for (let r = 0; r < 12; r += 0.75) for (let a = 0; a < 6.28; a += 0.5) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!w.col.solidAt(px, w.heightAt(px, pz) + 0.6, pz, 0.8)) return { x: px, z: pz };
    }
    return { x, z };
  }
  foes() { return this.foe && this.foe.alive && this.foe.view ? [this.foe.view()] : []; }
  // ---- the bar of what you carry: your loadout, nothing else ----
  hotbar() {
    const L = this.lo, out = [], pl = G.player;
    if (L.long === "musket") out.push({ icon: "musket", name: "Musket", tool: "gun", kind: "musket" });
    if (L.long === "bow") { out.push({ icon: "bow", name: "Bow", tool: "bow" }); out.push({ icon: "arrows", name: "Arrows", n: pl.arrows || 0 }); }
    if (L.long === "crossbow") { out.push({ icon: "crossbow", name: "Crossbow", tool: "xbow" }); out.push({ icon: "bolts", name: "Bolts", n: (G.body.tools.bolts || 0) }); }
    if (L.side === "pistol") out.push({ icon: "pistol", name: "Pistol", tool: "gun", kind: "pistol" });
    const B = BLADE[L.blade]; out.push({ icon: B.icon, name: B.name, tool: "arm", kind: L.blade });
    return out;
  }
  // ---- a round: both put back at their ends, made whole, loaded, and three, two, one ----
  beginRound() {
    this.round++; this.live = false; this.clock = ROUND_SECS; this.roundDone = false;
    const pl = G.player, mine = this.spawns[this.side], theirs = this.spawns[1 - this.side];
    G.downed = false; G.health = 1; G.stamina = 1; G.hurtT = 0; G.panting = 0; G.hitShake = 0;
    if (pl.gun) pl.showGun(false); if (pl.bow) pl.showBow(false); if (pl.xbow) pl.showXbow(false); if (pl.axe) pl.giveAxe(false);
    pl.gunSaved = {}; pl.gunLoaded = true; pl.gunReload = 0; pl.xspan = 1;
    const extra = this.lo.side === "none" ? 1.5 : 1;
    pl.hasBow = this.lo.long === "bow"; pl.arrows = Math.round(AMMO.bow * extra);
    G.body.tools.bolts = Math.round(AMMO.crossbow * extra); G.body.tools.crossbow = this.lo.long === "crossbow" ? 1 : 0; G.body.tools.musket = this.lo.long === "musket" ? 1 : 0;
    G.body.hunger = 1; G.body.thirst = 1; G.body.temp = 0;
    // (arrows lying about from the last round: gone)
    for (const ar of this.hunt.arrows) { this.w.root.remove(ar.mesh); if (ar.it) this.w.removeInteract(ar.it); }
    this.hunt.arrows = [];
    pl.place(mine.x, mine.z, Math.atan2(-(theirs.x - mine.x), -(theirs.z - mine.z)));
    pl.swingRate = BLADE[this.lo.blade].rate;
    this.takeUp(this.lo.long);
    this.foe.reset(theirs, mine);
    G.lockMove = true;
    this.showHud();
    const n = this.round;
    this.banner(`Round ${n}`, this.wins[0] + this.wins[1] ? `${this.wins[0]} – ${this.wins[1]}` : `Best of three · ${esc(this.foeInfo.name)}${this.foeInfo.bot ? " (bot)" : ""}`);
    UI.fadeNow(1); UI.fade(0, 0.8);
    const steps = ["3", "2", "1"];
    steps.forEach((t, i) => setTimeout(() => { if (G.arena === this && this.round === n) { this.banner(t, ""); AUDIO.clang && AUDIO.clang(0.25); } }, 1400 + i * 800));
    setTimeout(() => {
      if (G.arena !== this || this.round !== n) return;
      this.banner("Fight!", ""); G.lockMove = false; this.live = true; this.foe.go();
      AUDIO.voice && AUDIO.voice("war", { high: G.who === "sister", vol: 0.6 });
      setTimeout(() => G.arena === this && this.banner(null), 900);
    }, 1400 + steps.length * 800);
  }
  // the weapon in your hand, as the loadout has it
  takeUp(k) {
    const pl = G.player;
    if (k === "musket" || k === "pistol") { if (pl.gun) pl.showGun(false); pl.gunKind = k; pl.showGun(true); }
    else if (k === "bow") pl.showBow(true);
    else if (k === "crossbow") pl.showXbow(true);
    else pl.wield(this.lo.blade);
  }
  // ---- your blade: a stroke at him, if he's in reach and in front of you ----
  swing() {
    const pl = G.player, f = this.foe, B = BLADE[this.lo.blade];
    if (!this.live || !f.alive) return;
    const fwd = pl.forward(), dx = f.pos.x - pl.pos.x, dz = f.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d > B.reach || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.45) return;
    AUDIO.chop ? AUDIO.chop() : FOLEY.chop(f.pos, 0.7); G.impact && G.impact();
    f.struck(B.dmg, pl.swingDir || "right");
  }
  // ---- what reaches you: a blow, a ball, an arrow ----
  hurtMe(dmg, from) {
    if (G.downed || !this.live) return;
    if (G.mode === "play") G.hurt(dmg, from);
    else { G.health = Math.max(0, G.health - dmg / 100); if (G.health <= 0) G.die(from); }
    if (this.net) this.net.send({ t: "dhp", hp: Math.round(G.health * HP), r: this.round });
  }
  youDown() {
    G.downed = true; G.lockMove = true;
    if (this.net) { this.net.send({ t: "ddown", r: this.round }); this.live = false; return; }
    this.endRound(1);
  }
  foeDown() { if (!this.net) this.endRound(0); }
  // a round over: who took it (0 you, 1 them, -1 neither — time ran out with nothing between you)
  endRound(who) {
    if (this.roundDone) return; this.roundDone = true; this.live = false;
    if (who >= 0) this.wins[who]++;
    this.showHud();
    slowMo(1.4, 0.3);
    const done = who >= 0 && this.wins[who] >= ROUNDS_TO_WIN;
    this.banner(who === 0 ? "You take the round" : who === 1 ? `${esc(this.foeInfo.name)} takes the round` : "Time — nobody", `${this.wins[0]} – ${this.wins[1]}`);
    setTimeout(() => { if (G.arena !== this) return; if (done) this.finish(who === 0); else if (!this.net) this.beginRound(); }, 3200);
  }
  // ---- the match over: the record, and the result ----
  finish(won, left = false) {
    if (this.over) return; this.over = true;
    const r = record(), foeR = this.foeInfo.rating || r.rating, exp = 1 / (1 + Math.pow(10, (foeR - r.rating) / 400)), k = 32;
    const delta = Math.round(k * ((won ? 1 : 0) - exp));
    r.rating = Math.max(100, r.rating + delta); if (won) { r.w++; r.streak = (r.streak || 0) + 1; } else { r.l++; r.streak = 0; }
    saveRecord(r);
    if (won && G.achEvent) { G.achEvent("pvp-win"); if (r.streak >= 5) G.achEvent("pvp-streak5"); }
    const score = `${this.wins[0]} – ${this.wins[1]}`;
    this.stop();
    ctx.end();
    $("pvpEndK").textContent = left ? "They left the field" : won ? "Victory" : "Defeat";
    $("pvpEndT").textContent = won ? `You beat ${this.foeInfo.name}` : `${this.foeInfo.name} beat you`;
    $("pvpEndS").innerHTML = `${score}${this.foeInfo.bot ? " · against a bot" : ""}<br>Rating <b>${Math.round(r.rating)}</b> <span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta}</span> · ${rankOf(r.rating)} · ${r.w} won, ${r.l} lost`;
    ctx.screen("pvpEnd");
  }
  // gone from the arena (the match done, or quit from the pause menu)
  stop() {
    if (G.arena !== this) return;
    G.arena = null; this.live = false;
    const i = G.onFrame.indexOf(this.tick); if (i >= 0) G.onFrame.splice(i, 1);
    G.onSwing = null; G.onDowned = null; G.onGunshot = null; G.onLoose = null; G.onSwingStart = null;
    G.player.swingRate = 1; G.lockMove = false; G.downed = false;
    if (this.net) { this.net.send({ t: "dleave" }); this.net.close(); this.net = null; }
    if ($("pvpHud")) $("pvpHud").classList.add("hidden");
    this.banner(null);
    UI.stance && UI.stance(null);
  }
  // ---- every frame ----
  update(dt) {
    if (G.arena !== this) return;
    const pl = G.player;
    // (the field: the ride and the trees round it; out past them, you're turned back)
    const dx = pl.pos.x - C.x, dz = pl.pos.z - C.z, d = Math.hypot(dx, dz);
    if (d > BOUND) { pl.pos.x = C.x + dx / d * BOUND; pl.pos.z = C.z + dz / d * BOUND; if (!this.boundTold || G.time - this.boundTold > 4) { this.boundTold = G.time; UI.hint("The fight's here, in the ride.", 1.5); } }
    this.foe.tick(dt);
    stanceTick();
    if (this.live && !this.net && G.mode === "play") {
      this.clock -= dt;
      if (this.clock <= 0) { const me = G.health * HP, them = this.foe.hp; this.endRound(me > them + 0.5 ? 0 : them > me + 0.5 ? 1 : -1); }
    }
    if (this.net && this.live) this.clock = Math.max(0, this.clock - dt);
    if (this.net) this.sendState(dt);
    this.drawHud();
  }
  // ---- the score at the top ----
  hud() {
    let h = $("pvpHud");
    if (!h) {
      h = document.createElement("div"); h.id = "pvpHud";
      h.innerHTML = `<div class="ph-side ph-me"><span class="ph-name"></span><span class="ph-pips"></span></div><div class="ph-mid"><div class="ph-round"></div><div class="ph-clock"></div></div><div class="ph-side ph-foe"><span class="ph-pips"></span><span class="ph-name"></span><div class="ph-hp"><i></i></div></div>`;
      $("hud").appendChild(h);
      const b = document.createElement("div"); b.id = "pvpBanner"; b.className = "hidden"; b.innerHTML = `<div class="pb-t"></div><div class="pb-s"></div>`; $("hud").appendChild(b);
    }
    h.classList.remove("hidden");
  }
  showHud() {
    const h = $("pvpHud"); if (!h) return;
    const pips = n => Array.from({ length: ROUNDS_TO_WIN }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    h.querySelector(".ph-me .ph-name").textContent = this.me.name;
    h.querySelector(".ph-foe .ph-name").innerHTML = `${esc(this.foeInfo.name)}${this.foeInfo.bot ? ` <small>bot</small>` : ""}`;
    h.querySelector(".ph-me .ph-pips").innerHTML = pips(this.wins[0]);
    h.querySelector(".ph-foe .ph-pips").innerHTML = pips(this.wins[1]);
    h.querySelector(".ph-round").textContent = `Round ${this.round}`;
  }
  drawHud() {
    const h = $("pvpHud"); if (!h) return;
    const s = Math.max(0, Math.ceil(this.clock)), c = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    if (c !== this._c) { this._c = c; h.querySelector(".ph-clock").textContent = c; h.querySelector(".ph-clock").classList.toggle("low", s <= 20); }
    const k = clamp(this.foe.hp / HP, 0, 1);
    if (Math.abs(k - (this._k ?? -1)) > 0.004) { this._k = k; h.querySelector(".ph-hp i").style.width = `${k * 100}%`; }
  }
  banner(t, sub) {
    const b = $("pvpBanner"); if (!b) return;
    if (t == null) { b.classList.add("hidden"); return; }
    b.querySelector(".pb-t").innerHTML = t; b.querySelector(".pb-s").innerHTML = sub || "";
    b.classList.remove("hidden"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
  }

  // ---------------------------------------------------------------------------
  //  against another player: what you do, sent; what they do, shown
  // ---------------------------------------------------------------------------
  wire(net) {
    const f = this.foe;
    net.on.ds = m => f.state(m);
    net.on.dwind = m => f.windUp(m.dir);
    // their blade, reaching you: judged here, against your guard, as any blow is (their left is your right)
    net.on.dswing = m => {
      if (!this.live) return;
      const pl = G.player, d = Math.hypot(f.pos.x - pl.pos.x, f.pos.z - pl.pos.z);
      if (d > (m.reach || 2.4) + 0.6) return;
      const dir = m.dir === "left" ? "right" : m.dir === "right" ? "left" : "up";
      const was = G.health, how = strikeYou(f.a, dir, clamp(+m.dmg || 0, 0, 30), d, this.tips ??= {});
      net.send({ t: "dres", how });
      if (G.health !== was || G.downed) net.send({ t: "dhp", hp: Math.round(G.health * HP), r: this.round });
    };
    net.on.dres = m => { if (m.how === "parry") { AUDIO.clang && AUDIO.clang(1.1); G.player.parryJolt = G.time + 0.3; UI.hint("Parried — he was ready for that one.", 1.5); } else if (m.how === "block") AUDIO.clang && AUDIO.clang(0.6); else blowLands(f.a, "hit"); };
    net.on.dhit = m => { if (!this.live) return; this.hurtMe(clamp(+m.dmg || 0, 0, 130), f.a); if (m.head) UI.hint("In the head.", 1.2); };
    net.on.dhp = m => { f.hp = clamp(+m.hp || 0, 0, HP); };
    net.on.dfire = m => f.fired(m);
    net.on.dround = m => { if (m.r !== this.round) return; this.endRound(m.winner === -1 ? -1 : m.winner === this.side ? 0 : 1); };
    net.on.dstart = m => { if (G.arena === this && !this.over) { this.round = (m.r | 0) - 1; this.beginRound(); } };
    net.on.dend = m => { this.finish(m.winner === this.side, !!m.left); };
    net.on.lost = () => { if (G.arena === this && !this.over) this.finish(false, false); };
    // what your hands do, told to them
    G.onSwingStart = dir => net.send({ t: "dwind", dir });
    const prevSwing = G.onSwing;
    G.onSwing = () => {
      const pl = G.player, B = BLADE[this.lo.blade], dx = f.pos.x - pl.pos.x, dz = f.pos.z - pl.pos.z, d = Math.hypot(dx, dz), fwd = pl.forward();
      if (!this.live || d > B.reach || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.45) return prevSwing && 0;
      G.impact && G.impact();
      net.send({ t: "dswing", dir: pl.swingDir || "right", dmg: B.dmg, reach: B.reach });
    };
    G.onGunshot = (from, dir, kind) => net.send({ t: "dfire", k: kind, f: [from.x, from.y, from.z].map(v => +v.toFixed(2)), d: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)) });
    G.onLoose = (from, dir, power, bolt) => net.send({ t: "dfire", k: bolt ? "crossbow" : "bow", p: +power.toFixed(2), f: [from.x, from.y, from.z].map(v => +v.toFixed(2)), d: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)) });
  }
  sendState(dt) {
    if ((this.sendT = (this.sendT || 0) - dt) > 0) return; this.sendT = 1 / 12;
    const pl = G.player, held = pl.gun ? pl.gunIs : pl.bow ? "bow" : pl.xbow ? "crossbow" : pl.axe ? this.lo.blade : "";
    const aim = (pl.gun && pl.gunAim > 0.5) || (pl.bow && pl.draw > 0.1) || (pl.xbow && pl.xaim > 0.5);
    this.net.send({ t: "ds", x: +pl.pos.x.toFixed(2), z: +pl.pos.z.toFixed(2), yaw: +pl.yaw.toFixed(2), s: +(pl.speed || 0).toFixed(1), h: held, aim: aim ? 1 : 0, g: pl.guard ? 1 : 0, c: pl.crouched ? 1 : 0, dn: G.downed ? 1 : 0 });
  }
}

// ---------------------------------------------------------------------------
//  a fighter on the field: a body that can be struck and shot (the hunt's arrows and balls find it)
// ---------------------------------------------------------------------------
class Fighter {
  constructor(arena, info) {
    this.arena = arena; this.info = info; this.hp = HP;
    this.a = new Actor({ ...lookOpts(info.look || randomLook(), info.name), name: info.name }, SPAWN[1].x, SPAWN[1].z, 0);
    this.a.heavy = true;
    this.K = { r: 0.36, h: 1.05, len: 0.18, name: "man", upright: true };
    this.wind = 0; this.dir = "right"; this.guardDir = "right"; this.heldK = null;
  }
  get alive() { return this.hp > 0; }
  get root() { return this.a.root; }
  get pos() { return this.a.pos; }
  get yaw() { return this.a.yaw; }
  centre() { return new THREE.Vector3(this.a.pos.x, this.a.pos.y + 1.05, this.a.pos.z); }
  update() {}
  startle() {}
  // (for the marks round the crosshair: his wind-up and his guard)
  view() { return { pos: this.a.pos, wind: this.wind, dir: this.dir, guardDir: this.guardDir, duel: G.player, alive: this.alive }; }
  // what's in his hands
  hold(k) {
    if (this.heldK === k) return; this.heldK = k;
    const P = this.a.person; P.held.clear(); P.heldL.clear();
    if (!k) return;
    if (k === "bow") { const bm = modelCopy("bow"), bow = bm ? bm.scene : new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x7a4e2a })); bow.rotation.set(0, Math.PI / 2, 0); this.a.hold(bow, true); return; }
    // (a gun or a crossbow carried level, pointing where he faces — the turn that lines its barrel up with his
    //  arm's in the pose he holds it in, found by trying them all; a blade upright, as any man holds one)
    if (k === "crossbow" || k === "musket" || k === "pistol") {
      const g = new THREE.Group(), Q = Math.PI / 4, m = k === "crossbow" ? makeCrossbow() : makeArm(k);
      // (the crossbow: its prod lying flat, across)
      if (k === "crossbow") { m.rotation.x = Math.PI / 2; const r = new THREE.Group(); r.rotation.y = Math.PI / 2; r.add(m); g.add(r); }
      else g.add(m); g.rotation.set(3 * Q, 2 * Q, -Q); this.a.hold(g); return;
    }
    this.a.hold(makeArm(k));
  }
  muzzle() { const f = new THREE.Vector3(Math.sin(this.a.yaw), 0, Math.cos(this.a.yaw)); return new THREE.Vector3(this.a.pos.x, this.a.pos.y + 1.45, this.a.pos.z).addScaledVector(f, this.heldK === "pistol" ? 0.6 : 1.1); }
  fallDown() {
    this.a.path = []; this.a.person.setPose("idle"); this.a.lying = true; this.a.yOff = 0.05; this.wind = 0;
    AUDIO.voice && AUDIO.voice("pain", { at: this.a.pos, vol: 1.1, high: isF(this.info.look) });
    blowLands(this.a, "down");
  }
  standUp() { this.a.lying = false; this.a.yOff = 0; this.a.person.setPose("idle"); }
}

// ---------------------------------------------------------------------------
//  the bot: the same arms, the same life, the same rules — and only as quick and as sure as you are
// ---------------------------------------------------------------------------
const DIRS = ["up", "left", "right"];
class Bot extends Fighter {
  constructor(arena, info) {
    super(arena, info);
    this.s = info.skill; this.lo = info.lo;
    info.rating = record().rating;
  }
  reset(at, face) {
    this.hp = HP; this.standUp(); this.a.place(at.x, at.z, Math.atan2(face.x - at.x, face.z - at.z));
    this.loaded = { long: true, side: this.lo.side === "pistol" }; this.rl = { long: 0, side: 0 };
    const extra = this.lo.side === "none" ? 1.5 : 1; this.ammo = Math.round((AMMO[this.lo.long] || 0) * extra);
    this.wind = 0; this.cool = 1; this.stun = 0; this.aimT = 0; this.stepT = 0; this.losT = 0; this.los = true; this.awake = false;
    this.mode = "range"; this.guardT = 0;
    this.hold(this.lo.long); this.a.squareTo = null;
  }
  go() { this.awake = true; this.a.squareTo = G.player; this.aimT = -0.9 - Math.random() * 0.6; }
  // your blade on him: turned aside if he's guarding that side and facing you (the better he is, the oftener)
  struck(dmg, side) {
    if (!this.alive) return;
    const pl = G.player, dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const facing = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (Math.hypot(dx, dz) || 1) > 0.3;
    if (facing && this.wind <= 0 && this.stun <= 0 && this.mode === "melee" && this.guardDir === side && Math.random() < 0.35 + this.s * 0.5) {
      AUDIO.clang && AUDIO.clang(0.9, this.pos); blowLands(this.a, "parried");
      this.a.person.setPose("chop"); setTimeout(() => this.alive && this.a.person.setPose("idle"), 300);
      this.cool = Math.min(this.cool, 0.4); pl.parryJolt = G.time + 0.3;
      if (!this.arena.parryTold) { this.arena.parryTold = true; UI.hint("He turned it — he was guarding that side (the grey mark). Strike from another.", 4); }
      return;
    }
    this.damage(dmg, true);
  }
  // an arrow or a ball in him
  hit(power, head) { this.damage(dmgOf(power, head), false); if (head && this.alive) UI.hint("In the head.", 1.2); }
  damage(d, melee) {
    if (!this.alive || !this.arena.live) return;
    this.hp = Math.max(0, this.hp - d);
    if (this.hp <= 0) { this.fallDown(); this.arena.foeDown(); return; }
    blowLands(this.a, "hit"); this.a.person.flinch && this.a.person.flinch();
    AUDIO.voice && AUDIO.voice(Math.random() < 0.7 ? "pain" : "grunt", { at: this.pos, high: isF(this.info.look) });
    if (!(this.wind > 0)) { this.stun = melee ? 0.25 : 0.4; this.a.path = []; this.aimT = 0; }
    // (hurt at range, he doesn't stand there: he moves)
    if (!melee) this.stepT = 0;
  }
  // can he see you: nothing solid on the line from his eyes to your chest
  sees() {
    const w = this.arena.w, pl = G.player, a = this.pos;
    const ax = a.x, ay = a.y + 1.5, az = a.z, bx = pl.pos.x, by = pl.pos.y + 1.3, bz = pl.pos.z, d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
    for (let i = 2; i < n - 1; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < w.heightAt(x, z) + 0.2 || w.col.solidAt(x, y, z, 0)) return false;
    }
    return true;
  }
  tick(dt) {
    if (!this.alive || !this.awake || !this.arena.live || G.mode !== "play") return;
    const a = this.a, pl = G.player, fp = pl.pos, d = Math.hypot(fp.x - a.pos.x, fp.z - a.pos.z), s = this.s;
    // reloading goes on whatever he's doing, as yours does (each weapon its own time)
    for (const k of ["long", "side"]) if (!this.loaded[k] && this.rl[k] > 0) { this.rl[k] -= dt; if (this.rl[k] <= 0) this.loaded[k] = true; }
    if ((this.losT -= dt) <= 0) { this.losT = 0.25; this.los = this.sees(); }
    if (this.stun > 0) { this.stun -= dt; return; }
    // his guard: to a side, or (the better he is) to the side you're on
    if ((this.guardT -= dt) <= 0) { this.guardT = 0.6 + Math.random() * (1.2 - s * 0.5); this.guardDir = Math.random() < 0.3 + s * 0.5 && pl.stance ? pl.stance : DIRS[Math.floor(Math.random() * 3)]; }
    this.stepT -= dt; this.cool -= dt;
    // a blow on its way: it lands, or it doesn't
    if (this.wind > 0) {
      a.path = []; a.faceTo(fp.x, fp.z);
      const was = this.wind; this.wind -= dt;
      if (was > 0.45 && this.wind <= 0.45) glint(a);
      if (was > 0.62 && this.wind <= 0.62) a.person.setPose(this.dir === "up" ? "overhead" : "chop");
      if (this.wind <= 0) {
        setTimeout(() => this.alive && a.person.setPose("idle"), 500);
        AUDIO.whoosh && AUDIO.whoosh(0.45, this.lo.blade !== "sword");
        const B = BLADE[this.lo.blade];
        // (and after it, a moment to find his feet again: your opening)
        this.cool = (1.4 - s * 0.6) / B.rate * (0.85 + Math.random() * 0.3);
        if (d < B.reach - 0.3) {
          if (strikeYou(a, this.dir, B.dmg, d, this.arena.tips ??= {}) === "parry") { this.stun = 1.0; this.cool = Math.max(this.cool, 1.3); a.person.flinch && a.person.flinch(); }
        }
      }
      return;
    }
    const longK = this.lo.long, haveLong = this.loaded.long && (longK === "musket" || this.ammo > 0), haveSide = this.loaded.side;
    // close: the blade. (Farther, if nothing's loaded and you're coming on.)
    const melee = d < 4.2 || (!haveLong && !(haveSide && d < RANGE.pistol) && d < 10);
    if (melee) {
      if (this.mode !== "melee") { this.mode = "melee"; this.hold(this.lo.blade); this.aimT = 0; a.person.setPose("guard"); }
      const B = BLADE[this.lo.blade], reach = B.reach - 0.5, run = 3.2 + s * 1.4;
      if (d > reach + 0.5) { if (!a.path.length || this.stepT <= 0) { this.stepT = 0.35; a.approach(fp, reach - 0.2, run); } }
      else if (d < 1.0) { if (this.stepT <= 0) { this.stepT = 0.5; a.approach(fp, 1.5, 2.4); } }
      else if (this.cool <= 0) {
        a.path = [];
        // (the wind-up: two seconds for a beginner's bot to show you which side; under one and a half for a good one's)
        this.wind = WIND * (1 - s * 0.3); this.dir = DIRS[Math.floor(Math.random() * 3)]; a.person.setPose("guard");
        if (Math.random() < 0.6) AUDIO.voice && AUDIO.voice(Math.random() < 0.5 ? "grunt" : "war", { at: a.pos, vol: 0.8, high: isF(this.info.look) });
      } else if (this.stepT <= 0) { this.stepT = 0.6 + Math.random() * 0.8; if (Math.random() < 0.7) a.circleAbout(fp, reach, 1.4 + s); else a.path = []; }
      return;
    }
    // at range: the long arm if it's loaded, the pistol if you're near enough, otherwise keep moving while it loads
    const useK = haveLong ? longK : haveSide && d < RANGE.pistol + 6 ? "pistol" : null;
    this.mode = "range";
    if (!useK) {
      // nothing loaded: the long arm in hand, loading; side to side so he's hard to hit, keeping his distance
      if (this.heldK !== longK) this.hold(longK);
      a.person.setPose("idle"); this.aimT = 0;
      if (this.stepT <= 0) { this.stepT = 1.2 + Math.random() * 1.2; a.circleAbout(fp, clamp(d, 12, 30), 2.4 + s); }
      return;
    }
    if (this.heldK !== useK) { this.hold(useK); this.aimT = -0.5; }
    const R = RANGE[useK];
    if (!this.los || d > R) {
      // in closer, or round to where he can see you
      this.aimT = 0; a.person.setPose("idle");
      if (!a.path.length || this.stepT <= 0) { this.stepT = 0.7; if (!this.los && d < R) a.circleAbout(fp, Math.max(6, d - 3), 3 + s); else a.approach(fp, R * 0.7, 3.2 + s); }
      return;
    }
    // aimed: he stands, brings it up, takes his time (less, the better he is), and fires
    a.path = []; a.faceTo(fp.x, fp.z); a.person.setPose(useK === "bow" ? "reach" : "point");
    this.aimT += dt;
    const aimFor = (useK === "musket" ? 1.5 : useK === "bow" ? 1.2 : 1.1) * (1.25 - s * 0.6);
    if (this.aimT >= aimFor) { this.fire(useK, d); this.aimT = 0; this.stepT = 0.4; }
  }
  fire(k, d) {
    const a = this.a, pl = G.player, s = this.s, slot = k === "pistol" ? "side" : "long";
    this.loaded[slot] = false; this.rl[slot] = RELOAD[k];
    const from = this.muzzle();
    if (k === "bow" || k === "crossbow") {
      this.ammo--;
      // the arrow loosed, as a man would: up a little for the drop, ahead of you if you're running
      const power = k === "bow" ? 0.95 : 1.75, v = 14 + 32 * power;
      const to = new THREE.Vector3(pl.pos.x, pl.pos.y + 1.25, pl.pos.z), flight = from.distanceTo(to) / v;
      if (pl.vel) to.addScaledVector(new THREE.Vector3(pl.vel.x, 0, pl.vel.z), flight * (0.4 + s * 0.6));
      to.y += 4.9 * flight * flight;
      const dir = to.sub(from).normalize(), wob = 0.075 - s * 0.06;
      dir.x += (Math.random() - 0.5) * wob; dir.y += (Math.random() - 0.5) * wob * 0.6; dir.z += (Math.random() - 0.5) * wob; dir.normalize();
      from.addScaledVector(dir, 0.3);
      this.arena.hunt.loose(from, dir, power, k === "crossbow", a, (pw, head) => { this.arena.hurtMe(dmgOf(pw, head), a); if (head) UI.hint("In the head.", 1.2); });
      AUDIO.twang && AUDIO.twang(k === "crossbow" ? 1.2 : 0.8);
      return;
    }
    // a ball: there at once — it finds you or it doesn't (his skill, how far, how fast you're moving, crouched)
    const dir = new THREE.Vector3(pl.pos.x - from.x, pl.pos.y + 1.2 - from.y, pl.pos.z - from.z).normalize();
    AUDIO.gunshot && AUDIO.gunshot(k === "pistol" ? 0.75 : 0.95, a.pos);
    G.gunSmoke && G.gunSmoke(from, dir, k === "pistol" ? 0.6 : 1);
    const range = k === "pistol" ? 45 : 90, moving = Math.min(1, (pl.speed || 0) / 5);
    const p = (0.32 + 0.55 * s) * Math.pow(clamp(1 - d / range, 0.1, 1), 0.6) * (1 - moving * (0.45 - s * 0.2)) * (pl.crouched ? 0.8 : 1);
    if (Math.random() < p) {
      const head = Math.random() < 0.05 + s * 0.12;
      this.arena.hurtMe(dmgOf(k === "pistol" ? 1.9 : 2.6, head), a);
      if (head) UI.hint("In the head.", 1.2);
    } else {
      // a miss: past your ear, or into the ground beside you
      setTimeout(() => {
        if (Math.random() < 0.5) FOLEY.whiz && FOLEY.whiz(0.5);
        else { const at = new THREE.Vector3(pl.pos.x + (Math.random() - 0.5) * 3, 0, pl.pos.z + (Math.random() - 0.5) * 3); at.y = this.arena.w.heightAt(at.x, at.z) + 0.05; FOLEY.thunk && FOLEY.thunk(at, 0.6); burst(at, new THREE.Vector3(0, 1, 0), "sparks", 4); }
      }, Math.min(400, d * 3));
    }
  }
}

// ---------------------------------------------------------------------------
//  another player: moved and shown as their game tells it; struck and shot as they are on your screen
// ---------------------------------------------------------------------------
class NetFoe extends Fighter {
  constructor(arena, info) { super(arena, info); this.tx = this.a.pos.x; this.tz = this.a.pos.z; this.tyaw = 0; }
  reset(at, face) { this.hp = HP; this.standUp(); this.a.place(at.x, at.z, Math.atan2(face.x - at.x, face.z - at.z)); this.tx = at.x; this.tz = at.z; this.tyaw = this.a.yaw; this.wind = 0; this.hold(this.info.lo ? this.info.lo.long : "musket"); }
  go() {}
  state(m) {
    this.tx = +m.x; this.tz = +m.z; this.tyaw = Math.PI + (+m.yaw || 0); this.spd = +m.s || 0;
    if (m.h !== undefined) this.hold(m.h || null);
    if (this.wind <= 0) this.a.person.setPose(m.dn ? "idle" : m.aim ? (m.h === "bow" ? "reach" : "point") : m.g ? "guard" : "idle");
    this.guardDir = m.g ? "right" : null;
    if (m.dn && !this.a.lying) this.fallDown();
    if (!m.dn && this.a.lying) this.standUp();
  }
  windUp(dir) { this.wind = 0.35; this.dir = dir === "left" ? "right" : dir === "right" ? "left" : "up"; this.a.person.setPose(dir === "up" ? "overhead" : "chop"); glint(this.a); setTimeout(() => { this.wind = 0; this.a.person.setPose("idle"); }, 450); }
  // your blade on them: they judge it, on their screen, against their guard
  struck() {}
  // an arrow or a ball in them, on your screen: told to them
  hit(power, head) {
    if (!this.arena.live) return;
    const n = this.arena.net; if (n) n.send({ t: "dhit", dmg: dmgOf(power, head), head: !!head });
    blowLands(this.a, "hit");
    if (head) UI.hint("In the head.", 1.2);
  }
  // their shot, as you see it: the smoke and the sound; their arrow, flying (and finding you, or not, on their screen)
  fired(m) {
    const f = new THREE.Vector3(...(m.f || [0, 0, 0]).map(Number)), d = new THREE.Vector3(...(m.d || [0, 0, 1]).map(Number)).normalize();
    if (m.k === "musket" || m.k === "pistol") {
      AUDIO.gunshot && AUDIO.gunshot(m.k === "pistol" ? 0.75 : 0.95, this.a.pos);
      G.gunSmoke && G.gunSmoke(f.clone().addScaledVector(d, 1), d, m.k === "pistol" ? 0.6 : 1);
      // (past you, if it was near)
      const pl = G.player, to = new THREE.Vector3(pl.pos.x, pl.pos.y + 1.3, pl.pos.z).sub(f), along = to.dot(d), miss = to.clone().addScaledVector(d, -along).length();
      if (along > 0 && miss < 2.5) setTimeout(() => FOLEY.whiz && FOLEY.whiz(0.5), 120);
    } else {
      this.arena.hunt.loose(f, d, clamp(+m.p || 1, 0.1, 2), m.k === "crossbow", this.a, () => {});
      AUDIO.twang && AUDIO.twang(m.k === "crossbow" ? 1.2 : 0.8);
    }
  }
  tick(dt) {
    const a = this.a, k = Math.min(1, dt * 10);
    a.pos.x += (this.tx - a.pos.x) * k; a.pos.z += (this.tz - a.pos.z) * k;
    let dy = this.tyaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * k; a.targetYaw = a.yaw;
    a.speed = this.spd || 0; a.path = [];
    a.sync();
  }
}
