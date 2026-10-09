// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The first Forester's sound engine (../sfx.js) makes the axes, the birds and
// the footsteps. This adds what a city has and a clearing does not: bells
// that can grow faint, a crowd, a drum, a door being beaten at midnight — and
// music that is a mood rather than a march. Still no audio files.

/* global SFX */
import { createMusic } from "./music.js";
let MUSIC = null;

let ac = null, bus = null, musicBus = null, noise = null;
function ctx() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return ac; }
  try { SFX.setMaster(SFX._vol ?? 0.6); } catch (e) {}
  ac = window.__foresterAC;
  if (!ac) return null;
  bus = ac.createGain(); bus.gain.value = 1; bus.connect(window.__foresterMaster);
  musicBus = ac.createGain(); musicBus.gain.value = 0.55; musicBus.connect(window.__foresterMaster);
  noise = window.__foresterNoise;
  return ac;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = l => l[Math.floor(Math.random() * l.length)];

// pink noise (Paul Kellet's filter): the soft hush of air, where white noise crackles; made once
let pink = null;
function pinkNoise(a) {
  if (pink) return pink;
  const n = a.sampleRate * 2, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return pink = buf;
}
function noiseSrc(a, loop = true) {
  const s = a.createBufferSource(); s.buffer = noise; s.loop = loop; return s;
}

const loops = {};
function loop(name, on, build) {
  const a = ctx(); if (!a) return;
  if (on && !loops[name]) loops[name] = build(a);
  else if (!on && loops[name]) {
    const l = loops[name]; loops[name] = null;
    l.g.gain.setTargetAtTime(0.0001, a.currentTime, 0.6);
    setTimeout(() => l.stop.forEach(n => { try { n.stop(); } catch (e) {} }), 3000);
  }
}

// a short burst of filtered noise, the stuff most footfalls are made of
function burst(a, t, dur, vol, f0, f1, q = 1, type = "bandpass") {
  const s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.008, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
}

// where a sound comes from: quieter with distance, and to the left or right of where you're looking
// ({x, z} in the world, or nothing for right beside you). Returns the node to connect into, and how loud.
function placed(a, at, reach = 45) {
  if (!at || !window.__G || !window.__G.player) return { node: bus, k: 1 };
  const G = window.__G, p = G.player.pos, dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz);
  const k = Math.max(0, 1 - d / reach) ** 1.5;
  const yaw = G.player.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw);        // your right, along the ground
  const pan = a.createStereoPanner(); pan.pan.value = Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / (d || 1)));
  // far off, the top of it is lost in the trees
  const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 9000 - Math.min(1, d / reach) * 7000;
  pan.connect(lp); lp.connect(bus);
  return { node: pan, k };
}
// vowels as their first three formants (Hz, and how strong)
const VOWELS = { a: [[800, 1], [1200, 0.5], [2600, 0.2]], ae: [[660, 1], [1700, 0.45], [2400, 0.2]], o: [[500, 1], [900, 0.4], [2400, 0.12]], e: [[450, 1], [2000, 0.4], [2700, 0.2]], u: [[350, 1], [800, 0.3], [2300, 0.08]] };

