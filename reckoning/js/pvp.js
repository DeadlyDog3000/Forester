// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE DUEL. From the title: a loadout — a long arm, a sidearm and a blade — and then a fight, one against one, in a
// deer ride in the woods. Another player if anyone else is looking for a fight on a server you know; if not, a bot
// as strong as you are (by your record: the better you do, the better it gets). Best of three rounds. Everything is
// the story's own fighting: the musket that wants loading, the bow drawn, the crossbow spanned, the guard to the side
// the blow is coming from and the parry just as it comes.

import { THREE, camera, makeFlame } from "./core.js";
const CHAR = new THREE.Color(0x17110c);
import { G, Actor, setWorld, setAtmo, input } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { FOLEY } from "./foley.js";
import { pool, sever, heal, clearGore } from "./gore.js";
import { full, gate } from "./licence.js";
import { Woods, HUNT } from "./woods.js";
import { Hunt } from "./hunt.js";
import { WIND, strikeYou, blowLands, glint, stanceTick, slowMo, burst, killMark, chestOf } from "./fight.js";
import { makeArm, modelCopy, shoulderArm, addBayonet, pikeHold, bowHold, makeHorse, mergeRig, makeLadder } from "./models.js";
import { resetForMode } from "./story.js";
import { loadSteps } from "./reload.js";
import { ragdoll, dropThing, clearDropped } from "./ragdoll.js";
import { Net, addressOf, HOST, globalServer } from "./mp/net.js";
import { Wilds } from "./mp/wilds.js";
import { WATER } from "./mp/terrain.js";
import { EARTH_SIZES } from "./mp/rules.js";
import { REALMS_1683 } from "./mp/earth-1683.js";
import { BATTLES, battleById, histArmy, histRecord, histResult } from "./history.js";
import { SHIPS, navalBattle, enemyOfName } from "./naval.js";
import { shapeField, buildThings } from "./histmap.js";
import { initCampaign, openCampaign, openMpCampaign } from "./campaign.js";
import { lookOpts, randomLook, isF } from "./mp/look.js";
import { UNIFORMS, soldierLook, inUniform, Field, Orders, OrderBook, FORMATIONS } from "./battle.js";
import { wayOfUniform, plateOf } from "./unitart.js";
import { Recorder, Theatre, FILM, Smooth, ease, groundY, upload, keepMine, shareOn, setShare, ambientOn, setAmbient, stopTheatre, titleOf, theatre, listReplays, fetchReplay, mineList, ago, mmss } from "./replay.js";
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
  warclub: { name: "War club", icon: "battleaxe", w: 2, dmg: 22, rate: 1.1, reach: 2.2, stats: [["Blow", "22"], ["Pace", "quick"], ["Reach", "2.2 m"]], note: "The ball-headed club of the woods' nations: light, quick, and it breaks a skull." },
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
const RANGE = { musket: 100, pistol: 12, bow: 38, crossbow: 45 };   // (a musket's reach: the two lines as they first stand, and a little more)
const HP = 100, ROUNDS_TO_WIN = 2, ROUND_SECS = 150;

// what a shot or an arrow does to a man (by its power, as the hunt tells it): a musket ball, a pistol's, a bolt, an
// arrow by how hard it was drawn — and to the head, more than half as much again (a musket ball there, the end of it)
export function dmgOf(power, head) {
  const d = power >= 2.5 ? 64 : power >= 1.85 ? 32 : power >= 1.7 ? 52 : 12 + power * 30;
  return Math.round(d * (head ? 1.6 : 1));
}

// ---- your loadout and your record, kept on this computer ----
// (the record's second season: every rating begun again at 1000 in 1.37, and from then only battles and duels against
//  other players move it — the first season's kept under its old name, untouched)
const LO_KEY = "reckoning.pvp.loadout", REC_KEY = "reckoning.pvp.record.2", OLD_REC = "reckoning.pvp.record", BOT_KEY = "reckoning.pvp.bots";
export const SEASON = 2;
export function loadout() {
  let l = null; try { l = JSON.parse(localStorage.getItem(LO_KEY)); } catch (e) {}
  l = l || {};
  return fitLoad({ long: LONG[l.long] ? l.long : "musket", side: SIDE[l.side] ? l.side : "none", blade: BLADE[l.blade] ? l.blade : "dagger" }, "long");
}
function saveLoadout(l) { try { localStorage.setItem(LO_KEY, JSON.stringify(l)); } catch (e) {} }
// (and whether you ride into a battle: a trooper's horse under you, paid for from the purse as a trooper's is)
const RIDE_KEY = "reckoning.pvp.ride", RIDE_COST = 150;
export const riding = () => { try { return localStorage.getItem(RIDE_KEY) === "1"; } catch (e) { return false; } };
const setRiding = on => { try { localStorage.setItem(RIDE_KEY, on ? "1" : "0"); } catch (e) {} };
export function record() {
  let r = null; try { r = JSON.parse(localStorage.getItem(REC_KEY)); } catch (e) {}
  return { rating: 1000, w: 0, l: 0, streak: 0, ...(r || {}) };
}
function saveRecord(r) { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {} }
// how you do against bots: not a rating anyone sees — only how sharp their officers and their men are against you (begun
// from your old rating, so nobody who'd earned sharp ones is handed easy ones again)
export function botRecord() {
  let r = null; try { r = JSON.parse(localStorage.getItem(BOT_KEY)); } catch (e) {}
  if (!r) { let o = null; try { o = JSON.parse(localStorage.getItem(OLD_REC)); } catch (e) {} r = o ? { rating: o.rating || 1000, w: o.w || 0, l: o.l || 0 } : null; }
  return { rating: 1000, w: 0, l: 0, ...(r || {}) };
}
function saveBotRecord(r) { try { localStorage.setItem(BOT_KEY, JSON.stringify(r)); } catch (e) {} }
// the other side's officer, as your record has earned you: your first battles against an easy one, to learn the
// field on; then sharper as you win — by a rating of 1300, as sharp as any; and easier again if you lose
export function generalship() {
  const r = botRecord(), fought = (r.w || 0) + (r.l || 0);
  const g = clamp(0.2 + (r.rating - 1000) / 400, 0.15, 1);
  return fought < 3 ? Math.min(g, 0.25) : g;
}
// how good a bot is, from a rating: a beginner's bot misses and is slow to the guard; a strong player's is neither
const skillOf = rating => clamp((rating - 550) / 1000, 0.12, 0.95);
const rankOf = r => r < 900 ? "Recruit" : r < 1050 ? "Musketeer" : r < 1200 ? "Corporal" : r < 1350 ? "Sergeant" : r < 1550 ? "Lieutenant" : "Captain";

// ---------------------------------------------------------------------------
//  the menus: the loadout, the search, the result
// ---------------------------------------------------------------------------
let ctx = null, lo = loadout(), search = null;
export function initPvp(c) {
  ctx = c;
  $("btnPvp").onclick = () => gate("online") && openCamp();
  $("pvpBack").onclick = () => { leaveCamp(); ctx.screen("title"); };
  $("pvpQuick").onclick = () => gate("online") && quickPlay();
  $("pvpBots").onclick = () => openMuster("bots");
  $("pvpDuel").onclick = () => openMuster("duel");
  $("pvpHist").onclick = () => openMuster("hist");
  $("pvpCampaign").onclick = () => openCampaign(true);
  // (a campaign's battle fought by hand: its field and its armies, as the campaign gives them)
  initCampaign(ctx, b => { lastMode = "campaign"; must = null; stopAmbient(); startDuel({ bot: true, army: histArmy(b, 0) }); }, fieldWithPlayer);
  $("pvpCancel").onclick = () => cancelSearch();
  $("pvpBotNow").onclick = () => botNow();
  $("pvpAgain").onclick = () => again();
  $("pvpLoadout").onclick = () => openCamp();
  $("pvpTitle").onclick = () => ctx.screen("title");
  $("musBack").onclick = () => leaveMuster();
  $("musReady").onclick = () => musterReady();
  $("musArmy").addEventListener("click", armyClick);
  $("musMe").addEventListener("click", e => {
    const r = e.target.closest("[data-ride]"); if (r && !(must && must.mine)) { setRiding(!riding()); setArmy({}); drawMe(); drawArmy(); window.__uisfx && window.__uisfx.click && window.__uisfx.click(); return; }
    const b = e.target.closest("[data-slot][data-id]"); if (!b || (must && must.mine)) return;
    const was = { ...lo }; lo[b.dataset.slot] = b.dataset.id; lo = fitLoad(lo, b.dataset.slot); saveLoadout(lo);
    const put = ["long", "side", "blade"].filter(k => k !== b.dataset.slot && lo[k] !== was[k]).map(k => ({ long: LONG, side: SIDE, blade: BLADE }[k][was[k]].name.toLowerCase()));
    drawMe(put.length ? `Too heavy to carry it all: you put down the ${put.join(" and the ")}.` : "");
    window.__uisfx && window.__uisfx.click && window.__uisfx.click();
  });
  for (const b of document.querySelectorAll(".camp-tabs [data-tab]")) b.onclick = () => {
    for (const x of document.querySelectorAll(".camp-tabs [data-tab]")) x.classList.toggle("on", x === b);
    $("campPaneCamp").classList.toggle("hidden", b.dataset.tab !== "camp"); $("campPaneBoard").classList.toggle("hidden", b.dataset.tab !== "board"); $("campPaneHl").classList.toggle("hidden", b.dataset.tab !== "hl");
    if (b.dataset.tab === "hl") drawHl();
  };
  // the battles to watch: anyone's lately, your own, a commander's best or latest
  $("campHl").addEventListener("click", e => pickReplay(e));
  $("campBoard").addEventListener("click", e => pickReplay(e));
  // (the settings for them)
  const sh = $("setShareReplays"), am = $("setAmbientReplays");
  void sh;   // (no sharing by default any more: a box on each battle's result instead)
  if (am) { am.checked = ambientOn(); am.onchange = () => { setAmbient(am.checked); if (!am.checked) stopAmbient(); } };
  // (behind the To Arms menus, while one of them is up: the battles lately fought; gone the moment anything else is)
  G.onScreen = id => { if (id === "pvp" || id === "pvpFind") setTimeout(() => startAmbient(), 700); else if (id !== null || !theatre() || theatre().mode === "ambient") stopAmbient(); };
  $("campSay").addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key !== "Enter") return;
    const t = $("campSay").value.trim(); if (!t || !camp || !camp.net) return;
    camp.net.send({ t: "say", text: t }); $("campSay").value = "";
  });
  $("campWho").addEventListener("click", e => { const b = e.target.closest("[data-ch]"); if (!b || !camp || !camp.net) return; if (!gate("online")) return; camp.net.send({ t: "challenge", to: b.dataset.ch, mode: b.dataset.mode }); campNote(`Challenge sent to ${b.dataset.name} — waiting for an answer…`); });
  $("campCard").addEventListener("click", e => {
    const b = e.target.closest("[data-ans]"); if (!b || !camp || !camp.net || !camp.challenge) return;
    if (b.dataset.ans === "yes" && !gate("online")) return;
    camp.net.send({ t: "answer", yes: b.dataset.ans === "yes" }); camp.challenge = null; drawCard();
  });
}
export const PVP_SCREENS = ["pvp", "pvpFind", "pvpEnd", "pvpMuster", "campaign"];

