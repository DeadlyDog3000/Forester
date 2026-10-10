// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE WOODS, HEARD. Under the first Forester's thin wind and its odd bird, the forest itself: the wind in the leaves,
// coming and going in gusts and moving round you; the birds of a German wood, each its own song, from here and there
// among the trees — blackbird, chaffinch, great tit, wood pigeon, crow, and the cuckoo in spring and summer — thickest
// at dawn, thinning through the day, gone quiet at night and sparse in winter and the rain; and old trunks creaking
// when the wind gets up. Muffled indoors, silent in the caves and the city. All made here, on the game's own bus.

const ac = () => { const a = window.__foresterAC; return a && a.state === "running" ? a : null; };
const bus = () => window.__foresterBus || null;
const FSET = () => window.FSET || {};
const rnd = (a, b) => a + Math.random() * (b - a);

// a voice from somewhere among the trees: panned to its side, quieter and duller the further off it is
function place(a, out, dist, side) {
  const g = a.createGain(), p = a.createStereoPanner(), lp = a.createBiquadFilter();
  p.pan.value = Math.max(-0.9, Math.min(0.9, side)); lp.type = "lowpass"; lp.frequency.value = 9000 - Math.min(1, dist / 70) * 6500;
  g.gain.value = Math.max(0.05, 1 - dist / 80) ** 1.4;
  g.connect(lp); lp.connect(p); p.connect(out);
  return g;
}
// a sung note: a sine gliding from one pitch to another, with a little vibrato, swelling and fading
function sing(a, out, t, f0, f1, dur, vol, { vib = 0, shape = "sine" } = {}) {
  const o = a.createOscillator(), g = a.createGain(); o.type = shape;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  if (vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = rnd(25, 35); lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.02); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}
// the birds: each a little score
const SONGS = {
  blackbird(a, o, t) {           // a few fluty, wandering phrases, low and rich
    let at = t; const n = 4 + Math.floor(Math.random() * 4), base = rnd(1700, 2100);
    for (let i = 0; i < n; i++) { const f = base * rnd(0.85, 1.35), d = rnd(0.1, 0.22); sing(a, o, at, f, f * rnd(0.85, 1.2), d, 0.07, { vib: 18 }); at += d + rnd(0.02, 0.06); }
    sing(a, o, at + 0.04, 3600, 4800, 0.09, 0.025);      // (and a thin twitter to end on)
    return at - t + 0.2;
  },
  chaffinch(a, o, t) {           // a trill that runs down and quickens, and a flourish
    let at = t, d = 0.07; const f = rnd(4200, 4800);
    for (let i = 0; i < 9; i++) { sing(a, o, at, f * (1 - i * 0.025), f * (1 - i * 0.025) * 0.9, d * 0.8, 0.045); at += d; d *= 0.92; }
    sing(a, o, at + 0.02, 3000, 4600, 0.12, 0.05); sing(a, o, at + 0.15, 4600, 2600, 0.16, 0.045);
    return at - t + 0.35;
  },
  greattit(a, o, t) {            // "tea-cher, tea-cher, tea-cher"
    const hi = rnd(5200, 5800), lo = hi * 0.74; let at = t;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 2); i++) { sing(a, o, at, hi, hi * 0.98, 0.08, 0.035); sing(a, o, at + 0.11, lo, lo * 0.97, 0.09, 0.035); at += 0.28; }
    return at - t;
  },
  pigeon(a, o, t) {              // the wood pigeon, soft and low: coo-COO-coo, coo-coo
    const f = rnd(520, 580); let at = t;
    for (const [k, d, v] of [[1, 0.28, 0.05], [1.06, 0.42, 0.075], [1, 0.28, 0.05], [1.02, 0.25, 0.05], [1, 0.3, 0.045]]) { sing(a, o, at, f * k * 0.97, f * k, d, v, { vib: 4 }); at += d + 0.08; }
    return at - t;
  },
  cuckoo(a, o, t) {              // two falling notes, over and over
    let at = t; for (let i = 0; i < 3; i++) { sing(a, o, at, 700, 690, 0.22, 0.06); sing(a, o, at + 0.3, 560, 550, 0.32, 0.06); at += 0.95; }
    return at - t;
  },
  crow(a, o, t) {                // a harsh caw, two or three
    let at = t; const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const lp = a.createBiquadFilter(); lp.type = "bandpass"; lp.frequency.value = 1100; lp.Q.value = 1.4; lp.connect(o);
      sing(a, lp, at, rnd(420, 480), rnd(360, 400), 0.32, 0.12, { shape: "sawtooth", vib: 30 }); at += 0.45;
    }
    return at - t;
  },
};
// the weights of the chorus: who sings, by the time of day and the season
function pickSong(dawn, winter, spring) {
  const w = winter ? [["crow", 4], ["greattit", 2], ["blackbird", 0.5]] : [["blackbird", dawn ? 5 : 3], ["chaffinch", 4], ["greattit", 3], ["pigeon", 2.5], ["crow", 1.2], ["cuckoo", spring ? 1.4 : 0]];
  let s = w.reduce((a, b) => a + b[1], 0) * Math.random();
  for (const [k, v] of w) { s -= v; if (s <= 0) return k; }
  return "crow";
}

