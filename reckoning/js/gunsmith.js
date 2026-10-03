// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE GUNSMITH. When the settlement has grown to fifty souls, word of it gets about, and a gunsmith comes up the road
// from Suhl to set up his bench in it. He makes muskets to order, one at a time, a quarter of an hour's work each,
// a hundred DM apiece: one for you, paid out of your own purse, or for the settlement's armoury, paid out of the
// treasury — and those go to the watch first, then to anyone who stands up in a raid.
import { THREE, Builder, MAT } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { makeMusket } from "./models.js";

export const GUNSMITH_AT = 50, GUN_PRICE = 100, GUN_SECS = 15 * 60;
const NAME = "Matthias";
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function gunsmithTick(town, dt) {
  const S = town.S;
  if (!town.techGates || G.mode !== "play") return;
  S.gunOrders ??= [];
  // he comes, once, when there are fifty of you (you and yours counted)
  if (!S.gunsmith && S.people.length + 2 >= GUNSMITH_AT && !UI.dialogOpen && !G.cine) arrive(town);
  if (!S.gunsmith) return;
  if (!town._gunBench || town._gunBench.w !== town.w) showBench(town);
  // the work: an order comes off the bench when its time is up
  const now = S.playSecs || 0;
  while (S.gunOrders.length && now >= S.gunOrders[0].ready) {
    const o = S.gunOrders.shift();
    if (o.who === "you") { S.gunForYou = (S.gunForYou || 0) + 1; UI.hint(`${NAME} has finished your musket. Collect it at his bench.`, 6); }
    else { S.muskets = (S.muskets || 0) + 1; UI.hint(`${NAME} has finished a musket for the armoury — ${S.muskets} there now. The watch take them first in a raid, then anyone who fights.`, 6); }
    AUDIO.clang && AUDIO.clang(0.5); town.persist();
  }
}

function arrive(town) {
  const S = town.S, w = town.w;
  // a free spot for the bench, not far from the fire
  let spot = null;
  const F = town.fireAt || { x: town.stackAt.x, z: town.stackAt.z };
  for (let r = 7; r < 40 && !spot; r += 1.5) for (let k = 0; k < 24 && !spot; k++) {
    const a = k / 24 * Math.PI * 2, x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, ry = a + Math.PI;
    if (town.fits("well", x, z, ry)) spot = { x, z, ry };
  }
  if (!spot) return;
  S.gunsmith = { name: NAME, ...spot };
  const r0 = w.road[w.road.length - 30];
  const p = { name: NAME, sex: "m", job: "gunsmith", seed: 777 };
  town.addPerson(p, r0.x, r0.z);
  town.persist();
  UI.news && UI.news({ title: "A gunsmith comes up the road", sub: `${NAME}, out of Suhl. Fifty souls, he says, is a town worth a gunsmith. He's setting up his bench — muskets made to order, ${GUN_PRICE} DM apiece.`, img: "event_war" });
  setTimeout(() => UI.bark && UI.bark(NAME, "Muskets, made to order. A quarter of an hour each, a hundred apiece. Come and see me at my bench.", 6), 3000);
}

