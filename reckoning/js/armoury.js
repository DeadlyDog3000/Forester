// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE ARMOURY. Pay earned on the field, in the coin of the colours you fight in — a battle won or lost, a duel, a
// day's first victory — each team's purse its own, and spent on arms,
// on the right to march in another crown's colours, and on how your own arms look. Never sold for money: every ducat
// is earned. And none of it buys a ranked fight: against another player each side fights with its team's own arms (the
// kit that crown's soldiers really carried in 1683), all of it to hand whether you've bought it or not — what you've
// bought is for battles against bots and the historical ones. What shows in a ranked fight is only what's yours to
// look at: the stain on your stock, the metal of your fittings, a sling, a sword knot. The steel is never painted: a
// blade, a barrel, a lock, a spearhead are steel, and stay it.
//
// Kept on this computer, as your record is.

import { taken } from "./colours.js";
import { THREE } from "./core.js";
import { makeArm, makeCrossbow, makeBow, modelCopy, ensureModel, fpMusket } from "./models.js";

// (the third armoury, 1.99.254: everyone begun again once more — the first's and second's purses and arms set aside)
const KEY = "reckoning.armoury.3";

// ---- the arms, and what each costs (a bow and a knife to begin with: what a man could make or find) ----
export const WEAPON_PRICE = { none: 0, bow: 0, dagger: 0, spear: 120, axe: 120, warclub: 150, crossbow: 240, pistol: 270, sword: 300, battleaxe: 360, musket: 450 };

// ---- the teams: each crown's colours, its price, and the arms its soldiers carried in 1683 (a ranked fight's kit) ----
// (the West's foot all alike: the musket — matchlock or flintlock — the plug bayonet, the pike (a spear here), the
//  sword every foot soldier still wore, the pistol a horseman's or an officer's, the hatchet a grenadier's or a
//  pioneer's. No bows, no crossbows: gone from Europe's armies a century and more)
const WEST = { long: ["musket", "none"], side: ["pistol", "none"], blade: ["dagger", "sword", "spear", "axe", "none"] };
const WEST_WHY = "Musket and plug bayonet, the pike, a sword at every hip, pistols for horse and officers, a hatchet for the grenadiers. No bow or crossbow: a century gone from the armies of the West.";
export const TEAMS = {
  tatar: { price: 0, kit: { long: ["bow", "none"], side: ["none"], blade: ["sword", "dagger", "spear"] }, why: "The Crimean Khan's horsemen rode to Vienna in 1683 with the composite bow, the sabre and the lance — the last great army of archers in Europe." },
  hamburg: { price: 180, kit: { long: ["musket", "none"], side: ["none"], blade: ["dagger", "spear", "axe", "sword", "none"] }, why: "A free city's burghers turned out with what the arsenal gave them: muskets, pikes, halberds and hangers. No pistols for the militia." },
  muscovite: { price: 360, kit: { long: ["musket", "none"], side: ["none"], blade: ["battleaxe", "sword", "dagger", "none"] }, why: "The streltsy carried the musket and the berdysh — a long crescent axe that was also the rest they fired from — and the sabre." },
  polish: { price: 450, kit: { long: ["musket", "none"], side: ["pistol", "none"], blade: ["battleaxe", "sword", "dagger", "none"] }, why: "Sobieski's haiduks: the musket, the czekan or berdysh axe, the szabla; pistols for the horse." },
  ottoman: { price: 540, kit: { long: ["musket", "bow", "none"], side: ["pistol", "none"], blade: ["sword", "battleaxe", "dagger", "none"] }, why: "The Janissaries fought with the long tüfek musket and the yatagan, still trained with the bow, and carried pistols and the teber axe." },
  danish: { price: 600, kit: WEST, why: WEST_WHY },
  dutch: { price: 660, kit: WEST, why: WEST_WHY },
  saxon: { price: 660, kit: WEST, why: WEST_WHY },
  bavarian: { price: 660, kit: WEST, why: WEST_WHY },
  brandenburg: { price: 720, kit: WEST, why: WEST_WHY },
  spanish: { price: 780, kit: WEST, why: "The tercios had kept the pike longest of all — still a third of the foot in 1683 — with the musket, the sword and the pistol. No bows." },
  swedish: { price: 900, kit: WEST, why: "The Caroleans went in with the musket, the pike and the sword, and were drilled to close with cold steel. No bows." },
  english: { price: 900, kit: WEST, why: WEST_WHY },
  french: { price: 960, kit: WEST, why: "Louis XIV's foot was the first to take the bayonet to every company; musket, pike and sword besides. No bows." },
  // (more crowns of 1683, each in its own coat and with its own arms)
  cossack: { price: 300, kit: { long: ["musket", "bow", "none"], side: ["pistol", "none"], blade: ["sword", "spear", "dagger", "none"] }, why: "The Zaporozhian Host: the samopal musket, the sabre and the lance — the foot famous shots from behind their wagon forts, the horse light and quick." },
  hungarian: { price: 420, kit: { long: ["musket", "none"], side: ["pistol", "none"], blade: ["sword", "battleaxe", "dagger", "none"] }, why: "Thököly's kuruc and the hajdús: the musket and the curved sabre, the fokos war-hammer, and pistols for the hussars." },
  haudenosaunee: { price: 540, kit: { long: ["musket", "bow", "none"], side: ["none"], blade: ["warclub", "axe", "dagger", "none"] }, why: "The Five Nations: trade muskets and the bow, the ball-headed war club and the hatchet. They fought in the woods, loose and from cover." },
  portuguese: { price: 600, kit: WEST, why: "King Pedro II's terços: the musket, the pike and the sword, as the armies of the West carried them. No bows." },
  savoyard: { price: 660, kit: WEST, why: "Duke Victor Amadeus's foot: musket, pike and sword. No bows." },
  scottish: { price: 690, kit: { long: ["musket", "none"], side: ["pistol", "none"], blade: ["sword", "dagger", "axe", "spear", "none"] }, why: "King James's Scots: musket and pike in the regiments; the Highland clans with musket, broadsword and targe, and the Lochaber axe." },
  venetian: { price: 720, kit: WEST, why: "The Serenissima's oltremarini and Schiavoni — Dalmatian and Albanian soldiers — with the musket and the basket-hilted schiavona." },
  imperial: { price: 1050, kit: WEST, why: "The Emperor's regiments that held Vienna: musket, pike and sword, and the hatchet for the grenadiers. No bows." },
};
export const TEAM_KEYS = Object.keys(TEAMS);
// (a weapon no army of 1683 still fielded: yours to buy and carry against bots, never in a ranked fight)
export const NOT_IN_1683 = {
  crossbow: "No army of 1683 still fielded crossbows — a hunter's arm by then. Yours against bots; no kingdom carries it in a ranked fight.",
  warclub: "The ball-headed club of the Eastern Woodlands' nations, who aren't a kingdom here. Yours against bots; not in a ranked fight.",
};

