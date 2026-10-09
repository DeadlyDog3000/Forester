// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE WAY INTO MULTIPLAYER: the list of games (the wide world, the games online, the ones on your own network), the
// form for hosting one, and the character builder you pass through on the way in.

import { THREE } from "../core.js";
import { makePerson } from "../models.js";
import { $ } from "../ui.js";
import { Net, addressOf, listRooms, globalServer, HOST } from "./net.js";
import { MODES, SIZES } from "./rules.js";
import { readSlot, MP_SLOT } from "../story.js";
const MODE_LABEL = { ...MODES, colony: "Co-op colony" };
import { TERRAINS, TERRAIN_ORDER } from "./terrain.js";
import { BODIES, SWATCH, PRESETS, randomLook, savedLook, saveLook, lookOpts, isF } from "./look.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hex = n => "#" + (n >>> 0).toString(16).padStart(6, "0");
const SERVERS_KEY = "reckoning.mp.servers";
const typed = () => { try { return JSON.parse(localStorage.getItem(SERVERS_KEY)) || []; } catch (e) { return []; } };
const remember = a => { try { const l = typed().filter(x => x !== a); l.unshift(a); localStorage.setItem(SERVERS_KEY, JSON.stringify(l.slice(0, 6))); } catch (e) {} };

export const SCREENS = ["mpLobby", "mpHost", "mpBuilder"];
let ctx = null;            // {screen(id), enter(net, inMsg, me)} from main.js
let me = null;             // {name, look}
let afterBuild = null;     // what the builder's Play button does
let rows = [];             // the games last heard of

export function initLobby(c) {
  ctx = c;
  const sv = savedLook();
  me = sv ? { name: sv.name, look: sv.look } : { name: "", look: randomLook() };
  $("mpLobbyBack").onclick = () => ctx.screen("title");
  $("mpRefresh").onclick = () => refresh();
  $("mpHostBtn").onclick = () => openHost();
  $("mpEditChar").onclick = () => openBuilder(null);
  $("mpAddrGo").onclick = () => { const a = addressOf($("mpAddr").value); if (!a) return say("That isn't an address — something like 192.168.1.20:47810."); remember(a.label); refresh(); };
  $("mpAddr").addEventListener("keydown", e => { if (e.key === "Enter") $("mpAddrGo").click(); });
  $("mpWorldGo").onclick = () => { const g = globalServer(); if (!g) return; go({ addr: addressOf(g), room: "world" }); };
  $("mpHostBack").onclick = () => ctx.screen("mpLobby");
  $("mpHostGo").onclick = () => hostGo();
  $("mpHostKind").innerHTML = TERRAIN_ORDER.map(k => `<option value="${k}">${TERRAINS[k].name}</option>`).join("");
  $("mpHostKind").onchange = () => { $("mpKindNote").textContent = TERRAINS[$("mpHostKind").value].note; drawKindPreview(); };
  $("mpHostSize").onchange = drawKindPreview;
  $("mpHostSeed").onclick = () => { seedNow = Math.floor(Math.random() * 2 ** 31); drawKindPreview(); };
  $("mpBuildBack").onclick = () => { closePreview(); ctx.screen("mpLobby"); };
  $("mpBuildGo").onclick = () => { const n = $("mpName").value.trim().slice(0, 24); if (!n) { $("mpName").focus(); $("mpName").classList.add("want"); return; } me.name = n; saveLook(me.name, me.look); closePreview(); const f = afterBuild; afterBuild = null; if (f) f(); else ctx.screen("mpLobby"); };
  $("mpRandom").onclick = () => { me.look = randomLook(); buildControls(); showLook(); };
  $("mpName").addEventListener("input", () => $("mpName").classList.remove("want"));
}
export function openLobby() {
  ctx.screen("mpLobby");
  $("mpWho").textContent = me.name ? `Playing as ${me.name}` : "You haven't made your character yet";
  const g = globalServer();
  $("mpWorldGo").disabled = !g;
  $("mpWorldState").textContent = g ? "Looking…" : "The wide world's server isn't open yet. Host a game, or join one, in the meantime.";
  $("mpLanNote").classList.toggle("hidden", !!HOST);
  refresh();
}
function say(text, bad = true) { const n = $("mpNote"); n.textContent = text || ""; n.classList.toggle("bad", !!bad); }

