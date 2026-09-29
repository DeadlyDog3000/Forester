// ===========================================================================
//  FORESTER: RECKONING
//  Copyright (c) 2026 Roan Fraese, trading as DeadlyDog Productions.
//  All rights reserved. See reckoning/LICENSE.
// ===========================================================================

// Boot, the front door, the pause menu, and the loop.

import { renderer, clamp } from "./core.js";
import { G, Player, frame, setAtmo, input, drawMap, setGraphics } from "./engine.js";
import { INK as MAPINK, SERIF as MAPSERIF, compass as mapCompass } from "./map.js";
import { BUILDINGS as TOWN_BUILDINGS, JOBS, MAT_NAME, YEAR, UPGRADES, WORKS } from "./town.js";
import { TECH, TECH_TREES, techCost, techTime } from "./gov.js";
import { FURNITURE } from "./furnish.js";
import { UI, $ } from "./ui.js";
import { AUDIO } from "./audio.js";
import { CHAPTERS, LOOKS, startChapter, loadSave, writeSave, clearSave, SLOTS, getSlot, setSlot, readSlot, writeSlot, clearSlot } from "./story.js";
import { CHANGELOG } from "./changelog.js";
import { loadModels } from "./models.js";
import { ARMS } from "./raid.js";

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
  $("fpsMeter").classList.toggle("hidden", !s.showFps);
  setGraphics({ shadows: s.shadows || "high", drawMul: +(s.draw ?? 1) });
  if (!s.dynres) dynScale = 1;
  applyScale();
  $("sensVal").textContent = (+s.sens).toFixed(2); $("fovVal").textContent = s.fov + "°"; $("volVal").textContent = Math.round(s.volume * 100) + "%";
}
for (const [id, key, num] of [["setSens", "sens", true], ["setFov", "fov", true], ["setVol", "volume", true]]) {
  $(id).addEventListener("input", e => { G.settings[key] = num ? +e.target.value : e.target.value; applySettings(); G.saveSettings(); });
}
$("setQuality").addEventListener("change", e => { G.settings.quality = e.target.value; applySettings(); G.saveSettings(); });
// ---- FPS boosters ----
const PRESETS = {
  high: { scale: 1, dynres: false, shadows: "high", draw: 1 },
  balanced: { scale: 0.85, dynres: true, shadows: "low", draw: 0.75 },
  performance: { scale: 0.65, dynres: true, shadows: "off", draw: 0.55 },
};
let dynScale = 1;
function applyScale() {
  const s = G.settings;
  const pr = Math.min(devicePixelRatio, 1.75) * (s.scale ?? 1) * dynScale;
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
}
const custom = (key, val) => { G.settings[key] = val; G.settings.quality = "custom"; applySettings(); G.saveSettings(); };
$("setScale").addEventListener("input", e => custom("scale", +e.target.value));
$("setDynres").addEventListener("change", e => custom("dynres", e.target.checked));
$("setShadows").addEventListener("change", e => custom("shadows", e.target.value));
$("setDraw").addEventListener("change", e => custom("draw", +e.target.value));
$("setCap").addEventListener("change", e => { G.settings.cap = +e.target.value; G.saveSettings(); });
$("setFps").addEventListener("change", e => { G.settings.showFps = e.target.checked; applySettings(); G.saveSettings(); });
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
for (const [id, key] of [["setInvert", "invert"], ["setMusic", "music"]]) {
  $(id).addEventListener("change", e => { G.settings[key] = e.target.checked; applySettings(); G.saveSettings(); });
}

// ---- the player's body exists from the start; the look is set on choosing ----
G.player = new Player();

// ---- screens ----
const screens = ["title", "choose", "chapters", "settings", "controls", "pause", "updates", "slots"];
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

