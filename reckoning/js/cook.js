// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE KITCHEN: a brick range in your house, a pot and a pan on it, a board and a knife beside. Every beast gives
// its own meat, with its own taste and its own temper in the pan; every dish wants taking off the heat at the
// right moment. Too soon and it is raw in the middle, too late and it is dry, or black. When it is plated the
// dish is judged — stars, and the reasons for them — and the pedlar decides what he'll pay for it.
import { THREE, mat } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";

/* global SFX */

// ---- the meats: one for every beast, each with a character ----
// taste: what it is worth on the plate (out of 5) · tender: how quickly it goes from right to dry (higher is less
// forgiving overdone) · tough: how badly it takes being underdone · fill: how far it goes · secs: in the pan
export const MEATS = {
  venison: { name: "Venison", from: "deer", taste: 4, tender: 3, tough: 2, fill: 0.3, secs: 10, price: 3, note: "Lean, dark and rich. The best meat in the forest — but lean meat dries out fast if you leave it on." },
  hare: { name: "Hare", from: "hare", taste: 3, tender: 4, tough: 1, fill: 0.18, secs: 7, price: 2, note: "Sweet and delicate, quick to cook and quicker to ruin. Little meat on it." },
  boar: { name: "Boar", from: "boar", taste: 4.5, tender: 1, tough: 4, fill: 0.36, secs: 13, price: 4, note: "Fat, strong-flavoured and filling. Forgiving if it's left on, dangerous if it's taken off too soon." },
};
export const isRawMeat = icon => icon === "meat" || !!MEATS[icon];
const statLine = m => `Taste ${"●".repeat(Math.round(m.taste))}${"○".repeat(5 - Math.round(m.taste))} · tenderness ${m.tender}/4 · fills ${Math.round(m.fill * 100)}%`;
export const meatNote = id => { const m = MEATS[id]; return m ? `${m.note} ${statLine(m)}. Raw — cook it first.` : ""; };

// ---- what can be made: in the pan (turn it once) or the pot (keep it stirred) ----
// need: from your pack (meats, blackberries, bread) and the settlement's stores (rye); lv: the Cooking it wants
export const RECIPES = [
  { id: "roast_venison", name: "Roast venison", vessel: "pan", need: { venison: 1 }, bonus: 0, lv: 1, price: 4, fill: 0.34, colour: 0x6a2a20, done: 0x6a3a22 },
  { id: "fried_hare", name: "Fried hare", vessel: "pan", need: { hare: 1 }, bonus: 0, lv: 1, price: 3, fill: 0.24, colour: 0xb05a4a, done: 0x9a6a3a },
  { id: "boar_chops", name: "Boar chops", vessel: "pan", need: { boar: 1 }, bonus: 0, lv: 1, price: 5, fill: 0.4, colour: 0xc07a6a, done: 0x8a5a32 },
  { id: "jugged_hare", name: "Jugged hare", vessel: "pot", need: { hare: 1, rye: 2 }, bonus: 0.5, lv: 3, price: 5, fill: 0.36, colour: 0x7a4a3a, done: 0x5a3020, note: "Hare stewed slow with rye to thicken it." },
  { id: "venison_stew", name: "Venison stew", vessel: "pot", need: { venison: 1, rye: 2 }, bonus: 0.5, lv: 6, price: 6, fill: 0.46, colour: 0x7a3a2a, done: 0x5e3a22, note: "A thick brown stew. It keeps a family going." },
  { id: "boar_blackberries", name: "Boar with blackberries", vessel: "pan", need: { boar: 1, blackberries: 3 }, bonus: 0.5, lv: 10, price: 8, fill: 0.46, colour: 0xc07a6a, done: 0x5a2238, note: "Seared boar with a sharp glaze of wild berries." },
  { id: "hunters_pottage", name: "Hunter's pottage", vessel: "pot", need: { venison: 1, hare: 1, bread: 1 }, bonus: 1, lv: 20, price: 11, fill: 0.62, colour: 0x7a4a32, done: 0x5a3a20, note: "Two meats in one pot, thickened with bread: a feast-day dish." },
  { id: "boar_stew", name: "Wild boar stew", vessel: "pot", need: { boar: 1, rye: 2, blackberries: 2 }, bonus: 1, lv: 30, price: 12, fill: 0.62, colour: 0x8a4a3a, done: 0x4a2a1a, note: "Dark, rich and slow. The dish a burgher's cook would be proud of." },
];
export const RECIPE = Object.fromEntries(RECIPES.map(r => [r.id, r]));
const INGR_NAME = { venison: "venison", hare: "hare", boar: "boar", rye: "rye (stores)", blackberries: "blackberries", bread: "bread" };

