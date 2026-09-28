// ===========================================================================
//  FORESTER: RECKONING
//  Copyright (c) 2026 Roan Fraese, trading as DeadlyDog Productions.
//  All rights reserved. See reckoning/LICENSE.
// ===========================================================================

// Boot, the front door, the pause menu, and the loop.

import { renderer } from "./core.js";
import { G, Player, frame, setAtmo } from "./engine.js";
import { UI, $ } from "./ui.js";
import { AUDIO } from "./audio.js";
import { CHAPTERS, LOOKS, startChapter, loadSave, writeSave, clearSave } from "./story.js";
import { VOICE } from "./voice.js";
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
  $("setVoices").checked = s.voices !== false; VOICE.enabled = s.voices !== false; if (!VOICE.enabled) VOICE.stop();
  $("sensVal").textContent = (+s.sens).toFixed(2); $("fovVal").textContent = s.fov + "°"; $("volVal").textContent = Math.round(s.volume * 100) + "%";
}
for (const [id, key, num] of [["setSens", "sens", true], ["setFov", "fov", true], ["setVol", "volume", true]]) {
  $(id).addEventListener("input", e => { G.settings[key] = num ? +e.target.value : e.target.value; applySettings(); G.saveSettings(); });
}
$("setQuality").addEventListener("change", e => { G.settings.quality = e.target.value; applySettings(); G.saveSettings(); });
for (const [id, key] of [["setInvert", "invert"], ["setMusic", "music"], ["setThird", "third"], ["setVoices", "voices"]]) {
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
  document.exitPointerLock && document.exitPointerLock();
  UI.show("hud", false);
  UI.fadeNow(0);
  AUDIO.music("title");
  refreshTitle();
  screen("title");
  $("menus").classList.add("backdrop");
}
G.toTitle = toTitle;

function lock() {
  const el = renderer.domElement;
  try { const p = el.requestPointerLock && el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function play(chapter, opts) {
  AUDIO.init();
  applySettings();
  G.mode = "play";
  screen(null);
  $("menus").classList.remove("backdrop");
  UI.show("hud", true);
  VOICE.narratorGender = G.who === "brother" ? "m" : "f";
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

// ---- pause ----
function pause() {
  if (G.mode !== "play") return;
  G.mode = "pause";
  VOICE.stop();
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
  if (!document.pointerLockElement && G.mode === "play") pause();
});
addEventListener("keydown", e => {
  if (e.code === "Escape" && G.mode === "pause" && !document.pointerLockElement) { /* the browser ate the first Escape */ }
  if (e.code === "KeyP" && G.mode === "play") { document.exitPointerLock && document.exitPointerLock(); pause(); }
});
// a click on the world while playing re-takes the mouse
renderer.domElement.addEventListener("click", () => { if (G.mode === "play" && !document.pointerLockElement) lock(); });

// ---- the loop ----
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
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
