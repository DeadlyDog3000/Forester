"use strict";

// ===== Forester SFX — all sounds synthesized with Web Audio, no samples =====

const SFX = (() => {
  let ac = null, master = null, noiseBuf = null, fireNode = null;

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      const len = ac.sampleRate * 2;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  // unlock on first user gesture (autoplay policy)
  addEventListener("pointerdown", ctx, { once: true });

  function tone(type, f0, f1, dur, vol, delay = 0) {
    const a = ctx(), t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, f0, f1, q = 1, type = "bandpass", delay = 0) {
    const a = ctx(), t = a.currentTime + delay;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  return {
    click:    () => { tone("square", 900, 700, 0.05, 0.12); },
    swing:    () => { noise(0.14, 0.22, 2400, 500, 2); },                              // sword whoosh
    swingFist:() => { noise(0.11, 0.16, 900, 250, 1.5); },                             // duller fist whoosh
    hit:      () => { tone("triangle", 160, 55, 0.14, 0.35); noise(0.08, 0.2, 300, 120, 1, "lowpass"); },
    dodge:    () => { noise(0.16, 0.18, 700, 2600, 2); },                              // rising whoosh
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
    step:     (fast) => { noise(0.035, fast ? 0.09 : 0.06, 900, 300, 1, "lowpass"); },
    crackle:  () => { noise(0.09, 0.2, 2600, 700, 3); noise(0.06, 0.16, 1800, 500, 3, "bandpass", 0.05); },
    gameOver: () => {
      // slow minor descent
      tone("triangle", 440, 440, 0.55, 0.22);
      tone("triangle", 349.2, 349.2, 0.55, 0.22, 0.5);
      tone("triangle", 293.7, 293.7, 0.6, 0.22, 1.0);
      tone("triangle", 220, 218, 1.6, 0.24, 1.5);
      tone("sawtooth", 110, 108, 1.8, 0.12, 1.5);
    },
    fireLoop: (on) => {
      if (on && !fireNode) {
        const a = ctx(), t = a.currentTime;
        const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
        s.buffer = noiseBuf; s.loop = true;
        f.type = "lowpass"; f.frequency.value = 480; f.Q.value = 0.8;
        g.gain.value = 0.11;
        lfo.type = "sawtooth"; lfo.frequency.value = 9;   // flicker
        lg.gain.value = 0.05;
        lfo.connect(lg); lg.connect(g.gain);
        s.connect(f); f.connect(g); g.connect(master);
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