// what you have of an ingredient: meats and berries from your pack, rye and bread from the stores too
function have(k) {
  const pk = (G.pack || []).filter(i => i.icon === k).reduce((s, i) => s + (i.n || 1), 0);
  const S = G.town && G.town.S;
  return pk + (S && (k === "rye" || k === "bread") ? (S[k] || 0) : 0);
}
function take(k, n) {
  for (const it of (G.pack || []).filter(i => i.icon === k)) { const t = Math.min(n, it.n || 1); it.n = (it.n || 1) - t; n -= t; if (it.n <= 0) G.pack.splice(G.pack.indexOf(it), 1); if (!n) return; }
  const S = G.town && G.town.S; if (S && n > 0) { S[k] = Math.max(0, (S[k] || 0) - n); G.town.persist(); G.town.showStore && G.town.showStore(); }
}
export const canCook = r => Object.entries(r.need).every(([k, n]) => have(k) >= n);
const cookLv = () => (G.body && G.body.skills.cooking && G.body.skills.cooking.lv) || 1;
const sk01 = () => (cookLv() - 1) / 99;

// ---- stars: half-stars, out of five ----
export const starText = s => "★".repeat(Math.floor(s)) + (s % 1 ? "½" : "") + "☆".repeat(5 - Math.ceil(s));
const half = x => Math.round(x * 2) / 2;

// judging a finished dish: the meat, how done it is, how it was handled, and the hand that made it
export function judge(r, d, w, tech, lv) {
  const meats = Object.keys(r.need).filter(k => MEATS[k]).map(k => MEATS[k]);
  const why = [];
  let base = meats.reduce((s, m) => s + m.taste, 0) / meats.length;
  why.push([base, meats.length > 1 ? `${meats.map(m => m.name.toLowerCase()).join(" and ")}: good meat` : `${meats[0].name}: ${base >= 4.5 ? "a fine, rich meat" : base >= 4 ? "a fine meat" : "a plain meat"}`]);
  if (r.bonus) why.push([r.bonus, `${r.name}: a dish worth the trouble`]);
  const tender = Math.max(...meats.map(m => m.tender)), tough = Math.max(...meats.map(m => m.tough));
  let raw = false, sum = r.bonus;
  const under = 1 - w, over = 1 + w;
  if (d >= under && d <= over) why.push([0, "Cooked just right"]);
  else if (d < under - 0.28) { sum -= 3; raw = true; why.push([-3, "Raw in the middle — and raw meat brings the plague"]); }
  else if (d < under) { const k = (under - d) / 0.28, p = -half((1 + k) * (tough >= 3 ? 1.25 : 1)); sum += p; why.push([p, k < 0.5 ? "A little underdone" : tough >= 3 ? "Underdone — boar wants cooking through" : "Underdone: pink and chewy"]); }
  else if (d > over + 0.3) { sum -= 3; why.push([-3, "Burnt black"]); }
  else { const k = (d - over) / 0.3, p = -half((1 + k) * (tender >= 3 ? 1.25 : 1)); sum += p; why.push([p, k < 0.5 ? "A little overcooked" : tender >= 3 ? "Badly overcooked: lean meat gone dry and stringy" : "Badly overcooked: dry and tough"]); }
  for (const [n, t] of tech) { sum += n; why.push([n, t]); }
  const sb = lv >= 70 ? 1 : lv >= 30 ? 0.5 : 0;
  if (sb) { sum += sb; why.push([sb, lv >= 70 ? "A master cook's hand" : "A practised hand"]); }
  const stars = Math.max(0.5, Math.min(5, half(base + sum)));
  return { stars, why, raw };
}