// ---- how your arms look: the finishes, and which each arm takes ----
// wood: a stain over the grain (a multiplier); fit: the metal of the fittings (never the steel); grip: the leather or
// cloth of a grip; knot: a cord and tassel; sling: a strap
export const FINISH = {
  wood: { natural: ["As it grew", 0, [1, 1, 1]], walnut: ["Walnut stain", 60, [0.62, 0.5, 0.42]], honey: ["Honey oil", 60, [1.18, 0.98, 0.72]], red: ["Red-stained", 90, [1.0, 0.56, 0.46]], ebony: ["Ebonised", 120, [0.3, 0.27, 0.25]] },
  fit: { made: ["As made", 0, null], brass: ["Brass", 45, 0xb8913f], iron: ["Iron", 45, 0x6e7074], silver: ["Silver", 150, 0xc9cdd3], gilt: ["Gilt", 180, 0xd8b048], black: ["Blackened", 90, 0x2a2a2c] },
  grip: { made: ["As made", 0, null], black: ["Black", 30, 0x1e1a18], red: ["Red", 60, 0x8e2420], green: ["Green", 60, 0x2e5230], blue: ["Blue", 60, 0x283e6e], buff: ["Buff", 45, 0xc8b088] },
  knot: { none: ["None", 0, null], red: ["Red knot", 45, 0x9a2420], gold: ["Gold knot", 90, 0xd4a83a], white: ["White knot", 45, 0xe6e0d0], blue: ["Blue knot", 45, 0x2a4a8a], black: ["Black knot", 45, 0x1c1a18] },
  sling: { none: ["None", 0, null], leather: ["Leather sling", 45, 0x5a3a22], buff: ["Buff sling", 60, 0xc8b088], red: ["Red sling", 75, 0x8e2420], white: ["White sling", 75, 0xdcd6c4] },
};
export const SLOT_NAME = { wood: "Wood", fit: "Fittings", grip: "Grip", knot: "Knot", sling: "Sling" };
// (which parts each arm has to finish: what's steel, or one cast piece with its steel, has only what can hang from it)
export const SLOTS = {
  musket: ["wood", "fit", "sling"], pistol: ["wood", "fit", "knot"], bow: ["wood", "grip", "knot"], crossbow: ["wood", "sling", "knot"],
  sword: ["knot"], dagger: ["knot"], axe: ["knot"], battleaxe: ["wood", "fit", "grip", "knot"], spear: ["wood", "fit", "knot"], warclub: ["wood", "grip", "knot"],
};
// (which of an arm's materials are which part: by name in the models, by colour in the ones built here)
const PARTS = {
  musket: { wood: /musket_(pbr|wood)/, fit: /musket_brass/ }, bayonet: { wood: /musket_(pbr|wood)/, fit: /musket_brass/ },
  pistol: { wood: /pistol_(pbr|wood)/, fit: /pistol_brass/ }, bow: { wood: /bow_wood/, grip: /bow_cloth/ },
  battleaxe: { wood: /battleaxe_wood/, fit: /battleaxe_iron/, grip: /battleaxe_leather/ }, spear: { wood: /spear_wood/, fit: /spear_iron/ },
};
const WOOD_HEX = new Set([0x8a6440, 0x5a3e26, 0x5a3820, 0x3e2614, 0x4e2f19, 0x9a7448]), GRIP_HEX = new Set([0x3a2818, 0x3a2c1e]);

