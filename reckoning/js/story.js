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

import { THREE, clamp, mat, Builder, MAT } from "./core.js";
import { G, Actor, setWorld, setAtmo, blendAtmo, input } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { Hamburg, SPOTS, ROUTES, HOME } from "./hamburg.js";
import { Woods, CLEARING, CABIN, STACK, BLOCK, FIRE, FORKS } from "./woods.js";
import { makeTorch, makeLantern, makeScroll, makeHalberd, P as PROPS } from "./models.js";

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
// Your brother or sister teaches you the controls, in their own words, the first time each is needed;
// the keys themselves show underneath. Once learned, never again on this save.
const tipSeen = key => ((loadSave() || {}).tips || []).includes(key);
function tutor(key, line, keys, secs = 8) {
  const s = loadSave() || {}, seen = s.tips || [];
  if (seen.includes(key)) return;
  writeSave({ tips: [...seen, key] });
  if (line) bark(P.sib, line, Math.max(3.2, line.length * 0.06));
  if (keys) UI.keys(keys, secs);
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
  { n: 7, title: "Seed Before Frost", kicker: "Part Two: Roots", world: "woods", run: ch7 },
  { n: 8, title: "Martinmas", kicker: "Six weeks later", world: "woods", run: ch8 },
  { n: 9, title: "The First Winter", kicker: "Nine days after", world: "woods", run: ch9 },
];

// what is in your pockets in each chapter — the inventory (T) lists it
const PACK = {
  1: [{ icon: "key", name: "The house key", note: "Iron, warm from your pocket. The house by the harbour." }],
  2: [{ icon: "key", name: "The house key", note: "Iron, warm from your pocket. The house by the harbour." }],
  3: [{ icon: "key", name: "The house key", note: "You kept it. You do not know why." }],
  4: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more." }],
  5: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more." }, { icon: "blackberries", n: 12, name: "Blackberries", note: "A handful, squashed. Three days of them." }],
  6: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more." }, { icon: "blackberries", n: 12, name: "Blackberries", note: "A handful, squashed. Three days of them." }],
  7: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more. You keep it anyway." }],
  8: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more. You keep it anyway." }, { icon: "spade", name: "Henning's spade", note: "The handle split and bound with twine." }],
  9: [{ icon: "key", name: "The house key", note: "To a door that is not yours any more. You keep it anyway." }, { icon: "spade", name: "Henning's spade", note: "The handle split and bound with twine." }],
};

