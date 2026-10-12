// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE DUEL. From the title: a loadout — a long arm, a sidearm and a blade — and then a fight, one against one, in a
// deer ride in the woods. Another player if anyone else is looking for a fight on a server you know; if not, a bot
// as strong as you are (by your record: the better you do, the better it gets). Best of three rounds. Everything is
// the story's own fighting: the musket that wants loading, the bow drawn, the crossbow spanned, the guard to the side
// the blow is coming from and the parry just as it comes.

import { THREE, camera } from "./core.js";
import { G, Actor, setWorld, setAtmo } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { FOLEY } from "./foley.js";
import { Woods, HUNT } from "./woods.js";
import { Hunt } from "./hunt.js";
import { WIND, strikeYou, blowLands, glint, stanceTick, slowMo, burst } from "./fight.js";
import { makeArm, modelCopy, shoulderArm, addBayonet } from "./models.js";
import { resetForMode } from "./story.js";
import { loadSteps } from "./reload.js";
import { ragdoll, dropThing, clearDropped } from "./ragdoll.js";
import { Net, addressOf, HOST, globalServer } from "./mp/net.js";
import { Wilds } from "./mp/wilds.js";
import { WATER } from "./mp/terrain.js";
import { EARTH_SIZES } from "./mp/rules.js";
import { REALMS_1683 } from "./mp/earth-1683.js";
import { lookOpts, randomLook, isF } from "./mp/look.js";
import { UNIFORMS, soldierLook, inUniform, Field, Orders, OrderBook } from "./battle.js";
// (how a blow looks: a spear is only ever thrust, straight out; anything else swung, or brought down from above)
const blowPose = (k, dir) => k === "spear" || k === "bayonet" ? "punch" : dir === "up" ? "overhead" : "slash";

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randn = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ---- what can be carried in ----
export const LONG = {
  musket: { name: "Musket", icon: "musket", w: 7, stats: [["Ball", "64 · head 102"], ["Range", "90 m"], ["Loading", "6.5 s"]], note: "One to the head, two to the body. Then the long business of loading it." },
  bow: { name: "Bow", icon: "bow", w: 3, stats: [["Arrow", "12–42 · head ×1.6"], ["Range", "60 m, falling"], ["Loading", "0.9 s"]], note: "Quick, and quiet. The harder you draw, the harder it hits — 20 arrows." },
  crossbow: { name: "Crossbow", icon: "crossbow", w: 5, stats: [["Bolt", "52 · head 83"], ["Range", "70 m"], ["Spanning", "2.6 s"]], note: "Nearly a musket's blow, and quicker to span — 12 bolts." },
  none: { name: "None", icon: "", w: 0, stats: [["Load", "nothing"]], note: "No long arm: the pistol and the blade, and lighter on your feet." },
};
export const SIDE = {
  pistol: { name: "Pistol", icon: "pistol", w: 3, stats: [["Ball", "32 · head 51"], ["Range", "25 m, wild"], ["Loading", "2.4 s"]], note: "A horseman's flintlock: quick to load, but only for close work — past a few paces it could go anywhere." },
  none: { name: "None", icon: "", w: 0, stats: [["Load", "nothing"]], note: "No pistol. A musket wants both hands and most of what you can carry." },
};
export const BLADE = {
  sword: { name: "Sword", icon: "sword5", w: 3, dmg: 20, rate: 1.15, reach: 2.4, stats: [["Blow", "20"], ["Pace", "quick"], ["Reach", "2.4 m"]], note: "A soldier's sword: quick to strike and quick to guard." },
  battleaxe: { name: "Battle axe", icon: "battleaxe", w: 4, dmg: 28, rate: 0.8, reach: 2.4, stats: [["Blow", "28"], ["Pace", "slow"], ["Reach", "2.4 m"]], note: "Heavy. Fewer blows, and every one of them felt." },
  spear: { name: "Spear", icon: "spear", w: 3, dmg: 16, rate: 1.0, reach: 3.0, stats: [["Blow", "16"], ["Pace", "steady"], ["Reach", "3 m"]], note: "Keeps him off: you reach him before he reaches you." },
  axe: { name: "Felling axe", icon: "axe", w: 3, dmg: 14, rate: 1.05, reach: 2.3, stats: [["Blow", "14"], ["Pace", "steady"], ["Reach", "2.3 m"]], note: "The woodsman's axe. It'll do, in the right hands." },
  dagger: { name: "Bayonet", icon: "dagger", w: 1, dmg: 11, rate: 1.5, reach: 1.9, stats: [["Blow", "11 · fixed 24"], ["Reach", "1.9 m · fixed 2.7"]], note: "A socket bayonet: with a musket, F fixes it under the muzzle, for good — you still fire, slower to load and less true, and once you've fired a click is the steel. Alone, a long dagger." },
  // (the musket with the bayonet fixed: not chosen, but what the musket and the bayonet make together)
  bayonet: { name: "Fixed bayonet", icon: "musket", w: 0, dmg: 24, rate: 0.95, reach: 2.7, hidden: true, stats: [], note: "" },
};
// what you can carry: a long arm, a sidearm and a blade, all within this. (A musket is so heavy it's your sidearm's
// share too: beside it, only a dagger.) The lighter you go, the quicker on your feet.
export const LOAD_MAX = 9;
export const weightOf = l => (LONG[l.long] || LONG.none).w + (SIDE[l.side] || SIDE.none).w + (BLADE[l.blade] || BLADE.dagger).w;
export const loadMul = l => 1.06 - weightOf(l) * 0.012;
// a choice made, and whatever else no longer fits put down (the sidearm first, then the blade down to the dagger)
function fitLoad(l, keep) {
  const o = { ...l };
  if (weightOf(o) > LOAD_MAX && keep !== "side") o.side = "none";
  if (weightOf(o) > LOAD_MAX && keep !== "blade") o.blade = "dagger";
  if (weightOf(o) > LOAD_MAX && keep !== "long") o.long = "none";
  if (weightOf(o) > LOAD_MAX) o.side = "none";
  return o;
}
const AMMO = { bow: 20, crossbow: 12 };
const RELOAD = { musket: 6.5, pistol: 2.4, bow: 0.9, crossbow: 2.6 };
const RANGE = { musket: 55, pistol: 12, bow: 38, crossbow: 45 };
const HP = 100, ROUNDS_TO_WIN = 2, ROUND_SECS = 150;

// what a shot or an arrow does to a man (by its power, as the hunt tells it): a musket ball, a pistol's, a bolt, an
// arrow by how hard it was drawn — and to the head, more than half as much again (a musket ball there, the end of it)
export function dmgOf(power, head) {
  const d = power >= 2.5 ? 64 : power >= 1.85 ? 32 : power >= 1.7 ? 52 : 12 + power * 30;
  return Math.round(d * (head ? 1.6 : 1));
}

// ---- your loadout and your record, kept on this computer ----
const LO_KEY = "reckoning.pvp.loadout", REC_KEY = "reckoning.pvp.record";
export function loadout() {
  let l = null; try { l = JSON.parse(localStorage.getItem(LO_KEY)); } catch (e) {}
  l = l || {};
  return fitLoad({ long: LONG[l.long] ? l.long : "musket", side: SIDE[l.side] ? l.side : "none", blade: BLADE[l.blade] ? l.blade : "dagger" }, "long");
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
  $("pvpBotNow").onclick = () => botNow();
  $("pvpAgain").onclick = () => findMatch();
  $("pvpLoadout").onclick = () => openLoadout();
  $("pvpTitle").onclick = () => ctx.screen("title");
  if ($("pvpArmy")) $("pvpArmy").addEventListener("click", armyClick);
  $("pvpCols").addEventListener("click", e => {
    const b = e.target.closest("[data-slot][data-id]"); if (!b) return;
    const was = { ...lo }; lo[b.dataset.slot] = b.dataset.id; lo = fitLoad(lo, b.dataset.slot); saveLoadout(lo);
    const put = ["long", "side", "blade"].filter(k => k !== b.dataset.slot && lo[k] !== was[k]).map(k => ({ long: LONG, side: SIDE, blade: BLADE }[k][was[k]].name.toLowerCase()));
    drawLoadout(put.length ? `Too heavy to carry it all: you put down the ${put.join(" and the ")}.` : "");
    window.__uisfx && window.__uisfx.click && window.__uisfx.click();
  });
}
export const PVP_SCREENS = ["pvp", "pvpFind", "pvpEnd"];
function openLoadout() { lo = loadout(); drawLoadout(); ctx.screen("pvp"); }
function drawLoadout(note = "") {
  const I = ctx.ICON, heavy = (slot, id) => weightOf({ ...lo, [slot]: id }) > LOAD_MAX;
  const card = (slot, id, o) => `<button class="pv-card${lo[slot] === id ? " on" : ""}${heavy(slot, id) ? " heavy" : ""}" data-slot="${slot}" data-id="${id}" title="${heavy(slot, id) ? "Too heavy with the rest — choosing it puts something else down" : ""}">
      ${o.icon && I[o.icon] ? `<img src="${I[o.icon]}" alt="">` : `<span class="pv-none"></span>`}<span class="pv-name">${esc(o.name)}<span class="pv-w" title="Weight">${o.w}</span></span>
      <span class="pv-stats">${o.stats.map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join("")}</span>
      <span class="pv-note">${esc(o.note)}</span></button>`;
  const col = (slot, title, list) => `<div class="pv-col"><div class="pv-h">${title}</div>${Object.entries(list).filter(([, o]) => !o.hidden).map(([id, o]) => card(slot, id, o)).join("")}</div>`;
  $("pvpCols").innerHTML = col("long", "Long arm", LONG) + col("side", "Sidearm", SIDE) + col("blade", "Blade", BLADE);
  const w = weightOf(lo), sp = Math.round((loadMul(lo) - 1) * 100);
  $("pvpLoad").innerHTML = `<div class="pv-load-h"><b>Load</b> ${w} of ${LOAD_MAX}<span>${sp >= 0 ? `${sp}% quicker on your feet` : `${-sp}% slower on your feet`}</span></div><div class="pv-load-bar">${Array.from({ length: LOAD_MAX }, (_, i) => `<i class="${i < w ? "on" : ""}"></i>`).join("")}</div><div class="pv-load-note">${esc(note)}</div>`;
  drawArmy();
  const r = record(), me = ctx.identity();
  $("pvpRec").innerHTML = `<span class="pv-rank">${rankOf(r.rating)}</span> · rating <b>${Math.round(r.rating)}</b> · ${r.w} won, ${r.l} lost${r.streak > 1 ? ` · ${r.streak} in a row` : ""}<br><small>You fight as ${esc(me.name)}.</small>`;
}

