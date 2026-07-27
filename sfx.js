"use strict";

// ===== Forester SFX — all sounds synthesized with Web Audio, no samples =====

const SFX = (() => {
  let ac = null, master = null, sfxBus = null, noiseBuf = null, fireNode = null;

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      sfxBus = ac.createGain();      // game SFX only — ducked while the pause menu is open; music bypasses it
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      const len = ac.sampleRate * 2;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      window.__foresterAC = ac; window.__foresterMaster = master; window.__foresterNoise = noiseBuf;
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  // unlock on first user gesture (autoplay policy)
  addEventListener("pointerdown", ctx, { once: true });
  addEventListener("keydown", ctx, { once: true });

  const FSET = () => window.FSET || {};
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (FSET().sfx === false) return;
    const a = ctx(), t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, f0, f1, q = 1, type = "bandpass", delay = 0) {
    if (FSET().sfx === false) return;
    const a = ctx(), t = a.currentTime + delay;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t); s.stop(t + dur + 0.02);
  }

  let windNode = null;
  return {
    setMaster: (v) => { ctx(); master.gain.value = v; },
    pauseAll: (on) => { if (!ac) return; sfxBus.gain.setTargetAtTime(on ? 0.0001 : 1, ac.currentTime, 0.04); },
    windLoop: (on) => {
      if (FSET().ambient === false) on = false;
      if (on && !windNode) {
        const a = ctx(), t = a.currentTime;
        const f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
        f.type = "bandpass"; f.frequency.value = 600; f.Q.value = 0.5;
        g.gain.value = 0.0001;
        g.gain.setTargetAtTime(0.04, t, 0.8);          // wind swells in, gently
        lfo.type = "sine"; lfo.frequency.value = 0.23;  // slow gusting
        lg.gain.value = 0.02;
        lfo.connect(lg); lg.connect(g.gain);
        // two detuned noise sources at random offsets: loop points never align, no audible repeat
        const srcs = [1, 0.81].map(rate => {
          const s = a.createBufferSource();
          s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate;
          s.connect(f); s.start(t, Math.random() * 1.9);
          return s;
        });
        f.connect(g); g.connect(sfxBus);
        lfo.start(t);
        windNode = { srcs, lfo, g };
      } else if (!on && windNode) {
        const a = ctx(), t = a.currentTime;
        windNode.g.gain.setTargetAtTime(0.0001, t, 0.5);
        const wn = windNode; windNode = null;
        setTimeout(() => { try { wn.srcs.forEach(s => s.stop()); wn.lfo.stop(); } catch (e) {} }, 1800);
      }
    },
    click:    () => { tone("square", 900, 700, 0.05, 0.12); },
    swing:    () => { noise(0.14, 0.22, 2400, 500, 2); },                              // sword whoosh
    swingFist:() => { noise(0.11, 0.16, 900, 250, 1.5); },                             // duller fist whoosh
    hit:      () => { tone("triangle", 160, 55, 0.14, 0.35); noise(0.08, 0.2, 300, 120, 1, "lowpass"); },
    dodge:    () => { noise(0.16, 0.18, 700, 2600, 2); },                              // rising whoosh
    // black powder: a flat crack, a deep boom, and the tail rolling away
    musket:   () => {
      noise(0.05, 0.5, 3000, 900, 0.7, "bandpass");
      noise(0.42, 0.42, 900, 90, 0.8, "lowpass");
      tone("triangle", 150, 42, 0.3, 0.3);
      noise(0.75, 0.13, 500, 70, 0.6, "lowpass", 0.06);
    },
    ramrod:   () => { tone("square", 420, 300, 0.05, 0.08); noise(0.07, 0.1, 2200, 800, 2, "bandpass", 0.05); },
    // a soft two-note chime when word arrives — enough to look up, not to startle
    popup:    () => { tone("sine", 784, 784, 0.16, 0.10); tone("sine", 1175, 1175, 0.26, 0.085, 0.11); },
    // the war horn: brazen blasts from the treeline — raiders are coming
    warHorn:  () => {
      if (FSET().sfx === false) return;
      const a = ctx();
      const blast = (t0, f0, dur, vol) => {
        const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100; lp.Q.value = 1.2;
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.14);        // the swell of breath
        g.gain.setValueAtTime(vol, t0 + Math.max(0.15, dur - 0.18));
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        const vib = a.createOscillator(), vg = a.createGain();
        vib.type = "sine"; vib.frequency.value = 5.2; vg.gain.value = 3.5;
        vib.connect(vg);
        for (const ratio of [1, 1.007, 0.5]) {                      // unison pair + an octave-down growl
          const o = a.createOscillator();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(f0 * ratio * 0.94, t0);
          o.frequency.exponentialRampToValueAtTime(f0 * ratio, t0 + 0.12);   // scooping up into the note
          vg.connect(o.frequency);
          o.connect(lp);
          o.start(t0); o.stop(t0 + dur + 0.05);
        }
        lp.connect(g); g.connect(sfxBus);
        vib.start(t0); vib.stop(t0 + dur + 0.05);
      };
      const t = a.currentTime;
      blast(t, 175, 0.75, 0.30);          // the call
      blast(t + 0.85, 175, 0.45, 0.28);   // the short repeat
      blast(t + 1.4, 233, 1.15, 0.32);    // up a fourth and held — the warning
      noise(0.12, 0.08, 1800, 700, 1, "bandpass", 0);      // breath chiff on each onset
      noise(0.10, 0.07, 1800, 700, 1, "bandpass", 0.85);
      noise(0.12, 0.08, 1900, 800, 1, "bandpass", 1.4);
    },
    chop:     () => { noise(0.06, 0.3, 700, 250, 1, "lowpass"); tone("triangle", 220, 90, 0.07, 0.2); },
    treeFall: () => { noise(0.5, 0.3, 500, 80, 1, "lowpass"); tone("triangle", 110, 40, 0.5, 0.25); },
    quarry:   () => { tone("square", 1900, 1500, 0.04, 0.1); noise(0.06, 0.28, 2600, 900, 3); },
    rustle:   () => { noise(0.1, 0.12, 4500, 2000, 1); },                              // wheat/seed rustle
    pickup:   () => { tone("square", 660, 990, 0.07, 0.14); },
    hammer:   () => { tone("triangle", 260, 130, 0.06, 0.22); noise(0.05, 0.16, 1800, 700, 2); },
    build:    () => { tone("triangle", 200, 100, 0.1, 0.25); tone("triangle", 300, 150, 0.1, 0.22, 0.12); tone("square", 520, 780, 0.12, 0.14, 0.26); },
    coin:     () => { tone("square", 990, 990, 0.06, 0.16); tone("square", 1320, 1320, 0.09, 0.16, 0.06); },
    coinLoss: () => { tone("square", 660, 660, 0.06, 0.16); tone("square", 440, 330, 0.12, 0.16, 0.07); },
    death:    () => { tone("sawtooth", 320, 40, 0.6, 0.3); noise(0.3, 0.14, 500, 100, 1, "lowpass", 0.1); },
    eat:      () => { noise(0.05, 0.22, 1400, 600, 2); noise(0.05, 0.2, 1200, 500, 2, "bandpass", 0.11); noise(0.06, 0.16, 1000, 400, 2, "bandpass", 0.22); },
    step:     (fast) => { if (FSET().ambient === false) return; noise(0.035, fast ? 0.09 : 0.06, 900, 300, 1, "lowpass"); },
    crackle:  () => { noise(0.09, 0.2, 2600, 700, 3); noise(0.06, 0.16, 1800, 500, 3, "bandpass", 0.05); },
    research: () => {
      // a little eureka: rising fourth, fifth, octave with a shimmer on top
      tone("square", 523, 523, 0.09, 0.14);
      tone("square", 659, 659, 0.09, 0.14, 0.1);
      tone("square", 784, 784, 0.1, 0.15, 0.2);
      tone("square", 1046, 1046, 0.22, 0.16, 0.3);
      tone("triangle", 2093, 2093, 0.18, 0.07, 0.34);
    },
    bird: () => {
      if (FSET().ambient === false || FSET().sfx === false) return;
      const a = ctx(), t0 = a.currentTime;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * (0.09 + Math.random() * 0.07);
        const f = 2400 + Math.random() * 1800;
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * (0.7 + Math.random() * 0.6), t + 0.07);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.1);
      }
    },
    gameOver: () => {
      // slow minor descent
      tone("triangle", 440, 440, 0.55, 0.22);
      tone("triangle", 349.2, 349.2, 0.55, 0.22, 0.5);
      tone("triangle", 293.7, 293.7, 0.6, 0.22, 1.0);
      tone("triangle", 220, 218, 1.6, 0.24, 1.5);
      tone("sawtooth", 110, 108, 1.8, 0.12, 1.5);
    },
    fireLoop: (on) => {
      if (FSET().ambient === false) on = false;
      if (on && !fireNode) {
        const a = ctx(), t = a.currentTime;
        const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
        s.buffer = noiseBuf; s.loop = true;
        f.type = "lowpass"; f.frequency.value = 480; f.Q.value = 0.8;
        g.gain.value = 0.11;
        lfo.type = "sawtooth"; lfo.frequency.value = 9;   // flicker
        lg.gain.value = 0.05;
        lfo.connect(lg); lg.connect(g.gain);
        s.connect(f); f.connect(g); g.connect(sfxBus);
        s.start(t); lfo.start(t);
        fireNode = { s, lfo, g };
      } else if (!on && fireNode) {
        const a = ctx(), t = a.currentTime;
        fireNode.g.gain.setTargetAtTime(0.0001, t, 0.3);
        const fn = fireNode; fireNode = null;
        setTimeout(() => { try { fn.s.stop(); fn.lfo.stop(); } catch (e) {} }, 900);
      }
    },
  };
})();