export async function startChapter(n, opts = {}) {
  GEN++;
  G.onFrame.length = 0;
  UI.closeDialog(); UI.clearBark(); UI.objective(null); UI.prompt(null); UI.carry(null); UI.eye(0); UI.hold(0);
  G.cine = null; G.lockMove = false; G.marker = null; G.onSwing = null; G.forceThird = false; G.stamina = 1; G.sprintSpeed = undefined;   // running always costs breath
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
  tutor("walk", `Father's asking for you. The counting room — go on, he's been pacing.`, [[["W", "A", "S", "D"], "walk"], ["Mouse", "look"], ["M", "lock the mouse"]]);
  onFrame((() => { let t = 0; return dt => { t += dt; if (t > 9 && t < 9.1) tutor("talk", "He won't bite. Walk up to him and say something.", [["F", "talk, take, open"]]); }; })());

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
  tutor("door", "The front door sticks — F, and put your shoulder in it. Out in the street you can run. Not in here.", [["F", "open the door"], ["Shift", "run"], [["Q", "E"], "lean"]]);
  let outside = false;
  onFrame(() => { if (!outside && !w.inHome()) { outside = true; tutor("pack", "", [["T", "inventory — the ledger's in there"], ["J", "map"]], 7); } });

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
  // down into the hall and off to the side by the wall — out of your way, and not between you and the door
  sib.walk([[15.6, -8.7], [16.9, -7.4]], 1.6);
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
  // to the clear end of the table, beside you, not through it
  sib.walk([[15.2, -6.4]], 1.2);
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
  const ranBefore = tipSeen("sprint");
  tutor("sprint", "Run! Shift — and mind your breath, it won't last. Round the watchman, not past him!", [["Shift", "run — watch your breath"]], 5);
  if (ranBefore) UI.hint("Hold Shift to run — but your breath won't last. Dodge the watchman in the street.", 4);
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
    this.a = spawn(opts.look || GUARD(seed), route[0][0], route[0][1], opts.yaw ?? 0);
    this.lines = opts.lines || ["Who's there?", "Hm? ...Show yourself.", "Is somebody there?"];
    this.who = opts.look ? opts.look.name : "Watchman";
    this.range = opts.range || 9;
    this.once = !!opts.once; this.onArrive = opts.onArrive; this.done = false;
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
    } else if (this.route.length > 1 && !this.done) {
      if (!a.path.length) {
        if (this.arrivedAt !== this.i) { this.arrivedAt = this.i; this.onArrive && this.onArrive(this.i); }
        if (this.once && this.i === this.route.length - 1) this.done = true;
        else if (this.pause > 0) { this.pause -= dt; }
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
    const range = pl.crouched ? this.range / 2 : this.range;
    const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - a.yaw), Math.cos(Math.atan2(dx, dz) - a.yaw)));
    let seen = d < range && ang < 0.75 && this.w.col.lineOfSight(head, tgt);
    // heard: a run close by gives you away whichever way they face
    if (!seen && d < 3 && pl.speed > 4 && !pl.crouched) seen = true;
    if (d < 1) seen = true;
    if (seen) this.sus += dt * (0.25 + 0.9 * (1 - d / range)) * (pl.crouched ? 0.5 : 1);
    else this.sus = Math.max(0, this.sus - dt * 0.45);
    if (this.sus > 0.35 && !this.said) { this.said = true; bark(this.who, this.lines[Math.floor(Math.random() * this.lines.length)], 2.2); }
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
      // his beat runs from just past the cart (it stands at -35.6, 46) up to the gate, never through it
      new Watchman(w, 91, [[-34.4, 49], [-35.4, 59.6]], { wait: 3, speed: 0.95, light: w.pool[3] }),
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
    tutor("sneak", "", [["C", "crouch — harder to see"], [["Q", "E"], "lean round a corner"]], 9);
    UI.hint("A crouched figure is harder to see, and nobody sees through a crate.", 7);
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
      if (!told.has(n) && !on.branch && t > f.t - 0.03 && t < f.t) {
        told.add(n); barkQ(P.sib, fillFork(FORK_LINES[n][0], f));
        if (n === 0) tutor("map", "", [["J", "the map — every fork is on it"]], 7);
      }
      if (on.branch && on.branch.n === n && on.i > 4 && (!called[n] || G.time - called[n] > 9)) { called[n] = G.time; bark(P.sib, fillFork(FORK_LINES[n][1], f), 3.2); }
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
    use: () => { S.axe = true; w.blockAxe.visible = false; pl.giveAxe(true); SFX.pickup(); persist();
      const choppedBefore = tipSeen("axe");
      tutor("axe", "Get close, face the trunk, and swing — level, from the shoulder. Four good strokes and it's down.", [["Click", "swing the axe"]]);
      if (choppedBefore) UI.hint("Click to swing. Stand close to a trunk and face it.", 6); } });
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
        if (pl.carryN >= CARRY_MAX) { bark(P.sib, "You'll drop the lot. Six is all anyone can carry — stack them by the cabin, then come back.", 4); return; }
        const take = Math.min(b.n, CARRY_MAX - pl.carryN);
        pl.carryN += take; b.n -= take; S.carry = pl.carryN; SFX.pickup();
        tutor("stack", "Good. Now the stack, by the cabin — we'll need twenty for walls and five for a door.", [["F", "stack the logs by the cabin"], ["T", "see what you carry"]]);
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
  writeSave({ unlocked: 7, finishedPartOne: true });
  await narrate("They cast us out to die. Instead, we built this.", 4.5);
  await card("End of Part One", "Ashes", 4);
  return startChapter(7);
}

