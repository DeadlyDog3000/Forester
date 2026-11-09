// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// WHAT WENT WRONG, TOLD TO THE STUDIO — only if the player says yes. The first time something goes wrong behind the scenes
// a small note asks whether to send it (once, always, or never); Settings has the same choice. A report is the error's
// message and where in the game's code it happened, the version, the platform, full game or demo, and which screen it was
// on: nothing about the player or the computer. A few a session at most, each error once. See server/crashes.cjs.

import { CHANGELOG } from "./changelog.js";
import { SHOP, full } from "./licence.js";

const KEY = "reckoning.crash.send";   // "yes", "no", or nothing yet (ask)
export const crashChoice = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
export const setCrashChoice = v => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {} };
const seen = new Set(), queue = []; let sent = 0, asking = false;
// (a page being tried out on this computer, or a test run: nothing sent)
const offline = () => !/^(app:|https?:)$/.test(location.protocol) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&](probe|autoplay)/.test(location.search) || window.__probe;
// (where it happened: the screen open, or the game being played)
const whereNow = () => { const s = [...document.querySelectorAll("#menus .screen")].find(e => !e.classList.contains("hidden")); const G = window.__G; return s ? s.id : G && G.arena ? (G.arena.battle ? "battle" : "duel") : G && G.mode || "game"; };
// (noise from the browser itself, not the game: never worth sending)
const noise = m => /ResizeObserver loop|^Script error\.?$|Extension context|AbortError|NetworkError|Failed to fetch|Load failed/i.test(m);

function send(r) {
  if (sent >= 5) return; sent++;
  const p = /Mac/i.test(navigator.userAgent) ? "mac" : /Win/i.test(navigator.userAgent) ? "win" : /Linux/i.test(navigator.userAgent) ? "linux" : "web";
  fetch(`${SHOP.server}/crash`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v: CHANGELOG[0] ? CHANGELOG[0].v : "?", p, f: full() ? 1 : 0, where: r.where, msg: r.msg, stack: r.stack }) }).catch(() => {});
}
// (the note that asks: out of the way in a corner, never in front of the game's own buttons, gone by itself after a while
//  — and not while the mouse is the game's, in the middle of a battle: once it's let go, at the pause or the result)
let waiting = false;
function ask() {
  if (asking || !document.body) return;
  if (document.pointerLockElement) { if (!waiting) { waiting = true; const f = () => { if (document.pointerLockElement) return; document.removeEventListener("pointerlockchange", f); waiting = false; ask(); }; document.addEventListener("pointerlockchange", f); } return; }
  asking = true;
  const el = document.createElement("div"); el.id = "crashAsk";
  el.innerHTML = `<b>Something went wrong behind the scenes.</b><span>Send a report to DeadlyDog so it can be fixed? It holds the error and the game's version, nothing about you.</span><div><button class="btn" data-c="always">Always send</button><button class="btn" data-c="once">Send this one</button><button class="btn ghost" data-c="no">No</button></div>`;
  const done = c => { el.remove(); asking = false; clearTimeout(T); if (c === "always") setCrashChoice("yes"); if (c === "no") setCrashChoice("no"); if (c === "always" || c === "once") for (const r of queue.splice(0)) send(r); else if (c === "no") queue.length = 0; };
  el.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (b) done(b.dataset.c); });
  const T = setTimeout(() => done("later"), 30000);
  document.body.appendChild(el);
}
// an error, from anywhere: sent, asked about, or let go, as the player chose
export function report(err, where) {
  try {
    const msg = String(err && err.message || err || "").slice(0, 300), stack = String(err && err.stack || "").slice(0, 2000);
    if (!msg || noise(msg) || offline()) return;
    const sig = msg + "|" + (stack.split("\n")[1] || ""); if (seen.has(sig)) return; seen.add(sig);
    const r = { msg, stack, where: String(where || whereNow()).slice(0, 60) }, c = crashChoice();
    if (c === "no") return;
    if (c === "yes") return send(r);
    if (queue.length < 5) queue.push(r); ask();
  } catch (e) {}
}
window.__reportError = report;
addEventListener("error", e => { if (e.error || e.message) report(e.error || e.message); });
addEventListener("unhandledrejection", e => { const r = e.reason; if (r && (r instanceof Error || typeof r === "string")) report(r); });
