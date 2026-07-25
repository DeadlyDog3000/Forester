"use strict";

// ===== Forester alpha — city-builder prototype =====

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const msgEl = document.getElementById("msg");
const craftBtn = document.getElementById("craftDoor");
const buildDrop = document.getElementById("buildDrop");
const buildToggle = document.getElementById("buildToggle");

// --- tuning ---
const CHAR_SIZE = 64;      // characters & trees drawn at 2x
const BLDG_SIZE = 96;      // buildings drawn at 3x
const WALK_SPEED = 110;    // px/s
const CHOP_TIME = 3;       // seconds per tree
const CRAFT_TIME = 4;      // seconds per door
const REPAIR_TIME = 6;     // seconds to repair cabin
const LOGS_PER_TREE = 5;
const DOOR_LOG_COST = 5;
const REPAIR_LOG_COST = 20;
const REPAIR_DOOR_COST = 1;

// --- assets ---
const IMAGES = {
  tree: "assets/sprites/env/spruce_tree_32.png",
  burned: "assets/sprites/buildings/burned_house_32.png",
  cabin: "assets/sprites/buildings/log_cabin_32.png",
};
for (const who of ["sister", "brother"])
  for (let i = 0; i < 4; i++)
    IMAGES[`${who}${i}`] = `assets/sprites/characters/${who}_walk_${i}.png`;

const img = {};
let loaded = 0;
const names = Object.keys(IMAGES);
for (const key of names) {
  img[key] = new Image();
  img[key].onload = () => { if (++loaded === names.length) start(); };
  img[key].src = IMAGES[key];
}

// --- state ---
const res = { logs: 0, doors: 0 };

const trees = [];
const buildings = [];   // {type:'burned'|'cabin', x, y, progress:-1}
const civs = [
  { name: "Brother", who: "brother", x: 400, y: 330, tx: 400, ty: 330,
    state: "idle", anim: 0, facing: 1, task: null },
  { name: "Sister", who: "sister", x: 520, y: 350, tx: 520, ty: 350,
    state: "idle", anim: 0, facing: -1, task: null },
];

let selected = null;
let buildMode = null;
let mouse = { x: 0, y: 0 };
let toastTimer = 0;

// the family's destroyed cabin, and a forest around the clearing
buildings.push({ type: "burned", x: 460, y: 220, progress: -1 });
(function plantForest() {
  let seed = 96;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let placed = 0;
  while (placed < 16) {
    const x = 50 + rnd() * 860, y = 90 + rnd() * 420;
    const nearClearing = Math.hypot(x - 480, y - 280) < 170;
    const nearOther = trees.some(t => Math.hypot(t.x - x, t.y - y) < 55);
    if (!nearClearing && !nearOther) { trees.push({ x, y, alive: true, progress: -1 }); placed++; }
  }
})();

function toast(text) { msgEl.textContent = text; toastTimer = 4; }

// --- input ---
function trackMouse(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
}
canvas.addEventListener("mousemove", trackMouse);

canvas.addEventListener("contextmenu", e => { e.preventDefault(); buildMode = null; syncUI(); });
window.addEventListener("keydown", e => { if (e.key === "Escape") { buildMode = null; syncUI(); } });

canvas.addEventListener("click", e => {
  trackMouse(e);
  if (buildMode) {
    buildings.push({ type: buildMode, x: mouse.x, y: mouse.y, progress: -1 });
    toast("Log cabin placed.");
    buildMode = null;
    syncUI();
    return;
  }

  // select a civilian
  for (const c of civs) {
    if (Math.abs(mouse.x - c.x) < 24 && mouse.y < c.y && mouse.y > c.y - CHAR_SIZE) {
      selected = c;
      toast(`${c.name} selected.`);
      syncUI();
      return;
    }
  }

  if (!selected) return;

  // order: chop a tree
  for (const t of trees) {
    if (t.alive && Math.abs(mouse.x - t.x) < 26 && mouse.y < t.y && mouse.y > t.y - CHAR_SIZE) {
      order(selected, { kind: "chop", target: t, x: t.x + 26, y: t.y + 4 });
      toast(`${selected.name} heads out to fell a spruce.`);
      return;
    }
  }

  // order: repair a burned cabin
  for (const b of buildings) {
    if (b.type === "burned" &&
        Math.abs(mouse.x - b.x) < BLDG_SIZE / 2 && mouse.y < b.y && mouse.y > b.y - BLDG_SIZE) {
      if (res.logs < REPAIR_LOG_COST || res.doors < REPAIR_DOOR_COST) {
        toast(`Repair needs ${REPAIR_LOG_COST} logs + ${REPAIR_DOOR_COST} door. ` +
              `You have ${res.logs} logs, ${res.doors} door(s).`);
        return;
      }
      order(selected, { kind: "repair", target: b, x: b.x, y: b.y + 12 });
      toast(`${selected.name} goes to rebuild the family cabin.`);
      return;
    }
  }

  // plain walk
  order(selected, { kind: "walk", x: mouse.x, y: mouse.y });
});

