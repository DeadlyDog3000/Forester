// ===========================================================================
//  FORESTER: RECKONING
//  Copyright (c) 2026 Roan Fraese, trading as DeadlyDog Productions.
//  All rights reserved. See reckoning/LICENSE.
// ===========================================================================

// Boot, the front door, the pause menu, and the loop.

import { renderer } from "./core.js";
import { G, Player, frame, setAtmo, input } from "./engine.js";
import { UI, $ } from "./ui.js";
import { AUDIO } from "./audio.js";
import { CHAPTERS, LOOKS, startChapter, loadSave, writeSave, clearSave } from "./story.js";
import { CHANGELOG } from "./changelog.js";
import { loadModels } from "./models.js";

/* global SFX */

$("view").appendChild(renderer.domElement);

// ---- settings ----
const SET_KEY = "reckoning.settings.v1";
try { Object.assign(G.settings, JSON.parse(localStorage.getItem(SET_KEY)) || {}); } catch (e) {}
G.saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(G.settings)); } catch (e) {} };
function applySettings() {
  const s = G.settings;
  try { SFX.setMaster(s.volume); } catch (e) {}
  window.__reckonMusic = s.music;
  AUDIO.setMusicVolume(s.music ? 1 : 0);
  $("setSens").value = s.sens; $("setFov").value = s.fov; $("setVol").value = s.volume;
  $("setInvert").checked = s.invert; $("setMusic").checked = s.music; $("setThird").checked = s.third;
  $("setQuality").value = s.quality || "high";
  const low = s.quality === "low";
  if (renderer.shadowMap.enabled === low) {
    // shadows on or off: every material has to be rebuilt to match
    renderer.shadowMap.enabled = !low;
    G.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  renderer.setPixelRatio(low ? Math.min(devicePixelRatio, 1) * 0.8 : Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  $("sensVal").textContent = (+s.sens).toFixed(2); $("fovVal").textContent = s.fov + "°"; $("volVal").textContent = Math.round(s.volume * 100) + "%";
}
for (const [id, key, num] of [["setSens", "sens", true], ["setFov", "fov", true], ["setVol", "volume", true]]) {
  $(id).addEventListener("input", e => { G.settings[key] = num ? +e.target.value : e.target.value; applySettings(); G.saveSettings(); });
}
$("setQuality").addEventListener("change", e => { G.settings.quality = e.target.value; applySettings(); G.saveSettings(); });
for (const [id, key] of [["setInvert", "invert"], ["setMusic", "music"], ["setThird", "third"]]) {
  $(id).addEventListener("change", e => { G.settings[key] = e.target.checked; applySettings(); G.saveSettings(); });
}

// ---- the player's body exists from the start; the look is set on choosing ----
G.player = new Player();

// ---- screens ----
const screens = ["title", "choose", "chapters", "settings", "controls", "pause", "updates"];
let back = "title";
function screen(id) {
  for (const s of screens) UI.show(s, s === id);
  $("menus").classList.toggle("hidden", !id);
}
function refreshTitle() {
  const s = loadSave();
  UI.show("btnContinue", !!s);
  $("btnContinue").textContent = s ? `Continue — ${CHAPTERS[(s.chapter || 1) - 1].title}` : "Continue";
  UI.show("btnChapters", !!s);
}
function toTitle() {
  G.mode = "title";
  showInventory(false);
  setFreeLook(false);
  document.exitPointerLock && document.exitPointerLock();
  UI.show("hud", false);
  UI.fadeNow(0);
  AUDIO.music("title");
  refreshTitle();
  screen("title");
  $("menus").classList.add("backdrop");
}
G.toTitle = toTitle;

// M lets go of the mouse without pausing, so that release must not pause
let freeMouse = false;
function setFreeLook(on) {
  input.freeLook = on;
  document.body.style.cursor = on ? "none" : "";
}
// take the mouse; where the browser refuses the lock, look with a hidden free cursor instead
function lock() {
  const el = renderer.domElement;
  try { const p = el.requestPointerLock && el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  setTimeout(() => {
    if (document.pointerLockElement || G.mode !== "play") return;
    setFreeLook(true);
    // some embedded browsers forbid the lock outright; say so once, rather than let the cursor wander off
    if (!lock.warned) { lock.warned = true; UI.hint("This browser will not lock the mouse, so the cursor can leave the window. Open the game in Chrome or Safari to look around freely.", 8); }
  }, 250);
}
// M: lock the mouse, or where the browser refuses the lock, look with a hidden free cursor
function toggleMouse() {
  if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); return; }
  if (input.freeLook) { setFreeLook(false); return; }
  lock();
}
function play(chapter, opts) {
  AUDIO.init();
  applySettings();
  G.mode = "play";
  screen(null);
  $("menus").classList.remove("backdrop");
  UI.show("hud", true);
  G.player.setModel(LOOKS[G.who]);
  G.player.model.scaleBase = LOOKS[G.who].scale;
  lock();
  startChapter(chapter, opts);
}

$("btnNew").onclick = () => { back = "title"; screen("choose"); };
$("btnContinue").onclick = () => { const s = loadSave(); G.who = s.who || "brother"; play(s.chapter || 1); };
$("btnChapters").onclick = () => { buildChapters(); back = "title"; screen("chapters"); };
$("btnSettings").onclick = () => { back = "title"; screen("settings"); };
$("btnControls").onclick = () => { back = "title"; screen("controls"); };
$("btnUpdates").onclick = () => { back = "title"; screen("updates"); };
$("updateList").innerHTML = CHANGELOG.map(u => `<article class="upd"><div class="upd-head"><span class="upd-v">${u.v}</span><span class="upd-t">${u.title}</span><span class="upd-d">${u.date}</span></div><ul>${u.items.map(i => `<li>${i}</li>`).join("")}</ul></article>`).join("");
for (const b of document.querySelectorAll("[data-back]")) b.onclick = () => screen(back);
for (const b of document.querySelectorAll("[data-who]")) b.onclick = () => {
  G.who = b.dataset.who;
  // a new game starts the clearing from nothing
  const s = loadSave() || {};
  clearSave();
  writeSave({ who: G.who, chapter: 1, unlocked: s.unlocked || 1 });
  play(1);
};
function buildChapters() {
  const s = loadSave() || {}, u = s.unlocked || 1;
  const list = $("chapterList");
  list.innerHTML = "";
  for (const c of CHAPTERS) {
    const b = document.createElement("button");
    b.className = "chapter" + (c.n > u ? " locked" : "");
    b.innerHTML = `<span class="ch-n">${["I", "II", "III", "IV", "V", "VI"][c.n - 1]}</span><span class="ch-t">${c.title}</span><span class="ch-k">${c.n > u ? "Not yet reached" : c.kicker}</span>`;
    b.disabled = c.n > u;
    b.onclick = () => { G.who = s.who || "brother"; if (c.n === 6 && s.clearing && s.clearing.done) writeSave({ clearing: {} }); play(c.n); };
    list.appendChild(b);
  }
}

// ---- inventory (T) ----
const ICON = {
  key: "art/item_key.png", blackberries: "art/item_blackberries.png", ledger: "art/item_ledger.png", door: "art/item_door.png",
  axe: "../assets/sprites/items/tool_iron.png", logs: "../assets/sprites/items/logs.png", cabin: "../assets/sprites/buildings/log_cabin_32.png",
};
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let invItems = [];
function slot(it, cap) {
  if (!it) return `<div class="mc-slot"></div>`;
  invItems.push(it);
  const i = invItems.length - 1;
  return `<div class="mc-slot${it.dim ? " dim" : ""}" data-i="${i}"><img src="${ICON[it.icon]}" alt="">${it.n != null && it.n !== 1 ? `<span class="mc-n">${esc(it.n)}</span>` : ""}${cap ? `<span class="mc-cap">${esc(cap)}</span>` : ""}</div>`;
}
function renderInventory() {
  const pl = G.player, camp = G.camp;
  invItems = [];
  // the two hands: the tool, and whatever else you hold
  const hands = [null, null];
  if (pl.axe) hands[0] = { icon: "axe", name: "Old felling axe", note: "Grey haft, good head.", use: "Click to swing" };
  if (pl.carryN > 0) hands[1] = { icon: "logs", n: pl.carryN, name: "Spruce logs", note: camp ? `Your arms hold ${camp.carryMax}.` : "", use: "Stack them by the cabin" };
  else if (UI.carrying) hands[/ledger/i.test(UI.carrying) ? 0 : 1] = { icon: /ledger/i.test(UI.carrying) ? "ledger" : "logs", name: UI.carrying, note: /ledger/i.test(UI.carrying) ? "The tally of the Baltic grain, for Jakob to sign." : "" };
  let html = `<div class="mc-sec">Hands</div><div class="mc-row hands">${slot(hands[0])}${slot(hands[1])}</div>`;
  // what is on you: three rows of nine
  const pack = G.pack.slice(0, 27);
  html += `<div class="mc-sec">On you</div>`;
  for (let r = 0; r < 3; r++) html += `<div class="mc-row">${Array.from({ length: 9 }, (_, c) => slot(pack[r * 9 + c])).join("")}</div>`;
  if (camp) {
    html += `<div class="mc-sec">At the clearing</div><div class="mc-row">`;
    html += slot({ icon: "logs", n: camp.logs, name: "Logs on the stack", note: `${camp.logs} stacked by the cabin.`, dim: camp.logs === 0 });
    html += slot({ icon: "door", name: "Door", note: camp.door ? "Hewn. Crooked, and perfect." : `Hew it at the block: ${camp.doorCost} logs from the stack.`, dim: !camp.door });
    html += slot({ icon: "cabin", n: `${Math.min(camp.logs, camp.cabinCost)}/${camp.cabinCost}`, name: "The cabin", note: `Needs ${camp.cabinCost} logs and the door.`, dim: !(camp.door && camp.logs >= camp.cabinCost) });
    html += `${"<div class=\"mc-slot\"></div>".repeat(6)}</div>`;
  }
  $("invBody").innerHTML = html;
}
function showTip(e) {
  const tip = $("invTip"), el = e.target.closest && e.target.closest(".mc-slot[data-i]");
  if (!el) { tip.classList.add("hidden"); return; }
  const it = invItems[+el.dataset.i];
  tip.innerHTML = `${esc(it.name)}${it.note ? `<span class="tip-note">${esc(it.note)}</span>` : ""}${it.use ? `<span class="tip-use">${esc(it.use)}</span>` : ""}`;
  tip.classList.remove("hidden");
  tip.style.left = Math.min(e.clientX + 16, innerWidth - tip.offsetWidth - 8) + "px";
  tip.style.top = Math.max(8, e.clientY - 30) + "px";
}
$("inventory").addEventListener("mousemove", showTip);
$("inventory").addEventListener("mouseleave", () => $("invTip").classList.add("hidden"));
let invTimer = 0, invLockMove = false;
function showInventory(on) {
  const open = !$("inventory").classList.contains("hidden");
  if (on === open) return;
  UI.show("inventory", on);
  $("invTip").classList.add("hidden");
  clearInterval(invTimer);
  if (on) {
    renderInventory(); invTimer = setInterval(renderInventory, 300);
    // the cursor comes back to point at things, and you stand still while you look
    if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); }
    setFreeLook(false);
    invLockMove = G.lockMove; G.lockMove = true;
  } else {
    G.lockMove = invLockMove;
    if (G.mode === "play") lock();
  }
}
G.showInventory = showInventory;

