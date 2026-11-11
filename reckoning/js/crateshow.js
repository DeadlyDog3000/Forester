// a crate from the muster, opened on the floor in front of you: a real packing crate, nailed shut and branded with the
// kingdom's name, that jolts as what's inside it settles (more often the rarer it is, the light in its seams climbing
// through the colours as it goes), is prised open with an iron crow — the nails drawn squealing, the lid thrown down —
// and gives up its straw and the light of what it holds; then the troop itself, on a card.
import { THREE } from "./core.js";
import { FOLEY } from "./foley.js";

const SOUNDS = ["cratePry", "crateLid", "crateStraw", "crateJolt"];
export const warmCrate = () => { try { FOLEY.preload(SOUNDS); } catch (e) {} };
const snd = (name, vol, after = 0) => { try { FOLEY.rec(name, vol, after); } catch (e) {} };

// ---- the wood: sawn pine boards, the grain drawn as it runs along a plank, knots here and there ----
let woodTex = null, brandCache = new Map();
function wood() {
  if (woodTex) return woodTex;
  const W = 512, H = 128, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d");
  c.fillStyle = "#a07a4c"; c.fillRect(0, 0, W, H);
  let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const y0 = R() * H, a = 1 + R() * 3, f = 0.004 + R() * 0.01, ph = R() * 6, dark = R() < 0.5;
    c.strokeStyle = dark ? `rgba(70,42,20,${0.12 + R() * 0.22})` : `rgba(200,160,110,${0.08 + R() * 0.12})`; c.lineWidth = 0.6 + R() * 1.8;
    c.beginPath(); for (let x = 0; x <= W; x += 8) { const y = y0 + Math.sin(x * f + ph) * a; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  }
  // (knots, the grain bending round them)
  for (let k = 0; k < 3; k++) { const x = 60 + R() * (W - 120), y = 20 + R() * (H - 40), r = 4 + R() * 6;
    for (let j = 4; j >= 0; j--) { c.fillStyle = `rgba(${60 + j * 12},${36 + j * 8},${18 + j * 5},${0.5 - j * 0.07})`; c.beginPath(); c.ellipse(x, y, r * (1 + j * 0.9), r * (0.6 + j * 0.35), 0, 0, Math.PI * 2); c.fill(); } }
  // (the saw's marks across it, faint)
  for (let x = 0; x < W; x += 6 + R() * 6) { c.fillStyle = `rgba(60,35,15,${R() * 0.05})`; c.fillRect(x, 0, 1.2, H); }
  woodTex = new THREE.CanvasTexture(cv); woodTex.colorSpace = THREE.SRGBColorSpace; woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.anisotropy = 4;
  return woodTex;
}
// ---- the brand burnt into its side: the kingdom's name, a number, and a crown ----
function brand(text) {
  if (brandCache.has(text)) return brandCache.get(text);
  const W = 512, H = 256, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d");
  c.clearRect(0, 0, W, H); c.textAlign = "center"; c.textBaseline = "middle";
  const ink = (a) => `rgba(22,10,4,${Math.min(1, a * 1.2)})`;
  // (a crown: a band and five points)
  c.fillStyle = ink(0.8); c.beginPath(); const cx = W / 2, cy = 52;
  c.moveTo(cx - 46, cy + 22); c.lineTo(cx - 52, cy - 14); c.lineTo(cx - 26, cy + 4); c.lineTo(cx - 13, cy - 24); c.lineTo(cx, cy + 2); c.lineTo(cx + 13, cy - 24); c.lineTo(cx + 26, cy + 4); c.lineTo(cx + 52, cy - 14); c.lineTo(cx + 46, cy + 22); c.closePath(); c.fill();
  c.font = "bold 58px Georgia, 'Times New Roman', serif"; c.fillStyle = ink(0.78);
  let size = 58; while (c.measureText(text).width > W - 40 && size > 24) { size -= 4; c.font = `bold ${size}px Georgia, 'Times New Roman', serif`; }
  c.fillText(text, W / 2, 130);
  c.font = "bold 34px Georgia, 'Times New Roman', serif"; c.fillText(`No. ${100 + Math.floor(Math.random() * 900)}`, W / 2, 196);
  // (burnt in, not printed: the edges eaten and broken)
  const d = c.getImageData(0, 0, W, H), p = d.data;
  for (let i = 3; i < p.length; i += 4) if (p[i]) { const n = Math.random(); p[i] = Math.max(0, p[i] * (0.75 + n * 0.3) - (n < 0.06 ? 120 : 0)); }
  c.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; brandCache.set(text, t); return t;
}
// ---- the floor: cobbles in lantern light ----
function floorTex() {
  const t = new THREE.TextureLoader().load("art/tex/cobbles.jpg"); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}

