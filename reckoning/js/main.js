// ===========================================================================
//  FORESTER: RECKONING
//  Copyright (c) 2026 Roan Fraese, trading as DeadlyDog Productions.
//  All rights reserved. See reckoning/LICENSE.
// ===========================================================================

// Boot, the front door, the pause menu, and the loop.

import { renderer } from "./core.js";
import { G, Player, frame, setAtmo, input, drawMap } from "./engine.js";
import { INK as MAPINK, SERIF as MAPSERIF, compass as mapCompass } from "./map.js";
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
  if (overlay) showOverlay(overlay, false);
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
    if (c.n > u) continue;             // what you have not reached yet is not shown at all
    const b = document.createElement("button");
    b.className = "chapter" + (c.n > u ? " locked" : "");
    b.innerHTML = `<span class="ch-n">${["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][c.n - 1]}</span><span class="ch-t">${c.title}</span><span class="ch-k">${c.n > u ? "Not yet reached" : c.kicker}</span>`;
    b.disabled = c.n > u;
    b.onclick = () => { G.who = s.who || "brother"; if (c.n === 6 && s.clearing && s.clearing.done) writeSave({ clearing: {} }); play(c.n); };
    list.appendChild(b);
  }
}

// ---- inventory (T) ----
const ICON = {
  key: "art/item_key.png", blackberries: "art/item_blackberries.png", ledger: "art/item_ledger.png", door: "art/item_door.png", spade: "art/item_spade.png", seeds: "../assets/sprites/items/seeds.png",
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
// ---- overlays (inventory, map): one at a time; the cursor comes back and you stand still ----
let overlay = null, overlayTimer = 0, overlayLockMove = false;
const OVERLAYS = {
  inventory: { open: () => renderInventory(), tick: () => renderInventory(), every: 300, close: () => $("invTip").classList.add("hidden") },
  bigmap: { open: () => renderBigMap(), tick: () => renderBigMap(), every: 250 },
};
function showOverlay(id, on) {
  if (on && overlay && overlay !== id) showOverlay(overlay, false);
  const open = overlay === id;
  if (on === open) return;
  const o = OVERLAYS[id];
  UI.show(id, on);
  clearInterval(overlayTimer);
  if (on) {
    overlay = id;
    o.open(); overlayTimer = setInterval(o.tick, o.every);
    if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); }
    setFreeLook(false);
    overlayLockMove = G.lockMove; G.lockMove = true;
  } else {
    overlay = null;
    o.close && o.close();
    G.lockMove = overlayLockMove;
    if (G.mode === "play") lock();
  }
}
function showInventory(on) { showOverlay("inventory", on); }
G.showInventory = showInventory;

// ---- the hotbar: nine slots along the bottom; 1-9 picks one; the axe's slot takes it out or puts it away ----
function hotbarItems() {
  const pl = G.player, out = [];
  if (pl.hasAxe) out.push({ icon: "axe", name: "Old felling axe", tool: "axe" });
  if (pl.carryN > 0) out.push({ icon: "logs", name: "Spruce logs", n: pl.carryN });
  else if (UI.carrying && /ledger/i.test(UI.carrying)) out.push({ icon: "ledger", name: UI.carrying });
  for (const i of G.pack) out.push(i);
  return out.slice(0, 9);
}
let hbSig = "";
function renderHotbar() {
  const hb = $("hotbar"); if (!hb) return;
  const show = G.mode === "play";
  hb.style.display = show ? "flex" : "none";
  if (!show) return;
  hb.classList.toggle("hidden-by-talk", !!UI.dialogOpen);
  const items = hotbarItems(), pl = G.player;
  const sel = items.findIndex(i => i.tool === "axe" && pl.axe);
  const sig = items.map(i => i.icon + (i.n ?? "")).join("|") + "#" + sel;
  if (sig === hbSig) return;
  hbSig = sig;
  hb.innerHTML = Array.from({ length: 9 }, (_, k) => {
    const it = items[k];
    return `<div class="hb${k === sel ? " sel" : ""}"><span class="k">${k + 1}</span>${it ? `<img src="${ICON[it.icon]}" alt="${esc(it.name)}" title="${esc(it.name)}">${it.n != null && it.n !== 1 ? `<span class="n">${esc(it.n)}</span>` : ""}` : ""}</div>`;
  }).join("");
}
setInterval(renderHotbar, 200);
addEventListener("keydown", e => {
  if (G.mode !== "play" || overlay || !/^Digit[1-9]$/.test(e.code)) return;
  const it = hotbarItems()[+e.code.slice(5) - 1];
  if (it && it.tool === "axe") G.player.holsterAxe(!!G.player.axe);
});

