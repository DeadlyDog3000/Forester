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
      // handles for measuring the mix from the console: the bus carries every
      // game sound BEFORE the master gain, so it can be metered while muted
      window.__foresterAC = ac; window.__foresterMaster = master;
      window.__foresterNoise = noiseBuf; window.__foresterBus = sfxBus;
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

  let windNode = null, bugNode = null;
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
        windNode = { srcs, lfo, g, f };   // the filter is kept so winter can weigh it down
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
    // Black powder at close quarters: the flint, the crack that hurts, the boom
    // that follows it into your chest, and the report coming back off the trees.
    musket:   () => {
      if (FSET().sfx === false) return;
      const a = ctx(), t = a.currentTime;
      // a touch of saturation so the crack has teeth instead of politely fading
      const shaper = a.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 512) - 1;
        curve[i] = Math.tanh(x * 3.2);
      }
      shaper.curve = curve;
      shaper.oversample = "2x";
      const out = a.createGain();
      out.gain.value = 0.72;        // saturated hot, then trimmed: loud, never crackling
      shaper.connect(out); out.connect(sfxBus);
      const burst = (dur, vol, f0, f1, q, type, delay) => {
        const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        s.buffer = noiseBuf; s.loop = true;
        f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t + delay);
        f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
        g.gain.setValueAtTime(vol, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
        s.connect(f); f.connect(g); g.connect(shaper);
        s.start(t + delay); s.stop(t + delay + dur + 0.02);
      };
      burst(0.012, 1.0, 7000, 4000, 0.6, "highpass", 0);      // the flint and the pan
      burst(0.07, 1.15, 4200, 1100, 0.7, "bandpass", 0.004);  // the crack itself
      burst(0.5, 0.95, 1400, 70, 0.9, "lowpass", 0.008);      // the powder's roar
      // the low punch you feel rather than hear
      const o = a.createOscillator(), og = a.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(210, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.34);
      og.gain.setValueAtTime(0.75, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      o.connect(og); og.connect(shaper);
      o.start(t); o.stop(t + 0.4);
      // and the report rolling back out of the woods, twice
      burst(0.3, 0.3, 1500, 200, 0.8, "lowpass", 0.11);
      burst(0.55, 0.16, 900, 90, 0.7, "lowpass", 0.27);
    },
    ramrod:   () => { tone("square", 420, 300, 0.05, 0.08); noise(0.07, 0.1, 2200, 800, 2, "bandpass", 0.05); },
    // ===== loading a musket, in the order a man actually does it =====
    // The cartridge torn open in the teeth, then the charge tipped down the barrel:
    // a papery rip and a dry granular hiss, both quiet — this is work, not spectacle.
    powder:   () => {
      noise(0.09, 0.075, 3400, 1500, 1.1, "bandpass");            // the paper torn
      noise(0.17, 0.045, 5200, 2600, 0.7, "highpass", 0.10);      // grains down the muzzle
      tone("triangle", 300, 210, 0.05, 0.035, 0.24);              // the flask knocked shut
    },
    // The ball and wad seated, then the rod drawn and driven home twice — the
    // scrape of steel in a steel barrel, ringing a little at the bottom.
    seat:     () => {
      noise(0.05, 0.06, 1800, 900, 1.6, "bandpass");              // the wad thumbed in
      tone("square", 240, 190, 0.045, 0.05, 0.05);
    },
    // The lock drawn back to full cock: two hard mechanical clicks, and done.
    cock:     () => {
      tone("square", 900, 620, 0.028, 0.075);
      noise(0.03, 0.07, 4200, 2200, 3, "bandpass", 0.005);
      tone("square", 1050, 700, 0.03, 0.085, 0.10);
      noise(0.032, 0.08, 4800, 2400, 3, "bandpass", 0.105);
    },
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

    // ===== the voices of the woods =====
    // Wind was the only thing you could hear standing in a forest, and only when
    // the camera was high enough to be looking at the whole valley. Down among
    // the cabins it was silent — no birds by day, nothing at night, nothing to
    // tell you it was winter but the colour of the ground. These are the sounds
    // that fill that silence, and they answer to the season and the hour.

    // A rook, harsh and unmusical: bandpassed noise, two or three caws.
    crow: () => {
      if (FSET().ambient === false) return;
      const a = ctx(), t0 = a.currentTime;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * (0.22 + Math.random() * 0.12);
        const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        s.buffer = noiseBuf; s.playbackRate.value = 0.7 + Math.random() * 0.3;
        f.type = "bandpass"; f.frequency.setValueAtTime(1500 + Math.random() * 400, t);
        f.frequency.exponentialRampToValueAtTime(700, t + 0.16); f.Q.value = 5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
        s.connect(f); f.connect(g); g.connect(sfxBus);
        s.start(t, Math.random()); s.stop(t + 0.22);
      }
    },
    // Two low hoots, a pause, and one more. Sine with a slow vibrato.
    owl: () => {
      if (FSET().ambient === false) return;
      const a = ctx(), t0 = a.currentTime;
      const hoot = (t, f, dur, vol) => {
        const o = a.createOscillator(), g = a.createGain(), vib = a.createOscillator(), vg = a.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.94, t + dur);
        vib.type = "sine"; vib.frequency.value = 11; vg.gain.value = f * 0.012;
        vib.connect(vg); vg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
      };
      hoot(t0, 392, 0.34, 0.055);
      hoot(t0 + 0.46, 349, 0.30, 0.05);
      hoot(t0 + 1.25, 330, 0.42, 0.04);
    },
    // Frost in a trunk: a dry crack and the low thump that follows it.
    timberCrack: () => {
      if (FSET().ambient === false) return;
      noise(0.05, 0.10, 2600, 900, 3);
      tone("triangle", 90, 52, 0.30, 0.06, 0.03);
    },
    // A bell over the trees: bells are inharmonic, so the partials are not
    // multiples — that ratio set is what stops it sounding like an organ.
    bell: (strikes = 1) => {
      if (FSET().ambient === false) return;
      const a = ctx(), t0 = a.currentTime;
      const PARTIALS = [[1, 0.16], [2.0, 0.10], [2.42, 0.07], [3.0, 0.05], [4.5, 0.03]];
      for (let s = 0; s < strikes; s++) {
        const t = t0 + s * 2.4, f0 = 262;
        for (const [mul, vol] of PARTIALS) {
          const o = a.createOscillator(), g = a.createGain();
          o.type = "sine"; o.frequency.value = f0 * mul * (1 + (Math.random() - 0.5) * 0.004);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6 / Math.sqrt(mul));
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 2.8);
        }
      }
    },
    // A summer night's insects: a high band of noise, breathing.
    insectLoop: (on) => {
      if (FSET().ambient === false) on = false;
      if (on && !bugNode) {
        const a = ctx(), t = a.currentTime;
        const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        const lfo = a.createOscillator(), lg = a.createGain();
        s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 1.4;
        f.type = "bandpass"; f.frequency.value = 4600; f.Q.value = 9;
        g.gain.value = 0.0001;
        g.gain.setTargetAtTime(0.022, t, 1.4);
        lfo.type = "sine"; lfo.frequency.value = 6.4;      // the chorus pulses
        lg.gain.value = 0.012;
        lfo.connect(lg); lg.connect(g.gain);
        s.connect(f); f.connect(g); g.connect(sfxBus);
        s.start(t, Math.random() * 1.5); lfo.start(t);
        bugNode = { s, lfo, g };
      } else if (!on && bugNode) {
        const a = ctx(), t = a.currentTime;
        bugNode.g.gain.setTargetAtTime(0.0001, t, 0.9);
        const bn = bugNode; bugNode = null;
        setTimeout(() => { try { bn.s.stop(); bn.lfo.stop(); } catch (e) {} }, 2600);
      }
    },
    // The wind is always there; only its weight changes. Winter is lower and
    // heavier, night is gustier, and standing high above it you hear more of it.
    // Winter wind is meant to be HEAVIER, and measuring it said the opposite: a
    // bandpass passes energy in proportion to its bandwidth, and bandwidth is
    // centre over Q — so dropping the centre from 620 to 340 halved the noise
    // getting through and swallowed the gain increase whole. The cold filter is
    // opened up as it is lowered, so the weight goes where it was aimed.
    windWeight: (w, cold) => {
      if (!windNode) return;
      const a = ctx(), t = a.currentTime;
      windNode.g.gain.setTargetAtTime(Math.max(0.0001, w), t, 1.2);
      if (windNode.f) {
        windNode.f.frequency.setTargetAtTime(cold ? 360 : 620, t, 1.5);
        windNode.f.Q.setTargetAtTime(cold ? 0.24 : 0.5, t, 1.5);
      }
    },
  };
})();