// ---------------------------------------------------------------------------
//  the camp: To Arms' home — Quick Play, and everyone else here: who, what they're about, the talk, the best of them
// ---------------------------------------------------------------------------
let camp = null, lastMode = "quick";
const mine = () => { const r = record(); return { rating: Math.round(r.rating), rank: rankOf(r.rating), w: r.w, l: r.l, season: SEASON }; };
function openCamp() {
  lo = loadout(); ctx.screen("pvp");
  const r = record(), me = ctx.identity();
  $("pvpRec").innerHTML = `<span class="pv-rank">${rankOf(r.rating)}</span> · rating <b>${Math.round(r.rating)}</b> · ${r.w} won, ${r.l} lost${r.streak > 1 ? ` · ${r.streak} in a row` : ""}<br><small>You fight as ${esc(me.name)}.</small>`;
  drawWho(); drawTalk(); drawBoard(); drawCard();
  connectCamp();
}
function leaveCamp() { if (camp && camp.net) { camp.net.send({ t: "uncamp" }); } }
async function connectCamp() {
  if (camp && camp.net && camp.net.open) { camp.net.send({ t: "camp", status: "camp", ...mine() }); return; }
  if (camp && camp.connecting) return;
  const g = globalServer(), addr = g && addressOf(g);
  camp = { net: null, list: camp ? camp.list : [], talk: camp ? camp.talk : [], board: camp ? camp.board : [], connecting: true };
  if (!addr) { camp.connecting = false; campNote("No camp to join here — Quick Play looks for players on your own network."); return; }
  campNote("Coming into the camp…");
  const me = ctx.identity(), n = new Net(addr);
  try { await n.connect(me.name, me.look); } catch (e) { camp.connecting = false; campNote("The camp can't be reached just now. Quick Play looks on your own network meanwhile."); return; }
  camp.net = n; camp.connecting = false; campNote("");
  n.on.campers = m => { camp.list = m.list || []; if (m.board) camp.board = m.board; drawWho(); drawBoard(); };
  n.on.said = m => { if (m.list) camp.talk = m.list; else if (m.msg) camp.talk.push(m.msg); camp.talk = camp.talk.slice(-80); drawTalk(); };
  n.on.board = m => { camp.board = m.list || []; drawBoard(); };
  n.on.challenged = m => { camp.challenge = m; drawCard(); window.__uisfx && window.__uisfx.click && window.__uisfx.click(); };
  n.on.declined = m => campNote(m.why === "busy" ? `${m.name || "They"} can't just now.` : m.why === "gone" ? "They've gone." : `${m.name} declined.`);
  n.on.duel = m => matched(n, m);
  n.on.lost = () => { if (camp && camp.net === n) { camp.net = null; campNote("Lost the camp — coming back in…"); setTimeout(() => { if (!G.arena && !must) connectCamp(); }, 3000); } };
  n.send({ t: "camp", status: "camp", ...mine() });
}
function campNote(t) { const el = $("campState"); if (el) el.textContent = t; }
const STATUS = { camp: "in camp", looking: "looking for a battle", mustering: "mustering", battle: "in battle", duel: "in a duel", campaign: "on campaign" };
function drawWho() {
  const el = $("campWho"); if (!el || !camp) return;
  const me = camp.net && camp.net.pid, list = camp.list || [];
  $("campN").textContent = list.length ? `· ${list.length}` : "";
  el.innerHTML = list.length ? list.map(p => `<div class="cw${p.pid === me ? " me" : ""}"><span class="cw-n"><b>${esc(p.name)}</b>${p.pid === me ? " <i>(you)</i>" : ""}<small>${esc(p.rank || "")} · ${p.rating}</small></span><span class="cw-s s-${p.status}">${STATUS[p.status] || ""}</span>${p.pid !== me && (p.status === "camp" || p.status === "looking") ? `<span class="cw-ch"><button data-ch="${esc(p.pid)}" data-mode="battle" data-name="${esc(p.name)}">Battle</button><button data-ch="${esc(p.pid)}" data-mode="duel" data-name="${esc(p.name)}">Duel</button><button data-ch="${esc(p.pid)}" data-mode="campaign" data-name="${esc(p.name)}" title="A campaign across Europe together: each a crown, the seasons in step">Campaign</button></span>` : ""}</div>`).join("") : `<div class="cw-empty">Nobody else in camp just now.</div>`;
}
function drawTalk() {
  const el = $("campLines"); if (!el || !camp) return;
  const near = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = camp.talk.length ? camp.talk.map(m => m.sys ? `<div class="ct sys">${esc(m.text)}</div>` : `<div class="ct"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join("") : `<div class="ct sys">The camp is quiet.</div>`;
  if (near) el.scrollTop = el.scrollHeight;
}
function drawBoard() {
  const el = $("campBoard"); if (!el || !camp) return;
  const b = camp.board || [];
  el.innerHTML = b.length ? `<table><tr><th></th><th>Commander</th><th>Rank</th><th>Rating</th><th>Won–lost</th><th>Battles</th></tr>${b.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.rank || "")}</td><td>${p.rating}</td><td>${p.w}–${p.l}</td><td class="cb-hl">${p.pid && p.reps ? `<button data-pid="${esc(p.pid)}" data-sort="best" title="${esc(p.name)}'s best battle">Best</button><button data-pid="${esc(p.pid)}" data-sort="recent" title="${esc(p.name)}'s latest battle">Latest</button>` : ""}</td></tr>`).join("")}</table>` : `<div class="cw-empty">No one has fought yet. Be the first.</div>`;
}
// the highlights tab: the battles lately fought (from the server), and your own (kept here)
let hlList = [], hlMine = [];
async function drawHl() {
  const el = $("campHl"); if (!el) return;
  const row = (r, src) => { const t = titleOf(r), m = r.meta || r; return `<div class="hl-row"><span class="hl-n"><b>${esc(t.t)}</b><small>${esc(t.s)} · ${m.won ? "won" : "lost"}${m.k != null ? ` · ${m.k}–${m.l}` : ""} · ${mmss(m.secs || 0)} · ${ago(r.at || m.at)}</small></span><span class="hl-b"><button data-src="${src}" data-id="${esc(r.id || r.key)}" data-mode="full">Watch</button></span></div>`; };
  const draw = () => { el.innerHTML = `<div class="pv-h">Lately, on the server</div>${hlList.length ? hlList.map(r => row(r, "srv")).join("") : `<div class="cw-empty">${hlList.loading ? "Looking…" : "No battles on the server yet — or it can't be reached."}</div>`}<div class="pv-h">Your own</div>${hlMine.length ? hlMine.map(r => row(r, "mine")).join("") : `<div class="cw-empty">Your battles are kept here once you've fought one.</div>`}`; };
  hlList.loading = true; draw();
  const [a, b] = await Promise.all([listReplays({ sort: "recent", n: 15 }), mineList()]);
  hlList = a; hlMine = b; draw();
}
async function pickReplay(e) {
  const b = e.target.closest("button[data-id],button[data-pid]"); if (!b) return;
  window.__uisfx && window.__uisfx.click && window.__uisfx.click();
  let rec = null;
  if (b.dataset.pid) { const l = await listReplays({ pid: b.dataset.pid, sort: b.dataset.sort, n: 1 }); if (l[0]) rec = await fetchReplay(l[0].id); }
  else if (b.dataset.src === "mine") rec = hlMine.find(r => r.key === b.dataset.id) || null;
  else rec = await fetchReplay(b.dataset.id);
  if (!rec) { campNote("That battle couldn't be fetched just now."); return; }
  watch(rec, "full", "camp");
}
// ---- behind the menus: the battles lately fought, their highlights one after another, quiet and far off ----
let amb = null, fieldWait = false;
async function startAmbient() {
  return;   // (no highlight reels behind the menus any more: the menus stand on their own)
  const on = id => !$(id).classList.contains("hidden");
  if (amb || !ambientOn() || G.arena || fieldWait || (theatre() && theatre().mode !== "ambient") || innerWidth < 1100 || innerHeight < 640 || !(on("pvp") || on("pvpFind"))) return;
  const A = amb = { i: -1, list: [] };
  const server = await listReplays({ sort: "recent", n: 12 });
  // (a battle begun while the list was fetched — or one being waited for: no reel, it would take the field from it)
  if (G.arena || fieldWait) { if (amb === A) amb = null; return; }
  A.list = server.length ? server.map(r => ({ id: r.id })) : (await mineList()).slice(0, 6).map(r => ({ rec: r }));
  if (amb !== A || !A.list.length) { if (amb === A) amb = null; return; }
  const next = async () => {
    if (amb !== A || G.arena || fieldWait) { if (amb === A) amb = null; return; }
    for (let tries = 0; tries < A.list.length; tries++) {
      A.i = (A.i + 1) % A.list.length;
      const it = A.list[A.i], rec = it.rec || await fetchReplay(it.id);
      if (amb !== A || G.arena || fieldWait) { if (amb === A) amb = null; return; }
      if (!rec || !(rec.hl && rec.hl.length)) continue;
      const th = new Theatre(rec, { mode: "ambient", onEnd: () => setTimeout(next, 600) });
      th.onWatch = r => watch(r, "highlights", "camp");
      $("menus").classList.remove("backdrop"); $("menus").classList.add("ambient");
      return;
    }
    if (amb === A) amb = null;
  };
  next();
}
function stopAmbient() {
  const was = !!amb; amb = null;
  const th = theatre(); if (th && th.mode === "ambient") th.stop(true);
  if (was || $("menus").classList.contains("ambient")) { $("menus").classList.remove("ambient"); if (!$("menus").classList.contains("hidden")) $("menus").classList.add("backdrop"); }
}
function drawCard() {
  const el = $("campCard"); if (!el) return;
  const c = camp && camp.challenge;
  el.innerHTML = c ? `<div class="cc"><b>${esc(c.name)}</b> ${c.mode === "campaign" ? "asks you to campaign with them — a crown each, across Europe" : `challenges you to ${c.mode === "duel" ? "a duel" : "a battle"}`}.<span><button class="btn" data-ans="no">Decline</button><button class="btn primary" data-ans="yes">Accept</button></span></div>` : "";
}
// paired — by Quick Play or a challenge: a battle goes to the muster; a duel straight to the ride
function matched(n, m) {
  if (camp && camp.net === n) camp.net = null;
  for (const k of ["campers", "said", "board", "challenged", "declined", "duel"]) n.on[k] = null;
  if (search) { search.done = true; search = null; }
  if (m.campaign) { lastMode = "campaign"; openMpCampaign(n, m.side, m.foe); return; }
  if (m.battle) openMuster("mp", { net: n, side: m.side, foe: m.foe });
  else startDuel({ net: n, side: m.side, foe: m.foe });
}
function quickPlay() {
  lastMode = "quick";
  setArmy({ battle: true, vs: "player" });
  findMatch();
}
// (a battle of the story's — Part Three's: its own field and armies, fought once, its outcome told to the story and
//  the way back to it from the result)
let storyNext = null;
export function storyBattle(b, next) { lastMode = "story"; must = null; storyNext = next; stopAmbient(); startDuel({ bot: true, army: histArmy(b, 0) }); }
function again() { if (lastMode === "story") { const f = storyNext; storyNext = null; lastMode = null; if (f) f(); return; } if (lastMode === "campaign") openCampaign(); else if (lastMode === "hist") openMuster("hist"); else if (lastMode === "bots") openMuster("bots"); else if (lastMode === "duel") openMuster("duel"); else { openCamp(); quickPlay(); } }

// ---------------------------------------------------------------------------
//  the muster: your arms, and your company from the purse — then Ready. (Against a player, both must be.)
// ---------------------------------------------------------------------------
let must = null;
function openMuster(kind, link = null) {
  lo = loadout();
  if (kind === "bots") setArmy({ battle: true, vs: "bots" });
  else if (kind === "mp") setArmy({ battle: true, vs: "player" });
  else if (kind === "hist") { /* (its armies are history's: nothing of yours to set) */ }
  else setArmy({ battle: false, allies: 0, enemies: 1 });
  must = { kind, ...(link || {}), mine: false, theirs: null, t0: performance.now() };
  if (kind !== "mp" && camp && camp.net) camp.net.send({ t: "camp", status: "camp", ...mine() });
  if (kind === "mp") {
    const n = must.net, M = must;
    n.on.bmust = m => { if (must !== M) return; M.theirs = m; drawVs(); maybeStart(); };
    // (the size of battle: the host's to choose, and the other player's muster made to fit it as it changes — if
    //  they'd already said they were ready, their company as it now stands sent again)
    if (M.side === 0) { n.on.bpurseq = () => { if (must === M) n.send({ t: "bpurse", v: prefPurse(army()) }); }; n.send({ t: "bpurse", v: prefPurse(army()) }); }
    else {
      n.on.bpurse = m => {
        if (must !== M || !PURSES[m.v]) return; const was = M.theirPurse; M.theirPurse = +m.v; setArmy({}); drawArmy();
        if (M.mine) { const A = army(); n.send({ t: "bmust", army: { muster: A.muster, guns: A.guns, uniform: A.uniform, allies: menOf(A), ride: riding() ? 1 : 0 }, lo }); }
      };
      n.send({ t: "bpurseq" });
    }
    n.on.bunmust = () => { if (must !== M) return; M.theirs = null; drawVs(); };
    const gone = why => { if (must !== M || G.arena) return; clearInterval(M.clock); must = null; openCamp(); campNote(why); };
    n.on.dend = () => gone(`${M.foe.name || "They"} left the muster.`);
    // (the connection itself gone — the server restarting, or the line dropping — is not them leaving: said so, and
    //  you're back in camp, which finds the server again by itself)
    n.on.lost = () => gone("The connection to the server dropped while you mustered — you're back in camp. Challenge them again when you see them.");
    // (two minutes to muster, then ready as you stand)
    clearInterval(M.clock); M.clock = setInterval(() => { if (must !== M) return clearInterval(M.clock); drawVs(); if (!M.mine && performance.now() - M.t0 > 120000) musterReady(); }, 1000);
  }
  ctx.screen("pvpMuster");
  drawMuster();
}
function leaveMuster() {
  const M = must; must = null;
  if (M && M.kind === "mp" && M.net) { clearInterval(M.clock); M.net.send({ t: "dleave" }); M.net.close(); }
  openCamp();
}
function drawMuster() {
  if (!must) return;
  const k = must.kind;
  $("musT").textContent = k === "hist" ? "Historical battles" : k === "duel" ? "Your arms" : k === "bots" ? "Muster — against bots" : "Muster your company";
  drawMe(); drawArmy(); drawVs();
}
function drawVs() {
  if (!must) return;
  const k = must.kind, el = $("musVs"), btn = $("musReady");
  if (k === "duel") { el.innerHTML = `<span class="mv-n">One against one, best of three — another player if anyone's looking, or a bot as strong as you are.</span>`; btn.textContent = "Find a match"; return; }
  if (k === "hist") { const P = histPick(), b = battleById(P.id); el.innerHTML = `<span class="mv-n"><b>${esc(b.name)}</b>, ${esc(b.date)} — for ${esc(b.sides[P.side].name.replace(/^The /, "the "))}. Against bots; it doesn't touch your rating.</span>`; btn.textContent = b.sea ? "Make sail" : "To the field"; return; }
  if (k === "bots") { const A = army(); el.innerHTML = `<span class="mv-n">${isCustom(A) ? `${sidesWord(A.sides)} — every other company's officer raises it from the same purse, and spends it his own way.` : "Their officer raises his company from the same purse, and spends it his own way."}</span>`; btn.textContent = "To the field"; return; }
  const left = Math.max(0, 120 - Math.floor((performance.now() - must.t0) / 1000));
  el.innerHTML = `<span class="mv-n">Against <b>${esc(must.foe.name || "another commander")}</b>${must.foe.rating ? ` · ${rankOf(must.foe.rating)}` : ""}</span>
    <span class="mv-s ${must.theirs ? "ok" : ""}">${must.theirs ? "Ready" : "Mustering…"}</span><span class="mv-s ${must.mine ? "ok" : ""}">You: ${must.mine ? "Ready" : "mustering"}</span>
    ${must.mine && must.theirs ? `<span class="mv-n">Both ready — the field is being chosen…</span>` : !must.mine ? `<span class="mv-t">${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</span>` : ""}`;
  btn.textContent = must.mine ? (must.theirs ? "Taking the field…" : "Not ready yet") : "Ready";
  btn.disabled = !!(must.mine && must.theirs);
  $("pvpMuster").classList.toggle("ready", !!must.mine);
}
// your own arms: three rows of choices, one of each
function drawMe(note = "") {
  const I = ctx.ICON, heavy = (slot, id) => weightOf({ ...lo, [slot]: id }) > LOAD_MAX;
  const chip = (slot, id, o) => `<button class="mc${lo[slot] === id ? " on" : ""}${heavy(slot, id) ? " heavy" : ""}" data-slot="${slot}" data-id="${id}" title="${esc(o.stats.map(([a, b]) => a + " " + b).join(" · ") + " — " + o.note)}">${o.icon && I[o.icon] ? `<img src="${I[o.icon]}" alt="">` : `<span class="mc-none"></span>`}<span>${esc(o.name)}</span></button>`;
  const row = (slot, title, list) => `<div class="mr"><div class="pv-h">${title}</div><div class="mcs">${Object.entries(list).filter(([, o]) => !o.hidden).map(([id, o]) => chip(slot, id, o)).join("")}</div></div>`;
  const w = weightOf(lo), sp = Math.round((loadMul(lo) - 1) * 100), pick = { long: LONG[lo.long], side: SIDE[lo.side], blade: BLADE[lo.blade] };
  { const sea = !!(must && must.kind === "hist" && battleById(histPick().id).sea); $("musMe").classList.toggle("hidden", sea); $("musMe").parentElement.classList.toggle("solo", sea); }
  $("musMe").innerHTML = `<div class="pv-h big">Your soldier</div>` + row("long", "Long arm", LONG) + row("side", "Sidearm", SIDE) + row("blade", "Blade", BLADE)
    + `<div class="m-load"><b>Load</b> ${w} of ${LOAD_MAX} · ${sp >= 0 ? `${sp}% quicker` : `${-sp}% slower`} on your feet</div>`
    + `<div class="m-pick">${["long", "side", "blade"].filter(k => pick[k] && pick[k].icon).map(k => `<div><b>${esc(pick[k].name)}</b> ${esc(pick[k].stats.map(([a, b]) => a + " " + b).join(" · "))}</div>`).join("")}</div>`
    + (must && must.kind !== "duel" ? `<div class="mr"><div class="pv-h">Mount</div><div class="mcs"><button class="mc${riding() ? " on" : ""}" data-ride="1"><span>${riding() ? "On horseback" : "On foot"}</span></button></div><div class="m-load">${riding() ? `You ride into battle: quicker than any man, a longer reach with the blade, and the weight of the horse in a charge — but pikes are death to a rider.${must.kind === "bots" || must.kind === "mp" ? ` ${RIDE_COST} thalers from the purse.` : ""}` : "Click to ride into battle instead."}</div></div>` : "")
    + (note ? `<div class="m-note">${esc(note)}</div>` : "");
}
// ready: against bots or in a duel, off at once; against a player, said — and when both are, the field
function musterReady() {
  if (!must) return;
  const k = must.kind;
  if (k === "bots") { lastMode = "bots"; must = null; startDuel({ bot: true }); return; }
  if (k === "hist") { const P = histPick(), b = battleById(P.id); lastMode = "hist"; must = null; if (b.sea) { seaHist(b, P.side); return; } startDuel({ bot: true, army: histArmy(b, P.side) }); return; }
  // (a duel in the demo: against a bot, at once — another player is the full game's)
  if (k === "duel") { lastMode = "duel"; must = null; if (full()) findMatch(); else startDuel({ bot: true }); return; }
  lastMode = "quick";
  if (must.mine && must.theirs) return;
  must.mine = !must.mine;
  const A = army();
  must.net.send(must.mine ? { t: "bmust", army: { muster: A.muster, guns: A.guns, uniform: A.uniform, allies: menOf(A), ride: riding() ? 1 : 0 }, lo } : { t: "bunmust" });
  drawVs(); maybeStart();
}
function maybeStart() {
  const M = must; if (!M || M.kind !== "mp" || !M.mine) return;
  // (the other player's game waits to be told the field; the host's raises it when both are ready)
  if (M.side === 1 && !M.started) { M.started = true; startDuel({ net: M.net, side: 1, foe: { ...M.foe, lo: M.theirs ? M.theirs.lo : M.foe.lo }, battle: true }); return; }
  if (M.side === 0 && M.theirs && !M.started) { M.started = true; clearInterval(M.clock); const t = M.theirs; must = null; startDuel({ net: M.net, side: 0, foe: { ...M.foe, army: t.army, lo: t.lo || M.foe.lo }, battle: true }); }
}

// ---- the company: alone, or with men of your own against more of theirs; a battle, in uniform, with works and guns ----
function drawArmy() {
  const el = $("musArmy"); if (!el) return;
  if (must && must.kind === "hist") { drawHist(el); return; }
  const A = army(), multi = A.allies > 0 || A.enemies > 1 || A.battle;
  const step = (k, label, v, lo, hi) => `<div class="pv-step"><span>${label}</span><button data-k="${k}" data-d="-1"${v <= lo ? " disabled" : ""}>−</button><b>${v}</b><button data-k="${k}" data-d="1"${v >= hi ? " disabled" : ""}>+</button></div>`;
  const sw = u => `<i style="background:#${u.coat.toString(16).padStart(6, "0")}"></i><i style="background:#${u.vest.toString(16).padStart(6, "0")}"></i>`;
  // (a battle: the company raised from the purse — so many of each, as you can pay for them)
  const spent = spentOf(A), left = A.purse - spent;
  const tr = (k, T, n, cost, max) => `<div class="pv-tr">${k !== "guns" && plateOf(wayOfUniform(A.uniform), k) ? `<img class="pv-tr-img" src="${plateOf(wayOfUniform(A.uniform), k)}" alt="">` : ""}<span class="pv-tr-n"><b>${T.name || T}</b><small>${T.note || ""}</small></span><i>${cost}</i><button data-tr="${k}" data-d="-1"${n <= 0 ? " disabled" : ""}>−</button><b class="pv-tr-c">${n}</b><button data-tr="${k}" data-d="1"${cost > left || n >= max ? " disabled" : ""}>+</button></div>`;
  const muster = A.battle ? `<div class="pv-purse">${A.vs === "player" ? (() => { const guest = must && must.kind === "mp" && must.side === 1, host = must && must.kind === "mp" && must.side === 0; return `${Object.entries(PURSES).map(([v, n]) => `<button class="pv-gr${(guest ? A.purse === +v : A.ppurse === +v) ? " on" : ""}" data-ppurse="${v}"${guest ? " disabled" : ""}><b>${n}</b><small>${v} thalers</small></button>`).join("")}<span class="pv-pf">The purse: <b>${A.purse}</b> thalers each${guest ? ` — ${esc(must.foe.name || "the host")} chooses the size of battle` : host ? " — you're the host: the size of battle is yours to choose" : ""}</span>`; })() : Object.entries(PURSES).map(([v, n]) => `<button class="pv-gr${A.purse === +v ? " on" : ""}" data-purse="${v}"><b>${n}</b><small>${v} thalers</small></button>`).join("")}
      <div class="pv-spent"><i style="width:${Math.min(100, spent / A.purse * 100).toFixed(1)}%"></i><span>${spent} of ${A.purse} thalers spent · ${menOf(A)} men${A.guns ? `, ${A.guns} gun${A.guns > 1 ? "s" : ""}` : ""}</span></div></div>
    <div class="pv-muster">${Object.entries(TROOPS).map(([k, T]) => tr(k, T, A.muster[k] | 0, T.cost, MAX_MEN - menOf(A) + (A.muster[k] | 0))).join("")}${tr("guns", { name: "Guns", note: "Field gun, two crew" }, A.guns, GUN_COST, MAX_GUNS)}</div>` : "";
  if (!A.battle) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const locked = must && must.mine;
  el.classList.toggle("locked", !!locked);
  // (colours as swatches; the ground — against bots only: against a player it falls as it will)
  el.innerHTML = `<div class="pv-h big">Your company</div>
    ${muster}
    <div class="pv-h">Colours</div>
    <div class="pv-unis">${Object.entries(UNIFORMS).filter(([, u]) => !u.hist && !u.nat).map(([k, u]) => `<button class="pv-uni${A.uniform === k ? " on" : ""}" data-uni="${k}" title="${esc(u.note)}"><span class="pv-sw">${sw(u)}</span>${esc(u.name)}</button>`).join("")}</div>
    ${A.vs !== "player" ? sidesRow(A) : ""}
    ${A.vs !== "player" && !isCustom(A) ? `<div class="pv-h">The ground</div><div class="pv-grounds">${[["open", "Open field"], ["ours", "Your fort"], ["theirs", "Their fort"]].map(([k, n]) => `<button class="pv-gr${A.ground === k ? " on" : ""}" data-gr="${k}"><b>${n}</b></button>`).join("")}</div>` : ""}`;
  void step; void multi;
}
// ---- the historical battles: which, and on which side ----
const PICK_KEY = "reckoning.history.pick";
function histPick() { let p = null; try { p = JSON.parse(localStorage.getItem(PICK_KEY)); } catch (e) {} const b = p && battleById(p.id) || BATTLES[0]; return { id: b.id, side: p && b.id === p.id && (p.side === 0 || p.side === 1) ? p.side : b.you }; }
// a battle at sea: fought as the campaign's are, on the flagship of your side's fleet; its end kept as a field's is
function seaHist(b, side) {
  const mine = b.sides[side], theirs = b.sides[1 - side], fleet = S => S.fleet.map(f => ({ k: f.k, hp: 1, color: f.color, name: f.name || S.nation }));
  window.__uisfx && window.__uisfx.click && window.__uisfx.click();
  navalBattle({ title: b.name, sub: `${b.date} · ${b.at}. ${b.brief}`, mine: fleet(mine), theirs: fleet(theirs), myColor: mine.color, theirColor: theirs.color, myName: mine.name, theirName: theirs.name, doneText: "Back to the battles",
    onEnd: r => { if (!r.left || r.mine.length) histResult(b.id, side, !!r.won); openMuster("hist"); } });
}
function setHistPick(p) { try { localStorage.setItem(PICK_KEY, JSON.stringify(p)); } catch (e) {} }
function drawHist(el) {
  el.classList.remove("hidden", "locked");
  const P = histPick(), b = battleById(P.id), R = histRecord();
  // (at sea there's no soldier to arm: you're on the flagship's quarterdeck)
  $("musMe").classList.toggle("hidden", !!b.sea); $("musMe").parentElement.classList.toggle("solo", !!b.sea);
  const sw = k => { const u = UNIFORMS[k]; return `<span class="pv-sw" title="${esc(u.note)}"><i style="background:#${u.coat.toString(16).padStart(6, "0")}"></i><i style="background:#${u.vest.toString(16).padStart(6, "0")}"></i></span>`; };
  // (a fleet in words: "2 ships of the line, 2 frigates (one Dutch)")
  const ships = F => ["line", "frigate", "sloop"].map(k => { const L = F.filter(f => f.k === k), n = L.length, du = L.filter(f => f.name).length; return n ? `${n} ${n > 1 ? SHIPS[k].name.toLowerCase() : SHIPS[k].one.toLowerCase()}${du ? ` (${du === n ? (n > 1 ? "all " : "") : du === 1 ? "one " : `${du} `}${enemyOfName(L.find(f => f.name).name)})` : ""}` : ""; }).filter(Boolean).join(", ");
  const men = c => Object.entries(c.muster).map(([k, n]) => `${n} ${c.call && c.call[k] ? c.call[k].toLowerCase() + (n > 1 ? "s" : "") : (n > 1 ? TROOPS[k].name : TROOPS[k].one).toLowerCase()}`).join(", ") + (c.guns ? `, ${c.guns} gun${c.guns > 1 ? "s" : ""}` : "");
  const laurel = id => { const e = R[id]; return e && (e.won[0] || e.won[1]) ? `<i class="hb-won" title="Won${e.won[0] && e.won[1] ? " on both sides" : ""}">✦</i>` : ""; };
  el.innerHTML = `<div class="pv-h big">Choose a battle</div>
    <div class="hb-list">${BATTLES.map(x => `<button class="hist-b${x.id === b.id ? " on" : ""}" data-hb="${x.id}"><small>${x.year}</small><b>${esc(x.name)}</b>${laurel(x.id)}</button>`).join("")}</div>
    <div class="hb-card">
      <div class="hb-t"><b>${esc(b.name)}</b><span>${esc(b.date)} · ${esc(b.at)}</span></div>
      <p class="hb-brief">${esc(b.brief)}</p>
      <div class="pv-h">Fight for</div>
      <div class="hb-sides">${b.sea ? b.sides.map((S, i) => `<button class="hb-side${P.side === i ? " on" : ""}" data-hs="${i}"><span class="hb-sn">${[...new Set(S.fleet.map(f => f.color || S.color))].map(c => `<span class="pv-sw"><i style="background:${c}"></i></span>`).join("")}<b>${esc(S.name)}</b></span><small>${esc(S.lead)} · ${S.fleet.length} ships</small><small class="hb-co">${i === P.side ? "<b>Yours:</b> " : ""}${ships(S.fleet)}</small></button>`).join("") : b.sides.map((S, i) => `<button class="hb-side${P.side === i ? " on" : ""}" data-hs="${i}"><span class="hb-sn">${S.cos.map(c => sw(c.uni)).join("")}<b>${esc(S.name)}</b></span><small>${esc(S.lead)}${b.fort === i ? " · holds the works" : ""}${S.cos.length > 1 ? ` · ${S.cos.length} companies` : ""}</small>${S.cos.map((c, j) => `<small class="hb-co">${i === P.side && !j ? "<b>Yours:</b> " : ""}${esc(UNIFORMS[c.uni].name)} — ${men(c)}</small>`).join("")}</button>`).join("")}</div>
      <p class="pv-sn">${b.won == null ? "Neither side won it outright." : `In ${b.year}, ${esc(b.sides[b.won].name.replace(/^The /, "the "))} won the day.`} ${b.sea ? "You command the flagship; the other captains fight their own ships." : "You lead one company, and the bots lead the rest."}</p>
    </div>`;
}
// (the sides, against bots: one against one, as a battle's always been — or any of the usual others, or your own: up to
//  four sides, up to four companies to a side)
function sidesRow(A) {
  const S = A.sides, one = p => p.length === 2 && p[0] === 1 && p[1] === 1 ? "1 v 1" : sidesWord(p), cos = S.reduce((t, n) => t + n, 0);
  return `<div class="pv-h">The sides</div>
    <div class="pv-sides">${[[1, 1], ...SIDE_PRESETS].map(p => `<button class="pv-gr${sidesWord(p) === sidesWord(S) ? " on" : ""}" data-sides="${p.join(",")}"><b>${one(p)}</b></button>`).join("")}</div>
    <div class="pv-sidesc">${S.map((n, a) => `<div class="pv-step"><span>${a ? `Side ${a + 1}` : "Yours"}</span><button data-side="${a}" data-d="-1"${n <= 1 ? " disabled" : ""}>−</button><b>${n}</b><button data-side="${a}" data-d="1"${n >= 4 ? " disabled" : ""}>+</button></div>`).join("")}
      <button class="pv-gr pv-add" data-addside="1"${S.length >= 4 ? " disabled" : ""}><b>+ Side</b></button><button class="pv-gr pv-add" data-addside="-1"${S.length <= 2 ? " disabled" : ""}><b>− Side</b></button></div>
    <div class="pv-sn">${isCustom(A) ? `${cos} companies, each raised from the same purse${cos > 4 ? " (the bots' smaller, with so many on the field)" : ""}. You lead one of yours; bots lead the rest${S.length > 2 ? ` — and with ${S.length} sides, every side is against every other` : ""}.` : "Your company against one other — the forts are for this."}</div>`;
}
function armyClick(e) {
  const b = e.target.closest("button"); if (!b || (must && must.mine)) return;
  if (must && must.kind === "hist") {
    const P = histPick();
    if (b.dataset.hb) { const nb = battleById(b.dataset.hb); setHistPick({ id: nb.id, side: nb.you }); }
    else if (b.dataset.hs) setHistPick({ ...P, side: +b.dataset.hs });
    else return;
    drawHist($("musArmy")); drawVs(); window.__uisfx && window.__uisfx.click && window.__uisfx.click(); return;
  }
  const A = army();
  if (b.dataset.k) setArmy({ [b.dataset.k]: A[b.dataset.k] + +b.dataset.d });
  else if (b.dataset.bt) setArmy({ battle: !A.battle, enemies: !A.battle && A.enemies < 6 ? 8 : A.enemies, allies: !A.battle && A.allies < 4 ? 6 : A.allies });
  else if (b.dataset.uni) setArmy({ uniform: b.dataset.uni });
  else if (b.dataset.gr) setArmy({ ground: b.dataset.gr });
  else if (b.dataset.vs) setArmy({ vs: b.dataset.vs });
  else if (b.dataset.purse) setArmy({ purse: +b.dataset.purse });
  else if (b.dataset.ppurse) { if (must && must.kind === "mp" && must.side === 1) return; setArmy({ ppurse: +b.dataset.ppurse }); if (must && must.kind === "mp" && must.net) must.net.send({ t: "bpurse", v: +b.dataset.ppurse }); }
  else if (b.dataset.sides) setArmy({ sides: b.dataset.sides.split(",").map(Number) });
  else if (b.dataset.side) { const S = A.sides.slice(); S[+b.dataset.side] += +b.dataset.d; setArmy({ sides: S }); }
  else if (b.dataset.addside) { const S = A.sides.slice(); if (+b.dataset.addside > 0) S.push(1); else S.pop(); setArmy({ sides: S }); }
  else if (b.dataset.tr === "guns") setArmy({ guns: A.guns + +b.dataset.d });
  else if (b.dataset.tr) setArmy({ muster: { ...A.muster, [b.dataset.tr]: (A.muster[b.dataset.tr] | 0) + +b.dataset.d } });
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
  const A0 = army(), wantBattle = A0.battle && A0.vs === "player";
  if (!wantBattle && (A0.allies > 0 || A0.enemies > 1 || A0.battle)) { search = null; startDuel({ bot: true }); return; }
  // (in the camp: the same connection looks — and anyone in camp sees you're looking)
  if (camp && camp.net && camp.net.open) {
    const s = search = { t0: performance.now(), net: camp.net, viaCamp: true, done: false };
    ctx.screen("pvpFind");
    $("pvpFindT").textContent = wantBattle ? "Looking for another commander…" : "Looking for an opponent…";
    $("pvpFindS").textContent = "Everyone in the camp, and anyone who comes in.";
    const clock = setInterval(() => {
      if (search !== s) return clearInterval(clock);
      const t = Math.floor((performance.now() - s.t0) / 1000); $("pvpFindC").textContent = `${t} s`;
      if (t === SEARCH_SECS) $("pvpFindS").textContent = wantBattle ? "Nobody's come yet. Keep waiting — or fight bots meanwhile." : "Nobody's come yet. Keep waiting, or fight a bot as strong as you are.";
    }, 250);
    const r = record(), n = camp.net;
    n.on.duel = m => { if (search !== s) return; clearInterval(clock); matched(n, m); };
    n.send({ t: "pvpq", lo, rating: Math.round(r.rating), user: ctx.user(), mode: wantBattle ? "battle" : "duel", army: wantBattle ? { allies: menOf(A0), ground: A0.ground, uniform: A0.uniform, muster: A0.muster, guns: A0.guns } : undefined });
    return;
  }
  const s = search = { t0: performance.now(), net: null, key: null, done: false, seen: [] };
  window.__pvpSearch = s;
  ctx.screen("pvpFind");
  const say = (t, sub) => { $("pvpFindT").textContent = t; if (sub != null) $("pvpFindS").textContent = sub; };
  say(wantBattle ? "Looking for another commander…" : "Looking for an opponent…", HOST ? "Anyone on your network looking for a fight — or on the servers you know." : "Anyone else looking for a fight, on the servers you know.");
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
      matched(n, m);
    };
    n.send({ t: "pvpq", lo, rating: Math.round(r.rating), user: ctx.user(), mode: wantBattle ? "battle" : "duel", army: wantBattle ? { allies: menOf(A0), ground: A0.ground, uniform: A0.uniform, muster: A0.muster, guns: A0.guns } : undefined });
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
  const battle = army().battle;
  cancelSearch(true);
  if (battle) openMuster("bots"); else startDuel({ bot: true });
}
function cancelSearch(quiet) {
  const s = search; search = null;
  if (s && s.net) { s.net.send({ t: "pvpcancel" }); if (!s.viaCamp) s.net.close(); else s.net.on.duel = m => matched(s.net, m); }
  if (!quiet) openCamp();
}

// the company you take out against bots: how many with you, how many against, and whether it's a battle — your
// colours, and theirs, drawn from the others (kept between games)
const ARMY_KEY = "reckoning.pvp.battle";
// (against a player: each asks for a size of battle, and it's fought at the larger of the two — a great battle if
//  either of you wants one)
const prefPurse = a => PURSES[a.ppurse] ? +a.ppurse : 900;
// (against a player, the host's choice: theirs, if you're the guest — till it comes, the smallest)
const livePurse = a => must && must.kind === "mp" && must.side === 1 ? (must.theirPurse || 900) : prefPurse(a);
export function army() {
  let a = {}; try { a = JSON.parse(localStorage.getItem(ARMY_KEY) || "{}") || {}; } catch (e) {}
  const keys = Object.keys(UNIFORMS).filter(k => !UNIFORMS[k].hist && !UNIFORMS[k].nat), uniform = keys.includes(a.uniform) ? a.uniform : keys[0];
  const others = keys.filter(k => k !== uniform);
  const ground = ["open", "ours", "theirs"].includes(a.ground) ? a.ground : "open";
  const purse = PURSES[a.purse] ? +a.purse : 900;
  const F = fitMuster(a.muster || { musketeer: 8, pike: 2, bow: 2 }, a.guns ?? 1, a.vs === "player" ? livePurse(a) : purse, riding());
  return { allies: Math.max(0, Math.min(12, a.allies | 0)), enemies: Math.max(1, Math.min(20, a.enemies | 0 || 1)), battle: !!a.battle, uniform, enemyUniform: others[Math.floor(Math.random() * others.length)], ground, vs: a.vs === "player" ? "player" : "bots",
    purse: a.vs === "player" ? livePurse(a) : purse, ppurse: prefPurse(a), muster: F.muster, guns: F.guns, sides: fitSides(a.sides), ride: riding() };
}
export function setArmy(ch) { try { const a = { ...army(), ...ch }; delete a.enemyUniform; const F = fitMuster(a.muster, a.guns, a.vs === "player" ? livePurse(a) : (PURSES[a.purse] ? +a.purse : 900), riding()); a.muster = F.muster; a.guns = F.guns; localStorage.setItem(ARMY_KEY, JSON.stringify(a)); } catch (e) {} }
// ---- the treasury: what a company costs to raise ----
// Every side has the same purse, and spends it as its commander sees fit: a few men with the best of arms, or many
// with cheap ones; guns cost dearest of all (and come with their crews)
export const TROOPS = {
  musketeer: { name: "Musketeers", one: "Musketeer", cost: 60, lo: { long: "musket", side: "none", blade: "dagger" }, note: "Musket and bayonet" },
  // (townsmen called out and handed a musket: cheap, and it shows — they shoot wide, load slowly, and run sooner)
  militia: { name: "Militia", one: "Militiaman", cost: 26, raw: true, lo: { long: "musket", side: "none", blade: "dagger" }, note: "Musket, little drill · cheap, unsteady" },
  grenadier: { name: "Grenadiers", one: "Grenadier", cost: 120, lo: { long: "musket", side: "none", blade: "dagger" }, nades: 3, note: "Musket, bayonet, 3 grenades" },
  crossbow: { name: "Crossbowmen", one: "Crossbowman", cost: 36, lo: { long: "crossbow", side: "none", blade: "sword" }, note: "Crossbow and sword" },
  sword: { name: "Swordsmen", one: "Swordsman", cost: 42, lo: { long: "none", side: "pistol", blade: "sword" }, note: "Sword and pistol" },
  pike: { name: "Pikemen", one: "Pikeman", cost: 28, lo: { long: "none", side: "none", blade: "spear" }, note: "Long spear · stops horse" },
  axe: { name: "Axemen", one: "Axeman", cost: 26, lo: { long: "none", side: "none", blade: "battleaxe" }, note: "Battle axe · slow, heavy" },
  bow: { name: "Bowmen", one: "Bowman", cost: 22, lo: { long: "bow", side: "none", blade: "dagger" }, note: "Bow and knife · cheap" },
  cavalry: { name: "Cavalry", one: "Trooper", cost: 150, horse: true, lo: { long: "none", side: "pistol", blade: "sword" }, note: "Horse, pistol, sabre · fears pikes" },
};
// ---- a part of the company to command by itself: a letter for each arm (pressed again, the whole company) ----
export const GROUPS = [
  { key: "KeyL", id: "line", name: "Musketeers", kinds: ["musketeer", "militia"] },
  { key: "KeyO", id: "gren", name: "Grenadiers", kinds: ["grenadier"] },
  { key: "KeyP", id: "pike", name: "Pikemen", kinds: ["pike"] },
  { key: "KeyI", id: "shot", name: "Bowmen and crossbowmen", kinds: ["bow", "crossbow"] },
  { key: "KeyU", id: "blade", name: "Swordsmen and axemen", kinds: ["sword", "axe"] },
  { key: "KeyK", id: "horse", name: "Cavalry", kinds: ["cavalry"] },
];
// (a man's arm: his muster says it — or, a company raised without one, what he carries)
const armOf = u => {
  const k = u.info && u.info.kind; if (k) return k;
  const lo = u.lo || (u.info && u.info.lo) || {};
  return u.info && u.info.horse ? "cavalry" : lo.long === "musket" ? "musketeer" : lo.long === "crossbow" ? "crossbow" : lo.long === "bow" ? "bow" : lo.blade === "spear" ? "pike" : lo.blade === "battleaxe" || lo.blade === "warclub" ? "axe" : "sword";
};
export const groupOf = u => { const k = armOf(u), g = GROUPS.find(g => g.kinds.includes(k)); return g ? g.id : null; };
// ---- nerve: how much a man can stand before he breaks and runs ----
// (the drilled and the well-paid steadiest — pikes in their block, grenadiers, troopers; the cheap levies the first to
//  go: a mob of bowmen and axemen thrown at a line that fires steadily into them comes apart before it gets there)
const STEADY = { musketeer: 1, militia: 0.6, grenadier: 1.25, pike: 1.2, cavalry: 1.15, sword: 0.95, crossbow: 0.8, axe: 0.75, bow: 0.7 };
// (a horse's coat: bay, chestnut, black, grey, dun — as a regiment's remounts came)
const COATS = [0x5a3a22, 0x6a4428, 0x7a3e1e, 0x2a221c, 0x8a8478, 0x9a7a52, 0x4a3220];
export const GUN_COST = 160;
export const PURSES = { 500: "A skirmish", 900: "A battle", 1500: "A great battle", 2000: "An epic battle", 2500: "A magnificent battle", 3500: "A grand battle", 5000: "A great war" };
// (the most a side can field: room enough for the biggest purse to be spent on men, not left in the chest)
const MAX_MEN = 90, MAX_GUNS = 4;
export const spentOf = A => Object.entries(A.muster || {}).reduce((t, [k, n]) => t + (TROOPS[k] ? TROOPS[k].cost * n : 0), 0) + (A.guns | 0) * GUN_COST + (A.ride ? RIDE_COST : 0);
export const menOf = A => Object.values(A.muster || {}).reduce((t, n) => t + (n | 0), 0);
// a muster cut down to a purse (anything over, the dearest first), and to the most men a side can have
function fitMuster(m, guns, purse, ride = false) {
  const out = {}; for (const k in TROOPS) out[k] = Math.max(0, Math.min(MAX_MEN, (m && m[k]) | 0));
  guns = Math.max(0, Math.min(MAX_GUNS, guns | 0));
  const A = { muster: out, guns, ride };
  // (over the purse: a gun given up first, then the dearest men)
  while (spentOf(A) > purse) { if (A.guns) { A.guns--; continue; } const k = Object.keys(TROOPS).filter(k => out[k]).sort((a, b) => TROOPS[b].cost - TROOPS[a].cost)[0]; if (!k) break; out[k]--; }
  while (menOf(A) > MAX_MEN) { const k = Object.keys(out).find(k => out[k]); out[k]--; }
  return A;
}
// the other side's officer raising his company: a gun or two if the purse runs to it, then men — mostly muskets, the
// rest as it falls
function botMuster(purse) {
  const guns = purse >= 2000 ? 2 + (Math.random() < 0.5 ? 1 : 0) : purse >= 900 ? 1 + (Math.random() < 0.5 ? 1 : 0) : Math.random() < 0.4 ? 1 : 0, m = {};
  let left = purse - guns * GUN_COST;
  const pick = () => { const r = Math.random(); return r < 0.44 ? "musketeer" : r < 0.52 ? "grenadier" : r < 0.62 ? "pike" : r < 0.72 ? "crossbow" : r < 0.81 ? "bow" : r < 0.89 ? "sword" : r < 0.94 ? "axe" : "cavalry"; };
  for (let tries = 0; tries < 200 && left >= 22; tries++) { const k = pick(); if (TROOPS[k].cost <= left && Object.values(m).reduce((a, b) => a + b, 0) < MAX_MEN) { m[k] = (m[k] || 0) + 1; left -= TROOPS[k].cost; } }
  return { muster: m, guns };
}
// ---- a custom battle: two to four sides, and one to four companies to a side — you lead one of the first side's,
// bots lead all the rest (each its own officer, as the one against you always was) ----
export const SIDE_PRESETS = [[1, 2], [2, 2], [3, 3], [4, 4], [2, 1], [1, 1, 1], [1, 1, 1, 1], [2, 2, 2]];
const CUSTOM_MEN = 170;   // (the most men on the field, all the companies together: past that, each bot company smaller)
export const sidesWord = S => S.join(" v ");
export const isCustom = A => !!(A && A.battle && A.vs !== "player" && Array.isArray(A.sides) && !(A.sides.length === 2 && A.sides[0] === 1 && A.sides[1] === 1));
const fitSides = S => { S = Array.isArray(S) ? S.slice(0, 4).map(n => Math.max(1, Math.min(4, n | 0))) : [1, 1]; while (S.length < 2) S.push(1); return S; };
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
// two players of a campaign meeting on the field: a line of its own to the server, the battle's key, and the battle as any
// online battle is — the companies the campaign's, the outcome back to it. (o: key, side, foe, army (yours), theirs, onEnd)
async function fieldWithPlayer(o) {
  const g = globalServer(), addr = g && addressOf(g); if (!addr) { o.onFail && o.onFail("No server to meet on."); return; }
  const me = ctx.identity(), n = new Net(addr);
  try { await n.connect(me.name, me.look); } catch (e) { o.onFail && o.onFail("The server can't be reached just now."); return; }
  lastMode = "campaign"; must = null; fieldWait = true; stopAmbient();
  n.on.duel = m => { n.on.duel = null; startDuel({ net: n, side: m.side, foe: { ...m.foe, name: o.foe.name || m.foe.name, army: o.theirs }, battle: true, army: o.army, cmpEnd: o.onEnd, at: o.at || null }); };
  n.on.dend = () => { if (!G.arena) { fieldWait = false; o.onFail && o.onFail(`${o.foe.name || "They"} didn't come to the field.`); } };
  n.send({ t: "cbpair", key: o.key, side: o.side, lo });
  // (a minute and a half and nobody: the battle's left to the generals)
  setTimeout(() => { if (fieldWait && !G.arena) { fieldWait = false; try { n.close(); } catch (e) {} o.onFail && o.onFail(`${o.foe.name || "They"} didn't come to the field — the generals fought it.`); } }, 90000);
  $("pvpFindT").textContent = `Marching to meet ${o.foe.name || "them"}…`; $("pvpFindS").textContent = "Both armies must come to the field."; ctx.screen("pvpFind");
}
window.__duel = o => startDuel(o);   // (for the test scripts)
function startDuel(o) {
  stopAmbient();
  const me = ctx.identity(), r = record();
  // a battle against another player: the host (the first of the two) chooses the ground and raises both companies; the
  // other waits for the field to be described to it, and builds the same
  if (o.net && o.battle) {
    const mine = o.army || army(), theirs = o.foe.army || {};
    const keys = Object.keys(UNIFORMS).filter(k => !UNIFORMS[k].hist && !UNIFORMS[k].nat);
    if (o.side === 0) {
      let uf = keys.includes(theirs.uniform) ? theirs.uniform : keys[1]; if (uf === mine.uniform) uf = keys.filter(k => k !== mine.uniform)[Math.floor(Math.random() * (keys.length - 1))];
      // (the ground against a player: the open field — unless one company is clearly the smaller, which then has a fort
      //  to hold, walls to make up its numbers; never a fort for one of two even sides by the luck of the draw)
      const nMine = menOf(mine) + (mine.guns | 0) * 2, nTheirs = (theirs.allies | 0) + (theirs.guns | 0) * 2;
      // (always the open field against a player: no walls handed to either side)
      const ground = "open"; void nMine; void nTheirs;
      const A = { battle: true, allies: menOf(mine), enemies: theirs.allies | 0, ground: o.ground || ground, uniform: mine.uniform, enemyUniform: uf, vs: "player", purse: mine.purse, muster: mine.muster, guns: mine.guns, cmpEnd: o.cmpEnd || null, at: o.at || null };
      if (must) { clearInterval(must.clock); must = null; }
      ctx.begin();
      new Arena({ me, lo: { ...lo }, foe: { ...o.foe, bot: false }, net: o.net, side: 0, army: A });
    } else {
      $("pvpFindT").textContent = `${o.foe.name || "Your opponent"} has the field`; $("pvpFindS").textContent = "They're choosing the ground — somewhere on the Earth…";
      o.net.on.bsetup = m => {
        o.net.on.bsetup = null; if (must) { clearInterval(must.clock); must = null; }
        // (the field as theirs, seen from the other side: their company is "them" here, and yours "you")
        const A = { battle: true, allies: m.counts[1], enemies: m.counts[0], ground: m.fort === 1 ? "ours" : m.fort === 0 ? "theirs" : "open", uniform: m.uni[1], enemyUniform: m.uni[0], vs: "player", cmpEnd: o.cmpEnd || null, at: o.at || null };
        ctx.begin();
        new Arena({ me, lo: { ...lo }, foe: { ...o.foe, bot: false }, net: o.net, side: 1, army: A, setup: m });
      };
      o.net.on.lost = () => { if (!G.arena) { if (must) { clearInterval(must.clock); must = null; } openCamp(); campNote("The connection dropped before the field was set — you're back in camp."); } };
    }
    return;
  }
  ctx.begin();
  const A = o.bot ? o.army || army() : null, multi = A && (A.allies > 0 || A.enemies > 1 || A.battle);
  const foe = o.bot ? { ...botFoe(), bot: true, skill: skillOf(botRecord().rating) } : { ...o.foe, bot: false };
  new Arena({ me, lo: { ...lo }, foe, net: o.net || null, side: o.side || 0, army: multi ? A : null });
}

// ---------------------------------------------------------------------------
//  played back: the battle just fought, or anyone's from the server (replay.js plays it)
// ---------------------------------------------------------------------------
let lastRec = null;
// (from: where Leave goes — the result, or the camp)
function watch(rec, mode = "full", from = "camp", title = null) {
  stopAmbient();
  ctx.film();
  new Theatre(rec, { mode, from, title, onExit: () => { ctx.end(); if (from === "end") ctx.screen("pvpEnd"); else openCamp(); } });
}
// the result's buttons to see it again
function endReplay(rec) {
  const el = $("pvpEndReplay"); if (!el) return;
  el.innerHTML = rec ? `<button class="btn" data-rp="full">Watch the battle again</button>
    <label class="check pv-share"><input type="checkbox" id="pvpShareIt"${rec.id ? " checked disabled" : ""}> <span>${rec.id ? "Shared, for everyone to watch" : "Share this battle on the server, for everyone to watch"}</span></label>` : "";
  el.onclick = e => { const b = e.target.closest("[data-rp]"); if (b && lastRec) watch(lastRec, b.dataset.rp, "end"); };
  // (only when you say so: ticked, it's sent — and once it's there, it stays)
  const box = $("pvpShareIt");
  if (box) box.onchange = () => {
    if (!box.checked || rec.id) return;
    box.disabled = true; const t = box.nextElementSibling; t.textContent = "Sending it to the server…";
    upload(rec).then(id => { if (id) { rec.id = id; t.textContent = "Shared, for everyone to watch"; } else { box.checked = false; box.disabled = false; t.textContent = "Couldn't reach the server — tick it to try again"; } });
  };
}

// the ground: the deer ride in the woods below the clearing, open in the middle and the trees thick round it
let C = { x: HUNT.x, z: HUNT.z }, SPAWN = [];
const BOUND = 40, setC = c => { C = c; SPAWN = [{ x: C.x - 19, z: C.z + 2 }, { x: C.x + 19, z: C.z - 2 }]; };
setC(C);

// a battle's ground: somewhere on the Earth as it was in 1683 — anywhere there's land, open enough and level enough
// for two companies to stand off across it (never the sea, a lake, the ice or the peaks), a new place every time;
// and the name of the realm it lies in, or nearest to
function battleGround(given = null) {
  const half = EARTH_SIZES.l, seed = given ? given.seed : (Math.random() * 1e9) | 0, w = new Wilds({ seed, half, kind: "earth" }), L = w.land, R = 80;
  if (given) return { w, x: given.x, z: given.z, seed, name: placeName(given.x / half * 180, -given.z / half * 180), biome: L.biomeAt(given.x, given.z) };
  for (let tries = 0; tries < 6000; tries++) {
    const x = (Math.random() * 2 - 1) * half * 0.94, z = (Math.random() * 2 - 1) * half * 0.42;
    const h = L.heightAt(x, z); if (h < WATER + 2.5 || h > 44) continue;
    const b = L.biomeAt(x, z); if (b === "ice" || b === "alpine") continue;
    // (and no cave mouth anywhere on it: walking into one would take the sky away)
    if (L.cavesNear && L.cavesNear(x, z, 140).length) continue;
    let lo = h, hi = h, ok = true;
    for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2; j++) { const y = L.heightAt(x + i * R / 2, z + j * R / 2); if (y < WATER + 1.5) { ok = false; break; } lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (!ok || hi - lo > 10) continue;
    return { w, x, z, seed, name: placeName(x / half * 180, -z / half * 180), biome: b };
  }
  return null;
}
// (a historical battle's: as near where it was fought as the ground's open and level enough — the same spot every time)
const histSpots = {};
function histGround(b, given = null) {
  if (given) return battleGround(given);
  if (histSpots[b.id]) return battleGround(histSpots[b.id]);
  const half = EARTH_SIZES.l, seed = 1683 + b.year * 7 + b.id.length, w = new Wilds({ seed, half, kind: "earth" }), L = w.land, R = 80;
  const x0 = b.lon / 180 * half, z0 = -b.lat / 180 * half;
  for (let r = 0; r < 1600; r += 40) for (let a = 0; a < 6.28; a += r ? 40 / r : 7) {
    const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
    const h = L.heightAt(x, z); if (h < WATER + 2.5 || h > 44) continue;
    const bi = L.biomeAt(x, z); if (bi === "ice" || bi === "alpine") continue;
    if (L.cavesNear && L.cavesNear(x, z, 140).length) continue;
    let lo = h, hi = h, ok = true;
    for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2; j++) { const y = L.heightAt(x + i * R / 2, z + j * R / 2); if (y < WATER + 1.5) { ok = false; break; } lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (!ok || hi - lo > 10) continue;
    histSpots[b.id] = { seed, x, z };
    return { w, x, z, seed, biome: bi };
  }
  return battleGround();
}
function placeName(lon, lat) {
  let best = null, bd = Infinity;
  for (const [n, lo, la] of REALMS_1683) { const dl = Math.abs(((lon - lo + 540) % 360) - 180) * Math.cos(lat * Math.PI / 180), d = Math.hypot(dl, lat - la); if (d < bd) { bd = d; best = n; } }
  const ns = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? "E" : "W"}`;
  // (with "the" where English wants it, in the middle of a line: near the Sahara, near the Dzungar Khanate, near Spain)
  const the = n => /^The /.test(n) ? "the" + n.slice(3) : /^(Tsardom|Holy|Kingdom|United|Swedish Empire|Italian|Ottoman Empire|Crimean|Sultanate|Regency|Funj|Kazakh|Dzungar|Khanate|Mughal|Qing|Spice|Spanish Philippines|Viceroyalty|Caribbean)\b/.test(n) ? `the ${n}` : n;
  return { text: !best ? "The wide world" : bd < 12 ? `Near ${the(best)}` : `Far beyond ${the(best)}`, at: ns };
}

// the field again, for a battle played back (replay.js): the same ground, cleared the same way, the same works and guns
// and colours where they stood — built from what the battle's own game wrote down of it
export function buildStage(S) {
  resetForMode();
  const battle = !!S.battle, multi = !!S.multi;
  const ground = battle ? battleGround({ seed: S.seed, x: S.x, z: S.z }) : null;
  const w = ground ? ground.w : new Woods();
  setC(ground ? { x: ground.x, z: ground.z } : { x: HUNT.x, z: HUNT.z });
  const HB = S.hist && ground ? S.histB || battleById(S.hist) : null;
  if (HB) shapeField(w, C, HB, !!S.histFlip);
  setWorld(w); setAtmo(S.hour || "afternoon"); G.cloud = S.cloud || 0; G.mist = S.mist || 0; G.flash = 0; if (G.sky) G.sky.visible = true; G.reAtmo && G.reAtmo();
  if (ground) w.buildNear(C.x, C.z, 99);
  if (HB) buildThings(w, C, HB, !!S.histFlip);
  w.huntOpen = true;
  const hunt = new Hunt(w, { x: C.x, z: C.z, r: 1 }, {});
  AUDIO.music(null);
  const dx = S.dx || (battle ? 38 : multi ? 21 : 19), bound = S.bound || (battle ? 76 : multi ? 48 : BOUND);
  const hash = (x, z) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  const lines = [{ x: C.x - dx, z: C.z }, { x: C.x + dx, z: C.z }];
  w.clearScenery(C.x, C.z, bound - 6, null, (x, z) => !battle && hash(x, z) < 0.2 && lines.every(p => Math.hypot(p.x - x, p.z - z) > (multi ? 12 : 7)) && Math.hypot(x - C.x, z - C.z) > 4
    && !(battle && Math.abs(Math.abs(x - C.x) - dx) < 16 && Math.abs(z - C.z) < 30));
  let field = null;
  if (multi) {
    const K = S.custom, camps = K && K.camps ? K.camps.map(c => ({ ...c, x: c.x + C.x, z: c.z + C.z })) : null;
    field = new Field(w, C, dx, battle, S.fieldSeed, S.hostFort ?? null, battle ? S.guns : null, camps);
    if (S.night) field.nightFires();
    if (K && K.flags) K.flags.forEach((f, a) => field.colours(a, f.key, { x: f.x + C.x, z: f.z + C.z }));
    else if (battle && S.uni) for (const t of [0, 1]) if (S.uni[t]) field.colours(S.remote ? 1 - t : t, S.uni[t]);
    if (S.remote) { for (const g of field.guns) g.side = 1 - g.side; field.spots.reverse(); }
    field.remote = true;   // (its guns laid and loaded as the recording says)
  }
  return { w, hunt, field };
}
export const makePuppet = (owner, info) => new Puppet(owner, info);

// (a field of many sides: each company's battery, where it stood — written down from the middle of the field)
const camps0 = A => A.field && A.field.camps ? A.field.camps.map(c => ({ side: c.side, co: c.co, guns: c.guns, x: c.x - C.x, z: c.z - C.z })) : null;
// (the guest's own ending, when the host's word doesn't come: as if it had — winner in the host's numbering)
function net_end(A, winner) { const h = A.net && A.net.on.bend; if (h) h({ winner, k: A.lost | 0, l: A.killed | 0 }); }
class Arena {
  constructor({ me, lo, foe, net, side, army: A = null, setup = null }) {
    stopAmbient(); fieldWait = false;
    stopTheatre();
    resetForMode();
    G.arena = this;
    this.me = me; this.lo = lo; this.foeInfo = foe; this.net = net; this.side = side;
    this.army = A; this.multi = !!A; this.battle = !!(A && A.battle);
    // (a battle against another player: the host's game keeps it — its men, its guns, its officer's orders for both
    //  sides, carried out — and the other's shows it, the sides turned about so that its player's company is "ours")
    this.netBattle = !!(net && this.battle); this.host = this.netBattle && side === 0; this.remote = this.netBattle && side === 1;
    // (a custom battle: the sides, as so many companies each — against bots only)
    this.custom = !net && !setup && isCustom(A) ? A.sides.slice() : null;
    // (a historical battle: the field, the armies, the hour and the weather as they were)
    this.cmpEnd = (A && A.cmpEnd) || null;
    this.hist = A && A.hist ? { ...A.hist, b: A.hist.b || battleById(A.hist.id) } : null; const HB = this.hist && this.hist.b;
    this.wins = [0, 0]; this.round = 0; this.over = false; this.live = false; this.clock = ROUND_SECS;
    // (a company's fight wants more room than a duel: the ride opened wider, the two lines further apart)
    this.bound = this.battle ? 76 : this.multi ? 48 : BOUND; this.dx = this.battle ? 38 : this.multi ? 21 : 19;
    // (a duel or a skirmish: the deer ride in the woods; a battle: somewhere on the Earth, new every time)
    // (a campaign's two players meeting: at the town, as a campaign's battles against the computer are)
    const CA = A && A.at && isFinite(A.at.lon) ? A.at : null;
    const ground = this.battle ? (HB ? histGround(HB) : CA && !setup ? histGround({ id: "cmp-" + CA.name, year: 1683, lon: +CA.lon, lat: +CA.lat }) : battleGround(setup)) : null;
    const w = this.w = ground ? ground.w : new Woods();
    setC(ground ? { x: ground.x, z: ground.z } : { x: HUNT.x, z: HUNT.z });
    // (a historical battle's ground shaped as its own was, before any of it's built)
    if (HB && ground) shapeField(w, C, HB, this.hist.side === 1);
    // (two players met at a town of the campaign: the town itself on the field — its streets, its walls if it has them,
    //  or a village's palisade — at the defender's end, built alike on both their games)
    const TW = !HB && CA && CA.rank ? { map: { things: [CA.village ? ["village", CA.def === 1 ? 1 : -1, CA.rank | 0, CA.seed | 0] : ["town", CA.def === 1 ? 1 : -1, CA.rank | 0, CA.walls | 0, CA.seed | 0, 0]] } } : null;
    if (TW && ground) shapeField(w, C, TW, false);
    this.place = HB ? { text: `${HB.name} · ${HB.date}`, at: HB.at } : CA ? { text: `${String(CA.name).slice(0, 40)} · ${String(CA.date || "").slice(0, 30)}`, at: String(CA.at || "").slice(0, 80) } : ground ? ground.name : null;
    // (the hour: a battle by day mostly — morning, afternoon or evening — and now and then by night, under the moon,
    //  the field lit by its fires and the guns' lanterns, and no one seeing far)
    const hr = Math.random();
    this.hour = !this.battle ? "afternoon" : setup ? setup.hour : HB ? HB.hour : window.__battleHour ? window.__battleHour : hr < 0.3 ? "night" : hr < 0.45 ? "evening" : hr < 0.65 ? "morning" : "afternoon";
    this.night = this.hour === "night"; this.sight = this.night ? 0.65 : 1;
    if (this.place && this.night && !HB) this.place = { ...this.place, text: this.place.text + " · by night" };
    setWorld(w); setAtmo(this.hour); G.cloud = HB ? HB.cloud || 0 : 0; G.mist = HB ? HB.mist || 0 : 0; G.flash = 0; if (G.sky) G.sky.visible = true; G.reAtmo && G.reAtmo();
    if (ground) w.buildNear(C.x, C.z, 99);
    if (HB && ground) this.things = buildThings(w, C, HB, this.hist.side === 1);
    else if (TW && ground) this.things = buildThings(w, C, TW, false);
    w.huntOpen = true;
    this.hunt = new Hunt(w, { x: C.x, z: C.z, r: 1 }, {});
    // (no friendly fire: a shot or an arrow goes by your own side's men — yours by your company, theirs by theirs)
    this.hunt.friend = (src, a) => { const side = x => x.isPlayer ? 0 : x.al ?? (x.team != null ? this.alOf(x.team) : null), ta = side(a); return ta != null && (src ? side(src) : 0) === ta; };
    G.who = isF(me.look) ? "sister" : "brother";
    // (in a battle, your company's colours: on you too)
    this.uni = this.battle ? [UNIFORMS[A.uniform] || UNIFORMS.imperial, UNIFORMS[A.enemyUniform]] : null;
    // (every side its own colours, none the same as another's)
    // (and every company of a historical battle its own: the Poles, the Emperor's men and the Saxons on one side)
    if (HB) { this.coUni = this.hist.cos.map(c => UNIFORMS[c.uni]); this.uni = [UNIFORMS[A.uniform], UNIFORMS[A.enemyUniform]]; }
    else if (this.custom) { const left = Object.keys(UNIFORMS).filter(k => !UNIFORMS[k].hist && !UNIFORMS[k].nat && UNIFORMS[k] !== this.uni[0] && k !== A.enemyUniform).sort(() => Math.random() - 0.5); for (let a = 2; a < this.custom.length; a++) this.uni.push(UNIFORMS[left.pop()]); }
    const myLook = this.myLook = this.uni ? inUniform(me.look, this.uni[0]) : me.look;
    this.foeName = foe.name;
    G.player.setModel(lookOpts(myLook, me.name)); G.player.model.scaleBase = me.look.height || 1;
    G.showHealth = true; G.hasMap = false;
    // (no music over a fight: the field, the shots and the shouting are the sound of it)
    AUDIO.music(null);
    // the ride opened up for the fight: most of its trees gone, one here and there left standing for cover (never
    // close by where either side starts), and the ground they stand on clear
    const hash = (x, z) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const lines = [{ x: C.x - this.dx, z: C.z }, { x: C.x + this.dx, z: C.z }];
    // (a battle's field cleared of the country's own trees and bushes altogether: its cover is the field's own — walls,
    //  carts, rocks — that stops a ball as it looks it would)
    w.clearScenery(C.x, C.z, this.bound - 6, null, (x, z) => !this.battle && hash(x, z) < 0.2 && lines.every(p => Math.hypot(p.x - x, p.z - z) > (this.multi ? 12 : 7)) && Math.hypot(x - C.x, z - C.z) > 4
      // (and none where either side's works or fort go)
      && !(this.battle && Math.abs(Math.abs(x - C.x) - this.dx) < 16 && Math.abs(z - C.z) < 30));
    this.spawns = this.multi ? lines.map(p => this.clearSpot(p.x, p.z)) : SPAWN.map(p => this.clearSpot(p.x, p.z));
    this.you = { isPlayer: true, team: 0, al: 0, get pos() { return G.player.pos; }, get alive() { return !G.downed; }, get yaw() { return G.player.yaw + Math.PI; }, name: me.name };
    this.units = [];
    if (this.multi) {
      // the field: its works, and the guns (a battle); a few things lying about between the lines (any fight with men)
      this.fortSide = this.battle && !this.custom ? { ours: 0, theirs: 1 }[A.ground] ?? null : null;
      // a custom battle's companies: each side's in a row where it stands — two sides at either end of the field, as a
      // battle always has them; three or four round it, facing in — yours the first of the first side's
      if (this.custom) {
        const S = this.custom, N = S.length; this.cos = [];
        for (let a = 0; a < N; a++) {
          const ang = N === 2 ? (a ? 0 : Math.PI) : Math.PI + a * 2 * Math.PI / N, hx = C.x + Math.cos(ang) * this.dx, hz = C.z + Math.sin(ang) * this.dx, lat = { x: -Math.sin(ang), z: Math.cos(ang) }, gap = N === 2 ? 20 : 15;
          const order = Array.from({ length: S[a] }, (_, k) => k).sort((p, q) => Math.abs(p - (S[a] - 1) / 2) - Math.abs(q - (S[a] - 1) / 2));
          for (const k of order) { const o = (k - (S[a] - 1) / 2) * gap; this.cos.push({ al: a, x: hx + lat.x * o, z: hz + lat.z * o, home: { x: hx, z: hz } }); }
        }
        // (each company raised from the same purse: yours as you mustered it; the others' as their officers see fit, and
        //  smaller when there are many of them, so the field isn't more men than it can hold)
        const list = M => Object.entries(M.muster).flatMap(([k, n]) => Array(n | 0).fill(k));
        const per = Math.max(6, Math.floor((CUSTOM_MEN - menOf(A)) / Math.max(1, this.cos.length - 1))), many = this.cos.length > 4;
        this.musters = []; this.gunsBought = [];
        if (HB) this.cos.forEach((c, i) => { const H = this.hist.cos[i]; this.musters.push(Object.entries(H.muster).flatMap(([k, n]) => Array(n | 0).fill(k))); c.guns = Math.min(2, H.guns | 0); c.hold = H.hold; this.gunsBought.push(c.guns); });
        else this.cos.forEach((c, i) => {
          const M = i ? botMuster((A.purse || 900) * (generalship() < 0.3 ? 0.85 : 1)) : A;
          let l = list(M); if (i) { l.sort(() => Math.random() - 0.5); l = l.slice(0, per); }
          this.musters.push(l); c.guns = i ? Math.min(M.guns | 0, many ? 1 : 2) : Math.min(A.guns | 0, N === 2 ? 3 : 2); this.gunsBought.push(c.guns);
        });
        A.allies = this.musters.filter((m, i) => i && this.cos[i].al === 0).reduce((t, m) => t + m.length, this.musters[0].length);
        A.enemies = this.musters.filter((m, i) => this.cos[i].al !== 0).reduce((t, m) => t + m.length, 0);
      }
      // (the field made the same on both games: the same seed, and built as the host's side has it — west the host's)
      this.fieldSeed = setup ? setup.fieldSeed : (Math.random() * 1e9) | 0;
      const hostFort = this.remote && this.fortSide != null ? 1 - this.fortSide : this.fortSide;
      // (a battle: each side's company as its purse raised it — yours as you mustered it; theirs as their officer, or
      //  the other player, did)
      if (this.battle && !this.remote && !this.custom) {
        const theirs = HB ? { muster: this.hist.cos[1].muster, guns: this.hist.cos[1].guns | 0 } : this.netBattle ? fitMuster(foe.army && foe.army.muster, foe.army && foe.army.guns, A.purse || 900, !!(foe.army && foe.army.ride)) : botMuster((A.purse || 900) * (generalship() < 0.3 ? 0.85 : 1));   // (an easy officer's company a little the smaller)
        const list = M => Object.entries(M.muster).flatMap(([k, n]) => Array(n | 0).fill(k));
        this.musters = [list(A), list(theirs)]; this.gunsBought = [A.guns | 0, theirs.guns | 0];
        A.allies = this.musters[0].length; A.enemies = this.musters[1].length;
      }
      // (a custom battle of two sides: each end's works with the guns of all its companies; of more: every company its
      //  own little battery)
      const sumGuns = a => Math.min(3, this.cos.filter(c => c.al === a).reduce((t, c) => t + c.guns, 0));
      const gunsHost = this.battle ? (setup ? setup.guns : this.custom ? (this.custom.length === 2 ? [sumGuns(0), sumGuns(1)] : null) : this.gunsBought) : null;
      const camps = this.custom && this.custom.length > 2 ? this.cos.map((c, i) => ({ side: c.al, co: i, x: c.x, z: c.z, guns: c.guns })) : null;
      // (a walled town: its defenders on the walk behind the parapet, their guns in its embrasures)
      const TS = this.things && this.things.siege, siege = TS && !this.remote ? { side: TS.d > 0 ? 1 : 0, guns: TS.guns, anchor: TS.anchor, ladders: (TS.ladders || []).map(L => ({ ...L })), wall: TS.wall } : null;
      w.woods = this.things && this.things.palisade && this.things.palisade.length ? this.things.palisade.side : null;
      this.field = new Field(w, C, this.dx, this.battle, this.fieldSeed, hostFort, gunsHost, camps, siege);
      this.siege = siege; if (this.things && this.things.breaks) this.field.breaks = this.things.breaks;
      // (a town of the woods' nations: its palisade, a length at a time to be burnt through or battered down)
      this.palisade = this.things && this.things.palisade && this.things.palisade.length && !this.remote ? this.things.palisade : null;
      if (this.palisade) this.palisadeSetup();
      // (besieged a year or more before this: the walls as the guns left them, breaches already open)
      if (this.things && this.things.battered) { const n = this.field.preBatter(this.things.battered); this.breachedAtStart = n; }
      this.field.onBreach = b => { if (G.arena === this) UI.hint(b.gate ? "The gate's down!" : b.kind === "tower" ? "A tower's down — a breach!" : "A breach in the wall!", 3); };
      // (a gun wrecked: its crew take up their swords and fall in with the rest)
      this.field.onGunDown = g => { for (const u of g.crew) if (u && u.alive) { u.crewOf = null; u.wasCrew = null; u.a.path = []; u.hold && u.hold(u.lo.long !== "none" ? u.lo.long : u.lo.blade); } g.crew = []; if (G.arena === this && g.side === 0) UI.hint("One of your guns is wrecked.", 2.5); };
      if (camps) { let k = 0; for (const c of camps) for (let j = 0; j < Math.min(2, c.guns); j++) if (this.field.guns[k]) this.field.guns[k++].co = c.co; }
      this.hostFort = hostFort; this.gunsHost = gunsHost;
      if (this.night) this.field.nightFires();
      // (each side's colours behind its line: yours and theirs — on the other player's game, turned about)
      const keyOf = u => Object.keys(UNIFORMS).find(k => UNIFORMS[k] === u);
      if (this.custom && this.custom.length > 2) {
        this.flags = this.custom.map((n, a) => { const h = this.cos.find(c => c.al === a).home, d = Math.hypot(h.x - C.x, h.z - C.z) || 1; return { key: keyOf(this.uni[a]), x: h.x + (h.x - C.x) / d * 7, z: h.z + (h.z - C.z) / d * 7 }; });
        this.flags.forEach((f, a) => this.field.colours(a, f.key, f));
      }
      // (no colours on a staff for the woods' nations: they carried none)
      else if (this.battle && this.uni) for (const t of [0, 1]) if (!/^warrior/.test((this.uni[t] && this.uni[t].body) || "")) this.field.colours(this.remote ? 1 - t : t, keyOf(this.uni[t]));
      if (this.remote) {
        // (and then turned about: the east line, and the guns there, are ours here)
        this.spawns.reverse();
        for (const g of this.field.guns) g.side = 1 - g.side;
        this.field.spots.reverse(); this.field.remote = true;
      }
      // (the fort's people start inside it, at its front wall)
      if (this.field.fortAt) this.spawns[this.fortSide] = this.clearSpot(this.field.fortAt.anchor.x, this.field.fortAt.anchor.z);
      // (a walled town's defenders start up on its walk, behind the parapet)
      if (this.siege) this.spawns[this.siege.side] = { x: this.siege.anchor.x, z: this.siege.anchor.z };
      this.orders = this.custom ? this.cos.map((c, i) => new Orders(i)) : [new Orders(0), new Orders(1)]; this.sub = null; this.sel = null;
      if (this.custom) this.spawns = this.cos.map(c => this.clearSpot(c.x, c.z));
      // (a battle of several companies a side: every company of the side holding the walls or the fort starts on them,
      //  spread along them — not where the open field would have put it, back in among the houses)
      if (this.custom && this.custom.length === 2) {
        const at = this.siege ? { side: this.siege.side, p: this.siege.anchor } : this.field.fortAt ? { side: this.fortSide, p: this.field.fortAt.anchor } : null;
        if (at) { const mine = this.cos.map((c, i) => [c, i]).filter(([c]) => c.al === at.side); mine.forEach(([, i], k) => { this.spawns[i] = this.clearSpot(at.p.x, at.p.z + (k - (mine.length - 1) / 2) * 9); }); }
      }
      if (!this.battle) this.orders[1].form = "loose";
      // (the woods' warriors fight in open order, each man to his own cover, as they always did — not in ranks)
      if (this.battle) this.orders.forEach((O, t) => { const U = this.coUni && this.coUni[t] || (this.uni && this.uni[this.alOf(t)]); if (U && /^warrior/.test(U.body || "") && t !== 0) O.form = "loose"; });
      this.book = new OrderBook(id => this.give(id));
      const sk = this.netBattle ? skillOf(botRecord().rating) : foe.skill, mk = (team, i) => {
        const b = botFoe(), seed = 1000 + team * 100 + i;
        const U = this.coUni && this.coUni[team] || (this.uni && this.uni[this.alOf(team)]);
        const tk = this.musters && this.musters[team] && this.musters[team][i], T = tk && TROOPS[tk], call = this.hist && this.hist.cos[team] && this.hist.cos[team].call;
        // (militia in their own grey homespun, not the crown's dyed coats: only the facings in its colour, to tell the sides)
        const look = U ? soldierLook(tk === "militia" && !/^warrior/.test(U.body || "") ? { ...U, body: undefined, coat: 0x76726a, vest: U.coat, legs: 0x5e5a52, hat: 0x4a3a2a, stock: [[0x6a6862, 60], [0x8a8478, 40]] } : U, seed) : b.look;
        const info = { ...b, look, name: U ? `${U.name}${T ? " " + ((call && call[tk]) || T.one).toLowerCase() : ""} — ${b.name}` : b.name, bot: true, skill: sk * (this.alOf(team) === 0 ? 0.95 : 1), team, al: this.alOf(team), idx: i, kind: tk || null };
        if (T) { info.lo = { ...T.lo }; info.nades = T.nades || 0; info.horse = !!T.horse; if (T.raw) info.skill *= 0.45; }
        // (the woods' nations' warriors: the war club, not a battle axe — and warriors, by name, whatever they carry)
        if (U && /^warrior/.test(U.body || "")) { if (info.lo.blade === "battleaxe") info.lo.blade = "warclub"; info.name = `${U.name} warrior — ${b.name}`; }
        else if (this.battle ? Math.random() < 0.85 : info.lo.long === "musket" && Math.random() < 0.6) info.lo = { ...info.lo, long: "musket", side: "none", blade: "dagger" };
        const u = new Bot(this, info); this.units.push(u); this.hunt.animals.push(u); return u;
      };
      if (this.remote) this.puppets(setup.roster);
      else {
        if (this.custom) this.musters.forEach((l, co) => { for (let i = 0; i < l.length; i++) mk(co, i); });
        else {
          for (let i = 0; i < A.enemies; i++) mk(1, i);
          for (let i = 0; i < A.allies; i++) mk(0, i);
        }
        // every gun with its crew: a gunner and a loader, with hangers at their belts for anyone who comes at the gun
        for (const g of this.field.guns) for (let c = 0; c < 2; c++) {
          // (a custom battle's guns: crewed by the company whose they are — or, at a side's works, the nearest of its own)
          const co = !this.custom ? g.side : g.co ?? this.cos.map((c, i) => [c, i]).filter(([c]) => c.al === g.side).sort(([p], [q]) => Math.hypot(p.x - g.x, p.z - g.z) - Math.hypot(q.x - g.x, q.z - g.z))[0][1];
          const u = mk(co, 100 + this.units.length);
          u.lo = { long: "none", side: "none", blade: "sword" }; u.info.lo = u.lo; u.crewOf = g; u.crewIdx = c; g.crew.push(u);
          u.info.name = `${c ? "Loader" : "Gunner"} — ${u.info.name.split(" — ").pop()}`;
        }
        this.units.forEach((u, i) => { u.uid = i; });
      }
      // and yours to work yourself: F at one, and it's laid on where you're looking and fired
      this.gunIts = this.field.guns.filter(g => g.side === 0).map(g => this.w.addInteract({ x: g.x, y: this.w.heightAt(g.x, g.z) + 1.0, z: g.z, reach: 2.4,
        can: () => G.arena === this && this.live && !G.downed && this.gunMan !== g,
        label: () => g.dead ? "The gun's wrecked" : this.remote ? (g.loaded ? "Lay the gun on where you're looking, and fire it" : "The gun's loading") : `Take the gun${g.loaded ? " — loaded" : g.crewN ? ` — loading, ${g.crewN} of its crew at it` : " — not loaded"}`,
        use: () => { if (g.dead) return; if (this.remote) { if (g.loaded) this.net.send({ t: "bgunlay", i: this.field.guns.indexOf(g), at: this.lookPoint() }); return; } if (this.gunMan === g || performance.now() - (this.gunLeftT || 0) < 700) return; this.manGun(g); } }));
      // (the other player, on their own side: a body your game moves as theirs tells it)
      if (this.netBattle) {
        // (on horseback, if they ride: as their muster said, or the host's word of itself)
        const nf = this.netFoe = new NetFoe(this, { ...foe, look: inUniform(foe.look || randomLook(), this.uni[1]), horse: this.host ? !!(foe.army && foe.army.ride) : !!(setup && setup.ride) });
        nf.team = 1; nf.idx = -1; nf.uid = -1; nf.isNet = true; this.units.push(nf); this.hunt.animals.push(nf);
      }
      this.foe = this.netFoe || this.units.find(u => this.alOf(u.team) !== 0);
      this.foeInfo = { ...this.foe.info, name: HB ? HB.sides[1 - this.hist.side].name : this.custom ? `${sidesWord(this.custom)} · ${this.uni.slice(1).map(u => u.name).join(", ")}` : this.uni ? this.uni[1].name : this.foe.info.name };
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
    if (this.netBattle) {
      this.wireBattle(net);
      if (this.host) { this.field.onFire = g => net.send({ t: "bgun", i: this.field.guns.indexOf(g) }); this.field.onNade = (f, v, side, fuse) => net.send({ t: "bnade", f: [f.x, f.y, f.z].map(n => +n.toFixed(2)), v: [v.x, v.y, v.z].map(n => +n.toFixed(2)), fuse: +fuse.toFixed(2) }); }
      else net.on.bnade = m => this.field && this.field.nade(new THREE.Vector3(...m.f.map(Number)), new THREE.Vector3(...m.v.map(Number)), 0, +m.fuse || 2);
    }
    // (all of it written down as it's fought, to be played over again: see replay.js)
    this.stageSetup = { battle: this.battle, multi: this.multi, seed: ground ? ground.seed : 0, x: C.x, z: C.z, fieldSeed: this.fieldSeed || 0, hostFort: this.hostFort ?? null, guns: this.gunsHost || null,
      remote: !!this.remote, uni: this.uni ? this.uni.map(u => Object.keys(UNIFORMS).find(k => UNIFORMS[k] === u)) : null, night: !!this.night, hour: this.hour, dx: this.dx, bound: this.bound, cloud: G.cloud || 0, mist: G.mist || 0, hist: HB ? HB.id : undefined, histB: HB && HB.campaign ? { id: HB.id, year: HB.year, lon: HB.lon, lat: HB.lat, map: HB.map } : undefined, histFlip: HB ? this.hist.side === 1 : undefined, coUni: this.coUni ? this.hist.cos.map(c => c.uni) : undefined,
      custom: this.custom ? { sides: this.custom, camps: camps0(this), flags: this.flags ? this.flags.map(f => ({ key: f.key, x: f.x - C.x, z: f.z - C.z })) : null } : null };
    const rec = this.rec = new Recorder(this, this.stageSetup);
    { const H = this.hunt, fb = H.fireBall.bind(H), lz = H.loose.bind(H);
      H.fireBall = (from, dir, o = {}) => { rec.shot(o.npc, from, dir, o.speed === 260); return fb(from, dir, o); };
      H.loose = (from, dir, power, bolt, npc, atYou) => { rec.arrow(npc, from, dir, power, bolt); return lz(from, dir, power, bolt, npc, atYou); };
      if (this.field) { const F = this.field, ff = F.fire.bind(F), fn = F.nade.bind(F); F.fire = g => { ff(g); rec.gun(F.guns.indexOf(g)); }; F.nade = (f, v, sd, fuse) => { fn(f, v, sd, fuse); rec.nade(f, v, fuse); }; } }
    this.hud();
    this.tick = dt => this.update(dt);
    G.onFrame.push(this.tick);
    // (against a player: the host tells the other game the field and the men, and waits for it to be ready; the other
    //  says it is, and both begin)
    if (this.host) {
      this.net.send({ t: "bsetup", ride: riding() ? 1 : 0, seed: ground.seed, x: C.x, z: C.z, fieldSeed: this.fieldSeed, hour: this.hour, fort: this.fortSide, uni: [A.uniform, A.enemyUniform], counts: [A.allies, A.enemies], guns: this.gunsBought,
        roster: this.units.filter(u => !u.isNet).map(u => ({ id: u.uid, team: u.team, look: u.info.look, name: u.info.name, lo: u.lo, horse: u.info.horse ? 1 : 0, kind: u.info.kind || null, gun: u.crewOf ? this.field.guns.indexOf(u.crewOf) : -1, ci: u.crewIdx | 0, idx: u.idx })) });
      this.banner(this.place ? esc(this.place.text) : "Battle", `Waiting for ${esc(foe.name || "the other side")} to take the field…`);
      UI.fadeNow(1); UI.fade(0, 1.2);
      this.waitT = setTimeout(() => { if (G.arena === this && !this.round) this.finish(true, true); }, 90000);
    } else if (this.remote) { this.net.send({ t: "bready" }); this.beginRound(); }
    else this.beginRound();
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
    return this.units.filter(u => this.alOf(u.team) !== 0 && u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 6).map(u => ({ ...u.view(), duel: u.T === this.you ? G.player : null }));
  }
  // ---- the sides ----
  // (a unit's team is its company; its side, the companies it fights with — in any battle but a custom one, the same)
  alOf(team) { return this.cos ? (this.cos[team] ? this.cos[team].al : 1) : team; }
  enemiesOf(team) {
    const al = this.alOf(team), out = this.units.filter(u => u.alive && this.alOf(u.team) !== al);
    if (al !== 0 && this.you.alive) out.push(this.you);
    return out;
  }
  // (every man on a side, every company of it)
  sideOf(al) { return this.units.filter(u => u.alive && this.alOf(u.team) === al); }
  alliesOf(team) { return this.units.filter(u => u.alive && u.team === team); }
  // (worth showing you: the hints about a head-shot only if it's near enough to be your doing)
  youCanSee(u) { return Math.hypot(u.pos.x - G.player.pos.x, u.pos.z - G.player.pos.z) < 60; }
  hearable(p) { return Math.hypot(p.x - G.player.pos.x, p.z - G.player.pos.z) < 70; }
  // the orders a man is under: his own arm's, if it's been given some of its own — else the company's
  orderOf(u) {
    if (!this.orders) return null;
    const S = !u.crewOf && this.sub && this.sub[u.team], g = S && groupOf(u);
    return (g && S[g]) || this.orders[u.team];
  }
  // every set of orders a side is under (the company's, and its arms')
  ordersOf(team) { return [this.orders[team], ...Object.values((this.sub && this.sub[team]) || {})]; }
  // a man's place in his company: in the formation his officer has set, round where it's to be, facing the other side
  slotFor(u) {
    if (u.crewOf) return this.field.station(u.crewOf, u.crewIdx);
    const O = this.orderOf(u), mates = this.alliesOf(u.team).filter(m => !m.crewOf && this.orderOf(m) === O).sort((a, b) => a.idx - b.idx), i = Math.max(0, mates.indexOf(u)), n = mates.length;
    // (an arm following on its own: a few paces further back than the company, each arm its own rows)
    const S = this.sub && this.sub[u.team], back = O === this.orders[u.team] || !S ? 0 : 3.4 * (1 + Object.keys(S).sort().indexOf(groupOf(u)));
    const foes = this.enemiesOf(u.team);
    const cx = foes.length ? foes.reduce((a, f) => a + f.pos.x, 0) / foes.length : C.x + (u.team === 0 ? 1 : -1) * 10;
    const cz = foes.length ? foes.reduce((a, f) => a + f.pos.z, 0) / foes.length : C.z;
    let anchor;
    if (u.team === 0 && O.mode === "follow" && this.you.alive) { const pl = G.player, fw = pl.forward(); anchor = { x: pl.pos.x - fw.x * 2.4, z: pl.pos.z - fw.z * 2.4 }; }
    else if (u.team === 1 && O.mode === "follow" && this.netFoe && this.netFoe.alive) { const f = this.netFoe, y = f.a.yaw; anchor = { x: f.pos.x - Math.sin(y) * 2.4, z: f.pos.z - Math.cos(y) * 2.4 }; }
    else anchor = O.at || this.spawns[u.team];
    const face = Math.atan2(cx - anchor.x, cz - anchor.z);
    // (an arm sent to the same ground as the rest — or following you with them — forms its own rows behind theirs)
    if (back) { const M = this.orders[u.team], same = O.mode === "follow" ? M.mode === "follow" : M.mode !== "follow" && M.at && Math.hypot(M.at.x - anchor.x, M.at.z - anchor.z) < 4; if (same) anchor = { x: anchor.x - Math.sin(face) * back, z: anchor.z - Math.cos(face) * back }; }
    const p = O.slot(i, n, anchor, face);
    // (never out past the trees)
    const dx = p.x - C.x, dz = p.z - C.z, d = Math.hypot(dx, dz), lim = this.bound - 3;
    if (d > lim) { p.x = C.x + dx / d * lim; p.z = C.z + dz / d * lim; }
    return p;
  }
  // a man down: the duel's round, or the battle's tally
  unitDown(u) {
    if (!this.multi) { this.endRound(0); return; }
    // (the men round him see him fall: the nearer, the more it shakes them)
    if (!this.remote) for (const m of this.units) if (m !== u && m.alive && m.nerve != null && m.team === u.team) { const d = Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z); if (d < 14) m.shaken((0.09 - d * 0.004)); }
    if (this.host && !u.isNet) this.net.send({ t: "bdown", id: u.uid, x: +(u.fromX ?? u.pos.x).toFixed(1), z: +(u.fromZ ?? u.pos.z).toFixed(1), h: u.headShot ? 1 : 0, b: u.blastDown ? 1 : 0 });
    if (this.alOf(u.team) !== 0) this.killed = (this.killed || 0) + 1; else this.lost = (this.lost || 0) + 1;
    if (this.book) this.book.update(this.bookState());
    if (this.orders) for (const O of this.ordersOf(0)) if (O.target === u) O.target = null;
    this.showHud();
    this.checkEnd();
  }
  // "on me!": the men of a company running near their officer, called back — steadied by the voice, and the ones that
  // have it in them back in the ranks (how many)
  rally(team, at) {
    let n = 0;
    // (a call that's only worth so much: once in a while, not with every breath)
    (this.rallyAt ||= {}); if (G.time - (this.rallyAt[team] ?? -99) < 8) return 0; this.rallyAt[team] = G.time;
    for (const u of this.alliesOf(team)) {
      if (!u.routing || Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 22) continue;
      u.nerve = Math.min(1, (u.nerve || 0) + 0.55 * Math.min(1.2, u.brave || 1));
      if (u.nerve > 0.42) { u.routing = false; u.a.person.crouching = false; u.a.path = []; u.hold(u.lo.long !== "none" ? u.lo.long : u.steel()); n++; }
    }
    if (n) this.showHud();
    return n;
  }
  // a man breaks: and when a company's breaking — a third of it running — word of it, and maybe the end of it
  broke(u) {
    this.showHud();
    const co = this.alliesOf(u.team), run = co.filter(m => m.routing).length;
    (this.brokeTold ||= {});
    if (run >= Math.max(2, co.length * 0.34) && !this.brokeTold[u.team]) {
      this.brokeTold[u.team] = true;
      const U = this.coUni && this.coUni[u.team] || (this.uni && this.uni[this.alOf(u.team)]);
      UI.hint(this.alOf(u.team) === 0 ? `Your ${U ? U.name + " " : ""}men are breaking! Get among them and give 1 — On me! — to rally them` : `The ${U ? U.name + " " : ""}line is breaking!`, 4);
    }
    this.checkEnd();
  }
  // it's over: every man stands where he is, steel down — nobody goes on striking at the fallen
  standDown() {
    for (const u of this.units) { if (!u.alive) continue; u.wind = 0; u.aimUp && u.aimUp(false); const P = u.a.person; P.crouching = false; P.load = null; P.setPose("idle"); u.a.path = []; }
  }
  // (the first minute of a battle: every company holds, whatever happens to it)
  steadyNow() { return !!this.battle && this.liveAt != null && G.time - this.liveAt < 60; }
  checkEnd() {
    if (this.over || this.ended || this.remote) return;
    // (over when your side's gone, or it's the only one left standing — of two sides or of four)
    // (a side whose every man left is running counts as beaten: the field is the other's)
    const standing = new Set(this.units.filter(u => u.alive && !u.routing).map(u => this.alOf(u.team))); if (this.you.alive) standing.add(0);
    const ours = standing.has(0) ? 1 : 0, theirs = [...standing].filter(a => a !== 0).length;
    if (!theirs || !ours) {
      this.ended = true; this.live = false;
      const won = !theirs;
      if (this.host) this.net.send({ t: "bend", winner: won ? 0 : 1, k: this.killed || 0, l: this.lost || 0 });
      this.standDown();
      slowMo(1.6, 0.3);
      // (won because the last of them broke and ran: said so)
      const fled = won ? this.units.filter(u => u.alive && u.routing && this.alOf(u.team) !== 0).length : this.units.filter(u => u.alive && u.routing && this.alOf(u.team) === 0).length;
      this.routEnd = fled > 0;
      this.banner(won ? (fled ? "They break and run!" : "The field is yours") : (fled ? "Your men break and run" : "The day is lost"), won ? `${this.killed || 0} of theirs down${fled ? `, ${fled} fleeing` : ""}` : "");
      setTimeout(() => G.arena === this && this.afterBattle(won), 2600);
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
    // (a custom battle: every company facing the middle of the field — straight across it, two sides; in at its
    //  centre, more)
    const N = this.custom ? this.custom.length : 2, toward = at => !this.custom ? null : N === 2 ? { x: C.x, z: at.z } : { x: C.x, z: C.z };
    const face0 = this.custom ? Math.atan2(toward(mine).x - mine.x, toward(mine).z - mine.z) : Math.atan2(theirs.x - mine.x, theirs.z - mine.z), face1 = face0 + Math.PI;
    const O0 = this.orders[0], O1 = this.orders[1];
    this.sub = null; this.sel = null;
    O0.mode = "follow"; O0.at = null; O1.mode = "hold"; O1.at = { x: theirs.x, z: theirs.z };
    // (holding your fort: your company on its front wall from the start)
    if (this.fortSide === 0 || (this.siege && this.siege.side === 0)) { O0.mode = "hold"; O0.at = { x: mine.x, z: mine.z }; }
    // (in the saddle, if you're riding into it)
    if (this.battle && riding()) { if (!pl.horse) pl.mount(); } else if (pl.horse) pl.dismount();
    // (a pace before the line where there are works ahead, so the battery's gabions are a few paces off and not in your face)
    // (on a town's wall walk, though: where the company stands, back from the parapet — not in it with your face to the stone)
    const lead0 = this.siege && this.siege.side === 0 ? 0 : this.battle && this.fortSide == null && !this.siege ? 1 : 3;
    pl.place(mine.x + Math.sin(face0) * lead0, mine.z + Math.cos(face0) * lead0, face0 + Math.PI);
    const placing = this.custom ? this.cos.map((c, co) => { const at = this.spawns[co], tw = toward(at), O = this.orders[co]; if (co) { O.mode = "hold"; O.at = { x: at.x, z: at.z }; } return [co, at, Math.atan2(tw.x - at.x, tw.z - at.z), O, tw]; })
      : [[0, mine, face0, O0, theirs], [1, theirs, face1, O1, mine]];
    for (const [team, at, face, O, look] of placing) {
      const list = this.alliesOf(team).filter(u => !u.crewOf).sort((a, b) => a.idx - b.idx);
      list.forEach((u, i) => { const p = this.clearSpot(...Object.values(O.slot(i, list.length, at, face))); u.reset(p, look); });
      for (const u of this.alliesOf(team).filter(u => u.crewOf)) u.reset(this.field.station(u.crewOf, u.crewIdx), look);
    }
    this.cmds = [];
    pl.swingRate = BLADE[this.lo.blade].rate; G.loadMul = loadMul(this.lo);
    this.takeUp(this.lo.long !== "none" ? this.lo.long : this.lo.side === "pistol" ? "pistol" : this.lo.blade);
    G.lockMove = true;
    // (their officer: how long he'll hold his ground before he comes on)
    this.holdFor = this.fortSide === 1 ? Infinity : this.hist && this.hist.cos[1].hold != null ? this.hist.cos[1].hold * (0.8 + Math.random() * 0.4) : this.fortSide === 0 ? 4 + Math.random() * 5 : this.battle ? 15 + Math.random() * 15 : 3 + Math.random() * 5; this.cmdT = 0; this.volT = this.battle ? 3.5 + Math.random() * 3 : 10 + Math.random() * 6;   // (the first volley soon: nobody stands loaded under fire)
    this.showHud();
    const allies = this.sideOf(0).length, foes = this.enemiesOf(0).length - 0;
    // (first, where your company stands: the field from above, and yours to place — then the opening, and the word)
    const open = () => {
      UI.fadeNow(1); UI.fade(0, 1.2);
      // the opening: the field from the air, each side in its ranks, the ground, and down into your own eyes (a battle
      // only; a skirmish in the woods goes straight to it)
      const lead = this.battle && !window.__noIntro ? this.intro() : 0;
      const say = () => {
        this.banner(this.place ? esc(this.place.text) : this.battle ? "Battle" : "Skirmish",
          `${this.custom ? `${sidesWord(this.custom)} · ` : ""}${allies ? `${allies} with you` : "On your own"} · ${foes} against you${this.place ? ` · ${this.place.at}` : ""}${allies || this.battle ? " · the numbers are your orders" : ""}`);
        // (your guns: yours to work, if you want them — said once a battle, after the opening)
        if (this.field && !this.remote && this.field.guns.some(g => g.side === 0 && !g.dead)) setTimeout(() => G.arena === this && !this.gunMan && UI.hint(`Your guns stand ${this.siege && this.siege.side === 0 ? "in the embrasures along the wall" : "behind the gabions"}. Go to one and press F to take it: lay it with your eye and fire it yourself.`, 6), 9000);
        // (a fort against a player: why it's theirs or yours, so it doesn't look like a coin that fell the other way)
        if (this.netBattle && this.fortSide != null) setTimeout(() => G.arena === this && UI.hint(this.fortSide === 0 ? "You hold the fort: your company's the smaller, so you have the walls to make up the numbers. Hold them." : "They hold the fort: theirs is the smaller company, so they have the walls to make up the numbers. Take it.", 7), 900);
      };
      if (!lead) say();
      const steps = ["3", "2", "1"], base = lead ? 600 : 2600;
      // (the countdown, after the opening — or at once, if the opening's skipped where nobody else is waiting on it)
      const go = this.countdown = () => {
        if (this.counting) return; this.counting = true; clearTimeout(this.goT);
        if (lead) say();
        this.rec && this.rec.begin();
        steps.forEach((t, i) => setTimeout(() => { if (G.arena === this && !this.live && !this.over) { this.banner(t, ""); } }, base + i * 800));
        setTimeout(() => this.forward(allies), base + steps.length * 800);
      };
      this.counting = false;
      if (lead) this.goT = setTimeout(go, lead * 1000); else go();
    };
    if (this.canDeploy()) this.autoDeploy();
    open();
  }
  // ---- deployment: your company put on the best ground near where it starts, by its officer, before the opening ----
  // (any battle of companies against bots — not one where you hold a fort, whose wall is your men's place; and not one
  //  against a player, whose field the host keeps as it was set)
  // (not for the side holding a fort or a walled town: its place is on its walls, not the best ground round about —
  //  which in a town is in among the houses)
  canDeploy() { return this.battle && !this.net && this.fortSide !== 0 && !(this.siege && this.siege.side === 0) && !this.over; }
  // the ground he picks: a little higher if there's height to have, with cover near to hand, out of the water, and no
  // nearer the enemy than where you started — looked over in a ring round your starting place
  autoDeploy() {
    const home = { ...this.spawns[0] }, w = this.w, R = 18;
    const foes = this.enemiesOf(0).filter(u => !u.crewOf && u !== this.you), fc = foes.length ? { x: foes.reduce((a, u) => a + u.pos.x, 0) / foes.length, z: foes.reduce((a, u) => a + u.pos.z, 0) / foes.length } : { x: C.x, z: C.z };
    const d0 = Math.hypot(fc.x - home.x, fc.z - home.z), h0 = w.heightAt(home.x, home.z), spots = (this.field && this.field.spots && this.field.spots[0]) || [];
    const score = (x, z) => {
      if (w.waterDepth && w.waterDepth(x, z) > 0.2) return -Infinity;
      if (Math.hypot(x - C.x, z - C.z) > this.bound - 10) return -Infinity;
      const toFoe = Math.hypot(fc.x - x, fc.z - z); if (toFoe < d0 - 4) return -Infinity;
      const cover = spots.filter(q => Math.hypot(q.x - x, q.z - z) < 10).length;
      return (w.heightAt(x, z) - h0) * 1.2 + Math.min(cover, 6) * 0.6 - Math.hypot(x - home.x, z - home.z) * 0.05;
    };
    let best = home, bs = score(home.x, home.z);
    for (let r = 4; r <= R; r += 4) for (let a = 0; a < 6.28; a += 0.5) { const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r, sc = score(x, z); if (sc > bs + 0.3) { bs = sc; best = { x, z }; } }
    if (best !== home) this.placeCo(0, this.clearSpot(best.x, best.z));
  }
  // a company stood in its ranks round a place, facing the other side — and you before it, if it's yours
  placeCo(team, p) {
    const foes = this.enemiesOf(team).filter(u => !u.crewOf), fc = foes.length ? { x: foes.reduce((a, u) => a + u.pos.x, 0) / foes.length, z: foes.reduce((a, u) => a + u.pos.z, 0) / foes.length } : { x: C.x, z: C.z };
    const face = Math.atan2(fc.x - p.x, fc.z - p.z), O = this.orders[team];
    const list = this.alliesOf(team).filter(u => !u.crewOf).sort((a, b) => a.idx - b.idx);
    list.forEach((u, i) => { const q = this.clearSpot(...Object.values(O.slot(i, list.length, p, face))); u.reset(q, fc); });
    this.spawns[team] = { x: p.x, z: p.z };
    if (O.mode === "hold") O.at = { x: p.x, z: p.z };
    if (team === 0) G.player.place(p.x + Math.sin(face) * 3, p.z + Math.cos(face) * 3, face + Math.PI);
  }
  forward(allies) {
    {
      if (G.arena !== this || this.over) return;
      this.rec && this.rec.push("F");
      this.banner(this.battle ? "Forward!" : "Fight!", ""); G.lockMove = false; this.live = true; this.liveAt = G.time;
      if (this.battle) AUDIO.drumRoll && AUDIO.drumRoll(1.8, 0.28);   // (the side drum, beating the advance)
      for (const u of this.units) u.go();
      AUDIO.voice && AUDIO.voice("war", { high: G.who === "sister", vol: 0.7 });
      setTimeout(() => G.arena === this && this.banner(null), 1000);
      if (this.book && (allies || this.battle)) { this.book.show(this.bookState()); if (!this.toldBook) { this.toldBook = true; setTimeout(() => G.arena === this && UI.hint("1–0: orders · wheel: weapon" + (this.canBayonet() ? " · F: bayonet" : "") + (this.groupsHere().length > 1 ? " · " + this.groupsHere().map(g => g.key.slice(3)).join(" ") + ": one arm alone" : ""), 6), 2200); } }
    }
  }
  // ---- the assault on a walled town: which side of the wall a man is, the ways in, and the ladders ----
  outside(p) { const W = this.siege && this.siege.wall; return !!W && (p.x - W.ox) * W.ux < W.faceU - 0.3; }
  // (an open way in, nearest to him: a breach the guns made, a tower brought down, the gate hacked open)
  openWay(p) {
    const W = this.siege && this.siege.wall; if (!W || !this.field) return null;
    let best = null, bd = Infinity;
    for (const b of this.field.breaks) {
      if (!b.down) continue;
      const d = Math.abs(b.z - p.z) + Math.abs(b.x - p.x) * 0.3; if (d >= bd) continue;
      bd = d; const deep = b.kind === "tower" ? 7 : 5;
      best = { out: { x: b.x - W.ux * 3.2, z: b.z }, inn: { x: b.x + W.ux * deep, z: b.z }, b };
    }
    return best;
  }
  // a ladder set up against the wall: swung up off the ground by the men at its foot
  plantLadder(L) {
    if (L.up || L.fallT > 0) return;
    // (its foot on the ground where it stands; its head on that length of wall's parapet, as high as the guns have left it)
    L.footY = this.w.heightAt(L.out.x, L.out.z);
    const wb = this.field && this.field.breaks.find(b => !b.gate && Math.abs(b.z - L.top.z) < b.hd && Math.abs(b.x - L.top.x) < b.hw + 1); if (wb) L.topY = wb.top;
    const len = Math.hypot(L.top.x - L.out.x, L.top.z - L.out.z, L.topY + 0.3 - L.footY) + 1.1;   // (its head standing up over the parapet, as a scaling ladder's did)
    L.mesh = makeLadder(len); L.mesh.position.set(L.out.x, L.footY, L.out.z); this.w.root.add(L.mesh);
    L.up = true; L.raise = 0; L.push = 0; L.busy = 0; L.raiseT = 0;
    FOLEY.thunk && FOLEY.thunk({ x: L.top.x, z: L.top.z }, 0.5);
    // (you can go up it too)
    if (this.w.addInteract && !L.it) L.it = this.w.addInteract({ x: L.out.x, y: L.footY + 1.2, z: L.out.z, reach: 2.4, hold: 1.2, anim: "reach",
      can: () => L.up && L.raise >= 1 && !(L.fallT > 0) && this.live && this.you.alive && this.alOf(0) !== this.siege.side,
      label: "Climb the ladder, onto the wall",
      use: () => { const pl = G.player, y = this.w.heightAt(L.inn.x, L.inn.z); pl.pos.set(L.inn.x, y + 0.05, L.inn.z); pl.vy = 0; FOLEY.ladder && FOLEY.ladder(0.6); } });
  }
  // the ladder's lean: from lying out on the ground (0) to against the parapet (1)
  leanLadder(L, k) {
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(L.top.x - L.out.x, L.topY + 0.3 - L.footY, L.top.z - L.out.z).normalize();
    const flat = new THREE.Vector3(L.out.x - L.top.x, 0.05, L.out.z - L.top.z).normalize();
    const q0 = new THREE.Quaternion().setFromUnitVectors(up, flat), q1 = new THREE.Quaternion().setFromUnitVectors(up, dir);
    L.mesh.quaternion.copy(q0).slerp(q1, Math.max(0, Math.min(1, k)));
  }
  ladderTick(dt) {
    const S = this.siege;
    // (a man killed on the rungs: down off it)
    for (const u of this.units) if (u.climb && !u.alive) { u.climb = null; u.a.yOff = 0; }
    for (const L of S.ladders) {
      if (!L.mesh) continue;
      if (L.fallT > 0) {
        L.fallT -= dt; this.leanLadder(L, L.fallT / 1.2);
        if (L.fallT <= 0) { this.w.root.remove(L.mesh); L.mesh = null; L.up = false; L.raise = 0; L.raiseT = -4; }
        continue;
      }
      if (L.raise < 1) { L.raise = Math.min(1, L.raise + dt / 1.1); this.leanLadder(L, L.raise * L.raise * (3 - 2 * L.raise)); }
      L.busy = Math.max(0, (L.busy || 0) - dt);
      // the defenders at its head: two or three seconds of heaving with their pikes and shoulders, and over it goes
      const at = this.units.filter(u => u.alive && !u.routing && u.al === S.side && !u.climb && Math.hypot(u.pos.x - L.inn.x, u.pos.z - L.inn.z) < 3.4).length
        + (this.alOf(0) === S.side && this.you.alive && Math.hypot(G.player.pos.x - L.inn.x, G.player.pos.z - L.inn.z) < 3 ? 2 : 0);
      L.push = at ? (L.push || 0) + dt * Math.min(2, at) : Math.max(0, (L.push || 0) - dt * 0.5);
      if (L.push > 3.2) {
        L.fallT = 1.2; L.push = 0;
        FOLEY.crash && FOLEY.crash(0.5, { x: L.out.x, z: L.out.z });
        for (const u of this.units) if (u.climb && u.climb.L === L) u.fall();
        if (this.alOf(0) !== S.side && Math.hypot(G.player.pos.x - L.out.x, G.player.pos.z - L.out.z) < 30) UI.hint("They've thrown a ladder down!", 2);
      }
    }
  }
  // ---- a palisade: each length of it can be set alight from outside — by you (hold the use key at it) or by the men
  //  of the attacking side who come up to it — and burns through in twenty seconds or so, the logs going down to
  //  charred stumps and leaving a way in. The defenders inside can't put it out once it's well alight ----
  palisadeSetup() {
    const P = this.palisade;
    this.torchT = 6;
    for (const b of P) {
      if (!this.w.addInteract || !b.out) continue;
      b.it = this.w.addInteract({ x: b.out.x, y: this.w.heightAt(b.out.x, b.out.z) + 1.2, z: b.out.z, reach: 3.2, hold: 1.4, anim: "reach",
        can: () => this.live && this.you.alive && !b.down && !b.fire && this.alOf(0) !== P.side,
        label: "Set the palisade alight", use: () => this.torch(b, true) });
    }
  }
  // (something to be used — a palisade to fire, a ladder, a gate — within reach of you, looked at or not)
  useNear() {
    const w = this.w, p = G.player; if (!w || !w.interact || !p) return false;
    return w.interact.some(it => it.x != null && (!it.can || it.can()) && Math.hypot(it.x - p.pos.x, it.z - p.pos.z) < (it.reach ?? 2.3) + 1);
  }
  torch(b, mine = false, quiet = false) {
    if (b.fire || b.down || !this.field) return;
    if (mine) this.usedT = G.time;
    b.fire = { t: 0, fl: [], puff: 0 };
    // the flames along the face of it, each at its own height up the logs — the fire takes at the foot and climbs,
    // a flame catching as it comes up to it (each with its height up the wall, and when it catches)
    const n = Math.max(5, Math.min(8, Math.round(b.pts.length / 2.2)));
    const ox = b.out.x - b.x, oz = b.out.z - b.z, ol = Math.hypot(ox, oz) || 1;
    for (let i = 0; i < n; i++) {
      const p = b.pts[Math.min(b.pts.length - 1, Math.floor((i + 0.2 + Math.random() * 0.6) / n * b.pts.length))];
      const big = i % 2 === 1, fl = makeFlame(big ? 1.8 : 1.3 + Math.random() * 0.3, null);
      const fx = p.x + ox / ol * 0.28, fz = p.z + oz / ol * 0.28;
      fl.position.set(fx, this.w.heightAt(fx, fz) + 0.1, fz); fl.visible = false;
      fl.userData.up = (i * 0.37 % 1) * 1.6;          // how far up the logs it burns, at the full of it
      fl.userData.at = (i * 0.61 % 1) * 6;            // the seconds before it catches
      this.field.root.add(fl); (this.field.flames ||= []).push(fl); b.fire.fl.push(fl);
    }
    // the logs of this length their own stuff now: blackening as they burn, and glowing at the cracks
    const mats = new Map();
    b.grp.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) { let m = mats.get(o.material); if (!m) { m = o.material.clone(); m.userData = { ...o.material.userData }; if (m.color) m.userData.c0 = m.color.clone(); mats.set(o.material, m); } o.material = m; } });
    b.fire.mats = [...mats.values()];
    b.fire.y0 = b.top - 4.1; b.fire.sink = 0;
    FOLEY.play("fire", { vol: 0.55, at: { x: b.x, z: b.z }, reach: 70 });
    if (mine) UI.hint("The palisade's alight. Stand clear: it'll burn through in a little while.", 3);
    else if (!quiet && Math.hypot(G.player.pos.x - b.x, G.player.pos.z - b.z) < 60) UI.hint(this.alOf(0) === this.palisade.side ? "They've fired the palisade!" : "Our men have fired the palisade!", 2.5);
  }
  palisadeTick(dt) {
    const P = this.palisade;
    // the firelight: two lights, made once and moved to the burning lengths nearest you. A light of its own for every
    // length that caught changed how many lights the scene had — every lit thing's shader built again each time the
    // fire spread, and each one more cost for every pixel — and the picture all but stopped
    if (!this.palLights && this.field) { this.palLights = [0, 1].map(() => { const L = new THREE.PointLight(0xff8a3a, 0, 24, 1.6); this.field.root.add(L); return L; }); }
    if (this.palLights) {
      const pp = G.player.pos, lit = P.filter(b => b.fire && (!b.down || b.fire.t - b.fire.downAt < 8)).sort((a, c) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(c.x - pp.x, c.z - pp.z));
      this.palLights.forEach((L, i) => { const b = lit[i]; if (!b) { L.intensity = 0; return; } const F = b.fire, k = Math.min(1, F.t / 9), out = b.down ? Math.max(0, 1 - (F.t - F.downAt) / 8) : 1; L.position.set(b.out.x, this.w.heightAt(b.out.x, b.out.z) + 1.5 + 1.2 * k, b.out.z); L.intensity = 6 * (0.4 + 0.6 * k) * out * (0.85 + Math.random() * 0.3); });
    }
    // (the attacker told, once the fighting's begun, what a palisade's for)
    if (!this.toldPal && this.live && this.clock > 3 && this.alOf(0) !== P.side) { this.toldPal = true; UI.hint("Their town stands behind a palisade. Hold F at a length of it to set it alight. Your men will fire any they reach.", 6); }
    for (const b of P) {
      const F = b.fire; if (!F) continue;
      F.t += dt;
      // (the fire climbs the logs as it takes: small at their foot, then up the whole height of them)
      const k = Math.min(1, F.t / 9), out = b.down ? Math.max(0, 1 - (F.t - F.downAt) / 8) : 1, burnt = 1 - Math.max(0, b.hp) / b.max;
      for (const fl of F.fl) {
        const u = fl.userData, c = Math.min(1, Math.max(0, (F.t - u.at) / 3));          // (caught, and taking)
        fl.scale.setScalar((0.5 + 1.1 * c) * (0.8 + 0.6 * k) * out);
        fl.position.y = this.w.heightAt(fl.position.x, fl.position.z) + 0.1 + (b.down ? 0 : u.up * c * (1 - F.sink * 0.8));
        fl.visible = c > 0.02 && out > 0.02;
      }
      // the logs blackened as it goes, from their own colour down to char, and the embers in them glowing and dimming
      if (F.mats) for (const m of F.mats) { if (m.color && m.userData.c0) m.color.copy(m.userData.c0).lerp(CHAR, Math.min(1, k * 0.5 + burnt * 0.9));
        if (m.emissive) { m.emissive.setRGB(1, 0.3, 0.05); m.emissiveIntensity = (b.down ? 0 : 0.012 + 0.05 * k * (0.7 + 0.3 * Math.sin(F.t * 7 + b.x))) * (0.5 + burnt * 0.5); } }
      // (and burning down: the wall lower as the tops go, a third of it before it falls)
      if (!b.down) { F.sink = burnt * 0.35; b.grp.scale.y = 1 - F.sink; b.grp.position.y = F.y0 * F.sink; }
      if ((F.puff -= dt) <= 0 && out > 0.1 && Math.hypot(G.player.pos.x - b.x, G.player.pos.z - b.z) < 160) { F.puff = 0.6; const p = b.pts[Math.floor(Math.random() * b.pts.length)]; this.field.smoke(p.x, this.w.heightAt(p.x, p.z) + 3 + 2 * k, p.z); }
      // (well alight, the fire takes in the lengths either side, now and then)
      if (!F.spread && F.t > 11) { F.spread = true; for (const q of P) if (q !== b && !q.fire && !q.down && Math.hypot(q.x - b.x, q.z - b.z) < 6.8 && Math.random() < 0.35) this.torch(q, false, true); }
      if (b.down) continue;
      b.hp -= dt * b.max / 22;
      if (b.hp < b.max * 0.5 && !b.half) { b.half = true; b.col.y1 -= 1.6; b.top -= 1.6; }
      if (b.hp <= 0) {
        b.down = true; F.downAt = F.t; b.grp.visible = false; b.rub.visible = true; b.col.disabled = true;
        FOLEY.crash && FOLEY.crash(0.55, { x: b.x, z: b.z });
        if (Math.hypot(G.player.pos.x - b.x, G.player.pos.z - b.z) < 70) UI.hint("The palisade's burnt through: a way in!", 3);
      }
    }
    // (the attackers' own firebrands: a man of theirs come up against an unburnt length sets it going)
    if (!this.live || (this.torchT -= dt) > 0) return;
    this.torchT = 1.2;
    for (const u of this.units) {
      if (!u.alive || u.routing || u.al === P.side || u.crewOf || Math.random() > 0.2) continue;
      const b = P.find(q => !q.down && !q.fire && Math.hypot(u.pos.x - q.out.x, u.pos.z - q.out.z) < 3.6);
      if (b) { this.torch(b); break; }
    }
  }
  // every frame of it: the men, the officer over there, the guns and their shot, your marks on the ground
  updateField(dt) {
    for (const u of this.units) u.tick(dt);
    if (this.siege && this.siege.ladders && this.live) this.ladderTick(dt);
    if (this.palisade && this.field) this.palisadeTick(dt);
    // (a town's hearths: thin smoke from the longhouses' smoke holes, as it always rose)
    { const sm = this.things && this.things.smokes; if (sm && sm.length && this.field && (this.hearthT = (this.hearthT || 0) - dt) <= 0) { this.hearthT = 0.7; const q = sm[Math.floor(Math.random() * sm.length)]; this.field.smoke(q.x, q.y, q.z, true); } }
    // (the other player's game: one side gone, and no word from the host within a few seconds — ended here all the same)
    if (this.remote && this.live && !this.ended) {
      const ours = this.alliesOf(0).length + (this.you.alive ? 1 : 0), theirs = this.alliesOf(1).length;
      if (!ours || !theirs) { if ((this.noWordT = (this.noWordT || 0) + dt) > 5) net_end(this, theirs ? 0 : 1); } else this.noWordT = 0;
    }
    if (this.netBattle) { this.sendState(dt); if (this.host) this.sendSnap(dt); }
    stanceTick();
    if (this.live) { this.clock += dt; this.commander(dt); if ((this.recrewT = (this.recrewT || 0) - dt) <= 0) { this.recrewT = 1; this.recrew(); } }
    // (the guns fall silent when it's over, and between rounds)
    if (this.field) this.field.active = this.live && !this.over && !this.ended;
    // (on the other player's game the guns and their shot are only shown: what they hit, the host's game says)
    if (this.field) this.field.update(dt, this.remote ? [] : [...this.units, this.you], (u, from, v, dmg = 400) => {
      if (u === this.you) this.hurtMe(dmg, { pos: from });
      else { u.blast = dmg >= 60; u.damage(dmg, false, false, from); u.blast = false; }
    });
    for (const m of (this.marks ||= []).slice()) { m.t += dt; m.mesh.material.opacity = Math.max(0, 0.8 * (1 - m.t / 2.6)); m.mesh.scale.setScalar(1 + m.t * 0.25); if (m.t > 2.6) { this.w.root.remove(m.mesh); this.marks.splice(this.marks.indexOf(m), 1); } }
    // (dead and watching: your eye on one of your own still standing)
    if (this.watching) this.watchTick();
    this.drawHud();
  }
  // their officer: holds his ground at the works for a while (less if he's the stronger), then brings them on, a few
  // paces at a time, at your company; volleys when they're near enough; and, close, sends them in with the steel
  commander(dt) {
    if (this.netBattle) return;   // (the other company has its own commander: the other player)
    if (!this.custom) { this.command(1, this, dt); return; }
    // (a custom battle: every company but yours its own officer — your side's as well as the others')
    for (let co = 1; co < this.cos.length; co++) if (this.alliesOf(co).length) this.command(co, this.kOf(co), dt);
  }
  // an officer's own reckoning, company by company (in any battle but a custom one, the other side's, kept on the arena)
  kOf(co) {
    if (!this.custom) return this;
    return (this.cmds ||= [])[co] ||= { holdFor: this.cos[co].hold != null ? this.cos[co].hold * (0.8 + Math.random() * 0.4) : co && this.cos[co].al === 0 ? 4 + Math.random() * 6 : 12 + Math.random() * 14, cmdT: 0, volT: 3.5 + Math.random() * 3 };
  }
  // (whom he means to fight: the nearest company of another side — looked at again every few seconds, or when it's gone)
  foeCoOf(co, K, dt) {
    const al = this.alOf(co), cen = l => ({ x: l.reduce((s, u) => s + u.pos.x, 0) / l.length, z: l.reduce((s, u) => s + u.pos.z, 0) / l.length });
    const members = c => this.alliesOf(c).concat(c === 0 && this.you.alive ? [this.you] : []);
    if (K.foeCo != null && (K.foeT -= dt) > 0 && members(K.foeCo).length) return K.foeCo;
    const mine = this.alliesOf(co); if (!mine.length) return null;
    const me = cen(mine); let best = null, bd = Infinity;
    for (let c = 0; c < this.cos.length; c++) { if (this.cos[c].al === al) continue; const l = members(c); if (!l.length) continue; const p = cen(l), d = Math.hypot(p.x - me.x, p.z - me.z) * (c === K.foeCo ? 0.8 : 1); if (d < bd) { bd = d; best = c; } }
    K.foeT = 5; K.foeCo = best; return best;
  }
  command(co, K, dt) {
    const O = this.orders[co], t = G.time - this.liveAt;
    const fc = this.custom ? this.foeCoOf(co, K, dt) : 0; if (fc == null) return;
    const theirs = this.alliesOf(co), ours = this.alliesOf(fc).concat(fc === 0 && this.you.alive ? [this.you] : []);
    if (!theirs.length || !ours.length) return;
    const cen = l => ({ x: l.reduce((s, u) => s + u.pos.x, 0) / l.length, z: l.reduce((s, u) => s + u.pos.z, 0) / l.length });
    const a = cen(theirs), b = cen(ours), d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const shout = () => { const o = theirs[0]; AUDIO.voice && AUDIO.voice("war", { at: o.pos, vol: 0.9, high: isF(o.info.look) }); };
    // (horse coming at them: a seasoned officer forms square till it's past — and back into line after)
    { const horse = ours.filter(u => (u.isPlayer ? !!G.player.horse : u.mounted) && Math.hypot(u.pos.x - a.x, u.pos.z - a.z) < 24).length, gen0 = K.gen ?? generalship();
      if (horse >= 1 && gen0 > 0.4 && O.form !== "square" && !O.charge) { K.lineForm = O.form; O.form = "square"; shout(); }
      else if (!horse && O.form === "square" && K.lineForm !== undefined) { O.form = K.lineForm; K.lineForm = undefined; } }
    // (holding a fort: they stay on its wall and fire, volley as you come, and only go at you with the steel when you're
    //  inside it)
    if (this.fortSide === 1) {
      const F = this.field.fortAt, inFort = ours.some(u => (u.pos.x - F.front) * F.sx > -0.5 && (u.pos.x - F.back) * F.sx < 0.5 && Math.abs(u.pos.z - F.z) < F.W);
      O.charge = inFort;
      if ((K.volT -= dt) <= 0 && d < 80 && !O.charge) { K.volT = 9 + Math.random() * 6; O.volleyAt = G.time + 1.1; shout(); }
      return;
    }
    // (holding a palisaded town: they stay inside it, at the stakes, and loose and fire through the gaps as you come on;
    //  only once you're inside — by the way in, or a length burnt through — do they go at you with the club)
    if (this.palisade && this.alOf(co) === this.palisade.side) {
      const P = this.palisade, xs = P.map(q => q.x), zs = P.map(q => q.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const inside = u => u.pos.x > x0 - 0.5 && u.pos.x < x1 + 0.5 && u.pos.z > z0 - 0.5 && u.pos.z < z1 + 0.5;
      const front = P.find(q => q.front), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const breached = ours.some(inside);
      O.charge = breached; O.cover = !breached;
      if (!breached) { O.mode = "hold"; O.at = K.palAt ||= { x: cx + ((front ? front.x : cx) - cx) * 0.6, z: cz }; }
      if ((K.volT -= dt) <= 0 && d < 70 && !O.charge) { K.volT = 7 + Math.random() * 5; O.volleyAt = G.time + 1.1; O.fire = true; shout(); }
      return;
    }
    // his generalship, as your record has earned you an opponent: a green officer is rash — on at you and in with the
    // steel as soon as he's near; a seasoned one stands off at musket range and makes his volleys tell, holds behind
    // cover when he's the fewer, waits for your line to have fired before he charges it, and calls a charge off that's
    // going against him
    const gen = K.gen ??= generalship(), L = (x, y) => x + (y - x) * gen;
    const nT = theirs.length, nO = ours.length, ratio = nT / Math.max(1, nO);
    const loadedOf = l => { const m = l.filter(u => u.loaded); return m.length ? m.filter(u => u.loaded.long).length / m.length : 1; };
    const oursEmpty = 1 - loadedOf(ours), theirsLoaded = loadedOf(theirs), inRange = d < RANGE.musket * this.sight;
    const outnumbered = gen > 0.35 && ratio < 0.85;
    // (the line he means to come at: yours — or, with men to spare, the end of it that's thinnest, so his line overlaps
    //  yours there and folds round it)
    const px = -(b.z - a.z) / d, pz = (b.x - a.x) / d;
    if (K.flank === undefined || (K.flankT -= dt) <= 0) {
      K.flankT = 6; let l = 0, r = 0; for (const u of ours) ((u.pos.x - b.x) * px + (u.pos.z - b.z) * pz > 0 ? r++ : l++);
      K.flank = l === r ? (K.flank || 1) : r < l ? 1 : -1;
    }
    const lap = gen > 0.5 && ratio > 1.15 ? Math.min(14, (nT - nO) * 1.1) * gen : 0, tgt = { x: b.x + px * lap * K.flank, z: b.z + pz * lap * K.flank };
    // (your charge coming on: he meets it with every loaded musket at a dozen paces — then the steel at it)
    const youCharge = !!this.orders[fc] && this.ordersOf(fc).some(o => o.charge);
    if (youCharge && !O.charge && gen > 0.4) {
      if (d < 26 && theirsLoaded > 0.4 && G.time - (K.metAt || -99) > 8) { K.metAt = G.time; O.volleyAt = G.time + 0.35; O.fire = true; shout(); }
      if (d < 11 || (K.metAt && G.time - K.metAt > 1.2 && d < 18)) { O.charge = true; O.cover = false; K.chargedAt = G.time; shout(); }
    }
    // (the fewer, and a head on him: he stays where he is, in cover, and lets you come on into his fire)
    if (O.mode === "hold") O.cover = outnumbered && !O.charge;
    if (O.mode === "hold" && !(outnumbered && d > 22) && (t > K.holdFor * (1 + gen) || ratio > 1.6 || d < 22)) { O.mode = "advance"; O.cover = false; O.at = O.at || { x: a.x, z: a.z }; K.adv = { march: true, until: G.time + 8 }; shout(); }
    // the advance, as the drill had it: a march of some paces, the line kept together — then, once in range, a halt and
    // a volley — and on again, until they're close enough for the steel
    if (O.mode === "advance" && (K.cmdT -= dt) <= 0) {
      K.cmdT = 2;
      const adv = K.adv ||= { march: true, until: G.time + 8 }, inRange = d < RANGE.musket * this.sight;
      if (G.time > adv.until) {
        // (the first volley held until it'll tell: the seasoned officer halts well inside a musket-shot, not at its end)
        const telling = d < RANGE.musket * this.sight * L(1, 0.6);
        adv.march = !adv.march || !telling; adv.until = G.time + (adv.march ? 7 + Math.random() * 3 : 5 + Math.random() * 2);
        if (!adv.march) { O.volleyAt = G.time + 0.9; shout(); }
      }
      if (adv.march) {
        // (on only as fast as the line keeps up: the men in their places, near enough)
        // (the middle man's distance from his place, not the mean: one man off after his own business doesn't hold a line)
        const men = theirs.filter(u => !u.crewOf && !u.isNet), gaps = men.map(u => { const p = this.slotFor(u); return Math.hypot(p.x - u.pos.x, p.z - u.pos.z); }).sort((x, y) => x - y), lag = gaps.length ? gaps[gaps.length >> 1] : 0;
        // (where he means to stand: close for the steel, if he's rash; at a good musket-shot, if he isn't)
        const keep = L(20, 34), from = O.at || a, dd = Math.hypot(tgt.x - from.x, tgt.z - from.z) || 1, step = lag < 5 ? Math.max(0, Math.min(dd - keep, 7)) : 0;
        O.at = { x: from.x + (tgt.x - from.x) / dd * step, z: from.z + (tgt.z - from.z) / dd * step };
      }
    }
    // the charge: when it's near enough, and worth it — the rash man's reasons, or the seasoned one's
    const chargeD = L(26, 38), needRatio = L(0.8, 1.4), patience = L(40, 160);
    const caught = gen > 0.25 && oursEmpty > L(0.9, 0.55) && ratio >= 0.85;   // (your line has just fired: in before it's loaded)
    // (or yours is all anyhow — strung out on the march, men off on their own — and his isn't)
    const spread = l => { const c = cen(l); return l.reduce((s2, u) => s2 + Math.hypot(u.pos.x - c.x, u.pos.z - c.z), 0) / l.length; };
    const broken = gen > 0.6 && nO > 3 && spread(ours) > spread(theirs) * 1.8 && ratio >= 0.9;
    if (!O.charge && d < chargeD && (ratio >= needRatio || caught || broken || nO <= 2 || t > K.holdFor + patience)) { O.charge = true; O.cover = false; K.chargedAt = G.time; shout(); }
    // (a charge going against him, called off — the men back to re-form at a musket-shot, and the firing taken up again)
    if (O.charge && gen > 0.45 && G.time - (K.chargedAt || 0) > 6 && ratio < L(0.5, 0.75) && nO > 2) {
      O.charge = false; O.mode = "advance"; const away = Math.hypot(a.x - b.x, a.z - b.z) || 1;
      O.at = { x: a.x + (a.x - b.x) / away * 14, z: a.z + (a.z - b.z) / away * 14 }; K.adv = { march: false, until: G.time + 8 }; K.cmdT = 8; shout();
    }
    // (taking losses where he stands: answered at once, with whatever's loaded)
    if (K.nWas != null && nT < K.nWas) K.hitAt = G.time; K.nWas = nT;
    if (K.hitAt && G.time - K.hitAt < 1.5 && !O.charge && d < RANGE.musket * this.sight + 10 && theirsLoaded > 0.3 && K.volT > 1.2) K.volT = 0.5 + Math.random() * 0.6;
    // the volleys: on a clock, if he's rash; when his men are loaded and you're in range, if he isn't
    if ((K.volT -= dt) <= 0 && d < 80 && !O.charge) {
      if (gen < 0.3 || (theirsLoaded > 0.7 && inRange)) { K.volT = L(11, 6) + Math.random() * L(8, 3); O.volleyAt = G.time + 1.1; shout(); }
      else K.volT = 1;
    }
  }
  // your blade in the press: the nearest of theirs in reach, in front of you
  swingAt() {
    const pl = G.player, B = this.myBlade(), fwd = pl.forward();
    if (!this.live) return;
    let best = null, bd = Infinity;
    for (const u of this.enemiesOf(0)) {
      const dx = u.pos.x - pl.pos.x, dz = u.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > B.reach || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.45) continue;
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) return;
    AUDIO.chop ? AUDIO.chop() : FOLEY.chop(best.pos, 0.7); G.impact && G.impact();
    best.youHitAt = G.time; best.youHitPos = chestOf(best.a);
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
  takeOver(given = null) {
    if (G.arena !== this || this.over || this.ended) return;
    const mates = this.alliesOf(0).filter(u => !u.isNet);
    if (mates.length < TAKE_OVER) { this.fallInBattleWatch(); return; }
    // (against a player, the host's game says whose place: asked, and done when it answers)
    if (this.remote && !given) { this.net.send({ t: "btake" }); return; }
    if (given) {
      const pl = G.player; UI.fadeNow(1); UI.fade(0, 0.9);
      this.rise(); this.watching = false;
      G.downed = false; G.health = 1; G.stamina = 1; G.hurtT = 0; G.lockMove = false; pl.frozen = false;
      pl.gunSaved = {}; pl.gunLoaded = true; pl.gunReload = 0; pl.xspan = 1;
      const th = this.enemiesOf(0)[0] ? this.enemiesOf(0)[0].pos : this.spawns[1];
      pl.place(given.x, given.z, Math.atan2(-(th.x - given.x), -(th.z - given.z)));
      this.takeUp(this.lo.long !== "none" ? this.lo.long : this.lo.side === "pistol" ? "pistol" : this.lo.blade);
      this.net.send({ t: "dhp", hp: HP, r: this.round });
      this.showHud(); UI.hint(`Up — in his place. ${mates.length - 1} of your company still standing.`, 3);
      return;
    }
    const foes = this.enemiesOf(0), far = u => Math.min(...foes.map(f => Math.hypot(f.pos.x - u.pos.x, f.pos.z - u.pos.z)), 999);
    const u = mates.sort((a, b) => far(b) - far(a))[0], pl = G.player, at = { x: u.pos.x, z: u.pos.z }, was = { x: pl.pos.x, z: pl.pos.z };
    UI.fadeNow(1); UI.fade(0, 0.9);
    // (his body where yours lay: the fallen man is the one there now)
    u.quiet = true; u.hp = 0; u.a.place(was.x, was.z, u.a.yaw); u.fallDown(this.spawns[1]);
    this.units.splice(this.units.indexOf(u), 1); this.lost = (this.lost || 0) + 1;
    if (this.host) this.net.send({ t: "bgone", id: u.uid, x: +was.x.toFixed(1), z: +was.z.toFixed(1) });
    this.rise(); this.watching = false;
    G.downed = false; G.health = 1; G.stamina = 1; G.hurtT = 0; G.lockMove = false; pl.frozen = false;
    pl.gunSaved = {}; pl.gunLoaded = true; pl.gunReload = 0; pl.xspan = 1;
    const th = foes[0] ? foes[0].pos : this.spawns[1];
    pl.place(at.x, at.z, Math.atan2(-(th.x - at.x), -(th.z - at.z)));
    this.takeUp(this.lo.long !== "none" ? this.lo.long : this.lo.side === "pistol" ? "pistol" : this.lo.blade);
    this.showHud();
    UI.hint(`Up — in his place. ${mates.length - 1} of your company still standing.`, 3);
    if (this.netBattle) this.net.send({ t: "dhp", hp: HP, r: this.round });
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
    // (over his shoulder, a little above — and never under the ground: on a hillside the slope behind him rises, so the
    //  eye is lifted clear of it, and of the ground between it and him)
    G.deathCam = cam => {
      const p = u.pos, yaw = u.yaw, H = (x, z) => this.w.heightAt(x, z);
      const bx = p.x - Math.sin(yaw) * 5, bz = p.z - Math.cos(yaw) * 5, mx = (bx + p.x) / 2, mz = (bz + p.z) / 2;
      back.set(bx, Math.max(p.y + 2.8, H(bx, bz) + 1.8, H(mx, mz) + 1.6), bz);
      if (cam.position.distanceTo(back) > 30) cam.position.copy(back); else cam.position.lerp(back, 0.08);
      cam.position.y = Math.max(cam.position.y, H(cam.position.x, cam.position.z) + 1.4); cam.up.set(0, 1, 0);
      look.set(p.x + Math.sin(yaw) * 6, p.y + 1.3, p.z + Math.cos(yaw) * 6); cam.lookAt(look);
    };
  }
  // ---- the orders: the number keys, in the field ----
  bookState() { const O = (this.sel && this.sub && this.sub[0][this.sel]) || this.orders[0], g = this.sel && GROUPS.find(g => g.id === this.sel); return { group: g ? g.name : null, groups: this.groupsHere(), uni: this.uni ? Object.keys(UNIFORMS).find(k => UNIFORMS[k] === ((this.coUni && this.coUni[0]) || this.uni[0])) : null, count: this.sel ? this.alliesOf(0).filter(u => !u.crewOf && groupOf(u) === this.sel).length : this.alliesOf(0).length, battle: this.battle, fire: O.fire, charge: O.charge, cover: O.cover, guns: !!this.gunsOn, abandoned: !!(this.abandoned && this.abandoned[0]), mode: O.mode, form: O.form }; }
  // a gun's crew down: the nearest of its own side's men go to it and serve it in their place (not while the guns are
  // given up, nor the horse, nor anyone running)
  recrew() {
    if (this.remote || !this.field || !this.field.guns.length) return;
    for (const g of this.field.guns) {
      if (g.dead || (this.abandoned && this.abandoned[g.side])) continue;
      for (let i = 0; i < 2; i++) {
        if (g.crew[i] && g.crew[i].alive) continue;
        let best = null, bd = 40;
        for (const u of this.units) {
          if (!u.alive || u.isNet || u.crewOf || u.wasCrew || u.mounted || u.routing || (u.al ?? u.team) !== g.side) continue;
          const d = Math.hypot(u.pos.x - g.x, u.pos.z - g.z); if (d < bd) { bd = d; best = u; }
        }
        if (!best) break;
        best.crewOf = g; best.crewIdx = i; g.crew[i] = best; best.a.path = []; best.releaseCover && best.releaseCover();
        if (g.side === 0 && G.arena === this && !this.toldRecrew) { this.toldRecrew = true; UI.hint("Men of yours step in to serve a gun whose crew are down.", 3); }
      }
    }
  }
  // a side's guns left: their crews called off them to fall in with the line, swords out — or sent back to them
  abandonGuns(team, on) {
    (this.abandoned ||= [false, false])[team] = on;
    if (this.remote || !this.field) return;
    for (const g of this.field.guns) if (g.side === team) for (const u of g.crew) {
      if (on) { if (u.crewOf) { u.wasCrew = u.crewOf; u.crewOf = null; } }
      else if (u.wasCrew) { u.crewOf = u.wasCrew; u.wasCrew = null; }
    }
  }
  // the number keys are your orders, in a fight of companies (the wheel still goes through your weapons: its turns come
  // as numbers too, but marked as the wheel's)
  // (in a fight of companies, always — the page shown or not: a number that fell through to the bar put your musket away)
  takesKey(e) { return !!(G.arena === this && this.multi && this.battle && this.live && !e.metaKey && !e.ctrlKey && GROUPS.some(g => g.key === e.code)); }
  takesNumbers(e) { return !!(this.multi && !e.fromWheel && /^Digit\d$/.test(e.code)); }
  onKey(e) {
    if (G.arena === this && this.viewing && e.code === "Enter" && !e.repeat) { e.stopImmediatePropagation(); e.preventDefault(); G.endFreecam && G.endFreecam(); this.finish(this.viewing.won); return; }
    if (G.arena !== this || e.repeat || !this.live || G.downed || G.mode !== "play") return;
    // F (with nothing else to hand): the bayonet fixed under your musket's muzzle — for good, this fight. It's in the way
    // of the rod and the aim: slower loading, and the shot less true
    // (only with nothing to use near you: holding F at a palisade to fire it, with the musket in your hands, fixed the
    //  bayonet the moment your eye strayed off the length, or the length caught and was done with)
    const busyF = e.code === "KeyF" && (G.interactTarget || G.holdT > 0 || G.time - (this.usedT || -9) < 2 || this.useNear());
    if (e.code === "KeyF" && !this.gunMan && this.lo.long === "musket" && this.lo.blade === "dagger" && !this.myTech("bayonet") && !G.player.bayonet && !busyF) { e.stopImmediatePropagation(); e.preventDefault(); UI.hint("Your crown hasn't the socket bayonet yet: the blade can't be fixed under the muzzle. Study it in the campaign's Learning.", 4); return; }
    if (e.code === "KeyF" && !this.gunMan && this.canBayonet() && !G.player.bayonet && !busyF) {
      e.stopImmediatePropagation(); e.preventDefault();
      const pl = G.player; if (!pl.gun || pl.gunIs !== "musket") this.takeUp("musket");
      if (pl.fixBayonet(true)) UI.hint("Bayonet fixed — for the rest of the fight. It's in the way: loading's slower, the aim's less true. Once you've fired, a click is the bayonet.", 4);
      return;
    }
    const grp = this.takesKey(e) && GROUPS.find(g => g.key === e.code);
    if (grp) { e.stopImmediatePropagation(); e.preventDefault(); this.pickGroup(grp); this.book && this.book.wake && this.book.wake(); return; }
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
    if (this.remote) { const pl = G.player; const T = this.selOrders().target; this.net.send({ t: "bord", id, grp: this.sel || null, at: this.lookPoint(), pos: { x: pl.pos.x, z: pl.pos.z }, tid: id === "target" && T ? T.uid : null }); }
    // (and the word taken up down the line: a man or two shouting it back)
    const mates = this.alliesOf(0).filter(u => !u.crewOf);
    for (let i = 0; i < Math.min(2, mates.length); i++) { const u = mates[Math.floor(Math.random() * mates.length)]; setTimeout(() => u.alive && AUDIO.voice && AUDIO.voice(Math.random() < 0.6 ? "war" : "grunt", { at: u.pos, vol: 0.55, high: isF(u.info.look) }), 350 + i * 260 + Math.random() * 200); }
    if (this.book) this.book.update(this.bookState());
  }
  // the orders being given now: the company's, or (a letter pressed) one arm's own
  selOrders() { return this.sel ? ((this.sub ||= [{}, {}])[0][this.sel] ||= Object.assign(new Orders(0), this.orders[0], { target: null })) : this.orders[0]; }
  // the arms there are in your company (each with its letter)
  groupsHere() { const have = new Set(this.alliesOf(0).filter(u => !u.crewOf).map(groupOf)); return GROUPS.filter(g => have.has(g.id)); }
  // a letter: that arm picked out, to take the orders by itself — the same letter again, the whole company
  pickGroup(g) {
    if (this.sel === g.id) { this.sel = null; UI.hint("The whole company — your orders go to every man.", 2.2); }
    else {
      const n = this.alliesOf(0).filter(u => !u.crewOf && groupOf(u) === g.id).length;
      if (!n) { UI.hint(`You have no ${g.name.toLowerCase()} here.`, 1.8); return; }
      this.sel = g.id;
      UI.hint(`${g.name} (${n}) — your orders go to them alone. ${g.key.slice(3)} again: the whole company.`, 2.8);
    }
    const F = window.__foley; F && F.packOut && F.packOut(0.12);
    if (this.book) this.book.update(this.bookState());
  }
  // one order, carried out by a set of orders (pos: where the commander stands; at: where he's looking)
  applyOrder(team, O, id, at, pos, tgt) {
    if (id.startsWith("form:")) { if (FORMATIONS[id.slice(5)]) O.form = id.slice(5); return; }
    switch (id) {
      case "follow": O.mode = "follow"; O.at = null; O.cover = false; O.charge = false; break;
      case "hold": O.mode = "hold"; O.at = pos; O.cover = false; O.charge = false; break;
      case "advance": O.mode = "advance"; O.at = at; O.cover = false; O.charge = false; break;
      case "cover": O.cover = true; O.charge = false; if (O.mode === "follow") { O.mode = "hold"; O.at = pos; } break;
      case "fire": O.fire = !O.fire; break;
      case "volley": O.volleyAt = G.time + 1.1; O.fire = true; break;
      case "target": O.target = tgt && tgt.alive ? tgt : null; break;
      case "charge": O.charge = !O.charge; if (O.charge) O.cover = false; break;
    }
  }
  // (to the whole company: every arm with orders of its own takes it too; to one arm, that arm alone)
  ordersFor(team, grp) {
    if (grp && GROUPS.some(g => g.id === grp)) { const S = (this.sub ||= [{}, {}])[team] ||= {}; return [S[grp] ||= Object.assign(new Orders(team), this.orders[team], { target: null })]; }
    return this.ordersOf(team);
  }
  giveNow(id) {
    const O = this.selOrders(), pl = G.player, say = (t, v = "war") => { UI.hint(this.sel ? `${GROUPS.find(g => g.id === this.sel).name}: ${t}` : t, 2.2); AUDIO.voice && AUDIO.voice(v, { high: G.who === "sister", vol: 0.8 }); };
    const all = this.ordersFor(0, this.sel), pos = { x: pl.pos.x, z: pl.pos.z }, go = (at, tgt) => { for (const o of all) this.applyOrder(0, o, id, at, pos, tgt); };
    if (id.startsWith("form:")) { go(); say(`${FORM_WORD[O.form] || "Form up"}!`); return; }
    switch (id) {
      case "follow": { go(); const n = this.rally(0, pl.pos); say(n ? `Rally! On me! — ${n} back in the ranks` : "On me — fall in!"); break; }
      case "hold": go(); this.mark(pos); say("Halt! Hold here."); break;
      case "advance": { const at = this.lookPoint(); go(at); this.mark(at); say("Forward — there!"); break; }
      case "cover": go(); say("Get down — take cover!"); break;
      case "fire": { const on = !O.fire; for (const o of all) o.fire = on; say(on ? "Fire at will!" : "Hold your fire!"); break; }
      case "volley": go(); say("Make ready… present… fire!"); break;
      case "target": {
        const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
        let best = null, ba = 0.12;
        for (const u of this.enemiesOf(0)) { const v = new THREE.Vector3(u.pos.x - camera.position.x, u.pos.y + 1.2 - camera.position.y, u.pos.z - camera.position.z), d = v.length(); if (d > 150) continue; const ang = v.normalize().angleTo(dir); if (ang < ba) { ba = ang; best = u; } }
        if (!best) { UI.hint("Look at the man you want brought down, then give the order.", 2.5); return; }
        go(null, best); this.mark(best.pos, 0xd86a50); say("That one — bring him down!"); break;
      }
      case "charge": { const on = !O.charge; for (const o of all) { o.charge = on; if (on) o.cover = false; } say(on ? "Charge!" : "Halt — fall back in!"); break; }
      case "guns:there": case "guns:will": case "guns:abandon": {
        if (!this.field || !this.field.guns.some(g => g.side === 0)) { UI.hint("Your company has no guns here.", 2); return; }
        if (id === "guns:abandon") { const on = !(this.abandoned && this.abandoned[0]); this.abandonGuns(0, on); say(on ? "Leave the guns — fall in with the line!" : "Back to your guns!"); break; }
        if (this.abandoned && this.abandoned[0]) this.abandonGuns(0, false);
        this.gunsOn = id === "guns:there";
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
    const say = () => this.banner(`Round ${n}`, this.wins[0] + this.wins[1] ? `${this.wins[0]} – ${this.wins[1]}` : `Best of three · ${esc(this.foeInfo.name)}${this.foeInfo.bot ? " (bot)" : ""}`);
    UI.fadeNow(1); UI.fade(0, 0.8);
    // (the first round: the two of you shown, face to face, before it)
    const lead = n === 1 && !window.__noIntro ? this.intro() : 0;
    if (!lead) say();
    const steps = ["3", "2", "1"];
    const go = this.countdown = () => {
      if (this.counting === n) return; this.counting = n; clearTimeout(this.goT);
      if (lead) say();
      this.rec && this.rec.begin(); this.rec && this.rec.push("R", n);
      steps.forEach((t, i) => setTimeout(() => { if (G.arena === this && this.round === n) { this.banner(t, ""); } }, 1400 + i * 800));
      setTimeout(() => this.fight(n), 1400 + steps.length * 800);
    };
    if (lead) this.goT = setTimeout(go, lead * 1000); else go();
  }
  fight(n) {
    {
      if (G.arena !== this || this.round !== n) return;
      this.rec && this.rec.push("F");
      this.banner("Fight!", ""); G.lockMove = false; this.live = true; this.foe.go();
      AUDIO.voice && AUDIO.voice("war", { high: G.who === "sister", vol: 0.6 });
      setTimeout(() => G.arena === this && this.banner(null), 900);
    }
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
  myBlade() {
    const pl = G.player, B = (pl.gun && pl.bayonet && pl.gunIs === "musket") || pl.blade === "bayonet" ? BLADE.bayonet : BLADE[this.lo.blade] || BLADE.dagger;
    // (from the saddle: further, and harder at the gallop)
    return pl.horse ? { ...B, reach: B.reach + 0.8, dmg: B.dmg * (pl.speed > 6 ? 1.7 : 1.25) } : B;
  }
  canBayonet() { return this.lo.long === "musket" && this.lo.blade === "dagger" && this.myTech("bayonet"); }
  myTech(k) { const c = this.hist && this.hist.cos && this.hist.cos[0]; return !c || !c.tech || c.tech[k] !== false; }
  swing() {
    if (this.multi) return this.swingAt();
    const pl = G.player, f = this.foe, B = this.myBlade();
    if (!this.live || !f.alive) return;
    const fwd = pl.forward(), dx = f.pos.x - pl.pos.x, dz = f.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d > B.reach || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.45) return;
    AUDIO.chop ? AUDIO.chop() : FOLEY.chop(f.pos, 0.7); G.impact && G.impact();
    f.youHitAt = G.time; f.youHitPos = chestOf(f.a);
    f.struck(B.dmg, pl.swingDir || "right");
  }
  // ---- what reaches you: a blow, a ball, an arrow ----
  hurtMe(dmg, from) {
    if (G.downed || !this.live) return;
    if (G.mode === "play") G.hurt(dmg, from);
    else { G.health = Math.max(0, G.health - dmg / 100); if (G.health <= 0) G.die(from); }
    if (this.rec && !G.downed) this.rec.hurt(this.you);
    if (this.net) this.net.send({ t: "dhp", hp: Math.round(G.health * HP), r: this.round });
  }
  youDown(from) {
    if (G.player.horse) G.player.dismount();   // (thrown from the saddle)
    G.downed = true; G.lockMove = true;
    if (this.netBattle) { this.net.send({ t: "dhp", hp: 0, r: this.round }); this.sendT = 0; this.sendState(0); }
    if (this.multi) return this.fallInBattle(from);
    this.deathFall(from);
    if (this.net) { this.net.send({ t: "ddown", r: this.round }); this.live = false; return; }
    this.endRound(1);
  }
  foeDown() { if (!this.net) this.endRound(0); }
  // you're down: your body falls as it falls (a ragdoll), your eye goes with your head, the world reddens and dims,
  // and who won is written over it
  deathFall(from, title = null, sub = "") {
    const pl = G.player, m = pl.model;
    if (this.rec) this.rec.down(this.you, { from: from && from.pos ? from.pos : from });
    if (!m) return;
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
    G.deathCam = null; pl.frozen = false; G.wasDeathCam = true;   // (your hands shown again, next frame)
    const fx = $("deathFx"); if (fx) fx.classList.remove("on", "watch");
    document.body.classList.remove("dead");
  }
  // a round over: who took it (0 you, 1 them, -1 neither — time ran out with nothing between you)
  endRound(who) {
    if (this.roundDone) return; this.roundDone = true;
    if (this.rec) { this.rec.tick(0.1); this.rec.push("W", who); }
    this.live = false;
    if (who >= 0) this.wins[who]++;
    this.showHud();
    slowMo(1.4, 0.3);
    const done = who >= 0 && this.wins[who] >= ROUNDS_TO_WIN;
    if (who === 1 && G.deathCam) this.banner(null);
    else this.banner(who === 0 ? "You take the round" : who === 1 ? `${esc(this.foeInfo.name)} takes the round` : "Time — nobody", `${this.wins[0]} – ${this.wins[1]}`);
    if (who === 1 && G.deathCam) { const fx = $("deathFx"); if (fx) fx.querySelector(".dfx-s").textContent = `${this.wins[0]} – ${this.wins[1]}${done ? "" : " · next round"}`; }
    setTimeout(() => { if (G.arena !== this) return; if (done) this.afterBattle(who === 0); else if (!this.net) this.beginRound(); }, 3200);
  }
  // ---------------------------------------------------------------------------
  //  the opening: before the word is given, the field as a film would show it — from the air, the place named; along
  //  your ranks; along theirs; the ground; and down out of the sky into your own eyes. Any key skips it (against a
  //  player, only the pictures: the word's given on both games at once). Returns how long it runs.
  // ---------------------------------------------------------------------------
  intro() {
    const battle = this.battle, pl = G.player, D = battle ? 14 : 7.5;
    const P = (x, z, up) => ({ x, y: groundY(x, z) + up, z });
    const cen = l => l.length ? { x: l.reduce((a, u) => a + u.pos.x, 0) / l.length, z: l.reduce((a, u) => a + u.pos.z, 0) / l.length } : { x: C.x, z: C.z };
    // (a custom battle: the line shown against you is the nearest company of another side's)
    const K = this.custom, foeCo = K ? Math.max(1, this.cos.findIndex(c => c.al !== 0)) : 1, myCos = K ? this.cos.map((c, i) => i).filter(i => this.cos[i].al === 0) : [0], foeCos = K ? this.cos.map((c, i) => i).filter(i => this.cos[i].al !== 0) : [1];
    const mine = () => this.alliesOf(0).filter(u => !u.crewOf), theirs = () => this.alliesOf(foeCo).filter(u => !u.crewOf);
    // (each side's company in a line of words: so many of each, and the guns)
    const tally = team => {
      const cos = team === 0 ? myCos : foeCos, l = cos.flatMap(c => this.alliesOf(c)), by = {};
      for (const u of l) { const k = u.crewOf ? null : (this.musters && this.musters[u.team] && this.musters[u.team][u.idx]) || null; if (k) by[k] = (by[k] || 0) + 1; }
      const guns = this.field ? this.field.guns.filter(g => team === 0 ? g.side === 0 : g.side !== 0).length : 0, men = l.filter(u => !u.crewOf).length + (team === 0 ? 1 : 0);
      const parts = Object.keys(by).length ? Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${(n === 1 ? TROOPS[k].one : TROOPS[k].name).toLowerCase()}`) : [`${men} men`];
      return parts.slice(0, 4).join(" · ") + (guns ? ` · ${guns} gun${guns > 1 ? "s" : ""}` : "");
    };
    const foeName = this.netBattle || (this.net && !this.multi) ? (this.foeName || "another commander") : null;
    const hourWord = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" }[this.hour] || "";
    const shots = battle ? [
      { at: 0, len: 3.6, cap: [this.place ? this.place.text.replace(" · by night", "") : "The field", `${this.place ? this.place.at + " · " : ""}${hourWord}${this.fortSide === 0 ? " · you hold the fort" : this.fortSide === 1 ? " · they hold the fort" : ""}`, K ? `To Arms · ${sidesWord(K)}` : "To Arms", true] },
      { at: 3.6, len: 3.3, cap: [this.uni[0].name, tally(0), K && K[0] > 1 ? `Your side · ${K[0]} companies, yours under ${this.me.name}` : `Your company · under ${this.me.name}`] },
      { at: 6.9, len: 3.3, cap: K ? [this.uni.slice(1).map(u => u.name).join(" · "), tally(1), `Against you · ${foeCos.length} compan${foeCos.length > 1 ? "ies" : "y"}${K.length > 2 ? ", and each against the others" : ""}`] : [this.uni[1].name, tally(1), foeName ? `Against you · under ${foeName}` : "Against you"] },
      { at: 10.2, len: 1.9, cap: null },
      { at: 12.1, len: 1.9, cap: null },
    ] : [
      { at: 0, len: 3.4, cap: [`${this.me.name} against ${this.foeInfo.name}`, `Best of three${this.foeInfo.bot ? " · against a bot" : ""}`, "Duel", true] },
      { at: 3.4, len: 2.2, cap: null },
      { at: 5.6, len: 1.9, cap: null },
    ];
    const t0 = this.introT0 = performance.now(), sm = new Smooth(); let cur = -1, ended = false;
    G.forceThird = true; UI.show("hud", false); FILM.bars(true); FILM.note(""); document.body.classList.add("cine");
    if (!this.introMusic) { this.introMusic = true; AUDIO.score(battle ? 12.5 : 16, { vol: battle ? 0.8 : 0.6, fade: 1.8 }); }
    const done = () => {
      if (ended) return; ended = true;
      G.deathCam = null; G.forceThird = false; UI.show("hud", true); FILM.off(); document.body.classList.remove("cine");
      removeEventListener("keydown", skip, true); removeEventListener("mousedown", skip, true);
      AUDIO.scoreOff(battle ? 5 : 3);
    };
    this.introEnd = done;
    // (skipped: the pictures stop; and against bots, on at once — against a player, the word still waits for both)
    const skip = e => {
      if (G.arena !== this || ended) return;
      if (e.type === "keydown" && (e.repeat || /^(F\d+|Meta|Alt|Control|Shift)/.test(e.key))) return;
      e.stopImmediatePropagation(); e.preventDefault();
      done(); UI.fadeNow(1); UI.fade(0, 0.5);
      if (!this.net) this.countdown && this.countdown();
    };
    setTimeout(() => { if (!ended) { addEventListener("keydown", skip, true); addEventListener("mousedown", skip, true); } }, 400);
    let lastT = t0;
    G.deathCam = cam => {
      if (G.arena !== this || this.over) { done(); return; }
      const now = performance.now(), T = (now - t0) / 1000, rdt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      if (T >= D) { done(); return; }
      let i = shots.length - 1; while (i > 0 && shots[i].at > T) i--;
      const S = shots[i], u = clamp((T - S.at) / S.len, 0, 1);
      const a = cen(mine()), b = cen(theirs()), dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1, f = [dx / d, dz / d], r = [dz / d, -dx / d];
      const m = K && K.length > 2 ? { x: C.x, z: C.z } : { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const geo = (sm, u) => {
      if (battle) {
        if (i === 0) {
          // from high over the field, coming down and round
          const ang = Math.atan2(r[1], r[0]) + 0.5 - u * 0.5, R = 70 - u * 18, h = 62 - ease(u) * 22;
          return sm.go(cam, P(m.x + Math.cos(ang) * R, m.z + Math.sin(ang) * R, h), P(m.x, m.z, 0), 46, 8, rdt);
        }
        if (i === 1 || i === 2) {
          // along the front of a line, at a man's height, the colours behind it
          const l = i === 1 ? mine() : theirs(), c = cen(l), dir = i === 1 ? f : [-f[0], -f[1]], side = i === 1 ? r : [-r[0], -r[1]];
          let w = 4; for (const q of l) w = Math.max(w, Math.abs((q.pos.x - c.x) * side[0] + (q.pos.z - c.z) * side[1]));
          const o = (u - 0.5) * Math.min(18, w * 1.4), fr = i === 1 ? 7.5 : 7;   // (yours: further out than you stand before it)
          return sm.go(cam, P(c.x + dir[0] * fr + side[0] * o, c.z + dir[1] * fr + side[1] * o, i === 1 ? 1.55 : 1.0), P(c.x + side[0] * (o + 4), c.z + side[1] * (o + 4), 1.45), i === 1 ? 44 : 40, 6, rdt);
        }
        if (i === 3) {
          // the ground: a gun of yours, laid; or the fort; or the open field between the two lines, low
          const g = this.field && this.field.guns.find(q => q.side === 0);
          // (the gun from in front and to the side, its crew at it: a portrait of it)
          if (g) { const fw = [-Math.sin(g.ry + g.yaw), -Math.cos(g.ry + g.yaw)], rt = [fw[1], -fw[0]]; return sm.go(cam, P(g.x + rt[0] * (2.4 - u * 0.4) + fw[0] * 1.6, g.z + rt[1] * (2.4 - u * 0.4) + fw[1] * 1.6, 0.95), P(g.x - fw[0] * 0.4, g.z - fw[1] * 0.4, 0.7), 50, 6, rdt); }
          return sm.go(cam, P(m.x + r[0] * (12 - u * 4), m.z + r[1] * (12 - u * 4), 0.7), P(b.x, b.z, 1.4), 38, 6, rdt);
        }
      } else {
        if (i === 0) { const ang = Math.atan2(r[1], r[0]) + u * 0.9, R = 9 - u * 2; return sm.go(cam, P(m.x + Math.cos(ang) * R, m.z + Math.sin(ang) * R, 1.8 + u * 0.6), P(m.x, m.z, 1.2), 46, 6, rdt); }
        if (i === 1) { const fo = this.foe, y = fo.a ? fo.a.yaw : 0, fw = [Math.sin(y), Math.cos(y)], q = fo.pos; return sm.go(cam, P(q.x + fw[0] * (3.2 - u * 0.8) + fw[1] * 0.6, q.z + fw[1] * (3.2 - u * 0.8) - fw[0] * 0.6, 1.65), P(q.x, q.z, 1.6), 34, 6, rdt); }
      }
      // last: down out of the sky behind you, into your own eyes — the shot ending exactly where your eye will be
      const e = pl.eyePos(), cy = Math.cos(pl.pitch), look = { x: e.x - Math.sin(pl.yaw) * cy * 10, y: e.y + Math.sin(pl.pitch) * 10, z: e.z - Math.cos(pl.yaw) * cy * 10 };
      const k = ease(u), bx = Math.sin(pl.yaw) * 7, bz = Math.cos(pl.yaw) * 7;
      const from = { x: e.x + bx * (1 - k), y: e.y + (battle ? 6 : 2.5) * (1 - k), z: e.z + bz * (1 - k) };
      if (u > 0.9) G.forceThird = false;   // (into your own head: the body you see from inside, as you always do)
      const want = { x: e.x + (look.x - e.x) * k, y: e.y - 0.25 + (look.y - e.y + 0.25) * k, z: e.z + (look.z - e.z) * k }, fv = (G.settings && G.settings.fov) || 70;
      return sm.go(cam, from, want, fv - (1 - k) * 18, u > 0.75 ? 30 : 7, rdt);
      };
      // (each shot's path worked out whole as it begins, the height it needs over the works along it with it — the last,
      //  into your eyes, never lifted)
      if (i !== cur) {
        cur = i; sm.cut(); if (i) FILM.dip(300); if (S.cap) FILM.cap(...S.cap); else FILM.cap(null);
        if (i === shots.length - 1) sm.fixed = 0;
        else { const cap = { go: (c, from, to) => [from, to] }; sm.plan(uu => geo(cap, uu)); }
      }
      return geo(sm, u);
    };
    return D;
  }
  // a battle won or lost: its highlights, at once — then the result. (Short, or nothing written: the old way, the field
  // to look over)
  afterBattle(won) {
    if (this.over) return;
    // (a campaign's battle: its outcome back to the campaign the moment it's decided — not only once you've left the field)
    this.toCampaign(won, false);
    if (this.rec && this.rec.on && this.rec.t > 6) this.finish(won, false, true);
    else this.overView(won);
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
  // ---- a campaign's battle (with bots, or the other player): told the campaign once ----
  toCampaign(won, left) {
    if (this.toldCmp) return;
    if (this.cmpEnd) { this.toldCmp = true; try { this.cmpEnd(won, this.killed | 0, this.lost | 0, !!left); } catch (e) { console.error(e); } }
    else if (this.hist && this.hist.b.campaign) { this.toldCmp = true; try { this.hist.b.onEnd && this.hist.b.onEnd(won && !left, this.killed | 0, this.lost | 0, !!left || !!this.fled); } catch (e) { console.error(e); } }
  }
  // ---- the match over: the record, and the result ----
  finish(won, left = false, reel = false) {
    if (this.over) return; this.over = true;
    // (the recording closed, kept here, and sent to the server for anyone to watch)
    let rec = null;
    if (this.rec && !left) {
      this.rec.push("E", won ? 1 : 0);
      const kind = this.battle ? "battle" : this.multi ? "skirmish" : "duel", vs = this.net ? "player" : "bots";
      rec = this.rec.finish({ name: this.me.name, sides: this.custom || undefined, foe: this.multi ? (this.netBattle ? this.foeName : this.custom ? `${sidesWord(this.custom)} (bots)` : `${this.uni ? this.uni[1].name : "bots"} (bots)`) : `${this.foeInfo.name}${this.foeInfo.bot ? " (bot)" : ""}`,
        kind, vs, place: this.place ? this.place.text : "", hour: this.hour, won, k: this.multi ? this.killed | 0 : this.wins[0], l: this.multi ? this.lost | 0 : this.wins[1],
        uni: this.uni ? this.uni.map(u => u.name) : [], men: this.multi ? [this.army.allies + 1, this.army.enemies] : [1, 1] });
      // (kept here; on the server's Highlights only if you tick the box for it on the result)
      if (rec) { lastRec = rec; keepMine(rec); }
    }
    // (rated only against another player: a fight with bots moves nothing anyone sees — only how sharp the bots are
    //  against you next time)
    const rated = !!this.net && !this.cmpEnd, r = rated ? record() : botRecord(), foeR = (rated && this.foeInfo.rating) || r.rating, exp = 1 / (1 + Math.pow(10, (foeR - r.rating) / 400)), k = 32;
    const delta = Math.round(k * ((won ? 1 : 0) - exp));
    r.rating = Math.max(100, r.rating + delta); if (won) { r.w++; r.streak = (r.streak || 0) + 1; } else { r.l++; r.streak = 0; }
    if (rated) saveRecord(r); else saveBotRecord(r);
    const R = record();
    if (won && G.achEvent) { G.achEvent("pvp-win"); if (r.streak >= 5) G.achEvent("pvp-streak5"); }
    const score = this.multi ? `${this.killed || 0} of theirs down, ${this.lost || 0} of yours${this.place ? ` · ${esc(this.place.text)}` : ""}` : `${this.wins[0]} – ${this.wins[1]}`;
    this.stop();
    ctx.end();
    $("pvpEndK").textContent = left ? "They left the field" : won ? "Victory" : "Defeat";
    $("pvpEndT").textContent = this.multi ? (won ? (this.routEnd ? "They broke and ran" : "The field is yours") : (this.routEnd ? "Your men broke and ran" : "The day is lost")) : won ? `You beat ${this.foeInfo.name}` : `${this.foeInfo.name} beat you`;
    $("pvpEndS").innerHTML = `${score}${this.foeInfo.bot && !this.multi ? " · against a bot" : ""}<br>${rated ? `Rating <b>${Math.round(r.rating)}</b> <span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta}</span> · ${rankOf(r.rating)} · ${r.w} won, ${r.l} lost` : `Against bots: not rated · your rating stays <b>${Math.round(R.rating)}</b>`}`;
    // (a historical battle: kept as won or not, on that side — and how it went in truth)
    // (a campaign's: its outcome back to the campaign, which takes or loses the town)
    // (two players of a campaign: rated nowhere, and the outcome back to the campaign they share)
    this.toCampaign(won, left);
    if (this.hist && !this.hist.b.campaign && !left) {
      const HB = this.hist.b, sd = this.hist.side; histResult(HB.id, sd, won);
      const asIt = HB.won == null ? null : (HB.won === sd) === won;
      $("pvpEndS").innerHTML += `<div class="pv-histend"><b>${asIt === null ? "As it was" : asIt ? "As it happened" : "History, changed"}</b> ${esc(HB.after[asIt === false ? 1 : 0])}</div>`;
    }
    if (lastMode === "story" && this.hist && this.hist.b.after) $("pvpEndS").innerHTML += `<div class="pv-histend"><b>${won && !left ? "As it happened" : "The city held all the same"}</b> ${esc(this.hist.b.after[won && !left ? 0 : 1])}</div>`;
    $("pvpAgain").textContent = lastMode === "campaign" ? "Back to the campaign" : lastMode === "story" ? "Back to the story" : "Again";
    $("pvpLoadout").classList.toggle("hidden", lastMode === "story");
    endReplay(rec);
    ctx.screen("pvpEnd");
  }
  // begun again from the start, the same sides and loads (a fight against bots: the pause menu's Restart); a battle on
  // new ground
  restart() {
    if (this.net || (this.hist && this.hist.b.campaign)) return;   // (a campaign's battle is fought once: no second try)
    const a = { me: this.me, lo: { ...lo }, foe: this.foeInfo, net: null, side: this.side, army: this.army };
    this.over = true; this.stop(); ctx.begin(); new Arena(a);
  }
  // gone from the arena (the match done, or quit from the pause menu)
  // the din of the fighting round you: men at close quarters near you, and men running (a charge coming on), heard as one
  dinTick(dt) {
    if (!this.battle || (this.dinT = (this.dinT || 0) - dt) > 0) return;
    const step = 0.25; this.dinT = step;
    const pl = G.player.pos, near = (p, r) => Math.max(0, 1 - Math.hypot(p.x - pl.x, p.z - pl.z) / r);
    const us = (this.units || []).filter(u => u.alive && u.pos);
    let fight = 0, run = 0;
    for (const u of us) {
      const k = near(u.pos, 55); if (k <= 0) { u.dinAt = null; continue; }
      if (us.some(v => this.alOf(v.team) !== this.alOf(u.team) && Math.abs(v.pos.x - u.pos.x) < 3.5 && Math.abs(v.pos.z - u.pos.z) < 3.5)) fight += k;
      if (u.dinAt) { const sp = Math.hypot(u.pos.x - u.dinAt.x, u.pos.z - u.dinAt.z) / step; if (sp > 2.6) run += k; }
      u.dinAt = { x: u.pos.x, z: u.pos.z };
    }
    AUDIO.melee && AUDIO.melee(Math.min(1, fight / 7), Math.min(1, run / 9));
  }
  stop() {
    if (G.arena !== this) return;
    AUDIO.melee && AUDIO.melee(0, 0); clearGore();
    if (G.freecam && G.endFreecam) G.endFreecam();
    G.arena = null; this.live = false;
    const i = G.onFrame.indexOf(this.tick); if (i >= 0) G.onFrame.splice(i, 1);
    G.onSwing = null; G.onDowned = null; G.onGunshot = null; G.onLoose = null; G.onSwingStart = null;
    this.rise();
    G.player.swingRate = 1; G.loadMul = 1; G.lockMove = false; G.downed = false; G.player.bayonet = false; if (G.player.horse) G.player.dismount();
    if (this.net) { this.net.send({ t: "dleave" }); this.net.close(); this.net = null; }
    if ($("pvpHud")) $("pvpHud").classList.add("hidden");
    this.banner(null);
    clearTimeout(this.goT); if (this.introEnd) this.introEnd();
    UI.stance && UI.stance(null);
    if (this.keyH) removeEventListener("keydown", this.keyH, true);
    if (this.clickH) removeEventListener("mousedown", this.clickH, true);
    if (this.book) this.book.hide();
    if (this.gunMan) this.unmanGun();
    for (const it of this.gunIts || []) this.w.removeInteract(it);
    if (this.field) this.field.dispose();
    for (const m of this.marks || []) this.w.root.remove(m.mesh);
    this.marks = [];
  }
  // ---- every frame ----
  // ---- a gun of your own side's, worked yourself: you at the breech, the barrel following your eye, a click to fire —
  //  the crew loading it, and you with them (a gun whose crew is down can still be served, slowly, by you) ----
  manGun(g) {
    const pl = G.player; if (this.gunMan) this.unmanGun();
    this.gunMan = g; g.byHand = true; g.manned = true;
    if (pl.gun) pl.showGun(false); if (pl.bow) pl.showBow(false); if (pl.xbow) pl.showXbow(false); if (pl.axe) pl.holsterAxe && pl.holsterAxe(true);
    G.lockMove = true; pl.yaw = g.ry + g.yaw; pl.pitch = g.pitch;
    UI.hint(`The gun is yours. Look to lay it — the ring is where the ball will strike — and click to fire. The crew load it again${g.crew && g.crew.some(u => u.alive) ? "" : ", and you with them"}. Shift to leave it.`, 7);
    // (leaving it: F, as you took it — or simply stepping away, as you would)
    const walk = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].map(k => G.keyOf ? G.keyOf(k) || k : k));
    this.gunKey = e => { if (!this.gunMan || e.repeat) return; if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.key === "Shift" || e.code === "KeyF" || walk.has(e.code)) { if (!walk.has(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); } this.unmanGun(); G.holdLatch = true; G.tapFor = null; this.gunLeftT = performance.now(); UI.hint("You leave the gun to its crew.", 2); } };
    // (and while you're at it, said plainly on the screen the whole time)
    let b = document.getElementById("gunBadge"); if (!b) { b = document.createElement("div"); b.id = "gunBadge"; b.className = "gun-badge"; document.body.appendChild(b); }
    b.innerHTML = `<b>On the gun</b><span>Look to lay it · <kbd>Click</kbd> fire · <kbd>Shift</kbd> leave the gun</span>`; b.classList.add("on");
    addEventListener("keydown", this.gunKey, true);
    if (!this.gunRing) { this.gunRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8b84a, transparent: true, opacity: 0.75, depthWrite: false })); this.gunRing.renderOrder = 3; }
    this.w.root.add(this.gunRing);
  }
  unmanGun() {
    const g = this.gunMan; if (!g) return;
    this.gunMan = null; g.byHand = false; g.manned = false; G.lockMove = false;
    removeEventListener("keydown", this.gunKey, true);
    { const b = document.getElementById("gunBadge"); if (b) b.classList.remove("on"); }
    if (this.gunRing) this.w.root.remove(this.gunRing);
    if (this.live) this.takeUp(this.lo.long !== "none" ? this.lo.long : this.lo.side === "pistol" ? "pistol" : this.lo.blade);
  }
  gunTick(dt) {
    const g = this.gunMan, pl = G.player, F = this.field;
    if (!g) return;
    if (g.dead || G.downed || !this.live || this.over) { this.unmanGun(); return; }
    // (the barrel where you look, as far as the trail swings and the quoin lets it)
    const dy = clamp(Math.atan2(Math.sin(pl.yaw - g.ry), Math.cos(pl.yaw - g.ry)), -0.9, 0.9); pl.yaw = g.ry + dy; pl.pitch = clamp(pl.pitch, -0.08, 0.3);
    // (laid on what you're looking at: the elevation for the range to it, as a gunner judges it — or, looking at the
    //  sky, as high as you're looking)
    g.yaw = dy;
    const at = pl.pitch < 0.25 && this.lookPoint(), d = at ? Math.hypot(at.x - g.x, at.z - g.z) : 0;
    g.pitch = at && d > 6 ? clamp(0.5 * Math.asin(clamp(d * 9.8 / (140 * 140), -1, 1)) + (F.y(at.x, at.z) - F.y(g.x, g.z) - 0.9) / Math.max(4, d), -0.08, 0.35) : clamp(pl.pitch, -0.08, 0.35);
    // (you behind the breech, looking along it)
    const f = g.ry + g.yaw, bx = g.x + Math.sin(f) * 2.1, bz = g.z + Math.cos(f) * 2.1;
    pl.pos.set(bx, this.w.heightAt(bx, bz), bz); pl.vel && pl.vel.set(0, 0, 0);
    // (where the ball comes down: its flight followed from the muzzle till it meets the ground)
    if (this.gunRing) {
      const dir = { x: -Math.sin(f) * Math.cos(g.pitch), y: Math.sin(g.pitch), z: -Math.cos(f) * Math.cos(g.pitch) };
      let px = g.x + dir.x * 1.4, py = F.y(g.x, g.z) + 0.95, pz = g.z + dir.z * 1.4, vx = dir.x * 140, vy = dir.y * 140, vz = dir.z * 140, hit = null;
      for (let i = 0; i < 400; i++) { const h = 0.01; vy -= 9.8 * h; px += vx * h; py += vy * h; pz += vz * h; const gy = this.w.heightAt(px, pz); if (py <= gy) { hit = { x: px, y: gy, z: pz }; break; } if (Math.hypot(px - C.x, pz - C.z) > this.bound + 40) break; }
      this.gunRing.visible = !!hit; if (hit) { this.gunRing.position.set(hit.x, hit.y + 0.06, hit.z); this.gunRing.material.color.set(g.loaded ? 0xd8b84a : 0x8a8478); }
    }
    if (input.click) { input.click = false; if (g.loaded) F.fire(g); else UI.hint(g.reload > 0 ? `Loading — ${Math.ceil(g.reload)}s` : "Loading…", 1.2); }
    if (g.loaded && !g.toldLoaded) { g.toldLoaded = true; if (g.fired) { UI.hint("Loaded. Fire when you're ready.", 1.4); AUDIO.ramrod && AUDIO.ramrod(); } }
    if (!g.loaded) { g.toldLoaded = false; g.fired = true; }
  }
  update(dt) {
    if (G.arena !== this) return;
    this.gunTick(dt);
    if (this.rec && this.live) this.rec.tick(dt);
    const pl = G.player;
    // (the field: the ride and the trees round it; out past them, you're turned back)
    pl.swingRate = this.myBlade().rate;   // (the bayonet on the musket strikes at its own pace, not the blade's in your belt)
    const dx = pl.pos.x - C.x, dz = pl.pos.z - C.z, d = Math.hypot(dx, dz), B = this.bound;
    if (d > B) { pl.pos.x = C.x + dx / d * B; pl.pos.z = C.z + dz / d * B; if (!this.boundTold || G.time - this.boundTold > 4) { this.boundTold = G.time; UI.hint(this.battle ? "The battle's here — your company's behind you." : "The fight's here, in the ride.", 1.5); } }
    this.dinTick(dt);
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
      const ours = this.sideOf(0).length + (this.you.alive ? 1 : 0), theirs = this.enemiesOf(0).length;
      // (a custom battle: your side, and every other side still in it, by its colours)
      // (a historical battle: the two armies by their own names — King William's, King James's)
      const HS = this.hist ? [this.hist.b.sides[this.hist.side].name, this.hist.b.sides[1 - this.hist.side].name] : null;
      const runT = this.units.filter(u => u.alive && u.routing && this.alOf(u.team) !== 0).length, runM = this.units.filter(u => u.alive && u.routing && this.alOf(u.team) === 0).length;
      const others = HS ? `${HS[1]} · ${theirs - runT}${runT ? ` · ${runT} running` : ""}` : this.custom ? this.custom.map((n, a) => a && this.sideOf(a).length ? `${this.uni[a].name} ${this.sideOf(a).length}` : null).filter(Boolean).join(" · ") : null;
      h.querySelector(".ph-me .ph-name").textContent = `${HS ? HS[0] : this.uni ? this.uni[0].name : "Yours"} · ${ours - runM}${HS ? "" : " standing"}${runM ? ` · ${runM} running` : ""}`;
      h.querySelector(".ph-foe .ph-name").textContent = others != null ? (others || "None standing") : `${this.uni ? this.uni[1].name : "Theirs"} · ${theirs - runT} standing${runT ? ` · ${runT} running` : ""}`;
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
    const k = this.multi ? clamp((this.custom ? this.enemiesOf(0).length : this.alliesOf(1).length) / Math.max(1, this.army.enemies), 0, 1) : clamp(this.foe.hp / HP, 0, 1);
    if (Math.abs(k - (this._k ?? -1)) > 0.004) { this._k = k; h.querySelector(".ph-hp i").style.width = `${k * 100}%`; }
  }
  banner(t, sub) {
    const b = $("pvpBanner"); if (!b) return;
    if (t == null) { b.classList.add("hidden"); return; }
    b.querySelector(".pb-t").innerHTML = t; b.querySelector(".pb-s").innerHTML = sub || "";
    b.classList.remove("hidden"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
  }

  // ---------------------------------------------------------------------------
  //  a battle against another player
  // ---------------------------------------------------------------------------
  // (the other player's game: the men as the host's game raised them, the sides turned about)
  puppets(roster) {
    this.byId = new Map();
    for (const r of roster) {
      const u = new Puppet(this, { name: r.name, look: r.look, lo: r.lo, team: 1 - r.team, idx: r.idx, uid: r.id, bot: true, horse: !!r.horse, kind: typeof r.kind === "string" ? r.kind : null });
      if (r.gun >= 0 && this.field.guns[r.gun]) { const g = this.field.guns[r.gun]; u.crewOf = g; u.crewIdx = r.ci; g.crew.push(u); }
      this.units.push(u); this.hunt.animals.push(u); this.byId.set(r.id, u);
    }
  }
  unitById(id) { if (!this.byId) { this.byId = new Map(); for (const u of this.units) if (u.uid != null) this.byId.set(u.uid, u); } return this.byId.get(id); }
  // the host's game: everyone on the field, a tenth of a second at a time, and the guns
  sendSnap(dt) {
    if ((this.snapT = (this.snapT || 0) - dt) > 0) return; this.snapT = 1 / 10;
    const D = { up: 0, left: 1, right: 2 }, r2 = v => Math.round(v * 100) / 100;
    const u = this.units.filter(x => !x.isNet && x.alive).map(x => {
      const P = x.a.person, fl = (P.aimWant ? 2 : 0) | (P.crouching ? 4 : 0) | (x.wind > 0 ? 8 : 0) | (x.T === this.netFoe ? 16 : 0) | ((D[x.dir] | 0) << 5);
      return [x.uid, r2(x.pos.x), r2(x.pos.z), r2(x.a.yaw), fl, P.pose || "idle", x.heldK || "", P.load ? +P.load.e.toFixed(2) : 0];
    });
    const g = this.field ? this.field.guns.map(q => [r2(q.yaw), r2(q.pitch), q.loaded ? 1 : 0, r2(clamp(1 - q.reload / (q.reloadT || 1), 0, 1))]) : [];
    this.net.send({ t: "bsnap", u, g, k: this.killed | 0, l: this.lost | 0 });
  }
  // the other player's orders to their company, carried out here
  remoteOrder(m) {
    const at = m.at && isFinite(m.at.x) ? { x: +m.at.x, z: +m.at.z } : null, pos = m.pos && isFinite(m.pos.x) ? { x: +m.pos.x, z: +m.pos.z } : null, id = String(m.id || "");
    const all = this.ordersFor(1, typeof m.grp === "string" ? m.grp : null), O = all[0];
    if (id === "fire") { const on = !O.fire; for (const o of all) o.fire = on; return; }
    if (id === "charge") { const on = !O.charge; for (const o of all) { o.charge = on; if (on) o.cover = false; } return; }
    const tgt = id === "target" ? (m.tid === -1 ? this.you : this.unitById(m.tid)) : null;
    for (const o of all) this.applyOrder(1, o, id, at, pos, tgt);
    if (id === "follow" && pos) this.rally(1, pos);
    if (id === "guns:abandon") this.abandonGuns(1, !(this.abandoned && this.abandoned[1]));
    if (id === "guns:there" || id === "guns:will") { if (this.abandoned && this.abandoned[1]) this.abandonGuns(1, false); this.field.order(1, id === "guns:there" ? at : null); }
  }
  wireBattle(net) {
    const D3 = a => new THREE.Vector3(...(a || [0, 0, 0]).map(Number));
    // (a man down on either side: the tally and the end; the other player down — or up again — on the host's field)
    const prevHp = net.on.dhp;
    net.on.dhp = m => { const nf = this.netFoe, was = nf.alive; prevHp && prevHp(m); if (this.host && was && !nf.alive) this.unitDown(nf); };
    if (this.host) {
      net.on.bready = () => { clearTimeout(this.waitT); if (!this.round && G.arena === this) this.beginRound(); };
      net.on.bhit = m => { const u = this.unitById(m.id); if (u && u.alive && u.damage && this.alOf(u.team) === 0) u.damage(clamp(+m.dmg || 0, 0, 130), false, !!m.head, this.netFoe.pos); };
      // (the other player's blow on one of the men: as their screen had it — a little behind this one, over the wire,
      //  so a man a step or two further off here than there is still struck)
      net.on.bstrike = m => { const u = this.unitById(m.id); if (u && u.alive && u.struck && this.alOf(u.team) === 0 && Math.hypot(u.pos.x - this.netFoe.pos.x, u.pos.z - this.netFoe.pos.z) < 5.5) u.struck(clamp(+m.dmg || 0, 0, 30), ["up", "left", "right"].includes(m.dir) ? m.dir : "right", this.netFoe); };
      net.on.bparry = m => { const u = this.unitById(m.id); if (u) { u.stun = 1.0; u.cool = Math.max(u.cool || 0, 1.3); u.a.person.flinch && u.a.person.flinch(); } };
      net.on.bord = m => this.remoteOrder(m);
      net.on.bgunlay = m => { const g = this.field.guns[m.i | 0]; if (g && g.side === 1 && g.loaded && m.at) this.field.layAndFire(g, { x: +m.at.x, z: +m.at.z }); };
      // (the other player fallen, and three of theirs still up: the man furthest from the fighting gives his place)
      net.on.btake = () => {
        const mates = this.alliesOf(1).filter(u => !u.isNet && !u.crewOf); if (mates.length < TAKE_OVER - 1 || this.ended) { net.send({ t: "btook", none: 1 }); return; }
        const foes = this.alliesOf(0), far = u => Math.min(...foes.map(f => Math.hypot(f.pos.x - u.pos.x, f.pos.z - u.pos.z)), 999);
        const u = mates.sort((a, b) => far(b) - far(a))[0], at = { x: u.pos.x, z: u.pos.z };
        u.quiet = true; u.hp = 0; u.a.root.visible = false; this.units.splice(this.units.indexOf(u), 1);
        net.send({ t: "bgone", id: u.uid, hide: 1 }); net.send({ t: "btook", x: +at.x.toFixed(2), z: +at.z.toFixed(2) });
        this.netFoe.hp = HP; this.netFoe.tx = at.x; this.netFoe.tz = at.z; this.netFoe.a.place(at.x, at.z);
        if (this.netFoe.isDown) { this.netFoe.isDown = false; this.netFoe.standUp(); }
      };
    } else {
      net.on.bsnap = m => {
        const seen = new Set();
        for (const e of m.u || []) { const u = this.unitById(e[0]); if (u) { u.snap(e); seen.add(u); } }
        (m.g || []).forEach((v, i) => { const g = this.field.guns[i]; if (!g) return; g.net = v; });
        // (the tally as the host's game has it, turned about)
        this.killed = m.l | 0; this.lost = m.k | 0;
      };
      net.on.bfire = m => {
        const u = this.unitById(m.id); if (!u) return;
        const f = D3(m.f), d = D3(m.d).normalize();
        if (m.k === "musket" || m.k === "pistol") {
          AUDIO.gunshot && AUDIO.gunshot(m.k === "pistol" ? 0.75 : 0.95, u.pos);
          G.gunSmoke && G.gunSmoke(f, d, m.k === "pistol" ? 0.6 : 1);
          this.hunt.fireBall(f.clone().addScaledVector(d, 0.4), d, { speed: m.k === "pistol" ? 260 : 420, npc: u, ghost: true });
        }
      };
      net.on.bgun = m => { const g = this.field.guns[m.i | 0]; if (g) this.field.fire(g); };
      net.on.bdown = m => { const u = this.unitById(m.id); if (!u || !u.alive) return; u.hp = 0; u.blast = !!m.b; u.fallDown({ x: +m.x, z: +m.z }, !!m.h); u.blast = false; this.unitDown(u); };
      net.on.bhurt = m => { const u = this.unitById(m.id); if (!u || !u.alive) return; if (this.rec) this.rec.hurt(u); blowLands(u.a, "hit", u.youHitPos && G.time - (u.youHitAt ?? -9) < 0.6 ? G.player : { pos: u.pos }); u.a.person.flinch && u.a.person.flinch(); AUDIO.voice && AUDIO.voice(Math.random() < 0.7 ? "pain" : "grunt", { at: u.pos, high: isF(u.info.look) }); };
      net.on.bgone = m => { const u = this.unitById(m.id); if (!u) return; u.hp = 0; if (m.hide) u.a.root.visible = false; else { u.quiet = true; u.a.place(+m.x, +m.z, u.a.yaw); u.fallDown(this.spawns[0]); } const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1); this.showHud(); };
      // (one of theirs at you with the steel: judged here, against your guard)
      net.on.bswing = m => {
        const u = this.unitById(m.id); if (!u || !this.live || G.downed) return;
        const pl = G.player, d = Math.hypot(u.pos.x - pl.pos.x, u.pos.z - pl.pos.z); if (d > 3.4) return;
        u.wind = 0; const was = G.health, how = strikeYou(u.a, ["up", "left", "right"].includes(m.dir) ? m.dir : "right", clamp(+m.dmg || 0, 0, 30), d, this.tips ??= {});
        if (how === "parry") net.send({ t: "bparry", id: u.uid });
        if (G.health !== was || G.downed) net.send({ t: "dhp", hp: Math.round(G.health * HP), r: this.round });
      };
      net.on.btook = m => m.none ? this.fallInBattleWatch() : this.takeOver({ x: +m.x, z: +m.z });
      net.on.bend = m => {
        if (this.ended || this.over) return; this.ended = true; this.live = false; this.standDown();
        const won = m.winner === 1; this.killed = m.l | 0; this.lost = m.k | 0;
        slowMo(1.6, 0.3);
        this.banner(won ? "The field is yours" : "The day is lost", won ? `${this.killed} of theirs down` : "");
        setTimeout(() => G.arena === this && this.afterBattle(won), 2600);
      };
    }
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
    net.on.dend = m => { if (this.netBattle && this.viewing) return; if (this.netBattle && this.ended) return; this.finish(m.winner === this.side, !!m.left); };
    net.on.lost = () => { if (G.arena === this && !this.over && !(this.netBattle && this.viewing)) this.finish(!!this.netBattle, !!this.netBattle); };
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
    if (info.horse) this.remount();
    // (a man of a company: his pieces made one, for the crowd's sake — see models.js)
    if (arena.multi && info.bot) { const P = this.a.person; try { P.unmerge = mergeRig(P.root); } catch (e) { P.unmerge = null; } }
  }
  // (a trooper: in the saddle — again, if he was thrown in a round before)
  remount() { if (this.a.horse) { this.a.yOff = 0.68; this.a.person.sitting = 1; return; } { const k = Math.abs(Math.sin((this.info.idx || 0) * 12.99 + (this.info.team || 0) * 7.7)); this.a.mountHorse(makeHorse(COATS[Math.floor(k * COATS.length) % COATS.length], (this.info.idx || 0) + 1)); this.a.radius = 0.6; } }
  get mounted() { return !!this.a.horse; }
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
    if (k === "bow") { const bm = modelCopy("bow"), bow = bm ? bm.scene : new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x7a4e2a })); if (!bowHold(P, bow)) { bow.rotation.set(0, Math.PI / 2, 0); this.a.hold(bow, true); } return; }
    if (k === "crossbow" || k === "musket" || k === "pistol") { this.gun = shoulderArm(P, k); return; }
    // (a spear or the bayonet: in both hands, as a pike — see pikeHold; anything else in the right hand)
    const arm = makeArm(k); arm.traverse(o => { if (o.isMesh) o.castShadow = true; });
    if ((k === "spear" || k === "bayonet") && pikeHold(P, arm, k)) return;
    this.a.hold(arm);
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
    if (a.horse) { a.unhorse(from); a.sync(); }
    // (your kill: he went down a moment after you hit him — the mark where it struck, and the sound of it)
    const yours = this.youHitPos && G.time - (this.youHitAt ?? -9) < 1.5;
    const rec = this.arena.rec; if (rec) rec.down(this, { from, head, blast: !!this.blast, yours, quiet: this.quiet });
    if (yours) { killMark(this.youHitPos); this.youHitPos = null; }
    if (!head && !this.quiet) AUDIO.voice && AUDIO.voice("death", { at: a.pos, vol: 1.1, high: isF(this.info.look) });
    // (the blood where he falls — and the slowed moment, the shake, only if it was you who did it: not every man
    //  going down anywhere on the field)
    blowLands(a, "down", yours ? G.player : { pos: from || a.pos });
    const src = from || G.player.pos, push = new THREE.Vector3(a.pos.x - src.x, 0, a.pos.z - src.z).normalize().multiplyScalar(3.2).add(new THREE.Vector3(0, 0.6, 0));
    P.load = null; P.aimWant = false;
    const gun = P.aimH && P.aimH.obj; if (gun) { P.aimHold(null); P.root.add(gun); dropThing(gun, push.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, 1.2, 0))); }
    for (const h of [P.held, P.heldL]) for (const c of [...h.children]) dropThing(c, push.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 1, 0)));
    this.heldK = null;
    this.rag = ragdoll(P, push, head ? "head" : "chest");
    // (where he lies, a pool; and a ball or a burst that killed him may have taken an arm or a leg with it)
    this.blastDown = !!this.blast; pool(a, this.blast ? 1.4 : 1);
    if (this.blast) sever(a, src, push);
    if (!this.rag) { a.lying = true; a.yOff = 0.05; }
    a.ragdoll = !!this.rag;
  }
  standUp() { heal(this.a.person); if (this.rag) { this.rag.stop(); this.rag = null; } this.a.ragdoll = false; this.a.lying = false; this.a.yOff = 0; this.a.person.setPose("idle"); }
}