craftBtn.addEventListener("click", () => {
  if (!selected) { toast("Select a civilian first."); return; }
  if (res.logs < DOOR_LOG_COST) { toast(`A door takes ${DOOR_LOG_COST} logs. You have ${res.logs}.`); return; }
  res.logs -= DOOR_LOG_COST;
  order(selected, { kind: "craft", x: selected.x, y: selected.y });
  toast(`${selected.name} starts hewing a door.`);
});

buildToggle.addEventListener("click", () => buildDrop.classList.toggle("open"));
document.querySelectorAll("#buildMenu .menu-item").forEach(item => {
  item.addEventListener("click", () => {
    buildMode = item.dataset.build;
    buildDrop.classList.remove("open");
    toast("Click the map to place. Right-click or Esc to cancel.");
    syncUI();
  });
});
document.addEventListener("click", e => {
  if (!buildDrop.contains(e.target)) buildDrop.classList.remove("open");
});

function syncUI() {
  buildToggle.classList.toggle("active", !!buildMode);
}

function order(c, task) {
  if (c.task && c.task.kind === "chop" && c.task.target) c.task.target.progress = -1;
  if (c.task && c.task.kind === "repair" && c.task.target) c.task.target.progress = -1;
  c.task = task;
  c.tx = task.x;
  c.ty = task.y;
  c.state = "walking";
  c.workT = 0;
}

// --- simulation ---
function update(dt) {
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) msgEl.textContent = "";

  for (const c of civs) {
    if (c.state === "walking") {
      const dx = c.tx - c.x, dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        c.x = c.tx; c.y = c.ty;
        arrive(c);
      } else {
        c.x += (dx / d) * WALK_SPEED * dt;
        c.y += (dy / d) * WALK_SPEED * dt;
        c.facing = dx < 0 ? -1 : 1;
        c.anim += dt * 8;
      }
    } else if (c.state === "chopping") {
      const t = c.task.target;
      if (!t.alive) { c.state = "idle"; c.task = null; continue; }
      c.workT += dt;
      t.progress = c.workT / CHOP_TIME;
      c.anim += dt * 10;
      if (c.workT >= CHOP_TIME) {
        t.alive = false; t.progress = -1;
        res.logs += LOGS_PER_TREE;
        toast(`${c.name} felled a spruce. +${LOGS_PER_TREE} logs (${res.logs} total).`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "crafting") {
      c.workT += dt;
      c.anim += dt * 6;
      if (c.workT >= CRAFT_TIME) {
        res.doors += 1;
        toast(`${c.name} finished a rough plank door. Doors: ${res.doors}.`);
        c.state = "idle"; c.task = null;
      }
    } else if (c.state === "repairing") {
      const b = c.task.target;
      c.workT += dt;
      b.progress = c.workT / REPAIR_TIME;
      c.anim += dt * 10;
      if (c.workT >= REPAIR_TIME) {
        b.type = "cabin"; b.progress = -1;
        toast(`The family cabin stands again. ${c.name} rebuilt it.`);
        c.state = "idle"; c.task = null;
      }
    } else {
      c.anim = 1; // idle pose: legs passing
    }
  }
}

