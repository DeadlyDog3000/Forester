// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The main storyline, told the way the first Forester told its opening —
// Hamburg, 1683; the papers and the torches; the square at dawn; the marsh
// gate; the long road; the clearing — only this time you are there for it.
//
// Every chapter is an async script. `wait`, `until` and `say` run on game
// time, so pausing pauses the story, and starting a chapter over bumps a
// generation counter that makes every script from the old run fall silent.

import { THREE, clamp } from "./core.js";
import { G, Actor, setWorld, setAtmo, blendAtmo, input } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { Hamburg, SPOTS, ROUTES, HOME } from "./hamburg.js";
import { Woods, CLEARING, CABIN, STACK, BLOCK, FIRE, FORKS } from "./woods.js";
import { makeTorch, makeLantern, makeScroll, makeHalberd } from "./models.js";

/* global SFX */

// ---------------------------------------------------------------------------
//  who is who
// ---------------------------------------------------------------------------
export const LOOKS = {
  brother: { model: "brother", name: "Brother", coat: 0x4d5a3c, legs: 0x3a3028, hair: 0x5a3d25, skin: 0xe8c4a0, hat: "cap", hatColor: 0x5a4a38, vest: 0x8a7a5a, scale: 0.95, seed: 11 },
  sister: { model: "sister", name: "Sister", coat: 0x6a3b32, skirt: true, skirtColor: 0x4a3a50, apron: 0xe6dcc8, hair: 0x5a3d25, skin: 0xe8c4a0, longHair: true, scale: 0.93, seed: 12 },
};
const FATHER = { model: "father", name: "Father", coat: 0x2e2a34, vest: 0x7a3a2a, legs: 0x2a2626, hair: 0x5a4a3c, beard: 0x5e5248, skin: 0xd9ab84, collar: 0xf0ebe0, seed: 21 };
const MAGISTRATE = { model: "magistrate", name: "The magistrate", coat: 0x18181c, legs: 0x18181c, hair: 0xd8d4cc, longHair: true, hat: "hat", collar: 0xffffff, chain: true, beard: 0xb8b4ac, seed: 31 };
const GUARD = s => ({ model: "watchman", name: "Watchman", coat: 0x7a2a26, legs: 0x2a2a30, vest: 0xc8b890, hat: "helmet", sash: 0xe0d8c0, seed: s });
const JAKOB = { model: "jakob", name: "Jakob", coat: 0x5a4a3a, legs: 0x3a3028, hair: 0x9a9a9a, hat: "cap", hatColor: 0x3a3a40, beard: 0xa8a8a8, seed: 41 };
const ALBERS = { model: "albers", name: "Frau Albers", coat: 0x5a4a3a, skirt: true, skirtColor: 0x3e4a5c, apron: 0xf0ebe0, hat: "bonnet", hair: 0x8a6a3c, seed: 51 };

export const P = {
  get you() { return G.who === "brother" ? "Brother" : "Sister"; },
  get sib() { return G.who === "brother" ? "Sister" : "Brother"; },
  get sibLower() { return G.who === "brother" ? "sister" : "brother"; },
  get child() { return G.who === "brother" ? "boy" : "girl"; },
  get sibThey() { return G.who === "brother" ? "she" : "he"; },
  get sibThem() { return G.who === "brother" ? "her" : "him"; },
  get sibTheir() { return G.who === "brother" ? "her" : "his"; },
};
const YOU = () => `${P.you} (you)`;

// Every capture says something different — nobody wants to read the same
// line twice while they try the same lane a third time.
const CAUGHT = [
  "A hand on your collar. The watch has you.",
  "\"Got one!\" The lantern swings up into your face.",
  "Too slow. The halberd shaft comes down across your path.",
  "They know your face now. Every one of them.",
  "Caught — and somewhere, your {sib} is still waiting at the gate.",
  "The watchman's grip is iron. Father's name is spat in your ear.",
  "A whistle, boots on stone, and nowhere left to run.",
  "\"The merchant's brat!\" Half the lane turns to look.",
  "They drag you back toward the square. Not like this.",
  "You were seen. In this city, being seen is enough.",
];
const TIPS_CHASE = ["Hold Shift and make for the narrow alley west of the square.", "Don't stop to look back. The alley is on the left, past the cart.", "Run west along the street, then into the gap between the houses."];
const TIPS_STEALTH = ["Crouch with C, and wait for the lantern to swing away.", "Keep a crate between you and the watch. Nobody sees through wood.", "Lean round a corner with Q and E before you step out.", "Watch the eye at the top of the screen — when it opens, get out of sight.", "The watch at the gate looks west and east in turn. Move when he looks away.", "Walking is quiet. Running is heard."];
const QUOTES = [
  ["The city is good to those it loves.", "Father"],
  ["A good name is rather to be chosen than great riches.", "Proverbs 22:1"],
  ["It is not for me to show you anything, merchant. It is for me to read.", "The magistrate"],
  ["The wicked flee when no man pursueth: but the righteous are bold as a lion.", "Proverbs 28:1"],
  ["Stadtluft macht frei. — City air makes you free.", "a Hanseatic saying"],
  ["Take your {sib} and go, and do not come looking for me.", "Father"],
  ["Keep low. Keep out of the lantern light.", "{Sib}"],
  ["Whoso diggeth a pit shall fall therein.", "Proverbs 26:27"],
  ["We go. We see. And then we decide.", "{Sib}"],
  ["Hamburg stands open to all who trade honestly.", "words over the Börse door"],
];
// Every capture: a red screen, CAUGHT, a line of what happened, and slowly, a quote.
async function caughtScreen(tips) {
  let n = 0; try { n = +localStorage.getItem("reckoning.caught") || 0; localStorage.setItem("reckoning.caught", n + 1); } catch (e) { n = (G._caught = (G._caught || 0) + 1); }
  const fill = t => t.replace("{sib}", P.sibLower).replace("{Sib}", P.sib);
  const [q, by] = QUOTES[n % QUOTES.length];
  const g = GEN;
  await UI.caught("Caught", fill(CAUGHT[n % CAUGHT.length]), `“${fill(q)}”`, "— " + fill(by), tips[n % tips.length]);
  if (g !== GEN) throw ABORT;
}

// ---------------------------------------------------------------------------
//  script plumbing
// ---------------------------------------------------------------------------
let GEN = 0;
const ABORT = new Error("abort");
function onFrame(f) { G.onFrame.push(f); return () => { const i = G.onFrame.indexOf(f); if (i >= 0) G.onFrame.splice(i, 1); }; }
function wait(s) {
  const g = GEN;
  return new Promise((res, rej) => {
    let t = 0;
    const off = onFrame(dt => { if (g !== GEN) { off(); rej(ABORT); return; } t += dt; if (t >= s) { off(); res(); } });
  });
}
function until(cond) {
  const g = GEN;
  return new Promise((res, rej) => {
    const off = onFrame(() => { if (g !== GEN) { off(); rej(ABORT); return; } if (cond()) { off(); res(); } });
  });
}
async function say(name, text) {
  const g = GEN;
  await UI.say(name, text);
  if (g !== GEN) throw ABORT;
}
// said while you keep walking
function bark(name, text, secs) { return UI.bark(name, text, secs); }
async function fade(to, s = 1) { const g = GEN; await UI.fade(to, s); if (g !== GEN) throw ABORT; }
async function narrate(t, s) { const g = GEN; await UI.narrate(t, s); if (g !== GEN) throw ABORT; }
async function card(k, t, s) { const g = GEN; await UI.card(k, t, s); if (g !== GEN) throw ABORT; }
function look(target, speed = 2.5) { G.cine = target ? { look: target.isVector3 ? target : target.headPos(), speed } : null; }
function lookAt(actor, speed) { G.cine = { speed: speed ?? 2.5, get look() { return actor.headPos(); } }; }
function mark(m) { G.marker = m ? (m.person ? { actor: m } : Array.isArray(m) ? { x: m[0], z: m[1], y: m[2] ?? 1.6 } : m) : null; }
function spawn(opts, x, z, yaw = 0) { const a = new Actor(opts, x, z, yaw); if (opts === LOOKS.brother || opts === LOOKS.sister) a.isSibling = true; return a; }