// ---- each crown's own money: you're paid in the coin of the colours you fight in, and spend it there. Prices are
// kept in one measure (a gold ducat's worth) and shown in each coin at about its rate in the 1680s — a ducat was some
// two thalers or rixdollars, four gulden, five Dutch guilders, six Hamburg marks, nine and a half English shillings,
// seven livres, seventeen Spanish reales, twelve Polish złoty, a Muscovite ruble of a hundred kopecks, and three
// hundred of the Ottoman (and the Crimean) silver akçe ----
export const COINS = {
  tatar: ["akçe", 300, "the Crimean Khan's silver akçe"], ottoman: ["akçe", 300, "the Sultan's silver akçe"], muscovite: ["kopecks", 100, "the Tsar's wire kopecks"],
  polish: ["złoty", 12, "the Commonwealth's złoty"], hamburg: ["marks", 6, "the Hamburg mark lübsch"], danish: ["rigsdaler", 2, "the Danish rigsdaler"],
  dutch: ["guilders", 5, "the Dutch guilder"], saxon: ["thalers", 2, "the Saxon thaler"], bavarian: ["gulden", 4, "the Bavarian gulden"],
  brandenburg: ["thalers", 2, "the Brandenburg thaler"], spanish: ["reales", 17, "the Spanish real"], swedish: ["riksdaler", 2, "the Swedish riksdaler"],
  english: ["shillings", 9.5, "the English shilling"], french: ["livres", 7, "the French livre tournois"], imperial: ["gulden", 4, "the Emperor's gulden"],
  cossack: ["złoty", 12, "the Polish złoty the Host was paid in"], hungarian: ["forints", 4, "the Hungarian forint"], haudenosaunee: ["fathoms of wampum", 3, "wampum: shell beads, strung by the fathom"],
  portuguese: ["réis", 400, "the Portuguese real"], savoyard: ["lire", 6, "the Savoyard lira"], scottish: ["merks", 3, "the Scots merk"], venetian: ["lire", 8, "the Venetian lira"],
};
const coinOf = t => COINS[t] || COINS.tatar;
// (an amount, in one crown's coin: "450 akçe", "38 thalers")
export const money = (v, t = team()) => `${Math.round(v * coinOf(t)[1]).toLocaleString("en")} ${coinOf(t)[0]}`;
export const coinName = (t = team()) => coinOf(t)[2];

// ---- gunsmiths' work: bought for an arm, kept with your team's arms (in a ranked fight every arm is fully fitted) ----
export const UPGRADES = {
  musket: {
    sights: { name: "Sights", price: 180, note: "A V-notched rear leaf at the breech and a brass foresight at the muzzle, fitted by a gunsmith. Issue muskets of 1683 had at most a bead; a hunter's or an officer's piece had both." },
    cartridges: { name: "Paper cartridges", price: 210, pace: 1.15, note: "Powder and ball made up beforehand in paper, as Europe's armies did by the 1680s: about a seventh quicker to load." },
  },
  pistol: { cartridges: { name: "Paper cartridges", price: 150, pace: 1.15, note: "Charges made up in paper: about a seventh quicker to load." } },
  crossbow: { lever: { name: "Goat's-foot lever", price: 150, pace: 1.3, note: "Spanned with a lever instead of the windlass: quicker to draw back." } },
  bow: { thumbring: { name: "Thumb ring", price: 120, pace: 1.15, note: "The steppe archer's horn ring on the thumb: the string drawn and loosed quicker." } },
};

// ---------------------------------------------------------------------------
//  what you have: kept on this computer — a purse, arms, gunsmiths' work and finishes for each team: a musket bought
//  for the Swedes is the Swedes' own, with its own work and its own look, not the Poles' musket too
// ---------------------------------------------------------------------------
let S = null, seed = null, team = () => "tatar";
// seed: for a player who fought before there were purses — what they carried and wore kept, and pay for what they'd
// fought, in the coin of the colours they wore. teamOf: the colours you're marching in now
export function initArmoury(s, teamOf) { seed = s; if (teamOf) team = teamOf; state(); }
const START = ["bow", "dagger", "none"];
function state() {
  if (S) return S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!S || typeof S !== "object" || !S.v) {
    S = { v: 2, purse: {}, own: {}, up: {}, teams: ["tatar"], fin: [], skin: {}, day: "" };
    void seed;   // (since 1.99.252 nobody carries anything over: every player begins as the Tatars, with a bow and a knife)
    try { localStorage.removeItem("reckoning.armoury"); localStorage.removeItem("reckoning.armoury.2"); } catch (e) {}
    save();
  }
  S.purse ||= {}; S.own ||= {}; S.up ||= {}; S.teams ||= ["tatar"]; S.fin ||= []; S.skin ||= {};
  // (the finishes, once one set for every team: what was bought before kept by every team you had then)
  if (!S.finT) { S.finT = {}; S.skinT = {}; for (const t of S.teams) { S.finT[t] = [...S.fin]; S.skinT[t] = JSON.parse(JSON.stringify(S.skin)); } save(); }
  S.skinT ||= {};
  return S;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
// (what's in the purse of a team: in ducats' worth — shown with money())
export const ducats = (t = team()) => state().purse[t] | 0;
export const owns = (k, t = team()) => WEAPON_PRICE[k] === 0 || (state().own[t] || []).includes(k);
export const ownsTeam = k => !!TEAMS[k] && (TEAMS[k].price === 0 || state().teams.includes(k));
// (a finish is bought for one arm: gilt on your musket is your musket's, not your pistol's too)
export const ownsFinish = (slot, id, kind, t = team()) => !FINISH[slot] || !FINISH[slot][id] || FINISH[slot][id][1] === 0 || (state().finT[t] || []).includes(`${kindKey(kind)}.${slot}.${id}`);
export const ownsUp = (kind, id, t = team()) => (state().up[t] || []).includes(`${kind}.${id}`);
// (a word for whoever fought before the armoury: once)
export function welcome() { const s = state(); if (!s.welcome) return null; const t = s.welcome; s.welcome = false; save(); return `The armoury is open. For the battles you've already fought you have ${money(s.purse[t] | 0, t)} in the ${(TEAMS[t] && t) ? "purse of your colours" : "purse"}, and you keep the arms and colours you were using.`; }
function spend(n) { const s = state(), t = team(); if ((s.purse[t] | 0) < n) return false; s.purse[t] = (s.purse[t] | 0) - n; save(); return true; }
export function buyWeapon(k) { if (owns(k)) return true; if (!spend(WEAPON_PRICE[k])) return false; const s = state(), t = team(); (s.own[t] ||= [...START]).push(k); save(); return true; }
// (a crown's men are raised only once you've taken its colours in battle: see colours.js)
export const teamOpen = k => ownsTeam(k) || taken(k) > 0;
export function buyTeam(k) { if (ownsTeam(k)) return true; if (!teamOpen(k)) return false; if (!spend(TEAMS[k].price)) return false; state().teams.push(k); save(); return true; }
export function buyFinish(slot, id, kind) { if (ownsFinish(slot, id, kind)) return true; if (!spend(FINISH[slot][id][1])) return false; (state().finT[team()] ||= []).push(`${kindKey(kind)}.${slot}.${id}`); save(); return true; }
export function buyUp(kind, id) { if (ownsUp(kind, id)) return true; if (!spend(UPGRADES[kind][id].price)) return false; const s = state(), t = team(); (s.up[t] ||= []).push(`${kind}.${id}`); save(); return true; }
export const finishOf = (kind, slot, t = team()) => { const k = kindKey(kind), v = ((state().skinT[t] || {})[k] || {})[slot]; return FINISH[slot] && FINISH[slot][v] && ownsFinish(slot, v, k, t) ? v : Object.keys(FINISH[slot])[0]; };
export function setFinish(kind, slot, id) { if (!ownsFinish(slot, id, kind)) return false; const s = state(), k = kindKey(kind), T = s.skinT[team()] ||= {}; (T[k] ||= {})[slot] = id; save(); return true; }
const kindKey = k => k === "bayonet" ? "musket" : k;

