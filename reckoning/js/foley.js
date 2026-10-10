// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// FOLEY: the sounds of work and of things, made as a sound-man would build them — an axe biting wood is a crack
// of the blow, the ring of the blade, the knock of the trunk's own wood and the crunch of torn fibre; a tree going
// over is its creak and the fibres snapping one by one, the last crack, the rush of the crown through the air and
// the crash. Each is worked out once in a few versions, so no two blows are quite alike, and played through the
// game's own effects bus (quietened with the rest under the pause menu). The first Forester's sound engine keeps
// its own blips for its own game; here they're replaced by these.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// ---- a few tools for working out a sound, sample by sample ----
class Biquad {
  // (the cookbook filters: "lp", "hp", "bp")
  constructor(type, f, q, sr) { this.set(type, f, q, sr); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q, sr) {
    const w = TAU * Math.min(f, sr * 0.45) / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
function finish(d, peak = 0.9) {
  let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
  const f = Math.min(d.length, 64); for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
  return d;
}
// a ringing body: a handful of decaying resonances, struck once
function modes(d, sr, at, list, gain = 1) {
  for (const [f, decay, amp, ph = Math.random() * TAU] of list) {
    const w = TAU * f / sr, k = Math.exp(-1 / (decay * sr));
    let e = amp * gain;
    for (let i = Math.floor(at * sr); i < d.length && e > 1e-4; i++) { d[i] += e * Math.sin(w * (i - at * sr) + ph); e *= k; }
  }
}
// a burst of filtered noise with its own swell and fall
function hiss(d, sr, at, dur, amp, filt, shape = t => Math.exp(-t / (dur * 0.3))) {
  const n = Math.floor(dur * sr), i0 = Math.floor(at * sr);
  for (let i = 0; i < n && i0 + i < d.length; i++) d[i0 + i] += filt.run(Math.random() * 2 - 1) * amp * shape(i / sr);
}
// tiny cracks and clicks, scattered: torn fibre, a twig, a crackle in the fire
function crackles(d, sr, at, dur, rate, amp, f0 = 1500, f1 = 6000) {
  let t = at;
  while ((t += -Math.log(1 - Math.random()) / rate) < at + dur) {
    const bp = new Biquad("bp", rand(f0, f1), rand(1.5, 4), sr), a = amp * rand(0.3, 1);
    hiss(d, sr, t, rand(0.004, 0.018), a, bp, x => Math.exp(-x / 0.003));
  }
}

// ---- the sounds, each a recipe, worked out in a few versions ----
const RECIPES = {
  // an axe into standing wood
  chop(sr) {
    const d = new Float32Array(Math.floor(sr * 0.45));
    hiss(d, sr, 0, 0.01, 0.9, new Biquad("hp", 900, 0.7, sr), x => Math.exp(-x / 0.0015));            // the blow
    const p = rand(0.88, 1.12);
    modes(d, sr, 0.001, [[170 * p, 0.09, 0.9], [395 * p, 0.06, 0.7], [740 * p, 0.04, 0.45], [1180 * p, 0.03, 0.3], [2050 * p, 0.018, 0.2]]);   // the trunk's wood
    modes(d, sr, 0.0, [[rand(2900, 3600), 0.12, 0.05], [rand(5200, 6100), 0.06, 0.03]]);                    // the blade's ring
    hiss(d, sr, 0.002, 0.06, 0.35, new Biquad("bp", rand(1400, 2400), 0.9, sr), x => Math.exp(-x / 0.02)); // the bite
    crackles(d, sr, 0.004, 0.05, 260, 0.25, 1800, 5000);                                                    // torn fibre
    return finish(d);
  },
  // a tree starting to go: the creak as it leans, fibres snapping faster, the last loud crack
  fellStart(sr) {
    const L = 2.2, d = new Float32Array(Math.floor(sr * L));
    // the creak: wood dragging on wood, stick and slip — a pulse train that wanders in pitch
    const bp = new Biquad("bp", 520, 3, sr), bp2 = new Biquad("bp", 1100, 4, sr);
    let ph = 0, f = rand(45, 70);
    for (let i = 0; i < Math.floor(1.75 * sr); i++) {
      const t = i / sr;
      f += (rand(40, 140) - f) * 0.0004 + (Math.random() - 0.5) * 0.6;
      ph += f / sr; const pulse = ph % 1 < 0.08 ? 1 : 0;
      const env = Math.min(1, t / 0.4) * (0.4 + 0.6 * Math.abs(Math.sin(t * 2.2 + 0.4))) * (t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.15));
      const s = (pulse - 0.08) * env;
      d[i] += bp.run(s) * 0.5 + bp2.run(s) * 0.25;
    }
    // fibres going, more and more of them
    for (let k = 0; k < 4; k++) crackles(d, sr, 0.3 + k * 0.32, 0.32, 6 + k * 10, 0.45 + k * 0.1, 900, 4500);
    // the last crack, and the trunk's knock under it
    const t0 = 1.68;
    hiss(d, sr, t0, 0.12, 1.4, new Biquad("hp", 500, 0.7, sr), x => Math.exp(-x / 0.02));
    modes(d, sr, t0, [[95, 0.25, 1.1], [190, 0.15, 0.6], [410, 0.08, 0.4]]);
    crackles(d, sr, t0 + 0.02, 0.35, 60, 0.4, 700, 3500);
    return finish(d);
  },
  // a tree (or anything great and heavy) hitting the ground: the thud, branches breaking, the crown's hiss
  crash(sr) {
    const L = 2.6, d = new Float32Array(Math.floor(sr * L));
    // the trunk's weight: a deep thump, its pitch falling
    let ph = 0;
    for (let i = 0; i < Math.floor(0.9 * sr); i++) { const t = i / sr; ph += TAU * (38 + 50 * Math.exp(-t / 0.05)) / sr; d[i] += Math.sin(ph) * Math.exp(-t / 0.28) * 1.2; }
    hiss(d, sr, 0, 0.7, 1.0, new Biquad("lp", 280, 0.8, sr), x => Math.exp(-x / 0.18));
    // branches snapping as the crown breaks on the ground
    crackles(d, sr, 0.0, 0.5, 90, 0.7, 700, 3500);
    crackles(d, sr, 0.25, 0.8, 30, 0.4, 900, 4500);
    // the needles and leaves, a long hiss settling
    hiss(d, sr, 0.02, 1.9, 0.35, new Biquad("bp", 3800, 0.6, sr), x => Math.min(1, x / 0.08) * Math.exp(-x / 0.55));
    return finish(d);
  },
  // something taken up: cloth or leather moving, a soft knock of it against you
  pickup(sr) {
    const d = new Float32Array(Math.floor(sr * 0.22));
    hiss(d, sr, 0, 0.16, 0.5, new Biquad("bp", rand(1800, 3200), 0.8, sr), x => Math.sin(Math.PI * Math.min(1, x / 0.16)) ** 2);
    modes(d, sr, rand(0.06, 0.11), [[rand(240, 340), 0.03, 0.35], [rand(700, 900), 0.015, 0.15]]);
    return finish(d, 0.7);
  },
  // something built, or set in place: two knocks of timber, and the hammer's tap to fix it
  build(sr) {
    const d = new Float32Array(Math.floor(sr * 0.7));
    for (const [t, p] of [[0, 1], [0.16, 1.18]]) {
      hiss(d, sr, t, 0.01, 0.5, new Biquad("lp", 2500, 0.7, sr), x => Math.exp(-x / 0.002));
      modes(d, sr, t, [[120 * p, 0.12, 1], [260 * p, 0.08, 0.6], [520 * p, 0.05, 0.3]]);
    }
    for (const t of [0.38, 0.5]) { modes(d, sr, t, [[rand(2400, 2800), 0.04, 0.25], [rand(4100, 4600), 0.02, 0.12], [300, 0.04, 0.4]]); hiss(d, sr, t, 0.006, 0.4, new Biquad("hp", 2000, 0.7, sr), x => Math.exp(-x / 0.001)); }
    return finish(d);
  },
  // a hammer on a nail in timber
  hammer(sr) {
    const d = new Float32Array(Math.floor(sr * 0.3));
    hiss(d, sr, 0, 0.008, 0.8, new Biquad("hp", 1500, 0.7, sr), x => Math.exp(-x / 0.0012));
    const p = rand(0.92, 1.08);
    modes(d, sr, 0, [[2650 * p, 0.05, 0.35], [4380 * p, 0.03, 0.2], [6100 * p, 0.015, 0.1]]);            // the nail's ring
    modes(d, sr, 0, [[240 * p, 0.07, 0.8], [560 * p, 0.045, 0.45], [980 * p, 0.03, 0.25]]);               // the beam it goes into
    return finish(d);
  },
  // coins: two or three, clinking together
  coin(sr) {
    const d = new Float32Array(Math.floor(sr * 0.6));
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const t = k * rand(0.05, 0.11), f = rand(2300, 3500);
      modes(d, sr, t, [[f, 0.22, 0.5], [f * 2.76, 0.12, 0.3], [f * 5.4, 0.06, 0.18], [f * 1.51, 0.15, 0.15]]);
      hiss(d, sr, t, 0.004, 0.25, new Biquad("hp", 4000, 0.7, sr), x => Math.exp(-x / 0.0008));
    }
    return finish(d, 0.6);
  },
  // a spade into earth: the scrape of the blade, the crunch of the soil, the thump of the foot driving it
  dig(sr) {
    const d = new Float32Array(Math.floor(sr * 0.5));
    hiss(d, sr, 0, 0.14, 0.45, new Biquad("bp", rand(2600, 4200), 1.2, sr), x => Math.min(1, x / 0.02) * Math.exp(-x / 0.06));
    crackles(d, sr, 0.03, 0.2, 220, 0.35, 600, 2500);
    hiss(d, sr, 0.04, 0.25, 0.6, new Biquad("lp", 500, 0.7, sr), x => Math.exp(-x / 0.06));
    modes(d, sr, 0.03, [[rand(85, 110), 0.08, 0.7]]);
    return finish(d);
  },
  // a saw through timber: the teeth rasping, rising and falling with the stroke
  saw(sr) {
    const L = 0.55, d = new Float32Array(Math.floor(sr * L)), bp = new Biquad("bp", rand(1800, 2600), 1.4, sr), bp2 = new Biquad("bp", rand(3800, 4600), 2, sr);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, k = Math.sin(Math.PI * t / L), rate = 70 + 90 * k;
      ph += rate / sr; const tooth = (ph % 1) < 0.15 ? Math.random() * 2 - 1 : (Math.random() * 2 - 1) * 0.15;
      d[i] = (bp.run(tooth) + bp2.run(tooth) * 0.5) * k ** 1.5;
    }
    return finish(d, 0.8);
  },
  // a fire burning: a light thing — the soft breath of the flames drawing, a faint hiss of sap, and over it the
  // crackle, many small dry ticks and now and then a snap; a knot pops once in a while. (It was a heavy roar once,
  // more furnace than campfire.) Made long enough to loop without being heard to.
  fire(sr) {
    const L = 8, n = Math.floor(sr * L), d = new Float32Array(n);
    const lp = new Biquad("lp", 560, 0.5, sr), hp = new Biquad("hp", 150, 0.5, sr), sap = new Biquad("hp", 4800, 0.7, sr); let flick = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      flick += (Math.random() - 0.5) * 0.002; flick *= 0.9995;
      d[i] += hp.run(lp.run(Math.random() * 2 - 1)) * Math.max(0.04, 0.17 + flick * 14 + 0.06 * Math.sin(t * TAU * 0.23) + 0.03 * Math.sin(t * TAU * 0.61));
      d[i] += sap.run(Math.random() * 2 - 1) * 0.014 * (1 + 0.6 * Math.sin(t * TAU * 0.37));
    }
    crackles(d, sr, 0, L, 17, 0.5, 2200, 8500);
    crackles(d, sr, 0, L, 2.5, 0.95, 900, 3200);
    let t = 0; while ((t += -Math.log(1 - Math.random()) / 0.35) < L - 0.1) modes(d, sr, t, [[rand(220, 460), 0.018, rand(0.12, 0.3)]]);
    // (the end folded into the start, so the loop has no seam)
    const xf = Math.floor(sr * 0.4); for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[n - xf + i] * (1 - k); }
    const out = d.subarray(0, n - xf);
    let m = 0; for (const v of out) m = Math.max(m, Math.abs(v)); for (let i = 0; i < out.length; i++) out[i] *= 0.9 / (m || 1);
    return out;
  },
};
const VARIANTS = { saw: 3, chop: 6, fellStart: 2, crash: 3, pickup: 5, build: 2, hammer: 5, coin: 4, dig: 4, fire: 1 };