function arrive(c) {
  const task = c.task;
  if (!task || task.kind === "walk") { c.state = "idle"; c.task = null; return; }
  if (task.kind === "chop") {
    if (!task.target.alive) { c.state = "idle"; c.task = null; return; }
    c.state = "chopping"; c.workT = 0; c.facing = task.target.x < c.x ? -1 : 1;
  } else if (task.kind === "craft") {
    c.state = "crafting"; c.workT = 0;
  } else if (task.kind === "repair") {
    if (res.logs < REPAIR_LOG_COST || res.doors < REPAIR_DOOR_COST) {
      toast("Not enough materials any more — repair cancelled.");
      c.state = "idle"; c.task = null; return;
    }
    res.logs -= REPAIR_LOG_COST;
    res.doors -= REPAIR_DOOR_COST;
    c.state = "repairing"; c.workT = 0;
  }
}

// --- rendering ---
function drawSprite(image, cx, feetY, size, flip) {
  ctx.save();
  ctx.translate(cx, feetY);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, -size / 2, -size, size, size);
  ctx.restore();
}

function bar(cx, topY, frac, color) {
  const w = 44, h = 6;
  ctx.fillStyle = "#0a0f0c";
  ctx.fillRect(cx - w / 2 - 1, topY - 1, w + 2, h + 2);
  ctx.fillStyle = "#1c2a21";
  ctx.fillRect(cx - w / 2, topY, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, topY, w * Math.min(1, frac), h);
}

function render() {
  // mossy ground with sparse dark tufts
  ctx.fillStyle = "#17251c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#14201a";
  for (let i = 0; i < 90; i++) {
    const x = (i * 127 + 31) % 960, y = (i * 83 + 57) % 540;
    ctx.fillRect(x, y, 6, 3);
  }

  const drawables = [];
  for (const t of trees) if (t.alive) drawables.push({ y: t.y, draw: () => {
    drawSprite(img.tree, t.x, t.y, CHAR_SIZE, false);
    if (t.progress >= 0) bar(t.x, t.y - CHAR_SIZE - 12, t.progress, "#c9a86a");
  }});
  for (const t of trees) if (!t.alive) drawables.push({ y: t.y, draw: () => {
    ctx.fillStyle = "#3d2b1c";
    ctx.fillRect(t.x - 5, t.y - 8, 10, 8);   // stump
    ctx.fillStyle = "#2a1d13";
    ctx.fillRect(t.x - 5, t.y - 3, 10, 3);
  }});
  for (const b of buildings) drawables.push({ y: b.y, draw: () => {
    drawSprite(img[b.type], b.x, b.y, BLDG_SIZE, false);
    if (b.progress >= 0) bar(b.x, b.y - BLDG_SIZE - 12, b.progress, "#7da083");
  }});
  for (const c of civs) drawables.push({ y: c.y, draw: () => {
    if (c === selected) {
      ctx.strokeStyle = "#c9a86a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 2, 18, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const frame = img[c.who + (Math.floor(c.anim) % 4)];
    drawSprite(frame, c.x, c.y, CHAR_SIZE, c.facing < 0);
    ctx.fillStyle = c === selected ? "#c9a86a" : "#7da083";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(c.name, c.x, c.y - CHAR_SIZE - 4);
    if (c.state === "crafting") bar(c.x, c.y - CHAR_SIZE - 16, c.workT / CRAFT_TIME, "#c9a86a");
  }});

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // ghost preview in build mode
  if (buildMode) {
    ctx.globalAlpha = 0.5;
    drawSprite(img[buildMode], mouse.x, mouse.y, BLDG_SIZE, false);
    ctx.globalAlpha = 1;
  }

  // HUD
  ctx.fillStyle = "rgba(10, 15, 12, 0.85)";
  ctx.fillRect(8, 8, 220, 44);
  ctx.strokeStyle = "#3a5243";
  ctx.strokeRect(8, 8, 220, 44);
  ctx.fillStyle = "#cfd8d3";
  ctx.font = "13px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`LOGS: ${res.logs}`, 18, 26);
  ctx.fillText(`DOORS: ${res.doors}`, 18, 44);
  ctx.fillStyle = "#7da083";
  ctx.textAlign = "right";
  ctx.fillText(selected ? `> ${selected.name}` : "no one selected", 220, 26);
  ctx.fillText("coin needed: none", 220, 44);
}

// --- loop ---
let last = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
function start() { requestAnimationFrame(frame); }
