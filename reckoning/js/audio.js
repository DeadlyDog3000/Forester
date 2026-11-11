// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The first Forester's sound engine (../sfx.js) makes the axes, the birds and
// the footsteps. This adds what a city has and a clearing does not: bells
// that can grow faint, a crowd, a drum, a door being beaten at midnight — and
// music that is a mood rather than a march. Still no audio files.

/* global SFX */
import { createRecorded } from "./recorded.js";
let RECORDED = null;

let ac = null, bus = null, musicBus = null, noise = null;
// ---- the budget: how much is sounding at once ----
// Every sound here is made as it plays — a man's cry alone is a couple of dozen nodes — and the audio thread can only
// render so many at a time: in a charge, with men dying all round and every musket going, it fell behind and the sound
// stuttered and cut out. So every source started anywhere is counted while it plays, and past a point the quieter and
// further things (a cry across the field, a far shot's echo) are left out — the near ones never. The audio clock is
// watched too: if it ever falls behind real time, the point comes down until it keeps up again.
let liveSrc = 0, pressure = 1, skipped = 0, liveCries = 0;
// (for measuring from the console: how many sources are playing, how far the budget has been brought down, how many left out)
window.__audioLoad = () => ({ live: liveSrc, pressure: +pressure.toFixed(2), skipped, voices: Object.values(VBUF).reduce((n, l) => n + l.length, 0) });
function budget(a) {
  if (a.__budget) return; a.__budget = true;
  const P = window.AudioScheduledSourceNode && AudioScheduledSourceNode.prototype; if (!P) return;
  const st = P.start;
  // (and a sound done is let go of at once: its source cut loose from the filters and gains it played through, so they
  //  fall silent and stop being worked — left connected, a battle's thousand finished shots and cries were all still
  //  being worked out every few milliseconds until the garbage was next taken out, and that's what cut the sound out)
  // (and never counted for more than ten seconds, whatever it is: a sound that loops on, or one that for any reason never
  //  says it's done, would otherwise hold its place for good — enough of them, and the budget stayed full for the rest of
  //  the game, the muskets left out with nothing playing)
  const free = s => { if (s.__live) { s.__live = false; liveSrc--; } };
  P.start = function (...x) { const r = st.apply(this, x); liveSrc++; this.__live = true; this.addEventListener("ended", () => { free(this); try { this.disconnect(); } catch (e) {} }, { once: true }); setTimeout(() => free(this), 10000); return r; };
  // (behind: where the browser can tell, the sound having run dry — a gap heard; where it can't, the audio clock slipping
  //  well behind real time two seconds running. It used to go by the clock alone, read every half second: the clock only
  //  moves in steps of the audio's own blocks and the timer is late whenever a frame is long, so it often read eight or
  //  ten per cent slow when nothing was wrong — each time the budget was cut, and it came back slowly, so in a long
  //  battle it sank to a fifth and most of the field's sound was being left out: the sound "cutting out")
  let ct = a.currentTime, wt = performance.now(), u0 = -1, slowN = 0;
  const dry = () => { try { const p = a.playbackStats; return p ? p.underrunEvents : -1; } catch (e) { return -1; } };
  setInterval(() => {
    const w = performance.now(), r = (a.currentTime - ct) / Math.max(0.001, (w - wt) / 1000); ct = a.currentTime; wt = w;
    if (a.state !== "running" || document.hidden) { slowN = 0; return; }
    const u = dry(), gaps = u0 >= 0 && u >= 0 ? u - u0 : 0; u0 = u;
    // (the clock watched whether or not the browser reports gaps: its count of them was seen to stop moving while the
    //  sound was plainly falling behind, a second's audio made every two)
    slowN = r < 0.85 ? slowN + 1 : 0;
    pressure = gaps > 0 || slowN >= 2 || r < 0.7 ? Math.max(0.35, pressure * 0.7) : Math.min(1, pressure + 0.15);
  }, 1000);
}
// a sound's own way to the speakers let go of once it's done with: the last of its nodes unplugged from the bus, so
// it and everything before it stop being worked on and are thrown away. (They were left plugged in: every shot, cry and
// footfall of a battle kept its little chain of gains, filters and panners connected for good, and the audio thread
// worked through every one of them, every few milliseconds — thousands by the middle of a great battle, until it fell
// behind and the sound cut out.)
function lease(node, secs) { setTimeout(() => { try { node.disconnect(); } catch (e) {} }, secs * 1000 + 250); }
// room for one more of this importance (0 a faint far thing .. 1 right by you)
// (what's right by you — your own shot, the man you're fighting — always: only the further things are ever left out)
const room = imp => imp >= 0.85 || liveSrc < (44 + 120 * imp) * pressure || (skipped++, false);
// ---- the voices, recorded: men crying out in pain, dying, groaning, and the grunt of a blow — real cries, cut from
// recordings given to everyone (CC0; art/voice/CREDITS.md names each). Loaded once the sound starts; till then, and for
// a war cry, the voice below is made as before. Each played a little higher or lower, so a company's cries aren't one man's.
const VOICE_N = { pain: 17, death: 24, moan: 19, grunt: 32 }, VBUF = {}, VLAST = {};
// (left out: the cries cut from a recording of a man being beaten and impaled — the screams of torture, not of a field)
const VOICE_SKIP = { death: [0, 1, 2], pain: [0, 1, 2, 3] };
let vLoad = null;
function loadVoices(a) {
  if (vLoad) return; vLoad = true;
  for (const [k, n] of Object.entries(VOICE_N)) for (let i = 0; i < n; i++) if (!(VOICE_SKIP[k] || []).includes(i))
    fetch(new URL(`../art/voice/${k}_${String(i).padStart(2, "0")}.ogg`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => a.decodeAudioData(b)).then(b => (VBUF[k] ||= []).push(b)).catch(() => {});
}
// ---- the orders, shouted: an officer's or a sergeant's word of command at the top of his voice — "Make ready!",
// "Present!", "Fire!", "Charge!" — recorded, several voices of each; art/voice/orders.json says which there are (and
// till there are any, an order is given in silence) ----
const OBUF = {}, OLAST = {};
let oLoad = null;
function loadOrders(a) {
  if (oLoad) return; oLoad = true;
  fetch(new URL("../art/voice/orders.json", import.meta.url)).then(r => r.ok ? r.json() : Promise.reject()).then(N => {
    for (const [k, n] of Object.entries(N)) for (let i = 0; i < n; i++)
      fetch(new URL(`../art/voice/order_${k}_${String(i).padStart(2, "0")}.ogg`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(b => a.decodeAudioData(b)).then(b => (OBUF[k] ||= []).push(b)).catch(() => {});
  }).catch(() => {});
}
// ---- some of the field's sounds, recorded: a grenade bursting, blade on blade, a man's war cry as he goes in, and the
// musket, the pistol and the cannon heard from far off (close by, the made ones below: those are the better there);
// and the country's and the house's: owl, woodpecker, frog and duck, thunder near and far, the church bell, a knock,
// a door opening and shutting — art/sfx/<kind>_NN.ogg, art/sfx/sfx.json counting them (credits in
// art/sfx/CREDITS.md). Till they're loaded, or if they never are, the made ones are played as before (the war cry,
// which has no made one, is silent) ----
const SBUF = {}, SLAST = {};
let sLoad = null;
function loadSfx(a) {
  if (sLoad) return; sLoad = true;
  fetch(new URL("../art/sfx/sfx.json", import.meta.url)).then(r => r.ok ? r.json() : Promise.reject()).then(N => {
    for (const [k, n] of Object.entries(N)) for (let i = 0; i < n; i++)
      fetch(new URL(`../art/sfx/${k}_${String(i).padStart(2, "0")}.ogg`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(b => a.decodeAudioData(b)).then(b => (SBUF[k] ||= []).push(b)).catch(() => {});
  }).catch(() => {});
}
// ---- the band's instruments, recorded: a held note or two of each (art/sfx/<kind>_NN.ogg), and the pitch of each
// take, measured — each of the tune's notes played on the take nearest it, pitched to it ----
const NOTES = { fifeN: [363.31, 1685.68], trumpetN: [294.39, 328.95, 704.39], zurnaN: [284.51, 373.64, 422.23] }, NBUF = {};
// (how loud against the made ones, measured on a held note)
const NOTE_GAIN = { fifeN: 1.45, trumpetN: 1.86, zurnaN: 3.5 };
// (and the drums: a stroke of each recorded, against the made one)
const DRUM_GAIN = { snare: 0.86, bassDrum: 0.8 }, SHOUT_REC = 0.5, ROLL_REC = 0.35;
let nLoad = false;
function loadNotes(a) {
  if (nLoad) return; nLoad = true;
  for (const [k, F] of Object.entries(NOTES)) F.forEach((_, i) => fetch(new URL(`../art/sfx/${k}_${String(i).padStart(2, "0")}.ogg`, import.meta.url))
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => a.decodeAudioData(b)).then(b => { (NBUF[k] ||= [])[i] = b; }).catch(() => {}));
}
// a note of f Hz, L seconds long, into node at gain v from time t (not loaded: false, and the made one plays)
function sampledNote(a, kind, f, L, node, v, t) {
  const F = NOTES[kind], B = NBUF[kind]; if (!B || F.some((_, i) => !B[i])) return false;
  let i = 0; for (let j = 1; j < F.length; j++) if (Math.abs(Math.log2(f / F[j])) < Math.abs(Math.log2(f / F[i]))) i = j;
  const s = a.createBufferSource(), g = a.createGain(), per = 1 / F[i];
  s.buffer = B[i]; s.playbackRate.value = f / F[i];
  // (held longer than the take: round and round a stretch of its steady middle, cut at a whole number of its own waves
  //  — on whole samples of the buffer, or the wrap ticks)
  const sr = B[i].sampleRate, ls = Math.round(0.55 / per) * per, le = ls + Math.round(0.6 / per) * per;
  s.loop = true; s.loopStart = Math.round(ls * sr) / sr; s.loopEnd = Math.round(le * sr) / sr;
  v *= NOTE_GAIN[kind];
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.setValueAtTime(v, t + Math.max(0.02, L - 0.035)); g.gain.linearRampToValueAtTime(0, t + L);
  s.connect(g); g.connect(node); s.start(t); s.stop(t + L + 0.05); lease(g, L + 0.5);
  return true;
}
// ---- the words as they're written out: a grain of a quill's scratch on paper for each letter (art/foley/quill_*.ogg,
// the stretches of it where the nib is on the paper) ----
const QUILL = [], LETTER_REC = 0.043; let qLoad = false;
function loadQuill(a) {
  if (qLoad) return; qLoad = true;
  for (let i = 0; i < 3; i++) fetch(new URL(`../art/foley/quill_0${i}.ogg`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => a.decodeAudioData(b)).then(b => {
    const d = b.getChannelData(0), w = Math.floor(0.04 * b.sampleRate), e = [];
    for (let j = 0; j + w < d.length; j += w >> 1) { let q = 0; for (let k = j; k < j + w; k += 4) q += d[k] * d[k]; e.push([j / b.sampleRate, q]); }
    const top = Math.max(...e.map(x => x[1])); for (const [t, q] of e) if (q > top * 0.16) QUILL.push([b, t]);
  }).catch(() => {});
}
// ---- and the steady ones, recorded to loop: rain light and heavy and on a roof, a brook, wind, a town's crowd, a
// battle's roar (art/sfx/loop_<kind>.ogg, their ends folded into their beginnings). Till they're loaded the made ones ----
// (how loud each, against the made one it stands for: measured, so a recording comes in no louder or softer)
// (the heart, a breath — a man's, a woman's — and the melee's: a musket stock knocked aside, blade on blade, a blow home, men running)
const CREAK_REC = 0.035, RAM_REC = 0.08, HANDBELL_REC = 0.81, HEART_REC = 0.56, BREATH_REC = [0.08, 0.12], PARRY_REC = 0.18, CLANG_MELEE = 0.17, BLOW_MELEE = 0.15, RUN_REC = 0.7;
const KITCHEN_REC = { knife: 0.22, stir: 0.11, toss: 0.036, plate: 0.19, sizzle: 5.3, bubble: 3 }, HARBOUR_REC = 4.5, MURMUR_REC = 0.84, BROOK_REC = 2.2, WIND_REC = 2.0, ROAR_REC = 0.93, RAIN_REC = { light: 0.95, heavy: 0.33, roof: 0.17 };
// (each ground's footfalls, and how loud against the made ones)
const STEP_REC = { grass: ["stGrass", 0.045], leaves: ["stLeaves", 0.038], dirt: ["stDirt", 0.029], stone: ["stStone", 0.031], wood: ["stWood", 0.019], snow: ["stSnow", 0.03], water: ["stWater", 0.043], marsh: ["stMarsh", 0.062] };
const LOOPS = ["rainLight", "rainHeavy", "rainRoof", "brook", "wind", "murmur", "roar", "harbour", "sizzle", "bubble", "runCrowd"], LBUF = {};
function loadLoops(a) {
  for (const k of LOOPS) fetch(new URL(`../art/sfx/loop_${k}.ogg`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
    .then(b => a.decodeAudioData(b)).then(b => { LBUF[k] = b; }).catch(() => {});
}
// one of them going round into node, from somewhere in it, at gain v: { s, g } (not loaded: null)
function bed(a, kind, node, v = 1) {
  const b = LBUF[kind]; if (!b) return null;
  const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; s.loop = true; g.gain.value = v;
  s.connect(g); g.connect(node); s.start(a.currentTime, Math.random() * b.duration);
  return { s, g };
}
// one of a kind's recordings into node at time t (none: false — the made one is played instead)
function recorded(a, kind, nodes, t, rate = [0.94, 1.06]) {
  const list = SBUF[kind]; if (!list || list.length < 2) return false;
  let i = Math.floor(Math.random() * list.length); if (i === SLAST[kind]) i = (i + 1) % list.length; SLAST[kind] = i;
  const s = a.createBufferSource(); s.buffer = list[i]; s.playbackRate.value = rnd(rate[0], rate[1]);
  for (const [node, g] of nodes) { const gg = a.createGain(); gg.gain.value = g; s.connect(gg); gg.connect(node); lease(gg, list[i].duration + 1); }
  s.start(t); return true;
}
// (which of them for each cry: a scream of fear is a dying man's, cut short; a sob, a short moan)
const VOICE_OF = { pain: "pain", death: "death", fear: "death", moan: "moan", sob: "moan", grunt: "grunt" };
// (the cries kept under the field's other sound, not over it: a man's cry carries, but it isn't a shriek in your ear)
const VOICE_LEVEL = { pain: 1.0, death: 0.9, fear: 0.85, moan: 1.0, sob: 0.8, grunt: 1.0 };
function recordedVoice(a, kind, high, node, k, vol, t) {
  const pool = VOICE_OF[kind], list = pool && VBUF[pool]; if (!list || list.length < 3) return false;
  let i = Math.floor(Math.random() * list.length); if (i === VLAST[pool]) i = (i + 1) % list.length; VLAST[pool] = i;
  const s = a.createBufferSource(), g = a.createGain(), b = list[i];
  s.buffer = b;
  // (a woman's or a boy's cry: the same cry, higher — and each man's own a little higher or lower)
  s.playbackRate.value = (high ? rnd(1.22, 1.32) : rnd(0.9, 1.07)) * (kind === "fear" ? 1.05 : 1);
  const v = VOICE_LEVEL[kind] * vol * k;
  g.gain.setValueAtTime(v, t);
  // (a cry of fear, or a sob, is the first of the recording, let go of early)
  const len = b.duration / s.playbackRate.value, cut = kind === "fear" ? Math.min(len, rnd(0.8, 1.3)) : kind === "sob" ? Math.min(len, rnd(0.45, 0.7)) : kind === "death" ? Math.min(len, rnd(1.0, 1.6)) : len;
  if (cut < len) { g.gain.setValueAtTime(v, t + cut - 0.12); g.gain.linearRampToValueAtTime(0.0001, t + cut); }
  s.connect(g); g.connect(node); s.start(t); s.stop(t + cut + 0.02);
  return cut;
}
// (for the screens' own sounds, uisfx.js: one of a kind's recordings into its node at t — false till they're loaded)
window.__sfxRec = (kind, node, g, t, rate) => { const a = ctx(); return !!a && recorded(a, kind, [[node, g]], t ?? a.currentTime, rate); };
function ctx() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return ac; }
  try { SFX.setMaster(SFX._vol ?? 0.6); } catch (e) {}
  ac = window.__foresterAC;
  if (!ac) return null;
  budget(ac); loadVoices(ac); loadOrders(ac); loadSfx(ac); loadLoops(ac); loadNotes(ac); loadQuill(ac);
  bus = ac.createGain(); bus.gain.value = 1;
  // (and a limiter on it, as the first Forester's sounds have: a battle's cries and shots, all of them heard now, summed
  //  past full scale and broke up; caught and rounded over instead — nothing alone comes near it)
  const lim = ac.createDynamicsCompressor(); lim.threshold.value = -9; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.2;
  const rnd2 = ac.createWaveShaper(), cv = new Float32Array(2048); for (let i = 0; i < 2048; i++) cv[i] = Math.tanh((i / 1024 - 1) * 1.3); rnd2.curve = cv; rnd2.oversample = "2x";
  bus.connect(lim); lim.connect(rnd2); rnd2.connect(window.__foresterMaster);
  // (the menus' own clicks on a way of their own, so the field can be hushed without them)
  if (!window.__foresterUiBus) { const u = ac.createGain(); u.gain.value = 1; u.connect(window.__foresterMaster); window.__foresterUiBus = u; }
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

// ---- the sound of a shot, out of doors ----
// how far off it is; where it goes: straight to you (dry, duller the further), and into the country round about and
// back (wet: a long outdoor echo, more of the whole the further off)
function shotDistance(at) { const GG = window.__G; return at && GG && GG.player ? Math.hypot(at.x - GG.player.pos.x, at.z - GG.player.pos.z) : 0; }
// (shots go through the game's limiter and soft clipper, so a cannon can be as loud as a cannon and round over
//  rather than clip square; and so the clearing's own room is round them too)
const shotBus = () => window.__foresterBus || bus;
let _outdoor = null;
function outdoor(a) {
  if (_outdoor && _outdoor.context === a) return _outdoor;
  // (the echo: a few hard reflections off the near trees and banks, then the long tail off everything further)
  const sr = a.sampleRate, n = Math.floor(sr * 3.4), buf = a.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) { const x = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-x * 1.7) * (x < 0.03 ? x / 0.03 : 1) * 0.5; }
    for (const [x, k] of [[0.07, 0.6], [0.13, 0.45], [0.21, 0.4], [0.34, 0.3], [0.52, 0.22]]) { const at = Math.floor((x + (c ? 0.011 : 0)) * sr); for (let i = 0; i < 300; i++) d[at + i] += (Math.random() * 2 - 1) * k * Math.exp(-i / 90); }
  }
  const cv = a.createConvolver(); cv.buffer = buf;
  const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
  cv.connect(lp); lp.connect(shotBus());
  return _outdoor = cv;
}
function shotOut(a, D, big) {
  const dry = a.createGain(), dl = a.createBiquadFilter(), wet = a.createGain();
  dl.type = "lowpass"; dl.frequency.value = Math.max(700, 16000 / (1 + D / 18));
  dry.gain.value = Math.max(0.08, 1 / (1 + D / 35)); wet.gain.value = Math.min(1.2, 0.35 + D / 120) * big;
  dry.connect(dl); dl.connect(shotBus()); wet.connect(outdoor(a)); lease(dl, 10); lease(wet, 10);
  return { dry, wet };
}
// noise through a filter, struck and dying away
function shotBurst(a, to, t, { type = "lowpass", f = 1000, q = 0.7, sweep = 0, attack = 0.002, peak = 0.5, decay = 0.2, len = null }) {
  const s = noiseSrc(a), fl = a.createBiquadFilter(), g = a.createGain();   // (looped: a rumble outlasts the two seconds of noise)
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + (len || decay * 3));
  const end = t + (len || decay * 4);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); g.gain.setTargetAtTime(0.0001, t + attack, decay / 2.3);
  s.connect(fl); fl.connect(g); g.connect(to); s.start(t, Math.random() * 1.5); s.stop(end + 0.05);
}
// a low thump: a sine falling in pitch
function thump(a, to, t, f0, f1, peak, decay) {
  const o = a.createOscillator(), g = a.createGain(); o.type = "sine";
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay * 1.4);
  o.connect(g); g.connect(to); o.start(t); o.stop(t + decay * 1.5);
}
// driven hard, as the air is by a charge going off: the peaks flattened, the sound thick with it
const _curves = {};
function shaped(a, to, k, fine = true) {
  const ws = a.createWaveShaper(), c = _curves[k] ??= (() => { const n = 1024, arr = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; arr[i] = Math.tanh(k * x) / Math.tanh(k); } return arr; })();
  ws.curve = c; ws.oversample = fine ? "2x" : "none"; ws.connect(to); return ws;
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
// (where a burst goes: the mix, or — while a placed sound is being made — that place's panner)
let OUT = null;
function burst(a, t, dur, vol, f0, f1, q = 1, type = "bandpass") {
  const s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.008, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(OUT || bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
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
  pan.connect(lp); lp.connect(bus); lease(lp, 12);
  return { node: pan, k };
}
// vowels as their first three formants (Hz, and how strong)
const VOWELS = { a: [[800, 1], [1200, 0.5], [2600, 0.2]], ae: [[660, 1], [1700, 0.45], [2400, 0.2]], o: [[500, 1], [900, 0.4], [2400, 0.12]], e: [[450, 1], [2000, 0.4], [2700, 0.2]], u: [[350, 1], [800, 0.3], [2300, 0.08]] };

export const AUDIO = {
  init: ctx,
  // ---- a regiment's band (see band.js): its instruments, a note at a time, scheduled ahead on the sound's own clock ----
  now() { const a = ctx(); return a ? a.currentTime : 0; },
  // the fife: a narrow wooden flute, shrill and carrying — the tone hollow (odd harmonics), a little breath in it, the
  //  pitch wavering as the player marches; tongued, so each note starts clean
  fife(midi, dur, { at = null, when = 0, vol = 1 } = {}) {
    const a = ctx(); if (!a) return; const { node, k } = placed(a, at, 160); if (k * vol < 0.02 || !room(0.6)) return;
    const t = Math.max(a.currentTime, when), f = 440 * 2 ** ((midi - 69) / 12), L = Math.max(0.06, dur * 0.9), g = a.createGain(), v = 0.13 * vol * k;
    if (!window.__madeNotes && sampledNote(a, "fifeN", f, L, node, v, t)) return;
    const o = a.createOscillator(); o.type = "triangle"; o.frequency.value = f;
    const o3 = a.createOscillator(); o3.type = "sine"; o3.frequency.value = f * 3; const g3 = a.createGain(); g3.gain.value = 0.12; o3.connect(g3); g3.connect(g);
    const vib = a.createOscillator(), vg = a.createGain(); vib.frequency.value = 5 + Math.random(); vg.gain.value = f * 0.005; vib.connect(vg); vg.connect(o.frequency);
    const n = noiseSrc(a, false), bp = a.createBiquadFilter(), ng = a.createGain(); bp.type = "bandpass"; bp.frequency.value = Math.min(9000, f * 2); bp.Q.value = 1.5; ng.gain.value = 0.35;
    n.connect(bp); bp.connect(ng); ng.connect(g); o.connect(g); g.connect(node);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.018); g.gain.setValueAtTime(v * 0.85, t + Math.max(0.03, L - 0.03)); g.gain.linearRampToValueAtTime(0, t + L);
    for (const x of [o, o3, vib, n]) { x.start(t); x.stop(t + L + 0.02); }
    lease(g, L + 0.5);
  },
  // the side drum: a calfskin head and gut snares under it — a stroke, or a flam (the grace note just before), louder
  //  on the beat that starts the bar
  sideDrum({ at = null, when = 0, vol = 1, accent = false, flam = false } = {}) {
    const a = ctx(); if (!a) return; const { node, k } = placed(a, at, 160); if (k * vol < 0.02 || !room(0.55)) return;
    const hit = (t, amp) => {
      // (recorded: a stick on a rope-tensioned field drum, a different stroke each time)
      if (recorded(a, "snare", [[node, amp * DRUM_GAIN.snare]], t, [0.96, 1.04])) return;
      const n = noiseSrc(a, false), hp = a.createBiquadFilter(), g = a.createGain(); hp.type = "highpass"; hp.frequency.value = 1800;
      n.connect(hp); hp.connect(g); g.connect(node); g.gain.setValueAtTime(amp * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); n.start(t); n.stop(t + 0.18);
      const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08); o.connect(og); og.connect(node);
      og.gain.setValueAtTime(amp * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.start(t); o.stop(t + 0.13);
      lease(g, 0.4); lease(og, 0.4);
    };
    const t = Math.max(a.currentTime, when), amp = (accent ? 1 : 0.62) * vol * k * 0.55;
    if (flam) hit(Math.max(a.currentTime, t - 0.028), amp * 0.45); hit(t, amp);
  },
  // the zurna: the Ottoman shawm, a double reed — loud, nasal and bright, made to carry over a battlefield
  zurna(midi, dur, { at = null, when = 0, vol = 1 } = {}) {
    const a = ctx(); if (!a) return; const { node, k } = placed(a, at, 200); if (k * vol < 0.02 || !room(0.6)) return;
    const t = Math.max(a.currentTime, when), f = 440 * 2 ** ((midi - 69) / 12), L = Math.max(0.06, dur * 0.94), v = 0.075 * vol * k;
    if (!window.__madeNotes && sampledNote(a, "zurnaN", f, L, node, v, t)) return;
    const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
    const vib = a.createOscillator(), vg = a.createGain(); vib.frequency.value = 6; vg.gain.value = f * 0.008; vib.connect(vg); vg.connect(o.frequency);
    const f1 = a.createBiquadFilter(); f1.type = "peaking"; f1.frequency.value = 1300; f1.Q.value = 2; f1.gain.value = 9;
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4200; const g = a.createGain();
    o.connect(f1); f1.connect(lp); lp.connect(g); g.connect(node);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v, t + Math.max(0.04, L - 0.03)); g.gain.linearRampToValueAtTime(0, t + L);
    for (const x of [o, vib]) { x.start(t); x.stop(t + L + 0.02); }
    lease(g, L + 0.5);
  },
  // the natural trumpet: brass, buzzed by the lips — bright and brassy, the tone opening as the breath comes in, a
  //  little swell and a lip's waver on the long notes
  trumpet(midi, dur, { at = null, when = 0, vol = 1, accent = false } = {}) {
    const a = ctx(); if (!a) return; const { node, k } = placed(a, at, 220); if (k * vol < 0.02 || !room(0.6)) return;
    const t = Math.max(a.currentTime, when), f = 440 * 2 ** ((midi - 69) / 12), L = Math.max(0.07, dur * 0.88), v = 0.09 * vol * k * (accent ? 1.15 : 1);
    if (!window.__madeNotes && sampledNote(a, "trumpetN", f, L, node, v, t)) return;
    const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const vib = a.createOscillator(), vg = a.createGain(); vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.004, t + Math.min(0.4, L)); vib.connect(vg); vg.connect(o.frequency);
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1.2; lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(f * 6, t + 0.06); lp.frequency.setValueAtTime(f * 5, t + Math.max(0.07, L - 0.05)); lp.frequency.linearRampToValueAtTime(f * 1.5, t + L);
    const g = a.createGain(); o.connect(lp); lp.connect(g); g.connect(node);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.035); g.gain.setValueAtTime(v * 0.85, t + Math.max(0.05, L - 0.04)); g.gain.linearRampToValueAtTime(0, t + L);
    for (const x of [o, vib]) { x.start(t); x.stop(t + L + 0.02); }
    lease(g, L + 0.5);
  },
  // the great drum: the Ottomans' davul, the Tatars' and the Poles' kettledrums — a deep boom, the beater's slap on it
  bigDrum({ at = null, when = 0, vol = 1, accent = false } = {}) {
    const a = ctx(); if (!a) return; const { node, k } = placed(a, at, 200); if (k * vol < 0.02 || !room(0.55)) return;
    const t = Math.max(a.currentTime, when), amp = (accent ? 1 : 0.6) * vol * k * 0.8;
    if (recorded(a, "bassDrum", [[node, amp * DRUM_GAIN.bassDrum]], t, accent ? [0.9, 0.96] : [0.98, 1.04])) return;
    const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(accent ? 72 : 95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.35); o.connect(og); og.connect(node);
    og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o.start(t); o.stop(t + 0.62);
    const n = noiseSrc(a, false), lp = a.createBiquadFilter(), ng = a.createGain(); lp.type = "lowpass"; lp.frequency.value = 900; n.connect(lp); lp.connect(ng); ng.connect(node);
    ng.gain.setValueAtTime(amp * 0.35, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08); n.start(t); n.stop(t + 0.1);
    lease(og, 1); lease(ng, 0.5);
  },
  // an order shouted: key one of the orders (see loadOrders); at: where the man shouting it stands (null: you); delay:
  //  seconds from now. A different voice of the recordings each time, a woman's higher; heard a long way off, as they
  //  were meant to be
  order(key, { at = null, vol = 1, high = false, delay = 0 } = {}) {
    const a = ctx(); if (!a) return 0;
    const list = OBUF[key]; if (!list || !list.length) return 0;
    const { node, k } = placed(a, at, 140); if (k * vol < 0.02 || !room(at ? Math.min(1, 0.6 + k * vol) : 1)) return 0;
    let i = Math.floor(Math.random() * list.length); if (list.length > 1 && i === OLAST[key]) i = (i + 1) % list.length; OLAST[key] = i;
    const s = a.createBufferSource(), g = a.createGain(), t = a.currentTime + Math.max(0, delay);
    s.buffer = list[i]; s.playbackRate.value = high ? rnd(1.14, 1.2) : rnd(0.96, 1.03);
    g.gain.value = 1.1 * vol * k; s.connect(g); g.connect(node); s.start(t);
    return list[i].duration / s.playbackRate.value;
  },
  // a footfall on whatever is underfoot: grass, leaves, dirt, stone, wood, snow, marsh.
  // vol is how loud (distance already taken off); heavy is a big man in boots; at, where the foot fell (to your left or
  // right, and dulled with distance); kit, a soldier's — the charges on his bandolier knocking, his sword in its scabbard
  step(surface = "grass", vol = 0.6, { fast = false, heavy = false, at = null, kit = false } = {}) {
    const a = ctx(); if (!a || vol <= 0.01) return;
    // (another man's footfall is the first thing left out when the sound is busy: never in the way of a shot or a cry)
    if (at && !room(Math.min(0.5, vol))) return;
    OUT = at ? placed(a, at, 60).node : null;
    try { this._step(a, surface, vol, fast, heavy); if (kit && vol > 0.15 && Math.random() < 0.35) {
      // (wooden charge bottles against each other, a buckle: small dry clicks, a little after the foot lands)
      const t = a.currentTime + rnd(0.03, 0.09);
      for (let i = 0, n = 1 + (Math.random() * 2 | 0); i < n; i++) burst(a, t + i * rnd(0.015, 0.04), 0.018, 0.022 * vol * rnd(0.5, 1), rnd(2400, 3800), 1800, 6);
    } } finally { OUT = null; }
  },
  _step(a, surface, vol, fast, heavy) {
    const t = a.currentTime, k = vol * (fast ? 1.25 : 1) * (heavy ? 1.6 : 1), low = heavy ? 0.7 : 1;
    // (recorded: a man's boots on each ground, eight of each — a heavier man's a little lower, a running one's quicker)
    const rs = STEP_REC[surface];
    if (rs && recorded(a, rs[0], [[OUT || bus, rs[1] * k]], t, heavy ? [0.84, 0.93] : fast ? [0.98, 1.1] : [0.93, 1.06])) return;
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
        if (Math.random() < 0.12) { const o = a.createOscillator(), g = a.createGain(); o.type = "sawtooth"; o.frequency.setValueAtTime(rnd(160, 220), t); o.frequency.linearRampToValueAtTime(rnd(120, 160), t + 0.25); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.012 * k, t + 0.05); g.gain.linearRampToValueAtTime(0.0001, t + 0.28); const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 600; f.Q.value = 4; o.connect(f); f.connect(g); g.connect(bus); lease(g, 8); o.start(t); o.stop(t + 0.3); }
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
    // (a church's bell, recorded; and a little brass hand bell, rung once)
    if (pitch < 1.3 && recorded(a, "bell", [[bus, 0.62 * vol]], a.currentTime, [pitch * 0.98, pitch * 1.02])) return;
    if (pitch >= 1.3 && recorded(a, "handbell", [[bus, HANDBELL_REC * vol]], a.currentTime, [0.97, 1.03])) return;
    const t = a.currentTime, f0 = 196 * pitch;
    for (const [mul, v] of [[0.5, 0.12], [1, 0.16], [2.0, 0.1], [2.4, 0.07], [3.0, 0.05], [4.2, 0.03]]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f0 * mul * (1 + (Math.random() - 0.5) * 0.003);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2 / Math.sqrt(mul));
      o.connect(g); g.connect(bus); lease(g, 8); o.start(t); o.stop(t + 4.5);
    }
  },

  knock(n = 3, vol = 1) {
    const a = ctx(); if (!a) return;
    if (recorded(a, "knock", [[bus, 0.9 * vol]], a.currentTime, [0.95, 1.05])) return;
    for (let i = 0; i < n; i++) {
      const t = a.currentTime + i * rnd(0.32, 0.4);
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      g.gain.setValueAtTime(0.55 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(bus); lease(g, 8); o.start(t); o.stop(t + 0.3);
      const s = noiseSrc(a, false), f = a.createBiquadFilter(), g2 = a.createGain();
      f.type = "lowpass"; f.frequency.value = 900;
      g2.gain.setValueAtTime(0.35 * vol, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      s.connect(f); f.connect(g2); g2.connect(bus); lease(g2, 8); s.start(t, Math.random()); s.stop(t + 0.15);
    }
  },

  // a wooden door on iron hinges: the hinge creaks as it swings (stick and slip, rung through the
  // wood); shutting it, the creak is cut short by the leaf striking the frame and the latch dropping
  door(open = true, vol = 1) {
    const a = ctx(); if (!a || vol < 0.01) return;
    if (recorded(a, open ? "doorOpen" : "doorShut", [[bus, 0.55 * vol]], a.currentTime, [0.9, 1.08])) return;
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
    g.connect(bus); lease(g, 8); o.start(t); o.stop(t + dur + 0.05);
    if (!open) {
      // the leaf against the frame, and the latch
      const tt = t + dur - 0.02;
      const th = a.createOscillator(), tg = a.createGain();
      th.type = "sine"; th.frequency.setValueAtTime(110, tt); th.frequency.exponentialRampToValueAtTime(55, tt + 0.18);
      tg.gain.setValueAtTime(0.0001, tt); tg.gain.exponentialRampToValueAtTime(0.5, tt + 0.008); tg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.25);
      th.connect(tg); tg.connect(bus); lease(tg, 8); th.start(tt); th.stop(tt + 0.3);
      const n = noiseSrc(a, false), nf = a.createBiquadFilter(), ng = a.createGain();
      nf.type = "bandpass"; nf.frequency.value = 2600; nf.Q.value = 3;
      ng.gain.setValueAtTime(0.0001, tt + 0.05); ng.gain.exponentialRampToValueAtTime(0.25, tt + 0.055); ng.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
      n.connect(nf); nf.connect(ng); ng.connect(bus); lease(ng, 8); n.start(tt + 0.05); n.stop(tt + 0.15);
    }
  },

  // one letter of dialogue: the smallest click, a little different each time
  letter(vol = 1) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    // (a scratch of the quill: a different stretch of it each letter)
    if (QUILL.length > 8) {
      const [b, off] = QUILL[Math.floor(Math.random() * QUILL.length)], s = a.createBufferSource(), g = a.createGain(), v = LETTER_REC * vol;
      s.buffer = b; s.playbackRate.value = rnd(0.92, 1.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.setValueAtTime(v, t + 0.034); g.gain.linearRampToValueAtTime(0, t + 0.045);
      s.connect(g); g.connect(bus); lease(g, 1); s.start(t, off, 0.05); return;
    }
    const o = a.createOscillator(), g = a.createGain();
    o.type = "square"; o.frequency.setValueAtTime(rnd(1500, 1900), t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018 * vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3200;
    o.connect(f); f.connect(g); g.connect(bus); lease(g, 8); o.start(t); o.stop(t + 0.03);
  },

  // a line of dialogue arriving: a soft tick, like a page turned against a table
  tick() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    const n = noiseSrc(a, false), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = rnd(1700, 2100); f.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(f); f.connect(g); g.connect(bus); lease(g, 8); n.start(t); n.stop(t + 0.08);
    const o = a.createOscillator(), og = a.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.05);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(bus); lease(og, 8); o.start(t); o.stop(t + 0.08);
  },

  drumRoll(secs = 4, vol = 0.5) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime;
    // (recorded: the roll beaten stroke by stroke on the field drum, swelling as it goes)
    if (SBUF.snare && SBUF.snare.length >= 2) { for (let t = 0; t < secs; t += 0.07) recorded(a, "snare", [[bus, vol * (0.35 + 0.65 * (t / secs)) * rnd(0.7, 1) * ROLL_REC]], t0 + t + rnd(0, 0.008), [0.97, 1.03]); return; }
    for (let t = 0; t < secs; t += 0.07) {
      const s = noiseSrc(a, false), f = a.createBiquadFilter(), g = a.createGain();
      f.type = "bandpass"; f.frequency.value = 260 + Math.random() * 60; f.Q.value = 1.5;
      const v = vol * (0.35 + 0.65 * (t / secs)) * rnd(0.7, 1);
      g.gain.setValueAtTime(v, t0 + t); g.gain.exponentialRampToValueAtTime(0.001, t0 + t + 0.09);
      s.connect(f); f.connect(g); g.connect(bus); lease(g, 8); s.start(t0 + t, Math.random()); s.stop(t0 + t + 0.1);
    }
  },

  // a musket: the flint struck and the pan flashing — a scrape and a fizz, a moment before — then the charge: a hard
  // crack, the boom of it in the chest, and the report going off through the country and coming back from it. Heard
  // from further off it comes later (the sound's own travel, three hundred and forty metres a second), duller, and more
  // of it is the echo. A pistol is the same, smaller: higher, shorter, less to come back.
  gunshot(vol = 1, at = null) {
    const a = ctx(); if (!a) return;
    const small = vol < 0.85, D = shotDistance(at); let v = 0.55 * vol * Math.max(0.12, 1 - D / 260);   // (well under the cannon: room left above it)
    // (a shot is the battle: one within a long musket shot is always heard, and further ones come before footsteps and
    //  cries — it was the first thing dropped, so in a crowded fight the muskets went silent unless you fired one)
    if (!room(D < 150 ? 1 : Math.max(0.6, 1 - D / 400))) return;
    const t = a.currentTime + D / 343 + (at ? 0 : 0);
    const out = shotOut(a, D, 1);
    // (close by, the made shot — its crack is the better; far off, the recorded one, a real report rolling over the
    //  country; between 40 and 90 metres, the one fading into the other)
    const far = Math.min(1, Math.max(0, (D - 40) / 50));
    if (far > 0 && recorded(a, small ? "pistol" : "musket", [[out.dry, 1.05 * v * far], [out.wet, (small ? 0.35 : 0.5) * v * far]], t, small ? [0.96, 1.08] : [0.93, 1.05])) { if (far >= 1) return; v *= 1 - far; }
    // the lock: the flint on the steel, and the priming going up in the pan
    if (D < 40) {
      shotBurst(a, out.dry, t, { type: "highpass", f: 3500, attack: 0.001, peak: 0.25 * v, decay: 0.012 });
      shotBurst(a, out.dry, t + 0.006, { type: "bandpass", f: 4200, q: 0.9, attack: 0.004, peak: 0.16 * v, decay: 0.05 });
    }
    const tc = t + (small ? 0.035 : 0.05) + Math.random() * 0.025;   // (the lock time: the pan, then the barrel)
    // the crack: the gas out of the muzzle, hard and wide, clipped as a real one sounds through the air
    const crack = shaped(a, out.dry, 3.5, D < 30);
    shotBurst(a, crack, tc, { type: "highpass", f: small ? 900 : 650, attack: 0.0008, peak: (small ? 0.75 : 0.95) * v, decay: small ? 0.035 : 0.05 });
    // the body: the boom, a thump under it
    shotBurst(a, out.dry, tc, { type: "lowpass", f: small ? 2600 : 1900, sweep: small ? 300 : 180, attack: 0.002, peak: 0.75 * v, decay: small ? 0.22 : 0.4, len: 1.2 });
    thump(a, out.dry, tc, small ? 130 : 95, small ? 55 : 40, (small ? 0.45 : 0.7) * v, small ? 0.18 : 0.32);
    // and the report rolling away: the same, into the country round about and back
    shotBurst(a, out.wet, tc, { type: "lowpass", f: 1400, attack: 0.002, peak: (small ? 0.45 : 0.7) * v, decay: 0.25 });
  },
  // a cannon: the linstock to the vent and the priming fizzing down it, then a blast nothing else on the field comes
  // near — a crack like a split tree and a boom you feel in the ground — and the thunder of it going round the hills
  // for seconds after
  cannon(vol = 1, at = null) {
    const a = ctx(); if (!a) return;
    const D = shotDistance(at); let v = vol * Math.max(0.3, 1 - D / 700);
    const t = a.currentTime + D / 343;
    const out = shotOut(a, D, 1.6);
    // (made close by, recorded far off — the thunder of a distant gun — and the one into the other from 80 to 160 m)
    const far = Math.min(1, Math.max(0, (D - 80) / 80));
    if (far > 0 && recorded(a, "cannon", [[out.dry, 1.3 * v * far], [out.wet, 0.9 * v * far]], t, [0.94, 1.04])) { if (far >= 1) return; v *= 1 - far; }
    if (D < 30) shotBurst(a, out.dry, t, { type: "bandpass", f: 3000, q: 0.7, attack: 0.02, peak: 0.12 * v, decay: 0.16, len: 0.2 });
    const tc = t + 0.18 + Math.random() * 0.05;
    const crack = shaped(a, out.dry, 6);
    shotBurst(a, crack, tc, { type: "highpass", f: 400, attack: 0.001, peak: 1.4 * v, decay: 0.09 });
    shotBurst(a, shaped(a, out.dry, 2.5), tc, { type: "lowpass", f: 1500, sweep: 90, attack: 0.003, peak: 1.5 * v, decay: 0.9, len: 3 });
    thump(a, out.dry, tc, 58, 19, 1.5 * v, 1.2);
    thump(a, out.dry, tc + 0.01, 34, 16, 1.0 * v, 1.8);
    // (the rumble that goes on, low, while the echo answers from far off)
    shotBurst(a, out.dry, tc + 0.05, { type: "lowpass", f: 160, attack: 0.08, peak: 0.6 * v, decay: 2.6, len: 4 });
    shotBurst(a, out.wet, tc, { type: "lowpass", f: 900, attack: 0.004, peak: 1.6 * v, decay: 0.5 });
    for (const [dt, k] of [[0.45, 0.35], [0.95, 0.22], [1.7, 0.16]]) shotBurst(a, out.wet, tc + dt + Math.random() * 0.15, { type: "lowpass", f: 500, attack: 0.03, peak: k * v, decay: 0.6, len: 1.6 });
  },
  // a grenade bursting: its own sharp blast and the earth thrown up falling after (with no recording, a small cannon's)
  blast(vol = 1, at = null) {
    const a = ctx(); if (!a) return;
    const D = shotDistance(at), v = vol * Math.max(0.25, 1 - D / 400), out = shotOut(a, D, 1.2);
    if (!recorded(a, "nade", [[out.dry, 1.1 * v], [out.wet, 0.7 * v]], a.currentTime + D / 343, [0.92, 1.06])) this.cannon(0.42 * vol, at);
  },
  // loading: the ramrod down the barrel, a scrape and a knock
  ramrod() {
    const a = ctx(); if (!a) return;
    // (the gun loaded: its rammer driven home — the gun crew's own recording, foley.js)
    if (window.__foley && window.__foley.rec && window.__foley.rec("gunRam", RAM_REC)) return;
    const t = a.currentTime, s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    s.connect(f); f.connect(g); g.connect(bus); lease(g, 8); s.start(t, Math.random()); s.stop(t + 0.32);
  },
  // a bow drawn: the wood of the limbs creaking under the strain, a tick and a groan, louder the further it comes back
  bowCreak(k = 0.5) {
    const a = ctx(); if (!a) return;
    // (recorded: the yew and the string creaking under the strain — a creak's a run of little catches half a second long,
    //  so one at a time, not one on every call)
    if (SBUF.bowCreak && SBUF.bowCreak.length >= 2) { const n = a.currentTime; if (n < (this._creakT || 0)) return; this._creakT = n + rnd(0.45, 0.8); recorded(a, "bowCreak", [[bus, CREAK_REC * (0.5 + k)]], n, [0.92, 1.08]); return; }
    const t = a.currentTime, s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = rnd(380, 560) + k * 200; f.Q.value = 9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + 0.1 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.07, 0.14));
    s.connect(f); f.connect(g); g.connect(bus); lease(g, 8); s.start(t, Math.random()); s.stop(t + 0.16);
  },
  // the string let go: a deep, short twang that dies at once, the slap of it on the bracer, and the arrow hissing away
  twang(power = 1) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    // (recorded: a longbow's string let go, or a crossbow's steel bow, levelled to the made one)
    if (recorded(a, power >= 1.15 ? "xbow" : "twang", [[bus, (power >= 1.15 ? 0.075 : 0.137) * (0.4 + 0.6 * power)]], t)) return;
    for (const [fq, v, d] of [[rnd(92, 104), 0.32, 0.22], [rnd(186, 206), 0.14, 0.12], [rnd(410, 450), 0.06, 0.06]]) {
      const o = a.createOscillator(), g = a.createGain(); o.type = "triangle";
      o.frequency.setValueAtTime(fq * 1.35, t); o.frequency.exponentialRampToValueAtTime(fq, t + 0.03);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * (0.4 + 0.6 * power), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(bus); lease(g, 8); o.start(t); o.stop(t + d + 0.02);
    }
    const s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "lowpass"; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * (0.4 + 0.6 * power), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(bus); lease(g, 8); s.start(t, Math.random()); s.stop(t + 0.07);
    const h = noiseSrc(a), hf = a.createBiquadFilter(), hg = a.createGain();
    hf.type = "bandpass"; hf.Q.value = 2; hf.frequency.setValueAtTime(3200, t + 0.02); hf.frequency.exponentialRampToValueAtTime(1400, t + 0.4);
    hg.gain.setValueAtTime(0.0001, t + 0.02); hg.gain.exponentialRampToValueAtTime(0.07 * power, t + 0.06); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    h.connect(hf); hf.connect(hg); hg.connect(bus); lease(hg, 8); h.start(t + 0.02, Math.random()); h.stop(t + 0.45);
  },

  // a blade or a haft through the air: noise that swells and falls away, its pitch rising with the stroke's speed
  whoosh(vol = 0.5, heavy = true) {
    const a = ctx(); if (!a || vol < 0.02 || !room(vol)) return;
    // (a weapon's — an axe, a sword, a musket's butt — the recorded blade through the air, levelled to the made one)
    if (heavy && window.__foley && window.__foley.swishRec && window.__foley.swishRec(vol * 0.16)) return;
    const t = a.currentTime, dur = heavy ? rnd(0.3, 0.36) : rnd(0.2, 0.25), peak = t + dur * 0.45;
    const s = noiseSrc(a), f = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.Q.value = 0.9;
    const lo = heavy ? 260 : 420, hi = heavy ? rnd(900, 1150) : rnd(1500, 1900);
    f.frequency.setValueAtTime(lo, t); f.frequency.exponentialRampToValueAtTime(hi, peak); f.frequency.exponentialRampToValueAtTime(lo * 0.8, t + dur);
    f2.type = "lowpass"; f2.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.35, peak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(f2); f2.connect(g); g.connect(bus); lease(g, 8); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },

  // a human voice raised: a buzzing throat through the mouth's shape (a vowel), the pitch bending as a cry does.
  //   kind: "war" (a charging yell, low and long), "pain" (cut short, breaking), "fear" (high, a scream), "grunt" (the effort of a blow)
  //   high: a woman's or a boy's voice. at: where in the world it comes from.
  // a man's voice, crying out: a war cry, a cry of pain, fear, a grunt, and the cry of a man going down. Made as a voice
  // is: the throat's buzz (not a plain wave — its overtones falling away as a real one's do, the pitch never quite
  // steady, a rasp of roughness under it when it's forced), breath through it, and the mouth shaping it — five
  // resonances, gliding from one vowel to the next as the cry goes. Each cry a little different.
  // a breath dragged in, sharp, through an open mouth: before a scream, between sobs
  gasp({ at = null, vol = 1, delay = 0 } = {}) {
    const a = ctx(); if (!a) return;
    const { node, k } = placed(a, at, 40); if (k * vol < 0.02 || !room(k * vol)) return;
    const t = a.currentTime + delay, dur = rnd(0.16, 0.26);
    const n = noiseSrc(a), f = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.Q.value = 1.6; f.frequency.setValueAtTime(rnd(1100, 1400), t); f.frequency.linearRampToValueAtTime(rnd(1900, 2400), t + dur);
    f2.type = "bandpass"; f2.Q.value = 3; f2.frequency.value = rnd(2800, 3400);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * vol * k, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); n.connect(f2); f.connect(g); f2.connect(g); g.connect(node); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
  },
  voice(kind = "war", { high = false, at = null, vol = 1, delay = 0, seg = false } = {}) {
    const a = ctx(); if (!a) return;
    const { node, k } = placed(a, at, 70); if (k * vol < 0.02) return;
    // (the war cry: recorded, a few at once at most, a woman's or a boy's higher; with none loaded, none — the made-up
    //  one is gone with the rest)
    if (kind === "war") { if (!SBUF.war || liveCries >= 5 && k * vol < 0.7 || !room(Math.min(1, k * vol))) return; liveCries++; setTimeout(() => liveCries--, 1600);
      recorded(a, "war", [[node, 0.85 * vol * k]], a.currentTime + delay, high ? [1.2, 1.3] : [0.9, 1.07]); return; }
    if (!room(Math.min(1, k * vol))) return;
    // (cries of their own kept to a few at once — beyond those, only a man right by you is heard: a hundred falling
    //  together was a wall of screaming over everything, and it crowded the muskets out)
    if (!seg && kind !== "war") { if (liveCries >= 6 && k * vol < 0.75) return; liveCries++; setTimeout(() => liveCries--, kind === "death" ? 2600 : 1500); }
    const t = a.currentTime + delay;
    // a man going down doesn't cry once: a gasp, the scream, and then it breaks down — a catch of breath, and a moan or
    // two falling away, each weaker (the same throat throughout)
    if (kind === "death" && !seg) {
      const me = { high, at, vol, seg: true };
      // (the moans after it wait for the scream to end: a real one runs as long as it runs)
      const d0 = recordedVoice(a, "death", high, node, k, vol, t + 0.12) || (this.voice("death", { ...me, delay: delay + 0.12 }), rnd(0.9, 1.35));
      let at2 = delay + 0.12 + d0 + rnd(0.2, 0.45);
      // (the moans after only where there's room for them: a man near you, or a quiet moment)
      for (let i = 0, n = Math.random() < 0.3 && room(0.3 + k * 0.7) ? 1 : 0; i < n; i++) {
        this.voice(Math.random() < 0.5 ? "moan" : "sob", { ...me, vol: vol * (0.7 - i * 0.2), delay: at2 });
        at2 += rnd(0.9, 1.5);
      }
      return;
    }
    if (kind === "pain" && !seg && Math.random() < 0.15) {
      // (sometimes it's two: the cry, a breath sucked in through the teeth, and a second, shorter)
      const d = recordedVoice(a, "pain", high, node, k, vol, t) || (this.voice("pain", { high, at, vol, delay, seg: true }), rnd(0.42, 0.75));
      this.voice("sob", { high, at, vol: vol * 0.75, delay: delay + d + rnd(0.3, 0.45), seg: true });
      return;
    }
    // (a real cry, where the recordings are in: all but the war cry)
    if (recordedVoice(a, kind, high, node, k, vol, t)) return;
    // (and the old made-up cries are gone, every one: a scream, a cry of pain, a moan, a sob — and the made-up war cry
    //  too — is a recording or it's nothing. Till the recordings are in, a man goes down without a cry)
    return;
    // [pitch, how long, vowels from → to, the rise at the start, how the pitch ends, loudness, roughness, breathiness]
    const P = {
      war:   [rnd(155, 200), rnd(0.9, 1.4), ["a", r2(["a", "o"])], 1.3, 0.88, 1.0, 0.35, 0.18],
      pain:  [rnd(230, 320), rnd(0.42, 0.75), [r2(["ae", "a"]), r2(["a", "u"])], 1.45, 0.62, 1.05, 0.55, 0.28],
      death: [rnd(240, 330), rnd(0.9, 1.35), [r2(["a", "ae"]), r2(["a", "u"])], 1.35, 0.5, 1.15, 0.8, 0.35],
      moan:  [rnd(140, 190), rnd(0.8, 1.3), [r2(["o", "u"]), "u"], 1.06, 0.7, 0.55, 0.55, 0.55],
      sob:   [rnd(220, 300), rnd(0.35, 0.55), [r2(["a", "ae"]), "u"], 1.2, 0.6, 0.7, 0.65, 0.5],
      fear:  [rnd(330, 420), rnd(0.8, 1.3), [r2(["ae", "e"]), "a"], 1.2, 0.8, 0.85, 0.3, 0.3],
      grunt: [rnd(105, 145), rnd(0.15, 0.24), [r2(["u", "o"]), "u"], 1.08, 0.85, 0.75, 0.6, 0.45],
    }[kind] || [170, 1, ["a", "a"], 1.2, 0.9, 1, 0.3, 0.2];
    let [f0, dur, [v0, v1], rise, fall, loud, rough, breath] = P;
    // (each man's throat his own: longer or shorter, which moves all the resonances together)
    const tract = (high ? 1.17 : 1) * rnd(0.93, 1.07);
    if (high) f0 *= 1.7;
    // the pitch through the cry: up hard at the start, held with a waver, and falling away at the end
    const pitch = a.createConstantSource(); pitch.offset.setValueAtTime(f0 * 0.82, t);
    pitch.offset.linearRampToValueAtTime(f0 * rise, t + Math.min(0.12, dur * 0.2));
    pitch.offset.linearRampToValueAtTime(f0 * rise * 0.94, t + dur * 0.55);
    pitch.offset.exponentialRampToValueAtTime(f0 * fall, t + dur);
    // (a cry forced past what the throat can do breaks: the pitch jumps — up, cracking, or down into the chest — and
    //  back; the more pain, the more often)
    const SCREAM = kind === "pain" || kind === "death" || kind === "fear" || kind === "sob";
    if (SCREAM) for (let i = 0, n = Math.floor(rough * 3 * Math.random()) + (kind === "death" ? 1 : 0); i < n; i++) {
      const bt = t + dur * rnd(0.2, 0.75), up = Math.random() < 0.55, j = up ? rnd(1.25, 1.6) : rnd(0.6, 0.75), bl = rnd(0.05, 0.16);
      pitch.offset.setValueAtTime(f0 * rise * 0.94 * j, bt); pitch.offset.setValueAtTime(f0 * rise * 0.92, Math.min(t + dur * 0.85, bt + bl));
    }
    // (jitter: the pitch never quite steady — slow noise on it, and a quicker tremor when it's strained)
    const jit = noiseSrc(a), jf = a.createBiquadFilter(), jg = a.createGain(); jf.type = "lowpass"; jf.frequency.value = 18; jg.gain.value = f0 * (0.05 + rough * 0.06);
    jit.connect(jf); jf.connect(jg);
    const trem = a.createOscillator(), tg = a.createGain(); trem.frequency.value = rnd(5.5, 8); tg.gain.value = f0 * (kind === "fear" ? 0.05 : 0.018);
    trem.connect(tg);
    // the throat: a wave whose overtones fall away twelve decibels an octave, as a voice's do
    const glot = (() => { const n = 40, re = new Float32Array(n), im = new Float32Array(n); for (let h = 1; h < n; h++) im[h] = 1 / (h * h ** 0.5) * (h % 2 ? 1 : 0.85); return a.createPeriodicWave(re, im); })();
    const src = a.createGain(); src.gain.value = 1;
    const throat = a.createOscillator(); throat.setPeriodicWave(glot); throat.frequency.value = 0;
    pitch.connect(throat.frequency); jg.connect(throat.frequency); tg.connect(throat.frequency);
    const thg = a.createGain(); thg.gain.value = 0.9; throat.connect(thg); thg.connect(src);
    // (forced: a rasp under it — the cords flapping at half the pitch, unevenly)
    const fry = a.createOscillator(); fry.type = "sawtooth"; fry.frequency.value = 0;
    const half = a.createGain(); half.gain.value = 0.5; pitch.connect(half); half.connect(fry.frequency); jg.connect(fry.frequency);
    const fryG = a.createGain(); fryG.gain.setValueAtTime(rough * 0.35, t); fryG.gain.linearRampToValueAtTime(rough * (kind === "death" ? 0.7 : 0.45), t + dur);
    fry.connect(fryG); fryG.connect(src);
    // breath through it: louder as the voice gives out at the end
    const br = noiseSrc(a), bf = a.createBiquadFilter(), bg = a.createGain(); bf.type = "highpass"; bf.frequency.value = 500;
    bg.gain.setValueAtTime(breath * 0.6, t); bg.gain.linearRampToValueAtTime(breath * 0.9, t + dur * 0.7); bg.gain.linearRampToValueAtTime(breath * 1.6, t + dur);
    br.connect(bf); bf.connect(bg); bg.connect(src);
    // the mouth: five resonances, each sliding from the first vowel's place to the second's
    const FM = { a: [730, 1090, 2440, 3400, 4300], ae: [660, 1720, 2410, 3400, 4300], o: [570, 840, 2410, 3300, 4200], e: [530, 1840, 2480, 3500, 4400], u: [440, 1020, 2240, 3250, 4200] };
    const AMP = [1, 0.62, 0.32, 0.16, 0.08], BW = [90, 110, 160, 220, 280];
    const out = a.createGain();
    for (let i = 0; i < 5; i++) {
      const bp = a.createBiquadFilter(); bp.type = "bandpass";
      const fA = FM[v0][i] * tract, fB = FM[v1][i] * tract;
      bp.frequency.setValueAtTime(fA, t); bp.frequency.setValueAtTime(fA, t + dur * 0.35); bp.frequency.linearRampToValueAtTime(fB, t + dur * 0.9);
      bp.Q.value = fA / BW[i];
      const fg = a.createGain(); fg.gain.value = AMP[i] * 3.2; src.connect(bp); bp.connect(fg); fg.connect(out);
    }
    // (a little of the throat straight through: the chest of the voice, under the mouth's shaping)
    const chest = a.createBiquadFilter(), cg = a.createGain(); chest.type = "lowpass"; chest.frequency.value = 400 * tract; cg.gain.value = 0.35; src.connect(chest); chest.connect(cg); cg.connect(out);
    // (the harshness of a scream: its loudness beating fast — forty to a hundred and ten times a second — as no calm
    //  voice does; and chaos in the throat, a hiss in the voice's own band)
    let rough2 = null;
    if (SCREAM) {
      rough2 = a.createGain(); rough2.gain.value = 1 - rough * 0.32;
      const am = a.createOscillator(), amg = a.createGain(); am.frequency.setValueAtTime(rnd(40, 75), t); am.frequency.linearRampToValueAtTime(rnd(70, 110), t + dur);
      amg.gain.value = rough * 0.32; am.connect(amg); amg.connect(rough2.gain); am.start(t); am.stop(t + dur + 0.05);
      const hs = noiseSrc(a), hf = a.createBiquadFilter(), hg = a.createGain(); hf.type = "bandpass"; hf.frequency.value = 1400 * tract; hf.Q.value = 0.8;
      hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(rough * 0.5, t + dur * 0.3); hg.gain.linearRampToValueAtTime(rough * 0.25, t + dur);
      hs.connect(hf); hf.connect(hg); hg.connect(out); hs.start(t, Math.random() * 1.5); hs.stop(t + dur + 0.05);
    }
    // the envelope: in fast, held, and then let go — a death cry breaking up into breath
    const env = a.createGain(), v = 0.42 * loud * vol * k;
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(v, t + (kind === "war" ? 0.07 : 0.025));
    env.gain.setValueAtTime(v * 0.9, t + dur * 0.55);
    if (kind === "death") { env.gain.linearRampToValueAtTime(v * 0.35, t + dur * 0.8); env.gain.linearRampToValueAtTime(v * 0.45, t + dur * 0.86); }
    if (kind === "sob" || kind === "moan") { env.gain.linearRampToValueAtTime(v * 0.55, t + dur * 0.3); env.gain.linearRampToValueAtTime(v * 0.8, t + dur * 0.42); }
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // pushed hard, a voice breaks: rounded over, not clipped
    const sh = a.createWaveShaper(), c = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; c[i] = Math.tanh(x * 1.8); } sh.curve = c;
    if (rough2) { out.connect(rough2); rough2.connect(sh); } else out.connect(sh);
    sh.connect(env); env.connect(node);
    const end = t + dur + 0.05;
    for (const o of [pitch, throat, fry, trem]) { o.start(t); o.stop(end); }
    jit.start(t, Math.random() * 1.5); jit.stop(end); br.start(t, Math.random() * 1.5); br.stop(end);
  },

  // your own breath: air through an open mouth — pink noise (soft, no crackle) shaped by the mouth's resonances,
  // "haa" going out and a thinner "hih" coming in, swelling and fading smoothly; winded, a little voice comes into it
  breath(inhale, vol = 0.6, period = 1.2, high = false) {
    const a = ctx(); if (!a) return;
    // (recorded: a man or a woman out of breath, a whole breath in and out at the in-breath — the take nearest the pace,
    //  hurried or let out a little to fit it; the out-breath is in it)
    { const list = SBUF[high ? "breathW" : "breathM"];
      if (list && list.length >= 2) {
        if (!inhale) return;
        const want = period * 0.95, near = [...list].sort((x, y) => Math.abs(Math.log(x.duration / want)) - Math.abs(Math.log(y.duration / want)));
        const b = near[Math.random() < 0.6 ? 0 : 1];
        const t = a.currentTime, s = a.createBufferSource(), g = a.createGain(); s.buffer = b;
        s.playbackRate.value = Math.min(1.18, Math.max(0.9, b.duration / want)) * rnd(0.97, 1.03);
        g.gain.value = BREATH_REC[high ? 1 : 0] * vol; s.connect(g); g.connect(bus); lease(g, b.duration + 1); s.start(t);
        return;
      } }
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
    g.connect(lp); lp.connect(bus); lease(lp, dur + 3);
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
    if (recorded(a, "chew", [[bus, 0.015]], a.currentTime)) return;
    const t = a.currentTime, s = noiseSrc(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "bandpass"; f.frequency.value = rnd(700, 1100); f.Q.value = 1.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(bus); lease(g, 8); s.start(t, Math.random()); s.stop(t + 0.2);
  },

  // steel on steel: a bright strike and a ring of partials that don't quite agree, dying away
  clang(vol = 1, at = null) {
    const a = ctx(); if (!a) return;
    const { node, k } = placed(a, at, 55); if (k * vol < 0.02 || !room(k * vol)) return;
    if (recorded(a, "clang", [[node, 0.75 * vol * k]], a.currentTime, [0.92, 1.1])) return;
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
    // (recorded: a watchman's "Halt!" down a stone street)
    if (recorded(a, "shout", [[bus, SHOUT_REC]], t, [0.95, 1.05])) return;
    const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(200, t); o.frequency.linearRampToValueAtTime(260, t + 0.15); o.frequency.linearRampToValueAtTime(170, t + 0.5);
    f.type = "bandpass"; f.frequency.value = 700; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f); f.connect(g); g.connect(bus); lease(g, 8); o.start(t); o.stop(t + 0.6);
  },

  // a fly past the ear: a thin whine that swells and pans across
  buzz() {
    const a = ctx(); if (!a) return;
    // (a fly, recorded, going by from one ear to the other)
    if (SBUF.fly && SBUF.fly.length >= 2 && a.createStereoPanner) {
      const p = a.createStereoPanner(), s = Math.random() < 0.5 ? -1 : 1, t = a.currentTime; p.pan.setValueAtTime(s * 0.8, t); p.pan.linearRampToValueAtTime(-s * 0.8, t + 1.4); p.connect(bus); lease(p, 3);
      if (recorded(a, "fly", [[p, 0.055]], t)) return;
    }
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



  // a crowd murmuring: a handful of voice-band noises, each swelling and falling
  murmur(on, vol = 1) {
    loop("murmur", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.09 * vol, a.currentTime, 1.2); g.connect(bus);
      const stop = [];
      { const b = bed(a, "murmur", g, MURMUR_REC); if (b) return { g, stop: [b.s] }; }
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
      // (recorded: the harbour's water slapping at the quay and the hulls)
      { const b = bed(a, "harbour", g, HARBOUR_REC); if (b) return { g, stop: [b.s] }; }
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
      // (recorded: light rain and a downpour, the one giving way to the other as it comes on, and the drumming on a roof)
      const L = bed(a, "rainLight", g, 0), Hv = bed(a, "rainHeavy", g, 0), R = bed(a, "rainRoof", g, 0);
      if (L && Hv && R) return { g, rec: { L, Hv, R }, stop: [L.s, Hv.s, R.s], k };
      for (const b of [L, Hv, R]) if (b) b.s.stop();
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
    if (l.rec) {
      const t = a.currentTime, out = under ? 0 : 1, { L, Hv, R } = l.rec;
      l.g.gain.setTargetAtTime(1, t, 0.8);
      L.g.gain.setTargetAtTime(out * RAIN_REC.light * Math.min(1, k * 3) * (1 - 0.7 * k), t, 0.8);
      Hv.g.gain.setTargetAtTime(out * RAIN_REC.heavy * k ** 1.5, t, 0.8);
      R.g.gain.setTargetAtTime((1 - out) * RAIN_REC.roof * (0.25 + 0.75 * k), t, 0.8);
      return;
    }
    l.g.gain.setTargetAtTime(vol * (under ? 0.7 : 1), a.currentTime, 0.8);
    l.lp.frequency.setTargetAtTime(under ? 1400 : 5000 + k * 3000, a.currentTime, 0.4);
    l.hp.frequency.setTargetAtTime(under ? 250 : 900 - k * 400, a.currentTime, 0.4);
  },
  // the pause menu opening: a light boom, like a gun far off across the country — a soft low thud, and its roll
  // dying away in the hills (on the game's own bus, so it's heard while the field's sounds are held)
  pauseBoom() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + 0.01, lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.connect(bus); lease(lp, 3);
    thump(a, lp, t, 62, 34, 0.32, 0.32);
    shotBurst(a, lp, t, { type: "lowpass", f: 260, sweep: 90, peak: 0.16, attack: 0.012, decay: 0.28 });
    shotBurst(a, lp, t + 0.09, { type: "lowpass", f: 140, peak: 0.07, attack: 0.08, decay: 0.9, len: 1.6 });
  },
  // your kill, felt: a low, dull thud — the way a man going down is felt through the ground as much as heard — with
  // a muted knock in it (no ring, no chime: nothing a field ever made)
  killThud() {
    const a = ctx(); if (!a) return;
    // (recorded: the blow, and a man in his coat going down on the earth)
    if (recorded(a, "bodyfall", [[bus, 1.12]], a.currentTime + 0.01, [0.95, 1.05])) return;
    const t = a.currentTime + 0.01, lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1900; lp.connect(bus); lease(lp, 3);
    // the blow landing: a hard, dry smack into cloth and what's under it, with a crunch in it
    shotBurst(a, lp, t, { type: "bandpass", f: 1250, q: 1.3, peak: 0.26, attack: 0.001, decay: 0.035 });
    shotBurst(a, lp, t, { type: "highpass", f: 2400, peak: 0.1, attack: 0.001, decay: 0.018 });
    thump(a, lp, t, 120, 46, 0.62, 0.18);
    // and him going down: the weight of a body meeting the ground, twice — knees, then the rest — and the earth's
    // dull answer under it
    thump(a, lp, t + 0.16, 86, 38, 0.5, 0.26);
    shotBurst(a, lp, t + 0.16, { type: "lowpass", f: 260, peak: 0.34, attack: 0.006, decay: 0.2 });
    thump(a, lp, t + 0.3, 70, 34, 0.32, 0.3);
    shotBurst(a, lp, t + 0.3, { type: "lowpass", f: 180, sweep: 70, peak: 0.2, attack: 0.01, decay: 0.4, len: 0.9 });
  },

  // your own heart, loud in your ears: the lub, low and thick, and the dub a sixth of a second after, a little higher and
  // softer — felt as much as heard, the chest's thud and no ring to it
  heartbeat(vol = 1) {
    const a = ctx(); if (!a) return;
    // (recorded: a heart's lub-dub, as through a stethoscope, levelled to the made one)
    if (recorded(a, "heart", [[bus, HEART_REC * vol]], a.currentTime + 0.01, [0.96, 1.04])) return;
    const t = a.currentTime + 0.01, lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160; lp.Q.value = 0.9; lp.connect(bus); lease(lp, 3);
    for (const [dt, f, k] of [[0, 52, 1], [0.17, 64, 0.65]]) {
      thump(a, lp, t + dt, f * 1.25, f * 0.75, 0.55 * vol * k, 0.11);
      shotBurst(a, lp, t + dt, { type: "lowpass", f: 120, peak: 0.25 * vol * k, attack: 0.008, decay: 0.07 });
    }
  },
  // the din of a melee, under the blows you hear one by one: a crowd of men roaring, steel knocking on steel and on
  // musket stocks, men going down, and the thud of a running line's feet — fight: how much of the fighting is about you
  // (0 to 1), run: how much of a line is running at it (0 to 1)
  melee(fight = 0, run = 0) {
    const a = ctx(); if (!a) return;
    if (fight <= 0.01 && run <= 0.01) { loop("melee", false); return; }
    if (!loops.melee) loop("melee", true, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.connect(bus);
      const wet = a.createGain(); wet.gain.value = 0.5; g.connect(wet); wet.connect(outdoor(a));
      const stop = [], self = { g, stop, fight: 0, run: 0 };
      // (the roar: many throats on an open "a" and "o", each swelling and breaking off on its own breath — rough noise
      //  through each voice's own formants, a buzz of chest under it, the pitch wandering)
      const roar = a.createGain(); roar.gain.value = 0.0001; roar.connect(g); self.roar = roar;
      const rb = bed(a, "roar", roar, ROAR_REC); if (rb) stop.push(rb.s);
      for (let i = 0; i < (rb ? 0 : 6); i++) {
        const v = VOWELS[r2(["a", "a", "o", "ae"])], vg = a.createGain(), sw = a.createGain();
        const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = rnd(0.25, 0.9); lg.gain.value = 0.5; sw.gain.value = 0.5;
        lfo.connect(lg); lg.connect(sw.gain); vg.connect(sw); sw.connect(roar);
        const s = noiseSrc(a), o = a.createOscillator(), og = a.createGain(), vib = a.createOscillator(), vibg = a.createGain();
        o.type = "sawtooth"; o.frequency.value = rnd(130, 230); vib.frequency.value = rnd(3, 6); vibg.gain.value = rnd(4, 9);
        vib.connect(vibg); vibg.connect(o.frequency); og.gain.value = 0.18;
        o.connect(og);
        for (const [f, k] of v) {
          const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * rnd(0.92, 1.08); bp.Q.value = 5;
          const fg = a.createGain(); fg.gain.value = k; s.connect(bp); og.connect(bp); bp.connect(fg); fg.connect(vg);
        }
        s.start(0, Math.random() * 1.9); o.start(); vib.start(); lfo.start(); stop.push(s, o, vib, lfo);
      }
      // (the feet: a thudding rumble, uneven, low)
      const feet = a.createGain(); feet.gain.value = 0.0001; feet.connect(g); self.feet = feet;
      const fb = bed(a, "runCrowd", feet, RUN_REC); if (fb) stop.push(fb.s);
      else { const s = noiseSrc(a), lp = a.createBiquadFilter(), am = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
        lp.type = "lowpass"; lp.frequency.value = 170; lp.Q.value = 1.2; am.gain.value = 0.6; lfo.type = "square"; lfo.frequency.value = 5.3; lg.gain.value = 0.4;
        lfo.connect(lg); lg.connect(am.gain); s.connect(lp); lp.connect(am); am.connect(feet); s.start(0, Math.random()); lfo.start(); stop.push(s, lfo); }
      // (and struck things, now and again — more of them the thicker the fight)
      const knock = () => {
        if (loops.melee !== self) return;
        const k = self.fight, t = a.currentTime + rnd(0, 0.05);
        if (k > 0.02 && room(0.35)) {
          const far = rnd(0.35, 1) * k, r = Math.random(), o = a.createGain(); o.gain.value = far; o.connect(g);
          const b = (dur, vol, f0, f1, q, type = "bandpass") => { const s = noiseSrc(a), f = a.createBiquadFilter(), gg = a.createGain(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(vol, t + 0.003); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(gg); gg.connect(o); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02); };
          // (recorded, each its own: blade on blade, two musket stocks knocked together, a blow home on a body)
          const rec = r < 0.4 ? recorded(a, "clang", [[o, CLANG_MELEE]], t, [0.95, 1.15]) : r < 0.75 ? recorded(a, "parry", [[o, PARRY_REC]], t, [0.85, 1.15])
            : !!(window.__foley && window.__foley.blowRec && window.__foley.blowRec(null, far * BLOW_MELEE));
          if (rec) {} else if (r < 0.4) {
            // steel on steel: a hard tick and a short ring of a blade's partials
            b(0.03, 0.12, rnd(3000, 4500), 2500, 2);
            for (const f of [rnd(1900, 2600), rnd(3300, 4200), rnd(5200, 6400)]) { const os = a.createOscillator(), og = a.createGain(); os.frequency.value = f; og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.02, t + 0.002); og.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.12, 0.3)); os.connect(og); og.connect(o); os.start(t); os.stop(t + 0.32); }
          } else if (r < 0.75) b(rnd(0.05, 0.09), 0.14, rnd(500, 900), 300, 3);          // wood: a stock knocked aside, a parry with a musket
          else b(rnd(0.08, 0.14), 0.2, rnd(180, 260), 70, 1, "lowpass");                 // a body: a man knocked down, a butt-stroke home
        }
        setTimeout(knock, rnd(40, 160) / (0.15 + k));
      };
      setTimeout(knock, 60);
      return self;
    });
    const l = loops.melee; if (!l) return;
    const t = a.currentTime;
    l.fight = fight; l.run = run;
    l.g.gain.setTargetAtTime(1, t, 0.3);
    l.roar.gain.setTargetAtTime(0.0001 + 0.05 * Math.max(fight, run * 0.6), t, 0.6);
    l.feet.gain.setTargetAtTime(0.0001 + 0.09 * Math.max(run, fight * 0.4), t, 0.4);
  },
  // a brook: a bright babble over stones, louder as you come near (k, 0 to 1)
  brook(k) {
    const a = ctx(); if (!a) return;
    if (k <= 0.01) { loop("brook", false); return; }
    if (!loops.brook) loop("brook", true, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.connect(bus);
      const stop = [];
      { const b = bed(a, "brook", g, BROOK_REC); if (b) return { g, stop: [b.s] }; }
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
  // a wolf howling, far off across the winter woods (recorded; nothing till it's in)
  wolf(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 500); if (P.k <= 0.01) return;
    recorded(a, "wolf", [[P.node, 0.16 * P.k]], a.currentTime, [0.95, 1.04]);
  },
  // a trunk splitting in the hard frost, sharp as a shot (recorded; nothing till it's in)
  frostCrack(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 200); if (P.k <= 0.01) return;
    recorded(a, "frostCrack", [[P.node, 0.5 * P.k]], a.currentTime, [0.92, 1.06]);
  },
  // a tawny owl, somewhere off in the trees: a long hoo, a pause, and the quavering hoo-hoo-hoooo
  owl(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 120); if (P.k <= 0.01) return;
    if (recorded(a, "owl", [[P.node, 0.4 * P.k]], a.currentTime, [0.96, 1.04])) return;
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
    if (recorded(a, "woodpecker", [[P.node, 0.3 * P.k]], a.currentTime)) return;
    const t0 = a.currentTime, n = 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) { const t = t0 + i * (0.045 + i * 0.0012); burst(a, t, 0.02, 0.06 * P.k * (1 - i / n * 0.6), rnd(1300, 1600), 900, 4); }
  },
  // a frog in the pond: a low double croak, from where it sits (at: {x, z})
  frog(at) {
    const a = ctx(); if (!a) return;
    const P = placed(a, at, 50); if (P.k <= 0.01) return;
    if (recorded(a, "frog", [[P.node, 0.32 * P.k]], a.currentTime, [0.9, 1.12])) return;
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
    if (recorded(a, "duck", [[P.node, 0.3 * P.k]], a.currentTime)) return;
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
    // (recorded: the crack and roll of a strike close by, or only the grumble of one far off)
    if (recorded(a, d < 0.45 ? "thunderNear" : "thunderFar", [[bus, (d < 0.45 ? 0.95 : 1.15 - 0.7 * d)]], a.currentTime, [0.9, 1.05])) return;
    const t = a.currentTime, near = 1 - d;
    if (near > 0.6) burst(a, t, 0.35, 0.35 * near, 2400, 300, 0.7, "lowpass");
    // the roll: several overlapping rumbles, each lower and later
    for (let i = 0; i < 4 + Math.round(near * 3); i++) burst(a, t + 0.05 + i * rnd(0.25, 0.6), rnd(1.2, 2.6), (0.16 + near * 0.22) * (1 - i * 0.1), 260 + near * 300, 50, 0.6, "lowpass");
  },
  wind(on, vol = 1) {
    loop("wind", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.025 * vol, a.currentTime, 2); g.connect(bus);   // (half what it was: it drowned the woods)
      { const b = bed(a, "wind", g, WIND_REC); if (b) return { g, stop: [b.s] }; }
      const s = noiseSrc(a), f = a.createBiquadFilter(), lfo = a.createOscillator(), lg = a.createGain();
      s.playbackRate.value = 0.5;
      f.type = "bandpass"; f.frequency.value = 500; f.Q.value = 0.7; lfo.frequency.value = 0.07; lg.gain.value = 300;
      lfo.connect(lg); lg.connect(f.frequency); s.connect(f); f.connect(g); s.start(); lfo.start();
      return { g, stop: [s, lfo] };
    });
  },

  // ---- the kitchen ----
  // (each of the kitchen's sounds recorded too — art/sfx — and played in place of the made one once it's in)
  // fat in a hot pan: a bright hiss, and the crackle and spit of it, louder the hotter (k, 0 to 1)
  sizzle(on, k = 0.5) {
    const a = ctx(); if (!a) return;
    if (on && loops.sizzle) { loops.sizzle.g.gain.setTargetAtTime(0.05 + k * 0.09, a.currentTime, 0.2); loops.sizzle.k = k; return; }
    loop("sizzle", on, a => {
      const g = a.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05 + k * 0.09, a.currentTime, 0.3); g.connect(bus);
      { const b = bed(a, "sizzle", g, KITCHEN_REC.sizzle); if (b) return { g, stop: [b.s], k }; }
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
      { const b = bed(a, "bubble", g, KITCHEN_REC.bubble); if (b) return { g, stop: [b.s], k }; }
      const s = noiseSrc(a), lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380; s.playbackRate.value = 0.6;
      s.connect(lp); lp.connect(g); s.start();
      const self = { g, stop: [s], k };
      const pop = () => {
        if (loops.bubble !== self) return;
        const t = a.currentTime, o = a.createOscillator(), og = a.createGain(), f = rnd(180, 420);
        o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(2.2, 3.4), t + 0.06);
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05 * (0.4 + self.k), t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(og); og.connect(bus); lease(og, 8); o.start(t); o.stop(t + 0.1);
        setTimeout(pop, rnd(60, 380) / (0.4 + self.k));
      };
      setTimeout(pop, 100);
      return self;
    });
  },
  // a knife through meat onto the board: the cut, and the knock of the board under it
  knife() {
    const a = ctx(); if (!a) return;
    if (recorded(a, "knife", [[bus, KITCHEN_REC.knife]], a.currentTime)) return;
    const t = a.currentTime;
    burst(a, t, 0.05, 0.08, 2400, 900, 1.5);
    const o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(230, t + 0.02); o.frequency.exponentialRampToValueAtTime(120, t + 0.09);
    g.gain.setValueAtTime(0.0001, t + 0.02); g.gain.exponentialRampToValueAtTime(0.14, t + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(bus); lease(g, 8); o.start(t + 0.02); o.stop(t + 0.14);
  },
  // a wooden spoon round an iron pot: a scrape, and a knock against the side
  stir() {
    const a = ctx(); if (!a) return;
    if (recorded(a, "stir", [[bus, KITCHEN_REC.stir]], a.currentTime)) return;
    const t = a.currentTime;
    burst(a, t, 0.32, 0.05, 700, 1100, 3);
    burst(a, t + 0.35, 0.28, 0.04, 1000, 650, 3);
    const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.value = rnd(520, 640);
    // (silent from the moment it starts: a gain's own 1 till its first step was a full-scale blip before the knock)
    g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(0.0001, t + 0.62); g.gain.exponentialRampToValueAtTime(0.05, t + 0.625); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(bus); lease(g, 8); o.start(t + 0.6); o.stop(t + 0.95);
  },
  // the pan given a shake and what's in it turned: a rattle of iron, a whoosh, and the slap of it landing
  toss() {
    const a = ctx(); if (!a) return;
    if (recorded(a, "toss", [[bus, KITCHEN_REC.toss]], a.currentTime)) return;
    const t = a.currentTime;
    this.clang(0.18); this.whoosh(0.22, false);
    burst(a, t + 0.32, 0.06, 0.14, 900, 300, 1);
    if (loops.sizzle) burst(a, t + 0.34, 0.4, 0.08, 5000, 3000, 0.7, "highpass");
  },
  // a plate set down: a clean ceramic tick and its ring
  plate() {
    const a = ctx(); if (!a) return;
    if (recorded(a, "plate", [[bus, KITCHEN_REC.plate]], a.currentTime)) return;
    const t = a.currentTime;
    for (const [f, v, d] of [[2100, 0.06, 0.25], [3350, 0.04, 0.18], [5200, 0.025, 0.12]]) {
      const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.value = f * rnd(0.98, 1.02);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(bus); lease(g, 8); o.start(t); o.stop(t + d + 0.02);
    }
    burst(a, t, 0.03, 0.06, 4000, 2000, 1);
  },
  // two men at it with their fists: a dull thump, and the breath knocked out
  punch(at = null) {
    const a = ctx(); if (!a) return;
    if (window.__foley && window.__foley.blowRec && window.__foley.blowRec(at, 0.18)) return;
    const { node, k } = placed(a, at, 40); if (k < 0.02) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * k, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(node); o.start(t); o.stop(t + 0.18);
    const n = noiseSrc(a), f = a.createBiquadFilter(), ng = a.createGain(); f.type = "lowpass"; f.frequency.value = 900;
    ng.gain.setValueAtTime(0.2 * k, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(f); f.connect(ng); ng.connect(node); n.start(t, Math.random()); n.stop(t + 0.08);
  },

  // ---- music: real recordings (recorded.js) — a piece for the mood, a rest, another ----
  _mood: null,
  music(mood) {
    if (mood === this._mood) return;
    this._mood = mood;
    // (real recordings of the music of the time, played by people — nothing else)
    if (!RECORDED) RECORDED = createRecorded(() => ctx(), () => { ctx(); return musicBus; });
    RECORDED.play(mood);
  },
  // ---- the score: a recording, not the players — for a battle's opening and its highlights only (see replay.js) ----
  // (Purcell's In Nomine à 7, for viols, as Phillip W. Serna plays it — grave, as a field before a battle is: a real
  //  performance, where the Sarabande it replaces was a virtual-instrument arrangement. Credited with the music)
  async score(at = 0, { vol = 0.85, fade = 1.4 } = {}) {
    this.scoreOff(0.4);
    const a = ctx(), n = this._scoreN; if (!a) return null;
    try {
      if (!this._scoreBuf) { const r = await fetch(new URL("../art/music/innomine7.ogg", import.meta.url)); this._scoreBuf = await a.decodeAudioData(await r.arrayBuffer()); }
    } catch (e) { return null; }
    if (n !== this._scoreN) return null;   // (stopped, or another asked for, while it loaded)
    const s = a.createBufferSource(), g = a.createGain(), t = a.currentTime;
    s.buffer = this._scoreBuf; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + fade);
    s.connect(g); g.connect(musicBus); s.start(t, Math.max(0, Math.min(at, this._scoreBuf.duration - 1)));
    const h = this._score = { s, g, at, t0: t };
    s.onended = () => { if (this._score === h) this._score = null; };
    return h;
  },
  scoreOff(fade = 2) {
    const h = this._score; this._score = null; this._scoreN = (this._scoreN || 0) + 1;
    if (!h) return;
    const a = ctx(), t = a.currentTime;
    try { h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(Math.max(0.0001, h.g.gain.value), t); h.g.gain.exponentialRampToValueAtTime(0.0001, t + fade); h.s.stop(t + fade + 0.05); } catch (e) {}
  },
  // the field's own sounds turned down (a battle played behind the menus: heard as if from far off), or back up
  hush(k = 1) {
    const a = ctx(); if (!a) return;
    const fb = window.__foresterBus, t = a.currentTime;
    if (fb && this._fbBase == null) this._fbBase = fb.gain.value;
    for (const [node, base] of [[bus, 1], [fb, this._fbBase ?? 1]]) if (node) { node.gain.cancelScheduledValues(t); node.gain.setTargetAtTime(base * k, t, 0.25); }
  },
  get load() { return { live: liveSrc, pressure }; },
  get musicState() { const M = RECORDED; return M ? { mood: M.mood, playing: M.playing } : null; },
};


window.__audio = AUDIO;