let bed = null, nextSong = 0, nextCreak = 0;
function startBed(a, out) {
  const n = window.__foresterNoise; if (!n) return null;
  // the leaves: two bands of noise, each panned to a side and gusting on its own
  const master = a.createGain(); master.gain.value = 0; master.connect(out);
  const sides = [-0.6, 0.6].map(pan => {
    const s = a.createBufferSource(); s.buffer = n; s.loop = true; s.playbackRate.value = rnd(0.85, 1.1);
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rnd(1600, 2400); bp.Q.value = 0.5;
    const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
    const g = a.createGain(); g.gain.value = 0.5; const p = a.createStereoPanner(); p.pan.value = pan;
    s.connect(bp); bp.connect(hp); hp.connect(g); g.connect(p); p.connect(master); s.start(0, Math.random() * 1.5);
    return { s, g, bp };
  });
  return { master, sides, gust: 0.5 };
}
function tick() {
  const a = ac(), out = bus(), G = window.__G;
  const on = a && out && G && G.mode === "play" && FSET().ambient !== false && G.world && (G.world.name === "woods" || G.world.name === "mp") && !(G.world.cave && G.world.cave.inside);
  if (!on) { if (bed && a) bed.master.gain.setTargetAtTime(0, a.currentTime, 0.8); return; }
  if (!bed) bed = startBed(a, out);
  if (!bed) return;
  const t = a.currentTime, w = G.world, pl = G.player;
  const sun = G.sun ? Math.min(1, G.sun.intensity / 2.4) : 1, night = sun < 0.12;
  const indoor = pl && w.insideCabin && w.insideCabin(pl.pos.x, pl.pos.z);
  const town = G.town, season = town && town.season ? String(town.season) : "summer", winter = /winter/i.test(season) || (w.snowK || 0) > 0.5, spring = /spring/i.test(season);
  const rain = w.rainK || 0;
  // the wind in the leaves: gusting, one side and then the other; quieter in winter's bare woods, muffled indoors
  bed.gust += (Math.random() - 0.5) * 0.12; bed.gust = Math.max(0.15, Math.min(1, bed.gust));
  const leaves = (winter ? 0.022 : 0.04) * (0.5 + bed.gust) * (indoor ? 0.25 : 1) * (1 - rain * 0.4);
  bed.master.gain.setTargetAtTime(leaves, t, 1.2);
  bed.sides.forEach((s, i) => { s.g.gain.setTargetAtTime(0.4 + Math.random() * 0.6, t, 0.8 + i * 0.4); s.bp.frequency.setTargetAtTime(1500 + bed.gust * 1400 + Math.random() * 300, t, 1.5); });
  // the birds: thick at dawn, a song every few seconds by day, none at night, few in winter and the rain
  const frac = town && town.frac != null ? town.frac : 0.4, dawn = frac > 0.18 && frac < 0.32;
  if (!night && t > nextSong) {
    const rate = (dawn ? 1.8 : 6) * (winter ? 3 : 1) * (1 + rain * 4) * (indoor ? 2.5 : 1);
    nextSong = t + rate * rnd(0.6, 1.4);
    const kind = pickSong(dawn, winter, spring), dist = rnd(12, 65), side = rnd(-1, 1);
    const voice = place(a, out, dist, side);
    voice.gain.value *= (indoor ? 0.3 : 1) * 1.7;
    try { SONGS[kind](a, voice, t + 0.05); } catch (e) {}
  }
  // an old trunk creaking, when the wind is up
  if (bed.gust > 0.7 && !indoor && t > nextCreak) {
    nextCreak = t + rnd(8, 22);
    const v = place(a, out, rnd(8, 30), rnd(-1, 1)), o = a.createOscillator(), bp = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    o.type = "sawtooth"; o.frequency.value = rnd(70, 110); bp.type = "bandpass"; bp.frequency.value = rnd(500, 900); bp.Q.value = 6;
    lfo.frequency.value = rnd(9, 16); lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
    const d = rnd(0.8, 1.6); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + d * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(bp); bp.connect(g); g.connect(v); o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
  }
}
setInterval(tick, 250);
export const AMBIENCE = { SONGS, tick };