// ---- the full map (J) ----
function renderBigMap() {
  const cv = $("bigmapCanvas"), w = G.world;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cssW = Math.min(innerWidth - 40, (innerHeight - 40) * 1.45), cssH = Math.min(innerHeight - 40, cssW / 1.45);
  if (cv.width !== Math.round(cssW * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.width = cssW + "px"; cv.style.height = cssH + "px"; }
  const c = cv.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  const W = cv.width / dpr, H = cv.height / dpr;
  const b = w.mapBounds || { x0: -100, x1: 100, z0: -100, z1: 100 };
  const S = Math.min((W - 60) / (b.x1 - b.x0), (H - 60) / (b.z1 - b.z0));
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const X = x => W / 2 + (x - cx) * S, Z = z => H / 2 + (z - cz) * S;
  // draw at CSS size into a scaled context; the map code reads the canvas size, so give it one that matches
  const sub = { canvas: { width: W, height: H } };
  c.save(); c.scale(dpr, dpr);
  const proxy = new Proxy(c, { get: (t, k) => k === "canvas" ? sub.canvas : (typeof t[k] === "function" ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  drawMap(proxy, X, Z, S, true, cx, cz, Math.hypot(b.x1 - b.x0, b.z1 - b.z0));
  // burnt, darkened edges
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, "rgba(90,55,20,0)"); g.addColorStop(1, "rgba(70,40,15,0.55)");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // a double ruled border
  c.strokeStyle = MAPINK; c.lineWidth = 2; c.strokeRect(10, 10, W - 20, H - 20); c.lineWidth = 0.8; c.strokeRect(15, 15, W - 30, H - 30);
  // the cartouche: the map's title in a scroll
  const t = w.mapTitle || "";
  c.font = `italic 26px ${MAPSERIF}`; const tw = c.measureText(t).width;
  c.fillStyle = "rgba(236,222,186,0.95)"; c.strokeStyle = MAPINK; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(30, 28, tw + 56, 50, 8); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(35, 33, tw + 46, 40, 5); c.stroke();
  c.fillStyle = MAPINK; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(t, 58, 54);
  mapCompass(c, W - 70, 80, 42);
  // a scale bar: fifty paces
  const px = 50 * 0.75 * S;
  c.fillStyle = MAPINK; c.fillRect(34, H - 42, px, 4); c.fillStyle = "#e9dcb8"; c.fillRect(34 + px / 2, H - 41, px / 2 - 1, 2);
  c.font = `italic 12px ${MAPSERIF}`; c.fillStyle = MAPINK; c.textAlign = "left"; c.fillText("fifty paces", 34, H - 52);
  c.restore();
}
G.showMap = on => showOverlay("bigmap", on);

// ---- pause ----
function pause() {
  if (G.mode !== "play") return;
  G.mode = "pause";
  setFreeLook(false);
  if (overlay) showOverlay(overlay, false);
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
  if (e.code === "KeyT" && !e.repeat && G.mode === "play") showOverlay("inventory", overlay !== "inventory");
  if (e.code === "KeyJ" && !e.repeat && G.mode === "play") showOverlay("bigmap", overlay !== "bigmap");
  if (e.code === "Escape" && overlay) { showOverlay(overlay, false); return; }
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