// ---- the list ----
async function refresh() {
  say("");
  const list = $("mpRooms"); list.innerHTML = `<div class="mp-empty">Looking for games…</div>`;
  const found = [];
  const g = globalServer(), jobs = [];
  if (g) jobs.push(listRooms(addressOf(g)).then(r => {
    if (!r) { $("mpWorldState").textContent = "The wide world's server can't be reached just now."; return; }
    const w = (r.rooms || []).find(x => x.persistent);
    $("mpWorldState").textContent = w ? `${w.players} ${w.players === 1 ? "person" : "people"} in the world now` : "Open";
    for (const x of r.rooms || []) if (!x.persistent) found.push({ ...x, addr: addressOf(g), where: "Online" });
  }));
  for (const a of typed()) { const ad = addressOf(a); if (ad) jobs.push(listRooms(ad).then(r => { if (r) for (const x of r.rooms || []) if (!x.persistent) found.push({ ...x, addr: ad, where: a }); })); }
  if (HOST) jobs.push(HOST.discover(2200).then(servers => {
    for (const s of servers || []) { const ad = addressOf(`${s.address}:${s.port}`); for (const x of s.rooms || []) found.push({ ...x, addr: ad, where: s.self ? "Hosted here" : "On this network" }); }
  }).catch(() => {}));
  await Promise.all(jobs);
  // (the same game heard twice — on the network and by address — once)
  const seen = new Set(); rows = found.filter(r => { const k = r.id; if (seen.has(k)) return false; seen.add(k); return true; });
  list.innerHTML = rows.length ? rows.map((r, i) => `<div class="slot mp-room">
      <div class="sl-n">${esc(r.where)} · ${MODE_LABEL[r.mode] || r.mode}${r.locked ? " · 🔒" : ""}</div>
      <div class="sl-t">${esc(r.name)}</div>
      <div class="sl-d">${r.mode === "colony" ? "The full game: one settlement, run together" : `${esc(TERRAINS[r.kind] ? TERRAINS[r.kind].name : "Island")}, ${{ s: "small", m: "middling", l: "large" }[r.size] || ""}`} · hosted by ${esc(r.host || "?")}<br>${r.players} of ${r.max} playing</div>
      <div class="sl-acts"><button class="primary" data-i="${i}" ${r.players >= r.max ? "disabled" : ""}>${r.players >= r.max ? "Full" : "Join"}</button></div></div>`).join("")
    : `<div class="mp-empty">No games to join just now. Host one, and your friends will see it here${HOST ? " (on your own network, they'll find it by themselves; over the internet, give them your address)" : ""}.</div>`;
  for (const b of list.querySelectorAll("button[data-i]")) b.onclick = () => { const r = rows[+b.dataset.i]; const pw = r.locked ? prompt("That game has a password:") : ""; if (r.locked && pw === null) return; go({ addr: r.addr, room: r.id, password: pw || "" }); };
}

