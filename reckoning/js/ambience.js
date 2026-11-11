// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE WOODS, HEARD. Under the first Forester's thin wind and its odd bird, the forest itself: the wind in the leaves,
// coming and going in gusts and moving round you; the birds of a German wood, each its own song, from here and there
// among the trees — blackbird, chaffinch, great tit, wood pigeon, crow, and the cuckoo in spring and summer — thickest
// at dawn, thinning through the day, gone quiet at night and sparse in winter and the rain; and old trunks creaking
// when the wind gets up. Muffled indoors, silent in the caves and the city. The birds recorded (art/birds), the rest made
// here, on the game's own bus.

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
  // (a call's way to you let go of once it's long over: see audio.js, lease)
  setTimeout(() => { try { p.disconnect(); } catch (e) {} }, 15000);
  return g;
}
// a sung note: a sine gliding from one pitch to another, with a little vibrato, swelling and fading
function sing(a, out, t, f0, f1, dur, vol, { vib = 0, shape = "sine" } = {}) {
  const o = a.createOscillator(), g = a.createGain(); o.type = shape;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  if (vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = rnd(25, 35); lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.02); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.onended = () => { try { g.disconnect(); } catch (e) {} }; o.start(t); o.stop(t + dur + 0.02);
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
// ---- the birds recorded (art/birds/<kind>_NN.ogg, credited in art/birds/CREDITS.md): each a few takes, and how loud
// (the crow's matched to the made one's caw, the songbirds a little under it) ----
const BIRDS = { blackbird: [3, 0.1245], chaffinch: [3, 0.1245], greattit: [3, 0.1245], pigeon: [2, 0.1245], cuckoo: [2, 0.1245], crow: [3, 0.1479] }, BB = {}, BLAST = {};
let bLoad = false;
// (and the wind in the leaves, recorded — one take, played twice over at different places in it, a side each — as loud
//  as the made bed it stands for)
let LEAVES = null; const LEAF_REC = 4.7;
// (an old trunk creaking, and the crickets of a summer night — two takes of them, made to go round — as loud as the
//  made ones they stand for)
const CREAKS = [], CRICKS = [], CREAK_REC = 0.0156, CRICK_REC = 0.395;
function loadBirds(a) {
  if (bLoad) return; bLoad = true;
  const take = (name, list) => fetch(new URL(`../art/birds/${name}.ogg`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => a.decodeAudioData(b)).then(b => list.push(b)).catch(() => {});
  for (let i = 0; i < 4; i++) take(`creak_0${i}`, CREAKS);
  for (let i = 0; i < 2; i++) take(`crickets_0${i}`, CRICKS);
  fetch(new URL("../art/birds/leaves.ogg", import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => a.decodeAudioData(b)).then(b => { LEAVES = b; }).catch(() => {});
  for (const [k, [n]] of Object.entries(BIRDS)) for (let i = 0; i < n; i++)
    fetch(new URL(`../art/birds/${k}_${String(i).padStart(2, "0")}.ogg`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => a.decodeAudioData(b)).then(b => (BB[k] ||= []).push(b)).catch(() => {});
}
// one of a kind's takes into out at t, a little higher or lower (not loaded: false, and the made one sings)
function recSong(a, out, kind, t) {
  const l = BB[kind]; if (!l || l.length < 2) return false;
  let i = Math.floor(Math.random() * l.length); if (i === BLAST[kind]) i = (i + 1) % l.length; BLAST[kind] = i;
  const s = a.createBufferSource(), g = a.createGain(); s.buffer = l[i]; s.playbackRate.value = rnd(0.96, 1.04); g.gain.value = BIRDS[kind][1];
  s.connect(g); g.connect(out); s.onended = () => { try { g.disconnect(); } catch (e) {} }; s.start(t);
  return true;
}
const sung = (a, out, kind, t) => recSong(a, out, kind, t) || SONGS[kind](a, out, t);
// the weights of the chorus: who sings, by the time of day and the season
function pickSong(dawn, winter, spring) {
  // (the songbirds, sung by pure tones, sounded like a little tune over the woods and not like birds: till their
  //  recordings are in, only the crow, whose caw is noise and not a note)
  if (!(BB.blackbird && BB.chaffinch && BB.greattit)) return "crow";
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
  if (LEAVES) return { master, rec: true, gust: 0.5, sides: [-0.6, 0.6].map((pan, i) => {
    const s = a.createBufferSource(); s.buffer = LEAVES; s.loop = true; s.playbackRate.value = rnd(0.95, 1.05);
    const g = a.createGain(); g.gain.value = 0.5 * LEAF_REC; const p = a.createStereoPanner(); p.pan.value = pan;
    s.connect(g); g.connect(p); p.connect(master); s.start(0, (i * 0.5 + Math.random() * 0.3) * LEAVES.duration);
    return { s, g, rec: true };
  }) };
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
  if (!bed) { bed = startBed(a, out); loadBirds(a); }
  if (!bed) return;
  // (the leaves' recording in since the bed was begun: the made one let go, and the recorded one in its place)
  if (!bed.rec && LEAVES) { const old = bed; old.master.gain.setTargetAtTime(0, a.currentTime, 0.6); setTimeout(() => { for (const x of old.sides) try { x.s.stop(); } catch (e) {} try { old.master.disconnect(); } catch (e) {} }, 3000); bed = startBed(a, out); }
  const t = a.currentTime, w = G.world, pl = G.player;
  const sun = G.sun ? Math.min(1, G.sun.intensity / 2.4) : 1, night = sun < 0.12;
  const indoor = pl && w.insideCabin && w.insideCabin(pl.pos.x, pl.pos.z);
  const town = G.town, season = town && town.season ? String(town.season) : "summer", winter = /winter/i.test(season) || (w.snowK || 0) > 0.5, spring = /spring/i.test(season);
  const rain = w.rainK || 0;
  // (the Wide World is not all a German wood: no leaves or songbirds in the desert, on the ice or the tundra, fewer of
  //  them out on the open grass, the heath and the high mountains, and the leaves' rustle as thick as the trees are)
  const land = w.land, biome = land && land.biomeAt && pl ? land.biomeAt(pl.pos.x, pl.pos.z) : null;
  const bare = !!biome && /desert|ice|tundra/.test(biome), open = !!biome && /alpine|grassland|heath/.test(biome);
  const trees = land && land.forestAt && pl ? Math.min(1, land.forestAt(pl.pos.x, pl.pos.z) + 0.25) : 1;
  // the wind in the leaves: gusting, one side and then the other; quieter in winter's bare woods, muffled indoors
  bed.gust += (Math.random() - 0.5) * 0.12; bed.gust = Math.max(0.15, Math.min(1, bed.gust));
  // (a breath under the birds, not a gale: at 0.04 it roared)
  const leaves = (winter ? 0.014 : 0.025) * (0.5 + bed.gust) * (indoor ? 0.25 : 1) * (1 - rain * 0.4) * (bare ? 0 : (open ? 0.5 : 1) * trees);
  bed.master.gain.setTargetAtTime(leaves, t, 1.2);
  bed.sides.forEach((s, i) => { s.g.gain.setTargetAtTime((0.4 + Math.random() * 0.6) * (s.rec ? LEAF_REC : 1), t, 0.8 + i * 0.4); if (s.bp) s.bp.frequency.setTargetAtTime(1500 + bed.gust * 1400 + Math.random() * 300, t, 1.5); });
  // the birds: thick at dawn, a song every few seconds by day, none at night, few in winter and the rain
  const frac = town && town.frac != null ? town.frac : 0.4, dawn = frac > 0.18 && frac < 0.32;
  if (!night && !bare && t > nextSong) {
    const rate = (dawn ? 14 : 28) * (winter ? 1.4 : 1) * (1 + rain * 4) * (indoor ? 2.5 : 1) * (open ? 2 : 1);
    nextSong = t + rate * rnd(0.6, 1.4);
    const kind = pickSong(dawn, winter, spring), dist = rnd(12, 65), side = rnd(-1, 1);
    const voice = place(a, out, dist, side);
    voice.gain.value *= (indoor ? 0.3 : 1) * 1.7;
    try { sung(a, voice, kind, t + 0.05); } catch (e) {}
  }
  // an old trunk creaking, when the wind is up
  if (bed.gust > 0.7 && !indoor && !bare && !open && trees > 0.5 && t > nextCreak) {
    nextCreak = t + rnd(8, 22);
    const v = place(a, out, rnd(8, 30), rnd(-1, 1));
    if (CREAKS.length >= 2) { const s = a.createBufferSource(), g = a.createGain(); s.buffer = CREAKS[Math.floor(Math.random() * CREAKS.length)]; s.playbackRate.value = rnd(0.85, 1.1); g.gain.value = CREAK_REC; s.connect(g); g.connect(v); s.start(t); return; }
    const o = a.createOscillator(), bp = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    o.type = "sawtooth"; o.frequency.value = rnd(70, 110); bp.type = "bandpass"; bp.frequency.value = rnd(500, 900); bp.Q.value = 6;
    lfo.frequency.value = rnd(9, 16); lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
    const d = rnd(0.8, 1.6); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + d * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(bp); bp.connect(g); g.connect(v); o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
  }
}
setInterval(tick, 250);
// a crow somewhere off among the trees (for the story's woods, in place of the old chip-tune bird calls)
function crowNear() {
  const a = ac(), out = bus(); if (!a || !out || FSET().ambient === false) return;
  loadBirds(a);
  const v = place(a, out, rnd(18, 60), rnd(-1, 1)); try { sung(a, v, "crow", a.currentTime + 0.02); } catch (e) {}
}
// crickets on a summer night: a high, buzzing trill from the grass, pulsing in chirps, near and far
let crick = null;
function crickets(on) {
  const a = ac(), out = bus(); if (FSET().ambient === false) on = false;
  if (!a || !out) { if (!on) crick = null; return; }
  loadBirds(a);
  // (begun on the made ones before the recordings came in: let go, and the recorded ones in their place)
  if (on && crick && !crick.rec && CRICKS.length >= 2) { crickets(false); }
  if (on && !crick && CRICKS.length >= 2) {
    const master = a.createGain(); master.gain.value = 0; master.gain.setTargetAtTime(0.03, a.currentTime, 2); master.connect(out);
    const srcs = CRICKS.slice(0, 2).map((b, i) => {
      const s = a.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rnd(0.97, 1.03);
      const g = a.createGain(); g.gain.value = CRICK_REC / Math.SQRT2; const p = a.createStereoPanner(); p.pan.value = i ? 0.45 : -0.45;
      s.connect(g); g.connect(p); p.connect(master); s.start(0, Math.random() * b.duration); return s;
    });
    crick = { master, stop: srcs, rec: true };
  } else if (on && !crick) {
    const n = window.__foresterNoise; if (!n) return;
    const master = a.createGain(); master.gain.value = 0; master.gain.setTargetAtTime(0.03, a.currentTime, 2); master.connect(out);
    const voices = [[4300, -0.5, 1.7], [4700, 0.6, 2.3], [3900, 0.1, 3.1]].map(([f, pan, rate]) => {
      const s = a.createBufferSource(); s.buffer = n; s.loop = true;
      const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 18;
      const am = a.createGain(); am.gain.value = 0;
      const pulse = a.createOscillator(); pulse.frequency.value = 28 + Math.random() * 8; const pg = a.createGain(); pg.gain.value = 0.5; pulse.connect(pg); pg.connect(am.gain);
      const chirp = a.createOscillator(); chirp.type = "square"; chirp.frequency.value = rate; const cg = a.createGain(); cg.gain.value = 0.5; chirp.connect(cg); cg.connect(am.gain);
      const p = a.createStereoPanner(); p.pan.value = pan;
      s.connect(bp); bp.connect(am); am.connect(p); p.connect(master); s.start(0, Math.random()); pulse.start(); chirp.start();
      return [s, pulse, chirp];
    });
    crick = { master, stop: voices.flat() };
  } else if (!on && crick) {
    const c = crick; crick = null; c.master.gain.setTargetAtTime(0, a.currentTime, 0.8);
    setTimeout(() => { for (const x of c.stop) { try { x.stop(); } catch (e) {} } try { c.master.disconnect(); } catch (e) {} }, 3000);
  }
}
export const AMBIENCE = { SONGS, tick, crowNear, crickets };
window.__ambience = AMBIENCE;