// ---------------------------------------------------------------------------
//  saving
// ---------------------------------------------------------------------------
const SAVE_KEY = "reckoning.save.v1";
export function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; }
}
export function writeSave(patch) {
  const s = { ...(loadSave() || {}), ...patch, at: Date.now() };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  return s;
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

// ---------------------------------------------------------------------------
//  chapters
// ---------------------------------------------------------------------------
export const CHAPTERS = [
  { n: 1, title: "The House by the Harbour", kicker: "Hamburg, 1683", world: "hamburg", run: ch1 },
  { n: 2, title: "Papers and Torches", kicker: "That night", world: "hamburg", run: ch2 },
  { n: 3, title: "The Square at Dawn", kicker: "The next morning", world: "hamburg", run: ch3 },
  { n: 4, title: "The Marsh Gate", kicker: "Minutes later", world: "hamburg", run: ch4 },
  { n: 5, title: "Far, Far Away", kicker: "The road north-east", world: "woods", run: ch5 },
  { n: 6, title: "The Clearing", kicker: "The old woods", world: "woods", run: ch6 },
];

// what is in your pockets in each chapter — the inventory (T) lists it
const PACK = {
  1: [{ icon: "key", name: "The house key", note: "Iron, warm from your pocket. The house by the harbour." }],
  2: [{ icon: "key", name: "The house key", note: "Iron, warm from your pocket. The house by the harbour." }],
  3: [{ icon: "key", name: "The house key", note: "You kept it. You do not know why." }],
  4: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more." }],
  5: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more." }, { icon: "blackberries", n: 12, name: "Blackberries", note: "A handful, squashed. Three days of them." }],
  6: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more." }, { icon: "blackberries", n: 12, name: "Blackberries", note: "A handful, squashed. Three days of them." }],
};

export async function startChapter(n, opts = {}) {
  GEN++;
  G.onFrame.length = 0;
  UI.closeDialog(); UI.clearBark(); UI.objective(null); UI.prompt(null); UI.carry(null); UI.eye(0); UI.hold(0);
  G.cine = null; G.lockMove = false; G.marker = null; G.onSwing = null; G.forceThird = false; G.stamina = undefined; G.sprintSpeed = undefined;
  G.bugs.setKind(null);
  AUDIO.murmur(false); AUDIO.water(false); AUDIO.wind(false);
  SFX.fireLoop(false); SFX.insectLoop(false);
  const ch = CHAPTERS[n - 1];
  UI.fadeNow(1);
  // a fresh map for every chapter: whatever the last one moved stays where it was put
  const w = ch.world === "hamburg" ? new Hamburg() : new Woods();
  setWorld(w);
  const pl = G.player;
  pl.giveAxe(false); pl.crouched = false; pl.seated = false; pl.frozen = false; pl.carryN = 0;
  const save = loadSave() || {};
  writeSave({ who: G.who, chapter: n, unlocked: Math.max(save.unlocked || 1, n) });
  G.chapter = n;
  G.pack = (PACK[n] || []).map(i => ({ ...i })); G.camp = null;
  try { await ch.run(w, opts); }
  catch (e) { if (e !== ABORT) console.error(e); }
}
export function currentGen() { return GEN; }

// A townsperson who walks a loop until the chapter ends.
function wanderer(route, seed, speed = 1.2) {
  const o = seed % 3 === 0
    ? { model: "townswoman", skirt: true, apron: seed % 2 ? 0xf0ebe0 : undefined, hat: seed % 2 ? "bonnet" : null, seed }
    : { model: "townsman", hat: ["tricorn", "cap", null, "hat"][seed % 4], seed };
  const a = spawn(o, route[0][0], route[0][1]);
  const k = (seed * 0.37) % 1;
  // start somewhere along the loop, not all at the first corner
  const [p0, p1] = [route[0], route[1]];
  a.place(p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k);
  const g = GEN;
  (async () => { let i = 1; while (g === GEN && a.root.parent) { await a.walk([route[i % route.length]], speed); i++; } })();
  return a;
}

// ===========================================================================
//  I. THE HOUSE BY THE HARBOUR
// ===========================================================================
async function ch1(w) {
  setAtmo("evening"); w.setChapter(1); G.bugs.setKind("moths");
  AUDIO.music("home"); AUDIO.water(true);
  const pl = G.player;
  pl.place(15.9, -10.8, Math.PI);   // the bedroom doorway, facing the hall
  const father = spawn(FATHER, 11, -14.35, 0); father.person.setPose("hold");
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], 9.7, -6.9, -Math.PI / 2); sib.person.setPose("hold");
  const jakob = spawn(JAKOB, SPOTS.jakob[0], SPOTS.jakob[1], -Math.PI / 2);
  jakob.person.setPose("armsCrossed");
  const albers = spawn(ALBERS, 9.5, 1.3, Math.PI);
  albers.person.setPose("hold");
  ROUTES.forEach((r, i) => wanderer(r, 100 + i * 7, 1.1 + (i % 3) * 0.15));
  w.setDoor(false, true);

  UI.fadeNow(1);
  await wait(0.2);
  const title = card("Hamburg, 1683", "I. The House by the Harbour", 3.4);
  await wait(1.5);
  fade(0, 2.5);
  await title;
  UI.objective("Speak to Father in the counting room");
  mark(father);

  let talked = false;
  const fIt = w.addInteract({ x: father.pos.x, y: 1.5, z: father.pos.z + 0.4, reach: 2.6, label: "Talk to Father", use: () => { talked = true; } });
  sib.lookAtPlayer(true);
  await until(() => talked);
  w.removeInteract(fIt);
  G.lockMove = true; lookAt(father); father.facePlayer(); father.person.setPose("idle"); father.lookAtPlayer(true);
  mark(null); UI.objective(null);
  await say("Father", "There you are. Come, look at this — the Baltic grain came in whole. Every sack dry, every seal unbroken. Your grandfather would have wept.");
  await say("Father", `Take the ledger down to Jakob at the warehouse. He wants the tally signed before the Lübeck master sails on the tide.`);
  await say(YOU(), "Now? Supper's nearly on.");
  await say("Father", `Then walk quickly. Straight there, straight back. And don't let Jakob start on the weather, or you'll be home by Michaelmas.`);
  SFX.pickup();
  UI.carry("Father's ledger");
  G.lockMove = false; look(null); father.stopFacing(); father.faceTo(11, -10); father.person.setPose("hold");
  UI.objective("Take the ledger to Jakob at the harbour warehouse");
  mark(jakob);
  // while you are still indoors the marker shows the way out
  const doorMark = onFrame(() => { if (w.inHome()) mark({ x: 13, z: -3.1, y: 1.6, hideWithin: 1 }); else if (!G.marker || !G.marker.actor) mark(jakob); });
  UI.hint("Press F to open the door. WASD to walk, Shift to run, Q and E to lean.", 6);

  w.addTrigger({ x0: 9, x1: 17, z0: -5.5, z1: -3.3, fn: () => bark(P.sib, `Don't let him keep you. And bring back the good news before Father eats it all.`) });
  w.addTrigger({ x: 10, z: 1, r: 4, fn: () => { albers.facePlayer(); albers.lookAtPlayer(true); bark("Frau Albers", `Evening! Tell your father to save me two of the good rye tomorrow — the dark one, mind, not the white.`); } });
  w.addTrigger({ x: 0, z: -30, r: 6, fn: () => bark("A dock hand", "Mind yourself — rope! ...Ah, it's the merchant's. Evening.") });

  let delivered = false;
  void doorMark;
  const jIt = w.addInteract({ x: jakob.pos.x, y: 1.5, z: jakob.pos.z, reach: 2.6, label: "Give Jakob the ledger", use: () => { delivered = true; } });
  await until(() => delivered);
  doorMark();
  w.removeInteract(jIt);
  G.lockMove = true; lookAt(jakob); jakob.facePlayer(); jakob.lookAtPlayer(true); jakob.person.setPose("hold");
  mark(null); UI.objective(null);
  await say("Jakob", `Ah — the merchant's ${P.child}! Give it here, give it here. Hm. Hm. Two hundred and twelve, and not a sack short. He's a marvel, your father.`);
  UI.carry(null); SFX.pickup();
  jakob.person.setPose("idle");
  await say("Jakob", "Tell him the Riga ship's been sighted off Cuxhaven. Tomorrow, if the wind holds. We'll need every back on this quay.");
  await say(YOU(), "He'll be pleased.");
  await say("Jakob", "He'll be insufferable. Go on, then — your supper's getting cold, and I can smell the rain coming.");
  G.lockMove = false; look(null); jakob.stopFacing(); jakob.person.setPose("armsCrossed");
  UI.objective("Go home for supper");
  mark([13, -2.2]);
  // the evening wears on as you walk back
  let t = 0;
  onFrame(dt => { t = Math.min(1, t + dt / 70); blendAtmo("evening", "dusk", t); });

  // home: the table
  let sat = false;
  const tIt = w.addInteract({ x: SPOTS.seatYou[0], y: 0.9, z: SPOTS.seatYou[1] - 0.4, reach: 2.4, label: "Sit down to supper", can: () => w.inHome(), use: () => { sat = true; } });
  await until(() => w.inHome());
  father.place(12.7, -7.25, 0); father.person.sitting = 1; father.person.setPose("sit");
  sib.place(SPOTS.seatSib[0], SPOTS.seatSib[1] + 0.05, Math.PI); sib.person.sitting = 1; sib.person.setPose("sit");
  mark([12.2, -5.8, 1.1]);
  UI.objective("Sit down to supper");
  await until(() => sat);
  w.removeInteract(tIt);
  mark(null); UI.objective(null);
  G.lockMove = true; pl.seated = true;
  await fade(1, 0.6);
  pl.place(SPOTS.seatYou[0], SPOTS.seatYou[1] - 0.05, 0); pl.pitch = -0.1;
  lookAt(father, 4);
  await fade(0, 0.8);
  await wait(0.6);
  await say(YOU(), "Jakob signed the tally. Not a sack short. And the Riga ship's been sighted — tomorrow, if the wind holds.");
  await say("Father", "Tomorrow! Then we'll be rich men by Friday, and poor again by Sunday, once the Council has had its tithe.");
  lookAt(sib, 3);
  await say(P.sib, "Frau Albers wants two of the dark rye. She says the white is for people with no teeth.");
  lookAt(father, 3);
  await say("Father", "Frau Albers has four teeth, and opinions on all of them.");
  await wait(1.2);
  await say("Father", "Your grandfather came into this city with a handcart. Now half the harbour eats our bread. The city is good to those it loves — remember that. It has loved this house a long time.");
  await say("Father", "Bed, both of you. The Riga ship comes in tomorrow, and I'll need every pair of hands I have.");
  await fade(1, 2.2);
  pl.seated = false; look(null);
  AUDIO.music(null);
  await narrate("That night, the knocking came.", 3.2);
  return startChapter(2);
}