// ---- hosting ----
let seedNow = Math.floor(Math.random() * 2 ** 31);
function openHost() {
  ctx.screen("mpHost");
  if (!$("mpHostName").value) $("mpHostName").value = me.name ? `${me.name}'s game` : "A game in the woods";
  const g = globalServer(), opts = [];
  if (HOST) opts.push(`<option value="lan">On this computer — friends on your network join, or over the internet by your address</option>`);
  if (g) opts.push(`<option value="global">On the Forester server — anyone can join</option>`);
  for (const a of typed()) opts.push(`<option value="addr:${esc(a)}">On the server at ${esc(a)}</option>`);
  $("mpHostWhere").innerHTML = opts.join("") || `<option value="">Hosting needs the desktop app, or a server's address</option>`;
  $("mpHostGo").disabled = !opts.length;
  $("mpKindNote").textContent = TERRAINS[$("mpHostKind").value].note;
  // a co-op colony: the one you've hosted before, carried on, or a new one
  const old = readSlot(MP_SLOT), T = old && old.town;
  $("mpHostColony").innerHTML = (T ? `<option value="continue">Carry on with ${esc(T.name || "your colony")} — day ${Math.floor(T.days || 0) + 1}, ${(T.people || []).length + 2} souls</option>` : "") + `<option value="new">${T ? "A new colony (the old one is gone)" : "A new colony"}</option>`;
  const setMode = () => { $("mpHost").classList.toggle("colony", $("mpHostMode").value === "colony"); if ($("mpHostMode").value !== "colony") drawKindPreview(); };
  $("mpHostMode").onchange = setMode; setMode();
}
// a look at the land before you choose it: the same seed the game will grow
async function drawKindPreview() {
  const { makeTerrain } = await import("./terrain.js");
  const cv = $("mpKindMap"), N = cv.width, half = SIZES[$("mpHostSize").value] || 650, T = makeTerrain(seedNow, half, $("mpHostKind").value);
  const c = cv.getContext("2d"), img = c.createImageData(N, N), d = img.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -half + (i + 0.5) * 2 * half / N, z = -half + (j + 0.5) * 2 * half / N, h = T.heightAt(x, z), o = (j * N + i) * 4;
    let col;
    if (h < 0) { const k = Math.min(1, -h / 10); col = [110 - k * 50, 140 - k * 40, 150 - k * 20]; }
    else if (h < 1.4) col = [214, 196, 150];
    else if (h > (T.big ? 62 : 48) - 4) col = [236, 236, 236];
    else { const f = T.forestAt(x, z), hk = Math.min(1, h / 60), sh = Math.max(-18, Math.min(18, (T.heightAt(x - 8, z - 8) - h) * 0.6)); col = [190 - f * 80 - hk * 30 - sh, 186 - f * 50 - hk * 30 - sh, 120 - f * 40 - sh]; }
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}
async function hostGo() {
  const where = $("mpHostWhere").value, msg = { t: "host", name: $("mpHostName").value.trim() || "A game in the woods", mode: $("mpHostMode").value, kind: $("mpHostKind").value, size: $("mpHostSize").value, max: +$("mpHostMax").value, password: $("mpHostPw").value, seed: seedNow };
  let addr = null;
  if (where === "lan") {
    $("mpHostGo").disabled = true; $("mpHostGo").textContent = "Starting…";
    try { const h = await HOST.host(); addr = addressOf(`127.0.0.1:${h.port}`); addr.lan = { port: h.port, addresses: h.addresses || [] }; }
    catch (e) { $("mpHostGo").disabled = false; $("mpHostGo").textContent = "Host"; return alert("Couldn't start hosting: " + e.message); }
    $("mpHostGo").disabled = false; $("mpHostGo").textContent = "Host";
  } else if (where === "global") addr = addressOf(globalServer());
  else if (where.startsWith("addr:")) addr = addressOf(where.slice(5));
  if (!addr) return;
  seedNow = Math.floor(Math.random() * 2 ** 31);
  go({ addr, host: msg, colony: msg.mode === "colony" ? $("mpHostColony").value : null });
}

// ---- in: through the builder, then onto the server ----
function go(target) {
  afterBuild = () => connect(target);
  openBuilder(target);
}
async function connect(target) {
  ctx.screen("mpLobby"); say("Connecting…", false);
  const net = new Net(target.addr);
  try {
    await net.connect(me.name, me.look);
    const wait = net.next("in", 15000);
    if (target.host) net.send(target.host); else net.send({ t: "join", room: target.room, password: target.password, name: me.name, look: me.look });
    const inMsg = await wait;
    say("");
    ctx.enter(net, inMsg, me, target);
  } catch (e) { net.close(); say(e.message); }
}