// ---------------------------------------------------------------------------
//  the bot: the same arms, the same life, the same rules — and only as quick and as sure as you are
// ---------------------------------------------------------------------------
const DIRS = ["up", "left", "right"];
class Bot extends Fighter {
  constructor(arena, info) {
    super(arena, info);
    this.s = info.skill; this.lo = info.lo; this.team = info.team ?? 1; this.al = info.al ?? this.team; this.idx = info.idx || 0;
    info.rating = botRecord().rating;
  }
  reset(at, face) {
    this.hp = HP; this.standUp(); if (this.info.horse) this.remount(); this.a.place(at.x, at.z, Math.atan2(face.x - at.x, face.z - at.z));
    this.loaded = { long: true, side: this.lo.side === "pistol" }; this.rl = { long: 0, side: 0 };
    this.ammo = AMMO[this.lo.long] || 0;
    this.wind = 0; this.cool = 1; this.stun = 0; this.aimT = 0; this.stepT = 0; this.losT = 0; this.los = true; this.awake = false;
    this.mode = "range"; this.guardT = 0; this.T = null; this.pickT = 0; this.cover = null; this.dodgeT = 0;
    this.nerve = 1; this.brave = (STEADY[this.info.kind] || 1) * (0.85 + this.s * 0.3) * ((this.arena.hist && this.arena.hist.cos && this.arena.hist.cos[this.team] && this.arena.hist.cos[this.team].brave) || 1); this.routing = false; this.blown = 0; this.quietT = 0;
    this.fixed = this.arena.battle && this.steel() === "bayonet"; this.heldK = undefined; this.nades = this.info.nades || 0; this.nadeT = undefined;
    this.hold(this.lo.long); this.a.squareTo = null;
  }
  go() { this.awake = true; this.aimT = -0.9 - Math.random() * 0.6; }
  // a grenade: the fuse lit from his match, the arm swung over, and it's away — a little off, the less steady the man
  throwNade(T) {
    const a = this.a, tp = T.pos, sp = (1 - this.s) * 2.2 + 0.6;
    a.faceTo(tp.x, tp.z); this.aimUp(false); a.person.setPose("overhead");
    setTimeout(() => this.alive && a.person.setPose("idle"), 520);
    const f = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), from = new THREE.Vector3(a.pos.x, a.pos.y + 1.8, a.pos.z).addScaledVector(f, 0.35);
    const to = { x: tp.x + (Math.random() - 0.5) * 2 * sp, z: tp.z + (Math.random() - 0.5) * 2 * sp };
    setTimeout(() => { if (!this.alive || !this.arena.field) return; this.arena.field.throwNade(from, to, this.al); const dd = Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z); if (dd < 22) AUDIO.whoosh && AUDIO.whoosh(0.4 * (1 - dd / 22) ** 1.5, true); }, 260);
    if (Math.random() < 0.5) AUDIO.voice && AUDIO.voice("war", { at: a.pos, vol: 0.7, high: isF(this.info.look) });
  }
  // his steel: the bayonet fixed on his musket if he has the two; else his blade
  steel() { return this.lo.long === "musket" && this.lo.blade === "dagger" && this.tech("bayonet") ? "bayonet" : this.lo.blade; }
  // (what his crown has learnt, in a campaign's battle: without the socket bayonet his blade can't be fixed under the
  //  muzzle; with linear tactics his company loads and fires the quicker. Any other battle: all of it)
  tech(k) { const c = this.arena.hist && this.arena.hist.cos && this.arena.hist.cos[this.team]; return !c || !c.tech || c.tech[k] !== false; }
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
      AUDIO.clang && AUDIO.clang(0.9, this.pos); blowLands(this.a, "parried", by ? by.a : G.player); if (this.arena.rec) this.arena.rec.parried(this);
      this.a.person.setPose(blowPose(this.heldK, "right")); setTimeout(() => this.alive && this.a.person.setPose("idle"), 300);
      this.cool = Math.min(this.cool, 0.4);
      if (by) { by.stun = Math.max(by.stun || 0, 0.8); if (by.isNet && this.arena.net) this.arena.net.send({ t: "dres", how: "parry" }); return; }
      G.player.parryJolt = G.time + 0.3;
      if (!this.arena.parryTold) { this.arena.parryTold = true; UI.hint("He turned it — he was guarding that side (the grey mark). Strike from another.", 4); }
      return;
    }
    // (a pike or a spear against a horseman: the horse runs onto it — twice the harm; and a blow from his side or his
    //  back, or on a man running away, goes in where he can't guard — half again)
    const fromBehind = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (Math.hypot(dx, dz) || 1) < -0.25;
    // (a horseman's blow on a man in a square: the bristling front of it turns most of it)
    const sq = (by ? by.mounted : !!G.player.horse) && this.arena.orderOf && this.arena.orderOf(this) && this.arena.orderOf(this).form === "square" && !this.routing;
    const pike = this.mounted && by && by.steel && (by.steel() === "spear" || by.steel() === "bayonet");
    const k = (this.mounted && by && by.steel && by.steel() === "spear" ? 2 : 1) * (fromBehind || this.routing ? 1.5 : 1) * (sq ? 0.5 : 1);
    // (the point in its chest: the horse goes up on its hind legs, screaming through its nose)
    if (pike && this.a.horse) { this.a.horse.rear(); FOLEY.snort && FOLEY.snort(this.a.pos, 0.7); }
    this.damage(dmg * k, true, false, src);
  }
  // his blade as he uses it: from the saddle, longer in the reach, and heavier at the gallop; a man winded from a long
  // run at the enemy hits weakly and slowly
  blade() { const B = BLADE[this.steel()], w = 1 - (this.blown || 0) * 0.45; return this.mounted ? { ...B, reach: B.reach + 0.8, dmg: B.dmg * (this.a.speed > 5 ? 1.7 : 1.25) * w, rate: B.rate * (0.6 + w * 0.4) } : { ...B, dmg: B.dmg * w, rate: B.rate * (0.6 + w * 0.4) }; }
  // shaken — by a comrade falling by him, a ball in him, a volley into his line: steadier men less
  shaken(k) {
    if (!this.alive || this.nerve == null || !this.arena.battle) return;
    this.nerve = Math.max(0, this.nerve - k / (this.brave || 1)); this.quietT = 0;
    if (!this.routing && this.nerve < 0.22) this.rout();
  }
  // he breaks: weapon down, and away from them as fast as he can go — to the back of the field
  rout() {
    // (nobody breaks in the first minute of a battle: whatever the first volley does, a company stands it out a while —
    //  armies of the day came to the field to fight, and did, before the weaker one gave way)
    if (this.arena.steadyNow && this.arena.steadyNow()) { this.nerve = Math.max(this.nerve, 0.3); return; }
    this.routing = true; this.wind = 0; this.aimUp(false); this.releaseCover && this.releaseCover(); this.a.squareTo = null; this.a.person.crouching = false; this.a.person.setPose("idle");
    if (Math.random() < 0.6) AUDIO.voice && AUDIO.voice("pain", { at: this.pos, vol: 0.8, high: isF(this.info.look) });
    this.arena.broke && this.arena.broke(this);
  }
  // an arrow or a ball in him
  hit(power, head) { this.damage(dmgOf(power, head), false, head); if (head && this.alive && this.arena.youCanSee(this)) UI.hint("In the head.", 1.2); }
  damage(d, melee, head = false, from = null) {
    if (!this.alive || !this.arena.live) return;
    this.hp = Math.max(0, this.hp - d);
    if (this.hp <= 0) { const f = from || (this.T && this.T.pos) || G.player.pos; this.fromX = f.x; this.fromZ = f.z; this.headShot = head; this.fallDown(f, head); this.arena.unitDown(this); return; }
    if (this.arena.host) this.arena.net.send({ t: "bhurt", id: this.uid });
    this.shaken(melee ? 0.07 : 0.1);
    if (this.arena.rec) this.arena.rec.hurt(this);
    blowLands(this.a, "hit", this.youHitPos && G.time - (this.youHitAt ?? -9) < 0.3 ? G.player : { pos: from || this.pos }); this.a.person.flinch && this.a.person.flinch();
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
  // ---- storming a walled town: on the wrong side of the wall, he makes for a way in — a breach, the gate (to hack at
  //  it, if it's still shut), or a ladder (raised, then climbed one man at a time); shooters keep up their fire on the
  //  walls while they've a mark, unless they're ordered in. Returns true while that's what he's doing ----
  storm(dt, T, O) {
    const A = this.arena, S = A.siege, a = this.a;
    if (!S || !S.wall || this.al === S.side || !A.battle) return false;
    if (this.climb) { this.climbTick(dt); return true; }
    if (!A.outside(a.pos) || (T && A.outside(T.pos))) return false;
    const shooter = ["musket", "bow", "crossbow"].includes(this.lo.long);
    if (shooter && this.los && this.loaded.long && !(O && O.charge)) return false;
    const go = (x, z, sp = 3.6) => { if (!a.path.length || this.stepT <= 0) { this.stepT = 1; a.walkTo(x, z, sp); } };
    const way = A.openWay(a.pos);
    if (way) {
      // (through the breach: up the rubble and in)
      if (Math.hypot(a.pos.x - way.out.x, a.pos.z - way.out.z) > 2.2 && A.outside(a.pos)) { if (!a.path.length || this.stepT <= 0) { this.stepT = 1.2; a.walk([[way.out.x + (Math.random() - 0.5) * 2, way.out.z + (Math.random() - 0.5) * 3], [way.inn.x, way.inn.z + (Math.random() - 0.5) * 3]], this.mounted ? 4.2 : 3.6); } }
      else go(way.inn.x, way.inn.z + (Math.random() - 0.5) * 3, 3.4);
      return true;
    }
    if (this.mounted) return false;   // (horse can't climb a ladder: they wait for a way in)
    // the gate: the axemen and the grenadiers, and a share of the rest, at its doors
    const gb = A.field && A.field.breaks.find(b => b.gate && !b.down);
    const W = S.wall, idx = this.info.idx || 0;
    if (gb && (this.steel() === "battleaxe" || this.info.kind === "grenadier" || idx % 4 === 0 || !S.ladders.length)) {
      const gx = gb.x - W.ux * 1.4, gz = gb.z + ((idx % 5) - 2) * 0.9;
      if (Math.hypot(a.pos.x - gx, a.pos.z - gz) > 1.2) { go(gx, gz, 3.6); return true; }
      a.path = []; a.faceTo(gb.x, gz);
      if ((this.hackT = (this.hackT || 0) - dt) <= 0) { this.hackT = 0.9 + Math.random() * 0.5; a.person.setPose("chop"); FOLEY.chop && FOLEY.chop({ x: gb.x, z: gb.z }, 0.5); }
      return true;
    }
    if (!S.ladders.length) return false;
    // his ladder: by his place in the company, spread along the wall
    const L = this.ladder && S.ladders.includes(this.ladder) ? this.ladder : (this.ladder = S.ladders[(idx * 7 + this.team * 3) % S.ladders.length]);
    if (Math.hypot(a.pos.x - L.out.x, a.pos.z - L.out.z) > 1.6) { go(L.out.x - W.ux * Math.random() * 1.2, L.out.z + (Math.random() - 0.5) * 1.4, 3.8); return true; }
    a.path = []; a.faceTo(L.top.x, L.top.z);
    if (!L.up && !(L.fallT > 0)) { L.raiseT = (L.raiseT || 0) + dt; a.person.setPose("reach"); if (L.raiseT > 1.4) A.plantLadder(L); return true; }
    if (L.up && L.raise >= 1 && !(L.fallT > 0) && !(L.busy > 0)) { this.climb = { L, t: 0 }; L.busy = 1.1; a.person.setPose("reach"); AUDIO.voice && Math.random() < 0.5 && AUDIO.voice("war", { at: a.pos, vol: 0.6, high: isF(this.info.look) }); }
    return true;
  }
  // up the ladder, hand over hand, over the parapet and down onto the walk
  climbTick(dt) {
    const c = this.climb, L = c.L, a = this.a, w = this.arena.w;
    if (!L.up || L.fallT > 0) { this.fall(); return; }
    c.t = Math.min(1, c.t + dt / 2.8);
    let x, z, y;
    if (c.t < 0.82) { const k = c.t / 0.82; x = L.out.x + (L.top.x - L.out.x) * k; z = L.out.z + (L.top.z - L.out.z) * k; y = L.footY + (L.topY + 0.35 - L.footY) * k; }
    else { const k = (c.t - 0.82) / 0.18, gy = w.heightAt(L.inn.x, L.inn.z); x = L.top.x + (L.inn.x - L.top.x) * k; z = L.top.z + (L.inn.z - L.top.z) * k; y = L.topY + 0.35 + (gy - L.topY - 0.35) * k; }
    a.path = []; a.pos.x = x; a.pos.z = z; a.yOff = y - w.heightAt(x, z);
    if (Math.floor(c.t * 9) !== Math.floor((c.t - dt / 2.8) * 9)) FOLEY.ladder && Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 25 && FOLEY.ladder(0.25);
    if (c.t >= 1) { this.climb = null; a.yOff = 0; a.place(L.inn.x + (Math.random() - 0.5), L.inn.z + (Math.random() - 0.5), a.yaw); a.person.setPose("guard"); }
  }
  // thrown off it: the ladder pushed down, or a ball as he climbed — down to the foot of the wall, hurt
  fall() {
    const c = this.climb; if (!c) return; this.climb = null;
    const L = c.L, a = this.a, high = c.t; a.yOff = 0;
    a.place(L.out.x - this.arena.siege.wall.ux * (1 + Math.random() * 1.5), L.out.z + (Math.random() - 0.5) * 2, a.yaw);
    AUDIO.voice && AUDIO.voice("pain", { at: a.pos, vol: 0.8, high: isF(this.info.look) });
    if (high > 0.25) this.damage(18 + high * 45, false, false, null);
  }
  // whom he's fighting: the man his officer named, or the nearest of the other side he can see (or just the nearest)
  // (the front between his side and theirs: which way is forward, for his company, and where across it he stands —
  //  worked out a few times a second for the whole side)
  front() {
    const A = this.arena, K = (A._front ||= {}), F0 = K[this.al];
    if (F0 && G.time - F0.t < 0.5) return F0;
    const mates = A.alliesOf(this.team).filter(u => !u.isPlayer), foes = A.enemiesOf(this.team);
    const mid = L => L.length ? L.reduce((m, u) => ({ x: m.x + u.pos.x / L.length, z: m.z + u.pos.z / L.length }), { x: 0, z: 0 }) : null;
    const a = mid(mates), b = mid(foes); if (!a || !b) return null;
    let fx = b.x - a.x, fz = b.z - a.z; const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const F = { t: G.time, fx, fz, px: -fz, pz: fx, ox: (a.x + b.x) / 2, oz: (a.z + b.z) / 2, slot: new Map() };
    // (the men at close quarters along it, each his own place a pace and a half from the next, in the order they stand)
    const lat = p => (p.x - F.ox) * F.px + (p.z - F.oz) * F.pz, mel = mates.filter(u => u.alive && u.mode === "melee" && !u.mounted && !u.crewOf).sort((u, v) => lat(u.pos) - lat(v.pos));
    if (mel.length) { const c = mel.reduce((t, u) => t + lat(u.pos), 0) / mel.length; mel.forEach((u, i) => F.slot.set(u, c + (i - (mel.length - 1) / 2) * 1.5)); }
    // (and where the two lines meet: halfway between the men at close quarters on either side, or between the sides)
    const om = foes.filter(u => u.alive && u.mode === "melee"), fwd = p => (p.x - F.ox) * fx + (p.z - F.oz) * fz;
    if (mel.length && om.length) { const m1 = mel.reduce((t, u) => t + fwd(u.pos), 0) / mel.length, m2 = om.reduce((t, u) => t + fwd(u.pos), 0) / om.length, mid = (m1 + m2) / 2; F.ox += fx * mid; F.oz += fz * mid; }
    return K[this.al] = F;
  }
  // (his own place in his side's line at close quarters: on his side of where the lines meet, at his slot along it)
  lineSpot(reach) {
    const Fr = this.front(); if (!Fr || !Fr.slot.has(this)) return null;
    const l = Fr.slot.get(this), back = Math.max(0.55, (reach - 0.9) / 2);
    return { x: Fr.ox + Fr.px * l - Fr.fx * back, z: Fr.oz + Fr.pz * l - Fr.fz * back };
  }
  pick() {
    const O = this.arena.orderOf && this.arena.orderOf(this), foes = this.arena.enemiesOf(this.team);
    if (O && O.target && O.target.alive && foes.includes(O.target)) return O.target;
    // (at close quarters, in a battle: the man across from him in their line — not the nearest, so that the whole of
    //  his company doesn't fall on the same few and the fight stays two lines, not one great knot; none set on by
    //  more than two while others stand free)
    const Fr = this.mode === "melee" && O && this.arena.battle && !this.mounted && this.front();
    if (Fr) {
      const sp = this.lineSpot(this.blade().reach) || this.pos, lat = p => (p.x - Fr.ox) * Fr.px + (p.z - Fr.oz) * Fr.pz, me = lat(sp), on = new Map();
      for (const m of this.arena.alliesOf(this.team)) if (m !== this && m.T && m.mode === "melee") on.set(m.T, (on.get(m.T) || 0) + 1);
      let best = null, bs = Infinity;
      for (const f of foes) {
        const d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z); if (d > 30) continue;
        const sc = Math.abs(lat(f.pos) - me) * 1.2 + d * 0.35 + Math.max(0, (on.get(f) || 0) - 1) * 4 + (f === this.T ? -1 : 0);
        if (sc < bs) { bs = sc; best = f; }
      }
      if (best) return best;
    }
    // (the sharp officer's men pick their mark: a man out in the open before one behind cover, a man already hurt, a
    //  gun's crew — fire where it'll tell — and never all on one while others go untouched)
    const sharp = this.al !== 0 && (this.arena.kOf(this.team).gen || 0) > 0.5 && this.arena.battle, on = sharp ? new Map() : null;
    if (sharp) for (const m of this.arena.alliesOf(this.team)) if (m !== this && m.T) on.set(m.T, (on.get(m.T) || 0) + 1);
    let best = null, bd = Infinity;
    for (const f of foes) {
      let d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z) * (f === this.T ? 0.8 : 1);
      if (sharp && d > 4.5) d *= (f.cover && f.a && f.a.person.crouching ? 1.5 : 1) * (f.hp != null && f.hp < 55 ? 0.7 : 1) * (f.crewOf ? 0.75 : 1) * (1 + 0.12 * Math.max(0, (on.get(f) || 0) - 2));
      // (a trooper rides for what horse is good against — the gun crews, men running, men out on their own — and
      //  keeps clear of the pikes)
      if (this.mounted) { const pike = f.steel && f.steel() === "spear", alone = !foes.some(g => g !== f && Math.hypot(g.pos.x - f.pos.x, g.pos.z - f.pos.z) < 4); d *= (pike ? 2.6 : 1) * (f.crewOf ? 0.6 : 1) * (f.routing ? 0.5 : 1) * (alone ? 0.7 : 1); }
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  // (a grenadier's mark: where most of theirs stand together, in his throw)
  crowd(T) {
    const foes = this.arena.enemiesOf(this.team); let best = T, bn = 0;
    for (const f of foes) { const d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z); if (d < 9 || d > 26) continue;
      let n = 0; for (const g of foes) if (Math.hypot(g.pos.x - f.pos.x, g.pos.z - f.pos.z) < 3.2) n++; if (n > bn) { bn = n; best = f; } }
    return best;
  }
  tick(dt) {
    if (!this.alive || !this.awake || !this.arena.live || G.mode !== "play") return;
    const a = this.a, s = this.s, pl = G.player;
    // (winded by running — the charge across the field — and breath coming back when he walks or stands)
    this.blown = clamp((this.blown || 0) + (a.speed > 3.6 && a.path.length ? dt * (this.mounted ? 0.025 : 0.055) : -dt * 0.09), 0, 1);
    if (this.nerve != null && this.arena.battle) {
      // (steadied: by quiet — nobody near and no one hit by him for a while — and by you, near your own men; worn by
      //  his company melting away round him)
      this.quietT += dt;
      const near = this.arena.enemiesOf(this.team).some(f => Math.hypot(f.pos.x - a.pos.x, f.pos.z - a.pos.z) < 12);
      const byYou = this.al === 0 && this.arena.you.alive && Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) < 14;
      const mates = this.arena.alliesOf(this.team).length, was = (this.arena.musters && this.arena.musters[this.team] ? this.arena.musters[this.team].length : mates) || 1;
      this.nerve = clamp(this.nerve + dt * ((this.quietT > 4 && !near ? 0.035 : 0) + (byYou ? 0.02 : 0) - (mates / was < 0.45 ? 0.012 : 0)), 0, 1);
      if (!this.routing && this.nerve < 0.22) this.rout();
      if (this.routing) {
        // (rallied, once he's got his breath and his nerve back — and nobody on his heels)
        if (this.nerve > 0.55 && !near) { this.routing = false; this.hold(this.lo.long !== "none" ? this.lo.long : this.steel()); return; }
        const home = this.arena.spawns[this.team] || this.pos, away = Math.atan2(home.x - C.x, home.z - C.z), R = this.arena.bound - 4;
        const tx = C.x + Math.sin(away) * R, tz = C.z + Math.cos(away) * R;
        if (Math.hypot(tx - a.pos.x, tz - a.pos.z) > 3) { if (!a.path.length || (this.stepT -= dt) <= 0) { this.stepT = 1; a.walkTo(tx + (Math.random() - 0.5) * 16, tz + (Math.random() - 0.5) * 16, 4.4); } }
        else { a.path = []; a.person.crouching = true; }
        return;
      }
    }
    // reloading goes on whatever he's doing, as yours does (each weapon its own time)
    const moving = a.path.length > 0;
    for (const k of ["long", "side"]) if (!this.loaded[k] && this.rl[k] > 0) { this.rl[k] -= dt * (moving ? 0.6 : 1) * (k === "long" && this.fixed ? 0.8 : 1) * (this.info.kind === "militia" ? 0.62 : 1) * (this.tech("linear") && /^(musketeer|grenadier)$/.test(this.info.kind || "") && this.arena.hist && this.arena.hist.cos && this.arena.hist.cos[this.team] && this.arena.hist.cos[this.team].tech ? 1.15 : 1); if (this.rl[k] <= 0) this.loaded[k] = true; }
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
    const O = this.arena.orderOf && this.arena.orderOf(this);
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
        // (from the saddle: the horse surges into the blow, its head thrown up)
        if (a.horse) a.horse.strike();
        // (heard from where he is: by you, full; across the field, nothing)
        { const dd = Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z); if (dd < 22) AUDIO.whoosh && AUDIO.whoosh(0.45 * (1 - dd / 22) ** 1.5, this.lo.blade !== "sword"); }
        const B = this.blade();
        this.cool = (1.4 - s * 0.6) / B.rate * (0.85 + Math.random() * 0.3);
        if (d < B.reach - 0.3 && T.alive) {
          if (T.isPlayer) { if (strikeYou(a, this.dir, B.dmg * (pl.horse && this.steel() === "spear" ? 2 : 1), d, this.arena.tips ??= {}) === "parry") { this.stun = 1.0; this.cool = Math.max(this.cool, 1.3); a.person.flinch && a.person.flinch(); } }
          else { T.struck(B.dmg, this.dir, this); FOLEY.chop && FOLEY.chop(T.pos, 0.6); }
        }
      }
      return;
    }
    // (the assault: the way in first, then the fight)
    if (this.storm(dt, T, O)) return;
    const longK = this.lo.long, haveLong = longK !== "none" && this.loaded.long && (longK === "musket" || this.ammo > 0), haveSide = this.loaded.side;
    // (you reloading, close by: his moment to come at you with steel)
    const youReloading = T.isPlayer && ((pl.gun && !pl.gunLoaded) || (pl.xbow && pl.xspan < 1)) && d < 14;
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
      // (a trooper charges in at the gallop, strikes in passing, and rides on through to wheel and come again)
      const B = this.blade(), reach = B.reach - 0.5, run = this.mounted ? 4.2 + s : 3.2 + s * 1.4;
      if (this.mounted && d < 1.6 && this.stepT <= 0) { this.stepT = 1.2; const ang = Math.atan2(a.pos.x - fp.x, a.pos.z - fp.z) + (Math.random() - 0.5) * 0.6; a.walkTo(fp.x - Math.sin(ang) * 9, fp.z - Math.cos(ang) * 9, run); return; }
      // (riding in: the sabre held out straight at the point, the whole weight of man and horse behind it — and the
      //  guard again as he closes)
      if (this.mounted && this.wind <= 0) a.person.setPose(d > 7 && a.speed > 4 ? "point" : "guard");
      // (in a battle's line: he closes to the place on his own side of his man, square across the front — the lines meet
      //  face to face, not in a ring round each other)
      const st = O && this.arena.battle && !this.mounted && !T.isPlayer && d < 16 && this.lineSpot(B.reach);
      if (st) {
        const sd = Math.hypot(st.x - a.pos.x, st.z - a.pos.z);
        if (sd > 0.55 && (this.cool > 0 || d > B.reach - 0.3)) { if (!a.path.length || this.stepT <= 0) { this.stepT = 0.3; a.walkTo(st.x, st.z, sd > 3 ? run : 2.2); } a.faceTo(fp.x, fp.z); return; }
        // (in his place: his man in reach, a blow; else he waits there for one to come, facing across)
        if (d > B.reach - 0.3) { a.path = []; a.faceTo(fp.x, fp.z); this.pickT = Math.min(this.pickT, 0.2); return; }
      }
      if (d > reach + 0.5) { if (!a.path.length || this.stepT <= 0) { this.stepT = 0.35; a.approach(fp, reach - 0.2, run); } }
      else if (d < 1.0) { if (this.stepT <= 0) { this.stepT = 0.5; a.approach(fp, 1.5, 2.4); } }
      else if (this.cool <= 0) {
        a.path = [];
        this.wind = WIND * (1 - s * 0.3) * (T.isPlayer ? 1 : 0.7); this.dir = DIRS[Math.floor(Math.random() * 3)]; a.person.setPose("guard");
        if (Math.random() < 0.6) AUDIO.voice && AUDIO.voice(Math.random() < 0.5 ? "grunt" : "war", { at: a.pos, vol: 0.8, high: isF(this.info.look) });
      } else if (this.stepT <= 0) {
        this.stepT = 0.6 + Math.random() * 0.8;
        // (in the line: a step along it, away from the man at his elbow if he's too close — a pace and a half each — not
        //  round his opponent's back)
        const Fr = O && this.arena.battle && !this.mounted && this.front();
        if (Fr) {
          let push = 0; for (const m of this.arena.alliesOf(this.team)) { if (m === this || m.isPlayer || !m.alive) continue; const ox = m.pos.x - a.pos.x, oz = m.pos.z - a.pos.z, dd = Math.hypot(ox, oz); if (dd < 1.5) push -= Math.sign(ox * Fr.px + oz * Fr.pz || Math.random() - 0.5) * (1.5 - dd); }
          if (Math.abs(push) > 0.1) a.walkTo(a.pos.x + Fr.px * push * 1.2, a.pos.z + Fr.pz * push * 1.2, 1.6); else a.path = [];
        } else if (Math.random() < 0.7) a.circleAbout(fp, reach, 1.4 + s); else a.path = [];
      }
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
      // (but not on the march: the line keeps its order, and loads where it stands; and not a man on a horse, nor one with
      //  only steel — the pikes keep their block)
      const wantCover = field && !this.crewOf && !this.mounted && (O.cover || (!useK && longK !== "none" && s > 0.25 && !this.wasCrew && O.mode !== "advance")) ? (this.cover && this.cover.taken === this ? this.cover : field.coverNear(this.al, want.x, want.z, fp.x, fp.z, O.cover ? 14 : 8, this)) : null;
      if (wantCover !== this.cover) { this.releaseCover(); this.cover = wantCover; if (wantCover) wantCover.taken = this; }
      const goal = this.cover || want, gd = Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z);
      // (behind his cover and not firing: down low)
      a.person.crouching = !!(this.cover && gd < 1.2 && (!useK || !this.los));
      // (at the gun: working it — the loader sponging and ramming, the gunner with the powder and the priming — and
      //  watching where it's laid when it's loaded)
      if (this.crewOf && gd <= 1.6) {
        const W = field.crewWork(this.crewOf, this.crewIdx); a.path = []; this.aimUp(false);
        // (into his exact place for this part of the drill — a step or two along the gun — and to it)
        if (gd > 0.08) { const st = Math.min(gd, dt * 1.7); a.pos.x += (goal.x - a.pos.x) / gd * st; a.pos.z += (goal.z - a.pos.z) / gd * st; }
        a.faceTo(W.face ? W.face.x : fp.x, W.face ? W.face.z : fp.z);
        a.person.crouching = W.crouch; a.person.setPose(W.pose);
        return;
      }
      // the volley: every loaded piece brought up at the word, and fired together
      if (O.volleyAt && G.time < O.volleyAt + 0.4 && useK && useK !== "bow" && this.los) {
        a.path = []; a.faceTo(fp.x, fp.z); this.aimUp(true);
        if (G.time >= O.volleyAt + this.idx * 0.02 && this.volleyed !== O.volleyAt) { this.volleyed = O.volleyAt; this.fire(useK, T); }
        return;
      }
      // (a grenadier, a man close enough and in sight: a grenade lobbed at him — now and then, while he has any — on the
      //  march or standing)
      if (this.nades > 0 && O.fire && this.los && d > 9 && d < 26 && field && (this.nadeT = (this.nadeT ?? 1.5 + Math.random() * 3) - dt) <= 0) {
        this.nadeT = 7 + Math.random() * 4; this.nades--; a.path = []; this.throwNade(this.al !== 0 && (this.arena.kOf(this.team).gen || 0) > 0.5 ? this.crowd(T) : T); return;
      }
      // (on the march, loaded, and a man of theirs in range and in sight: he halts, presents, fires — and loads as he
      //  goes on again)
      const engage = useK && useK !== "bow" && O.fire && this.los && O.mode === "advance" && d < RANGE[useK] * this.arena.sight * 0.8;
      if (gd > 1.4 && !engage) {
        this.aimT = 0; this.aimUp(false); a.person.setPose("idle");
        if (!a.path.length || this.stepT <= 0) { this.stepT = 0.5; a.walkTo(goal.x, goal.z, gd > 6 || O.mode === "advance" ? 3.4 + s * 0.8 : 1.8); }
        return;
      }
      a.path = [];
      if (!useK || !O.fire || !this.los || d > RANGE[useK] * this.arena.sight) { this.aimT = 0; this.aimUp(false); a.faceTo(fp.x, fp.z); if (!useK && this.heldK !== longK && longK !== "none") this.hold(longK); return; }
      if (this.heldK !== useK) { this.hold(useK); this.aimT = -0.5; }
      a.faceTo(fp.x, fp.z); a.person.setPose("idle"); this.aimUp(true);
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
      const cv = field && field.coverNear(this.al, a.pos.x, a.pos.z, fp.x, fp.z, 10, this);
      if (cv) { if (Math.hypot(cv.x - a.pos.x, cv.z - a.pos.z) > 0.8 && (!a.path.length || this.stepT <= 0)) { this.stepT = 0.6; a.walkTo(cv.x, cv.z, 3.4 + s); } else if (a.path.length === 0) a.faceTo(fp.x, fp.z); return; }
      if (this.stepT <= 0) { this.stepT = 1.2 + Math.random() * 1.2; a.circleAbout(fp, clamp(d, 12, 30), 2.4 + s); }
      return;
    }
    if (this.heldK !== useK) { this.hold(useK); this.aimT = -0.5; }
    const R = RANGE[useK] * this.arena.sight;
    if (!this.los || d > R) {
      // in closer — not straight at you, but slanting this way and that — or round to where he can see you
      this.aimT = 0; a.person.setPose("idle"); this.aimUp(false);
      if (!a.path.length || this.stepT <= 0) { this.stepT = 0.9; if (!this.los && d < R) a.circleAbout(fp, Math.max(6, d - 3), 3 + s); else { const ang = Math.atan2(a.pos.x - fp.x, a.pos.z - fp.z) + (Math.random() - 0.5) * 0.9, rr = Math.max(R * 0.7, d - 7); a.walkTo(fp.x + Math.sin(ang) * rr, fp.z + Math.cos(ang) * rr, 3.2 + s); } }
      return;
    }
    // aimed: he stands, brings it up, takes his time (less, the better he is), and fires
    a.path = []; a.faceTo(fp.x, fp.z); a.person.setPose("idle"); this.aimUp(true);
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
    if (this.arena.host) this.arena.net.send({ t: "bfire", id: this.uid, k, f: [from.x, from.y, from.z].map(v => +v.toFixed(2)), d: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)) });
  }
}