// ===========================================================================
//  II. PAPERS AND TORCHES
// ===========================================================================
async function ch2(w) {
  setAtmo("night"); w.setChapter(2); G.bugs.setKind("moths");
  AUDIO.music("dread");
  const pl = G.player;
  pl.place(16.9, -10.9, Math.PI);
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], 15.6, -9.4, Math.PI);
  const father = spawn(FATHER, 11, -13.2, 0);
  w.setDoor(false, true);
  // outside: the magistrate and four of the watch, two with torches
  const mag = spawn(MAGISTRATE, 13, 0.2, Math.PI);
  const guards = [spawn(GUARD(61), 11.8, 1.2, Math.PI), spawn(GUARD(62), 14.2, 1.2, Math.PI), spawn(GUARD(63), 10.6, 2.4, Math.PI), spawn(GUARD(64), 15.4, 2.4, Math.PI)];
  guards.forEach((g, i) => {
    if (i >= 2) { const t = g.hold(makeTorch(false)); g.person.setPose("torch"); const L = w.pool[3 + (i - 2)]; L.intensity = 7; L.distance = 16; L.color.set(0xff8a3a); t.userData.flameObj.add(L); t.userData.flameObj.userData.flame.light = L; t.userData.flameObj.userData.flame.base = 7; w.flames.push(t.userData.flameObj); }
    else g.hold(makeHalberd());
  });
  const scroll = mag.hold(makeScroll()); scroll.position.set(-0.1, 0.05, 0.12); scroll.rotation.set(-1.3, 0, 0);

  const knockLoop = (() => { let t = 1.4; return onFrame(dt => { t -= dt; if (t <= 0) { t = 4.5; AUDIO.knock(3, 1); } }); })();
  await wait(0.3);
  const c = card("That night", "II. Papers and Torches", 3.2);
  await wait(1.2); fade(0, 2.2); await c;
  G.lockMove = true; lookAt(sib, 3); sib.facePlayer(); sib.lookAtPlayer(true);
  await say(P.sib, "Wake up. Wake up — there are men at the door. Lots of them. With torches.");
  await say(P.sib, "Father's gone down. Come on.");
  G.lockMove = false; look(null);
  sib.walk([[15.6, -8.7], [15.4, -7.8]], 1.6);
  father.walk([[11.1, -8.6], [11.0, -7.6], [10.9, -4.8], [12.4, -4.3], [13, -4.2]], 1.3);
  UI.objective("Go down to the hall");
  mark([13, -6, 1.4]);
  await until(() => pl.pos.z > -8.6);
  knockLoop();
  mark(null); UI.objective(null);
  G.lockMove = true;
  lookAt(father, 3);
  await until(() => !father.path.length);
  await wait(0.5);
  w.setDoor(true);
  await wait(0.8);
  lookAt(mag, 2.5);
  mag.walk([[13, -2.6], [13.3, -3.9]], 1.1);
  guards[0].walk([[12.6, -2.4], [12.3, -3.7]], 1.1);
  guards[1].walk([[13.4, -2.4], [14.3, -3.8]], 1.1);
  father.walk([[12.4, -4.9]], 1);
  await wait(2.6);
  father.faceTo(13.3, -3.9); mag.faceTo(12.4, -4.9);
  mag.person.setPose("writ");
  await say("The magistrate", "By order of the Honourable Council of the Free and Hanseatic City of Hamburg —");
  await say("The magistrate", "— the grain merchant of this house is taken into the custody of the city, accused of malicious affairs against its peace and its commerce.");
  await say("Father", "Malicious affairs. What affairs? Name one. Show me one false line in my books and I will walk to the cells myself.");
  await say(null, "The magistrate would not meet our eyes.");
  await say("The magistrate", "It is not for me to show you anything, merchant. It is for me to read.");
  mag.person.setPose("idle");
  await say("Watchman", "Come along, now. Don't make it hard in front of the children.");
  guards[0].walk([[11.9, -4.5]], 1); guards[1].walk([[13.3, -4.6]], 1);
  lookAt(father, 2.5);
  father.facePlayer(); father.lookAtPlayer(true);
  await say("Father", `Stay by the hearth, both of you. Do nothing foolish. I will be home by the Sabbath.`);
  // he crosses the room to you, round the table, before they can stop him
  const side = pl.pos.x < 12.7 ? 10.9 : 14.6;
  const toYou = pl.pos.z > -5.6 ? [[pl.pos.x + 0.7, pl.pos.z]] : [[side, -4.9], [side, clamp(pl.pos.z, -8.6, -4.9)], [pl.pos.x + (side < 12 ? -0.7 : 0.7), pl.pos.z]];
  await father.walk(toYou, 1.3);
  father.facePlayer();
  await say(null, "He crossed the room and took us both by the shoulders, and put his mouth by my ear.");
  await say("Father", `If I am not — the marsh gate. The small door in the wall beside it. Take your ${P.sibLower} and go, and do not come looking for me.`);
  await say("Watchman", "That's enough. Hands.");
  father.person.setPose("bound");
  const out = [[13, -4.2], [13, -1.0], [13, 3.5], [0, 3.5], [-12, 1]];
  await father.walk([...toYou.slice(0, -1).reverse(), [12.4, -4.6]], 1.1);
  mag.walk(out.slice(1), 1.1);
  father.walk(out, 1.1);
  guards[0].walk(out, 1.1); guards[1].walk(out, 1.1);
  guards[2].walk(out.slice(2), 1.1); guards[3].walk(out.slice(2), 1.1);
  lookAt(father, 1.8);
  await wait(4);
  w.setDoor(false);
  look(null);
  await wait(1.2);
  [father, mag, ...guards].forEach(a => a.remove());
  w.pool[3].intensity = 0; w.pool[4].intensity = 0;
  sib.walk([[13.2, -6.3]], 1.2);
  await wait(1.4);
  lookAt(sib, 2.5); sib.facePlayer();
  await say(P.sib, "They'll come for us too. Won't they.");
  await say(YOU(), "He said the Sabbath.");
  await say(P.sib, "He said it for us.");
  await wait(0.8);
  await say(P.sib, "In the morning they'll take him to the square. Everyone will be there. We go. We see. And then we decide.");
  G.lockMove = false; look(null);
  await fade(1, 2.4);
  AUDIO.music(null);
  await narrate("No one in the house slept. At first light, the bell of St. Nikolai began to toll.", 4);
  return startChapter(3);
}