// ---- pause ----
function pause() {
  if (G.mode !== "play") return;
  G.mode = "pause";
  setFreeLook(false);
  showInventory(false);
  SFX.pauseAll && SFX.pauseAll(true);
  back = "pause";
  screen("pause");
}
function resume() {
  G.mode = "play";
  SFX.pauseAll && SFX.pauseAll(false);
  screen(null);
  lock();
}
$("btnResume").onclick = resume;
$("btnPauseSettings").onclick = () => { back = "pause"; screen("settings"); };
$("btnPauseControls").onclick = () => { back = "pause"; screen("controls"); };
$("btnRestart").onclick = () => { SFX.pauseAll && SFX.pauseAll(false); screen(null); G.mode = "play"; lock(); startChapter(G.chapter || 1); };
$("btnQuit").onclick = () => { SFX.pauseAll && SFX.pauseAll(false); AUDIO.music(null); toTitle(); };
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement) freeMouse = false;
  else if (G.mode === "play" && !freeMouse) pause();
});
addEventListener("keydown", e => {
  if (e.code === "Escape" && G.mode === "pause" && !document.pointerLockElement) { /* the browser ate the first Escape */ }
  // with no lock to lose, Escape has to pause by hand
  if (e.code === "Escape" && G.mode === "play" && input.freeLook) pause();
  if (e.code === "KeyP" && G.mode === "play") { document.exitPointerLock && document.exitPointerLock(); pause(); }
  if (e.code === "KeyT" && !e.repeat && G.mode === "play") showInventory($("inventory").classList.contains("hidden"));
  if (e.code === "Escape" && !$("inventory").classList.contains("hidden")) { showInventory(false); return; }
  // M takes the mouse into the game, or gives it back
  if (e.code === "KeyM" && !e.repeat) {
    if (G.mode === "pause") resume();
    else if (G.mode === "play") toggleMouse();
  }
});
// a click on the world while playing re-takes the mouse
renderer.domElement.addEventListener("click", () => { if (G.mode === "play" && !document.pointerLockElement && !input.freeLook) lock(); });

// ---- the loop ----
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // free look cannot pass the window's edge, so a cursor resting near one keeps turning
  if (input.freeLook && G.mode === "play" && input.mx >= 0) {
    const band = Math.min(90, innerWidth * 0.12), rate = 900 * dt;
    const edge = (p, size) => p < band ? -(1 - p / band) : p > size - band ? (p - (size - band)) / band : 0;
    input.mdx += edge(input.mx, innerWidth) * rate;
    input.mdy += edge(input.my, innerHeight) * rate * 0.5;
  }
  if (!window.__manual) frame(dt);    // (tests step the game themselves)
  requestAnimationFrame(loop);
}

// the title screen stands over a slow view of nothing in particular
setAtmo("evening");
applySettings();
toTitle();
addEventListener("pointerdown", () => { AUDIO.init(); applySettings(); if (G.mode === "title") AUDIO.music("title"); }, { once: true });
requestAnimationFrame(loop);
// models from Blender, if any are listed, are loaded before the first chapter can start
loadModels().finally(() => $("loading").remove());
// for testing from the console: __play(3) starts the third chapter
window.__play = (n, who = "brother", opts) => { G.who = who; play(n, opts); };
