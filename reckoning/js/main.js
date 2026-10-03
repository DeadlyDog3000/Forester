// ===========================================================================
//  FORESTER: RECKONING
//  Copyright (c) 2026 Roan Fraese, trading as DeadlyDog Productions.
//  All rights reserved. See reckoning/LICENSE.
// ===========================================================================

// Boot, the front door, the pause menu, and the loop.

import { renderer, clamp } from "./core.js";
import { G, Player, frame, setAtmo, input, drawMap, setGraphics, dm, post } from "./engine.js";
import { INK as MAPINK, SERIF as MAPSERIF, compass as mapCompass } from "./map.js";
import { BUILDINGS as TOWN_BUILDINGS, JOBS, MAT_NAME, YEAR, UPGRADES, WORKS, SHED_BAYS } from "./town.js";
import { TECH, TECH_TREES, techCost, techTime } from "./gov.js";
import { FURNITURE } from "./furnish.js";
import { UI, $ } from "./ui.js";
import { AUDIO } from "./audio.js";
import { FOOD, BODY_SKILLS, SKILL_MAX, xpFor, TIER_NAME, TOOL_RECIPES, ITEM, nextTier, PLAGUE_SECS, roomFor, packSlots, slotsUsed, toolLeft } from "./body.js";
import { CHAPTERS, LOOKS, startChapter, loadSave, writeSave, clearSave, SLOTS, getSlot, setSlot, readSlot, writeSlot, clearSlot } from "./story.js";
import { CHANGELOG } from "./changelog.js";
import { GUIDE, GUIDE_ORDER } from "./guide.js";
import { KINDS } from "./economy.js";
import { AMBITIONS, ambitionsDone } from "./ambitions.js";
import { loadModels } from "./models.js";
import { ARMS } from "./raid.js";
import { SKILLS, SKILL_NAME, JOB_SKILL, TEMPER, MARKS, topSkills, skillLvl, trainCost } from "./people.js";
import { FAITHS, FAITH_IDS, faithOf, census, dedication } from "./faith.js";
import { NATIONS, NATION_FAITH, NEAR, ensureEurope, drawEurope, nationAt, relWord, strengthOf, the, MAP_ASPECT, citiesOf, cityAt, cityOwner, cityFirstOwner, buildGrid, CITIES, gridOf, llOf, MG_W } from "./europe.js";
import { EuropeView3D } from "./europe3d.js";

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
  $("setInvert").checked = s.invert; $("setMusic").checked = s.music;
  // the graphics preset fills in the boosters; touching any booster makes it Custom
  if (s.quality === "low") s.quality = "performance";      // (the old two-way setting)
  const P = PRESETS[s.quality];
  if (P) Object.assign(s, P);
  $("setQuality").value = s.quality || "high";
  $("setScale").value = s.scale ?? 1; $("scaleVal").textContent = Math.round((s.scale ?? 1) * 100) + "%";
  $("setDynres").checked = !!s.dynres; $("setShadows").value = s.shadows || "high"; $("setDraw").value = String(s.draw ?? 1);
  $("setCap").value = String(s.cap || 0); $("setFps").checked = !!s.showFps;
  $("setDark").checked = !!s.dark; document.body.classList.toggle("dark-fantasy", !!s.dark);
  post.on = s.post !== false; $("setPost").checked = post.on;
  // saturation and pixelation: the colour turned up or down, and the picture drawn in bigger, harder pixels
  const sat = s.sat ?? 1, pix = s.pix ?? 1;
  $("setSat").value = sat; $("satVal").textContent = Math.round(sat * 100) + "%";
  $("setPix").value = pix; $("pixVal").textContent = pix > 1 ? `${pix}×` : "off";
  const cv = renderer.domElement;
  cv.style.filter = [s.dark ? "saturate(0.6) contrast(1.15) sepia(0.12)" : "", Math.abs(sat - 1) > 0.01 ? `saturate(${sat})` : ""].filter(Boolean).join(" ");
  cv.style.imageRendering = s.dark || pix > 1 ? "pixelated" : "";
  G.reAtmo && G.reAtmo();
  $("fpsMeter").classList.toggle("hidden", !s.showFps);
  setGraphics({ shadows: s.shadows || "high", drawMul: +(s.draw ?? 1) });
  if (!s.dynres) dynScale = 1;
  applyScale();
  $("sensVal").textContent = (+s.sens).toFixed(2); $("fovVal").textContent = s.fov + "°"; $("volVal").textContent = Math.round(s.volume * 100) + "%";
}
for (const [id, key, num] of [["setSens", "sens", true], ["setFov", "fov", true], ["setVol", "volume", true], ["setSat", "sat", true], ["setPix", "pix", true]]) {
  $(id).addEventListener("input", e => { G.settings[key] = num ? +e.target.value : e.target.value; applySettings(); G.saveSettings(); });
}
$("setQuality").addEventListener("change", e => { G.settings.quality = e.target.value; applySettings(); G.saveSettings(); });
// ---- FPS boosters ----
const PRESETS = {
  high: { scale: 1, dynres: false, shadows: "high", draw: 1, post: true },
  balanced: { scale: 0.85, dynres: true, shadows: "low", draw: 0.75, post: true },
  performance: { scale: 0.65, dynres: true, shadows: "off", draw: 0.55, post: false },
};
let dynScale = 1;
function applyScale() {
  const s = G.settings;
  // (Dark Fantasy draws at a fraction of the resolution, in big hard-edged pixels)
  const pr = (s.dark ? 0.42 * dynScale : Math.min(devicePixelRatio, 1.75) * (s.scale ?? 1) * dynScale) / (s.pix ?? 1);
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
}
const custom = (key, val) => { G.settings[key] = val; G.settings.quality = "custom"; applySettings(); G.saveSettings(); };
$("setScale").addEventListener("input", e => custom("scale", +e.target.value));
$("setDynres").addEventListener("change", e => custom("dynres", e.target.checked));
$("setShadows").addEventListener("change", e => custom("shadows", e.target.value));
$("setDraw").addEventListener("change", e => custom("draw", +e.target.value));
$("setCap").addEventListener("change", e => { G.settings.cap = +e.target.value; G.saveSettings(); });
// fullscreen: the whole screen, or a window. (The app's F11 fills the window to the screen as well; either way the box
// shows how it is.) Kept as a setting, and taken up again at your first click into the game, as a browser requires
const isFull = () => !!document.fullscreenElement || (Math.abs(innerWidth - screen.width) < 2 && Math.abs(innerHeight - screen.height) < 2);
function setFull(on) {
  try {
    if (on && !document.fullscreenElement) { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); }
    else if (!on && document.fullscreenElement) document.exitFullscreen();
  } catch (e) {}
}
$("setFull").checked = isFull();
$("setFull").addEventListener("change", e => { G.settings.fullscreen = e.target.checked; G.saveSettings(); setFull(e.target.checked); });
const syncFull = () => { const f = isFull(); $("setFull").checked = f; };
document.addEventListener("fullscreenchange", syncFull); addEventListener("resize", syncFull);
addEventListener("mousedown", function first() { removeEventListener("mousedown", first); if (G.settings.fullscreen && !isFull()) setFull(true); });
$("setFps").addEventListener("change", e => { G.settings.showFps = e.target.checked; applySettings(); G.saveSettings(); });
$("setPost").addEventListener("change", e => custom("post", e.target.checked));
// the frame rate, measured each half second: shown if asked, and used by auto resolution
let fpsN = 0, fpsT = 0, lowFor = 0;
function meterFps(dtReal) {
  fpsN++; fpsT += dtReal;
  if (fpsT < 0.5) return;
  const fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
  const s = G.settings, m = $("fpsMeter");
  if (s.showFps) { m.textContent = `${Math.round(fps)} FPS${dynScale < 1 ? ` · ${Math.round((s.scale ?? 1) * dynScale * 100)}%` : ""}`; m.classList.toggle("slow", fps < 30); }
  if (s.dynres && G.mode === "play") {
    const aim = s.cap ? s.cap * 0.92 : 50;
    if (fps < aim) lowFor++; else lowFor = 0;
    if (lowFor >= 2 && dynScale > 0.5) { dynScale = Math.max(0.5, dynScale - 0.1); lowFor = 0; applyScale(); }
    else if (fps > aim + 8 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.05); applyScale(); }
  }
}
for (const [id, key] of [["setInvert", "invert"], ["setMusic", "music"], ["setDark", "dark"]]) {
  $(id).addEventListener("change", e => { G.settings[key] = e.target.checked; applySettings(); G.saveSettings(); });
}

// ---- the player's body exists from the start; the look is set on choosing ----
G.player = new Player();

// ---- screens ----
const screens = ["title", "choose", "chapters", "settings", "controls", "pause", "updates", "slots", "credits"];
let back = "title";
function screen(id) {
  for (const s of screens) UI.show(s, s === id);
  $("menus").classList.toggle("hidden", !id);
}
function refreshTitle() {
  const s = loadSave();
  UI.show("btnContinue", !!s);
  $("btnContinue").textContent = s ? `Continue — ${CHAPTERS[(s.chapter || 1) - 1].title}${getSlot() > 1 ? ` (save ${getSlot()})` : ""}` : "Continue";
  UI.show("btnChapters", !!s);
}
function toTitle() {
  G.endFreecam && G.endFreecam();
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
// take the mouse; where the browser refuses the lock, look with a hidden free cursor instead. (A lock can take a moment
// to come — longer in the app than in a browser — so it is waited for, and asked for again at the next click; the
// moment it does come, the free cursor gives way to it, so turning never stops at the edge of the screen.)
function lock() {
  const el = renderer.domElement;
  try { const p = el.requestPointerLock && el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  setTimeout(() => {
    if (document.pointerLockElement || G.mode !== "play") return;
    setFreeLook(true);
    // some embedded browsers forbid the lock outright; say so once, rather than let the cursor wander off
    if (!lock.warned && location.protocol !== "app:") { lock.warned = true; UI.hint("This browser will not lock the mouse, so the cursor can leave the window. Open the game in Chrome or Safari to look around freely.", 8); }
  }, 1200);
}
document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement && input.freeLook) setFreeLook(false); });
// (for the developer's panel: let go of the mouse without pausing, and take it again)
G.releaseMouse = () => { if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); } else if (input.freeLook) setFreeLook(false); };
G.lockMouse = () => lock();
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

