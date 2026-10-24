// THE HAND BENCH — a probe script (tools/probe.js) that looks at every way you hold something, first person: from
// your eye, and turned about to be seen from the right, the left, below and above, close to the hand; and measures
// each hand on what it holds — how far each finger's joints lie from the line of the haft or grip (never inside it,
// never far off it), and whether the arm reached. Frames go to window.__benchDir/<item>_<view>.jpg; the numbers come
// back as JSON.
//
//   window.__benchDir = "/path/"; window.__benchOnly = ["pistol"]   (set by a wrapper before this runs)
const wait = ms => new Promise(r => setTimeout(r, ms));
const DIR = window.__benchDir || "/tmp/";
const snap = async n => { window.__wantShot = DIR + n + ".jpg"; for (let i = 0; i < 80 && window.__wantShot; i++) await wait(100); };
const errs = []; window.addEventListener("error", e => errs.push(String(e.message))); const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(" ").slice(0, 300)); oe(...a); };
const { G, input } = await import("./js/engine.js"); G.demoGate = null; G.noIntro = true;
const { THREE } = await import("./js/core.js");
const st = document.createElement("style"); st.textContent = "#dialog,#bark,#hint,#keys,#prompt,#hud,#minimap,#objective,#hotbar{display:none!important}"; document.head.appendChild(st);
await wait(2500); window.__play(13, "brother"); await wait(12000);
const P = G.player; P.pitch = -0.1;
const clear = () => { try { if (P.gun) P.showGun(false); if (P.bow) P.showBow(false); if (P.xbow) P.showXbow(false); if (P.axe) P.giveAxe && P.giveAxe(false); G.working = null; } catch (e) { errs.push("clear " + e.message); } };
// each hold: how to take it up, and which hand to look at
const ITEMS = {
  axe: [() => P.wield("axe"), "R"],
  sword: [() => P.wield("sword"), "R"],
  spear: [() => P.wield("spear"), "R"],
  pick: [() => P.wield("pick"), "R"],
  dagger: [() => P.wield("dagger"), "R"],
  musket: [() => { P.gunKind = "musket"; P.showGun(true); }, "L"],
  musket_prime: [() => { P.gunKind = "musket"; P.showGun(true); P.gunLoaded = false; P.gunReload = 6.5 - 0.5; }, "R"],
  musket_ram: [() => { P.gunKind = "musket"; P.showGun(true); P.gunLoaded = false; P.gunReload = 6.5 - 3.6; }, "R"],
  pistol: [() => { P.gunKind = "pistol"; P.showGun(true); }, "R"],
  pistol_prime: [() => { P.gunKind = "pistol"; P.showGun(true); P.gunLoaded = false; P.gunReload = 4.2 - 0.3; }, "L"],
  bow: [() => P.showBow(true), "L"],
  xbow: [() => P.showXbow(true), "R"],
  saw: [() => P.workFor("saw", 60), "R"],
  hammer: [() => P.workFor("hammer", 60), "R"],
  dig: [() => P.workFor("dig", 60), "R"],
  reap: [() => P.workFor("reap", 60), "R"],
  craft: [() => P.workFor("craft", 60), "R"],
  // (in motion, held still at a moment: the stroke half way, a gun at the eye)
  axe_swing: [() => { P.wield("axe"); P.swingT = 0.26; window.__benchHold = () => { P.swingT = 0.26; }; }, "R"],
  pick_swing: [() => { P.wield("pick"); P.swingT = 0.2; window.__benchHold = () => { P.swingT = 0.2; }; }, "L"],
  swim: [() => { const o = P.swimArms; P.swimArms = (dt) => { P.swimT = 0.3 / 0.55; o.call(P, dt, true, true); }; window.__benchUndo = () => { P.swimArms = o; o.call(P, 0, false); }; }, "R"],
  swim_sweep: [() => { const o = P.swimArms; P.swimArms = (dt) => { P.swimT = 0.6 / 0.55; o.call(P, dt, true, true); }; window.__benchUndo = () => { P.swimArms = o; o.call(P, 0, false); }; }, "R"],
  eat: [() => { G.working = { kind: "eat", until: G.time + 60, food: "bread" }; }, "R"],
  dish: [() => { G.working = { kind: "eat", until: G.time + 60, food: "dish" }; }, "R"],
  stir: [() => P.workFor("stir", 60), "R"],
  bow_draw: [() => { P.showBow(true); window.__benchHold = () => { P.draw = 1; }; }, "R"],
  musket_aim: [() => { P.gunKind = "musket"; P.showGun(true); window.__benchHold = () => { input.rdown = true; P.gunAim = 1; }; }, "L"],
  pistol_aim: [() => { P.gunKind = "pistol"; P.showGun(true); window.__benchHold = () => { input.rdown = true; P.gunAim = 1; }; }, "R"],
};
// the views: [name, turn about y, turn about x] — the hand brought to the middle of the frame, 40 cm off
const VIEWS = [["eye", null], ["right", -Math.PI / 2, 0], ["left", Math.PI / 2, 0], ["below", 0, -1.2], ["above", 0, 1.1]];
const out = {};
// (with window.__benchTips: a coloured bead at each fingertip — thumb magenta, fore red, middle green, ring blue, little
//  yellow — to tell them apart in the frames)
const tips = () => { if (!window.__benchTips || !P.fpa || P.fpa.__tips) return; P.fpa.__tips = true;
  const C = { thumb: 0xff00ff, index: 0xff0000, middle: 0x00ff00, ring: 0x0000ff, pinky: 0xffff00 };
  for (const s of ["R", "L"]) for (const [f, c] of Object.entries(C)) { const b = P.fpa[s].fingers[f][2].b, m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); m.renderOrder = 9; m.position.set(0, 0.02, 0); b.add(m); } };
