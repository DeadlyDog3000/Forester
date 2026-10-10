// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE SOUNDS OF THE SCREENS. Small, warm, solid sounds for everything you do with the menus and the board: a wooden
// tick under a click, a softer one when the pointer finds a button, a plucked pair of notes as a book opens and
// closes; a quill on paper and two chimed notes for a new task, a rising three when one's done; a bright ring for a
// thing made; and a little fanfare for a level gained or an achievement. Made here, in code, like every other sound
// in the game, and played on the game's own bus (so the mute and the volume govern them too).

const ac = () => { const a = window.__foresterAC; if (a && a.state === "suspended") a.resume(); return a || null; };
const bus = () => window.__foresterBus || null;
const quiet = () => { const S = window.FSET || {}; return S.uiSounds === false; };

// a struck note: a sine and a little of its octave and twelfth, quick to speak, ringing off — marimba and glass
function note(a, out, f, t, { vol = 0.2, decay = 0.6, bright = 0.35, wood = 0 } = {}) {
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(out);
  for (const [mul, k] of [[1, 1], [2, bright * 0.5], [3, bright * 0.25], [wood ? 4.1 : 5.04, wood ? 0.3 : 0.08]]) {
    const o = a.createOscillator(), og = a.createGain(); o.type = "sine"; o.frequency.value = f * mul; og.gain.value = k;
    if (mul > 2) { og.gain.setValueAtTime(k, t); og.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.35); }
    o.connect(og); og.connect(g); o.start(t); o.stop(t + decay + 0.05);
  }
}
// a burst of filtered noise: a tick, a tap, the scratch of a quill
function burst(a, out, t, { f = 2400, q = 2, dur = 0.03, vol = 0.15, type = "bandpass", sweep = 0 } = {}) {
  const n = window.__foresterNoise; if (!n) return;
  const s = a.createBufferSource(); s.buffer = n;
  const bf = a.createBiquadFilter(); bf.type = type; bf.frequency.setValueAtTime(f, t); if (sweep) bf.frequency.exponentialRampToValueAtTime(Math.max(60, f + sweep), t + dur); bf.Q.value = q;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bf); bf.connect(g); g.connect(out); s.start(t, Math.random() * Math.max(0, n.duration - dur - 0.05)); s.stop(t + dur + 0.02);
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function play(fn) {
  if (quiet()) return;
  const a = ac(), out = bus(); if (!a || !out) return;
  try { fn(a, out, a.currentTime + 0.005); } catch (e) {}
}
let lastHover = 0;
export const UISFX = {
  // a button pressed: a dry wooden tick with a little body to it
  click: () => play((a, o, t) => { burst(a, o, t, { f: 2600, q: 3, dur: 0.035, vol: 0.17 }); note(a, o, 940, t, { vol: 0.08, decay: 0.08, bright: 0.1, wood: 1 }); }),
  // the pointer onto a button: barely there
  hover: () => { const n = performance.now(); if (n - lastHover < 60) return; lastHover = n; play((a, o, t) => burst(a, o, t, { f: 4200, q: 4, dur: 0.018, vol: 0.035 })); },
  // a book or a board opened, and shut: two plucked notes, up, and down
  open: () => play((a, o, t) => { burst(a, o, t, { f: 900, q: 0.8, dur: 0.09, vol: 0.05, sweep: 1200 }); note(a, o, hz(67), t, { vol: 0.07, decay: 0.25, wood: 1 }); note(a, o, hz(74), t + 0.055, { vol: 0.07, decay: 0.3, wood: 1 }); }),
  close: () => play((a, o, t) => { note(a, o, hz(74), t, { vol: 0.06, decay: 0.2, wood: 1 }); note(a, o, hz(67), t + 0.05, { vol: 0.06, decay: 0.26, wood: 1 }); }),
  // something taken up: a round little pop
  pop: () => play((a, o, t) => {
    const os = a.createOscillator(), g = a.createGain(); os.type = "sine"; os.frequency.setValueAtTime(820, t); os.frequency.exponentialRampToValueAtTime(330, t + 0.07);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); os.connect(g); g.connect(o); os.start(t); os.stop(t + 0.1);
  }),
  // a new task on the board: the quill, and two notes
  objective: () => play((a, o, t) => {
    for (let i = 0; i < 3; i++) burst(a, o, t + i * 0.07, { f: 3200 + i * 300, q: 1.2, dur: 0.06, vol: 0.035, sweep: -1400 });
    note(a, o, hz(76), t + 0.2, { vol: 0.09, decay: 0.9, bright: 0.4 }); note(a, o, hz(81), t + 0.33, { vol: 0.08, decay: 1.2, bright: 0.4 });
  }),
  // a task done: three notes rising, ringing on
  done: () => play((a, o, t) => { [72, 76, 79].forEach((m, i) => note(a, o, hz(m), t + i * 0.09, { vol: 0.09, decay: 1.1, bright: 0.45 })); note(a, o, hz(84), t + 0.3, { vol: 0.06, decay: 1.6, bright: 0.3 }); }),
  // a thing made: a bright ring on metal, and a note under it
  craft: () => play((a, o, t) => { burst(a, o, t, { f: 5200, q: 6, dur: 0.05, vol: 0.06 }); note(a, o, hz(83), t, { vol: 0.07, decay: 0.8, bright: 0.6 }); note(a, o, hz(71), t + 0.02, { vol: 0.06, decay: 0.5, wood: 1 }); }),
  // a level gained, an achievement: a small fanfare
  fanfare: () => play((a, o, t) => { [67, 72, 76, 79].forEach((m, i) => note(a, o, hz(m), t + i * 0.08, { vol: 0.08, decay: 0.9, bright: 0.5 })); [72, 76, 79, 84].forEach(m => note(a, o, hz(m), t + 0.38, { vol: 0.05, decay: 1.8, bright: 0.35 })); }),
  // not allowed: a low double knock
  deny: () => play((a, o, t) => { note(a, o, hz(45), t, { vol: 0.1, decay: 0.12, wood: 1 }); note(a, o, hz(43), t + 0.09, { vol: 0.1, decay: 0.16, wood: 1 }); }),
};
window.__uisfx = UISFX;

// every button in the game's screens: a tick when pressed, a softer one when the pointer finds it
const BUTTON = "button, .btn, .plan, .slot, .hb, .who, .mc-slot, .cr-row button, .ach, [data-tab], [data-cam]";
addEventListener("pointerdown", e => { const b = e.target.closest && e.target.closest(BUTTON); if (b && !b.disabled) UISFX.click(); else if (b && b.disabled) UISFX.deny(); }, true);
addEventListener("pointerover", e => { const b = e.target.closest && e.target.closest("button:not(:disabled), .btn, .plan, .who"); if (b && !b.contains(e.relatedTarget)) UISFX.hover(); }, true);