// the crate: boards on every side with gaps between, battens at the corners, nails; the lid on its own, to come off
function buildCrate(brandText) {
  const g = new THREE.Group(), tex = wood();
  const W = 1.0, D = 0.7, H = 0.62, T = 0.03, n = 3, gap = 0.012;
  const mat = shade => { const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0, color: new THREE.Color().setHSL(0.08, 0.3, shade) }); return m; };
  const mats = [0.74, 0.68, 0.8, 0.63, 0.71].map(mat), dark = mat(0.5), nailM = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.5, metalness: 0.7 });
  const seams = [];
  const seamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  let bi = 0;
  const box = (w, h, d, x, y, z, m, parent = g) => { const G = new THREE.BoxGeometry(w, h, d), uv = G.attributes.uv.array, ox = (bi * 0.37) % 1, oy = (bi++ * 0.61) % 1; for (let j = 0; j < uv.length; j += 2) { uv[j] = uv[j] * 0.6 + ox; uv[j + 1] = uv[j + 1] * 0.35 + oy; } const b = new THREE.Mesh(G, m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
  const ph = (H - gap * (n - 1)) / n;
  let k = 0;
  // (the four sides, each of three boards laid flat, the light between them when something's inside)
  for (let i = 0; i < n; i++) {
    const y = ph / 2 + i * (ph + gap);
    for (const s of [1, -1]) {
      box(W, ph, T, 0, y, s * (D / 2 - T / 2), mats[k++ % 5]);
      box(T, ph, D - 2 * T, s * (W / 2 - T / 2), y, 0, mats[k++ % 5]);
    }
    if (i < n - 1) { const yg = (i + 1) * (ph + gap) - gap / 2;
      for (const s of [1, -1]) { seams.push(box(W - 0.06, gap * 0.9, 0.004, 0, yg, s * (D / 2 - T * 0.7), seamMat)); seams.push(box(0.004, gap * 0.9, D - 0.08, s * (W / 2 - T * 0.7), yg, 0, seamMat)); } }
  }
  box(W, T, D, 0, T / 2, 0, dark);
  // (the corner battens, up each edge, and a band round the middle of the long sides)
  for (const sx of [1, -1]) for (const sz of [1, -1]) box(0.07, H, 0.025, sx * (W / 2 - 0.035), H / 2, sz * (D / 2 + 0.012), dark);
  for (const sz of [1, -1]) box(0.07, H, 0.025, 0, H / 2, sz * (D / 2 + 0.012), dark).scale.set(1, 1, 1);
  // (nails: two at each batten, top and bottom)
  const nail = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 8); nail.rotateX(Math.PI / 2);
  for (const sx of [1, -1, 0]) for (const sz of [1, -1]) for (const y of [0.08, H - 0.08, H / 2]) { const m = new THREE.Mesh(nail, nailM); m.position.set(sx * (W / 2 - 0.035), y, sz * (D / 2 + 0.026)); g.add(m); }
  // (the brand on the front)
  const br = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.19), new THREE.MeshStandardMaterial({ map: brand(brandText), transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  br.position.set(-0.235, H * 0.55, D / 2 + 0.0015); g.add(br);
  // (inside: dark, and a bed of straw)
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, D - 2 * T), new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 }));
  inside.rotation.x = -Math.PI / 2; inside.position.y = H * 0.55; g.add(inside);
  const strawG = new THREE.BoxGeometry(0.0034, 0.0034, 0.12), strawM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, emissive: 0x000000 });
  const straws = new THREE.InstancedMesh(strawG, strawM, 260), dummy = new THREE.Object3D(), strawAt = [];
  for (let i = 0; i < 260; i++) {
    dummy.position.set((Math.random() - 0.5) * (W - 0.12), H * 0.56 + Math.random() * 0.05, (Math.random() - 0.5) * (D - 0.12));
    dummy.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6); dummy.updateMatrix(); straws.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(1, 1, 0.5 + Math.random() * 0.9); dummy.updateMatrix(); straws.setMatrixAt(i, dummy.matrix);
    straws.setColorAt(i, new THREE.Color().setHSL(0.105 + Math.random() * 0.03, 0.55 + Math.random() * 0.2, 0.26 + Math.random() * 0.14));
    strawAt.push({ p: dummy.position.clone(), r: dummy.rotation.clone(), sc: dummy.scale.clone(), v: null });
  }
  straws.castShadow = true; g.add(straws);
  // (the lid: four boards across, two battens under-and-over, nailed down at the corners)
  const lid = new THREE.Group(), lw = (W - 3 * 0.006) / 4;
  for (let i = 0; i < 4; i++) box(lw, T, D + 0.02, -W / 2 + lw / 2 + i * (lw + 0.006), 0, 0, mats[(i + 2) % 5], lid);
  for (const sz of [1, -1]) box(W, 0.022, 0.08, 0, T / 2 + 0.011, sz * (D / 2 - 0.08), dark, lid);
  for (const sx of [1, -1]) for (const sz of [1, -1]) { const m = new THREE.Mesh(nail, nailM); m.rotation.x = Math.PI / 2; m.position.set(sx * (W / 2 - 0.05), T / 2 + 0.025, sz * (D / 2 - 0.08)); lid.add(m); }
  // (the lid hinged, for the prising, at its far edge: the near edge lifts first)
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, H + T / 2, -D / 2); lid.position.set(0, 0, D / 2); lidPivot.add(lid); g.add(lidPivot);
  return { g, lid, lidPivot, seams, seamMat, straws, strawAt, dummy, H, W, D };
}