// ---------------------------------------------------------------------------
const made = {};
function ac() { const a = window.__foresterAC; if (a && a.state === "suspended") a.resume(); return a || null; }
function bufs(name) {
  const a = ac(); if (!a) return null;
  if (made[name]) return made[name];
  const sr = a.sampleRate, list = [];
  for (let i = 0; i < VARIANTS[name]; i++) {
    const d = RECIPES[name](sr), b = a.createBuffer(1, d.length, sr); b.getChannelData(0).set(d); list.push(b);
  }
  return made[name] = list;
}
let lastIdx = {};
// a sound played: how loud, a little higher or lower each time, and from where (quieter far off, to one side,
// its top lost in the trees) — or right beside you
function play(name, { vol = 1, rate = [0.95, 1.05], at = null, reach = 50 } = {}) {
  const a = ac(), out = window.__foresterBus; if (!a || !out) return;
  const list = bufs(name); if (!list) return;
  let i = Math.floor(Math.random() * list.length); if (list.length > 1 && i === lastIdx[name]) i = (i + 1) % list.length; lastIdx[name] = i;
  const src = a.createBufferSource(); src.buffer = list[i]; src.playbackRate.value = rand(rate[0], rate[1]);
  const g = a.createGain(); g.gain.value = vol;
  src.connect(g);
  let last = g;
  const G = window.__G;
  if (at && G && G.player) {
    const p = G.player.pos, dx = at.x - p.x, dz = at.z - p.z, dist = Math.hypot(dx, dz);
    const k = Math.max(0, 1 - dist / reach) ** 1.5; if (k <= 0.005) return;
    g.gain.value = vol * k;
    const yaw = G.player.yaw, pan = a.createStereoPanner();
    pan.pan.value = Math.max(-0.85, Math.min(0.85, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / (dist || 1)));
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 12000 - Math.min(1, dist / reach) * 9500;
    g.connect(pan); pan.connect(lp); last = lp;
  }
  last.connect(out);
  src.start();
}
let fireSrc = null, FIRE_AT = null;
export const FOLEY = {
  play,
  chop: (at, vol = 0.8) => play("chop", { vol, at, rate: [0.9, 1.1] }),
  // the sound of other people at work, from where they are, timed to the blow in what they're doing
  work(actors) {
    const G = window.__G; if (!G || !G.player || !ac()) return;
    const p = G.player.pos;
    for (const a of actors) {
      const P = a.person; if (!P || !P.clipNow || !a.root.visible || a === G.player) continue;
      const dx = a.pos.x - p.x, dz = a.pos.z - p.z; if (dx * dx + dz * dz > 45 * 45) { a._wph = null; continue; }
      const clip = (P.clipNow() || "").toLowerCase(), ph = P.clipPhase(), prev = a._wph, prevClip = a._wclip;
      a._wph = ph; a._wclip = clip;
      if (prev == null || prevClip !== clip) continue;
      const crossed = x => prev <= ph ? prev < x && ph >= x : prev < x || ph >= x;
      const at = { x: a.pos.x, z: a.pos.z };
      if (clip === "chop" && crossed(0.5)) play("chop", { vol: 0.7, at, rate: [0.9, 1.1] });
      else if (clip === "hammer" && crossed(0.6)) play("hammer", { vol: 0.6, at, rate: [0.92, 1.1] });
      else if (clip === "dig" && crossed(0.32)) play("dig", { vol: 0.55, at });
      else if (clip === "saw" && (crossed(0.02) || crossed(0.52))) play("saw", { vol: 0.45, at, rate: [0.9, 1.1] });
    }
  },
  fellStart: (at, vol = 1) => play("fellStart", { vol, at, reach: 60, rate: [0.92, 1.06] }),
  crash: (vol = 1, at = null) => play("crash", { vol, at, reach: 70, rate: [0.85, 1.05] }),
  fire(on) {
    const a = ac(), out = window.__foresterBus; if (!a || !out) return;
    if (on && !fireSrc) {
      const s = a.createBufferSource(); s.buffer = bufs("fire")[0]; s.loop = true;
      const g = a.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(out); s.start(); fireSrc = { s, g };
      // (the fire is where it is: loud beside it, a murmur across the clearing, gone further off)
      const near = () => {
        const G = window.__G, f = fireSrc && fireSrc.g === g; if (!f) return;
        let k = 1;
        if (FIRE_AT && G && G.player && !G.player.seated) { const dd = Math.hypot(G.player.pos.x - FIRE_AT.x, G.player.pos.z - FIRE_AT.z); k = Math.max(0, Math.min(1, 1 - (dd - 3) / 40)) ** 1.4; }
        g.gain.setTargetAtTime(0.22 * k, a.currentTime, 0.4);
        setTimeout(near, 300);
      };
      if (!FIRE_AT) import("./woods.js").then(m => { FIRE_AT = m.FIRE || null; }).catch(() => {});
      near();
    } else if (!on && fireSrc) {
      const f = fireSrc; fireSrc = null; f.g.gain.cancelScheduledValues(a.currentTime); f.g.gain.setTargetAtTime(0, a.currentTime, 0.3); setTimeout(() => { try { f.s.stop(); } catch (e) {} }, 2000);
    }
  },
  // the first Forester's blips, swapped for these (in this game only)
  install(S) {
    if (!S || S.__foley) return; S.__foley = true;
    S.chop = () => play("chop", { vol: 0.75, rate: [0.9, 1.1] });
    S.treeFall = (v = 1) => play("crash", { vol: 0.9 * Math.min(1.2, v || 1), rate: v < 0.6 ? [1.1, 1.3] : [0.85, 1.05] });
    S.pickup = () => play("pickup", { vol: 0.32, rate: [0.9, 1.15] });
    S.build = () => play("build", { vol: 0.7 });
    S.hammer = () => play("hammer", { vol: 0.55, rate: [0.92, 1.08] });
    S.coin = () => play("coin", { vol: 0.38 });
    S.dig = () => play("dig", { vol: 0.62 });
    const fireOld = S.fireLoop;
    S.fireLoop = on => { if ((window.FSET || {}).ambient === false) on = false; FOLEY.fire(on); if (fireOld && !on) try { fireOld(false); } catch (e) {} };
  },
  // (worked out ahead, a little at a time, so the first blow of an axe isn't late)
  warm() { const names = Object.keys(RECIPES); let i = 0; const step = () => { if (!ac()) return setTimeout(step, 2000); if (i < names.length) { bufs(names[i++]); setTimeout(step, 50); } }; step(); },
};
window.__foley = FOLEY;
export { RECIPES };
