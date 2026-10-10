// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// ACHIEVEMENTS: what you've done, across every game you've played — kept on this computer, not in any one save. Each
// is earned once, called out with a card in the corner when it is, and listed in their own book (the front screen, and
// the pause menu). Some are found by looking at the game now and then; the rest are told as they happen (G.achEvent).

import { G } from "./engine.js";
import { UI } from "./ui.js";

/* global SFX */
const KEY = "reckoning.ach.v1", COUNT = "reckoning.ach.counts.v1";
const town = () => (G.town && !G.town.replica ? G.town : null);
const S = () => (town() ? town().S : null);
const built = (type, n = 1) => { const s = S(); return !!s && s.buildings.filter(b => b.type === type && b.done).length >= n; };
const skill = (n) => { const b = G.body; return !!b && b.skills && Object.values(b.skills).some(v => (v.lv ?? v) >= n); };

// the book: [id, name, what it takes, group, how it's found (a test, or the name of an event), hidden till earned?]
export const ACH = [
  // the story
  ["ch2", "Papers and Torches", "Get through the first night in Hamburg.", "The story", () => chapterAt(3)],
  ["ch4", "Out of the City", "Leave Hamburg behind.", "The story", () => chapterAt(5)],
  ["ch7", "The First Winter", "See the first winter out in the woods.", "The story", () => chapterAt(8)],
  ["ch11", "Forester", "Reach the end of the story.", "The story", () => chapterAt(12)],
  ["free", "The Settlement Is Yours", "Begin free play.", "The story", () => G.chapter === 14 && !!town()],
  // the colony
  ["cabin", "A Roof", "Raise a cabin.", "The colony", () => built("cabin")],
  ["pop10", "A Hamlet", "Have ten people living in your settlement.", "The colony", () => (S() && S().people.length + 2 >= 10)],
  ["pop25", "A Village", "Have twenty-five people living in your settlement.", "The colony", () => (S() && S().people.length + 2 >= 25)],
  ["pop50", "A Town", "Have fifty people living in your settlement.", "The colony", () => (S() && S().people.length + 2 >= 50)],
  ["hall", "Seat of Government", "Build a town hall.", "The colony", () => built("townhall")],
  ["church", "A House of God", "Build a church.", "The colony", () => built("church")],
  ["market", "Market Day", "Build a market.", "The colony", () => built("market")],
  ["research5", "Learning", "Know ten things the settlement has researched.", "The colony", () => (S() && S().tech && S().tech.done.length >= 10)],
  ["research25", "An Academy", "Know thirty things the settlement has researched.", "The colony", () => (S() && S().tech && S().tech.done.length >= 30)],
  ["rich", "Full Coffers", "Have 1,000 DM in the treasury.", "The colony", () => (S() && (S().coin || 0) >= 1000)],
  ["colony", "A Second Settlement", "Found a settlement out in the forest.", "The colony", () => (S() && (S().colonies || []).length >= 1)],
  ["winter", "We Didn't Freeze", "Bring your settlement through a winter in free play.", "The colony", () => (S() && town().techGates && (S().days || 0) >= 8)],
  ["year3", "Old Hands", "Keep a free-play settlement going three years.", "The colony", () => (S() && town().techGates && (S().days || 0) >= 24)],
  ["raid", "They Shall Not Pass", "Drive off a raid on your settlement.", "The colony", "raid-repelled"],
  ["revolt", "Order Restored", "Put down a rising in your own streets.", "The colony", "revolt-loyal"],
  ["revoltLost", "The People Have Spoken", "Lose your settlement to a rising.", "The colony", "revolt-rebels", true],
  // you
  ["trees100", "Woodsman", "Fell a hundred trees with your own axe.", "You", () => count("trees") >= 100],
  ["trees1000", "The Forest Fears You", "Fell a thousand trees with your own axe.", "You", () => count("trees") >= 1000],
  ["skill50", "Practised", "Bring any skill to 50.", "You", () => skill(50)],
  ["skill100", "Master", "Bring any skill to 100.", "You", () => skill(100)],
  ["dish5", "A Dish Fit for a Burgher", "Cook a dish worth five stars.", "You", "dish-5"],
  ["boar", "Tusks", "Bring down a boar.", "You", "boar"],
  // with others
  ["mpjoin", "Company", "Play a game with others.", "With others", "mp-join"],
  ["mphost", "Open House", "Host a game of your own.", "With others", "mp-host"],
  ["colonyjoin", "Shoulder to Shoulder", "Join someone's colony in co-op.", "With others", "colony-join"],
  ["ally", "Sworn", "Make an alliance.", "With others", "mp-ally"],
  ["capture", "Conqueror", "Take someone's homestead in a claim war.", "With others", "mp-capture"],
  ["hold", "Hold the Line", "Keep your homestead through a claim war.", "With others", "mp-held"],
  ["settlers12", "Patron", "Have twelve settlers living at your homestead.", "With others", "mp-settlers-12"],
  ["loot", "Spoils", "Loot another player's sack.", "With others", "mp-loot"],
  ["kill", "Blood on the Axe", "Strike down another player.", "With others", "mp-kill", true],
  ["world", "Into the Wide World", "Set foot in the wide world.", "With others", "mp-world"],
].map(([id, name, desc, group, how, hidden]) => ({ id, name, desc, group, test: typeof how === "function" ? how : null, event: typeof how === "string" ? how : null, hidden: !!hidden }));