// every UI button clicks
document.addEventListener("click", e => {
  if (e.target.closest && e.target.closest(".btn")) SFX.click();
}, true);

// ===== MUSIC — original looping chiptune, synthesized like everything else =====
const MUSIC = (() => {
  let wanted = false, nextLoopAt = 0, timer = null, mg = null;
  const BPM = 92, STEP = 60 / BPM / 2;   // 8th notes
  const N = n => n === 0 ? 0 : 440 * Math.pow(2, (n - 69) / 12);
  // A minor, 4 bars of 8ths (32 steps), wistful and steady
  const LEAD = [69,0,72,0,71,69,0,0, 64,0,67,0,69,0,0,0, 65,0,69,0,67,65,0,0, 64,0,62,0,64,0,0,0];
  const LEAD2= [76,0,74,72,71,0,72,0, 69,0,0,0,64,0,67,0, 65,0,67,69,71,0,69,0, 67,0,64,0,62,0,64,0];
  const BASS = [45,0,0,0,45,0,52,0, 40,0,0,0,40,0,47,0, 41,0,0,0,41,0,48,0, 43,0,0,0,40,0,43,0];
  const HAT  = [0,1,0,1,0,1,0,2, 0,1,0,1,0,1,0,1, 0,1,0,1,0,1,0,2, 0,1,0,1,0,1,1,1];

  function getCtx() {
    // reuse the SFX context lazily via a played-silent call
    SFX.click; // noop reference
    return (function () { return window.__foresterAC; })();
  }

  function scheduleLoop(a, t0, phrase) {
    const lead = phrase % 2 ? LEAD2 : LEAD;
    for (let i = 0; i < 32; i++) {
      const t = t0 + i * STEP;
      if (lead[i]) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square"; o.frequency.value = N(lead[i]);
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.8);
        o.connect(g); g.connect(mg);
        o.start(t); o.stop(t + STEP * 2);
      }
      if (BASS[i]) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "triangle"; o.frequency.value = N(BASS[i]);
        g.gain.setValueAtTime(0.26, t);
        g.gain.exponentialRampToValueAtTime(0.003, t + STEP * 3.6);
        o.connect(g); g.connect(mg);
        o.start(t); o.stop(t + STEP * 4);
      }
      if (HAT[i]) {
        const s2 = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        s2.buffer = window.__foresterNoise; s2.loop = true;
        f.type = "highpass"; f.frequency.value = HAT[i] === 2 ? 4500 : 7000;
        g.gain.setValueAtTime(HAT[i] === 2 ? 0.09 : 0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        s2.connect(f); f.connect(g); g.connect(mg);
        s2.start(t); s2.stop(t + 0.08);
      }
    }
    return 32 * STEP;
  }

  let phrase = 0;
  function pump() {
    if (!wanted) return;
    const a = window.__foresterAC;
    if (!a || a.state !== "running") { timer = setTimeout(pump, 300); return; }
    if (!mg) { mg = a.createGain(); mg.gain.value = 1; mg.connect(window.__foresterMaster); }
    const now = a.currentTime;
    if (nextLoopAt < now + 0.15) {
      const start = Math.max(nextLoopAt, now + 0.1);
      const dur = scheduleLoop(a, start, phrase++);
      nextLoopAt = start + dur;
    }
    timer = setTimeout(pump, 250);   // loops forever until stop()
  }

  // battle theme: driving minor riff, plays while raiders threaten the town
  let bWanted = false, bNext = 0, bTimer = null, bg = null;
  const BSTEP = 60 / 150 / 2;
  const BLEAD = [57,0,57,60, 57,0,55,0, 57,0,57,60, 62,0,60,0, 57,0,57,60, 63,62,60,58, 57,0,60,0, 55,0,52,0];
  const BBASS = [33,33,0,33, 33,33,0,33, 33,33,0,33, 36,0,34,0, 33,33,0,33, 33,33,0,33, 31,31,0,31, 28,0,31,0];
  function bSchedule(a, t0) {
    for (let i = 0; i < 32; i++) {
      const t = t0 + i * BSTEP;
      if (BLEAD[i]) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square"; o.frequency.value = N(BLEAD[i]);
        g.gain.setValueAtTime(0.11, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + BSTEP * 1.6);
        o.connect(g); g.connect(bg); o.start(t); o.stop(t + BSTEP * 2);
      }
      if (BBASS[i]) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sawtooth"; o.frequency.value = N(BBASS[i]);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.003, t + BSTEP * 1.8);
        o.connect(g); g.connect(bg); o.start(t); o.stop(t + BSTEP * 2);
      }
      if (i % 4 === 0) {
        const s2 = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        s2.buffer = window.__foresterNoise; s2.loop = true;
        f.type = "highpass"; f.frequency.value = 6000;
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        s2.connect(f); f.connect(g); g.connect(bg); s2.start(t); s2.stop(t + 0.07);
      }
    }
    return 32 * BSTEP;
  }
  function bPump() {
    if (!bWanted) return;
    const a = window.__foresterAC;
    if (!a || a.state !== "running") { bTimer = setTimeout(bPump, 300); return; }
    if (!bg) { bg = a.createGain(); bg.gain.value = 0.9; bg.connect(window.__foresterMaster); }
    const now = a.currentTime;
    if (bNext < now + 0.15) {
      const start = Math.max(bNext, now + 0.08);
      bNext = start + bSchedule(a, start);
    }
    bTimer = setTimeout(bPump, 200);
  }

  // ===== marches: a column on the road deserves a band =====
  // Three tunes in the old style, written out as note numbers — nothing sampled.
  const MARCHES = {
    grenadier: {
      name: "The Grenadier's March", bpm: 108,
      lead: [72,0,72,72, 76,0,74,72, 79,0,0,0, 76,0,74,72,
             77,0,77,76, 74,0,72,74, 76,0,0,0, 72,0,0,0],
      bass: [48,0,55,0, 48,0,55,0, 53,0,60,0, 53,0,60,0,
             50,0,57,0, 50,0,57,0, 48,0,55,0, 48,0,0,0],
      snare:[2,0,1,1, 2,0,1,0, 2,0,1,1, 2,0,1,0,
             2,0,1,1, 2,0,1,0, 2,0,1,1, 2,1,1,1],
    },
    hussar: {
      name: "Hussars of the Line", bpm: 122,
      lead: [69,0,71,72, 74,0,72,71, 69,0,67,0, 65,0,67,69,
             71,0,72,74, 76,0,74,72, 71,0,69,0, 69,0,0,0],
      bass: [45,0,52,0, 45,0,52,0, 41,0,48,0, 41,0,48,0,
             43,0,50,0, 43,0,50,0, 45,0,52,0, 45,0,0,0],
      snare:[2,0,1,0, 1,0,1,0, 2,0,1,0, 1,0,1,1,
             2,0,1,0, 1,0,1,0, 2,0,1,1, 2,1,1,1],
    },
    oldguard: {
      name: "March of the Old Guard", bpm: 96,
      lead: [64,0,0,64, 67,0,0,69, 71,0,0,0, 69,0,67,0,
             64,0,0,64, 67,0,0,71, 72,0,0,0, 71,0,0,0],
      bass: [40,0,47,0, 40,0,47,0, 45,0,52,0, 45,0,52,0,
             40,0,47,0, 40,0,47,0, 43,0,50,0, 43,0,0,0],
      snare:[2,0,0,1, 2,0,0,1, 2,0,1,1, 2,0,0,0,
             2,0,0,1, 2,0,0,1, 2,0,1,1, 2,1,1,1],
    },
  };
  let mWanted = false, mNext = 0, mTimer = null, mGain = null, mTune = "grenadier", mPhrase = 0;

  function marchLoop(a, t0, tune) {
    const step = 60 / tune.bpm / 2;
    for (let i = 0; i < 32; i++) {
      const t = t0 + i * step;
      if (tune.lead[i]) {                                   // fifes, doubled an octave up
        for (const [mul, vol, type] of [[1, 0.075, "square"], [2, 0.032, "triangle"]]) {
          const o = a.createOscillator(), g = a.createGain();
          o.type = type; o.frequency.setValueAtTime(N(tune.lead[i]) * mul, t);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.7);
          o.connect(g); g.connect(mGain); o.start(t); o.stop(t + step * 1.9);
        }
      }
      if (tune.bass[i]) {                                   // the bass drum walking underneath
        const o = a.createOscillator(), g = a.createGain();
        o.type = "triangle"; o.frequency.setValueAtTime(N(tune.bass[i]), t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.10, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.4);
        o.connect(g); g.connect(mGain); o.start(t); o.stop(t + step * 1.6);
      }
      if (tune.snare[i]) {                                  // side drum: a rap and a roll
        const hard = tune.snare[i] === 2;
        const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        s.buffer = window.__foresterNoise; s.loop = true;
        f.type = "highpass"; f.frequency.value = hard ? 1800 : 2600;
        g.gain.setValueAtTime(hard ? 0.075 : 0.035, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (hard ? 0.11 : 0.06));
        s.connect(f); f.connect(g); g.connect(mGain);
        s.start(t); s.stop(t + 0.14);
      }
    }
    return t0 + 32 * step;
  }
  function marchPump() {
    if (!mWanted) return;
    const a = window.__foresterAC;
    if (!a || a.state !== "running") { mTimer = setTimeout(marchPump, 300); return; }
    if (!mGain) { mGain = a.createGain(); mGain.gain.value = 1; mGain.connect(window.__foresterMaster); }
    if (mNext < a.currentTime + 0.15) mNext = a.currentTime + 0.15;
    while (mNext < a.currentTime + 2.2) mNext = marchLoop(a, mNext, MARCHES[mTune] || MARCHES.grenadier);
    mTimer = setTimeout(marchPump, 220);
  }

  return {
    marches: () => Object.entries(MARCHES).map(([id, m]) => ({ id, name: m.name })),
    setMarch(id) { if (MARCHES[id]) mTune = id; },
    currentMarch: () => mTune,
    march(on) {
      if ((window.FSET || {}).march === false) on = false;
      if (on && !mWanted) { mWanted = true; mNext = 0; if (mGain) mGain.gain.value = 1; marchPump(); }
      else if (!on && mWanted) {
        mWanted = false;
        clearTimeout(mTimer);
        const a = window.__foresterAC;
        if (mGain && a) mGain.gain.setTargetAtTime(0.0001, a.currentTime, 0.4);
        setTimeout(() => { if (mGain) { try { mGain.disconnect(); } catch (e) {} mGain = null; } }, 1600);
      }
    },
    battle(on) {
      if ((window.FSET || {}).battle === false) on = false;
      if (on && !bWanted) { bWanted = true; bNext = 0; if (bg) bg.gain.value = 0.9; bPump(); }
      else if (!on && bWanted) {
        bWanted = false;
        clearTimeout(bTimer);
        const a = window.__foresterAC;
        if (bg && a) bg.gain.setTargetAtTime(0.0001, a.currentTime, 0.5);
        setTimeout(() => { if (bg) { try { bg.disconnect(); } catch (e) {} bg = null; } }, 1800);
      }
    },
    play() {
      if ((window.FSET || {}).music === false) return;
      if (wanted) return;
      wanted = true; nextLoopAt = 0;
      if (mg) mg.gain.setValueAtTime(1, window.__foresterAC ? window.__foresterAC.currentTime : 0);
      pump();
    },
    stop() {
      wanted = false;
      clearTimeout(timer);
      const a = window.__foresterAC;
      if (mg && a) mg.gain.setTargetAtTime(0.0001, a.currentTime, 0.4);
      setTimeout(() => { if (mg) { try { mg.disconnect(); } catch (e) {} mg = null; } }, 1500);
    },
  };
})();