// ===========================================================================
//  III. THE SQUARE AT DAWN
// ===========================================================================
async function ch3(w, opts) {
  setAtmo("dawn"); w.setChapter(3); G.bugs.setKind("flies");
  AUDIO.music("grief");
  const pl = G.player;
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], 12, -1.2, Math.PI / 2);
  // the crowd round the scaffold
  const crowd = [];
  const r = (i, k) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI * 0.95 + r(i, 1) * Math.PI * 0.9, d = 5.2 + r(i, 2) * 7.5;
    const x = Math.cos(a) * d * 1.1, z = 45 + Math.sin(a) * d;
    if (z < 34.5 || Math.abs(x) > 14) continue;
    const o = i % 3 === 0 ? { model: "townswoman", skirt: true, apron: 0xe8e0d0, hat: i % 2 ? "bonnet" : null, seed: 300 + i } : { model: "townsman", hat: ["tricorn", "cap", null, "hat"][i % 4], seed: 300 + i };
    const c = spawn(o, x, z); c.faceTo(0, 45); if (i % 5 === 0) c.person.setPose("armsCrossed");
    crowd.push(c);
  }
  // people still on their way
  for (const [x, z, s] of [[-4, -12, 401], [2, -3, 402], [-1, 12, 403], [1.5, 20, 404], [-20, 1, 405]]) {
    const c = spawn({ seed: s, hat: s % 2 ? "tricorn" : null, skirt: s % 3 === 0 }, x, z);
    c.walk([[0, x < -10 ? 0 : z], [x * 0.3, 33 + (s % 3)]], 1.25).then(() => c.faceTo(0, 45));
    crowd.push(c);
  }
  const albers = spawn(ALBERS, 6, 1.5, -Math.PI / 2);
  const onScaffold = [];
  let father, mag;
  if (!opts.chase) {
    father = spawn(FATHER, 1.2, 43.2, 0); father.yOff = 1.92; father.person.setPose("bound");
    mag = spawn(MAGISTRATE, -1.6, 44.6, 0); mag.yOff = 1.92; const sc = mag.hold(makeScroll()); sc.position.set(-0.1, 0.05, 0.12); sc.rotation.set(-1.3, 0, 0);
    const hood = spawn({ name: "", coat: 0x1a1414, legs: 0x1a1414, hat: "cap", hatColor: 0x121010, seed: 71 }, 1.8, 46.5, 0); hood.yOff = 1.92;
    const g1 = spawn(GUARD(72), -2.4, 42.6, 0); g1.yOff = 1.92; g1.hold(makeHalberd());
    const g2 = spawn(GUARD(73), 2.6, 42.3, 0); g2.yOff = 1.92; g2.hold(makeHalberd());
    onScaffold.push(father, mag, hood, g1, g2);
    onScaffold.forEach(a => { a.faceTo(0, 30); a.yaw = a.targetYaw; a.sync(); });
  }
  const bell = onFrame((() => { let t = 0; return dt => { t -= dt; if (t <= 0) { t = 5.5; AUDIO.bell(0.9); } }; })());

  if (!opts.chase) {
    pl.place(13, -1.4, Math.PI / 2);
    await wait(0.3);
    const c = card("The next morning", "III. The Square at Dawn", 3.2);
    await wait(1.2); fade(0, 2.4); await c;
    sib.followPlayer(2.0);
    UI.objective("Go to the square");
    mark(SPOTS.crowdBack);
    w.addTrigger({ x: 6, z: 1.5, r: 4, fn: () => { albers.faceTo(12, 1.5); bark(null, "Frau Albers sees you. She looks down at her shoes, and turns her back."); } });
    w.addTrigger({ x: 0, z: 18, r: 5, fn: () => bark(P.sib, "Stay close to me. Whatever happens.") });
    w.addTrigger({ x0: -15, x1: 15, z0: 22, z1: 29, fn: () => AUDIO.murmur(true, 1) });
    await until(() => pl.pos.z > 30.5 && Math.abs(pl.pos.x) < 15);
    mark(null); UI.objective(null);
    G.lockMove = true;
    sib.stopFollow(); sib.walk([[pl.pos.x + 0.9, pl.pos.z + 0.3]], 1.4);
    look(new THREE.Vector3(0, 3.4, 44.5), 1.6);
    await wait(2.2);
    AUDIO.murmur(false);
    mag.person.setPose("writ");
    AUDIO.drumRoll(3.5, 0.45);
    await wait(3.6);
    await say("The magistrate", "— found guilty of malicious affairs against the city, and his name struck from its rolls, and from its books, and from the mouths of its people. Let it not be spoken again.");
    mag.person.setPose("idle");
    father.lookAtPlayer(true);
    await say(null, "Father looked out over the crowd. I think he was looking for us. I think he found us.");
    lookAt(sib, 3.2); sib.facePlayer(); sib.lookAtPlayer(true);
    await say(P.sib, "Don't look. Look at me. Look at me.");
    AUDIO.drumRoll(2.4, 0.6);
    await wait(1.6);
    await fade(1, 1.2);
    bell();
    await wait(0.4);
    AUDIO.bell(1.2, 0.94);
    await wait(2.5);
    await narrate("They took Father to the square at dawn. The crowd that had bought our bread watched in silence.", 5.5);
    onScaffold.forEach(a => a.remove());
    // the crowd breaks up
    crowd.forEach((c, i) => { if (i % 2) c.walk([[c.pos.x * 1.8 + (i % 3 - 1) * 5, 52 - (i % 5)]], 0.9); else c.person.setPose("grieve"); });
    look(new THREE.Vector3(0, 2, 44), 2);
    await fade(0, 1.6);
    AUDIO.murmur(true, 0.6);
    await wait(1.4);
  }
  // ---- the chase ----
  G.lockMove = true;
  const cg1 = spawn(GUARD(81), -1.2, 39.4, Math.PI), cg2 = spawn(GUARD(82), 1.6, 39.8, Math.PI);
  cg1.hold(makeHalberd()); cg2.hold(makeHalberd());
  // and one already in the street you must run down, who will try to cut you off
  const cg3 = spawn(GUARD(83), -21, 40.2, Math.PI / 2); cg3.hold(makeHalberd());
  if (opts.chase) {
    pl.place(-2.5, 32.5, Math.PI * 0.62);
    sib.place(-1.4, 32.2, Math.PI);
    crowd.forEach((c, i) => { if (i % 2) c.place(c.pos.x * 1.8, 52 - (i % 5)); });
    fade(0, 1);
  }
  look(cg1, 3);
  cg1.person.setPose("point");
  AUDIO.shout();
  await say("Watchman", "Those two — there! The merchant's brats! Take them!");
  cg1.person.setPose("idle");
  lookAt(sib, 5);
  await say(P.sib, "Run!");
  look(null);
  G.lockMove = false;
  AUDIO.music("flight"); AUDIO.murmur(false);
  AUDIO.shout();
  bell();
  UI.objective("Run — lose them in the lanes to the west");
  mark(SPOTS.alley);
  UI.hint("Hold Shift to run — but your breath won't last. Dodge the watchman in the street.", 4);
  sib.followPlayer(1.6);
  G.sprintSpeed = 6.2;
  G.stamina = 1;                 // running costs breath now
  // they come on, around what is in their way, faster the longer it goes
  const chasers = [cg1, cg2, cg3];
  let caught = false, grace = 0.6, elapsed = 0, cutOff = false;
  const chase = onFrame(dt => {
    grace -= dt; elapsed += dt;
    for (const g of chasers) {
      if (grace > 0) continue;
      const dx = pl.pos.x - g.pos.x, dz = pl.pos.z - g.pos.z, d = Math.hypot(dx, dz);
      let spd = Math.min(5.9, 5.0 + elapsed * 0.08);
      let tx = dx, tz = dz;
      if (g === cg3) {
        // he waits in the street until you come, then goes for where you are heading
        if (!cutOff && d > 16) { g.targetYaw = Math.atan2(dx, dz); continue; }
        if (!cutOff) { cutOff = true; AUDIO.shout(); bark("Watchman", "Stop! Stop there!", 1.6); }
        tx = dx + pl.vel.x * 0.7; tz = dz + pl.vel.z * 0.7;
        spd = 4.9;
      }
      const l = Math.hypot(tx, tz) || 1;
      g.pos.x += tx / l * spd * dt; g.pos.z += tz / l * spd * dt;
      w.col.resolve(g.pos, 0.35, 0.3, 1.6);
      g.targetYaw = Math.atan2(dx, dz); g.forcedSpeed = spd;
      if (d < 1.15) caught = true;
    }
  });
  const ok = await Promise.race([
    until(() => pl.pos.x < -22 && pl.pos.z > 43.2 && pl.pos.z < 47).then(() => true),
    until(() => caught).then(() => false),
  ]);
  chase();
  G.stamina = undefined;
  if (!ok) {
    G.lockMove = true;
    AUDIO.shout();
    await caughtScreen(TIPS_CHASE);
    return startChapter(3, { chase: true });
  }
  mark(null);
  G.sprintSpeed = undefined;
  await fade(1, 0.7);
  return startChapter(4, { fromChase: true });
}