// ---------------------------------------------------------------------------
//  a soldier on the other player's field, as their game has him: moved, posed, armed, loading, struck down — all as
//  it's told; your shots and blows on him told back to it
// ---------------------------------------------------------------------------
class Puppet extends Fighter {
  constructor(arena, info) {
    super(arena, info);
    this.team = info.team; this.idx = info.idx; this.uid = info.uid; this.lo = info.lo;
    this.fixed = arena.battle && this.lo.long === "musket" && this.lo.blade === "dagger";
    this.tx = this.a.pos.x; this.tz = this.a.pos.z; this.tyaw = 0; this.spd = 0; this.T = null;
  }
  reset(at, face) {
    this.hp = HP; this.standUp(); if (this.info.horse) this.remount(); this.a.place(at.x, at.z, Math.atan2(face.x - at.x, face.z - at.z)); this.tx = at.x; this.tz = at.z; this.tyaw = this.a.yaw;
    this.heldK = undefined; this.hold(this.crewOf ? null : this.lo.long !== "none" ? this.lo.long : this.lo.blade);
  }
  hold(k) { super.hold(k); if (k === "musket" && this.fixed && this.gun) addBayonet(this.gun); }
  go() {}
  steel() { return this.fixed ? "bayonet" : this.lo.blade; }
  // as their game has him this moment: [id, x, z, yaw, flags, pose, held, loading]
  snap(e) {
    const [, x, z, yaw, fl, pose, held, ld] = e;
    if (!this.alive) return;
    this.spd = Math.hypot(x - this.tx, z - this.tz) * 10; this.tx = x; this.tz = z; this.tyaw = yaw;
    if (held !== undefined && (held || null) !== (this.heldK || null)) this.hold(held || null);
    const P = this.a.person;
    if (pose && P.pose !== pose) P.setPose(pose);
    P.crouching = !!(fl & 4); this.aimUp(!!(fl & 2));
    this.wind = fl & 8 ? 0.3 : 0; this.dir = ["up", "left", "right"][(fl >> 5) & 3] || "right";
    this.T = fl & 16 ? this.arena.you : null;
    // (loading: the drill as their game has it, and its sounds)
    if (ld > 0 && (held === "musket" || held === "pistol")) { const e0 = this.loadE ?? ld; this.loadE = ld; P.load = { kind: held, e: ld }; for (const st of loadSteps(held, e0, ld)) FOLEY.load && FOLEY.load(st, this.a.pos, 0.6, held === "pistol"); }
    else { P.load = null; this.loadE = null; }
  }
  view() { return { ...super.view(), duel: this.T === this.arena.you ? G.player : null }; }
  // your blade on him, or your ball: told to their game, which judges it
  struck(dmg, side) { const n = this.arena.net; if (n && this.alive) n.send({ t: "bstrike", id: this.uid, dmg: Math.round(dmg), dir: side }); }
  hit(power, head) { const n = this.arena.net; if (!this.alive || !this.arena.live) return; if (n) n.send({ t: "bhit", id: this.uid, dmg: dmgOf(power, head), head: !!head }); blowLands(this.a, "hit"); if (head) UI.hint("In the head.", 1.2); }
  damage() {}
  tick(dt) {
    if (this.rag || !this.alive) return;
    const a = this.a, k = Math.min(1, dt * 8);
    a.pos.x += (this.tx - a.pos.x) * k; a.pos.z += (this.tz - a.pos.z) * k;
    let dy = this.tyaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * k; a.targetYaw = a.yaw;
    a.speed = this.spd || 0; a.path = [];
    a.sync();
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
    if (this.wind <= 0) this.a.person.setPose(m.dn ? "idle" : m.g ? "guard" : "idle");
    this.aimUp(!!m.aim);
    // (loading: the drill as their game has it, and its sounds from where they stand)
    if (m.ld > 0 && (m.h === "musket" || m.h === "pistol")) { const e0 = this.loadE ?? +m.ld; this.loadE = +m.ld; this.a.person.load = { kind: m.h, e: +m.ld }; for (const st of loadSteps(m.h, e0, +m.ld)) FOLEY.load && FOLEY.load(st, this.a.pos, 0.6, m.h === "pistol"); }
    else { this.a.person.load = null; this.loadE = null; }
    this.guardDir = m.g ? "right" : null;
    if (m.dn && !this.isDown) {
      this.isDown = true; this.fallDown(G.player.pos);
      // (in a battle, down is down: counted fallen at once, whatever health their game last told — a man knocked flat and
      //  not quite dead was still "standing" here, his body struck at for ever, and the battle could never end)
      if (this.arena.netBattle && this.hp > 0) { this.hp = 0; this.arena.unitDown(this); }
    }
    if (!m.dn && this.isDown) { this.isDown = false; this.standUp(); }
  }
  windUp(dir) { this.wind = 0.35; this.dir = dir === "left" ? "right" : dir === "right" ? "left" : "up"; this.a.person.setPose(blowPose(this.heldK, dir)); glint(this.a); setTimeout(() => { this.wind = 0; this.a.person.setPose("idle"); }, 450); }
  // your blade on them — or one of your men's: they judge it, on their screen, against their guard
  struck(dmg, side, by = null) {
    if (!this.arena.netBattle || !by || !this.arena.net) return;
    this.arena.net.send({ t: "bswing", id: by.uid, dir: side, dmg: Math.round(dmg) });
  }
  // a round shot through them, on your field: told to them
  damage(d) { if (this.arena.live && this.arena.net) this.arena.net.send({ t: "dhit", dmg: Math.min(130, Math.round(d)), head: false }); }
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