// ---- the arms you may carry: a ranked fight, your team's; otherwise, what you own ----
export const inKit = (t, slot, id) => { const T = TEAMS[t] || TEAMS.tatar; return T.kit[slot].includes(id); };
// a loadout made to fit: each slot that isn't allowed taken back to the first that is (and fit, the pvp's own rules)
export function fitTo(lo, ranked, t, fit) {
  const ok = (slot, id) => ranked ? inKit(t, slot, id) : owns(id, t);
  const o = { long: lo.long, side: lo.side, blade: lo.blade };
  const first = slot => ranked ? (TEAMS[t] || TEAMS.tatar).kit[slot][0] : ({ long: ["bow", "none"], side: ["none"], blade: ["dagger"] })[slot].find(id => owns(id, t));
  for (const slot of ["long", "side", "blade"]) if (!ok(slot, o[slot])) o[slot] = first(slot);
  let f = fit ? fit(o, "long") : o;
  for (const slot of ["long", "side", "blade"]) if (!ok(slot, f[slot])) f[slot] = first(slot);
  return f;
}
// what your arms look like, for those who'll see them: only the arms you carry, only what isn't plain
export function skinOf(lo, t = team()) {
  const out = {}, s = state().skinT[t] || {};
  // (each arm's own finishes, and only those bought for it)
  for (const k0 of [lo.long, lo.side, lo.blade]) { const k = k0 && kindKey(k0); if (!k || k === "none" || !s[k] || !SLOTS[k]) continue; const o = {}; for (const sl of SLOTS[k]) { const v = finishOf(k, sl, t); if (FINISH[sl][v][1] > 0) o[sl] = v; } if (Object.keys(o).length) out[k] = o; }
  return Object.keys(out).length ? out : undefined;
}
// the gunsmiths' work on what you carry: in a ranked fight all of it, for everyone; otherwise what your team has bought
export function upsOf(lo, ranked, t = team()) {
  const out = {};
  for (const k of [lo.long, lo.side]) if (UPGRADES[k]) for (const id in UPGRADES[k]) if (ranked || ownsUp(k, id, t)) (out[k] ||= {})[id] = true;
  return out;
}
// how much quicker each arm loads, from its upgrades
export function paceOf(ups) { const o = {}; for (const k in ups) for (const id in ups[k]) if (UPGRADES[k][id].pace) o[k] = (o[k] || 1) * UPGRADES[k][id].pace; return o; }

// ---- pay: what a fight earns, in the coin of the colours you fought in ----
// (the first new arm in two to five battles, a musket in ten or so; a crown's colours dearer, the best of them a long
//  campaign of battles — and a day's first win worth more, so a short evening still gets somewhere)
export function earn({ vsPlayer, won, kills = 0, left = false, under = 1 }, t = team()) {
  const s = state();
  let gain = vsPlayer ? (won ? 60 : 25) : (won ? 30 : 12);
  // (colours that lose more often than they win, by every battle counted: paid more for fighting in them)
  gain = Math.round(gain * Math.max(1, Math.min(1.5, under)));
  if (left) gain = Math.round(gain * (won ? 0.6 : 0));
  gain += Math.min(30, Math.max(0, kills | 0) * 2);
  const today = new Date().toISOString().slice(0, 10); let daily = 0;
  if (won && !left && s.day !== today) { daily = 40; s.day = today; }
  gain += daily; s.purse[t] = (s.purse[t] | 0) + gain; save();
  return { gain, daily, total: s.purse[t], team: t };
}
// (a prize paid straight into a team's purse: the challenge's, for a win)
export function grant(n, t = team()) { const s = state(); s.purse[t] = (s.purse[t] | 0) + Math.max(0, n | 0); save(); return { gain: n | 0, total: s.purse[t], team: t }; }
// the next thing within reach for this team: for the result's line
export function nextGoal(t = team()) {
  const d = ducats(t), w = Object.entries(WEAPON_PRICE).filter(([k, p]) => p > 0 && !owns(k, t)).sort((a, b) => a[1] - b[1])[0];
  const n = TEAM_KEYS.filter(k => !ownsTeam(k)).sort((a, b) => TEAMS[a].price - TEAMS[b].price)[0];
  const c = [w && { what: w[0], price: w[1], team: false }, n && { what: n, price: TEAMS[n].price, team: true }].filter(Boolean).sort((a, b) => a.price - b.price)[0];
  return c ? { ...c, short: Math.max(0, c.price - d) } : null;
}