// ===========================================================================
//  IV. THE MARSH GATE
// ===========================================================================
class Watchman {
  constructor(w, seed, route, opts = {}) {
    this.w = w;
    this.a = spawn(GUARD(seed), route[0][0], route[0][1], opts.yaw ?? 0);
    this.route = route; this.i = 0; this.waitT = opts.wait ?? 2; this.pause = 0;
    this.speed = opts.speed ?? 1.05;
    this.sweep = opts.sweep || 0; this.baseYaw = opts.yaw ?? 0; this.t = Math.random() * 10;
    this.sus = 0; this.said = false;
    const lan = makeLantern(false);
    this.a.hold(lan); this.a.person.setPose("lantern");
    if (opts.light) { const L = opts.light; L.intensity = 4; L.distance = 11; L.color.set(0xffc27a); L.position.set(0, -0.1, 0); lan.add(L); }
    this.a.onUpdate = dt => this.think(dt);
    if (route.length === 1) { this.a.yaw = this.a.targetYaw = this.baseYaw; }
  }
  think(dt) {
    const a = this.a, pl = G.player;
    this.t += dt;
    // where they are going
    if (this.sus > 0.35) {
      a.path = [];
      a.targetYaw = Math.atan2(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z);
    } else if (this.route.length > 1) {
      if (!a.path.length) {
        if (this.pause > 0) { this.pause -= dt; }
        else { this.i = (this.i + 1) % this.route.length; a.walk([this.route[this.i]], this.speed); this.pause = this.waitT; }
      }
    } else if (this.sweep) {
      a.targetYaw = this.baseYaw + Math.sin(this.t * 0.45) * this.sweep;
    }
    // nobody is spotted in the middle of a conversation
    if (G.lockMove) { this.sus = 0; return; }
    // what they see
    const head = new THREE.Vector3(a.pos.x, 1.65, a.pos.z);
    const ep = pl.eyePos(); const tgt = new THREE.Vector3(ep.x, ep.y - 0.15, ep.z);
    const dx = tgt.x - head.x, dz = tgt.z - head.z, d = Math.hypot(dx, dz);
    const range = pl.crouched ? 4.5 : 9;
    const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - a.yaw), Math.cos(Math.atan2(dx, dz) - a.yaw)));
    let seen = d < range && ang < 0.75 && this.w.col.lineOfSight(head, tgt);
    // heard: a run close by gives you away whichever way they face
    if (!seen && d < 3 && pl.speed > 4 && !pl.crouched) seen = true;
    if (d < 1) seen = true;
    if (seen) this.sus += dt * (0.25 + 0.9 * (1 - d / range)) * (pl.crouched ? 0.5 : 1);
    else this.sus = Math.max(0, this.sus - dt * 0.45);
    if (this.sus > 0.35 && !this.said) { this.said = true; bark("Watchman", ["Who's there?", "Hm? ...Show yourself.", "Is somebody there?"][Math.floor(Math.random() * 3)], 2.2); }
    if (this.sus < 0.1) this.said = false;
  }
}

async function ch4(w, opts) {
  setAtmo("mist"); w.setChapter(4);
  AUDIO.music("flight");
  const pl = G.player;
  pl.place(SPOTS.alley[0], SPOTS.alley[1] - 0.2, Math.PI);
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], -24.6, 46.2, 0);
  const setup = () => {
    const guards = [
      new Watchman(w, 91, [[-35.6, 45], [-35.6, 60]], { wait: 3, speed: 0.95, light: w.pool[3] }),
      new Watchman(w, 92, [[-36.5, 64.6]], { yaw: Math.PI - 0.35, sweep: 0.8, light: w.pool[4] }),
      // and further out, the streets that lead away from the gate are walked too
      new Watchman(w, 94, [[-35.2, 38], [-35.2, 24]], { wait: 2.5, speed: 1.0, light: w.pool[5] }),
      new Watchman(w, 95, [[-18, 40], [-12, 40]], { wait: 3, speed: 0.9, yaw: -Math.PI / 2 }),
    ];
    return guards;
  };
  let guards = setup();

  if (opts.fromChase || !opts.retry) {
    await wait(0.2);
    if (opts.fromChase) { fade(0, 1.2); await card("", "IV. The Marsh Gate", 2.4); }
    else { const c = card("Minutes later", "IV. The Marsh Gate", 3); await wait(1); fade(0, 2); await c; }
    G.lockMove = true; lookAt(sib, 3); sib.facePlayer(); sib.lookAtPlayer(true);
    await say(P.sib, "They ran straight past. They'll be back, and they'll be searching every lane for two of us.");
    await say(P.sib, "So they'll only find one. Remember what Father said — the small door, beside the marsh gate. Meet me there.");
    await say(P.sib, "Keep low. Keep out of the lantern light. Don't run unless you have to.");
    G.lockMove = false; look(null);
    sib.walk([[-24.8, 42], [-24, 39.5], [-10, 39]], 2.8).then(() => sib.remove());
    UI.hint("C to crouch, Q and E to lean round a corner. A crouched figure is harder to see, and nobody sees through a crate.", 8);
  } else {
    sib.remove();
    fade(0, 1);
  }
  UI.objective("Reach the small door beside the marsh gate, unseen");
  mark([SPOTS.postern[0], SPOTS.postern[1], 1.3]);
  let hb = 0;
  const watch = onFrame(dt => {
    const s = Math.max(...guards.map(g => g.sus));
    UI.eye(Math.min(1, s));
    hb -= dt;
    if (s > 0.25 && hb <= 0) { hb = 1.1 - s * 0.6; AUDIO.heartbeat(0.2 + s * 0.4); }
  });
  const res = await Promise.race([
    until(() => guards.some(g => g.sus >= 1)).then(() => "caught"),
    until(() => Math.hypot(pl.pos.x - SPOTS.postern[0], pl.pos.z - SPOTS.postern[1]) < 2.5).then(() => "made"),
  ]);
  watch(); UI.eye(0);
  if (res === "caught") {
    G.lockMove = true;
    const g = guards.find(g => g.sus >= 1);
    lookAt(g.a, 5); AUDIO.shout();
    await wait(0.6);
    await caughtScreen(TIPS_STEALTH);
    return startChapter(4, { retry: true });
  }
  guards.forEach(g => g.a.remove());
  // the one who went over the yards is already there
  G.lockMove = true; mark(null); UI.objective(null);
  const s2 = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], -26.4, 67.2, -Math.PI / 2);
  s2.facePlayer(); s2.lookAtPlayer(true);
  lookAt(s2, 3);
  await say(P.sib, "You came. I was starting to think — no. Never mind what I was thinking. Help me with this bolt.");
  s2.faceTo(-27.5, 68.2); s2.person.setPose("reach");
  await wait(1.2);
  AUDIO.door();
  await wait(0.8);
  await fade(1, 1.4);
  AUDIO.music(null);
  await narrate(`We ran — my ${P.sibLower} and I — through the marsh gate before they could take us too.`, 4.5);
  return startChapter(5);
}