// an iron crow: a bar with its end bent and split
function buildCrow() {
  const m = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.45, metalness: 0.85 });
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.9, 10), m); bar.rotation.z = Math.PI / 2; bar.position.x = 0.45; g.add(bar);
  const bend = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 12, Math.PI * 0.6), m); bend.rotation.z = Math.PI * 0.75; bend.position.set(0.02, 0.035, 0); g.add(bend);
  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.03), m); claw.position.set(-0.03, 0.08, 0); claw.rotation.z = -0.3; g.add(claw);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t), easeOut = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

// show it: { rarities (the list, common first), rarity (its index), brand, card: html for the reveal } → resolves when closed
export function crateShow({ rarities, rarity, brand: brandText, card, onClose }) {
  return new Promise(resolve => {
    const ov = document.createElement("div"); ov.className = "crate-show";
    ov.innerHTML = `<canvas></canvas><div class="crate-card hidden">${card}<button class="btn primary crate-take">Take them</button></div><div class="crate-skip">Click to open it at once</div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector("canvas"), cardEl = ov.querySelector(".crate-card"), skipEl = ov.querySelector(".crate-skip");
    cardEl.style.setProperty("--cr", rarities[rarity].col);
    let R;
    try { R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { R = null; }
    const fin = () => { ov.classList.add("shut"); setTimeout(() => { try { R && (R.dispose(), R.forceContextLoss()); } catch (e) {} ov.remove(); }, 260); cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("keydown", key, true); onClose && onClose(); resolve(); };
    ov.querySelector(".crate-take").onclick = e => { e.stopPropagation(); fin(); };
    if (!R) { cardEl.classList.remove("hidden"); skipEl.remove(); return; }
    R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x0d0a07, 3.5, 9);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    const size = () => { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); cam.aspect = w / h; cam.fov = w < h ? 52 : 38; cam.updateProjectionMatrix(); };
    size(); addEventListener("resize", size);
    // (the room: a lantern hung above and to one side, the warm light of it, a little cold from a window behind)
    scene.add(new THREE.HemisphereLight(0x8a7a66, 0x1a120a, 0.5));
    const lamp = new THREE.SpotLight(0xffc98a, 38, 9, 0.75, 0.6, 1.6); lamp.position.set(1.4, 3.1, 1.5); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0008; scene.add(lamp); scene.add(lamp.target);
    const back = new THREE.DirectionalLight(0x8fa6c8, 0.5); back.position.set(-2, 2, -3); scene.add(back);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.95, color: 0x8a8070 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; scene.add(fl);
    const C = buildCrate(brandText); scene.add(C.g); C.g.rotation.y = -0.32;
    const crow = buildCrow(); crow.visible = false; scene.add(crow);
    // (what's inside: its light, and a shaft of it going up once the lid's off — the rarer, the more)
    const top = rarities.length - 1, col = new THREE.Color(rarities[rarity].col);
    const glow = new THREE.PointLight(col, 0, 4, 1.5); glow.position.set(0, C.H + 0.1, 0); C.g.add(glow);
    // (soft: brightest at the crate's mouth and down its middle, gone to nothing up in the dark)
    const shaftTex = (() => { const w = 64, h = 256, cv = document.createElement("canvas"); cv.width = w; cv.height = h; const c = cv.getContext("2d"), d = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = (x / (w - 1)) * 2 - 1, v = 1 - y / (h - 1), a = Math.exp(-u * u * 2.4) * Math.pow(1 - v, 1.6) * Math.min(1, v * 14 + 0.3); const i = (y * w + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a * 255; }
      c.putImageData(d, 0, 0); return new THREE.CanvasTexture(cv); })();
    const shaftMat = new THREE.MeshBasicMaterial({ color: col, map: shaftTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shaft = new THREE.Group(); shaft.material = shaftMat;
    for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.0), shaftMat); pl.rotation.y = i * Math.PI / 3; shaft.add(pl); }
    shaft.position.set(0, C.H + 1.45, 0); C.g.add(shaft);
    // (the dust kicked up when the lid comes down)
    const puff = (() => { const n = 64, cv = document.createElement("canvas"); cv.width = cv.height = n; const c = cv.getContext("2d"), gr = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.5, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, n, n); return new THREE.CanvasTexture(cv); })();
    const dustM = new THREE.SpriteMaterial({ map: puff, color: 0x9a8a72, transparent: true, opacity: 0, depthWrite: false }), dust = [];
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(dustM.clone()); s.visible = false; scene.add(s); dust.push({ s, v: new THREE.Vector3(), t0: 0 }); }
    // the run of it: a jolt for each step of rarity it climbs (the seams lit in each colour in turn), then the crow
    const jolts = rarity + 1, J0 = 0.7, JD = 0.62, P0 = J0 + jolts * JD + 0.15, PD = 1.5, L0 = P0 + PD, REV = L0 + 0.55 + rarity * 0.12;
    let t0 = performance.now(), raf = 0, last = -1, done = { pry: false, lid: false, straw: false, card: false }, lidOff = null;
    const skip = () => { if (done.card) return; t0 = performance.now() - REV * 1000; };
    ov.addEventListener("click", e => { if (!e.target.closest(".crate-card")) skip(); });
    const key = e => { if (e.key === "Escape" || e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (done.card) fin(); else skip(); } };
    addEventListener("keydown", key, true);
    const camFrom = new THREE.Vector3(0.6, 2.4, 3.6), camTo = new THREE.Vector3(0.25, 2.05, 2.95), look = new THREE.Vector3(0, 0.45, 0);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      // (a test can hold it at one moment: window.__crateAt = seconds)
      const t = window.__crateAt ?? (performance.now() - t0) / 1000, dt = Math.min(0.05, Math.max(0, t - (frame.t ?? t))); frame.t = t;
      cam.position.lerpVectors(camFrom, camTo, easeOut(t / 1.4)); cam.lookAt(look);
      // (the jolts)
      const j = Math.floor((t - J0) / JD);
      if (t >= J0 && j < jolts && j !== last) { last = j; snd("crateJolt", 0.42 + j * 0.05); C.seamMat.color.set(rarities[j].col); }
      if (t >= J0 && t < P0) {
        const u = ((t - J0) % JD) / JD, k = Math.max(0, 1 - u * 3.2), side = j % 2 ? 1 : -1;
        C.g.position.y = Math.sin(Math.min(1, u * 3.2) * Math.PI) * 0.035 * (1 + j * 0.15);
        C.g.rotation.z = side * k * 0.035; C.g.rotation.x = -k * 0.02;
        C.seamMat.opacity = rarity === 0 ? 0.25 * k : Math.min(1, (0.5 + 0.12 * j) * (0.45 + 0.55 * k));
        glow.color.set(rarities[Math.min(j, top)].col); glow.intensity = rarity ? (0.5 + j * 0.4) * (0.3 + 0.7 * k) : 0;
      } else if (t < P0) { C.g.position.y = 0; C.g.rotation.z = 0; C.g.rotation.x = 0; }
      // (the crow under the near edge of the lid, and levered down: the lid comes up a little, the nails squealing)
      if (t >= P0 && t < L0) {
        C.g.position.y = 0; C.g.rotation.z = 0; C.g.rotation.x = 0; C.seamMat.opacity = 0.5 + 0.3 * Math.sin(t * 9) ** 2; C.seamMat.color.copy(col);
        if (!done.pry) { done.pry = true; snd("cratePry", 0.62); }
        const u = (t - P0) / PD; crow.visible = true;
        const edge = new THREE.Vector3(0.12, C.H + 0.01, C.D / 2 + 0.01).applyMatrix4(C.g.matrixWorld);
        const lever = ease((u - 0.25) / 0.6);
        crow.position.copy(edge).add(new THREE.Vector3(0, 0, 0.02 + (1 - ease(u / 0.25)) * 0.5));
        crow.rotation.set(0, -Math.PI / 2 + C.g.rotation.y, 0.7 - lever * 0.8);
        C.lidPivot.rotation.x = -lever * 0.2 + Math.sin(t * 40) * 0.004 * lever;
        glow.intensity = 0.6 + lever * 1.5; glow.color.copy(col);
      }
      // (the lid thrown off to the side, and down on the floor; the straw thrown up after it)
      if (t >= L0) {
        crow.visible = t < L0 + 0.25; if (crow.visible) crow.position.y -= 0.02;
        if (!lidOff) {
          lidOff = { from: new THREE.Vector3(), q: new THREE.Quaternion() }; C.lid.getWorldPosition(lidOff.from); C.lid.getWorldQuaternion(lidOff.q);
          scene.attach(C.lid); C.seamMat.opacity = 0;
        }
        const u = Math.min(1, (t - L0) / 0.7), land = new THREE.Vector3(-1.05, 0.025, 0.5);
        const p = lidOff.from.clone().lerp(land, ease(u)); p.y += Math.sin(Math.PI * u) * 0.55 * (1 - u * 0.4);
        if (u < 1) { C.lid.position.copy(p); C.lid.rotation.set(-0.35 + u * 0.35, -0.32 + u * 0.9, u * Math.PI * 0.02 + Math.sin(u * Math.PI) * 0.9); }
        else { C.lid.position.copy(land); C.lid.rotation.set(0, 0.58, 0); }
        if (u >= 1 && !done.lid) { done.lid = true; snd("crateLid", 0.7);
          for (const d of dust) { d.s.visible = true; d.t0 = t; d.s.position.copy(land).add(new THREE.Vector3((Math.random() - 0.5) * 1, 0.02, (Math.random() - 0.5) * 0.7)); d.v.set((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6); } }
        if (!done.straw && t >= L0 + 0.15) { done.straw = true; snd("crateStraw", 0.5, 0.05);
          for (let i = 0; i < C.strawAt.length; i++) if (i % 4 === 0) C.strawAt[i].v = new THREE.Vector3((Math.random() - 0.5) * 1.3, 1.0 + Math.random() * 1.4 * (1 + rarity * 0.12), (Math.random() - 0.5) * 1.1); }
        // (the light rising out of it)
        const g = easeOut((t - L0) / 0.8);
        glow.intensity = (1.6 + rarity * 0.9) * g * (0.92 + 0.08 * Math.sin(t * 6)); glow.color.copy(col);
        shaft.material.opacity = (rarity >= 2 ? 0.22 + rarity * 0.07 : rarity ? 0.16 : 0.08) * g * (0.85 + 0.15 * Math.sin(t * 3.1));
        shaft.scale.set(1 + 0.05 * Math.sin(t * 2), 1, 1 + 0.05 * Math.sin(t * 2));
        C.straws.material.emissive.copy(col).multiplyScalar(0.25 * g);
      }
      // (the straw in the air)
      { let moved = false;
        for (let i = 0; i < C.strawAt.length; i++) { const s = C.strawAt[i]; if (!s.v) continue; moved = true;
          s.v.y -= 9.8 * dt * 0.55; s.p.addScaledVector(s.v, dt); s.r.x += dt * 7; s.r.z += dt * 5;
          if (s.p.y < 0.01) { s.p.y = 0.01; s.v.multiplyScalar(0.3); s.v.y = 0; if (s.v.length() < 0.05) s.v = null; }
          C.dummy.position.copy(s.p); C.dummy.rotation.copy(s.r); C.dummy.scale.copy(s.sc); C.dummy.updateMatrix(); C.straws.setMatrixAt(i, C.dummy.matrix); }
        if (moved) C.straws.instanceMatrix.needsUpdate = true; }
      for (const d of dust) if (d.s.visible) { const a = t - d.t0; d.s.position.addScaledVector(d.v, dt); d.v.multiplyScalar(0.97); d.s.scale.setScalar(0.15 + a * 0.5); d.s.material.opacity = Math.max(0, 0.28 * (1 - a / 1.6)); if (a > 1.6) d.s.visible = false; }
      if (t >= REV && !done.card) { done.card = true; cardEl.classList.remove("hidden"); skipEl.remove(); ov.classList.add("open"); }
      if (t > REV) look.y = 0.45 + easeOut((t - REV) / 0.8) * 0.55;
      R.render(scene, cam);
    };
    frame();
  });
}