function chapterAt(n) { try { const s = JSON.parse(localStorage.getItem("reckoning.save.v1") || "null"); if (s && (s.unlocked || 0) >= n) return true; } catch (e) {} return (G.chapter || 0) >= n; }
function load(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
let got = load(KEY), counts = load(COUNT);
export const earned = () => got;
export function count(k) { return counts[k] || 0; }
// a tally of something you do (trees felled…), kept with the achievements
G.achCount = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; if ((counts[k] % 10) === 0) save(COUNT, counts); };
// something happened that an achievement waits on
G.achEvent = name => { for (const a of ACH) if (a.event === name) unlock(a.id); };

export function unlock(id) {
  if (got[id]) return;
  const a = ACH.find(x => x.id === id); if (!a) return;
  got[id] = Date.now(); save(KEY, got); save(COUNT, counts);
  card(a);
}
// the card in the corner: gilt-edged, a moment, and gone
let queue = [], showing = false;
function card(a) {
  queue.push(a); if (showing) return;
  const next = () => {
    const x = queue.shift(); if (!x) { showing = false; return; }
    showing = true;
    let el = document.getElementById("achCard");
    if (!el) { el = document.createElement("div"); el.id = "achCard"; document.body.appendChild(el); }
    el.innerHTML = `<div class="ac-k">Achievement</div><div class="ac-t">${x.name}</div><div class="ac-d">${x.desc}</div>`;
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    try { SFX.coin && SFX.coin(); } catch (e) {}
    setTimeout(() => { el.classList.remove("on"); setTimeout(next, 600); }, 4800);
  };
  next();
}
// looked for now and then, while playing
let raidOn = false;
setInterval(() => {
  if (G.mode !== "play" && G.mode !== "pause") return;
  // a raid over, with every one of them down: driven off
  { const r = town() && town().raids; if (r) { if (r.active) raidOn = true; else if (raidOn) { raidOn = false; if (r.band && r.band.length && r.band.every(x => !x.alive)) G.achEvent("raid-repelled"); } } }
  // (the first look at a game: what was already done before there were achievements comes as one card, not a parade)
  const fresh = [];
  for (const a of ACH) if (a.test && !got[a.id]) { let ok = false; try { ok = a.test(); } catch (e) {} if (ok) fresh.push(a); }
  if (!looked && fresh.length > 2) {
    for (const a of fresh) got[a.id] = Date.now();
    save(KEY, got);
    card({ name: `${fresh.length} achievements`, desc: "Already earned, by what you've done so far. See them all under Achievements." });
  } else for (const a of fresh) unlock(a.id);
  looked = true;
}, 2500);
let looked = false;
// the book of them
export function renderAchievements(el) {
  const n = ACH.filter(a => got[a.id]).length;
  const groups = [...new Set(ACH.map(a => a.group))];
  el.innerHTML = `<div class="ach-sum">${n} of ${ACH.length} earned<div class="ach-bar"><div style="width:${Math.round(n / ACH.length * 100)}%"></div></div></div>` + groups.map(g => `<div class="set-sec">${g}</div><div class="ach-grid">${ACH.filter(a => a.group === g).map(a => {
    const on = !!got[a.id], secret = a.hidden && !on;
    const when = on ? new Date(got[a.id]).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
    return `<div class="ach${on ? " on" : ""}"><div class="ach-i">${on ? "★" : secret ? "?" : "☆"}</div><div><div class="ach-n">${secret ? "A secret" : a.name}</div><div class="ach-d">${secret ? "Earn it to see what it was." : a.desc}</div>${on ? `<div class="ach-w">Earned ${when}</div>` : ""}</div></div>`;
  }).join("")}</div>`).join("");
}
void UI;