// ===========================================================================
//  V. FAR, FAR AWAY
// ===========================================================================
async function ch5(w) {
  setAtmo("afternoon"); G.bugs.setKind("flies");
  AUDIO.music("grief"); AUDIO.wind(true, 0.8);
  const pl = G.player;
  pl.place(0, 22, 0);
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], 1.2, 24, Math.PI);
  sib.followPlayer(2.2);
  w.onTooFar = () => bark(P.sib, "Not that way — the woods are too thick. Keep to the road.", 3);
  await wait(0.2);
  const c = card("The road north-east", "V. Far, Far Away", 3.2);
  await wait(1.2); fade(0, 2.4); await c;
  UI.objective(`Follow the road north-east — your ${P.sibLower} knows the way at the forks`);
  // one voice at a time: lines wait for the last to finish
  let voiceLine = Promise.resolve();
  const barkQ = (who, text) => (voiceLine = voiceLine.then(() => bark(who, text)));
  // at every fork, which way — and a call back from the wrong one
  const FORK_LINES = [
    ["{Keep} here. The {track} road goes round to Altona — they'll have riders on it.", "Not that way! That's the Altona road. Every rider out of the city uses it."],
    ["Keep {keep}. The {track} one's just a cart track to someone's fields.", "That's a field track. Farmers ask questions. Come back."],
    ["{Keep} again. North-east, towards Lübeck. Keep the sun at our backs.", "Wrong way — that bends back south. Back towards the city."],
    ["Stay {keep}. There's a charcoal burner down that track — I can smell the smoke.", "There's a charcoal burner down there. A stranger is something he'd remember."],
    ["Keep {keep}. The {track} one runs down to the river — a toll ferry, and a toll-keeper.", "The ferry has a toll-keeper. Toll-keepers keep lists. Back."],
    ["{Keep}. The deer go this way, and the deer know where it's quiet.", "It only gets thicker that way. Come on — follow the deer."],
    ["{Keep}, I think. ...Yes. {Keep}.", "No — {keep}. I'm sure of it."],
  ];
  const told = new Set(), called = {};
  const fillFork = (text, f) => { const keep = f.side === 1 ? "left" : "right", track = f.side === 1 ? "right" : "left"; return text.replace(/\{Keep\}/g, keep[0].toUpperCase() + keep.slice(1)).replace(/\{keep\}/g, keep).replace(/\{track\}/g, track); };
  const forks = onFrame(() => {
    const on = w.anyRoadDist(pl.pos.x, pl.pos.z), t = w.progress();
    FORKS.forEach((f, n) => {
      if (!told.has(n) && !on.branch && t > f.t - 0.03 && t < f.t) { told.add(n); barkQ(P.sib, fillFork(FORK_LINES[n][0], f)); }
      if (on.branch && on.branch.n === n && on.i > 8 && (!called[n] || G.time - called[n] > 9)) { called[n] = G.time; bark(P.sib, fillFork(FORK_LINES[n][1], f), 3.2); }
    });
  });
  // bells behind you, fainter every time
  let bellT = 2;
  const birds = onFrame((() => { let t = 3; return dt => { t -= dt; if (t <= 0) { t = 2 + Math.random() * 4; if (Math.random() < 0.7) SFX.bird(); else if (Math.random() < 0.3) SFX.crow(); } }; })());
  const prog = onFrame(dt => {
    const t = w.progress();
    blendAtmo("afternoon", "dusk", clamp((t - 0.05) / 0.95, 0, 1));
    w.city.visible = t < 0.3;
    G.bugs.setKind(t > 0.75 ? "fireflies" : "flies");
    bellT -= dt;
    if (bellT <= 0 && t < 0.32) { bellT = 7; AUDIO.bell(clamp(0.8 - t * 2.6, 0, 0.8), 0.9); }
  });
  const lines = [
    [0.03, P.sib, "Keep walking. If we stop, I don't think I'll start again."],
    [0.1, P.sib, "He said the Sabbath. He said it like he believed it."],
    [0.13, YOU(), "He wanted us to believe it."],
    [0.2, P.sib, "Where does this road even go?"],
    [0.23, YOU(), "Away. That's enough for today."],
    [0.33, P.sib, "Listen."],
    [0.36, P.sib, "...I can't hear the bells anymore."],
  ];
  const later = [
    [0.58, P.sib, "Three days. My feet have stopped hurting. I think that's worse."],
    [0.66, YOU(), "Jakob would have said it was going to rain."],
    [0.68, P.sib, "Jakob would have been right. He always was, about the rain."],
    [0.78, P.sib, "Nobody comes this deep. No tracks but deer. No one to know us."],
    [0.86, P.sib, "Wait — through the trees. Is that a clearing?"],
  ];
  const run = async list => { for (const [at, who, text] of list) { await until(() => w.progress() > at); await barkQ(who, text); } };
  await run(lines);
  AUDIO.music("woods");
  await until(() => w.progress() > 0.48);
  // three days pass
  G.lockMove = true;
  await fade(1, 1.8);
  await narrate("Far, far away, the old woods swallowed the road, and the city's bells faded behind us.", 4.5);
  await narrate("We walked for three days. We ate blackberries, and what the farms we passed would not miss.", 4.5);
  // on a little way, so the walk picks up somewhere new
  const k = Math.floor(w.road.length * 0.52), p = w.road[k], q = w.road[k + 3];
  pl.place(p.x, p.z, Math.atan2(-(q.x - p.x), -(q.z - p.z)));
  sib.place(p.x + 1, p.z + 1.5); pl.trail = [{ x: p.x, z: p.z }];
  G.lockMove = false;
  await fade(0, 1.8);
  await run(later);
  UI.objective("Go into the clearing");
  mark([CLEARING.x, CLEARING.z, 2]);
  await until(() => Math.hypot(pl.pos.x - CLEARING.x, pl.pos.z - CLEARING.z) < CLEARING.r - 4);
  forks();
  mark(null);
  G.lockMove = true;
  look(new THREE.Vector3(CABIN.x, w.cy + 1.2, CABIN.z), 1.4);
  birds();
  await wait(2.2);
  await say(P.sib, "There's — someone lived here.");
  G.lockMove = false; look(null);
  UI.objective("Look at the ruin");
  mark([CABIN.x, CABIN.z, 2.4]);
  let looked = false;
  const it = w.addInteract({ x: CABIN.x + Math.sin(CABIN.ry) * 3.2, y: 1.2, z: CABIN.z + Math.cos(CABIN.ry) * 3.2, reach: 3, label: "Look at the ruin", use: () => { looked = true; } });
  await until(() => looked);
  w.removeInteract(it); mark(null); UI.objective(null);
  G.lockMove = true;
  sib.stopFollow(); sib.walkTo(pl.pos.x + 1.2, pl.pos.z + 0.6, 1.3);
  look(new THREE.Vector3(CABIN.x, w.cy + 0.6, CABIN.z), 2);
  await say(YOU(), "Burned. A long time ago, by the look of it. Whoever raised it is gone.");
  lookAt(sib, 2.5); sib.facePlayer();
  await say(P.sib, "Burned, empty, forgotten.");
  await wait(0.8);
  await say(P.sib, "Like us.");
  await wait(0.6);
  await say(YOU(), "The chimney stands. There's timber all around. There's no one for three days in any direction.");
  await say(P.sib, "Then we stop here.");
  prog();
  await fade(1, 2.4);
  AUDIO.music(null); AUDIO.wind(false);
  await narrate("Father is gone. The name is gone. But hands remain, and timber, and morning.", 5);
  await narrate("We begin.", 2.5);
  return startChapter(6);
}