// a new game: first, which of the six saves it goes in
$("btnNew").onclick = () => { back = "title"; slotMode = "new"; buildSlots(); screen("slots"); };
$("btnSlots").onclick = () => { back = "title"; slotMode = "play"; buildSlots(); screen("slots"); };
$("btnContinue").onclick = () => { const s = loadSave(); G.who = s.who || "brother"; play(s.chapter || 1); };
$("btnChapters").onclick = () => { buildChapters(); back = "title"; screen("chapters"); };
$("btnSettings").onclick = () => { back = "title"; screen("settings"); };
$("btnControls").onclick = () => { back = "title"; screen("controls"); };
$("btnUpdates").onclick = () => { back = "title"; screen("updates"); };
$("btnCredits").onclick = () => { back = "title"; screen("credits"); };
// quit: in the desktop app, closing the window ends the game (a browser tab cannot be closed by its page, so there it isn't offered)
if (/Electron/.test(navigator.userAgent)) { $("btnQuitGame").classList.remove("hidden"); $("btnQuitGame").onclick = () => window.close(); }
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
// ---- the six saves ----
let slotMode = "play", slotArmed = null, slotImportTo = 0;
const slotWhen = at => { if (!at) return ""; const d = new Date(at), m = (Date.now() - at) / 60000; return m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 60 * 24 ? `${Math.round(m / 60)} h ago` : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };
function slotDesc(s) {
  if (!s) return { t: "Empty", d: "" };
  const c = CHAPTERS[(s.chapter || 1) - 1] || CHAPTERS[0], who = s.who === "sister" ? "The Sister" : "The Brother";
  const town = s.town && s.chapter >= 11 ? `${s.town.name || "The clearing"} — ${(s.town.people || []).length + 2} souls${s.town.days != null ? `, day ${Math.floor(s.town.days) + 1}` : ""}` : c.kicker;
  return { t: `${c.title}`, d: `${who} · ${esc(town)}<br>Played ${slotWhen(s.at)}` };
}
function buildSlots() {
  $("slotsTitle").textContent = slotMode === "new" ? "A new game — which save?" : "Saves";
  $("slotsSub").textContent = slotMode === "new" ? "Pick an empty save, or one to start over (the game in it will be gone)." : "Six games, side by side. Export one to keep it safe or to carry it to another computer; import it back into any save.";
  const cur = getSlot();
  $("slotList").innerHTML = Array.from({ length: SLOTS }, (_, i) => {
    const n = i + 1, s = readSlot(n), d = slotDesc(s), armed = slotArmed && slotArmed.n === n ? slotArmed.act : null;
    const acts = slotMode === "new"
      ? [`<button data-slot="${n}" data-act="new" class="primary${s ? " danger" : ""}${armed === "new" ? " armed" : ""}">${!s ? "Start here" : armed === "new" ? "Click again — this game will be gone" : "Start over here"}</button>`]
      : [s ? `<button data-slot="${n}" data-act="play" class="primary">Continue</button>` : `<button data-slot="${n}" data-act="new">New game</button>`,
         s ? `<button data-slot="${n}" data-act="export">Export</button>` : "",
         `<button data-slot="${n}" data-act="import">Import</button>`,
         s ? `<button data-slot="${n}" data-act="delete" class="danger${armed === "delete" ? " armed" : ""}">${armed === "delete" ? "Click again to delete" : "Delete"}</button>` : ""];
    return `<div class="slot${n === cur && s ? " cur" : ""}"><div class="sl-n">Save ${n}${n === cur && s ? " · last played" : ""}</div><div class="sl-t">${d.t}</div><div class="sl-d">${d.d}</div><div class="sl-acts">${acts.join("")}</div></div>`;
  }).join("");
}
$("slotList").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const n = +b.dataset.slot, act = b.dataset.act, s = readSlot(n);
  // (the two that lose a game ask twice)
  if ((act === "delete" || (act === "new" && s && slotMode === "new")) && !(slotArmed && slotArmed.n === n && slotArmed.act === act)) { slotArmed = { n, act }; buildSlots(); return; }
  slotArmed = null;
  if (act === "play") { setSlot(n); G.who = s.who || "brother"; play(s.chapter || 1); }
  else if (act === "new") { setSlot(n); back = "slots"; slotMode = "new"; screen("choose"); }
  else if (act === "delete") { clearSlot(n); if (n === getSlot()) refreshTitle(); buildSlots(); }
  else if (act === "export") {
    const blob = new Blob([JSON.stringify({ game: "forester-reckoning", version: CHANGELOG[0].v, save: n, data: s }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `forester-reckoning-save${n}-${(CHAPTERS[(s.chapter || 1) - 1].title || "").toLowerCase().replace(/[^a-z]+/g, "-")}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } else if (act === "import") { slotImportTo = n; $("slotFile").value = ""; $("slotFile").click(); }
});
$("slotFile").addEventListener("change", async () => {
  const f = $("slotFile").files[0]; if (!f || !slotImportTo) return;
  let ok = false;
  try {
    const j = JSON.parse(await f.text()), d = j && j.game === "forester-reckoning" ? j.data : j;
    // a save is an object with a chapter it has reached and who is playing; anything else is not one of ours
    if (d && typeof d === "object" && d.chapter >= 1 && d.chapter <= CHAPTERS.length && (d.who === "brother" || d.who === "sister")) ok = writeSlot(slotImportTo, { ...d, at: Date.now() });
  } catch (e) { ok = false; }
  buildSlots(); refreshTitle();
  // (after the list is redrawn, which puts the usual words back)
  $("slotsSub").textContent = ok ? `Imported into save ${slotImportTo}.` : "That file isn't a Forester: Reckoning save.";
});
function buildChapters() {
  const s = loadSave() || {}, u = s.unlocked || 1;
  const list = $("chapterList");
  list.innerHTML = "";
  for (const c of CHAPTERS) {
    if (c.n > u) continue;             // what you have not reached yet is not shown at all
    const b = document.createElement("button");
    b.className = "chapter" + (c.n > u ? " locked" : "");
    b.innerHTML = `<span class="ch-n">${["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"][c.n - 1]}<small>(${c.n})</small></span><span class="ch-t">${c.title}</span><span class="ch-k">${c.n > u ? "Not yet reached" : c.kicker}</span>`;
    b.disabled = c.n > u;
    b.onclick = () => { G.who = s.who || "brother"; if (c.n === 6 && s.clearing && s.clearing.done) writeSave({ clearing: {} }); play(c.n); };
    list.appendChild(b);
  }
}

// ---- inventory (T) ----
const ICON = {
  hide: "art/item_hide.png", pack1: "art/item_pack.png", pack2: "art/item_pack.png", pack3: "art/item_pack.png",
  key: "art/item_key.png", blackberries: "art/item_blackberries.png", ledger: "art/item_ledger.png", door: "art/item_door.png", spade: "art/item_spade.png", stone: "../assets/sprites/items/stone.png", iron: "../assets/sprites/items/iron.png", ore: "../assets/sprites/items/stone.png", tools: "../assets/sprites/items/tool_iron.png", planks: "art/item_door.png", bricks: "../assets/sprites/items/stone.png", bread: "../assets/sprites/items/bread.png", coin: "../assets/sprites/items/dm.png", cart: "../assets/sprites/items/wheat.png", meat: "../assets/sprites/items/meat.png", venison: "../assets/sprites/items/meat.png", hare: "../assets/sprites/items/meat.png", boar: "../assets/sprites/items/meat.png", dish: "../assets/sprites/items/meat_cooked.png", cookedmeat: "../assets/sprites/items/meat_cooked.png", map: "art/item_map.png", bow: "art/item_bow.png", arrows: "art/item_arrows.png", seeds: "../assets/sprites/items/seeds.png",
  hammer1: "../assets/sprites/items/tool_stone.png", hammer2: "../assets/sprites/items/tool_stone.png", hammer3: "../assets/sprites/items/tool_bronze.png", hammer4: "../assets/sprites/items/tool_bronze.png", hammer5: "../assets/sprites/items/tool_iron.png",
  sword1: "../assets/sprites/items/weapon_stone.png", sword3: "../assets/sprites/items/weapon_bronze.png", sword4: "../assets/sprites/items/weapon_bronze.png", sword5: "../assets/sprites/items/weapon_iron.png",
  pick5: "../assets/sprites/items/pick_iron.png", tinore: "../assets/sprites/items/tin_ore.png", tin: "../assets/sprites/items/tin.png", bronze: "../assets/sprites/items/bronze.png",
  pick1: "../assets/sprites/items/pick_wood.png", pick2: "../assets/sprites/items/pick_stone.png", pick3: "../assets/sprites/items/pick_copper.png", pick4: "../assets/sprites/items/pick_bronze.png",
  copperore: "../assets/sprites/items/copper_ore.png", ironore: "../assets/sprites/items/iron_ore.png", copper: "../assets/sprites/items/copper.png", ironbar: "../assets/sprites/items/iron_bar.png",
  axe: "../assets/sprites/items/tool_iron.png", weapon: "../assets/sprites/items/weapon_iron.png", logs: "../assets/sprites/items/logs.png", cabin: "../assets/sprites/buildings/log_cabin_32.png",
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
  let html = `<div class="mc-sec">Hands <span class="mc-hint" style="float:right">your own purse: ${dm(G.body && G.body.purse)} DM</span></div><div class="mc-row hands">${slot(hands[0])}${slot(hands[1])}</div>`;
  // what is on you: three rows of nine
  const pack = G.pack.slice(0, 27), cap = packSlots(G.body), tl = G.body && G.body.tools;
  const bag = tl && tl.pack ? ["", "a hide backpack", "a stitched pack", "a pedlar's frame pack"][tl.pack] : "no backpack — four hides make one";
  html += `<div class="mc-sec">On you <span class="mc-hint" style="float:right">${slotsUsed(G.pack)} of ${cap} slots · ${bag}</span></div>`;
  // (the slots past what you can carry are shut: a bigger pack opens them)
  for (let r = 0; r < 3; r++) html += `<div class="mc-row">${Array.from({ length: 9 }, (_, c) => r * 9 + c >= cap && !pack[r * 9 + c] ? '<div class="mc-slot locked" title="A bigger backpack carries more"></div>' : slot(pack[r * 9 + c])).join("")}</div>`;
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
// ---- the chest in the cabin: nine places, one long row; click a thing to put it in or take it out ----
const CHEST_SLOTS = 9;
// what the stores keep that can be carried: the store's key, the thing in your pack, its name
const STORE_ITEMS = [["bread", "bread", "Bread"], ["meat", "cookedmeat", "Roast meat"], ["stone", "stone", "Stone"], ["planks", "planks", "Planks"], ["bricks", "bricks", "Bricks"], ["ore", "ironore", "Iron ore"], ["copperore", "copperore", "Copper ore"], ["tinore", "tinore", "Tin ore"], ["copper", "copper", "Copper"], ["tin", "tin", "Tin"], ["bronze", "bronze", "Bronze"], ["iron", "iron", "Iron"], ["tools", "tools", "Tools"]];
let chestNote = "";
let chestMode = "own";
function renderChest() {
  const box = G.chest || (G.chest = []);
  invItems = [];
  let h = "";
  if (chestMode === "stores" && G.town) {
    // the settlement's store chest: everything the stores hold, and what you carry to put in
    const S = G.town.S, list = STORE_ITEMS.filter(([k]) => (S[k] || 0) > 0);
    h += `<div class="mc-sec">The settlement's stores <span class="mc-hint">click to take five · click what you carry to put it in</span></div><div class="mc-row wrap">`;
    h += list.length ? list.map(([k, icon, name]) => slot({ icon, name, n: S[k], note: "In the stores. Click to take up to five." }).replace('class="mc-slot', `data-store="${k}" class="mc-slot`)).join("") : `<span class="ch-note">The stores are empty.</span>`;
  } else {
    h += `<div class="mc-sec">Your own chest <span class="mc-hint">yours to keep — or to sell to the traders for your purse</span></div><div class="mc-row">`;
    for (let i = 0; i < CHEST_SLOTS; i++) h += box[i] ? slot(box[i]).replace('class="mc-slot', `data-chest="${i}" class="mc-slot`) : `<div class="mc-slot"></div>`;
  }
  h += `</div><div class="mc-sec">On you</div><div class="mc-row">`;
  const pack = G.pack.slice(0, 9);
  for (let i = 0; i < 9; i++) h += pack[i] ? slot(pack[i]).replace('class="mc-slot', `data-pack="${i}" class="mc-slot`) : `<div class="mc-slot"></div>`;
  h += `</div><div class="ch-note">${esc(chestNote)}</div>`;
  $("chestBody").innerHTML = h;
  $("chestTitle").textContent = chestMode === "stores" ? "The store chest" : "Your chest";
}
$("chestBody").addEventListener("click", e => {
  const el = e.target.closest(".mc-slot"); if (!el) return;
  const box = G.chest || (G.chest = []);
  // the same kind of thing goes on the same pile
  const put = (list, it, max) => {
    const same = list.find(x => x && x.icon === it.icon && x.name === it.name && it.n != null);
    if (same) { same.n = (same.n || 1) + (it.n || 1); return true; }
    const free = list.findIndex(x => !x);
    if (free >= 0 && free < max) { list[free] = it; return true; }
    if (list.length < max) { list.push(it); return true; }
    return false;
  };
  if (el.dataset.store != null && G.town) {
    // out of the stores and into your hands: five at a time
    const k = el.dataset.store, S = G.town.S, n = Math.min(5, S[k] || 0), [, icon, name] = STORE_ITEMS.find(x => x[0] === k);
    if (n > 0) { const got = G.packAdd(icon, n, name); S[k] -= got; G.town.persist(); chestNote = got ? `Took ${got} ${name.toLowerCase()} from the stores.` : "Your pack is full."; if (got) SFX.pickup && SFX.pickup(); }
    renderChest(); return;
  }
  if (el.dataset.pack != null && chestMode === "stores" && G.town) {
    // into the stores, if the stores keep such a thing
    const it = G.pack[+el.dataset.pack], row = it && STORE_ITEMS.find(x => x[1] === it.icon);
    // a dish you cooked goes to feed the settlement: the best are eaten first, and whoever eats one is the happier for it
    if (it && it.icon === "dish") {
      const S = G.town.S; S.feast ??= [];
      for (let i = 0; i < (it.n || 1); i++) S.feast.push({ name: it.base, stars: it.stars });
      G.pack.splice(G.pack.indexOf(it), 1); G.town.persist(); chestNote = `Put in the stores: tomorrow it feeds someone, and ${it.stars >= 3.5 ? "they'll be glad of it" : it.stars >= 2 ? "they'll eat it" : "they'll grumble"}.`; SFX.pickup && SFX.pickup();
      renderChest(); return;
    }
    if (row) { G.town.S[row[0]] = (G.town.S[row[0]] || 0) + (it.n || 1); G.pack.splice(G.pack.indexOf(it), 1); G.town.persist(); chestNote = `Put in the stores.`; SFX.pickup && SFX.pickup(); }
    else chestNote = "The stores don't keep that.";
    renderChest(); return;
  }
  if (el.dataset.pack != null) {
    const it = G.pack[+el.dataset.pack]; if (!it) return;
    if (it.icon === "key" || it.icon === "map") { chestNote = "You keep that on you."; renderChest(); return; }
    if (put(box, it, CHEST_SLOTS)) { G.pack.splice(G.pack.indexOf(it), 1); chestNote = ""; SFX.pickup && SFX.pickup(); }
    else chestNote = "The chest is full.";
  } else if (el.dataset.chest != null) {
    const i = +el.dataset.chest, it = box[i]; if (!it) return;
    if (it.n != null && roomFor(G.pack, G.body, it.icon) < (it.n || 1)) { chestNote = "Your pack hasn't room for all of that."; renderChest(); return; }
    box[i] = null;
    const same = G.pack.find(x => x.icon === it.icon && x.name === it.name && it.n != null);
    if (same) same.n = (same.n || 1) + (it.n || 1); else G.pack.push(it);
    chestNote = ""; SFX.pickup && SFX.pickup();
  }
  writeSave({ chest: box.map(x => x || null) });
  renderChest();
});
G.openChest = (mode = "own") => {
  if (G.guide && G.town) G.guide(mode === "own" ? "chest" : "stores");
  chestMode = mode; chestNote = ""; AUDIO.door && AUDIO.door(true, 0.2); showOverlay("chest", true); renderChest();
  // (the first time: whose chest this is)
  if (mode === "own" && !G._toldOwnChest) { G._toldOwnChest = true; UI.hint("This chest is yours, not the settlement's. What you put in it you can sell to Henning or the pedlar — the DM goes in your own purse. The settlement's things are in its store chest.", 8); }
};
// ---- tools, made at the chopping block: logs from the stack, the rest from what you carry ----
const packN = k => (G.pack.find(i => i.icon === k) || {}).n || 0;
// what the settlement's stores hold of a thing (logs are the stack; iron ore is "ore" in the stores)
const storeN = k => G.town ? (G.town.S[k === "logs" ? "store" : k === "ironore" ? "ore" : k] || 0) : 0;
const haveFor = (k, n) => k === "logs" ? storeN(k) >= n : packN(k) + storeN(k) >= n;
function renderCraft() {
  const tl = G.body.tools;
  // only what can be made now: the next making of each tool, when everything it takes is to hand
  const rows = TOOL_RECIPES.map((r, i) => {
    if (r.tier !== nextTier(tl, r.tool) || !Object.entries(r.cost).every(([k, n]) => haveFor(k, n))) return "";
    const cost = Object.entries(r.cost).map(([k, n]) => `${n} ${k === "logs" ? (n === 1 ? "log" : "logs") + " from the stack" : ITEM[k].name.toLowerCase() + (n > 1 && k === "hide" ? "s" : "")}`).join(", ");
    const icon = r.tool === "axe" ? ICON.axe : r.tool === "spade" ? ICON.spade : ICON[r.tool + r.tier] || ICON.logs;
    return `<div class="cr-row"><img src="${icon}" alt=""><div><div class="sk-name">${r.name}</div><div class="sk-does">${r.note}</div><div class="cr-cost">${cost}</div></div>
      <button class="btn primary" data-r="${i}">Make</button></div>`;
  }).join("");
  $("craftBody").innerHTML = `<div class="sk-sub">What you can make now. Stone from the grey rocks; copper, tin and iron broken with a good enough pick and smelted at a forge; bronze cast there from copper and tin.</div>${rows || `<p class="cr-none">Nothing you can make yet. A wooden pickaxe wants two logs on the stack.</p>`}`;
}
$("craftBody").addEventListener("click", e => {
  const b = e.target.closest("button[data-r]"); if (!b || b.disabled) return;
  const r = TOOL_RECIPES[+b.dataset.r];
  for (const [k, n] of Object.entries(r.cost)) {
    if (k === "logs") { G.town.S.store -= n; G.town.showStore && G.town.showStore(); G.town.persist(); }
    else {
      // what you carry first, then the stores
      const it = G.pack.find(i => i.icon === k), fromPack = Math.min(n, it ? it.n : 0);
      if (it) { it.n -= fromPack; if (it.n <= 0) G.pack.splice(G.pack.indexOf(it), 1); }
      if (n > fromPack) { const key = k === "ironore" ? "ore" : k; G.town.S[key] -= n - fromPack; G.town.persist(); }
    }
  }
  G.body.tools[r.tool] = r.tier; G.body.dirty = true;
  // the new one in your hands
  if (r.tool === "pick") G.player.wield("pick"); else if (r.tool === "sword") G.player.wield("sword"); else if (G.player.axe && (G.player.blade || "axe") === "axe") { G.player.giveAxe(false); G.player.giveAxe(true); }
  G.player.workFor && G.player.workFor("hammer", 1.6);
  UI.hint(`${r.name} made.`, 3);
  G.emitCraft && G.emitCraft(r);
  renderCraft();
});
G.openCraft = () => showOverlay("craft", true);
// ---- the keys (Tab): all of them in one place, what each does now ----
function renderKeys() {
  const K = (keys, what) => `<div class="kr-k">${keys.map(k => `<kbd>${k}</kbd>`).join(" ")}</div><div>${what}</div>`;
  const sec = t => `<div class="kr-sec">${t}</div>`;
  let h = sec("Moving") + K(["W", "A", "S", "D"], "Walk") + K(["Shift"], "Run") + K(["C"], "Crouch") + K(["Space"], "Jump · move a conversation on") + K(["Q", "E"], "Lean") + K(["Z"], "Hold to look closer") + K(["M"], "Lock or free the mouse");
  h += sec("Doing") + K(["F"], "Take, open, talk — hold it for work that takes time · close a menu") + K(["Left click"], "Swing what you hold — the way you look is the way it comes") + K(["Right click"], "Draw the bow · raise your guard") + K(["1", "–", "9"], "Take out a tool · eat food in that slot");
  h += sec("Seeing") + K(["J"], "The map") + K(["T"], "Inventory") + K(["P"], "Skills") + K(["H"], "The guide: how everything works") + K([";"], "Free camera — fly the view loose, ; again to come back") + K(["X"], "Get down off your horse") + K(["Tab"], "These keys");
  if (G.town) h += sec("The settlement") + K(["B"], "Plans — what you can build") + K(["V"], "Inspect a building: upkeep, mend, rebuild, pull down") + K(["G"], "Government: the nation, research, people, faith, Europe, ambitions");
  h += sec("") + K(["Esc"], "Pause");
  $("keysBody").innerHTML = `<div class="kr-grid">${h}</div>`;
}
// the inventory's and the skills' little tabs: from one to the other
for (const b of document.querySelectorAll(".mc-links button")) b.onclick = () => showOverlay(b.dataset.go, true);
// ---- skills (P): each from 1 to 100, and what the next level wants ----
function renderSkills() {
  const b = G.body; if (!b) return;
  const rows = BODY_SKILLS.map(sk => {
    const v = b.skills[sk.id], max = v.lv >= SKILL_MAX, k = max ? 1 : v.xp / xpFor(v.lv);
    return `<div class="sk-row"><div class="sk-name">${sk.name}</div><div class="sk-lv">${v.lv}<small> / ${SKILL_MAX}</small></div>
      <div class="sk-bar"><div style="width:${Math.round(k * 100)}%"></div></div>
      <div class="sk-does">${sk.does}</div><div class="sk-grows">${max ? "As good as anyone has ever been." : sk.grows}</div></div>`;
  }).join("");
  $("skillsBody").innerHTML = `<div class="sk-sub">You grow better at what you do. Hunger: ${Math.round(b.hunger * 100)}% fed.</div>${rows}`;
}
// ---- overlays (inventory, map): one at a time; the cursor comes back and you stand still ----
let overlay = null, overlayTimer = 0, overlayLockMove = false;
const OVERLAYS = {
  chest: { open: () => renderChest(), tick: () => {}, every: 1000 },
  craft: { open: () => renderCraft(), tick: () => renderCraft(), every: 700 },
  keysRef: { open: () => renderKeys(), tick: () => {}, every: 2000 },
  guideBook: { open: () => renderGuide(), tick: () => {}, every: 5000 },
  skills: { open: () => renderSkills(), tick: () => renderSkills(), every: 500 },
  inventory: { open: () => renderInventory(), tick: () => renderInventory(), every: 300, close: () => $("invTip").classList.add("hidden") },
  bigmap: { open: () => { G.mapView = { zoom: 1, ox: 0, oz: 0 }; G.mapOpen = true; if (G.mapUsed) G.mapUsed.opened = true; renderBigMap(); }, tick: () => renderBigMap(), every: 250, close: () => { G.mapOpen = false; growReset(); } },
  buildmenu: { open: () => renderPlans(), tick: () => renderPlans(), every: 500 },
  trade: { open: () => renderTrade(), tick: () => renderTrade(), every: 400 },
  gov: { open: () => renderGov(true), tick: () => renderGov(false), every: 500 },
  inspect: { open: () => { inspArmed = false; renderInspect(); }, tick: () => renderInspect(), every: 400, close: () => { inspB = null; } },
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
// ---- a building up close (V): what it is, who works it, what it costs to keep; rebuild it, or pull it down ----
let inspB = null, inspArmed = false, inspSig = "";
function renderInspect() {
  const t = G.town, b = inspB;
  if (!t || !b || !t.S.buildings.includes(b)) { if (overlay === "inspect") showOverlay("inspect", false); return; }
  const def = TOWN_BUILDINGS[b.type], S = t.S;
  const style = b.type === "field" || b.type === "path" ? null : (b.tier || 1) > 1 ? UPGRADES[b.tier].style : "logs, as the forest gives them";
  const works = Object.entries(WORKS).filter(([, w]) => w.at === b.type).map(([j]) => j).concat(b.type === "bakery" ? ["baker"] : b.type === "field" ? ["farmer"] : []);
  const who = S.people.filter(p => works.includes(p.job)).map(p => p.name);
  const keep = t.upkeepOf(b);
  const rows = [
    ["What it is", esc(def.note || "")],
    b.done ? (style ? ["Built in", esc(style)] : null) : ["Building", `not finished — ${b.logs || 0} of ${def.cost} logs${Object.keys(def.mats || {}).length ? `, and ${esc(t.costText(def.mats))}` : ""}`],
    b.type === "field" ? ["The rye", b.sown ? ((b.growth ?? 1) >= 3 ? "ripe — reap it" : "growing") : `${b.dug || 0} of 3 strips dug`] : null,
    b.type === "cabin" && b.done ? ["Sleeps", `${t.sleeps(b)}${(b.tier || 1) < 2 ? " — three, rebuilt as a house" : ""}`] : null,
    def.wall ? ["Stands", b.broken ? '<span class="warn">broken through — a way in for anyone, until it is mended</span>' : `${b.hp ?? def.hp} of ${def.hp}${def.wall === "gate" ? (b.open ? " · open" : " · shut") : ""}`] : null,
    (b.type === "church" || b.type === "shrine") && b.done ? ["Dedicated to", esc(FAITHS[b.faith || "lutheran"].name) + ` — ${b.type === "church" ? FAITHS[b.faith || "lutheran"].house : FAITHS[b.faith || "lutheran"].shrine}`] : null,
    b.type === "woodshed" && b.done ? ["Holds", `${SHED_BAYS[b.bays || 1].holds} logs in ${(b.bays || 1) === 1 ? "one bay" : (b.bays === 2 ? "two bays" : "three bays")} (the store holds ${t.storeCap} in all)`] : null,
    works.length ? ["Who works here", who.length ? esc(who.join(", ")) : '<span class="warn">no one — set someone to it (F by them)</span>'] : null,
    ["Upkeep", keep ? `${keep === 0.5 ? "½" : keep} DM a day${t.untended ? ' <span class="warn">— unpaid today: it stands idle</span>' : ""}` : "nothing — once it stands, it stands"],
  ].filter(Boolean);
  // the two things to do with it
  const acts = [];
  if (t.canEnlarge && t.canEnlarge(b)) {
    const u = SHED_BAYS[(b.bays || 1) + 1], room = t.enlargeRoom(b), can = !room && t.afford(u.mats, true);
    acts.push(`<button data-act="bay"${can ? "" : " disabled"}>Build on ${esc(u.name)} — holds ${u.holds} logs<span class="sub">${esc(t.costText(u.mats))}${room ? ` — no room: ${esc(room)}` : !can ? ` — ${esc(t.short(u.mats, true))} short` : ""}</span></button>`);
  }
  if (t.canUpgrade(b)) {
    const u = UPGRADES[(b.tier || 1) + 1], need = u.needs && u.needs(t), can = !need && t.afford(u.mats, true);
    acts.push(`<button data-act="up"${can ? "" : " disabled"}>Rebuild in ${esc(u.style.split(",")[0])}<span class="sub">${esc(t.costText(u.mats))}${need ? ` — first, ${esc(need)}` : !can ? ` — ${esc(t.short(u.mats, true))} short` : ""}</span></button>`);
  } else if (def.wall) {
    if (b.broken || (b.hp ?? def.hp) < def.hp) { const c = t.repairCost(b), can = t.afford(c, true); acts.push(`<button data-act="mend"${can ? "" : " disabled"}>Mend it<span class="sub">${esc(t.costText(c))}${can ? "" : ` — ${esc(t.short(c, true))} short`}</span></button>`); }
  } else if (b.done && b.type !== "field" && b.type !== "path") acts.push(`<button disabled>Rebuild<span class="sub">${(b.tier || 1) >= 4 ? "built as well as it can be" : "this kind isn't rebuilt"}</span></button>`);
  const back = t.refundOf(b);
  acts.push(`<button data-act="down" class="danger${inspArmed ? " armed" : ""}">${inspArmed ? "Click again to pull it down" : b.done ? "Dismantle" : "Give up the site"}<span class="sub">${Object.keys(back).length ? `back in the stores: ${esc(t.costText(back))}` : "nothing comes back"}${b.type === "woodshed" && b.done ? " — logs past what the stack holds are lost" : ""}${b.type === "cabin" && b.done ? " — whoever sleeps there loses their bed" : ""}</span></button>`);
  const sig = JSON.stringify([rows, acts]);
  if (sig === inspSig) return;
  inspSig = sig;
  $("inspTitle").textContent = t.nameOf(b) + ((b.tier || 1) > 1 ? ` — ${UPGRADES[b.tier].style.split(",")[0]}` : "");
  $("inspBody").innerHTML = `<div class="insp-rows">${rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join("")}</div>`;
  $("inspActs").innerHTML = acts.join("");
}
$("inspActs").addEventListener("click", e => {
  const bt = e.target.closest("button[data-act]"); if (!bt || bt.disabled) return;
  const t = G.town, b = inspB; if (!t || !b) return;
  if (bt.dataset.act === "mend") { const msg = t.repair(b); if (msg) UI.hint(msg, 3); inspSig = ""; renderInspect(); return; }
  if (bt.dataset.act === "up") { if (t.upgrade(b)) showOverlay("inspect", false); else renderInspect(); }
  if (bt.dataset.act === "bay") { if (t.enlarge(b)) showOverlay("inspect", false); else renderInspect(); }
  if (bt.dataset.act === "down") {
    if (!inspArmed) { inspArmed = true; inspSig = ""; renderInspect(); return; }
    t.dismantle(b); showOverlay("inspect", false);
  }
});
function showInventory(on) { showOverlay("inventory", on); }
G.showInventory = showInventory;

// ---- the plans (B): what the settlement can build, when there is a settlement ----
function renderPlans() {
  const t = G.town; if (!t) return;
  // inside the cabin, the plans are for what goes in it
  const w = G.world, pl = G.player;
  const inside = w && w.insideCabin && w.insideCabin(pl.pos.x, pl.pos.z);
  $("buildTitle").textContent = inside ? "Furnish the cabin" : "Plans";
  if (inside) {
    const cost = d => [d.logs ? d.logs + " logs" : "", d.rye ? d.rye + " rye" : ""].filter(Boolean).join(", ");
    const home = (t.S.homeTier || 1) < 2 ? (() => { const u = UPGRADES[2], can = t.afford(u.mats, true); return `<button class="plan${can ? "" : " short"}" data-home="1"><img src="${ICON.cabin}" alt=""><span><span class="pn">Rebuild it as a house</span><span class="pd">Timber and plaster inside, boards on the floor — and a kitchen, to cook proper dishes in. Settlers can sleep here then: one for every bed past your own two (three at most).${can ? "" : ` — ${esc(t.short(u.mats, true))} short`}</span></span><span class="pc">${esc(t.costText(u.mats))}</span></button>`; })() : "";
    $("buildList").innerHTML = home + Object.entries(FURNITURE).map(([k, d]) => `<button class="plan${t.canAfford(k) ? "" : " short"}" data-k="${k}"><img src="${d.rye ? ICON.seeds : ICON.logs}" alt=""><span><span class="pn">${esc(d.name)}</span><span class="pd">${esc(d.note)}</span></span><span class="pc">${cost(d)}</span></button>`).join("");
    for (const b of $("buildList").querySelectorAll(".plan")) b.onclick = () => {
      if (b.dataset.home) { if (t.upgradeHome()) showOverlay("buildmenu", false); return; }
      if (!t.canAfford(b.dataset.k)) return; showOverlay("buildmenu", false); t.furnish(b.dataset.k); };
    return;
  }
  // (what hasn't been researched isn't shown at all)
  const list = Object.entries(TOWN_BUILDINGS).filter(([k, d]) => !d.settlers && (!t.unlocked || t.unlocked.has(k)) && !t.gated(k));
  $("buildList").innerHTML = list.map(([k, d]) => t.gated(k) ? `<button class="plan short" data-k="${k}" data-gate="1"><img src="${ICON[d.icon] || ICON.logs}" alt=""><span><span class="pn">${esc(d.name)}</span><span class="pd">${esc(t.researchAdvice(t.gated(k).id, "it"))}.</span></span><span class="pc">locked</span></button>` : `<button class="plan" data-k="${k}"><img src="${ICON[d.icon] || ICON.logs}" alt=""><span><span class="pn">${esc(d.name)}</span><span class="pd">${esc(d.note)}</span></span><span class="pc">${d.path ? "free" : k === "field" ? `1 seed (${t.S.seed != null ? (Math.round(t.S.seed * 10) / 10) : 0})` : d.cost ? [d.cost + " logs", ...Object.entries(d.mats || {}).map(([k, n]) => `${n} ${k}`)].join(", ") : "a spade"}</span></button>`).join("") || `<div class="inv-empty">Nothing to build yet.</div>`;
  for (const b of $("buildList").querySelectorAll(".plan")) b.onclick = () => { if (b.dataset.gate) return; showOverlay("buildmenu", false); G.town.plan(b.dataset.k); };
}
// ---- trading: a list of offers from whoever you're dealing with ----
let tradeNow = null;
G.openTrade = (title, purse, offers, after) => { tradeNow = { title, purse, offers, after }; showOverlay("trade", true); };
G.closeTrade = () => showOverlay("trade", false);
function renderTrade() {
  const t = tradeNow; if (!t) return;
  $("tradeTitle").textContent = t.title;
  $("tradePurse").textContent = typeof t.purse === "function" ? t.purse() : t.purse && !/DM/.test(t.purse) ? t.purse : G.town ? `${dm(G.town.S.coin)} DM` : "";
  $("tradeList").innerHTML = t.offers.map((o, i) => {
    const done = o.done && o.done(), ok = !done && o.can();
    return `<button class="plan${done ? " owned" : ok ? "" : " short"}" data-i="${i}"><img src="${ICON[o.icon] || (o.label.startsWith("Sell") ? ICON.coin : ICON.cart)}" alt=""><span><span class="pn">${esc(o.label)}${done ? esc(o.doneText ?? " — yours") : ""}</span><span class="pd">${esc(o.note || "")}</span></span><span class="pc">${esc(o.get)}</span></button>`;
  }).join("");
  for (const b of $("tradeList").querySelectorAll(".plan")) b.onclick = () => {
    const o = t.offers[+b.dataset.i];
    if ((o.done && o.done()) || !o.can()) return;
    o.do(); t.after && t.after(); renderTrade();
  };
}
// ---- government (G): the nation, the tech tree, the people ----
// ambitions: the long aims of free play, each with what it asks and what it brings
function govAmbitions(t) {
  const got = t.S.ambitions || {};
  const rows = AMBITIONS.map(a => {
    const d = got[a.id] != null;
    return `<div class="amb${d ? " done" : ""}${a.last ? " last" : ""}"><div class="amb-mark">${d ? "✓" : a.last ? "✠" : "◇"}</div><div><div class="amb-name">${a.name}</div><div class="amb-aim">${a.aim}</div>
      <div class="amb-prog">${d ? `Done, day ${got[a.id] + 1}` : a.progress(t)}</div><div class="amb-rew">${a.reward}</div></div></div>`;
  }).join("");
  return `<div class="gov-head"><span class="gov-name">Ambitions</span><span class="gov-rank">${ambitionsDone(t)} of ${AMBITIONS.length}</span></div>
    <p class="amb-intro">What the settlement might become. Each is looked at every morning; when it is met, it is rewarded. The last is why you came.</p>${rows}`;
}
let govTab = "nation", techTree = "growth", techQuery = "", techHover = null, govKey = "";
for (const b of document.querySelectorAll("#govTabs .gov-tab")) b.onclick = () => { govTab = b.dataset.tab; renderGov(true); };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// what a settlement is called, by how many live there and how it is built
function rankOf(t) {
  const pop = t.S.people.length + 2;
  if (t.tierLevel >= 4 && t.has("townhall")) return "City";
  if (t.tierLevel >= 3 && pop >= 8) return "Town";
  if (pop >= 7) return "Village";
  if (pop >= 4) return "Hamlet";
  return "Camp";
}
let govPeopleHtml = "";
// ---- taxes & trade: what you take, and what the settlers may do on their own account ----
function govLaws(t) {
  const S = t.S; S.laws ??= { business: true, approval: false }; S.tax ??= 0.1; S.bizTax ??= 0.1; S.companies ??= [];
  const today = S.taxToday;
  let h = `<div class="mc-sec">Taxes</div>
    <div class="law-row"><label>Tax on wages <b id="lawTaxV">${Math.round(S.tax * 100)}%</b></label><input type="range" id="lawTax" min="0" max="50" step="5" value="${Math.round(S.tax * 100)}">
      <div class="law-note">Everyone who works sells what they make to the pedlar, and pays this share of it. The higher it is, the unhappier they are — though the contented mind it less. A tenth of what the taxes bring in is yours.</div></div>
    <div class="law-row"><label>Business tax <b id="lawBizV">${Math.round(S.bizTax * 100)}%</b></label><input type="range" id="lawBiz" min="0" max="40" step="5" value="${Math.round(S.bizTax * 100)}">
      <div class="law-note">Paid by every company on what it sells. Past a quarter, the owners grumble.</div></div>
    <div class="law-note">${today ? `Yesterday: ${dm(today.taxed)} DM in taxes, ${dm(today.biz)} DM from the businesses — ${dm(today.yours)} DM of it to your own purse.` : "The first taxes come in at the end of the day."}</div>
    <div class="mc-sec">Trade</div>
    <label class="law-tog"><input type="checkbox" id="lawBiz1"${S.laws.business ? " checked" : ""}> Settlers may start businesses of their own</label>
    <div class="law-note">Businesses bring in taxes and cheer the place up, and you can buy at their shops for less. But an owner gives part of their time to it, so less goes into the settlement's stores. They fell their own timber for the shop. Forbid it, and those with savings resent it.</div>
    <label class="law-tog"><input type="checkbox" id="lawAsk"${S.laws.approval ? " checked" : ""}> A shop may only be built with your leave</label>
    <div class="law-note">With this law, whoever wants to open a shop comes to you first and shows you where. Refuse them, and they take it hard.</div>
    <div class="mc-sec">Companies</div>`;
  const list = S.companies.filter(c => !c.refused);
  h += list.length ? `<table class="gov-people"><tr><th>Company</th><th>Owner</th><th>Trade</th><th>State</th><th>Stock</th><th>Taken</th></tr>${list.map(c => `<tr><td class="nm">${esc(c.name)}</td><td>${esc(c.owner)}</td><td>${esc(KINDS[c.kind].name)}</td><td>${c.waiting ? "asking your leave" : c.built ? "open" : `building (${Math.min(10, c.logs || 0)}/10 logs)`}</td><td>${c.stock || 0}</td><td>${dm(c.earned)} DM</td></tr>`).join("")}</table>` : `<div class="law-note">No one has started a business yet. Someone who has saved twelve DM, and is doing well, may.</div>`;
  return h;
}
function wireLaws(t) {
  const S = t.S;
  $("lawTax").oninput = e => { S.tax = +e.target.value / 100; $("lawTaxV").textContent = e.target.value + "%"; t.persist(); };
  $("lawBiz").oninput = e => { S.bizTax = +e.target.value / 100; $("lawBizV").textContent = e.target.value + "%"; t.persist(); };
  $("lawBiz1").onchange = e => { S.laws.business = e.target.checked; t.persist(); };
  $("lawAsk").onchange = e => { S.laws.approval = e.target.checked; t.persist(); };
}
function renderGov(full) {
  const t = G.town; if (!t) return;
  // (a redraw every half second would steal the search box's focus and the tree's scroll: only what moves is redrawn)
  const key = govTab + "|" + techTree;
  for (const b of document.querySelectorAll("#govTabs .gov-tab")) b.classList.toggle("on", b.dataset.tab === govTab);
  $("govTitle").textContent = `Government — ${t.S.name || "the clearing"}`;
  if (govTab === "nation") $("govBody").innerHTML = govNation(t);
  else if (govTab === "ambitions") { const html = govAmbitions(t); if (full || html !== govPeopleHtml || key !== govKey) { $("govBody").innerHTML = html; govPeopleHtml = html; } }
  else if (govTab === "europe") {
    // the map is drawn once and redrawn when something moves; the side panel when its words change
    if (full || key !== govKey || !$("euMap")) { $("govBody").innerHTML = govEuropeFrame(); wireEurope(t); }
    drawEuropeTab(t);
  }
  else if (govTab === "laws") {
    const html = govLaws(t);
    // (not redrawn while a slider is being dragged)
    if ((full || html !== govPeopleHtml || key !== govKey) && !(document.activeElement && document.activeElement.type === "range")) { const top = $("govBody").scrollTop; $("govBody").innerHTML = html; govPeopleHtml = html; wireLaws(t); $("govBody").scrollTop = top; }
  }
  else if (govTab === "faith") {
    const html = govFaith(t);
    if (full || html !== govPeopleHtml || key !== govKey) { const top = $("govBody").scrollTop; $("govBody").innerHTML = html; govPeopleHtml = html; wireFaith(t); $("govBody").scrollTop = top; }
  }
  else if (govTab === "people") {
    // (redrawn only when something in it changed, and the trade picked to send for is kept)
    const html = govPeople(t);
    if (full || html !== govPeopleHtml || key !== govKey) {
      const pick = $("recJob") && $("recJob").value, top = $("govBody").scrollTop;
      $("govBody").innerHTML = html; govPeopleHtml = html; wirePeople(t);
      if (pick && $("recJob")) $("recJob").value = pick;
      $("govBody").scrollTop = top;
    }
  }
  else if (full || key !== govKey || !$("techWrap")) { $("govBody").innerHTML = govTechFrame(t); wireTech(t); drawTech(t); }
  else drawTech(t, true);
  govKey = key;
}
function stat(k, v, n, bar, warn = true) {
  const b = bar == null ? "" : `<div class="gov-bar${warn && bar < 0.34 ? " low" : ""}"><i style="width:${Math.round(clamp(bar, 0, 1) * 100)}%"></i></div>`;
  return `<div class="gov-stat"><div class="k">${k}</div><div class="v">${v}</div>${n ? `<div class="n">${n}</div>` : ""}${b}</div>`;
}
function govNation(t) {
  const S = t.S, pop = S.people.length + 2, beds = t.beds + 2;
  const foodDays = Math.floor(t.foodDays());
  const fuelDays = Math.floor(S.store / Math.max(1, t.hearths));
  const c = t.contentment();
  const yearN = Math.floor(t.day / YEAR) + 1, dayN = (t.day % YEAR) + 1;
  const r = S.tech.research, rt = r && TECH[r.id];
  const known = S.tech.done.length, total = Object.keys(TECH).length;
  const workers = S.people.filter(p => !p.child).length;
  const why = c.why.map(([n, text]) => `<span class="${n < 0 ? "neg" : ""}">${n > 0 ? "+" : ""}${n} ${esc(text)}</span>`).join(" · ");
  let h = `<div class="gov-head"><span class="gov-name">${esc(S.name || "The clearing")}</span><span class="gov-rank">${rankOf(t)}</span>
    <span class="gov-sub">${cap(t.season)}, day ${dayN} of year ${yearN} in the woods · built ${t.tierLevel > 1 ? UPGRADES[t.tierLevel].style.split(",")[0] : "in logs"}</span></div>`;
  h += `<div class="mc-sec">The nation</div><div class="gov-grid">`;
  h += stat("People", `${pop} <span class="dim" style="font-size:14px">of ${beds} beds</span>`, pop > beds ? `${pop - beds} without a bed — raise cabins (B)` : `${workers} settlers at work, and your family`, pop > beds ? 0.05 : 1 - pop / Math.max(1, beds) * 0.66);
  h += stat("Contentment", `${c.value} / 100`, c.value >= 60 ? "They are glad they came." : c.value >= 40 ? "They manage." : "Unhappy — nobody new will stay.", c.value / 100);
  h += stat("Food", `${foodDays} day${foodDays === 1 ? "" : "s"}`, `${S.rye} rye, ${S.bread || 0} bread · ${need} a day`, foodDays / 8);
  h += stat("Firewood", `${S.store} logs`, t.winter ? `${fuelDays} winter days at ${t.hearths} hearths` : `winter burns ${t.hearths} a day · store holds ${t.storeCap}`, t.winter ? fuelDays / 4 : S.store / Math.max(1, t.hearths * 4));
  // where DM comes from: the traders on the road, and a market
  const next = (every, on) => { for (let k = 0; k < every + 1; k++) if ((t.day + k) % every === on) return k; return 0; };
  const when = k => k === 0 ? "today" : k === 1 ? "tomorrow" : `in ${k} days`;
  h += stat("Treasury", `${dm(S.coin)} DM`, `${t.upkeepBill && t.techGates && t.upkeepBill() ? `Keeping the works costs ${String(t.upkeepBill()).replace(/\.5$/, "½").replace(/^0½/, "½")} DM a day${t.untended ? " — unpaid today, so they stand idle" : ""} (V at a building shows its share). ` : ""}Earn DM by selling logs, bread and rye to the traders on the road — Henning ${when(next(3, 1))}, Tobias the pedlar ${when(next(4, 3))}${t.has("market") ? ` · the market took ${S.soldToday || 0} DM yesterday` : " — or build a market (research Trading) to sell every day"}.`);
  h += stat("Knowledge", `${known} of ${total}`, rt ? `researching ${esc(rt.name)} — ${Math.min(99, Math.round(r.t / techTime(rt) * 100))}%` : "the scholars are idle — see the tech tree", rt ? r.t / techTime(rt) : known / total, false);
  h += `</div><div class="mc-sec">Why they feel as they do</div><div class="gov-why">${why || "—"}</div>`;
  // the stores
  const mats = [["store", "logs"], ["rye", "seeds"], ["bread", "bread"], ["stone", "stone"], ["planks", "planks"], ["bricks", "bricks"], ["ore", "ore"], ["copperore", "copperore"], ["tinore", "tinore"], ["copper", "copper"], ["tin", "tin"], ["bronze", "bronze"], ["iron", "iron"], ["tools", "tools"], ["spears", "weapon"], ["swords", "weapon"], ["battleaxes", "weapon"], ["coin", "coin"]];
  h += `<div class="mc-sec">The stores</div><div class="gov-chips">${mats.map(([k, ic]) => `<span class="gov-chip"><img src="${ICON[ic]}" alt="">${S[k] || 0} <span class="t">${k === "rye" ? "rye" : k === "bread" ? "bread" : MAT_NAME[k] || k}</span></span>`).join("")}</div>`;
  // the buildings, by kind and by style
  const TIER = ["", "log", "timber", "brick", "modern"];
  const byType = {};
  for (const b of S.buildings) { if (!b.done && b.type !== "field") { (byType[b.type] ??= { n: 0, going: 0, tiers: {} }).going++; continue; } const e = (byType[b.type] ??= { n: 0, going: 0, tiers: {} }); e.n++; e.tiers[b.tier || 1] = (e.tiers[b.tier || 1] || 0) + 1; }
  const rows = Object.entries(byType).map(([k, e]) => {
    const d = TOWN_BUILDINGS[k] || { name: k }, ts = Object.entries(e.tiers).filter(() => d.tiers || k === "cabin" || k === "well").map(([tr, n]) => `${n} ${TIER[tr]}`).join(", ");
    return `<span class="gov-chip"><img src="${ICON[d.icon] || ICON.cabin}" alt="">${e.n} ${esc(d.name.toLowerCase())}${e.n === 1 || /s$/.test(d.name) ? "" : "s"}${ts ? ` <span class="t">${ts}</span>` : ""}${e.going ? ` <span class="t">+${e.going} going up</span>` : ""}</span>`;
  });
  h += `<div class="mc-sec">Buildings</div><div class="gov-chips">${rows.join("") || '<span class="gov-why">Only the cabin, so far.</span>'}</div>`;
  return h;
}
// everyone in the nation, and what they have
function govPeople(t) {
  const S = t.S;
  const cabins = S.buildings.filter(b => b.done && b.type === "cabin");
  const adults = S.people.filter(p => !p.child);
  const packHas = (G.pack || []).map(i => `${i.n > 1 ? i.n + " " : ""}${i.name}`);
  const you = [G.player && G.player.axe ? "Old felling axe" : null, G.player && G.player.carryN ? `${G.player.carryN} logs in the arms` : null, ...packHas].filter(Boolean);
  const youName = G.who === "sister" ? "Sister" : "Brother", sibName = G.who === "sister" ? "Brother" : "Sister";
  const sibA = t.sibActor;
  const moodCell = m => `<div class="mood" title="${esc(m.why.map(([n, w]) => `${n > 0 ? "+" : ""}${n} ${w}`).join("\n"))}"><div class="mood-bar"><i style="width:${m.value}%;background:${m.value < 25 ? "#d0503a" : m.value < 45 ? "#d6a03a" : "var(--gold)"}"></i></div><span>${m.value}</span></div>`;
  let rows = `<tr><td class="nm">${youName} <span class="dim">(you)</span></td><td>Head of the household</td><td class="dim">—</td><td class="dim">—</td><td class="dim">The cabin</td><td><div class="has">${you.map(x => `<span>${esc(x)}</span>`).join("") || '<span class="dim">nothing</span>'}</div></td><td></td></tr>`;
  rows += `<tr><td class="nm">${sibName}</td><td>Woodcutter · family</td><td class="dim">—</td><td class="dim">—</td><td class="dim">${esc(sibA ? cap(sibA.doing || "about the clearing") : "about the clearing")}</td><td><div class="has"><span>Axe</span></div></td><td></td></tr>`;
  S.people.forEach((p, i) => {
    const a = t.actors.find(x => x.settler === p);
    const home = t.bedFor(i);
    const tool = !p.child && adults.indexOf(p) < (S.tools || 0);
    const arm = t.armFor ? t.armFor(p) : null;
    const has = [p.job === "woodcutter" ? "Axe" : null, arm && arm !== "axe" && arm !== "fists" ? ARMS[arm].name : null, tool ? "Iron tools" : null, home ? "A bed" : null].filter(Boolean);
    const gone = !a || a.gone;
    const m = t.mood ? t.mood(p) : { value: 50, why: [] };
    const tp = TEMPER[p.temper], mk = p.mark && MARKS[p.mark];
    const skills = topSkills(p, 3), main = JOB_SKILL[p.job || "hauler"], lvl = skillLvl(p, main);
    const open = pplOpen.has(p.name);
    rows += `<tr class="${open ? "open" : ""}"><td class="nm"><a data-open="${esc(p.name)}">${esc(p.name)}</a>${p.child ? ' <span class="dim">(child)</span>' : ""}${tp ? `<span class="tag" title="${esc(tp.blurb + " " + tp.does)}">${esc(tp.name)}</span>` : ""}${p.child ? "" : `<span class="tag faith" title="${esc(FAITHS[faithOf(p)].creed + " " + FAITHS[faithOf(p)].rule)}">${esc(FAITHS[faithOf(p)].name)}</span>`}${mk ? `<span class="tag mark" title="${esc(mk.blurb + " " + mk.does)}">${esc(mk.name)}</span>` : ""}</td>
      <td>${p.child ? "—" : cap(JOBS[p.job || "hauler"].name)}</td>
      <td>${p.child ? '<span class="dim">—</span>' : moodCell(m)}</td>
      <td class="dim">${skills.map(k => `${k.name} ${k.lvl}`).join(" · ") || "—"}</td>
      <td class="dim">${esc(gone ? "away" : cap(a.doing || "about the clearing"))}</td>
      <td><div class="has">${has.map(x => `<span>${esc(x)}</span>`).join("") || '<span class="dim">the clothes they came in</span>'}</div></td>
      <td class="acts">${p.child ? "" : `<button data-p="${i}">Set work</button>${lvl < 100 ? `<button data-train="${i}" title="One level of ${SKILL_NAME[main]}, out of the treasury">Train ${esc(SKILL_NAME[main])} ${lvl}→${lvl + 1} · ${trainCost(lvl)} DM</button>` : ""}`}</td></tr>`;
    if (open && !p.child) rows += `<tr class="sheet"><td colspan="7"><div class="sheet-grid">
      <div><div class="k">Skills</div>${SKILLS.map(k => `<div class="sk"><span>${k.name}</span><div class="sk-bar"><i style="width:${skillLvl(p, k.id)}%"></i></div><b>${skillLvl(p, k.id)}</b></div>`).join("")}</div>
      <div>${tp ? `<div class="k">${esc(tp.name)}</div><p>${esc(tp.blurb)} ${esc(tp.does)}</p>` : ""}${mk ? `<div class="k">${esc(mk.name)}</div><p>${esc(mk.blurb)} ${esc(mk.does)}</p>` : ""}
        <div class="k">Why they feel as they do — ${m.value}</div><p>${m.why.map(([n, w]) => `<span class="${n > 0 ? "up" : "down"}">${n > 0 ? "+" : ""}${n}</span> ${esc(w)}`).join("<br>")}</p></div></div></td></tr>`;
  });
  // sending for someone new
  const pop = S.people.length + 2, free = t.beds + 2 - pop - (t.sentFor || 0);
  const trades = Object.keys(JOBS).filter(j => !(t.jobGated && t.jobGated(j)));
  const recruit = t.recruit ? `<div class="recruit"><span>Send for someone:</span><select id="recJob">${trades.map(j => `<option value="${j}">${cap(JOBS[j].name)} — ${SKILL_NAME[JOB_SKILL[j]]}</option>`).join("")}</select><button id="recGo"${free > 0 ? "" : " disabled"}>Send — 12 DM</button><span class="dim">${free > 0 ? `${free} bed${free > 1 ? "s" : ""} free. They come up the road with the trade already in their hands.` : "No bed free — raise a cabin first."}${t.sentFor ? ` ${t.sentFor} on the way.` : ""}</span></div>` : "";
  return `<div class="gov-why" style="margin-bottom:8px">${pop} souls. Everyone who is not family came up the road. Click a name for their whole sheet; the bar is how they feel (hover for why). Two miserable days and they leave.</div>${recruit}
    <table class="ppl"><thead><tr><th>Name</th><th>Work</th><th>Mood</th><th>Best at</th><th>Now</th><th>Has</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
const pplOpen = new Set();
// ---- Europe: the map, and each crown's view of you ----
let euSel = null, euHover = null, euPanelHtml = "", euCity = null, euHoverCity = null;
// the view of the map: zoom and where it looks (in the canvas's units at zoom 1); past ZOOM_3D it becomes the land itself
let euView = { z: 1, ox: 0, oy: 0 }, eu3d = null, eu3dOn = false, euRaf = 0;
const ZOOM_3D = 3.4, DIST_2D = 110;
function govEuropeFrame() {
  return `<div class="eu"><div class="eu-map"><canvas id="euMap" width="1300" height="${Math.round(1300 * MAP_ASPECT)}"></canvas><div class="eu-zoom"><button data-z="in">+</button><button data-z="out">−</button></div><div class="eu-mode" id="euMode"></div></div><div class="dim eu-key">Scroll to zoom, drag to move. Zoom far in and the map becomes the land itself. Your clearing is the red mark north-east of Hamburg. ⚔ a war (red: with you) · ☠ plague. Click a city to see who holds it, or a crown to deal with it.</div><div class="eu-side" id="euSide"></div></div>`;
}
function clampView(cv) {
  const W = cv.width, H = cv.height;
  euView.z = Math.max(1, Math.min(ZOOM_3D + 0.01, euView.z));
  euView.ox = Math.max(0, Math.min(W - W / euView.z, euView.ox)); euView.oy = Math.max(0, Math.min(H - H / euView.z, euView.oy));
}
function drawEuropeTab(t) {
  const cv = $("euMap"); if (!cv) return;
  const E = ensureEurope(t.S);
  const homeName = (t.S.isTown ? "the Town of " : "") + (t.S.name || "Forester's Clearing");
  if (eu3dOn && eu3d) { eu3d.setMap(E, t.S.people.length + 2, homeName); }
  else drawEurope(cv, E, { hover: euHover, selected: euSel, homePop: t.S.people.length + 2, city: euCity, hoverCity: euHoverCity, view: euView, homeName });
  $("euMode").textContent = eu3dOn ? "the land · scroll out for the map" : euView.z > 1.05 ? `×${euView.z.toFixed(1)} · scroll in for the land` : "";
  const html = euSide(t, E);
  if (html !== euPanelHtml) { $("euSide").innerHTML = html; euPanelHtml = html; wireEuSide(t); }
}
const ENVOY = 10, PACT = 15;
function euSide(t, E) {
  const S = t.S, news = (E.news || []).slice(0, 8).map(n => `<li><span class="dim">day ${n.day + 1}</span> ${esc(n.title)}</li>`).join("");
  const atWar = Object.keys(E.war).filter(id => E.war[id]);
  let h = `<div class="mc-sec">Your standing</div><div class="gov-why">${atWar.length ? `At war with ${atWar.map(id => esc(the(id))).join(", ")}.` : "At peace with every crown."} ${Object.keys(E.pact).filter(id => E.pact[id]).length ? `Trade pacts: ${Object.keys(E.pact).filter(id => E.pact[id]).map(id => esc(NATIONS[id].name)).join(", ")} (a DM a day each).` : "No trade pacts."}</div>`;
  // a city chosen: whose it is, and whose it was
  if (euCity) {
    const g = buildGrid(E), own = cityOwner(g, euCity), first = cityFirstOwner(euCity), rank = ["a town", "a town", "a great town", "a seat of the crown"][euCity[3]];
    h += `<div class="mc-sec">${esc(euCity[0])}</div><div class="eu-facts">
      <div><span class="k">Held by</span>${own ? `<b>${esc(NATIONS[own].name)}</b>` : "nobody"}</div>
      <div><span class="k">What it is</span>${rank}${euCity[3] === 3 && own === first ? ` — the seat of ${esc(the(own))}` : ""}</div>
      ${own && first && own !== first ? `<div class="warn">Taken from ${esc(the(first))}, who held it in 1683.</div>` : ""}
      ${own && E.war[own] ? `<div class="warn">Its masters are at war with you.</div>` : ""}</div>`;
  }
  if (euSel) {
    const id = euSel, n = NATIONS[id], rel = Math.round(E.rel[id]), near = NEAR.has(id), war = !!E.war[id];
    const wars = E.wars.filter(w => w.a === id || w.b === id).map(w => NATIONS[w.a === id ? w.b : w.a].name);
    h += `<div class="mc-sec">${esc(n.name)}</div><div class="eu-facts">
      <div><span class="k">Faith</span>${esc(FAITHS[NATION_FAITH[id]].name)}${t.S.stateFaith === NATION_FAITH[id] ? " — as yours" : ""}</div>
      <div><span class="k">Strength</span>${"■".repeat(strengthOf(E, id))}${E.plague[id] ? " · plague" : ""}${E.famine[id] ? " · famine" : ""}</div>
      <div><span class="k">Towards you</span>${relWord(rel)} (${rel > 0 ? "+" : ""}${rel})</div>
      <div><span class="k">Reach</span>${near ? "near enough to march on you, and you on it" : "too far to fight you"}</div>
      ${(() => { const cs = citiesOf(E, id); return cs.length ? `<div><span class="k">Cities</span>${cs.slice(0, 8).map(ct => ct[3] === 3 ? `<b>${esc(ct[0])}</b>` : esc(ct[0])).join(", ")}${cs.length > 8 ? ` and ${cs.length - 8} more` : ""}</div>` : ""; })()}
      ${wars.length ? `<div><span class="k">At war with</span>${esc(wars.join(", "))}</div>` : ""}
      ${war ? `<div class="warn">At war with you${E.beaten[id] ? ` — beaten at your gate ${E.beaten[id]} time${E.beaten[id] > 1 ? "s" : ""}` : ""}.</div>` : ""}</div>
      <div class="eu-acts">
        ${war ? `<button data-eu="peace">Sue for peace — ${10 * strengthOf(E, id)} DM</button>`
              : `<button data-eu="envoy"${rel >= 60 ? " disabled" : ""}>Send an envoy — ${ENVOY} DM<span class="sub">they think better of you (+12)</span></button>
                 <button data-eu="pact"${E.pact[id] || rel < 40 ? " disabled" : ""}>${E.pact[id] ? "A trade pact stands" : `A trade pact — ${PACT} DM`}<span class="sub">${E.pact[id] ? "a DM a day in customs" : rel < 40 ? "they must be friendly first (40)" : "a DM a day in customs, for as long as it lasts"}</span></button>
                 ${near ? `<button data-eu="war" class="danger">Declare war<span class="sub">its soldiers will come up your road, every few days, until one of you gives in</span></button>` : ""}`}
      </div>`;
  } else h += `<div class="gov-why" style="margin-top:10px">Click a crown on the map to see how it stands with you.</div>`;
  return `<div class="eu-col">${h}</div><div class="eu-col"><div class="mc-sec">Word from afar</div><ul class="eu-news">${news || '<li class="dim">Nothing yet.</li>'}</ul></div>`;
}
function wireEurope(t) {
  const cv = $("euMap"), wrap = cv.parentElement;
  // canvas pixels to the sheet's own units (at zoom 1)
  const pos = e => { const r = cv.getBoundingClientRect(); const px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height; return [euView.ox + px / euView.z, euView.oy + py / euView.z]; };
  const choose = (ct, id) => { euCity = ct || null; euSel = ct ? cityOwner(buildGrid(ensureEurope(t.S)), ct) : id; euPanelHtml = ""; drawEuropeTab(t); };
  // ---- into the land, and back out to the map ----
  const enter3d = () => {
    if (!eu3d) {
      eu3d = new EuropeView3D(wrap);
      eu3d.el.addEventListener("wheel", e => { e.preventDefault(); eu3d.dist *= Math.exp(e.deltaY * 0.0015); eu3d.dist = Math.max(2.2, eu3d.dist); if (eu3d.dist > DIST_2D) leave3d(); }, { passive: false });
      let drag = null;
      eu3d.el.addEventListener("mousedown", e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
      addEventListener("mousemove", e => { if (!drag || !eu3dOn) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; eu3d.pan(dx, dy); });
      addEventListener("mouseup", e => {
        if (!drag || !eu3dOn) { drag = null; return; }
        const moved = drag.moved; drag = null;
        if (moved > 5) return;
        const r = eu3d.el.getBoundingClientRect(), hit = eu3d.pick(e.clientX - r.left, e.clientY - r.top);
        if (!hit) return;
        if (hit.city) choose(CITIES.find(c => c[0] === hit.city), null);
        else { const [gx, gy] = gridOf(...hit.ll), g = buildGrid(ensureEurope(t.S)), id = g[Math.floor(gy)] && g[Math.floor(gy)][Math.floor(gx)]; choose(null, id && NATIONS[id] ? id : null); }
      });
    }
    // the centre of the map's view, as a place
    const S = cv.width / MG_W, cx = euView.ox + cv.width / euView.z / 2, cy = euView.oy + cv.height / euView.z / 2;
    const [lon, lat] = llOf(cx / S, cy / S);
    eu3d.look(lon, lat, DIST_2D - 12);
    eu3dOn = true; eu3d.visible = true; eu3d.el.style.display = "block"; cv.style.visibility = "hidden";
    const r = cv.getBoundingClientRect(); eu3d.size(Math.round(r.width), Math.round(r.height));
    drawEuropeTab(t);
    cancelAnimationFrame(euRaf);
    // (drawn only while the map is in front of you: the government closed, or another tab, and it rests)
    const loop = () => { if (!eu3dOn || !$("euMap") || $("gov").classList.contains("hidden")) { if (eu3d) eu3d.visible = false; euRaf = 0; return; } eu3d.visible = true; const rr = $("euMap").getBoundingClientRect(); if (Math.round(rr.width) !== eu3d.w) eu3d.size(Math.round(rr.width), Math.round(rr.height)); eu3d.frame(); euRaf = requestAnimationFrame(loop); };
    loop();
  };
  const leave3d = () => {
    const [lon, lat] = eu3d.centreLL(), [gx, gy] = gridOf(lon, lat), S = cv.width / MG_W;
    eu3dOn = false; eu3d.visible = false; eu3d.el.style.display = "none"; cv.style.visibility = "visible";
    euView.z = ZOOM_3D - 0.4; euView.ox = gx * S - cv.width / euView.z / 2; euView.oy = gy * S - cv.height / euView.z / 2; clampView(cv);
    drawEuropeTab(t);
  };
  // (a view left open in the land stays there when the tab is shown again)
  if (eu3d && eu3dOn) { wrap.appendChild(eu3d.el); enter3d(); }
  // ---- the map: zoom about the pointer, drag to move ----
  const zoomAt = (px, py, f) => {
    const [bx, by] = [euView.ox + px / euView.z, euView.oy + py / euView.z];
    euView.z *= f;
    if (euView.z > ZOOM_3D) { euView.z = ZOOM_3D; clampView(cv); euView.ox = bx - px / euView.z; euView.oy = by - py / euView.z; clampView(cv); return enter3d(); }
    clampView(cv); euView.ox = bx - px / euView.z; euView.oy = by - py / euView.z; clampView(cv); drawEuropeTab(t);
  };
  cv.addEventListener("wheel", e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt((e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  for (const b of wrap.querySelectorAll(".eu-zoom button")) b.onclick = () => {
    if (eu3dOn) { eu3d.dist = Math.max(2.2, eu3d.dist * (b.dataset.z === "in" ? 0.6 : 1.6)); if (eu3d.dist > DIST_2D) leave3d(); return; }
    zoomAt(cv.width / 2, cv.height / 2, b.dataset.z === "in" ? 1.5 : 1 / 1.5);
  };
  let drag = null;
  cv.onmousedown = e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; };
  cv.onmousemove = e => {
    if (drag && e.buttons & 1) {
      const r = cv.getBoundingClientRect(), dx = (e.clientX - drag.x) * cv.width / r.width, dy = (e.clientY - drag.y) * cv.height / r.height;
      drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 5) { euView.ox -= dx / euView.z; euView.oy -= dy / euView.z; clampView(cv); cv.style.cursor = "grabbing"; drawEuropeTab(t); return; }
    }
    const p = pos(e), E = ensureEurope(t.S), ct = cityAt(cv, ...p, euView.z), id = nationAt(E, cv, ...p);
    cv.style.cursor = ct || id ? "pointer" : "grab";
    if (id !== euHover || ct !== euHoverCity) { euHover = id; euHoverCity = ct; drawEuropeTab(t); }
  };
  cv.onmouseleave = () => { drag = null; euHover = null; euHoverCity = null; drawEuropeTab(t); };
  // a click (not a drag) on a city's dot chooses the city (and its crown); anywhere else, the crown there
  cv.onmouseup = e => {
    const moved = drag ? drag.moved : 0; drag = null;
    if (moved > 5) return;
    const p = pos(e), ct = cityAt(cv, ...p, euView.z);
    choose(ct, ct ? null : nationAt(ensureEurope(t.S), cv, ...p));
  };
}
function wireEuSide(t) {
  for (const b of $("euSide").querySelectorAll("button[data-eu]")) b.onclick = () => {
    const S = t.S, E = ensureEurope(S), id = euSel, act = b.dataset.eu, n = NATIONS[id];
    const pay = c => { if ((S.coin || 0) < c) { UI.hint(`That costs ${c} DM.`, 3); return false; } S.coin -= c; return true; };
    if (act === "envoy" && pay(ENVOY)) { E.rel[id] = Math.min(100, E.rel[id] + 12); UI.hint(`Your envoy is received at the court of ${the(id)}.`, 4); }
    if (act === "pact" && pay(PACT)) { E.pact[id] = true; UI.news({ title: `A trade pact with ${the(id)}.`, sub: "A DM a day in customs", img: "event_caravan" }); }
    if (act === "war") { E.war[id] = true; E.pact[id] = false; E.rel[id] = -80; S.raid.next = Math.min(S.raid.next, t.day + 1); UI.news({ title: `${S.name || "The settlement"} declares war on ${the(id)}!`, sub: "Its soldiers will come up the road", img: "event_warparty" }); }
    if (act === "peace" && pay(10 * strengthOf(E, id))) t.makePeace(id, "Bought, and signed");
    t.persist(); euPanelHtml = ""; drawEuropeTab(t);
  };
}
// ---- faith and law: the state creed, who believes what and what stands for them; the jail; the edict ----
let edictArmed = false;
function govFaith(t) {
  const S = t.S, c = census(t), st = S.stateFaith;
  const opts = `<option value="">None — no state creed</option>` + FAITH_IDS.map(id => `<option value="${id}"${st === id ? " selected" : ""}>${esc(FAITHS[id].name)}</option>`).join("");
  const rows = FAITH_IDS.filter(id => c.flock[id] || c.house[id] || c.shrine[id] || id === st).map(id => {
    const F = FAITHS[id], who = S.people.filter(p => !p.child && faithOf(p) === id).map(p => p.name);
    if (id === "lutheran") who.unshift("your family");
    return `<tr><td class="nm">${esc(F.name)}${st === id ? ' <span class="tag mark">state creed</span>' : ""}</td><td>${c.flock[id]}</td><td class="dim">${esc(who.join(", "))}</td><td>${c.house[id] ? `${c.house[id]} ${esc(F.house)}` : c.shrine[id] ? `${c.shrine[id]} ${esc(F.shrine)}` : '<span class="dim">nowhere of their own</span>'}</td><td class="dim" title="${esc(F.creed)}">${esc(F.rule)}</td></tr>`;
  }).join("");
  const next = dedication(t), dissent = S.people.filter(p => !p.child && st && faithOf(p) !== st);
  const jail = t.has("jail"), watch = S.people.some(p => p.job === "watch"), held = S.people.filter(p => p.jailedDay === t.day);
  return `<div class="gov-why" style="margin-bottom:8px">A church or a shrine is raised to one faith, not to faith in general — the state creed, or else the biggest congregation. The next will be <b>${esc(FAITHS[next].name)}</b>.</div>
    <div class="recruit"><span>State creed:</span><select id="stateFaith">${opts}</select><button id="stateGo">Proclaim</button><span class="dim">${st ? `Those of the ${esc(FAITHS[st].name)} creed are glad of it (+11); everyone else resents a state church not their own (−13). With its church standing, dissenters may slowly come over.` : "Proclaiming a creed lifts its own and weighs on everyone else."}</span></div>
    <table class="ppl"><thead><tr><th>Faith</th><th>Souls</th><th>Who</th><th>Their house</th><th>What it means</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="mc-sec" style="margin-top:14px">The law</div>
    <div class="gov-why">${jail ? `A jail stands.` : "No jail."} ${watch ? "A watchman keeps the night." : "No watchman."} ${jail && watch ? "A thief is likely caught, held a day and disgraced, and what they took comes back." : "A miserable settler may steal from the stores in the night, and get away with it."} Lutherans and Mennonites never steal. Thefts so far: ${S.thefts || 0}${S.caught ? `, ${S.caught} caught` : ""}.${held.length ? ` In the jail today: ${esc(held.map(p => p.name).join(", "))}.` : ""}</div>
    ${st ? `<div class="recruit"><button id="edictGo" class="${edictArmed ? "armed" : ""}"${dissent.length ? "" : " disabled"}>${edictArmed ? `Click again — ${dissent.length} put out on the road` : "The Edict of Expulsion"}</button><span class="dim">${dissent.length ? `Every dissenter from the ${esc(FAITHS[st].name)} creed out of the settlement at once: ${esc(dissent.map(p => p.name).join(", "))}. It does not spare the useful, and everyone left who shares their faith draws the obvious conclusion.` : "Not a dissenter left."}</span></div>` : ""}`;
}
function wireFaith(t) {
  const go = $("stateGo");
  if (go) go.onclick = () => {
    const v = $("stateFaith").value || null;
    if (v === (t.S.stateFaith || null)) return;
    t.S.stateFaith = v; t.persist();
    UI.hint(v ? `The ${FAITHS[v].name} creed is proclaimed the faith of ${t.S.name || "the settlement"}.` : "No creed is the state's any more.", 5);
    edictArmed = false; renderGov(true);
  };
  const ed = $("edictGo");
  if (ed) ed.onclick = () => {
    if (!edictArmed) { edictArmed = true; renderGov(true); return; }
    edictArmed = false;
    const st = t.S.stateFaith, out = t.S.people.filter(p => !p.child && faithOf(p) !== st);
    for (const p of out) t.leave("expelled", p);
    UI.hint(`THE EDICT OF EXPULSION: ${out.length} put out of the settlement for refusing the ${FAITHS[st].name} creed.`, 7);
    renderGov(true);
  };
}
function wirePeople(t) {
  for (const b of $("govBody").querySelectorAll("button[data-p]")) b.onclick = () => { const p = t.S.people[+b.dataset.p]; showOverlay("gov", false); t.chooseJob(p); };
  for (const b of $("govBody").querySelectorAll("button[data-train]")) b.onclick = () => { const msg = t.train(t.S.people[+b.dataset.train]); if (msg) UI.hint(msg, 3); renderGov(true); };
  for (const b of $("govBody").querySelectorAll("a[data-open]")) b.onclick = () => { const n = b.dataset.open; pplOpen.has(n) ? pplOpen.delete(n) : pplOpen.add(n); renderGov(true); };
  const go = $("recGo"); if (go) go.onclick = () => { const msg = t.recruit($("recJob").value); UI.hint(msg || "Word is sent down the road. Someone will come.", 4); renderGov(true); };
}
// the tech tree, laid out and drawn exactly as Forester lays it out
function govTechFrame(t) {
  return `<div class="tech-trees">${TECH_TREES.map(([id, name]) => `<button class="tech-tree${id === techTree ? " on" : ""}" data-tree="${id}">${name}</button>`).join("")}</div>
    <div class="tech-top"><input id="techSearch" placeholder="Search technologies…" value="${esc(techQuery)}" autocomplete="off" spellcheck="false"><span class="tech-purse" id="techPurse"></span></div>
    <div class="tech-now" id="techNow"></div>
    <div id="techWrap"><div id="techList"></div></div>
    <div id="techDesc">Click a lit node to research it. Hover for details.</div>`;
}
function wireTech(t) {
  for (const b of $("govBody").querySelectorAll(".tech-tree")) b.onclick = () => { techTree = b.dataset.tree; renderGov(true); };
  const q = $("techSearch");
  q.oninput = () => { techQuery = q.value; drawTech(t); };
  // (typing a T or a G or a J in the box must not open the inventory, or close this)
  q.onkeydown = e => { e.stopPropagation(); if (e.key === "Escape") q.blur(); };
  q.onkeyup = e => e.stopPropagation();
}
const NODE_W = 118, NODE_H = 42, COL_W = 148, ROW_H = 62;
function drawTech(t, quiet) {
  const S = t.S, r = S.tech.research;
  $("techPurse").textContent = `${dm(S.coin)} DM`;
  $("techNow").innerHTML = r ? `Researching <b>${esc(TECH[r.id].name)}</b> — ${Math.min(99, Math.round(r.t / techTime(TECH[r.id]) * 100))}%, ${Math.max(0, Math.ceil(techTime(TECH[r.id]) - r.t))} s left` : `The scholars are idle. ${S.tech.done.length} of ${Object.keys(TECH).length} known.`;
  if (quiet && !r) return;
  const q = techQuery.trim().toLowerCase();
  const known = id => t.knows(id);
  // the tree stays lean: only what is researched or ready to be taken up next is drawn (or what a search finds)
  const frontier = x => !known(x.id) && x.req.every(k => known(k));
  const nodes = Object.values(TECH).filter(x => x.tree === techTree)
    .filter(x => q ? (x.name.toLowerCase().includes(q) || x.desc.toLowerCase().includes(q)) : (known(x.id) || frontier(x)));
  const list = $("techList");
  if (!nodes.length) { list.innerHTML = '<div class="gov-why" style="padding:10px">Nothing here matches.</div>'; return; }
  const byDepth = new Map();
  for (const x of nodes) { if (!byDepth.has(x.depth)) byDepth.set(x.depth, []); byDepth.get(x.depth).push(x); }
  const pos = new Map();
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const colOf = new Map(depths.map((d, i) => [d, i]));
  for (const d of depths) {
    const col = byDepth.get(d);
    col.sort((a, b) => { const key = x => { const ps = x.req.map(k => pos.get(k)).filter(Boolean); return ps.length ? ps.reduce((s2, p) => s2 + p.row, 0) / ps.length : 99; }; return key(a) - key(b); });
    col.forEach((x, i) => pos.set(x.id, { col: colOf.get(d), row: i }));
  }
  const maxRow = Math.max(...[...pos.values()].map(p => p.row));
  const W = depths.length * COL_W + 30, H = (maxRow + 1) * ROW_H + 30;
  const cx = x => 20 + pos.get(x.id).col * COL_W, cy = x => 20 + pos.get(x.id).row * ROW_H;
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (const x of nodes) for (const k of x.req) {
    if (!pos.has(k)) continue;
    const p = TECH[k], x1 = cx(p) + NODE_W, y1 = cy(p) + NODE_H / 2, x2 = cx(x), y2 = cy(x) + NODE_H / 2;
    svg += `<path class="tlink" d="M${x1},${y1} C${x1 + 24},${y1} ${x2 - 24},${y2} ${x2},${y2}"/>`;
  }
  for (const x of nodes) {
    const researching = r && r.id === x.id;
    const cls = known(x.id) ? "done" : researching ? "researching" : t.canResearch(x.id) ? "avail" : "locked";
    const sub = known(x.id) ? "researched" : researching ? Math.round(r.t / techTime(x) * 100) + "%" : `${techCost(x)} DM · ${Math.round(techTime(x) / 6) / 10} min`;
    svg += `<g class="tnode ${cls}" data-tech="${x.id}"><rect x="${cx(x)}" y="${cy(x)}" width="${NODE_W}" height="${NODE_H}" rx="9"/>
      <text x="${cx(x) + NODE_W / 2}" y="${cy(x) + 17}" text-anchor="middle">${esc(x.name)}${known(x.id) ? " ✓" : ""}</text>
      <text class="sub" x="${cx(x) + NODE_W / 2}" y="${cy(x) + 31}" text-anchor="middle">${sub}</text></g>`;
  }
  list.innerHTML = svg + "</svg>";
  const describe = x => { const req = x.req.length ? ` — needs ${x.req.map(k => TECH[k].name + (known(k) ? " ✓" : "")).join(", ")}` : ""; $("techDesc").textContent = `${x.name}: ${x.desc}${req}`; };
  if (techHover && TECH[techHover]) describe(TECH[techHover]);
  list.querySelectorAll(".tnode").forEach(g => {
    const x = TECH[g.dataset.tech];
    g.addEventListener("click", () => { if (t.canResearch(x.id)) { t.research(x.id); drawTech(t); } else describe(x); });
    g.addEventListener("mouseenter", () => { techHover = x.id; describe(x); });
  });
}
G.showGov = (on, tab) => { if (tab) govTab = tab; showOverlay("gov", on); if (on) renderGov(true); };

// the settlement at a glance
setInterval(() => {
  const tb = $("townbar"), t = G.town;
  if (!tb) return;
  const on = !!t && G.mode === "play";
  tb.classList.toggle("hidden", !on);
  if (!on) return;
  // just under the objective, however many lines it runs to
  const ob = $("objective"), obOn = ob && !ob.classList.contains("hidden");
  tb.style.top = (obOn ? ob.offsetTop + ob.offsetHeight + 8 : 24) + "px";
  const S = t.S;
  tb.innerHTML = `${S.name ? `<span class="tname">${esc(S.name)}</span>` : ""}<span class="tb"><img src="${ICON.logs}" alt="">${S.store} / ${t.storeCap}</span><span class="tb"><img src="${ICON.seeds}" alt="">${S.rye}</span><span class="tb"><img src="${ICON.bread}" alt="">${S.bread || 0}</span>${S.meat > 0 ? `<span class="tb" title="meat"><img src="${ICON.meat}" alt="">${S.meat}</span>` : ""}<span class="tb tseed" title="rye seed: a new field takes one">seed ${+(S.seed || 0).toFixed(1)}</span>${t.foodDays ? (fd => `<span class="tb tfood${fd < 2 ? " low" : ""}" title="how long the food in the stores lasts everyone">${fd < 10 ? fd.toFixed(1) : Math.round(fd)} days' food</span>`)(t.foodDays()) : ""}<span class="tb"><img src="${ICON.coin}" alt="">${dm(S.coin)}</span>${[["stone", "stone"], ["planks", "planks"], ["bricks", "bricks"], ["ore", "ore"], ["iron", "iron"], ["tools", "tools"], ["spears", "weapon"], ["swords", "weapon"], ["battleaxes", "weapon"]].filter(([k]) => S[k] > 0).map(([k, ic]) => `<span class="tb" title="${k}"><img src="${ICON[ic]}" alt="">${S[k]}</span>`).join("")}<span class="tb tseason">${G.town.season || ""}</span><span class="tb"><img src="${ICON.cabin}" alt="">${S.people.length + 2} / ${t.beds + 2}</span>`;
}, 300);
// a question with set answers; resolves with the index of the one chosen
G.choose = (title, options) => new Promise(res => {
  $("askTitle").textContent = title;
  $("askInput").style.display = "none"; $("askOk").style.display = "none";
  $("askChoices").innerHTML = options.map((o, i) => `<button class="btn" data-i="${i}">${esc(o)}</button>`).join("");
  UI.show("ask", true);
  if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); }
  setFreeLook(false);
  for (const b of $("askChoices").querySelectorAll("button")) b.onclick = () => {
    UI.show("ask", false); $("askChoices").innerHTML = ""; $("askInput").style.display = ""; $("askOk").style.display = "";
    if (G.mode === "play") lock();
    res(+b.dataset.i);
  };
});
// a question with a written answer; resolves with the text
G.ask = (title, value = "") => new Promise(res => {
  $("askTitle").textContent = title; $("askInput").value = value;
  UI.show("ask", true);
  if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); }
  setFreeLook(false);
  setTimeout(() => { $("askInput").focus(); $("askInput").select(); }, 50);
  const done = () => { const v = $("askInput").value.trim() || value; UI.show("ask", false); $("askOk").onclick = null; $("askInput").onkeydown = null; if (G.mode === "play") lock(); res(v); };
  $("askOk").onclick = done;
  $("askInput").onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") done(); };
});

// ---- the hotbar: nine slots along the bottom; 1-9 picks one; the axe's slot takes it out or puts it away ----
function hotbarItems() {
  const pl = G.player, out = [];
  const tl = G.body && G.body.tools;
  if (pl.hasAxe) out.push({ icon: "axe", name: tl && tl.axe >= 3 && G.town ? `${cap(TIER_NAME[tl.axe])} axe` : "Old felling axe", tool: "axe" });
  if (tl && tl.pick > 0 && G.town) out.push({ icon: "pick" + tl.pick, name: `${cap(TIER_NAME[tl.pick])} pickaxe`, tool: "pick" });
  // the best weapon the smith has made, if there is one: yours to take up
  const arm = G.town && G.town.playerArm && G.town.playerArm();
  // a sword of your own making, when it is the better blade (or there is no other)
  const own = G.town && tl && tl.sword > 0 && (!arm || arm !== "sword" || tl.sword >= 3) ? tl.sword : 0;
  if (arm && !(own && arm === "sword")) out.push({ icon: "weapon", name: ARMS[arm].name, tool: "arm", kind: arm });
  if (own) out.push({ icon: "sword" + own, name: `${cap(TIER_NAME[own])} sword, your own`, tool: "arm", kind: "sword" });
  if (pl.hasBow) { out.push({ icon: "bow", name: "Henning's old bow", tool: "bow" }); out.push({ icon: "arrows", name: "Arrows", n: pl.arrows || 0 }); }
  if (pl.carryN > 0) out.push({ icon: "logs", name: "Spruce logs", n: pl.carryN });
  else if (UI.carrying && /ledger/i.test(UI.carrying)) out.push({ icon: "ledger", name: UI.carrying });
  for (const i of G.pack) out.push(i.icon === "spade" && tl && tl.spade >= 3 && G.town ? { ...i, name: `${cap(TIER_NAME[tl.spade])} spade` } : i);
  // the settlement's bread: yours to eat from the store
  if (G.town && G.town.S.bread > 0) out.push({ icon: "bread", name: "Bread, from the store", n: G.town.S.bread, fromStore: true });
  // what's left of each tool, for the bar under it
  if (tl) for (const i of out) { const k = i.tool === "axe" ? "axe" : i.tool === "pick" ? "pick" : i.icon && i.icon.startsWith("sword") ? "sword" : i.icon === "spade" ? "spade" : null; if (k) i.wear = toolLeft(G.body, k); }
  return out.slice(0, 9);
}
let hbSig = "";
function renderHotbar() {
  const hb = $("hotbar"); if (!hb) return;
  const show = G.mode === "play";
  hb.style.display = show ? "flex" : "none";
  if (!show) return;
  hb.classList.toggle("hidden-by-talk", !!UI.dialogOpen);
  document.body.classList.toggle("talking", !!UI.dialogOpen);
  const items = hotbarItems(), pl = G.player;
  const hf = G.heldFood;
  const sel = items.findIndex(i => hf ? i.icon === hf.icon && !!i.fromStore === hf.fromStore : (i.tool === "axe" && pl.axe && (pl.blade || "axe") === "axe") || (i.tool === "arm" && pl.axe && pl.blade === i.kind) || (i.tool === "pick" && pl.axe && pl.blade === "pick") || (i.tool === "bow" && pl.bow));
  const sig = items.map(i => i.icon + (i.n ?? "") + (i.wear != null ? "w" + Math.round(i.wear * 40) : "")).join("|") + "#" + sel;
  if (sig === hbSig) return;
  hbSig = sig;
  hb.innerHTML = Array.from({ length: 9 }, (_, k) => {
    const it = items[k];
    return `<div class="hb${k === sel ? " sel" : ""}"><span class="k">${k + 1}</span>${it ? `<img src="${ICON[it.icon]}" alt="${esc(it.name)}" title="${esc(it.name)}">${it.n != null && it.n !== 1 ? `<span class="n">${esc(it.n)}</span>` : ""}${it.wear != null && it.wear < 1 ? `<span class="dur${it.wear < 0.15 ? " low" : ""}"><i style="width:${Math.round(it.wear * 100)}%"></i></span>` : ""}` : ""}</div>`;
  }).join("");
}
setInterval(renderHotbar, 200);
addEventListener("keydown", e => {
  if (G.mode !== "play" || overlay || !/^Digit[1-9]$/.test(e.code)) return;
  const it = hotbarItems()[+e.code.slice(5) - 1];
  const pl = G.player, blade = pl.blade || "axe";
  // food in the hand: put away first. If what you picked is already out behind it (the axe, a blade, the bow), that's
  // all — it's in your hand again, not put away by the same press
  const holding = heldFood(), same = holding && it && it.icon === holding.icon && !!it.fromStore === !!holding.fromStore;
  if (holding) {
    putFoodAway();
    if (it && ((it.tool === "axe" && pl.axe && blade === "axe") || (it.tool === "arm" && pl.axe && blade === it.kind) || (it.tool === "pick" && pl.axe && blade === "pick") || (it.tool === "bow" && pl.bow))) return;
  }
  if (it && it.tool === "axe") { if (pl.axe && blade !== "axe") pl.wield("axe"); else { pl.blade = "axe"; pl.holsterAxe(!!pl.axe); } }
  if (it && it.tool === "arm") { if (pl.axe && blade === it.kind) { pl.giveAxe(false); pl.hasAxe = true; pl.blade = "axe"; } else pl.wield(it.kind); }
  if (it && it.tool === "pick") { if (pl.axe && blade === "pick") { pl.giveAxe(false); pl.hasAxe = true; pl.blade = "axe"; } else pl.wield("pick"); }
  if (it && it.tool === "bow") G.player.showBow(!G.player.bow);
  // food: taken in the hand (the number again puts it away); a click eats it
  if (it && FOOD[it.icon] && !same) holdFood(it);
});
// the food in your hand, if any (found again among what you carry, as the bar is rebuilt)
function heldFood() { const h = G.heldFood; if (!h) return null; return hotbarItems().find(i => i.icon === h.icon && !!i.fromStore === h.fromStore) || null; }
function holdFood(it) {
  if (G.working && G.time < G.working.until && G.working.kind !== "food") return;
  G.heldFood = { icon: it.icon, fromStore: !!it.fromStore };
  G.working = { kind: "food", food: it.icon, until: Infinity, quiet: true };
  if (!holdFood.told) { holdFood.told = true; UI.hint(`${it.name} in your hand — click to eat. Press ${hotbarItems().indexOf(it) + 1} again to put it away.`, 4); }
}
function putFoodAway() { G.heldFood = null; if (G.working && (G.working.kind === "food" || G.working.kind === "eat")) G.working = null; }
// a click with food in the hand: a bite (and the food stays in the hand while there's more of it)
G.eatHeld = () => { const it = heldFood(); if (!it) { putFoodAway(); return; } eat(it); };
G.foodInHand = () => !!G.heldFood;
// eating: the number of something you can eat puts it to your mouth
function eat(it) {
  const f = it.icon === "dish" ? { ...FOOD.dish, fill: it.fill || FOOD.dish.fill, raw: false, half: !!it.raw } : FOOD[it.icon], b = G.body;
  if (!f || !b || (G.working && G.time < G.working.until && G.working.kind !== "food")) return;
  if (b.hunger > 0.97) { UI.hint("You're not hungry.", 1.6); return; }
  // raw meat: a warning first; press again and you eat it anyway, and take the plague with it
  if (f.raw && !(eat.armed && eat.armed > performance.now())) { eat.armed = performance.now() + 3000; UI.hint("That's raw. Cook it at the fire first (hold F there) — raw meat brings the plague. Press again to eat it anyway.", 4); return; }
  eat.armed = 0;
  G.working = { kind: "eat", food: it.icon, until: G.time + f.secs };
  const g0 = G.time;
  const done = setInterval(() => {
    if (!G.working || G.working.kind !== "eat") { clearInterval(done); return; }
    if (G.time < g0 + f.secs - 0.05) return;
    clearInterval(done);
    b.hunger = Math.min(1, b.hunger + f.fill); b.dirty = true;
    if (it.icon === "dish" && it.stars >= 4) { G.health = Math.min(1, (G.health ?? 1) + 0.12 * (it.stars - 3)); UI.hint(it.stars >= 5 ? "That was a meal fit for a burgher. You feel it in your bones." : "A good meal. It puts heart in you.", 3); }
    if (f.half && Math.random() < 0.5 && !(b.plague > 0)) { b.plague = PLAGUE_SECS; UI.hint("It was raw in the middle. By evening you're shaking with fever — the plague.", 6); }
    if (f.raw && !(b.plague > 0)) { b.plague = PLAGUE_SECS; UI.hint("You ate it raw. By evening you're shaking with fever — the plague. Nothing mends while you have it; a hospital could cure it.", 7); }
    if (it.fromStore) { if (G.town.S.bread > 0) { G.town.S.bread--; G.town.persist && G.town.persist(); } }
    else { it.n = (it.n || 1) - 1; if (it.n <= 0) G.pack.splice(G.pack.indexOf(it), 1); }
    // back to holding what's left of it, or the hand empty
    if (G.heldFood) { if (heldFood()) G.working = { kind: "food", food: it.icon, until: Infinity, quiet: true }; else putFoodAway(); }
  }, 60);
}

// ---- the full map (J) ----
// the wheel zooms about the point under the cursor; dragging moves the sheet
// ---- marking out new ground on the map: a line dragged through the trees, and the ground behind it claimed ----
const grow = { mode: false, pts: null, drawing: false, check: null };
function mapWorldAt(e) {
  const mv = G.mapView; if (!mv || !mv.S) return null;
  const r = $("bigmapCanvas").getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  return [mv.cx + (mx - mv.W / 2) / mv.S, mv.cz + (my - mv.H / 2) / mv.S];
}
function growReset() { grow.mode = false; grow.pts = null; grow.drawing = false; grow.check = null; $("bigmap").classList.remove("drawing"); }
function growBar() {
  const t = G.town, bar = $("bmGrow");
  const due = t && t.roomDue && t.S.lobes ? t.roomDue() : 0;
  if (!t || !t.S.lobes || (!due && !grow.mode)) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const btn = $("bmGrowBtn"), txt = $("bmGrowText"), cancel = $("bmGrowCancel");
  cancel.classList.toggle("hidden", !grow.mode);
  if (!grow.mode) { txt.textContent = `Room to grow (${t.pop} of you) — ${due > 1 ? `${due} claims` : "one claim"} to make.`; btn.textContent = "Mark out new ground"; btn.disabled = false; return; }
  const c = grow.check;
  if (!c || !grow.pts || grow.pts.length < 2) { txt.textContent = "Hold the left button and draw from the settlement's edge out round the ground you want, and back to the edge."; btn.textContent = "Claim it"; btn.disabled = true; return; }
  txt.innerHTML = grow.drawing ? `Drawing… ${c.area} square paces so far — bring it back to the edge` : c.ok ? `${c.trees} trees to fell · ${c.area} square paces of new ground` : `<span class="bad">${esc(c.why)}</span>`;
  btn.textContent = "Claim it"; btn.disabled = !c.ok || grow.drawing;
}
$("bmGrowBtn").onclick = () => {
  const t = G.town; if (!t) return;
  if (!grow.mode) { grow.mode = true; $("bigmap").classList.add("drawing"); bigMapSoon(); return; }
  if (grow.check && grow.check.ok && t.claim(grow.pts)) { growReset(); showOverlay("bigmap", false); }
};
$("bmGrowCancel").onclick = () => { growReset(); bigMapSoon(); };
// (a drag or a turn of the wheel asks for a redraw; it is drawn once, on the next frame, however many came)
let bigMapQueued = false;
function bigMapSoon() { if (bigMapQueued) return; bigMapQueued = true; requestAnimationFrame(() => { bigMapQueued = false; if (overlay === "bigmap") renderBigMap(); }); }
$("bigmap").addEventListener("wheel", e => {
  const mv = G.mapView; if (!mv || !mv.S) return;
  e.preventDefault();
  const r = $("bigmapCanvas").getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const wx = mv.cx + (mx - mv.W / 2) / mv.S, wz = mv.cz + (my - mv.H / 2) / mv.S;
  const z0 = mv.zoom;
  mv.zoom = clamp(mv.zoom * Math.exp(-e.deltaY * 0.0015), 1, 8);
  const S1 = mv.S * mv.zoom / z0;
  mv.ox += (wx - (mx - mv.W / 2) / S1) - mv.cx; mv.oz += (wz - (my - mv.H / 2) / S1) - mv.cz;
  if (mv.zoom === 1) { mv.ox = 0; mv.oz = 0; }
  if (G.mapUsed && mv.zoom > 1.6) G.mapUsed.zoomed = true;
  bigMapSoon();
}, { passive: false });
{
  let drag = null;
  $("bigmap").addEventListener("mousedown", e => {
    if (e.target.closest && e.target.closest(".bm-grow")) return;
    // marking out ground: a drag draws the line instead of moving the sheet
    if (grow.mode) { const p = mapWorldAt(e); if (p) { grow.pts = [p]; grow.drawing = true; bigMapSoon(); } return; }
    drag = { x: e.clientX, y: e.clientY }; $("bigmap").classList.add("dragging");
  });
  addEventListener("mouseup", () => { drag = null; $("bigmap").classList.remove("dragging"); if (grow.drawing) { grow.drawing = false; bigMapSoon(); } });
  addEventListener("mousemove", e => {
    // (a point every pace or so, as the pen goes)
    if (grow.drawing && overlay === "bigmap") { const p = mapWorldAt(e), l = grow.pts[grow.pts.length - 1]; if (p && Math.hypot(p[0] - l[0], p[1] - l[1]) > 1.2) { grow.pts.push(p); bigMapSoon(); } return; }
    const mv = G.mapView; if (!drag || !mv || !mv.S || overlay !== "bigmap") return;
    mv.ox -= (e.clientX - drag.x) / mv.S; mv.oz -= (e.clientY - drag.y) / mv.S;
    drag = { x: e.clientX, y: e.clientY };
    bigMapSoon();
  });
}
// the context, but reporting the size the map is drawn at (its methods bound once, not on every call)
let _bigProxy = null;
function bigProxy(c, sub) {
  if (_bigProxy && _bigProxy.c === c) { _bigProxy.box.sub = sub; return _bigProxy.p; }
  const bound = new Map(), box = { sub };
  const p = new Proxy(c, {
    get: (t, k) => { if (k === "canvas") return box.sub.canvas; const v = t[k]; if (typeof v !== "function") return v; let f = bound.get(k); if (!f) bound.set(k, f = v.bind(t)); return f; },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  _bigProxy = { c, p, box };
  return p;
}
function renderBigMap() {
  const cv = $("bigmapCanvas"), w = G.world;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cssW = Math.min(innerWidth - 40, (innerHeight - 40) * 1.45), cssH = Math.min(innerHeight - 40, cssW / 1.45);
  if (cv.width !== Math.round(cssW * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.width = cssW + "px"; cv.style.height = cssH + "px"; }
  const c = cv.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  const W = cv.width / dpr, H = cv.height / dpr;
  const b = w.mapBounds || { x0: -100, x1: 100, z0: -100, z1: 100 };
  // the whole sheet at zoom 1; the wheel looks closer, a drag moves the sheet
  const mv = G.mapView || (G.mapView = { zoom: 1, ox: 0, oz: 0 });
  const S0 = Math.min((W - 60) / (b.x1 - b.x0), (H - 60) / (b.z1 - b.z0)), S = S0 * mv.zoom;
  const span = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2;
  mv.ox = clamp(mv.ox, -span, span); mv.oz = clamp(mv.oz, -span, span);
  const cx = (b.x0 + b.x1) / 2 + mv.ox, cz = (b.z0 + b.z1) / 2 + mv.oz;
  mv.S = S; mv.W = W; mv.H = H; mv.cx = cx; mv.cz = cz;
  const X = x => W / 2 + (x - cx) * S, Z = z => H / 2 + (z - cz) * S;
  // draw at CSS size into a scaled context; the map code reads the canvas size, so give it one that matches
  const sub = { canvas: { width: W, height: H } };
  c.save(); c.scale(dpr, dpr);
  const proxy = bigProxy(c, sub);
  drawMap(proxy, X, Z, S, true, cx, cz, Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / mv.zoom);
  // the ground being marked out: shaded, the line staked, green if it will do and red if not
  grow.check = grow.mode && grow.pts && G.town ? G.town.claimFor(grow.pts) : null;
  if (grow.check && grow.pts.length >= 2) {
    const q = grow.check, col = grow.drawing ? "120,90,40" : q.ok ? "46,120,60" : "170,50,35";
    c.fillStyle = `rgba(${col},0.25)`; c.beginPath(); q.poly.forEach(([x, z], i) => i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.closePath(); c.fill();
    // the line as drawn, in ink; the join back to the start (through the settlement) dotted
    c.strokeStyle = MAPINK; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath(); grow.pts.forEach(([x, z], i) => i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.stroke();
    const a = grow.pts[0], b = grow.pts[grow.pts.length - 1];
    c.strokeStyle = `rgba(${col},0.9)`; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(b[0]), Z(b[1])); c.lineTo(X(a[0]), Z(a[1])); c.stroke(); c.setLineDash([]);
    for (const [x, z] of [a, b]) { c.fillStyle = `rgb(${col})`; c.beginPath(); c.arc(X(x), Z(z), 4, 0, Math.PI * 2); c.fill(); c.strokeStyle = MAPINK; c.lineWidth = 1.2; c.stroke(); }
  }
  growBar();
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

// ---- the guide: the first time you meet a thing, a card that says how it works; H, the book of them all ----
const guideSeen = () => { const s = loadSave() || {}; return s.tips || []; };
const guideQ = [];
let guidePage = null, guideShowing = false;
G.guide = id => {
  if (!GUIDE[id] || guideQ.includes(id) || window.__noGuide) return;
  if (guideSeen().includes("guide:" + id)) return;
  guideQ.push(id);
};
// (shown only when nothing else has the screen: no talk, no menu, no cutscene)
setInterval(() => {
  if (window.__manual && !window.__guideOn) return;     // (tests step the game themselves, and a card would stop them)
  if (!guideQ.length || guideShowing || G.mode !== "play" || overlay || UI.dialogOpen || G.cine || G.lockMove) return;
  const id = guideQ.shift();
  if (guideSeen().includes("guide:" + id)) return;
  writeSave({ tips: [...guideSeen(), "guide:" + id] });
  showGuideCard(id);
}, 400);
function guideSteps(g) { return g.steps.map(t => `<li>${t}</li>`).join(""); }
function showGuideCard(id) {
  const g = GUIDE[id]; guideShowing = true; guidePage = id;
  $("gdKicker").textContent = g.kicker; $("gdTitle").textContent = g.title; $("gdSteps").innerHTML = guideSteps(g);
  const was = G.mode; G.mode = "lesson";
  if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); }
  setFreeLook(false);
  SFX.pauseAll && SFX.pauseAll(true);
  const el = $("guideCard"); el.classList.remove("hidden");
  const done = () => {
    if (closed) return; closed = true;
    removeEventListener("keydown", key, true); $("guideOk").onclick = null;
    el.classList.add("hidden"); guideShowing = false;
    G.mode = was === "lesson" ? "play" : was; SFX.pauseAll && SFX.pauseAll(false);
    if (G.mode === "play") lock();
  };
  const key = e => { if (e.code === "Space" || e.code === "Enter" || e.code === "Escape" || e.code === "KeyF") { e.preventDefault(); e.stopImmediatePropagation(); G.holdLatch = true; done(); } };
  let closed = false;
  setTimeout(() => { if (!closed) addEventListener("keydown", key, true); }, 350);
  $("guideOk").onclick = done;
}
function renderGuide() {
  const seen = guideSeen(), known = GUIDE_ORDER.filter(id => seen.includes("guide:" + id));
  if (!known.includes(guidePage)) guidePage = known[known.length - 1] || null;
  if (!known.length) { $("guideBody").innerHTML = `<div class="gd-grid"><div class="gd-empty">Nothing yet. As you meet each part of the game, how it works is written down here.</div></div>`; return; }
  const g = GUIDE[guidePage];
  $("guideBody").innerHTML = `<div class="gd-grid"><div class="gd-list">${known.map(id => `<button data-gd="${id}"${id === guidePage ? ' class="on"' : ""}>${esc(GUIDE[id].title)}</button>`).join("")}</div>
    <div class="gd-page"><div class="ls-kicker">${esc(g.kicker)}</div><h4>${esc(g.title)}</h4><ol>${guideSteps(g)}</ol></div></div>`;
  for (const b of $("guideBody").querySelectorAll("[data-gd]")) b.onclick = () => { guidePage = b.dataset.gd; renderGuide(); };
}

// ---- pause ----
// a lesson: everything stops, the world goes grey behind a card, and on it goes when you have read it
G.lesson = () => new Promise(res => {
  if (overlay) showOverlay(overlay, false);
  const was = G.mode; G.mode = "lesson";
  if (document.pointerLockElement) { freeMouse = true; document.exitPointerLock(); }
  setFreeLook(false);
  SFX.pauseAll && SFX.pauseAll(true);
  const el = $("lesson"); el.classList.remove("hidden");
  const done = () => {
    if (closed) return; closed = true;
    removeEventListener("keydown", key); $("lessonOk").onclick = null;
    el.classList.add("hidden");
    G.mode = was === "lesson" ? "play" : was; SFX.pauseAll && SFX.pauseAll(false);
    if (G.mode === "play") lock();
    res();
  };
  const key = e => { if (e.code === "Space" || e.code === "Enter" || e.code === "Escape" || e.code === "KeyF") { e.preventDefault(); done(); } };
  let closed = false;
  setTimeout(() => { if (!closed) addEventListener("keydown", key); }, 300);
  $("lessonOk").onclick = done;
});
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
  if (e.code === "KeyT" && !e.repeat && G.mode === "play") showOverlay("inventory", overlay !== "inventory");
  if (e.code === "KeyP" && !e.repeat && G.mode === "play") showOverlay("skills", overlay !== "skills");
  if (e.code === "Tab" && !e.repeat && G.mode === "play") { e.preventDefault(); showOverlay("keysRef", overlay !== "keysRef"); }
  if (e.code === "KeyH" && !e.repeat && G.mode === "play") showOverlay("guideBook", overlay !== "guideBook");
  // X: down off the horse, wherever you are; it goes home to the stable by itself
  if (e.code === "KeyX" && !e.repeat && G.mode === "play" && G.player && G.player.horse) {
    G.player.dismount(); const st = G.town && G.town.S.buildings.find(b => b.type === "stable" && b.done); if (st) G.town.show(st);
    UI.hint("You get down. The horse trots home to the stable.", 3);
  }
  // ; : the free camera — the view flies loose of you (WASD, Space up, C down, Shift quicker); ; again to come back
  // (and ; always brings you back, whatever is open)
  if (e.code === "Semicolon" && !e.repeat && G.mode === "play" && (!overlay || G.freecam)) { const on = G.toggleFreecam(); UI.hint(on ? "Free camera: WASD to fly, Space up, C down, Shift quicker. ; to come back." : "Back in yourself.", on ? 4 : 1.5); }
  if (e.code === "KeyJ" && !e.repeat && G.mode === "play") {
    if (!G.hasMap && overlay !== "bigmap") UI.hint("You haven't a map.", 2.5);
    else showOverlay("bigmap", overlay !== "bigmap");
  }
  if (e.code === "KeyB" && !e.repeat && G.mode === "play" && G.town && !G.town.planning) showOverlay("buildmenu", overlay !== "buildmenu");   // (while a plan is out, B puts it away instead: the town sees that itself)
  if (e.code === "KeyV" && !e.repeat && G.mode === "play") {
    if (overlay === "inspect") showOverlay("inspect", false);
    else if (G.town && !G.town.planning && !overlay) {
      const b = G.town.buildingAt();
      if (!b) UI.hint("Look at a building and press V to see it up close.", 2.5);
      else { inspB = b; inspSig = ""; showOverlay("inspect", true); }
    }
  }
  if (e.code === "KeyG" && !e.repeat && G.mode === "play") {
    if (!G.town && overlay !== "gov") UI.hint("There is no settlement to govern yet.", 2.5);
    else showOverlay("gov", overlay !== "gov");
  }
  if (e.code === "Escape" && overlay) { showOverlay(overlay, false); return; }
  // F closes whatever menu is open, as Escape does (not while typing in a box); held F doesn't then reopen it
  if (e.code === "KeyF" && !e.repeat && overlay && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) { showOverlay(overlay, false); G.holdLatch = true; return; }
  // M takes the mouse into the game, or gives it back
  if (e.code === "KeyM" && !e.repeat) {
    if (G.mode === "pause") resume();
    else if (G.mode === "play") toggleMouse();
  }
});
// a click on the world while playing re-takes the mouse
renderer.domElement.addEventListener("click", () => { if (G.mode === "play" && !document.pointerLockElement && !overlay) lock(); });

// ---- the loop ----
let last = performance.now();
let lastDrawn = 0;
function loop(now) {
  // (a frame cap skips frames that come too soon, and the time they would have had goes to the next)
  const cap = G.settings.cap || 0;
  if (cap && now - lastDrawn < 1000 / cap - 1.5) { requestAnimationFrame(loop); return; }
  meterFps((now - (lastDrawn || now)) / 1000);
  lastDrawn = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!window.__manual) frame(dt * (G.devSpeed || 1));    // (tests step the game themselves; the developer's panel can hurry it)
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
// the graphics lost (a driver that gives up, on some Windows machines): what you have is saved, the page starts again,
// and you're put straight back into your game, rather than left looking at a frozen picture
renderer.domElement.addEventListener("webglcontextlost", e => {
  e.preventDefault();
  console.error("Reckoning: the graphics were lost — saving and starting again");
  G.flushSave && G.flushSave();
  try { if (G.mode === "play") sessionStorage.setItem("reckoning.resume", "1"); } catch (e2) {}
  setTimeout(() => location.reload(), 400);
});
setTimeout(() => {
  let again = false; try { again = sessionStorage.getItem("reckoning.resume") === "1"; sessionStorage.removeItem("reckoning.resume"); } catch (e) {}
  if (again && loadSave()) { $("btnContinue").click(); setTimeout(() => UI.hint("The graphics stopped for a moment — you're back where you were.", 4), 2500); }
}, 600);
// for testing from the console: __play(3) starts the third chapter
window.__play = (n, who = "brother", opts) => { G.who = who; play(n, opts); };
// ?raid: straight into free play with the bow, and a band of raiders on the road in a few seconds
if (/[?&]raid\b/.test(location.search)) loadModels().finally(() => {
  G.who = "brother"; play(14);
  const iv = setInterval(() => {
    const t = G.town, pl = G.player;
    if (!t || !t.raids || !pl || G.lockMove) return;
    clearInterval(iv);
    pl.hasBow = true; pl.arrows = Math.max(pl.arrows || 0, 24); G.world.huntOpen = true;
    t.S.raid.next = t.day; t.t = (Math.floor(t.t / t.dayLen) + 0.595) * t.dayLen;
  }, 500);
});

// ---- the key to the map: beside the minimap (K), and always in the corner of the big map ----
import { drawLegend, LEGEND } from "./map.js";
import "./dev.js";
function legendCanvas() {
  const cv = document.createElement("canvas"), d = Math.min(2, devicePixelRatio || 1), w = 228, h = 28 + LEGEND.length * 17;
  cv.width = w * d; cv.height = h * d; cv.style.width = w + "px"; cv.style.height = h + "px";
  const c = cv.getContext("2d"); c.scale(d, d); drawLegend(c, 0, 0);
  return cv;
}
// (drawn when the fonts are in, so the words are in the map's own hand)
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
  $("mmLegend").appendChild(legendCanvas());
  const big = document.createElement("div"); big.className = "bigmap-key"; big.appendChild(legendCanvas());
  $("bigmap").appendChild(big);
});
let legendOn = false;
addEventListener("keydown", e => {
  if (e.code !== "KeyK" || e.repeat || G.mode !== "play" || (overlay && overlay !== "bigmap")) return;
  legendOn = !legendOn; $("mmLegend").classList.toggle("hidden", !legendOn);
});
setInterval(() => { const on = G.mode === "play" && !!G.hasMap; $("mmKeyTab").classList.toggle("hidden", !on || legendOn); if (!on) $("mmLegend").classList.add("hidden"); else $("mmLegend").classList.toggle("hidden", !legendOn); }, 400);