// ---- the company: alone, or with men of your own against more of theirs; a battle, in uniform, with works and guns ----
function drawArmy() {
  const el = $("pvpArmy"); if (!el) return;
  const A = army(), multi = A.allies > 0 || A.enemies > 1 || A.battle;
  const step = (k, label, v, lo, hi) => `<div class="pv-step"><span>${label}</span><button data-k="${k}" data-d="-1"${v <= lo ? " disabled" : ""}>−</button><b>${v}</b><button data-k="${k}" data-d="1"${v >= hi ? " disabled" : ""}>+</button></div>`;
  const sw = u => `<i style="background:#${u.coat.toString(16).padStart(6, "0")}"></i><i style="background:#${u.vest.toString(16).padStart(6, "0")}"></i>`;
  el.innerHTML = `<div class="pv-h">Your company</div>
    <div class="pv-steps">${step("allies", "With you", A.allies, 0, 12)}${step("enemies", "Against you", A.enemies, 1, 20)}
      <button class="pv-bt${A.battle ? " on" : ""}" data-bt="1"><b>Battle Mode</b><small>${A.battle ? "On — " : ""}uniforms, earthworks and guns, somewhere on the Earth</small></button></div>
    ${A.battle ? `<div class="pv-grounds">${[["open", "Open field", "Both sides behind their works"], ["ours", "Your fort", "You hold it; they come for it"], ["theirs", "Their fort", "They hold it; you take it"]].map(([k, n, t]) => `<button class="pv-gr${A.ground === k ? " on" : ""}" data-gr="${k}"><b>${n}</b><small>${t}</small></button>`).join("")}</div>` : ""}
    ${A.battle ? `<div class="pv-unis">${Object.entries(UNIFORMS).map(([k, u]) => `<button class="pv-uni${A.uniform === k ? " on" : ""}" data-uni="${k}" title="${esc(u.note)}"><span class="pv-sw">${sw(u)}</span>${esc(u.name)}</button>`).join("")}</div><div class="pv-uni-note">${esc(UNIFORMS[A.uniform].note)} — theirs will be another's, drawn by lot.</div>` : ""}
    <div class="pv-army-note">${multi ? `Against bots${A.allies ? `, your ${A.allies} with you` : ""}. ${A.allies || A.battle ? "In the field the number keys are your orders; the wheel, your weapons." : ""}` : "One against one: another player if anyone's looking, or a bot as strong as you are."}</div>`;
  $("pvpGo").textContent = multi ? "To the field" : "Find a match";
}
function armyClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  const A = army();
  if (b.dataset.k) setArmy({ [b.dataset.k]: A[b.dataset.k] + +b.dataset.d });
  else if (b.dataset.bt) setArmy({ battle: !A.battle, enemies: !A.battle && A.enemies < 6 ? 8 : A.enemies, allies: !A.battle && A.allies < 4 ? 6 : A.allies });
  else if (b.dataset.uni) setArmy({ uniform: b.dataset.uni });
  else if (b.dataset.gr) setArmy({ ground: b.dataset.gr });
  else return;
  drawArmy();
  window.__uisfx && window.__uisfx.click && window.__uisfx.click();
}

// ---- the search: anyone else looking for a fight ----
// On the wide world's server if there is one; otherwise (in the app) on your own network — every copy of the game that's
// looking hosts a little server of its own, hears the others', and all of them queue on the same one (the first by
// name), so two friends in the same house find each other in a moment. Ten seconds, and then a word that nobody's come
// yet; a bot whenever you like.
const SEARCH_SECS = 10;
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
async function findMatch() {
  cancelSearch(true);
  // (companies against bots: no one to look for)
  { const A = army(); if (A.allies > 0 || A.enemies > 1 || A.battle) { search = null; startDuel({ bot: true }); return; } }
  const s = search = { t0: performance.now(), net: null, key: null, done: false, seen: [] };
  window.__pvpSearch = s;
  ctx.screen("pvpFind");
  const say = (t, sub) => { $("pvpFindT").textContent = t; if (sub != null) $("pvpFindS").textContent = sub; };
  say("Looking for an opponent…", HOST ? "Anyone on your network looking for a fight — or on the servers you know." : "Anyone else looking for a fight, on the servers you know.");
  $("pvpFindC").textContent = "0 s";
  const clock = setInterval(() => {
    if (search !== s) return clearInterval(clock);
    const t = Math.floor((performance.now() - s.t0) / 1000);
    $("pvpFindC").textContent = `${t} s`;
    if (t === SEARCH_SECS && !s.told) { s.told = true; say("Nobody's turned up yet.", `Still looking${s.where ? ` — ${s.where}` : ""}. Keep waiting, or fight a bot as strong as you are.`); }
  }, 250);
  const me = ctx.identity(), r = record();
  // (this computer's own little server, in the app: so a friend's game can find you as you can find theirs)
  let self = null;
  if (HOST) { try { const h = await HOST.host(); self = { port: h.port, name: h.name || "" }; } catch (e) {} }
  const glob = globalServer();
  const go = async (key, addr, where) => {
    if (s.key === key || search !== s) return;
    if (s.net) { s.net.send({ t: "pvpcancel" }); s.net.close(); s.net = null; }
    s.key = key; s.where = where;
    const n = new Net(addr);
    try { await n.connect(me.name, me.look); } catch (e) { s.err = "connect " + key + ": " + e.message; n.close(); if (s.key === key) s.key = null; return; }
    if (search !== s || s.key !== key) { n.close(); return; }
    s.net = n;
    if (!s.told) say("Looking for an opponent…", `${where[0].toUpperCase() + where.slice(1)}.`);
    n.on.duel = m => {
      if (search !== s || s.done) return;
      s.done = true; search = null; clearInterval(clock);
      startDuel({ net: n, side: m.side, foe: m.foe, seed: m.seed });
    };
    n.send({ t: "pvpq", lo, rating: Math.round(r.rating), user: ctx.user() });
  };
  while (search === s && !s.done) {
    // the wide world's server, if there is one: everyone shares it
    if (glob && addressOf(glob)) await go("global", addressOf(glob), "on the Forester server");
    else if (HOST) {
      // the games on this network (yours among them): all of you on the same one — the first, by name
      const list = await HOST.discover(2300).catch(e => { s.err = String(e && e.message || e); return []; });
      s.seen = list.map(v => `${v.name}|${v.address}:${v.port}${v.self ? " (self)" : ""}`);
      if (search !== s || s.done) break;
      const all = list.map(v => ({ key: `${v.name || v.address}|${v.self ? (self && self.port) || v.port : v.port}`, addr: addressOf(`${v.self ? "127.0.0.1" : v.address}:${v.port}`), where: v.self ? "on your network (this computer is keeping the place)" : `on your network, at ${v.name || v.address}` })).filter(v => v.addr);
      all.sort((x, y) => x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
      if (all.length) await go(all[0].key, all[0].addr, all[0].where);
    } else {
      // (in a browser: the servers you've typed in)
      const typed = ctx.servers().map(addressOf).filter(Boolean);
      if (typed.length) await go(typed[0].label, typed[0], `on ${typed[0].label}`);
      await sleep(1400);
    }
    await sleep(200);
  }
}
// a bot now, whatever the search has found
function botNow() {
  const s = search; if (!s) return;
  cancelSearch(true);
  startDuel({ bot: true });
}
function cancelSearch(quiet) {
  const s = search; search = null;
  if (s && s.net) { s.net.send({ t: "pvpcancel" }); s.net.close(); }
  if (!quiet) openLoadout();
}

// the company you take out against bots: how many with you, how many against, and whether it's a battle — your
// colours, and theirs, drawn from the others (kept between games)
const ARMY_KEY = "reckoning.pvp.battle";
export function army() {
  let a = {}; try { a = JSON.parse(localStorage.getItem(ARMY_KEY) || "{}") || {}; } catch (e) {}
  const keys = Object.keys(UNIFORMS), uniform = keys.includes(a.uniform) ? a.uniform : keys[0];
  const others = keys.filter(k => k !== uniform);
  const ground = ["open", "ours", "theirs"].includes(a.ground) ? a.ground : "open";
  return { allies: Math.max(0, Math.min(12, a.allies | 0)), enemies: Math.max(1, Math.min(20, a.enemies | 0 || 1)), battle: !!a.battle, uniform, enemyUniform: others[Math.floor(Math.random() * others.length)], ground };
}
export function setArmy(ch) { try { const a = { ...army(), ...ch }; delete a.enemyUniform; localStorage.setItem(ARMY_KEY, JSON.stringify(a)); } catch (e) {} }
const TAKE_OVER = 3;   // (fallen in battle: up again in a comrade's place while this many of them still stand)
const FORM_WORD = { line: "Form line", column: "Form column", square: "Form square", loose: "Loose order — spread out" };
// a bot's name and look, made up fresh
const FIRST = ["Hans", "Matthias", "Jörg", "Kaspar", "Lorenz", "Veit", "Ulrich", "Bastian", "Anna", "Margarethe", "Ursula", "Dorothea", "Barbara", "Elsbeth"];
const LAST = ["Brenner", "Kohl", "Weidner", "Falk", "Ostermann", "Lindau", "Rausch", "Haberland", "Steinkopf", "Wedel", "Asmus", "Grote"];
function botFoe() {
  const look = randomLook(), f = isF(look), first = FIRST.filter((_, i) => f ? i >= 8 : i < 8);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let l; do l = { long: pick(["musket", "bow", "crossbow"]), side: Math.random() < 0.6 ? "pistol" : "none", blade: pick(Object.keys(BLADE)) }; while (weightOf(l) > LOAD_MAX);
  return { name: `${pick(first)} ${pick(LAST)}`, look, lo: l };
}

// ---------------------------------------------------------------------------
//  into the ride
// ---------------------------------------------------------------------------
function startDuel(o) {
  const me = ctx.identity(), r = record();
  ctx.begin();
  const A = o.bot ? army() : null, multi = A && (A.allies > 0 || A.enemies > 1 || A.battle);
  const foe = o.bot ? { ...botFoe(), bot: true, skill: skillOf(r.rating) } : { ...o.foe, bot: false };
  new Arena({ me, lo: { ...lo }, foe, net: o.net || null, side: o.side || 0, army: multi ? A : null });
}

// the ground: the deer ride in the woods below the clearing, open in the middle and the trees thick round it
let C = { x: HUNT.x, z: HUNT.z }, SPAWN = [];
const BOUND = 40, setC = c => { C = c; SPAWN = [{ x: C.x - 19, z: C.z + 2 }, { x: C.x + 19, z: C.z - 2 }]; };
setC(C);

// a battle's ground: somewhere on the Earth as it was in 1683 — anywhere there's land, open enough and level enough
// for two companies to stand off across it (never the sea, a lake, the ice or the peaks), a new place every time;
// and the name of the realm it lies in, or nearest to
function battleGround() {
  const half = EARTH_SIZES.l, w = new Wilds({ seed: (Math.random() * 1e9) | 0, half, kind: "earth" }), L = w.land, R = 64;
  for (let tries = 0; tries < 6000; tries++) {
    const x = (Math.random() * 2 - 1) * half * 0.94, z = (Math.random() * 2 - 1) * half * 0.42;
    const h = L.heightAt(x, z); if (h < WATER + 2.5 || h > 44) continue;
    const b = L.biomeAt(x, z); if (b === "ice" || b === "alpine") continue;
    let lo = h, hi = h, ok = true;
    for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2; j++) { const y = L.heightAt(x + i * R / 2, z + j * R / 2); if (y < WATER + 1.5) { ok = false; break; } lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (!ok || hi - lo > 10) continue;
    return { w, x, z, name: placeName(x / half * 180, -z / half * 180), biome: b };
  }
  return null;
}
function placeName(lon, lat) {
  let best = null, bd = Infinity;
  for (const [n, lo, la] of REALMS_1683) { const dl = Math.abs(((lon - lo + 540) % 360) - 180) * Math.cos(lat * Math.PI / 180), d = Math.hypot(dl, lat - la); if (d < bd) { bd = d; best = n; } }
  const ns = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? "E" : "W"}`;
  return { text: !best ? "The wide world" : bd < 12 ? `Near ${best}` : `Far beyond ${best}`, at: ns };
}