// ---------------------------------------------------------------------------
//  how it looks: the finishes laid on an arm as it's made
// ---------------------------------------------------------------------------
const _avg = new WeakMap();
// (a texture's own average colour: so a finish's colour comes out as that colour, the grain still in it)
function avgOf(tex) {
  if (!tex || !tex.image) return null;
  if (_avg.has(tex)) return _avg.get(tex);
  let c = null;
  try {
    const cv = document.createElement("canvas"); cv.width = cv.height = 8; const x = cv.getContext("2d", { willReadFrequently: true });
    x.drawImage(tex.image, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    c = new THREE.Color().setRGB(r / 64 / 255, g / 64 / 255, b / 64 / 255, THREE.SRGBColorSpace);
  } catch (e) {}
  _avg.set(tex, c); return c;
}
// (a material of its own for this arm, so the finish isn't laid on every arm of its kind; its surface detail kept)
function own(o) {
  if (o.userData.skinMat) return o.material;
  const m = o.material, c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
  c.userData = { ...m.userData, c0: m.color.clone() }; o.material = c; o.userData.skinMat = true; return c;
}
const _c = new THREE.Color();
function paint(o, slot, id) {
  const F = FINISH[slot][id]; if (!F) return;
  const m = own(o);
  if (slot === "wood") { m.color.copy(m.userData.c0).multiply(_c.setRGB(...F[2])); return; }
  if (F[2] == null) { m.color.copy(m.userData.c0); return; }
  // (a colour of its own: worked out against the texture's, so the grain and the wear still show through it)
  const a = avgOf(m.map), t = _c.set(F[2]);
  if (a) m.color.setRGB(Math.min(3, t.r / Math.max(0.04, a.r)), Math.min(3, t.g / Math.max(0.04, a.g)), Math.min(3, t.b / Math.max(0.04, a.b))); else m.color.copy(t);
  if (slot === "fit") { m.metalness = id === "black" ? 0.5 : 0.8; m.roughness = id === "black" ? 0.55 : id === "silver" || id === "gilt" ? 0.28 : 0.38; }
}
// which part a piece of an arm is, if any (never the steel)
function partOf(kind, o) {
  const P = PARTS[kind], name = `${o.name} ${o.material && o.material.name || ""}`;
  if (P) { for (const slot in P) if (P[slot].test(name)) return slot; return null; }
  // (an arm built here, not a model: its wood and its leather by their colours)
  if (!o.material || Array.isArray(o.material) || (o.material.metalness || 0) > 0.2) return null;
  const h = (o.material.userData && o.material.userData.c0 || o.material.color).getHex();
  return WOOD_HEX.has(h) ? "wood" : GRIP_HEX.has(h) ? "grip" : null;
}
// lay a skin ({ wood, fit, grip, knot, sling } for this kind) on an arm just made: obj its root, kind what it is
export function skinArm(obj, kind, skin) {
  if (!obj || !skin) return obj;
  const slots = SLOTS[kindKey(kind)] || [];
  obj.traverse(o => {
    if (!o.isMesh || o.userData.skinPart || (o.parent && o.parent.visible === false && o.parent !== obj)) return;
    const p = partOf(kind, o); if (p && slots.includes(p) && skin[p]) paint(o, p, skin[p]);
  });
  const old = obj.getObjectByName("skin_addons"); if (old) old.parent.remove(old);
  const add = new THREE.Group(); add.name = "skin_addons";
  if (slots.includes("knot") && skin.knot && FINISH.knot[skin.knot] && FINISH.knot[skin.knot][2] != null) knotOn(obj, add, kindKey(kind), FINISH.knot[skin.knot][2]);
  if (slots.includes("sling") && skin.sling && FINISH.sling[skin.sling] && FINISH.sling[skin.sling][2] != null) slingOn(obj, add, kindKey(kind), FINISH.sling[skin.sling][2]);
  if (add.children.length) obj.add(add);
  return obj;
}
// (the arm's own extent, in its own frame)
function boxOf(obj) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), b = new THREE.Box3(), t = new THREE.Box3();
  obj.traverse(o => { if (o.isMesh && o.visible && o.geometry && !o.userData.skinPart) { o.geometry.computeBoundingBox && !o.geometry.boundingBox && o.geometry.computeBoundingBox(); t.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); b.union(t); } });
  return b;
}
const knotMats = {}, cordMat = c => knotMats[c] || (knotMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
// a sword knot: a loop of cord from the hilt, its tassel hanging (or from a spear below its head, from a pistol's butt,
// from a bow's grip)
function knotOn(obj, add, kind, col) {
  const b = boxOf(obj); if (b.isEmpty()) return;
  const len = b.max.y - b.min.y, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, M = cordMat(col);
  let at, dir = new THREE.Vector3(0, -1, 0);
  if (kind === "spear") at = new THREE.Vector3(cx, b.max.y - len * 0.13, cz);
  else if (kind === "bow") at = new THREE.Vector3(cx, (b.min.y + b.max.y) / 2 - 0.05, b.min.z);
  else if (kind === "crossbow") { at = new THREE.Vector3(cx, b.min.y, b.max.z - 0.06); }
  else at = new THREE.Vector3(cx, b.min.y + 0.005, cz);
  const g = new THREE.Group(); g.position.copy(at); g.userData.skinPart = true; add.add(g);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 4, 10), M); loop.userData.skinPart = true; g.add(loop);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.07, 4), M); cord.position.copy(dir).multiplyScalar(0.045); cord.userData.skinPart = true; g.add(cord);
  const tas = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.011, 0.05, 8), M); tas.position.copy(dir).multiplyScalar(0.1); tas.userData.skinPart = true; g.add(tas);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), M); head.position.copy(dir).multiplyScalar(0.077); head.userData.skinPart = true; g.add(head);
  for (const o of g.children) o.castShadow = true;
}
// a sling: a strap between the swivels, slack under the stock
function slingOn(obj, add, kind, col) {
  const b = boxOf(obj); if (b.isEmpty()) return;
  let A, B, sag;
  if (kind === "crossbow") { A = new THREE.Vector3(0, b.min.y + 0.01, b.max.z - 0.08); B = new THREE.Vector3(0, b.min.y + 0.01, b.min.z + 0.2); sag = new THREE.Vector3(0, -0.07, 0); }
  // (the musket's own swivels: under the butt's wrist and under the fore-end, by the middle band)
  else { A = new THREE.Vector3(0, -0.24, -0.1); B = new THREE.Vector3(0, 0.63, -0.016); sag = new THREE.Vector3(0, 0.02, -0.055); }
  const mid = A.clone().lerp(B, 0.5).add(sag);
  const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 4, false), new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }));
  m.scale.set(1, 1, 1); m.castShadow = true; m.userData.skinPart = true; add.add(m);
}