// ===========================================================================
//  VII. SEED BEFORE FROST — Part Two: Roots
// ===========================================================================
const HENNING = { model: "townsman", name: "Henning", coat: 0x2e2a26, legs: 0x26221e, hair: 0x6a6660, hat: "hat", hatColor: 0x1e1a18, beard: 0x6a6660, seed: 77 };
const FIELD = { x: 22.5, z: -311, ry: 0.35 };        // three strips of it, beside the cabin
async function ch7(w) {
  setAtmo("morning"); G.bugs.setKind("flies");
  AUDIO.music("woods"); SFX.insectLoop(true);
  const pl = G.player;
  const saved = (loadSave() || {}).seed || {};
  const S = { stage: saved.stage || 0, dug: saved.dug || [], sown: saved.sown || [] };   // 0 fetch logs, 1 trade, 2 field, 3 done
  const persist = () => writeSave({ seed: { ...S } });
  w.showCabin(); w.setStack(8);
  // the trees felled for the cabin are stumps still
  for (const i of ((loadSave() || {}).clearing || {}).felled || []) { const t = w.fellable[i]; if (t) { t.state = "gone"; t.g.visible = false; t.col.disabled = true; stump(w, t); } }
  const door = [CABIN.x + Math.sin(CABIN.ry) * 4.2, CABIN.z + Math.cos(CABIN.ry) * 4.2];
  pl.place(door[0], door[1], CABIN.ry + Math.PI);
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], FIRE.x + 1.4, FIRE.z + 0.6, -Math.PI / 2);
  w.openTracks.add(3);
  const B = w.burner;
  const henning = spawn(HENNING, B.x, B.z, B.face);
  henning.person.setPose("armsCrossed");
  const birds = onFrame((() => { let t = 2; return dt => { t -= dt; if (t <= 0) { t = 2 + Math.random() * 5; Math.random() < 0.85 ? SFX.bird() : SFX.crow(); } }; })());
  void birds;
  const addPack = (icon, name, note, n) => { if (!G.pack.some(i => i.name === name)) G.pack.push({ icon, name, note, n }); };
  if (S.stage >= 2) { addPack("seeds", "Rye seed", "A sack of it, heavy as a child. And a few turnips wrapped in a rag.", 1); addPack("spade", "Henning's spade", "The handle split and bound with twine. It will do."); }

  await wait(0.2);
  const c = card("Part Two: Roots", "VII. Seed Before Frost", 3.4);
  await wait(1.2); fade(0, 2.4); await c;

  if (S.stage === 0) {
    G.lockMove = true; lookAt(sib, 3); sib.facePlayer();
    await say(P.sib, "I walked back down the road at first light. That track we passed, the one with the smoke.");
    await say(YOU(), "The charcoal burner.");
    await say(P.sib, "He'll have seed, or know who does. And he'll want paying. We've nothing but what we can cut.");
    await say(P.sib, "So we take him wood. Six logs from the stack — good dry spruce. And if he asks, we're from Bergedorf. A fire took our uncle's farm.");
    await say(YOU(), "That's nearly true.");
    await say(P.sib, "Nearly true is the best kind of lie. I'll start on the ground by the cabin. Go on.");
    G.lockMove = false; look(null);
    S.stage = 0; persist();
  }

  // ---- the logs, from what is left of the stack ----
  if (S.stage === 0) {
    UI.objective("Take six logs from the stack");
    mark([STACK.x, STACK.z, w.cy + 1]);
    let took = false;
    const it = w.addInteract({ x: STACK.x, y: w.cy + 0.8, z: STACK.z, reach: 2.6, label: "Take six logs", use: () => { took = true; } });
    await until(() => took);
    w.removeInteract(it); SFX.pickup();
    pl.carryN = 6; w.setStack(2); UI.carry("Carrying 6 logs");
    S.stage = 1; persist();
  } else if (S.stage === 1) { pl.carryN = 6; w.setStack(2); UI.carry("Carrying 6 logs"); }

  // ---- down the road to the burner's track ----
  if (S.stage === 1) {
    sib.person.setPose("hammer");
    UI.objective("Carry the logs to the charcoal burner, down the track with the smoke");
    mark({ x: B.x, z: B.z, y: 1.8 });
    tutor("map2", "", [["J", "the map — his track is on it"]], 6);
    let arrived = false;
    const it = w.addInteract({ x: B.x, y: 1.4 + w.heightAt(B.x, B.z), z: B.z, reach: 3.2, label: "Speak to the charcoal burner", use: () => { arrived = true; } });
    await until(() => arrived);
    w.removeInteract(it); mark(null); UI.objective(null);
    G.lockMove = true; lookAt(henning, 2.5); henning.facePlayer(); henning.lookAtPlayer(true); henning.person.setPose("idle");
    await say("Henning", "Far from anywhere, you are. Nobody comes down this track but the smoke.");
    await say(YOU(), "We're from Bergedorf. Our uncle's farm burned. We're living in the old cabin, at the end of the road.");
    await say("Henning", "The forester's cabin? That burned before I came here. Twenty years it's stood empty.");
    await say("Henning", "Bergedorf, is it.");
    await wait(1.2);
    await say("Henning", "Hm. You've a Hamburg way of talking. Harbour Hamburg.");
    await say(YOU(), "We've wood to trade. Six logs of spruce, dry.");
    await wait(1);
    await say("Henning", "...Rye seed. A sack of it, and a few turnips for the winter. And take the spade — the handle's split, but you can mend a handle.");
    SFX.pickup(); pl.carryN = 0; UI.carry(null);
    addPack("seeds", "Rye seed", "A sack of it, heavy as a child. And a few turnips wrapped in a rag.", 1);
    addPack("spade", "Henning's spade", "The handle split and bound with twine. It will do.");
    await say("Henning", "And listen. A man comes through at Martinmas, buying charcoal for the city. He asks questions, that one.");
    await say("Henning", "When you hear a cart on the road — you keep to the trees. Both of you.");
    await say(YOU(), "Why would you tell us that?");
    await say("Henning", "Because nobody asked me, once. Go on. Plant your rye before the frost does it for you.");
    G.lockMove = false; look(null); henning.stopFacing(); henning.person.setPose("armsCrossed");
    S.stage = 2; persist();
  }

  // ---- the field: three strips, dug and sown ----
  if (S.stage === 2) {
    sib.person.setPose("idle");
    const c2 = Math.cos(FIELD.ry), s2 = Math.sin(FIELD.ry);
    const strips = [-2.2, 0, 2.2].map((o, i) => ({ i, x: FIELD.x + o * c2, z: FIELD.z - o * s2 }));
    const soil = [], rows = [];
    const addSoil = st => {
      const y = w.heightAt(st.x, st.z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 7), mat(0x3e2e22, { surface: "stone" }));
      m.position.set(st.x, y + 0.02, st.z); m.rotation.y = FIELD.ry; m.receiveShadow = true; w.root.add(m); soil.push(m);
      // furrows along it
      for (const f of [-0.5, 0, 0.5]) { const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 6.8), mat(0x2e2218)); r2.position.set(st.x + f * c2, y + 0.1, st.z - f * s2); r2.rotation.y = FIELD.ry; w.root.add(r2); soil.push(r2); }
    };
    const addRows = st => {
      const y = w.heightAt(st.x, st.z);
      for (const f of [-0.5, 0, 0.5]) for (let k = -3; k <= 3; k += 0.5) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), mat(0x6a8a3a, { surface: "needles" }));
        m.position.set(st.x + f * c2 + k * s2, y + 0.14, st.z - f * s2 + k * c2); w.root.add(m); rows.push(m);
      }
    };
    for (const st of strips) { if (S.dug.includes(st.i)) addSoil(st); if (S.sown.includes(st.i)) addRows(st); }
    const outline = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 7.4), new THREE.MeshBasicMaterial({ color: 0xc8962e, transparent: true, opacity: 0.12, depthWrite: false }));
    outline.rotation.set(-Math.PI / 2, 0, FIELD.ry); outline.position.set(FIELD.x, w.heightAt(FIELD.x, FIELD.z) + 0.05, FIELD.z); w.root.add(outline);
    if (!S.dug.length) {
      UI.objective("Go back to the clearing and dig a field beside the cabin");
      mark([FIELD.x, FIELD.z, w.cy + 0.6]);
      await until(() => Math.hypot(pl.pos.x - FIELD.x, pl.pos.z - FIELD.z) < 9);
      G.lockMove = true; lookAt(sib, 2.5); sib.facePlayer();
      await say(P.sib, "He gave us seed? For six logs? ...What did you tell him?");
      await say(YOU(), "Bergedorf. He didn't believe it. He gave us the seed anyway.");
      await say(P.sib, "Then we owe him more than wood. Here — I've marked it out. Three strips, the length of the cabin.");
      G.lockMove = false; look(null);
      tutor("dig", "Hold F and put your weight on the spade. Turn the earth over, all the way down the strip.", [["F", "hold to dig"]]);
    }
    mark(null);
    const its = [];
    for (const st of strips) {
      its.push(w.addInteract({ x: st.x, y: w.heightAt(st.x, st.z) + 0.5, z: st.z, reach: 3.2, hold: 3,
        label: () => S.dug.includes(st.i) ? "Sow the rye" : "Dig the strip",
        can: () => !S.sown.includes(st.i),
        onHoldTick: (dt, t) => { if (Math.floor(t * 2.4) !== Math.floor((t - dt) * 2.4)) (S.dug.includes(st.i) ? SFX.pickup : SFX.hammer)(); },
        use: () => {
          if (!S.dug.includes(st.i)) { S.dug.push(st.i); addSoil(st); SFX.build(); }
          else { S.sown.push(st.i); addRows(st); SFX.pickup(); if (S.sown.length === 1) bark(P.sib, "Not too deep. A thumb's depth, and cover it over. Father sowed his window box like that every spring."); }
          persist();
        } }));
    }
    const lines = [[1, "Keep going. My back's already telling me what it thinks of farming."], [2, "One more. And then we'll have a field. A field!"]];
    const done = onFrame(() => {
      const n = S.dug.length;
      while (lines.length && n >= lines[0][0]) { const [, t] = lines.shift(); bark(P.sib, t); }
      const left = 3 - S.dug.length, unsown = 3 - S.sown.length;
      UI.objective(left > 0 ? `Dig the field — ${3 - left} of 3 strips turned` : unsown > 0 ? `Sow the rye — ${3 - unsown} of 3 strips sown` : null);
    });
    await until(() => S.sown.length >= 3);
    done(); its.forEach(i => w.removeInteract(i)); w.root.remove(outline);
    S.stage = 3; persist();
  }

  // ---- evening ----
  UI.objective(null); G.lockMove = true;
  await fade(1, 1.8);
  setAtmo("dusk");
  pl.place(FIRE.x - 1.9, FIRE.z + 0.3, Math.PI / 2 - 0.25);
  sib.path = []; sib.person.sitting = 1; sib.person.setPose("sit"); sib.place(FIRE.x + 1.9, FIRE.z + 0.4, -Math.PI / 2); sib.faceTo(FIRE.x, FIRE.z);
  pl.seated = true; w.lightFire(true); SFX.fireLoop(true); G.bugs.setKind("fireflies");
  look(new THREE.Vector3(FIRE.x, w.cy + 0.8, FIRE.z), 3);
  AUDIO.music("hope");
  await fade(0, 2);
  await wait(1.2);
  await say(P.sib, "He knew. About Hamburg. He knew and he gave us seed.");
  await say(YOU(), "He said nobody asked him, once. I don't know what he meant.");
  await say(P.sib, "I think he meant he was someone's, once. Like us.");
  await wait(1.2);
  await say(P.sib, "Martinmas. A man with a cart, asking questions. That's six weeks.");
  await say(YOU(), "Then in six weeks, we keep to the trees.");
  await wait(1.5);
  await fade(1, 3);
  SFX.fireLoop(false); SFX.insectLoop(false);
  writeSave({ unlocked: 8, finishedCh7: true });
  await narrate("The rye came up green in three weeks, in three crooked rows.", 4);
  await narrate("And on Martinmas, a cart came up the road.", 3.5);
  return startChapter(8);
}