const handIn = (s, vm) => { const A = P.fpa && P.fpa[s]; if (!A) return null; const p = new THREE.Vector3(); A.hand.getWorldPosition(p); return vm.worldToLocal(p); };
for (const [name, [take, side]] of Object.entries(ITEMS)) {
  if (window.__benchOnly && !window.__benchOnly.includes(name)) continue;
  clear(); await wait(300);
  try { take(); } catch (e) { errs.push(name + ": " + e.message); continue; }
  // (the loading drill frozen where it was set: its clock held)
  const hold = P.gunReload; const keep = setInterval(() => { if (hold > 0) P.gunReload = hold; window.__benchHold && window.__benchHold(); }, 5);
  await wait(900); tips(); await wait(100);
  // (with window.__benchMats: the arms' skin green, sleeve blue, cuff red — to see which is which)
  if (window.__benchMats && P.fpa && !P.fpa.__mats) { P.fpa.__mats = true; P.fpa.model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(/_2$/.test(o.name) ? 0xff0000 : /_1$/.test(o.name) ? 0x0000ff : 0x00ff00); o.material.sheen = 0; } }); }
  const A = P.fpa && P.fpa[side], m = { side, short: A && A.short != null ? +A.short.toFixed(3) : null, rootShown: !!(P.fpa && P.fpa.root.visible) };
  if (A && A.at) {
    const root = P.fpa.root; root.updateMatrixWorld(true);
    const dl = p => { const d = p.clone().sub(A.at); return +d.addScaledVector(A.along, -d.dot(A.along)).length().toFixed(3); };
    for (const f of ["thumb", "index", "middle", "ring", "pinky"]) m[f] = A.fingers[f].map(j => dl(root.worldToLocal(j.b.getWorldPosition(new THREE.Vector3()))));
    // (where along the grip each knuckle lies, toward the thumb's side: the forefinger's should be furthest that way,
    //  the little finger's least)
    m.along = Object.fromEntries(["thumb", "index", "pinky"].map(f => [f, +root.worldToLocal(A.fingers[f][0].b.getWorldPosition(new THREE.Vector3())).sub(A.at).dot(A.along).toFixed(3)]));
    if (A.trigger) { const tp = A.fingers.index[2].b; const p = root.worldToLocal(tp.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0).transformDirection(tp.matrixWorld).multiplyScalar(0.02))); m.indexToTrigger = +p.distanceTo(A.trigger).toFixed(3); m.atToTrigger = +A.at.distanceTo(A.trigger).toFixed(3); m.knuckleToTrigger = +root.worldToLocal(A.fingers.index[0].b.getWorldPosition(new THREE.Vector3())).distanceTo(A.trigger).toFixed(3); m.fingerLen = +A.fingers.index[0].b.getWorldPosition(new THREE.Vector3()).distanceTo(A.fingers.index[2].b.getWorldPosition(new THREE.Vector3())).toFixed(3); }
    m.r = A.r; m.inside = Object.entries(m).filter(([k, v]) => Array.isArray(v) && v.some(x => x < A.r + 0.006)).map(([k]) => k);
  }
  out[name] = m;
  for (const [vn, ry, rx] of VIEWS) {
    if (ry == null) { window.__vmView = null; await wait(150); await snap(name + "_" + vn); continue; }
    let pivot = null;
    window.__vmView = vm => {
      if (!pivot) { vm.updateMatrixWorld(true); pivot = handIn(side, vm); if (!pivot) return; }
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, "YXZ"));
      vm.quaternion.copy(q); vm.position.set(0, 0, -0.42).sub(pivot.clone().applyQuaternion(q));
    };
    await wait(200); await snap(name + "_" + vn);
  }
  window.__vmView = null; clearInterval(keep); window.__benchHold = null; input.rdown = false; if (window.__benchUndo) { window.__benchUndo(); window.__benchUndo = null; }
}
clear();
return JSON.stringify({ errs: errs.slice(0, 10), out });