// ---- the character builder ----
// A preview you can turn and look closer at, and the choices in tabs: a preset to start from, the body, the face and
// hair, the clothes. Every colour has its row of the period's dyes and a picker for any other.
let pv = null, tab = "body";
const BODY_NOTE = { townsman: "Coat, breeches and buckled shoes", townswoman: "Bodice, skirt and apron", brother: "A woodsman's coat and waistcoat", sister: "A working dress, sleeves rolled" };
function openBuilder(target) {
  ctx.screen("mpBuilder");
  $("mpName").value = me.name || "";
  $("mpBuildGo").textContent = target ? (target.host ? "Host the game" : "Into the game") : "Done";
  $("mpBuildTitle").textContent = target ? "Who goes into the woods?" : "Your character";
  for (const b of document.querySelectorAll("#mpBuilder [data-tab]")) b.onclick = () => { tab = b.dataset.tab; buildControls(); setCam(tab === "face" ? "face" : "body"); };
  for (const b of document.querySelectorAll("#mpBuilder [data-cam]")) b.onclick = () => setCam(b.dataset.cam);
  for (const b of document.querySelectorAll("#mpBuilder [data-turn]")) b.onclick = () => { if (pv) pv.yawTo = (pv.yawTo ?? pv.yaw) + Math.PI / 4 * +b.dataset.turn; };
  buildControls();
  openPreview();
  showLook();
  if (!me.name) setTimeout(() => $("mpName").focus(), 50);
}
function setCam(c) { if (pv) pv.cam = c; for (const b of document.querySelectorAll("#mpBuilder [data-cam]")) b.classList.toggle("on", b.dataset.cam === c); }
function buildControls() {
  const L = me.look, f = isF(L);
  for (const b of document.querySelectorAll("#mpBuilder [data-tab]")) b.classList.toggle("on", b.dataset.tab === tab);
  const sw = (key, label, list, cur, isNone) => `<div class="mp-row"><span>${label}</span><div class="mp-sw">${list.map(v => `<button class="sw${(v === null ? isNone : v === cur && !isNone) ? " on" : ""}${v === null ? " none" : ""}" data-k="${key}" data-v="${v === null ? "" : v}" style="${v === null ? "" : `background:${hex(v)}`}" title="${v === null ? "None" : ""}"></button>`).join("")}<input type="color" class="cb-pick" data-k="${key}" value="${hex(cur ?? list.find(x => x !== null) ?? 0x888888)}" title="Any colour"></div></div>`;
  const slider = (key, label, min, max, v, fmt) => `<div class="mp-row"><span>${label}</span><div class="cb-slider"><input type="range" data-s="${key}" min="${min}" max="${max}" step="0.01" value="${v}"><span data-o="${key}">${fmt(v)}</span></div></div>`;
  const pct = v => `${Math.round(v * 100)}%`;
  let h = "";
  if (tab === "presets") {
    h = `<div class="cb-presets">${PRESETS.map((p, i) => `<button data-pre="${i}">${esc(p.name)}<div class="cb-chips">${["skin", "hair", "coat", "legs"].map(k => `<i style="background:${hex(p.look[k] ?? 0)}"></i>`).join("")}</div></button>`).join("")}</div><p class="mp-hint">A preset fills everything in. Change anything after.</p>`;
  } else if (tab === "body") {
    h = `<div class="cb-bodies">${BODIES.map(b => `<button data-body="${b.id}" class="${b.id === L.body ? "on" : ""}">${b.name}<small>${BODY_NOTE[b.id]}</small></button>`).join("")}</div>`
      + slider("height", "Height", 0.94, 1.06, L.height || 1, v => `${Math.round(170 * v)} cm`)
      + slider("build", "Build", 0.9, 1.12, L.build || 1, v => v < 0.96 ? "slight" : v > 1.05 ? "broad" : "middling")
      + sw("skin", "Skin", SWATCH.skin, L.skin);
  } else if (tab === "face") {
    h = slider("head", "Head", 0.94, 1.06, L.head || 1, pct)
      + sw("hair", "Hair", SWATCH.hair, L.hair)
      + sw("eyes", "Eyes", SWATCH.eyes, L.eyes ?? SWATCH.eyes[0])
      + (L.body !== "sister" ? sw("hatColor", f ? "Bonnet" : "Hat", SWATCH.hat, L.hatColor, L.hat === "none") : "");
  } else {
    h = sw("coat", f ? "Bodice" : "Coat", SWATCH.coat, L.coat)
      + sw("legs", f ? "Skirt" : "Breeches", SWATCH.legs, L.legs)
      + (L.body === "brother" ? sw("vest", "Waistcoat", SWATCH.vest, L.vest) : "")
      + (f ? sw("apron", "Apron", SWATCH.apron, L.apron, !L.apron) : "")
      + sw("linen", "Shirt", SWATCH.linen, L.linen ?? SWATCH.linen[0])
      + sw("stockings", "Stockings", SWATCH.stockings, L.stockings ?? SWATCH.stockings[0]);
  }
  $("mpControls").innerHTML = h;
  const set = (k, v) => {
    if (k === "hatColor") { if (v === null) L.hat = "none"; else { L.hat = "hat"; L.hatColor = v; } }
    else L[k] = v;
    showLook();
  };
  for (const b of $("mpControls").querySelectorAll("[data-body]")) b.onclick = () => { L.body = b.dataset.body; buildControls(); showLook(); };
  for (const b of $("mpControls").querySelectorAll(".sw")) b.onclick = () => { set(b.dataset.k, b.dataset.v === "" ? null : +b.dataset.v); buildControls(); };
  for (const i of $("mpControls").querySelectorAll(".cb-pick")) i.oninput = () => { set(i.dataset.k, parseInt(i.value.slice(1), 16)); for (const b of i.parentNode.querySelectorAll(".sw")) b.classList.remove("on"); };
  for (const i of $("mpControls").querySelectorAll("[data-s]")) i.oninput = () => { L[i.dataset.s] = +i.value; const o = $("mpControls").querySelector(`[data-o="${i.dataset.s}"]`); if (o) o.textContent = { height: v => `${Math.round(170 * v)} cm`, build: v => v < 0.96 ? "slight" : v > 1.05 ? "broad" : "middling", head: v => `${Math.round(v * 100)}%` }[i.dataset.s](+i.value); showLook(); };
  for (const b of $("mpControls").querySelectorAll("[data-pre]")) b.onclick = () => { me.look = { ...PRESETS[+b.dataset.pre].look, seed: me.look.seed || 1 }; tab = "body"; buildControls(); showLook(); };
}
function openPreview() {
  if (pv) return;
  // (a fresh canvas each time: the last one's drawing context was let go)
  const old = $("mpPreview"), cv = old.cloneNode(false); old.replaceWith(cv);
  const W = cv.clientWidth || 380, H = cv.clientHeight || 520;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(W, H, false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 50);
  // a portrait painter's light: a warm key from high on one side, a cool rim behind, a soft fill
  const key = new THREE.DirectionalLight(0xffe2b8, 2.6); key.position.set(-2.2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 12 }); key.shadow.bias = -0.0005; scene.add(key);
  const rim = new THREE.DirectionalLight(0x9cc0ff, 1.4); rim.position.set(2.5, 2.5, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xc8d8f0, 0x5a5038, 0.9), new THREE.AmbientLight(0xffdcb8, 0.15));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshStandardMaterial({ color: 0x3a3a2a, roughness: 1 })); disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true; scene.add(disc);
  pv = { r, scene, cam, P: null, yaw: 0.45, yawTo: null, drag: null, raf: 0, last: performance.now(), cam: "body", zoom: 1, cx: 0, cy: 0.95, cd: 4.6 };
  cv.onpointerdown = e => { pv.drag = e.clientX; pv.yawTo = null; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (pv && pv.drag != null) { pv.yaw += (e.clientX - pv.drag) * 0.012; pv.drag = e.clientX; } };
  cv.onpointerup = () => { if (pv) { pv.drag = null; pv.idleAt = performance.now(); } };
  cv.onwheel = e => { e.preventDefault(); if (!pv) return; pv.zoom = Math.min(1.25, Math.max(0.35, pv.zoom * Math.exp(e.deltaY * 0.0012))); };
  const loop = now => {
    if (!pv) return;
    const dt = Math.min(0.05, (now - pv.last) / 1000); pv.last = now;
    if (pv.yawTo != null) { pv.yaw += (pv.yawTo - pv.yaw) * Math.min(1, dt * 6); if (Math.abs(pv.yawTo - pv.yaw) < 0.01) pv.yawTo = null; }
    else if (pv.drag == null && now - (pv.idleAt || 0) > 3000) pv.yaw += dt * 0.22;
    // the camera: the whole figure, or close on the face — eased between
    const ht = (me.look.height || 1), face = pv.cam === "face";
    const wantY = face ? 1.66 * ht : 0.95 * ht, wantD = (face ? 1.75 : 4.6) * pv.zoom;
    pv.cy += (wantY - pv.cy) * Math.min(1, dt * 5); pv.cd += (wantD - pv.cd) * Math.min(1, dt * 5);
    cam.position.set(0, pv.cy + (face ? 0.02 : 0.15), pv.cd); cam.lookAt(0, pv.cy, 0);
    if (pv.P) { pv.P.root.rotation.y = pv.yaw; pv.P.update(dt, 0); }
    pv.r.render(pv.scene, cam);
    pv.raf = requestAnimationFrame(loop);
  };
  pv.raf = requestAnimationFrame(loop);
}
function showLook() {
  if (!pv) return;
  if (pv.P) pv.scene.remove(pv.P.root);
  pv.P = makePerson(lookOpts(me.look, me.name));
  pv.P.setPose("idle");
  pv.P.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  pv.scene.add(pv.P.root);
}
function closePreview() {
  if (!pv) return;
  cancelAnimationFrame(pv.raf);
  try { pv.r.dispose(); pv.r.forceContextLoss(); } catch (e) {}
  pv = null;
}
export const myself = () => me;