// ---------------------------------------------------------------------------
//  the homestead as it stands, for every chapter after the seed is sown
// ---------------------------------------------------------------------------
// growth: 0 bare earth, 1 green shoots, 2 knee-high, 3 ripe and gold
function homestead(w, { stack = 6, growth = 1 } = {}) {
  w.showCabin(); w.setStack(stack); w.openTracks.add(3);
  for (const i of ((loadSave() || {}).clearing || {}).felled || []) { const t = w.fellable[i]; if (t) { t.state = "gone"; t.g.visible = false; t.col.disabled = true; stump(w, t); } }
  const c = Math.cos(FIELD.ry), sn = Math.sin(FIELD.ry);
  const field = new THREE.Group(); w.root.add(field);
  const H = [0.12, 0.12, 0.45, 0.95][growth], C = [0x6a8a3a, 0x6a8a3a, 0x7a9a3e, 0xc8a850][growth];
  for (const o of [-2.2, 0, 2.2]) {
    const x = FIELD.x + o * c, z = FIELD.z - o * sn, y = w.heightAt(x, z);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 7), mat(0x3e2e22, { surface: "stone" }));
    soil.position.set(x, y + 0.02, z); soil.rotation.y = FIELD.ry; soil.receiveShadow = true; field.add(soil);
    if (growth > 0) for (const f of [-0.5, 0, 0.5]) for (let k = -3; k <= 3; k += growth > 1 ? 0.3 : 0.5) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(growth > 1 ? 0.05 : 0.03, H, 4), mat(C, { surface: "needles" }));
      m.position.set(x + f * c + k * sn, y + 0.08 + H / 2, z - f * sn + k * c); m.rotation.z = (Math.random() - 0.5) * 0.2; field.add(m);
    }
  }
  return field;
}
// the fence of trees round the clearing's south edge, where two people could lie hidden
const HIDE = { x: 35, z: -343 }, SIBHIDE = { x: 44, z: -339 };
const TIPS_WOODS = ["Get into the trees and crouch with C. His lantern only reaches so far.", "Keep a trunk between you and the lantern.", "Don't move while he looks your way. Wait for him to turn.", "Crouched, you can only be seen close to."];