class Arena {
  constructor({ me, lo, foe, net, side, army: A = null }) {
    resetForMode();
    G.arena = this;
    this.me = me; this.lo = lo; this.foeInfo = foe; this.net = net; this.side = side;
    this.army = A; this.multi = !!A; this.battle = !!(A && A.battle);
    this.wins = [0, 0]; this.round = 0; this.over = false; this.live = false; this.clock = ROUND_SECS;
    // (a company's fight wants more room than a duel: the ride opened wider, the two lines further apart)
    this.bound = this.battle ? 60 : this.multi ? 48 : BOUND; this.dx = this.battle ? 27 : this.multi ? 21 : 19;
    // (a duel or a skirmish: the deer ride in the woods; a battle: somewhere on the Earth, new every time)
    const ground = this.battle ? battleGround() : null;
    const w = this.w = ground ? ground.w : new Woods();
    setC(ground ? { x: ground.x, z: ground.z } : { x: HUNT.x, z: HUNT.z });
    this.place = ground ? ground.name : null;
    setWorld(w); setAtmo("afternoon");
    if (ground) w.buildNear(C.x, C.z, 99);
    w.huntOpen = true;
    this.hunt = new Hunt(w, { x: C.x, z: C.z, r: 1 }, {});
    G.who = isF(me.look) ? "sister" : "brother";
    // (in a battle, your company's colours: on you too)
    this.uni = this.battle ? [UNIFORMS[A.uniform] || UNIFORMS.imperial, UNIFORMS[A.enemyUniform]] : null;
    const myLook = this.uni ? inUniform(me.look, this.uni[0]) : me.look;
    G.player.setModel(lookOpts(myLook, me.name)); G.player.model.scaleBase = me.look.height || 1;
    G.showHealth = true; G.hasMap = false;
    // (no music over a fight: the field, the shots and the shouting are the sound of it)
    AUDIO.music(null);
    // the ride opened up for the fight: most of its trees gone, one here and there left standing for cover (never
    // close by where either side starts), and the ground they stand on clear
    const hash = (x, z) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const lines = [{ x: C.x - this.dx, z: C.z }, { x: C.x + this.dx, z: C.z }];
    w.clearScenery(C.x, C.z, this.bound - 6, null, (x, z) => hash(x, z) < (this.battle ? 0.1 : 0.2) && lines.every(p => Math.hypot(p.x - x, p.z - z) > (this.multi ? 12 : 7)) && Math.hypot(x - C.x, z - C.z) > 4);
    this.spawns = this.multi ? lines.map(p => this.clearSpot(p.x, p.z)) : SPAWN.map(p => this.clearSpot(p.x, p.z));
    this.you = { isPlayer: true, team: 0, get pos() { return G.player.pos; }, get alive() { return !G.downed; }, get yaw() { return G.player.yaw + Math.PI; }, name: me.name };
    this.units = [];
    if (this.multi) {
      // the field: its works, and the guns (a battle); a few things lying about between the lines (any fight with men)
      this.fortSide = this.battle ? { ours: 0, theirs: 1 }[A.ground] ?? null : null;
      this.field = new Field(w, C, this.dx, this.battle, undefined, this.fortSide);
      // (the fort's people start inside it, at its front wall)
      if (this.field.fortAt) this.spawns[this.fortSide] = this.clearSpot(this.field.fortAt.anchor.x, this.field.fortAt.anchor.z);
      this.orders = [new Orders(0), new Orders(1)];
      if (!this.battle) this.orders[1].form = "loose";
      this.book = new OrderBook(id => this.give(id));
      const sk = foe.skill, mk = (team, i) => {
        const b = botFoe(), seed = 1000 + team * 100 + i;
        const look = this.uni ? soldierLook(this.uni[team], seed) : b.look;
        const info = { ...b, look, name: this.uni ? `${(this.uni[team].name)} — ${b.name}` : b.name, bot: true, skill: sk * (team === 0 ? 0.95 : 1), team, idx: i };
        if (this.battle ? Math.random() < 0.85 : info.lo.long === "musket" && Math.random() < 0.6) info.lo = { ...info.lo, long: "musket", side: "none", blade: "dagger" };
        const u = new Bot(this, info); this.units.push(u); this.hunt.animals.push(u); return u;
      };
      for (let i = 0; i < A.enemies; i++) mk(1, i);
      for (let i = 0; i < A.allies; i++) mk(0, i);
      // every gun with its crew: a gunner and a loader, with hangers at their belts for anyone who comes at the gun
      for (const g of this.field.guns) for (let c = 0; c < 2; c++) {
        const u = mk(g.side, 100 + this.units.length);
        u.lo = { long: "none", side: "none", blade: "sword" }; u.info.lo = u.lo; u.crewOf = g; u.crewIdx = c; g.crew.push(u);
        u.info.name = `${c ? "Loader" : "Gunner"} — ${u.info.name.split(" — ").pop()}`;
      }
      // and yours to work yourself: F at one, and it's laid on where you're looking and fired
      this.gunIts = this.field.guns.filter(g => g.side === 0).map(g => this.w.addInteract({ x: g.x, y: this.w.heightAt(g.x, g.z) + 1.0, z: g.z, reach: 2.4,
        can: () => G.arena === this && this.live && !G.downed,
        label: () => g.loaded ? "Lay the gun on where you're looking, and fire it" : `The gun's loading${g.crewN ? ` — ${g.crewN} of its crew at it` : " — and nobody's at it"}`,
        use: () => { if (!g.loaded) return; this.field.layAndFire(g, this.lookPoint()); } }));
      this.foe = this.units.find(u => u.team === 1);
      this.foeInfo = { ...this.foe.info, name: this.uni ? this.uni[1].name : this.foe.info.name };
      // (the mouse stays yours to fight with while the book's open: aim, fire, strike)
    } else {
      // the foe
      this.foe = foe.bot ? new Bot(this, { ...foe, team: 1 }) : new NetFoe(this, foe);
      this.hunt.animals.push(this.foe);
      if (foe.bot) this.units.push(this.foe);
    }
    this.keyH = e => this.onKey(e); addEventListener("keydown", this.keyH, true);
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
  foes() {
    if (!this.multi) return this.foe && this.foe.alive && this.foe.view ? [this.foe.view()] : [];
    const p = G.player.pos;
    return this.units.filter(u => u.team === 1 && u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 6).map(u => ({ ...u.view(), duel: u.T === this.you ? G.player : null }));
  }
  // ---- the sides ----
  enemiesOf(team) {
    const out = this.units.filter(u => u.alive && u.team !== team);
    if (team !== 0 && this.you.alive) out.push(this.you);
    return out;
  }
  alliesOf(team) { return this.units.filter(u => u.alive && u.team === team); }
  // (worth showing you: the hints about a head-shot only if it's near enough to be your doing)
  youCanSee(u) { return Math.hypot(u.pos.x - G.player.pos.x, u.pos.z - G.player.pos.z) < 60; }
  hearable(p) { return Math.hypot(p.x - G.player.pos.x, p.z - G.player.pos.z) < 70; }
  // a man's place in his company: in the formation his officer has set, round where it's to be, facing the other side
  slotFor(u) {
    if (u.crewOf) return this.field.station(u.crewOf, u.crewIdx);
    const O = this.orders[u.team], mates = this.alliesOf(u.team).filter(m => !m.crewOf).sort((a, b) => a.idx - b.idx), i = Math.max(0, mates.indexOf(u)), n = mates.length;
    const foes = this.enemiesOf(u.team);
    const cx = foes.length ? foes.reduce((a, f) => a + f.pos.x, 0) / foes.length : C.x + (u.team === 0 ? 1 : -1) * 10;
    const cz = foes.length ? foes.reduce((a, f) => a + f.pos.z, 0) / foes.length : C.z;
    let anchor;
    if (u.team === 0 && O.mode === "follow" && this.you.alive) { const pl = G.player, fw = pl.forward(); anchor = { x: pl.pos.x - fw.x * 2.4, z: pl.pos.z - fw.z * 2.4 }; }
    else anchor = O.at || this.spawns[u.team];
    const face = Math.atan2(cx - anchor.x, cz - anchor.z);
    const p = O.slot(i, n, anchor, face);
    // (never out past the trees)
    const dx = p.x - C.x, dz = p.z - C.z, d = Math.hypot(dx, dz), lim = this.bound - 3;
    if (d > lim) { p.x = C.x + dx / d * lim; p.z = C.z + dz / d * lim; }
    return p;
  }
  // a man down: the duel's round, or the battle's tally
  unitDown(u) {
    if (!this.multi) { this.endRound(0); return; }
    if (u.team === 1) this.killed = (this.killed || 0) + 1; else this.lost = (this.lost || 0) + 1;
    if (this.book) this.book.update(this.bookState());
    if (this.orders && this.orders[0].target === u) this.orders[0].target = null;
    this.showHud();
    this.checkEnd();
  }
  checkEnd() {
    if (this.over || this.ended) return;
    const theirs = this.alliesOf(1).length, ours = this.alliesOf(0).length + (this.you.alive ? 1 : 0);
    if (!theirs || !ours) {
      this.ended = true; this.live = false;
      const won = !theirs;
      slowMo(1.6, 0.3);
      this.banner(won ? "The field is yours" : "The day is lost", won ? `${this.killed || 0} of theirs down` : "");
      setTimeout(() => G.arena === this && this.overView(won), 2600);
    }
  }
  // ---------------------------------------------------------------------------
  //  a fight of companies: everyone in their places, the word given, and the field until one side's gone
  // ---------------------------------------------------------------------------
  beginBattle() {
    this.round = 1; this.live = false; this.ended = false; this.killed = 0; this.lost = 0; this.clock = 0;
    this.rise();
    const pl = G.player, mine = this.spawns[0], theirs = this.spawns[1];
    G.downed = false; G.health = 1; G.stamina = 1; G.hurtT = 0; G.panting = 0; G.hitShake = 0;
    if (pl.gun) pl.showGun(false); if (pl.bow) pl.showBow(false); if (pl.xbow) pl.showXbow(false); if (pl.axe) pl.giveAxe(false);
    pl.gunSaved = {}; pl.gunLoaded = true; pl.gunReload = 0; pl.xspan = 1; pl.bayonet = false; pl.thrustT = -1;
    pl.hasBow = this.lo.long === "bow"; pl.arrows = AMMO.bow;
    G.body.tools.bolts = AMMO.crossbow; G.body.tools.crossbow = this.lo.long === "crossbow" ? 1 : 0; G.body.tools.musket = this.lo.long === "musket" ? 1 : 0;
    G.body.hunger = 1; G.body.thirst = 1; G.body.temp = 0;
    clearDropped();
    // you before your company, a few paces in front of its line; they in their ranks behind; the other side at its own
    const face0 = Math.atan2(theirs.x - mine.x, theirs.z - mine.z), face1 = face0 + Math.PI;
    const O0 = this.orders[0], O1 = this.orders[1];
    O0.mode = "follow"; O0.at = null; O1.mode = "hold"; O1.at = { x: theirs.x, z: theirs.z };
    // (holding your fort: your company on its front wall from the start)
    if (this.fortSide === 0) { O0.mode = "hold"; O0.at = { x: mine.x, z: mine.z }; }
    pl.place(mine.x + Math.sin(face0) * 3, mine.z + Math.cos(face0) * 3, face0 + Math.PI);
    for (const [team, at, face, O] of [[0, mine, face0, O0], [1, theirs, face1, O1]]) {
      const list = this.alliesOf(team).filter(u => !u.crewOf).sort((a, b) => a.idx - b.idx);
      list.forEach((u, i) => { const p = this.clearSpot(...Object.values(O.slot(i, list.length, at, face))); u.reset(p, team ? mine : theirs); });
      for (const u of this.alliesOf(team).filter(u => u.crewOf)) u.reset(this.field.station(u.crewOf, u.crewIdx), team ? mine : theirs);
    }
    pl.swingRate = BLADE[this.lo.blade].rate; G.loadMul = loadMul(this.lo);
    this.takeUp(this.lo.long !== "none" ? this.lo.long : this.lo.side === "pistol" ? "pistol" : this.lo.blade);
    G.lockMove = true;
    // (their officer: how long he'll hold his ground before he comes on)
    this.holdFor = this.fortSide === 1 ? Infinity : this.fortSide === 0 ? 4 + Math.random() * 5 : this.battle ? 15 + Math.random() * 15 : 3 + Math.random() * 5; this.cmdT = 0; this.volT = 10 + Math.random() * 6;
    this.showHud();
    const allies = this.alliesOf(0).length, foes = this.alliesOf(1).length;
    this.banner(this.place ? esc(this.place.text) : this.battle ? "Battle" : "Skirmish",
      `${allies ? `${allies} with you` : "On your own"} · ${foes} against you${this.place ? ` · ${this.place.at}` : ""}${allies || this.battle ? " · the numbers are your orders" : ""}`);
    UI.fadeNow(1); UI.fade(0, 1.2);
    const steps = ["3", "2", "1"];
    steps.forEach((t, i) => setTimeout(() => { if (G.arena === this && !this.live && !this.over) { this.banner(t, ""); } }, 2600 + i * 800));
    setTimeout(() => {
      if (G.arena !== this || this.over) return;
      this.banner(this.battle ? "Forward!" : "Fight!", ""); G.lockMove = false; this.live = true; this.liveAt = G.time;
      if (this.battle) AUDIO.drumRoll && AUDIO.drumRoll(1.8, 0.28);   // (the side drum, beating the advance)
      for (const u of this.units) u.go();
      AUDIO.voice && AUDIO.voice("war", { high: G.who === "sister", vol: 0.7 });
      setTimeout(() => G.arena === this && this.banner(null), 1000);
      if (this.book && (allies || this.battle)) { this.book.show(this.bookState()); if (!this.toldBook) { this.toldBook = true; setTimeout(() => G.arena === this && UI.hint("The number keys give your orders, as the page at the left has them — and you fight on the while. The wheel changes your weapon" + (this.canBayonet() ? "; F fixes your bayonet (for good)." : "."), 6), 2200); } }
    }, 2600 + steps.length * 800);
  }
  // every frame of it: the men, the officer over there, the guns and their shot, your marks on the ground
  updateField(dt) {
    for (const u of this.units) u.tick(dt);
    stanceTick();
    if (this.live) { this.clock += dt; this.commander(dt); }
    if (this.field) this.field.update(dt, [...this.units, this.you], (u, from, v) => {
      if (u === this.you) this.hurtMe(400, { pos: from });
      else u.damage(400, false, false, from);
    });
    for (const m of (this.marks ||= []).slice()) { m.t += dt; m.mesh.material.opacity = Math.max(0, 0.8 * (1 - m.t / 2.6)); m.mesh.scale.setScalar(1 + m.t * 0.25); if (m.t > 2.6) { this.w.root.remove(m.mesh); this.marks.splice(this.marks.indexOf(m), 1); } }
    // (dead and watching: your eye on one of your own still standing)
    if (this.watching) this.watchTick();
    this.drawHud();
  }
  // their officer: holds his ground at the works for a while (less if he's the stronger), then brings them on, a few
  // paces at a time, at your company; volleys when they're near enough; and, close, sends them in with the steel
  commander(dt) {
    const O = this.orders[1], t = G.time - this.liveAt;
    const theirs = this.alliesOf(1), ours = this.alliesOf(0).concat(this.you.alive ? [this.you] : []);
    if (!theirs.length || !ours.length) return;
    const cen = l => ({ x: l.reduce((s, u) => s + u.pos.x, 0) / l.length, z: l.reduce((s, u) => s + u.pos.z, 0) / l.length });
    const a = cen(theirs), b = cen(ours), d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const shout = () => { const o = theirs[0]; AUDIO.voice && AUDIO.voice("war", { at: o.pos, vol: 0.9, high: isF(o.info.look) }); };
    // (holding a fort: they stay on its wall and fire, volley as you come, and only go at you with the steel when you're
    //  inside it)
    if (this.fortSide === 1) {
      const F = this.field.fortAt, inFort = ours.some(u => (u.pos.x - F.front) * F.sx > -0.5 && (u.pos.x - F.back) * F.sx < 0.5 && Math.abs(u.pos.z - F.z) < F.W);
      O.charge = inFort;
      if ((this.volT -= dt) <= 0 && d < 60 && !O.charge) { this.volT = 9 + Math.random() * 6; O.volleyAt = G.time + 1.1; shout(); }
      return;
    }
    if (O.mode === "hold" && (t > this.holdFor || theirs.length > ours.length * 1.6 || d < 22)) { O.mode = "advance"; shout(); }
    if (O.mode === "advance" && (this.cmdT -= dt) <= 0) {
      this.cmdT = 2.5;
      const step = Math.max(0, Math.min(d - 12, 10));
      O.at = { x: a.x + (b.x - a.x) / d * step, z: a.z + (b.z - a.z) / d * step };
    }
    if (!O.charge && d < 15 && (theirs.length >= ours.length * 0.8 || t > this.holdFor + 45)) { O.charge = true; shout(); }
    if ((this.volT -= dt) <= 0 && d < 60 && !O.charge) { this.volT = 11 + Math.random() * 8; O.volleyAt = G.time + 1.3; shout(); }
  }
  // your blade in the press: the nearest of theirs in reach, in front of you
  swingAt() {
    const pl = G.player, B = this.myBlade(), fwd = pl.forward();
    if (!this.live) return;
    let best = null, bd = Infinity;
    for (const u of this.alliesOf(1)) {
      const dx = u.pos.x - pl.pos.x, dz = u.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > B.reach || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.45) continue;
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) return;
    AUDIO.chop ? AUDIO.chop() : FOLEY.chop(best.pos, 0.7); G.impact && G.impact();
    best.struck(B.dmg, pl.swingDir || "right");
  }
  // you fall: the red, and the word; and then, while your company's still fighting, your eye on one of them
  fallInBattle(from) {
    const left = this.alliesOf(0).length;
    // (while three of your company still stand, you fight on as one of them)
    const on = left >= TAKE_OVER;
    this.deathFall(from, "You've fallen", on ? "You take a place in the ranks" : left ? "Your company fights on" : "");
    this.showHud();
    if (on) { setTimeout(() => this.takeOver(), 3600); return; }
    if (left) setTimeout(() => {
      if (G.arena !== this || this.over || this.ended) return;
      const fx = $("deathFx"); if (fx) fx.classList.add("watch");
      this.watching = true; this.watchTick();
      UI.hint("Watching your company. Esc to leave the field.", 4);
    }, 3800);
    this.checkEnd();
  }
  // up again as one of your own: the man furthest from the fighting gives you his place — he falls where you fell, and you
  // stand where he stood, whole, loaded, and carrying what you carry
  takeOver() {
    if (G.arena !== this || this.over || this.ended) return;
    const mates = this.alliesOf(0);
    if (mates.length < TAKE_OVER) { this.fallInBattleWatch(); return; }
    const foes = this.alliesOf(1), far = u => Math.min(...foes.map(f => Math.hypot(f.pos.x - u.pos.x, f.pos.z - u.pos.z)), 999);
    const u = mates.sort((a, b) => far(b) - far(a))[0], pl = G.player, at = { x: u.pos.x, z: u.pos.z }, was = { x: pl.pos.x, z: pl.pos.z };
    UI.fadeNow(1); UI.fade(0, 0.9);
    // (his body where yours lay: the fallen man is the one there now)
    u.quiet = true; u.hp = 0; u.a.place(was.x, was.z, u.a.yaw); u.fallDown(this.spawns[1]);
    this.units.splice(this.units.indexOf(u), 1); this.lost = (this.lost || 0) + 1;
    this.rise(); this.watching = false;
    G.downed = false; G.health = 1; G.stamina = 1; G.hurtT = 0; G.lockMove = false; pl.frozen = false;
    pl.gunSaved = {}; pl.gunLoaded = true; pl.gunReload = 0; pl.xspan = 1;
    const th = foes[0] ? foes[0].pos : this.spawns[1];
    pl.place(at.x, at.z, Math.atan2(-(th.x - at.x), -(th.z - at.z)));
    this.takeUp(this.lo.long !== "none" ? this.lo.long : this.lo.side === "pistol" ? "pistol" : this.lo.blade);
    this.showHud();
    UI.hint(`Up — in his place. ${mates.length - 1} of your company still standing.`, 3);
  }
  fallInBattleWatch() {
    const fx = $("deathFx"); if (fx) fx.classList.add("watch");
    this.watching = true; this.watchTick();
  }
  watchTick() {
    let u = this.watched;
    if (!u || !u.alive) u = this.watched = this.alliesOf(0)[0];
    if (!u) { this.watching = false; return; }
    const back = new THREE.Vector3(), look = new THREE.Vector3();
    G.deathCam = cam => {
      const p = u.pos, yaw = u.yaw;
      back.set(p.x - Math.sin(yaw) * 4.2, p.y + 2.4, p.z - Math.cos(yaw) * 4.2);
      cam.position.lerp(back, 0.08); cam.up.set(0, 1, 0);
      look.set(p.x + Math.sin(yaw) * 6, p.y + 1.2, p.z + Math.cos(yaw) * 6); cam.lookAt(look);
    };
  }
  // ---- the orders: the number keys, in the field ----
  bookState() { const O = this.orders[0]; return { count: this.alliesOf(0).length, battle: this.battle, fire: O.fire, charge: O.charge, cover: O.cover, guns: !!this.gunsOn, mode: O.mode, form: O.form }; }
  // the number keys are your orders, in a fight of companies (the wheel still goes through your weapons: its turns come
  // as numbers too, but marked as the wheel's)
  takesNumbers(e) { return !!(this.book && this.book.open && !e.fromWheel && /^Digit\d$/.test(e.code)); }
  onKey(e) {
    if (G.arena === this && this.viewing && e.code === "Enter" && !e.repeat) { e.stopImmediatePropagation(); e.preventDefault(); G.endFreecam && G.endFreecam(); this.finish(this.viewing.won); return; }
    if (G.arena !== this || e.repeat || !this.live || G.downed || G.mode !== "play") return;
    // F (with nothing else to hand): the bayonet fixed under your musket's muzzle — for good, this fight. It's in the way
    // of the rod and the aim: slower loading, and the shot less true
    if (e.code === "KeyF" && this.canBayonet() && !G.player.bayonet && !G.interactTarget) {
      e.stopImmediatePropagation(); e.preventDefault();
      const pl = G.player; if (!pl.gun || pl.gunIs !== "musket") this.takeUp("musket");
      if (pl.fixBayonet(true)) UI.hint("Bayonet fixed — for the rest of the fight. It's in the way: loading's slower, the aim's less true. Once you've fired, a click is the bayonet.", 4);
      return;
    }
    if (!this.book || !this.book.open || e.fromWheel) return;
    if (this.book.key(e)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }
  // where you're looking, on the ground (within the field)
  lookPoint() {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const p = camera.position, w = this.w;
    let at = null;
    for (let t = 1; t < 180; t += 0.5) { const x = p.x + dir.x * t, y = p.y + dir.y * t, z = p.z + dir.z * t; if (y <= w.heightAt(x, z)) { at = { x, z }; break; } }
    if (!at) at = { x: p.x + dir.x * 60, z: p.z + dir.z * 60 };
    const dx = at.x - C.x, dz = at.z - C.z, d = Math.hypot(dx, dz), lim = this.bound - 3;
    if (d > lim) { at.x = C.x + dx / d * lim; at.z = C.z + dz / d * lim; }
    return at;
  }
  // a mark on the ground where you sent them, fading
  mark(at, colour = 0xf0d890) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(at.x, this.w.heightAt(at.x, at.z) + 0.08, at.z); this.w.root.add(m);
    (this.marks ||= []).push({ mesh: m, t: 0 });
  }
  give(id) {
    this.giveNow(id);
    // (and the word taken up down the line: a man or two shouting it back)
    const mates = this.alliesOf(0).filter(u => !u.crewOf);
    for (let i = 0; i < Math.min(2, mates.length); i++) { const u = mates[Math.floor(Math.random() * mates.length)]; setTimeout(() => u.alive && AUDIO.voice && AUDIO.voice(Math.random() < 0.6 ? "war" : "grunt", { at: u.pos, vol: 0.55, high: isF(u.info.look) }), 350 + i * 260 + Math.random() * 200); }
    if (this.book) this.book.update(this.bookState());
  }
  giveNow(id) {
    const O = this.orders[0], pl = G.player, say = (t, v = "war") => { UI.hint(t, 2.2); AUDIO.voice && AUDIO.voice(v, { high: G.who === "sister", vol: 0.8 }); };
    if (id.startsWith("form:")) { O.form = id.slice(5); say(`${FORM_WORD[O.form] || "Form up"}!`); return; }
    switch (id) {
      case "follow": O.mode = "follow"; O.at = null; O.cover = false; O.charge = false; say("On me — fall in!"); break;
      case "hold": O.mode = "hold"; O.at = { x: pl.pos.x, z: pl.pos.z }; O.cover = false; O.charge = false; this.mark(O.at); say("Halt! Hold here."); break;
      case "advance": O.mode = "advance"; O.at = this.lookPoint(); O.cover = false; O.charge = false; this.mark(O.at); say("Forward — there!"); break;
      case "cover": O.cover = true; O.charge = false; if (O.mode === "follow") { O.mode = "hold"; O.at = { x: pl.pos.x, z: pl.pos.z }; } say("Get down — take cover!"); break;
      case "fire": O.fire = !O.fire; say(O.fire ? "Fire at will!" : "Hold your fire!"); break;
      case "volley": O.volleyAt = G.time + 1.1; O.fire = true; say("Make ready… present… fire!"); break;
      case "target": {
        const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
        let best = null, ba = 0.12;
        for (const u of this.alliesOf(1)) { const v = new THREE.Vector3(u.pos.x - camera.position.x, u.pos.y + 1.2 - camera.position.y, u.pos.z - camera.position.z), d = v.length(); if (d > 150) continue; const ang = v.normalize().angleTo(dir); if (ang < ba) { ba = ang; best = u; } }
        if (!best) { UI.hint("Look at the man you want brought down, then give the order.", 2.5); return; }
        O.target = best; this.mark(best.pos, 0xd86a50); say("That one — bring him down!"); break;
      }
      case "charge": O.charge = !O.charge; if (O.charge) O.cover = false; say(O.charge ? "Charge!" : "Halt — fall back in!"); break;
      case "guns": {
        if (!this.field || !this.field.guns.some(g => g.side === 0)) { UI.hint("Your company has no guns here.", 2); return; }
        this.gunsOn = !this.gunsOn;
        const at = this.gunsOn ? this.lookPoint() : null; this.field.order(0, at); if (at) this.mark(at, 0xd86a50);
        say(this.gunsOn ? "Guns — on that ground there!" : "Guns — fire at will!"); break;
      }
    }
  }
  // ---- the bar of what you carry: your loadout, nothing else ----
  hotbar() {
    const L = this.lo, out = [], pl = G.player;
    if (L.long === "musket") out.push({ icon: "musket", name: pl.bayonet ? "Musket, bayonet fixed" : L.blade === "dagger" ? "Musket (F: fix bayonet)" : "Musket", tool: "gun", kind: "musket" });
    if (L.long === "bow") { out.push({ icon: "bow", name: "Bow", tool: "bow" }); out.push({ icon: "arrows", name: "Arrows", n: pl.arrows || 0 }); }
    if (L.long === "crossbow") { out.push({ icon: "crossbow", name: "Crossbow", tool: "xbow" }); out.push({ icon: "bolts", name: "Bolts", n: (G.body.tools.bolts || 0) }); }
    if (L.side === "pistol") out.push({ icon: "pistol", name: "Pistol", tool: "gun", kind: "pistol" });
    const B = BLADE[L.blade] || BLADE.dagger;
    // (a musket and a bayonet: the bayonet's fixed on the musket — the blade alone is only the last resort)
    out.push({ icon: B.icon, name: L.blade === "dagger" ? "Bayonet, in hand" : B.name, tool: "arm", kind: L.blade });
    return out;
  }
  // ---- a round: both put back at their ends, made whole, loaded, and three, two, one ----
  beginRound() {
    if (this.multi) return this.beginBattle();
    this.round++; this.live = false; this.clock = ROUND_SECS; this.roundDone = false;
    this.rise();
    const pl = G.player, mine = this.spawns[this.side], theirs = this.spawns[1 - this.side];
    G.downed = false; G.health = 1; G.stamina = 1; G.hurtT = 0; G.panting = 0; G.hitShake = 0;
    if (pl.gun) pl.showGun(false); if (pl.bow) pl.showBow(false); if (pl.xbow) pl.showXbow(false); if (pl.axe) pl.giveAxe(false);
    pl.gunSaved = {}; pl.gunLoaded = true; pl.gunReload = 0; pl.xspan = 1; pl.bayonet = false; pl.thrustT = -1;
    const extra = 1;
    pl.hasBow = this.lo.long === "bow"; pl.arrows = Math.round(AMMO.bow * extra);
    G.body.tools.bolts = Math.round(AMMO.crossbow * extra); G.body.tools.crossbow = this.lo.long === "crossbow" ? 1 : 0; G.body.tools.musket = this.lo.long === "musket" ? 1 : 0;
    G.body.hunger = 1; G.body.thirst = 1; G.body.temp = 0;
    clearDropped();
    // (arrows lying about from the last round: gone)
    for (const ar of this.hunt.arrows) { this.w.root.remove(ar.mesh); if (ar.it) this.w.removeInteract(ar.it); }
    this.hunt.arrows = [];
    pl.place(mine.x, mine.z, Math.atan2(-(theirs.x - mine.x), -(theirs.z - mine.z)));
    pl.swingRate = BLADE[this.lo.blade].rate; G.loadMul = loadMul(this.lo);
    this.takeUp(this.lo.long !== "none" ? this.lo.long : this.lo.side === "pistol" ? "pistol" : this.lo.blade);
    this.foe.reset(theirs, mine);
    G.lockMove = true;
    this.showHud();
    const n = this.round;
    this.banner(`Round ${n}`, this.wins[0] + this.wins[1] ? `${this.wins[0]} – ${this.wins[1]}` : `Best of three · ${esc(this.foeInfo.name)}${this.foeInfo.bot ? " (bot)" : ""}`);
    UI.fadeNow(1); UI.fade(0, 0.8);
    const steps = ["3", "2", "1"];
    steps.forEach((t, i) => setTimeout(() => { if (G.arena === this && this.round === n) { this.banner(t, ""); } }, 1400 + i * 800));
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
  // what your blade is now: the bayonet on your musket, if it's fixed; else the one in your belt
  myBlade() { const pl = G.player; return (pl.gun && pl.bayonet && pl.gunIs === "musket") || pl.blade === "bayonet" ? BLADE.bayonet : BLADE[this.lo.blade] || BLADE.dagger; }
  canBayonet() { return this.lo.long === "musket" && this.lo.blade === "dagger"; }
  swing() {
    if (this.multi) return this.swingAt();
    const pl = G.player, f = this.foe, B = this.myBlade();
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
  youDown(from) {
    G.downed = true; G.lockMove = true;
    if (this.multi) return this.fallInBattle(from);
    this.deathFall(from);
    if (this.net) { this.net.send({ t: "ddown", r: this.round }); this.live = false; return; }
    this.endRound(1);
  }
  foeDown() { if (!this.net) this.endRound(0); }
  // you're down: your body falls as it falls (a ragdoll), your eye goes with your head, the world reddens and dims,
  // and who won is written over it
  deathFall(from, title = null, sub = "") {
    const pl = G.player, m = pl.model; if (!m) return;
    if (pl.gun) pl.showGun(false); if (pl.bow) pl.showBow(false); if (pl.xbow) pl.showXbow(false); if (pl.axe) pl.giveAxe(false);
    // (your whole body back, head and all — first person it's only the neck down)
    for (const b of m._fp || []) b.scale.setScalar(1); m._fpOn = false; if (m._cap) m._cap.visible = false;
    m.aimHidden = false; m.load = null;
    const src = from && from.pos ? from.pos : this.foe.pos, push = new THREE.Vector3(pl.pos.x - src.x, 0, pl.pos.z - src.z).normalize().multiplyScalar(2.6).add(new THREE.Vector3(0, 0.4, 0));
    const gun = m.aimH && m.aimH.obj; if (gun) { m.aimHold(null); m.root.add(gun); dropThing(gun, push.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, 1.2, 0))); }
    pl.frozen = true;
    const rag = this.myRag = ragdoll(m, push, "chest");
    if (rag) {
      const f = new THREE.Vector3(), up = new THREE.Vector3(), eye = new THREE.Vector3();
      // (which way the face looks, against the shoulders and the spine: settled now, while you're still facing it)
      { const p = rag.p, u = p.crown.clone().sub(p.neck).normalize(), f0 = p.shR.clone().sub(p.shL).cross(u);
        rag.flip = f0.dot(new THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw))) < 0; }
      G.deathCam = cam => {
        const p = rag.p;
        // (looking out of the face: square to the shoulders and the spine, the way the body faced)
        up.copy(p.crown).sub(p.neck).normalize();
        f.copy(p.shR).sub(p.shL).cross(up).normalize();
        if (rag.flip) f.negate();
        eye.copy(p.head).lerp(p.crown, 0.55).addScaledVector(f, 0.09);
        cam.position.copy(eye); cam.up.copy(up); cam.lookAt(eye.clone().add(f).addScaledVector(up, -0.15));
      };
    }
    // the red, coming in slowly from the edges, and the name over it
    let fx = $("deathFx");
    if (!fx) { fx = document.createElement("div"); fx.id = "deathFx"; fx.innerHTML = `<div class="dfx-t"></div><div class="dfx-s"></div>`; $("hud").appendChild(fx); }
    fx.querySelector(".dfx-t").textContent = title || `${this.foeInfo.name} won`;
    fx.querySelector(".dfx-s").textContent = sub;
    fx.classList.remove("on"); void fx.offsetWidth; fx.classList.add("on");
    document.body.classList.add("dead");
    AUDIO.voice && AUDIO.voice("death", { high: G.who === "sister", vol: 1 });
  }
  // up again for the next round: the ragdoll let go of, your eye your own again
  rise() {
    const pl = G.player;
    if (this.myRag) { this.myRag.stop(); this.myRag = null; }
    G.deathCam = null; pl.frozen = false;
    const fx = $("deathFx"); if (fx) fx.classList.remove("on", "watch");
    document.body.classList.remove("dead");
  }
  // a round over: who took it (0 you, 1 them, -1 neither — time ran out with nothing between you)
  endRound(who) {
    if (this.roundDone) return; this.roundDone = true; this.live = false;
    if (who >= 0) this.wins[who]++;
    this.showHud();
    slowMo(1.4, 0.3);
    const done = who >= 0 && this.wins[who] >= ROUNDS_TO_WIN;
    if (who === 1 && G.deathCam) this.banner(null);
    else this.banner(who === 0 ? "You take the round" : who === 1 ? `${esc(this.foeInfo.name)} takes the round` : "Time — nobody", `${this.wins[0]} – ${this.wins[1]}`);
    if (who === 1 && G.deathCam) { const fx = $("deathFx"); if (fx) fx.querySelector(".dfx-s").textContent = `${this.wins[0]} – ${this.wins[1]}${done ? "" : " · next round"}`; }
    setTimeout(() => { if (G.arena !== this) return; if (done) this.overView(who === 0); else if (!this.net) this.beginRound(); }, 3200);
  }
  // ---- over: the field to look over as long as you like (the free camera), and Enter to leave it ----
  overView(won) {
    if (this.over || this.viewing) return;
    this.viewing = { won }; this.watching = false;
    // (your body where it fell; your eye loosed from it, and the red gone)
    G.deathCam = null; const fx = $("deathFx"); if (fx) fx.classList.remove("on", "watch"); document.body.classList.remove("dead");
    if (this.book) this.book.hide();
    G.downed = false; G.lockMove = false;
    if (!G.freecam && G.toggleFreecam) G.toggleFreecam();
    this.banner(null);
    UI.hint(`${won ? "Won." : "Lost."} Look over the field — WASD to fly, Space up, C down. Enter to leave it.`, 8);
  }
  // ---- the match over: the record, and the result ----
  finish(won, left = false) {
    if (this.over) return; this.over = true;
    const r = record(), foeR = this.foeInfo.rating || r.rating, exp = 1 / (1 + Math.pow(10, (foeR - r.rating) / 400)), k = 32;
    const delta = Math.round(k * ((won ? 1 : 0) - exp));
    r.rating = Math.max(100, r.rating + delta); if (won) { r.w++; r.streak = (r.streak || 0) + 1; } else { r.l++; r.streak = 0; }
    saveRecord(r);
    if (won && G.achEvent) { G.achEvent("pvp-win"); if (r.streak >= 5) G.achEvent("pvp-streak5"); }
    const score = this.multi ? `${this.killed || 0} of theirs down, ${this.lost || 0} of yours${this.place ? ` · ${esc(this.place.text)}` : ""}` : `${this.wins[0]} – ${this.wins[1]}`;
    this.stop();
    ctx.end();
    $("pvpEndK").textContent = left ? "They left the field" : won ? "Victory" : "Defeat";
    $("pvpEndT").textContent = this.multi ? (won ? "The field is yours" : "The day is lost") : won ? `You beat ${this.foeInfo.name}` : `${this.foeInfo.name} beat you`;
    $("pvpEndS").innerHTML = `${score}${this.foeInfo.bot && !this.multi ? " · against a bot" : ""}<br>Rating <b>${Math.round(r.rating)}</b> <span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta}</span> · ${rankOf(r.rating)} · ${r.w} won, ${r.l} lost`;
    ctx.screen("pvpEnd");
  }
  // gone from the arena (the match done, or quit from the pause menu)
  stop() {
    if (G.arena !== this) return;
    if (G.freecam && G.endFreecam) G.endFreecam();
    G.arena = null; this.live = false;
    const i = G.onFrame.indexOf(this.tick); if (i >= 0) G.onFrame.splice(i, 1);
    G.onSwing = null; G.onDowned = null; G.onGunshot = null; G.onLoose = null; G.onSwingStart = null;
    this.rise();
    G.player.swingRate = 1; G.loadMul = 1; G.lockMove = false; G.downed = false; G.player.bayonet = false;
    if (this.net) { this.net.send({ t: "dleave" }); this.net.close(); this.net = null; }
    if ($("pvpHud")) $("pvpHud").classList.add("hidden");
    this.banner(null);
    UI.stance && UI.stance(null);
    if (this.keyH) removeEventListener("keydown", this.keyH, true);
    if (this.clickH) removeEventListener("mousedown", this.clickH, true);
    if (this.book) this.book.hide();
    for (const it of this.gunIts || []) this.w.removeInteract(it);
    if (this.field) this.field.dispose();
    for (const m of this.marks || []) this.w.root.remove(m.mesh);
    this.marks = [];
  }
  // ---- every frame ----
  update(dt) {
    if (G.arena !== this) return;
    const pl = G.player;
    // (the field: the ride and the trees round it; out past them, you're turned back)
    pl.swingRate = this.myBlade().rate;   // (the bayonet on the musket strikes at its own pace, not the blade's in your belt)
    const dx = pl.pos.x - C.x, dz = pl.pos.z - C.z, d = Math.hypot(dx, dz), B = this.bound;
    if (d > B) { pl.pos.x = C.x + dx / d * B; pl.pos.z = C.z + dz / d * B; if (!this.boundTold || G.time - this.boundTold > 4) { this.boundTold = G.time; UI.hint(this.battle ? "The battle's here — your company's behind you." : "The fight's here, in the ride.", 1.5); } }
    if (this.multi) { this.updateField(dt); return; }
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
    h.classList.toggle("multi", this.multi);
    if (this.multi) {
      const ours = this.alliesOf(0).length + (this.you.alive ? 1 : 0), theirs = this.alliesOf(1).length;
      h.querySelector(".ph-me .ph-name").textContent = `${this.uni ? this.uni[0].name : "Yours"} · ${ours} standing`;
      h.querySelector(".ph-foe .ph-name").textContent = `${this.uni ? this.uni[1].name : "Theirs"} · ${theirs} standing`;
      h.querySelector(".ph-me .ph-pips").innerHTML = ""; h.querySelector(".ph-foe .ph-pips").innerHTML = "";
      h.querySelector(".ph-round").textContent = this.place ? this.place.text : this.battle ? "Battle" : "Skirmish";
      return;
    }
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
    if (c !== this._c) { this._c = c; h.querySelector(".ph-clock").textContent = c; h.querySelector(".ph-clock").classList.toggle("low", !this.multi && s <= 20); }
    const k = this.multi ? clamp(this.alliesOf(1).length / Math.max(1, this.army.enemies), 0, 1) : clamp(this.foe.hp / HP, 0, 1);
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
      const pl = G.player, B = this.myBlade(), dx = f.pos.x - pl.pos.x, dz = f.pos.z - pl.pos.z, d = Math.hypot(dx, dz), fwd = pl.forward();
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
    const ld = pl.gun && pl.gunReload > 0 ? +((pl.gunIs === "pistol" ? 2.4 : 6.5) - pl.gunReload).toFixed(2) : 0;
    this.net.send({ t: "ds", x: +pl.pos.x.toFixed(2), z: +pl.pos.z.toFixed(2), yaw: +pl.yaw.toFixed(2), s: +(pl.speed || 0).toFixed(1), h: held, aim: aim ? 1 : 0, g: pl.guard ? 1 : 0, c: pl.crouched ? 1 : 0, dn: G.downed ? 1 : 0, ld });
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
  // what's in his hands: a long arm or the pistol in both hands (or the one) at the shoulder; the bow in the left; a blade
  hold(k) {
    if (k === "none") k = null;
    if (this.heldK === k) return; this.heldK = k;
    const P = this.a.person; P.held.clear(); P.heldL.clear(); P.aimHold && P.aimHold(null);
    P.blade = !!k && !["bow", "crossbow", "musket", "pistol"].includes(k);
    if (!k) return;
    if (k === "bow") { const bm = modelCopy("bow"), bow = bm ? bm.scene : new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x7a4e2a })); bow.rotation.set(0, Math.PI / 2, 0); this.a.hold(bow, true); return; }
    if (k === "crossbow" || k === "musket" || k === "pistol") { this.gun = shoulderArm(P, k); return; }
    this.a.hold(makeArm(k));
  }
  // brought up to aim, or down at the ready
  aimUp(on) { this.a.person.aimWant = !!on; }
  muzzle() {
    const g = this.gun && this.gun.parent && this.gun.userData.muzzle;
    if (g) return g.getWorldPosition(new THREE.Vector3());
    const f = new THREE.Vector3(Math.sin(this.a.yaw), 0, Math.cos(this.a.yaw)); return new THREE.Vector3(this.a.pos.x, this.a.pos.y + 1.45, this.a.pos.z).addScaledVector(f, this.heldK === "pistol" ? 0.6 : 1.1);
  }
  // down: let go, a ragdoll, pushed the way the blow came (from `from`, a place); what was in the hands falls
  fallDown(from, head) {
    const a = this.a, P = a.person; a.path = []; this.wind = 0; a.squareTo = null;
    if (!head && !this.quiet) AUDIO.voice && AUDIO.voice("death", { at: a.pos, vol: 1.1, high: isF(this.info.look) });
    blowLands(a, "down");
    const src = from || G.player.pos, push = new THREE.Vector3(a.pos.x - src.x, 0, a.pos.z - src.z).normalize().multiplyScalar(3.2).add(new THREE.Vector3(0, 0.6, 0));
    P.load = null; P.aimWant = false;
    const gun = P.aimH && P.aimH.obj; if (gun) { P.aimHold(null); P.root.add(gun); dropThing(gun, push.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, 1.2, 0))); }
    for (const h of [P.held, P.heldL]) for (const c of [...h.children]) dropThing(c, push.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 1, 0)));
    this.heldK = null;
    this.rag = ragdoll(P, push, head ? "head" : "chest");
    if (!this.rag) { a.lying = true; a.yOff = 0.05; }
    a.ragdoll = !!this.rag;
  }
  standUp() { if (this.rag) { this.rag.stop(); this.rag = null; } this.a.ragdoll = false; this.a.lying = false; this.a.yOff = 0; this.a.person.setPose("idle"); }
}