// the bench: a heavy table with a vice, a barrel in it, a rack of stocks and barrels, and a little forge-pot
function showBench(town) {
  const S = town.S, w = town.w, gs = S.gunsmith;
  if (town._gunBench && town._gunBench.g) w.root.remove(town._gunBench.g);
  const g = new THREE.Group(), b = new Builder(), y = w.heightAt(gs.x, gs.z);
  b.box(2.0, 0.08, 0.8, 0, 0.88, 0, 0x6a4a30); for (const [sx, sz] of [[-0.9, -0.32], [0.9, -0.32], [-0.9, 0.32], [0.9, 0.32]]) b.box(0.09, 0.86, 0.09, sx, 0.43, sz, 0x5a3e28);
  b.box(0.16, 0.14, 0.12, 0.7, 1.0, 0, 0x3a3c40);                                            // (the vice)
  b.box(0.8, 1.6, 0.08, 0, 0.8, -0.55, 0x5a3e28); b.box(0.8, 0.06, 0.25, 0, 0.35, -0.46, 0x5a3e28);   // (the rack)
  b.add(new THREE.CylinderGeometry(0.22, 0.2, 0.45, 10), 0x4a4a4c, -1.4, 0.22, 0.2);         // (the forge-pot)
  b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), 0x8a2a0c, -1.4, 0.46, 0.2);
  g.add(b.build(MAT.rough));
  for (let i = 0; i < 4; i++) { const m = makeMusket(); m.position.set(-0.3 + i * 0.2, 0.4, -0.47); m.rotation.x = -0.12; g.add(m); }
  const lying = makeMusket(); lying.rotation.set(0, 0, Math.PI / 2); lying.position.set(0.1, 0.95, 0.05); g.add(lying);
  g.position.set(gs.x, y, gs.z); g.rotation.y = gs.ry; w.root.add(g);
  w.col.addCircle(gs.x, gs.z, 1.0, y + 1.2);
  const fx = gs.x + Math.sin(gs.ry) * 1.5, fz = gs.z + Math.cos(gs.ry) * 1.5;
  const it = w.addInteract({ x: fx, y: y + 1.1, z: fz, reach: 2.6, label: `${NAME}'s bench — order a musket`, use: () => openBench(town) });
  town._gunBench = { w, g, it, front: { x: fx, z: fz } };
}

function openBench(town) {
  const S = town.S, b = G.body, now = S.playSecs || 0;
  const mine = () => !!(b.tools && b.tools.musket), waitingMine = () => S.gunOrders.some(o => o.who === "you") || (S.gunForYou || 0) > 0;
  const next = () => Math.max(now, S.gunOrders.length ? S.gunOrders[S.gunOrders.length - 1].ready : now) + GUN_SECS;
  const order = who => { S.gunOrders.push({ who, ready: next() }); town.persist(); AUDIO.clang && AUDIO.clang(0.4); };
  const queue = () => S.gunOrders.length ? S.gunOrders.map((o, i) => `${o.who === "you" ? "yours" : "the armoury's"} ${i === 0 ? `in ${mmss(o.ready - (S.playSecs || 0))}` : `after that, in ${mmss(o.ready - (S.playSecs || 0))}`}`).join("; ") : "nothing on the bench";
  const offers = () => [
    { own: true, icon: "musket", label: "Collect your musket", note: "It's done: oiled, flinted, and yours.", get: "", can: () => (S.gunForYou || 0) > 0, done: () => !(S.gunForYou > 0) && mine(), doneText: " — you have it",
      do: () => { S.gunForYou--; b.tools.musket = 1; b.dirty = true; town.persist(); UI.hint("Your musket. Take it up from the bar at the bottom: right mouse to aim, click to fire — then it wants loading.", 6); } },
    { own: true, icon: "musket", label: "A musket for yourself", note: `Paid out of your own purse — it's yours. ${GUN_SECS / 60} minutes at the bench.`, get: `${GUN_PRICE} DM of yours`,
      can: () => (b.purse || 0) >= GUN_PRICE && !mine() && !waitingMine(), done: () => mine() || waitingMine(), doneText: mine() ? " — you have one" : " — on the bench",
      do: () => { b.purse -= GUN_PRICE; b.dirty = true; order("you"); } },
    { own: true, icon: "musket", label: "A musket for the settlement's armoury", note: `Paid out of the treasury. ${S.muskets || 0} in the armoury now; the watch take them first in a raid. ${GUN_SECS / 60} minutes each.`, get: `${GUN_PRICE} DM`,
      can: () => (S.coin || 0) >= GUN_PRICE, do: () => { S.coin -= GUN_PRICE; order("town"); } },
    { own: true, icon: "musket", label: `On the bench: ${queue()}`, note: "One at a time, each a quarter of an hour of play.", get: "", can: () => false },
  ];
  G.openTrade(`${NAME}, gunsmith`, () => `Your purse ${G.dm(b.purse || 0)} DM · the treasury ${G.dm(S.coin || 0)} DM`, offers(), () => { town.persist(); });
}
// (where he stands to work)
export const benchFront = town => town._gunBench && town._gunBench.front;
