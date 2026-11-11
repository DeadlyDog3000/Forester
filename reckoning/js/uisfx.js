// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE SOUNDS OF THE SCREENS. Small, warm, solid sounds for everything you do with the menus and the board: a wooden
// tick under a click, a softer one when the pointer finds a button, a plucked pair of notes as a book opens and
// closes; a quill on paper and two chimed notes for a new task, a rising three when one's done; a bright ring for a
// thing made; and a little fanfare for a level gained or an achievement. Made here, in code, like every other sound
// in the game, and played on the game's own bus (so the mute and the volume govern them too).

const ac = () => { const a = window.__foresterAC; if (a && a.state === "suspended") a.resume(); return a || null; };
const bus = () => window.__foresterUiBus || window.__foresterBus || null;
const quiet = () => { const S = window.FSET || {}; return S.uiSounds === false; };

// a struck note: a sine and a little of its octave and twelfth, quick to speak, ringing off — marimba and glass
function note(a, out, f, t, { vol = 0.2, decay = 0.6, bright = 0.35, wood = 0 } = {}) {
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(out); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (decay + 0.4) * 1000);
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
  s.connect(bf); bf.connect(g); g.connect(out); s.onended = () => { try { g.disconnect(); } catch (e) {} }; s.start(t, Math.random() * Math.max(0, n.duration - dur - 0.05)); s.stop(t + dur + 0.02);
}
const rnd2 = (a, b) => a + Math.random() * (b - a);
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function play(fn) {
  if (quiet()) return;
  const a = ac(), out = bus(); if (!a || !out) return;
  try { fn(a, out, a.currentTime + 0.005); } catch (e) {}
}
let lastHover = 0, lastChat = 0;
// (in the game itself, nothing tuned: no notes over the woods — a rustle, a scratch, a knock; the chimes and fanfares
//  are the menus' only)
const inGame = () => { const G = window.__G; return !!G && G.mode !== "title"; };
const rustle = (a, o, t, vol = 0.05, up = true) => burst(a, o, t, { f: up ? 700 : 1600, q: 0.7, dur: 0.14, vol, sweep: up ? 1500 : -900 });
const knock = (a, o, t, vol = 0.09, f = 180) => { burst(a, o, t, { f: f * 4, q: 1.2, dur: 0.05, vol: vol * 0.7 }); note(a, o, f, t, { vol, decay: 0.09, bright: 0.05, wood: 1 }); };
export const UISFX = {
  // a button pressed: a dry wooden tick with a little body to it
  click: () => play((a, o, t) => { burst(a, o, t, { f: 2600, q: 3, dur: 0.035, vol: 0.17 }); note(a, o, 940, t, { vol: 0.08, decay: 0.08, bright: 0.1, wood: 1 }); }),
  // the pointer onto a button: barely there
  hover: () => { const n = performance.now(); if (n - lastHover < 60) return; lastHover = n; play((a, o, t) => burst(a, o, t, { f: 4200, q: 4, dur: 0.018, vol: 0.035 })); },
  // a book or a board opened, and shut: two plucked notes, up, and down
  open: () => play((a, o, t) => { if (inGame()) return rustle(a, o, t, 0.06, true); burst(a, o, t, { f: 900, q: 0.8, dur: 0.09, vol: 0.05, sweep: 1200 }); note(a, o, hz(67), t, { vol: 0.07, decay: 0.25, wood: 1 }); note(a, o, hz(74), t + 0.055, { vol: 0.07, decay: 0.3, wood: 1 }); }),
  close: () => play((a, o, t) => { if (inGame()) return rustle(a, o, t, 0.05, false); note(a, o, hz(74), t, { vol: 0.06, decay: 0.2, wood: 1 }); note(a, o, hz(67), t + 0.05, { vol: 0.06, decay: 0.26, wood: 1 }); }),
  // something taken up: a round little pop
  pop: () => play((a, o, t) => {
    const os = a.createOscillator(), g = a.createGain(); os.type = "sine"; os.frequency.setValueAtTime(820, t); os.frequency.exponentialRampToValueAtTime(330, t + 0.07);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); os.connect(g); g.connect(o); os.start(t); os.stop(t + 0.1);
  }),
  // a new task on the board: the quill, and two notes
  objective: () => play((a, o, t) => {
    if (inGame()) { for (let i = 0; i < 3; i++) burst(a, o, t + i * 0.07, { f: 3200 + i * 300, q: 1.2, dur: 0.06, vol: 0.04, sweep: -1400 }); return; }
    for (let i = 0; i < 3; i++) burst(a, o, t + i * 0.07, { f: 3200 + i * 300, q: 1.2, dur: 0.06, vol: 0.035, sweep: -1400 });
    note(a, o, hz(76), t + 0.2, { vol: 0.09, decay: 0.9, bright: 0.4 }); note(a, o, hz(81), t + 0.33, { vol: 0.08, decay: 1.2, bright: 0.4 });
  }),
  // a task done: three notes rising, ringing on
  done: () => play((a, o, t) => { if (inGame()) { rustle(a, o, t, 0.05, true); knock(a, o, t + 0.12, 0.08, 200); knock(a, o, t + 0.24, 0.07, 170); return; } [72, 76, 79].forEach((m, i) => note(a, o, hz(m), t + i * 0.09, { vol: 0.09, decay: 1.1, bright: 0.45 })); note(a, o, hz(84), t + 0.3, { vol: 0.06, decay: 1.6, bright: 0.3 }); }),
  // a thing made: a bright ring on metal, and a note under it
  craft: () => play((a, o, t) => { if (inGame()) { burst(a, o, t, { f: 5200, q: 6, dur: 0.05, vol: 0.06 }); knock(a, o, t + 0.03, 0.07, 240); return; } burst(a, o, t, { f: 5200, q: 6, dur: 0.05, vol: 0.06 }); note(a, o, hz(83), t, { vol: 0.07, decay: 0.8, bright: 0.6 }); note(a, o, hz(71), t + 0.02, { vol: 0.06, decay: 0.5, wood: 1 }); }),
  // a level gained, an achievement: a small fanfare
  fanfare: () => play((a, o, t) => { if (inGame()) { rustle(a, o, t, 0.06, true); knock(a, o, t + 0.1, 0.09, 190); knock(a, o, t + 0.22, 0.09, 190); knock(a, o, t + 0.34, 0.07, 160); return; } [67, 72, 76, 79].forEach((m, i) => note(a, o, hz(m), t + i * 0.08, { vol: 0.08, decay: 0.9, bright: 0.5 })); [72, 76, 79, 84].forEach(m => note(a, o, hz(m), t + 0.38, { vol: 0.05, decay: 1.8, bright: 0.35 })); }),
  // a line up in the talk: a slip of paper and a light tap (no notes — it's heard in the woods); a notice, softer
  chat: (notice = false) => {
    const n = performance.now(); if (n - lastChat < 90) return; lastChat = n;
    play((a, o, t) => {
      burst(a, o, t, { f: 1800, q: 0.9, dur: 0.07, vol: notice ? 0.03 : 0.05, sweep: 1600 });
      if (!notice) knock(a, o, t + 0.05, 0.05, 260);
    });
  },
  // not allowed: a low double knock
  deny: () => play((a, o, t) => { note(a, o, hz(45), t, { vol: 0.1, decay: 0.12, wood: 1 }); note(a, o, hz(43), t + 0.09, { vol: 0.1, decay: 0.16, wood: 1 }); }),
};
// ---- the armoury's and the muster's own sounds: the real thing each time, made the same way — coins on a table, a
// blade out of its scabbard, a stock knocked down, a brush, a file, cloth shaken out, men's feet ----
// (a struck piece of metal: partials that aren't a harmonic series, as a coin's or a blade's aren't, each dying at its own
//  rate — the bright ones first)
function ring(a, out, t, f, { vol = 0.06, decay = 0.35, parts = [1, 2.76, 5.4, 8.93], bright = 1 } = {}) {
  const g = a.createGain(); g.gain.value = 1; g.connect(out); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (decay + 0.5) * 1000);
  parts.forEach((m, i) => {
    const o = a.createOscillator(), og = a.createGain(); o.type = "sine"; o.frequency.value = f * m * (1 + (Math.random() - 0.5) * 0.004);
    const d = decay / (1 + i * 0.9 * bright), v = vol / (1 + i * 0.7);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v, t + 0.002); og.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + d + 0.02);
  });
  burst(a, out, t, { f: f * 3, q: 1.5, dur: 0.012, vol: vol * 0.8 });
}
// one coin set down on wood: its click, its ring, sometimes a little spin
const coin = (a, o, t, vol = 0.05) => { const f = 2400 + Math.random() * 1400; ring(a, o, t, f, { vol, decay: 0.28 + Math.random() * 0.2 }); knock(a, o, t, vol * 0.25, 240 + Math.random() * 80); if (Math.random() < 0.3) for (let i = 1; i < 4; i++) ring(a, o, t + 0.05 * i * (1 - i * 0.12), f * 1.01, { vol: vol * 0.35 / i, decay: 0.08 }); };
// a man's footfall on turf, or a heavy thing set down on it: a dull thud and the grass under it
const thud = (a, o, t, vol = 0.08, f = 80) => { note(a, o, f, t, { vol, decay: 0.12, bright: 0, wood: 0 }); burst(a, o, t, { f: 420, q: 0.6, dur: 0.07, vol: vol * 0.6, type: "lowpass" }); };
// (recorded, each the real thing, in front of the made ones: a kind of the field's recordings (art/sfx) into the screens'
//  way at t, levelled against the made one by UREC; or one of the foley's (art/foley) a moment on. False till they're in)
//  (measured through the screens' way, offline; the made brush, grip, page and feet were barely there, so theirs are put
//  down quiet but heard)
const UREC = { swordDraw: 0.14, daggerDraw: 0.16, musketUp: 0.12, bowUp: 0.2, haft: 0.17, file: 0.17, halt: 0.13, shuffle: 0.08, brush: 0.075, flag: 0.38, shoulder: 0.09, leather: 0.14, snare: 0.16 };
const FREC = { coin: 0.25, purse: 0.17, parchment: 0.06, cock: 0.29, chestShut: 0.25 };
const rec = (o, kind, t, g = 1, rate) => !!window.__sfxRec && window.__sfxRec(kind, o, g * (UREC[kind] || 1), t, rate);
const frec = (name, after = 0, g = 1, rate) => { const F = window.__foley; return !!F && !!F.rec && F.rec(name, g * (FREC[name] || 1), after, rate); };
Object.assign(UISFX, {
  // coins counted out onto the table, a little run of them — the price paid
  pay: (n = 6) => play((a, o, t) => { if (frec("coin")) { for (let i = 1; i < Math.max(2, Math.min(5, n >> 1)); i++) frec("coin", i * rnd2(0.09, 0.15), rnd2(0.6, 1)); return; } n = Math.max(3, Math.min(14, n)); let at = t; for (let i = 0; i < n; i++) { coin(a, o, at, 0.045 + Math.random() * 0.02); at += 0.045 + Math.random() * 0.07; } burst(a, o, at + 0.02, { f: 500, q: 0.6, dur: 0.22, vol: 0.035, sweep: 900 }); }),
  // a purchase made: the coins counted out onto the table, then the strongbox's lid let down and its key turned
  buy: (n = 8) => play((a, o, t) => {
    if (frec("coin")) { const k = Math.max(2, Math.min(5, n >> 1)); for (let i = 1; i < k; i++) frec("coin", i * rnd2(0.09, 0.14), rnd2(0.6, 1)); frec("chestShut", k * 0.13 + 0.15, 0.8); return; }
    n = Math.max(4, Math.min(14, n)); let at = t; for (let i = 0; i < n; i++) { coin(a, o, at, 0.05 + Math.random() * 0.02); at += 0.04 + Math.random() * 0.05; }
    at += 0.12; thud(a, o, at, 0.12, 95); knock(a, o, at, 0.12, 120); ring(a, o, at + 0.01, 700, { vol: 0.03, decay: 0.25, parts: [1, 2.4, 3.9] });
    burst(a, o, at + 0.28, { f: 2400, q: 6, dur: 0.03, vol: 0.06 }); burst(a, o, at + 0.33, { f: 3000, q: 8, dur: 0.02, vol: 0.09 }); ring(a, o, at + 0.33, 2900, { vol: 0.03, decay: 0.12 });
  }),
  // pay coming in: the coins poured into the purse, a quick tumbling rush, then the purse drawn shut
  purse: (n = 10) => play((a, o, t) => { if (frec("purse")) return; n = Math.max(4, Math.min(28, n)); for (let i = 0; i < n; i++) { const at = t + Math.pow(i / n, 0.8) * 0.55 + Math.random() * 0.03; ring(a, o, at, 2000 + Math.random() * 1800, { vol: 0.03 + Math.random() * 0.02, decay: 0.12 + Math.random() * 0.1 }); } burst(a, o, t + 0.05, { f: 260, q: 0.5, dur: 0.5, vol: 0.03, type: "lowpass" }); burst(a, o, t + 0.68, { f: 900, q: 0.8, dur: 0.16, vol: 0.05, sweep: 1600 }); burst(a, o, t + 0.8, { f: 1400, q: 0.8, dur: 0.12, vol: 0.04, sweep: -700 }); }),
  // an arm taken up: what it is, as it sounds in the hand
  arm: kind => play((a, o, t) => {
    { const R = { sword: "swordDraw", dagger: "daggerDraw", musket: "musketUp", crossbow: "musketUp", bow: "bowUp" }[kind] || (kind ? "haft" : null);
      if (kind === "pistol" ? frec("cock") : R && rec(o, R, t)) return; }
    if (kind === "sword" || kind === "dagger") { burst(a, o, t, { f: 3000, q: 4, dur: kind === "sword" ? 0.42 : 0.24, vol: 0.05, sweep: 2400 }); ring(a, o, t + (kind === "sword" ? 0.4 : 0.22), 1150, { vol: 0.05, decay: 0.9, parts: [1, 2.32, 4.25, 6.63] }); return; }
    if (kind === "musket" || kind === "crossbow") { knock(a, o, t, 0.12, 150); ring(a, o, t + 0.03, 1800, { vol: 0.02, decay: 0.12 }); ring(a, o, t + 0.07, 2100, { vol: 0.016, decay: 0.1 }); burst(a, o, t + 0.12, { f: 2600, q: 5, dur: 0.03, vol: 0.06 }); burst(a, o, t + 0.17, { f: 3300, q: 6, dur: 0.02, vol: 0.05 }); return; }
    if (kind === "pistol") { burst(a, o, t, { f: 2800, q: 4, dur: 0.025, vol: 0.12 }); burst(a, o, t + 0.09, { f: 3600, q: 5, dur: 0.022, vol: 0.16 }); ring(a, o, t + 0.09, 2600, { vol: 0.04, decay: 0.1 }); knock(a, o, t + 0.09, 0.04, 260); return; }
    if (kind === "bow") { burst(a, o, t, { f: 300, q: 3, dur: 0.25, vol: 0.04, sweep: 200 }); const os = a.createOscillator(), g = a.createGain(); os.type = "triangle"; os.frequency.setValueAtTime(140, t + 0.26); os.frequency.exponentialRampToValueAtTime(118, t + 0.5); g.gain.setValueAtTime(0.0001, t + 0.26); g.gain.exponentialRampToValueAtTime(0.07, t + 0.264); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); os.connect(g); g.connect(o); os.start(t + 0.26); os.stop(t + 0.6); return; }
    // (an axe, a spear, a club: its haft knocked on the boards, its head heavy behind it)
    knock(a, o, t, 0.12, 130); knock(a, o, t + 0.06, 0.05, 210); if (kind === "spear" || kind === "battleaxe" || kind === "axe") ring(a, o, t + 0.02, 1300, { vol: 0.018, decay: 0.2 });
  }),
  // a finish chosen: a brush through stain, a fitting tapped, leather worked, cloth shaken
  finish: slot => play((a, o, t) => {
    if (slot === "wood" ? rec(o, "brush", t) : slot === "grip" ? rec(o, "leather", t) : slot !== "fit" && rec(o, "flag", t, 0.25)) return;
    if (slot === "wood") { for (let i = 0; i < 2; i++) burst(a, o, t + i * 0.16, { f: 1800, q: 0.7, dur: 0.15, vol: 0.04, sweep: i ? -900 : 900 }); return; }
    if (slot === "fit") { ring(a, o, t, 1650, { vol: 0.05, decay: 0.5, parts: [1, 2.6, 4.9] }); ring(a, o, t + 0.11, 1650, { vol: 0.03, decay: 0.35, parts: [1, 2.6, 4.9] }); return; }
    if (slot === "grip") { for (let i = 0; i < 3; i++) burst(a, o, t + i * 0.07, { f: 500 + i * 120, q: 6, dur: 0.06, vol: 0.05 }); return; }
    burst(a, o, t, { f: 1200, q: 0.8, dur: 0.12, vol: 0.05, sweep: 1400 }); burst(a, o, t + 0.1, { f: 900, q: 0.8, dur: 0.1, vol: 0.035, sweep: -500 });
  }),
  // the gunsmith's work: a file drawn across steel a few strokes, a screw driven home, and the piece snapped shut
  smith: () => play((a, o, t) => { if (rec(o, "file", t)) { rec(o, "file", t + 0.75, 0.8); frec("cock", 1.6); return; } for (let i = 0; i < 4; i++) burst(a, o, t + i * 0.17, { f: 4200, q: 1.5, dur: 0.14, vol: 0.045, sweep: i % 2 ? -1800 : 1800 }); for (let i = 0; i < 3; i++) burst(a, o, t + 0.75 + i * 0.07, { f: 3000, q: 7, dur: 0.02, vol: 0.06 }); ring(a, o, t + 1.0, 2200, { vol: 0.04, decay: 0.25 }); knock(a, o, t + 1.0, 0.07, 170); }),
  // new colours: the cloth shaken out with a crack, and a stroke of the drum
  colours: () => play((a, o, t) => { if (rec(o, "flag", t)) { rec(o, "snare", t + 0.42); return; } for (let i = 0; i < 4; i++) burst(a, o, t + i * 0.09, { f: 500 + i * 140, q: 0.6, dur: 0.11, vol: 0.06 - i * 0.008, sweep: 900 }); burst(a, o, t + 0.36, { f: 1600, q: 1, dur: 0.05, vol: 0.07 }); note(a, o, 92, t + 0.45, { vol: 0.12, decay: 0.45, bright: 0 }); burst(a, o, t + 0.45, { f: 1800, q: 0.5, dur: 0.18, vol: 0.05, type: "highpass" }); }),
  // a page of the muster turned
  page: () => play((a, o, t) => { if (frec("parchment")) return; burst(a, o, t, { f: 1400, q: 0.6, dur: 0.18, vol: 0.045, sweep: 2200 }); burst(a, o, t + 0.13, { f: 2800, q: 0.7, dur: 0.06, vol: 0.03 }); }),
  // a company taken up off the ground: their kit rattling as they come to the shoulder
  muster: () => play((a, o, t) => { if (rec(o, "shoulder", t)) return; for (let i = 0; i < 7; i++) { const at = t + Math.random() * 0.22; burst(a, o, at, { f: 2200 + Math.random() * 1600, q: 5, dur: 0.02, vol: 0.03 }); } for (let i = 0; i < 4; i++) thud(a, o, t + 0.05 + i * 0.06 + Math.random() * 0.03, 0.04, 70 + Math.random() * 20); }),
  // and set down: the ranks halting, their feet as one, a musket butt or two grounded
  halt: () => play((a, o, t) => { if (rec(o, "halt", t)) return; for (let i = 0; i < 9; i++) thud(a, o, t + Math.random() * 0.06, 0.035, 65 + Math.random() * 25); thud(a, o, t + 0.22, 0.09, 72); knock(a, o, t + 0.3, 0.06, 150); knock(a, o, t + 0.34, 0.04, 165); }),
  // turned: feet shuffling round
  wheel: () => play((a, o, t) => { if (rec(o, "shuffle", t)) return; for (let i = 0; i < 4; i++) burst(a, o, t + i * 0.05 + Math.random() * 0.02, { f: 600, q: 0.8, dur: 0.06, vol: 0.03, type: "lowpass" }); }),
  // the word to begin: a short roll on the side drum
  roll: () => play((a, o, t) => { if (rec(o, "snare", t)) { for (let i = 1; i < 14; i++) rec(o, "snare", t + i * 0.06 + Math.random() * 0.006, 0.35 + 0.65 * i / 14, [0.97, 1.03]); return; } const n = 14; for (let i = 0; i < n; i++) { const k = i / n; burst(a, o, t + i * 0.045, { f: 2400, q: 0.7, dur: 0.05, vol: 0.03 + k * 0.05 }); } burst(a, o, t + n * 0.045, { f: 2000, q: 0.6, dur: 0.18, vol: 0.1 }); note(a, o, 170, t + n * 0.045, { vol: 0.1, decay: 0.2, bright: 0 }); }),
});
window.__uisfx = UISFX;

// every button in the game's screens: a tick when pressed, a softer one when the pointer finds it
const BUTTON = "button, .btn, .plan, .slot, .hb, .who, .mc-slot, .cr-row button, .ach, [data-tab], [data-cam]";
addEventListener("pointerdown", e => { const b = e.target.closest && e.target.closest(BUTTON); if (b && !b.disabled) UISFX.click(); else if (b && b.disabled) UISFX.deny(); }, true);
addEventListener("pointerover", e => { const b = e.target.closest && e.target.closest("button:not(:disabled), .btn, .plan, .who"); if (b && !b.contains(e.relatedTarget)) UISFX.hover(); }, true);