export const AUDIO = {
  init: ctx,
  // a footfall on whatever is underfoot: grass, leaves, dirt, stone, wood, snow, marsh.
  // vol is how loud (distance already taken off); heavy is a big man in boots
  step(surface = "grass", vol = 0.6, { fast = false, heavy = false } = {}) {
    const a = ctx(); if (!a || vol <= 0.01) return;
    const t = a.currentTime, k = vol * (fast ? 1.25 : 1) * (heavy ? 1.6 : 1), low = heavy ? 0.7 : 1;
    // the weight of it, under everything
    burst(a, t, 0.05 * (heavy ? 1.4 : 1), 0.05 * k, 220 * low, 90, 0.8, "lowpass");
    switch (surface) {
      case "grass":
        burst(a, t, rnd(0.08, 0.12), 0.05 * k, rnd(2600, 3400), 1400, 0.7);
        break;
      case "water":
        // wading: a slosh, and the drip as the foot comes up
        burst(a, t, rnd(0.12, 0.18), 0.09 * k, rnd(700, 1000), 300, 0.8);
        burst(a, t + rnd(0.04, 0.08), rnd(0.1, 0.16), 0.05 * k, rnd(1800, 2600), 900, 1.4);
        for (let i = 0; i < 3; i++) burst(a, t + rnd(0.15, 0.35), 0.02, 0.025 * k, rnd(2500, 4200), 1800, 6);
        break;
      case "leaves":
        burst(a, t, rnd(0.07, 0.1), 0.04 * k, rnd(2200, 2800), 1200, 0.8);
        for (let i = 0; i < 3; i++) burst(a, t + rnd(0.005, 0.07), 0.015, 0.04 * k * rnd(0.5, 1), rnd(3500, 5500), 3000, 4);
        break;
      case "dirt":
        burst(a, t, rnd(0.05, 0.07), 0.07 * k, rnd(900, 1300) * low, 500, 1.2);
        burst(a, t + 0.01, 0.04, 0.025 * k, rnd(2500, 3200), 2000, 2);
        break;
      case "stone":
        // heel, then toe: two hard little knocks
        burst(a, t, 0.025, 0.09 * k, rnd(1700, 2300) * low, 1200, 3);
        burst(a, t + rnd(0.05, 0.08), 0.02, 0.05 * k, rnd(2200, 2800), 1600, 3);
        burst(a, t, 0.04, 0.05 * k, 420 * low, 200, 2, "lowpass");
        break;
      case "wood":
        burst(a, t, 0.09, 0.09 * k, rnd(260, 360) * low, 180, 5);
        burst(a, t, 0.02, 0.04 * k, 1800, 1200, 3);
        if (Math.random() < 0.12) { const o = a.createOscillator(), g = a.createGain(); o.type = "sawtooth"; o.frequency.setValueAtTime(rnd(160, 220), t); o.frequency.linearRampToValueAtTime(rnd(120, 160), t + 0.25); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.012 * k, t + 0.05); g.gain.linearRampToValueAtTime(0.0001, t + 0.28); const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 600; f.Q.value = 4; o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.3); }
        break;
      case "snow":
        for (let i = 0; i < 4; i++) burst(a, t + i * rnd(0.012, 0.025), 0.05, 0.035 * k, rnd(2600, 3600), 1100, 1.5);
        break;
      case "marsh":
        burst(a, t, rnd(0.12, 0.18), 0.06 * k, rnd(900, 1300), 300, 1, "lowpass");
        burst(a, t + 0.03, 0.08, 0.03 * k, rnd(1800, 2400), 900, 2);
        break;
    }
  },
  setMusicVolume(v) { if (ctx()) musicBus.gain.value = 0.55 * v; },

  bell(vol = 1, pitch = 1) {
    const a = ctx(); if (!a || vol <= 0.01) return;
    const t = a.currentTime, f0 = 196 * pitch;
    for (const [mul, v] of [[0.5, 0.12], [1, 0.16], [2.0, 0.1], [2.4, 0.07], [3.0, 0.05], [4.2, 0.03]]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f0 * mul * (1 + (Math.random() - 0.5) * 0.003);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2 / Math.sqrt(mul));
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 4.5);
    }
  },

  knock(n = 3, vol = 1) {
    const a = ctx(); if (!a) return;
    for (let i = 0; i < n; i++) {
      const t = a.currentTime + i * rnd(0.32, 0.4);
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      g.gain.setValueAtTime(0.55 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.3);
      const s = noiseSrc(a, false), f = a.createBiquadFilter(), g2 = a.createGain();
      f.type = "lowpass"; f.frequency.value = 900;
      g2.gain.setValueAtTime(0.35 * vol, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      s.connect(f); f.connect(g2); g2.connect(bus); s.start(t, Math.random()); s.stop(t + 0.15);
    }
  },

  // a wooden door on iron hinges: the hinge creaks as it swings (stick and slip, rung through the
  // wood); shutting it, the creak is cut short by the leaf striking the frame and the latch dropping
  door(open = true, vol = 1) {
    const a = ctx(); if (!a || vol < 0.01) return;
    const t = a.currentTime, dur = open ? rnd(0.7, 1.0) : rnd(0.35, 0.5);
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sawtooth";
    const f0 = rnd(26, 34);
    o.frequency.setValueAtTime(f0, t);
    for (let k = 1; k <= 6; k++) o.frequency.linearRampToValueAtTime(f0 * rnd(0.7, 1.6), t + dur * k / 6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * vol, t + 0.06);
    g.gain.setValueAtTime(0.3 * vol, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // the wood's resonances
    for (const [fr, q, v] of [[480, 9, 1], [1150, 12, 0.7], [2300, 14, 0.4]]) {
      const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = fr * rnd(0.92, 1.08); f.Q.value = q;
      const gv = a.createGain(); gv.gain.value = v;
      o.connect(f); f.connect(gv); gv.connect(g);
    }
    g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    if (!open) {
      // the leaf against the frame, and the latch
      const tt = t + dur - 0.02;
      const th = a.createOscillator(), tg = a.createGain();
      th.type = "sine"; th.frequency.setValueAtTime(110, tt); th.frequency.exponentialRampToValueAtTime(55, tt + 0.18);
      tg.gain.setValueAtTime(0.0001, tt); tg.gain.exponentialRampToValueAtTime(0.5, tt + 0.008); tg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.25);
      th.connect(tg); tg.connect(bus); th.start(tt); th.stop(tt + 0.3);
      const n = noiseSrc(a, false), nf = a.createBiquadFilter(), ng = a.createGain();
      nf.type = "bandpass"; nf.frequency.value = 2600; nf.Q.value = 3;
      ng.gain.setValueAtTime(0.0001, tt + 0.05); ng.gain.exponentialRampToValueAtTime(0.25, tt + 0.055); ng.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
      n.connect(nf); nf.connect(ng); ng.connect(bus); n.start(tt + 0.05); n.stop(tt + 0.15);
    }
  },

  // one letter of dialogue: the smallest click, a little different each time
  letter(vol = 1) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "square"; o.frequency.setValueAtTime(rnd(1500, 1900), t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018 * vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3200;
    o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.03);
  },

  // a line of dialogue arriving: a soft tick, like a page turned against a table
  tick() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    const n = noiseSrc(a, false), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = rnd(1700, 2100); f.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(f); f.connect(g); g.connect(bus); n.start(t); n.stop(t + 0.08);
    const o = a.createOscillator(), og = a.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.05);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(bus); o.start(t); o.stop(t + 0.08);
  },

  drumRoll(secs = 4, vol = 0.5) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime;
    for (let t = 0; t < secs; t += 0.07) {
      const s = noiseSrc(a, false), f = a.createBiquadFilter(), g = a.createGain();
      f.type = "bandpass"; f.frequency.value = 260 + Math.random() * 60; f.Q.value = 1.5;
      const v = vol * (0.35 + 0.65 * (t / secs)) * rnd(0.7, 1);
      g.gain.setValueAtTime(v, t0 + t); g.gain.exponentialRampToValueAtTime(0.001, t0 + t + 0.09);
      s.connect(f); f.connect(g); g.connect(bus); s.start(t0 + t, Math.random()); s.stop(t0 + t + 0.1);
    }
  },

  // a musket: the snap of the flint and the hiss of the pan, then the boom, rolling away through the trees
  gunshot(vol = 1, at = null) {
    const a = ctx(); if (!a) return;
    let v = vol;
    const GG = window.__G; if (at && GG && GG.player) { const d = Math.hypot(at.x - GG.player.pos.x, at.z - GG.player.pos.z); v *= Math.max(0.15, 1 - d / 160); }
    const t = a.currentTime;
    const s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "lowpass"; f.frequency.setValueAtTime(5200, t + 0.03); f.frequency.exponentialRampToValueAtTime(240, t + 1.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(0.0001, t + 0.03); g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.036); g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + 1.7);
    const o = a.createOscillator(), og = a.createGain(); o.type = "sine"; o.frequency.setValueAtTime(90, t + 0.03); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    og.gain.setValueAtTime(0.0001, t + 0.03); og.gain.exponentialRampToValueAtTime(0.7 * v, t + 0.04); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og); og.connect(bus); o.start(t + 0.03); o.stop(t + 0.65);
    const c = noiseSrc(a), cf = a.createBiquadFilter(), cg = a.createGain(); cf.type = "highpass"; cf.frequency.value = 2500;
    cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.004); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    c.connect(cf); cf.connect(cg); cg.connect(bus); c.start(t, Math.random()); c.stop(t + 0.04);
  },
  // loading: the ramrod down the barrel, a scrape and a knock
  ramrod() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + 0.32);
  },
  // a bow drawn: the wood of the limbs creaking under the strain, a tick and a groan, louder the further it comes back
  bowCreak(k = 0.5) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = rnd(380, 560) + k * 200; f.Q.value = 9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + 0.1 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.07, 0.14));
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + 0.16);
  },
  // the string let go: a deep, short twang that dies at once, the slap of it on the bracer, and the arrow hissing away
  twang(power = 1) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    for (const [fq, v, d] of [[rnd(92, 104), 0.32, 0.22], [rnd(186, 206), 0.14, 0.12], [rnd(410, 450), 0.06, 0.06]]) {
      const o = a.createOscillator(), g = a.createGain(); o.type = "triangle";
      o.frequency.setValueAtTime(fq * 1.35, t); o.frequency.exponentialRampToValueAtTime(fq, t + 0.03);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * (0.4 + 0.6 * power), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.02);
    }
    const s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "lowpass"; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * (0.4 + 0.6 * power), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + 0.07);
    const h = noiseSrc(a), hf = a.createBiquadFilter(), hg = a.createGain();
    hf.type = "bandpass"; hf.Q.value = 2; hf.frequency.setValueAtTime(3200, t + 0.02); hf.frequency.exponentialRampToValueAtTime(1400, t + 0.4);
    hg.gain.setValueAtTime(0.0001, t + 0.02); hg.gain.exponentialRampToValueAtTime(0.07 * power, t + 0.06); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    h.connect(hf); hf.connect(hg); hg.connect(bus); h.start(t + 0.02, Math.random()); h.stop(t + 0.45);
  },

  // a blade or a haft through the air: noise that swells and falls away, its pitch rising with the stroke's speed
  whoosh(vol = 0.5, heavy = true) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, dur = heavy ? rnd(0.3, 0.36) : rnd(0.2, 0.25), peak = t + dur * 0.45;
    const s = noiseSrc(a), f = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.Q.value = 0.9;
    const lo = heavy ? 260 : 420, hi = heavy ? rnd(900, 1150) : rnd(1500, 1900);
    f.frequency.setValueAtTime(lo, t); f.frequency.exponentialRampToValueAtTime(hi, peak); f.frequency.exponentialRampToValueAtTime(lo * 0.8, t + dur);
    f2.type = "lowpass"; f2.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.35, peak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(f2); f2.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },

  // a human voice raised: a buzzing throat through the mouth's shape (a vowel), the pitch bending as a cry does.
  //   kind: "war" (a charging yell, low and long), "pain" (cut short, breaking), "fear" (high, a scream), "grunt" (the effort of a blow)
  //   high: a woman's or a boy's voice. at: where in the world it comes from.
  voice(kind = "war", { high = false, at = null, vol = 1 } = {}) {
    const a = ctx(); if (!a) return;
    const { node, k } = placed(a, at); if (k * vol < 0.02) return;
    const t = a.currentTime;
    const P = { war: [rnd(150, 190), rnd(0.9, 1.4), "a", 1.35, 0.8], pain: [rnd(220, 290), rnd(0.35, 0.6), r2(["ae", "a"]), 1.5, 0.55], fear: [rnd(330, 420), rnd(0.8, 1.3), r2(["ae", "e"]), 1.25, 0.75], grunt: [rnd(120, 160), rnd(0.16, 0.24), r2(["u", "o"]), 1.1, 1.6] }[kind];
    let [f0, dur, vw, rise, gain] = P;
    if (high) f0 *= 1.75;
    // the throat: a sawtooth and a square a little apart, for roughness, with a shake of vibrato
    const src = a.createGain(); src.gain.value = 1;
    const oscs = [["sawtooth", 1], ["square", 1.006]].map(([type, m]) => {
      const o = a.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * m * 0.85, t);
      o.frequency.linearRampToValueAtTime(f0 * m * rise, t + dur * 0.25);
      o.frequency.linearRampToValueAtTime(f0 * m * (kind === "pain" ? 0.7 : 0.92), t + dur);
      const og = a.createGain(); og.gain.value = type === "square" ? 0.25 : 0.6; o.connect(og); og.connect(src);
      return o;
    });
    const vib = a.createOscillator(), vg = a.createGain(); vib.frequency.value = rnd(5, 7.5); vg.gain.value = f0 * (kind === "fear" ? 0.045 : 0.025);
    vib.connect(vg); for (const o of oscs) vg.connect(o.frequency);
    // and breath in it, rasping
    const br = noiseSrc(a), bf = a.createBiquadFilter(), bg = a.createGain(); bf.type = "bandpass"; bf.frequency.value = 1800; bf.Q.value = 0.7; bg.gain.value = kind === "grunt" ? 0.5 : 0.22;
    br.connect(bf); bf.connect(bg); bg.connect(src);
    // the mouth: three formants in parallel
    const out = a.createGain();
    for (const [f, g] of VOWELS[vw]) { const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * (high ? 1.15 : 1) * rnd(0.95, 1.05); bp.Q.value = 6; const fg = a.createGain(); fg.gain.value = g * 2.2; src.connect(bp); bp.connect(fg); fg.connect(out); }
    // the envelope: in fast, held, falling away (a pain cry breaks off)
    const env = a.createGain(), v = 0.3 * gain * vol * k;
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(v, t + (kind === "war" ? 0.08 : 0.03));
    env.gain.setValueAtTime(v * 0.85, t + dur * 0.6); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // a little grit on top, as a voice cracks when it's pushed
    const sh = a.createWaveShaper(), c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.5); } sh.curve = c;
    out.connect(sh); sh.connect(env); env.connect(node);
    for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); }
    vib.start(t); vib.stop(t + dur + 0.05); br.start(t, Math.random() * 1.5); br.stop(t + dur + 0.05);
  },

  // your own breath: air through an open mouth — pink noise (soft, no crackle) shaped by the mouth's resonances,
  // "haa" going out and a thinner "hih" coming in, swelling and fading smoothly; winded, a little voice comes into it
  breath(inhale, vol = 0.6, period = 1.2, high = false) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, dur = period * (inhale ? 0.42 : 0.55);
    const pk = pinkNoise(a);
    const v = 0.22 * vol * (inhale ? 0.7 : 1);
    const g = a.createGain();
    // a smooth swell and a longer fall: no sharp edges, which is what made it rustle
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.6, t + dur * (inhale ? 0.35 : 0.2));
    g.gain.linearRampToValueAtTime(v, t + dur * (inhale ? 0.6 : 0.35));
    g.gain.setTargetAtTime(0.0001, t + dur * (inhale ? 0.65 : 0.45), dur * 0.22);
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = inhale ? 3400 : 2600; lp.Q.value = 0.5;
    g.connect(lp); lp.connect(bus);
    // the mouth: three soft resonances (the vowel), drifting a little over the breath
    const k = high ? 1.12 : 1;
    const F = inhale ? [[420, 3, 0.8], [1900, 4, 0.55], [2900, 5, 0.25]] : [[680, 2.5, 1], [1150, 3, 0.7], [2450, 4, 0.3]];
    for (const [fr, q, lv] of F) {
      const s = a.createBufferSource(); s.buffer = pk; s.loop = true;
      const f = a.createBiquadFilter(), lg = a.createGain();
      f.type = "bandpass"; f.Q.value = q;
      f.frequency.setValueAtTime(fr * k * (inhale ? 0.92 : 1.04), t); f.frequency.linearRampToValueAtTime(fr * k * (inhale ? 1.06 : 0.94), t + dur);
      lg.gain.value = lv;
      s.connect(f); f.connect(lg); lg.connect(g); s.start(t, Math.random() * 1.5); s.stop(t + dur * 2 + 0.1);
    }
    // the chest: a low, breathy rush under it
    const c = a.createBufferSource(); c.buffer = pk; c.loop = true;
    const cf = a.createBiquadFilter(), cg = a.createGain(); cf.type = "lowpass"; cf.frequency.value = 380; cg.gain.value = inhale ? 0.25 : 0.45;
    c.connect(cf); cf.connect(cg); cg.connect(g); c.start(t, Math.random()); c.stop(t + dur * 2 + 0.1);
    // winded (loud and quick): the voice catches on the way out — a soft "huh"
    if (!inhale && vol > 0.75 && period < 1.1) {
      const o = a.createOscillator(), og = a.createGain(), of = a.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.setValueAtTime(high ? 190 : 125, t); o.frequency.linearRampToValueAtTime(high ? 160 : 105, t + dur * 0.5);
      of.type = "bandpass"; of.frequency.value = 700; of.Q.value = 2;
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.018 * vol, t + dur * 0.12); og.gain.setTargetAtTime(0.0001, t + dur * 0.25, dur * 0.08);
      o.connect(of); of.connect(og); og.connect(g); o.start(t); o.stop(t + dur);
    }
  },

  // a bite, chewed: a soft crunch of noise, low
  chew() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = rnd(700, 1100); f.Q.value = 1.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + 0.2);
  },

  // steel on steel: a bright strike and a ring of partials that don't quite agree, dying away
  clang(vol = 1, at = null) {
    const a = ctx(); if (!a) return;
    const { node, k } = placed(a, at, 55); if (k * vol < 0.02) return;
    const t = a.currentTime, f = rnd(430, 620), v = 0.2 * vol * k;
    for (const [m, g, d] of [[1, 1, 0.9], [2.76, 0.6, 0.7], [5.40, 0.4, 0.45], [8.93, 0.25, 0.3], [13.3, 0.14, 0.2], [1.51, 0.3, 1.1]]) {
      const o = a.createOscillator(), og = a.createGain(); o.type = "sine"; o.frequency.value = f * m * rnd(0.995, 1.005);
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * g, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + d * rnd(0.8, 1.3));
      o.connect(og); og.connect(node); o.start(t); o.stop(t + 1.6);
    }
    // the hit itself: a hard click of noise, high
    const n = noiseSrc(a), hp = a.createBiquadFilter(), ng = a.createGain(); hp.type = "highpass"; hp.frequency.value = 3000;
    ng.gain.setValueAtTime(v * 1.4, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(hp); hp.connect(ng); ng.connect(node); n.start(t, Math.random()); n.stop(t + 0.08);
  },

  shout() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(200, t); o.frequency.linearRampToValueAtTime(260, t + 0.15); o.frequency.linearRampToValueAtTime(170, t + 0.5);
    f.type = "bandpass"; f.frequency.value = 700; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.6);
  },

  // a fly past the ear: a thin whine that swells and pans across
  buzz() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter(), lfo = a.createOscillator(), lg = a.createGain();
    const pan = a.createStereoPanner ? a.createStereoPanner() : null;
    o.type = "sawtooth"; o.frequency.value = 190 + Math.random() * 60;
    lfo.frequency.value = 23; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
    f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(f); f.connect(g);
    if (pan) { const s = Math.random() < 0.5 ? -1 : 1; pan.pan.setValueAtTime(s, t); pan.pan.linearRampToValueAtTime(-s, t + 1.5); g.connect(pan); pan.connect(bus); } else g.connect(bus);
    o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
  },

  heartbeat(vol = 0.4) {
    const a = ctx(); if (!a) return;
    for (const d of [0, 0.22]) {
      const t = a.currentTime + d;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
      g.gain.setValueAtTime(vol * (d ? 0.7 : 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2);
    }
  },

  // a crowd murmuring: a handful of voice-band noises, each swelling and falling
  murmur(on, vol = 1) {
    loop("murmur", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.09 * vol, a.currentTime, 1.2); g.connect(bus);
      const stop = [];
      for (let i = 0; i < 5; i++) {
        const s = noiseSrc(a), f = a.createBiquadFilter(), vg = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
        f.type = "bandpass"; f.frequency.value = rnd(300, 900); f.Q.value = 4;
        lfo.frequency.value = rnd(0.2, 0.9); lg.gain.value = 0.5; vg.gain.value = 0.5;
        lfo.connect(lg); lg.connect(vg.gain);
        s.connect(f); f.connect(vg); vg.connect(g);
        s.start(a.currentTime, Math.random()); lfo.start();
        stop.push(s, lfo);
      }
      return { g, stop };
    });
  },
  water(on) {
    loop("water", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.06, a.currentTime, 1); g.connect(bus);
      const s = noiseSrc(a), f = a.createBiquadFilter(), lfo = a.createOscillator(), lg = a.createGain();
      f.type = "lowpass"; f.frequency.value = 420; lfo.frequency.value = 0.18; lg.gain.value = 250;
      lfo.connect(lg); lg.connect(f.frequency); s.connect(f); f.connect(g); s.start(); lfo.start();
      return { g, stop: [s, lfo] };
    });
  },
  // rain: a soft hiss on the leaves and the roofs, heavier and lower as it comes down harder (k, 0 to 1),
  // and muffled to a drumming on the shingles when you are under a roof
  rain(k, under = false) {
    const a = ctx(); if (!a) return;
    if (k <= 0.01) { loop("rain", false); return; }
    const vol = 0.012 + k * 0.07;
    if (!loops.rain) loop("rain", true, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.connect(bus);
      const s = noiseSrc(a), hp = a.createBiquadFilter(), lp = a.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 900; lp.type = "lowpass"; lp.frequency.value = 7000;
      s.connect(hp); hp.connect(lp); lp.connect(g); s.start(0, Math.random() * 2);
      // and a few big drops off the leaves, now and then
      const self = { g, lp, hp, stop: [s], k };
      const drip = () => { if (loops.rain !== self) return; burst(a, a.currentTime, rnd(0.01, 0.03), rnd(0.01, 0.04) * self.k, rnd(2500, 6000), rnd(1200, 2400), 3); setTimeout(drip, rnd(40, 260) / (0.3 + self.k)); };
      setTimeout(drip, 100);
      return self;
    });
    const l = loops.rain; if (!l) return;
    l.k = k;
    l.g.gain.setTargetAtTime(vol * (under ? 0.7 : 1), a.currentTime, 0.8);
    l.lp.frequency.setTargetAtTime(under ? 1400 : 5000 + k * 3000, a.currentTime, 0.4);
    l.hp.frequency.setTargetAtTime(under ? 250 : 900 - k * 400, a.currentTime, 0.4);
  },
  // a brook: a bright babble over stones, louder as you come near (k, 0 to 1)
  brook(k) {
    const a = ctx(); if (!a) return;
    if (k <= 0.01) { loop("brook", false); return; }
    if (!loops.brook) loop("brook", true, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.connect(bus);
      const stop = [];
      for (let i = 0; i < 3; i++) {
        const s = noiseSrc(a), f = a.createBiquadFilter(), vg = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
        f.type = "bandpass"; f.frequency.value = rnd(900, 2600); f.Q.value = 2.5;
        lfo.frequency.value = rnd(1.5, 4.5); lg.gain.value = 0.45; vg.gain.value = 0.55; lfo.connect(lg); lg.connect(vg.gain);
        s.connect(f); f.connect(vg); vg.connect(g); s.start(0, Math.random() * 2); lfo.start(); stop.push(s, lfo);
      }
      return { g, stop };
    });
    if (loops.brook) loops.brook.g.gain.setTargetAtTime(0.05 * k * k, a.currentTime, 0.5);
  },
  // a tawny owl, somewhere off in the trees: a long hoo, a pause, and the quavering hoo-hoo-hoooo
  owl(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 120); if (P.k <= 0.01) return;
    const t0 = a.currentTime, note = (t, dur, f0, f1, v) => {
      const o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
      o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
      lp.type = "lowpass"; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * P.k, t + 0.05); g.gain.setValueAtTime(v * P.k, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(P.node); o.start(t); o.stop(t + dur + 0.02);
    };
    note(t0, 0.55, 410, 380, 0.07);
    for (let i = 0; i < 3; i++) note(t0 + 1.6 + i * 0.16, 0.12, 400, 390, 0.05);
    note(t0 + 2.15, 0.85, 405, 370, 0.07);
  },
  // a woodpecker drumming on a dead branch, a quick roll that dies away
  woodpecker(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 90); if (P.k <= 0.01) return;
    const t0 = a.currentTime, n = 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) { const t = t0 + i * (0.045 + i * 0.0012); burst(a, t, 0.02, 0.06 * P.k * (1 - i / n * 0.6), rnd(1300, 1600), 900, 4); }
  },
  // a frog in the pond: a low double croak, from where it sits (at: {x, z})
  frog(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 50); if (P.k <= 0.01) return;
    const t = a.currentTime, f0 = rnd(380, 520), n = Math.random() < 0.6 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const o = a.createOscillator(), g = a.createGain(), bp = a.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.setValueAtTime(f0 * 0.5, t + i * 0.16); o.frequency.linearRampToValueAtTime(f0 * 0.42, t + i * 0.16 + 0.1);
      bp.type = "bandpass"; bp.frequency.value = f0 * 1.6; bp.Q.value = 3;
      // (the throb in it: a fast flutter on the loudness)
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = rnd(28, 40); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t + i * 0.16); g.gain.linearRampToValueAtTime(0.09 * P.k, t + i * 0.16 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.12);
      o.connect(bp); bp.connect(g); g.connect(P.node); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.14); lfo.start(t + i * 0.16); lfo.stop(t + i * 0.16 + 0.14);
    }
  },
  // a duck's quack: a nasal, falling honk, once or twice
  quack(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 40); if (P.k <= 0.01) return;
    const t = a.currentTime, n = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const t0 = t + i * 0.22, o = a.createOscillator(), g = a.createGain(), f1 = a.createBiquadFilter(), f2 = a.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.setValueAtTime(rnd(300, 360), t0); o.frequency.exponentialRampToValueAtTime(rnd(200, 240), t0 + 0.16);
      f1.type = "bandpass"; f1.frequency.value = 1100; f1.Q.value = 4; f2.type = "bandpass"; f2.frequency.value = 2400; f2.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.12 * P.k, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(P.node); o.start(t0); o.stop(t0 + 0.2);
    }
  },
  // thunder: d is how far the strike was, 0 (overhead: a crack, then the roll) to 1 (far off: only a low grumble)
  thunder(d = 0.5) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, near = 1 - d;
    if (near > 0.6) burst(a, t, 0.35, 0.35 * near, 2400, 300, 0.7, "lowpass");
    // the roll: several overlapping rumbles, each lower and later
    for (let i = 0; i < 4 + Math.round(near * 3); i++) burst(a, t + 0.05 + i * rnd(0.25, 0.6), rnd(1.2, 2.6), (0.16 + near * 0.22) * (1 - i * 0.1), 260 + near * 300, 50, 0.6, "lowpass");
  },
  wind(on, vol = 1) {
    loop("wind", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05 * vol, a.currentTime, 2); g.connect(bus);
      const s = noiseSrc(a), f = a.createBiquadFilter(), lfo = a.createOscillator(), lg = a.createGain();
      s.playbackRate.value = 0.5;
      f.type = "bandpass"; f.frequency.value = 500; f.Q.value = 0.7; lfo.frequency.value = 0.07; lg.gain.value = 300;
      lfo.connect(lg); lg.connect(f.frequency); s.connect(f); f.connect(g); s.start(); lfo.start();
      return { g, stop: [s, lfo] };
    });
  },

  // ---- the kitchen ----
  // fat in a hot pan: a bright hiss, and the crackle and spit of it, louder the hotter (k, 0 to 1)
  sizzle(on, k = 0.5) {
    const a = ctx(); if (!a) return;
    if (on && loops.sizzle) { loops.sizzle.g.gain.setTargetAtTime(0.05 + k * 0.09, a.currentTime, 0.2); loops.sizzle.k = k; return; }
    loop("sizzle", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05 + k * 0.09, a.currentTime, 0.3); g.connect(bus);
      const s = noiseSrc(a), hp = a.createBiquadFilter(), pk = a.createBiquadFilter(), lfo = a.createOscillator(), lg = a.createGain();
      hp.type = "highpass"; hp.frequency.value = 2600; pk.type = "peaking"; pk.frequency.value = 5200; pk.gain.value = 6;
      lfo.frequency.value = 7; lg.gain.value = 0.25; const am = a.createGain(); am.gain.value = 0.75; lfo.connect(lg); lg.connect(am.gain);
      s.connect(hp); hp.connect(pk); pk.connect(am); am.connect(g); s.start(); lfo.start();
      // the spitting: little pops, more of them as it gets hotter
      const self = { g, stop: [s, lfo], k };
      const spit = () => { if (loops.sizzle !== self) return; const t = a.currentTime; if (Math.random() < 0.3 + self.k * 0.6) burst(a, t, rnd(0.008, 0.025), rnd(0.03, 0.09) * (0.5 + self.k), rnd(3000, 7000), rnd(1500, 3000), 2); setTimeout(spit, rnd(30, 140)); };
      setTimeout(spit, 50);
      return self;
    });
  },
  // a pot at the simmer: a low wash, and bubbles that rise in pitch as they burst, more of them as it boils
  bubble(on, k = 0.5) {
    const a = ctx(); if (!a) return;
    if (on && loops.bubble) { loops.bubble.k = k; loops.bubble.g.gain.setTargetAtTime(0.04 + k * 0.05, a.currentTime, 0.3); return; }
    loop("bubble", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.04 + k * 0.05, a.currentTime, 0.4); g.connect(bus);
      const s = noiseSrc(a), lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380; s.playbackRate.value = 0.6;
      s.connect(lp); lp.connect(g); s.start();
      const self = { g, stop: [s], k };
      const pop = () => {
        if (loops.bubble !== self) return;
        const t = a.currentTime, o = a.createOscillator(), og = a.createGain(), f = rnd(180, 420);
        o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(2.2, 3.4), t + 0.06);
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05 * (0.4 + self.k), t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(og); og.connect(bus); o.start(t); o.stop(t + 0.1);
        setTimeout(pop, rnd(60, 380) / (0.4 + self.k));
      };
      setTimeout(pop, 100);
      return self;
    });
  },
  // a knife through meat onto the board: the cut, and the knock of the board under it
  knife() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    burst(a, t, 0.05, 0.08, 2400, 900, 1.5);
    const o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(230, t + 0.02); o.frequency.exponentialRampToValueAtTime(120, t + 0.09);
    g.gain.setValueAtTime(0.0001, t + 0.02); g.gain.exponentialRampToValueAtTime(0.14, t + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(bus); o.start(t + 0.02); o.stop(t + 0.14);
  },
  // a wooden spoon round an iron pot: a scrape, and a knock against the side
  stir() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    burst(a, t, 0.32, 0.05, 700, 1100, 3);
    burst(a, t + 0.35, 0.28, 0.04, 1000, 650, 3);
    const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.value = rnd(520, 640);
    g.gain.setValueAtTime(0.0001, t + 0.62); g.gain.exponentialRampToValueAtTime(0.05, t + 0.625); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(bus); o.start(t + 0.6); o.stop(t + 0.95);
  },
  // the pan given a shake and what's in it turned: a rattle of iron, a whoosh, and the slap of it landing
  toss() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    this.clang(0.18); this.whoosh(0.22, false);
    burst(a, t + 0.32, 0.06, 0.14, 900, 300, 1);
    if (loops.sizzle) burst(a, t + 0.34, 0.4, 0.08, 5000, 3000, 0.7, "highpass");
  },
  // a plate set down: a clean ceramic tick and its ring
  plate() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    for (const [f, v, d] of [[2100, 0.06, 0.25], [3350, 0.04, 0.18], [5200, 0.025, 0.12]]) {
      const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.value = f * rnd(0.98, 1.02);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.02);
    }
    burst(a, t, 0.03, 0.06, 4000, 2000, 1);
  },
  // two men at it with their fists: a dull thump, and the breath knocked out
  punch(at = null) {
    const a = ctx(); if (!a) return;
    const { node, k } = placed(a, at, 40); if (k < 0.02) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * k, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(node); o.start(t); o.stop(t + 0.18);
    const n = noiseSrc(a), f = a.createBiquadFilter(), ng = a.createGain(); f.type = "lowpass"; f.frequency.value = 900;
    ng.gain.setValueAtTime(0.2 * k, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(f); f.connect(ng); ng.connect(node); n.start(t, Math.random()); n.stop(t + 0.08);
  },

  // ---- music: played by the players in music.js — a tune for the mood, a rest, another ----
  _mood: null,
  music(mood) {
    if (mood === this._mood) return;
    this._mood = mood;
    if (!MUSIC) MUSIC = createMusic(() => ctx(), () => { ctx(); return musicBus; });
    MUSIC.play(mood);
  },
  get musicState() { return MUSIC ? { mood: MUSIC.mood, playing: MUSIC.playing } : null; },
};


window.__audio = AUDIO;