// a new game: first, which of the six saves it goes in
$("btnNew").onclick = () => { back = "title"; slotMode = "new"; buildSlots(); screen("slots"); };
$("btnSlots").onclick = () => { back = "title"; slotMode = "play"; buildSlots(); screen("slots"); };
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
  key: "art/item_key.png", blackberries: "art/item_blackberries.png", ledger: "art/item_ledger.png", door: "art/item_door.png", spade: "art/item_spade.png", stone: "../assets/sprites/items/stone.png", iron: "../assets/sprites/items/iron.png", ore: "../assets/sprites/items/stone.png", tools: "../assets/sprites/items/tool_iron.png", planks: "art/item_door.png", bricks: "../assets/sprites/items/stone.png", bread: "../assets/sprites/items/bread.png", coin: "../assets/sprites/items/dm.png", cart: "../assets/sprites/items/wheat.png", meat: "../assets/sprites/items/meat.png", map: "art/item_map.png", bow: "art/item_bow.png", arrows: "art/item_arrows.png", seeds: "../assets/sprites/items/seeds.png",
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
  bigmap: { open: () => { G.mapView = { zoom: 1, ox: 0, oz: 0 }; G.mapOpen = true; if (G.mapUsed) G.mapUsed.opened = true; renderBigMap(); }, tick: () => renderBigMap(), every: 250, close: () => { G.mapOpen = false; } },
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
    b.type === "cabin" && b.done ? ["Sleeps", `${t.perCabin}`] : null,
    b.type === "woodshed" && b.done ? ["Holds", `30 more logs (the store holds ${t.storeCap})`] : null,
    works.length ? ["Who works here", who.length ? esc(who.join(", ")) : '<span class="warn">no one — set someone to it (F by them)</span>'] : null,
    ["Upkeep", keep ? `${keep === 0.5 ? "½" : keep} DM a day${t.untended ? ' <span class="warn">— unpaid today: it stands idle</span>' : ""}` : "nothing — once it stands, it stands"],
  ].filter(Boolean);
  // the two things to do with it
  const acts = [];
  if (t.canUpgrade(b)) {
    const u = UPGRADES[(b.tier || 1) + 1], need = u.needs && u.needs(t), can = !need && t.afford(u.mats);
    acts.push(`<button data-act="up"${can ? "" : " disabled"}>Rebuild in ${esc(u.style.split(",")[0])}<span class="sub">${esc(t.costText(u.mats))}${need ? ` — first, ${esc(need)}` : !can ? ` — ${esc(t.short(u.mats))} short` : ""}</span></button>`);
  } else if (b.done && b.type !== "field" && b.type !== "path") acts.push(`<button disabled>Rebuild<span class="sub">${(b.tier || 1) >= 4 ? "built as well as it can be" : "this kind isn't rebuilt"}</span></button>`);
  const back = t.refundOf(b);
  acts.push(`<button data-act="down" class="danger${inspArmed ? " armed" : ""}">${inspArmed ? "Click again to pull it down" : b.done ? "Dismantle" : "Give up the site"}<span class="sub">${Object.keys(back).length ? `back in the stores: ${esc(t.costText(back))}` : "nothing comes back"}${b.type === "woodshed" && b.done ? " — logs past what the stack holds are lost" : ""}${b.type === "cabin" && b.done ? " — whoever sleeps there loses their bed" : ""}</span></button>`);
  const sig = JSON.stringify([rows, acts]);
  if (sig === inspSig) return;
  inspSig = sig;
  $("inspTitle").textContent = def.name + ((b.tier || 1) > 1 ? ` — ${UPGRADES[b.tier].style.split(",")[0]}` : "");
  $("inspBody").innerHTML = `<div class="insp-rows">${rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join("")}</div>`;
  $("inspActs").innerHTML = acts.join("");
}
$("inspActs").addEventListener("click", e => {
  const bt = e.target.closest("button[data-act]"); if (!bt || bt.disabled) return;
  const t = G.town, b = inspB; if (!t || !b) return;
  if (bt.dataset.act === "up") { if (t.upgrade(b)) showOverlay("inspect", false); else renderInspect(); }
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
    $("buildList").innerHTML = Object.entries(FURNITURE).map(([k, d]) => `<button class="plan${t.canAfford(k) ? "" : " short"}" data-k="${k}"><img src="${d.rye ? ICON.seeds : ICON.logs}" alt=""><span><span class="pn">${esc(d.name)}</span><span class="pd">${esc(d.note)}</span></span><span class="pc">${cost(d)}</span></button>`).join("");
    for (const b of $("buildList").querySelectorAll(".plan")) b.onclick = () => { if (!t.canAfford(b.dataset.k)) return; showOverlay("buildmenu", false); t.furnish(b.dataset.k); };
    return;
  }
  const list = Object.entries(TOWN_BUILDINGS).filter(([k]) => !t.unlocked || t.unlocked.has(k));
  $("buildList").innerHTML = list.map(([k, d]) => t.gated(k) ? `<button class="plan short" data-k="${k}" data-gate="1"><img src="${ICON[d.icon] || ICON.logs}" alt=""><span><span class="pn">${esc(d.name)}</span><span class="pd">Requires the ${esc(t.gated(k).name)} technology — research it in the government (G).</span></span><span class="pc">locked</span></button>` : `<button class="plan" data-k="${k}"><img src="${ICON[d.icon] || ICON.logs}" alt=""><span><span class="pn">${esc(d.name)}</span><span class="pd">${esc(d.note)}</span></span><span class="pc">${d.path ? "free" : d.cost ? [d.cost + " logs", ...Object.entries(d.mats || {}).map(([k, n]) => `${n} ${k}`)].join(", ") : "a spade"}</span></button>`).join("") || `<div class="inv-empty">Nothing to build yet.</div>`;
  for (const b of $("buildList").querySelectorAll(".plan")) b.onclick = () => { if (b.dataset.gate) return; showOverlay("buildmenu", false); G.town.plan(b.dataset.k); };
}
// ---- trading: a list of offers from whoever you're dealing with ----
let tradeNow = null;
G.openTrade = (title, purse, offers, after) => { tradeNow = { title, purse, offers, after }; showOverlay("trade", true); };
G.closeTrade = () => showOverlay("trade", false);
function renderTrade() {
  const t = tradeNow; if (!t) return;
  $("tradeTitle").textContent = t.title;
  $("tradePurse").textContent = t.purse && !/DM/.test(t.purse) ? t.purse : G.town ? `${G.town.S.coin} DM` : "";
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
function renderGov(full) {
  const t = G.town; if (!t) return;
  // (a redraw every half second would steal the search box's focus and the tree's scroll: only what moves is redrawn)
  const key = govTab + "|" + techTree;
  for (const b of document.querySelectorAll("#govTabs .gov-tab")) b.classList.toggle("on", b.dataset.tab === govTab);
  $("govTitle").textContent = `Government — ${t.S.name || "the clearing"}`;
  if (govTab === "nation") $("govBody").innerHTML = govNation(t);
  else if (govTab === "people") { $("govBody").innerHTML = govPeople(t); wirePeople(t); }
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
  const need = Math.max(1, Math.ceil(pop / 2 * (t.knows("horsefeed") ? 0.8 : 1)));
  const foodDays = Math.floor((S.rye + (S.bread || 0) * 2) / need);
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
  h += stat("Treasury", `${S.coin || 0} DM`, `${t.upkeepBill && t.techGates && t.upkeepBill() ? `Keeping the works costs ${String(t.upkeepBill()).replace(/\.5$/, "½").replace(/^0½/, "½")} DM a day${t.untended ? " — unpaid today, so they stand idle" : ""} (V at a building shows its share). ` : ""}Earn DM by selling logs, bread and rye to the traders on the road — Henning ${when(next(3, 1))}, Tobias the pedlar ${when(next(4, 3))}${t.has("market") ? ` · the market took ${S.soldToday || 0} DM yesterday` : " — or build a market (research Trading) to sell every day"}.`);
  h += stat("Knowledge", `${known} of ${total}`, rt ? `researching ${esc(rt.name)} — ${Math.min(99, Math.round(r.t / techTime(rt) * 100))}%` : "the scholars are idle — see the tech tree", rt ? r.t / techTime(rt) : known / total, false);
  h += `</div><div class="mc-sec">Why they feel as they do</div><div class="gov-why">${why || "—"}</div>`;
  // the stores
  const mats = [["store", "logs"], ["rye", "seeds"], ["bread", "bread"], ["stone", "stone"], ["planks", "planks"], ["bricks", "bricks"], ["ore", "ore"], ["iron", "iron"], ["tools", "tools"], ["spears", "weapon"], ["swords", "weapon"], ["battleaxes", "weapon"], ["coin", "coin"]];
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
  let rows = `<tr><td class="nm">${youName} <span class="dim">(you)</span></td><td>Head of the household</td><td class="dim">The cabin</td><td class="dim">—</td><td><div class="has">${you.map(x => `<span>${esc(x)}</span>`).join("") || '<span class="dim">nothing</span>'}</div></td><td></td></tr>`;
  rows += `<tr><td class="nm">${sibName}</td><td>Woodcutter · family</td><td class="dim">The cabin, the second pallet</td><td class="dim">${esc(sibA ? cap(sibA.doing || "about the clearing") : "about the clearing")}</td><td><div class="has"><span>Axe</span></div></td><td></td></tr>`;
  S.people.forEach((p, i) => {
    const a = t.actors.find(x => x.settler === p);
    const home = cabins[Math.floor(i / t.perCabin)];
    const tool = !p.child && adults.indexOf(p) < (S.tools || 0);
    const arm = t.armFor ? t.armFor(p) : null;
    const has = [p.job === "woodcutter" ? "Axe" : null, arm && arm !== "axe" && arm !== "fists" ? ARMS[arm].name : null, tool ? "Iron tools" : null, home ? "A bed" : null].filter(Boolean);
    const gone = !a || a.gone;
    rows += `<tr><td class="nm">${esc(p.name)}${p.child ? ' <span class="dim">(child)</span>' : ""}</td>
      <td>${p.child ? "—" : cap(JOBS[p.job || "hauler"].name)}</td>
      <td class="dim">${home ? `Cabin ${cabins.indexOf(home) + 1}` : "By the fire — no bed"}</td>
      <td class="dim">${esc(gone ? "away" : cap(a.doing || "about the clearing"))}</td>
      <td><div class="has">${has.map(x => `<span>${esc(x)}</span>`).join("") || '<span class="dim">the clothes they came in</span>'}</div></td>
      <td>${p.child ? "" : `<button data-p="${i}">Set work</button>`}</td></tr>`;
  });
  return `<div class="gov-why" style="margin-bottom:8px">${S.people.length + 2} souls. Everyone who is not family came up the road.</div>
    <table class="ppl"><thead><tr><th>Name</th><th>Work</th><th>Home</th><th>Now</th><th>Has</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
function wirePeople(t) {
  for (const b of $("govBody").querySelectorAll("button[data-p]")) b.onclick = () => { const p = t.S.people[+b.dataset.p]; showOverlay("gov", false); t.chooseJob(p); };
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
  $("techPurse").textContent = `${S.coin || 0} DM`;
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
  tb.innerHTML = `${S.name ? `<span class="tname">${esc(S.name)}</span>` : ""}<span class="tb"><img src="${ICON.logs}" alt="">${S.store} / ${t.storeCap}</span><span class="tb"><img src="${ICON.seeds}" alt="">${S.rye}</span><span class="tb"><img src="${ICON.bread}" alt="">${S.bread || 0}</span><span class="tb"><img src="${ICON.coin}" alt="">${S.coin || 0}</span>${[["stone", "stone"], ["planks", "planks"], ["bricks", "bricks"], ["ore", "ore"], ["iron", "iron"], ["tools", "tools"], ["spears", "weapon"], ["swords", "weapon"], ["battleaxes", "weapon"]].filter(([k]) => S[k] > 0).map(([k, ic]) => `<span class="tb" title="${k}"><img src="${ICON[ic]}" alt="">${S[k]}</span>`).join("")}<span class="tb tseason">${G.town.season || ""}</span><span class="tb"><img src="${ICON.cabin}" alt="">${S.people.length + 2} / ${t.beds + 2}</span>`;
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
  if (pl.hasAxe) out.push({ icon: "axe", name: "Old felling axe", tool: "axe" });
  // the best weapon the smith has made, if there is one: yours to take up
  const arm = G.town && G.town.playerArm && G.town.playerArm();
  if (arm) out.push({ icon: "weapon", name: ARMS[arm].name, tool: "arm", kind: arm });
  if (pl.hasBow) { out.push({ icon: "bow", name: "Henning's old bow", tool: "bow" }); out.push({ icon: "arrows", name: "Arrows", n: pl.arrows || 0 }); }
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
  document.body.classList.toggle("talking", !!UI.dialogOpen);
  const items = hotbarItems(), pl = G.player;
  const sel = items.findIndex(i => (i.tool === "axe" && pl.axe && (pl.blade || "axe") === "axe") || (i.tool === "arm" && pl.axe && pl.blade === i.kind) || (i.tool === "bow" && pl.bow));
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
  const pl = G.player, blade = pl.blade || "axe";
  if (it && it.tool === "axe") { if (pl.axe && blade !== "axe") pl.wield("axe"); else { pl.blade = "axe"; pl.holsterAxe(!!pl.axe); } }
  if (it && it.tool === "arm") { if (pl.axe && blade === it.kind) { pl.giveAxe(false); pl.hasAxe = true; pl.blade = "axe"; } else pl.wield(it.kind); }
  if (it && it.tool === "bow") G.player.showBow(!G.player.bow);
});

// ---- the full map (J) ----
// the wheel zooms about the point under the cursor; dragging moves the sheet
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
  renderBigMap();
}, { passive: false });
{
  let drag = null;
  $("bigmap").addEventListener("mousedown", e => { drag = { x: e.clientX, y: e.clientY }; $("bigmap").classList.add("dragging"); });
  addEventListener("mouseup", () => { drag = null; $("bigmap").classList.remove("dragging"); });
  addEventListener("mousemove", e => {
    const mv = G.mapView; if (!drag || !mv || !mv.S || overlay !== "bigmap") return;
    mv.ox -= (e.clientX - drag.x) / mv.S; mv.oz -= (e.clientY - drag.y) / mv.S;
    drag = { x: e.clientX, y: e.clientY };
    renderBigMap();
  });
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
  const proxy = new Proxy(c, { get: (t, k) => k === "canvas" ? sub.canvas : (typeof t[k] === "function" ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  drawMap(proxy, X, Z, S, true, cx, cz, Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / mv.zoom);
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
  if (e.code === "KeyJ" && !e.repeat && G.mode === "play") {
    if (!G.hasMap && overlay !== "bigmap") UI.hint("You haven't a map.", 2.5);
    else showOverlay("bigmap", overlay !== "bigmap");
  }
  if (e.code === "KeyB" && !e.repeat && G.mode === "play" && G.town && !G.town.planning) showOverlay("buildmenu", overlay !== "buildmenu");
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
  // M takes the mouse into the game, or gives it back
  if (e.code === "KeyM" && !e.repeat) {
    if (G.mode === "pause") resume();
    else if (G.mode === "play") toggleMouse();
  }
});
// a click on the world while playing re-takes the mouse
renderer.domElement.addEventListener("click", () => { if (G.mode === "play" && !document.pointerLockElement && !input.freeLook && !overlay) lock(); });

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