// a dish, as it goes in your pack
export function makeDish(r, res) {
  const fill = Math.round(r.fill * (0.5 + res.stars * 0.12) * 100) / 100;
  return { icon: "dish", dish: r.id, name: `${r.name} ${starText(res.stars)}`, base: r.name, stars: res.stars, raw: res.raw, fill, uid: Math.floor(Math.random() * 1e9), n: 1,
    note: `${res.why.map(([n, t]) => `${t}${n ? ` (${n > 0 ? "+" : "−"}${Math.abs(n)})` : ""}`).join(" · ")}. Eat it (its number), sell it to Tobias the pedlar, or put it in the settlement's stores to feed your people.` };
}

// ---- what the pedlar makes of it ----
const TOBIAS = [
  [4.5, ["Bei Gott. I'll sell that in Lübeck to a burgher's table.", "Now that is cooking. I'll pay what it's worth."]],
  [3.5, ["Good. Honest food, well done.", "That'll fetch a fair price on the road."]],
  [2.5, ["It's food. I've eaten worse — this week.", "Passable. I'll give you passable money for it."]],
  [1.5, ["Hm. Somebody wasn't watching the pot.", "I can sell it to someone hungry enough."]],
  [0, ["I'll take it for the dogs.", "Is that... was that meat once?"]],
];
export function pedlarValue(it) {
  const r = RECIPE[it.dish] || { price: 3 };
  const mood = 0.88 + ((it.uid || 7) % 1000) / 1000 * 0.24;                 // (what he's in the humour to pay, that day)
  return Math.max(0.5, Math.round(r.price * (0.2 + Math.pow(it.stars / 5, 1.4) * 1.3) * mood * 2) / 2);
}
export function pedlarSays(it) { const row = TOBIAS.find(([s]) => it.stars >= s); return row[1][(it.uid || 0) % row[1].length]; }
// the offers for every dish you carry or have in your chest
export function dishOffers() {
  const out = [], b = G.body;
  const sell = (it, from) => {
    const pay = pedlarValue(it);
    out.push({ icon: "dish", label: `Sell your ${it.base || it.name} ${starText(it.stars)}${from === "chest" ? " (in your chest)" : ""}`, note: `He tastes it: "${pedlarSays(it)}" ${it.note.split(". Eat it")[0]}.`, get: `+${G.dm(pay)} DM`,
      can: () => (from === "chest" ? (G.chest || []).includes(it) : G.pack.includes(it)),
      do: () => {
        if (from === "chest") { const i = G.chest.indexOf(it); if (i < 0) return; G.chest[i] = null; G.saveChest && G.saveChest(); }
        else { it.n = (it.n || 1) - 1; if (it.n <= 0) G.pack.splice(G.pack.indexOf(it), 1); }
        b.purse = Math.round(((b.purse || 0) + pay) * 10) / 10; b.dirty = true;
        UI.bark("Tobias", pedlarSays(it), 3);
      } });
  };
  for (const it of (G.pack || []).filter(i => i.icon === "dish")) sell(it, "pack");
  for (const it of (G.chest || []).filter(i => i && i.icon === "dish")) sell(it, "chest");
  return out;
}

// ---- the kitchen at work ----
let session = null;
// the soft round puff that steam and smoke are made of
let puffTex = null;
function puff() {
  if (puffTex) return puffTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.5, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return puffTex = new THREE.CanvasTexture(c);
}
// a few puffs that rise, swell and fade: steam off the pot, smoke when it catches
function makePuffs(parent, n = 14) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff(), transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; parent.add(s); list.push({ s, t: 1, life: 1 });
  }
  return {
    list,
    emit(x, y, z, colour, size = 0.14, life = 1.6) {
      const p = list.find(q => q.t >= q.life) || list[0];
      p.t = 0; p.life = life * (0.8 + Math.random() * 0.4); p.size = size; p.vx = (Math.random() - 0.5) * 0.05; p.vz = (Math.random() - 0.5) * 0.05;
      p.s.position.set(x + (Math.random() - 0.5) * 0.1, y, z + (Math.random() - 0.5) * 0.1); p.s.material.color.setHex(colour); p.s.visible = true;
    },
    update(dt) {
      for (const p of list) {
        if (p.t >= p.life) { p.s.visible = false; continue; }
        p.t += dt; const k = p.t / p.life;
        p.s.position.y += dt * (0.22 + k * 0.1); p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt;
        p.s.scale.setScalar(p.size * (0.6 + k * 2.2)); p.s.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.55;
      }
    },
    clear() { for (const p of list) { p.t = p.life = 1; p.s.visible = false; } },
  };
}