// ---- the gunsmith's work, to be seen: what each upgrade puts on (or beside) the arm ----
const UPM = {};
const upMat = (k, c, o = {}) => UPM[k] || (UPM[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o }));
// a cartridge box of the 1680s, as a musketeer wore it: a curved case of blackened leather with its flap thrown back on
// its hinge (the brass badge on it), and inside, a block of wood drilled for the charges — each a roll of paper round
// its powder and ball, tied off with thread at the neck and the end twisted shut; a few of the holes already empty
// (built standing up, +y the open top, +z the front: about 13 cm across)
let CART_GEO = null;
function cartridgeGeo() {
  if (CART_GEO) return CART_GEO;
  // (turned, as a lathe would: the rounded bottom where the ball sits, the paper tube, the neck drawn in by the thread,
  //  and the twisted tail above it)
  const r = 0.0072, P = [[0, 0], [r * 0.7, 0.0008], [r, 0.004], [r, 0.05], [r * 0.97, 0.0535], [r * 0.6, 0.057], [r * 0.5, 0.0585], [r * 0.62, 0.061], [r * 0.58, 0.0645], [r * 0.4, 0.0675], [r * 0.18, 0.0695], [0, 0.07]];
  const g = new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x, y)), 14);
  // (the tail twisted: each ring above the neck turned a little more)
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > 0.059) { const t = (y - 0.059) * 90, x = pos.getX(i), z = pos.getZ(i), c = Math.cos(t), s = Math.sin(t); pos.setXYZ(i, x * c - z * s, y, x * s + z * c); } }
  g.computeVertexNormals();
  return CART_GEO = g;
}
const paperTex = (() => { let t = null; return () => {
  if (t) return t;
  // (laid paper: its fibres, the faint lines of the mould, and the grey of the powder showing through low down)
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 128; const x = cv.getContext("2d");
  x.fillStyle = "#d8c7a0"; x.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${120 + Math.random() * 60},${100 + Math.random() * 50},${70 + Math.random() * 40},${Math.random() * 0.12})`; x.fillRect(Math.random() * 64, Math.random() * 128, 1 + Math.random() * 3, 1); }
  for (let y = 0; y < 128; y += 4) { x.fillStyle = "rgba(90,70,40,0.06)"; x.fillRect(0, y, 64, 1); }
  const gr = x.createLinearGradient(0, 128, 0, 40); gr.addColorStop(0, "rgba(60,58,56,0.35)"); gr.addColorStop(1, "rgba(60,58,56,0)"); x.fillStyle = gr; x.fillRect(0, 40, 64, 88);
  t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }; })();
export function cartridgeBox(k = 1) {
  const g = new THREE.Group(); g.scale.setScalar(k);
  const leather = upMat("boxLeather", 0x241710, { roughness: 0.62 }), edge = upMat("boxEdge", 0x3a2618, { roughness: 0.7 });
  const wood = upMat("boxWood", 0x6a4628, { roughness: 0.8 }), hole = upMat("boxHole", 0x120c08, { roughness: 1 });
  const brass = upMat("brass", 0xb8913f, { metalness: 0.8, roughness: 0.35 }), thread = upMat("thread", 0x6a5034, { roughness: 1 });
  const W = 0.13, H = 0.07, D = 0.045, R = 0.012;
  // (the case: a rounded box, its front curved to sit against the hip)
  const sh = new THREE.Shape(); sh.moveTo(-W / 2 + R, -D / 2); sh.lineTo(W / 2 - R, -D / 2); sh.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + R); sh.lineTo(W / 2, D / 2 - R); sh.quadraticCurveTo(W / 2, D / 2, W / 2 - R, D / 2 + 0.004); sh.quadraticCurveTo(0, D / 2 + 0.012, -W / 2 + R, D / 2 + 0.004); sh.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - R); sh.lineTo(-W / 2, -D / 2 + R); sh.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + R, -D / 2);
  const cg = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
  cg.rotateX(-Math.PI / 2); const cs = new THREE.Mesh(cg, leather); cs.castShadow = true; g.add(cs);
  // (its stitched rim, a shade lighter)
  const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false, curveSegments: 6 }), edge); rim.geometry.rotateX(-Math.PI / 2); rim.position.y = H - 0.002; rim.scale.set(1.02, 1, 1.04); g.add(rim);
  // (the block, its top just below the rim, drilled in two rows)
  const blk = new THREE.Mesh(new THREE.BoxGeometry(W - 0.01, 0.006, D - 0.008), wood); blk.position.y = H - 0.005; g.add(blk);
  const C = cartridgeGeo(), pm = new THREE.MeshStandardMaterial({ map: paperTex(), color: 0xf0e4c8, roughness: 0.95 });
  const N = 6, empty = new Set([1, 8]);
  for (let row = 0; row < 2; row++) for (let i = 0; i < N; i++) {
    const n = row * N + i, x = (i - (N - 1) / 2) * 0.019 + (row ? 0.0095 : 0), z = row ? 0.009 : -0.009;
    const hm = new THREE.Mesh(new THREE.CircleGeometry(0.0078, 12), hole); hm.rotation.x = -Math.PI / 2; hm.position.set(x, H - 0.0018, z); g.add(hm);
    if (empty.has(n)) continue;
    // (each charge standing in its hole, its tail showing above the block, none quite upright or the same)
    const c = new THREE.Mesh(C, pm); c.position.set(x, H - 0.056 + Math.random() * 0.004, z); c.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * 6.28, (Math.random() - 0.5) * 0.12); c.castShadow = true; g.add(c);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.0034, 0.0007, 4, 12), thread); tie.rotation.x = Math.PI / 2; tie.position.set(0, 0.0585, 0); c.add(tie);
  }
  // (the flap, thrown back on its hinge at the top of the back, and the brass badge on it — an oval, the crown's mark)
  const fg = new THREE.Group(); fg.position.set(0, H + 0.002, -D / 2 - 0.002); fg.rotation.x = -2.35; g.add(fg);
  const fs = new THREE.Shape(); fs.moveTo(-W / 2 - 0.002, 0); fs.lineTo(W / 2 + 0.002, 0); fs.lineTo(W / 2 + 0.002, 0.05); fs.quadraticCurveTo(0, 0.068, -W / 2 - 0.002, 0.05); fs.lineTo(-W / 2 - 0.002, 0);
  const flap = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1 }), leather); flap.castShadow = true; fg.add(flap);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.002, 24), brass); badge.scale.set(1.3, 1, 1); badge.rotation.x = Math.PI / 2; badge.position.set(0, 0.032, -0.0015); fg.add(badge);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), brass); boss.scale.set(1, 1, 0.4); boss.position.set(0, 0.032, -0.003); fg.add(boss);
  // (the belt loops on its back)
  for (const sx of [-1, 1]) { const lp = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.004), edge); lp.position.set(sx * 0.035, H / 2, -D / 2 - 0.004); g.add(lp); }
  return g;
}
export function fitUps(obj, kind, ups = {}) {
  const old = obj.getObjectByName("up_parts"); if (old) old.parent.remove(old);
  const g = new THREE.Group(); g.name = "up_parts";
  const leather = upMat("leather", 0x3a2414), brass = upMat("brass", 0xb8913f, { metalness: 0.8, roughness: 0.35 }), paper = upMat("paper", 0xe8dcc0, { roughness: 0.95 }), horn = upMat("horn", 0x5a4a38, { roughness: 0.45 }), iron = upMat("iron", 0x4a4c50, { metalness: 0.7, roughness: 0.45 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  // paper cartridges: the cartridge box hung under the stock, its flap thrown back
  if (ups.cartridges && (kind === "musket" || kind === "pistol")) {
    // (stood on the table beside the stock, its open top up and its front to you: the arm's along +y, its top +z, its
    //  right side — the lock's, the side you see it from — +x)
    const box = cartridgeBox(kind === "musket" ? 1.25 : 0.9), V = (x, y, z) => new THREE.Vector3(x, y, z);
    box.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0)));
    if (kind === "musket") box.position.set(0.16, -0.12, -0.14); else box.position.set(0.12, -0.02, -0.12);
    g.add(box);
  }
  // the goat's-foot lever: hung on the tiller's right side, its two claws forward
  if (ups.lever && kind === "crossbow") {
    box(0.016, 0.016, 0.3, iron, 0.045, -0.02, -0.05);
    for (const sd of [-1, 1]) { const c = box(0.008, 0.008, 0.09, iron, 0.045 + sd * 0.018, -0.02, -0.22); c.rotation.y = sd * 0.25; }
    box(0.03, 0.02, 0.02, leather, 0.045, -0.02, 0.1);
  }
  // the thumb ring: horn, on a cord at the bow's grip
  if (ups.thumbring && kind === "bow") {
    const b = new THREE.Box3().setFromObject(obj), cy = (b.min.y + b.max.y) / 2;
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.006, 8, 18), horn); r.position.set((b.min.x + b.max.x) / 2 + 0.03, cy - 0.06, (b.min.z + b.max.z) / 2); r.castShadow = true; g.add(r);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 4), upMat("cord", 0x6a5034)); cord.position.set(r.position.x - 0.012, cy - 0.03, r.position.z); cord.rotation.z = 0.5; g.add(cord);
  }
  if (g.children.length) obj.add(g);
  return obj;
}

// ---------------------------------------------------------------------------
//  the arm on the table: turned slowly in the light, for the armoury tab
// ---------------------------------------------------------------------------
export function makeFor(kind, ups = {}) {
  // (the musket on the table as it is in your hands: its lock, and its sights if it has them)
  if (kind === "musket") { const m = fpMusket({ sights: !!ups.sights }); if (m) return m; }
  if (kind === "bow") { const g = new THREE.Group(), b = makeBow({ string: true }); b.rotation.y = Math.PI; g.add(b); return g; }
  if (kind === "crossbow") return makeCrossbow();
  return makeArm(kind);
}
// (where on each arm its gunsmith's work is, to look at it close)
export const UP_FOCUS = { musket: { sights: [0, 0.12, 0.05], cartridges: [0.16, -0.12, -0.08] }, pistol: { cartridges: [0.1, -0.02, -0.07] }, crossbow: { lever: [0.045, -0.02, -0.08] } };
export const MODEL_OF = { musket: "musket", pistol: "pistol", bow: "bow", sword: "sword", battleaxe: "battleaxe", spear: "spear", dagger: "dagger", axe: "axe" };
export class Table {
  constructor(canvas) {
    this.cv = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
    this.scene.add(new THREE.HemisphereLight(0xfff2dc, 0x3a2c20, 1.4));
    const k = new THREE.DirectionalLight(0xffe8c8, 2.6); k.position.set(2, 3, 2); this.scene.add(k);
    const r = new THREE.DirectionalLight(0xc8d8ff, 1.1); r.position.set(-2, 1, -2); this.scene.add(r);
    // (something for the metal to shine with: a soft room of light)
    try { const pm = new THREE.PMREMGenerator(this.r), env = new THREE.Scene(); env.background = new THREE.Color(0x6a5a48); const s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d8, side: THREE.BackSide })); s.scale.set(1, 0.6, 1); env.add(s); this.scene.environment = pm.fromScene(env, 0.04).texture; this.scene.environmentIntensity = 0.6; } catch (e) {}
    // (turned in the hand: dragged round and over, brought closer with the wheel, or a pinch; double-click to set it down
    //  as it was)
    this.spin = 0.5; this.tilt = 0.25; this.zoom = 1; this.obj = null; this.on = false; this.drag = null; this.idle = 0;
    canvas.style.touchAction = "none"; canvas.style.cursor = "grab";
    const pts = new Map();
    canvas.addEventListener("pointerdown", e => { pts.set(e.pointerId, [e.clientX, e.clientY]); this.drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
    canvas.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      if (pts.size === 2) { const [a, b] = [...pts.values()], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pts.set(e.pointerId, [e.clientX, e.clientY]); const [c, d] = [...pts.values()], d1 = Math.hypot(c[0] - d[0], c[1] - d[1]); if (d0 > 0) this.zoom = Math.max(0.35, Math.min(1.6, this.zoom * d0 / d1)); return; }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (!this.drag) return;
      this.spin += (e.clientX - this.drag[0]) * 0.01; this.tilt = Math.max(-1.3, Math.min(1.3, this.tilt + (e.clientY - this.drag[1]) * 0.008));
      this.drag = [e.clientX, e.clientY]; this.idle = 0;
    });
    const up = e => { pts.delete(e.pointerId); if (!pts.size) { this.drag = null; canvas.style.cursor = "grab"; } };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", e => { e.preventDefault(); this.zoom = Math.max(0.35, Math.min(1.6, this.zoom * Math.exp(e.deltaY * 0.0012))); this.idle = 0; }, { passive: false });
    canvas.addEventListener("dblclick", () => { this.spin = 0.5; this.tilt = 0.25; this.zoom = 1; });
    const loop = () => { if (!this.on) return; requestAnimationFrame(loop); this.draw(); };
    this.loop = loop;
  }
  // focus: a point on the arm (its own frame) to bring close and to the middle — an upgrade being looked at
  async show(kind, skin, ups = {}, focus = null) {
    this.kind = kind; const want = kind;
    if (MODEL_OF[kind]) await ensureModel(MODEL_OF[kind]).catch(() => {});
    if (this.kind !== want) return;
    if (this.obj) this.scene.remove(this.obj);
    const o = makeFor(kind, ups); if (!o) return;
    skinArm(o, kind, skin); fitUps(o, kind, ups);
    // (laid along the table's width, centred, its size filling the view)
    const pivot = new THREE.Group(), inner = new THREE.Group(); pivot.add(inner); inner.add(o);
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
    o.position.sub(c);
    if (focus) { o.position.set(-focus[0], -focus[1], -focus[2]); this.zoom = 0.42; this.tilt = 0.18; this.spin = 0.35; this.idle = -600; }
    else if (this.focused) { this.zoom = 1; this.tilt = 0.25; }
    this.focused = !!focus;
    // (seen from its right side, as it lies on a table: along the arm left to right, its top up, the lock toward you)
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    inner.quaternion.setFromRotationMatrix(kind === "crossbow" ? new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0)) : new THREE.Matrix4().makeBasis(V(0, 0, 1), V(1, 0, 0), V(0, 1, 0)));
    const L = Math.max(sz.x, sz.y, sz.z);
    this.L = L;
    this.obj = pivot; this.scene.add(pivot);
  }
  start() { if (this.on) return; this.on = true; this.loop(); }
  stop() { this.on = false; }
  draw() {
    const cv = this.cv, w = cv.clientWidth | 0, h = cv.clientHeight | 0; if (!w || !h) return;
    if (cv.width !== w * devicePixelRatio || cv.height !== h * devicePixelRatio) { this.r.setPixelRatio(devicePixelRatio); this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    // (left a while, it turns by itself again)
    if (this.drag == null && (this.idle += 1) > 240) this.spin += 0.004;
    if (this.obj) { this.obj.rotation.set(this.tilt, this.spin, 0, "XYZ"); }
    const L = this.L || 1; this.cam.position.set(0, L * 0.08 * this.zoom, L * 1.45 * this.zoom); this.cam.lookAt(0, 0, 0);
    this.r.render(this.scene, this.cam);
  }
}