// ---------------------------------------------------------------------------
//  the bot: the same arms, the same life, the same rules — and only as quick and as sure as you are
// ---------------------------------------------------------------------------
const DIRS = ["up", "left", "right"];
class Bot extends Fighter {
  constructor(arena, info) {
    super(arena, info);
    this.s = info.skill; this.lo = info.lo; this.team = info.team ?? 1; this.idx = info.idx || 0;
    info.rating = record().rating;
  }
  reset(at, face) {
    this.hp = HP; this.standUp(); this.a.place(at.x, at.z, Math.atan2(face.x - at.x, face.z - at.z));
    this.loaded = { long: true, side: this.lo.side === "pistol" }; this.rl = { long: 0, side: 0 };
    this.ammo = AMMO[this.lo.long] || 0;
    this.wind = 0; this.cool = 1; this.stun = 0; this.aimT = 0; this.stepT = 0; this.losT = 0; this.los = true; this.awake = false;
    this.mode = "range"; this.guardT = 0; this.T = null; this.pickT = 0; this.cover = null; this.dodgeT = 0;
    this.fixed = this.arena.battle && this.steel() === "bayonet"; this.heldK = undefined;
    this.hold(this.lo.long); this.a.squareTo = null;
  }
  go() { this.awake = true; this.aimT = -0.9 - Math.random() * 0.6; }
  // his steel: the bayonet fixed on his musket if he has the two; else his blade
  steel() { return this.lo.long === "musket" && this.lo.blade === "dagger" ? "bayonet" : this.lo.blade; }
  // (a soldier in a battle fixes his bayonet before ever he comes on, and fires with it fixed)
  hold(k) { super.hold(k); if (k === "musket" && this.fixed && this.gun) addBayonet(this.gun); }
  // a blow on him — yours (from the side you swung) or another man's: turned aside if he's guarding that side and
  // facing whoever struck (the better he is, the oftener)
  struck(dmg, side, by = null) {
    if (!this.alive) return;
    const src = by ? by.pos : G.player.pos, dx = src.x - this.pos.x, dz = src.z - this.pos.z;
    const facing = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (Math.hypot(dx, dz) || 1) > 0.3;
    const guarded = by ? Math.random() < 0.15 + this.s * 0.3 : this.guardDir === side && Math.random() < 0.35 + this.s * 0.5;
    if (facing && this.wind <= 0 && this.stun <= 0 && this.mode === "melee" && guarded) {
      AUDIO.clang && AUDIO.clang(0.9, this.pos); blowLands(this.a, "parried", by ? by.a : G.player);
      this.a.person.setPose(blowPose(this.heldK, "right")); setTimeout(() => this.alive && this.a.person.setPose("idle"), 300);
      this.cool = Math.min(this.cool, 0.4);
      if (by) { by.stun = Math.max(by.stun, 0.8); return; }
      G.player.parryJolt = G.time + 0.3;
      if (!this.arena.parryTold) { this.arena.parryTold = true; UI.hint("He turned it — he was guarding that side (the grey mark). Strike from another.", 4); }
      return;
    }
    this.damage(dmg, true, false, src);
  }
  // an arrow or a ball in him
  hit(power, head) { this.damage(dmgOf(power, head), false, head); if (head && this.alive && this.arena.youCanSee(this)) UI.hint("In the head.", 1.2); }
  damage(d, melee, head = false, from = null) {
    if (!this.alive || !this.arena.live) return;
    this.hp = Math.max(0, this.hp - d);
    if (this.hp <= 0) { this.fallDown(from || (this.T && this.T.pos) || G.player.pos, head); this.arena.unitDown(this); return; }
    blowLands(this.a, "hit"); this.a.person.flinch && this.a.person.flinch();
    AUDIO.voice && AUDIO.voice(Math.random() < 0.7 ? "pain" : "grunt", { at: this.pos, high: isF(this.info.look) });
    if (!(this.wind > 0)) { this.stun = melee ? 0.25 : 0.4; this.a.path = []; this.aimT = 0; }
    // (hurt at range, he doesn't stand there: he moves)
    if (!melee) { this.stepT = 0; this.hurtT = G.time; }
  }
  // can he see a man: nothing solid on the line from his eyes to the other's chest
  sees(T) {
    const w = this.arena.w, p = T.pos, a = this.pos;
    const ax = a.x, ay = a.y + 1.5, az = a.z, bx = p.x, by = p.y + 1.3, bz = p.z, d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
    for (let i = 2; i < n - 1; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < w.heightAt(x, z) + 0.2 || w.col.solidAt(x, y, z, 0)) return false;
    }
    return true;
  }
  // whom he's fighting: the man his officer named, or the nearest of the other side he can see (or just the nearest)
  pick() {
    const O = this.arena.orders && this.arena.orders[this.team], foes = this.arena.enemiesOf(this.team);
    if (O && O.target && O.target.alive && foes.includes(O.target)) return O.target;
    let best = null, bd = Infinity;
    for (const f of foes) { const d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z) * (f === this.T ? 0.8 : 1); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  tick(dt) {
    if (!this.alive || !this.awake || !this.arena.live || G.mode !== "play") return;
    const a = this.a, s = this.s, pl = G.player;
    // reloading goes on whatever he's doing, as yours does (each weapon its own time)
    const moving = a.path.length > 0;
    for (const k of ["long", "side"]) if (!this.loaded[k] && this.rl[k] > 0) { this.rl[k] -= dt * (moving ? 0.6 : 1) * (k === "long" && this.fixed ? 0.8 : 1); if (this.rl[k] <= 0) this.loaded[k] = true; }
    // (the gun in his hands, if it's being loaded: the drill, seen and heard)
    { const hk = this.heldK, slot = hk === "pistol" ? "side" : "long";
      if ((hk === "musket" || hk === "pistol") && !this.loaded[slot] && this.rl[slot] > 0) {
        const e = RELOAD[hk] - this.rl[slot], e0 = this.loadE ?? e; this.loadE = e;
        a.person.load = { kind: hk, e }; this.aimUp(false);
        for (const st of loadSteps(hk, e0, e)) FOLEY.load && FOLEY.load(st, a.pos, 0.6, hk === "pistol");
      } else { a.person.load = null; this.loadE = null; } }
    if ((this.pickT -= dt) <= 0 || !this.T || !this.T.alive) { this.pickT = 0.8 + Math.random() * 0.4; this.T = this.pick(); }
    const T = this.T;
    if (!T) { a.path = []; this.aimUp(false); return; }
    a.squareTo = T.isPlayer ? G.player : T.a;
    const fp = T.pos, d = Math.hypot(fp.x - a.pos.x, fp.z - a.pos.z);
    if ((this.losT -= dt) <= 0) { this.losT = 0.25 + Math.random() * 0.1; this.los = this.sees(T); }
    if (this.stun > 0) { this.stun -= dt; return; }
    const O = this.arena.orders && this.arena.orders[this.team];
    // his guard: to a side, or (the better he is) to the side you're on
    if ((this.guardT -= dt) <= 0) { this.guardT = 0.6 + Math.random() * (1.2 - s * 0.5); this.guardDir = T.isPlayer && Math.random() < 0.3 + s * 0.5 && pl.stance ? pl.stance : DIRS[Math.floor(Math.random() * 3)]; }
    this.stepT -= dt; this.cool -= dt;
    // a blow on its way: it lands, or it doesn't
    if (this.wind > 0) {
      a.path = []; a.faceTo(fp.x, fp.z);
      const was = this.wind; this.wind -= dt;
      if (was > 0.45 && this.wind <= 0.45 && T.isPlayer) glint(a);
      if (was > 0.62 && this.wind <= 0.62) a.person.setPose(blowPose(this.steel(), this.dir));
      if (this.wind <= 0) {
        setTimeout(() => this.alive && a.person.setPose("idle"), 500);
        AUDIO.whoosh && AUDIO.whoosh(0.45, this.lo.blade !== "sword");
        const B = BLADE[this.steel()];
        this.cool = (1.4 - s * 0.6) / B.rate * (0.85 + Math.random() * 0.3);
        if (d < B.reach - 0.3 && T.alive) {
          if (T.isPlayer) { if (strikeYou(a, this.dir, B.dmg, d, this.arena.tips ??= {}) === "parry") { this.stun = 1.0; this.cool = Math.max(this.cool, 1.3); a.person.flinch && a.person.flinch(); } }
          else { T.struck(B.dmg, this.dir, this); FOLEY.chop && FOLEY.chop(T.pos, 0.6); }
        }
      }
      return;
    }
    const longK = this.lo.long, haveLong = longK !== "none" && this.loaded.long && (longK === "musket" || this.ammo > 0), haveSide = this.loaded.side;
    // (you reloading, close by: his moment to come at you with steel)
    const youReloading = T.isPlayer && ((pl.gun && pl.gunReload > 0) || (pl.xbow && pl.xspan < 1)) && d < 14;
    const charge = (O && O.charge && !this.crewOf) || (youReloading && s > 0.3 && !haveLong);
    // close: the blade. (Farther, if nothing's loaded and he's coming on, or ordered in.)
    // (a gun's crew stay by their gun: only a man right on it brings them away from it)
    const melee = d < 4.2 || charge || (!haveLong && !(haveSide && d < RANGE.pistol) && d < (this.crewOf ? 5 : 10));
    if (melee) {
      a.person.crouching = false;
      if (this.mode !== "melee") {
        this.mode = "melee"; this.aimUp(false); this.hold(this.steel()); this.aimT = 0; a.person.setPose("guard"); this.releaseCover();
        // (the bayonet pushed into the muzzle as he comes on: a moment's work, and heard)
        if (this.steel() === "bayonet" && !this.fixed) { this.fixed = true; FOLEY.load && FOLEY.load("fixBayonet", a.pos, 0.6); this.cool = Math.max(this.cool, 0.9); }
      }
      const B = BLADE[this.steel()], reach = B.reach - 0.5, run = 3.2 + s * 1.4;
      if (d > reach + 0.5) { if (!a.path.length || this.stepT <= 0) { this.stepT = 0.35; a.approach(fp, reach - 0.2, run); } }
      else if (d < 1.0) { if (this.stepT <= 0) { this.stepT = 0.5; a.approach(fp, 1.5, 2.4); } }
      else if (this.cool <= 0) {
        a.path = [];
        this.wind = WIND * (1 - s * 0.3) * (T.isPlayer ? 1 : 0.7); this.dir = DIRS[Math.floor(Math.random() * 3)]; a.person.setPose("guard");
        if (Math.random() < 0.6) AUDIO.voice && AUDIO.voice(Math.random() < 0.5 ? "grunt" : "war", { at: a.pos, vol: 0.8, high: isF(this.info.look) });
      } else if (this.stepT <= 0) { this.stepT = 0.6 + Math.random() * 0.8; if (Math.random() < 0.7) a.circleAbout(fp, reach, 1.4 + s); else a.path = []; }
      return;
    }
    this.mode = "range"; if (!O) a.person.crouching = false;
    // at range: the long arm if it's loaded, the pistol if near enough
    const useK = haveLong ? longK : haveSide && d < RANGE.pistol + 6 ? "pistol" : null;
    const field = this.arena.field;
    // ---- in a company: his place in the formation, or cover, as he's ordered ----
    if (O) {
      const want = this.arena.slotFor(this);
      // (loading, or ordered down: behind the nearest thing that'll stop a ball, if there's one near his place)
      const wantCover = field && !this.crewOf && (O.cover || (!useK && s > 0.25)) ? (this.cover && this.cover.taken === this ? this.cover : field.coverNear(this.team, want.x, want.z, fp.x, fp.z, O.cover ? 14 : 8, this)) : null;
      if (wantCover !== this.cover) { this.releaseCover(); this.cover = wantCover; if (wantCover) wantCover.taken = this; }
      const goal = this.cover || want, gd = Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z);
      // (behind his cover and not firing: down low)
      a.person.crouching = !!(this.cover && gd < 1.2 && (!useK || !this.los));
      // (at the gun: working it — the loader sponging and ramming, the gunner with the powder and the priming — and
      //  watching where it's laid when it's loaded)
      if (this.crewOf && gd <= 1.4) {
        const g = this.crewOf; a.path = []; this.aimUp(false);
        if (!g.loaded) { a.faceTo(g.x - Math.sin(g.ry + g.yaw) * 1.4, g.z - Math.cos(g.ry + g.yaw) * 1.4); a.person.setPose(this.crewIdx ? "hammer" : "reach"); }
        else { a.faceTo(fp.x, fp.z); a.person.setPose("idle"); }
        return;
      }
      // the volley: every loaded piece brought up at the word, and fired together
      if (O.volleyAt && G.time < O.volleyAt + 0.4 && useK && useK !== "bow" && this.los) {
        a.path = []; a.faceTo(fp.x, fp.z); this.aimUp(true);
        if (G.time >= O.volleyAt + this.idx * 0.02 && this.volleyed !== O.volleyAt) { this.volleyed = O.volleyAt; this.fire(useK, T); }
        return;
      }
      if (gd > 1.4) {
        this.aimT = 0; this.aimUp(false); a.person.setPose("idle");
        if (!a.path.length || this.stepT <= 0) { this.stepT = 0.5; a.walkTo(goal.x, goal.z, gd > 6 || O.mode === "advance" ? 3.4 + s * 0.8 : 1.8); }
        return;
      }
      a.path = [];
      if (!useK || !O.fire || !this.los || d > RANGE[useK]) { this.aimT = 0; this.aimUp(false); a.faceTo(fp.x, fp.z); if (!useK && this.heldK !== longK && longK !== "none") this.hold(longK); return; }
      if (this.heldK !== useK) { this.hold(useK); this.aimT = -0.5; }
      a.faceTo(fp.x, fp.z); a.person.setPose(useK === "bow" ? "reach" : "idle"); this.aimUp(useK !== "bow");
      this.aimT += dt;
      if (this.aimT >= (useK === "musket" ? 1.6 : 1.2) * (1.3 - s * 0.6)) { this.fire(useK, T); this.aimT = 0; }
      return;
    }
    // ---- on his own (the duel): keep moving, use what cover there is, don't stand in your sights ----
    // (you aiming at him: a step aside, the better he is the sooner)
    if (T.isPlayer && (this.dodgeT -= dt) <= 0) {
      const aiming = (pl.gun && pl.gunAim > 0.6 && pl.gunLoaded) || (pl.bow && pl.draw > 0.5) || (pl.xbow && pl.xaim > 0.6 && pl.xspan >= 1);
      if (aiming) {
        const fw = pl.forward(), dx = a.pos.x - pl.pos.x, dz = a.pos.z - pl.pos.z, dd = Math.hypot(dx, dz) || 1;
        if ((dx * fw.x + dz * fw.z) / dd > 0.985 && Math.random() < 0.25 + s * 0.5) { this.dodgeT = 1.5 + Math.random(); this.aimT = Math.min(this.aimT, 0.2); a.circleAbout(fp, d, 3.6 + s); return; }
      }
      this.dodgeT = 0.3;
    }
    if (!useK) {
      // nothing loaded: the long arm in hand, loading — behind something if there's something near, else side to side
      if (this.heldK !== longK && longK !== "none") this.hold(longK);
      a.person.setPose("idle"); this.aimT = 0; this.aimUp(false);
      const cv = field && field.coverNear(this.team, a.pos.x, a.pos.z, fp.x, fp.z, 10, this);
      if (cv) { if (Math.hypot(cv.x - a.pos.x, cv.z - a.pos.z) > 0.8 && (!a.path.length || this.stepT <= 0)) { this.stepT = 0.6; a.walkTo(cv.x, cv.z, 3.4 + s); } else if (a.path.length === 0) a.faceTo(fp.x, fp.z); return; }
      if (this.stepT <= 0) { this.stepT = 1.2 + Math.random() * 1.2; a.circleAbout(fp, clamp(d, 12, 30), 2.4 + s); }
      return;
    }
    if (this.heldK !== useK) { this.hold(useK); this.aimT = -0.5; }
    const R = RANGE[useK];
    if (!this.los || d > R) {
      // in closer — not straight at you, but slanting this way and that — or round to where he can see you
      this.aimT = 0; a.person.setPose("idle"); this.aimUp(false);
      if (!a.path.length || this.stepT <= 0) { this.stepT = 0.9; if (!this.los && d < R) a.circleAbout(fp, Math.max(6, d - 3), 3 + s); else { const ang = Math.atan2(a.pos.x - fp.x, a.pos.z - fp.z) + (Math.random() - 0.5) * 0.9, rr = Math.max(R * 0.7, d - 7); a.walkTo(fp.x + Math.sin(ang) * rr, fp.z + Math.cos(ang) * rr, 3.2 + s); } }
      return;
    }
    // aimed: he stands, brings it up, takes his time (less, the better he is), and fires
    a.path = []; a.faceTo(fp.x, fp.z); a.person.setPose(useK === "bow" ? "reach" : "idle"); this.aimUp(useK !== "bow");
    this.aimT += dt;
    const aimFor = (useK === "musket" ? 1.5 : useK === "bow" ? 1.2 : 1.1) * (1.25 - s * 0.6);
    if (this.aimT >= aimFor) { this.fire(useK, T); this.aimT = 0; this.stepT = 0.4; }
  }
  releaseCover() { if (this.cover && this.cover.taken === this) this.cover.taken = null; this.cover = null; }
  fire(k, T) {
    const a = this.a, s = this.s, slot = k === "pistol" ? "side" : "long";
    this.loaded[slot] = false; this.rl[slot] = RELOAD[k];
    const from = this.muzzle(), tp = T.pos, tv = T.isPlayer ? G.player.vel : new THREE.Vector3(Math.sin(T.yaw) * (T.a.speed || 0), 0, Math.cos(T.yaw) * (T.a.speed || 0));
    const low = T.isPlayer && G.player.crouched;
    const atYou = T.isPlayer ? (pw, head) => { this.arena.hurtMe(dmgOf(pw, head), a); if (head) UI.hint("In the head.", 1.2); } : null;
    if (k === "bow" || k === "crossbow") {
      this.ammo--;
      // the arrow loosed, as a man would: up a little for the drop, ahead of him if he's running
      const power = k === "bow" ? 0.95 : 1.75, v = 14 + 32 * power;
      const to = new THREE.Vector3(tp.x, tp.y + (low ? 0.95 : 1.25), tp.z), flight = from.distanceTo(to) / v;
      if (tv) to.addScaledVector(new THREE.Vector3(tv.x, 0, tv.z), flight * (0.4 + s * 0.6));
      to.y += 4.9 * flight * flight;
      const dir = to.sub(from).normalize(), wob = 0.075 - s * 0.06;
      dir.x += (Math.random() - 0.5) * wob; dir.y += (Math.random() - 0.5) * wob * 0.6; dir.z += (Math.random() - 0.5) * wob; dir.normalize();
      from.addScaledVector(dir, 0.3);
      this.arena.hunt.loose(from, dir, power, k === "crossbow", this, atYou);
      if (this.arena.hearable(a.pos)) AUDIO.twang && AUDIO.twang(k === "crossbow" ? 1.2 : 0.8);
      return;
    }
    // a ball: aimed at the middle of him, a little ahead if he's moving (the better the shot, the better he leads),
    // and off by a smoothbore's scatter and his own unsteadiness — then it flies, and hits whatever's in its way
    const pis = k === "pistol", sp = pis ? 260 : 420;
    const to = new THREE.Vector3(tp.x, tp.y + (low ? 0.95 : 1.25), tp.z), flight = from.distanceTo(to) / sp;
    if (tv) to.addScaledVector(new THREE.Vector3(tv.x, 0, tv.z), flight * (0.3 + s * 0.7));
    to.y += 4.9 * flight * flight;
    const sigma = ((pis ? 0.016 : 0.0075) + (1 - s) * (pis ? 0.03 : 0.014)) * (!pis && this.fixed ? 1.4 : 1);
    const dir = to.sub(from).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x).normalize(), up = new THREE.Vector3().crossVectors(side, dir);
    dir.addScaledVector(side, randn() * sigma).addScaledVector(up, randn() * sigma).normalize();
    AUDIO.gunshot && AUDIO.gunshot(pis ? 0.75 : 0.95, a.pos);
    G.gunSmoke && G.gunSmoke(from, dir, pis ? 0.6 : 1);
    this.arena.hunt.fireBall(from.clone().addScaledVector(dir, 0.4), dir, { speed: sp, power: pis ? 1.9 : 2.6, range: pis ? 60 : 160, npc: this, atYou });
  }
}

