// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The first Forester's sound engine (../sfx.js) makes the axes, the birds and
// the footsteps. This adds what a city has and a clearing does not: bells
// that can grow faint, a crowd, a drum, a door being beaten at midnight — and
// music that is a mood rather than a march. Still no audio files.

/* global SFX */

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

  // your own breath: air through the mouth — in (rising, thinner) or out (falling, fuller)
  breath(inhale, vol = 0.6, period = 1.2, high = false) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, dur = period * (inhale ? 0.36 : 0.5);
    // air through the mouth: two bands of noise — the throat's low rush and the lips' hiss — so it
    // reads as breath, close to the ear, and not as wind
    const base = (inhale ? 1300 : 900) * (high ? 1.25 : 1);
    const v = 0.13 * vol * (inhale ? 0.85 : 1);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * (inhale ? 0.5 : 0.18)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    for (const [fm, q, lv] of [[1, 1.4, 1], [2.6, 2.2, 0.55]]) {
      const s = noiseSrc(a), f = a.createBiquadFilter(), lg = a.createGain();
      f.type = "bandpass"; f.Q.value = q;
      f.frequency.setValueAtTime(base * fm * (inhale ? 0.8 : 1.15), t); f.frequency.exponentialRampToValueAtTime(base * fm * (inhale ? 1.25 : 0.75), t + dur);
      lg.gain.value = lv;
      s.connect(f); f.connect(lg); lg.connect(g); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
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

  // ---- music: slow chords and a few plucked notes, per mood ----
  _mood: null, _mt: null, _step: 0,
  music(mood) {
    if (mood === this._mood) return;
    this._mood = mood;
    clearTimeout(this._mt);
    if (!mood) return;
    this._step = 0;
    const tick = () => { if (this._mood !== mood) return; this._play(mood); this._mt = setTimeout(tick, MOODS[mood].bar * 1000); };
    tick();
  },
  _play(mood) {
    const a = ctx(); if (!a || !window.__reckonMusic) return;
    const M = MOODS[mood], t = a.currentTime + 0.05;
    const chord = M.chords[this._step % M.chords.length];
    this._step++;
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    for (const n of chord) {
      const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = M.wave; o2.type = "sine"; o.frequency.value = hz(n); o2.frequency.value = hz(n) * 1.003;
      f.type = "lowpass"; f.frequency.value = M.cut;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(M.vol, t + M.bar * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + M.bar * 1.15);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus);
      o.start(t); o2.start(t); o.stop(t + M.bar * 1.2); o2.stop(t + M.bar * 1.2);
    }
    // a few notes on top, like someone picking at a cittern
    if (M.pluck) for (let i = 0; i < 4; i++) {
      if (Math.random() > M.pluck) continue;
      const n = chord[Math.floor(Math.random() * chord.length)] + 12 * (1 + (Math.random() < 0.3 ? 1 : 0));
      const tt = t + (i * M.bar) / 4 + Math.random() * 0.1;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "triangle"; o.frequency.value = hz(n);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.07, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4);
      o.connect(g); g.connect(musicBus); o.start(tt); o.stop(tt + 1.5);
    }
  },
};

const MOODS = {
  title:  { bar: 6, wave: "triangle", cut: 900, vol: 0.05, pluck: 0.55, chords: [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 61]] },
  home:   { bar: 5, wave: "triangle", cut: 1100, vol: 0.045, pluck: 0.7, chords: [[50, 57, 62, 66], [55, 59, 62, 67], [47, 54, 59, 62], [52, 57, 61, 64]] },
  unease: { bar: 7, wave: "sawtooth", cut: 420, vol: 0.035, pluck: 0.2, chords: [[45, 52, 57, 60], [44, 51, 56, 59], [46, 53, 58, 61], [45, 52, 56, 60]] },
  dread:  { bar: 8, wave: "sawtooth", cut: 320, vol: 0.05, pluck: 0, chords: [[38, 45, 50, 53], [37, 44, 49, 52], [38, 45, 50, 51]] },
  grief:  { bar: 7, wave: "triangle", cut: 700, vol: 0.05, pluck: 0.35, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 55]] },
  flight: { bar: 3, wave: "sawtooth", cut: 520, vol: 0.04, pluck: 0.1, chords: [[40, 47, 52, 55], [41, 48, 53, 56], [40, 47, 52, 55], [39, 46, 51, 54]] },
  woods:  { bar: 6, wave: "triangle", cut: 1000, vol: 0.04, pluck: 0.5, chords: [[43, 50, 55, 59], [48, 55, 60, 64], [45, 52, 57, 60], [50, 57, 62, 66]] },
  hope:   { bar: 5, wave: "triangle", cut: 1300, vol: 0.05, pluck: 0.8, chords: [[48, 55, 60, 64], [53, 57, 60, 65], [45, 52, 57, 60], [55, 59, 62, 67]] },
};
window.__audio = AUDIO;