// ===========================================================================
//  VIII. MARTINMAS
// ===========================================================================
const KESSLER = { model: "townsman", name: "The charcoal buyer", coat: 0x4a4a52, legs: 0x2a2a2e, hat: "hat", hatColor: 0x1e1a18, seed: 88 };
async function ch8(w, opts = {}) {
  setAtmo("dusk"); G.bugs.setKind(null);
  AUDIO.music(null); AUDIO.wind(true, 0.5);
  const pl = G.player;
  homestead(w, { stack: 6, growth: 1 });
  w.lightFire(true);
  pl.place(BLOCK.x - 1.2, BLOCK.z + 1, -Math.PI / 2);
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], FIELD.x + 1.5, FIELD.z + 4, Math.PI);
  sib.person.setPose("hammer");
  // his cart, left where the road meets the clearing
  const cartB = new Builder(); PROPS.cart(cartB, 29.2, -283, 0.2); const cart = cartB.build(); cart.position.y = w.heightAt(29.2, -283); cart.visible = false; w.root.add(cart);

  if (!opts.retry) {
    await wait(0.2);
    const c = card("Martinmas", "VIII. Martinmas", 3.2);
    await wait(1.2); fade(0, 2.4); await c;
    await wait(2.5);
    AUDIO.door(true, 0.25);
    await wait(1.4);
    sib.person.setPose("idle");
    G.lockMove = true; lookAt(sib, 3); sib.facePlayer();
    await say(P.sib, "Listen.");
    AUDIO.door(true, 0.35);
    await wait(1.2);
    await say(P.sib, "A cart. On the road — coming this way. It's Martinmas. Henning said.");
    await say(P.sib, "Put the fire out — kick earth over it. Then into the trees on the far side, and keep low. Don't move till he's gone.");
    G.lockMove = false; look(null);
  } else { fade(0, 1); }

  // ---- the fire out ----
  UI.objective("Put the fire out");
  mark([FIRE.x, FIRE.z, w.cy + 0.6]);
  let out = false;
  const fi = w.addInteract({ x: FIRE.x, y: w.cy + 0.5, z: FIRE.z, reach: 2.4, hold: 1.4, label: "Kick earth over the fire",
    onHoldTick: (dt, t) => { if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) SFX.pickup(); }, use: () => { out = true; } });
  await until(() => out);
  w.removeInteract(fi); w.lightFire(false);
  // ---- into the trees ----
  UI.objective("Hide in the trees on the far side — keep out of the lantern light");
  mark([HIDE.x, HIDE.z, w.cy + 0.8]);
  sib.stopFollow(); sib.walkTo(SIBHIDE.x, SIBHIDE.z, 2.4);
  tutor("hide", "", [["C", "crouch — only seen close to"], ["M", "keep the mouse"]], 7);
  const t0 = G.time;
  await until(() => Math.hypot(pl.pos.x - HIDE.x, pl.pos.z - HIDE.z) < 7 || G.time - t0 > 35);
  mark(null);
  UI.objective("Stay hidden until he goes");
  // ---- the charcoal buyer ----
  cart.visible = true;
  const door = [CABIN.x + Math.sin(CABIN.ry) * 4, CABIN.z + Math.cos(CABIN.ry) * 4];
  const route = [[30.5, -289], [31, -298], door, [FIELD.x + 2.5, FIELD.z + 1], [FIRE.x + 1.2, FIRE.z - 0.5], [STACK.x + 1.5, STACK.z + 1.5], [31, -298], [30, -284]];
  const remarks = { 2: "Empty, the old man said. Somebody's mended it, though.", 3: "Rye. Somebody has sown rye.", 4: "...Still warm.", 5: "Fresh-cut, this." };
  let creak = 0;
  const k = new Watchman(w, 88, route, { look: KESSLER, once: true, wait: 3.2, speed: 1.0, range: 11, light: w.lightPool[1],
    lines: ["Who's there?", "Someone there? Come out — I don't bite.", "Hm. A fox, is it?"],
    onArrive: i => { if (remarks[i]) bark("The charcoal buyer", remarks[i], 3.2); } });
  let caught = false;
  const watch = onFrame(dt => {
    UI.eye(Math.min(1, k.sus));
    if (k.sus > 1 && !caught) caught = true;
    creak -= dt; if (creak <= 0 && k.i < 2) { creak = 2.6; AUDIO.door(true, clamp(0.4 - Math.hypot(k.a.pos.x - pl.pos.x, k.a.pos.z - pl.pos.z) / 80, 0.05, 0.4)); }
  });
  const ok = await Promise.race([until(() => k.done).then(() => true), until(() => caught).then(() => false)]);
  watch(); UI.eye(0);
  if (!ok) {
    G.lockMove = true;
    bark("The charcoal buyer", "There. Two of you. Just as they said.", 2.5);
    await wait(1.4);
    await caughtScreen(TIPS_WOODS);
    return startChapter(8, { retry: true });
  }
  k.a.remove(); cart.visible = false;
  UI.objective(null);
  await wait(2);
  sib.walkTo(pl.pos.x + 1.2, pl.pos.z + 0.8, 1.4);
  await wait(2.2);
  G.lockMove = true; lookAt(sib, 2.5); sib.facePlayer();
  await say(P.sib, "He counted everything. The cabin, the rye, the stack. Like a bailiff.");
  await say(YOU(), "He said 'somebody'. He didn't say who.");
  await say(P.sib, "Not yet.");
  G.lockMove = false; look(null);

  // ---- night: Henning comes up the road ----
  await fade(1, 2);
  setAtmo("firelight"); w.lightFire(true); SFX.fireLoop(true);
  pl.place(FIRE.x - 1.9, FIRE.z + 0.3, Math.PI / 2 - 0.25); pl.seated = true;
  sib.path = []; sib.person.sitting = 1; sib.person.setPose("sit"); sib.place(FIRE.x + 1.9, FIRE.z + 0.4, -Math.PI / 2); sib.faceTo(FIRE.x, FIRE.z);
  const henning = spawn(HENNING, FIRE.x + 0.4, FIRE.z - 2.6, 0);
  henning.faceTo(FIRE.x, FIRE.z);
  look(new THREE.Vector3(henning.pos.x, w.cy + 1.5, henning.pos.z), 2);
  await fade(0, 2);
  await wait(1);
  await say("Henning", "His name's Kessler. He buys charcoal for the smiths in Hamburg, and he sells what he hears to whoever pays for it.");
  await say("Henning", "This year he asked about two children from the harbour. A grain merchant's two. There's money on them, he said.");
  await say(YOU(), "What did you tell him?");
  await say("Henning", "I told him the forester's cabin is empty. It is — as far as I know.");
  await wait(1);
  await say("Henning", "Now listen. Winter will be hard; the geese went over early. Get wood in — more than you think. And chink those walls with moss, or the wind will walk straight in and sit by your fire.");
  await say(P.sib, "Why do you help us?");
  await say("Henning", "I had a daughter. She'd be your age.");
  await wait(1.5);
  G.lockMove = true;
  await fade(1, 3);
  SFX.fireLoop(false); AUDIO.wind(false);
  writeSave({ unlocked: 9 });
  await narrate("Kessler did not come back. The snow came nine days after Martinmas.", 4.5);
  return startChapter(9);
}