// The kitchen's moving parts, made once in the house: the pot (lid, ladle, the stew in it), the pan (and what's in
// it), a plate on the board. K.at(lx, y, lz) is a point in the house; K.yaw the way you face the range.
export function kitchenRig(w, K) {
  const g = new THREE.Group(); w.root.add(g);
  const iron = mat(0x2a2a2c, { metalness: 0.5, roughness: 0.55, surface: "none" }), wood = mat(0x8a6440, { surface: "wood" });
  const place = (o, lx, y, lz) => { o.position.copy(K.at(lx, y, lz)); o.rotation.y = K.ry; g.add(o); return o; };
  // the pot: an iron belly, a lid, a ladle resting in it
  const pot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.2, 14, 1, true), iron); body.position.y = 0.1; pot.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), iron); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.005; pot.add(bottom);
  const stew = new THREE.Mesh(new THREE.CircleGeometry(0.155, 14), new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.35 })); stew.rotation.x = -Math.PI / 2; stew.position.y = 0.15; stew.visible = false; pot.add(stew);
  const chunks = new THREE.Group(); pot.add(chunks);
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.025, 0), new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.6 })); c.position.set(Math.cos(i * 1.1) * 0.08, 0.155, Math.sin(i * 1.1) * 0.08); c.visible = false; chunks.add(c); }
  const lid = new THREE.Group(); const lidM = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.015, 14), iron); lid.add(lidM);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), iron); knob.position.y = 0.02; lid.add(knob); lid.position.y = 0.21; pot.add(lid);
  const ladle = new THREE.Group(); const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 5), wood); stick.position.y = 0.19; ladle.add(stick);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood); ladle.add(bowl);
  ladle.position.set(0.05, 0.12, 0); ladle.rotation.z = 0.35; pot.add(ladle);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 8), iron); ear.position.set(0, 0.18, s * 0.175); ear.rotation.y = Math.PI / 2; pot.add(ear); }
  place(pot, ...K.pot);
  // the pan: a shallow iron skillet with its handle out toward you
  const pan = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.045, 16, 1, true), iron); pb.position.y = 0.022; pan.add(pb);
  const pf = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), iron); pf.rotation.x = -Math.PI / 2; pf.position.y = 0.004; pan.add(pf);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.035), iron); handle.position.set(0.3, 0.04, 0); handle.rotation.z = 0.12; pan.add(handle);
  const food = new THREE.Group(); pan.add(food);
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.07), new THREE.MeshStandardMaterial({ color: 0xb05a4a, roughness: 0.55 })); m.position.set(-0.05 + i * 0.05, 0.022, (i - 1) * 0.06); m.rotation.y = i * 0.7; m.visible = false; food.add(m); }
  const glaze = []; for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), mat(0x2a1430, { surface: "none", roughness: 0.3 })); b.position.set(Math.cos(i) * 0.07, 0.045, Math.sin(i * 1.7) * 0.06); b.visible = false; food.add(b); glaze.push(b); }
  place(pan, ...K.pan);
  // a plate on the board, for when it is done
  const plate = new THREE.Group();
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.02, 16), mat(0xe8e0cc, { surface: "none", roughness: 0.4 })); plate.add(pm);
  const served = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.6 })); served.scale.y = 0.45; served.position.y = 0.01; plate.add(served);
  plate.visible = false; place(plate, ...K.plate);
  // the fire under the range: embers that glow, and glow harder while something cooks
  const embers = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff6a1a, emissiveIntensity: 0.6, roughness: 1 }));
  place(embers, ...K.embers);
  const puffs = makePuffs(g, 18);
  // the glow off the fire and the iron, over the range: it comes up when you cook
  const glow = new THREE.PointLight(0xffa860, 0, 3.2, 1.6); glow.position.copy(K.at(-1.55, 1.3, -1.45)); g.add(glow);
  return { g, pot, lid, ladle, stew, chunks, pan, food, glaze, plate, served, embers, puffs, glow };
}

