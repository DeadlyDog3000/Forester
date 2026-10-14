// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE KEYS, AS YOU WANT THEM. Every action keeps its own key in the code (W walks, F takes, J is the map); a key you've
// chosen instead is turned into that one the moment it's pressed, before anything else in the game hears it — so
// "forward on the up arrow" works everywhere at once, and the old key, given to nothing else, does nothing.
// Never while you're typing (the chat, a name, an address): there a key is only its letter.

const STORE = "reckoning.keys.v1";

// the actions, in the order the settings show them; keys: what the game listens for (the first is the one a new key
// stands in for); name: what's shown
export const ACTIONS = [
  { id: "forward", label: "Walk forward", keys: ["KeyW"] },
  { id: "back", label: "Walk back", keys: ["KeyS"] },
  { id: "left", label: "Step left", keys: ["KeyA"] },
  { id: "right", label: "Step right", keys: ["KeyD"] },
  { id: "run", label: "Run", keys: ["ShiftLeft", "ShiftRight"] },
  { id: "crouch", label: "Crouch", keys: ["KeyC", "ControlLeft"] },
  { id: "jump", label: "Jump · move a conversation on", keys: ["Space"] },
  { id: "leanL", label: "Lean left", keys: ["KeyQ"] },
  { id: "leanR", label: "Lean right", keys: ["KeyE"] },
  { id: "zoom", label: "Look closer (hold)", keys: ["KeyZ"] },
  { id: "use", label: "Take, open, talk · fix bayonet", keys: ["KeyF"] },
  { id: "mouse", label: "Lock or free the mouse", keys: ["KeyM"] },
  { id: "map", label: "The map", keys: ["KeyJ"] },
  { id: "mapKey", label: "The map's key", keys: ["KeyK"] },
  { id: "inv", label: "Inventory", keys: ["KeyT"] },
  { id: "skills", label: "Skills", keys: ["KeyP"] },
  { id: "guide", label: "The guide", keys: ["KeyH"] },
  { id: "build", label: "Plans · build", keys: ["KeyB"] },
  { id: "rotate", label: "Turn what you're building", keys: ["KeyR"] },
  { id: "inspect", label: "Inspect a building", keys: ["KeyV"] },
  { id: "gov", label: "Government", keys: ["KeyG"] },
  { id: "dismount", label: "Get off your horse", keys: ["KeyX"] },
  { id: "news", label: "The news · say no", keys: ["KeyN"] },
  { id: "yes", label: "Say yes", keys: ["KeyY"] },
  { id: "free", label: "Free camera", keys: ["Semicolon"] },
  { id: "talk", label: "Talk (multiplayer)", keys: ["Enter"] },
];
// (never given to anything: the pause menu's key, and what the browser or the system keeps for itself)
const RESERVED = new Set(["Escape", "Tab", "F11", "F12", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "ContextMenu"]);
const DIGITS = /^Digit\d$/;   // (the hotbar's, and the orders')

let binds = {};
try { binds = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { binds = {}; }
let trans = new Map();
function rebuild() {
  trans = new Map();
  const taken = new Set(Object.values(binds));
  for (const a of ACTIONS) {
    const k = binds[a.id]; if (!k) continue;
    trans.set(k, a.keys[0]);
    // (its old keys, unless something else has been given them, now do nothing)
    for (const d of a.keys) if (!taken.has(d) && !trans.has(d)) trans.set(d, null);
  }
}
rebuild();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(binds)); } catch (e) {} };

export const keyOf = id => { const a = ACTIONS.find(x => x.id === id); return a ? binds[id] || a.keys[0] : null; };
export const changed = id => !!binds[id];
// a key given to an action — and, if another action had it, that one given this one's old key in exchange
export function bind(id, code) {
  if (!code || RESERVED.has(code) || DIGITS.test(code)) return { ok: false, why: code === "Escape" ? "Esc is kept for the pause menu." : "That key's kept for something else." };
  const a = ACTIONS.find(x => x.id === id); if (!a) return { ok: false };
  const was = keyOf(id), other = ACTIONS.find(x => x.id !== id && keyOf(x.id) === code);
  binds[id] = code === a.keys[0] ? undefined : code;
  if (other) { binds[other.id] = was === other.keys[0] ? undefined : was; }
  for (const k of Object.keys(binds)) if (!binds[k]) delete binds[k];
  rebuild(); save();
  return { ok: true, swapped: other ? other.label : null };
}
export function resetKeys() { binds = {}; rebuild(); save(); }

// a key's name, as it's printed on it
const NAMES = { Space: "Space", ShiftLeft: "Shift", ShiftRight: "Right Shift", ControlLeft: "Ctrl", ControlRight: "Right Ctrl", AltLeft: "Alt", AltRight: "Right Alt",
  Enter: "Enter", Backspace: "Backspace", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  Minus: "-", Equal: "=", Backquote: "`", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", CapsLock: "Caps Lock", Delete: "Delete", Insert: "Insert",
  Home: "Home", End: "End", PageUp: "Page Up", PageDown: "Page Down", IntlBackslash: "\\" };
export function keyName(code) {
  if (!code) return "—";
  if (NAMES[code]) return NAMES[code];
  let m = code.match(/^Key([A-Z])$/); if (m) return m[1];
  m = code.match(/^Numpad(.+)$/); if (m) return "Num " + m[1];
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}
// (the keys the game was made with, as shown in the controls lists — so a list can print yours in their place)
export function shownAs(defaultName) {
  for (const a of ACTIONS) if (binds[a.id] && a.keys.some(k => keyName(k) === defaultName)) return keyName(binds[a.id]);
  return null;
}

// ---- the turning: before anything else hears the key ----
const typing = t => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
export let listening = null;   // (the settings, waiting for the next key to be pressed: it gets it, raw)
export const listenFor = f => { listening = f; };
function turn(e) {
  if (listening) { if (e.type === "keydown") { e.stopImmediatePropagation(); e.preventDefault(); const f = listening; listening = null; f(e.code); } else e.stopImmediatePropagation(); return; }
  if (!trans.size || typing(e.target) || !trans.has(e.code)) return;
  const to = trans.get(e.code);
  if (to === null) { e.stopImmediatePropagation(); return; }
  try { Object.defineProperty(e, "code", { value: to, configurable: true }); } catch (x) {}
}
addEventListener("keydown", turn, true);
addEventListener("keyup", turn, true);