// ===========================================================================
//  VI. THE CLEARING
// ===========================================================================
const CARRY_MAX = 6, DOOR_COST = 5, CABIN_COST = 20, LOGS_PER_TREE = 3;
async function ch6(w) {
  setAtmo("morning"); G.bugs.setKind("flies");
  AUDIO.music("woods"); SFX.insectLoop(true);
  const pl = G.player;
  const saved = (loadSave() || {}).clearing || {};
  const S = { axe: !!saved.axe, store: saved.store || 0, carry: saved.carry || 0, door: !!saved.door, felled: saved.felled || [], first: !!saved.first, sibHelping: !!saved.sibHelping, logs: saved.logs || [] };
  const persist = () => writeSave({ clearing: { ...S } });
  G.camp = { get logs() { return S.store; }, get door() { return S.door; }, doorCost: DOOR_COST, cabinCost: CABIN_COST, carryMax: CARRY_MAX };
  // trees already down stay down (as stumps)
  for (const i of S.felled) { const t = w.fellable[i]; if (t) { t.state = "gone"; t.g.visible = false; t.col.disabled = true; stump(w, t); } }
  w.setStack(S.store);
  if (S.door) w.doorProp.visible = true;
  if (S.axe) { w.blockAxe.visible = false; pl.giveAxe(true); }
  pl.carryN = S.carry;
  pl.place(33, -306, Math.atan2(-(CABIN.x - 33), -(CABIN.z + 306)));
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], 31.4, -308, Math.PI);
  sib.lookAtPlayer(true);
  const birds = onFrame((() => { let t = 2; return dt => { t -= dt; if (t <= 0) { t = 2 + Math.random() * 5; Math.random() < 0.85 ? SFX.bird() : SFX.crow(); } }; })());
  void birds;

  await wait(0.2);
  const c = card("The old woods", "VI. The Clearing", 3.2);
  await wait(1.2); fade(0, 2.4); await c;
  if (!S.axe) {
    G.lockMove = true; lookAt(sib, 3); sib.facePlayer();
    await say(P.sib, "There's an axe stuck in that old block. The haft's grey, but the head's still good.");
    await say(P.sib, "Twenty logs for walls, I'd say, and a door. We had a roof over us all our lives. We can make one.");
    G.lockMove = false; look(null);
  }

  // ---- things in the clearing you can use ----
  w.addInteract({ x: BLOCK.x, y: 0.9 + w.cy, z: BLOCK.z, reach: 2.2, label: "Take the old axe", can: () => !S.axe,
    use: () => { S.axe = true; w.blockAxe.visible = false; pl.giveAxe(true); SFX.pickup(); persist(); UI.hint("Click to swing. Stand close to a trunk and face it.", 6); } });
  w.addInteract({ x: STACK.x, y: w.cy + 0.8, z: STACK.z, reach: 2.6, label: () => `Stack the logs (${pl.carryN})`, can: () => pl.carryN > 0,
    use: () => { S.store += pl.carryN; pl.carryN = 0; S.carry = 0; w.setStack(S.store); SFX.build(); persist(); } });
  w.addInteract({ x: BLOCK.x + 1.3, y: w.cy + 0.9, z: BLOCK.z, reach: 2.4, hold: 4, label: `Hew a door (${DOOR_COST} logs from the stack)`,
    can: () => !S.door && S.store >= DOOR_COST,
    onHoldTick: (dt, t) => { if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) SFX.hammer(); },
    use: () => { S.door = true; S.store -= DOOR_COST; w.setStack(S.store); w.doorProp.visible = true; SFX.build(); persist(); bark(P.sib, "A door! Crooked as a dog's hind leg. It's perfect."); } });
  let rebuilt = false;
  w.addInteract({ x: CABIN.x + Math.sin(CABIN.ry) * 3.3, y: w.cy + 1.2, z: CABIN.z + Math.cos(CABIN.ry) * 3.3, reach: 3, hold: 5, label: `Rebuild the cabin (${CABIN_COST} logs and the door)`,
    can: () => S.door && S.store >= CABIN_COST && !rebuilt,
    onHoldTick: (dt, t) => { if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) SFX.hammer(); },
    use: () => { rebuilt = true; } });

  // ---- felling ----
  const bundles = [];
  G.onSwing = () => {
    const f = pl.forward();
    let best = null, bd = 2.4;
    for (const t of w.fellable) {
      if (t.state !== "up" && t.state !== "shake") continue;
      if (t.claimed === "sib") continue;
      const dx = t.x - pl.pos.x, dz = t.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * f.x + dz * f.z) / d > 0.45) { bd = d; best = t; }
    }
    if (!best) return;
    SFX.chop();
    best.hp--;
    if (best.hp > 0) { best.state = "shake"; best.shake = 0.25; return; }
    fell(best, best.x - pl.pos.x, best.z - pl.pos.z, "you");
  };
  function fell(t, dx, dz, by) {
    const l = Math.hypot(dx, dz) || 1;
    t.state = "falling"; t.fall = 0; t.col.disabled = true;
    t.dir = { x: dx / l, z: dz / l };
    t.axis = new THREE.Vector3(dz / l, 0, -dx / l);
    SFX.timberCrack();
    t.onDown = () => {
      SFX.treeFall();
      const i = w.fellable.indexOf(t);
      if (!S.felled.includes(i)) S.felled.push(i);
      persist();
      if (by === "you") dropBundle(t.x + t.dir.x * 1.6, t.z + t.dir.z * 1.6, Math.atan2(t.dir.x, t.dir.z), LOGS_PER_TREE);
      // the trunk lies a while, then the logs are all there is of it
      setTimeout(() => { t.g.visible = false; stump(w, t); t.state = "gone"; }, 1500);
    };
  }
  // logs on the ground, where a tree came down; kept in the save so a reload cannot lose them
  const saveLogs = () => { S.logs = bundles.map(b => ({ x: b.x, z: b.z, a: b.a, n: b.n })); persist(); };
  function dropBundle(x, z, a, n) {
    // never beyond where you can walk: a tree on the edge that falls outward leaves its logs just inside
    const reach = CLEARING.r + 7.5, dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
    if (dc > reach) { x = CLEARING.x + (x - CLEARING.x) * reach / dc; z = CLEARING.z + (z - CLEARING.z) * reach / dc; }
    const y = w.heightAt(x, z), dx = Math.sin(a), dz = Math.cos(a);
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 8), new THREE.MeshStandardMaterial({ color: 0x7a5634, roughness: 1 }));
      m.rotation.z = Math.PI / 2; m.rotation.y = a + Math.PI / 2;
      m.position.set((i - 1) * 0.3 * dz, 0.15 + (i === 1 ? 0.24 : 0), -(i - 1) * 0.3 * dx);
      m.castShadow = true; g.add(m);
    }
    g.position.set(x, y, z);
    w.root.add(g);
    const b = { g, x, z, a, n };
    b.it = w.addInteract({ x, y: y + 0.4, z, reach: 2.4, label: () => `Take the logs (${b.n})`,
      use: () => {
        if (pl.carryN >= CARRY_MAX) { UI.hint("Your arms are full. Stack what you carry by the cabin first.", 3.5); return; }
        const take = Math.min(b.n, CARRY_MAX - pl.carryN);
        pl.carryN += take; b.n -= take; S.carry = pl.carryN; SFX.pickup();
        if (b.n <= 0) { w.removeInteract(b.it); w.root.remove(g); bundles.splice(bundles.indexOf(b), 1); }
        saveLogs();
      } });
    bundles.push(b);
    saveLogs();
  }
  // logs left lying from last time
  for (const l of S.logs.slice()) { S.logs = []; dropBundle(l.x, l.z, l.a || 0, l.n); }

  // ---- your sibling works the far side of the clearing ----
  const sibState = { mode: "idle", t: 0, tree: null };
  const sibTask = async () => {
    const g = GEN;
    while (g === GEN && !rebuilt) {
      if (!S.sibHelping) { await wait(1); continue; }
      // the far side from you, the nearest standing tree there
      const candidates = w.fellable.filter(t => t.state === "up" && !t.claimed);
      if (!candidates.length) { await wait(3); continue; }
      candidates.sort((a, b) => (Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z) - Math.hypot(a.x - pl.pos.x, a.z - pl.pos.z)));
      const t = candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
      t.claimed = "sib"; sibState.tree = t;
      const dx = CLEARING.x - t.x, dz = CLEARING.z - t.z, l = Math.hypot(dx, dz);
      sib.stopFollow(); sib.lookAtPlayer(false);
      await sib.walkTo(t.x + dx / l * 1.1, t.z + dz / l * 1.1, 1.5);
      if (g !== GEN) return;
      sib.faceTo(t.x, t.z);
      sib.person.setPose("chop");
      const axe = sib.hold(makeSibAxe());
      for (let i = 0; i < 7; i++) {
        await wait(0.8);
        if (Math.hypot(sib.pos.x - pl.pos.x, sib.pos.z - pl.pos.z) < 22) SFX.chop();
      }
      sib.person.setPose("idle");
      sib.person.held.remove(axe);
      fell(t, -dx, -dz, "sib");
      await wait(2.6);
      if (g !== GEN) return;
      await sib.walkTo(STACK.x + 1.4, STACK.z + 0.6, 1.4);
      if (g !== GEN) return;
      S.store += LOGS_PER_TREE; w.setStack(S.store); SFX.build(); persist();
      if (Math.random() < 0.45) bark(P.sib, [
        `That's ${S.store} on the stack.`, "Father used to say a merchant counts twice. Count that.", "Don't look at me like that. Swing the axe.",
        "Your turn to fetch water, when there's a bucket.", "I've got a splinter the size of a church spire.",
      ][Math.floor(Math.random() * 5)]);
      await wait(4 + Math.random() * 4);
    }
  };
  sibTask().catch(e => { if (e !== ABORT) console.error(e); });

  // ---- the objective reads itself off the clearing ----
  let lastObj = "";
  const standing = () => w.fellable.find(t => t.state === "up" && !t.claimed);
  const objectives = onFrame(() => {
    let o, m = null;
    if (!S.axe) { o = "Take the old axe from the chopping block"; m = [BLOCK.x, BLOCK.z, w.cy + 1.1]; }
    else if (pl.carryN >= CARRY_MAX || (pl.carryN > 0 && !bundles.length)) { o = `Stack the logs by the cabin (carrying ${pl.carryN})`; m = [STACK.x, STACK.z, w.cy + 1]; }
    else if (bundles.length) { o = "Take the logs"; const b = bundles[0]; m = [b.x, b.z, w.cy + 0.8]; }
    else if (!S.door && S.store < DOOR_COST) { o = `Fell spruces for a door — ${S.store} of ${DOOR_COST} logs stacked`; const t = standing(); m = null; void t; }
    else if (!S.door) { o = "Hew a door at the sawhorse"; m = [BLOCK.x + 1.3, BLOCK.z, w.cy + 1.1]; }
    else if (S.store < CABIN_COST) { o = `Fell spruces to rebuild the cabin — ${S.store} of ${CABIN_COST} logs stacked`; }
    else { o = "Rebuild the cabin"; m = [CABIN.x, CABIN.z, w.cy + 2]; }
    if (o !== lastObj) { if (lastObj.split("—")[0] !== o.split("—")[0]) UI.objective(o); else UI.objectiveCount(o); lastObj = o; }
    G.marker = m ? { x: m[0], z: m[1], y: m[2] } : null;
    UI.carry(pl.carryN > 0 ? `Carrying ${pl.carryN} log${pl.carryN > 1 ? "s" : ""}` : null);
    // once the first logs are stacked, the other one takes up an axe too
    if (!S.sibHelping && S.store > 0) {
      S.sibHelping = true; persist();
      bark(P.sib, "I found a second head in the ash and put a new haft to it. I'll take the trees on the far side. Race you.");
    }
    if (!S.first && S.axe) { S.first = true; persist(); }
  });
  if (!S.sibHelping) sib.followPlayer(3);

  await until(() => rebuilt);
  objectives(); G.marker = null; UI.objective(null); UI.carry(null);
  G.onSwing = null;
  G.lockMove = true;
  await fade(1, 1.6);
  for (const b of bundles) w.root.remove(b.g);
  pl.giveAxe(false);
  await narrate("By the last of the light, the cabin stood again.", 3.6);
  w.showCabin();
  setAtmo("dusk");
  writeSave({ clearing: { ...S, done: true } });
  pl.place(CABIN.x + Math.sin(CABIN.ry) * 6, CABIN.z + Math.cos(CABIN.ry) * 6, CABIN.ry);
  pl.pitch = 0.05;
  sib.path = []; sib.stopFollow(); sib.person.setPose("idle");
  sib.place(FIRE.x + 1.9, FIRE.z + 0.4, -Math.PI / 2);
  w.lightFire(true); SFX.fireLoop(true); G.bugs.setKind("fireflies");
  AUDIO.music("hope");
  await fade(0, 2);
  await wait(1.5);
  G.lockMove = false;
  UI.objective(`Sit by the fire with your ${P.sibLower}`);
  mark([FIRE.x - 1.9, FIRE.z + 0.3, w.cy + 0.9]);
  let sitting = false;
  const sit = w.addInteract({ x: FIRE.x - 1.9, y: w.cy + 0.5, z: FIRE.z + 0.3, reach: 2.4, label: "Sit by the fire", use: () => { sitting = true; } });
  { let t = 0; onFrame(dt => { t = Math.min(1, t + dt / 25); blendAtmo("dusk", "firelight", t); }); }
  await until(() => sitting);
  w.removeInteract(sit); mark(null); UI.objective(null);
  G.lockMove = true; pl.seated = true;
  await fade(1, 0.8);
  setAtmo("firelight");
  sib.person.sitting = 1; sib.person.setPose("sit"); sib.faceTo(FIRE.x, FIRE.z);
  pl.place(FIRE.x - 1.9, FIRE.z + 0.3, Math.PI / 2 - 0.25);
  look(new THREE.Vector3(FIRE.x, w.cy + 0.8, FIRE.z), 3);
  await fade(0, 1.4);
  await wait(1.5);
  SFX.owl();
  await say(null, `The cabin stands again. We kept one charred beam at the corner — ${P.sib} insisted.`);
  lookAt(sib, 2);
  await say(P.sib, "So we remember what they took. And what we took back.");
  await wait(1);
  look(new THREE.Vector3(FIRE.x, w.cy + 0.8, FIRE.z), 1.5);
  await say(P.sib, "Tomorrow there's seed to find. Something to plant before the frost. Something to eat that isn't blackberries.");
  await say(YOU(), "Tomorrow.");
  await wait(2);
  await fade(1, 3);
  SFX.fireLoop(false); SFX.insectLoop(false);
  writeSave({ unlocked: 6, finishedPartOne: true });
  await narrate("They cast us out to die. Instead, we built this.", 4.5);
  await card("End of Part One", "Forester: Reckoning", 4.5);
  await narrate("The story continues in the next chapter. Thank you for playing.", 4);
  G.toTitle && G.toTitle();
}

function makeSibAxe() {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a45 }));
  h.position.y = 0; g.add(h);
  const hd = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.17), new THREE.MeshStandardMaterial({ color: 0x5d6166, metalness: 0.7, roughness: 0.5 }));
  hd.position.set(0, -0.34, 0.06); g.add(hd);
  g.rotation.x = Math.PI / 2;
  return g;
}
function stump(w, t) {
  if (t.stump) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }));
  m.position.set(t.x, t.y + 0.1, t.z); m.castShadow = true;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.26, 8), new THREE.MeshStandardMaterial({ color: 0xc8a878 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.226; m.add(top);
  w.root.add(m); t.stump = m;
}
void HOME; void input;