// ---------------------------------------------------------------------------
//  another player: moved and shown as their game tells it; struck and shot as they are on your screen
// ---------------------------------------------------------------------------
class NetFoe extends Fighter {
  constructor(arena, info) { super(arena, info); this.tx = this.a.pos.x; this.tz = this.a.pos.z; this.tyaw = 0; }
  reset(at, face) { this.hp = HP; this.isDown = false; this.standUp(); this.a.place(at.x, at.z, Math.atan2(face.x - at.x, face.z - at.z)); this.tx = at.x; this.tz = at.z; this.tyaw = this.a.yaw; this.wind = 0; this.hold(this.info.lo ? this.info.lo.long : "musket"); }
  go() {}
  state(m) {
    this.tx = +m.x; this.tz = +m.z; this.tyaw = Math.PI + (+m.yaw || 0); this.spd = +m.s || 0;
    if (m.h !== undefined) this.hold(m.h || null);
    if (this.wind <= 0) this.a.person.setPose(m.dn ? "idle" : m.aim && m.h === "bow" ? "reach" : m.g ? "guard" : "idle");
    this.aimUp(!!m.aim && m.h !== "bow");
    // (loading: the drill as their game has it, and its sounds from where they stand)
    if (m.ld > 0 && (m.h === "musket" || m.h === "pistol")) { const e0 = this.loadE ?? +m.ld; this.loadE = +m.ld; this.a.person.load = { kind: m.h, e: +m.ld }; for (const st of loadSteps(m.h, e0, +m.ld)) FOLEY.load && FOLEY.load(st, this.a.pos, 0.6, m.h === "pistol"); }
    else { this.a.person.load = null; this.loadE = null; }
    this.guardDir = m.g ? "right" : null;
    if (m.dn && !this.isDown) { this.isDown = true; this.fallDown(G.player.pos); }
    if (!m.dn && this.isDown) { this.isDown = false; this.standUp(); }
  }
  windUp(dir) { this.wind = 0.35; this.dir = dir === "left" ? "right" : dir === "right" ? "left" : "up"; this.a.person.setPose(blowPose(this.heldK, dir)); glint(this.a); setTimeout(() => { this.wind = 0; this.a.person.setPose("idle"); }, 450); }
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
      // (the ball, seen flying and heard going by: what it hit, their game says)
      this.arena.hunt.fireBall(f.clone().addScaledVector(d, 0.6), d, { speed: m.k === "pistol" ? 260 : 420, npc: this, ghost: true });
    } else {
      this.arena.hunt.loose(f, d, clamp(+m.p || 1, 0.1, 2), m.k === "crossbow", this.a, () => {});
      AUDIO.twang && AUDIO.twang(m.k === "crossbow" ? 1.2 : 0.8);
    }
  }
  tick(dt) {
    if (this.rag) return;
    const a = this.a, k = Math.min(1, dt * 10);
    a.pos.x += (this.tx - a.pos.x) * k; a.pos.z += (this.tz - a.pos.z) * k;
    let dy = this.tyaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * k; a.targetYaw = a.yaw;
    a.speed = this.spd || 0; a.path = [];
    a.sync();
  }
}
