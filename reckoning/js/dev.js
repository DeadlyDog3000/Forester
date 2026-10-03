// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE DEVELOPER'S PANEL: the comma key, and only on the maker's own machine. The app turns it on (window.__dev) when it finds
// a file named "developer" in its own data folder, which only the maker's Mac has; anywhere else, and in a browser,
// it isn't there at all. Stores, time, the fields, raids, your body and your tools, all to hand for testing.
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { TOP_TIER } from "./body.js";

let panel = null, open = false;
const town = () => G.town;
const S = () => G.town && G.town.S;
const refresh = () => { const t = town(); if (!t) return; t.showStore && t.showStore(); t.persist && t.persist(); };
const add = (k, n) => () => { const s = S(); if (!s) return say("No settlement here."); s[k] = Math.max(0, +((s[k] || 0) + n).toFixed(2)); refresh(); say(`${k}: ${+(+s[k]).toFixed(1)}`); };
function say(t) { const o = panel && panel.querySelector(".dv-out"); if (o) o.textContent = t; }

const SECTIONS = [
  ["Settlement stores", [
    ["+10 rye seed", add("seed", 10)], ["+1 rye seed", add("seed", 1)],
    ["+100 rye", add("rye", 100)], ["+30 bread", add("bread", 30)], ["+20 meat", add("meat", 20)],
    ["+50 logs", () => { const s = S(); if (!s) return; s.store = Math.min(town().storeCap || 9999, (s.store || 0) + 50); refresh(); say(`logs: ${s.store}`); }],
    ["+50 stone", add("stone", 50)], ["+30 planks", add("planks", 30)], ["+30 bricks", add("bricks", 30)], ["+20 iron", add("iron", 20)],
    ["+100 DM treasury", add("coin", 100)],
    ["Nobody hungry or cold", () => { const s = S(); if (!s) return; s.hungry = 0; s.cold = 0; refresh(); say("Hunger and cold reset."); }],
  ]],
  ["You", [
    ["Heal fully", () => { G.health = 1; G.stamina = 1; G.downed = false; if (G.body) { G.body.hunger = 1; G.body.plague = 0; G.body.dirty = true; } say("Healed, fed, rested."); }],
    ["God mode", () => { G.devGod = !G.devGod; say(`God mode ${G.devGod ? "on" : "off"}.`); }],
    ["+50 DM purse", () => { if (!G.body) return; G.body.purse = (G.body.purse || 0) + 50; G.body.dirty = true; say(`Purse: ${G.body.purse}`); }],
    ["Best tools, new", () => { const b = G.body; if (!b) return; for (const k of ["pick", "axe", "spade", "hammer", "sword"]) b.tools[k] = TOP_TIER; b.wear = {}; b.dirty = true; say("Iron everything, unworn."); }],
    ["Mend tools", () => { const b = G.body; if (!b) return; b.wear = {}; b.dirty = true; say("Tools as new."); }],
    ["+20 arrows", () => { const p = G.player; p.hasBow = true; p.arrows = (p.arrows || 0) + 20; say(`Arrows: ${p.arrows}`); }],
  ]],
  ["Time and the land", [
    ["Next day", () => { const t = town(); if (!t) return; t.update(t.dayLen - (t.t % t.dayLen) + 0.01, t.dayLen); say(`Day ${t.day + 1}.`); }],
    ["Morning", () => { const t = town(); if (!t) return; t.t = Math.floor(t.t / t.dayLen) * t.dayLen + t.dayLen * 0.08; say("Morning."); }],
    ["Dusk", () => { const t = town(); if (!t) return; t.t = Math.floor(t.t / t.dayLen) * t.dayLen + t.dayLen * 0.62; say("Dusk."); }],
    ["Speed ×1", () => { G.devSpeed = 1; say("Normal speed."); }], ["Speed ×3", () => { G.devSpeed = 3; say("Three times as fast."); }],
    ["Ripen every field", () => { const t = town(); if (!t) return; for (const b of t.S.buildings) if (b.type === "field") { b.dug = 3; b.done = true; b.sown = true; b.growth = 3; t.show(b); } refresh(); say("Every field ripe."); }],
    ["Finish every building", () => {
      const t = town(); if (!t) return; let n = 0;
      for (const b of t.S.buildings) if (!b.done && b.type !== "field") { b.logs = 999; b.got = {}; b.door = true; b.done = true; t.show(b); n++; }
      refresh(); say(`${n} finished.`);
    }],
    ["All research", async () => { const t = town(); if (!t) return; const { TECH } = await import("./gov.js"); for (const id of Object.keys(TECH)) if (!t.S.tech.done.includes(id)) t.S.tech.done.push(id); t.S.tech.research = null; refresh(); say("Everything researched."); }],
  ]],
  ["Trouble", [
    ["Raid now", () => { const t = town(); if (!t || !t.raids) return say("No raids here."); if (t.raids.active) return say("Already raiding."); t.raids.start(); say("Raiders on the road."); }],
    ["End the raid", () => { const r = town() && town().raids; if (!r) return; for (const x of r.band.slice()) if (x.alive) x.down(); say("All down."); }],
  ]],
  ["Go to", [
    ["The clearing", async () => { const W = await import("./woods.js"); G.player.place(W.CLEARING.x, W.CLEARING.z + 4); say("At the clearing."); }],
    ["The deer ride", async () => { const W = await import("./woods.js"); G.player.place(W.HUNT.x, W.HUNT.z); say("At the deer ride."); }],
    ["The cave mouth", () => { const c = G.world && G.world.cave; if (!c || !c.mouthAt) return say("No cave here."); G.player.place(c.mouthAt.x + Math.sin(c.mouthAt.ry) * 2, c.mouthAt.z + Math.cos(c.mouthAt.ry) * 2); say("At the cave."); }],
    ["The charcoal burner", () => { const b = G.world && G.world.burner; if (!b) return say("Not here."); G.player.place(b.camp.x + 3, b.camp.z + 3); say("At the burner's."); }],
  ]],
];