// every UI button clicks
document.addEventListener("click", e => {
  if (e.target.closest && e.target.closest(".btn")) SFX.click();
}, true);

// ===== AMBIENCE — the sound of standing where you are standing =====
// The game knows the season, the hour, whether the woods are on fire and whether
// plague is in the streets. All of that was on screen and none of it was audible.
// This is one bed that answers to it: wind under everything, birds in a summer
// day, insects on a summer night, an owl, crows when the sickness is about, and
// in winter nothing alive at all — only the wind gone heavy and the frost
// cracking a trunk somewhere out in the dark.
//
// It is still synthesis. If recorded loops are ever dropped in, this is the shape
// they slot into: one update() a frame, told what the world is doing.
const AMBIENCE = (() => {
  let t = 0, nextBird = 4, nextOwl = 30, nextCrack = 25, nextCrow = 40, lastBellHour = -1;
  return {
    update(dt, w) {
      if (!w || !w.playing) { SFX.windLoop(false); SFX.insectLoop(false); return; }
      t += dt;
      const winter = w.season === "winter", night = w.night > 0.55;
      // wind: always there, heavier in winter, and stronger the higher you stand
      SFX.windLoop(true);
      SFX.windWeight(winter ? 0.10 : 0.03 + (w.high ? 0.02 : 0), winter);
      // a summer night has a chorus in it; a winter one has nothing
      SFX.insectLoop(!winter && night);

      if (!winter && !night && (nextBird -= dt) <= 0) {
        nextBird = 5 + Math.random() * 11;
        SFX.bird();
      }
      if (!winter && night && (nextOwl -= dt) <= 0) {
        nextOwl = 34 + Math.random() * 50;
        SFX.owl();
      }
      if (winter && (nextCrack -= dt) <= 0) {
        nextCrack = 26 + Math.random() * 44;
        SFX.timberCrack();
      }
      // rooks gather where there is dying — the sickness, or a burning roof
      if ((w.plague || w.fire) && (nextCrow -= dt) <= 0) {
        nextCrow = 18 + Math.random() * 26;
        SFX.crow();
      }
      // the bell marks the two hours that matter: first light and the sun going down
      const h = Math.floor(w.hour);
      if (h !== lastBellHour) {
        if (lastBellHour !== -1 && (h === 5 || h === 18)) SFX.bell(h === 18 ? 2 : 1);
        lastBellHour = h;
      }
    },
    silence() { SFX.windLoop(false); SFX.insectLoop(false); },
  };
})();

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
    // ===== The British Grenadiers =====
    // The one real tune here, and the only thing in the game not written for it.
    // Traditional English, in print by the middle of the eighteenth century and
    // long out of copyright. Transcribed from the ABC in Paul Hardy's Session
    // Tunebook (Creative Commons, www.paulhardy.net): G major, four-four, played
    // here as two eight-bar strains — "Some talk of Alexander" and the chorus —
    // and converted from quarter-notes into this engine's eighth-note steps.
    // The anacrusis rides in the tail of the closing bar, so the loop comes back
    // round onto its own pickup without a seam.
    british: {
      name: "The British Grenadiers", bpm: 116, hold: true,
      lead: [
        // Some talk of Alexander, and some of Hercules
        67,0, 62,0, 67,0, 69,0,      71,0,0,0, 69,0, 71,72,
        74,0, 67,0, 71,69, 67,66,    67,0,0,0,0,0, 62,0,
        // Of Hector and Lysander, and such great names as these
        67,0, 62,0, 67,0, 69,0,      71,0,0,0, 69,0, 71,72,
        74,0, 67,0, 71,69, 67,66,    67,0,0,0,0,0, 71,72,
        // But of all the world's brave heroes there's none that can compare
        74,0,0,76, 74,0, 72,0,       71,0, 72,0, 74,0, 74,0,
        76,0, 76,0, 74,72, 71,69,    67,0,0,0, 66,0, 62,62,
        // With a tow, row, row, row, row, row, to the British Grenadiers
        67,0, 66,67, 69,0, 67,69,    71,0, 69,71, 72,0, 71,72,
        74,0, 67,0, 71,69, 67,66,    67,0,0,0,0,0, 62,0,
      ],
      bass: [
        43,0,0,0, 50,0,0,0,   43,0,0,0, 50,0,0,0,
        43,0,0,0, 50,0,0,0,   43,0,0,0, 43,0,50,0,
        43,0,0,0, 50,0,0,0,   43,0,0,0, 50,0,0,0,
        43,0,0,0, 50,0,0,0,   43,0,0,0, 43,0,50,0,
        43,0,0,0, 50,0,0,0,   43,0,0,0, 50,0,0,0,
        48,0,0,0, 45,0,0,0,   43,0,0,0, 50,0,0,0,
        43,0,0,0, 50,0,0,0,   43,0,0,0, 48,0,0,0,
        43,0,0,0, 50,0,0,0,   43,0,0,0, 43,0,50,0,
      ],
      snare: [
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,0,1,0,
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,0,1,0,
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,0,1,0,
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,0,1,0,
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,0,1,0,
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,0,1,0,
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,0,1,0,
        2,0,1,1, 2,0,1,0,   2,0,1,1, 2,1,1,1,
      ],
    },
  };
  let mWanted = false, mNext = 0, mTimer = null, mGain = null, mTune = "grenadier";

  // A phrase was assumed to be thirty-two eighth-notes because all three tunes
  // were. A real march is longer than that, so the loop follows the tune.
  function marchLoop(a, t0, tune) {
    const step = 60 / tune.bpm / 2, len = tune.lead.length;
    for (let i = 0; i < len; i++) {
      const t = t0 + i * step;
      if (tune.lead[i]) {                                   // fifes, doubled an octave up
        // How long the note may ring. In a tune marked `hold`, the zeros after
        // a note sustain it instead of cutting it off — without that a dotted
        // half note sounds like a quaver followed by a second of silence. The
        // older tunes are all short notes, so they keep the flat 1.7 steps.
        let ring = step * 1.7;
        if (tune.hold) {
          let n = 1;
          while (i + n < len && !tune.lead[i + n]) n++;
          ring = step * (n - 0.1);
        }
        for (const [mul, vol, type] of [[1, 0.075, "square"], [2, 0.032, "triangle"]]) {
          const o = a.createOscillator(), g = a.createGain();
          o.type = type; o.frequency.setValueAtTime(N(tune.lead[i]) * mul, t);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
          o.connect(g); g.connect(mGain); o.start(t); o.stop(t + ring * 1.12);
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
      // the side drum: crack of the head plus the knock of the shell, so it
      // reads as a field drum and not as hiss
      const rap = (tt, vol, hp) => {
        const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        s.buffer = window.__foresterNoise; s.loop = true;
        f.type = "highpass"; f.frequency.value = hp;
        g.gain.setValueAtTime(vol, tt);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09);
        s.connect(f); f.connect(g); g.connect(mGain);
        s.start(tt); s.stop(tt + 0.12);
        const k = a.createBufferSource(), kf = a.createBiquadFilter(), kg = a.createGain();
        k.buffer = window.__foresterNoise; k.loop = true;
        kf.type = "bandpass"; kf.frequency.value = 330; kf.Q.value = 1.6;
        kg.gain.setValueAtTime(vol * 0.8, tt);
        kg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.07);
        k.connect(kf); kf.connect(kg); kg.connect(mGain);
        k.start(tt); k.stop(tt + 0.1);
      };
      if (tune.snare[i]) {
        const hard = tune.snare[i] === 2;
        if (hard) { rap(t - 0.052, 0.024, 2400); rap(t - 0.026, 0.034, 2400); }   // the ruff rolling into the beat
        rap(t, hard ? 0.10 : 0.045, hard ? 1700 : 2500);
      }
      if (i % 4 === 0) {                                    // the regiment's great drum
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(88, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i % 8 === 0 ? 0.24 : 0.15, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(g); g.connect(mGain); o.start(t); o.stop(t + 0.27);
      }
      if (i % 8 === 6) {                                    // the war-tom answering off the beat
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(96, t + 0.08);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.11, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(mGain); o.start(t); o.stop(t + 0.19);
      }
    }
    return t0 + len * step;
  }
  function marchPump() {
    if (!mWanted) return;
    const a = window.__foresterAC;
    if (!a || a.state !== "running") { mTimer = setTimeout(marchPump, 300); return; }
    // The music deliberately skips sfxBus, so it needs its own handle if the
    // march is ever to be metered with the master silenced.
    if (!mGain) { mGain = a.createGain(); mGain.gain.value = 1; mGain.connect(window.__foresterMaster); window.__foresterMusic = mGain; }
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