// ===========================================================================
//  IX. THE FIRST WINTER
// ===========================================================================
async function ch9(w, opts = {}) {
  setAtmo("snowday"); G.bugs.setKind(null);
  AUDIO.music("woods"); AUDIO.wind(true, 0.9);
  const pl = G.player;
  const saved = (loadSave() || {}).winter || {};
  const S = { stack: saved.stack ?? 12, wood: saved.wood || 0, moss: saved.moss || [], chinked: !!saved.chinked };
  const persist = () => writeSave({ winter: { ...S } });
  homestead(w, { stack: S.stack, growth: 1 });
  w.setSnow(1, 0.35);
  pl.place(CABIN.x + Math.sin(CABIN.ry) * 4.5, CABIN.z + Math.cos(CABIN.ry) * 4.5, CABIN.ry + Math.PI);
  const sib = spawn(LOOKS[G.who === "brother" ? "sister" : "brother"], FIRE.x + 1.4, FIRE.z + 0.6, -Math.PI / 2);
  // split firewood, stacked against the cabin
  const pile = new THREE.Group(); w.root.add(pile);
  const setPile = n => {
    pile.clear(); if (!n) return;
    const b = new Builder(), c = Math.cos(CABIN.ry), sn = Math.sin(CABIN.ry);
    const px = CABIN.x + 3.3 * c, pz = CABIN.z - 3.3 * sn;
    for (let i = 0; i < n; i++) { const row = Math.floor(i / 4), col = i % 4; b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), 0x7a5634, px + (col - 1.5) * 0.22 * sn, w.cy + 0.1 + row * 0.19, pz + (col - 1.5) * 0.22 * c, Math.PI / 2, CABIN.ry, 0); }
    pile.add(b.build(MAT.rough));
  };
  setPile(S.wood);
  // moss under the snow on the rocks round the edge
  const MOSS = [0.4, 1.3, 2.2, 3.4, 4.3, 5.4].map((a, i) => ({ i, x: CLEARING.x + Math.cos(a) * 19, z: CLEARING.z + Math.sin(a) * 19 }));
  const mossObjs = {};
  for (const m of MOSS) {
    if (S.moss.includes(m.i)) continue;
    const y = w.heightAt(m.x, m.z), b = new Builder();
    b.add(new THREE.DodecahedronGeometry(0.7, 0), 0x6a665e, m.x, y + 0.2, m.z, 0.3, m.i, 0.2, 1.3, 0.6, 1.1, 0.06);
    b.add(new THREE.SphereGeometry(0.4, 8, 6), 0x4e6a30, m.x + 0.3, y + 0.5, m.z, 0, 0, 0, 1.2, 0.35, 1, 0.1);
    const o = b.build(MAT.rough); w.root.add(o); mossObjs[m.i] = o;
  }

  if (!opts.night) {
    await wait(0.2);
    const c = card("Nine days after Martinmas", "IX. The First Winter", 3.2);
    await wait(1.2); fade(0, 2.4); await c;
    if (!S.wood && !S.moss.length) {
      G.lockMove = true; lookAt(sib, 3); sib.facePlayer();
      await say(P.sib, "Henning was right. Look at it.");
      await say(P.sib, "We need firewood — a lot of it. Split what's left on the stack, at the block.");
      await say(P.sib, "And the walls. The wind comes through the gaps between the logs like they aren't there. There's moss on the rocks round the edge, under the snow. Stuff it into the chinks.");
      G.lockMove = false; look(null);
      tutor("split", "Put your back into it. Each log splits in two, and each half is an hour of warmth.", [["F", "hold at the block to split a log"]]);
    }
    const its = [];
    its.push(w.addInteract({ x: BLOCK.x, y: w.cy + 0.9, z: BLOCK.z, reach: 2.4, hold: 2.2, label: () => `Split a log (${S.stack} on the stack)`, can: () => S.stack > 0 && S.wood < 12,
      onHoldTick: (dt, t) => { if (Math.floor(t * 1.4) !== Math.floor((t - dt) * 1.4)) SFX.chop(); },
      use: () => { S.stack--; S.wood = Math.min(12, S.wood + 2); w.setStack(S.stack); setPile(S.wood); SFX.build(); persist(); } }));
    for (const m of MOSS) {
      if (S.moss.includes(m.i)) continue;
      const it = w.addInteract({ x: m.x, y: w.heightAt(m.x, m.z) + 0.5, z: m.z, reach: 2.4, hold: 1, label: "Pull the moss from under the snow",
        use: () => { S.moss.push(m.i); w.root.remove(mossObjs[m.i]); w.removeInteract(it); SFX.pickup(); persist(); if (S.moss.length === 1) bark(P.sib, "Frozen stiff, but it'll soften by the fire."); } });
      its.push(it);
    }
    const door = [CABIN.x + Math.sin(CABIN.ry) * 3.4, CABIN.z + Math.cos(CABIN.ry) * 3.4];
    its.push(w.addInteract({ x: door[0], y: w.cy + 1.2, z: door[1], reach: 3, hold: 4, label: "Chink the walls with moss", can: () => S.moss.length >= 6 && !S.chinked,
      onHoldTick: (dt, t) => { if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) SFX.pickup(); },
      use: () => { S.chinked = true; persist(); bark(P.sib, "Listen. You can't hear the wind in the walls now."); } }));
    const obj = onFrame(() => {
      const parts = [];
      if (S.wood < 12) parts.push(`Split firewood — ${S.wood} of 12`);
      if (!S.chinked) parts.push(S.moss.length < 6 ? `Gather moss — ${S.moss.length} of 6` : "Chink the cabin walls with the moss");
      UI.objective(parts.join(" · "));
    });
    await until(() => S.wood >= 12 && S.chinked);
    obj(); its.forEach(i => w.removeInteract(i));
    UI.objective(null);
    await wait(1.5);
    bark(P.sib, "Look at the sky. Get inside the firelight — it's coming.", 3);
    await wait(3);
  }

  // ---- the blizzard night: keep the fire alive until dawn ----
  G.lockMove = true;
  await fade(1, 2);
  setAtmo("snownight"); w.setSnow(1, 1); AUDIO.wind(true, 1.5); SFX.fireLoop(true);
  w.lightFire(true);
  let fire = 0.8, wood = 12, night = 0;
  const DAWN = 85;
  setPile(wood);
  pl.place(FIRE.x - 1.9, FIRE.z + 0.3, Math.PI / 2 - 0.25);
  sib.path = []; sib.person.sitting = 1; sib.person.setPose("grieve"); sib.place(FIRE.x + 1.9, FIRE.z + 0.4, -Math.PI / 2); sib.faceTo(FIRE.x, FIRE.z);
  await fade(0, 2);
  G.lockMove = false;
  tutor("feed", "Don't let it go out. Feed it before it's embers — not after.", [["F", "feed the fire"]]);
  const feed = w.addInteract({ x: FIRE.x, y: w.cy + 0.6, z: FIRE.z, reach: 2.8, label: () => `Feed the fire (${wood} split logs)`, can: () => wood > 0,
    use: () => { wood--; fire = Math.min(1, fire + 0.32); setPile(wood); SFX.build(); } });
  const lines = [[12, "I can't feel my feet."], [30, "Tell me about the harbour. Anything. The smell of it."], [50, "Father used to say the winter's longest just before it turns."], [70, "It's getting lighter. Isn't it? Say it is."]];
  let gust = 6, failed = false;
  const tick = onFrame(dt => {
    night += dt;
    gust -= dt; let drop = 0.043 * dt;
    if (gust <= 0) { gust = 5 + Math.random() * 7; drop += 0.08; }
    fire = Math.max(0, fire - drop);
    w.setFire(fire);
    while (lines.length && night > lines[0][0]) bark(P.sib, lines.shift()[1], 3.5);
    const left = Math.max(0, DAWN - night);
    UI.objective(`Keep the fire alive until dawn — ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")} · fire ${Math.round(fire * 100)}%`);
    if (fire <= 0.001) failed = true;
  });
  await until(() => failed || night >= DAWN);
  tick(); w.removeInteract(feed); UI.objective(null);
  if (failed) {
    G.lockMove = true;
    await fade(1, 2);
    await narrate("The fire went out. The cold came in, and it did not leave.", 4);
    writeSave({ winter: { ...S, wood: 12 } });
    return startChapter(9, { night: true });
  }
  // ---- dawn ----
  G.lockMove = true;
  setAtmo("snowday"); w.setSnow(1, 0.1); AUDIO.wind(true, 0.4);
  look(new THREE.Vector3(sib.pos.x, w.cy + 1.1, sib.pos.z), 2);
  await wait(1.5);
  await say(P.sib, "...It's light.");
  await say(YOU(), "It's light.");
  await wait(1.5);
  await fade(1, 3);
  SFX.fireLoop(false); AUDIO.wind(false);
  writeSave({ unlocked: 10, winter: { ...S, done: true } });
  await narrate("It was a long winter. We ate the turnips, and then we ate less.", 4.5);
  await narrate("But when the snow went, we were still there. And so was the rye.", 4.5);
  return startChapter(10);
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