// the HUD while you cook: the dish, the gauge of how done it is (as far as your eye can judge), the keys
function hud(on) {
  let el = document.getElementById("cookHud");
  if (!on) { if (el) el.remove(); return null; }
  if (!el) { el = document.createElement("div"); el.id = "cookHud"; document.body.appendChild(el); }
  return el;
}
function drawHud(s) {
  const el = hud(true), r = s.r, w = s.w, max = 1.9, pc = v => `${Math.max(0, Math.min(100, v / max * 100))}%`;
  const zones = [[0, 1 - w - 0.28, "raw", "Raw"], [1 - w - 0.28, 1 - w, "under", "Underdone"], [1 - w, 1 + w, "good", "Just right"], [1 + w, 1 + w + 0.3, "over", "Overdone"], [1 + w + 0.3, max, "burnt", "Burnt"]];
  const seen = Math.max(0, s.d + s.bias);
  const extra = r.vessel === "pot"
    ? `<div class="ck-sub">Stir it <kbd>F</kbd> before it catches <span class="ck-mini"><i style="width:${Math.round(s.stick * 100)}%" class="${s.stick > 0.75 ? "hot" : ""}"></i></span></div>`
    : `<div class="ck-sub">${s.flipped ? "Turned." : "Turn it <kbd>F</kbd> once, when the underside is browned — about halfway"}</div>`;
  el.innerHTML = `<div class="ck-title">${r.name}${s.phase === "prep" ? " — getting it ready" : ""}</div>
    <div class="ck-gauge">${zones.map(([a, b, c, t]) => `<span class="z ${c}" style="left:${pc(a)};width:calc(${pc(b)} - ${pc(a)})">${t}</span>`).join("")}<b class="ck-needle" style="left:${pc(seen)}"></b></div>
    ${s.phase === "cook" ? extra : `<div class="ck-sub">Cutting and seasoning…</div>`}
    <div class="ck-keys"><kbd>Space</kbd> take it off the heat${cookLv() < 30 ? ` <span class="dim">· your eye for it sharpens with the Cooking skill (${cookLv()})</span>` : ""}</div>`;
}
// the card that comes up when the dish is plated
function showCard(dish, res) {
  const el = document.createElement("div"); el.className = "dishcard";
  el.innerHTML = `<div class="dc-name">${dish.base}</div><div class="dc-stars">${starText(res.stars)}</div>
    <ul>${res.why.map(([n, t]) => `<li class="${n > 0 ? "up" : n < 0 ? "down" : ""}"><span>${t}</span><b>${n ? `${n > 0 ? "+" : "−"}${Math.abs(n)}` : n === 0 && t === "Cooked just right" ? "✓" : ""}</b></li>`).join("")}</ul>
    <div class="dc-foot">In your pack. Tobias the pedlar will decide what it's worth.</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("on"));
  setTimeout(() => { el.classList.remove("on"); setTimeout(() => el.remove(), 600); }, 7500);
}

// choose a dish: the recipe book, by what you have and what you know
export function openKitchen(town) {
  if (session) return;
  G.guide && G.guide("kitchen");
  const lv = cookLv();
  const rows = RECIPES.map(r => ({
    icon: "dish", label: `${r.name}${r.lv > lv ? ` — Cooking ${r.lv}` : ""}`,
    note: `${r.vessel === "pot" ? "In the pot: keep it stirred." : "In the pan: turn it once."} Needs ${Object.entries(r.need).map(([k, n]) => `${n} ${INGR_NAME[k]} (${have(k)})`).join(", ")}.${r.note ? " " + r.note : ""}`,
    get: r.bonus ? `+${r.bonus}★` : "", can: () => r.lv <= lv && canCook(r), do: () => { G.closeTrade && G.closeTrade(); setTimeout(() => start(town, r), 60); },
  }));
  G.openTrade && G.openTrade("The kitchen", () => `Cooking ${lv} · meat: venison ${have("venison")}, hare ${have("hare")}, boar ${have("boar")}`, rows, null);
}

function start(town, r) {
  const w = town.w, K = w.kitchen; if (!K || session) return;
  if (!K.rig) K.rig = kitchenRig(w, K);
  for (const [k, n] of Object.entries(r.need)) take(k, n);
  const pl = G.player, rig = K.rig;
  const sk = sk01();
  const s = session = {
    r, rig, K, d: 0, phase: "prep", t: 0, stick: 0, scorch: 0, flipped: null, flips: 0, done: false,
    rate: 1 / (Math.max(...Object.keys(r.need).filter(k => MEATS[k]).map(k => MEATS[k].secs)) * (r.vessel === "pot" ? 1.3 : 1)) * (0.9 + Math.random() * 0.2),
    w: 0.07 + 0.11 * sk, bias: (Math.random() - 0.5) * 0.26 * (1 - sk), toss: 0, stir: 0,
  };
  // to the range, facing it, hands free
  G.lockMove = true;
  const [sx, sz] = K.stand; pl.place(sx, sz, K.yaw); pl.pitch = -0.55;
  if (pl.axe) { pl.holsterAxe && pl.holsterAxe(true); }
  const isPot = r.vessel === "pot";
  rig.plate.visible = false;
  rig.stew.visible = false; rig.chunks.children.forEach(c => (c.visible = false)); rig.food.children.forEach(c => (c.visible = false));
  rig.lid.position.y = 0.21; rig.lid.rotation.z = 0;
  // cutting it up first, on the board
  G.working = { kind: "craft", until: G.time + 2.4, quiet: true };
  let knock = 0;
  const keys = e => {
    if (!session || session !== s) return;
    if (e.code === "KeyF" && s.phase === "cook") { e.preventDefault(); e.stopImmediatePropagation(); act(s); }
    else if (e.code === "Space" && s.phase === "cook") { e.preventDefault(); e.stopImmediatePropagation(); finish(town, s); }
    else if (e.code === "KeyF" || e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  s.keys = keys; addEventListener("keydown", keys, true);
  s.tick = dt => {
    if (session !== s) return;
    // (the world went away under it — a chapter loaded, the menu: give up quietly, and hand the player back)
    if (G.world !== town.w || G.mode === "title") { s.done = true; AUDIO.sizzle && AUDIO.sizzle(false); AUDIO.bubble && AUDIO.bubble(false); removeEventListener("keydown", s.keys, true); const i = G.onFrame.indexOf(s.tick); if (i >= 0) G.onFrame.splice(i, 1); hud(false); G.working = null; G.lockMove = false; session = null; return; }
    s.t += dt;
    const P = rig.puffs; P.update(dt);
    rig.embers.material.emissiveIntensity = 1.1 + Math.sin(G.time * 9) * 0.15 + Math.sin(G.time * 23) * 0.1;
    rig.glow.intensity = Math.min(2.6, s.t * 2 + (s.phase === "cook" ? 1.2 : 0.8)) + Math.sin(G.time * 11) * 0.12;
    if (s.phase === "prep") {
      if (s.t > knock) { knock = s.t + 0.42; AUDIO.knife && AUDIO.knife(); }
      if (s.t >= 2.4) {
        s.phase = "cook"; s.t = 0;
        // into the pot or the pan
        if (isPot) {
          rig.lid.position.y = 0.21; rig.lid.rotation.z = 0.9; rig.lid.position.x = 0.12;
          rig.stew.visible = true; rig.stew.material.color.setHex(0x8a6a50); rig.chunks.children.forEach(c => { c.visible = true; c.material.color.setHex(r.colour); });
          AUDIO.bubble && AUDIO.bubble(true, 0.3);
        } else {
          rig.food.children.forEach((c, i) => { if (c.geometry.type === "BoxGeometry") { c.visible = true; c.material.color.setHex(r.colour); c.rotation.x = 0; } });
          rig.glaze.forEach(b => (b.visible = !!r.need.blackberries));
          AUDIO.sizzle && AUDIO.sizzle(true, 0.5);
        }
        SFX.pickup && SFX.pickup();
        G.working = { kind: isPot ? "stir" : "toss", until: G.time + 9999, quiet: true, idle: true };
      }
      drawHud(s); return;
    }
    // cooking
    s.d += s.rate * dt;
    const k = Math.min(1.9, s.d), done = new THREE.Color(r.done), burnt = new THREE.Color(0x1a120c);
    const col = new THREE.Color(r.colour).lerp(done, Math.min(1, k)).lerp(burnt, Math.max(0, Math.min(1, (k - 1.15) / 0.6)));
    if (isPot) {
      s.stick += dt / 4.5;
      if (s.stick >= 1) { s.stick = 0.55; s.scorch = Math.min(1.5, s.scorch + 0.5); AUDIO.sizzle && AUDIO.sizzle(true, 0.9); setTimeout(() => session === s && AUDIO.sizzle && AUDIO.sizzle(false), 900); for (let i = 0; i < 5; i++) P.emit(...v3(rig.pot, 0, 0.25, 0), 0x3a3632, 0.18, 2); UI.hint("It's catching on the bottom — stir it! (F)", 2.5); }
      rig.stew.material.color.copy(new THREE.Color(0x8a6a50).lerp(done, Math.min(1, k)).lerp(burnt, Math.max(0, (k - 1.2) / 0.6)));
      rig.chunks.children.forEach((c, i) => { c.material.color.copy(col); c.position.y = 0.155 + Math.sin(G.time * 5 + i * 1.7) * 0.008 * Math.min(1, k); c.position.x = Math.cos(i * 1.1 + s.stir) * 0.08; c.position.z = Math.sin(i * 1.1 + s.stir) * 0.08; });
      // the simmer: steam, more as it comes up; smoke when it goes too far
      if (Math.random() < dt * (2 + k * 6)) P.emit(...v3(rig.pot, 0, 0.22, 0), 0xf4f0ea, 0.12, 1.8);
      if (k > 1.25 && Math.random() < dt * 5 * (k - 1.2)) P.emit(...v3(rig.pot, 0, 0.24, 0), 0x2a2622, 0.18, 2.2);
      AUDIO.bubble && AUDIO.bubble(true, Math.min(1, 0.3 + k * 0.6));
      s.stir *= Math.max(0, 1 - dt * 0.5);
      // the ladle: going round while you stir
      if (s.stirT > 0) { s.stirT -= dt; s.stir += dt * 7; rig.ladle.position.set(Math.cos(s.stir) * 0.07, 0.12, Math.sin(s.stir) * 0.07); }
    } else {
      rig.food.children.forEach(c => { if (c.geometry.type === "BoxGeometry") c.material.color.copy(col); });
      // the toss: up off the pan, over, and down again
      if (s.toss > 0) {
        s.toss = Math.max(0, s.toss - dt * 2.4);
        const p = 1 - s.toss, up = Math.sin(p * Math.PI);
        rig.food.position.y = up * 0.22; rig.food.rotation.z = p * Math.PI;
        rig.pan.rotation.z = -Math.sin(p * Math.PI) * 0.25;
      } else { rig.food.position.y = 0; rig.food.rotation.z = s.flips % 2 ? Math.PI : 0; rig.pan.rotation.z = 0; }
      if (Math.random() < dt * (1.5 + k * 3)) P.emit(...v3(rig.pan, 0, 0.08, 0), 0xf4f0ea, 0.08, 1.2);
      if (k > 1.2 && Math.random() < dt * 6 * (k - 1.15)) P.emit(...v3(rig.pan, 0, 0.1, 0), 0x2a2622, 0.16, 2);
      AUDIO.sizzle && AUDIO.sizzle(true, Math.min(1, 0.45 + k * 0.4));
    }
    if (s.d >= 1.9) { UI.hint("It's charred. Nothing for it but to take it off.", 3); finish(town, s); return; }
    drawHud(s);
  };
  G.onFrame.push(s.tick);
  drawHud(s);
  AUDIO.knife && AUDIO.knife();
}
const _v = new THREE.Vector3();
function v3(o, x, y, z) { _v.set(x, y, z); o.localToWorld(_v); return [_v.x, _v.y, _v.z]; }

// F at the range: stir the pot, or turn what's in the pan
function act(s) {
  if (s.r.vessel === "pot") {
    s.stick = 0; s.stirT = 1.0;
    AUDIO.stir && AUDIO.stir();
    G.working = { kind: "stir", until: G.time + 9999, quiet: true, busy: G.time + 1 };
  } else {
    if (s.toss > 0) return;
    s.toss = 1; s.flips++;
    if (s.flipped == null) s.flipped = s.d;
    AUDIO.toss && AUDIO.toss();
    G.working = { kind: "toss", until: G.time + 9999, quiet: true, busy: G.time + 0.5 };
  }
}

function finish(town, s) {
  if (s.done) return; s.done = true;
  const { r, rig } = s;
  AUDIO.sizzle && AUDIO.sizzle(false); AUDIO.bubble && AUDIO.bubble(false);
  removeEventListener("keydown", s.keys, true);
  G.onFrame.splice(G.onFrame.indexOf(s.tick), 1);
  hud(false);
  // how it was handled
  const tech = [];
  if (r.vessel === "pan") {
    const f = s.flipped;
    if (f == null) { if (s.d > 0.7) tech.push([-1, "Never turned: burnt below, pale on top"]); }
    else if (f >= 0.38 && f <= 0.68) tech.push([0.5, "Turned at just the right moment"]);
    else if (f < 0.25 || f > 0.85) tech.push([-0.5, f < 0.25 ? "Turned too soon" : "Turned too late"]);
  } else {
    if (s.scorch) tech.push([-s.scorch, s.scorch >= 1 ? "Caught badly on the bottom, and it tastes of it" : "Caught a little on the bottom"]);
    else if (s.d > 0.6) tech.push([0.5, "Stirred well: nothing caught"]);
  }
  const res = judge(r, s.d, s.w, tech, cookLv());
  const dish = makeDish(r, res);
  // plated: the food onto the plate on the board, a clink, and the verdict
  rig.served.material.color.copy(r.vessel === "pot" ? rig.stew.material.color : rig.food.children[0].material.color);
  rig.plate.visible = true;
  rig.stew.visible = false; rig.chunks.children.forEach(c => (c.visible = false)); rig.food.children.forEach(c => (c.visible = false));
  rig.lid.position.set(0, 0.21, 0); rig.lid.rotation.z = 0; rig.ladle.position.set(0.05, 0.12, 0);
  rig.glow.intensity = 1.2; setTimeout(() => { if (!session) rig.glow.intensity = 0; }, 5000);
  G.working = null;
  AUDIO.plate && AUDIO.plate();
  setTimeout(() => {
    const same = G.pack.find(i => i.icon === "dish" && i.dish === dish.dish && i.stars === dish.stars);
    if (same) same.n = (same.n || 1) + 1; else G.pack.push(dish);
    showCard(dish, res);
    if (res.stars >= 4.5) AUDIO.bell && AUDIO.bell(0.25, 1.6);
    // what you learn by it: more from a dish done well, and more from a hard one
    G.practise && G.practise("cooking", Math.round(4 + res.stars * 2 + r.lv * 0.3));
    G.lockMove = false; session = null;
    setTimeout(() => { if (!session) rig.plate.visible = false; }, 6000);
    town.emit && town.emit("cooked", dish);
  }, 700);
}
export const cooking = () => !!session;
// (for the tests: straight to a dish, skipping the recipe list)
export const cookNow = (town, id) => start(town, RECIPE[id]);
export const cookSession = () => session;