function build() {
  const css = document.createElement("style");
  css.textContent = `#devPanel { position: fixed; top: 60px; right: 18px; width: 340px; max-height: calc(100vh - 90px); overflow: auto; z-index: 60; padding: 12px 14px;
      background: rgba(10, 16, 12, 0.94); border: 1px solid rgba(200, 150, 46, 0.5); border-radius: 6px; font: 12px/1.3 var(--sans, sans-serif); color: #e8dcc0; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
    #devPanel h3 { margin: 0 0 6px; font: 600 14px var(--serif, Georgia, serif); color: #c8962e; letter-spacing: 0.06em; }
    #devPanel h4 { margin: 10px 0 5px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #9ab890; }
    #devPanel .dv-row { display: flex; flex-wrap: wrap; gap: 4px; }
    #devPanel button { font: inherit; color: #f1e6c8; background: rgba(140, 192, 132, 0.12); border: 1px solid rgba(140, 192, 132, 0.3); border-radius: 3px; padding: 4px 7px; cursor: pointer; }
    #devPanel button:hover { background: rgba(200, 150, 46, 0.25); border-color: #c8962e; }
    #devPanel .dv-out { margin-top: 10px; min-height: 16px; color: #c8962e; }
    #devPanel .dv-stat { margin-top: 4px; color: #b8ad92; white-space: pre-wrap; }`;
  document.head.appendChild(css);
  panel = document.createElement("div"); panel.id = "devPanel"; panel.style.display = "none";
  panel.innerHTML = `<h3>DEVELOPER — ,</h3><div class="dv-stat"></div>` + SECTIONS.map(([h, items], i) => `<h4>${h}</h4><div class="dv-row">${items.map(([l], j) => `<button data-s="${i}" data-i="${j}">${l}</button>`).join("")}</div>`).join("") + `<div class="dv-out"></div>`;
  panel.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; try { SECTIONS[+b.dataset.s][1][+b.dataset.i][1](); } catch (err) { say("Error: " + err.message); } stat(); });
  panel.addEventListener("mousedown", e => e.stopPropagation());
  document.body.appendChild(panel);
}
function stat() {
  const el = panel && panel.querySelector(".dv-stat"); if (!el) return;
  const s = S(), t = town();
  el.textContent = s ? `Day ${t.day + 1} · ${t.season || ""} · rye ${Math.round(s.rye || 0)} · bread ${s.bread || 0} · meat ${s.meat || 0} · seed ${+(s.seed || 0).toFixed(1)}\nlogs ${s.store || 0} · DM ${G.dm ? G.dm(s.coin || 0) : s.coin} · food for ${t.foodDays ? t.foodDays().toFixed(1) : "?"} days · hungry ${s.hungry || 0}`
    : "No settlement in this chapter.";
}
function toggle() {
  if (!panel) build();
  open = !open; panel.style.display = open ? "block" : "none";
  if (open) { G.releaseMouse && G.releaseMouse(); stat(); } else if (G.mode === "play") G.lockMouse && G.lockMouse();
}
export function initDev() {
  if (!window.__dev) return;
  addEventListener("keydown", e => { if (e.code === "Comma" && !e.repeat && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { e.preventDefault(); toggle(); } });
  setInterval(() => { if (open) stat(); }, 1000);
  setTimeout(() => UI.hint && UI.hint("Developer panel: the , key.", 3), 1500);
}
// the app says so after the page has loaded: listen for it, as well as checking now
if (window.__dev) initDev(); else addEventListener("reckoning-dev", () => initDev(), { once: true });
